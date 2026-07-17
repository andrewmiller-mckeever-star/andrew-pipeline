---
name: ydc-account-ranking
description: >-
  Ranks all of Andrew's Salesforce accounts by likelihood to close. Pulls all ~700 SFDC accounts
  (with parent company data for competitor exclusion), merges Product_User__c API usage data,
  CTD warm intro scores for the top 40, and Slack signals. Scores each account using a weighted
  model and outputs ALL scored accounts to a ranked CSV with per-user API detail. Run weekly
  for a fresh prioritization list. Use when user says "rank my accounts", "account ranking",
  "refresh rankings", "who should I focus on", "run account ranking", or "update my priority list".
---

# YDC: Account Ranking

## Purpose

Score all accounts Andrew owns in Salesforce and output a ranked list for weekly prioritization.
Combines four data sources:

- **SFDC Account Scoring** — pre-computed score, target account flag, company size, tier
- **Product Usage** — API calls and new signups from Product_User__c
- **CTD Network** — warm intro strength to the account domain
- **Slack Signals** — mentions in #esl-api-sales, #api-gtm-team, #sales-team, #sales-target-alerts

Output: `/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/ydc_account_rankings.csv`

**Competitor exclusion is mandatory.** Google subsidiaries (YouTube, Waymo, etc.), Microsoft
subsidiaries (LinkedIn, etc.), and other direct search competitors must never appear in the
output. Tableau and other Salesforce subsidiaries stay in (with a WARNING column) because
procurement goes through Salesforce.

---

## Procedure

### Step 1: Pull all SFDC accounts

**Preferred method:** `sf data query` CLI (authenticated as andrew.miller-mckeever@you.com):

```bash
sf data query \
  --query "SELECT Id, Name, NumberOfEmployees, Website, Industry, OwnerId, Target_Account__c, Account_Tier__c, Tier_Label__c, Account_Score__c, Account_Score_Rationale__c, Parent.Name, (SELECT StageName FROM Opportunities WHERE IsClosed = false LIMIT 1) FROM Account WHERE OwnerId = '005Vq000009j4ezIAA' ORDER BY Account_Score__c DESC NULLS LAST LIMIT 700" \
  --result-format json \
  --target-org andrew.miller-mckeever@you.com \
  2>/dev/null > /tmp/sfdc_raw.json
```

**Fallback method** (if CLI unavailable): `mcp__Salesforce_DX__run_soql_query`:
```sql
SELECT Id, Name, NumberOfEmployees, Website, Industry, OwnerId,
       Target_Account__c, Account_Tier__c, Tier_Label__c,
       Account_Score__c, Account_Score_Rationale__c,
       Parent.Name,
       (SELECT StageName FROM Opportunities WHERE IsClosed = false LIMIT 1)
FROM Account
WHERE OwnerId = '005Vq000009j4ezIAA'
ORDER BY Account_Score__c DESC NULLS LAST
LIMIT 700
```

Parse with Python:

```python
import json, csv

raw = open('/tmp/sfdc_raw.json').read()
# Strip CLI warning lines that break JSON parsing
lines = [l for l in raw.splitlines() if not l.startswith('Warning:')]
data = json.loads('\n'.join(lines))

# Handle both CLI output format and MCP list format
if isinstance(data, dict) and 'result' in data:
    records = data['result'].get('records', [])
elif isinstance(data, list) and isinstance(data[0], str):
    records = json.loads(data[0])
elif isinstance(data, list):
    records = data
else:
    records = data.get('records', [])

with open('/tmp/sfdc_accounts.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Id','Name','Employees','Website','Industry','Target','Tier','TierLabel',
                'Score','Rationale','OppStatus','ParentName'])
    for r in records:
        opps = r.get('Opportunities', {})
        opp_stage = ''
        if opps and opps.get('records'):
            opp_stage = opps['records'][0].get('StageName', '')
        parent = r.get('Parent') or {}
        w.writerow([
            r.get('Id',''), r.get('Name',''),
            r.get('NumberOfEmployees') or 0,
            r.get('Website',''), r.get('Industry',''),
            r.get('Target_Account__c', False),
            r.get('Account_Tier__c',''), r.get('Tier_Label__c',''),
            r.get('Account_Score__c') or 0,
            (r.get('Account_Score_Rationale__c') or '')[:500],
            opp_stage,
            parent.get('Name','') if isinstance(parent, dict) else ''
        ])
print(f"Wrote {len(records)} accounts")
```

