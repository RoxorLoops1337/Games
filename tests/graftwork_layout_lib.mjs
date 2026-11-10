// The layout gate's harness: drives a screen with the headless app and checks the analysed frame. Registered widgets never overlap (other
// than within a group or flagged overlay) and stay inside 1280x720, nothing sits in the reserved Pause/Fullscreen zone, every app.text()
// block fits the widget it is drawn in, and the tip drawn that frame is laid out cleanly (checkTip).
// Used by tests/graftwork_tip_layout.test.mjs. tests/graftwork_ui_layout.test.mjs still carries its own copy of this harness: it was not to be
// touched while other branches were open, and should import this file once they have landed.
import assert from 'node:assert/strict';
import { makeApp, frames, wardOpen, WIN } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import { CARDS, GRAFT_LIST, RELICS, ENEMIES, STATUSES } from '../graftwork/data/index.js';

const SCREENS = {};
for (const n of ['ward', 'graft', 'reward', 'shop', 'forge', 'event', 'deckview', 'codex', 'archive', 'end', 'wardrobe', 'title', 'settings', 'pause']) SCREENS[n] = (await import(`../graftwork/ui/${n}.js`)).default;

export const RESERVED = { x: 1128, y: 0, w: 144, h: 56 };
const inside = (r, x, y) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5;
const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

