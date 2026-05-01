#!/usr/bin/env node
/**
 * Targeted Touch 1 prefill using Apollo's search box to find each contact.
 * Fallback for when the task queue has many rows and scrolling misses the targets.
 *
 * Usage: HEADED=true node prefill-search.js LlamaIndex_sequences.json
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const HEADED   = process.env.HEADED === 'true';
const DEBUG    = process.env.DEBUG  === 'true';
const APOLLO_BASE      = 'https://app.apollo.io';
const ASSIGNEE_NAME    = process.env.ASSIGNEE_NAME || 'AE_NAME';
const STATE_FILE       = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const log = {
  info:    (msg) => console.log(`\x1b[36m[INFO]\x1b[0m  ${msg}`),
  ok:      (msg) => console.log(`\x1b[32m[OK]\x1b[0m    ${msg}`),
  warn:    (msg) => console.log(`\x1b[33m[WARN]\x1b[0m  ${msg}`),
  err:     (msg) => console.log(`\x1b[31m[ERR]\x1b[0m   ${msg}`),
  debug:   (msg) => { if (DEBUG) console.log(`\x1b[90m[DBG]\x1b[0m   ${msg}`); },
  contact: (name, msg) => console.log(`\x1b[35m[${name}]\x1b[0m ${msg}`),
};

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function screenshot(page, label) {
  try {
    const p = `/tmp/prefill-search-${label}-${Date.now()}.png`;
    await page.screenshot({ path: p, fullPage: true });
    log.warn(`Screenshot: ${p}`);
  } catch (_) {}
}

function textToLines(text) {
  return text.split('\n').map(l => l.trim());
}

async function injectEmailContent(page, contact) {
  const name = `${contact.first_name} ${contact.last_name}`.trim();

  // Subject
  if (contact.touch1_subject) {
    const subjectSelectors = [
      'input[placeholder="Enter email subject"]',
      'input[placeholder*="subject" i]',
      'input[name*="subject" i]',
      'input[aria-label*="subject" i]',
    ];
    let subjectOk = false;
    for (const sel of subjectSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click({ timeout: 3000 });
          await page.keyboard.press('Meta+a');
          await page.keyboard.press('Delete');
          await sleep(200);
          await page.keyboard.type(contact.touch1_subject, { delay: 20 });
          await sleep(200);
          log.contact(name, `Subject typed: "${contact.touch1_subject}"`);
          subjectOk = true;
          break;
        }
      } catch (_) {}
    }
    if (!subjectOk) log.warn(`${name}: subject input not found`);
  }

  // Body — clipboard paste into Quill
  if (contact.touch1_body) {
    try {
      await page.waitForSelector('.ql-editor', { timeout: 8000 });
    } catch (_) {
      log.warn(`${name}: .ql-editor not visible after 8s`);
      return false;
    }

    // Click first editor (not the preview panel)
    const firstEditor = page.locator('.ql-editor').first();
    if (await firstEditor.isVisible({ timeout: 3000 })) {
      await firstEditor.click({ timeout: 3000 });
      await sleep(300);
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Delete');
      await sleep(300);
    }

    // Write to clipboard and paste
    try {
      await page.evaluate(async (text) => {
        await navigator.clipboard.writeText(text);
      }, contact.touch1_body);
      await sleep(200);

      await firstEditor.click({ timeout: 3000 });
      await sleep(200);
      await page.keyboard.press('Meta+v');
      await sleep(800);

      const charCount = await page.evaluate(() => {
        const eds = document.querySelectorAll('.ql-editor');
        return eds.length > 0 ? eds[0].innerText.trim().length : 0;
      });

      if (charCount > 20) {
        log.contact(name, `Body pasted (${charCount} chars)`);
        return true;
      } else {
        log.warn(`${name}: clipboard paste yielded ${charCount} chars`);
        return false;
      }
    } catch (e) {
      log.warn(`${name}: paste error: ${e.message}`);
      return false;
    }
  }

  return true;
}

async function saveTask(page, name) {
  const candidates = ['Save as draft', 'Save draft', 'Save task', 'Save', 'Done'];
  for (const text of candidates) {
    try {
      const btns = page.locator(`button:has-text("${text}")`);
      const count = await btns.count();
      for (let i = 0; i < count; i++) {
        const btn = btns.nth(i);
        const btnText = (await btn.innerText({ timeout: 1000 })).trim().toLowerCase();
        if (btnText.includes('send') || btnText.includes('activ')) continue;
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click({ timeout: 3000 });
          log.contact(name, `Saved task ("${text}")`);
          await sleep(1000);
          return true;
        }
      }
    } catch (_) {}
  }
  await page.keyboard.press('Escape').catch(() => {});
  log.warn(`${name}: no save button found — closed composer`);
  return false;
}

// Apply Task Assignee filter on the tasks page (uses ASSIGNEE_NAME env var).
// Must be called once after navigating to /#/tasks.
async function applyAssigneeFilter(page) {
  // Check if filter is already applied (look for the chip)
  const alreadyApplied = await page.locator(`text="${ASSIGNEE_NAME}"`).first()
    .isVisible({ timeout: 2000 }).catch(() => false);
  if (alreadyApplied) {
    log.info('Assignee filter already applied');
    return;
  }

  // Open filters panel if not open
  const filterBtn = page.locator('button:has-text("Show Filters"), button:has-text("Filters"), button:has-text("Hide Filters")').first();
  if (await filterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const btnText = (await filterBtn.innerText({ timeout: 1000 }).catch(() => '')).toLowerCase();
    if (btnText.includes('show')) {
      await filterBtn.click();
      await sleep(800);
    }
  }

  // Click "Task Assignee" section to expand it
  try {
    const assigneeSection = page.locator('text="Task Assignee"').first();
    if (await assigneeSection.isVisible({ timeout: 3000 })) {
      await assigneeSection.click();
      await sleep(600);
    }
  } catch (_) {}

  // Type assignee name in the search input
  // Apollo's Task Assignee input has placeholder "Specify owners..."
  try {
    const assigneeInput = page.locator(
      'input[placeholder*="owners" i], input[placeholder*="Specify owners" i], input[placeholder*="assignee" i], input[placeholder*="Search users" i], input[placeholder*="Search members" i]'
    ).first();
    if (await assigneeInput.isVisible({ timeout: 3000 })) {
      await assigneeInput.click();
      await page.keyboard.type(ASSIGNEE_NAME, { delay: 30 });
      await sleep(1500);
      // Click the matching option in the dropdown
      const option = page.locator(
        `[role="option"]:has-text("${ASSIGNEE_NAME.split(" ")[0]}"), li:has-text("${ASSIGNEE_NAME}"), [class*="option"]:has-text("${ASSIGNEE_NAME.split(" ")[0]}")`
      ).first();
      if (await option.isVisible({ timeout: 3000 })) {
        await option.click();
        await sleep(1000);
        log.info(`Applied Task Assignee = ${ASSIGNEE_NAME} filter`);
        return;
      }
      // Try pressing Enter if no dropdown appears
      await page.keyboard.press('Enter');
      await sleep(800);
      log.info('Applied assignee filter via Enter key');
      return;
    }
  } catch (_) {}

  // Fallback: try clicking any visible assignee option in a dropdown
  try {
    const option = page.locator(`[role="option"]:has-text("${ASSIGNEE_NAME.split(" ")[0]}"), li:has-text("${ASSIGNEE_NAME}"), button:has-text("${ASSIGNEE_NAME}")`).first();
    if (await option.isVisible({ timeout: 2000 })) {
      await option.click();
      await sleep(800);
      log.info('Applied assignee filter via fallback');
      return;
    }
  } catch (_) {}

  log.warn('Could not apply assignee filter — proceeding unfiltered');
}

async function fillContact(page, contact, isFirstContact) {
  const name = `${contact.first_name} ${contact.last_name}`.trim();
  const firstName = contact.first_name.trim();
  const lastName  = contact.last_name.trim();

  log.contact(name, 'Looking for task in queue...');

  // Navigate fresh to tasks page each time (ensures clean state)
  await page.goto(`${APOLLO_BASE}/#/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  // Apply assignee filter every time (it may reset on navigation)
  await applyAssigneeFilter(page);
  await sleep(1500);

  if (DEBUG) await screenshot(page, `tasks-${name.replace(/\s+/g, '_')}`);

  // Strategy 2: Find the contact row in the (now filtered) list.
  // Use specific task-row selectors — avoid plain `a` or `div` which may navigate to profile.
  const rowSelectors = [
    `tr:has(a:text-is("${firstName} ${lastName}"))`,
    `tr:has-text("${firstName} ${lastName}")`,
    `[class*="task-row"]:has-text("${firstName} ${lastName}")`,
    `[class*="task_row"]:has-text("${firstName} ${lastName}")`,
    `li:has-text("${firstName} ${lastName}")`,
    `td:has-text("${firstName} ${lastName}")`,
  ];

  let matchEl = null;
  for (const sel of rowSelectors) {
    try {
      const els = page.locator(sel);
      const count = await els.count();
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const el = els.nth(i);
          if (await el.isVisible({ timeout: 1500 })) {
            // Verify it actually contains the full name (avoid false positives)
            const text = await el.textContent({ timeout: 1000 }).catch(() => '');
            if (text.toLowerCase().includes(firstName.toLowerCase())) {
              matchEl = el;
              log.debug(`${name}: found via "${sel}"`);
              break;
            }
          }
        }
      }
      if (matchEl) break;
    } catch (_) {}
  }

  // Scroll down and try again if not found initially
  if (!matchEl) {
    log.debug(`${name}: not in initial view, scrolling...`);
    for (let scroll = 0; scroll < 10 && !matchEl; scroll++) {
      await page.evaluate(() => window.scrollBy(0, 300));
      await sleep(400);
      for (const sel of rowSelectors.slice(0, 4)) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 800 })) {
            const text = await el.textContent({ timeout: 500 }).catch(() => '');
            if (text.toLowerCase().includes(firstName.toLowerCase())) {
              matchEl = el;
              break;
            }
          }
        } catch (_) {}
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
  }

  if (!matchEl) {
    log.warn(`${name}: task row not found in queue`);
    if (DEBUG) await screenshot(page, `no-task-${name.replace(/\s+/g, '_')}`);
    return false;
  }

  // Click the task row — avoid clicking the contact name <a> link directly
  // (that navigates to the profile page). Click the row container instead,
  // or find a task action button within the row.
  log.contact(name, 'Opening task composer...');
  try {
    // Try to find an action button within the row (envelope icon, "Do task" button)
    let clickTarget = matchEl;
    try {
      // Look for a task-type icon or action button inside the row that opens composer
      const actionBtn = matchEl.locator(
        'button:not(:has-text("' + firstName + '")):not(:has-text("' + lastName + '")), ' +
        '[role="button"]:not(:has-text("' + firstName + '")):not(:has-text("' + lastName + '"))'
      ).first();
      const actionVisible = await actionBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (actionVisible) {
        clickTarget = actionBtn;
        log.debug(`${name}: clicking action button within row`);
      }
    } catch (_) {}

    await clickTarget.click({ timeout: 5000 });
    await sleep(2500);
  } catch (e) {
    log.warn(`${name}: click failed: ${e.message}`);
    return false;
  }

  // Verify composer opened
  const composerAppeared = await Promise.race([
    page.waitForSelector('.ql-editor', { timeout: 10000 }).then(() => true).catch(() => false),
    page.waitForSelector('input[placeholder*="subject" i]', { timeout: 10000 }).then(() => true).catch(() => false),
  ]);

  if (!composerAppeared) {
    log.warn(`${name}: composer did not appear`);
    if (DEBUG) await screenshot(page, `no-composer-${name.replace(/\s+/g, '_')}`);
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }

  if (DEBUG) await screenshot(page, `composer-${name.replace(/\s+/g, '_')}`);

  // Check for Template tab (Apollo may default to Assisted tab)
  try {
    const templateTab = page.getByText('Template', { exact: true }).last();
    if (await templateTab.isVisible({ timeout: 3000 })) {
      await templateTab.click({ timeout: 3000 });
      await sleep(1000);
      log.debug(`${name}: clicked Template tab`);
    }
  } catch (_) {}

  const ok = await injectEmailContent(page, contact);
  if (ok) {
    await sleep(500);
    const saved = await saveTask(page, name);
    if (saved) {
      log.ok(`${name}: Touch 1 pre-filled and saved`);
    } else {
      log.warn(`${name}: content injected but could not save`);
    }
    return true;
  } else {
    await screenshot(page, `inject-fail-${name.replace(/\s+/g, '_')}`);
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }
}

async function main() {
  const dataFile = process.argv[2];
  if (!dataFile) {
    console.log('Usage: HEADED=true node prefill-search.js <account>_sequences.json');
    process.exit(1);
  }

  const dataPath = path.resolve(dataFile);
  if (!fs.existsSync(dataPath)) { log.err(`File not found: ${dataPath}`); process.exit(1); }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Build unique contact list
  const seen = new Set();
  const allContacts = [];
  for (const seq of (data.sequences || [])) {
    for (const contact of (seq.contacts || [])) {
      if (!contact.touch1_body) continue;
      const key = contact.email || `${contact.first_name}_${contact.last_name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allContacts.push(contact);
    }
  }

  log.info(`Account:   ${data.account || '(unknown)'}`);
  log.info(`Contacts:  ${allContacts.length} to pre-fill`);
  log.info(`Headed:    ${HEADED} | Debug: ${DEBUG}`);

  if (!fs.existsSync(STATE_FILE)) {
    log.err(`Apollo session not found: ${STATE_FILE}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: !HEADED,
    slowMo: DEBUG ? 200 : 50,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    storageState: STATE_FILE,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const filled  = [];
  const failed  = [];

  try {
    // Verify login
    await page.goto(`${APOLLO_BASE}/#/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    const url = page.url();
    const isLoggedIn = !url.includes('/login') &&
      await page.locator('[class*="zp_"], nav, [role="navigation"]')
        .first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!isLoggedIn) {
      log.err('Not logged into Apollo. Run with HEADED=true to log in manually.');
      process.exit(1);
    }
    log.ok('Apollo login confirmed');
    console.log('');

    // Process each contact
    for (let ci = 0; ci < allContacts.length; ci++) {
      const contact = allContacts[ci];
      const ok = await fillContact(page, contact, ci === 0);
      const name = `${contact.first_name} ${contact.last_name}`.trim();
      if (ok) {
        filled.push(name);
      } else {
        failed.push(name);
      }
      await sleep(1000);
    }

  } catch (fatalErr) {
    log.err(`Fatal: ${fatalErr.message}`);
    console.error(fatalErr);
    await screenshot(page, 'fatal-error');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TOUCH 1 SEARCH-BASED PREFILL SUMMARY');
  console.log('='.repeat(60));
  console.log(`Account: ${data.account || '(unknown)'}`);
  console.log('');

  if (filled.length > 0) {
    console.log(`\x1b[32m✓ Pre-filled (${filled.length}):\x1b[0m`);
    for (const n of filled) console.log(`   • ${n}`);
  }

  if (failed.length > 0) {
    console.log(`\x1b[31m✗ Failed (${failed.length}):\x1b[0m`);
    for (const n of failed) console.log(`   • ${n}`);
    console.log('');
    console.log('\x1b[33mFix manually: Apollo > Tasks > Manual Emails >\x1b[0m');
    console.log('\x1b[33mopen each contact\'s task > paste Subject and Body > Save as draft\x1b[0m');
  }
}

main().catch((err) => {
  log.err(`Unhandled: ${err.message}`);
  process.exit(1);
});
