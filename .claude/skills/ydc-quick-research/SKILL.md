---
name: ydc-quick-research
description: CLOUD version for Claude Code Routines. Partnership, BD, and customer intelligence brief for any company. Uses You.com Search and Research APIs ($YDC_API_KEY with connector fallback), the Salesforce connector, the Slack connector, CTD REST ($CTD_API_KEY/$CTD_CLIENT_ID), and the Sumble connector to generate a strategic brief (~1,500 words) that maps competitive search tool usage, leadership vision alignment, product fit, and specific hooks for engaging their leaders. Output is a native Google Doc in the accountplans/ Drive folder via the Drive connector. Use when user says "/ydc-quick_research [company]", "quick research on [company]", "partnership brief for [company]", or "BD brief for [company]".
---

# YDC Quick Research: Partnership & BD Intelligence Brief (Cloud)

**Cloud execution notes (differences from the laptop version):**
- All auth comes from account-level claude.ai connectors: Google Drive, Slack, Salesforce (read-only `soqlQuery`), Sumble, You.com Search. Locate connector tools by function-name suffix (e.g. a Drive tool ending in `create_file`), never by hardcoded `mcp__<uuid>__` prefixes.
- API keys come from env vars, never from `ae-config.md` or local files. There is no rclone fallback in the cloud: if Drive creation fails, report it, print the full brief inline, and continue (soft-fail).
- WRITE BOUNDARY: this skill creates ONE Google Doc in the accountplans Drive folder and prints the brief in chat. Nothing else. Never write to Salesforce, Slack, Apollo, or email.

## Input

Read from the user's command:
- **Company name** (required)
- **Founder or key person LinkedIn URL** (optional — surface additional ones from research if not provided)

Read these environment variables (all optional — missing values must never abort the run):

| Variable | Default if unset |
|---|---|
| `AE_NAME` | Andrew Miller-McKeever |
| `YDC_API_KEY` | (none — triggers connector fallback in Step 2) |
| `YDC_RESEARCH_ENDPOINT` | `https://api.you.com/v1/research` |
| `YDC_SEARCH_ENDPOINT` | `https://api.you.com/v1/search` |
| `CTD_API_KEY` | (none — Step 1D soft-fails with "No CTD data") |
| `CTD_CLIENT_ID` | `andrew.miller-mckeever@you.com` |
| `GDRIVE_FOLDER_ID` | `1Fd2sMXvUnFVbAoh_BxqCrUI3R8snvp9u` (accountplans folder) |

---

## Step 1: Pre-flight (parallel)

Run all of these in parallel before proceeding.

### 1A: Google Drive Check (subagent)
Use the Google Drive connector tool `search_files` to search `accountplans/` for any existing deliverable for this company. If one exists, note it and build on it — do not start from scratch.

### 1B: Salesforce Check (subagent)
Invoke the `ydc-salesforce` skill (cloud version — Salesforce connector `soqlQuery`). Run SOQL queries against the target account:
- Account existence, ownership, type, Databricks partnership signals
- Full opportunity history (open + closed)
- Contacts already in SF
- Prospect replies and activity timeline
- Outbound sequences already run

Output a concise CRM snapshot (≤10 lines) for inclusion in the brief's metadata section.

### 1C: Slack Check (subagent)
Use the Slack connector tool `slack_search_public_and_private` (or `slack_search_public`) to search these channels for the company name: `#api-gtm-team`, `#sales-team`, `#esl-api-sales`, `#competition`, `#enterprise-solutions`, `#marketing`, `#product`.
Extract any informal context, competitive mentions, or deal notes not in Salesforce.

### 1D: CTD Warm Intro Check
Uses the `$CTD_API_KEY` and `$CTD_CLIENT_ID` env vars. If `$CTD_API_KEY` is unset, note "No CTD data (key not configured)" and skip this step entirely. Run three CTD calls in sequence:

