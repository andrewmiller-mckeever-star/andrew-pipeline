---
name: ydc-meeting-brief
description: CLOUD version. Daily meeting prep automation for Andrew at You.com, designed to run as a Claude Code Routine (no laptop, no local MCP). Pulls tomorrow's Google Calendar via connector, finds non-recurring meetings with external attendees, researches each company and attendee (You.com API or connector, LinkedIn via web search, Salesforce connector, Slack connector), creates one Google Doc brief per meeting in the "Meeting Briefs" Drive folder, and posts all links to #automated-meeting-briefs in Slack. Trigger manually with "run meeting brief", "prep for tomorrow's meetings", or "ydc-meeting-brief".
---

# YDC Meeting Brief: Daily Meeting Prep (Cloud)

## Purpose

This skill prepares Andrew for the next day's external meetings. It produces one Google Doc per qualifying meeting, each containing company intel, attendee profiles, CRM history, and specific guidance on how to run the conversation. After all docs are created, it posts a summary with links to #automated-meeting-briefs in Slack.

**Cloud execution notes (differences from the laptop version):**
- All auth comes from Andrew's account-level claude.ai connectors: Google Calendar, Google Drive, Slack, Salesforce, You.com Search. No local MCP servers, no `~/.claude/settings.json`.
- Connector tool name prefixes vary by session. Locate tools by their function name suffix (e.g., a Google Calendar tool ending in `list_events`), not by a hardcoded server ID.
- There is no rclone fallback in the cloud. If Doc creation fails, report it in the Slack post and move on.
- WRITE BOUNDARY: this skill creates Google Docs in the Meeting Briefs folder and posts to #automated-meeting-briefs. Nothing else. Never write to Salesforce, never email anyone, never message any other Slack channel or person.

---

## Step 1: Setup

Read these environment variables (set in the Claude Code cloud environment). Every one has a default; missing env vars must never abort the run:

| Variable | Default if unset |
|---|---|
| `AE_NAME` | Andrew Miller-McKeever |
| `AE_FIRST_NAME` | Andrew |
| `YDC_API_KEY` | (none — triggers connector fallback in Step 3B) |
| `YDC_RESEARCH_ENDPOINT` | `https://api.you.com/v1/research` |
| `YDC_SEARCH_ENDPOINT` | `https://api.you.com/v1/search` |
| `SFDC_USER_ID` | `{SFDC_USER_ID}` |
| `GDRIVE_FOLDER_ID` | `1Fd2sMXvUnFVbAoh_BxqCrUI3R8snvp9u` |
| `SLACK_USER_ID` | `{SLACK_USER_ID}` |

