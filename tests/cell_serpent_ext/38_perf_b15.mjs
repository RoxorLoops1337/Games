// 38 perf b15: the draw path of a busy fight stays lean, and a phone that struggles gets the lighter effects by itself.
// Browser: (1) 80 notes in the air add almost no canvas save/restore pairs (they used to cost three per note), (2) the automatic low quality tier switches on when
// the measured draw time stays high and off again after a quiet stretch, without touching the saved setting. Static: the pieces are wired. Skipped without Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const rn = rd('render.js'), mj = rd('main.js');
ok(/function trailSpr\(/.test(rn) && /function sprFast\(/.test(rn) && /ctx\.setTransform\(m\.a \* c/.test(rn), 'bullets and zones use one transform call per sprite');
ok(/function sparkleAt[\s\S]{0,400}drawImage\(sparkSpr/.test(rn), 'the sparkle is a baked sprite');
ok(/if \(t === null\) return;/.test(rn) && !/live strokeText fallback/.test(rn), 'text over the bake budget waits a frame instead of drawing live');
ok(/function governDraw\(/.test(mj) && /lowQuality: !!save\.settings\.lowQuality \|\| autoLow/.test(mj), 'the automatic tier is wired into the settings');

const req = createRequire(import.meta.url);
let chromium = null;
for (const p of [path.join(ROOT, 'node_modules', 'playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright-core', 'playwright']) { try { chromium = req(p).chromium; break; } catch (e) { /* next */ } }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (chromium) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); return; } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(d); }); }).listen(0);
  await new Promise(res => srv.once('listening', res));
  let browser = null;
  try { browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); } catch (e) { console.log('38_perf_b15: browser part skipped, no Chromium'); }
  if (browser) {
    const SAVE = JSON.stringify({ v: 8, beats: 900000, sparkles: 900, cleared: 50, best: 50, runs: 300, eggs: 30, xp: 90000, energy: { n: 40, t: 0 }, unlocked: { legacy: 1, seen: {} } });
    try {
      const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await p.addInitScript(s => { if (!localStorage.getItem('seeded')) { localStorage.setItem('cell_serpent_save_v1', s); localStorage.setItem('seeded', '1'); } }, SAVE);
      await p.goto(`http://localhost:${srv.address().port}/cell_serpent/`); await p.waitForFunction(() => window.CS && window.CS.R, null, { timeout: 15000 });
      await p.evaluate(() => window.CS.startRun(20)); await p.waitForFunction(() => window.CS.g && window.CS.g.phase === 'play', null, { timeout: 10000 });
      await p.waitForTimeout(600);
      const r = await p.evaluate(() => {
        const g = window.CS.g, R = window.CS.R, P = CanvasRenderingContext2D.prototype, o = P.save; let saves = 0; P.save = function () { saves++; return o.apply(this, arguments); };
        const ui = { joy: { on: false, dx: 0 } };
        const count = () => { R.draw(g, ui, 0.016); saves = 0; R.draw(g, ui, 0.016); const s0 = saves; return s0; };
        g.bullets.length = 0; const base = count();
        for (let i = 0; i < 80; i++) g.bullets.push({ x: 40 + (i % 16) * 40, y: 500 + (i >> 4) * 60, vx: 0, vy: -900, dmg: 10, crit: i % 3 === 0, pierce: 0, r: 6, life: 1, hit: [], beat: false, kind: 'pill', home: 0, splash: 0, slow: 0 });
        const many = count(); P.save = o; return { base, many };
      });
      n++; assert.ok(r.many - r.base <= 12, `80 notes added ${r.many - r.base} saves (was about 240)`);
      // the automatic tier: sustained slow frames switch it on, a long quiet stretch switches it off, the saved setting never changes
      const t = await p.evaluate(() => {
        const before = !!window.CS.save().settings.lowQuality; for (let i = 0; i < 400; i++) window.CS.govern(16);
        const on = window.CS.perf().autoLow; for (let i = 0; i < 3000; i++) window.CS.govern(1.5);
        const off = window.CS.perf().autoLow; return { before, on, off, after: !!window.CS.save().settings.lowQuality };
      });
      n++; assert.ok(t.on === true && t.off === false && t.before === false && t.after === false, JSON.stringify(t));
      await p.close();
    } finally { await browser.close(); srv.close(); }
  } else srv.close();
} else console.log('38_perf_b15: browser part skipped, no Chromium');
console.log('38_perf_b15 ok', n);
