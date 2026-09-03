---
name: ydc-usage-monitor
description: >-
  Scans priority Salesforce accounts (Tier 1 and Tier 2.A) assigned to the
  current user, pulls Product_User__c API usage data, detects actionable
  signals (new activity, growth, multi-threading, sales gaps, risk), and
  produces a prioritized outreach list ranked by the Priority Lens. Also
  supports named account lookups — e.g. "check usage for Toggle AI". Use this
  skill whenever the user says "check usage", "usage monitor", "usage report",
  "run usage scan", "who's using the API", "which accounts are growing",
  "find accounts with no opp", "who should I reach out to based on usage",
  "check for stalled accounts", "single-threaded risk", "usage signals",
  "how is [company] using the API", "check usage for [account name]",
  or asks about API consumption across their book of business.
---

# YDC: Usage Monitor

Scans Tier 1 and Tier 2.A accounts owned by the current rep, pulls
`Product_User__c` API usage data, detects six categories of actionable
signal, and ranks accounts by the Priority Lens.

**Core principle:** Every signal implies a specific action.
- New → Reach out
- Growing → Expand
- Multi-user → Sell
- Dropping → Intervene

---

## MCP Connection

- **Tool:** `mcp__Salesforce_DX__run_soql_query`
- **Org:** `andrew.miller-mckeever@you.com`
- **Default user:** `andrew.miller-mckeever@you.com` (User ID: `{SFDC_USER_ID}`)

Run all independent queries in parallel.

---

## Step 0 — Resolve mode, owner, and tier filter

First, determine the **run mode** from the prompt:

### Mode A: Named account(s)

Triggered when the prompt names a specific company — e.g. "check usage for Toggle AI", "usage for Stripe and Notion", "how is Acme using the API".

- Extract the account name(s) from the prompt.
- Look each one up by name:

```sql
SELECT Id, Name, Account_Tier__c, Account_Score__c,
       Total_Revenue_Closed_Won__c, Count_of_Open_Opportunities__c
FROM Account
WHERE Name LIKE '%Toggle AI%'
LIMIT 5
```

- If multiple matches, list them and ask the user to confirm before proceeding.
- If no match, report the error and continue with any remaining accounts.
- Collect the resolved account records into `{ACCOUNT_LIST}` and skip Step 1 entirely — go straight to Step 2.
- Note "Named account lookup" in the report header. Owner filter does not apply.

### Mode B: Owner book-of-business scan (default)

Triggered when no specific account name is given.

**Owner** — check the prompt:

- **No owner specified** → use default ID `{SFDC_USER_ID}`
- **Raw Salesforce ID provided** (starts with `005`) → use it directly
- **Name provided** (e.g. "check usage for Sarah") → look up by name:

```sql
SELECT Id, Name, Username
FROM User
WHERE IsActive = true
AND (Name LIKE '%Sarah%' OR Username LIKE '%sarah%')
ORDER BY Name
LIMIT 5
```

If multiple matches, list them and ask the user to confirm. If no match, report and stop.

Store as `{OWNER_ID}` / `{OWNER_NAME}`. Note the owner name in the report header.

**Tier filter:**

- **Default** → `AND Account_Tier__c IN ('1. TARGET ACCOUNT', '2.A', 'Tier 1', 'Tier 2')`
- **"all accounts", "no filter", "all my accounts"** → omit tier filter. Note "All accounts (no tier filter)" in header. ⚠️ Warn the user if the result set exceeds 40 accounts.

Store as `{TIER_FILTER}`.

---

## Step 1 — Fetch priority accounts

Pull only Tier 1 and Tier 2.A accounts owned by the resolved user.
Running against the full org would flood the output with noise.

```sql
SELECT Id, Name, Account_Tier__c, Account_Score__c,
       Total_Revenue_Closed_Won__c, Count_of_Open_Opportunities__c
FROM Account
WHERE OwnerId = '{OWNER_ID}'
{TIER_FILTER}
ORDER BY Account_Score__c DESC NULLS LAST
```

If 0 results, also query `WHERE Executive_Sponsor__c = '{OWNER_ID}'` (with the same `{TIER_FILTER}` applied).

---

