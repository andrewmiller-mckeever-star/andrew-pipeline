#!/usr/bin/env python3
"""Build a weekly State of the Union page (AE and manager 1:1).

Layout follows a colleague's State of the Union page. Styles live in ../styles/sotu.css.
Input:  data/sotu-data.json
Output: state-of-the-union.html (same folder)

Usage: python3 -I build_sotu.py [data.json] [out.html]
"""
import html
import json
import sys
from collections import OrderedDict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
STAGES = {"discovery": 1, "qualification": 2, "tech eval": 3, "proof of value": 4,
          "agreement": 5, "submit to close": 5}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def e(s):
    return html.escape(str(s or ""), quote=True)


def d(s):
    return date.fromisoformat(s) if s else None


def money(n):
    if n is None:
        return "$0"
    if n >= 1_000_000:
        m = n / 1_000_000
        return f"${m:,.0f}M" if m == int(m) else f"${m:,.2f}M".rstrip("0")
    if n >= 1000:
        k = n / 1000
        return f"${k:,.0f}K" if k >= 10 or k == int(k) else f"${k:,.1f}K"
    return f"${n:,.0f}"


def stage_label(stage):
    s = (stage or "").split("-", 1)[-1].strip()
    return s or "Discovery"


def stage_num(stage):
    return STAGES.get(stage_label(stage).lower(), 1)


def initials(name):
    parts = [p for p in name.replace(".", " ").split() if p[:1].isalnum()]
    return (parts[0][:2] if len(parts) == 1 else parts[0][0] + parts[1][0]).upper() if parts else "?"


def days_since(o, today):
    lc = d(o.get("last_contact"))
    return (today - lc).days if lc else None


def band(o, today):
    ds = days_since(o, today)
    if ds is None or ds > 45:
        return "quiet"
    return o.get("band") or "watch"


def score(o, today):
    s = stage_num(o.get("stage")) * 12
    s += 15 if o.get("pricing", {}).get("live") else 0
    ds = days_since(o, today)
    s += max(0, 30 - (ds if ds is not None else 90) / 2)
    cd = d(o.get("close_date"))
    if cd and 0 <= (cd - today).days <= 30:
        s += 10
    if o.get("booked"):
        s += 5
    return round(s)


def task_items(tasks, deal_id, account):
    # A task may carry "group" (a list name shown as a heading when it changes) and
    # "done": true (shown pre-checked until the viewer unchecks it).
    out = []
    group = None
    for t in tasks:
        text = t["text"]
        if t.get("group") and t["group"] != group:
            group = t["group"]
            out.append(f'<li class="task-group">{e(group)}</li>')
        done = bool(t.get("done"))
        out.append(
            f'<li draggable="true" data-deal="{e(deal_id)}" data-text="{e(text)}" data-default="{"done" if done else "open"}">\n'
            f'        <span class="task-grip" title="Drag to reorder: top task is next" aria-hidden="true">&#8942;&#8942;</span>\n'
            f'        <label><input type="checkbox" data-deal="{e(deal_id)}" data-account="{e(account)}" data-text="{e(text)}"><span>{e(text)}</span></label>\n'
            f'        <span class="task-owner" title="{e(t.get("source", ""))}">{e(t.get("owner", "TBD"))}</span>\n'
            f'        <button type="button" class="task-x" title="Cancel this task" aria-label="Cancel task" data-deal="{e(deal_id)}" data-account="{e(account)}" data-text="{e(text)}">&times;</button>\n'
            f'      </li>')
    return "".join(out)


PLAN_URLS = {}
JEP_URLS = {}
INDEX_URL = [None]


def jep_for(name):
    key = (name or "").lower().split(" (")[0]
    for acct, url in JEP_URLS.items():
        if acct.lower().split(" (")[0] == key:
            return url
    return None


