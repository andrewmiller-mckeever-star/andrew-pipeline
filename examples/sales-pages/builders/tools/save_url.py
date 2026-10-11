import json,sys
# usage: save_url.py plans|jeps <slug> <url>   (account name read from plans/<slug>.meta.json)
k,s,u=sys.argv[1:4]; a=json.load(open(f'data/plans/{s}.meta.json'))['account']
p='data/manifest.json'; m=json.load(open(p)); m.setdefault(k,{})[a]=u; json.dump(m,open(p,'w'),indent=1); print(k,a)
