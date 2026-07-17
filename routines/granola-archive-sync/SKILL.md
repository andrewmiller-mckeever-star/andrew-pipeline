---
name: granola-archive-sync
description: Weekly Granola archive sync — captures transcripts before Granola's 30-day free-tier deletion, backs up to Drive, alerts Slack only on problems
---

Weekly Granola archive sync.

WHY THIS EXISTS: Granola's free tier deletes meeting recordings/transcripts 30 days after the meeting. This routine pulls Andrew's Granola notes before they are purged and grows the local archive at ~/Documents/GranolaArchive. The export script is ADDITIVE: it adds new meetings, backfills any missing transcripts, and NEVER overwrites an already-saved transcript with an empty one.

Do exactly this, in order:

1. Run the exporter:
   python3 ~/Documents/GranolaArchive/granola_export.py
   It pulls all notes via the official Granola API and appends a one-line summary to ~/Documents/GranolaArchive/sync.log (a line starting with a timestamp and "OK" on success).

2. Check the result:
   - If the command exited non-zero AND its output contains "AUTH FAILURE": the Granola Personal API key (grn_) was rejected (revoked or expired). Notify Andrew, then STOP (do not back up). To notify: resolve his Slack user with slack_search_users using email andrew.miller-mckeever@you.com, then slack_send_message to that user (DM) with: "Granola archive sync failed — the API key was rejected. Generate a new Personal API key in Granola (Settings > Connectors/API) and overwrite ~/Documents/GranolaArchive/.granola_api_key, then I'll resume next run." Include the script's error output.
   - If it failed for any other reason (non-zero exit or a Python traceback in the output): DM Andrew (same lookup) with the error output, then STOP.

3. On success only, back up off-laptop. NEVER upload the API key:
   rclone copy ~/Documents/GranolaArchive gdrive:GranolaArchive --exclude ".granola_api_key" --exclude "sync.log"

4. If the rclone backup command exits non-zero, DM Andrew (same lookup) with the rclone error output.

5. If everything succeeded, DO NOT post to Slack. Stay silent — the local sync.log is the record.

Notify Andrew ONLY on problems: auth failure, script error, or backup failure. Use a Slack DM to him, never a public channel.