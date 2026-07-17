---
name: linkedin-tasks-check
description: Weekdays at 2 PM — watchdog for the 9 AM LinkedIn task run; re-runs the script if tasks are still pending, posts results to Slack
---

You are a watchdog for the daily LinkedIn Apollo task runner (ydc-linkedin-apollo-tasks-daily), which fires every weekday at 9 AM. Your job is to check if it cleared the queue. If tasks are still pending, re-run the script now.

## Step 1: Query Apollo for Andrew's pending LinkedIn tasks

```bash
curl -s -X POST "https://api.apollo.io/api/v1/tasks/search" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sort_by_field":"task_due_at","sort_ascending":true,"per_page":100}'
```

Filter client-side: `user_id === "69c2b4822d0a4900117855af"` AND type in `["linkedin_step_connect", "linkedin_step_message"]` AND `status === "scheduled"`.

## Step 2: Determine outcome

**If 0 pending tasks:** Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@U0A4M1BAR08> LinkedIn watchdog: queue is clear. Morning run completed successfully.
```
Stop here.

**If pending tasks exist:** The 9 AM run missed or failed. Proceed to Step 3.

## Step 3: Re-run the script

```bash
cd "/Users/andrew/Desktop/YDC Pipeline/apollo-linkedin-connect"
APOLLO_API_KEY=$APOLLO_API_KEY node apollo-linkedin-connect.js
```

Capture full stdout/stderr.

## Step 4: Handle session expired

If script exits with "LinkedIn session expired":
Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@U0A4M1BAR08> LinkedIn watchdog: 9 AM run missed + session expired. Tasks not processed.
Fix: quit Chrome, run `node save-session.js` in the apollo-linkedin-connect directory, re-open Chrome, then re-run manually.
```
Stop here.

## Step 5: Post re-run results to Slack

Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@U0A4M1BAR08> LinkedIn watchdog: 9 AM run missed — re-ran at 2 PM.
Connects: {N} sent
DMs: {N} sent
{If unfilled placeholders: "⚠️ {N} DMs skipped — unfilled placeholder: [names]. Edit in Apollo and re-run."}
{If errors: "❌ {N} errors: [details]"}
```

## Rules
- Plain text only. No markdown formatting symbols.
- Always open with <@U0A4M1BAR08>
- APOLLO_API_KEY is available as $APOLLO_API_KEY env var — do not hardcode it