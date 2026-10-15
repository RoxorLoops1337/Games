import { launch, audit, stopServer } from './ludus3d_qa_lib.mjs';
const setup = `(async()=>{const g=__LM3D.game,S=g.S; S.week=60; S.fame=800; S.flags.tut={v:1,done:1}; const LM=globalThis.LM; const K=LM.campaign; const c=K.get(S,true); c.ch=3; c.card=0; c.lastBeat=0; c.seen={b31:1,b32:1}; c.nem.intro=true; c.nem.scars=['gash_scar']; c.nem.stage=3; c.nem.fates=[{id:'spare',wk:30,ch:2}]; c.flags.sparedNem=1; S.stats.spares=1; if(S.glads.length<3){ for(let i=0;i<3;i++){ const gl=LM.makeGlad({id:S.nextId++,style:LM.D.STYLE_IDS[i],lvl:6+i}); gl.fame=30-i; S.glads.push(gl);} } S.plots[5]={b:'barracks',l:4}; const m=await import('/ludus_maximus_3d/js/screens/campaign.js'); window.__sf=m.storyFlow(g.ctx); return 1;})()`;
const out = [];
for (const [vp, cls] of [['phone', 'lx-large-text'], ['landscape', ''], ['desktop', '']]) {
  const h = await launch({ vp, query: 'new=1&rich=1&empty=1&tier=low&manual=1&notut=1' });
  if (cls) await h.page.evaluate((c) => document.body.className += ' ' + c, cls);
  await h.page.evaluate(setup); await h.page.waitForTimeout(800);
  await h.page.evaluate(() => { __LM3D.advance(3); });
  const adv = async () => { await h.page.evaluate(() => { const b = document.querySelector('.cp-sheet .lx-actions .lx-btn'); b && b.click(); __LM3D.advance(2); }); await h.page.waitForTimeout(300); };
  await audit(h, vp + ' scene lines'); await adv(); await adv(); await audit(h, vp + ' scene choices');
  await h.page.evaluate(() => { document.querySelector('.cp-opt .lx-btn').click(); __LM3D.advance(2); }); await h.page.waitForTimeout(300); await audit(h, vp + ' scene after');
  await h.page.evaluate(async () => { __LM3D.game.closeAll(); await __LM3D.game.open('world', { tab: 'story' }); __LM3D.advance(2); }); await h.page.waitForTimeout(500); await audit(h, vp + ' story tab');
  out.push(...h.F.list); await h.browser.close();
}
stopServer(); console.log('FINDINGS', out.length); out.forEach((f) => console.log(JSON.stringify(f).slice(0, 300)));
