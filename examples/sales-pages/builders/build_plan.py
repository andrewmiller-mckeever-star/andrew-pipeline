#!/usr/bin/env python3
"""Build a key-account Plan of Attack page.

Layout follows a colleague's Plan of Attack page. Styles live in ../styles/plan.css.
Input:  plans/<account>.json
Output: plans/<account>.html

Usage: python3 -I builders/build_plan.py data/plans/northwind-analytics.json [out.html]
"""
import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def e(s):
    return html.escape(str(s or ""), quote=True)


def ini(name):
    parts = [p for p in str(name).replace(".", " ").split() if p[:1].isalnum()]
    if not parts:
        return "?"
    return (parts[0][:2] if len(parts) == 1 else parts[0][0] + parts[-1][0]).upper()


def rich(s):
    """Escape, then allow **bold** spans."""
    out, bold = [], False
    for i, chunk in enumerate(e(s).split("**")):
        if i:
            out.append("</b>" if bold else "<b>")
            bold = not bold
        out.append(chunk)
    if bold:
        out.append("</b>")
    return "".join(out)


def section(title, hint, body):
    h = f'<span class="hint">{e(hint)}</span>' if hint else ""
    return f'<section><div class="shead"><h2>{e(title)}</h2>\n{h}</div>\n{body}</section>\n'


def header(p):
    pills = "".join(f'<span class="bpill{" t" if i == 0 else ""}">{e(x)}</span>' for i, x in enumerate(p.get("pills", [])))
    news = "".join(
        f'<div class="nw {e(n.get("tone", ""))}"><span class="nk">{e(n["tag"])}</span><span>{e(n["text"])}<span class="nt">{e(n["date"])}</span></span></div>'
        for n in p.get("top_of_mind", []))
    blockers = "".join(
        f'<div class="bcard"><span class="tag">{e(b["tag"])}</span><div class="bt">{e(b["title"])}</div><div class="bd">{e(b["detail"])}</div></div>'
        for b in p.get("blockers", []))
    o = p.get("opportunity", {})
    return f"""<header class="mast"><div class="wrap">
<div class="mrow"><span class="eyebrow">{e(p["owner"])} &middot; API Sales</span></div>
<div class="banner"><div><div class="bid"><div class="bplate"><span class="wordmark">{e(p["account"])}</span></div><div><div class="beye">{e(p["year"])} Plan of Attack &middot; as of {e(p["as_of"])}</div><div class="bname">{e(p["account"])}</div></div></div><div class="bsub">{e(p["status_line"])}</div><div class="bpills">{pills}</div></div><div class="opp"><div class="ol">Opportunity</div><div class="oa">{e(o.get("amount"))}<small>{e(o.get("stage"))}</small></div><div class="od">{e(o.get("detail"))}</div></div></div><div class="newslbl">Top of mind</div><div class="news">{news}</div>
<div class="blockers"><div class="lbl">Blockers</div><div class="bgrid">{blockers}</div></div>
</div></header>
"""


def units(p):
    bm = p.get("business_map")
    if not bm:
        return ""
    cls = {"live": "live", "open": "open", "gated": "gated", "none": "none"}
    label = {"live": "Live eval", "open": "Deal open", "gated": "Gated", "none": "Not engaged"}
    cards = []
    for u in bm.get("units", []):
        st = cls.get(u.get("status"), "none")
        eps = "".join(f'<span class="ep">{e(x)}</span>' for x in u.get("endpoints", []))
        gate = f'<div class="gatenote">Gate: {e(u["gate"])}</div>' if u.get("gate") else ""
        cards.append(
            f'<div class="bu {st}"><div class="bh"><div class="bn">{e(u["name"])}</div><span class="bst">{label[st]}</span></div>'
            f'<div class="bw">{e(u.get("what"))}</div><dl><div><dt>Search</dt><dd>{e(u.get("search"))}</dd></div>'
            f'<div><dt>Endpoints</dt><dd>{eps}</dd></div><div><dt>Incumbent</dt><dd>{e(u.get("incumbent", "Unknown"))}</dd></div>'
            f'<div><dt>Owner</dt><dd>{e(u.get("owner", "Not engaged"))}</dd></div></dl>{gate}</div>')
    svg = f'<div class="bizmap-wrap">{bm["svg"]}</div>' if bm.get("svg") else ""
    body = (f'<div class="bm-ctx">{e(bm.get("context"))}</div>{svg}<div class="bm-sub">Unit by unit</div>'
            '<div class="bm-legend"><span><i style="background:var(--warn)"></i>Live eval</span><span><i style="background:var(--iris)"></i>Deal open</span>'
            '<span><i style="background:var(--risk)"></i>Gated</span><span><i style="background:var(--line)"></i>Not engaged</span></div>'
            f'<div class="bm-grid">{"".join(cards)}</div>')
    return section("Business structure map", "Where search lives, which endpoint fits, who holds it today.", body)


