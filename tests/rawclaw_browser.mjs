import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const root=path.resolve('dist'), errors=[], broken=[];
const server=http.createServer((req,res)=>{
 let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
 if(file.endsWith('/'))file+='index.html';
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.png':'image/png','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.RAWCLAW_CHROME||path.resolve('../browser-tools/runtime/chromium'),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)broken.push(r.url());});
 await page.goto(`http://127.0.0.1:${server.address().port}/rawclaw/`);
 await page.waitForFunction(()=>window.CS?.ART.status().done===CS.ART.status().total&&CS.ART.status().found>=123);
 const art=await page.evaluate(()=>CS.ART.status());
 await page.evaluate(()=>{CS.INTRO.skip();CS.GAME.meta.introSeen=true;CS.GAME.showTitle();CS.GAME.draw();});
 await page.waitForTimeout(100);
 const fits=[];
 async function assertFits(label) {
   const bounds=await page.evaluate(()=>{
     const r=document.querySelector('#stage').getBoundingClientRect(),v=visualViewport;
     const wrap=document.querySelector('#wrap'),w=wrap.getBoundingClientRect(),css=getComputedStyle(wrap);
     return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,
       minX:Math.max(v.offsetLeft,w.left+parseFloat(css.paddingLeft)),
       minY:Math.max(v.offsetTop,w.top+parseFloat(css.paddingTop)),
       maxX:Math.min(v.offsetLeft+v.width,w.right-parseFloat(css.paddingRight)),
       maxY:Math.min(v.offsetTop+v.height,w.bottom-parseFloat(css.paddingBottom))};
   });
   assert(bounds.left>=bounds.minX-.5&&bounds.top>=bounds.minY-.5&&bounds.right<=bounds.maxX+.5&&bounds.bottom<=bounds.maxY+.5,label+JSON.stringify(bounds));
   fits.push(label);
 }
 for(const size of [{width:320,height:568},{width:375,height:600},{width:390,height:664},{width:844,height:390}]) {
   await page.setViewportSize(size);await page.evaluate(()=>CS.GAME.resize());await assertFits(`${size.width}x${size.height}`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
   document.documentElement.style.setProperty('--safe-t','47px');
   document.documentElement.style.setProperty('--safe-b','34px');
   document.documentElement.style.setProperty('--safe-l','12px');
   document.documentElement.style.setProperty('--safe-r','12px');
   Object.defineProperties(visualViewport,{height:{configurable:true,value:600},offsetTop:{configurable:true,value:10}});
   visualViewport.dispatchEvent(new Event('resize'));
 });
 await assertFits('browser bars + notch + home indicator');
 await page.screenshot({path:'../rawclaw-phone-fit.png'});
 await page.evaluate(()=>{
   Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:30});
   visualViewport.dispatchEvent(new Event('scroll'));
 });
 await assertFits('visible viewport scroll');
 await page.evaluate(()=>{
   delete visualViewport.height;delete visualViewport.offsetTop;
   for(const k of ['t','b','l','r'])document.documentElement.style.removeProperty('--safe-'+k);
   visualViewport.dispatchEvent(new Event('resize'));
   CS.GAME.showHelp();
 });
 const scroll=await page.evaluate(()=>{
   const e=document.querySelector('#scr-help');e.scrollTop=200;
   return {canScroll:e.scrollTop>0,action:getComputedStyle(e).touchAction,stage:getComputedStyle(document.querySelector('#stage')).touchAction};
 });
 assert(scroll.canScroll&&scroll.action==='pan-y'&&scroll.stage==='auto','long menus allow touch scrolling');
 await page.evaluate(()=>CS.GAME.showTitle());
 await page.screenshot({path:'../rawclaw-title.png'});
 await page.evaluate(()=>{const G=CS.GAME;CS.AUDIO.muted=true;G.meta.tutorialDone=true;G.newRun('knight',42);G.startFight(['rat'],'normal');for(let i=0;i<300;i++)G.update(1/60);G.draw();});
 await page.screenshot({path:'../rawclaw-game.png'});
 const grab=await page.evaluate(()=>{const G=CS.GAME,before=G.state().grabs,phases=new Set();G.steer(G.fs.items.reduce((a,b)=>b.y<a.y?b:a).x);for(let i=0;i<90;i++)G.update(1/60);const accepted=G.dropClaw();for(let i=0;i<1200&&G.state().grabInFlight;i++){phases.add(G.state().rigPhase);G.update(1/60);}return{accepted,before,after:G.state().grabs,phases:[...phases],busy:G.state().grabInFlight,finite:G.fs.items.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y))};});
 assert(grab.accepted&&!grab.busy&&grab.finite);assert(grab.phases.includes('lifting')&&grab.phases.includes('releasing'));assert.deepEqual(errors,[]);assert.deepEqual(broken,[]);console.log(JSON.stringify({art,fits,scroll,grab,errors,broken}));
} finally {await browser?.close();server.close();}
