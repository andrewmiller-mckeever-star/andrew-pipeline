---
name: ydc-territory-pipeline
description: >-
  Territory-scale outbound pipeline for You.com Q2 2026. Processes Tier 2.A accounts
  from the territory workbook using pre-mapped use cases. 2 sequences per account
  (Technical Evaluator + Business Sponsor), 5 contacts each. Tracks progress in
  territory-progress.json for cross-session resumability. Use when user says
  "run territory pipeline", "territory pipeline for [company]", "territory pipeline status",
  "next batch", or "process tier 2 accounts".
---

# YDC Territory Pipeline

## Overview

Optimized outbound pipeline for 150 Tier 2.A accounts. Uses pre-mapped use cases from the territory workbook instead of full deep research. 2 sequences instead of 4. ~15 min per account.

## Invocation

- `run territory pipeline` -> processes next 8-10 unprocessed accounts
- `run territory pipeline for [Company], [Company]` -> specific accounts
- `territory pipeline status` -> progress report (X/150 done, next batch)
- `skip [Company]` -> marks as skipped in progress file

## State File

`~/Desktop/YDC Pipeline/territory-progress.json`

Read this file at session start to determine what's been processed. Update after each account completes. See references/progress-schema.md for format.

## Workbook Reference

`~/Downloads/Copy of Territory_Workbook_Q2_2026.xlsx`
- Sheet: "Andrew Miller-Mckeever"
- Header row: row 2 (0-indexed)
- Columns: #, SF ID, Company, Score, Tier, Vertical, State, Country, Website, Employees, Annual Revenue, UC1 Category, UC1 Product, UC1 Case Name, UC1 Description, UC1 Personas, UC2 Category, UC2 Product, UC2 Case Name, UC2 Description, UC2 Personas, UC3 Category, UC3 Product, UC3 Case Name, UC3 Description, UC3 Personas
- Filter: Tier = "2.A"

## 2-Sequence Model

| Sequence | Name Pattern | Persona Pool | Outreach Angle |
|----------|-------------|-------------|----------------|
| Seq 1: Technical Evaluator | YDC \| {Company} \| Seq 1: Technical Evaluator | VP/Dir Engineering, VP/Dir AI/ML, Head of Data Science, Staff+ ML Engineers, Platform Leads | Technical: how their product benefits from search API infra. Benchmarks, latency, accuracy. |
| Seq 2: Business Sponsor | YDC \| {Company} \| Seq 2: Business Sponsor | CTO, CPTO, CDO, CAO, VP Product, Head of AI Strategy | Business: reduce build cost, improve AI quality, time-to-market. Socher credibility. |

5 contacts per sequence = 10 contacts per account.

## Model Routing

| Phase | Model | Why |
|-------|-------|-----|
| Phase 0: CTD scan | **Sonnet subagent** | API query + filter |
| Phase 1: SFDC/Slack/Drive checks | **Sonnet subagent** | SOQL queries, Slack search, file checks |
| Phase 1: Web validation + UC selection | **Opus main thread** | Judgment on best use case |
| Phase 2: Account brief | **Opus main thread** | Synthesis and strategic framing |
| Phase 3: Prospect discovery | **Sonnet subagent** | Apollo API calls |
| Phase 4: Outreach generation | **Opus main thread** | Creative writing with guardrails |
| Phase 5: JSON write + enrollment | **Sonnet subagent** | Mechanical JSON + API |
| Phase 6: LinkedIn warming (optional) | **Sonnet subagent** | chrome-cdp automation |
| Progress tracking | **Haiku** | JSON read/write |

Never route Phase 4 (outreach copy) to a subagent.

---

## Pipeline Flow (Per Account)

### PHASE 0: WARM INTRO SCAN (~1 min)

**Model: Sonnet subagent**

