# Browser Automation: Apollo Sequence Editor

## Apollo UI Architecture (Sequence Editor)

Apollo's sequence editor at `app.apollo.io/#/sequences/{id}` uses:
- **Subject lines:** Standard `<input>` elements. Click + type works reliably.
- **Email bodies:** Quill.js rich text editor. `contenteditable="true"` divs with class `.ql-editor`. Blank editors also have class `.ql-blank`.
- **LinkedIn task notes:** Also Quill.js editors (same `.ql-editor` class).
- **Steps expand/collapse:** Only expanded steps have their `.ql-editor` in the DOM. Must scroll to and expand a step before its editor is accessible.

## The Race Condition Problem

When using click-and-type to fill email bodies:
1. Click on body field to focus it
2. Type text content

This fails intermittently because:
- Apollo's contenteditable divs require focus to be explicitly established before receiving typed input
- UI animations (step expansion, panel transitions) can steal focus between click and type
- The `<>` HTML mode button and "Enter email body" placeholder clicks don't reliably activate the editor
- No error is thrown. The body simply stays blank while the subject line (standard input) succeeds.

**Failure rate observed:** ~30% of email body fields (4 out of ~14 across 4 sequences in Brex campaign).

## Reliable Fix: JavaScript DOM Injection

Instead of simulating user input, directly manipulate the Quill editor DOM:

```javascript
// 1. Find all editors on the page
const editors = document.querySelectorAll('.ql-editor');

// 2. Identify which editor to fill (by index or by checking ql-blank class)
const blankEditors = [...editors].filter(e => e.classList.contains('ql-blank'));

// 3. Set content using HTML format Quill expects
editor.innerHTML = [
  '<div>First paragraph of email.</div>',
  '<div><br></div>',  // blank line between paragraphs
  '<div>Second paragraph of email.</div>',
  '<div><br></div>',
  '<div>Ryan</div>'
].join('');

// 4. Remove blank class and dispatch events so Quill registers the change
editor.classList.remove('ql-blank');
editor.dispatchEvent(new Event('input', { bubbles: true }));
editor.dispatchEvent(new Event('change', { bubbles: true }));
```

### HTML Format Rules for Quill
- Each paragraph wrapped in `<div>...</div>`
- Blank lines: `<div><br></div>`
- No `<p>` tags (Quill uses divs)
- Plain text only in email bodies (no bold/italic/links in outreach copy per CLAUDE.md rules)

## Verification Protocol (REQUIRED after every step)

After filling each email step's body, run verification before proceeding:

```javascript
const editors = document.querySelectorAll('.ql-editor');
const results = editors.map((ed, i) => ({
  index: i,
  isBlank: ed.classList.contains('ql-blank'),
  charCount: ed.innerText.trim().length,
  preview: ed.innerText.trim().substring(0, 60)
}));
// If any expected editor is blank, retry with JavaScript injection
```

### Verification rules:
1. After filling EACH step, check all editors on the page
2. If any editor that should have content shows `ql-blank` or `charCount: 0`, retry with JS injection
3. After ALL steps filled, do a final full-sequence audit before clicking "Save changes"
4. After saving, re-verify editors still have content (save operation should not clear them)

## Editor Index Mapping

Editors appear in DOM order. Typical mappings:

**4-step sequence (e.g., Seq A with email, email, LinkedIn, email):**
- Index 0: Step 1 email body
- Index 1: Step 2 email body
- Index 2: Step 3 LinkedIn task note
- Index 3: Step 4 email body

**3-step sequence (e.g., Seq B with email, LinkedIn, email):**
- Index 0: Step 1 email body
- Index 1: Step 2 LinkedIn task note (or email body)

**Important:** Only expanded/visible steps have editors in the DOM. If a step is collapsed, its editor won't appear in `querySelectorAll`. Scroll to expand all steps first or use the "Expand all" button if available.

## Recommended Phase A Flow (Updated)

```
For each sequence:
  1. Create sequence, set title
  2. For each step:
     a. Add step, set type (email/LinkedIn)
     b. Fill subject line via standard input click+type
     c. Fill body via JavaScript DOM injection (NOT click+type)
     d. VERIFY: Check .ql-editor is not blank
     e. If blank: retry injection, re-verify
     f. Set delay/timing
  3. After all steps: full audit (check all editors)
  4. Click "Save changes"
  5. Post-save verification screenshot
  6. Record sequence ID from URL
```

## Brex Campaign Fix Log (2026-02-27)

4 blank email bodies found during user review:
- Seq A Step 2 (Harvey proof point): Fixed via JS injection
- Seq A Step 4 (Breakup/MCP server): Fixed via JS injection
- Seq B Step 1 (Capital One acquisition): Fixed via JS injection
- Seq D Step 2 (DuckDuckGo proof point): Was already populated (may have been fixed in prior session)

Root cause: Original Phase A used click+type for body fields, which failed intermittently due to Quill editor focus issues.
