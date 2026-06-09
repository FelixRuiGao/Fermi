param(
    [Parameter(Mandatory = $true)][int]$ParentPid,
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][string]$StagedDir,
    [Parameter(Mandatory = $true)][string]$ExePath,
    [Parameter(Mandatory = $true)][string]$ArgsFile
)

$ErrorActionPreference = "Stop"

function Wait-ForParentExit {
    # NB: do NOT name this parameter $Pid — $PID is a ReadOnly + AllScope
    # automatic variable in PowerShell (AllScope copies it into every new
    # scope), so binding a same-named parameter throws the terminating
    # error "Cannot overwrite variable PID because it is read-only or
    # constant." That aborts the whole self-update before any file is
    # copied, REGARDLESS of $ErrorActionPreference — a parameter-binding /
    # scope-variable-creation error is unconditionally terminating.
    param([int]$ProcessId)

    while ($true) {
        $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($null -eq $proc) { break }
        Start-Sleep -Milliseconds 200
    }

    Start-Sleep -Milliseconds 200
}

function Copy-StagedEntries {
    param(
        [string]$SourceDir,
        [string]$TargetDir
    )

    Get-ChildItem -Force $SourceDir | ForEach-Object {
        $dest = Join-Path $TargetDir $_.Name

        if ($_.PSIsContainer) {
            if (Test-Path $dest) {
                Remove-Item $dest -Recurse -Force
            }
            Copy-Item $_.FullName $dest -Recurse -Force
            return
        }

        $tmp = "$dest.tmp"
        if (Test-Path $tmp) {
            Remove-Item $tmp -Force
        }
        Copy-Item $_.FullName $tmp -Force
        if (Test-Path $dest) {
            Remove-Item $dest -Force
        }
        Move-Item $tmp $dest -Force
    }
}

$HomeDir = Split-Path $ExePath -Parent | Split-Path -Parent
$MarkerFile = Join-Path $HomeDir ".update-handoff-pending"

Wait-ForParentExit -ProcessId $ParentPid
Copy-StagedEntries -SourceDir $StagedDir -TargetDir $InstallDir
Remove-Item $StagedDir -Recurse -Force

if (Test-Path $MarkerFile) {
    Remove-Item $MarkerFile -Force
}

$RestartArgs = @()
if (Test-Path $ArgsFile) {
    $ParsedArgs = Get-Content -Raw $ArgsFile | ConvertFrom-Json
    if ($null -ne $ParsedArgs) {
        $RestartArgs = @($ParsedArgs)
    }
    Remove-Item $ArgsFile -Force
}

# Windows PowerShell 5.1 rejects `-ArgumentList @()` (an empty collection
# fails ArgumentList's validation; the fix only landed in PowerShell Core).
# The common no-extra-args relaunch yields an empty array, so omit the
# parameter entirely in that case rather than passing an empty array.
if ($RestartArgs.Count -gt 0) {
    Start-Process -FilePath $ExePath -ArgumentList $RestartArgs | Out-Null
} else {
    Start-Process -FilePath $ExePath | Out-Null
}
