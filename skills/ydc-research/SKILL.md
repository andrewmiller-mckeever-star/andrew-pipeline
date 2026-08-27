---
name: ydc-research
description: Deep company research for You.com whale account pipeline. Checks Google Drive for existing deliverables, queries Salesforce for CRM intelligence (opportunities, contacts, replies, activity, Databricks partnership), searches Slack for supplemental context, then runs 5 parallel You.com Research API calls to auto-generate deep research across AI initiatives, leadership, competitive pressures, recent news, and data/search infrastructure. No manual PDF required. Use when user says "research [company]", "company overview for [company]", "check drive and slack for [company]", "Step 1", or at the start of any pipeline run before generating an account plan.
---

# YDC: Deep Company Research (Step 1)

## Rule precedence (added 2026-08-27)

CLAUDE.md wins on voice, copy, and cadence. This skill wins on API mechanics, step types,
personas, and process gates. On conflict, follow the newer date and say in your output which
rule you followed and which you set aside. Never silently pick one.


## What to Collect

1. Company Overview: name, website, HQ, employee count, revenue/ARR, valuation, industry, business units
2. Tech Stack: public engineering infrastructure (languages, cloud providers, ML tools, databases)
3. AI/ML Initiatives: public AI programs, AI product features, engineering blog AI posts, internal AI tools, AI hiring signals
4. Strategy & Leadership: CEO vision, strategic shifts, recent earnings themes, market pressures
5. Leadership Team: C-suite and VP/Director level - especially CTO, VP Engineering, Head of AI/ML, Head of Product, Head of DevRel
6. Recent Press: funding rounds, product launches, partnerships, regulatory events, IPO signals
7. Competitive Landscape: who they compete with in their own market (not You.com competitors)
8. Data & Search Infrastructure: how they source, index, or retrieve external content for products or internal tools; web scraping, search APIs, content aggregation, news feeds, real-time data pipelines, third-party data providers; gaps in freshness, accuracy, or coverage
9. CRM Intelligence & Prior Engagement: Salesforce account status, opportunity history (open + closed), prospect replies, contacts, activity timeline, outbound sequences already run, Databricks partnership signals, decision gates

## Research Order

### Step 1: Check Google Drive (Haiku subagent)
Search "Account Plans, Lists & Personalized Sequences/" for any existing deliverables for this account. If prior work exists, build on it - do not start from scratch.

### Step 2: Salesforce Account Intelligence (Sonnet subagent, run in parallel with Drive check)
Invoke the ydc-salesforce skill. Runs 7 SOQL queries in parallel against the target account:
- Account existence, ownership, type, Databricks partnership signals
- Full opportunity history (open + closed, with product parsing)
- Contacts already in SF (for dedup against Apollo in Step 3)
- Prospect replies ([Gong In] prefix, with full thread propagation)
- Activity timeline (last 12 months)
- Outbound Apollo sequences already run
- Andrew's current pipeline context

Output: Structured CRM Intelligence Brief (Section 9 of research output) with 5 decision gates:
1. Active Opportunity check
2. Closed-Lost Intelligence (product/stage/contact to avoid)
3. Contact Dedup list for Step 3
4. Product Mix (net-new vs expansion)
5. Databricks Co-Sell signal

See ydc-salesforce/SKILL.md for full query specs, output format, and gate logic.

### Step 2b: Search Slack (Sonnet subagent, supplemental, runs in parallel with Step 2)
Search these channels for account name mentions: #api-gtm-team, #sales-team, #esl-api-sales, #competition, #enterprise-solutions, #marketing, #product
Capture: informal context, competitive mentions, anecdotal notes not captured in SF.
Slack is supplemental to SFDC, not primary. SFDC has the structured data; Slack catches informal signals.

### Step 2c: CTD Warm Intro Check + Investor Overlap (runs in parallel with Steps 2 and 2b)

Invoke the **ydc-ctd-warmintro skill as a Sonnet subagent**, passing the target company domain. The skill handles:
- CTD API calls, filtering, ranking, and ghost email drafting (Bucket A/B/C paths)
- Monthly refresh of `youcom-investors.md` (rebuilds if not updated this month)
- Target company investor research (3 Research API queries)
- Shared investor cross-reference + person lookup (3 queries per matched firm)
- Ghost Slack message + ghost email drafting for each shared investor firm

Embed the full ydc-ctd-warmintro output verbatim into Section 9 of the research brief. Do not summarize or truncate it.

