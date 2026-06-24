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
    const res=await page.evaluate(async(seqId)=>{
      const opts={headers:{'Content-Type':'application/json'},credentials:'include'};
      const g=await fetch(`/api/v1/emailer_campaigns/${seqId}`,{...opts,method:'GET'});
      const j=JSON.parse(await g.text()).emailer_campaign||{};
      // counts of interest
      const keys=['name','active','archived','num_steps','num_contacts','active_count','paused_count','finished_count','bounced_count','not_sent_count','delivered_count','opened_count','replied_count','clicked_count','scheduled_count','completed_count','sent_count'];
      const picked={}; keys.forEach(k=>{if(k in j)picked[k]=j[k];});
      // also any stats object
      picked._stats = j.stats || j.emailer_campaign_stats || null;
      return {seqId, picked};
    },id);
    console.log(JSON.stringify(res));
    await sleep(800);
  }
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
