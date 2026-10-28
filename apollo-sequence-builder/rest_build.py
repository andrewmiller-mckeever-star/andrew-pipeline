#!/usr/bin/env python3
"""Build YDC Apollo sequences of any length via REST (apollo_rest_fallback path).

Step count and waits come from the content JSON. Nothing about the cadence is hardcoded.

  step types : auto_email, manual_email, linkedin_step_connect, linkedin_step_message,
               call, action_item
  touches    : new_thread by default; reply_to_thread on any step with email_type "reply"
  subjects   : required on new_thread email steps, forbidden on replies

Wait resolution, most specific wins (see resolve_waits):
  1. per-step   "wait_time" / "wait_mode" on the step object
  2. per-seq    "waits" list (and optional "wait_mode") on the sequence object
  3. legacy     a 7-step sequence with neither of the above gets 0/1/3/3/3/3/3 day,
                which is the original hardcoded cadence, so existing 7-step content
                files built by the territory and usage pipelines are unchanged.
                A 12-step sequence gets the 12-touch standard below.
  4. fallback   any other length gets 0 then 3s, and prints a warning

Known cadences:
  12-touch standard  waits 0,1,2,3,2,3,3,4,3,4,5,7 -> days 1,2,4,7,9,12,15,19,22,26,31,38
                     (default since 2026-10-27; new threads on steps 1 and 8)
  7-touch legacy     waits 0,1,3,3,3,3,3     -> days 1,2,5,8,11,14,17
  9-touch air cover  waits 0,2,5,7,2,5,7,2,7 -> days 1,3,8,15,17,22,29,31,38

Method notes learned by probing the API (2026-08-26):
  - POST /emailer_steps ignores a nested emailer_template; it creates an EMPTY template
    and an auto new_thread touch. Content must be applied with PUT /emailer_templates/{id}.
  - PUT /emailer_touches/{id} is broken ("undefined method '[]' for nil"). To make a step a
    reply you DELETE the auto touch and POST /emailer_touches with type=reply_to_thread,
    which mints a fresh template id to fill.
  - Nested emailer_touch / type_of_email / touch_type on the step POST are all ignored.

Sequences are created INACTIVE, ownership moves to Andrew immediately, and nothing is
ever activated. Final state is read back from Apollo, not assumed.

LinkedIn policy (2026-10-08): linkedin_step_connect templates are always left EMPTY,
and verify() fails a connect step that carries text. linkedin_step_message steps keep
their drafted copy; Andrew sends those by hand from the Apollo task queue.
"""
import json, os, sys, time, urllib.request, urllib.error

API = "https://api.apollo.io/v1"
KEY = os.environ["APOLLO_API_KEY"]


# This repo is public. Account identifiers live in ae-config.md, which is gitignored.
# Env wins; ae-config.md is the fallback.
def ae_config(key):
    v = os.environ.get(key)
    if v:
        return v
    here = os.path.dirname(os.path.abspath(__file__))
    for base in (here, os.path.join(here, "..")):
        path = os.path.join(base, "ae-config.md")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    if line.strip().startswith(key + ":"):
                        return line.split(":", 1)[1].strip().strip("`")
    sys.exit(f"{key} is not set. Add it to ae-config.md or export it.")


ANDREW = ae_config("APOLLO_USER_ID")

TYPE_MAP = {
    "automatic_email": "auto_email",
    "manual_email": "manual_email",
    "linkedin_connect": "linkedin_step_connect",
    "linkedin_message": "linkedin_step_message",
    "phone_call": "call",
    "action_item": "action_item",
    "linkedin_interact_post": "action_item",
}
LEGACY_WAITS_7 = [0, 1, 3, 3, 3, 3, 3]
STANDARD_WAITS_12 = [0, 1, 2, 3, 2, 3, 3, 4, 3, 4, 5, 7]
WAITS = LEGACY_WAITS_7  # kept as an alias; nothing should read this directly any more
EMAIL_TYPES = ("auto_email", "manual_email")
LINKEDIN_TYPES = ("linkedin_step_connect", "linkedin_step_message")


def resolve_waits(seq):
    """Return [(wait_time, wait_mode)] per step. Most specific source wins.

    A 7-step sequence that specifies nothing keeps the original 0/1/3/3/3/3/3 day
    cadence, so every content file written before this function existed builds
    byte-identically. Any other length must say what it wants, or it gets 0 then 3s
    and a warning.
    """
    steps = seq["steps"]
    n = len(steps)
    seq_mode = seq.get("wait_mode", "day")
    seq_waits = seq.get("waits")

    if seq_waits is not None and len(seq_waits) != n:
        raise SystemExit(
            f"{seq['name']!r}: waits has {len(seq_waits)} entries for {n} steps")

    if seq_waits is None and not any("wait_time" in s for s in steps):
        if n == len(LEGACY_WAITS_7):
            seq_waits = LEGACY_WAITS_7
        elif n == len(STANDARD_WAITS_12):
            seq_waits = STANDARD_WAITS_12
        else:
            seq_waits = [0] + [3] * (n - 1)
            print(f"   !! {n} steps and no waits given; defaulting to "
                  f"{','.join(str(w) for w in seq_waits)} {seq_mode}")

    out = []
    for i, s in enumerate(steps):
        wt = s.get("wait_time")
        if wt is None:
            wt = seq_waits[i] if seq_waits is not None else (0 if i == 0 else 3)
        out.append((int(wt), s.get("wait_mode", seq_mode)))
    return out


