#!/usr/bin/env python3
"""
Add Location + other dropped columns back to Event Priority CSV.
Reads original CSV → builds lookup by event name → merges into output CSV.
"""

import csv, re

ORIGINAL_CSV = "/Users/andrew/Downloads/Event Intelligence Report - 🎯 Recommended Events.csv"
OUTPUT_CSV   = "/Users/andrew/Downloads/Event Priority - Andrew Miller-McKeever.csv"
FINAL_CSV    = "/Users/andrew/Downloads/Event Priority - Andrew Miller-McKeever.csv"

# ── 1. Parse original CSV → lookup keyed by normalised name ──────────────────

def normalise(s):
    """Lowercase, strip punctuation/spaces, for fuzzy matching."""
    return re.sub(r'[^a-z0-9]', '', s.lower())

orig_lookup = {}   # normalised_name → dict of fields

with open(ORIGINAL_CSV, newline='', encoding='utf-8') as f:
    rows = list(csv.reader(f))

# Row 0 is the title banner; data starts at row 1
for row in rows[1:]:
    if len(row) < 14:
        continue
    if not row[0].strip().isdigit():
        continue

    name        = row[1].strip()
    location    = row[5].strip()
    size        = row[6].strip()
    mkt_score   = row[7].strip()
    priority_lv = row[8].strip()   # HIGH / MEDIUM
    cost        = row[9].strip()
    verticals   = row[11].strip()
    description = row[13].strip()

    orig_lookup[normalise(name)] = {
        "orig_name":    name,
        "location":     location,
        "size":         size,
        "priority_lv":  priority_lv,
        "cost":         cost,
        "verticals":    verticals,
        "description":  description,
    }

# ── 2. Manual name-mapping for the cases that don't fuzzy-match well ─────────

MANUAL_MAP = {
    normalise("All Things Open 2026"):        normalise("developer_first AI / All Things Open 2026"),
    normalise("KubeCon NA 2026"):             normalise("KubeCon + CloudNativeCon North America 2026"),
    normalise("a16z Tech Week NY"):           normalise("a16z Tech Week — New York"),
    normalise("Web Summit Lisbon 2026"):      normalise("Web Summit 2026 (Lisbon)"),
    normalise("a16z Tech Week SF 2026"):      normalise("a16z Tech Week — San Francisco"),
    normalise("Databricks Data+AI Summit"):   normalise("Data + AI Summit 2026 (Databricks)"),
    normalise("World AI Week Amsterdam"):     normalise("World AI Week 2026"),
    normalise("AI Engineer World's Fair"):    normalise("AI Engineer World's Fair 2026"),
}

def lookup_orig(output_name):
    key = normalise(output_name)
    # try direct match
    if key in orig_lookup:
        return orig_lookup[key]
    # try manual remap
    if key in MANUAL_MAP:
        remapped = MANUAL_MAP[key]
        if remapped in orig_lookup:
            return orig_lookup[remapped]
    # fallback: partial match (first 10 chars)
    for okey, odata in orig_lookup.items():
        if key[:10] in okey or okey[:10] in key:
            return odata
    return None

# ── 3. Read current output CSV and enrich ────────────────────────────────────

with open(OUTPUT_CSV, newline='', encoding='utf-8') as f:
    reader    = csv.DictReader(f)
    old_rows  = list(reader)
    old_fields = reader.fieldnames

# New column order:
# Priority | Event | Date | Location | Final Score | Mkt Score |
# Mktg Priority | Attendance Size | Cost | Verticals |
# Attendee Accts | Attendee Count | Att Breakdown |
# Speaker Accts | Speaker Count | Spkr Breakdown |
# Sponsor Accts | Sponsor Count | Spons Breakdown |
# Speaker Page URL | Sponsor Page URL | Notes | Description

NEW_FIELDS = [
    "Priority",
    "Event",
    "Date",
    "Location",
    "Final Score",
    "Marketing Score",
    "Mktg Priority",
    "Attendance Size",
    "Cost",
    "Verticals",
    "Attendee Accts (My SFDC)",
    "Attendee Count",
    "Att Breakdown",
    "Speaker Accts (My SFDC)",
    "Speaker Count",
    "Spkr Breakdown",
    "Sponsor Accts (My SFDC)",
    "Sponsor Count",
    "Spons Breakdown",
    "Speaker Page URL",
    "Sponsor Page URL",
    "Notes",
    "Description",
]

enriched_rows = []
unmatched = []

for row in old_rows:
    event_name = row.get("Event", "")
    orig = lookup_orig(event_name)

    if orig is None:
        unmatched.append(event_name)
        location    = ""
        size        = ""
        priority_lv = ""
        cost        = ""
        verticals   = ""
        description = ""
    else:
        location    = orig["location"]
        size        = orig["size"]
        priority_lv = orig["priority_lv"]
        cost        = orig["cost"]
        verticals   = orig["verticals"]
        description = orig["description"]

    new_row = {
        "Priority":                row.get("Priority", ""),
        "Event":                   event_name,
        "Date":                    row.get("Date", ""),
        "Location":                location,
        "Final Score":             row.get("Final Score", ""),
        "Marketing Score":         row.get("Marketing Score", ""),
        "Mktg Priority":           priority_lv,
        "Attendance Size":         size,
        "Cost":                    cost,
        "Verticals":               verticals,
        "Attendee Accts (My SFDC)": row.get("Attendee Accts (My SFDC)", ""),
        "Attendee Count":          row.get("Attendee Count", ""),
        "Att Breakdown":           row.get("Att Breakdown", ""),
        "Speaker Accts (My SFDC)": row.get("Speaker Accts (My SFDC)", ""),
        "Speaker Count":           row.get("Speaker Count", ""),
        "Spkr Breakdown":          row.get("Spkr Breakdown", ""),
        "Sponsor Accts (My SFDC)": row.get("Sponsor Accts (My SFDC)", ""),
        "Sponsor Count":           row.get("Sponsor Count", ""),
        "Spons Breakdown":         row.get("Spons Breakdown", ""),
        "Speaker Page URL":        row.get("Speaker Page URL", ""),
        "Sponsor Page URL":        row.get("Sponsor Page URL", ""),
        "Notes":                   row.get("Notes", ""),
        "Description":             description,
    }
    enriched_rows.append(new_row)

# ── 4. Write final CSV ────────────────────────────────────────────────────────

with open(FINAL_CSV, "w", newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=NEW_FIELDS)
    writer.writeheader()
    writer.writerows(enriched_rows)

print(f"✅  Written {len(enriched_rows)} rows to: {FINAL_CSV}")
if unmatched:
    print(f"⚠   Could not match {len(unmatched)} events to original CSV: {unmatched}")
else:
    print("   All events matched successfully.")
