# Outreach Sequence Rules (Quick Reference)

## Scope: Cold Outbound Only

These rules apply to cold outreach sequences and LinkedIn connection requests. They do NOT apply to warm replies, partner emails, internal comms, or other non-cold writing. Universal writing style rules (no em dashes, no AI-isms, no glazing, short paragraphs, plain human tone) are defined in CLAUDE.md and apply to ALL writing regardless of context.

## Standardized 5-Touch Structure (All Sequences)

Every sequence (A, B, C, D) uses the same structure:

| Touch | Day | Channel | Type |
|-------|-----|---------|------|
| 1 | Day 1 | Email | New thread, unique subject |
| 2 | Day 2 | LinkedIn Connect | No-pitch connection request (see LinkedIn Connect Rules) |
| 3 | Day 5 | Email | Reply to Touch 1 thread |
| 4 | Day 8 | Call | Phone task |
| 5 | Day 14 | Email | Reply to Touch 1 thread (breakup) |

## Threading Rule
- Only Touch 1 gets a unique subject line
- Touches 3 and 5 are REPLIES to the original thread (no new subject)
- In Apollo: use "reply to previous email" step type for Touches 3 and 5

## Email Structure
- AIDA: Attention > Interest > Desire > Action (every email, non-negotiable)
- **Interest = Hypothesis, not diagnosis.** Use tentative language: "usually when teams do X, they tend to hit Y" / "typically this indicates..." Never assert pain as fact. Leaving room to be slightly wrong invites the prospect to correct you, starting a conversation.
- One proof point per email, one CTA per email, never more
- **Interest-based CTAs only in cold outreach.** "Is this something you're evaluating?" / "Worth a conversation?" / "Are you open to exploring this?" NEVER use time-based CTAs: "15 minutes," "quick call this week," "Tuesday at 2pm." Time-based CTAs are reserved for warm deal progression only.
- Openers start with THEM (their news, initiative, challenge), never "I/We/Our/At You.com"

## Formatting
- Plain text only. No markdown (no bold, italic, asterisks, headers, numbered lists)
- Short paragraphs: 2-3 sentences max
- No em dashes anywhere
- Always greet by name: "Hi {{first_name}}," on its own line
- **5th-7th grade reading level.** Short, punchy sentences. No compound-complex structures. If it needs a semicolon, split it into two sentences.
- **Strip corporate suffixes.** Write "Teradata" not "Teradata Corporation." Write "Plaid" not "Plaid Inc."

## Word Counts (updated 2026-03-30 per Gong 28M email analysis)
- Opener (Touch 1): 80-120 words (tightened from 100-150)
- Follow-up (Touch 3): 80-120 words
- Breakup (Touch 5): 80-120 words
- LinkedIn connect notes: under 250 characters
- Subject lines: under 6 words, specific to company/initiative (Touch 1 only; tightened from under 50 chars)

## Follow-Up Context Rule (added 2026-03-30)
- Each follow-up (Touch 3, Touch 5) must add a NEW reason to respond
- New proof point, new angle, new context. Never rephrase the original pitch.
- Gong data: repeating the same ask in different words kills sequences.

## LinkedIn Connect Rules (Touch 2)

The connection request opens the door. The email sequence carries the pitch. Never combine.

**Hard rules:**
1. Zero pitch. No product mentions, no feature references, no You.com product names
2. Zero CTA. No "worth a chat?" No "would love to show you." No meeting asks
3. Zero generic flattery. Never "impressive," "incredible," "amazing"
4. Under 250 characters. Shorter is better, but don't sacrifice a good curiosity hook for an arbitrary count
5. Almost entirely about them. No role claims, no title drops. Your profile handles identity
6. Reference ONE specific thing (company initiative, trigger event, their content, technical problem)

**Formula: Fact-to-Consequence + Curiosity Hook**
- Fact-to-Consequence: State what they did AND what problem/question it creates, in one sentence. Never characterize the initiative ("big move," "notable shift," "signals serious work"). The personalization must bridge to a problem, not evaluate the initiative.
- Curiosity Hook: End on a genuine question about how they're solving that problem + optional light domain signal. The question IS the close. No "Would be great to connect" or similar filler. The connect button is the CTA. The note doesn't need to ask for the connection.
- BAD: "Zoom's agentic AI Companion expansion is a big infrastructure move. Curious how... Would be great to connect."
- GOOD: "Zoom's AI Companion going agentic creates new demands on the real-time data layer. Curious how your team is thinking about that (be it with a web index or otherwise)."

**Curiosity hook:** Ask how they're thinking about a problem relevant to your value prop. Plants the problem seed without pitching the solution. Makes them check your profile to figure out who's asking.

**Light domain signals:** Parenthetical breadcrumbs that show you're in the space: "(be it with a web index or otherwise)," "(web search, custom indexes, etc.)." Optional but effective.

**Banned in LinkedIn notes:**
- Calling anything "impressive" or "incredible"
- Mentioning any You.com product by name
- Including a CTA for a meeting, call, or demo
- Starting with "I" or "We" or "At You.com"
- Claiming a role or title ("I lead X," "I'm the VP of Y")
- Using the connection note as a compressed email pitch

## Hook Priority (use highest available)
1. Trigger event (funding, launch, leadership change, earnings)
2. Their content (blog, podcast, conference talk, LinkedIn post)
3. Mutual connection / shared context
4. Company initiative (AI program, hiring surge, pivot)
5. Role-based pain (last resort only)

