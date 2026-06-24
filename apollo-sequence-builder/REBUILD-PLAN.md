# Apollo Sequence Rebuild Plan
Last updated: 2026-05-21

## Confirmed Working (2026-05-21)
- build-sequences.js auth fix: launchPersistentContext (NOT storageState) — DONE
- LlamaIndex Seq A test: 7 steps created, all content filled — PASSED
- Seq ID: 6a0f7e349d17db0018f5fd2f

## All Accounts Complete (as of 2026-05-22)
- LlamaIndex ✅ built + enrolled
- Inception ✅ built + enrolled
- Dun & Bradstreet ✅ built + enrolled (Michael Manos, Gary Kotovets, Aaron Rozek, Jeremiah Sadow)
- Dagster Labs ✅ built + enrolled (Alec Hipshear, Nick Schrock, Yuhan Luo, Eric Larson)
- Day AI ✅ built + enrolled (Kiran Surdhar, Christopher O'Donnell, Will Finigan, Gwendolyn Reynolds)

## Decision
Rebuilding all account sequences using the correct architecture. Old hybrid approach (create via REST, fill via separate Playwright pass) was broken and abandoned.

## Correct Architecture

### 4 Sequences Per Account (not 2)
| Seq | Name Pattern | Personas |
|-----|-------------|---------|
| A | YDC \| {Company} \| Seq A: Engineering Leader | Dir/VP/SVP Eng, Head of Eng |
| B | YDC \| {Company} \| Seq B: Executive Sponsor | CTO, CIO, Chief AI Officer, CDO |
| C | YDC \| {Company} \| Seq C: Product Leader | Dir/VP/Head of Product |
| D | YDC \| {Company} \| Seq D: AI/ML Leader | Head of AI/ML, VP Data Science, ML Eng Directors |

### 7 Touches Per Sequence (all in Apollo — LinkedIn IS in the sequence)
| Touch | Day | Type | Notes |
|-------|-----|------|-------|
| T1 | Day 1 | `automatic_email`, `email_type: "new_thread"` | Unique subject per sequence |
| T2 | Day 2 | `linkedin_connect` | `message` field, <250 chars, ends with ", would love to connect and share more of my research." |
| T3 | Day 5 | `automatic_email`, `email_type: "reply"` | New proof point, no subject |
| T4 | Day 8 | `phone_call` | Call script in `task_note` |
| T5 | Day 11 | `action_item` | `task_note`: view profile, engage post, note topic for T7 |
| T6 | Day 14 | `automatic_email`, `email_type: "reply"` | Breakup, third distinct angle |
| T7 | Day 17 | `linkedin_message` | `message` field, <300 chars, different hook, no product mention, no CTA |

### Build Method (proven working 2026-05-21)
- Script: `build-sequences.js` (already exists, already correct)
- Auth: `launchPersistentContext` + `~/.apollo-playwright-profile` — NOT apollo_session.json/storageState (that approach expires). Chrome stays open, no conflict.
- Creates sequences through Apollo UI, fills content inline as each step is added
- Zero page reloads between steps
- Uses before/after snapshot counts to target only newly-added DOM elements
- Run: `HEADED=true node build-sequences.js <content-file.json>`

---

## LlamaIndex Test (First Account)

### Status
- All old blank sequences archived by user (2026-05-21)
- Wrong content file written and needs replacing: `llamaindex-7touch-content.json` (DELETE — 2 sequences, wrong naming)

### Files to Create
1. `llamaindex-4seq-content.json` — full 4-sequence content file
2. `llamaindex-seqA-test.json` — Seq A only, for single-sequence test run

### LlamaIndex Sequence Angles
| Seq | Primary Hook | Proof Point | Socher Touch |
|-----|-------------|-------------|-------------|
| A: Engineering Leader | Bing deprecation — search built for browsers vs. machine consumption | Windsurf | T3 |
| B: Executive Sponsor | Databricks three-way overlap — mutual enterprise customers | Databricks/Salesforce | T3 |
| C: Product Leader | LlamaParse enterprise focus — citation integrity for finance/legal/biopharma | Harvey | T3 |
| D: AI/ML Leader | Multi-hop pipeline freshness — RAG grounding at production scale | DuckDuckGo | T3 |

### Test Steps
1. Delete `llamaindex-7touch-content.json`
2. Write `llamaindex-4seq-content.json` (4 sequences × 7 touches)
3. Write `llamaindex-seqA-test.json` (Seq A only extracted from full file)
4. Run Seq A test: `HEADED=true node build-sequences.js llamaindex-seqA-test.json`
5. Review in Apollo: 7 steps created, correct types, no blank content
6. If pass: `HEADED=true node build-sequences.js llamaindex-4seq-content.json`
7. Review all 4 in Apollo

---

## After LlamaIndex Proves Out — Remaining Accounts

These accounts had blank sequences archived. Need fresh 4-sequence builds:
- D&B (Dun & Bradstreet) — content exists in `dnb-fill-content.json` (4-step, needs rewrite for 4-seq 7-touch)
- Dagster Labs — content exists in `dagster-fill-content.json` (4-step, needs rewrite)
- Day AI — content exists in `dayai-fill-content.json` (4-step, needs rewrite)
- Inception — had 9 steps (4 real + 5 garbage), all archived, needs fresh build

Process for each: write `{company}-4seq-content.json`, run `build-sequences.js`, review.

---

## Skill Updates (After LlamaIndex Proven)

### 1. `/Users/andrew/.claude/skills/ydc-outreach/SKILL.md`
- Change T1 from `manual_email` → `automatic_email`
- Update sequence architecture section: 7-touch with LinkedIn IN the Apollo sequence
- Remove LinkedIn queue separation (connect_note / dm_message as Drive file)
- Keep the 4-sequence model (A-D) — this is already correct in the skill

### 2. `/Users/andrew/.claude/skills/ydc-territory-pipeline/SKILL.md`
- Replace 2-sequence model (Technical Evaluator / Business Sponsor) with 4-sequence model (A-D)
- Update name patterns, persona pools, step structure to match proven format

### 3. Delete obsolete files
- `llamaindex-fill-content.json` (old 4-step hybrid)
- `llamaindex-7touch-content.json` (wrong 2-sequence naming)
- `dnb-fill-content.json`, `dagster-fill-content.json`, `dayai-fill-content.json` (old 4-step format — delete after rewrites confirmed)

---

## Content JSON Format (for build-sequences.js)

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
        { "type": "action_item", "task_note": "View profile and engage 1-2 recent posts from the last 2 weeks. Note the topic of their most recent original post for Touch 7 LinkedIn DM." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\n..." },
        { "type": "linkedin_message", "message": "..." }
      ]
    }
  ]
}
```

---

## Writing Rules (Non-Negotiables)
- No em dashes anywhere
- No AI-isms: utilize, comprehensive, enhance, delve, robust, streamline
- No competitor names
- Every email opens with "Hi {{first_name}}," on its own line
- Subject lines under 6 words
- Email bodies 80-120 words
- T2 linkedin_connect: <250 chars, no pitch, ends with ", would love to connect and share more of my research."
- T7 linkedin_message: <300 chars, no product mention, no meeting CTA, different hook from T6
- T3 and T6: start body with new hook after greeting — no qualifier openers ("Last note," "One more angle," etc.)
- Each follow-up adds a new proof point or angle — not a rephrase
- At least one Socher reference per sequence
- At least one named proof point per sequence (Harvey, Windsurf, Salesforce, Databricks, DuckDuckGo)
- Plain text only — no markdown in email bodies
- No "our APIs" / "our founder" — always "You.com's APIs" / "You.com's founder"
