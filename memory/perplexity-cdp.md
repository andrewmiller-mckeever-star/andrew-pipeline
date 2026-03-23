---
name: perplexity-cdp
description: Perplexity Deep Research CDP automation patterns. Exact selectors, commands, and gotchas for running Deep Research queries via Chrome CDP. Referenced by ydc-research skill.
type: reference
---

## Perplexity Deep Research via CDP — Quick Reference

**When to use:** Step 1 of whale pipeline (company research). One query replaces 10+ Brave searches.

**Benchmark (2026-03-18, Teradata):** Perplexity scored 36/40 vs Brave 27/40 across 4 research dimensions. Found products, leadership details, and trigger events Brave missed. Corrected a factual error (CTO status) from Brave-sourced account plan.

**Prereqs:** User logged into Perplexity in Chrome. Free tier = 5 Deep Research/day.

### Key Technical Gotchas (learned the hard way)

1. **MUST use CDP `type` command for text input, NOT `.textContent` via eval.** Perplexity uses React. Setting `.textContent` directly bypasses React state — text appears visually but Submit button never shows. CDP `type` dispatches `Input.insertText` which React registers.

2. **Input element is `div[contenteditable]`, not `textarea`.** Despite snap showing `[textbox]`, the actual DOM element is a contenteditable div.

3. **"/" mode trigger requires CDP `type`, not eval.** Clear field with eval (`.textContent = ''`), focus with eval (`.focus()`), then type "/" with CDP `type` command. The typeahead menu appears as `[role="listbox"]` with `[role="menuitem"]` children.

4. **Deep Research menu item is always the first `[role="menuitem"]`.** Click with: `document.querySelectorAll('[role="menuitem"]')[0].click()`

5. **Query text: no newlines, no unescaped single quotes, under 1000 chars.**

6. **Results live in `[class*=prose], [class*=markdown]` elements.** Total text is 30-100K chars. Extract in 10K chunks via eval `.substring()`.

7. **Perplexity sometimes duplicates the full report at page bottom.** Check for duplicate headers. Use only first half if doubled.

8. **Deep Research takes 3-5 minutes.** Poll completion every 60s by checking for "Searching"/"Reading"/"Analyzing" in `document.body.innerText`. Do not poll more than 6 times.

9. **Auth check:** `snap <target>` and grep for "Ryan Reed" (logged in) or "Sign in" (not logged in). Do not proceed without auth.

### Full Playbook
See: `/Users/ryan/.claude/skills/ydc-research/SKILL.md` → "Perplexity CDP Playbook" section for the complete step-by-step with every command spelled out.
