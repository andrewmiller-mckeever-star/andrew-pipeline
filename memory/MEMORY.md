# Whale Pipeline Memory Index

## Project
You.com whale account sales pipeline. Automates research, account plans, prospect discovery (Apollo primary), outreach sequences, Google Drive upload, and Apollo.io sequence build with contact enrollment.

## Key Files
- CLAUDE.md: {repo-root}/CLAUDE.md (full pipeline instructions)
- ae-config.md: {repo-root}/ae-config.md (AE identity, file paths — edit this first)
- Sales Deck: See `SALES_DECK_PATH` in ae-config.md
- product-knowledge.md: {MEMORY_PATH}/product-knowledge.md (deep product context from CS Team Site)
- perplexity-cdp.md: {MEMORY_PATH}/perplexity-cdp.md (Perplexity Deep Research CDP automation patterns)
- territory-pipeline.md: {MEMORY_PATH}/territory-pipeline.md (2-seq model for Tier 2.A accounts)
- Office skills: ~/.claude/skills/claude-office-skills/ (PPTX, DOCX, XLSX, PDF generation)
- Chrome CDP skill: ~/.claude/skills/chrome-cdp/ (live Chrome browser interaction via CDP, replaces Claude in Chrome MCP)
- Apollo Sequence Builder: See `APOLLO_BUILDER_PATH` in ae-config.md (Playwright script for Step 6A, runs outside Claude)
- Google Drive folder: See `GDRIVE_FOLDER` in ae-config.md
- salesforce.md: {MEMORY_PATH}/salesforce.md (SFDC org schema, activity prefixes, Databricks fields, pipeline integration)
- Salesforce skill: ~/.claude/skills/ydc-salesforce/SKILL.md (7 SOQL queries, CRM Intelligence Brief format, 5 decision gates, standalone + pipeline use)

## Pending Test: Sonnet for Outreach Copy (Step 4)
- **Status:** User wants to test Sonnet for outreach writing on the next pipeline run instead of Opus
- **Rationale:** If Sonnet follows all guardrails (AIDA, word counts, banned patterns, CTAs, reading level) the quality may be sufficient and would save significant Opus compute
- **Action:** Before next pipeline run, ask user: "Want to test Sonnet for outreach copy this run, or stay on Opus?"
- **If approved:** Route Step 4 to Sonnet subagent with full CLAUDE.md guardrails, outreach-rules.md, and json-format.md passed as context. Opus reviews output before JSON write.

## Research Tool: ARI Deep Research PDF (PRIMARY, as of 2026-03-19)
- **Replaces:** Perplexity Deep Research (which replaced Brave/WebSearch)
- **How:** User generates ARI deep research report on You.com → uploads PDF → Claude reads and ingests
- **Benchmark:** ARI scored 37/40 on PANW vs Perplexity 36/40 on Teradata. Stronger on financial depth, higher citation density (85+ footnoted URLs), pre-formatted PDF with TOC.
- **Key advantage:** Zero compute cost (no CDP browser automation, no polling, no extraction). Same or better quality. User controls the query and can iterate.
- **Execution:** User pastes query template into You.com ARI → downloads PDF → provides to Claude at pipeline start → Claude reads with Read tool
- **Query template:** 5 areas: AI Initiatives, Leadership, Competitive Pressures, Recent News, Data & Search Infrastructure. Area 5 is the You.com-relevant dimension (surfaces search/data infra signals). Full template in ydc-research SKILL.md.
- **Fallback stack:** Perplexity Deep Research via CDP (perplexity-cdp.md) → Brave/WebSearch
- **Supplemental:** Brave/WebSearch for gap-filling only (very recent news, specific URLs, LinkedIn signals)

