# Scheduled Routines

Snapshot of the Claude Code scheduled tasks deployed at `~/.claude/scheduled-tasks/`. Each folder holds the routine's `SKILL.md` (the prompt that runs on schedule). To restore, copy a folder back into `~/.claude/scheduled-tasks/` and re-register the schedule.

All times are local (America/Denver). Schedules as of 2026-07-17.

| Routine | Schedule (cron) | When | Enabled | Purpose |
|---|---|---|---|---|
| ydc-territory-nightly | `0 14 * * 1-5` | 2pm Mon-Fri | yes | Runs the full territory pipeline on 3 pre-validated accounts, builds Apollo sequences, posts Slack summary |
| ydc-territory-watchdog | `0 15 * * 1-5` | 3pm Mon-Fri | yes | Checks the 2pm pipeline ran; posts pass/fail to Slack |
| ydc-territory-watchdog-10pm | `0 15 * * 1-5` | 3pm Mon-Fri | yes | If the 2pm pipeline didn't complete, resets the marker and re-runs it |
| ydc-territory-watchdog-2am | `0 19 * * 1-5` | 7pm Mon-Fri | yes | Final safety net re-run if pipeline and first watchdog both failed |
| ydc-usage-outreach-daily | `0 9 * * 1-5` | 9am Mon-Fri | yes | Scans new API signups and active users, classifies them, posts review list to Slack |
| ydc-usage-outreach-enroll-watcher | `*/15 7-20 * * 1-5` | every 15 min, 7am-9pm Mon-Fri | yes | Watches the review channel for a "go" reply and auto-enrolls approved contacts |
| ydc-usage-outreach-watchdog | `0 10 * * 1-5` | 10am Mon-Fri | yes | Confirms the 9am usage scan ran; alerts if it didn't |
| ydc-linkedin-apollo-tasks-daily | `0 9 * * 1-5` | 9am Mon-Fri | yes | Processes pending Apollo LinkedIn connect/DM tasks via script, posts results |
| linkedin-tasks-check | `0 14 * * 1-5` | 2pm Mon-Fri | yes | Watchdog for the 9am LinkedIn run; re-runs if tasks still pending |
| ydc-linkedin-queue | `30 9 * * 1-5` | 9:33am Mon-Fri | yes | Posts a morning summary of completed LinkedIn connects and DMs |
| ydc-linkedin-queue-watchdog | `0 12 * * 1-5` | noon Mon-Fri | no | (disabled) Re-runs the LinkedIn queue if the morning run failed |
| ydc-meeting-brief | `0 15 * * 0-4` | 3pm Sun-Thu | yes | Pulls tomorrow's calendar, researches external meetings, creates Google Doc briefs |
| meeting-brief-monitor | `45 15 * * 0-4` | 3:45pm Sun-Thu | yes | Confirms the meeting brief job ran, posts confirmation to Slack |
| meeting-brief-monday-watchdog-7am | `0 7 * * 1` | 7am Mon | yes | If Sunday's brief didn't run, runs it for today's meetings |
| meeting-brief-monday-watchdog-8am | `0 8 * * 1` | 8am Mon | yes | Second Monday check for the meeting brief |
| meeting-brief-monday-watchdog-930am | `30 9 * * 1` | 9:30am Mon | yes | Final Monday check for the meeting brief |
| granola-archive-sync | `0 11 * * 1` | 11am Mon | yes | Archives Granola meeting transcripts before free-tier deletion, backs up to Drive |
| granola-archive-sync-watchdog | `0 11 * * 4` | 11am Thu | yes | Re-runs the Granola sync if Monday's run was missed |

No credentials live in these files. API keys are read from local files or env vars (`ae-config.md`, `~/Documents/GranolaArchive/.granola_api_key`, `$APOLLO_API_KEY`) that are never committed.
