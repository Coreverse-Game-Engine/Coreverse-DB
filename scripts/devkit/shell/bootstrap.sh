#!/usr/bin/env bash
# Coreverse-DB Bootstrap - Linux/macOS entry point.
#
# Automates toolchain detection/installation and project dependency
# resolution in a single command. Independent tools/workflows run in
# parallel; dependents within a workflow (Deno->its subtools, Node->pnpm,
# Rustup->Cargo->mdBook, pnpm Deps->Vitest) run inline as a task-graph layer
# chain. Mirrors the powershell/bootstrap.ps1 design.
#
# Usage:
#   ./bootstrap.sh
#   ./bootstrap.sh --dry-run
#   ./bootstrap.sh --yes
#   ./bootstrap.sh --skip-elevation
#   ./bootstrap.sh --accept all
#   ./bootstrap.sh --accept semgrep --reject sqlfluff,deno-audit
#
# --accept <id[,id...]|all>  Install the listed optional tool(s) without
#                            asking (ids: semgrep, sqlfluff, deno-audit).
#                            'all' approves every optional tool.
# --reject <id[,id...]|none> Skip the listed optional tool(s) without
#                            asking. 'none' here means "install none of
#                            them" (skip every optional tool), not "reject
#                            nothing". If an id is in both --accept and
#                            --reject, --reject wins.
# --skip-elevation           Do not request sudo access up front.
#
# Must be run from the Coreverse-DB devkit directory (see config/README.md).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$SCRIPT_DIR/../config"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/common/logger.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/common/os-detect.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/common/version-compare.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/common/pkg-lock.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/common/pkg-dispatch.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/common/parallel-runner.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/common/optional-tools.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/package-managers/pacman.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/package-managers/apt.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/package-managers/dnf.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/package-managers/zypper.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/package-managers/brew.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/final/summary-table.sh"

# --- 0. CLI arguments ---
YES="false"
DRY_RUN="false"
SKIP_ELEVATION="false"
ACCEPT_CSV=""
REJECT_CSV=""

while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y) YES="true"; shift ;;
        --dry-run) DRY_RUN="true"; shift ;;
        --skip-elevation) SKIP_ELEVATION="true"; shift ;;
        --accept) ACCEPT_CSV="$2"; shift 2 ;;
        --reject) REJECT_CSV="$2"; shift 2 ;;
        *) log_warning "Unknown argument: $1"; shift ;;
    esac
done

DRY_RUN_FLAG=""
[ "$DRY_RUN" = "true" ] && DRY_RUN_FLAG="--dry-run"

log_banner "Coreverse-DB Bootstrap (Linux/macOS)"

# --- 1. Prerequisite: curl must exist (everything else bootstraps from it) ---
if ! command -v curl >/dev/null 2>&1; then
    log_error "curl is required but was not found on PATH."
    log_error "Please install curl manually and re-run this script."
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    log_error "jq is required but was not found on PATH (used to read config/*.json)."
    exit 1
fi

# --- 2. OS / distro detection ---
if ! detect_os; then
    log_error "Unsupported operating system or Linux distribution."
    log_error "Supported: Arch-based, Debian-based, Fedora, openSUSE, RHEL-based, Kali, macOS."
    echo ""
    log_plain "Official installation docs for each required tool:"
    log_plain "  - Deno:   https://docs.deno.com/runtime/getting_started/installation/"
    log_plain "  - Node.js: https://nodejs.org/en/download"
    log_plain "  - pnpm:   https://pnpm.io/installation"
    log_plain "  - Rustup: https://www.rust-lang.org/tools/install"
    exit 1
fi

log_info "$OS_PLATFORM ($OS_DISTRO) | $OS_ARCH | package manager: $PKG_MANAGER"

# --- 3. Homebrew bootstrap (macOS only) ---
if [ "$PKG_MANAGER" = "brew" ]; then
    ensure_homebrew_installed || log_warning "Homebrew could not be installed automatically."
fi

# --- 4. sudo access (Linux only - cached once up front, then silent for the rest of the run) ---
SUDO_KEEPALIVE_PID=""

request_sudo_if_needed() {
    [ "$SKIP_ELEVATION" = "true" ] && { log_warning "Continuing without requesting sudo access (--skip-elevation). Some installations may fail."; return 0; }
    [ "$OS_PLATFORM" != "linux" ] && return 0
    if [ "$(id -u)" -eq 0 ]; then
        log_success "Already running as root."
        return 0
    fi
    if ! command -v sudo >/dev/null 2>&1; then
        log_warning "sudo not found; package-manager installs may fail without root privileges."
        return 0
    fi

    log_info "Requesting sudo access once up front (stays cached for the rest of the run)..."
    if ! sudo -v; then
        log_error "Could not obtain sudo access."
        exit 1
    fi

    ( while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done ) &
    SUDO_KEEPALIVE_PID=$!
}

cleanup() {
    [ -n "$SUDO_KEEPALIVE_PID" ] && kill "$SUDO_KEEPALIVE_PID" 2>/dev/null
}
trap cleanup EXIT

request_sudo_if_needed

if [ "$DRY_RUN" = "true" ]; then
    log_warning "DRY-RUN mode active: no installs/changes will be made."
fi

# --- 5. Optional tools (asked once, up front - never inside a background job) ---
log_banner "Optional Tools"

resolve_optional_tool_decisions "$ACCEPT_CSV" "$REJECT_CSV" "$YES"

RUN_AUDIT_FLAG=""
[ "${OPTIONAL_DECISIONS[deno-audit]:-false}" = "true" ] && RUN_AUDIT_FLAG="--run-audit"