def plan_buttons(account):
    p, j = plan_for(account), jep_for(account)
    b = []
    if p:
        b.append(f'<a class="pbtn" href="{e(p)}" target="_blank" rel="noopener">Plan of attack &#8599;</a>')
    if j:
        b.append(f'<a class="pbtn pbtn-2" href="{e(j)}" target="_blank" rel="noopener">Joint plan &#8599;</a>')
    return ''.join(b)


def plan_for(name):
    key = (name or "").lower().split(" (")[0]
    for acct, url in PLAN_URLS.items():
        if acct.lower().split(" (")[0] == key:
            return url
    return None


def linked(name, url):
    return f'<a class="plan-link" href="{e(url)}" target="_blank" rel="noopener">{e(name)}</a>' if url else e(name)


def deal_card(o, today):
    b = band(o, today)
    purl = plan_for(o.get("account"))
    foot = ""
    btns = plan_buttons(o.get("account"))
    btn_row = f'  <div class="pbtns">{btns}</div>\n' if btns else ''
    n = stage_num(o.get("stage"))
    rail = "".join(f'<i class="{"on" if i < n else ""}"></i>' for i in range(5))
    amt = o.get("amount_display") or "PayGo"
    amt_html = f'<span class="paygo">{e(amt)}</span>' if not amt.startswith("$") or amt in ("$0", "$0K") else e(amt)
    tag = ' <span class="tag">Renewal</span>' if o.get("is_renewal") else ""
    champ = o.get("champion") or {}
    price = o.get("pricing") or {}
    pcls = "price-live" if price.get("live") else "price-none"
    tasks = o.get("tasks") or []
    ds = days_since(o, today)
    if ds is None:
        contact = '<span class="cold">No contact logged</span>'
    elif ds <= 0:
        contact = '<span class="">Touched today</span>'
    else:
        contact = f'<span class="{"cold" if ds > 45 else ""}">{ds} days since contact</span>'
    cd = d(o.get("close_date"))
    booked = f'<span class="booked">{e(o["booked"])} booked</span>' if o.get("booked") else ""
    tasks_html = ""
    if tasks:
        tasks_html = (f'  <div class="block tasks">\n    <dt>Outstanding<span class="task-count">{len(tasks)} open</span></dt>\n'
                      f'    <ul class="tasklist">\n      {task_items(tasks, o.get("opp_id"), o.get("account"))}\n    </ul>\n  </div>\n')
    return (
        f'<article class="deal {b}" data-band="{b}" data-renewal="{1 if o.get("is_renewal") else 0}" data-score="{score(o, today)}">\n'
        f'  <header class="deal-top">\n'
        f'    <span class="prob" title="Salesforce probability"><b>{int(o.get("probability") or 0)}%</b><span>win</span></span>\n'
        f'    <span class="band-pill">{b.title()}</span>\n  </header>\n'
        f'  <div class="deal-id">\n'
        f'    <span class="mark"><span class="mark-text">{e(initials(o.get("name_on_card") or o.get("account")))}</span></span>\n'
        f'    <div class="deal-name">\n      <h4>{linked(o.get("name_on_card") or o.get("account"), purl)}{tag}</h4>\n'
        f'      <div class="stage"><span class="rail">{rail}</span>{e(stage_label(o.get("stage")))}</div>\n    </div>\n'
        f'    <div class="amt">{amt_html}</div>\n  </div>\n'
        f'{btn_row}'
        f'  <dl class="facts">\n'
        f'    <div><dt>Champion</dt><dd>{e(champ.get("name") or "Not named")}<span>{e(champ.get("title"))}</span></dd></div>\n'
        f'    <div><dt>Pricing</dt><dd class="{pcls}">{e(price.get("text") or "No pricing discussed yet")}</dd></div>\n  </dl>\n'
        f'  <div class="block stuck">\n    <dt>Why we\'re stuck</dt>\n    <p>{e(o.get("why_stuck"))}</p>\n  </div>\n'
        f'  <div class="block move">\n    <dt>Next step</dt>\n    <p>{e(o.get("next_step"))}</p>\n  </div>\n'
        f'{tasks_html}'
        f'  <footer class="deal-foot">\n    <span>Close {MONTHS[cd.month - 1]} {cd.day}</span>\n    {contact}\n    {booked}\n    {foot}\n  </footer>\n'
        f'</article>')


