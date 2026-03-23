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
 * The script uses your existing Chrome profile for Apollo auth.
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

// Chrome profile path (macOS default). Reuses your existing Apollo session.
const CHROME_USER_DATA =
  process.env.CHROME_PROFILE ||
  path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');
const CHROME_PROFILE = process.env.CHROME_PROFILE_DIR || 'Default';

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

  // 5. Toast notifications
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

  // Navigate to sequences page and wait for Apollo's SPA to render
  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('button, [class*="zp_"]', { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  await dismissApolloUI(page);

  // Click "Create sequence"
  const created = await safeClickByText(page, 'button', 'Create sequence');
  if (!created) throw new Error('Could not find "Create sequence" button');
  await sleep(3000);

  // We're now on the "Let's draft a sequence" page.
  // First rename the title, THEN click "Do it manually" (which opens the step type menu).

  // Rename: click the title button (contains "New Sequence") to reveal the input
  try {
    const titleBtn = page.locator('button:has-text("New Sequence")').first();
    if (await titleBtn.isVisible({ timeout: 3000 })) {
      await titleBtn.click();
      await sleep(500);

      // Now an input with placeholder "Sequence name" should appear
      const titleInput = page.locator('input[placeholder="Sequence name"]');
      if (await titleInput.isVisible({ timeout: 3000 })) {
        await titleInput.fill(sequenceName);
        await page.keyboard.press('Enter');
        await sleep(500);
        log.ok(`Renamed sequence to: ${sequenceName}`);
      } else {
        // Fallback: try triple-click + type on the button area
        await titleBtn.click({ clickCount: 3 });
        await sleep(200);
        await page.keyboard.type(sequenceName, { delay: 15 });
        await page.keyboard.press('Enter');
        await sleep(500);
        log.ok(`Renamed sequence (fallback) to: ${sequenceName}`);
      }
    } else {
      log.warn('Could not find title button. Will need manual rename.');
    }
  } catch (e) {
    log.warn(`Title rename failed: ${e.message}. Continuing.`);
  }

  // Click "Do it manually" to skip AI builder.
  // This opens the step type picker menu. Touch 1's addStep() will pick from it.
  const manual = await safeClickByText(page, 'button', 'Do it manually');
  if (!manual) throw new Error('Could not find "Do it manually" button');
  await sleep(2000);
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

async function addStep(page, step, stepIndex, sequenceName) {
  const touchNum = stepIndex + 1;
  const typeLabel = STEP_TYPE_LABELS[step.type];
  if (!typeLabel) throw new Error(`Unknown step type: ${step.type}`);

  log.step(sequenceName, touchNum, `Adding ${typeLabel}...`);

  if (stepIndex === 0) {
    // Touch 1: The step type menu is already open from "Do it manually".
    // Just pick the type from the menu.
    log.step(sequenceName, touchNum, 'Selecting type from menu (opened by "Do it manually")...');
    await selectStepType(page, typeLabel);
  } else {
    // Touch 2+: Scroll down and click "+ Add a step" to open the menu, then pick type.
    const addBtn = page.locator('text="Add a step"').last();
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ timeout: DEFAULT_TIMEOUT });
    await sleep(1500);
    await selectStepType(page, typeLabel);
  }

  // Wait for the step editor to fully render
  await sleep(2000);

  // Now configure the step based on type
  switch (step.type) {
    case 'automatic_email':
    case 'manual_email':
      await configureEmailStep(page, step, touchNum, sequenceName);
      break;
    case 'phone_call':
      await configurePhoneStep(page, step, touchNum, sequenceName);
      break;
    case 'linkedin_connect':
      await configureLinkedInConnectStep(page, step, touchNum, sequenceName);
      break;
    case 'linkedin_message':
      await configureLinkedInMessageStep(page, step, touchNum, sequenceName);
      break;
    case 'action_item':
      await configureActionItemStep(page, step, touchNum, sequenceName);
      break;
  }

  log.ok(`Touch ${touchNum} (${typeLabel}) added successfully`);
}