---

### Step 2: Pull Product_User__c usage data (run in parallel with Step 1)

Run all three queries. **Note:** if using `sf data query` CLI, run them sequentially (not with
`&` background) — parallel execution causes one query to cancel when another fails.

**Query A — Linked users:**
```sql
SELECT Email__c, Domain__c, Account__r.Name, Account__c,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       Email_Free_Provider__c
FROM Product_User__c
WHERE Account__r.OwnerId = '005Vq000009j4ezIAA'
AND Email_Free_Provider__c = false
ORDER BY API_Calls_Last_30_Days__c DESC NULLS LAST
LIMIT 200
```

**Query B — New signups last 7 days:**
```sql
SELECT Email__c, Domain__c, Account__r.Name,
       Signup_Date__c, API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       First_API_Call_Date__c, Email_Free_Provider__c
FROM Product_User__c
WHERE Signup_Date__c = LAST_N_DAYS:7
AND Email_Free_Provider__c = false
AND Account__r.OwnerId = '005Vq000009j4ezIAA'
ORDER BY Signup_Date__c DESC
LIMIT 100
```

**Query C — New signups last 30 days:**
```sql
SELECT Email__c, Domain__c, Account__r.Name,
       Signup_Date__c, API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       First_API_Call_Date__c, Email_Free_Provider__c
FROM Product_User__c
WHERE Signup_Date__c = LAST_N_DAYS:30
AND Email_Free_Provider__c = false
AND Account__r.OwnerId = '005Vq000009j4ezIAA'
ORDER BY Signup_Date__c DESC
LIMIT 100
```

Save each query result to `/tmp/usage_a.json`, `/tmp/usage_b.json`, `/tmp/usage_c.json`
respectively (raw JSON output). The scoring script in Step 3 reads them directly.

---

### Step 3: Score all accounts with Python

Write this script to `/tmp/score_accounts.py` (do NOT use heredoc — write to file to avoid
Python f-string/backslash issues), then run `python3 /tmp/score_accounts.py`:

```python
import json, csv
from collections import defaultdict

# ── COMPETITOR / SUBSIDIARY EXCLUSION ──────────────────────────────────────
COMPETITOR_PARENTS = {
    'google', 'alphabet', 'microsoft', 'meta', 'meta platforms',
    'baidu', 'yandex', 'perplexity', 'brave', 'duckduckgo',
    'exa', 'tavily', 'neeva',
    'salesforce', 'salesforce.com',
}
COMPETITOR_ACCOUNTS = {
    'google', 'alphabet', 'youtube', 'android', 'bing', 'msn',
    'microsoft bing', 'baidu', 'yandex', 'duckduckgo', 'brave',
    'perplexity', 'perplexity ai', 'tavily',
    'deepmind', 'waymo', 'waze',
    # Note: "exa" removed — SFDC has an "EXA" under Uniguest (hospitality tech), not exa.ai
}

# SFDC parent fields known to be wrong — do NOT exclude these accounts
SFDC_BAD_PARENT_DATA = {
    'wilson elser',  # law firm, SFDC incorrectly shows parent=Alphabet
}
def exclusion_reason(name, parent_name):
    n = name.strip().lower()
    p = (parent_name or '').strip().lower()
    if n in SFDC_BAD_PARENT_DATA:
        return None  # known bad SFDC parent data — keep account
    if n in COMPETITOR_ACCOUNTS:
        return 'direct search competitor'
    if p in COMPETITOR_PARENTS:
        return 'subsidiary of search competitor (' + parent_name + ')'
    return None

# ── USAGE AGGREGATION ───────────────────────────────────────────────────────
def load_records(path):
    try:
        d = json.load(open(path))
        return d.get('result', {}).get('records', [])
    except:
        return []

records_a = load_records('/tmp/usage_a.json')
records_b = load_records('/tmp/usage_b.json')
records_c = load_records('/tmp/usage_c.json')

seen = {}
for r in records_a + records_b + records_c:
    email = r.get('Email__c', '')
    if email and email not in seen:
        seen[email] = r

new_7d_emails  = {r.get('Email__c') for r in records_b}
new_30d_emails = {r.get('Email__c') for r in records_c}

by_account = defaultdict(lambda: {'users': [], 'calls_7d': 0, 'calls_30d': 0, 'new_7d': 0, 'new_30d': 0})
for email, r in seen.items():
    acct = (r.get('Account__r') or {}).get('Name') or r.get('Domain__c', 'Unknown')
    c7  = r.get('API_Calls_Last_7_Days__c') or 0
    c30 = r.get('API_Calls_Last_30_Days__c') or 0
    by_account[acct]['users'].append({
        'email': email, 'calls_7d': c7, 'calls_30d': c30,
        'signup_date': r.get('Signup_Date__c', ''),
        'first_call': r.get('First_API_Call_Date__c', ''),
        'last_call': r.get('Last_API_Call_Date__c', '')
    })
    by_account[acct]['calls_7d']  += c7
    by_account[acct]['calls_30d'] += c30
    if email in new_7d_emails:  by_account[acct]['new_7d'] += 1
    if email in new_30d_emails: by_account[acct]['new_30d'] += 1
for acct in by_account:
    by_account[acct]['users'].sort(key=lambda u: u['calls_7d'], reverse=True)

# ── SCORING HELPERS ─────────────────────────────────────────────────────────
def size_score(emp):
    emp = int(emp or 0)
    if emp < 100:    return 20
    if emp < 250:    return 18
    if emp < 500:    return 16
    if emp < 1000:   return 14
    if emp < 2500:   return 12
    if emp < 5000:   return 10
    if emp < 10000:  return 8
    if emp < 25000:  return 6
    if emp < 50000:  return 4
    return 2

def engagement_score(opp_status, rationale):
    pts = 0
    rat = (rationale or '').lower()
    if opp_status: pts += 10
    if any(w in rat for w in ['high fit', 'strong fit', 'strategic']): pts += 5
    if any(w in rat for w in ['medium fit', 'moderate']): pts += 2
    if any(w in rat for w in ['low fit', 'poor fit']): pts -= 3
    return pts

def usage_score(u):
    pts = 0
    if u['calls_7d'] > 0:    pts += 20
    elif u['calls_30d'] > 0: pts += 12
    if u['new_7d'] > 0:      pts += 15
    elif u['new_30d'] > 0:   pts += 8
    return pts

def fmt_num(n):
    n = int(n or 0)
    if n >= 1_000_000_000: return f"{n/1_000_000_000:.1f}B"
    if n >= 1_000_000:     return f"{n/1_000_000:.1f}M"
    if n >= 1_000:         return f"{n/1_000:.1f}K"
    return str(n)

ctd = {}
try:
    ctd = json.load(open('/tmp/ctd_results.json'))
except:
    pass
ctd_pts_map = {"strong": 8, "familiar": 5, "weak": 2, "very weak": 0}

accounts = list(csv.DictReader(open('/tmp/sfdc_accounts.csv')))

excluded = []
scored = []

for a in accounts:
    name        = a['Name']
    parent_name = a.get('ParentName', '')
    excl = exclusion_reason(name, parent_name)

    if excl:
        excluded.append((name, parent_name, excl))
        continue

    sfdc    = float(a.get('Score') or 0)
    target_pts = 28 if str(a.get('Target', '')).lower() == 'true' else 0
    sz      = size_score(a.get('Employees', 0))
    eng     = engagement_score(a.get('OppStatus', ''), a.get('Rationale', ''))
    u       = by_account.get(name, {'calls_7d': 0, 'calls_30d': 0, 'new_7d': 0, 'new_30d': 0, 'users': []})
    u_pts   = usage_score(u)
    ctd_label = (ctd.get(name, {}) or {}).get('ctd_label', 'Not Found')
    c_pts   = ctd_pts_map.get(ctd_label, 0)
    final   = sfdc * 0.40 + target_pts + sz + eng + u_pts + c_pts

    users = u.get('users', [])
    detail_lines = []
    for usr in users[:5]:
        c7, c30 = usr['calls_7d'], usr['calls_30d']
        if c7 > 0 or c30 > 0:
            status = 'ACTIVE' if c7 > 0 else 'SEEN 30D'
            detail_lines.append(usr['email'] + ': ' + status + ' ' + fmt_num(c7) + '/7d, ' + fmt_num(c30) + '/30d')

    if u['calls_7d'] > 0:
        uh = fmt_num(u['calls_7d']) + ' calls this week (' + str(u['new_7d']) + ' new signup' + ('s' if u['new_7d'] != 1 else '') + ')'
    elif u['calls_30d'] > 0:
        uh = fmt_num(u['calls_30d']) + ' calls last 30d (' + str(u['new_30d']) + ' new signup' + ('s' if u['new_30d'] != 1 else '') + ')'
    elif u['new_30d'] > 0:
        uh = str(u['new_30d']) + ' new signup' + ('s' if u['new_30d'] != 1 else '') + ', no calls yet'
    else:
        uh = ''

    scored.append({
        'name': name, 'final': round(final, 1), 'sfdc': sfdc,
        'target': a.get('Target', ''), 'tier': a.get('TierLabel', ''),
        'employees': a.get('Employees', ''), 'industry': a.get('Industry', ''),
        'website': a.get('Website', ''), 'opp': a.get('OppStatus', ''),
        'ctd': ctd_label, 'parent': parent_name,
        'calls_7d': u['calls_7d'], 'calls_30d': u['calls_30d'],
        'new_7d': u['new_7d'], 'new_30d': u['new_30d'],
        'usage_headline': uh,
        'user_detail': '\n'.join(detail_lines),
        'rationale': a.get('Rationale', '')[:300],
        'warning': ''
    })

# Sort by final score
scored.sort(key=lambda x: x['final'], reverse=True)

# Hard-promote active-usage accounts into top 100
top_100_names = {a['name'] for a in scored[:100]}
promoted = []
remaining = []
for a in scored[100:]:
    if a['calls_7d'] > 0 and a['name'] not in top_100_names:
        promoted.append(a)
    else:
        remaining.append(a)
scored = scored[:100] + promoted + remaining

# Write ALL scored accounts
out_path = '/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/ydc_account_rankings.csv'
with open(out_path, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow([
        'Rank', 'Account', 'Final_Score', 'SFDC_Score', 'Target_Account_3x',
        'SFDC_Tier', 'Employees', 'Industry', 'Website', 'Parent_Company',
        'Opp_Status', 'CTD_Network', 'Usage_Headline',
        'Total_Calls_7d', 'Total_Calls_30d', 'New_Signups_7d', 'New_Signups_30d',
        'API_Users_Detail', 'Warning', 'Rationale'
    ])
    for i, a in enumerate(scored, 1):
        w.writerow([
            i, a['name'], a['final'], a['sfdc'],
            'YES (3x)' if str(a['target']).lower() == 'true' else '',
            a['tier'], a['employees'], a['industry'], a['website'],
            a['parent'], a['opp'], a['ctd'], a['usage_headline'],
            a['calls_7d'], a['calls_30d'], a['new_7d'], a['new_30d'],
            a['user_detail'], a['warning'], a['rationale']
        ])

print("Written " + str(len(scored)) + " scored accounts to " + out_path)
print("\nEXCLUDED (" + str(len(excluded)) + " accounts — search competitors/subsidiaries):")
for name, parent, reason in sorted(excluded):
    print("  " + name + " [parent: " + parent + "] — " + reason)

print("\nTop 20:")
for i, a in enumerate(scored[:20], 1):
    warn = (' WARNING: ' + a['warning']) if a['warning'] else ''
    uh = (' | ' + a['usage_headline']) if a['usage_headline'] else ''
    print(str(i).rjust(3) + ". " + a['name'].ljust(35) + " score=" + str(a['final']).ljust(6) + uh + warn)
```

