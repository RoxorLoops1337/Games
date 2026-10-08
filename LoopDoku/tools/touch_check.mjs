// Does a finger land on the square you see? For each skin: tap squares like a phone would (touch events), find where the X
// actually appeared on screen (pixel difference before/after), and compare with where the finger was.
// Runs twice: a plain phone, and a phone with the browser address bar showing (window.innerHeight 80px shorter than the
// CSS viewport, which is what real mobile browsers do and what breaks canvases sized with 100vh).
// Usage: node tools/touch_check.mjs [skin ...]   -> PASS/FAIL per skin and mode, shots/touch-<skin>-<mode>.jpeg
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.LD_BASE || 'http://localhost:5320';
let skins = process.argv.slice(2);
if (!skins.length) skins = ['neon', 'idol', 'comic', 'sticker', 'paper', 'studio', 'riso', 'jelly', 'watercolour', 'pixel'];
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const W = 390, H = 844, BAR = 80;
const INIT = (bar) => {
  // capture the board element and its cellAt
  const ld = {}; let G, B;
  window.__inputs = [];
  Object.defineProperty(ld, 'Game', { configurable: true, enumerable: true, get() { return G; }, set(v) { G = v; } });
  Object.defineProperty(ld, 'bindInput', { configurable: true, enumerable: true, get() { return B; }, set(v) { B = function (el, game, o) { window.__inputs.push({ el, o }); return v(el, game, o); }; } });
  window.LD = ld;
  if (bar) {
    const h = () => document.documentElement.clientHeight - bar;
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: h });
    if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: h });
  }
};
// compare two screenshots (base64 jpeg) inside a page and return the centroid of the strong differences
// where did the screen change because of the tap? noise = pixels that also change with no input (b0 vs b1, dilated);
// only look within a window of 'reach' px around the finger so ambient animation elsewhere cannot pull the result
async function diffCentroid(page, b0, b1, a, fx, fy, reach) {
  return page.evaluate(async ([b0, b1, a, fx, fy, reach]) => {
    const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
    const ims = await Promise.all([load(b0), load(b1), load(a)]);
    const c = document.createElement('canvas'); const Wd = (c.width = ims[0].width), Hd = (c.height = ims[0].height);
    const x = c.getContext('2d');
    const px = ims.map((im) => { x.clearRect(0, 0, Wd, Hd); x.drawImage(im, 0, 0); return x.getImageData(0, 0, Wd, Hd).data; });
    const dif = (A, B, k) => Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]);
    const noise = new Uint8Array(Wd * Hd);
    for (let k = 0; k < Wd * Hd; k++) if (dif(px[0], px[1], k * 4) > 60) noise[k] = 1;
    const noisy = (X, Y) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = X + dx, yy = Y + dy; if (xx >= 0 && yy >= 0 && xx < Wd && yy < Hd && noise[yy * Wd + xx]) return true; } return false; };
    let sx = 0, sy = 0, sw = 0;
    const x0 = Math.max(0, Math.floor(fx - reach)), x1 = Math.min(Wd - 1, Math.ceil(fx + reach)), y0 = Math.max(0, Math.floor(fy - reach)), y1 = Math.min(Hd - 1, Math.ceil(fy + reach));
    for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
      const k = Y * Wd + X, d = dif(px[1], px[2], k * 4);
      if (d > 150 && !noisy(X, Y)) { sx += X * d; sy += Y * d; sw += d; }
    }
    return sw > 2000 ? { x: sx / sw, y: sy / sw, w: sw } : null;
  }, [b0, b1, a, fx, fy, reach]);
}
const results = [];
for (const skin of skins) {
  for (const mode of ['phone', 'urlbar']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await ctx.addInitScript(INIT, mode === 'urlbar' ? BAR : 0);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${base}/${skin}.html`, { waitUntil: 'load' });
    await page.evaluate((sk) => localStorage.setItem('loopdoku_save_v1', JSON.stringify({ unlocked: ['neon', 'idol', sk], skin: sk, supportLast: 999, settings: { sound: false, music: false, assist: false } })), skin);
    await page.goto(`${base}/${skin}.html#title`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate((lv) => { let id = lv; if (lv === 'big') { for (const p of LD.meta.packs()) for (const L of p.levels) if (!id || id === 'big') { if (L.n === 10) id = L.id; } } window.LDSKIN.start(id); }, process.env.LD_LEVEL || 'hard-1');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { try { LD.loop.stop(); } catch (_) { /* */ } });
    // the touch geometry the skin itself uses
    const geo = await page.evaluate(() => {
      const inp = window.__inputs[window.__inputs.length - 1];
      const g = window.LDSKIN.game(), n = g.n, r = inp.el.getBoundingClientRect();
      const acc = {};
      for (let y = r.top + 1; y < r.bottom; y += 2) for (let x = r.left + 1; x < r.right; x += 2) { const i = inp.o.cellAt(x, y); if (i >= 0) { const a = (acc[i] = acc[i] || [0, 0, 0]); a[0] += x; a[1] += y; a[2]++; } }
      const c = {}; for (const k in acc) c[k] = [acc[k][0] / acc[k][2], acc[k][1] / acc[k][2]];
      const sol = new Set(g.p.sol.map((cc, rr) => rr * n + cc));
      return { n, c, cell: r.width / n, sol: [...sol] };
    });
    const n = geo.n, sol = new Set(geo.sol);
    // sample squares: corners, edges and middle (non-solution so a tap makes a plain X)
    const want = [[0, 0], [0, n - 1], [n - 1, 0], [n - 1, n - 1], [Math.floor(n / 2), Math.floor(n / 2)], [0, Math.floor(n / 2)], [n - 1, Math.floor(n / 2)], [Math.floor(n / 2), 0], [Math.floor(n / 2), n - 1]];
    let worst = 0; const misses = [];
    for (const [r0, c0] of want) {
      let i = r0 * n + c0;
      if (sol.has(i)) i = r0 * n + (c0 === 0 ? 1 : c0 - 1);
      const p = geo.c[i];
      if (!p) { misses.push(`cell ${r0},${c0}: no touch area`); continue; }
      const b0 = (await page.screenshot({ type: 'png' })).toString('base64');
      await page.waitForTimeout(700);
      const b1 = (await page.screenshot({ type: 'png' })).toString('base64');
      await page.touchscreen.tap(p[0], p[1]);
      await page.waitForTimeout(700);
      const after = (await page.screenshot({ type: 'png' })).toString('base64');
      const tapped = await page.evaluate((k) => window.LDSKIN.game().cells[k], i);
      const d = await diffCentroid(page, b0, b1, after, p[0], p[1], geo.cell * 1.5);
      if (tapped === 0) misses.push(`cell ${r0},${c0}: the tap did not mark it`);
      else if (!d) misses.push(`cell ${r0},${c0}: nothing changed on screen`);
      else {
        const off = Math.hypot(d.x - p[0], d.y - p[1]) / geo.cell;
        worst = Math.max(worst, off);
        if (off > 0.35) misses.push(`cell ${r0},${c0}: X drawn ${(off).toFixed(2)} squares away from the finger (finger ${p.map(Math.round)}, X ${Math.round(d.x)},${Math.round(d.y)})`);
      }
      await page.touchscreen.tap(p[0], p[1]); // take it back off
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(root, 'shots', `touch-${skin}-${mode}.jpeg`), type: 'jpeg', quality: 70 });
    const ok = !misses.length && !errs.length;
    results.push(ok);
    console.log(`${skin} ${mode}: ${ok ? 'PASS' : 'FAIL'} (worst offset ${worst.toFixed(2)} squares)`);
    for (const m of misses.concat(errs)) console.log('  - ' + m);
    await ctx.close();
  }
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
