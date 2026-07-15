#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_DIR/search"
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

PYTHON_VERSION="3.13.14"
RELEASE_TAG="20260623"
PLATFORM="x86_64-pc-windows-msvc"
ARCHIVE_NAME="cpython-${PYTHON_VERSION}+${RELEASE_TAG}-${PLATFORM}-install_only_stripped.tar.gz"
DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/${ARCHIVE_NAME}"

echo "=== build-semble-win.sh ==="
echo "Python: $PYTHON_VERSION"
echo "Platform: $PLATFORM"
echo "Output: $OUTPUT_DIR"
echo ""

echo "[1/4] Downloading python-build-standalone (Windows)..."
curl -sL "$DOWNLOAD_URL" -o "$SCRATCH/python.tar.gz"
echo "  Downloaded: $(ls -lh "$SCRATCH/python.tar.gz" | awk '{print $5}')"

echo "[2/4] Extracting..."
tar xzf "$SCRATCH/python.tar.gz" -C "$SCRATCH"
PYTHON_BIN="$SCRATCH/python/python.exe"
echo "  Python: $("$PYTHON_BIN" --version)"

echo "[3/4] Installing semble[mcp]..."
"$SCRATCH/python/python.exe" -m pip install --quiet "semble[mcp]" 2>&1 | tail -1

echo "[4/5] Creating agntspce-search entry point..."

# Create agntspce-search script in Scripts directory
SCRIPTS_DIR="$SCRATCH/python/Scripts"
mkdir -p "$SCRIPTS_DIR"
cat > "$SCRIPTS_DIR/agntspce-search" << 'SCRIPT'
#!/usr/bin/env python
"""AgntSpce Search MCP server - wraps semble.mcp.serve()"""
import asyncio
from semble.mcp import serve
import sys

asyncio.run(serve())
SCRIPT

cat > "$SCRIPTS_DIR/agntspce-search.cmd" << 'CMDSCRIPT'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
"%SCRIPT_DIR%..\python.exe" "%SCRIPT_DIR%agntspce-search" %*
CMDSCRIPT

echo "[5/5] Stripping .pyc files..."
find "$SCRATCH/python" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find "$SCRATCH/python" -name '*.pyc' -delete 2>/dev/null || true

echo "0.1.0" > "$SCRATCH/VERSION"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp -r "$SCRATCH/VERSION" "$OUTPUT_DIR/"
cp -r "$SCRATCH/python" "$OUTPUT_DIR/"

echo ""
echo "=== Done ==="
echo "Output: $OUTPUT_DIR"
echo "Binary: $OUTPUT_DIR/python/Scripts/agntspce-search"

if "$OUTPUT_DIR/python/python.exe" -c "from semble.mcp import serve; print('MCP server module OK')" 2>&1; then
  echo "✓ MCP server module verified"
  if [ -f "$OUTPUT_DIR/python/Scripts/agntspce-search" ]; then
    echo "✓ Entry point created"
  fi
else
  echo "⚠ Verification failed"
fi
