<#
.SYNOPSIS
  Windows (PowerShell) port of scripts/ops/deploy.sh: guarded rollout of the
  Supabase backend (migrations -> secrets -> Edge Functions).

.DESCRIPTION
  DRY-RUN BY DEFAULT. With no switch it only prints what it WOULD do and runs
  read-only checks. Nothing is pushed or deployed until you pass -Apply, and
  even then every mutating step asks for confirmation.

    pwsh scripts/ops/deploy.ps1                    # plan + read-only checks
    pwsh scripts/ops/deploy.ps1 -Apply             # do it, step by step
    pwsh scripts/ops/deploy.ps1 -Apply -Secrets    # also (re)upload secrets
    pwsh scripts/ops/deploy.ps1 -Apply -Only faq,auth   # just these functions
    pwsh scripts/ops/deploy.ps1 -Apply -UseApi     # bundle server-side (no Docker)

  Works in PowerShell 7 and Windows PowerShell 5.1. Needs: supabase CLI (logged
  in, repo linked), git, node. Docker Desktop must be running unless -UseApi.

  Secrets: -Secrets uploads supabase/.env.production (gitignored). That file must
  NEVER be committed or shared.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Secrets,
  [switch]$UseApi,
  [string[]]$Only
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

function Step([string]$Text) { Write-Host ''; Write-Host "=== $Text" -ForegroundColor Cyan }
function Fail([string]$Text) { Write-Host $Text -ForegroundColor Red; exit 1 }
function Confirm-Step([string]$Question) {
  if (-not $Apply) { return $false }
  $answer = Read-Host "$Question [type 'yes']"
  return ($answer -eq 'yes')
}
function Invoke-Native([string]$What, [scriptblock]$Block, [switch]$AllowFailure) {
  & $Block | Out-Host   # stream to the console; keep the function's return value a clean boolean
  if ($LASTEXITCODE -ne 0) {
    if ($AllowFailure) { Write-Host "($What exited with $LASTEXITCODE)" -ForegroundColor Yellow; return $false }
    Fail "$What failed (exit code $LASTEXITCODE)."
  }
  return $true
}

foreach ($tool in 'supabase', 'git', 'node') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool not found on PATH" }
}

# Edge Functions to deploy: every dir under supabase/functions except _shared.
$functions = Get-ChildItem -Directory 'supabase/functions' |
  Where-Object { $_.Name -notlike '_*' } | Sort-Object Name | ForEach-Object { $_.Name }
if ($Only) {
  $unknown = $Only | Where-Object { $_ -notin $functions }
  if ($unknown) { Fail "Unknown function(s): $($unknown -join ', '). Known: $($functions -join ', ')" }
  $functions = $Only
}

Step '0. Preconditions'
git diff --quiet; $dirty1 = $LASTEXITCODE
git diff --cached --quiet; $dirty2 = $LASTEXITCODE
if ($dirty1 -ne 0 -or $dirty2 -ne 0) {
  Write-Host 'WARNING: working tree has uncommitted changes. Deploy from a clean commit.' -ForegroundColor Yellow
  if ($Apply) { exit 1 }
}
Write-Host ("commit: {0} ({1})" -f (git rev-parse --short HEAD), (git branch --show-current))
$refFile = 'supabase/.temp/project-ref'
if (Test-Path $refFile) { Write-Host ("linked project ref: {0}" -f (Get-Content $refFile -Raw).Trim()) }
else {
  Write-Host 'NOT LINKED -- run: supabase link --project-ref <ref>' -ForegroundColor Yellow
  if ($Apply) { exit 1 }
}

# `supabase functions deploy` needs an import map for the bare specifiers
# (@std/http/server, zod, ...); the repo-root deno.json is not used for bundling.
# We pass supabase/functions/import_map.json explicitly (--import-map). Do NOT add
# supabase/functions/deno.json: `deno fmt` would treat it as a nested config.
$importMap = 'supabase/functions/import_map.json'
if (-not (Test-Path $importMap)) { Fail "$importMap is missing (import map for supabase functions deploy)." }
Invoke-Native 'static checks' { node scripts/ops/static-checks.mjs --strict } | Out-Null

# Functions deployed WITHOUT the platform JWT gate (supabase/config.toml).
$jwtExempt = 'send-email', 'auth', 'profiles', 'releases', 'news', 'events', 'faq', 'polls', 'discussions', 'docs'
$configToml = Get-Content 'supabase/config.toml' -Raw
foreach ($fn in $jwtExempt) {
  if ($configToml -notmatch "(?m)^\[functions\.$([regex]::Escape($fn))\]") {
    Fail "config.toml has no [functions.$fn] section (verify_jwt = false)"
  }
}

