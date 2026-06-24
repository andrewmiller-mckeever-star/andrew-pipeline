const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
const CHROMIUM_BIN=path.join(require('os').homedir(),'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR=path.join(require('os').homedir(),'.apollo-playwright-profile');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const id=process.argv[2];
  const lock=path.join(PROFILE_DIR,'SingletonLock'); if(fs.existsSync(lock))fs.unlinkSync(lock);
  const ctx=await chromium.launchPersistentContext(PROFILE_DIR,{executablePath:CHROMIUM_BIN,headless:true,args:['--no-first-run','--no-default-browser-check','--no-process-singleton'],ignoreDefaultArgs:['--enable-automation'],viewport:{width:1400,height:900}});
  const page=await ctx.newPage();
  await page.goto('https://app.apollo.io/#/sequences',{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(4000);
  const res=await page.evaluate(async(id)=>{
    const opts={headers:{'Content-Type':'application/json'},credentials:'include'};
    const r=await fetch(`/api/v1/emailer_messages/search`,{...opts,method:'POST',body:JSON.stringify({emailer_campaign_ids:[id],per_page:25})});
    const j=JSON.parse(await r.text());
    const msgs=(j.emailer_messages||[]).map(m=>({
      status:m.status, delivery_status:m.delivery_status, email_type:m.email_type,
      sent_at:m.sent_at, delivered_at:m.delivered_at, scheduled_at:m.scheduled_at,
      bounced:m.bounced, to:m.to_email||m.contact_email, subject:m.subject,
      step_type:m.emailer_step?.type, keys:Object.keys(m).slice(0,40)
    }));
    return {total:j.pagination?.total_entries, msgs};
  },id);
  console.log(JSON.stringify(res,null,2));
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