---

### Step 4: CTD enrichment for top 40 (optional, recommended weekly)

**Run before Step 3** (or run Step 3 twice — once without CTD, once after CTD data is ready).

Write to `/tmp/ctd_lookup.py` and run:

```python
import urllib.request, json, time, csv

API_KEY = "{CTD_API_KEY — see ae-config.md}"
CLIENT_ID = "andrew.miller-mckeever@you.com"
BASE = "https://api.ctd.ai"

def ctd_company(domain):
    url = BASE + "/user/atc-paths-api/public/v1/company?company_domain=" + domain
    # NOTE: Must include a browser User-Agent — Cloudflare blocks raw Python requests (error 1010)
    req = urllib.request.Request(url, headers={
        "ctd-api-key": API_KEY,
        "ctd-client-id": CLIENT_ID,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            company = data.get('company', data)
            label = (company.get('ctd_company_score_label') or
                     company.get('ctd_score_label') or 'Not Found')
            score = (company.get('ctd_company_score_scaled') or
                     company.get('ctd_score_scaled') or 0)
            return {"ctd_label": label.lower(), "ctd_score_scaled": score}
    except Exception as e:
        return {"ctd_label": "Not Found", "error": str(e)}

accounts = []
with open('/tmp/sfdc_accounts.csv') as f:
    for row in csv.DictReader(f):
        domain = (row.get('Website','') or '').replace('https://','').replace('http://','').replace('www.','').split('/')[0]
        accounts.append((row['Name'], domain))

results = {}
for name, domain in accounts[:40]:
    if not domain:
        results[name] = {"ctd_label": "Not Found"}
        continue
    results[name] = {"domain": domain, **ctd_company(domain)}
    print("  " + name + ": " + str(results[name].get('ctd_label')))
    time.sleep(0.5)

with open('/tmp/ctd_results.json', 'w') as f:
    json.dump(results, f, indent=2)

print("CTD lookup complete: " + str(len(results)) + " accounts")
```

