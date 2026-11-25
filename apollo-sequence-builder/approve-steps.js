#!/usr/bin/env node
/**
 * Approve every step (emailer touch) of specific Apollo sequences so they can send.
 * Steps sit at status "to_be_reviewed" until approved, and activating a sequence does NOT
 * approve them (nothing sends). The public REST API key can't approve: every endpoint 404s
 * and PUT /emailer_touches 422s. A signed-in browser session can: POST
 * /api/v1/emailer_touches/{id}/approve returns 200 and flips the touch to "approved"
 * (verified 2026-11-09). If ~/.apollo-playwright-profile is logged out, run the same fetch
 * from a signed-in Apollo tab (Claude in Chrome javascript_tool) instead.
 * Usage: node approve-steps.js <seqId> [<seqId> ...]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const APOLLO_BASE = 'https://app.apollo.io';
const CHROMIUM_BIN = path.join(require('os').homedir(),
  'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR = path.join(require('os').homedir(), '.apollo-playwright-profile');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.log('Usage: node approve-steps.js <seqId> ...'); process.exit(1); }
  const lock = path.join(PROFILE_DIR, 'SingletonLock');
  if (fs.existsSync(lock)) fs.unlinkSync(lock);
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROMIUM_BIN, headless: true,
    args: ['--no-first-run','--no-default-browser-check','--disable-blink-features=AutomationControlled','--no-process-singleton'],
    ignoreDefaultArgs: ['--enable-automation'], viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  for (const seqId of ids) {
    const res = await page.evaluate(async (seqId) => {
      const csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
      const opts = { headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf }, credentials: 'include' };
      const get = async () => JSON.parse(await (await fetch(`/api/v1/emailer_campaigns/${seqId}`, { ...opts, method: 'GET' })).text());
      const d0 = await get();
      if (!d0.emailer_campaign) return { seqId, error: 'not signed in or no access', raw: JSON.stringify(d0).slice(0, 200) };
      const log = [];
      for (const t of d0.emailer_touches) {
        if (t.status === 'approved') continue;
        const tries = [
          ['POST approve', `/api/v1/emailer_touches/${t.id}/approve`, 'POST', {}],
        ];
        for (const [label, url, method, body] of tries) {
          let code = 0, status = null;
          try { const r = await fetch(url, { ...opts, method, body: JSON.stringify(body) }); code = r.status; } catch (e) {}
          log.push(`${t.id.slice(-6)} ${label} ${code}`);
          await new Promise(r => setTimeout(r, 300));
        }
      }
      const d1 = await get();
      return { seqId, name: d1.emailer_campaign.name, active: d1.emailer_campaign.active,
               statuses: d1.emailer_touches.map(t => t.status), log };
    }, seqId);
    console.log(JSON.stringify(res, null, 1));
  }
  await context.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
