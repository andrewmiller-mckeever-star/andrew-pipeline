---
name: ydc-pipeline
description: End-to-end You.com whale account sales pipeline orchestrator. Runs all 6 steps in sequence: company research (check Drive + Slack first), account plan generation (.docx), prospect discovery via Apollo, personalized outreach sequence generation (4 sequences in-memory), Google Drive upload, and Apollo sequence build + contact enrollment (sequences left INACTIVE). Use when user says "run the whale pipeline for [company]", "full pipeline for [company]", "run pipeline", or provides a list/CSV of accounts to process. Also handles batch processing across multiple accounts.
---

# YDC Whale Pipeline Orchestrator

## Pipeline Flow

```
INPUT: Account Name + Website URL (single or batch from CSV)
  |
  v
STEP 1: Deep Company Research -> use ydc-research skill
  Outputs: {company}_facts.md, {company}_usecases.md, {company}_hooks.md
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
STEP 4: Outreach Sequence Generation (in-memory, Opus main thread) -> use ydc-outreach skill
  |
  v
STEP 5 + 6: Drive Upload + Apollo Build & Enrollment -> use ydc-apollo-build skill
  |
  v
OUTPUT: Account plan on Drive, 4 INACTIVE Apollo sequences with enrolled contacts, warm reply summary in chat
```

## Model Routing

- Opus (main thread): Steps 1, 4 — research synthesis, outreach copy
- Sonnet subagents: Step 1.2 (SFDC queries), Step 1.2b (Slack search), Step 1.2c (CTD warm intros), Step 1.2d (Sumble), Step 2 (account plan — template-filling from artifact files, not creative synthesis), Step 3 (prospect discovery), Steps 5+6 (Drive upload, Apollo build, contact enrollment)
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
1. Run Steps 1-4 sequentially per account
2. After each account plan: run Step 5 (Drive upload)
3. Run Step 6 (Apollo build + enrollment)
4. After all accounts: generate summary spreadsheet (one row per account: name, prospect count, top 3 use cases, recommended first contact, deal attractiveness H/M/L, Apollo status, contacts enrolled)
5. Verify Drive folder structure with rclone tree

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
