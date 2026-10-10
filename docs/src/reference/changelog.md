# Changelog

Release notes for the `@Coreverse-Game-Engine/db-client` package and the backend it describes. GitHub's auto-generated release notes (grouped by PR label, see `.github/release.yml`) remain the per-PR record; this page is the consumer-facing summary of what changed *for API and SDK users*.

## 0.5.4

Auth-email release. **No API shape changes and no database migration.** Only the `send-email` Edge Function changes, so redeploy that one function (`supabase functions deploy send-email`); the package version moves so that it matches the deployed backend and the spec. Run `pnpm run generate` and commit the result: the generated files carry the spec version in their header.

### Changed

- **Emailed links go to the Website, not to Supabase.** For `signup`, `recovery`, `magiclink` and `invite` the button in the email now points at the Website's confirm route, `<origin>/api/auth/confirm?token_hash=<hash>&type=<action>&next=<path>`, instead of Supabase Auth's `/auth/v1/verify`. The Website completes the action itself with `verifyOtp({ token_hash, type })`, which needs no PKCE code verifier. A link therefore also works when it is opened on another device or browser than the one that started the signup or reset, and it no longer depends on the project's Site URL.
- `<origin>` and `<path>` come from the `redirect_to` the Website passed to Supabase Auth (`emailRedirectTo` on signup, `redirectTo` on password reset); `next` is its path without query string or hash. The origin must be listed in `WEBSITE_ALLOWED_ORIGINS`. If it is not, or if `redirect_to` is not a URL, the email falls back to the Supabase verify link instead of failing. `email_change` keeps the Supabase verify link, and `reauthentication` has no link.
- `POST /auth/password-reset` is unchanged: `redirectTo` is still validated as `/{locale}/reset-password` on an allowed origin. The email link built from it now carries `next=/{locale}/reset-password`.

### Added

- `supabase/templates/confirmation.html` and `recovery.html`, wired in `supabase/config.toml`, so the local stack sends the same Website link (caught by Inbucket). The hosted project does not use them: its emails go through the hook.
- `scripts/ops/static-checks.mjs` check 9 fails if the hook's confirm path, the local templates and the `[auth.email.template.*]` entries drift apart, or if the hook stops passing `WEBSITE_ALLOWED_ORIGINS` to the link builder.
- `render.test.ts` covers the Website link for every supported action type, the `next` handling, and every fallback (origin not allowed, prefix-lookalike origin, empty `redirect_to`, `email_change`).

### Operations

- **The Website's `/api/auth/confirm` route must be live before the hook sends these links.** Deploying 0.5.4 changes nothing for users while the Send Email hook is not enabled in the Dashboard (Supabase's own mailer is still in use). Enable the hook only after the Website route is deployed; with the hook enabled, an older Website would send users to a missing page.
- Brevo wraps links in a click-tracking redirect domain when tracking is on for the account. Turn click tracking off for transactional email: a tracked link adds a hop to a one-time token link, and tracking domains are often flagged by mail filters.
- Supabase Auth's Redirect URLs must still list every Website origin: Auth replaces a `redirect_to` that is not listed with the Site URL, and the email would then be built for that origin.

## 0.5.3

SDK fix release. **No API shape changes, no database migration and no Edge Function redeploy**; the backend is identical to 0.5.2.

### Fixed

- **React hooks: every write operation was generated as a query.** `override.query.useQuery: true` in `orval.config.ts` made Orval emit `useQuery` hooks for POST, PATCH, PUT and DELETE operations too. `useCastVote`, `useCreateDiscussion`, `useReplyToDiscussion`, `useUpdateMyProfile`, `useDeleteMyAccount` and the other 33 write hooks therefore ran their request when the component mounted, cached the response under a `["POST", url, body]` key, and had no `mutate`. All 38 non-GET operations are now `useMutation` hooks (GET operations stay `useQuery` hooks) (`use<OperationId>(options?, queryClient?)`) with a matching `get<OperationId>MutationOptions` helper, and the `get<OperationId>QueryKey` / `get<OperationId>QueryOptions` exports of those operations are gone.
- **Generated headers described the 0.5.1 access model.** The generated files and `openapi/openapi.yaml` (`info.description`, `bearerAuth` description) still said the platform JWT gate is on for the public-content functions. They now describe the 0.5.2 model: signed-out reads work, writes need a session.

### Changed

- `orval.config.ts` derives every operation's verb from `openapi/paths/*.yaml` and pins its hook kind per operation (GET: `useQuery`, every other verb: `useMutation`), so a newly added operation cannot regress to the wrong kind.
- `tests/react.test.ts` checks, for every operation in the spec, that GET operations export `get<OperationId>QueryOptions` (and no mutation helper) and every other verb exports `get<OperationId>MutationOptions` (and no query helper).

