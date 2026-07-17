---
name: ydc-outreach
description: CLOUD version for Claude Code Routines. Generates 4 personalized outreach sequences (A: Engineering Leader, B: Executive Sponsor, C: Product Leader, D: AI/ML Leader) for You.com whale account pipeline. Each sequence has 7 touches: Email Day 1 (new thread), LinkedIn Connect Day 2, Email reply Day 5, Phone call Day 8, LinkedIn interact-with-post Day 11, Email reply/breakup Day 14, LinkedIn direct message Day 17. Outputs in-memory JSON for Apollo injection — no local file created. Includes mandatory self-review gate before producing JSON. Use when user says "draft outreach for [company]", "write sequences for [company]", "outreach sequences", "generate outreach copy", or "Step 4" in the pipeline.
---

# YDC: Outreach Sequence Generation (Step 4) (Cloud)

**Cloud execution notes (differences from the laptop version):**
- This skill is prompt logic: research + copywriting. Per-person research uses the You.com Search API via the `$YDC_API_KEY` env var; if unset, use the You.com Search connector (`you-search`) or WebSearch instead. Never abort for a missing key.
- Sequences are built by ydc-apollo-build via the Apollo.io connector tools (cloud-native). The local Playwright build path (`build-sequences.js`, `~/.apollo-playwright-profile`) does NOT exist in cloud and is removed — see Build Method below.
- Touch 5 (`linkedin_interact_post`) was automated on the laptop by `apollo-linkedin-connect.js`. That automation is not available in cloud: the step is still created as an Apollo task with the exact task note below, and it completes as a manual Apollo task (or by the laptop automation if Andrew runs it there).
- WRITE BOUNDARY: this skill writes NOTHING externally. All output is held in memory (sequence JSON + per-contact Touch 1 fields) and handed to ydc-apollo-build. No files, no Salesforce writes, no Slack posts, no emails sent. Nothing is enrolled or activated by this skill.

## Sequence Architecture

4 sequences per account, each targeting a different buyer persona:

| Sequence | Target Persona | Use Case Focus |
|----------|---------------|----------------|
| Seq A: Engineering Leader | Dir of Eng, VP Eng, SVP Eng, Head of Eng | Search API infra, technical integration, platform decisions |
| Seq B: Executive Sponsor | CTO, CIO, Chief AI Officer, CDO, CSO. CEO only as last resort (warm intro only). | Strategic AI infrastructure, business case, enterprise decisions |
| Seq C: Product Leader | Dir of Product, VP Product, Head of Product | Product outcomes mapped to AI search infra or PRAG |
| Seq D: AI/ML Leader | Head of AI/ML, VP Data Science, Dir of Data Science, ML Eng Directors | RAG pipelines, AI agent grounding, model infra, search layer |

**Finance accounts:** For financial services, fintech, banking, and investment accounts, lead the proof angle with the Finance Research API (purpose-built financial index over filings, fundamentals, market data, and financial news) instead of the Search API. Apply this across the relevant sequences; do not change the 4-sequence structure.

## SFDC-Informed Outreach Adjustments

Before writing sequences, check the CRM Intelligence Brief (Section 9 of research output) for:

1. **Closed-Lost Products:** If a product was previously pitched and lost, lead with a DIFFERENT product angle. Do not re-pitch the same product to the same persona unless 2+ years have passed.
2. **Prior Contact Engagement:** If a prospect has activity history in SF, adjust from cold to warm tone. Reference the existing relationship ("following up on earlier conversations" etc.).
3. **Prospect Replies ([Gong In]):** If a prospect replied positively, they should NOT receive cold sequence outreach. Route to direct warm follow-up instead.
4. **Existing Customer:** If the account has closed-won opps, this is expansion outreach. Reference the existing partnership. Do not cold-pitch.
5. **Databricks Partnership:** If the account is a Databricks customer, consider weaving in the Databricks/Unity Catalog integration as a proof point.

**7-Touch Cadence (identical for all 4 sequences):**

