# YDC Pipeline: Global Rules Reference

## Global Preferences (Apply to ALL Outputs)

- **Be concise.** All outputs (account plans, outreach sequences, prospect lists) should be tight and actionable. Avoid filler, redundant context, or over-explanation. Say more with less.
- NEVER use em dashes in any output. Use commas, periods, colons, semicolons, or pipes instead.
- **Product focus: Search API is the primary lead.** All outreach should position Search API as the entry point (AI search infrastructure / grounding layer for agents and LLMs). Vertical Index (aka Custom Index; same product, domain-specific or custom-built search indexes) and PRAG are supporting angles that show product depth when the account warrants it. Having these in the conversation shows we're not just a crawl API, but don't prescribe them in cold outreach; let them emerge when account research signals the need. Do NOT prescribe E2E solutions or complex multi-product stacks in cold outreach. De-emphasize AI Factory-As-A-Service (mention only when the account clearly lacks internal AI/engineering capacity). Do NOT reference ESL, Chat, or Apex products in any prospect-facing output.
- Product tiers for reference: APEX (Search API), E2E (end-to-end solutions), PRAG (publisher RAG), and AI Factory-As-A-Service. Outreach should always lead with Search API, with Vertical Index and PRAG as supporting depth.
- **The nuance**: Search API, Vertical Index, and PRAG are all valid outreach angles. The calibration is: Search API always leads, Vertical Index and PRAG add depth and optionality when the account signals it. The goal is to come across as a serious infrastructure company with range, not to prescribe the biggest possible deal in the first email.
- Lean heavily on founder credibility messaging in all outreach (see Founder Credibility Toolkit below).
- Prospect filtering: VP and Director level primarily. 1-2 manager-level contacts acceptable per sequence only when VP/Director options are exhausted. Prioritize Engineering, AI/ML, Product, Strategy, Developer Relations, and Security/Compliance departments.
- **Contact cap per sequence: 5 contacts per ICP sequence (A, B, C, D). No duplicates across sequences.** Each contact appears in exactly one sequence. If more than 5 qualified prospects exist for a sequence, select the 5 highest-priority based on: (1) title relevance, (2) verified email availability, (3) direct use case alignment. Drop prospects without verified emails first.
- **Seniority prioritization:** Seq B (Executive Sponsor) prioritizes C-suite first, then remaining VPs. For Seq A, C, and D: prioritize remaining VPs first, then Director level. 1-2 manager-level contacts are acceptable only as a last resort when VP and Director options are exhausted.
- All documents should use clean, professional formatting with Arial font.
- Account plans follow the exact template structure defined in ydc-account-plan/references/account-plan-template.md. Do not deviate from the section order or omit sections.
- Outreach sequences are generated in-memory and injected directly into Apollo.io via browser automation. Every sequence uses a standardized 5-touch structure: Email > LinkedIn Connect > Email (reply) > Call > Email (reply/breakup).
- **Always check Google Drive and Slack for prior account context before starting any pipeline run.** Search Drive folder "Account Plans, Lists & Personalized Sequences/" for existing deliverables. Search Slack channels (#api-gtm-team, #sales-team, #esl-api-sales, #competition, #enterprise-solutions) for any mentions, prior outreach, deal notes, or relationship context for the target account. This context should inform and be referenced in the account plan.
- Always use the YDC PAL skill when available to pull You.com product/solutions information relevant to the target account's industry and use cases.
- **Reference the You.com Sales Deck** (located at ~/Downloads/You.com - AI Search Infra Pitch Deck - January 2026.pdf) for pitch framing, value propositions, competitive positioning, customer case studies, and the tech evaluation process. This deck defines how we sell: lead with the problem (shallow search / AI blind spot), position Search API + Vertical Index as the solution, and use the DuckDuckGo/Windsurf/Harvey case studies as proof points. The deck's "Art of the Possible" use cases by industry should inform account plan Solution Mapping.
- **Do NOT reference active evaluations or in-progress customer engagements in any prospect-facing output.** Confidential customer evaluations (e.g., KPMG) must never appear in outreach emails, LinkedIn messages, or any externally shared documents. These are internal context only.
- **No specific evaluation references in outreach.** Never reference any specific customer evaluation, benchmarking exercise, or competitive bake-off in prospect-facing outreach, even when anonymized. This includes phrases like "a Big 4 firm evaluated us across 500 production queries" or any anonymized reference with enough detail to narrow down the customer. Instead, use generic proof of traction: "We serve 1B+ queries monthly across 5,000+ API customers," "57% Fortune 500 penetration," or named public case studies (DuckDuckGo, Windsurf, Harvey, Databricks).
- **No competitor names in prospect-facing outreach.** Never name specific competitors (Exa, Tavily, Perplexity API, Google Vertex AI Search, Bing API, etc.) in outreach emails, LinkedIn messages, or prospect-facing documents. Use generic framing: "other search API providers," "search API incumbents," "legacy search APIs." Exception: competitor names are allowed in internal account plans, Slack, battlecards, and live conversations where the prospect names a competitor first.
- **CS Team Site content is internal-only.** The file `product-knowledge.md` contains distilled, outreach-safe product knowledge extracted from the CS Team Site. NEVER reference the CS Team Site, link to it, or reproduce internal processes, team names, pricing, customer names (beyond approved public case studies), or delivery methodology details in any prospect-facing output. Use `product-knowledge.md` as context to write more technically credible copy, not as content to copy verbatim.

---

## Founder Credibility Toolkit

Use these proof points naturally throughout outreach sequences. Vary placement (opener vs. follow-up vs. PS line) across contacts at the same company to avoid sounding templated.

**Dr. Richard Socher (CEO & Co-Founder):**
- 4th most cited AI researcher in the world
- Former Chief Scientist & EVP at Salesforce
- Stanford professor
- Pioneered deep learning + NLP with Nvidia GPUs (2014)
- Revolutionized NLP and search with contextualized word vectors

**Bryan McCann (CTO & Co-Founder):** (Internal context only. Do NOT reference Bryan in prospect-facing outreach. Use Richard Socher for all founder credibility messaging.)
- Former Lead AI Researcher at Salesforce
- Co-invented prompt engineering in 2018, the technique that powers every LLM interaction today (source: https://medium.com/@xitvali/the-hidden-history-of-prompt-engineering-f7415e1b70f7)
- First LLM fully connected to the web for real-time knowledge

**Together / Company:**
- First to incorporate GenAI in search (patent pending)
- 1B+ queries served monthly
- 5,000+ API customers to date
- 57% Fortune 500 penetration
- $100M Series C at $1.5B valuation
- Enterprise-grade scale and reliability

**Social Proof (Internal Context Only, Do NOT Reference in Outreach):**
- A Big 4 consulting firm ran a competitive evaluation. You.com outperformed on accuracy, relevance, and cost. (INTERNAL ONLY: never reference this eval in any form in outreach, even anonymized with specific details like query counts or competitor names.)
- This firm is evaluating You.com as replacement search layer for their internal RAG assistants (thought leadership, competitive intel, audit/advisory support)
- NOTE: Never name this customer or any active evaluation in prospect-facing materials. Do not reference any specific eval details (query counts, domains tested, competitors evaluated) even in anonymized form.

**Messaging Guidance:**
- Do not reference Bryan McCann in emails, LinkedIn notes, or any prospect-facing copy. Bryan's background is internal context only.
- "4th most cited AI researcher in the world" grabs attention, especially with technical buyers
- For CTO/VP Engineering targets, lead with Socher's research credentials and Stanford background
- For executives, frame it as "founded by the 4th most cited AI researcher in the world, former Chief Scientist at Salesforce"
- If referencing the prompt engineering invention in internal docs, cite source: https://medium.com/@xitvali/the-hidden-history-of-prompt-engineering-f7415e1b70f7
- Do NOT offer unsolicited meetings with Dr. Socher. Instead, reference his background as credibility for the company and product.
- Vary how the founder credibility is introduced: sometimes in the opening line, sometimes as a "quick context on us" mid-email, sometimes as a PS

---

## You.com Value Narrative

Embed this throughout account plans and outreach. This is the core strategic positioning.

You.com delivers the search infrastructure that powers modern Generative AI, enabling organizations to ground their AI agents in factual, cited, and trustworthy data sources. For any company pursuing AI initiatives (whether building internal agents, enhancing customer-facing experiences, or improving employee productivity) You.com's Search APIs provide the essential foundation layer needed to generate reliable, high-accuracy outputs.

By integrating You.com's Search APIs, customers ensure their agents operate on fresh, authoritative, and contextually relevant information, dramatically reducing hallucinations and improving decision quality, transparency, and user trust. These APIs act as modular building blocks that support everything from simple retrieval tasks to complex multi-step agentic workflows.

**Key Product Capabilities to Reference (in priority order):**
- Search API: High-accuracy retrieval for agents and LLMs. Long, rich snippets. Real-time freshness. One API, all of the data. Enterprise reliability with robust uptime and unified billing.
- Vertical Specific Index: Domain-specific, real-time knowledge with citations. Purpose-built indexes by industry (retail, media, hospitality, finance, legal, etc.). Combines public web, partner data, and structured sources.
- Private RAG (PRAG): Enterprise knowledge base grounding. Secure private knowledge engine over enterprise documents with zero data retention and audit-ready compliance.
- Custom Index: Tailored search indexes for specific use cases
- MCP Server Integration: Zero-setup web search for AI agents (no API key, no signup for prototyping). 100 free searches/day.
- AI Factory-As-A-Service: Only mention when the account clearly lacks internal AI/engineering capacity. Not a default talking point.

**Sales Pitch Framework (from Sales Deck):**
- Lead with the problem: General web indexes were built for human browsing, not machine reasoning. 95% of GenAI pilots fail due to inadequate data infrastructure, not inadequate models.
- Position You.com as: AI Search Infrastructure built for the AI era. Accurate, in-depth, customizable, real-time, contextual, action-oriented.
- Tech evaluation process: Joint eval (they have golden set) or Full Custom eval (we build golden set together). 5-step process: scoping > golden set > data requirements > testing > results readout.
- Key case studies for outreach: DuckDuckGo (replaced legacy search API, 2x faster, 10M+ daily queries), Windsurf (replaced legacy search for coding agent documentation), Harvey (chose You.com over incumbent search API providers for legal search), Databricks (Unity Catalog integration). NOTE: Do not name competitors in prospect-facing outreach. Use "legacy search API," "incumbent providers," etc.
- Benchmark angles: Higher accuracy with lower latency than competition (SimpleQA, FreshQA, MS Marco benchmarks).

**Competitive Positioning:**
- vs. Exa: Developer-friendly but less enterprise-grade. You.com has lower barrier to entry via MCP + stronger conversion funnel.
- vs. Tavily: Agentic search API competitor. You.com outperformed in unbiased third-party benchmarks.
- vs. Perplexity API: Strong brand in consumer AI search, but less focused on enterprise API grounding use cases.
- vs. Google Vertex AI Search: Heavier, more complex to integrate. You.com is purpose-built for AI agents.
- vs. Bing API: Being deprecated/limited. Multiple customers have migrated from Bing to You.com (DuckDuckGo, Harvey, Windsurf).
- vs. Internal build: Biggest risk for well-resourced engineering teams. Counter with time-to-value and research advantage.

---

## Document Formatting Standards

All .docx outputs should follow these formatting rules:

- **Font:** Arial throughout
- **Title page:** Company name + document type + date + "Prepared by You.com Sales Team"
- **Header:** "CONFIDENTIAL | You.com {Document Type}" (right-aligned, gray, italic)
- **Footer:** Page numbers (centered, gray)
- **Section headings:** Bold, blue (#1A5276), 14pt
- **Sub-headings:** Bold, blue (#1A5276), 12pt
- **Body text:** 10pt
- **Tables:** Blue header rows (#1A5276 background, white text), light gray alternating rows
- **AE-only fields:** Gray underscored blanks
- **Hypothesized fields:** Italic with "(To Be Validated by AE)" suffix
- **Strategy/internal notes in sequences:** Red italic text, not included in actual outreach copy
