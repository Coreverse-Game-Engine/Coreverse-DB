#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/../common/logger.sh"

# Confirms the src/ React package's Vitest setup (tests/) is actually
# runnable after 'pnpm install'. Vitest is a plain devDependency (see
# package.json), so there is nothing to "install" the way check-*.sh does
# for a system binary -- pnpm install (parse-pnpm.sh) already put it in
# node_modules/.bin. This step only verifies that resolved correctly, via
# 'pnpm exec vitest --version'.
#
# Deliberately does NOT run the actual test suite here: tests/index.test.ts
# and tests/react.test.ts import src/index.ts / src/react.ts, which are
# `export * from "./generated/..."` barrels -- they only resolve after
# 'pnpm run generate' has been run, and this devkit's job is
# toolchain/dependency setup, not generating the client. Run
# 'pnpm run generate && pnpm test' yourself once this step is green.
#
# NOTE: assumes parse-pnpm.sh (task 'pnpm Deps') has already completed
# successfully -- see bootstrap.sh/bootstrap.ps1's DependsOn wiring.

TOOL_NAME="Vitest"
PACKAGE_DIR=""
DRY_RUN="false"
RESULT_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --package-dir) PACKAGE_DIR="$2"; shift 2 ;;
        --dry-run) DRY_RUN="true"; shift ;;
        --result-file) RESULT_FILE="$2"; shift 2 ;;
        *) shift ;;
    esac
done

write_result() {
    local status="$1"
    local version="${2:-}"
    [ -z "$RESULT_FILE" ] && return 0
    mkdir -p "$(dirname "$RESULT_FILE")"
    printf 'TOOL=%s\nSTATUS=%s\nVERSION=%s\n' "$TOOL_NAME" "$status" "$version" > "$RESULT_FILE"
}

if [ -z "$PACKAGE_DIR" ] || [ "$PACKAGE_DIR" = "null" ]; then
    log_warning "'pnpmPackageDir' is not set in config/project-paths.json. Skipping." "$TOOL_NAME"
    write_result "Skipped"
    exit 0
fi

if [ ! -f "$PACKAGE_DIR/package.json" ]; then
    log_warning "No package.json found under '$PACKAGE_DIR'. Skipping." "$TOOL_NAME"
    write_result "Skipped"
    exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
    log_error "pnpm not found on PATH. The toolchain phase must be completed first." "$TOOL_NAME"
    write_result "Failed"
    exit 0
fi

if [ "$DRY_RUN" = "true" ]; then
    log_info "[DryRun] In '$PACKAGE_DIR', 'pnpm exec vitest --version' was to be run." "$TOOL_NAME"
    write_result "DryRun"
    exit 0
fi

VITEST_VERSION=""
(
    cd "$PACKAGE_DIR" || exit 1
    log_info "Checking Vitest resolves via pnpm exec..." "$TOOL_NAME"
    pnpm exec vitest --version
)
VITEST_STATUS=$?

if [ "$VITEST_STATUS" -eq 0 ]; then
    VITEST_VERSION=$(cd "$PACKAGE_DIR" && pnpm exec vitest --version 2>/dev/null | tail -n1)
    log_success "Vitest is set up (tests/ -> vitest.config.ts). Run 'pnpm run generate && pnpm test' to execute the suite." "$TOOL_NAME"
    write_result "OK" "$VITEST_VERSION"
else
    log_error "'pnpm exec vitest --version' failed -- Vitest did not resolve after pnpm install." "$TOOL_NAME"
    write_result "Failed"
fi
