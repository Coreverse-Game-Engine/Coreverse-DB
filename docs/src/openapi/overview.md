# Overview

`openapi/openapi.yaml` is the **authoritative** definition of the HTTP API — not the Edge Function code, and not `src/generated/`. Every path lives in its own file under `openapi/paths/`, and every reusable schema lives in its own file under `openapi/schemas/`, referenced by `$ref` from the root document and from each other.

```text
openapi/openapi.yaml
        │
        ▼
      Orval
     /     \
    ▼       ▼
Fetch SDK   Zod schemas
```

Orval reads the multi-file spec (resolving `$ref`s itself via its bundled `swagger-parser`, so no separate bundling step is needed before codegen) and produces:

- A typed fetch client, split by tag, under `src/generated/endpoints/`.
- TypeScript models under `src/generated/models/`.
- Zod runtime validators under `src/generated/zod/`.
- (For the `react` package entry point) TanStack Query hooks under `src/generated/react/`.

See [Specification](specification.md) for how the document is structured, [Paths](paths.md) for how individual operations are written, and [Schemas](schemas.md) for the shared component schemas.
