# Cloud Migration Runbook — laptop scheduled tasks → Claude Code Routines

Goal: move 13 of the 18 laptop schedules to Anthropic cloud Routines so the Mac stops running 31GB memory spikes. 5 browser-bound schedules stay local for now. Everything here assumes the account-level connectors already connected: Google Calendar, Google Drive, Slack, Salesforce, Apollo.io, Granola, Gmail, You.com Search.

## Step 0 — Before anything ships (you, ~15 min) ⚠️

1. **Rotate BOTH CTD API keys.** `uak_E4WNasx-…` and `uak_ySiouuC1…` were committed to this repo and, although redacted in commit d8b669b, remain readable in the **git history of a public repo**. They are Nick's credentials. Get replacements, update your local `ae-config.md`, and later add the new key as the `CTD_API_KEY` env var (Step 1). Optional hardening afterward: make the repo private, or scrub history with `git filter-repo`. Rotation is the part that matters.
2. Skim `routines-cloud/README.md` — it maps all 18 laptop tasks to their cloud fate and records the timezone decision (LA for meeting-brief family, Denver for the rest).

## Step 1 — Cloud environment config (you, web UI, ~10 min)

In Claude Code web → your environment for `andrewmiller-mckeever-star/andrew-pipeline`:

**Environment variables:**

| Var | Value | Needed by |
|---|---|---|
| `YDC_API_KEY` | your You.com API key | meeting-brief research, ydc-research, quick-research (all degrade gracefully without it) |
| `APOLLO_API_KEY` | your Apollo key | linkedin-queue report, usage-outreach REST calls |
| `COMPANY_SEARCH_API_KEY` | company-search proxy token | company-search skill |
| `CTD_API_KEY` | the NEW rotated key | quick-research, account-ranking |
| `CTD_CLIENT_ID` | `andrew.miller-mckeever@you.com` | same |
| `AE_NAME` | `Andrew Miller-McKeever` | identity in briefs |
| `AE_FIRST_NAME` | `Andrew` | identity |
| `SFDC_USER_ID` | `005Vq000009j4ezIAA` | SOQL owner filters |
| `GDRIVE_FOLDER_ID` | `1Fd2sMXvUnFVbAoh_BxqCrUI3R8snvp9u` | Drive fallback parent |
| `SLACK_USER_ID` | `U0A4M1BAR08` | @-mentions |

**Network policy:** allow `api.you.com`, `api.apollo.io`, `api.ctd.ai`, `youdotcom-company-search-production.up.railway.app` (or use unrestricted).

## Step 2 — Create Routines (you, web UI, batched)

Each file in `routines-cloud/` is one Routine: it gives you the schedule, timezone, connectors, and the exact prompt to paste.

**Wave 1 (this week):**
1. `ydc-meeting-brief.md` — THE PILOT. Create unscheduled → manual run → check the 4 verification points in the file → enable `0 15 * * 0-4` America/Los_Angeles → after 2 clean scheduled runs, disable the Mac's `ydc-meeting-brief` task.
2. `meeting-brief-monitor.md` — after the pilot is scheduled.
3. Retire the Mac's three Monday watchdogs (7am/8am/9:30am). Optionally create `meeting-brief-monday-catchup.md` as temporary insurance.
4. `ydc-territory-watchdog.md` — status-only; safe immediately.
5. `ydc-usage-outreach-watchdog.md` — safe immediately.

**Wave 2 (once wave 1 is stable):**
6. `ydc-linkedin-queue.md` (needs `APOLLO_API_KEY`).
7. `ydc-usage-outreach-daily.md` → then 8. `ydc-usage-outreach-enroll-watcher.md` (pair; read the SFDC-write caveat in the daily file).
9. `granola-archive-sync.md` → then 10. `granola-archive-sync-watchdog.md` (cloud rebuild; laptop python/rclone retires).

**Cutover rule for every routine:** create unscheduled → manual test → verify expected output (listed in each file) → enable schedule → watch 2–3 runs → THEN disable the laptop twin. Never both live: double Slack posts / double enrollment.

**Rollback:** disable the cloud Routine, re-enable the laptop task. The laptop definitions stay archived in `routines/` and on the Mac at `~/.claude/scheduled-tasks/`.

## Stays on the laptop (5 schedules)

`ydc-territory-nightly` + its two retry watchdogs, `ydc-linkedin-apollo-tasks-daily`, `linkedin-tasks-check`. All drive a logged-in browser (Playwright against Apollo UI / LinkedIn). Future options, in rough order of effort: Browserbase-backed browser automation; a Managed Agents scheduled deployment with a self-hosted sandbox; a small VM. `andrew-signals/` (already live on GCP Cloud Run + Cloud Scheduler) is the proven template if you go the GCP route with Nick.

## What changed in this repo

- `.claude/skills/` — cloud-adapted skill ports (connectors only, env-var secrets, no local paths, no rclone, no browser; Salesforce strictly read-only with writes surfaced for review).
- `routines-cloud/` — one ready-to-paste Routine definition per cloud schedule.
- `CLAUDE.md` — new "Cloud Execution" section (write boundary, connector auth, env vars).
- `memory/salesforce.md` — fixed stale fork identity (was ryan.reed@you.com).
- Originals in `skills/` and `routines/` are untouched; the laptop keeps working from them until each cutover.

## Known limits, stated plainly

- **Salesforce writes are impossible from the cloud connector** (read-only toolset). The only affected flow is usage-outreach Contact creation — the cloud port surfaces the payloads for your review instead of executing them.
- **Enroll-watcher cadence** depends on the Routine UI's minimum interval; 30 or 60 min is an acceptable fallback (latency only — approval-gated and idempotent).
- **Timezone ambiguity** in the old setup (README said Denver, meeting-brief said Pacific) is resolved per `routines-cloud/README.md`; confirm each schedule as you create it.
