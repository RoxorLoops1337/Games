// Layout gate for the non-combat screens: drives each screen through its states with the headless app and proves, per
// frame, that registered widgets never overlap (other than within a group or flagged overlay), stay inside 1280x720,
// that nothing sits in the reserved Pause/Fullscreen zone, and that every app.text() block fits the widget it is drawn in.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import { CARDS, GRAFTS, GRAFT_LIST, RELICS, POTIONS, EVENTS, HEROES } from '../graftwork/data/index.js';

const SCREENS = {};
for (const n of ['map', 'graft', 'reward', 'shop', 'forge', 'event', 'deckview', 'codex', 'end']) SCREENS[n] = (await import(`../graftwork/ui/${n}.js`)).default;

export const RESERVED = { x: 1128, y: 0, w: 144, h: 56 };
const problems = [];
let label = '';

// ---- harness -------------------------------------------------------------------------------------------------
async function make(opts = {}) {
  const run = opts.run || RUN.newRun({ hero: opts.hero || 'marrow', seed: opts.seed || 'layout' });
  const meta = { settings: { tips: false, reduceMotion: true, textScale: opts.scale || 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} }, ...(opts.meta || {}) };
  const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
  app.textScale = (opts.scale || 100) / 100;
  // proportional fake metrics so wrapping and fit checks are meaningful (the stock fake is 8px per char at any size)
  app.ctx.measureText = (s) => {
    const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), size = m ? +m[1] : 16;
    return { width: String(s).length * size * (/bold/.test(f) ? 0.56 : 0.52) };
  };
  const texts = [];
  let depth = 0;
  const rawText = app.text;
  app.text = (str, x, y, o = {}) => {
    if (depth > 0 && str !== '' && str !== undefined && str !== null && o.alpha !== 0) {
      const size = Math.round((o.size || 18) * (o.fixed ? 1 : app.textScale)), lineH = o.lineH || Math.round(size * 1.22);
      const lines = o.maxW ? app.wrap(String(str), o.maxW, size, o) : String(str).split('\n');
      let w = 0; for (const l of lines) w = Math.max(w, app.measure(l, size, o));
      const h = (lines.length - 1) * lineH + size;
      const al = o.align || 'left', bl = o.baseline || 'top';
      const x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
      const y0 = bl === 'middle' ? y - size / 2 : bl === 'bottom' || bl === 'alphabetic' ? y - size : y;
      texts.push({ n: LAYOUT.getAll().length, s: String(lines[0]).slice(0, 40), x: x0, y: y0, w, h, size });
    }
    return rawText(str, x, y, o);
  };
  const h = { app, run, meta, texts, flow: null, checks: 0, owner: opts.owner || '' };
  const wrapScreen = (name, mod) => ({ __proto__: mod, draw(a) { depth++; try { return mod.draw.call(this, a); } finally { depth--; } } });
  h.register = (name, mod) => app.register(name, wrapScreen(name, mod));
  for (const n of Object.keys(SCREENS)) h.register(n, SCREENS[n]);
  app.register('base', { draw() {} });
  app.afterFrame = () => { if (h.collect) { analyse(h, label); h.collect = false; } texts.length = 0; };
  return h;
}
const inside = (r, x, y) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5;
const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

