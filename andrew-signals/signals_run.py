"""
signals_run.py — Daily usage burst alerts for Andrew Miller-McKeever's accounts.

Forked from Nick Opderbeck's signals_run.py (NOpderbeck/prospecting).
Scoped to accounts owned by Andrew (OwnerId filter) instead of tier-filtered accounts,
so it covers his full 690-account territory regardless of how they're tagged in SFDC.

Detects four signals:
  1. New users added to any of Andrew's accounts (CreatedDate within lookback)
  2. New users who already made their first API calls (First_API_Call_Date__c + calls > 0)
  3. Usage burst — weekly spike vs weekly average, tiered thresholds prevent noise
  4. Net-new ramp — account where most all-time calls happened in last 30d and accelerating

Posts to #automated-outbound-skills-and-routines. Silent if nothing fires.
State (burst/ramp cooldowns) persists in GCS between Cloud Run invocations.

Usage (local):
    python3 signals_run.py [--dry-run] [--simulate] [--lookback N]
    python3 signals_run.py --ramp       # net-new ramp scan, always dry-run
    python3 signals_run.py --dormant    # dormant accounts scan, always dry-run

Cloud Run:
    Triggered by Cloud Scheduler daily Mon-Fri 8am Pacific.

Environment variables:
    SF_USERNAME           Salesforce username (andrew.miller-mckeever@you.com)
    SF_PASSWORD           Salesforce password
    SF_SECURITY_TOKEN     Salesforce security token
    SLACK_BOT_TOKEN       Slack bot token with chat:write scope
    BURST_STATE_BUCKET    GCS bucket for cooldown state (Cloud Run: set automatically)
    YDC_API_KEY           You.com API key — optional, enables LinkedIn profile lookups
    TEST_OWNER_EMAIL      If set, all Slack posts go here instead (use for testing)
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import date, timedelta
from dotenv import load_dotenv

ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")

# ── Identity ───────────────────────────────────────────────────────────────────
ANDREW_SFDC_ID   = "005Vq000009j4ezIAA"        # Andrew's Salesforce User ID
ANDREW_SLACK_ID  = "U0A4M1BAR08"               # Andrew's Slack user ID
SLACK_CHANNEL    = "C0B4RRF3FC0"               # #automated-outbound-skills-and-routines
                                                # Change to "U0A4M1BAR08" to DM instead
SF_BASE          = "https://ydc.my.salesforce.com/"

# ── Burst detection thresholds (tiered by weekly average volume) ───────────────
# Prevents false positives: 10→20 calls is noise, not a burst.
# Each tier: (weekly_avg_floor, min_ratio, min_delta)
# First tier whose floor <= weekly_avg wins (list descending by floor).
BURST_TIERS = [
    (1_000_000, 1.15, 200_000),   # > 1M/wk: +15% triggers (e.g. large enterprise)
    (  100_000, 1.30,  50_000),   # > 100K/wk
    (   10_000, 1.50,   5_000),   # > 10K/wk
    (        0, 1.75,     500),   # default (low volume)
]

BURST_COOLDOWN_DAYS = 4    # suppress re-alert for same account within N days
RAMP_COOLDOWN_DAYS  = 7    # suppress re-alert for same ramping account within N days

MIN_RAMP_CALLS  = 1_000    # minimum 30d calls for a ramp account to surface
MIN_RAMP_NEWNESS = 0.80    # minimum fraction of all-time calls in last 30d
MIN_DORMANT_ALLTIME = 1_000 # minimum all-time calls for dormant account to surface

# ── Alert blocklist ────────────────────────────────────────────────────────────
# Accounts silently excluded from all signal alerts. Case-insensitive substring.
ALERT_BLOCKLIST: list[str] = [
    # Add accounts to suppress here, e.g. internal test accounts
]

# ── GCS state files ────────────────────────────────────────────────────────────
# Persists burst/ramp cooldown state across Cloud Run invocations.
# Falls back to /tmp if not configured (local development).
_GCS_BURST_BLOB = "burst_state.json"
_GCS_RAMP_BLOB  = "ramp_state.json"
_BURST_STATE_FILE = os.path.join(os.path.dirname(__file__), ".burst_state.json")
_RAMP_STATE_FILE  = os.path.join(os.path.dirname(__file__), ".ramp_state.json")


# ── Salesforce ─────────────────────────────────────────────────────────────────

def connect_sf():
    from simple_salesforce import Salesforce
    return Salesforce(
        username=os.environ["SF_USERNAME"],
        password=os.environ["SF_PASSWORD"],
        security_token=os.environ["SF_SECURITY_TOKEN"],
    )


def soql(sf, query: str) -> list:
    try:
        return sf.query_all(query.strip()).get("records", [])
    except Exception as e:
        print(f"  SOQL error: {e}", file=sys.stderr)
        return []


def soql_in_chunks(sf, query_template: str, ids: list, chunk_size: int = 200) -> list:
    """Run a SOQL query with a large IN clause — splits into chunks to avoid URI limits."""
    results = []
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i:i + chunk_size]
        id_list = "', '".join(chunk)
        results.extend(soql(sf, query_template.format(id_list=id_list)))
    return results


def is_blocked(account_name: str) -> bool:
    name_lower = account_name.lower()
    return any(entry.lower() in name_lower for entry in ALERT_BLOCKLIST)


# ── SOQL queries — all scoped to Andrew's accounts via OwnerId ─────────────────

def fetch_new_users(sf, lookback_cutoff: date) -> list:
    """
    Return all Product_User__c records on Andrew's accounts created on or after
    lookback_cutoff. Uses a closed window (since + until) so consecutive daily
    runs never double-report the same user.
    """
    since = lookback_cutoff.strftime("%Y-%m-%dT00:00:00Z")
    until = date.today().strftime("%Y-%m-%dT00:00:00Z")
    return soql(sf, f"""
        SELECT Email__c,
               CreatedDate,
               First_API_Call_Date__c,
               API_Calls_Last_7_Days__c,
               API_Calls_Last_30_Days__c,
               Account__c,
               Account__r.Name,
               Account__r.Id,
               Account__r.Owner.Name,
               Account__r.Owner.Email
        FROM Product_User__c
        WHERE Account__r.OwnerId = '{ANDREW_SFDC_ID}'
        AND CreatedDate >= {since}
        AND CreatedDate < {until}
        ORDER BY Account__r.Name, CreatedDate DESC
    """)


def fetch_all_usage(sf) -> list:
    """
    Return 7-day and 30-day call counts for all users on Andrew's accounts.
    Used to detect account-level burst signals.
    """
    return soql(sf, f"""
        SELECT Account__c,
               Account__r.Name,
               Account__r.Id,
               Account__r.Owner.Name,
               Account__r.Owner.Email,
               API_Calls_Last_7_Days__c,
               API_Calls_Last_30_Days__c
        FROM Product_User__c
        WHERE Account__r.OwnerId = '{ANDREW_SFDC_ID}'
        ORDER BY Account__r.Name
    """)


def fetch_ramp_usage(sf) -> list:
    """Return usage data for ramp detection — Andrew's accounts with 30d activity."""
    return soql(sf, f"""
        SELECT Account__c,
               Account__r.Name,
               Account__r.Id,
               Account__r.Account_Tier__c,
               Account__r.Owner.Name,
               Account__r.Owner.Email,
               API_Calls_Last_7_Days__c,
               API_Calls_Last_30_Days__c,
               API_Calls_per_User_All_Time__c,
               First_API_Call_Date__c
        FROM Product_User__c
        WHERE Account__r.OwnerId = '{ANDREW_SFDC_ID}'
        AND API_Calls_Last_30_Days__c > 0
        ORDER BY Account__r.Name
    """)


