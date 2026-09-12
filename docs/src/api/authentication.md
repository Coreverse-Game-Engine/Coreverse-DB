# Authentication

Authenticated operations accept a Supabase Auth JWT via the standard bearer scheme:

```http
Authorization: Bearer <JWT>
```

Public read operations (release listing, published news, poll results, docs search and source listing) do not require a token at all — omit the header, or send an anonymous Supabase client's session, and the request is treated as `anon`.

## `/auth/password-reset` is a different kind of public

`POST /auth/password-reset` (see [API › Resources › Auth](resources/auth.md)) isn't "public read" in the same sense as the endpoints above — it's a genuinely unauthenticated *write* action, since a signed-out user by definition has no JWT yet. It's protected instead by response-shape anti-enumeration and per-email/per-IP rate limiting rather than by requiring a bearer token.

## Per-operation security in the contract

Every operation in `openapi/paths/*.yaml` declares its own `security` requirement — public, optional-bearer, or required-bearer — matching what the underlying Edge Function and database RLS actually enforce. This was made explicit (rather than left as one blanket API-wide default) specifically so the generated client and any API consumer can tell, from the spec alone, which calls need a signed-in user.

## The `X-Reindex-Token` exception

`POST /docs/reindex` does not use bearer auth at all. It's authenticated by a shared secret header, `X-Reindex-Token`, because the caller is another repository's CI pipeline (after an mdBook build), not a person with a Supabase session. See [Security › Authentication](../security/authentication.md) for the reasoning.
