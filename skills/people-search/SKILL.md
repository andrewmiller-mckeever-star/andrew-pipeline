---
name: people-search
description: Look up people and companies with You.com's people and company data (Web Search with knowledge mode "pro"). Use whenever Andrew says "use people data", "find people at [company]", "who leads X at [company]", "look up [person]", "people at [company]", "company data for [company]", or asks for headcount, funding rounds or firmographics. Profiles only; contact data for outreach still comes from Apollo or Salesforce. Not for bulk prospect enrollment (that's ydc-prospects / Apollo).
---

# People and Company Search

You.com's people and company data comes from licensed sources (People Data Labs, plus company
registries such as Companies House): over 900M people and 100M companies. It is part of the
Web Search API, turned on with `knowledge.mode: "pro"`. Sources: Notion Atlas Wiki pages
"[gtm] People + Company in Knowledge" and "[prd] Tako People+Company data", 2026-11-13.

The old `POST /v1/people/search` endpoint is no longer supported. It is allowed ONLY as a
temporary fallback, through 2026-12-13 (see below).

## Status (check first)

| Call | Our key on 2026-11-13 |
|---|---|
| `POST /v1/search` with `knowledge: {"mode": "pro"}` | 422, not enabled yet. Rolling out per account soon |
| `POST /v1/enrich` (paid contact data) | 403, not enabled |

Always call pro first. If it returns 422:
- **On or before 2026-12-13:** fall back to the old endpoint (Temporary fallback section) and
  say in your answer that the results came from the old endpoint because pro isn't on yet.
- **After 2026-12-13:** do not call the old endpoint. Tell Andrew pro still isn't on for our
  key. If the question still needs an answer, offer a regular Web Search or Research API call,
  clearly labeled as web results, not people data. Also delete the Temporary fallback section
  from this skill and the fallback line in `~/.claude/CLAUDE.md`.

When pro starts returning 200, update this table and the note in `~/.claude/CLAUDE.md`.

## Temporary fallback: old endpoint (expires 2026-12-13)

Only after a pro call returns 422, and only through 2026-12-13 (Andrew, 2026-11-13).

```bash
curl -sS -X POST "https://ydc-index.io/v1/people/search" \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "Head of AI at Example Corp", "count": 10}'
```

- `query`: role, company, location or skill in plain words, or a LinkedIn URL, GitHub URL or
  work email for a known person. `count`: 1 to 25, default 10.
- Each result: `name`, `headline`, `bio`, `location`, `current_position` {company, title,
  function, start_date, months_in_role}, `past_positions[]`, `years_experience`, `skills`,
  `industries`, `education[]`, `linkedin`, `emails_work`, `has_work_email`.
- People only, no company records. For company questions after a pro 422, use a regular Web
  Search call instead.
- It can return work emails. Same data-handling rules apply: outreach contact details still
  come from Apollo or Salesforce.
- Worked on 2026-11-13. If it returns 404 or 410, it's been shut off: tell Andrew and stop.

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
  -d '{"query": "engineers at stripe", "count": 5,
       "knowledge": {"mode": "pro", "count": 10}}'
```

- `knowledge.mode`: `standard` (finance, macro, sports, weather, ~600ms; the old `"core"`) or
  `pro` (adds people and company lists, ~4s p50). Same price. Any other value is a 422.
- `knowledge.count`: rows per people or companies list, 1 to 25, default 10. Pro only.
- Results: `results.knowledge` is a list of cards next to `results.web`. If knowledge has no
  match or times out, web results still come back.

Card types: `people`, `companies`, `answer` (text answer with `as_of`, often from S&P Global).
List cards:

```json
{"type": "people", "title": "Engineers at Example Corp (500+)",
 "attribution": [{"name": "People Data Labs"}],
 "data": {"rows": [...], "total_rows": 1000, "truncated": true, "enrich_list_id": "pl_..."}}
```

People row fields (empty fields are left out): `name`, `description` (bio), `title`,
`department`, `sub_role`, `business_area`, `seniority`, `occupation`, `employer`,
`in_role_since`, `job_summary`, `job_verified_on`, `skills`, `industry`, `location`, `metro`,
`linkedin_url`, `twitter_url`, `github_url`, `experience[]` (employer, title, seniority,
start_date, end_date, is_current), `education[]` (school, degrees, majors, dates),
`registry_seats`, `is_enrichable`, `enrich_person_id`. Search never returns emails or phones.

Company row fields: `name`, `also_known_as`, `status`, `company_type`, `description`,
`industry`, `tags`, `naics_codes`, `sic_codes`, `headcount`, `headcount_range`,
`funding_stage`, `total_raised`, `funding_round_count`, `funding_rounds[]` (date, stage,
amount, currency, investors), `established`, `ticker`, `location`, `street_address`,
`postcode`, `metro`, `website`, `other_domains`, social URLs, `is_enrichable`,
`enrich_company_id`.

Query tips: a person's name returns a `people` card. A role plus company ("heads of AI at
[company]") returns a `people` list. A company name ("[company] company") returns a
`companies` card and often an `answer` card.

## Enrich (paid, not enabled)

`POST /v1/enrich` buys contact and premium fields for rows found in search: up to 25 ids per
call (`pe_...`, `co_...`, or one list id `pl_...` / `cl_...` for up to 1,000 rows),
`enrich_values: true` to buy, `false` to preview `is_enrichable` flags. List price: $60 per
1,000 people, $30 per 1,000 companies, $1 per 1,000 calls that return nothing. Never call it
with `enrich_values: true` without Andrew's explicit go.

## How to present results

- Short table: name, title, employer, location, LinkedIn, in-role-since when present. Add
  experience, skills or funding rounds only when asked for depth.
- Name the source from `attribution`.
- Never invent a field. An empty list is a real "no match", not an error.
- Before calling someone a prospect or greenfield, still check Salesforce ownership.

## Errors

- `422` on a pro call: pro isn't enabled for our key yet (or a bad parameter). Through
  2026-12-13 use the temporary fallback; after that, tell Andrew.
- `403` / `404`: endpoint not enabled. Don't retry; tell Andrew.
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
