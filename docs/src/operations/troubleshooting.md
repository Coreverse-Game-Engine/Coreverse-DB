# Troubleshooting

## `pnpm publish` fails with `403 Forbidden` / `Permission permission_denied: The requested installation does not exist`

Seen on the very first publish of `@coreverse/db-client` after the `coreverse` GitHub org and package scope were set up. The build, typecheck, and `pnpm verify` steps all succeeded — only the actual `pnpm publish --no-git-checks` call to GitHub Packages failed, alongside an OIDC warning (`ERR_PNPM_ID_TOKEN_GITHUB_WORKFLOW_INCORRECT_PERMISSIONS`). This points to the org/repo's GitHub Packages and Actions permissions not yet being fully configured on the GitHub side (repository/organization settings), not a problem with the workflow file or the package itself. Check:

- The repository's Actions → General → Workflow permissions (needs `packages: write`).
- That the `coreverse` organization actually allows the publishing repository to write packages under its scope.

## `supabase test db` fails after a fresh `db reset`

Usually means either a new migration doesn't match its corresponding pgTAP test's assumptions (fixture data, expected row counts) or a policy was changed without updating the RLS test that exercises it. Re-run `supabase db lint` first — it often catches a schema issue distinct from a genuine test logic problem.

## `pnpm verify` fails on the drift check (`git diff --exit-code src/generated`)

The OpenAPI contract changed but `pnpm generate` wasn't run and committed afterward. Run `pnpm generate`, review the diff, and commit `src/generated/` alongside the contract change — never hand-edit generated files to make the diff go away.

## RLS policy seems to "not apply" during manual testing

Check whether you're testing as the `postgres` superuser or another role that bypasses RLS by default (e.g. via `psql` without `set role`) — RLS is not evaluated for roles with `BYPASSRLS`. Use the [RLS Testing](../development/rls-testing.md) pattern (`set local role authenticated; set local request.jwt.claims ...`) to actually exercise policies.
