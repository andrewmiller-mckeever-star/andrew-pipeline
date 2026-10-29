---
name: state-of-the-union
description: Builds and maintains an AE's weekly State of the Union page for the 1:1 with their manager, a Plan of Attack page per account, a customer-shareable Joint Execution Plan for late-stage deals, an account index sheet, and a Pipeline Cleanup Review that proposes Salesforce fixes for approval. All pages are filled from Salesforce, Gmail, Slack, Calendar and meeting notes. Use when the user says "state of the union", "update my state of the union", "prep for my 1:1", "plan of attack for [account]", "joint close plan for [account]", "refresh the account plans", or "pipeline cleanup".
---

# State of the Union, Plans of Attack, JEPs and Pipeline Cleanup

This is the public, de-identified version of a working skill. Fill in the config block once, then
everything below runs as written. Example output built from fake data is in `../../pages/`.

## Config (fill in once)

| Key | Example | Used for |
|---|---|---|
| `AE_NAME` / `AE_EMAIL` | Sam Taylor / sam@example.com | Page headers, JEP footer |
| `MANAGER_NAME` | Morgan Chen | "Sam · Morgan · weekly 1:1" |
| `SFDC_OWNER_ID` | 005XXXXXXXXXXXXXXX | Every SOQL owner filter |
| `SLACK_USER_ID` | U0XXXXXXXXX | Slack `from:` filters |
| `SELLER` | Acme Search | JEP header and contact block |
| `DRIVE_FOLDER` | rclone remote path | Where JEP docs and the index sheet go |

Never publish another person's page URL as yours. If you copy a colleague's layout, keep their
CSS out of any public repo (this repo ships its own styles in `styles/`).

## Files

| File | What it does |
|---|---|
| `builders/build_sotu.py` | `data/sotu-data.json` to `pages/state-of-the-union.html` |
| `builders/build_plan.py` | `data/plans/<slug>.json` to a Plan of Attack page |
| `builders/build_jep.py` | `data/plans/<slug>-jep.json` to a Joint Execution Plan (upload as a Google Doc) |
| `builders/build_living_plan.py` | `data/living/<slug>.json` to the 16-section living account plan |
| `builders/build_review.py` | `data/sfdc-review.json` to the Pipeline Cleanup Review page |
| `builders/tools/extract_agent.py` | Pulls a research agent's final JSON out of its transcript |
| `builders/tools/assemble.py` | Merges research JSON + the open-opps SOQL result into `sotu-data.json` |
| `builders/tools/qa_build.sh <slug>` | Fails loudly on em dashes or semicolons, then renders the plan and JEP |
| `builders/tools/save_url.py` | Records a published link in `data/manifest.json` |
| `builders/tools/make_index.py` | Writes the account index CSV (account, stage, last update, next step, links) |
| `builders/tools/make_review.py` | Research facts + live opp fields to `sfdc-review.json` (proposed field changes) |
| `builders/tools/apply_review.py` | Writes approved changes to Salesforce through the `sf` CLI |
| `references/agent-briefs.md` | The research agent briefs for the State of the Union |
| `references/plan-brief.md` | The one brief every Plan of Attack agent follows |

`data/manifest.json` holds every published URL: `{"sotu": "...", "plans": {"Account": "..."}, "jeps": {...}, "index_sheet": "..."}`.
Read it before every publish and update in place, so links never change.

---

## Part 1: State of the Union (weekly)

**Layout.** A masthead with five KPI tiles: pipeline and weighted pipeline, open opps by band,
close rate (won vs all lost, including deals that died in Discovery), year target and quota split. Below that come key
account cards, "Open with these three", band filters, then a board of deals grouped by quarter and
month. Renewals sit behind their own filter.

**Bands.**
- **moving:** furthest along, live pricing, recent contact.
- **watch:** real movement, but early, small or blocked.
- **quiet:** no contact in 45+ days, or stalled with no path. The builder forces quiet past 45 days.

