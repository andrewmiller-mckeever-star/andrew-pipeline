# LinkedIn API Configuration (Apify Fallback)

**Recommended Provider:** Apify

**Actor:** HarvestAPI LinkedIn Company Employees Scraper (harvestapi/linkedin-company-employees)
- URL: https://apify.com/harvestapi/linkedin-company-employees
- Takes a company LinkedIn URL OR company name as input (finds the company automatically)
- Filters by seniority level, job title, location, department, and industry
- Built-in email finder mode (optional, enabled per run)
- No LinkedIn cookies or login required. Cannot get your LinkedIn account banned.
- Exports CSV, JSON, XLS
- Has a full REST API for automation

**API Token:** apify_api_HgxYw0zF8pG3V25y3N4l2T3BA1TLUe4rhdkW

**Scraping Mode:** Always use "Full + email search" mode for our pipeline. This returns full profile data (name, title, work history, education, skills) plus attempts to find verified email addresses.

**Default Filters to Apply:**
- Seniority: Director, VP, SVP, C-Suite
- Job title keywords: "Director", "VP", "Vice President", "Head", "Chief", "SVP", "Senior Vice President"
- Departments of interest: Engineering, AI/ML, Data Science, Product, Strategy, Developer Relations, Security/Compliance, IT

**Processing Mode:**
- For 1-10 companies: use "All at once" mode
- For 10+ companies: use "One by one" mode ($0.02 start fee per company)
- LinkedIn search returns max 2,500 profiles per query. If a large company has more, split by location or department.

**Cost Estimate (Full + email search mode at $12 per 1,000 profiles):**
- Per account (~50 Director+ profiles): ~$0.60
- 10 whale accounts: ~$6 total
- Platform fee: ~$30/month (includes compute credits)

**API Call Example:**

IMPORTANT: The correct input field is `"companies"` (an array of URLs), NOT `"url"` (a string). Using `"url"` will silently return 0 results. The max items field is `"maxItems"`, NOT `"count"`. The `"cookie"` field is not needed and should be omitted.

```
POST https://api.apify.com/v2/acts/harvestapi~linkedin-company-employees/runs
Authorization: Bearer apify_api_HgxYw0zF8pG3V25y3N4l2T3BA1TLUe4rhdkW
Content-Type: application/json

{
  "companies": ["https://www.linkedin.com/company/{verified-slug}/"],
  "maxItems": 100,
  "title": "Director,Vice President,VP,SVP,Head,Chief,CTO,CIO,CPO",
  "emailFinder": true,
  "scrapeCompanyDetails": true
}
```

NOTE: Always verify the LinkedIn company URL slug via web search before using it (see "LinkedIn Company Page URL Verification" above). Do NOT guess the slug from the company name.

**Retrieving Results:**
After a run completes, fetch results from the dataset:
```
GET https://api.apify.com/v2/actor-runs/{runId}/dataset/items?format=csv
Authorization: Bearer apify_api_HgxYw0zF8pG3V25y3N4l2T3BA1TLUe4rhdkW
```

**Usage Notes:**
- No LinkedIn cookies or login required
- Bulk processing supports up to 1,000 companies per run (in "One by one" mode)
- Email finder does not guarantee 100% email coverage. Some profiles will return without emails. This is expected.
- If email coverage is low for a specific account, consider supplementing with Hunter.io (hunter.io) domain search as a fallback
- Email deliverability claimed >99%
