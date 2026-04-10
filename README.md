# YDC Sales Pipeline

AI-powered sales pipeline for You.com API outreach, built on Claude Code. Automates research, account planning, prospect discovery, outreach sequencing, and Apollo.io enrollment for enterprise accounts.

---

## What This Does

The pipeline takes a target company name and produces a complete, ready-to-run outreach campaign in six steps:

| Step | What happens |
|------|-------------|
| 1 | Deep company research (Drive, Slack, You.com Research API, web) |
| 2 | 9-section account plan generated as a .docx |
| 3 | Prospect discovery via Apollo.io (Director+ contacts) |
| 4 | 4 personalized outreach sequences (20 contacts, 5 touches each) |
| 5 | Account plan uploaded to Google Drive via rclone |
| 6 | Sequences built in Apollo.io (INACTIVE) and contacts enrolled |

---

## Architecture

```
ydc-sales-pipeline/
├── CLAUDE.md                    # Always-on knowledge base (loads every session)
├── ae-config.md                 # Your identity, paths, and credentials
├── setup_server.py              # Web-based AE onboarding wizard (localhost:8002)
├── SETUP.md                     # Manual setup guide
├── apollo-sequence-builder/
│   └── build-sequences.js       # Playwright script — builds sequences in Apollo UI
├── skills/
│   ├── ydc-pipeline/            # Orchestrator — runs all 6 steps end-to-end
│   ├── ydc-research/            # Step 1: company research
│   ├── ydc-account-plan/        # Step 2: account plan generation
│   ├── ydc-prospects/           # Step 3: Apollo prospect discovery
│   ├── ydc-outreach/            # Step 4: outreach sequence writing
│   └── ydc-apollo-build/        # Steps 5+6: Drive upload + Apollo build
├── memory/
│   ├── MEMORY.md                # Accumulated pipeline learnings and session log
│   ├── product-knowledge.md     # Outreach-safe You.com product knowledge
│   ├── outreach-rules.md        # Writing rules and anti-patterns
│   └── feedback.md              # AE feedback on past runs
└── downloads/                   # Sales deck and downloaded Drive files
```

**Skill layer:** Skills live in `~/.claude/skills/` and are loaded by Claude Code when triggered. The pipeline also uses office skills (docx, pdf, xlsx) and the YDC CAI PAL skill for product knowledge lookups.

**MCP integrations:** Apollo.io and Slack are connected as Claude Code MCP servers, giving Claude direct access to Apollo search/enrich/enroll APIs and Slack channel search during pipeline runs.

---

## Setup

### Option A: Web Wizard (recommended for new AEs)

```bash
cd ydc-sales-pipeline
python3 setup_server.py
# open http://localhost:8002
```

The wizard walks through 5 steps: identity, Apollo Sequence Builder path, Google Drive / rclone, sales deck, and MCP connection verification. All values are saved to `ae-config.md`.

### Option B: Manual

See `SETUP.md` for the full 8-step manual process. Key requirements:

- **Claude Code** with Apollo and Slack MCP servers configured
- **rclone** authenticated to Google Drive (`rclone config`)
- **Node.js + Playwright** for the Apollo sequence builder script
- `ae-config.md` filled in with your name, email, and file paths

---

## Configuration (`ae-config.md`)

The only file you need to edit. All pipeline skills read from here.

| Field | Description |
|-------|-------------|
| `AE_NAME` | Full name for email signatures and Apollo labels |
| `AE_FIRST_NAME` | First name for follow-up signatures |
| `AE_EMAIL` | Your You.com email |
| `AE_TITLE` | Your title |
| `APOLLO_BUILDER_PATH` | Path to the `apollo-sequence-builder/` directory |
| `RCLONE_REMOTE` | rclone remote name (default: `gdrive`) |
| `GDRIVE_FOLDER` | Drive folder name for account plan uploads |
| `GDRIVE_FOLDER_URL` | Drive folder URL |
| `SALES_DECK_PATH` | Local path to the You.com pitch deck PDF |
| `SALES_DECK_URL` | Drive URL of the pitch deck |

---

## Example Prompts

### Run the Full Pipeline

```
Run the full pipeline for Databricks
```
```
Run pipeline for Snowflake — prioritize engineering and AI/ML leaders
```
```
Run pipeline for Stripe, focus on the developer platform team
```