## Document Generation (claude-office-skills)
- **Location:** `~/.claude/skills/claude-office-skills/`
- **Python venv:** `~/.claude/skills/claude-office-skills/venv/`
- **Capabilities:** Create, read, edit, convert PPTX, DOCX, XLSX, PDF files
- **SKILL.md files:** `public/pptx/SKILL.md`, `public/docx/SKILL.md`, `public/xlsx/SKILL.md`, `public/pdf/SKILL.md`
- **System deps (Homebrew):** Node.js v25.8.0, Poppler 26.03.0, Pandoc 3.9, LibreOffice 26.2.1
- **Anthropic built-in skills also available:** pptx, docx, xlsx, pdf (auto-trigger on file type mentions)
- **Use case:** Ad-hoc deal follow-up docs (custom decks, PDFs, ROI models). The whale pipeline's templated .docx generation continues using direct python-docx for deterministic control.
- **Google Workspace status:** Gmail + Calendar via MCP. Drive via rclone CLI only (upload/download, no native Docs/Slides/Sheets creation).

## Critical User Feedback (from prior sessions)
See: [feedback.md](feedback.md) for full list

### Top Rules (confirmed by user)
1. **NEVER name active evaluations or confidential customers in outreach.** KPMG is an active eval. Use anonymized references only ("a Big 4 firm").
2. **NEVER reference any specific customer evaluation in outreach, even anonymized.** No query counts, no "head-to-head" language, no anonymized details that could narrow down the customer. Use only: generic traction stats (1B+ queries, 5K+ customers, 57% F500) and named public case studies (DuckDuckGo, Windsurf, Harvey, Databricks).
3. **NEVER name competitors in prospect-facing outreach.** No Exa, Tavily, Perplexity API, Vertex AI, Bing API. Use: "other search API providers," "search API incumbents," "legacy search APIs." Exception: internal docs, battlecards, live conversations where prospect names a competitor first.
4. **Product focus: Search API, Contents API, Research API ONLY.** PRAG, AI Factory, and Chat are permanently excluded from all outreach, pipeline runs, account plans, and sequences. Search API always leads. Contents API and Research API are supporting angles. Vertical Index adds depth when industry signals warrant it. NEVER reference PRAG/AI Factory/Chat/ESL/Apex in prospect-facing output. Updated 2026-03-26.
5. **Be concise.** All outputs should be tight and actionable. No filler.
6. **Always check Drive + Slack for prior account context** before starting any pipeline run.
7. **Sales deck is the pitch bible.** Reference it for value framing, case studies, competitive positioning, and the tech eval process.
8. **Follow-up emails are replies, not new threads.** Only Touch 1 gets a unique subject line. Touches 3 and 5 reply to the original thread. In Apollo, use "reply to previous email" step type.
9. **Standardized 5-touch sequence for all personas.** Email (Day 1) > LinkedIn Connect (Day 2) > Email reply (Day 5) > Call (Day 8) > Email reply/breakup (Day 14). Non-negotiable structure.
10. **CS Team Site content is internal-only.** product-knowledge.md contains distilled outreach-safe knowledge. NEVER reference the CS site, link to it, or reproduce internal processes/team names/pricing/customer names in prospect-facing output.

## Outreach Writing Standards
See: [outreach-rules.md](outreach-rules.md) for full details

### Quick Reference
- **Always greet by name:** Every email opens with "Hi {{first_name}}," on its own line. Use Apollo merge variable in sequences.
- No em dashes (hard rule)
- Plain text only in email bodies (no markdown formatting)
- Short paragraphs (2-3 sentences max)
- AIDA structure required for every email touch
- Hook prioritization: trigger events > their content > mutual connection > company initiative > role pain
- Anti-patterns: 8 banned openers, 8 banned patterns (see CLAUDE.md Step 4)
- One proof point + one CTA per email, never more
- **Interest-based CTAs only in cold outreach.** No time-based asks ("15 minutes," "quick call this week"). Use: "Is this something you're evaluating?" / "Worth a conversation?"
- **Tentative language in Interest section.** Frame pain as hypothesis: "usually when teams do X, they tend to hit Y." Never diagnose as fact.
- Every opener starts with THEM, not us
- **Word counts:** Opener 80-120 words, follow-up 80-120, breakup 80-120 (tightened 2026-03-30 per Gong 28M email data)
- **5th-7th grade reading level.** Short sentences, no compound-complex structures.
- **Strip corporate suffixes.** "Teradata" not "Teradata Corporation."
- **Expanded banned AI-ism vocab:** utilize, comprehensive, enhance, delve, embark, robust, streamline
- Only Touch 1 gets a unique subject line (**under 6 words**, tightened 2026-03-30); Touches 3 and 5 are replies to Touch 1 thread
- **Each follow-up adds NEW context.** Touch 3 and Touch 5 need a distinct new reason to respond. Never rephrase the same ask. (added 2026-03-30 per Gong data)
- Never reference specific evals (even anonymized) or name competitors in outreach
- **LinkedIn connect notes: Fact-to-Consequence + Curiosity Hook formula.** Under 250 chars. Zero pitch, zero CTA, zero flattery, zero role claims. State what they did AND what problem it creates, then end on a curiosity question. No "Would be great to connect" close (connect button handles this). No glazing or characterizing initiatives ("big move," "notable shift"). Add light domain signals in parentheses: "(be it with a web index or otherwise)." No product names, no meeting asks, no "impressive," no title drops. Profile handles identity. Email sequence carries the pitch.
- **MCP server hook is NOT a required element.** Use only when it naturally fits the persona and context.