def next_action(p):
    n = p["next_action"]
    who = " with ".join(f'<b>{e(x)}</b>' for x in [n["lead"]]) + (
        " with " + " and ".join(f'<b>{e(x)}</b>' for x in n.get("with", [])) if n.get("with") else "")
    if n.get("for"):
        who += f', for <b>{e(n["for"])}</b>'
    body = (f'<div class="nact"><div class="nrow"><span class="nd">{e(n["date"])}</span><span class="nch">{e(n["channel"])}</span>'
            f'<span class="nwho">{who}</span></div><div class="nwhat">{e(n["what"])}</div>'
            f'<div class="nalso"><b>Then:</b> {e(n["then"])}</div></div>')
    return f'<section><div class="shead"><h2>Next action</h2></div>{body}</section>\n'


def phases(p):
    ph = p["phases"]
    done = sum(1 for x in ph if x["state"] == "done")
    items = []
    for i, x in enumerate(ph, 1):
        dot = "&#10003;" if x["state"] == "done" else str(i)
        items.append(f'<div class="ph {e(x["state"])}"><div class="prow"><span class="pdot num">{dot}</span><span class="pline"></span></div>'
                     f'<div class="pn">{e(x["name"])}</div><div class="pw">{e(x["when"])}</div><div class="pt">{e(x["outcome"])}</div></div>')
    now = next((i for i, x in enumerate(ph, 1) if x["state"] == "now"), None)
    hint = f'{done} of {len(ph)} phases complete.' + (f' Phase {now} is live now.' if now else "")
    return section("What we have done, and what is left", hint, f'<div class="rail compact">{"".join(items)}</div>')


def evaluation(p):
    ev = p["eval"]
    win = "".join(f'<li><b>{e(w["head"])}</b> {e(w["text"])}</li>' for w in ev["win"])
    lose = "".join(f'<li><b>{e(w["head"])}</b> {e(w["text"])}</li>' for w in ev["short"])
    body = (f'<div class="evalv3"><div class="gauge"><div class="gring" style="--p:{int(ev["confidence"])}"><span>{int(ev["confidence"])}%</span></div>'
            f'<div class="gl">Confidence we win</div><div class="gw">{e(ev["confidence_note"])}</div></div>'
            f'<div class="ecol up"><h3>Where we win</h3><ul>{win}</ul></div><div class="ecol down"><h3>Where we fall short</h3><ul>{lose}</ul></div></div>')
    return section("The eval", ev.get("hint"), body)


def thesis(p):
    t = p["thesis"]
    pri = "".join(f'<li><b>{e(x["head"])}</b> {e(x["text"])}</li>' for x in t["priorities"])
    return (f'<section><div class="hero"><div class="lbl">Deal thesis</div><p>{rich(t["paragraph"])}</p>'
            f'<ol class="win3">{pri}</ol></div></section>\n')


def path(p):
    mark = {"done": "&#10003;", "prog": "&hellip;", "unv": ""}
    items = "".join(
        f'<li class="{e(s["state"])}"><span class="pd">{mark.get(s["state"], "")}</span><div class="ph1"><span class="pnm">{e(s["name"])}</span>'
        f'<span class="pwh">{e(s["when"])}</span></div><div class="pnote">{e(s["note"])}</div><div class="pown">{e(s["owners"])}</div></li>'
        for s in p["path"])
    body = ('<div class="plegend"><span><i style="background:var(--win)"></i>Done</span><span><i style="background:var(--warn)"></i>In progress</span>'
            f'<span><i style="border:2px dashed var(--mut)"></i>Unverified or down the road</span></div><ol class="path">{items}</ol>')
    return section("Path to partnership", "Chronological. Legal, finance and signature are always the last three.", body)