## Step 2 — Fetch usage + recent sales activity per account (run in parallel)

For each account, run these two queries simultaneously:

**Usage (Product_User__c):**
```sql
SELECT Email__c,
       API_Calls_Last_7_Days__c,
       API_Calls_Last_30_Days__c,
       API_Calls_per_User_All_Time__c,
       First_API_Call_Date__c,
       Last_API_Call_Date__c,
       Signup_Date__c
FROM Product_User__c
WHERE Account__c = '{ACCOUNT_ID}'
ORDER BY API_Calls_Last_30_Days__c DESC NULLS LAST
```

**Recent sales activity:**
```sql
SELECT ActivityDate FROM Task
WHERE AccountId = '{ACCOUNT_ID}'
AND ActivityDate >= LAST_N_DAYS:30
ORDER BY ActivityDate DESC LIMIT 1
```

**Compute per account:**

| Variable | Calculation |
|----------|-------------|
| `total_7d` | SUM(API_Calls_Last_7_Days__c) |
| `total_30d` | SUM(API_Calls_Last_30_Days__c) |
| `total_alltime` | SUM(API_Calls_per_User_All_Time__c) |
| `weekly_avg` | total_30d ÷ 4 |
| `active_users_30d` | COUNT rows where API_Calls_Last_30_Days__c > 0 |
| `first_call_ever` | MIN(First_API_Call_Date__c) across all users |
| `last_call_date` | MAX(Last_API_Call_Date__c) |
| `days_dark` | today − last_call_date (null if never called) |
| `new_users_30d` | COUNT rows where First_API_Call_Date__c within 30 days |
| `has_recent_activity` | true if Task query returned any row |
| `is_customer` | `Total_Revenue_Closed_Won__c > 0` |

---

## Step 3 — Detect signals

An account can fire multiple signals. Evaluate all six categories for
every account. Each signal maps to exactly one recommended action.

---

### 1. NEW ACTIVITY → Reach out

These accounts just became active — timing matters, don't wait.

| Sub-signal | Condition |
|------------|-----------|
| First activation | `first_call_ever` within 30 days AND `total_alltime > 0` |
| Re-activation | `total_7d > 0` AND `days_dark > 30` before this week |

---

### 2. GROWTH → Expand

Usage is accelerating — they're finding value and scaling up.

| Sub-signal | Condition |
|------------|-----------|
| Meaningful spike | `total_7d > weekly_avg × 1.5` (50%+ above average week) |
| Notable adoption | `total_30d > 10,000` (real production-level usage) |

---

### 3. MULTI-THREADING → Sell (prospect) / Expand (customer)

For **prospects**, multiple active API users is a strong buying signal — different
teams or use cases are evaluating independently, which broadens the deal and
increases urgency. Each additional user is a potential champion or budget holder.

For **customers**, multi-user activity is an expansion signal, not a "sell" signal
— they're already bought in, so the question is contract scope, not initial close.

| Sub-signal | Condition |
|------------|-----------|
| Multi-user active | `active_users_30d >= 2` |
| New user joins active account | `new_users_30d > 0` AND `active_users_30d >= 2` |

---

### 4. EXPANSION SIGNALS → Sell (prospect) / Expand (customer)

Usage is spreading beyond its original footprint.

| Sub-signal | Condition |
|------------|-----------|
| Broad adoption | `active_users_30d >= 3` |
| New user on established account | `new_users_30d > 0` AND `total_30d > 1,000` |

---

### 5. SALES GAPS → Pipeline

Real API usage with no commercial motion. Framing depends on customer status:
- **Prospect** → free value being extracted, easiest pipeline conversation to justify
- **Customer** → expansion or renewal gap, usage growing beyond current contract

| Sub-signal | Condition |
|------------|-----------|
| Usage but no open opp | `total_30d > 100` AND `Count_of_Open_Opportunities__c = 0` |
| Usage but no recent sales activity | `total_30d > 100` AND `has_recent_activity = false` |

---

### 6. RISK SIGNALS → Intervene

Something has changed — act before it's too late.

