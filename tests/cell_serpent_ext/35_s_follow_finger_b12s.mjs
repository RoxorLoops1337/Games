// b12s: lane stages: the duo FOLLOWS the finger (absolute x, eased chase with a speed cap). Ring stages are untouched.
// Part 1: pure sim (chaseX, input.tx, lane vs ring, settings). Part 2: Chromium touch emulation with CDP touch events.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
const tick = (g, n, inp) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, inp); };

// ---- chase function: cap, easing, no overshoot, bad input
{
  const dt = 1 / 60, sp = 300;
  let x = 100; const tx = 600, xs = [x];
  for (let i = 0; i < 240; i++) { const nx = sim.chaseX(x, tx, dt, sp); assert.ok(nx - x <= sp * sim.CHASE_MUL * dt + 1e-9, 'speed cap per frame'); assert.ok(nx <= tx + 1e-9, 'never overshoots'); assert.ok(nx >= x, 'monotonic'); x = nx; xs.push(x); }
  assert.equal(x, tx, 'converges exactly');
  assert.ok(xs[30] > 350, 'direct feel: well on its way after half a second (' + xs[30] + ')');
  assert.ok(sim.CHASE_MUL >= 2.2 && sim.CHASE_MUL <= 3, 'cap is 2.2 to 3 times the joystick speed');
  const last = xs[xs.length - 1] - xs[xs.length - 2];
  assert.ok(last < 1e-3, 'eases into the target');
  let y = 500; for (let i = 0; i < 40; i++) { const ny = sim.chaseX(y, 520, dt, sp); assert.ok(ny <= 520 && ny >= y); y = ny; }
  assert.ok(y > 515, 'small distance: eased, no overshoot');
  for (const bad of [NaN, undefined, Infinity, null]) assert.equal(sim.chaseX(300, bad, dt, sp), 300, 'bad target: stay');
  assert.equal(sim.chaseX(300, 700, dt, 0) > 300, true, 'no speed: default speed');
  assert.ok(sim.chaseX(300, -1e9, dt, sp) >= 300 - sp * sim.CHASE_MUL * dt - 1e-9, 'a huge flick cannot teleport it');
  let l = 600; for (let i = 0; i < 300; i++) { const nl = sim.chaseX(l, 100, dt, sp); assert.ok(nl >= 100 - 1e-9 && nl <= l); l = nl; }
}

// ---- sim: input.tx in lane stages, mx path unchanged, ring ignores tx
{
  const g = sim.createGame({ seed: 3, stage: 3 }); assert.ok(!g.ring);
  tick(g, 120, { mx: 0, tx: 150 }); assert.ok(Math.abs(g.p.x - 150) < 1, 'converges to the target x: ' + g.p.x);
  tick(g, 120, { mx: 0, tx: 150 }); assert.equal(g.p.x, 150, 'and stops there'); assert.equal(g.p.mx, 0);
  tick(g, 10, { mx: 0 }); assert.equal(g.p.x, 150, 'no tx and no mx: it stays (no drift back)');
  tick(g, 10, { mx: 0, tx: NaN }); assert.equal(g.p.x, 150, 'NaN target is ignored');
  tick(g, 10, { mx: 1, tx: undefined }); assert.ok(g.p.x > 150, 'the mx path still works');
  tick(g, 200, { tx: -5000 }); assert.equal(g.p.x, g.p.zone.x0, 'clamped to the zone');
  tick(g, 200, { tx: 99999 }); assert.equal(g.p.x, g.p.zone.x1);
  const a = sim.createGame({ seed: 3, stage: 3 }); a.p.x = 100; tick(a, 3, { tx: 700 }); assert.ok(a.p.x - 100 <= 3 * 300 * sim.CHASE_MUL / 60 + 1e-6, 'a flick moves it at most the cap');
  assert.equal(g.p.y, sim.ROW_Y, 'vertical position unchanged');
  const r = sim.createGame({ seed: 3, stage: 6 }); assert.ok(r.ring); tick(r, 60, { tx: 100, aim: 0 }); assert.equal(r.p.x, sim.RING.cx, 'ring stages: the duo stays fixed, tx is ignored');
}

