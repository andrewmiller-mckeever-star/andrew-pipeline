---
name: ydc-linkedin-queue
description: Processes legacy Drive LinkedIn queue files for older whale pipeline accounts. Reads linkedin-queue-{company}-{date}.json files from Google Drive, goes to LinkedIn via Chrome to send connection requests with NO note, updates status in Drive, posts a Slack summary. Never sends DMs. DMs are manual and Andrew sends them by hand. Use when user says "run linkedin queue", "process linkedin connects", "send linkedin outreach", or when the scheduled task fires.
---

# YDC LinkedIn Queue Processor

## Scope Note (May 2026)
Sequences built with build-sequences.js (all accounts from May 2026 onward) include
LinkedIn connect (T2) and DM (T7) as Apollo sequence steps. No Drive queue file is
written for these accounts. This skill applies only to older whale pipeline accounts
where a linkedin-queue-{company}-{date}.json file already exists in Drive.

## LinkedIn policy (Andrew, 2026-10-08)
- Connection requests never carry a note. Ignore the `connect_note` field in every queue file.
- This skill never sends a LinkedIn message or InMail. DMs are manual. Andrew reviews and sends
  every LinkedIn message by hand. Leave `dm_status` untouched.
- Why: on 2026-09-25 and 09-28 automation sent 18 Cohort 1A/1B connection requests with raw
  `{{calls_30d}}` placeholders in the note.

## Overview

Reads per-contact LinkedIn queue files from Drive (written by older pipeline runs), sends connection requests with no note directly on LinkedIn via Chrome automation, tracks status in Drive, posts Slack summary.

It sends connects only. DMs that come due are listed in the Slack summary for Andrew to send by hand.

---

## Step 1: Find pending queue files in Drive

Search Drive for all files matching `linkedin-queue-` using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query: `name contains 'linkedin-queue-'`

Read each file via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__download_file_content`.

**Age-out rule:** Skip any file whose `created_date` is more than 30 days before today. These are stale and will never be actionable — ignore them silently.

Filter remaining files to those where at least one contact has `connect_status: "pending"` or a DM due for Andrew (`dm_status: "pending"`).

Exit silently if no pending contacts found across all files.

---

## Step 2: Process LinkedIn connects (contacts where connect_status = "pending" AND connect_due_date <= today)

For each contact due for a connect:

1. Navigate to their LinkedIn profile: `https://www.linkedin.com/in/{slug}` (extract slug from linkedin_url)
2. Click the "Connect" button
3. If prompted about a note: click "Send without a note". Never add a note, and ignore any `connect_note` text in the file
4. Confirm the request was sent
5. Update the contact's `connect_status` to `"connect_sent"` and `connect_sent_at` to today's ISO timestamp

**If "Connect" button not found** (already connected, pending, or profile not found):
- Set `connect_status` to `"skipped_already_connected"` or `"skipped_profile_not_found"`
- Continue to next contact

**Rate limiting:** Wait 8-12 seconds between each connection request to avoid LinkedIn rate limits.

---

## Step 3: List DMs that are due. Never send them (policy 2026-10-08)

For contacts where `dm_status = "pending"` AND `dm_due_date <= today` AND `connect_status = "connect_sent"`:

1. Do NOT open a Message box, paste `dm_message`, or send anything. No InMail either.
2. Leave `dm_status` as `"pending"`. Andrew updates it after he sends the DM by hand.
3. Add the contact to the "DMs due, send by hand" list in the Slack summary. The drafted copy stays in the `dm_message` field.

---

## Step 4: Update Drive queue files

After processing, write updated JSON back to Drive for each file that had changes. Use `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` to overwrite the existing file (use the file ID from the original search).

Update `apollo_contact_id` contacts in Apollo with a label `"LinkedIn Connect Sent"` and a note with the date via `apollo_contacts_update`.

---

## Step 5: Post Slack summary

Post to `#automated-linkedin-outbound-summary` (channel ID: `C0B4LF2MPUJ`) via `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`:

```
<@{SLACK_USER_ID}> LinkedIn Queue — {today}

✅ Connects sent ({N}):
  • {First Last} @ {Company} — {sequence}
  • ...

✋ DMs due, send by hand ({N}):
  • {First Last} @ {Company}
  • ...

⏭ Skipped ({N}): {reasons summary}
⏳ Still pending: {N} connects (not yet due)
```

If nothing was processed (all contacts are future-dated or already done): exit silently without posting.

---

## Chrome Automation Notes

- Uses `mcp__Claude_in_Chrome__*` tools for browser interaction
- Andrew must be logged into LinkedIn in Chrome
- If LinkedIn shows a CAPTCHA or identity verification: stop, post Slack alert to `#automated-linkedin-outbound-summary`, exit
- Do NOT attempt to bypass any verification screens
- If LinkedIn rate-limits mid-run: stop, post partial summary to `#automated-linkedin-outbound-summary`, update Drive with progress so far

---

## Scheduling

This skill runs as a scheduled task (`ydc-linkedin-queue`) Mon-Fri at 9:30am. A watchdog fires at 12pm and re-runs the skill if any contacts were due but not processed.
It checks all queue files on every run. Connects due today go out with no note. DMs are never sent. Due DMs are listed for Andrew to send by hand.
Queue files from past runs accumulate in Drive; this skill processes anything still pending.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-10-08 | Connects go out with no note and `connect_note` is ignored. The skill no longer sends DMs. Due DMs are listed in the Slack summary for Andrew to send by hand | On 2026-09-25 and 09-28 automation sent 18 Cohort 1A/1B invites with raw `{{calls_30d}}` notes. Apollo never renders variables in LinkedIn steps |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| 2026-05 | Added Scope Note: skill now applies only to pre-May-2026 whale pipeline accounts | build-sequences.js (May 2026+) puts LinkedIn connect (T2) and DM (T7) directly in Apollo sequence steps; no Drive queue file is written for those accounts |
| (prior) | Added 30-day age-out rule for stale queue files | Files older than 30 days were generating outreach for contacts who had long since moved past the touch window |
