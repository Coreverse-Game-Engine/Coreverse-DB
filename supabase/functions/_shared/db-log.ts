// Server-side visibility for PostgREST failures.
//
// Handlers deliberately answer database failures with a generic message
// (safeDbErrorMessage), so the real cause -- a missing table, a permission
// error, a schema that is not exposed -- never reaches the function logs.
// This fetch wrapper logs the PostgREST error (status, code, message, hint;
// never `details`, which can echo row values) for every failed REST call made
// through the Supabase clients, and returns the response untouched.

const REST_PATH_MARKER = '/rest/v1/';

interface PostgrestErrorBody {
  code?: unknown;
  message?: unknown;
  hint?: unknown;
}

function requestUrl(input: RequestInfo | URL,): URL | null {
  try {
    if (input instanceof Request) return new URL(input.url,);
    return new URL(String(input,),);
  } catch {
    return null;
  }
}

async function describeFailure(response: Response,): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const body = JSON.parse(text,) as PostgrestErrorBody;
    return { code: body.code, message: body.message, hint: body.hint, };
  } catch {
    return { body: text.slice(0, 200,), };
  }
}

export async function loggingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init,);

  if (response.status < 400 || response.status === 401) return response;

  const url = requestUrl(input,);
  if (!url || !url.pathname.includes(REST_PATH_MARKER,)) return response;

  try {
    const failure = await describeFailure(response.clone(),);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    console.error(
      '[postgrest]',
      JSON.stringify({
        method,
        path: url.pathname.slice(url.pathname.indexOf(REST_PATH_MARKER,) + REST_PATH_MARKER.length,),
        status: response.status,
        ...failure,
      },),
    );
  } catch {
    // logging must never change the response
  }

  return response;
}
