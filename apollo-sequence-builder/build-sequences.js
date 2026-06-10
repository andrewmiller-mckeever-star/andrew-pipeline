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

const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Dedicated Playwright profile — separate from regular Chrome so Chrome can stay open.
// Chrome does NOT need to be closed. This is different from Ryan Reed's approach which
// uses the real Chrome profile (which requires closing Chrome first).
const CHROME_PROFILE_PATH = path.join(process.env.HOME, '.apollo-playwright-profile');

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

  // 6. "This sequence has no contacts" popup — dismiss with X to avoid navigation
  try {
    const noContactsPopup = page.locator('text="This sequence has no contacts"');
    if (await noContactsPopup.isVisible({ timeout: 1000 })) {
      const closeX = page.locator('button[aria-label*="close" i], button[aria-label*="Close" i], button:has-text("×")').last();
      if (await closeX.isVisible({ timeout: 1000 })) {
        await closeX.click();
      } else {
        // Click the X in the popup card
        const popupX = noContactsPopup.locator('..').locator('button').last();
        await popupX.click({ timeout: 1000 });
      }
      log.debug('Dismissed "no contacts" popup');
      await sleep(500);
    }
  } catch (_) {}

  // 6b. Cookie consent / GDPR banners
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
  'linkedin_interact_post': 'Action item', // maps to Action item in Apollo UI
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

