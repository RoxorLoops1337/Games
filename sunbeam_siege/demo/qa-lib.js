/* Shared QA helpers for headless runs against the real game. No em dashes. Needs python3 -m http.server 8123 in the project folder. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const OUT = '/home/claude/nine-lives/demo/shots/';
const URL = 'http://localhost:8123/index.html';
const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  phoneS: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desk: { viewport: { width: 1280, height: 800 } },
  deskS: { viewport: { width: 1024, height: 640 } },
  deskL: { viewport: { width: 1920, height: 1080 } },
  laptop: { viewport: { width: 1366, height: 768 } },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true }
};
async function open(view, o) {
  o = o || {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext(VIEWS[view] || VIEWS.desk);
  const pg = await ctx.newPage(); pg.setDefaultTimeout(6000);
  const errors = [];
  pg.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU|WebGL/i.test(m.text()))) errors.push(m.type() + ': ' + m.text()); });
  pg.on('pageerror', e => errors.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  await pg.goto(o.url || URL); await pg.waitForTimeout(1200);
  if (o.clear !== false) { await pg.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await pg.reload(); await pg.waitForTimeout(1200); }
  if (o.fast) await pg.evaluate(() => { SB.ui.settings.set('fast', 3); SB.ui.settings.set('reduceMotion', true); });
  let n = 0;
  const tag = o.tag || view;
  const shot = async (name) => { const f = `${OUT}${tag}-${name}.png`; await pg.screenshot({ path: f }); return f; };
  const wait = ms => pg.waitForTimeout(ms);
  const idle = async (max) => { for (let k = 0; k < (max || 300); k++) { const p = await pg.evaluate(() => SB.ui.battle ? SB.ui.battle.isPlaying() : false); if (!p) return; await pg.waitForTimeout(100); } };
  const cur = () => pg.evaluate(() => (SB.ui.current && SB.ui.current.name) || null);
  return { browser, ctx, pg, errors, shot, wait, idle, cur, close: () => browser.close() };
}
/* start a real run in page context and enter a battle directly. enc = function source string evaluated in page returning encounter, or {act, boss} */
async function startBattle(q, o) {
  o = o || {};
  await q.pg.evaluate((o) => {
    const K = SB.ui.flow;
    const run = SB.run.newRun({ seed: o.seed || 'QA1', clan: o.clan || 'alley', side: o.side || 'hearth', rank: 0, championId: o.champion || undefined });
    K.run = run; run.status = 'battle';
    const E = SB.data.encounters;
    let enc, node = { type: 'battle' };
    if (o.boss) { enc = JSON.parse(JSON.stringify(E['act' + o.act].boss.find(e => e.bossId === o.boss))); node = { type: 'boss' }; run.act = o.act; }
    else enc = JSON.parse(JSON.stringify(E['act' + (o.act || 1)][o.pool || 'prowl'][o.i || 0]));
    if (o.relics) run.relics = o.relics.map(id => ({ id, counter: 0 }));
    if (o.deck) { run.deck = []; o.deck.forEach(id => { try { run.deck.push(SB.cardInst.make(id)); } catch (e) {} }); }
    window.__after = null;
    const factory = (r, e, opts) => { const B = SB.battle.create(r, e, opts); if (o.setup) { try { (new Function('B', 'run', o.setup))(B, r); } catch (er) { console.error('setup ' + er.message); } } return B; };
    SB.ui.topbar.show(false);
    SB.ui.go('battle', { run, encounter: enc, node, type: node.type, factory, opts: { seed: o.bseed || 'qa' } });
  }, o);
  await q.wait(1500);
}
module.exports = { open, startBattle, OUT, VIEWS, chromium };
