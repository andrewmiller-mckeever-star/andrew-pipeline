# apollo-linkedin-connect

Processes Apollo LinkedIn tasks (Touch 2 connects and Touch 5 profile views / post likes) by
way of headless Playwright. Fetches tasks from the Apollo REST API, acts on LinkedIn, marks
tasks complete by way of the API.

## Automation policy (Andrew, 2026-10-08)

- Connection requests always go out with NO note. Connect-step template text is ignored.
- The script never sends a LinkedIn message or InMail. Touch 7 (`linkedin_step_message`)
  tasks are not fetched. They stay in Andrew's Apollo queue and he sends each one by hand.
- `connect-overrides.json` and `dm-overrides.json` are retired and no longer read.
- Why: on 2026-09-25 and 09-28 the script sent 18 Cohort 1A/1B invites with raw
  `{{calls_30d}}` notes. Apollo never renders variables in LinkedIn steps.

## Where this actually runs

The live copy that the scheduled routines execute is:

```
~/Desktop/YDC Pipeline/apollo-linkedin-connect/apollo-linkedin-connect.js
```

This directory is a tracked snapshot for history, matching how the repo tracks skills and
routines. Edit the Desktop copy, then re-sync here so the change is recorded. The two can
drift if you skip that step.

## What is deliberately not committed

Auth tokens (`storageState.json`), retired per-prospect override files (`dm-overrides.json`,
`connect-overrides.json`), and research
output (`founders.json`, `founder-connection-results.json`). See `.gitignore`.

## Safety design for DMs (historical)

The message send paths are no longer called (policy 2026-10-08). This section is kept as the
requirements for any future send path.

`sendDirectMessage()` will not send unless it can prove the open LinkedIn chat belongs to
the task's contact. It checks that exactly one conversation is open, that its recipient
name matches the contact, and that the typed text matches the intended message. A run
ledger aborts everything if one thread would receive two people's messages.

Every check fails closed. If verification is not possible, nothing is typed and nothing is
sent, and the task stays queued. The worst case is a blocked send, never a message to the
wrong person. See the 2026-07-30 entry in the root `CHANGELOG.md` for why.

## Running it

```bash
DRY_RUN=true node apollo-linkedin-connect.js
```

Requires `APOLLO_API_KEY` in the environment and a logged-in LinkedIn profile at
`~/.linkedin-playwright-profile` (create with `node save-session.js`).