## Pipeline Accounts Processed
- **Brex** (2026-02-27): Full pipeline (Steps 1-6). 4 sequences built in Apollo (INACTIVE). 12 contacts enrolled (4 Seq A, 3 Seq B, 3 Seq C, 2 Seq D). Seq D used fallback rule: Shawn Compton (Dir. Engineering, ex-Wealthsimple) + Flora Zhang (Dir. Business Ops Analytics, AI/data-adjacent). 2 skipped: Pedro Franceschi (warm intro only), Ryan Li (extrapolated email). Deliverables on Drive.
- **Checkr** (2026-03-02): Full pipeline (Steps 1-6). 4 sequences built in Apollo (INACTIVE). 11 contacts enrolled (4 Seq A, 2 Seq B, 3 Seq C, 2 Seq D). 1 skipped: Daniel Yanisse (CEO, warm intro only). Seq B: Ilan Frank (CPO) + Jennifer Yeh (CLO). Seq D: Gio Granato (Sr. Dir Data/ML/AI) + Anindita Dasgupta (Dir Platform Eng, fallback). 3 existing contacts reused (Cristian Brotto, Ilan Frank, Sandeep Thakur). Deliverables on Drive.

## Apollo.io Integration (Live)
- **Account:** See `AE_EMAIL` in ae-config.md | ~498K lead credits | ~496K direct dial credits
- **Status:** Connected via MCP. Fully integrated into pipeline (Steps 3 and 6).
- **Step 3 (Prospect Discovery):** Apollo is the sole tool. `apollo_mixed_people_api_search` for discovery, `apollo_people_bulk_match` for enrichment (batches of 10).
- **Step 6 (Sequence Build):** Two phases:
  - Phase A: Playwright script (`~/Desktop/YDC Pipeline/apollo-sequence-builder/build-sequences.js`) creates sequences in Apollo UI. Claude writes JSON data file → alerts user to run script in terminal → user confirms → Claude proceeds to Phase B. Runs outside Claude so errors don't burn tokens.
  - Phase B: API creates contacts (`apollo_contacts_create` with `run_dedupe: true`) and enrolls them (`apollo_emailer_campaigns_add_contact_ids`)
- **Naming convention:** `YDC | {Company} | Seq {A|B|C|D}: {Persona Label}`
- **Label convention:** `"Whale Pipeline"` (global) + `"{Company} - Seq {A|B|C|D}"` (per-sequence)
- **KEY GUARDRAIL:** Sequences are ALWAYS left INACTIVE. NEVER auto-activate or send. User activates manually after review.
- **CONTACT CAP:** 5 contacts per ICP sequence (A, B, C, D). No duplicates across sequences (one contact, one sequence). Prioritize by: title relevance > verified email > use case alignment. Drop no-email prospects first.
- **SENIORITY PRIORITIZATION:** Seq B = C-suite first, then VPs. Seq A/C/D = remaining VPs first, then Directors, then 1-2 managers only as last resort.

### Standardized 5-Touch Cadence (All Sequences, Confirmed 2026-03-02)
Email (Day 1) > LinkedIn Connect (Day 2) > Email Reply (Day 5) > Call (Day 8) > Email Reply/Breakup (Day 14)

