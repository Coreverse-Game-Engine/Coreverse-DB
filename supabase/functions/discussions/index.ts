// GET    /discussions                        -> list (optional ?category=)
// POST   /discussions                         -> start a discussion
// PATCH  /discussions/{discussionId}          -> update / lock / unlock
// DELETE /discussions/{discussionId}          -> delete
// GET    /discussions/{discussionId}/replies  -> list replies (tombstones included)
// POST   /discussions/{discussionId}/replies  -> reply (rejected if locked)
// PATCH  /discussions/replies/{replyId}       -> edit body, or soft-delete ({ deleted: true })

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, safeDbErrorMessage, withCors, } from '../_shared/http.ts';
import {
  CreateDiscussionSchema,
  CreateReplySchema,
  UpdateDiscussionSchema,
  UpdateReplySchema,
  UuidSchema,
} from './schemas.ts';

const DISCUSSION_COLUMNS =
  'id, title, body, author_id, category, is_locked, created_at, updated_at';
const REPLY_COLUMNS = 'id, discussion_id, author_id, body, deleted_at, created_at, updated_at';

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const segments = url.pathname
    .replace(/^\/functions\/v1\/discussions\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  const supabase = createUserClient(req,);

  try {
    // GET /discussions
    if (segments.length === 0 && req.method === 'GET') {
      let query = supabase.schema('content',).from('discussions',).select(DISCUSSION_COLUMNS,);

      const categoryParam = url.searchParams.get('category',);
      if (categoryParam) query = query.eq('category', categoryParam,);

      const { data, error, } = await query.order('created_at', { ascending: false, },);
      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(data,);
    }

    // POST /discussions
    if (segments.length === 0 && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = CreateDiscussionSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('content',)
        .from('discussions',)
        .insert({ ...parsed.data, author_id: userData.user.id, },)
        .select(DISCUSSION_COLUMNS,)
        .single();

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(data, 201,);
    }

    // PATCH /discussions/replies/{replyId} -- disambiguated first, since
    // "replies" here is a literal path segment, not a discussionId.
    if (segments.length === 2 && segments[0] === 'replies' && req.method === 'PATCH') {
      const replyIdParsed = UuidSchema.safeParse(segments[1],);
      if (!replyIdParsed.success) {
        return errorResponse('invalid_reply_id', `"${segments[1]}" is not a valid UUID.`, 400,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = UpdateReplySchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const update: Record<string, unknown> = {};
      if (parsed.data.body !== undefined) update.body = parsed.data.body;
      if (parsed.data.deleted) update.deleted_at = new Date().toISOString();

      const { data, error, } = await supabase
        .schema('content',)
        .from('discussion_replies',)
        .update(update,)
        .eq('id', replyIdParsed.data,)
        .select(REPLY_COLUMNS,)
        .maybeSingle();

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) {
        return errorResponse('not_found', 'No reply with that id (or not authorized).', 404,);
      }
      return jsonResponse(data,);
    }

    const discussionIdParsed = segments.length >= 1 ? UuidSchema.safeParse(segments[0],) : null;
    if (segments.length >= 1 && (!discussionIdParsed || !discussionIdParsed.success)) {
      return errorResponse('invalid_discussion_id', `"${segments[0]}" is not a valid UUID.`, 400,);
    }
    const discussionId = discussionIdParsed?.data;

    // PATCH /discussions/{discussionId}
    if (segments.length === 1 && req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}));
      const parsed = UpdateDiscussionSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('content',)
        .from('discussions',)
        .update(parsed.data,)
        .eq('id', discussionId,)
        .select(DISCUSSION_COLUMNS,)
        .maybeSingle();

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) {
        return errorResponse('not_found', 'No discussion with that id (or not authorized).', 404,);
      }
      return jsonResponse(data,);
    }

    // DELETE /discussions/{discussionId}
    if (segments.length === 1 && req.method === 'DELETE') {
      const { error, count, } = await supabase
        .schema('content',)
        .from('discussions',)
        .delete({ count: 'exact', },)
        .eq('id', discussionId,);

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!count) {
        return errorResponse('not_found', 'No discussion with that id (or not authorized).', 404,);
      }
      return new Response(null, { status: 204, },);
    }

    // GET /discussions/{discussionId}/replies
    if (segments.length === 2 && segments[1] === 'replies' && req.method === 'GET') {
      const { data, error, } = await supabase
        .schema('content',)
        .from('discussion_replies',)
        .select(REPLY_COLUMNS,)
        .eq('discussion_id', discussionId,)
        .order('created_at', { ascending: true, },);

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(data,);
    }

    // POST /discussions/{discussionId}/replies
    if (segments.length === 2 && segments[1] === 'replies' && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = CreateReplySchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('content',)
        .from('discussion_replies',)
        .insert({
          discussion_id: discussionId,
          author_id: userData.user.id,
          body: parsed.data.body,
        },)
        .select(REPLY_COLUMNS,)
        .single();

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      return jsonResponse(data, 201,);
    }

    return errorResponse('not_found', 'Unknown discussions route.', 404,);
  } catch (_err) {
    return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
  }
},),);