**Delimited output for nightly doc:** The CTD skill produces two types of labeled blocks:

```
=== CTD REFERRAL PATHS FOR NIGHTLY DOC ===
Company: {company name}
Domain: {domain}
{all Bucket A/B paths with 3-piece copy}
=== END CTD REFERRAL PATHS ===

=== INVESTOR OVERLAP PATHS FOR NIGHTLY DOC ===
Company: {company name}
Domain: {domain}
{all shared investor paths with 3-piece copy}
=== END INVESTOR OVERLAP PATHS ===
```

The pipeline orchestrator collects BOTH block types from all accounts and compiles them into the persistent daily Google Doc at the end of the batch (see ydc-pipeline Step 7).

**Graceful failure:** If CTD returns no data or errors, note it clearly in Section 9 and continue. If investor research returns nothing, note it and continue. Neither failure blocks the pipeline.

### Step 2d: Sumble Intelligence Check (runs in parallel with Steps 2, 2b, 2c)

Query Sumble for structured tech stack and hiring signals. Two calls:

**Call 1 — Enrich Organization:**
Use `EnrichOrganization` with the target company domain.

Extract and flag:
- **Competitor tech detected:** Exa, Tavily, Perplexity (displacement/competitive signal)
- **Legacy scraping stack:** BeautifulSoup, Scrapy, Selenium, SerpApi (migration opportunity — they're building manually)
- **RAG/LLM stack:** LangChain, LlamaIndex, vLLM, Pinecone, any vector DB (they're building AI agents and need grounding)
- **Legacy search:** Elasticsearch, Algolia (search modernization angle)
- **Complementary:** Databricks, Snowflake (co-sell signal)

**Call 2 — Find Jobs:**
Use `FindJobs` with the target company. Cap at 5 results. Filter to roles containing: search, AI, ML, RAG, LLM, data infrastructure, information retrieval, knowledge, NLP.

Extract: job title, date posted, key signals from description (e.g. "building RAG pipeline", "replacing legacy search", "grounding LLM with web data").

**Output:** Section 10 "Sumble Intelligence" in the research brief (see Output Template below).

**Graceful failure:** If either Sumble call errors or returns no results, note it in Section 10 and continue. Sumble failure does not block the pipeline.

**Credit note:** `EnrichOrganization` costs ~10-20 credits. `FindJobs` costs ~5 credits per result (capped at 5 = ~25 credits max). Total per account: ~45 credits.

### Step 3: You.com Research API — Auto Deep Research (PRIMARY)

**No PDF required. This step runs automatically.**

Fire 5 parallel Research API calls — one per area — using the You.com Research API. Read `ae-config.md` to get `YDC_API_KEY` and `YDC_RESEARCH_ENDPOINT`.

**API call format:**
```bash
curl -s -X POST \
  -H "X-API-Key: {YDC_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"input": "{query}"}' \
  "https://api.you.com/v1/research"
```

**Run all 5 calls in parallel. Use these queries, substituting {COMPANY} and {DOMAIN} from the target account:**

**Area 1 — AI Initiatives:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus exclusively on AI initiatives. Cover: all AI products and features shipped in 2025-2026, any use of retrieval-augmented generation (RAG), agentic AI workflows, AI assistants or copilots that pull external data, LLM grounding with web or real-time sources, citation verification systems, knowledge management platforms, and any search infrastructure powering AI features. Include specific product names, launch dates, and engineering blog posts. Cite all sources with URLs.
```

**Area 2 — Leadership:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus exclusively on leadership. Cover: full C-suite roster (CEO, CTO, CPO, CDAO, CRO, CISO, COO), VP and Director level in Engineering, AI/ML, Product, and Data, recent leadership hires and departures in 2025-2026, critical open roles, and who owns technology infrastructure decisions. Include LinkedIn URLs where available. Cite all sources.
```

**Area 3 — Competitive Pressures:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus exclusively on competitive pressures and financial position. Cover: revenue trends and ARR in 2025-2026, headcount changes, market competition and named competitors, any activist investor activity, funding runway and burn rate signals, analyst coverage, and any strategic pivots under competitive pressure. Include specific dollar figures and dates. Cite all sources with URLs.
```

**Area 4 — Recent News 2025-2026:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus exclusively on news from 2025 and 2026. Cover: product launches, new partnerships and integrations, named customer wins, executive hires and departures, board changes, pricing changes, regulatory events, and any IPO or M&A signals. Include specific dates and dollar figures where available. Cite all sources with URLs.
```

**Area 5 — Data & Search Infrastructure:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus exclusively on data and search infrastructure. Cover: how the company currently sources, indexes, or retrieves external content for its products or internal tools; any public mentions of web scraping, search APIs, content aggregation, news feeds, real-time data pipelines, or third-party data providers powering AI or product features; gaps in data freshness, accuracy, or coverage mentioned in engineering blogs, job postings, or analyst reports; and any signals of dissatisfaction with current search or data providers. Cite all sources with URLs.
```

**Query customization rules:**
- For Area 1: seed with any known AI products/programs specific to the company (from Slack or Drive context)
- For Area 3: seed with known competitors in their market if identified in prior research
- Area 5 is the highest-value area for You.com relevance — spend the most attention here
- If company is early-stage with limited public info, broaden Area 3 to include funding signals and investor commentary

**Processing Research API responses:**
- Each response includes `output.content` (synthesized answer) and `output.sources` (array of cited URLs)
- Extract all source URLs from every call — these are the citations for the account plan
- Organize findings from all 5 calls into the 9 collection areas defined above
- Flag any area where the API returned thin or no results — use Step 4 to fill those gaps

### Step 4: Supplemental WebSearch (Opus main thread, only if needed)
After Research API calls complete, use WebSearch ONLY to fill specific gaps:
- LinkedIn org chart signals (job postings, team structure not covered in Area 2)
- Very recent news (last 48 hours) that Research API may not have indexed
- Specific URLs the account plan needs (careers page, engineering blog, specific press release)
- Area 5 (data/search infrastructure) if Research API returned thin results

Do NOT re-run broad research queries already covered by the Research API.

## Research Sources (Priority Order)

1. Google Drive (existing deliverables)
2. Salesforce (primary CRM intelligence: opps, contacts, replies, activity, Databricks partnership)
3. Slack (supplemental informal context)
4. CTD (warm intro paths for prospect weighting — runs in parallel with SF and Slack)
5. Sumble (tech stack signals + active hiring — runs in parallel with SF, Slack, CTD)
6. You.com Research API — 5 parallel calls (primary web research)
7. WebSearch (supplemental gap-filling only)
8. LinkedIn (org chart, leadership via Apollo)
9. Sales deck: see SALES_DECK_PATH in ae-config.md

## Output

After all research calls complete, write three structured artifact files to disk. These replace the long-form prose brief. Each file is optimized for the downstream step that consumes it. The full research API responses stay in context for synthesis but are not written to disk as prose.

---

### File 1: `{company}_facts.md`
Save to: `/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/{company}_facts.md`

Structured facts organized by account plan section. ~400 words. Include source URLs inline for every cited fact.

```
## Company Overview
- Company Name:
- Website:
- HQ:
- Employees: [number (Source - URL)]
- Revenue/ARR: [figure (Source - URL)]
- Industry:
- Business Units: [list]
- Tech Stack: [list — flag Sumble signals: displacement/migration/RAG/co-sell]
- Recent Press: [3-5 items with dates and source URLs]
- AI Initiatives: [list with product names, launch dates, source URLs]
- Existing Relationship: [from SF — prior sequences, last activity, or "No SF data"]
- Renewal Details: [from SF — closed-won opps, or "No SF data"]
- Internal Ownership: [SF account owner, or "No SF data"]

## Strategic Context
- Corporate Strategy: [2-3 sentences + source URLs]
- Industry Trends: [2-3 bullets + source URLs]
- AI/Automation Programs: [specific initiatives + source URLs]
- Earnings Themes: [if public company + source URLs, else omit]
- Market Pressures: [2-3 bullets + source URLs]

## Leadership Directory
[One line per Director+ contact identified from Research API Area 2 and Sumble]
- Name: | Title: | LinkedIn: [URL if found] | Dept: | Relevance to YDC:

## Relevant Teams and Products
[Product and team names that help Step 3 identify the right prospects]
- [Product name]: owned by [team/person if known] — relevant because [1 sentence]

## Competitive Landscape
- Competitors (their market): [list + source URLs]
- Market pressures: [2-3 bullets + source URLs]
```

---

### File 2: `{company}_usecases.md`
Save to: `/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/{company}_usecases.md`

3-5 prioritized use cases. ~250 words. This is the "why they'd buy" layer — connects their specific signals to You.com outcomes.

```
## Use Cases

### UC1: [Name]
- Pain signal: [specific evidence from research with date if available]
- You.com capability: [Search API / Contents API / Research API]
- Why they'd buy: [1-2 sentences connecting their signal to the outcome]
- Relevant persona: [Engineering Leader / Executive Sponsor / Product Leader / AI/ML Leader]
- Proof point match: [DuckDuckGo / Harvey / Windsurf / Salesforce / Databricks — and why it fits]

[Repeat for UC2-UC5, ranked by signal strength]

## Secondary Angles
[2-3 backup hooks — lower confidence but worth noting for Step 4 follow-up touches]
- [Signal] | [Angle] | [Persona]
```

---

### File 3: `{company}_hooks.md`
Save to: `/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/{company}_hooks.md`

6-8 outreach-ready signals plus all CRM/CTD flags. ~200 words. This is the direct input for Step 4 Touch 1 hook selection.

```
## Trigger Events
- [Signal type] | [Specific finding + date] | [Persona: Seq A/B/C/D]

## Tech Stack Signals
- [Technology] | [Implication for outreach] | [Persona]
  (include Sumble findings: competitor tech, legacy scraping, RAG stack, co-sell)

## Hiring Signals
- [Job title + date posted] | [Key signal from JD — e.g. "explicitly mentions replacing legacy search API"] | [Persona]

## Proof Point Recommendation
- Primary: [case study + why it fits this account]
- Secondary: [backup case study + reason]

## SF Flags
- Prior sequences run: [sequence names + dates, or "None"]
- Contacts to hold (in SF with activity): [names + reason]
- Closed-lost products to avoid re-pitching: [products + dates, or "None"]
- Active opportunity: [Yes/No + details]
- Databricks co-sell signal: [Yes/No]

## CTD Warm Intro Paths
[Embed full ydc-ctd-warmintro output verbatim here — all paths, ghost emails, summary, next steps]
[Or: "No CTD data returned for this account."]

## Handoff Notes
NOTE TO ydc-prospects: Read _facts.md Leadership Directory for LinkedIn URLs to use in Apollo bulk match. Read SF Flags above for contacts to hold and dedup. Contacts matching CTD targets get +1 rank priority. Contacts reachable via a You.com employee connector are WARM INTRO ONLY — do not cold enroll.

NOTE TO ydc-account-plan: Read _facts.md + _usecases.md to populate plan_data.json. CTD data is in _hooks.md — add Warm Intro column to Section 8 Contact Assignments table if CTD paths exist.

NOTE TO ydc-outreach: Read _usecases.md for use case angles per sequence. Read _hooks.md Trigger Events + Tech Stack Signals for Touch 1 hook selection. SF Flags govern hold/activation timing.
```

## Slack Channels Reference

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

## Legacy Notes

**ARI PDF (Deprecated 2026-04-08):** The pipeline previously required a manually generated You.com ARI deep research PDF. This has been replaced by automated Research API calls in Step 3. No user action required for research — the pipeline runs end-to-end without a PDF.

**Perplexity CDP Playbook (Deprecated 2026-03-19):** Perplexity Deep Research via Chrome CDP was the original primary research tool, replaced by ARI PDF, now replaced by the Research API. The CDP playbook is retained in memory/perplexity-cdp.md for historical reference only.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| 2026-04-08 | Replaced ARI PDF with automated Research API calls (Step 3) | ARI PDF required manual generation; Research API runs end-to-end without user action |
| 2026-03-19 | Replaced Perplexity CDP playbook with ARI PDF | Perplexity Chrome CDP was brittle; ARI PDF provided more reliable structured output |
| (prior) | Added Step 2d: Sumble intelligence check (parallel with SF/Slack/CTD) | Tech stack and hiring signals from Sumble improve use case selection and hook quality in Steps 3-4 |
| (prior) | Added Step 2c: CTD warm intro as Sonnet subagent | Warm intro discovery needed to run in parallel with SFDC, not sequentially |
| (prior) | Replaced Section 9 "Slack Context" with "CRM Intelligence & Prior Engagement" (ydc-salesforce output) | SFDC is the authoritative source; Slack is supplemental. Dedicated salesforce skill runs 7 parallel SOQL queries |
| (prior) | Replaced long-form prose brief with three structured artifact files (_facts.md, _usecases.md, _hooks.md) | Downstream steps (account plan, prospects, outreach) each need different subsets; single prose brief was over-loading every consumer |
