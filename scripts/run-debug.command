#!/bin/bash
# Local helper (git-excluded): run the installed app for 90 s, sample RSS/CPU, capture stderr and crash reports.
cd "$(dirname "$0")/.." || exit 1
LOG="scripts/last-run.log"
{
  echo "=== run $(date '+%Y-%m-%d %H:%M:%S') ==="
  pkill -x DiscordLight 2>/dev/null; sleep 2
  wk_before=$(ps axo rss,comm | awk '/WebKit\.(WebContent|Networking|GPU)/ {s+=$1} END {print s+0}')
  echo "webkit helper RSS before launch: $((wk_before/1024)) MB (all apps)"
  /Applications/DiscordLight.app/Contents/MacOS/DiscordLight 2>scripts/last-stderr.log &
  PID=$!
  for t in 5 20 40 60 90; do
    sleep $((t - ${prev:-0})); prev=$t
    if kill -0 $PID 2>/dev/null; then
      wk_now=$(ps axo rss,comm | awk '/WebKit\.(WebContent|Networking|GPU)/ {s+=$1} END {print s+0}')
      echo "t=${t}s $(ps -o rss=,%cpu= -p $PID | awk '{printf "host rss=%.1fMB cpu=%s%%", $1/1024, $2}') webkit-helpers delta=$(( (wk_now-wk_before)/1024 ))MB"
    else
      wait $PID; echo "exited with $? at t<=${t}s"; break
    fi
  done
  echo "--- stderr (last 20) ---"; tail -20 scripts/last-stderr.log
  ls -t ~/Library/Logs/DiagnosticReports/ 2>/dev/null | grep -i discordlight | head -2
  echo "=== done ==="
} 2>&1 | tee "$LOG"
