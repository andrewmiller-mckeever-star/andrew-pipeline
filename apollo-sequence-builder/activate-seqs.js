#!/usr/bin/env node
/**
 * Activate (turn ON the sequence-level toggle) for specific Apollo sequences.
 * Mirrors deactivate-seqs.js: persistent-profile auth + Apollo INTERNAL browser
 * API via fetch (session cookies), which the public REST endpoint cannot do for `active`.
 *
 * Usage: node activate-seqs.js <seqId> [<seqId> ...]
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
  if (ids.length === 0) { console.log('Usage: node activate-seqs.js <seqId> ...'); process.exit(1); }
  const lock = path.join(PROFILE_DIR, 'SingletonLock');
  if (fs.existsSync(lock)) { fs.unlinkSync(lock); }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROMIUM_BIN, headless: true,
    args: ['--no-first-run','--no-default-browser-check','--disable-blink-features=AutomationControlled','--no-process-singleton'],
    ignoreDefaultArgs: ['--enable-automation'], viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${APOLLO_BASE}/#/sequences`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);

  let ok = 0, fail = [];
  for (const id of ids) {
    const res = await page.evaluate(async (seqId) => {
      const opts = { headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN':
        (document.querySelector('meta[name="csrf-token"]')||{}).content || '' }, credentials: 'include' };
      const tries = [
        ['PUT wrapped', `/api/v1/emailer_campaigns/${seqId}`, 'PUT', JSON.stringify({ emailer_campaign: { active: true } })],
        ['PUT flat',    `/api/v1/emailer_campaigns/${seqId}`, 'PUT', JSON.stringify({ active: true })],
        ['POST /activate', `/api/v1/emailer_campaigns/${seqId}/activate`, 'POST', '{}'],
        ['POST /start',    `/api/v1/emailer_campaigns/${seqId}/start`, 'POST', '{}'],
      ];
      let active=null;
      for (const [label,url,method,body] of tries) {
        try {
          const resp = await fetch(url, { ...opts, method, body });
          const text = await resp.text();
          try { const a = JSON.parse(text).emailer_campaign?.active; if (a!==undefined) active=a; } catch(_){}
          if (active === true) break;
        } catch(e) {}
      }
      let finalActive=null;
      try { const g=await fetch(`/api/v1/emailer_campaigns/${seqId}`, {...opts,method:'GET'}); finalActive=JSON.parse(await g.text()).emailer_campaign?.active; } catch(_){}
      return { seqId, finalActive };
    }, id);
    if (res.finalActive === true) { ok++; console.log('ACTIVE ', id); }
    else { fail.push(id); console.log('FAILED ', id, 'active=', res.finalActive); }
    await sleep(800);
  }
  console.log(`\nActivated ${ok}/${ids.length}. Failed: ${fail.join(', ')||'none'}`);
  await context.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
