# Skill & Routine Update Plan
Last updated: 2026-05-21
Status: PENDING — LlamaIndex Seq A confirmed working. Updates not yet executed.

## Context
Proved that build-sequences.js with launchPersistentContext works for 7-touch 4-sequence
builds. Now need to update all skills and routines to reflect the proven approach so
future sessions don't revert to the broken methods.

## What Was Proven Working (2026-05-21)
- Script: build-sequences.js
- Auth: launchPersistentContext + ~/.apollo-playwright-profile (NOT apollo_session.json/storageState)
- Test: YDC | LlamaIndex | Seq A: Engineering Leader — 7 steps created, all content filled, saved
- Sequence ID: 6a0f7e349d17db0018f5fd2f

## Proven Sequence Architecture
- 4 sequences per account: Seq A: Engineering Leader, Seq B: Executive Sponsor,
  Seq C: Product Leader, Seq D: AI/ML Leader
- 7 touches per sequence, ALL in Apollo (LinkedIn IS in the sequence — no separate queue file)
- T1: automatic_email (new_thread) — NOT manual_email
- T2: linkedin_connect (message <250 chars)
- T3: automatic_email (reply)
- T4: phone_call (task_note)
- T5: action_item (task_note)
- T6: automatic_email (reply, breakup)
- T7: linkedin_message (message <300 chars)

---

## Files to Update (in execution order)

---

### 1. MEMORY.md — FIX IMMEDIATELY (breaks every session if wrong)
File: /Users/andrew/.claude/projects/-Users-andrew-Downloads-Claud-Code-folder--YDCpipeline/memory/MEMORY.md

FIND this line:
  "Apollo scripts no longer require Chrome to close — they use `apollo_session.json`
  (storageState). If session file missing, run `node save-apollo-session.js` once.
  Never ask user to close Chrome for build-sequences.js or prefill-touch1.js."

REPLACE WITH:
  "Apollo scripts use launchPersistentContext with ~/.apollo-playwright-profile — NOT
  apollo_session.json/storageState (that approach expires and causes 'Not logged into
  Apollo' failures). Profile persists across restarts, no re-login needed. Chrome can
  stay open. If ~/.apollo-playwright-profile is missing, run node save-apollo-session.js
  once to create it. Never reference apollo_session.json for build-sequences.js."

Status: PENDING

---

### 2. ydc-edit-sequences skill.md — Fix wrong auth statement
File: /Users/andrew/.claude/skills/ydc-edit-sequences/skill.md

FIND (Step 5 section):
  "**build-sequences.js** and **archive-sequences.js** use `apollo_session.json`
  (storageState) — Chrome does NOT need to be closed for these scripts."

REPLACE WITH:
  "**build-sequences.js** uses `launchPersistentContext` with `~/.apollo-playwright-profile`
  — Chrome does NOT need to be closed. **archive-sequences.js** uses `apollo_session.json`
  (storageState) — also fine with Chrome open. Neither script requires closing Chrome."

Status: PENDING

---

### 3. ydc-outreach SKILL.md — T1 type + remove LinkedIn queue section
File: /Users/andrew/.claude/skills/ydc-outreach/SKILL.md

CHANGE 1 — 7-touch cadence table, Touch 1 row:
  FIND:    "| 1 | Day 1 | Email | Manual email task, personalized per contact"
  REPLACE: "| 1 | Day 1 | Email | automatic_email, new_thread — same body per sequence"

CHANGE 2 — Self-Review Gate table:
  FIND:    "| Touch 1 is manual_email | Touch 1 type must be `manual_email`, NOT `automatic_email`. |"
  REPLACE: "| Touch 1 is automatic_email | Touch 1 type must be `automatic_email`, NOT `manual_email`. |"

CHANGE 3 — Replace entire bottom section "4-Touch Cadence (Apollo REST API — cloud-native)"
  (starts at line ~194 "**4-Touch Cadence (Apollo REST API — cloud-native)**")
  Delete from that line through the end of the file.
  REPLACE WITH:

  ## Build Method (Playwright — build-sequences.js)

  Sequences are built via build-sequences.js (NOT Apollo REST API).
  Auth: launchPersistentContext + ~/.apollo-playwright-profile.
  Run: HEADED=true node build-sequences.js {company}-4seq-content.json

  LinkedIn connect (T2) and LinkedIn DM (T7) ARE Apollo sequence steps.
  They are filled by build-sequences.js inline. No LinkedIn queue Drive file is written.

  Content JSON format (passed to build-sequences.js):
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
          { "type": "action_item", "task_note": "View profile, engage 1-2 recent posts, note topic for T7." },
          { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\n..." },
          { "type": "linkedin_message", "message": "..." }
        ]
      }
    ]
  }