def fetch_dormant_usage(sf) -> list:
    """Return accounts with historical usage but zero activity in last 30 days."""
    return soql(sf, f"""
        SELECT Account__c,
               Account__r.Name,
               Account__r.Id,
               Account__r.Account_Tier__c,
               Account__r.Owner.Name,
               Account__r.Owner.Email,
               API_Calls_Last_30_Days__c,
               API_Calls_per_User_All_Time__c,
               First_API_Call_Date__c,
               Last_API_Call_Date__c
        FROM Product_User__c
        WHERE Account__r.OwnerId = '{ANDREW_SFDC_ID}'
        AND API_Calls_per_User_All_Time__c > 0
        AND (API_Calls_Last_30_Days__c = 0 OR API_Calls_Last_30_Days__c = null)
        ORDER BY Account__r.Name
    """)


# ── GCS state helpers ──────────────────────────────────────────────────────────

def _gcs_bucket():
    bucket_name = os.getenv("BURST_STATE_BUCKET", "")
    if not bucket_name:
        return None
    try:
        from google.cloud import storage
        return storage.Client().bucket(bucket_name)
    except Exception as e:
        print(f"  ⚠️  GCS init failed, falling back to local state: {e}", file=sys.stderr)
        return None


def _load_state(gcs_blob_name: str, local_path: str) -> dict:
    bucket = _gcs_bucket()
    if bucket is not None:
        try:
            blob = bucket.blob(gcs_blob_name)
            if blob.exists():
                return json.loads(blob.download_as_text())
            return {}
        except Exception as e:
            print(f"  ⚠️  GCS load failed ({gcs_blob_name}), falling back to local: {e}", file=sys.stderr)

    for path in [local_path, f"/tmp/{os.path.basename(local_path)}"]:
        if os.path.exists(path):
            try:
                with open(path) as f:
                    return json.load(f)
            except Exception:
                return {}
    return {}


