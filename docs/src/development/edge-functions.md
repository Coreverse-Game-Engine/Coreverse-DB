# Edge Functions

Edge Functions live under `supabase/functions/<name>/`, one directory per OpenAPI tag, each with:

- **`index.ts`** — the HTTP handler.
- **`schemas.ts`** — Zod schemas for the function's request bodies/params.
- **`schemas.test.ts`** — Deno unit tests for those schemas (no database required).

## Shared infrastructure

Every function imports from `supabase/functions/_shared/`:

- **`http.ts`** — `jsonResponse`, `errorResponse`, `statusForPgError`, `withCors`, `allowedOrigins`.
- **`supabase-client.ts`** — a Supabase client scoped to the caller's forwarded JWT.
- **`service-client.ts`** — a service-role client, used only where a function has already performed its own access check and needs privileged access afterward.

## Writing a new function

1. Add the OpenAPI paths/schemas for it first (contract-first — see [Development › Workflow](workflow.md)).
2. Create `supabase/functions/<name>/schemas.ts` with a Zod schema per request body/params shape.
3. Create `schemas.test.ts` covering valid and invalid input for each schema.
4. Implement `index.ts`: route on method + path segments, validate with the Zod schema, get the appropriate client (`supabase-client.ts` unless there's a specific, documented reason for `service-client.ts`), call the database, map errors with `statusForPgError`, respond with `jsonResponse`/`errorResponse`. Wrap the whole handler in `withCors` (`serve(withCors(async (req) => { ... }))`) — every function needs this, it's what answers the browser's OPTIONS preflight and attaches `Access-Control-*` headers to the real response; see `WEBSITE_ALLOWED_ORIGINS` in [Reference › Environment Variables](../reference/environment-variables.md).
5. `deno task test`.
6. `pnpm generate` to pick up the new OpenAPI operations into the TypeScript client.

## `send-email` is not like the others

`supabase/functions/send-email/` is a Supabase Auth **Send Email hook**
target, not an SDK-facing function: Supabase Auth calls it directly,
server-to-server, with a Standard Webhooks signature
(`SEND_EMAIL_HOOK_SECRET`) instead of a user JWT. It therefore:

- has no OpenAPI entry (Website/the SDK never call it directly),
- is not wrapped in `withCors` (nothing browser-facing calls it),
- must be deployed with `supabase functions deploy send-email --no-verify-jwt`
  (the normal JWT check would reject Auth's own signed request).

`auth`, `profiles` and the public-content functions (`releases`, `news`,
`events`, `faq`, `polls`, `discussions`, `docs`) are also declared
`verify_jwt = false` in `supabase/config.toml`, for a different reason: they
serve operations that must work signed out (password reset, the signup
username check, and reading public content). `teams`, `requests` and
`projects` keep the JWT gate on. A function without the gate must
authenticate each route that needs a user itself: wrap a public-content
function as `serve(withCors(withTokenCheck(async (req) => { ... })))` so a bad
token and any anonymous write answer `401 unauthorized`, and let write routes
resolve the user with `supabase.auth.getUser()` or RLS.
`scripts/ops/static-checks.mjs` pins the list and the wrapper — see
[Security › Authentication](../security/authentication.md#the-platform-jwt-gate).

Configure it once per environment at Dashboard → Authentication → Hooks
→ Send Email hook, pointing at this function's URL, and set
`SEND_EMAIL_HOOK_SECRET` to the secret the Dashboard generates. It fires
for *every* Supabase Auth email type once configured (not just password
recovery) — `recovery`, `signup`, `magiclink`, `invite` and
`reauthentication` all have real copy (`render.ts`'s
`RESET_EMAIL_COPY`/`ACTION_COPY`); anything else, including
`email_change` (deliberately left uncovered — see `render.ts`'s module
comment), falls back to a generic English message with a working link
rather than failing the underlying Auth action.

### Links in the emails

For `signup`, `recovery`, `magiclink` and `invite` the email's button does not
go to Supabase's `/auth/v1/verify`. It goes to the Website's confirm route,
built in `render.ts` (`actionLinkFor`, `WEBSITE_CONFIRM_PATH`):

```text
<origin>/api/auth/confirm?token_hash=<hash>&type=<signup|recovery|magiclink|invite>&next=<path>
```

`<origin>` and `<path>` are taken from `email_data.redirect_to`, the URL the
Website gave Supabase Auth. The origin has to be in `WEBSITE_ALLOWED_ORIGINS`;
otherwise (or if `redirect_to` is not a URL) the link falls back to the
Supabase verify URL, because a non-2xx from the hook would fail the user's
signup or reset. `email_change` always keeps the Supabase verify link.

The Website route calls `supabase.auth.verifyOtp({ token_hash, type })` and then
redirects to `next`, after treating `next` as an internal path only. Because
`verifyOtp` needs no PKCE verifier cookie, the link works on any device.
The link opens with a plain `GET`, so a mail scanner that prefetches links can
consume the one-time token; the route should show a clear error for an expired
or already used token.

The local stack builds the same link from `supabase/templates/confirmation.html`
and `recovery.html` (wired in `supabase/config.toml`, `{{ .SiteURL }}` is
`site_url`). Hook and templates are different code paths, so
`scripts/ops/static-checks.mjs` compares them: change the confirm path or its
query parameters in one place only together with the other.

Its file layout still mirrors the schemas.ts/index.ts split above, just
with different names: `render.ts` holds the pure, testable logic
(per-locale copy, action-link construction — no `Deno.serve`, no
network calls) and `render.test.ts` tests it directly; `index.ts` is
only the webhook verification + HTTP wiring around it, which is what
makes `Deno.serve` live in a file nothing imports for testing.

## Local testing against the running stack

```bash
supabase start
supabase functions serve
```

`supabase functions serve` picks up local edits automatically, so you can iterate against `curl`/Postman/the generated client without redeploying.

See [Architecture › System Architecture](../architecture/system-architecture.md) for the function-to-resource mapping and [Security › Authorization](../security/authorization.md) for the request-handling shape every function follows.
