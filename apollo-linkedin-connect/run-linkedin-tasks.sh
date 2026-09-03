#!/bin/bash
# Runs LinkedIn tasks then uploads the log to Google Drive.
# Called by launchd at 10 AM on weekdays (com.andrew.linkedin-tasks.plist).

SCRIPT_DIR="/Users/andrew/Desktop/YDC Pipeline/apollo-linkedin-connect"
LOG_FILE="$SCRIPT_DIR/linkedin-tasks.log"
LOG_DIR="$SCRIPT_DIR/logs"
RETAIN_RUNS=20
NODE="/Users/andrew/.nvm/versions/node/v24.14.1/bin/node"
RCLONE="/opt/homebrew/bin/rclone"
JQ="/usr/bin/jq"
# launchd supplies a minimal PATH. The sf CLI needs node on PATH, and without it
# Salesforce activity logging silently wrote nothing on every scheduled run.
NODE_BIN_DIR="$(dirname "$NODE")"
export PATH="$NODE_BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
SETTINGS="/Users/andrew/.claude/settings.json"

# ---------------------------------------------------------------
# Log rotation.
#
# LOG_FILE used to be truncated with a single ">", so exactly one run's log ever
# existed: a manual run wiped the scheduled run's output, and the Drive upload
# overwrote it there too. Every run now also writes its own timestamped file in
# LOG_DIR and the newest RETAIN_RUNS are kept, so history survives. LOG_FILE is
# still the "latest run" view that the 2 PM routine reads.
# ---------------------------------------------------------------
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/linkedin-tasks-$(date +%Y%m%d-%H%M%S).log"

# Write to the per-run log and the latest-run file at once.
# say <text>  -> appends to both
say() { echo "$1" | tee -a "$RUN_LOG" >> "$LOG_FILE"; }

# Skip weekends (before truncating anything, so a weekend run preserves history)
DAY=$(date +%u)
if [ "$DAY" -ge 6 ]; then
  echo "=== Skipping: weekend ($(date)) ===" >> "$LOG_FILE"
  rm -f "$RUN_LOG"
  exit 0
fi

: > "$LOG_FILE"
say "=== Run started: $(date) ==="

# Prune old run logs, newest RETAIN_RUNS kept.
ls -1t "$LOG_DIR"/linkedin-tasks-*.log 2>/dev/null | tail -n +$((RETAIN_RUNS + 1)) | while read -r old; do
  rm -f "$old"
done

# ---------------------------------------------------------------
# Load APOLLO_API_KEY.
#
# launchd does not inherit the shell environment, and the key is not in any
# shell rc file: it lives in the env block of ~/.claude/settings.json, which
# only Claude Code reads. Every launchd run therefore died instantly with
# "APOLLO_API_KEY env var is not set" and the task queue silently backed up.
#
# Read it from settings.json so there is one source of truth and no second
# copy of the secret to rotate. An already-exported value wins, so manual
# runs and the Claude scheduled-task path are unaffected.
# ---------------------------------------------------------------
if [ -z "$APOLLO_API_KEY" ] && [ -r "$SETTINGS" ]; then
  APOLLO_API_KEY=$("$JQ" -r '.env.APOLLO_API_KEY // empty' "$SETTINGS" 2>/dev/null)
fi
export APOLLO_API_KEY

if [ -z "$APOLLO_API_KEY" ]; then
  say "[ERR] APOLLO_API_KEY is not set and could not be read from $SETTINGS"
  say "[ERR] Aborting before launching the browser. No tasks were touched."
  say "[ERR] Check that $SETTINGS exists and has .env.APOLLO_API_KEY set."
  say "=== Run finished (aborted: no API key): $(date) ==="
  # Still upload so the 2 PM routine surfaces the failure instead of reading a stale log.
  "$RCLONE" copy "$LOG_FILE" "gdrive:accountplans/" --log-level ERROR
  exit 1
fi

# Run LinkedIn tasks, streaming into both logs.
"$NODE" "$SCRIPT_DIR/apollo-linkedin-connect.js" 2>&1 | tee -a "$RUN_LOG" >> "$LOG_FILE"
NODE_EXIT=${PIPESTATUS[0]}

say "=== Run finished (exit $NODE_EXIT): $(date) ==="

# Upload log to Google Drive so the 2 PM routine can read it
"$RCLONE" copy "$LOG_FILE" "gdrive:accountplans/" --log-level ERROR

exit "$NODE_EXIT"
