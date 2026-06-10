#!/usr/bin/env node
/**
 * save-apollo-session.js
 *
 * One-time setup: opens a browser window for you to log into Apollo.
 * Session is saved to ~/.apollo-playwright-profile using launchPersistentContext.
 * Subsequent runs of fill-sequence-content.js and build-sequences.js reuse
 * this profile automatically — no re-login needed.
 *
 * Chrome does NOT need to be closed.
 *
 * Usage: node save-apollo-session.js
 */

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const PROFILE_DIR = path.join(os.homedir(), '.apollo-playwright-profile');
const CHROMIUM_BIN = path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

async function main() {
  console.log('[INFO] Opening browser for Apollo login...');
  console.log('[INFO] Chrome does NOT need to be closed.');
  console.log('[INFO] Profile:', PROFILE_DIR);
  console.log('');
  console.log('[ACTION] Log into Apollo in the browser window.');
  console.log('[ACTION] The browser will close automatically once login is detected.');
  console.log('');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROMIUM_BIN,
    headless: false,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-popup-blocking',
      '--window-size=1440,900',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Allow OAuth popups
  context.on('page', (popup) => {
    console.log('[INFO] New window opened (OAuth flow):', popup.url().slice(0, 60));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(0);
  await page.goto('https://app.apollo.io/#/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('[WAITING] Polling for login via Apollo sequences API...');
  process.stdout.write('[WAITING] ');

  let email = null;
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    try {
      const pages = context.pages();
      const apolloPage = pages.find(p => p.url().includes('apollo.io') && !p.url().includes('google'));
      if (apolloPage) {
        const result = await apolloPage.evaluate(async () => {
          try {
            const r = await fetch('/api/v1/emailer_campaigns/search', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ per_page: 1 }),
            });
            if (r.ok) return 'authenticated';
          } catch {}
          return null;
        }).catch(() => null);
        if (result) { email = result; break; }
      }
    } catch {}
    process.stdout.write('.');
  }

  console.log('');
  if (email) {
    console.log('[✓] Apollo login confirmed.');
    await page.waitForTimeout(2000);
    await context.close();
    console.log('[✓] Profile saved to:', PROFILE_DIR);
    console.log('[✓] fill-sequence-content.js will now run without re-login.');
  } else {
    console.log('[✗] Timed out waiting for login.');
    await context.close();
    process.exit(1);
  }
}

main().catch(e => {
  console.error('[ERR]', e.message);
  process.exit(1);
});
