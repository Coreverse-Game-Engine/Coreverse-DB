# Deployment

Two independent things get deployed from this repository: the **Supabase backend** (migrations + Edge Functions) and the **`@coreverse/db-client` npm package**.

## Backend (Supabase)

```bash
supabase db push       # apply pending migrations to the linked project
supabase functions deploy <name>   # deploy one Edge Function
```

CI's `ci.yml` workflow validates migrations and functions (lint, pgTAP, Deno tests) on every push/PR, but does **not** itself push to the hosted project — that's a deliberate manual step, matching the project's "no surprise production changes" policy.

## Client package (`@coreverse/db-client`)

Publishing is **tag-triggered, not automatic on every merge**:

1. A maintainer bumps the version locally: `pnpm version <patch|minor|major>`.
2. They push the resulting git tag.
3. `publish.yml` in `.github/workflows/` runs: verifies the tag matches `package.json`'s version, builds (`pnpm run build`), and publishes to GitHub Packages under the `@coreverse` scope.

CI's only responsibility in this flow is the tag/version match check and the build+publish step — it never writes a version bump itself. See [Environments](environments.md) for where each thing is deployed to, and [Troubleshooting](troubleshooting.md) for the first-publish permission issue this pipeline has hit before.