Use ydc-ctd-warmintro skill logic but lightweight:
1. Query CTD company reachability: `GET https://api.ctd.ai/user/atc-paths-api/public/v1/company?company_domain={domain}`
2. If score is NOT "strong": note "No strong CTD paths" and move on
3. If score IS "strong": query people endpoint filtered to "Strong Chance to Connect" only
4. Surface any hits in the account brief (Phase 2). Do NOT run full CTD analysis.

### PHASE 1: QUALIFY & RESEARCH (~3 min)

**Model: Sonnet subagent for SFDC/Slack/Drive. Opus main thread for UC selection.**

#### 1a. SFDC Check (Sonnet subagent, parallel queries)

Use ydc-salesforce skill. Run Q1-Q7 in parallel:
- Q1: Account existence + Databricks partnership
- Q2: Full opportunity history
- Q3: Existing contacts
- Q4: Prospect replies ([Gong In] prefix)
- Q5: Activity timeline (last 90 days)
- Q6: Outbound sequence history ([Apollo >>] prefix)
- Q7: Ryan's open pipeline

**Decision gates:**
- **SKIP** if active opp (Stage 1-5, not Closed)
- **FLAG reactivation targets** if contacts have [Gong In] replies or meetings in last 90 days but no active opp
- **FLAG already-sequenced contacts** to avoid re-enrollment
- **FLAG existing contacts** for dedup in Phase 3

#### 1b. Slack Check (Sonnet subagent)

Search channels: #api-gtm-team, #sales-team, #esl-api-sales, #competition
Query: company name. Surface any relevant context.

#### 1c. Drive Check (Haiku)

Check if existing deliverables exist for this account in "Account Plans, Lists & Personalized Sequences/" via rclone.

#### 1d. Sumble Intelligence + Web Validation + UC Selection (Opus main thread)

Receives SFDC/Slack/Drive results from subagents. Then:

**1. Sumble signals (run before UC selection — 2 calls):**

- `EnrichOrganization` on the target domain. Flag:
  - Competitor tech (Exa, Tavily): displacement angle
  - Legacy scraping (BeautifulSoup, Scrapy, Selenium): migration angle
  - RAG/LLM stack (LangChain, LlamaIndex, Pinecone): grounding angle
  - Databricks/Snowflake: co-sell angle
- `FindJobs` capped at 5 results. Filter to: search, AI, ML, RAG, LLM, data infrastructure, NLP. Job postings = real-time validation that the UC initiative is active.

If Sumble returns no results: continue, skip signals block in brief.
Credit cost: ~45 credits per account (EnrichOrganization ~20 + FindJobs 5 results × ~5).

**2. Web validation:**
Quick web search to confirm: Is the product/initiative in UC1-3 still current? Any trigger events in last 30 days?

**3. UC selection (informed by Sumble + web):**
Pick the best use case based on:
   - Recency of the initiative (validated by web + job posting dates)
   - Alignment with Search API / Contents API / Research API (our products)
   - Specificity (named product > vague initiative)
   - Trigger event availability for hook
   - Sumble signal alignment: prefer UC that matches detected tech stack (e.g. if LangChain detected, lean into RAG grounding UC)
4. Note the selected UC and rationale

### PHASE 2: ACCOUNT BRIEF (.md file, ~2 min)

**Model: Opus main thread**

Write to: `~/Desktop/YDC Pipeline/{company}_brief.md`

