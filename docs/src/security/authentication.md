# Authentication

Authentication is entirely delegated to **Supabase Auth** (`auth.users`). Coreverse DB:

- Never stores a password, hash, or credential of any kind.
- Reads the caller's identity from the JWT Supabase Auth issues, via `auth.uid()` inside PostgreSQL and via the `Authorization: Bearer <JWT>` header at the Edge Function layer.
- Auto-provisions an `identity.profiles` row the moment a new `auth.users` row appears (`identity.handle_new_auth_user()`, an `after insert` trigger on `auth.users`) — so "signed up" and "has a Coreverse profile" are the same moment.

## In Edge Functions

Each function builds a Supabase client scoped to the caller by forwarding their `Authorization` header (`_shared/supabase-client.ts`). There is no separate application-level session or token — the same JWT that authenticates against Supabase Auth is what RLS policies evaluate via `auth.uid()`.

## The platform JWT gate

Supabase can verify the `Authorization: Bearer <JWT>` header **before** an Edge Function runs (`verify_jwt`, on by default). Coreverse DB turns that gate **off** for the functions below (declared in `supabase/config.toml`) and keeps it **on** for `teams`, `requests` and `projects`, where every route needs a signed-in user.

| Function                                                              | Gate | Why                                                                                       |
|-----------------------------------------------------------------------|------|-------------------------------------------------------------------------------------------|
| `releases`, `news`, `events`, `faq`, `polls`, `discussions`, `docs`   | off  | A signed-out visitor may **read** public content                                          |
| `auth`                                                                | off  | Password reset is used by someone who cannot sign in                                      |
| `profiles`                                                            | off  | The signup form checks a username before the account exists                               |
| `send-email`                                                          | off  | Supabase Auth's hook call carries a signature, not a user JWT                             |
| `teams`, `requests`, `projects`                                       | on   | Every route needs a signed-in user; the gateway stays a second line of defence            |

So a signed-out visitor **can read** releases, published news, events, FAQ, polls (with aggregated results), discussions and replies, and docs search. They cannot write anything. What a reader sees is decided by RLS exactly as before: `anon` only ever gets `published` news and events, never drafts, and never another user's vote.

### How the public-content functions authenticate without the gate

Taking the gateway away would let a bad token or an anonymous write reach the function's own code, so every public-content function wraps its handler in `withTokenCheck` (`supabase/functions/_shared/caller.ts`):

- **No `Authorization` header, or only the project's anon key** → treated as signed out. Reads go through; the request runs as `anon`.
- **A token that is not a usable JWT, or has expired** → `401 unauthorized` before anything else runs, on reads as well as writes. The client should refresh the session.
- **Any write (`POST`, `PUT`, `PATCH`, `DELETE`) without a user token** → `401 unauthorized` (`A valid session is required.`). This is the response a client turns into "show the sign-in screen"; the Website does exactly that when a signed-out visitor tries to comment, reply, vote or post.
- A write with a user token then continues to the route's own checks: `supabase.auth.getUser()` (which asks GoTrue, so a forged token fails here), role checks through RLS, rate limits.

`classifyCaller` decodes the token payload **without** verifying the signature. That only decides whether to answer `401` earlier; it never grants anything. Every authorization decision uses the verified token, via PostgREST and RLS or `auth.getUser()`.

`docs` is the one function that lets an anonymous write through (`{ anonymousWrites: true }`), because `POST /docs/reindex` is authenticated by the `X-Reindex-Token` shared secret instead of a user JWT.

`profiles` is not wrapped in `withTokenCheck`: it serves one public route (`GET /profiles/username-availability`, rate limited per IP) and authenticates `/profiles/me` and `/profiles/me/avatar` itself with `supabase.auth.getUser()` followed by `401 unauthorized`. `auth` is one route only (`POST /auth/password-reset`) and is rate limited per email and per IP.

| Signed-out operation                  | Function   | Protection                                                                                                                                                               |
|---------------------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| All `GET` routes of the public-content functions | see above | Read-only; row visibility is RLS (`anon` policies), results are aggregates; unusable tokens are rejected                                                   |
| `POST /auth/password-reset`           | `auth`     | Rate limited per email (3 / 15 min) and per IP (10 / hour); identical response whether or not the account exists; `redirectTo` checked against `WEBSITE_ALLOWED_ORIGINS` |
| `GET /profiles/username-availability` | `profiles` | Rate limited per IP (30 / min)                                                                                                                                           |

Signed-out reads have **no per-caller rate limit** of their own; only the platform's limits apply. Put a CDN or the platform's rate limiting in front if the read endpoints are ever abused.

`scripts/ops/static-checks.mjs` pins the exact list of gate-exempt functions, fails if a public-content function loses `withTokenCheck`, if anything other than `docs` allows anonymous writes, or if `profiles` / `auth` lose their in-function protection. `scripts/ops/smoke.mjs` confirms against a running API that signed-out reads succeed, that signed-out writes and bad tokens are rejected **by the function**, and that `teams`, `requests` and `projects` still reject signed-out callers at the gateway.

Adding a function to the exempt list is a security decision: it removes the gateway as a second line of defence for that function. Update the check and this page in the same change.

## Other exceptions to user-JWT authentication

Two operations don't authenticate a user at all:

- **`/docs/reindex`** — authenticated by a shared `X-Reindex-Token` secret, because the caller is CI in another repository, not a signed-in person. See [Authorization](authorization.md). The `docs` function runs without the platform JWT gate, so the CI job needs no JWT at all; the secret is the only credential and is checked before anything is written.
- **`/projects/{id}/download`** — the *initial* access check still uses the caller's own JWT; only the signed-URL minting step afterward uses a service-role client.