// ---- settings: new default, coercion, old saves
{
  const d = sim.defaultSave(); assert.equal(d.settings.controlStyle, 'follow');
  assert.equal(sim.sanitizeSave({ v: 8, settings: { controlStyle: 'joystick' } }).settings.controlStyle, 'joystick');
  for (const bad of [5, null, 'x', true, undefined]) assert.equal(sim.sanitizeSave({ v: 8, settings: { controlStyle: bad } }).settings.controlStyle, 'follow', 'coerced: ' + bad);
  assert.equal(sim.sanitizeSave({ v: 8, settings: { music: false, slider: true } }).settings.controlStyle, 'follow', 'old saves load with the new default');
  assert.equal(sim.sanitizeSave({ v: 8, settings: { slider: true, leftHand: true, thumbZone: true } }).settings.thumbZone, true);
}

// ---- bots and balance harness still use mx only
{
  const g = sim.createGame({ seed: 5, stage: 2 }); const inp = sim.botInput(g); assert.ok('mx' in inp && !('tx' in inp), 'bot input contract unchanged');
}

// ---- source rules
{
  const main = fs.readFileSync(path.join(ROOT, 'cell_serpent', 'main.js'), 'utf8');
  assert.ok(main.includes('followMode') && main.includes('fol.on'), 'main.js follow control');
  assert.ok(!main.includes('—') && !fs.readFileSync(path.join(ROOT, 'cell_serpent', 'sim.js'), 'utf8').includes('—'), 'no em dash');
  assert.match(fs.readFileSync(path.join(ROOT, 'cell_serpent', 'index.html'), 'utf8'), /data-k="controlStyle"/);
}

