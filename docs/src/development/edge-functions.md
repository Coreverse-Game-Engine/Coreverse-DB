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

Configure it once per environment at Dashboard → Authentication → Hooks
→ Send Email hook, pointing at this function's URL, and set
`SEND_EMAIL_HOOK_SECRET` to the secret the Dashboard generates. It fires
for *every* Supabase Auth email type once configured (not just password
recovery) — see the comment at the top of `send-email/index.ts` before
enabling any other Auth email flow (signup confirmation, magic link,
etc.) in an environment that has this hook configured.

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
