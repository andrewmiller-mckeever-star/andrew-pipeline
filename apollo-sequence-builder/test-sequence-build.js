#!/usr/bin/env node
/**
 * Test sequence builder — validates the corrected Template-tab flow.
 * Run: HEADED=true node test-sequence-build.js
 */

const { chromium } = require('playwright');
const path = require('path');

const APOLLO_BASE = 'https://app.apollo.io';
const CHROME_USER_DATA = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');
const CHROME_PROFILE = 'Default';
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HEADED = process.env.HEADED !== 'false'; // headed by default for debugging
const DEFAULT_TIMEOUT = 30000;
const SENDER_NAME = process.env.SENDER_NAME || 'AE_NAME';

const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  ok:   (msg) => console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  err:  (msg) => console.log(`\x1b[31m[ERR]\x1b[0m  ${msg}`),
  step: (t, msg) => console.log(`\x1b[35m[Touch ${t}]\x1b[0m ${msg}`),
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Convert plain text to Quill-compatible HTML
function textToQuillHtml(text) {
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<div><br></div>';
    return `<div>${trimmed.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}</div>`;
  }).join('');
}

const TEST_STEPS = [
  {
    type: 'automatic_email',
    email_type: 'new_thread',
    subject: 'Getting started with the API',
    body: 'Hi {{first_name}},\n\nThis is a test T1 email body.\n\n' + SENDER_NAME + '\nYou.com',
  },
  {
    type: 'phone_call',
    task_note: 'Hi {{first_name}}, this is ' + SENDER_NAME + ' from You.com. Test call script. Do you have 90 seconds?',
  },
  {
    type: 'linkedin_connect',
    message: 'Test LinkedIn connection note — under 300 chars.',
  },
  {
    type: 'linkedin_message',
    message: 'Hey {{first_name}}, sent a few notes over email. Test LinkedIn message.',
  },
  {
    type: 'manual_email',
    email_type: 'reply',
    body: 'Hi {{first_name}},\n\nTest follow-up email body.\n\n' + SENDER_NAME,
  },
  {
    type: 'linkedin_view_profile',
  },
];

const STEP_TYPE_LABELS = {
  automatic_email:    'Automatic email',
  manual_email:       'Manual email',
  phone_call:         'Phone call',
  linkedin_connect:   'LinkedIn - send connection request',
  linkedin_message:   'LinkedIn - send message',
  linkedin_view_profile: 'LinkedIn - view profile',
  action_item:        'Action item',
};

