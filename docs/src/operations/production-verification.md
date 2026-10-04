# Production Verification (v0.5.x rollout)

The runbook for taking a backend release from "CI is green" to "verified in production". It has three parts that map to the scripts in `scripts/ops/`:

| Part   | What                                          | Script                        |
|--------|-----------------------------------------------|-------------------------------|
| **6A** | Run every local/CI gate                       | `scripts/ops/verify-local.sh` |
| **6B** | Roll the backend out to the hosted project    | `scripts/ops/deploy.sh`       |
| **6C** | Smoke test + manual checks against production | `scripts/ops/smoke.mjs`       |

6A and the *preparation* half of 6B (backup, secrets, dashboard review) are independent and can run in parallel. 6C needs 6B finished.

## 0. Before anything: secrets hygiene

`.env.local`, `supabase/.env.production` and `supabase/functions/.env.local` hold real credentials. They are gitignored, but never include them in archives, tickets or chats. If any of them has left your machine, rotate **before** deploying: service-role/secret key, database password, `BREVO_API_KEY`, `SEND_EMAIL_HOOK_SECRET` (regenerate in Dashboard → Authentication → Hooks), `DOCS_REINDEX_TOKEN`. Then update the files and re-upload with `deploy.sh --apply --secrets`.

## 6A — Verification gates

```bash
bash scripts/ops/verify-local.sh          # needs pnpm, deno, supabase CLI + Docker
```

Runs, in CI order: `static-checks.mjs` and `check-version-sync`, `pnpm install --frozen-lockfile`, `redocly lint`, `pnpm run verify` (generate → no drift → typecheck), `vitest`, `tsup` build, `deno test`, `deno fmt --check`, `supabase db lint` and `supabase test db` (pgTAP).

A step whose tool is missing is reported as **SKIP**, never PASS, and the script exits non-zero (`ALLOW_SKIP=1` to accept, `SKIP_PGTAP=1` when Docker is unavailable). Do not proceed to 6B with unreviewed skips for `redocly lint`, `pnpm run verify` or pgTAP.

`scripts/ops/static-checks.mjs` needs only Node. It checks `$ref` targets against `orval.config.ts`'s allow-list, OpenAPI paths against Edge Function directories, tags against the SDK barrels, `SUMMARY.md` against the pages on disk, version sync, migration filename hygiene, and stale migration filenames cited in docs or comments. Barrel gaps are warnings until Faz 7 (`--strict` makes them fatal).

Known: if `pnpm run verify` fails at `git diff --exit-code src/generated`, regenerate and commit `src/generated` — that is drift detection working, not a bug.

## 6B — Rollout

Preparation (parallel with 6A):

