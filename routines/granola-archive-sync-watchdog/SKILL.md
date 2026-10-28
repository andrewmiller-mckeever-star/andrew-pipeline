---
name: granola-archive-sync-watchdog
description: Thursday watchdog — re-runs the Granola archive sync if Monday's run was missed (Mac asleep) and last success is >7 days old
---

Watchdog for the weekly Granola archive sync (task `granola-archive-sync`, scheduled Mondays).

WHY THIS EXISTS: the sync only fires when Andrew's Mac is awake. If Monday's run was missed, content drifts toward Granola's 30-day free-tier deletion. This is a mid-week safety net.

**READ THIS FIRST (settled 2026-09-08, Andrew's call).** Andrew is on the Granola FREE tier deliberately. The export API is paid-only and returns `403 SUBSCRIPTION_INACTIVE`; the Granola MCP connector is the working path but gives notes and AI summaries only, never transcripts. `SUBSCRIPTION_INACTIVE` is EXPECTED, is NOT a problem, and must NOT trigger a Slack DM. Never tell Andrew to regenerate the API key for it.

The 30-day connector window makes this watchdog more important than it used to be: once a meeting ages past 30 days, no path can reach it.

---

## Step 1: Check last success

Read `~/Documents/GranolaArchive/sync.log`. Find the most recent line containing `OK` (format: `YYYY-MM-DD HH:MM:SS  OK  ...`) and parse its timestamp.

`PARTIAL` and `FAIL` lines do NOT count as a success.

## Step 2: Gate

- Last `OK` is within 7 days → Monday's sync ran. Do nothing, post nothing, end.
- `sync.log` missing, no `OK` line, or last `OK` more than 7 days old → a run was missed. Proceed to Step 3.

## Step 3: Catch-up run

Run the full procedure in `~/.claude/scheduled-tasks/granola-archive-sync/SKILL.md`, all steps in order: Step 0 API probe, then the exporter path (only on HTTP 200) or the connector path (the normal case), then the Drive backup, then the sync.log line, then alerts.

Do not re-implement that procedure here. Read that file and follow it, so the two paths cannot drift apart.

## Step 4: Alerts

Same rules as the weekly task: DM Andrew ONLY on real problems (connector auth rejected, zero meetings retrievable across 30 days, meetings with neither notes nor summary, rclone backup failure). Silent on a normal catch-up success. Never DM for `SUBSCRIPTION_INACTIVE` or for missing transcripts.

Resolve his Slack user with `slack_search_users` on `andrew.miller-mckeever@you.com` (user ID `U0A4M1BAR08`). Always a DM, never a public channel.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-08 | Delegated the sync body to the weekly task file instead of duplicating it; `SUBSCRIPTION_INACTIVE` demoted to expected-and-silent | Andrew moved to the Granola free tier on purpose. Duplicating the procedure in two files is how the old key-regeneration advice survived in the watchdog after the weekly task was corrected. |