Structure:
```
# {Company} | Territory Pipeline Brief

## Company Snapshot
- Vertical: {vertical} | Employees: {employees} | Revenue: {revenue}
- Website: {website}
- SF ID: {sf_id} | Score: {score}

## Selected Use Case
**{UC category}: {UC product}**
{UC case name}

Why this angle: {rationale for selecting this UC over the other 2}

## Tech Stack & Hiring Signals (Sumble)
- Competitor tech: {Exa / Tavily / none detected}
- Legacy scraping: {BeautifulSoup / Scrapy / Selenium / none}
- RAG/LLM stack: {LangChain / LlamaIndex / Pinecone / none}
- Co-sell signal: {Databricks / Snowflake / none}
- Top hiring signal: {most relevant job title + 1-sentence description, or "none"}
- Hook implication: {1 sentence: how signals shape Touch 1 angle}

## Supplemental Research
- Trigger events: {any recent news, launches, hires found in web validation}
- Competitive signals: {any known competitor usage or migration signals}

## CRM Intelligence
- SFDC status: {account type, opp history summary}
- Prior engagement: {contacts, replies, activity}
- Reactivation targets: {contacts with prior engagement who went cold}
- Already sequenced: {contacts to exclude}

## CTD Warm Intro Paths
{CTD results from Phase 0, or "No strong paths found"}

## Hook Strategy
- Primary hook: {trigger event / their content / company initiative}
- Proof point: {which case study or stat to use}
- Socher placement: {which touch and framing}
```

### PHASE 3: PROSPECT DISCOVERY (~3 min)

**Model: Sonnet subagent**

1. Extract persona suggestions from the selected UC description (Personas field)
2. Use `apollo_mixed_people_api_search` with:
   - `q_organization_domains_list`: ["{domain}"]
   - `person_seniorities`: ["director", "vp", "c_suite"]
   - `per_page`: 100
3. Use `apollo_people_bulk_match` in batches of 10 for enrichment
4. Dedup against SFDC contacts (from Phase 1)
5. Split into 2 sequences:
   - Seq 1 (Technical): VP/Dir Eng, AI/ML, Data Science, Platform, ML Engineer leads
   - Seq 2 (Business): CTO, CPTO, CDO, CAO, VP Product, AI Strategy, Head of AI
6. 5 contacts per sequence. Priority: title relevance > verified email > seniority
7. Include reactivation targets in appropriate sequence (flagged for warm tone)
8. Drop contacts without verified emails first when over cap

### PHASE 4: OUTREACH GENERATION (~5 min)

**Model: Opus main thread. NEVER delegate to subagent.**

Uses account brief from Phase 2 as context. Uses prospect list from Phase 3.

Generate 2 sequences, each with 5 touches:

| Touch | Day | Type | JSON step_type | Notes |
|-------|-----|------|----------------|-------|
| 1 | Day 1 | Email | `automatic_email`, `email_type: "new_thread"` | Unique subject, AIDA structure |
| 2 | Day 2 | LinkedIn | `linkedin_connect` | Fact-to-Consequence + Curiosity Hook, under 250 chars |
| 3 | Day 5 | Email reply | `automatic_email`, `email_type: "reply"` | New context, not rephrase |
| 4 | Day 8 | Call | `phone_call` | Call script in `task_note` |
| 5 | Day 14 | Email reply | `automatic_email`, `email_type: "reply"` | Breakup, new angle |

#### Writing Rules (ALL apply)

Full rules in ydc-outreach/references/writing-rules.md. Key updates for territory pipeline:

- **Opener: 80-120 words** (tightened from 100-150)
- **Follow-ups: 80-120 words**
- **Subject lines: under 6 words**
- **Each follow-up adds NEW context** (new proof point or new angle, never rephrase)
- No em dashes. Plain text only. 5th-7th grade reading level.
- AIDA structure on every email touch
- Interest-based CTAs only (no time-based asks)
- Tentative language in Interest section
- Every email opens with "Hi {{first_name}}," on its own line
- At least one touch references Socher. At least one touch uses a public proof point.
- Never name competitors. Never reference specific evals.
- Strip corporate suffixes.
- LinkedIn notes: zero pitch, zero CTA, zero flattery. Fact-to-Consequence + Curiosity Hook.

#### Reactivation Targets

If a contact is flagged as a reactivation target from Phase 1:
- Touch 1 references prior conversation/eval instead of cold opener
- Warmer tone throughout: "following up on earlier conversations" etc.
- Same 5-touch structure, different framing

#### Self-Review Gate

