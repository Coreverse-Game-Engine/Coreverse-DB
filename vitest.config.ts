import { defineConfig } from "vitest/config";

// Covers only the hand-written src/ files (src/client/http.ts, src/react.ts,
// src/index.ts). src/generated/** is Orval output and is already verified
// by `pnpm run verify` (generate -> git diff -> typecheck) in CI, so it is
// deliberately not unit-tested here.
//
// NOTE: src/index.ts and src/react.ts are pure `export * from "./generated/..."`
// barrels, so importing them requires src/generated/** to actually exist on
// disk. Run `pnpm run generate` before `pnpm test` (this is also why CI's
// vitest-unit job runs `pnpm run generate` before `pnpm run test` -- see
// .github/workflows/ci.yml).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/client/http.ts", "src/react.ts", "src/index.ts"],
    },
  },
});
