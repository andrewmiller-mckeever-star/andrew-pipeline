#!/usr/bin/env node
/**
 * Find Apollo task IDs for LlamaIndex sequences via API, then fill them.
 * Uses the Apollo REST API via browser session cookies to locate tasks.
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const HEADED   = process.env.HEADED === 'true';
const APOLLO_BASE      = 'https://app.apollo.io';
const STATE_FILE       = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const log = {
  info:    (msg) => console.log(`\x1b[36m[INFO]\x1b[0m  ${msg}`),
  ok:      (msg) => console.log(`\x1b[32m[OK]\x1b[0m    ${msg}`),
  warn:    (msg) => console.log(`\x1b[33m[WARN]\x1b[0m  ${msg}`),
  err:     (msg) => console.log(`\x1b[31m[ERR]\x1b[0m   ${msg}`),
  contact: (name, msg) => console.log(`\x1b[35m[${name}]\x1b[0m ${msg}`),
};

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function screenshot(page, label) {
  try {
    const p = `/tmp/find-tasks-${label}-${Date.now()}.png`;
    await page.screenshot({ path: p, fullPage: true });
    log.warn(`Screenshot: ${p}`);
  } catch (_) {}
}

async function main() {
  const dataFile = process.argv[2];
  if (!dataFile) {
    console.log('Usage: HEADED=true node find-tasks.js <account>_sequences.json');
    process.exit(1);
  }

  const dataPath = path.resolve(dataFile);
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const resultsPath = dataPath.replace(/_sequences\.json$/, '_sequences_results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

  // Get sequence IDs
  const seqIds = results.sequences.filter(s => s.status === 'success' && s.id).map(s => s.id);
  log.info(`Searching tasks for ${seqIds.length} sequences: ${seqIds.join(', ')}`);

  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: !HEADED,
    slowMo: 50,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    storageState: STATE_FILE,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Navigate to Apollo to establish session
    await page.goto(`${APOLLO_BASE}/#/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);
    log.ok('Apollo loaded');

    // Try multiple task API endpoints to find the tasks
    log.info('Querying Apollo tasks API...');

    const apiResult = await page.evaluate(async (seqIds) => {
      const results = {};

      // Method 1: Query tasks filtered by emailer campaign IDs
      const queryParams = seqIds.map(id => `emailer_campaign_ids[]=${id}`).join('&');
      const url1 = `/api/v1/tasks?${queryParams}&per_page=50&sort_by_field=created_at&sort_direction=desc`;

      try {
        const resp1 = await fetch(url1, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
        });
        const text1 = await resp1.text();
        results.method1 = { status: resp1.status, url: url1, body: text1.slice(0, 2000) };
      } catch (e) {
        results.method1 = { error: e.message };
      }

      // Method 2: General tasks search
      const url2 = `/api/v1/tasks?per_page=50&sort_by_field=created_at&sort_direction=desc`;
      try {
        const resp2 = await fetch(url2, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
        });
        const text2 = await resp2.text();
        results.method2 = { status: resp2.status, body: text2.slice(0, 3000) };
      } catch (e) {
        results.method2 = { error: e.message };
      }

      // Method 3: POST tasks search
      try {
        const resp3 = await fetch('/api/v1/tasks/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
          body: JSON.stringify({ emailer_campaign_ids: seqIds, per_page: 50 }),
        });
        const text3 = await resp3.text();
        results.method3 = { status: resp3.status, body: text3.slice(0, 2000) };
      } catch (e) {
        results.method3 = { error: e.message };
      }

      // Method 4: Check what network requests Apollo makes for the task list
      return results;
    }, seqIds);

    log.info('API Results:');
    for (const [method, result] of Object.entries(apiResult)) {
      log.info(`${method}: status=${result.status || 'error'}`);
      if (result.error) {
        log.warn(`  Error: ${result.error}`);
      } else {
        // Check if response contains task data
        try {
          const parsed = JSON.parse(result.body || '{}');
          const tasks = parsed.tasks || parsed.data || [];
          log.info(`  Tasks found: ${tasks.length}`);
          if (tasks.length > 0) {
            for (const t of tasks.slice(0, 5)) {
              log.info(`  Task: id=${t.id} type=${t.task_type} contact=${t.contact?.name || t.contact_id} seq=${t.emailer_campaign_id}`);
            }
          }
          // Print the raw body for inspection
          log.info(`  Raw (500 chars): ${(result.body || '').slice(0, 500)}`);
        } catch (e) {
          log.info(`  Raw (500 chars): ${(result.body || '').slice(0, 500)}`);
        }
      }
      console.log('');
    }

    // Also try intercepting network traffic to see what Apollo calls
    log.info('Navigating to Email Tasks tab to capture API calls...');

    // Listen for Apollo API calls
    const taskApiCalls = [];
    page.on('response', async (resp) => {
      const url = resp.url();
      if (url.includes('/api/v1/task') || url.includes('/api/v1/emailer')) {
        try {
          const body = await resp.text().catch(() => '');
          if (body.includes('manual_email') || body.includes('task_type')) {
            taskApiCalls.push({ url, status: resp.status(), bodySlice: body.slice(0, 500) });
          }
        } catch (_) {}
      }
    });

    // Navigate to Email tasks tab
    await page.goto(`${APOLLO_BASE}/#/tasks`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Try to click "Email tasks" tab
    const emailTab = page.locator('text="Email tasks"').first();
    if (await emailTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailTab.click();
      log.info('Clicked Email tasks tab');
      await sleep(2000);
    } else {
      log.warn('Email tasks tab not found');
    }

    await screenshot(page, 'email-tasks-tab');

    // Check captured API calls
    await sleep(2000);
    log.info(`\nCaptured ${taskApiCalls.length} task/emailer API calls:`);
    for (const call of taskApiCalls.slice(0, 5)) {
      log.info(`  ${call.status} ${call.url.split('?')[0]}`);
      log.info(`  Body: ${call.bodySlice}`);
      console.log('');
    }

  } catch (fatalErr) {
    log.err(`Fatal: ${fatalErr.message}`);
    console.error(fatalErr);
    await screenshot(page, 'fatal');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(err => {
  log.err(`Unhandled: ${err.message}`);
  process.exit(1);
});
