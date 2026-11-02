---
name: week-checklist
description: Builds and maintains an AE's Week Checklist, a one-page to-do list grouped by urgency (next manager 1:1, Salesforce fixes, most important this week, today, overdue follow-ups, renewals, next week, housekeeping, done). Filled from the State of the Union, Salesforce, Gmail, Slack, the calendar and meeting notes. The page saves itself, so ticks and new items stick for everyone with the link. Use when the user says "what are my to-dos", "make me a to-do checklist", "update my to-do list", "update my checklist", "what did I miss", or "who do I need to follow up with".
---

# Week Checklist

The State of the Union looks at the book deal by deal. This page looks at the same work as a to-do
list: what to do today, what to raise at the next 1:1, and what slipped. Build it from the same
sources, and refresh it whenever the State of the Union is refreshed.

Example output built from fake data: `../../pages/week-checklist.html`.

## Config

Uses the same working folder and `data/config.json` as the `state-of-the-union` skill (`AE_NAME`,
`MANAGER_NAME`, `SFDC_OWNER_ID`, `SLACK_USER_ID`). If that folder doesn't exist yet, follow that
skill's "Working folder (first run)" steps first. Keep the folder out of any public repo, since
`data/` will hold real names and deals.

## Files

| File | What it does |
|---|---|
| `builders/build_checklist.py` | `data/checklist-data.json` to `pages/week-checklist.html` |
| `data/manifest.json` | Holds `"checklist": "<artifact url>"` next to the State of the Union links |

## Page layout

1. Title "{first name}'s checklist", a line with the As-of time, and a sticky progress bar.
2. Sections in this order. Leave out any that are empty:

| id | Title | What goes in it |
|---|---|---|
| `1on1` | "{Manager} 1:1 · {day, date, time}" | Decisions first, then updates. Each item says what you need from the manager |
| `sfdc` | "Fix in Salesforce before {date}" | Close dates in the past or this week, stale next steps, amounts that don't match the opp |
| `top` | "Most important this week" | The 3 to 6 things that move money, in priority order |
| `today` | "Also today and tomorrow" | Smaller dated items |
| `overdue` | "Overdue follow-ups" | Promised replies that Gmail shows were never sent |
| `intros` | "New accounts from {name}" | Handed-over accounts not yet contacted (only when there are some) |
| `renew` | "Renewal check-ins" | One line per renewal that needs a touch |
| `week` | "Next week" | Dated items later in the week |
| `admin` | "Salesforce and housekeeping" | Logging calls, contacts, cleanup, IT tasks |
| `done` | "Done since last week" | What got done, with dates, so the 1:1 can see progress |

3. An "Add a to-do" box, and a footer naming the sources and their dates.

## Item shape

```json
{"id": "t1", "sec": "top", "acct": "Northwind Analytics",
 "text": "Send the finished security questionnaire to Elena",
 "note": "She needs it before procurement will book the 10/14 call.",
 "tags": ["by Tue 10/13"], "hot": true, "done": false}
```

- **text:** one action, verb first, 20 words max. Name the person.
- **note:** 1 or 2 sentences of why, with dates. Say what is still unknown.
- **acct:** the account, or a short label like "Q4 number" or "Call notes".
- **tags:** deadlines ("by Fri 10/16"), deal size, or "decision", "update", "FYI" in the 1:1 section.
- **hot:** true when it is due within two days, a 1:1 decision, or blocks a close.
- **ids:** keep an item's id across refreshes, so ticks made on the page still match.
- **done items:** past tense with a date, "Sent the updated order form to Megan (10/7)".

## Refresh

**Step 1. Read the live page first.** Get the URL from `data/manifest.json` and read it with the
Artifact tool. People tick, add and remove items on the page, and the page saves itself. Start
from its JSON state, not from your last local copy, or their changes are lost:
- Ticked items move to `done`, rewritten in past tense with a date.
- Items they added stay, in the section they chose.
- Items they removed stay removed. Don't add them back unless a source shows new activity.

**Step 2. Pull the State of the Union.** Refresh it first if it is older than a day (see the
`state-of-the-union` skill). Take from `data/sotu-data.json`:
- Every open task on moving and watch deals, and the key accounts' things to do.
- "Open with these three" as the first 1:1 items.
- Close dates in the past or within 7 days, for the `sfdc` section.

**Step 3. Check what actually happened** since the last As-of time:
- **Gmail:** `in:sent after:{last as_of}` marks things done. For each promised follow-up, search
  the thread. If nothing was sent, it goes in `overdue`.
- **Slack:** search `from:<@{SLACK_USER_ID}> after:{last as_of}` for things you said you'd do, and
  read each account's `#ext-*` and `#int-*` channels for asks aimed at you. Search misses recent
  posts, so read the channels directly.
- **Calendar:** find the next manager 1:1 for the `1on1` title, and meetings that need prep.
- **Meeting notes:** action items from calls since the last refresh.
- **Salesforce:** open opps with `CloseDate <= NEXT_N_DAYS:7`, next steps older than 14 days, and
  amounts that don't match the opp name.

**Step 4. Write the sections.** Put the most important things at the top of each section. Never mark
an item done without a source. If you can't tell, leave it open and ask the AE.

**Step 5. Build and publish.**
```bash
python3 -I builders/build_checklist.py
```
Publish `pages/week-checklist.html` with the Artifact tool and the capability `{"artifact": {}}`, so
the page can save itself. On the first publish, save the URL to `manifest.checklist`. After that,
always publish to that URL, never without it, or you make a second page.

**Step 6. Report in chat.** Give the 3 to 5 things that changed or need a decision today. Link the
page. Don't repeat the whole list.

## Writing rules (every text field)

Use plain, short sentences at a 5th-7th grade level. No em dashes, no semicolons, and no filler
words like robust, comprehensive, leverage, streamline or delve. State only facts found in a source.
Dates go inline ("Wed 10/14").
