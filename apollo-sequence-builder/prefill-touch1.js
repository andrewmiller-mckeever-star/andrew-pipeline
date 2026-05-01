#!/usr/bin/env node
/**
 * Apollo.io Touch 1 Pre-filler
 *
 * Activates enrolled sequences so Apollo generates Manual Email tasks, then
 * navigates the task queue and fills each contact's personalized Touch 1
 * subject + body from the sequences JSON.
 *
 * Handles any number of contacts per sequence (1:1 or 1:N).
 *
 * Touch 1 is a Manual Email — it will NOT auto-send after activation. The AE
 * reviews each pre-filled task in Apollo > Tasks and clicks Send individually.
 * Touches 2-7 auto-schedule only after each Touch 1 is sent.
 *
 * MODES:
 *   auto (default) — activate sequences via API, fill task queue, leave active
 *   tasks          — skip activation (sequences must already be active)
 *   template       — legacy: edits sequence step template directly.
 *                    Only correct when each sequence has exactly one enrolled
 *                    contact (1:1). Use for INACTIVE sequences when task queue
 *                    approach is unavailable.
 *
 * Usage:
 *   HEADED=true node prefill-touch1.js <account>_sequences.json
 *   DEBUG=true HEADED=true node prefill-touch1.js <data.json>
 *   MODE=tasks HEADED=true node prefill-touch1.js <data.json>
 *   MODE=template HEADED=true node prefill-touch1.js <data.json>
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const HEADED   = process.env.HEADED === 'true';
const DEBUG    = process.env.DEBUG  === 'true';
const MODE     = process.env.MODE   || 'auto'; // 'auto' | 'tasks' | 'template'
const SLOW_MO  = DEBUG ? 300 : 50;
const APOLLO_BASE      = 'https://app.apollo.io';
const DEFAULT_TIMEOUT  = 60000;

// Apollo session file — run save-apollo-session.js once to create this.
const STATE_FILE        = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
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
    const p = `/tmp/apollo-prefill-${label}-${Date.now()}.png`;
    await page.screenshot({ path: p, fullPage: true });
    log.warn(`Screenshot: ${p}`);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Text -> Quill HTML
// ---------------------------------------------------------------------------
function textToQuillHtml(text) {
  const lines = text.split('\n');
  let html = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      html += '<div><br></div>';
    } else {
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
// Build contact lookup map
// Returns Map: key -> contact entry
// Keys: "firstname lastname" (lowercase), "firstname", email
// ---------------------------------------------------------------------------
function buildContactMap(data) {
  const map = new Map();
  for (const seq of (data.sequences || [])) {
    for (const contact of (seq.contacts || [])) {
      if (!contact.touch1_body) continue;
      const entry = {
        touch1_subject: contact.touch1_subject || '',
        touch1_body:    contact.touch1_body,
        first_name:     contact.first_name || '',
        last_name:      contact.last_name  || '',
        email:          contact.email      || '',
        sequence:       seq.name,
        filled:         false,
      };
      const fullName  = `${contact.first_name} ${contact.last_name}`.toLowerCase().trim();
      const firstName = (contact.first_name || '').toLowerCase().trim();
      const emailKey  = (contact.email      || '').toLowerCase().trim();
      map.set(fullName, entry);
      if (firstName) map.set(firstName, entry);
      if (emailKey)  map.set(emailKey,  entry);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Build deduplicated list of unique contacts (by email) across all sequences
// ---------------------------------------------------------------------------
function uniqueContactList(data) {
  const seen = new Set();
  const contacts = [];
  for (const seq of (data.sequences || [])) {
    for (const contact of (seq.contacts || [])) {
      if (!contact.touch1_body) continue;
      const key = (contact.email || `${contact.first_name}_${contact.last_name}`).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push(contact);
    }
  }
  return contacts;
}

// ---------------------------------------------------------------------------
// Build sequence name -> contact map (template mode, 1:1 only)
// ---------------------------------------------------------------------------
function buildSeqContactMap(data) {
  const map = new Map();
  for (const seq of (data.sequences || [])) {
    if (!seq.contacts || seq.contacts.length === 0) continue;
    const contact = seq.contacts[0];
    if (!contact.touch1_body) continue;
    map.set(seq.name, {
      touch1_subject: contact.touch1_subject || '',
      touch1_body:    contact.touch1_body,
      first_name:     contact.first_name || '',
      last_name:      contact.last_name  || '',
      email:          contact.email      || '',
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Dismiss Apollo UI chrome: banners, modals, toasts, navigation guards.
// "Are you sure? Your changes will be lost" — click Confirm to proceed.
// ---------------------------------------------------------------------------
async function dismissApolloUI(page) {
  // Navigation guard: "Are you sure?" modal — click Confirm
  try {
    const confirmBtn = page.locator('button:has-text("Confirm")').first();
    if (await confirmBtn.isVisible({ timeout: 2000 })) {
      await confirmBtn.click({ timeout: 3000 });
      log.debug('Dismissed navigation guard (Confirm)');
      await sleep(800);
    }
  } catch (_) {}

  // Alert banners
  const alertBtns = page.locator('button[aria-label="Close alert"]');
  const n = await alertBtns.count();
  for (let i = 0; i < n; i++) {
    try { await alertBtns.nth(0).click({ timeout: 2000 }); await sleep(300); } catch (_) {}
  }

  // Generic modal close buttons
  try {
    const modalBtns = page.locator('[role="dialog"] button[aria-label*="close" i]');
    const mc = await modalBtns.count();
    for (let i = 0; i < mc; i++) {
      try { await modalBtns.nth(0).click({ timeout: 2000 }); await sleep(300); } catch (_) {}
    }
  } catch (_) {}

  // Toasts
  try {
    const toastBtns = page.locator('.redux-toastr button[class*="close"]');
    const tc = await toastBtns.count();
    for (let i = 0; i < tc; i++) {
      try { await toastBtns.nth(0).click({ timeout: 1000 }); } catch (_) {}
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Click the "Template" tab in the sequence step editor.
// APRIL 2026 UI CHANGE: Apollo defaults to "Assisted" tab. Only "Template"
// exposes raw Subject + Body fields for automation.
// ---------------------------------------------------------------------------
async function clickTemplateTab(page, name) {
  // Strategy 1: getByText — matches any element type
  try {
    const el = page.getByText('Template', { exact: true }).last();
    if (await el.isVisible({ timeout: 4000 })) {
      await el.click({ timeout: 3000 });
      await sleep(1200);
      const rawVisible = await page
        .locator('input[placeholder*="subject" i], .ql-editor')
        .first().isVisible({ timeout: 5000 }).catch(() => false);
      if (rawVisible) {
        log.contact(name, 'Template tab active — raw editor visible');
        return true;
      }
    }
  } catch (_) {}

  // Strategy 2: CSS fallbacks
  for (const sel of [
    'button:has-text("Template")',
    '[role="tab"]:has-text("Template")',
    '[class*="tab"]:has-text("Template")',
    'span:has-text("Template")',
    'div:has-text("Template")',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click({ timeout: 2000 });
        await sleep(1200);
        const rawVisible = await page
          .locator('input[placeholder*="subject" i], .ql-editor')
          .first().isVisible({ timeout: 5000 }).catch(() => false);
        if (rawVisible) {
          log.contact(name, `Template tab active via fallback: ${sel}`);
          return true;
        }
      }
    } catch (_) {}
  }

  log.warn(`${name}: Template tab not found — raw editor may not appear`);
  return false;
}

// ---------------------------------------------------------------------------
// Inject personalized subject + body into the open email composer.
//
// APRIL 2026 notes:
//   - Subject: keyboard.type() triggers React synthetic events (fill() does not)
//   - Body: clipboard paste fires Quill's paste handler which updates React state
//     (innerHTML injection only updates DOM — Apollo saves React state, not DOM)
//   - Clear any pre-seeded Apollo variable chips with Meta+A → Delete first
//   - Target editors[0] for body (editors.last() = preview panel on right side)
// ---------------------------------------------------------------------------
async function injectEmailContent(page, contact) {
  const name = `${contact.first_name} ${contact.last_name}`.trim();
  let subjectOk = false;
  let bodyOk    = false;

  // ── Subject ──────────────────────────────────────────────────────────────
  if (contact.touch1_subject) {
    const subjectSelectors = [
      'input[placeholder="Enter email subject"]',
      'input[placeholder*="subject" i]',
      'input[name*="subject" i]',
      'input[aria-label*="subject" i]',
    ];
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
  } else {
    subjectOk = true; // no subject needed (reply step)
  }

  // ── Body (clipboard paste into Quill) ────────────────────────────────────
  if (contact.touch1_body) {
    try {
      await page.waitForSelector('.ql-editor', { timeout: 8000 });
    } catch (_) {
      log.warn(`${name}: .ql-editor not visible after 8s`);
    }

    // Click the FIRST .ql-editor (Step 1 body / task composer body).
    // editors[last] = the preview panel on the right — do not target that one.
    try {
      const firstEditor = page.locator('.ql-editor').first();
      if (await firstEditor.isVisible({ timeout: 3000 })) {
        await firstEditor.click({ timeout: 3000 });
        await sleep(300);
        await page.keyboard.press('Meta+a');
        await page.keyboard.press('Delete');
        await sleep(300);
      }
    } catch (_) {}

    // Clipboard paste — fires Quill's paste handler and updates React state
    const plainBody = contact.touch1_body;
    let pastedOk = false;

    try {
      await page.evaluate(async (text) => {
        await navigator.clipboard.writeText(text);
      }, plainBody);
      await sleep(200);

      const firstEditor = page.locator('.ql-editor').first();
      await firstEditor.click({ timeout: 3000 });
      await sleep(200);
      await page.keyboard.press('Meta+v');
      await sleep(600);

      const charCount = await page.evaluate(() => {
        const eds = document.querySelectorAll('.ql-editor');
        return eds.length > 0 ? eds[0].innerText.trim().length : 0;
      });

      if (charCount > 20) {
        log.contact(name, `Body pasted (${charCount} chars)`);
        pastedOk = true;
      } else {
        log.warn(`${name}: clipboard paste yielded ${charCount} chars — trying innerHTML fallback`);
      }
    } catch (e) {
      log.warn(`${name}: clipboard paste error (${e.message}) — trying innerHTML fallback`);
    }

    // innerHTML fallback — less reliable for saving but better than nothing
    if (!pastedOk) {
      const htmlBody = textToQuillHtml(contact.touch1_body);
      const result = await page.evaluate((html) => {
        const eds = document.querySelectorAll('.ql-editor');
        if (eds.length === 0) return { success: false, error: 'no .ql-editor' };
        const ed = eds[0];
        ed.focus();
        ed.innerHTML = html;
        ed.classList.remove('ql-blank');
        ed.dispatchEvent(new Event('focus',  { bubbles: true }));
        ed.dispatchEvent(new Event('input',  { bubbles: true }));
        ed.dispatchEvent(new Event('change', { bubbles: true }));
        ed.dispatchEvent(new Event('blur',   { bubbles: true }));
        return { success: true, charCount: ed.innerText.trim().length };
      }, htmlBody);

      if (result.success && result.charCount > 20) {
        log.contact(name, `Body injected via innerHTML fallback (${result.charCount} chars)`);
        pastedOk = true;
      }
    }

    bodyOk = pastedOk;
    if (!bodyOk) log.warn(`${name}: body injection failed`);
  } else {
    bodyOk = true;
  }

  return subjectOk && bodyOk;
}

// ---------------------------------------------------------------------------
// Save a task in task queue mode. Never clicks Send.
// ---------------------------------------------------------------------------
async function saveTask(page, name) {
  const candidates = ['Save as draft', 'Save draft', 'Save task', 'Save', 'Done', 'Close'];
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
  // Try Escape to close the composer without sending
  try {
    await page.keyboard.press('Escape');
    await sleep(500);
  } catch (_) {}
  log.warn(`${name}: no save button found — closed composer`);
  return false;
}

// ---------------------------------------------------------------------------
// Save a sequence step in template mode. Never clicks Send or Activate.
// ---------------------------------------------------------------------------
async function saveSequenceStep(page, name) {
  const candidates = ['Save changes', 'Save step', 'Update step', 'Save', 'Done', 'Apply'];
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
          log.contact(name, `Saved step ("${text}")`);
          await sleep(1500);
          return true;
        }
      }
    } catch (_) {}
  }
  log.warn(`${name}: no save button found`);
  return false;
}

// ---------------------------------------------------------------------------
// ACTIVATE SEQUENCES
//
// Activates each sequence so Apollo generates Manual Email tasks in the
// task queue. Uses the browser session (no separate API key needed).
//
// Touch 1 is a Manual Email — it will NOT auto-send after activation.
// Touches 3 and 5 (automatic replies) gate on Touch 1 being sent, so they
// will not fire until the AE manually sends Touch 1 for each contact.
//
// Strategy: try Apollo REST API first (fast, no page navigation), then fall
// back to the sequence UI (click Activate button) if the API returns an error.
// ---------------------------------------------------------------------------
async function activateSequences(page, resultsData) {
  const activated = [];
  const alreadyActive = [];
  const failed = [];

  const sequences = (resultsData.sequences || []).filter(
    (s) => s.status === 'success' && s.id
  );

  if (sequences.length === 0) {
    log.warn('No successful sequences in results file — nothing to activate');
    return { activated, alreadyActive, failed };
  }

  log.info(`Activating ${sequences.length} sequence(s) via Apollo API...`);

  for (const seq of sequences) {
    log.info(`  Activating: ${seq.name}`);

    // ── Strategy 1: Apollo REST API via browser session cookies ──────────
    let apiSuccess = false;

    // Apollo typically uses PUT /api/v1/emailer_campaigns/{id} to update status.
    // The request rides the browser's existing auth cookies — no separate API key.
    const apiResult = await page.evaluate(async (seqId) => {
      const attempts = [
        // Standard Apollo sequence update endpoint
        {
          method: 'PUT',
          url: `/api/v1/emailer_campaigns/${seqId}`,
          body: JSON.stringify({ emailer_campaign: { active: true } }),
        },
        // Some Apollo versions use a dedicated activate endpoint
        {
          method: 'POST',
          url: `/api/v1/emailer_campaigns/${seqId}/activate`,
          body: null,
        },
        // Alternate path seen in some Apollo API versions
        {
          method: 'POST',
          url: `/api/v1/emailer_campaigns/${seqId}/start`,
          body: null,
        },
      ];

      for (const attempt of attempts) {
        try {
          const opts = {
            method: attempt.method,
            headers: {
              'Content-Type':  'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include',
          };
          if (attempt.body) opts.body = attempt.body;
          const resp = await fetch(attempt.url, opts);
          const text = await resp.text();
          if (resp.ok) {
            return { success: true, endpoint: attempt.url, status: resp.status, body: text.slice(0, 200) };
          }
          if (resp.status === 409 || (text && text.includes('already active'))) {
            return { success: true, alreadyActive: true, endpoint: attempt.url };
          }
        } catch (_) {}
      }
      return { success: false };
    }, seq.id);

    if (apiResult.success) {
      if (apiResult.alreadyActive) {
        log.ok(`  ${seq.name}: already active`);
        alreadyActive.push(seq.name);
      } else {
        log.ok(`  ${seq.name}: activated via API (${apiResult.endpoint})`);
        activated.push(seq.name);
      }
      apiSuccess = true;
    }

    // ── Strategy 2: UI fallback — navigate to sequence page, click Activate ─
    if (!apiSuccess) {
      log.warn(`  ${seq.name}: API activation failed — trying UI`);
      try {
        const url = `${APOLLO_BASE}/#/sequences/${seq.id}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(2000);
        await dismissApolloUI(page);
        await sleep(1000);

        // Look for activate toggle or button in various Apollo UI patterns
        const activateSelectors = [
          'button:has-text("Activate sequence")',
          'button:has-text("Activate")',
          'button:has-text("Enable")',
          'button:has-text("Start sequence")',
          // Status pill showing "Inactive" that you click to toggle
          '[class*="status"]:has-text("Inactive")',
          '[class*="badge"]:has-text("Inactive")',
          'span:has-text("Inactive")',
        ];

        let uiActivated = false;
        for (const sel of activateSelectors) {
          try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 3000 })) {
              await el.click({ timeout: 3000 });
              await sleep(1500);
              await dismissApolloUI(page); // confirm any dialog
              await sleep(1000);
              log.ok(`  ${seq.name}: activated via UI (${sel})`);
              activated.push(seq.name);
              uiActivated = true;
              break;
            }
          } catch (_) {}
        }

        if (!uiActivated) {
          // Check if it's already showing as active in the UI
          const isActive = await page.locator(
            '[class*="status"]:has-text("Active"), [class*="badge"]:has-text("Active")'
          ).first().isVisible({ timeout: 3000 }).catch(() => false);

          if (isActive) {
            log.ok(`  ${seq.name}: already active (detected via UI)`);
            alreadyActive.push(seq.name);
          } else {
            log.err(`  ${seq.name}: could not activate via API or UI`);
            await screenshot(page, `activate-fail-${seq.id}`);
            failed.push(seq.name);
          }
        }
      } catch (e) {
        log.err(`  ${seq.name}: UI activation error: ${e.message}`);
        failed.push(seq.name);
      }
    }

    await sleep(500);
  }

  const totalOk = activated.length + alreadyActive.length;
  log.info(`Activation complete: ${totalOk}/${sequences.length} active (${activated.length} newly activated, ${alreadyActive.length} already active, ${failed.length} failed)`);

  if (totalOk > 0) {
    log.info('Waiting for Apollo to generate Manual Email tasks...');
    await sleep(4000);
  }

  return { activated, alreadyActive, failed };
}

// ---------------------------------------------------------------------------
// TASK QUEUE MODE (primary)
//
// Navigates Apollo's task queue and fills each contact's Manual Email task
// with their personalized subject + body from the sequences JSON.
//
// Contact-first approach: for each contact we expect, find their task row in
// the queue by name match. This handles any number of contacts per sequence.
//
// Sequences must be ACTIVE before calling this (run activateSequences first,
// or pass MODE=tasks if sequences are already active).
// ---------------------------------------------------------------------------
async function fillTaskQueue(page, contactMap, allContacts) {
  const filled  = [];
  const skipped = [];
  const failed  = [];

  log.info('Navigating to Apollo Tasks...');
  await page.goto(`${APOLLO_BASE}/#/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await dismissApolloUI(page);
  await sleep(1000);

  if (DEBUG) await screenshot(page, 'tasks-loaded');

  // ── Try to filter to Manual Email tasks ──────────────────────────────────
  let filterApplied = false;
  try {
    const filterSelectors = [
      'button:has-text("Task type")',
      'button:has-text("Type")',
      '[aria-label*="task type" i]',
      'text="Filter by type"',
    ];
    for (const sel of filterSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          await sleep(600);
          const manualOption = page.locator(
            '[role="option"]:has-text("Manual email"), [role="menuitem"]:has-text("Manual email"), text="Manual email"'
          ).first();
          if (await manualOption.isVisible({ timeout: 3000 })) {
            await manualOption.click();
            await sleep(1200);
            log.info('Filtered task queue to Manual Email tasks');
            filterApplied = true;
          }
          break;
        }
      } catch (_) {}
    }
  } catch (_) {}

  if (!filterApplied) {
    log.debug('Task type filter not applied — processing all visible task rows');
  }

  await sleep(1500);

  // ── Contact-first: for each expected contact, find and fill their task ───
  // Rather than scanning all rows (fragile), we look for each contact by name.
  // Apollo's task row should contain the contact's full name as text.

  for (const contact of allContacts) {
    const name      = `${contact.first_name} ${contact.last_name}`.trim();
    const firstName = contact.first_name.trim();
    const lastName  = contact.last_name.trim();

    log.contact(name, 'Looking for task in queue...');

    // Scroll to top before searching each contact
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);

    // Find the task row containing this contact's name.
    // Apollo renders contact names as links in task rows.
    let taskRow = null;
    const rowSearchSelectors = [
      // Link with exact full name — most precise
      `a:has-text("${firstName} ${lastName}")`,
      // Any clickable element with the full name
      `[class*="task"]:has-text("${firstName} ${lastName}")`,
      // Row-level fallback
      `tr:has-text("${firstName} ${lastName}")`,
      `li:has-text("${firstName} ${lastName}")`,
      // First name only (less precise, used if above fail)
      `a:has-text("${firstName}")`,
    ];

    let matchEl = null;
    for (const sel of rowSearchSelectors) {
      try {
        const els = page.locator(sel);
        const count = await els.count();
        if (count > 0) {
          const el = els.first();
          if (await el.isVisible({ timeout: 2000 })) {
            matchEl = el;
            log.debug(`${name}: found via selector "${sel}" (${count} match(es))`);
            break;
          }
        }
      } catch (_) {}
    }

    // Also try scrolling down to find the row if not immediately visible
    if (!matchEl) {
      log.debug(`${name}: not visible in initial view — scrolling to find...`);
      for (let scroll = 0; scroll < 5 && !matchEl; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 400));
        await sleep(500);
        for (const sel of rowSearchSelectors.slice(0, 3)) {
          try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 1000 })) {
              matchEl = el;
              break;
            }
          } catch (_) {}
        }
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(300);
    }

    if (!matchEl) {
      log.warn(`${name}: task row not found in queue`);
      log.warn(`  Possible causes: sequence not yet active, task already completed, or different task filter`);
      failed.push(name);
      if (DEBUG) await screenshot(page, `no-task-${name.replace(/\s+/g, '_')}`);
      continue;
    }

    // Click the task row (or navigate up to the clickable row container)
    log.contact(name, 'Opening task...');
    try {
      // Try clicking the name element first — Apollo often opens the composer this way
      await matchEl.click({ timeout: 5000 });
      await sleep(2500);
    } catch (e) {
      log.warn(`${name}: click on task element failed: ${e.message}`);
      failed.push(name);
      continue;
    }

    // Verify the email composer opened
    const composerAppeared = await Promise.race([
      page.waitForSelector('.ql-editor', { timeout: 10000 }).then(() => true).catch(() => false),
      page.waitForSelector('input[placeholder*="subject" i]', { timeout: 10000 }).then(() => true).catch(() => false),
    ]);

    if (!composerAppeared) {
      log.warn(`${name}: email composer did not appear after clicking task`);
      if (DEBUG) await screenshot(page, `no-composer-${name.replace(/\s+/g, '_')}`);

      // Try pressing Escape and attempting via a different click target
      await page.keyboard.press('Escape');
      await sleep(500);
      failed.push(name);
      continue;
    }

    if (DEBUG) await screenshot(page, `composer-${name.replace(/\s+/g, '_')}`);

    // Inject personalized content
    const ok = await injectEmailContent(page, contact);

    if (ok) {
      await sleep(500);
      const saved = await saveTask(page, name);
      contact.filled = true;
      filled.push(name);
      if (saved) {
        log.ok(`${name}: Touch 1 pre-filled and saved`);
      } else {
        log.warn(`${name}: content injected but could not save — verify in Apollo`);
      }
    } else {
      await screenshot(page, `inject-fail-${name.replace(/\s+/g, '_')}`);
      await page.keyboard.press('Escape').catch(() => {});
      failed.push(name);
    }

    await sleep(1000);
  }

  // ── Check for any contacts we expected but didn't find ───────────────────
  for (const contact of allContacts) {
    const name = `${contact.first_name} ${contact.last_name}`.trim();
    if (!contact.filled && !filled.includes(name) && !failed.includes(name)) {
      skipped.push(name);
    }
  }

  return { filled, skipped, failed };
}

// ---------------------------------------------------------------------------
// TEMPLATE MODE (legacy, 1:1 only)
//
// For each sequence in results, navigates to its step editor and injects
// Touch 1 content directly into the sequence template. Works with INACTIVE
// sequences but only supports one enrolled contact per sequence.
//
// APRIL 2026: URL is /#/sequences/{id}, click Template tab, clear chips,
// use keyboard.type() for subject and clipboard paste for body.
// ---------------------------------------------------------------------------
async function fillSequenceTemplates(page, data, resultsData) {
  const filled  = [];
  const skipped = [];
  const failed  = [];

  const seqContactMap = buildSeqContactMap(data);

  for (const seqResult of (resultsData.sequences || [])) {
    if (seqResult.status !== 'success') {
      log.warn(`Seq "${seqResult.name}": status=${seqResult.status} — skipping`);
      skipped.push(seqResult.name);
      continue;
    }

    const contact = seqContactMap.get(seqResult.name);
    if (!contact) {
      log.warn(`Seq "${seqResult.name}": no contact data in JSON — skipping`);
      skipped.push(seqResult.name);
      continue;
    }

    const name = `${contact.first_name} ${contact.last_name}`.trim();
    console.log('');
    log.info(`--- ${name} | ${seqResult.name} ---`);

    const url = `${APOLLO_BASE}/#/sequences/${seqResult.id}`;
    log.info(`Navigating to: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2000);
      await dismissApolloUI(page);
      await sleep(2000);
      await dismissApolloUI(page);

      if (DEBUG) await screenshot(page, `seq-${seqResult.id}`);

      // Verify we're in the sequence editor
      const onEditor = await page.locator('button:has-text("Save changes")')
        .isVisible({ timeout: 10000 }).catch(() => false);

      if (!onEditor) {
        log.warn(`${name}: sequence editor did not load`);
        await screenshot(page, `no-editor-${seqResult.id}`);
        failed.push(name);
        continue;
      }

      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(500);

      const templateOk = await clickTemplateTab(page, name);
      if (!templateOk) {
        log.warn(`${name}: could not activate Template tab`);
        await screenshot(page, `no-template-${name.replace(/\s+/g, '_')}`);
        failed.push(name);
        continue;
      }

      if (DEBUG) await screenshot(page, `template-${name.replace(/\s+/g, '_')}`);

      const ok = await injectEmailContent(page, contact);
      if (ok) {
        await sleep(500);
        const saved = await saveSequenceStep(page, name);
        filled.push(name);
        if (saved) {
          log.ok(`${name}: Touch 1 template pre-filled and saved`);
        } else {
          log.warn(`${name}: content injected but save button not found`);
        }
      } else {
        await screenshot(page, `inject-fail-${name.replace(/\s+/g, '_')}`);
        failed.push(name);
      }

      await sleep(1000);

    } catch (e) {
      log.err(`${name}: ${e.message}`);
      failed.push(name);
      await screenshot(page, `error-${name.replace(/\s+/g, '_')}`);
    }
  }

  return { filled, skipped, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dataFile = process.argv[2];
  if (!dataFile) {
    console.log('');
    console.log('Usage: HEADED=true node prefill-touch1.js <account>_sequences.json');
    console.log('       DEBUG=true HEADED=true node prefill-touch1.js <data.json>');
    console.log('       MODE=tasks HEADED=true node prefill-touch1.js <data.json>     # skip activation');
    console.log('       MODE=template HEADED=true node prefill-touch1.js <data.json>  # legacy 1:1 mode');
    console.log('');
    process.exit(1);
  }

  const dataPath = path.resolve(dataFile);
  if (!fs.existsSync(dataPath)) { log.err(`File not found: ${dataPath}`); process.exit(1); }

  const data        = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const contactMap  = buildContactMap(data);
  const allContacts = uniqueContactList(data);

  log.info(`Account:   ${data.account || '(unknown)'}`);
  log.info(`Contacts:  ${allContacts.length} with Touch 1 content`);
  log.info(`Mode flag: ${MODE} | Headed: ${HEADED} | Debug: ${DEBUG}`);

  if (allContacts.length === 0) {
    log.err('No contacts with touch1_body found. Run the outreach skill first.');
    process.exit(1);
  }

  // ── Resolve results file (needed for auto and template modes) ────────────
  let resultsData = null;
  const resultsPath = dataPath.replace(/_sequences\.json$/, '_sequences_results.json');
  if (fs.existsSync(resultsPath)) {
    resultsData = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    const hasIds = (resultsData.sequences || []).some(s => s.id && s.status === 'success');
    if (hasIds) {
      log.info(`Results file: ${path.basename(resultsPath)}`);
    } else {
      log.warn('Results file found but has no successful sequence IDs');
      resultsData = null;
    }
  }

  // ── Determine effective mode ──────────────────────────────────────────────
  let effectiveMode;
  if (MODE === 'template') {
    effectiveMode = 'template';
    if (!resultsData) { log.err('Template mode requires a results file with sequence IDs.'); process.exit(1); }
    if (allContacts.length > (resultsData.sequences || []).length) {
      log.warn('Template mode is 1:1 only — sequences with multiple contacts will only fill the first contact.');
    }
  } else if (MODE === 'tasks') {
    effectiveMode = 'tasks';
    log.info('MODE: TASK QUEUE (activation skipped — sequences must already be active)');
  } else {
    // auto
    effectiveMode = 'auto';
    if (!resultsData) {
      log.warn('No results file found — cannot auto-activate sequences. Falling back to task queue only.');
      log.warn('Ensure sequences are already active in Apollo before running.');
      effectiveMode = 'tasks';
    } else {
      log.info('MODE: AUTO — will activate sequences then fill task queue');
    }
  }

  // ── Launch browser ────────────────────────────────────────────────────────
  // Uses saved session file — Chrome can be open, no conflict.
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

  try {
    // ── Verify Apollo login ───────────────────────────────────────────────
    const startUrl = `${APOLLO_BASE}/#/sequences`;
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('button, [class*="zp_"]', { timeout: 30000 }).catch(() => {});
    await sleep(3000);
    await dismissApolloUI(page);

    const url = page.url();
    const isLoggedIn = !url.includes('/login') &&
      await page.locator('[class*="zp_"], nav, [role="navigation"]')
        .first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!isLoggedIn) {
      log.err('Not logged into Apollo.');
      if (HEADED) {
        log.info('Waiting up to 90s for manual login...');
        await sleep(90000);
      } else {
        log.err('Run with HEADED=true to log in manually.'); process.exit(1);
      }
    }

    log.ok('Apollo login confirmed');
    console.log('');

    // ── Execute ───────────────────────────────────────────────────────────
    let results;
    let activationResults = null;

    if (effectiveMode === 'template') {
      log.info('Running sequence template mode (legacy 1:1)...');
      results = await fillSequenceTemplates(page, data, resultsData);

    } else {
      // auto or tasks mode — both use task queue

      if (effectiveMode === 'auto' && resultsData) {
        console.log('');
        log.info('Step 1: Activating sequences...');
        activationResults = await activateSequences(page, resultsData);
        console.log('');

        if (activationResults.activated.length === 0 && activationResults.alreadyActive.length === 0) {
          log.warn('No sequences were activated. Proceeding to task queue anyway...');
          log.warn('If no tasks appear, sequences may need manual activation in Apollo > Sequences.');
        }

        // After API activation, navigate away and back to the tasks page
        // to ensure we're not still on a sequence editor page
        await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2000);
        await dismissApolloUI(page);
      }

      log.info('Step 2: Filling task queue...');
      results = await fillTaskQueue(page, contactMap, allContacts);
    }

    // ── Summary ───────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log('TOUCH 1 PRE-FILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Account:   ${data.account || '(unknown)'}`);
    console.log(`Mode:      ${effectiveMode === 'template' ? 'Sequence Template (1:1)' : effectiveMode === 'auto' ? 'Auto (activate → task queue)' : 'Task Queue'}`);
    console.log(`Contacts:  ${allContacts.length} in JSON`);

    if (activationResults) {
      console.log(`Activated: ${activationResults.activated.length} newly | ${activationResults.alreadyActive.length} already active | ${activationResults.failed.length} failed`);
    }

    console.log('');

    if (results.filled.length > 0) {
      console.log(`\x1b[32m✓ Pre-filled (${results.filled.length}):\x1b[0m`);
      for (const n of results.filled) console.log(`   • ${n}`);
    }

    if (results.skipped.length > 0 && DEBUG) {
      console.log(`\x1b[33m⊘ Skipped (${results.skipped.length}):\x1b[0m`);
      for (const n of results.skipped) console.log(`   • ${n}`);
    }

    if (results.failed.length > 0) {
      console.log(`\x1b[31m✗ Failed (${results.failed.length}):\x1b[0m`);
      for (const n of results.failed) console.log(`   • ${n}`);
      console.log('');
      if (effectiveMode === 'template') {
        console.log('\x1b[33mFix manually: Apollo > Sequences > find sequence > Touch 1 step >\x1b[0m');
        console.log('\x1b[33mclick Template tab > paste Subject and Body > Save changes\x1b[0m');
      } else {
        console.log('\x1b[33mFix manually: Apollo > Tasks > Manual Emails >\x1b[0m');
        console.log('\x1b[33mopen each failed contact\'s task > paste Subject and Body > Save as draft\x1b[0m');
      }
      console.log('Re-run with DEBUG=true HEADED=true for screenshots of what failed.');
    }

    if (results.filled.length > 0) {
      console.log('');
      if (effectiveMode === 'template') {
        console.log('\x1b[32mTouch 1 templates saved. When you activate a sequence, the Manual\x1b[0m');
        console.log('\x1b[32mEmail task appears pre-filled. Review in Tasks, then click Send.\x1b[0m');
      } else {
        console.log('\x1b[32mAll pre-filled emails saved as drafts — nothing has been sent.\x1b[0m');
        console.log('Sequences are ACTIVE. Touch 1 is a Manual Email — review and send');
        console.log('each one individually from Apollo > Tasks > Manual Emails.');
        console.log('Touches 2-7 auto-schedule after each Touch 1 is sent.');
      }
    }

    if (results.filled.length === 0 && results.failed.length === 0) {
      console.log('\x1b[33mNothing was pre-filled — no matching tasks found.\x1b[0m');
      if (effectiveMode !== 'template') {
        console.log('  Check that sequences were activated and tasks appear in Apollo > Tasks.');
        console.log('  If activation failed, activate manually in Apollo > Sequences, then re-run with MODE=tasks.');
      }
      if (DEBUG) {
        console.log('  Screenshots saved to /tmp/apollo-prefill-*.png');
      }
    }

  } catch (fatalErr) {
    log.err(`Fatal: ${fatalErr.message}`);
    console.error(fatalErr);
    await screenshot(page, 'fatal-error');
  } finally {
    await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  log.err(`Unhandled: ${err.message}`);
  console.error(err);
  process.exit(1);
});
