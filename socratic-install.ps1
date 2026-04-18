#!/usr/bin/env pwsh
#
# socratic-install.ps1
#
# End-to-end installer for this fork.
#
# Fork-specific steps (always the focus):
#   1. Run the SocraticCode setup wizard (Ollama Local / Cloud config).
#   2. Add a `socraticode` PowerShell function so you can run it from any directory.
#
# OpenCode base step (only if missing, prompts before acting):
#   0. Run `bun install` at the repo root. This is OpenCode's standard
#      dependency install — the script offers to run it only if it
#      detects it hasn't been done yet.
#
# What this script never does: modify OpenCode's CLI, DB schema, agent
# core, or run its upstream release installer.

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

# ── Prerequisite: Bun ────────────────────────────────────────
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Fail "Bun is not installed. Install it from https://bun.sh and re-run this script."
}
$bunVersion = (bun --version).Trim()
Ok "Bun detected ($bunVersion)"

# ── Step 0/2: OpenCode base — `bun install` (only if missing) ──
if (-not (Test-Path (Join-Path $RepoDir "node_modules"))) {
  Warn "Dependencies not installed yet (no node_modules\ directory)."
  Write-Host "    This is OpenCode's standard step (just 'bun install' at the repo root)."
  $yn = Read-Host "==> Run 'bun install' now? [Y/n]"
  if ($yn -eq "") { $yn = "Y" }
  if ($yn -match "^[Yy]") {
    Info "Running 'bun install'..."
    Push-Location $RepoDir
    try { bun install } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Fail "bun install exited with code $LASTEXITCODE" }
    Ok "Dependencies installed"
  } else {
    Fail "Aborted. Run 'bun install' yourself, then re-run this script."
  }
} else {
  Ok "Dependencies already installed (node_modules\ present)"
}

# ── Step 1/2: SocraticCode setup wizard (fork-added command) ──
$CfgFile = Join-Path $env:USERPROFILE ".config\socraticode\socraticode.json"
if (Test-Path $CfgFile) {
  Warn "A SocraticCode config already exists at:"
  Write-Host "    $CfgFile"
  $yn = Read-Host "==> Re-run the setup wizard (overwrites provider + default model)? [y/N]"
  if ($yn -eq "") { $yn = "N" }
  if ($yn -match "^[Yy]") {
    Info "Launching the SocraticCode setup wizard..."
    Write-Host ""
    bun run --cwd $PkgDir dev setup
    if ($LASTEXITCODE -ne 0) { Fail "Setup wizard exited with code $LASTEXITCODE" }
    Write-Host ""
    Ok "Setup wizard finished"
  } else {
    Info "Keeping existing config. (Run 'socraticode setup' later to change it.)"
  }
} else {
  Info "Launching the SocraticCode setup wizard (Ollama provider config)..."
  Write-Host ""
  bun run --cwd $PkgDir dev setup
  if ($LASTEXITCODE -ne 0) { Fail "Setup wizard exited with code $LASTEXITCODE" }
  Write-Host ""
  Ok "Setup wizard finished"
}

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

# PowerShell function so we can forward PWD to bun.
# Why: 'bun run --cwd <pkg>' changes process.cwd() to the package dir,
# but the TUI resolves its working directory from $env:PWD first.
# PowerShell does not auto-export PWD, so without this wrapper the TUI
# would operate on the repo directory instead of the user's current dir.
$marker     = "# >>> socraticode (fork install) >>>"
$markerEnd  = "# <<< socraticode (fork install) <<<"
$functionBody = @"
$marker
function socraticode {
  `$__sc_prev = if (Test-Path Env:PWD) { `$env:PWD } else { `$null }
  `$env:PWD = `$PWD.Path
  try {
    bun run --cwd "$PkgDir" dev @args
  } finally {
    if (`$null -ne `$__sc_prev) { `$env:PWD = `$__sc_prev }
    else { Remove-Item Env:PWD -ErrorAction SilentlyContinue }
  }
}
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
