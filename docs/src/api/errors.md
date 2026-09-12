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

| Postgres error code | HTTP status | Meaning |
|---|---|---|
| `42501` | `403` | The convention this codebase uses inside PL/pgSQL functions for "authenticated, but not authorized to do that" |
| anything else | `400` | Validation failure, constraint violation, or any other database-level rejection |

## Request validation errors

A request that fails its Zod schema validation never reaches the database at all — the Edge Function returns `400` immediately with a message describing what failed.

## 404s

A `404` means the referenced resource genuinely doesn't exist (or, in the case of RLS-protected resources, that it exists but the caller can't see it — Coreverse DB does not distinguish "not found" from "not authorized to know it exists" for read paths, to avoid leaking existence information).