### Sequence Persona Segmentation (Confirmed 2026-02-27)
- **Seq A: Engineering Leader** | Dir of Eng, VP Eng, SVP Eng, Head of Eng | Focus: Search API infra, technical integration, platform decisions, AI
- **Seq B: Executive Sponsor** | CTO, CIO, Chief AI Officer, Chief Data Officer, Chief Strategy Officer, CEO (warm intro only, last resort if CTO/CIO/CAO/CDO/CSO unavailable) | Focus: Strategic AI infra, business case, enterprise decisions
- **Seq C: Product Leader** | Dir of Product, VP Product, Head of Product, Product Strategy. Adjacent (Compliance/Risk/Fraud) only if directly relevant, but rarely. | Focus: Product outcomes mapped to AI search infra or PRAG
- **Seq D: AI/ML Leader** | Head of AI/ML, VP Data Science, Dir of Data Science, VP Data, ML Eng Directors, Head of Applied AI | Focus: RAG pipelines, AI agent grounding, model infra, search layer for AI
- **Rules:** No duplicates across sequences (one contact, one sequence). 5 contacts per sequence. DevRel is NOT ICP.
- **Seniority prioritization:** Seq B = C-suite first, then VPs. Seq A/C/D = remaining VPs first → Directors → 1-2 managers only as last resort when VP/Director options exhausted.
- **Fallback rule:** If exact persona doesn't exist, fill with closest adjacent role not already in another sequence (e.g., no AI/ML leaders for Seq D → use engineering directors not in Seq A). Only skip a sequence if no primary or adjacent roles exist.

## Apollo Sequence Builder (Step 6A)
- **Tool:** Standalone Playwright script at `~/Desktop/YDC Pipeline/apollo-sequence-builder/build-sequences.js`
- **Replaced:** Claude in Chrome browser automation (deprecated 2026-03-09 due to excessive token burn from UI errors)
- **How it works:** Claude writes `{account}_sequences.json` → alerts user to run `HEADED=true node build-sequences.js {file}.json` → user runs it → confirms success → Claude proceeds to Phase B (API enrollment)
- **Technical details:** Uses real Chrome with existing profile (not Playwright test browser). Quill editor DOM injection for email bodies. Index-based `fillNewStepInput()` for LinkedIn/phone/action steps (snapshots textarea+editor counts BEFORE adding each step, targets only NEW visible elements by index). Phase 0 UI dismissal for banners/modals. Safety check against Apollo's "Add personalized follow up" AI trap. Post-save verification. Results written to `_results.json`.
- **TEXTAREA TARGETING FIX (2026-03-30):** NEVER use `page.locator('textarea').last()` for non-email steps. Apollo adds hidden textareas and `.last()` can target a textarea from an earlier step (e.g., phone call script overwrites LinkedIn note). All non-email steps now use `fillNewStepInput()` with before/after count snapshots. See [browser-automation.md](browser-automation.md) for full pattern.
- **JSON field mapping (CRITICAL, confirmed 2026-03-19):** Step types must use exact script values: `automatic_email` (not `reply_to_previous_email`), `phone_call` (not `manual_call`). Reply emails use `"email_type": "reply"` on an `automatic_email` step. LinkedIn connect notes use `"message"` field (not `"note"`). Call scripts use `"task_note"` field. See json-format.md reference for canonical schema.
- **Key Apollo selectors (updated 2026-03-30):** Step type menu = `div[role="menuitem"]`. Subject = `input[placeholder="Enter email subject"]`. Type dropdown = `div[role="combobox"]` → `div[role="option"]`. Body = `.ql-editor` (Quill). Save = button "Save changes".
- **APOLLO UI CHANGE (2026-03-30):** "Create sequence" now shows a 4-option type picker modal (AI-assisted, Templates, Clone, From scratch) before the name/settings modal. Script updated: clicks `h4:text-is("From scratch")` → fills name via `getByRole('textbox')` → clicks Create via `getByRole('button', { name: 'Create', exact: true })` → lands on empty editor with "+ Add a step". Old "Do it manually" flow is gone. Touch 1 now clicks "+ Add a step" like all other touches. Script has fallback for old flow if type picker modal doesn't appear.
- **PLAYWRIGHT SELECTOR LESSON (2026-03-30):** Never use `button:text-is("Create")` or `button:text("Create")` when "Create sequence" button exists in the background navbar. Playwright's text matchers can match substrings or fail silently. Always use `page.getByRole('button', { name: 'Create', exact: true })` for exact button text matching. This is Playwright's recommended pattern.
- **Historical context:** See [browser-automation.md](browser-automation.md) for legacy Claude in Chrome lessons (Brex/Checkr/Teradata era). No longer used but kept for selector reference if script needs updates.

