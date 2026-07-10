#!/usr/bin/env bash
# Build the RTK binary from source and install platform-named artifacts in bin/.
# Only needed when updating to a new RTK version.
# Requires the Rust toolchain and the RTK source.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Determine source directory: AGNTSPCE_RTK_SOURCE env var, or rtk/ submodule, or CWD
RTK_SRC="${AGNTSPCE_RTK_SOURCE:-${SCRIPT_DIR}/../rtk}"

if [ ! -d "$RTK_SRC" ]; then
  echo "[build-rtk] RTK source not found."
  echo "[build-rtk] Set AGNTSPCE_RTK_SOURCE to point to your RTK fork, or clone it:"
  echo "    git clone <your-rtk-fork> \"$RTK_SRC\""
  exit 1
fi

echo "[build-rtk] Building RTK from $RTK_SRC ..."

# Detect target
TARGET=""
ARCH="$(uname -m)"
OS="$(uname -s)"

case "$OS" in
  Darwin) OS="apple-darwin" ;;
  Linux)  OS="unknown-linux-gnu" ;;
  *)      echo "[build-rtk] Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  arm64)  ARCH="aarch64" ;;
  x86_64) ARCH="x86_64"  ;;
  *)      echo "[build-rtk] Unsupported arch: $ARCH"; exit 1 ;;
esac

TARGET="${ARCH}-${OS}"
echo "[build-rtk] Target: $TARGET"

(cd "$RTK_SRC" && cargo build --release --target "$TARGET")

BINARY_SRC="$RTK_SRC/target/$TARGET/release/rtk"
if [ ! -f "$BINARY_SRC" ]; then
  # Fallback to default release dir for native builds
  BINARY_SRC="$RTK_SRC/target/release/rtk"
fi

# Map to our platform naming convention
case "$OS" in
  apple-darwin)
    case "$ARCH" in
      aarch64) PLATFORM="darwin-arm64" ;;
      x86_64)  PLATFORM="darwin-x64" ;;
    esac
    ;;
  unknown-linux-gnu)
    PLATFORM="linux-x64"
    ;;
esac

cp "$BINARY_SRC" "$SCRIPT_DIR/rtk-${PLATFORM}"
chmod 755 "$SCRIPT_DIR/rtk-${PLATFORM}"

# Extract and write version
VERSION="$("$BINARY_SRC" --version 2>&1 | awk '{print $2}')"
echo "$VERSION" > "$SCRIPT_DIR/rtk-version.txt"

# Also run copy-rtk.js to update bin/rtk
node "$SCRIPT_DIR/copy-rtk.js"

echo "[build-rtk] Done — built rtk v${VERSION} for ${PLATFORM}"
