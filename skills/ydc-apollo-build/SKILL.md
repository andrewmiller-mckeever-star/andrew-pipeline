---
name: ydc-apollo-build
description: Uploads You.com account plan to Google Drive and builds Apollo.io sequences with contact enrollment. Builds 4-sequence 7-touch Apollo sequences by one of two paths, chosen at A.0: build-sequences.js (Playwright, when the ~/.apollo-playwright-profile session is live) or rest_build.py (Apollo REST, the apollo_rest_fallback used when that session is expired). LinkedIn connect (T2) and DM (T7) are Apollo sequence steps — no Drive queue file. Contact enrollment via Apollo REST API. Sequences ALWAYS left INACTIVE; a run is not complete until contacts are enrolled and every assertion is verified by reading Apollo. Use when user says "build apollo sequences", "enroll contacts", "upload to drive", "Step 5", "Step 6", or "apollo build for [company]".
---

# YDC: Drive Upload + Apollo Build & Enrollment (Steps 5 + 6)

## Rule precedence (added 2026-08-27)

CLAUDE.md wins on voice, copy, and cadence. This skill wins on API mechanics, step types,
and build procedure. On conflict, follow the newer date and state in the run report which
rule you followed and which you set aside. Never silently pick one.

## DEFINITION OF DONE (added 2026-08-27)

A build is complete only when all five are true, **each verified by reading Apollo**, never
by reading a local results file:

1. Four sequences exist with the canonical names.
2. Every sequence is INACTIVE (`active: false`).
3. Every sequence is owned by Andrew (both `user_id` and `object_owner_id`).
4. Touches 3 and 6 are `reply_to_thread`, each with exactly one touch and a non-empty body.
5. Every sequence has at least one enrolled contact showing `paused`.

**Phase A is not a stopping point.** Reporting "sequences built, no contacts enrolled" is a
FAILED run, not a partial one. Phase B executes in the same run. Do not hand back draft copy
in chat and call it a checkpoint: the deliverable is the object in Apollo that Andrew edits.

## CRITICAL GUARDRAILS

**Verify state, never assume it.** Any step that changes Apollo state must read that state
back before reporting success. "No error thrown" is not evidence, and the absence of a
failure signal is not a pass. This has caused three separate incidents: a reply-type dropdown
that warned and continued (producing new threads with blank subjects), a login gate that
slept 60s then printed "login confirmed" without re-checking (four sequences failed against a
login page), and a tolerated touch-delete failure that left two touches on one step so the
empty one won. Read it back or it did not happen.

Sequences are ALWAYS left INACTIVE (the sequence-level toggle stays off). Individual steps within each sequence should be ACTIVE — build-sequences.js attempts to unpause them automatically. User only needs to flip the top-level sequence toggle in Apollo when ready to launch. NEVER auto-activate sequences or send emails.

**Apollo sequences CANNOT be deleted** — not via API, not via UI. They can only be archived. Never say "delete sequence." If a broken or duplicate sequence needs to be cleaned up, archive it via: `PUT /v1/emailer_campaigns/{id}` with body `{"archived": true}`.

**Sequences MUST be owned by Andrew's user_id** — Apollo ignores `user_id` in the POST body. The API always creates sequences owned by the service account. To transfer ownership to Andrew (required for UI visibility), immediately issue a `PUT /v1/emailer_campaigns/{id}` with `{"user_id": "{APOLLO_USER_ID}"}` after every sequence creation. This PUT sets both `user_id` and `object_owner_id`. Without it, the sequence appears invisible in Andrew's Apollo UI under "Owned by: Current User". See Step A.1b.

## Step 5: Google Drive Upload

Run as Sonnet subagent. Commands:

```bash
RCLONE=/opt/homebrew/bin/rclone
BASE="Account Plans, Lists & Personalized Sequences"
COMPANY="{CompanyName}"
SOURCE="/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline"

$RCLONE mkdir "gdrive:$BASE/$COMPANY"
$RCLONE copy "$SOURCE/${COMPANY}_Account_Plan.docx" "gdrive:$BASE/$COMPANY/"
$RCLONE tree "gdrive:$BASE/"
```

If rclone binary missing: install from https://downloads.rclone.org/rclone-current-osx-arm64.zip
If authentication fails: run `$RCLONE config create gdrive drive scope drive`

---

## Step 6: Apollo Sequence Build (API-based, fully cloud-native)

### Sequence Structure (7 touches)

| Touch | Day | Type | Notes |
|-------|-----|------|-------|
| T1 | Day 1  | automatic_email (new_thread) | Unique subject per sequence |
| T2 | Day 2  | linkedin_connect             | message <250 chars |
| T3 | Day 5  | automatic_email (reply)      | New proof point |
| T4 | Day 8  | phone_call                   | Call script in task_note |
| T5 | Day 11 | action_item                  | View profile, engage post, note for T7 |
| T6 | Day 14 | automatic_email (reply)      | Breakup, third angle |
| T7 | Day 17 | linkedin_message             | message <300 chars, no pitch, no CTA |

**Cadence is a target, not enforced by the builders (clarified 2026-08-27).** Neither
build-sequences.js nor the REST path reads a `day` field from the content JSON.
build-sequences.js sets no `wait_time` at all, so Apollo's defaults apply. `rest_build.py`
sets `0,1,3,3,3,3,3` with `wait_mode: "day"`, which reproduces days 1/2/5/8/11/14/17. If the
day column above is ever changed, change the wait values too, or the table is fiction.
CLAUDE.md's table lists T2 on Day 3 and T5 on Day 10; that difference is unresolved, and the
wait values above are what actually ships. Andrew adjusts intervals in the Apollo UI.

### Naming Convention
```
YDC | {Company} | Seq A: Engineering Leader
YDC | {Company} | Seq B: Executive Sponsor
YDC | {Company} | Seq C: Product Leader
YDC | {Company} | Seq D: AI/ML Leader
```

### Contact Label Convention
- "Whale Pipeline" (global tracking)
- "{Company} - Seq {1|2}" (sequence assignment)
- "Warm Intro" (only if flagged from CTD research)

---

### Phase A: Create Sequences

Write outreach copy to `{company}-4seq-content.json` in the builder directory (4 sequences ×
7 steps; schema in ydc-outreach). Then pick a build path — there are two, and REST is not a
last resort. Liftoff, Sap Concur and ShiftUp were all built over REST.

#### A.0 — Choose the path FIRST (added 2026-08-27)

Probe the Playwright profile's Apollo session before running anything:

```bash
cd "/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/apollo-sequence-builder"
# cookie mtime is a fast proxy; a session older than ~2 weeks is usually dead
stat -f "%Sm" ~/.apollo-playwright-profile/Default/Cookies
```

- Session live → **A.1 (Playwright)**.
- Session dead, missing, or unknown → **A.2 (REST)**. Record
  `build_method: apollo_rest_fallback` in the progress file.

**Never block the run waiting for a human login.** The old flow slept 60s for a manual login
and then proceeded regardless; Andrew may be away and the run dies silently. If Playwright
reports "Not logged into Apollo," stop that path and switch to A.2 in the same run.
`node save-apollo-session.js` re-establishes the profile, but that is a separate one-time
task for Andrew, not a prerequisite for shipping today's sequences.

#### A.1 — Playwright path

```bash
cd "/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/apollo-sequence-builder" && HEADED=true node build-sequences.js {company}-4seq-content.json
```

Sets step content and reply threading through the UI. Writes
`{company}-4seq-content_results.json`. Note that build-sequences.js does **not** set
`wait_time`, so Apollo's default intervals apply (see the cadence note below).

#### A.2 — REST path (`apollo_rest_fallback`)

