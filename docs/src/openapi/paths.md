# Paths

Each file under `openapi/paths/` groups the operations for one resource, keyed by a short name referenced from the root `openapi.yaml` (e.g. `./paths/teams.yaml#/create`, `#/byId`, `#/members`, ...). This keeps the root document's `paths:` section a readable table of contents even though the full spec spans nine files and dozens of operations.

Every operation includes:

- A `summary` (used verbatim in generated client method names by Orval where applicable) and an `operationId` (the canonical name Orval uses for the generated function).
- A `security` requirement — see [API › Authentication](../api/authentication.md) — explicit per operation, not inherited from a global default.
- Response schemas for every realistic status code the underlying Edge Function can actually return, including `400` for malformed path parameters or bodies, and `401`/`403` for the specific auth/authorization failures that operation can hit (not a generic catch-all).

See the [API › Resources](../api/resources/releases.md) pages for the operations grouped by what they do, and [Reference › Error Codes](../reference/error-codes.md) for the response codes across the whole API.
