# Outreach Writing Rules (Full Reference)

## Two-Layer System

**Layer 1: Universal Writing Style** is defined in CLAUDE.md and applies to ALL writing (cold outreach, warm emails, Slack, call scripts, everything). It covers: no em dashes, no AI-isms, no glazing, short paragraphs, 5th-7th grade reading level, plain human tone.

**Layer 2: Cold Outbound Rules** (this file) apply ONLY to cold outreach sequences and LinkedIn connection requests. These rules are in addition to Layer 1, not a replacement.

If you are writing a warm reply, partner email, internal message, or anything other than cold prospecting, only Layer 1 applies. Do not apply sequence-specific rules (AIDA structure, hook prioritization, interest-based CTAs, etc.) to non-cold writing.

---

## Sequence Writing Rules (Cold Outbound Only)

1. **No em dashes.** Use commas, periods, colons, semicolons, or pipes instead. This is a hard rule.
2. **Personalize to the account.** Every sequence must reference specific details from the account plan research: company initiatives, product names, strategic shifts, leadership quotes, or recent press.
3. **Personalize to the prospect.** Reference their specific role, department, or publicly known work when possible.
4. **Founder credibility in every sequence.** At least one touch in every sequence must reference Richard Socher's background. Only use Socher for prospect-facing founder credibility (Bryan McCann is internal context only). Vary the placement.
5. **Include third-party validation proof.** At least one touch should reference named public case studies (DuckDuckGo, Harvey, Windsurf, Databricks), benchmark data, or generic traction stats (1B+ queries/month, 5K+ customers, 57% Fortune 500). NEVER reference specific evaluations (even anonymized) or name competitors. NEVER name confidential customers or active evaluations.
7. **Subject lines only on Touch 1.** The first email gets a unique, specific subject line (reference company name, initiative, or provocative insight). All subsequent emails are replies to the original thread (no new subjects). Never use generic subjects like "Quick question" or "Following up."
8. **Keep emails concise.** Opener emails should be 100-150 words max. Follow-ups should be 80-120 words. Breakup emails should be 80-120 words. Gong data from 300K+ emails shows 30-150 words is the optimal range; longer emails get deleted, ultra-short emails lack enough substance to compel a reply.
9. **LinkedIn connect notes: no pitch, no CTA, no meeting ask, no role claims.** Use the Fact-to-Consequence + Curiosity Hook formula. State what they did, bridge to the problem it creates, end on a curiosity question. No "Would be great to connect" close. No glazing or characterizing initiatives. See references/linkedin-rules.md.
10. **Each touch should have:** a labeled subject line, the full email body, and any special instructions (e.g., "Do Not Cold Outreach, Warm Intro Only" for CEOs).
11. **Include a Founder Credibility Toolkit section** at the top of the document for quick reference.
12. **Label each email with:** Touch number, Day number, Channel (Email/LinkedIn), and a descriptive name.
13. **Plain text only in email bodies.** Never use markdown formatting (bold, italic, asterisks, headers, numbered lists) in outreach copy. Emails must look natural in any email client or Gong Engage. Use plain dashes for any lists, short paragraphs, and natural sentence flow.
14. **Short paragraphs.** 2-3 sentences max per paragraph in all email copy. White space makes emails scannable for busy executives.
15. **Always greet by name.** Every email touch must open with "Hi {{first_name}}," on its own line before the body copy. In Apollo sequences, use the `{{first_name}}` merge variable so it auto-populates per contact.
16. **Write at a 5th-7th grade reading level.** Short, punchy sentences. No compound-complex structures. If a sentence needs a semicolon, split it into two. Busy executives scan, they don't study.
17. **Strip corporate suffixes.** Never write "Teradata Corporation," "Plaid Inc.," or "MongoDB, Inc." in outreach. Just the company name. Suffixes make copy feel like a legal filing, not a human email.

---

## Hook Prioritization Framework

When personalizing each touch, select the strongest available hook in this priority order. Always use the highest-ranked hook you have data for:

1. **Trigger event** (funding round, product launch, leadership change, earnings call theme): Most timely, highest response rate
2. **Their content** (blog post, podcast appearance, conference talk, LinkedIn post): Shows genuine research depth
3. **Mutual connection or shared context** (same investor, same conference, shared Slack mention): Social proof
4. **Company initiative** (public AI program, hiring surge, strategic pivot): Relevant to their priorities
5. **Role-based pain point** (common challenges for their title/department): Least personal but still relevant

Do NOT default to #5 when better hooks exist in the research. If a trigger event exists, lead with it.

---

## AIDA Micro-Structure (Required for Every Email Touch)

Every individual email in every sequence must follow this structure. This is non-negotiable:

```
SUBJECT: [Personalized, under 50 chars, references company or initiative]

Hi {{first_name}},

[A - Attention: Personal hook from research. 1-2 sentences max. Must reference something specific to them, not generic.]

[I - Interest: Their problem or opportunity, framed as a hypothesis. 1-2 sentences connecting their situation to a relevant challenge. Use tentative language: "usually when teams do X, they tend to hit Y" or "typically this indicates..." Never diagnose their pain as fact. Leaving room to be slightly wrong invites the prospect to correct you, which starts a conversation.]

[D - Desire: One proof point. Customer case study, anonymized eval data, benchmark results, or founder credibility. Never more than one per email. Never name confidential customers.]

[A - Action: Interest-based CTA only. One ask only. Never stack multiple CTAs. NEVER use time-based CTAs in cold outreach ("15 minutes," "quick call this week," "Tuesday at 2pm"). Instead use micro-commitment asks: "Is this something you're evaluating?" / "Worth a conversation?" / "Are you open to exploring this?"]

[Signature]
```

For follow-up emails (80-120 words), compress to: New hook + new proof point + CTA. No re-introduction needed. These are replies to the original thread (no new subject line).
For breakup emails (80-120 words): Acknowledge silence without guilt, offer one new angle, simple yes/no question. Also a reply to the original thread.

---

## Sequence Writing Anti-Patterns (Hard Bans)

These phrases and patterns are BANNED from all outreach copy. If any appear in generated sequences, they must be rewritten:

### Banned Openers
- "I hope this email finds you well"
- "I'm reaching out because..."
- "I wanted to introduce myself"
- "I noticed you work at [Company]" (states the obvious)
- "Congrats on your role" (without specific context about what they've done in the role)
- "I'd love to pick your brain"
- "Just circling back"
- "Per my last email"

### Banned Patterns
- Feature dumps: listing 3+ product capabilities in a single paragraph
- Multiple value props in one email: one proof point per touch, period
- Stacking CTAs: never ask for more than one thing ("Would you be open to a call? Also happy to send a deck or connect you with our CTO")
- Self-centered openers: any first sentence that starts with "I" or "We" or "Our" or "At You.com"
- Fake personalization: compliments that could apply to anyone ("Your company is doing impressive work")
- Rhetorical questions as openers: "What if you could..." or "Have you ever wondered..."
- Buzzword soup: "synergy," "leverage," "paradigm shift," "best-in-class," "cutting-edge," "game-changer," "revolutionary"
- AI-ism vocabulary: "utilize" (use "use"), "comprehensive," "enhance" (use "improve"), "delve," "embark," "robust," "streamline," "strong signal." These words instantly flag copy as AI-generated.
- AI glazing: referencing a prospect's initiative just to compliment it or characterize it, without connecting to a problem we solve. The personalization sentence must state what they did AND why it creates a problem or question relevant to us. One sentence, no gap between the two. If the personalization doesn't bridge to a problem, cut it. Never add evaluative praise that dead-ends ("strong signal," "that's rare," "impressive achievement," "no small feat," "big move," "notable shift"). BAD: "Zoom's agentic AI Companion expansion is a big infrastructure move." GOOD: "Zoom's AI Companion going agentic creates new demands on the real-time data layer."
- Defaulting to product names or case studies: do not reflexively insert MCP server hooks, DuckDuckGo case studies, or product names into every email. Before adding a product name, case study, or MCP hook, ask: does this email work without it? If yes, leave it out. The best emails connect subject matter expertise to the prospect's problem without naming a single product.

### Instead, every opener must:
- Reference something specific from the account plan research
- Start with THEM, not you (their initiative, their challenge, their recent news)
- Be something that could only be sent to this person at this company
