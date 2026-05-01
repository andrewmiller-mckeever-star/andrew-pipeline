# Nightly Pipeline Plan
**Last updated:** 2026-04-27
**Status:** Planning complete. Build not yet started.

---

## What This Is

A daily automated pipeline that kicks off at 6 PM ET (Mon-Fri) and processes 3 accounts
while the AE wraps up their workday. Each account goes through full research, prospect
identification, and Apollo sequence building. Every enrolled contact gets a bespoke,
person-researched Touch 1 sitting as a manual email task in Apollo. The AE reviews the
queue that evening or morning, edits anything he wants to change, and hits send. Touches
2-5 fire automatically after that.

When complete, the system will be fully documented so any AE on the team can run it
against their own Salesforce accounts.

**Does not brick your machine.** The entire pipeline is API calls (Salesforce, Apollo,
Slack, web search). The only local process is a lightweight Playwright script controlling
Chrome for the Apollo sequence builder. Machine stays usable the whole time.

---

## Key Parameters

| Setting | Value |
|---|---|
| Accounts in ranked queue | 250 |
| Accounts processed per run | 3 |
| Run time | 6 PM ET, Mon-Fri |
| Estimated duration per run | 60-90 minutes |
| Runway before refresh needed | ~80 weekdays |
| Touch 1 delivery method | Apollo Manual Email Task (Option A) |
| Fallback if Playwright fails | Gmail Drafts via Gmail MCP |
| State file | `active-accounts.json` (in this folder) |
| Rankings file | `ydc_account_rankings.csv` (in this folder) |

---

## Architecture Overview

```
6 PM ET trigger
     |
     v
Step 0: Refresh exclusion checks (Slack + SFDC + Apollo) → update active-accounts.json
     |
     v
Step 1: Select next 3 non-excluded accounts from ydc_account_rankings.csv
     |
     v
Step 2: For each account (sequential):
     |
     +-- Research (ydc-research) — cached if < 7 days old
     |
     +-- Account Plan + Prospect Discovery (parallel Sonnet subagents)
     |
     +-- Per-person research on each contact (new Sonnet subagent)
     |       LinkedIn posts, articles, trigger events → one hook per person
     |
     +-- Outreach generation (Opus main thread)
     |       Touch 1: bespoke per person using their specific hook
     |       Touches 2-5: standard templated follow-ups
     |       Touch 1 flagged as manual_task: true
     |
     +-- Apollo build (ydc-apollo-build)
             Touch 1: Manual Email task, pre-filled content, INACTIVE
             Touches 2-5: automated, self-schedule after Touch 1 sent
     |
     v
Step 3: Update active-accounts.json run log
```

---

## Part 1: One-Time Setup (Build Order)

Build in this order. Do not skip steps.

### Step 1A: Expand account ranking to top 250
Re-run `ydc-account-ranking` skill with output expanded from 50 to 250 accounts.
Overwrites `ydc_account_rankings.csv`. Scoring model unchanged: smaller companies
score higher, CTD warm intros score heavily, SFDC engagement and API usage factor in.
Takes ~40 minutes (SFDC + CTD calls).

### Step 1B: Build `active-accounts.json`
Create the state file in the YDCpipeline folder. Populate it with an initial exclusion
scan across all 250 ranked accounts.

**Exclusion logic (any single match = exclude):**
- **Slack:** Company name mentioned in #esl-api-sales, #api-gtm-team, or #sales-team
  in the last 14 days
- **SFDC:** Open opportunity exists, OR account type = Customer
- **Apollo:** Any contact at that domain enrolled in a sequence in the last 14 days

**Schema:**
```json
{
  "last_updated": "2026-04-27T18:00:00",
  "next_rank_to_process": 4,
  "run_log": [
    {
      "date": "2026-04-27",
      "accounts_processed": ["Company A", "Company B", "Company C"],
      "contacts_enrolled": 11,
      "errors": []
    }
  ],
  "accounts": {
    "somecompany.com": {
      "account_name": "Some Company",
      "rank": 7,
      "excluded": false,
      "exclusion_reasons": [],
      "pipeline_run_date": "2026-04-27",
      "contacts_enrolled": ["john@some.com", "jane@some.com"],
      "sequences_built": ["YDC | Some Company | Seq A"],
      "status": "pending_touch1_review",
      "last_checked": "2026-04-27"
    },
    "databricks.com": {
      "account_name": "Databricks",
      "rank": 1,
      "excluded": true,
      "exclusion_reasons": ["open_opp", "active_sequence"],
      "last_checked": "2026-04-27",
      "notes": "Open opp in SFDC. Active Apollo sequence enrolled 2026-04-15."
    }
  }
}
```

