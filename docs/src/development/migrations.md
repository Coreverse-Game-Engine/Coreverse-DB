# Migrations

Migrations are the single source of truth for the schema — there is no manual, out-of-band change to a running database, local or hosted.

## Creating one

```bash
supabase migration new <description>
```

This creates a new timestamped file under `supabase/migrations/`. Existing migrations are one-per-domain (see [Database › Schema](../database/schema.md)), but that's a convention from the project's early history, not a rule — a small follow-up change (like the storage-buckets migration) is fine as its own file rather than being folded into an existing domain's migration.

## Applying

```bash
supabase db reset
```

rebuilds the local database from every migration in filename order, then loads `supabase/seed.sql`. See [Database Reset](../getting-started/database-reset.md).

## Rules

- **Never edit a migration that's already been merged to `main`.** If a mistake ships, write a follow-up migration that corrects it — the migration history is the audit trail.
- **Every migration should be re-runnable from a blank database** — always test with `supabase db reset`, not just by applying on top of your already-migrated local state.
- **Migrations that change API-observable behavior update the OpenAPI contract in the same change** — see [Workflow](workflow.md).

See [Writing Migrations](writing-migrations.md) for the structural/style rules a migration's contents should follow.
