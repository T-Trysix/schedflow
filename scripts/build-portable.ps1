# ============================================================
# SchedFlow portable ("extract & run") build script
# Outputs: 1) NSIS installer (kept, as before)
#          2) dist-portable\SchedFlow_<ver>_x64_portable.zip
#
# Required (recipe 5.2):
#   - Run in PowerShell with cwd=schedflow (Git Bash can't read .cargo/config.toml mirror)
#   - TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=https://gh.ddlc.top (NSIS toolchain download mirror)
#
# NOTE: this file is intentionally ASCII-only so it parses correctly under
# Windows PowerShell 5.1 (which reads BOM-less scripts as ANSI/GBK). All Chinese
# text lives in scripts\portable-readme.txt (UTF-8).
#
# Usage: powershell -NoProfile -File scripts\build-portable.ps1
# ============================================================

$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = 'https://gh.ddlc.top'

$ver = '0.1.0'

Write-Host "==> [1/3] tauri build (rebuild NSIS installer + release exe, ver $ver) ..." -ForegroundColor Cyan
npm run tauri build
if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }

$exe = Join-Path $PWD "src-tauri\target\release\schedflow.exe"
if (-not (Test-Path $exe)) { throw "release exe not found: $exe" }

Write-Host '==> [2/3] assemble portable dir ...' -ForegroundColor Cyan
$dir = Join-Path $PWD "dist-portable\SchedFlow-$ver-portable"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item $exe $dir -Force

# readme template (UTF-8, {VER} placeholder); write back as UTF-8 with BOM so Notepad decodes correctly
$tmpl = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'portable-readme.txt')
$tmpl = $tmpl.Replace('{VER}', $ver)
# readme filename "shiyong-shuoming.txt" (codepoints U+4F7F,7528,8BF4,660E) built here to stay ASCII
$readmeName = [string]::Join('', [char[]](0x4F7F,0x7528,0x8BF4,0x660E)) + '.txt'
[System.IO.File]::WriteAllText((Join-Path $dir $readmeName), $tmpl, (New-Object System.Text.UTF8Encoding $true))

Write-Host '==> [3/3] compress to zip ...' -ForegroundColor Cyan
$zip = Join-Path $PWD "dist-portable\SchedFlow_${ver}_x64_portable.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $dir -DestinationPath $zip -CompressionLevel Optimal

Write-Host "done: $zip" -ForegroundColor Green
