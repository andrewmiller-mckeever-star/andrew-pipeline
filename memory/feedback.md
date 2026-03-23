# User Feedback Log

Captures confirmed feedback from Ryan across sessions. These are hard rules.

## 2026-02-26 Session

### Product Focus
- **Primary products:** Search API, Vertical Specific Index, Private RAG (PRAG)
- **Secondary (mention only when relevant):** AI Factory-As-A-Service, Custom Index
- **NEVER reference in prospect-facing output:** ESL, Chat, Apex product lines
- Rationale: Ryan's main sales focus is on the API/infrastructure side

### Confidentiality
- **NEVER name active evaluations or in-progress customer engagements in outreach.** This includes KPMG and any other active eval.
- Use anonymized references: "a Big 4 consulting firm," "a Fortune 500 company," etc.
- Case studies that ARE safe to reference by name: DuckDuckGo, Windsurf, Harvey, Databricks (these are in the public sales deck)

### Conciseness
- All pipeline outputs must be concise. No filler, no redundant context, no over-explanation.
- This applies to: account plans, outreach sequences, prospect lists, summaries

### Research Process
- Always check Google Drive ("Account Plans, Lists & Personalized Sequences/") for existing deliverables before starting
- Always check Slack channels for prior relationship context before generating account plans
- Build on existing work, don't duplicate from scratch

### Sales Deck
- Located at: ~/Downloads/You.com - AI Search Infra Pitch Deck - January 2026.pdf
- Use as source of truth for: pitch framing, value props, competitive positioning, case studies, tech eval process
- Key angles from deck: "AI blind spot" problem framing, 95% GenAI pilot failure stat, benchmark superiority (accuracy + freshness + latency), Bing deprecation migration opportunity
- Key case studies: DuckDuckGo (news API, replaced Bing, 2x faster), Windsurf (coding agent docs, replaced Bing), Harvey (legal search, chose over Tavily/Exa), Databricks (Unity Catalog integration)

### Outreach Quality
- Writing discipline rules (13-14) confirmed: plain text only + short paragraphs
- Hook Prioritization Framework confirmed: ranked 1-5, always use highest available
- AIDA Micro-Structure confirmed: required for every email touch
- Anti-Patterns (Hard Bans) confirmed: 8 banned openers, 7 banned patterns
- User wants these enforced strictly, not loosely

## 2026-02-27 Session

### Contact Cap Per Sequence
- ~~3-4 contacts maximum per ICP sequence~~ **UPDATED: See 2026-03-09 correction below.**
- Original rationale was spam flag avoidance. Cap was raised after Checkr run once Apollo label/dedup hygiene was confirmed working.

## 2026-03-09 Session (Contact Cap Correction)

### Contact Cap: Raised to 5
- **5 contacts per ICP sequence (A, B, C, D).** This supersedes the 3-4 cap set on 2026-02-27.
- Teradata was the first account run at 5/sequence. All future accounts use 5.
- Priority order remains: (1) title relevance, (2) verified email availability, (3) direct use case alignment
- Drop prospects without verified emails first
- One contact per sequence only. No duplicates across sequences.

## 2026-03-02 Session

### No Specific Evaluation References in Outreach
- **NEVER reference any specific customer evaluation in outreach, even anonymized.** This was a recurring issue: the pipeline kept inserting "a Big 4 firm evaluated us across 500 production queries" into outreach copy. This is banned entirely.
- No query counts, no "head-to-head" language, no anonymized details that could narrow down the customer.
- Instead: generic traction stats (1B+ queries, 5K+ customers, 57% F500) and named public case studies only.

### No Competitor Names in Outreach
- **NEVER name competitors in prospect-facing outreach.** No Exa, Tavily, Perplexity API, Vertex AI, Bing API.
- Use: "other search API providers," "search API incumbents," "legacy search APIs"
- Exception: internal docs, battlecards, live conversations where prospect names a competitor first.
- Rationale: naming competitors elevates their visibility, invites comparison shopping, and can seem insecure.

