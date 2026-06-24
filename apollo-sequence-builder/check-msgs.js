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
  const res=await page.evaluate(async(ids)=>{
    const opts={headers:{'Content-Type':'application/json'},credentials:'include'};
    const out={};
    // Try messages endpoint filtered by campaign + finished/sent
    for(const id of ids){
      const attempts={};
      // emailer_messages search
      try{
        const r=await fetch(`/api/v1/emailer_messages/search`,{...opts,method:'POST',body:JSON.stringify({emailer_campaign_ids:[id],per_page:25})});
        const t=await r.text(); let j; try{j=JSON.parse(t);}catch(_){j=null;}
        attempts.messages_search={status:r.status, total: j?.pagination?.total_entries, statuses:(j?.emailer_messages||[]).map(m=>({status:m.status||m.delivery_status, sent_at:m.sent_at, type:m.email_type}))};
      }catch(e){attempts.messages_search={error:String(e)};}
      out[id]=attempts;
    }
    return out;
  },ids);
  console.log(JSON.stringify(res,null,2));
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