Run `rest_build.py` in the builder directory:

```bash
python3 rest_build.py {company}-4seq-content.json           # all four
python3 rest_build.py {company}-4seq-content.json "Seq A"   # one sequence
```

It performs the call sequence below and self-verifies. If writing this by hand, the exact
mechanics matter, because several documented-looking shortcuts silently do nothing:

```
Per sequence:
1. POST /v1/emailer_campaigns   {name, permissions:"private", active:false}
2. PUT  /v1/emailer_campaigns/{id}  {user_id: "{APOLLO_USER_ID}"}   # ownership
3. POST /v1/emailer_steps  x7  {emailer_campaign_id, type, wait_time,
                                wait_mode:"day", position}
                                # call / action_item: pass "note"
                                # a nested emailer_template here is IGNORED
4. Fill the auto-created template on each email / LinkedIn step:
   PUT /v1/emailer_templates/{template_id}  {subject, body_html}
5. REPLY steps (touch 3 and 6) only:
   POST   /v1/emailer_touches  {emailer_step_id, type:"reply_to_thread"}
   DELETE /v1/emailer_touches/{auto_new_thread_touch_id}
   re-read and confirm EXACTLY ONE touch remains on that step, then
   PUT /v1/emailer_templates/{new_template_id}  {subject:"", body_html}

Step types:  auto_email | linkedin_step_connect | call | action_item |
             linkedin_step_message
Waits that reproduce the canonical cadence:  0,1,3,3,3,3,3 (wait_mode "day")
```

**Known-broken and silently-ignored (verified 2026-08-26):**

| Thing | Behaviour |
|---|---|
| Nested `emailer_template` on step POST | Ignored. Creates an EMPTY template. Content needs the PUT in step 4. |
| `PUT /v1/emailer_touches/{id}` | Broken: returns `undefined method '[]' for nil`. Unusable for any field. |
| `type_of_email`, `touch_type`, nested `emailer_touch` on step POST | All silently ignored. Reply steps need the POST + DELETE in step 5. |
| `DELETE /v1/emailer_touches/{id}` | Works, but MUST be verified by re-reading. A swallowed failure leaves two touches and the empty `new_thread` one wins, which reproduces the blank-subject bug. |

#### A.3 — Verify against Apollo, not against the results file

The results JSON is a log, never evidence. It is absent when a run dies early, and its
`inactive_confirmed` can disagree with Apollo. For each sequence, `GET
/v1/emailer_campaigns/{id}` and assert:

- `active == false`
- `user_id == "{APOLLO_USER_ID}"`
- `num_steps == 7`
- exactly one touch per email/LinkedIn step
- `reply_to_thread` on positions 3 and 6, `new_thread` on 1, 2 and 7
- non-empty `body_text` on every template, and a subject on position 1 only

Print the assertion table in the run report. **Any failure blocks Phase B.** Do not enroll
contacts into a sequence that has not passed this check.

Context for why this matters: as of 2026-08-26, 36 of the 37 sequences built after the
10 June inactive-gate fix read `active: true` from Apollo. The results file said otherwise.

---

### Phase B: Contact Creation & Enrollment

Run pre-flight checks in parallel:
- **B.0A:** `apollo_email_accounts_index` — get sending email account ID. Hard stop if none.
- **B.0B:** `apollo_emailer_campaigns_search` q_name="YDC | {Company}" — confirm sequence IDs
- **B.0C:** `apollo_contacts_search` q_keywords="{Company}" — check for existing contacts/account

**HARD RULE: Phase B must always execute. There is no "deferred" path.** If bulk_match returns zero verified emails, still create all contacts found and enroll with `sequence_no_email: true`. Contacts without email receive T2 (LinkedIn connect), T4 (call), T5 (action item), and T7 (LinkedIn DM) — 4 of 7 touches. Never write `enrollment_status: "deferred"` in progress notes.

