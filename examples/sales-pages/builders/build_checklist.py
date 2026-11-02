#!/usr/bin/env python3
"""Build the Week Checklist page: one column of to-dos, grouped by urgency.

Input:  data/checklist-data.json
Output: pages/week-checklist.html

The page carries its own data in a JSON script tag. Published as a claude.ai artifact with the
`artifact` capability, ticking, adding and removing items saves the page in place for everyone
with the link. Opened as a local file, changes last until reload.

Data shape:
{"owner": "Sam Taylor", "as_of": "Fri Oct 9, morning",
 "sources": "State of the Union refreshed Fri 10/9, Salesforce, Slack, Gmail and meeting notes",
 "sections": [{"id": "1on1", "title": "Morgan 1:1 · Fri 10/9", "note": "Decisions first."}, ...,
              {"id": "done", "title": "Done since last week", "note": ""}],
 "items": [{"id": "x1", "sec": "1on1", "acct": "Northwind Analytics", "text": "...", "note": "...",
            "tags": ["decision"], "hot": true, "done": false}, ...]}
"""
import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FONTS = ("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700"
         "&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap")
RESET = (":root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);"
         "padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}"
         "body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;"
         "color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}")

CSS = """
/* Layout: one narrow column, sections stacked by urgency, a sticky progress strip on top */
:root{
  --bg:#F3F4F8; --surface:#FFFFFF; --sunk:#E9EBF3;
  --ink:#161B33; --ink-2:#4A5175; --ink-3:#7A809E;
  --line:#DDE0EC; --accent:#3F55D6; --accent-soft:#E6E9FB;
  --hot:#B83A2C; --hot-bg:#FBE9E6; --ok:#147A55; --ok-bg:#E2F3EB;
  --display:'Bricolage Grotesque',ui-sans-serif,system-ui,sans-serif;
  --body:'Public Sans',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0F1224; --surface:#181C34; --sunk:#14182D;
  --ink:#E6E8F5; --ink-2:#A9AFD2; --ink-3:#7D84AC;
  --line:#2A2F52; --accent:#8D9CFF; --accent-soft:#242B57;
  --hot:#F28B7C; --hot-bg:#3C1D1A; --ok:#55D3A0; --ok-bg:#123327; color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#0F1224; --surface:#181C34; --sunk:#14182D;
  --ink:#E6E8F5; --ink-2:#A9AFD2; --ink-3:#7D84AC;
  --line:#2A2F52; --accent:#8D9CFF; --accent-soft:#242B57;
  --hot:#F28B7C; --hot-bg:#3C1D1A; --ok:#55D3A0; --ok-bg:#123327; color-scheme:dark;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.wrap{max-width:760px;margin:0 auto;padding-inline:16px;padding-block:28px 64px}
h1,h2{margin:0;font-family:var(--display);text-wrap:balance}
h1{font-size:clamp(28px,5vw,38px);font-weight:700;letter-spacing:-.02em;line-height:1.05}
.sub{margin-top:6px;color:var(--ink-2);font-size:14px}
.strip{position:sticky;top:env(safe-area-inset-top,0px);z-index:2;background:var(--bg);padding-block:14px 12px;margin-top:14px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
.meter{flex:1;min-width:180px;height:8px;border-radius:4px;background:var(--sunk);overflow:hidden}
.meter i{display:block;height:100%;background:var(--accent);border-radius:4px;transition:width .25s}
.count{font-family:var(--mono);font-size:13px;color:var(--ink-2)}
.status{font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--sunk);color:var(--ink-2)}
.status.ok{background:var(--ok-bg);color:var(--ok)}
.status.warn{background:var(--hot-bg);color:var(--hot)}
section{margin-top:30px}
.sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-bottom:8px;border-bottom:2px solid var(--ink)}
h2{font-size:21px;font-weight:700;letter-spacing:-.01em}
.sec-meta{font-family:var(--mono);font-size:12px;color:var(--ink-3)}
.sec-note{margin:8px 0 0;font-size:13px;color:var(--ink-3)}
ul.items{list-style:none;margin:0;padding:0}
li.item{display:grid;grid-template-columns:22px 1fr auto;gap:4px 12px;align-items:start;padding:12px 2px;border-bottom:1px solid var(--line)}
li.item input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--accent);cursor:pointer}
.body{min-width:0}
.text{font-weight:600;font-size:15px;line-height:1.4;cursor:pointer}
.note{margin-top:3px;font-size:13.5px;color:var(--ink-2);line-height:1.45}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.tag{font-family:var(--mono);font-size:11px;padding:1px 7px;border-radius:5px;background:var(--sunk);color:var(--ink-2);white-space:nowrap}
.tag.hot{background:var(--hot-bg);color:var(--hot)}
.tag.acct{background:var(--accent-soft);color:var(--accent)}
li.done .text{text-decoration:line-through;color:var(--ink-3)}
li.done .note,li.done .tags{opacity:.55}
.x{border:0;background:transparent;color:var(--ink-3);font-size:18px;line-height:1;width:26px;height:26px;border-radius:6px;cursor:pointer;opacity:.5}
.x:hover,.x:focus-visible{opacity:1;background:var(--hot-bg);color:var(--hot)}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
form.add{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;padding:14px;background:var(--surface);border:1px solid var(--line);border-radius:10px}
form.add input[type=text]{flex:1 1 240px;min-width:0;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink)}
form.add select{font:inherit;padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink)}
form.add button{font:inherit;font-weight:700;padding:8px 16px;border:0;border-radius:7px;background:var(--accent);color:#fff;cursor:pointer}
:root[data-theme="dark"] form.add button{color:var(--bg)}
.foot{margin-top:36px;font-size:12px;color:var(--ink-3);line-height:1.6}
.ro form.add,.ro .x{display:none}
@media (prefers-reduced-motion:reduce){.meter i{transition:none}}
"""

