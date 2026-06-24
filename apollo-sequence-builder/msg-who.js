const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
const CHROMIUM_BIN=path.join(require('os').homedir(),'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR=path.join(require('os').homedir(),'.apollo-playwright-profile');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const lock=path.join(PROFILE_DIR,'SingletonLock'); if(fs.existsSync(lock))fs.unlinkSync(lock);
  const ctx=await chromium.launchPersistentContext(PROFILE_DIR,{executablePath:CHROMIUM_BIN,headless:true,args:['--no-first-run','--no-default-browser-check','--no-process-singleton'],ignoreDefaultArgs:['--enable-automation'],viewport:{width:1400,height:900}});
  const page=await ctx.newPage();
  await page.goto('https://app.apollo.io/#/sequences',{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(4000);
  const res=await page.evaluate(async()=>{
    const opts={headers:{'Content-Type':'application/json'},credentials:'include'};
    const r=await fetch(`/api/v1/emailer_messages/search`,{...opts,method:'POST',body:JSON.stringify({emailer_campaign_ids:['6a1a10cf1170d30010407c5b'],per_page:25})});
    const j=JSON.parse(await r.text());
    const m=(j.emailer_messages||[])[0]||{};
    const cid=m.contact_id;
    let contact=null;
    if(cid){try{const c=await fetch(`/api/v1/contacts/${cid}`,{...opts,method:'GET'});const cj=JSON.parse(await c.text()).contact;contact={name:cj?.name,title:cj?.title,email:cj?.email,org:cj?.organization_name};}catch(e){contact={error:String(e)};}}
    return {contact_id:cid, subject:m.subject, completed_at:m.completed_at, contact};
  });
  console.log(JSON.stringify(res,null,2));
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
