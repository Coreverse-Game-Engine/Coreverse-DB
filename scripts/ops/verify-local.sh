#!/usr/bin/env bash
# Phase 6A -- run every local/CI gate in one go and print a summary.
#
# Mirrors .github/workflows/ci.yml job by job so a green run here means CI
# will be green. A step whose tool is missing is reported as SKIPPED (never
# as passed) and makes the script exit non-zero unless ALLOW_SKIP=1.
#
#   bash scripts/ops/verify-local.sh                # everything
#   SKIP_PGTAP=1 bash scripts/ops/verify-local.sh   # no Docker available
#   ALLOW_SKIP=1 bash scripts/ops/verify-local.sh   # tolerate skipped steps
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

declare -a NAMES=() STATUS=()
run() { # run <name> <command...>
  local name="$1"; shift
  echo; echo "=== $name"; echo "\$ $*"
  if "$@"; then NAMES+=("$name"); STATUS+=("PASS"); else NAMES+=("$name"); STATUS+=("FAIL"); fi
}
skip() { echo; echo "=== $1 -- SKIPPED ($2)"; NAMES+=("$1"); STATUS+=("SKIP"); }
have() { command -v "$1" >/dev/null 2>&1; }

# 0. repo consistency (Node only) ---------------------------------------
run "static checks" node scripts/ops/static-checks.mjs
run "version sync" node scripts/check-version-sync.mjs

# 1. openapi-lint / client-verify / vitest-unit jobs ---------------------
if have pnpm; then
  run "pnpm install --frozen-lockfile" pnpm install --frozen-lockfile
  run "redocly lint" pnpm exec redocly lint openapi/openapi.yaml
  run "pnpm run verify (generate + no drift + typecheck)" pnpm run verify
  run "vitest" pnpm run test
  run "build (tsup)" pnpm run build
else
  for s in "pnpm install" "redocly lint" "pnpm run verify" "vitest" "build (tsup)"; do skip "$s" "pnpm not installed"; done
fi

# 2. deno-unit job ---------------------------------------------------------
if have deno; then
  run "deno test" deno task test
  run "deno fmt --check" deno fmt --check supabase/functions/
else
  skip "deno test" "deno not installed"; skip "deno fmt --check" "deno not installed"
fi

# 3. supabase-pgtap job (needs Docker) --------------------------------------
if [[ "${SKIP_PGTAP:-0}" == "1" ]]; then
  skip "supabase db lint / pgTAP" "SKIP_PGTAP=1"
elif have supabase && have docker; then
  started_here=0
  if ! supabase status >/dev/null 2>&1; then run "supabase start" supabase start; started_here=1; fi
  run "supabase db lint" supabase db lint
  run "pgTAP (supabase test db)" supabase test db
  if [[ "$started_here" == "1" ]]; then supabase stop >/dev/null 2>&1 || true; fi
else
  skip "supabase db lint / pgTAP" "supabase CLI or docker not installed"
fi

# summary --------------------------------------------------------------------
echo; echo "================ SUMMARY ================"
fail=0; skipped=0
for i in "${!NAMES[@]}"; do
  printf '%-4s  %s\n' "${STATUS[$i]}" "${NAMES[$i]}"
  [[ "${STATUS[$i]}" == "FAIL" ]] && fail=$((fail+1))
  [[ "${STATUS[$i]}" == "SKIP" ]] && skipped=$((skipped+1))
done
echo "----------------------------------------"
echo "failed: $fail   skipped: $skipped"
if (( fail > 0 )); then exit 1; fi
if (( skipped > 0 )) && [[ "${ALLOW_SKIP:-0}" != "1" ]]; then
  echo "Some steps were skipped -- do NOT treat this as green. (ALLOW_SKIP=1 to accept.)"; exit 3
fi
echo "All gates green."
