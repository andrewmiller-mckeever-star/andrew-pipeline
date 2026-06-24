const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
const CHROMIUM_BIN=path.join(require('os').homedir(),'Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE_DIR=path.join(require('os').homedir(),'.apollo-playwright-profile');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const ids=process.argv.slice(2);
  const lock=path.join(PROFILE_DIR,'SingletonLock'); if(fs.existsSync(lock))fs.unlinkSync(lock);
  const ctx=await chromium.launchPersistentContext(PROFILE_DIR,{executablePath:CHROMIUM_BIN,headless:true,args:['--no-first-run','--no-default-browser-check','--disable-blink-features=AutomationControlled','--no-process-singleton'],ignoreDefaultArgs:['--enable-automation'],viewport:{width:1400,height:900}});
  const page=await ctx.newPage();
  await page.goto('https://app.apollo.io/#/sequences',{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(4000);
  for(const id of ids){
    const res=await page.evaluate(async(seqId)=>{
      const opts={headers:{'Content-Type':'application/json','X-CSRF-TOKEN':(document.querySelector('meta[name="csrf-token"]')||{}).content||''},credentials:'include'};
      const out=[];
      const tries=[
        ['POST /archive',`/api/v1/emailer_campaigns/${seqId}/archive`,'POST','{}'],
        ['PUT archived:true wrapped',`/api/v1/emailer_campaigns/${seqId}`,'PUT',JSON.stringify({emailer_campaign:{archived:true}})],
        ['PUT archived:t wrapped',`/api/v1/emailer_campaigns/${seqId}`,'PUT',JSON.stringify({emailer_campaign:{archived:'t'}})],
      ];
      for(const [label,url,method,body] of tries){
        try{const resp=await fetch(url,{...opts,method,body});const text=await resp.text();let archived=null,active=null;try{const j=JSON.parse(text).emailer_campaign;archived=j?.archived;active=j?.active;}catch(_){}out.push({label,status:resp.status,archived,active});if(archived===true)break;}catch(e){out.push({label,error:String(e)});}
      }
      let fa=null,fr=null;try{const g=await fetch(`/api/v1/emailer_campaigns/${seqId}`,{...opts,method:'GET'});const j=JSON.parse(await g.text()).emailer_campaign;fa=j?.active;fr=j?.archived;}catch(_){}
      return {seqId,attempts:out,finalActive:fa,finalArchived:fr};
    },id);
    console.log(JSON.stringify(res));
    await sleep(1000);
  }
  await ctx.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