def board(opps, today, quotas, board_id, hidden):
    def qkey(o):
        cd = d(o["close_date"])
        return (cd.year, (cd.month - 1) // 3 + 1)
    quarters = OrderedDict()
    for o in sorted(opps, key=lambda o: o["close_date"]):
        quarters.setdefault(qkey(o), []).append(o)
    parts = [f'<main class="wrap board" id="{board_id}"{" hidden" if hidden else ""}>']
    for (yr, q), qopps in quarters.items():
        booked = sum(o.get("amount") or 0 for o in qopps)
        quota = quotas.get(f"Q{q} {yr}")
        qt = f'<span class="q-target"><b>{e(quota)}</b> quota</span>' if quota else ""
        parts.append(
            f'  <section class="quarter">\n  <div class="q-head">\n    <h2>Q{q} <span>{yr}</span></h2>\n'
            f'    <div class="q-meta">\n      <span><b>{len(qopps)}</b> deals</span>\n'
            f'      <span><b>{money(booked)}</b> booked value</span>\n      {qt}\n    </div>\n  </div>')
        months = OrderedDict()
        for o in qopps:
            months.setdefault(d(o["close_date"]).month, []).append(o)
        for m, mopps in months.items():
            mval = sum(o.get("amount") or 0 for o in mopps)
            meta = f'{len(mopps)} deal{"s" if len(mopps) != 1 else ""}' + (f' &middot; {money(mval)}' if mval else "")
            cards = "".join(deal_card(o, today) for o in sorted(mopps, key=lambda o: -score(o, today)))
            parts.append(
                f'  <section class="month">\n  <div class="month-head">\n    <h3>{MONTHS[m - 1]}<span>{yr}</span></h3>\n'
                f'    <span class="month-meta">{meta}</span>\n  </div>\n  <div class="grid">{cards}</div>\n</section>')
        parts.append('</section>')
    parts.append('</main>')
    return "\n".join(parts)


def key_account(k):
    stats = "".join(
        f'<div class="w-stat"><dt>{label}</dt>\n      <dd>{e(k[f]["value"])}</dd><p>{e(k[f].get("note"))}</p></div>'
        for label, f in [("Billed so far", "billed_so_far"), ("Contract rates", "contract_rates"),
                         ("Usage, last 30 days", "usage_30d"), ("Where it stalls", "where_it_stalls")])
    plan = (f'\n      <a class="w-plan" href="{e(k["plan_url"])}" target="_blank" rel="noopener">Plan of attack &#8599;</a>'
            if k.get("plan_url") else "")
    if jep_for(k["account"]):
        plan += f'\n      <a class="w-plan" href="{e(jep_for(k["account"]))}" target="_blank" rel="noopener">Joint plan &#8599;</a>'
    todos = k.get("things_to_do") or []
    return (
        f'<article class="whale">\n    <header class="w-top">\n'
        f'      <span class="mark"><span class="mark-text">{e(initials(k["account"]))}</span></span>\n'
        f'      <div class="w-name"><h3>{e(k["account"])}</h3><div class="w-sub">Customer since {e(k.get("customer_since"))} &middot; {e(k.get("terms"))}</div></div>\n'
        f'      <span class="w-badge">Key account</span>{plan}\n    </header>\n'
        f'    <dl class="w-stats">{stats}</dl>\n'
        f'    <div class="block stuck w-why"><dt>Why it needs work</dt><p>{e(k.get("why_it_needs_work"))}</p></div>\n'
        f'    <div class="block tasks w-tasks">\n      <dt>Things to do<span class="task-count">{len(todos)} open</span></dt>\n'
        f'      <ul class="tasklist">\n        {task_items(todos, k.get("opp_id", k["account"]), k["account"])}\n      </ul>\n    </div>\n  </article>')


def build(data):
    today = d(data["as_of"])
    man = ROOT / "data" / "manifest.json"
    if man.exists():
        mj = json.load(open(man))
        PLAN_URLS.update(mj.get("plans", {}))
        JEP_URLS.update(mj.get("jeps", {}))
        INDEX_URL[0] = mj.get("index_sheet")
    for k in data["key_accounts"]:
        k["plan_url"] = plan_for(k["account"]) or k.get("plan_url")
    opps = data["opps"]
    new = [o for o in opps if not o.get("is_renewal")]
    ren = [o for o in opps if o.get("is_renewal")]
    bands = {b: sum(1 for o in new if band(o, today) == b) for b in ("moving", "watch", "quiet")}
    total = sum(o.get("amount") or 0 for o in new)
    weighted = sum((o.get("amount") or 0) * (o.get("probability") or 0) / 100 for o in new)
    k = data["kpis"]
    won, lost, disc = k["won"], k["lost_after_discovery"], k["lost_in_discovery"]
    # Every loss counts, including deals that died in Discovery
    rate = round(100 * won / (won + lost + disc)) if won + lost + disc else 0
    target = k.get("year_target")
    pct = round(100 * k["closed_won_amount"] / target) if target else None
    target_html = (
        f'<dd>{money(target)}</dd>\n        <div class="bar"><i style="width:{min(pct, 100)}%"></i></div>\n'
        f'        <div class="note">${k["closed_won_amount"]:,.0f} closed won, {pct}% of target</div>'
        if target else
        f'<dd>${k["closed_won_amount"]:,.0f}</dd>\n        <div class="note">Closed won this year. Add your target to track %.</div>')
    quota_html = (f'<dd>{e(k["quota_headline"])}</dd>\n        <div class="note quota-note">{k["quota_note_html"]}</div>'
                  if k.get("quota_headline") else '<dd>TBD</dd>\n        <div class="note">Add your quarterly quota.</div>')

    agenda = "".join(
        f'<li class="{e(a.get("band", "moving"))}">\n  <div class="ag-top"><span class="ag-co">{linked(a["account"], plan_for(a["account"]))}</span>'
        f'<span class="ag-amt">{e(a["amount"])}</span></div>\n  <p>{e(a["line"])}</p>\n</li>\n'
        for a in data["open_with_three"])
    keys = "\n".join(key_account(ka) for ka in data["key_accounts"])
    css = (ROOT / "styles" / "sotu.css").read_text()
    owner, manager = data.get("owner", "AE"), data.get("manager", "Manager")
    first = lambda n: n.split()[0]
    as_of = f'{today.strftime("%B")} {today.day}, {today.year}'

    return f"""<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(first(owner))} and {e(first(manager))} 1:1</title>
{css}
<style>.plan-link{{color:inherit;text-decoration:none;border-bottom:1px dotted var(--ink-3)}}.plan-link:hover{{color:var(--accent);border-bottom-color:var(--accent)}}.plan-foot{{margin-left:auto;color:var(--accent);text-decoration:none}}.plan-foot:hover{{text-decoration:underline}}.pbtns{{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:11px}}.pbtn{{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:800;text-decoration:none;color:#fff;background:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:4px 11px;white-space:nowrap}}.pbtn:hover{{filter:brightness(1.08)}}.pbtn:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}.pbtn-2{{background:var(--accent-soft);color:var(--accent)}}.pbtn-all{{padding:6px 13px;font-size:12px}}</style>

<header class="mast">
  <div class="wrap">
    <div class="mast-row">
      <div>
        <div class="eyebrow">{e(first(owner))} &middot; {e(first(manager))} &middot; weekly 1:1</div>
        <h1>State of the Union</h1>
        <p class="sub">Every open deal, ranked by how close it is to money. Green is furthest along with live pricing. Amber is moving but early or blocked. Red has gone quiet.</p>
      </div>
      <span class="stamp">As of {as_of}</span>
    </div>

    <dl class="kpis">
      <div class="kpi"><dt>Total pipeline</dt><dd>{money(total)}</dd>
        <div class="note">{money(weighted)} weighted by probability</div></div>
      <div class="kpi"><dt>Open opps</dt><dd>{len(new)}</dd>
        <div class="note">{bands['moving']} moving &middot; {bands['watch']} watch &middot; {bands['quiet']} quiet</div></div>
      <div class="kpi"><dt>Close rate</dt><dd>{rate}%</dd>
        <div class="note">{won} won vs {lost + disc} lost, including {disc} that died in Discovery</div></div>
      <div class="kpi"><dt>Year target</dt>{target_html}</div>
      <div class="kpi"><dt>Quota split</dt>{quota_html}</div>
    </dl>
  </div>
</header>

<section class="wrap whales">
    <div class="sec-label">Key accounts <span class="w-note">customers we are building out</span></div>
    {keys}
</section>

<div class="wrap">
  <section class="agenda">
    <div class="sec-label">Open with these three</div>
    <ol>{agenda}</ol>
  </section>

  <div class="controls">
    <div class="legend">
      <span><i class="l-moving"></i>Furthest along, live pricing, recent contact</span>
      <span><i class="l-watch"></i>Real movement, but early, small, or blocked</span>
      <span><i class="l-quiet"></i>No contact in 45+ days, or stalled with no path</span>
    </div>
    <div class="filters" role="group" aria-label="Filter deals">
      <button type="button" id="f-all" data-f="all" aria-pressed="true">All {len(new)}</button>
      <button type="button" id="f-moving" data-f="moving" aria-pressed="false">Moving {bands['moving']}</button>
      <button type="button" id="f-watch" data-f="watch" aria-pressed="false">Watch {bands['watch']}</button>
      <button type="button" id="f-quiet" data-f="quiet" aria-pressed="false">Quiet {bands['quiet']}</button>
      <button type="button" id="f-renewals" data-f="renewals" class="renewals-btn" aria-pressed="false">Renewals {len(ren)}</button>
      {f'<a class="pbtn pbtn-all" href="{e(INDEX_URL[0])}" target="_blank" rel="noopener">All plans of attack &#8599;</a>' if INDEX_URL[0] else ''}
    </div>
  </div>
</div>

{board(new, today, data.get("quotas", {}), "board-new", False)}
<div class="wrap"><p class="empty" id="empty">No deals match that filter.</p></div>
{board(ren, today, {}, "board-renewals", True)}

<footer class="wrap foot">
  <b>How the ranking works.</b> Each deal scores on stage, how far pricing has gone, days to close, and days since real contact, then takes a bump for a booked meeting. Salesforce misses in-person meetings and Slack, so "days since contact" uses whichever is more recent: the CRM stamp, Gmail, or the last genuine two-way Slack touch. Anything past 45 days with no contact is red regardless of score.<br>
  Salesforce pulled {as_of}. Checked tasks and drag order are saved in this browser only.
</footer>

<script>
(function(){{
  var btns = Array.prototype.slice.call(document.querySelectorAll('.filters button'));
  var boardNew = document.getElementById('board-new');
  var boardRenewals = document.getElementById('board-renewals');
  var cards = Array.prototype.slice.call(boardNew.querySelectorAll('.deal'));
  var empty = document.getElementById('empty');
  function apply(f){{
    btns.forEach(function(b){{ b.setAttribute('aria-pressed', String(b.dataset.f === f)); }});
    if (f === 'renewals') {{ boardNew.hidden = true; boardRenewals.hidden = false; empty.style.display = 'none'; return; }}
    boardRenewals.hidden = true; boardNew.hidden = false;
    var shown = 0;
    cards.forEach(function(c){{ var ok = f === 'all' || c.dataset.band === f; c.hidden = !ok; if (ok) shown++; }});
    boardNew.querySelectorAll('.month').forEach(function(m){{ m.hidden = !m.querySelector('.deal:not([hidden])'); }});
    boardNew.querySelectorAll('.quarter').forEach(function(q){{ q.hidden = !q.querySelector('.deal:not([hidden])'); }});
    empty.style.display = shown ? 'none' : 'block';
  }}
  btns.forEach(function(b){{ b.addEventListener('click', function(){{ apply(b.dataset.f); }}); }});

  // Per-viewer state only: checked and cancelled tasks are remembered in this browser.
  var KEY = 'sotu-tasks';
  var state = {{}};
  try {{ state = JSON.parse(localStorage.getItem(KEY) || '{{}}'); }} catch (err) {{ state = {{}}; }}
  function save(){{ try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (err) {{}} }}
  function recount(ul){{
    var block = ul.closest('.tasks');
    var open = ul.querySelectorAll('li[data-text]:not(.done):not(.cancelled)').length;
    var c = block && block.querySelector('.task-count');
    if (c) c.textContent = open + ' open';
  }}
  document.querySelectorAll('.tasklist li[data-text]').forEach(function(li){{
    var id = li.dataset.deal + '|' + li.dataset.text;
    var cb = li.querySelector('input[type="checkbox"]');
    var x = li.querySelector('.task-x');
    var preDone = li.dataset.default === 'done';
    if (state[id] === 'done' || (preDone && state[id] === undefined)) {{ li.classList.add('done'); cb.checked = true; }}
    if (state[id] === 'cancelled') li.classList.add('cancelled');
    cb.addEventListener('change', function(){{
      li.classList.toggle('done', cb.checked);
      if (cb.checked) {{ if (preDone) delete state[id]; else state[id] = 'done'; }}
      else {{ if (preDone) state[id] = 'open'; else delete state[id]; }}
      save(); recount(li.parentNode);
    }});
    x.addEventListener('click', function(){{
      var on = !li.classList.contains('cancelled');
      li.classList.toggle('cancelled', on);
      if (on) state[id] = 'cancelled'; else delete state[id];
      save(); recount(li.parentNode);
    }});
  }});
  document.querySelectorAll('.tasklist').forEach(recount);

  var dragLi = null;
  function clearMarks(ul){{ ul.querySelectorAll('.drop-above,.drop-below').forEach(function(n){{ n.classList.remove('drop-above','drop-below'); }}); }}
  document.querySelectorAll('.tasklist').forEach(function(ul){{
    ul.addEventListener('dragstart', function(ev){{
      var li = ev.target.closest && ev.target.closest('li[data-text]'); if (!li) return;
      dragLi = li; li.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', li.dataset.text);
    }});
    ul.addEventListener('dragover', function(ev){{
      if (!dragLi || dragLi.parentNode !== ul) return;
      ev.preventDefault();
      var li = ev.target.closest('li'); clearMarks(ul);
      if (!li || li === dragLi) return;
      var r = li.getBoundingClientRect();
      li.classList.add(ev.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
    }});
    ul.addEventListener('drop', function(ev){{
      if (!dragLi || dragLi.parentNode !== ul) return;
      ev.preventDefault();
      var li = ev.target.closest('li');
      if (li && li !== dragLi) {{
        var r = li.getBoundingClientRect();
        ul.insertBefore(dragLi, ev.clientY < r.top + r.height / 2 ? li : li.nextSibling);
      }}
      clearMarks(ul);
    }});
    ul.addEventListener('dragend', function(){{ if (dragLi) dragLi.classList.remove('dragging'); clearMarks(ul); dragLi = null; }});
  }});
}})();
</script>
"""


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "sotu-data.json"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "pages" / "state-of-the-union.html"
    out.write_text(build(json.loads(src.read_text())))
    print(f"wrote {out}")
