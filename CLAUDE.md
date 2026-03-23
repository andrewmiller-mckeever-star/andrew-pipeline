# You.com Sales Knowledge Base

Always-on context for Ryan Reed, API Sales at You.com. This loads every conversation regardless of task.

## Skill Architecture

| Layer | What | When it loads |
|-------|------|--------------|
| CLAUDE.md | Sales knowledge base (YDC, products, writing rules, competitive intel) | Every conversation |
| 6 YDC pipeline skills | Pipeline procedures (research, account plan, outreach, prospects, Apollo build) | When triggered by pipeline commands |
| Office skills | Doc/deck/spreadsheet/PDF creation | When you mention a file type |
| Memory files | Accumulated learnings, feedback, product knowledge | Referenced by skills as needed |

**Pipeline skills:** ydc-pipeline (orchestrator), ydc-research (Step 1), ydc-account-plan (Step 2), ydc-prospects (Step 3), ydc-outreach (Step 4), ydc-apollo-build (Steps 5+6).

---

## Who We Are

You.com delivers the search infrastructure that powers modern Generative AI. We enable organizations to ground their AI agents in factual, cited, and trustworthy data sources. $100M Series C at $1.5B valuation. 1B+ queries/month. 5,000+ API customers. 57% Fortune 500 penetration.

**Founded by:**
- **Dr. Richard Socher (CEO):** 4th most cited AI researcher in the world. Former Chief Scientist & EVP at Salesforce. Stanford professor. Pioneered deep learning + NLP with Nvidia GPUs (2014). Revolutionized NLP and search with contextualized word vectors.
- **Bryan McCann (CTO):** Former Lead AI Researcher at Salesforce. Co-invented prompt engineering in 2018. First LLM fully connected to the web. **INTERNAL CONTEXT ONLY. Never reference Bryan in prospect-facing output.** Only use Socher for founder credibility.

**Messaging guidance for Socher:**
- For CTO/VP Engineering: lead with research credentials and Stanford background
- For executives: "founded by the 4th most cited AI researcher in the world, former Chief Scientist at Salesforce"
- Vary placement: sometimes opener, sometimes mid-email "quick context on us," sometimes PS
- Do NOT offer unsolicited meetings with Socher. Reference his background as company/product credibility.

---

## What We Sell (Priority Order)

1. **Search API (APEX tier):** Primary lead in all outreach. High-accuracy retrieval for agents and LLMs. Long, rich snippets. Real-time freshness. One API, all of the data. Enterprise reliability with unified billing.
2. **Vertical Index (aka Custom Index):** Domain-specific, real-time knowledge with citations. Purpose-built indexes by industry (retail, media, hospitality, finance, legal). Combines public web, partner data, and structured sources. Same product, different name. Supporting angle that shows depth.
3. **PRAG (Private RAG):** Enterprise knowledge base grounding. Secure private knowledge engine over enterprise documents. Zero data retention. Audit-ready compliance.
4. **MCP Server:** Zero-setup web search for AI agents (no API key, no signup for prototyping). 100 free searches/day. Good hook for technical personas.
5. **AI Factory-As-A-Service:** Only mention when the account clearly lacks internal AI/engineering capacity. Not a default talking point.

**Product tiers:** APEX (Search API), E2E (end-to-end solutions), PRAG (publisher RAG), AI Factory.
**Never reference in prospect-facing output:** ESL, Chat, Apex products.

**The calibration:** Search API always leads. Vertical Index and PRAG add depth and optionality when account research signals the need. The goal: come across as a serious infrastructure company with range, not prescribe the biggest possible deal in the first email.

---

## How We Sell (Pitch Framework)

**Lead with the problem:** General web indexes were built for human browsing, not machine reasoning. 95% of GenAI pilots fail due to inadequate data infrastructure, not inadequate models.

**Position You.com as:** AI Search Infrastructure built for the AI era. Accurate, in-depth, customizable, real-time, contextual, action-oriented.

**Tech evaluation process:** Joint eval (they have golden set) or Full Custom eval (we build golden set together). 5-step process: scoping > golden set > data requirements > testing > results readout.

**Benchmark angles:** Higher accuracy with lower latency than competition (SimpleQA, FreshQA, MS Marco benchmarks).

**Sales Deck:** ~/Downloads/You.com - AI Search Infra Pitch Deck - January 2026.pdf (pitch bible for framing, case studies, competitive positioning, eval process, "Art of the Possible" industry use cases).

---

## Named Case Studies (Safe for Outreach)

- **DuckDuckGo:** Replaced legacy search API. 2x faster. 10M+ daily queries.
- **Windsurf:** Replaced legacy search for coding agent documentation.
- **Harvey:** Chose You.com over incumbent search API providers for legal search.
- **Databricks:** Unity Catalog integration.

NOTE: Do not name competitors in outreach. Use "legacy search API," "incumbent providers," etc.

---

## Competitive Positioning (Internal Only)

Never name competitors in prospect-facing outreach, emails, LinkedIn, or prospect-facing docs. Use: "other search API providers," "search API incumbents," "legacy search APIs." Exception: internal account plans, Slack, battlecards, live conversations where the prospect names a competitor first.

- **vs. Exa:** Developer-friendly but less enterprise-grade. We have lower barrier to entry via MCP + stronger conversion funnel.
- **vs. Tavily:** Agentic search API competitor. We outperformed in unbiased third-party benchmarks.
- **vs. Perplexity API:** Strong brand in consumer AI search, less focused on enterprise API grounding.
- **vs. Google Vertex AI Search:** Heavier, more complex to integrate. We're purpose-built for AI agents.
- **vs. Bing API:** Being deprecated/limited. Multiple customers migrated from Bing to us (DuckDuckGo, Harvey, Windsurf).
- **vs. Internal build:** Biggest risk for well-resourced engineering teams. Counter with time-to-value and research advantage.