def _save_state(state: dict, gcs_blob_name: str, local_path: str) -> None:
    bucket = _gcs_bucket()
    if bucket is not None:
        try:
            bucket.blob(gcs_blob_name).upload_from_string(
                json.dumps(state, indent=2), content_type="application/json"
            )
            return
        except Exception as e:
            print(f"  ⚠️  GCS save failed ({gcs_blob_name}), falling back to local: {e}", file=sys.stderr)

    for path in [local_path, f"/tmp/{os.path.basename(local_path)}"]:
        try:
            with open(path, "w") as f:
                json.dump(state, f, indent=2)
            return
        except OSError:
            continue


def _load_burst_state() -> dict:
    return _load_state(_GCS_BURST_BLOB, _BURST_STATE_FILE)

def _save_burst_state(state: dict) -> None:
    _save_state(state, _GCS_BURST_BLOB, _BURST_STATE_FILE)

def _load_ramp_state() -> dict:
    return _load_state(_GCS_RAMP_BLOB, _RAMP_STATE_FILE)

def _save_ramp_state(state: dict) -> None:
    _save_state(state, _GCS_RAMP_BLOB, _RAMP_STATE_FILE)


# ── Burst detection ────────────────────────────────────────────────────────────

def _burst_thresholds(weekly_avg: float) -> tuple[float, int]:
    for floor, ratio, delta in BURST_TIERS:
        if weekly_avg >= floor:
            return ratio, delta
    return BURST_TIERS[-1][1], BURST_TIERS[-1][2]


def detect_bursts(usage_records: list, dry_run: bool = False) -> dict:
    """
    Aggregate usage per account. Return accounts that clear both burst gates:
      1. delta (total_7d − weekly_avg) >= min_delta  (volume-tiered)
      2. total_7d >= weekly_avg × min_ratio           (volume-tiered)

    Returns {account_id: {name, sf_id, total_7d, weekly_avg, delta}}
    """
    agg: dict = {}
    for r in usage_records:
        acc_id  = r.get("Account__c") or r.get("Account__r", {}).get("Id", "")
        acc_ref = r.get("Account__r") or {}
        if acc_id not in agg:
            agg[acc_id] = {
                "name":     acc_ref.get("Name", "Unknown"),
                "sf_id":    acc_ref.get("Id", acc_id),
                "total_7d": 0,
                "total_30d": 0,
            }
        agg[acc_id]["total_7d"]  += int(r.get("API_Calls_Last_7_Days__c")  or 0)
        agg[acc_id]["total_30d"] += int(r.get("API_Calls_Last_30_Days__c") or 0)

    state       = _load_burst_state()
    today_s     = date.today().isoformat()
    bursts: dict = {}
    state_dirty  = False

    for acc_id, acc in agg.items():
        if is_blocked(acc["name"]):
            continue
        total_7d   = acc["total_7d"]
        weekly_avg = acc["total_30d"] / 4
        delta      = total_7d - weekly_avg
        min_ratio, min_delta = _burst_thresholds(weekly_avg)

        if not (weekly_avg > 0 and delta >= min_delta and total_7d >= weekly_avg * min_ratio):
            continue

        last_fired = state.get(acc_id)
        if last_fired:
            days_since = (date.today() - date.fromisoformat(last_fired)).days
            if days_since < BURST_COOLDOWN_DAYS:
                print(f"  ⏸  Burst suppressed for {acc['name']} "
                      f"(last fired {days_since}d ago, cooldown={BURST_COOLDOWN_DAYS}d)",
                      file=sys.stderr)
                continue

        bursts[acc_id] = {
            "name":       acc["name"],
            "sf_id":      acc["sf_id"],
            "total_7d":   total_7d,
            "weekly_avg": round(weekly_avg, 1),
            "delta":      int(delta),
        }
        state[acc_id] = today_s
        state_dirty   = True

    if state_dirty and not dry_run:
        _save_burst_state(state)
    elif state_dirty and dry_run:
        print("  ℹ️  Dry-run: burst state NOT saved", file=sys.stderr)

    return bursts


