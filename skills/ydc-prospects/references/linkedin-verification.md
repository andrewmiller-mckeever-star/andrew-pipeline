# LinkedIn Company Page URL Verification (Required for Apify Fallback)

Before running the Apify scraper, you MUST verify the correct LinkedIn company page URL. LinkedIn company slugs often differ from the company name (e.g., Plaid's page is `/company/plaid-/` with a trailing hyphen, not `/company/plaid/`). Using the wrong URL will return 0 results.

**Verification Steps:**
1. Web search for "{Company Name} LinkedIn" (e.g., "Plaid LinkedIn")
2. The top result should be the company's LinkedIn page
3. Copy the exact URL slug from the search result
4. Confirm the URL follows the pattern: `https://www.linkedin.com/company/{exact-slug}/`

Do NOT guess or construct the LinkedIn URL from the company name. Always verify via search.
