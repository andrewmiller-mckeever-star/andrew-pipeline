# New AE Setup Guide

Get the YDC Sales Pipeline running in your Claude Code environment in ~30 minutes.

---

## Step 1 — Clone the Repo

```bash
git clone https://github.com/you-com/ydc-sales-pipeline.git
cd ydc-sales-pipeline
```

---

## Step 2 — Edit ae-config.md (The Only File You Need to Touch)

Open `ae-config.md` in the repo root and fill in your values:

| Field | What to put |
|-------|-------------|
| `AE_NAME` | Your full name as you want it in email signatures (e.g., `Jordan Smith`) |
| `AE_FIRST_NAME` | Your first name for follow-up email signatures (e.g., `Jordan`) |
| `AE_EMAIL` | Your You.com email (e.g., `jordan.smith@you.com`) |
| `APOLLO_BUILDER_PATH` | Where you'll place the Playwright script (default: `~/Desktop/YDC Pipeline/apollo-sequence-builder`) |
| `GDRIVE_FOLDER` | The Drive folder for account plans (default: `Account Plans, Lists & Personalized Sequences`) |
| `RCLONE_REMOTE` | Your rclone remote name (default: `gdrive`) |
| `SALES_DECK_PATH` | Local path to the current You.com pitch deck PDF |

---

## Step 3 — Connect MCP Servers in Claude Code

You need two MCP servers active: **Apollo** and **Slack**.

Ask your sales ops admin to share the MCP server config for both. They'll give you:
- A server URL or local binary path
- Any required API keys or tokens

Once added to your Claude Code settings, verify permissions are correct by comparing your `settings.json` against the one in this repo.

> **Slack:** Uses your existing Slack user token (xoxp-...). You need `search:read` scope.
> **Apollo:** Uses your Apollo.io API key. Find it under Apollo → Settings → Integrations → API.

---

## Step 4 — Set Up rclone for Google Drive

rclone uploads your account plan .docx files to Google Drive automatically.

```bash
# Install
brew install rclone

# Authenticate (follow the browser prompts)
rclone config
# → New remote → Name it "gdrive" → Type: Google Drive → follow OAuth flow

# Verify
rclone listremotes
# Should show: gdrive:

# Test the target folder exists
rclone ls gdrive:"Account Plans, Lists & Personalized Sequences/"
```

If the folder doesn't exist yet, create it in Google Drive first, then test again.

---

## Step 5 — Set Up the Apollo Sequence Builder (Playwright)

This is a local Node.js script that automates Apollo UI sequence creation.

```bash
# Create the directory
mkdir -p ~/Desktop/YDC\ Pipeline/apollo-sequence-builder

# Copy the script from the repo
cp apollo-sequence-builder/* ~/Desktop/YDC\ Pipeline/apollo-sequence-builder/

# Install dependencies
cd ~/Desktop/YDC\ Pipeline/apollo-sequence-builder
npm install
npx playwright install chromium
```

On first run, you'll need to be logged into Apollo in Chrome.
The script uses your existing Chrome profile to preserve the session.

---

## Step 6 — Get the Sales Deck

Download the latest You.com pitch deck from the shared Google Drive folder
(ask your manager or sales ops) and note its local path. Update `SALES_DECK_PATH`
in `ae-config.md` accordingly.

---

## Step 7 — Open the Project in Claude Code

```bash
claude  # from inside the ydc-sales-pipeline directory
```

Claude Code will auto-load `CLAUDE.md` on every session. At the start of your
first pipeline run, Claude will read `ae-config.md` to load your identity and
credentials for that session.

---

## Step 8 — Run a Test Pipeline

Start with a single, low-stakes account to verify all integrations:

```
Run pipeline for [Company Name]
```

Watch for:
- ✅ Research step completes (You.com Research API calls fire automatically, supplemental web search fills gaps)
- ✅ Account plan .docx generated and uploaded to Drive
- ✅ Apollo returns 20+ Director+ contacts
- ✅ 4 sequences written with your name in signatures
- ✅ Playwright script creates sequences in Apollo (INACTIVE)
- ✅ Contacts enrolled with your labels

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Apollo MCP not responding | Check `settings.json` permissions whitelist matches your Apollo MCP UUID |
| rclone auth expired | Run `rclone config reconnect gdrive:` |
| Playwright can't find Apollo | Close all Chrome windows, then re-run the script |
| Sequences built with wrong name | Confirm `AE_NAME` / `AE_FIRST_NAME` in ae-config.md are correct |

---

## Who to Ask

- **MCP server configs (Apollo, Slack):** Sales ops / your manager
- **Google Drive folder access:** Sales ops
- **Sales deck latest version:** Marketing / your manager
- **Pipeline questions:** Check memory/MEMORY.md and memory/feedback.md first
