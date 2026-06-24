#!/usr/bin/env node
/**
 * fill-sequence-content.js
 *
 * HYBRID APPROACH — Part 2 (Playwright)
 *
 * Takes a JSON file with existing Apollo sequence IDs + step content.
 * Navigates to each sequence in Apollo UI, fills email/LinkedIn content
 * into already-existing blank steps, and enables every step toggle.
 *
 * REST API creates the sequence structure + enrolls contacts.
 * This script fills the content the REST API can't set.
 *
 * Usage:
 *   node fill-sequence-content.js <content-file.json>
 *   HEADED=true node fill-sequence-content.js <content-file.json>
 *   DEBUG=true HEADED=true node fill-sequence-content.js <content-file.json>
 *
 * Input JSON format: see schema in APOLLO_HYBRID_SEQUENCE_BUILD_PLAN.md
 *
 * Sequences are left INACTIVE — Andrew activates manually after reviewing Touch 1.
 * All steps are toggled ON so they fire automatically after Touch 1 is sent.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const HEADED = process.env.HEADED !== 'false';
const DEBUG = process.env.DEBUG === 'true';
const SLOW_MO = DEBUG ? 300 : 80;
const APOLLO_BASE = 'https://app.apollo.io';
const DEFAULT_TIMEOUT = 60000;

const CHROMIUM_BIN = path.join(require('os').homedir(),
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR = path.join(require('os').homedir(), '.apollo-playwright-profile');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
const log = {
  info:  (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  ok:    (msg) => console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`),
  warn:  (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  err:   (msg) => console.log(`\x1b[31m[ERR]\x1b[0m  ${msg}`),
  debug: (msg) => { if (DEBUG) console.log(`\x1b[90m[DBG]\x1b[0m  ${msg}`); },
  step:  (seq, touch, msg) => console.log(`\x1b[35m[${seq}][T${touch}]\x1b[0m ${msg}`),
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// DOM-direct modal dismissal — handles modals that block Playwright clicks
// ---------------------------------------------------------------------------
async function dismissBlockingModals(page) {
  // Strategy 1: press Escape key
  try { await page.keyboard.press('Escape'); await sleep(300); } catch (_) {}

  // Strategy 2: DOM-direct click on any Cancel button (bypasses overlay blocking)
  try {
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cancelBtn = btns.find(b => b.textContent.trim() === 'Cancel' && b.offsetParent !== null);
      if (cancelBtn) { cancelBtn.click(); return true; }
      return false;
    });
    if (clicked) { await sleep(400); log.debug('DOM-clicked Cancel to dismiss modal'); }
  } catch (_) {}

  // Strategy 3: Playwright click on Cancel button
  try {
    const cancelBtns = page.locator('button').filter({ hasText: /^Cancel$/ });
    const n = await cancelBtns.count();
    for (let i = 0; i < n; i++) {
      if (await cancelBtns.nth(i).isVisible({ timeout: 500 }).catch(() => false)) {
        await cancelBtns.nth(i).click({ force: true, timeout: 2000 }).catch(() => {});
        await sleep(400);
        log.debug('Playwright-clicked Cancel button');
        break;
      }
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Dismiss Apollo UI overlays
// ---------------------------------------------------------------------------
async function dismissApolloUI(page) {
  try {
    const alertClose = page.locator('button[aria-label="Close alert"]');
    const n = await alertClose.count();
    for (let i = 0; i < n; i++) {
      await alertClose.nth(0).click({ timeout: 2000 }).catch(() => {});
      await sleep(300);
    }
  } catch (_) {}
  try {
    const modalClose = page.locator('[role="dialog"] button[aria-label*="close" i]');
    const n = await modalClose.count();
    for (let i = 0; i < n; i++) {
      await modalClose.nth(0).click({ timeout: 2000 }).catch(() => {});
      await sleep(300);
    }
  } catch (_) {}
  try {
    for (let i = 0; i < 3; i++) {
      const confirmBtn = page.locator('button:has-text("Confirm")');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.last().click({ timeout: 2000 }).catch(() => {});
        await sleep(300);
      } else break;
    }
  } catch (_) {}
  // Dismiss blocking modals (especially "Activate Sequence without contacts?")
  // Use evaluate for direct DOM click to bypass Playwright interaction restrictions
  await dismissBlockingModals(page);
}

// ---------------------------------------------------------------------------
// Convert plain-text body to Quill HTML
// ---------------------------------------------------------------------------
function textToQuillHtml(text) {
  if (!text) return '<div><br></div>';
  return text.split('\n').map(line => {
    if (!line.trim()) return '<div><br></div>';
    const escaped = line.trim()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<div>${escaped}</div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Inject content into a Quill editor by index
// ---------------------------------------------------------------------------
async function injectQuill(page, text, editorIdx, label) {
  const html = textToQuillHtml(text);
  try {
    await page.locator('.ql-editor').nth(editorIdx).click({ timeout: 3000 });
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Delete');
    await sleep(300);
  } catch (_) {}

  const result = await page.evaluate(({ html, idx }) => {
    const editors = document.querySelectorAll('.ql-editor');
    const editor = editors[idx] ?? editors[editors.length - 1];
    if (!editor) return { success: false, error: 'no editor found' };
    editor.focus();
    editor.innerHTML = html;
    editor.classList.remove('ql-blank');
    editor.dispatchEvent(new Event('focus', { bubbles: true }));
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    editor.dispatchEvent(new Event('blur', { bubbles: true }));
    return { success: true, charCount: editor.innerText.trim().length };
  }, { html, idx: editorIdx });

  if (result.success && result.charCount > 0) {
    log.ok(`${label}: injected ${result.charCount} chars (Quill idx ${editorIdx})`);
    return true;
  }
  log.warn(`${label}: Quill inject failed — ${result.error || 'blank result'}`);
  return false;
}

// ---------------------------------------------------------------------------
// Fill subject input
// ---------------------------------------------------------------------------
async function fillSubject(page, subject, label) {
  for (const sel of [
    'input[placeholder="Enter email subject"]',
    'input[placeholder*="subject" i]',
    'input[placeholder*="Subject" i]',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        await page.keyboard.press('Meta+a');
        await page.keyboard.press('Delete');
        await sleep(200);
        await page.keyboard.type(subject, { delay: 15 });
        log.ok(`${label}: subject filled: "${subject}"`);
        return true;
      }
    } catch (_) {}
  }
  log.warn(`${label}: subject input not found`);
  return false;
}

// ---------------------------------------------------------------------------
// Click Template tab (Apollo UI has a "Template" tab in the step editor)
// ---------------------------------------------------------------------------
async function clickTemplateTab(page, label) {
  for (const sel of [
    'button[class*="tab"]:has-text("Template")',
    '[role="tab"]:has-text("Template")',
    '[class*="tab"]:has-text("Template")',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click({ timeout: 3000 });
        await sleep(1000);
        log.debug(`${label}: clicked Template tab via ${sel}`);
        return true;
      }
    } catch (_) {}
  }
  // Text match fallback
  try {
    const el = page.getByText('Template', { exact: true }).last();
    if (await el.isVisible({ timeout: 2000 })) {
      await el.click({ timeout: 2000 });
      await sleep(1000);
      return true;
    }
  } catch (_) {}
  log.debug(`${label}: Template tab not found (may not be needed)`);
  return false;
}

// ---------------------------------------------------------------------------
// Click on an existing step in the sequence to open its editor
// The step list in Apollo renders as a vertical list of step cards.
// We click by position index (0-based).
// ---------------------------------------------------------------------------
async function openStepEditor(page, stepIndex, seqName) {
  // Dismiss any overlays that may have appeared after the initial page load
  await dismissApolloUI(page);
  await sleep(500);

  // Strategy 1: click the nth step card directly
  // Apollo renders steps in [class*="step"] or similar containers
  const stepSelectors = [
    '[class*="sequence-step"]',
    '[class*="sequenceStep"]',
    '[class*="step-item"]',
    '[class*="stepItem"]',
    '[data-testid*="step"]',
  ];

  for (const sel of stepSelectors) {
    try {
      const steps = page.locator(sel);
      const count = await steps.count();
      if (count > stepIndex) {
        await steps.nth(stepIndex).click({ timeout: 5000 });
        await sleep(1500);
        log.debug(`${seqName} T${stepIndex + 1}: opened via ${sel} (${count} steps found)`);
        return true;
      }
    } catch (_) {}
  }

  // Strategy 2: find step by visible "Step N" text pattern
  try {
    const stepText = page.locator(`text="Step ${stepIndex + 1}"`).first();
    if (await stepText.isVisible({ timeout: 3000 })) {
      await stepText.click({ timeout: 5000 });
      await sleep(1500);
      log.debug(`${seqName} T${stepIndex + 1}: opened via "Step ${stepIndex + 1}" text`);
      return true;
    }
  } catch (_) {}

  // Strategy 3: click nth edit button / pencil icon
  for (const sel of [
    'button[aria-label*="edit" i]',
    'button[aria-label*="Edit" i]',
    '[class*="edit-step"]',
    'button[title*="Edit"]',
  ]) {
    try {
      const btns = page.locator(sel);
      const count = await btns.count();
      if (count > stepIndex) {
        await btns.nth(stepIndex).click({ timeout: 5000 });
        await sleep(1500);
        log.debug(`${seqName} T${stepIndex + 1}: opened via edit button ${sel}`);
        return true;
      }
    } catch (_) {}
  }

  // Final attempt: dismiss any modal that may have appeared, then retry all strategies once
  log.debug(`${seqName} T${stepIndex + 1}: all strategies failed — dismissing modals and retrying`);
  await dismissBlockingModals(page);
  await sleep(800);

  for (const sel of ['[class*="sequence-step"]', '[class*="sequenceStep"]', '[class*="step-item"]']) {
    try {
      const steps = page.locator(sel);
      const count = await steps.count();
      if (count > stepIndex) {
        await steps.nth(stepIndex).click({ force: true, timeout: 5000 });
        await sleep(1500);
        log.debug(`${seqName} T${stepIndex + 1}: retry-opened via ${sel}`);
        return true;
      }
    } catch (_) {}
  }
  try {
    const btns = page.locator('button[aria-label*="edit" i]');
    if (await btns.count() > stepIndex) {
      await btns.nth(stepIndex).click({ force: true, timeout: 5000 });
      await sleep(1500);
      return true;
    }
  } catch (_) {}

  log.warn(`${seqName} T${stepIndex + 1}: could not open step editor`);
  return false;
}

// ---------------------------------------------------------------------------
// Save the step after editing
// ---------------------------------------------------------------------------
async function saveStep(page, label) {
  // Try "Save" button first (edit mode)
  for (const sel of [
    'button:text-is("Save")',
    'button:has-text("Save changes")',
    'button[type="submit"]:has-text("Save")',
  ]) {
    try {
      const btn = page.locator(sel).last();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click({ timeout: 5000 });
        await sleep(1500);
        log.ok(`${label}: saved via Save button`);
        return true;
      }
    } catch (_) {}
  }

  // Try "Add" button (may appear in some Apollo UI states)
  try {
    const btn = page.locator('button:text-is("Add")').last();
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click({ timeout: 5000 });
      await sleep(1500);
      log.ok(`${label}: saved via Add button`);
      return true;
    }
  } catch (_) {}

  // Try clicking outside (some editors auto-save on blur)
  try {
    await page.keyboard.press('Escape');
    await sleep(1000);
    log.debug(`${label}: pressed Escape (auto-save fallback)`);
    return true;
  } catch (_) {}

  log.warn(`${label}: no save button found`);
  return false;
}

// ---------------------------------------------------------------------------
// Enable all step toggles on the sequence page
// ---------------------------------------------------------------------------
async function enableAllSteps(page, seqName) {
  log.info(`${seqName}: enabling all step toggles...`);
  await sleep(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  const toggled = await page.evaluate(() => {
    const offSwitches = Array.from(document.querySelectorAll(
      '[role="switch"][aria-checked="false"], button[aria-checked="false"]'
    )).filter(el => el.offsetParent !== null);
    for (const sw of offSwitches) sw.click();
    return offSwitches.length;
  });

  // Also try unchecked checkboxes
  const checkedCount = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]:not(:checked)'))
      .filter(el => el.offsetParent !== null &&
        !el.closest('[class*="select"]') && !el.closest('[class*="filter"]'));
    for (const b of boxes) b.click();
    return boxes.length;
  });

  log.ok(`${seqName}: toggled ${toggled} switch(es) + ${checkedCount} checkbox(es) to enabled`);
  await sleep(1000);
}

// ---------------------------------------------------------------------------
// Process a single sequence
// ---------------------------------------------------------------------------
async function fillSequence(page, seq) {
  const { id, name } = seq;
  const shortName = name.split('|').pop().trim().slice(0, 25);
  log.info(`\n========== ${name} ==========`);

  // Navigate to the sequence
  await page.goto(`${APOLLO_BASE}/#/sequences/${id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await sleep(3000);
  await dismissApolloUI(page);
  await sleep(1000);

  // Screenshot to see what we're working with
  if (DEBUG) {
    const ss = `/tmp/fill-content-${id}-loaded.png`;
    await page.screenshot({ path: ss, fullPage: false });
    log.debug(`Loaded screenshot: ${ss}`);
  }

  // Count Quill editors before we start (for index tracking)
  let emailEditorIdx = await page.evaluate(() =>
    document.querySelectorAll('.ql-editor').length
  );
  log.info(`Starting Quill editor count: ${emailEditorIdx}`);

  // Process each step in the input JSON
  const results = [];
  let editButtonIdx = 0; // tracks only steps that have edit buttons in Apollo UI
  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i];
    const label = `${shortName} T${i + 1}`;
    const isEmailStep = step.type === 'automatic_email' || step.type === 'manual_email';
    const isLinkedIn = step.type === 'linkedin_connect' || step.type === 'linkedin_message';

    // Skip action_item and phone_call — note already set via REST
    // These steps have no edit button in Apollo UI so don't increment editButtonIdx
    if (step.type === 'action_item' || step.type === 'phone_call') {
      log.info(`${label}: [${step.type}] skipping — note set via REST API`);
      results.push({ step: i + 1, type: step.type, status: 'skipped' });
      continue;
    }

    // Skip steps with no content
    if (!step.body && !step.subject && !step.message) {
      log.info(`${label}: [${step.type}] skipping — no content provided`);
      editButtonIdx++; // still has an edit button in UI
      results.push({ step: i + 1, type: step.type, status: 'skipped_no_content' });
      continue;
    }

    log.info(`${label}: opening step editor [${step.type}] (edit btn idx ${editButtonIdx})...`);

    // Reload the sequence page before each step to guarantee clean DOM state
    await page.goto(`${APOLLO_BASE}/#/sequences/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    await dismissApolloUI(page);

    // Open the step editor using the visual edit button index
    const opened = await openStepEditor(page, editButtonIdx, shortName);
    editButtonIdx++;
    if (!opened) {
      results.push({ step: i + 1, type: step.type, status: 'FAILED_open' });
      continue;
    }

    // Snapshot Quill state after opening
    const editorCountAfterOpen = await page.evaluate(() =>
      document.querySelectorAll('.ql-editor').length
    );
    log.debug(`${label}: Quill editors after open: ${editorCountAfterOpen}`);

    if (isEmailStep) {
      // Click Template tab
      await clickTemplateTab(page, label);
      await sleep(500);

      // Re-count editors after Template tab click
      const editorCountAfterTab = await page.evaluate(() =>
        document.querySelectorAll('.ql-editor').length
      );
      const targetEditorIdx = editorCountAfterTab > 0 ? editorCountAfterTab - 1 : 0;
      log.debug(`${label}: using Quill editor index ${targetEditorIdx}`);

      // Fill subject (Touch 1 / new_thread only)
      if (step.subject && step.type === 'manual_email') {
        const subj = step.subject !== '{{CONTACT_SPECIFIC}}'
          ? step.subject
          : '[Touch 1 — edit before sending]';
        await fillSubject(page, subj, label);
        await sleep(300);
      }

      // Fill body
      const bodyText = step.body && step.body !== '{{CONTACT_SPECIFIC}}'
        ? step.body
        : '[Body placeholder — edit before sending]';

      await injectQuill(page, bodyText, targetEditorIdx, label);
      await sleep(500);

    } else if (isLinkedIn) {
      // LinkedIn connect note or DM message
      // Look for textarea or input that appeared when step was opened
      const afterCount = await page.evaluate(() =>
        document.querySelectorAll('textarea').length
      );
      log.debug(`${label}: ${afterCount} textareas visible`);

      let filled = false;
      // Try textarea first
      try {
        const ta = page.locator('textarea').last();
        if (await ta.isVisible({ timeout: 3000 })) {
          await ta.click();
          await ta.fill(step.message || '');
          log.ok(`${label}: LinkedIn message filled via textarea`);
          filled = true;
        }
      } catch (_) {}

      // Fallback: Quill editor
      if (!filled) {
        const editorCountNow = await page.evaluate(() =>
          document.querySelectorAll('.ql-editor').length
        );
        if (editorCountNow > 0) {
          await injectQuill(page, step.message || '', editorCountNow - 1, label);
          filled = true;
        }
      }

      if (!filled) {
        log.warn(`${label}: could not fill LinkedIn message`);
        results.push({ step: i + 1, type: step.type, status: 'FAILED_content' });
        continue;
      }
    }

    // Save the step
    await saveStep(page, label);

    // Brief pause before next step
    await sleep(1000);
    results.push({ step: i + 1, type: step.type, status: 'ok' });
  }

  // Enable all step toggles
  await enableAllSteps(page, shortName);

  // Save the overall sequence (if there's a "Save sequence" button)
  try {
    const saveSeqBtn = page.locator('button:has-text("Save sequence")').last();
    if (await saveSeqBtn.isVisible({ timeout: 3000 })) {
      await saveSeqBtn.click({ timeout: 5000 });
      await sleep(2000);
      log.ok(`${shortName}: sequence saved`);
    }
  } catch (_) {}

  // Final screenshot
  const ss = `/tmp/fill-content-${id}-done.png`;
  await page.screenshot({ path: ss, fullPage: false });
  log.ok(`${shortName}: done. Screenshot: ${ss}`);

  return { id, name, steps: results };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: node fill-sequence-content.js <content-file.json>');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const sequences = data.sequences || [];
  if (!sequences.length) {
    console.error('No sequences found in input file');
    process.exit(1);
  }

  log.info(`Loaded ${sequences.length} sequence(s) from ${inputFile}`);

  // Verify profile exists — if not, user needs to run the one-time login
  const profileCookies = path.join(PROFILE_DIR, 'Default', 'Cookies');
  if (!require('fs').existsSync(profileCookies)) {
    console.error('Apollo profile not found. Run the one-time login:');
    console.error('  node save-apollo-session.js');
    process.exit(1);
  }

  // launchPersistentContext reuses the saved profile — no re-login needed
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROMIUM_BIN,
    headless: !HEADED,
    slowMo: SLOW_MO,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1600, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  const allResults = [];

  for (const seq of sequences) {
    try {
      const result = await fillSequence(page, seq);
      allResults.push(result);
    } catch (e) {
      log.err(`FAILED: ${seq.name} — ${e.message}`);
      const ss = `/tmp/fill-content-${seq.id}-error.png`;
      await page.screenshot({ path: ss, fullPage: false }).catch(() => {});
      log.err(`Error screenshot: ${ss}`);
      allResults.push({ id: seq.id, name: seq.name, error: e.message });
    }
  }

  await context.close();

  // Summary
  console.log('\n\n========== SUMMARY ==========');
  for (const r of allResults) {
    if (r.error) {
      log.err(`${r.name}: FAILED — ${r.error}`);
    } else {
      const ok = r.steps.filter(s => s.status === 'ok').length;
      const skipped = r.steps.filter(s => s.status.startsWith('skip')).length;
      const failed = r.steps.filter(s => s.status.startsWith('FAILED')).length;
      log.ok(`${r.name}: ${ok} filled | ${skipped} skipped | ${failed} failed`);
    }
  }

  // Write results file
  const outFile = inputFile.replace('.json', '_results.json');
  fs.writeFileSync(outFile, JSON.stringify(allResults, null, 2));
  log.info(`Results written to ${outFile}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
