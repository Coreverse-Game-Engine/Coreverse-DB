# Authentication

Authentication is entirely delegated to **Supabase Auth** (`auth.users`). Coreverse DB:

- Never stores a password, hash, or credential of any kind.
- Reads the caller's identity from the JWT Supabase Auth issues, via `auth.uid()` inside PostgreSQL and via the `Authorization: Bearer <JWT>` header at the Edge Function layer.
- Auto-provisions an `identity.profiles` row the moment a new `auth.users` row appears (`identity.handle_new_auth_user()`, an `after insert` trigger on `auth.users`) — so "signed up" and "has a Coreverse profile" are the same moment.

## In Edge Functions

Each function builds a Supabase client scoped to the caller by forwarding their `Authorization` header (`_shared/supabase-client.ts`). There is no separate application-level session or token — the same JWT that authenticates against Supabase Auth is what RLS policies evaluate via `auth.uid()`.

## Public vs. authenticated operations

Most `GET` endpoints (releases, published news, poll results, docs search) work without a JWT at all — RLS policies grant `select` to `anon` as well as `authenticated` where the data isn't sensitive. Anything that identifies or acts on behalf of a specific user (profile update, team actions, project uploads, voting, posting) requires a valid JWT.

## The two exceptions

Two operations don't use a user JWT at all:

- **`/docs/reindex`** — authenticated by a shared `X-Reindex-Token` secret, because the caller is CI in another repository, not a signed-in person. See [Authorization](authorization.md).
- **`/projects/{id}/download`** — the *initial* access check still uses the caller's own JWT; only the signed-URL minting step afterward uses a service-role client.
