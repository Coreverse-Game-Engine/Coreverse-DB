# Auth

| Method | Path | Auth | Does |
|---|---|---|---|
| `POST` | `/auth/password-reset` | None (unauthenticated) | Requests a Supabase Auth password reset email |

Unlike every other resource, `auth` operations never take a bearer token — `POST /auth/password-reset` is called by someone who, by definition, may not be able to sign in.

## Anti-enumeration

The response is identical (`200`, generic acknowledgement) whether or not `email` belongs to an account, so this endpoint cannot be used to check which addresses are registered.

## Rate limiting

Requests are throttled on two independent axes, either of which can trigger a `429` with a `Retry-After` header:

- **3 requests per 15 minutes**, per email address
- **10 requests per hour**, per caller IP

Both limits are enforced through the generic `identity.hit_rate_limit()` / `identity.rate_limit_hits` primitive (added in `20260912085602_avatar_upload_and_rate_limit.sql`), which any future public, abuse-prone endpoint can reuse without inventing its own counter table.

## `redirectTo` validation

`redirectTo` must be an exact `https://<allowed-website-origin>/{locale}/reset-password` URL — no query string or hash. The origin is checked against `WEBSITE_ALLOWED_ORIGINS` (see [Environment Variables](../../reference/environment-variables.md)) and the path against the known locale list. A `redirectTo` that fails either check is rejected with `400 invalid_redirect` rather than silently falling back to Supabase Auth's own Site URL.

## Delivery

The actual reset email is sent by Supabase Auth's mailer, not by this endpoint directly. A separate `send-email` function (a Supabase Auth "Send Email" hook target, not part of this OpenAPI contract) intercepts the send and renders it with the Website's own localized copy via Brevo — see [Development › Edge Functions](../../development/edge-functions.md).
