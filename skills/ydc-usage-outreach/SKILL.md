---
name: ydc-usage-outreach
description: >-
  Product-led outbound skill. Scans all Salesforce accounts owned by Andrew for
  API users (Product_User__c), classifies each person into one of six sequences
  based on usage behavior, account type, and real conversation history, shows a
  review list grouped by account, then — after approval — creates SFDC contacts,
  enriches LinkedIn, reclassifies anyone in the wrong Apollo sequence, and enrolls
  everyone in the correct usage sequence. Sequences are always left INACTIVE.
  Use when user says "usage outreach", "run usage outreach", "outreach for API users",
  "enroll product users", "build usage sequences", "outreach to signups",
  "who signed up that we haven't talked to", or "product-led outbound".
---

# YDC: Usage Outreach (Product-Led Outbound)

## Rule precedence (added 2026-08-27)

CLAUDE.md wins on voice, copy, and cadence. This skill wins on API mechanics, step types,
personas, and process gates. On conflict, follow the newer date and say in your output which
rule you followed and which you set aside. Never silently pick one.


## Purpose

Find every person using or who has signed up for the You.com API across all owned accounts,
determine whether we've had a real conversation with them, classify them into the right
outreach sequence, and enroll them in Apollo. This is not cold outreach — every contact
has a product signal. Sequences are left INACTIVE; Andrew reviews T1 drafts and sends manually.

---

## CRITICAL GUARDRAILS

- Sequences always left **INACTIVE**. Never auto-activate.
- **"Interaction" means ANY contact with anyone at You.com, across ANY channel:** an inbound
  email reply (SFDC or Gmail), a completed OR upcoming meeting (SFDC Task/Event or a Google
  Calendar invite), any logged SFDC activity including LinkedIn tasks, or a Slack thread/DM
  back-and-forth. A person with an interaction on any channel is NOT "never contacted" and must
  never land in a cold sequence (A/B/C/D/F).
- **"Real conversation" is the two-way subset:** an inbound reply email, a completed meeting/call,
  or a Slack back-and-forth. Outbound sequences, SDR blasts, and marketing emails do NOT count as
  either. Them signing up because of an email we sent doesn't count.
- If someone is in a current Apollo outbound sequence AND qualifies for a usage sequence,
  **remove them from the outbound sequence and enroll in the correct usage sequence.**

---

## The 6 Sequences

| Seq | Name | Who |
|-----|------|-----|
| A | New Signup — No Calls | Signed up last 120 days, 0 API calls, account NOT Customer/Partner |
| B | Active Tester | Calls in last 90 days, account NOT Customer/Partner, no prior real conversation |
| C | Stalled Tester | Had calls, last call 30–120 days ago, account NOT Customer/Partner, no prior real conversation |
| D | Customer Account — New Signup | Account Type = Customer or Partner, individual signed up recently, no prior real conversation |
| E | Re-engagement | Had a real two-way conversation before, has usage signal now, no real contact in 60+ days |
| F | Customer Account — Existing User | Account Type = Customer or Partner, has API calls, never had a real conversation |

**Classification priority (top wins — cold buckets A/B/C/D/F are only reachable when `has_interaction` is false):**
1. If `has_interaction` AND last interaction ≤ 90 days ago → **awaiting_review** (active relationship — shown in review list but NOT enrolled without explicit opt-in)
2. If `has_interaction` AND last interaction > 90 days ago → **E** (re-engagement)
3. No interaction on any channel, account Type = Customer or Partner:
   - New signup (few/no calls, signed up recently) → **D**
   - Has existing API calls → **F**
4. No interaction on any channel, account NOT Customer/Partner:
   - 0 calls, signed up last 120 days → **A**
   - Calls in last 90 days → **B**
   - Had calls, last call 30–120 days ago → **C**
5. No interaction and no usage signal (signed up > 120 days ago, no recent calls) → **skip**

**`awaiting_review` means:** ANY interaction with anyone at You.com in the last 90 days, across
any channel (inbound email reply, completed OR upcoming meeting, Google Calendar invite, logged
SFDC activity incl. LinkedIn task, or Slack thread/DM). Show the channel(s) and who at You.com had
the contact (Owner.Name from Task/Event, "inbound email", or Slack handle). These appear in the
review list under a separate AWAITING YOUR REVIEW section. Andrew must explicitly confirm
("go, include email@co.com") to enroll. Default: leave alone.

---

## Procedure

### Step 1: Pull all Product_User__c records (run in parallel)

Use `mcp__Salesforce_DX__run_soql_query`. Run both queries simultaneously.

**Query 1 — All users on owned accounts (linked):**
```sql
SELECT Email__c, Domain__c, Account__c, Account__r.Name, Account__r.Type,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       API_Calls_per_User_All_Time__c, Email_Free_Provider__c
FROM Product_User__c
WHERE Account__r.OwnerId = '005Vq000009j4ezIAA'
AND Email_Free_Provider__c = false
AND (
  Signup_Date__c >= LAST_N_DAYS:120
  OR API_Calls_Last_30_Days__c > 0
  OR Last_API_Call_Date__c >= LAST_N_DAYS:90
)
ORDER BY API_Calls_Last_7_Days__c DESC NULLS LAST
LIMIT 500
```

