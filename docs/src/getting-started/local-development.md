# Local Development

## 1. Install JavaScript dependencies

```bash
pnpm install
```

## 2. Start the local Supabase stack

```bash
supabase start
```

This launches Postgres, Auth (GoTrue), Storage, and the Edge Functions runtime locally via Docker, and applies every migration in [`supabase/migrations/`](../database/schema.md) in order.

## 3. Generate the TypeScript client

```bash
pnpm generate
```

This runs Orval against [`openapi/openapi.yaml`](../openapi/specification.md) and writes the fetch client, Zod schemas, and (for the `react` entry point) TanStack Query hooks into `src/generated/`.

## 4. Run the test suites

```bash
# Edge Function request-schema unit tests (no database required)
deno task test

# Database and RLS behavior (pgTAP, requires the local stack from step 2)
supabase test db
```

## 5. Verify before opening a PR

```bash
pnpm verify
```

`pnpm verify` regenerates the client, fails if the regenerated output differs from what's committed (drift check), and then type-checks the package. This is the same check CI runs, so a clean local `pnpm verify` is a strong signal your change is ready for review.

## Day-to-day loop

- Changing the **database**: write a new migration, `supabase db reset` to rebuild from scratch, add/adjust pgTAP tests, run `supabase test db`.
- Changing the **HTTP contract**: edit `openapi/paths/` or `openapi/schemas/`, then `pnpm generate` to regenerate the client and commit the result.
- Changing an **Edge Function**: edit `supabase/functions/<name>/index.ts` and its `schemas.ts`, run `deno task test`, restart the local stack to pick up the change (`supabase functions serve` reloads automatically in dev).

See [Development › Workflow](../development/workflow.md) for the fuller version of this loop.
