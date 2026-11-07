#!/usr/bin/env bash
# Copy this package's Lua sources into a consumer's directory.
#
# Previously this lived at the repo root and reached down into a sibling
# (`rm -rf cli/lua && cp -r src-lua/*`), which is why the runtime had no package
# identity of its own. The package now owns its own bundling and the consumer
# says where it wants the files.
#
# Usage: bash packages/runtime-lua/scripts/bundle.sh <destination>
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-}"

if [ -z "$DEST" ]; then
  echo "usage: $0 <destination>" >&2
  exit 2
fi

echo "Bundling @feather/runtime-lua into ${DEST}..."
rm -rf "$DEST"
mkdir -p "$DEST"

cp -r "$PACKAGE_DIR/feather" "$DEST/feather"
cp -r "$PACKAGE_DIR/plugins" "$DEST/plugins"

echo "Done. $(find "$DEST" -name '*.lua' | wc -l | tr -d ' ') Lua files."
