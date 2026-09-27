// GET    /news                -> list visible news (RLS: published, or own draft, or moderator)
// GET    /news/{newsIdOrSlug} -> fetch one (accepts a uuid id OR a slug)
// POST   /news                 -> create a draft (moderator/admin only, via RLS)
// PATCH  /news/{newsId}         -> update, including publishing (moderator/admin only; uuid id only)
// DELETE /news/{newsId}         -> delete (moderator/admin only; uuid id only)
//
// All authorization is RLS (identity.is_platform_moderator()) -- this is
// a thin PostgREST pass-through, same shape as the projects function.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, safeDbErrorMessage, withCors, } from '../_shared/http.ts';
import { buildCursorFilter, paginate, parsePagination, } from '../_shared/pagination.ts';
import { fetchAuthors, unknownAuthor, } from '../_shared/authors.ts';
import { publicUrlWithCacheBust, } from '../_shared/storage.ts';
import { CreateNewsSchema, UpdateNewsSchema, UuidSchema, } from './schemas.ts';

const SELECT_COLUMNS =
  'id, title, slug, body, summary, cover_image_path, author_id, status, published_at, created_at, updated_at';

function withCoverImageUrl<T extends { cover_image_path: string | null; updated_at?: string },>(
  supabase: ReturnType<typeof createUserClient>,
  row: T,
): Omit<T, 'cover_image_path'> & { cover_image_url: string | null } {
  const { cover_image_path, ...rest } = row;
  const cover_image_url = publicUrlWithCacheBust(
    supabase.storage,
    'news-covers',
    cover_image_path,
    rest.updated_at ?? null,
  );
  return { ...rest, cover_image_url, };
}

async function withAuthor(
  supabase: ReturnType<typeof createUserClient>,
  row: { author_id: string; [key: string]: unknown },
) {
  const authors = await fetchAuthors(supabase, [row.author_id,],);
  return { ...row, author: authors.get(row.author_id,) ?? unknownAuthor(row.author_id,), };
}

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const segments = url.pathname
    .replace(/^\/functions\/v1\/news\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  const supabase = createUserClient(req,);

  try {
    // GET /news
    if (segments.length === 0 && req.method === 'GET') {
      const page = parsePagination(url,);
      if ('error' in page) return page.error;

      let query = supabase.schema('content',).from('news',).select(SELECT_COLUMNS,);

      const statusParam = url.searchParams.get('status',);
      if (statusParam) {
        if (statusParam !== 'draft' && statusParam !== 'published') {
          return errorResponse('invalid_query', `"${statusParam}" is not a valid status.`, 400,);
        }
        query = query.eq('status', statusParam,);
      }
      if (page.cursor) query = query.or(buildCursorFilter(page.cursor, 'desc',),);

      const { data, error, } = await query
        .order('created_at', { ascending: false, },)
        .order('id', { ascending: false, },)
        .limit(page.limit + 1,);
      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);

      const paged = paginate(data ?? [], page.limit,);
      const authors = await fetchAuthors(supabase, paged.items.map((r,) => r.author_id),);
      return jsonResponse({
        items: paged.items.map((r,) => ({
          ...withCoverImageUrl(supabase, r,),
          author: authors.get(r.author_id,) ?? unknownAuthor(r.author_id,),
        })),
        next_cursor: paged.next_cursor,
      },);
    }

    // POST /news
    if (segments.length === 0 && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = CreateNewsSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('content',)
        .from('news',)
        .insert({ ...parsed.data, author_id: userData.user.id, },)
        .select(SELECT_COLUMNS,)
        .single();

      if (error) {
        const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      return jsonResponse(await withAuthor(supabase, withCoverImageUrl(supabase, data,),), 201,);
    }

    // GET /news/{newsIdOrSlug} -- either a uuid id or a slug. PATCH/DELETE
    // below stay uuid-only (moderators already have the id from their own
    // listing; slug support is specifically for public read, where
    // Website's article URLs are slug-based).
    if (segments.length === 1 && req.method === 'GET') {
      const identifier = segments[0];
      const asUuid = UuidSchema.safeParse(identifier,);

      let query = supabase.schema('content',).from('news',).select(SELECT_COLUMNS,);
      query = asUuid.success ? query.eq('id', asUuid.data,) : query.eq('slug', identifier,);

      const { data, error, } = await query.maybeSingle();
      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!data) return errorResponse('not_found', 'No news item with that id or slug.', 404,);

      return jsonResponse(await withAuthor(supabase, withCoverImageUrl(supabase, data,),),);
    }

    const newsIdParsed = segments.length === 1 ? UuidSchema.safeParse(segments[0],) : null;
    if (segments.length === 1 && (!newsIdParsed || !newsIdParsed.success)) {
      return errorResponse('invalid_news_id', `"${segments[0]}" is not a valid UUID.`, 400,);
    }

    // PATCH /news/{newsId}
    if (segments.length === 1 && req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}));
      const parsed = UpdateNewsSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const update: Record<string, unknown> = { ...parsed.data, };
      if (parsed.data.status === 'published') {
        update.published_at = new Date().toISOString();
      }

      const { data, error, } = await supabase
        .schema('content',)
        .from('news',)
        .update(update,)
        .eq('id', newsIdParsed!.data,)
        .select(SELECT_COLUMNS,)
        .maybeSingle();

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) {
        return errorResponse('not_found', 'No news item with that id (or not authorized).', 404,);
      }
      return jsonResponse(await withAuthor(supabase, withCoverImageUrl(supabase, data,),),);
    }

    // DELETE /news/{newsId}
    if (segments.length === 1 && req.method === 'DELETE') {
      const { error, count, } = await supabase
        .schema('content',)
        .from('news',)
        .delete({ count: 'exact', },)
        .eq('id', newsIdParsed!.data,);

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!count) {
        return errorResponse('not_found', 'No news item with that id (or not authorized).', 404,);
      }
      return new Response(null, { status: 204, },);
    }

    return errorResponse('not_found', 'Unknown news route.', 404,);
  } catch (_err) {
    return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
  }
},),);
