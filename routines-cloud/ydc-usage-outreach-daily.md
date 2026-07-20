# Routine: ydc-usage-outreach-daily (9am scan)

| Field | Value |
|---|---|
| Schedule | `0 9 * * 1-5` — 9:00 AM Mon–Fri |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Salesforce, Slack, Google Drive, Google Calendar, Gmail, Apollo.io |
| Env vars used | `APOLLO_API_KEY` (for the direct REST calls the connector doesn't cover) |
| Network policy | must allow `api.apollo.io` |
| Replaces laptop task | `ydc-usage-outreach-daily` |
| Expected output | "📋 YDC Usage Outreach" review list posted to #my-accounts-api-users-daily (C0AUKK58U73); `daily-pending-{date}.json` state file in Drive |

## PROMPT

```
Open the repository file .claude/skills/ydc-usage-outreach-daily/SKILL.md and follow its instructions exactly, in scan mode. Scan new API signups and newly active users across Andrew's accounts, classify them, post the numbered review list to #my-accounts-api-users-daily, and write the daily-pending state file to Drive. Follow the file's cloud write boundary exactly: Salesforce is READ-ONLY in the cloud (any Contact-creation payloads are surfaced for review, not executed); Apollo writes happen only in enroll mode after Andrew's "go" reply. If the file cannot be read, post a one-line error notice to #my-accounts-api-users-daily instead of improvising.
```

## Cutover notes

- The cloud port of the skill lives at `.claude/skills/ydc-usage-outreach-daily/SKILL.md`. Its SFDC reads use the Salesforce connector (soqlQuery) instead of the laptop's `sf` CLI.
- IMPORTANT: the laptop version created Salesforce Contacts during enrollment. The cloud Salesforce connector is read-only, so the cloud version flags contact-creation payloads in the Slack review thread instead of executing them. If you approve them, create the contacts from the laptop or Salesforce UI until a write-capable path (Bucket B v2: Cloud Run or Managed Agents + vault) is in place.
- Verify on manual test: review list format matches the laptop's (the 10am watchdog greps for "📋 YDC Usage Outreach"), pending file lands in Drive with slack_thread_ts set.
