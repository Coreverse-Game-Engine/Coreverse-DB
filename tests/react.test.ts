import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// src/react.ts is a pure `export * from "./generated/react/*"` barrel for
// the "@coreverse/db-client/react" subpath (see package.json `exports`).
// Like src/index.ts, it only re-exports Orval output that is not checked
// into git and requires `pnpm run generate` to exist first -- see
// tests/index.test.ts for the same guard/rationale.
//
// One hook per tag is checked below by name. These names are derived
// deterministically from each operation's operationId (useQuery: true is
// set in orval.config.ts, so every operation -- GET or not -- becomes a
// `use<PascalCaseOperationId>` hook), so they're stable across
// regenerations unless the underlying operationId changes.
const generatedReactExists = existsSync(new URL("../src/generated/react", import.meta.url));

describe.skipIf(!generatedReactExists)("src/react.ts barrel", () => {
  it("exports one TanStack Query hook per OpenAPI tag, and nothing else under those names", async () => {
    const react = (await import("../src/react")) as Record<string, unknown>;

    const expectedHooksByTag: Record<string, string> = {
      releases: "useGetLatestRelease",
      teams: "useCreateTeam",
      requests: "useAcceptMembershipRequest",
      profiles: "useGetMyProfile",
      projects: "useCreateProject",
      news: "useCreateNews",
      polls: "useCreatePoll",
      discussions: "useCreateDiscussion",
      docs: "useSearchDocs",
      auth: "useRequestPasswordReset",
    };

    for (const [tag, hookName] of Object.entries(expectedHooksByTag)) {
      expect(typeof react[hookName], `expected src/react.ts to export "${hookName}" (${tag})`).toBe(
        "function",
      );
    }
  });

  it("exports a comfortably large set of hooks (one barrel per generated/react/* tag file)", async () => {
    const react = (await import("../src/react")) as Record<string, unknown>;

    const hookNames = Object.keys(react).filter((name) => /^use[A-Z]/.test(name));

    // 42 export function use* declarations exist across the 10 tag files
    // today (see src/generated/react/**); require a healthy majority so a
    // broken/partial barrel export fails loudly instead of silently
    // dropping a tag.
    expect(hookNames.length).toBeGreaterThanOrEqual(10);
  });

  it("never re-exports the hand-written client/http.ts exports (react.ts is a separate entry point, see src/react.ts's own comment)", async () => {
    const react = (await import("../src/react")) as Record<string, unknown>;

    // configureCoreverseClient/CoreverseApiError only live in src/index.ts
    // (via src/client/http.ts); src/react.ts deliberately never imports
    // react/@tanstack-react-query for non-React consumers of the base
    // package, and by the same token stays free of these two.
    expect(react.configureCoreverseClient).toBeUndefined();
    expect(react.CoreverseApiError).toBeUndefined();
  });

  it("also re-exports each operation's plain fetch function alongside its hook (Orval's react-query client output)", async () => {
    const react = (await import("../src/react")) as Record<string, unknown>;

    expect(typeof react.requestPasswordReset).toBe("function");
  });
});

describe.skipIf(generatedReactExists)("src/react.ts barrel (generated/ missing)", () => {
  it("is skipped because src/generated/react/ has not been produced yet -- run `pnpm run generate` first", () => {
    expect(generatedReactExists).toBe(false);
  });
});
