// Drop the Bass visual regression: boots the real game in headless Chromium (Playwright) from a local static server, walks title, hub (5 tabs),
// a story run with deployed turrets, a snapshot resume with a huge run clock, the results and defeat screens and the share card.
// Asserts no console or page errors, and canvas PIXEL checks: turrets really are drawn (also after a resume), hub and results are not blank.
// Skips with exit 0 when Playwright or Chromium is missing, or DTB_BROWSER_SKIP=1. Screenshots go to $DTB_SHOT_DIR when set.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass visual: SKIPPED (' + why + ')'); process.exit(0); };
if (process.env.DTB_BROWSER_SKIP === '1') skip('DTB_BROWSER_SKIP=1');
let pw = null;
for (const base of [ROOT, '/opt/node-tools', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
  for (const dir of [base, path.join(base, 'node_modules')]) { try { pw = createRequire(path.join(dir, 'x.js'))('playwright'); if (pw && pw.chromium) break; } catch (e) { pw = null; } }
  if (pw) break;
}
if (!pw) skip('playwright not found');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p.startsWith('/api/')) { res.writeHead(204); res.end(); return; }   // the anonymous stats beacon
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => srv.listen(0, r));
let browser;
try { browser = await pw.chromium.launch(); } catch (e) { srv.close(); skip('chromium would not start'); }

const errs = [];
const fail = (m) => errs.push(m);
const SHOTS = process.env.DTB_SHOT_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const T0 = Date.now();
let page;
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'dtb_' + name + '.png') }); };

