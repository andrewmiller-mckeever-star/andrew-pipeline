---
name: ydc-usage-report
description: >-
  Usage report for Andrew's owned You.com API accounts. Pulls Product_User__c records
  from Salesforce via two paths: (1) users whose Account is owned by Andrew, (2) users
  whose email domain matches any of Andrew's accounts even if not yet linked. Shows
  current API usage, daily run rate, trend direction, and new signups in the last 7 or
  30 days. Use when user says "usage report", "run usage report", "show me usage",
  "api usage for my accounts", "who's using my accounts", "new users", "new signups",
  "usage for [company]", "run rate", or "how is [company] using the API".
---

# YDC: Usage Report

## Purpose

Pull a real-time view of API usage across all accounts Andrew owns in Salesforce.
Combines two data paths so nothing is missed:

- **Path A — Linked:** `Product_User__c` records where `Account__r.OwnerId = SFDC_USER_ID`
- **Path B — Domain match:** `Product_User__c` records where `Domain__c` matches any domain from Andrew's accounts, but `Account__c` is null (not yet linked in SFDC)

## Salesforce Connection

Uses the Salesforce MCP (`mcp__Salesforce_DX__run_soql_query`).
Org: `andrew.miller-mckeever@you.com`
AE Salesforce User ID: `005Vq000009j4ezIAA` (from ae-config.md `SFDC_USER_ID`)

---

## Invocation Variants

| What user says | What to run |
|---|---|
| "usage report" / "run usage report" | Full report, all accounts, 30-day window |
| "usage report 7 days" | Full report with 7-day window highlighted |
| "new users" / "new signups" | New users section only (last 30d + last 7d) |
| "usage for [Company]" | Single-account deep dive |
| "who's using the API" / "show me usage" | Full report |
| "run rate for [Company]" | Single-account run rate + trend |

---

## Procedure

### Step 1: Run queries in parallel

Run all four queries simultaneously.

**Query 1 — Linked account users (Path A)**
```sql
SELECT Email__c, Domain__c, Account__r.Name, Account__c,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       API_Calls_per_User_All_Time__c, Days_Active_Last_7_Days__c,
       Email_Free_Provider__c, Source_type__c
FROM Product_User__c
WHERE Account__r.OwnerId = '005Vq000009j4ezIAA'
ORDER BY API_Calls_Last_30_Days__c DESC NULLS LAST
LIMIT 200
```

**Query 2 — Domain-matched unlinked users (Path B)**
```sql
SELECT Email__c, Domain__c, Account__c,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       API_Calls_per_User_All_Time__c, Days_Active_Last_7_Days__c,
       Email_Free_Provider__c, Source_type__c
FROM Product_User__c
WHERE Domain__c IN (
  SELECT Domain__c FROM Account
  WHERE OwnerId = '005Vq000009j4ezIAA'
  AND Domain__c != null
)
AND Account__c = null
AND Email_Free_Provider__c = false
ORDER BY API_Calls_Last_30_Days__c DESC NULLS LAST
LIMIT 200
```

**Query 3 — New signups last 30 days (Path A + B)**
```sql
SELECT Email__c, Domain__c, Account__r.Name,
       Signup_Date__c, API_Key_Created_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       First_API_Call_Date__c, Email_Free_Provider__c, Source_type__c
FROM Product_User__c
WHERE Signup_Date__c = LAST_N_DAYS:30
AND Email_Free_Provider__c = false
AND (
  Account__r.OwnerId = '005Vq000009j4ezIAA'
  OR Domain__c IN (
    SELECT Domain__c FROM Account
    WHERE OwnerId = '005Vq000009j4ezIAA'
    AND Domain__c != null
  )
)
ORDER BY Signup_Date__c DESC
LIMIT 100
```

**Query 4 — New signups last 7 days (same filter, tighter window)**
```sql
SELECT Email__c, Domain__c, Account__r.Name,
       Signup_Date__c, API_Key_Created_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       First_API_Call_Date__c, Email_Free_Provider__c, Source_type__c
FROM Product_User__c
WHERE Signup_Date__c = LAST_N_DAYS:7
AND Email_Free_Provider__c = false
AND (
  Account__r.OwnerId = '005Vq000009j4ezIAA'
  OR Domain__c IN (
    SELECT Domain__c FROM Account
    WHERE OwnerId = '005Vq000009j4ezIAA'
    AND Domain__c != null
  )
)
ORDER BY Signup_Date__c DESC
LIMIT 100
```

---

### Step 2: Merge and group

1. Combine Query 1 + Query 2 results. Deduplicate by `Email__c`.
2. Group records by domain → account name. For Path B records with no account name, use the domain as the label and mark with `*` (domain match, not yet linked in SFDC).
3. For each account/domain group, aggregate:
   - `total_users` — count of Product_User records
   - `calls_30d` — SUM of `API_Calls_Last_30_Days__c`
   - `calls_7d` — SUM of `API_Calls_Last_7_Days__c`
   - `daily_rate_30d` — `calls_30d / 30` (round to 1 decimal)
   - `daily_rate_7d` — `calls_7d / 7` (round to 1 decimal)
   - `trend` — compare daily rates: if `daily_rate_7d > daily_rate_30d * 1.1` → ↑ Growing; if `< 0.9` → ↓ Declining; else → → Flat
   - `last_active` — MAX of `Last_API_Call_Date__c` across users in group
   - `first_seen` — MIN of `First_API_Call_Date__c`
