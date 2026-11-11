// Real Chromium for the suites that need a page or pixels: withChromium() serves the repo over http on a free port and launches the browser, and
// says so and returns false when Playwright or Chromium is missing (the suite then skips that check; a node-only machine stays green).
// labVisit() opens the animation lab (graftwork/lab/anim.html) on a scene and hands back what it DID: the controls it built, the readout, the strings
// it drew on the canvas, every request it made and every error it raised, so a suite looks at the page and never at the text of its source.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

export const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.html': 'text/html' };

export async function withChromium(fn) {
  let chromium = null; const req = createRequire(import.meta.url);
  for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { chromium = req(m).chromium; break; } catch (e) { /* try the next */ } }
  if (!chromium) { console.log('skip: playwright missing'); return false; }
  const srv = http.createServer((q, r) => {
    const f = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'text/html' }); r.end(d); } });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  let br = null;
  try {
    try { br = await chromium.launch(); } catch (e) { console.log('skip: no chromium'); return false; }
    await fn({ br, base: `http://127.0.0.1:${srv.address().port}` });
    return true;
  } finally { if (br) await br.close(); srv.close(); }
}

// Opens the lab on `query` (for example '?scene=rig&who=marrow') and waits until it has built its controls, drawn 30 frames and `ready` (an expression
// evaluated in the page) is true. The result:
//   read()      what the page shows now: ctl (the text of the controls), readout, plant (the walk readout), banner (the visible error banner or ''), drawn
//               (every string the lab put on the canvas), groups (the labels of the select groups), options (every select: [value, text] of each
//               option), titles (the tooltip of each button, by its text)
//   page        the Playwright page, to click or evaluate in; until(expr) waits for an expression of the page to hold (after a click the lab answers a frame later)
//   errors      page errors and console errors; requests: { url, status } of every request
//   close()     closes the page
export async function labVisit(br, base, query, ready = 'true') {
  const page = await br.newPage({ viewport: { width: 1280, height: 720 } }), errors = [], requests = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => requests.push({ url: r.url().replace(base, ''), status: r.status() }));
  await page.addInitScript(() => {
    window.__drawn = new Set(); const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s) { window.__drawn.add(String(s)); return ft.apply(this, arguments); };
    window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  });
  await page.goto(base + '/graftwork/lab/anim.html' + query);
  await page.waitForFunction(`window.__frames > 30 && document.getElementById('ctl').children.length > 0 && (${ready})`, null, { timeout: 60000 });
  const read = () => page.evaluate(() => {
    const el = (id) => document.getElementById(id), banner = el('banner');
    return {
      ctl: el('ctl').textContent, readout: el('read').innerText, plant: el('plant').innerText,
      banner: getComputedStyle(banner).display === 'none' ? '' : banner.innerText,
      drawn: [...window.__drawn], groups: [...document.querySelectorAll('optgroup')].map((o) => o.label),
      options: [...document.querySelectorAll('select')].map((s) => [...s.options].map((o) => [o.value, o.textContent])),
      titles: Object.fromEntries([...document.querySelectorAll('button[title]')].map((b) => [b.textContent.trim(), b.title])),
    };
  });
  return { page, read, errors, requests, until: (expr) => page.waitForFunction(expr, null, { timeout: 60000 }), close: () => page.close() };
}

