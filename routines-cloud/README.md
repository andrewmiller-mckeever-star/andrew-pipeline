# routines-cloud/ — Claude Code Routine definitions

One file per cloud Routine. Each file contains everything needed to create the Routine in the Claude Code web UI: schedule, timezone, connectors to enable, and the exact prompt to paste. The prompt bodies are cloud-adapted versions of the laptop scheduled tasks in `routines/` (connector tools instead of hardcoded local MCP IDs, no local paths, no rclone).

**How to create one:** Claude Code web → Automations/Routines → New Routine → repository `andrewmiller-mckeever-star/andrew-pipeline` → paste the PROMPT block → select the listed connectors → set the schedule → save unscheduled first, fire a manual test run, verify the expected output, THEN enable the schedule.

**Cutover rule (every routine):** never run the cloud Routine and the laptop task on the same schedule at the same time — you'll get double Slack posts or double enrollment. Sequence: manual cloud test → verify → enable cloud schedule → watch 2-3 runs → disable the laptop task (each file names which one).

## Migration status map (18 laptop tasks → cloud)

| Laptop task | Cloud plan |
|---|---|
| ydc-meeting-brief | → `ydc-meeting-brief.md` (wave 1, PILOT) |
| meeting-brief-monitor | → `meeting-brief-monitor.md` (wave 1) |
| meeting-brief-monday-watchdog-7am/-8am/-930am | RETIRE (existed only because the laptop was closed on Sundays; cloud runs Sundays). Optional single insurance: `meeting-brief-monday-catchup.md` |
| ydc-territory-watchdog | → `ydc-territory-watchdog.md` (wave 1, status-only) |
| ydc-usage-outreach-watchdog | → `ydc-usage-outreach-watchdog.md` (wave 1) |
| ydc-linkedin-queue | → `ydc-linkedin-queue.md` (wave 2, needs APOLLO_API_KEY env var) |
| ydc-usage-outreach-daily | → `ydc-usage-outreach-daily.md` (wave 2) |
| ydc-usage-outreach-enroll-watcher | → `ydc-usage-outreach-enroll-watcher.md` (wave 2) |
| granola-archive-sync | → `granola-archive-sync.md` (wave 2, REBUILT on Granola connector) |
| granola-archive-sync-watchdog | → `granola-archive-sync-watchdog.md` (wave 2) |
| ydc-linkedin-queue-watchdog | already disabled — do not migrate |
| ydc-territory-nightly | STAYS ON LAPTOP (Playwright/Apollo UI) |
| ydc-territory-watchdog-10pm (3pm retry) | STAYS ON LAPTOP (re-runs browser pipeline) |
| ydc-territory-watchdog-2am (7pm retry) | STAYS ON LAPTOP (re-runs browser pipeline) |
| ydc-linkedin-apollo-tasks-daily | STAYS ON LAPTOP (Playwright/LinkedIn session) |
| linkedin-tasks-check | STAYS ON LAPTOP (re-runs browser script) |

End state: 13 schedules in cloud (10 Routines + 3 retired), 5 on the laptop.

## Timezones

Laptop crons were America/Denver (per routines/README.md) with the meeting-brief family described as Pacific in the skill bodies. This directory uses: **America/Los_Angeles for the meeting-brief family** (per Andrew's instruction), **America/Denver for everything else** (matching current behavior). Confirm each at creation time.
