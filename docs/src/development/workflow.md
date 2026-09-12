# Workflow

## Changing the database

1. Write a new migration under `supabase/migrations/` (see [Migrations](migrations.md) and [Writing Migrations](writing-migrations.md)).
2. `supabase db reset` to rebuild from scratch and confirm the migration applies cleanly.
3. Add/update pgTAP tests under `supabase/tests/` (see [Database Testing](database-testing.md), [pgTAP](pgtap.md), [RLS Testing](rls-testing.md)).
4. `supabase test db`.
5. If the change affects externally observable behavior, update the OpenAPI contract in the same change (see below).

## Changing the HTTP contract

1. Edit `openapi/paths/*.yaml` and/or `openapi/schemas/*.yaml`.
2. Lint with Redocly.
3. `pnpm generate` to regenerate `src/generated/`.
4. Review the regenerated diff — `src/generated/` is derived output and should never be hand-edited.
5. `pnpm typecheck`.

## Changing an Edge Function

1. Edit `supabase/functions/<name>/index.ts` and its `schemas.ts`.
2. Update `schemas.test.ts` for the new/changed Zod schema.
3. `deno task test`.
4. If the change alters the contract, update OpenAPI too (previous section).

## Before opening a pull request

```bash
pnpm verify        # regenerate + drift check + typecheck
deno task test      # Edge Function schema unit tests
supabase test db    # pgTAP database + RLS tests
```

These three commands are exactly what CI runs (see [Deploy Checklist](../operations/deployment.md) and the `ci.yml` workflow) — a clean local run of all three is a strong signal the change is ready for review. See [Contributing › Pull Requests](../contributing/pull-requests.md) for the review process itself.
