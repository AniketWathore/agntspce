#!/usr/bin/env bash
set -euo pipefail

# ── build-semble.sh ─────────────────────────────────────────────
# Builds the portable search distribution (agntspce-search + semble[mcp])
# for the current platform using python-build-standalone.
#
# Usage: bash scripts/build-semble.sh
#   Output: <project>/search/  (portable Python + search server)
#
# Requirements: curl, tar, ~800MB disk space, ~3min on fast connection
# ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_DIR/search"
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

# ── Config ───────────────────────────────────────────────────────
PYTHON_VERSION="3.13.14"
RELEASE_TAG="20260623"
PLATFORM="aarch64-apple-darwin"
ARCHIVE_NAME="cpython-${PYTHON_VERSION}+${RELEASE_TAG}-${PLATFORM}-install_only_stripped.tar.gz"
DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/${ARCHIVE_NAME}"

echo "=== build-semble.sh ==="
echo "Python: $PYTHON_VERSION"
echo "Platform: $PLATFORM"
echo "Output: $OUTPUT_DIR"
echo ""

# ── Download & extract python-build-standalone ───────────────────
echo "[1/4] Downloading python-build-standalone..."
curl -sL "$DOWNLOAD_URL" -o "$SCRATCH/python.tar.gz"
echo "  Downloaded: $(ls -lh "$SCRATCH/python.tar.gz" | awk '{print $5}')"

echo "[2/4] Extracting..."
tar xzf "$SCRATCH/python.tar.gz" -C "$SCRATCH"
PYTHON_BIN="$SCRATCH/python/bin/python3"
echo "  Python: $($PYTHON_BIN --version)"

# ── Install search package ───────────────────────────────────────
echo "[3/4] Installing agntspce-search + semble[mcp]..."
"$SCRATCH/python/bin/pip" install --quiet "semble[mcp]" 2>&1 | tail -1

# Install the forked agntspce-search if the source is available
AGNTSPCE_SEARCH_SRC="$PROJECT_DIR/../CodingAgents/references/agntspce-search"
if [ -d "$AGNTSPCE_SEARCH_SRC" ]; then
  echo "  Installing agntspce-search from local source..."
  "$SCRATCH/python/bin/pip" install --quiet -e "$AGNTSPCE_SEARCH_SRC" 2>&1 | tail -1
fi

# ── Strip bytecode ───────────────────────────────────────────────
echo "[4/4] Stripping .pyc files..."
find "$SCRATCH/python" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find "$SCRATCH/python" -name '*.pyc' -delete 2>/dev/null || true

# ── Create PYTHONHOME-aware wrapper ─────────────────────────────
BIN_PATH="$SCRATCH/python/bin/agntspce-search"
PYTHON_DIR="$SCRATCH/python"
PYTHON_BIN="$PYTHON_DIR/bin/python3"
if [ -f "$BIN_PATH" ] && [ -f "$PYTHON_BIN" ]; then
  # Rename original script to .py
  mv "$BIN_PATH" "${BIN_PATH}.py"
  # Write shell wrapper with PYTHONHOME
  cat > "$BIN_PATH" << WRAPPER
#!/bin/sh
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
export PYTHONHOME="\$SCRIPT_DIR/.."
exec "\$SCRIPT_DIR/python3" "${BIN_PATH}.py" "\$@"
WRAPPER
  chmod +x "$BIN_PATH"
  echo "  Wrapper created: $BIN_PATH"
fi

# ── Write VERSION ────────────────────────────────────────────────
echo "0.1.0" > "$SCRATCH/VERSION"

# ── Move to output ───────────────────────────────────────────────
rm -rf "$OUTPUT_DIR"
mv "$SCRATCH" "$OUTPUT_DIR"

echo ""
echo "=== Done ==="
echo "Output: $OUTPUT_DIR"
echo "Size: $(du -sh "$OUTPUT_DIR" | awk '{print $1}')"
echo "Binary: $OUTPUT_DIR/python/bin/agntspce-search"
echo ""

# Verify the binary works
if "$OUTPUT_DIR/python/bin/agntspce-search" --help >/dev/null 2>&1; then
  echo "✓ Binary verified (--help passes)"
else
  echo "⚠ Binary --help failed"
fi
