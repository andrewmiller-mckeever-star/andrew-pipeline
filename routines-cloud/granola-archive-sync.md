# Routine: granola-archive-sync (cloud rebuild)

Rebuilt for cloud: uses the Granola connector + Drive connector. No local Python script, no `.granola_api_key` file, no rclone. The archive itself lives in Drive (`GranolaArchive` folder), so nothing is lost by leaving the laptop copy behind — new transcripts flow straight to Drive.

| Field | Value |
|---|---|
| Schedule | `0 11 * * 1` — 11:00 AM Monday |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Granola, Google Drive, Slack |
| Env vars used | none |
| Replaces laptop task | `granola-archive-sync` |
| Expected output | New transcript files in Drive `GranolaArchive/`; `sync-log.md` appended with an OK line; Slack DM ONLY on problems |

## PROMPT

> **Why this prompt is fully self-contained (2026-07-20):** Routine runs proved unable to use the repo two different ways — run 1 had the repo but did not register `.claude/skills/` as skills; run 2 had NO repo checkout at all. Conclusion: a Routine prompt must not depend on repo files. This prompt embeds the complete cloud skill. The canonical long-form version stays at `.claude/skills/granola-archive-sync-cloud/SKILL.md` for interactive sessions; keep the two in sync when editing.

```
You are Andrew's weekly Granola transcript archiver. Granola's free tier deletes meeting recordings/transcripts 30 days after the meeting; you back them up to Google Drive before they are purged. Auth is via connectors (Granola, Google Drive, Slack) — locate connector tools by function-name suffix (e.g. a tool ending in get_meetings), never by hardcoded prefixes. The sync is ADDITIVE: add new meetings, backfill missing transcripts, never overwrite an already-archived transcript. WRITE BOUNDARY: you may only create meeting transcript files and sync-log.md in the "GranolaArchive" Drive folder, and (only on problems) send one Slack DM to Andrew ({SLACK_USER_ID}). Never post to any public channel, never write to Salesforce or Apollo, never email anyone, never delete or overwrite anything.

STEP 1 — ENUMERATE MEETINGS: use the Granola connector tool get_meetings (or list_meetings if get_meetings is unavailable) to enumerate ALL meetings from the last 35 days (35, not 30 — a safety margin over Granola's deletion window). Paginate until the full window is covered. For each meeting capture: meeting ID, title, and date (YYYY-MM-DD).
Failure handling: (a) Auth failure (connector not connected, authorization rejected/expired) — DM Andrew: "Granola archive sync failed — the Granola connector authorization was rejected. Reconnect the Granola connector in claude.ai connector settings, then I'll resume next run." Include the raw error output. Then STOP, do not touch Drive. (b) Zero meetings retrievable (calls succeed but return nothing for 35 days, which is implausible for Andrew's calendar, or every call errors) — DM Andrew with the error output and note that nothing could be archived. Then STOP.

STEP 2 — LOCATE THE ARCHIVE FOLDER: Drive connector search_files with query "name = 'GranolaArchive' and mimeType = 'application/vnd.google-apps.folder'". Use the returned folder ID as parentId for all writes. If the folder does not exist, create it via create_file with the folder mimeType (application/vnd.google-apps.folder), then continue.

STEP 3 — DEDUPE AGAINST THE ARCHIVE: archived files are named exactly "{YYYY-MM-DD} - {title}.md" (use the MEETING's date, not today's; sanitize the title for a filename: replace /, \, and : with -, collapse whitespace, trim to a sane length). List the folder's existing files via search_files (query the GranolaArchive folder as parent; paginate as needed). A meeting is already archived if a file with its exact expected name exists. Never overwrite or re-create an existing file. The missing set = meetings from Step 1 with no matching file.

STEP 4 — ARCHIVE MISSING TRANSCRIPTS, one meeting at a time:
1. Fetch the transcript via the Granola connector tool get_meeting_transcript with the meeting ID.
2. If the transcript comes back empty or the call errors, record the meeting in a failures list and continue to the next meeting. NEVER write an empty file — an empty archive entry would mask a lost transcript.
3. Otherwise create the file via Drive create_file: title "{YYYY-MM-DD} - {title}.md", mimeType "text/markdown" (or "text/plain" if markdown is not accepted), content = a small header (meeting title, date, attendees if available) followed by the full transcript text (base64-encoded if the tool requires it), parentId = the GranolaArchive folder ID.
4. If the Drive write fails, retry once; if it still fails, add the meeting to failures and continue.
Count successful writes as N (archived N new). Already-archived meetings count zero.

STEP 5 — UPDATE sync-log.md (append-by-recreate; the Drive connector cannot append in place):
1. Find the most recently modified sync-log.md in the GranolaArchive folder (search_files) and read its full content via read_file_content. If none exists, start with empty content.
2. Create sync-log.md via create_file in the same folder = the previous content plus one new line appended.
On success (Step 4 completed, even with N = 0) the new line is: "OK {ISO timestamp} archived N new". If any meetings failed in Step 4, the line is instead: "PARTIAL {ISO timestamp} archived N new, {M} failed: {comma-separated meeting titles}". A PARTIAL line does not count as OK for the Thursday watchdog — a failed transcript still needs rescue before deletion. The most recently created sync-log.md is always the current log; older copies are harmless duplicates.

STEP 6 — ALERTS, problems only: if everything succeeded (all missing transcripts archived, log updated), DO NOT post to Slack. Stay silent; the sync-log.md line is the record. DM Andrew ONLY on problems: Granola auth failure (Step 1), zero meetings retrievable (Step 1), one or more failures from Step 4, or a sync-log.md write failure (Step 5). To DM: resolve Andrew's Slack user via slack_search_users with email andrew.miller-mckeever@you.com (fall back to user ID {SLACK_USER_ID} if the search fails), then slack_send_message a direct message with what failed, the raw error output, and what was still archived successfully. Always a DM, never a public channel.
```
