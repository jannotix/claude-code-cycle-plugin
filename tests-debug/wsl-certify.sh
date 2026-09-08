#!/usr/bin/env bash
# Runs the certification matrix on WSL, against the same source tree the Windows run used.
#
#   bash tests-debug/wsl-certify.sh
#
# Installs a supported Node into $HOME first if there is not one already, then builds and certifies.
# The result lands in documentation/certification-wsl.json, which is what the Windows run compares
# against for row 12.9.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

major() { node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

if [ "$(major)" = "" ] || [ "$(major)" -lt 22 ]; then
  echo "node $(node --version 2>/dev/null || echo 'not found') is below the required 22 — installing one"
  bash "$HERE/wsl-node.sh"
  eval "$(bash "$HERE/wsl-node.sh" --print)"
fi

echo "node $(node --version), git $(git --version | awk '{print $3}')"
echo

# A worktree on a Windows-mounted path is discouraged and still has to be correct: certification
# 12.7. Say which one this is rather than leaving it to be guessed from the output.
case "$ROOT" in
  /mnt/*) echo "note: running against a Windows-mounted path ($ROOT), which is row 12.7" ;;
esac

cd "$ROOT/production"
npm run build
cd "$ROOT"
node tests-debug/certify.mjs
