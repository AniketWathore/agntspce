#!/usr/bin/env bash
# Build the RTK (Rust Token Killer) binary and install it in bin/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# The RTK source lives in a git submodule at rtk/
RTK_SRC="$PROJECT_DIR/rtk"

if [ ! -d "$RTK_SRC" ]; then
  echo "[build-rtk] RTK source not found at $RTK_SRC"
  echo "[build-rtk] Run 'git submodule update --init rtk' first, or symlink your RTK source there."
  exit 1
fi

echo "[build-rtk] Building RTK from $RTK_SRC ..."
(cd "$RTK_SRC" && cargo build --release)

echo "[build-rtk] Copying binary to $SCRIPT_DIR/rtk ..."
cp "$RTK_SRC/target/release/rtk" "$SCRIPT_DIR/rtk"
chmod 755 "$SCRIPT_DIR/rtk"

echo "[build-rtk] Done — binary at $SCRIPT_DIR/rtk ($(file "$SCRIPT_DIR/rtk" | sed 's/.*: //'))"
