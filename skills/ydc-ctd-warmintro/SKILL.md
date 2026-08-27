---
name: ydc-ctd-warmintro
description: >-
  Queries Connect The Dots (CTD) API to find warm intro paths into a target account.
  Searches ALL 1st-degree you.com direct connections to the target company, plus
  ICP-type contacts (Director+ in Engineering, Product, IT) at 2nd degree, all filtered
  to "Strong Chance to Connect" scores. When a You.com investor appears as a connector
  (Bucket A), creates an Apollo manual email task with the referral ask so Andrew can
  review and send from the Apollo task queue. When a You.com internal exec appears as
  a connector (Bucket B), posts the referral copy to #ctd-outbound-referrals-for-the-day
  so Andrew can decide whether to ping them. Also cross-references you.com's investor list
  against the target company's investor list — any shared investor firm triggers a Slack
  post to #ctd-outbound-referrals-for-the-day with a C-suite ask draft and ghost email.
  All referral copy also compiles into a persistent daily Google Doc as a log.
  Runs automatically during Step 1 research (invoked by ydc-research as a Sonnet
  subagent). Also available standalone: use when user says "find warm intros for
  [company]", "CTD check for [company]", "warm intro search", or "warm intros".
---

# YDC: Warm Intro Discovery via Connect The Dots + Investor Overlap

This skill runs automatically during Step 1 research (invoked by ydc-research as a Sonnet subagent). It is also available standalone for ad-hoc queries on any company.

When run as part of the nightly pipeline, it accumulates all referral paths across all accounts processed that night — both CTD connector paths AND shared investor overlap paths — and appends them to a single persistent Google Doc, then posts a summary link to `#ctd-outbound-referrals-for-the-day`.

## Prerequisites

- Company domain (required)
- Account plan from Step 2 (optional, improves draft email quality with business context)
- ICP prospect list from Step 3 (optional, for cross-referencing with Apollo data)

## CTD API Auth

All requests use these headers:
```
ctd-api-key: ${CTD_API_KEY}
ctd-client-id: andrew.miller-mckeever@you.com
```

See references/ctd-api.md for full endpoint documentation.

## You.com Investor List (youcom-investors.md)

Stored at: `/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/youcom-investors.md`

Format:
```
# You.com Investors
last_updated: YYYY-MM-01

## Investor Firms
- Firm Name | Known Contact (if any) | Round
```

**Monthly refresh rule:** At the start of every pipeline run, read this file and check `last_updated`. If the month is different from the current month, rebuild the list by running three You.com Research API queries (see Step 0 below), then overwrite the file. If same month, use the cached list with no API calls.

## You.com Connector Registry

Use this list to classify connectors found in CTD paths. CTD identifies these people with `company_name = "you.com"` due to their board, investor, or employment relationship.

**Investors** (qualify for referral routing — Bucket A):
CTD surfaces these dynamically. Classify a connector as an investor when their node shows `company_name = "you.com"` AND `seniority` includes "investor" OR their known role at a VC firm is confirmed below.

Known investor connectors confirmed in CTD:
- Scott Beechuk — Investor @ you.com / Partner @ Norwest (`scottbeechuk`)
- David Glaser — Series A Investor @ you.com (`davidglaser` — confirm LinkedIn ID from CTD node)
- Adam Oliner — Managing Director @ Blackstone (appears in CTD paths via you.com)

Any additional investor connectors CTD surfaces with `company_name = "you.com"` and investor seniority should be treated the same way.

**Internal Executives** (qualify for referral routing — Bucket B):
Classify as internal when `connector_type = "co-worker"` AND `company_name = "you.com"`.

Known internal exec connectors:
- Richard Socher — CEO (`richardsocher`)
- Saahil Jain — CTO (`saahiljain`)
- Bryan McCann — Co-Founder / Board Director (`bryanmccann`)
- Peter Grant — CRO (confirm LinkedIn ID from CTD node)
- Jason Egnal — CMO (confirm LinkedIn ID from CTD node)
- Alper Tekin — Executive (`alp`)
- Saurabh Sharma — CPO (`saurabhsharma` — confirm from CTD node)
- Ivy Gress — VP of Sales (`ivygress` — confirm from CTD node)
- Jing Cai Lee — VP of Finance & Operations (confirm LinkedIn ID from CTD node)

