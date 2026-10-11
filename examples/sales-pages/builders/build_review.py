#!/usr/bin/env python3
"""Render data/sfdc-review.json into sfdc-review.html (the Salesforce cleanup review page).

Input shape:
{"as_of":"YYYY-MM-DD","sotu_url":"","opps":[{"opp_id":"","account":"","group":"move|close|fill",
  "stage_now":"","stage_to":"","amount":"","close_date":"","evidence":"","sotu_band":"",
  "changes":[{"id":"c001","field":"StageName","label":"Stage","current":"","proposed":"","source":"",
              "ask":false,"options":[]}]}]}
Decisions are stored by the page in the artifact db at decisions/<change id>.
"""
import html, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
src = ROOT.parent / "data" / "sfdc-review.json"
out = ROOT.parent / "pages" / "pipeline-cleanup-review.html"
d = json.loads(src.read_text())

GROUPS = [
    ("move", "Move the stage", "The sources show these deals are past their current stage. Fill the gate fields, then step the stage forward."),
    ("close", "Close out", "No contact and no path. Closing them as lost needs a Loss Reason."),
    ("fill", "Fill in fields only", "The stage is right. These fields are blank or out of date."),
]

def e(s):
    return html.escape("" if s is None else str(s))

def change_row(c):
    ask = c.get("ask")
    opts = c.get("options") or []
    if ask and opts:
        ctl = f'<select id="v-{e(c["id"])}" class="val"><option value="">Pick one</option>' + "".join(
            f'<option>{e(o)}</option>' for o in opts) + "</select>"
    elif "\n" in str(c.get("proposed") or "") or len(str(c.get("proposed") or "")) > 140:
        rows = min(14, 2 + str(c["proposed"]).count("\n") + len(str(c["proposed"])) // 90)
        ctl = f'<textarea id="v-{e(c["id"])}" class="val" rows="{rows}" aria-label="Value for {e(c["label"])}">{e(c.get("proposed"))}</textarea>'
    else:
        ctl = f'<input id="v-{e(c["id"])}" class="val" type="text" value="{e(c.get("proposed"))}" aria-label="Value for {e(c["label"])}">'
    cur = c.get("current")
    cur_html = f'<span class="cur">{e(cur)}</span>' if cur not in (None, "", False) else '<span class="cur blank">blank</span>'
    src_html = f'<div class="src">{e(c.get("source"))}</div>' if c.get("source") else ""
    tag = '<span class="ask">Needs you</span>' if ask else ""
    return f'''<li class="chg{' is-ask' if ask else ''}" data-id="{e(c["id"])}" data-field="{e(c["field"])}">
  <div class="chg-head"><span class="num">{e(c["id"])}</span><span class="lbl">{e(c["label"])}</span>{tag}</div>
  <div class="chg-body">
    <div class="was">Now: {cur_html}</div>
    <div class="to">{ctl}{src_html}</div>
  </div>
  <div class="acts" role="group" aria-label="Decision for {e(c["id"])}">
    <button type="button" class="b ok" data-act="approve">Approve</button>
    <button type="button" class="b no" data-act="skip">Skip</button>
    <span class="state" aria-live="polite"></span>
  </div>
</li>'''

def opp_card(o):
    rows = "".join(change_row(c) for c in o["changes"])
    stage = e(o["stage_now"])
    if o.get("stage_to") and o["stage_to"] != o["stage_now"]:
        stage += f' <span class="arrow">to</span> <b>{e(o["stage_to"])}</b>'
    band = o.get("sotu_band") or ""
    return f'''<article class="opp" id="o-{e(o["opp_id"])}">
  <header class="opp-head">
    <div class="opp-title"><h3>{e(o["account"])}</h3><span class="band {e(band)}">{e(band)}</span></div>
    <div class="opp-meta"><span>{stage}</span><span>{e(o.get("amount"))}</span><span>Close {e(o.get("close_date"))}</span>
      <a href="{e(d.get("sfdc_base", "https://your-org.lightning.force.com"))}/lightning/r/Opportunity/{e(o["opp_id"])}/view" target="_blank" rel="noopener">Open in Salesforce</a></div>
    <p class="ev">{e(o.get("evidence"))}</p>
    <button type="button" class="b all" data-opp="{e(o["opp_id"])}">Approve all {len(o["changes"])} for this deal</button>
  </header>
  <ol class="chgs">{rows}</ol>
</article>'''

sections = []
for key, title, blurb in GROUPS:
    opps = [o for o in d["opps"] if o["group"] == key]
    if not opps:
        continue
    n = sum(len(o["changes"]) for o in opps)
    sections.append(f'''<section class="grp" id="g-{key}">
  <div class="grp-head"><h2>{e(title)}</h2><span class="count">{len(opps)} deals · {n} changes</span></div>
  <p class="blurb">{e(blurb)}</p>
  {''.join(opp_card(o) for o in opps)}
</section>''')

total = sum(len(o["changes"]) for o in d["opps"])
asks = sum(1 for o in d["opps"] for c in o["changes"] if c.get("ask"))
sotu = d.get("sotu_url")
sotu_link = f' · <a href="{e(sotu)}" target="_blank" rel="noopener">State of the Union</a>' if sotu else ""

page = f'''<title>Pipeline Cleanup Review</title>
<style>
/* Layout: one narrow reading column, grouped by action, each deal a ledger of numbered changes. */
:root {{
  --bg:#f6f7f9; --panel:#ffffff; --ink:#18202b; --mute:#5d6878; --line:#dde2ea;
  --accent:#1f5fbf; --ok:#1d7a46; --okbg:#e5f4ea; --no:#8a3b2e; --nobg:#f8e9e5; --ask:#8a5a00; --askbg:#fbf0d9;
  --f-display:"Manrope", system-ui, sans-serif; --f-body:"Manrope", system-ui, sans-serif;
  --f-mono:"JetBrains Mono", ui-monospace, Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg:#11161d; --panel:#18202a; --ink:#e6ebf2; --mute:#97a3b4; --line:#2a3442;
  --accent:#7aa8f0; --ok:#6fcf97; --okbg:#173326; --no:#f0a090; --nobg:#3a201b; --ask:#f0c46a; --askbg:#3a2e14; color-scheme:dark }} }}
:root[data-theme="dark"] {{
  --bg:#11161d; --panel:#18202a; --ink:#e6ebf2; --mute:#97a3b4; --line:#2a3442;
  --accent:#7aa8f0; --ok:#6fcf97; --okbg:#173326; --no:#f0a090; --nobg:#3a201b; --ask:#f0c46a; --askbg:#3a2e14; color-scheme:dark }}
body {{ background:var(--bg); color:var(--ink); font-family:var(--f-body); font-size:15px; line-height:1.5; }}
.wrap {{ max-width:880px; margin:0 auto; padding-inline:16px; padding-block:28px 64px; display:grid; gap:28px; }}
a {{ color:var(--accent); }}
h1,h2,h3 {{ font-family:var(--f-display); text-wrap:balance; margin:0; }}
h1 {{ font-size:28px; font-weight:800; letter-spacing:-.01em; }}
.mast p {{ margin:6px 0 0; color:var(--mute); max-width:65ch; }}
.tally {{ display:flex; flex-wrap:wrap; gap:8px 18px; margin-top:14px; font-variant-numeric:tabular-nums; font-size:14px; }}
.tally b {{ font-size:18px; }}
.howto {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px; font-size:14px; color:var(--mute); }}
.howto b {{ color:var(--ink); }}
.grp {{ display:grid; gap:14px; }}
.grp-head {{ display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 14px; border-bottom:2px solid var(--ink); padding-bottom:6px; }}
.grp-head h2 {{ font-size:20px; }}
.count {{ color:var(--mute); font-size:13px; font-variant-numeric:tabular-nums; }}
.blurb {{ margin:0; color:var(--mute); font-size:14px; }}
.opp {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden; }}
.opp-head {{ padding:14px 16px; display:grid; gap:6px; border-bottom:1px solid var(--line); }}
.opp-title {{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }}
.opp-title h3 {{ font-size:17px; }}
.band {{ font-size:11px; text-transform:uppercase; letter-spacing:.06em; padding:2px 8px; border-radius:99px; border:1px solid var(--line); color:var(--mute); }}
.band.moving {{ color:var(--ok); border-color:var(--ok); }} .band.watch {{ color:var(--ask); border-color:var(--ask); }}
.opp-meta {{ display:flex; flex-wrap:wrap; gap:4px 16px; font-size:13px; color:var(--mute); font-variant-numeric:tabular-nums; }}
.opp-meta b {{ color:var(--ink); }} .arrow {{ color:var(--mute); }}
.ev {{ margin:2px 0 0; font-size:14px; max-width:70ch; }}
.chgs {{ list-style:none; margin:0; padding:0; }}
.chg {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 14px; padding:12px 16px; border-top:1px solid var(--line); }}
.chg:first-child {{ border-top:0; }}
.chg-head {{ grid-column:1 / -1; display:flex; align-items:center; gap:10px; }}
.num {{ font-family:var(--f-mono); font-size:12px; color:var(--mute); }}
.lbl {{ font-weight:700; font-size:14px; }}
.ask {{ font-size:11px; background:var(--askbg); color:var(--ask); padding:1px 8px; border-radius:99px; }}
.chg-body {{ min-width:0; display:grid; gap:6px; }}
.was {{ font-size:13px; color:var(--mute); }} .cur.blank {{ font-style:italic; }}
.val {{ width:100%; resize:vertical; line-height:1.45; box-sizing:border-box; font:inherit; font-size:14px; padding:6px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--ink); }}
.src {{ font-size:12px; color:var(--mute); margin-top:3px; }}
.acts {{ display:flex; align-items:flex-start; gap:6px; flex-wrap:wrap; justify-content:flex-end; }}
.b {{ font:inherit; font-size:13px; font-weight:600; padding:6px 12px; border-radius:6px; border:1px solid var(--line); background:var(--panel); color:var(--ink); cursor:pointer; }}
.b:focus-visible, .val:focus-visible {{ outline:2px solid var(--accent); outline-offset:1px; }}
.b.all {{ justify-self:start; border-color:var(--accent); color:var(--accent); }}
.state {{ width:100%; text-align:right; font-size:12px; color:var(--mute); }}
.chg[data-dec="approve"] {{ background:var(--okbg); }} .chg[data-dec="approve"] .ok {{ background:var(--ok); color:var(--panel); border-color:var(--ok); }}
.chg[data-dec="skip"] {{ background:var(--nobg); }} .chg[data-dec="skip"] .no {{ background:var(--no); color:var(--panel); border-color:var(--no); }}
.note {{ font-size:13px; color:var(--mute); }}
@media (max-width:560px) {{ .chg {{ grid-template-columns:1fr; }} .acts {{ justify-content:flex-start; }} .state {{ text-align:left; }} }}
@media (prefers-reduced-motion: reduce) {{ * {{ transition:none !important; }} }}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=JetBrains+Mono:wght@400&display=swap">
<div class="wrap">
  <header class="mast">
    <h1>Pipeline Cleanup Review</h1>
    <p>Proposed Salesforce updates for {e(d.get('owner', 'the AE'))}'s open opps, as of {e(d["as_of"])}, built from the State of the Union sources and your Sales Path stage fields{sotu_link}.</p>
    <div class="tally"><span><b>{len(d["opps"])}</b> deals</span><span><b>{total}</b> changes</span><span><b>{asks}</b> need your answer</span><span id="progress">Loading your decisions…</span></div>
  </header>
  <div class="howto"><b>How this works.</b> Approve or skip each change. Edit the value box first if the proposal is wrong. Rows marked <b>Needs you</b> had no source, so type or pick the value. Nothing goes to Salesforce until you tell Claude "apply the approved changes". Claude then writes them, moves stages one step at a time, and reads each opp back to confirm.</div>
  {''.join(sections)}
  <p class="note">Internal only. Sources are named under each change. Field history in Salesforce keeps the old values.</p>
</div>
<script>
(async () => {{
  const rows = [...document.querySelectorAll('.chg')];
  const prog = document.getElementById('progress');
  const byId = Object.fromEntries(rows.map(r => [r.dataset.id, r]));
  const paint = (r, dec) => {{
    if (!dec) {{ r.removeAttribute('data-dec'); r.querySelector('.state').textContent = ''; return; }}
    r.dataset.dec = dec.status;
    const inp = r.querySelector('.val');
    if (dec.value != null && inp && inp.value !== dec.value) inp.value = dec.value;
    r.querySelector('.state').textContent = dec.status === 'approve' ? 'Approved' : 'Skipped';
  }};
  const count = () => {{
    const done = rows.filter(r => r.dataset.dec).length;
    prog.textContent = done + ' of ' + rows.length + ' decided';
  }};
  let db = null;
  try {{ db = window.claude ? await window.claude.use('db') : null; }} catch (_) {{ db = null; }}
  if (!db) {{
    prog.textContent = 'Read only here. Open this page signed in to claude.ai to record decisions.';
    document.querySelectorAll('.b').forEach(b => b.disabled = true);
    return;
  }}
  db.collection('decisions').onSnapshot(snap => {{
    const seen = new Set();
    for (const doc of snap.docs) {{ const r = byId[doc.id]; if (r) {{ paint(r, doc.data()); seen.add(doc.id); }} }}
    rows.forEach(r => {{ if (!seen.has(r.dataset.id)) paint(r, null); }});
    count();
  }}, () => {{ prog.textContent = 'Could not load decisions. Reload the page to try again.'; }});
  const save = async (r, status) => {{
    const inp = r.querySelector('.val');
    const value = inp ? inp.value.trim() : '';
    if (status === 'approve' && r.classList.contains('is-ask') && !value) {{
      r.querySelector('.state').textContent = 'Type or pick a value first';
      return;
    }}
    r.querySelector('.state').textContent = 'Saving…';
    try {{
      await db.doc('decisions/' + r.dataset.id).set({{ status, value, field: r.dataset.field, opp: r.closest('.opp').id.slice(2), at: new Date().toISOString() }});
    }} catch (err) {{
      r.querySelector('.state').textContent = 'Not saved. ' + (err && err.code === 'not_granted' ? 'You need edit access.' : 'Try again.');
    }}
  }};
  document.addEventListener('click', async ev => {{
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.act) {{ await save(b.closest('.chg'), b.dataset.act); return; }}
    if (b.dataset.opp) {{
      for (const r of document.querySelectorAll('#o-' + b.dataset.opp + ' .chg')) {{
        if (r.classList.contains('is-ask') && !r.querySelector('.val').value.trim()) continue;
        await save(r, 'approve');
      }}
    }}
  }});
}})();
</script>
'''
out.write_text(page)
print(f"wrote {out} ({len(d['opps'])} opps, {total} changes)")