Runs all 6 steps: research, account plan, prospects, outreach, Drive upload, Apollo build and enrollment.

---

### Individual Steps

**Step 1 — Research only**
```
Research Palantir for the pipeline
```
```
Run Step 1 research for Cloudflare and summarize what you find
```

Searches Google Drive and Slack for prior context, fires 5 parallel You.com Research API calls across AI initiatives, leadership, competitive pressures, recent news, and data infrastructure. Outputs a structured research brief with 20+ citations.

---

**Step 2 — Account plan only**
```
Generate the account plan for Databricks using the research you just did
```
```
Write the account plan for Snowflake — we have an existing relationship with the data platform team
```

Produces a 9-section .docx account plan including: overview, strategic context, buying center map, pain analysis, solution mapping, competitive risks, ROI justification, and outreach strategy appendix.

---

**Step 3 — Prospect discovery only**
```
Find prospects for Palantir — Director and above in Engineering and AI
```
```
Pull Apollo prospects for Stripe, focus on platform and infrastructure leaders
```
```
Search Apollo for VP+ contacts at Databricks across Engineering, Product, and AI/ML
```

Queries Apollo.io for Director+ contacts in target departments, bulk-enriches for verified emails, assigns each contact to one of four ICP sequences (A/B/C/D), outputs a table with sequence assignments.

---

**Step 4 — Outreach sequences only**
```
Write the outreach sequences for Palantir based on the account plan
```
```
Generate all 4 sequences for Snowflake — the trigger is their recent Cortex AI launch
```
```
Write outreach for Stripe with a hook on their agent toolkit announcement
```

Writes 4 sequences (Engineering leaders, Executive sponsor, Product leaders, AI/ML leaders), each with a 5-touch cadence: Email > LinkedIn Connect > Email reply > Call > Email reply/breakup. Output is in JSON format compatible with the Playwright sequence builder script.

---

**Steps 5 + 6 — Drive upload and Apollo build**
```
Upload the Databricks account plan to Drive and build the Apollo sequences
```
```
Run Steps 5 and 6 for Snowflake — sequences are ready
```

Uploads the .docx to the correct Drive folder, creates 4 sequences in Apollo (INACTIVE), creates the company account if missing, imports contacts, and enrolls them in their assigned sequences with "Whale Pipeline" labels.

---

### Batch Processing

```
Run the pipeline for these three accounts: Databricks, Snowflake, Palantir
```
```
Batch pipeline — Stripe, Checkr, Brex (research all three first, then build plans)
```

The orchestrator runs each account sequentially through all 6 steps.

---

### Research Shortcuts

```
Check Slack and Drive for anything on Palantir before I start the pipeline
```
```
Search #api-gtm-team and #esl-api-sales for any Snowflake context
```
```
Is there an existing account plan for Databricks in Drive?
```

---

### Apollo Tasks (standalone)

```
Search Apollo for CTOs and VPs of Engineering at Series C+ fintech companies
```
```
Find 10 Director+ AI/ML contacts at Palantir and enrich them
```
```
Add these contacts to the Databricks Seq A sequence in Apollo
```
```
Check the Apollo sequence status for Snowflake
```

---

### Outreach Editing

```
Rewrite Touch 1 of Seq A for Palantir — use their recent DoD contract as the hook
```
```
The breakup email for Snowflake Seq B is too long — tighten it to under 120 words
```
```
Check this email draft against the writing rules
```
```
Does this LinkedIn note follow the connect rules?
```

---

### Account Plan Editing

```
Update Section 5 of the Databricks account plan with the Unity Catalog use case
```
```
Add the new DuckDuckGo case study to the ROI section of the Snowflake plan
```
```
The Palantir account plan needs a stronger competitive section — they're evaluating Exa
```

---

### Pipeline Utilities

```
Show me the quality checklist for the Databricks deliverables
```
```
What accounts have we run through the pipeline so far?
```
```
Summarize the session log from the last Snowflake run
```
```
Read ae-config.md and confirm my setup is correct
```

---

## The 4 Outreach Sequences

Every pipeline run produces four sequences, each targeting a different ICP:

| Sequence | Target Persona | Primary Hook |
|----------|---------------|-------------|
| Seq A | Engineering leaders (VP/Dir Eng, Platform, Infra) | Technical depth, latency/accuracy benchmarks |
| Seq B | Executive sponsor (CTO, CIO, CDO, VP AI Strategy) | Founder credibility, business risk of weak data infra |
| Seq C | Product leaders (VP/Dir Product, Head of AI Products) | Product differentiation, competitive moat |
| Seq D | AI/ML leaders (VP/Dir ML, Head of AI, AI Arch) | Research-grade infrastructure, real-time grounding |

Each sequence follows a 5-touch cadence:

```
Touch 1: Email (opener — AIDA structure, 100-150 words)
Touch 2: LinkedIn Connect (under 250 chars, zero pitch)
Touch 3: Email reply (follow-up — new proof point, 80-120 words)
Touch 4: Call
Touch 5: Email reply (breakup — 80-120 words)
```

---

## The Apollo Sequence Builder

`apollo-sequence-builder/build-sequences.js` is a Node.js + Playwright script that automates sequence creation directly in the Apollo.io UI. It runs outside Claude Code to avoid browser automation consuming conversation tokens.

The script operates in 4 phases:

1. **UI prep** — dismisses banners and modals
2. **Sequence creation** — creates each sequence with the correct name and settings
3. **Step injection** — adds each touch (email, LinkedIn, call) using Apollo's step type menu; email bodies are injected via the Quill rich-text editor
4. **Verification** — confirms all steps were created correctly

**Run it after Step 4:**
```bash
cd /path/to/apollo-sequence-builder
node build-sequences.js
```

The script reads the JSON output from Step 4 and requires an active Apollo session in Chrome (uses your existing Chrome profile for auth).

**Naming convention:** `YDC | {Company} | Seq {A/B/C/D}`

**All sequences are created INACTIVE** — you activate them manually after review.

---

## Writing Rules (Quick Reference)

All prospect-facing copy enforces these rules automatically:

- No em dashes (use commas, periods, colons, semicolons, or pipes)
- No markdown in email bodies (no bold, headers, or lists)
- First sentence starts with THEM, never "I," "We," "Our," or "At You.com"
- One proof point per email, one CTA per email
- Interest-based CTAs only ("Worth a conversation?" not "15 minutes this week?")
- 5th-7th grade reading level, 2-3 sentence paragraphs
- No competitor names in outreach (use "legacy search API," "incumbent providers")
- No AI-ism vocabulary: utilize, comprehensive, enhance, delve, robust, streamline

**Banned openers:** "I hope this email finds you well," "I'm reaching out because," "I wanted to introduce myself," "Congrats on your role" (without specifics)

---

## Key Resources

| Resource | Location |
|----------|----------|
| AE config | `ae-config.md` |
| Setup wizard | `python3 setup_server.py` then open http://localhost:8002 |
| Pipeline skills | `~/.claude/skills/ydc-pipeline/` (and sibling dirs) |
| Product knowledge | `memory/product-knowledge.md` |
| Outreach rules | `memory/outreach-rules.md` |
| Session log | `memory/MEMORY.md` |
| Sales deck | Path set in `ae-config.md` under `SALES_DECK_PATH` |
| Sequence builder | `apollo-sequence-builder/build-sequences.js` |

---

## Slack Channels

The pipeline searches these channels for prior account context before each run:

| Channel | Purpose |
|---------|---------|
| `#api-gtm-team` | API GTM strategy, competitive positioning, customer evaluations |
| `#sales-team` | General sales, territory planning, deal strategy |
| `#esl-api-sales` | Enterprise API sales conversations, deal notes |
| `#competition` | Competitive intel, market landscape |
| `#enterprise-solutions` | Enterprise RAG, security, compliance discussions |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Apollo MCP not responding | Check `settings.json` — permissions whitelist must include the Apollo MCP UUID |
| rclone auth expired | Run `rclone config reconnect gdrive:` |
| Playwright can't find Apollo | Close all Chrome windows, re-run the script |
| Sequences built with wrong name | Confirm `AE_NAME` in `ae-config.md` is correct, restart the setup wizard |
| Script directory check fails | Confirm `APOLLO_BUILDER_PATH` points to the folder containing `build-sequences.js` |
| Drive upload fails | Run `rclone ls gdrive:` to verify auth and remote name |