## Qualifying Targets for Referral Routing

A target qualifies to trigger referral routing when they meet ANY of these criteria:
- Seniority: Director, VP, CXO, CEO, Founder
- Title contains: "AI", "artificial intelligence", "agentic", "agent", "machine learning", "ML", "data"

If the target does not meet these criteria, skip referral routing for that path. Still surface it in the standard warm intro output.

---

## Sequence of Operations

### Step 0. Pre-flight: youcom-investors.md Monthly Refresh

Before any CTD API calls, read `/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/youcom-investors.md`.

- If the file does not exist OR `last_updated` is in a different month than today: run the three Research API queries below IN PARALLEL, parse all firm names mentioned as you.com investors, write the refreshed file, then continue.
- If `last_updated` is the same month as today: skip the API calls, use the cached file, continue.

**Research API queries to rebuild the list (run in parallel using YDC_RESEARCH_ENDPOINT from ae-config.md):**
```
Query 1: "you.com company investors funding rounds venture capital backers board members"
Query 2: "you.com series A B C D funding lead investors who invested in you.com"
Query 3: "you.com AI startup investor list Sequoia Andreessen financial backers 2023 2024 2025"
```

Parse all three responses. Extract every investor firm name and any named partners mentioned in the context of you.com investment. Write the file:

```
# You.com Investors
last_updated: {YYYY-MM-01}

## Investor Firms
- {Firm Name} | {Known Contact at firm, if named in research} | {Round if mentioned}
[one line per firm]
```

**Graceful failure:** If the Research API returns no data, keep the existing file unchanged and log a warning. Do not block the pipeline.

---

### Steps 1-4 and Step 2.5 run in parallel immediately after Step 0.

---

### Step 1. Query Company Reachability

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/company?company_domain={domain}
```

Check response:
- If 404 or no data: output "No CTD data for {Company}." and mark CTD steps complete (investor overlap still runs).
- If error code 50.11: output "CTD API error (source account issue). Contact jelena@ctd.ai." and mark CTD steps complete.
- Log `ctd_company_score_label` for context but ALWAYS proceed to Step 2 regardless of company score.

### Step 2. Find Reachable Contacts (two queries, run in parallel)

**Query A — All 1st-degree you.com direct connections (no function/seniority filter):**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/people?company_domain={domain}&degree=first&page_size=40
```

**Query B — ICP contacts at 2nd degree (function + seniority filtered):**
```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/people?company_domain={domain}&degree=second&target_seniority=VP&target_seniority=Director&target_seniority=CXO&target_seniority=CEO&target_seniority=Founder&target_function=Engineering&target_function=Product&target_function=Information+Technology&page_size=40
```

Merge both result sets. De-duplicate by LinkedIn ID. Filter the merged set to ONLY contacts where `ctd_score_label` = "Strong Chance to Connect".

Tag each contact with their degree: `1st` (from Query A) or `2nd` (from Query B). 1st-degree contacts are prioritized in output regardless of seniority or function.

If zero contacts pass the filter across both queries: note this but proceed to Step 4 anyway.

### Step 2.5. Target Company Investor Research (runs in parallel with Steps 1-4)

Use the You.com Research API to identify the target company's investors. Run these three queries SEQUENTIALLY (stop early if a match is found after any query):

```
Query 1: "{Company} investors funding rounds venture capital backers"
Query 2: "{Company} {domain} series A B C backed by who invested"
Query 3: "{Company} {domain} investor list board members financial backers"
```

After each query, parse the response for investor firm names. Cross-reference immediately against youcom-investors.md. If a match is found, note it and continue checking remaining queries for additional overlaps. If all three queries return nothing substantive, log "No investor data found for {Company} — check Crunchbase manually" and continue.

**Shared investor = a firm name that appears in BOTH the target company's investor list AND youcom-investors.md.** Fuzzy match is acceptable (e.g., "Savano" matches "Savano Capital Partners").

For each shared investor firm found, proceed to Step 3.5.

### Step 3. Enrich with Apollo Data (If Available)

