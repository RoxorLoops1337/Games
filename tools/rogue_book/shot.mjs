#!/usr/bin/env node
// Screenshot and QA driver for Inkwoven (headless Chromium through playwright-core).
//
//   node tools/rogue_book/shot.mjs --sheet fx --out /tmp/fx.png                       one gallery sheet, PNG is exactly w x h (1600x900)
//   node tools/rogue_book/shot.mjs --url "rogue_book/gallery.html?sheet=heroes&w=1200&h=700&scale=2" --out h.png
//   node tools/rogue_book/shot.mjs --sheet fx --param frames=6 --param t0=0 --param t1=1 --out strip.png          animated sheet as a contact strip
//   node tools/rogue_book/shot.mjs --url rogue_book/index.html --js "GAME.debug.open('combat',{enemies:['kappa']})" --frames 75 --out c.png
//   node tools/rogue_book/shot.mjs --url rogue_book/index.html --viewports 1280x720,390x844,844x390 --out /tmp/title.png     writes title_1280x720.png ...
//   node tools/rogue_book/shot.mjs --url rogue_book/index.html --steps steps.json --frames 30
//   node tools/rogue_book/shot.mjs --diff before.png after.png [--threshold 4] [--diff-out d.png] [--max-diff 0.5]
//
// TARGET
//   --url U          repo-relative path, absolute path, or http(s)/file URL (default rogue_book/index.html). Query kept.
//   --sheet a,b      shorthand for rogue_book/gallery.html?sheet=a,b (several sheets stack)
//   --param k=v      extra query parameter (repeatable). Gallery pages get nav=0&label=0 so the PNG is exactly the sheet.
//   --no-debug       the game page gets ?debug=1 by default (mirrors GAME, RUN, COMBAT on window; GAME.debug always exists)
//   --root DIR       what relative --url paths are relative to (default: this repository)
// VIEWPORT AND CAPTURE
//   --w --h          viewport (default 1280x720; a gallery page uses its own w x h times scale)
//   --viewports L    e.g. 1280x720,390x844,844x390: the whole flow runs once per viewport in a fresh page, output files get _WxH
//   --mobile         390x844 with touch and mobile layout     --touch / --no-touch   force touch emulation (default: on for a game viewport with min(w,h) <= 500, never for the gallery)
//   --dpr N          device scale factor (default 1; --scale is the old alias)
//   --out F          screenshot at the end       --sel CSS   only that element     --full   whole page     --clip x,y,w,h     --transparent
//   --reduce-motion  emulate prefers-reduced-motion
// TIMING (deterministic)
//   --frames N       after load and after every step, advance N fixed steps (--step MS, default 16) through window.__advance(ms, step)
//                    (the gallery implements it) or GAME.debug.tick(ms, step) (the game); the game loop is frozen first. With neither
//                    hook it falls back to a wall-clock wait of N*step ms and says so once. Screenshots are then identical every run.
//   --fake-clock     Playwright's fake clock (Date, timers, rAF) instead: --frames runs page.clock.runFor
//   --wait MS        real wait after load (default 600; 100 for the gallery; 0 with --frames)       --timeout MS   readiness timeout (15000)
// SCRIPTING
//   --js CODE        run in the page after it is ready (a returned promise is awaited, the result printed)
//   --init CODE      run before any page script (addInitScript)         --store JSON   seed localStorage before the page loads
//   --steps F.json   a list of steps, each an object (keys are run in this order):
//                      viewport "844x390"  goto "rogue_book/x.html"  js "code"  click "css or text=Label"  hover "css"  mouse [x,y]  tap [x,y]
//                      drag [x0,y0,x1,y1] | {from, to, steps, hold}   (a point is [x,y] in STAGE px, or a css selector, or {sel,dx,dy})
//                      key "Escape" | ["a","b"]   keydown "Shift"  keyup "Shift"   text "hello" (+ into "css", delay ms)   wheel [dx,dy]
//                      waitFor "css" | "js:expr"   wait ms   advance ms   frames n   expect "js expr that must be truthy"   log "msg"
//                      shot "out.png" (+ sel, full, clip)
//                    Stage px are the 1280x720 game stage, mapped through #stage's real on-screen box, so they work at any viewport.
//                    After a step the tool settles: the step's own wait/advance/frames, else --frames, else 300 ms.
// DIFF
//   --diff A B       compare two PNGs (no page): prints the differing-pixel percentage; exit 1 when it is above --max-diff (default 0: any difference)
//   --baseline P     compare the capture (--out) with a baseline PNG (same exit rule)     --threshold N  per-channel tolerance (default 0)
//   --diff-out F     write a highlight image of the differing pixels                       --max-diff PCT   percentage that is still acceptable
// OUTPUT
//   --logs           print every console message      --strict   missing resources (404s) are errors      --no-fail   always exit 0      --list-sheets
// EXIT CODE  0 clean, 1 the page threw / a sheet failed / the game reported an error / a diff exceeded --max-diff, 2 the tool could not run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const BOOL = new Set(['mobile', 'touch', 'no-touch', 'debug', 'no-debug', 'full', 'strict', 'no-fail', 'logs', 'fake-clock', 'reduce-motion', 'transparent', 'list-sheets', 'help']);
const VALUE = new Set(['url', 'sheet', 'param', 'root', 'w', 'h', 'viewports', 'dpr', 'scale', 'out', 'sel', 'clip', 'frames', 'step', 'wait', 'timeout', 'js', 'init', 'store', 'steps', 'diff', 'baseline', 'threshold', 'diff-out', 'max-diff']);
const MULTI = new Set(['param']);

