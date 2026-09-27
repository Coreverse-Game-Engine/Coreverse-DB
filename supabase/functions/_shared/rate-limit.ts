// Shared wrapper around identity.hit_rate_limit(), extracted out of
// auth/index.ts so discussions/polls/news can use the same mechanism
// on their own write endpoints instead of having none at all (see the
// "yazma işlemlerine hız sınırı yok" gap in the Faz 3 plan).
//
// identity.hit_rate_limit() is granted only to service_role (see
// 20260912085602_avatar_upload_and_rate_limit.sql) -- not authenticated,
// even though these callers already have a user JWT. That grant was
// scoped deliberately narrowly when it was added for the one
// unauthenticated route that needed it (password reset has no JWT to
// run anything "as"); rather than widen a security-reviewed grant as a
// side effect of an unrelated pagination/fields change, callers here
// keep using a service-role client for just this RPC call, same as
// auth/index.ts always has.

import { createServiceClient, } from './service-client.ts';

export interface RateLimit {
  maxHits: number;
  windowSeconds: number;
}

export async function hitRateLimit(key: string, limit: RateLimit,): Promise<boolean> {
  const serviceClient = createServiceClient();
  const { data, error, } = await serviceClient
    .schema('identity',)
    .rpc('hit_rate_limit', {
      p_key: key,
      p_max_hits: limit.maxHits,
      p_window_seconds: limit.windowSeconds,
    },);

  // Same reasoning as the original auth/index.ts version: an RPC
  // failure is a genuine 500, not a 429 -- don't silently tell a
  // caller "you're rate limited" for a problem that has nothing to do
  // with their request volume. Callers should let this throw into
  // their existing catch-all internal_error handler.
  if (error) throw new Error(`hit_rate_limit RPC failed: ${error.message}`,);
  return data === true;
}
