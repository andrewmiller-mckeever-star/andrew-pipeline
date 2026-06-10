---
name: ydc-research
description: Deep company research for You.com whale account pipeline. Checks Google Drive for existing deliverables, queries Salesforce for CRM intelligence (opportunities, contacts, replies, activity, Databricks partnership), searches Slack for supplemental context, then runs 5 parallel You.com Research API calls to auto-generate deep research across AI initiatives, leadership, competitive pressures, recent news, and data/search infrastructure. No manual PDF required. Use when user says "research [company]", "company overview for [company]", "check drive and slack for [company]", "Step 1", or at the start of any pipeline run before generating an account plan.
---

# YDC: Deep Company Research (Step 1)

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
- Ryan's current pipeline context

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

### Step 2c: CTD Warm Intro Check (runs in parallel with Steps 2 and 2b)

Query Connect The Dots to find warm intro paths into the target account. This runs at research time — not post-pipeline — so the data is available to weight prospect selection in Step 3.

**Auth:** Read `CTD_API_KEY` and `CTD_CLIENT_ID` from `ae-config.md`.

**Three calls in sequence:**

**1. Check company reachability:**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/company?company_domain={domain}
Headers: ctd-api-key: {CTD_API_KEY}, ctd-client-id: {CTD_CLIENT_ID}
```
- If 404 or no data: note "No CTD data for {Company}" in Section 9 and skip remaining CTD calls.
- Log `ctd_company_score_label` for context but always proceed to call 2 regardless of score.

**2. Find reachable ICP contacts:**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/people?company_domain={domain}&degree=first&degree=second&target_seniority=VP&target_seniority=Director&target_seniority=CXO&target_seniority=CEO&target_seniority=Founder&target_function=Engineering&target_function=Product&target_function=Information+Technology&page_size=40
```
Filter results to ONLY contacts where `ctd_score_label` = "Strong Chance to Connect".

**3. Get strong intro paths:**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/paths?company_domain={domain}&path_relationship_strength=strong&path_relationship_strength=medium&degree=first&degree=second&page_size=40
```
Keep only paths where `path_relationship_strength_label` = "strong". Drop medium.

**For each qualifying path, extract:**
- Target: name, title, LinkedIn ID
- Connector: name, title, company, LinkedIn ID, `connector_type`
- Relationship context: `overlapping_message` from `edges[]`
- Degree: 1st or 2nd
- **You.com Employee flag:** if the connector's company is "You.com" or domain is "you.com", mark `ydc_employee: true`

**Output:** Structured warm intro table in Section 9 of the research brief (see Output Template below). This data is passed forward to ydc-prospects for contact weighting. Do NOT generate ghost emails here — that is the job of the standalone ydc-ctd-warmintro skill.

**Graceful failure:** If any CTD call errors or returns empty, note it clearly in Section 9 and continue. CTD failure does not block the pipeline.

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

## Output Template

After all Research API calls return, synthesize into the following structured research brief. This document feeds directly into ydc-account-plan. Every externally sourced fact must have a citation. No fabricated URLs.

**Citation format:** (Source Name — URL) inline after each claim. If no verifiable URL exists: (No verifiable source — To Be Validated by AE).

**Minimum citation targets:**
- Total across all sections: 20+ sources
- Section 3 (AI Initiatives): 5+ sources
- Section 8 (Data & Search Infrastructure): 3+ sources minimum — this is the highest-value section
- Section 5 (Leadership): 1 source per named leader (LinkedIn or company page)
- If any section has 0 sources from Research API: mandatory WebSearch gap-fill before proceeding

---

```
# {Company} Research Brief
Generated: {date} | Sources: You.com Research API + Salesforce + Slack + WebSearch

---

## 1. Company Overview
- Full name, website, HQ location
- Employee count (Source — URL)
- Revenue / ARR / valuation (Source — URL)
- Industry classification and primary business lines
- Fiscal year and public/private status

## 2. Tech Stack
- Cloud providers, primary languages, ML frameworks, databases in known use
- Any public engineering blog posts about infrastructure choices
- (Source — URL) for each confirmed detail

## 3. AI/ML Initiatives [PRIORITY: feeds Seq D hook and all persona hooks]
- All AI products and features shipped in 2025-2026, with launch dates (Source — URL)
- Any use of RAG, agentic workflows, LLM integrations, or AI assistants
- Internal AI tooling (coding assistants, knowledge bases, internal copilots)
- AI hiring signals: open roles mentioning LLMs, RAG, retrieval, search infra
- Citation density target: 5-10 sources

**Pitch signal:** Flag any AI product that needs real-time external data, grounding, or citation accuracy. These are the direct entry angles.

## 4. Strategy & Leadership
- CEO/CTO/CPO public statements on AI strategy (Source — URL)
- Recent earnings or investor commentary themes
- Strategic pivots or cost reduction signals
- Known technology investment priorities

## 5. Leadership Team [CRITICAL: feeds Step 3 prospect targeting]

| Name | Title | LinkedIn | Notes |
|------|-------|----------|-------|
| {Name} | CTO | {URL} | {e.g., joined from X, focus on Y} |
| {Name} | VP Engineering | {URL} | |
| {Name} | VP/Head of Product | {URL} | |
| {Name} | Head of AI/ML | {URL} | |
| {Name} | Chief Data/Analytics Officer | {URL} | |

Include every confirmed VP+ in Engineering, AI/ML, Product, Data. Fill gaps with "Not publicly identified."
Source each person: (LinkedIn — URL) or (Company page — URL).

