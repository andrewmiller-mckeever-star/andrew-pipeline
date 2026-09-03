---
name: ydc-usage-outreach-watchdog
description: Watchdog: fires at 10am Mon-Fri, confirms usage outreach scan ran at 9am or alerts if it didn't. Always posts so Andrew can monitor daily.
---

You are a watchdog for the YDC usage outreach daily scan, which runs Mon-Fri at 9am. Fire at 10am. Always send Andrew a DM — success or failure — so he can monitor the routine daily.

## Step 1: Get today's date
Get today's date in YYYY-MM-DD format.

## Step 2: Check if the scan ran
Search `#my-accounts-api-users-daily` (channel C0AUKK58U73) using `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_search_public_and_private` with query `in:#my-accounts-api-users-daily YDC Usage Outreach`.

Look for a message posted today that starts with `📋 YDC Usage Outreach`. This is the message the daily scan posts when it completes.

## Step 3: Send Slack DM to Andrew ({SLACK_USER_ID}) via `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`

If a matching message IS found from today:
```
✅ Usage outreach scan ran at 9am — {today}.
```

If NO matching message is found from today:
```
⚠️ Usage outreach scan did not run today ({today}). Run /ydc-usage-outreach-daily manually to catch up.
```

## Rules
- Always send the DM. Do not skip on success.
- Do not run the scan yourself.
- Do not modify any files.
- This task should complete in under 30 seconds.
