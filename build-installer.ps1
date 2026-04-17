#!/usr/bin/env pwsh
# build-installer.ps1 — Full build pipeline for Local Whisper

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "`n=== Local Whisper Installer Build ===" -ForegroundColor Cyan

# 1. Clean previous build artifacts
Write-Host "`n[1/4] Cleaning previous builds..." -ForegroundColor Yellow
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue

# 2. Install dependencies
Write-Host "[2/4] Installing dependencies..." -ForegroundColor Yellow
npm install --ignore-scripts --silent
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed!" -ForegroundColor Red; exit 1 }

# 3. Build the app
Write-Host "[3/4] Building app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

# 4. Package into installer
Write-Host "[4/4] Packaging installer..." -ForegroundColor Yellow
npm run package
if ($LASTEXITCODE -ne 0) { Write-Host "Packaging failed!" -ForegroundColor Red; exit 1 }

# Done
$installer = Get-ChildItem dist\*.exe | Where-Object { $_.Name -notmatch '__uninstaller|blockmap' } | Select-Object -First 1
Write-Host "`n=== Build complete! ===" -ForegroundColor Green
Write-Host "Installer: $($installer.FullName)" -ForegroundColor Green
Write-Host "Size: $([math]::Round($installer.Length / 1MB, 1)) MB" -ForegroundColor Green