function usageError(msg) { console.error('shot: ' + msg + '\n(see the header of tools/rogue_book/shot.mjs, or --help)'); process.exit(2); }
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    let k = argv[i], v;
    if (!k.startsWith('--')) usageError(`unexpected argument "${k}"`);
    k = k.slice(2);
    const eq = k.indexOf('=');
    if (eq > 0) { v = k.slice(eq + 1); k = k.slice(0, eq); }
    if (!BOOL.has(k) && !VALUE.has(k)) usageError(`unknown option --${k}`);
    if (BOOL.has(k)) { a[k] = true; continue; }
    if (k === 'diff') { a.diff = [argv[++i], argv[++i]]; if (!a.diff[0] || !a.diff[1] || a.diff[1].startsWith('--')) usageError('--diff needs two PNG paths'); continue; }
    if (v === undefined) v = argv[++i];
    if (v === undefined) usageError(`--${k} needs a value`);
    if (MULTI.has(k)) (a[k] = a[k] || []).push(v); else a[k] = v;
  }
  if (a.scale !== undefined && a.dpr === undefined) a.dpr = a.scale;
  return a;
}
const args = parseArgs(process.argv.slice(2));
if (args.help) { const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1); const end = lines.findIndex((l) => !l.startsWith('//')); console.log(lines.slice(0, end).map((l) => l.slice(3)).join('\n')); process.exit(0); }

let chromium;
try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { usageError('playwright-core is not installed (npm install): ' + e.message); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const LAUNCH = { executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] };