| Touch | Day | Channel | Type |
|-------|-----|---------|------|
| 1 | Day 1 | Email | automatic_email, new_thread — same body per sequence |
| 2 | Day 2 | LinkedIn | No-pitch connection request |
| 3 | Day 5 | Email | Reply to Touch 1 thread |
| 4 | Day 8 | Call | Phone task |
| 5 | Day 11 | LinkedIn | Interact with post: like most recent post (last 14 days), auto-complete if none |
| 6 | Day 14 | Email | Reply to Touch 1 thread (breakup) |
| 7 | Day 17 | LinkedIn | Direct message — completely different hook from breakup email |

Touches 3 and 6 are replies to the original thread. Only Touch 1 gets a unique subject line. In Apollo, Touches 3 and 6 use "reply to previous email" step type.

**Touch 5 — LinkedIn Interact with Post (linkedin_interact_post):**
Created as an Apollo task. (On the laptop this was automated by `apollo-linkedin-connect.js`; in cloud it is completed manually in Apollo or by the laptop automation later. The step definition is identical either way.) Task note must be exactly: `"Like most recent LinkedIn post (last 14 days). If no post found, mark complete."`

**Touch 7 — LinkedIn Direct Message:**
Completely different angle from the breakup email. Casual, peer-to-peer. Must reference something specific and real from the contact's LinkedIn profile — a post they wrote, a conference talk they gave, a job anniversary, a project they announced publicly. No pitch. No CTA for a meeting. One observation, one open question. Under 300 characters.

**Touch 7 is the hardest touch to write correctly. Most LLM-generated T7s are garbage. Read these rules carefully.**

Touch 7 hard rules — violations require a full rewrite, not a patch:
- **No em dashes.** Not one. "Hey [Name] —" is an automatic fail.
- **No "Curious" opener.** "Curious what..." / "Curious how..." is banned. It reads as a cold intel-gather, not a genuine question.
- **No role-pain defaults.** "CTO is one of those roles where..." or "As a Staff PM you probably see..." is not personalization. It could be sent to anyone with that title. If you caught yourself writing a sentence that applies to 10,000 people, delete it and do the research.
- **No asking for internal strategy.** Do not ask what their roadmap is, what their biggest bets are, what their team is prioritizing, or any question that requires them to brief you on internal decisions.
- **Must reference ONE specific, named thing from their LinkedIn.** A post by title or topic. A conference they spoke at. A specific project they announced. A milestone. If you cannot name the specific thing, you have not done the research.
- **Zero product mentions.** No You.com, no Search API, no PRAG. The email sequence handles the pitch.
- **Low-stakes question only.** Ask about their perspective on an idea or a trend — not about their company's internal decisions. The question should be something they'd answer over coffee, not something that requires a legal review.
- **Tone:** message from someone they met once at a conference, not a salesperson.

**Mandatory T7 research step (runs before writing any T7 copy):**
For each contact, search (WebSearch or You.com Search): `"{first_name} {last_name}" site:linkedin.com OR "{first_name} {last_name}" "{company}" post OR talk OR article`. Look for:
1. A LinkedIn post from the last 60 days
2. A conference talk or podcast appearance from the last 6 months
3. A project announcement or job milestone from the last 3 months
4. A public article or piece of writing

If a signal is found: write T7 referencing it specifically.
If NO signal is found after searching: write `[T7 PLACEHOLDER — no LinkedIn signal found for {Name}. Manual research required before sending.]` and flag it in the output. **Do NOT write a role-pain DM as a fallback.** A placeholder is better than a generic message that violates every rule.

Example Touch 7 (illustrative only — do not copy):
"Saw your post on RAG evaluation frameworks last week. The point about recall vs. answer quality tradeoffs is something I've been thinking about too. Are you writing more on that or was that a one-off?"

Anti-example (every T7 that looks like this must be rewritten):
"Hey Ben, CTO at a growing company is one of those roles where the job description keeps shifting. Curious what the biggest technical decisions have been over the last year. Is it mostly infrastructure and scale, or more about which AI bets to make?" — BANNED: em dash in original, "Curious" opener, role-pain default, asks for internal strategy, zero LinkedIn research.

## Contact Assignment Rules

- 5 contacts per sequence maximum. No duplicates across sequences (one person, one sequence).
- Seq B: C-suite first, then remaining VPs.
- Seq A, C, D: remaining VPs first, then Directors, then 1-2 managers only as absolute last resort.
- If a persona doesn't exist, fill with closest adjacent role not already assigned. Skip sequence only if no primary or adjacent roles exist.
- Drop contacts without verified emails first when over the 5-contact cap.

