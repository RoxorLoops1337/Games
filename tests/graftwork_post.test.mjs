// Post-processing layer: API surface under node with fake canvases, plus a real-Chromium check (skipped with a note if unavailable).
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeApp, frames, installDom } from './graftwork_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8301;

// ---------- node part: every method is safe with no DOM / no WebGL / reduced motion / quality off ----------
function poke(post) {
  post.setQuality('high'); post.setQuality('low'); post.setQuality('off'); post.setQuality('bogus');
  for (const n of ['ward', 'market', 'theatre', 'boss', 'title', 'neutral', 'nope']) post.setGrade(n, 100);
  post.setBloom(0.6); post.setBloom(0.6, 0.9); post.setBloom(NaN); post.setBloom('x');
  post.shockwave(640, 360, 0.8, 600); for (let i = 0; i < 9; i++) post.shockwave(i * 100, 50, 1, 300);
  post.aberration(2.5, 120); post.aberration(-1, 0); post.flash('#fff', 0.5); post.flash([1, 0, 0], 0.3); post.flash('garbage', 0.2); post.vignette(0.3, 200);
  post.setMaskRects([[0, 0, 1280, 56], [140, 540, 1000, 180]]); post.setMaskRects(null); post.setMaskRects([]);
  post.setMaskRects(Array.from({ length: 12 }, (_, i) => [i, i, 10, 10]));
  post.update(0.016); post.update(5); post.render();
}
{
  const app = await makeApp({ run: null, meta: { settings: {} } });
  const { installPost } = await import('../graftwork/ui/post.js');
  installPost(app);
  assert.ok(app.post, 'app.post exists');
  for (const k of ['setQuality', 'setGrade', 'setBloom', 'shockwave', 'aberration', 'flash', 'vignette', 'setMaskRects', 'update', 'render']) assert.equal(typeof app.post[k], 'function', k);
  assert.equal(app.post.on, false, 'no DOM: off');
  poke(app.post);
  app.shared.meta.settings.reducedMotion = true; poke(app.post);
  app.shared.meta.settings.quality = 'off'; poke(app.post);
  frames(app, 5);
}
{ // a DOM-like canvas whose getContext('webgl2') returns null: quality off silently, no throw, no canvas inserted
  installDom();
  const inserted = [];
  globalThis.document = { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }), addEventListener() {} };
  const { createApp } = await import('../graftwork/ui/core.js');
  const { fakeCtx } = await import('./graftwork_lib.mjs');
  const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, parentNode: { insertBefore: (n) => inserted.push(n) }, nextSibling: null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
  const app = createApp(canvas, { shared: { meta: { settings: { quality: 'high' } } } }); app.resize();
  const { installPost } = await import('../graftwork/ui/post.js');
  installPost(app);
  assert.equal(app.post.on, false); assert.equal(inserted.length, 0);
  poke(app.post); frames(app, 5);
  // a broken GL (proxy that never compiles) must also fall back to off
  globalThis.document = { createElement: () => ({ style: {}, getContext: () => fakeCtx(), addEventListener() {}, setAttribute() {} }), addEventListener() {} };
  const app2 = createApp(canvas, { shared: { meta: { settings: { quality: 'high' } } } });
  installPost(app2); assert.equal(app2.post.on, false); poke(app2.post); frames(app2, 5);
}
console.log('post: node API checks passed');