// One gate per suite. The known faults a suite lists are its own:
//   openWard  [[tag pattern, kind pattern, text pattern or null], ...]: faults of scenes the Ward makes (design/CLEANUP_PLAN.md, "Layout faults
//             the port found"). They are counted and printed, never dropped silently, and an entry that stops matching fails report().
export function layoutGate({ openWard = [] } = {}) {
  const problems = [];
  let label = '', tipChecked = 0, framesChecked = 0;
  const openWardHits = new Map();

  // ---- harness -------------------------------------------------------------------------------------------------
  async function make(opts = {}) {
    const run = opts.run || RUN.newRun({ hero: opts.hero || 'marrow', seed: opts.seed || 'layout' });
    const meta = { settings: { tips: false, reduceMotion: true, textScale: opts.scale || 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} }, ...(opts.meta || {}) };
    const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
    app.textScale = (opts.scale || 100) / 100;
    if (opts.pscale || opts.phone) { app.scale = opts.pscale || 0.54; app.minPx = 11; } // phone: the small-screen text floor inflates every label up to 1.5x (0.64 = 820x462, 0.54 = 844x390, 0.46 = 740x330)
    // proportional fake metrics so wrapping and fit checks are meaningful (the stock fake is 8px per char at any size)
    app.ctx.measureText = (s) => {
      const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), size = m ? +m[1] : 16;
      return { width: String(s).length * size * (/bold/.test(f) ? 0.56 : 0.52) };
    };
    const texts = [];
    let depth = 0;
    const rawText = app.text;
    const tipTexts = [];
    app.text = (str, x, y, o = {}) => {
      if (app._tipDraw && str !== '' && str !== undefined) { const L = app.layoutText(String(str), o), al = o.align || 'left'; tipTexts.push({ s: String(L.lines[0]).slice(0, 30), x: al === 'center' ? x - L.w / 2 : x, y, w: L.w, h: L.h, trunc: L.trunc && !L.soft }); }
      if (depth > 0 && str !== '' && str !== undefined && str !== null && o.alpha !== 0) {
        const L = app.layoutText(String(str), o), size = L.size, w = L.w, h = L.h, lines = L.lines;
        const al = o.align || 'left', bl = o.baseline || 'top';
        const x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
        const y0 = bl === 'middle' ? y - size / 2 : bl === 'bottom' || bl === 'alphabetic' ? y - size : y;
        texts.push({ n: LAYOUT.getAll().length, s: String(lines[0]).slice(0, 40), x: x0, y: y0, w, h, size, trunc: L.trunc && !L.soft, str: String(str), alpha: o.alpha === undefined ? 1 : o.alpha, fit: !!o.fit, id: texts.length });
      }
      return rawText(str, x, y, o);
    };
    const h = { textPct: opts.scale || 100, app, run, meta, texts, tipTexts, flow: null, checks: 0, owner: opts.owner || '' };
    const wrapScreen = (name, mod) => ({ __proto__: mod, draw(a) { depth++; try { return mod.draw.call(this, a); } finally { depth--; } } });
    h.register = (name, mod) => app.register(name, wrapScreen(name, mod));
    for (const n of Object.keys(SCREENS)) h.register(n, SCREENS[n]);
    app.register('base', { draw() {} });
    app.afterFrame = () => { if (h.collect) { analyse(h, label); h.collect = false; } texts.length = 0; tipTexts.length = 0; };
    return h;
  }

  // Tooltip gate: the tip drawn this frame (app.tipLayout from ui/tooltips.js) lies inside the stage and clear of the reserved zone, its panels and
  // sections do not overlap, no text is cut or drawn outside the section that owns it, and no two texts of the tip share pixels.
  function checkTip(h, add) {
    const L = h.app.tipLayout; if (!L || L.frame !== h.app.frame) return;
    const r = L.rect, ph = h.app.scale < 0.95;
    if (r.x < 5.5 || r.y < 5.5 || r.x + r.w > 1274.5 || r.y + r.h > 714.5) add('tip-oob', `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`);
    if (hit(r, RESERVED)) add('tip-reserved', `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`);
    for (const p of L.panels) {
      if (ph && p.w > 0.41 * 1280 + 80) add('tip-wide', `${Math.round(p.w)}`);
      p.secs.forEach((s, i) => {
        const n = p.secs[i + 1];
        if (n && s.y + s.h > n.y + 0.5) add('tip-sections-overlap', `"${s.title}" x "${n.title}"`);
        if (s.y + s.h > p.y + p.h - 5) add('tip-section-outside-panel', `"${s.title}"`);
      });
    }
    for (let i = 0; i < L.panels.length; i++) for (let j = i + 1; j < L.panels.length; j++) if (hit(L.panels[i], L.panels[j])) add('tip-panels-overlap', `${i} x ${j}`);
    // a tip never drops a definition: a soft ellipsis in a definition means the ladder had to cut words (the sweeps fit everything they hover on)
    for (const p of L.panels) for (const sc of p.secs) if (/…$/.test(sc.text || '')) add('tip-definition-cut', `"${sc.title}": ${String(sc.text).slice(-30)}`);
    // on the graft offer the floating patch panel keeps off the patch column and the tray buttons
    for (const id of ['graft-patch0', 'graft-patch1', 'graft-patch2', 'graft-patch3', 'graft-reroll', 'graft-decline', 'graft-sew']) { const rg = LAYOUT.getAll().find((q) => q.id === id); if (rg && L.anchor && L.anchor.region && hit(r, rg)) add('tip-covers-graft-ui', id); }
    const T = h.tipTexts;
    for (const t of T) {
      if (t.trunc) add('tip-text-truncated', t.s);
      const sec = L.panels.flatMap((p) => p.secs).find((s) => t.x >= s.x - 20 && t.x <= s.x + s.w + 1 && t.y >= s.y - 1 && t.y < s.y + s.h);
      if (!sec) { add('tip-text-orphan', `"${t.s}" @${Math.round(t.x)},${Math.round(t.y)}`); continue; }
      if (t.y + t.h > sec.y + sec.h + 1 || t.x + t.w > sec.x + sec.w + 1) add('tip-text-overflow', `"${t.s}" ${Math.round(t.w)}x${Math.round(t.h)} in "${sec.title}" ${Math.round(sec.w)}x${Math.round(sec.h)}`);
    }
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j], ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 2 && iy > 2) add('tip-text-text', `"${a.s}" x "${b.s}"`);
    }
    tipChecked++;
  }
  function analyse(h, tag) {
    h.checks++; framesChecked++;
    const add = (kind, msg) => { const k = tag + '|' + kind + '|' + msg; if (!problems.includes(k)) problems.push(k); };
    checkTip(h, add);
    const regs = LAYOUT.getAll();
    for (const o of LAYOUT.findOverlaps()) add('overlap', `${o.a} x ${o.b} (${o.area}px2)`);
    for (const id of LAYOUT.findOutOfBounds()) add('oob', id);
    for (const r of regs) if (r.layer === 'hud' && !r.overlay && hit(r, RESERVED)) add('reserved', r.id);
    const scrolls = regs.filter((r) => /^scroll/.test(r.id));
    for (const t of h.texts) {
      if (!t.str.trim()) continue;
      if (t.y > 721 || t.y + t.h < -1 || t.x > 1281 || t.x + t.w < -1) continue; // entirely off stage (scrolled away)
      if (scrolls.some((r) => hit(r, t))) continue; // clipped inside a scrolling box
      const where = `"${t.s}" @${Math.round(t.x)},${Math.round(t.y)} ${Math.round(t.w)}x${Math.round(t.h)}`;
      if (t.trunc) add('text-truncated', where);
      if (t.x < -1 || t.y < -1 || t.x + t.w > 1281 || t.y + t.h > 721) add('text-oob', where);
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      // a modal owns only the text drawn after it registered (anything drawn earlier sits underneath it)
      const cont = regs.filter((r, i) => inside(r, cx, cy) && (!r.overlay || i < t.n)).sort((a, b) => a.w * a.h - b.w * b.h);
      const own = cont.find((r) => r.overlay) || cont[0];
      if (own && own.layer !== 'world' && (t.x < own.x - 2 || t.y < own.y - 2 || t.x + t.w > own.x + own.w + 2 || t.y + t.h > own.y + own.h + 2)) add('text-overflow', `${where} in ${own.id} ${Math.round(own.w)}x${Math.round(own.h)}`);
      if (hit(t, RESERVED) && !(own && own.overlay)) add('text-reserved', where);
      if (h.textPct === 100) for (const u of h.texts) { // text over text: two labels sharing pixels (a modal drawn between them hides the earlier one)
        if (u.id <= t.id || u.s === t.s || u.alpha < 0.9 || t.alpha < 0.9) continue;
        if (u.y > 721 || u.x > 1281) continue;
        const ix = Math.min(t.x + t.w, u.x + u.w) - Math.max(t.x, u.x), iy = Math.min(t.y + t.h, u.y + u.h) - Math.max(t.y, u.y);
        if (ix < 2 || iy < 3 || ix * iy < 0.15 * Math.min(t.w * t.h, u.w * u.h)) continue;
        if (scrolls.some((r) => hit(r, t) !== hit(r, u))) continue;
        if (regs.some((r, i) => r.overlay && i >= Math.min(t.n, u.n) && i < Math.max(t.n, u.n) && (inside(r, t.x + t.w / 2, t.y + t.h / 2) || inside(r, u.x + u.w / 2, u.y + u.h / 2)))) continue;
        add('text-text', `${where} x "${u.s}" @${Math.round(u.x)},${Math.round(u.y)} ${Math.round(u.w)}x${Math.round(u.h)}`);
      }
      if (own && own.overlay) continue;
      for (const r of regs) {
        if (r.layer !== 'hud' || r.overlay || inside(r, cx, cy)) continue;
        if (own && r.id === own.id) continue;
        if (hit(t, r)) add('text-hits', `${where} x ${r.id}`);
      }
    }
  }
  // run n frames; the last one is analysed
  function look(h, n = 3, tag) {
    if (tag) label = tag;
    frames(h.app, Math.max(0, n - 1));
    h.collect = true; frames(h.app, 1);
  }
  function go(h, name, params = {}) { h.app.go(name, { run: h.run, ...params }); }
  // Hover a grid over the screen: the pointer rests `hover` frames on each point and the last of them is analysed, so every tip the
  // screen can show from there goes through checkTip (and the screen under it through the layout checks, with that tip up).
  function sweepTips(h, tag, step = [96, 76], hover = 12) {
    const app = h.app;
    for (let y = 70; y < 710; y += step[1]) for (let x = 40; x < 1250; x += step[0]) {
      app.mouse.x = x; app.mouse.y = y; app.tipLayout = null;
      frames(app, hover - 1); h.collect = true; label = tag; frames(app, 1);
    }
    app.mouse.x = -99; app.mouse.y = -99; frames(app, 2);
  }
  // the problems of one screen (tags that start with `name`): the known Ward faults are counted, the rest printed. Returns how many were printed.
  function done(name) {
    const mine = problems.filter((p) => p.startsWith(name));
    const hard = mine.filter((p) => {
      const [tag, kind, rest = ''] = p.split('|');
      const w = openWard.findIndex(([t, kd, x]) => t.test(tag) && kd.test(kind) && (!x || x.test(rest))); if (w >= 0) openWardHits.set(w, (openWardHits.get(w) || 0) + 1);
      return w < 0;
    });
    if (hard.length) { console.log(hard.map((p) => '  ' + p).join('\n')); }
    return hard.length;
  }
  // the verdict: every screen prefix is judged, the counts are printed, a stale openWard entry and any problem that is not open fail
  function report(screens) {
    let bad = 0;
    for (const pre of screens) { console.log(pre + ':'); bad += done(pre); }
    console.log('frames analysed', framesChecked);
    console.log('tip layouts checked', tipChecked);
    console.log('problems', bad);
    console.log('known Ward scene faults: ' + openWard.map((e, i) => `#${i} ${openWardHits.get(i) || 0}`).join(', '));
    for (const [i] of openWard.entries()) assert.ok(openWardHits.get(i) > 0, `openWard entry #${i} no longer matches anything: the fault is fixed, delete the entry`);
    assert.equal(bad, 0, 'layout problems found (listed above)');
    return { frames: framesChecked, tips: tipChecked, problems: problems.length };
  }

  // ---- helpers for scenarios ---------------------------------------------------------------------------------------
  const flowFor = (h) => {
    const f = { RUN, route() { const ph = h.run.phase; h.app.go(['ward', 'reward', 'graft', 'shop', 'forge', 'event', 'end'].includes(ph) ? ph : (ph === 'dead' || ph === 'won') ? 'end' : 'base', { run: h.run }); },
      openDeck() { h.app.push('deckview', {}); }, openSettings() {}, abandon() {}, saveMeta() {}, newRun() {}, toTitle() {}, openCodex() { h.app.push('codex', {}); } };
    h.app.shared.flow = f; return f;
  };
  return { make, look, go, sweepTips, report, flowFor };
}

