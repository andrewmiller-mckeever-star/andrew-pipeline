/**
 * Simple targeted fix for D&B Seq 2 T4 (breakup email)
 * Just clicks the step, types content, saves.
 */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const CHROMIUM_BIN = path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR = path.join(os.homedir(), '.apollo-playwright-profile');

const SEQ_ID = '6a0e01d9d1f3010018ec353b';
const SUBJECT = 'How Salesforce grounded their agents';
const T4_BODY = `Hi {{first_name}},

One more note before I step back. ChatD&B's multi-step query workflows, the kind that cross D&B's database with current market events, are exactly the use case You.com's Research API was designed for: complex, multi-hop research that returns synthesized, cited answers rather than individual search results.

Databricks uses You.com's Search API to ground AI workflows in real-time public web data through Unity Catalog. The enterprise integration pattern is already established.

If D&B.AI's roadmap brings this problem into scope, I'm easy to reach.

Andrew`;

function textToQuillHtml(text) {
  return text.split('\n').map(line =>
    line.trim() ? `<div>${line.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : '<div><br></div>'
  ).join('');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROMIUM_BIN,
    headless: false,
    slowMo: 80,
    args: ['--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1600, height: 900 },
  });
  const page = await context.newPage();

  console.log('[1] Loading sequence page...');
  await page.goto(`https://app.apollo.io/#/sequences/${SEQ_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Dismiss any modal — press Escape, then click any Cancel button
  console.log('[2] Dismissing any modals...');
  await page.keyboard.press('Escape');
  await sleep(500);
  const cancelDismissed = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const c = btns.find(b => b.textContent.trim() === 'Cancel' && b.offsetParent !== null);
    if (c) { c.click(); return true; }
    return false;
  });
  console.log('  Cancel clicked:', cancelDismissed);
  await sleep(800);

  // Find and click Step 4 to expand it
  console.log('[3] Opening Step 4...');
  // Try clicking the 4th step row/header (index 3)
  const stepSelectors = [
    '[class*="sequence-step"]',
    '[class*="sequenceStep"]',
    '[class*="step-item"]',
    '[class*="step_row"]',
  ];
  let stepOpened = false;
  for (const sel of stepSelectors) {
    const steps = page.locator(sel);
    const n = await steps.count();
    console.log(`  Selector ${sel}: ${n} found`);
    if (n >= 4) {
      await steps.nth(3).click({ timeout: 5000 });
      await sleep(1500);
      stepOpened = true;
      console.log('  Clicked step 4 via', sel);
      break;
    }
  }
  if (!stepOpened) {
    // Try clicking the 4th "Edit" button (index 3)
    const editBtns = page.locator('button[aria-label*="edit" i]');
    const n = await editBtns.count();
    console.log(`  Edit buttons found: ${n}`);
    if (n >= 4) {
      await editBtns.nth(3).click({ timeout: 5000 });
      await sleep(1500);
      stepOpened = true;
      console.log('  Clicked 4th edit button');
    }
  }

  // Click Template tab
  console.log('[4] Clicking Template tab...');
  try {
    await page.locator('button:has-text("Template"), [role="tab"]:has-text("Template")').last().click({ timeout: 3000 });
    await sleep(800);
  } catch (_) { console.log('  Template tab not needed or not found'); }

  // Check how many Quill editors are visible
  const quillCount = await page.locator('.ql-editor').count();
  console.log(`[5] Quill editors visible: ${quillCount}`);

  // Inject body into the LAST Quill editor
  console.log('[6] Injecting body...');
  const html = textToQuillHtml(T4_BODY);
  const injected = await page.evaluate(({ html, idx }) => {
    const editors = document.querySelectorAll('.ql-editor');
    const editor = editors[idx] ?? editors[editors.length - 1];
    if (!editor) return { ok: false, error: 'no editor' };
    editor.focus();
    editor.innerHTML = html;
    editor.classList.remove('ql-blank');
    editor.dispatchEvent(new Event('focus', { bubbles: true }));
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    editor.dispatchEvent(new Event('blur', { bubbles: true }));
    return { ok: true, chars: editor.innerText.trim().length, total: editors.length };
  }, { html, idx: quillCount - 1 });
  console.log('  Inject result:', injected);
  await sleep(1000);

  // Click Save changes
  console.log('[7] Saving...');
  const saved = await page.locator('button:has-text("Save changes"), button:text-is("Save")').last().click({ timeout: 5000 }).then(() => true).catch(() => false);
  console.log('  Saved:', saved);
  await sleep(2000);

  await page.screenshot({ path: '/tmp/fix-dnb-t4-done.png' });
  console.log('[DONE] Screenshot: /tmp/fix-dnb-t4-done.png');
  await context.close();
})().catch(e => { console.error('[ERR]', e.message); process.exit(1); });
