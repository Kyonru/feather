#!/usr/bin/env bash
# Set or re-sync the version for ONE release train.
#
# Feather v2 decouples the release trains (see V2.md section 6). There is no
# longer a single repo-wide version: each train owns its own number and its own
# tag. This script only ever touches the files belonging to the train you name.
#
# Usage:
#   bash scripts/set-version.sh <train> [version]
#
# Trains and their files:
#
#   cli       cli/package.json                        (source of truth)
#   runtime   src-lua/feather/init.lua                (source of truth)
#   desktop   package.json                            (source of truth)
#             -> src-tauri/Cargo.toml
#             -> src-tauri/tauri.conf.json
#   ext       vscode-extension/package.json           (source of truth)
#   platform  cli + runtime + desktop, all to the same version
#
# With a version argument, the version is written.
# Without one, the train's DERIVED files are re-synced from its source of truth.
# The no-argument form is what .husky/pre-commit uses: it enforces intra-train
# consistency (the desktop trio must agree) without re-coupling separate trains.
#
# Examples:
#   bash scripts/set-version.sh cli 4.0.1        # ship a CLI patch
#   bash scripts/set-version.sh platform 4.1.0   # full platform release
#   bash scripts/set-version.sh desktop          # re-sync Cargo.toml + tauri.conf.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${SCRIPT_DIR}/.."

TRAIN="${1:-}"
VERSION="${2:-}"

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

if [ -z "$TRAIN" ]; then
  echo "[feather] Missing train argument." >&2
  usage
fi

# Portable in-place sed: GNU sed wants `-i`, BSD/macOS sed wants `-i ''`.
sed_i() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# Replace the FIRST top-level "version" field in a JSON file, preserving all
# other formatting. Safer than a blanket sed across the whole file.
set_json_version() {
  node - "$1" "$2" <<'NODE'
const fs = require('fs');
const [file, version] = process.argv.slice(2);
const source = fs.readFileSync(file, 'utf8');
const pattern = /^(\s*"version":\s*")[^"]*(")/m;
if (!pattern.test(source)) {
  throw new Error(`Could not find a "version" field in ${file}`);
}
fs.writeFileSync(file, source.replace(pattern, `$1${version}$2`));
NODE
}

read_json_version() {
  node -p "require('$1').version"
}

read_runtime_version() {
  sed -n 's/^local FEATHER_VERSION_NAME = "\([^"]*\)".*/\1/p' "${ROOT}/src-lua/feather/init.lua" | head -n 1
}

set_cli() {
  set_json_version "${ROOT}/cli/package.json" "$1"
  echo "  cli/package.json -> $1"
}

set_runtime() {
  sed_i "s/local FEATHER_VERSION_NAME = \"[^\"]*\"/local FEATHER_VERSION_NAME = \"$1\"/" \
    "${ROOT}/src-lua/feather/init.lua"
  echo "  src-lua/feather/init.lua -> $1"
}

set_ext() {
  set_json_version "${ROOT}/vscode-extension/package.json" "$1"
  echo "  vscode-extension/package.json -> $1"
}

# The desktop app is three files that must always agree: the root package.json
# (its npm manifest), the Rust crate, and the Tauri bundle config.
set_desktop() {
  set_json_version "${ROOT}/package.json" "$1"
  # Only the first `version =` line, which is the [package] version.
  sed_i "1,/^version = \"[^\"]*\"/ s/^version = \"[^\"]*\"/version = \"$1\"/" \
    "${ROOT}/src-tauri/Cargo.toml"
  set_json_version "${ROOT}/src-tauri/tauri.conf.json" "$1"
  echo "  package.json -> $1"
  echo "  src-tauri/Cargo.toml -> $1"
  echo "  src-tauri/tauri.conf.json -> $1"
}

case "$TRAIN" in
  cli)
    [ -n "$VERSION" ] || VERSION="$(read_json_version "${ROOT}/cli/package.json")"
    echo "Setting cli train to ${VERSION}"
    set_cli "$VERSION"
    ;;
  runtime)
    [ -n "$VERSION" ] || VERSION="$(read_runtime_version)"
    echo "Setting runtime train to ${VERSION}"
    set_runtime "$VERSION"
    ;;
  ext)
    [ -n "$VERSION" ] || VERSION="$(read_json_version "${ROOT}/vscode-extension/package.json")"
    echo "Setting ext train to ${VERSION}"
    set_ext "$VERSION"
    ;;
  desktop)
    [ -n "$VERSION" ] || VERSION="$(read_json_version "${ROOT}/package.json")"
    echo "Setting desktop train to ${VERSION}"
    set_desktop "$VERSION"
    ;;
  platform)
    if [ -z "$VERSION" ]; then
      echo "[feather] The platform train requires an explicit version." >&2
      echo "[feather]   bash scripts/set-version.sh platform 4.1.0" >&2
      exit 2
    fi
    echo "Setting platform train (cli + runtime + desktop) to ${VERSION}"
    set_cli "$VERSION"
    set_runtime "$VERSION"
    set_desktop "$VERSION"
    ;;
  *)
    echo "[feather] Unknown train: ${TRAIN}" >&2
    echo "[feather] Expected one of: cli runtime desktop ext platform" >&2
    exit 2
    ;;
esac

echo "Done."
