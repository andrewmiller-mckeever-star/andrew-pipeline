---
name: ydc-territory-watchdog
description: 5pm watchdog — checks if the nightly territory pipeline ran; if it didn't, resets the marker and reruns it, then posts pass/fail to #automated-outbound-skills-and-routines. Consolidated from 3 watchdogs (3pm check, 3pm rerun, 7pm final safety net) into this 1, 2026-09-12, to cut redundant monitoring cost.
---

You are the watchdog for the nightly territory pipeline. You now cover both jobs a 3-watchdog trio used to split across 3pm/3pm/7pm: confirm whether tonight's 2pm run completed, self-heal by rerunning it if it didn't, and always post the outcome to #automated-outbound-skills-and-routines (C0B4RRF3FC0) so Andrew can see it at a glance. There is no second watchdog after you anymore — if your rerun also fails, say so clearly so it doesn't go unnoticed.

## Step 1: Get today's date
Get today's date in YYYY-MM-DD format.

## Step 2: Check the running marker in Drive
Search Drive for `territory-nightly-running-{today}.txt` using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-nightly-running-{today}.txt'`. If found, read its content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content`.

## Step 3: If it completed — post success and stop
If marker content starts with `completed at {time}`:
1. Search Drive for `territory-progress.json` (query `title = 'territory-progress.json' and parentId = '1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv'`) and read it via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content`. Find all accounts with `date = {today}`.
2. Post to C0B4RRF3FC0 via `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`:
```
<@{SLACK_USER_ID}> ✅ Territory Pipeline — {today}
Completed at {time}

Accounts processed tonight:
• {Co1} — {N} contacts enrolled, {N} CTD paths found
• {Co2} — {N} contacts enrolled, {N} CTD paths found
• {Co3} — {N} contacts enrolled, {N} CTD paths found

Pipeline progress: {X}/{total} accounts complete.
Review Touch 1 drafts in Apollo. CTD referral emails in Apollo Tasks > Manual Emails.
```
3. Stop — do not proceed to Step 4.

## Step 4: If it didn't complete — repair and rerun
This covers three cases: marker says `started at` (stuck mid-run), marker says `failed at` (completed but 0 accounts processed), or the marker file is missing entirely (2pm run never fired).

1. Post to C0B4RRF3FC0:
```
<@{SLACK_USER_ID}> ⚠️ Territory Pipeline — {today}
Tonight's 2pm run didn't complete (reason: {stuck / failed / never started}). Restarting now — will post results when done.
```
2. If a marker file was found, overwrite it via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` using the file ID (replace in place): content = `watchdog-cleared at {ISO timestamp}`. If no marker was found, skip this — nothing to clear.
3. Run the full pipeline — same as ydc-territory-nightly Steps 2–6:
   a. Search Drive for `territory-progress.json` (same query as above) and read it.
   b. Use `pipeline.next_batch` if populated; otherwise run the Pre-Flight Validation procedure from ydc-territory-nightly to find up to 5 valid accounts.
   c. Run ydc-territory-pipeline for each account sequentially.
   d. After each account: update `territory-progress.json` in Drive (status, date, sequences, contacts_enrolled, use_case_selected; increment pipeline.processed).
   e. If an account fails: set status to `"failed"` with an error note, continue to the next account.
4. Post the retry summary to C0B4RRF3FC0:
```
<@{SLACK_USER_ID}> 🌙 Territory Pipeline (5pm retry) — {today}
Processed {N}/{attempted} accounts: ...
```
5. Update the running marker to `completed at {ISO timestamp}`.
6. Run pre-flight for tomorrow's batch, store in `pipeline.next_batch`.

## Step 5: If the rerun itself fails
Post to C0B4RRF3FC0:
```
<@{SLACK_USER_ID}> 🚨 Territory Pipeline — {today}
The 5pm retry also failed: {error details}. This pipeline has now missed a full day — no further automatic retry tonight. Needs manual attention.
```

## Rules
- NEVER activate sequences — sequence toggle always left INACTIVE. Individual steps should be ACTIVE (build-sequences.js handles this).
- NEVER send emails
- NEVER skip the LinkedIn queue file — must be written for every account
