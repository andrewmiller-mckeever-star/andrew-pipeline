# YDC Sales Pipeline

AI-powered whale account sales pipeline for You.com API Sales. Built on Claude Code with custom skills, memory files, and Apollo.io integration.

## What's Here

| Directory | Purpose |
|-----------|---------|
| `CLAUDE.md` | Master knowledge base — products, outreach rules, competitive intel, guardrails |
| `settings.json` | Claude Code permissions (pre-approved MCP tools for Apollo + Slack) |
| `memory/` | Accumulated learnings — pipeline memory, outreach rules, feedback, product knowledge |
| `skills/` | 6 pipeline skills with reference docs (research, account plan, prospects, outreach, Apollo build) |
| `apollo-sequence-builder/` | Standalone Playwright script for building sequences in Apollo UI |

## Pipeline Overview

1. **Research** (ARI Deep Research PDF) — Company deep-dive
2. **Account Plan** (.docx) — Strategic analysis + use case mapping
3. **Prospect Discovery** (Apollo API) — ICP-matched contacts with enrichment
4. **Outreach Sequences** (in-memory) — 4 persona-segmented, 5-touch sequences
5. **Drive Upload** — Account plan to Google Drive
6. **Apollo Build** — Sequence creation (Playwright) + contact enrollment (API)

## Setup

This repo is a backup/reference for a Claude Code instance. To use:

1. Clone to your machine
2. Copy files to their original locations (see file structure above)
3. Ensure Claude Code MCP integrations are connected (Apollo, Slack, Gmail, Calendar)
4. Run `npm install` in `apollo-sequence-builder/`

## Not Included

- Account-specific deliverables (.docx plans, .csv prospect lists) — stored in Google Drive
- Sequence data files (*_sequences.json) — contain contact PII
- Chrome CDP / office skills — third-party, install separately
- API keys or credentials — never committed
