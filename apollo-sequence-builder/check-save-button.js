#!/usr/bin/env node
const { chromium } = require('playwright');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SEQ_ID = '69f2e01f863d5c0019966f7d';

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });
  const context = await browser.newContext({ storageState: STATE_FILE });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`https://app.apollo.io/#/sequences/${SEQ_ID}/steps`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 8000));

  const text = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log('PAGE TEXT:\n', text);
  
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="button"]'))
      .map(el => ({ v: el.offsetParent !== null, t: el.textContent.trim().substring(0, 80) }))
      .filter(b => b.t.length > 0)
  );
  console.log('\nALL BUTTONS (visible/hidden):');
  buttons.forEach(b => console.log(`  [${b.v ? 'VIS' : 'HID'}] "${b.t}"`));

  await page.screenshot({ path: '/tmp/apollo-seq-check.png', fullPage: true });
  console.log('\nScreenshot saved to /tmp/apollo-seq-check.png');
  await browser.close();
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
