---
name: people-search
description: Look up people and companies with You.com's people and company data (Web Search with knowledge mode "pro"). Use whenever Andrew says "use people data", "find people at [company]", "who leads X at [company]", "look up [person]", "people at [company]", "company data for [company]", "build a list of [people/companies]", or asks for headcount, funding rounds, investors or firmographics. Profiles only; contact data for outreach still comes from Apollo or Salesforce. Not for bulk prospect enrollment (that's ydc-prospects / Apollo).
---

# People and Company Search

You.com's people and company data comes from licensed sources (People Data Labs, plus company
registries such as Companies House): over 900M people and 100M companies. It is part of the
Web Search API, turned on with `knowledge.mode: "pro"`. Source: Notion Atlas Wiki page
"[gtm] People + Company in Knowledge", re-read 2026-11-23.

## Status (check first)

| Call | Our key on 2026-11-25 |
|---|---|
| `POST /v1/search` with `knowledge: {"mode": "pro"}` | 200. Works (2.3s on a test call) |
| `POST /v1/enrich` (paid contact data) | 404, not enabled for our account (403 on 11/23) |

If a pro call ever returns 422, check the request body first (bad `mode` or `count`).
Through 2026-12-13 only, you may fall back to the old `POST https://ydc-index.io/v1/people/search`
(`{"query": "...", "count": 1-25}`, people only) and say so in your answer. After 2026-12-13,
never use the old endpoint. Tell Andrew, and delete this paragraph and the fallback mention in
`~/.claude/CLAUDE.md`.

## Data handling

