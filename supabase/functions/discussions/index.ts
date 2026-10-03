// GET    /discussions                                    -> list (?category=, ?q=, ?sort=recent|active|replies)
// POST   /discussions                                     -> start a discussion
// GET    /discussions/categories                          -> distinct categories + counts
// GET    /discussions/{discussionId}                      -> fetch one (full body)
// PATCH  /discussions/{discussionId}                      -> update / lock / unlock
// DELETE /discussions/{discussionId}                      -> delete
// GET    /discussions/{discussionId}/replies              -> list replies (tombstones included)
// POST   /discussions/{discussionId}/replies              -> reply (rejected if locked)
// PATCH  /discussions/{discussionId}/replies/{replyId}    -> edit body, or soft-delete ({ deleted: true })
//
// NOTE on GET /discussions/categories vs GET /discussions/{discussionId}:
// both are 1 segment under /discussions/, one literal ('categories') and
// one a uuid-formatted variable. The 'categories' literal is checked
// explicitly, before any UUID parsing is attempted, so there's no
// runtime ambiguity -- a discussionId can never actually BE the string
// "categories". This is the same shape of overlap the pre-Phase-1 replies
// route had, but unlike that case there's no clean restructuring
// available without an awkward URL, so this one is intentionally left
// as a static-literal-vs-dynamic-param sibling (a very standard REST
// pattern -- e.g. GitHub's /repos/{owner} vs its various static
// sub-paths). If `redocly lint` flags this under no-ambiguous-paths,
// that's expected; it wasn't run against this specific addition before
// shipping. Options if it does: add a targeted redocly ignore-file
// entry for this one pair (preferred -- the rule is otherwise useful,
// as the replies bug showed), or move this to a differently-shaped
// path like /discussions/meta/categories to sidestep it structurally.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, safeDbErrorMessage, withCors, } from '../_shared/http.ts';
import {
  buildCursorFilter,
  encodeCursor,
  paginate,
  parsePagination,
} from '../_shared/pagination.ts';
import { fetchAuthors, unknownAuthor, } from '../_shared/authors.ts';
import { hitRateLimit, } from '../_shared/rate-limit.ts';
import {
  CreateDiscussionSchema,
  CreateReplySchema,
  type DiscussionSort,
  normalizeCategory,
  SORT_VALUES,
  UpdateDiscussionSchema,
  UpdateReplySchema,
  UuidSchema,
} from './schemas.ts';

const DISCUSSION_COLUMNS =
  'id, title, body, author_id, category, is_locked, reply_count, last_activity_at, created_at, updated_at';
const REPLY_COLUMNS =
  'id, discussion_id, author_id, body, deleted_at, edited_at, created_at, updated_at';

const EXCERPT_LENGTH = 280;
// One create + one reply per user per window -- generous enough for
// genuine use, tight enough to blunt a scripted flood. These are a
// starting point, not a load-tested figure; adjust once there's real
// traffic to look at.
const CREATE_DISCUSSION_LIMIT = { maxHits: 10, windowSeconds: 60 * 60, };
const CREATE_REPLY_LIMIT = { maxHits: 30, windowSeconds: 60 * 60, };

