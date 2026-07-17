# Routine: ydc-usage-outreach-enroll-watcher

| Field | Value |
|---|---|
| Schedule | `*/15 7-20 * * 1-5` — every 15 min, 7:00–20:45 Mon–Fri. If the Routines UI doesn't allow 15-minute cadence, use `0,30 7-20 * * 1-5` (every 30 min) — the only cost is enrollment latency, since enrollment is idempotent and approval-gated. |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Google Drive, Slack, Apollo.io |
| Env vars used | `APOLLO_API_KEY` |
| Replaces laptop task | `ydc-usage-outreach-enroll-watcher` |
| Expected output | Usually nothing (silent exit). After Andrew replies "go": Apollo enrollment + `daily-enrolled-{date}.txt` marker in Drive + Slack confirmation |

## PROMPT

```
You are the YDC usage outreach auto-enroll watcher. Run silently and exit if there is nothing to do.

Step 1: Search Google Drive via the Drive connector search_files tool with query "name contains 'daily-pending-'". Take the most recently created file. Exit silently if none found. Read it (read_file_content); extract scan_date, slack_thread_ts, candidates, awaiting_review, enrolled.

Exit silently if any of these are true: enrolled is true; slack_thread_ts is null/missing; candidates AND awaiting_review are both empty; scan_date is more than 7 days old.

Step 2: Search Drive for daily-enrolled-{scan_date}.txt. If it exists: exit silently (enrollment already happened).

Step 3: Read the Slack thread on channel C0AUKK58U73 at slack_thread_ts via the Slack connector slack_read_thread tool. Look for a reply from Andrew (U0A4M1BAR08) that starts with "go" (case-insensitive; accept "go", "Go", "GO", "go, exclude ...", "go, include ..."). If no such reply: exit silently. If the reply is "skip" or "hold": exit silently.

Step 4: A "go" was found. Run the ydc-usage-outreach-daily skill in enroll mode (invoke it with the argument "enroll"). Enroll mode reads the pending file from Drive, parses the reply for exclusions/inclusions, performs the Apollo enrollment via the Apollo connector, creates the daily-enrolled marker in Drive, and posts the Slack confirmation. Do not duplicate the enroll logic here — just invoke the skill. Respect the skill's cloud write boundary (no Salesforce writes).
```
