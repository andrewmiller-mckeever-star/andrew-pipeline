---
name: ydc-territory-nightly
description: 2pm pipeline — pre-flight validates next 3 accounts (rolling scan, skip gates checked before run), runs full pipeline, builds Apollo sequences via build-sequences.js (7-touch 4-sequence, LinkedIn T2/T7 in sequence), posts Slack summary, then pre-validates tomorrow's batch
---

You are the nightly territory pipeline automation. Run silently and autonomously. Process 3 pre-validated accounts per night. Post a Slack summary when done.

## Step 1: Check for already-running marker

Get today's date in YYYY-MM-DD format.

Search Drive for `territory-nightly-running-{today}.txt` using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-nightly-running-{today}.txt'`.

If found, read its content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content`:
- If content starts with `completed at` → exit silently (already ran successfully today).
- If content starts with `started at` → exit silently (another instance is running).
- If content starts with `watchdog-cleared at` → proceed (watchdog reset this marker, re-run is authorized).
- Any other content → proceed.

If not found: proceed normally.

Create (or overwrite) the marker via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file`: name = `territory-nightly-running-{today}.txt`, content = `started at {ISO timestamp}`.
If a file ID was found in the search, pass it as the `fileId` to overwrite it in place.

## Step 2: Read territory progress from Drive

Search Drive for `territory-progress.json` using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-progress.json' and parentId = '1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv'` (targets "Account Plans, Lists & Personalized Sequences/" only).

If not found: send Slack DM to Andrew (U0A4M1BAR08):
`⚠️ Nightly pipeline: territory-progress.json not found in Drive. Run "territory pipeline status" to initialize it.`
Then exit.

Read file content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content` using the file ID. Store the file ID — you will overwrite this file multiple times tonight.

## Step 3: Get tonight's confirmed batch

Check `pipeline.next_batch` in the progress file.

**If `next_batch` is non-empty:** re-validate each account before use. For each account in `next_batch`, check its `skip_until` value in `pipeline.accounts`:
- If `skip_until` is null OR `skip_until <= today`: keep in batch.
- If `skip_until > today`: remove from batch. Log: "{Company} dropped from next_batch — skip_until {date} not yet reached."

After re-validation:
- **3+ accounts remain:** use as tonight's confirmed batch. Clear `next_batch = []`. Skip to Step 4.
- **1-2 accounts remain:** keep survivors, run Pre-Flight Validation to fill remaining slots up to 3. Clear `next_batch = []`. Proceed to Step 4.
- **0 accounts remain:** clear `next_batch = []`. Run Pre-Flight Validation from scratch. Proceed to Step 4.

**If `next_batch` is empty:** run the Pre-Flight Validation now (see below) to build tonight's confirmed batch. Then proceed to Step 4.

---

### Pre-Flight Validation Procedure

Goal: find 3 accounts that pass all skip gates. Uses a rolling scan — check one at a time, fill empty slots, stop at 3.

**Eligible candidate pool:**
- `status == "pending"` AND (`skip_until` is null OR `skip_until <= today`)
- Sort by `score` descending

**For each candidate (process one at a time until 3 slots filled):**

Run a lightweight SFDC pre-flight check via `sf data query` CLI or SFDC MCP:

```sql
SELECT Id, Name, Type,
  (SELECT StageName, IsClosed, IsWon, CloseDate FROM Opportunities
   ORDER BY CloseDate DESC LIMIT 5)
