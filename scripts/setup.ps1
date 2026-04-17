#!/usr/bin/env pwsh
# Downloads whisper.cpp Windows binaries into resources/whisper/
# Run once after cloning: npm run setup

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Join-Path $PSScriptRoot '..'
$whisperDir = Join-Path $repoRoot 'resources' 'whisper'
New-Item -ItemType Directory -Force -Path $whisperDir | Out-Null

Write-Host "`nFetching latest whisper.cpp release..." -ForegroundColor Cyan

$headers = @{ 'User-Agent' = 'local-whisper-setup' }
$release = Invoke-RestMethod 'https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest' -Headers $headers
$tag = $release.tag_name

Write-Host "Found release: $tag" -ForegroundColor Gray

# Find a CPU-only Windows x64 zip (skip CUDA, Vulkan, etc.)
$asset = $release.assets | Where-Object {
    $_.name -match '\.zip$' -and
    ($_.name -match 'bin-x64' -or $_.name -match 'win.*x64' -or $_.name -match 'x64.*win') -and
    $_.name -notmatch 'cuda|vulkan|opencl|coreml|hip|metal'
} | Select-Object -First 1

if (-not $asset) {
    # Fallback: any zip that looks Windows x64 and not GPU-specific
    $asset = $release.assets | Where-Object {
        $_.name -match '\.zip$' -and
        $_.name -match 'x64' -and
        $_.name -notmatch 'cuda|vulkan|opencl|coreml|hip|metal'
    } | Select-Object -First 1
}

if (-not $asset) {
    Write-Host "`nAvailable assets:" -ForegroundColor Yellow
    $release.assets | ForEach-Object { Write-Host "  $($_.name)" }
    Write-Error "Could not find a CPU Windows x64 build in whisper.cpp $tag. See https://github.com/ggerganov/whisper.cpp/releases"
    exit 1
}

$sizeMB = [math]::Round($asset.size / 1MB, 1)
Write-Host "Downloading $($asset.name) ($sizeMB MB)..." -ForegroundColor Yellow

$zipPath = Join-Path $env:TEMP "whisper-$tag.zip"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers $headers

Write-Host "Extracting to resources/whisper/..." -ForegroundColor Yellow
$extractDir = Join-Path $env:TEMP "whisper-extract-$tag"
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

# Copy all .exe and .dll files, flattening any subdirectory
Get-ChildItem $extractDir -Recurse -Include '*.exe', '*.dll' | ForEach-Object {
    Copy-Item $_.FullName -Destination (Join-Path $whisperDir $_.Name) -Force
}

Remove-Item $zipPath -Force
Remove-Item $extractDir -Recurse -Force

# Check for key binaries
$cliPath = Join-Path $whisperDir 'whisper-cli.exe'
$streamPath = Join-Path $whisperDir 'whisper-stream.exe'

if (Test-Path $cliPath) {
    Write-Host "whisper-cli.exe  ready" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "whisper-cli.exe not found. Contents of resources/whisper/:" -ForegroundColor Yellow
    Get-ChildItem $whisperDir | ForEach-Object { Write-Host "  $($_.Name)" }
    Write-Host ""
    Write-Host "Check the asset above and rename the CLI binary to whisper-cli.exe if needed." -ForegroundColor Yellow
}

if (Test-Path $streamPath) {
    Write-Host "whisper-stream.exe  ready (real-time preview enabled)" -ForegroundColor Green
} else {
    Write-Host "whisper-stream.exe  not found (real-time preview disabled, batch transcription still works)" -ForegroundColor Gray
}

# Check ffmpeg
Write-Host ""
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    $ffmpegVer = (ffmpeg -version 2>&1 | Select-Object -First 1) -replace 'ffmpeg version ', ''
    Write-Host "ffmpeg  found ($ffmpegVer)" -ForegroundColor Green
} else {
    Write-Host "ffmpeg not found in PATH." -ForegroundColor Yellow
    Write-Host "Install it before running the app:" -ForegroundColor Yellow
    Write-Host "  winget install Gyan.FFmpeg" -ForegroundColor White
    Write-Host "  -- or --" -ForegroundColor DarkGray
    Write-Host "  choco install ffmpeg" -ForegroundColor White
}

Write-Host ""
Write-Host "Setup complete. Run 'npm run dev' to start." -ForegroundColor Green
