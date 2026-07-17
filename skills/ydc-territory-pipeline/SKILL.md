---
name: ydc-territory-pipeline
description: >-
  Automated outbound pipeline covering Andrew's full book of business (690 accounts),
  prioritized by composite Final_Score. Runs 3 accounts per night. 4 sequences per account
  (Engineering Leader, Executive Sponsor, Product Leader, AI/ML Leader), 5 contacts each. Hard-skips customers, partners,
  OOB accounts, active opps, recent outreach (60 days), and closed-lost cooling (60 days).
  Tracks progress in territory-progress.json for cross-session resumability. Use when user says
  "run territory pipeline", "territory pipeline for [company]", "territory pipeline status",
  "next batch", or "pipeline status".
---

# YDC Territory Pipeline

## Overview

Automated outbound pipeline across Andrew's full book of business (690 accounts ranked by composite score). 4 sequences per account (Seq A: Engineering Leader, Seq B: Executive Sponsor, Seq C: Product Leader, Seq D: AI/ML Leader), 5 contacts each (20 per account), 3 accounts per night. ~15 min per account.

## Invocation

- `run territory pipeline` -> processes next 8-10 unprocessed accounts
- `run territory pipeline for [Company], [Company]` -> specific accounts
- `territory pipeline status` -> progress report (X/150 done, next batch)
- `skip [Company]` -> marks as skipped in progress file

## State File

State file: `territory-progress.json` stored in Google Drive "Account Plans, Lists & Personalized Sequences/" folder (parentId `1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv`). Always search with query `title = 'territory-progress.json' and parentId = '1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv'` to avoid picking up stale copies. Read content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content`. Write updates via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` (overwrite the existing file ID).

See references/progress-schema.md for format.

## Workbook Reference

`~/Downloads/Copy of Territory_Workbook_Q2_2026.xlsx`
- Sheet: "Andrew Miller-Mckeever"
- Header row: row 2 (0-indexed)
- Columns: #, SF ID, Company, Score, Tier, Vertical, State, Country, Website, Employees, Annual Revenue, UC1 Category, UC1 Product, UC1 Case Name, UC1 Description, UC1 Personas, UC2 Category, UC2 Product, UC2 Case Name, UC2 Description, UC2 Personas, UC3 Category, UC3 Product, UC3 Case Name, UC3 Description, UC3 Personas
- Filter: Tier = "2.A"

## 4-Sequence Model

| Sequence | Name Pattern | Persona Pool |
|----------|-------------|-------------|
| Seq A: Engineering Leader | YDC \| {Company} \| Seq A: Engineering Leader | Dir/VP/SVP Eng, Head of Eng |
| Seq B: Executive Sponsor  | YDC \| {Company} \| Seq B: Executive Sponsor  | CTO, CIO, Chief AI Officer, CDO |
| Seq C: Product Leader     | YDC \| {Company} \| Seq C: Product Leader     | Dir/VP/Head of Product |
| Seq D: AI/ML Leader       | YDC \| {Company} \| Seq D: AI/ML Leader       | Head of AI/ML, VP Data Science, ML Eng Directors |

5 contacts per sequence = 20 contacts per account.

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

### PRE-PHASE SKIP GATE CHECK

Before running any phase, perform a zero-cost guard using data already in the progress file:

1. Read this account's `skip_until` and `status` from the in-memory progress file.
2. If `skip_until > today` OR `status == "skipped"`: **stop immediately.** Do not run CTD. Do not run any further phases. Log: "⛔ {Company} blocked before CTD — skip_until {date} / status {status}. Moving to next account." Preserve the existing `skip_until` and `skipped_reason` values in the progress file unchanged.

Only if the account passes this check: proceed to Phase 0.

---

### PHASE 0: WARM INTRO SCAN (~3 min)

**Model: Sonnet subagent**

