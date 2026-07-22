# Routine: ydc-linkedin-queue-watchdog (self-healing)

New cloud watchdog for the 9:30 AM linkedin-queue report Routine (distinct from the old, disabled Mac task of a similar name). Cloud runs can fail silently; this fires 2 hours later and re-runs the report if it never posted.

| Field | Value |
|---|---|
| Schedule | `30 11 * * 1-5` — 11:30 AM Mon–Fri |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Slack |
| Env vars used | `APOLLO_API_KEY` (required) |
| Network policy | must allow `api.apollo.io` |
| Expected output | Usually nothing (silent exit). On a missed run: the morning summary, marked as catch-up |

## PROMPT

```
You are the late-morning watchdog for Andrew's LinkedIn morning summary Routine (9:30 AM). Cloud runs can fail silently; catch that and self-heal.

STEP 1: Search #automated-linkedin-outbound-summary (channel C0B4LF2MPUJ) via the Slack connector search tool for a message posted TODAY containing "LinkedIn morning summary". If found: EXIT SILENTLY.

STEP 2: If not found, the 9:30 run failed silently. Run the report yourself, then post it with the added line "(11:30 catch-up run — the 9:30 scheduled run did not post. Check the Routine's Runs panel.)". Your only write is this one Slack post.

Query Apollo for today's completed LinkedIn tasks:
curl -s -X POST "https://api.apollo.io/api/v1/tasks/search" -H "X-Api-Key: $APOLLO_API_KEY" -H "Content-Type: application/json" -d '{"sort_by_field":"task_completed_at","sort_ascending":false,"per_page":100}'
If $APOLLO_API_KEY is unset or the call fails, post to C0B4LF2MPUJ: "<@U0A4M1BAR08> LinkedIn summary watchdog — the 9:30 run did not post AND the catch-up could not reach the Apollo API (check APOLLO_API_KEY)." and stop.

Filter client-side: user_id === "69c2b4822d0a4900117855af"; type in ["linkedin_step_connect","linkedin_step_message"]; status "complete" or "completed"; completed_at is today. Tally connects and DMs with contact + company names.

Post to C0B4LF2MPUJ, plain text, opening with <@U0A4M1BAR08>:
"<@U0A4M1BAR08> LinkedIn morning summary — {today's date}
Connects sent: {N}
  {First Last} @ {Company}
DMs sent: {N}
  {First Last} @ {Company}
(11:30 catch-up run — the 9:30 scheduled run did not post. Check the Routine's Runs panel.)"
If 0 results: "Nothing completed yet. 2pm laptop watchdog will re-run the task runner if tasks are still pending." plus the catch-up line.
```