If a Step 3 prospect list exists, cross-reference CTD contacts against it:
- Match by LinkedIn URL (`linkedin_id` from CTD vs LinkedIn URLs from Apollo)
- Fallback match: name + company name (fuzzy)
- If matched: note their verified email, sequence assignment, and Apollo data
- If not matched: note as "CTD only" (may need manual email lookup)

This is enrichment, not a filter. All "Strong Chance to Connect" contacts are candidates.

### Step 3.5. Person Identification at Matched Investor Firms

For each shared investor firm found in Step 2.5, attempt to identify the specific partner or contact who was involved in both investments. Run up to 3 Research API queries per firm, SEQUENTIALLY. Stop as soon as a name is found.

```
Query 1: "{Firm} partner {Company} investment deal portfolio"
Query 2: "{Firm} managing director general partner {Company} board"
Query 3: "{Firm} team portfolio {Company} investor contact"
```

If a specific person is identified: use their name in the copy.
If nothing after 3 queries: use the firm name only. Note in the copy: "Confirm specific contact with your C-suite — they'll know who at {Firm} made the connection."

Do not spend more than 3 queries per firm. Move on.

### Step 4. Get Intro Paths

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/paths?company_domain={domain}&path_relationship_strength=strong&path_relationship_strength=medium&degree=first&degree=second&page_size=40
```

Note: `path_relationship_strength` requires array syntax (repeated param). Single value returns 400.

**Critical filter:** Only keep paths where the connector-to-target relationship strength is "strong" (`path_relationship_strength_label` = "strong"). Drop medium-strength paths.

For each qualifying path, extract:
- **Connector:** name, title, company, LinkedIn ID, `connector_type`, `seniority`
- **Target:** name, title, company, LinkedIn ID, `is_target_person`
- **Relationship context:** `overlapping_message` from `edges[]`
- **Relationship type:** `relationship_type` array from `edges[]`
- **Degree:** 1st or 2nd

Match paths to the ICP contacts from Step 2. Tag each target as ICP or non-ICP but keep ALL strong paths.

### Step 4.5. Classify Connectors for Referral Routing

For every strong path found in Step 4, check the connector node against the You.com Connector Registry above.

Classify each path into one of three buckets:

**BUCKET A — Investor Referral:**
Connector `company_name = "you.com"` AND (`seniority` includes "investor" OR connector is on the known investor list).
Target must also meet the qualifying target criteria above.
→ **Output:** Apollo manual email task (Touch 1 referral ask). See Step 5c.

**BUCKET B — Internal Exec Referral:**
Connector `connector_type = "co-worker"` AND `company_name = "you.com"` (or connector is on the known internal exec list).
Target must also meet the qualifying target criteria above.
→ **Output:** Slack message to #ctd-outbound-referrals-for-the-day with the full referral copy. Andrew reviews and decides whether to ping the exec.

**BUCKET C — Standard warm intro (existing output only):**
Connector is not a You.com investor or exec. Handle via the standard ghost email workflow in Steps 5-6.

Paths can only be in one bucket. If a path qualifies for A or B, skip it from the standard ghost email output and handle it exclusively via its bucket's output channel.

### Step 5. Rank and Structure Standard Output (Bucket C only)

**Ranking priority:**
1. Strong path relationship strength only (medium paths already filtered out in step 4)
2. Connector is someone Andrew actually knows: co-worker at You.com, or has direct email/LinkedIn connection
3. Rich `overlapping_message` context over sparse paths with no shared history
4. Target is ICP-relevant (VP/C-suite in Eng/Product/IT ranks above non-ICP targets)
5. 1st degree over 2nd degree (tiebreaker)
6. Also in Apollo prospect list (bonus)

Show ALL strong Bucket C paths. Tag non-ICP targets clearly but still show them.

### Step 5a. Draft CTD Referral Copy (Bucket A and B) + Label for Nightly Doc

Open a clearly delimited block that the pipeline orchestrator can extract:

```
=== CTD REFERRAL PATHS FOR NIGHTLY DOC ===
Company: {company name}
Domain: {domain}
```

Close it with `=== END CTD REFERRAL PATHS ===` after all Bucket A/B copy is written.

**Bucket A paths** → draft THREE pieces of copy, then create an Apollo manual email task (Step 5c).
**Bucket B paths** → draft THREE pieces of copy, then post to Slack (Step 5d). Do NOT create Apollo tasks for Bucket B.

For each Bucket A and B path, draft THREE pieces of copy:

**1. Your referral ask — Touch 1 (Andrew → Connector, Day 1):**
```
Subject: Intro to {Target First Name} at {Company}?

