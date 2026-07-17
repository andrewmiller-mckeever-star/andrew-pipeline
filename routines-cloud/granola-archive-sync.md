# Routine: granola-archive-sync (cloud rebuild)

Rebuilt for cloud: uses the Granola connector + Drive connector. No local Python script, no `.granola_api_key` file, no rclone. The archive itself lives in Drive (`GranolaArchive` folder), so nothing is lost by leaving the laptop copy behind — new transcripts flow straight to Drive.

| Field | Value |
|---|---|
| Schedule | `0 11 * * 1` — 11:00 AM Monday |
| Timezone | America/Denver |
| Repository | andrewmiller-mckeever-star/andrew-pipeline |
| Connectors | Granola, Google Drive, Slack |
| Replaces laptop task | `granola-archive-sync` |
| Expected output | New transcript files in Drive `GranolaArchive/`; `sync-log.md` appended with an OK line; Slack DM ONLY on problems |

## PROMPT

```
Run the granola-archive-sync-cloud skill: archive Granola meeting transcripts to the Google Drive folder "GranolaArchive" before Granola's 30-day free-tier deletion. Use the Granola connector to list meetings from the last 35 days, check which are already archived in Drive, write each missing transcript as its own file, and append an OK line to sync-log.md in the same folder. DM Andrew (U0A4M1BAR08) on Slack ONLY if something goes wrong (Granola auth failure, zero meetings retrievable, Drive write failures). Stay silent on success.
```
