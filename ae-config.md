# AE Configuration

This is the **only file you need to edit** to set up the pipeline for your account.
Fill in every value below before your first pipeline run. All other files read from here.

---

## Identity

```
AE_NAME:        Nick Opderbeck
AE_FIRST_NAME:  Nick
AE_EMAIL:       nick@you.com
AE_TITLE:       API Sales, You.com
```

> These values are injected into outreach sequence signatures, Apollo contact labels,
> and account plan attribution. Use the name exactly as you want it to appear in emails.

---

## Apollo Sequence Builder (Local Playwright Script)

```
APOLLO_BUILDER_PATH: /Users/nick/ydc-sales-pipeline/apollo-sequence-builder
```

> This is where the Node.js Playwright script lives locally. If you placed it
> somewhere else, update this path. The pipeline will reference this when
> prompting you to run build-sequences.js.

---

## Google Drive

```
GDRIVE_FOLDER:   Account Plans, Lists & Personalized Sequences
RCLONE_REMOTE:   gdrive
```

> Account plans (.docx) are uploaded here via rclone. The folder must exist in
> your Google Drive. The rclone remote name must match your local rclone config
> (`rclone listremotes` to check). Run `rclone config` to set up if needed.

---

## Sales Deck

```
SALES_DECK_PATH: ~/Downloads/You.com - AI Search Infra Pitch Deck - January 2026.pdf
```

> The current pitch bible. Update this path when a new deck is released.
> Used for pitch framing, case study references, and competitive positioning context.

---

## Memory Files Location

```
MEMORY_PATH: ~/.claude/projects/-Users-{your-username}-{your-project-path}/memory/
```

> Claude auto-generates this path based on where the project lives on your machine.
> You don't need to set this manually — it's here for reference when skills
> cross-reference memory files.

---

## Notes for New AEs

- **Apollo MCP:** Your Apollo.io account must be connected in Claude Code settings.
  Ask your admin to share the MCP server config (UUID in settings.json).
- **Slack MCP:** Your Slack user token must be connected. Same — ask your admin.
- **rclone:** Must be installed and authenticated to your Google account.
  Quick setup: `brew install rclone && rclone config`
- **Playwright:** Must be installed in the apollo-sequence-builder directory.
  `cd ~/Desktop/YDC\ Pipeline/apollo-sequence-builder && npm install`
- **First pipeline run:** Start with a single account to verify all integrations
  are working before running a batch.

See SETUP.md for full step-by-step onboarding instructions.
