// GET    /news              -> list visible news (RLS: published, or own draft, or moderator)
// POST   /news               -> create a draft (moderator/admin only, via RLS)
// PATCH  /news/{newsId}       -> update, including publishing (moderator/admin only)
// DELETE /news/{newsId}       -> delete (moderator/admin only)
//
// All authorization is RLS (identity.is_platform_moderator()) -- this is
// a thin PostgREST pass-through, same shape as the projects function.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, withCors, } from '../_shared/http.ts';
import { CreateNewsSchema, UpdateNewsSchema, UuidSchema, } from './schemas.ts';

const SELECT_COLUMNS =
  'id, title, slug, body, author_id, status, published_at, created_at, updated_at';

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
      let query = supabase.schema('content',).from('news',).select(SELECT_COLUMNS,);

      const statusParam = url.searchParams.get('status',);
      if (statusParam) {
        if (statusParam !== 'draft' && statusParam !== 'published') {
          return errorResponse('invalid_query', `"${statusParam}" is not a valid status.`, 400,);
        }
        query = query.eq('status', statusParam,);
      }

      const { data, error, } = await query.order('created_at', { ascending: false, },);
      if (error) return errorResponse('query_error', error.message, 500,);
      return jsonResponse(data,);
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
        return errorResponse('query_error', error.message, status,);
      }
      return jsonResponse(data, 201,);
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
        return errorResponse('query_error', error.message, status,);
      }
      if (!data) {
        return errorResponse('not_found', 'No news item with that id (or not authorized).', 404,);
      }
      return jsonResponse(data,);
    }

    // DELETE /news/{newsId}
    if (segments.length === 1 && req.method === 'DELETE') {
      const { error, count, } = await supabase
        .schema('content',)
        .from('news',)
        .delete({ count: 'exact', },)
        .eq('id', newsIdParsed!.data,);

      if (error) return errorResponse('query_error', error.message, 500,);
      if (!count) {
        return errorResponse('not_found', 'No news item with that id (or not authorized).', 404,);
      }
      return new Response(null, { status: 204, },);
    }

    return errorResponse('not_found', 'Unknown news route.', 404,);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
},),);