Hi {Connector First Name},

Saw you have a strong connection to {Target First Name} at {Company}. {One sentence
on why the target is relevant: their title, what they're building, and why it maps
to You.com's search infrastructure. Pull from account plan if available.}

Would you be open to a quick intro? Happy to draft a note you can forward if
that makes it easier.

Thanks,
Andrew
```
Word count: 50-80 words.

**2. Your bump — Touch 3 (Andrew → Connector, Day 7, reply in same thread):**
```
Hi {Connector First Name},

Just bumping this up in case now is a better time. No pressure if the timing is off.

Thanks,
Andrew
```
Word count: 20-30 words. Nothing more.

**3. Ghost intro email (Connector → Target, written in the connector's voice):**
```
Subject: Intro to Andrew Miller-McKeever at You.com

Hi {Target First Name},

[1-2 sentences: how the connector knows the target, using overlapping_message context.]

[1-2 sentences: introduce Andrew and why there's relevant overlap with what the target
is building. Frame around the target's problem, not Andrew's pitch.]

[1 sentence: brief credibility — reference one named case study (Harvey, Windsurf,
DuckDuckGo, Salesforce, or Databricks) that's closest to the target's use case.]

[1 sentence: soft handoff — "I'll let Andrew follow up from here if you're open to it."]

Best,
{Connector First Name}
```
Word count: 80-130 words.

**Ghost Email writing rules:**
- Write in the connector's voice, not Andrew's
- No em dashes
- No AI-isms (utilize, comprehensive, enhance, delve, robust, streamline)
- No buzzwords
- Plain text only (no markdown, bold, or headers)
- Short paragraphs, 2-3 sentences max
- 5th-7th grade reading level
- Never name competitors
- One proof point max, match it to the target's use case

### Step 5b. Draft Investor Overlap Copy + Label for Nightly Doc

If one or more shared investor firms were found in Step 2.5, open a second delimited block:

```
=== INVESTOR OVERLAP PATHS FOR NIGHTLY DOC ===
Company: {company name}
Domain: {domain}
```

Close with `=== END INVESTOR OVERLAP PATHS ===` after all investor overlap copy is written.

For each shared investor firm, draft THREE pieces of copy:

**1. C-suite Slack message (Andrew sends this to the you.com exec Slack channel or DMs relevant execs):**

This is a casual internal message. Andrew will send it himself — it is NOT a ghost email. Keep it short and action-oriented.

```
Hey team — I'm targeting {Company} this week. Found that {Firm} invested in both
{Company} and us{, and {Name} appears to be their contact on both deals — confirm if you
know them}. Does anyone have a contact at {Firm}? If so, I can have a draft note ready
for you to forward in minutes.
```

If no person was identified: "Does anyone have a contact at {Firm}?" is sufficient.
Word count: 40-60 words.

**2. Ghost email (for whichever C-suite exec has the relationship, forwarded to their contact at the firm):**

```
Subject: Quick intro ask: {Company}

Hi {Name / team at {Firm}},

I have an AE at you.com targeting {Company}. They're {1-sentence description of what
they're building and why it's relevant to You.com's search infrastructure, pulled from
research}. Given that {Firm} is backing both of us, thought it might be worth a quick
intro.

Would you be open to making a connection? Happy to draft a note you can forward directly.

{C-suite exec name}
```

Write this in a neutral exec voice (not Andrew's AE voice). Word count: 60-90 words.

**3. Bump (C-suite exec → investor contact, reply in same thread, Day 7):**

```
Hey {Name}, just bumping this in case the timing works better now. No pressure at all.

{C-suite exec name}
```

Word count: 15-25 words.

**If no shared investor firms were found:** Write "No investor overlap paths for {Company}." inside the delimited block and close it. Still include the block so the orchestrator knows the check ran.

**After drafting investor overlap copy:** Post immediately to `#ctd-outbound-referrals-for-the-day` (channel ID: `C0B1ZPX4K0Q`) via `slack_send_message`. One message per company. Open every message with `<@U0A4M1BAR08>`. Include all three pieces of copy (Slack ask draft, ghost email, bump) in the message body so Andrew has everything in one place. Do not wait for Step 7 to post investor overlap — post it now.