## Per-Person Touch 1 Research (Runs Before Writing Any Copy)

For each contact identified in Step 3, run a focused search on the individual — not the company. Use the You.com Search API (`$YDC_API_KEY`), the You.com Search connector, or WebSearch: `"{first_name} {last_name}" "{company_name}"` plus LinkedIn, recent posts, news.

**Collect in priority order — use the highest available:**

1. **Trigger event** — promotion or new role (< 6 months), funding round they're quoted in, product launch they're named in, conference talk announced
2. **Their content** — LinkedIn post in the last 30 days, published article, podcast appearance, public writing
3. **Company initiative they own** — job posting or company blog naming them as leading an AI/search/data buildout
4. **Role-based pain point** — use only if nothing specific is findable; flag as `hook_type: "role_pain"`

For each contact produce:
- `touch1_hook`: one sentence describing the specific signal (e.g., "LinkedIn post Apr 20 on RAG evaluation tradeoffs")
- `touch1_hook_type`: one of `trigger_event`, `their_content`, `company_initiative`, `role_pain`
- `touch1_subject`: personalized subject line under 6 words referencing their company or initiative
- `touch1_body`: the full bespoke email (see Touch 1 AIDA Rules below)

If `hook_type: "role_pain"` for more than 3 contacts in an account, flag this in the output — it means research didn't surface strong individual signals and Andrew may want to manually improve those emails before sending.

---

## Touch 1 AIDA Rules (Per Contact)

Touch 1 is an `automatic_email` step (`email_type: "new_thread"`) — same templated body per sequence, sent automatically when the sequence activates. All 7 touches fire automatically once Andrew activates the sequence in Apollo.

**Word count: 80-120 words. Plain text only. Opens with "Hi {{first_name}}," on its own line.**

**A — Attention (1-2 sentences)**
The person-level hook. Fact-to-consequence bridge. Never a compliment. The personalization must connect directly to a problem — if it dead-ends as praise, cut it.
- BAD: "Inception building its own reasoning stack is a big move."
- GOOD: "Inception building its own reasoning stack means the retrieval layer either keeps pace with live events or becomes the accuracy bottleneck."

**I — Interest (1-2 sentences)**
Hypothesis about their probable problem. Tentative language always — never diagnose pain as fact.
- "Usually when teams are building at this layer, retrieval freshness becomes the limiting factor before model quality does."
- NOT: "You're clearly struggling with X."

**D — Desire (1-2 sentences, or OMIT)**
One proof point only. Use the closest named case study from this table:

| Signal in research | Case study to use |
|---|---|
| Legal, compliance, regulated industry | Harvey |
| AI coding, devtools, documentation retrieval | Windsurf |
| Enterprise AI platform, agentic internal tooling | Salesforce |
| Data platforms, Databricks customers | Databricks |
| Retail, consumer products, e-commerce | Strauss |

**If no case study fits cleanly: skip Desire entirely and go straight to Action.** Do not force a mismatched proof point. A clean 3-part email beats a 4-part email with a poor-fit case study.

**A — Action (1 sentence)**
Interest-based CTA only. Never time-based ("15 minutes," "quick call this week").
- "Is this something you're evaluating?"
- "Worth a conversation?"
- "Open to exploring this?"

---

## Warm Intro Context (from Step 1 CTD Research)

If the Step 1 research brief (Section 9, Warm Intro Paths) flagged any contacts with `warm_intro=true`:
- Check which contacts in the sequence assignments have `warm_intro=true`
- For warm intro contacts: the Touch 1 email CAN reference the shared connection as the hook IF the AE confirms the intro has been made. Do NOT assume the intro has happened.
- Default behavior: write cold hooks for all contacts. Note in the output which contacts have warm paths available, so the AE can swap in warm hooks after intros are made.
- Warm intro hook (priority 0, above trigger events): "{Connector} mentioned you'd be the right person to talk to about {problem}." Only use when intro is confirmed.
- Contacts tagged `sequence_note: "WARM INTRO ONLY"` must not be cold-enrolled. Leave a placeholder in the JSON and note clearly that enrollment is blocked until intro is confirmed.

## Critical Writing Rules

