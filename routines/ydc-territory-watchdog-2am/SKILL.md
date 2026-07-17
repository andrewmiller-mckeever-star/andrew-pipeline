---
name: ydc-territory-watchdog-2am
description: 7pm final safety net — if neither 2pm pipeline nor 3pm watchdog re-run completed, resets and re-runs the pipeline
---

You are the final safety net for the nightly territory pipeline. The pipeline runs at 2pm, the first watchdog fires at 3pm. If neither completed the job, you run at 7pm and handle it.

## Step 1: Get today's date

Get today's date in YYYY-MM-DD format.

## Step 2: Check tonight's run status

Search Drive for `territory-nightly-running-{today}.txt` via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `title = 'territory-nightly-running-{today}.txt'`.

Read the file content via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content` using the file ID.

**If content starts with `completed at`** → pipeline ran successfully. Exit silently.

**If content starts with `started at`** → pipeline stalled mid-execution. Proceed to Step 3.

**If content starts with `failed at`** → pipeline completed but processed 0 accounts. Proceed to Step 3.

**If content starts with `watchdog-cleared at`** → the 3pm watchdog tried but may have also stalled. Check `territory-progress.json` (parentId `1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv`) to see if any accounts have `date` equal to today. If yes, exit silently. If no new accounts completed today, proceed to Step 3.

**If file not found** → pipeline never started. Proceed to Step 3.

## Step 3: Alert Andrew and reset the marker

Post to channel C0B4RRF3FC0 (#automated-outbound-skills-and-routines) via `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`:

```
<@U0A4M1BAR08> 🚨 Territory pipeline final safety net (7pm): neither the 2pm nor 3pm runs completed tonight. Running the pipeline now — will post results when done.
```

If a marker file was found, overwrite it via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` using the file ID: content = `watchdog-2am-cleared at {ISO timestamp}`.

## Step 4: Run the territory pipeline

Run the full pipeline — same as ydc-territory-nightly Steps 2–7:

1. Search Drive for `territory-progress.json` using query `title = 'territory-progress.json' and parentId = '1EVcyF2Jk3ee-ejGQ7xlHU_giQJDfhFnv'` and read it
2. Use `pipeline.next_batch` if populated; otherwise run the Pre-Flight Validation procedure from ydc-territory-nightly to find up to 5 valid accounts
3. Run ydc-territory-pipeline for each account sequentially
4. After each account: update `territory-progress.json` in Drive (status, date, increment pipeline.processed)
5. If an account fails: set status to `"failed"` with error note, continue to next
6. Post the standard summary to C0B4RRF3FC0 (#automated-outbound-skills-and-routines):
   ```
   <@U0A4M1BAR08> 🌙 Nightly Pipeline (7pm retry) — {today}
   Processed {N}/5 accounts: ...
   ```
7. Run pre-flight for tomorrow's batch, store in `pipeline.next_batch`
8. Update the running marker to `completed at {ISO timestamp}`

## Rules

- NEVER activate sequences — sequence toggle always left INACTIVE. Individual steps should be ACTIVE (build-sequences.js handles this).
- NEVER send emails
- NEVER skip the LinkedIn queue file — must be written for every account
- If the entire run fails: post error to C0B4RRF3FC0 (#automated-outbound-skills-and-routines)