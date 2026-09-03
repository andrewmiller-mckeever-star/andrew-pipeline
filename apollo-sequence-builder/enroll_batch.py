#!/usr/bin/env python3
"""Phase B for a batch of accounts: create Apollo contacts, then enroll into the 4 sequences.

Follows ydc-apollo-build Phase B:
  - reuses an existing Apollo contact when the email already exists (no duplicates)
  - labels every contact "Whale Pipeline" + "{Company} - Seq {X}"
  - checks contact_campaign_statuses for a LIVE membership and refuses to double-enroll
  - enrolls with emailer_campaign_id in the body as well as the URL
  - verifies from Apollo afterwards: paused count, active count, sequence still inactive
"""
import json, os, sys, time, urllib.request, urllib.error

API = "https://api.apollo.io/v1"
KEY = os.environ["APOLLO_API_KEY"]


# This repo is public. Account identifiers live in ae-config.md, which is gitignored.
# Env wins; ae-config.md is the fallback.
def ae_config(key):
    v = os.environ.get(key)
    if v:
        return v
    here = os.path.dirname(os.path.abspath(__file__))
    for base in (here, os.path.join(here, "..")):
        path = os.path.join(base, "ae-config.md")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    if line.strip().startswith(key + ":"):
                        return line.split(":", 1)[1].strip().strip("`")
    sys.exit(f"{key} is not set. Add it to ae-config.md or export it.")


EMAIL_ACCT = ae_config("APOLLO_EMAIL_ACCOUNT_ID")   # sending account
ANDREW = ae_config("APOLLO_USER_ID")


def call(m, p, b=None, tolerate=False):
    r = urllib.request.Request(f"{API}{p}",
                               data=json.dumps(b).encode() if b is not None else None, method=m)
    r.add_header("X-Api-Key", KEY)
    r.add_header("Content-Type", "application/json")
    r.add_header("Cache-Control", "no-cache")
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            out = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        out = {"error": f"HTTP {e.code}", "detail": e.read().decode()[:300]}
    if "error" in out and not tolerate:
        print(f"    !! {m} {p}: {out['error']} {out.get('detail','')[:160]}")
    return out


def find_contact(email):
    r = call("POST", "/contacts/search", {"q_keywords": email, "per_page": 5}, tolerate=True)
    for c in r.get("contacts", []):
        if (c.get("email") or "").lower() == email.lower():
            return c
    return None


def upsert(company, seq_letter, first, last, email, title):
    existing = find_contact(email)
    if existing:
        live = [s for s in (existing.get("contact_campaign_statuses") or [])
                if s.get("status") in ("active", "paused")]
        if live:
            print(f"    HOLD  {first} {last} <{email}> already LIVE in "
                  f"{len(live)} campaign(s) — not enrolling")
            return None
        print(f"    reuse {existing['id']}  {first} {last}")
        return existing["id"]
    r = call("POST", "/contacts", {
        "first_name": first, "last_name": last, "email": email, "title": title,
        "organization_name": company,
        "label_names": ["Whale Pipeline", f"{company} - Seq {seq_letter}"]})
    if "error" in r:
        return None
    cid = r["contact"]["id"]
    print(f"    new   {cid}  {first} {last}")
    return cid


def enroll(cid, ids):
    if not ids:
        return {"skipped": True}
    return call("POST", f"/emailer_campaigns/{cid}/add_contact_ids", {
        "emailer_campaign_id": cid, "contact_ids": ids,
        "send_email_from_email_account_id": EMAIL_ACCT,
        "sequence_active_in_other_campaigns": True,
        "sequence_finished_in_other_campaigns": True,
        "sequence_same_company_in_same_campaign": True,
        "sequence_no_email": True})


def verify(cid):
    d = call("GET", f"/emailer_campaigns/{cid}", tolerate=True)
    c = d.get("emailer_campaign", {})
    cs = d.get("contact_statuses") or c.get("contact_statuses") or {}
    return {"name": c.get("name"), "active": c.get("active"),
            "owner_ok": c.get("user_id") == ANDREW, "steps": c.get("num_steps"),
            "paused": cs.get("paused"), "sequence_active_contacts": cs.get("active"),
            "total": sum(v for v in cs.values() if isinstance(v, int))}


if __name__ == "__main__":
    plan = json.load(open(sys.argv[1]))
    summary = []
    for company, spec in plan.items():
        print(f"\n{'='*62}\n{company}")
        for letter, block in spec["sequences"].items():
            print(f"  Seq {letter}  ({block['id']})")
            ids = []
            for p in block["contacts"]:
                cid = upsert(company, letter, p[0], p[1], p[2], p[3])
                if cid:
                    ids.append(cid)
                time.sleep(0.35)
            r = enroll(block["id"], ids)
            n = len(r.get("contacts", []) or []) if "error" not in r else 0
            print(f"    enrolled {n}/{len(ids)}")
            time.sleep(1)
            summary.append((company, letter, block["id"], verify(block["id"])))

    print(f"\n{'='*62}\nVERIFICATION (read from Apollo)")
    bad = 0
    for company, letter, sid, v in summary:
        ok = (v["active"] is False and v["owner_ok"] and v["steps"] == 7
              and (v["paused"] or 0) > 0 and (v["sequence_active_contacts"] or 0) == 0)
        if not ok:
            bad += 1
        print(f"  {'OK ' if ok else 'BAD'} {company:<10} Seq {letter:<3} "
              f"inactive={v['active'] is False} owner={v['owner_ok']} steps={v['steps']} "
              f"paused={v['paused']} sending={v['sequence_active_contacts']}")
    print(f"\n{'ALL CLEAN' if bad == 0 else str(bad)+' PROBLEM(S)'}")
    sys.exit(1 if bad else 0)
