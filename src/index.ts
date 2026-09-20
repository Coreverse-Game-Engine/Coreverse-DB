export { configureCoreverseClient, CoreverseApiError } from "./client/http";
export type { CoreverseClientConfig, CoreverseErrorBody } from "./client/http";

// Shared model types (request/response bodies, path/query param shapes),
// one flat barrel across all tags -- see src/generated/models/index.ts.
// Safe to flatten: every exported name is derived from a unique OpenAPI
// operationId, so there are no cross-tag collisions.
export * from "./generated/models";

// Per-tag fetch client functions (the actual API calls), matching the
// Edge Functions' domain split 1:1. Also flattened for the same reason.
export * from "./generated/endpoints/releases/releases";
export * from "./generated/endpoints/teams/teams";
export * from "./generated/endpoints/requests/requests";
export * from "./generated/endpoints/profiles/profiles";
export * from "./generated/endpoints/projects/projects";
export * from "./generated/endpoints/news/news";
export * from "./generated/endpoints/polls/polls";
export * from "./generated/endpoints/discussions/discussions";
export * from "./generated/endpoints/docs/docs";
export * from "./generated/endpoints/auth/auth";

// Zod schemas, namespaced per tag rather than flattened. Unlike models/
// and endpoints/ above, schema constant names here are *not* guaranteed
// unique across tags (e.g. two tags could both emit an `Ok` or `Error`
// alias), so each tag gets its own namespace object instead of risking a
// silent collision. Usage:
//   import { releasesSchemas } from "@coreverse/db-client";
//   releasesSchemas.ListReleasesResponse.parse(payload);
export * as releasesSchemas from "./generated/zod/releases/releases";
export * as teamsSchemas from "./generated/zod/teams/teams";
export * as requestsSchemas from "./generated/zod/requests/requests";
export * as profilesSchemas from "./generated/zod/profiles/profiles";
export * as projectsSchemas from "./generated/zod/projects/projects";
export * as newsSchemas from "./generated/zod/news/news";
export * as pollsSchemas from "./generated/zod/polls/polls";
export * as discussionsSchemas from "./generated/zod/discussions/discussions";
export * as docsSchemas from "./generated/zod/docs/docs";
export * as authSchemas from "./generated/zod/auth/auth";
