# Specification

- **Version:** OpenAPI 3.1.0.
- **`info`** — title, description, version (currently `0.1.0`), and license (`GPL-3.0-only`).
- **`servers`** — production (the Supabase Functions URL) and local (`http://127.0.0.1:54321/functions/v1`, matching `supabase start`'s default).
- **`tags`** — one per Edge Function/resource (`releases`, `teams`, `requests`, `profiles`, `projects`, `news`, `polls`, `discussions`, `docs`), each with a one-line description.
- **`paths`** — every entry is a `$ref` into `openapi/paths/<resource>.yaml#/<operationKey>`, keeping the root document a pure index rather than inlining operations.
- **`components.securitySchemes`** — a single `bearerAuth` scheme (Supabase Auth JWT), referenced per-operation rather than applied globally, so the spec itself documents which operations are public, optional-bearer, or required-bearer.

Linting is done with **Redocly** (`redocly.yaml`), run both locally (`pnpm` script, see [CLI Commands](../reference/cli-commands.md)) and in CI (see [Continuous Integration](../development/workflow.md)).
