# You.com Sales Knowledge Base

Always-on router for You.com API Sales. This loads every conversation regardless of task, so it
is kept deliberately small — routing, config pointers, and cross-cutting rules only.

**Before writing anything — email, Slack message, doc, LinkedIn note, or any other written or
customer-facing deliverable — invoke the `ydc-sales-voice` skill first.** It holds You.com's
product/brand knowledge, competitive positioning, named case studies, and all of Andrew's voice
and formatting rules (moved out of this file on 2026-09-12 so non-writing sessions — pipeline
engineering, cost analysis, ops — don't pay to load ~85% of this file's former content on every
turn). Nothing was deleted; it all still applies exactly as before, it just loads on demand now
instead of unconditionally.

**AE Setup:** Read `ae-config.md` at the start of every pipeline session to load your name, email, and file paths. All identity and path values live there — nothing is hardcoded in the pipeline.

**My account list:** When Andrew asks to compare something to "my accounts," "my list," or "my book," use the snapshot at `SFDC_ACCOUNTS_LIST_PATH` (see ae-config.md) as the default reference. It is a point-in-time export; for always-fresh data the pipeline skills query Salesforce live instead.

## Rule Precedence (added 2026-08-27; updated 2026-09-12)

**`ydc-sales-voice` wins on voice, copy, and cadence. The pipeline skills win on API mechanics,
step types, personas, and process gates.** On conflict, follow the newer date and say which rule
you followed and which you set aside. (Before 2026-09-12 this said "this file" — the voice/copy
content itself moved to `ydc-sales-voice`; the precedence rule is unchanged, just repointed.)

Skills carry older copies of some writing rules. When they disagree with `ydc-sales-voice`,
`ydc-sales-voice` is newer and authoritative.

**Settled 2026-10-08 — LinkedIn automation policy.** This supersedes the 2026-08-27
connect-note close rule and every earlier connect-note rule.
- LinkedIn connection requests (Touch 2, `linkedin_step_connect`) NEVER carry a note. No skill
  generates, drafts, reviews, QAs or stores connect-note copy. Apollo connect steps are created
  with an empty body. `connect-overrides.json` is retired.
- `apollo-linkedin-connect.js` automates only no-note connection requests and profile-view /
  post-engagement steps (Touch 5). It never sends a LinkedIn message or InMail. It ignores
  connect-step template text.
- LinkedIn message steps (Touch 7, `linkedin_step_message`) stay in sequences as MANUAL tasks.
  Skills still draft the DM copy into the step so it is ready in Andrew's Apollo task queue.
  Andrew reviews and sends every LinkedIn message by hand. `dm-overrides.json` is retired.
- Why: on 2026-09-25 and 09-28 the script sent 18 Cohort 1A/1B connection requests with raw
  `{{calls_30d}}` placeholders in the note. Apollo never renders variables in LinkedIn steps.

## Skill Architecture

| Layer | What | When it loads |
|-------|------|--------------|
| CLAUDE.md | Router: config pointers, resources, Slack channels, rule precedence | Every conversation |
| ydc-sales-voice | Sales knowledge base (YDC, products, writing rules, competitive intel) | Before writing anything, or when asked about product/positioning |
| 6 YDC pipeline skills | Pipeline procedures (research, account plan, outreach, prospects, Apollo build) | When triggered by pipeline commands |
| Office skills | Doc/deck/spreadsheet/PDF creation | When you mention a file type |
| Memory files | Accumulated learnings, feedback, product knowledge | Referenced by skills as needed |

**Pipeline skills:** ydc-pipeline (orchestrator), ydc-research (Step 1), ydc-account-plan (Step 2), ydc-prospects (Step 3), ydc-outreach (Step 4), ydc-apollo-build (Steps 5+6).

---

## Cloud Execution (Claude Code Routines)

When this repo runs in a Claude Code cloud session or Routine (no laptop):

