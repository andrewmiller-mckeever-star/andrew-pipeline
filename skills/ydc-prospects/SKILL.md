---
name: ydc-prospects
description: Discovers and enriches Director+ prospects at target companies for You.com whale account pipeline. Uses Apollo.io as primary method: people search via apollo_mixed_people_api_search then bulk email enrichment via apollo_people_bulk_match in batches of 10. Falls back to Apify LinkedIn scraper if Apollo returns fewer than 10 Director+ results or less than 50% email coverage. Filters for Engineering, AI/ML, Data Science, Product, Strategy, DevRel, Security departments at Director, VP, C-suite seniority. Use when user says "find prospects at [company]", "prospect search for [company]", "discover contacts", "apollo search", "Step 3", or within a full pipeline run.
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

Sequence assignment maps to: Seq A = Engineering, Seq B = Exec/CTO/CIO, Seq C = Product, Seq D = AI/ML.