| Sub-signal | Condition | Applies to |
|------------|-----------|------------|
| Usage drop | `total_7d < weekly_avg × 0.5` AND `total_30d > 500` | Both |
| Single-threaded | `active_users_30d == 1` AND `total_30d > 1,000` AND `is_customer = false` | Prospects only |
| Stalled evaluation | `new_users_30d > 0` AND `total_7d < 100` AND `total_30d < 500` AND `is_customer = false` | Prospects only |

**Suppress for recently closed customers:**

```sql
SELECT AccountId FROM Opportunity
WHERE AccountId IN ('{ACCOUNT_IDS}')
AND StageName = 'Closed Won'
AND CloseDate >= LAST_N_DAYS:60
```

Suppress "Sales Gap: no recent activity" when `recently_closed = true`.

---

## Step 4 — Apply Priority Lens and rank

| Bucket | Rule |
|--------|------|
| 🔴 **Act Now** | Prospect + New Activity (any tier) · Customer + any Risk signal · Customer + Sales Gap AND `has_recent_activity = false` |
| 🟠 **Act This Week** | Tier 1 Prospect + Growth or Multi-Threading · Customer + Sales Gap AND `has_recent_activity = true` · Any Prospect + Stalled eval · Tier 2.A Prospect + New Activity |
| 🟡 **Expand** | Customer + Growth · Customer + Multi-Threading or Expansion · Any Prospect + Expansion (not already higher) |
| 🔵 **Monitor** | Any remaining signal not covered above |
| ⚫ **No signal** | No usage data, never activated, or no product users on record |

Within each bucket, sort by Account_Score__c descending.

---

## Step 5 — Output

Print directly in chat. No file needed.

```
## Usage Monitor — {date}
Owner: Andrew Miller-McKeever
Scanned {N} priority accounts · {T1} Tier 1 · {T2A} Tier 2.A

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 ACT NOW ({count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**{Account Name}** · {Tier} · Score {N} · {💰 Customer OR 🔍 Prospect}
Signal: {signal name(s)}
Usage: {total_7d:,} calls (7d) · {total_30d:,} (30d) · {active_users_30d} active users
{If New Activity: "First call: {date}" OR "Re-activated after {days_dark} days dark"}
{If Growth: "Weekly avg: {weekly_avg:,} → this week: {total_7d:,} (+{pct}%)"}
{If Multi-user: list active user emails}
Open opp: {name + stage OR "None"}
→ **{Reach out / Expand / Sell / Intervene}:** {1 specific sentence}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟠 HIGH ({count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[same format, slightly condensed]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 EXPAND ({count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[condensed — account name, signal, usage, one-line action]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 RISK / SAVE ({count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Account | Signal | Usage (30d) | Detail | Action |
|---------|--------|-------------|--------|--------|
| {name} | {signal} | {n:,} | {specific detail} | Intervene |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚫ NO SIGNAL ({count})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{account names only}
```

---

## Edge cases

**No product users on record** → List under ⚫. May be using an org-level API key. Suggest checking the account's Usage tab in Salesforce directly.

**Account_Tier__c null or unexpected** → Skip silently.

**SOQL fails for one account** → Note the error inline and continue.

**More than 30 priority accounts** → Process Tier 1 fully first, then Tier 2.A. Cap at 40 total. Note how many were skipped.

---

## Follow-on actions

After the report, offer:
- **"Run the pipeline for [Account]"** → `ydc-pipeline`
- **"Check Salesforce for [Account]"** → `ydc-salesforce`
- **"Find warm intros into [Account]"** → `ydc-ctd-warmintro`
- **"Run usage outreach"** → `ydc-usage-outreach`

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added Mode A: Named account lookup (skip Step 1 if specific account named) | Running the full book-of-business scan to look up one account was slow and noisy |
| (prior) | Added six signal categories with Priority Lens bucketing (Act Now / Act This Week / Expand / Monitor) | Raw usage data without prioritization made it unclear where to focus first |
| (prior) | Added `recently_closed` suppression for Sales Gap signal | Accounts that just closed were triggering "no recent sales activity" signals incorrectly |
| (prior) | Added single-threaded risk signal | High-value accounts with only one active user are a churn risk; needed its own detection |
| (prior) | Added stalled evaluation signal | Accounts with new signups but near-zero calls represent failed evals; different action than "no signal" |