## 6. Recent News (2025-2026) [Chronological]
- {Date}: {Event} (Source — URL)
- {Date}: {Funding round / launch / partnership / hire / regulatory event} (Source — URL)
Include specific dollar figures and dates where available. Minimum 5 entries.

## 7. Competitive Landscape
- Named competitors in their market (not You.com competitors)
- Any analyst comparisons or market share data (Source — URL)
- Competitive pressures affecting their technology investments

## 8. Data & Search Infrastructure [HIGHEST-VALUE SECTION — You.com relevance]
This section determines the pitch entry angle. Be exhaustive.

- How does the company currently retrieve external content for AI products or internal tools?
- Any named third-party data providers, search APIs, or content aggregation services (Source — URL)
- Any engineering blog posts, job postings, or conference talks about retrieval, search, or RAG architecture (Source — URL)
- Any public signals of data freshness problems, hallucination issues, or coverage gaps
- Any migration signals (switching providers, building in-house, evaluating alternatives)
- Citation density target: 3-8 sources

**Pitch entry angle:** Based on findings, state in 1-2 sentences: what is the most credible angle for You.com Search API? Which product (Search API / Contents API / Research API / Vertical Index) maps most directly to what they need?

## 9. CRM Intelligence & Prior Engagement
[Filled from ydc-salesforce skill output — do not fabricate]

### Account Status
- SF Account: {Exists / Does not exist}
- Owner, Account Type, Industry

### Prospect Replies (Warm Paths)
[From [Gong In] tasks — see ydc-salesforce output]

### Opportunity History
[From SF opp queries]

### Existing SF Contacts
[For dedup in Step 3]

### Activity Timeline
[Last 12 months summary]

### Slack Context
[Any relevant signals from #api-gtm-team, #sales-team, #esl-api-sales]

### Pipeline Decision Gates
[From ydc-salesforce skill — 5 gates: Active Opp, Prior Rejection, Contact Dedup, Product Mix, Databricks]

### Warm Intro Paths (CTD)
[Filled from Step 2c CTD query — do not fabricate. If CTD returned no data, write "No CTD data for {Company}."]

CTD Company Score: {Strong / Familiar / Weak / No data}
Strong Intro Paths Found: {N}

| Target Name | Target Title | Connector | Connector Co | Degree | YDC Employee? | Relationship Context |
|-------------|-------------|-----------|--------------|--------|---------------|----------------------|
| {Name}      | {Title}     | {Name}    | {Company}    | 1st    | Yes / No      | {overlapping_message — 1-2 sentence summary} |

**You.com Employee Connectors (priority intro asks — ask via Slack before activating sequences):**
- {Connector Name} ({Title} at You.com) → {Target Name} ({Target Title})
  Context: {1-sentence summary of shared history / relationship}

**NOTE TO ydc-prospects:** Contacts matching CTD targets with strong paths get elevated one rank in prospect prioritization. Contacts reachable via a You.com employee connector are included in the prospect list regardless of standard ICP criteria — tag as `WARM INTRO ONLY, do not cold enroll`.

## 10. Sumble Intelligence
[Filled from Step 2d Sumble calls — do not fabricate. If Sumble returned no data, write "No Sumble data for {Company}."]

**Tech Stack Signals:**
| Signal Type | Technology | Implication |
|-------------|-----------|-------------|
| Competitor | Exa | Direct displacement opportunity |
| RAG Stack | LangChain | Building AI agents — needs grounding layer |
| Legacy Scraping | BeautifulSoup | Manual data pipeline — migration angle |
| Co-sell | Databricks | Unity Catalog integration angle |
(list only detected technologies — omit rows with no signal)

Competitor tech detected: Yes / No
Legacy scraping stack detected: Yes / No
RAG/LLM stack detected: Yes / No

**Active Hiring Signals (top 5 AI/search/data roles):**
| Job Title | Signal |
|-----------|--------|
| {title} | {1-sentence signal from job description} |

No relevant job postings found: {Yes / No}

**Outreach hook implications:**
- {1-3 bullets: how Sumble signals should inform Touch 1 hook or sequence angle}

---

## Synthesis: Outreach Hook Candidates

After completing all 9 sections, run a cross-reference pass:

**AI Initiatives x Data Infrastructure:** Where do Sections 3 and 8 intersect? Which AI product is most likely underpowered by weak retrieval? That intersection is the primary pitch entry point.

**Hook candidates by persona (pull 2-3 per sequence):**

| Sequence | Persona | Best Hook Candidate | Hook Type |
|----------|---------|--------------------| ----------|
| Seq A | Engineering Leader | {specific trigger event or infra signal} | {Trigger / Content / Initiative / Pain} |
| Seq B | Executive Sponsor | {funding news / AI program / strategic angle} | |
| Seq C | Product Leader | {product launch or competitive gap} | |
| Seq D | AI/ML Leader | {RAG/retrieval signal from Section 3 or 8} | |

**Strongest proof point match:** Which named case study (Harvey / Windsurf / Salesforce / DuckDuckGo / Databricks) maps closest to this account's use case? State why.

**Founder credibility placement:** Which sequence/persona benefits most from Socher credibility angle? State the framing.

---

## Research Quality Assessment
- Areas with strong coverage (5+ sources): [list]
- Areas with thin coverage (fewer than 2 sources): [list] — flag for AE follow-up or WebSearch gap-fill
- Total sources cited: [n]
- Research API calls completed: [n]/5
- WebSearch supplemental: [yes/no — what for]
```

---

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
