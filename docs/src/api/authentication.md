# Authentication

Authenticated operations accept a Supabase Auth JWT via the standard bearer scheme:

```http
Authorization: Bearer <JWT>
```

**Every request needs a valid Supabase Auth JWT**, with two exceptions: `POST /auth/password-reset` and `GET /profiles/username-availability`, the only operations a signed-out user must be able to call. The platform rejects any other request without a valid JWT with `401` before the function runs — including read operations such as the release listing, published news, poll results, events, FAQ and docs search. The SDK sends the token it gets from `getAuthToken`; when there is no session it sends none, so a signed-out client should not call those endpoints at all. See [Security › Authentication](../security/authentication.md#the-platform-jwt-gate).

## Per-operation security in the contract

Every operation in `openapi/paths/*.yaml` declares its own `security` requirement — public, optional-bearer, or required-bearer — matching what the underlying Edge Function and database RLS actually enforce. A "public" operation is one that needs no *particular user* inside the function; it is still behind the platform JWT gate unless it is one of the two signed-out operations above. This was made explicit (rather than left as one blanket API-wide default) specifically so the generated client and any API consumer can tell, from the spec alone, which calls need a signed-in user.

## The `X-Reindex-Token` exception

`POST /docs/reindex` does not use bearer auth at all. It's authenticated by a shared secret header, `X-Reindex-Token`, because the caller is another repository's CI pipeline (after an mdBook build), not a person with a Supabase session. See [Security › Authentication](../security/authentication.md) for the reasoning.
