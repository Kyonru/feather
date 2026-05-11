#!/usr/bin/env bash
# Bundle the Lua library into cli/lua/ so `feather run` works out of the box.
# Run this before `npm publish` from the cli/ package.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/cli/lua"

echo "Bundling Lua into ${DEST}..."
rm -rf "$DEST"
mkdir -p "$DEST"

# Core feather library
cp -r "$ROOT/src-lua/feather" "$DEST/feather"

# Built-in plugins
cp -r "$ROOT/src-lua/plugins" "$DEST/plugins"

echo "Done. Contents:"
find "$DEST" -name "*.lua" | wc -l | xargs -I{} echo "  {} Lua files"
