import { defineConfig } from "orval";

// Two output targets from the same multi-file spec:
//  - coreverseDb:     typed fetch client + models, one file pair per tag
//                      (releases, teams, requests, profiles, projects,
//                      news, polls, discussions, docs) -- matches the
//                      Edge Functions' domain split 1:1.
//  - coreverseDbZod:  zod schemas generated from the same spec, kept
//                      separate from the fetch client so consumers that
//                      only want runtime validation (e.g. re-checking a
//                      webhook payload) don't have to pull in fetch code.
//
// swagger-parser (used internally by Orval) resolves the spec's external
// $refs (paths/*.yaml, schemas/*.yaml, parameters/*.yaml) itself, directly
// against openapi/openapi.yaml -- no separate bundle step needed here.
//
// Orval v8 disallows external $ref targets by default (a v7->v8 breaking
// change, not something we did wrong) -- every file our multi-file spec
// pulls in via $ref has to be allow-listed explicitly. This is every
// paths/*.yaml, schemas/*.yaml, and parameters/*.yaml file that exists
// today; add new ones here when a future external ref file is added to
// openapi/.

const externalRefsAllow = [
  "./paths/releases.yaml",
  "./paths/teams.yaml",
  "./paths/requests.yaml",
  "./paths/profiles.yaml",
  "./paths/auth.yaml",
  "./paths/projects.yaml",
  "./paths/news.yaml",
  "./paths/polls.yaml",
  "./paths/discussions.yaml",
  "./paths/docs.yaml",

  "./schemas/Ok.yaml",
  "./schemas/Release.yaml",
  "./schemas/Artifact.yaml",
  "./schemas/Profile.yaml",
  "./schemas/Team.yaml",
  "./schemas/TeamMember.yaml",
  "./schemas/MembershipRequest.yaml",
  "./schemas/Project.yaml",
  "./schemas/News.yaml",
  "./schemas/Poll.yaml",
  "./schemas/PollResult.yaml",
  "./schemas/Discussion.yaml",
  "./schemas/DiscussionReply.yaml",
  "./schemas/DocSource.yaml",
  "./schemas/DocSearchResult.yaml",
  "./schemas/Error.yaml",

  "./parameters/Pagination.yaml",
];

export default defineConfig({
  coreverseDb: {
    input: {
      target: "./openapi/openapi.yaml",
      parserOptions: {
        externalRefs: {
          allow: externalRefsAllow,
        },
      },
    },
    output: {
      mode: "tags-split",
      target: "./src/generated/endpoints",
      schemas: "./src/generated/models",
      client: "fetch",
      httpClient: "fetch",
      mock: false,
      clean: true,
      formatter: "prettier",
      override: {
        mutator: {
          path: "./src/client/http.ts",
          name: "coreverseFetch",
        },
      },
    },
  },

  coreverseDbZod: {
    input: {
      target: "./openapi/openapi.yaml",
      parserOptions: {
        externalRefs: {
          allow: externalRefsAllow,
        },
      },
    },
    output: {
      mode: "tags-split",
      target: "./src/generated/zod",
      client: "zod",
      clean: true,
      formatter: "prettier",
    },
  },

  // TanStack Query hooks for the "@coreverse/db-client/react" subpath
  // export (see src/react.ts + package.json `exports`). Reuses the same
  // coreverseFetch mutator as coreverseDb above -- these hooks are a thin
  // useQuery/useMutation wrapper around the exact same requests, not a
  // separate client. Kept in its own output dir (not mixed into
  // src/generated/endpoints) so the plain fetch client stays free of a
  // react/@tanstack/react-query import for non-React consumers.
  coreverseDbReactQuery: {
    input: {
      target: "./openapi/openapi.yaml",
      parserOptions: {
        externalRefs: {
          allow: externalRefsAllow,
        },
      },
    },
    output: {
      mode: "tags-split",
      target: "./src/generated/react",
      client: "react-query",
      httpClient: "fetch",
      mock: false,
      clean: true,
      formatter: "prettier",
      override: {
        mutator: {
          path: "./src/client/http.ts",
          name: "coreverseFetch",
        },
        query: {
          // Emit `useXxx()` hooks (not just queryOptions helpers) --
          // GET operations become useQuery hooks, non-GET become
          // useMutation hooks.
          useQuery: true,
        },
      },
    },
  },
});
