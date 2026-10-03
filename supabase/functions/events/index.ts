// GET    /events                 -> list visible events (RLS: published, or own draft, or moderator)
// GET    /events/{eventIdOrSlug} -> fetch one (accepts a uuid id OR a slug)
// POST   /events                 -> create a draft (moderator/admin only, via RLS)
// PATCH  /events/{eventId}       -> update, including publishing (moderator/admin only; uuid id only)
// DELETE /events/{eventId}       -> delete (moderator/admin only; uuid id only)
//
// Same shape as the news function: thin PostgREST pass-through, all
// authorization is RLS (identity.is_platform_moderator()). See
// news/index.ts and the Phase 4 migration for why this is modeled on
// news rather than on discussions.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, safeDbErrorMessage, withCors, } from '../_shared/http.ts';
import { buildCursorFilter, paginate, parsePagination, } from '../_shared/pagination.ts';
import { fetchAuthors, unknownAuthor, } from '../_shared/authors.ts';
import { CreateEventSchema, UpdateEventSchema, UuidSchema, } from './schemas.ts';

const SELECT_COLUMNS =
  'id, title, slug, description, location, starts_at, ends_at, registration_url, author_id, status, published_at, created_at, updated_at';

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
    .replace(/^\/functions\/v1\/events\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  const supabase = createUserClient(req,);

  try {
    // GET /events
    if (segments.length === 0 && req.method === 'GET') {
      const page = parsePagination(url,);
      if ('error' in page) return page.error;

      let query = supabase.schema('content',).from('events',).select(SELECT_COLUMNS,);

      const statusParam = url.searchParams.get('status',);
      if (statusParam) {
        if (statusParam !== 'draft' && statusParam !== 'published') {
          return errorResponse('invalid_query', `"${statusParam}" is not a valid status.`, 400,);
        }
        query = query.eq('status', statusParam,);
      }

      const upcomingParam = url.searchParams.get('upcoming',);
      if (upcomingParam !== null) {
        if (upcomingParam !== 'true' && upcomingParam !== 'false') {
          return errorResponse('invalid_query', 'upcoming must be "true" or "false".', 400,);
        }
        if (upcomingParam === 'true') {
          query = query.gte('starts_at', new Date().toISOString(),);
        }
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
          ...r,
          author: authors.get(r.author_id,) ?? unknownAuthor(r.author_id,),
        })),
        next_cursor: paged.next_cursor,
      },);
    }

    // POST /events
    if (segments.length === 0 && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = CreateEventSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('content',)
        .from('events',)
        .insert({ ...parsed.data, author_id: userData.user.id, },)
        .select(SELECT_COLUMNS,)
        .single();

      if (error) {
        const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      return jsonResponse(await withAuthor(supabase, data,), 201,);
    }

    // GET /events/{eventIdOrSlug} -- either a uuid id or a slug, same
    // reasoning as news: PATCH/DELETE below stay uuid-only.
    if (segments.length === 1 && req.method === 'GET') {
      const identifier = segments[0];
      const asUuid = UuidSchema.safeParse(identifier,);

      let query = supabase.schema('content',).from('events',).select(SELECT_COLUMNS,);
      query = asUuid.success ? query.eq('id', asUuid.data,) : query.eq('slug', identifier,);

      const { data, error, } = await query.maybeSingle();
      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!data) return errorResponse('not_found', 'No event with that id or slug.', 404,);

      return jsonResponse(await withAuthor(supabase, data,),);
    }

    const eventIdParsed = segments.length === 1 ? UuidSchema.safeParse(segments[0],) : null;
    if (segments.length === 1 && (!eventIdParsed || !eventIdParsed.success)) {
      return errorResponse('invalid_event_id', `"${segments[0]}" is not a valid UUID.`, 400,);
    }

    // PATCH /events/{eventId}
    if (segments.length === 1 && req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}));
      const parsed = UpdateEventSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const update: Record<string, unknown> = { ...parsed.data, };
      if (parsed.data.status === 'published') {
        update.published_at = new Date().toISOString();
      }

      const { data, error, } = await supabase
        .schema('content',)
        .from('events',)
        .update(update,)
        .eq('id', eventIdParsed!.data,)
        .select(SELECT_COLUMNS,)
        .maybeSingle();

      if (error) {
        const status = error.code === '42501' ? 403 : error.code === '23514' ? 400 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) {
        return errorResponse('not_found', 'No event with that id (or not authorized).', 404,);
      }
      return jsonResponse(await withAuthor(supabase, data,),);
    }

    // DELETE /events/{eventId}
    if (segments.length === 1 && req.method === 'DELETE') {
      const { error, count, } = await supabase
        .schema('content',)
        .from('events',)
        .delete({ count: 'exact', },)
        .eq('id', eventIdParsed!.data,);

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!count) {
        return errorResponse('not_found', 'No event with that id (or not authorized).', 404,);
      }
      return new Response(null, { status: 204, },);
    }

    return errorResponse('not_found', 'Unknown events route.', 404,);
  } catch (_err) {
    return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
  }
},),);