### Step 1C: Edit the outreach skill (ydc-outreach)
Add bespoke Touch 1 generation. Currently Touch 1 uses company-level hooks.
New behavior: Touch 1 for each contact uses their individual person-level hook
as the Attention line. Touches 2-5 unchanged. Touch 1 gets flagged
`manual_task: true` in the sequence JSON passed to the Apollo builder.

### Step 1D: Edit the Apollo builder (ydc-apollo-build)
Update the Playwright script to set sequence step 1 as a Manual Email task in
Apollo with the personalized body pre-filled. Steps 2-5 remain automated.
Sequences left INACTIVE until the AE reviews.

**Fallback:** If Playwright cannot reliably populate manual task content, fall back
to Gmail Drafts via Gmail MCP. The AE sends from Gmail, Apollo picks up from Touch 2.
Determine which approach works on first test run.

### Step 1E: Add per-person research micro-step
New step between prospect discovery and outreach generation. For each identified
contact, a Sonnet subagent runs a focused web + LinkedIn search on that individual:
recent posts, conference talks, published articles, company announcements they appear
in. Outputs one-line hook per person. Falls back to role-based pain point if nothing
findable. Feeds directly into that contact's Touch 1.

### Step 1F: Test end-to-end on one account
Run the full pipeline manually on a single account before enabling the scheduled run.
Confirm: Touch 1 appears in Apollo task queue, content is pre-filled correctly,
Touches 2-5 are scheduled, sequence is INACTIVE. Fix whatever breaks.

### Step 1G: Set up the 6 PM ET scheduled run
Use the `schedule` skill to create a recurring daily agent at 6 PM ET Mon-Fri.
The agent reads `ydc_account_rankings.csv` and `active-accounts.json`, then runs
the pipeline for the next 3 eligible accounts.

### Step 1H: Write team documentation
Once the test run passes, write a clean README covering:
- What the system does
- Setup requirements (ae-config.md fields, Salesforce credentials, Apollo access, CTD token)
- How the ranking works and when to refresh it
- What the daily run does step by step
- How to review and send in the morning
- How to handle common errors
Goal: another AE can clone the repo, fill out ae-config.md, and be running in under
an hour.

---

## Part 2: The Daily Run (6 PM ET)

### Step 0: Refresh exclusions (~5 min)
Pull fresh data from Slack, SFDC, and Apollo in parallel.
Update exclusion flags in `active-accounts.json` before selecting accounts.

### Step 1: Select 3 accounts (~1 min)
Walk down `ydc_account_rankings.csv` starting at `next_rank_to_process`.
Skip any account flagged `excluded: true`. Take first 3 clean accounts.
Increment `next_rank_to_process` in the state file.

### Step 2: Pipeline for each account (~20-25 min each, sequential)

**Research:**
Check Google Drive for existing artifacts (`_facts.md`, `_usecases.md`, `_hooks.md`).
If under 7 days old, use cache. Otherwise run full ydc-research.

**Account Plan + Prospects (parallel Sonnet subagents):**
- Account plan .docx built and uploaded to Google Drive
- Prospects skill finds 3-5 contacts, enriches emails, cross-references SFDC and CTD

**Per-person research (Sonnet subagent per contact):**
LinkedIn and web search on each individual contact.
Outputs: one-line specific hook (or role-based fallback).

**Outreach generation (Opus main thread):**
Writes sequences A-D. Touch 1 for each contact uses their person-level hook.
Touches 2-5 are templated. Touch 1 flagged as manual task.

**Apollo build:**
Creates sequences. Enrolls contacts. Sets Touch 1 as Manual Email task with
content pre-filled. Steps 2-5 automated. Sequences INACTIVE.
Updates `active-accounts.json` with status `pending_touch1_review`.

### Step 3: Log the run (~1 min)
Appends to `run_log` in `active-accounts.json`:
- Accounts processed
- Contacts enrolled
- Errors
- Accounts skipped and why

---

## Part 3: AE Review Workflow

Open Apollo > Tasks. You'll see a queue of Manual Email tasks — roughly 9-15 emails
across 3 accounts (3-5 contacts each).

Each task shows:
- Contact name, title, company
- Pre-written Touch 1 (person-specific hook in opener, AIDA, 80-120 words, plain text)
- Which sequence it belongs to

