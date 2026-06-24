# Apollo Hybrid Sequence Build Plan
_Written 2026-05-20. Reference if context window resets._

---

## Background / Why This Exists

Apollo's REST API silently ignores `emailer_template` content (subject, body_html) when passed inside `POST /emailer_steps`. This is because Apollo's data model separates content from structure:
- **Templates** store email subject + body
- **Sequence steps** are containers that _reference_ a template
- You cannot set email content directly on a step via the public/undocumented REST API

Apollo's officially documented API only covers: search sequences, add contacts, remove contacts. Everything else (`POST /emailer_campaigns`, `POST /emailer_steps`, `POST /emailer_templates`) is internal/undocumented.

The `note` field on `action_item` and `phone_call` steps DOES work via REST — only email content is broken.

`build-sequences.js` (Playwright) works because it drives the Apollo UI directly, making the correct internal API calls. But it is complex and brittle.

---

## The Fix: Hybrid Approach

**REST API** handles structure. **Playwright** handles content.

---

## Phase 1 — REST API (structure only)

1. `POST /emailer_campaigns` — create sequence shell
2. `PUT /emailer_campaigns/{id}` with `{"user_id": "69c2b4822d0a4900117855af"}` — transfer ownership to Andrew (REQUIRED — Apollo ignores user_id in POST body)
3. `POST /emailer_steps` for each step — creates type + wait_time + position only
   - **Do NOT include `emailer_template` fields** — they do nothing and are misleading
   - **DO include `note` field** for `action_item` and `phone_call` steps — this works via REST
4. `POST /emailer_campaigns/{id}/add_contact_ids` — enroll contacts

Result: sequences in Apollo with correct ownership + step structure + contacts enrolled, but email steps have no content yet.

---

## Phase 2 — Playwright (`fill-sequence-content.js`)

A new script that takes a JSON file and fills email content into blank steps.

### Input format
```json
{
  "sequences": [
    {
      "id": "apollo_sequence_id",
      "name": "YDC | Company | Seq 1: Technical Evaluator",
      "steps": [
        {
          "position": 1,
          "type": "manual_email",
          "subject": "Subject line here",
          "body": "Hi {{first_name}},\n\nBody text...\n\nAndrew\nYou.com"
        },
        {
          "position": 2,
          "type": "linkedin_connect",
          "message": "Connect note under 250 chars..."
        },
        {
          "position": 3,
          "type": "automatic_email",
          "body": "Hi {{first_name}},\n\nFollow-up body...\n\nAndrew"
        },
        {
          "position": 4,
          "type": "action_item"
        },
        {
          "position": 5,
          "type": "automatic_email",
          "body": "Hi {{first_name}},\n\nBreakup body...\n\nAndrew"
        },
        {
          "position": 6,
          "type": "linkedin_message",
          "message": "LinkedIn DM under 300 chars..."
        }
      ]
    }
  ]
}
```

### What the script does
- Navigates to each sequence by ID in Apollo UI
- For each **email step** (manual or auto): clicks step → clicks "Template" tab → injects subject via input field, body via Quill editor → saves
- For **LinkedIn connect/DM steps**: fills the message field
- For **action_item / phone_call**: skips (note already written via REST in Phase 1)
- **Toggles each step ON** as it goes — eliminates manual toggling
- Leaves the **sequence itself INACTIVE** — Andrew still activates manually

### Step enabling behavior
- Every step gets toggled ON by the script
- The `manual_email` step still acts as a gate: contact pauses there, a task appears in Apollo Tasks > Manual Emails, Andrew reviews and edits before sending
- All auto steps being ON means they fire automatically after Touch 1 is sent
- Andrew only needs to activate the sequence itself (1 toggle per sequence, not 4-7)

---

## What Changes in the REST Part