4. Sort groups by `calls_30d` descending.

---

### Step 3: Format the report

Print the full report in plain text. No markdown tables in the terminal output — use padded columns.

```
═══════════════════════════════════════════════════════════════
YDC USAGE REPORT  |  Andrew Miller-McKeever  |  {today's date}
═══════════════════════════════════════════════════════════════

MY ACCOUNTS — API USAGE ({N} accounts, {N} users)
Sorted by 30-day volume  |  * = domain match, not yet linked in SFDC

Account                  Domain               Users  30d Calls      Daily (30d)  Daily (7d)   Trend       Last Active
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{Account Name}           {domain}             {N}    {###,###,###}  {###K/day}   {###K/day}   ↑ Growing   {date}
{Account Name}*          {domain}             {N}    {###,###,###}  {###K/day}   {###K/day}   → Flat       {date}
...

ACCOUNTS WITH NO USAGE (linked but 0 calls in last 30 days)
{Account Name}  |  Last active: {date or "never"}
...

═══════════════════════════════════════════════════════════════
NEW SIGNUPS — LAST 7 DAYS ({N} users)

Email                         Domain              Account Match          Signed Up   First Call    30d Calls
────────────────────────────────────────────────────────────────────────────────────────────────────────────
{email}                       {domain}            {account or "—"}       {date}      {date}        {###}
...

NEW SIGNUPS — LAST 30 DAYS ({N} users, showing new ones beyond 7-day list)

Email                         Domain              Account Match          Signed Up   30d Calls
...

═══════════════════════════════════════════════════════════════
SUMMARY

Total 30-day API calls across all accounts:  {###,###,###}
Total 7-day API calls:                       {###,###,###}
Active accounts (calls > 0 last 30d):        {N} of {N}
New signups last 7 days:                     {N}
New signups last 30 days:                    {N}
Accounts with no usage last 30 days:         {N}
```

---

## Number Formatting Rules

Always abbreviate large numbers for readability:
- < 1,000 → show as-is: `842`
- 1,000–999,999 → `K`: `45.2K`
- 1,000,000–999,999,999 → `M`: `577.2M`
- 1,000,000,000+ → `B`: `9.4B`

Daily rate format: `19.2M/day`, `65K/day`, `842/day`

---

## Single-Account Deep Dive

When user asks about a specific company (e.g., "usage for Windsurf"), run a targeted version:

```sql
SELECT Email__c, Domain__c, Signup_Date__c, First_API_Call_Date__c,
       Last_API_Call_Date__c, API_Calls_Last_7_Days__c,
       API_Calls_Last_30_Days__c, API_Calls_per_User_All_Time__c,
       Days_Active_Last_7_Days__c, Source_type__c
FROM Product_User__c
WHERE Domain__c = '{domain}'
ORDER BY API_Calls_Last_30_Days__c DESC NULLS LAST
```

Show each individual user, their usage, signup date, and last active date.
Useful for renewal conversations and expansion plays.

---

## Salesforce Notes

- `LAST_N_DAYS:30` and `LAST_N_DAYS:7` are native SOQL date literals — no manual date math needed.
- `Domain__c` on `Product_User__c` is a formula field that strips the domain from `Email__c`. It matches the `Domain__c` formula field on `Account`.
- `Email_Free_Provider__c = false` filters out gmail, yahoo, hotmail, outlook personal addresses. Always apply this on domain-match and new signup queries to avoid noise.
- The subquery in `WHERE Domain__c IN (SELECT Domain__c FROM Account WHERE ...)` is valid SOQL semi-join syntax.
- If query hits governor limits (200+ records per path), add `AND API_Calls_Last_30_Days__c > 0` to trim inactive users first.

---

## Compute Notes

- Run all 4 queries in parallel using subagents.
- Merge and format in the main thread.
- This skill does not write to Salesforce. Read-only.
- Use Sonnet for the data queries. Opus is not needed — this is aggregation, not synthesis.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added Path B: domain-matched unlinked users (Account__c = null) | Users whose email domain matched an Andrew-owned account but weren't linked in SFDC were invisible in Path A |
| (prior) | Added trend direction (↑ Growing / → Flat / ↓ Declining) using 7d vs 30d daily rate comparison | Raw call counts without trend direction made it hard to distinguish accelerating vs declining accounts |
| (prior) | Added invocation variants table (single account deep dive, new signups only, run rate) | Users were asking "usage for Windsurf" but the skill only ran a full book-of-business report |
| (prior) | Added number formatting rules (K/M/B abbreviations) | Large raw numbers (e.g., 577,234,891) were unreadable in terminal output |
