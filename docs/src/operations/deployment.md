# Deployment

Two independent things get deployed from this repository: the **Supabase backend** (migrations + Edge Functions) and the **`@Coreverse-Game-Engine/db-client` npm package**.

## Backend (Supabase)

```bash
supabase db push       # apply pending migrations to the linked project
supabase functions deploy <name>   # deploy one Edge Function
```

CI's `ci.yml` workflow validates migrations and functions (lint, pgTAP, Deno tests) on every push/PR, but does **not** itself push to the hosted project — that's a deliberate manual step, matching the project's "no surprise production changes" policy. For a full release, follow [Production Verification](production-verification.md): `scripts/ops/verify-local.sh` (gates), `scripts/ops/deploy.sh` (guarded rollout), `scripts/ops/smoke.mjs` (post-deploy smoke test).

On Windows use the PowerShell ports `scripts/ops/verify-local.ps1` and `scripts/ops/deploy.ps1` (`pwsh scripts/ops/deploy.ps1 -Apply`; `-Only faq,auth` redeploys a subset, `-UseApi` bundles server-side without Docker).

> **Import map.** `supabase functions deploy` cannot see the repo-root `deno.json` (it only drives `deno test` / `deno fmt`), so bare imports (`@std/http/server`, `zod`, `@supabase/supabase-js`, `@std/assert`) are resolved from `supabase/functions/import_map.json`, which `deploy.sh` / `deploy.ps1` pass explicitly with `--import-map` (do the same if you deploy by hand: `supabase functions deploy <n> --import-map supabase/functions/import_map.json`). Keep its `imports` identical to the root `deno.json`. Do **not** name it `deno.json`: Deno treats a nested `deno.json` as its own config for `deno fmt` / `deno lint`, which replaces the root formatting settings with defaults and makes `deno fmt --check` fail. `scripts/ops/static-checks.mjs` enforces both rules. Symptom of a missing map: `Relative import path "@std/http/server" not prefixed with / or ./ or ../`.
