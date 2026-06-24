/**
 * test-cdp-auth.js
 * Throwaway test — proves CDP + persistent profile approach works before touching real scripts.
 *
 * Phase 1: Launch Playwright's own Chromium (no conflict with user's Chrome) with debug port
 *          + persistent profile. Confirm CDP connects. Open Apollo login page.
 *          USER LOGS IN MANUALLY.
 *
 * Phase 2: Kill Chromium, relaunch from same profile, reconnect via CDP.
 *          Confirm Apollo session survived the restart.
 *
 * Run phase 1: node test-cdp-auth.js login
 * Run phase 2: node test-cdp-auth.js check
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');

const CHROMIUM_BIN = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
);
const PROFILE_DIR = path.join(os.homedir(), '.chrome-cdp-test-profile');
const DEBUG_PORT = 9222;
const APOLLO_URL = 'https://app.apollo.io/#/sequences';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForCDP(port, maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/json/version`, resolve);
        req.on('error', reject);
        req.setTimeout(600, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch { await sleep(300); }
  }
  return false;
}

async function isLoggedIn(page) {
  // Apollo redirects to login page if not authenticated
  await sleep(3000);
  const url = page.url();
  const title = await page.title().catch(() => '');
  const onLoginPage = title.toLowerCase().includes('login') || url.includes('/login') || url.includes('sign_in');
  return { url, title, loggedIn: !onLoginPage };
}

async function launchChromium(url) {
  console.log(`[INFO] Launching Playwright Chromium with debug port ${DEBUG_PORT}`);
  console.log(`[INFO] Profile: ${PROFILE_DIR}`);

  const proc = spawn(CHROMIUM_BIN, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    url
  ], { detached: true, stdio: 'ignore' });

  proc.unref();
  console.log(`[INFO] Chromium PID: ${proc.pid}`);

  const ready = await waitForCDP(DEBUG_PORT, 12000);
  if (!ready) throw new Error('Chromium did not expose CDP within 12s');
  console.log(`[✓] CDP ready`);
  return proc;
}

// ─────────────────────────────────────────────
// PHASE 1: Login
// ─────────────────────────────────────────────
async function runLogin() {
  console.log('\n═══ PHASE 1: Launch + Login Test ═══\n');

  // Kill any lingering process on port 9222
  try { require('child_process').execSync('lsof -ti:9222 | xargs kill -9 2>/dev/null', { stdio: 'ignore' }); await sleep(500); } catch {}

  await launchChromium('https://app.apollo.io/#/login');

  const browser = await chromium.connectOverCDP(`http://localhost:${DEBUG_PORT}`);
  console.log(`[✓] Playwright connected via CDP`);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[0] ?? await context.newPage();

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const { url, title, loggedIn } = await isLoggedIn(page);

  console.log(`[INFO] URL: ${url}`);
  console.log(`[INFO] Title: "${title}"`);

  if (loggedIn) {
    console.log(`\n[✓] Already logged in! Running phase 2 check...`);
    await runCheck(browser);
  } else {
    console.log(`\n[ACTION NEEDED] Apollo login page is open in the Chromium window.`);
    console.log(`  → Log into Apollo in that window (use your SSO / Google account)`);
    console.log(`  → Once you see the sequences page, come back here`);
    console.log(`  → Then run: node test-cdp-auth.js check`);
    console.log(`\n[INFO] Leave Chromium open. This script will exit now.`);
  }

  await browser.close();
}

// ─────────────────────────────────────────────
// PHASE 2: Check session survived
// ─────────────────────────────────────────────
async function runCheck(existingBrowser) {
  console.log('\n═══ PHASE 2: Session Persistence Check ═══\n');

  let browser = existingBrowser;
  let launched = false;

  if (!browser) {
    // Check if Chromium is still running on port 9222
    const cdpUp = await waitForCDP(DEBUG_PORT, 2000);

    if (!cdpUp) {
      // Chromium was closed — relaunch from same profile (the whole point of the test)
      console.log(`[INFO] Chromium not running. Relaunching from same profile to test persistence...`);
      try { require('child_process').execSync('lsof -ti:9222 | xargs kill -9 2>/dev/null', { stdio: 'ignore' }); await sleep(500); } catch {}
      await launchChromium(APOLLO_URL);
      launched = true;
    } else {
      console.log(`[INFO] Chromium still running on port ${DEBUG_PORT}`);
    }

    browser = await chromium.connectOverCDP(`http://localhost:${DEBUG_PORT}`);
    console.log(`[✓] Playwright connected`);
  }

  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.goto(APOLLO_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const { url, title, loggedIn } = await isLoggedIn(page);

  console.log(`[INFO] URL: ${url}`);
  console.log(`[INFO] Title: "${title}"`);

  if (loggedIn) {
    console.log(`\n[RESULT] ✅ SESSION SURVIVED — CDP approach is confirmed working!`);
    console.log(`  Profile: ${PROFILE_DIR}`);
    if (launched) console.log(`  Chromium was relaunched from saved profile — no re-login needed`);
    console.log(`\n  Safe to:`);
    console.log(`  1. Update fill-sequence-content.js to use connectOverCDP`);
    console.log(`  2. Create a launch-chromium-debug.sh helper`);
    console.log(`  3. Replace storageState everywhere with this approach`);
  } else {
    console.log(`\n[RESULT] ❌ Session did NOT survive`);
    console.log(`  Apollo redirected to login despite persistent profile`);
    console.log(`  This means Apollo's SSO tokens don't survive in Chromium's profile storage`);
    console.log(`  → Different fix needed (intercept + replay API calls)`);
  }

  await page.close();
  if (!existingBrowser) await browser.close();
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
const mode = process.argv[2] || 'login';
(async () => {
  if (mode === 'login') await runLogin().catch(e => { console.error('[ERR]', e.message); process.exit(1); });
  else if (mode === 'check') await runCheck(null).catch(e => { console.error('[ERR]', e.message); process.exit(1); });
  else { console.log('Usage: node test-cdp-auth.js [login|check]'); process.exit(1); }
})();
