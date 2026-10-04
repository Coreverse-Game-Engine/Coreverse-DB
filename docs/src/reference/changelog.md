# Changelog

Release notes for the `@Coreverse-Game-Engine/db-client` package and the backend it describes. GitHub's auto-generated release notes (grouped by PR label, see `.github/release.yml`) remain the per-PR record; this page is the consumer-facing summary of what changed *for API and SDK users*.

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
