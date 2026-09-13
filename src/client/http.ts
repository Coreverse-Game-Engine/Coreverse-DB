// Custom fetch mutator for the Orval-generated client (see orval.config.ts
// -> output.override.mutator). Every generated endpoint function calls
// coreverseFetch(url, options) instead of the global fetch, so this is the
// single place that knows about:
//   - which environment we're pointed at (local dev vs production --
//     matches the two `servers` entries in openapi/openapi.yaml),
//   - how to attach the caller's Supabase session JWT as a Bearer token,
//   - how to turn a non-2xx response into a typed error instead of a bare
//     Response, using the shape of openapi/schemas/Error.yaml.
//
// Consumers (Launcher, Website) call configureCoreverseClient() once at
// startup before making any request.

export interface CoreverseErrorBody {
  error: string;
  message: string;
}

// Mirrors openapi/schemas/Error.yaml. Thrown for any non-2xx response;
// operations documented with `security: []` (public reads, plus
// /docs/reindex's own X-Reindex-Token) never need getAuthToken at all.
export class CoreverseApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: CoreverseErrorBody | undefined;

  constructor(status: number, body: CoreverseErrorBody | undefined) {
    super(body?.message ?? `Coreverse DB API request failed with status ${status}.`);
    this.name = "CoreverseApiError";
    this.status = status;
    this.code = body?.error ?? "unknown_error";
    this.body = body;
  }
}

export interface CoreverseClientConfig {
  /**
   * Base URL up to and including `/functions/v1`, e.g.
   * "https://<project-ref>.supabase.co/functions/v1" (production) or
   * "http://127.0.0.1:54321/functions/v1" (supabase start) -- the two
   * `servers` entries in openapi/openapi.yaml.
   */
  baseUrl: string;
  /**
   * Returns the caller's current Supabase session JWT (no "Bearer "
   * prefix), or null/undefined for an anonymous request. Called fresh
   * before every request, so token refresh is the consumer's problem, not
   * this client's. Not consulted for calls the generated code marks as
   * public per the spec's `security: []`.
   */
  getAuthToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Override the fetch implementation used for every request. Defaults to
   * the global fetch. Mainly for tests (inject a mock) or non-global
   * environments -- most consumers never need to set this.
   */
  fetch?: typeof fetch;
}

let config: CoreverseClientConfig | null = null;

export function configureCoreverseClient(next: CoreverseClientConfig): void {
  config = next;
}

function requireConfig(): CoreverseClientConfig {
  if (!config) {
    throw new Error(
      "Coreverse DB client used before configureCoreverseClient() was called. " +
      "Call it once at startup with { baseUrl, getAuthToken }.",
    );
  }
  return config;
}

// Orval's `client: 'fetch'` output calls its mutator as
// mutator(url, options) and awaits a parsed value back (not a Response).
// `url` here is generated as a *relative* path (e.g. "/teams/{teamId}"
// with params substituted) -- baseUrl is joined in here, not per-call, so
// generated code never needs to know which environment it's running in.
export async function coreverseFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const { baseUrl, getAuthToken, fetch: fetchOverride } = requireConfig();

  const headers = new Headers(options.headers);
  // FormData (e.g. uploadMyAvatar) must NOT get an explicit Content-Type --
  // the browser needs to set its own `multipart/form-data; boundary=...`
  // when it serializes the body, and a pre-set `application/json` here
  // both lies about the format and suppresses that boundary, so the
  // server can't parse the multipart body at all.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = await getAuthToken?.();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const doFetch = fetchOverride ?? fetch;
  const response = await doFetch(`${baseUrl}${url}`, { ...options, headers });

  // 204 No Content (deleteTeam, leaveTeam, deleteProject, deleteDiscussion,
  // deleteNews) -- nothing to parse, and `as T` is correct there since
  // those operations are typed `void` in the generated client.
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const parsed = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new CoreverseApiError(response.status, parsed as CoreverseErrorBody | undefined);
  }

  return parsed as T;
}
