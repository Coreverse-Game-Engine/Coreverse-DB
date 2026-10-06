// ---------------------------------------------------------------------
// Caller classification for functions deployed WITHOUT the platform JWT
// gate (verify_jwt = false in supabase/config.toml).
//
// With the gate on, Supabase rejects a missing, malformed or expired
// token with a 401 before any of our code runs. With it off, that token
// goes straight through to PostgREST: an expired one surfaces as a
// generic 500 from the query, and an RLS-only write (PATCH/DELETE) made
// without any token ends up as a confusing 404. Neither tells a client
// what it actually needs to know -- "sign in" or "refresh your token".
//
// withTokenCheck restores that contract inside the function:
//   * an Authorization header that is not a usable token  -> 401
//   * a write (anything but GET/HEAD) with no user token   -> 401
// and lets everything else through untouched.
//
// SECURITY NOTE: classifyCaller decodes the token payload WITHOUT
// verifying the signature. That is deliberate and safe: it only decides
// whether to answer 401 *earlier*. It never grants anything. Every real
// authorization decision is still made with the verified token --
// PostgREST verifies the signature and applies RLS, and the write routes
// call supabase.auth.getUser(), which asks GoTrue. A forged token that
// passes this check is rejected there.
// ---------------------------------------------------------------------

import { errorResponse, } from './http.ts';

export type CallerKind = 'anonymous' | 'user' | 'invalid';

function decodePayload(token: string,): Record<string, unknown> | null {
  const parts = token.split('.',);
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+',).replace(/_/g, '/',);
    const padded = base64.padEnd(Math.ceil(base64.length / 4,) * 4, '=',);
    const bytes = Uint8Array.from(atob(padded,), (c,) => c.charCodeAt(0,),);
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes,),);
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload,)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 'anonymous' -- no credentials, or only the project's public anon key
//                (what supabase-js falls back to for a signed-out client).
// 'user'      -- a token whose role is authenticated (or service_role) and
//                that has not expired.
// 'invalid'   -- anything else: not a Bearer header, not a JWT, expired,
//                or a role this API does not recognize.
export function classifyCaller(
  req: Request,
  nowSeconds: number = Math.floor(Date.now() / 1000,),
): CallerKind {
  const header = req.headers.get('Authorization',);
  if (header === null || header.trim() === '') return 'anonymous';

  const match = header.match(/^Bearer\s+(\S+)$/i,);
  if (!match) return 'invalid';
  const token = match[1];

  // Supabase's newer publishable keys are opaque strings, not JWTs, and
  // identify the same anonymous role.
  if (token.startsWith('sb_publishable_',)) return 'anonymous';

  const payload = decodePayload(token,);
  if (!payload) return 'invalid';
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) return 'invalid';

  if (payload.role === 'anon') return 'anonymous';
  if (payload.role === 'authenticated' || payload.role === 'service_role') return 'user';
  return 'invalid';
}

export interface TokenCheckOptions {
  // Set for a function whose write routes authenticate some other way
  // than a user session (docs/reindex uses the X-Reindex-Token secret).
  anonymousWrites?: boolean;
}

// Wrap INSIDE withCors so the preflight (OPTIONS, which never carries an
// Authorization header) is answered first and the 401s below still get
// CORS headers -- a browser can only read a 401 it is allowed to see:
//   serve(withCors(withTokenCheck(async (req,) => { ... },),),);
export function withTokenCheck(
  handler: (req: Request,) => Promise<Response>,
  options: TokenCheckOptions = {},
): (req: Request,) => Promise<Response> {
  return (req: Request,): Promise<Response> => {
    const kind = classifyCaller(req,);

    if (kind === 'invalid') {
      return Promise.resolve(
        errorResponse('unauthorized', 'The access token is invalid or has expired.', 401,),
      );
    }

    const isRead = req.method === 'GET' || req.method === 'HEAD';
    if (kind === 'anonymous' && !isRead && !options.anonymousWrites) {
      return Promise.resolve(
        errorResponse('unauthorized', 'A valid session is required.', 401,),
      );
    }

    return handler(req,);
  };
}