// ---------- browser part ----------
const req = createRequire(import.meta.url);
let chromium = null;
try { chromium = req('playwright').chromium; } catch (e) { console.log('post: playwright not available, skipping browser checks'); }
if (chromium) {
  const PAGE = `<!doctype html><html><body style="margin:0;background:#000;overflow:hidden"><canvas id="cv" style="position:absolute"></canvas>
<script type="module">
import { createApp } from '/graftwork/ui/core.js';
import { installPost } from '/graftwork/ui/post.js';
const cv = document.getElementById('cv');
const app = createApp(cv, { shared: { meta: { settings: { quality: 'high' } }, run: null } });
installPost(app);
app.register('t', { draw(a) { const c = a.ctx; c.fillStyle = '#1A1614'; c.fillRect(0, 0, 1280, 720);
  for (let x = 0; x < 1280; x += 40) { c.fillStyle = '#807060'; c.fillRect(x, 0, 6, 720); }
  const g = c.createRadialGradient(900, 200, 0, 900, 200, 60); g.addColorStop(0, '#fff'); g.addColorStop(.35, '#ffe9a0'); g.addColorStop(1, 'rgba(242,193,78,0)'); c.fillStyle = g; c.fillRect(800, 100, 200, 200); c.fillStyle = '#fff'; c.beginPath(); c.arc(900, 200, 20, 0, 7); c.fill();
  a.text('Crisp text', 100, 100, { size: 40 }); } });
app.go('t'); app.resize();
let downs = 0; cv.addEventListener('pointerdown', () => downs++);
const snaps = {};
function glCanvas() { return document.querySelectorAll('canvas')[1]; }
window.T = {
  app, downs: () => downs,
  glInfo() { const g = glCanvas(); if (!g) return null; const r = g.getBoundingClientRect(), r0 = cv.getBoundingClientRect();
    return { pe: g.style.pointerEvents, same: r.left === r0.left && r.top === r0.top && r.width === r0.width && r.height === r0.height, top: document.elementFromPoint(640, 360) === cv, on: app.post.on }; },
  frame(name) { app.tick(1 / 60); const g = glCanvas(); const s = document.createElement('canvas'); s.width = g.width; s.height = g.height; const c = s.getContext('2d'); c.drawImage(g, 0, 0); snaps[name] = c.getImageData(0, 0, s.width, s.height); },
  plain(name) { snaps[name] = app.ctx.getImageData(0, 0, cv.width, cv.height); },
  // mean abs rgb diff and mean luma of b minus a over a logical rect
  cmp(a, b, x0, y0, x1, y1) { const A = snaps[a], B = snaps[b], w = A.width; let d = 0, l = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; d += Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]); l += (B.data[i] + B.data[i + 1] + B.data[i + 2]) - (A.data[i] + A.data[i + 1] + A.data[i + 2]); n++; }
    return { diff: d / n / 3, lumaGain: l / n / 3 }; },
};
window.__ready = true;
</script></body></html>`;
  const server = http.createServer(async (rq, rs) => {
    try {
      if (rq.url.startsWith('/__post_test.html')) { rs.setHeader('content-type', 'text/html'); return rs.end(PAGE); }
      const p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
      if (!p.startsWith(ROOT)) { rs.statusCode = 403; return rs.end(); }
      const buf = await readFile(p); rs.setHeader('content-type', p.endsWith('.js') || p.endsWith('.mjs') ? 'text/javascript' : 'text/plain'); rs.end(buf);
    } catch (e) { rs.statusCode = 404; rs.end('nf'); }
  });
  await new Promise((r) => server.listen(PORT, r));
  let browser = null;
  try {
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (e) { console.log('post: chromium unavailable (' + String(e.message).split('\n')[0] + '), skipping browser checks'); }
  if (browser) {
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://localhost:${PORT}/__post_test.html`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
      const info = await page.evaluate(() => { window.T.app.tick(1 / 60); return window.T.glInfo(); });
      if (!info || !info.on) { console.log('post: WebGL2 unavailable in this chromium, skipping rendering checks'); }
      else {
        assert.equal(info.pe, 'none', 'GL canvas must not take pointer events');
        assert.ok(info.same, 'GL canvas has the same CSS box as the 2D canvas');
        assert.ok(info.top, 'elementFromPoint hits the 2D canvas');
        // 1. processed differs from plain; bloom lifts the area around the lamp
        const r1 = await page.evaluate(() => { const T = window.T; T.app.post.setGrade('neutral', 1); T.app.post.update(1); T.app.post.setBloom(0); T.frame('nb'); T.app.post.setBloom(0.8); T.plain('plain'); T.frame('hi');
          return { lamp: T.cmp('nb', 'hi', 840, 140, 960, 260), all: T.cmp('plain', 'hi', 0, 0, 1280, 720), text: T.cmp('plain', 'hi', 100, 100, 300, 150) }; });
        assert.ok(r1.all.diff > 0.2, 'processed canvas differs from plain: ' + JSON.stringify(r1.all));
        assert.ok(r1.lamp.lumaGain > 2, 'bloom brightens the lamp neighbourhood: ' + JSON.stringify(r1.lamp));
        assert.ok(r1.text.diff < 22, 'text stays crisp (no bloom smear): ' + JSON.stringify(r1.text));
        // 2. mask rect: warp is zeroed inside it, present outside it
        const r2 = await page.evaluate(() => { const T = window.T, p = T.app.post; p.setQuality('low'); p.setBloom(0); p.setGrade('neutral', 1); p.update(1); T.frame('A');
          p.shockwave(640, 360, 1, 700); p.setMaskRects([[0, 0, 420, 720]]); p.update(0.2); T.frame('B');
          return { masked: T.cmp('A', 'B', 0, 0, 400, 720), open: T.cmp('A', 'B', 820, 0, 1100, 720) }; });
        assert.ok(r2.masked.diff < 0.5, 'masked region unwarped: ' + JSON.stringify(r2));
        assert.ok(r2.open.diff > 2, 'unmasked region warped: ' + JSON.stringify(r2));
        // 3. quality off removes the GL canvas; 2D canvas stays readable; back to high restores
        const r3 = await page.evaluate(() => { const p = window.T.app.post; p.setQuality('off'); window.T.app.tick(1 / 60); const off = document.querySelectorAll('canvas').length; p.setQuality('high'); window.T.app.tick(1 / 60); return { off, on: document.querySelectorAll('canvas').length, pOn: p.on }; });
        assert.equal(r3.off, 1); assert.equal(r3.on, 2); assert.equal(r3.pOn, true);
        // 4. pointer events still reach the 2D canvas
        await page.mouse.click(640, 360);
        assert.ok((await page.evaluate(() => window.T.downs())) >= 1, 'pointerdown reached the 2D canvas');
        // 5. cost of a frame (informational)
        const cost = await page.evaluate(() => { const T = window.T, p = T.app.post; p.setGrade('neutral', 1); for (let i = 0; i < 90; i++) T.app.tick(1 / 60); return p.stats.ms; });
        console.log('post: smoothed JS cost per frame ' + cost.toFixed(2) + ' ms (swiftshader)');
        assert.equal(errors.length, 0, 'page errors: ' + errors.join('; '));
        console.log('post: browser checks passed');
      }
    } finally { await browser.close(); }
  }
  server.close();
}
console.log('graftwork_post: ok');
process.exit(0);
