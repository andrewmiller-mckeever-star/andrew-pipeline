#!/usr/bin/env python3
"""Turn research sfdc_facts + live SFDC field values into data/sfdc-review.json.

usage: make_review.py <opp-fields.json from sf data query --json> <as_of YYYY-MM-DD> [sotu_url]
Reads data/research/{key,big,small,renewals}.json (whichever exist) for sfdc_facts.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
fields_file, as_of = sys.argv[1], sys.argv[2]
sotu_url = sys.argv[3] if len(sys.argv) > 3 else ""

live = {r["Id"]: r for r in json.load(open(fields_file))["result"]["records"]}
facts, cards = {}, {}
for g in ("key", "big", "small", "pursuits", "renewals"):
    p = ROOT / "data" / "research" / f"{g}.json"
    if p.exists():
        for o in json.loads(p.read_text()).get("opps", []):
            cards[o["opp_id"]] = o
            facts[o["opp_id"]] = o.get("sfdc_facts") or {}

STAGES = ["1 - Discovery", "2 - Qualification", "3 - Tech Eval", "4 - Proof of Value", "5 - Agreement", "6 - Submit to Close"]
PICK = {
    "Technical_Sophistication__c": ["AI Native", "AI Laggard"],
    "Eval_Set_Signal__c": ["Has Own Dataset", "Open to Public Evals", "No Eval Expected", "Unknown"],
    "Eval_Path__c": ["A - Skip Eval", "B - Standard Public", "C - Custom Bespoke"],
    "Eval_Ran_By__c": ["Us", "Customer", "Joint"],
    "Technical_Acceptance__c": ["Yes", "No", "Pending"],
    "CVO_in_Proposal__c": ["Yes", "No"],
    "Commitment_to_Purchase__c": ["Yes", "No", "Verbal"],
    "Legal_Process_Initiated__c": ["Yes", "No"],
    "NDA_Status__c": ["N/A", "Sent", "Signed"],
    "Contract_Status__c": ["Sent", "RedLines", "Final Review", "Signed"],
    "CVO_in_Contract_Scope__c": ["Yes", "No", "N/A"],
    "Loss_Reason__c": ["Lost to Competitor", "No Budget / Lost Funding", "No Decision / Non-Responsive", "Price", "Other"],
    "Close_Reason__c": ["Unresponsive/No Decision", "Poor Fit/Low Volume", "Timing/Priority Change", "Lost to Competitor", "Pricing/Cost", "Feature Gap/Capability Limitation", "Unqualified/Fake Opportunity"],
    "Incumbent_Provider__c": ["None", "Unkown", "Brave", "Exa", "Google - Search API", "Parallel", "Perplexity", "Tavily", "SerpAPI", "Other"],
    "Primary_API_Endpoint__c": ["Search API", "Contents API", "Research API - Lite", "Research API - Standard", "Research API - Deep", "Research API - Exhaustive", "Eco Search API", "People Company API", "Monitor API"],
    "Eval_Status__c": ["In Progress", "Complete", "Deferred", "Not Required"],
}
COMPETITION = {"Brave", "Exa", "Google - Search API", "Microsoft - Bing Search API", "Parallel", "Perplexity", "Tavily",
               "Amazon Web Services", "Anthropic", "Cohere", "Glean", "Google - Cloud AI", "Harvey", "Hebbia"}
LABEL = {
    "StageName": "Stage", "CloseDate": "Close Date", "NextStep": "Next Step", "Next_Step_Date__c": "Next Step Date",
    "Defined_Use_Case__c": "Defined Use Case", "Competition__c": "Competition", "Volume_Estimate_API_Monthly_Calls__c": "API Calls/Month",
    "Technical_Sophistication__c": "Technical Sophistication", "Eval_Set_Signal__c": "Eval Set Signal", "Eval_Path__c": "Eval Path",
    "Economic_Buyer__c": "Economic Buyer", "Champion__c": "Champion", "Metrics__c": "Metrics (success metric)",
    "Identify_Pain__c": "Identify Pain", "Eval_Runner_Email__c": "Eval Runner Email", "Eval_Ran_By__c": "Eval Ran By",
    "Proposal_Sent_Date__c": "Proposal Sent Date", "Proposal_Feedback__c": "Proposal Feedback", "Technical_Acceptance__c": "Technical Acceptance",
    "CVO_in_Proposal__c": "Success metric in proposal", "Commitment_to_Purchase__c": "Commitment to Purchase",
    "Legal_Process_Initiated__c": "Legal Process Initiated", "NDA_Status__c": "NDA Status", "Contract_Status__c": "Contract Status",
    "CVO_in_Contract_Scope__c": "Success metric in contract scope", "Projected_Close_Date__c": "Projected Close Date",
    "Loss_Reason__c": "Loss Reason", "Close_Reason__c": "Close Reason (required to close)", "Incumbent_Provider__c": "Incumbent Provider (required to close)",
    "Primary_API_Endpoint__c": "Primary API Endpoint", "Pricing_Shown__c": "Pricing Shown?", "Deal_Blocker__c": "Deal Blocker",
    "Eval_Status__c": "Eval Status", "Decision_Process__c": "Decision Process", "Decision_Criteria__c": "Decision Criteria",
}
# Sales Path gate fields to EXIT each stage (index into STAGES)
GATE = {
    0: ["Defined_Use_Case__c", "Competition__c", "Volume_Estimate_API_Monthly_Calls__c", "Technical_Sophistication__c", "Eval_Set_Signal__c"],
    1: ["Eval_Path__c", "Economic_Buyer__c", "Champion__c", "Metrics__c"],
    2: ["Eval_Runner_Email__c", "Eval_Ran_By__c"],
    3: ["Proposal_Sent_Date__c", "Proposal_Feedback__c", "Technical_Acceptance__c", "CVO_in_Proposal__c", "Commitment_to_Purchase__c"],
    4: ["Legal_Process_Initiated__c", "NDA_Status__c", "Contract_Status__c", "CVO_in_Contract_Scope__c", "Projected_Close_Date__c"],
}
FACT = {
    "Defined_Use_Case__c": "defined_use_case", "Volume_Estimate_API_Monthly_Calls__c": "monthly_call_volume",
    "Technical_Sophistication__c": "technical_sophistication", "Eval_Set_Signal__c": "eval_set_signal", "Eval_Path__c": "eval_path",
    "Economic_Buyer__c": "economic_buyer", "Champion__c": "champion", "Metrics__c": "cvo_metric", "Identify_Pain__c": "identify_pain",
    "Eval_Runner_Email__c": "eval_runner_email", "Eval_Ran_By__c": "eval_ran_by", "Proposal_Sent_Date__c": "proposal_sent_date",
    "Proposal_Feedback__c": "proposal_feedback", "Technical_Acceptance__c": "technical_acceptance",
    "Commitment_to_Purchase__c": "commitment_to_purchase", "Legal_Process_Initiated__c": "legal_process_initiated",
    "NDA_Status__c": "nda_status", "Contract_Status__c": "contract_status", "Projected_Close_Date__c": "projected_close_date",
    "Loss_Reason__c": "loss_reason", "Primary_API_Endpoint__c": "primary_api_endpoint", "Incumbent_Provider__c": "incumbent_provider",
    "Deal_Blocker__c": "deal_blocker", "Eval_Status__c": "eval_status", "Decision_Process__c": "decision_process",
    "Decision_Criteria__c": "decision_criteria",
}
OPTIONAL_IF_FOUND = ["Identify_Pain__c", "Primary_API_Endpoint__c", "Incumbent_Provider__c", "Deal_Blocker__c",
                     "Eval_Status__c", "Decision_Process__c", "Decision_Criteria__c", "Pricing_Shown__c"]

def blank(v):
    return v in (None, "", False, [])

def norm(field, v):
    if blank(v):
        return None
    if field == "Competition__c":
        vals = v if isinstance(v, list) else [x.strip() for x in str(v).split(";")]
        vals = [x for x in vals if x in COMPETITION]
        return ";".join(vals) or None
    if field == "Legal_Process_Initiated__c" and isinstance(v, bool):
        return "Yes" if v else "No"
    if field in PICK and str(v) not in PICK[field]:
        return None
    if field == "Volume_Estimate_API_Monthly_Calls__c":
        try:
            return str(int(float(v)))
        except (TypeError, ValueError):
            return None
    return str(v)

out, n = [], 0
def cid():
    global n
    n += 1
    return f"c{n:03d}"

for oid, r in sorted(live.items(), key=lambda kv: (kv[1]["CloseDate"] or "", kv[1]["Account"]["Name"])):
    f = facts.get(oid, {})
    card = cards.get(oid, {})
    src = f.get("source") or ""
    cur_i = STAGES.index(r["StageName"]) if r["StageName"] in STAGES else 0
    # Rule: renewals stay open until the renewal date unless the customer says they won't renew.
    # Only renewals closing within 90 days belong in the cleanup, and none are proposed for close here.
    if r["Type"] == "Renewal" and r["CloseDate"] and r["CloseDate"] > (
            __import__("datetime").date.fromisoformat(as_of) + __import__("datetime").timedelta(days=90)).isoformat():
        continue
    sug = f.get("suggested_stage") or "keep"
    if r["Type"] == "Renewal" and sug == "Closed Lost":
        sug = "keep"
    group, target_i = "fill", cur_i
    if sug == "Closed Lost":
        group = "close"
    elif sug in STAGES and STAGES.index(sug) > cur_i:
        group, target_i = "move", STAGES.index(sug)
    ch = []

    def add(field, proposed, source=src, ask=False, current=None):
        cur = r.get(field) if current is None else current
        if field == "Competition__c" and cur:
            cur = cur.replace(";", ", ")
        ch.append({"id": cid(), "field": field, "label": LABEL.get(field, field), "current": cur,
                   "proposed": proposed or "", "source": source if proposed else "No source found. Your call.",
                   "ask": ask or not proposed, "options": PICK.get(field, [])})

    # gate fields for every stage up to (and including) the one being exited
    if group != "close":
        # required: exit fields of every stage already passed (or being passed). Current stage's exit
        # fields are proposed only when a source has them (Discovery's are always asked: they're the basics).
        for gi in range(0, 5):
            required = gi < target_i or gi == 0
            for fld in GATE[gi]:
                if not blank(r.get(fld)) or (fld == "Eval_Runner_Email__c" and r.get("Eval_Credits_Not_Required__c")):
                    continue
                val = norm(fld, f.get(FACT.get(fld, "")) if fld != "Competition__c" else f.get("competition"))
                if fld == "Eval_Runner_Email__c" and not val and "A - Skip" in str(r.get("Eval_Path__c") or f.get("eval_path") or ""):
                    continue  # validation exempts Skip Eval
                if required or (gi == target_i and val):
                    add(fld, val)
        for fld in OPTIONAL_IF_FOUND:
            if fld == "Pricing_Shown__c":
                if f.get("pricing_shown") is True and not r.get(fld):
                    add(fld, "true")
                continue
            val = norm(fld, f.get(FACT[fld]))
            if val and blank(r.get(fld)):
                add(fld, val)
    if group == "move":
        steps = " then ".join(STAGES[cur_i + 1: target_i + 1])
        add("StageName", STAGES[target_i], f"{f.get('stage_evidence') or ''} Moves one step at a time: {steps}.".strip())
    if group == "close":
        add("StageName", "Closed Lost", f.get("stage_evidence") or src)
        add("Loss_Reason__c", norm("Loss_Reason__c", f.get("loss_reason")))
        lr = f.get("loss_reason") or ""
        # Close_Reason__c depends on StageName. Only these are valid with Closed Lost (checked 10/11):
        # Other, Timing / Not Ready, Continue Without Contract, Incumbent Renewal, Product / Feature Gap,
        # Tech Eval Performance, Pricing / Value, Champion Left, Gone Dark, Pass to Weaver.
        cr = {"No Decision / Non-Responsive": "Gone Dark", "Price": "Pricing / Value"}.get(lr)
        PICK["Close_Reason__c"] = ["Gone Dark", "Timing / Not Ready", "Champion Left", "Product / Feature Gap",
                                   "Tech Eval Performance", "Pricing / Value", "Incumbent Renewal", "Other"]
        add("Close_Reason__c", cr, "Mapped from the loss reason." if cr else src)
        if blank(r.get("Incumbent_Provider__c")):
            add("Incumbent_Provider__c", norm("Incumbent_Provider__c", f.get("incumbent_provider")))
    if group != "close":
        sc = f.get("suggested_close_date")
        if sc and sc != r["CloseDate"]:
            add("CloseDate", sc)
        elif r["CloseDate"] and r["CloseDate"] < as_of:
            add("CloseDate", None)
        ns = (f.get("next_step_short") or "")[:255]
        if ns and ns != (r.get("NextStep") or ""):
            add("NextStep", ns)
        nsd = f.get("next_step_date")
        if nsd and nsd != r.get("Next_Step_Date__c"):
            add("Next_Step_Date__c", nsd)
    ev_bits = [f.get("stage_evidence")]
    if f.get("amount_note"):
        ev_bits.append("Amount: " + f["amount_note"])
    if f.get("missing_contact_roles"):
        ev_bits.append("Not on the opp as contact roles: " + ", ".join(f["missing_contact_roles"]) + ".")
    if group == "move" and not r.get("HasOpportunityLineItem") and cur_i == 0:
        ev_bits.append("Needs a product line item before it can leave Discovery.")
    if not f:
        ev_bits.append("No research for this opp yet.")
    out.append({"opp_id": oid, "account": r["Account"]["Name"], "group": group, "stage_now": r["StageName"],
                "stage_to": STAGES[target_i] if group == "move" else ("Closed Lost" if group == "close" else ""),
                "amount": f"${r['Amount']:,.0f}" if r.get("Amount") else "No amount", "close_date": r["CloseDate"],
                "evidence": " ".join(b for b in ev_bits if b), "sotu_band": card.get("band", ""), "changes": ch})

out = [o for o in out if o["changes"]]
(ROOT / "data" / "sfdc-review.json").write_text(json.dumps({"as_of": as_of, "sotu_url": sotu_url, "opps": out}, indent=1))
print(f"{len(out)} opps, {n} changes:", {g: sum(1 for o in out if o['group'] == g) for g in ('move', 'close', 'fill')})
