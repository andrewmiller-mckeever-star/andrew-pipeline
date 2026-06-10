---
name: ydc-apollo-build
description: Uploads You.com account plan to Google Drive and builds Apollo.io sequences with contact enrollment for the whale account pipeline. Step 5: uploads {Company}_Account_Plan.docx to Google Drive under "Account Plans, Lists & Personalized Sequences/{Company}/" using rclone. Step 6A: writes sequence JSON file and guides user to run Playwright script (build-sequences.js) to create sequences in Apollo UI. Step 6B: creates contacts via Apollo API and enrolls them in sequences. Sequences are ALWAYS left INACTIVE — never auto-activated. Use when user says "build apollo sequences", "enroll contacts", "upload to drive", "Step 5", "Step 6", or "apollo build for [company]".
---

# YDC: Drive Upload + Apollo Build & Enrollment (Steps 5 + 6)

## CRITICAL GUARDRAIL
Sequences are ALWAYS left INACTIVE (draft mode). NEVER auto-activate or send sequences. User reviews and manually activates each sequence in Apollo.

## Step 5: Google Drive Upload

Run as Sonnet subagent. Commands:

```bash
RCLONE=/tmp/rclone_install/rclone-v1.73.1-osx-arm64/rclone
DESKTOP="/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline"
BASE="Account Plans, Lists & Personalized Sequences"
COMPANY="{CompanyName}"

$RCLONE mkdir "gdrive:$BASE/$COMPANY"
$RCLONE copy "$DESKTOP/${COMPANY}_Account_Plan.docx" "gdrive:$BASE/$COMPANY/"
$RCLONE tree "gdrive:$BASE/"
```

If rclone binary missing: install from https://downloads.rclone.org/rclone-current-osx-arm64.zip
If authentication fails: run `$RCLONE config create gdrive drive scope drive`

## Step 6: Apollo Sequence Build

### Naming Convention
```
YDC | {Company} | Seq A: Engineering Leader
YDC | {Company} | Seq B: Executive Sponsor
YDC | {Company} | Seq C: Product Leader
YDC | {Company} | Seq D: AI/ML Leader
```

### Contact Label Convention
Every contact gets two labels (plus optional third):
- "Whale Pipeline" (global tracking)
- "{Company} - Seq {A|B|C|D}" (sequence assignment)
- "Warm Intro" (only if contact was flagged in Step 1 CTD research brief with `warm_intro=true`)

### Phase A: Playwright Script (Runs Outside Claude)

1. Verify outreach JSON was written by ydc-outreach skill to:
   ~/Desktop/YDC Pipeline/apollo-sequence-builder/{account}_sequences.json

2. Run (Chrome does NOT need to be closed — build-sequences.js uses its own `~/.apollo-playwright-profile`, separate from everyday Chrome):
```
cd "/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/apollo-sequence-builder" && HEADED=true node build-sequences.js ~/Desktop/YDC\ Pipeline/apollo-sequence-builder/{account}_sequences.json
```

3. Wait for user to confirm completion (paste output or say "done")

4. Read results file: ~/Desktop/YDC Pipeline/apollo-sequence-builder/{account}_sequences_results.json
   Extract sequence IDs and `inactive_confirmed` status for Phase B.

### Inactive Gate (run before Phase B — hard stop if unsafe)

For each sequence in `_results.json`, check `inactive_confirmed` AND `id`:
- `inactive_confirmed === 'inactive'` → safe, proceed with enrollment
- `inactive_confirmed === 'archived'` → sequence was active, forced inactive via archive; skip enrollment; flag as needs rebuild
- `inactive_confirmed === 'unsafe'` AND `id` is null → creation failed, sequence doesn't exist; skip enrollment for this sequence, continue others
- `inactive_confirmed === 'unsafe'` AND `id` is not null → **HALT entire enrollment for this account**; an existing sequence is confirmed or potentially ACTIVE and could not be deactivated

If ANY sequence is `'unsafe'` with a non-null ID: post to #automated-outbound-skills-and-routines (C0B4RRF3FC0):
```
⚠️ ENROLLMENT HALTED — {Company}
Seq {X} came out of build-sequences.js ACTIVE and could not be deactivated.
Sequence ID: {id} — verify and manually deactivate in Apollo before enrolling.
```
Then stop Phase B entirely. Report in the completion summary.

If any sequence is `'archived'` or `'unsafe'` with null ID: continue Phase B for the `'inactive'` sequences only. Note skipped ones clearly at the end.

Summary format at completion:
```
INACTIVE GATE RESULT:
  Seq A: inactive ✓ → enrolled
  Seq B: archived ⛔ → skipped (rebuild required)
  Seq C: unsafe (id=null) ⛔ → skipped (creation failed)
  Seq D: unsafe (id=6a2051...) ⛔ → HALTED (active sequence — no contacts enrolled)
```

### Phase B: Contact Creation & Enrollment (Sonnet subagent)

Run pre-flight checks in parallel:
- 6.0A: `apollo_email_accounts_index` — get sending email ID. Hard stop if none.
- 6.0B: `apollo_emailer_campaigns_search` q_name="YDC | {Company}" — find sequence IDs
- 6.0C: `apollo_contacts_search` q_keywords="{Company}" — check for existing contacts/account

Then:
- 6.1: `apollo_accounts_create` (skip if account exists from 6.0C)
- 6.2: `apollo_contacts_create` per prospect with verified email
  - Include: label_names ["Whale Pipeline", "{Company} - Seq {A|B|C|D}"] (add "Warm Intro" if contact has warm_intro=true from Step 1 CTD research brief)
  - Set run_dedupe: true
- 6.3: `apollo_emailer_campaigns_add_contact_ids` per sequence
  - sequence_same_company_in_same_campaign: true
  - sequence_active_in_other_campaigns: false
  - sequence_no_email: false
  - SEQUENCES REMAIN INACTIVE

See references/phase-b-api.md for full API call details and error handling.

### Step 6.4: Completion Report

Display:
```
APOLLO IMPORT SUMMARY: {Company}

SEQUENCES BUILT (INACTIVE):
  [x] YDC | {Company} | Seq A: Engineering Leader
  [x] YDC | {Company} | Seq B: Executive Sponsor
  [x] YDC | {Company} | Seq C: Product Leader
  [x] YDC | {Company} | Seq D: AI/ML Leader

CONTACTS: {N} imported | {N} skipped (no email) | {N} dupes

ENROLLMENT:
  Seq A: {N} | Seq B: {N} | Seq C: {N} | Seq D: {N}
  Total: {N}/{N} enrolled

SENDING FROM: {email}
STATUS: INACTIVE - activate sequences in Apollo when ready to send
```