## Chrome CDP Skill (Browser Automation)
- **Location:** `~/.claude/skills/chrome-cdp/` (installed 2026-03-17)
- **Script path:** `~/.claude/skills/chrome-cdp/skills/chrome-cdp/scripts/cdp.mjs`
- **Replaces:** Claude in Chrome MCP. Far more token-efficient (no inline JPEG screenshots, `snap` returns compact accessibility tree).
- **Prereqs:** Node.js 22+ (have v25.8.0), Chrome remote debugging enabled (`chrome://inspect/#remote-debugging`)
- **Use for:** LinkedIn engagement, web research on authenticated pages, any live browser interaction
- **NOT for:** Apollo sequence building (Playwright script handles that separately)

### Key Commands
```
node cdp.mjs list                        # list open tabs with target IDs
node cdp.mjs snap <target>               # compact accessibility tree (prefer over html)
node cdp.mjs eval <target> "js expr"     # run JS, returns result
node cdp.mjs nav <target> "url"          # navigate + wait for load
node cdp.mjs click <target> "selector"  # click by CSS selector
node cdp.mjs type <target> "text"        # type at focused element
node cdp.mjs shot <target> [file]        # screenshot to disk (not inline)
node cdp.mjs html <target> [selector]   # HTML (optionally scoped)
```
- Target = unique prefix of targetId from `list` (e.g., `2332DE3D`)
- Auth check: `eval <target> "document.title + ' | ' + window.location.href"` (more reliable than CSS selectors)
- Prefer `snap` to understand page structure when selectors are unknown

### LinkedIn Patterns (confirmed 2026-03-17)

**Auth check:** `eval <target> "document.title"` — if title contains page name, logged in

**Activity page:** `https://www.linkedin.com/in/{slug}/recent-activity/all/`
- Wait for posts: poll `document.querySelectorAll('[data-urn*="activity"]').length > 0`
- Like button selector: `button[aria-label='React Like']` on `div[data-urn='urn:li:activity:{id}']`
- Post text: `.break-words` inside each `[data-urn*="activity"]` card

**Connection requests:** `https://www.linkedin.com/preload/custom-invite/?vanityName={slug}`
- Dialog flow: click `button[aria-label='Add a note']` → click `textarea` → `type` note → click `button[aria-label='Send invitation']`
- Connect element on profile pages is a `<link>` not a `<button>` — use `snap` to find it if click fails
- "Send without a note" skips the textarea step

**Content search:** `https://www.linkedin.com/search/results/content/?keywords={query}&datePosted=%22past-week%22&sortBy=%22date_posted%22`

**People search:** `https://www.linkedin.com/search/results/people/?keywords={name}+{company}`
- Extract profile URL: `Array.from(document.querySelectorAll('a')).filter(a=>a.textContent.includes('{name}')&&a.href.includes('/in/')).map(a=>a.href)[0]`

