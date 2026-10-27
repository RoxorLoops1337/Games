const {chromium}=require('playwright');
(async()=>{const [,,page,out,w,dsf]=process.argv;const b=await chromium.launch();const p=await b.newPage({viewport:{width:+(w||1500),height:900},deviceScaleFactor:+(dsf||1)});
p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await p.goto('file:///home/claude/nine-lives/demo/'+page);await p.waitForTimeout(300);await p.screenshot({path:'/home/claude/nine-lives/demo/shots/'+out,fullPage:true});await b.close();})();
