#!/usr/bin/env python3
"""Check cold outbound copy against ydc-sales-voice "Cold Outbound Copy Rules (2026-11-06)".

Usage: python3 -I tools/check_cold_copy.py COPY.json [COPY2.json ...]

COPY.json shape: {"account": "...", "leads": [{"first_name", "last_name", "email",
"linkedin_url", "signals": [...], "fields": {email_1_subject, email_1_body ... email_7_body,
email_4_subject, li_message_1..3, video_script}}]}. Missing optional fields are skipped.

ERROR = must fix before showing Andrew. WARN = read it and decide.
A clean run does not replace reading the copy as the recipient.
"""
import json
import re
import sys

BANNED = [
    "leverage", "streamline", "robust", "seamless", "unlock", "delve", "comprehensive",
    "enhance", "utilize", "platform", "solution", "cutting-edge", "end-to-end",
    "game-changing", "game changer", "revolutionize", "best-in-class", "quick chat",
    "15 minutes", "20 minutes", "demo", "touching base", "touch base", "circling back",
    "following up", "checking in", "hope this finds you", "hope you're well", "bumping this",
    "worth a chat", "worth a look", "worth a conversation", "quick", "i'd love to",
    "synergy", "paradigm", "impressive", "incredible", "amazing", "strong signal",
    "84.81", "538 ms", "538ms", "$100",
]
COMPETITORS = ["exa", "tavily", "perplexity", "brave search", "serpapi", "parallel web",
               "google", "bing"]
HEDGES = ["guessing", "could be off base", "i'd imagine", "i imagine", "i'd guess",
          "probably", "curious whether", "curious how", "curious what", "i suspect",
          "my guess", "i wonder"]
DOSSIER = [r"\byou spoke\b", r"\bi noticed\b", r"\bi saw\b", r"\bcame across\b",
           r"\bcongrat", r"\byour (recent |october |september |april |may |2026 )?post\b",
           r"\bafter you (joined|took over|started)\b", r"\bwhen you joined\b",
           r"\byour (talk|panel|podcast|profile)\b", r"\bstood out\b"]
BROAD_Q = re.compile(r"^(how|where|which|what|who|why|does|do|did|is|are|has|have)\b", re.I)
ASSET = re.compile(r"json|side[- ]by[- ]side|credits|queries|eval|sample|raw output|"
                   r"run (it|them|a|50|100|your)|test", re.I)
LI_STANDALONE = ["thanks for connecting", "my email", "sent you", "as i mentioned",
                 "following up", "my note", "in my last", "my last email"]
CAL = "Here's my calendar if it makes sense to connect on this."
EMAILS = ["email_%d_body" % i for i in range(1, 8)]


def words(s):
    return len(re.findall(r"[A-Za-z0-9][\w'.%+-]*", s))


def sentences(s):
    s = re.sub(r"\s+", " ", s.strip())
    parts = re.split(r"(?<=[.?])\s+(?=[A-Z\"'])", s)
    return [p for p in parts if p]


def has(phrase, low):
    return re.search(r"(?<![a-z])" + re.escape(phrase) + r"(?![a-z])", low) is not None