// ---------------------------------------------------------------- diff (in the browser, no PNG library needed)
async function diffPngs(browser, aPath, bPath, { threshold = 0, outPath } = {}) {
  const page = await browser.newPage();
  try {
    const res = await page.evaluate(async ({ a, b, thr, wantImage }) => {
      const load = async (b64) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
        const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(bmp, 0, 0);
        return { w: bmp.width, h: bmp.height, d: x.getImageData(0, 0, bmp.width, bmp.height).data };
      };
      const A = await load(a), B = await load(b);
      const W = Math.max(A.w, B.w), H = Math.max(A.h, B.h);
      const out = new Uint8ClampedArray(W * H * 4);
      let diff = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const inA = x < A.w && y < A.h, inB = x < B.w && y < B.h;
        let bad = !(inA && inB);
        if (!bad) {
          const i = (y * A.w + x) * 4, j = (y * B.w + x) * 4;
          for (let k = 0; k < 4; k++) if (Math.abs(A.d[i + k] - B.d[j + k]) > thr) { bad = true; break; }
          if (!bad) { const g = Math.round((A.d[i] + A.d[i + 1] + A.d[i + 2]) / 3 * 0.35); out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255; continue; }
        }
        diff++; out[o] = 255; out[o + 1] = 40; out[o + 2] = 90; out[o + 3] = 255;
      }
      let image = null;
      if (wantImage) {
        const c = new OffscreenCanvas(W, H); c.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
        const blob = await c.convertToBlob({ type: 'image/png' }), buf = new Uint8Array(await blob.arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
        image = btoa(s);
      }
      return { W, H, diff, total: W * H, sizeA: [A.w, A.h], sizeB: [B.w, B.h], image };
    }, { a: fs.readFileSync(aPath).toString('base64'), b: fs.readFileSync(bPath).toString('base64'), thr: +threshold, wantImage: !!outPath });
    if (outPath && res.image) { fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true }); fs.writeFileSync(outPath, Buffer.from(res.image, 'base64')); }
    return { ...res, pct: res.total ? (res.diff / res.total) * 100 : 0, sizeMismatch: res.sizeA[0] !== res.sizeB[0] || res.sizeA[1] !== res.sizeB[1] };
  } finally { await page.close(); }
}
function reportDiff(aPath, bPath, r, threshold) {
  console.log(`diff ${aPath} vs ${bPath}: ${r.pct.toFixed(4)}% (${r.diff} of ${r.total} pixels differ, tolerance ${threshold})${r.sizeMismatch ? `  SIZE MISMATCH ${r.sizeA.join('x')} vs ${r.sizeB.join('x')}` : ''}`);
}

// ---------------------------------------------------------------- urls and viewports
const rootDir = path.resolve(args.root || REPO);
function toUrl(u) {
  if (/^(https?|file):/i.test(u)) return u;
  const [p, q] = u.split('?');
  let file = path.isAbsolute(p) ? p : path.join(rootDir, p);
  if (!fs.existsSync(file) && fs.existsSync(path.resolve(p))) file = path.resolve(p);
  return pathToFileURL(file).href + (q ? '?' + q : '');
}
let target = args.sheet ? 'rogue_book/gallery.html?sheet=' + encodeURIComponent(args.sheet).replace(/%2C/g, ',') : (args.url || 'rogue_book/index.html');
for (const kv of args.param || []) target += (target.includes('?') ? '&' : '?') + kv;
const isGallery = /gallery\.html/.test(target);
const pathPart = target.split('?')[0].split('#')[0];
const isGame = !isGallery && (/(^|[\\/])index\.html$/.test(pathPart) || /[\\/]$/.test(pathPart));
const query = new URLSearchParams(target.split('?')[1] || '');
if (isGallery) { if (!query.has('nav')) target += (target.includes('?') ? '&' : '?') + 'nav=0'; if (!query.has('label')) target += '&label=0'; }
else if (isGame && !args['no-debug'] && !query.has('debug')) target += (target.includes('?') ? '&' : '?') + 'debug=1';
const finalUrl = toUrl(target);
const gq = new URLSearchParams(finalUrl.split('?')[1] || '');
const sheetCount = isGallery ? String(gq.get('sheet') || '').split(',').filter(Boolean).length : 0;

