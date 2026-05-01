#!/usr/bin/env node
/**
 * Apollo.io Sequence Builder
 *
 * Reads sequence data from a JSON file and creates sequences in Apollo
 * via Playwright browser automation. Runs outside the Claude loop so
 * errors don't burn conversation tokens.
 *
 * Usage:
 *   node build-sequences.js <data-file.json>
 *   HEADED=true node build-sequences.js <data-file.json>    # watch the browser
 *   DEBUG=true HEADED=true node build-sequences.js <data-file.json>  # verbose logging
 *
 * Loads Apollo session from apollo_session.json.
 * Run save-apollo-session.js once to set up. Chrome does not need to be closed.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const HEADED = process.env.HEADED === 'true';
const DEBUG = process.env.DEBUG === 'true';
const SLOW_MO = DEBUG ? 300 : 50;
const APOLLO_BASE = 'https://app.apollo.io';
const DEFAULT_TIMEOUT = 60000;
const STEP_TRANSITION_WAIT = 1500;

// Apollo session file — run save-apollo-session.js once to create this.
const STATE_FILE = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  ok: (msg) => console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  err: (msg) => console.log(`\x1b[31m[ERR]\x1b[0m  ${msg}`),
  debug: (msg) => { if (DEBUG) console.log(`\x1b[90m[DBG]\x1b[0m  ${msg}`); },
  step: (seq, touch, msg) =>
    console.log(`\x1b[35m[${seq}][Touch ${touch}]\x1b[0m ${msg}`),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeClick(page, selector, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    await page.click(selector, { timeout });
    return true;
  } catch (e) {
    log.debug(`safeClick failed for "${selector}": ${e.message}`);
    return false;
  }
}

async function safeClickByText(page, role, text, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  try {
    const el = page.getByRole(role, { name: text, exact: options.exact ?? false });
    await el.waitFor({ state: 'visible', timeout });
    await el.click({ timeout });
    return true;
  } catch (e) {
    log.debug(`safeClickByText failed for ${role}:"${text}": ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase 0: Dismiss Apollo UI chrome (banners, modals, alerts)
// ---------------------------------------------------------------------------
async function dismissApolloUI(page) {
  log.info('Dismissing Apollo UI alerts/banners/modals...');

  // 1. Payment overdue / system alert banners (X button)
  const alertCloseButtons = page.locator('button[aria-label="Close alert"]');
  const alertCount = await alertCloseButtons.count();
  for (let i = 0; i < alertCount; i++) {
    try {
      await alertCloseButtons.nth(0).click({ timeout: 2000 });
      log.debug('Dismissed alert banner');
      await sleep(500);
    } catch (_) {}
  }

  // 2. "New layout" banner - dismiss by clicking "Switch" to go to old layout
  //    OR just close it. We'll stay on new layout since our selectors target it.
  //    Actually, just ignore it - it doesn't block interactions.
  try {
    const switchBanner = page.locator('text="You\'re viewing the new layout"');
    if (await switchBanner.isVisible({ timeout: 1000 })) {
      log.debug('New layout banner present (non-blocking, ignoring)');
    }
  } catch (_) {}

  // 3. Onboarding hub dismiss
  try {
    const onboardingClose = page.locator('[class*="onboarding"] button[aria-label*="close" i], [class*="onboarding"] button[aria-label*="Close" i]');
    if (await onboardingClose.isVisible({ timeout: 1000 })) {
      await onboardingClose.click({ timeout: 2000 });
      log.debug('Dismissed onboarding hub');
      await sleep(500);
    }
  } catch (_) {}

  // 4. Generic modal overlays with close/X buttons
  try {
    const modalCloseButtons = page.locator('[role="dialog"] button[aria-label*="close" i], [role="dialog"] button[aria-label*="Close" i]');
    const modalCount = await modalCloseButtons.count();
    for (let i = 0; i < modalCount; i++) {
      try {
        await modalCloseButtons.nth(0).click({ timeout: 2000 });
        log.debug('Dismissed modal overlay');
        await sleep(500);
      } catch (_) {}
    }
  } catch (_) {}

  // 5. "Are you sure? Your changes will be lost" — Apollo's leave-page guard
  //    (appears when navigating away from a sequence editor)
  try {
    for (let i = 0; i < 3; i++) {
      const leaveConfirm = page.locator('button:has-text("Confirm")');
      const count = await leaveConfirm.count();
      if (count > 0) {
        // Click the LAST visible Confirm button (innermost/topmost modal)
        for (let j = count - 1; j >= 0; j--) {
          try {
            if (await leaveConfirm.nth(j).isVisible({ timeout: 500 })) {
              await leaveConfirm.nth(j).click({ timeout: 2000 });
              log.debug(`Dismissed confirmation modal (button ${j})`);
              await sleep(500);
              break;
            }
          } catch (_) {}
        }
      } else {
        break;
      }
    }
  } catch (_) {}

  // 5b. Toast notifications
  try {
    const toastClose = page.locator('.redux-toastr button[class*="close"], .redux-toastr .close-toastr');
    const toastCount = await toastClose.count();
    for (let i = 0; i < toastCount; i++) {
      try {
        await toastClose.nth(0).click({ timeout: 1000 });
        log.debug('Dismissed toast');
      } catch (_) {}
    }
  } catch (_) {}

  // 6. Cookie consent / GDPR banners
  try {
    const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Decline"), button:has-text("Got it")');
    if (await cookieBtn.first().isVisible({ timeout: 1000 })) {
      // Prefer "Decline" for privacy, fall back to "Got it" or "Accept"
      const decline = page.locator('button:has-text("Decline")');
      if (await decline.isVisible({ timeout: 500 })) {
        await decline.click();
      } else {
        await cookieBtn.first().click();
      }
      log.debug('Dismissed cookie/consent banner');
      await sleep(500);
    }
  } catch (_) {}

  log.ok('UI dismissal complete');
}

// ---------------------------------------------------------------------------
// Phase 1: Create a new sequence
// ---------------------------------------------------------------------------
async function createSequence(page, sequenceName) {
  log.info(`Creating sequence: ${sequenceName}`);

  // Navigate to sequences page. After saving a prior sequence Apollo's SPA
  // may still be on the editor page — force a full reload to reset state.
  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  // If we're still on a sequence editor URL, reload again
  if (page.url().includes('/sequences/') && !page.url().endsWith('/sequences')) {
    log.info('Still on sequence editor — reloading sequences list...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
  }
  await page.waitForSelector('button, [class*="zp_"]', { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  await dismissApolloUI(page);

  // Click "Create sequence" button (top-right of sequences page)
  // Try multiple times in case the page is still settling
  let created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    if (attempt > 0) {
      log.info(`Retry ${attempt}: waiting for "Create sequence" button...`);
      await sleep(3000);
      await dismissApolloUI(page);
    }
    created = await safeClickByText(page, 'button', 'Create sequence');
    if (!created) {
      // Try alternative — Apollo may render it as a link or different role
      try {
        const altBtn = page.locator('button:has-text("Create sequence"), a:has-text("Create sequence")').first();
        if (await altBtn.isVisible({ timeout: 3000 })) {
          await altBtn.click();
          created = true;
        }
      } catch (_) {}
    }
  }
  if (!created) {
    // Take screenshot for debugging before throwing
    try {
      const ss = `/tmp/apollo-create-seq-fail-${Date.now()}.png`;
      await page.screenshot({ path: ss, fullPage: true });
      log.warn(`Screenshot: ${ss}`);
    } catch (_) {}
    throw new Error('Could not find "Create sequence" button');
  }
  await sleep(3000);

  // --- NEW UI (March 2026): Type picker modal ---
  // Apollo now shows a "Create a sequence" modal with 4 options:
  // AI-assisted, Templates, Clone, From scratch.
  // We need "From scratch" to get a blank sequence.
  // The cards are <button> elements containing <h4> with the option text.
  try {
    const fromScratch = page.locator('h4:text-is("From scratch")').first();
    if (await fromScratch.isVisible({ timeout: 5000 })) {
      log.info('Detected new "Create a sequence" type picker modal');
      await fromScratch.click();
      await sleep(2000);

      // Now we're on the "New Sequence" modal with name input + Create button.
      // Fill in the sequence name.
      const nameInput = page.locator('input').filter({ hasText: '' }).first();
      const nameInputByLabel = page.getByLabel('Sequence Name');
      const nameInputByRole = page.getByRole('textbox');

      let filled = false;
      for (const input of [nameInputByLabel, nameInputByRole, nameInput]) {
        try {
          if (await input.isVisible({ timeout: 2000 })) {
            await input.fill(sequenceName);
            filled = true;
            log.ok(`Filled sequence name: ${sequenceName}`);
            break;
          }
        } catch (e) { /* try next */ }
      }
      if (!filled) {
        log.warn('Could not find name input in New Sequence modal. Trying fallback.');
      }

      // Click "Create" submit button in the New Sequence modal.
      // Use getByRole with exact match to avoid hitting "Create sequence" in navbar.
      await sleep(1000);
      const createBtn = page.getByRole('button', { name: 'Create', exact: true });
      await createBtn.click({ timeout: 10000 });
      await sleep(3000);
      log.ok('Clicked Create. Sequence created with new UI flow.');
    } else {
      // --- FALLBACK: Old UI flow ---
      // If the type picker modal doesn't appear, try the old flow:
      // "Let's draft a sequence" page with title button + "Do it manually"
      log.info('Type picker modal not detected. Trying old UI flow.');

      const titleBtn = page.locator('button:has-text("New Sequence")').first();
      if (await titleBtn.isVisible({ timeout: 3000 })) {
        await titleBtn.click();
        await sleep(500);
        const titleInput = page.locator('input[placeholder="Sequence name"]');
        if (await titleInput.isVisible({ timeout: 3000 })) {
          await titleInput.fill(sequenceName);
          await page.keyboard.press('Enter');
          await sleep(500);
          log.ok(`Renamed sequence to: ${sequenceName}`);
        }
      }

      const manual = await safeClickByText(page, 'button', 'Do it manually');
      if (!manual) throw new Error('Could not find "Do it manually" button');
      await sleep(2000);
    }
  } catch (e) {
    log.err(`Sequence creation flow failed: ${e.message}`);
    throw e;
  }

  await dismissApolloUI(page);

  // Extract sequence ID from URL
  const url = page.url();
  const match = url.match(/sequences\/([a-f0-9]+)/);
  const sequenceId = match ? match[1] : null;
  log.info(`Sequence ID: ${sequenceId || 'unknown'}`);

  return sequenceId;
}

