# YDC: Edit Existing Apollo Sequences

## Purpose

Populate or update steps in existing Apollo sequences that were created as empty shells
(contacts already enrolled). Uses Playwright browser automation to navigate to each
sequence editor, add steps via the "Add a step" UI, and fill content using the
Template tab flow.

---

## CRITICAL: April 2026 UI Change

Apollo changed the sequence step editor to default to an "Assisted" AI tab.
The script MUST:
1. Click the **Template** tab after opening any email step
2. Press **Meta+A then Delete** to clear the AI placeholder chips in subject and body
3. Only then fill real content

Without this, content goes into the wrong tab or appends after AI placeholders.

---

## When to Use

- Sequences exist in Apollo (contacts enrolled) but steps are empty (num_steps = 0)
- Sequences need content updated or replaced
- New sequence variant needs to be built into an existing shell

---

## Prerequisites

- Apollo sequence IDs (get via `mcp__apollo__apollo_emailer_campaigns_search`)
- Step content defined (JSON or inline in script)
- Chrome logged into Apollo (`~/Library/Application Support/Google/Chrome/Default`)
- Playwright installed (`npm install playwright` in `APOLLO_BUILDER_PATH`)

---

## Procedure

### Step 1: Get sequence IDs

```
mcp__apollo__apollo_emailer_campaigns_search q_name="<sequence name pattern>"
```

Note the `id` field for each target sequence. Confirm `num_steps` to verify they're empty.

### Step 2: Prepare content

Content lives in JSON files at `APOLLO_BUILDER_PATH`. Each sequence has a JSON file
(`usage_seq_a.json` through `usage_seq_f.json`) with step definitions.

Step types supported:
- `automatic_email` — needs `email_type` (new_thread/reply), `subject` (new_thread only), `body`
- `phone_call` — needs `task_note` (note: auto-fill blocked by Apollo collapsed card UI — fill manually)
- `linkedin_connect` — needs `message`
- `linkedin_message` — needs `message`
- `linkedin_view_profile` — no content needed
- `action_item` — needs `task_note`

### Step 3: Update populate-sequences.js

The main script is at `{APOLLO_BUILDER_PATH}/populate-sequences.js`.

To add or update sequences, edit the `SEQUENCES` array at the top of the file.
Each entry:
```javascript
{
  name: 'Seq X: Name',       // for logging only
  id: '<apollo-sequence-id>',
  steps: [ /* step objects */ ]
}
```

### Step 4: Syntax check

```bash
node --check populate-sequences.js
```

### Step 5: Chrome handling

**build-sequences.js** uses `launchPersistentContext` with `~/.apollo-playwright-profile` — Chrome does NOT need to be closed. **archive-sequences.js** uses `apollo_session.json` (storageState) — also fine with Chrome open. Neither script requires closing Chrome.

**populate-sequences.js** uses `launchPersistentContext` with the Chrome profile — Chrome MUST be closed before running it. Per user preference, ask for approval before closing Chrome.

### Step 6: Run

```bash
cd "{APOLLO_BUILDER_PATH}" && node populate-sequences.js 2>&1 | tee /tmp/populate-run.log &
```

Watch output:
```bash
tail -f /tmp/populate-run.log
```

---

## What Gets Filled Automatically

| Step Type | Auto-filled | Manual |
|-----------|------------|--------|
| Automatic email (T1) | Subject + body | — |
| LinkedIn connect (T2) | Connection note | — |
| Automatic email reply (T3/T5) | Body | — |
| Phone call (T4) | — | Task note (Apollo card stays collapsed) |
| LinkedIn message (T6) | Message | — |
| View profile | — | Nothing needed |

Phone call task notes must be filled manually in Apollo after the script runs.
Navigate to the sequence editor → click Step N: Phone call → expand → paste task note.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Failed to create ProcessSingleton" | Kill Chrome + delete SingletonLock (see Step 5) |
| Template tab not found | Screenshot saved to `/tmp/populate-*-no-template.png` — check Apollo UI for tab name change |
| Body blank after injection | Screenshot at `/tmp/populate-*-body-fail.png` — Quill editor may not have rendered |
| Subject still has AI chip | `Meta+A + Delete` before fill — verify Template tab was clicked first |
| LinkedIn note not filled | Textarea appears after next step is added — script uses `waitForSelector` + force-click fallback |
| Step type not in menu | Check `STEP_TYPE_LABELS` map in script — Apollo may have renamed the menu item |

---

## Script Reference

| File | Purpose |
|------|---------|
| `populate-sequences.js` | Main script — populates existing sequence shells |
| `build-sequences.js` | Creates new sequences from scratch (JSON input) |
| `test-sequence-build.js` | Test script for validating UI flow changes |
| `archive-sequences.js` | Archives sequences by ID via the list "..." context menu |
| `usage_seq_a.json` through `usage_seq_f.json` | Content definitions for A–F sequences |

---

## Notes

- Sequences remain **INACTIVE** after population. Activate manually in Apollo when ready.
- Phone call task notes are manual — script skips them and logs a reminder.
- Run headed (`HEADED=true`) to watch the browser if debugging.
- After running, spot-check T1 and T3 in the Apollo editor to confirm content landed.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| 2026-04 | Added CRITICAL note: must click Template tab and clear AI chips before filling content | Apollo changed step editor default to "Assisted" AI tab; content was landing in wrong tab or appending after AI placeholders |
| (prior) | Documented that populate-sequences.js requires Chrome to be closed; build-sequences.js does not | Different auth mechanisms: populate-sequences.js uses launchPersistentContext (profile lock conflict); build-sequences.js also uses launchPersistentContext but handles it correctly |
| (prior) | Added phone call task note limitation — must be filled manually | Apollo card stays collapsed in Playwright; auto-fill blocked by UI |
