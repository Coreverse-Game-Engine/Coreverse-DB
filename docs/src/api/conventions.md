# Conventions

- **JSON in, JSON out.** Every request body and response body is `application/json`; there is no XML or form-encoded surface.
- **Resource creation returns the full object**, not just an `id`. (This was a real bug found and fixed during development — some RPC-backed create endpoints originally returned only `{ id }` while the spec promised the full `Team`/`Poll`/etc. object; the fix added explicit refetches after the underlying database function returns.)
- **Path parameters, not query strings, identify a specific resource** — `/teams/{teamId}`, `/polls/{pollId}/vote`, `/replies/{replyId}`.
- **List endpoints accept pagination/filtering as query parameters** where applicable (e.g. `releases` status filter, `limit`/`offset`).
- **Every path-parameterized operation documents a 400** for a malformed identifier, in addition to whatever 401/403/404 responses apply to that specific operation.
- **Trivial acknowledgement responses use a shared `Ok` schema** rather than each endpoint inventing its own `{ "success": true }` shape.
- **Errors use the shared `Error` schema** everywhere — see [Errors](errors.md).

See [OpenAPI › Schemas](../openapi/schemas.md) for the schema files these conventions are expressed in.