---

### Step 5c. Create Apollo Manual Email Tasks (Bucket A only)

Apollo's tasks API only supports `action_item` and `call` types — manual email tasks are generated exclusively through sequence enrollment. For each Bucket A path, create a 1-step sequence with the referral ask as the `manual_email` step, activate it, then enroll the connector contact. This generates a Manual Email task that shows up in Apollo Tasks > Manual Emails alongside all other outbound emails Andrew reviews.

**Auth:** `$APOLLO_API_KEY` in `X-Api-Key` header. Andrew's user ID: `69c2b4822d0a4900117855af`.

**5c.1 — Find or create the connector as an Apollo contact:**
```bash
# Search first to avoid duplicates
SEARCH=$(curl -s -X POST "https://api.apollo.io/v1/contacts/search" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"q_keywords\": \"{connector_full_name}\", \"page\": 1, \"per_page\": 5}")
CONTACT_ID=$(echo "$SEARCH" | python3 -c "import sys,json; contacts=json.load(sys.stdin).get('contacts',[]); print(contacts[0]['id'] if contacts else '')")
```
If empty, create the connector:
```bash
CONTACT_ID=$(curl -s -X POST "https://api.apollo.io/v1/contacts" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"first_name\": \"{connector_first_name}\",
    \"last_name\": \"{connector_last_name}\",
    \"title\": \"{connector_title}\",
    \"organization_name\": \"{connector_company}\",
    \"linkedin_url\": \"https://www.linkedin.com/in/{connector_linkedin_id}\",
    \"label_names\": [\"CTD Warm Intro\"]
  }" | python3 -c "import sys,json; print(json.load(sys.stdin).get('contact',{}).get('id',''))")
```

**5c.2 — Create a 1-step sequence with the referral ask:**
```bash
SEQ_ID=$(curl -s -X POST "https://api.apollo.io/v1/emailer_campaigns" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"CTD Referral | {Company} | {connector_first_name} {connector_last_name}\",
    \"permissions\": \"private\",
    \"active\": false
  }" | python3 -c "import sys,json; print(json.load(sys.stdin).get('emailer_campaign',{}).get('id',''))")

# Add the manual_email step (Touch 1 referral ask).
# IMPORTANT (corrected 2026-08-27): a nested "emailer_template" on this POST is IGNORED.
# Apollo creates an EMPTY template and links it. Content requires a second call.
# The previous version of this example passed the template inline and produced sequences
# with no subject and no body.
STEP=$(curl -s -X POST "https://api.apollo.io/v1/emailer_steps" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"emailer_campaign_id\": \"$SEQ_ID\",
    \"type\": \"manual_email\",
    \"wait_time\": 0,
    \"wait_mode\": \"day\",
    \"position\": 1
  }")

# Find the auto-created template id, then fill it.
TMPL=$(curl -s "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID" \
  -H "X-Api-Key: $APOLLO_API_KEY" -H "Cache-Control: no-cache" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['emailer_touches'][0]['emailer_template_id'])")

curl -s -X PUT "https://api.apollo.io/v1/emailer_templates/$TMPL" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"subject\": \"{Touch_1_subject}\",
    \"body_html\": \"{Touch_1_body_as_HTML_paragraphs}\"
  }"

# Verify: re-read the campaign and confirm body_text is non-empty before continuing.
# A 200 on the PUT is not evidence.
```

**5c.3 — Activate the sequence (with verification and retry):**
```bash
ACTIVATE_RESP=$(curl -s -X PUT "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"active\": true}")
ACTIVE_STATUS=$(echo "$ACTIVATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('emailer_campaign',{}).get('active','ERROR'))")

if [ "$ACTIVE_STATUS" != "True" ] && [ "$ACTIVE_STATUS" != "true" ]; then
  echo "⚠️ Sequence activation failed for $SEQ_ID (got active=$ACTIVE_STATUS) — retrying once..."
  sleep 2
  ACTIVATE_RESP=$(curl -s -X PUT "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID" \
    -H "X-Api-Key: $APOLLO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"active\": true}")
  ACTIVE_STATUS=$(echo "$ACTIVATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('emailer_campaign',{}).get('active','ERROR'))")
  if [ "$ACTIVE_STATUS" != "True" ] && [ "$ACTIVE_STATUS" != "true" ]; then
    ENROLLMENT_NOTE="⚠️ ACTIVATION FAILED after retry — manual activation required in Apollo"
  else
    ENROLLMENT_NOTE="activated on retry"
  fi
else
  ENROLLMENT_NOTE="active"
fi
```

