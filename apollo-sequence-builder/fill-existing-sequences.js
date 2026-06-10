#!/usr/bin/env node
/**
 * fill-existing-sequences.js
 *
 * Adds steps to EXISTING Apollo sequences by ID.
 * Fixes the issue where build-sequences.js created sequences with 0 steps
 * because the new_cc UI requires clicking a per-step "Add" button after
 * configuring each step (not just "Save changes" at the end).
 *
 * Usage:
 *   HEADED=true node fill-existing-sequences.js LlamaIndex_sequences.json
 *
 * The script reads:
 *   - {account}_sequences.json  → step content (steps array per sequence)
 *   - {account}_sequences_results.json → existing sequence IDs
 *
 * It navigates to each existing sequence, adds all steps, enables each step,
 * then activates the sequence so Apollo generates Manual Email tasks.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const HEADED = process.env.HEADED !== 'false'; // Default headed=true for this script
const DEBUG = process.env.DEBUG === 'true';
const SLOW_MO = DEBUG ? 300 : 80;
const APOLLO_BASE = 'https://app.apollo.io';
const DEFAULT_TIMEOUT = 60000;

const STATE_FILE = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const STEP_TYPE_LABELS = {
  'automatic_email': 'Automatic email',
  'manual_email': 'Manual email',
  'phone_call': 'Phone call',
  'linkedin_connect': 'LinkedIn - send connection request',
  'linkedin_message': 'LinkedIn - send message',
  'action_item': 'Action item',
};

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
// UI Helpers
// ---------------------------------------------------------------------------
async function dismissApolloUI(page) {
  // Close alert banners
  try {
    const alertClose = page.locator('button[aria-label="Close alert"]');
    const n = await alertClose.count();
    for (let i = 0; i < n; i++) {
      await alertClose.nth(0).click({ timeout: 2000 }).catch(() => {});
      await sleep(300);
    }
  } catch (_) {}
  // Close modals
  try {
    const modalClose = page.locator('[role="dialog"] button[aria-label*="close" i]');
    const n = await modalClose.count();
    for (let i = 0; i < n; i++) {
      await modalClose.nth(0).click({ timeout: 2000 }).catch(() => {});
      await sleep(300);
    }
  } catch (_) {}
  // Confirm "leave page" dialogs
  try {
    for (let i = 0; i < 3; i++) {
      const confirmBtn = page.locator('button:has-text("Confirm")');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.last().click({ timeout: 2000 }).catch(() => {});
        await sleep(300);
      } else break;
    }
  } catch (_) {}
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
// Fill a newly-appeared input for non-email steps (textarea or Quill editor).
// Action items use textarea; phone calls use Quill in new_cc UI.
// Tries textarea first, falls back to new Quill editor by index.
// ---------------------------------------------------------------------------
async function fillNewInput(page, content, beforeSnapshot) {
  await sleep(800);
  const after = await page.evaluate(() => ({
    textareaCount: document.querySelectorAll('textarea').length,
    editorCount:   document.querySelectorAll('.ql-editor').length,
  }));

  // Strategy 1: new textarea by index
  if (after.textareaCount > beforeSnapshot.textareaCount) {
    for (let i = beforeSnapshot.textareaCount; i < after.textareaCount; i++) {
      const ta = page.locator('textarea').nth(i);
      if (await ta.isVisible({ timeout: 3000 }).catch(() => false)) {
        await ta.click();
        await ta.fill(content);
        log.debug(`Filled textarea at index ${i}`);
        return true;
      }
    }
  }

  // Strategy 2: new Quill editor by index (phone_call in new_cc UI)
  if (after.editorCount > beforeSnapshot.editorCount) {
    const idx = after.editorCount - 1;
    const html = textToQuillHtml(content);
    try {
      await page.locator('.ql-editor').nth(idx).click({ timeout: 2000 });
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Delete');
      await sleep(200);
    } catch (_) {}
    const result = await page.evaluate(({ html, idx }) => {
      const ed = document.querySelectorAll('.ql-editor')[idx];
      if (!ed) return { success: false };
      ed.innerHTML = html;
      ed.classList.remove('ql-blank');
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      ed.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, charCount: ed.innerText.trim().length };
    }, { html, idx });
    if (result.success && result.charCount > 0) {
      log.debug(`Filled Quill editor at index ${idx} (${result.charCount} chars)`);
      return true;
    }
  }

  // Strategy 3: last visible textarea (fallback)
  try {
    const ta = page.locator('textarea').last();
    if (await ta.isVisible({ timeout: 2000 })) {
      await ta.click();
      await ta.fill(content);
      log.debug('Filled textarea (fallback: last)');
      return true;
    }
  } catch (_) {}

  return false;
}

// ---------------------------------------------------------------------------
// Click Template tab (April 2026 Apollo UI change)
// ---------------------------------------------------------------------------
async function clickTemplateTab(page, seqName, touchNum) {
  try {
    const el = page.getByText('Template', { exact: true }).last();
    if (await el.isVisible({ timeout: 4000 })) {
      await el.click({ timeout: 3000 });
      await sleep(1200);
      return true;
    }
  } catch (_) {}
  for (const sel of [
    'button[class*="tab"]:has-text("Template")',
    '[role="tab"]:has-text("Template")',
    '[class*="tab"]:has-text("Template")',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click({ timeout: 2000 });
        await sleep(1000);
        return true;
      }
    } catch (_) {}
  }
  log.warn(`T${touchNum}: Template tab not found`);
  return false;
}

// ---------------------------------------------------------------------------
// Inject email body into a Quill editor by absolute index
// ---------------------------------------------------------------------------
async function injectEmailBody(page, body, editorIdx, touchNum, seqName) {
  const htmlBody = textToQuillHtml(body);
  // Click and clear pre-seeded content
  try {
    await page.locator('.ql-editor').nth(editorIdx).click({ timeout: 3000 });
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Delete');
    await sleep(300);
  } catch (_) {}

  const result = await page.evaluate(({ html, idx }) => {
    const editors = document.querySelectorAll('.ql-editor');
    const editor = editors[idx] ?? editors[editors.length - 1];
    if (!editor) return { success: false, error: 'no editor' };
    editor.focus();
    editor.innerHTML = html;
    editor.classList.remove('ql-blank');
    editor.dispatchEvent(new Event('focus', { bubbles: true }));
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    editor.dispatchEvent(new Event('blur', { bubbles: true }));
    return { success: true, charCount: editor.innerText.trim().length };
  }, { html: htmlBody, idx: editorIdx });

  if (result.success && result.charCount > 0) {
    log.step(seqName, touchNum, `Body injected (${result.charCount} chars, editor ${editorIdx})`);
    return true;
  }
  log.warn(`T${touchNum}: body inject failed: ${result.error || 'blank'}`);
  return false;
}

// ---------------------------------------------------------------------------
// Fill subject input
// ---------------------------------------------------------------------------
async function fillSubject(page, subject, touchNum, seqName) {
  if (!subject || subject === '{{CONTACT_SPECIFIC}}') {
    // Use a placeholder — prefill-touch1.js will overwrite with real content
    subject = 'Touch 1 subject placeholder';
  }
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
        await page.keyboard.type(subject, { delay: 20 });
        log.step(seqName, touchNum, `Subject filled: "${subject}"`);
        return true;
      }
    } catch (_) {}
  }
  log.warn(`T${touchNum}: subject input not found`);
  return false;
}

// ---------------------------------------------------------------------------
// Per-step "Add" button click (CRITICAL for new_cc sequences)
// ---------------------------------------------------------------------------
async function clickPerStepAdd(page, touchNum, seqName) {
  log.step(seqName, touchNum, 'Clicking per-step Add button...');
  await sleep(500);

  // Strategy 1: exact text match "Add" only (avoids "Add a step", "Add Contacts", etc.)
  try {
    const btn = page.locator('button:text-is("Add")').last();
    if (await btn.isVisible({ timeout: 4000 })) {
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 5000 });
      log.ok(`T${touchNum}: Step committed via Add button`);
      await sleep(2000);
      return true;
    }
  } catch (e) {
    log.debug(`T${touchNum}: text-is("Add") failed: ${e.message}`);
  }

  // Strategy 2: filter out known other "Add *" buttons
  try {
    const btn = page.locator('button:has-text("Add")')
      .filter({ hasNotText: /step|Contact|test|guideline/i })
      .last();
    if (await btn.isVisible({ timeout: 3000 })) {
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 5000 });
      log.ok(`T${touchNum}: Step committed via filtered Add button`);
      await sleep(2000);
      return true;
    }
  } catch (e) {
    log.debug(`T${touchNum}: filtered Add failed: ${e.message}`);
  }

  // Strategy 3: JS click on exact "Add" button
  const jsClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => {
      const t = b.textContent?.trim();
      return t === 'Add' && b.offsetParent !== null;
    });
    if (target) { target.click(); return true; }
    return false;
  });
  if (jsClicked) {
    log.ok(`T${touchNum}: Step committed via JS click`);
    await sleep(2000);
    return true;
  }

  log.warn(`T${touchNum}: Per-step Add button not found — step may not be saved`);
  return false;
}

// ---------------------------------------------------------------------------
// Add a step and configure its content
// ---------------------------------------------------------------------------
async function addStep(page, step, stepIndex, seqName, emailFillQueue, emailEditorIdx) {
  const touchNum = stepIndex + 1;
  const typeLabel = STEP_TYPE_LABELS[step.type];
  if (!typeLabel) throw new Error(`Unknown step type: ${step.type}`);

  log.step(seqName, touchNum, `Adding ${typeLabel}...`);

  // Snapshot before adding step
  const beforeSnapshot = await page.evaluate(() => ({
    textareaCount: document.querySelectorAll('textarea').length,
    editorCount: document.querySelectorAll('.ql-editor').length,
  }));

  // Dismiss any open panels
  await page.keyboard.press('Escape');
  await sleep(300);

  // Click "Add a step"
  const addStepBtn = page.locator('text="Add a step"').last();
  try {
    await addStepBtn.scrollIntoViewIfNeeded();
    await addStepBtn.click({ timeout: 15000 });
  } catch (e) {
    log.warn(`T${touchNum}: "Add a step" click failed: ${e.message} — trying force`);
    await addStepBtn.click({ force: true, timeout: 10000 }).catch(() => {});
  }
  await sleep(1500);

  // Select step type
  const menuItems = page.locator('div[role="menuitem"]');
  const count = await menuItems.count();
  let typeSelected = false;
  for (let i = 0; i < count; i++) {
    const item = menuItems.nth(i);
    const text = (await item.innerText().catch(() => '')).trim();
    if (text.toLowerCase().includes('personalized follow up')) continue;
    if (text.toLowerCase() === typeLabel.toLowerCase()) {
      await item.click();
      typeSelected = true;
      break;
    }
  }
  if (!typeSelected) {
    // Partial match fallback
    for (let i = 0; i < count; i++) {
      const item = menuItems.nth(i);
      const text = (await item.innerText().catch(() => '')).trim().toLowerCase();
      if (text.includes(typeLabel.toLowerCase().split(' ')[0])) {
        await item.click();
        typeSelected = true;
        break;
      }
    }
  }
  if (!typeSelected) throw new Error(`Could not select step type "${typeLabel}"`);
  await sleep(2000);

  // Configure step content
  const isEmailStep = step.type === 'automatic_email' || step.type === 'manual_email';

  if (isEmailStep) {
    // Set email sub-type (Outreach / Follow-up / Last pitch)
    if (step.email_type === 'reply') {
      const subTypeLabel = touchNum === 5 ? 'Last pitch' : 'Follow-up';
      try {
        const btn = page.locator(`button:has-text("${subTypeLabel}")`).last();
        if (await btn.isVisible({ timeout: 3000 })) {
          await btn.click();
          await sleep(500);
          log.step(seqName, touchNum, `Email sub-type: ${subTypeLabel}`);
        }
      } catch (_) {}
    }
    // Defer email content filling — will be injected after next step triggers Quill render
    emailFillQueue.push({ step, touchNum, editorIdx: emailEditorIdx });
    log.step(seqName, touchNum, `Email content deferred to fill queue (editor idx ${emailEditorIdx})`);
  } else if (step.type === 'phone_call' || step.type === 'action_item') {
    if (step.task_note) {
      const filled = await fillNewInput(page, step.task_note, beforeSnapshot);
      log.step(seqName, touchNum, filled ? 'Task note filled' : 'Task note fill FAILED');
    }
  } else if (step.type === 'linkedin_connect' || step.type === 'linkedin_message') {
    if (step.message) {
      const filled = await fillNewInput(page, step.message, beforeSnapshot);
      log.step(seqName, touchNum, filled ? `Message filled (${step.message.length} chars)` : 'Message fill FAILED');
    }
  }

  // CRITICAL: click per-step "Add" to commit the step
  await clickPerStepAdd(page, touchNum, seqName);

  return isEmailStep ? emailEditorIdx + 1 : emailEditorIdx;
}

// ---------------------------------------------------------------------------
// Fill deferred email content (after Quill renders)
// ---------------------------------------------------------------------------
async function fillDeferredEmail(page, fill, seqName) {
  const { step, touchNum, editorIdx } = fill;
  log.step(seqName, touchNum, `Filling deferred email (editor ${editorIdx})...`);

  // Click Template tab
  await clickTemplateTab(page, seqName, touchNum);
  await sleep(500);

  // Subject (Touch 1 / new_thread only)
  if (step.email_type !== 'reply') {
    const subjectText = (step.subject && step.subject !== '{{CONTACT_SPECIFIC}}')
      ? step.subject
      : 'Touch 1 subject placeholder';
    await fillSubject(page, subjectText, touchNum, seqName);
    await sleep(300);
  }

  // Body
  const bodyText = (step.body && step.body !== '{{CONTACT_SPECIFIC}}')
    ? step.body
    : (step.email_type === 'reply' ? step.body : 'Touch 1 body placeholder — will be replaced by prefill-touch1.js');

  if (bodyText) {
    await injectEmailBody(page, bodyText, editorIdx, touchNum, seqName);
  }
}

// ---------------------------------------------------------------------------
// Enable each step toggle (turn on steps before activating)
// ---------------------------------------------------------------------------
async function enableAllSteps(page, seqName) {
  log.info(`${seqName}: Enabling step toggles...`);
  await sleep(1000);

  // Scroll to top to see all steps
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // Look for toggle switches that are OFF (aria-checked=false or data-state=unchecked)
  const toggleCount = await page.evaluate(() => {
    // Find step enable/disable toggles — they're usually input[type=checkbox] or [role=switch]
    const switches = Array.from(document.querySelectorAll(
      '[role="switch"], input[type="checkbox"], button[aria-checked]'
    )).filter(el => el.offsetParent !== null);
    return switches.length;
  });
  log.info(`Found ${toggleCount} toggle(s) on page`);

  // Click any toggle that is currently off
  const toggled = await page.evaluate(() => {
    const switches = Array.from(document.querySelectorAll(
      '[role="switch"][aria-checked="false"], input[type="checkbox"]:not(:checked), button[aria-checked="false"]'
    )).filter(el => el.offsetParent !== null);
    for (const sw of switches) {
      sw.click();
    }
    return switches.length;
  });
  log.info(`Toggled ${toggled} step(s) to enabled`);
  await sleep(1000);

  // Also try clicking visible "Enable" / "Turn on" buttons
  for (const label of ['Enable', 'Turn on', 'Activate step']) {
    try {
      const btns = page.locator(`button:has-text("${label}")`);
      const n = await btns.count();
      for (let i = 0; i < n; i++) {
        if (await btns.nth(i).isVisible({ timeout: 500 })) {
          await btns.nth(i).click({ timeout: 2000 });
          await sleep(300);
          log.debug(`Clicked "${label}" button`);
        }
      }
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Activate the sequence via Apollo API (same approach as prefill-touch1.js)
// ---------------------------------------------------------------------------
async function activateSequence(page, seqName, seqId) {
  log.info(`${seqName}: Activating via API...`);

  // Strategy 1: Apollo API PATCH (most reliable)
  const apiResult = await page.evaluate(async (id) => {
    const endpoints = [
      { url: `/api/v1/emailer_campaigns/${id}`, body: { emailer_campaign: { active: true } } },
      { url: `/api/v1/emailer_campaigns/${id}/activate`, body: {} },
    ];
    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep.url, {
          method: ep.body && Object.keys(ep.body).length > 0 ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
          body: JSON.stringify(ep.body),
        });
        const text = await resp.text().catch(() => '');
        if (resp.status === 409 || text.includes('already active')) {
          return { status: 'already_active', endpoint: ep.url };
        }
        if (resp.ok || resp.status < 400) {
          return { status: 'activated', endpoint: ep.url };
        }
      } catch (_) {}
    }
    return { status: 'api_failed' };
  }, seqId);

  if (apiResult.status === 'activated') {
    log.ok(`${seqName}: Activated via API (${apiResult.endpoint})`);
    return true;
  }
  if (apiResult.status === 'already_active') {
    log.ok(`${seqName}: Already active`);
    return true;
  }

  // Strategy 2: UI fallback — click Inactive status pill or Activate button
  log.warn(`${seqName}: API activation failed — trying UI...`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  for (const sel of [
    'button:has-text("Activate")',
    '[class*="status"]:has-text("Inactive")',
    'span:has-text("Inactive")',
  ]) {
    try {
      const btn = page.locator(sel).last();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click({ timeout: 5000 });
        await sleep(1500);
        // Confirm modal if it appears
        const confirmBtn = page.locator('button:has-text("Confirm")').last();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click({ timeout: 3000 });
          await sleep(1000);
        }
        log.ok(`${seqName}: Activated via UI (${sel})`);
        return true;
      }
    } catch (_) {}
  }

  log.warn(`${seqName}: Could not activate — will be activated by prefill-touch1.js`);
  return false;
}

// ---------------------------------------------------------------------------
// Process a single sequence: navigate to existing ID, add all steps
// ---------------------------------------------------------------------------
async function processSequence(page, seq, seqId, seqIdx) {
  const seqName = seq.name;
  log.info(`\n${'='.repeat(60)}`);
  log.info(`SEQUENCE ${seqIdx + 1}: ${seqName}`);
  log.info(`ID: ${seqId}`);
  log.info('='.repeat(60));

  // Navigate to existing sequence
  await page.goto(`${APOLLO_BASE}/#/sequences/${seqId}`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await sleep(3000);
  await dismissApolloUI(page);

  // Verify we landed on the right page
  const url = page.url();
  if (!url.includes(seqId)) {
    log.warn(`URL mismatch: expected ${seqId} in URL, got ${url}`);
  }

  // Screenshot initial state
  await page.screenshot({ path: `/tmp/fill-seq-${seqIdx}-before.png` });
  log.info(`Screenshot: /tmp/fill-seq-${seqIdx}-before.png`);

  // Check current step count
  const initialStepCount = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('*'))
      .filter(el => el.offsetParent !== null && /^\d+ steps?$/.test(el.textContent?.trim() || ''));
    return badges.length ? parseInt(badges[0].textContent) : 0;
  });

  if (initialStepCount > 0) {
    log.warn(`Sequence already has ${initialStepCount} steps — skipping to avoid duplicates`);
    return { name: seqName, id: seqId, status: 'skipped', steps: initialStepCount, errors: [] };
  }

  log.ok('Sequence is empty — proceeding to add steps');

  const errors = [];
  const emailFillQueue = []; // deferred email steps
  let emailEditorIdx = 0;

  // ── Phase 1: Add all 7 steps ─────────────────────────────────────────────
  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i];
    const isEmailStep = step.type === 'automatic_email' || step.type === 'manual_email';

    try {
      emailEditorIdx = await addStep(page, step, i, seqName, emailFillQueue, emailEditorIdx);
      await sleep(1500);
    } catch (e) {
      const msg = `T${i + 1} add failed: ${e.message}`;
      log.err(msg);
      errors.push(msg);
    }

    // After each non-email step, check if queued email steps now have Quills available
    if (!isEmailStep) {
      await sleep(500);
      const currentEditorCount = await page.evaluate(
        () => document.querySelectorAll('.ql-editor').length
      );
      const nowReady = emailFillQueue.filter(f => f.editorIdx < currentEditorCount);
      for (const fill of nowReady) {
        try {
          await fillDeferredEmail(page, fill, seqName);
        } catch (e) {
          const msg = `T${fill.touchNum} deferred fill failed: ${e.message}`;
          log.err(msg);
          errors.push(msg);
        }
      }
      nowReady.forEach(f => emailFillQueue.splice(emailFillQueue.indexOf(f), 1));
    }
  }

  // ── Phase 2: Fill remaining deferred email steps ──────────────────────────
  if (emailFillQueue.length > 0) {
    log.info(`Filling ${emailFillQueue.length} remaining email step(s)...`);
    // Try expanding steps to trigger lazy Quill renders
    try {
      const expandBtn = page.locator('button:has-text("Expand steps")');
      if (await expandBtn.isVisible({ timeout: 2000 })) {
        await expandBtn.click();
        await sleep(2000);
      }
    } catch (_) {}

    const finalEditorCount = await page.evaluate(
      () => document.querySelectorAll('.ql-editor').length
    );
    log.info(`Phase 2: ${finalEditorCount} Quill editor(s) available`);

    for (const fill of emailFillQueue) {
      if (fill.editorIdx < finalEditorCount) {
        try {
          await fillDeferredEmail(page, fill, seqName);
        } catch (e) {
          const msg = `T${fill.touchNum} phase-2 fill failed: ${e.message}`;
          log.err(msg);
          errors.push(msg);
        }
      } else {
        const msg = `T${fill.touchNum}: Quill not rendered (need editor ${fill.editorIdx}, have ${finalEditorCount})`;
        log.warn(msg);
        errors.push(msg);
      }
    }
  }

  // Save changes
  log.info('Saving sequence...');
  try {
    const saveBtn = page.locator('button:has-text("Save changes")').last();
    if (await saveBtn.isVisible({ timeout: 5000 })) {
      await saveBtn.click({ timeout: 5000 });
      log.ok('Save changes clicked');
      await sleep(2000);
    }
  } catch (_) {
    log.warn('Save changes button not found — assuming steps auto-saved via Add clicks');
  }

  // Dismiss any confirmation modal
  try {
    const confirmBtn = page.locator('button:has-text("Confirm")').last();
    if (await confirmBtn.isVisible({ timeout: 3000 })) {
      await confirmBtn.click({ timeout: 3000 });
      await sleep(1000);
    }
  } catch (_) {}

  await sleep(2000);

  // Enable all steps
  await enableAllSteps(page, seqName);

  // Activate the sequence
  await activateSequence(page, seqName, seqId);

  // Screenshot final state
  await page.screenshot({ path: `/tmp/fill-seq-${seqIdx}-after.png` });
  log.info(`Screenshot: /tmp/fill-seq-${seqIdx}-after.png`);

  // Verify step count
  await sleep(2000);
  const finalStepCount = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('*'))
      .filter(el => el.offsetParent !== null && /^\d+ steps?$/.test(el.textContent?.trim() || ''));
    if (badges.length) return parseInt(badges[0].textContent);
    // Fallback: count step containers
    return document.querySelectorAll('[class*="step_row"], [class*="stepRow"]').length;
  });

  log.info(`Final step count: ${finalStepCount}/${seq.steps.length}`);

  return {
    name: seqName,
    id: seqId,
    status: errors.length === 0 ? 'success' : 'needs_review',
    steps: finalStepCount,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dataFile = process.argv[2];
  if (!dataFile) {
    console.log('Usage: HEADED=true node fill-existing-sequences.js LlamaIndex_sequences.json');
    process.exit(1);
  }

  const dataPath = path.resolve(dataFile);
  const resultsPath = dataPath.replace(/_sequences\.json$/, '_sequences_results.json');

  if (!fs.existsSync(dataPath)) {
    log.err(`Data file not found: ${dataPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(resultsPath)) {
    log.err(`Results file not found: ${resultsPath}`);
    log.err('Need results file to get existing sequence IDs.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

  // Build map: sequence name → sequence ID
  const idMap = {};
  for (const r of (results.sequences || [])) {
    if (r.id) idMap[r.name] = r.id;
  }

  const sequences = data.sequences.filter(seq => {
    if (!idMap[seq.name]) {
      log.warn(`No ID found for "${seq.name}" in results file — skipping`);
      return false;
    }
    return true;
  });

  if (sequences.length === 0) {
    log.err('No sequences with IDs found. Check the results file.');
    process.exit(1);
  }

  log.info(`Processing ${sequences.length} sequences for ${data.account}`);

  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: !HEADED,
    slowMo: SLOW_MO,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    storageState: STATE_FILE,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  const allResults = [];

  try {
    // Verify Apollo login
    await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    await dismissApolloUI(page);

    const loggedIn = await page.locator('text="Sequences"').isVisible({ timeout: 5000 }).catch(() => false);
    if (!loggedIn) {
      log.err('Not logged into Apollo. Run save-apollo-session.js first.');
      process.exit(1);
    }
    log.ok('Apollo login confirmed');

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const seqId = idMap[seq.name];

      try {
        const result = await processSequence(page, seq, seqId, i);
        allResults.push(result);
      } catch (e) {
        log.err(`Sequence ${seq.name} failed: ${e.message}`);
        allResults.push({ name: seq.name, id: seqId, status: 'failed', steps: 0, errors: [e.message] });
      }

      if (i < sequences.length - 1) {
        log.info('Pausing 3s before next sequence...');
        await sleep(3000);
      }
    }

  } finally {
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('FILL SUMMARY');
    console.log('='.repeat(60));
    for (const r of allResults) {
      const icon = r.status === 'success' ? '\x1b[32m[OK]\x1b[0m' :
                   r.status === 'skipped' ? '\x1b[33m[SKIP]\x1b[0m' :
                   r.status === 'needs_review' ? '\x1b[33m[!!]\x1b[0m' :
                   '\x1b[31m[FAIL]\x1b[0m';
      console.log(`${icon} ${r.name}`);
      console.log(`     ID: ${r.id} | Steps: ${r.steps} | Status: ${r.status}`);
      for (const err of r.errors || []) {
        console.log(`     \x1b[31mError: ${err}\x1b[0m`);
      }
    }

    const activated = allResults.filter(r => r.status === 'success').length;
    console.log(`\n\x1b[32mSequences activated: ${activated}/${allResults.length}\x1b[0m`);
    console.log('\x1b[33mNEXT: Run HEADED=true node prefill-touch1.js LlamaIndex_sequences.json\x1b[0m');

    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(e => { log.err(`Fatal: ${e.message}`); console.error(e); process.exit(1); });
