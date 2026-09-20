# Errors

Every error response uses the shared `Error` schema (`openapi/schemas/Error.yaml`):

```json
{
  "error": "string, a short machine-readable code",
  "message": "string, human-readable detail"
}
```

## Status code mapping

Edge Functions build this response with the shared `errorResponse(error, message, status)` helper (`supabase/functions/_shared/http.ts`). Errors raised inside a `SECURITY DEFINER` PostgreSQL function are mapped to an HTTP status by `statusForPgError`:

| Postgres error code | HTTP status | Meaning                                                                                                        |
|---------------------|-------------|----------------------------------------------------------------------------------------------------------------|
| `42501`             | `403`       | The convention this codebase uses inside PL/pgSQL functions for "authenticated, but not authorized to do that" |
| anything else       | `400`       | Validation failure, constraint violation, or any other database-level rejection                                |

## Request validation errors

A request that fails its Zod schema validation never reaches the database at all — the Edge Function returns `400` immediately with a message describing what failed.

## `error` is a closed set

`openapi/schemas/Error.yaml` lists every `error` value an Edge Function can return as an enum — it's not open-ended free text. Adding a new code means adding it there in the same PR.

## `message` never echoes raw database errors

Once a request reaches the database, `message` is built from `safeDbErrorMessage()` (`supabase/functions/_shared/http.ts`), not from the raw Postgres/PostgREST `error.message`. The raw message can contain constraint, column, and table names — schema details a caller has no reason to see and that make the schema easier to map out from the outside. The HTTP status plus the route's own `error` code already convey everything a client can act on; `message` is for logs, not for showing verbatim in a UI.

## 404s

A `404` means the referenced resource genuinely doesn't exist (or, in the case of RLS-protected resources, that it exists but the caller can't see it — Coreverse DB does not distinguish "not found" from "not authorized to know it exists" for read paths, to avoid leaking existence information).
