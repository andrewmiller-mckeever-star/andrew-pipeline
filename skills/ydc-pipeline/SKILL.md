---
name: ydc-pipeline
description: End-to-end You.com whale account sales pipeline orchestrator. Runs all 6 steps in sequence: company research (check Drive + Slack first), account plan generation (.docx), prospect discovery via Apollo, personalized outreach sequence generation (4 sequences in-memory), Google Drive upload, and Apollo sequence build + contact enrollment (sequences left INACTIVE). Manual one-off use only — never runs automatically. Use when Andrew explicitly says "run the whale pipeline for [company]", "full pipeline for [company]", or provides a specific account to process manually. For the nightly automated territory run, use ydc-territory-pipeline instead.
---

> **Manual use only.** Run this skill when Andrew explicitly requests a one-off pipeline run for a specific account. Never triggered automatically. For the nightly territory run, use `ydc-territory-pipeline` instead.
> Before running, cross-check the account name against `territory-progress.json` — if it appears there with any status, confirm with Andrew before proceeding.

# YDC Whale Pipeline Orchestrator

## Pipeline Flow

```
INPUT: Account Name + Website URL (single or batch from CSV)
  |
  v
STEP 1: Deep Company Research -> use ydc-research skill
  Outputs: {company}_facts.md, {company}_usecases.md, {company}_hooks.md
  Step 1 runs CTD warm intro check (Step 2c) as a Sonnet subagent.
  CTD subagent outputs Bucket A/B referral copy in a labeled block for Step 7 collection.
  |
  v (both launch immediately after Step 1 artifacts are written — run in parallel)
  |
  +---> STEP 2: Account Plan Generation (.docx) -> use ydc-account-plan skill (Sonnet subagent)
  |     Reads: _facts.md + _usecases.md + _hooks.md -> writes plan_data.json -> runs generate-account-plan.js
  |
  +---> STEP 3: Prospect Discovery (Apollo primary, Apify fallback) -> use ydc-prospects skill (Sonnet subagent)
        Reads: _facts.md Leadership Directory for LinkedIn URL enrichment prep
  |
  v (wait for both Step 2 and Step 3 to complete)
  |
  v
STEP 3.5: Per-Person Research (Sonnet subagent per contact, runs inside ydc-outreach)
  For each contact identified in Step 3:
    - Web + LinkedIn search: "{first} {last}" "{company}" posts, articles, talks, announcements
    - Outputs one-line hook + hook_type (trigger_event | their_content | company_initiative | role_pain)
    - Falls back to role_pain if nothing specific is findable
    - LinkedIn connect note (T2) and DM message (T7) are written directly into the Apollo sequence by build-sequences.js — no separate Drive queue file is generated
  This step runs WITHIN the ydc-outreach skill before any copy is written.
  If 3+ contacts fall back to role_pain, outreach skill flags it for Andrew's review.
  |
  v
STEP 4: Outreach Sequence Generation (in-memory, Opus main thread) -> use ydc-outreach skill
  Touch 1 for each contact uses their individual Step 3.5 hook as the Attention line.
  Touch 1 is automatic_email type. All 7 touches are in the Apollo sequence including LinkedIn connect (T2) and LinkedIn DM (T7).
  |
  v
STEP 5 + 6: Drive Upload + Apollo Build & Enrollment -> use ydc-apollo-build skill
  Sequences built via build-sequences.js (Playwright). Auth: launchPersistentContext + ~/.apollo-playwright-profile. LinkedIn connect (T2) and DM (T7) are Apollo sequence steps — no Drive queue file is written.
  |
  v
[repeat Steps 1-6 for each account in batch]
  |
  v
STEP 7: Referral Daily Doc (runs ONCE after all accounts complete)
  Collect ALL delimited blocks from tonight's CTD outputs:
    - All === CTD REFERRAL PATHS FOR NIGHTLY DOC === blocks (Bucket A/B connector paths)
    - All === INVESTOR OVERLAP PATHS FOR NIGHTLY DOC === blocks (shared investor firm paths)
  Follow ydc-ctd-warmintro SKILL.md Steps 7a-7c:
    7a. Compile all paths into a single day's entry (CTD section + Investor Overlap section)
    7b. Prepend the day's entry to the top of the persistent Google Doc via Docs API
        Doc ID is in ae-config.md as CTD_GDOC_ID. On first run: create doc, save ID.
    7c. Post high-level summary + doc link to #ctd-outbound-referrals-for-the-day via slack_send_message
  If no paths of either type were found: post "No referral paths found tonight" with accounts checked.
  |
  v
OUTPUT: Account plans on Drive, 4 INACTIVE Apollo sequences with enrolled contacts
        (LinkedIn connect T2 and DM T7 already in the sequence — no queue file),
        CTD Referral Asks Google Doc linked in #ctd-outbound-referrals-for-the-day
```