def cadence_days(waits):
    """Cumulative day number per step, for printing. Day-mode entries only."""
    day, days = 1, []
    for i, (wt, mode) in enumerate(waits):
        if i > 0:
            day += wt if mode == "day" else 0
        days.append(day)
    return days


def call(method, path, body=None, tolerate=False):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
    )
    req.add_header("X-Api-Key", KEY)
    req.add_header("Content-Type", "application/json")
    req.add_header("Cache-Control", "no-cache")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if tolerate:
            return {"error": f"HTTP {e.code}"}
        raise SystemExit(f"HTTP {e.code} on {method} {path}\n{e.read().decode()[:400]}")
    if isinstance(out, dict) and "error" in out and not tolerate:
        raise SystemExit(f"API error on {method} {path}: {out['error']}")
    return out


def to_html(text):
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    return "".join("<p>" + p.replace("\n", "<br>") + "</p>" for p in paras)


def fetch(cid):
    d = call("GET", f"/emailer_campaigns/{cid}")
    steps = sorted(d.get("emailer_steps", []), key=lambda s: s.get("position") or 0)
    touch_by_step = {}
    for t in d.get("emailer_touches", []):
        touch_by_step.setdefault(t["emailer_step_id"], []).append(t)
    return d, steps, touch_by_step


def apply_content(cid, seq):
    """Fill templates and convert steps 3 and 6 into replies."""
    _, steps, touch_by_step = fetch(cid)
    for i, spec in enumerate(seq["steps"]):
        pos = i + 1
        step = next((s for s in steps if s.get("position") == pos), None)
        if step is None:
            print(f"   !! no step at position {pos}")
            continue
        atype = step["type"]
        if atype not in EMAIL_TYPES + LINKEDIN_TYPES:
            continue
        # Connection requests never carry a note (Andrew, 2026-10-08). The step's
        # template is left empty whatever the content file says. On 09-25/28 notes
        # with raw {{calls_30d}} tokens went to 18 prospects, because Apollo never
        # renders variables in LinkedIn steps.
        if atype == "linkedin_step_connect":
            if spec.get("body") or spec.get("message"):
                print(f"   !! pos {pos} connect step had note text in the content file; "
                      f"ignored, connection requests never carry a note")
            print(f"   pos {pos} {atype:<22} {'no note':<11} left empty")
            continue

        touches = touch_by_step.get(step["id"], [])
        want_reply = spec.get("email_type") == "reply"

        if want_reply:
            # Mint the reply touch, then remove every auto new_thread touch and VERIFY the
            # removal by re-reading. A swallowed DELETE failure previously left two touches
            # on the step, with the empty new_thread one winning.
            r = call("POST", "/emailer_touches",
                     {"emailer_step_id": step["id"], "type": "reply_to_thread"})
            touch = r["emailer_touch"]
            for attempt in range(3):
                _, _, live = fetch(cid)
                stale = [t for t in live.get(step["id"], [])
                         if t.get("type") != "reply_to_thread"]
                if not stale:
                    break
                for t in stale:
                    call("DELETE", f"/emailer_touches/{t['id']}", tolerate=True)
                time.sleep(0.5)
            else:
                raise SystemExit(
                    f"pos {pos}: could not remove new_thread touch(es); "
                    f"step would send as a new thread. Fix before enrolling.")
        else:
            touch = touches[0] if touches else None
            if touch is None:
                r = call("POST", "/emailer_touches",
                         {"emailer_step_id": step["id"], "type": "new_thread"})
                touch = r["emailer_touch"]

        tid = touch.get("emailer_template_id")
        body = spec.get("body") or spec.get("message") or ""
        payload = {"body_html": to_html(body),
                   "subject": spec.get("subject", "") if not want_reply else ""}
        if atype in LINKEDIN_TYPES:
            payload["subject"] = ""
        call("PUT", f"/emailer_templates/{tid}", payload)
        label = "reply" if want_reply else "new_thread"
        print(f"   pos {pos} {atype:<22} {label:<11} filled {len(body)}c")
        time.sleep(0.3)


