# Code Style

## TypeScript / Deno (Edge Functions, client package)

- Formatted with `deno fmt` for everything under `supabase/functions/` (config in `deno.json`'s `fmt` block: 2-space indent, single quotes, semicolons, trailing commas, 100-char line width).
- The TypeScript client package (`src/`) is formatted with Prettier and type-checked with `tsc --noEmit` (`pnpm typecheck`).
- `src/generated/` is never hand-edited — see [OpenAPI › Overview](../openapi/overview.md).

## Linting and static analysis

- `deno lint` for Edge Function code.
- **CodeQL** and **Semgrep** run in CI (`codeql.yml`, `sempgrep.yml`) as additional static-analysis passes over the TypeScript/JavaScript surface.

See [SQL Style](sql-style.md) for the PostgreSQL-specific equivalent of this page.
