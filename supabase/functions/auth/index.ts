// POST /auth/password-reset
//
// Unauthenticated by design -- this is how a signed-out user starts
// account recovery, so there is no caller JWT to check. Two things keep
// that safe:
//
//   1. Rate limiting (identity.hit_rate_limit, added in
//      20260912103000_avatar_upload_and_rate_limit.sql) keyed both by
//      the submitted email (a few requests per 15 min) and by the
//      caller's IP (more requests per hour, across any email) -- the
//      email key stops someone from spamming one inbox with reset
//      emails, the IP key stops a single client from sweeping many
//      emails looking for valid accounts.
//   2. The response is identical whether or not the email belongs to an
//      account, and whether or not Supabase Auth's own send succeeded --
//      the only distinguishable outcome is 429 (rate limited), which
//      reveals nothing about account existence, only that this
//      email/IP has made a lot of requests.
//
// Rate limit checks run against the service-role client: this route has
// no authenticated-user JWT to run identity.hit_rate_limit() as (unlike
// the identity domain's other SECURITY DEFINER functions, which run as
// `authenticated`), and identity.hit_rate_limit() is deliberately not
// granted to anon.

import { serve, } from '@std/http/server';
import { createAnonClient, } from '../_shared/supabase-client.ts';
import { createServiceClient, } from '../_shared/service-client.ts';
import { errorResponse, jsonResponse, } from '../_shared/http.ts';
import { PasswordResetSchema, } from './schemas.ts';

const EMAIL_LIMIT = { maxHits: 3, windowSeconds: 15 * 60, }; // 3 / 15 min, per email
const IP_LIMIT = { maxHits: 10, windowSeconds: 60 * 60, }; // 10 / hour, per IP

function callerIp(req: Request,): string {
  // Supabase's Edge Functions gateway sets x-forwarded-for; take the
  // first (client-side) hop. Falls back to a fixed key rather than
  // "unknown" so that -- in the local/dev case where the header is
  // absent -- every request doesn't share a single "unknown" bucket
  // with every other unrelated dev request.
  const forwardedFor = req.headers.get('x-forwarded-for',);
  const first = forwardedFor?.split(',',)[0]?.trim();
  return first || 'no-forwarded-for-header';
}

serve(async (req,) => {
  const url = new URL(req.url,);
  const path = url.pathname.replace(/^\/functions\/v1\/auth\/?/, '',);

  if (path !== 'password-reset') {
    return errorResponse('not_found', 'Unknown auth route.', 404,);
  }
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Only POST is supported on this route.', 405,);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = PasswordResetSchema.safeParse(body,);
    if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);
    const { email, } = parsed.data;

    const serviceClient = createServiceClient();

    const emailAllowed = await hitRateLimit(serviceClient, `pwreset:email:${email}`, EMAIL_LIMIT,);
    if (!emailAllowed) {
      return errorResponse(
        'rate_limited',
        'Too many password reset requests for this email. Try again later.',
        429,
        { 'Retry-After': String(EMAIL_LIMIT.windowSeconds,), },
      );
    }

    const ipAllowed = await hitRateLimit(serviceClient, `pwreset:ip:${callerIp(req,)}`, IP_LIMIT,);
    if (!ipAllowed) {
      return errorResponse(
        'rate_limited',
        'Too many password reset requests from this network. Try again later.',
        429,
        { 'Retry-After': String(IP_LIMIT.windowSeconds,), },
      );
    }

    // Fire the actual reset email through a plain anon client. The
    // result is intentionally not branched on: whether the address
    // exists, and whether Supabase Auth's send succeeded, must not be
    // observable from this response.
    await createAnonClient().auth.resetPasswordForEmail(email,);

    return jsonResponse({ ok: true, },);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
},);

async function hitRateLimit(
  serviceClient: ReturnType<typeof createServiceClient>,
  key: string,
  limit: { maxHits: number; windowSeconds: number },
): Promise<boolean> {
  const { data, error, } = await serviceClient
    .schema('identity',)
    .rpc('hit_rate_limit', {
      p_key: key,
      p_max_hits: limit.maxHits,
      p_window_seconds: limit.windowSeconds,
    },);

  // An unexpected RPC failure is a genuine 500, not a 429 -- surface it
  // as such rather than silently reporting "rate limited" for a problem
  // that has nothing to do with the caller's request volume. The
  // outer try/catch in the handler turns this into internal_error.
  if (error) throw new Error(`hit_rate_limit RPC failed: ${error.message}`,);
  return data === true;
}
