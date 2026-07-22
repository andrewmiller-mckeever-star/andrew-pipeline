# routines-cloud/ — Claude Code Routine definitions

One file per cloud Routine. Each file contains everything needed to create the Routine in the Claude Code web UI: schedule, timezone, connectors to enable, and the exact prompt to paste. The prompt bodies are cloud-adapted versions of the laptop scheduled tasks in `routines/` (connector tools instead of hardcoded local MCP IDs, no local paths, no rclone).

**How to create one:** Claude Code web → Automations/Routines → New Routine → repository `andrewmiller-mckeever-star/andrew-pipeline` → paste the PROMPT block → select the listed connectors → set the schedule → fire a manual "Run now" test, verify the expected output, then trust the schedule.

**⚠️ Routine prompts must be fully self-contained (learned 2026-07-20, two failed runs):** Routine sessions cannot be trusted to see the repo at all. Run 1 had the repo cloned but did not register `.claude/skills/` as invocable skills; run 2 had NO repo checkout ("no repo is checked out in this environment"). Therefore every PROMPT in this directory embeds the complete workflow inline — no "run the X skill", no "read the file .claude/skills/...". The `.claude/skills/` versions remain the canonical long-form for interactive cloud sessions; when you edit one, update the matching inline prompt here. Also trim each Routine's connectors to only the ones its file lists — headless runs can hang on connectors that need interactive re-auth (Apollo and Sumble were pending re-auth when the extras were attached).

**Cutover rule (every routine):** never run the cloud Routine and the laptop task on the same schedule at the same time — you'll get double Slack posts or double enrollment. Sequence: manual cloud test → verify → enable cloud schedule → watch 2-3 runs → disable the laptop task (each file names which one).

## Migration status map (18 laptop tasks → cloud)

**Watchdog architecture (Andrew, 2026-07-21, revised):** the OLD Mac watchdogs existed because the laptop could be closed — that failure mode is gone in cloud. But cloud runs can still fail silently, so each cloud primary gets ONE cloud watchdog a few hours later. Where re-running is cheap the watchdog SELF-HEALS (runs the full workflow itself); where it isn't, it ALERTS via DM. Superseded files kept for history: `meeting-brief-monitor.md`, `meeting-brief-monday-catchup.md` (both replaced by `meeting-brief-watchdog.md`).

| Cloud primary | Cloud watchdog | Behavior |
|---|---|---|
| ydc-meeting-brief (3 PM) | `meeting-brief-watchdog.md` (6 PM Sun–Thu LA) | Self-heals: re-runs full brief workflow |
| ydc-linkedin-queue (9:30 AM) | `ydc-linkedin-queue-watchdog-cloud.md` (11:30 AM) | Self-heals: re-runs the report |
| ydc-usage-outreach-daily (9 AM) | `ydc-usage-outreach-watchdog.md` (10 AM) | Alerts (DM); scan too heavy to duplicate |
| granola-archive-sync (Mon 11 AM) | `granola-archive-sync-watchdog.md` (Thu 11 AM) | Self-heals: full catch-up sync |
| enroll-watcher (every 15-30 min) | `ydc-usage-outreach-enroll-watchdog.md` (8:45 PM) | Alerts (DM) if a "go" went un-actioned; never enrolls |

`ydc-territory-watchdog.md` remains the special case: it watches the LAPTOP territory pipeline (not migrating) — a cloud status post is the only laptop-closed detection for it. Recommended.

| Laptop task | Cloud plan |
|---|---|
| ydc-meeting-brief | → `ydc-meeting-brief.md` (PILOT — LIVE in cloud 2026-07-21) |
| meeting-brief-monitor | RETIRE (watchdog; Runs panel replaces it). File kept as optional. |
| meeting-brief-monday-watchdog-7am/-8am/-930am | RETIRE (existed only because the laptop was closed on Sundays) |
| ydc-territory-watchdog | OPTIONAL cloud Routine — watches the LAPTOP territory pipeline, which is not migrating; a cloud status post is the only laptop-closed detection for it |
| ydc-usage-outreach-watchdog | RETIRE (watchdog; Runs panel replaces it). File kept as optional. |
| ydc-linkedin-queue | → `ydc-linkedin-queue.md` (wave 2, needs APOLLO_API_KEY env var) |
| ydc-usage-outreach-daily | → `ydc-usage-outreach-daily.md` (wave 2) |
| ydc-usage-outreach-enroll-watcher | → `ydc-usage-outreach-enroll-watcher.md` (wave 2 — NOT a watchdog: it's the event poller for Andrew's "go" reply; required) |
| granola-archive-sync | → `granola-archive-sync.md` (wave 2, REBUILT on Granola connector) |
| granola-archive-sync-watchdog | RETIRE (catch-up for missed laptop Mondays; cloud doesn't miss Mondays). File kept as optional. |
| ydc-linkedin-queue-watchdog | already disabled — do not migrate |
| ydc-territory-nightly | STAYS ON LAPTOP (Playwright/Apollo UI) |
| ydc-territory-watchdog-10pm (3pm retry) | STAYS ON LAPTOP (re-runs browser pipeline) |
| ydc-territory-watchdog-2am (7pm retry) | STAYS ON LAPTOP (re-runs browser pipeline) |
| ydc-linkedin-apollo-tasks-daily | STAYS ON LAPTOP (Playwright/LinkedIn session) |
| linkedin-tasks-check | STAYS ON LAPTOP (re-runs browser script) |

End state: **5 cloud Routines** (meeting-brief, linkedin-queue, granola-sync, usage-outreach-daily, enroll-watcher; +1 optional territory status), **7 watchdogs retired outright**, **5-6 tasks stay on the laptop** (browser-bound + territory watchdogs).

## Timezones

Laptop crons were America/Denver (per routines/README.md) with the meeting-brief family described as Pacific in the skill bodies. This directory uses: **America/Los_Angeles for the meeting-brief family** (per Andrew's instruction), **America/Denver for everything else** (matching current behavior). Confirm each at creation time.
