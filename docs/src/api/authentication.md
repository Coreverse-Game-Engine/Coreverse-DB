# Authentication

Authenticated operations accept a Supabase Auth JWT via the standard bearer scheme:

```http
Authorization: Bearer <JWT>
```

**Reading public content needs no token.** Releases, published news, events, FAQ, polls and their aggregated results, discussions and replies, and docs search all answer a signed-out request with `200`. Everything that creates, changes or deletes something, and everything that is about *you* (your profile, teams, projects, your own vote), needs a valid Supabase Auth JWT.

What a client should do:

- **Signed in:** send the session's access token on every request (the SDK does this through `getAuthToken`). Public reads also work with it, and some responses add per-user fields (for example `my_option_id` on polls).
- **Signed out:** send no token. Reads work. A write answers `401` with the body `{ "error": "unauthorized", "message": "A valid session is required." }`; treat that as "show the sign-in screen", and retry after sign-in.
- **`401` on a read:** the token you sent is malformed or expired. Refresh the session (or drop the token) and retry.

`teams`, `requests` and `projects` have no signed-out routes at all; the platform rejects a request without a valid JWT before the function runs. The only other signed-out operations are `POST /auth/password-reset` and `GET /profiles/username-availability`. See [Security › Authentication](../security/authentication.md#the-platform-jwt-gate) for how this is enforced.

## Per-operation security in the contract

Every operation in `openapi/paths/*.yaml` declares its own `security` requirement — public, optional-bearer, or required-bearer — matching what the underlying Edge Function and database RLS actually enforce. A "public" operation is one that needs no *particular user*, and a signed-out caller can use it (this holds for every public operation except those in `teams`, `requests` and `projects`, which are always behind the platform gate). This was made explicit (rather than left as one blanket API-wide default) specifically so the generated client and any API consumer can tell, from the spec alone, which calls need a signed-in user.

## The `X-Reindex-Token` exception

`POST /docs/reindex` does not use bearer auth at all. It's authenticated by a shared secret header, `X-Reindex-Token`, because the caller is another repository's CI pipeline (after an mdBook build), not a person with a Supabase session. See [Security › Authentication](../security/authentication.md) for the reasoning.
