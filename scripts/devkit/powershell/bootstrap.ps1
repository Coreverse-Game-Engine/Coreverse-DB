#Requires -Version 7.0
<#
.SYNOPSIS
    Coreverse-DB Bootstrap - Windows entry point.
.DESCRIPTION
    Toolchain inspection/installation and project dependency resolution,
    automated by a single command. Independent tools/workflows run in
    parallel; dependents within a workflow (Deno->its subtools, Node->pnpm,
    Rustup->Cargo->mdBook, pnpm Deps->Vitest) run inline as a task-graph
    layer chain.
.PARAMETER Yes
    Unapproved/unattended mode. Without -Accept/-Reject, optional tools
    default to skipped in this mode (no interactive prompt is possible).
.PARAMETER DryRun
    Simply log what happens without making any installations or changes.
.PARAMETER SkipElevation
    For testing purposes: skip automatic administrator privilege escalation.
.PARAMETER Accept
    Optional tool ids to install without asking: 'semgrep', 'sqlfluff',
    'deno-audit'. Pass 'all' to approve every optional tool without asking.
    Example: -Accept semgrep,sqlfluff
.PARAMETER Reject
    Optional tool ids to skip without asking (same id set as -Accept). Pass
    'none' to skip every optional tool without asking (the literal word
    'none' here means "install none of them", not "reject nothing").
    If an id appears in both -Accept and -Reject, -Reject wins.
.EXAMPLE
    ./bootstrap.ps1
.EXAMPLE
    ./bootstrap.ps1 -DryRun
.EXAMPLE
    ./bootstrap.ps1 -Accept all
.EXAMPLE
    ./bootstrap.ps1 -Accept semgrep -Reject sqlfluff,deno-audit
#>
[CmdletBinding()]
param(
    [switch]$Yes,
    [switch]$DryRun,
    [switch]$SkipElevation,
    [string[]]$Accept = @(),
    [string[]]$Reject = @()
)

$ErrorActionPreference = 'Stop'
$PSRoot = $PSScriptRoot
$ScriptsRoot = Resolve-Path "$PSScriptRoot\..\..\"

. "$PSRoot/scripts/common/logger.ps1"
. "$PSRoot/scripts/common/os-detect.ps1"
. "$PSRoot/scripts/common/parallel-runner.ps1"
. "$PSRoot/scripts/common/optional-tools.ps1"
. "$PSRoot/scripts/final/summary-table.ps1"

Write-Banner -Title 'Coreverse-DB Bootstrap (Windows)'

# --- 0. PowerShell Version Inspection ---
# Invoke-TaskGraph / Invoke-ParallelTasks uses ForEach-Object -Parallel (via
# Start-ThreadJob), which requires PS 7.0+.
if (-not (Test-MinimumPSVersion -MinimumMajor 7)) {
    Write-ErrorLog -Message "PowerShell 7 or later is required. Current: $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))."
    Write-ErrorLog -Message 'For installation: https://aka.ms/powershell-release?tag=stable'
    exit 1
}

# --- 1. Environment Info ---
$osInfo = Get-OSInfo
Write-InfoLog -Message "$($osInfo.Caption) | $($osInfo.Architecture) | PowerShell $($osInfo.PSVersion) ($($osInfo.PSEdition))"

# --- 2. Administrator Privileges (one-time elevation, then silently resume) ---
if (-not $osInfo.IsAdmin -and -not $SkipElevation -and -not $env:COREVERSE_BOOTSTRAP_ELEVATED) {
    Write-WarningLog -Message "Administrator privileges are required; restarting with elevated session..."

    # Ensure the new elevated window starts in the correct directory and stays open on failure.
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    if ($Yes)    { $argList += '-Yes' }
    if ($DryRun) { $argList += '-DryRun' }
    if ($Accept.Count -gt 0) { $argList += '-Accept'; $argList += ($Accept -join ',') }
    if ($Reject.Count -gt 0) { $argList += '-Reject'; $argList += ($Reject -join ',') }

    $env:COREVERSE_BOOTSTRAP_ELEVATED = '1'
    try {
        Start-Process -FilePath 'pwsh' -ArgumentList $argList -WorkingDirectory $PWD -Verb RunAs -Wait
        exit $LASTEXITCODE
    } catch {
        Write-ErrorLog -Message "The elevated session could not be started: $($_.Exception.Message)"
        Write-ErrorLog -Message 'Please run this script manually in an administrator PowerShell window.'
        exit 1
    }
}