# ── Ramp detection ─────────────────────────────────────────────────────────────

def detect_ramp(usage_records: list, sf=None,
                cooldown: bool = True, dry_run: bool = False) -> list:
    """
    Surface accounts that are net-new (most all-time calls in last 30d) and
    accelerating (current week outpacing prior three-week average).
    """
    agg: dict = {}
    for r in usage_records:
        acc_ref = r.get("Account__r") or {}
        acc_id  = r.get("Account__c") or acc_ref.get("Id", "")
        if not acc_id:
            continue

        raw_first = r.get("First_API_Call_Date__c")
        first_dt  = date.fromisoformat(raw_first[:10]) if raw_first else None

        if acc_id not in agg:
            agg[acc_id] = {
                "name":            acc_ref.get("Name", "Unknown"),
                "sf_id":           acc_ref.get("Id", acc_id),
                "tier":            acc_ref.get("Account_Tier__c") or "—",
                "total_7d":        0,
                "total_30d":       0,
                "total_alltime":   0,
                "active_users":    0,
                "first_call_date": first_dt,
            }

        agg[acc_id]["total_7d"]      += int(r.get("API_Calls_Last_7_Days__c")       or 0)
        agg[acc_id]["total_30d"]     += int(r.get("API_Calls_Last_30_Days__c")      or 0)
        agg[acc_id]["total_alltime"] += int(r.get("API_Calls_per_User_All_Time__c") or 0)
        agg[acc_id]["active_users"]  += 1

        if first_dt and (agg[acc_id]["first_call_date"] is None
                         or first_dt < agg[acc_id]["first_call_date"]):
            agg[acc_id]["first_call_date"] = first_dt

    # Newness + acceleration gates
    ramping: dict = {}
    for acc_id, acc in agg.items():
        if is_blocked(acc["name"]):
            continue
        alltime  = acc["total_alltime"]
        calls30d = acc["total_30d"]
        calls7d  = acc["total_7d"]
        if alltime == 0 or calls30d < MIN_RAMP_CALLS:
            continue
        newness          = calls30d / alltime
        weekly_prior_avg = (calls30d - calls7d) / 3
        if newness >= MIN_RAMP_NEWNESS and calls7d > weekly_prior_avg:
            ramping[acc_id] = {**acc, "newness": round(newness, 3),
                               "weekly_prior_avg": round(weekly_prior_avg, 1)}

    # Customer exclusion (accounts that have already signed — don't alert on those)
    customer_ids: set[str] = set()
    if sf and ramping:
        rev_records = soql_in_chunks(sf,
            "SELECT Id, Total_Revenue_Closed_Won__c FROM Account WHERE Id IN ('{id_list}')",
            list(ramping.keys()))
        revenue_customer_ids = {
            r["Id"] for r in rev_records
            if (r.get("Total_Revenue_Closed_Won__c") or 0) > 0
        }
        opp_records = soql_in_chunks(sf,
            "SELECT AccountId FROM Opportunity WHERE AccountId IN ('{id_list}') "
            "AND StageName = 'Closed Won' AND CloseDate >= LAST_N_DAYS:365",
            list(ramping.keys()))
        recent_closedwon_ids = {r["AccountId"] for r in opp_records}
        customer_ids = revenue_customer_ids | recent_closedwon_ids
        if customer_ids:
            customer_names = [ramping[cid]["name"] for cid in customer_ids if cid in ramping]
            print(f"  Excluding {len(customer_ids)} customer(s) from ramp: {', '.join(customer_names)}",
                  file=sys.stderr)

    state       = _load_ramp_state() if cooldown else {}
    today_s     = date.today().isoformat()
    state_dirty = False
    results     = []

    for acc_id, acc in ramping.items():
        if acc_id in customer_ids:
            continue
        if cooldown:
            last_fired = state.get(acc_id)
            if last_fired:
                days_since = (date.today() - date.fromisoformat(last_fired)).days
                if days_since < RAMP_COOLDOWN_DAYS:
                    print(f"  ⏸  Ramp suppressed for {acc['name']} "
                          f"(last fired {days_since}d ago, cooldown={RAMP_COOLDOWN_DAYS}d)",
                          file=sys.stderr)
                    continue
            state[acc_id] = today_s
            state_dirty   = True
        results.append(acc)

    if state_dirty and not dry_run:
        _save_ramp_state(state)
    elif state_dirty and dry_run:
        print("  ℹ️  Dry-run: ramp state NOT saved", file=sys.stderr)

    results.sort(key=lambda a: -a["total_30d"])
    return results