// ---- browser: CDP touch
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('35_s_follow_finger_b12s: browser part skipped, no Chromium'); }
  if (browser) {
    const fails = [];
    const SAVE = JSON.stringify({ v: 8, beats: 900000, cleared: 40, best: 40, runs: 300, eggs: 30, xp: 90000, energy: { n: 40, t: 0 } });
    try {
      for (const [w, h] of [[390, 844], [360, 640]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, SAVE);
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
        const cdp = await ctx.newCDPSession(p);
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id || 0 })) });
        const gx = cssX => p.evaluate(x => window.CS.R.toGame(x * (document.querySelector('canvas').width / innerWidth), 0).x, cssX);
        const px = () => p.evaluate(() => window.CS.g.p.x);
        const start = async stage => { await p.evaluate(s => window.CS.startRun(s), stage); await p.waitForFunction(() => window.CS.g && window.CS.g.phase === 'play', null, { timeout: 8000 }); await p.waitForTimeout(300); await p.evaluate(() => { window.CS.g.snakes.forEach(s => { s.speed = 0.001; }); }); };
        // b13i: wait for the duo to reach a target (frames slow down on a loaded machine) instead of a fixed sleep; a miss falls through to the assert
        const near = (want, tol, ms = 9000) => p.waitForFunction(([x, t]) => Math.abs(window.CS.g.p.x - x) < t, [want, tol], { timeout: ms, polling: 50 }).catch(() => {});
        const still = (ms = 6000) => p.evaluate(ms => new Promise(res => { let last = window.CS.g.p.x, calm = 0; const t0 = performance.now(); const id = setInterval(() => { const x = window.CS.g.p.x; calm = Math.abs(x - last) < 0.2 ? calm + 1 : 0; last = x; if (calm >= 4 || performance.now() - t0 > ms) { clearInterval(id); res(); } }, 60); }), ms);
        const tag = `${w}x${h}`, Y = Math.round(h * 0.82);
        const chk = (c, m) => { if (!c) fails.push(`${tag}: ${m}`); };
        await start(3);
        for (const f of [0.15, 0.8, 0.5, 0.25]) {
          const cx = Math.round(w * f), want = await gx(cx);
          await touch('touchStart', [[cx, Y]]); await near(want, 3); await still();
          const got = await px(); chk(Math.abs(got - want) < 6, `touch at ${f}: duo ${got.toFixed(0)} vs finger ${want.toFixed(0)}`);
          await touch('touchEnd', []); await still();
          const later = await px(); chk(Math.abs(later - got) < 1, `lifting leaves the duo (${got.toFixed(1)} -> ${later.toFixed(1)})`);
        }
        // moving the finger moves the duo
        const a0w = await gx(Math.round(w * 0.2)), a2w = await gx(Math.round(w * 0.7));
        await touch('touchStart', [[Math.round(w * 0.2), Y]]); await near(a0w, 3);
        const a1 = await px(); await touch('touchMove', [[Math.round(w * 0.7), Y]]); await near(a2w, 3); const a2 = await px();
        chk(a2 > a1 + 150, `moving the finger moves the duo (${a1.toFixed(0)} -> ${a2.toFixed(0)})`);
        // a fast flick does not teleport
        await touch('touchMove', [[Math.round(w * 0.05), Y]]); await p.waitForTimeout(120); const a3 = await px();
        chk(a3 > a2 - 120, `a flick is capped (${a2.toFixed(0)} -> ${a3.toFixed(0)} in 120ms)`);
        await still();
        // a second finger is ignored for movement
        const keep = await px(); await touch('touchStart', [[Math.round(w * 0.05), Y, 0], [Math.round(w * 0.9), Y, 1]]); await touch('touchMove', [[Math.round(w * 0.05), Y, 0], [Math.round(w * 0.95), Y, 1]]); await p.waitForTimeout(700);
        const sec = await px(); chk(Math.abs(sec - keep) < 8, `second finger ignored (${keep.toFixed(0)} -> ${sec.toFixed(0)})`);
        await touch('touchEnd', []); await p.waitForTimeout(100);
        // a finger that starts on the pause button does not steer
        const pz = await p.evaluate(() => { const c = document.querySelector('canvas'), R = window.CS.R, k = c.width / innerWidth; for (let y = 4; y < 120; y += 4) for (let x = innerWidth - 4; x > innerWidth - 120; x -= 4) if (R.hudZone(R.toGame(x * k, y * k)) === 'pause') return [x, y]; return null; });
        chk(!!pz, 'found the pause button');
        if (pz) { const b = await px(); await touch('touchStart', [[pz[0], pz[1]]]); await p.waitForTimeout(500); await touch('touchEnd', []); const e2 = await px(); chk(Math.abs(e2 - b) < 4, 'a press on the pause button never steers'); }
        // keyboard still works
        await start(3);
        const k0 = await px(); await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight'); const k1 = await px();
        chk(k1 > k0 + 60, `keyboard right moves (${k0.toFixed(0)} -> ${k1.toFixed(0)})`);
        // screenshot: marker while a finger is down
        await touch('touchStart', [[Math.round(w * 0.3), Y]]); await p.waitForTimeout(150);
        if (w === 390) await p.screenshot({ path: process.env.FOLLOW_SHOT || path.join(process.env.TMPDIR || '/tmp', 's_follow.png') });
        await touch('touchEnd', []);
        // ring stage: the duo stays fixed under touch
        await start(6); const r0 = await px(); await touch('touchStart', [[Math.round(w * 0.1), Y]]); await p.waitForTimeout(600); chk(Math.abs((await px()) - r0) < 0.5, 'ring stage: the duo does not follow'); await touch('touchEnd', []);
        // Joystick option restores the old relative drag
        await p.evaluate(() => { window.CS.save().settings.controlStyle = 'joystick'; });
        await start(3);
        const j0 = await px(); const jx = Math.round(w * 0.15);
        await touch('touchStart', [[jx, Y]]); await p.waitForTimeout(700);
        const j1 = await px(); chk(Math.abs(j1 - j0) < 4, `joystick: a plain touch does not move the duo (${j0.toFixed(0)} -> ${j1.toFixed(0)})`);
        await touch('touchMove', [[jx + 80, Y]]); await p.waitForTimeout(700); const j2 = await px();
        chk(j2 > j1 + 40, `joystick: dragging right steers right (${j1.toFixed(0)} -> ${j2.toFixed(0)})`);
        await touch('touchEnd', []);
        chk(errs.length === 0, 'page errors: ' + errs.join('; '));
        await ctx.close();
      }
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(fails, [], '\n' + fails.join('\n'));
  } else srv.close();
}
console.log('35_s_follow_finger_b12s ok');
