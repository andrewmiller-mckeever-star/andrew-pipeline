const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
const CHROMIUM_BIN=path.join(require('os').homedir(),'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR=path.join(require('os').homedir(),'.apollo-playwright-profile');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const ids=process.argv.slice(2);
  const lock=path.join(PROFILE_DIR,'SingletonLock'); if(fs.existsSync(lock))fs.unlinkSync(lock);
  const ctx=await chromium.launchPersistentContext(PROFILE_DIR,{executablePath:CHROMIUM_BIN,headless:true,args:['--no-first-run','--no-default-browser-check','--no-process-singleton'],ignoreDefaultArgs:['--enable-automation'],viewport:{width:1400,height:900}});
  const page=await ctx.newPage();
  await page.goto('https://app.apollo.io/#/sequences',{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(4000);
  for(const id of ids){
    const res=await page.evaluate(async(id)=>{
      const opts={headers:{'Content-Type':'application/json'},credentials:'include'};
      const r=await fetch(`/api/v1/emailer_messages/search`,{...opts,method:'POST',body:JSON.stringify({emailer_campaign_ids:[id],per_page:25})});
      const j=JSON.parse(await r.text());
      return (j.emailer_messages||[]).map(m=>({
        type:m.type, status:m.status, due_at:m.due_at, completed_at:m.completed_at,
        failed_at:m.failed_at, failure_reason:m.failure_reason, not_sent_reason:m.not_sent_reason,
        provider_message_id:m.provider_message_id, bounce:m.bounce, spam_blocked:m.spam_blocked, replied:m.replied
      }));
    },id);
    console.log(id, JSON.stringify(res));
    await sleep(800);
  }
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
