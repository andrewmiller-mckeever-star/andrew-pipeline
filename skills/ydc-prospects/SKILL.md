---
name: ydc-prospects
description: Discovers and enriches Director+ prospects at target companies for You.com whale account pipeline. Uses Apollo.io exclusively: people search via apollo_mixed_people_api_search then bulk email enrichment via apollo_people_bulk_match in batches of 10. Filters for Engineering, AI/ML, Data Science, Product, Strategy, DevRel, Security departments at Director, VP, C-suite seniority. Use when user says "find prospects at [company]", "prospect search for [company]", "discover contacts", "apollo search", "Step 3", or within a full pipeline run.
---

# YDC: Prospect Discovery (Step 3)

## Primary Method: Apollo.io

### Step 3.1: Search for Prospects

Use `apollo_mixed_people_api_search` with:
- `q_organization_domains_list`: ["{company domain}"]
- `person_seniorities`: ["director", "vp", "c_suite"]
- `person_titles`: ["Director", "VP", "Vice President", "Head", "Chief", "SVP", "Senior Vice President"]
- `per_page`: 100
- Filter departments: Engineering, AI/ML, Data Science, Product, Strategy, Developer Relations, Security/Compliance, IT

This endpoint does NOT return emails. Returns names, titles, company, seniority, Apollo person IDs.

### Step 3.1b: LinkedIn URL Enrichment Prep

Before bulk matching, read the Leadership Directory in `{company}_facts.md`. For any Apollo search result that matches a name in the Leadership Directory, pull their LinkedIn URL from that file and add it to the enrichment payload. LinkedIn URL is the strongest matching key in `apollo_people_bulk_match` — it bypasses name-obfuscation failures and returns verified data more reliably.

Cross-reference by: name fuzzy match (first + last) against Leadership Directory entries. When a match is found, attach the LinkedIn URL to that prospect's record before Step 3.2.

### Step 3.2: Enrich Top Prospects

Use `apollo_people_bulk_match` in batches of 10:
- Pass: first_name, last_name, organization_name, domain — AND `linkedin_url` where available from Step 3.1b
- Returns: verified emails, phone numbers, work history, LinkedIn URLs
- Consumes ~1 credit per person (~498K credits available, effectively unlimited)
- **LinkedIn URL as primary match key:** When a LinkedIn URL is provided, Apollo uses it as the primary identifier and returns higher-confidence enrichment. Always include it when available.

## SFDC Contact Dedup (Pre-Step 3.2)

Before enriching prospects, cross-reference the Apollo search results against the SF Flags section in `{company}_hooks.md` (produced by Step 1). For each prospect:
- If the prospect is already in SF WITH activity history: FLAG as previously contacted. Include in the prospect list but note "Prior SF engagement" so Step 4 can adjust outreach tone.
- If the prospect is in SF but has ZERO activity: safe to include as normal cold prospect.
- If the prospect appeared in a [Gong In] reply (listed under "Prospect Replies" in SF Flags): FLAG as warm path. This prospect should NOT receive cold outreach. Route to warm follow-up instead.
- If the prospect was touched by an Apollo sequence (listed under "Prior sequences run" in SF Flags): FLAG as already sequenced. Avoid re-enrolling in the same or similar sequence.

## CTD Warm Path Cross-Reference (Pre-Step 3.2, runs alongside SFDC dedup)

The CTD Warm Intro Paths section in `{company}_hooks.md` (produced by Step 1) contains warm intro data from Connect The Dots. Cross-reference every Apollo result against this section before finalizing the prospect list.

**Matching logic:** Match by LinkedIn URL first (`linkedin_id` from CTD vs LinkedIn URL from Apollo). Fallback: name + company fuzzy match.

**Three tiers of CTD impact:**

**Tier 1 — You.com Employee Connector (highest priority):**
If the research brief flags a prospect as reachable via a You.com employee (`YDC Employee: Yes`), that person is ALWAYS included in the prospect list regardless of title, department, or ICP fit. Tag them:
```
warm_intro: true
connector_name: {You.com employee name}
ctd_path_strength: strong
sequence_note: "WARM INTRO ONLY — do not cold enroll. Ask {connector_name} for intro via Slack before activating any sequence."
```
Assign them to the most relevant sequence but mark the contact as paused. The AE requests the intro first, then activates.