Follow "YDC Policy: Dos and Donts for People Data Handling Internal Use" (linked in
#proj-company-people-search): keep the data in company systems, no downloads to personal
devices, nothing sent outside company domains. Use it for account research, meeting prep and
finding the right people. Never paste raw people records into customer-facing docs or decks.

## The call

Same host and key as every other You.com call. Never echo or log the key.

```bash
curl -sS -X POST "https://ydc-index.io/v1/search" \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "engineers at \"Stripe\"", "count": 3,
       "knowledge": {"mode": "pro", "count": 10}}'
```

- `knowledge.mode`: `standard` (finance, macro, sports, weather, about 600ms; same as the old
  `"core"`) or `pro` (adds people and company lists, about 4s p50 end to end). Same price.
- `knowledge.count`: rows per `people` or `companies` list, 1 to 25, default 10.
- Results: `results.knowledge` is a list of cards next to `results.web`. If knowledge has no
  match or times out, web results still come back. Keep the top-level `count` small, since web
  results are noise for people questions.

## How to write the query (Notion querying guide)

Four supported query types:
1. **People lookup:** a name plus something that pins the person down (`"Sudip Roy" at "Adaption"`).
2. **Company lookup:** a company name plus detail (`"Adaption" company`).
3. **People list building:** a set of people matching filters.
4. **Company list building:** a set of companies matching filters.

List building is where pro beats other people search providers. Lists are more complete:
up to 25 rows inline, and up to 1,000 through Enrich.

Tips:
- **Put names in quotes.** Companies, people and places: `engineers at "Stripe" in "Dublin"`.
- **One list per query.** Split multi-part asks or pasted paragraphs into separate calls.
- **Use concrete criteria.** `Series B fintech companies in London with 50-200 employees` beats
  `fast-growing innovative startups`, which has to be interpreted first.

Filters pro reads from a plain-language query:

| People | Companies |
|---|---|
| Name | Name |
| Current title or role | Industry |
| Function, department, seniority | Location (country, state, metro, city, postcode) |
| Current employer (by name or any company filter) | Headcount range |
| Location (country, state or region, metro, city) | Founding year, incorporation date |
| When they started the current role | Active status |
| Past employers | Public or private |
| Schools, degree level, field of study, grad year | Funding stage, total raised, last raise date, investors |
| Career start year | Revenue band |
| Skills | Keywords in the company description |

Examples:
- `Product managers in "San Francisco" who previously worked at "Google" and studied at "Stanford"`
- `Healthcare AI startups in "Boston" founded after 2020 that raised over $10M`
- `Chief operating officers at "Insight Partners"-backed Series B startups`
- `Private AI companies with 50-500 employees headquartered in "Paris" founded in 2020 or later`

Sales uses: map the buying center at an account (`VPs of engineering at "Acme"`), spot who
changed roles (`in_role_since`), size an account (headcount, funding), and build target lists
by investor, stage, region or headcount for territory work.

## The response

Card types: `people`, `companies`, `answer` (a text answer, often from S&P Global). List cards:

```json
{"type": "people", "title": "AI Leaders at Stripe, LLC (18)",
 "attribution": [{"name": "People Data Labs"}],
 "data": {"rows": [...], "total_rows": 18, "truncated": true, "enrich_list_id": "pl_..."}}
```

Empty fields are left out, so rows in the same list can have different fields.

People row fields: `name`, `description` (bio), `title`, `department`, `sub_role`,
`business_area`, `seniority`, `occupation`, `employer`, `in_role_since`, `job_summary`,
`job_verified_on`, `skills`, `industry`, `location`, `metro`, `linkedin_url`, `twitter_url`,
`github_url`, `experience[]` (employer, title, department, sub_role, business_area,
seniority list, start_date, end_date, is_current), `education[]` (school, degrees,
degree_levels, majors, dates), `registry_seats`, `is_enrichable`, `enrich_person_id`.
Search never returns emails or phone numbers.

Company row fields: `name`, `also_known_as`, `status`, `company_type`, `description`,
`industry`, `tags`, `naics_codes`, `sic_codes`, `headcount`, `headcount_range`,
`funding_stage`, `total_raised`, `funding_round_count`, `funding_rounds[]` (date, stage,
amount, currency, investors), `established`, `ticker`, `location`, `street_address`,
`postcode`, `metro`, `website`, `other_domains`, `linkedin_url`, `twitter_url`,
`facebook_url`, `is_enrichable`, `enrich_company_id`.

`is_enrichable` flags which premium fields exist. Person: `work_email`, `phone`,
`personal_email`, `all_emails`, `all_personal_emails`. Company: `estimated_revenue`,
`linkedin_followers`, `parent`, `subsidiaries`.

Data quirks: the companies card uses the legal name (You.com comes back as "SuSea, Inc."),
and `headcount_range` can disagree with `headcount`. Treat headcount as a rough guide and
check it before sizing a deal.

## Enrich (paid, not enabled for our account)

`POST /v1/enrich` buys premium fields for rows found in search.

- `ids`: 1 to 25 per call. Mix `pe_` (person) and `co_` (company) ids, plus at most one list
  id (`pl_` people list, `cl_` companies list).
- `enrich_values`: **defaults to `true`, which bills.** Always send it explicitly. `false` is a
  preview: it returns `is_enrichable` only and bills as one empty call.
- `count` and `offset`: list ids only. Page size 1 to 1,000 (omit for the whole list). Use the
  page's `data.next_offset` for the next page, not offset plus rows returned.
- Response: the same search record plus `enrich_status` (`enriched`, `empty`, `not_found`,
  `error`) and an `enriched` object with the values held. `metadata.usage` shows what billed.
- Pricing: only records with at least one premium value bill. People $40 CPM, companies $30
  CPM, calls that return no premium values $1 per 1,000 calls. 422s and all-failed 502s are
  free. A 1,000-row people page is about $40.
- Errors: 422 bad ids, 404 not enabled for the account, 502 every id failed upstream.

Never call enrich with `enrich_values` true or left out without Andrew's explicit go.

## How to present results

- Short table: name, title, employer, location, LinkedIn, in-role-since when present. Add
  experience, skills or funding rounds only when asked for depth.
- Say how many rows the full list has (`total_rows`) when `truncated` is true.
- Name the source from `attribution`.
- Never invent a field. An empty list is a real "no match", not an error.
- Before calling someone a prospect or greenfield, still check Salesforce ownership.

## Errors

- `422`: bad parameter. See the Status section for the temporary fallback.
- `403` / `404`: endpoint not enabled. Don't retry. Tell Andrew.
- `503` / `504`: retry up to 3 times with backoff.
- Never print the raw error body or the key.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-21 | Skill created for the `/v1/people/search` endpoint | New prod endpoint, internal testing |
| 2026-11-13 | Rewritten around Web Search `knowledge.mode: "pro"`, plus enrich, company fields and data-handling rules | Notion "[gtm] People + Company in Knowledge" and "[prd] Tako People+Company data"; live tests: pro 422, enrich 403 |
| 2026-11-13 | Removed `/v1/people/search` entirely, no fallback | Andrew: old endpoint is no longer supported, pro is coming soon |
| 2026-11-13 | Re-added `/v1/people/search` as a fallback on pro 422 only, expiring 2026-12-13 | Andrew: keep working for 30 days while pro rolls out, then stop |
| 2026-11-25 | Added the querying guide (quotes, one list per query, filters, examples), enrich paging and new pricing, `enrich_values` defaults to true | Andrew asked to update from the Notion page (read 11/23); live tests 11/25: pro 200, enrich 404 |
