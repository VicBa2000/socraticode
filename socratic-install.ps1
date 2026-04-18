#!/usr/bin/env pwsh
#
# socratic-install.ps1
#
# Installs the fork-specific additions only:
#   1. Runs the SocraticCode setup wizard (Ollama Local / Cloud config).
#   2. Adds a `socraticode` PowerShell function so you can run it from any directory.
#
# This script does NOT touch anything OpenCode does on its own
# (dependency install, DB migrations, base config, etc.).
# Prerequisite: run `bun install` once in this directory before invoking this script.

$ErrorActionPreference = "Stop"

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Blue }
function Ok($msg)   { Write-Host "OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "!   $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "X   $msg" -ForegroundColor Red; exit 1 }

# ── Locate repo root (where this script lives) ───────────────
$RepoDir = (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PkgDir  = Join-Path $RepoDir "packages\opencode"

if (-not (Test-Path $PkgDir)) {
  Fail "Could not find packages\opencode. Run this script from the repo root."
}

# ── Prerequisite checks (do NOT auto-run OpenCode base steps) ────
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Fail "Bun is not installed. Install from https://bun.sh"
}
if (-not (Test-Path (Join-Path $RepoDir "node_modules"))) {
  Fail "Dependencies not installed. Run 'bun install' at the repo root first, then re-run this script."
}
Ok "Bun + node_modules present"

# ── Step 1/2: SocraticCode setup wizard (fork-added command) ──
Info "Launching the SocraticCode setup wizard (Ollama provider config)..."
Write-Host ""
bun run --cwd $PkgDir dev setup
if ($LASTEXITCODE -ne 0) { Fail "Setup wizard exited with code $LASTEXITCODE" }
Write-Host ""
Ok "Setup wizard finished"

# ── Step 2/2: global `socraticode` function ──────────────────
Write-Host ""
$yn = Read-Host "==> Make 'socraticode' a global command? [Y/n]"
if ($yn -eq "") { $yn = "Y" }
if ($yn -notmatch "^[Yy]") {
  Info "Skipped global alias. Start the TUI with: bun run --cwd packages\opencode dev"
  exit 0
}

# Ensure the PowerShell profile file exists
if (-not (Test-Path $PROFILE)) {
  New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

# PowerShell doesn't do aliases with arguments well — use a function.
$marker     = "# >>> socraticode (fork install) >>>"
$markerEnd  = "# <<< socraticode (fork install) <<<"
$functionBody = @"
$marker
function socraticode { bun run --cwd "$PkgDir" dev @args }
$markerEnd
"@

# Strip any previous block inserted by this installer
$current = if (Test-Path $PROFILE) { Get-Content $PROFILE -Raw } else { "" }
if ($current -match [regex]::Escape($marker)) {
  $pattern = "(?s)" + [regex]::Escape($marker) + ".*?" + [regex]::Escape($markerEnd) + "(\r?\n)?"
  $current = [regex]::Replace($current, $pattern, "")
  Set-Content -Path $PROFILE -Value $current
  Warn "Replaced previous 'socraticode' function in $PROFILE"
}
Add-Content -Path $PROFILE -Value "`n$functionBody"
Ok "Added 'socraticode' function to $PROFILE"

Write-Host ""
Info "Reload your PowerShell profile to pick up the function:"
Write-Host "    . `$PROFILE"
Write-Host "  (or just open a new PowerShell window)"
Write-Host ""
Info "Then verify:"
Write-Host "    socraticode --version"
Write-Host ""
Ok "Done."
