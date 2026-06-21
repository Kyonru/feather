#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VENV_DIR="${FEATHER_DOCS_VENV_DIR:-.venv/docs}"
VENV_BIN="${VENV_DIR}/bin"
PYTHON_BIN="${PYTHON:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Missing Python 3. Install python3 (or set PYTHON=/path/to/python3) and try again."
  exit 1
fi

if [ ! -d "$VENV_BIN" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_BIN/activate"

if ! command -v zensical >/dev/null 2>&1; then
  pip install --disable-pip-version-check zensical
fi

if [ "$#" -eq 0 ]; then
  set -- serve
fi

exec zensical "$@"
