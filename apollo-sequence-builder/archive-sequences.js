#!/usr/bin/env node
/**
 * Archive specific Apollo sequences by ID.
 * Apollo does not support deletion via UI for sequences with contacts or history.
 * This script archives them via the sequences list "..." context menu.
 * Uses apollo_session.json — Chrome does NOT need to be closed.
 */

const { chromium } = require('playwright');
const path = require('path');

const APOLLO_BASE = 'https://app.apollo.io';
const STATE_FILE = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Sequences to archive — add IDs here before running
const IDS_TO_ARCHIVE = [
  // Add sequence IDs here to archive them. Example:
  // '69f38adc26c0540021acd728',  // CTD Investor Referral v1 (archived 2026-05-01)
];

const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  ok:   (msg) => console.log(`\x1b[32m[OK]\x1b[0m   ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  err:  (msg) => console.log(`\x1b[31m[ERR]\x1b[0m  ${msg}`),
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dismissModals(page) {
  // Dismiss "Are you sure?" / "Review and confirm steps" modals
  try {
    for (let i = 0; i < 3; i++) {
      const confirmBtns = page.locator('button:has-text("Confirm")');
      const count = await confirmBtns.count();
      if (count === 0) break;
      for (let j = count - 1; j >= 0; j--) {
        try {
          if (await confirmBtns.nth(j).isVisible({ timeout: 500 })) {
            await confirmBtns.nth(j).click({ timeout: 2000 });
            await sleep(600);
            break;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

async function archiveSequence(page, id) {
  // Primary approach: call Apollo's API directly via browser fetch (uses full session cookies)
  // This avoids all UI complexity. Falls through to UI if it returns unexpected results.
  log.info(`  Trying API archive for ${id}...`);
  // Try multiple API approaches from within browser context (full session cookies available)
  const apiResult = await page.evaluate(async ({ seqId, base }) => {
    const opts = { headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    const attempts = [
      // Apollo internal: POST to /archive action
      () => fetch(`/api/v1/emailer_campaigns/${seqId}/archive`, { method: 'POST', ...opts, body: '{}' }),
      // PUT with archived flag (try string "true" as Rails may expect)
      () => fetch(`/api/v1/emailer_campaigns/${seqId}`, { method: 'PUT', ...opts, body: JSON.stringify({ emailer_campaign: { archived: 't' } }) }),
      // PATCH
      () => fetch(`/api/v1/emailer_campaigns/${seqId}`, { method: 'PATCH', ...opts, body: JSON.stringify({ emailer_campaign: { archived: true } }) }),
    ];
    const results = [];
    for (const attempt of attempts) {
      try {
        const resp = await attempt();
        const text = await resp.text();
        let archived = false;
        try { archived = JSON.parse(text).emailer_campaign?.archived === true; } catch(_) {}
        results.push({ status: resp.status, archived, snippet: text.substring(0, 100) });
        if (archived) break;  // Stop on first success
      } catch(e) { results.push({ error: e.message }); }
    }
    return results;
  }, { seqId: id, base: APOLLO_BASE });

  log.info(`  API results: ${JSON.stringify(apiResult)}`);

  // Check if any attempt archived it
  const archived = Array.isArray(apiResult) && apiResult.some(r => r.archived === true);
  if (archived) {
    log.ok(`  Archived via API`);
    return true;
  }

  // Fall through to UI approach
  log.warn(`  API approaches unsuccessful — trying UI fallback`);

  // Step 1: Navigate to the sequence detail page to get its name
  await page.goto(`${APOLLO_BASE}/#/sequences/${id}`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await sleep(3000);
  await dismissModals(page);

  // Check we landed on the right page
  const currentUrl = page.url();
  if (!currentUrl.includes(id)) {
    log.warn(`  Redirected away from ${id} — sequence may already be archived`);
    return true;
  }

  // Get the sequence name — try browser title first (Apollo sets it), then Settings page input
  let seqName = null;

  // Try 1: browser tab title (e.g. "CTD Investor Referral - Apollo" or "CTD Investor Referral | Apollo")
  const pageTitle = await page.title().catch(() => '');
  const titleCandidate = pageTitle.split(/[|\-]/)[0].trim();
  if (titleCandidate.length > 3 && !titleCandidate.toLowerCase().includes('apollo')) {
    seqName = titleCandidate;
    log.info(`  Name from page title: "${seqName}"`);
  }

  // Try 2: navigate to Settings tab and read the Sequence name input
  if (!seqName) {
    await page.goto(`${APOLLO_BASE}/#/sequences/${id}/settings`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await sleep(2500);
    const nameInput = page.locator('input').first();
    const inputVal = await nameInput.inputValue({ timeout: 3000 }).catch(() => '');
    if (inputVal.trim().length > 3) {
      seqName = inputVal.trim();
      log.info(`  Name from settings input: "${seqName}"`);
    }
  }

  if (!seqName) {
    log.warn(`  Could not read sequence name — using ID fragment as fallback`);
  }
  const searchTerm = seqName || id.slice(-8);
  log.info(`  Sequence name: "${searchTerm}"`);

  // Step 2: Go to sequences list, sort by Created (newest first), search for the sequence
  await page.goto(`${APOLLO_BASE}/#/sequences`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await sleep(3000);
  await dismissModals(page);

  // Sort by Created date descending so newly created sequences appear at top
  try {
    const sortBtn = page.locator('button:has-text("Sort")').first();
    if (await sortBtn.isVisible({ timeout: 2000 })) {
      await sortBtn.click();
      await sleep(800);
      // Look for "Created" sort option in the dropdown
      const createdOpt = page.locator('[role="menuitem"]:has-text("Created"), li:has-text("Created"), button:has-text("Created")').first();
      if (await createdOpt.isVisible({ timeout: 2000 })) {
        await createdOpt.click();
        await sleep(1500);
        log.info('  Sorted by Created date');
      } else {
        await page.keyboard.press('Escape');
        log.warn('  Could not find Created sort option');
      }
    }
  } catch (_) { log.warn('  Sort step skipped'); }

  // Search by sequence name and press Enter to trigger the filter
  const searchBox = page.locator('input[placeholder*="Search sequences"], input[placeholder*="search"]').first();
  const searchVisible = await searchBox.isVisible({ timeout: 3000 }).catch(() => false);
  if (searchVisible) {
    await searchBox.click();
    await searchBox.fill(searchTerm);
    await page.keyboard.press('Enter');
    await sleep(2500);
    log.info(`  Searched for "${searchTerm}"`);
  } else {
    log.warn('  Search box not found — scanning all rows without filter');
  }

  // Step 3: Find the right row — match by text AND pick the one with the target ID
  // Since rows don't embed the ID in the DOM, we navigate to each match to verify
  const allMatchingRows = page.locator(`tr:has-text("${searchTerm}")`);
  const rowCount = await allMatchingRows.count().catch(() => 0);
  log.info(`  Found ${rowCount} row(s) matching "${searchTerm}"`);

  if (rowCount === 0) {
    const ss = `/tmp/archive-fail-${id}.png`;
    await page.screenshot({ path: ss, fullPage: true }).catch(() => {});
    log.err(`  No rows found for "${searchTerm}". Screenshot: ${ss}`);
    return false;
  }

  // If multiple rows (e.g. duplicate names), click each to check which ID it is, then come back
  let targetRowIndex = 0;
  if (rowCount > 1) {
    log.info(`  Multiple matches — checking each to find ID ${id}...`);
    for (let i = 0; i < rowCount; i++) {
      await allMatchingRows.nth(i).click();
      await sleep(2000);
      const currentUrl = page.url();
      if (currentUrl.includes(id)) {
        targetRowIndex = i;
        log.info(`  Match confirmed at row ${i}`);
        break;
      }
      // Go back to the list
      await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(2000);
      // Re-type the search since navigation clears it
      const sb2 = page.locator('input[placeholder*="Search sequences"]').first();
      if (await sb2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sb2.fill(searchTerm);
        await page.keyboard.press('Enter');
        await sleep(2000);
      }
    }
  }

  const rowLocator = allMatchingRows.nth(targetRowIndex);
  const rowVisible = await rowLocator.isVisible({ timeout: 3000 }).catch(() => false);
  if (!rowVisible) {
    const ss = `/tmp/archive-fail-${id}.png`;
    await page.screenshot({ path: ss, fullPage: true }).catch(() => {});
    log.err(`  Target row not visible. Screenshot: ${ss}`);
    return false;
  }

  // Hover the row so the "..." button appears
  await rowLocator.hover().catch(() => {});
  await sleep(400);

  // Click the "..." actions button in this row (last button in the row)
  const dotsBtn = rowLocator.locator('button').last();
  await dotsBtn.click({ timeout: 5000 });
  await sleep(800);
  log.info('  Opened "..." actions menu');

  // Click Archive from the dropdown
  const archiveOption = page.locator('[role="menuitem"]:has-text("Archive"), li:has-text("Archive"), button:has-text("Archive")').first();
  const archiveVisible = await archiveOption.isVisible({ timeout: 3000 }).catch(() => false);

  if (!archiveVisible) {
    const ss = `/tmp/archive-fail-${id}.png`;
    await page.screenshot({ path: ss, fullPage: true }).catch(() => {});
    log.err(`  Archive option not found in dropdown. Screenshot: ${ss}`);
    return false;
  }

  await archiveOption.click({ timeout: 3000 });
  log.info('  Clicked Archive');
  await sleep(1000);

  // Confirm archive dialog if one appears
  const confirmed = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    const confirmPriority = ['yes, archive', 'archive sequence', 'archive', 'yes', 'confirm'];
    for (const keyword of confirmPriority) {
      const btn = candidates.find(el => {
        const text = el.textContent.trim().toLowerCase();
        return (text === keyword || text.includes(keyword)) && el.offsetParent !== null;
      });
      if (btn) { btn.click(); return keyword; }
    }
    return null;
  });

  if (confirmed) {
    log.info(`  Confirmed via "${confirmed}"`);
  } else {
    log.info('  No confirm dialog — archive may have applied directly');
  }

  await sleep(2500);
  return true;
}

async function main() {
  log.info(`Archiving ${IDS_TO_ARCHIVE.length} sequences...`);

  const fs = require('fs');
  if (!fs.existsSync(STATE_FILE)) {
    log.err(`Apollo session not found: ${STATE_FILE}`);
    log.err('Run once to set up: node save-apollo-session.js');
    process.exit(1);
  }

  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    slowMo: 80,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: STATE_FILE,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // Confirm Apollo is logged in
  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  const isLoggedIn = await page.locator('text="Sequences"').isVisible({ timeout: 5000 }).catch(() => false);
  if (!isLoggedIn) {
    log.err('Not logged into Apollo. Run headed and log in first.');
    await browser.close();
    process.exit(1);
  }
  log.ok('Apollo login confirmed');

  let archived = 0;
  let failed = 0;

  for (const id of IDS_TO_ARCHIVE) {
    log.info(`\nProcessing ${id}...`);
    try {
      const ok = await archiveSequence(page, id);
      if (ok) {
        archived++;
        log.ok(`Archived ${id} (${archived}/${IDS_TO_ARCHIVE.length})`);
      } else {
        failed++;
      }
    } catch (e) {
      log.err(`Error on ${id}: ${e.message}`);
      failed++;
    }
    await sleep(1000);
  }

  console.log(`\n${'='.repeat(50)}`);
  log.ok(`Done: ${archived} archived, ${failed} failed`);
  if (failed > 0) log.warn('Check /tmp/archive-fail-*.png for failed sequences');

  await browser.close();
}

main().catch(e => { log.err(`Fatal: ${e.message}`); process.exit(1); });