Calculate the target date. By default this is tomorrow. If explicitly invoked in catch-up mode (e.g., a watchdog instructed to brief today's meetings), use today's date instead.

Format the target date two ways:
- Human: e.g., "Tuesday, April 29"
- ISO: e.g., "2026-04-29"

---

## Step 2: Pull the Target Day's Calendar

Use the Google Calendar connector tool `list_events` to fetch all events for the target date (full day, midnight to midnight, in Andrew's calendar timezone).

**Filter OUT — skip these entirely:**
- Events with a `recurrence` field set (any value = recurring = skip)
- Events where ALL attendee email domains are `you.com` (internal only)
- Events with no attendees (solo blocks, reminders)
- Events where Andrew's `responseStatus` is `"declined"`

**Do NOT filter out:**
- Events where Andrew is listed as `optionalAttendee: true` — optional means he chose to attend, not that he's skipping. Brief it.
- Events organized by a You.com colleague that include external attendees — the organizer's domain doesn't matter, only whether external emails are present.

**What remains** = meetings that need a brief.

**Audit log (keep in memory):** For every event evaluated, record the title and filter outcome — e.g., "Example Corp x You.com Visit — INCLUDED (external: contact@examplecorp.com)" or "Weekly Standup — EXCLUDED (recurring)" or "All-hands — EXCLUDED (all attendees @you.com)". You will reference this list in Step 6 to ensure every qualifying meeting appears in the Slack post.

If nothing remains after filtering, post this message to `#automated-meeting-briefs` via the Slack connector tool `slack_send_message`:

> <@{SLACK_USER_ID}> No external meetings tomorrow. Nothing to prep.

(Use "today" instead of "tomorrow" if running in catch-up mode.)

Then stop.

---

## Step 3: For Each Qualifying Meeting, Gather Intelligence

Process meetings one at a time (not in parallel — rate limit protection). For each meeting:

### 3A: Extract Meeting Metadata
- Title, start time, end time, duration
- Full attendee list with names and emails
- External attendees = anyone not at `@you.com`
- Company name = derive from the most common external domain (e.g., `stripe.com` → Stripe, `openai.com` → OpenAI). Capitalize properly. Strip "Inc", "Corp", "LLC" from display name.

### 3B: Company Research

**Primary path (requires `YDC_API_KEY` env var):** fire these two You.com API calls via curl.

**Research call — company overview:**
```bash
curl -s -X POST \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "What does {COMPANY} do? Focus on: their core product, who their customers are, their AI and technology initiatives in 2025-2026, any recent product launches, funding, or strategic moves. Include their website URL and any engineering blog. Cite all sources."}' \
  "$YDC_RESEARCH_ENDPOINT"
```

**Search call — news last 7 days:**
```bash
curl -s -X POST \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{COMPANY} news 2026", "num_web_results": 10}' \
  "$YDC_SEARCH_ENDPOINT"
```

**Fallback path (no `YDC_API_KEY`, or curl calls fail):** use the You.com Search connector tool (`you-search`) with the same queries, supplemented by WebSearch. Note in the brief that deep research ran in degraded mode. Do not abort.

Filter news results to the last 7 days only. If nothing in 7 days, note that explicitly in the brief.

### 3C: Attendee Intelligence

For each external attendee, run a WebSearch:
```
site:linkedin.com "{FIRST_NAME} {LAST_NAME}" "{COMPANY}"
```

Extract: title, career background, any recent posts, articles, or public statements. If the LinkedIn search returns nothing useful, try:
```
"{FIRST_NAME} {LAST_NAME}" "{COMPANY}" site:linkedin.com OR site:twitter.com OR site:x.com
```

Note "Limited public profile found" if still nothing.

### 3D: Salesforce History

Run these SOQL queries via the Salesforce connector's `soqlQuery` tool (read-only; on the hosted connector the tool name looks like `soqlQuery…` with a platform suffix):

```sql
SELECT Id, Name, Type, OwnerId, Owner.Name
FROM Account
WHERE Name LIKE '%{COMPANY}%'
LIMIT 5
```

If an account is found, get its ID and run:

```sql
SELECT Id, Name, StageName, Amount, CloseDate, LastModifiedDate
FROM Opportunity
WHERE AccountId = '{ACCOUNT_ID}'
ORDER BY LastModifiedDate DESC
LIMIT 10
```

```sql
SELECT Id, FirstName, LastName, Title, Email
FROM Contact
WHERE AccountId = '{ACCOUNT_ID}'
LIMIT 10
```

```sql
SELECT Id, Subject, Description, ActivityDate, Status
FROM Task
WHERE WhatId = '{ACCOUNT_ID}'
ORDER BY ActivityDate DESC
LIMIT 10
```

Summarize: stage we're at, what's been discussed, any open commitments, contacts already known. If no SF account found, note: "No Salesforce record — net-new account."

If Salesforce is unavailable, note "Salesforce lookup unavailable" and continue. Never write to Salesforce.

### 3E: Slack History

Search for the company name and each external attendee's name using the Slack connector tool `slack_search_public_and_private` (or `slack_search_public` if that is the only search tool available).

Search terms to run (separate calls):
- The company name (e.g., "Stripe")
- Each external attendee's full name

Pull relevant threads from: `#api-gtm-team`, `#esl-api-sales`, `#sales-team`.

Summarize any relevant context: deal notes, competitive mentions, prior conversations, internal opinions. If nothing found, note: "No Slack history found."

### 3F: Prior Briefs and Open Loops

Search `#automated-meeting-briefs` for the company name. Prior brief posts and their linked docs give you the relationship arc. Extract:

- **OPEN LOOPS** — questions or next steps flagged in earlier briefs that are still unresolved. Carry them into today's brief as "unfinished business, not new asks."
- **STALE TALKING POINTS** — anything already congratulated or led with on an earlier call (awards, launches). Flag them so Andrew doesn't lead with them again.

**Counting rule:** a brief post is NOT a call. Count conversations only from actual calendar events or explicit call notes. If the count is uncertain, refer to calls by their dates instead of an ordinal ("calls on June 24, July 14" beats a wrong "fifth conversation").

---

## Step 4: Write the Meeting Brief

Synthesize all research into the brief below. Write it as a smart senior colleague briefing Andrew — direct, specific, no fluff. The goal is that Andrew reads this in 5 minutes and walks into the meeting fully oriented.

**Writing rules (always apply):**
- No em dashes. Use commas, colons, or semicolons instead.
- Short paragraphs, 2-3 sentences max.
- No AI-isms: never use "utilize," "robust," "comprehensive," "enhance," "streamline," "delve," or "embark."
- Mix prose and bullets naturally. Not every section needs bullets.
- Plain language. 5th-7th grade reading level.
- "How to Run This Meeting" and "One Thing to Nail" should sound like advice from a person, not a template.

---

### Brief Template

```
[COMPANY NAME] | [MEETING TITLE]
[Day, Date] | [Start Time - End Time] | [Duration]
Attendees: [Name (Title), Name (Title) — external listed first, then You.com team]

---

COMPANY OVERVIEW

[2-3 paragraphs. What they do, who their customers are, their AI or technology footprint, and why this meeting is happening. Weave in any relevant recent news naturally. Ground this in what was found — no filler.]

RECENT NEWS (LAST 7 DAYS)

[Bullet list of anything notable from the last 7 days. Specific: headline, date, what it means. If nothing: "No notable news in the last 7 days."]

WHO'S IN THE ROOM

[One paragraph per external attendee. Who they are, what their role suggests about their priorities, anything from their LinkedIn or public writing that signals how they think. Make it analytical, not biographical.]

OUR HISTORY WITH [COMPANY]

[Synthesize the Salesforce and Slack findings. What stage are we at? What's been said? Any open items or commitments? If this is net-new: "No prior CRM or Slack history. This is a first conversation." If Salesforce/Slack was unavailable, say so.]

HOW TO RUN THIS MEETING

[Narrative guidance — 3-5 sentences or short paragraphs. Where to open. How to guide the conversation. What to establish in the first 5 minutes. Where to steer if they bring up X. How to close. Write it like advice from someone who's done this call before — not a checklist.]

QUESTIONS TO ASK

[5-7 specific questions. Not generic discovery. Each one should be rooted in something found in the research — their product direction, a recent hire, something their CTO said publicly, a gap in their current stack. Questions that show Andrew did his homework.]

OBJECTIONS THEY MAY RAISE

[3-5 likely objections based on their profile, stage of conversation, and company context. Format:]

Objection: [what they might say]
Handle: [how to respond — specific, not generic]

ONE THING TO NAIL

[One sentence. The single most important outcome to walk away with from this meeting. Not a vague goal — a concrete one: "Get agreement to set up a 30-minute eval scoping call with their VP Eng." or "Confirm whether they're actively evaluating search APIs or still in the 'aware' stage."]
```

---

## Step 5: Create Google Doc

Search for the "Meeting Briefs" folder using the Google Drive connector tool `search_files` with query `name = 'Meeting Briefs' and mimeType = 'application/vnd.google-apps.folder'`.

Use the returned folder ID as `parentId`. If the search fails, fall back to `GDRIVE_FOLDER_ID` from Step 1 (the parent `accountplans` folder).

**Same-day dedupe:** also search the folder for an existing `Meeting Brief | {COMPANY} | {YYYY-MM-DD}`. If one exists (pre-generated or from an earlier run), still create yours — and mark the Slack line in Step 6 as superseding it.

Call the Google Drive connector tool `create_file`:
- `title`: `"Meeting Brief | {COMPANY} | {YYYY-MM-DD}"`
- `mimeType`: `"text/plain"` (auto-converts to Google Doc in Drive)
- `content`: the full brief text (base64-encoded if required by the tool)
- `parentId`: the Meeting Briefs folder ID

Capture the returned file ID. Construct the Google Doc URL:
```
https://docs.google.com/document/d/{file.id}/edit
```

**Fallback if Drive creation fails:** mark that meeting's line in the Step 6 Slack post as failed, then continue to the next meeting. Don't abort the whole run. (There is no rclone in the cloud environment.)

---

## Step 6: Post to Slack

After all meetings are processed, post ONE message to `#automated-meeting-briefs` using the Slack connector tool `slack_send_message`.

**Always open with `<@{SLACK_USER_ID}>`** so the message triggers an unread notification.

Format:
```
<@{SLACK_USER_ID}> Meeting briefs ready for {Day, Date}:

{Start Time} — {Company} | {Meeting Title}: {Google Doc URL}
{Start Time} — {Company} | {Meeting Title}: {Google Doc URL}
```

**Every qualifying meeting found in Step 2 must appear in this post**, even if its brief failed. Use these line formats:
- Created successfully: `{Start Time} — {Company} | {Meeting Title}: {Google Doc URL}`
- Failed entirely: `{Start Time} — {Company} | {Meeting Title}: ⚠️ brief generation failed — re-run manually`

**After the meeting lines, add ONE short context paragraph** (2-4 sentences, plain text): relationship temperature, the single most important goal, and any open loops carried forward — enough that Andrew can triage from his phone without opening the doc. If a same-day brief already existed (Step 5 dedupe), end with: "(Supersedes the earlier brief for this day — this one uses live calendar + CRM data.)"

Tone: clear, brief, no fluff. This is a notification, not a message.

---

## Error Handling Summary

| Failure | Action |
|---------|--------|
| Calendar pull fails | Post error to #automated-meeting-briefs and stop |
| `YDC_API_KEY` unset or Research API fails | Degrade to You.com Search connector + WebSearch, note in brief, continue |
| LinkedIn search returns nothing | Note "Limited public profile" and continue |
| Salesforce unavailable | Note "Salesforce lookup unavailable" and continue |
| Slack search fails | Note "Slack search unavailable" and continue |
| Google Doc creation fails | Mark the meeting's Slack line as failed, continue |
| Single meeting fails entirely | Log the error inline, continue to next meeting |

Never abort the full run because one meeting's research or doc creation failed.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-17 | Cloud port created from skills/ydc-meeting-brief | Migration to Claude Code Routines: connector tools instead of hardcoded local MCP IDs, env-var defaults, YDC_API_KEY made optional with connector fallback, rclone fallback removed, explicit write boundary added |