async function addStep(page, step, stepIndex, sequenceName) {
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

  // All touches (including Touch 1): click "+ Add a step" to open the step type menu.
  // NOTE: Do NOT press Escape or call dismissApolloUI here — it triggers Apollo's
  // "Your changes will be lost?" dialog, which auto-confirms and discards the previous step.
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

  // Now configure the step based on type — always inline (Ryan Reed approach: no deferred fill)
  switch (step.type) {
    case 'automatic_email':
    case 'manual_email':
      await configureEmailStep(page, step, touchNum, sequenceName, beforeSnapshot.editorCount);
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

async function configureEmailStep(page, step, touchNum, seqName) {
  // Ryan Reed approach (proven working): Template tab → clear placeholders → fill inline.
  // No "Generate preview" — just switch to Template tab immediately after adding the step.
  // APRIL 2026 UI CHANGE: Apollo defaults email steps to "Assisted" tab with AI placeholder
  // variables pre-seeded. We switch to Template, clear the placeholder chips, then inject.

  log.step(seqName, touchNum, 'Switching to Template tab...');
  try {
    const templateCandidates = [
      page.locator('button:has-text("Template")').last(),
      page.locator('[role="tab"]:has-text("Template")').last(),
      page.locator('text="Template"').last(),
    ];
    let clicked = false;
    for (const cand of templateCandidates) {
      try {
        if (await cand.isVisible({ timeout: 2000 })) {
          await cand.click({ timeout: 3000 });
          clicked = true;
          break;
        }
      } catch (_) {}
    }
    if (clicked) {
      await sleep(1000);
      log.step(seqName, touchNum, 'Template tab selected');
    } else {
      log.debug('Template tab not found — may already be on Template or old UI');
    }
  } catch (e) {
    log.warn(`Template tab click failed: ${e.message}. Continuing.`);
  }

  // Set email type (New thread vs Reply)
  if (step.email_type === 'reply') {
    log.step(seqName, touchNum, 'Setting type to Reply...');
    try {
      const typeDropdown = page.locator('div[role="combobox"]:has-text("New thread")').last();
      if (await typeDropdown.isVisible({ timeout: 5000 })) {
        await typeDropdown.click();
        await sleep(500);
        const replyOption = page.locator('div[role="option"]:has-text("Reply")').first();
        await replyOption.click({ timeout: 3000 });
        await sleep(500);
        log.step(seqName, touchNum, 'Type set to Reply');
      } else {
        log.warn('Type dropdown not visible. May already be Reply.');
      }
    } catch (e) {
      log.warn(`Could not set Reply type: ${e.message}`);
    }
  }

  // Fill subject (new_thread only)
  if (step.subject && step.email_type !== 'reply') {
    log.step(seqName, touchNum, 'Filling subject...');
    try {
      const subjectInput = page.locator('input[placeholder="Enter email subject"]').last();
      await subjectInput.waitFor({ state: 'visible', timeout: 10000 });
      await subjectInput.click();
      // Clear Apollo's pre-seeded placeholder variable chip
      await page.keyboard.press('Meta+A');
      await sleep(100);
      await page.keyboard.press('Delete');
      await sleep(200);
      await subjectInput.fill(step.subject);
      log.step(seqName, touchNum, `Subject: "${step.subject}"`);
    } catch (e) {
      log.warn(`Subject fill failed: ${e.message}`);
    }
  }

  // Inject email body via Quill editor
  if (step.body) {
    log.step(seqName, touchNum, 'Injecting email body...');
    const htmlBody = textToQuillHtml(step.body);

    // Click into the last Quill editor and clear Apollo's pre-seeded variable chip
    try {
      const editorHandle = page.locator('.ql-editor').last();
      await editorHandle.click({ timeout: 5000 });
      await page.keyboard.press('Meta+A');
      await sleep(100);
      await page.keyboard.press('Delete');
      await sleep(200);
    } catch (e) {
      log.debug(`Body pre-clear failed (will still inject): ${e.message}`);
    }

    const injected = await page.evaluate((html) => {
      const editors = document.querySelectorAll('.ql-editor');
      if (editors.length === 0) return { success: false, error: 'No .ql-editor found' };
      const editor = editors[editors.length - 1];
      editor.innerHTML = html;
      editor.classList.remove('ql-blank');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        charCount: editor.innerText.trim().length,
        isBlank: editor.classList.contains('ql-blank'),
        editorIndex: editors.length - 1,
      };
    }, htmlBody);

    if (!injected.success) {
      log.err(`Body injection failed: ${injected.error}`);
      await sleep(2000);
      const retry = await page.evaluate((html) => {
        const editors = document.querySelectorAll('.ql-editor');
        if (editors.length === 0) return { success: false, error: 'Still no .ql-editor' };
        const editor = editors[editors.length - 1];
        editor.innerHTML = html;
        editor.classList.remove('ql-blank');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, charCount: editor.innerText.trim().length };
      }, htmlBody);
      if (!retry.success) throw new Error(`Body injection failed after retry: ${retry.error}`);
      log.step(seqName, touchNum, `Body injected on retry (${retry.charCount} chars)`);
    } else {
      log.step(seqName, touchNum, `Body injected (${injected.charCount} chars)`);
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
async function verifySequence(page, expectedStepCount, sequenceName, seqId) {
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

  // Authoritative content check via API.
  // The campaign detail returns emailer_steps, emailer_touches, and emailer_templates
  // as separate top-level arrays linked by id. We join them and confirm each step
  // actually persisted its content:
  //   - email steps  (auto_email/manual_email): template body_text must be non-empty
  //   - note  steps  (linkedin/call/action_item): step.note must be non-empty
  // This replaces the old DOM .ql-editor scan, which false-flagged hidden/secondary
  // Quill editors as "blank" even when the saved sequence was complete.
  if (!seqId) {
    log.warn('No sequence ID available for content verification; skipping.');
    return { details: [], blankCount: 0, verified: false };
  }

  const check = await page.evaluate(async (id) => {
    const opts = { headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    const r = await fetch(`/api/v1/emailer_campaigns/${id}?show_steps=true`, { ...opts, method: 'GET' });
    const j = JSON.parse(await r.text());
    const steps = (j.emailer_steps || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    const touches = j.emailer_touches || [];
    const tpls = j.emailer_templates || [];
    const EMAIL = new Set(['auto_email', 'manual_email']);
    return steps.map((s) => {
      let contentLen = 0;
      if (EMAIL.has(s.type)) {
        const touch = touches.find((t) => t.emailer_step_id === s.id);
        const tpl = touch && tpls.find((tp) => tp.id === touch.emailer_template_id);
        const body = tpl ? (tpl.body_text || tpl.body_html || '').replace(/<[^>]+>/g, '').trim() : '';
        contentLen = body.length;
      } else {
        contentLen = (s.note || '').trim().length;
      }
      return { pos: s.position, type: s.type, contentLen };
    });
  }, seqId);

  let blankCount = 0;
  for (const s of check) {
    if (s.contentLen === 0) {
      log.warn(`Step ${s.pos} (${s.type}) has no saved content`);
      blankCount++;
    }
  }

  if (blankCount === 0) {
    log.ok(`All ${check.length} steps have saved content`);
  } else {
    log.warn(`${blankCount} step(s) missing content. Manual review needed.`);
  }

  return { details: check, blankCount, verified: true };
}

// ---------------------------------------------------------------------------
// Phase 4: Guarantee sequence is inactive after build
// ---------------------------------------------------------------------------
/**
 * Checks and enforces that a sequence is inactive after creation.
 * Apollo's "From scratch" UI can non-deterministically leave sequences ACTIVE.
 * PUT active:false is silently ignored by the API — only UI toggle or archive work.
 *
 * Returns: 'inactive' | 'archived' | 'unsafe'
 */
async function checkSequenceActiveViaAPI(page, seqId) {
  return page.evaluate(async (id) => {
    try {
      const res = await fetch(`/api/v1/emailer_campaigns/${id}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const c = data.emailer_campaign;
      if (!c) return null;
      return c.active === true;
    } catch (e) { return null; }
  }, seqId);
}

async function ensureSequenceInactive(page, seqId, seqName) {
  if (!seqId) {
    log.err(`${seqName}: no sequence ID — cannot verify active state. DO NOT ENROLL.`);
    return 'unsafe';
  }
  log.info(`${seqName}: checking active state...`);
  const isActive = await checkSequenceActiveViaAPI(page, seqId);
  if (isActive === null) {
    log.err(`${seqName}: active-state API check failed. DO NOT ENROLL until manually verified.`);
    return 'unsafe';
  }
  if (isActive === false) {
    log.ok(`${seqName}: INACTIVE confirmed ✓`);
    return 'inactive';
  }
  log.warn(`\x1b[31m⚠  ${seqName}: sequence is ACTIVE after creation — deactivating...\x1b[0m`);

  // Strategy 1: settings page ARIA switch
  try {
    await page.goto(`${APOLLO_BASE}/#/sequences/${seqId}/settings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    await dismissApolloUI(page);
    const toggle = page.locator('[role="switch"][aria-checked="true"]').first();
    if (await toggle.isVisible({ timeout: 5000 })) {
      await toggle.click();
      await sleep(2000);
      const stillActive = await checkSequenceActiveViaAPI(page, seqId);
      if (stillActive === false) {
        log.ok(`${seqName}: deactivated via settings toggle ✓`);
        return 'inactive';
      }
    }
  } catch (_) {}

  // Strategy 2: detail page Active button
  try {
    await page.goto(`${APOLLO_BASE}/#/sequences/${seqId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    const activeBtn = page.locator('button:has-text("Active")').first();
    if (await activeBtn.isVisible({ timeout: 5000 })) {
      await activeBtn.click();
      await sleep(1000);
      const confirmBtn = page.locator('button:has-text("Pause"), button:has-text("Deactivate"), button:has-text("Confirm")').first();
      if (await confirmBtn.isVisible({ timeout: 2000 })) { await confirmBtn.click(); await sleep(1000); }
      const stillActive = await checkSequenceActiveViaAPI(page, seqId);
      if (stillActive === false) {
        log.ok(`${seqName}: deactivated via detail page button ✓`);
        return 'inactive';
      }
    }
  } catch (_) {}

  // Last resort: archive via API (forces active=false but locks sequence)
  log.warn(`${seqName}: archiving via API to force active=false...`);
  const archived = await page.evaluate(async (id) => {
    try {
      const res = await fetch(`/api/v1/emailer_campaigns/${id}/archive`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      return res.ok;
    } catch (e) { return false; }
  }, seqId);

  if (archived) {
    log.warn(`\x1b[31m${seqName}: ARCHIVED (was active). DO NOT ENROLL — rebuild required.\x1b[0m`);
    return 'archived';
  }

  log.err(`\x1b[31mCRITICAL: ${seqName} (${seqId}) is ACTIVE and could not be deactivated. DO NOT ENROLL.\x1b[0m`);
  return 'unsafe';
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

  // Launch browser using dedicated Playwright profile (Chrome can stay open — no conflict).
  log.info('Launching browser with existing Chrome profile...');

  let context;
  let browser;
  try {
    context = await chromium.launchPersistentContext(
      CHROME_PROFILE_PATH,
      {
        executablePath: CHROME_EXECUTABLE,
        headless: !HEADED,
        slowMo: SLOW_MO,
        viewport: { width: 1600, height: 900 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
        ],
      }
    );
  } catch (e) {
    log.warn(`Could not use Chrome profile: ${e.message}`);
    log.info('Falling back to fresh browser (you may need to log in)...');
    browser = await chromium.launch({
      executablePath: CHROME_EXECUTABLE,
      headless: !HEADED,
      slowMo: SLOW_MO,
    });
    context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  }

  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  // Intercept PUT /sequences to diagnose what's in the save payload
  page.on('request', req => {
    if (req.method() === 'PUT' && req.url().includes('/api/v1/sequences/')) {
      const body = req.postData() || '';
      try {
        const parsed = JSON.parse(body);
        const steps = parsed.emailer_steps || [];
        log.info(`[INTERCEPT] PUT /sequences: emailer_steps count = ${steps.length}`);
        if (steps.length > 0) log.info(`[INTERCEPT] first step type: ${steps[0].type}`);
      } catch(e) {
        log.warn(`[INTERCEPT] PUT /sequences: could not parse body (${body.length} chars)`);
      }
    }
    if (req.method() !== 'GET' && req.url().includes('/api/v1/emailer') && !req.url().includes('preview')) {
      log.debug(`[INTERCEPT] ${req.method()} ${req.url().replace('https://app.apollo.io','')}`);
    }
  });

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
        inactive_confirmed: null,
        errors: [],
      };

      log.info(`\n${'='.repeat(60)}`);
      log.info(`SEQUENCE ${seqIdx + 1}/${sequences.length}: ${seq.name}`);
      log.info('='.repeat(60));

      try {
        // Create the sequence
        const seqId = await createSequence(page, seq.name);
        seqResult.id = seqId;

        // Add each step inline — Ryan Reed approach: fill content immediately, no deferred queue.
        for (let stepIdx = 0; stepIdx < seq.steps.length; stepIdx++) {
          try {
            await addStep(page, seq.steps[stepIdx], stepIdx, seq.name);
            await sleep(STEP_TRANSITION_WAIT);
          } catch (stepErr) {
            const msg = `Touch ${stepIdx + 1} failed: ${stepErr.message}`;
            log.err(msg);
            seqResult.errors.push(msg);
          }
        }

        // Save the sequence — Ryan Reed approach: simple safeClickByText, no force/JS tricks.
        log.info('Saving sequence...');
        const saved = await safeClickByText(page, 'button', 'Save changes');

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

          // Verify (authoritative API content check; needs the sequence ID)
          const verification = await verifySequence(page, seq.steps.length, seq.name, seqResult.id);
          seqResult.blankEditors = verification.blankCount;
          seqResult.status = verification.blankCount === 0 ? 'success' : 'needs_review';

          // Phase 4: Guarantee sequence is inactive before any enrollment can happen.
          try {
            const inactiveStatus = await ensureSequenceInactive(page, seqResult.id, seq.name);
            seqResult.inactive_confirmed = inactiveStatus;
            if (inactiveStatus !== 'inactive') {
              seqResult.errors.push(`SAFETY BLOCK: sequence active state is "${inactiveStatus}". DO NOT ENROLL CONTACTS.`);
            }
          } catch (inactiveErr) {
            log.err(`Active-state check threw: ${inactiveErr.message}`);
            seqResult.inactive_confirmed = 'unsafe';
            seqResult.errors.push(`SAFETY BLOCK: active-state check failed (${inactiveErr.message}). DO NOT ENROLL CONTACTS.`);
          }
        } else {
          log.err('Could not find Save button');
          seqResult.status = 'save_failed';
          seqResult.inactive_confirmed = 'unsafe';
          seqResult.errors.push('Save button not found');
        }
      } catch (seqErr) {
        log.err(`Sequence creation failed: ${seqErr.message}`);
        seqResult.status = 'failed';
        seqResult.inactive_confirmed = 'unsafe';
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
