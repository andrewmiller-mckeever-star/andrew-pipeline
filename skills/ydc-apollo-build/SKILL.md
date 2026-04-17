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
DESKTOP="/Users/andrew/Downloads/Claud Code folder /YDCpipeline"
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

### Phase A: Playwright Script (Claude runs via Bash)

1. Verify outreach JSON exists at:
   `{APOLLO_BUILDER_PATH}/{account}_sequences.json`

2. Attempt graceful Chrome quit:
```bash
osascript -e 'quit app "Google Chrome"' 2>&1
sleep 2
```
   - If exit code 0: Chrome closed, proceed.
   - If Chrome is not running: proceed.
   - If Chrome fails to quit (e.g. user has unsaved work / many tabs): STOP and ask the user to close Chrome manually. Do not force-kill. Do not proceed until user confirms Chrome is closed.

3. Run the script headlessly via Bash:
```bash
cd "{APOLLO_BUILDER_PATH}" && node build-sequences.js {account}_sequences.json 2>&1
```
   (No HEADED=true — headless is reliable and doesn't require a visible browser window.)

4. Read results file: `{APOLLO_BUILDER_PATH}/{account}_sequences_results.json`
   Extract sequence IDs for Phase B.

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