if ($osInfo.IsAdmin) {
    Write-SuccessLog -Message 'Running with administrator privileges.'
} else {
    Write-WarningLog -Message 'Continuing without administrator privileges (-SkipElevation). Some installations may fail.'
}

if ($DryRun) {
    Write-WarningLog -Message 'DRY-RUN mode enabled: no installations or modifications will be made.'
}

# --- 3. Configuration Loading & Path Resolution ---
$toolVersions = Get-Content "$ScriptsRoot/devkit/config/tool-versions.json" -Raw | ConvertFrom-Json
$projectPaths = Get-Content "$ScriptsRoot/devkit/config/project-paths.json" -Raw | ConvertFrom-Json

$commonArgs = @{ DryRun = [bool]$DryRun }

# Centralized Absolute Path Resolution.
# devkit/powershell/bootstrap.ps1 -> 3 levels up = project root.
$ProjectRoot = (Resolve-Path "$PSRoot\..\..\..\").Path

function ConvertTo-AbsolutePath {
    param([string]$RelPath)

    if ([string]::IsNullOrWhiteSpace($RelPath)) {
        return $null
    }

    if ([System.IO.Path]::IsPathRooted($RelPath)) {
        return $RelPath
    }

    return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $RelPath))
}

Write-InfoLog -Message "Resolving project paths relative to Project Root: $ProjectRoot"

$absDenoFunctionsDir = ConvertTo-AbsolutePath $projectPaths.denoFunctionsDir
$absPnpmPackageDir   = ConvertTo-AbsolutePath $projectPaths.pnpmPackageDir

function ConvertTo-FlatResults {

    param(
        [array]$GraphResults
    )

    $flat = @()

    foreach ($r in $GraphResults) {

        if (-not $r.Success) {

            Write-ErrorLog -Message "$($r.Name): $($r.Error)"

            $flat += [PSCustomObject]@{
                Tool         = $r.Name
                FinalVersion = $null
                Status       = 'Failed'
            }

            continue
        }

        if ($null -eq $r.Result) {

            Write-ErrorLog -Message "$($r.Name): No result returned."

            $flat += [PSCustomObject]@{
                Tool         = $r.Name
                FinalVersion = $null
                Status       = 'Failed'
            }

            continue
        }

        # A task's Result may be a single object (most check-*.ps1) or an
        # array (parse-deno.ps1 returns 'Deno Dependencies' + optionally
        # 'deno audit' from one task) - both flatten correctly here.
        $flat += $r.Result
    }

    return $flat
}

# --- 4. Optional Tools (asked once, up front - never inside a parallel job) ---
Write-Banner -Title 'Optional Tools'

$optionalCatalog = @(
    @{ Id = 'semgrep';    DisplayName = 'Semgrep (static analyzer)' }
    @{ Id = 'sqlfluff';   DisplayName = 'SQLFluff (SQL lint + static analysis)' }
    @{ Id = 'deno-audit'; DisplayName = 'deno audit (dependency vulnerability audit)' }
)

