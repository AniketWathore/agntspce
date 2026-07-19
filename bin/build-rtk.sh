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

# Detect native target
ARCH="$(uname -m)"
OS="$(uname -s)"

# Targets to build: native + any cross-compilation targets
BUILD_TARGETS=()

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)
        BUILD_TARGETS+=("aarch64-apple-darwin:darwin-arm64:rtk")
        # Also build Intel macOS binary on Apple Silicon
        if command -v rustup &>/dev/null; then
          echo "[build-rtk] Cross-compiling for x86_64-apple-darwin ..."
          rustup target add x86_64-apple-darwin 2>/dev/null || true
          BUILD_TARGETS+=("x86_64-apple-darwin:darwin-x64:rtk")
        fi
        ;;
      x86_64)
        BUILD_TARGETS+=("x86_64-apple-darwin:darwin-x64:rtk")
        ;;
    esac
    # Windows cross-compilation (if rustup + mingw available)
    if command -v rustup &>/dev/null && command -v x86_64-w64-mingw32-gcc &>/dev/null; then
      echo "[build-rtk] Cross-compiling for x86_64-pc-windows-gnu ..."
      rustup target add x86_64-pc-windows-gnu 2>/dev/null || true
      BUILD_TARGETS+=("x86_64-pc-windows-gnu:win32-x64:rtk.exe")
    fi
    ;;
  Linux)
    case "$ARCH" in
      x86_64)
        BUILD_TARGETS+=("x86_64-unknown-linux-gnu:linux-x64:rtk")
        ;;
      aarch64)
        BUILD_TARGETS+=("aarch64-unknown-linux-gnu:linux-arm64:rtk")
        ;;
    esac
    # Windows cross-compilation (if rustup + mingw available)
    if command -v rustup &>/dev/null && command -v x86_64-w64-mingw32-gcc &>/dev/null; then
      echo "[build-rtk] Cross-compiling for x86_64-pc-windows-gnu ..."
      rustup target add x86_64-pc-windows-gnu 2>/dev/null || true
      BUILD_TARGETS+=("x86_64-pc-windows-gnu:win32-x64:rtk.exe")
    fi
    ;;
  *)      echo "[build-rtk] Unsupported OS: $OS"; exit 1 ;;
esac

if [ ${#BUILD_TARGETS[@]} -eq 0 ]; then
  echo "[build-rtk] No build targets configured for $OS $ARCH"
  exit 1
fi

for entry in "${BUILD_TARGETS[@]}"; do
  IFS=':' read -r TARGET PLATFORM BIN_NAME <<< "$entry"
  echo "[build-rtk] Building for $TARGET → $PLATFORM ..."
  (cd "$RTK_SRC" && cargo build --release --target "$TARGET")

  BINARY_SRC="$RTK_SRC/target/$TARGET/release/$BIN_NAME"
  if [ ! -f "$BINARY_SRC" ]; then
    # Fallback to default release dir for native builds
    BINARY_SRC="$RTK_SRC/target/release/$BIN_NAME"
  fi

  if [ ! -f "$BINARY_SRC" ]; then
    echo "[build-rtk] WARNING: Binary not found at $BINARY_SRC — skipping $PLATFORM"
    continue
  fi

  cp "$BINARY_SRC" "$SCRIPT_DIR/rtk-${PLATFORM}${BIN_NAME##rtk}"
  chmod 755 "$SCRIPT_DIR/rtk-${PLATFORM}${BIN_NAME##rtk}" 2>/dev/null || true

  echo "[build-rtk] Built $PLATFORM"
done

# Extract and write version (from the native binary)
FIRST_TARGET="${BUILD_TARGETS[0]}"
IFS=':' read -r FIRST_TRIPLET FIRST_PLATFORM FIRST_BIN <<< "$FIRST_TARGET"
FIRST_SRC="$RTK_SRC/target/$FIRST_TRIPLET/release/$FIRST_BIN"
VERSION="$("$FIRST_SRC" --version 2>&1 | awk '{print $2}')"
echo "$VERSION" > "$SCRIPT_DIR/rtk-version.txt"

# Also run copy-rtk.js to update bin/rtk
node "$SCRIPT_DIR/copy-rtk.js"

echo "[build-rtk] Done — built rtk v${VERSION} for $(echo $BUILD_TARGETS | wc -w | tr -d ' ') platform(s)"
