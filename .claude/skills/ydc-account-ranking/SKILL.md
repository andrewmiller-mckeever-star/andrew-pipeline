---
name: ydc-account-ranking
description: >-
  CLOUD version for Claude Code Routines. Ranks all of Andrew's Salesforce accounts by
  likelihood to close. Pulls all ~700 SFDC accounts via the hosted Salesforce connector
  (with parent company data for competitor exclusion), merges Product_User__c API usage
  data, CTD warm intro scores ($CTD_API_KEY) for the top 40, and Slack signals. Scores
  each account using a weighted model and outputs ALL scored accounts to a ranked CSV
  uploaded to the accountplans Google Drive folder. Run weekly for a fresh prioritization
  list. Use when user says "rank my accounts", "account ranking", "refresh rankings",
  "who should I focus on", "run account ranking", or "update my priority list".
---

# YDC: Account Ranking (Cloud)

## Purpose

Score all accounts Andrew owns in Salesforce and output a ranked list for weekly prioritization.
Combines four data sources:

- **SFDC Account Scoring** — pre-computed score, target account flag, company size, tier
- **Product Usage** — API calls and new signups from Product_User__c
- **CTD Network** — warm intro strength to the account domain
- **Slack Signals** — mentions in #esl-api-sales, #api-gtm-team, #sales-team, #sales-target-alerts

Output: `ydc_account_rankings_{YYYY-MM-DD}.csv` uploaded to the **accountplans folder in Google Drive** via the Drive connector `create_file`.

**Cloud execution notes (differences from the laptop version):**
- All Salesforce reads go through the account-level claude.ai Salesforce connector (read-only). Use the connector tool `soqlQuery` (locate by function-name suffix, never a hardcoded `mcp__<uuid>__` prefix). The `sf data query` CLI does not exist in cloud.
- All intermediate files (raw query JSON, scoring script, working CSV) live in the **session working directory**, not `/tmp` and not `/Users/andrew/...`.
- CTD auth comes from the `$CTD_API_KEY` env var (client ID from `$CTD_CLIENT_ID`, default `andrew.miller-mckeever@you.com`). If `$CTD_API_KEY` is unset, skip Step 4 — the scoring model works without CTD.
- The deliverable CSV is uploaded to Drive via the Drive connector `create_file`. If the Drive upload fails, note it, keep the CSV in the working directory, print the summary, and continue (no rclone fallback in cloud).
- WRITE BOUNDARY: this skill writes intermediate files to the session working directory and ONE CSV to the accountplans Drive folder. Nothing else. Never write to Salesforce, Slack, Apollo, or email.

**Env vars:**

| Variable | Default if unset |
|---|---|
| `SFDC_USER_ID` | `005Vq000009j4ezIAA` |
| `CTD_API_KEY` | (none — Step 4 skipped) |
| `CTD_CLIENT_ID` | `andrew.miller-mckeever@you.com` |
| `YDC_API_KEY` | (none — Step 5 verification falls back to WebSearch) |
| `GDRIVE_FOLDER_ID` | `1Fd2sMXvUnFVbAoh_BxqCrUI3R8snvp9u` (accountplans folder) |

**Competitor exclusion is mandatory.** Google subsidiaries (YouTube, Waymo, etc.), Microsoft
subsidiaries (LinkedIn, etc.), and other direct search competitors must never appear in the
output. Tableau and other Salesforce subsidiaries stay in (with a WARNING column) because
procurement goes through Salesforce.

---

## Procedure

### Step 1: Pull all SFDC accounts

Run this query via the Salesforce connector `soqlQuery` tool:

```sql
SELECT Id, Name, NumberOfEmployees, Website, Industry, OwnerId,
       Target_Account__c, Account_Tier__c, Tier_Label__c,
       Account_Score__c, Account_Score_Rationale__c,
       Parent.Name,
       (SELECT StageName FROM Opportunities WHERE IsClosed = false LIMIT 1)
FROM Account
WHERE OwnerId = '{SFDC_USER_ID}'
ORDER BY Account_Score__c DESC NULLS LAST
LIMIT 700
```

Save the raw result to `sfdc_raw.json` in the working directory (wrap the connector's records array as `{"result": {"records": [...]}}` if it isn't already in that shape, or rely on the flexible parser below).

Parse with Python (write to `parse_accounts.py` in the working directory, then run it):

```python
import json, csv

raw = open('sfdc_raw.json').read()
# Strip any warning lines that break JSON parsing
lines = [l for l in raw.splitlines() if not l.startswith('Warning:')]
data = json.loads('\n'.join(lines))

# Handle CLI output format, MCP/connector list format, and bare records
if isinstance(data, dict) and 'result' in data:
    records = data['result'].get('records', [])
elif isinstance(data, list) and data and isinstance(data[0], str):
    records = json.loads(data[0])
elif isinstance(data, list):
    records = data
else:
    records = data.get('records', [])

with open('sfdc_accounts.csv', 'w', newline='') as f:
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

Run all three queries via the Salesforce connector `soqlQuery` tool (independent — run in parallel).

**Query A — Linked users:**
```sql
SELECT Email__c, Domain__c, Account__r.Name, Account__c,
       Signup_Date__c, First_API_Call_Date__c, Last_API_Call_Date__c,
       API_Calls_Last_7_Days__c, API_Calls_Last_30_Days__c,
       Email_Free_Provider__c