After generating both sequences but BEFORE writing JSON, check every touch against:
- [ ] No em dashes anywhere
- [ ] No AI-isms (utilize, comprehensive, enhance, delve, embark, robust, streamline)
- [ ] No competitor names
- [ ] No specific eval references
- [ ] No time-based CTAs
- [ ] Every email starts with "Hi {{first_name}},"
- [ ] Subject lines under 6 words
- [ ] Opener under 120 words, follow-ups under 120 words
- [ ] Each follow-up has a NEW proof point or angle (not rephrase)
- [ ] At least one Socher reference per sequence
- [ ] At least one public proof point per sequence
- [ ] Plain text only (no markdown formatting)
- [ ] LinkedIn notes under 250 chars, zero pitch

Fix any violations before proceeding to JSON.

### PHASE 5: BUILD & ENROLL (~2 min)

**Model: Sonnet subagent**

1. Write Apollo sequence JSON to: `~/Desktop/YDC Pipeline/apollo-sequence-builder/{company}_sequences.json`

JSON format (from ydc-outreach/references/json-format.md):
```json
{
  "account": "Company Name",
  "domain": "company.com",
  "sequences": [
    {
      "name": "YDC | Company | Seq 1: Technical Evaluator",
      "steps": [
        { "type": "automatic_email", "email_type": "new_thread", "subject": "...", "body": "..." },
        { "type": "linkedin_connect", "message": "..." },
        { "type": "automatic_email", "email_type": "reply", "body": "..." },
        { "type": "phone_call", "task_note": "..." },
        { "type": "automatic_email", "email_type": "reply", "body": "..." }
      ]
    },
    {
      "name": "YDC | Company | Seq 2: Business Sponsor",
      "steps": [ ... ]
    }
  ]
}
```

2. Alert user to run Playwright:
```bash
cd "/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/apollo-sequence-builder" && HEADED=true node build-sequences.js ~/Desktop/YDC\ Pipeline/apollo-sequence-builder/{company}_sequences.json
```

3. After user confirms script success (or after autonomous run completes), read `_results.json` for sequence IDs and `inactive_confirmed` status per sequence

**Inactive gate — check before any enrollment:**
For each sequence in `_results.json`, check `inactive_confirmed` AND `id`:
- `'inactive'` → safe, proceed
- `'archived'` → skip enrollment for this sequence; flag as needs rebuild
- `'unsafe'` AND `id` is null → creation failed, no sequence exists; skip this sequence, continue others
- `'unsafe'` AND `id` is not null → **HALT all enrollment for this account** — an existing sequence is potentially active