**Call 1 — Company reachability:**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/company?company_domain={domain}
Headers: ctd-api-key: $CTD_API_KEY, ctd-client-id: $CTD_CLIENT_ID
```
(Include a browser User-Agent header — Cloudflare blocks raw non-browser clients.)
If 404 or no data: note "No CTD data" and skip calls 2 and 3.

**Call 2 — Reachable ICP contacts:**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/people?company_domain={domain}&degree=first&degree=second&target_seniority=VP&target_seniority=Director&target_seniority=CXO&target_seniority=CEO&target_seniority=Founder&target_function=Engineering&target_function=Product&target_function=Information+Technology&page_size=40
```
Filter to only contacts where `ctd_score_label` = "Strong Chance to Connect".

**Call 3 — Strong intro paths:**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/paths?company_domain={domain}&path_relationship_strength=strong&path_relationship_strength=medium&degree=first&degree=second&page_size=40
```
Keep only paths where `path_relationship_strength_label` = "strong".

For each path extract: target name, title, LinkedIn URL; connector name, title, company; relationship context; degree; flag if connector is a You.com employee.

Graceful failure: if any CTD call errors, note it and continue.

### 1E: Sumble Intelligence (parallel with 1A–1D)
Run two Sumble connector calls:

**Call 1 — Organization enrichment** (Sumble connector tool with function name suffix `FindMatchAndEnrichOrganizations`) with the target company domain.

Flag these signals:
- **Competitor tech:** Tavily, Exa, Perplexity, SerpAPI, Bing Search API (displacement opportunity)
- **Legacy scraping:** BeautifulSoup, Scrapy, Selenium (migration opportunity)
- **RAG/LLM stack:** LangChain, LlamaIndex, vLLM, Pinecone, Weaviate, any vector DB (they're building AI agents)
- **Legacy search:** Elasticsearch, Algolia (search modernization angle)
- **Co-sell:** Databricks, Snowflake

**Call 2 — Jobs** (Sumble connector tool with function name suffix `FindMatchAndEnrichJobs`) for the target company. Cap at 5. Filter to roles containing: search, AI, ML, RAG, LLM, data infrastructure, information retrieval, NLP, knowledge.

Graceful failure: if the Sumble connector is not connected or errors, note it and continue.

---

## Step 2: You.com Research API — 5 Parallel Calls (PRIMARY)

Fire all 5 calls simultaneously using the `$YDC_API_KEY` env var.

```bash
curl -s -X POST \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "{query}"}' \
  "${YDC_RESEARCH_ENDPOINT:-https://api.you.com/v1/research}"
```

**Fallback (no `$YDC_API_KEY`, or curl calls fail):** run the same queries through the You.com Search connector tool (`you-search`) plus WebSearch. Note in the brief that research ran in degraded mode. Do not abort.

**Query 1 — AI Products & Integration Surface:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus on: all AI products and features shipped in 2024-2026; third-party APIs, tools, and services they integrate with or recommend; developer ecosystem (SDKs, plugins, marketplaces, open-source tools); any use of retrieval-augmented generation, agentic workflows, LLM grounding with external data, citation systems, or knowledge retrieval; and where an external search or data API could plug into their stack. Include specific product names, launch dates, and engineering blog posts. Cite all sources.
```

**Query 2 — Leadership Vision & Public Statements:**
```
Deep research on the founders, CEO, CTO, and CPO of {COMPANY} ({DOMAIN}). Focus on: their public statements about AI, data infrastructure, real-time data grounding, agent reliability, and search from 2024-2026; interviews, podcasts, conference talks, blog posts, LinkedIn posts, and X/Twitter commentary; specific quotes about where they see the company going; and any stated frustrations with current tools or data quality. Include LinkedIn URLs and Twitter/X handles where available. Cite all sources.
```

