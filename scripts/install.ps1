# Fermi installer for Windows (x64)
# Usage: irm https://raw.githubusercontent.com/FelixRuiGao/Fermi/main/scripts/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = if ($env:FERMI_REPO) { $env:FERMI_REPO } else { "FelixRuiGao/Fermi" }
$InstallDir = if ($env:FERMI_INSTALL_DIR) { $env:FERMI_INSTALL_DIR } else { "$env:USERPROFILE\.fermi\bin" }
$Asset = "fermi-win32-x64.tar.gz"

if ($env:FERMI_VERSION) {
    $Url = "https://github.com/$Repo/releases/download/$env:FERMI_VERSION/$Asset"
} else {
    $Url = "https://github.com/$Repo/releases/latest/download/$Asset"
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "fermi-install-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
$TarballPath = Join-Path $TempDir $Asset

try {
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $TarballPath -UseBasicParsing

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    tar -xzf $TarballPath -C $InstallDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to extract tarball"
        exit 1
    }

    # Add to user PATH if not already there
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($UserPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$UserPath", "User")
        Write-Host ""
        Write-Host "Added $InstallDir to your PATH."
        Write-Host "Restart your terminal for PATH changes to take effect."
    }

    $FermiExe = Join-Path $InstallDir "fermi.exe"
    if (Test-Path $FermiExe) {
        $Version = & $FermiExe --version 2>$null
        Write-Host ""
        Write-Host "Installed Fermi $Version"
    } else {
        # Bun-compiled binaries on Windows may not have .exe extension
        $FermiBin = Join-Path $InstallDir "fermi"
        if (Test-Path $FermiBin) {
            $Version = & $FermiBin --version 2>$null
            Write-Host ""
            Write-Host "Installed Fermi $Version"
        } else {
            Write-Host ""
            Write-Host "Installed Fermi"
        }
    }

    Write-Host ""
    Write-Host "To get started:"
    Write-Host "  fermi init"
} finally {
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
