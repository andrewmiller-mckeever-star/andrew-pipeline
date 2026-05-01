#!/usr/bin/env node
/**
 * Navigate to Seq A, click "+ Add a step", select Manual Email,
 * capture ALL network requests, and screenshot each phase.
 * Goal: understand exactly what API calls are made and what UI buttons exist.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const APOLLO_BASE = 'https://app.apollo.io';
const STATE_FILE  = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SEQ_A = '69f39737fc40d8001522f072';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    slowMo: 80,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    storageState: STATE_FILE,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // Intercept ALL API calls
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('apollo.io')) {
      const postData = req.postData();
      if (postData) {
        apiCalls.push({ type: 'request', method: req.method(), url: url.replace(APOLLO_BASE, ''), body: postData.slice(0, 600) });
      }
    }
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/v1/emailer_step') || url.includes('/api/v1/emailer_campaign')) {
      const method = resp.request().method();
      if (method !== 'GET') {
        try {
          const body = await resp.text().catch(() => '');
          apiCalls.push({ type: 'response', status: resp.status(), method, url: url.replace(APOLLO_BASE, ''), body: body.slice(0, 800) });
        } catch (_) {}
      }
    }
  });

  await page.goto(`${APOLLO_BASE}/#/sequences/${SEQ_A}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);

  await page.screenshot({ path: '/tmp/intercept-01-loaded.png', fullPage: false });
  console.log('Phase 1: Page loaded');

  // Find and log ALL visible buttons
  const allBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ tag: el.tagName, text: el.textContent?.trim().slice(0, 50), cls: (el.className || '').toString().slice(0, 60) }))
      .filter(b => b.text.length > 0);
  });
  console.log('\nAll visible buttons:');
  for (const b of allBtns) {
    console.log(`  [${b.tag}] "${b.text}" cls="${b.cls}"`);
  }

  // Try to click the Add a step button with various strategies
  console.log('\nAttempting to click "Add a step"...');
  let clicked = false;

  // Strategy 1: has-text partial match
  for (const sel of [
    'button:has-text("Add a step")',
    '[role="button"]:has-text("Add a step")',
    'button:has-text("Add step")',
    'text=Add a step',
    'button:has-text("+")',
    ':text("Add a step")',
  ]) {
    try {
      const el = page.locator(sel).last();
      if (await el.isVisible({ timeout: 2000 })) {
        const text = await el.innerText({ timeout: 1000 }).catch(() => '?');
        console.log(`  Found via "${sel}": text="${text}"`);
        await el.click({ timeout: 5000 });
        await sleep(2000);
        await page.screenshot({ path: `/tmp/intercept-02-after-click.png`, fullPage: false });
        console.log(`  Clicked! Screenshot: /tmp/intercept-02-after-click.png`);
        clicked = true;
        break;
      }
    } catch (e) {
      console.log(`  "${sel}": ${e.message.slice(0, 60)}`);
    }
  }

  if (!clicked) {
    // Try JavaScript click on any button containing "add" and "step"
    const jsClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const target = btns.find(b => {
        const t = b.textContent?.toLowerCase() || '';
        return (t.includes('add') && t.includes('step')) && b.offsetParent !== null;
      });
      if (target) {
        const text = target.textContent?.trim();
        target.click();
        return text;
      }
      return null;
    });
    if (jsClicked) {
      console.log(`  JS click on: "${jsClicked}"`);
      await sleep(2000);
      await page.screenshot({ path: '/tmp/intercept-02-after-js-click.png', fullPage: false });
      clicked = true;
    }
  }

  if (!clicked) {
    console.log('  FAILED to click Add a step button');
    await browser.close();
    return;
  }

  // What appeared after clicking Add a step?
  console.log('\nAfter clicking Add a step:');
  const afterBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], div[class*="menu"] *, [class*="dropdown"] *'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ tag: el.tagName, role: el.getAttribute('role') || '', text: el.textContent?.trim().slice(0, 60), cls: (el.className || '').toString().slice(0, 60) }))
      .filter(b => b.text.length > 1 && b.text.length < 60);
  });
  console.log('Visible interactive elements after Add a step click:');
  for (const b of afterBtns.slice(0, 20)) {
    console.log(`  [${b.tag}][role=${b.role}] "${b.text}" cls="${b.cls.slice(0, 40)}"`);
  }

  // Look for "Manual email" option
  console.log('\nLooking for Manual email option...');
  for (const sel of [
    'div[role="menuitem"]:has-text("Manual email")',
    '[role="menuitem"]:has-text("Manual")',
    'text=Manual email',
    ':text("Manual email")',
    'li:has-text("Manual email")',
    'button:has-text("Manual email")',
  ]) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        const text = await el.innerText({ timeout: 1000 }).catch(() => '?');
        console.log(`  Found "${sel}": text="${text}" — clicking...`);
        await el.click({ timeout: 3000 });
        await sleep(3000);
        await page.screenshot({ path: '/tmp/intercept-03-manual-email-selected.png', fullPage: false });
        console.log('  Screenshot: /tmp/intercept-03-manual-email-selected.png');
        break;
      }
    } catch (e) {
      console.log(`  "${sel}": ${e.message.slice(0, 60)}`);
    }
  }

  // What's visible now (after selecting Manual email)?
  console.log('\nAfter selecting Manual email:');
  await sleep(2000);

  const afterManualEmail = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, input, textarea, [class*="editor"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        tag: el.tagName,
        type: el.type || '',
        text: el.textContent?.trim().slice(0, 60),
        placeholder: el.placeholder || '',
        cls: (el.className || '').toString().slice(0, 60)
      }))
      .filter(el => el.text.length > 0 || el.placeholder.length > 0);
  });
  console.log('Interactive elements after Manual email selection:');
  for (const el of afterManualEmail.slice(0, 20)) {
    console.log(`  [${el.tag}][type=${el.type}] text="${el.text}" placeholder="${el.placeholder}"`);
  }

  // Look for any save/add/confirm button
  console.log('\nLooking for save/add/confirm buttons...');
  const saveBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
    return btns.filter(b => {
      const t = b.textContent?.toLowerCase() || '';
      return b.offsetParent !== null && (
        t.includes('save') || t.includes('add') || t.includes('confirm') ||
        t.includes('done') || t.includes('create') || t.includes('apply')
      );
    }).map(b => ({ text: b.textContent?.trim().slice(0, 60), cls: (b.className || '').toString().slice(0, 60) }));
  });
  console.log('Save/Add/Confirm buttons found:');
  for (const b of saveBtns) {
    console.log(`  "${b.text}" cls="${b.cls}"`);
  }

  console.log('\n\nCaptured API calls:');
  for (const call of apiCalls) {
    if (call.type === 'request') {
      console.log(`  REQUEST ${call.method} ${call.url}`);
      console.log(`    body: ${call.body}`);
    } else {
      console.log(`  RESPONSE ${call.status} ${call.method} ${call.url}`);
      console.log(`    body: ${call.body.slice(0, 300)}`);
    }
    console.log('');
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