**5c.4 — Enroll the connector contact:**
```bash
ENROLL_RESP=$(curl -s -X POST "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID/add_contact_ids" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contact_ids\": [\"$CONTACT_ID\"],
    \"emailer_campaign_id\": \"$SEQ_ID\",
    \"send_email_from_email_account_id\": \"69655755f84adb0011b0d13b\"
  }")
ENROLL_STATUS=$(echo "$ENROLL_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('enrolled' if d.get('contacts') else d.get('error_messages','unknown error'))")
```

**5c.5 — Always write Apollo status to the Drive log entry (inside the current path's block in step 5a):**

Regardless of whether enrollment succeeded or was skipped (e.g. contact has no email), append this line to the path's section in the `=== CTD REFERRAL PATHS FOR NIGHTLY DOC ===` block:

```
  Apollo SEQ ID: {SEQ_ID} | Activation: {ENROLLMENT_NOTE} | Enrollment: {ENROLL_STATUS}
```

If enrollment was skipped due to missing email, write:
```
  Apollo SEQ ID: {SEQ_ID} | Activation: {ENROLLMENT_NOTE} | Enrollment: skipped — no email on file for {connector_name}. Manual outreach required.
```

This line must always be written. Never leave the SEQ ID unrecorded.

This generates a Manual Email task in Apollo Tasks > Manual Emails with the subject and body pre-filled. Andrew reviews it alongside all other outbound manual emails and sends when ready.

If sequence creation or enrollment returns an error: log it with the SEQ ID, include the copy in the nightly Google Doc as a fallback. Do not block the pipeline.

---

### Step 5d. Post Bucket B Referral Copy to Slack

For each Bucket B path (you.com internal exec as connector), post immediately to `#ctd-outbound-referrals-for-the-day` (channel ID: `C0B1ZPX4K0Q`) via `slack_send_message`. One message per path.

Format:
```
<@U0A4M1BAR08> *CTD Referral — Bucket B: Internal Exec Path*
*Account:* {Company}
*Target:* {Target Full Name} | {Title}
*Connector:* {Connector Full Name} ({Title} at you.com)
*Connection:* {one-sentence overlapping_message summary}

*Your referral ask (Touch 1 — send or forward to {Connector First Name}):*
Subject: {subject}
{full Touch 1 body}

*Bump (Day 7, reply in same thread):*
{full bump body}

*Ghost email ({Connector First Name} → {Target First Name}):*
Subject: {ghost subject}
{full ghost email}
```

Andrew reviews and decides whether to send to the exec or handle directly.

---

### Step 6. Draft Ghost Intro Emails (Bucket C only)

For each Bucket C path with a named connector, draft a ghost email written AS the connector to the target. Same writing rules as Step 5a ghost emails. Same format.

---

## Step 7. Daily Google Doc + Slack Output

This step runs ONCE after ALL accounts for the night have been processed. It compiles every CTD referral path (Bucket A/B) and every investor overlap path across all accounts into a single persistent Google Doc, then posts a summary to Slack.

**When to run:** After the final account in the nightly pipeline batch completes.
**If running standalone (single account):** Run Step 7 immediately after Step 5d.

Note: Investor overlap Slack posts (Step 5b) and Bucket B Slack posts (Step 5d) go out immediately per account — they do NOT wait for Step 7. Step 7 only handles the Google Doc log and the end-of-night summary message.

### 7a. Compile the day's content

Collect ALL delimited blocks produced during tonight's run:
- All `=== CTD REFERRAL PATHS FOR NIGHTLY DOC ===` ... `=== END CTD REFERRAL PATHS ===` blocks
- All `=== INVESTOR OVERLAP PATHS FOR NIGHTLY DOC ===` ... `=== END INVESTOR OVERLAP PATHS ===` blocks

Build the day's formatted entry as a text string with this structure:

```
================================================================
DATE: {YYYY-MM-DD}  |  ACCOUNTS: {Company1}, {Company2}, ...
Total CTD paths: {N}  |  Investor overlaps: {N}
================================================================

CTD REFERRAL PATHS
------------------

{For each account that had Bucket A or B CTD paths:}

{COMPANY NAME} ({domain})
{N} path(s)

PATH {N}: {Target Name} via {Connector Name}
  Target: {Full Name} | {Title} @ {Company}
  LinkedIn: https://www.linkedin.com/in/{linkedin_id}
  Connector: {Full Name} | {Title} @ {Firm} | Bucket {A/B}
  Connection: {overlapping_message summary}

  YOUR REFERRAL ASK — Touch 1:
  Subject: {subject}
  {full Touch 1 body}

  YOUR BUMP — Touch 3 (Day 7, reply in thread):
  {full bump body}

  GHOST EMAIL ({Connector First Name} → {Target First Name}):
  Subject: {subject}
  {full ghost email in connector's voice}

---

{next path...}

================================================================

INVESTOR OVERLAP PATHS
----------------------

{For each account that had shared investor firms:}

{COMPANY NAME} ({domain})
Shared investor(s): {Firm Name(s)}

OVERLAP: you.com + {Company} both backed by {Firm}
  Contact at firm: {Name if found / "Confirm with C-suite"}

  C-SUITE SLACK MESSAGE (Andrew sends this):
  {full Slack message draft}

  GHOST EMAIL (C-suite exec → {Firm} contact):
  Subject: {subject}
  {full ghost email}

  BUMP (Day 7, reply in thread):
  {full bump}

---

{next account...}

================================================================
END {YYYY-MM-DD}
================================================================

```

If a section (CTD or investor overlap) has nothing for tonight: write "Nothing found tonight." under that header. Still include both sections.

### 7b. Upload to Google Drive via rclone (persistent file, newest entry at top)

The referral log is a single persistent file — `CTD_Referral_Asks.txt` — stored at `gdrive:accountplans/`. Each night's run prepends today's entry to the top, so the file grows over time with the most recent run always first. Because rclone overwrites the file in place (same filename = same Drive file ID), the shareable link never changes.

```bash
# Step 1: Download the current file (if it exists)
rclone copy gdrive:accountplans/CTD_Referral_Asks.txt /tmp/ 2>/dev/null

# Step 2: Prepend today's entry to the top
python3 -c "
import os
today = '''
{full day's entry from 7a}
'''
existing = ''
path = '/tmp/CTD_Referral_Asks.txt'
if os.path.exists(path):
    with open(path, 'r') as f:
        existing = f.read()
with open(path, 'w') as f:
    f.write(today + existing)
"

# Step 3: Re-upload (overwrites the existing file in place)
rclone copy /tmp/CTD_Referral_Asks.txt gdrive:accountplans/

# Step 4: Get the shareable link (stable — same file ID every time)
rclone link gdrive:accountplans/CTD_Referral_Asks.txt
```

Use the link returned by `rclone link` in the Slack message. On first ever run the file won't exist yet — the download step silently skips, a new file is created, and `rclone link` generates the link for the first time.

### 7c. Post summary to Slack

Send ONE message to `#ctd-outbound-referrals-for-the-day` (channel ID: `C0B1ZPX4K0Q`) using `slack_send_message`.

The message is a high-level summary only — all copy lives in the doc.

**If paths were found:**
```
<@U0A4M1BAR08> *Referral Asks — {Date}*
Accounts: {Company1}, {Company2}, ...

CTD paths: {N total}
{For each account with CTD paths: • {Company}: {N} path(s) via {Connector name(s)}}

Investor overlaps: {N total}
{For each account with investor overlap: • {Company}: shared investor {Firm name(s)}}

Full copy + ghost emails: {Google Doc link}
```

**If nothing was found:**
```
<@U0A4M1BAR08> *Referral Asks — {Date}*
Accounts checked: {list}

No CTD or investor overlap paths found tonight.
```

---

## Standard Output Format (Bucket C paths — in-session output only, not in Google Doc)

```
================================================================
WARM INTRO DISCOVERY: {Company}
================================================================
CTD Company Score: {score_label}
Domain: {domain}
Total ICP Contacts Reachable: {N}
Strong Intro Paths Found: {N} ({N} routed to referral doc, {N} in standard output)

================================================================
PATH 1 (Strongest)
================================================================

TARGET:
  Name:       {Full Name}
  Title:      {Title}
  Company:    {Company}
  LinkedIn:   https://www.linkedin.com/in/{linkedin_id}
  CTD Score:  Strong Chance to Connect
  In Apollo:  {Yes (Seq A, verified email) / No}

CONNECTOR (who to ask for the intro):
  Name:       {Full Name}
  Title:      {Title} at {Company}
  LinkedIn:   https://www.linkedin.com/in/{linkedin_id}
  Relation:   {connector_type} (e.g., co-worker, investor contact)
  Degree:     {1st (Andrew knows them directly) / 2nd (reached via intermediary)}
  How connected to Andrew: {relationship_type from user->conn1 edge}

WHY THIS INTRO WORKS:
  {Full overlapping_message text from the connector->target edge,
   formatted as readable prose. Include ALL details:
   - Shared companies and overlapping tenures with exact durations
   - Mutual connection counts
   - Any other relationship signals (email connected, LinkedIn connected)

   Never truncate or summarize this field.

   If the path is 2nd degree, also include the user->connector edge context
   so Andrew understands the full chain.}

GHOST EMAIL (written as {Connector First Name}, ready to forward):
Subject: Intro to Andrew Miller-McKeever at You.com

{full ghost email in connector's voice}

================================================================
PATH 2
================================================================
[same format]

[...continue for all Bucket C strong paths...]

================================================================
SUMMARY & RECOMMENDATION
================================================================

{2-4 sentences: which path(s) to pursue first and why. Be specific.
Reference connector relationship strength, shared history, and target's ICP relevance.
If a connector appears in multiple paths, note that one intro request opens multiple doors.
Also summarize how many paths were routed to the referral doc vs. standard output.}

NEXT STEPS:
  1. Check #ctd-outbound-referrals-for-the-day for the daily referral doc link
  2. Review CTD referral asks in the doc and send Touch 1 emails to investors/execs
  3. Review investor overlap Slack messages in the doc — send to your C-suite
  4. Once a C-suite exec confirms a contact, send them the ghost email to forward
  5. Review and personalize ghost emails for standard Bucket C paths
================================================================
```

---

## Error Handling

- 404 on company: "No CTD data for {Company}." Investor overlap check still runs.
- 50.11 source account error: note the error, suggest contacting jelena@ctd.ai. Investor overlap still runs.
- 403 forbidden on CTD: API key may be revoked, alert Andrew. Investor overlap still runs.
- 500 server error on CTD: retry once, then stop gracefully. Investor overlap still runs.
- youcom-investors.md missing: rebuild it via Step 0 queries before continuing.
- Research API returns no investor data for target: log "No investor data found — check Crunchbase manually." Do not block.
- rclone upload fails: paste the full day's entry directly into the Slack message as a fallback, and note that the Drive file was not updated.
- Empty results at any step: clear message about what was found vs. what wasn't.

## Model Routing

When invoked by ydc-research (Step 2c): runs as a **Sonnet subagent**.
When run standalone (user triggers directly): runs on whatever model is active.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added Bucket A/B/C classification system | Investor connectors and internal exec connectors need different routing than standard warm paths |
| (prior) | Added investor overlap detection (Step 2.5) | Shared investors between you.com and target company are a warm intro vector not covered by CTD paths |
| (prior) | Added Apollo manual email task creation for Bucket A (Step 5c) | Apollo task queue is where Andrew reviews and sends referral asks; manual logging was unreliable |
| (prior) | Added nightly Google Doc log + Slack summary (Step 7) | Cross-account referral paths accumulate nightly; need a single persistent doc to review |
| (prior) | Added monthly refresh rule for youcom-investors.md | Investor list was going stale; cached file with monthly TTL prevents stale lookups |
| (prior) | Added `path_relationship_strength=strong` filter (Step 4) | Medium-strength paths generated too much noise; only strong paths are actionable |
| (prior) | Added User-Agent header to CTD API calls | Cloudflare was blocking raw Python requests with error 1010 |
