#!/usr/bin/env node
/**
 * Deactivate (turn OFF the sequence-level toggle) for specific Apollo sequences.
 * Uses the SAME persistent-profile auth as build-sequences.js and calls Apollo's
 * INTERNAL browser API via fetch (full session cookies), which is the reliable
 * path the public api.apollo.io REST endpoint does not support for `active`.
 *
 * Usage: node deactivate-seqs.js <seqId> [<seqId> ...]
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
  if (ids.length === 0) { console.log('Usage: node deactivate-seqs.js <seqId> ...'); process.exit(1); }

  const lock = path.join(PROFILE_DIR, 'SingletonLock');
  if (fs.existsSync(lock)) { fs.unlinkSync(lock); }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROMIUM_BIN,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled', '--no-process-singleton'],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);

  for (const id of ids) {
    const res = await page.evaluate(async (seqId) => {
      const opts = { headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN':
        (document.querySelector('meta[name="csrf-token"]')||{}).content || '' }, credentials: 'include' };
      const attempts = [];
      const tries = [
        ['PUT wrapped active:false',   `/api/v1/emailer_campaigns/${seqId}`, 'PUT',  JSON.stringify({ emailer_campaign: { active: false } })],
        ['PUT flat active:false',      `/api/v1/emailer_campaigns/${seqId}`, 'PUT',  JSON.stringify({ active: false })],
        ['POST /deactivate',           `/api/v1/emailer_campaigns/${seqId}/deactivate`, 'POST', '{}'],
        ['POST /pause',                `/api/v1/emailer_campaigns/${seqId}/pause`, 'POST', '{}'],
      ];
      for (const [label, url, method, body] of tries) {
        try {
          const resp = await fetch(url, { ...opts, method, body });
          const text = await resp.text();
          let active = null;
          try { active = JSON.parse(text).emailer_campaign?.active; } catch(_) {}
          attempts.push({ label, status: resp.status, active, snippet: text.substring(0,120) });
          if (active === false) break;
        } catch (e) { attempts.push({ label, error: String(e) }); }
      }
      // final state
      let finalActive = null;
      try {
        const g = await fetch(`/api/v1/emailer_campaigns/${seqId}`, { ...opts, method: 'GET' });
        finalActive = JSON.parse(await g.text()).emailer_campaign?.active;
      } catch(_) {}
      return { seqId, attempts, finalActive };
    }, id);
    console.log(JSON.stringify(res, null, 2));
    await sleep(1000);
  }
  await context.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