def check(path):
    data = json.load(open(path))
    errors, warns = [], []
    subjects = {}
    for lead in data.get("leads", []):
        who = "%s %s" % (lead.get("first_name", "?"), lead.get("last_name", ""))
        f = lead.get("fields", {})
        company = (data.get("account") or "").lower()
        E = lambda m: errors.append("%s: %s" % (who, m))
        W = lambda m: warns.append("%s: %s" % (who, m))

        for k in ("email", "linkedin_url", "first_name"):
            if not lead.get(k):
                E("missing " + k)
        sig = [s for s in (lead.get("signals") or []) if s.get("source") and s.get("date")]
        if len(sig) < 2:
            W("fewer than 2 dated, sourced signals")

        for k, v in f.items():
            if not isinstance(v, str) or not v.strip():
                continue
            low = v.lower()
            for b in BANNED:
                if has(b, low):
                    E("%s uses banned '%s'" % (k, b))
            for c in COMPETITORS:
                if has(c, low):
                    E("%s names a competitor '%s'" % (k, c))
            for h in HEDGES:
                if has(h, low):
                    E("%s hedges ('%s')" % (k, h))
            for d in DOSSIER:
                if re.search(d, low):
                    E("%s has a dossier/SDR phrase (%s)" % (k, d))
            if "—" in v or "–" in v:
                E("%s has an em/en dash" % k)
            if ";" in v:
                E("%s has a semicolon" % k)
            if "!" in v:
                E("%s has an exclamation point" % k)
            if "{{" in v or "}}" in v:
                E("%s has a raw placeholder" % k)
            if k != "video_script" and re.match(r"\s*(hi|hey|hello)\b", low):
                E("%s starts with a greeting (template adds it)" % k)
            if re.search(r"\b(cheers|best|thanks|warm regards),?\s*$", low):
                E("%s ends with a sign-off (template adds it)" % k)

        # Email 1
        e1 = f.get("email_1_body", "")
        if e1:
            low1 = e1.lower()
            if re.match(r"\s*(i|we|our|at you\.com|you\.com)\b", low1):
                E("email_1 opens with I/We/Our/You.com")
            if "you.com" not in low1:
                E("email_1 never names You.com (say who you are with the proof point)")
            if "http" in low1:
                E("email_1 has a link")
            n = words(e1)
            if not 60 <= n <= 90:
                E("email_1 is %d words (60-90)" % n)
            ns = len(sentences(e1))
            if not 3 <= ns <= 5:
                W("email_1 has %d sentences (3-5)" % ns)

        # Every email's closing ask
        for k in EMAILS:
            v = f.get(k, "")
            if not v:
                continue
            if k == "email_6_body":
                v = v.replace(CAL, "").strip()
            sents = sentences(v)
            last = sents[-1] if sents else ""
            if last.endswith("?") and BROAD_Q.match(last) and not ASSET.search(last):
                E("%s closes on a broad interview question: '%s'" % (k, last[:90]))
            if k == "email_1_body" and not ASSET.search(last):
                W("email_1 ask may not offer a concrete asset: '%s'" % last[:90])

        # Shorter each time within each thread
        def chain(keys):
            prev = None
            for k in keys:
                v = f.get(k, "").replace(CAL, "")
                if not v:
                    continue
                n = words(v)
                if prev and n > prev[1]:
                    W("%s (%d words) is longer than %s (%d)" % (k, n, prev[0], prev[1]))
                prev = (k, n)
        chain(["email_1_body", "email_2_body", "email_3_body"])
        chain(["email_4_body", "email_5_body", "email_6_body", "email_7_body"])

        b7 = f.get("email_7_body", "")
        if b7 and len(sentences(b7)) > 2:
            E("email_7 breakup is more than 2 sentences")

        e4 = f.get("email_4_body", "")
        if e4 and company and company in e4.lower():
            W("email_4 mentions %s: make sure the show-work query is one their agents would "
              "send, not a search on their own company" % data.get("account"))

        e6 = f.get("email_6_body", "")
        if e6 and CAL in e6 and not e6.strip().endswith(CAL):
            E("calendar sentence is not the last line of email_6")

        for k in ("li_message_1", "li_message_2", "li_message_3"):
            v = f.get(k, "")
            if not v:
                continue
            low = v.lower()
            for b in LI_STANDALONE:
                if b in low:
                    E("%s assumes prior contact ('%s')" % (k, b))
            if len(v) > 260:
                E("%s is %d chars (keep under ~250)" % (k, len(v)))
            if "http" in low or "you.com/" in low:
                E("%s has a link" % k)

        for s in ("email_1_subject", "email_4_subject"):
            sub = f.get(s, "")
            if not sub:
                continue
            if sub != sub.lower() or len(sub.split()) > 4 or re.search(r"\d", sub):
                E("%s '%s' breaks subject rules (lowercase, 2-4 words, no numbers)" % (s, sub))
            if sub in subjects:
                E("%s '%s' duplicates %s" % (s, sub, subjects[sub]))
            subjects[sub] = who

        vs = f.get("video_script", "")
        if vs:
            if "On screen:" not in vs:
                E("video_script missing 'On screen:' line")
            vw = words(vs.split("On screen:")[0])
            if not 60 <= vw <= 120:
                W("video script is %d words (30-45 s is roughly 75-115)" % vw)

    print("%s: %d leads, %d errors, %d warnings" % (path, len(data.get("leads", [])),
                                                   len(errors), len(warns)))
    for e in errors:
        print("  ERROR", e)
    for w in warns:
        print("  WARN ", w)
    return len(errors)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(1 if sum(check(p) for p in sys.argv[1:]) else 0)
