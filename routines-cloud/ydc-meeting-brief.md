# Routine: ydc-meeting-brief (PILOT — migrate first)

| Field | Value |
|---|---|
| Schedule | `0 15 * * 0-4` — 3:00 PM Sun–Thu |
| Timezone | America/Los_Angeles |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Google Calendar, Google Drive, Slack, Salesforce, You.com Search (Free) |
| Env vars used | `YDC_API_KEY` (optional — degrades to connector search), `AE_NAME`, `AE_FIRST_NAME`, `SFDC_USER_ID`, `GDRIVE_FOLDER_ID`, `SLACK_USER_ID` |
| Replaces laptop task | `ydc-meeting-brief` (disable after 2 clean cloud runs) |
| Expected output | One Google Doc per external meeting in Drive "Meeting Briefs"; ONE Slack post to #automated-meeting-briefs opening `<@U0A4M1BAR08>` |

## PROMPT

```
Run the ydc-meeting-brief skill for tomorrow's external meetings. Pull tomorrow's Google Calendar, filter to non-recurring meetings with external (non-you.com) attendees, research each company and attendee, write one meeting brief Google Doc per meeting in the "Meeting Briefs" Drive folder, and post the links in one message to #automated-meeting-briefs in Slack opening with <@U0A4M1BAR08>. Follow the ydc-meeting-brief skill instructions exactly, including its soft-fail rules and write boundary.
```

## Verify after manual test

1. Filter audit: every calendar event evaluated has an include/exclude reason; recurring, internal-only, no-attendee, and declined events excluded; optional-attendance kept.
2. Salesforce soqlQuery returned account/opportunity/contact/task history (or clean "net-new" / "unavailable" notes).
3. Docs landed in the "Meeting Briefs" folder with title `Meeting Brief | {Company} | {YYYY-MM-DD}`.
4. Exactly one Slack message in #automated-meeting-briefs, opens with <@U0A4M1BAR08>, lists every qualifying meeting.
