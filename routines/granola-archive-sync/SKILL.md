---
name: granola-archive-sync
description: Weekly Granola archive sync — captures notes/summaries (and transcripts if the plan ever allows) before Granola's 30-day free-tier deletion, backs up to Drive, alerts Slack only on problems
---

Weekly Granola archive sync.

WHY THIS EXISTS: Granola's free tier deletes meeting recordings, transcripts, and notes 30 days after the meeting. This routine pulls Andrew's Granola content before it is purged and grows the local archive at ~/Documents/GranolaArchive. The sync is ADDITIVE: it adds new meetings and NEVER overwrites an already-saved file.

**READ THIS FIRST (settled 2026-09-08, Andrew's call).** Andrew is on the Granola FREE tier, deliberately. The free tier does not include API access, so `granola_export.py` returns `403 SUBSCRIPTION_INACTIVE` and always will while he stays on free. The primary path is now the **Granola MCP connector**, which works on the free tier but returns private notes and the AI summary ONLY, never raw transcripts (`get_meeting_transcript` errors with "Transcripts are only available to paid Granola tiers").

Consequences, do not relitigate them each run:
- `SUBSCRIPTION_INACTIVE` is the EXPECTED state. It is NOT a problem and must NOT trigger a Slack DM. Andrew received 9 identical DMs about it between 2026-08-10 and 2026-09-07; that noise is the bug this rewrite fixes.
- Never tell Andrew to regenerate the API key for this error. The key is valid; the plan gates it.
- Transcripts are unrecoverable while on free tier. Do not report their absence as a failure.

---

## Step 0: Probe the API (decides which path runs)

The exporter is still the better path IF the plan ever allows it (it gets transcripts). Probe cheaply:

```
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $(cat ~/Documents/GranolaArchive/.granola_api_key)" "https://public-api.granola.ai/v1/notes?limit=1"
```

- **200** → the subscription is active again. Run the EXPORTER PATH (Step 1A). Transcripts are available, take them.
- **403** → free tier as expected. Run the CONNECTOR PATH (Step 1B). Silent, no DM.
- **Any other code, or curl fails** → run the CONNECTOR PATH, and include the odd code in the end-of-run DM only if the connector path also fails.

---

## Step 1A: Exporter path (only if Step 0 returned 200)

1. `python3 ~/Documents/GranolaArchive/granola_export.py`
2. If it exits non-zero, DM Andrew the error output, then fall through to the CONNECTOR PATH so the run still archives something.
3. On success, continue to Step 2 (backup).

The exporter writes its own `OK` line to sync.log, keyed by `granola_id`, and preserves any transcript it already saved. Do not duplicate its logging.

---

## Step 1B: Connector path (the normal path)

Use the Granola MCP connector. Locate tools by function-name suffix (`list_meetings`, `get_meetings`), never by a hardcoded `mcp__<uuid>__` prefix.

1. **Enumerate.** `list_meetings` with `time_range: "last_30_days"` and `involvement: {captured_by_me: true, listed_as_participant: true}`.
   - **Auth failure** (connector not connected or authorization rejected): DM Andrew that the Granola connector needs reconnecting in claude.ai connector settings, include the error, then STOP. This is a real problem, distinct from `SUBSCRIPTION_INACTIVE`.
   - **Zero meetings returned** across the whole 30 days: implausible for Andrew's calendar. DM Andrew with the raw output, then STOP.

2. **Dedupe by `granola_id`, not by filename.** For each meeting ID, check whether it is already archived:

   ```
   grep -rl "granola_id: \"<MEETING_ID>\"" ~/Documents/GranolaArchive/notes/ ~/Documents/GranolaArchive/notes-salvaged/
   ```

   Check BOTH directories. A hit means already archived: skip it, never overwrite. The missing set is everything with no hit.

   If the missing set is empty, skip to Step 2.

3. **Fetch.** `get_meetings` with the missing IDs, max 10 per call, batching as needed.

4. **Write one Markdown file per meeting** into `~/Documents/GranolaArchive/notes-salvaged/`.

   Directory choice is deliberate: `notes/` belongs to the exporter and is keyed by its own naming, so connector output stays in `notes-salvaged/` to guarantee no collision if the exporter path is ever restored. The name says "salvaged" for historical reasons; it is now the primary output directory.

   Filename: `YYYY-MM-DD__Company__Title-slug.md`, using the MEETING's date, not today's. `Company` is derived from external attendee email domains; if every attendee is @you.com, use `Internal`. Sanitize the slug: strip punctuation, collapse whitespace to single hyphens, trim to a sane length.

   Frontmatter and body, matching the existing files in that directory:

   ```
   ---
   title: "<meeting title>"
   date: YYYY-MM-DD
   company: "<Company>"
   attendees: ["email", ...]
   granola_id: "<uuid>"
   source_url: "https://notes.granola.ai/d/<uuid>"
   salvaged_via: "granola-mcp-connector"
   salvaged_on: <today YYYY-MM-DD>
   transcript_available: false
   ---
   ```

   Then an `# <title>` heading, a Date/Company/Attendees block, a short note that this came through the connector and has no transcript, then `## Private Notes` (only if the meeting has any) and `## Summary`.

   **Never write a file with neither notes nor summary.** An empty entry would mask a real loss. Record such a meeting in a `failures` list and continue.

---

## Step 2: Back up off-laptop

NEVER upload the API key:

```
rclone copy ~/Documents/GranolaArchive gdrive:GranolaArchive --exclude ".granola_api_key" --exclude "sync.log" --exclude "granola_export.py"
```

`rclone copy` is additive and does not delete. If it exits non-zero, DM Andrew the rclone error output.

---

## Step 3: Log the run

Append ONE line to `~/Documents/GranolaArchive/sync.log`:

- Full success: `YYYY-MM-DD HH:MM:SS  OK  path=connector archived=N skipped=M transcripts=unavailable backup=success`
- Some meetings failed: `YYYY-MM-DD HH:MM:SS  PARTIAL  path=connector archived=N failed=M ...`

**Hard rule:** a non-success line must never contain the literal string `OK` anywhere, including inside words like "token". The watchdog greps for `OK` to find the last success, and a stray match blinds it. `PARTIAL` does not count as a success for the watchdog.

---

## Step 4: Alerts — problems only

**On full success, post NOTHING. Stay silent.** The sync.log line is the record.

DM Andrew ONLY for:
- Granola connector auth rejected or not connected (Step 1B.1)
- Zero meetings retrievable across 30 days (Step 1B.1)
- One or more meetings with no notes and no summary (Step 1B.4 failures)
- rclone backup failure (Step 2)
- Exporter failure when Step 0 returned 200 (Step 1A.2)

To DM: resolve his user with `slack_search_users` on `andrew.miller-mckeever@you.com` (user ID `U0A4M1BAR08`), then `slack_send_message` to that user. Always a DM, never a public channel.

**Do NOT DM for:** `SUBSCRIPTION_INACTIVE`, missing transcripts, or a run where everything already existed (archived=0 is a normal outcome).

Keep any DM short. State what failed, the raw error, and what was still archived. Do not re-derive the free-tier situation; Andrew decided it.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-08 | Connector path became primary; API probe added at Step 0; `SUBSCRIPTION_INACTIVE` demoted to expected-and-silent; dedupe switched to `granola_id` across both note directories | Andrew moved to the Granola free tier on purpose. The API is paid-only, so the exporter can never run; the connector still returns notes and summaries. Also stops the weekly duplicate DM (9 identical alerts, 08-10 to 09-07). |
