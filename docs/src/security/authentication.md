# Authentication

Authentication is entirely delegated to **Supabase Auth** (`auth.users`). Coreverse DB:

- Never stores a password, hash, or credential of any kind.
- Reads the caller's identity from the JWT Supabase Auth issues, via `auth.uid()` inside PostgreSQL and via the `Authorization: Bearer <JWT>` header at the Edge Function layer.
- Auto-provisions an `identity.profiles` row the moment a new `auth.users` row appears (`identity.handle_new_auth_user()`, an `after insert` trigger on `auth.users`) — so "signed up" and "has a Coreverse profile" are the same moment.

## In Edge Functions

Each function builds a Supabase client scoped to the caller by forwarding their `Authorization` header (`_shared/supabase-client.ts`). There is no separate application-level session or token — the same JWT that authenticates against Supabase Auth is what RLS policies evaluate via `auth.uid()`.

## The platform JWT gate

Supabase verifies the `Authorization: Bearer <JWT>` header **before** an Edge Function runs (`verify_jwt`, on by default). Coreverse DB keeps that gate **on** for every function except `send-email`, `auth` and `profiles` (declared in `supabase/config.toml`). The consequence is deliberate: **a signed-out visitor cannot read anything.** Releases, news, events, FAQ, polls, discussions and docs all answer `401` (`Missing authorization header`) without a valid session, even though the functions themselves and the RLS policies would let `anon` read published rows.

That is why the API reference marks some operations "Public": it describes what the function and RLS require of the *caller* (no particular user), not what the gateway lets through. For clients, the rule is simple — send the signed-in user's Supabase access token on every request, and treat a signed-out state as "show a sign-in prompt", not "call the public endpoint".

### Signed-out operations

Exactly two operations work without a JWT, because their callers cannot have one:

| Operation                             | Function   | Why it must be reachable signed out                         | Protection                                                                                                                                                               |
|---------------------------------------|------------|-------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `POST /auth/password-reset`           | `auth`     | The person is recovering an account they cannot sign in to  | Rate limited per email (3 / 15 min) and per IP (10 / hour); identical response whether or not the account exists; `redirectTo` checked against `WEBSITE_ALLOWED_ORIGINS` |
| `GET /profiles/username-availability` | `profiles` | The signup form checks a username before the account exists | Rate limited per IP (30 / min)                                                                                                                                           |

`auth` is that one route only. `profiles` also serves `/profiles/me` and `/profiles/me/avatar`; with the gate off for the function, those routes are protected by the check inside it — `supabase.auth.getUser()` followed by `401 unauthorized` — and by RLS. `scripts/ops/static-checks.mjs` pins the list of exempt functions and fails if that check disappears, and `scripts/ops/smoke.mjs` confirms against a running API that signed-out reads are rejected and that `/profiles/me` answers `401` from the function itself.

Adding a function to this list is a security decision: it removes the gateway as a second line of defence for that function. Do it only for an operation that is meant to work signed out, and update the check and this page in the same change.

## Other exceptions to user-JWT authentication

Two operations don't authenticate a user at all:

- **`/docs/reindex`** — authenticated by a shared `X-Reindex-Token` secret, because the caller is CI in another repository, not a signed-in person. See [Authorization](authorization.md). The `docs` function is **not** exempt from the platform JWT gate, so the CI job must also send a JWT the gateway accepts; the shared secret is checked in addition to it, not instead of it.
- **`/projects/{id}/download`** — the *initial* access check still uses the caller's own JWT; only the signed-URL minting step afterward uses a service-role client.
