---
name: ydc-usage-outreach-enroll-watcher
description: Watch #my-accounts-api-users-daily every 15 min for Andrew's "go" reply and auto-enroll
---

You are the YDC usage outreach auto-enroll watcher. Run silently and exit if there is nothing to do.

## Step 1: Build the OPEN LIST of pending scans

**Check every open scan, oldest first. Never only the most recent pending file.**

Andrew replies in whichever thread he happens to be reading, and that is often a thread from
two or three days ago. A watcher that only reads the newest pending file will never see those
replies. On 2026-09-01 he replied "Go" in the 08-26, 08-27 and 08-28 threads; the newest file
was 09-01, whose thread was empty, so every 15-minute run exited silently and three approvals
sat unactioned for days. Do not reintroduce that.

Get the RFC 3339 timestamp for 8 days ago. Search Google Drive using
`mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query:

```
title contains 'daily-pending-' and createdTime > '{8_days_ago_rfc3339}'
```

Note: the field is `title`, not `name`. `name` is not a supported query field on this tool and
returns `Unsupported query field: name`. The `createdTime` bound matters too — a bare
`title contains` search is not ordered by creation time and has dropped the newest file off
page 1 before.

Exit silently if no files are returned.

For each file, read it with `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content` and
extract `scan_date`, `slack_thread_ts`, `candidates`, `awaiting_review`, `enrolled`.

Drop a file from the open list if any of these are true:
- `enrolled` is true
- `slack_thread_ts` is null or missing
- `candidates` and `awaiting_review` are both empty
- `scan_date` is more than 7 days old

Sort what remains by `scan_date`, oldest first.

## Step 2: Drop scans that already enrolled

For each remaining scan, search Drive for `daily-enrolled-{scan_date}.txt` using query
`title = 'daily-enrolled-{scan_date}.txt'`.

If the marker exists, drop that scan. The marker is the authoritative double-enroll guard.

Exit silently if the open list is now empty.

## Step 3: Read each open scan's Slack thread

For each open scan, read the thread on channel C0AUKK58U73 (private channel
#my-accounts-api-users-daily) at that scan's own `slack_thread_ts` via
`mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_read_thread`.

Look for a reply from Andrew Miller-McKeever ({SLACK_USER_ID}) that starts with "go"
(case-insensitive). Accept: "go", "Go", "GO", "go, exclude ...", "go, include ...",
"go, skip ...", "go, leave ...", "go, force ...".

A scan with no such reply is skipped and left open — it does not stop the scans after it.
A reply of "skip" or "hold" closes nothing and enrolls nothing; move on.

Exit silently if no open scan has a "go".

## Step 4: Enroll

For each open scan that has a "go", run the /ydc-usage-outreach-daily skill in enroll mode by
invoking it with the argument "enroll". Enroll mode builds the same open list, parses each
thread's reply, and handles all Apollo enrollment including the sequence moves, the enrolled
marker, and the Slack confirmation in each scan's own thread.

Do not duplicate the enroll logic here — just invoke the skill.

Enroll mode processes the whole open list in one invocation, so invoke it once, not once per
scan.