**Step 1. Salesforce (`soqlQuery`).**
```sql
-- open opps
SELECT Id, Name, Account.Name, Account.Domain__c, StageName, Amount, Probability, CloseDate, Type,
       NextStep, Description,
       (SELECT Contact.Name, Contact.Title, Role, IsPrimary FROM OpportunityContactRoles)
FROM Opportunity WHERE OwnerId = '{SFDC_OWNER_ID}' AND IsClosed = false ORDER BY CloseDate

-- close rate: every loss counts, Discovery losses included. Still split lost_after_discovery and
-- lost_in_discovery (read the last StageName history row) so the tile can say how many died in Discovery
SELECT Id, Account.Name, Amount, CloseDate, IsWon, Type,
       (SELECT OldValue, NewValue FROM Histories WHERE Field = 'StageName')
FROM Opportunity WHERE OwnerId = '{SFDC_OWNER_ID}' AND IsClosed = true

-- last real contact
SELECT WhatId, Subject, ActivityDate, Type FROM Task
WHERE (WhatId IN :oppIds OR WhatId IN :accountIds) AND Status = 'Completed' AND ActivityDate <= TODAY
ORDER BY ActivityDate DESC
SELECT WhatId, Subject, ActivityDate FROM Event
WHERE (WhatId IN :oppIds OR WhatId IN :accountIds) AND ActivityDate <= TODAY ORDER BY ActivityDate DESC
```
Never use `Opportunity.LastActivityDate`, because future-dated tasks pollute it. Read API usage by
email domain, not by Account link.

**Step 2. Gmail.** Run `search_threads` with `from:@domain OR to:@domain newer_than:45d`, then
`get_thread` on the newest real thread. Last two-way contact is the newest thread where they replied.
On every moving or watch deal, read the newest thread for pricing sent, redlines and promised dates.
Sequence, cohort, welcome and marketing emails are not real contact.

**Step 3. Slack.** Read each account's `#int-*` and `#ext-*` channels directly with
`slack_read_channel` and `slack_read_thread`, because search misses recent posts. Also search the
account name over the last 30 days, your deal-desk and legal channels, and your own messages since
the last build. Confirm with `slack_read_channel` before saying nothing happened.

**Step 4. Calendar and meeting notes.** Booked meetings fill the "booked" chip. Call notes supply
"Why we're stuck", "Next step" and the tasks.

**Step 5. Research in parallel.** Split the opps across four background agents: key accounts, big
pursuits, small pursuits and renewals. Each one returns JSON in the shape shown in
`references/agent-briefs.md`. Save each result with `tools/extract_agent.py`.

**Step 6. Assemble and build.**
```bash
python3 -I builders/tools/assemble.py open-opps.json 2026-10-09
python3 -I builders/build_sotu.py
```
Pick "Open with these three" from the top moving deals. Year target and quota come from the AE.
Never guess them. The tiles say "Add your target" until the AE gives them.

Check the assembled data before building:
- Set `name_on_card` to the account name. Research agents often paste the full Salesforce opp name.
- Set `amount` as a number from Salesforce. Fix or flag any opp whose Amount does not match its name.
- When an account has several opps, keep one card per opp. The key-account card covers the whole account.
- Read `data/unknowns.json` and bring the important ones to the AE.

**Step 7. Publish** `pages/state-of-the-union.html`. Read `data/manifest.json` first. On the first
publish, save the URL. After that, always publish to the saved URL, never without it, or you make a
second page. Every company name links to its Plan of Attack automatically when the manifest has one.
Deal cards also get "Plan of attack" and "Joint plan" buttons from `manifest.plans` and
`manifest.jeps`, and the filter bar gets an "All plans of attack" button when `manifest.index_sheet`
is set.

**Weekly upkeep.**
1. Re-run Step 1 in full. It is cheap.
2. Re-research only accounts touched since the last build, plus every moving or watch deal.
3. Carry each open task forward unless the sources show it is done. Checkboxes save only in the
   viewer's browser, so ask the AE which ones are done. Drop done tasks from the JSON.
4. Re-pick "Open with these three" from the top three moving deals.
5. Rebuild and republish to the same URL. Post nothing to Slack unless the AE asks.

**Task and checklist formatting.** Every task list must read at normal size and stay compact.
- **Task text:** one action, 20 words max. Status and history go in "Why we're stuck", not in the task.
- **Owners:** first names, 3 max, with a slash between their side and ours ("Priya, Tom / Sam").
  Use a full name only when two people share a first name.
- **Done items** stay on the list, pre-checked (`"done": true`), trimmed to "Done M/D: <what>".
- **Named lists:** a list from a named person keeps its `group` heading ("Morgan's list (10/9)").
  New items go under "New since M/D".
- **Layout:** the owner sits on its own wrapping line under the task text. Never give it a separate
  column or stop it wrapping, or a long owner list squeezes the task into a thin column.

---

## Part 2: Plan of Attack (one per account)

**Coverage rule.** Build one for every account with an open opp, plus any account with an internal
Slack channel the AE posts in. Small PayGo renewals use LITE depth.