function parseVp(s) { const m = /^(\d+)x(\d+)$/.exec(String(s).trim()); if (!m) usageError(`bad viewport "${s}" (want WIDTHxHEIGHT)`); return { w: +m[1], h: +m[2] }; }
let viewports;
if (args.viewports) viewports = String(args.viewports).split(',').map(parseVp);
else if (args.mobile) viewports = [{ w: 390, h: 844 }];
else {
  const gs = +(gq.get('scale') || 1);
  viewports = [{ w: +(args.w || (isGallery ? Math.round((+gq.get('w') || 1600) * gs) : 1280)), h: +(args.h || (isGallery ? Math.round((+gq.get('h') || 900) * gs) : 720)) }];
}
const multi = !!args.viewports;
const suffixed = (p, vp) => (multi ? p.replace(/(\.[a-z0-9]+)?$/i, `_${vp.w}x${vp.h}$1`) : p);

// ---------------------------------------------------------------- one run per viewport
const STEP_TIMEOUT = 8000, READY_TIMEOUT = +(args.timeout || 15000);
let STEPS = [];
if (args.steps) {
  try { STEPS = JSON.parse(fs.readFileSync(args.steps, 'utf8')); } catch (e) { usageError(`--steps ${args.steps}: ${e.message}`); }
  if (!Array.isArray(STEPS)) usageError('--steps must be a JSON array of step objects');
}
const frameStep = +(args.step || 16);
const globalFrames = args.frames !== undefined ? +args.frames : null;
let anyProblem = false, lastShot = null;