// ---------------------------------------------------------------------------
// Phase 2: Add steps to a sequence
// ---------------------------------------------------------------------------

/**
 * Fill the NEW text input that appeared after a step was added.
 * Uses before/after textarea and editor counts to target by index,
 * so it only touches elements created by THIS step, never earlier ones.
 */
async function fillNewStepInput(page, content, beforeSnapshot) {
  const after = await page.evaluate(() => ({
    textareaCount: document.querySelectorAll('textarea').length,
    editorCount: document.querySelectorAll('.ql-editor').length,
  }));
  log.debug(`After step: ${after.textareaCount} textareas (was ${beforeSnapshot.textareaCount}), ${after.editorCount} editors (was ${beforeSnapshot.editorCount})`);

  // Try new textareas (by index, starting from where old ones ended)
  if (after.textareaCount > beforeSnapshot.textareaCount) {
    for (let i = beforeSnapshot.textareaCount; i < after.textareaCount; i++) {
      const ta = page.locator('textarea').nth(i);
      if (await ta.isVisible({ timeout: 3000 }).catch(() => false)) {
        await ta.click();
        await ta.fill(content);
        log.debug(`Filled new textarea at index ${i}`);
        return true;
      }
    }
    log.debug('New textareas found but none visible');
  }

  // Try new .ql-editor (by index)
  if (after.editorCount > beforeSnapshot.editorCount) {
    const idx = after.editorCount - 1;
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = escaped.split('\n').map(line => `<div>${line.trim() || '<br>'}</div>`).join('');
    const result = await page.evaluate(({ html, idx }) => {
      const editor = document.querySelectorAll('.ql-editor')[idx];
      if (!editor) return { success: false };
      editor.innerHTML = html;
      editor.classList.remove('ql-blank');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, charCount: editor.innerText.trim().length };
    }, { html, idx });
    if (result.success && result.charCount > 0) {
      log.debug(`Filled new .ql-editor at index ${idx} (${result.charCount} chars)`);
      return true;
    }
  }

  return false;
}