# ── Dormant scan (CLI only, never posts to Slack) ─────────────────────────────

def detect_dormant(usage_records: list) -> list:
    """
    Aggregate Andrew's accounts with historical usage but zero 30d activity.
    Sorted by days since last call.
    """
    today = date.today()
    agg: dict = {}
    for r in usage_records:
        acc_ref = r.get("Account__r") or {}
        acc_id  = r.get("Account__c") or acc_ref.get("Id", "")
        if not acc_id:
            continue

        raw_last  = r.get("Last_API_Call_Date__c")
        raw_first = r.get("First_API_Call_Date__c")
        last_dt   = date.fromisoformat(raw_last[:10])  if raw_last  else None
        first_dt  = date.fromisoformat(raw_first[:10]) if raw_first else None

        if acc_id not in agg:
            agg[acc_id] = {
                "name":          acc_ref.get("Name", "Unknown"),
                "sf_id":         acc_ref.get("Id", acc_id),
                "tier":          acc_ref.get("Account_Tier__c") or "—",
                "total_alltime": 0,
                "total_30d":     0,
                "last_call_date":  last_dt,
                "first_call_date": first_dt,
                "users":         0,
            }

        agg[acc_id]["total_alltime"] += int(r.get("API_Calls_per_User_All_Time__c") or 0)
        agg[acc_id]["total_30d"]     += int(r.get("API_Calls_Last_30_Days__c") or 0)
        agg[acc_id]["users"]         += 1

        if last_dt and (agg[acc_id]["last_call_date"] is None or
                        last_dt > agg[acc_id]["last_call_date"]):
            agg[acc_id]["last_call_date"] = last_dt
        if first_dt and (agg[acc_id]["first_call_date"] is None or
                         first_dt < agg[acc_id]["first_call_date"]):
            agg[acc_id]["first_call_date"] = first_dt

    results = []
    for acc_id, acc in agg.items():
        if is_blocked(acc["name"]):
            continue
        if acc["total_alltime"] < MIN_DORMANT_ALLTIME:
            continue
        days_dark = (today - acc["last_call_date"]).days if acc["last_call_date"] else None
        results.append({**acc, "days_dark": days_dark})

    results.sort(key=lambda a: (a["days_dark"] is None, a["days_dark"]))
    return results


