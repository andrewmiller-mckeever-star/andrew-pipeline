# YDC: Usage Outreach Daily

## Purpose

Daily incremental scan of Product_User__c records. Finds new signups and newly active
users who aren't yet in a usage sequence, classifies them, and posts a Slack review list
to #my-accounts-api-users-daily. Andrew reviews in Slack and replies "go" (or lists exclusions).
Enrollment happens automatically within ~30 min of his Slack reply — or he can run
`/ydc-usage-outreach-daily enroll` in Claude Code immediately.

---

## How the Daily Flow Works

1. **9am weekday:** Scheduled scan runs, posts classified list to #my-accounts-api-users-daily
2. **Andrew replies** "go" (or "go, exclude ali@example.com") in Slack
3. **Auto-enroll watcher** runs every 15 min (Mon–Fri 7am–8pm), detects the reply, enrolls automatically
4. **OR:** Andrew runs `/ydc-usage-outreach-daily enroll` in Claude Code for immediate enrollment
5. **Enrolls approved users.** T1 auto-schedules (all sequences are active).

**Andrew replies in whichever thread he is reading, and that is often not today's.** Every
run checks EVERY open scan from the last 7 days, oldest first, against that scan's own
thread. Never only the newest pending file.

**Double-enrollment guard:** the `daily-enrolled-{scan_date}.txt` marker is authoritative,
backed by `enrolled: true/false` in the pending file. A scan with either one set is closed
and is never reprocessed.

---

## Schedule

- **Runs:** Monday–Friday at 9am
- **Monday lookback:** 3 days (covers Saturday + Sunday new users)
- **Tuesday–Friday lookback:** 1 day
- **Cron:** `0 9 * * 1-5`

---

## CRITICAL GUARDRAILS

- Sequences always **INACTIVE**. Never auto-activate.
- "Interaction" = ANY of these with ANYONE at You.com, across ANY channel:
  inbound email reply (SFDC or Gmail), a completed OR upcoming meeting (SFDC Task/Event or a
  Google Calendar invite), any logged SFDC activity including LinkedIn tasks, or a Slack
  thread/DM back-and-forth. If a person has an interaction on any channel they are NOT
  "never contacted" — they must never land in a cold sequence (A/B/C/D/F).
- "Real conversation" = a two-way subset of the above: an inbound email reply, a completed
  meeting/call, or a Slack back-and-forth.
- Outbound sequences, SDR blasts, and marketing emails do NOT count as either. Them signing
  up because of an email we sent does not count.
- If someone is in a non-usage Apollo sequence AND qualifies for a usage sequence,
  flag for reclassification — do not auto-remove. Andrew confirms via Slack reply.
- **Only LIVE sequence memberships (active/paused/not_sent on a non-archived campaign)
  block or reclassify.** Archived and finished memberships are ignored — those users are
  normal candidates.
