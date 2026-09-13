// GET  /polls                    -> list polls with nested options (PostgREST FK embedding)
// POST /polls                    -> create a poll + its options atomically (moderator/admin only)
// POST /polls/{pollId}/vote      -> cast a vote (one per user; rejected if closed)
// GET  /polls/{pollId}/results   -> aggregated, anonymous vote counts

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, withCors, } from '../_shared/http.ts';
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

      if (error) return errorResponse('query_error', error.message, 500,);
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
        return errorResponse('rpc_error', error.message, status,);
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

      if (readError) return errorResponse('query_error', readError.message, 500,);
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

      const { error, } = await supabase
        .schema('content',)
        .from('poll_votes',)
        .insert({ poll_id: pollId, option_id: parsed.data.option_id, user_id: userData.user.id, },);

      if (error) {
        // 23505 = already voted (PK violation); 42501 = poll closed (RLS with-check failed)
        const status = error.code === '23505' || error.code === '42501' ? 409 : 500;
        return errorResponse('vote_rejected', error.message, status,);
      }
      return jsonResponse({ ok: true, }, 201,);
    }

    // GET /polls/{pollId}/results
    if (segments.length === 2 && segments[1] === 'results' && req.method === 'GET') {
      const { data, error, } = await supabase
        .schema('content',)
        .rpc('poll_results', { p_poll_id: pollId, },);

      if (error) return errorResponse('rpc_error', error.message, 500,);
      return jsonResponse(data,);
    }

    return errorResponse('not_found', 'Unknown polls route.', 404,);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
}),);
