---
name: ydc-ctd-warmintro
description: >-
  Queries Connect The Dots (CTD) API to find warm intro paths into a target account.
  Searches for ICP-type contacts (Director+ in Engineering, Product, IT) with
  "Strong Chance to Connect" scores. Surfaces warm intro options grouped by degree
  (1st degree first) with detailed connector context, relationship history, and
  ready-to-edit intro request emails. Use when user says "find warm intros for
  [company]", "CTD check for [company]", "warm intro search", "warm intros",
  or when offered at the end of a pipeline run.
---

# YDC: Warm Intro Discovery via Connect The Dots

This is a standalone skill, not a pipeline step. It can be invoked:
- Directly: "find warm intros for [company]", "CTD check for [company]"
- Post-pipeline: offered as an optional next step after a pipeline run completes

## Prerequisites

- Company domain (required)
- Account plan from Step 2 (optional, improves draft email quality with business context)
- ICP prospect list from Step 3 (optional, for cross-referencing with Apollo data)

## CTD API Auth

All requests use these headers:
```
ctd-api-key: uak_PKSMqLtz-sD_foOMHDJ5ONNHa0u9RhY3
ctd-client-id: ryan.reed@you.com
```

See references/ctd-api.md for full endpoint documentation.

## Sequence of Operations

### 1. Query Company Reachability

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/company?company_domain={domain}
```

Check response:
- If 404 or no data: output "No CTD data for {Company}." and STOP.
- If `ctd_company_score_label` is NOT "strong": output "CTD score: {label}. No strong warm paths into {Company}." and STOP.
- If error code 50.11: output "CTD API error (source account issue). Contact jelena@ctd.ai." and STOP.
- If "strong": proceed.

### 2. Find Reachable ICP Contacts

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/people?company_domain={domain}&degree=first&degree=second&target_seniority=VP&target_seniority=Director&target_seniority=CXO&target_seniority=CEO&target_seniority=Founder&target_function=Engineering&target_function=Product&target_function=Information+Technology&page_size=40
```

From the response, filter to ONLY contacts where `ctd_score_label` = "Strong Chance to Connect".

If zero results pass the filter: output "Company is reachable but no individual Strong Chance contacts found." and STOP.

### 3. Enrich with Apollo Data (If Available)

If a Step 3 prospect list exists, cross-reference CTD contacts against it:
- Match by LinkedIn URL (`linkedin_id` from CTD vs LinkedIn URLs from Apollo)
- Fallback match: name + company name (fuzzy)
- If matched: note their verified email, sequence assignment, and Apollo data
- If not matched: note as "CTD only" (may need manual email lookup)

This is enrichment, not a filter. All "Strong Chance to Connect" contacts are candidates.

### 4. Get Intro Paths

```
GET https://api.ctd.ai/user/atc-paths-api/public/v1/paths?company_domain={domain}&path_relationship_strength=strong&path_relationship_strength=medium&degree=first&degree=second&page_size=40
```

Note: `path_relationship_strength` requires array syntax (repeated param). Single value returns 400.

**Critical filter:** Only keep paths where the connector-to-target relationship strength is "strong" (`path_relationship_strength_label` = "strong"). Drop medium-strength paths. The whole point is surfacing intros where the connector actually knows the target well enough to make a real introduction.

For each qualifying path, extract:
- **Connector:** name, title, company, LinkedIn ID, `connector_type` (co-worker, other, etc.)
- **Target:** name, title, company, LinkedIn ID, `is_target_person`
- **Relationship context:** `overlapping_message` from `edges[]` (contains shared work history, overlapping tenures, mutual connections count). This is the most valuable field: it tells you WHY the connector knows the target.
- **Relationship type:** `relationship_type` array from `edges[]` (e.g., "overlapped", "coworker", "linkedin connected", "email connected")
- **Degree:** 1st (Ryan knows the connector directly) or 2nd (Ryan reaches the connector through someone)

Match paths to the ICP contacts from step 2. Discard paths to non-ICP targets (investors, board members, non-relevant titles) unless no ICP paths exist.

### 5. Rank and Structure Output

**Ranking priority:**
1. Strong path relationship strength only (medium paths already filtered out in step 4)
2. Connector is someone Ryan actually knows: co-worker at You.com, or has direct email/LinkedIn connection (check `connector_type` and user-to-connector edge `relationship_type`)
3. Rich `overlapping_message` context (shared company tenures, mutual connections) over sparse paths with no shared history
4. Target is ICP-relevant (VP/C-suite in Eng/Product/IT over Director)
5. 1st degree over 2nd degree (tiebreaker, not primary sort)
6. Also in Apollo prospect list (bonus)

Show ALL strong paths, not just top 3. Each one is a potential warm intro opportunity.

