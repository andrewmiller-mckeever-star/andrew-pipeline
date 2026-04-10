---
name: ydc-outreach
description: Generates 4 personalized outreach sequences (A: Engineering Leader, B: Executive Sponsor, C: Product Leader, D: AI/ML Leader) for You.com whale account pipeline. Each sequence has 7 touches: Email Day 1 (new thread), LinkedIn Connect Day 2, Email reply Day 5, Phone call Day 8, LinkedIn profile view action item Day 11, Email reply/breakup Day 14, LinkedIn direct message Day 17. Outputs in-memory JSON for Apollo injection — no .docx file created. Includes mandatory self-review gate before producing JSON. Use when user says "draft outreach for [company]", "write sequences for [company]", "outreach sequences", "generate outreach copy", or "Step 4" in the pipeline.
---

# YDC: Outreach Sequence Generation (Step 4)

## Sequence Architecture

4 sequences per account, each targeting a different buyer persona:

| Sequence | Target Persona | Use Case Focus |
|----------|---------------|----------------|
| Seq A: Engineering Leader | Dir of Eng, VP Eng, SVP Eng, Head of Eng | Search API infra, technical integration, platform decisions |
| Seq B: Executive Sponsor | CTO, CIO, Chief AI Officer, CDO, CSO. CEO only as last resort (warm intro only). | Strategic AI infrastructure, business case, enterprise decisions |
| Seq C: Product Leader | Dir of Product, VP Product, Head of Product | Product outcomes mapped to AI search infra or PRAG |
| Seq D: AI/ML Leader | Head of AI/ML, VP Data Science, Dir of Data Science, ML Eng Directors | RAG pipelines, AI agent grounding, model infra, search layer |

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
| 1 | Day 1 | Email | New thread, unique subject |
| 2 | Day 2 | LinkedIn | No-pitch connection request |
| 3 | Day 5 | Email | Reply to Touch 1 thread |
| 4 | Day 8 | Call | Phone task |
| 5 | Day 11 | LinkedIn | Action item: view profile + engage with recent content |
| 6 | Day 14 | Email | Reply to Touch 1 thread (breakup) |
| 7 | Day 17 | LinkedIn | Direct message — completely different hook from breakup email |

Touches 3 and 6 are replies to the original thread. Only Touch 1 gets a unique subject line. In Apollo, Touches 3 and 6 use "reply to previous email" step type.

**Touch 5 — LinkedIn Profile View (action_item):**
Task note instructs the AE to: view the prospect's LinkedIn profile (triggers a "profile view" notification), like or comment on a recent post if one exists, and note any new content for use in Touch 7.

**Touch 7 — LinkedIn Direct Message (Option B):**
Completely different angle from the breakup email. Uses the LinkedIn channel to say something that would feel out of place in a cold email: casual, peer-to-peer, referencing something specific they posted, a career milestone, a conference talk, or a shared professional interest visible on their profile. No pitch. No CTA for a meeting. One sentence observation, one open question. Keep under 300 characters.

Touch 7 rules:
- Do NOT repeat or rephrase the email sequence angle
- Do NOT mention You.com, the Search API, or any product by name
- DO reference something visible on their LinkedIn (a post they wrote, a project they announced, a recent job anniversary, a conference they spoke at)
- DO end on a genuine, low-stakes question — not "open to connecting?" or "would love to chat"
- Tone: like a message from someone they met once at a conference, not a salesperson

Example Touch 7 (illustrative only, do not copy):
"Saw your post on RAG evaluation frameworks last week — the point about recall vs. answer quality tradeoffs was something I've been thinking about too. Are you writing more on that or was that a one-off?"

## Contact Assignment Rules

- 5 contacts per sequence maximum. No duplicates across sequences (one person, one sequence).
- Seq B: C-suite first, then remaining VPs.
- Seq A, C, D: remaining VPs first, then Directors, then 1-2 managers only as absolute last resort.
- If a persona doesn't exist, fill with closest adjacent role not already assigned. Skip sequence only if no primary or adjacent roles exist.
- Drop contacts without verified emails first when over the 5-contact cap.

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
- At least one touch per sequence uses a public proof point (DuckDuckGo, Harvey, Windsurf, Databricks, or generic traction stats).
- Never name competitors, never reference specific evaluations (even anonymized).
- Every email opens with "Hi {{first_name}}," on its own line.

## Self-Review Gate (MANDATORY — Run Before Writing JSON)

After generating all 4 sequences but BEFORE writing the JSON file, explicitly check every email touch against this list. Fix any violations before proceeding. This is a gate, not a log.

| Rule | Check |
|------|-------|
| No em dashes | Scan all copy. Replace with comma, colon, or period. |
| AIDA structure | Every email: Attention / Interest / Desire / Action in order. |
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
| Public proof point present | At least one touch per sequence uses named case study or traction stats. |
| Word counts | Touch 1: 100-150 words. Touches 3 and 6: 80-120 words. LinkedIn connect (Touch 2): under 250 chars. LinkedIn DM (Touch 7): under 300 chars. |
| LinkedIn connect: zero pitch | Touch 2: No product names, no CTA, no flattery, no role claim. |
| Action item task note | Touch 5: instructs AE to view profile, engage with recent post, note content for Touch 7. |
| LinkedIn DM: different hook | Touch 7: references something from their LinkedIn (post, milestone, talk). Zero product mention. Zero meeting CTA. |
| Short paragraphs | 2-3 sentences max per paragraph. |
| Plain text only | No markdown formatting in email bodies. |
| No corporate suffixes | "Plaid" not "Plaid Inc." |
| 5th-7th grade reading level | Short sentences, no compound-complex structures. |

## JSON Output Format

After the self-review gate passes, write the JSON to:
~/Desktop/YDC Pipeline/apollo-sequence-builder/{account}_sequences.json

See references/json-format.md for the full JSON schema.

**CRITICAL: Playwright Script Type Compatibility (DO NOT DEVIATE)**

The Playwright script ONLY accepts these exact step type values:
- `automatic_email` (with `email_type`: `"new_thread"` or `"reply"`)
- `manual_email`
- `phone_call` (with `task_note` for call script)
- `linkedin_connect` (with `message` for the connection note, NOT `note`)
- `linkedin_message`
- `action_item`

NEVER use: `reply_to_previous_email`, `manual_call`, or any other invented type names.
NEVER use `note` as the field name for LinkedIn connect text. The script reads `message`.

Quick reference for the 7-touch cadence:
- Touch 1: `{"type": "automatic_email", "email_type": "new_thread", "subject": "...", "body": "..."}`
- Touch 2: `{"type": "linkedin_connect", "message": "..."}`
- Touch 3: `{"type": "automatic_email", "email_type": "reply", "body": "..."}`
- Touch 4: `{"type": "phone_call", "task_note": "..."}`
- Touch 5: `{"type": "action_item", "task_note": "View [First] [Last]'s LinkedIn profile. Like or comment on a recent post if one exists in the last 2 weeks. Note any post topics or career updates to use in Touch 7."}`
- Touch 6: `{"type": "automatic_email", "email_type": "reply", "body": "..."}`
- Touch 7: `{"type": "linkedin_message", "message": "..."}`

Then alert the user to run:
```
cd ~/Desktop/YDC\ Pipeline/apollo-sequence-builder && HEADED=true node build-sequences.js {account}_sequences.json
```
