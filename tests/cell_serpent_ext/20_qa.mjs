// 20 QA: regressions found while playtesting the real game in headless Chromium.
// Runs its asserts when imported. The browser part is skipped when no Chromium or playwright is available.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
let n = 0;
const ok = (name, fn) => { fn(); n++; };

// ---- sim: GIVE UP in the pause menu must report the same kind of result as a real loss
ok('quitResult: a pause-menu give up keeps mode, hard flag, progress and damage', () => {
  assert.equal(typeof sim.quitResult, 'function');
  for (const mode of ['', 'pig', 'inv']) {
    const g = sim.createGame({ seed: 7, stage: 3, mode, hard: false, bot: true });
    for (let i = 0; i < 600; i++) sim.step(g, 1 / 60, sim.botInput(g));
    const r = sim.quitResult(g);
    assert.equal(r.won, false);
    assert.equal(r.mode, mode, 'mode survives: a quit pig run must not count as a normal stage');
    assert.equal(r.name, mode === 'pig' ? sim.PIG_NAME : mode === 'inv' ? sim.INV_NAME : sim.virusName(3));
    assert.ok(Number.isFinite(r.progress), 'progress is a number');
    assert.ok(r.dmgBy && typeof r.dmgBy === 'object');
  }
  const gh = sim.createGame({ seed: 7, stage: 3, hard: true, bot: true });
  assert.equal(sim.quitResult(gh).hard, true, 'a quit hard run stays a hard run');
  // applying it never writes NaN into the save
  const save = sim.defaultSave();
  sim.applyResult(save, sim.quitResult(gh));
  assert.ok(Object.values(save.prog).every(Number.isFinite));
});

// ---- a backup code cannot mint unlimited Voice
ok('importing a save with Voice far above the cap is clamped, rewards can still pass the cap', () => {
  for (const n of [999, 5000, 1e9]) {
    const sv = sim.sanitizeSave({ ...sim.defaultSave(), energy: { n, t: 0 } });
    assert.equal(sv.energy.n, sim.ENERGY_OVER_MAX); assert.ok(sv.energy.n > sim.ENERGY_MAX);
    assert.equal(sim.importSave(sim.exportSave(sv)).energy.n, sim.ENERGY_OVER_MAX);
  }
  for (const n of [-5, 'x', null, NaN]) { const e = sim.sanitizeSave({ ...sim.defaultSave(), energy: { n, t: 0 } }).energy.n; assert.ok(Number.isFinite(e) && e >= 0 && e <= sim.ENERGY_OVER_MAX, String(n)); }
  const sv = sim.defaultSave(); sim.addEnergy(sv, 20); assert.ok(sv.energy.n > sim.ENERGY_MAX);
});

// ---- snakes only: no 'Virus' wording anywhere the player can read it
ok('stage and species names use Serpent or Snake wording, with short roman suffixes', () => {
  for (let i = 1; i <= 50; i++) { const nm = sim.virusName(i); assert.ok(!/virus|flu\b|germ|fever|gunk/i.test(nm), nm); assert.ok(nm.length <= 24, 'fits the banner: ' + nm); }
  assert.equal(sim.virusName(1), 'Love-Struck Serpent');
  assert.equal(sim.virusName(11), 'Love-Struck Serpent II'); assert.equal(sim.virusName(41), 'Love-Struck Serpent V');
  assert.ok(sim.SKIN_NAMES.every(n => !/virus/i.test(n)));
});
{
  const mainSrc = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'main.js'), 'utf8'), htmlSrc = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'index.html'), 'utf8');
  ok('no visible Virus text in the page or the screens main.js writes', () => {
    assert.ok(!/virus/i.test(htmlSrc.replace(/<style[\s\S]*?<\/style>/g, '')), 'index.html');
    assert.ok(!/['"`][^'"`\n]*virus[^'"`\n]*['"`]/i.test(mainSrc), 'main.js strings');
  });
  ok('the result screen no longer drops a toast over its own title', () => {
    assert.ok(!mainSrc.includes("toast('+' + out.starsGained"));
  });
  ok('Escape and the Android back button share goBack and a spare history entry', () => {
    assert.ok(mainSrc.includes("addEventListener('popstate'") && mainSrc.includes('function goBack('));
    assert.ok(!mainSrc.includes('initKeys(() =>'), 'the second Escape handler is gone');
  });
}