def org(p):
    om = p["org_map"]
    status = {"talking": ("st-talking", '<span class="lv talk">Talking to</span>'),
              "target": ("st-target", '<span class="lv target">Trying to reach</span>'),
              "none": ("st-none", '<span class="lv" style="background:var(--line-soft);color:var(--mut)">Not engaged</span>')}
    people = [x for band in om["bands"] for x in band["people"] if not x.get("ghost")]
    count = {k: sum(1 for x in people if x.get("status") == k) for k in status}
    bands = []
    for band in om["bands"]:
        cards = []
        for x in band["people"]:
            if x.get("ghost"):
                cards.append(f'<div class="tcard ghost"><span class="avl init">?</span><div class="nm">{e(x["name"])}</div>'
                             f'<div class="ti">{e(x.get("title"))}</div><div class="own">{e(x.get("note"))}</div></div>')
                continue
            cls, pill = status.get(x.get("status"), status["none"])
            role = f'<span class="lv sg" style="background:var(--navy);color:var(--on-navy)">{e(x["badge"])}</span>' if x.get("badge") else ""
            cards.append(f'<div class="tcard {cls}"><span class="avl init">{ini(x["name"])}</span>{pill}{role}<div class="nm">{e(x["name"])}</div>'
                         f'<div class="ti">{e(x.get("title"))}</div><div class="own">{e(x.get("note"))}</div></div>')
        bands.append(f'<div class="bandlbl">{e(band["label"])}</div><div class="lvl">{"".join(cards)}</div>')
    gate_cols = []
    for col in om.get("gatekeepers", []):
        minis = "".join(
            f'<div class="mini{" talk" if x.get("status") == "talking" else ""}"><span class="avs init">{ini(x["name"])}</span>'
            f'<div class="who"><div class="nm">{e(x["name"])}</div><div class="ti">{e(x.get("title"))} &middot; '
            f'{ {"talking": "Talking to", "target": "Trying to reach"}.get(x.get("status"), "Not engaged")}</div></div></div>'
            for x in col["people"])
        gate_cols.append(f'<div class="tcol"><h4>{e(col["group"])}</h4>{minis}</div>')
    gate = (f'<div class="bandlbl" style="margin-top:22px">Gatekeepers &middot; who signs off on paper</div>'
            f'<div class="teamcols" style="margin-top:0">{"".join(gate_cols)}</div>') if gate_cols else ""
    fp = (f'<div class="fp"><div class="lbl">Where their people sit</div><div class="note">{e(om["footprint"])}</div></div>'
          if om.get("footprint") else "")
    rule = f'<div class="orgrule">{e(om["rule"])}</div>\n' if om.get("rule") else ""
    body = (f'{rule}<div class="card orgcard"><div class="orgsum"><span><b>{len(people)}</b> mapped</span>'
            f'<span><b>{count["talking"]}</b> talking to</span><span><b>{count["target"]}</b> trying to reach</span>'
            f'<span><b>{count["none"]}</b> not engaged</span><span class="orgleg"><span><i style="background:var(--win)"></i>Talking to</span>'
            f'<span><i style="background:var(--iris)"></i>Trying to reach</span><span><i style="background:var(--line)"></i>Not engaged</span></span></div>'
            f'<div class="tree">{"".join(bands)}{gate}</div>{fp}</div>')
    return section("Org map", f"{len(people)} people mapped", body)


