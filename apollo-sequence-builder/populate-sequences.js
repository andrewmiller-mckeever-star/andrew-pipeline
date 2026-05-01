#!/usr/bin/env node
/**
 * Populate existing YDC Usage V2 sequences with steps + content.
 * Sequences already exist (contacts enrolled) — this adds all 6 steps to each.
 *
 * APRIL 2026 UI FIX: clicks Template tab and clears AI placeholder chips
 * before injecting subject/body content.
 *
 * Usage: HEADED=true node populate-sequences.js
 */

const { chromium } = require('playwright');
const path = require('path');

const APOLLO_BASE = 'https://app.apollo.io';
const CHROME_USER_DATA = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');
const CHROME_PROFILE = 'Default';
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HEADED = process.env.HEADED !== 'false';
const DEFAULT_TIMEOUT = 30000;
const SENDER_NAME = process.env.SENDER_NAME || 'AE_NAME';

const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  ok:   (msg) => console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  err:  (msg) => console.log(`\x1b[31m[ERR]\x1b[0m  ${msg}`),
  step: (seq, t, msg) => console.log(`\x1b[35m[${seq}][T${t}]\x1b[0m ${msg}`),
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Sequence definitions — IDs from Apollo, content from JSON files
// ---------------------------------------------------------------------------
const SEQUENCES = [
  {
    name: 'Seq A: New Signup V2',
    id: '69e2b4d60fced700116e1eb8',
    steps: [
      {
        type: 'automatic_email',
        email_type: 'new_thread',
        subject: 'Getting started with the API',
        body: 'Hi {{first_name}},\n\nYou signed up for the You.com API recently. If you haven\'t had a chance to make your first call yet, a few things that cut the ramp time:\n\nThe quickstart guide walks through authentication and your first query in under 10 minutes. We also have an eval harness and free credits if you want to test at scale before committing to a plan.\n\nHappy to walk through it live if that\'s easier.\n\n' + SENDER_NAME + '\nYou.com',
      },
      {
        type: 'linkedin_connect',
        message: 'Your team\'s AI work creates new demands on the real-time data layer. Curious how you\'re thinking about that (be it with a web index or otherwise).',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nDropping these in case you haven\'t seen them:\n\nQuickstart guide: https://documentation.you.com/docs/quick-start\nAPI docs: https://documentation.you.com\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits are available if you want to push volume before a budget decision. Let me know if anything is blocking your first test.\n\n' + SENDER_NAME,
      },
      {
        type: 'phone_call',
        task_note: 'Hi {{first_name}}, this is ' + SENDER_NAME + ' from You.com. You signed up for the API recently and I wanted to quickly check in to see if you\'ve had a chance to make your first call. Do you have 90 seconds?',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nHappy to leave it here if the timing isn\'t right. The credits offer stands whenever you\'re ready.\n\n' + SENDER_NAME,
      },
      {
        type: 'linkedin_message',
        message: 'Hey {{first_name}}, sent a few notes over email. Happy to help you get your first test running if that\'s useful.',
      },
    ],
  },
  {
    name: 'Seq B: Active Tester V2',
    id: '69e2b603c499b600211c53a1',
    steps: [
      {
        type: 'automatic_email',
        email_type: 'new_thread',
        subject: '{{company}} + You.com',
        body: 'Hi {{first_name}},\n\nYour team has been active on the API this week. That level of usage usually means a few things are working and a few are starting to create friction — freshness, citation quality, or snippet depth.\n\nIf any of those have come up, happy to dig in. We also have an eval harness and free credits if you want to stress-test at higher volume.\n\nWorth a quick sync?\n\n' + SENDER_NAME + '\nYou.com',
      },
      {
        type: 'linkedin_connect',
        message: 'Your team\'s API usage signals something real is being built. Curious what the data layer looks like underneath (be it with a web index or otherwise).',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nA few things useful at this stage:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits available if you need to scale testing before a budget call.\n\n' + SENDER_NAME,
      },
      {
        type: 'phone_call',
        task_note: 'Hi {{first_name}}, this is ' + SENDER_NAME + ' from You.com. I saw your team has been active on the API and wanted to check in quickly to see how testing is going. Do you have 90 seconds?',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nLast note from me. If you want to talk through the infrastructure or see how other teams are using this at scale, happy to connect.\n\n' + SENDER_NAME,
      },
      {
        type: 'linkedin_message',
        message: 'Hey {{first_name}}, sent a few notes over email. If there\'s a specific thing you\'re trying to test or a question I can answer, happy to help.',
      },
    ],
  },
  {
    name: 'Seq C: Stalled Tester V2',
    id: '69e2b7b6da9bdd00198f3b3c',
    steps: [
      {
        type: 'automatic_email',
        email_type: 'new_thread',
        subject: 'Still evaluating?',
        body: 'Hi {{first_name}},\n\nYour team was active on the API a few weeks ago and then went quiet. That usually means the eval surfaced something, a comparison is running, or the project paused.\n\nIf something came up in testing, happy to dig into it.\n\n' + SENDER_NAME + '\nYou.com',
      },
      {
        type: 'linkedin_connect',
        message: 'Your team\'s API testing a few weeks back raised some interesting questions. Curious where things landed (be it with a web index or otherwise).',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nIn case it helps with wherever the eval stands:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits available if you want to run a side-by-side or pick up where you left off.\n\n' + SENDER_NAME,
      },
      {
        type: 'phone_call',
        task_note: 'Hi {{first_name}}, this is ' + SENDER_NAME + ' from You.com. I saw your team was testing the API a few weeks back and wanted to check in quickly to see how it went. Do you have 90 seconds?',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nLeaving it here. If the eval reopens, you know where to find me.\n\n' + SENDER_NAME,
      },
      {
        type: 'linkedin_message',
        message: 'Hey {{first_name}}, sent a few notes over email. If the eval is back on the table, happy to help.',
      },
    ],
  },
  {
    name: 'Seq D: Customer New Signup V2',
    id: '69e2b8db3e1b060011050c00',
    steps: [
      {
        type: 'automatic_email',
        email_type: 'new_thread',
        subject: 'You.com API — welcome',
        body: 'Hi {{first_name}},\n\nYou recently signed up for the You.com API. You may or may not know, but {{company}} is already a customer of ours.\n\nI\'m ' + SENDER_NAME + ', your point of contact here. Quick question — are you part of the team at {{company}} already using the API, or is this something you\'re exploring separately? Either way, happy to make sure you have what you need.\n\nWe also have additional credits available for customer teams who want to run more thorough tests.\n\n' + SENDER_NAME + '\nYou.com',
      },
      {
        type: 'linkedin_connect',
        message: '{{company}}\'s expanding API footprint raises some interesting questions about how the team is approaching data infrastructure. Curious how that\'s going.',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nA few things useful early on:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nAs a {{company}} team member, you also have access to additional credits for testing. Let me know how I can help.\n\n' + SENDER_NAME,
      },
      {
        type: 'phone_call',
        task_note: 'Hi {{first_name}}, this is ' + SENDER_NAME + ' from You.com. I noticed you recently signed up for the API. Since your company is already a customer of ours, I wanted to make sure you\'re connected to the right resources. Do you have 90 seconds?',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nHappy to leave it here. If you want to connect me with the right person at {{company}} or need anything on the API side, I\'m here.\n\n' + SENDER_NAME,
      },
      {
        type: 'linkedin_message',
        message: 'Hey {{first_name}}, sent a few notes over email. Happy to make sure you\'re connected to the right resources on our end.',
      },
    ],
  },
  {
    name: 'Seq E: Re-engagement V2',
    id: '69e2b924e6478900119b6d08',
    steps: [
      {
        type: 'automatic_email',
        email_type: 'new_thread',
        subject: 'Checking back in',
        body: 'Hi {{first_name}},\n\nWe connected before but it\'s been a while. I noticed your team has been back on the API recently and wanted to check in.\n\nWhere do things stand? Happy to pick up where we left off or start fresh depending on what\'s changed.\n\n' + SENDER_NAME + '\nYou.com',
      },
      {
        type: 'linkedin_connect',
        message: 'Your team\'s API usage has picked back up. Curious what\'s changed since we last connected (be it the use case or the timeline).',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nIn case anything has changed since we last spoke:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nFree credits available if the evaluation is back on the table.\n\n' + SENDER_NAME,
      },
      {
        type: 'phone_call',
        task_note: 'Hi {{first_name}}, this is ' + SENDER_NAME + ' from You.com. We spoke before — I saw your team is back on the API and wanted to check in quickly. Do you have 90 seconds?',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nLeaving it here. If the timing changes, you know where to find me.\n\n' + SENDER_NAME,
      },
      {
        type: 'linkedin_message',
        message: 'Hey {{first_name}}, sent a few notes over email. If things have changed on your end, happy to reconnect.',
      },
    ],
  },
  {
    name: 'Seq F: Customer Existing User V2',
    id: '69e2b970e65f230015249cc4',
    steps: [
      {
        type: 'automatic_email',
        email_type: 'new_thread',
        subject: 'You.com API — your point of contact',
        body: 'Hi {{first_name}},\n\nI noticed you\'ve been using the You.com API. Since {{company}} is one of our customers, I wanted to introduce myself — I\'m ' + SENDER_NAME + ', your point of contact here.\n\nIf there\'s anything you need — a deeper walk-through, help with a specific use case, or resources — I\'m here. We also have additional credits available for customer teams who want to test at higher volume.\n\nWhat are you building?\n\n' + SENDER_NAME + '\nYou.com',
      },
      {
        type: 'linkedin_connect',
        message: '{{company}}\'s API usage is creating some interesting questions about data infrastructure at scale. Curious what you\'re building with it.',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nA few things in case they\'re useful:\n\nAPI docs: https://documentation.you.com\nQuickstart: https://documentation.you.com/docs/quick-start\nEval harness: https://github.com/youcom/eval-harness\n\nAs a {{company}} customer, you have access to additional credits for broader testing. Let me know how I can help.\n\n' + SENDER_NAME,
      },
      {
        type: 'phone_call',
        task_note: 'Hi {{first_name}}, this is ' + SENDER_NAME + ' from You.com. Since your company is a customer of ours, I wanted to reach out and introduce myself as your point of contact. Do you have 90 seconds?',
      },
      {
        type: 'automatic_email',
        email_type: 'reply',
        body: 'Hi {{first_name}},\n\nLast note. If there\'s ever a question or you want to connect with someone deeper on the technical side, happy to make that happen.\n\n' + SENDER_NAME,
      },
      {
        type: 'linkedin_message',
        message: 'Hey {{first_name}}, sent a few notes over email. Happy to be a resource on the API side whenever it\'s useful.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function textToQuillHtml(text) {
  return text.split('\n').map(line => {
    const t = line.trim();
    if (!t) return '<div><br></div>';
    return `<div>${t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}</div>`;
  }).join('');
}

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
  try {
    const closes = page.locator('button[aria-label="Close alert"]');
    const n = await closes.count();
    for (let i = 0; i < n; i++) {
      try { await closes.nth(0).click({ timeout: 1000 }); await sleep(300); } catch (_) {}
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Add a step via the step type menu
// ---------------------------------------------------------------------------
const STEP_TYPE_LABELS = {
  automatic_email:       'Automatic email',
  manual_email:          'Manual email',
  phone_call:            'Phone call',
  linkedin_connect:      'LinkedIn - send connection request',
  linkedin_message:      'LinkedIn - send message',
  linkedin_view_profile: 'LinkedIn - view profile',
  action_item:           'Action item',
};

async function clickAddStep(page) {
  for (const sel of ['text="Add a step"', 'button:has-text("Add a step")', 'a:has-text("Add a step")']) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 4000 })) {
        await el.scrollIntoViewIfNeeded();
        await el.click();
        await sleep(1500);
        return;
      }
    } catch (_) {}
  }
  throw new Error('Could not find "Add a step" button');
}