**Query 2 — New signups last 120 days (catch any unlinked via domain):**
```sql
SELECT Email__c, Domain__c, Account__c, Account__r.Name, Account__r.Type,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       Email_Free_Provider__c
FROM Product_User__c
WHERE Signup_Date__c >= LAST_N_DAYS:120
AND Email_Free_Provider__c = false
AND Account__r.OwnerId = '005Vq000009j4ezIAA'
ORDER BY Signup_Date__c DESC
LIMIT 300
```

Deduplicate by `Email__c`. This is the **master user list**.

---

### Step 2: Check interaction history across ALL channels

Goal: detect ANY way we've interacted with each user so known contacts never get cold-emailed.
A user is "never contacted" ONLY if every channel below comes back empty. SDR sequences,
marketing emails, and outbound touches → do NOT count.

Run the cheap batched SFDC queries (2A–2C) and the single calendar pull (2D) for ALL users.
Then run the per-person deep checks (2E Slack, 2F Gmail) ONLY on the subset that still looks
untouched after 2A–2D — this bounds cost on a full-book scan (can be 100s of users).

For 2A–2C build a batch `IN` clause from all user email addresses. These are org-wide
queries — no OwnerId filter. Use `mcp__Salesforce_DX__run_soql_query`.

**2A — Inbound email replies (SFDC EmailMessage, org-wide):** strongest two-way signal.
```sql
SELECT FromAddress, MessageDate
FROM EmailMessage
WHERE Incoming = true
AND MessageDate >= LAST_N_DAYS:365
AND FromAddress IN ('email1@co.com', 'email2@co.com', ...)
```

**2B — All SFDC activity (Task, org-wide — any you.com team member):** no Type/Status filter so
LinkedIn tasks, upcoming meetings, and other logged activity all register.
```sql
SELECT WhoId, Who.Email, ActivityDate, Type, TaskSubtype, Status, Subject, Owner.Name
FROM Task
WHERE ActivityDate >= LAST_N_DAYS:365
AND Who.Email IN ('email1@co.com', 'email2@co.com', ...)
```
Interpret: completed Meeting/Call/Demo = real conversation; `[Gong In]` subject prefix = inbound
reply; LinkedIn task or any other logged/upcoming activity = interaction (pulls out of cold).

**2C — SFDC Events (calendar invites synced to CRM):**
```sql
SELECT WhoId, Who.Email, StartDateTime, Subject, Owner.Name
FROM Event
WHERE Who.Email IN ('email1@co.com', 'email2@co.com', ...)
AND StartDateTime >= LAST_N_DAYS:365
```

**2D — Google Calendar (pull ONCE, match locally):**
Call `mcp__b68eebde-98cd-48dc-be98-2d3083754ddd__list_events` over the range `startTime = now-365d`,
`endTime = now+45d`, `orderBy=startTimeDesc`, paginating on `nextPageToken`. Build a map of
external attendee email → most-recent event date, then match user emails against it locally.
A match (past or upcoming) = meeting relationship. This is a handful of paginated calls total,
NOT one per user.

**2E — Slack (per-person, only for users still untouched after 2A–2D):**
Search `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_search_public_and_private` by the user's
email local-part, last name, AND domain. Do NOT restrict to a channel list — this tool searches
ALL channels and DMs by default, and the most relevant threads usually live in per-deal channels
(e.g. `#ext-{company}-youdotcom`, `#internal-{company}`) that a fixed list would miss. Flag any
thread or DM where the prospect and a you.com person both appear. Note the channel and most recent
message date.

**2F — Gmail (per-person, only for users still untouched after 2A–2E):**
Search `mcp__1073573f-159f-4b4d-8908-67e04234c91e__search_threads` with
`query="from:{email} OR to:{email} newer_than:1y"`. A thread containing both sent and received
messages = two-way conversation. Log how many users were deep-checked.

**Result:** For each user, record:
- `has_interaction`: true if ANY channel (2A–2F) hit
- `has_real_conversation`: true if a two-way subset hit (email reply, completed meeting/call, Slack back-and-forth, Gmail two-way thread)
- `last_interaction_date`: most recent date across ALL channels
- `days_since_contact`: integer days since last_interaction_date
- `contact_channels`: list, e.g. ["calendar", "slack"]
- `who_at_youcom`: Owner.Name from Task/Event, "inbound email", or Slack handle

---

### Step 3: Check Apollo enrollment (LIVE memberships only)

**Only a LIVE sequence membership blocks enrollment. Archived and finished memberships
are ignored** — a user whose only membership is dead is a normal candidate. A plain
sequence-name match is not enough.

First, get the live usage campaign IDs once: `mcp__apollo__apollo_emailer_campaigns_search`
with `q_name="YDC | Usage"`, keeping only campaigns where `active: true` AND
`archived: false` (call this `live_usage_campaign_ids`).

For each user in the master list, call `mcp__apollo__apollo_contacts_search` with
`q_keywords="{email}"` and read `contact_campaign_statuses[]` (each element has an
`emailer_campaign_id` and a `status`).

