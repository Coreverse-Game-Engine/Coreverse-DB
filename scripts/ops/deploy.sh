#!/usr/bin/env bash
# Phase 6B -- guarded production rollout of the Supabase backend.
#
# DRY-RUN BY DEFAULT: with no flag this only prints what it WOULD do and
# runs read-only checks. Nothing is pushed or deployed until you pass
# --apply, and even then every mutating step asks for confirmation.
#
#   bash scripts/ops/deploy.sh                 # plan + read-only checks
#   bash scripts/ops/deploy.sh --apply         # do it, step by step
#   bash scripts/ops/deploy.sh --apply --secrets   # also (re)upload secrets
#
# Prerequisites (this script verifies what it can):
#   * `supabase login` done and the repo linked: `supabase link --project-ref <ref>`
#   * a fresh production backup exists (docs/src/operations/database-backup.md)
#   * scripts/ops/verify-local.sh is green on the commit you are deploying
#
# Secrets: --secrets uploads supabase/.env.production (gitignored) with
# `supabase secrets set --env-file`. That file must NEVER be committed or
# shared; if it has ever left your machine, rotate every value in it first.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

APPLY=0; SECRETS=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --secrets) SECRETS=1 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

# Edge Functions to deploy: every dir under supabase/functions except _shared.
mapfile -t FUNCTIONS < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_*' -printf '%f\n' | sort)

confirm() { # confirm "<question>"
  [[ "$APPLY" == "1" ]] || return 1
  read -r -p "$1 [type 'yes'] " ans; [[ "$ans" == "yes" ]]
}
step() { echo; echo "=== $*"; }

command -v supabase >/dev/null || { echo "supabase CLI not found" >&2; exit 1; }

step "0. Preconditions"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "WARNING: working tree has uncommitted changes. Deploy from a clean commit." >&2
  [[ "$APPLY" == "1" ]] && exit 1
fi
echo "commit: $(git rev-parse --short HEAD) ($(git branch --show-current))"
REF_FILE=supabase/.temp/project-ref
if [[ -f "$REF_FILE" ]]; then echo "linked project ref: $(cat "$REF_FILE")"; else echo "NOT LINKED -- run: supabase link --project-ref <ref>" >&2; [[ "$APPLY" == "1" ]] && exit 1; fi
grep -q 'verify_jwt = false' supabase/config.toml || { echo "config.toml has no [functions.send-email] verify_jwt = false" >&2; exit 1; }

step "1. Pending migrations (read-only)"
supabase db push --dry-run

step "2. Apply migrations to PRODUCTION"
echo "Includes 20261003094840_username_availability and 20261003095018_account_deletion_readiness"
echo "(the latter loosens ON DELETE on several FKs -- take/confirm the backup first)."
if confirm "Run 'supabase db push' against the linked project?"; then supabase db push; else echo "(skipped)"; fi

if [[ "$SECRETS" == "1" ]]; then
  step "3. Secrets"
  [[ -f supabase/.env.production ]] || { echo "supabase/.env.production not found" >&2; exit 1; }
  # Print names only, never values.
  echo "would upload keys: $(grep -E '^[A-Z_]+=' supabase/.env.production | cut -d= -f1 | tr '\n' ' ')"
  if confirm "Upload these secrets?"; then supabase secrets set --env-file supabase/.env.production; else echo "(skipped)"; fi
fi
step "3b. Secrets currently set on the project (names/digests only)"
supabase secrets list || true
echo "Expected: WEBSITE_ALLOWED_ORIGINS SEND_EMAIL_HOOK_SECRET BREVO_API_KEY BREVO_SENDER_EMAIL BREVO_SENDER_NAME DOCS_REINDEX_TOKEN"
echo "(SUPABASE_URL / SUPABASE_ANON_KEY / SERVICE_ROLE_KEY are injected by the platform.)"

step "4. Edge Functions: ${FUNCTIONS[*]}"
for fn in "${FUNCTIONS[@]}"; do
  if confirm "Deploy function '$fn'?"; then supabase functions deploy "$fn"; else echo "(skipped $fn)"; fi
done
echo "send-email picks up verify_jwt=false from supabase/config.toml."

step "5. Manual follow-ups (cannot be scripted)"
cat <<'TXT'
 [ ] Dashboard -> Authentication -> Hooks -> Send Email: enabled, URL = <project>/functions/v1/send-email, secret matches SEND_EMAIL_HOOK_SECRET
 [ ] Dashboard -> Authentication -> URL Configuration: Site URL + Redirect URLs match the Website origin(s) (incl. /*/reset-password)
 [ ] Dashboard -> Authentication -> Rate limits / password policy reviewed (config.toml is local-only)
 [ ] Then run the smoke test:  COREVERSE_BASE_URL=... COREVERSE_ALLOWED_ORIGIN=... node scripts/ops/smoke.mjs
 [ ] Then the manual checks in docs/src/operations/production-verification.md (6C)
TXT
if [[ "$APPLY" != "1" ]]; then echo; echo "(dry run -- nothing was changed. Re-run with --apply to execute.)"; fi
