#!/usr/bin/env bash
# Feather Installer — download the Feather debug library for LÖVE games.
#
# Usage:
#   curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh | bash
#
# Options (via env vars):
#   FEATHER_DIR=lib/feather    Install directory (default: feather)
#   FEATHER_BRANCH=main        Git branch/tag to download from
#   FEATHER_PLUGINS=1          Also install all built-in plugins (default: 1)
#   FEATHER_SKIP_PLUGINS="hump,lua-state-machine"  Comma-separated plugins to skip

set -euo pipefail

REPO="Kyonru/feather"
BRANCH="${FEATHER_BRANCH:-main}"
INSTALL_DIR="${FEATHER_DIR:-feather}"
INSTALL_PLUGINS="${FEATHER_PLUGINS:-1}"
SKIP_PLUGINS="${FEATHER_SKIP_PLUGINS:-hump,lua-state-machine}"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/src-lua"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

# --- Core library files ---
CORE_FILES=(
  "feather/init.lua"
  "feather/plugin_manager.lua"
  "feather/error_handler.lua"
  "feather/utils.lua"
  "feather/server_utils.lua"
  "feather/auto.lua"
  "feather/lib/class.lua"
  "feather/lib/json.lua"
  "feather/lib/log.lua"
  "feather/lib/ws.lua"
  "feather/lib/base64.lua"
  "feather/lib/inspect.lua"
  "feather/plugins/base.lua"
  "feather/plugins/logger.lua"
  "feather/plugins/observer.lua"
  "feather/plugins/performance.lua"
)

# --- Built-in plugin directories ---
PLUGIN_DIRS=(
  "screenshots"
  "console"
  "profiler"
  "bookmark"
  "memory-snapshot"
  "network-inspector"
  "input-replay"
  "entity-inspector"
  "config-tweaker"
  "physics-debug"
  "hump"
  "lua-state-machine"
)

# Plugin files per directory (function to avoid bash 4 associative arrays)
plugin_files() {
  case "$1" in
    screenshots)        echo "init.lua" ;;
    console)            echo "init.lua" ;;
    profiler)           echo "init.lua" ;;
    bookmark)           echo "init.lua" ;;
    memory-snapshot)    echo "init.lua" ;;
    network-inspector)  echo "init.lua" ;;
    input-replay)       echo "init.lua" ;;
    entity-inspector)   echo "init.lua" ;;
    config-tweaker)     echo "init.lua" ;;
    physics-debug)      echo "init.lua" ;;
    hump)               echo "signal/init.lua" ;;
    lua-state-machine)  echo "init.lua" ;;
    *)                  echo "init.lua" ;;
  esac
}

echo ""
printf "${GREEN}┌─────────────────────────────────────┐${NC}\n"
printf "${GREEN}│    🪶  Feather Installer             │${NC}\n"
printf "${GREEN}│    Debug tools for LÖVE games        │${NC}\n"
printf "${GREEN}└─────────────────────────────────────┘${NC}\n"
echo ""

info "Branch: ${BRANCH}"
info "Install dir: ${INSTALL_DIR}/"
info "Plugins: $([ "$INSTALL_PLUGINS" = "1" ] && echo "yes" || echo "no")"
echo ""

# --- Download core ---
info "Downloading core library..."
CORE_COUNT=0
CORE_FAIL=0

for file in "${CORE_FILES[@]}"; do
  # Map feather/ -> INSTALL_DIR/
  dest="${INSTALL_DIR}/${file#feather/}"

  if download_file "${BASE_URL}/${file}" "$dest"; then
    CORE_COUNT=$((CORE_COUNT + 1))
  else
    warn "  Failed: ${file}"
    CORE_FAIL=$((CORE_FAIL + 1))
  fi
done

ok "Core: ${CORE_COUNT} files downloaded"

# --- Download plugins ---
if [ "$INSTALL_PLUGINS" = "1" ]; then
  info "Downloading plugins..."

  # Parse skip list
  IFS=',' read -ra SKIP_ARR <<< "$SKIP_PLUGINS"

  PLUGIN_COUNT=0
  PLUGIN_SKIP_COUNT=0
  PLUGINS_DIR="plugins"
  mkdir -p "${PLUGINS_DIR}"

  for plugin in "${PLUGIN_DIRS[@]}"; do
    # Check if plugin is in skip list
    SHOULD_SKIP=0
    for s in "${SKIP_ARR[@]}"; do
      trimmed=$(echo "$s" | xargs)
      if [ "$trimmed" = "$plugin" ]; then
        SHOULD_SKIP=1
        break
      fi
    done
    if [ "$SHOULD_SKIP" = "1" ]; then
      PLUGIN_SKIP_COUNT=$((PLUGIN_SKIP_COUNT + 1))
      continue
    fi

    IFS=' ' read -ra files <<< "$(plugin_files "$plugin")"
    for file in "${files[@]}"; do
      dest="${PLUGINS_DIR}/${plugin}/${file}"
      if download_file "${BASE_URL}/plugins/${plugin}/${file}" "$dest"; then
        PLUGIN_COUNT=$((PLUGIN_COUNT + 1))
      else
        warn "  Failed: plugins/${plugin}/${file}"
      fi
    done
  done

  ok "Plugins: ${PLUGIN_COUNT} files downloaded (${PLUGIN_SKIP_COUNT} skipped)"
fi

echo ""
ok "Installation complete!"
echo ""
info "Quick start — add to your main.lua:"
echo ""
printf "  ${CYAN}-- One-line setup (all plugins, sensible defaults)${NC}\n"
printf "  ${GREEN}require(\"feather.auto\")${NC}\n"
echo ""
printf "  ${CYAN}-- Then in love.update:${NC}\n"
printf "  ${GREEN}function love.update(dt)${NC}\n"
printf "  ${GREEN}  DEBUGGER:update(dt)${NC}\n"
printf "  ${GREEN}  -- ...your game code...${NC}\n"
printf "  ${GREEN}end${NC}\n"
echo ""
info "Or with options:"
echo ""
printf "  ${GREEN}require(\"feather.auto\").setup({${NC}\n"
printf "  ${GREEN}  sessionName = \"My Game\",${NC}\n"
printf "  ${GREEN}  host = \"192.168.1.50\",  -- for mobile debugging${NC}\n"
printf "  ${GREEN}  exclude = { \"network-inspector\" },${NC}\n"
printf "  ${GREEN}})${NC}\n"
echo ""
info "Download the Feather desktop app: https://github.com/${REPO}/releases"
echo ""
