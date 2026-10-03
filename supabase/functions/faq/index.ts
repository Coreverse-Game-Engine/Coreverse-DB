// GET    /faq                              -> list FAQ entries in one locale (public)
// POST   /faq                              -> create an item + its translations (moderator/admin only)
// GET    /faq/{faqId}                      -> fetch one item, across every locale it has (public)
// PATCH  /faq/{faqId}                      -> update category/display_order (moderator/admin only)
// DELETE /faq/{faqId}                      -> delete an item + all its translations (moderator/admin only)
// PUT    /faq/{faqId}/translations/{locale} -> create/replace one locale's translation (moderator/admin only)
// DELETE /faq/{faqId}/translations/{locale} -> remove one locale's translation (moderator/admin only)
//
// Unlike news/events, most authorization here is still RLS, but item
// creation goes through content.create_faq_item_with_translations()
// (an RPC, not a plain insert) because a faq_item is meaningless
// without at least one translation and PostgREST can't do that
// multi-table insert atomically in one call -- same reasoning as
// polls/create_poll_with_options.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, safeDbErrorMessage, withCors, } from '../_shared/http.ts';
import {
  CreateFaqItemSchema,
  LocaleSchema,
  UpdateFaqItemSchema,
  UpsertTranslationSchema,
  UuidSchema,
} from './schemas.ts';

interface FaqTranslationRow {
  locale: string;
  question: string;
  answer: string;
}

interface FaqItemDetail {
  id: string;
  category: string | null;
  display_order: number;
  translations: Record<string, { question: string; answer: string }>;
  created_at: string;
  updated_at: string;
}