## Session Log
- 2026-02-26: User reviewed updated CLAUDE.md. Confirmed writing discipline rules (13-14, hooks, AIDA, anti-patterns). Gave critical feedback: no KPMG naming in outreach, focus on Search API/VI/PRAG not AI Factory/ESL, be concise, reference sales deck, check Drive+Slack first. All changes applied to CLAUDE.md. Added Session Startup section. User confirmed Apollo MCP integration coming soon.
- 2026-02-27: Apollo MCP connected and verified. Updated CLAUDE.md: Step 3 uses Apollo exclusively, added Step 6 (Apollo sequence build via browser automation + contact enrollment via API), updated pipeline overview, batch workflow, quality checklist, renumbered optional steps. Key design decision: Apollo API cannot create sequences, so browser automation handles Phase A. Sequences always left INACTIVE.
- 2026-02-27: Brex pipeline completed (Steps 1-6). Post-run audit found 4 blank email bodies caused by Quill editor race condition. Fixed via JS DOM injection. Updated CLAUDE.md Step 6 Phase A: body fields now use JS injection (not click+type), added mandatory verification protocol, added error handling table. Created browser-automation.md with full technical details.
- 2026-03-02: Checkr pipeline completed (Steps 1-6). JS DOM injection used for all email bodies from the start (no race condition issues). All 4 sequences built cleanly. Phase B enrollment note: initial parallel API calls returned 500 errors but actually succeeded server-side (Seq A contacts showed as already enrolled on retry). Lesson: Apollo enrollment API may return 500 on parallel calls but still process them. Use sequential calls or handle `contacts_already_exists_in_current_campaign` as success.
- 2026-03-02: User confirmed 4 new outreach guardrails. Applied to CLAUDE.md, outreach-rules.md, feedback.md, and MEMORY.md: (1) No specific eval references in outreach, even anonymized, (2) No competitor names in outreach, (3) Follow-up emails are replies to Touch 1 thread, (4) Standardized 5-touch sequence: Email > LinkedIn Connect > Email > Call > Email. Note: Brex and Checkr sequences in Apollo still use old cadence structure; new structure applies to future pipeline runs only.
- 2026-03-03: Teradata pipeline fully completed (Steps 1-6). 4 sequences built in Apollo (INACTIVE). 20 contacts enrolled (5 per sequence). All contacts created fresh (no dupes). Seq A: Sharad Garg, Sushma Srikanth, Kagan Kaya, Fraz Nayyar, Karthik Logasundaram. Seq B: Sumeet Arora, Joshua Fecteau, Daniel Spurling, Paul Lenfest, James Williams. Seq C: Meeta Vouk, Chris Twogood, Ramanan Balakrishnan, Cameron Curtis, Jillian Rushing. Seq D: Subhadip Bandyopadhyay, Max Petrenko, Sumanta Boral, Matthew McDonald, Trish Lugtu. Deliverables on Drive.
- 2026-03-03: User feedback: removed mandatory MCP server try-it-now hook from sequence writing rules and quality checklist. MCP link is no longer a required element in outreach. It can be used organically when it fits (e.g., technical personas where the recipient might actually prototype), but should not be forced into every account's sequences as a checkbox item. Removed from CLAUDE.md Step 4 rule 5 and quality checklist.
- 2026-03-03: User feedback: LinkedIn connect notes were pitch-slapping (mentioning products, calling things "impressive," including CTAs). Researched best practices across Josh Braun, Morgan Ingram, Jason Bay, Kyle Coleman, Becc Holland, Will Allred. New hard rules: zero pitch, zero CTA, zero generic flattery, under 200 chars, 90% about them. Formula: Recognition + Identity + Connect. Updated CLAUDE.md (new LinkedIn Connect Rules section + sequence writing rule 9 + quality checklist), outreach-rules.md (new LinkedIn Connect Rules section), feedback.md (new 2026-03-03 section), MEMORY.md. Note: Brex, Checkr, and Teradata sequences in Apollo still have old-style LinkedIn notes; new rules apply to future pipeline runs only.
- 2026-03-03: User shared "AI Outbound Sales Sequence Prompt Generation" research doc (data from Gong 300K+ emails, Lavender, Smartlead, Cognism, Outreach.io). 6 improvements adopted: (1) tentative language in AIDA Interest section, (2) interest-based CTAs only in cold outreach (ban time-based), (3) tighter opener word count 100-150 (was 150-200), (4) expanded banned AI-ism vocabulary (+7 words), (5) 5th-7th grade reading level target, (6) strip corporate suffixes. 3 items declined: "Hope all is well" pleasantry (wrong for VP+ ICP), 21-day 8-touch cadence (too long for whales), video touchpoint (requires tooling). Updated CLAUDE.md, outreach-rules.md, feedback.md, MEMORY.md.
- 2026-03-04: Added model routing strategy to CLAUDE.md. Opus stays on main thread for research synthesis (Step 1), account plans (Step 2), outreach copy (Step 4), and browser automation (Step 6A). Sonnet subagents handle Apollo API calls (Steps 3, 6B), Drive uploads (Step 5), and Slack searches. Haiku for simple checks (file existence). Reduces Opus usage limits burn on mechanical tasks.
- 2026-03-06: Installed claude-office-skills for document generation. Repo cloned to ~/.claude/skills/, Python + Node deps installed, Homebrew system tools installed (Node.js, Poppler, Pandoc, LibreOffice). Enables native PPTX/DOCX/XLSX/PDF creation for ad-hoc deal follow-up work. Anthropic built-in skills also detected (pptx, docx, xlsx, pdf). Google Workspace MCP status clarified: Gmail + Calendar connected, Drive via rclone only (no native Docs/Slides/Sheets API).
- 2026-03-09: Pipeline optimization: eliminated redundant sequences .docx. Outreach copy now generated in-memory (Step 4) and injected directly into Apollo (Step 6A). No .docx file created, no Drive upload for sequences. Account plan gains new Section 9: Outreach Strategy appendix (persona targets, contact assignments, hook strategy, founder credibility placement). Only account plan .docx uploaded to Drive. Saves ~30-40% Opus output tokens per account, one docx skill invocation, and one rclone upload. All writing quality rules unchanged.
- 2026-03-09: Plaid pipeline partially completed. Seq A built in Apollo via Claude in Chrome (5 steps, INACTIVE). Seq B/C/D not built. Contacts not enrolled. User declared "consider the plaid account done" due to excessive token burn from browser automation errors (Apollo AI auto-added 17 junk steps, required manual cleanup). User decision: pivot from Claude browser automation to standalone Playwright script for Step 6A.
- 2026-03-09: Built Playwright Apollo sequence builder at ~/Desktop/YDC Pipeline/apollo-sequence-builder/. Script (build-sequences.js, 735 lines) runs outside the Claude loop so errors don't burn tokens. Uses Playwright persistent browser context with existing Chrome profile for Apollo auth. Key features: Phase 0 UI dismissal (payment banners, "new layout" banner, modals, toasts, cookie consent), Quill editor DOM injection for email bodies, safety check against Apollo's "Add personalized follow up" AI trap, post-save verification, results JSON output. Data/script separation: sequence copy lives in JSON files, automation logic in the script. Future accounts just need new JSON. Updated CLAUDE.md Step 6A to reference Playwright script instead of Claude in Chrome. Dependencies: playwright ^1.50.0.
- 2026-03-17: Installed chrome-cdp-skill (`~/.claude/skills/chrome-cdp/`) from github.com/pasky/chrome-cdp-skill. Replaces Claude in Chrome MCP for browser interaction. Key advantage: screenshots save to disk (not inline JPEG tokens), `snap` returns compact accessibility tree vs full page reads. Confirmed working with `list` command (19 tabs visible). Also confirmed chrome-cli v1.11.0 installed via Homebrew. Chrome remote debugging enabled as prereq.
- 2026-03-17: Built + ran LinkedIn Trigger Event Feed (Checkr, Teradata, Plaid, Brex) using chrome-cdp. Teradata hottest account: 3 company posts in past week on agentic AI, Unstructured partnership, knowledge platform. Plaid has Protect product launch (AI-era fraud). Brex + Checkr quiet.
- 2026-03-17: Built + ran Pre-Outreach LinkedIn Engagement Pipeline for Teradata. Auto-liked posts for Sumeet Arora (CPO, 2 posts), Joshua Fecteau (CDAO, 2 posts), Meeta Vouk (VP PM AI, 2 posts), Daniel Spurling (SVP PM, 1 post), Paul Lenfest (SVP Strategy, 1 post). Karthik Logasundaram (1d post) surfaced for manual like. 8 prospects had no recent/original content. Generated comment suggestions for 4 top prospects.
- 2026-03-17: Sent LinkedIn connection requests to 8 World Bank Group contacts (Irvinder Singh CTO, Julia Korsakova, Roman Kovalenko CDTO, Rahyab Lari CIO, Duncan Omole, Stanislas Bianou, Almoustapha Cisse, Karthikeyan Ranganathan Shanmugasundaram) with warm demo-preview note. Used Apollo bulk match for LinkedIn URLs + LinkedIn search for 3 not found. Confirmed LinkedIn invite flow: preload/custom-invite URL → Add a note dialog → textarea → Send invitation.
- 2026-03-19: ARI deep research PDF adopted as primary research tool, replacing Perplexity CDP automation. Benchmark: ARI scored 37/40 on PANW vs Perplexity 36/40 on Teradata. ARI advantages: zero compute cost, higher citation density (85+ footnoted URLs), pre-formatted PDF, user controls query. Pipeline simplified: user generates ARI report → uploads PDF → Claude reads and ingests. No CDP browser automation needed. Added Area 5 (Data & Search Infrastructure) to research query template — surfaces You.com-relevant signals about search APIs, content aggregation, real-time data pipelines. Perplexity CDP retained in memory as fallback reference only. Brave/WebSearch retained for supplemental gap-filling.
- 2026-03-18: Perplexity Deep Research adopted as primary web research tool for Step 1, replacing Brave/WebSearch. Head-to-head benchmark on Teradata: Perplexity 36/40 vs Brave 27/40. Perplexity found entire product launches (ACI), corrected CTO status error, surfaced trigger events (Unstructured partnership) Brave missed. Full CDP playbook written in ydc-research SKILL.md with exact commands for Sonnet subagent execution. CDP patterns saved to perplexity-cdp.md memory file. Key technical lesson: Perplexity uses React — must use CDP `type` command for input, not `.textContent` via eval. Brave/WebSearch retained as supplemental gap-filler only. User also requested MEDDPICC section removal from account plan template (to be applied separately).
- 2026-03-25: Salesforce MCP connected and integrated into pipeline. Built ydc-salesforce skill (~/.claude/skills/ydc-salesforce/SKILL.md) with 7 validated SOQL queries: account existence + Databricks partnership, full opp history, contacts, prospect replies ([Gong In] prefix), activity timeline, Apollo sequence history, Ryan's pipeline. Outputs structured CRM Intelligence Brief (replaces Section 9 "Slack Context" with "CRM Intelligence & Prior Engagement"). 5 decision gates: active opp, closed-lost intelligence, contact dedup, product mix, Databricks co-sell. Slack demoted to supplemental (still runs, but SFDC is primary). Warm reply summary prints in chat at pipeline end. Updated 9 files: ydc-salesforce (new), ydc-research, ydc-pipeline, global-rules.md, account-plan-template.md, quality-checklist.md, ydc-prospects, ydc-outreach, salesforce.md memory. Key validated patterns: [Gong In] = inbound reply, [Apollo >>] = outbound sequence, Databricks fields on Account object (not Clazar).
- 2026-03-30: Fixed textarea collision bug in build-sequences.js. Phone call task_note was overwriting LinkedIn connect note because `page.locator('textarea').last()` targeted the LinkedIn textarea instead of the phone step's own input. Root cause: Apollo adds hidden textareas, and `.last()` doesn't distinguish which step owns which element. Fix: all non-email step types (linkedin_connect, linkedin_message, phone_call, action_item) now use `fillNewStepInput()` which snapshots textarea/editor counts BEFORE the step is added, then targets only NEW visible elements by index. Email steps unaffected (use Quill DOM injection). Updated browser-automation.md with the pattern.
- 2026-03-02: CS Team Site product knowledge extraction completed. Deep-read all 8 key pages (MCP Primer, Sales Process, Resource Materials, Solution Delivery Overview, AI Factory, Technical Library Summarizations, CS Knowledge Repository, Product Q&A FAQ). Created product-knowledge.md with outreach-safe knowledge: product capabilities, MCP technical details, use case language by industry (media, retail, legal, consulting, travel, finserv, tech), objection handling, prospect-facing assets list (white papers, case studies, MCP try-it-now), sales motion alignment for CTA calibration, post-sale value story for credibility. All internal-only content filtered out (no customer names beyond public case studies, no pricing, no team names, no SOW details). Updated CLAUDE.md Session Startup (step 2: read product-knowledge.md) + added CS site guardrail to Global Preferences. Updated MEMORY.md Key Files + Top Rules.