## Proof Points (Safe to Use in Outreach)
- Founder credibility (Socher ONLY in outreach: 4th most cited AI researcher, former Chief Scientist at Salesforce, Stanford professor. Do NOT reference Bryan McCann in prospect-facing copy.)
- **Case study matching rule: always pick the case study CLOSEST to the prospect's use case.** Don't default to DuckDuckGo.
  - **Harvey / Windsurf:** AI agents needing accuracy, citations, grounded retrieval
  - **Salesforce:** Enterprise AI platforms, agentic tooling, grounding internal + web data (Slackbot AI globally, Prompt Builder)
  - **Strauss:** Retail, consumer products, e-commerce
  - **DuckDuckGo:** Real-time freshness, high-volume search, legacy migration
  - **Databricks:** Data platform customers, Unity Catalog co-sell angle
- The specific metrics don't matter. Lead with the outcome: better freshness, accuracy, latency, relevance because our APIs are built for how agents consume data.
- Scale stats: 1B+ queries/month, 5K+ API customers, 57% Fortune 500 penetration

## Proof Points (NEVER Use in Outreach)
- Any specific customer evaluation, even anonymized (e.g., "a Big 4 firm evaluated us across 500 queries")
- KPMG or any active eval by name
- Competitor names (Exa, Tavily, Perplexity API, Vertex AI, Bing API)
- Any anonymized reference with enough detail to narrow down the customer
- Internal-only metrics or unreleased product details

## Competitor References (NEVER in Outreach)
- Never name Exa, Tavily, Perplexity API, Google Vertex AI Search, Bing API in outreach
- Use instead: "other search API providers," "search API incumbents," "legacy search APIs"
- Exception: Internal docs, battlecards, and live conversations where prospect names a competitor first

## Banned Openers
1. "I hope this email finds you well"
2. "I'm reaching out because..."
3. "I wanted to introduce myself"
4. "I noticed you work at [Company]"
5. "Congrats on your role" (without specific context)
6. "I'd love to pick your brain"
7. "Just circling back"
8. "Per my last email"

## Banned Patterns
1. Feature dumps (3+ capabilities in one paragraph)
2. Multiple value props in one email
3. Stacking CTAs
4. Self-centered openers (first sentence starting with I/We/Our)
5. Fake personalization ("Your company is doing impressive work," "[initiative] is impressive," etc.)
6. Rhetorical questions ("What if you could...")
7. Buzzword soup (synergy, leverage, paradigm shift, best-in-class, cutting-edge, game-changer, revolutionary)
8. AI-ism vocabulary: "utilize" (use "use"), "comprehensive," "enhance" (use "improve"), "delve," "embark," "robust," "streamline," "strong signal"
9. AI glazing: referencing a prospect's initiative just to compliment it or characterize it, without connecting to a problem we solve. The personalization earns its place ONLY when it bridges to relevance. Never evaluate or characterize what they did ("big move," "notable shift," "signals serious work," "strong signal," "that's rare," "impressive achievement," "no small feat"). State the fact, then bridge directly to the problem or question.
   - BAD: "Zoom's agentic AI Companion expansion is a big infrastructure move. Curious how..." (characterizes the initiative before asking the question)
   - BAD: "Plaid's AI Annotator hitting 95%+ human alignment is a strong signal." (compliment, no bridge)
   - GOOD: "Zoom's AI Companion going agentic creates new demands on the real-time data layer. Curious how your team is thinking about that." (fact → consequence → question)
   - GOOD: "Saw Plaid rolled out the AI Annotator for financial labels. When teams get that far with proprietary models, the next bottleneck is usually the real-time data layer feeding them." (fact → bridge to problem)
   - Rule: the personalization sentence should state what they did AND why it creates a problem or question relevant to us. One sentence, no gap between the two. If the personalization doesn't bridge to a problem, cut it.

## Reference Example: What Good Looks Like

The following email was confirmed by Ryan as a gold standard for warm deal progression writing (2026-03-23, WBG exec alignment note to CTO Irvinder Singh):

```
Hi Irvinder,

Given the urgency you described around hallucination issues and the number of tools your team has already evaluated without a clean result, I wanted to offer something before the testing begins next week.

Richard Socher, our founder, holds a patent pending specifically on connecting LLMs with real-time search to produce grounded, verifiable output. That research is the foundation of what your team will be testing. Before the other tools failed your eval, most of them were not designed with that problem as their starting point. Richard's was.

If a short call with him before the eval would be useful context for you, I am happy to make that introduction. No agenda other than giving you a direct line to the thinking behind the approach.

Let me know if that is of interest.

Thanks, Ryan
```

**Why it works:**
- Starts with THEM (their urgency, their failed evals)
- Zero AI-isms, em dashes, superlatives, glazing, or complimenting
- Extremely personalized to their specific situation
- Concise (under 120 words)
- One proof point (Richard's patent), one ask (short call)
- Interest-based CTA ("if useful... let me know"), not time-based
- Reframes competitive landscape without naming anyone ("most of them were not designed with that problem as their starting point")
- Positions Richard as a researcher, not a CEO doing a sales call ("direct line to the thinking behind the approach")
- Permission-based language throughout ("I wanted to offer," "if useful")
- No product names, no case studies, no MCP hook, no DuckDuckGo shoehorned in
- Maps founder credibility to their specific problem, not generic company pitch

## Sequence Personas
- A: Engineering Leader (5 touches / 14 days)
- B: Executive Sponsor (5 touches / 14 days)
- C: Product Leader (5 touches / 14 days)
- D: AI/ML Leader (5 touches / 14 days)