// how many distinct (quantised) colours a screenshot holds: a blank screen has 1 or 2
async function colourCount(buf) {
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return seen.size;
  }, buf.toString('base64'));
}
// read the game canvas around each logical point: returns one flat RGB array per point (a 44 x 44 box)
const SAMPLE = `(pts) => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const cv = document.getElementById('game'), v = __dtb.app.view, x = cv.getContext('2d'), out = [];
  for (const [lx, ly] of pts) {
    const px = Math.round((v.ox + lx * v.s) * v.dpr) - 22, py = Math.round((v.oy + ly * v.s) * v.dpr) - 22;
    out.push(Array.from(x.getImageData(Math.max(0, px), Math.max(0, py), 44, 44).data));
  }
  res(out);
})))`;
const sample = (pts) => page.evaluate(`(${SAMPLE})(${JSON.stringify(pts)})`);
const diff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length && i < b.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++; } return n ? s / n / 3 : 0; };
const spread = (a) => { const seen = new Set(); for (let i = 0; i < a.length; i += 4) seen.add(((a[i] >> 4) << 8) | ((a[i + 1] >> 4) << 4) | (a[i + 2] >> 4)); return seen.size; };
async function frames(n = 3) { await page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n); }
async function noModals() { await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove())); }
async function waitScreen(s, ms = 10000) { await page.waitForFunction((x) => window.__dtb.app.screen === x, s, { timeout: ms }); }

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') fail('console: ' + m.text()); });
  page.on('pageerror', (e) => fail('PAGEERROR ' + e.message));
  await page.goto('http://localhost:' + srv.address().port + '/drop_the_bass/');
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });

  // ---- title
  await frames(5);
  await shot('title');
  if ((await colourCount(await page.screenshot())) < 12) fail('title screen looks blank');
  const font = await page.evaluate(async () => { await document.fonts.load('20px "Patrick Hand"'); return document.fonts.check('20px "Patrick Hand"'); });
  if (!font) fail('Patrick Hand did not load (self-hosted font missing?)');

  // ---- hub, all five tabs
  await page.evaluate(() => { const a = __dtb.app; a.profile.tutorial.done = true; a.profile.story.intro = true; a.profile.story.worlds.garage = true; a.sessionGreeted = true; a.openHub('tour'); });
  await page.waitForSelector('.tabs');
  for (const t of ['Tour', 'Studio', 'Band', 'Crates', 'Goals']) {
    await noModals();
    await page.click('.tab:has-text("' + t + '")');
    await frames(4);
    await shot('hub_' + t.toLowerCase());
    const n = await colourCount(await page.screenshot());
    if (n < 14) fail('hub tab ' + t + ' looks blank (' + n + ' colours)');
    const txt = await page.evaluate(() => document.querySelector('#ui').innerText.length);
    if (txt < 20) fail('hub tab ' + t + ' has no text');
  }
  await noModals();
  await page.click('.tab:has-text("Tour")');

  // ---- a story run
  await page.evaluate(() => { __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0, seed: 11 }); });
  await waitScreen('battle');
  await noModals();
  // empty board baseline at every buildable slot (pause the clock so the prep timer cannot start a wave)
  const slotPts = await page.evaluate(() => { const b = __dtb.app.battle, r = b.run; r.prepT = 9999; return r.map.buildable.map((s) => [s.x, s.y]); });
  if (slotPts.length < 8) fail('map has too few buildable slots: ' + slotPts.length);
  const base = await sample(slotPts);
  await page.evaluate(() => { const b = __dtb.app.battle; b.run.coins = 99999; b.run.prepT = 9999; for (let i = 0; i < 7; i++) b.doDeploy(); b.run.mergeAll && b.run.mergeAll(1); });
  const tpos = await page.evaluate(() => __dtb.app.battle.run.turrets.map((t) => [t.x, t.y, t.level]));
  if (tpos.length < 4) fail('fewer than 4 turrets deployed: ' + tpos.length);
  await noModals();
  const after = await sample(tpos.map((t) => [t[0], t[1]]));
  const baseAt = (x, y) => { const i = slotPts.findIndex((p) => Math.abs(p[0] - x) < 2 && Math.abs(p[1] - y) < 2); return i >= 0 ? base[i] : null; };
  const checkTurrets = (label, aft, pos) => {
    let ok = 0;
    pos.forEach((t, i) => {
      const bl = baseAt(t[0], t[1]);
      const d = bl ? diff(bl, aft[i]) : 99, sp = spread(aft[i]);
      if (d > 14 && sp >= 8) ok++; else fail(label + ': turret ' + i + ' at ' + Math.round(t[0]) + ',' + Math.round(t[1]) + ' is not visible (diff ' + d.toFixed(1) + ', colours ' + sp + ')');
    });
    return ok;
  };
  checkTurrets('deployed', after, tpos);
  await shot('battle_turrets');

  // ---- snapshot resume with a large run clock (turrets were invisible after reload once)
  for (const variant of ['shifted', 'old-born']) {
    await page.evaluate((v) => {
      const a = __dtb.app, b = a.battle, run = b.run;
      const snap = run.snapshot(); const SHIFT = 123456;
      snap.t += SHIFT; if (v === 'shifted') for (const t of snap.turrets) t.born += SHIFT;
      a.profile.resume = { cfg: run.cfg, snap, world: run.world.id, wave: run.wave, mode: run.mode, t: Date.now() };
      a.resumeRun();
    }, variant);
    await waitScreen('battle');
    await noModals();
    await page.evaluate(() => { const r = __dtb.app.battle.run; r.prepT = 9999; });
    const pos2 = await page.evaluate(() => __dtb.app.battle.run.turrets.map((t) => [t.x, t.y, t.level]));
    if (pos2.length !== tpos.length) fail('resume (' + variant + ') lost turrets: ' + pos2.length + ' vs ' + tpos.length);
    const aft2 = await sample(pos2.map((t) => [t[0], t[1]]));
    checkTurrets('resumed ' + variant, aft2, pos2);
    await shot('battle_resumed_' + variant);
  }

  // ---- results (win), with a recap-free result, then defeat with a recap
  // the first clear of a world plays its epilogue before the results: mark it seen so the results screen shows at once
  await page.evaluate(() => { const a = __dtb.app, b = a.battle; a.profile.story.epilogues = Object.assign({}, a.profile.story.epilogues, { [b.run.world.id]: true }); b.run.finish(true); a.hooks.onEnd(b.run, b); });
  await page.waitForSelector('.res-title', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('results');
  if ((await colourCount(await page.screenshot())) < 14) fail('results screen looks blank');
  if (!(await page.$('[data-share]'))) fail('results screen has no Share button');
  // the share card renders a 1080 x 1350 non-blank picture of the final board
  const card = await page.evaluate(async () => {
    const mod = await import('./js/share.js'); const a = __dtb.app;
    const run = new __dtb.Run({ world: 'garage', mode: 'story', seed: 5, loadout: ['kick', 'snare', 'hat', 'sub'], baseFx: [['startCoins', 'add', 5000]] });
    for (let i = 0; i < 8; i++) run.deploy(null, { onBeat: false });
    run.finish(true);
    const cv = mod.makeShareCard(run, run.result, a.profile);
    const x = cv.getContext('2d'), d = x.getImageData(0, 0, cv.width, cv.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return { w: cv.width, h: cv.height, colours: seen.size, url: cv.toDataURL('image/png').length };
  });
  if (card.w !== 1080 || card.h !== 1350) fail('share card size ' + card.w + 'x' + card.h);
  if (card.colours < 40) fail('share card looks blank (' + card.colours + ' colours)');
  if (SHOTS) { const b64 = await page.evaluate(async () => { const mod = await import('./js/share.js'); const a = __dtb.app; const run = new __dtb.Run({ world: 'garage', mode: 'story', seed: 5, loadout: ['kick', 'snare', 'hat', 'sub'], baseFx: [['startCoins', 'add', 5000]] }); for (let i = 0; i < 8; i++) run.deploy(null, { onBeat: false }); run.finish(true); return mod.makeShareCard(run, run.result, a.profile).toDataURL('image/png').split(',')[1]; }); fs.writeFileSync(path.join(SHOTS, 'dtb_sharecard.png'), Buffer.from(b64, 'base64')); }

  await noModals();
  await page.evaluate(() => { __dtb.app.openHub('tour'); });
  await page.evaluate(() => { __dtb.app.startRun({ mode: 'story', world: 'garage', encore: 0, seed: 12, confirmed: true }); });
  await waitScreen('battle');
  await noModals();
  await page.evaluate(async () => {
    const a = __dtb.app, b = a.battle, run = b.run;
    const { ENEMIES } = await import('./js/data_core.js'); const ids = Object.keys(ENEMIES);
    run.finish(false);
    run.result.recap = { leaksByLane: [0, 5, 2, 0], leakTypes: [{ type: ids[0], count: 4 }, { type: ids[1], count: 3 }], worstWave: 7, topKillers: [{ type: 'kick', count: 30 }], bossFinisher: null, tips: ['Put turrets near the busiest lane.', 'Merge early.', 'Use heroes on bosses.', 'a fourth tip is dropped'] };
    a.hooks.onEnd(run, b);
  });
  await page.waitForSelector('.res-title.lose', { timeout: 10000 });
  await page.waitForSelector('.recap', { timeout: 5000 }).catch(() => fail('defeat screen shows no recap'));
  await page.waitForTimeout(900);
  await shot('defeat');
  if ((await page.$$('.rc-type')).length < 2) fail('recap shows no enemy icons for leakTypes');
  const tips = await page.evaluate(() => document.querySelectorAll('.rc-tip').length);
  if (tips !== 3) fail('recap should show 3 tips, got ' + tips);
  if (!(await page.$('[data-share]'))) fail('defeat screen has no Share button');
  const text = await page.evaluate(() => document.body.innerText);
  if (/\bnull\b|undefined|NaN/.test(text)) fail('stray text in the UI: ' + (text.match(/.{0,20}(\bnull\b|undefined|NaN).{0,20}/) || [''])[0]);
} catch (e) { fail('TEST ERROR ' + (e && e.stack || e.message)); }
await browser.close(); srv.close();
const secs = ((Date.now() - T0) / 1000).toFixed(1);
if (errs.length) { console.error('drop_the_bass visual FAILED (' + secs + 's):\n' + errs.join('\n')); process.exit(1); }
console.log('drop_the_bass visual: ok (' + secs + 's)');
