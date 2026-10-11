#!/usr/bin/env python3
"""Merge research agent JSON into data/sotu-data.json.

Usage: python3 -I tools/assemble.py <open-opps-soql.json> <as_of YYYY-MM-DD>
Reads:  data/research/{key,big,small,renewals}.json, data/kpis.json,
        the previous data/sotu-data.json (keeps plan_url and open_with_three).
Writes: data/sotu-data.json and data/unknowns.json
"""
import json, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent.parent.parent
DATA = HERE / "data"
sf = {r["Id"]: r for r in json.load(open(sys.argv[1]))["records"]}
as_of = sys.argv[2]
prev = json.load(open(DATA / "sotu-data.json")) if (DATA / "sotu-data.json").exists() else {}
plan_urls = {k["account"]: k.get("plan_url") for k in prev.get("key_accounts", [])}

def money(n):
    if not n: return "PayGo"
    if n >= 10000: return f"${n/1000:,.0f}K"
    if n >= 1000: return f"${n/1000:,.1f}K".replace(".0K", "K")
    return f"${n:,.0f}"

opps, keys, unknowns = [], [], []
for f in ["key", "big", "small", "renewals"]:
    p = DATA / "research" / f"{f}.json"
    if not p.exists(): continue
    d = json.load(open(p))
    keys += d.get("key_accounts", [])
    unknowns += [f"[{f}] {u}" for u in d.get("unknowns", [])]
    for o in d["opps"]:
        r = sf.get(o["opp_id"])
        if not r:
            unknowns.append(f"[assemble] {o['account']} {o['opp_id']} is not open in SFDC, dropped"); continue
        o.update(amount=r["Amount"] or 0, amount_display=money(r["Amount"]), probability=r["Probability"],
                 stage=r["StageName"], close_date=r["CloseDate"], is_renewal=r["Type"] == "Renewal")
        if f != "key": o["name_on_card"] = r["Account"]["Name"]
        if o.get("champion", {}).get("name") in ("None found", "", None): o.setdefault("champion", {})["name"] = "Not named"
        opps.append(o)
for k in keys:
    if plan_urls.get(k["account"]): k.setdefault("plan_url", plan_urls[k["account"]])
for m in set(sf) - {o["opp_id"] for o in opps}:
    unknowns.append(f"[assemble] no research for {sf[m]['Account']['Name']} ({sf[m]['Name']})")
kp = json.load(open(DATA / "kpis.json"))
out = {"as_of": as_of, "kpis": kp["kpis"], "quotas": kp.get("quotas", {}), "key_accounts": keys,
       "opps": opps, "open_with_three": prev.get("open_with_three", [])}
json.dump(out, open(DATA / "sotu-data.json", "w"), indent=1)
json.dump(unknowns, open(DATA / "unknowns.json", "w"), indent=1)
print(f"{len(opps)} opps, {len(keys)} key accounts, {len(unknowns)} unknowns. Re-pick open_with_three before building.")