Run the full `ydc-ctd-warmintro` skill for this account's domain. Follow all steps in that skill (Steps 0 through 6) with these two exceptions:
- **Skip Step 7** (nightly Google Doc compile + end-of-night Slack summary) — the territory nightly orchestrator handles that after all 3 accounts complete.
- **Bucket A Apollo tasks fire immediately** — do not defer. Each investor connector path creates an Apollo manual email task via Steps 5c.1–5c.4.
- **Bucket B and investor overlap Slack posts fire immediately** to `#ctd-outbound-referrals-for-the-day` (C0B1ZPX4K0Q).

Pass the account domain from the territory workbook into the CTD skill as the `{domain}` parameter.

Surface a one-line CTD summary in the account brief (Phase 2): number of Bucket A/B paths found, number of Apollo tasks created, investor overlaps detected.

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
- Q7: Andrew's open pipeline

**Decision gates — evaluated in order. First matching SKIP exits immediately:**

**Hard skips (mark status = "skipped" in progress file, move to next account):**
- Account Type = **Customer** (closed-won revenue exists) → skip, log "existing customer"
- Account Type = **Partner** → skip, log "partner account"
- Account Type = **Out of Business** → skip, log "out of business"
- **Active open opp** (Stage 1–5, not Closed) → skip, log "active opp: {stage}"
- **Closed-lost < 60 days** → skip, log "closed-lost cooling period (lost {date})"
- **Last touch < 60 days** — only if the activity was logged by **Andrew** (`OwnerId = '005Vq000009j4ezIAA'`). Non-Andrew activities (marketing, other AEs) do NOT trigger this gate — surface them in the brief as context only.
- **Existing YDC Apollo sequence** with contacts in **active** status AND sender = `andrew.miller-mckeever@you.com` → skip, log "Andrew already has active sequences here". If sequences exist from other senders, or Andrew's sequences are all finished/archived, do NOT skip — surface as context in brief.

**Proceed with modified approach:**
- Account Type = **Churn** → re-engagement tone. Touch 1 references the prior relationship, not a cold opener. Flag in brief: "CHURN ACCOUNT — re-engagement motion."
- **Closed-lost ≥ 60 days** → different product angle from what was pitched before. Lead with a different UC, deprioritize the contact who was primary on the lost deal.
- **FLAG reactivation targets** if contacts have [Gong In] replies or meetings in last 90 days but no active opp → warm tone on those contacts
- **FLAG already-sequenced contacts** for dedup in Phase 3 (contact-level, not account-level skip)

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

**3. Tech stack & infrastructure research (You.com Search API):**
Search for: `"{Company}" tech stack`, `"{Company}" engineering blog cloud`, `"{Company}" LLM API`, and job postings on their careers page. Surface:
- **Hyperscaler:** AWS / Azure / GCP / multi-cloud / none detected — check job titles, infra engineer postings, engineering blog mentions
- **LLM provider:** OpenAI / Anthropic / Cohere / Mistral / open-source (llama/Falcon/etc.) / none detected — check job descriptions for model names, GitHub if public, engineering posts
- **Search/data competitor:** Exa / Tavily / Perplexity / Google Custom Search / Bing Search API / SerpAPI / other / none detected — check job postings, tech blogs, any public stack references
If nothing found for any of these, note "no public signals found." These flow into UC selection (step 4) and the account brief.

**4. UC selection (informed by Sumble + web + tech stack):**
Pick the best use case based on:
   - Recency of the initiative (validated by web + job posting dates)
   - Alignment with Search API / Contents API / Research API (our products)
   - Specificity (named product > vague initiative)
   - Trigger event availability for hook
   - Sumble + tech stack alignment: prefer UC that matches detected signals (e.g. if LangChain detected → RAG grounding UC; if Azure detected → Azure AI co-sell angle; if Exa/Tavily detected → displacement angle; if OpenAI detected → complementary grounding/context layer angle)
4. Note the selected UC and rationale

### PHASE 2: ACCOUNT BRIEF (.md file, ~2 min)

**Model: Opus main thread**