Run: `python3 /tmp/ctd_lookup.py`

After CTD data is written, re-run Step 3.

---

### Step 5: False-positive verification (when new accounts appear suspicious)

If an account is flagged by parent matching but you're not sure it's actually a competitor
subsidiary (SFDC parent data is sometimes wrong), verify with You.com search:

```bash
curl -s -G "https://api.you.com/v1/search" \
  -H "X-API-Key: $YDC_API_KEY" \
  --data-urlencode "query=Is [AccountName] a subsidiary of [ParentName]? Who owns [AccountName]?" \
  --data-urlencode "result_type=news" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(h.get('title',''),'-',h.get('description','')[:100]) for h in d.get('hits',[])]"
```

If verification confirms the account is NOT actually a competitor subsidiary, add it to
`SFDC_BAD_PARENT_DATA` in the scoring script.

Known bad SFDC parent data:
- `wilson elser` — law firm, SFDC incorrectly shows parent=Alphabet

---

### Step 6: Slack signal search (optional enrichment)

Search these channels for account name mentions using `mcp__440c028e-25dc-49ef-9cbd-6650b738bb3d__slack_search_public_and_private`.

Channels to search: `#esl-api-sales`, `#api-gtm-team`, `#sales-team`, `#sales-target-alerts`

For each of the top 20 accounts, search the account name and flag if there is a recent mention
(last 14 days). Add to the `Entry_Strategy` column in the CSV if a relevant Slack signal is found
(e.g., "Mentioned in #sales-target-alerts Apr 14 — new signup flagged").

This step can be skipped if time is short. The scoring model works without it.

---

### Step 7: Print summary

