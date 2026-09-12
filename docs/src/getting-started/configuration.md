# Configuration

Local configuration is driven by environment variables. [`.env.example`](https://github.com/Coreverse-Game-Engine/Coreverse-DB/blob/main/.env.example) is the baseline — copy it to `.env.local` and fill in real values for your local Supabase instance (`supabase start` prints them).

| Variable | Purpose |
|---|---|
| `PUBLIC_SUPABASE_URL` | Client-side Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase anonymous key |
| `DATABASE_PASSWORD` | Database password for local development/administration workflows |
| `SUPABASE_SECRET_KEY` | Server-side Supabase secret key (service role) |
| `DATABASE_URL` | Direct PostgreSQL connection string, used by tooling like DataGrip |

> **Never commit real credentials.** Supabase secret keys, database passwords, and the `docs/reindex` shared token must never be committed to the repository, even in example form beyond the placeholders already in `.env.example`.

## Supabase project configuration

Project-level Supabase configuration (API port, Auth settings, Storage limits, etc.) lives in [`supabase/config.toml`](https://github.com/Coreverse-Game-Engine/Coreverse-DB/blob/main/supabase/config.toml) and is version-controlled, unlike secrets.

## IDE configuration

The team uses **WebStorm** for TypeScript/Deno/API work and **DataGrip** for PostgreSQL/RLS/migration work; a `DATABASE_URL` in `.env.local` is what DataGrip needs to connect to the local instance.
