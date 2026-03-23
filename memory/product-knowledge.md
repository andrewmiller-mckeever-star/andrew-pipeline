# You.com Product Knowledge (Internal Reference)

Source: CS Team Site (internal-only). NEVER reference, link to, or quote this site in any prospect-facing output. This file contains distilled, outreach-safe product understanding only.

---

## OUTREACH FOCUS GUARDRAIL (Read First)

**The pipeline targets Search API deals.** All outreach should lead with Search API as the entry point. Vertical Index, PRAG, and Custom Agents are relevant ONLY when they naturally extend from a Search API conversation or when account research clearly signals those needs. Do NOT prescribe E2E solutions, AI Factory engagements, or complex multi-product stacks in cold outreach.

**Framing hierarchy for outreach:**
1. **Always lead with**: Search API as AI search infrastructure (grounding layer for agents/LLMs)
2. **Mention when relevant to the account**: Vertical Index (if they need industry-specific data), PRAG (if they have clear private knowledge base needs)
3. **Background context only (don't lead with)**: Custom AI Agents, Agent API, Web Scraping/Web Index. These are post-conversation topics that emerge during discovery, not outreach openers
4. **Rarely mention**: AI Factory. Only if the account clearly lacks internal AI/engineering capacity

The deeper product knowledge below (industry patterns, deployment combinations, post-sale delivery) exists to make outreach copy more informed and credible. It is NOT a menu to prescribe from. Use it to understand the prospect's world better, not to pitch a bigger deal in the first email.

---

## Product Capabilities (Outreach-Safe)

### Core Product Portfolio

**Search API (Primary Focus)**
- High-accuracy retrieval layer purpose-built for AI agents and LLMs
- Long, rich snippets with real-time freshness and citations
- Single API endpoint covers all web data. Enterprise reliability with robust uptime and unified billing
- Designed for machine reasoning, not human browsing. General web indexes were built for browsers; You.com indexes for AI systems

**Vertical Index / Custom Index (Supporting Angle, Same Product)**
- Domain-specific, real-time knowledge with citations
- Purpose-built indexes by industry: retail, media, hospitality, finance, legal, etc.
- Combines public web data, partner data, and structured sources into a single searchable index
- Also supports structured databases as a data source (not just unstructured documents)
- Enables highly targeted retrieval for industry-specific AI use cases (e.g., competitive pricing in retail, regulatory updates in finance, case law in legal)
- Key differentiator: signals that You.com is not just a crawl API but builds custom, domain-specific search infrastructure

**Private RAG / PRAG (Supporting Angle)**
- Enterprise knowledge base grounding over private documents
- Secure private knowledge engine with zero data retention and audit-ready compliance
- Deployed as a managed retrieval layer over customer-owned data (PDFs, internal docs, knowledge bases)
- Powers custom AI agents that answer questions grounded in an organization's proprietary information
- Common deployment pattern: PRAG + Custom AI Agent accessed via the customer's own UI or CMS

**Custom AI Agent / Agent API**
- You.com provides both the retrieval infrastructure and the agent orchestration layer
- Custom agents can be built on top of Search API, PRAG, or Custom Index
- Agents are deployed via You.com's platform or integrated into the customer's existing UI/application
- Agent API enables programmatic agent creation and management

**Web Scraping / Web Index**
- Custom web scraping capabilities to build vertical-specific web indexes
- Enables real-time monitoring and indexing of specific web sources relevant to a customer's domain
- Used as a data ingestion layer that feeds into Vertical Index or Custom Index

**MCP Server Integration**
- Zero-setup web search for AI agents (no API key, no signup for prototyping)
- 100 free searches/day for developers to try before committing
- Full details in MCP Technical Details section below

**AI Factory-As-A-Service (Mention Only When Relevant)**
- Full-service AI engagement model for organizations that lack internal AI/engineering capacity
- Multi-year, comprehensive AI transformation partnerships
- Only mention when the account clearly lacks internal AI teams or has expressed need for full-service delivery

### Solution Patterns by Capability Combination

These are the common ways You.com products are combined in real deployments:

| Pattern | Products Used | Typical Use Case |
|---------|--------------|-----------------|
| Knowledge Assistant | PRAG + Custom AI Agent | Internal knowledge Q&A, research acceleration |
| Data-Driven Agent | Structured Database + Custom AI Agent | Product catalog search, competitive intelligence |
| Web Intelligence | Web Scraping + Vertical Index + AI Agent | Real-time market monitoring, content aggregation |
| Full AI Platform | PRAG + Custom Index + Agent API | Multi-use-case enterprise AI programs |
| Search Infrastructure | Search API (standalone) | Grounding layer for existing AI agents/LLMs |

---

## MCP Server (Brief Reference)

- You.com offers an MCP server: zero-setup web search for AI agents (no API key, 100 free searches/day)
- Link: docs.you.com/developer-resources/mcp-server
- **NOT a default outreach element.** Only mention when it naturally fits a deeply technical persona who would actually prototype. The Search API is always the lead product.

---

## Use Case Language by Industry

Based on solution delivery patterns, these are the use case categories that resonate by industry. Use these to frame account plans and personalize outreach.

### Media / Publishing
- **Primary pattern**: PRAG + Custom AI Agent
- **Use case framing**: Accelerate editorial research by giving journalists and editors an AI assistant grounded in their own archives, wire services, and published content. Reporters can query years of institutional knowledge in seconds instead of hours
- **Pain points that resonate**: Information overload, slow research cycles, pressure to publish faster, need to maintain editorial accuracy and citation standards
- **Outreach angle**: "Your newsroom sits on decades of institutional knowledge that's effectively invisible to your editorial team today"

### Retail / E-Commerce
- **Primary pattern**: Structured Database + Custom AI Agent, or Web Scraping + Vertical Index
- **Use case framing**: Power product discovery, competitive pricing intelligence, and customer-facing shopping assistants with AI search grounded in real-time product data and market signals
- **Pain points that resonate**: Product catalog complexity, competitive price monitoring at scale, customer experience personalization, fragmented product data across systems
- **Outreach angle**: "Your product catalog and competitive landscape change by the hour. Your AI needs search infrastructure that keeps pace"

### Legal
- **Primary pattern**: Structured Database + Custom AI Agent
- **Use case framing**: Ground legal research assistants in case law, regulatory databases, and firm knowledge. Enable lawyers to surface relevant precedents and clauses with AI-powered precision
- **Pain points that resonate**: Volume of case law and regulation, time-intensive manual research, risk of missing relevant precedents, need for citation accuracy
- **Outreach angle**: "Legal research is the most citation-dependent AI use case. The search layer has to get it right"

### Consulting / Professional Services
- **Primary pattern**: PRAG + Custom AI Agent
- **Use case framing**: Give consultants and analysts AI-powered access to proprietary research, methodology libraries, and client deliverable archives. Reduce time spent searching for relevant prior work
- **Pain points that resonate**: Knowledge trapped in partner/consultant heads, reinventing deliverables, slow knowledge transfer for new hires, competitive pressure to deliver faster
- **Outreach angle**: "Your firm's competitive advantage is institutional knowledge. The question is whether your team can actually access it when they need it"

### Travel / Hospitality
- **Primary pattern**: Full-service AI engagement or AI Factory model
- **Use case framing**: Enable AI-driven customer experiences: personalized travel recommendations, real-time pricing and availability, multilingual customer support grounded in company-specific content
- **Pain points that resonate**: Customer expectation for instant, personalized service, multilingual support complexity, fragmented booking and content systems
- **Outreach angle**: "Travelers expect AI-powered personalization. The question is whether your AI has access to the right data to deliver it"

### Financial Services
- **Primary pattern**: Search API + Vertical Index (for market intelligence) or PRAG (for internal compliance/research)
- **Use case framing**: Power compliance research, market intelligence, risk analysis, and internal knowledge assistants with AI search grounded in financial data, regulatory filings, and firm-specific knowledge
- **Pain points that resonate**: Regulatory complexity, speed of market data, compliance documentation burden, need for audit-ready AI outputs with citations
- **Outreach angle**: "In financial services, AI accuracy isn't a feature, it's a regulatory requirement. The search infrastructure behind your AI has to be citation-grade"

### Technology / SaaS
- **Primary pattern**: Search API (standalone) for grounding existing AI features
- **Use case framing**: Add web-grounded search to existing AI products, coding assistants, or customer-facing copilots. Replace legacy search APIs with higher-accuracy, AI-optimized retrieval
- **Pain points that resonate**: AI features hallucinating without grounding, legacy search API limitations, need for real-time web knowledge in AI products, migration complexity
- **Outreach angle**: Reference DuckDuckGo, Windsurf, Harvey as companies that replaced legacy search APIs with You.com for better accuracy and performance

---

## Objection Handling (From Product Knowledge)

### "We can build search in-house"
- Building production-grade search infrastructure for AI is fundamentally different from traditional web search
- You.com has spent years and significant R&D (led by the 4th most cited AI researcher globally) building indexes optimized for machine reasoning, not human browsing
- In-house builds typically take 6-12 months, require ongoing maintenance, and still underperform purpose-built solutions on accuracy benchmarks (SimpleQA, FreshQA, MS Marco)
- Counter: "How long would it take your team to build and maintain a search index that serves 1B+ queries monthly with the accuracy we deliver out of the box?"

### "How is this different from just calling Google/Bing API?"
- Legacy search APIs return results optimized for human click-through, not for AI agent consumption
- You.com returns long, rich snippets with citations designed for LLM ingestion: structured, contextual, and actionable
- Multiple companies have migrated from legacy search APIs to You.com specifically because their AI applications needed higher-quality retrieval (DuckDuckGo, Harvey, Windsurf are public references)
- Benchmark data: higher accuracy with lower latency on SimpleQA, FreshQA, MS Marco

### "We're already using [competitor] for AI search"
- Never name competitors in outreach. Use: "other search API providers" or "your current search layer"
- Focus on: accuracy benchmarks, snippet depth, real-time freshness, enterprise reliability (1B+ queries/month)
- CTA: "We can set up a side-by-side evaluation on your actual queries. Let the results speak"

### "What about data privacy / security?"
- Zero data retention on Search API calls
- PRAG offers enterprise-grade security: data never leaves the customer's control plane
- SOC 2 Type II compliant, audit-ready
- Security Whitepaper available as a prospect-facing asset (see Available Assets below)
- For highly regulated industries: emphasize citation trails and audit-ready outputs

### "We need domain-specific results, not general web search"
- This is exactly what Vertical Index solves: purpose-built indexes by industry that combine public web, partner data, and structured sources
- Custom Index goes further: tailored indexes built around the customer's specific data sources and use cases
- PRAG adds private document grounding on top of web search
- Framing: "We're not just web search. We build the retrieval layer your AI needs, whether that's public web, your industry's data, or your own private knowledge"

### "How do we evaluate this?"
- You.com offers a structured evaluation process: joint eval (customer brings their golden set of queries) or full custom eval (You.com helps build the golden set together)
- 5-step process: scoping, golden set creation, data requirements, testing, results readout
- The evaluation is designed to prove value on the customer's actual use case before any commitment
- CTA: "We can set up a joint evaluation using your actual queries. You'll see exactly how we perform on your data"

---

## Available Prospect-Facing Assets

These resources CAN be referenced in outreach as CTAs or value-adds. They exist as shareable materials.

### White Papers (Shareable)
- **Enterprise RAG Whitepaper**: Deep dive on RAG architecture and enterprise deployment considerations
- **Security Whitepaper**: Data privacy, compliance, and security posture documentation
- **Success Metrics Whitepaper**: How to measure and quantify the impact of AI search infrastructure

### Product Resources (Shareable)
- **Prompting and Switching LLMs**: Guide on working with multiple LLMs through You.com
- **Using You.com Agents**: Overview of agent capabilities and usage patterns
- **Custom Agent Guide**: How to build and deploy custom AI agents on You.com
- **Doing Research with ARI**: Research workflow guide
- **MCP Server Documentation**: docs.you.com/developer-resources/mcp-server

### Case Studies (Shareable, Named)
- **DuckDuckGo**: Replaced legacy search API, 2x faster, 10M+ daily queries
- **Windsurf**: Replaced legacy search for coding agent documentation retrieval
- **Harvey**: Chose You.com over incumbent search API providers for legal search
- **Databricks**: Unity Catalog integration
- **Wort & Bild Verlag**: Media company using PRAG + Custom AI Agent (public case study with demo video available at you.com/customer-stories/)
- **DPA (Deutsche Presse-Agentur)**: News agency using PRAG + Custom AI Agent for journalism research (public case study with demo video available at you.com/customer-stories/)

### CTA Suggestions by Asset
| Situation | Asset CTA |
|-----------|-----------|
| Technical buyer exploring AI search | "We can set up a joint evaluation on your actual queries" |
| Security/compliance concern raised | "Happy to share our Security Whitepaper" |
| Wants to understand RAG architecture | "Our Enterprise RAG Whitepaper covers the full architecture" |
| Needs ROI justification | "Our Success Metrics Whitepaper outlines measurement frameworks" |
| Wants to see it in action | "We can set up a joint evaluation on your actual queries" |
| Media/publishing vertical | "Here's how [DPA/Wort & Bild] accelerated their newsroom research" |

---

## Sales Motion Alignment (For CTA Calibration)

Understanding the internal sales process helps calibrate outreach CTAs to match the logical next step after a prospect responds.

### Phase Flow
1. **Deal Validation**: Initial qualification. Budget exists? Timeline real? Right stakeholders identified?
2. **Discovery & Scoping**: Technical fit assessment, solution mapping, understanding org goals
3. **Demo / POC / Trial**: Product demonstrations, technical workshops, hands-on evaluation
4. **Proposal & SOW**: Commercial proposal, pricing, contract negotiations
5. **Handoff**: Customer onboarding, kickoff, ongoing relationship

### CTA Calibration by Phase
- **Outbound outreach (pre-Phase 1)**: CTAs should be lightweight and curiosity-driven. No demos yet. Use: whitepaper shares, reference a relevant case study, interest-based questions
- **After initial response (entering Phase 1)**: Move to discovery-oriented CTAs. "Would it help to walk through how [case study company] solved a similar challenge?" or "Happy to do a quick technical overview"
- **After discovery (entering Phase 3)**: Demo/POC CTAs. "Based on what you shared, we could set up a joint evaluation using your actual queries"
- **Key insight**: Never jump to demo/POC CTAs in cold outreach. The outreach should open the door to a conversation (Phase 1), not sell the evaluation (Phase 3)

---

## Post-Sale Value Story (For Credibility, NOT for Outreach Detail)

Understanding how You.com delivers post-sale adds credibility to outreach without requiring specific details.

### Enterprise Delivery Approach (Generic Framing)
- You.com has a dedicated professional services team that delivers end-to-end enterprise AI solutions
- Methodology is structured, phased, and outcome-driven with clear deliverables at each stage
- Focuses on aligning business goals, technical needs, and privacy/security requirements
- Solutions are built to ensure measurable outcomes, compliance, and scalability

### What Customers Implement
- Private RAG over enterprise documents with custom AI agents
- Custom AI agents connected to structured databases and APIs
- Vertical web indexes built through targeted web scraping for domain-specific intelligence
- Programs can range from single-use-case deployments to multi-use-case enterprise AI programs

### Industries Served (Generic, No Customer Names)
- Media and publishing organizations
- Retail and e-commerce companies
- Legal technology and law firms
- Consulting and professional services firms
- Travel and hospitality companies
- Financial services institutions

### Outreach-Safe Credibility Lines
- "We have a professional services team that works alongside your engineers to deploy enterprise AI solutions"
- "Our delivery methodology is structured and outcome-driven, we don't just hand you an API key"
- "We've deployed enterprise RAG and custom AI agent solutions across media, retail, legal, consulting, and financial services"
- "Our approach focuses on measurable outcomes and compliance from day one"

### What NOT to Say in Outreach
- No specific customer names from delivery engagements (even if they have public case studies, only reference the ones listed in Available Prospect-Facing Assets above)
- No pricing or engagement costs
- No team member names or org structure details
- No SOW or project timeline specifics
- No internal delivery methodology details beyond "structured, phased, outcome-driven"

---

## Technical Vocabulary for Outreach (From AI Engineering Context)

These concepts from the technical library help write more credible copy for technical buyers:

### RAG Concepts (Use in Seq A and Seq D Messaging)
- RAG = Retrieval-Augmented Generation: supply the LLM with up-to-date, task-specific context via search before generating a response
- RAG reduces hallucinations by grounding AI outputs in retrieved facts rather than relying solely on model memory
- The quality of RAG depends entirely on the quality of the retrieval layer. Better search = better AI outputs
- RAG is now the standard approach for enterprise AI applications that need accuracy and freshness

### AI Engineering Lifecycle (Use for Executive Framing)
- Building AI applications is not just about choosing a model. It's a full-stack process: use case analysis, model selection, retrieval architecture, evaluation, deployment, and continuous improvement
- 95% of GenAI pilots fail due to inadequate data infrastructure, not inadequate models (from sales deck)
- The retrieval/search layer is the most underinvested and highest-impact component of the AI stack

### Evaluation (Use When Prospects Are Comparing Providers)
- AI evaluation requires domain-specific test sets ("golden sets") that reflect real production queries
- You.com's evaluation process is structured: scoping, golden set creation, data requirements, testing, results readout
- Comparative evaluation (side-by-side against current provider) is the most effective way to demonstrate value

### Build vs. Buy (Use to Counter "We'll Build It Ourselves")
- Start with APIs for rapid prototyping, move to deeper integration once value is proven
- In-house search infrastructure requires ongoing investment in indexing, freshness, relevance tuning, and scaling
- The research advantage matters: You.com was founded by the researchers who pioneered the foundational techniques behind modern AI search

---

## Content Safety Checklist

Before using any content from this file in outreach or prospect-facing materials, verify:

- [ ] No internal team member names mentioned
- [ ] No specific customer names beyond the approved public case studies (DuckDuckGo, Windsurf, Harvey, Databricks, Wort & Bild, DPA)
- [ ] No pricing, contract terms, or engagement costs referenced
- [ ] No internal tool names, Salesforce links, or internal systems mentioned
- [ ] No SOW details, project timelines, or delivery methodology specifics
- [ ] No links to the CS Team Site or internal Google Drive folders
- [ ] No confidential evaluation details (even anonymized)
- [ ] No competitor names in prospect-facing copy (use generic framing)
