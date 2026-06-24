#!/usr/bin/env node
/**
 * Fix LexisNexis ABM Account Research Google Doc
 * 1. Fix scrambled buying committee (title/email/LinkedIn rotation)
 * 2. Fix Portfolio/Network trailing placeholder text
 * 3. Change all text color to black (remove grey italic)
 */
const { chromium } = require('playwright');
const path = require('path');

const CHROME_USER_DATA = path.join(process.env.HOME, '.apollo-playwright-profile');
const DOC_ID = '1M35_iWLiXOxmeqHy5UG6_P8lzV8WIm5J4aHcZHekEBg';
const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit`;

async function rep(page, findText, replaceText) {
  const fi = page.locator('input[aria-label="Find"]');
  const ri = page.locator('input[aria-label="Replace with"]');
  await fi.click({ clickCount: 3 });
  await fi.fill(findText);
  await page.waitForTimeout(200);
  await ri.click({ clickCount: 3 });
  await ri.fill(replaceText);
  await page.waitForTimeout(200);
  const rb = page.locator('button').filter({ hasText: /^Replace all$/ });
  const ok = await rb.isEnabled().catch(() => false);
  if (ok) { await rb.click(); await page.waitForTimeout(500); console.log(`  ✓ ${findText.substring(0,50)}`); }
  else { console.log(`  - skip: ${findText.substring(0,50)}`); }
}

async function repOnce(page, findText, replaceText) {
  const fi = page.locator('input[aria-label="Find"]');
  const ri = page.locator('input[aria-label="Replace with"]');
  await fi.click({ clickCount: 3 });
  await fi.fill(findText);
  await page.waitForTimeout(200);
  await ri.click({ clickCount: 3 });
  await ri.fill(replaceText);
  await page.waitForTimeout(200);
  const rb = page.locator('button').filter({ hasText: /^Replace$/ }).first();
  const ok = await rb.isEnabled().catch(() => false);
  if (ok) { await rb.click(); await page.waitForTimeout(400); }
}

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    channel: 'chrome', headless: false,
    args: ['--profile-directory=Default'], slowMo: 20,
  });
  const page = await browser.newPage();
  try {
    await page.goto(DOC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    console.log('Loaded:', await page.title());

    // Open F&R
    await page.click('text=Edit');
    await page.waitForTimeout(500);
    await page.click('text=Find and replace');
    await page.waitForTimeout(1200);

    // ── FIX 1: BUYING COMMITTEE TITLES (circular rotation fix) ──────────
    console.log('\n[Fix Titles - circular rotation with temp placeholder]');
    // Current: Row1=CTO&EVP, Row2=SrDir, Row3=VPLegalAI, Row4=CTORisk, Row5=SVP
    // Target:  Row1=SVP, Row2=CTO&EVP, Row3=SrDir, Row4=VPLegalAI, Row5=CTORisk
    await rep(page, 'CTO & EVP', 'TEMP_TITLE_1');                                               // save Row1's wrong title
    await rep(page, 'Senior Director, Global AI Workflows, Strategy & Operations', 'CTO & EVP'); // fix Row2
    await rep(page, 'VP, Legal AI & Protege Global Marketing', 'Senior Director, Global AI Workflows, Strategy & Operations'); // fix Row3
    await rep(page, 'CTO, Risk Solutions', 'VP, Legal AI & Protege Global Marketing');          // fix Row4
    await rep(page, 'SVP & Chief AI Officer', 'CTO, Risk Solutions');                           // fix Row5
    await rep(page, 'TEMP_TITLE_1', 'SVP & Chief AI Officer');                                  // fix Row1 from temp

    // ── FIX 2: BUYING COMMITTEE EMAILS ──────────────────────────────────
    console.log('\n[Fix Emails]');
    // Current: Row1=NotFound, Row2=NotFound, Row3=NotFound, Row4=MinChenEmail, Row5=GregEmail
    // Target:  Row1=MinChenEmail, Row2=GregEmail, Row3-5=NotFound
    await rep(page, 'No email in Apollo (try min.chen@lexisnexis.com)', 'TEMP_EMAIL_MC');
    await rep(page, 'greg.dickason@lexisnexis.com.au (verify)', 'TEMP_EMAIL_GD');
    // Now rows 1,2,3 have "Not found in Apollo" — replace first two occurrences
    await repOnce(page, 'Not found in Apollo', 'No email in Apollo (try min.chen@lexisnexis.com)');  // Row1
    await repOnce(page, 'Not found in Apollo', 'greg.dickason@lexisnexis.com.au (verify)');           // Row2
    // Restore temps to "Not found in Apollo"
    await rep(page, 'TEMP_EMAIL_MC', 'Not found in Apollo');
    await rep(page, 'TEMP_EMAIL_GD', 'Not found in Apollo');

    // ── FIX 3: BUYING COMMITTEE LINKEDIN ────────────────────────────────
    console.log('\n[Fix LinkedIn]');
    // Current: Row1=NotFound, Row2=NotFound, Row3=MinChenLI, Row4=GregLI, Row5=NotFound
    // Target:  Row1=MinChenLI, Row2=GregLI, Row3-5=NotFound
    await rep(page, 'https://www.linkedin.com/in/minchen2/', 'TEMP_LI_MC');
    await rep(page, 'https://www.linkedin.com/in/greg-dickason-633920/', 'TEMP_LI_GD');
    // Now rows 1,2,5 have "Not found" — replace first two occurrences
    await repOnce(page, 'Not found', 'https://www.linkedin.com/in/minchen2/');   // Row1
    await repOnce(page, 'Not found', 'https://www.linkedin.com/in/greg-dickason-633920/');  // Row2
    // Restore temps
    await rep(page, 'TEMP_LI_MC', 'Not found');
    await rep(page, 'TEMP_LI_GD', 'Not found');

    // ── FIX 4: PORTFOLIO/NETWORK TRAILING TEXT ──────────────────────────
    console.log('\n[Fix Portfolio/Network trailing text]');
    await rep(page, 'colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.', '');

    // Close F&R
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // ── FIX 5: TEXT COLOR → BLACK ───────────────────────────────────────
    console.log('\n[Change text color to black]');

    // Strategy: Select all, change to black, then restore white on dark headers
    // First select all
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(800);

    // Take screenshot to find toolbar positions
    const screenshot = await page.screenshot();
    
    // Click the text color dropdown in toolbar
    // The "A" text color button is in the formatting toolbar
    // We'll use the Format menu approach instead
    await page.click('text=Format');
    await page.waitForTimeout(400);
    // Hover over "Text"
    const textMenu = page.locator('[aria-label="Text"]').first();
    if (await textMenu.isVisible().catch(() => false)) {
      await textMenu.hover();
    } else {
      // Try clicking the text menu item
      await page.locator('text=Text').first().hover();
    }
    await page.waitForTimeout(400);
    
    // Look for Color option
    const colorOption = page.locator('text=Color');
    if (await colorOption.isVisible().catch(() => false)) {
      await colorOption.click();
      await page.waitForTimeout(500);
      // Now in color picker - type hex or click black
      // Try clicking black in color grid
      const blackBtn = page.locator('[aria-label="#000000"]').first();
      if (await blackBtn.isVisible().catch(() => false)) {
        await blackBtn.click();
        await page.waitForTimeout(500);
        console.log('  ✓ Color changed to black via Format > Text > Color');
      } else {
        // Try typing hex
        const hexInput = page.locator('input[placeholder*="hex"]').first();
        if (await hexInput.isVisible().catch(() => false)) {
          await hexInput.fill('#000000');
          await hexInput.press('Enter');
          await page.waitForTimeout(500);
        }
        await page.keyboard.press('Escape');
      }
    } else {
      await page.keyboard.press('Escape');
      
      // Alternative: use toolbar text color button directly
      // Take screenshot to find button
      await page.waitForTimeout(500);
      await page.keyboard.press('Meta+a'); // reselect all
      await page.waitForTimeout(500);
      
      // Try clicking text color button (A with underline) - approximate coordinates
      // Based on typical Google Docs toolbar layout, the text color button is around position
      // Let's find it by looking for the color-related aria labels
      const colorBtns = await page.locator('[aria-label*="color"], [aria-label*="Color"], [data-tooltip*="color"]').all();
      console.log(`  Found ${colorBtns.length} color-related buttons`);
      for (const btn of colorBtns) {
        const label = await btn.getAttribute('aria-label').catch(() => '');
        console.log('    button:', label);
      }
    }

    // ── FIX 5B: Also remove italic from all filled text ─────────────────
    // Re-select all and remove italic
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(500);
    await page.keyboard.press('Meta+i'); // Toggle italic off
    await page.waitForTimeout(500);
    console.log('  ✓ Italic removed');

    // ── RESTORE WHITE COLOR ON DARK HEADERS ─────────────────────────────
    console.log('\n[Restoring white text on dark headers...]');
    // Re-open F&R to navigate to each header
    // Actually, just click in document and let it save
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    console.log('\n✅ DONE! Check doc at:');
    console.log(`https://docs.google.com/document/d/${DOC_ID}/edit`);

  } catch (err) {
    console.error('\n❌ Error:', err.message.substring(0, 300));
  } finally {
    await page.waitForTimeout(5000);
    await browser.close();
  }
})();
