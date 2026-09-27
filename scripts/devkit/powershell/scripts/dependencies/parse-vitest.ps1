#Requires -Version 7.0

<#
.SYNOPSIS
    Confirms the src/ React package's Vitest setup is runnable after pnpm install.

.DESCRIPTION
    Vitest is a plain devDependency (see package.json), so there is nothing
    to "install" the way check-*.ps1 does for a system tool -- pnpm install
    (parse-pnpm.ps1) already put it in node_modules/.bin. This step only
    verifies that resolved correctly, via 'pnpm exec vitest --version'.

    Deliberately does NOT run the actual test suite here: tests/index.test.ts
    and tests/react.test.ts import src/index.ts / src/react.ts, which are
    `export * from "./generated/..."` barrels -- they only resolve after
    'pnpm run generate' has been run, and this devkit's job is
    toolchain/dependency setup, not generating the client. Run
    'pnpm run generate; pnpm test' yourself once this step is green.

.NOTES
    This script assumes parse-pnpm.ps1 (task 'pnpm Deps') has already
    completed successfully -- see bootstrap.ps1's DependsOn wiring.
#>

param(
    [string]$PackageDir = '',
    [switch]$DryRun
)

. "$PSScriptRoot/../common/logger.ps1"

$ToolName = 'Vitest'

$result = [PSCustomObject]@{
    Tool   = $ToolName
    Status = 'Unknown'
    Detail = $null
}

if ([string]::IsNullOrWhiteSpace($PackageDir)) {
    Write-WarningLog `
        -Message "'pnpmPackageDir' is not set in config/project-paths.json. Skipping." `
        -Source $ToolName

    $result.Status = 'Skipped'
    return $result
}

$PackageDir = [System.IO.Path]::GetFullPath($PackageDir)
$packageJsonPath = Join-Path $PackageDir 'package.json'

if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
    Write-WarningLog `
        -Message "No package.json found under '$PackageDir'. Skipping." `
        -Source $ToolName

    $result.Status = 'Skipped'
    return $result
}

$pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue

if (-not $pnpmCmd) {
    Write-ErrorLog `
        -Message 'pnpm not found on PATH. The toolchain phase must be completed first.' `
        -Source $ToolName

    $result.Status = 'Failed'
    return $result
}

if ($DryRun) {
    Write-InfoLog `
        -Message "[DryRun] In '$PackageDir', 'pnpm exec vitest --version' was to be run." `
        -Source $ToolName

    $result.Status = 'DryRun'
    return $result
}

Push-Location $PackageDir

try {
    Write-InfoLog `
        -Message 'Checking Vitest resolves via pnpm exec...' `
        -Source $ToolName

    $vitestOutput = & pnpm exec vitest --version 2>&1
    $vitestExitCode = $LASTEXITCODE

    if ($vitestExitCode -eq 0) {
        $version = ($vitestOutput | Select-Object -Last 1 | Out-String).Trim()

        $result.Status = 'OK'
        $result.Detail = $version

        Write-SuccessLog `
            -Message "Vitest is set up (tests/ -> vitest.config.ts). Run 'pnpm run generate; pnpm test' to execute the suite." `
            -Source $ToolName
    }
    else {
        $result.Status = 'Failed'

        Write-ErrorLog `
            -Message "'pnpm exec vitest --version' ended with error code: $vitestExitCode" `
            -Source $ToolName
    }
}
catch {
    $result.Status = 'Failed'
    $result.Detail = $_.Exception.Message

    Write-ErrorLog `
        -Message "Vitest check failed: $($_.Exception.Message)" `
        -Source $ToolName
}
finally {
    Pop-Location
}

return $result
