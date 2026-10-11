#!/usr/bin/env python3
"""Write the account-plan index CSV for the Google Sheet.

Reads data/manifest.json (plan + JEP URLs) and plans/*.meta.json (stage, last update, next step).
Writes upload/Account Plans Index.csv. Upload it as a native Sheet with:
  rclone copy "upload/Account Plans Index.csv" gdrive:<your-folder>/ --drive-import-formats csv --drive-export-formats csv
"""
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent.parent
m = json.load(open(HERE / "data" / "manifest.json"))
rows = []
for meta in sorted((HERE / "data" / "plans").glob("*.meta.json")):
    d = json.load(open(meta))
    acct = d["account"]
    rows.append({
        "Account": acct,
        "Stage": d.get("stage", ""),
        "Last update": d.get("last_update", ""),
        "Last real contact": d.get("last_contact") or "None logged",
        "Next step": d.get("next_step", ""),
        "Account plan": m.get("plans", {}).get(acct, "NOT PUBLISHED"),
        "Joint close plan": m.get("jeps", {}).get(acct, ""),
    })
rows.sort(key=lambda r: (r["Stage"] == "No opp", r["Stage"][:1] if r["Stage"][:1].isdigit() else "0", r["Account"]), reverse=False)
rows.sort(key=lambda r: r["Stage"][:1] if r["Stage"][:1].isdigit() else "0", reverse=True)
(HERE / "upload").mkdir(exist_ok=True)
out = HERE / "upload" / "Account Plans Index.csv"
with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
print(f"wrote {out} with {len(rows)} accounts")
missing = [r["Account"] for r in rows if r["Account plan"] == "NOT PUBLISHED"]
if missing:
    print("NOT PUBLISHED:", ", ".join(missing))
