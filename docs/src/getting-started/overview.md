# Overview

Getting a local Coreverse DB environment running touches three separate toolchains, because the repository has three separate jobs:

1. **Supabase / PostgreSQL** — the database, migrations, RLS, and pgTAP tests.
2. **Deno** — the Edge Functions and their Zod request-schema unit tests.
3. **Node.js + pnpm** — the `@coreverse/db-client` TypeScript package (Orval codegen, type-checking, bundling).

You don't need all three to make every kind of change (a docs-only or SQL-only change doesn't need Node, for instance), but a full local setup installs all three so `pnpm verify`, `deno task test`, and `supabase test db` all pass before you open a pull request.

The pages in this section walk through:

- [Requirements](requirements.md) — exact tool versions.
- [Local Development](local-development.md) — first-time setup and the day-to-day loop.
- [Configuration](configuration.md) — environment variables and `.env` files.
- [Database Reset](database-reset.md) — rebuilding the local database from scratch.
