// 35_a: real touch emulation of the ring-stage aim (mobile context, CDP Input.dispatchTouchEvent).
// Ring stage 6: a finger drag around the duo turns p.aim, a touch within 26 px of the duo does not jitter it, fast sweeps and
// two-finger taps keep it sane. Lane stage 3: the same drags still slide the duo and the shots stay straight up.
// Browser part skipped without Chromium. Runs its asserts when imported.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const dA = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('35_a_touch_aim: browser part skipped, no Chromium'); }
  if (browser) {
    const fails = [];
    const SAVE = JSON.stringify({ v: 8, beats: 5000, sparkles: 300, cleared: 40, best: 40, runs: 300, eggs: 3, ribbons: 80, xp: 9000, energy: { n: 40, t: 0 } });
    try {
      for (const [w, h] of [[390, 844], [360, 640]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', e => errs.push('page: ' + e.message));
        await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, SAVE);
        await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 20000 });
        await p.waitForTimeout(400);
        const cdp = await ctx.newCDPSession(p);
        const tp = (x, y, id = 0) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
        const tag = `${w}x${h}`;
        const aim = () => p.evaluate(() => window.CS.g.p.aim);
        const settle = () => p.waitForTimeout(260);   // the sim eases the angle (0.35 per frame)
        const duo = () => p.evaluate(() => { const g = window.CS.g, R = window.CS.R, k = document.querySelector('canvas').width / innerWidth, L = R.layout(); return { x: (g.p.x * L.s + L.ox) / k, y: (g.p.y * L.s + L.oy) / k }; });
        const calm = () => p.evaluate(() => { const g = window.CS.g; g.snakes.forEach(s => { s.speed = 0.01; }); });

        // ---- ring stage
        await p.evaluate(() => window.CS.startRun(6)); await p.waitForTimeout(900);
        assert.ok(await p.evaluate(() => !!window.CS.g.ring), tag + ' stage 6 is a ring stage');
        await calm();
        const c = await duo(); const rad = 100;
        const at = a => tp(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad);
        // 1. touch down at several angles: aim follows the finger
        for (const deg of [0, 90, 180, -135, -45, 45]) {
          const a = deg * Math.PI / 180;
          await touch('touchStart', [at(a)]); await settle();
          const got = await aim(); await touch('touchEnd', []);
          if (dA(got, a) > 0.12) fails.push(`${tag} tap at ${deg} deg: aim ${(got * 180 / Math.PI).toFixed(1)}`);
        }
        // 2. a slow drag around a full circle: aim tracks every step
        {
          await touch('touchStart', [at(-Math.PI / 2)]); await settle();
          let worst = 0;
          for (let i = 1; i <= 36; i++) { const a = -Math.PI / 2 + i * Math.PI / 18; await touch('touchMove', [at(a)]); await p.waitForTimeout(60); worst = Math.max(worst, dA(await aim(), a)); }
          await touch('touchEnd', []);
          if (worst > 0.5) fails.push(`${tag} slow circle drag lags by ${worst.toFixed(2)} rad`);
        }
        // 3. no jitter inside the dead zone: wiggling a finger right on the duo keeps the aim
        {
          await touch('touchStart', [at(0.5)]); await settle(); const a0 = await aim();
          for (let i = 0; i < 20; i++) { const a = i * 1.7, r = 4 + (i % 3) * 2; await touch('touchMove', [tp(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r)]); await p.waitForTimeout(25); }
          await settle(); const a1 = await aim(); await touch('touchEnd', []);
          if (dA(a0, a1) > 0.02) fails.push(`${tag} jitter inside the dead zone moved the aim by ${dA(a0, a1).toFixed(3)}`);
        }
        // 4. a fast sweep from the left to the right over the top: ends at the finger, never NaN
        {
          await touch('touchStart', [at(Math.PI)]); await settle();
          const seen = [];
          for (let i = 0; i <= 12; i++) { await touch('touchMove', [at(Math.PI + i * Math.PI / 12)]); seen.push(await aim()); }
          await settle(); const end = await aim(); await touch('touchEnd', []);
          if (!seen.every(Number.isFinite) || !Number.isFinite(end)) fails.push(`${tag} fast sweep gave a non finite aim`);
          if (dA(end, 0) > 0.15) fails.push(`${tag} fast sweep ends at ${(end * 180 / Math.PI).toFixed(1)} deg, not 0`);
          if (Math.abs(end) > Math.PI + 1e-6) fails.push(`${tag} aim outside -PI..PI`);
        }
        // 5. a flick across the duo (finger passes through the dead zone): aim ends on the far side
        {
          await touch('touchStart', [at(Math.PI)]); await settle();
          for (const f of [0.8, 0.4, 0.1, -0.1, -0.4, -0.8]) await touch('touchMove', [tp(c.x + f * rad, c.y)]);
          await settle(); const e = await aim(); await touch('touchEnd', []);
          if (dA(e, Math.PI) > 0.15) fails.push(`${tag} flick through the duo ends at ${(e * 180 / Math.PI).toFixed(1)}`);
        }
        // 6. two fingers: a second finger tapping elsewhere never breaks the aim or leaves the run; a fresh touch works again
        {
          await touch('touchStart', [at(-Math.PI / 2)]); await settle();
          await touch('touchStart', [at(-Math.PI / 2), tp(c.x + 80, c.y + 80, 1)]); await p.waitForTimeout(120);
          await touch('touchEnd', [at(-Math.PI / 2)]); await p.waitForTimeout(120);
          await touch('touchMove', [at(0)]); await settle();
          const a2 = await aim(); await touch('touchEnd', []);
          if (!Number.isFinite(a2)) fails.push(`${tag} two finger tap broke the aim`);
          if (await p.evaluate(() => window.CS.mode()) !== 'play') fails.push(`${tag} two finger tap left the play mode`);
          await touch('touchStart', [at(Math.PI / 2)]); await settle(); const a3 = await aim(); await touch('touchEnd', []);
          if (dA(a3, Math.PI / 2) > 0.15) fails.push(`${tag} aim does not recover after a two finger tap (${(a3 * 180 / Math.PI).toFixed(1)})`);
        }
        // 7. the shots really leave towards the finger
        {
          await touch('touchStart', [at(0)]); await p.waitForTimeout(600);
          const dirs = await p.evaluate(async () => { const o = []; for (let i = 0; i < 20; i++) { for (const b of window.CS.g.bullets) o.push(Math.atan2(b.vy, b.vx)); await new Promise(r => setTimeout(r, 30)); } return o; });
          await touch('touchEnd', []);
          if (!dirs.length) fails.push(`${tag} no bullets while aiming`); else if (!dirs.some(d => dA(d, 0) < 0.4)) fails.push(`${tag} bullets do not fly towards the finger`);
        }

        // ---- lane stage: a touch drag still slides the duo, the aim stays up
        await p.evaluate(() => window.CS.startRun(3)); await p.waitForTimeout(900);
        assert.ok(await p.evaluate(() => !window.CS.g.ring), tag + ' stage 3 is a lane stage');
        // b12s: follow-the-finger is the default now; this block checks the older joystick-style slide
        await p.evaluate(() => { window.CS.save().settings.controlStyle = 'joystick'; });
        await calm();
        {
          const x0 = await p.evaluate(() => window.CS.g.p.x), y0 = Math.round(h * 0.8);
          await touch('touchStart', [tp(w * 0.3, y0)]);
          for (let i = 1; i <= 14; i++) { await touch('touchMove', [tp(w * 0.3 + i * 14, y0)]); await p.waitForTimeout(40); }
          await p.waitForTimeout(300);
          const x1 = await p.evaluate(() => window.CS.g.p.x);
          await touch('touchEnd', []);
          if (!(x1 > x0 + 40)) fails.push(`${tag} lane drag right did not slide the duo (${x0.toFixed(0)} to ${x1.toFixed(0)})`);
          await touch('touchStart', [tp(w * 0.7, y0)]);
          for (let i = 1; i <= 14; i++) { await touch('touchMove', [tp(w * 0.7 - i * 14, y0)]); await p.waitForTimeout(40); }
          await p.waitForTimeout(300);
          const x2 = await p.evaluate(() => window.CS.g.p.x);
          await touch('touchEnd', []);
          if (!(x2 < x1 - 40)) fails.push(`${tag} lane drag left did not slide the duo (${x1.toFixed(0)} to ${x2.toFixed(0)})`);
          const up = await p.evaluate(() => window.CS.g.p.aim);
          if (Math.abs(up + Math.PI / 2) > 1e-6) fails.push(`${tag} lane stage aim is not straight up: ${up}`);
          await p.waitForTimeout(600); const x2b = await p.evaluate(() => window.CS.g.p.x);
          await touch('touchStart', [tp(w / 2, h * 0.9)]);
          for (let i = 1; i <= 8; i++) { await touch('touchMove', [tp(w / 2, h * 0.9 - i * 20)]); await p.waitForTimeout(30); }
          await touch('touchEnd', []); await p.waitForTimeout(200);
          const x4 = await p.evaluate(() => window.CS.g.p.x);
          if (Math.abs(x4 - x2b) > 30) fails.push(`${tag} vertical swipe slid the duo by ${Math.abs(x4 - x2b).toFixed(0)}`);
        }
        if (errs.length) fails.push(`${tag}: ${errs.join(' | ')}`);
        await ctx.close();
      }
    } finally { await browser.close(); srv.close(); }
    assert.deepEqual(fails, [], 'touch aim:\n' + fails.join('\n'));
  } else srv.close();
} else console.log('35_a_touch_aim: skipped, no Chromium');
