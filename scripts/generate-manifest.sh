#!/usr/bin/env bash
# Generate src-lua/manifest.txt from the actual src-lua/ directory tree.
#
# Run this before tagging a release:
#   bash scripts/generate-manifest.sh
#
# The manifest is consumed by install-feather.sh and install-plugin.sh so
# those scripts never need manual updates when files are added or removed.
#
# Format (one entry per line):
#   core:feather/init.lua
#   plugin:screenshots:init.lua
#   plugin:hump:signal/init.lua

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_LUA="${SCRIPT_DIR}/../src-lua"
MANIFEST="${SRC_LUA}/manifest.txt"

{
  # Core: every .lua file under feather/, path relative to src-lua/
  find "${SRC_LUA}/feather" -type f -name "*.lua" | sort | while IFS= read -r f; do
    rel="${f#${SRC_LUA}/}"
    printf 'core:%s\n' "$rel"
  done

  # Plugins: every .lua file under plugins/<name>/
  find "${SRC_LUA}/plugins" -mindepth 2 -type f -name "*.lua" | sort | while IFS= read -r f; do
    rel="${f#${SRC_LUA}/plugins/}"   # e.g. "screenshots/init.lua"
    plugin="${rel%%/*}"              # first component = plugin name
    file="${rel#*/}"                 # rest = file path within plugin dir
    printf 'plugin:%s:%s\n' "$plugin" "$file"
  done
} > "$MANIFEST"

count=$(wc -l < "$MANIFEST" | tr -d ' ')
printf 'Written %s (%s entries)\n' "$MANIFEST" "$count"