- **Foreign-sequence policy (Andrew's call, 2026-09-01): move them, do not hold them.**
  Anyone live in a sequence that is not Andrew's gets removed from that sequence and
  enrolled in the correct usage sequence. That covers another rep's campaign, a campaign
  sending from a mailbox that is not Andrew's, and any non-usage campaign. It happens on a
  plain "go" with no force needed. `flagged_conflict` is retired as a default outcome: it
  now fires only when the move cannot be completed (removal call fails, or the campaign
  cannot be resolved), which is a mechanical failure, not a policy hold.
- **A removal from another rep's sequence is visible to that rep.** Always name the rep and
  the campaign in the Slack confirmation so Andrew knows who to tell.
- **Sequence state is a moving target.** Campaigns get archived and un-archived between
  scan and enroll. Judge state at the moment of the decision (re-verify at enroll time,
  ENROLL Step 3C), snapshot the evidence into the pending file (`membership_snapshot`),
  and never dispute an earlier observation of Andrew's with a later API read — the
  snapshot is the record. A contact-side status of "active" inside an archived campaign
  is a DEAD membership.
- Never enroll without explicit "go" from Andrew.

---

## Modes

### Mode 1: Scan (default — scheduled or manual)
Runs SFDC queries, classifies users, posts Slack review list, saves pending file. Stops.

### Mode 2: Enroll (`enroll` argument)
Reads the pending file from the last scan, checks Slack thread for Andrew's reply and any
exclusions, then enrolls the approved list in Apollo.

---

## Procedure

### SCAN MODE

#### Step 0: Readiness check

Before doing anything else, verify that required tools are available.

**Check 1 — Salesforce token (via Bash):**
Run this Bash command to get a fresh access token:
```bash
SF_TOKEN=$(/Users/andrew/.nvm/versions/node/v24.14.1/bin/sf org display \
  --target-org andrew.miller-mckeever@you.com --json 2>/dev/null | python3 -c "
import sys, json; d = json.load(sys.stdin); print(d['result']['accessToken'])")
SF_INSTANCE="https://ydc.my.salesforce.com"
SF_API_VERSION="66.0"
```
If `SF_TOKEN` is empty after this, Salesforce is unavailable — abort with the failure message.

Variables to use for all subsequent SOQL calls:
- `SF_TOKEN` — Bearer token for Authorization header
- `SF_INSTANCE` = `https://ydc.my.salesforce.com`
- `SF_API_VERSION` = `66.0`

**Check 2 — Slack:** `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message` — required to deliver the review list (Step 7)

**Check 3 — Apollo:** `mcp__apollo__apollo_contacts_search` or `mcp__1bce6c2a-2c4c-4908-a5e8-f1bca738186e__apollo_contacts_search` — required to prevent duplicate enrollments (Step 3)

**If Salesforce token OR Slack OR Apollo is unavailable:**
1. Note exactly what failed (e.g. "Salesforce token", "Apollo").
2. If Slack IS available, post to channel C0AUKK58U73 (#my-accounts-api-users-daily):
   `⚠️ <@U0A4M1BAR08> Usage outreach scan failed ({today}) — {missing_names} not available at startup. Run /ydc-usage-outreach-daily manually to catch up.`
3. Also call `PushNotification` with title `"⚠️ Usage Outreach Scan Failed"` and body
   `"{missing_names} not available. Scan aborted — run /ydc-usage-outreach-daily manually."`
4. Abort. Do not proceed to Step 1.

**If all checks pass:** proceed to Step 1.

**Salesforce SOQL helper (used in Steps 2, 4A, 4B):**
For any SOQL query, use Bash:
```bash
curl -s -G "${SF_INSTANCE}/services/data/v${SF_API_VERSION}/query" \
  --data-urlencode "q={SOQL_QUERY_HERE}" \
  -H "Authorization: Bearer ${SF_TOKEN}"
```
Parse the JSON response: `records` array contains the results, `totalSize` has the count.
If HTTP 401 is returned, re-run the `sf org display` command to refresh the token and retry once.

#### Step 1: Determine the lookback window

Check today's day of week:
- **Monday:** lookback = 3 days (covers Saturday + Sunday)
- **Tuesday–Friday:** lookback = 1 day

#### Step 2: Pull new Product_User__c records (run sequentially)

Use the Salesforce SOQL helper from Step 0 (Bash curl). Run Query 1, then Query 2.

**Query 1 — New signups since lookback:**
```sql
SELECT Email__c, Domain__c, Account__c, Account__r.Name, Account__r.Type,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       API_Calls_per_User_All_Time__c, Email_Free_Provider__c
FROM Product_User__c
WHERE Account__r.OwnerId = '005Vq000009j4ezIAA'
AND Email_Free_Provider__c = false
AND Signup_Date__c >= LAST_N_DAYS:{lookback_days}
ORDER BY Signup_Date__c DESC
LIMIT 200
```

**Query 2 — Newly active users (first call in lookback window):**
```sql
SELECT Email__c, Domain__c, Account__c, Account__r.Name, Account__r.Type,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       API_Calls_per_User_All_Time__c, Email_Free_Provider__c
FROM Product_User__c
WHERE Account__r.OwnerId = '005Vq000009j4ezIAA'
AND Email_Free_Provider__c = false
AND First_API_Call_Date__c >= LAST_N_DAYS:{lookback_days}
AND Signup_Date__c < LAST_N_DAYS:{lookback_days}
ORDER BY API_Calls_Last_7_Days__c DESC NULLS LAST
LIMIT 200
```

Deduplicate by `Email__c`. This is today's **candidate list**.

#### Step 3: Classify each candidate's existing sequence membership

**Only a LIVE sequence membership blocks enrollment. Archived and finished
memberships are ignored — a user whose only membership is dead is a normal
candidate.** This is the whole point of the step: a plain name match is not enough.

**3.0 — Get the live usage campaign IDs (once for the whole scan):**
Call `mcp__apollo__apollo_emailer_campaigns_search` with `q_name="YDC | Usage"`.
Keep only campaigns where `active: true` AND `archived: false`. Call this set
`live_usage_campaign_ids`. (Everything else — archived or inactive — is dead.)

**3.1 — Read each candidate's memberships:**
For each user, call `mcp__apollo__apollo_contacts_search` with `q_keywords="{email}"`.
From the matched contact, read `contact_campaign_statuses[]`. Each element has an
`emailer_campaign_id` and a `status` (`active` / `paused` / `not_sent` / `finished` /
`completed` / `removed` / `bounced`).

**3.2 — Resolve each membership's campaign, then drop dead memberships:**

**TRAP (this caused a real miss):** the contact-side `status` can read `"active"` while
the campaign itself is ARCHIVED. An archived campaign sends nothing — that person is NOT
getting emails, and that membership must never block anything. NEVER judge a membership
from the contact-side `status` alone; always resolve the campaign itself.

If a membership's campaign is not in the `apollo_emailer_campaigns_search` results
(private / another rep's), fetch it directly by ID — this works cross-rep (verified
2026-07-17 against another rep's private campaign):

```bash
curl -s -X GET "https://api.apollo.io/api/v1/emailer_campaigns/{emailer_campaign_id}" \
  -H "X-Api-Key: $APOLLO_API_KEY"
```
Read `emailer_campaign.name`, `.active`, `.archived`, `.user_id`.

Treat a membership as **dead (ignore it entirely)** if ANY of:
- its `status` is `finished` / `completed` / `removed`, OR
- its campaign has `archived: true` (fetch and confirm; don't guess), OR
- its campaign has `active: false` (toggle off = not sending). Exception: if the
  inactive campaign is a non-usage sequence Andrew owns, still set `reclassify_from`
  so they get removed — prevents a double-send if that sequence is later activated.

A dead membership does not block, does not flag, and (except the reclassify exception
above) does not reclassify. This is the fix for the reported bug: a user whose only
membership is an archived sequence must fall through to "normal candidate" — **even if
their contact-side status still says "active".**

**3.3 — Classify from the LIVE memberships only:**
- Live in a `YDC | Usage |` sequence (`emailer_campaign_id` in `live_usage_campaign_ids`
  with a live `status`) → **skip** (already getting our emails). Record
  `usage_membership: "active"`. Do NOT add to candidates. (Overridable later by force.)
- Live in a **non-usage** sequence that Andrew owns (the membership's
  `send_email_from_email_address` is Andrew's mailbox) → keep as candidate, set
  `action: "enroll"` and `reclassify_from: "{sequence name}"`. Removed from the old
  sequence and re-enrolled in ENROLL Step 4.
- Live in **any sequence that is not Andrew's** (`send_email_from_email_address` ≠
  Andrew's mailbox — another rep's campaign, a shared mailbox, anything) → keep as
  candidate, set `action: "enroll"` and
  `reclassify_from_foreign: {sequence_name, campaign_id, owner_email, status}`.
  These enroll on a **plain "go"**. ENROLL Step 4 removes them from the foreign sequence
  first, then enrolls them in the usage sequence. No force needed.

  This reverses the earlier cross-rep hold. Andrew's instruction (2026-09-01): anyone in a
  sequence that is not his comes out of it and goes into his. Do not hold these, do not ask
  him to re-approve them, and do not treat the cross-rep double-enroll memory as still
  governing — it predates this decision.
- No live memberships (including "only dead memberships") → normal candidate.
  Record `usage_membership: "archived"` if a dead usage membership existed, else `"none"`.

**3.4 — Snapshot the evidence for every decision:**
For each skip / reclassify / `flagged_conflict` decision, write a `membership_snapshot`
onto the candidate record in the pending file:

```json
{ "campaign_id": "...", "campaign_name": "...", "campaign_active": true,
  "campaign_archived": false, "contact_status": "active",
  "owner_mailbox": "rep@you.com", "checked_at": "2026-07-17T16:20:00Z" }
```

Sequence state is a moving target — reps archive, un-archive, and re-run campaigns, and
automations enroll contacts. The snapshot is the record of what was true when the
decision was made. Later disputes get settled by the snapshot, never by re-querying and
assuming nothing changed.

Note: `apollo_emailer_campaigns_search` only returns campaigns visible to Andrew's API
user, so another rep's campaign may not appear there. Detect the membership from the
contact's `contact_campaign_statuses[]`, then resolve the campaign via the direct GET
by ID in 3.2 — never classify a cross-rep membership from contact status alone.

#### Step 4: Check interaction history across ALL channels

Goal: detect ANY way we've interacted with each candidate so known contacts never get cold-emailed.
A person is "never contacted" ONLY if every channel below comes back empty.

Run the cheap batched SFDC queries (4A–4C) and the single calendar pull (4D) for ALL candidates.
Then run the per-person deep checks (4E Slack, 4F Gmail) ONLY on the subset that still looks
untouched after 4A–4D — this bounds cost on large scans.

Use the Salesforce SOQL helper from Step 0 (Bash curl) for 4A–4C. Build one batched `IN` clause
from all candidate emails. These are org-wide queries — no OwnerId filter.

**4A — Inbound email replies (SFDC EmailMessage):** strongest two-way signal.
```sql
SELECT FromAddress, MessageDate
FROM EmailMessage
WHERE Incoming = true
AND MessageDate >= LAST_N_DAYS:365
AND FromAddress IN ({candidate_emails})
```

**4B — All SFDC activity (Task — org-wide, any you.com team member):** no Type/Status filter so
LinkedIn tasks, upcoming meetings, and other logged activity all register.
```sql
SELECT WhoId, Who.Email, ActivityDate, Type, TaskSubtype, Status, Subject, Owner.Name
FROM Task
WHERE ActivityDate >= LAST_N_DAYS:365
AND Who.Email IN ({candidate_emails})
```
Interpret: completed Meeting/Call/Demo = real conversation; `[Gong In]` subject prefix = inbound
reply; LinkedIn task or any other logged/upcoming activity = interaction (pulls out of cold).

**4C — SFDC Events (calendar invites synced to CRM):**
```sql
SELECT WhoId, Who.Email, StartDateTime, Subject, Owner.Name
FROM Event
WHERE Who.Email IN ({candidate_emails})
AND StartDateTime >= LAST_N_DAYS:365
```

**4D — Google Calendar (pull ONCE, match locally):**
Call `mcp__b68eebde-98cd-48dc-be98-2d3083754ddd__list_events` over the range `startTime = now-365d`,
`endTime = now+45d`, `orderBy=startTimeDesc`, paginating on `nextPageToken`. Build a map of
external attendee email → most-recent event date, then match candidate emails against it locally.
A match (past or upcoming) = meeting relationship. This is a handful of paginated calls total,
NOT one per candidate.

**4E — Slack (per-person, only for candidates still untouched after 4A–4D):**
Search `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_search_public_and_private` by the
candidate's email local-part, last name, AND domain. Do NOT restrict to a channel list — this
tool searches ALL channels and DMs by default, and the most relevant threads usually live in
per-deal channels (e.g. `#ext-{company}-youdotcom`, `#internal-{company}`) that a fixed list
would miss. Flag any thread or DM where the prospect and a you.com person both appear. Record the
channel and most-recent message date.

**4F — Gmail (per-person, only for candidates still untouched after 4A–4E):**
Search `mcp__1073573f-159f-4b4d-8908-67e04234c91e__search_threads` with
`query="from:{email} OR to:{email} newer_than:1y"`. A thread containing both sent and received
messages = two-way conversation. Log how many candidates were deep-checked.

For each user, record:
- `has_interaction`: true if ANY channel (4A–4F) hit
- `has_real_conversation`: true if a two-way subset hit (email reply, completed meeting/call, Slack back-and-forth, Gmail two-way thread)
- `last_interaction_date`: most recent date across ALL channels
- `days_since_contact`: integer days since last_interaction_date
- `contact_channels`: list, e.g. ["calendar", "slack"]
- `who_at_youcom`: Owner.Name from Task/Event, "inbound email", or Slack handle

#### Step 5: Classify each user

Classification priority (top wins — cold buckets A/B/C/D/F are only reachable when `has_interaction` is false):
1. `has_interaction` AND `last_interaction_date` ≤ 90 days ago → **awaiting_review** (active relationship — do NOT auto-enroll; require explicit opt-in)
2. `has_interaction` AND `last_interaction_date` > 90 days ago → **Seq E** (re-engagement)
3. No interaction on any channel, Account Type = Customer or Partner:
   - New signup, few/no calls → **Seq D**
   - Existing API calls → **Seq F**
4. No interaction on any channel, Account NOT Customer/Partner:
   - 0 calls, signed up last 120 days → **Seq A**
   - Calls in last 90 days → **Seq B**
   - Had calls, last call 30–120 days ago → **Seq C**
5. No interaction and no usage signal → **skip**

**`awaiting_review` means:** The user has ANY interaction with You.com in the last 90 days —
across any channel (email reply, completed OR upcoming meeting, Google Calendar invite, logged
SFDC activity incl. LinkedIn task, or Slack thread/DM). They appear in the Slack post in a
separate AWAITING REVIEW section and are NEVER auto-enrolled. Andrew must explicitly say
"go, include email@co.com" to enroll them. Default is to leave them alone.

#### Step 6: Build pending file

Get today's date in YYYY-MM-DD format.

Search Google Drive for the `accountplans` folder using `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with query `name = 'accountplans' and mimeType = 'application/vnd.google-apps.folder'`. Use the returned folder ID as `parentId` for all file writes.

**Assign a sequential number to each candidate** (1-based, in the order they appear in the Slack post). Store this as `"n": 1` on each candidate object. This number is used in Slack replies to include/exclude by position. **Numbering spans BOTH the normal enroll list and the conflict-flagged list** (`action: "flagged_conflict"`), so `go, force 5` can target a flagged candidate by number. `awaiting_review` and skipped entries are addressed by email only.

Create `daily-pending-{today}.json` in the accountplans folder via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` with the following content:

```json
{
  "scan_date": "2026-04-21",
  "lookback_days": 3,
  "slack_channel": "my-accounts-api-users-daily",
  "slack_thread_ts": null,
  "enrolled": false,
  "candidates": [
    {
      "n": 1,
      "email": "ali@example.com",
      "first_name": "Ali",
      "last_name": "Saberi",
      "company": "Acme",
      "account_id": "001...",
      "account_type": "Prospect",
      "sequence": "B",
      "reason": "Active 2,270 calls/7d, no prior conversation",
      "action": "enroll",
      "slack_flag": null,
      "reclassify_from": null,
      "reclassify_from_foreign": null,
      "usage_membership": "none",
      "conflict": null,
      "membership_snapshot": null,
      "calls_7d": 2270,
      "calls_30d": 7695,
      "signup_date": "2026-03-10",
      "last_call_date": "2026-04-20",
      "has_interaction": false,
      "last_interaction_date": null,
      "days_since_contact": null,
      "contact_channels": [],
      "who_at_youcom": null
    }
  ],
  "awaiting_review": [
    {
      "email": "ethan@reflection.ai",
      "first_name": "Ethan",
      "last_name": "Doe",
      "company": "Reflection AI",
      "sequence": "B",
      "reason": "348K calls/7d — but meeting on calendar Jun 18 + Slack thread #api-gtm-team Jun 12",
      "has_interaction": true,
      "last_interaction_date": "2026-06-18",
      "days_since_contact": 4,
      "contact_channels": ["calendar", "slack"],
      "who_at_youcom": "Andrew Miller-McKeever"
    }
  ],
  "skipped": []
}
```

**Field notes (added for the archived-vs-active fix):**
- `action`: `"enroll"` (normal, and the value used for BOTH reclassify paths), `"awaiting_review"`, or `"flagged_conflict"` (reserved for a move that could not be completed — see below).
- `usage_membership`: `"none"` (never in a usage sequence), `"archived"` (only dead usage memberships — treated as none, still enrolled on "go"), or `"active"` (live usage membership — genuinely skipped).
- `reclassify_from`: `null`, or the name of a live sequence **Andrew owns** that this person is being moved out of.
- `reclassify_from_foreign`: `null`, or `{ "sequence_name", "campaign_id", "owner_email", "status" }` for a live sequence that is **not Andrew's**. They are moved out of it and into the usage sequence on a plain "go". This replaces the old `conflict` hold.
- `conflict`: `null`, or the same shape as above, set ONLY when the move mechanically failed (removal call errored, or the campaign could not be resolved). `action` becomes `"flagged_conflict"` and the person is reported to Andrew rather than enrolled blind.
- `membership_snapshot`: `null`, or the evidence recorded at decision time (Step 3.4): `{ "campaign_id", "campaign_name", "campaign_active", "campaign_archived", "contact_status", "owner_mailbox", "checked_at" }`. Updated again at enroll time (ENROLL Step 3C). This is the audit trail — state disputes are settled by the snapshot, not by re-querying later.

#### Step 7: Post Slack review list

**Always post to Slack, even when the candidate list is empty.** This confirms the scan ran.

Post to #my-accounts-api-users-daily via
`mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_send_message`.

Save the returned `ts` (thread timestamp) to the pending file as `slack_thread_ts`.

**If candidates list is empty (no one to enroll, no reclassifications, no awaiting review):**
```
<@U0A4M1BAR08> 📋 YDC Usage Outreach | {today} | {lookback} day lookback

All clear — no new users to enroll today.

Skipped (already active in usage sequence): {N}
```

**Otherwise (normal case):**

Each candidate in the main enroll list gets a sequential number. Numbers are assigned in the order contacts appear in the post, across all companies. Use these numbers in your Slack reply to skip or target specific contacts without typing full emails.

```
<@U0A4M1BAR08> 📋 YDC Usage Outreach | {today} | {lookback} day lookback

{N} to enroll  ·  {N} moved from another sequence  ·  {N} awaiting review  ·  {N} skipped

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACME  [Prospect]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → Seq B (Active Tester)
    1.  ali@acme.com       2,270 calls/7d · 7,695/30d

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOVING OUT OF ANOTHER SEQUENCE (included in "go"):
  4.  user@co.com    [→ Seq B]  — out of "YDC | Territory | Seq A" (your mailbox)
  5.  carlos@co.com  [→ Seq B]  — out of "product user journey" (Joe Hindle), step 3 of 5

  (These enroll on a plain "go". Numbers continue from the enroll list above.
   Anyone sending from a mailbox that is not yours is named here so you know who to tell.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ AWAITING YOUR REVIEW — prior/active interaction, not auto-enrolled:
  jane@acme.com  [Seq B]  — emailed back Apr 15 (5 days ago)
  ethan@reflection.ai [Seq B] — meeting on calendar Jun 18 + Slack thread #api-gtm-team Jun 12
  slack@co.com   [Seq D]  — Slack thread in #esl-api-sales Apr 18 (2 days ago)

  (Each line cites the channel(s) and who at You.com had the contact.)
  To enroll any of these, reply: "go, include jane@acme.com"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SKIPPED — Already ACTIVE in usage sequence (getting emails now):
  existing@co.com — active in Seq A

  (Archived/finished memberships are NOT skipped — those users appear in the enroll list.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reply "go" — enroll all, including everyone being moved out of another sequence
"go, skip 2 3" — skip by number
"go, only 1 2" — enroll only these numbers
"go, include jane@acme.com" — add from AWAITING REVIEW
"go, leave 5" — leave 5 where they are, do not move them out of the other sequence
"go, force 5" — enroll 5 even if they are already live in one of your own usage sequences
Then run /ydc-usage-outreach-daily enroll (or the auto-watcher picks up within ~15 min). T1 schedules automatically.
```

**STOP. Andrew reviews in Slack and replies "go" when ready.**

---

### ENROLL MODE (`/ydc-usage-outreach-daily enroll`)

#### Step 1: Build the OPEN LIST of pending scans

**Process EVERY open pending scan, oldest first. Never just the newest one.**

Andrew replies in whichever thread he is looking at, and that is often a thread from two or
three days ago. A run that only reads the newest pending file will never see those replies,
and the approvals pile up invisibly. (2026-09-01: three "go" replies on the 08-26, 08-27 and
08-28 threads went unactioned for days because of exactly this.)

Get today's date in YYYY-MM-DD, and the RFC 3339 timestamp for 8 days ago.

Search Drive via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__search_files` with:

```
title contains 'daily-pending-' and createdTime > '{8_days_ago_rfc3339}'
```

The `createdTime` bound matters. A bare `title contains` query is not ordered by creation
time and has dropped the newest file off page 1 before.

Then build the **open list**:

1. For each returned pending file, read it via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__read_file_content` and extract `scan_date`, `slack_thread_ts`, `enrolled`, `candidates`, `awaiting_review`.
2. Drop any file where `enrolled` is `true`.
3. Search Drive for `daily-enrolled-{scan_date}.txt`. Drop any file that has a marker — the marker is the authoritative double-enroll guard.
4. Drop any file with a null/missing `slack_thread_ts`, or with both `candidates` and `awaiting_review` empty.
5. Drop any file whose `scan_date` is more than 7 days old. Report those as expired rather than enrolling them; a "go" that old should be re-scanned, not replayed.

Sort the open list by `scan_date`, **oldest first**.

If the open list is empty → abort: "No open pending scans. Nothing to enroll."

**Run Steps 2 through 9 once per open scan, in that order**, each against its own
`slack_thread_ts` and its own candidate list. A scan with no "go" reply is skipped quietly
and left open; it does not stop the scans after it. Deduplicate across scans by email: if
the same person is approved on two open scans, enroll once and note the duplicate in both
threads. Print a one-line roll-up per scan at the end.

#### Step 2: Read Andrew's Slack reply for exclusions and opt-ins

If `slack_thread_ts` is set, read the thread via
`mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_read_thread` on #my-accounts-api-users-daily.

Look for Andrew's reply. Parse for (all forms are case-insensitive, "go" prefix is optional):

- "go" with no modifiers → enroll every candidate with `action: "enroll"`. **That includes
  everyone carrying `reclassify_from` or `reclassify_from_foreign`** — they are moved out of
  their current sequence and into the usage sequence. `awaiting_review` NOT enrolled.
- "go, skip 2 3" or "skip 2 3" → exclude candidates by their number (n field)
- "go, only 1 2" or "only 1 2" → enroll ONLY the listed numbers, skip all others
- "go, exclude {email}" or "exclude {email}" → exclude by email address
- "go, include {email}" → add from `awaiting_review` (explicit opt-in required)
- "go, leave 5" / "go, leave carlos@co.com" → do NOT move this person out of the sequence
  they are in, and do not enroll them. The opt-out for the move policy.
- "go, force 5" / "go, force carlos@co.com" → enroll even if they are already live in one of
  **Andrew's own** usage sequences (the one remaining genuine skip). Mark `force: true`.
- "go anyway" / "go, force all" → still accepted for backward compatibility. Under the move
  policy a plain "go" already covers foreign sequences, so this now only adds anyone skipped
  for a live membership in Andrew's own usage sequence.
- Multiple modifiers allowed: "go, skip 3 4, include jane@acme.com, leave 5"
- "skip" or "hold" (alone, no numbers) → abort enrollment for THIS scan, notify Andrew,
  and continue to the next open scan

When resolving number references, look up the candidate with matching `n` field in the pending file.
Treat "mailto:foo@bar.com" the same as "foo@bar.com" when parsing exclusions (strip the mailto: prefix).

**Force semantics:** a `force: true` candidate enrolls regardless of ANY membership state
(active usage, foreign, archived, finished). It is the literal "if I say go anyway, enroll
them, period."

Force is no longer needed for a foreign sequence — the move policy handles those on a plain
"go". Force now only covers the one case still skipped by default: someone already live in
one of Andrew's own `YDC | Usage |` sequences.

**`awaiting_review` users are NEVER enrolled unless explicitly named in a "go, include" reply.**
If Andrew says "go" without naming them, they stay out. Do not prompt Andrew to include them.

If no Slack reply found, ask Andrew directly: "I don't see a Slack reply on the review list.
Confirm you want to enroll all {N} users? Reply 'go' or list exclusions/inclusions."

Print the final enrollment list before proceeding. Give Andrew one last chance to adjust.

#### Step 3: Pre-flight (run in parallel)

- **3A:** `mcp__apollo__apollo_email_accounts_index` — get sending email ID. Hard stop if none.
- **3B:** `mcp__apollo__apollo_emailer_campaigns_search` q_name="YDC | Usage" — get all 6 sequence IDs.
- **3C — Re-verify sequence state at enroll time (MANDATORY):** the scan snapshot is
  hours or days old and sequence state mutates between scan and "go" (reps archive and
  un-archive campaigns; automations enroll contacts). For every candidate on the approved
  list:
  1. Re-fetch the contact (`apollo_contacts_search`) and re-read `contact_campaign_statuses[]`.
  2. For any live-looking membership, fetch the campaign by ID via the REST GET in Scan
     Step 3.2 (works cross-rep) and read `archived` / `active` **as of right now**.
  3. Apply the same dead/live rules as Scan Steps 3.2–3.3:
     - Campaign is archived or inactive NOW → dead membership. Nothing to move. Enroll on
       the existing "go" and do not report them as "in a sequence."
     - A previously-clean candidate is now live in a campaign that is **not Andrew's** →
       this is the common case, since another rep's automation can grab a signup within
       the hour. Do NOT hold. Convert them to a foreign move: set
       `reclassify_from_foreign` from the fresh read and carry them through Step 4. Say so
       in the Slack reply with the full snapshot (campaign name + id, `archived`/`active`,
       contact status, owner mailbox, checked_at) so Andrew knows the move happened and
       whose sequence it came out of.
     - Now live in one of **Andrew's own** `YDC | Usage |` sequences → genuine skip, unless
       `force: true`.
  4. Update each candidate's `membership_snapshot` with the enroll-time values.

  **NEVER hold or skip a contact on the contact-side `status` alone.** A status of
  "active" inside an archived campaign is a dead membership. Confirm the campaign, then
  decide. (2026-07-17: a "go" was blocked exactly this way — the blocking campaign was
  archived at go-time, but the hold only read the contact-side status.)

#### Step 4: Move people out of their current sequence first

Runs for both `reclassify_from` (Andrew's own sequence) and `reclassify_from_foreign`
(anyone else's). Same mechanic, different reporting.

For each such user:
1. Get their Apollo contact ID.
2. `mcp__apollo__apollo_emailer_campaigns_remove_or_stop_contact_ids` against the campaign
   ID they are leaving.
3. **Verify the removal actually landed.** Re-fetch the contact and re-read
   `contact_campaign_statuses[]`. The old membership must now be gone or in a dead status
   (`removed` / `finished` / `completed`). Do not trust the call's return value alone.
4. Log the before and after state.

**If the removal fails or does not verify** (most likely on another rep's campaign, where
Andrew's API user may not have write access):
- Still enroll them in the usage sequence, with `sequence_active_in_other_campaigns: true`.
  Andrew's instruction is that they end up in his sequence; a removal we cannot execute does
  not change that.
- Set `action: "flagged_conflict"` and fill `conflict` with the campaign we could not remove
  them from.
- Report it plainly in the Slack thread: the person, the campaign, the owner, and the fact
  that they are now in **both** sequences until that rep removes them. Name the rep.

That double-send window is the one real cost of this policy. Never let it pass silently.

#### Step 5: Create SFDC contacts (for missing Contact records)

First, get a fresh SF token via the same Bash command as Scan Step 0. Then:

Query existing contacts using Bash curl (SOQL helper):
```sql
SELECT Id, Email FROM Contact WHERE Email IN ({approved_emails})
```

For users with no Contact record AND linked `Account__c`:
```bash
curl -s -X POST "${SF_INSTANCE}/services/data/v${SF_API_VERSION}/sobjects/Contact/" \
  -H "Authorization: Bearer ${SF_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"FirstName":"...","LastName":"...","Email":"...","AccountId":"...","LeadSource":"API Signup"}'
```
- Parse first/last name from email prefix

#### Step 6: Enrich LinkedIn

For users missing LinkedIn URL, call `mcp__apollo__apollo_people_match`:
- `email`, `organization_name`

Update SFDC `LinkedIn_URL__c` if found. Log "LinkedIn T2 manual" for any not found.

#### Step 7: Create Apollo contacts and enroll

For each approved user:

**7.1 — Create/update Apollo contact** via `mcp__apollo__apollo_contacts_create`:
- `first_name`, `last_name`, `email`, `organization_name`
- `linkedin_url` (from Step 6 if found)
- `label_names`: ["Usage Pipeline", "Usage Seq {A|B|C|D|E|F}"]
- `run_dedupe: true`

**7.2 — Enroll in sequence** via `mcp__apollo__apollo_emailer_campaigns_add_contact_ids`:
- `emailer_campaign_id`: correct sequence ID from Step 3B
- `send_email_from_email_account_id`: from Step 3A
- `sequence_active_in_other_campaigns`: **`true` if the candidate is `force: true`, OR had
  `reclassify_from_foreign` set, OR their Step 4 removal did not verify. Else `false`.**
  (Apollo refuses to add a contact who is active in another campaign unless this is `true`,
  and a removal can lag, so any move out of a foreign sequence sets it.)
- `sequence_no_email: false`

Treat `contacts_already_exists_in_current_campaign` as success.

#### Step 8: Generate T1 drafts

Generate personalized T1 email for each enrolled user using the variant templates
in ydc-usage-outreach (Email Copy Templates section). Print grouped by account → sequence.

#### Step 9: Mark enrolled + print summary

Create a marker file `daily-enrolled-{scan_date}.txt` in the Drive accountplans folder via `mcp__b2f41a0b-70fb-4b72-b711-0dfd9cfb9ff8__create_file` with content `enrolled: true`. This prevents the enroll watcher from re-running for this scan.

Post a reply to the Slack thread (slack_thread_ts on #my-accounts-api-users-daily) confirming:

```
✅ Enrolled {N} users — T1 scheduled in Apollo.

Moved out of another sequence: {N}
  {email} — out of "{campaign}" ({owner}) → Seq {X}   [removal verified]
  {email} — out of "{campaign}" ({owner}) → Seq {X}   [REMOVAL FAILED, in both until {owner} removes them]
```

Omit the "Moved" block when nobody was moved. Always name the owning rep on a foreign move.
A failed removal is never omitted or softened.

Do this once per open scan, in that scan's own thread.

Then print:

```
═══════════════════════════════════════════════════════════════
YDC USAGE OUTREACH DAILY COMPLETE  |  {date}
═══════════════════════════════════════════════════════════════

ENROLLED:
  Seq A:  {N}   Seq B:  {N}   Seq C:  {N}
  Seq D:  {N}   Seq E:  {N}   Seq F:  {N}
  Total:  {N}

RECLASSIFIED:  {N}
SFDC contacts created:  {N}
LinkedIn enriched:  {N}  |  Missing (T2 manual):  {N}
```

---

## Scheduling

The scan is scheduled to run automatically Monday–Friday at 9am via Claude's scheduled
task system. To set it up the first time, use:

`mcp__scheduled-tasks__create_scheduled_task` with:
- schedule: `0 7 * * 1-5`
- command: `/ydc-usage-outreach-daily`

To view or modify the schedule: `mcp__scheduled-tasks__list_scheduled_tasks`

---

## State Files (Google Drive — accountplans folder)

| File | Purpose |
|------|---------|
| `daily-pending-{YYYY-MM-DD}.json` | Classified candidates + Slack thread TS for the day |
| `daily-enrolled-{YYYY-MM-DD}.txt` | Marker created after enrollment — prevents double-enroll |

A pending file with no matching enrolled marker is an **open scan**, and open scans stack.
Enroll mode and the watcher both work the full open list oldest-first, not just the newest
file. Query them with a `createdTime` bound; a bare `title contains` search is not ordered by
creation time.

---

## Notes

- **Monday:** Always uses 3-day lookback to capture Saturday + Sunday signups.
- **Missed scan:** If `last_run` gap > 7 days, run the full `ydc-usage-outreach` skill instead.
- **Slack flags:** Users with active Slack threads in their domain are flagged. Review the
  thread before enrolling — there may be an ongoing deal conversation.
- **No candidates:** If the scan finds nothing new, it posts a short "all clear" to Slack
  and stops — no enroll mode needed.
- **Sequences must exist:** All 6 `YDC | Usage |` V2 sequences must be present in Apollo.
  If any are missing, run `ydc-usage-outreach` Step 6 to build them first.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-01 (2) | **Foreign-sequence policy reversed: move, do not hold.** Anyone live in a sequence that is not Andrew's is now removed from it and enrolled in the usage sequence on a plain "go". `flagged_conflict` is retired as a default and now means only "the move failed mechanically". New `reclassify_from_foreign` field; Step 4 removes from either sequence type and must VERIFY the removal by re-reading the contact; a failed removal still enrolls (with `sequence_active_in_other_campaigns: true`) and is reported by name in Slack. New "go, leave N" opt-out. Slack section renamed from "IN ANOTHER ACTIVE SEQUENCE — held" to "MOVING OUT OF ANOTHER SEQUENCE (included in go)". | Andrew's call. Joe Hindle's "product user journey" campaign took alex.w@example.com 43 minutes after the 08-28 review post said he was clean, so the best signup on the book was getting another rep's cold email while Andrew's "go" sat held. Andrew: "For anyone in any sequence that isn't mine, take them out of the sequence they're in and put them in my sequence." Supersedes the cross-rep hold added 2026-07-17. |
| 2026-09-01 | **ENROLL Step 1 now processes EVERY open pending scan, oldest first**, instead of only the most recently created file. Open = `enrolled` false AND no `daily-enrolled-{scan_date}.txt` marker. Added a `createdTime > {8 days ago}` bound to the Drive query. Steps 2-9 run once per open scan against that scan's own thread. | Andrew replied "Go" in the 08-26, 08-27 and 08-28 threads on 09-01. The newest pending file was 09-01, whose thread had no reply, so both the enroll mode and the watcher read that file, found nothing, and exited. Three approvals sat unactioned and the last enrollment marker was 08-25. Andrew replies in whichever thread he is reading, so newest-file-only can never work. |
| 2026-07-17 (2) | Never judge a membership from contact-side `status` alone: resolve every campaign (direct REST `GET /emailer_campaigns/{id}` works cross-rep) and read its `archived`/`active` flags. Added mandatory enroll-time re-verification (ENROLL Step 3C) — state mutates between scan and "go". Added `membership_snapshot` audit field recorded at every decision. | Ludovic Gasc's "go" was blocked: his only membership showed contact-side status "active", but the campaign itself was ARCHIVED at go-time. The hold never fetched the campaign. Later the other rep re-ran the campaign, so a fresh read showed active — proving decisions and disputes need evidence snapshotted at decision time. |
| 2026-07-17 | Step 3 now classifies membership by LIVE vs archived/finished (reads `contact_campaign_statuses[]` + active usage campaign IDs) instead of name-only. Archived/finished memberships are ignored so those users stay candidates. Added `flagged_conflict` for live cross-rep/non-usage memberships (held on plain "go") plus a "go anyway" / "go, force" override that force-enrolls with `sequence_active_in_other_campaigns: true`. New Slack section + `conflict`/`usage_membership` schema fields; numbering spans enroll + flagged lists. | New user (Ludovic Gasc) was in an archived sequence, got silently dropped at Step 3 (name-only match), never appeared in the post, so "go" couldn't enroll him. Andrew only cares about active sequences; a "go" must enroll, period. |
| 2026-06-22 | Step 4 rewritten to check interaction across ALL channels (SFDC EmailMessage, all SFDC Tasks incl. LinkedIn, SFDC Events, Google Calendar, Slack threads/DMs by name+email, Gmail). Classification now reaches cold buckets only when every channel is empty. | Contacts with calendar meetings, Slack DMs, or SFDC LinkedIn tasks (e.g. ethan@reflection.ai) were tagged "never contacted" and routed to cold sequences — calendar was never queried, Slack was domain-only across 4 channels, and the Task filter excluded LinkedIn/upcoming activity |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added Step 0 readiness check (SF token, Slack, Apollo) with failure Slack alert | Scheduled runs were silently failing when SF token expired; Slack alert ensures missed scans are caught |
| (prior) | Added Salesforce SOQL helper (Bash curl) instead of MCP tool for SOQL | SF MCP tool was unavailable at scheduled run time; Bash curl with `sf org display` token is more reliable |
| (prior) | Added double-enrollment guard (pending file + enrolled marker file) | Watcher was re-running enrollment if Andrew's Slack reply was late; double-guard prevents duplicate enrollments |
| (prior) | Added Monday 3-day lookback | Monday 1-day lookback was missing all Saturday + Sunday signups |
| (prior) | Added sequential number system for candidates in Slack post | Andrew was typing full email addresses to exclude contacts; numbers ("go, skip 2 3") are faster |
| (prior) | Added "all clear" message when no candidates found | Scheduler was posting nothing on quiet days; no message made it impossible to verify the scan ran |
