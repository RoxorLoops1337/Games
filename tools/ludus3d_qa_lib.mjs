// Ludus Maximus 3D QA library: a seeded "monkey" that drives the real UI and the game API and records findings.
// Used by tools/ludus3d_monkey.mjs (long runs, writes tools/ludus3d_qa_report.md) and tests/ludus_maximus_3d_monkey.test.mjs (short smoke).
// Findings: {kind, sev, where, msg, vp}. kinds: console, pageerror, rejection, overflow, clipped, tap, unreachable, noopen, stuck, slow, contrast, a11y.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIEWPORTS = {
  desktop: { width: 1280, height: 720, hasTouch: false },
  phone: { width: 390, height: 800, hasTouch: true, isMobile: true },
  landscape: { width: 800, height: 390, hasTouch: true, isMobile: true },
};
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
/** the screen ids game.js can open, read from its SCREENS list so new screens are swept automatically */
export const SCREENS = (() => { try { const t = readFileSync(join(REPO, 'ludus_maximus_3d', 'js', 'game.js'), 'utf8'); return (t.match(/const SCREENS = \[([^\]]+)\]/)[1].match(/'(\w+)'/g) || []).map((x) => x.replace(/'/g, '')); } catch (e) { return ['building', 'roster', 'profile', 'recruit', 'arena', 'market', 'armory', 'more', 'world']; } })();
let pw = null;
/** playwright + Chromium present? Browser suites skip (exit 0) when not, like the other headless suites in tests/ */
export async function browserAvailable() {
  if (pw) return true; if (!existsSync(EXE)) return false;
  for (const m of ['/opt/node22/lib/node_modules/playwright/index.mjs', 'playwright', 'playwright-core']) { try { pw = await import(m); return true; } catch (e) { /* try next */ } }
  return false;
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let srv = null;
/** tiny static server over the repo root (memoised); the monkey never depends on an external server being up */
export async function serve() {
  if (srv) return srv.url;
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x'); let p = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[\/\\])+/, ''); if (p.endsWith('/')) p += 'index.html';
      const buf = await readFile(join(REPO, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(buf);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  srv = { server, url: `http://127.0.0.1:${server.address().port}/ludus_maximus_3d/index.html` };
  return srv.url;
}
export function stopServer() { if (srv) { srv.server.close(); srv = null; } }
const ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

export function rng(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

/** In-page auditor, serialised into the page. Returns an array of layout/a11y issues for what is on screen right now. */
export function auditFn(opts) {
  const vw = innerWidth, vh = innerHeight, out = [];
  const sel = (e) => { let s = e.tagName.toLowerCase(); if (e.id) s += '#' + e.id; const c = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2); if (c.length) s += '.' + c.join('.'); const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40); return s + (t ? ` "${t}"` : ''); };
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const chain = (e) => { const a = []; for (let p = e.parentElement; p; p = p.parentElement) a.push(p); return a; };
  const visibleDeep = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || p.hidden) return false; } return true; };
  const roots = [...document.querySelectorAll('#ui, .lx-scrim, .lx-toasts, .lx-perf')].filter((r) => r.id === 'ui' || r.hidden !== true);
  const els = new Set(); for (const r of roots) { r.querySelectorAll('*').forEach((e) => els.add(e)); }
  const doc = document.documentElement; if (doc.scrollWidth > vw + 1) out.push({ kind: 'overflow', sev: 'high', msg: `page scrolls horizontally (${doc.scrollWidth} > ${vw})` });
  const skip = (e) => e.closest('svg') && e.tagName.toLowerCase() !== 'svg' || e.closest('.lx-out') || e.closest('.lx-tip') || e.closest('[data-qa-skip]') || e.closest('.lx-tut-ring') || e.closest('.lx-ttl-embers') || e.closest('.lx-vs, .vs3, .lx-lvlup, .lx-cer-layer, .lx-cer-lvl, .lx-banners'); // slide-in splashes and ceremonies are mid-animation by design
  for (const e of els) {
    if (skip(e) || !visibleDeep(e) || !vis(e)) continue;
    const r = e.getBoundingClientRect(); const tag = e.tagName.toLowerCase();
    // overflow beyond the viewport, unless an ancestor clips it
    if (r.right > vw + 1.5 || r.left < -1.5) {
      let clipped = false;
      for (const p of chain(e)) { const cs = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(cs.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1.5 && pr.left >= -1.5) { clipped = true; break; } } }
      if (!clipped && !e.closest('.lx-scrim.lx-out')) out.push({ kind: 'overflow', sev: 'high', msg: `${sel(e)} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}px` });
    }
    // content cut off by a non-scrolling ancestor (overflow hidden/clip): text or controls that extend past it are partly invisible
    if ((tag === 'button' || tag === 'input' || tag === 'a' || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) && !e.closest('svg')) {
      for (const p of chain(e)) {
        const pc = getComputedStyle(p); if (!/(hidden|clip|auto|scroll)/.test(pc.overflowX + pc.overflowY)) continue;
        const hid = /(hidden|clip)/.test(pc.overflowX) || /(hidden|clip)/.test(pc.overflowY);
        if (hid && !p.matches('.lx-bar, .ax-bar, .lx-ult, .lx-ult-core, .lx-sheet, .lx-scrim, .lx-panel-body') && p.clientWidth > 0) {
          const pr = p.getBoundingClientRect(), cut = (/(hidden|clip)/.test(pc.overflowX) && (r.right > pr.right + 2 || r.left < pr.left - 2)) || (/(hidden|clip)/.test(pc.overflowY) && (r.bottom > pr.bottom + 2 || r.top < pr.top - 2));
          if (cut && !e.closest('.lx-tip')) out.push({ kind: 'clipped', sev: 'med', msg: `${sel(e)} is cut off by ${sel(p)} (${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)} vs ${Math.round(pr.left)}..${Math.round(pr.right)} x ${Math.round(pr.top)}..${Math.round(pr.bottom)})` });
        }
        break; // only the nearest clipping ancestor matters
      }
    }
    // chrome labels (nav, tabs, chips, button labels) must never be ellipsised: a truncated 'Rost...' is a layout bug, unlike a long fighter name
    if (getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && e.matches('.lx-nav-i span, .lx-btn-label, .ax-tab span, .ax-chipbtn span, .lx-ttl-tog')) out.push({ kind: 'clipped', sev: 'med', msg: `${sel(e)} label is truncated with an ellipsis (${e.scrollWidth} > ${e.clientWidth})` });
    // text clipped inside its own box
    const cs = getComputedStyle(e);
    if (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && tag !== 'textarea' && tag !== 'option') {
      const hx = /(hidden|clip)/.test(cs.overflowX), hy = /(hidden|clip)/.test(cs.overflowY);
      if (hx && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2) out.push({ kind: 'clipped', sev: 'med', msg: `${sel(e)} text clipped horizontally (${e.scrollWidth} > ${e.clientWidth})` });
      if (hy && e.scrollHeight > e.clientHeight + 3 && !e.matches('.lx-sheet-scroll, .lx-scrim')) out.push({ kind: 'clipped', sev: 'med', msg: `${sel(e)} text clipped vertically (${e.scrollHeight} > ${e.clientHeight})` });
    }
    // touch target size
    if (opts.touch && /^(button|a|input|select|textarea|summary)$/.test(tag) || opts.touch && /^(button|switch|tab|checkbox|slider)$/.test(e.getAttribute('role') || '')) {
      if (e.disabled || e.type === 'hidden') continue;
      if ((r.width < 43.5 || r.height < 43.5) && !(tag === 'input' && e.type === 'range' && r.height >= 43.5)) out.push({ kind: 'tap', sev: 'med', msg: `${sel(e)} is ${Math.round(r.width)}x${Math.round(r.height)}px (< 44)` });
    }
    // unnamed controls
    if (/^(button|a)$/.test(tag) || /^(button|switch|progressbar|tab)$/.test(e.getAttribute('role') || '')) {
      const nm = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.textContent || e.title || '').trim();
      if (!nm) out.push({ kind: 'a11y', sev: 'med', msg: `${sel(e)} has no accessible name` });
    }
    if (tag === 'input' && e.type !== 'hidden' && !(e.getAttribute('aria-label') || e.labels && e.labels.length || e.title)) out.push({ kind: 'a11y', sev: 'med', msg: `${sel(e)} input without label` });
  }
  // HUD controls must not sit on top of each other (a floating camera button over the nav, replay chips over the pause button...)
  const hudBtns = [...document.querySelectorAll('.lx-hud button, .lx-photo-fab, .lx-fv-top button, .lx-fv-rbar button, .lx-ult')].filter((b) => visibleDeep(b) && vis(b) && !b.disabled);
  for (let i = 0; i < hudBtns.length; i++) for (let j = i + 1; j < hudBtns.length; j++) {
    const a = hudBtns[i], b = hudBtns[j]; if (a.contains(b) || b.contains(a)) continue; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), hh = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 6 && hh > 6) out.push({ kind: 'overlap', sev: 'high', msg: `${sel(a)} overlaps ${sel(b)} by ${Math.round(w)}x${Math.round(hh)}px` });
  }
  // sheets must fit the viewport and the close button must be reachable
  document.querySelectorAll('.lx-scrim:not(.lx-out) .lx-sheet').forEach((s) => {
    const r = s.getBoundingClientRect(); if (r.height > vh + 2 || r.width > vw + 2) out.push({ kind: 'overflow', sev: 'high', msg: `sheet "${(s.querySelector('.lx-title') || {}).textContent}" is ${Math.round(r.width)}x${Math.round(r.height)} in ${vw}x${vh}` });
    const x = s.querySelector('.lx-sheet-x'); if (x) { const xr = x.getBoundingClientRect(); if (xr.right > vw || xr.top < 0 || xr.left < 0) out.push({ kind: 'unreachable', sev: 'high', msg: 'sheet close button is off screen' }); }
  });
  return out;
}

