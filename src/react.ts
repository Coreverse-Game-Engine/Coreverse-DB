// Barrel for the "@coreverse/db-client/react" subpath export (see
// package.json `exports`). Pulls in the TanStack Query hooks Orval
// generates alongside the plain fetch client (see orval.config.ts ->
// coreverseDbReactQuery), one module per OpenAPI tag, mirroring
// src/index.ts's endpoint barrel.
//
// This is a separate entry point (not re-exported from src/index.ts) so
// that non-React consumers of the base package never pull in a
// react / @tanstack/react-query import.
//
// Consumers must already have @tanstack/react-query's QueryClientProvider
// mounted above wherever these hooks are used -- this package does not
// create or own a QueryClient itself, it only generates hooks that call
// useQuery/useMutation from whatever QueryClient is in context.
//
// Requires the peer dependencies declared in package.json:
//   react >= 18, @tanstack/react-query ^5.

export * from "./generated/react/releases/releases";
export * from "./generated/react/teams/teams";
export * from "./generated/react/requests/requests";
export * from "./generated/react/profiles/profiles";
export * from "./generated/react/projects/projects";
export * from "./generated/react/news/news";
export * from "./generated/react/polls/polls";
export * from "./generated/react/discussions/discussions";
export * from "./generated/react/docs/docs";
