# Troubleshooting

## `pnpm publish` fails with `403 Forbidden` / `Permission permission_denied: The requested installation does not exist`

Seen on the very first publish of `@Coreverse-Game-Engine/db-client` after the `Coreverse-Game-Engine` GitHub org and package scope were set up. The build, typecheck, and `pnpm verify` steps all succeeded — only the actual `pnpm publish --no-git-checks` call to GitHub Packages failed, alongside an OIDC warning (`ERR_PNPM_ID_TOKEN_GITHUB_WORKFLOW_INCORRECT_PERMISSIONS`). This points to the org/repo's GitHub Packages and Actions permissions not yet being fully configured on the GitHub side (repository/organization settings), not a problem with the workflow file or the package itself. Check:

- The repository's Actions → General → Workflow permissions (needs `packages: write`).
- That the `Coreverse-Game-Engine` organization actually allows the publishing repository to write packages under its scope.

## `supabase test db` fails after a fresh `db reset`

Usually means either a new migration doesn't match its corresponding pgTAP test's assumptions (fixture data, expected row counts) or a policy was changed without updating the RLS test that exercises it. Re-run `supabase db lint` first — it often catches a schema issue distinct from a genuine test logic problem.

## `pnpm verify` fails on the drift check (`git diff --exit-code src/generated`)

The OpenAPI contract changed but `pnpm generate` wasn't run and committed afterward. Run `pnpm generate`, review the diff, and commit `src/generated/` alongside the contract change — never hand-edit generated files to make the diff go away.

## RLS policy seems to "not apply" during manual testing

Check whether you're testing as the `postgres` superuser or another role that bypasses RLS by default (e.g. via `psql` without `set role`) — RLS is not evaluated for roles with `BYPASSRLS`. Use the [RLS Testing](../development/rls-testing.md) pattern (`set local role authenticated; set local request.jwt.claims ...`) to actually exercise policies.

## Edge Function answers `500 internal_error` / `query_error` on rate-limited or avatar routes while plain reads work

`POST /discussions`, replies, polls, news, `GET /profiles/username-availability`, `POST /auth/password-reset` and `POST/DELETE /profiles/me/avatar` are the routes that use the service-role client; ordinary reads use the caller's own client. If only those fail, look in the function logs for `permission denied for schema identity` (`[postgrest]` or `[internal_error]` line). `service_role` bypasses RLS but not privilege checks, and Supabase grants it privileges only on `public`, so each API schema needs an explicit grant (migration `20261015090000_grant_service_role_api_schemas`). Confirm with `select has_schema_privilege('service_role', 'identity', 'USAGE');` in the SQL editor, then run `supabase db push`.
