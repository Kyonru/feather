#!/usr/bin/env bash
# Feather Plugin Installer — install specific Feather plugins on demand.
#
# Usage:
#   bash install-plugin.sh screenshots profiler console
#   curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-plugin.sh | bash -s -- screenshots profiler
#
# Options (via env vars):
#   FEATHER_DIR=feather         Install directory (default: feather)
#   FEATHER_BRANCH=main         Git branch/tag to download from

set -euo pipefail

REPO="Kyonru/feather"
BRANCH="${FEATHER_BRANCH:-main}"
INSTALL_DIR="${FEATHER_DIR:-feather}"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/src-lua"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}[feather]${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}[feather]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[feather]${NC} %s\n" "$1"; }
error() { printf "${RED}[feather]${NC} %s\n" "$1" >&2; }

# Check for curl or wget
if command -v curl &>/dev/null; then
  fetch() { curl -sSfL "$1"; }
elif command -v wget &>/dev/null; then
  fetch() { wget -qO- "$1"; }
else
  error "Neither curl nor wget found. Please install one."
  exit 1
fi

download_file() {
  local url="$1"
  local dest="$2"
  local dir
  dir=$(dirname "$dest")
  mkdir -p "$dir"
  if fetch "$url" > "$dest" 2>/dev/null; then
    return 0
  else
    rm -f "$dest"
    return 1
  fi
}

echo ""
printf "${GREEN}┌─────────────────────────────────────┐${NC}\n"
printf "${GREEN}│    🪶  Feather Plugin Installer      │${NC}\n"
printf "${GREEN}│    Debug tools for LÖVE games        │${NC}\n"
printf "${GREEN}└─────────────────────────────────────┘${NC}\n"
echo ""

# --- Fetch manifest ---
MANIFEST_FILE=$(mktemp)
trap 'rm -f "$MANIFEST_FILE"' EXIT

if ! fetch "${BASE_URL}/manifest.txt" > "$MANIFEST_FILE" 2>/dev/null; then
  error "Failed to download manifest from ${BASE_URL}/manifest.txt"
  exit 1
fi

# Build available plugin list from manifest
ALL_PLUGINS=()
while IFS= read -r plugin; do
  ALL_PLUGINS+=("$plugin")
done < <(grep '^plugin:' "$MANIFEST_FILE" | cut -d: -f2 | sort -u)

# Show available plugins and exit if no arguments given
if [ "$#" -eq 0 ]; then
  info "Usage: bash install-plugin.sh <plugin> [plugin...]"
  echo ""
  info "Available plugins:"
  for p in "${ALL_PLUGINS[@]}"; do
    printf "  ${CYAN}•${NC} %s\n" "$p"
  done
  echo ""
  info "Example:"
  printf "  ${GREEN}bash install-plugin.sh screenshots profiler console${NC}\n"
  echo ""
  exit 0
fi

info "Branch:      ${BRANCH}"
info "Install dir: ${INSTALL_DIR}/plugins/"
echo ""

# Validate all requested plugins before downloading anything
REQUESTED=("$@")
INVALID=()
for name in "${REQUESTED[@]}"; do
  found=0
  for p in "${ALL_PLUGINS[@]}"; do
    if [ "$p" = "$name" ]; then
      found=1
      break
    fi
  done
  if [ "$found" = "0" ]; then
    INVALID+=("$name")
  fi
done

if [ "${#INVALID[@]}" -gt 0 ]; then
  error "Unknown plugin(s): ${INVALID[*]}"
  echo ""
  info "Available plugins:"
  for p in "${ALL_PLUGINS[@]}"; do
    printf "  ${CYAN}•${NC} %s\n" "$p"
  done
  echo ""
  exit 1
fi

# Download requested plugins
PLUGINS_DIR="${INSTALL_DIR}/plugins"
mkdir -p "${PLUGINS_DIR}"

COUNT=0
FAIL=0

for name in "${REQUESTED[@]}"; do
  while IFS= read -r pline; do
    file="${pline##*:}"   # strip "plugin:<name>:" prefix
    dest="${PLUGINS_DIR}/${name}/${file}"
    if download_file "${BASE_URL}/plugins/${name}/${file}" "$dest"; then
      COUNT=$((COUNT + 1))
      ok "  ✓ ${name}/${file}"
    else
      warn "  ✗ ${name}/${file} (download failed)"
      FAIL=$((FAIL + 1))
    fi
  done < <(grep "^plugin:${name}:" "$MANIFEST_FILE")
done

echo ""
if [ "$FAIL" -gt 0 ]; then
  warn "Done: ${COUNT} file(s) installed, ${FAIL} failed."
else
  ok "Done: ${COUNT} file(s) installed."
fi
echo ""
info "Register in your Feather setup:"
echo ""
printf "  ${GREEN}require(\"feather.auto\").setup({${NC}\n"
printf "  ${GREEN}  include = { "
first=1
for name in "${REQUESTED[@]}"; do
  if [ "$first" = "1" ]; then
    printf "\"${name}\""
    first=0
  else
    printf ", \"${name}\""
  fi
done
printf " },\n"
printf "  ${GREEN}})${NC}\n"
echo ""
