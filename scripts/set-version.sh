#!/usr/bin/env bash
# Sync the project version across all files from package.json.
#
# Usage:
#   bash scripts/set-version.sh
#   bash scripts/set-version.sh 0.8.0   # override (also updates package.json)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${SCRIPT_DIR}/.."

# Resolve version
if [ "${1:-}" != "" ]; then
  VERSION="$1"
  # Update package.json first so everything stays in sync
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "${ROOT}/package.json"
else
  VERSION=$(node -p "require('${ROOT}/package.json').version")
fi

echo "Setting version to ${VERSION}"

# src-lua/feather/init.lua
sed -i '' "s/local FEATHER_VERSION_NAME = \"[^\"]*\"/local FEATHER_VERSION_NAME = \"${VERSION}\"/" \
  "${ROOT}/src-lua/feather/init.lua"

# src-tauri/Cargo.toml  (first occurrence = the package version)
sed -i '' "1,/^version = \"[^\"]*\"/ s/^version = \"[^\"]*\"/version = \"${VERSION}\"/" \
  "${ROOT}/src-tauri/Cargo.toml"

# src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" \
  "${ROOT}/src-tauri/tauri.conf.json"

# cli/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" \
  "${ROOT}/cli/package.json"

# vscode-extension/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" \
  "${ROOT}/vscode-extension/package.json"

# e2e/app.spec.ts healthy runtime fixture
node - "${ROOT}/e2e/app.spec.ts" "${VERSION}" <<'NODE'
const fs = require('fs');

const file = process.argv[2];
const version = process.argv[3];
const source = fs.readFileSync(file, 'utf8');
const pattern = /(async function seedHealthySessionConfig\(page: Page\) \{[\s\S]*?\n\s*version: ')[^']*(',)/;

if (!pattern.test(source)) {
  throw new Error('Could not find seedHealthySessionConfig version in e2e/app.spec.ts');
}

const next = source.replace(pattern, `$1${version}$2`);
fs.writeFileSync(file, next);
NODE

echo "Done. Updated:"
echo "  package.json"
echo "  src-lua/feather/init.lua"
echo "  src-tauri/Cargo.toml"
echo "  src-tauri/tauri.conf.json"
echo "  cli/package.json"
echo "  vscode-extension/package.json"
echo "  e2e/app.spec.ts"