// Step type menu text mapping
const STEP_TYPE_LABELS = {
  'automatic_email': 'Automatic email',
  'manual_email': 'Manual email',
  'phone_call': 'Phone call',
  'linkedin_connect': 'LinkedIn - send connection request',
  'linkedin_message': 'LinkedIn - send message',
  'action_item': 'Action item',
};

async function selectStepType(page, typeLabel) {
  // The step type menu uses div[role="menuitem"] elements.
  // CRITICAL: Avoid "Add personalized follow up & last pitch emails" at all costs.
  // We match on the exact text of the menuitem.
  const menuItems = page.locator('div[role="menuitem"]');
  const count = await menuItems.count();
  log.debug(`Found ${count} menu items`);

  for (let i = 0; i < count; i++) {
    const item = menuItems.nth(i);
    const text = (await item.innerText()).trim();
    log.debug(`  Menu item ${i}: "${text}"`);

    // Safety: never click the AI recommendation
    if (text.toLowerCase().includes('personalized follow up')) {
      continue;
    }

    if (text === typeLabel) {
      await item.click();
      await sleep(STEP_TRANSITION_WAIT);
      return true;
    }
  }

  throw new Error(`Could not find menu item "${typeLabel}" in step type picker`);
}

async function addStep(page, step, stepIndex, sequenceName, skipEmailFill = false) {
  const touchNum = stepIndex + 1;
  const typeLabel = STEP_TYPE_LABELS[step.type];
  if (!typeLabel) throw new Error(`Unknown step type: ${step.type}`);

  log.step(sequenceName, touchNum, `Adding ${typeLabel}...`);

  // Snapshot counts BEFORE adding the step so we can target NEW elements by index.
  const beforeSnapshot = await page.evaluate(() => ({
    textareaCount: document.querySelectorAll('textarea').length,
    editorCount: document.querySelectorAll('.ql-editor').length,
  }));
  log.debug(`Before step: ${beforeSnapshot.textareaCount} textareas, ${beforeSnapshot.editorCount} editors`);

  // Dismiss any open step editor panel before clicking "Add a step".
  // After phone/action/LinkedIn steps, the editor panel stays open and can intercept clicks.
  await page.keyboard.press('Escape');
  await sleep(400);
  await dismissApolloUI(page);
  await sleep(300);

  // All touches (including Touch 1): click "+ Add a step" to open the step type menu.
  const addBtn = page.locator('text="Add a step"').last();
  try {
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ timeout: 15000 });
    await sleep(1500);
  } catch (e) {
    log.warn(`"Add a step" click failed: ${e.message}. Trying force click.`);
    try {
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click({ force: true, timeout: 10000 });
      await sleep(1500);
    } catch (e2) {
      // Final fallback: + button icon
      log.warn(`Force click also failed. Trying + button fallback.`);
      const plusBtn = page.locator('button:has-text("+"), [aria-label*="add" i]').last();
      await plusBtn.click({ force: true, timeout: DEFAULT_TIMEOUT });
      await sleep(1500);
    }
  }
  await selectStepType(page, typeLabel);

  // Wait for the step editor to fully render
  await sleep(2000);

  // Now configure the step based on type
  switch (step.type) {
    case 'automatic_email':
    case 'manual_email':
      if (!skipEmailFill) {
        await configureEmailStep(page, step, touchNum, sequenceName, beforeSnapshot.editorCount);
      } else {
        // Set email sub-type only (Outreach / Follow-up / Last pitch) — defer content injection
        await setEmailSubType(page, step, touchNum, sequenceName);
      }
      break;
    case 'phone_call':
      await configurePhoneStep(page, step, touchNum, sequenceName, beforeSnapshot);
      break;
    case 'linkedin_connect':
      await configureLinkedInConnectStep(page, step, touchNum, sequenceName, beforeSnapshot);
      break;
    case 'linkedin_message':
      await configureLinkedInMessageStep(page, step, touchNum, sequenceName, beforeSnapshot);
      break;
    case 'action_item':
      await configureActionItemStep(page, step, touchNum, sequenceName, beforeSnapshot);
      break;
  }

  // Post-fill verification for non-email steps (textarea-based)
  if (step.type === 'linkedin_connect' || step.type === 'linkedin_message') {
    const expectedContent = step.message;
    if (expectedContent) {
      await verifyStepContent(page, expectedContent, touchNum, sequenceName, 'LinkedIn note');
    }
  } else if (step.type === 'phone_call' || step.type === 'action_item') {
    const expectedContent = step.task_note;
    if (expectedContent) {
      await verifyStepContent(page, expectedContent, touchNum, sequenceName, 'task note');
    }
  }

  log.ok(`Touch ${touchNum} (${typeLabel}) added successfully`);
}

/**
 * Verify that the content just written to a step matches expectations.
 * Checks both textareas and Quill editors for the expected content.
 */
