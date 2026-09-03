---
name: ydc-linkedin-apollo-tasks
description: >-
  Processes Apollo LinkedIn tasks (connect requests and DMs) via Playwright script.
  Fetches tasks from Apollo REST API (no Chrome MCP / no Apollo UI required), sends
  each action on LinkedIn via headless Chrome, marks tasks complete via REST API.
  Use when user says "run linkedin tasks", "process apollo linkedin tasks",
  "clear linkedin queue", "run linkedin connects", or "send linkedin messages".
---

# YDC: LinkedIn Apollo Tasks

## Purpose

Clear Apollo's LinkedIn task queue using a Playwright script + Apollo REST API. Handles both task types from the 7-touch sequence:

| Touch | Task type              | Action                                        |
|-------|------------------------|-----------------------------------------------|
| Touch 2 | `linkedin_step_connect` | Send connection request with pre-written note |
| Touch 5 | `linkedin_step_interact_post` | Like prospect's most recent post (last 14 days); mark complete regardless |
| Touch 7 | `linkedin_step_message` | Send DM to already-connected contact          |

Tasks are fetched via Apollo REST API (not scraped from the UI). LinkedIn automation runs in a headless Playwright browser (not Chrome MCP — fully immune to the Chrome MCP domain lock issue).

---

## Prerequisites

- `APOLLO_API_KEY` env var must be set
- `~/.linkedin-playwright-profile` must exist (the persistent Playwright browser profile with LinkedIn session)
  - If missing or session expired: run `node save-session.js` in the script directory — Chrome does NOT need to be quit first
  - A browser window opens, logs in automatically if session is still valid, saves and closes
  - If session is fully expired, log in manually in the opened window — script saves and closes when it detects the `li_at` cookie
  - **Note:** the script does NOT use `storageState.json` — that file is unused and can be ignored

---

## Step 0: Optional — Preview pending tasks before running

To see what will be processed without running the script:

```bash
curl -s -X POST "https://api.apollo.io/api/v1/tasks/search" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sort_by_field":"task_due_at","sort_ascending":false,"per_page":100}' \
  | jq '[.tasks[] | select(.user_id == "{APOLLO_USER_ID}" and (.type == "linkedin_step_connect" or .type == "linkedin_step_message") and .status == "scheduled") | {type, due_at, name: .contact.name}] | sort_by(.due_at)'
```

Present the count and list, ask "Ready to run?" before invoking the script.

---

## Step 1: Run the script

```bash
cd "/Users/andrew/Desktop/YDC Pipeline/apollo-linkedin-connect"
APOLLO_API_KEY=$APOLLO_API_KEY node apollo-linkedin-connect.js
```

Use `DRY_RUN=true` to preview without sending anything:

```bash
DRY_RUN=true APOLLO_API_KEY=$APOLLO_API_KEY node apollo-linkedin-connect.js
```

The script handles all of the following automatically:
- Fetches Andrew's pending LinkedIn tasks from Apollo REST API (filters to `user_id == "{APOLLO_USER_ID}"` client-side — the API's own filters are broken)
- Prefetches DM/connect note text from campaign templates via Apollo API
- Navigates headless Chrome to each LinkedIn profile
- Sends connection requests or DMs
- Marks each task complete via Apollo REST API
- Logs a note on each Apollo contact after action
- Enforces daily (40) and weekly (200) connect caps — skipped tasks are left incomplete for the next run
- Skips DMs with unfilled `[ALL CAPS IN BRACKETS]` placeholders — leaves task for manual editing

---

## Step 2: Read the script output

The script prints a full summary on exit:

```
✅ Connects sent (N):
  • First Last [with note]
  • ...

✅ DMs sent (N):
  • First Last
  • ...

⏭  Skipped — cap reached (N): ...
⏭  Skipped — already connected/pending/no URL (N): ...
⏳ Skipped — not connected yet (N): ...
⚠️  Skipped — unfilled placeholder (N): ... → Edit these DMs manually in Apollo
❌ Errors (N): ...
```

Review for errors and placeholder-skipped contacts. Call out any `⚠️` or `❌` buckets explicitly so Andrew knows what needs manual follow-up.

---

## Step 3: If LinkedIn session has expired

The script will exit immediately with:
```
[ERR] LinkedIn session expired. Quit Chrome, run "node save-session.js" to refresh, then re-open Chrome.
```

To fix:
1. Quit Chrome completely (Cmd+Q)
2. `cd "/Users/andrew/Desktop/YDC Pipeline/apollo-linkedin-connect"`
3. `node save-session.js`
   - Chrome opens headed, clicks through the profile picker automatically
   - If LinkedIn is already logged in, saves state and closes immediately
   - If LinkedIn session is fully expired, the Chrome window stays open — log in manually, then the script saves and closes
4. Re-open Chrome normally
5. Re-run the main script

---

## Step 4: If the entire run fails (auth, network)

The script exits non-zero and prints the error. No partial state is left — tasks that were not reached remain `scheduled` in Apollo and will be picked up on the next run.

If Salesforce returns an Apollo API auth error (401): verify `APOLLO_API_KEY` is valid and not expired.

---

## Connect Cap Rules

