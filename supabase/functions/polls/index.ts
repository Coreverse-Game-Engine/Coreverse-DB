// GET  /polls                    -> list polls with nested options (PostgREST FK embedding)
// POST /polls                    -> create a poll + its options atomically (moderator/admin only)
// POST /polls/{pollId}/vote      -> cast a vote (one per user; rejected if closed)
// GET  /polls/{pollId}/results   -> aggregated, anonymous vote counts

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, safeDbErrorMessage, withCors, } from '../_shared/http.ts';
import { CastVoteSchema, CreatePollSchema, UuidSchema, } from './schemas.ts';

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const segments = url.pathname
    .replace(/^\/functions\/v1\/polls\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  const supabase = createUserClient(req,);

  try {
    // GET /polls
    if (segments.length === 0 && req.method === 'GET') {
      const { data, error, } = await supabase
        .schema('content',)
        .from('polls',)
        .select(
          'id, question, closes_at, created_at, options:poll_options(id, label, display_order)',
        )
        .order('created_at', { ascending: false, },);

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(data,);
    }

    // POST /polls
    if (segments.length === 0 && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const parsed = CreatePollSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data: pollId, error, } = await supabase
        .schema('content',)
        .rpc('create_poll_with_options', {
          p_question: parsed.data.question,
          p_options: parsed.data.options,
          p_closes_at: parsed.data.closes_at ?? null,
        },);

      if (error) {
        const status = error.code === '42501' ? 403 : 500;
        return errorResponse('rpc_error', safeDbErrorMessage(status,), status,);
      }

      // create_poll_with_options only returns the new id (SECURITY
      // DEFINER, kept minimal) -- fetch the full row so the response
      // actually matches openapi/schemas/Poll.yaml, same select shape as
      // GET /polls.
      const { data: poll, error: readError, } = await supabase
        .schema('content',)
        .from('polls',)
        .select(
          'id, question, closes_at, created_at, options:poll_options(id, label, display_order)',
        )
        .eq('id', pollId,)
        .single();

      if (readError) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(poll, 201,);
    }

    const pollIdParsed = segments.length >= 1 ? UuidSchema.safeParse(segments[0],) : null;
    if (segments.length >= 1 && (!pollIdParsed || !pollIdParsed.success)) {
      return errorResponse('invalid_poll_id', `"${segments[0]}" is not a valid UUID.`, 400,);
    }
    const pollId = pollIdParsed?.data;

    // POST /polls/{pollId}/vote
    if (segments.length === 2 && segments[1] === 'vote' && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = CastVoteSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      // The RLS with-check on poll_votes (poll_votes_self_insert) folds
      // "poll doesn't exist" and "poll is closed" into the same
      // `exists (select ... from polls where id = poll_id and (closes_at
      // is null or closes_at > now()))` predicate -- both fail the same
      // way (42501), so the insert's error code alone can't tell them
      // apart, and a nonexistent poll_id was falling through to a
      // generic 500. Look the poll up first so each case gets its own
      // code; the insert below still has to re-check via RLS for the
      // already-closed-in-the-meantime race, since this read and the
      // write aren't atomic.
      const { data: pollRow, error: pollLookupError, } = await supabase
        .schema('content',)
        .from('polls',)
        .select('id, closes_at',)
        .eq('id', pollId,)
        .maybeSingle();
      if (pollLookupError) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!pollRow) return errorResponse('poll_not_found', 'No poll with that id.', 404,);
      if (pollRow.closes_at && new Date(pollRow.closes_at,) <= new Date()) {
        return errorResponse('poll_closed', 'This poll is closed to new votes.', 409,);
      }

      const { error, } = await supabase
        .schema('content',)
        .from('poll_votes',)
        .insert({ poll_id: pollId, option_id: parsed.data.option_id, user_id: userData.user.id, },);

      if (error) {
        if (error.code === '23505') {
          return errorResponse('already_voted', 'You have already voted on this poll.', 409,);
        }
        if (error.code === '42501') {
          // Poll closed between the check above and this insert.
          return errorResponse('poll_closed', 'This poll is closed to new votes.', 409,);
        }
        return errorResponse('vote_rejected', safeDbErrorMessage(500,), 500,);
      }
      return jsonResponse({ ok: true, }, 201,);
    }

    // GET /polls/{pollId}/results
    if (segments.length === 2 && segments[1] === 'results' && req.method === 'GET') {
      const { data, error, } = await supabase
        .schema('content',)
        .rpc('poll_results', { p_poll_id: pollId, },);

      if (error) return errorResponse('rpc_error', safeDbErrorMessage(500,), 500,);
      return jsonResponse(data,);
    }

    return errorResponse('not_found', 'Unknown polls route.', 404,);
  } catch (_err) {
    return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
  }
},),);
