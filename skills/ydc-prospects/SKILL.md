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

### Step 3.2: Enrich Top Prospects

Use `apollo_people_bulk_match` in batches of 10:
- Pass: first_name, last_name, organization_name, domain
- Returns: verified emails, phone numbers, work history, LinkedIn URLs
- Consumes ~1 credit per person (~498K credits available, effectively unlimited)

## SFDC Contact Dedup (Pre-Step 3.2)

Before enriching prospects, cross-reference the Apollo search results against the Salesforce contact list from Step 1.2 (CRM Intelligence Brief, "Existing Contacts in SF" section). For each prospect:
- If the prospect is already in SF WITH activity history: FLAG as previously contacted. Include in the prospect list but note "Prior SF engagement" so Step 4 can adjust outreach tone.
- If the prospect is in SF but has ZERO activity: safe to include as normal cold prospect.
- If the prospect appeared in a [Gong In] reply (from CRM Intelligence Brief "Prospect Replies" section): FLAG as warm path. This prospect should NOT receive cold outreach. Route to warm follow-up instead.
- If the prospect was touched by an Apollo sequence (from "Outbound Sequences Already Run" section): FLAG as already sequenced. Avoid re-enrolling in the same or similar sequence.

## Fallback: Apify LinkedIn Scraper

Trigger if: Apollo returns < 10 Director+ results OR email coverage < 50% OR Apollo unavailable.

See references/apify-config.md for full API setup.

**REQUIRED: Verify LinkedIn URL slug before running Apify** (see references/linkedin-verification.md).

## Prospect Filtering & Prioritization

After enrichment, select and prioritize for sequence assignment:
- Primary: VP and Director level in Engineering, AI/ML, Product, Strategy, DevRel, Security
- Secondary: 1-2 manager-level only as last resort when VP/Director exhausted
- Contact cap: 5 per sequence (20 total across 4 sequences)
- Priority order: (1) title relevance, (2) verified email, (3) direct use case alignment
- Drop contacts without verified emails first when over cap

## Output

Deliver a prospect list with:
- Name, Title, Email (verified/unverified flag), LinkedIn URL, Seniority, Department
- Proposed sequence assignment (A/B/C/D) based on title/department
- Flag no-email contacts for manual LinkedIn outreach
- `warm_intro` (boolean): set to true by Step 3.5 if this contact has a "Strong Chance to Connect" path in CTD
- `connector_name` (string): populated by Step 3.5 with the name of the person who can make the intro
- `ctd_path_strength` (string): "strong" or null, populated by Step 3.5

Note: warm_intro fields are populated AFTER Step 3 by Step 3.5 (CTD warm intro discovery). Contacts flagged as warm_intro=true get priority consideration in sequence assignment.

Sequence assignment maps to: Seq A = Engineering, Seq B = Exec/CTO/CIO, Seq C = Product, Seq D = AI/ML.