def details(p):
    md = p.get("more_details", {})
    parts = []
    room = md.get("room")
    if room:
        signers = "".join(
            f'<div class="signer"><span class="av init">{ini(s["name"])}</span><div><span class="seat">{e(s["seat"])}</span>'
            f'<div class="nm">{e(s["name"])}</div><div class="ti">{e(s.get("title"))}</div><div class="rl">{e(s.get("why"))}</div>'
            f'<div class="mt">{e(s.get("email"))}</div></div></div>' for s in room.get("signers", []))
        rows = "".join(
            f'<tr><td><div class="who"><span class="av init">{ini(r["name"])}</span><div><div class="nm">{e(r["name"])}</div>'
            f'<div class="ti">{e(r.get("title"))}</div></div></div></td><td><span class="tag active">{e(r["seat"])}</span></td>'
            f'<td class="rl">{e(r["why"])}</td></tr>' for r in room.get("seats", []))
        parts.append(f'<details><summary><span class="caret">&#9654;</span>The room, in detail<span class="ct">{len(room.get("signers", []))} signers &middot; '
                     f'{len(room.get("seats", []))} named seats</span></summary><div class="body"><div class="signers">{signers}</div>'
                     f'<div class="tw"><table class="roster" style="min-width:560px"><tr><th>Who</th><th>Seat in this deal</th><th>Why they matter</th></tr>{rows}</table></div></div></details>')
    if md.get("surfaces"):
        rows = "".join(
            f'<tr><td class="k">{e(s["surface"])}<span class="sub">{e(s.get("sub"))}</span></td><td>{e(s["what"])}</td>'
            f'<td>{e(s.get("owner"))}</td><td>{e(s["angle"])}</td></tr>' for s in md["surfaces"])
        parts.append(f'<details><summary><span class="caret">&#9654;</span>Their surfaces<span class="ct">{len(md["surfaces"])} products</span></summary>'
                     f'<div class="body"><div class="tw"><table class="d"><tr><th>Surface</th><th>What it is</th><th>Owner</th><th>Our angle</th></tr>{rows}</table></div></div></details>')
    if md.get("commercials"):
        c = md["commercials"]
        rows = "".join(f'<tr><td class="k" style="white-space:normal">{e(r["use_case"])}</td><td>{e(r["surface"])}</td><td><span class="tam">{e(r["tam"])}</span></td></tr>'
                       for r in c.get("rows", []))
        notes = "".join(f'<li><div class="wh">{e(n["head"])}</div><div class="wb">{e(n["text"])}</div></li>' for n in c.get("notes", []))
        parts.append(f'<details><summary><span class="caret">&#9654;</span>Commercials &amp; TAM<span class="ct">scored use cases</span></summary><div class="body">'
                     f'<div class="tw"><table class="d" style="min-width:480px"><tr><th>Scored use case</th><th>Their surface</th><th>TAM (mid)</th></tr>{rows}</table></div>'
                     f'<ul class="watch" style="margin-top:14px">{notes}</ul></div></details>')
    for key, label in (("watch_list", "Watch list"), ("back_pocket", "Keep in the back pocket"), ("hygiene", "Data hygiene traps")):
        items = md.get(key)
        if not items:
            continue
        lis = "".join(
            (f'<li><span class="sev {e(w["sev"])}">{e(w["sev"])}</span><div>' if w.get("sev") else '<li><div>')
            + f'<div class="wh">{e(w["head"])}</div><div class="wb">{e(w["text"])}</div></div></li>' for w in items)
        parts.append(f'<details><summary><span class="caret">&#9654;</span>{label}<span class="ct">{len(items)} items</span></summary>'
                     f'<div class="body"><ul class="watch">{lis}</ul></div></details>')
    return section("More details", "Open what you need.", "\n".join(parts) + "\n")


def build(p):
    css = (HERE.parent / "styles" / "plan.css").read_text()
    log = " ".join(f'Updated {e(x["date"])}: {e(x["text"])}' for x in p.get("update_log", []))
    body = (header(p) + '\n<div class="wrap">\n' + units(p) + "\n" + next_action(p) + "\n" + phases(p) + "\n" + evaluation(p)
            + "\n" + thesis(p) + "\n" + path(p) + "\n" + org(p) + "\n" + details(p)
            + f'\n<footer><b>Internal only.</b> Sources: {e(p.get("sources"))}. {log}</footer>\n</div>\n')
    return f'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(p["account"])} &middot; {e(p["year"])} Plan of Attack ({e(p["month"])})</title>\n{css}\n{body}'


if __name__ == "__main__":
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".html")
    out.write_text(build(json.loads(src.read_text())))
    print(f"wrote {out}")
