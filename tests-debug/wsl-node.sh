#!/usr/bin/env bash
# Installs a supported Node into the calling user's home directory, for running the certification
# on WSL. The plugin requires Node 22 or later: the store is built on `node:sqlite`, which does not
# exist before 22, and the test suite runs TypeScript directly, which needs 22 as well.
#
#   bash tests-debug/wsl-node.sh          # install
#   bash tests-debug/wsl-node.sh --print  # print the PATH line and exit
#
# The version defaults to whatever the recorded Windows run used, because certification 12.9 is
# parity between the platforms and not merely "22 or later": a WSL install one major behind the
# Windows one fails that row after everything else has passed. Override with CYCLE_NODE_VERSION.
#
# No sudo, nothing outside $HOME, and nothing added to any profile: it unpacks into
# ~/.local/node-<version> and prints the PATH to use. Remove it with a single rm -rf.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECORD="$(dirname "$HERE")/documentation/certification-win.json"

# Read without a backreference: this line has to survive being edited by hand on two platforms.
RECORDED=""
if [ -r "$RECORD" ]; then
  RECORDED="$(grep -o '"node"[^,]*' "$RECORD" | head -1 | grep -o '[0-9][0-9.]*' | head -1 || true)"
fi

VERSION="${CYCLE_NODE_VERSION:-}"
if [ -z "$VERSION" ] && [ -n "$RECORDED" ]; then VERSION="v$RECORDED"; fi
VERSION="${VERSION:-v22.20.0}"
PREFIX="$HOME/.local/node-$VERSION"

if [ "${1:-}" = "--print" ]; then
  echo "export PATH=\"$PREFIX/bin:\$PATH\""
  exit 0
fi

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [ -x "$PREFIX/bin/node" ]; then
  echo "already installed: $("$PREFIX/bin/node" --version) at $PREFIX"
  exit 0
fi

TARBALL="node-$VERSION-linux-$ARCH.tar.xz"
BASE="https://nodejs.org/dist/$VERSION"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "fetching $BASE/$TARBALL"
curl -fsSL --retry 3 -o "$WORK/$TARBALL" "$BASE/$TARBALL"
curl -fsSL --retry 3 -o "$WORK/SHASUMS256.txt" "$BASE/SHASUMS256.txt"

# The checksum comes from the same official listing as the tarball. It catches a truncated or
# corrupted download, which is what actually goes wrong here; it is not a substitute for signature
# verification against the Node release keys.
echo "verifying checksum"
( cd "$WORK" && grep " $TARBALL\$" SHASUMS256.txt | sha256sum -c - )

mkdir -p "$PREFIX"
tar -xJf "$WORK/$TARBALL" -C "$PREFIX" --strip-components=1

echo
echo "installed $("$PREFIX/bin/node" --version) at $PREFIX"
echo "npm $("$PREFIX/bin/npm" --version)"
echo
echo "use it with:"
echo "  export PATH=\"$PREFIX/bin:\$PATH\""
echo
echo "remove it with:"
echo "  rm -rf \"$PREFIX\""
