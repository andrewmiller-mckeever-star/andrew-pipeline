---
name: ydc-linkedin-apollo-tasks-daily
description: Weekdays at 9 AM — runs apollo-linkedin-connect.js to process all pending LinkedIn connect and DM tasks, posts results to Slack
---

Run Andrew's Apollo LinkedIn task queue via the Playwright script and post results to Slack.

## Step 1: Run the script

```bash
cd "/Users/andrew/Desktop/YDC Pipeline/apollo-linkedin-connect"
APOLLO_API_KEY=$APOLLO_API_KEY node apollo-linkedin-connect.js
```

Capture the full stdout/stderr output.

## Step 2: Parse the output

From the script output, extract:
- Connects sent (count + names)
- DMs sent (count + names)
- Skipped — cap reached (count)
- Skipped — already connected/pending/no URL (count)
- Skipped — not connected yet (count)
- Skipped — unfilled placeholder (count + names, if any)
- Errors (count + details, if any)

## Step 3: Handle special cases

**If the script exits with "LinkedIn session expired":**
Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@U0A4M1BAR08> LinkedIn session expired — tasks not processed.
Fix: quit Chrome, run `node save-session.js` in the apollo-linkedin-connect directory, re-open Chrome, then re-run.
```
Stop here.

**If APOLLO_API_KEY is not set or script fails to start:**
Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@U0A4M1BAR08> LinkedIn task run failed — APOLLO_API_KEY not set or script error. Check logs.
```
Stop here.

**If no tasks were pending:**
Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@U0A4M1BAR08> LinkedIn tasks: nothing pending today.
```
Stop here.

## Step 4: Post summary to Slack

Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ) using slack_send_message.

Format:
```
<@U0A4M1BAR08> LinkedIn tasks done.
Connects: {N sent} sent{, N skipped — cap if applicable}
DMs: {N sent} sent
{If unfilled placeholders: "⚠️ {N} DMs skipped — unfilled placeholder: [names]. Edit in Apollo and re-run."}
{If errors: "❌ {N} errors: [details]"}
```

## Rules
- Plain text only. No markdown formatting symbols.
- Always open with <@U0A4M1BAR08>
- Keep it short — one screen, no bullet walls
- Today's date determined at runtime
- APOLLO_API_KEY is available as $APOLLO_API_KEY env var — do not hardcode it