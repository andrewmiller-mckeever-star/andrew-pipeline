#!/usr/bin/env python3
"""Build a customer-shareable Joint Execution Plan as HTML for upload as a native Google Doc.

Layout follows a colleague's Joint Execution Plan template (five phases, CVOs, contacts, next steps).
Input:  plans/<slug>-jep.json
Output: plans/<slug>-jep.html

Usage: python3 -I build_jep.py data/plans/northwind-analytics-jep.json
"""
import html
import json
import sys
from pathlib import Path

NAVY, IRIS, SOFT, LINE = "#22285F", "#5368EE", "#ECF0FD", "#D7DEF4"
STATUS = {"Done": "#2C6B4F", "In progress": "#8A5A12", "Pending": "#5A6489"}


def e(s):
    return html.escape(str(s or ""))


def table(head, rows, widths=None):
    th = "".join(f'<th style="background:{NAVY};color:#fff;text-align:left;padding:6px 8px;font-size:10pt">{e(h)}</th>' for h in head)
    body = "".join(rows)
    return f'<table style="border-collapse:collapse;width:100%;margin:6pt 0 14pt" border="1" bordercolor="{LINE}" cellpadding="6"><tr>{th}</tr>{body}</table>'


def td(s, bold=False, color=None):
    style = "padding:6px 8px;font-size:10pt;vertical-align:top"
    if color:
        style += f";color:{color};font-weight:bold"
    inner = f"<b>{e(s)}</b>" if bold else e(s)
    return f'<td style="{style}">{inner}</td>'


def h2(s):
    return f'<h2 style="color:{IRIS};font-size:12pt;letter-spacing:1px;margin:18pt 0 4pt">{e(s)}</h2>'


def build(j):
    buyer = j.get("buyer_company") or j["account"]
    seller = j.get("seller", "Our company")
    out = [f'<p style="color:{NAVY};font-size:9pt">{e(seller)} × {e(buyer)} &nbsp;|&nbsp; Joint Execution Plan · Confidential · {e(j["date"])}</p>',
           f'<h1 style="color:{NAVY};font-size:24pt;margin:6pt 0 0">{e(seller)} × {e(buyer)}</h1>',
           f'<p style="color:{NAVY};font-size:16pt;margin:0 0 4pt">Joint Execution Plan</p>',
           f'<p style="font-size:10pt;color:#5A6489">AE: {e(j["ae"])} · API Architect: {e(j.get("api_architect") or "TBD")} · Confidential · {e(j["date"])}</p>']
    out.append(h2("AGREED SUCCESS CRITERIA: CUSTOMER VERIFIABLE OUTCOMES (CVOs)"))
    rows = [f'<tr>{td(f"CVO {i}", True)}{td(c["metric"])}{td(c["target"])}{td(c["timeframe"])}</tr>' for i, c in enumerate(j["cvos"], 1)]
    out.append(table(["#", "Metric (what we are measuring)", "Target (by how much)", "Timeframe (by when)"], rows))
    out.append(h2("MILESTONES & TIMELINE"))
    rows = []
    for ph in j["phases"]:
        rows.append(f'<tr><td colspan="6" style="background:{SOFT};color:{NAVY};font-weight:bold;padding:6px 8px;font-size:10pt">{e(ph["name"])}</td></tr>')
        for r in ph["rows"]:
            st = r.get("status", "Pending")
            rows.append(f'<tr>{td(r["activity"])}{td(r.get("date"))}{td(r.get("seller", r.get("ydc")))}{td(r.get("account"))}{td(st, color=STATUS.get(st))}{td(r.get("notes"))}</tr>')
    out.append(table(["Activity", "Date", seller, buyer, "Status", "Notes"], rows))
    out.append(h2("KEY CONTACTS"))
    rows = [f'<tr><td colspan="5" style="background:{SOFT};color:{NAVY};font-weight:bold;padding:6px 8px;font-size:10pt">{e(seller.upper())}</td></tr>']
    rows += [f'<tr>{td(c["name"])}{td(seller)}{td(c.get("title"))}{td(c.get("role"))}{td(c.get("email"))}</tr>' for c in (j["contacts"].get("seller") or j["contacts"].get("ydc") or [])]
    rows.append(f'<tr><td colspan="5" style="background:{SOFT};color:{NAVY};font-weight:bold;padding:6px 8px;font-size:10pt">{e(buyer.upper())}</td></tr>')
    rows += [f'<tr>{td(c["name"])}{td(buyer)}{td(c.get("title"))}{td(c.get("role"))}{td(c.get("email"))}</tr>' for c in j["contacts"]["buyer"]]
    out.append(table(["Name", "Company", "Title", "Role", "Email / notes"], rows))
    out.append(h2("IMMEDIATE NEXT STEPS"))
    out.append("<ul>" + "".join(f'<li style="font-size:10.5pt;margin-bottom:4pt"><b>{e(s["owner"])}</b> {e(s["text"])}</li>' for s in j["next_steps"]) + "</ul>")
    out.append(f'<p style="color:#5A6489;font-size:8.5pt;margin-top:18pt">Confidential · {e(seller)} × {e(buyer)} · {e(j["ae"])} · {e(j.get("ae_email", ""))} · {e(j["date"])}</p>')
    return '<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#141A33">' + "\n".join(out) + "</body></html>"


if __name__ == "__main__":
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".html")
    out.write_text(build(json.loads(src.read_text())))
    print(f"wrote {out}")