### 6. Draft Intro Request Emails

For each path with a named connector, draft an intro request email. The email goes to the CONNECTOR asking them to introduce Ryan to the TARGET.

**Email structure:**

```
Subject: Quick intro to {Target First Name} at {Target Company}?

Hi {Connector First Name},

[1-2 sentences: relationship context. Use the overlapping_message to reference shared history.
For co-workers: "We've been working together at You.com..." or reference specific shared context.
For external contacts: reference how Ryan knows them (e.g., "through Norwest" or "from [event/company]").
If overlapping_message has shared tenures, USE THEM: "I saw you and {Target} overlapped at {Company} for {duration}."
If no shared context available: use a simple warm opener.]

[1-2 sentences: who the target is and why Ryan wants to connect. Pull a specific
business reason from the account plan if available. If no account plan context,
use the target's title and company to infer relevance. Example: "{Target} is leading
{Company}'s engineering org, and we work with teams like theirs on the search
infrastructure layer that powers AI agents."]

[1 sentence: what You.com does, framed simply. Example: "We provide the search
API that powers AI agents at companies like DuckDuckGo and Harvey."]

Would you be open to making an intro? I put together something below you can
forward or edit however you'd like:

---

Hi {Target First Name},

[2-3 sentence forwarding blurb. Introduces Ryan, explains relevance to target's
work, ends with interest-based CTA.]

---

Thanks, Ryan
```

**Writing rules:**
- No em dashes (use commas, colons, periods, semicolons, pipes)
- No AI-isms (utilize, comprehensive, enhance, delve, robust, streamline)
- No buzzwords (synergy, leverage, paradigm shift, best-in-class)
- Plain text only (no markdown, no bold, no headers)
- Short paragraphs, 2-3 sentences max
- 5th-7th grade reading level
- Intro request body: 80-130 words
- Forwarding blurb: 40-60 words
- Never name competitors
- Never reference confidential evaluations
- One proof point max (DuckDuckGo, Harvey, Windsurf, or Databricks)
- Vary the proof point across drafts (don't use DuckDuckGo in every email)

## Output Format

```
================================================================
WARM INTRO DISCOVERY: {Company}
================================================================
CTD Company Score: Strong Chance to Connect
Domain: {domain}
Total ICP Contacts Reachable: {N}
Strong Intro Paths Found: {N}

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
  Degree:     {1st (Ryan knows them directly) / 2nd (reached via intermediary)}
  How connected to Ryan: {relationship_type from user->conn1 edge,
    e.g., "coworker + email connected" or "enterprise external member"}

WHY THIS INTRO WORKS:
  {Full overlapping_message text from the connector->target edge,
   formatted as readable prose. Include ALL details:
   - Shared companies and overlapping tenures with exact durations
   - Mutual connection counts
   - Any other relationship signals (email connected, LinkedIn connected)

   This section is the core value. It tells Ryan exactly why the connector
   can make a credible introduction and gives him specific talking points
   for the intro request. Never truncate or summarize this field.

   If the path is 2nd degree, also include the user->connector edge context
   so Ryan understands the full chain.}

DRAFT INTRO EMAIL:
Subject: Quick intro to {Target First Name} at {Company}?

{full draft email including forwarding blurb}

================================================================
PATH 2
================================================================
[same format]

================================================================
PATH 3
================================================================
[same format]

[...continue for all strong paths found...]

================================================================
SUMMARY & RECOMMENDATION
================================================================

{2-4 sentences: which path(s) to pursue first and why. Be specific.
Reference the connector relationship strength, shared history, and
target's ICP relevance. If a connector appears in multiple paths
(e.g., Richard Socher connects to 3 different targets), note that
one intro request to that connector could open multiple doors.}

NEXT STEPS:
  1. Review and personalize the draft emails above
  2. Send intro requests (prioritize connectors with strongest shared history)
  3. If intros are made and you have active sequences for {Company},
     swap cold hooks for warm hooks on those contacts
================================================================
```

## Error Handling

- 404 on company: "No CTD data for {Company}." and stop.
- 50.11 source account error: note the error, suggest contacting jelena@ctd.ai
- 403 forbidden: API key may be revoked or expired, alert Ryan
- 500 server error: retry once, then stop gracefully
- Empty results at any step: clear message about what was found vs. what wasn't
- Zero 1st-degree paths: skip that section entirely, show 2nd-degree only
- Zero ICP-relevant targets but paths exist to non-ICP people: note this and show the non-ICP paths anyway with a caveat

## Model Routing

When called from the pipeline post-run prompt: runs as a **Sonnet subagent**. The API calls are straightforward; the draft writing benefits from the structured template.

When run standalone (user triggers directly): runs on whatever model is active.