async function runViewport(browser, vp) {
  const tag = `${vp.w}x${vp.h}`;
  const wantsTap = STEPS.some((st) => st && st.tap);
  const phone = isGame && Math.min(vp.w, vp.h) <= 500;                        // a phone-sized game viewport is a phone: touch and mobile layout rules
  const touch = args['no-touch'] ? false : !!(args.touch || args.mobile || wantsTap || phone);
  const mobile = args['no-touch'] ? false : !!(args.mobile || phone);
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: +(args.dpr || 1), hasTouch: touch, isMobile: mobile, colorScheme: 'dark', reducedMotion: args['reduce-motion'] ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errs = [], missing = new Set(), seenMsg = new Set();
  const norm = (t) => String(t).replace(/^Uncaught\s+/, '').replace(/^[A-Za-z]*Error:\s*/, '').trim();
  const add = (kind, text, stack) => { const key = norm(text); if (seenMsg.has(key)) return; seenMsg.add(key); errs.push({ kind, text, stack }); };
  page.on('pageerror', (e) => add('pageerror', String(e.message || e), String(e.stack || '').split('\n').slice(1, 4).map((l) => l.trim()).join(' | ')));
  page.on('requestfailed', (r) => { missing.add(r.url().replace(/^file:\/\//, '').split('/').slice(-2).join('/')); });
  page.on('response', (r) => { if (r.status() >= 400) missing.add(r.url().split('/').slice(-2).join('/') + ' (' + r.status() + ')'); });
  page.on('console', (m) => {
    const text = m.text();
    if (/Failed to load resource/.test(text)) { if (args.logs) console.log(`console.${m.type()} ${text}`); return; }
    if (args.logs) console.log(`console.${m.type()} ${text}`);
    if (m.type() === 'error') add('console.error', text);
  });
  if (args.init) await page.addInitScript(args.init);
  if (args.store) { let kv; try { kv = JSON.parse(args.store); } catch (e) { usageError('--store must be JSON'); } await page.addInitScript((o) => { try { for (const k of Object.keys(o)) localStorage.setItem(k, typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k])); } catch (e) { /* storage blocked */ } }, kv); }
  if (args['fake-clock']) await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });

  // deterministic time: __advance (gallery), GAME.debug.tick (game), fake clock, else a real wait
  let hook = null, warned = false, frozen = false;
  const detect = async () => { hook = await page.evaluate(() => (typeof window.__advance === 'function' ? 'advance' : typeof GAME !== 'undefined' && GAME.debug && typeof GAME.debug.tick === 'function' ? 'tick' : null)).catch(() => null); };
  const advance = async (ms) => {
    if (ms <= 0) return;
    if (args['fake-clock']) { await page.clock.runFor(ms); return; }
    if (!hook) await detect();
    if (hook === 'tick' && !frozen) { frozen = true; await page.evaluate(() => { if (typeof GAME.debug.freeze === 'function') GAME.debug.freeze(true); }).catch(() => {}); }
    if (hook) { await page.evaluate(({ ms: m, st, h }) => (h === 'advance' ? window.__advance(m, st) : GAME.debug.tick(m, st)), { ms, st: frameStep, h: hook }); return; }
    if (!warned) { warned = true; console.log('note: no window.__advance and no GAME.debug.tick in this page, falling back to a wall-clock wait (frames are not deterministic)'); }
    await page.waitForTimeout(ms);
  };
  const settle = async (spec, dflt) => {
    if (spec && spec.advance !== undefined) return advance(+spec.advance);
    if (spec && spec.frames !== undefined) return advance(+spec.frames * frameStep);
    if (spec && spec.wait !== undefined) return page.waitForTimeout(+spec.wait);
    if (globalFrames !== null) return advance(globalFrames * frameStep);
    return page.waitForTimeout(dflt);
  };
  const stagePt = async (x, y) => {
    const r = await page.evaluate(() => { const el = document.getElementById('stage') || document.getElementById('view') || document.querySelector('canvas'); if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width }; });
    if (!r) throw new Error('no #stage, #view or canvas on the page: stage coordinates need one');
    const k = r.w / 1280;
    return { x: r.l + x * k, y: r.t + y * k };
  };
  const pointOf = async (p) => {
    if (Array.isArray(p)) return stagePt(p[0], p[1]);
    if (typeof p === 'string' || (p && p.sel)) {
      const sel = typeof p === 'string' ? p : p.sel, box = await page.locator(sel).first().boundingBox({ timeout: STEP_TIMEOUT });
      if (!box) throw new Error(`"${sel}" has no box`);
      return { x: box.x + box.width / 2 + ((p && p.dx) || 0), y: box.y + box.height / 2 + ((p && p.dy) || 0) };
    }
    throw new Error('a point is [x,y] in stage px, a css selector or {sel,dx,dy}');
  };
  const shot = async (p, o = {}) => {
    const file = suffixed(path.resolve(p), vp);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const clip = o.clip ? (() => { const [x, y, w, h] = (Array.isArray(o.clip) ? o.clip : String(o.clip).split(',')).map(Number); return { x, y, width: w, height: h }; })() : undefined;
    const sel = o.sel || args.sel;
    if (sel) await page.locator(sel).first().screenshot({ path: file, omitBackground: !!args.transparent, timeout: STEP_TIMEOUT });
    else await page.screenshot({ path: file, fullPage: !!(o.full || args.full || sheetCount > 1) && !clip, clip, omitBackground: !!args.transparent });
    lastShot = file;
    console.log('shot ' + file);
  };
  const evalJs = async (code, label) => {
    try {
      const r = await page.evaluate(code);
      if (r !== undefined) console.log((label || 'js') + ' -> ' + JSON.stringify(r));
    } catch (e) { add('js', String(e.message || e).split('\n')[0]); }
  };

  const collect = async () => {
    const inPage = await page.evaluate(() => ({
      sheet: window.__sheetErrors && window.__sheetErrors.length ? window.__sheetErrors.map((e) => `sheet ${e.sheet}: ${e.message}`) : window.__sheetError ? [String(window.__sheetError).split('\n')[0]] : [],
      game: (window.__errors || []).map((e) => (e && e.screen ? `${e.screen}: ${e.message}` : e && e.file ? `${e.message} (${e.file}:${e.line})` : e && e.message ? e.message : JSON.stringify(e))),
      missing: window.__missing || [],
      booted: window.__booted === true, ready: window.__sheetReady === true,
    })).catch(() => ({ sheet: [], game: [], missing: [], booted: false, ready: false }));
    inPage.sheet.forEach((m) => add('sheet', m));
    inPage.game.forEach((m) => { if (m !== 'Script error.' && !/^Script error\. \(/.test(m)) add('game', m); });    // file: pages mask script errors as 'Script error.', pageerror has the real text
    inPage.missing.forEach((m) => missing.add(m));
    return inPage;
  };

  // ---- load and wait until ready
  try { await page.goto(finalUrl, { waitUntil: 'load', timeout: READY_TIMEOUT }); }
  catch (e) { add('navigation', `could not open ${finalUrl}: ${String(e.message).split('\n')[0]}`); }
  await detect();
  const readyExpr = isGallery ? 'window.__sheetReady === true' : isGame ? 'window.__booted === true' : 'document.readyState === "complete"';
  let ready = false;
  for (let t = 0; t <= READY_TIMEOUT; t += 100) {
    ready = await page.evaluate(readyExpr).catch(() => false);
    if (ready) break;
    if (args['fake-clock']) await page.clock.runFor(100); else await page.waitForTimeout(100);
  }
  if (!ready) { const st = await collect(); add('not-ready', `${isGallery ? 'window.__sheetReady' : isGame ? 'window.__booted' : 'document.readyState'} was still not true after ${READY_TIMEOUT} ms` + (st.missing.length ? `; not found: ${st.missing.slice(0, 5).join(', ')}` : '') + (isGame ? (await page.evaluate(() => { const b = document.getElementById('boot'); return b ? '; #boot says: ' + b.textContent.trim().slice(0, 160) : ''; }).catch(() => '')) : '')); }
  if (args['list-sheets']) await evalJs('typeof sheetNames === "function" ? sheetNames() : []', 'sheets');
  await settle(null, globalFrames !== null ? 0 : (args.wait !== undefined ? +args.wait : isGallery ? 100 : 600));
  if (args.js) { await evalJs(args.js, 'js'); await settle(null, args.wait !== undefined ? +args.wait : isGallery ? 100 : 600); }

  // ---- steps
  let n = 0;
  for (const s of STEPS) {
    n++;
    const where = `step ${n}`;
    try {
      if (s.viewport) { const v = parseVp(s.viewport); await page.setViewportSize({ width: v.w, height: v.h }); }
      if (s.goto) { await page.goto(toUrl(s.goto), { waitUntil: 'load', timeout: READY_TIMEOUT }); hook = null; await detect(); }
      if (s.js || s.eval) await evalJs(s.js || s.eval, where + ' js');
      if (s.click) { const loc = page.locator(s.click).nth(s.nth || 0); await (s.dblclick ? loc.dblclick({ timeout: STEP_TIMEOUT }) : loc.click({ timeout: STEP_TIMEOUT })); }
      if (s.hover) await page.locator(s.hover).first().hover({ timeout: STEP_TIMEOUT });
      if (s.mouse) { const p = await stagePt(s.mouse[0], s.mouse[1]); await page.mouse.click(p.x, p.y); }
      if (s.tap) { const p = await stagePt(s.tap[0], s.tap[1]); await page.touchscreen.tap(p.x, p.y); }
      if (s.drag) {
        const d = Array.isArray(s.drag) ? { from: [s.drag[0], s.drag[1]], to: [s.drag[2], s.drag[3]] } : s.drag;
        const a = await pointOf(d.from), b = await pointOf(d.to);
        await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: d.steps || 12 });
        if (d.hold) await page.waitForTimeout(d.hold);
        await page.mouse.up();
      }
      if (s.key) for (const k of [].concat(s.key)) await page.keyboard.press(k);
      if (s.keys) for (const k of [].concat(s.keys)) await page.keyboard.press(k);
      if (s.keydown) await page.keyboard.down(s.keydown);
      if (s.keyup) await page.keyboard.up(s.keyup);
      if (s.text !== undefined) { if (s.into) await page.locator(s.into).first().click({ timeout: STEP_TIMEOUT }); await page.keyboard.type(String(s.text), { delay: s.delay || 0 }); }
      if (s.wheel) { const c = await stagePt(640, 360); await page.mouse.move(c.x, c.y); await page.mouse.wheel(s.wheel[0], s.wheel[1]); }
      if (s.waitFor) {
        const isJs = /^js:/.test(s.waitFor), expr = s.waitFor.replace(/^js:/, '');
        let ok = false;
        for (let t = 0; t <= STEP_TIMEOUT && !ok; t += 100) { ok = isJs ? await page.evaluate(expr).catch(() => false) : (await page.locator(expr).count()) > 0; if (!ok) { if (args['fake-clock']) await page.clock.runFor(100); else await page.waitForTimeout(100); } }
        if (!ok) throw new Error(`waitFor ${s.waitFor} timed out`);
      }
      if (s.expect !== undefined) { const ok = await page.evaluate(s.expect); if (!ok) throw new Error(`expect failed: ${s.expect}`); }
      if (s.log) console.log(String(s.log));
      await settle(s, 300);
      if (s.shot) await shot(s.shot, s);
    } catch (e) { add('step', `${where}: ${String(e.message || e).split('\n')[0]}`); }
  }

  if (args.out) await shot(args.out);
  const st = await collect();
  if (errs.length || (args.strict && missing.size)) anyProblem = true;
  if (errs.length) {
    console.log(`ERRORS (${errs.length}) at ${tag}:`);
    for (const e of errs) console.log(`  [${e.kind}] ${e.text}${e.stack ? '\n        ' + e.stack : ''}`);
  }
  if (missing.size) console.log(`${args.strict ? 'ERRORS' : 'note'}: ${missing.size} resource${missing.size > 1 ? 's' : ''} not found at ${tag} (${args.strict ? 'counted because of --strict' : 'normal while files are still being written; --strict makes them errors'}): ${[...missing].slice(0, 8).join(', ')}${missing.size > 8 ? ', ...' : ''}`);
  await context.close();
  return st;
}

