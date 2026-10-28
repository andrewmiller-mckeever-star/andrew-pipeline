---
name: granola-archive-sync-cloud
description: CLOUD version for Claude Code Routines. Weekly Granola archive sync rebuilt for cloud execution — uses the Granola connector to enumerate meetings from the last 30 days, archives the notes and AI summary for any meeting not yet backed up to the GranolaArchive Google Drive folder (one Markdown file per meeting, via the Drive connector), and appends a success line to sync-log.md. Transcripts are NOT available on Andrew's free Granola tier. DMs Andrew on Slack ONLY on problems (auth failure, zero meetings retrievable, Drive write failures); silent on success. Also runs in watchdog mode (Thursday): re-runs the sync only if the last successful run is more than 7 days old. No local script, no API key file, no python, no rclone. Use for "run granola archive sync", "granola sync", "archive my granola meetings", or the Thursday watchdog check.
---

# Granola Archive Sync (Cloud)

## Why this exists

Granola's free tier deletes meeting recordings, transcripts, and notes 30 days after the meeting. This routine pulls Andrew's Granola content before it is purged and grows the archive in the `GranolaArchive` folder on Google Drive. The sync is ADDITIVE: it adds new meetings and NEVER overwrites an already-archived file.

## Free-tier reality (settled 2026-09-08, Andrew's call)

Andrew is on the Granola FREE tier, deliberately. Two hard consequences:

- **Transcripts are unavailable.** `get_meeting_transcript` errors with "Transcripts are only available to paid Granola tiers." This skill archives **private notes + the AI summary** instead, via `get_meetings`. Do not treat a missing transcript as a failure and do not DM about it.
- **The old Personal API key path is dead** (`403 SUBSCRIPTION_INACTIVE`). It is paid-only. Never advise regenerating the key for that error; the key is valid, the plan gates it.

The connector itself authenticates independently and works fine on the free tier. Its window is capped at `last_30_days`, so anything older than 30 days is already gone and unrecoverable by any path.

**This is a cloud REBUILD, not a port.** The laptop version ran a local Python exporter (`granola_export.py`) with a `.granola_api_key` file and backed up via rclone. None of that exists here:
- Meeting content comes from the account-level claude.ai **Granola connector** (tools with function-name suffixes `list_meetings` and `get_meetings` — locate by suffix, never by a hardcoded `mcp__<uuid>__` prefix). `get_meeting_transcript` exists but is unusable on the free tier; do not call it.
- The archive lives directly in the **`GranolaArchive` Google Drive folder** (Drive connector `search_files` / `create_file`). No local `~/Documents/GranolaArchive`, no rclone, no API key file, no python.
- Alerts go to Andrew as a **Slack DM, only on problems**. Silent on success — same semantics as the original.

**WRITE BOUNDARY:** this skill creates meeting note files and `sync-log.md` in the `GranolaArchive` Drive folder, and (only on problems) sends one Slack DM to Andrew. Nothing else. Never posts to a public channel, never writes to Salesforce or Apollo, never deletes or overwrites an archived file.

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

Use the Granola connector tool `list_meetings` with `time_range: "last_30_days"` and `involvement: {captured_by_me: true, listed_as_participant: true}` to enumerate meetings.

`last_30_days` is the widest window the tool accepts (the parameter is an enum: `this_week`, `last_week`, `last_30_days`), so there is no safety margin over Granola's deletion window. That is exactly why the Thursday watchdog matters: a meeting that ages past 30 days is gone before any run can reach it.

For each meeting record, capture: meeting ID, title, and date (YYYY-MM-DD).

