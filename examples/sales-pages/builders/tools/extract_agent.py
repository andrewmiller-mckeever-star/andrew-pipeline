import json, sys, re
src, out = sys.argv[1], sys.argv[2]
last = None
for line in open(src):
    try: rec = json.loads(line)
    except Exception: continue
    msg = rec.get("message") or {}
    if msg.get("role") != "assistant": continue
    content = msg.get("content")
    texts = [c.get("text","") for c in content if isinstance(c, dict) and c.get("type")=="text"] if isinstance(content, list) else [content or ""]
    t = "\n".join(texts).strip()
    if t: last = t
m = re.search(r"\{.*\}", last or "", re.S)
data = json.loads(m.group(0))
json.dump(data, open(out, "w"), indent=1)
print(out, len(data.get("opps", [])), "opps", len(data.get("key_accounts", [])), "key accts")