1. Take a production backup ([Database Backup](database-backup.md)) and note where it is.
2. `supabase link --project-ref <ref>` and confirm `supabase/.temp/project-ref`.
3. Confirm secrets exist (`supabase secrets list`): `WEBSITE_ALLOWED_ORIGINS`, `SEND_EMAIL_HOOK_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `DOCS_REINDEX_TOKEN`. `WEBSITE_ALLOWED_ORIGINS` must list every Website origin that will call the API — production and, if used, staging (scheme + host + port; a trailing slash is tolerated but not needed). It is a secret, not part of a deploy: changing it needs `supabase secrets set WEBSITE_ALLOWED_ORIGINS=<comma-separated list>` (or `deploy.sh --apply --secrets` after editing `supabase/.env.production`), then re-check with the smoke test's CORS check (`COREVERSE_ALLOWED_ORIGIN`) for each origin. Supabase Auth's Redirect URLs must list the same origins.
4. Review the destructive-ish migration: `20261003095018_account_deletion_readiness.sql` changes `ON DELETE` on several foreign keys. Run it on a copy of production data first if you can (restore the backup into a scratch project), and check the row counts in the affected tables are unchanged afterwards.

Execution (after 6A is green, from a clean commit):

```bash
bash scripts/ops/deploy.sh                 # dry run: plan + `supabase db push --dry-run`
bash scripts/ops/deploy.sh --apply         # confirms each mutating step
```

Order matters: migrations → secrets → functions. Three functions are deployed with the platform JWT gate off, all declared in `supabase/config.toml`: `send-email` (Auth's hook call carries a signature, not a user JWT), `auth` (password reset is used by someone who cannot sign in) and `profiles` (username availability is checked by the signup form before an account exists). Every other function keeps the gate on, so a signed-out visitor gets `401` from the platform on all other routes. See [Security › Authentication](../security/authentication.md#the-platform-jwt-gate).

Dashboard checks that live outside the repository (`config.toml` is local-only):

- Authentication → Hooks → Send Email: enabled, URL `<project>/functions/v1/send-email`, secret equals `SEND_EMAIL_HOOK_SECRET`.
- Authentication → URL Configuration: Site URL and Redirect URLs cover the Website origin(s), including the `/*/reset-password` pattern.
- Authentication → Rate limits and password policy reviewed; local values in `config.toml` are not applied to the hosted project.

The one-off `supabase/maintenance/drop_legacy_identity_objects.sql` is **not** part of this rollout. Run its sections by hand only once their preconditions hold in production.

## 6C — Smoke test and manual checks

Automated, read-only (no data changes, no email sent). `COREVERSE_TEST_TOKEN` (any signed-in user's access token) is needed for every check that reads data, because the gate rejects signed-out reads; those checks are **skipped** without it, and a run with skips is not a complete verification:

```bash
COREVERSE_BASE_URL=https://<ref>.supabase.co/functions/v1 \
COREVERSE_ALLOWED_ORIGIN=https://<website-origin> \
COREVERSE_TEST_TOKEN=<test-user-jwt> \
node scripts/ops/smoke.mjs
```

It covers: the gateway in both directions (anonymous reads must be rejected with `401`; the two signed-out operations must work; `/profiles/me` must answer `401` from the function itself, not from the gateway), then, with a token, events and FAQ (including `locale=tr`), the `{items, next_cursor}` envelope on news/polls/discussions/events with cursor following, discussion sort/search/categories, username availability, unauthenticated 401s (including `DELETE /profiles/me`), error body shape, and CORS for the allowed and a foreign origin. The same script works against `supabase start` by pointing `COREVERSE_BASE_URL` at `http://127.0.0.1:54321/functions/v1`.

**If a gateway check fails:**

- *"signed-out callers can read data"* — a function that should be gated was deployed with the gate off. Check `[functions.*]` in `supabase/config.toml` (only `send-email`, `auth` and `profiles` may have `verify_jwt = false`) and how that function was deployed (`--no-verify-jwt` on the command line overrides the file).
- *"rejected before the function"* on `username-availability` or `password-reset` — `profiles` or `auth` was deployed with the gate on. Redeploy it so `config.toml` applies. Until then the signup form cannot check usernames and nobody can start a password reset.
- *"preflight rejected by the JWT gate"* — browsers send no `Authorization` header on `OPTIONS`, so every browser call to that function would fail. Confirm this on the real project before shipping; if the platform rejects preflights for gated functions, the Website cannot call them cross-origin and this needs a design change, not a redeploy.

Manual checks (need a human, a test account, or a mailbox):

| Check                                           | How                                                                                                                                | Expect                                                                                                                |
|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Account deletion with blockers                  | `DELETE /profiles/me` as a test user who owns a team or has authored news/discussions                                              | `409` with an itemized `blockers` array; account still exists                                                         |
| Account deletion without blockers               | `DELETE /profiles/me` as a fresh test user (optionally after a poll vote)                                                          | `204`/success; user gone from Auth; no orphan rows                                                                    |
| Signed-out browser, Website origin              | Open the Website signed out, with the browser's network tab open; use the signup form's username field and the password-reset form | Username check answers `200`; reset answers `200` and sends mail; no other DB call is made while signed out           |
| Signed-in browser, Website origin               | Sign in, open the community and FAQ areas                                                                                          | Calls succeed with the user's token; no CORS errors for any listed Website origin                                     |
| Recovery e-mail                                 | `POST /auth/password-reset` for a test mailbox, `en` and `tr`                                                                      | Localized mail from the configured sender, link lands on the Website reset page                                       |
| Signup / magic link / invite / reauthentication | Trigger each that is enabled                                                                                                       | en/tr copy; any other locale falls back to en                                                                         |
| `email_change`                                  | Change the e-mail on a test user                                                                                                   | Generic English fallback mail with a working link (deliberately not localized yet); decide whether that is acceptable |
| Avatar                                          | Upload then `DELETE /profiles/me/avatar`                                                                                           | URL cache-busts on change; delete returns to no avatar                                                                |
| Writes from a moderator                         | Create and publish an event and a FAQ item, then delete them                                                                       | Visible in `GET /events` and `GET /faq`; gone after delete                                                            |

Record results (pass/fail per row, commit hash, date) in the release PR. Any failure is a stop: roll forward with a fix, or restore per [Database Restore](database-restore.md) if a migration misbehaved.