- **Cloud skills live in `.claude/skills/`** — cloud-adapted copies of the laptop skills in `skills/`. In a cloud session, use the `.claude/skills/` version. The `skills/` directory is the laptop originals; do not execute their local-path or browser steps in the cloud.
- **Auth is account-level claude.ai connectors only:** Google Calendar, Google Drive, Slack, Salesforce (hosted, READ-ONLY: `soqlQuery`, `getObjectSchema`, `getRelatedRecords`), Apollo.io, Granola, Gmail, You.com Search. No local MCP servers, no `sf` CLI, no rclone, no browser automation.
- **Secrets come from cloud-environment env vars,** never from files in this repo: `YDC_API_KEY`, `APOLLO_API_KEY`, `COMPANY_SEARCH_API_KEY`, `CTD_API_KEY`, `CTD_CLIENT_ID`. If a key is unset, degrade per the skill's fallback (usually the You.com Search connector or WebSearch) — do not abort, do not ask for the key in output.
- **Write boundary (cloud default):** creating Google Docs/files in the designated Drive folders and posting to the specific Slack channel each skill names. NEVER write to Salesforce from the cloud (the connector is read-only by design; surface would-be writes for human review). Never email anyone. Never message any Slack channel or person a skill doesn't explicitly name. Apollo writes only where a skill's human-approval gate ("go" reply) has fired.
- **Routine definitions** are in `routines-cloud/` (one file per Routine: schedule, connectors, exact prompt). The laptop originals are archived in `routines/`. Migration runbook: `MIGRATION.md`.

---

## Sales Knowledge, Voice, and Positioning

Moved to the `ydc-sales-voice` skill on 2026-09-12 (product lineup, pitch framework, named case studies, competitive positioning, social proof, Universal Writing Style, Andrew's voice rules, cold-outbound rules, AIDA email structure, LinkedIn rules incl. the no-note connect policy). Nothing was cut — invoke that skill before writing anything or discussing product/positioning; see Rule Precedence above for how it interacts with the pipeline skills.

---

## Key Resources

| Resource | Location |
|----------|----------|
| AE Config | ae-config.md (in this repo root — your name, email, tokens, paths) |
| My Account List | See `SFDC_ACCOUNTS_LIST_PATH` in ae-config.md (canonical snapshot of Andrew's owned SFDC accounts) |
| Sales Deck | See `SALES_DECK_PATH` in ae-config.md |
| Product Knowledge | {MEMORY_PATH}/product-knowledge.md |
| Memory Files | {MEMORY_PATH}/ (auto-resolved by Claude Code based on project location) |
| Pipeline Skills | ~/.claude/skills/ydc-pipeline/, ydc-research/, ydc-account-plan/, ydc-outreach/, ydc-prospects/, ydc-apollo-build/ |
| Office Skills | ~/.claude/skills/claude-office-skills/ |
| Apollo Sequence Builder | See `APOLLO_BUILDER_PATH` in ae-config.md |
| Google Drive Folder | See `GDRIVE_FOLDER` in ae-config.md (via rclone, remote per `RCLONE_REMOTE`) |

---

## Slack Channels

| Channel | Purpose |
|---------|---------|
| #api-gtm-team | API go-to-market strategy, competitive positioning, customer evaluations |
| #sales-team | General sales discussion, territory planning, deal strategy |
| #esl-api-sales | Enterprise API sales conversations, deal notes, customer use cases |
| #competition | Competitive intelligence, competitor analysis, market landscape |
| #enterprise-solutions | Enterprise RAG, security, compliance discussions |
| #marketing | Product messaging, launches, developer relations |
| #product | Product updates, feature requests, customer feedback |
| #releases | New product launches, feature announcements |

---

## CS Team Site Guardrail

product-knowledge.md contains distilled, outreach-safe product knowledge from the CS Team Site. NEVER reference the CS Team Site directly, link to it, or reproduce internal processes, team names, pricing, customer names (beyond public case studies), or delivery methodology in prospect-facing output. Use product-knowledge.md as context to write more credible copy, not as content to copy.