**Sections.** A masthead with an Opportunity box, Top of mind, Blockers, a business structure map
(multi-unit accounts only), Next action, phases, The eval (with a confidence gauge the AE adjusts),
Deal thesis, Path to partnership (legal, finance and signature are always the last three steps), an
Org map built around who decides, and More details (the room, surfaces, commercials, watch list,
back pocket, data hygiene traps).

**Sources per section.**

| Section | Where it comes from |
|---|---|
| Masthead, Opportunity | Salesforce opp and Account |
| Top of mind | Web news search (last month), Slack, Gmail |
| Blockers, Next action, Path | Slack int/ext channels, Gmail, meeting notes, deal-desk and legal channels |
| Business map, surfaces | A research tool on public filings and products, Salesforce opps per unit |
| The eval | Slack eval threads, meeting notes. Confidence is the AE's estimate, so say so |
| Org map, the room | Salesforce Contacts and OpportunityContactRoles, Gmail participants, ext-channel members. Build it around who decides, not Salesforce recency |
| Commercials | Usage by email domain, pricing from the deal-desk channel |
| Watch list, hygiene | Everything above. Salesforce mismatches go here, never in the body |

Keep the As-of date equal to the newest update-log entry.

**Run.** Launch one agent per account with the prompt
`Read and follow references/plan-brief.md. Depth: FULL|LITE. JEP: YES|NO.` plus the account, slug,
opp ids and known context. After each one finishes:
```bash
builders/tools/qa_build.sh <slug>
# publish pages/<slug>.html, then:
python3 -I builders/tools/save_url.py plans <slug> <url>
```
Rebuild and republish the State of the Union so the new plan is linked.

---

## Part 3: Joint Execution Plan (Stage 3 and later)

It is a customer-facing Google Doc. It has success criteria (CVOs), five phases (introductions,
evaluation, commercial, legal and procurement, onboarding and go-live), contacts on both sides, and
immediate next steps. Leave out internal notes, pricing debates, competitor names and risk ratings.

Upload it as a native Google Doc:
```bash
rclone copy "<Account> x <Seller> - Joint Execution Plan.html" {DRIVE_FOLDER} \
  --drive-import-formats html --drive-export-formats html
```
Once a JEP is shared with a buyer, never re-upload over it. Give the AE the changes to paste instead.

---

## Part 4: Account index sheet

```bash
python3 -I builders/tools/make_index.py
rclone copy "upload/Account Plans Index.csv" {DRIVE_FOLDER} --drive-import-formats csv --drive-export-formats csv
```
The sheet has one row per account: stage, last update, last real contact, next step, plan link and
JEP link. Re-uploading makes a new sheet. After the first upload, hand over changed rows instead.

---

## Part 5: Pipeline Cleanup Review

This turns the research into proposed Salesforce field changes that the AE approves on a page.
Nothing is written to Salesforce until it is approved.

1. Research agents also return `sfdc_facts` for each opp: use case, monthly volume, champion,
   economic buyer, eval path, contract status, suggested stage, loss reason, and so on.
2. Pull live opp field values with `sf data query --json`, then run
   `python3 -I builders/tools/make_review.py opp-fields.json <as_of> <sotu_url>`. Each opp lands in one
   group:
   - **move:** gate fields to fill, then step the stage forward.
   - **close:** needs a Loss Reason.
   - **fill:** fields only.
   
   Renewals stay open until 90 days before their date, unless the customer has said no.
3. `python3 -I builders/build_review.py`, then publish with the artifact database capability. The AE
   approves, edits or rejects each change. Decisions save to `decisions/<change id>`.
4. Read the decisions back, write `apply-plan.json` rows (`{"opp","account","id","field","value"}`) for
   the approved ones, save the live field values next to it, and run
   `python3 -I builders/tools/apply_review.py apply-plan.json apply-log.json`. It patches non-stage
   fields first, then steps the stage forward one stage at a time, and logs every failure.

The field API names in `make_review.py` are one org's custom Sales Path fields. Swap in your own.

---

## Living account plan (16 sections)

This is the older exec format, kept for accounts that need a long-running shared plan. Its section
order is fixed, with "Where I need help" always third. TAM is always shown in calls per year, never
dollars. See `../living-account-plan/SKILL.md`.

## Writing rules (every text field)

Use plain, short sentences at a 5th-7th grade level. No em dashes, no semicolons, and no filler
words like robust, comprehensive, leverage, streamline or delve. Tasks start with a verb, name an
owner and put dates inline ("Wed 10/14"). State only sourced facts. Guesses go in the agent's
unknowns list, never on the page.