Status: PENDING

---

### 4. ydc-apollo-build SKILL.md — Major rewrite (Phase A + Phase C)
File: /Users/andrew/.claude/skills/ydc-apollo-build/SKILL.md

CHANGE 1 — Frontmatter description (line 3):
  FIND:    "Uses Apollo REST API to create 4-touch email sequences (manual email Touch 1,
            auto email Touches 3+6, action item Touch 5). Generates a LinkedIn queue file
            in Drive with personalized connect notes and DM messages per contact."
  REPLACE: "Builds 4-sequence 7-touch Apollo sequences via build-sequences.js (Playwright).
            LinkedIn connect (T2) and DM (T7) are Apollo sequence steps — no Drive queue
            file. Contact enrollment via Apollo REST API. Auth via ~/.apollo-playwright-profile."

CHANGE 2 — Step 6 sequence structure table:
  FIND the 4-row table (Touch 1/3/5/6) and REPLACE WITH:
  | Touch | Day | Type | Notes |
  |-------|-----|------|-------|
  | T1 | Day 1  | automatic_email (new_thread) | Unique subject per sequence |
  | T2 | Day 2  | linkedin_connect             | message <250 chars |
  | T3 | Day 5  | automatic_email (reply)      | New proof point |
  | T4 | Day 8  | phone_call                   | Call script in task_note |
  | T5 | Day 11 | action_item                  | View profile, engage post, note for T7 |
  | T6 | Day 14 | automatic_email (reply)      | Breakup, third angle |
  | T7 | Day 17 | linkedin_message             | message <300 chars, no pitch, no CTA |

  DELETE the line: "LinkedIn connect (Day 2) and LinkedIn DM (Day 17) are handled via
  the LinkedIn queue file — not sequence steps."

CHANGE 3 — Naming convention section:
  FIND the naming block with "Seq 1: Technical Evaluator / Seq 2: Business Sponsor"
  REPLACE WITH:
  Naming Convention:
    YDC | {Company} | Seq A: Engineering Leader
    YDC | {Company} | Seq B: Executive Sponsor
    YDC | {Company} | Seq C: Product Leader
    YDC | {Company} | Seq D: AI/ML Leader

CHANGE 4 — Phase A (Create Sequences) — replace REST API curl blocks with:
  ### Phase A: Create Sequences via build-sequences.js

  Write outreach copy to {company}-4seq-content.json in APOLLO_BUILDER_PATH using the
  format in REBUILD-PLAN.md (4 sequences x 7 steps).

  Run:
    cd APOLLO_BUILDER_PATH && HEADED=true node build-sequences.js {company}-4seq-content.json

  Auth uses ~/.apollo-playwright-profile — Chrome can stay open, no re-login needed.
  If profile missing: node save-apollo-session.js (one-time setup).

  Results written to {company}-4seq-content_results.json. Capture sequence IDs from there.

  Transfer ownership to Andrew after each sequence is created (still required):
    curl -s -X PUT "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID" \
      -H "X-Api-Key: $APOLLO_API_KEY" \
      -d '{"user_id": "69c2b4822d0a4900117855af"}'

  Hard stop if any sequence shows status: "failed" in results JSON.

CHANGE 5 — Phase C (LinkedIn Queue File) — DELETE entirely.
  Remove Phase C and all its content. Note at end of Phase B:
  "LinkedIn connect (T2) and DM (T7) are already in the sequence — no Drive queue
  file is needed. ydc-linkedin-queue does not apply to sequences built with build-sequences.js."

CHANGE 6 — Completion report template:
  Update sequence names from Seq 1/2 to Seq A/B/C/D.
  Update steps from 4 to 7.
  Remove the LinkedIn queue line.

Status: PENDING

---

### 5. ydc-pipeline SKILL.md — Two line changes
File: /Users/andrew/.claude/skills/ydc-pipeline/SKILL.md

CHANGE 1:
  FIND:    "Touch 1 is manual_email type (reviewed + sent by Andrew). Touches 2-7 automated."
  REPLACE: "Touch 1 is automatic_email type. All 7 touches are in the Apollo sequence
            including LinkedIn connect (T2) and LinkedIn DM (T7)."

CHANGE 2:
  FIND:    "Sequences built via Apollo REST API. LinkedIn connect + DM written to Drive
            queue file for ydc-linkedin-queue automation."
  REPLACE: "Sequences built via build-sequences.js (Playwright). Auth: launchPersistentContext
            + ~/.apollo-playwright-profile. LinkedIn connect (T2) and DM (T7) are Apollo
            sequence steps — no Drive queue file is written."

Status: PENDING

