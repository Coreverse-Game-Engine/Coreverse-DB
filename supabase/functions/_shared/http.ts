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