# Renders from the JSON state, and when the artifact capability is granted, republishes the whole
# page (same CSS, same script, new state) a couple of seconds after each change.
JS = r"""
(function(){
  var RESET=__RESET__;
  var FONTS=__FONTS__;
  var state=JSON.parse(document.getElementById('state').textContent);
  var app=document.getElementById('app');
  var art=null, readOnly=false, timer=null, statusText='Connecting…', statusCls='';
  var first=(state.owner||'My').split(' ')[0];
  var heading=first+"'s checklist", title=first+"'s Week Checklist";

  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}

  function setStatus(t,c){statusText=t;statusCls=c||'';var s=document.getElementById('status');if(s){s.textContent=t;s.className='status '+statusCls;}}

  function render(){
    var open=state.items.filter(function(i){return i.sec!=='done';});
    var doneCount=open.filter(function(i){return i.done;}).length;
    app.textContent='';
    app.classList.toggle('ro',readOnly);
    app.appendChild(el('h1',null,heading));
    app.appendChild(el('p','sub','Built from the State of the Union, Slack, Gmail and the calendar. As of '+state.as_of+'.'));
    var strip=el('div','strip');
    var meter=el('div','meter');var bar=el('i');bar.style.width=(open.length?Math.round(doneCount/open.length*100):0)+'%';meter.appendChild(bar);
    meter.setAttribute('role','progressbar');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(open.length));meter.setAttribute('aria-valuenow',String(doneCount));
    strip.appendChild(meter);
    strip.appendChild(el('span','count',doneCount+' of '+open.length+' done'));
    var st=el('span','status '+statusCls,statusText);st.id='status';st.setAttribute('aria-live','polite');strip.appendChild(st);
    app.appendChild(strip);

    state.sections.forEach(function(sec){
      var items=state.items.filter(function(i){return i.sec===sec.id;});
      if(!items.length)return;
      var s=el('section');s.setAttribute('aria-labelledby','h-'+sec.id);
      var head=el('div','sec-head');var h=el('h2',null,sec.title);h.id='h-'+sec.id;head.appendChild(h);
      var left=items.filter(function(i){return !i.done;}).length;
      head.appendChild(el('span','sec-meta',sec.id==='done'?items.length+' items':left+' open'));
      s.appendChild(head);
      if(sec.note)s.appendChild(el('p','sec-note',sec.note));
      var ul=el('ul','items');
      items.forEach(function(it){
        var li=el('li','item'+(it.done?' done':''));
        var cb=el('input');cb.type='checkbox';cb.id='cb-'+it.id;cb.checked=!!it.done;cb.disabled=readOnly;
        cb.addEventListener('change',function(){it.done=cb.checked;changed();});
        li.appendChild(cb);
        var body=el('div','body');
        var lab=el('label','text',it.text);lab.htmlFor='cb-'+it.id;body.appendChild(lab);
        if(it.note)body.appendChild(el('div','note',it.note));
        var tags=el('div','tags');
        if(it.acct)tags.appendChild(el('span','tag acct',it.acct));
        (it.tags||[]).forEach(function(t){tags.appendChild(el('span','tag'+(it.hot&&!it.done?' hot':''),t));});
        if(tags.childNodes.length)body.appendChild(tags);
        li.appendChild(body);
        var x=el('button','x','×');x.type='button';x.setAttribute('aria-label','Remove: '+it.text);
        x.addEventListener('click',function(){state.items=state.items.filter(function(o){return o!==it;});changed();});
        li.appendChild(x);
        ul.appendChild(li);
      });
      s.appendChild(ul);
      app.appendChild(s);
    });

    var f=el('form','add');
    var inp=el('input');inp.type='text';inp.id='new-task';inp.placeholder='Add a to-do';inp.setAttribute('aria-label','New to-do');
    var sel=el('select');sel.id='new-sec';sel.setAttribute('aria-label','Section');
    state.sections.filter(function(s){return s.id!=='done';}).forEach(function(s){var o=el('option',null,s.title);o.value=s.id;sel.appendChild(o);});
    var btn=el('button',null,'Add');btn.type='submit';
    f.appendChild(inp);f.appendChild(sel);f.appendChild(btn);
    f.addEventListener('submit',function(e){e.preventDefault();var t=inp.value.trim();if(!t)return;
      state.items.push({id:'u'+Date.now().toString(36),sec:sel.value,acct:'',text:t,note:'',tags:[],hot:false,done:false});changed();
      setTimeout(function(){var n=document.getElementById('new-task');if(n)n.focus();},0);});
    app.appendChild(f);
    app.appendChild(el('p','foot','Ticking, adding and removing items saves the page for everyone who opens this link, a couple of seconds after you stop. Sources: '+(state.sources||'')+'.'));
  }

  function buildDoc(){
    var css=document.getElementById('css').textContent;
    var js=document.getElementById('appjs').textContent;
    var data=JSON.stringify(state).replace(/</g,'\\u003c');
    var app0='<div id="app" class="wrap"><h1>'+esc(heading)+'</h1><p class="sub">Loading your list…</p></div>';
    return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+RESET+'</style></head><body>'+
      '<title>'+esc(title)+'</title>\n<link rel="stylesheet" href="'+FONTS+'">\n<style id="css">'+css+'</style>\n'+app0+
      '\n<script type="application/json" id="state">'+data+'<\/script>\n<script id="appjs">'+js+'<\/script></body></html>';
  }

  function changed(){
    render();
    if(!art){setStatus('Not saved in this view','warn');return;}
    setStatus('Saving…','');
    clearTimeout(timer);
    timer=setTimeout(save,1800);
  }

  function save(){
    art.publish(buildDoc()).then(function(){setStatus('Saved','ok');}).catch(function(err){
      var c=err&&err.code;
      if(c==='conflict'){setStatus('Updated elsewhere, reloading','');return;}
      if(c==='not_writer'||c==='not_granted'||c==='consent_required'||c==='not_declared'||c==='capability_disabled'||c==='capability_removed'){readOnly=true;setStatus('Read-only view','warn');render();return;}
      if(c==='rate_limited'){setStatus('Saving slowed down, retrying','warn');clearTimeout(timer);timer=setTimeout(save,8000);return;}
      setStatus('Couldn\'t save. Try another change','warn');
    });
  }

  render();
  if(window.claude&&window.claude.use){
    window.claude.use('artifact').then(function(a){art=a;setStatus(a?'Changes save automatically':'Not saved in this view',a?'ok':'warn');}).catch(function(){setStatus('Not saved in this view','warn');});
  }else{setStatus('Not saved in this view','warn');}
})();
"""


def build(data):
    first = html.escape((data.get("owner") or "My").split()[0])
    js = JS.replace("__RESET__", json.dumps(RESET)).replace("__FONTS__", json.dumps(FONTS))
    state = json.dumps(data, indent=1, ensure_ascii=False).replace("<", "\\u003c")
    return (
        '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,'
        f'initial-scale=1,viewport-fit=cover"><style>{RESET}</style></head><body>'
        f"<title>{first}'s Week Checklist</title>\n"
        f'<link rel="stylesheet" href="{FONTS}">\n'
        f'<style id="css">{CSS}</style>\n'
        f'<div id="app" class="wrap"><h1>{first}\'s checklist</h1><p class="sub">Loading your list…</p></div>\n'
        f'<script type="application/json" id="state">{state}</script>\n'
        f'<script id="appjs">{js}</script></body></html>\n'
    )


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "checklist-data.json"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "pages" / "week-checklist.html"
    out.write_text(build(json.loads(src.read_text())))
    print(f"wrote {out}")