// Fetches one item with every locale it currently has a translation
// for -- used by GET /faq/{faqId} and as the response shape for every
// write endpoint below, so a client editing a FAQ item always sees the
// full, current translation set rather than just the locale it wrote.
async function fetchFaqItemDetail(
  supabase: ReturnType<typeof createUserClient>,
  id: string,
): Promise<FaqItemDetail | null> {
  const { data, error, } = await supabase
    .schema('content',)
    .from('faq_items',)
    .select(
      'id, category, display_order, created_at, updated_at, faq_translations(locale, question, answer)',
    )
    .eq('id', id,)
    .maybeSingle();

  if (error || !data) return null;

  const { faq_translations, ...rest } = data as typeof data & {
    faq_translations: FaqTranslationRow[];
  };
  const translations: FaqItemDetail['translations'] = {};
  for (const t of faq_translations ?? []) {
    translations[t.locale] = { question: t.question, answer: t.answer, };
  }
  return { ...rest, translations, };
}

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const segments = url.pathname
    .replace(/^\/functions\/v1\/faq\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  const supabase = createUserClient(req,);

  try {
    // GET /faq
    if (segments.length === 0 && req.method === 'GET') {
      const localeParam = url.searchParams.get('locale',) ?? 'en';
      const localeParsed = LocaleSchema.safeParse(localeParam,);
      if (!localeParsed.success) {
        return errorResponse('invalid_query', `"${localeParam}" is not a supported locale.`, 400,);
      }

      let query = supabase
        .schema('content',)
        .from('faq_items',)
        .select('id, category, display_order, faq_translations!inner(question, answer, locale)',)
        .eq('faq_translations.locale', localeParsed.data,);

      const categoryParam = url.searchParams.get('category',);
      if (categoryParam) query = query.eq('category', categoryParam,);

      const { data, error, } = await query
        .order('category', { ascending: true, nullsFirst: false, },)
        .order('display_order', { ascending: true, },);
      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);

      const items = (data ?? []).map((row,) => {
        const embedded = row.faq_translations as unknown as FaqTranslationRow[] | FaqTranslationRow;
        const translation = Array.isArray(embedded,) ? embedded[0] : embedded;
        return {
          id: row.id,
          category: row.category,
          display_order: row.display_order,
          locale: localeParsed.data,
          question: translation?.question ?? '',
          answer: translation?.answer ?? '',
        };
      },);
      return jsonResponse(items,);
    }

    // POST /faq
    if (segments.length === 0 && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = CreateFaqItemSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data: newId, error, } = await supabase
        .schema('content',)
        .rpc('create_faq_item_with_translations', {
          p_category: parsed.data.category ?? null,
          p_display_order: parsed.data.display_order ?? 0,
          p_translations: parsed.data.translations,
        },);

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }

      const detail = await fetchFaqItemDetail(supabase, newId as string,);
      if (!detail) return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(detail, 201,);
    }

    // PUT/DELETE /faq/{faqId}/translations/{locale}
    if (segments.length === 3 && segments[1] === 'translations') {
      const faqIdParsed = UuidSchema.safeParse(segments[0],);
      if (!faqIdParsed.success) {
        return errorResponse('invalid_faq_id', `"${segments[0]}" is not a valid UUID.`, 400,);
      }
      const localeParsed = LocaleSchema.safeParse(segments[2],);
      if (!localeParsed.success) {
        return errorResponse('invalid_locale', `"${segments[2]}" is not a supported locale.`, 400,);
      }

      if (req.method === 'PUT') {
        const body = await req.json().catch(() => ({}));
        const parsed = UpsertTranslationSchema.safeParse(body,);
        if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

        const { error, } = await supabase
          .schema('content',)
          .from('faq_translations',)
          .upsert(
            {
              faq_item_id: faqIdParsed.data,
              locale: localeParsed.data,
              question: parsed.data.question,
              answer: parsed.data.answer,
            },
            { onConflict: 'faq_item_id,locale', },
          );

        if (error) {
          // 23503: no faq_items row with this id -- surfaces as a 404,
          // not a generic write failure, since that's what the caller
          // actually needs to fix.
          const status = error.code === '42501' ? 403 : error.code === '23503' ? 404 : 500;
          return errorResponse('query_error', safeDbErrorMessage(status,), status,);
        }

        const detail = await fetchFaqItemDetail(supabase, faqIdParsed.data,);
        if (!detail) return errorResponse('not_found', 'No FAQ item with that id.', 404,);
        return jsonResponse(detail,);
      }

      if (req.method === 'DELETE') {
        const { error, count, } = await supabase
          .schema('content',)
          .from('faq_translations',)
          .delete({ count: 'exact', },)
          .eq('faq_item_id', faqIdParsed.data,)
          .eq('locale', localeParsed.data,);

        if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
        if (!count) {
          return errorResponse(
            'not_found',
            'No FAQ item with that id, or it has no translation in that locale.',
            404,
          );
        }
        return new Response(null, { status: 204, },);
      }
    }

    // Resolved once into a plain `string | undefined` -- not the raw
    // safeParse union -- because the compound guard below
    // (`segments.length === 1 && (!x || !x.success)`) is too complex
    // an expression for TypeScript to narrow `faqIdParsed.success`
    // through afterwards; `faqIdParsed!.data` on the un-narrowed union
    // type checks as `string | undefined`, not `string`, which fails
    // against fetchFaqItemDetail's `id: string` parameter. `faqId!`
    // below is a plain non-null assertion on an already-optional
    // string, which is unambiguous.
    const faqIdParsed = segments.length === 1 ? UuidSchema.safeParse(segments[0],) : null;
    if (segments.length === 1 && (!faqIdParsed || !faqIdParsed.success)) {
      return errorResponse('invalid_faq_id', `"${segments[0]}" is not a valid UUID.`, 400,);
    }
    const faqId: string | undefined = faqIdParsed?.success ? faqIdParsed.data : undefined;

    // GET /faq/{faqId}
    if (segments.length === 1 && req.method === 'GET') {
      const detail = await fetchFaqItemDetail(supabase, faqId!,);
      if (!detail) return errorResponse('not_found', 'No FAQ item with that id.', 404,);
      return jsonResponse(detail,);
    }

    // PATCH /faq/{faqId}
    if (segments.length === 1 && req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}));
      const parsed = UpdateFaqItemSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { error, data, } = await supabase
        .schema('content',)
        .from('faq_items',)
        .update(parsed.data,)
        .eq('id', faqId!,)
        .select('id',)
        .maybeSingle();

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) return errorResponse('not_found', 'No FAQ item with that id.', 404,);

      const detail = await fetchFaqItemDetail(supabase, faqId!,);
      if (!detail) return errorResponse('not_found', 'No FAQ item with that id.', 404,);
      return jsonResponse(detail,);
    }

    // DELETE /faq/{faqId}
    if (segments.length === 1 && req.method === 'DELETE') {
      const { error, count, } = await supabase
        .schema('content',)
        .from('faq_items',)
        .delete({ count: 'exact', },)
        .eq('id', faqId!,);

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!count) return errorResponse('not_found', 'No FAQ item with that id.', 404,);
      return new Response(null, { status: 204, },);
    }

    return errorResponse('not_found', 'Unknown faq route.', 404,);
  } catch (_err) {
    return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
  }
},),);
