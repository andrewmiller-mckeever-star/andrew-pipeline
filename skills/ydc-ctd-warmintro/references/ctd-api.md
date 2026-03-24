# Connect The Dots (CTD) User API Reference

## Authentication

Every request requires two headers:

```
ctd-api-key: uak_PKSMqLtz-sD_foOMHDJ5ONNHa0u9RhY3
ctd-client-id: ryan@you.com
```

## Base URL

```
https://api.ctd.ai
```

---

## Endpoints

### 1. GET /user/atc-paths-api/public/v1/company

Returns company details including CTD reachability score.

**Query params (one required):**
- `company_domain` (string): Company primary domain (e.g. "salesforce.com")
- `company_linkedin_url` (string, URI): LinkedIn company URL

**Response fields:**
- `name` (string)
- `domains` (array of strings)
- `ctd_url` (string): Link to company in CTD app
- `linkedin_url` (string)
- `num_employees` (integer)
- `num_employees_range` (string)
- `industry` (string)
- `ctd_score` (number): Raw score
- `ctd_score_scaled` (number): Normalized score
- `ctd_score_label` (string): "Strong Chance to Connect", "Good Chance", "Some Chance", etc.
- `stage` (string)

---

### 2. GET /user/atc-paths-api/public/v1/people

Returns employees at a company reachable through your network.

**Query params:**
- `company_domain` (string) OR `company_linkedin_url` (string, URI) - one required
- `degree` (array): Filter by connection degree. Values: "first", "second", "third"
- `relationship_strength` (array): Filter by score. Values: 1, 2, 3
- `is_target_persona` (boolean): Only target personas
- `target_title` (array): Job title substring filters
- `target_seniority` (array): Values: "Owner", "CEO", "CXO", "Partner", "VP", "Manager", "Director", "Principal", "Senior", "EA", "Board", "Investor", "Advisor", "Founder", "Consultant", "Entry", "Unpaid", "Training"
- `target_function` (array): Values: "Travel", "Media", "Customer Success", "Support", "Education", "Information Technology", "Engineering", "Finance", "Health", "Human Resources", "Legal", "Product", "Operations", "Design", "Public Relations", "Real Estate", "Sales"
- `path_stage` (array): Values: "Not started", "To do", "Approaching Connector", "Approaching Target", "Successful", "Unsuccessful", "Not relevant", "Bad data"
- `page_size` (integer, max 40): Items per page
- `start_item` (integer, default 1): Pagination offset (1-based)

**Response: PublicPeopleResponse**
Array of PublicPerson objects:
- `name` (string)
- `linkedin_id` (string)
- `title` (string)
- `company_name` (string)
- `location` (string)
- `is_target_person` (boolean)
- `company_ctd_url` (string)
- `person_ctd_url` (string)
- `ctd_score` (number)
- `ctd_score_scaled` (number)
- `ctd_score_label` (string): "Strong Chance to Connect", "Good Chance", etc.
- `company_linkedin_url` (string)

---

### 3. GET /user/atc-paths-api/public/v1/paths

Returns connection paths from your network to a company or person.

**Query params:**
- `company_domain` (string) OR `company_linkedin_url` (string, URI) - optional
- `person_linkedin_url` (string, URI) - optional (for person-specific paths)
- `degree` (array): "first", "second", "third"
- `path_relationship_strength` (array): "weak", "medium", "strong"
- `path_relationship_type` (string): "deterministic", "probabilistic"
- `is_target_persona` (boolean)
- `target_title` (array)
- `target_seniority` (array)
- `target_function` (array)
- `path_stage` (array)
- `page_size` (integer, max 40)
- `start_item` (integer, default 1)

**Response: PublicPathsResponse**
Array of path objects:
- `stage` (string)
- `degree` (string): "first", "second", "third"
- `path_relationship_strength` (number)
- `path_relationship_strength_label` (string): "strong", "medium", "weak"
- `path_relationship_type` (string): "deterministic", "probabilistic"
- `nodes` (array): Path node objects
  - `id` (string)
  - `name` (string)
  - `linkedin_id` (string)
  - `title` (string)
  - `company_name` (string)
  - `connector_type` (string)
  - `tier` (string)
  - `location` (string)
  - `is_target_person` (boolean)
  - `ctd_url` (string)
- `edges` (array): Connection objects
  - `from` (string)
  - `to` (string)
  - `relationship_type` (string)
  - `overlapping_score` (number)
  - `relationship_strength` (number)
  - `final_relationship_strength` (number)
  - `overlapping_message` (string): Human-readable shared context

---

### 4. GET /user/atc-paths-api/public/v1/paths/connector

Returns paths through a specific connector (person in your network).

**Query params:**
- `connector_linkedin_url` (string, URI) OR `connector_email` (string, email) - one required
- `degree` (array): "first", "second", "third"
- `path_relationship_strength` (array): "weak", "medium", "strong"
- `path_relationship_type` (string): "deterministic", "probabilistic"
- `is_target_persona` (boolean)
- `target_title`, `target_seniority`, `target_function`, `path_stage` (arrays)
- `page_size` (integer, max 40)
- `start_item` (integer, default 1)

**Response:** Same as /paths (PublicPathsResponse)

---

### 5. GET /user/atc-paths-api/public/v1/paths/search

NLP-powered natural language path search.

**Query params:**
- `search_query` (string, required): Natural language query (e.g. "VP Engineering at Salesforce")

**Response:**
- `explanation` (string): NLP-generated explanation of results
- `paths` (array): Matching path objects (same structure as /paths)

---

### 6. GET /user/notifications-api/public/job-changes/contacts

Job change notifications for first-degree connections.

**Query params:**
- `start_item` (integer, default 1)
- `end_item` (integer)

**Response: JobChangesResponse**
Array of JobChange objects:
- `created_at` (date-time)
- `type` (enum): "joined_company", "left_company", "switched_company", "promoted"
- `job_change_details`:
  - `who`: name, relationship_score, relationship_score_label, linkedin_id, title, company_name, company_ctd_url, person_ctd_url, relationship_type (array), overlapping_message
  - `new_roles` (array): title, date_from, date_to, company_ctd_url, company_name
  - `old_roles` (array): same structure

---

## Error Codes

| Code | Message | Action |
|------|---------|--------|
| 400 | Bad request | Check query parameters |
| 403 | Forbidden | API key revoked or expired |
| 404 | Not found | Company/person not in CTD |
| 50.11 | Source account not found | CTD backend issue, email jelena@ctd.ai |
| 500 | Server error | Retry once, then skip |

## Constraints

- `page_size` max: 40
- `start_item` min: 1 (1-based indexing)
- Use company_domain OR company_linkedin_url, not both
- Use connector_linkedin_url OR connector_email, not both

## Swagger Docs

Full interactive API docs: https://app.ctd.ai/backend-api/swagger/user