See references/writing-rules.md for full detail. Non-negotiables:
- NEVER use em dashes. Use commas, periods, colons, semicolons, or pipes instead.
- Plain text only in email bodies. No markdown (no bold, italic, headers, numbered lists).
- AIDA structure required for every email touch (see references/writing-rules.md).
- Every opener starts with THEM, never "I," "We," "Our," or "At You.com."
- Word counts: Touch 1 email 80-120 words, Touch 3 and 5 emails 80-120 words.
- Interest-based CTAs only. No time-based asks ("15 minutes," "quick call this week").
- One proof point per email, one CTA per email. Never stack.
- 5th-7th grade reading level. Short sentences, no compound-complex structures.
- Strip corporate suffixes ("Teradata" not "Teradata Corporation").
- At least one touch per sequence references Richard Socher (not Bryan McCann).
- At least one touch per sequence uses a public proof point (Harvey, Windsurf, Salesforce, Databricks, or generic traction stats).
- Never name competitors, never reference specific evaluations (even anonymized).
- Every email opens with "Hi {{first_name}}," on its own line.
- Never write "our APIs," "our founder," or "our case studies." Name You.com explicitly: "You.com's APIs," "You.com's founder."
- LinkedIn notes: never write "Curious how your team is thinking about [X]." Replace with Fact-to-Consequence + Research-Share Close: ", would love to connect and share more of my research."

## Self-Review Gate (MANDATORY — Run Before Writing JSON)

After generating all 4 sequences but BEFORE producing the in-memory JSON, explicitly check every email touch against this list. Fix any violations before proceeding. This is a gate, not a log.

| Rule | Check |
|------|-------|
| No em dashes | Scan all copy. Replace with comma, colon, or period. |
| AIDA structure | Touch 1: A/I/D(optional)/A. Touches 3+6: A/I/D/A. Desire omitted only when no case study fits cleanly. |
| Touch 1 is automatic_email | Touch 1 type must be `automatic_email`, NOT `manual_email`. |
| Per-contact Touch 1 fields present | Every contact has `touch1_subject`, `touch1_body`, `touch1_hook`, `touch1_hook_type`. |
| Touch 1 hook bridges to a problem | No compliment dead-ends. Every hook connects to a consequence or pain point. |
| Openers start with THEM | No email begins with "I," "We," "Our," or "At You.com." |
| Interest = hypothesis | "Usually when teams do X..." not "You're clearly struggling with X." |
| Interest-based CTA only | No "15 minutes," "quick call this week," or day/time asks. |
| One proof point per email | Never two case studies or two stats in a single touch. |
| One CTA per email | Never stack asks. |
| No AI glazing | Every research hook bridges to a problem. No compliment dead-ends. |
| No competitor names | No Exa, Tavily, Perplexity, Vertex AI, Bing API. |
| No eval references | No specific eval details, even anonymized. |
| No AI-ism vocab | Scan for: utilize, comprehensive, enhance, delve, embark, robust, streamline, strong signal. |
| No banned openers | Check against 8 banned openers in references/writing-rules.md. |
| Socher credibility present | At least one touch per sequence references Socher (not McCann). |
| Public proof point present | At least one touch per sequence uses named case study (Harvey, Windsurf, Salesforce, Databricks, Strauss) or traction stats. |
| Word counts | All email touches: 80-120 words. (Gong 28M analysis: 50-80 is the sweet spot; 80-120 gives AIDA room.) LinkedIn connect (Touch 2): under 250 chars. LinkedIn DM (Touch 7): under 300 chars. |
| Follow-up qualifier openers | Touches 3 and 6: body after greeting starts with the new hook. No qualifier phrases: "Last note," "One more thing," "One more angle," "Closing the loop," "Quick follow-up," "Additional context." |
| New reason in every follow-up | Touch 3 angle is substantively different from Touch 1. Touch 6 (breakup) introduces a third distinct angle. If 3 distinct angles don't exist for the account, collapse to 3 email touches. |
| No hide-the-company language | No "our APIs," "our founder," "our case studies." Every product/founder reference names You.com explicitly. |
| LinkedIn connect: zero pitch + Research-Share Close | Touch 2: No product names, no flattery, no role claim, no question close. Ends with ", would love to connect and share more of my research." |
| Action item task note | Touch 5: instructs AE to view profile, engage with recent post, note content for Touch 7. |
| LinkedIn DM: specific LinkedIn signal | Touch 7: names a specific post, talk, project, or milestone from their actual LinkedIn. "CTO is one of those roles..." or any role-pain sentence = automatic rewrite. Zero product mention. Zero meeting CTA. |
| LinkedIn DM: no em dashes | Scan every T7 for "—". One em dash = rewrite the whole message. |
| LinkedIn DM: no "Curious" opener | Scan every T7 for "Curious". If present = rewrite. Replace with a direct observation or statement. |
| LinkedIn DM: no internal strategy ask | T7 must not ask what their roadmap is, their biggest bets, their team's priorities, or any question requiring internal disclosure. |
| LinkedIn DM: placeholder if no signal | If no specific LinkedIn signal was found for a contact, output is a placeholder, NOT a role-pain fallback. |
| Short paragraphs | 2-3 sentences max per paragraph. |
| Plain text only | No markdown formatting in email bodies. |
| No corporate suffixes | "Plaid" not "Plaid Inc." |
| 5th-7th grade reading level | Short sentences, no compound-complex structures. |

