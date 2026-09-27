# Error Codes

Every error response follows the shared `Error` schema. See [API › Errors](../api/errors.md) for the full explanation; this page is the quick-reference table.

| HTTP status | Meaning                                                                                                                                                                                 |
|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `400`       | Request validation failure (Zod), or a database-level rejection not specifically mapped to another status (includes most constraint violations)                                         |
| `401`       | No/invalid JWT on an operation that requires one                                                                                                                                        |
| `403`       | Authenticated, but not authorized for this action — corresponds to Postgres error code `42501` raised inside a `SECURITY DEFINER` function, or an RLS policy silently excluding the row |
| `404`       | Resource doesn't exist, or exists but isn't visible to the caller (the API does not distinguish these for read paths)                                                                   |
| `409`       | A conflicting state already exists (e.g. already voted, already a pending request for this team/user, a `username` that's already taken)                                                |
| `429`       | Rate limit exceeded (currently only `POST /auth/password-reset`) — see the `Retry-After` header for how long to wait                                                                    |
