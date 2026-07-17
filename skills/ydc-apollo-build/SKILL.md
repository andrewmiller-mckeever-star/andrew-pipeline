---
name: ydc-apollo-build
description: Uploads You.com account plan to Google Drive and builds Apollo.io sequences with contact enrollment. Builds 4-sequence 7-touch Apollo sequences via build-sequences.js (Playwright). LinkedIn connect (T2) and DM (T7) are Apollo sequence steps — no Drive queue file. Contact enrollment via Apollo REST API. Auth via ~/.apollo-playwright-profile. Sequences ALWAYS left INACTIVE (sequence toggle off); individual steps activated automatically by build-sequences.js. Use when user says "build apollo sequences", "enroll contacts", "upload to drive", "Step 5", "Step 6", or "apollo build for [company]".
---

# YDC: Drive Upload + Apollo Build & Enrollment (Steps 5 + 6)

## CRITICAL GUARDRAILS
Sequences are ALWAYS left INACTIVE (the sequence-level toggle stays off). Individual steps within each sequence should be ACTIVE — build-sequences.js attempts to unpause them automatically. User only needs to flip the top-level sequence toggle in Apollo when ready to launch. NEVER auto-activate sequences or send emails.

**Apollo sequences CANNOT be deleted** — not via API, not via UI. They can only be archived. Never say "delete sequence." If a broken or duplicate sequence needs to be cleaned up, archive it via: `PUT /v1/emailer_campaigns/{id}` with body `{"archived": true}`.

**Sequences MUST be owned by Andrew's user_id** — Apollo ignores `user_id` in the POST body. The API always creates sequences owned by the service account. To transfer ownership to Andrew (required for UI visibility), immediately issue a `PUT /v1/emailer_campaigns/{id}` with `{"user_id": "69c2b4822d0a4900117855af"}` after every sequence creation. This PUT sets both `user_id` and `object_owner_id`. Without it, the sequence appears invisible in Andrew's Apollo UI under "Owned by: Current User". See Step A.1b.

## Step 5: Google Drive Upload

Run as Sonnet subagent. Commands:

```bash
RCLONE=/opt/homebrew/bin/rclone
BASE="Account Plans, Lists & Personalized Sequences"
COMPANY="{CompanyName}"
SOURCE="/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline"

$RCLONE mkdir "gdrive:$BASE/$COMPANY"
$RCLONE copy "$SOURCE/${COMPANY}_Account_Plan.docx" "gdrive:$BASE/$COMPANY/"
$RCLONE tree "gdrive:$BASE/"
```

If rclone binary missing: install from https://downloads.rclone.org/rclone-current-osx-arm64.zip
If authentication fails: run `$RCLONE config create gdrive drive scope drive`

---

## Step 6: Apollo Sequence Build (API-based, fully cloud-native)

### Sequence Structure (7 touches)

| Touch | Day | Type | Notes |
|-------|-----|------|-------|
| T1 | Day 1  | automatic_email (new_thread) | Unique subject per sequence |
| T2 | Day 2  | linkedin_connect             | message <250 chars |
| T3 | Day 5  | automatic_email (reply)      | New proof point |
| T4 | Day 8  | phone_call                   | Call script in task_note |
| T5 | Day 11 | action_item                  | View profile, engage post, note for T7 |
| T6 | Day 14 | automatic_email (reply)      | Breakup, third angle |
| T7 | Day 17 | linkedin_message             | message <300 chars, no pitch, no CTA |

### Naming Convention
```
YDC | {Company} | Seq A: Engineering Leader
YDC | {Company} | Seq B: Executive Sponsor
YDC | {Company} | Seq C: Product Leader
YDC | {Company} | Seq D: AI/ML Leader
```

### Contact Label Convention
- "Whale Pipeline" (global tracking)
- "{Company} - Seq {1|2}" (sequence assignment)
- "Warm Intro" (only if flagged from CTD research)

---

### Phase A: Create Sequences via build-sequences.js

Write outreach copy to `{company}-4seq-content.json` in the builder directory using the format in REBUILD-PLAN.md (4 sequences × 7 steps).

Run:
```bash
cd "/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/apollo-sequence-builder" && HEADED=true node build-sequences.js {company}-4seq-content.json
```

Auth uses `~/.apollo-playwright-profile` — Chrome can stay open, no re-login needed.
If profile missing: `node save-apollo-session.js` (one-time setup).

Results written to `{company}-4seq-content_results.json`. Capture sequence IDs from there.

Transfer ownership to Andrew after each sequence is created (still required):
```bash
curl -s -X PUT "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d '{"user_id": "69c2b4822d0a4900117855af"}'
```

**Hard stop if any sequence shows status: "failed" in results JSON.**

---

### Phase B: Contact Creation & Enrollment

Run pre-flight checks in parallel:
- **B.0A:** `apollo_email_accounts_index` — get sending email account ID. Hard stop if none.
- **B.0B:** `apollo_emailer_campaigns_search` q_name="YDC | {Company}" — confirm sequence IDs
- **B.0C:** `apollo_contacts_search` q_keywords="{Company}" — check for existing contacts/account

