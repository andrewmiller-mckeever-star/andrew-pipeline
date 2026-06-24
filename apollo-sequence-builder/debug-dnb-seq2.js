const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const CHROMIUM_BIN = path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR = path.join(os.homedir(), '.apollo-playwright-profile');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROMIUM_BIN,
    headless: false,
    slowMo: 100,
    args: ['--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1600, height: 900 },
  });
  const page = await context.newPage();
  
  await page.goto('https://app.apollo.io/#/sequences/6a0e01d9d1f3010018ec353b', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  
  const result = await page.evaluate(() => {
    const editBtns = document.querySelectorAll('button[aria-label*="edit" i], button[aria-label*="Edit"]');
    const allBtns = Array.from(document.querySelectorAll('button'));
    const cancelTexts = allBtns.filter(b => b.textContent.trim() === 'Cancel').map(b => ({
      text: b.textContent.trim(),
      visible: b.offsetParent !== null,
      classes: b.className.substring(0, 80)
    }));
    const modals = document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="Modal"]');
    return {
      editBtnCount: editBtns.length,
      editBtnAriaLabels: Array.from(editBtns).map(b => b.getAttribute('aria-label')),
      cancelBtns: cancelTexts,
      modalCount: modals.length,
      modalClasses: Array.from(modals).map(m => m.className.substring(0, 100)),
      pageTitle: document.title,
    };
  });
  
  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: '/tmp/debug-dnb-seq2.png' });
  console.log('Screenshot: /tmp/debug-dnb-seq2.png');
  
  await sleep(1000);
  await context.close();
})().catch(e => { console.error(e.message); process.exit(1); });
