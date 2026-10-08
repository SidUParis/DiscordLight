#!/bin/bash
# DiscordLight: build, install to /Applications, and launch.
# Double-click in Finder, or run from a terminal. Output goes to scripts/last-build.log.
cd "$(dirname "$0")/.." || exit 1
LOG="scripts/last-build.log"
{
  echo "=== DiscordLight build $(date '+%Y-%m-%d %H:%M:%S') ==="
  echo "pwd: $(pwd)"
  echo "clang: $(xcrun -f clang 2>/dev/null || which clang)"
  make build 2>&1; rc=$?
  echo "make build exit=$rc"
  if [ $rc -eq 0 ]; then
    make install 2>&1; rc=$?
    echo "make install exit=$rc"
  fi
  if [ $rc -eq 0 ]; then
    pkill -x DiscordLight 2>/dev/null; sleep 1
    open /Applications/DiscordLight.app && echo "launched"
  fi
  echo "=== done exit=$rc ==="
} 2>&1 | tee "$LOG"