// ---- scene helpers that need no gate ---------------------------------------------------------------------------------
export const graftHeavy = (run, n = 8) => {
  let done = 0;
  for (const inst of run.deck) for (const g of GRAFT_LIST) { if (done >= n) return; if (CARDS[inst.id].type !== 'junk' && !inst.grafts.length && RUN.applyGraft(run, inst.uid, g.id, { keepPhase: true, free: true }).ok) { done++; break; } }
};
// Every scene is reached the way a run reaches it: the hero walks into the room that holds it (tests/graftwork_lib.mjs wardOpen), so the reward
// carries the floor's wood and stone and the building plan pick, the shop is the Dispensary with its plans, and an event knows its hour.
// the reward of a won fight: 'normal' = a Ward room with three monsters, 'elite' = Isolation, 'boss' = the Theatre on the last night
export const wonFight = (h, kind) => { wardOpen(h.run, kind === 'normal' ? 'fight' : kind, kind === 'normal' ? { enemies: Object.values(ENEMIES).filter((e) => e.act === h.run.act && e.kind === 'normal' && !e.summonOnly && !e.minion).slice(0, 3).map((e) => e.id) } : {}); RUN.resolveFight(h.run, WIN()); assert.equal(h.run.phase, 'reward'); assert.equal(h.run.pending.kind, kind); return h.run.pending; };
const HOURS = ['midday', 'evening', 'night'];
export const openEvent = (h, id, i = 0) => wardOpen(h.run, 'event', { event: id, phase: HOURS[i % 3] });
// a meta that has met everything: the longest real texts in the Codex
export const allSeen = () => ({ cards: Object.fromEntries(Object.keys(CARDS).map((k) => [k, 1])), grafts: Object.fromEntries(GRAFT_LIST.map((g) => [g.id, 1])), enemies: Object.fromEntries(Object.keys(ENEMIES).map((k) => [k, 1])), relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, 1])), statuses: Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 1])) });
