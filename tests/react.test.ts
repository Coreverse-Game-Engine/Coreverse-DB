import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// src/react.ts is a pure `export * from "./generated/react/*"` barrel for
// the "@Coreverse-Game-Engine/db-client/react" subpath (see package.json `exports`).
// Like src/index.ts, it only re-exports Orval output that is not checked
// into git and requires `pnpm run generate` to exist first -- see
// tests/index.test.ts for the same guard/rationale.
//
// One hook per tag is checked below by name. These names are derived
// deterministically from each operation's operationId (every operation
// becomes a `use<PascalCaseOperationId>` hook: GET operations are useQuery
// hooks, every other verb is a useMutation hook, see orval.config.ts), so
// they're stable across regenerations unless the underlying operationId
// changes.
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
      events: "useListEvents",
      faq: "useListFaq",
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

    // Every operation across the 12 tag files becomes at least one use*
    // hook (see src/generated/react/**); the floor below is deliberately
    // loose, it only exists so a broken/partial barrel export fails
    // loudly instead of silently dropping a tag.
    expect(hookNames.length).toBeGreaterThanOrEqual(12);
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

// Reads every operation (verb + operationId) straight from openapi/paths/*.yaml,
// the same source orval.config.ts derives its mutation overrides from.
const readOperations = (): { verb: string; operationId: string }[] => {
  const pathsDir = new URL("../openapi/paths/", import.meta.url);
  const operations: { verb: string; operationId: string }[] = [];

  for (const file of readdirSync(pathsDir).filter((name) => name.endsWith(".yaml"))) {
    const source = readFileSync(new URL(file, pathsDir), "utf8");
    const pattern = /^ {2}(get|post|put|patch|delete):\n(?: {4}.*\n)*? {4}operationId: (\w+)/gm;
    for (const match of source.matchAll(pattern)) {
      operations.push({ verb: match[1]!, operationId: match[2]! });
    }
  }

  return operations;
};

const pascalCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const hookExportPattern = /^export (?:const|function) (use[A-Z]\w*)/gm;

// Returns the generated source of one hook: every overload plus the
// implementation, up to the next differently named hook export.
const readHookSource = (hookName: string): string | undefined => {
  const reactDir = new URL("../src/generated/react/", import.meta.url);

  for (const tag of readdirSync(reactDir)) {
    const file = new URL(`${tag}/${tag}.ts`, reactDir);
    if (!existsSync(file)) continue;

    const source = readFileSync(file, "utf8");
    const exports = Array.from(source.matchAll(hookExportPattern), (match) => ({
      name: match[1]!,
      index: match.index!,
    }));
    const first = exports.findIndex((entry) => entry.name === hookName);
    if (first === -1) continue;

    const next = exports.slice(first).find((entry) => entry.name !== hookName);
    return source.slice(exports[first]!.index, next?.index ?? source.length);
  }

  return undefined;
};

describe.skipIf(!generatedReactExists)("src/react.ts hook kinds", () => {
  it("generates a useQuery hook for every GET operation and a useMutation hook for every other verb", async () => {
    const react = (await import("../src/react")) as Record<string, unknown>;
    const operations = readOperations();

    expect(operations.length).toBeGreaterThan(50);

    for (const { verb, operationId } of operations) {
      const hookName = `use${pascalCase(operationId)}`;
      const label = `${operationId} (${verb.toUpperCase()})`;

      expect(typeof react[hookName], `${hookName} must be exported`).toBe("function");

      const source = readHookSource(hookName);
      expect(source, `${hookName} must be generated`).toBeDefined();

      if (verb === "get") {
        expect(source, `${label} must call useQuery`).toContain("useQuery(");
        expect(source, `${label} must not call useMutation`).not.toContain("useMutation(");
      } else {
        expect(source, `${label} must call useMutation`).toContain("useMutation(");
        expect(source, `${label} must not call useQuery`).not.toContain("useQuery(");
      }
    }
  });

  it("builds mutation options whose mutationFn calls the plain fetch function", async () => {
    const react = (await import("../src/react")) as Record<string, unknown>;
    const getOptions = react.getCastVoteMutationOptions as () => { mutationFn?: unknown; mutationKey?: unknown };
    const options = getOptions();

    expect(typeof options.mutationFn).toBe("function");
    expect(options.mutationKey).toEqual(["castVote"]);
  });
});

describe.skipIf(generatedReactExists)("src/react.ts barrel (generated/ missing)", () => {
  it("is skipped because src/generated/react/ has not been produced yet -- run `pnpm run generate` first", () => {
    expect(generatedReactExists).toBe(false);
  });
});