// ---------------------------------------------------------------------------
// Dismiss any modal/banner that blocks interactions
// ---------------------------------------------------------------------------
async function dismissModals(page) {
  try {
    for (let i = 0; i < 3; i++) {
      const btns = page.locator('button:has-text("Confirm")');
      const n = await btns.count();
      if (n === 0) break;
      for (let j = n - 1; j >= 0; j--) {
        try {
          if (await btns.nth(j).isVisible({ timeout: 400 })) {
            await btns.nth(j).click({ timeout: 2000 });
            await sleep(500);
            break;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  // Close alert banners
  try {
    const closes = page.locator('button[aria-label="Close alert"]');
    const n = await closes.count();
    for (let i = 0; i < n; i++) {
      try { await closes.nth(0).click({ timeout: 1000 }); await sleep(300); } catch (_) {}
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Create the sequence shell and return its ID
// ---------------------------------------------------------------------------
async function createSequenceShell(page, name) {
  log.info(`Navigating to sequences list...`);
  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await dismissModals(page);

  // Click "Create sequence"
  let clicked = false;
  for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
    try {
      const btn = page.locator('button:has-text("Create sequence"), a:has-text("Create sequence")').first();
      if (await btn.isVisible({ timeout: 5000 })) {
        await btn.click();
        clicked = true;
        log.ok('Clicked "Create sequence"');
      }
    } catch (_) {}
    if (!clicked) { await sleep(2000); await dismissModals(page); }
  }
  if (!clicked) throw new Error('Could not find "Create sequence" button');
  await sleep(2500);

  // New UI: type picker — click "From scratch"
  try {
    const fromScratch = page.locator('h4:text-is("From scratch"), button:has-text("From scratch")').first();
    if (await fromScratch.isVisible({ timeout: 5000 })) {
      await fromScratch.click();
      log.ok('Clicked "From scratch"');
      await sleep(2000);

      // Fill sequence name
      const nameInput = page.getByRole('textbox').first();
      if (await nameInput.isVisible({ timeout: 3000 })) {
        await nameInput.click();
        await nameInput.selectText().catch(() => {});
        await nameInput.fill(name);
        log.ok(`Filled name: ${name}`);
      }
      await sleep(500);

      // Click Create
      const createBtn = page.getByRole('button', { name: 'Create', exact: true });
      await createBtn.click({ timeout: 10000 });
      log.ok('Clicked Create');
      await sleep(3000);
    }
  } catch (e) {
    log.warn(`From scratch flow issue: ${e.message}`);
  }

  const url = page.url();
  const match = url.match(/sequences\/([a-f0-9]+)/);
  const id = match ? match[1] : null;
  log.info(`Sequence ID: ${id || 'unknown'} | URL: ${url}`);
  return id;
}

// ---------------------------------------------------------------------------
// Add a single step via the "Add a step" button + step type menu
// ---------------------------------------------------------------------------
async function clickAddStep(page) {
  // "Add a step" button (may be text link or the "+ Add a step" in the editor)
  for (const sel of [
    'text="Add a step"',
    'button:has-text("Add a step")',
    'a:has-text("Add a step")',
    'button:has-text("Add step")',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await sleep(1500);
        log.info('Clicked "Add a step"');
        return true;
      }
    } catch (_) {}
  }
  throw new Error('Could not find "Add a step" button');
}

async function selectStepTypeFromMenu(page, label) {
  // Menu items are div[role="menuitem"] or li elements
  await sleep(500);
  const items = page.locator('div[role="menuitem"], li[role="menuitem"], [class*="menu"] li');
  const count = await items.count();
  log.info(`Found ${count} menu items, looking for "${label}"`);
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const text = (await item.innerText().catch(() => '')).trim();
    if (text === label) {
      await item.click();
      await sleep(2000);
      log.ok(`Selected: ${label}`);
      return;
    }
  }
  throw new Error(`Step type "${label}" not found in menu`);
}

// ---------------------------------------------------------------------------
// Configure email step: Template tab + clear AI chips + fill subject + body
// APRIL 2026 UI CHANGE: Apollo now defaults to "Assisted" tab and pre-seeds
// placeholder chips in subject and body. Must click Template and clear chips.
// ---------------------------------------------------------------------------
async function configureEmailStep(page, step, touchNum) {
  log.step(touchNum, 'Configuring email step — clicking Template tab...');
  await sleep(1500);

  // APRIL 2026 UI CHANGE: click Template tab before anything else
  let templateClicked = false;
  for (const sel of [
    'button:has-text("Template")',
    '[role="tab"]:has-text("Template")',
    'text="Template"',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 4000 })) {
        await el.click();
        templateClicked = true;
        log.step(touchNum, 'Template tab clicked');
        await sleep(1500);
        break;
      }
    } catch (_) {}
  }
  if (!templateClicked) {
    log.warn(`Touch ${touchNum}: Could not click Template tab`);
    await page.screenshot({ path: `/tmp/test-seq-touch${touchNum}-no-template-tab.png`, fullPage: true }).catch(() => {});
  }

  // Set Reply dropdown (for reply-type emails)
  if (step.email_type === 'reply') {
    try {
      const dropdown = page.locator('select').last();
      if (await dropdown.isVisible({ timeout: 2000 })) {
        await dropdown.selectOption({ label: 'Reply' });
        log.step(touchNum, 'Email type set to Reply');
        await sleep(500);
      }
    } catch (_) {}
  }

  // Fill subject (new_thread only)
  if (step.subject && step.email_type !== 'reply') {
    log.step(touchNum, `Filling subject: "${step.subject}"`);
    for (const sel of [
      'input[placeholder*="subject" i]',
      'input[name*="subject" i]',
      'input',
    ]) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          // APRIL 2026 UI CHANGE: clear AI placeholder chip before filling
          await el.press('Meta+A');
          await el.press('Delete');
          await sleep(200);
          await el.fill(step.subject);
          log.step(touchNum, 'Subject filled');
          break;
        }
      } catch (_) {}
    }
  }

  // Inject body
  if (step.body) {
    log.step(touchNum, 'Injecting email body...');
    await sleep(500);

    // APRIL 2026 UI CHANGE: click into editor and clear AI body chip first
    try {
      const lastEditor = page.locator('.ql-editor').last();
      await lastEditor.click();
      await lastEditor.press('Meta+A');
      await lastEditor.press('Delete');
      await sleep(300);
    } catch (_) {}

    const htmlBody = textToQuillHtml(step.body);
    const result = await page.evaluate((html) => {
      const editors = document.querySelectorAll('.ql-editor');
      if (editors.length === 0) return { success: false, error: 'no .ql-editor found' };
      let target = null;
      for (let i = editors.length - 1; i >= 0; i--) {
        const r = editors[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { target = editors[i]; break; }
      }
      if (!target) return { success: false, error: 'no visible editor' };
      target.focus();
      target.innerHTML = html;
      target.classList.remove('ql-blank');
      target.dispatchEvent(new Event('focus', { bubbles: true }));
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new Event('blur', { bubbles: true }));
      return { success: true, charCount: target.innerText.trim().length, totalEditors: editors.length };
    }, htmlBody);

    log.step(touchNum, `Body injection result: ${JSON.stringify(result)}`);
    if (!result.success) {
      await page.screenshot({ path: `/tmp/test-seq-touch${touchNum}-body-fail.png`, fullPage: true }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Configure non-email steps (textarea-based)
// ---------------------------------------------------------------------------
async function configureTextareaStep(page, content, touchNum, fieldName) {
  if (!content) return;
  log.step(touchNum, `Filling ${fieldName}...`);

  // Wait for a textarea to appear (step panel renders async)
  try {
    await page.waitForSelector('textarea', { state: 'visible', timeout: 8000 });
  } catch (_) {
    log.warn(`Touch ${touchNum}: textarea did not appear within 8s`);
  }
  await sleep(500);

  const textareas = page.locator('textarea');
  const count = await textareas.count();
  log.step(touchNum, `Found ${count} textarea(s)`);

  // First pass: visible textareas
  for (let i = count - 1; i >= 0; i--) {
    try {
      const ta = textareas.nth(i);
      if (await ta.isVisible({ timeout: 1000 })) {
        await ta.click();
        await ta.fill(content);
        log.step(touchNum, `${fieldName} filled (textarea ${i})`);
        return;
      }
    } catch (_) {}
  }
  // Second pass: scroll into view + force click (handles collapsed step cards)
  log.step(touchNum, 'No visible textarea — trying scroll+force on all textareas...');
  for (let i = count - 1; i >= 0; i--) {
    try {
      const ta = textareas.nth(i);
      await ta.scrollIntoViewIfNeeded();
      await sleep(500);
      await ta.click({ force: true });
      await ta.fill(content);
      const val = await ta.inputValue();
      if (val.length > 0) {
        log.step(touchNum, `${fieldName} filled via force-click (textarea ${i})`);
        return;
      }
    } catch (_) {}
  }
  log.warn(`Touch ${touchNum}: Could not fill textarea for ${fieldName}`);
  await page.screenshot({ path: `/tmp/test-seq-touch${touchNum}-textarea-fail.png`, fullPage: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Save the sequence
// ---------------------------------------------------------------------------
async function saveSequence(page) {
  log.info('Saving sequence...');
  for (const sel of ['button:has-text("Save changes")', 'button:has-text("Save")']) {
    try {
      const btn = page.locator(sel).last();
      if (await btn.isVisible({ timeout: 5000 })) {
        await btn.click();
        await sleep(2000);
        // Dismiss any post-save confirmation modal
        await dismissModals(page);
        await sleep(1000);
        log.ok('Saved');
        return;
      }
    } catch (_) {}
  }
  log.warn('Save button not found');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log.info('Starting test sequence build (HEADED mode)...');

  const context = await chromium.launchPersistentContext(
    path.join(CHROME_USER_DATA, CHROME_PROFILE),
    {
      executablePath: CHROME_EXECUTABLE,
      headless: false,
      slowMo: 100,
      viewport: { width: 1600, height: 900 },
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    }
  );

  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  try {
    // Verify login
    await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const loggedIn = await page.locator('text="Sequences"').isVisible({ timeout: 5000 }).catch(() => false);
    if (!loggedIn) { log.err('Not logged in to Apollo'); await context.close(); process.exit(1); }
    log.ok('Apollo login confirmed');

    // Create sequence shell
    await createSequenceShell(page, 'Test Sequence');
    await sleep(2000);
    await dismissModals(page);

    // Add each step
    for (let i = 0; i < TEST_STEPS.length; i++) {
      const step = TEST_STEPS[i];
      const touchNum = i + 1;
      const label = STEP_TYPE_LABELS[step.type];
      if (!label) { log.warn(`Unknown step type: ${step.type}`); continue; }

      log.info(`\n--- Touch ${touchNum}: ${label} ---`);

      await clickAddStep(page);
      await selectStepTypeFromMenu(page, label);

      switch (step.type) {
        case 'automatic_email':
        case 'manual_email':
          await configureEmailStep(page, step, touchNum);
          break;
        case 'phone_call':
          // Click the step card title to expand the task note panel
          try {
            await page.locator('text="Phone call"').last().click({ timeout: 3000 });
            await sleep(1000);
          } catch (_) {}
          await configureTextareaStep(page, step.task_note, touchNum, 'call script');
          break;
        case 'linkedin_connect':
          await configureTextareaStep(page, step.message, touchNum, 'connection note');
          break;
        case 'linkedin_message':
          await configureTextareaStep(page, step.message, touchNum, 'LinkedIn message');
          break;
        case 'linkedin_view_profile':
          log.step(touchNum, 'View profile — no content to fill');
          break;
      }

      await sleep(1500);
    }

    // Save
    await saveSequence(page);
    log.ok('\nTest sequence built. Check Apollo to verify all steps have content.');
    log.info('Browser left open for inspection. Close it manually when done.');

    // Keep browser open for inspection
    await sleep(60000);

  } catch (e) {
    log.err(`Fatal: ${e.message}`);
    await page.screenshot({ path: '/tmp/test-seq-fatal.png', fullPage: true }).catch(() => {});
    log.err('Screenshot: /tmp/test-seq-fatal.png');
  } finally {
    await context.close();
  }
}

main().catch(e => { log.err(e.message); process.exit(1); });