Almost nothing:
- Remove `emailer_template: {...}` from `POST /emailer_steps` for email steps (they don't work)
- Keep `note` field on `action_item` and `phone_call` steps (this works)
- Everything else (sequence creation, ownership transfer, enrollment) unchanged

---

## Nightly Pipeline Integration

After Phase 1 (REST builds sequences + enrolls contacts), the pipeline:
1. Writes the sequence content to a JSON file on disk (e.g., `/tmp/sequences-{company}-{date}.json`)
2. Calls `node /path/to/fill-sequence-content.js /tmp/sequences-{company}-{date}.json`
3. Playwright runs headed or headless, fills all content, enables all steps
4. Pipeline posts Slack summary confirming sequences are ready

**Open question (to decide):** Should this be automatic in the pipeline, or should the pipeline alert Andrew in Slack so he can review the generated copy before it goes into Apollo?

---

## Touch 1 for Territory Pipeline

The existing `Inception_sequences.json` has `{{CONTACT_SPECIFIC}}` as T1 — designed for the whale pipeline where Andrew writes a custom T1 per contact via `prefill-touch1.js`.

For the territory pipeline (template sequences with 10-15 contacts per sequence), T1 should be a real template. The manual_email task in Apollo still lets Andrew edit before sending.

**Open question (to decide):** Real T1 template applied to all contacts (Andrew edits per-contact at send time) vs. `{{CONTACT_SPECIFIC}}` placeholder as visual reminder to write custom T1.

---

## Current State (2026-05-20)

### 10 sequences archived (blank, 0 enrolled):
| Sequence | ID | Steps |
|---|---|---|
| YDC \| Inception \| Seq 1: Technical Evaluator | `6a0e01c1d2b836000c3820df` | 9 (4 real + 5 debug garbage) |
| YDC \| Inception \| Seq 2: Business Sponsor | `6a0e01c53bb38d001495de18` | 4 clean |
| YDC \| LlamaIndex \| Seq 1: Technical Evaluator | `6a0e01cf9b81ba002077563c` | 4 clean |
| YDC \| LlamaIndex \| Seq 2: Business Sponsor | `6a0e01d2697976001c3b8792` | 4 clean |
| YDC \| Dun & Bradstreet \| Seq 1: Technical Evaluator | `6a0e01d6caedaa001820c404` | 4 clean |
| YDC \| Dun & Bradstreet \| Seq 2: Business Sponsor | `6a0e01d9d1f3010018ec353b` | 4 clean |
| YDC \| Dagster Labs \| Seq 1: Technical Evaluator | `6a0e01db1e484a001c6b4736` | 4 clean |
| YDC \| Dagster Labs \| Seq 2: Business Sponsor | `6a0e01df1e484a001c6b4914` | 4 clean |
| YDC \| Day AI \| Seq 1: Technical Evaluator | `6a0e01e348ed3300181a0c31` | 4 clean |
| YDC \| Day AI \| Seq 2: Business Sponsor | `6a0e01e7d1f3010018ec42a8` | 4 clean |

### Content available on disk:
- `apollo-sequence-builder/Inception_sequences.json` — T3, T6 email body, LinkedIn notes (T1 is `{{CONTACT_SPECIFIC}}`)
- `apollo-sequence-builder/LlamaIndex_sequences.json` — same
- D&B, Dagster Labs, Day AI — no sequence JSON files; have brief files with hook strategy
  - `DunBradstreet_brief.md`
  - `DagsterLabs_brief.md`
  - `DayAI_brief.md`
  - LinkedIn queue files in Drive (have connect notes + DMs for these 3)

### Andrew's Apollo IDs:
- User ID: `69c2b4822d0a4900117855af`
- Email account ID: `69655755f84adb0011b0d13b`
- API service account (sequences created under if you skip the PUT): `690a9832ccf497001dddd69e`

---

## Testing Plan

1. Unarchive **Inception Seq 2** (`6a0e01c53bb38d001495de18`) — 4 clean blank steps, safest test target
2. Write `fill-sequence-content.js`
3. Create test input JSON using Inception Seq 2 ID + Seq B content from `Inception_sequences.json`
4. Run script HEADED to watch it work
5. Verify in Apollo UI: email content in all 3 email steps, all steps toggled ON
6. If passes: unarchive remaining 9 sequences, run fill script for all
7. Update `ydc-apollo-build/SKILL.md` with hybrid approach

**Inception Seq 1 issue:** Has 9 steps (4 real + 5 debug garbage). Options:
- Archive Seq 1, create fresh via REST, fill via Playwright — cleanest
- Or fill first 4 steps, ignore the 5 debug ones

---

## Key Files
- `apollo-sequence-builder/build-sequences.js` — original Playwright full-build script (reference for UI interaction patterns)
- `apollo-sequence-builder/fill-existing-sequences.js` — adds steps to 0-step sequences (reference for step-adding Playwright patterns)
- `apollo-sequence-builder/schema.example.json` — sequence JSON format reference
- `apollo-sequence-builder/intercept-step.js` — script to capture Apollo UI network calls (run to debug API behavior)
- `skills/ydc-apollo-build/SKILL.md` — needs updating once hybrid is tested
- `ae-config.md` — Apollo auth, user IDs, email account IDs