/** every enabled button of the top sheet must be reachable: scroll it into view and hit-test its centre */
export function reachFn() {
  const out = [], vw = innerWidth, vh = innerHeight;
  const scr = [...document.querySelectorAll('.lx-scrim:not(.lx-out)')].pop(); if (!scr) return out;
  const btns = [...scr.querySelectorAll('button, [role=button], a[href], input, textarea')].filter((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
  for (const b of btns.slice(0, 80)) {
    const cs = getComputedStyle(b); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    try { b.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* detached */ }
    const r = b.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(b === hit || b.contains(hit) || hit.contains(b) && hit.closest('label'))) out.push({ kind: 'unreachable', sev: 'high', msg: `"${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)}" (${b.className}) covered by ${hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).slice(0, 30) : 'nothing'}` });
  }
  scr.querySelectorAll('.lx-sheet-scroll').forEach((s) => { s.scrollTop = 0; });
  return out;
}

const DANGER = /delete|replace|load this|load save|new ludus|found a|reload|ascend|yes, |import|export|start fresh/i;

export async function launch({ vp = 'phone', url = process.env.LM3D_URL || '', query = 'new=1&rich=1&empty=1&tier=low&manual=1', init = '', seed = 1, noBoot = false } = {}) {
  if (!url) url = await serve();
  if (!(await browserAvailable())) throw new Error('Chromium or playwright is not available');
  const browser = await pw.chromium.launch({ executablePath: EXE, args: ARGS });
  const v = VIEWPORTS[vp];
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: v.hasTouch, isMobile: !!v.isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const F = { list: [], seen: new Set() };
  const add = (kind, sev, where, msg) => { const key = kind + '|' + msg.slice(0, 120); if (F.seen.has(key)) return; F.seen.add(key); F.list.push({ kind, sev, where, msg, vp }); };
  page.on('pageerror', (e) => add('pageerror', 'high', cur.where, String(e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) add('console', 'high', cur.where, m.text().slice(0, 300)); });
  await page.addInitScript(() => {
    window.__qa = { rej: [], long: [] };
    addEventListener('unhandledrejection', (e) => window.__qa.rej.push(String((e.reason && e.reason.stack) || e.reason).slice(0, 300)));
    try { new PerformanceObserver((l) => { for (const x of l.getEntries()) window.__qa.long.push(Math.round(x.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* no longtask */ }
  });
  if (init) await page.addInitScript(init);
  const cur = { where: 'boot' };
  const ready = noBoot ? () => window.__LM3D && window.__LM3D.game : () => window.__LM3D && window.__LM3D.game && window.__LM3D.game.S;
  for (let attempt = 0; ; attempt++) { // software GL occasionally stalls the first boot: one retry
    try { await page.goto(url + (query ? '?' + query : '')); await page.waitForFunction(ready, null, { timeout: 60000 }); break; }
    catch (e) { if (attempt >= 1) { await browser.close(); throw e; } }
  }
  return { browser, page, F, cur, add, vp, touch: !!v.hasTouch, rnd: rng(seed) };
}

async function sweepRejections(h) { const r = await h.page.evaluate(() => { const a = window.__qa.rej.splice(0); return a; }); r.forEach((m) => h.add('rejection', 'high', h.cur.where, m)); }

export async function audit(h, where) {
  h.cur.where = where; await settle(h);
  const issues = await h.page.evaluate(auditFn, { touch: h.touch });
  issues.forEach((i) => h.add(i.kind, i.sev, where, i.msg));
  const reach = await h.page.evaluate(reachFn);
  reach.forEach((i) => h.add(i.kind, i.sev, where, i.msg));
  await sweepRejections(h);
  return issues.length + reach.length;
}

/** id of a random roster gladiator (profile screen argument) */
export async function gid(h) { return h.page.evaluate((r) => { const g = window.__LM3D.game.S.glads; return g.length ? g[Math.floor(r * g.length)].id : -1; }, h.rnd()); }

/** wait until the top sheet finished its enter transition (class lx-in and no running finite animation inside it) */
export async function settle(h) {
  await h.page.waitForFunction(() => {
    if (document.querySelector('.lx-scrim.lx-out')) return false;               // a closing dialog still covers the one below
    const s = [...document.querySelectorAll('.lx-scrim')].pop(); if (!s) return true; if (!s.classList.contains('lx-in')) return false;
    const sh = s.querySelector('.lx-sheet'); if (sh) { const cs = getComputedStyle(sh); if ((cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)') || +cs.opacity < 1) return false; }
    return !document.getAnimations().some((a) => { const t = a.effect && a.effect.target; const it = a.effect && a.effect.getComputedTiming().iterations; return t && s.contains(t) && it !== Infinity && a.playState === 'running'; });
  }, null, { timeout: 20000 }).catch(() => {});
  await h.page.waitForTimeout(60);
}

/** open a screen through the real game.open and wait for its sheet */
export async function openScreen(h, id, arg) {
  h.cur.where = 'open ' + id;
  const t0 = Date.now();
  await h.page.evaluate(([i, a]) => { window.__LM3D.game.open(i, a); }, [id, arg]);
  const okOpen = await h.page.waitForSelector('.lx-scrim:not(.lx-out) .lx-sheet', { timeout: 20000 }).then(() => true).catch(() => false);
  if (!okOpen) { h.add('noopen', 'high', 'open ' + id, `screen "${id}" did not open a sheet within 20s`); return false; }
  await settle(h);
  const dt = Date.now() - t0; if (dt > 8000) h.add('slow', 'low', 'open ' + id, `opening "${id}" took ${dt}ms`);
  return true;
}

export async function closeAll(h) {
  await h.page.evaluate(() => window.__LM3D.game.closeAll());
  await h.page.waitForTimeout(260);
  const n = await h.page.evaluate(() => document.querySelectorAll('.lx-scrim:not(.lx-out)').length);
  if (n) h.add('stuck', 'high', 'closeAll', `${n} modal scrim(s) still present after closeAll`);
}

/** click a random safe, visible, enabled button in the top sheet (or HUD when nothing is open) */
export async function clickRandom(h) {
  const idx = await h.page.evaluate(([rv, danger]) => {
    const re = new RegExp(danger, 'i');
    const scr = [...document.querySelectorAll('.lx-scrim:not(.lx-out)')].pop();
    const root = scr || document.querySelector('.lx-hud');
    if (!root) return null;
    const c = [...root.querySelectorAll('button, [role=button], .ax-pick, .ax-chipbtn')].filter((b) => {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
      const r = b.getBoundingClientRect(), cs = getComputedStyle(b); if (!r.width || cs.visibility === 'hidden' || cs.display === 'none') return false;
      const t = (b.getAttribute('aria-label') || b.textContent || '').trim(); return !re.test(t);
    });
    if (!c.length) return null;
    const i = Math.floor(rv * c.length), b = c[i]; b.scrollIntoView({ block: 'center' });
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    window.__qaPick = b; return t;
  }, [h.rnd(), DANGER.source]);
  if (idx == null) return null;
  h.cur.where = 'click "' + idx + '"';
  try { await h.page.evaluate(() => window.__qaPick.click()); } catch (e) { h.add('pageerror', 'high', h.cur.where, 'click threw: ' + String(e.message).slice(0, 200)); }
  await h.page.waitForTimeout(120);
  return idx;
}

export async function apiAction(h, name) {
  h.cur.where = 'api ' + name;
  const r = await h.page.evaluate(([n, rv]) => {
    const g = window.__LM3D.game, S = g.S, LM = globalThis.LM, D = globalThis.LM_D, pick = (a) => a[Math.floor(rv * a.length) % a.length];
    try {
      if (n === 'hire') { if (!S.recruits || !S.recruits.length) { if (LM.ensureShops) LM.ensureShops(S); } const c = pick(S.recruits || []); if (c && LM.rosterCap(S) > S.glads.length) { const e = LM.hire(S, c); g.save(); g.refresh(); return 'hire ' + (e || 'ok'); } return 'hire none'; }
      if (n === 'train') { const gl = pick(S.glads); if (!gl) return 'no glad'; gl.act = pick(['str', 'agi', 'vit', 'tec', 'rest', 'spar', 'job'].filter((a) => !D.ACTS || true)); return 'act ' + gl.act; }
      if (n === 'equip') { const gl = pick(S.glads), it = pick(S.items || []); if (gl && it) { const e = LM.equip(S, gl, it); return 'equip ' + (e || 'ok'); } return 'equip none'; }
      if (n === 'buy') { const it = pick(S.market || []); if (it) { const e = LM.buyItem(S, it); g.save(); g.refresh(); return 'buy ' + (e || 'ok'); } return 'buy none'; }
      if (n === 'build') { const i = Math.floor(rv * 16), p = S.plots[i]; const ids = Object.keys(D.BUILD); const e = p ? LM.upgrade(S, i) : LM.build(S, i, pick(ids)); g.save(); g.refresh(); return 'build ' + (e || 'ok'); }
      if (n === 'enter') {
        let k = 0; const free = S.glads.filter((x) => x.inj <= 0 && x.en >= 30);
        for (const lg of [0, 1]) { for (const ev of LM.events(S, S.week, lg) || []) { if (!free.length) break; const sz = LM.teamSize(ev); if (free.length < sz) continue; const e = LM.enter(S, ev, free.splice(0, sz).map((x) => x.id), pick(['bal', 'aggr', 'def'])); if (!e) k++; } }
        return 'entered ' + k;
      }
      if (n === 'hardcore') { S.opts = S.opts || {}; S.opts.hardcore = rv > 0.5; return 'hardcore ' + S.opts.hardcore; }
    } catch (e) { return 'THROW ' + e.message; }
    return 'noop';
  }, [name, h.rnd()]);
  if (/^THROW/.test(r)) h.add('pageerror', 'high', 'api ' + name, r);
  return r;
}

/**
 * drive any async game flow to its end: auto-click dialogs (first enabled action, or the one matching `prefer`), pick the first fighter in
 * pickFighters sheets, step the 3D fight, audit after every dialog. `start` is a function string evaluated in the page that returns a promise.
 */
export async function driveFlow(h, start, { label = 'flow', maxSteps = 700, replay = false, prefer = '' } = {}) {
  h.cur.where = label;
  const titles = [];
  await h.page.evaluate((src) => { window.__bot = { done: false, err: null }; const g = window.__LM3D.game; Promise.resolve().then(() => (0, eval)(src)(g)).then(() => { window.__bot.done = true; }).catch((e) => { window.__bot.err = String(e && e.stack || e); window.__bot.done = true; }); }, start);
  let guard = 0, replays = 0;
  while (guard++ < maxSteps) {
    const st = await h.page.evaluate(([wantReplay, pref]) => {
      if (window.__bot.done) return { done: true, err: window.__bot.err };
      const top = [...document.querySelectorAll('.lx-scrim:not(.lx-out)')].pop();
      if (top && top.querySelector('.ax-pick')) { // fighter picker: select the first free fighter, then confirm
        const confirm = top.querySelector('.ax-sticky .lx-btn:not([disabled])');
        if (confirm) { confirm.click(); return { clicked: 'picker confirm' }; }
        const pk = [...top.querySelectorAll('.ax-pick')].find((x) => x.getAttribute('aria-disabled') !== 'true');
        if (pk) { pk.click(); return { clicked: 'picker select' }; }
        const x = top.querySelector('.lx-sheet-x'); if (x) { x.click(); return { clicked: 'picker close (no free fighter)' }; }
      }
      const fo = [...document.querySelectorAll('.lx-fate .lx-fate-opt:not([disabled])')];   // FATE: the decision panel in the fight view (kill / spare / ransom); answered with a real click, rotating through the options
      if (fo.length && !document.querySelector('.lx-scrim:not(.lx-out)')) { if (!window.__fateAud) { window.__fateAud = 1; return { fateAudit: true }; } window.__fateAud = 0; window.__fateN = (window.__fateN | 0) + 1; const b = fo[window.__fateN % fo.length]; b.click(); return { clicked: 'fate ' + b.dataset.id }; }
      { const cp = [...document.querySelectorAll('.lx-scrim:not(.lx-out) .cp-opt .lx-btn')].find((b) => !b.disabled); if (cp) { cp.click(); return { clicked: 'story choice' }; } } // CAMPAIGN: a story scene's answers live in the body (their numbers are shown before you commit); answer the first one
      const acts = [...document.querySelectorAll('.lx-scrim:not(.lx-out) .lx-actions .lx-btn')].filter((b) => !b.disabled);
      if (acts.length) {
        const title = (document.querySelector('.lx-scrim:not(.lx-out) .lx-title') || {}).textContent || '';
        const rp = wantReplay && acts.find((b) => /replay/i.test(b.textContent));
        const pf = pref && acts.find((b) => new RegExp(pref, 'i').test(b.textContent));
        (rp || pf || acts[0]).click(); return { clicked: title + (rp ? ' [replay]' : '') };
      }
      return { adv: true };
    }, [replay && replays < 1, prefer]);
    if (st.done) { if (st.err) h.add('stuck', 'high', label, 'flow threw: ' + st.err.slice(0, 300)); await sweepRejections(h); return { steps: guard, titles }; }
    if (st.fateAudit) { await h.page.waitForTimeout(800); await audit(h, 'fate panel'); continue; }   // FATE: layout / tap-target audit of the decision panel before it is answered
    if (st.clicked !== undefined) { titles.push(st.clicked); if (/\[replay\]/.test(st.clicked)) replays++; await h.page.waitForTimeout(450); /* let the flow open the next dialog before measuring */ await audit(h, 'after dialog ' + st.clicked.slice(0, 30)); continue; }
    await h.page.evaluate(() => window.__LM3D.advance(1.5));
  }
  h.add('stuck', 'high', label, `${label} did not finish after ${maxSteps} steps; last dialogs: ${titles.slice(-4).join(' | ')}`);
  return { steps: guard, titles, stuck: true };
}
/** advance a week through the real flow (see driveFlow) */
export const advanceWeek = (h, o = {}) => driveFlow(h, '(g) => g.advance()', Object.assign({ label: 'advance week' }, o));
/** the challenge modes of the Arena (Pit, Daily, Horde trial, champion duel, bounty), each driven to the end and cashed out at the first chance */
export async function playModes(h, names = ['bounty', 'horde', 'pit', 'champ']) {
  const out = {};
  for (const n of names) {
    const fn = { pit: 'startPit(g.ctx, false)', daily: 'startPit(g.ctx, true)', horde: 'startHorde(g.ctx)', champ: 'startChamp(g.ctx)', bounty: 'startBounty(g.ctx)' }[n];
    out[n] = await driveFlow(h, `async (g) => { const m = await import('/ludus_maximus_3d/js/screens/modes.js'); return m.${fn}; }`, { label: 'mode ' + n, maxSteps: 500, prefer: 'cash|retreat|leave|collect|claim|walk away|continue|close|ok' });
    await closeAll(h); await h.page.evaluate(() => { const g = window.__LM3D.game; if (g.scene !== 'hub') g.returnToHub(); g.refresh(); });
  }
  return out;
}

/** MOVE: open Rearrange mode with a real click on the hammer button, lift a random building, preview a random plot, answer the confirm card with a real click, undo, leave with Escape */
export async function rearrWalk(h) {
  h.cur.where = 'rearrange mode';
  const vis = await h.page.evaluate(() => { const f = document.querySelector('.lx-rr-fab'); return !!(f && !f.hidden && f.getBoundingClientRect().width); });
  if (!vis) return 'no fab';
  await h.page.evaluate(() => document.querySelector('.lx-rr-fab').click()); await h.page.waitForTimeout(500);
  await audit(h, 'rearrange mode');
  const r1 = h.rnd(), r2 = h.rnd(), r3 = h.rnd();
  const res = await h.page.evaluate(([a, b]) => {
    const g = window.__LM3D.game, r = g.rearr, S = g.S; if (!r || !r.active) return { err: 'mode did not open' };
    S.gold = Math.max(S.gold, 1500);   // the walk must be able to pay
    const built = S.plots.map((p, i) => (p ? i : -1)).filter((i) => i >= 0 && i < S.rows * 4); if (!built.length) return { none: 1 };
    const from = built[Math.floor(a * built.length) % built.length], to = Math.floor(b * S.rows * 4);
    r.tap(from); r.tap(to); return { from, to, sel: r.state.sel, card: !!document.querySelector('.lx-rr-confirm') };
  }, [r1, r2]);
  if (res.err) { h.add('stuck', 'high', h.cur.where, res.err); return res.err; }
  await h.page.waitForTimeout(350);
  if (res.card) {
    await audit(h, 'rearrange confirm card');
    const ok = r3 > 0.45;
    await h.page.evaluate((ok) => document.querySelector(ok ? '.lx-rr-confirm [data-rr=ok]' : '.lx-rr-confirm [data-rr=cancel]').click(), ok);
    if (ok) { for (let k = 0; k < 14; k++) { await h.page.evaluate(() => window.__LM3D.advance(0.5)); const cine = await h.page.evaluate(() => window.__LM3D.game.rearr.state.cine); if (!cine) break; } await audit(h, 'rearrange after move'); }
  }
  const undo = await h.page.evaluate(() => { const b = document.querySelector('.lx-rr-modebar button.alt:not([hidden])'); if (b) { b.click(); return true; } return false; });
  await h.page.waitForTimeout(200);
  for (let k = 0; k < 4; k++) { const on = await h.page.evaluate(() => !!window.__LM3D.game.rearr.active); if (!on) break; await h.page.keyboard.press('Escape'); await h.page.waitForTimeout(150); }
  const left = await h.page.evaluate(() => !!window.__LM3D.game.rearr.active);
  if (left) h.add('stuck', 'high', h.cur.where, 'Escape did not leave rearrange mode');
  await h.page.evaluate(() => window.__LM3D.game.save && window.__LM3D.game.save());
  return 'rearr ' + JSON.stringify(res) + (undo ? ' undo' : '');
}
async function photoToggle(h) {
  h.cur.where = 'photo mode';
  const vis = await h.page.evaluate(() => { const f = document.querySelector('.lx-photo-fab'); return !!(f && f.getBoundingClientRect().width); });
  if (!vis) return 'no fab';
  await h.page.evaluate(() => document.querySelector('.lx-photo-fab').click()); await h.page.waitForTimeout(300);
  await audit(h, 'photo mode open');
  await h.page.evaluate(() => { const c = document.querySelector('.lx-photo-close, .lx-photo [aria-label=Close], .lx-photo-btn'); (document.querySelector('.lx-photo-close') || c || document.body).click(); });
  await h.page.keyboard.press('Escape'); await h.page.waitForTimeout(300);
  const left = await h.page.evaluate(() => { const r = document.querySelector('.lx-photo'); return !!(r && !r.hidden); });
  if (left) h.add('stuck', 'high', 'photo mode', 'photo mode did not close with its close button or Escape');
  return 'photo ok';
}

async function settingsToggle(h) {
  h.cur.where = 'settings';
  if (!(await openScreen(h, 'more', { tab: 'settings' }))) return;
  const n = await h.page.evaluate(() => document.querySelectorAll('.lx-scrim:not(.lx-out) .ax-switch').length);
  for (let k = 0; k < 2 && n; k++) { const i = Math.floor(h.rnd() * n); await h.page.evaluate((j) => document.querySelectorAll('.lx-scrim:not(.lx-out) .ax-switch')[j].click(), i); await h.page.waitForTimeout(80); }
  await audit(h, 'more/settings');
}

/** walk the save for numbers that JSON would turn into null (NaN, Infinity) or undefined holes in arrays: they corrupt saves silently */
export function integrityFn() {
  const bad = [], seen = new Set();
  const walk = (v, path, depth) => {
    if (bad.length > 8 || depth > 9) return;
    if (typeof v === 'number') { if (!isFinite(v)) bad.push(path + ' = ' + v); return; }
    if (v && typeof v === 'object') { if (seen.has(v)) return; seen.add(v); if (Array.isArray(v)) v.forEach((x, i) => { if (x === undefined) bad.push(path + '[' + i + '] undefined'); else walk(x, path + '[' + i + ']', depth + 1); }); else for (const k of Object.keys(v)) walk(v[k], path + '.' + k, depth + 1); }
  };
  const S = window.__LM3D.game.S; walk(S, 'S', 0);
  try { const r = globalThis.LM.loadEx; const raw = JSON.stringify(S); if (raw.length > 4.5e6) bad.push('save is ' + raw.length + ' bytes (localStorage limit is about 5 MB)'); } catch (e) { bad.push('save does not serialise: ' + e.message); }
  return bad;
}
export async function checkState(h, where) { const bad = await h.page.evaluate(integrityFn); bad.forEach((m) => h.add('state', 'high', where, m)); }

export const STEPS = ['open', 'open', 'click', 'click', 'click', 'esc', 'tab', 'api', 'settings', 'photo', 'closeall', 'world', 'more', 'rearr'];

/** one monkey run. opts: {steps, weeks, fights, seed, vp} */
export async function monkey(o = {}) {
  const h = await launch({ vp: o.vp || 'phone', seed: o.seed || 7, query: o.query, init: o.init });
  const log = [];
  try {
    await h.page.evaluate((n) => { const g = window.__LM3D.game, LM = globalThis.LM, S = g.S; ['murmillo', 'thraex', 'hoplomachus'].slice(0, n).forEach((st, i) => { if (S.glads.length < n) S.glads.push(LM.makeGlad({ id: S.nextId++, style: st, lvl: 3 + i })); }); S.flags.auto = true; S.flags.tut = { v: 1, done: 1, skipped: true }; if (g.tutorial && g.tutorial.skip) { try { g.tutorial.skip(); } catch (e) { /* ok */ } } }, o.glads || 3);
    if (o.classes) await h.page.evaluate((c) => document.body.classList.add(...c.split(' ')), o.classes); // e.g. 'lx-large-text lx-hc'
    // every screen once, audited
    if (o.sweep !== false) {
      for (const id of o.screens || SCREENS) {
        const arg = id === 'building' ? { type: 'plot', i: 6 } : id === 'profile' ? await gid(h) : undefined;
        if (await openScreen(h, id, arg)) await audit(h, 'screen ' + id);
        await closeAll(h);
      }
      for (const tab of o.quick ? ['settings'] : ['ludus', 'honors', 'settings', 'help']) { if (await openScreen(h, 'more', { tab })) await audit(h, 'more/' + tab); await closeAll(h); }
      for (const tab of o.quick ? ['rivals'] : ['calendar', 'rivals', 'barracks', 'memorial']) { if (await openScreen(h, 'world', { tab })) await audit(h, 'world/' + tab); await closeAll(h); }
    }
    let weeks = 0;
    for (let i = 0; i < (o.steps || 0); i++) {
      const s = STEPS[Math.floor(h.rnd() * STEPS.length)]; log.push(s);
      const t0 = Date.now();
      if (s === 'open') { const id = SCREENS[Math.floor(h.rnd() * SCREENS.length)]; if (await openScreen(h, id, id === 'profile' ? await gid(h) : undefined)) await audit(h, 'screen ' + id); }
      else if (s === 'more') { const tab = ['ludus', 'honors', 'settings', 'help'][Math.floor(h.rnd() * 4)]; if (await openScreen(h, 'more', { tab })) await audit(h, 'more/' + tab); }
      else if (s === 'world') { const tab = ['calendar', 'rivals', 'barracks', 'memorial'][Math.floor(h.rnd() * 4)]; if (await openScreen(h, 'world', { tab })) await audit(h, 'world/' + tab); }
      else if (s === 'click') { const t = await clickRandom(h); if (t != null) await audit(h, 'after click "' + t + '"'); }
      else if (s === 'esc') { await h.page.keyboard.press('Escape'); await h.page.waitForTimeout(260); }
      else if (s === 'tab') { for (let k = 0; k < 3; k++) await h.page.keyboard.press(h.rnd() > 0.3 ? 'Tab' : 'Shift+Tab'); }
      else if (s === 'api') { await apiAction(h, ['hire', 'train', 'equip', 'buy', 'build', 'enter', 'hardcore'][Math.floor(h.rnd() * 7)]); }
      else if (s === 'settings') await settingsToggle(h);
      else if (s === 'photo') await photoToggle(h);
      else if (s === 'rearr') await rearrWalk(h);
      else if (s === 'closeall') await closeAll(h);
      const dt = Date.now() - t0; if (dt > 6000) h.add('slow', 'low', s, `step "${s}" took ${dt}ms`);
      if (o.weeks && weeks < o.weeks && (i + 1) % Math.max(4, Math.floor((o.steps || 1) / o.weeks)) === 0) {
        await closeAll(h); await apiAction(h, 'enter'); const r = await advanceWeek(h, { replay: !!o.replay && weeks === 0 }); weeks++; log.push('week:' + r.steps); await audit(h, 'hub after week'); await checkState(h, 'after week ' + weeks);
      }
    }
    if (o.weeks && weeks === 0) { await closeAll(h); await apiAction(h, 'enter'); await advanceWeek(h, { replay: !!o.replay }); await audit(h, 'hub after week'); }
    if (o.modes) { await closeAll(h); await playModes(h, Array.isArray(o.modes) ? o.modes : undefined); await audit(h, 'hub after modes'); await checkState(h, 'after modes'); }
    await checkState(h, 'end of run');
    const long = await h.page.evaluate(() => window.__qa.long.splice(0)); const worst = Math.max(0, ...long);
    if (worst > 1500) h.add('slow', 'low', 'run', `longest main-thread task ${worst}ms (software GL, informational)`);
    await sweepRejections(h);
    const state = await h.page.evaluate(() => { const S = window.__LM3D.game.S; return { week: S.week, gold: S.gold, glads: S.glads.length, busy: window.__LM3D.game.busy, scene: window.__LM3D.game.scene }; });
    return { findings: h.F.list, log, state };
  } finally { await h.browser.close(); }
}

export function formatReport(runs) {
  const L = ['# Ludus Maximus 3D QA monkey report', '', `Generated ${new Date().toISOString().slice(0, 10)} by tools/ludus3d_monkey.mjs`, ''];
  const all = runs.flatMap((r) => r.findings);
  L.push(`Total findings: ${all.length} (high ${all.filter((f) => f.sev === 'high').length}, med ${all.filter((f) => f.sev === 'med').length}, low ${all.filter((f) => f.sev === 'low').length})`, '');
  for (const r of runs) {
    L.push(`## ${r.vp} (seed ${r.seed}, ${r.log.length} steps, final ${JSON.stringify(r.state)})`, '');
    if (!r.findings.length) L.push('No findings.', '');
    for (const f of r.findings) L.push(`- [${f.sev}] ${f.kind} @ ${f.where}: ${f.msg}`);
    L.push('');
  }
  return L.join('\n');
}
