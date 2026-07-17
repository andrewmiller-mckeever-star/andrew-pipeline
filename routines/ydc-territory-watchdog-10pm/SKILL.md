---
name: ydc-territory-watchdog-10pm
description: 3pm watchdog — if the 2pm territory pipeline didn't complete, resets marker and re-runs it
---

You are a watchdog for the nightly territory pipeline. Check if tonight's 2pm run completed. If it didn't, reset the marker and run the pipeline now.

## Step 1: Get today's date

Get today's date in YYYY-MM-DD format.

## Step 2: Check tonight's run status

Search Drive for `territory-nightly-running-{today}.txt` via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-nightly-running-{today}.txt'`.

Read the file content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content` using the file ID.

**If content starts with `completed at`** → the 2pm run succeeded. Exit silently.

**If content starts with `started at`** → the run stalled mid-execution. Proceed to Step 3.

**If content starts with `failed at`** → the run completed but processed 0 accounts. Proceed to Step 3.

**If file not found** → the 2pm run never started. Proceed to Step 3.

## Step 3: Alert Andrew and reset the marker

Send a Slack DM to Andrew (U0A4M1BAR08) via `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`:

```
⚠️ Territory pipeline watchdog (3pm): tonight's 2pm run didn't complete. Restarting now — will post results when done.
```

Overwrite the marker via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` using the file ID (to replace in place): name = `territory-nightly-running-{today}.txt`, content = `watchdog-cleared at {ISO timestamp}`.

If the file wasn't found at all, skip the overwrite (no marker to clear — the nightly task will create one when it runs next).

## Step 4: Run the territory pipeline

Run the full pipeline — same Steps 2–6 from ydc-territory-nightly:

1. Search Drive for `territory-progress.json` using query `title = 'territory-progress.json' and parentId = '1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv'` and read it via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content`
2. Use `pipeline.next_batch` if populated; otherwise run the Pre-Flight Validation procedure from ydc-territory-nightly to find up to 5 valid accounts
3. Run ydc-territory-pipeline for each account sequentially
4. After each account: update `territory-progress.json` in Drive (set status, date, sequences, contacts_enrolled, use_case_selected; increment pipeline.processed)
5. If an account fails: set status to `"failed"` with error note, continue to next
6. Post the standard summary to #my-accounts-api-users-daily (C0AUKK58U73):
   ```
   🌙 Nightly Territory Pipeline (3pm retry) — {today}
   Processed {N}/3 accounts: ...
   ```
7. Update the running marker to `completed at {ISO timestamp}`

## Rules

- NEVER activate sequences — sequence toggle always left INACTIVE. Individual steps should be ACTIVE (build-sequences.js handles this).
- NEVER send emails
- NEVER skip the LinkedIn queue file — must be written for every account
- If the entire run fails: send Slack DM to Andrew with the error details