**HARD RULE: Phase B must always execute. There is no "deferred" path.** If bulk_match returns zero verified emails, still create all contacts found and enroll with `sequence_no_email: true`. Contacts without email receive T2 (LinkedIn connect), T4 (call), T5 (action item), and T7 (LinkedIn DM) — 4 of 7 touches. Never write `enrollment_status: "deferred"` in progress notes.

Then:
- **B.1:** `apollo_accounts_create` (skip if account exists from B.0C)
- **B.2:** `apollo_contacts_create` for ALL Director+ prospects found — email or not
  - label_names: ["Whale Pipeline", "{Company} - Seq A/B/C/D" (match their assigned sequence)]
  - Add "Warm Intro" if contact flagged from CTD research
  - run_dedupe: true
- **B.3:** Enroll via REST API (MCP enrollment won't work if sequences were created under the service account user). Always include `emailer_campaign_id` in the request body as well as the URL — the endpoint requires it in both places or returns "Please specify a emailer_campaign_id":
  ```bash
  curl -s -X POST "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID/add_contact_ids" \
    -H "X-Api-Key: $APOLLO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"emailer_campaign_id\": \"$SEQ_ID\",
      \"contact_ids\": [\"contact_id_1\", \"contact_id_2\"],
      \"send_email_from_email_account_id\": \"69655755f84adb0011b0d13b\",
      \"sequence_active_in_other_campaigns\": true,
      \"sequence_finished_in_other_campaigns\": true,
      \"sequence_same_company_in_same_campaign\": true,
      \"sequence_no_email\": true
    }"
  ```
  - **SEQUENCES REMAIN INACTIVE** — sequence toggle off, individual steps active (build-sequences.js handles step activation)
  - `send_email_from_email_account_id`: Andrew's email account = `69655755f84adb0011b0d13b`
  - `sequence_no_email: true` — Apollo auto-skips email steps for contacts missing an email; all other touches still fire
  - Verify enrollment: GET campaign and check `contact_statuses.paused` count matches expected

See references/phase-b-api.md for full API call details and error handling.

LinkedIn connect (T2) and DM (T7) are already in the sequence — no Drive queue file is needed. ydc-linkedin-queue does not apply to sequences built with build-sequences.js.

---

### Step 6 Completion Report

```
APOLLO BUILD SUMMARY: {Company}

SEQUENCES CREATED (INACTIVE):
  [x] YDC | {Company} | Seq A: Engineering Leader  (7 steps)
  [x] YDC | {Company} | Seq B: Executive Sponsor   (7 steps)
  [x] YDC | {Company} | Seq C: Product Leader      (7 steps)
  [x] YDC | {Company} | Seq D: AI/ML Leader        (7 steps)

CONTACTS: {N} imported | {N} skipped (no email) | {N} dupes

ENROLLMENT:
  Seq A: {N} contacts | Seq B: {N} contacts | Seq C: {N} contacts | Seq D: {N} contacts
  Total: {N}/{N} enrolled

SENDING FROM: {email}
STATUS: INACTIVE (sequence toggle off, individual steps active) — Andrew only needs to flip the sequence toggle after reviewing Touch 1

NEXT STEPS:
  1. Apollo > Sequences — review Touch 1 copy per sequence, activate when ready
  2. LinkedIn connect (T2) and DM (T7) fire automatically from the sequence
  3. Touches 3 and 6 auto-fire after Touch 1 is sent
```

---

## Error Handling

| Scenario | Action |
|----------|--------|
| Sequence creation returns no ID | Retry once, hard stop and report |
| Steps < 4 after Phase A | Hard stop — do not enroll contacts |
| No email account linked | Hard stop — link email in Apollo Settings > Email Accounts |
| Duplicate contact | run_dedupe: true handles it — use existing contact ID |
| Contact without email | Still create and enroll with `sequence_no_email: true` — email steps auto-skipped, LinkedIn/call/action touches still fire |
| Enrollment 500 error | Retry once sequentially — Apollo sometimes processes but returns 500 |
| LinkedIn URL missing | Set connect_status/dm_status to "skipped_no_url" |

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added mandatory ownership transfer (PUT user_id) after every sequence creation | Apollo API creates sequences under service account; invisible in Andrew's UI without transfer |
| (prior) | Added `emailer_campaign_id` to enrollment request body (not just URL) | Apollo returns "Please specify a emailer_campaign_id" if body is missing it |
| (prior) | Sequences always left INACTIVE; individual steps activated by build-sequences.js | Bug on 2026-05-29: sequence left ACTIVE caused 1 unreviewed cold email to a CEO |
| (prior) | Switched from Apollo REST API sequence creation to build-sequences.js (Playwright) | API-based sequence creation couldn't set all step types; Playwright covers the full UI flow |
| (prior) | LinkedIn connect (T2) and DM (T7) moved into Apollo sequence steps | Eliminates Drive queue file dependency; build-sequences.js populates them inline |