**Query 3 — Business Model, Customers & GTM:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus on: how they make money (SaaS, API usage, enterprise contracts, open-source + commercial); named enterprise customers; revenue, ARR, or valuation figures from 2024-2026; pricing model; go-to-market motion (developer-led, sales-led, product-led); target industries; and any analyst or investor commentary on their growth trajectory. Cite all sources.
```

**Query 4 — Recent News & Strategic Trajectory (2024-2026):**
```
Deep research on {COMPANY} ({DOMAIN}). Focus exclusively on news from 2024 and 2026. Cover: product launches, new partnerships and integrations, named customer wins, executive hires and departures, board changes, funding rounds, pricing changes, regulatory events, IPO or M&A signals, and any strategic pivots. Include specific dates and dollar figures. Cite all sources.
```

**Query 5 — Competitive Tool Usage & Data Infrastructure:**
```
Deep research on {COMPANY} ({DOMAIN}). Focus on: what search APIs, web data providers, and AI infrastructure tools they currently use or recommend — look in their documentation, tutorials, GitHub repos, blog posts, and job postings; any mention of Tavily, Exa, Perplexity, Bing Search API, Google Custom Search, SerpAPI, or other search providers; how they source real-time or web data for their products or agents; any signals of dissatisfaction with current search or data providers; and gaps in freshness, accuracy, or coverage mentioned publicly. Cite all sources.
```

**Processing:**
- Extract `output.content` (synthesized answer) and `output.sources` (cited URLs) from each response
- Note any area where the API returned thin results — use Step 3 to fill gaps

---

## Step 3: Supplemental Web Search (gap-fill only)

After Research API calls complete, use WebSearch ONLY to fill specific gaps:
- LinkedIn profiles for key people not surfaced in Query 2 (format: `site:linkedin.com "{name}" "{company}"`)
- Very recent news (last 48 hours) not indexed by Research API
- Specific URLs needed for the brief (careers page, GitHub, engineering blog)
- Query 5 gaps: if competitor tool usage is unclear, search `site:github.com {company}` and `{company} search API documentation`

Do NOT re-run broad queries already covered by the Research API.

---

## Step 4: Generate the Intelligence Brief

Synthesize all findings into the report below. Match the depth and style of the LlamaIndex competitive intelligence brief — approximately 1,200–1,600 words, sourced, analytical, with a clear "so what" in every section.

**Writing rules (always apply):**
- No em dashes. Use commas, periods, colons, or semicolons.
- Plain, direct prose. No buzzwords, no AI-isms (utilize, robust, streamline, delve, embark).
- Short paragraphs (2-3 sentences max).
- Every external claim gets a cited URL inline or in a sources list at the end.
- Sections should read as analysis, not summaries — always end with an implication.

**Source attribution rules (always apply):**
- Every factual claim must be tagged inline with its source in parentheses: `(Source: sumble.com, April 2026)` or `(Source: techcrunch.com/...)`.
- At the top of the Sumble Signals section, include a "What Sumble Found" subsection that presents the raw Sumble data verbatim before interpretation — tech stack signals, job postings, people counts, and data URLs exactly as returned. This is the primary showcase of Sumble's value.
- In every other section, when a finding could have come from Sumble, explicitly note whether it did or did not appear in Sumble's data. Example: "Sumble did not detect LangChain in their stack — this suggests the RAG tooling may be custom-built rather than off-the-shelf."
- The You.com Research API findings must be labeled per section with "(You.com Research API)" to show what web intelligence augments the structured Sumble data.
- The goal: a reader (including a Sumble team member) should be able to see exactly which tool contributed which insight, and understand where Sumble's structured data leaves gaps that real-time web research fills.

---

### Report Template

```
# {COMPANY}: Partnership & BD Intelligence Brief
*{Today's date} | Prepared by {AE_NAME}*

---

## The Hook

[2-3 sentences. What is the single strongest angle to get {COMPANY}'s leadership to engage with You.com? This is the executive TL;DR — if a colleague read only this, they'd know exactly how to open the conversation. Ground it in a specific product direction, leadership quote, or strategic gap. Not generic.]

---

## Search & Data Tool Map

[What search APIs, data providers, and AI infrastructure tools does {COMPANY} currently use or recommend? Who are we potentially displacing? Map the competitive landscape for their specific stack. Use a table if 3+ tools detected:]

| Provider | Where It Appears | Displacement Signal |
|----------|-----------------|---------------------|
| {Tool}   | {docs/tutorials/GitHub} | {High/Medium/Low — why} |

[If no competitor tools detected, note that explicitly and explain what data infrastructure gap exists. Always end with: "The implication for You.com:" + 1 sentence.]

---

## Product & Technical Fit

[Where does You.com fit in their stack? Be specific about which API — Search API, Research API, Contents API, or (for financial services, fintech, banking, and investment prospects) the Finance Research API — and which of their products or features it would power. Don't prescribe the full deal in one paragraph. Lead with the most obvious fit, then name 1-2 supporting angles.]

---

## Business Model & Customers

[How do they make money? Who are their named customers? Developer-led or enterprise-sales-led? Revenue/ARR or valuation if available. What industries do their customers cluster in? Keep to ≤5 sentences — this section is context, not the pitch.]

---

## Leadership Vision

[Key founder/CEO/CTO public statements that align with You.com's pitch. Pull direct quotes where possible. Format:]

**{Name}, {Title}** ({Source URL}, {Date}):
*"{Quote}"*

[1-2 sentences connecting their stated vision to the You.com pitch — without naming You.com explicitly. The connection should be self-evident.]

[Include 2-4 quotes across key leaders. If no direct quotes found, summarize their public positions with citations.]

---

## Recent Launches & Strategic Signals

[Last 12 months of product launches, partnerships, funding, and key hires — and what each signals about their roadmap. Use a compact list:]

- **{Month Year} — {Launch/Event}:** {1-sentence implication for You.com relevance}
- ...

[End with a 1-sentence read on their overall trajectory.]

---

## Engagement Playbook

[3-5 concrete bullets on how to hook their leadership and what to propose. Each bullet should be actionable — not "build a relationship" but "lead with the Research API given their Deep Research template launch in May 2025." Ground each in evidence from earlier sections.]

1. **{Angle}:** {Specific hook and why it works for this company}
2. ...

---

## Key People

[Table of key contacts to engage. Pull LinkedIn URLs from Research API output and WebSearch. Always include founder(s), CTO/VP Eng, head of AI/ML or Product, and DevRel lead if one exists.]

| Name | Title | LinkedIn | Why Engage |
|------|-------|----------|------------|
| {Name} | {Title} | {URL or "not found"} | {1-sentence relevance} |

---

## Warm Intro Paths (CTD)

CTD Company Score: {Strong / Familiar / Weak / No data}
Strong Intro Paths Found: {N}

| Target | Title | Connector | Connector Co | Degree | YDC Employee? |
|--------|-------|-----------|--------------|--------|---------------|
| {Name} | {Title} | {Name} | {Co} | 1st/2nd | Yes/No |

{If no paths found: "No warm intro paths found via CTD."}

---

## CRM Status (Salesforce)

{3-5 lines: account existence, open/closed opps, last activity, contacts already in SF, any Databricks co-sell signal. If no SF record: "No Salesforce record found — net-new account."}

---

## Sumble Intelligence

*This section presents Sumble data first as-found, then interpreted. Intended to be shareable with Sumble as a demonstration of the tool in a real sales workflow.*

### What Sumble Found (raw signals)

**Organization enrichment** (sumble.com — {date}):
- Technologies detected: {list every technology Sumble returned, with job counts and people counts}
- Source data URL: {sumble_source_data_url}
- Credits used: {N}

**Job postings** (sumble.com — {date}):
| Job Title | Posted | Key Signal from Description |
|-----------|--------|-----------------------------|
| {title} | {date} | {signal} |
{If no jobs found: "No matching job postings returned by Sumble."}

### Interpretation

**Competitor tech detected:** {Yes — [list with Sumble source links] / No}
**RAG/LLM stack detected:** {Yes — [list] / No}
**Legacy scraping stack detected:** {Yes — [list] / No}
**Co-sell signals:** {Databricks / Snowflake / None}

**What Sumble answers, and what it doesn't:**
- Sumble confirmed: {1-2 things Sumble's structured data made clear}
- Sumble gap: {1-2 things that required You.com Research API or WebSearch to fill — e.g., "Sumble showed no web search API in their stack, but You.com Research API found Perplexity referenced in their GitHub docs"}

**Outreach hook implications:**
- {1-3 bullets grounded in the Sumble signals above}

---

## How the Research Stack Worked Together

*A brief note on what each source contributed — useful context for sharing this document.*

| Source | What It Found | What It Couldn't Answer |
|--------|--------------|-------------------------|
| Sumble | {tech stack, hiring signals, org data} | {e.g., real-time news, leadership quotes, recent partnerships} |
| You.com Research API | {web intelligence: news, strategy, leadership vision} | {e.g., internal tech stack not visible on public web} |
| You.com Search API | {gap-fill: LinkedIn profiles, recent news, GitHub} | {structured data} |
| CTD | {warm intro paths and network reachability} | {tech and product context} |
| Salesforce | {CRM history, prior engagement} | {external company intelligence} |
| Slack | {informal internal context} | {structured external data} |

---

*All sources cited inline throughout. Full source list:*
*[list of all cited URLs from Research API and WebSearch, organized by section]*
```

---

## Step 5: Create Native Google Doc & Return Link

1. Search for the `accountplans` folder using the Google Drive connector tool `search_files` with query `name = 'accountplans' and mimeType = 'application/vnd.google-apps.folder'`. Use the returned folder ID as `parentId`. If the search fails, fall back to `GDRIVE_FOLDER_ID` from the env var table above.

2. Call the Google Drive connector tool `create_file`:
   - `title`: `"{COMPANY} - Partnership Brief - {YYYY-MM-DD}"`
   - `mimeType`: `"text/plain"` (auto-converts to Google Doc)
   - `content`: the full report text (base64-encoded if required by the tool)
   - `parentId`: the folder ID from step 1

3. The tool returns a file object. Construct the Google Doc URL:
   `https://docs.google.com/document/d/{file.id}/edit`

4. Output to the user:
```
Brief complete. Google Doc: https://docs.google.com/document/d/{file.id}/edit

[Paste the full report text below so the user can read it inline]
```

**Fallback if Drive creation fails:** there is no rclone in the cloud environment. Note the failure clearly, print the full report inline in chat so nothing is lost, and continue. Do not abort.

---

## Graceful Failure Rules

- Salesforce failure: note "SF unavailable" and continue
- CTD failure or `$CTD_API_KEY` unset: note "CTD unavailable" and continue
- Sumble failure or connector not connected: note "Sumble unavailable" and continue
- `$YDC_API_KEY` unset or Research API thin results on any area: degrade to the You.com Search connector + WebSearch, flag the gap, continue
- Drive creation failure: note it and print the brief inline (no rclone fallback in cloud)
- Never block the report on any single data source failure

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-17 | Cloud port created from skills/ydc-quick-research | Migration to Claude Code Routines: keys moved from ae-config.md to env vars ($YDC_API_KEY, $CTD_API_KEY, $CTD_CLIENT_ID), connector tools located by function-name suffix, rclone + /tmp fallback removed (Drive connector is the only write path, soft-fail inline on error), You.com Search connector fallback added for missing API key, explicit write boundary added |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added Sumble intelligence section (Step 1E) with raw signals + interpretation format | Sumble tech stack data was being referenced informally; standardized format shows what Sumble found vs. what other sources added |
| (prior) | Added "How the Research Stack Worked Together" section to report | Designed to be shareable with Sumble team to demonstrate the tool's value in a live workflow |
| (prior) | Added CTD warm intro check (Step 1D) | Warm intro paths are high-value; quick research brief needed the same CTD signal as the full pipeline |
| (prior) | Added Salesforce check (Step 1B) as parallel pre-flight | Partner/BD briefs benefit from CRM context before research synthesis |
