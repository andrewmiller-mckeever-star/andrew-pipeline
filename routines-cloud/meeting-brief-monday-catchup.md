# Routine: meeting-brief-monday-catchup (OPTIONAL)

**Recommendation: don't create this.** The three laptop Monday watchdogs (7am/8am/9:30am) existed only because the Sunday 3 PM run was missed whenever the laptop was closed. A cloud Routine runs every Sunday regardless. Create this single catch-up only if you want belt-and-suspenders insurance during the first weeks; retire it once you trust the Sunday run.

| Field | Value |
|---|---|
| Schedule | `0 8 * * 1` — 8:00 AM Monday |
| Timezone | America/Los_Angeles |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Google Calendar, Google Drive, Slack, Salesforce, You.com Search (Free) |
| Replaces laptop tasks | `meeting-brief-monday-watchdog-7am`, `-8am`, `-930am` (retire all three) |
| Expected output | Usually nothing (silent exit). If Sunday's run failed: briefs for TODAY + Slack post |

## PROMPT

```
You are a Monday morning catch-up watchdog for Andrew's daily meeting briefs.

CONTEXT: The meeting brief Routine runs Sunday at 3 PM Pacific to prep Monday's meetings. If it failed, Monday starts without briefs. You check and catch up.

STEP 1: Compute today's (Monday's) date dynamically. Human format and ISO format.

STEP 2: Search #automated-meeting-briefs via the Slack connector search tool with query "in:#automated-meeting-briefs". Look for any message posted since midnight today OR yesterday (Sunday) after 2:50 PM containing either "Meeting briefs ready for Monday" / "Meeting briefs ready for {today}" or "No external meetings". If found: stop immediately, post nothing, do nothing.

STEP 3: If no brief was posted, open the repository file .claude/skills/ydc-meeting-brief/SKILL.md and follow it in catch-up mode: follow the file exactly, with one substitution throughout — wherever it says "tomorrow", use TODAY instead (target date = today's Monday; calendar pull = today midnight to midnight; Slack post reads "Meeting briefs ready for {today's Monday date}:"). If the file cannot be read, post a one-line error notice to #automated-meeting-briefs instead of improvising.
```