def print_dormant_report(accounts: list, date_str: str):
    print(f"\n── Dormant Accounts — {date_str} {'─' * 30}")
    print(f"   Andrew's accounts · zero usage last 30d · ≥{MIN_DORMANT_ALLTIME:,} all-time calls\n")
    if not accounts:
        print("   No dormant accounts above threshold.")
        return
    name_w = min(max(len(a["name"]) for a in accounts), 40)
    for i, acc in enumerate(accounts, 1):
        name      = acc["name"][:name_w]
        last_call = acc["last_call_date"].strftime("%Y-%m-%d") if acc["last_call_date"] else "never"
        days_dark = f"{acc['days_dark']:,}d" if acc["days_dark"] is not None else "—"
        print(f"  {i:>3}.  {name:<{name_w}}  {acc['tier']:<12}  "
              f"all-time: {acc['total_alltime']:>8,}  last call: {last_call}  dark: {days_dark}")
    print(f"\n  {len(accounts)} account(s) shown")
    print("─" * 70)


# ── New user grouping ──────────────────────────────────────────────────────────

def group_signals(records: list, lookback_cutoff: date) -> dict:
    """
    Group new-user records by account. Classify each user as:
      - 'with_calls': new user who already made API calls within lookback
      - 'user_only': new user added, no calls yet
    """
    accounts: dict = {}
    for r in records:
        acc_id   = r.get("Account__c") or r.get("Account__r", {}).get("Id", "")
        acc_ref  = r.get("Account__r") or {}
        acc_name = acc_ref.get("Name", "Unknown")
        if is_blocked(acc_name):
            continue

        email    = r.get("Email__c") or ""
        calls_7d = int(r.get("API_Calls_Last_7_Days__c") or 0)

        first_call_raw    = r.get("First_API_Call_Date__c")
        first_call_recent = False
        if first_call_raw:
            first_call_date   = date.fromisoformat(first_call_raw[:10])
            first_call_recent = first_call_date >= lookback_cutoff

        if acc_id not in accounts:
            accounts[acc_id] = {
                "name":       acc_name,
                "sf_id":      acc_ref.get("Id", acc_id),
                "with_calls": [],
                "user_only":  [],
            }

        display = fmt_name(email) if email else "Unknown User"
        if first_call_recent and calls_7d > 0:
            accounts[acc_id]["with_calls"].append((display, email, calls_7d))
        else:
            accounts[acc_id]["user_only"].append((display, email))

    return accounts


# ── LinkedIn lookup (optional) ─────────────────────────────────────────────────

_linkedin_cache: dict[str, str | None] = {}


def linkedin_url_for_email(email: str, display_name: str, company_name: str) -> str | None:
    """
    Search for a LinkedIn profile URL using You.com Search API.
    Requires YDC_API_KEY. Gracefully returns None if unavailable.

    Confidence gates:
      1. Email must have a '.' or '_' — need at least first + last name derivable
      2. Last name must appear in the LinkedIn URL slug
    """
    if email in _linkedin_cache:
        return _linkedin_cache[email]

    local = email.split("@")[0]
    if "." not in local and "_" not in local:
        _linkedin_cache[email] = None
        return None

    youcom_key = os.getenv("YDC_API_KEY", "")
    if not youcom_key:
        _linkedin_cache[email] = None
        return None

    import requests, re
    name_tokens = [t.lower() for t in display_name.split() if t]
    last_name   = name_tokens[-1] if name_tokens else ""
    query = f"site:linkedin.com/in/ {display_name} {company_name}"

    try:
        resp = requests.post(
            "https://api.you.com/v1/search",
            headers={"X-API-Key": youcom_key, "Content-Type": "application/json"},
            json={"query": query},
            timeout=15,
        )
        # Handle both response formats
        data = resp.json()
        hits = data.get("hits") or data.get("results", {}).get("web", []) or []
        for hit in hits:
            url = hit.get("url", "")
            m = re.match(r"https://www\.linkedin\.com/in/([^/]+)/?$", url)
            if not m:
                continue
            slug = m.group(1).lower()
            if last_name and last_name in slug:
                print(f"  🔗 LinkedIn: {display_name} → {url}", file=sys.stderr)
                _linkedin_cache[email] = url
                return url
    except Exception as e:
        print(f"  ⚠️  LinkedIn lookup failed for {display_name}: {e}", file=sys.stderr)

    _linkedin_cache[email] = None
    return None


