#!/bin/bash
# Usage: builders/tools/qa_build.sh <slug>   (run from the examples/sales-pages root)
# Checks a plan's JSON for em dashes and semicolons, then renders the plan and its JEP into pages/.
s=$1
for f in data/plans/$s.json data/plans/$s-jep.json data/plans/$s.meta.json; do
  [ -f "$f" ] || continue
  d=$(grep -c '—' "$f"); sc=$(grep -o ';' "$f" | wc -l | tr -d ' ')
  echo "$f: emdash=$d semicolon=$sc"
done
python3 -I builders/build_plan.py data/plans/$s.json pages/$s.html
[ -f data/plans/$s-jep.json ] && python3 -I builders/build_jep.py data/plans/$s-jep.json pages/$s-jep.html
