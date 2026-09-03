# apollo-linkedin-connect

Processes Apollo LinkedIn tasks (Touch 2 connects, Touch 5 post likes, Touch 7 DMs) by way
of headless Playwright. Fetches tasks from the Apollo REST API, acts on LinkedIn, marks
tasks complete by way of the API.

## Where this actually runs

The live copy that the scheduled routines execute is:

```
~/Desktop/YDC Pipeline/apollo-linkedin-connect/apollo-linkedin-connect.js
```

This directory is a tracked snapshot for history, matching how the repo tracks skills and
routines. Edit the Desktop copy, then re-sync here so the change is recorded. The two can
drift if you skip that step.

## What is deliberately not committed

Auth tokens (`storageState.json`), per-prospect DM copy (`dm-overrides.json`), and research
output (`founders.json`, `founder-connection-results.json`). See `.gitignore`.

## Safety design for DMs

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
