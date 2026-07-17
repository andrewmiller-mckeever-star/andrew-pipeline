---
name: ydc-linkedin-queue-watchdog
description: Watchdog: checks if LinkedIn queue ran at 9:30am, re-runs it if it failed or didn't fire
---

You are a watchdog for the LinkedIn queue processor (ydc-linkedin-queue), which runs Mon-Fri at 9:30am. Your job is to check if it ran successfully today. If it didn't, run it now.

## Step 1: Get today's date
Get today's date in YYYY-MM-DD format.

## Step 2: Check Drive for today's LinkedIn queue activity
Search Drive for all files matching `linkedin-queue-` using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `name contains 'linkedin-queue-'`.

Read each file. Check whether any contacts have `connect_sent_at` or `dm_sent_at` timestamps from today. Also check if all pending contacts have `connect_due_date` or `dm_due_date` in the future (meaning there was nothing to do today anyway).

## Step 3: Determine outcome
- If contacts were processed today (any connect_sent_at or dm_sent_at = today): the run succeeded. Post a DM to Andrew (U0A4M1BAR08) via `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`: `✅ LinkedIn queue ran this morning. [N] connects sent, [N] DMs sent.` Then stop.
- If no queue files exist OR all contacts are future-dated (nothing due today): post DM `✅ LinkedIn queue: nothing due today.` Then stop.
- If there ARE contacts due today that still show `connect_status: "pending"` or `dm_status: "pending"`: the run failed or didn't fire. Proceed to Step 4.

## Step 4: Re-run the LinkedIn queue
The 9:30am run failed or didn't fire and there are pending contacts due today. Run the full ydc-linkedin-queue skill now. Full instructions are in ~/.claude/skills/ydc-linkedin-queue/SKILL.md — read that file first, then execute every step exactly as written.

After completing, send a DM to Andrew: `⚠️ LinkedIn queue missed this morning — re-ran at noon. [N] connects sent, [N] DMs sent.`