$optionalDecisions = Resolve-OptionalToolDecisions `
    -Catalog $optionalCatalog `
    -Accept $Accept `
    -Reject $Reject `
    -Yes:$Yes `
    -DryRun:$DryRun

# --- 5. Phase 1: Toolchain Inspection (Dependency graph, parallel workflows) ---
Write-Banner -Title '1/2 - Toolchain Inspection'

$toolchainDir = "$PSRoot/scripts/toolchain"

$toolchainTasks = @(
    # --- Deno workflow: Deno itself, then its four built-in sub-tools.
    #     Lint/Fmt/Check/Inspector ship inside the same binary - see
    #     deno-subtool-check.ps1 - so they only DependsOn = 'Deno' having
    #     landed, not on each other. ---
    @{ Name = 'Deno';           ScriptPath = "$toolchainDir/check-deno.ps1";           DependsOn = @();      Arguments = (@{ RequiredVersion = $toolVersions.deno.minVersion } + $commonArgs) }
    @{ Name = 'Deno Lint';      ScriptPath = "$toolchainDir/check-deno-lint.ps1";      DependsOn = @('Deno'); Arguments = $commonArgs }
    @{ Name = 'Deno Fmt';       ScriptPath = "$toolchainDir/check-deno-fmt.ps1";       DependsOn = @('Deno'); Arguments = $commonArgs }
    @{ Name = 'Deno Check';     ScriptPath = "$toolchainDir/check-deno-typecheck.ps1"; DependsOn = @('Deno'); Arguments = $commonArgs }
    @{ Name = 'Deno Inspector'; ScriptPath = "$toolchainDir/check-deno-inspector.ps1"; DependsOn = @('Deno'); Arguments = $commonArgs }

    # --- Node & pnpm workflow: src/ React package tooling. ---
    @{ Name = 'Node.js'; ScriptPath = "$toolchainDir/check-node.ps1"; DependsOn = @();          Arguments = (@{ RequiredVersion = $toolVersions.node.minVersion } + $commonArgs) }
    @{ Name = 'pnpm';    ScriptPath = "$toolchainDir/check-pnpm.ps1"; DependsOn = @('Node.js');  Arguments = (@{ RequiredVersion = $toolVersions.pnpm.minVersion } + $commonArgs) }

    # --- Docs workflow: mdBook has no winget/pip-style package, only
    #     `cargo install`, so Rustup->Cargo are kept solely to carry it. ---
    @{ Name = 'Rustup'; ScriptPath = "$toolchainDir/check-rustup.ps1"; DependsOn = @();        Arguments = (@{ RequiredVersion = $toolVersions.rustup.minVersion } + $commonArgs) }
    @{ Name = 'Cargo';  ScriptPath = "$toolchainDir/check-cargo.ps1";  DependsOn = @('Rustup'); Arguments = (@{ RequiredVersion = $toolVersions.cargo.minVersion } + $commonArgs) }
    @{ Name = 'mdBook'; ScriptPath = "$toolchainDir/check-mdbook.ps1"; DependsOn = @('Cargo');  Arguments = (@{ RequiredVersion = $toolVersions.mdbook.minVersion } + $commonArgs) }
)

if ($optionalDecisions['semgrep']) {
    $toolchainTasks += @{ Name = 'Semgrep'; ScriptPath = "$toolchainDir/check-semgrep.ps1"; DependsOn = @(); Arguments = (@{ RequiredVersion = $toolVersions.semgrep.minVersion } + $commonArgs) }
}

if ($optionalDecisions['sqlfluff']) {
    $toolchainTasks += @{ Name = 'SQLFluff'; ScriptPath = "$toolchainDir/check-sqlfluff.ps1"; DependsOn = @(); Arguments = (@{ RequiredVersion = $toolVersions.sqlfluff.minVersion } + $commonArgs) }
}

$toolchainGraphResults = Invoke-TaskGraph -Tasks $toolchainTasks
$toolchainFlat = ConvertTo-FlatResults -GraphResults $toolchainGraphResults

# --- 6. Phase 2: Project Dependencies (Deno Deps / pnpm Deps run in
#        parallel; Vitest is a single-task chain off pnpm Deps) ---
Write-Banner -Title '2/2 - Project Dependencies'

$depDir = "$PSRoot/scripts/dependencies"

$depTasks = @(
    # supabase/functions/ (Deno) - deno install, then deno audit last in the
    # same chain when approved (see parse-deno.ps1).
    @{ Name = 'Deno Deps'; ScriptPath = "$depDir/parse-deno.ps1"; DependsOn = @(); Arguments = (@{ FunctionsDir = $absDenoFunctionsDir; RunAudit = [bool]$optionalDecisions['deno-audit'] } + $commonArgs) }
    # src/ (React + pnpm) - existing package.json/pnpm-lock.yaml/tsconfig.json/orval.config.ts are left untouched.
    @{ Name = 'pnpm Deps'; ScriptPath = "$depDir/parse-pnpm.ps1"; DependsOn = @(); Arguments = (@{ PackageDir = $absPnpmPackageDir } + $commonArgs) }
    # tests/ (Vitest) - only confirms Vitest resolves via pnpm exec; needs
    # 'pnpm Deps' (node_modules) to have landed first (see parse-vitest.ps1's
    # own NOTES).
    @{ Name = 'Vitest'; ScriptPath = "$depDir/parse-vitest.ps1"; DependsOn = @('pnpm Deps'); Arguments = (@{ PackageDir = $absPnpmPackageDir } + $commonArgs) }
)

$depGraphResults = Invoke-TaskGraph -Tasks $depTasks
$depFlat = ConvertTo-FlatResults -GraphResults $depGraphResults

# --- 7. Summary Table and Exit Code ---
$allResults = @()
$allResults += $toolchainFlat
$allResults += $depFlat

$summary = Show-SummaryTable -Results $allResults

if ($summary.FailedCount -gt 0) {
    exit 1
} else {
    exit 0
}
