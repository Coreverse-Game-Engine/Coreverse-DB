# Overview

Coreverse DB has three layers, each with a single, narrow responsibility:

```text
Coreverse Launcher / Coreverse Website / other clients
                    │  HTTPS / JSON
                    ▼
        Supabase Edge Functions (Deno)
                    │  user-scoped or service-role Supabase client
                    ▼
              PostgreSQL 17
   (releases · identity · content · docs schemas)
                    │
                    ├──► Supabase Auth
                    └──► Supabase Storage
```

- **Clients** never see a database connection string or a service-role key. They only know the Edge Function base URL and, once signed in, a Supabase Auth JWT.
- **Edge Functions** are the only thing between a client and the database. Each function validates its request with Zod, then executes it against Postgres using a Supabase client scoped to the caller's JWT (so RLS applies) — except for the small number of operations that must run with elevated privilege (the `docs/reindex` secret-authenticated endpoint, and the project-download signed-URL flow), which explicitly construct a service-role client for just that operation.
- **PostgreSQL** is where authorization actually lives. Row Level Security policies, `SECURITY DEFINER` functions, constraints, and triggers decide what a given request is allowed to do — not application code in the Edge Functions.

See [System Architecture](system-architecture.md) for the full component diagram, [Database Architecture](database-architecture.md) for how the four schemas are organized, [Security Model](security-model.md) for the authorization layering, and [Data Flow](data-flow.md) for a request walked through end to end.
