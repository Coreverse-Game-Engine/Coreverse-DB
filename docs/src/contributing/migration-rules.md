# Migration Rules

- **Never edit a migration already merged to `main`.** Ship a follow-up migration instead — the file history is the audit trail of how the schema got to its current state.
- **Always verify with a full `supabase db reset`**, not just by applying on top of already-migrated local state — a migration that only works incrementally will break anyone doing a fresh clone.
- **One logical change per migration** where practical; a migration's own top-of-file comment should explain the "why," not just restate the DDL.
- **RLS is part of the migration, not a follow-up.** A new table ships with `enable row level security` and its policies in the same migration, never added later as an afterthought.
- **API-observable schema changes update the OpenAPI contract in the same pull request** (see [Development › Workflow](../development/workflow.md)) — a migration and an out-of-sync contract should never be merged separately.

See [Writing Migrations](../development/writing-migrations.md) for the structural checklist these rules assume.
