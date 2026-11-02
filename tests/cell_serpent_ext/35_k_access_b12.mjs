// 35_k accessibility batch 12: (1) a pixel based contrast audit of the in-run canvas HUD text (every text() draw is logged, a second frame
// without text gives the real pixels behind it, the halo pixels next to each glyph are measured against the glyph colour, 4.5:1 strict),
// (2) the ring (circle) stage aim from the keyboard, spoken as "Aiming: up right" (rate limited), (3) the slide bar turns the aim for a
// left handed player, (4) reduced motion freezes the ring and the aim line, (5) colour blind safe aim line and a non-colour danger cue,
// (6) the full screen button and the iPhone hint work from the keyboard and are labelled. Browser part skipped without Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CS = path.join(ROOT, 'cell_serpent');
const read = f => fs.readFileSync(path.join(CS, f), 'utf8');
const EM = String.fromCharCode(8212);
for (const f of ['a11y_b12k.js', 'fullscreen_fs.js', 'render.js', 'main.js']) assert.ok(!read(f).includes(EM), f + ' has no em dash');
assert.ok(!fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').includes(EM));

const K = await import(path.join(CS, 'a11y_b12k.js'));
const sim = await import(path.join(CS, 'sim.js'));

// ---- pure: eight direction words
assert.equal(K.aimWords(-Math.PI / 2), 'up');
assert.equal(K.aimWords(-Math.PI / 4), 'up right');
assert.equal(K.aimWords(0), 'right');
assert.equal(K.aimWords(Math.PI / 4), 'down right');
assert.equal(K.aimWords(Math.PI / 2), 'down');
assert.equal(K.aimWords(Math.PI), 'left');
assert.equal(K.aimWords(-Math.PI), 'left');
assert.equal(K.aimWords(-3 * Math.PI / 4), 'up left');
assert.equal(K.aimWords(3 * Math.PI / 4), 'down left');
assert.equal(K.aimWords(NaN), 'up');
assert.equal(K.aimSpeech(-Math.PI / 4), 'Aiming: up right');
for (let a = -7; a < 7; a += 0.1) assert.ok(K.AIM_NAMES.includes(K.aimWords(a)), 'every angle has a word');
// ---- pure: key snapping
assert.equal(K.keyAim({}), null);
assert.equal(K.keyAim({ arrowleft: true }), null, 'left alone turns smoothly');
assert.equal(K.keyAim({ arrowright: true }), null);
assert.equal(K.keyAim({ arrowup: true }), -Math.PI / 2);
assert.equal(K.keyAim({ w: true }), -Math.PI / 2);
assert.equal(K.keyAim({ arrowdown: true }), Math.PI / 2);
assert.equal(K.aimWords(K.keyAim({ arrowup: true, arrowright: true })), 'up right');
assert.equal(K.aimWords(K.keyAim({ arrowup: true, arrowleft: true })), 'up left');
assert.equal(K.aimWords(K.keyAim({ s: true, d: true })), 'down right');
assert.equal(K.aimWords(K.keyAim({ arrowdown: true, a: true })), 'down left');
assert.equal(K.keyAim({ arrowup: true, arrowdown: true }), null, 'opposite keys cancel');
// ---- pure: slide bar turns the aim
assert.ok(K.sliderAim(0, 1, 0.5) > 1 && K.sliderAim(0, -1, 0.5) < -1);
assert.equal(K.sliderAim(1, 0, 1), 1);
assert.ok(Math.abs(K.sliderAim(0, 9, 1) - K.SLIDER_TURN) < 1e-9, 'clamped to full deflection');
assert.equal(K.sliderAim(0, NaN, 1), 0);
// ---- pure: the announcer is rate limited and waits for the aim to settle
{
  const st = K.newAimState(); const said = []; let t = 0;
  const run = (a, ms) => { for (let i = 0; i < ms / 16; i++) { t += 16; const s = K.aimStep(st, a, t); if (s) said.push(s); } };
  run(-Math.PI / 2, 2000); assert.deepEqual(said, [], 'the starting direction is not repeated');
  run(-Math.PI / 4, 1000); assert.deepEqual(said, ['Aiming: up right']);
  // a sweep through every direction in 3 seconds: at most one line per AIM_GAP
  const n0 = said.length; for (let a = -Math.PI / 4; a < Math.PI * 1.75; a += 0.03) run(a, 16);
  assert.ok(said.length - n0 <= 3, 'a fast sweep is rate limited: ' + (said.length - n0));
  run(Math.PI, 2500); assert.equal(said[said.length - 1], 'Aiming: left', 'the settled direction is spoken at the end');
  const n1 = said.length; run(Math.PI + 0.1, 3000); assert.equal(said.length, n1, 'a wobble inside one direction says nothing');
  const st2 = K.newAimState(); let u = 0, c = 0; for (let i = 0; i < 400; i++) { u += 16; if (K.aimStep(st2, i % 2 ? 0 : Math.PI, u)) c++; } assert.equal(c, 0, 'a flicker between two directions never settles, so it is never spoken');
}
assert.ok(K.RING_LABEL.includes('Aiming: up right') && K.RING_LABEL.includes('arrows') && K.FIELD_LABEL.includes('slides left and right'));
// ---- static wiring
{
  const m = read('main.js'), r = read('render.js'), f = read('fullscreen_fs.js');
  assert.ok(/watchAim\(aimS\.now\)/.test(m) && /keyAim\(keys\)/.test(m) && /sliderAim\(aimS\.tgt, joy\.sdx/.test(m) && /setFieldLabel\(!!g\.ring\)/.test(m) && /resetAimSr\(\)/.test(m), 'main.js uses the helpers');
  assert.ok(/OPT\.reduceMotion \? 0 : S\.t, isBossStage/.test(r), 'reduced motion freezes the ring clock');
  assert.ok(/OPT\.colorBlind && dng > 0\.25/.test(r), 'colour blind danger band');
  assert.ok(/aria-pressed/.test(f) && /Escape/.test(f), 'full screen button is a toggle and the hint closes with Escape');
}

// ---- real browser
const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); });
  await new Promise(res => srv.listen(0, res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('35_k_access_b12: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = { v: 8, beats: 5000, sparkles: 300, cleared: 40, best: 40, runs: 30, eggs: 3, ribbons: 80, xp: 1500, energy: { n: 40, t: 0 }, stars: { 1: 3, 2: 2, 3: 3 } };
    const open = async (vp, settings, init) => {
      const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
      const p = await ctx.newPage(); p.errs = []; p.ctx = ctx;
      p.on('pageerror', e => p.errs.push(e.message));
      await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, JSON.stringify({ ...SAVE, settings: settings || {} }));
      if (init) await p.addInitScript(init);
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 10000 });
      await p.waitForTimeout(700); return p;
    };
    const play = async (p, st) => { await p.evaluate(s => window.CS.startRun(s), st); await p.waitForFunction(() => window.CS.g && window.CS.g.phase === 'play', null, { timeout: 8000 }); await p.waitForTimeout(600); };
    const aim = p => p.evaluate(() => window.CS.g.p.aim);
    const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

    // ======== 1. pixel based contrast audit of the canvas HUD text
    const audit = opt => {
      const R = window.CS.R, g = window.CS.g, S = R.state, cv = document.getElementById('c'), ctx = cv.getContext('2d');
      const hex = c => { const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      for (const [k, v] of Object.entries(opt.set || {})) g[k] = v;
      const ui = { hints: false, aimHint: !!g.ring, joy: { on: false } };
      S.trauma = 0; S.flash = 0;
      S.textLog = []; R.draw(g, ui, 0); const log = S.textLog; S.textLog = null;
      const A = ctx.getImageData(0, 0, cv.width, cv.height);
      S.textHide = true; R.draw(g, ui, 0); S.textHide = false;
      const B = ctx.getImageData(0, 0, cv.width, cv.height);
      const dpr = cv.width / innerWidth, mc = document.createElement('canvas').getContext('2d');
      const seen = new Set(), rows = [], fails = [];
      for (const t of log) {
        if (t.alpha < 0.85 || !/[A-Za-z0-9]/.test(t.str)) continue;
        const fill = hex(t.fill), stroke = hex(t.stroke);
        if (!fill || !stroke) { fails.push({ s: t.str, why: 'colour not a hex string: ' + t.fill + ' / ' + t.stroke }); continue; }
        const key = t.str + '|' + Math.round(t.x) + '|' + Math.round(t.y); if (seen.has(key)) continue; seen.add(key);
        mc.font = `800 ${t.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        const w = mc.measureText(t.str).width, h = t.size * 0.72;
        let x0 = t.align === 'left' ? t.x : t.align === 'right' ? t.x - w : t.x - w / 2;
        x0 = Math.max(0, Math.floor(x0)); const y0 = Math.max(0, Math.floor(t.y - h / 2)), x1 = Math.min(cv.width, Math.ceil(x0 + w)), y1 = Math.min(cv.height, Math.ceil(t.y + h / 2));
        if (x1 - x0 < 4 || y1 - y0 < 4) continue;
        const halo = []; let glyph = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * cv.width + x) * 4, a = [A.data[i], A.data[i + 1], A.data[i + 2]];
          const touched = Math.abs(a[0] - B.data[i]) + Math.abs(a[1] - B.data[i + 1]) + Math.abs(a[2] - B.data[i + 2]) >= 30;   // a dark halo over a dark floor does not change the pixel, it still backs the glyph
          const df = Math.abs(a[0] - fill[0]) + Math.abs(a[1] - fill[1]) + Math.abs(a[2] - fill[2]), ds = Math.abs(a[0] - stroke[0]) + Math.abs(a[1] - stroke[1]) + Math.abs(a[2] - stroke[2]);
          if (df < 40) { if (touched) glyph++; } else if (ds < 40) halo.push(cr(fill, a));
        }
        if (glyph < 3) continue;   // the text is not really visible in this frame (covered or off screen): nothing to judge
        const haloMin = halo.length ? Math.min(...halo) : 0, row = { s: t.str, px: +(t.size / dpr).toFixed(1), fs: t.fill + ' on ' + t.stroke, halo: +haloMin.toFixed(2), pair: +cr(fill, stroke).toFixed(2), haloN: halo.length, glyph };
        rows.push(row);
        if (row.pair < opt.need || (halo.length >= 4 && haloMin < opt.need)) fails.push(row);   // a very thin glyph (a lone '1') may leave fewer than 4 clean halo pixels: then the fill against its own outline colour decides   // the text needs a real halo of its own, measured on the rendered pixels
      }
      return { n: rows.length, rows, fails, minPx: Math.min(...rows.map(r => r.px)) };
    };
    const contrast = (a, b) => { const l = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }; const x = l(a), y = l(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    assert.ok(Math.abs(contrast([255, 255, 255], [0, 0, 0]) - 21) < 0.01 && contrast([119, 119, 119], [136, 136, 136]) < 1.5, 'the contrast maths');
    {
      const p = await open();
      const SCENES = [
        ['lane stage 3', 3, {}], ['lane groove on fire', 3, { groove: 20, combo: 14 }], ['ring stage 6 with the aim hint', 6, {}], ['ring boss stage 12', 12, {}],
        ['boss stage 30', 30, {}], ['double snake stage 7', 7, {}], ['encore ready', 10, { encore: 1 }],
      ];
      let total = 0, minPx = 99; const seenStr = new Set();
      for (const hc of [false, true]) {
        await p.evaluate(h => window.CS.R.setOptions({ highContrast: h, colorBlind: h }), hc);
        for (const [name, st, set] of SCENES) {
          await play(p, st);
          const res = await p.evaluate(audit, { need: 4.5, set });
          total += res.n; minPx = Math.min(minPx, res.minPx); for (const r of res.rows) seenStr.add(r.s);
          assert.ok(res.n >= 8, name + ': the audit saw the HUD text (' + res.n + ')');
          assert.deepEqual(res.fails, [], name + (hc ? ' (high contrast + colour blind)' : '') + ': every HUD text needs 4.5:1 against its halo');
        }
      }
      for (const w of ['GROOVE', 'DRAG TO AIM']) assert.ok([...seenStr].some(s => s.includes(w)), 'the audit covered ' + w);
      assert.ok(total > 150, 'enough text draws were measured: ' + total);
      console.log('35_k HUD text contrast: ' + total + ' text draws measured, smallest text ' + minPx + ' CSS px');
      assert.deepEqual(p.errs, []); await p.ctx.close();
    }

    // ======== 2. keyboard aim in a ring stage, spoken
    {
      const p = await open();
      await play(p, 6); assert.ok(await p.evaluate(() => !!window.CS.g.ring), 'stage 6 is a ring stage');
      const lab = await p.evaluate(() => document.getElementById('c').getAttribute('aria-label'));
      assert.ok(/turn the aim/.test(lab) && /Aiming: up right/.test(lab), 'the field name explains the ring controls: ' + lab);
      await p.evaluate(() => { window.__said = []; const el = document.getElementById('a11yLive'); new MutationObserver(() => { if (el.textContent) window.__said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
      const a0 = await aim(p);
      await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight'); await p.waitForTimeout(250);
      const a1 = await aim(p); assert.ok(a1 > a0 + 0.3, 'ArrowRight turns the aim clockwise: ' + a0 + ' -> ' + a1);
      await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(500); await p.keyboard.up('ArrowLeft'); await p.waitForTimeout(250);
      assert.ok(await aim(p) < a1 - 0.3, 'ArrowLeft turns it back');
      await p.keyboard.down('ArrowUp'); await p.waitForTimeout(300); await p.keyboard.up('ArrowUp'); await p.waitForTimeout(150);
      assert.ok(angDiff(await aim(p), -Math.PI / 2) < 0.08, 'ArrowUp aims straight up');
      await p.keyboard.down('ArrowDown'); await p.waitForTimeout(500); await p.keyboard.up('ArrowDown'); await p.waitForTimeout(150);
      assert.ok(angDiff(await aim(p), Math.PI / 2) < 0.08, 'ArrowDown aims straight down');
      await p.keyboard.down('ArrowUp'); await p.keyboard.down('ArrowRight'); await p.waitForTimeout(600);
      assert.ok(angDiff(await aim(p), -Math.PI / 4) < 0.1, 'Up with Right aims up right: ' + await aim(p));
      await p.waitForTimeout(1900);   // settle + rate limit gap
      await p.keyboard.up('ArrowRight'); await p.keyboard.up('ArrowUp');
      const said = await p.evaluate(() => window.__said.filter(s => /^Aiming/.test(s)));
      assert.ok(said.includes('Aiming: up right'), 'announced "Aiming: up right": ' + JSON.stringify(said));
      assert.ok(said.length <= 6, 'rate limited, ' + said.length + ' lines for about 5 seconds of play: ' + JSON.stringify(said));
      // ...and the on screen aim line really points that way: the pixels along it are the aim yellow
      assert.deepEqual(p.errs, []); await p.ctx.close();
    }

    // ======== 3. left handed slide bar turns the aim in a ring stage; a touch anywhere aims too; no thumb zone hint over a ring
    {
      const p = await open(null, { slider: true, leftHand: true, thumbZone: true });
      await play(p, 6);
      const info = await p.evaluate(() => { const el = document.getElementById('accSlider'), r = el.getBoundingClientRect(), z = document.getElementById('accZone'); return { on: el.classList.contains('on'), lf: el.classList.contains('lf'), r: [r.left, r.top, r.width, r.height], label: el.getAttribute('aria-label'), zone: z ? z.classList.contains('on') : false, vw: innerWidth, vh: innerHeight }; });
      assert.ok(info.on && info.lf, 'the left handed slide bar is on in a ring stage');
      assert.ok(info.r[3] >= 44 && info.r[2] >= 120, 'slide bar is a big target: ' + info.r);
      assert.ok(info.r[0] < info.vw / 2 && info.r[0] + info.r[2] <= info.vw, 'left handed: the bar sits in the left half');
      assert.ok(/Aim bar/.test(info.label), 'the bar is named for aiming here: ' + info.label);
      assert.equal(info.zone, false, 'the thumb zone hint is hidden in a ring stage (it does not steer there)');
      const [bx, by, bw, bh] = info.r; const a0 = await aim(p);
      await p.mouse.move(bx + bw / 2, by + bh / 2); await p.mouse.down(); await p.mouse.move(bx + bw * 0.9, by + bh / 2, { steps: 4 }); await p.waitForTimeout(500);
      const a1 = await aim(p); await p.mouse.move(bx + bw * 0.1, by + bh / 2, { steps: 4 }); await p.waitForTimeout(700); const a2 = await aim(p); await p.mouse.up();
      assert.ok(a1 > a0 + 0.4, 'sliding right turns the aim clockwise: ' + a0 + ' -> ' + a1);
      assert.ok(a2 < a1 - 0.4, 'sliding left turns it back: ' + a2);
      // a real touch on the playfield aims at the touch point (right of the duo, level with it)
      const pt = await p.evaluate(() => { const R = window.CS.R, L = R.layout(), g = window.CS.g, dpr = document.getElementById('c').width / innerWidth; return { x: (g.p.x * L.s + L.ox) / dpr, y: (g.p.y * L.s + L.oy) / dpr }; });
      await p.touchscreen.tap(pt.x + 90, pt.y); await p.waitForTimeout(400);
      assert.ok(angDiff(await aim(p), 0) < 0.15, 'a touch right of the duo aims right: ' + await aim(p));
      await p.touchscreen.tap(pt.x - 70, pt.y - 70); await p.waitForTimeout(400);
      assert.ok(angDiff(await aim(p), -3 * Math.PI / 4) < 0.15, 'a touch up left aims up left: ' + await aim(p));
      assert.deepEqual(p.errs, []); await p.ctx.close();
    }
    // the same bar in a lane stage still slides the duo (the default behaviour must not change)
    {
      const p = await open(null, { slider: true });
      await play(p, 3); const x0 = await p.evaluate(() => window.CS.g.p.x);
      const r = await p.evaluate(() => { const b = document.getElementById('accSlider').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
      await p.mouse.move(r[0] + r[2] / 2, r[1] + r[3] / 2); await p.mouse.down(); await p.mouse.move(r[0] + r[2] * 0.9, r[1] + r[3] / 2, { steps: 4 }); await p.waitForTimeout(500); await p.mouse.up();
      assert.ok(await p.evaluate(() => window.CS.g.p.x) > x0 + 20, 'the bar still slides the duo in a lane stage');
      assert.equal(await p.evaluate(() => document.getElementById('accSlider').getAttribute('aria-label')), 'Slide bar'); await p.ctx.close();
    }

    // ======== 4. reduced motion: the ring and the aim line hold still
    {
      const p = await open();
      await play(p, 6);
      await p.waitForTimeout(3500);   // let the stage intro card (ACT pill over the ring) leave, it animates by design
      const run = reduce => p.evaluate(async reduce => {
        const R = window.CS.R, g = window.CS.g, S = R.state, cv = document.getElementById('c'), ctx = cv.getContext('2d'), L = R.layout();
        R.setOptions({ reduceMotion: reduce }); S.trauma = 0; g.p.aim = -Math.PI / 4;
        const proto = CanvasRenderingContext2D.prototype, d = Object.getOwnPropertyDescriptor(proto, 'lineDashOffset'), offs = new Set();
        Object.defineProperty(proto, 'lineDashOffset', { configurable: true, get() { return d.get.call(this); }, set(v) { offs.add(Math.round(v * 100) / 100); d.set.call(this, v); } });
        const ui = { hints: false, aimHint: false, joy: { on: false } }, frames = [];
        const ring = g.ring, rx = Math.round(ring.cx * L.s + L.ox), ry = Math.round(ring.cy * L.s + L.oy), rr = Math.round(ring.R * L.s);
        for (let k = 0; k < 3; k++) { R.draw(g, ui, 0.37); frames.push(ctx.getImageData(rx - rr - 40, ry - rr - 40, 2 * rr + 80, 2 * rr + 80).data); }
        Object.defineProperty(proto, 'lineDashOffset', d);
        // pixels of the rim band (ring radius -10..+30) that differ between frames 2 and 3
        const W2 = 2 * rr + 80; let diff = 0, band = 0;
        for (let y = 0; y < W2; y++) for (let x = 0; x < W2; x++) {
          const dd = Math.hypot(x - W2 / 2, y - W2 / 2); if (dd < rr - 10 * L.s || dd > rr + 30 * L.s) continue; band++;
          const i = (y * W2 + x) * 4; if (Math.abs(frames[1][i] - frames[2][i]) + Math.abs(frames[1][i + 1] - frames[2][i + 1]) + Math.abs(frames[1][i + 2] - frames[2][i + 2]) > 24) diff++;
        }
        R.setOptions({ reduceMotion: false });
        return { offs: [...offs], frac: diff / band };
      }, reduce);
      const calm = await run(true), live = await run(false);
      assert.ok(live.offs.some(v => v !== 0), 'normally the dashes crawl: ' + JSON.stringify(live.offs));
      assert.deepEqual(calm.offs.filter(v => v !== 0), [], 'reduced motion: no dash ever moves (aim line, ring rim): ' + JSON.stringify(calm.offs));
      assert.ok(calm.frac < 0.02, 'reduced motion: the ring rim stays still between frames (' + calm.frac.toFixed(3) + ' of the rim pixels changed)');
      assert.ok(live.frac > calm.frac, 'the still rim is really calmer than the live one (' + live.frac.toFixed(3) + ' vs ' + calm.frac.toFixed(3) + ')');
      assert.deepEqual(p.errs, []); await p.ctx.close();
    }

    // ======== 5. colour blind: the aim line reads by brightness and shape; the danger rim has a non-colour cue
    {
      const p = await open();
      await play(p, 6);
      const res = await p.evaluate(() => {
        const R = window.CS.R, g = window.CS.g, S = R.state, cv = document.getElementById('c'), ctx = cv.getContext('2d'), L = R.layout();
        R.setOptions({ colorBlind: true, reduceMotion: true }); S.trauma = 0; S.textHide = true; g.p.aim = -Math.PI / 4;
        R.draw(g, { hints: false, aimHint: false, joy: { on: false } }, 0); S.textHide = false;
        const W = cv.width, H = cv.height, img = ctx.getImageData(0, 0, W, H).data;
        const px = (gx, gy) => { const x = Math.round(gx * L.s + L.ox), y = Math.round(gy * L.s + L.oy), i = (y * W + x) * 4; return [img[i], img[i + 1], img[i + 2]]; };
        const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const sim = (c, M) => { const l = c.map(lin), o = M.map(r => Math.max(0, Math.min(1, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))); return 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2]; };
        const MAT = { none: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] };
        const p0 = g.p, a = g.p.aim, c = Math.cos(a), s = Math.sin(a), line = [], bg = [];
        for (let r = 34; r < g.ring.R - 8; r += 1) { line.push(px(p0.x + c * r, p0.y + s * r)); }
        for (let r = 40; r < g.ring.R - 12; r += 6) for (const side of [-18, 18]) bg.push(px(p0.x + c * r - s * side, p0.y + s * r + c * side));
        const out = {};
        for (const [k, M] of Object.entries(MAT)) {
          const ls = line.map(v => sim(v, M)).sort((x, y) => y - x), bs = bg.map(v => sim(v, M)).sort((x, y) => x - y);
          const top = ls[Math.floor(ls.length * 0.05)], back = bs[Math.floor(bs.length * 0.5)];
          out[k] = (Math.max(top, back) + 0.05) / (Math.min(top, back) + 0.05);
        }
        // danger: put the head on the rim and watch for the dashed white band
        const proto = CanvasRenderingContext2D.prototype, d = proto.setLineDash, dashes = []; proto.setLineDash = function (a) { dashes.push(a.join(',')); return d.call(this, a); };
        const head = g.snakes[0].segs[0], keep = [head.x, head.y]; head.x = g.ring.cx; head.y = g.ring.cy + g.ring.R;
        R.setOptions({ colorBlind: true, reduceMotion: false }); R.draw(g, { hints: false, aimHint: false, joy: { on: false } }, 0.016); const withCb = dashes.slice(); dashes.length = 0;
        R.setOptions({ colorBlind: false }); R.draw(g, { hints: false, aimHint: false, joy: { on: false } }, 0.016); const without = dashes.slice();
        proto.setLineDash = d; head.x = keep[0]; head.y = keep[1]; R.setOptions({ colorBlind: false, reduceMotion: false });
        return { out, band: withCb.includes('7,9'), bandOff: without.includes('7,9') };
      });
      for (const [k, v] of Object.entries(res.out)) assert.ok(v >= 3, 'aim line vs the ring floor, ' + k + ' vision: ' + v.toFixed(2) + ':1 (3:1 for graphics)');
      assert.equal(res.band, true, 'colour blind mode adds a dashed white band when a head nears the rim');
      assert.equal(res.bandOff, false, 'the band is only for colour blind mode');
      assert.deepEqual(p.errs, []); await p.ctx.close();
    }

    // ======== 6. the full screen button and the iPhone hint
    {
      const p = await open({ width: 390, height: 844 }, {}, 'window.__fs = []; Element.prototype.requestFullscreen = function (o) { window.__fs.push(o || {}); return Promise.resolve(); };');
      const info = await p.evaluate(() => { const b = document.getElementById('fsBtn'), r = b.getBoundingClientRect(); return { hidden: b.hidden, r: [r.width, r.height], label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), tag: b.tagName, vis: getComputedStyle(b).display }; });
      assert.ok(!info.hidden && info.vis !== 'none', 'the button shows where full screen exists');
      assert.ok(info.r[0] >= 44 && info.r[1] >= 44, 'at least 44x44: ' + info.r);
      assert.equal(info.label, 'Full screen'); assert.equal(info.pressed, 'false'); assert.equal(info.tag, 'BUTTON');
      let hit = false; for (let i = 0; i < 25 && !hit; i++) { await p.keyboard.press('Tab'); hit = await p.evaluate(() => document.activeElement && document.activeElement.id === 'fsBtn'); }
      assert.ok(hit, 'Tab reaches the full screen button');
      const ring = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
      assert.ok(ring, 'keyboard focus is visible on the full screen button');
      await p.keyboard.press('Enter'); await p.waitForTimeout(200);
      assert.ok(await p.evaluate(() => window.__fs.length) >= 1, 'Enter on the focused button asks for full screen');
      const overlap = await p.evaluate(() => { const a = document.getElementById('fsBtn').getBoundingClientRect(), out = []; for (const q of document.querySelectorAll('#title button, #title .gear')) { if (q.id === 'fsBtn' || !q.offsetParent) continue; const b = q.getBoundingClientRect(); if (!(a.right + 8 <= b.left || b.right + 8 <= a.left || a.bottom + 8 <= b.top || b.bottom + 8 <= a.top)) out.push(q.id || q.className); } return out; });
      assert.deepEqual(overlap, [], 'the full screen button keeps an 8px gap from its neighbours on the title');
      assert.deepEqual(p.errs, []); await p.ctx.close();
    }
    {
      const IP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
      const p = await open({ width: 390, height: 844 }, {}, `Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(IP)}});Object.defineProperty(navigator,'platform',{get:()=>'iPhone'});delete Element.prototype.requestFullscreen;delete Element.prototype.webkitRequestFullscreen;`);
      await p.waitForFunction(() => document.getElementById('a2hsFs'), null, { timeout: 6000 });
      const h = await p.evaluate(() => { const d = document.getElementById('a2hsFs'), b = d.querySelector('.a2x'), r = b.getBoundingClientRect(), t = d.querySelector('.a2t span'), fs = parseFloat(getComputedStyle(t).fontSize); return { role: d.getAttribute('role'), label: d.getAttribute('aria-label'), live: d.getAttribute('aria-live'), btn: b.getAttribute('aria-label'), btnText: b.textContent, r: [r.width, r.height], fs, text: d.textContent, arrowHidden: d.querySelector('.a2arrow').getAttribute('aria-hidden') }; });
      assert.equal(h.role, 'dialog'); assert.ok(/Home Screen/.test(h.label));
      assert.ok(h.btn.toLowerCase().includes(h.btnText.toLowerCase()), 'the button name contains its visible text: ' + h.btn);
      assert.ok(h.r[0] >= 44 && h.r[1] >= 44 && h.fs >= 12, 'hint button 44px and text 12px: ' + JSON.stringify(h.r) + ' ' + h.fs);
      assert.ok(/Share/.test(h.text) && /Add to Home Screen/.test(h.text) && h.arrowHidden === 'true');
      // contrast of the hint text on its card (css colours)
      const cc = await p.evaluate(() => { const d = document.getElementById('a2hsFs'), pick = el => getComputedStyle(el).color.match(/\d+/g).slice(0, 3).map(Number); return { card: getComputedStyle(d).backgroundColor.match(/\d+/g).slice(0, 3).map(Number), span: pick(d.querySelector('.a2t span')), b: pick(d.querySelector('.a2t b')), u: pick(d.querySelector('.a2t u')), btnC: pick(d.querySelector('.a2x')), btnBg: getComputedStyle(d.querySelector('.a2x')).backgroundColor.match(/\d+/g).slice(0, 3).map(Number) }; });
      for (const k of ['span', 'b', 'u']) assert.ok(contrast(cc[k], cc.card) >= 4.5, 'hint text ' + k + ' contrast ' + contrast(cc[k], cc.card).toFixed(2));
      assert.ok(contrast(cc.btnC, cc.btnBg) >= 4.5, 'hint button contrast');
      let hit = false; for (let i = 0; i < 40 && !hit; i++) { await p.keyboard.press('Tab'); hit = await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('a2x')); }
      assert.ok(hit, 'Tab reaches the hint OK button');
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      assert.equal(await p.evaluate(() => !!document.getElementById('a2hsFs')), false, 'Escape closes the hint');
      assert.deepEqual(p.errs, []); await p.ctx.close();
    }
    await browser.close();
  }
  srv.close();
}
console.log('35_k_access_b12 ok');
