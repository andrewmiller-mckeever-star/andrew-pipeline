---
name: living-account-plan
description: Builds and maintains a LIVING account plan, a single page published to a stable URL and updated in place, so a shared link always shows current truth. An exec can scan it in ten minutes. It leads with the thesis, carries an asks section third, keeps a dated changelog and owner/due-date next steps. Use when the user says "living account plan for [company]", "update the plan for [company]" or asks for a shareable running plan for exec review.
---

# Living Account Plan

Example: `pages/contoso-ai-living-plan.html`, built from `data/living/contoso-ai.json` with
`python3 -I builders/build_living_plan.py data/living/contoso-ai.json`.

## Rule 0: the layout is a contract
An exec learns the layout once and can then scan any account in ten minutes. So:
- **Never invent, drop or reorder a section.** A section with nothing in it says so in plain words. An empty section is information. A missing section is a bug.
- **Never restyle.** Every plan uses the same builder.
- **Never regenerate an existing plan from scratch.** Edit its JSON, append to the changelog, rebuild, and republish to the same URL.

## The fixed section order

| # | Section | JSON key | Purpose |
|---|---|---|---|
| 1 | Hero | `account`, `thesis`, `pills` | Thesis in under 40 words, plus fact pills |
| 2 | Status bar | `status` | Last updated, next review, stage, health, pipeline, usage, open next steps (counted) |
| 3 | Traction | `traction` | Landed / Tried, no traction / Blockers / Next move |
| 4 | **Where I need help** | `asks` | Exec asks. **Always third, never lower.** Each ask names who it is for and why. |
| 5 | What's changed | `changelog` | Dated, newest first, append-only |
| 6 | Next steps | `next_steps` | Action, owner, due date, status (Open / Done / Late) |
| 7 | Why this account | `why` | Strategic context. Changes rarely. |
| 8 | The wedge | `wedge` | One primary angle and the named buyers |
| 9 | Warm paths, ranked | `warm_paths` | Routes in, strongest first |
| 10 | Plan of attack | `phases` | Three phases with dates and goals |
| 11 | Buying committee | `committee` | In order of deal-closing power |
| 12 | Org map | `org` | Leaders, then teams |
| 13 | Products and owners | `products` | Each product, its owner, and our angle |
| 14 | Footprint and clocks | `footprint`, `clocks` | Where their people sit, and dated events that force timing |
| 15 | Use cases, TAM and risks | `use_cases`, `risks` | Scored use cases and what can stall the account |
| 16 | Footer | `provenance` | "Internal only." plus where the data came from |

## Rules
1. **Asks stay third.** A manager reviewing a forecast spends about ten minutes per account. The ask has to be at the top. Vague asks are worse than none. Remove answered asks at the next update.
2. **TAM is in API calls per year, never dollars.** The builder renders `tam_calls_m` as "XM calls/yr".
3. **Every update:** bump `status.last_updated`, add a changelog line, and re-check next-step statuses.
4. **Sources:** CRM for stage, pipeline and contacts. Usage data by email domain. Slack, email and meeting notes for asks, blockers and next steps.
5. **Writing:** plain, short sentences. No em dashes, no semicolons, no filler words.

## When to use this vs the Plan of Attack
The Plan of Attack (`state-of-the-union` skill) is the weekly working plan behind the State of the
Union card. The living plan is the longer-running document for exec reviews. Many teams pick one. This
repo shows both.