async function selectStepType(page, label) {
  await sleep(500);
  const items = page.locator('div[role="menuitem"]');
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const text = (await items.nth(i).innerText().catch(() => '')).trim();
    if (text === label) {
      await items.nth(i).click();
      await sleep(2000);
      return;
    }
  }
  throw new Error(`Step type "${label}" not found in menu (${count} items)`);
}

// ---------------------------------------------------------------------------
// Configure email step
// APRIL 2026 UI CHANGE: Template tab + clear AI placeholder chips
// ---------------------------------------------------------------------------
async function configureEmailStep(page, step, seqName, touchNum) {
  await sleep(1500);

  // APRIL 2026 UI CHANGE: click Template tab before anything else
  let templateClicked = false;
  for (const sel of ['button:has-text("Template")', '[role="tab"]:has-text("Template")', 'text="Template"']) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 5000 })) {
        await el.click();
        templateClicked = true;
        log.step(seqName, touchNum, 'Template tab clicked');
        await sleep(1500);
        break;
      }
    } catch (_) {}
  }
  if (!templateClicked) {
    log.warn(`[${seqName}][T${touchNum}] Could not click Template tab`);
    await page.screenshot({ path: `/tmp/populate-${seqName.replace(/\s/g,'-')}-T${touchNum}-no-template.png`, fullPage: true }).catch(() => {});
  }

  // Set Reply type for reply emails
  if (step.email_type === 'reply') {
    try {
      const dropdown = page.locator('select').last();
      if (await dropdown.isVisible({ timeout: 2000 })) {
        await dropdown.selectOption({ label: 'Reply' });
        log.step(seqName, touchNum, 'Email type → Reply');
        await sleep(500);
      }
    } catch (_) {}
  }

  // Fill subject (new_thread only)
  if (step.subject && step.email_type !== 'reply') {
    for (const sel of ['input[placeholder*="subject" i]', 'input[name*="subject" i]', 'input']) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          // APRIL 2026 UI CHANGE: clear AI subject chip
          await el.press('Meta+A');
          await el.press('Delete');
          await sleep(200);
          await el.fill(step.subject);
          log.step(seqName, touchNum, `Subject: "${step.subject}"`);
          break;
        }
      } catch (_) {}
    }
  }

  // Inject body
  if (step.body) {
    await sleep(500);
    // APRIL 2026 UI CHANGE: click into editor and clear AI body chip
    try {
      const lastEditor = page.locator('.ql-editor').last();
      await lastEditor.click({ timeout: 3000 });
      await lastEditor.press('Meta+A');
      await lastEditor.press('Delete');
      await sleep(300);
    } catch (_) {}

    const htmlBody = textToQuillHtml(step.body);
    const result = await page.evaluate((html) => {
      const editors = document.querySelectorAll('.ql-editor');
      if (!editors.length) return { success: false, error: 'no editor' };
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
      return { success: true, charCount: target.innerText.trim().length };
    }, htmlBody);
    log.step(seqName, touchNum, `Body: ${JSON.stringify(result)}`);
    if (!result.success) {
      await page.screenshot({ path: `/tmp/populate-${seqName.replace(/\s/g,'-')}-T${touchNum}-body-fail.png`, fullPage: true }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Configure textarea steps (LinkedIn note/message)
// ---------------------------------------------------------------------------
async function configureTextareaStep(page, content, seqName, touchNum, fieldName) {
  if (!content) return;
  log.step(seqName, touchNum, `Filling ${fieldName}...`);

  try {
    await page.waitForSelector('textarea', { state: 'visible', timeout: 6000 });
  } catch (_) {}
  await sleep(300);

  const textareas = page.locator('textarea');
  const count = await textareas.count();

  // First pass: visible
  for (let i = count - 1; i >= 0; i--) {
    try {
      const ta = textareas.nth(i);
      if (await ta.isVisible({ timeout: 800 })) {
        await ta.click();
        await ta.fill(content);
        log.step(seqName, touchNum, `${fieldName} filled (textarea ${i})`);
        return;
      }
    } catch (_) {}
  }
  // Second pass: force
  for (let i = count - 1; i >= 0; i--) {
    try {
      const ta = textareas.nth(i);
      await ta.scrollIntoViewIfNeeded();
      await sleep(300);
      await ta.click({ force: true });
      await ta.fill(content);
      const val = await ta.inputValue();
      if (val.length > 0) {
        log.step(seqName, touchNum, `${fieldName} filled via force (textarea ${i})`);
        return;
      }
    } catch (_) {}
  }
  log.warn(`[${seqName}][T${touchNum}] Could not fill ${fieldName} — fill manually`);
}

// ---------------------------------------------------------------------------
// Save sequence
// ---------------------------------------------------------------------------
async function saveSequence(page, seqName) {
  for (const sel of ['button:has-text("Save changes")', 'button:has-text("Save")']) {
    try {
      const btn = page.locator(sel).last();
      if (await btn.isVisible({ timeout: 5000 })) {
        await btn.click();
        await sleep(2000);
        await dismissModals(page);
        await sleep(1000);
        log.ok(`[${seqName}] Saved`);
        return;
      }
    } catch (_) {}
  }
  log.warn(`[${seqName}] Save button not found`);
}

// ---------------------------------------------------------------------------
// Populate one sequence
// ---------------------------------------------------------------------------
async function populateSequence(page, seq) {
  log.info(`\n${'='.repeat(60)}`);
  log.info(`POPULATING: ${seq.name}`);
  log.info('='.repeat(60));

  // Navigate directly to sequence editor
  await page.goto(`${APOLLO_BASE}/#/sequences/${seq.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await dismissModals(page);

  // Verify we landed on the right page
  const url = page.url();
  if (!url.includes(seq.id)) {
    log.err(`[${seq.name}] Redirected away — skipping`);
    return { name: seq.name, status: 'redirect_fail' };
  }

  const errors = [];

  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i];
    const touchNum = i + 1;
    const label = STEP_TYPE_LABELS[step.type];
    if (!label) { log.warn(`Unknown step type: ${step.type}`); continue; }

    log.info(`  Touch ${touchNum}: ${label}`);

    try {
      await clickAddStep(page);
      await selectStepType(page, label);

      switch (step.type) {
        case 'automatic_email':
        case 'manual_email':
          await configureEmailStep(page, step, seq.name, touchNum);
          break;
        case 'phone_call':
          log.step(seq.name, touchNum, 'Phone call — task note filled manually');
          break;
        case 'linkedin_connect':
          await configureTextareaStep(page, step.message, seq.name, touchNum, 'connection note');
          break;
        case 'linkedin_message':
          await configureTextareaStep(page, step.message, seq.name, touchNum, 'LinkedIn message');
          break;
        case 'linkedin_view_profile':
          log.step(seq.name, touchNum, 'View profile — no content');
          break;
      }
      await sleep(1000);
    } catch (e) {
      const msg = `T${touchNum} failed: ${e.message}`;
      log.err(`[${seq.name}] ${msg}`);
      errors.push(msg);
      await page.screenshot({ path: `/tmp/populate-${seq.name.replace(/\s/g,'-')}-T${touchNum}-error.png`, fullPage: true }).catch(() => {});
    }
  }

  await saveSequence(page, seq.name);
  return { name: seq.name, status: errors.length === 0 ? 'success' : 'partial', errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log.info('YDC Usage V2 — Populating 6 sequences...');

  const context = await chromium.launchPersistentContext(
    path.join(CHROME_USER_DATA, CHROME_PROFILE),
    {
      executablePath: CHROME_EXECUTABLE,
      headless: false,
      slowMo: 80,
      viewport: { width: 1600, height: 900 },
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    }
  );

  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  try {
    await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const loggedIn = await page.locator('text="Sequences"').isVisible({ timeout: 5000 }).catch(() => false);
    if (!loggedIn) { log.err('Not logged in to Apollo'); await context.close(); process.exit(1); }
    log.ok('Apollo login confirmed');

    const results = [];
    for (const seq of SEQUENCES) {
      const result = await populateSequence(page, seq);
      results.push(result);
      await sleep(2000);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));
    for (const r of results) {
      const icon = r.status === 'success' ? '\x1b[32m[OK]\x1b[0m' : r.status === 'partial' ? '\x1b[33m[!!]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
      console.log(`${icon} ${r.name}`);
      if (r.errors && r.errors.length) r.errors.forEach(e => console.log(`     ERR: ${e}`));
    }
    console.log('\n\x1b[33mREMINDER: Phone call task notes must be filled manually in Apollo.\x1b[0m');
    console.log('\x1b[33mSequences remain INACTIVE — activate when ready.\x1b[0m');

  } catch (e) {
    log.err(`Fatal: ${e.message}`);
    await page.screenshot({ path: '/tmp/populate-fatal.png', fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}

main().catch(e => { log.err(e.message); process.exit(1); });
