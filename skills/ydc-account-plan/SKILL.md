---
name: ydc-account-plan
description: Generates a comprehensive 8-section You.com account plan as a .docx file for a target company. Covers account overview, strategic business context, buying center map, customer pain and business impact, solution mapping, competitive analysis, ROI justification, and outreach strategy appendix (Section 8). Use when user says "generate account plan for [company]", "write account plan for [company]", "account plan for [company]", "Step 2", or after company research is complete in the pipeline. Requires company research context. Output file: {Company}_Account_Plan.docx saved to /Users/andrew/Downloads/Claud Code folder /YDCpipeline/.
---

# YDC: Account Plan Generation (Step 2)

## Citation Requirements

For ANY externally sourced information:
1. Provide only real, verifiable hyperlinks to actual sources. Format: **(Source Name - URL)**
2. NEVER fabricate URLs, sources, or references. NEVER invent URLs or link to non-existent pages.
3. If no real URL can be confirmed: **(No verifiable source found. Assumed, To Be Validated by AE)**
4. Fields requiring citations: employee count, revenue, industry classification, public tech stack, press releases, org chart data, competitor mentions, AI initiatives, externally inferred pain points and trends.
5. Do NOT cite AE-only fields or hypotheses labeled "To Be Validated by AE."

## Behavioral Rules (Internal — Do Not Display in Output)

1. Populate externally sourced fields with real hyperlinked citations only.
2. Populate hybrid fields with hypotheses marked **(To Be Validated by AE)**.
3. Leave AE-only fields blank with underscores.
4. Never show internal category labels like (Externally Sourceable), (Hybrid), or (AE-Only).
5. Always output the full 8-section template. Do not skip sections.

## Section 8: Outreach Strategy Appendix (Required)

Section 8 is added to every account plan. It contains:
- Sequence Overview table: Sequence (A/B/C/D), Persona Target, Use Case Focus, Primary Hook Type
- Contact Assignments table: Name, Title, Email, Sequence, Assignment Rationale
- Hook Strategy: 2-3 sentences per sequence on which research hooks to prioritize
- Founder Credibility Placement: which sequence/touch gets which proof point (avoid repetition)
- Notes: account-specific sequencing decisions

**CTD Warm Intro Integration (when CTD data exists in research brief Section 9):**
- Add a "Warm Intro" column to the Contact Assignments table: connector name + note that ghost email is ready
- Add a "Warm Intro Request Actions" subsection listing each intro to pursue, the connector to ask, and which sequence the target is assigned to
- Contacts tagged WARM INTRO ONLY (You.com employee connector, outside standard ICP): note in the table and exclude from cold Apollo enrollment

## Document Generation

Step 2 reads the three artifact files from Step 1, populates a structured JSON data file, then calls the static `generate-account-plan.js` script to render the .docx. Do NOT use the docx skill or write docx-js from scratch.

### Step 2.1: Populate plan_data.json

Read these three files produced by Step 1:
- `/Users/andrew/Downloads/Claud Code folder /YDCpipeline/{company}_facts.md`
- `/Users/andrew/Downloads/Claud Code folder /YDCpipeline/{company}_usecases.md`
- `/Users/andrew/Downloads/Claud Code folder /YDCpipeline/{company}_hooks.md` (for CTD warm intro data, SF flags for Section 8)

Write structured JSON to:
`/Users/andrew/Downloads/Claud Code folder /YDCpipeline/{company}_plan_data.json`

See references/account-plan-template.md for the full JSON schema that maps to the 8-section template. Use null for AE-only fields (renders as gray `___________` placeholder). Append `(To Be Validated by AE)` suffix for hybrid/hypothesized fields.

### Step 2.2: Render the .docx

```bash
NODE_PATH=$(npm root -g) node "/Users/andrew/Downloads/Claud Code folder /YDCpipeline/generate-account-plan.js" "/Users/andrew/Downloads/Claud Code folder /YDCpipeline/{company}_plan_data.json"
```

The script handles all formatting (Arial, US Letter, blue headers, table styles, title page, headers/footers). Output path is set inside plan_data.json as `output_path`.

**Formatting standards (encoded in generate-account-plan.js — do not re-implement):**
- Font: Arial throughout
- Title page: Company name + "Account Plan" + date + "Prepared by You.com Sales Team"
- Header: "CONFIDENTIAL | You.com Account Plan" (right-aligned, gray, italic)
- Footer: Page numbers (centered, gray)
- Section headings: Bold, blue (#1A5276), 14pt
- Sub-headings: Bold, blue (#1A5276), 12pt
- Body text: 10pt
- Tables: Blue header rows (#1A5276 background, white text), light gray alternating rows

Save output to: `/Users/andrew/Downloads/Claud Code folder /YDCpipeline/{Company}_Account_Plan.docx`

## Full Template

See references/account-plan-template.md for the complete 9-section template structure.

## Value Narrative Integration

Section 5 (Solution Mapping) must reference You.com product capabilities relevant to the account. See references/value-narrative.md for product framing and use case language by industry.
