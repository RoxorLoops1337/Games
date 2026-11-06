// Drop the Bass monkey test: for each of en, da, nl, de a story run is played for about DTB_MONKEY_SECS (default 20) seconds of real time with a seeded
// random input stream: taps on tiles, DROP, re-roll, merge, hero buttons, the wave pill, the pool strip, panel buttons, pause and resume, drags from a turret
// to a tile, the upgrade-path sheet, rapid double taps, key presses and window resizes between portrait, landscape, tablet and desktop sizes.
// The four languages play in parallel (one browser, four pages). Asserts: no page errors, no console errors, no NaN / undefined / [object] / null text in
// the DOM or in any text the canvas drew, the game still responds at the end (the clock runs, DROP still deploys) and the turrets are still drawn
// (pixel check against the same board with the turrets hidden).
// Skips with exit 0 when Playwright or Chromium is missing, or DTB_BROWSER_SKIP=1. Screenshots go to $DTB_SHOT_DIR when set.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = (why) => { console.log('drop_the_bass monkey: SKIPPED (' + why + ')'); process.exit(0); };
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
  if (p.startsWith('/api/')) { res.writeHead(204); res.end(); return; }
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => srv.listen(0, r));
let browser;
try { browser = await pw.chromium.launch(); } catch (e) { srv.close(); skip('chromium would not start'); }