# --- 6. Config / path resolution ---
PROJECT_PATHS_JSON="$CONFIG_DIR/project-paths.json"

# devkit/shell/bootstrap.sh -> 2 levels up = project root.
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../" && pwd)"

to_abs_path() {
    local rel_path="$1"
    if [ -z "$rel_path" ] || [ "$rel_path" = "null" ]; then
        echo ""
    elif [[ "$rel_path" = /* ]]; then
        echo "$rel_path"
    else
        echo "$PROJECT_ROOT/$rel_path"
    fi
}

DENO_FUNCTIONS_DIR=$(to_abs_path "$(jq -r '.denoFunctionsDir' "$PROJECT_PATHS_JSON")")
PNPM_PACKAGE_DIR=$(to_abs_path "$(jq -r '.pnpmPackageDir' "$PROJECT_PATHS_JSON")")

RESULTS_DIR=$(mktemp -d)

# --- 7. Phase 1/2: toolchain checks (dependency graph, parallel workflows) ---
log_banner "1/2 - Toolchain Check"

TOOLCHAIN_DIR="$SCRIPT_DIR/scripts/toolchain"

TOOLCHAIN_TASKS=(
    # --- Deno workflow: Deno itself, then its four built-in sub-tools.
    #     Lint/Fmt/Check/Inspector ship inside the same binary - see
    #     deno-subtool-check.sh - so they only depend on 'Deno' having
    #     landed, not on each other. ---
    "Deno|$TOOLCHAIN_DIR/check-deno.sh|$DRY_RUN_FLAG|"
    "Deno Lint|$TOOLCHAIN_DIR/check-deno-lint.sh|$DRY_RUN_FLAG|Deno"
    "Deno Fmt|$TOOLCHAIN_DIR/check-deno-fmt.sh|$DRY_RUN_FLAG|Deno"
    "Deno Check|$TOOLCHAIN_DIR/check-deno-typecheck.sh|$DRY_RUN_FLAG|Deno"
    "Deno Inspector|$TOOLCHAIN_DIR/check-deno-inspector.sh|$DRY_RUN_FLAG|Deno"

    # --- Node & pnpm workflow: src/ React package tooling. ---
    "Node.js|$TOOLCHAIN_DIR/check-node.sh|$DRY_RUN_FLAG|"
    "pnpm|$TOOLCHAIN_DIR/check-pnpm.sh|$DRY_RUN_FLAG|Node.js"

    # --- Docs workflow: mdBook has no package-manager package, only
    #     'cargo install', so Rustup->Cargo are kept solely to carry it. ---
    "Rustup|$TOOLCHAIN_DIR/check-rustup.sh|$DRY_RUN_FLAG|"
    "Cargo|$TOOLCHAIN_DIR/check-cargo.sh|$DRY_RUN_FLAG|Rustup"
    "mdBook|$TOOLCHAIN_DIR/check-mdbook.sh|$DRY_RUN_FLAG|Cargo"
)

if [ "${OPTIONAL_DECISIONS[semgrep]:-false}" = "true" ]; then
    TOOLCHAIN_TASKS+=("Semgrep|$TOOLCHAIN_DIR/check-semgrep.sh|$DRY_RUN_FLAG|")
fi

if [ "${OPTIONAL_DECISIONS[sqlfluff]:-false}" = "true" ]; then
    TOOLCHAIN_TASKS+=("SQLFluff|$TOOLCHAIN_DIR/check-sqlfluff.sh|$DRY_RUN_FLAG|")
fi

run_task_graph "$RESULTS_DIR" "${TOOLCHAIN_TASKS[@]}"

# --- 8. Phase 2/2: project dependencies (Deno Deps / pnpm Deps run in
#        parallel; Vitest is a single-task chain off pnpm Deps) ---
log_banner "2/2 - Project Dependencies"

DEP_DIR="$SCRIPT_DIR/scripts/dependencies"

DENO_DEPS_ARGS="$RUN_AUDIT_FLAG $DRY_RUN_FLAG"
[ -n "$DENO_FUNCTIONS_DIR" ] && DENO_DEPS_ARGS="--functions-dir $DENO_FUNCTIONS_DIR $DENO_DEPS_ARGS"

PNPM_DEPS_ARGS="$DRY_RUN_FLAG"
[ -n "$PNPM_PACKAGE_DIR" ] && PNPM_DEPS_ARGS="--package-dir $PNPM_PACKAGE_DIR $PNPM_DEPS_ARGS"

DEP_TASKS=(
    # supabase/functions/ (Deno) - deno install, then deno audit last in the
    # same chain when approved (see parse-deno.sh).
    "Deno Deps|$DEP_DIR/parse-deno.sh|$DENO_DEPS_ARGS|"
    # src/ (React + pnpm) - existing package.json/pnpm-lock.yaml/tsconfig.json/orval.config.ts are left untouched.
    "pnpm Deps|$DEP_DIR/parse-pnpm.sh|$PNPM_DEPS_ARGS|"
    # tests/ (Vitest) - only confirms Vitest resolves via pnpm exec; needs
    # 'pnpm Deps' (node_modules) to have landed first, so this runs in its
    # own layer right after it rather than in the same parallel batch (see
    # parse-vitest.sh's own NOTE).
    "Vitest|$DEP_DIR/parse-vitest.sh|$PNPM_DEPS_ARGS|pnpm Deps"
)

run_task_graph "$RESULTS_DIR" "${DEP_TASKS[@]}"

# --- 9. Summary table ---
show_summary_table "$RESULTS_DIR"

if [ "$CV_SUMMARY_FAILED" -gt 0 ]; then
    exit 1
fi
exit 0
