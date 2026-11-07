#!/usr/bin/env bash
# Parse a Feather release tag into its train and version.
#
# Feather v4 tag vocabulary (see apps/docs/architecture.md §5.6):
#
#   v<semver>            platform  - runtime + cli + desktop, released together
#   cli-v<semver>        cli       - npm only
#   runtime-v<semver>    runtime   - LuaRocks only
#   desktop-v<semver>    desktop   - signed desktop binaries only
#   ext-v<semver>        ext       - VS Code extension only
#   studio-v<semver>     studio    - reserved, see apps/docs/architecture.md Phase 05
#
# Usage:
#   bash scripts/release-tag-version.sh <tag>              # prints "<train> <version>"
#   bash scripts/release-tag-version.sh <tag> --train      # prints "<train>"
#   bash scripts/release-tag-version.sh <tag> --version    # prints "<version>"
#
# Exits non-zero on a tag that does not match the vocabulary, so CI fails loudly
# instead of publishing something derived from a typo.

set -euo pipefail

TAG="${1:-}"
MODE="${2:---both}"

if [ -z "$TAG" ]; then
  echo "usage: $0 <tag> [--train|--version]" >&2
  exit 2
fi

case "$TAG" in
  cli-v*)     TRAIN="cli";      VERSION="${TAG#cli-v}" ;;
  runtime-v*) TRAIN="runtime";  VERSION="${TAG#runtime-v}" ;;
  desktop-v*) TRAIN="desktop";  VERSION="${TAG#desktop-v}" ;;
  ext-v*)     TRAIN="ext";      VERSION="${TAG#ext-v}" ;;
  studio-v*)  TRAIN="studio";   VERSION="${TAG#studio-v}" ;;
  v*)         TRAIN="platform"; VERSION="${TAG#v}" ;;
  *)
    echo "[feather] Unrecognized release tag: ${TAG}" >&2
    echo "[feather] Expected one of: v* cli-v* runtime-v* desktop-v* ext-v* studio-v*" >&2
    exit 1
    ;;
esac

# Reject an empty or obviously malformed version rather than letting a publish
# job derive a bad package version from it.
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "[feather] Tag ${TAG} does not contain a valid semver version (got: '${VERSION}')." >&2
  exit 1
fi

case "$MODE" in
  --train)   printf '%s\n' "$TRAIN" ;;
  --version) printf '%s\n' "$VERSION" ;;
  --both)    printf '%s %s\n' "$TRAIN" "$VERSION" ;;
  *)
    echo "usage: $0 <tag> [--train|--version]" >&2
    exit 2
    ;;
esac
