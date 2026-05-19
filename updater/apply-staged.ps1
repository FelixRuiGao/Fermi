$ErrorActionPreference = "Stop"

param(
    [Parameter(Mandatory = $true)][int]$ParentPid,
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][string]$StagedDir,
    [Parameter(Mandatory = $true)][string]$ExePath,
    [Parameter(Mandatory = $true)][string]$ArgsFile
)

function Wait-ForParentExit {
    param([int]$Pid)

    while ($true) {
        $proc = Get-Process -Id $Pid -ErrorAction SilentlyContinue
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

Wait-ForParentExit -Pid $ParentPid
Copy-StagedEntries -SourceDir $StagedDir -TargetDir $InstallDir
Remove-Item $StagedDir -Recurse -Force

$Args = @()
if (Test-Path $ArgsFile) {
    $ParsedArgs = Get-Content -Raw $ArgsFile | ConvertFrom-Json
    if ($null -ne $ParsedArgs) {
        $Args = @($ParsedArgs)
    }
    Remove-Item $ArgsFile -Force
}

Start-Process -FilePath $ExePath -ArgumentList $Args | Out-Null
