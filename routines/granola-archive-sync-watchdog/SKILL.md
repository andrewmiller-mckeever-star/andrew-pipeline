---
name: granola-archive-sync-watchdog
description: Thursday watchdog — re-runs the Granola archive sync if Monday's run was missed (Mac asleep) and last success is >7 days old
---

Watchdog for the weekly Granola archive sync (task granola-archive-sync, scheduled Mondays).

WHY THIS EXISTS: the sync only fires when Andrew's Mac is awake. If Monday's run was missed, captured transcripts could drift toward Granola's 30-day free-tier deletion. This is a mid-week safety net.

Do this:

1. Read ~/Documents/GranolaArchive/sync.log. Find the most recent line containing "OK" (format: "YYYY-MM-DD HH:MM:SS  OK  ..."). Parse its timestamp.

2. Decide:
   - If sync.log is missing, has no "OK" line, OR the last OK timestamp is more than 7 days before today: a run was missed — proceed to step 3.
   - Otherwise (last successful sync within 7 days): do nothing, post nothing, and end.

3. Run the full sync, same as the weekly task:
   a. python3 ~/Documents/GranolaArchive/granola_export.py
   b. If it exits non-zero with "AUTH FAILURE": DM Andrew on Slack (resolve his user via slack_search_users using email andrew.miller-mckeever@you.com) with the error and the instruction to regenerate the Granola Personal API key and overwrite ~/Documents/GranolaArchive/.granola_api_key. Then STOP.
   c. If it fails for any other reason: DM Andrew the error and STOP.
   d. On success, back up (never upload the key):
      rclone copy ~/Documents/GranolaArchive gdrive:GranolaArchive --exclude ".granola_api_key" --exclude "sync.log"
   e. If the backup fails, DM Andrew the rclone error.

Notify Andrew ONLY on problems (auth failure, script error, backup failure) via Slack DM. On a normal catch-up success, stay silent.