// ---------------------------------------------------------------- main
let browser;
try {
  if (args.diff) {
    browser = await chromium.launch(LAUNCH);
    for (const f of args.diff) if (!fs.existsSync(f)) usageError(`no such file ${f}`);
    const r = await diffPngs(browser, args.diff[0], args.diff[1], { threshold: args.threshold, outPath: args['diff-out'] });
    reportDiff(args.diff[0], args.diff[1], r, +(args.threshold || 0));
    if (args['diff-out']) console.log('wrote ' + args['diff-out']);
    await browser.close();
    process.exit(r.pct > +(args['max-diff'] === undefined ? 0 : args['max-diff']) ? 1 : 0);
  }
  browser = await chromium.launch(LAUNCH);
  console.log(`shot: ${finalUrl}${multi ? '  viewports ' + viewports.map((v) => v.w + 'x' + v.h).join(', ') : ''}`);
  for (const vp of viewports) await runViewport(browser, vp);
  if (args.baseline) {
    if (!lastShot) usageError('--baseline needs a capture (--out or a step shot)');
    if (!fs.existsSync(args.baseline)) usageError(`no such baseline ${args.baseline}`);
    const r = await diffPngs(browser, args.baseline, lastShot, { threshold: args.threshold, outPath: args['diff-out'] });
    reportDiff(args.baseline, lastShot, r, +(args.threshold || 0));
    const maxDiff = args['max-diff'] === undefined ? 0 : +args['max-diff'];
    if (r.pct > maxDiff) { anyProblem = true; console.log(`ERROR: difference ${r.pct.toFixed(4)}% is above --max-diff ${maxDiff}`); }
  }
  await browser.close();
} catch (e) {
  console.error('shot: ' + String((e && e.stack) || e).split('\n').slice(0, 6).join('\n'));
  try { if (browser) await browser.close(); } catch (e2) { /* already gone */ }
  process.exit(2);
}
process.exit(anyProblem && !args['no-fail'] ? 1 : 0);