def create(seq):
    name = seq["name"]
    print(f"\n=== {name}")
    camp = call("POST", "/emailer_campaigns",
                {"name": name, "permissions": "private", "active": False})
    cid = camp["emailer_campaign"]["id"]
    print(f"   created {cid} active={camp['emailer_campaign'].get('active')}")
    own = call("PUT", f"/emailer_campaigns/{cid}", {"user_id": ANDREW})
    ec = own.get("emailer_campaign", {})
    print(f"   owner user_id={ec.get('user_id')} object_owner_id={ec.get('object_owner_id')}")
    waits = resolve_waits(seq)
    days = cadence_days(waits)
    print(f"   {len(seq['steps'])} steps, cadence days "
          f"{','.join(str(d) for d in days)}")
    for i, spec in enumerate(seq["steps"]):
        atype = TYPE_MAP[spec["type"]]
        wt, mode = waits[i]
        payload = {"emailer_campaign_id": cid, "type": atype,
                   "wait_time": wt, "wait_mode": mode, "position": i + 1}
        if atype in ("call", "action_item"):
            payload["note"] = spec.get("task_note", "")
        call("POST", "/emailer_steps", payload)
        time.sleep(0.4)
    return cid


def verify(cid, seq):
    d, steps, touch_by_step = fetch(cid)
    c = d["emailer_campaign"]
    tmpl = {t["id"]: t for t in d.get("emailer_templates", [])}
    print(f"\n--- VERIFY {c['name']}")
    problems = []
    if c.get("active"):
        problems.append("SEQUENCE IS ACTIVE")
    if c.get("user_id") != ANDREW:
        problems.append(f"owner is {c.get('user_id')}")
    want_steps = len(seq["steps"])
    if c.get("num_steps") != want_steps:
        problems.append(f"num_steps={c.get('num_steps')} expected {want_steps}")
    print(f"    active={c.get('active')}  owner_ok={c.get('user_id') == ANDREW}  "
          f"steps={c.get('num_steps')}/{want_steps}")
    waits = resolve_waits(seq)
    for i, spec in enumerate(seq["steps"]):
        pos = i + 1
        step = next((s for s in steps if s.get("position") == pos), None)
        if not step:
            problems.append(f"pos {pos} missing")
            continue
        want_wt, want_mode = waits[i]
        got_wt, got_mode = step.get("wait_time"), step.get("wait_mode")
        if (got_wt, got_mode) != (want_wt, want_mode):
            problems.append(
                f"pos {pos} wait={got_wt}{got_mode} expected {want_wt}{want_mode}")
        ts = touch_by_step.get(step["id"], [])
        if step["type"] in ("call", "action_item"):
            print(f"    pos {pos} {step['type']:<22} task step         "
                  f"wait={got_wt}{got_mode}")
            continue
        if len(ts) != 1:
            problems.append(f"pos {pos} has {len(ts)} touches")
        t = ts[0] if ts else {}
        tm = tmpl.get(t.get("emailer_template_id"), {})
        blen = len(tm.get("body_text") or "")
        subj = tm.get("subject") or ""
        want = "reply_to_thread" if spec.get("email_type") == "reply" else "new_thread"
        if t.get("type") != want:
            problems.append(f"pos {pos} touch={t.get('type')} expected {want}")
        if step["type"] == "linkedin_step_connect":
            if blen:
                problems.append(f"pos {pos} connect step carries a {blen}c note; "
                                f"connection requests must be empty")
        elif blen == 0:
            problems.append(f"pos {pos} EMPTY body")
        if want == "new_thread" and step["type"] in EMAIL_TYPES and not subj:
            problems.append(f"pos {pos} missing subject")
        if want == "reply_to_thread" and subj:
            problems.append(f"pos {pos} reply should have no subject, has {subj!r}")
        print(f"    pos {pos} {step['type']:<22} {str(t.get('type')):<16} "
              f"body={blen:<5}c wait={got_wt}{got_mode} subj={subj[:30]!r}")
    return problems


if __name__ == "__main__":
    content = json.load(open(sys.argv[1]))
    which = sys.argv[2] if len(sys.argv) > 2 else "all"
    existing = sys.argv[3] if len(sys.argv) > 3 else None

    seqs = content["sequences"]
    if which != "all":
        seqs = [s for s in seqs if which.lower() in s["name"].lower()]
        if not seqs:
            raise SystemExit(f"no sequence matching {which!r}")

    results, all_problems = [], []
    for s in seqs:
        cid = existing or create(s)
        existing = None
        apply_content(cid, s)
        probs = verify(cid, s)
        if probs:
            print("    PROBLEMS: " + "; ".join(probs))
            all_problems += [f"{s['name']}: {p}" for p in probs]
        else:
            print("    CLEAN")
        results.append({"name": s["name"], "id": cid, "problems": probs})

    print("\n=== RESULT ===")
    for r in results:
        print(f"  {r['id']}  {'OK  ' if not r['problems'] else 'FAIL'}  {r['name']}")
    json.dump(results, open("/tmp/shiftup_built.json", "w"), indent=1)
    if all_problems:
        print(f"\n{len(all_problems)} problem(s)")
        sys.exit(1)
    print("\nAll sequences built, inactive, owned by Andrew.")
