#!/usr/bin/env node
/**
 * Inspect Apollo task filter DOM to find the correct selectors.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const APOLLO_BASE = 'https://app.apollo.io';
const STATE_FILE  = path.join(__dirname, 'apollo_session.json');
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    slowMo: 100,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    storageState: STATE_FILE,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(`${APOLLO_BASE}/#/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);

  // Take a screenshot of initial state
  await page.screenshot({ path: '/tmp/debug-filter-initial.png', fullPage: false });
  console.log('Screenshot: /tmp/debug-filter-initial.png');

  // Dump all inputs and their attributes
  const inputInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, [contenteditable], textarea'));
    return inputs.map(el => ({
      tag: el.tagName,
      type: el.type || '',
      placeholder: el.placeholder || el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
      id: el.id || '',
      className: (el.className || '').toString().slice(0, 80),
      value: (el.value || el.textContent || '').slice(0, 30),
      visible: el.offsetParent !== null,
    })).filter(el => el.visible);
  });

  console.log('\n--- Visible inputs on page ---');
  for (const inp of inputInfo) {
    console.log(`${inp.tag}[type=${inp.type}] placeholder="${inp.placeholder}" id="${inp.id}" class="${inp.className}"`);
  }

  // Look for "Task Assignee" section specifically
  const assigneeInfo = await page.evaluate(() => {
    // Find element containing "Specify owners"
    const allEls = Array.from(document.querySelectorAll('*'));
    const ownerEls = allEls.filter(el => {
      const p = el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '';
      return p.toLowerCase().includes('owner') || p.toLowerCase().includes('assignee');
    });
    return ownerEls.map(el => ({
      tag: el.tagName,
      placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
      id: el.id || '',
      className: (el.className || '').toString().slice(0, 100),
    }));
  });

  console.log('\n--- Elements with owner/assignee placeholder ---');
  for (const el of assigneeInfo) {
    console.log(`${el.tag} placeholder="${el.placeholder}" id="${el.id}" class="${el.className}"`);
  }

  // Try clicking the "Task Assignee" text to see if it expands
  try {
    const assigneeLabel = page.locator('text="Task Assignee"').first();
    if (await assigneeLabel.isVisible({ timeout: 2000 })) {
      await assigneeLabel.click();
      await sleep(1000);
      console.log('\nClicked "Task Assignee" label');
      await page.screenshot({ path: '/tmp/debug-filter-after-click.png', fullPage: false });
      console.log('Screenshot after click: /tmp/debug-filter-after-click.png');
    }
  } catch (e) {
    console.log(`Could not click Task Assignee: ${e.message}`);
  }

  // After clicking, dump inputs again
  const inputInfo2 = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, [contenteditable="true"], textarea'));
    return inputs.map(el => ({
      tag: el.tagName,
      type: el.type || '',
      placeholder: el.placeholder || el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
      id: el.id || '',
      className: (el.className || '').toString().slice(0, 80),
      visible: el.offsetParent !== null,
    })).filter(el => el.visible);
  });

  console.log('\n--- Visible inputs after clicking Task Assignee ---');
  for (const inp of inputInfo2) {
    console.log(`${inp.tag}[type=${inp.type}] placeholder="${inp.placeholder}" id="${inp.id}" class="${inp.className}"`);
  }

  // Use the "Search tasks" input to search for George He
  console.log('\n--- Testing "Search tasks" box ---');
  try {
    const searchTasksInput = page.locator('input[placeholder="Search tasks"]').first();
    if (await searchTasksInput.isVisible({ timeout: 2000 })) {
      console.log('Found "Search tasks" input!');
      await searchTasksInput.click();
      await page.keyboard.type('George He', { delay: 50 });
      await sleep(2000);
      await page.screenshot({ path: '/tmp/debug-search-george.png', fullPage: false });
      console.log('Screenshot: /tmp/debug-search-george.png');

      // Inspect what rows appeared
      const rows = await page.evaluate(() => {
        const allRows = Array.from(document.querySelectorAll('tr, [class*="task-row"], [class*="taskRow"], [class*="task_row"]'));
        return allRows.filter(el => el.offsetParent !== null).map(el => ({
          tag: el.tagName,
          className: (el.className || '').toString().slice(0, 80),
          text: el.textContent?.trim().slice(0, 80),
        })).filter(r => r.text.length > 5).slice(0, 20);
      });
      console.log('Rows after search:');
      for (const r of rows) {
        console.log(`  ${r.tag}[${r.className}]: "${r.text}"`);
      }
    } else {
      console.log('"Search tasks" input not found');
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Also try the Task Assignee filter using the "Specify owners..." div (custom component)
  console.log('\n--- Testing Task Assignee custom component ---');
  try {
    // The "Specify owners..." is likely a div styled to look like an input
    const specifyEl = page.locator('text="Specify owners..."').first();
    if (await specifyEl.isVisible({ timeout: 2000 })) {
      console.log('Found "Specify owners..." element!');
      const tagName = await specifyEl.evaluate(el => el.tagName);
      console.log(`Tag: ${tagName}`);
      await specifyEl.click();
      await sleep(1000);
      await page.keyboard.type(process.env.ASSIGNEE_NAME || 'AE_NAME', { delay: 50 });
      await sleep(1500);
      await page.screenshot({ path: '/tmp/debug-assignee-typed.png', fullPage: false });
      console.log('Screenshot: /tmp/debug-assignee-typed.png');

      // What appeared after typing?
      const opts = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li, [class*="option"]'));
        return els.filter(el => el.offsetParent !== null)
          .map(el => el.textContent?.trim())
          .filter(t => t && t.toLowerCase().includes('andrew'))
          .slice(0, 5);
      });
      console.log('Options matching assignee:', opts);
    } else {
      console.log('"Specify owners..." element not visible');

      // Try clicking on the Task Assignee section header
      const header = page.locator('text="Task Assignee"').first();
      if (await header.isVisible({ timeout: 2000 })) {
        await header.click();
        await sleep(800);
        const specifyAfter = page.locator('text="Specify owners..."').first();
        if (await specifyAfter.isVisible({ timeout: 2000 })) {
          console.log('"Specify owners..." appeared after clicking header');
          const tagAfter = await specifyAfter.evaluate(el => el.tagName);
          console.log(`Tag: ${tagAfter}`);
        }
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