## JSON Output Format

After the self-review gate passes, hold the sequence data in memory and pass it directly to ydc-apollo-build (Step 5+6). No local JSON file is written.

See references/json-format.md for the full in-memory schema.

## Build Method (Cloud — Apollo.io Connector via ydc-apollo-build)

Sequences are built by ydc-apollo-build using the Apollo.io connector tools (e.g. function names ending in `apollo_emailer_campaigns_search`, `apollo_contacts_create`, `apollo_emailer_campaigns_add_contact_ids`). The laptop Playwright path (`build-sequences.js` + `~/.apollo-playwright-profile`) is not available in cloud and is not used.

LinkedIn connect (T2) and LinkedIn DM (T7) ARE Apollo sequence steps. Their copy is included inline in the content structure below. No LinkedIn queue Drive file is written.

Content structure (held in memory, handed to ydc-apollo-build):
```json
{
  "account": "Company Name",
  "sequences": [
    {
      "name": "YDC | Company | Seq A: Engineering Leader",
      "steps": [
        { "type": "automatic_email", "email_type": "new_thread", "subject": "...", "body": "Hi {{first_name}},\n\n..." },
        { "type": "linkedin_connect", "message": "..." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\n..." },
        { "type": "phone_call", "task_note": "..." },
        { "type": "linkedin_interact_post", "task_note": "Like most recent LinkedIn post (last 14 days). If no post found, mark complete." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\n..." },
        { "type": "linkedin_message", "message": "..." }
      ]
    }
  ]
}
```

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-17 | Cloud port created from skills/ydc-outreach | Migration to Claude Code Routines: per-person research falls back from `$YDC_API_KEY` to You.com Search connector/WebSearch, Playwright build path (`build-sequences.js`, local profile) replaced by ydc-apollo-build over the Apollo.io connector, Touch 5 laptop automation (`apollo-linkedin-connect.js`) noted as manual Apollo task in cloud, explicit no-write boundary added; copy rules, cadence, gates, and templates unchanged |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added mandatory T7 research step before writing any LinkedIn DM | LLM-generated T7s were defaulting to role-pain templates instead of contact-specific signals |
| (prior) | Added Touch 5 as `linkedin_interact_post` (like recent post) | Replaces the previous `action_item` type; confirms the exact Apollo task type returned by REST API |
| (prior) | Added LinkedIn connect note rule: end with ", would love to connect and share more of my research." | Replaced "Curious how your team is thinking about [X]" close which triggered negative responses |
| (prior) | Added no-qualifier-opener rule for follow-up bodies (Touches 3 and 6) | "Last note," "One more angle," etc. signal sequence automation and reduce reply rates |
| (prior) | Added Self-Review Gate (mandatory before writing JSON) | Outreach copy consistently contained em dashes, glazing, and mismatched case studies before gating was enforced |
| (prior) | Added SFDC-Informed Outreach Adjustments section | Pipeline had no mechanism to avoid re-pitching products that were previously lost or contacting warm paths with cold copy |
| (prior) | Added per-contact Touch 1 research step (Step 3.5) | All contacts in a sequence previously received identical copy; per-person hooks significantly improve reply rates |