function toExcerpt(body: string,): string {
  if (body.length <= EXCERPT_LENGTH) return body;
  // Trim at the last space before the limit so we don't cut mid-word;
  // fall back to a hard cut if there's no space (e.g. one long token).
  const slice = body.slice(0, EXCERPT_LENGTH,);
  const lastSpace = slice.lastIndexOf(' ',);
  return `${lastSpace > 0 ? slice.slice(0, lastSpace,) : slice}…`;
}

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
      const page = parsePagination(url,);
      if ('error' in page) return page.error;

      const sortParam = (url.searchParams.get('sort',) ?? 'recent') as DiscussionSort;
      if (!SORT_VALUES.includes(sortParam,)) {
        return errorResponse(
          'invalid_query',
          `sort must be one of: ${SORT_VALUES.join(', ',)}.`,
          400,
        );
      }
      // Cursor pagination is keyset on (created_at, id) -- see
      // pagination.ts. That only resumes correctly for the 'recent'
      // sort, which orders by those same columns; 'active' and
      // 'replies' order by different columns entirely, so a cursor
      // built from one sort silently produces wrong results under
      // another. Rather than that, reject the combination outright:
      // 'active'/'replies' are single-page-only for now (next_cursor
      // is always null under them), which is an honest limitation, not
      // a silent bug.
      if (sortParam !== 'recent' && page.cursor) {
        return errorResponse(
          'invalid_query',
          `cursor is only supported with sort=recent (or the default). ` +
            `sort=${sortParam} always returns a single page.`,
          400,
        );
      }

      let query = supabase.schema('content',).from('discussions',).select(DISCUSSION_COLUMNS,);

      const categoryParam = url.searchParams.get('category',);
      if (categoryParam) query = query.eq('category', normalizeCategory(categoryParam,),);

      const qParam = url.searchParams.get('q',);
      if (qParam) {
        query = query.textSearch('search_vector', qParam, { type: 'plain', config: 'simple', },);
      }

      if (sortParam === 'recent') {
        if (page.cursor) query = query.or(buildCursorFilter(page.cursor, 'desc',),);
        query = query
          .order('created_at', { ascending: false, },)
          .order('id', { ascending: false, },)
          .limit(page.limit + 1,); // +1: see paginate()'s doc comment.
      } else if (sortParam === 'active') {
        query = query.order('last_activity_at', { ascending: false, },).order('id', {
          ascending: false,
        },)
          .limit(page.limit,);
      } else {
        query = query.order('reply_count', { ascending: false, },).order('id', {
          ascending: false,
        },)
          .limit(page.limit,);
      }

      const { data, error, } = await query;
      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);

      const rows = data ?? [];
      // For sort=recent, rows may hold limit+1 (the extra probe row --
      // see pagination.ts); drop it here once we know whether there's
      // a next page, same logic paginate() encapsulates for the
      // simpler bare-row case.
      const hasMore = sortParam === 'recent' && rows.length > page.limit;
      const pageRows = hasMore ? rows.slice(0, page.limit,) : rows;

      const authors = await fetchAuthors(supabase, pageRows.map((r,) => r.author_id),);
      const items = pageRows.map(({ body, ...rest },) => ({
        ...rest,
        excerpt: toExcerpt(body,),
        author: authors.get(rest.author_id,) ?? unknownAuthor(rest.author_id,),
      }));

      const last = pageRows[pageRows.length - 1];
      const next_cursor = hasMore && last ? encodeCursor(last.created_at, last.id,) : null;
      return jsonResponse({ items, next_cursor, },);
    }

    // POST /discussions
    if (segments.length === 0 && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const rateOk = await hitRateLimit(
        `discussions:create:${userData.user.id}`,
        CREATE_DISCUSSION_LIMIT,
      );
      if (!rateOk) {
        return errorResponse(
          'rate_limited',
          'Too many discussions created recently. Try again later.',
          429,
          { 'Retry-After': String(CREATE_DISCUSSION_LIMIT.windowSeconds,), },
        );
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
      const authors = await fetchAuthors(supabase, [data.author_id,],);
      return jsonResponse(
        { ...data, author: authors.get(data.author_id,) ?? unknownAuthor(data.author_id,), },
        201,
      );
    }

    // GET /discussions/categories -- see the top-of-file note on why
    // this literal is checked before any UUID parsing.
    if (segments.length === 1 && segments[0] === 'categories' && req.method === 'GET') {
      const { data, error, } = await supabase.schema('content',).rpc('discussion_categories',);
      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(data ?? [],);
    }

    const discussionIdParsed = segments.length >= 1 ? UuidSchema.safeParse(segments[0],) : null;
    if (segments.length >= 1 && (!discussionIdParsed || !discussionIdParsed.success)) {
      return errorResponse('invalid_discussion_id', `"${segments[0]}" is not a valid UUID.`, 400,);
    }
    const discussionId = discussionIdParsed?.data;

    // GET /discussions/{discussionId}
    if (segments.length === 1 && req.method === 'GET') {
      const { data, error, } = await supabase
        .schema('content',)
        .from('discussions',)
        .select(DISCUSSION_COLUMNS,)
        .eq('id', discussionId,)
        .maybeSingle();

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!data) return errorResponse('not_found', 'No discussion with that id.', 404,);

      const authors = await fetchAuthors(supabase, [data.author_id,],);
      return jsonResponse(
        { ...data, author: authors.get(data.author_id,) ?? unknownAuthor(data.author_id,), },
      );
    }

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
      const authors = await fetchAuthors(supabase, [data.author_id,],);
      return jsonResponse(
        { ...data, author: authors.get(data.author_id,) ?? unknownAuthor(data.author_id,), },
      );
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
      const page = parsePagination(url,);
      if ('error' in page) return page.error;

      let query = supabase
        .schema('content',)
        .from('discussion_replies',)
        .select(REPLY_COLUMNS,)
        .eq('discussion_id', discussionId,);
      if (page.cursor) query = query.or(buildCursorFilter(page.cursor, 'asc',),);

      const { data, error, } = await query
        .order('created_at', { ascending: true, },)
        .order('id', { ascending: true, },)
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

    // POST /discussions/{discussionId}/replies
    if (segments.length === 2 && segments[1] === 'replies' && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const rateOk = await hitRateLimit(
        `discussions:reply:${userData.user.id}`,
        CREATE_REPLY_LIMIT,
      );
      if (!rateOk) {
        return errorResponse(
          'rate_limited',
          'Too many replies posted recently. Try again later.',
          429,
          { 'Retry-After': String(CREATE_REPLY_LIMIT.windowSeconds,), },
        );
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
      const authors = await fetchAuthors(supabase, [data.author_id,],);
      return jsonResponse(
        { ...data, author: authors.get(data.author_id,) ?? unknownAuthor(data.author_id,), },
        201,
      );
    }

    // PATCH /discussions/{discussionId}/replies/{replyId}
    if (segments.length === 3 && segments[1] === 'replies' && req.method === 'PATCH') {
      const replyIdParsed = UuidSchema.safeParse(segments[2],);
      if (!replyIdParsed.success) {
        return errorResponse('invalid_reply_id', `"${segments[2]}" is not a valid UUID.`, 400,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = UpdateReplySchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const update: Record<string, unknown> = {};
      // edited_at is set here, deliberately not by a DB trigger: it
      // should reflect a genuine content edit, not "any update"
      // (updated_at, touched by the existing set_updated_at trigger,
      // already covers that broader case -- including soft-deletes,
      // which should NOT count as an edit for this field).
      if (parsed.data.body !== undefined) {
        update.body = parsed.data.body;
        update.edited_at = new Date().toISOString();
      }
      if (parsed.data.deleted) update.deleted_at = new Date().toISOString();

      const { data, error, } = await supabase
        .schema('content',)
        .from('discussion_replies',)
        .update(update,)
        .eq('id', replyIdParsed.data,)
        // Scoping to discussion_id too (not just id) means a
        // discussionId/replyId pair that don't actually belong together
        // 404s instead of silently succeeding -- the URL now claims a
        // relationship it's worth actually enforcing.
        .eq('discussion_id', discussionId,)
        .select(REPLY_COLUMNS,)
        .maybeSingle();

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) {
        return errorResponse(
          'not_found',
          'No reply with that id in this discussion (or not authorized).',
          404,
        );
      }
      const authors = await fetchAuthors(supabase, [data.author_id,],);
      return jsonResponse(
        { ...data, author: authors.get(data.author_id,) ?? unknownAuthor(data.author_id,), },
      );
    }

    return errorResponse('not_found', 'Unknown discussions route.', 404,);
  } catch (_err) {
    return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
  }
},),);
