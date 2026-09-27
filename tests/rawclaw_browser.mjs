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
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)broken.push(r.url());});
 await page.goto(`http://127.0.0.1:${server.address().port}/rawclaw/`);
 await page.waitForFunction(()=>window.CS?.ART.status().done===CS.ART.status().total&&CS.ART.status().found>=123);
 const art=await page.evaluate(()=>CS.ART.status());
 await page.evaluate(()=>{CS.INTRO.skip();CS.GAME.meta.introSeen=true;CS.GAME.showTitle();CS.GAME.draw();});
 await page.waitForTimeout(100);
 await page.screenshot({path:'../rawclaw-title.png'});
 await page.evaluate(()=>{const G=CS.GAME;CS.AUDIO.muted=true;G.meta.tutorialDone=true;G.newRun('knight',42);G.startFight(['rat'],'normal');for(let i=0;i<300;i++)G.update(1/60);G.draw();});
 await page.screenshot({path:'../rawclaw-game.png'});
 const grab=await page.evaluate(()=>{const G=CS.GAME,before=G.state().grabs,phases=new Set();G.steer(G.fs.items.reduce((a,b)=>b.y<a.y?b:a).x);for(let i=0;i<90;i++)G.update(1/60);const accepted=G.dropClaw();for(let i=0;i<1200&&G.state().grabInFlight;i++){phases.add(G.state().rigPhase);G.update(1/60);}return{accepted,before,after:G.state().grabs,phases:[...phases],busy:G.state().grabInFlight,finite:G.fs.items.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y))};});
 assert(grab.accepted&&!grab.busy&&grab.finite);assert(grab.phases.includes('lifting')&&grab.phases.includes('releasing'));assert.deepEqual(errors,[]);assert.deepEqual(broken,[]);console.log(JSON.stringify({art,grab,errors,broken}));
} finally {await browser?.close();server.close();}