```
═══════════════════════════════════════════════════════════════
YDC ACCOUNT RANKING  |  Andrew Miller-McKeever  |  {today's date}
═══════════════════════════════════════════════════════════════

Scored {N} accounts  |  ALL accounts saved to ydc_account_rankings.csv
Excluded {N} accounts (search competitors/subsidiaries)

TOP 10:

 1. {Account}          Score: {N}    {Target?}  {CTD}  {Usage headline}
 2. {Account}          Score: {N}    ...
...

ACTIVE API USERS (top accounts with usage this week):
  {Account} — {N} calls/7d — {N} users active
  ...

NEW SIGNUPS (last 7 days across all accounts):
  {Account} — {N} new users signed up
  ...

FILE: /Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/ydc_account_rankings.csv
```

---

## Scoring Model

| Component | Weight / Points | Notes |
|---|---|---|
| SFDC Account Score | ×0.40 | Pre-computed score from Account Scoring tab (0–100) |
| Target Account | +28 pts | 3x commission accounts — hard priority signal |
| Company size | +2 to +20 pts | Smaller = higher; <100 employees = 20 pts |
| Engagement | −3 to +15 pts | Existing opp (+10), high fit in rationale (+5), low fit (−3) |
| CTD — Strong | +8 pts | "Strong Chance to Connect" from CTD API |
| CTD — Familiar | +5 pts | "Good Chance" or similar |
| CTD — Weak | +2 pts | Some connection signal |
| Usage — Active 7d | +20 pts | Any API calls in last 7 days |
| Usage — Active 30d | +12 pts | API calls in last 30 days (not 7d) |
| New Signup 7d | +15 pts | At least one new signup this week |
| New Signup 30d | +8 pts | New signup in last 30 days (not 7d) |

**Hard promotion rule:** Any account with `calls_7d > 0` is forced into the top 100
regardless of base score. Active product usage overrides everything.

**Competitor exclusion:** Search competitors (Google, Microsoft, Meta, Baidu, Yandex,
Perplexity, Brave, DuckDuckGo, Tavily, Neeva, Salesforce) and their subsidiaries are
hard-excluded and never appear in the output. This includes Tableau, Informatica,
Work.com, MuleSoft, and any other Salesforce-owned entity.

---

## File Output Reference

**`ydc_account_rankings.csv` columns:**

| Column | Description |
|---|---|
| Rank | 1–N by final score (ALL accounts, not just top 55) |
| Account | SFDC account name |
| Final_Score | Composite score |
| SFDC_Score | Raw SFDC Account_Score__c |
| Target_Account_3x | "YES (3x)" if Target_Account__c = true |
| SFDC_Tier | Tier label from SFDC |
| Employees | Headcount from SFDC |
| Industry | SFDC industry field |
| Website | Company website |
| Parent_Company | SFDC Parent.Name (for context) |
| Opp_Status | Open opportunity stage (if any) |
| CTD_Network | CTD connection strength label |
| Usage_Headline | Summary line (e.g., "2.3K calls this week, 2 new signups") |
| Total_Calls_7d | Sum of all API calls last 7 days |
| Total_Calls_30d | Sum of all API calls last 30 days |
| New_Signups_7d | Users who signed up in last 7 days |
| New_Signups_30d | Users who signed up in last 30 days |
| API_Users_Detail | Per-user lines: email, status, call counts |
| Warning | "Salesforce subsidiary" or other procurement notes |
| Rationale | SFDC Account_Score_Rationale__c (truncated to 300 chars) |

---

## When to Re-Run

Run weekly (Monday morning works well). The data that changes most often:
- Product_User__c usage — refreshes daily in SFDC
- New signups — can appear any day
- CTD scores — stable, re-run monthly is sufficient

On re-runs: the script overwrites `ydc_account_rankings.csv`. Previous version is not archived automatically.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added `SFDC_BAD_PARENT_DATA` exclusion list; Wilson Elser added | SFDC incorrectly listed Wilson Elser (law firm) as an Alphabet subsidiary |
| (prior) | Removed "exa" from `COMPETITOR_ACCOUNTS` | SFDC has an "EXA" under Uniguest (hospitality tech) — not exa.ai; was incorrectly excluded |
| (prior) | Added hard-promotion rule: any account with calls_7d > 0 forced into top 100 | Active product usage should always surface regardless of base score |
| (prior) | Added CTD enrichment step (Step 4) for top 40 accounts | Warm intro scores improve outreach prioritization |