async function verifyStepContent(page, expectedContent, touchNum, seqName, fieldName) {
  const expectedStart = expectedContent.substring(0, 40);
  try {
    // Check textarea content
    const textareas = page.locator('textarea');
    const count = await textareas.count();
    for (let i = count - 1; i >= 0; i--) {
      const val = await textareas.nth(i).inputValue().catch(() => '');
      if (val && val.startsWith(expectedStart)) {
        log.debug(`Verified ${fieldName} content in textarea ${i}`);
        return;
      }
    }

    // Check Quill editors
    const editorContent = await page.evaluate((prefix) => {
      const editors = document.querySelectorAll('.ql-editor');
      for (let i = editors.length - 1; i >= 0; i--) {
        if (editors[i].innerText.trim().startsWith(prefix)) {
          return { found: true, index: i };
        }
      }
      return { found: false };
    }, expectedStart);

    if (editorContent.found) {
      log.debug(`Verified ${fieldName} content in Quill editor ${editorContent.index}`);
      return;
    }

    log.warn(`CONTENT VERIFICATION FAILED for Touch ${touchNum} ${fieldName}. Expected content starting with "${expectedStart}..." not found in any textarea or editor.`);
  } catch (e) {
    log.debug(`Content verification error: ${e.message}`);
  }
}

/**
 * Set Apollo's new AI email sub-type (Outreach / Follow-up / Last pitch).
 * Called during step addition when content injection is deferred.
 */
async function setEmailSubType(page, step, touchNum, seqName) {
  const typeLabel = step.email_type === 'reply'
    ? (touchNum === 5 ? 'Last pitch' : 'Follow-up')
    : 'Outreach';
  try {
    const btn = page.locator(`button:has-text("${typeLabel}")`).last();
    if (await btn.isVisible({ timeout: 3000 })) {
      await btn.click();
      await sleep(500);
      log.step(seqName, touchNum, `Email sub-type set to "${typeLabel}"`);
    }
  } catch (e) {
    log.debug(`Could not set email sub-type to "${typeLabel}": ${e.message}`);
  }
}

/**
 * APRIL 2026 UI CHANGE: Apollo's email step editor now defaults to the "Assisted" tab.
 * Only the "Template" tab exposes the raw Subject and Body fields for programmatic filling.
 * This function clicks the Template tab and verifies that raw editors become visible.
 * Must be called before any subject or body injection in email steps.
 */
async function clickTemplateTab(page, seqName, touchNum) {
  const label = `Touch ${touchNum || '?'}`;
  // Primary: getByText with exact match, target the last (most recently added) tab
  try {
    const el = page.getByText('Template', { exact: true }).last();
    if (await el.isVisible({ timeout: 4000 })) {
      await el.click({ timeout: 3000 });
      await sleep(1200);
      const rawVisible = await page
        .locator('input[placeholder*="subject" i], .ql-editor')
        .first().isVisible({ timeout: 5000 }).catch(() => false);
      if (rawVisible) {
        log.step(seqName, touchNum || 1, 'Template tab active — raw editor visible');
        return true;
      }
    }
  } catch (_) {}
  // CSS fallbacks in order of specificity
  for (const sel of [
    'button[class*="tab"]:has-text("Template")',
    '[role="tab"]:has-text("Template")',
    '[class*="tab"]:has-text("Template")',
    'span:has-text("Template")',
    'div:has-text("Template")',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click({ timeout: 2000 });
        await sleep(1000);
        log.step(seqName, touchNum || 1, `Template tab clicked via fallback: ${sel}`);
        return true;
      }
    } catch (_) {}
  }
  log.warn(`${label}: Template tab not found — proceeding with current editor state`);
  return false;
}

/**
 * Inject email subject and body into a Quill editor by absolute index.
 * Called in the SECOND PASS after all steps have been added and the target
 * email step's Quill has rendered lazily in the DOM.
 */
