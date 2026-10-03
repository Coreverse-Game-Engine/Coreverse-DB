# Deployment

Two independent things get deployed from this repository: the **Supabase backend** (migrations + Edge Functions) and the **`@Coreverse-Game-Engine/db-client` npm package**.

## Backend (Supabase)

```bash
supabase db push       # apply pending migrations to the linked project
supabase functions deploy <name>   # deploy one Edge Function
```

CI's `ci.yml` workflow validates migrations and functions (lint, pgTAP, Deno tests) on every push/PR, but does **not** itself push to the hosted project — that's a deliberate manual step, matching the project's "no surprise production changes" policy. For a full release, follow [Production Verification](production-verification.md): `scripts/ops/verify-local.sh` (gates), `scripts/ops/deploy.sh` (guarded rollout), `scripts/ops/smoke.mjs` (post-deploy smoke test).

## Client package (`@Coreverse-Game-Engine/db-client`)

Publishing is **tag-triggered, not automatic on every merge**:

1. A maintainer bumps the version locally: `pnpm version <patch|minor|major> --no-git-tag-version`, then sets the same version in `openapi/openapi.yaml` (`info.version`) — `pnpm run check:version-sync` (part of `pnpm run verify`) fails if the two differ — regenerates (`pnpm run generate`), and commits. Tag that commit (`git tag vX.Y.Z`).
2. They push the tag.
3. `publish.yml` in `.github/workflows/` runs: verifies the tag matches `package.json`'s version, builds (`pnpm run build`), and publishes to GitHub Packages under the `@Coreverse-Game-Engine` scope.

CI's only responsibility in this flow is the tag/version match check and the build+publish step — it never writes a version bump itself. See [Environments](environments.md) for where each thing is deployed to, and [Troubleshooting](troubleshooting.md) for the first-publish permission issue this pipeline has hit before.
