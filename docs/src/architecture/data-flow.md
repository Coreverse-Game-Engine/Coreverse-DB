# Data Flow

Walking a single request end to end: **a signed-in user casts a poll vote.**

1. **Client** sends `POST /polls/{pollId}/vote` with `Authorization: Bearer <JWT>` and a JSON body `{ "option_id": "..." }`.
2. **`polls` Edge Function** parses and validates the body against its Zod schema (`castVoteBody`). If it fails validation, the function returns a 400 immediately — Postgres is never reached.
3. The function builds a **user-scoped Supabase client**, forwarding the caller's JWT.
4. It issues an `insert` into `content.poll_votes` using that client.
5. **RLS** on `content.poll_votes` allows the insert only for the calling user (`user_id = auth.uid()`, enforced via `with check`).
6. A **`before insert` trigger** (`content.enforce_vote_option_matches_poll`) checks that `option_id` actually belongs to `poll_id` — a data-integrity rule that can't be expressed as a plain foreign key — and raises an exception (`42501`/`check_violation`) if not.
7. A **primary key** on `(poll_id, user_id)` prevents a second vote from the same user on the same poll at the database level.
8. If Postgres returns an error, the function maps it to an HTTP status with `statusForPgError` (a `42501`-coded error becomes 403; anything else becomes 400) and returns it via `errorResponse`.
9. On success, the function returns `201` with the created vote's shape (`castVote201`).

Reading aggregated results (`GET /polls/{pollId}/results`) is simpler: it's a public read that calls `content.poll_results()`, a `stable` SQL function that returns anonymous vote counts per option — never individual `poll_votes` rows, so a caller can never see who voted for what, even though the function itself has to read across every user's votes to produce the aggregate.

This same shape — Zod validation → user-scoped client (or service-role, where explicitly justified) → RLS/functions/triggers → mapped error response — is how every write in the API works. See [System Architecture](system-architecture.md) for the component view and [Security Model](security-model.md) for why authorization lives at the database layer.