def fmt_name(email: str) -> str:
    """bob.woolworth@acme.com → Bob Woolworth"""
    local = email.split("@")[0]
    return " ".join(p.capitalize() for p in local.replace(".", " ").replace("_", " ").split())


def fmt_name_linked(display_name: str, email: str, company_name: str) -> str:
    """Return display_name hyperlinked to LinkedIn if found, else plain."""
    url = linkedin_url_for_email(email, display_name, company_name)
    if url:
        return f"<{url}|{display_name}>"
    return display_name


# ── Message building ───────────────────────────────────────────────────────────

def build_alert_lines(accounts: dict, bursts: dict, ramping: list) -> list[str]:
    """Build one alert line per signal event."""
    lines = []

    # New user signals
    for acc_id, acc in sorted(accounts.items(), key=lambda x: x[1]["name"]):
        name   = acc["name"]
        sf_url = SF_BASE + acc["sf_id"]

        for display, email, calls in acc["with_calls"]:
            linked = fmt_name_linked(display, email, name)
            lines.append(
                f"• *<{sf_url}|{name}>* — {linked} added as new user "
                f"and made *{calls:,} API calls* for the first time."
            )

        if acc["user_only"]:
            users = acc["user_only"]
            if len(users) == 1:
                display, email = users[0]
                linked = fmt_name_linked(display, email, name)
                lines.append(f"• *<{sf_url}|{name}>* — {linked} added as new user.")
            else:
                names_fmt = ", ".join(fmt_name_linked(d, e, name) for d, e in users)
                lines.append(
                    f"• *<{sf_url}|{name}>* — {len(users)} new users added: {names_fmt}."
                )

    # Usage burst signals
    for acc_id, acc in sorted(bursts.items(), key=lambda x: x[1]["name"]):
        sf_url = SF_BASE + acc["sf_id"]
        lines.append(
            f"• *<{sf_url}|{acc['name']}>* — usage spike: "
            f"*{acc['total_7d']:,} API calls* this week vs "
            f"*{acc['weekly_avg']:,.0f}/wk* avg (+{acc['delta']:,})."
        )

    # Net-new ramp signals
    for acc in sorted(ramping, key=lambda a: a["name"]):
        sf_url = SF_BASE + acc["sf_id"]
        since  = acc["first_call_date"].strftime("%b %-d") if acc["first_call_date"] else "recently"
        lines.append(
            f"• *<{sf_url}|{acc['name']}>* — net-new ramp: "
            f"*{acc['total_30d']:,} API calls* since {since}."
        )

    return lines


def post_to_slack(bot_token: str, lines: list[str], date_str: str, dry_run: bool = False):
    import requests
    header = f"<@{ANDREW_SLACK_ID}> 🔔 *Usage Signals — {date_str}*"
    text   = header + "\n\n" + "\n".join(lines)

    if dry_run:
        print(f"\n── DRY RUN: Slack message (not posted) {'─' * 30}")
        print(text)
        print("─" * 70 + "\n")
        return

    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {bot_token}", "Content-Type": "application/json"},
        json={"channel": SLACK_CHANNEL, "text": text, "mrkdwn": True, "unfurl_links": False},
        timeout=10,
    )
    result = resp.json()
    if result.get("ok"):
        print(f"✅ Posted {len(lines)} signal(s) to Slack")
    else:
        print(f"⚠️  Slack post failed: {result.get('error')}", file=sys.stderr)
        sys.exit(1)


# ── Simulate mode (test Slack plumbing without hitting SFDC) ──────────────────

