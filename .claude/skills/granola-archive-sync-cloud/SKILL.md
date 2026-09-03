---
name: granola-archive-sync-cloud
description: CLOUD version for Claude Code Routines. Weekly Granola archive sync rebuilt for cloud execution — uses the Granola connector to enumerate meetings from the last 35 days, archives any transcripts not yet backed up to the GranolaArchive Google Drive folder (one Markdown file per meeting, via the Drive connector), and appends a success line to sync-log.md. DMs Andrew on Slack ONLY on problems (auth failure, zero meetings retrievable, Drive write failures); silent on success. Also runs in watchdog mode (Thursday): re-runs the sync only if the last successful run is more than 7 days old. No local script, no API key file, no python, no rclone. Use for "run granola archive sync", "granola sync", "archive my granola meetings", or the Thursday watchdog check.
---

# Granola Archive Sync (Cloud)

## Why this exists

Granola's free tier deletes meeting recordings/transcripts 30 days after the meeting. This routine pulls Andrew's Granola transcripts before they are purged and grows the archive in the `GranolaArchive` folder on Google Drive. The sync is ADDITIVE: it adds new meetings, backfills any missing transcripts, and NEVER overwrites an already-archived transcript.

**This is a cloud REBUILD, not a port.** The laptop version ran a local Python exporter (`granola_export.py`) with a `.granola_api_key` file and backed up via rclone. None of that exists here:
- Meetings and transcripts come from the account-level claude.ai **Granola connector** (tools with function-name suffixes `get_meetings`, `list_meetings`, `get_meeting_transcript` — locate by suffix, never by a hardcoded `mcp__<uuid>__` prefix).
- The archive lives directly in the **`GranolaArchive` Google Drive folder** (Drive connector `search_files` / `create_file`). No local `~/Documents/GranolaArchive`, no rclone, no API key file, no python.
- Alerts go to Andrew as a **Slack DM, only on problems**. Silent on success — same semantics as the original.

**WRITE BOUNDARY:** this skill creates meeting transcript files and `sync-log.md` in the `GranolaArchive` Drive folder, and (only on problems) sends one Slack DM to Andrew. Nothing else. Never posts to a public channel, never writes to Salesforce or Apollo, never deletes or overwrites archived transcripts.

**Env vars:**

| Variable | Default if unset |
|---|---|
| `AE_EMAIL` | `andrew.miller-mckeever@you.com` |
| `SLACK_USER_ID` | `{SLACK_USER_ID}` |

---

## Mode selection

- **Sync mode (default; scheduled Mondays):** run Steps 1–6 unconditionally.
- **Watchdog mode (scheduled Thursdays, or when invoked as "watchdog"):** run Step 0 first. If the last successful sync is within 7 days, do nothing, post nothing, and end. Otherwise proceed with the full sync (Steps 1–6). This is the mid-week safety net so a missed Monday run cannot let transcripts drift toward the 30-day deletion.

### Step 0 (watchdog mode only): check last success

1. Find the `GranolaArchive` folder and its most recent `sync-log.md` (see Step 2 for how). Read its content via the Drive connector `read_file_content`.
2. Find the most recent line containing `OK` (format: `OK {ISO timestamp} archived N new`). Parse its timestamp.
3. Decide:
   - `sync-log.md` missing, no `OK` line, OR last OK timestamp more than 7 days before today → a run was missed. Proceed to Step 1.
   - Last successful sync within 7 days → do nothing, post nothing, end.

---

## Sync procedure

### Step 1: Enumerate recent Granola meetings