**To send:** Read, edit if needed, click send. Sequence auto-schedules Touch 2 onward.
**To skip a contact:** Delete the task. The sequence won't fire for that person.
**To pause an account:** Mark the sequence INACTIVE in Apollo. It won't proceed.

---

## Part 4: Ongoing Maintenance

**Weekly:** Re-run `ydc-account-ranking` to refresh scores. New Slack signals, SFDC
changes, and usage data update the order. Processed accounts stay in `active-accounts.json`
and won't re-queue.

**When the queue runs out at rank 250:** Run log flags it. Refresh the ranking, prune
disqualified accounts, and the queue resets.

**If a run fails mid-account:** State file tracks the pointer. Next run picks up from
the right place. Errors are logged. Apollo build is last so no orphaned sequences.

**For team members:** Fork repo → fill out ae-config.md with your SFDC user ID, Apollo
credentials, CTD token, Drive folder → run the ranking skill → enable the scheduled run.
Your accounts, your rankings, same system.

---

## Skills Involved

| Skill | Role |
|---|---|
| `ydc-account-ranking` | Generates and refreshes the 250-account ranked queue |
| `ydc-pipeline` | Orchestrator — runs steps 1-6 per account |
| `ydc-research` | Step 1: deep company research |
| `ydc-account-plan` | Step 2: .docx account plan → Google Drive |
| `ydc-prospects` | Step 3: Apollo contact discovery and enrichment |
| `ydc-outreach` | Step 4: sequence generation with bespoke Touch 1 |
| `ydc-apollo-build` | Steps 5+6: Drive upload + Apollo build + enrollment |

**New components being added:**
- Per-person research micro-step (new Sonnet subagent, added to ydc-outreach or ydc-pipeline)
- Manual task Apollo builder (Playwright update to ydc-apollo-build)
- `active-accounts.json` state tracker (new file, managed by pipeline orchestrator)
- Scheduled run agent (via schedule skill)

---

## Files Referenced

| File | Location | Purpose |
|---|---|---|
| `ydc_account_rankings.csv` | YDCpipeline/ | Master ranked queue of 250 accounts |
| `active-accounts.json` | YDCpipeline/ | State tracker: exclusions, run log, progress pointer |
| `ae-config.md` | YDCpipeline/ | AE identity, credentials, file paths |
| `NIGHTLY_PIPELINE_PLAN.md` | YDCpipeline/ | This document |
| `CLAUDE.md` | YDCpipeline/ | Always-on sales knowledge base |

---

## Known Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Playwright can't pre-fill manual email task content in Apollo | Medium — never confirmed | Fallback: Gmail Drafts via Gmail MCP |
| Apollo rate limits during Playwright sequence build | Low | Sequential account processing (not parallel) |
| CTD API timeout during exclusion scan | Low | Wrap in try/catch, log and skip — don't block run |
| SFDC query returns partial results | Low | Parse with Python, validate record count before scoring |
| Ranked list runs out before weekly refresh | Possible if volume ramps | Log alert at rank 225 with 25 accounts remaining |

---

## Current Build Status

- [x] 1A: Account ranking expanded to 250 — DONE 2026-04-27 (252 accounts, CTD included. Bug fixed: CTD API requires browser User-Agent header — Cloudflare blocks raw Python requests with error 1010. Fixed in skill.)
- [x] 1B: `active-accounts.json` built and populated — DONE 2026-04-28 (252 accounts, 14 excluded, 238 queued, next rank to process: #5 Inception)
- [x] 1C: Outreach skill updated for bespoke Touch 1 — DONE 2026-04-28 (per-person research step added, Touch 1 changed to manual_email, AIDA rules + case study fallback documented, per-contact JSON fields added, self-review checklist updated)
- [x] 1D: Apollo builder updated for manual task Touch 1 — DONE 2026-04-28 (new prefill-touch1.js Playwright script + ydc-apollo-build skill updated with Step 6.4 pre-fill + Step 6.5 completion report)
- [x] 1E: Per-person research micro-step added — DONE 2026-04-28 (runs inside ydc-outreach as Step 3.5; pipeline flow chart + model routing updated; one Sonnet subagent per contact, falls back to role_pain if nothing findable)
- [ ] 1F: End-to-end test on one account
- [ ] 1G: Scheduled run configured (6 PM ET Mon-Fri)
- [ ] 1H: Team documentation written