Write to: `~/Downloads/Claud_Code_folder/YDCpipeline/{company}_brief.md`

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

## Tech Stack & Hiring Signals
- Hyperscaler: {AWS / Azure / GCP / multi-cloud / none detected}
- LLM provider: {OpenAI / Anthropic / Cohere / Mistral / open-source / none detected}
- Search/data competitor: {Exa / Tavily / Perplexity / Google CSE / Bing / SerpAPI / none detected}
- Legacy scraping: {BeautifulSoup / Scrapy / Selenium / none detected}
- RAG/LLM framework: {LangChain / LlamaIndex / Pinecone / none detected}
- Co-sell signal: {Databricks / Snowflake / none detected}
- Top hiring signal: {most relevant job title + 1-sentence description, or "none"}
- Hook implication: {1 sentence: how the above signals shape the Touch 1 angle}

## Supplemental Research
- Trigger events: {any recent news, launches, hires found in web validation}
- Competitive signals: {any known competitor/search-vendor usage or migration signals — sourced from tech stack research}

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
3. **Enrichment (MANDATORY before contact creation):** Call `apollo_people_bulk_match` in batches of 10 using the Apollo person IDs + domain. This is the ONLY step that returns actual email addresses — `apollo_mixed_people_api_search` only returns a `has_email: true` flag, NOT the email string itself.
   - **Priority rule: contacts with verified emails from bulk_match are prioritized for sequence slots.** Contacts where bulk_match returns no email are still included and enrolled with `sequence_no_email: true` — they receive T2 (LinkedIn connect), T4 (call), T5 (action item), T7 (LinkedIn DM). Never discard a contact solely for missing email.
   - Log email coverage: "X of Y contacts have verified email from bulk_match."
4. Dedup against SFDC contacts (from Phase 1)
5. Split into 4 sequences:
   - Seq A (Engineering Leader): VP/Dir Eng, AI/ML, Data Science, Platform, ML Engineer leads
   - Seq B (Executive Sponsor): CTO, CPTO, CDO, CAO, Chief AI Officer
   - Seq C (Product Leader): VP/Dir/Head of Product, CPO, AI Strategy
   - Seq D (AI/ML Leader): Head of AI/ML, VP Data Science, ML Engineering Directors
6. 5 contacts per sequence. Priority: title relevance > verified email > seniority. Fill to 5 using no-email contacts when verified-email contacts are exhausted.
7. Include reactivation targets in appropriate sequence (flagged for warm tone)
8. If fewer than 5 total Director+ contacts found for a sequence, enroll all that exist.

### PHASE 4: OUTREACH GENERATION (~5 min)

**Model: Opus main thread. NEVER delegate to subagent.**

Uses account brief from Phase 2 as context. Uses prospect list from Phase 3.

Generate 2 sequences, each with 7 touches:

| Touch | Day | Type | JSON step_type | Notes |
|-------|-----|------|----------------|-------|
| 1 | Day 1 | Email | `automatic_email`, `email_type: "new_thread"` | Unique subject, AIDA structure |
| 2 | Day 2 | LinkedIn | `linkedin_connect` | Fact-to-Consequence + Curiosity Hook, under 250 chars |
| 3 | Day 5 | Email reply | `automatic_email`, `email_type: "reply"` | New context, not rephrase |
| 4 | Day 8 | Call | `phone_call` | Call script in `task_note` |
| 5 | Day 11 | LinkedIn action | `action_item` | View profile + engage recent post, note content for Touch 7 |
| 6 | Day 14 | Email reply | `automatic_email`, `email_type: "reply"` | Breakup, new angle |
| 7 | Day 17 | LinkedIn DM | `linkedin_message` | Peer-to-peer, references their LinkedIn content, under 300 chars |

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
- No hide-the-company language: "You.com's APIs" not "our APIs," "You.com's founder" not "our founder."
- No qualifier openers on follow-up bodies: after "Hi {{first_name}}," jump to the new hook. "Last note," "One more angle," "Closing the loop," "Quick follow-up," "Additional context" are all banned.
- LinkedIn notes: zero pitch, zero CTA, zero flattery. Fact-to-Consequence + Research-Share Close. End every note with ", would love to connect and share more of my research." Never "Curious how your team is thinking about [X]."

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
- [ ] Each follow-up has a NEW proof point or angle (not a rephrase). If fewer than 3 distinct angles exist, collapse to 3 email touches instead of 4.
- [ ] Follow-up email bodies (Touches 3 and 6) start with the new hook — no qualifier openers after the greeting ("Last note," "One more angle," "Closing the loop," "Quick follow-up," "Additional context")
- [ ] No "our APIs" / "our founder" — You.com named explicitly in Desire section
- [ ] At least one Socher reference per sequence
- [ ] At least one public proof point per sequence
- [ ] Plain text only (no markdown formatting)
- [ ] LinkedIn connect note (Touch 2) under 250 chars, zero pitch, ends with ", would love to connect and share more of my research."
- [ ] Action item task note (Touch 5) instructs: view profile, engage recent post, note content for Touch 7
- [ ] LinkedIn DM (Touch 7) under 300 chars, different hook from Touch 6, references their LinkedIn content
- [ ] LinkedIn DM has zero product mention and zero meeting CTA

Fix any violations before proceeding to JSON.

### PHASE 5: BUILD & ENROLL (~2 min)

**Model: Sonnet subagent**

Use ydc-apollo-build skill. It will:
1. Write content JSON to `{company}-4seq-content.json`, run:
   `HEADED=true node build-sequences.js {company}-4seq-content.json`
   Creates 4 sequences (A-D), 7 touches each. Auth: launchPersistentContext + ~/.apollo-playwright-profile. LinkedIn connect (T2) and DM (T7) are sequence steps.
2. Enroll contacts via Apollo REST API
3. Post completion summary

Sequences are left INACTIVE (sequence toggle off). Individual steps are activated automatically by build-sequences.js — Andrew only needs to flip the top-level sequence toggle in Apollo after reviewing Touch 1.

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

1. Read `territory-progress.json` from Google Drive: search via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-progress.json' and parentId = '1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv'` (this targets "Account Plans, Lists & Personalized Sequences/" — do not use the copy in `accountplans/`). Then download content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__download_file_content`.

2. **Select next batch:** filter `pipeline.accounts` to `status = "pending"`, sort by `score` DESC, take the top 3. These are the accounts to run tonight.
   - The `score` field is the composite Final_Score. Do not override it.
   - **Competitor check:** skip any account owned by Google, Microsoft, Meta, Salesforce, Baidu, Yandex, Perplexity, Brave, DuckDuckGo, Tavily, or Neeva. Mark as skipped and move on.

3. Report: "{X}/{total} accounts complete. Next 3: {list with scores}"

4. If file doesn't exist: generate it from the workbook (see below), then upload to Google Drive "Account Plans, Lists & Personalized Sequences/" (parentId `1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv`) via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file`.

### After Each Account

