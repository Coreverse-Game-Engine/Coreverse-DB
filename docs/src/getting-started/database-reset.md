# Database Reset

```bash
supabase db reset
```

This rebuilds the local database from scratch: it drops the local database, replays every migration in [`supabase/migrations/`](../database/schema.md) in filename order, and then loads [`supabase/seed.sql`](https://github.com/KING-MASTER2012/Coreverse-DB/blob/main/supabase/seed.sql) for local development seed data.

## When to reset

- After pulling changes that add a new migration.
- After writing a new migration yourself, to confirm it applies cleanly from a blank database (not just on top of your already-migrated local state).
- Whenever local data has drifted into a state that's confusing to debug against.

## What it does *not* do

- It does not touch anything in the hosted/production Supabase project — this only operates on the local Docker-backed stack started by `supabase start`.
- It does not regenerate the TypeScript client — run `pnpm generate` separately if the schema change also affects the OpenAPI contract.

After a reset, re-run `supabase test db` to confirm the pgTAP suite still passes against the freshly rebuilt database.