If ANY sequence has `unsafe` + non-null `id`: in automated context, set `status = 'partial_incident'` in progress file, post alert to C0B4RRF3FC0 (#automated-outbound-skills-and-routines) with the sequence ID, skip to the next account. In interactive context, stop and report to user before proceeding.

4. Create contacts via `apollo_contacts_create` (with `run_dedupe: true`) — only for sequences that passed the inactive gate

5. Enroll contacts via `apollo_emailer_campaigns_add_contact_ids`
   - Use email account ID from `apollo_email_accounts_index`
   - Sequential calls (not parallel, to avoid 500 errors)
   - Only enroll into sequences where `inactive_confirmed === 'inactive'`

6. **Sequences left INACTIVE. NEVER auto-activate.**

7. Labels: `"Whale Pipeline"` (global) + `"{Company} - Seq {1|2}"` (per-sequence)

### PHASE 6 (OPTIONAL): LINKEDIN SOCIAL WARMING

After pipeline completes for an account (or batch), offer:

> "Want me to run LinkedIn social warming for {Company} prospects before you activate?"

If yes (uses chrome-cdp skill, Sonnet subagent):
1. Visit each enrolled prospect's LinkedIn activity feed (`/in/{slug}/recent-activity/all/`)
2. Like 1-2 recent posts (last 2 weeks) via `button[aria-label='React Like']`
3. Generate comment suggestions for prospects with original content
4. Log which prospects were warmed

If no: skip. User activates sequences whenever ready.

---

## Progress Tracking

### Session Start

1. Read `~/Desktop/YDC Pipeline/territory-progress.json`
2. Report: "{X}/{total} accounts processed. Next batch: {list of next 8-10 pending accounts by score}"
3. If file doesn't exist: generate it from the workbook (see below)

### After Each Account

Update the progress file:
```json
{
  "company": "...",
  "status": "completed",
  "date": "2026-03-30",
  "sequences": ["YDC | Company | Seq 1: Technical Evaluator", "YDC | Company | Seq 2: Business Sponsor"],
  "contacts_enrolled": 10,
  "reactivation_targets": 0,
  "ctd_hits": 0,
  "sumble_signals": "LangChain, hiring Search Platform Engineer",
  "skipped_reason": null,
  "use_case_selected": "UC1: AGENT_TOOL_USE"
}
```

### Batch Summary

After processing a batch, print:
```
=== Territory Pipeline Batch Summary ===
Accounts processed this session: X
Total progress: Y/150

| Company | UC Selected | Contacts | Reactivation | CTD | Status |
|---------|------------|----------|-------------|-----|--------|
| ...     | ...        | ...      | ...         | ... | ...    |

Next batch: [list of next 8-10 pending accounts]
```

---

## Generating territory-progress.json

If the file doesn't exist, generate it from the workbook:

```python
import pandas as pd, json
from datetime import datetime

df = pd.read_excel('~/Downloads/Copy of Territory_Workbook_Q2_2026.xlsx', sheet_name='Andrew Miller-Mckeever', header=None)
data = df.iloc[3:]
data.columns = df.iloc[2]
tier_2a = data[data['Tier'] == '2.A']

progress = {
    "last_updated": datetime.now().isoformat(),
    "tier_2a": {
        "total": len(tier_2a),
        "processed": 0,
        "accounts": {}
    }
}

for _, row in tier_2a.iterrows():
    company = str(row['Company'])
    progress["tier_2a"]["accounts"][company] = {
        "status": "pending",
        "score": int(row['Score']) if pd.notna(row['Score']) else 0,
        "vertical": str(row['Vertical']) if pd.notna(row['Vertical']) else "",
        "website": str(row['Website']) if pd.notna(row['Website']) else "",
        "sf_id": str(row['SF ID']) if pd.notna(row['SF ID']) else ""
    }

with open('territory-progress.json', 'w') as f:
    json.dump(progress, f, indent=2)
```

---

## Sumble: Net-New Territory Sourcing

Outside of per-account pipeline runs, `FindOrganizations` can surface net-new accounts not yet in the territory workbook. Use when user says "find new accounts using [tech]", "who's using LangChain", "companies building RAG", or "sumble prospecting".

Useful queries for YDC territory sourcing:
- Technology: `langchain`, `llamaindex`, `exa`, `tavily`, `beautiful-soup`, `scrapy`
- Category: `gen-ai`, `oss-data-science`, `vector-database`, `ml-training`
- Advanced: `technology IN (langchain, llamaindex) AND technology_category EQ gen-ai`

Return company name + website. Add promising accounts to the territory workbook manually — do not auto-add.

---

## Global Rules

All rules from CLAUDE.md apply. Critical reminders:
- NEVER use em dashes
- NEVER name competitors in outreach
- NEVER reference specific evals (even anonymized)
- Search API always leads. Contents API and Research API are supporting angles.
- NEVER reference PRAG/AI Factory/Chat/ESL/Apex in prospect-facing output
- Sequences ALWAYS left INACTIVE
- Interest-based CTAs only in cold outreach
- Product knowledge: ~/.claude/projects/-Users-andrew-Downloads-Claud-Code-folder--YDCpipeline/memory/product-knowledge.md
