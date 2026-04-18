#!/usr/bin/env bash
#
# socratic-install.sh
#
# End-to-end installer for this fork.
#
# Fork-specific steps (always the focus):
#   1. Run the SocraticCode setup wizard (Ollama Local / Cloud config).
#   2. Add a `socraticode` shell alias so you can run it from any directory.
#
# OpenCode base step (only if missing, prompts before acting):
#   0. Run `bun install` at the repo root. This is OpenCode's standard
#      dependency install — the script offers to run it only if it
#      detects it hasn't been done yet.
#
# What this script never does: modify OpenCode's CLI, DB schema, agent
# core, or run its upstream release installer.
#
# Supports: Linux, macOS, Windows (Git Bash / MSYS / Cygwin).
# For native Windows PowerShell, use socratic-install.ps1 instead.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}==>${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*"; exit 1; }

# ── Detect OS ────────────────────────────────────────────────
case "$(uname -s)" in
  Linux*)                OS=linux ;;
  Darwin*)               OS=macos ;;
  MINGW*|MSYS*|CYGWIN*)  OS=windows-bash ;;
  *)                     fail "Unsupported OS: $(uname -s). On Windows PowerShell, run socratic-install.ps1 instead." ;;
esac

# ── Locate repo root (where this script lives) ───────────────
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$REPO_DIR/packages/opencode"

[ -d "$PKG_DIR" ] || fail "Could not find packages/opencode. Run this script from the repo root."

# ── Prerequisite: Bun ────────────────────────────────────────
command -v bun >/dev/null 2>&1 || fail "Bun is not installed. Install it from https://bun.sh and re-run this script."
ok "Bun detected ($(bun --version))"

# ── Step 0/2: OpenCode base — `bun install` (only if missing) ──
if [ ! -d "$REPO_DIR/node_modules" ]; then
  warn "Dependencies not installed yet (no node_modules/ directory)."
  echo "    This is OpenCode's standard step (just 'bun install' at the repo root)."
  read -r -p "$(echo -e "${BLUE}==>${NC} Run 'bun install' now? [Y/n] ")" yn
  yn="${yn:-Y}"
  if [[ "$yn" =~ ^[Yy] ]]; then
    info "Running 'bun install'..."
    (cd "$REPO_DIR" && bun install)
    ok "Dependencies installed"
  else
    fail "Aborted. Run 'bun install' yourself, then re-run this script."
  fi
else
  ok "Dependencies already installed (node_modules/ present)"
fi

# ── Step 1/2: SocraticCode setup wizard (fork-added command) ──
CFG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/socraticode/socraticode.json"
if [ -f "$CFG_FILE" ]; then
  warn "A SocraticCode config already exists at:"
  echo "    $CFG_FILE"
  read -r -p "$(echo -e "${BLUE}==>${NC} Re-run the setup wizard (overwrites provider + default model)? [y/N] ")" yn
  yn="${yn:-N}"
  if [[ "$yn" =~ ^[Yy] ]]; then
    info "Launching the SocraticCode setup wizard..."
    echo
    bun run --cwd "$PKG_DIR" dev setup
    echo
    ok "Setup wizard finished"
  else
    info "Keeping existing config. (Run 'socraticode setup' later to change it.)"
  fi
else
  info "Launching the SocraticCode setup wizard (Ollama provider config)..."
  echo
  bun run --cwd "$PKG_DIR" dev setup
  echo
  ok "Setup wizard finished"
fi

# ── Step 2/2: global `socraticode` alias ─────────────────────
echo
read -r -p "$(echo -e "${BLUE}==>${NC} Make 'socraticode' a global command? [Y/n] ")" yn
yn="${yn:-Y}"
if [[ ! "$yn" =~ ^[Yy] ]]; then
  info "Skipped global alias. Start the TUI with: bun run --cwd packages/opencode dev"
  exit 0
fi

# Pick rc file based on the user's shell
RC_FILE=""
case "${SHELL:-}" in
  */zsh)  RC_FILE="$HOME/.zshrc" ;;
  */bash) RC_FILE="$HOME/.bashrc" ;;
  *)
    # Best guess
    if   [ -f "$HOME/.zshrc"  ]; then RC_FILE="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then RC_FILE="$HOME/.bashrc"
    else RC_FILE="$HOME/.bashrc"  # create if missing
    fi
    ;;
esac

ALIAS_LINE="alias socraticode=\"bun run --cwd '$PKG_DIR' dev\""

touch "$RC_FILE"
if grep -qF "alias socraticode=" "$RC_FILE" 2>/dev/null; then
  # Replace existing line
  if [ "$OS" = "macos" ]; then
    sed -i '' "\|alias socraticode=|d" "$RC_FILE"
  else
    sed -i "\|alias socraticode=|d" "$RC_FILE"
  fi
  warn "Replaced existing 'socraticode' alias in $RC_FILE"
fi
echo "$ALIAS_LINE" >> "$RC_FILE"
ok "Added alias to $RC_FILE"

echo
info "Reload your shell to pick up the alias:"
echo "    source $RC_FILE"
echo "  (or just open a new terminal)"
echo
info "Then verify:"
echo "    socraticode --version"
echo
ok "Done."