async function configureEmailStep(page, step, touchNum, seqName) {
  // Set email type (New thread vs Reply)
  if (step.email_type === 'reply') {
    log.step(seqName, touchNum, 'Setting type to Reply...');
    try {
      // Click the Type combobox (div[role="combobox"] whose ID starts with "emailerSteps")
      const typeDropdown = page.locator('div[role="combobox"]:has-text("New thread")').last();
      if (await typeDropdown.isVisible({ timeout: 5000 })) {
        await typeDropdown.click();
        await sleep(500);
        // Select "Reply" from the listbox options (div[role="option"])
        const replyOption = page.locator('div[role="option"]:has-text("Reply")').first();
        await replyOption.click({ timeout: 3000 });
        await sleep(500);
        log.step(seqName, touchNum, 'Type set to Reply');
      } else {
        log.warn('Type dropdown not visible. May already be set to Reply or needs manual fix.');
      }
    } catch (e) {
      log.warn(`Could not set Reply type: ${e.message}. May need manual fix.`);
    }
  }

  // Set subject (only for new thread emails, Touch 1)
  if (step.subject && step.email_type !== 'reply') {
    log.step(seqName, touchNum, 'Filling subject...');
    try {
      // Apollo uses input[placeholder="Enter email subject"] for the subject field
      const subjectInput = page.locator('input[placeholder="Enter email subject"]').last();
      await subjectInput.waitFor({ state: 'visible', timeout: 10000 });
      await subjectInput.click();
      await subjectInput.fill(step.subject);
      log.step(seqName, touchNum, `Subject: "${step.subject}"`);
    } catch (e) {
      log.warn(`Subject fill failed: ${e.message}`);
    }
  }

  // Inject email body via Quill editor DOM manipulation
  if (step.body) {
    log.step(seqName, touchNum, 'Injecting email body via Quill editor...');

    // Convert plain text body to HTML divs (preserving paragraph structure)
    const htmlBody = textToQuillHtml(step.body);

    // Inject into the last visible .ql-editor (the newly added step's editor)
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
      // Retry once after a short wait
      await sleep(2000);
      const retry = await page.evaluate((html) => {
        const editors = document.querySelectorAll('.ql-editor');
        if (editors.length === 0) return { success: false, error: 'Still no .ql-editor' };
        const editor = editors[editors.length - 1];
        editor.innerHTML = html;
        editor.classList.remove('ql-blank');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          success: true,
          charCount: editor.innerText.trim().length,
          isBlank: editor.classList.contains('ql-blank'),
        };
      }, htmlBody);

      if (!retry.success) {
        throw new Error(`Body injection failed after retry: ${retry.error}`);
      }
      log.step(seqName, touchNum, `Body injected on retry (${retry.charCount} chars)`);
    } else if (injected.charCount === 0 || injected.isBlank) {
      log.err(`Body appears blank after injection (charCount: ${injected.charCount})`);
      throw new Error('Body blank after injection');
    } else {
      log.step(seqName, touchNum, `Body injected (${injected.charCount} chars)`);
    }
  }
}

async function configurePhoneStep(page, step, touchNum, seqName) {
  if (step.task_note) {
    log.step(seqName, touchNum, 'Filling call script...');
    try {
      const noteArea = page.locator('textarea[placeholder*="Ask prospects" i], textarea[placeholder*="task" i]').last();
      await noteArea.waitFor({ state: 'visible', timeout: 5000 });
      await noteArea.click();
      await noteArea.fill(step.task_note);
      log.step(seqName, touchNum, 'Call script filled');
    } catch (e) {
      log.warn(`Task note fill failed: ${e.message}. Trying alternative selector...`);
      // Fallback: look for any visible textarea in the step
      try {
        const fallbackTextarea = page.locator('textarea').last();
        await fallbackTextarea.fill(step.task_note);
        log.step(seqName, touchNum, 'Call script filled (fallback)');
      } catch (e2) {
        log.err(`Call script completely failed: ${e2.message}`);
      }
    }
  }
}

async function configureLinkedInConnectStep(page, step, touchNum, seqName) {
  if (step.message) {
    log.step(seqName, touchNum, 'Filling LinkedIn connect note...');
    try {
      // LinkedIn connect note goes into a textarea
      const textarea = page.locator('textarea').last();
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
      await textarea.click();
      await textarea.fill(step.message);
      log.step(seqName, touchNum, `LinkedIn note filled (${step.message.length} chars)`);
    } catch (e) {
      log.warn(`LinkedIn note fill failed: ${e.message}`);
    }
  }
}

async function configureLinkedInMessageStep(page, step, touchNum, seqName) {
  // Same as connect but for InMail / message
  if (step.message) {
    try {
      const textarea = page.locator('textarea').last();
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
      await textarea.click();
      await textarea.fill(step.message);
      log.step(seqName, touchNum, `LinkedIn message filled (${step.message.length} chars)`);
    } catch (e) {
      log.warn(`LinkedIn message fill failed: ${e.message}`);
    }
  }
}

async function configureActionItemStep(page, step, touchNum, seqName) {
  if (step.task_note) {
    try {
      const textarea = page.locator('textarea').last();
      await textarea.fill(step.task_note);
      log.step(seqName, touchNum, 'Action item note filled');
    } catch (e) {
      log.warn(`Action item note failed: ${e.message}`);
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

  // Launch browser with existing Chrome profile for auth
  log.info('Launching browser with existing Chrome profile...');

  let context;
  let browser;

  // Use the real Chrome installation with existing profile (preserves Apollo login)
  const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  try {
    context = await chromium.launchPersistentContext(
      path.join(CHROME_USER_DATA, CHROME_PROFILE),
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
    context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
    });
  }

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

        // Add each step
        for (let stepIdx = 0; stepIdx < seq.steps.length; stepIdx++) {
          try {
            await addStep(page, seq.steps[stepIdx], stepIdx, seq.name);
            await sleep(STEP_TRANSITION_WAIT);
          } catch (stepErr) {
            const msg = `Touch ${stepIdx + 1} failed: ${stepErr.message}`;
            log.err(msg);
            seqResult.errors.push(msg);
            // Continue with remaining steps rather than aborting sequence
          }
        }

        // Save the sequence
        log.info('Saving sequence...');
        const saved = await safeClickByText(page, 'button', 'Save changes');
        if (saved) {
          await sleep(3000);

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