FROM Product_User__c
WHERE Account__r.OwnerId = '{SFDC_USER_ID}'
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
AND Account__r.OwnerId = '{SFDC_USER_ID}'
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
AND Account__r.OwnerId = '{SFDC_USER_ID}'
ORDER BY Signup_Date__c DESC
LIMIT 100
```

Save each query result to `usage_a.json`, `usage_b.json`, `usage_c.json` in the working
directory, each shaped as `{"result": {"records": [...]}}` (wrap the connector's records
array if needed). The scoring script in Step 3 reads them directly.

---

### Step 3: Score all accounts with Python

Write this script to `score_accounts.py` in the working directory (do NOT use heredoc — write to file to avoid
Python f-string/backslash issues), then run `python3 score_accounts.py`:

```python
import json, csv, datetime
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
        if isinstance(d, dict) and 'result' in d:
            return d.get('result', {}).get('records', [])
        if isinstance(d, dict):
            return d.get('records', [])
        if isinstance(d, list):
            return d
        return []
    except:
        return []

records_a = load_records('usage_a.json')
records_b = load_records('usage_b.json')
records_c = load_records('usage_c.json')

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
    ctd = json.load(open('ctd_results.json'))
except:
    pass
ctd_pts_map = {"strong": 8, "familiar": 5, "weak": 2, "very weak": 0}

accounts = list(csv.DictReader(open('sfdc_accounts.csv')))

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
today = datetime.date.today().isoformat()
out_path = 'ydc_account_rankings_' + today + '.csv'
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

**Requires `$CTD_API_KEY`. If unset, skip this step entirely — the scoring model works without it.**

**Run before Step 3** (or run Step 3 twice — once without CTD, once after CTD data is ready).

Write to `ctd_lookup.py` in the working directory and run:

```python
import urllib.request, json, time, csv, os, sys

API_KEY = os.environ.get("CTD_API_KEY", "")
CLIENT_ID = os.environ.get("CTD_CLIENT_ID", "andrew.miller-mckeever@you.com")
BASE = "https://api.ctd.ai"

if not API_KEY:
    print("CTD_API_KEY not set — skipping CTD enrichment")
    sys.exit(0)

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
with open('sfdc_accounts.csv') as f:
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

with open('ctd_results.json', 'w') as f:
    json.dump(results, f, indent=2)

print("CTD lookup complete: " + str(len(results)) + " accounts")
```

Run: `python3 ctd_lookup.py`

After CTD data is written, re-run Step 3.

---

### Step 5: False-positive verification (when new accounts appear suspicious)

If an account is flagged by parent matching but you're not sure it's actually a competitor
subsidiary (SFDC parent data is sometimes wrong), verify with You.com search (requires
`$YDC_API_KEY`; if unset, verify with WebSearch or the You.com Search connector instead):

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

Search these channels for account name mentions using the Slack connector tool
`slack_search_public_and_private` (or `slack_search_public` if that is the only search tool available).

Channels to search: `#esl-api-sales`, `#api-gtm-team`, `#sales-team`, `#sales-target-alerts`

For each of the top 20 accounts, search the account name and flag if there is a recent mention
(last 14 days). Add to the `Entry_Strategy` column in the CSV if a relevant Slack signal is found
(e.g., "Mentioned in #sales-target-alerts Apr 14 — new signup flagged").

This step can be skipped if time is short. The scoring model works without it.

---

### Step 7: Upload CSV to Google Drive

1. Find the `accountplans` folder via the Google Drive connector tool `search_files` with query `name = 'accountplans' and mimeType = 'application/vnd.google-apps.folder'`. If the search fails, fall back to `GDRIVE_FOLDER_ID`.
2. Read the CSV content from the working directory and call the Drive connector tool `create_file`:
   - `title`: `"ydc_account_rankings_{YYYY-MM-DD}.csv"`
   - `mimeType`: `"text/csv"`
   - `content`: the full CSV content (base64-encoded if required by the tool)
   - `parentId`: the accountplans folder ID
3. Capture the returned file link for the summary.

**If Drive creation fails:** note the failure in the summary, keep the CSV in the working directory, and continue. Do not abort; there is no rclone fallback in the cloud.

---

### Step 8: Print summary

```
═══════════════════════════════════════════════════════════════
YDC ACCOUNT RANKING  |  Andrew Miller-McKeever  |  {today's date}
═══════════════════════════════════════════════════════════════

Scored {N} accounts  |  ALL accounts saved to ydc_account_rankings_{YYYY-MM-DD}.csv
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

FILE: {Google Drive link, or working-directory path if the Drive upload failed}
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

**`ydc_account_rankings_{YYYY-MM-DD}.csv` columns:**

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

On re-runs: each run creates a new dated CSV in the Drive accountplans folder
(`ydc_account_rankings_{YYYY-MM-DD}.csv`), so prior weeks are preserved automatically.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-17 | Cloud port created from skills/ydc-account-ranking | Migration to Claude Code Routines: `sf data query` CLI replaced by Salesforce connector `soqlQuery`, /tmp intermediates moved to the session working directory, output CSV now uploaded to the accountplans Drive folder as `ydc_account_rankings_{YYYY-MM-DD}.csv` via Drive connector `create_file` (dated, so prior runs are preserved), CTD key moved to `$CTD_API_KEY` env var (step skipped if unset), Slack tool referenced by function-name suffix, YDC verification falls back to WebSearch if `$YDC_API_KEY` unset, explicit write boundary added |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added `SFDC_BAD_PARENT_DATA` exclusion list; Wilson Elser added | SFDC incorrectly listed Wilson Elser (law firm) as an Alphabet subsidiary |
| (prior) | Removed "exa" from `COMPETITOR_ACCOUNTS` | SFDC has an "EXA" under Uniguest (hospitality tech) — not exa.ai; was incorrectly excluded |
| (prior) | Added hard-promotion rule: any account with calls_7d > 0 forced into top 100 | Active product usage should always surface regardless of base score |
| (prior) | Added CTD enrichment step (Step 4) for top 40 accounts | Warm intro scores improve outreach prioritization |
