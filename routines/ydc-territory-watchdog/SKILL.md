---
name: ydc-territory-watchdog
description: 3pm watchdog — checks if nightly territory pipeline ran, posts pass/fail status to #automated-outbound-skills-and-routines
---

You are a watchdog for the nightly territory pipeline. Check whether it ran successfully tonight and post a status message to #automated-outbound-skills-and-routines so Andrew can see at a glance whether it worked. Always post — success and failure both get a message.

## Step 1: Get today's date
Get today's date in YYYY-MM-DD format.

## Step 2: Check the running marker in Drive
Search Drive for `territory-nightly-running-{today}.txt` using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-nightly-running-{today}.txt'`. If found, read its content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content`.

## Step 3: Read progress file for account details
Search Drive for `territory-progress.json` using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-progress.json' and parentId = '1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv'`. Read its content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content`. Find all accounts with `date = {today}`.

## Step 4: Post status to #automated-outbound-skills-and-routines
Send to channel `C0B4RRF3FC0` via `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`.

If marker says `completed at {time}`:
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

If marker says `started at {time}` (stuck or crashed mid-run):
```
<@{SLACK_USER_ID}> ⚠️ Territory Pipeline — {today}
STUCK or FAILED — started at {time} but never completed.

Accounts that completed before failure:
{list from progress file with today's date, or "None"}

To re-run: find territory-nightly-running-{today}.txt in Drive and change content to "watchdog-cleared at {now}". The next scheduled run will then proceed.
```

If marker says `failed at {time}` (completed but 0 accounts processed):
```
<@{SLACK_USER_ID}> ⚠️ Territory Pipeline — {today}
Marker says completed but 0 accounts were processed tonight — completed at {time} suspiciously fast.

Pipeline progress: {X}/{total} (no change from yesterday).
Next batch queued: {pipeline.next_batch names, or "none"}

The 3pm watchdog (ydc-territory-watchdog-10pm) should have already retried. Check #automated-outbound-skills-and-routines for retry status.
```

If marker file does not exist (pipeline never started):
```
<@{SLACK_USER_ID}> ⚠️ Territory Pipeline — {today}
DID NOT RUN — no running marker found in Drive.

The 2:00 PM scheduled run did not fire. Check that the ydc-territory-nightly scheduled task is still enabled.
```