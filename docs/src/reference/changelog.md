# Changelog

Release notes for the `@Coreverse-Game-Engine/db-client` package and the backend it describes. GitHub's auto-generated release notes (grouped by PR label, see `.github/release.yml`) remain the per-PR record; this page is the consumer-facing summary of what changed *for API and SDK users*.

## 0.5.1

Access-model and operations release. **No API shape changes and no database migration**; the SDK surface is identical to 0.5.0 (the package version moves only so that it matches the deployed backend and the spec).

### Access model: signed-out visitors cannot read data

The platform JWT gate stays **on** for every Edge Function except `send-email`, `auth` and `profiles`. A signed-out caller is therefore rejected with `401` on releases, news, events, FAQ, polls, discussions and docs, even for operations the API reference marks "Public" (that label means "no particular user is required inside the function"). Clients must send the signed-in user's token and show a sign-in prompt when there is no session. See [Security › Authentication](../security/authentication.md#the-platform-jwt-gate).

### Changed

- **Two signed-out operations are now reachable:** `[functions.auth]` and `[functions.profiles]` are declared `verify_jwt = false` in `supabase/config.toml`, so `POST /auth/password-reset` and `GET /profiles/username-availability` work without a session. With the platform's default gate (as 0.5.0's `config.toml` left it for these two functions) both are rejected for a signed-out caller, so password reset and the signup username check cannot work. **Redeploy both functions** (`supabase functions deploy auth` and `supabase functions deploy profiles`, or `deploy.sh --apply`) for this to take effect.
- **`profiles` authenticates its own routes.** With the gate off for that function, `/profiles/me` and `/profiles/me/avatar` rely on the in-function `supabase.auth.getUser()` check (unchanged) and RLS. `static-checks.mjs` now fails if that call is removed or if the list of gate-exempt functions changes.
- **`createUserClient` no longer forwards an empty `Authorization` header** when the request has none; supabase-js's default `Bearer <anon key>` applies, so signed-out requests to the username check run as `anon` instead of carrying an unparseable credential.
- **`WEBSITE_ALLOWED_ORIGINS` entries are normalized to bare origins**, so `https://coreverse.dev/` (trailing slash) or an entry with a path now matches the browser's `Origin` instead of silently failing CORS and `redirectTo` validation. The value itself is a deployment secret: set every Website origin (production, staging, any preview or LAN address you test from) with `supabase secrets set`, and keep Supabase Auth's Redirect URLs in step.
- **OpenAPI:** `info.description` and the `bearerAuth` description state the access model above. No operation changed.

### Operations

- `scripts/ops/smoke.mjs` is rewritten for the new model: anonymous reads must be rejected, the two signed-out operations must work, `/profiles/me` must answer `401` from the function (not the gateway), and data-reading checks need `COREVERSE_TEST_TOKEN` (skipped without it). `COREVERSE_ANON_KEY` is no longer used.
- `scripts/ops/deploy.sh` checks that `send-email`, `auth` and `profiles` are declared in `config.toml`.
- [Production Verification](../operations/production-verification.md) documents the three exempt functions, the origin secret and how to read each gateway failure.

### Known limitations

- Because the gate is on for `docs`, the CI job that calls `POST /docs/reindex` must also send a JWT the gateway accepts; the `X-Reindex-Token` secret is checked in addition, not instead.
- Whether the platform lets a browser's `OPTIONS` preflight through to a gated function has to be confirmed on the real project (the smoke test's CORS check does this); it could not be verified offline.

## 0.5.0

Two new content domains (events, FAQ), cursor pagination on the remaining list endpoints, account deletion, and several contract additions. **It contains two breaking changes for SDK consumers** — read the list below before upgrading.

### Breaking changes

- **Four list endpoints return `{ items, next_cursor }`** instead of a bare array: `GET /news`, `GET /polls`, `GET /discussions` and `GET /discussions/{id}/replies`. Fetch the next page by passing `next_cursor` back as `?cursor=` (`limit` is 1–100, default 20). The generated functions' and hooks' return types change accordingly. `GET /releases` (offset/limit, bare array), `GET /faq` and `GET /docs/sources` are unchanged. See [Conventions › Pagination](../api/conventions.md#pagination).
- **`GET /discussions` items are `DiscussionSummary`**, which carries a truncated `excerpt` instead of the full `body`. Fetch a single discussion (`GET /discussions/{id}`) for the body.

### Changed (additive response fields)

These add fields rather than removing any, but responses are validated by the generated Zod schemas, so regenerate and upgrade the package together with the backend.

- **Discussions** gained a nested `author` (`{ id, username, avatar_url }`), `reply_count` and `last_activity_at`; **replies** gained `author` and `edited_at`.
- **News** gained `author`, an optional `summary` and `cover_image_url`.
- **Polls** gained `is_closed`, `total_votes`, `my_option_id`, and optional per-option `results` via `?include=results`.
- **`GET /profiles/me`** now includes `platform_role` (`"admin"`, `"moderator"` or `null`), and `avatar_url` carries a `?v=<updated_at>` cache-busting parameter.
- **New error codes** in the `Error` schema: `account_has_content`, `invalid_event_id`, `invalid_faq_id`, `invalid_locale`.
- **Rate limits (`429` + `Retry-After`)** on creating a discussion (10/hour), posting a reply (30/hour) and casting a poll vote (60/hour), per user.

### Added

- **Events** (`/events`) with `upcoming` filtering, slug lookup and an external `registration_url`. See [API › Events](../api/resources/events.md).
- **FAQ** (`/faq`) with per-locale translations, atomic creation, and per-locale `PUT`/`DELETE`. See [API › FAQ](../api/resources/faq.md).
- **`DELETE /profiles/me`** — account deletion, with `409 account_has_content` and an itemized `blockers` array when the user still owns a team or project or authors content.
- **`GET /profiles/username-availability`** — public, rate limited (30/min per IP).
- **`GET /discussions/categories`**, and `sort=active|replies` / `q` search on `GET /discussions`.
- **SDK**: `events` and `faq` endpoint functions, `eventsSchemas` / `faqSchemas` Zod namespaces (from `@Coreverse-Game-Engine/db-client`) and their TanStack Query hooks (from `@Coreverse-Game-Engine/db-client/react`).

### Database

- New migrations: events and FAQ domains, `username_availability`, `account_deletion_readiness` (relaxes `ON DELETE` on several foreign keys so deletion is possible once blockers are resolved). Apply with `supabase db push`; take a backup first. See [Production Verification](../operations/production-verification.md).
- `send-email` is declared `verify_jwt = false` in `supabase/config.toml` (the Auth hook carries a signature, not a user JWT).

### Operations

- New runbook and scripts for verifying and rolling out a release: `scripts/ops/verify-local.sh`, `scripts/ops/deploy.sh`, `scripts/ops/smoke.mjs`, `scripts/ops/static-checks.mjs`.
- The package is published as `@Coreverse-Game-Engine/db-client`; `publish.yml` no longer hard-codes a different scope.

### Known limitations

- `email_change` auth e-mails are not localized yet (generic English fallback).
- Reports/complaints on content and changing a cast poll vote are not implemented.