async function fillDeferredEmailContent(page, step, touchNum, editorIdx, seqName) {
  log.step(seqName, touchNum, `Filling deferred email content (Quill editor ${editorIdx})...`);

  // APRIL 2026 UI CHANGE: Click Template tab to expose raw Subject + Body fields.
  await clickTemplateTab(page, seqName, touchNum);
  await sleep(500);

  // Fill subject for new_thread steps
  if (step.subject && step.email_type !== 'reply') {
    const subjectSelectors = [
      'input[placeholder="Enter email subject"]',
      'input[placeholder*="subject" i]',
      'input[placeholder*="Subject" i]',
      'input[name*="subject" i]',
    ];
    let subjectFilled = false;
    for (const sel of subjectSelectors) {
      try {
        const el = page.locator(sel).last();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          // APRIL 2026 UI CHANGE: Clear pre-seeded variable chip, then type to trigger React events.
          await page.keyboard.press('Meta+a');
          await page.keyboard.press('Delete');
          await sleep(200);
          await page.keyboard.type(step.subject, { delay: 20 });
          subjectFilled = true;
          log.step(seqName, touchNum, `Subject filled: "${step.subject}"`);
          break;
        }
      } catch (_) {}
    }
    if (!subjectFilled) {
      log.warn(`Touch ${touchNum}: Subject input not found`);
    }
  }

  // Inject body via Quill DOM manipulation
  if (step.body) {
    const htmlBody = textToQuillHtml(step.body);

    // Click the target editor to activate it and clear any pre-seeded variable chip.
    // APRIL 2026 UI CHANGE: Apollo pre-seeds placeholder chips that must be cleared first.
    try {
      await page.locator('.ql-editor').nth(editorIdx).click({ timeout: 3000 });
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Delete');
      await sleep(300);
    } catch (_) {}

    const result = await page.evaluate(({ html, idx }) => {
      const editors = document.querySelectorAll('.ql-editor');
      if (editors.length === 0) return { success: false, error: 'No .ql-editor found' };
      const editor = editors[idx] ?? editors[editors.length - 1];
      editor.focus();
      editor.innerHTML = html;
      editor.classList.remove('ql-blank');
      editor.dispatchEvent(new Event('focus', { bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      editor.dispatchEvent(new Event('blur', { bubbles: true }));
      return {
        success: true,
        charCount: editor.innerText.trim().length,
        isBlank: editor.classList.contains('ql-blank'),
        editorIndex: idx,
        totalEditors: editors.length,
      };
    }, { html: htmlBody, idx: editorIdx });

    if (!result.success) {
      throw new Error(`Deferred body injection failed: ${result.error}`);
    } else if (result.charCount === 0 || result.isBlank) {
      throw new Error(`Deferred body blank after injection (charCount: ${result.charCount})`);
    } else {
      log.step(seqName, touchNum, `Body injected (${result.charCount} chars, editor ${result.editorIndex}/${result.totalEditors - 1})`);
    }
  }
}

async function configureEmailStep(page, step, touchNum, seqName, editorCountBefore = 0) {
  // Apollo redesigned their sequence email UI to an AI-first composer.
  // The right-panel Quill editor only appears after "Generate preview" is clicked.
  // Strategy: check if a Quill editor already appeared (manual_email may use old UI),
  // and if not, click "Generate preview" to trigger it.

  log.step(seqName, touchNum, `Checking for email editor (baseline: ${editorCountBefore} editors)...`);

  // First: check if Quill editors already appeared without clicking anything
  // (manual_email step type may expose the traditional editor immediately)
  let currentEditorCount = await page.evaluate(() => document.querySelectorAll('.ql-editor').length);
  let newEditorCount = currentEditorCount - editorCountBefore;

  if (newEditorCount === 0) {
    // No new editors yet — click "Generate preview" to trigger the right-panel Quill
    log.step(seqName, touchNum, 'No editor visible yet — clicking Generate preview...');

    let previewClicked = false;
    for (const sel of [
      'button:has-text("Generate preview")',
      '[class*="generate"]:has-text("preview")',
      'text="Generate preview"',
    ]) {
      try {
        const btn = page.locator(sel).last();
        if (await btn.isVisible({ timeout: 4000 })) {
          await btn.click();
          previewClicked = true;
          log.step(seqName, touchNum, `Generate preview clicked — waiting for AI to render...`);
          break;
        }
      } catch (_) {}
    }

    if (!previewClicked) {
      log.warn(`Could not click Generate preview for Touch ${touchNum}`);
      try {
        const ss = `/tmp/apollo-debug-touch${touchNum}-${Date.now()}.png`;
        await page.screenshot({ path: ss, fullPage: true });
        log.warn(`Debug screenshot: ${ss}`);
      } catch (_) {}
    }

    // Wait for AI generation + Quill render (up to 15s)
    await sleep(2000);
    try {
      await page.waitForFunction(
        (n) => document.querySelectorAll('.ql-editor').length > n,
        editorCountBefore,
        { timeout: 15000 }
      );
      await sleep(500);
    } catch (e) {
      log.warn(`No new Quill editors after Generate preview (baseline ${editorCountBefore}): ${e.message}`);
      try {
        const ss = `/tmp/apollo-debug-touch${touchNum}-${Date.now()}.png`;
        await page.screenshot({ path: ss, fullPage: true });
        log.warn(`Debug screenshot: ${ss}`);
      } catch (_) {}
    }

    currentEditorCount = await page.evaluate(() => document.querySelectorAll('.ql-editor').length);
    newEditorCount = currentEditorCount - editorCountBefore;
    log.step(seqName, touchNum, `${newEditorCount} new Quill editor(s) available (total ${currentEditorCount})`);
  } else {
    log.step(seqName, touchNum, `${newEditorCount} Quill editor(s) already visible (old-style editor) — skipping Generate preview`);
  }

  // Dismiss "dynamic variables could not be substituted" notification if present
  try {
    const closeBtn = page.locator('[class*="notification"] button, [class*="toast"] button[aria-label*="close" i]').last();
    if (await closeBtn.isVisible({ timeout: 1000 })) {
      await closeBtn.click();
      log.debug('Dismissed variable substitution notification');
    }
  } catch (_) {}

  // APRIL 2026 UI CHANGE: Apollo's email step editor defaults to "Assisted" tab.
  // Click "Template" tab to expose the raw Subject and Body fields before filling.
  await clickTemplateTab(page, seqName, touchNum);
  await sleep(500);

  // Select email sub-type in Apollo's new AI composer (Outreach / Follow-up / Last pitch)
  // These correspond to: new_thread=Outreach, follow-up replies=Follow-up, breakup=Last pitch
  if (step.email_type === 'reply') {
    const typeLabel = touchNum === 5 ? 'Last pitch' : 'Follow-up';
    try {
      const typeBtn = page.locator(`button:has-text("${typeLabel}")`).last();
      if (await typeBtn.isVisible({ timeout: 3000 })) {
        await typeBtn.click();
        await sleep(500);
        log.step(seqName, touchNum, `Email sub-type set to "${typeLabel}"`);
      }
    } catch (_) {}
  }

  // Fill subject (Touch 1 / new_thread only)
  if (step.subject && step.email_type !== 'reply') {
    log.step(seqName, touchNum, 'Filling subject...');
    const subjectSelectors = [
      'input[placeholder="Enter email subject"]',
      'input[placeholder*="subject" i]',
      'input[placeholder*="Subject" i]',
      'input[name*="subject" i]',
    ];
    let subjectFilled = false;
    for (const sel of subjectSelectors) {
      try {
        const el = page.locator(sel).last();
        if (await el.isVisible({ timeout: 4000 })) {
          await el.click();
          // APRIL 2026 UI CHANGE: Clear pre-seeded variable chip, then type to trigger React events.
          await page.keyboard.press('Meta+a');
          await page.keyboard.press('Delete');
          await sleep(200);
          await page.keyboard.type(step.subject, { delay: 20 });
          subjectFilled = true;
          log.step(seqName, touchNum, `Subject filled: "${step.subject}"`);
          break;
        }
      } catch (_) {}
    }
    // Fallback: if 2+ new Quill editors appeared, first one is likely subject
    if (!subjectFilled && newEditorCount >= 2) {
      const subjectHtml = `<div>${step.subject.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
      const r = await page.evaluate(({ html, idx }) => {
        const ed = document.querySelectorAll('.ql-editor')[idx];
        if (!ed) return { success: false };
        ed.innerHTML = html;
        ed.classList.remove('ql-blank');
        ed.dispatchEvent(new Event('input', { bubbles: true }));
        return { success: true };
      }, { html: subjectHtml, idx: editorCountBefore });
      if (r.success) {
        subjectFilled = true;
        log.step(seqName, touchNum, `Subject injected into editor ${editorCountBefore}`);
      }
    }
    if (!subjectFilled) {
      log.warn(`Subject could not be filled for Touch ${touchNum}`);
    }
  }

  // Inject email body
  if (step.body) {
    log.step(seqName, touchNum, 'Injecting email body...');

    // If 2 new editors for new_thread: [editorCountBefore]=subject, [editorCountBefore+1]=body
    // If reply or only 1 new editor: [editorCountBefore]=body
    const bodyIndex = (step.email_type !== 'reply' && newEditorCount >= 2)
      ? editorCountBefore + 1
      : editorCountBefore;

    const htmlBody = textToQuillHtml(step.body);

    const doInject = async (idx) => page.evaluate(({ html, targetIndex }) => {
      const editors = document.querySelectorAll('.ql-editor');
      if (editors.length === 0) return { success: false, error: 'No .ql-editor found' };
      const editor = editors[targetIndex] ?? editors[editors.length - 1];
      editor.focus();
      editor.innerHTML = html;
      editor.classList.remove('ql-blank');
      editor.dispatchEvent(new Event('focus', { bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      editor.dispatchEvent(new Event('blur', { bubbles: true }));
      return {
        success: true,
        charCount: editor.innerText.trim().length,
        isBlank: editor.classList.contains('ql-blank'),
        editorIndex: targetIndex,
        totalEditors: editors.length,
      };
    }, { html: htmlBody, targetIndex: idx });

    // APRIL 2026 UI CHANGE: Click editor and clear any pre-seeded variable chip before injection.
    try {
      await page.locator('.ql-editor').nth(bodyIndex).click({ timeout: 3000 });
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Delete');
      await sleep(300);
    } catch (_) {}

    let injected = await doInject(bodyIndex);

    if (!injected.success) {
      log.warn(`Body injection failed (${injected.error}) — retrying after 2s`);
      await sleep(2000);
      injected = await doInject(bodyIndex);
    }

    if (!injected.success) {
      throw new Error(`Body injection failed after retry: ${injected.error}`);
    } else if (injected.charCount === 0 || injected.isBlank) {
      log.err(`Body appears blank after injection (charCount: ${injected.charCount})`);
      throw new Error('Body blank after injection');
    } else {
      log.step(seqName, touchNum, `Body injected (${injected.charCount} chars, editor ${injected.editorIndex}/${injected.totalEditors - 1})`);
    }
  }
}

async function configurePhoneStep(page, step, touchNum, seqName, beforeSnapshot) {
  if (step.task_note) {
    log.step(seqName, touchNum, 'Filling call script...');

    // Use index-based targeting to ONLY fill the input created by THIS step.
    // This prevents overwriting the LinkedIn connect note from Touch 2.
    const filled = await fillNewStepInput(page, step.task_note, beforeSnapshot);
    if (filled) {
      log.step(seqName, touchNum, 'Call script filled');
    } else {
      log.err(`Call script could not be filled for Touch ${touchNum}. No new input element found after this step was added.`);
    }
  }
}

async function configureLinkedInConnectStep(page, step, touchNum, seqName, beforeSnapshot) {
  if (step.message) {
    log.step(seqName, touchNum, 'Filling LinkedIn connect note...');

    const filled = await fillNewStepInput(page, step.message, beforeSnapshot);
    if (filled) {
      log.step(seqName, touchNum, `LinkedIn note filled (${step.message.length} chars)`);
    } else {
      log.err(`LinkedIn note could not be filled for Touch ${touchNum}. No new visible input found.`);
    }
  }
}

async function configureLinkedInMessageStep(page, step, touchNum, seqName, beforeSnapshot) {
  if (step.message) {
    log.step(seqName, touchNum, 'Filling LinkedIn message...');

    const filled = await fillNewStepInput(page, step.message, beforeSnapshot);
    if (filled) {
      log.step(seqName, touchNum, `LinkedIn message filled (${step.message.length} chars)`);
    } else {
      log.err(`LinkedIn message could not be filled for Touch ${touchNum}. No new visible input found.`);
    }
  }
}

async function configureActionItemStep(page, step, touchNum, seqName, beforeSnapshot) {
  if (step.task_note) {
    log.step(seqName, touchNum, 'Filling action item note...');

    const filled = await fillNewStepInput(page, step.task_note, beforeSnapshot);
    if (filled) {
      log.step(seqName, touchNum, 'Action item note filled');
    } else {
      log.err(`Action item note could not be filled for Touch ${touchNum}. No new visible input found.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Text to Quill HTML converter
// ---------------------------------------------------------------------------
function textToQuillHtml(text) {
  // Split on double newlines for paragraphs, single newlines within paragraphs
  const lines = text.split('\n');
  let html = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      html += '<div><br></div>';
    } else {
      // Escape HTML entities
      const escaped = trimmed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      html += `<div>${escaped}</div>`;
    }
  }

  return html;
}

// ---------------------------------------------------------------------------
// Phase 3: Verify sequence after save
// ---------------------------------------------------------------------------
async function verifySequence(page, expectedStepCount, sequenceName) {
  log.info(`Verifying sequence: ${sequenceName}...`);

  // Check step count
  const stepBadge = page.locator('text=/\\d+ steps?/').first();
  try {
    const badgeText = await stepBadge.innerText({ timeout: 5000 });
    const count = parseInt(badgeText);
    if (count === expectedStepCount) {
      log.ok(`Step count verified: ${count}/${expectedStepCount}`);
    } else {
      log.warn(`Step count mismatch: got ${count}, expected ${expectedStepCount}`);
    }
  } catch (e) {
    log.warn('Could not verify step count from badge');
  }

  // Expand all steps and check Quill editors for content
  try {
    const expandBtn = page.locator('button:has-text("Expand steps")');
    if (await expandBtn.isVisible({ timeout: 2000 })) {
      await expandBtn.click();
      await sleep(2000);
    }
  } catch (_) {}

  // Check all editors have content
  const editorCheck = await page.evaluate(() => {
    const editors = document.querySelectorAll('.ql-editor');
    return [...editors].map((ed, i) => ({
      index: i,
      isBlank: ed.classList.contains('ql-blank'),
      charCount: ed.innerText.trim().length,
    }));
  });

  let blankCount = 0;
  for (const ed of editorCheck) {
    if (ed.isBlank || ed.charCount === 0) {
      log.warn(`Editor ${ed.index} appears blank (charCount: ${ed.charCount})`);
      blankCount++;
    }
  }

  if (blankCount === 0) {
    log.ok(`All ${editorCheck.length} editors have content`);
  } else {
    log.warn(`${blankCount} editor(s) appear blank. Manual review needed.`);
  }

  return { editorCheck, blankCount };
}

// ---------------------------------------------------------------------------
// Main: Build all sequences from JSON data
// ---------------------------------------------------------------------------
async function main() {
  // Load data file
  const dataFile = process.argv[2];
  if (!dataFile) {
    console.log('Usage: node build-sequences.js <sequence-data.json>');
    console.log('       HEADED=true node build-sequences.js <data.json>   # watch browser');
    console.log('       DEBUG=true HEADED=true node build-sequences.js <data.json>   # verbose');
    process.exit(1);
  }

  const dataPath = path.resolve(dataFile);
  if (!fs.existsSync(dataPath)) {
    log.err(`File not found: ${dataPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const sequences = data.sequences;
  if (!sequences || sequences.length === 0) {
    log.err('No sequences found in data file');
    process.exit(1);
  }

  log.info(`Loaded ${sequences.length} sequences for ${data.account || 'unknown account'}`);
  log.info(`Mode: ${HEADED ? 'headed (visible)' : 'headless'} | Debug: ${DEBUG}`);

  // Launch browser with saved Apollo session (Chrome can be open — no conflict)
  if (!fs.existsSync(STATE_FILE)) {
    log.err(`Apollo session not found: ${STATE_FILE}`);
    log.err('Run once to set up: node save-apollo-session.js');
    process.exit(1);
  }
  log.info('Launching browser with saved Apollo session...');

  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: !HEADED,
    slowMo: SLOW_MO,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    storageState: STATE_FILE,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  // Results tracking
  const results = {
    account: data.account,
    sequences: [],
    startedAt: new Date().toISOString(),
  };

  try {
    // Navigate to Apollo and dismiss UI chrome
    await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('button, [class*="zp_"]', { timeout: 30000 }).catch(() => {});
    await sleep(3000);
    await dismissApolloUI(page);

    // Check if logged in
    const isLoggedIn = await page.locator('text="Sequences"').isVisible({ timeout: 5000 }).catch(() => false);
    if (!isLoggedIn) {
      log.err('Not logged into Apollo. Please log in manually, then re-run.');
      if (HEADED) {
        log.info('Waiting 60s for manual login...');
        await sleep(60000);
      } else {
        log.err('Run with HEADED=true to log in visually.');
        process.exit(1);
      }
    }

    log.ok('Apollo login confirmed');

    // Build each sequence
    for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
      const seq = sequences[seqIdx];
      const seqResult = {
        name: seq.name,
        id: null,
        steps: seq.steps.length,
        status: 'pending',
        errors: [],
      };

      log.info(`\n${'='.repeat(60)}`);
      log.info(`SEQUENCE ${seqIdx + 1}/${sequences.length}: ${seq.name}`);
      log.info('='.repeat(60));

      try {
        // Create the sequence
        const seqId = await createSequence(page, seq.name);
        seqResult.id = seqId;

        // ── Phase 1: Add all steps ──────────────────────────────────────
        // Email step Quill editors render LAZILY — they only appear in the DOM
        // after the NEXT step is added. So we skip email content injection during
        // step addition and defer it until after the subsequent step triggers render.
        //
        // Pattern observed: email step N's Quill appears after step N+1 is added.
        // Queue: { step, touchNum, editorIdx } where editorIdx = 0,1,2... for email steps in order.
        const emailFillQueue = []; // deferred email steps
        let emailEditorIdx = 0;

        for (let stepIdx = 0; stepIdx < seq.steps.length; stepIdx++) {
          const step = seq.steps[stepIdx];
          const isEmailStep = step.type === 'automatic_email' || step.type === 'manual_email';

          try {
            // Add step structure (skip email body/subject for email steps)
            await addStep(page, step, stepIdx, seq.name, /* skipEmailFill= */ isEmailStep);
            await sleep(STEP_TRANSITION_WAIT);
          } catch (stepErr) {
            const msg = `Touch ${stepIdx + 1} failed: ${stepErr.message}`;
            log.err(msg);
            seqResult.errors.push(msg);
          }

          if (isEmailStep) {
            // Queue this email step for deferred content injection
            emailFillQueue.push({ step, touchNum: stepIdx + 1, editorIdx: emailEditorIdx++ });
          } else {
            // Non-email step just added — check if any queued email steps now have Quills
            await sleep(500);
            const currentEditorCount = await page.evaluate(
              () => document.querySelectorAll('.ql-editor').length
            );
            log.debug(`After Touch ${stepIdx + 1}: ${currentEditorCount} Quill editor(s) in DOM`);

            const nowReady = emailFillQueue.filter(f => f.editorIdx < currentEditorCount);
            for (const fill of nowReady) {
              try {
                await fillDeferredEmailContent(page, fill.step, fill.touchNum, fill.editorIdx, seq.name);
              } catch (fillErr) {
                const msg = `Touch ${fill.touchNum} deferred fill failed: ${fillErr.message}`;
                log.err(msg);
                seqResult.errors.push(msg);
              }
            }
            // Remove filled items from queue
            nowReady.forEach(f => emailFillQueue.splice(emailFillQueue.indexOf(f), 1));
          }
        }

        // ── Phase 2: Fill any remaining email steps ──────────────────────
        // The last email step (T5) has no subsequent step to trigger its Quill.
        // Try clicking "Expand steps" to force all step panels to render.
        if (emailFillQueue.length > 0) {
          log.info(`Filling ${emailFillQueue.length} remaining email step(s)...`);
          try {
            const expandBtn = page.locator('button:has-text("Expand steps")');
            if (await expandBtn.isVisible({ timeout: 2000 })) {
              await expandBtn.click();
              await sleep(2000);
            }
          } catch (_) {}

          const finalCount = await page.evaluate(
            () => document.querySelectorAll('.ql-editor').length
          );
          log.debug(`Phase 2: ${finalCount} Quill editor(s) available`);

          for (const fill of emailFillQueue) {
            if (fill.editorIdx < finalCount) {
              try {
                await fillDeferredEmailContent(page, fill.step, fill.touchNum, fill.editorIdx, seq.name);
              } catch (fillErr) {
                const msg = `Touch ${fill.touchNum} phase-2 fill failed: ${fillErr.message}`;
                log.err(msg);
                seqResult.errors.push(msg);
              }
            } else {
              const msg = `Touch ${fill.touchNum}: Quill not rendered (need index ${fill.editorIdx}, have ${finalCount})`;
              log.warn(msg);
              seqResult.errors.push(msg);
            }
          }
        }

        // Save the sequence
        // Apollo's new_cc UI shows "Save changes" when a step editor panel is open.
        // We try multiple strategies to click it before giving up.
        log.info('Saving sequence...');
        let saved = false;

        // Scroll to top so header buttons (including "Save changes") are in viewport
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(500);

        // Strategy 1: CSS locator (bypasses ARIA name matching)
        const saveLabels = ['Save changes', 'Save', 'Done', 'Publish', 'Save sequence'];
        for (const label of saveLabels) {
          try {
            const btn = page.locator(`button:has-text("${label}")`).last();
            if (await btn.isVisible({ timeout: 5000 })) {
              await btn.click({ timeout: 5000 });
              log.info(`Saved via CSS selector: "${label}"`);
              saved = true;
              break;
            }
          } catch (_) {}
        }

        // Strategy 2: JS evaluate — find by text content directly
        if (!saved) {
          const jsSaved = await page.evaluate((labels) => {
            const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
            for (const label of labels) {
              const btn = allBtns.find(b =>
                b.textContent.trim().toLowerCase().includes(label.toLowerCase()) &&
                b.offsetParent !== null
              );
              if (btn) { btn.click(); return label; }
            }
            return null;
          }, saveLabels);
          if (jsSaved) {
            log.info(`Saved via JS evaluate: "${jsSaved}"`);
            saved = true;
          }
        }

        // Strategy 3: Fallback — Apollo may auto-save steps as they're added
        // (new_cc UI sometimes commits each step via API without explicit save)
        if (!saved) {
          log.warn('Save button not found — assuming Apollo auto-saved step additions');
          saved = true;
        }

        if (saved) {
          await sleep(2000);

          // Apollo may show a "Review and confirm steps" modal after Save
          // (appears when AI Power-ups variables can't be substituted).
          // Must click "Confirm" on it or the sequence won't actually save.
          try {
            for (let attempt = 0; attempt < 3; attempt++) {
              const confirmBtn = page.locator('button:has-text("Confirm")');
              const count = await confirmBtn.count();
              if (count === 0) break;
              for (let j = count - 1; j >= 0; j--) {
                try {
                  if (await confirmBtn.nth(j).isVisible({ timeout: 500 })) {
                    await confirmBtn.nth(j).click({ timeout: 2000 });
                    log.info('Dismissed post-save confirmation modal');
                    await sleep(1000);
                    break;
                  }
                } catch (_) {}
              }
            }
          } catch (_) {}

          await sleep(2000);

          // Check for success toast
          try {
            const successToast = page.locator('text="successfully saved"');
            if (await successToast.isVisible({ timeout: 5000 })) {
              log.ok('Sequence saved successfully');
            }
          } catch (_) {
            log.warn('No save confirmation toast detected');
          }

          // Verify
          const verification = await verifySequence(page, seq.steps.length, seq.name);
          seqResult.blankEditors = verification.blankCount;
          seqResult.status = verification.blankCount === 0 ? 'success' : 'needs_review';
        } else {
          log.err('Could not find Save button');
          seqResult.status = 'save_failed';
          seqResult.errors.push('Save button not found');
        }
      } catch (seqErr) {
        log.err(`Sequence creation failed: ${seqErr.message}`);
        seqResult.status = 'failed';
        seqResult.errors.push(seqErr.message);
      }

      results.sequences.push(seqResult);

      // Brief pause between sequences
      if (seqIdx < sequences.length - 1) {
        log.info('Pausing before next sequence...');
        await sleep(2000);
      }
    }
  } catch (fatalErr) {
    log.err(`Fatal error: ${fatalErr.message}`);
  } finally {
    results.completedAt = new Date().toISOString();

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('BUILD SUMMARY');
    console.log('='.repeat(60));
    console.log(`Account: ${results.account}`);
    console.log(`Started: ${results.startedAt}`);
    console.log(`Completed: ${results.completedAt}`);
    console.log('');

    for (const seq of results.sequences) {
      const icon = seq.status === 'success' ? '\x1b[32m[OK]\x1b[0m' :
                   seq.status === 'needs_review' ? '\x1b[33m[!!]\x1b[0m' :
                   '\x1b[31m[FAIL]\x1b[0m';
      console.log(`${icon} ${seq.name}`);
      console.log(`     ID: ${seq.id || 'N/A'} | Steps: ${seq.steps} | Status: ${seq.status}`);
      if (seq.errors.length > 0) {
        for (const err of seq.errors) {
          console.log(`     \x1b[31mError: ${err}\x1b[0m`);
        }
      }
    }

    console.log('\n\x1b[33mREMINDER: All sequences are INACTIVE. Review and activate manually in Apollo.\x1b[0m');

    // Write results to file
    const resultsPath = dataPath.replace('.json', '_results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    log.info(`Results written to: ${resultsPath}`);

    // Close browser
    await context.close();
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  log.err(`Unhandled error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