**Failure handling:**
- **Auth failure** (connector not connected, authorization rejected/expired): this is the cloud equivalent of the old `AUTH FAILURE`. DM Andrew (Step 6 alert format) with: "Granola archive sync failed — the Granola connector authorization was rejected. Reconnect the Granola connector in claude.ai connector settings, then I'll resume next run." Include the error output. Then STOP (do not touch Drive).
- **Zero meetings retrievable** (calls succeed but return nothing for the full 30 days, which is implausible for Andrew's calendar, or every call errors): DM Andrew with the error output and note that nothing could be archived. Then STOP.

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

### Step 4: Archive missing meetings (notes + summary)

Fetch the missing meetings via the Granola connector tool `get_meetings`, passing up to 10 meeting IDs per call and batching as needed. This returns private notes, the AI summary, attendees, and metadata.

**Do NOT call `get_meeting_transcript`.** It fails on the free tier and its failure is expected, not reportable.

Then for each meeting:

1. If the meeting has neither private notes nor a summary, record it in a `failures` list and continue. **Never write an empty file** — an empty archive entry would mask a real loss.
2. Otherwise create the file via the Drive connector `create_file`:
   - `title`: `"{YYYY-MM-DD} - {title}.md"`
   - `mimeType`: `"text/markdown"` (or `"text/plain"` if markdown is not accepted)
   - `content`: a header (meeting title, date, attendees), a one-line note that this came through the connector and has no transcript, then `## Private Notes` (only if present) and `## Summary` (base64-encoded if the tool requires it)
   - `parentId`: the GranolaArchive folder ID
3. If the Drive write fails, retry once; if it still fails, add the meeting to `failures` and continue.

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

(A PARTIAL line does not count as `OK` for the watchdog — a meeting that failed to archive still needs rescue before deletion.)

### Step 6: Alerts — problems only, silent on success

**If everything succeeded (all missing meetings archived, log updated): DO NOT post to Slack. Stay silent.** The sync-log.md line is the record. Archiving zero new meetings is a normal success, not a problem.

**DM Andrew ONLY on problems:**
- Granola auth failure (Step 1)
- Zero meetings retrievable (Step 1)
- One or more Drive write failures, or meetings with neither notes nor summary (Step 4 `failures` non-empty)
- sync-log.md write failure (Step 5)

To DM: resolve Andrew's Slack user with the Slack connector tool `slack_search_users` using email `{AE_EMAIL}` (fall back to `{SLACK_USER_ID}` if the search fails), then send a direct message via `slack_send_message` with what failed, the raw error output, and what was still archived successfully. Always a DM, never a public channel.

---

## Failure summary

| Failure | Action |
|---------|--------|
| Granola connector auth rejected | DM Andrew: reconnect the Granola connector; STOP before Drive |
| Zero meetings retrievable in 30 days | DM Andrew with error output; STOP |
| Transcript unavailable (free tier) | EXPECTED. Not a failure. Archive notes + summary, never DM about it |
| Single meeting has neither notes nor summary | Skip that meeting (never write empty), record in failures, continue |
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
| 2026-09-08 | Step 4 switched from `get_meeting_transcript` to `get_meetings` (notes + AI summary); window corrected from 35 days to the connector's actual `last_30_days` cap; transcript absence and `SUBSCRIPTION_INACTIVE` demoted to expected-and-silent | Andrew moved to the Granola free tier on purpose. `get_meeting_transcript` returns "Transcripts are only available to paid Granola tiers", so the old Step 4 would have failed EVERY meeting, written nothing, and DM'd Andrew on every run. The 35-day window was never reachable: the tool's `time_range` is an enum capped at `last_30_days`. |
| 2026-07-17 | Cloud port created from skills/granola-archive-sync (rebuilt from routines/granola-archive-sync + routines/granola-archive-sync-watchdog) | Migration to Claude Code Routines: full rebuild — Granola connector (`get_meetings`/`get_meeting_transcript`) replaces the local python exporter + `.granola_api_key` file, archive moved from ~/Documents/GranolaArchive + rclone to the GranolaArchive Drive folder via the Drive connector, sync-log.md kept on Drive with append-by-recreate, Thursday watchdog folded into the same skill as a mode, problem-only Slack DM semantics preserved (silent on success) |
