const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
const CHROMIUM_BIN=path.join(require('os').homedir(),'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR=path.join(require('os').homedir(),'.apollo-playwright-profile');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const ids=[['A','6a1a10520253cc001ca27010'],['B','6a1a10cf1170d30010407c5b'],['C','6a1a114e4dd0d900106f8382'],['D','6a1a11ccb36da5000c26f0ff']];
  const lock=path.join(PROFILE_DIR,'SingletonLock'); if(fs.existsSync(lock))fs.unlinkSync(lock);
  const ctx=await chromium.launchPersistentContext(PROFILE_DIR,{executablePath:CHROMIUM_BIN,headless:true,args:['--no-first-run','--no-default-browser-check','--no-process-singleton'],ignoreDefaultArgs:['--enable-automation'],viewport:{width:1400,height:900}});
  const page=await ctx.newPage();
  await page.goto('https://app.apollo.io/#/sequences',{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(4000);
  for(const [label,id] of ids){
    const res=await page.evaluate(async(id)=>{
      const opts={headers:{'Content-Type':'application/json'},credentials:'include'};
      const c=await fetch(`/api/v1/emailer_campaigns/${id}`,{...opts,method:'GET'});const cj=JSON.parse(await c.text()).emailer_campaign||{};
      const r=await fetch(`/api/v1/emailer_messages/search`,{...opts,method:'POST',body:JSON.stringify({emailer_campaign_ids:[id],per_page:25})});const j=JSON.parse(await r.text());
      const sent=(j.emailer_messages||[]).filter(m=>m.provider_message_id||m.completed_at);
      return {active:cj.active,archived:cj.archived,total_msgs:j.pagination?.total_entries,sent_count:sent.length};
    },id);
    console.log(label,id,JSON.stringify(res));
    await sleep(700);
  }
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
