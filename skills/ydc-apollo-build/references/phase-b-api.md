# Phase B: Contact Creation & Enrollment via API

**6.0: Pre-flight checks (run in parallel)**

| Check | Tool | Purpose |
|-------|------|---------|
| 6.0A | `apollo_email_accounts_index` | Get sending email account ID. Hard stop if none linked. |
| 6.0B | `apollo_emailer_campaigns_search` q_name="YDC \| {Company}" | Find sequences from Phase A. Map Seq A/B/C/D to IDs. |
| 6.0C | `apollo_contacts_search` q_keywords="{Company}" | Check for existing account/contacts to avoid duplicates. |

**6.1: Create company account**

`apollo_accounts_create` with name + domain. Skip if 6.0C found an existing account.

**6.2: Create contacts**

**HARD GATE — email required:** Only call `apollo_contacts_create` for contacts where you have an actual verified email string from `apollo_people_bulk_match`. The `has_email: true` flag from `apollo_mixed_people_api_search` is NOT an email address — it only means Apollo believes one exists. If bulk_match did not return a non-null email for a contact, skip `apollo_contacts_create` entirely for that person. Creating contacts without emails produces unenrollable shells in Apollo.

For each prospect with a confirmed email from bulk_match, call `apollo_contacts_create`:
- first_name, last_name, **email** (must be non-null), title, organization_name, account_id
- `label_names`: ["Whale Pipeline", "{Company} - Seq {A|B|C|D}"]
- `run_dedupe`: true

Group returned contact IDs by their sequence letter assignment.

**6.3: Pre-enrollment email check**

Before enrolling, call `apollo_contacts_search` q_keywords="{Company}" and verify that each contact ID you intend to enroll has a non-null `email` field and `email_status` of "verified" or "likely to engage". Drop any contact that shows `email: null` or `email_status: null` — these will be silently blocked by `sequence_no_email: false` anyway, and enrolling them wastes API calls.

Log: "Enrolling N contacts (dropped M with null email)."

**6.4: Enroll contacts in sequences**

For each sequence found in 6.0B, call `apollo_emailer_campaigns_add_contact_ids`:
- `id` + `emailer_campaign_id`: sequence ID (same value for both)
- `send_email_from_email_account_id`: from 6.0A
- `contact_ids`: verified-email contacts only, grouped from 6.2
- `sequence_same_company_in_same_campaign`: true
- `sequence_active_in_other_campaigns`: true
- `sequence_finished_in_other_campaigns`: true
- `sequence_no_email`: false

**Sequences remain INACTIVE. Contacts are enrolled but no emails are sent until the user manually activates each sequence in Apollo.**

**6.5: Verify & report**

Display a summary after completion:

```
APOLLO IMPORT SUMMARY: {Company}

SEQUENCES BUILT (INACTIVE - review and activate manually):
  [x] YDC | {Company} | Seq A: Engineering Leader       (4 steps)
  [x] YDC | {Company} | Seq B: Executive Sponsor        (3 steps)
  [x] YDC | {Company} | Seq C: Product Leader            (4 steps)
  [x] YDC | {Company} | Seq D: AI/ML Leader              (3 steps)

CONTACTS: {N} imported | {N} skipped (no email) | {N} dupes

ENROLLMENT:
  Seq A: {N} | Seq B: {N} | Seq C: {N} | Seq D: {N}
  Total: {N}/{N} enrolled

SENDING FROM: {email}
STATUS: INACTIVE - activate sequences in Apollo when ready to send
```

---

# Step 6 Error Handling

| Scenario | Action |
|----------|--------|
| No email account linked | Hard stop. Instruct user to link email in Apollo Settings > Email Accounts. |
| Browser automation fails | Fall back to label-only mode: create contacts with labels, report for manual sequence creation in Apollo UI. |
| Sequence creation interrupted | Resume from last completed sequence. Check via `apollo_emailer_campaigns_search`. |
| Duplicate contact | `run_dedupe: true` handles this. Use existing contact ID. |
| Contact without email | Skip enrollment. Log for manual LinkedIn outreach. |
| Enrollment fails | Retry once. Log and continue with remaining contacts. |
| API rate limit | Wait 10s, retry up to 3x. |

---

# Apollo Enrollment API Quirk (from session log 2026-03-02)

Apollo enrollment API may return 500 on parallel calls but still process them server-side. Use sequential calls or handle `contacts_already_exists_in_current_campaign` as success. Initial parallel API calls during Checkr pipeline returned 500 errors but actually succeeded server-side (Seq A contacts showed as already enrolled on retry).