**This rule is about more than missing emails (clarified 2026-08-27).** It also means: do not
finish a run after Phase A. A build with four sequences and zero enrolled contacts fails the
Definition of Done at the top of this skill.

**Credits (added 2026-08-27).** `people/bulk_match` and any email/phone reveal consume Apollo
credits. Prefer the connector tools over raw REST for these calls so the credit block is
returned and can be surfaced. If using raw REST, read the balance before and after via
`POST /v1/users/api_profile` with `{"include_credit_usage": true}` and report both numbers to
Andrew unprompted, along with what was revealed.

**Before enrolling anyone, check their existing memberships.** Pull the contact's
`contact_campaign_statuses` and look for a live membership in another sequence, including
another rep's. A status of `finished` or `unsubscribed` is safe to enroll over; `active` or
`paused` in a live campaign is a conflict — hold and flag it rather than double-enrolling.

Then:
- **B.1:** `apollo_accounts_create` (skip if account exists from B.0C)
- **B.2:** `apollo_contacts_create` for ALL Director+ prospects found — email or not
  - label_names: ["Whale Pipeline", "{Company} - Seq A/B/C/D" (match their assigned sequence)]
  - Add "Warm Intro" if contact flagged from CTD research
  - run_dedupe: true
- **B.3:** Enroll via REST API (MCP enrollment won't work if sequences were created under the service account user). Always include `emailer_campaign_id` in the request body as well as the URL — the endpoint requires it in both places or returns "Please specify a emailer_campaign_id":
  ```bash
  curl -s -X POST "https://api.apollo.io/v1/emailer_campaigns/$SEQ_ID/add_contact_ids" \
    -H "X-Api-Key: $APOLLO_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"emailer_campaign_id\": \"$SEQ_ID\",
      \"contact_ids\": [\"contact_id_1\", \"contact_id_2\"],
      \"send_email_from_email_account_id\": \"{APOLLO_EMAIL_ACCOUNT_ID}\",
      \"sequence_active_in_other_campaigns\": true,
      \"sequence_finished_in_other_campaigns\": true,
      \"sequence_same_company_in_same_campaign\": true,
      \"sequence_no_email\": true
    }"
  ```
  - **SEQUENCES REMAIN INACTIVE** — sequence toggle off, individual steps active (build-sequences.js handles step activation)
  - `send_email_from_email_account_id`: Andrew's email account = `{APOLLO_EMAIL_ACCOUNT_ID}`
  - `sequence_no_email: true` — Apollo auto-skips email steps for contacts missing an email; all other touches still fire
  - Verify enrollment by reading Apollo: `GET /v1/emailer_campaigns/{id}` and confirm
    `contact_statuses.paused` matches the number enrolled, `active` is 0, and the sequence is
    still `active: false`. Report the per-sequence counts. An enrollment response that came
    back 200 is not evidence on its own.

See references/phase-b-api.md for full API call details and error handling.

LinkedIn connect (T2) and DM (T7) are already in the sequence — no Drive queue file is needed. ydc-linkedin-queue does not apply to sequences built with build-sequences.js.

---

### Step 6 Completion Report

```
APOLLO BUILD SUMMARY: {Company}

SEQUENCES CREATED (INACTIVE):
  [x] YDC | {Company} | Seq A: Engineering Leader  (7 steps)
  [x] YDC | {Company} | Seq B: Executive Sponsor   (7 steps)
  [x] YDC | {Company} | Seq C: Product Leader      (7 steps)
  [x] YDC | {Company} | Seq D: AI/ML Leader        (7 steps)

CONTACTS: {N} imported | {N} skipped (no email) | {N} dupes

ENROLLMENT:
  Seq A: {N} contacts | Seq B: {N} contacts | Seq C: {N} contacts | Seq D: {N} contacts
  Total: {N}/{N} enrolled

SENDING FROM: {email}
STATUS: INACTIVE (sequence toggle off, individual steps active) — Andrew only needs to flip the sequence toggle after reviewing Touch 1

NEXT STEPS:
  1. Apollo > Sequences — review Touch 1 copy per sequence, activate when ready
  2. LinkedIn connect (T2) and DM (T7) fire automatically from the sequence
  3. Touches 3 and 6 auto-fire after Touch 1 is sent
```

---

## Error Handling

| Scenario | Action |
|----------|--------|
| Sequence creation returns no ID | Retry once, hard stop and report |
| Steps < 4 after Phase A | Hard stop — do not enroll contacts |
| "Not logged into Apollo" from build-sequences.js | Do NOT wait for a manual login. Abandon A.1 and build via A.2 (REST) in the same run. Flag the stale profile separately. |
| Email step body empty after a REST build | The nested `emailer_template` was ignored. Fill it with `PUT /v1/emailer_templates/{id}`. |
| Two touches on one step | The `new_thread` touch was not deleted. Delete it and re-read; the empty one wins otherwise. |
| Sequence reads `active: true` after build | Do not enroll. Deactivate, re-verify from Apollo, and report. This is the failure that caused an unreviewed cold email to a CEO on 2026-05-29. |
| No email account linked | Hard stop — link email in Apollo Settings > Email Accounts |
| Duplicate contact | run_dedupe: true handles it — use existing contact ID |
| Contact without email | Still create and enroll with `sequence_no_email: true` — email steps auto-skipped, LinkedIn/call/action touches still fire |
| Enrollment 500 error | Retry once sequentially — Apollo sometimes processes but returns 500 |
| LinkedIn URL missing | Set connect_status/dm_status to "skipped_no_url" |

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-08-27 | Added A.0 path-selection gate and documented the REST build path (A.2) with full call sequence | Playwright profile expires routinely; the skill only covered a *missing* profile, so a dead session dead-ended the run. REST already built Liftoff, Sap Concur and ShiftUp but was recorded nowhere except a progress-file field |
| 2026-08-27 | Documented the ignored/broken Apollo endpoints (nested emailer_template, PUT emailer_touches, type_of_email) | Cost ~10 probe calls to rediscover; the ydc-ctd-warmintro example showed the nested-template pattern as though it worked |
| 2026-08-27 | Added Definition of Done; clarified the Phase B hard rule covers stopping after Phase A | A run shipped four sequences with zero enrolled contacts and was reported as a clean checkpoint |
| 2026-08-27 | Verification now reads Apollo, not `_results.json` (A.3) | Results file is absent when a run dies early, and `inactive_confirmed` disagreed with Apollo on 36 of 37 sequences |
| 2026-08-27 | Added "verify state, never assume it" guardrail | Same silent-failure shape caused three separate bugs: reply dropdown, login gate, touch delete |
| 2026-08-27 | Added credit-surfacing rule and pre-enrollment membership check | bulk_match spend was never reported; cross-rep double-enrollment risk was undocumented here |
| 2026-08-27 | Clarified that cadence days are a target and not set by either builder | The day table read as enforced; no code reads it |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added mandatory ownership transfer (PUT user_id) after every sequence creation | Apollo API creates sequences under service account; invisible in Andrew's UI without transfer |
| (prior) | Added `emailer_campaign_id` to enrollment request body (not just URL) | Apollo returns "Please specify a emailer_campaign_id" if body is missing it |
| (prior) | Sequences always left INACTIVE; individual steps activated by build-sequences.js | Bug on 2026-05-29: sequence left ACTIVE caused 1 unreviewed cold email to a CEO |
| (prior) | Switched from Apollo REST API sequence creation to build-sequences.js (Playwright) | API-based sequence creation couldn't set all step types; Playwright covers the full UI flow |
| (prior) | LinkedIn connect (T2) and DM (T7) moved into Apollo sequence steps | Eliminates Drive queue file dependency; build-sequences.js populates them inline |
