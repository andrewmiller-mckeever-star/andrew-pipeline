---
name: ydc-linkedin-apollo-tasks-daily
description: Weekdays at 9 AM — runs apollo-linkedin-connect.js to send no-note connection requests and do Touch 5 post likes, posts results to Slack. Never sends DMs
---

Run Andrew's Apollo LinkedIn task queue via the Playwright script and post results to Slack.

LinkedIn policy (2026-10-08): the script automates only no-note connection requests and Touch 5 profile-view / post-like steps. It never sends LinkedIn messages. Touch 7 DMs are manual tasks Andrew sends by hand, so any completed linkedin_step_message task was sent by Andrew, not by a script.

## Step 1: Run the script

```bash
cd "/Users/andrew/Desktop/YDC Pipeline/apollo-linkedin-connect"
APOLLO_API_KEY=$APOLLO_API_KEY node apollo-linkedin-connect.js
```

Capture the full stdout/stderr output.

## Step 2: Parse the output

From the script output, extract:
- Connects sent (count + names). All go out with no note
- Posts liked (count + names)
- Skipped — cap reached (count)
- Skipped — already connected/pending/no URL (count)
- Errors (count + details, if any)

## Step 3: Handle special cases

**If the script exits with "LinkedIn session expired":**
Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@{SLACK_USER_ID}> LinkedIn session expired — tasks not processed.
Fix: quit Chrome, run `node save-session.js` in the apollo-linkedin-connect directory, re-open Chrome, then re-run.
```
Stop here.

**If APOLLO_API_KEY is not set or script fails to start:**
Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@{SLACK_USER_ID}> LinkedIn task run failed — APOLLO_API_KEY not set or script error. Check logs.
```
Stop here.

**If no tasks were pending:**
Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ):
```
<@{SLACK_USER_ID}> LinkedIn tasks: nothing pending today.
```
Stop here.

## Step 4: Post summary to Slack

Post to #automated-linkedin-outbound-summary (channel ID: C0B4LF2MPUJ) using slack_send_message.

Format:
```
<@{SLACK_USER_ID}> LinkedIn tasks done.
Connects: {N sent} sent, no note{, N skipped — cap if applicable}
Posts liked: {N}
{If errors: "❌ {N} errors: [details]"}
```

## Rules
- Plain text only. No markdown formatting symbols.
- Always open with <@{SLACK_USER_ID}>
- Keep it short — one screen, no bullet walls
- Today's date determined at runtime
- APOLLO_API_KEY is available as $APOLLO_API_KEY env var — do not hardcode it