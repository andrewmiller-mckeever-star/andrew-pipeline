#!/usr/bin/env python3
"""Apply approved Pipeline Cleanup Review rows to Salesforce through the sf CLI (runs as the signed-in sf CLI user).

usage: apply_review.py <apply-plan.json> <log.json>
Plan rows: {"opp","account","id","field","value"}. Non-stage fields go first in one PATCH per opp
(falling back to one field at a time on error), then StageName steps one stage at a time.
"""
import json, subprocess, sys, tempfile, os

STAGES = ["1 - Discovery", "2 - Qualification", "3 - Tech Eval", "4 - Proof of Value", "5 - Agreement", "6 - Submit to Close"]
NUM = {"Volume_Estimate_API_Monthly_Calls__c"}
BOOL = {"Pricing_Shown__c", "Eval_Credits_Not_Required__c"}
CLOSE_FIELDS = {"Loss_Reason__c", "Close_Reason__c", "Incumbent_Provider__c"}

plan = json.load(open(sys.argv[1]))
live = json.load(open(sys.argv[2].replace("apply-log", "live-before-apply")))
log = []

def coerce(f, v):
    if f in NUM:
        return float(v.replace(",", ""))
    if f in BOOL:
        return v.lower() in ("true", "yes", "1")
    if f == "Competition__c":
        return ";".join(x.strip() for x in v.replace(",", ";").split(";") if x.strip())
    return v

def patch(oid, body):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
        json.dump(body, t)
    try:
        r = subprocess.run(["sf", "api", "request", "rest", f"/services/data/v62.0/sobjects/Opportunity/{oid}",
                            "--method", "PATCH", "--body", f"@{t.name}"], capture_output=True, text=True)
    finally:
        os.unlink(t.name)
    out = (r.stdout + r.stderr).strip()
    ok = r.returncode == 0 and "errorCode" not in out
    return ok, out[-600:]

by = {}
for p in plan:
    by.setdefault(p["opp"], {"account": p["account"], "rows": []})["rows"].append(p)

for oid, g in by.items():
    rows = g["rows"]
    stage = next((p for p in rows if p["field"] == "StageName"), None)
    closing = stage and stage["value"] == "Closed Lost"
    fields = [p for p in rows if p["field"] != "StageName" and not (closing and p["field"] in CLOSE_FIELDS)]
    if fields:
        body = {p["field"]: coerce(p["field"], p["value"]) for p in fields}
        ok, out = patch(oid, body)
        if ok:
            log += [{"opp": oid, "account": g["account"], "id": p["id"], "field": p["field"], "ok": True} for p in fields]
        else:
            for p in fields:
                ok1, out1 = patch(oid, {p["field"]: coerce(p["field"], p["value"])})
                log.append({"opp": oid, "account": g["account"], "id": p["id"], "field": p["field"], "ok": ok1, "error": None if ok1 else out1})
    # An org automation stamps Next_Step_Date__c = today whenever NextStep changes, so re-set the date on its own.
    nsd = next((p for p in fields if p["field"] == "Next_Step_Date__c"), None)
    if nsd:
        patch(oid, {"Next_Step_Date__c": nsd["value"]})
    if stage:
        if closing:
            body = {"StageName": "Closed Lost"}
            body.update({p["field"]: coerce(p["field"], p["value"]) for p in rows if p["field"] in CLOSE_FIELDS})
            ok, out = patch(oid, body)
            ids = [stage["id"]] + [p["id"] for p in rows if p["field"] in CLOSE_FIELDS]
            log.append({"opp": oid, "account": g["account"], "id": ",".join(ids), "field": "StageName=Closed Lost", "ok": ok, "error": None if ok else out})
        else:
            cur = live[oid]["StageName"]
            for s in STAGES[STAGES.index(cur) + 1: STAGES.index(stage["value"]) + 1]:
                ok, out = patch(oid, {"StageName": s})
                log.append({"opp": oid, "account": g["account"], "id": stage["id"], "field": f"StageName={s}", "ok": ok, "error": None if ok else out})
                if not ok:
                    break

json.dump(log, open(sys.argv[2], "w"), indent=1)
print(f"{sum(1 for l in log if l['ok'])} ok, {sum(1 for l in log if not l['ok'])} failed")
for l in log:
    if not l["ok"]:
        print("FAIL", l["account"], l["id"], l["field"], (l.get("error") or "")[:300])