const SECS = +process.env.DTB_MONKEY_SECS || 20;
const SHOTS = process.env.DTB_SHOT_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const LANGS = ['en', 'da', 'nl', 'de'];
const SIZES = [[390, 844], [844, 390], [820, 1180], [1280, 720], [360, 640], [1024, 768], [390, 844]];
const BAD = /\bundefined\b|\bNaN\b|\[object |\bnull\b/;
const T0 = Date.now();
const errs = [];

// seeded generator (mulberry32): same seed, same input stream
const mkRng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// remember every string the canvas draws (the doodle HUD writes its text with fillText / strokeText)
const HOOK = `(() => {
  const seen = (window.__canvasText = new Set());
  for (const k of ['fillText', 'strokeText']) {
    const o = CanvasRenderingContext2D.prototype[k];
    CanvasRenderingContext2D.prototype[k] = function (s, ...r) { if (seen.size < 4000) seen.add(String(s)); return o.call(this, s, ...r); };
  }
})()`;

async function play(lang, idx) {
  const rnd = mkRng((+process.env.DTB_MONKEY_SEED || 1000) + idx * 7919);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const tag = '[' + lang + '] ';
  const fail = (m) => errs.push(tag + m);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') fail('console: ' + m.text()); });
  page.on('pageerror', (e) => fail('PAGEERROR ' + e.message));
  await page.addInitScript(HOOK);
  await page.addInitScript((l) => { try { localStorage.setItem('drop_the_bass_lang', l); } catch (e) { /* ignore */ } }, lang);
  await page.goto('http://localhost:' + srv.address().port + '/drop_the_bass/');
  await page.waitForFunction(() => window.__dtbReady, null, { timeout: 15000 });
  const setup = () => page.evaluate((seed) => {
    const a = __dtb.app, p = a.profile; p.tutorial.done = true; p.story.intro = true; p.story.worlds.garage = true; a.sessionGreeted = true; p.autoMerge = true; p.diamonds = 500;
    for (const k of ['hint_setlist', 'hint_wardrobe', 'hint_skin_buy', 'hint_studio_scene', 'hint_weekly', 'lang_offer']) p.tutorial.hints[k] = true;
    document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); p.resume = null;
    a.startRun({ mode: 'story', world: 'garage', encore: 0, seed, confirmed: true });
  }, 11 + idx);
  await setup();
  await page.waitForFunction(() => window.__dtb.app.screen === 'battle', null, { timeout: 10000 });
  const stats = { actions: 0, restarts: 0, modals: 0, resizes: 0 };
  let [vw, vh] = [390, 844];

  // the current view and the rects the monkey aims at, in CSS pixels
  const probe = () => page.evaluate(() => {
    const a = __dtb.app, v = a.view, b = a.battle, c = (lx, ly) => [v.ox + lx * v.s, v.oy + ly * v.s];
    const modal = !!document.querySelector('.modal-bg');
    if (a.screen !== 'battle' || !b) return { screen: a.screen, modal };
    const R = { deploy: [153 + 84, 929], merge: [118, 929], reroll: [356, 929], rerollG: [421, 929], heroR: [46, 908], heroJ: [494, 908], wave: [330, 28], pause: [35, 33], speed: [326, 85], call: [446, 85], pool: [270, 870] };
    const pts = {}; for (const k of Object.keys(R)) pts[k] = c(R[k][0], R[k][1]);
    const tur = b.run.turrets.map((t) => ({ id: t.id, p: c(t.x, t.y), lv: t.level }));
    const slots = b.run.map.buildable.map((s) => c(s.x, s.y));
    const panel = b.panel ? { mode: c(b.panel.mode.x + b.panel.mode.w / 2, b.panel.mode.y + b.panel.mode.h / 2), sell: c(b.panel.sell.x + b.panel.sell.w / 2, b.panel.sell.y + b.panel.sell.h / 2), cards: (b.panel.cards || []).map((q) => c(q.x + q.w / 2, q.y + q.h / 2)) } : null;
    const poolX = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => c(96 + 16 + i * 29, 870));
    return { screen: a.screen, modal, pts, tur, slots, panel, poolX, over: b.run.phase === 'won' || b.run.phase === 'lost', pop: !!b.popover, pv: b.pv.open };
  });
  const click = async (p, o) => { await page.mouse.click(Math.max(1, Math.min(vw - 1, p[0])), Math.max(1, Math.min(vh - 1, p[1])), o); };
  const tapAt = async (p, dbl) => { await click(p); if (dbl) { await page.waitForTimeout(15); await click(p); } };

  const handleModal = async () => {
    stats.modals++;
    const info = await page.evaluate(() => {
      const bg = document.querySelectorAll('.modal-bg'), top = bg[bg.length - 1]; if (!top) return null;
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
      const picks = [...top.querySelectorAll('.pick')].filter(vis), greens = [...top.querySelectorAll('button.green')].filter(vis);
      const el = picks.length ? picks[0] : greens[0] || null;
      if (!el) return { esc: true };
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, pick: picks.length };
    });
    if (!info) return;
    if (info.esc || rnd() < 0.15) { await page.keyboard.press('Escape'); const still = await page.evaluate(() => !!document.querySelector('.modal-bg')); if (!still) return; if (info.esc) { await page.evaluate(() => { const t = [...document.querySelectorAll('.modal-bg')].pop(); if (t) t.remove(); }); return; } }
    if (info.pick && rnd() < 0.5) { const n = info.pick; /* any of the cards */ const i = Math.floor(rnd() * n); await page.evaluate((k) => { const t = [...document.querySelectorAll('.modal-bg')].pop(); const ps = t && [...t.querySelectorAll('.pick')]; if (ps && ps[k]) ps[k].click(); }, i); return; }
    await click([info.x, info.y]);
  };

  const keys = [' ', 'm', 'r', 'g', 'q', 'w', 'n', 'f', 'v', 'p', 'Escape', '1', '2', 's', 'Enter', 'z'];
  const end = Date.now() + SECS * 1000;
  let lastText = 0;
  while (Date.now() < end) {
    stats.actions++;
    const pr = await probe();
    if (pr.modal) { await handleModal(); await page.waitForTimeout(40 + rnd() * 60); continue; }
    if (pr.screen !== 'battle' || pr.over) {   // the run ended (results screen, hub): start a fresh one
      if (pr.screen !== 'battle') { await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); }); }
      await setup().catch(() => {}); stats.restarts++;
      await page.waitForFunction(() => window.__dtb.app.screen === 'battle', null, { timeout: 8000 }).catch(() => fail('could not start a new run after the previous ended'));
      continue;
    }
    // keep the run alive and funded so the monkey has things to hit
    if (stats.actions % 9 === 0) await page.evaluate(() => { const r = __dtb.app.battle.run; r.coins = Math.max(r.coins, 400); r.stageHp = r.stageMax; });
    const roll = rnd();
    const P = pr.pts;
    if (roll < 0.16) await tapAt(pick(pr.slots), rnd() < 0.2);
    else if (roll < 0.28) await tapAt(P.deploy, rnd() < 0.3);
    else if (roll < 0.33) await tapAt(rnd() < 0.7 ? P.reroll : P.rerollG, rnd() < 0.3);
    else if (roll < 0.38) await tapAt(P.merge, rnd() < 0.3);
    else if (roll < 0.44) await tapAt(rnd() < 0.5 ? P.heroR : P.heroJ, rnd() < 0.3);
    else if (roll < 0.49) await tapAt(P.wave);
    else if (roll < 0.54) await tapAt(pick(pr.poolX));
    else if (roll < 0.60) await tapAt(pick([P.speed, P.call, P.call, P.speed]));
    else if (roll < 0.64) { await tapAt(rnd() < 0.5 ? P.pause : P.pause); }
    else if (roll < 0.68) await page.keyboard.press(pick(keys));
    else if (roll < 0.78 && pr.tur.length) {   // drag a turret onto a tile (or another turret)
      const a = pick(pr.tur), to = rnd() < 0.5 && pr.tur.length > 1 ? pick(pr.tur).p : pick(pr.slots);
      await page.mouse.move(a.p[0], a.p[1]); await page.mouse.down();
      await page.mouse.move((a.p[0] + to[0]) / 2, (a.p[1] + to[1]) / 2, { steps: 3 }); await page.mouse.move(to[0], to[1], { steps: 3 }); await page.mouse.up();
    } else if (roll < 0.84 && pr.tur.length) {   // select a turret, maybe level it so the upgrade sheet shows, hit panel buttons and cards
      const a = pick(pr.tur); await tapAt(a.p);
      if (rnd() < 0.5) await page.evaluate((id) => { const t = __dtb.app.battle.run.turretById(id); if (t && t.level < 4) t.level = 4; }, a.id);
      await page.waitForTimeout(120);
      const q = await probe();
      if (q.panel) { const k = rnd(); if (q.panel.cards.length && k < 0.5) await tapAt(pick(q.panel.cards)); else if (k < 0.8) await tapAt(q.panel.mode); else if (k < 0.9) await tapAt(q.panel.sell); }
    } else if (roll < 0.90) { await page.keyboard.press('p'); await page.waitForTimeout(100); }
    else if (roll < 0.94) {
      const sz = SIZES[stats.resizes % SIZES.length]; [vw, vh] = sz; stats.resizes++;
      await page.setViewportSize({ width: vw, height: vh }); await page.waitForTimeout(80);
    } else if (roll < 0.97) await tapAt(pick(pr.slots), true);
    else await page.evaluate(() => { const r = __dtb.app.battle.run; if (r.phase === 'prep') r.startWave(true); });
    await page.waitForTimeout(25 + rnd() * 90);
    if (Date.now() - lastText > 2500) {   // scan the visible text now and then
      lastText = Date.now();
      const txt = await page.evaluate(() => document.body.innerText);
      const m = txt.match(/.{0,24}(\bundefined\b|\bNaN\b|\[object |\bnull\b).{0,24}/); if (m) fail('stray text in the DOM: ' + m[0].replace(/\s+/g, ' '));
    }
  }

  // ---- the end: close everything, back to a phone, and check that the game still lives
  await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach((e) => e.remove()));
  await page.setViewportSize({ width: 390, height: 844 }); [vw, vh] = [390, 844]; await page.waitForTimeout(250);
  const st0 = await page.evaluate(() => { const a = __dtb.app; if (a.screen !== 'battle') return null; const b = a.battle; b.paused = false; b.hold = false; b.popover = null; b.pv.open = false; b.selected = null; b.targetSlot = null; return { t: b.t, runT: b.run.t, phase: b.run.phase }; });
  if (!st0) fail('not in a battle at the end (screen is not battle)');
  else {
    await page.evaluate(() => { const r = __dtb.app.battle.run; r.coins = 99999; r.stageHp = r.stageMax; r.prepT = 9999; });
    await page.waitForTimeout(800);
    const st1 = await page.evaluate(() => { const b = __dtb.app.battle; return { t: b.t, runT: b.run.t, paused: b.paused, choice: !!b.run.choice, hint: b.hintQueue.length }; });
    if (!(st1.t > st0.t + 0.3)) fail('the battle clock stopped (' + st0.t + ' to ' + st1.t + ')');
    if (!st1.paused && !st1.choice && !st1.hint && !(st1.runT > st0.runT)) fail('the run clock stopped');
    // DROP still works: a tap on the real button deploys (or merges when the board is full)
    await page.evaluate(() => { const b = __dtb.app.battle, r = b.run; let g = 0; while (r.choice && g++ < 6) r.pick(0); if (b.pv) b.pv.open = false; b.selected = null; b.popover = null; b.hintQueue.length = 0; });
    const before = await page.evaluate(() => { const r = __dtb.app.battle.run; return { d: r.deploys, n: r.turrets.length }; });
    for (let i = 0; i < 4; i++) {
      const pt = await page.evaluate(async () => { const v = __dtb.app.view, H = (await import('./js/battle.js')).HIT.deploy; return [v.ox + (H.x + H.w / 2) * v.s, v.oy + (H.y + H.h / 2) * v.s]; });
      await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(150);
      await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((e) => e.remove()); const b = __dtb.app.battle; b.hintQueue.length = 0; b.popover = null; });
    }
    const after = await page.evaluate(() => { const b = __dtb.app.battle, r = b.run; return { d: r.deploys, n: r.turrets.length, full: r.emptySlots().length === 0, why: JSON.stringify({ choice: !!r.choice, paused: !!b.paused, hold: !!b.hold, phase: r.phase, coins: r.coins, cost: r.deployCost(), can: r.canDeploy(), pv: !!(b.pv && b.pv.open), sel: b.selected, tut: !!b.tut, vw: innerWidth + 'x' + innerHeight, top: (() => { const v = __dtb.app.view; const e = document.elementFromPoint(v.ox + 237 * v.s, v.oy + 929 * v.s); return e ? e.tagName + '.' + e.className + '#' + e.id : null; })(), keys: Object.keys(b).filter((k) => /card|pop|sheet|hint|open/i.test(k) && b[k]).join(), drag: b.drag ? 'drag' : null, target: b.targetSlot, ptr: b.ptr ? Object.keys(b.ptr).join() : null, pad: !!b.padCursor, branch: !!(b.branchSheet || b.sheet), panel: !!b.panel, side: !!b.sideHit, lastErr: window.__lastErr || null }) }; });
    if (!(after.d > before.d) && !after.full) fail('DROP no longer deploys (' + before.d + ' to ' + after.d + ') ' + after.why);
    // turrets are still drawn: compare the board with the turrets in place against the same frame without them
    await page.evaluate(() => { const b = __dtb.app.battle; b.hold = true; b.run.prepT = 9999; b.selected = null; });
    const pos = await page.evaluate(() => { const a = __dtb.app, v = a.view; return a.battle.run.turrets.slice(0, 8).map((t) => [v.ox + t.x * v.s, v.oy + t.y * v.s]); });
    if (pos.length < 2) fail('fewer than 2 turrets on the board at the end: ' + pos.length);
    const grab = async () => page.evaluate((pts) => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const cv = document.getElementById('game'), v = __dtb.app.view, x = cv.getContext('2d'), out = [];
      for (const [px0, py0] of pts) { const px = Math.round(px0 * v.dpr) - 22, py = Math.round(py0 * v.dpr) - 22; out.push(Array.from(x.getImageData(Math.max(0, px), Math.max(0, py), 44, 44).data)); }
      res(out);
    }))), pos);
    const withT = await grab();
    await page.evaluate(() => { const b = __dtb.app.battle, r = b.run; window.__stash = r.turrets.slice(); r.turrets.length = 0; });
    const noT = await grab();
    await page.evaluate(() => { const r = __dtb.app.battle.run; r.turrets.push(...window.__stash); __dtb.app.battle.hold = false; });
    const diff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++; } return n ? s / n / 3 : 0; };
    const spread = (a) => { const seen = new Set(); for (let i = 0; i < a.length; i += 4) seen.add(((a[i] >> 4) << 8) | ((a[i + 1] >> 4) << 4) | (a[i + 2] >> 4)); return seen.size; };
    let drawn = 0; pos.forEach((_, i) => { if (diff(withT[i], noT[i]) > 12 && spread(withT[i]) >= 8) drawn++; });
    if (drawn < Math.ceil(pos.length * 0.6)) fail('turrets are not drawn: ' + drawn + ' of ' + pos.length + ' visible');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'dtb_monkey_' + lang + '.png') });
  }
  const played = await page.evaluate(() => { const a = __dtb.app; if (a.screen !== 'battle') return null; const r = a.battle.run; return { deploys: r.deploys, merges: r.merges, kills: r.kills }; });
  if (played && played.deploys < 6) fail('the monkey hardly played: ' + JSON.stringify(played));
  stats.played = played;
  // text the canvas drew and the DOM, once more
  const canvasText = await page.evaluate(() => [...window.__canvasText]);
  const badc = canvasText.filter((s) => BAD.test(s)); if (badc.length) fail('stray canvas text: ' + badc.slice(0, 5).join(' | '));
  if (canvasText.length < 30) fail('the canvas drew almost no text (' + canvasText.length + ' strings)');
  const txt = await page.evaluate(() => document.body.innerText); const m = txt.match(/.{0,24}(\bundefined\b|\bNaN\b|\[object |\bnull\b).{0,24}/); if (m) fail('stray text in the DOM at the end: ' + m[0]);
  const langNow = await page.evaluate(() => __dtb.app.langNow()); if (langNow !== lang) fail('language changed during the run: ' + langNow);
  await ctx.close();
  return stats;
}

let results = [];
try { results = await Promise.all(LANGS.map((l, i) => play(l, i).catch((e) => { errs.push('[' + l + '] TEST ERROR ' + (e && e.stack || e.message)); return null; }))); } catch (e) { errs.push('TEST ERROR ' + (e && e.stack || e.message)); }
await browser.close(); srv.close();
const secs = ((Date.now() - T0) / 1000).toFixed(1);
const sum = results.map((r, i) => r ? LANGS[i] + ' ' + r.actions + ' actions, ' + r.resizes + ' resizes, ' + r.modals + ' modal steps, ' + r.restarts + ' restarts, ' + JSON.stringify(r.played) : LANGS[i] + ' failed').join('; ');
if (errs.length) { console.error('drop_the_bass monkey FAILED (' + secs + 's): ' + sum + '\n' + [...new Set(errs)].join('\n')); process.exit(1); }
console.log('drop_the_bass monkey: ok (' + secs + 's) ' + sum);
