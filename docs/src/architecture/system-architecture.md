# System Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                        Coreverse Ecosystem                    │
│   Coreverse Launcher     Coreverse Website     Other Clients  │
└───────────────────────────────┬───────────────────────────────┘
                                 │ HTTPS / JSON
                                 ▼
┌───────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                    │
│  auth      releases  teams  requests  profiles  projects      │
│  news      polls     discussions  docs                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Shared HTTP / Supabase / service-role infrastructure     │  │
│  │ (supabase/functions/_shared/)                            │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬───────────────────────────────┘
                                 │ user-scoped Supabase client
                                 ▼
┌───────────────────────────────────────────────────────────────┐
│                         PostgreSQL 17                         │
│   releases   identity   content   docs   private helpers      │
│   RLS + SECURITY DEFINER + constraints + triggers + RPCs      │
└───────────────────────────────┬───────────────────────────────┘
                                 ├──────────────► Supabase Auth
                                 └──────────────► Supabase Storage
```

## Edge Functions

Each of the ten Edge Functions under `supabase/functions/` maps to one OpenAPI tag and owns one or more resources (an eleventh, `send-email`, is a Supabase Auth hook target with no OpenAPI tag of its own — see [Development › Edge Functions](../development/edge-functions.md)):

| Function | Resources |
|---|---|
| `auth` | `/auth/password-reset` |
| `releases` | `/releases`, `/releases/latest`, `/releases/{version}` |
| `teams` | `/teams/*` (create, rename, delete, members, join requests, invites, ownership transfer, leave) |
| `requests` | `/requests/{requestId}/accept|reject|cancel` |
| `profiles` | `/profiles/me` |
| `projects` | `/projects`, `/projects/{id}`, `/projects/{id}/download` |
| `news` | `/news`, `/news/{id}` |
| `polls` | `/polls`, `/polls/{id}/vote`, `/polls/{id}/results` |
| `discussions` | `/discussions`, `/discussions/{id}`, `/discussions/{id}/replies`, `/replies/{id}` |
| `docs` | `/docs/sources`, `/docs/search`, `/docs/reindex` |

Every function follows the same internal shape: parse and validate the request with a Zod schema from its `schemas.ts`, obtain a Supabase client via `_shared/supabase-client.ts` (user-scoped, forwarding the caller's `Authorization` header) or `_shared/service-client.ts` (service-role, only where required), call the corresponding PostgreSQL function or table, and return a response built with `_shared/http.ts`'s `jsonResponse` / `errorResponse` helpers.

## Shared infrastructure (`_shared/`)

- **`http.ts`** — `jsonResponse`, `errorResponse`, and `statusForPgError`, which maps the `42501` Postgres error code (the convention this codebase uses inside `SECURITY DEFINER` functions for "not authorized to do that") to an HTTP 403, and everything else to 400.
- **`supabase-client.ts`** — builds a Supabase client scoped to the caller, forwarding their JWT so RLS applies exactly as it would for a direct (hypothetical) database connection.
- **`service-client.ts`** — builds a service-role client that bypasses RLS entirely. Used only where a function has already performed its own authorization check and needs privileged access afterward (e.g. minting a signed Storage URL, or the `docs/reindex` endpoint's shared-secret auth).

## Database

See [Database Architecture](database-architecture.md) for the four-schema layout and [Security Model](security-model.md) for how authorization is layered across Edge Functions and Postgres.