if (-not $UseApi) {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Docker is not running. Start Docker Desktop, or re-run with -UseApi (server-side bundling).' -ForegroundColor Yellow
    if ($Apply) { exit 1 }
  }
}

Step '1. Pending migrations (read-only)'
Invoke-Native 'db push --dry-run' { supabase db push --dry-run } | Out-Null

Step '2. Apply migrations to PRODUCTION'
Write-Host 'Includes 20261003094840_username_availability and 20261003095018_account_deletion_readiness'
Write-Host '(the latter loosens ON DELETE on several FKs -- take/confirm the backup first).'
if (Confirm-Step "Run 'supabase db push' against the linked project?") {
  Invoke-Native 'db push' { supabase db push } | Out-Null
} else { Write-Host '(skipped)' }

if ($Secrets) {
  Step '3. Secrets'
  if (-not (Test-Path 'supabase/.env.production')) { Fail 'supabase/.env.production not found' }
  $keys = Get-Content 'supabase/.env.production' | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { ($_ -split '=', 2)[0] }
  Write-Host ("would upload keys: {0}" -f ($keys -join ' '))   # names only, never values
  if (Confirm-Step 'Upload these secrets?') {
    Invoke-Native 'secrets set' { supabase secrets set --env-file supabase/.env.production } | Out-Null
  } else { Write-Host '(skipped)' }
}

Step '3b. Secrets currently set on the project (names/digests only)'
Invoke-Native 'secrets list' { supabase secrets list } -AllowFailure | Out-Null
Write-Host 'Expected: WEBSITE_ALLOWED_ORIGINS (every Website origin, incl. staging) SEND_EMAIL_HOOK_SECRET BREVO_API_KEY BREVO_SENDER_EMAIL BREVO_SENDER_NAME DOCS_REINDEX_TOKEN'
Write-Host '(SUPABASE_URL / SUPABASE_ANON_KEY / SERVICE_ROLE_KEY are injected by the platform.)'

Step ("4. Edge Functions: {0}" -f ($functions -join ' '))
$deployed = @(); $failed = @()
foreach ($fn in $functions) {
  if (Confirm-Step "Deploy function '$fn'?") {
    # Do not add --no-verify-jwt: verify_jwt comes from supabase/config.toml.
    $ok = if ($UseApi) { Invoke-Native "deploy $fn" { supabase functions deploy $fn --import-map $importMap --use-api } -AllowFailure }
          else         { Invoke-Native "deploy $fn" { supabase functions deploy $fn --import-map $importMap } -AllowFailure }
    if ($ok) { $deployed += $fn } else { $failed += $fn }
  } else { Write-Host "(skipped $fn)" }
}
Write-Host 'Gate setting (verify_jwt) is applied at deploy time: deploy ALL functions after changing config.toml, not only changed ones.'
if ($Apply) {
  Write-Host ("deployed: {0}" -f ($deployed -join ' ')) -ForegroundColor Green
  if ($failed) { Write-Host ("FAILED:   {0}" -f ($failed -join ' ')) -ForegroundColor Red }
}

Step '5. Manual follow-ups (cannot be scripted)'
@'
 [ ] supabase functions list  -> all functions ACTIVE
 [ ] Dashboard -> Settings -> API -> Exposed schemas lists: public, graphql_public, releases, identity, content, docs (set by migration 20261012090000; if you edited it by hand, keep this list)
 [ ] Dashboard -> Authentication -> Hooks -> Send Email: enabled, URL = <project>/functions/v1/send-email, secret matches SEND_EMAIL_HOOK_SECRET
     (enable ONLY after the functions are deployed AND the Website route /api/auth/confirm is live)
 [ ] Brevo: click tracking is off for transactional email
 [ ] Dashboard -> Authentication -> URL Configuration: Site URL + Redirect URLs match the Website origin(s) (incl. /*/reset-password)
 [ ] Secret WEBSITE_ALLOWED_ORIGINS lists every Website origin (production, staging, previews; http://localhost:3000 only for a dev project)
 [ ] Smoke test:
       $env:COREVERSE_BASE_URL='https://<ref>.supabase.co/functions/v1'; $env:COREVERSE_ALLOWED_ORIGIN='http://localhost:3000'; node scripts/ops/smoke.mjs
 [ ] Then the manual checks in docs/src/operations/production-verification.md (6C)
'@ | Write-Host
if (-not $Apply) { Write-Host ''; Write-Host '(dry run -- nothing was changed. Re-run with -Apply to execute.)' }
if ($failed) { exit 1 }
