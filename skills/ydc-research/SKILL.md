---
name: ydc-research
description: Deep company research for You.com whale account pipeline. Checks Google Drive folder "Account Plans, Lists & Personalized Sequences/" for existing deliverables, searches Slack channels (#api-gtm-team, #sales-team, #esl-api-sales, #competition, #enterprise-solutions) for prior context, then ingests user-provided ARI deep research PDF as primary web research source. Use when user says "research [company]", "company overview for [company]", "check drive and slack for [company]", "Step 1", or at the start of any pipeline run before generating an account plan.
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
9. Slack Context: internal relationship history and prior outreach

## Research Order

### Step 1: Check Google Drive (Haiku subagent)
Search "Account Plans, Lists & Personalized Sequences/" for any existing deliverables for this account. If prior work exists, build on it - do not start from scratch.

### Step 2: Search Slack (Sonnet subagent, run in parallel with Drive check)
Search these channels for account name mentions: #api-gtm-team, #sales-team, #esl-api-sales, #competition, #enterprise-solutions, #marketing, #product
Capture: prior outreach, deal notes, relationship context, competitive mentions.

### Step 3: ARI Deep Research PDF (PRIMARY — user-provided)

The user provides a You.com ARI deep research PDF at the start of the pipeline. This is the primary web research source, replacing both Perplexity Deep Research and Brave/WebSearch for broad research.

**What ARI provides:** 10-12 page synthesized research report with numbered citations, covering AI initiatives, leadership, competitive pressures, recent news, and (when prompted) data/search infrastructure. Typically 85+ footnoted source URLs.

**Benchmark (2026-03-19, PANW):** ARI scored 37/40 vs Perplexity 36/40 (Teradata). Stronger on financial depth (competitor revenue sizing, margin breakdowns, quarterly EPS). Higher citation density. Pre-formatted PDF with TOC. Zero compute cost vs 15+ CDP commands for Perplexity.

**How to ingest:** Read the PDF using the Read tool with pages parameter. Extract all research facts, citations, and source URLs. Organize into the 9 collection areas above.

**If no PDF provided:** Ask the user to generate one. Provide the ARI query template (see below) for them to paste into You.com ARI.

### Step 4: Supplemental Brave/WebSearch (Opus main thread, only if needed)
After ARI PDF is ingested, use Brave/WebSearch ONLY to fill specific gaps:
- LinkedIn org chart signals (job postings, team structure)
- Very recent news (last 48 hours) that ARI may not have indexed
- Specific URLs the account plan needs (careers page, engineering blog, specific press release)
- Area 5 (data/search infrastructure) if not covered in ARI output

Do NOT re-run broad research queries that ARI already covered.

### Step 5: YDC PAL Skill
Use the ydc-cai-pal skill to pull You.com product/solutions information relevant to the account's industry.

## ARI Deep Research Query Template

Provide this to the user if they need to generate the ARI PDF:

```
Deep research on [COMPANY] ([TICKER if public]). Cover 5 areas with specific facts, names, dates, dollar figures, and source URLs.

Area 1 - AI INITIATIVES: [seed with known AI products/programs]. Include any use of retrieval-augmented generation (RAG), agentic AI workflows, AI assistants or copilots that pull external data, LLM grounding with web or real-time sources, citation verification, knowledge management platforms, or search infrastructure powering AI features.

Area 2 - LEADERSHIP: Key executives (CPO, CDAO, CTO, COO, CRO, CISO), recent leadership changes and departures, critical open roles, who makes technology infrastructure decisions.

Area 3 - COMPETITIVE PRESSURES: Revenue trends, headcount changes, cloud migration progress, competition from [seed known competitors], activist investor activity, financial position.

Area 4 - RECENT NEWS 2025-2026: Product launches, partnerships, settlements, board changes, new hires.

Area 5 - DATA & SEARCH INFRASTRUCTURE: How does the company currently source, index, or retrieve external content for its products or internal tools? Any public mentions of web scraping, search APIs, content aggregation, news feeds, real-time data pipelines, or third-party data providers powering AI or product features. Any gaps in data freshness, accuracy, or coverage mentioned in engineering blogs, job postings, or analyst reports.
```

**Query customization rules:**
- Seed Area 1 with known AI products/programs specific to the company
- Seed Area 3 with known competitors in their market
- Area 5 is the You.com-relevant dimension — surfaces search/data infrastructure signals
- Keep query under 1000 characters total

## Research Sources (Priority Order)

1. Google Drive (existing deliverables)
2. Slack (internal relationship context)
3. ARI deep research PDF (primary web research — covers areas 1-8 in one pass)
4. Brave/WebSearch (supplemental gap-filling only)
5. LinkedIn (org chart, leadership via Apollo)
6. YDC PAL skill (You.com product mapping)
7. Sales deck: ~/Downloads/You.com - AI Search Infra Pitch Deck - January 2026.pdf

## Output

Synthesize findings into structured research notes covering all 9 areas above. Flag any gaps where information was not publicly available. Note any Slack context that should inform the account plan. This output feeds directly into ydc-account-plan.

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

## Legacy: Perplexity CDP Playbook (Deprecated 2026-03-19)

Perplexity Deep Research via Chrome CDP was the previous primary research tool. Replaced by user-provided ARI PDF for simplicity and zero compute cost. The CDP playbook is retained in memory/perplexity-cdp.md for reference if ever needed as a fallback, but should not be used in normal pipeline runs.
