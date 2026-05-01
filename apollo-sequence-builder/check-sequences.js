#!/usr/bin/env node
/**
 * Check current state of the 4 LlamaIndex sequences in Apollo UI.
 * Also intercepts API calls to understand the step creation API format.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const APOLLO_BASE = 'https://app.apollo.io';
const STATE_FILE  = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SEQ_IDS = [
  { id: '69f39737fc40d8001522f072', name: 'Seq A: Engineering Leader' },
  { id: '69f397c123a6f100153e54b9', name: 'Seq B: Executive Sponsor' },
  { id: '69f3984b8253a3000de94631', name: 'Seq C: Product Leader' },
  { id: '69f398d444476b0019ab1e5e', name: 'Seq D: AI/ML Leader' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    slowMo: 80,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    storageState: STATE_FILE,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // Intercept API calls when visiting sequences
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/v1/emailer') || url.includes('/api/v1/step')) {
      apiCalls.push({ method: req.method(), url: url.replace(APOLLO_BASE, ''), postData: req.postData()?.slice(0, 300) });
    }
  });
  page.on('response', async resp => {
    const url = resp.url();
    if ((url.includes('/api/v1/emailer_step') || url.includes('/api/v1/emailer_campaigns')) && resp.request().method() !== 'GET') {
      try {
        const body = await resp.text().catch(() => '');
        apiCalls.push({ type: 'response', status: resp.status(), url: url.replace(APOLLO_BASE, ''), body: body.slice(0, 500) });
      } catch (_) {}
    }
  });

  // Check each sequence
  for (const seq of SEQ_IDS) {
    console.log(`\n=== ${seq.name} (${seq.id}) ===`);
    const url = `${APOLLO_BASE}/#/sequences/${seq.id}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Take screenshot
    const ssPath = `/tmp/check-seq-${seq.id.slice(-6)}.png`;
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log(`Screenshot: ${ssPath}`);

    // Check for step content
    const stepInfo = await page.evaluate(() => {
      // Look for step rows, step editors, step titles
      const stepEls = Array.from(document.querySelectorAll('[class*="step"], [class*="Step"]'));
      const stepTexts = stepEls.map(el => el.textContent?.trim().slice(0, 60)).filter(t => t && t.length > 3).slice(0, 10);

      // Check for "Add Step" button
      const addStepBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const addBtns = addStepBtns.filter(el => el.textContent?.toLowerCase().includes('add step') && el.offsetParent !== null).map(el => el.textContent?.trim());

      // Look for existing steps
      const touchLabels = Array.from(document.querySelectorAll('*')).filter(el =>
        el.offsetParent !== null &&
        el.children.length === 0 &&
        /touch\s*[1-9]|step\s*[1-9]/i.test(el.textContent || '')
      ).map(el => el.textContent?.trim()).slice(0, 10);

      return { stepTexts: [...new Set(stepTexts)], addBtns: [...new Set(addBtns)], touchLabels: [...new Set(touchLabels)] };
    });

    console.log('Add step buttons:', stepInfo.addBtns);
    console.log('Touch/Step labels:', stepInfo.touchLabels);
    console.log('Step elements:', stepInfo.stepTexts.slice(0, 5));

    await sleep(500);
  }

  // Now try to intercept what happens when we manually trigger the add step flow on Seq A
  console.log('\n=== Intercepting step creation API for Seq A ===');
  await page.goto(`${APOLLO_BASE}/#/sequences/69f39737fc40d8001522f072`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Try to click "Add Step" and see what happens
  try {
    const addStepBtn = page.locator('button:has-text("Add step"), button:has-text("Add Step"), button:has-text("+ Add"), [role="button"]:has-text("Add step")').first();
    if (await addStepBtn.isVisible({ timeout: 3000 })) {
      console.log('Found Add Step button — clicking...');
      await addStepBtn.click();
      await sleep(2000);
      await page.screenshot({ path: '/tmp/check-add-step.png', fullPage: false });
      console.log('Screenshot after Add Step click: /tmp/check-add-step.png');

      // Check what appeared
      const afterClick = await page.evaluate(() => {
        const visible = Array.from(document.querySelectorAll('button, [role="dialog"], [class*="modal"], [class*="popup"]'))
          .filter(el => el.offsetParent !== null)
          .map(el => el.textContent?.trim().slice(0, 40))
          .filter(t => t && t.length > 2)
          .slice(0, 10);
        return visible;
      });
      console.log('After Add Step click:', afterClick);
    } else {
      console.log('Add Step button not found');
    }
  } catch (e) {
    console.log(`Add step click error: ${e.message}`);
  }

  console.log('\n=== Captured API calls ===');
  for (const call of apiCalls) {
    if (call.type === 'response') {
      console.log(`RESPONSE ${call.status} ${call.url}: ${call.body.slice(0, 200)}`);
    } else {
      console.log(`${call.method} ${call.url}${call.postData ? ` | body: ${call.postData}` : ''}`);
    }
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
