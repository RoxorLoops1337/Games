// Ludus Maximus 3D: hub light/legibility check. One browser session, many weather x hour states.
//   node tools/ludus3d_hub_light.mjs <outPrefix> [--w 390] [--h 800] [--tier low] [--states night@22,clear@12,heat@13] [--min night=48,clear=60] [--extra "query"] [--eval "js"] [--advance 1.5] [--noshot] [--ui]
// For each state: setWeather/setHour, advance, screenshot, then the mean luminance (0..255, sRGB Rec709) of the BUILDINGS area (centre 80% x, 28..78% y),
// of the whole frame, and the 5th/95th percentile spread. Exit code 1 when a state's buildings-area mean is under its --min threshold (default: night 40, others 55).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const a = process.argv.slice(2), out = a[0], opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const W = +opt('w', 390), H = +opt('h', 800), tier = opt('tier', 'low'), adv = +opt('advance', 1.5);
const states = opt('states', 'night@22,clear@12').split(',').map((s) => { const [w, h] = s.split('@'); return { w, h: h == null ? null : +h }; });
const mins = Object.fromEntries(opt('min', '').split(',').filter(Boolean).map((s) => s.split('=')).map(([k, v]) => [k, +v]));
const url = `http://localhost:8211/ludus_maximus_3d/index.html?new=1&rich=1&notut=1&nowarm=1&manual=1&tier=${tier}${opt('extra', '') ? '&' + opt('extra', '') : ''}`;
const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let errs = 0; page.on('pageerror', (e) => { errs++; console.log('PAGE ERROR', e.message.slice(0, 400)); });
await page.goto(url); await page.waitForFunction(() => window.__LM3D && window.__LM3D.game && window.__LM3D.game.S, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__LM3D.game, LM = globalThis.LM; if (g && g.S && !g.S.glads.length) { ['murmillo', 'thraex'].forEach((st, i) => g.S.glads.push(LM.makeGlad({ id: g.S.nextId++, style: st, lvl: 2 + i }))); g.S.flags.noRecruit = 1; }
  for (const b of document.querySelectorAll('button')) if (/decide later/i.test(b.textContent)) b.click(); });   // first-run recruit sheet
if (opt('eval', '')) await page.evaluate(opt('eval', ''));
const keepUi = a.includes('--ui');
if (!keepUi) await page.addStyleTag({ content: 'body > *:not(canvas):not(script) { display: none !important }' });   // measure the 3D world, not the HUD
let bad = 0;
for (const s of states) {
  await page.evaluate(({ s }) => { const h = window.__LM3D.game.hub; h.setWeather(s.w); h.setHour(s.h); }, { s });
  await page.evaluate((d) => window.__LM3D.advance(d), adv);
  const f = `${out}_${s.w}${s.h == null ? '' : s.h}.png`;
  const buf = await page.screenshot({ path: opt('noshot', null) ? undefined : f, timeout: 240000 });
  const r = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const lum = (x0, y0, x1, y1) => { const d = g.getImageData(x0 | 0, y0 | 0, (x1 - x0) | 0, (y1 - y0) | 0).data, hist = new Uint32Array(256); let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const l = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); hist[l]++; sum += l; n++; }
      const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= p * n) return i; } return 255; };
      return { mean: +(sum / n).toFixed(1), p5: pct(0.05), p95: pct(0.95) }; };
    const w = img.width, h = img.height;
    return { buildings: lum(w * 0.1, h * 0.28, w * 0.9, h * 0.78), frame: lum(0, 0, w, h) };
  }, buf.toString('base64'));
  const key = s.w === 'night' || (s.h != null && (s.h >= 21 || s.h < 5)) ? 'night' : 'day', min = mins[s.w + (s.h ?? '')] ?? mins[s.w] ?? mins[key] ?? (key === 'night' ? 40 : 55);
  const ok = r.buildings.mean >= min; if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${s.w}@${s.h ?? 'auto'} buildings mean ${r.buildings.mean} (min ${min}) p5 ${r.buildings.p5} p95 ${r.buildings.p95} | frame mean ${r.frame.mean}  ${f}`);
}
console.log(errs ? errs + ' page errors' : 'no page errors'); await browser.close(); process.exit(bad ? 1 : 0);