---

### 6. ydc-territory-pipeline SKILL.md — 3 sections
File: /Users/andrew/.claude/skills/ydc-territory-pipeline/SKILL.md

CHANGE 1 — 2-Sequence Model table:
  FIND the "## 2-Sequence Model" section and replace entirely with:

  ## 4-Sequence Model

  | Sequence | Name Pattern | Persona Pool |
  |----------|-------------|-------------|
  | Seq A: Engineering Leader | YDC \| {Company} \| Seq A: Engineering Leader | Dir/VP/SVP Eng, Head of Eng |
  | Seq B: Executive Sponsor  | YDC \| {Company} \| Seq B: Executive Sponsor  | CTO, CIO, Chief AI Officer, CDO |
  | Seq C: Product Leader     | YDC \| {Company} \| Seq C: Product Leader     | Dir/VP/Head of Product |
  | Seq D: AI/ML Leader       | YDC \| {Company} \| Seq D: AI/ML Leader       | Head of AI/ML, VP Data Science, ML Eng Directors |

  5 contacts per sequence = 20 contacts per account.

CHANGE 2 — Phase 5 build instructions:
  FIND: "Create 2 sequences via Apollo REST API (Seq 1: Technical Evaluator,
         Seq 2: Business Sponsor) — 4 touches each (manual email, auto email x2, action item)"
  REPLACE WITH:
  "Write content JSON to {company}-4seq-content.json, run:
   HEADED=true node build-sequences.js {company}-4seq-content.json
   Creates 4 sequences (A-D), 7 touches each. Auth: launchPersistentContext +
   ~/.apollo-playwright-profile. LinkedIn connect (T2) and DM (T7) are sequence steps."

CHANGE 3 — Remove LinkedIn queue reference in Phase 5:
  FIND:    "LinkedIn connect and DM outreach are handled automatically by the
            ydc-linkedin-queue scheduled task."
  DELETE this line entirely.

Status: PENDING

---

### 7. ydc-linkedin-queue SKILL.md — Add scope note
File: /Users/andrew/.claude/skills/ydc-linkedin-queue/SKILL.md

ADD at the very top of the file body (after frontmatter):

  ## Scope Note (May 2026)
  Sequences built with build-sequences.js (all accounts from May 2026 onward) include
  LinkedIn connect (T2) and DM (T7) as Apollo sequence steps. No Drive queue file is
  written for these accounts. This skill applies only to older whale pipeline accounts
  where a linkedin-queue-{company}-{date}.json file already exists in Drive.

Status: PENDING

---

### 8. REBUILD-PLAN.md — Mark confirmed + add remaining work
File: /Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/apollo-sequence-builder/REBUILD-PLAN.md

ADD to top:
  ## Confirmed Working (2026-05-21)
  - build-sequences.js auth fix: launchPersistentContext (NOT storageState) — DONE
  - LlamaIndex Seq A test: 7 steps created, all content filled — PASSED
  - Seq ID: 6a0f7e349d17db0018f5fd2f

  ## Remaining LlamaIndex Work
  - Run full 4-sequence build: HEADED=true node build-sequences.js llamaindex-4seq-content.json
  - Enroll contacts into all 4 sequences via Apollo REST API

  ## Remaining Accounts (after LlamaIndex proves out)
  - D&B: write dnb-4seq-content.json, run build-sequences.js
  - Dagster Labs: write dagster-4seq-content.json, run build-sequences.js
  - Day AI: write dayai-4seq-content.json, run build-sequences.js
  - Inception: write inception-4seq-content.json, run build-sequences.js

Status: PENDING

---

## Execution Checklist

[x] 1. MEMORY.md — auth fix
[x] 2. ydc-edit-sequences skill.md — auth statement fix
[x] 3. ydc-outreach SKILL.md — T1 type + remove LinkedIn queue section
[x] 4. ydc-apollo-build SKILL.md — Phase A rewrite + Phase C removal
[x] 5. ydc-pipeline SKILL.md — two line changes
[x] 6. ydc-territory-pipeline SKILL.md — 3 sections
[x] 7. ydc-linkedin-queue SKILL.md — scope note
[x] 8. REBUILD-PLAN.md — mark confirmed + remaining work

All 8 updates completed 2026-05-21.

---

## How to Resume This Work

1. Read this file (SKILL-UPDATE-PLAN.md)
2. Read REBUILD-PLAN.md for sequence build context
3. Check the checklist above for what's done vs. pending
4. Execute updates in order, ticking off each checkbox
5. After all skills updated: run full LlamaIndex 4-sequence build
6. After LlamaIndex confirmed: run remaining accounts (D&B, Dagster, Day AI, Inception)
