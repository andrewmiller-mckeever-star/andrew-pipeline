# Routine: granola-archive-sync-watchdog

| Field | Value |
|---|---|
| Schedule | `0 11 * * 4` — 11:00 AM Thursday |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Granola, Google Drive, Slack |
| Env vars used | none |
| Replaces laptop task | `granola-archive-sync-watchdog` |
| Expected output | Usually nothing (silent). If Monday's sync was missed: full catch-up run; Slack DM only on problems |

## PROMPT

> **Why this prompt is fully self-contained (2026-07-20):** Routine runs proved unable to use the repo two different ways — run 1 had the repo but did not register `.claude/skills/` as skills; run 2 had NO repo checkout at all. Conclusion: a Routine prompt must not depend on repo files. This prompt embeds the complete sync flow behind the 7-day gate. The canonical long-form version stays at `.claude/skills/granola-archive-sync-cloud/SKILL.md` for interactive sessions; keep the two (and `routines-cloud/granola-archive-sync.md`) in sync when editing.

```
You are the mid-week catch-up watchdog for Andrew's Granola transcript archive. Granola's free tier deletes transcripts 30 days after the meeting; the Monday sync backs them up to Google Drive. You re-run the sync only if Monday's run was missed. Auth is via connectors (Granola, Google Drive, Slack) — locate connector tools by function-name suffix, never by hardcoded prefixes. WRITE BOUNDARY: you may only create meeting transcript files and sync-log.md in the "GranolaArchive" Drive folder, and (only on problems) send one Slack DM to Andrew ({SLACK_USER_ID}). Never post to any public channel, never write to Salesforce or Apollo, never email anyone, never delete or overwrite anything.

STEP 1 — CHECK LAST SUCCESS: Drive connector search_files with query "name = 'GranolaArchive' and mimeType = 'application/vnd.google-apps.folder'"; inside that folder find the most recently modified sync-log.md and read it (read_file_content). Find the most recent line starting with "OK" (format: "OK {ISO timestamp} archived N new") and parse its timestamp. PARTIAL lines do not count as OK.

STEP 2 — GATE: if that last OK is less than 7 days old, exit silently — Monday's sync ran. Post nothing, write nothing.

STEP 3 — CATCH-UP SYNC: if sync-log.md is missing, has no OK line, or the last OK is 7+ days old, a run was missed. Run the full sync now, exactly as follows. The sync is ADDITIVE: add new meetings, backfill missing transcripts, never overwrite an already-archived transcript.

3A — ENUMERATE MEETINGS: use the Granola connector tool get_meetings (or list_meetings if get_meetings is unavailable) to enumerate ALL meetings from the last 35 days (35, not 30 — a safety margin over Granola's deletion window). Paginate until the full window is covered. For each meeting capture: meeting ID, title, and date (YYYY-MM-DD).
Failure handling: (a) Auth failure (connector not connected, authorization rejected/expired) — DM Andrew: "Granola archive sync failed — the Granola connector authorization was rejected. Reconnect the Granola connector in claude.ai connector settings, then I'll resume next run." Include the raw error output. Then STOP, do not touch Drive. (b) Zero meetings retrievable (calls succeed but return nothing for 35 days, which is implausible for Andrew's calendar, or every call errors) — DM Andrew with the error output and note that nothing could be archived. Then STOP.

3B — ARCHIVE FOLDER: use the GranolaArchive folder ID from Step 1 as parentId for all writes. If the folder does not exist, create it via create_file with the folder mimeType (application/vnd.google-apps.folder).

3C — DEDUPE: archived files are named exactly "{YYYY-MM-DD} - {title}.md" (use the MEETING's date, not today's; sanitize the title: replace /, \, and : with -, collapse whitespace, trim to a sane length). List the folder's existing files via search_files (paginate as needed). A meeting is already archived if a file with its exact expected name exists. Never overwrite or re-create an existing file. The missing set = meetings from 3A with no matching file.

3D — ARCHIVE MISSING TRANSCRIPTS, one meeting at a time:
1. Fetch the transcript via the Granola connector tool get_meeting_transcript with the meeting ID.
2. If the transcript comes back empty or the call errors, record the meeting in a failures list and continue. NEVER write an empty file — an empty archive entry would mask a lost transcript.
3. Otherwise create the file via Drive create_file: title "{YYYY-MM-DD} - {title}.md", mimeType "text/markdown" (or "text/plain" if markdown is not accepted), content = a small header (meeting title, date, attendees if available) followed by the full transcript text (base64-encoded if the tool requires it), parentId = the GranolaArchive folder ID.
4. If the Drive write fails, retry once; if it still fails, add the meeting to failures and continue.
Count successful writes as N.

3E — UPDATE sync-log.md (append-by-recreate; the Drive connector cannot append in place): read the most recently modified sync-log.md (empty content if none), then create_file a new sync-log.md in the same folder = previous content plus one new line. On success (even with N = 0): "OK {ISO timestamp} archived N new". If any meetings failed in 3D: "PARTIAL {ISO timestamp} archived N new, {M} failed: {comma-separated meeting titles}". The most recently created sync-log.md is always the current log.

STEP 4 — ALERTS, problems only: if the catch-up succeeded fully, stay silent — no Slack post; the OK line is the record. DM Andrew ({SLACK_USER_ID}) ONLY on problems (Granola auth failure, zero meetings retrievable, transcript/Drive write failures, sync-log write failure) with what failed, the raw error output, what was still archived, and what to check. If Granola auth is the problem, tell him to re-authenticate the Granola connector in claude.ai settings. To DM: resolve Andrew via slack_search_users with email andrew.miller-mckeever@you.com (fall back to {SLACK_USER_ID}), then slack_send_message. Always a DM, never a public channel.
```