Update the progress file via Drive MCP: read the current file, merge the new account entry, then overwrite via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` using the existing file ID.
```json
{
  "company": "...",
  "status": "completed",
  "date": "2026-03-30",
  "sequences": ["YDC | Company | Seq A: Engineering Leader", "YDC | Company | Seq B: Executive Sponsor", "YDC | Company | Seq C: Product Leader", "YDC | Company | Seq D: AI/ML Leader"],
  "contacts_enrolled": 14,
  "contacts_skipped_no_email": 6,
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
Total progress: Y/{total}

| Company | UC Selected | Contacts | Reactivation | CTD | Status |
|---------|------------|----------|-------------|-----|--------|
| ...     | ...        | ...      | ...         | ... | ...    |

Next batch: [list of next 8-10 pending accounts]
```

---

## Regenerating territory-progress.json from scratch

If the file is missing or needs a full reset, generate it from the rankings CSV and upload to Drive.

```python
import json, csv
from datetime import datetime

# Load full ranked account list
rankings = []
with open('/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/ydc_account_rankings.csv') as f:
    for row in csv.DictReader(f):
        rankings.append({
            'name': row['Account'],
            'score': float(row['Final_Score']),
            'employees': row.get('Employees',''),
            'industry': row.get('Industry',''),
            'website': row.get('Website',''),
            'parent': row.get('Parent_Company',''),
            'tier': row.get('SFDC_Tier',''),
            'target': row.get('Target_Account_3x','')
        })

accounts = {}
for r in rankings:
    accounts[r['name']] = {
        'status': 'pending',
        'score': r['score'],
        'score_source': 'ydc_rankings',
        'employees': r['employees'],
        'industry': r['industry'],
        'website': r['website'],
        'parent': r['parent'],
        'tier': r['tier'],
        'target_3x': r['target'],
        'skipped_reason': None
    }

progress = {
    'last_updated': datetime.now().isoformat(),
    'score_note': 'Composite Final_Score from ydc_account_rankings.csv. Full book of business.',
    'pipeline': {
        'total': len(accounts),
        'processed': 0,
        'accounts_per_night': 3,
        'accounts': accounts
    }
}

with open('/tmp/territory-progress.json', 'w') as f:
    json.dump(progress, f, indent=2)
print(f"Generated {len(accounts)} accounts")
```

Then upload: `rclone copyto /tmp/territory-progress.json "gdrive:Account Plans, Lists & Personalized Sequences/territory-progress.json" --drive-use-trash=false`

---

## Sumble: Net-New Territory Sourcing

Outside of per-account pipeline runs, `FindOrganizations` can surface net-new accounts not yet in the territory workbook. Use when user says "find new accounts using [tech]", "who's using LangChain", "companies building RAG", or "sumble prospecting".

Useful queries for YDC territory sourcing:
- Technology: `langchain`, `llamaindex`, `exa`, `tavily`, `beautiful-soup`, `scrapy`
- Category: `gen-ai`, `oss-data-science`, `vector-database`, `ml-training`
- Advanced: `technology IN (langchain, llamaindex) AND technology_category EQ gen-ai`

Return company name + website. Add promising accounts to the territory workbook manually — do not auto-add.

## Global Rules

All rules from CLAUDE.md apply. Critical reminders:
- NEVER use em dashes
- NEVER name competitors in outreach
- NEVER reference specific evals (even anonymized)
- Search API always leads. Contents API and Research API are supporting angles.
- NEVER reference PRAG/AI Factory/Chat/ESL/Apex in prospect-facing output
- Sequences ALWAYS left INACTIVE (sequence toggle off, individual steps active)
- Interest-based CTAs only in cold outreach
- Product knowledge: ~/.claude/projects/-Users-andrew-Downloads-Claud-Code-folder--YDCpipeline/memory/product-knowledge.md

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added PRE-PHASE SKIP GATE CHECK before Phase 0 | Skip gate logic was being bypassed; accounts with skip_until dates were still running CTD and incurring API costs |
| (prior) | Added mandatory apollo_people_bulk_match enrichment in Phase 3 | apollo_mixed_people_api_search returns `has_email: true` flag only, not the actual email; contacts were being enrolled without verified email addresses |
| (prior) | Added Phase 0: CTD warm intro scan | Warm intros were being skipped in territory pipeline; moved from optional to required first step |
| (prior) | Added tech stack research (hyperscaler, LLM provider, search competitor) in Phase 1d | UC selection was using workbook data without web validation; current tech stack signals materially change the best outreach angle |
| (prior) | Added LinkedIn connect note rule: end with ", would love to connect and share more of my research." | Applied same rule from ydc-outreach; standardized across whale and territory pipelines |
| (prior) | Added skip gate for Andrew's active Apollo sequences (sender filter: andrew.miller-mckeever@you.com only) | Other senders' sequences (marketing, SDR) were triggering account skips incorrectly |