**Tier 2 — Strong CTD path, external connector:**
If the research brief shows a strong path via an external connector (non-You.com), elevate that prospect's rank by one position in the priority order. Flag:
```
warm_intro: true
connector_name: {connector name}
ctd_path_strength: strong
sequence_note: "Warm intro available via {connector_name} — consider requesting intro before Touch 1."
```

**Tier 3 — In CTD but no strong path:**
No weighting change. Note in output for AE awareness only.

**If research brief has no CTD data (CTD returned no results for this company):** skip this cross-reference entirely and proceed with standard Apollo-only prioritization.

## Fallback 1: Sumble FindPeople (intermediate, before Apify)

Trigger if: Apollo returns < 10 Director+ results OR email coverage < 50%.

Use `FindPeople` with the target company domain and job functions matching the 4 sequence personas:
- AI Engineer, Machine Learning, Software Engineer (Seq A + D)
- Product Manager (Seq C)
- Engineering & R&D, Information Technology (Seq B)

Merge Sumble results with Apollo results — deduplicate by name + company. Use Apollo for email enrichment: run `apollo_people_bulk_match` against any Sumble-only contacts to get verified emails.

**Email gap-filler:** If a high-priority contact (Tier 1 CTD or title-critical) has no verified email from Apollo bulk match, use `EnrichPerson` with their name and company as a secondary attempt before dropping them from the list.

Sumble FindPeople does not consume Apollo credits but uses Sumble credits. Use sparingly — Apollo coverage is primary.

## Fallback 2: Apify LinkedIn Scraper

Trigger if: Apollo + Sumble combined returns < 10 Director+ results OR email coverage still < 50% after Sumble enrichment OR both unavailable.

See references/apify-config.md for full API setup.

**REQUIRED: Verify LinkedIn URL slug before running Apify** (see references/linkedin-verification.md).

## Prospect Filtering & Prioritization

After enrichment, select and prioritize for sequence assignment:
- Primary: VP and Director level in Engineering, AI/ML, Product, Strategy, DevRel, Security
- Secondary: 1-2 manager-level only as last resort when VP/Director exhausted
- Contact cap: 5 per sequence (20 total across 4 sequences)
- Priority order: (1) You.com employee connector (always include, see CTD Tier 1 above), (2) CTD strong path — external connector (elevate one rank), (3) title relevance, (4) verified email, (5) direct use case alignment
- When over the 5-per-sequence cap, deprioritize contacts without verified emails (fill verified-email contacts first). Never discard a contact solely for missing email when under cap — enroll with `sequence_no_email: true` so they still receive LinkedIn/call/action touches.

## Output

Deliver a prospect list with:
- Name, Title, Email (verified/unverified flag), LinkedIn URL, Seniority, Department
- Proposed sequence assignment (A/B/C/D) based on title/department
- Flag no-email contacts for manual LinkedIn outreach
- `warm_intro` (boolean): true if contact has a CTD warm path (populated from Step 1 research brief, not a post-Step 3 call)
- `connector_name` (string): name of the connector who can make the intro
- `ctd_path_strength` (string): "strong" or null
- `sequence_note` (string): special handling instructions (e.g., "WARM INTRO ONLY — do not cold enroll")

Sequence assignment maps to: Seq A = Engineering, Seq B = Exec/CTO/CIO, Seq C = Product, Seq D = AI/ML.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added Sumble FindPeople as Fallback 1 (before Apify) | Apollo was returning < 10 results for smaller companies; Sumble fills the gap without Apify scraping |
| (prior) | Added CTD Warm Path Cross-Reference (three-tier system) | Prospects reachable via a You.com employee connector were being cold-enrolled without flagging the warm intro option |
| (prior) | Added LinkedIn URL enrichment prep (Step 3.1b) | Apollo bulk match returns higher-confidence enrichment when LinkedIn URL is provided as the primary key |
| (prior) | Added `sequence_no_email: true` enrollment for contacts without verified email | Contacts without email were being discarded; they still receive LinkedIn/call/action touches |
| (prior) | Added SFDC Contact Dedup pre-Step 3.2 | Prospects already in SF with activity history were being cold-enrolled without flagging prior engagement |
