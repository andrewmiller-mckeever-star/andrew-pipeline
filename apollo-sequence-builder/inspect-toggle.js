#!/usr/bin/env node
// Inspect Apollo sequence-detail switches to find the sequence-level active toggle. Read-only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const CHROMIUM_BIN = path.join(require('os').homedir(),'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR = path.join(require('os').homedir(), '.apollo-playwright-profile');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async () => {
  const id = process.argv[2];
  const lock = path.join(PROFILE_DIR,'SingletonLock'); if (fs.existsSync(lock)) fs.unlinkSync(lock);
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR,{executablePath:CHROMIUM_BIN,headless:true,args:['--no-first-run','--no-default-browser-check','--disable-blink-features=AutomationControlled','--no-process-singleton'],ignoreDefaultArgs:['--enable-automation'],viewport:{width:1500,height:950}});
  const page = await ctx.newPage();
  // sequence detail page
  await page.goto(`https://app.apollo.io/#/sequences/${id}`, {waitUntil:'domcontentloaded',timeout:60000});
  await sleep(6000);
  const info = await page.evaluate(() => {
    const out = [];
    const switches = document.querySelectorAll('input[role="switch"], [role="switch"], button[role="switch"]');
    switches.forEach((el,i) => {
      const r = el.getBoundingClientRect();
      out.push({
        i, tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
        checked: el.checked,
        nearText: (el.closest('div')?.innerText||'').slice(0,60).replace(/\n/g,' '),
        x: Math.round(r.x), y: Math.round(r.y), top: r.y < 300
      });
    });
    // also look for elements with text Active/Inactive near top
    const labels = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length===0) {
        const t=(el.innerText||'').trim();
        if ((t==='Active'||t==='Inactive'||t==='Paused') && el.getBoundingClientRect().y<300) {
          const r=el.getBoundingClientRect(); labels.push({t,x:Math.round(r.x),y:Math.round(r.y)});
        }
      }
    });
    return { title: document.title, switchCount: switches.length, switches: out, topLabels: labels };
  });
  console.log(JSON.stringify(info,null,2));
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
