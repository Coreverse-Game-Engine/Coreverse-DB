<#
.SYNOPSIS
  Windows (PowerShell) port of scripts/ops/verify-local.sh: run every local/CI
  gate and print a summary. A step whose tool is missing is reported SKIPPED
  (never PASS) and makes the script exit non-zero unless -AllowSkip.

    pwsh scripts/ops/verify-local.ps1
    pwsh scripts/ops/verify-local.ps1 -SkipPgTap     # no Docker available
    pwsh scripts/ops/verify-local.ps1 -AllowSkip
#>
[CmdletBinding()]
param([switch]$SkipPgTap, [switch]$AllowSkip)

$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..\..')
$results = New-Object System.Collections.Generic.List[object]

function Have([string]$cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Run([string]$Name, [scriptblock]$Block) {
  Write-Host ''; Write-Host "=== $Name" -ForegroundColor Cyan
  Write-Host ("`$ {0}" -f $Block.ToString().Trim())
  & $Block
  $status = if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' }
  $results.Add([pscustomobject]@{ Status = $status; Name = $Name })
}
function Skip([string]$Name, [string]$Why) {
  Write-Host ''; Write-Host "=== $Name -- SKIPPED ($Why)" -ForegroundColor Yellow
  $results.Add([pscustomobject]@{ Status = 'SKIP'; Name = $Name })
}

# 0. repo consistency (Node only)
if (Have 'node') {
  Run 'static checks (--strict)' { node scripts/ops/static-checks.mjs --strict }
  Run 'version sync' { node scripts/check-version-sync.mjs }
} else { Skip 'static checks' 'node not installed'; Skip 'version sync' 'node not installed' }

# 1. openapi-lint / client-verify / vitest-unit
if (Have 'pnpm') {
  Run 'pnpm install --frozen-lockfile' { pnpm install --frozen-lockfile }
  Run 'redocly lint' { pnpm exec redocly lint openapi/openapi.yaml }
  Run 'pnpm run verify (generate + no drift + typecheck)' { pnpm run verify }
  Run 'vitest' { pnpm run test }
  Run 'build (tsup)' { pnpm run build }
} else {
  foreach ($s in 'pnpm install', 'redocly lint', 'pnpm run verify', 'vitest', 'build (tsup)') { Skip $s 'pnpm not installed' }
}

# 2. deno-unit
if (Have 'deno') {
  Run 'deno test' { deno task test }
  Run 'deno fmt --check' { deno fmt --check supabase/functions/ }
} else { Skip 'deno test' 'deno not installed'; Skip 'deno fmt --check' 'deno not installed' }

# 3. supabase-pgtap (needs Docker)
if ($SkipPgTap) { Skip 'supabase db lint / pgTAP' '-SkipPgTap' }
elseif ((Have 'supabase') -and (Have 'docker')) {
  $startedHere = $false
  supabase status *> $null
  if ($LASTEXITCODE -ne 0) { Run 'supabase start' { supabase start }; $startedHere = $true }
  Run 'supabase db lint' { supabase db lint }
  Run 'pgTAP (supabase test db)' { supabase test db }
  if ($startedHere) { supabase stop *> $null }
} else { Skip 'supabase db lint / pgTAP' 'supabase CLI or docker not installed' }

Write-Host ''; Write-Host '================ SUMMARY ================'
$results | ForEach-Object { '{0,-4}  {1}' -f $_.Status, $_.Name }
$failed = @($results | Where-Object Status -eq 'FAIL').Count
$skipped = @($results | Where-Object Status -eq 'SKIP').Count
Write-Host '----------------------------------------'
Write-Host "failed: $failed   skipped: $skipped"
if ($failed -gt 0) { exit 1 }
if ($skipped -gt 0 -and -not $AllowSkip) { Write-Host 'Some steps were skipped -- do NOT treat this as green. (-AllowSkip to accept.)'; exit 3 }
Write-Host 'All gates green.' -ForegroundColor Green
