# Conventions

- **JSON in, JSON out.** Every request body and response body is `application/json`; there is no XML or form-encoded surface.
- **Resource creation returns the full object**, not just an `id`. (This was a real bug found and fixed during development — some RPC-backed create endpoints originally returned only `{ id }` while the spec promised the full `Team`/`Poll`/etc. object; the fix added explicit refetches after the underlying database function returns.)
- **Path parameters, not query strings, identify a specific resource** — `/teams/{teamId}`, `/polls/{pollId}/vote`, `/discussions/{discussionId}/replies/{replyId}`.
- **Every path-parameterized operation documents a 400** for a malformed identifier, in addition to whatever 401/403/404 responses apply to that specific operation.
- **Trivial acknowledgement responses use a shared `Ok` schema** rather than each endpoint inventing its own `{ "success": true }` shape.
- **Errors use the shared `Error` schema** everywhere — see [Errors](errors.md).

## Pagination

Two styles coexist, deliberately, rather than one being retrofitted onto the other:

- **`releases`** uses offset/limit (`?limit=&?offset=`) and returns a bare array. This predates the pattern below and hasn't been migrated — see [Resources › Releases](resources/releases.md).
- **Every other list endpoint** (`discussions`, a discussion's `replies`, `polls`, `news`) uses keyset ("cursor") pagination: `?limit=` (1-100, default 20) and `?cursor=`, and the response is `{ items: [...], next_cursor: string | null }` instead of a bare array. Fetch the next page by passing the previous page's `next_cursor` back as `?cursor=`; `next_cursor: null` means there is no next page. `cursor` is an opaque token — its encoding is an implementation detail (currently base64 of the last row's `created_at` and `id`) and shouldn't be parsed or constructed by clients. See `supabase/functions/_shared/pagination.ts` for the implementation.

See [OpenAPI › Schemas](../openapi/schemas.md) for the schema files these conventions are expressed in.