## Model Routing

- Opus (main thread): Steps 1, 4 — research synthesis, outreach copy
- Sonnet subagents: Step 1.2 (SFDC queries), Step 1.2b (Slack search), Step 1.2c (CTD warm intros), Step 1.2d (Sumble), Step 2 (account plan — template-filling from artifact files, not creative synthesis), Step 3 (prospect discovery), Step 3.5 (per-person research — one Sonnet subagent per contact, invoked inside ydc-outreach), Steps 5+6 (Drive upload, Apollo build, contact enrollment)
- Haiku subagents: Session startup checks (Drive file existence, simple lookups)

**Steps 2 and 3 run as concurrent Sonnet subagents** immediately after Step 1 artifact files are written. Do not wait for Step 2 before starting Step 3.

Never route Step 4 (outreach copy) to a subagent. Always stays on Opus main thread.

## Session Startup (Required Before Any Pipeline Run)

Before generating deliverables:
1. Read memory files at ~/.claude/projects/-Users-andrew-Downloads-Claud-Code-folder--YDCpipeline/memory/ (MEMORY.md, feedback.md, outreach-rules.md, product-knowledge.md, salesforce.md)
2. Check Google Drive AND local YDCpipeline folder for existing artifact files (`{company}_facts.md`, `{company}_usecases.md`, `{company}_hooks.md`) — if they exist, Step 1 has already run; do not re-run unless explicitly asked (Haiku subagent)
3. If no existing artifacts: run Step 1 (ydc-research skill) to generate them
4. After artifacts exist: launch Steps 2 and 3 as concurrent Sonnet subagents (see Pipeline Flow above)
5. Read sales deck at path specified by SALES_DECK_PATH in ae-config.md for pitch framing (Opus main thread, before Step 4)

## Batch Processing

For multiple accounts (list or CSV):
1. Run Steps 1-6 sequentially per account (CTD Bucket A/B copy is drafted per account in Step 1's CTD subagent)
2. After each account plan: run Step 5 (Drive upload)
3. Run Step 6 (Apollo build + enrollment)
4. After ALL accounts complete: run Step 7 — compile all CTD Bucket A/B paths AND investor overlap paths into the daily Google Doc and post summary to #ctd-outbound-referrals-for-the-day
5. After all accounts: generate summary spreadsheet (one row per account: name, prospect count, top 3 use cases, recommended first contact, deal attractiveness H/M/L, Apollo status, contacts enrolled)
6. Verify Drive folder structure with rclone tree

## Output Naming

- Account plan: {Company}_Account_Plan.docx
- Apollo sequences: YDC | {Company} | Seq A/B/C/D: {Persona Label}
- Drive folder: Account Plans, Lists & Personalized Sequences/{Company}/

## Global Rules (Apply to All Pipeline Output)

See references/global-rules.md for the full list. Critical non-negotiables:
- NEVER use em dashes in any output
- NEVER name active evaluations or confidential customers in prospect-facing output
- NEVER name competitors (Exa, Tavily, Perplexity, Vertex AI, Bing) in outreach
- Search API always leads; Vertical Index and PRAG are supporting angles
- NEVER reference ESL, Chat, or Apex products in prospect-facing output
- All documents use Arial font

## Quality Checklist

See references/quality-checklist.md before delivering any account's outputs.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| 2026-06-03 | Removed deprecation — restored as manual one-off skill | Deprecation was too aggressive; skill is valid for explicit one-off runs outside the territory pipeline |
| (prior) | Added Step 7: Referral Daily Doc compile | CTD Bucket A/B paths were being generated per-account but not persisted anywhere; nightly doc collects all paths |
| (prior) | Added Step 2c: CTD warm intro as Sonnet subagent | Warm intro discovery previously required a manual separate run; now part of the standard pipeline flow |
| (prior) | Replaced Perplexity CDP research with ARI PDF, then ARI PDF with Research API (2026-04-08) | Research API automates what previously required manual PDF generation |
| (prior) | Added Steps 2 and 3 concurrent Sonnet subagents | Sequential execution was slow; account plan and prospect discovery are independent and can run in parallel |