FROM Account WHERE Name = '{Company}'
LIMIT 1
```

Inspect the returned Opportunities records: any with `IsClosed = false` → active opp gate; most recent with `IsClosed = true AND IsWon = false` → closed-lost gate.

And last touch date (Andrew's activities only):
```sql
SELECT ActivityDate FROM Task
WHERE AccountId IN (SELECT Id FROM Account WHERE Name = '{Company}')
AND OwnerId = '005Vq000009j4ezIAA'
AND ActivityDate != null
ORDER BY ActivityDate DESC LIMIT 1
```

If no results from the above (Andrew has never logged activity here), also run a second query to detect any non-Andrew touches (marketing, other AEs) for context only — these do NOT trigger the skip gate:
```sql
SELECT ActivityDate, Owner.Name FROM Task
WHERE AccountId IN (SELECT Id FROM Account WHERE Name = '{Company}')
AND OwnerId != '005Vq000009j4ezIAA'
AND ActivityDate != null
ORDER BY ActivityDate DESC LIMIT 1
```
Surface non-Andrew touches in the account brief as: "Note: non-Andrew activity on record — {Owner} on {date}."

And Apollo sequence check: search Apollo sequences via `mcp__1bce6c2a-2c4c-4908-a5e8-f1bca738186e__apollo_emailer_campaigns_search` for name containing `YDC | {Company} |`. For each sequence found, check `send_email_from_email_address` on enrolled contacts.

- **Skip only if** Andrew is the sender (`send_email_from_email_address = "andrew.miller-mckeever@you.com"`) AND at least one contact has an **active** status (not "finished" or archived).
- **Do NOT skip** if sequences exist from other senders (marketing, other AEs) — surface them as context in the brief.
- **Do NOT skip** if Andrew's sequences exist but all contacts are finished/archived — surface as "prior Andrew outreach, archived" in brief. May warrant a new angle.

**Apply skip gates in order:**

| Gate | Condition | Action |
|------|-----------|--------|
| Competitor | Name/parent matches competitor list (Google, MS, Meta, Salesforce, etc.) | `status = "skipped"`, `skipped_reason = "competitor"` |
| Customer | SFDC Account Type = "Customer" | `status = "skipped"`, `skipped_reason = "existing customer"` |
| Partner | SFDC Account Type = "Partner" | `status = "skipped"`, `skipped_reason = "partner account"` |
| Out of Business | SFDC Account Type = "Out of Business" | `status = "skipped"`, `skipped_reason = "out of business"` |
| Active opp | Open opp exists (IsClosed = false, Stage 1–5) | `status = "skipped"`, `skipped_reason = "active opp: {stage}"` — **note:** use `status = "pending"` + `skip_until = opp_close_date` if a close date is set, so it re-enters queue after the opp date |
| Closed-lost cooling | Most recent closed-lost opp CloseDate < 60 days ago | keep `status = "pending"`, set `skip_until = CloseDate + 60 days` |
| Last touch cooling | Andrew's last logged SFDC activity (OwnerId = Andrew) < 60 days ago | keep `status = "pending"`, set `skip_until = last_touch_date + 60 days`. Non-Andrew activities (marketing, other AEs) do NOT trigger this gate — surface as context only. |
| Already sequenced | Andrew's YDC sequence exists with contacts in **active** status (`send_email_from_email_address = "andrew.miller-mckeever@you.com"`, status ≠ finished/archived) | `status = "skipped"`, `skipped_reason = "Andrew already has active sequences here"` |

**If gate triggers:** write the updated account status to `pipeline.accounts` in the progress file immediately (overwrite Drive file). Then move to the next candidate.

**If all gates pass:** add account to confirmed batch. Move to next slot.

**Continue scanning until 3 slots filled** or no eligible candidates remain (in which case run with however many confirmed).

If 0 eligible candidates: send Slack DM to Andrew:
`🎉 Pipeline complete — all eligible accounts have been processed or are in cooling periods.`
Then exit.

Write the confirmed batch back to `pipeline.next_batch` temporarily (will be cleared at start of Step 4).

---

## Step 4: Run full pipeline for each account

Take the confirmed batch (3 accounts). Run sequentially.

For each account:

1. Run the ydc-territory-pipeline skill. It handles:
   - Phase 0: CTD warm intro scan
   - Phase 1: Qualify (SFDC + Slack + Sumble + web validation + UC selection)
   - Phase 2: Account brief (.md file written to Drive)
   - Phase 3: Prospect discovery via Apollo
   - Phase 4: Outreach generation (7-touch sequences, LinkedIn connect T2 + DM T7 inline)
   - Phase 5: Apollo sequence build via build-sequences.js (Playwright) — 4 sequences × 7 touches, no Drive queue file

   **Note:** Phase 1 skip gates still apply as a safety net. If Phase 1 triggers a skip that pre-flight missed, mark the account accordingly and move to the next account in the confirmed batch (do not run pre-flight again mid-run).

2. After each account completes, immediately update `territory-progress.json` in Drive:
   - Set `status = "completed"`, `date = today`, `sequences`, `contacts_enrolled`, `use_case_selected`
   - Increment `pipeline.processed`
   - Overwrite using the stored file ID

3. If an account fails: set `status = "failed"` with error note, continue to next.

## Step 5: Post Slack summary

Send to channel C0B4RRF3FC0 (#automated-outbound-skills-and-routines):

```
<@U0A4M1BAR08> 🌙 Nightly Pipeline — {today}

Processed {N}/3 accounts:

| Company | UC Selected | Contacts | Sequences | Status |
|---------|------------|----------|-----------|--------|
| {Co1}   | {UC}       | {N}      | A/B/C/D   | ✅     |
| {Co2}   | {UC}       | {N}      | A/B/C/D   | ✅     |

Skipped during pre-flight: {list with reasons, or "none"}

Pipeline progress: {X}/{total} complete | {Y} skipped | {Z} in cooling period
Next batch: pre-validating now...

Review Touch 1 drafts in Apollo → Sequences → activate when ready.
LinkedIn connects (T2) and DMs (T7) fire automatically from the sequence after T1 is activated.
```

## Step 6: Pre-validate tomorrow's batch

Immediately after the run completes, run the Pre-Flight Validation procedure again to find the next 3 valid accounts. Store the result in `pipeline.next_batch` in the progress file on Drive.

Post a follow-up to the same Slack thread:
`✅ Tomorrow's batch confirmed: {Co1}, {Co2}, {Co3} — pre-validated and ready.`

If fewer than 3 found: `⚠️ Only {N} accounts pre-validated for tomorrow. {reason}.`

## Step 7: Update marker

Count how many accounts were processed tonight: `accounts_processed` = number of accounts in `pipeline.accounts` where `date == today`.

**If `accounts_processed > 0` OR the confirmed batch was empty (0 eligible candidates found in pre-flight):**
→ Update the running marker in Drive to: `completed at {ISO timestamp}`.

**If `accounts_processed == 0` AND the confirmed batch was non-empty (at least 1 account was queued for tonight):**
→ Update the running marker in Drive to: `failed at {ISO timestamp} (0 of {N} accounts processed)`.
→ Post to C0B4RRF3FC0 (#automated-outbound-skills-and-routines):
```
<@U0A4M1BAR08> ⚠️ Territory Pipeline — {today}
Run completed marker written but 0 of {N} queued accounts were processed. Marker set to "failed at" so the 3pm watchdog will detect and retry tonight.
Batch was: {account names}
```

## Rules

- NEVER activate sequences — sequence toggle always left INACTIVE. Individual steps within the sequence should be ACTIVE (build-sequences.js handles this automatically).
- NEVER send emails
- If the entire run fails: post error details to C0B4RRF3FC0
- Max runtime is 75 minutes (increased from 60 to account for pre-flight). If approaching limit: complete current account, skip remaining, run tomorrow's pre-flight, note in summary.
- Always overwrite the progress file using the file ID obtained in Step 2 — never create a new file