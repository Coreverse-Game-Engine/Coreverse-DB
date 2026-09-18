// POST /requests/{requestId}/accept
// POST /requests/{requestId}/reject
// POST /requests/{requestId}/cancel
//
// The request's `type` (join_request | invite | ownership_transfer)
// determines which Postgres function actually handles accept/reject --
// this handler looks it up first, then dispatches. cancel_request is the
// same for all three types (only the initiator may call it).

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { errorResponse, jsonResponse, statusForPgError, withCors, } from '../_shared/http.ts';
import { UuidSchema, } from './schemas.ts';

const RESPOND_RPC_BY_TYPE: Record<string, string> = {
  join_request: 'respond_to_join_request',
  invite: 'respond_to_invite',
  ownership_transfer: 'respond_to_ownership_transfer',
};

serve(withCors(async (req,) => {
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Only POST is supported on this endpoint.', 405,);
  }

  const url = new URL(req.url,);
  const segments = url.pathname
    .replace(/^\/functions\/v1\/requests\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  if (segments.length !== 2) {
    return errorResponse('not_found', 'Unknown requests route.', 404,);
  }

  const [rawRequestId, action,] = segments;
  if (!['accept', 'reject', 'cancel',].includes(action,)) {
    return errorResponse('not_found', `Unknown action "${action}".`, 404,);
  }

  const requestIdParsed = UuidSchema.safeParse(rawRequestId,);
  if (!requestIdParsed.success) {
    return errorResponse('invalid_request_id', `"${rawRequestId}" is not a valid UUID.`, 400,);
  }
  const requestId = requestIdParsed.data;

  const supabase = createUserClient(req,);

  try {
    const { data: userData, error: authError, } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return errorResponse('unauthorized', 'A valid session is required.', 401,);
    }

    if (action === 'cancel') {
      const { error, } = await supabase
        .schema('identity',)
        .rpc('cancel_request', { p_request_id: requestId, },);

      if (error) return errorResponse('rpc_error', error.message, statusForPgError(error.code,),);
      return jsonResponse({ ok: true, },);
    }

    // accept/reject need to know the request's type first, to pick the
    // right responder function -- read access is already scoped by RLS
    // (membership_requests_relevant_parties_read), so this select only
    // succeeds if the caller is actually allowed to see the request.
    const { data: reqRow, error: readError, } = await supabase
      .schema('identity',)
      .from('team_membership_requests',)
      .select('type, status',)
      .eq('id', requestId,)
      .maybeSingle();

    if (readError) return errorResponse('query_error', readError.message, 500,);
    if (!reqRow) return errorResponse('not_found', 'No request with that id.', 404,);
    if (reqRow.status !== 'pending') {
      return errorResponse('already_decided', `This request is already "${reqRow.status}".`, 409,);
    }

    const rpcName = RESPOND_RPC_BY_TYPE[reqRow.type];
    const { error, } = await supabase
      .schema('identity',)
      .rpc(rpcName, {
        p_request_id: requestId,
        p_decision: action === 'accept' ? 'accept' : 'reject',
      },);

    if (error) return errorResponse('rpc_error', error.message, statusForPgError(error.code,),);
    return jsonResponse({ ok: true, },);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
}),);