### Migrating from 0.5.2

Hooks of write operations changed shape. Variables are passed to `mutate` / `mutateAsync` as one object: path parameters by name, the request body as `data`, query parameters as `params`.

```ts
// 0.5.2 (a query that fired on mount -- never worked as a write)
const vote = useCastVote(pollId, { option_id: optionId });

// 0.5.3
const vote = useCastVote();
vote.mutate({ pollId, data: { option_id: optionId } });
```

Hooks of GET operations, the plain fetch functions (`castVote(pollId, body)`) and the Zod schemas are unchanged.

## 0.5.2

Access-model release. **No API shape changes and no database migration**; the SDK surface is identical to 0.5.1 (the package version moves so that it matches the deployed backend and the spec). **Redeploy every Edge Function**: the JWT gate is a deploy-time setting.

### Access model: signed-out visitors can read public content

0.5.1 kept the platform JWT gate on for every function except `send-email`, `auth` and `profiles`, so a signed-out visitor got `401` on releases, news, events, FAQ, polls, discussions and docs. 0.5.2 reverses that for public content: the gate is now **off** for `releases`, `news`, `events`, `faq`, `polls`, `discussions` and `docs` (declared `verify_jwt = false` in `supabase/config.toml`). It stays **on** for `teams`, `requests` and `projects`, where every route needs a signed-in user.

- **Reading needs no token.** A signed-out `GET` on any public-content route answers `200`. Row visibility is unchanged and still decided by RLS: `anon` sees only published news and events, aggregated poll results, and never another user's vote.
- **Writing still needs a session, and says so clearly.** Every public-content function wraps its handler in `withTokenCheck` (`supabase/functions/_shared/caller.ts`): any write without a user token answers `401` with `{ "error": "unauthorized", "message": "A valid session is required." }`, and a malformed or expired token answers `401 unauthorized` on reads and writes alike. Clients should treat that `401` as "show the sign-in screen" (the Website does this for commenting, replying, voting and posting) and as "refresh the session" when a token was sent.
- **`GET /polls`** no longer queries the caller's own votes for a signed-out request. `anon` has no `select` grant on `poll_votes`, so that query would have failed on every public list request; `my_option_id` is `null` for signed-out callers, as documented.
- **`POST /docs/reindex`** no longer needs a JWT: the CI job sends only `X-Reindex-Token`, which is checked before anything is written. (0.5.1 listed this as a known limitation.)

### Changed

- `supabase/config.toml` declares `verify_jwt = false` for the seven public-content functions, with a comment explaining the model and why `teams`, `requests` and `projects` keep the gate.
- `scripts/ops/static-checks.mjs` pins the new list of ten gate-exempt functions, fails if a public-content function loses `withTokenCheck`, if anything but `docs` allows anonymous writes, if `docs` stops checking `X-Reindex-Token`, or if `teams`, `requests` or `projects` opt out of the gate.
- `scripts/ops/smoke.mjs` is rewritten for the new model. Signed-out reads must answer `200`; signed-out writes and a malformed token must answer `401 unauthorized` **from the function** (not the gateway); `POST /docs/reindex` without its secret must answer `401`; `teams`, `requests` and `projects` must still reject signed-out callers; a CORS preflight on a gated function is checked on the real project. `COREVERSE_TEST_TOKEN` is now optional and only adds signed-in checks.
- `scripts/ops/deploy.sh` verifies that all ten gate-exempt functions are declared in `config.toml`, and reminds you to redeploy every function and to check `WEBSITE_ALLOWED_ORIGINS`.
- OpenAPI: `info.description` and the `bearerAuth` description state the access model above. No operation changed. An operation marked "Public" now really is reachable signed out, except in `teams`, `requests` and `projects`.
- Docs: Security › Authentication, API › Authentication, Architecture › Security model, Development › Edge Functions and Operations › Production Verification describe the new model.

### Operations

- **Set `WEBSITE_ALLOWED_ORIGINS` for every origin that will call the API** (production, staging, previews; `http://localhost:3000` only for a development project), then `supabase secrets set`. Without the Website's origin in the list the browser blocks every response, signed in or not, even though the request reaches the function.
- Redeploy all functions (`deploy.sh --apply`), then run `scripts/ops/smoke.mjs`.

### Known limitations

- Signed-out reads have no per-caller rate limit of their own; only the platform's limits apply. `GET /discussions?q=` runs a full-text search, so put rate limiting in front of the read endpoints if they are abused.
- Because the gate is off, a forged token that looks like a user JWT passes the early `withTokenCheck` test and is rejected later, by PostgREST or `auth.getUser()`, with that layer's status code rather than the function's `unauthorized` body. It never reaches data.
- The Deno tests, pgTAP suite and the smoke test against the real project have to be run on your side; they could not run in the environment this change was prepared in.

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