**TRAP:** the contact-side `status` can read `"active"` while the campaign itself is
ARCHIVED — that person is getting nothing. Never classify a membership from contact-side
`status` alone; resolve the campaign. If a campaign isn't visible in
`apollo_emailer_campaigns_search` (another rep's / private), fetch it directly — works
cross-rep (verified 2026-07-17):
`curl -s "https://api.apollo.io/api/v1/emailer_campaigns/{id}" -H "X-Api-Key: $APOLLO_API_KEY"`
and read `emailer_campaign.name` / `.active` / `.archived` / `.user_id`.

**Drop dead memberships** — ignore any membership whose `status` is
`finished`/`completed`/`removed`, or whose campaign has `archived: true` or
`active: false` (fetch and confirm; don't guess). Exception: an inactive non-usage
sequence Andrew owns still gets `reclassify_from` so the contact is removed before it
ever turns back on. For every skip/reclassify/flag decision, record a
`membership_snapshot`: `{campaign_id, campaign_name, campaign_active, campaign_archived,
contact_status, owner_mailbox, checked_at}` — state mutates; the snapshot is the record
of decision time. Then, from the LIVE memberships only, note:
- `is_in_usage_sequence`: true only if actively (live status) in a `YDC | Usage |` campaign
  in `live_usage_campaign_ids`
- `is_in_other_sequence`: true only if actively in a non-usage sequence
- `conflict`: null, or `{sequence_name, campaign_id, owner_email, status}` when the live
  non-usage membership is owned by someone else (`send_email_from_email_address` ≠ Andrew's)
  or is otherwise unsafe to move — these become `action: "flagged_conflict"` (held unless forced)
- `reclassify_from`: the sequence name when the live non-usage membership is one Andrew owns
  (safe to remove + re-enroll)

Users **actively** in the correct usage sequence → skip (no action needed). Users whose only
usage membership is archived/finished → treat as not enrolled (normal candidate).

---

### Step 4: Classify each user

Apply the classification priority from the 6-sequence table above. For each user, output:
- `sequence`: A / B / C / D / E / F / awaiting_review
- `reason`: one-line reason (e.g., "Active 2.3K calls/7d, prospect account, no prior interaction")
- `action`: enroll / reclassify (remove from X, enroll in Y) / flagged_conflict (live in another sequence — held unless forced) / awaiting_review / skip
- `has_interaction`: true/false
- `last_interaction_date`: if has_interaction is true
- `days_since_contact`: integer
- `contact_channels`: list, e.g. ["calendar", "slack"]
- `who_at_youcom`: Owner.Name / "inbound email" / Slack handle (if has_interaction)
- `reclassify_from`: name of current sequence to remove them from (if reclassifying)
- `conflict`: null, or `{sequence_name, campaign_id, owner_email, status}` when `action` is `flagged_conflict`

---

### Step 5: Generate review list — PAUSE HERE

Print the review list grouped by **account first, then sequence**. Do not proceed to
enrollment until Andrew confirms.

```
═══════════════════════════════════════════════════════════════
YDC USAGE OUTREACH — REVIEW LIST  |  {today's date}
═══════════════════════════════════════════════════════════════
{N} users found across {N} accounts
{N} to enroll  ·  {N} reclassifications  ·  {N} skipped (active relationship)

───────────────────────────────────────────────────────────────
DATABRICKS  [Customer]  ·  13 users
───────────────────────────────────────────────────────────────
  → Seq D (Customer New Signup):
    ali.saberi@databricks.com        Signed up Apr 12  ·  0 calls
    priya.nair@databricks.com        Signed up Apr 10  ·  0 calls
    tom.chen@databricks.com          Signed up Apr 8   ·  142 calls/30d

  → Seq F (Customer Existing User):
    wei.zhang@databricks.com         Active 890 calls/7d  ·  never contacted
    ⚑ SLACK FLAG: #esl-api-sales active thread Apr 14 — review before enrolling

───────────────────────────────────────────────────────────────
DAGSTER LABS  [Prospect]  ·  3 users
───────────────────────────────────────────────────────────────
  → Seq B (Active Tester):
    ali@dagster.io                   2,270 calls/7d  ·  7,695/30d
    RECLASSIFY: remove from "YDC | Dagster | Seq A: Engineering Leader"

  → Seq A (New Signup, No Calls):
    ben@dagster.io                   Signed up Apr 15  ·  0 calls

───────────────────────────────────────────────────────────────
[... continue per account ...]

───────────────────────────────────────────────────────────────
⚠️  IN ANOTHER ACTIVE SEQUENCE — held; say "go, force email@co.com" to enroll anyway:
───────────────────────────────────────────────────────────────
  carlos@co.com  (Co)  [→ Seq B]  — active in "YDC | Territory | Seq C" (another rep's mailbox)

  (Not enrolled on a plain "go". Archived/finished memberships are NOT listed here — those
   users are in the normal enroll list above.)

───────────────────────────────────────────────────────────────
⚠️  AWAITING YOUR REVIEW — prior/active interaction ≤90 days, NOT auto-enrolled:
───────────────────────────────────────────────────────────────
  john.smith@acme.com  (Acme)  [Seq B]  — emailed back Apr 1 (19 days ago)
  ethan@reflection.ai  (Reflection AI)  [Seq B]  — meeting on calendar Jun 18 + Slack #api-gtm-team Jun 12
  slack.user@co.com    (Co)    [Seq D]  — Slack thread in #esl-api-sales Apr 18 (2 days ago)

  (Each line cites the channel(s) and who at You.com had the contact.)
  To enroll any of these: "go, include john.smith@acme.com"

───────────────────────────────────────────────────────────────
SKIPPED — Already ACTIVE in usage sequence (getting emails now):
  existing@co.com — active in Seq A
SKIPPED — No signal (signed up > 120 days, no recent calls):
  old.user@company.com

═══════════════════════════════════════════════════════════════
Proceed with enrollment? Remove anyone or include anyone from AWAITING REVIEW before confirming.
To exclude: remove from list above. To include a review-hold user: say "go, include email@co.com"
To enroll someone in another live sequence anyway: "go anyway" (all) or "go, force email@co.com" (one)
```

**Wait for Andrew's confirmation before continuing.**
Andrew may remove individual users or explicitly include awaiting_review users. Respect all instructions exactly.
Never enroll awaiting_review users unless Andrew names them with "include".
Never enroll `flagged_conflict` users on a plain "go" — only when Andrew says "go anyway" (all
flagged) or "go, force {email}" (that one). A forced user enrolls regardless of any membership
state; set `sequence_active_in_other_campaigns: true` for them at Step 11.2.

---

### Step 6: Check / build Apollo sequences

Run `mcp__apollo__apollo_emailer_campaigns_search` with `q_name="YDC | Usage"` to check
if all 6 sequences exist.

If all 6 exist → skip to Step 7.

If any are missing → build them via Apollo REST API using `$APOLLO_API_KEY`.

For each missing sequence, use the **Sequence JSON Template** at the bottom of this skill as the content reference, then:

1. Create sequence: `POST https://api.apollo.io/v1/emailer_campaigns` with `X-Api-Key: $APOLLO_API_KEY`, body: `{"name": "{seq_name}", "permissions": "private", "active": false}`
2. Add each step: `POST https://api.apollo.io/v1/emailer_steps` with `emailer_campaign_id`, `type` (`manual_email`, `auto_email`, `action_item`), `wait_time`, and `emailer_template` or `note`.
3. Verify steps were created (fetch sequence, confirm step count matches template).

Note: LinkedIn steps (Touch 2 / Touch 6) cannot be created via API. Usage outreach sequences use email + action_item steps only. LinkedIn outreach for usage contacts is handled separately via ydc-linkedin-queue if linkedin_url is available.

---

### Step 7: Pre-flight (run in parallel)

- **7A:** `mcp__apollo__apollo_email_accounts_index` — get sending email ID. Hard stop if none.
- **7B:** `mcp__apollo__apollo_emailer_campaigns_search` q_name="YDC | Usage" — get all 6 sequence IDs.

---

### Step 8: Create SFDC contacts (for users with no Contact record)

Run a batch check for all approved users:
```sql
SELECT Id, FirstName, LastName, Email, AccountId, LinkedIn_URL__c
FROM Contact
WHERE Email IN ('email1@co.com', 'email2@co.com', ...)
```

For users with no Contact record AND a linked Account (`Account__c` not null):
- Create Contact via Salesforce REST API:
  ```
  POST /services/data/v59.0/sobjects/Contact/
  { "FirstName": "...", "LastName": "...", "Email": "...",
    "AccountId": "...", "LeadSource": "API Signup" }
  ```
- Parse first/last name from email prefix (e.g., `ali.saberi` → Ali, Saberi)
- If no separator in prefix, use prefix as LastName, FirstName = ""

Skip SFDC contact creation for unlinked users (Account__c = null). Log as "unlinked."

---

### Step 9: Enrich LinkedIn

For all users missing a LinkedIn URL (new or existing contacts without one), call
`mcp__apollo__apollo_people_match` per user:
- `email`: their address
- `organization_name`: their company

Extract `linkedin_url` from response. If found:
- Update SFDC Contact record `LinkedIn_URL__c`
- Store for Apollo contact creation

If not found via `apollo_people_match`, try `mcp__apollo__apollo_mixed_people_api_search`
with `q_keywords="{first_name} {last_name}"`.

Log users where LinkedIn could not be found — Touch 2 (LinkedIn connect) must be
executed manually for these.

---

### Step 10: Reclassify — remove from old sequences

For any user flagged as `reclassify_from` in Step 4:
Call `mcp__apollo__apollo_emailer_campaigns_remove_or_stop_contact_ids` with:
- The current sequence ID
- The contact ID

Confirm removal before enrolling in the new sequence.

---

### Step 11: Create Apollo contacts and enroll

**Re-verify sequence state first (MANDATORY):** hours or days may have passed since
Step 3. For every approved or held user, re-read `contact_campaign_statuses[]` and
re-fetch any blocking campaign by ID (Step 3's REST GET) to check `archived`/`active`
NOW. A block whose campaign is archived/inactive now is void — enroll on the approval
already given. A previously-clean user now live in a genuinely live campaign → hold as
`flagged_conflict` and show Andrew the full snapshot; his "go anyway" / "go, force"
clears it. Update `membership_snapshot` with enroll-time values. Never hold on
contact-side `status` alone.

For each approved user:

**11.1 — Create/update Apollo contact** via `mcp__apollo__apollo_contacts_create`:
- `first_name`, `last_name`, `email`, `organization_name`
- `title` (from Apollo enrichment if available)
- `linkedin_url` (from Step 9 if found)
- `label_names`: ["Usage Pipeline", "Usage Seq {A|B|C|D|E|F}"]
- `run_dedupe: true`

**11.2 — Enroll in sequence** via `mcp__apollo__apollo_emailer_campaigns_add_contact_ids`:
- `emailer_campaign_id`: correct sequence ID from Step 7B
- `send_email_from_email_account_id`: from Step 7A
- `sequence_same_company_in_same_campaign: true`
- `sequence_active_in_other_campaigns`: **`true` for a forced (`go anyway` / `go, force`)
  contact, else `false`.** Force must set `true` or Apollo refuses to add a contact who is
  active in another campaign.
- `sequence_no_email: false`

Process sequentially. Treat `contacts_already_exists_in_current_campaign` as success.

**LinkedIn note:** If contact has no `linkedin_url`, flag as "LinkedIn T2 manual" — the
LinkedIn connect step cannot fire automatically without a profile URL.

---

### Step 12: Generate T1 draft emails

For every enrolled user, generate a personalized T1 email using the variant templates
in the **Email Copy Templates** section below.

Fill in: `{{first_name}}`, `{{company}}`, `{{calls_7d}}`, `{{calls_30d}}`,
`{{signup_date}}`, `{{days_quiet}}`, `{{account_type}}` as appropriate.

Format call counts using K/M/B abbreviation rules.

Print all drafts under "T1 DRAFTS TO REVIEW" grouped by account → sequence.
Andrew copies the relevant draft into the Apollo manual task when executing Touch 1.

---

### Step 13: Print final summary

```
═══════════════════════════════════════════════════════════════
YDC USAGE OUTREACH COMPLETE  |  Andrew Miller-McKeever  |  {date}
═══════════════════════════════════════════════════════════════

ENROLLED:
  Seq A (New Signup, No Calls):           {N}
  Seq B (Active Tester):                  {N}
  Seq C (Stalled Tester):                 {N}
  Seq D (Customer New Signup):            {N}
  Seq E (Re-engagement):                  {N}
  Seq F (Customer Existing User):         {N}
  Total enrolled:                         {N}

RECLASSIFIED (moved from other sequences): {N}

SFDC CONTACTS:
  Created:           {N}
  Already existed:   {N}
  Unlinked (skipped): {N}

LINKEDIN:
  Enriched:  {N}
  Missing:   {N} — Touch 2 manual for these

SKIPPED:
  Active relationship (<60d):  {N}
  No signal:                   {N}
  Removed by Andrew:           {N}

SLACK FLAGS:  {N} users flagged — review before Touch 2

SENDING FROM: {email}
STATUS: INACTIVE — activate sequences and execute manual T1 tasks in Apollo when ready
```

---

## Email Copy Templates

### Sequence A — New Signup, No Calls

**Touch 1 (manual_email — D1):**
```
Subject: Getting started with the API

Hi {{first_name}},

You signed up for the You.com API on {{signup_date}}. If you haven't had a
chance to make your first call yet, a few things that cut the ramp time:

The quickstart guide walks through authentication and your first query in under
10 minutes. We also have an eval harness and free credits if you want to test
at scale before committing to a plan.

Happy to walk through it live if that's easier.

Andrew
You.com
```

**Touch 3 (resources email — D6, reply to T1):**
```
Hi {{first_name}},

Dropping these in case you haven't seen them:

Quickstart guide: https://documentation.you.com/docs/quick-start
API docs: https://documentation.you.com
Eval harness: https://github.com/youcom/eval-harness

Free credits are available if you want to push volume before a budget decision.
Let me know if anything is blocking your first test.

Andrew
```

**Touch 5 (breakup — D13, reply to T1):**
```
Hi {{first_name}},

Happy to leave it here if the timing isn't right. The credits offer stands
whenever you're ready.

Andrew
```

---

### Sequence B — Active Tester

**Touch 1 (manual_email — D1):**
```
Subject: {{company}} + You.com

Hi {{first_name}},

Your team has been making {{calls_7d}} calls through the API this week. That
level of usage usually means a few things are working and a few are starting
to create friction: freshness, citation quality, or snippet depth.

If any of those have come up, happy to dig in. We also have an eval harness
and free credits if you want to stress-test at higher volume.

Worth a quick sync?

Andrew
You.com
```

**Touch 3 (resources — D6):**
```
Hi {{first_name}},

A few things useful at this stage:

API docs: https://documentation.you.com
Quickstart: https://documentation.you.com/docs/quick-start
Eval harness: https://github.com/youcom/eval-harness

Free credits available if you need to scale testing before a budget call.

Andrew
```

**Touch 5 (breakup — D13):**
```
Hi {{first_name}},

If you want to talk through the infrastructure or see how other teams are
using this at scale, open to connecting.

Andrew
```

---

### Sequence C — Stalled Tester

**Touch 1 (manual_email — D1):**
```
Subject: Still evaluating?

Hi {{first_name}},

Your team was active on the API around {{days_quiet}} days ago and then went
quiet. That usually means the eval surfaced something, a comparison is running,
or the project paused.

If something came up in testing, happy to dig into it.

Andrew
You.com
```

**Touch 3 (resources — D6):**
```
Hi {{first_name}},

In case it helps with wherever the eval stands:

API docs: https://documentation.you.com
Quickstart: https://documentation.you.com/docs/quick-start
Eval harness: https://github.com/youcom/eval-harness

Free credits available if you want to run a side-by-side or pick up where
you left off.

Andrew
```

**Touch 5 (breakup — D13):**
```
Hi {{first_name}},

Leaving it here. If the eval reopens, you know where to find me.

Andrew
```

---

### Sequence D — Customer Account, New Signup

**Touch 1 (manual_email — D1):**
```
Subject: You.com API — welcome

Hi {{first_name}},

You recently signed up for the You.com API. You may or may not know, but
{{company}} is already a customer of ours.

I'm Andrew, your point of contact here. Quick question — are you part of the
team at {{company}} already using the API, or is this something you're
exploring separately? Either way, happy to make sure you have what you need.

We also have additional credits available for customer teams who want to run
more thorough tests.

Andrew
You.com
```

**Touch 3 (resources — D6):**
```
Hi {{first_name}},

A few things that tend to be useful early on:

API docs: https://documentation.you.com
Quickstart: https://documentation.you.com/docs/quick-start
Eval harness: https://github.com/youcom/eval-harness

As a {{company}} team member, you also have access to additional credits for
testing. Let me know how I can help.

Andrew
```

**Touch 5 (breakup — D13):**
```
Hi {{first_name}},

Happy to leave it here. If you want to connect me with the right person at
{{company}} or need anything on the API side, I'm here.

Andrew
```

---

### Sequence E — Re-engagement

**Touch 1 (manual_email — D1):**
```
Subject: Checking back in

Hi {{first_name}},

We connected before but it's been a while. I noticed your team has been back
on the API recently ({{calls_7d}} calls this week) and wanted to check in.

Where do things stand? Happy to pick up where we left off or start fresh
depending on what's changed.

Andrew
You.com
```
*If calls_7d = 0 but signed up recently, replace with: "I noticed your team signed up for the API again recently."*

**Touch 3 (resources — D6):**
```
Hi {{first_name}},

In case anything has changed since we last spoke:

API docs: https://documentation.you.com
Quickstart: https://documentation.you.com/docs/quick-start
Eval harness: https://github.com/youcom/eval-harness

Free credits available if the evaluation is back on the table.

Andrew
```

**Touch 5 (breakup — D13):**
```
Hi {{first_name}},

Leaving it here. If the timing changes, you know where to find me.

Andrew
```

---

### Sequence F — Customer Account, Existing User (Never Spoken)

**Touch 1 (manual_email — D1):**
```
Subject: You.com API: your point of contact

Hi {{first_name}},

I noticed you've been using the You.com API. Since {{company}} is one of our
customers, I wanted to introduce myself. I'm Andrew, your point of contact here.

If there's anything you need, a deeper walk-through, help with a specific use
case, or resources, I'm here. We also have additional credits available for
customer teams who want to test at higher volume.

What are you building?

Andrew
You.com
```

**Touch 3 (resources — D6):**
```
Hi {{first_name}},

A few things in case they're useful:

API docs: https://documentation.you.com
Quickstart: https://documentation.you.com/docs/quick-start
Eval harness: https://github.com/youcom/eval-harness

As a {{company}} customer, you have access to additional credits for broader
testing. Let me know how I can help.

Andrew
```

**Touch 5 (breakup — D13):**
```
Hi {{first_name}},

Last note. If there's ever a question or you want to connect with someone
deeper on the technical side, happy to make that happen.

Andrew
```

---

## 6-Touch Cadence (All Sequences)

| Touch | Day | Type | Notes |
|-------|-----|------|-------|
| 1 | D1 | manual_email | New thread. Andrew reviews and sends. Personalized with usage data. |
| 2 | D3 | linkedin_connect | No pitch. Fact-to-consequence formula. Under 250 chars. |
| 3 | D6 | automatic_email | Reply to T1 thread. Resources + eval harness + free credits. |
| 4 | D9 | phone_call | 90-second check-in script. |
| 5 | D13 | automatic_email | Reply to T1 thread. Breakup email. |
| 6 | D18 | linkedin_message | Short DM. Under 300 chars. |

**LinkedIn (T2 + T6):** Only fires if `linkedin_url` is set on the Apollo contact.
Flag contacts without LinkedIn as "T2/T6 manual."

---

## Sequence JSON Template

Use the structure below as the content reference when building sequences via Apollo REST API.

```json
{
  "$schema": "Apollo Sequence Builder Data Format v1.0",
  "account": "Usage Outreach",
  "domain": "you.com",
  "generated_at": "{TODAY_ISO}",
  "sequences": [
    {
      "name": "YDC | Usage | Seq A: New Signup",
      "steps": [
        { "type": "manual_email", "email_type": "new_thread", "subject": "Getting started with the API", "body": "Hi {{first_name}},\n\nYou signed up for the You.com API recently. If you haven't had a chance to make your first call yet, a few things that cut the ramp time:\n\nThe quickstart guide walks through authentication and your first query in under 10 minutes. We also have an eval harness and free credits if you want to test at scale before committing to a plan.\n\nHappy to walk through it live if that's easier.\n\nAndrew\nYou.com" },
        { "type": "linkedin_connect", "message": "Your team signed up for the You.com API recently. Getting the first query right tends to unlock the rest of the eval, would love to connect and share what I've seen work." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nDropping these in case you haven't seen them:\n\nQuickstart guide: https://documentation.you.com/docs/quick-start\nAPI docs: https://documentation.you.com\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits are available if you want to push volume before a budget decision. Let me know if anything is blocking your first test.\n\nAndrew" },
        { "type": "phone_call", "task_note": "Hi {{first_name}}, this is Andrew from You.com. You signed up for the API recently and I wanted to quickly check in to see if you've had a chance to make your first call. Do you have 90 seconds?" },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nHappy to leave it here if the timing isn't right. The credits offer stands whenever you're ready.\n\nAndrew" },
        { "type": "linkedin_message", "message": "Hey {{first_name}}, sent a few notes over email. Happy to help you get your first test running if that's useful." }
      ]
    },
    {
      "name": "YDC | Usage | Seq B: Active Tester",
      "steps": [
        { "type": "manual_email", "email_type": "new_thread", "subject": "{{company}} + You.com", "body": "Hi {{first_name}},\n\nYour team has been active on the API this week. That level of usage usually means a few things are working and a few are starting to create friction: freshness, citation quality, or snippet depth.\n\nIf any of those have come up, happy to dig in. We also have an eval harness and free credits if you want to stress-test at higher volume.\n\nWorth a quick sync?\n\nAndrew\nYou.com" },
        { "type": "linkedin_connect", "message": "Your team has been active on the You.com API this week. At that volume, freshness and citation depth tend to become the limiting factors, would love to connect and share what I've seen." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nA few things useful at this stage:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits available if you need to scale testing before a budget call.\n\nAndrew" },
        { "type": "phone_call", "task_note": "Hi {{first_name}}, this is Andrew from You.com. I saw your team has been active on the API and wanted to check in quickly to see how testing is going. Do you have 90 seconds?" },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nIf you want to talk through the infrastructure or see how other teams are using this at scale, open to connecting.\n\nAndrew" },
        { "type": "linkedin_message", "message": "Hey {{first_name}}, sent a few notes over email. If there's a specific thing you're trying to test or a question I can answer, happy to help." }
      ]
    },
    {
      "name": "YDC | Usage | Seq C: Stalled Tester",
      "steps": [
        { "type": "manual_email", "email_type": "new_thread", "subject": "Still evaluating?", "body": "Hi {{first_name}},\n\nYour team was active on the API a few weeks ago and then went quiet. That usually means the eval surfaced something, a comparison is running, or the project paused.\n\nIf something came up in testing, happy to dig into it.\n\nAndrew\nYou.com" },
        { "type": "linkedin_connect", "message": "Your team was testing the You.com API a few weeks back and went quiet. That usually means the eval surfaced something worth discussing, would love to connect." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nIn case it helps with wherever the eval stands:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits available if you want to run a side-by-side or pick up where you left off.\n\nAndrew" },
        { "type": "phone_call", "task_note": "Hi {{first_name}}, this is Andrew from You.com. I saw your team was testing the API a few weeks back and wanted to check in quickly to see how it went. Do you have 90 seconds?" },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nLeaving it here. If the eval reopens, you know where to find me.\n\nAndrew" },
        { "type": "linkedin_message", "message": "Hey {{first_name}}, sent a few notes over email. If the eval is back on the table, happy to help." }
      ]
    },
    {
      "name": "YDC | Usage | Seq D: Customer New Signup",
      "steps": [
        { "type": "manual_email", "email_type": "new_thread", "subject": "You.com API: welcome", "body": "Hi {{first_name}},\n\nYou recently signed up for the You.com API. You may or may not know, but {{company}} is already a customer of ours.\n\nI'm Andrew, your point of contact here. Quick question: are you part of the team at {{company}} already using the API, or is this something you're exploring separately? Either way, happy to make sure you have what you need.\n\nWe also have additional credits available for customer teams who want to run more thorough tests.\n\nAndrew\nYou.com" },
        { "type": "linkedin_connect", "message": "{{company}} is already a You.com customer, and I noticed you just signed up for the API. Worth connecting to make sure you have what you need, would love to share more." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nA few things useful early on:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nAs a {{company}} team member, you also have access to additional credits for testing. Let me know how I can help.\n\nAndrew" },
        { "type": "phone_call", "task_note": "Hi {{first_name}}, this is Andrew from You.com. I noticed you recently signed up for the API. Since your company is already a customer of ours, I wanted to make sure you're connected to the right resources. Do you have 90 seconds?" },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nHappy to leave it here. If you want to connect me with the right person at {{company}} or need anything on the API side, I'm here.\n\nAndrew" },
        { "type": "linkedin_message", "message": "Hey {{first_name}}, sent a few notes over email. Happy to make sure you're connected to the right resources on our end." }
      ]
    },
    {
      "name": "YDC | Usage | Seq E: Re-engagement",
      "steps": [
        { "type": "manual_email", "email_type": "new_thread", "subject": "Checking back in", "body": "Hi {{first_name}},\n\nWe connected before but it's been a while. I noticed your team has been back on the API recently ({{calls_7d}} calls this week) and wanted to check in.\n\nWhere do things stand? Happy to pick up where we left off or start fresh depending on what's changed.\n\nAndrew\nYou.com" },
        { "type": "linkedin_connect", "message": "Your team has been back on the You.com API recently. That usually means something has changed, would love to connect and pick up where we left off." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nIn case anything has changed since we last spoke:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits available if the evaluation is back on the table.\n\nAndrew" },
        { "type": "phone_call", "task_note": "Hi {{first_name}}, this is Andrew from You.com. We spoke before — I saw your team is back on the API and wanted to check in quickly. Do you have 90 seconds?" },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nLeaving it here. If the timing changes, you know where to find me.\n\nAndrew" },
        { "type": "linkedin_message", "message": "Hey {{first_name}}, sent a few notes over email. If things have changed on your end, happy to reconnect." }
      ]
    },
    {
      "name": "YDC | Usage | Seq F: Customer Existing User",
      "steps": [
        { "type": "manual_email", "email_type": "new_thread", "subject": "You.com API: your point of contact", "body": "Hi {{first_name}},\n\nI noticed you've been using the You.com API. Since {{company}} is one of our customers, I wanted to introduce myself. I'm Andrew, your point of contact here.\n\nIf there's anything you need, a deeper walk-through, help with a specific use case, or resources, I'm here. We also have additional credits available for customer teams who want to test at higher volume.\n\nWhat are you building?\n\nAndrew\nYou.com" },
        { "type": "linkedin_connect", "message": "{{company}} has been active on the You.com API and I noticed you specifically have been building with it. Worth connecting as your point of contact, would love to help." },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nA few things in case they're useful:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nAs a {{company}} customer, you have access to additional credits for broader testing. Let me know how I can help.\n\nAndrew" },
        { "type": "phone_call", "task_note": "Hi {{first_name}}, this is Andrew from You.com. Since your company is a customer of ours, I wanted to reach out and introduce myself as your point of contact. Do you have 90 seconds?" },
        { "type": "automatic_email", "email_type": "reply", "body": "Hi {{first_name}},\n\nLast note. If there's ever a question or you want to connect with someone deeper on the technical side, happy to make that happen.\n\nAndrew" },
        { "type": "linkedin_message", "message": "Hey {{first_name}}, sent a few notes over email. If there's a specific question on the API side, happy to help." }
      ]
    }
  ]
}
```

---

## Salesforce Notes

- `Email_Free_Provider__c = false` filters personal emails (Gmail, Yahoo, etc.). Always apply.
- `Account__r.OwnerId = '005Vq000009j4ezIAA'` scopes to Andrew's accounts only.
- `Account__r.Type IN ('Customer', 'Partner')` identifies customer accounts for Seq D/F.
- `LAST_N_DAYS:120` and `LAST_N_DAYS:90` are native SOQL date literals.
- If query exceeds 500 results, add `AND API_Calls_Last_30_Days__c > 0` to trim inactive users first, then run a second pass for signups with 0 calls.

## Apollo Notes

- Six global sequences — built once, reused. Not per-company like whale pipeline sequences.
- `run_dedupe: true` prevents double-enrollment across runs.
- Apollo 500 errors on enrollment often succeed server-side. Treat `contacts_already_exists_in_current_campaign` as success.
- Sequences stay **INACTIVE**. Andrew activates when ready.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-22 | Step 2 rewritten to check interaction across ALL channels (SFDC EmailMessage, all SFDC Tasks incl. LinkedIn, SFDC Events, Google Calendar, Slack threads/DMs by name+email, Gmail). Cold buckets reachable only when every channel is empty. | Contacts with calendar meetings, Slack DMs, or SFDC LinkedIn tasks (e.g. ethan@reflection.ai) were tagged "never contacted" and routed to cold sequences — calendar was never queried, Slack was domain-only, and the Task filter excluded LinkedIn/upcoming activity |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added `awaiting_review` classification for contacts with active two-way conversation | Contacts with recent real conversations (email reply, meeting, Slack) were being auto-enrolled; now require explicit opt-in |
| (prior) | Added Seq E (Re-engagement) and Seq F (Customer Existing User) | Initial version had 4 sequences; re-engagement and customer-existing-user patterns needed distinct copy and flow |
| (prior) | Added reclassification logic: remove from whale/territory sequences before enrolling in usage sequence | Contacts in cold outbound sequences who triggered product usage signals were being enrolled in both simultaneously |
| (prior) | Added SFDC contact creation step (Step 8) | Usage contacts were being enrolled in Apollo without creating SFDC Contact records; broke CRM sync |
| (prior) | Added "real conversation" definition (reply email, completed meeting/call, Slack back-and-forth with ANYONE at you.com) | Definition was ambiguous; outbound sequences and SDR blasts were incorrectly counted as prior contact |
