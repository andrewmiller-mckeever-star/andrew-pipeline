# Routine: granola-archive-sync-watchdog

| Field | Value |
|---|---|
| Schedule | `0 11 * * 4` — 11:00 AM Thursday |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Granola, Google Drive, Slack |
| Replaces laptop task | `granola-archive-sync-watchdog` |
| Expected output | Usually nothing (silent). If Monday's sync was missed: full catch-up run; Slack DM only on problems |

## PROMPT

```
You are the mid-week catch-up watchdog for the Granola transcript archive.

Step 1: In the Google Drive folder "GranolaArchive", find sync-log.md (Drive connector search_files) and read it. Find the most recent line starting with "OK" and parse its ISO timestamp.

Step 2: If that last OK is less than 7 days old, exit silently — Monday's sync ran.

Step 3: If sync-log.md is missing, has no OK line, or the last OK is 7+ days old, run the granola-archive-sync-cloud skill now (full archive pass: list Granola meetings from the last 35 days via the Granola connector, write missing transcripts to the GranolaArchive Drive folder, append an OK line to sync-log.md).

Step 4: If the catch-up run itself hits problems (Granola auth failure, Drive write failure), DM Andrew (U0A4M1BAR08) with what failed and what to check. If Granola auth is the problem, tell him to re-authenticate the Granola connector in claude.ai settings. Stay silent on normal catch-up success.
```
