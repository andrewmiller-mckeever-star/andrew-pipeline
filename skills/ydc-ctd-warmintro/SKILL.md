---
name: ydc-ctd-warmintro
description: >-
  Queries Connect The Dots (CTD) API to find warm intro paths into a target account.
  Searches for ICP-type contacts (Director+ in Engineering, Product, IT) with
  "Strong Chance to Connect" scores. Surfaces top 3 warm intro options and drafts
  ready-to-edit intro request emails for each. Use when user says "find warm intros
  for [company]", "CTD check for [company]", "warm intro search", or automatically
  as Step 3.5 within a full pipeline run.
---

# YDC: Warm Intro Discovery (Step 3.5)

## Prerequisites

- Account plan from Step 2 (for business context in draft emails)
- Company domain
- ICP prospect list from Step 3 is optional context (for enrichment), not a filter

## CTD API Auth

All requests use these headers:
```
ctd-api-key: uak_PKSMqLtz-sD_foOMHDJ5ONNHa0u9RhY3
ctd-client-id: ryan.reed@you.com
```

See references/ctd-api.md for full endpoint documentation.

## Sequence of Operations

### 3.5.1: Query Company Reachability

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/company?company_domain={domain}
```

Check response:
- If 404 or no data: output "No CTD data for {Company}. Proceeding with cold outreach." and STOP.
- If `ctd_company_score_label` is NOT "strong": output "CTD score: {label}. No strong warm paths. Proceeding with cold outreach." and STOP.
- If error code 50.11 (source account not found): output "CTD API error (source account issue). Proceeding with cold outreach." and STOP.
- If "strong": proceed to 3.5.2.

### 3.5.2: Find Reachable ICP Contacts

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/people?company_domain={domain}&degree=first&degree=second&target_seniority=VP&target_seniority=Director&target_seniority=CXO&target_seniority=CEO&target_seniority=Founder&target_function=Engineering&target_function=Product&target_function=Information+Technology&page_size=40
```

From the response:
- Filter to ONLY contacts where `ctd_score_label` = "Strong Chance to Connect"
- If no results pass the filter: output "Company is reachable but no individual Strong Chance contacts found." and STOP.

### 3.5.3: Enrich with Step 3 Data (If Available)

If the Step 3 prospect list is available, check whether any CTD-surfaced contacts also appear in the Apollo results:
- Match by LinkedIn URL (compare `linkedin_id` from CTD with LinkedIn URLs from Apollo)
- Fallback match: name + company name (fuzzy match on first/last name)
- If a CTD contact is also in the Apollo list, note their verified email, sequence assignment, and other Apollo data in the output
- If a CTD contact is NOT in the Apollo list, that's fine. They're still a valid warm intro target. Note them as "found via CTD only" (may need manual email lookup).

This is enrichment, not a filter. All "Strong Chance to Connect" ICP-type contacts from CTD are candidates regardless of whether Apollo found them.

### 3.5.4: Get Intro Paths for Top Contacts

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/paths?company_domain={domain}&path_relationship_strength=strong&path_relationship_strength=medium&degree=first&degree=second&page_size=40
```

Note: `path_relationship_strength` requires array syntax (repeated param). Single value returns 400.

For each matched contact, extract from the paths response:
- Connector: name, title, company, LinkedIn ID (from path `nodes[]` where `connector_type` indicates the intermediary)
- Relationship context: `overlapping_message` from `edges[]`
- Path details: degree, `path_relationship_strength`, `path_relationship_type`

Match paths to the ICP contacts from 3.5.2. If paths exist for contacts not in our filtered ICP list, ignore them.

### 3.5.5: Rank and Select Top 3

Rank ICP contacts with paths by (in priority order):
1. 1st degree paths over 2nd degree
2. Strong relationship strength
3. ICP title relevance (VP/C-suite over Director)
4. Also in Apollo prospect list (bonus, not required)

Select top 3. If fewer than 3 matches exist, use however many there are.

### 3.5.6: Draft Intro Request Emails

For each of the top 3, draft an intro request email. The email goes to the CONNECTOR (the person who knows the target), asking them to introduce Ryan to the TARGET.

**Email structure:**

```
Subject: Quick intro to {Target First Name} {Target Last Name}?

Hi {Connector First Name},

[1-2 sentences: shared context. Use the overlapping_message from CTD if available.
If not available, use a generic warm opener like "Hope you're doing well."]

[1-2 sentences: who the target is and why Ryan wants to connect. Pull a specific
business reason from the account plan, not generic. Example: "{Target} is leading
{Company}'s AI agent platform, and we work with teams like theirs on the search
infrastructure layer."]

[1 sentence: what You.com does, framed simply. Example: "We provide the search
API that powers AI agents at companies like DuckDuckGo and Harvey."]

Would you be open to making an intro? I put together something below you can
forward or edit however you'd like:

---

Hi {Target First Name},

[2-3 sentence forwarding blurb. Introduces Ryan, explains relevance to target's
work, ends with interest-based CTA. Example: "Ryan Reed works at You.com, where
they build the search infrastructure behind AI agents. Given {Company}'s work on
{specific initiative}, he thought it might be worth a quick conversation about how
teams like yours are approaching the data layer. Open to connecting?"]

---

Thanks, Ryan
```

**Writing rules for drafts:**
- No em dashes (use commas, colons, periods, semicolons, pipes)
- No AI-isms (utilize, comprehensive, enhance, delve, robust, streamline)
- No buzzwords (synergy, leverage, paradigm shift, best-in-class)
- Plain text only (no markdown, no bold, no headers)
- Short paragraphs, 2-3 sentences max
- 5th-7th grade reading level
- Word count: 100-150 words (excluding forwarding blurb)
- Forwarding blurb: 40-60 words
- Never name competitors
- Never reference confidential evaluations
- One proof point max (DuckDuckGo, Harvey, Windsurf, or Databricks)

## Output: Warm Intro Brief

Present the output in this format:

```
WARM INTRO BRIEF: {Company}
CTD Score: Strong Chance to Connect
Domain: {domain}
ICP Contacts Found: {N} "Strong Chance to Connect" ICP-type contacts

---

OPTION 1 (Strongest Path)
Target: {Name} | {Title} | {LinkedIn URL}
Also in Apollo: {Yes (Seq A) / No - CTD only}
Connector: {Name} | {Title} at {Company}
Path: {1st/2nd} degree | {relationship_type} | Strength: strong
Context: {overlapping_message or "No shared context available"}

DRAFT EMAIL:
Subject: Quick intro to {Target Name}?

{full draft email}

---

OPTION 2
[same format]

---

OPTION 3
[same format]

---

NEXT STEPS:
- Review and edit the drafts above
- Send intro requests to connectors
- Once intros are made, update Step 4 outreach to use warm hooks for these contacts
```

## Error Handling

- 404 on company: skip gracefully, proceed cold
- 50.11 source account error: skip gracefully, note the error for Ryan to follow up with CTD support (jelena@ctd.ai)
- 403 forbidden: API key may be revoked or expired, alert Ryan
- 500 server error: skip gracefully, proceed cold
- Empty results at any step: skip gracefully with a clear message about what was found vs. what wasn't

## Model Routing

This step runs as a **Sonnet subagent** when called from the pipeline orchestrator. The API calls are straightforward; the draft writing is the only synthesis task and Sonnet handles it well given the structured template.

When run standalone (user triggers directly), runs on whatever model is active.