---

## Social Proof (Internal Only, Never in Outreach)

- A Big 4 consulting firm ran a competitive evaluation. We outperformed on accuracy, relevance, and cost.
- They are evaluating You.com as replacement search layer for their internal RAG assistants.
- NEVER reference this eval in any form in outreach, even anonymized. No query counts, no "head-to-head" language, no anonymized details that could narrow down the customer.
- NEVER name any active evaluation or confidential customer in prospect-facing materials.

**What to use instead:** Generic traction stats (1B+ queries, 5K+ customers, 57% F500) and named public case studies (DuckDuckGo, Windsurf, Harvey, Databricks).

---

## Outreach Guardrails (Always Apply)

These rules apply to ALL prospect-facing writing: emails, LinkedIn, docs, follow-ups, sequences.

**Hard bans:**
- No em dashes. Use commas, periods, colons, semicolons, or pipes.
- No competitor names in outreach.
- No specific eval references (even anonymized).
- No confidential customer names or active evaluations.
- No ESL/Chat/Apex product references.
- No Bryan McCann in prospect-facing copy.
- No markdown formatting in email bodies (no bold, italic, headers, numbered lists). Plain text only.
- No corporate suffixes ("Teradata" not "Teradata Corporation").

**Banned AI-ism vocabulary:** utilize (use "use"), comprehensive, enhance (use "improve"), delve, embark, robust, streamline, strong signal. These instantly flag copy as AI-generated.

**Banned openers:**
- "I hope this email finds you well"
- "I'm reaching out because..."
- "I wanted to introduce myself"
- "I noticed you work at [Company]"
- "Congrats on your role" (without specifics)
- "I'd love to pick your brain"
- "Just circling back"
- "Per my last email"

**Banned patterns:**
- Feature dumps (3+ capabilities in one paragraph)
- Multiple value props in one email (one proof point per touch)
- Stacking CTAs (never ask for more than one thing)
- Self-centered openers (first sentence starts with "I," "We," "Our," or "At You.com")
- Fake personalization ("Your company is doing impressive work")
- Rhetorical question openers ("What if you could...")
- Buzzword soup (synergy, leverage, paradigm shift, best-in-class, cutting-edge, game-changer, revolutionary)
- AI glazing: referencing a prospect's initiative just to compliment it without connecting to a problem we solve. State what they did, tie it to relevance. Never compliment dead-ends ("strong signal," "that's rare," "impressive achievement," "no small feat").

---

## Email Writing Structure (AIDA)

Every outreach email must follow this structure:

```
SUBJECT: [Personalized, under 50 chars, references company or initiative] (Touch 1 only)

Hi {{first_name}},

[A - Attention: Personal hook from research. 1-2 sentences. Specific to them, not generic. Start with THEM.]

[I - Interest: Their problem/opportunity as a hypothesis. 1-2 sentences. Tentative language: "usually when teams do X, they tend to hit Y." Never diagnose pain as fact.]

[D - Desire: One proof point. Case study, benchmark, or founder credibility. Never more than one.]

[A - Action: Interest-based CTA only. One ask. Never time-based ("15 minutes," "quick call this week"). Use: "Is this something you're evaluating?" / "Worth a conversation?" / "Are you open to exploring this?"]
```

**Word counts:** Opener 100-150 words. Follow-up 80-120 words. Breakup 80-120 words.
**Reading level:** 5th-7th grade. Short, punchy sentences. No compound-complex structures.
**Paragraphs:** 2-3 sentences max. White space makes emails scannable.
**Greeting:** Every email opens with "Hi {{first_name}}," on its own line.

**Hook prioritization (use highest available):**
1. Trigger event (funding, product launch, leadership change, earnings)
2. Their content (blog post, podcast, conference talk, LinkedIn post)
3. Mutual connection or shared context
4. Company initiative (AI program, hiring surge, strategic pivot)
5. Role-based pain point (last resort)

---

## LinkedIn Connect Rules

Zero pitch. Zero CTA. Zero generic flattery. Under 250 characters. Almost entirely about them.

**Formula: Recognition + Curiosity Hook + Connect**
- Recognition: One specific detail about their company or initiative
- Curiosity Hook: A genuine question about a problem they face. Optionally add a light domain signal in parentheses: "(be it with a web index or otherwise)"
- Connect: "Would be great to connect"

**Hard bans for LinkedIn notes:**
- No product names (Search API, PRAG, Vertical Index, etc.)
- No CTA for meeting, call, or demo
- No "impressive" or "incredible" or any generic flattery
- No starting with "I" or "We" or "At You.com"
- No role claims ("I lead X," "I'm the VP of Y")
- No compressed pitch

Your LinkedIn profile handles identity. The email sequence carries the pitch. The connection note just opens the door.

---

## Key Resources

| Resource | Location |
|----------|----------|
| Sales Deck | ~/Downloads/You.com - AI Search Infra Pitch Deck - January 2026.pdf |
| Product Knowledge | ~/.claude/projects/-Users-ryan-Desktop-YDC-Pipeline/memory/product-knowledge.md |
| Memory Files | ~/.claude/projects/-Users-ryan-Desktop-YDC-Pipeline/memory/ |
| Pipeline Skills | ~/.claude/skills/ydc-pipeline/, ydc-research/, ydc-account-plan/, ydc-outreach/, ydc-prospects/, ydc-apollo-build/ |
| Office Skills | ~/.claude/skills/claude-office-skills/ |
| Apollo Sequence Builder | ~/Desktop/YDC Pipeline/apollo-sequence-builder/ |
| Google Drive Folder | "Account Plans, Lists & Personalized Sequences/" (via rclone, remote: gdrive) |

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
