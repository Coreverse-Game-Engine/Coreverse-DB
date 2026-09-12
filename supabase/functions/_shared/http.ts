// ---------------------------------------------------------------------
// CORS
//
// Every edge function is called directly from the browser (Website, via
// the coreverse-db SDK) as well as from non-browser callers (Launcher,
// curl, the mobile app) that never send an Origin header at all. Origins
// are an explicit allowlist -- never '*' -- because requests carry a
// caller JWT in the Authorization header; a wildcard origin would make
// that credential-bearing response readable from any page.
//
// WEBSITE_ALLOWED_ORIGINS is a comma-separated list of exact origins
// (scheme + host + port, no trailing slash), set as an edge function
// secret per environment (`supabase secrets set`), e.g.:
//   WEBSITE_ALLOWED_ORIGINS=https://coreverse.dev,https://staging.coreverse.dev
// Locally, put it in supabase/functions/.env (see .env.example) so
// `supabase functions serve` picks it up.
// ---------------------------------------------------------------------

const CORS_ALLOWED_HEADERS = 'authorization, content-type';
const CORS_ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';

// Exported so callers that need to validate a URL's origin against the
// same allowlist (e.g. auth/index.ts checking password-reset's
// redirectTo) don't duplicate this parsing.
export function allowedOrigins(): string[] {
  return (Deno.env.get('WEBSITE_ALLOWED_ORIGINS',) ?? '')
    .split(',',)
    .map((origin,) => origin.trim())
    .filter((origin,) => origin.length > 0);
}

// Headers to attach to every response (including preflight). Only sets
// Access-Control-Allow-Origin when the caller's Origin is on the
// allowlist -- for anonymous/non-browser callers (no Origin header) or
// an origin that isn't allowlisted, these headers are simply omitted,
// which is exactly what makes the browser block the response; it does
// not affect non-browser callers, which never look at CORS headers.
function corsHeadersFor(req: Request,): Headers {
  const headers = new Headers();
  const origin = req.headers.get('Origin',);
  if (origin && allowedOrigins().includes(origin,)) {
    headers.set('Access-Control-Allow-Origin', origin,);
    headers.set('Vary', 'Origin',);
  }
  headers.set('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS,);
  headers.set('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS,);
  // password-reset's 429 responses carry Retry-After -- harmless to
  // expose on every route, so it's listed here rather than per-function.
  headers.set('Access-Control-Expose-Headers', 'Retry-After',);
  return headers;
}

// Wraps a `serve()` handler so every function gets CORS for free instead
// of every route/response needing to thread extraHeaders through by
// hand. OPTIONS preflight is answered before the wrapped handler (and
// therefore before any auth check) ever runs, per the CORS spec --
// preflight requests never carry the caller's Authorization header.
export function withCors(
  handler: (req: Request,) => Promise<Response>,
): (req: Request,) => Promise<Response> {
  return async (req: Request,): Promise<Response> => {
    const cors = corsHeadersFor(req,);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors, },);
    }

    const response = await handler(req,);
    const merged = new Headers(response.headers,);
    cors.forEach((value, key,) => merged.set(key, value,));
    return new Response(response.body, { status: response.status, headers: merged, },);
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body,), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders, },
  },);
}

export function errorResponse(
  error: string,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return jsonResponse({ error, message, }, status, extraHeaders,);
}

// Maps a Postgres error (from a SECURITY DEFINER function's `raise
// exception`) to an HTTP status. 42501 is the convention this codebase
// uses for "not authorized to do that" inside PL/pgSQL functions.
export function statusForPgError(pgErrorCode: string | undefined,): number {
  if (pgErrorCode === '42501') return 403;
  return 400;
}
