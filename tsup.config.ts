import { defineConfig } from "tsup";

// Two entry points matching package.json `exports`:
//   "."       -> dist/index.*  (framework-agnostic client, no React)
//   "./react" -> dist/react.*  (TanStack Query hooks, see src/react.ts)
//
// react / @tanstack/react-query are marked external rather than bundled --
// they're peerDependencies (see package.json), so consumers supply their
// own copy and we don't want two React instances shipped.
//
// dts:true needs a TypeScript install that exposes the programmatic API
// (rollup-plugin-dts, which tsup uses internally to bundle .d.ts output,
// depends on it). TypeScript 7's own `typescript` package ships a
// native-only tsc with no API, so package.json carries two aliases for
// this transition period (per Microsoft's official TS 7.0 migration
// guidance):
//   "typescript"        -> npm:@typescript/typescript6  (API + `tsc6` bin,
//                           this is what rollup-plugin-dts/tsup resolve
//                           via require("typescript"))
//   "@typescript/native" -> npm:typescript@^7.0.2        (native compiler,
//                           provides the actual `tsc` bin our own
//                           `pnpm typecheck` script runs)
// Aliasing only "typescript" (without the second entry) removes the real
// `tsc` binary entirely, since @typescript/typescript6 only ships `tsc6`.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["react", "react-dom", "@tanstack/react-query"],
});