// ---------------------------------------------------------------- long hidden limbs (tests/graftwork_rig.test.mjs, tests/graftwork_rig_limbs.test.mjs)
// The cut end of every leg stays inside the body. A thigh (or a whole leg painted in one piece) is drawn ALONE; its END is the band of its pixels
// within LIMB_END units of its far end behind the hip joint, measured along the leg's own axis in its rest frame (so the check needs no field of the
// manifest and reads rigs built before long limbs the same way). Every END pixel must lie on the silhouette of the parts drawn AFTER the thigh, its
// own shin and boot left out: the torso and cloth over a far leg, the cloth (and a near arm or prop that hangs there in every pose) over the near one.
// RIG_COVER_TOL px of tolerance at 2 px per unit; the build tool's --fit measures the same thing (tools/graftwork_rig_build.py). Upper arms are
// measured and printed, not asserted: their painted shoulder caps sit beside the torso, they ARE the shoulders.
// rigLimbEnds(page, src, ids, heads): src = { base } (a folder the page serves, with manifest.json) or { manifest, files: { name: data URL } } (a rig
// built in a test's own folder). -> { id: [{ n, fails, px, worst, at, above, len, one, rise, short }] } for every thigh and upper arm.
const LIMB_END = 4, RIG_COVER_TOL = 1, LIMB_RISE = 0.35, LIMB_RISE_ONE = 0.05;
export function rigLimbEnds(page, src, ids, heads) {
  return page.evaluate(async ({ src, ids, heads, END, TOL }) => {
    const RIG = await import('/graftwork/ui/rig.js'), man = src.manifest || await (await fetch(src.base + 'manifest.json', { cache: 'no-store' })).json(), out = {};
    for (const id of ids) {
      const e = man.rigs[id]; if (!e) continue;
      const img = new Image(); img.src = src.files ? src.files[e.file2x] : src.base + e.file2x; await img.decode();
      const rig = RIG.makeRig(id, e), Z = 2, W = 360, H = 520, X0 = 40, Y0 = 0;
      const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d', { willReadFrequently: true }); };
      const gc = mk(), gl = mk(), order = e.parts.map((p) => p.n), at = (n) => order.indexOf(n), boneOf = Object.fromEntries(e.parts.map((p) => [p.n, p.bone]));
      const limbs = [];
      for (const n of ['legL_up', 'legR_up', 'armL_up', 'armR_up']) {
        const bone = e.bones.find((b) => b.n === n), part = rig.parts.find((p) => p.n === n); if (!bone || bone.empty || !part) continue;
        const one = (e.rigid || []).includes(n.slice(0, 4)), child = e.bones.find((b) => b.n === (n.startsWith('leg') ? (one ? 'foot' : 'leg') : 'arm') + n[3] + (n.startsWith('leg') && one ? '' : '_lo'));
        const ax = child.x - bone.x, ay = child.y - bone.y, al = Math.hypot(ax, ay) || 1;
        const chain = [n.slice(0, 4) + '_lo', (n.startsWith('leg') ? 'foot' : 'hand') + n[3]]; let cover = order.filter((q) => at(q) > at(n) && !chain.includes(boneOf[q])); if (!cover.length) cover = ['torso'];
        limbs.push({ n, part, ux: ax / al, uy: ay / al, len: al, one, cover: new Set(cover), fails: 0, px: 0, worst: 0, at: '', tmin: 0 });
      }
      const place = (g) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); const m = RIG.rigPlace(rig, (rig.foot[0] - X0) * Z, (rig.foot[1] - Y0) * Z, Z, false); g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); };
      const pose = (st, label) => {
        RIG.poseRig(rig, st);
        const covers = new Map();
        for (const L of limbs) {
          const key = [...L.cover].join(','); let cv = covers.get(key);
          if (!cv) { place(gc); RIG.drawRigged(gc, rig, img, { contact: false, alpha: (p) => (L.cover.has(p.n) ? 1 : 0) }); cv = gc.getImageData(0, 0, W, H).data; covers.set(key, cv); }
          place(gl); RIG.drawRigged(gl, rig, img, { contact: false, alpha: (p) => (p === L.part ? 1 : 0) });
          const d = gl.getImageData(0, 0, W, H).data, pm = L.part.m, det = pm[0] * pm[3] - pm[1] * pm[2], pts = []; let tmin = 1e9;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] <= 100) continue;
            const dx = (x + 0.5) / Z + X0 - pm[4], dy = (y + 0.5) / Z + Y0 - pm[5];
            const lx = (pm[3] * dx - pm[2] * dy) / det, ly = (pm[0] * dy - pm[1] * dx) / det, tt = lx * L.ux + ly * L.uy; // along the limb in its rest frame (0 = the joint)
            pts.push(x, y, tt); if (tt < tmin) tmin = tt;
          }
          let bad = 0; L.tmin = tmin;
          for (let i = 0; i < pts.length; i += 3) {
            if (pts[i + 2] > tmin + END) continue;
            const x = pts[i], y = pts[i + 1]; let ok = false;
            for (let yy = Math.max(0, y - TOL); yy <= Math.min(H - 1, y + TOL) && !ok; yy++) for (let xx = Math.max(0, x - TOL); xx <= Math.min(W - 1, x + TOL); xx++) if (cv[(yy * W + xx) * 4 + 3] > 100) { ok = true; break; }
            if (!ok) bad++;
          }
          if (bad) { L.fails++; L.px += bad; if (bad > L.worst) { L.worst = bad; L.at = label; } }
        }
      };
      for (const [ux, uy] of heads) for (let i = 0; i < 32; i++) pose({ ph: i / 16, w: 1, t: 0, ux, uy }, 'walk ' + (i / 16).toFixed(2) + ' heading ' + ux + ',' + uy);
      for (let i = 0; i < 8; i++) pose({ ph: 0, w: 0, t: i * 0.6, ux: 1, uy: 0 }, 'idle ' + i);
      const f0 = limbs.map((L) => L.fails); pose({ ph: 0, w: 0, t: 0, ux: 1, uy: 0, calm: true }, 'rest'); limbs.forEach((L, i) => { L.fails = f0[i]; }); // the rest pose: how far each tube reaches above its joint
      out[id] = limbs.map((L) => ({ n: L.n, fails: L.fails, px: L.px, worst: L.worst, at: L.at, above: -L.tmin, len: L.len, one: L.one }));
    }
    return out;
  }, { src, ids, heads, END: LIMB_END, TOL: RIG_COVER_TOL }).then((res) => {
    for (const ls of Object.values(res)) for (const L of ls) { L.rise = (L.one ? LIMB_RISE_ONE : LIMB_RISE) * L.len; L.short = L.n.startsWith('leg') && L.above < L.rise - 0.75; }
    return res;
  });
}
