#!/usr/bin/env python3
"""Build a living account plan page (the 16-section exec format).

Section order is fixed (see skills/living-account-plan/section-contract.md):
hero, status bar, traction, where I need help (always third), what's changed, next steps,
why this account, the wedge, warm paths, plan of attack, buying committee, org map,
products & owners, footprint + clocks, use cases & TAM + risks, internal-only footer.

Input:  data/living/<slug>.json
Output: pages/<slug>-living-plan.html
Usage:  python3 -I builders/build_living_plan.py data/living/contoso-ai.json
"""
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def e(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def ini(name):
    parts = [p for p in str(name).split() if p[:1].isalnum()]
    return ((parts[0][0] + parts[-1][0]) if len(parts) > 1 else (parts[0][:2] if parts else "?")).upper()


def sec(title, body, kicker="", cls=""):
    k = f'<p class="kicker">{e(kicker)}</p>' if kicker else ""
    return f'<section class="sec {cls}">{k}<h2>{e(title)}</h2>{body}</section>'


def ul(items):
    return "<ul>" + "".join(f"<li>{e(i)}</li>" for i in items) + "</ul>" if items else '<p class="empty">Nothing yet.</p>'


CSS = """<style>
/* Layout: one 960px reading column. Hero and asks first, reference material lower. */
:root{--bg:#f5f6f2;--card:#ffffff;--ink:#1d2421;--mute:#5f6b66;--line:#dfe4df;--accent:#2f6f5e;--accent-soft:#e3efe9;
 --warn:#9a5b12;--warn-soft:#f7ecdc;--bad:#9b2f2f;--bad-soft:#f6e3e1;--good:#2f6f3e;--good-soft:#e2f0e5;
 --f-head:"Fraunces",Georgia,serif;--f-body:"Inter Tight",system-ui,-apple-system,sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#131816;--card:#1b2220;--ink:#e6ece9;--mute:#9aa8a2;--line:#2c3632;
 --accent:#7fc4ae;--accent-soft:#1f3530;--warn:#e8b56d;--warn-soft:#3a2d17;--bad:#f09a90;--bad-soft:#3b1f1d;--good:#86d39a;--good-soft:#1c3523;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#131816;--card:#1b2220;--ink:#e6ece9;--mute:#9aa8a2;--line:#2c3632;--accent:#7fc4ae;--accent-soft:#1f3530;
 --warn:#e8b56d;--warn-soft:#3a2d17;--bad:#f09a90;--bad-soft:#3b1f1d;--good:#86d39a;--good-soft:#1c3523;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--f-body);padding-inline:16px;padding-block:28px 60px}
.wrap{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
h1,h2,h3{font-family:var(--f-head);font-weight:600;margin:0;text-wrap:balance}
h1{font-size:clamp(30px,5vw,44px);line-height:1.1}
h2{font-size:21px;margin-bottom:12px}
.kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin:0 0 4px}
.sec{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px;min-width:0}
.hero{background:var(--accent);color:#fff;border:none}
.hero .kicker{color:rgba(255,255,255,.75)}
.hero p.thesis{font-size:17px;max-width:62ch;margin:10px 0 14px}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.16)}
.statusbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:var(--line);border-radius:12px;overflow:hidden;border:1px solid var(--line)}
.statusbar div{background:var(--card);padding:12px 14px}
.statusbar dt{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.statusbar dd{margin:2px 0 0;font-weight:700;font-variant-numeric:tabular-nums}
.health-green{color:var(--good)}.health-amber{color:var(--warn)}.health-red{color:var(--bad)}
.cols4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.cols2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.col h3{font-family:var(--f-body);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin-bottom:6px}
ul{margin:0;padding-left:18px}li{margin-bottom:4px}
.asks{border-left:4px solid var(--warn)}
.ask{padding:10px 0;border-bottom:1px solid var(--line)}.ask:last-child{border-bottom:none}
.ask b{display:block}.ask .for{font-size:12.5px;color:var(--warn);font-weight:700}
.log li{list-style:none;margin-left:-18px;padding:6px 0;border-bottom:1px dashed var(--line)}
.log .d{font-variant-numeric:tabular-nums;color:var(--mute);font-size:12.5px;margin-right:8px}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:480px}
th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);padding:6px 8px;border-bottom:2px solid var(--line)}
td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.st{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
.st-done{background:var(--good-soft);color:var(--good)}.st-open{background:var(--accent-soft);color:var(--accent)}.st-late{background:var(--bad-soft);color:var(--bad)}
.wedge .angle{font-size:17px;font-family:var(--f-head)}
.paths li{margin-bottom:8px}.paths .str{font-size:11.5px;font-weight:700;color:var(--accent);margin-left:6px}
.phases{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.phase{border-top:3px solid var(--accent);padding-top:8px}
.people{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.person{display:flex;gap:10px;align-items:flex-start}
.av{width:38px;height:38px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}
.person .t{font-size:13px;color:var(--mute)}
.org{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.team{border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.bar{height:8px;border-radius:4px;background:var(--line);margin:3px 0 8px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
.tam{font-variant-numeric:tabular-nums;font-weight:700}
.risk li::marker{color:var(--bad)}
footer{font-size:12.5px;color:var(--mute);text-align:center}
.empty{color:var(--mute);font-style:italic;margin:0}
@media (max-width:760px){.cols4{grid-template-columns:repeat(2,minmax(0,1fr))}.cols2,.phases{grid-template-columns:1fr}}
@media (max-width:440px){.cols4{grid-template-columns:1fr}}
</style>"""


def build(p):
    s = p["status"]
    health = s.get("health", "Amber")
    status = "".join(f"<div><dt>{e(k)}</dt><dd{v}</dd></div>" for k, v in [
        ("Last updated", f">{e(s['last_updated'])}"), ("Next review", f">{e(s['next_review'])}"),
        ("Stage", f">{e(s['stage'])}"), ("Health", f' class="health-{e(health.lower())}">{e(health)}'),
        ("Pipeline", f">{e(s['pipeline'])}"), ("Usage", f">{e(s['usage'])}"),
        ("Open next steps", f">{len([x for x in p['next_steps'] if x['status'] != 'Done'])}")])
    t = p["traction"]
    traction = '<div class="cols4">' + "".join(
        f'<div class="col"><h3>{lbl}</h3>{ul(t.get(k, []))}</div>'
        for lbl, k in [("Landed", "landed"), ("Tried, no traction", "tried"), ("Blockers", "blockers"), ("Next move", "next_move")]) + "</div>"
    asks = "".join(f'<div class="ask"><span class="for">For {e(a["for"])}</span><b>{e(a["ask"])}</b><span>{e(a["why"])}</span></div>'
                   for a in p["asks"]) or '<p class="empty">No asks this week.</p>'
    log = '<ul class="log">' + "".join(f'<li><span class="d">{e(c["date"])}</span>{e(c["text"])}</li>' for c in p["changelog"]) + "</ul>"
    stcls = {"Done": "st-done", "Open": "st-open", "Late": "st-late"}
    steps = ('<div class="tw"><table><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr>' + "".join(
        f'<tr><td>{e(x["action"])}</td><td>{e(x["owner"])}</td><td>{e(x["due"])}</td><td><span class="st {stcls.get(x["status"], "st-open")}">{e(x["status"])}</span></td></tr>'
        for x in p["next_steps"]) + "</table></div>")
    why = "".join(f"<p>{e(x)}</p>" for x in p["why"])
    w = p["wedge"]
    wedge = f'<p class="angle">{e(w["angle"])}</p><p>Named buyers: {e(", ".join(w["buyers"]))}</p>'
    paths = '<ol class="paths">' + "".join(f'<li><b>{e(x["path"])}</b> via {e(x["via"])}<span class="str">{e(x["strength"])}</span></li>' for x in p["warm_paths"]) + "</ol>"
    phases = '<div class="phases">' + "".join(f'<div class="phase"><h3>{e(x["phase"])}</h3><p class="kicker">{e(x["when"])}</p>{ul(x["goals"])}</div>' for x in p["phases"]) + "</div>"
    committee = '<div class="people">' + "".join(
        f'<div class="person"><span class="av">{ini(x["name"])}</span><div><b>{e(x["name"])}</b><div class="t">{e(x["title"])}</div>'
        f'<div class="t">{e(x["role"])} · {e(x["location"])}</div></div></div>' for x in p["committee"]) + "</div>"
    org = ("<p>" + " · ".join(f'<b>{e(x["name"])}</b>, {e(x["title"])}' for x in p["org"]["leaders"]) + '</p><div class="org">' + "".join(
        f'<div class="team"><b>{e(x["team"])}</b><div class="t">Lead: {e(x["lead"])}</div>{ul(x["people"])}</div>' for x in p["org"]["teams"]) + "</div>")
    products = ('<div class="tw"><table><tr><th>Product</th><th>Owner</th><th>Our angle</th></tr>' + "".join(
        f'<tr><td><b>{e(x["product"])}</b></td><td>{e(x["owner"])}</td><td>{e(x["angle"])}</td></tr>' for x in p["products"]) + "</table></div>")
    foot = "".join(f'<div>{e(x["place"])} · {e(x["share"])}%<div class="bar"><i style="width:{int(x["share"])}%"></i></div></div>' for x in p["footprint"])
    clocks = '<ul class="log">' + "".join(f'<li><span class="d">{e(x["date"])}</span>{e(x["event"])}</li>' for x in p["clocks"]) + "</ul>"
    ucs = ('<div class="tw"><table><tr><th>Use case</th><th>Score</th><th>TAM</th></tr>' + "".join(
        f'<tr><td>{e(x["name"])}</td><td>{e(x["score"])}</td><td class="tam">{e(x["tam_calls_m"])}M calls/yr</td></tr>' for x in p["use_cases"]) + "</table></div>")
    risks = '<ul class="risk">' + "".join(f"<li>{e(r)}</li>" for r in p["risks"]) + "</ul>"
    pills = "".join(f'<span class="pill">{e(x)}</span>' for x in p["pills"])
    body = "".join([
        f'<section class="sec hero"><p class="kicker">Living account plan · {e(p["owner"])}</p><h1>{e(p["account"])}</h1><p class="thesis">{e(p["thesis"])}</p><div class="pills">{pills}</div></section>',
        f'<dl class="statusbar">{status}</dl>',
        sec("Account traction at a glance", traction),
        sec("Where I need help", asks, "Read this first", "asks"),
        sec("What's changed", log),
        sec("Next steps and due dates", steps),
        sec(p.get("why_title", "Why this account"), why),
        sec("The wedge", wedge, cls="wedge"),
        sec("Warm paths, ranked", paths),
        sec("Phase one, phase two, phase three", phases, "Plan of attack"),
        sec("Buying committee, in order of deal-closing power", committee),
        sec("Leadership and the teams underneath", org, "Org map"),
        sec("Every product, its owner, and our angle", products),
        f'<div class="cols2"><div class="sec"><h2>Where their people sit</h2>{foot}</div><div class="sec"><h2>The clocks on this account</h2>{clocks}</div></div>',
        f'<div class="cols2"><div class="sec"><h2>Pre-scored use cases and TAM</h2>{ucs}</div><div class="sec"><h2>What can stall this account</h2>{risks}</div></div>',
        f'<footer><b>Internal only.</b> {e(p["provenance"])}</footer>'])
    return f'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(p["account"])} · Living Account Plan</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter+Tight:wght@400;600;700&display=swap">\n{CSS}\n<div class="wrap">{body}</div>'


if __name__ == "__main__":
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "pages" / (src.stem + "-living-plan.html")
    out.write_text(build(json.loads(src.read_text())))
    print(f"wrote {out}")
