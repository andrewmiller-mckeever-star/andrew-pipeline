#!/usr/bin/env node
/**
 * Debug: add one step to the empty Seq A and capture what the UI looks like
 * to find the correct save mechanism.
 */
const { chromium } = require('playwright');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SEQ_ID = '69f2e01f863d5c0019966f7d'; // empty Seq A

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    slowMo: 50,
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE_FILE });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // Navigate to the empty sequence
  await page.goto(`https://app.apollo.io/#/sequences/${SEQ_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  
  console.log('URL after load:', page.url());
  await page.screenshot({ path: '/tmp/step1-initial.png' });

  // Click "Add a step"
  const addBtn = page.locator('text="Add a step"').first();
  await addBtn.click({ timeout: 10000 });
  await sleep(2000);
  
  await page.screenshot({ path: '/tmp/step2-after-add-click.png' });
  
  const buttons2 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map(el => el.textContent.trim().replace(/\s+/g, ' ').substring(0, 80))
      .filter(t => t.length > 0)
  );
  console.log('\nBUTTONS AFTER "Add a step" click:', JSON.stringify(buttons2, null, 2));

  // Try clicking "Automatic email" option
  try {
    const emailOpt = page.locator('text="Automatic email"').first();
    if (await emailOpt.isVisible({ timeout: 3000 })) {
      await emailOpt.click();
      await sleep(2000);
      await page.screenshot({ path: '/tmp/step3-after-email-select.png' });
      
      const buttons3 = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map(el => el.textContent.trim().replace(/\s+/g, ' ').substring(0, 80))
          .filter(t => t.length > 0)
      );
      console.log('\nBUTTONS AFTER email type select:', JSON.stringify(buttons3, null, 2));
    }
  } catch(e) { console.log('email select failed:', e.message); }

  console.log('\nScreenshots saved to /tmp/step*.png');
  console.log('URL:', page.url());
  
  // Keep open briefly for manual inspection
  await sleep(3000);
  await browser.close();
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
