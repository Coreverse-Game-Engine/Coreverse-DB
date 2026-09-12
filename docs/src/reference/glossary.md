# Glossary

- **Domain schema** — one of `releases`, `identity`, `content`, `docs`: a PostgreSQL schema owning one bounded area of the application.
- **`private` schema** — internal `SECURITY DEFINER` helper functions (`is_team_member`, `is_team_admin`) used inside RLS policies; never exposed to clients.
- **Platform role** — an `identity.platform_roles` entry (`admin`/`moderator`), gating who can write `content.news` and moderate `content.discussions`/`content.polls`. Not the same thing as a **team role**.
- **Team role** — a `team_members.role` value (`owner`/`admin`/`member`), scoped to one specific team, unrelated to platform roles.
- **Membership request** — a row in `identity.team_membership_requests`; one of three `type`s: `join_request`, `invite`, `ownership_transfer`.
- **RLS (Row Level Security)** — PostgreSQL's per-row access-control mechanism; the primary authorization boundary in this codebase.
- **`SECURITY DEFINER`** — a PostgreSQL function attribute making it run with the privileges of its owner rather than its caller, used for both privileged writes and RLS-recursion-avoiding helpers.
- **Edge Function** — a Deno-based serverless HTTP handler deployed via Supabase, one per API resource/tag.
- **Contract-first** — the practice of defining `openapi/` before/alongside implementation and generating the TypeScript client from it, rather than hand-writing client code against whatever the API happens to do.
- **Drift (client codegen)** — a mismatch between the committed `src/generated/` and what `pnpm generate` would currently produce from `openapi/`; caught by `pnpm verify`.
- **Rate limiting (fixed-window)** — `identity.hit_rate_limit()`'s strategy: count hits for a key within a trailing time window and refuse once a cap is reached, rather than a token-bucket or sliding-log approach. Currently backs `POST /auth/password-reset` only.
