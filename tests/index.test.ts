import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// src/index.ts is a pure `export * from "./generated/..."` barrel (models,
// per-tag endpoints, per-tag zod schema namespaces) plus the two
// hand-written exports from src/client/http.ts. src/generated/** is Orval
// output that is not checked into git (see src/generated/.gitkeep) and is
// only produced by `pnpm run generate` -- so importing src/index.ts requires
// that to have already run. CI's vitest-unit job runs `pnpm run generate`
// before `pnpm run test` (see .github/workflows/ci.yml); locally, run
// `pnpm run generate` once before `pnpm test`.
//
// The auth tag's requestPasswordReset operation is used below as a stable
// anchor: its generated names (requestPasswordReset / RequestPasswordResetBody)
// are derived deterministically from its operationId in
// openapi/paths/auth.yaml, so they don't change across regenerations unless
// that operationId itself changes.
const generatedModelsExist = existsSync(new URL("../src/generated/models", import.meta.url));

describe.skipIf(!generatedModelsExist)("src/index.ts barrel", () => {
  it("re-exports configureCoreverseClient and CoreverseApiError from src/client/http.ts unchanged", async () => {
    const index = await import("../src/index");
    const http = await import("../src/client/http");

    expect(index.configureCoreverseClient).toBe(http.configureCoreverseClient);
    expect(index.CoreverseApiError).toBe(http.CoreverseApiError);
  });

  it("flattens generated/endpoints/* so a known per-tag operation is callable directly", async () => {
    const index = (await import("../src/index")) as Record<string, unknown>;

    expect(typeof index.requestPasswordReset).toBe("function");
  });

  it("namespaces generated/zod/* per tag instead of flattening it", async () => {
    const index = (await import("../src/index")) as Record<string, unknown>;

    const expectedNamespaces = [
      "releasesSchemas",
      "teamsSchemas",
      "requestsSchemas",
      "profilesSchemas",
      "projectsSchemas",
      "newsSchemas",
      "pollsSchemas",
      "discussionsSchemas",
      "docsSchemas",
      "authSchemas",
    ];

    for (const namespace of expectedNamespaces) {
      expect(index[namespace], `expected src/index.ts to export "${namespace}"`).toBeTypeOf(
        "object",
      );
    }

    const authSchemas = index.authSchemas as Record<string, unknown>;
    expect(authSchemas.RequestPasswordResetBody).toBeDefined();
    expect(typeof (authSchemas.RequestPasswordResetBody as { parse?: unknown }).parse).toBe(
      "function",
    );
  });

  it("a namespaced schema actually validates like a real Zod schema (accepts valid input, rejects invalid input)", async () => {
    const index = (await import("../src/index")) as Record<string, unknown>;
    const authSchemas = index.authSchemas as {
      RequestPasswordResetBody: { parse: (v: unknown) => unknown };
    };

    expect(() =>
      authSchemas.RequestPasswordResetBody.parse({
        email: "user@example.com",
        redirectTo: "https://coreverse.dev/en/reset-password",
      }),
    ).not.toThrow();

    expect(() =>
      authSchemas.RequestPasswordResetBody.parse({ email: "not-an-object" }),
    ).toThrow();
  });

  it("is not an accidentally-empty or half-flattened barrel", async () => {
    const index = (await import("../src/index")) as Record<string, unknown>;
    const exportNames = Object.keys(index);

    // 2 hand-written exports + >=1 endpoint fn per tag (10 tags) + 10
    // namespaced schema objects + the flattened generated/models/* runtime
    // values (enums etc.) comfortably clears 20.
    expect(exportNames.length).toBeGreaterThan(20);
    expect(exportNames).toContain("configureCoreverseClient");
    expect(exportNames).toContain("CoreverseApiError");
  });
});

describe.skipIf(generatedModelsExist)("src/index.ts barrel (generated/ missing)", () => {
  it("is skipped because src/generated/ has not been produced yet -- run `pnpm run generate` first", () => {
    expect(generatedModelsExist).toBe(false);
  });
});
