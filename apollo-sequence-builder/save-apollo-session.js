#!/usr/bin/env node
/**
 * Apollo session setup — only needed if Apollo logs you out.
 *
 * First checks if the LinkedIn session file already has a valid Apollo token
 * (it usually does — the LinkedIn save-session captures Apollo too).
 * If found and valid, copies it over. No browser needed.
 *
 * Falls back to opening a browser for manual login only if needed.
 *
 * Chrome does NOT need to be closed.
 *
 * Usage: node save-apollo-session.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const STATE_FILE        = path.join(__dirname, 'apollo_session.json');
const LINKEDIN_STATE    = path.join(process.env.HOME, 'Desktop/YDC Pipeline/apollo-linkedin-connect/storageState.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APOLLO_BASE       = 'https://app.apollo.io';

function isTokenValid(stateFile) {
  try {
    const d = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const tok = (d.cookies || []).find(c => c.domain === 'app.apollo.io' && c.name === 'app_token');
    if (!tok) return false;
    if (tok.expires <= 0) return true; // session cookie, assume valid
    return tok.expires > (Date.now() / 1000) + 3600; // valid for at least 1 more hour
  } catch (e) {
    return false;
  }
}

async function main() {
  // Fast path: LinkedIn session already has a valid Apollo token
  if (fs.existsSync(LINKEDIN_STATE) && isTokenValid(LINKEDIN_STATE)) {
    fs.copyFileSync(LINKEDIN_STATE, STATE_FILE);
    console.log('[OK] Copied valid Apollo session from LinkedIn state file.');
    console.log(`[OK] Session saved to: ${STATE_FILE}`);
    console.log('[INFO] app_token valid — no login needed.');
    return;
  }

  // Slow path: need manual login
  console.log('[INFO] No valid Apollo session found in LinkedIn state. Opening browser...');
  console.log('[INFO] Chrome does NOT need to be closed — this opens its own window.');
  console.log('[INFO] Log into Apollo. Session saves automatically when detected.');
  console.log('');

  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await context.newPage();
  page.setDefaultTimeout(0);

  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('[INFO] Waiting for login...');

  let email = null;
  while (!email) {
    await page.waitForTimeout(2500);
    try {
      const result = await page.evaluate(async () => {
        try {
          const resp = await fetch('/api/v1/users/me', { credentials: 'include' });
          if (resp.status === 200) {
            const d = await resp.json();
            return d?.user?.email || d?.email || 'authenticated';
          }
          return null;
        } catch { return null; }
      });
      if (result) {
        email = result;
      } else {
        process.stdout.write('.');
      }
    } catch { /* page navigating, keep polling */ }
  }

  console.log(`\n[OK] Logged in as: ${email}`);
  await page.waitForTimeout(2000);
  await context.storageState({ path: STATE_FILE });

  console.log(`[OK] Session saved to: ${STATE_FILE}`);
  console.log('[OK] build-sequences.js and prefill-touch1.js will now run with Chrome open.');

  await browser.close();
}

main().catch(e => {
  console.error('[ERR]', e.message);
  process.exit(1);
});