Use the Granola connector tool `get_meetings` (or `list_meetings` if `get_meetings` is unavailable) to enumerate ALL meetings from the last **35 days** (35, not 30 — a safety margin over Granola's deletion window). Paginate until the full window is covered.

For each meeting record, capture: meeting ID, title, and date (YYYY-MM-DD).

**Failure handling:**
- **Auth failure** (connector not connected, authorization rejected/expired): this is the cloud equivalent of the old `AUTH FAILURE`. DM Andrew (Step 6 alert format) with: "Granola archive sync failed — the Granola connector authorization was rejected. Reconnect the Granola connector in claude.ai connector settings, then I'll resume next run." Include the error output. Then STOP (do not touch Drive).
- **Zero meetings retrievable** (calls succeed but return nothing for 35 days, which is implausible for Andrew's calendar, or every call errors): DM Andrew with the error output and note that nothing could be archived. Then STOP.

### Step 2: Locate the Drive archive folder

Use the Google Drive connector tool `search_files` with query `name = 'GranolaArchive' and mimeType = 'application/vnd.google-apps.folder'`. Use the returned folder ID as `parentId` for all writes.

If the folder does not exist, create it via the Drive connector `create_file` with the folder mimeType (`application/vnd.google-apps.folder`), then continue.

### Step 3: Determine which meetings are already archived

Archived files are named exactly:

```
{YYYY-MM-DD} - {title}.md
```

(Sanitize the title for a filename: replace `/`, `\`, and `:` with `-`; collapse whitespace; trim to a sane length. Use the meeting's date, not today's date.)

List the folder's existing files via the Drive connector `search_files` (query the `GranolaArchive` folder as parent; paginate as needed). A meeting is **already archived** if a file with its exact expected name exists. Never overwrite or re-create an existing file — the sync is additive only.

The **missing set** = meetings from Step 1 with no matching file.

### Step 4: Archive missing transcripts

For each meeting in the missing set, one at a time:

1. Fetch the transcript via the Granola connector tool `get_meeting_transcript` with the meeting ID.
2. If the transcript comes back empty or the call errors, record the meeting in a `failures` list and continue to the next meeting. **Never write an empty file** — an empty archive entry would mask a lost transcript.
3. Otherwise create the file via the Drive connector `create_file`:
   - `title`: `"{YYYY-MM-DD} - {title}.md"`
   - `mimeType`: `"text/markdown"` (or `"text/plain"` if markdown is not accepted)
   - `content`: a small header (meeting title, date, attendees if available) followed by the full transcript text (base64-encoded if the tool requires it)
   - `parentId`: the GranolaArchive folder ID
4. If the Drive write fails, retry once; if it still fails, add the meeting to `failures` and continue.

Count successful writes as `N` (archived N new). Meetings already archived count zero.

### Step 5: Update sync-log.md

On success (Step 4 completed, even with N = 0), append a line to `sync-log.md` in the `GranolaArchive` folder:

```
OK {ISO timestamp} archived N new
```

The Drive connector cannot append to a file in place, so:
1. Find the most recently modified `sync-log.md` in the folder (`search_files`), read its full content via `read_file_content`. If none exists, start with empty content.
2. Create `sync-log.md` via `create_file` with the previous content plus the new `OK` line appended, in the same folder.
3. The most recently created `sync-log.md` is always the current log (that is what Step 0 reads). Older copies are harmless duplicates and can be cleaned up manually.

If any meetings failed in Step 4, append instead:

```
PARTIAL {ISO timestamp} archived N new, {M} failed: {comma-separated meeting titles}
```

(A PARTIAL line does not count as `OK` for the watchdog — a failed transcript still needs rescue before deletion.)

### Step 6: Alerts — problems only, silent on success

**If everything succeeded (all missing transcripts archived, log updated): DO NOT post to Slack. Stay silent.** The sync-log.md line is the record.

**DM Andrew ONLY on problems:**
- Granola auth failure (Step 1)
- Zero meetings retrievable (Step 1)
- One or more Drive write failures / empty transcripts (Step 4 `failures` non-empty)
- sync-log.md write failure (Step 5)

To DM: resolve Andrew's Slack user with the Slack connector tool `slack_search_users` using email `{AE_EMAIL}` (fall back to `{SLACK_USER_ID}` if the search fails), then send a direct message via `slack_send_message` with what failed, the raw error output, and what was still archived successfully. Always a DM, never a public channel.

---

## Failure summary

| Failure | Action |
|---------|--------|
| Granola connector auth rejected | DM Andrew: reconnect the Granola connector; STOP before Drive |
| Zero meetings retrievable in 35 days | DM Andrew with error output; STOP |
| Single transcript empty or fetch error | Skip that meeting (never write empty), record in failures, continue |
| Drive write fails for one meeting | Retry once, then record in failures, continue |
| sync-log.md write fails | DM Andrew; the archived files themselves are already safe |
| Everything succeeded | Silent. No Slack post. |

---

## Scheduling (Claude Code Routines)

| Routine | Schedule | Invocation |
|---|---|---|
| Weekly sync | Mondays (e.g. `0 8 * * 1`) | this skill, sync mode |
| Watchdog | Thursdays (e.g. `0 8 * * 4`) | this skill, watchdog mode |

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-17 | Cloud port created from skills/granola-archive-sync (rebuilt from routines/granola-archive-sync + routines/granola-archive-sync-watchdog) | Migration to Claude Code Routines: full rebuild — Granola connector (`get_meetings`/`get_meeting_transcript`) replaces the local python exporter + `.granola_api_key` file, archive moved from ~/Documents/GranolaArchive + rclone to the GranolaArchive Drive folder via the Drive connector, sync-log.md kept on Drive with append-by-recreate, Thursday watchdog folded into the same skill as a mode, problem-only Slack DM semantics preserved (silent on success) |