- **Daily cap:** 40 connects per day (tracked in `linkedin-run-stats.json` in the script directory)
- **Weekly cap:** 200 connects per week (Mon–Sun rolling window)
- When the daily cap is hit, remaining connect tasks are left in Apollo and will be processed on the next day's run
- When the weekly cap is hit, ALL connect tasks are skipped for the day with a warning in the summary
- DM tasks are not subject to caps — they always run

**Andrew's note:** Periodically withdraw old pending connection requests in LinkedIn (anyone pending > 3 weeks who hasn't accepted). This preserves the 200/week headroom — if pending requests pile up, LinkedIn silently reduces the cap.

---

## Notes

- This skill reads from **Apollo's task queue** — for sequences that generate LinkedIn tasks automatically (Touch 2 connect, Touch 5 post like, Touch 7 DM from `build-sequences.js`).
- The Drive-based `ydc-linkedin-queue` skill is a separate legacy flow for pre-May-2026 whale pipeline accounts with Drive queue files.
- Touch 5 tasks surface as `linkedin_step_interact_post` in the Apollo REST API — a distinct type, not `action_item`. The script also includes a legacy fallback for any `action_item` tasks whose note contains `"Like most recent LinkedIn post"` (older sequences built before the type was confirmed).
- The Apollo task API filters (`task_types`, `assignee_ids`) are broken — they return all org-wide tasks regardless. The script filters client-side on `user_id == "{APOLLO_USER_ID}"`.

---

## Known Bugs Fixed (2026-05-28)

### Bug 1 — All DMs sent to first contact (concatenated)
LinkedIn's messaging overlay is a **persistent SPA panel inside a shadow DOM** (`#interop-outlet`) that survives `page.goto()` navigation. After sending (or attempting to send) a DM to contact #1, navigating to contact #2's profile left the chat bubble open. The `contenteditable` selector found the previous person's still-open compose box instead of the new contact's. `document.execCommand('selectAll')` does not reliably select existing text in LinkedIn's React contenteditable, so each successive message was **appended** instead of replaced — resulting in one giant concatenated message sent to contact #1.

**Fix:** `closeMessageOverlays()` is called after every `liPage.goto()` in both the connect and DM task branches. It uses:
```javascript
liPage.getByRole('button', { name: /^Close your conversation/i })
```
Playwright's `getByRole()` pierces shadow DOM automatically. The close button has **no aria-label** — it is identified by button text content only ("Close your conversation with [Name]"). The old class-based selectors (`msg-overlay-conversation-bubble`, etc.) no longer exist in LinkedIn's DOM — they use obfuscated hashed class names.

### Bug 2 — Em dashes in DM text
Apollo sequence templates generated by the LLM sometimes contain em dashes (—) despite the "no em dashes" writing rule. `renderTemplate()` now strips them:
```javascript
.replace(/\s*—\s*/g, ', ')
```
e.g. "Hey Elise — Staff PM at Databricks" → "Hey Elise, Staff PM at Databricks"

## Known Bugs Fixed (2026-06-02)

### Bug 3 — Connect modal buttons blocked by `interop-outlet` shadow DOM (43 errors)
LinkedIn's `#interop-outlet` div (`data-testid="interop-shadowdom"`) is a **permanent shadow DOM element** on every LinkedIn page — not just when a chat is open. It intercepts pointer events and blocks Playwright's `.click()` from landing on buttons that render near or behind it. The connect modal's "Send without a note" and "Add a note" buttons fall exactly in this zone, causing a 30-second timeout and an error on every affected contact.

This is the **same root cause as Bug 1** (interop-outlet shadow DOM), just in the connect path instead of the DM path. The May 28 fix closed open chat conversations but didn't address the underlying pointer interception on the connect modal buttons.

**Fix:** All button clicks inside `handleConnectModal()` now use `el.evaluate((el) => el.click())` instead of Playwright's `.click()`. This bypasses both shadow DOM pointer interception and viewport boundary constraints — the same technique already used in `sendDirectMessage()` for the DM send button.

**Rule for future changes:** Any button click inside a LinkedIn modal must use `evaluate((el) => el.click())`, not `.click()`. The `interop-outlet` is always present and will block standard Playwright clicks on modal buttons. Textarea fills should use `execCommand('selectAll') + execCommand('insertText')` for the same reason.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| 2026-06-02 | Bug 3 fix: connect modal buttons blocked by `#interop-outlet` shadow DOM | 43 errors in a single run; Playwright `.click()` was timing out on "Send without a note" / "Add a note" buttons. Fix: use `el.evaluate((el) => el.click())` in `handleConnectModal()` |
| 2026-05-28 | Bug 2 fix: em dashes in DM text causing LinkedIn send failures | LLM-generated templates sometimes contained em dashes despite the "no em dashes" rule; added `.replace(/\s*—\s*/g, ', ')` in `renderTemplate()` |
| 2026-05-28 | Bug 1 fix: all DMs going to first contact (message overlay persisted across navigation) | LinkedIn's `#interop-outlet` shadow DOM panel survives `page.goto()`; `closeMessageOverlays()` now called after every `goto()` using `getByRole('button', { name: /^Close your conversation/i })` to pierce shadow DOM |
| (prior) | Added Touch 5 (`linkedin_step_interact_post`) support | New task type confirmed in Apollo REST API; previously handled as `action_item` fallback only |
| (prior) | Switched from Chrome MCP to dedicated Playwright script with `~/.linkedin-playwright-profile` | Chrome MCP domain lock caused failures; isolated profile eliminates the conflict |