function analyse(h, tag) {
  h.checks++;
  const add = (kind, msg) => { const k = tag + '|' + kind + '|' + msg; if (!problems.includes(k)) problems.push(k); };
  const regs = LAYOUT.getAll();
  for (const o of LAYOUT.findOverlaps()) add('overlap', `${o.a} x ${o.b} (${o.area}px2)`);
  for (const id of LAYOUT.findOutOfBounds()) add('oob', id);
  for (const r of regs) if (r.layer === 'hud' && !r.overlay && hit(r, RESERVED)) add('reserved', r.id);
  const scrolls = regs.filter((r) => /^scroll/.test(r.id));
  for (const t of h.texts) {
    if (t.y > 721 || t.y + t.h < -1 || t.x > 1281 || t.x + t.w < -1) continue; // entirely off stage (scrolled away)
    if (scrolls.some((r) => hit(r, t))) continue; // clipped inside a scrolling box
    const where = `"${t.s}" @${Math.round(t.x)},${Math.round(t.y)} ${Math.round(t.w)}x${Math.round(t.h)}`;
    if (t.x < -1 || t.y < -1 || t.x + t.w > 1281 || t.y + t.h > 721) add('text-oob', where);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    // a modal owns only the text drawn after it registered (anything drawn earlier sits underneath it)
    const cont = regs.filter((r, i) => inside(r, cx, cy) && (!r.overlay || i < t.n)).sort((a, b) => a.w * a.h - b.w * b.h);
    const own = cont.find((r) => r.overlay) || cont[0];
    if (own && own.layer !== 'world' && (t.x < own.x - 2 || t.y < own.y - 2 || t.x + t.w > own.x + own.w + 2 || t.y + t.h > own.y + own.h + 2)) add('text-overflow', `${where} in ${own.id} ${Math.round(own.w)}x${Math.round(own.h)}`);
    if (hit(t, RESERVED) && !(own && own.overlay)) add('text-reserved', where);
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
function done(name) {
  const mine = problems.filter((p) => p.startsWith(name));
  if (mine.length) { console.log(mine.map((p) => '  ' + p).join('\n')); }
  return mine.length;
}

// ---- helpers for scenarios ---------------------------------------------------------------------------------------
const flowFor = (h) => {
  const f = { RUN, route() { const ph = h.run.phase; h.app.go(['map', 'reward', 'graft', 'shop', 'forge', 'event', 'end'].includes(ph) ? ph : (ph === 'dead' || ph === 'won') ? 'end' : 'base', { run: h.run }); },
    openDeck() { h.app.push('deckview', {}); }, openSettings() {}, abandon() {}, saveMeta() {}, newRun() {}, toTitle() {}, openCodex() { h.app.push('codex', {}); } };
  h.app.shared.flow = f; return f;
};
const graftHeavy = (run, n = 8) => {
  let done = 0;
  for (const inst of run.deck) for (const g of GRAFT_LIST) { if (done >= n) return; if (CARDS[inst.id].type !== 'junk' && !inst.grafts.length && RUN.applyGraft(run, inst.uid, g.id, { keepPhase: true, free: true }).ok) { done++; break; } }
};
const hoverAt = (h, x, y, n = 4) => { h.app.mouse.x = x; h.app.mouse.y = y; frames(h.app, n); };

// ---- MAP ------------------------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) for (const act of [1, 2, 3]) {
  const h = await make({ scale, hero: ['marrow', 'wick', 'odile'][act - 1], seed: 'map' + act });
  const f = flowFor(h);
  RUN.startAct(h.run, act); h.run.relics = Object.keys(RELICS).slice(0, 12); h.run.potions = Object.keys(POTIONS).slice(0, 3);
  h.run.gold = 99999; graftHeavy(h.run, 9);
  f.route();
  look(h, 5, `map/s${scale}/a${act}/banner`);
  frames(h.app, 200);
  look(h, 5, `map/s${scale}/a${act}/idle`);
  for (const id of RUN.availableNodes(h.run)) { /* hover every available node */
    const n = h.run.map.nodes[id]; const m = h.app.screens.map;
    hoverAt(h, 350 + n.x * 580, 360); look(h, 2, `map/s${scale}/a${act}/hover`);
  }
  for (const [x, y] of [[60, 530], [60, 300], [1100, 450], [1100, 130]]) { hoverAt(h, x, y); look(h, 2, `map/s${scale}/a${act}/panelhover`); }
  if (scale === 100) { // scrolled to the top (boss) and the confirm modal
    h.app.mouse.x = 640; h.app.mouse.wheel = -3000; frames(h.app, 3); look(h, 3, `map/a${act}/scrolltop`);
    h.app.screens.map.confirm = true; look(h, 3, `map/a${act}/confirm`);
  }
}

// ---- REWARD ---------------------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) for (const kind of ['normal', 'elite', 'boss']) {
  const h = await make({ scale, seed: 'rw' + kind });
  flowFor(h); h.run.act = 3;
  const rw = RUN.fightRewards(h.run, kind, {});
  if (kind === 'normal') { rw.potion = Object.keys(POTIONS)[0]; }
  if (kind === 'elite') { rw.potion = Object.keys(POTIONS)[1]; rw.relic = Object.keys(RELICS)[3]; }
  if (kind === 'boss') { rw.potion = Object.keys(POTIONS)[2]; rw.relicChoices = Object.keys(RELICS).filter((id) => RELICS[id].rarity === 'boss').slice(0, 3); if (rw.relicChoices.length < 3) rw.relicChoices = Object.keys(RELICS).slice(0, 3); }
  go(h, 'reward');
  look(h, 80, `reward/s${scale}/${kind}`);
  hoverAt(h, 640, 160); look(h, 2, `reward/s${scale}/${kind}/hover`);
  if (kind === 'boss') { key(h.app, 'q'); look(h, 30, `reward/s${scale}/boss/picked`); }
}


// ---- GRAFT TABLE ----------------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) for (const four of [false, true]) {
  const h = await make({ scale, seed: 'gt' + four });
  flowFor(h); graftHeavy(h.run, four ? 9 : 2);
  if (four) h.run.relics.push('r_second_opinion');
  h.run.gold = 999;
  RUN.startGraftPick(h.run);
  go(h, 'graft');
  const tag = `graft/s${scale}/${four ? 4 : 3}`;
  look(h, 90, tag);
  const off = h.run.pending.offer, scr = h.app.current;
  key(h.app, '1'); key(h.app, 'q'); look(h, 40, tag + '/pair1');
  for (let j = 0; j < off.grafts.length; j++) { key(h.app, 'qwer'[j]); look(h, 30, tag + '/g' + j); }
  for (let i = 0; i < 3; i++) { key(h.app, String(i + 1)); look(h, 30, tag + '/c' + i); }
  hoverAt(h, 300, 280); look(h, 2, tag + '/hovercard'); hoverAt(h, 1000, 150); look(h, 2, tag + '/hoverpatch');
  key(h.app, 'Escape'); look(h, 10, tag + '/skip'); key(h.app, '1'); look(h, 5, tag + '/skip1');
}
let bad = 0;
for (const pre of ['map', 'reward', 'graft']) { console.log(pre + ':'); bad += done(pre); }
console.log('problems', bad);