### Follow-Up Emails Are Replies
- **Only Touch 1 gets a unique subject line.** All subsequent emails in a sequence are replies to the original thread.
- In Apollo: use "reply to previous email" step type for follow-up emails.
- Rationale: replies land in the same thread, increasing visibility and open rates. New subjects on follow-ups look like separate cold emails.

### Standardized 5-Touch Sequence
- **Every sequence (A, B, C, D) now uses 5 touches:** Email > LinkedIn Connect (Day 2) > Email reply (Day 5) > Call (Day 8) > Email reply/breakup (Day 14)
- LinkedIn connect is always Touch 2, scheduled 1 day after the first email. Non-negotiable.
- This replaces the previous variable cadences (3-4 touches per sequence).

## 2026-03-03 Session

### MCP Server Try-It-Now Hook Removed
- **No longer a mandatory element in outreach.** Was previously required in at least one touch per account. Ryan flagged it as "super weird" as a forced checkbox.
- MCP can be used organically when it naturally fits (e.g., deeply technical persona who might actually prototype), but is not a required element.
- Removed from CLAUDE.md sequence writing rules and quality checklist.

### LinkedIn Connect Notes: Recognition + Curiosity Hook + Connect
- **LinkedIn connection requests must contain zero pitch.** Previous notes were pitch-slapping: mentioning products, calling things "impressive," and including CTAs.
- **Refined formula: Recognition + Curiosity Hook + Connect.** Instead of stating who you are (identity), ask a genuine curiosity question about a problem they face. This plants the problem seed without pitching the solution, and makes them check your profile to figure out who's asking.
- **Hard rules for LinkedIn connect notes:**
  1. Zero pitch (no product mentions, no feature references, no You.com product names)
  2. Zero CTA (no "worth a chat?" no meeting asks)
  3. Zero generic flattery (never "impressive," "incredible," "amazing")
  4. Under 250 characters (shorter is better, but don't sacrifice a good curiosity hook)
  5. Almost entirely about them. No role claims, no title drops. Profile handles identity.
  6. Reference ONE specific thing (company initiative, trigger event, technical problem)
- **Curiosity hook:** A genuine question about how they're solving a problem relevant to your value prop. Example: "Curious how you're thinking of solving the hallucination problem (be it with a web index or otherwise)."
- **Light domain signals:** Parenthetical breadcrumbs that show you're in the space without naming a product: "(be it with a web index or otherwise)," "(web search, custom indexes, etc.)." These make the prospect think "this person works on this exact problem" and check your profile.
- **The connection request opens the door. The email sequence carries the pitch. Your profile handles identity.**
- Data backing: Belkins study (20M+ attempts) shows personalized non-pitch notes drive 72% higher post-connection engagement vs. pitch-heavy notes.
- Updated in: CLAUDE.md, outreach-rules.md, MEMORY.md

### Outreach Copy Quality Improvements (from AI Outbound Sales Sequence research)
Ryan shared an advanced outbound sales prompt engineering document with data from Gong (300K+ emails), Lavender, Smartlead, Cognism, and others. After analysis, 6 changes adopted:

1. **Tentative language in AIDA "Interest" section.** Frame pain as a hypothesis, not a diagnosis. Use: "usually when teams do X, they tend to hit Y" / "typically this indicates..." Invites the prospect to correct you, starting dialogue. Asserting pain as fact feels presumptuous.

2. **Interest-based CTAs only in cold outreach.** Ban time-based CTAs ("15 minutes," "quick call," "Tuesday at 2pm") in cold sequences. These convert at 15%. Interest-based CTAs ("Is this something you're evaluating?" / "Worth a conversation?") convert at 30% (Smartlead/Gong data). Time-based CTAs reserved for warm deal progression only.

3. **Tighter opener word count: 100-150 words** (was 150-200). Gong data from 300K+ emails: 30-150 words is 15x more effective than bloated or ultra-short emails. Breakup also tightened to 80-120 (was 100-150).

4. **Expanded banned vocabulary (+7 AI-ism words).** Added: "utilize," "comprehensive," "enhance," "delve," "embark," "robust," "streamline." These instantly flag copy as AI-generated.

5. **5th-7th grade reading level target.** Short, punchy sentences. No compound-complex structures. Busy executives scan; they don't study.

6. **Strip corporate suffixes.** Write "Teradata" not "Teradata Corporation." Write "Plaid" not "Plaid Inc."

**Declined from the research:**
- "Hope all is well" pleasantry (Gong data shows 24% lift, but our VP/Director+ ICP needs stronger hooks; the cliché wastes the one shot at attention)
- 21-day, 8-touch sequence (too long for executive ICP; our 14-day, 5-touch is better for whale accounts)
- Video touchpoint (interesting but requires tooling; not a priority now)

Updated in: CLAUDE.md, outreach-rules.md, MEMORY.md

## 2026-03-09 Session

### No AI Glazing in Outreach
- **Ban referencing a prospect's initiative just to compliment it.** The research hook only earns its place if it bridges to a problem we solve or an opportunity we enable. Complimenting and stopping is flattery, not personalization.
- BAD: "Plaid's AI Annotator hitting 95%+ human alignment on financial labels is a strong signal. That kind of accuracy on proprietary data is rare." (compliment with no bridge)
- GOOD: "Saw Plaid rolled out the AI Annotator for financial labels. When teams get that far with proprietary models, the next bottleneck is usually the real-time data layer feeding them." (factual reference → bridge to relevant problem)
- State what they did, then tie it to how we could help. Never add evaluative praise that dead-ends: "strong signal," "that's rare," "impressive achievement," "no small feat."
- Litmus test: does the research reference lead somewhere actionable, or is it just a compliment? If it's just a compliment, either add the bridge or cut it.
- Updated in: CLAUDE.md, outreach-rules.md, feedback.md

### Founder Credibility: Socher Only in Outreach
- **Only reference Richard Socher in prospect-facing outreach.** Do not reference Bryan McCann in emails, LinkedIn notes, or any prospect-facing copy. McCann's background is internal context only.
- Socher angles for outreach: "4th most cited AI researcher in the world," former Chief Scientist at Salesforce, Stanford professor, pioneered deep learning + NLP.
- If the prompt engineering invention (2018) is referenced in internal docs, cite: https://medium.com/@xitvali/the-hidden-history-of-prompt-engineering-f7415e1b70f7
- Updated in: CLAUDE.md, outreach-rules.md, feedback.md

## 2026-03-23 Session

### Don't Default to Product Names or Case Studies
- **Stop reflexively inserting MCP server hooks, DuckDuckGo case studies, or product names into every email.** These were being shoehorned in even when the email didn't need them. The best emails (see WBG exec alignment note in outreach-rules.md) don't mention a single product name or case study. They connect founder expertise to the prospect's specific problem and let the meeting do the selling.
- **Why:** Proof points and case studies are tools, not requirements. Use them when they earn their place. An email that maps subject matter expertise to a prospect's problem is stronger than one that name-drops DuckDuckGo for the 50th time.
- **How to apply:** Before adding a product name, case study, or MCP hook, ask: does this email work without it? If yes, leave it out.

### Reference Example Saved
- Gold standard warm deal email saved to outreach-rules.md (WBG exec alignment note to Irvinder Singh, 2026-03-23). Use as calibration when writing any non-cold outreach: exec alignment, warm intros, deal progression, partnership notes.

### Personalization Must Bridge to Problem, Never Characterize
- **Stop evaluating or characterizing prospect initiatives in the personalization sentence.** Phrases like "big move," "notable shift," "signals serious work," "significant infrastructure push" are glazing disguised as personalization. They don't add value. They just compliment the initiative before getting to the point.
- **Why:** The personalization sentence exists to connect what they did to why we might be useful. If it evaluates the initiative instead of bridging to a consequence, it's wasted space and reads as AI slop.
- **How to apply:** State the fact, then state the consequence (the problem or question it creates). One sentence. No gap between them. If the personalization doesn't bridge to a problem, cut it.
- BAD: "Zoom's agentic AI Companion expansion is a big infrastructure move."
- GOOD: "Zoom's AI Companion going agentic creates new demands on the real-time data layer."
- This applies to ALL outreach: emails, LinkedIn connect notes, follow-ups, everything. Updated in outreach-rules.md (banned patterns #9 and LinkedIn Connect formula).
