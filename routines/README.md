# Scheduled Routines

Snapshot of the Claude Code scheduled tasks deployed at `~/.claude/scheduled-tasks/`. Each folder holds the routine's `SKILL.md` (the prompt that runs on schedule). To restore, copy a folder back into `~/.claude/scheduled-tasks/` and re-register the schedule.

All times are local (America/Denver). Schedules as of 2026-09-12.

| Routine | Schedule (cron) | When | Enabled | Purpose |
|---|---|---|---|---|
| ydc-territory-nightly | `0 14 * * 1-5` | 2pm Mon-Fri | yes | Runs the full territory pipeline on 3 pre-validated accounts, builds Apollo sequences, posts Slack summary |
| ydc-territory-watchdog | `0 17 * * 1-5` | 5pm Mon-Fri | yes | Checks the 2pm pipeline ran; if not, resets the marker and reruns it; posts pass/fail either way (consolidated from 3 watchdogs — 3pm check, 3pm rerun, 7pm final safety net — into this 1, 2026-09-12, to cut redundant monitoring cost) |
| ydc-usage-outreach-daily | `0 9 * * 1-5` | 9am Mon-Fri | yes | Scans new API signups and active users, classifies them, posts review list to Slack |
| ydc-usage-outreach-enroll-watcher | `0 16 * * 1-5` | 4pm Mon-Fri | yes | Watches the review channel for a "go" reply and auto-enrolls approved contacts (cut from every-15-min → 3x/day → 1x/day, 2026-09-12, to reduce cost; open-list logic looks back 7-8 days so a "go" is only delayed, never missed) |
| ydc-usage-outreach-watchdog | `0 10 * * 1-5` | 10am Mon-Fri | yes | Confirms the 9am usage scan ran; alerts if it didn't |
| ydc-linkedin-apollo-tasks-daily | `0 9 * * 1-5` | 9am Mon-Fri | yes | Processes pending Apollo LinkedIn connect/DM tasks via script, posts results |
| linkedin-tasks-check | `0 14 * * 1-5` | 2pm Mon-Fri | yes | Watchdog for the 9am LinkedIn run; re-runs if tasks still pending |
| ydc-linkedin-queue | `30 9 * * 1-5` | 9:33am Mon-Fri | yes | Posts a morning summary of completed LinkedIn connects and DMs |
| ydc-linkedin-queue-watchdog | `0 12 * * 1-5` | noon Mon-Fri | no | (disabled) Re-runs the LinkedIn queue if the morning run failed |
| ydc-meeting-brief | `0 15 * * 0-4` | 3pm Sun-Thu | yes | Pulls tomorrow's calendar, researches external meetings, creates Google Doc briefs |
| meeting-brief-monitor | `45 15 * * 0-4` | 3:45pm Sun-Thu | yes | Confirms the meeting brief job ran, posts confirmation to Slack |
| meeting-brief-monday-watchdog | `0 9 * * 1` | 9am Mon | yes | If Sunday's brief didn't run, runs it for today's meetings (consolidated from 3 watchdogs — 7am/8am/9:30am — into this 1, 2026-09-12) |
| granola-archive-sync | `0 11 * * 1` | 11am Mon | yes | Archives Granola meeting transcripts before free-tier deletion, backs up to Drive |
| granola-archive-sync-watchdog | `0 11 * * 4` | 11am Thu | yes | Re-runs the Granola sync if Monday's run was missed |

No credentials live in these files. API keys are read from local files or env vars (`ae-config.md`, `~/Documents/GranolaArchive/.granola_api_key`, `$APOLLO_API_KEY`) that are never committed.