// ---- source guards for the UI fixes (the browser part below proves them for real when Chromium exists)
const main = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'index.html'), 'utf8');
ok('pause() refuses to open over the upgrade cards (Escape used to soft-lock the run)', () => {
  assert.match(main, /function pause\(\) \{[^\n]*g\.phase === 'levelup'/);
  assert.ok(main.includes('g.result = quitResult(g)'), 'give up uses the sim result');
});
ok('scr screens never clip their top when taller than the phone', () => {
  assert.ok(/\.scr\{[^}]*justify-content:safe center/.test(html));
});

ok('letterbox: the world is clipped to the frame so snakes never draw on the bars', () => {
  const rsrc = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'render.js'), 'utf8');
  assert.match(rsrc, /boxed = L\.ox > 0\.5 \|\| L\.oy > 0\.5/); assert.match(rsrc, /ctx\.rect\(0, 0, W, H\); ctx\.clip\(\)/);
  assert.ok(/\.tile\.deal \.top\{flex-direction:column/.test(html) && /\.chestcard \.top\{flex-direction:column/.test(html), 'narrow phones stack icon over name in shop deals and gear chests');
});

// ---- real browser
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), path.join(ROOT, '..', '..', '..', 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('20_qa: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 9999, cleared: 14, best: 14, runs: 30, eggs: 3, xp: 1500, energy: { n: 40, t: 0 } };
    const open = async (w, h) => {
      const p = await browser.newPage({ viewport: { width: w, height: h } }); p.errs = [];
      p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/status of 404/.test(m.text()) && p.errs.push(m.text()));
      await p.addInitScript(s => localStorage.setItem('cell_serpent_save_v1', s), JSON.stringify(SAVE));
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
      return p;
    };
    const state = p => p.evaluate(() => [document.querySelector('.scr.on') && document.querySelector('.scr.on').id, window.CS.mode(), window.CS.g && window.CS.g.phase]);
    try {
      // Escape over the cards must not soft-lock the run
      let p = await open(390, 844);
      await p.evaluate(() => { window.CS.startRun(3); window.CS.g.pending = 1; }); await p.waitForTimeout(500);
      assert.equal((await state(p))[0], 'levelup');
      await p.keyboard.press('Escape'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      let st = await state(p);
      assert.ok(st[0] === 'levelup' || st[2] !== 'levelup', 'cards still on screen or resolved, never a blank screen on the levelup phase: ' + st);
      await p.click('#cards .card >> nth=0'); await p.waitForTimeout(800);
      assert.notEqual((await state(p))[2], 'levelup', 'picking a card moves the run on');
      // Android back (history.back) and Escape: pause, resume, close settings back to the pause menu, never leave the page
      await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(400);
      await p.evaluate(() => history.back()); await p.waitForTimeout(300);
      assert.equal((await state(p))[1], 'pause', 'back pauses a run');
      await p.evaluate(() => history.back()); await p.waitForTimeout(300);
      assert.equal((await state(p))[1], 'play', 'back again resumes it');
      await p.keyboard.press('Escape'); await p.waitForTimeout(250); await p.click('#pSet', { force: true }); await p.waitForTimeout(300);
      assert.equal((await state(p))[0], 'settings');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      st = await state(p); assert.deepEqual([st[0], st[1]], ['pause', 'pause'], 'Escape in settings returns to the pause menu and the run stays paused');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      assert.equal((await state(p))[1], 'play');
      assert.ok(await p.evaluate(() => location.pathname.includes('cell_serpent')), 'still on the game page');
      // give up in a pig run is a pig result and keeps the save sane
      await p.evaluate(() => window.CS.startRun(2, 'pig')); await p.waitForTimeout(400);
      await p.keyboard.press('Escape'); await p.click('#quitBtn'); await p.waitForTimeout(300);
      assert.match(await p.textContent('#rTitle'), /PIGGIES ESCAPED/);
      assert.ok(Object.values(await p.evaluate(() => window.CS.save().prog)).every(Number.isFinite));
      assert.deepEqual(p.errs, []);
      await p.close();
      // 320x568: nothing clipped above the top, upgrade cards stay inside the screen, hub header fits
      p = await open(320, 568);
      // slide bar on a short phone: it must not hide the duo, and a quick tap on it is the Encore tap
      await p.evaluate(() => { window.CS.save().settings.slider = true; window.CS.startRun(3); }); await p.waitForTimeout(500);
      const bar = await p.evaluate(() => { const r = document.getElementById('accSlider').getBoundingClientRect(), L = window.CS.R.layout(), cv = document.querySelector('canvas'), g = window.CS.g, d = cv.width / innerWidth; g.encore = 1; g.encoreReady = true; return { top: r.top, h: r.height, x: (L.ox + g.p.x * L.s) / d, y: (L.oy + g.p.y * L.s) / d }; });
      assert.ok(bar.h <= 48, 'slim slide bar on a 568px phone: ' + bar.h);
      await p.mouse.click(bar.x, bar.y); await p.waitForTimeout(250);
      assert.equal(await p.evaluate(() => window.CS.g.encoreUsed), 1, 'tapping the duo through the slide bar fires the Encore');
      await p.evaluate(() => { window.CS.save().settings.slider = false; });
      await p.evaluate(() => { window.CS.startRun(12); window.CS.g.pending = 1; }); await p.waitForTimeout(500);
      const cards = await p.evaluate(() => [...document.querySelectorAll('#cards .card')].map(c => Math.round(c.scrollWidth - c.clientWidth)));
      assert.ok(cards.every(d => d <= 1), 'card content fits its card: ' + cards);
      const top = await p.evaluate(() => document.querySelector('#levelup .banner').getBoundingClientRect().top);
      assert.ok(top >= -1, 'levelup banner reachable: ' + top);
      await p.evaluate(() => window.CS.openHub('Battle')); await p.waitForTimeout(200);
      const over = await p.evaluate(() => { const t = document.querySelector('.hubtop'); return t.scrollWidth - t.clientWidth; });
      assert.ok(over <= 1, 'hub header fits 320px: ' + over);
      await p.evaluate(() => { const sv = window.CS.save(); sv.beats = 987654; sv.sparkles = 99999; window.CS.openHub('Battle'); }); await p.waitForTimeout(700);
      const pills = await p.evaluate(() => [...document.querySelectorAll('.hubtop .cur')].map(c => Math.round(c.scrollWidth - c.clientWidth)));
      assert.ok(pills.every(d => d <= 1), 'big currency numbers stay inside their header pills at 320px: ' + pills);
      await p.click('#setBtnH'); await p.waitForTimeout(150);
      const sTop = await p.evaluate(() => { const e = document.querySelector('#settings'); e.scrollTop = 0; return document.querySelector('#settings h2').getBoundingClientRect().top; });
      assert.ok(sTop >= -1, 'settings title reachable by scrolling up: ' + sTop);
      assert.deepEqual(p.errs, []);
      await p.close();
      // 390x844 is taller than the 9:16 game frame: the top and bottom bars must stay empty (no snake cells on them)
      p = await open(390, 844);
      await p.evaluate(() => window.CS.startRun(12)); await p.waitForTimeout(3500);
      const bars = await p.evaluate(() => { const cv = document.querySelector('canvas'), L = window.CS.R.layout(), c = cv.getContext('2d'), bh = Math.floor(L.oy) - 2; const odd = r => { const d = c.getImageData(0, r, cv.width, 1).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 13) + Math.abs(d[i + 1] - 9) + Math.abs(d[i + 2] - 36) > 6) k++; return k; }; let top = 0, bot = 0; for (let y = 0; y < bh - 8; y += 3) { top += odd(y); bot += odd(cv.height - 1 - y); } return { bh, top, bot }; });
      assert.ok(bars.bh > 20, 'a letterbox exists at 390x844: ' + bars.bh);
      assert.equal(bars.top + bars.bot, 0, 'nothing drawn on the letterbox bars: ' + JSON.stringify(bars));
      await p.close();
      // 320px: Today's Treats and the Gear chests keep readable names
      p = await open(320, 568);
      await p.evaluate(() => window.CS.openHub('Shop')); await p.waitForTimeout(800);
      let nmw = await p.evaluate(() => [...document.querySelectorAll('.tile.deal .nm')].map(e => Math.round(e.getBoundingClientRect().width)));
      assert.ok(nmw.length > 0 && nmw.every(w => w >= 80), 'deal names are not squeezed: ' + nmw);
      await p.evaluate(() => window.CS.openHub('Gear')); await p.waitForTimeout(800);
      nmw = await p.evaluate(() => [...document.querySelectorAll('.chestcard .nm')].map(e => Math.round(e.getBoundingClientRect().width)).filter(w => w > 0));
      assert.ok(nmw.length > 0 && nmw.every(w => w >= 80), 'chest names are not squeezed: ' + nmw);
      assert.deepEqual(p.errs, []);
      await p.close();
      n += 3;
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
}
console.log(`20_qa: ${n} checks passed`);
