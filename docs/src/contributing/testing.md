# Testing

A change is expected to come with tests appropriate to what it touches:

| Change touches... | Add/update... |
|---|---|
| A new or changed PostgreSQL function | A pgTAP test under `supabase/tests/database/` (see [Database Testing](../development/database-testing.md)) |
| A new or changed RLS policy | A pgTAP test under `supabase/tests/rls/`, covering at least one allowed and one denied case (see [RLS Testing](../development/rls-testing.md)) |
| A new or changed Edge Function request shape | A Zod schema test in that function's `schemas.test.ts` (see [Edge Functions](../development/edge-functions.md)) |
| The OpenAPI contract | Regenerated and committed `src/generated/` (`pnpm generate`), verified with `pnpm verify` |

There is no end-to-end/integration test suite spanning "HTTP request in, database row out" in this repository yet — Edge Function tests validate request *shapes* only (no running database), and database tests validate PostgreSQL behavior directly (no HTTP layer). Keep that boundary in mind when deciding where a new test belongs.