SIMULATE_ACCOUNTS = {
    "001SIM0000001AAA": {
        "name":       "Acme AI Corp",
        "sf_id":      "001SIM0000001AAA",
        "with_calls": [("Jane Smith", "jane.smith@acme.com", 847)],
        "user_only":  [],
    },
}
SIMULATE_BURSTS = {
    "001SIM0000002AAA": {
        "name":       "Beta Systems",
        "sf_id":      "001SIM0000002AAA",
        "total_7d":   12_500,
        "weekly_avg": 4_200.0,
        "delta":      8_300,
    },
}


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Andrew's usage signal alerts")
    parser.add_argument("--lookback", type=int, default=None,
                        help="Days to look back for new users (default: 3 on Monday, 1 otherwise)")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Print Slack message to stdout without posting")
    parser.add_argument("--simulate", action="store_true",
                        help="Use synthetic data to test Slack plumbing (implies --dry-run)")
    parser.add_argument("--dormant",  action="store_true",
                        help="Print dormant account report to stdout (always dry-run)")
    parser.add_argument("--ramp",     action="store_true",
                        help="Print net-new ramp report to stdout (always dry-run)")
    args = parser.parse_args()

    load_dotenv(ENV_PATH)

    today    = date.today()
    date_str = today.strftime("%B %-d, %Y")

    # On Mondays look back 3 days to cover the weekend gap
    if args.lookback is not None:
        lookback_days = args.lookback
    else:
        lookback_days = 3 if today.weekday() == 0 else 1
    lookback_cutoff = today - timedelta(days=lookback_days)

    print(f"Andrew's Usage Signals | {date_str} | lookback: {lookback_days}d (since {lookback_cutoff})")

    # ── Dormant mode ───────────────────────────────────────────────────────────
    if args.dormant:
        print("Mode: dormant account scan")
        print("Connecting to Salesforce...")
        sf = connect_sf()
        records = fetch_dormant_usage(sf)
        print(f"  {len(records)} dormant user record(s) found")
        accounts = detect_dormant(records)
        print_dormant_report(accounts, date_str)
        return

    # ── Ramp mode ──────────────────────────────────────────────────────────────
    if args.ramp:
        print("Mode: net-new ramp scan (always dry-run)")
        print("Connecting to Salesforce...")
        sf = connect_sf()
        records = fetch_ramp_usage(sf)
        accounts = detect_ramp(records, sf=sf, cooldown=False)
        print(f"  {len(accounts)} ramping account(s) found")
        for acc in accounts:
            since = acc["first_call_date"].strftime("%Y-%m-%d") if acc["first_call_date"] else "—"
            print(f"  {acc['name']:<40}  {acc['total_30d']:>10,} calls/30d  "
                  f"since {since}  newness {acc['newness']:.0%}")
        return

    bot_token = os.getenv("SLACK_BOT_TOKEN", "")

    # ── Simulate mode ──────────────────────────────────────────────────────────
    if args.simulate:
        print("Mode: SIMULATE (synthetic data — no SFDC call)")
        args.dry_run = True
        accounts = SIMULATE_ACCOUNTS
        bursts   = SIMULATE_BURSTS
        ramping  = []
    else:
        print("Connecting to Salesforce...")
        sf = connect_sf()

        print(f"Fetching new users on Andrew's accounts (since {lookback_cutoff})...")
        new_user_records = fetch_new_users(sf, lookback_cutoff)
        print(f"  {len(new_user_records)} new user record(s)")

        print("Fetching usage data for burst detection...")
        usage_records = fetch_all_usage(sf)
        bursts = detect_bursts(usage_records, dry_run=args.dry_run)
        print(f"  {len(bursts)} burst account(s) detected")

        print("Fetching usage data for ramp detection...")
        ramp_records = fetch_ramp_usage(sf)
        ramping = detect_ramp(ramp_records, sf=sf, cooldown=True, dry_run=args.dry_run)
        ramping = [a for a in ramping if a["sf_id"] not in bursts]
        print(f"  {len(ramping)} ramping account(s) detected")

        if not new_user_records and not bursts and not ramping:
            print("No signals found today. Nothing to post.")
            return

        accounts = group_signals(new_user_records, lookback_cutoff) if new_user_records else {}
        print(f"  New users across {len(accounts)} account(s)")

    lines = build_alert_lines(accounts, bursts, ramping)
    if not lines:
        print("No actionable signals. Nothing to post.")
        return

    print(f"\n{len(lines)} signal(s) to post:")
    for line in lines:
        print(f"  {line}")

    if args.dry_run:
        post_to_slack(bot_token, lines, date_str, dry_run=True)
    elif bot_token:
        post_to_slack(bot_token, lines, date_str)
    else:
        print("⚠️  No SLACK_BOT_TOKEN — run with --dry-run or set the env var", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
