# Edge Functions

Edge Functions live under `supabase/functions/<name>/`, one directory per OpenAPI tag, each with:

- **`index.ts`** — the HTTP handler.
- **`schemas.ts`** — Zod schemas for the function's request bodies/params.
- **`schemas.test.ts`** — Deno unit tests for those schemas (no database required).

## Shared infrastructure

Every function imports from `supabase/functions/_shared/`:

- **`http.ts`** — `jsonResponse`, `errorResponse`, `statusForPgError`.
- **`supabase-client.ts`** — a Supabase client scoped to the caller's forwarded JWT.
- **`service-client.ts`** — a service-role client, used only where a function has already performed its own access check and needs privileged access afterward.

## Writing a new function

1. Add the OpenAPI paths/schemas for it first (contract-first — see [Development › Workflow](workflow.md)).
2. Create `supabase/functions/<name>/schemas.ts` with a Zod schema per request body/params shape.
3. Create `schemas.test.ts` covering valid and invalid input for each schema.
4. Implement `index.ts`: route on method + path segments, validate with the Zod schema, get the appropriate client (`supabase-client.ts` unless there's a specific, documented reason for `service-client.ts`), call the database, map errors with `statusForPgError`, respond with `jsonResponse`/`errorResponse`.
5. `deno task test`.
6. `pnpm generate` to pick up the new OpenAPI operations into the TypeScript client.

## Local testing against the running stack

```bash
supabase start
supabase functions serve
```

`supabase functions serve` picks up local edits automatically, so you can iterate against `curl`/Postman/the generated client without redeploying.

See [Architecture › System Architecture](../architecture/system-architecture.md) for the function-to-resource mapping and [Security › Authorization](../security/authorization.md) for the request-handling shape every function follows.
