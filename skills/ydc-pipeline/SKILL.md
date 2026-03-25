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
  |
  v
STEP 2: Account Plan Generation (.docx) -> use ydc-account-plan skill
  |
  v
STEP 3: Prospect Discovery (Apollo primary, Apify fallback) -> use ydc-prospects skill
  |
  v
STEP 3.5: Warm Intro Discovery (CTD API) -> use ydc-ctd-warmintro skill
  |
  v
STEP 4: Outreach Sequence Generation (in-memory) -> use ydc-outreach skill
  |
  v
STEP 5 + 6: Drive Upload + Apollo Build & Enrollment -> use ydc-apollo-build skill
  |
  v
OUTPUT: Account plan on Drive, warm intro briefs, 4 INACTIVE Apollo sequences with enrolled contacts, warm reply summary in chat
```

## Model Routing

- Opus (main thread): Steps 1, 2, 4 - research synthesis, account plan writing, outreach copy
- Sonnet subagents: Steps 1.2 (SFDC queries), 1.2b (Slack search), 3, 3.5, 5, 6 - Salesforce queries, Slack search, Apollo API calls, CTD API calls + intro drafts, Drive upload, contact enrollment
- Haiku subagents: Session startup checks (Drive file existence, simple lookups)

Never route Step 4 (outreach copy) to a subagent. Always stays on Opus main thread.

## Step 3.5: Warm Intro Discovery (CTD API)

After Step 3 produces the prospect list, run Step 3.5 as a Sonnet subagent:
- Queries Connect The Dots API for warm intro paths into the target account
- Cross-references CTD results with the ICP prospect list from Step 3
- Only surfaces "Strong Chance to Connect" contacts (others are filtered out)
- Outputs top 3 warm intro options with draft intro request emails
- If no strong warm paths found, skips cleanly and pipeline proceeds cold
- Warm intro brief is passed to Step 4 (outreach) for hook context and to Step 6B (Apollo labels)

## Session Startup (Required Before Any Pipeline Run)

Before generating deliverables:
1. Read memory files at ~/.claude/projects/-Users-ryan-Desktop-YDC-Pipeline/memory/ (MEMORY.md, feedback.md, outreach-rules.md, product-knowledge.md, salesforce.md)
2. Check Google Drive for existing deliverables for the target account (Haiku subagent)
3. Query Salesforce for account intelligence via ydc-salesforce skill (Sonnet subagent, primary CRM source)
4. Search Slack for supplemental context (#api-gtm-team, #sales-team, #esl-api-sales, #competition, #enterprise-solutions)
5. Read sales deck at ~/Downloads/You.com - AI Search Infra Pitch Deck - January 2026.pdf for pitch framing

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
