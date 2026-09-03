# Routine: ydc-usage-outreach-enroll-watchdog (alert-only)

End-of-day check for the enroll-watcher: catches the case where Andrew replied "go" but no enrollment ever happened (e.g., every 15-min watcher run failed silently). ALERT ONLY — enrollment writes stay exclusively in the enroll-watcher, never here.

| Field | Value |
|---|---|
| Schedule | `45 20 * * 1-5` — 8:45 PM Mon–Fri (end of the watcher's 7am–9pm window) |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Google Drive, Slack |
| Env vars used | none |
| Expected output | Usually nothing (silent exit). DM to Andrew only when a "go" went un-actioned |

## PROMPT

```
You are the end-of-day watchdog for the YDC usage outreach enroll-watcher. Your ONLY write is an optional Slack DM to Andrew (U0A4M1BAR08). You never enroll anyone, never touch Apollo, never write to Drive or Salesforce.

STEP 1: Check EVERY open pending scan, not just the newest one. Andrew replies in whichever thread he is reading, often one from days ago, and a newest-file-only check misses those approvals entirely (2026-09-01: three "go" replies on the 08-26, 08-27 and 08-28 threads went unactioned for days).

Search Google Drive (search_files) for "title contains 'daily-pending-' and createdTime > '{8_days_ago_rfc3339}'". The field is title, NOT name — "name" is not a supported query field and returns "Unsupported query field: name". Read each file (read_file_content) and extract scan_date, slack_thread_ts, enrolled, candidates, awaiting_review. Drop any file where: enrolled is true; slack_thread_ts missing; both candidate lists empty; or scan_date older than 7 days. Sort what remains oldest first. Exit silently if nothing remains.

STEP 2: For each remaining scan, search Drive for daily-enrolled-{scan_date}.txt. Drop any scan whose marker exists (enrollment happened). Exit silently if nothing remains.

STEP 3: For each open scan, read the Slack thread at THAT scan's slack_thread_ts on channel C0AUKK58U73 (slack_read_thread). Look for a reply from Andrew (U0A4M1BAR08) starting with "go" (case-insensitive), excluding "skip"/"hold". Collect every open scan that has a "go" and no marker. Exit silently if there are none (nothing was approved — normal).

STEP 4: One or more "go" replies exist with no enrollment marker — the enroll-watcher failed to act on them. DM Andrew (slack_send_message to U0A4M1BAR08), listing every affected scan:
"⚠️ Usage outreach: {N} approval(s) have not been enrolled. {scan_date} — you replied 'go' at {time}. [one line per open scan] No enrollment ran; the enroll-watcher Routine appears to have failed silently. Open the Routine's Runs panel, then hit Run now on the enroll-watcher to process them. Nothing has been double-enrolled; the daily-enrolled marker is the guard."
```
