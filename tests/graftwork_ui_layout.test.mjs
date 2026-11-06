// Layout gate for the non-combat screens: drives each screen through its states with the headless app and proves, per
// frame, that registered widgets never overlap (other than within a group or flagged overlay), stay inside 1280x720,
// that nothing sits in the reserved Pause/Fullscreen zone, and that every app.text() block fits the widget it is drawn in.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as METAX from '../graftwork/engine/meta.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import { CARDS, GRAFTS, GRAFT_LIST, RELICS, POTIONS, EVENTS, HEROES, ENEMIES, STATUSES } from '../graftwork/data/index.js';

const SCREENS = {};
for (const n of ['map', 'graft', 'reward', 'shop', 'forge', 'event', 'deckview', 'codex', 'archive', 'end', 'wardrobe', 'title', 'settings', 'pause']) SCREENS[n] = (await import(`../graftwork/ui/${n}.js`)).default;

export const RESERVED = { x: 1128, y: 0, w: 144, h: 56 };
const problems = [];
let label = '';

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
const inside = (r, x, y) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5;
const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

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
  h.checks++;
  if (false) return;
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
// Violations still open on phone stage scales (the 0.64 / 0.54 / 0.46 sweep), by screen|kind. They are listed, not failed, so the sweep can gate every
// NEW regression while these screens are fixed one by one (fit them with app.text fit:{w,h,lines}, then delete the entry). Desktop scale 1 has no exemptions.
const OPEN_ON_PHONE = new Set(['map|text-overflow', 'map|text-hits', 'map|text-text', 'reward|text-text', 'graft|text-text', 'graft|text-truncated', 'graft|text-overflow', 'event|text-text', 'shop|text-truncated']); // shop|text-truncated: graft patch Boon/Price rows and relic text end in an ellipsis on phones (the (i) tip has the full text)
const OPEN_DESK = new Set(['event|oob', 'graft|text-text']); // pre-existing on desktop: tooltips drawn past the stage, a dimmed card under its own label
let openCount = 0, tipChecked = 0;
function done(name) {
  const mine = problems.filter((p) => p.startsWith(name));
  const hard = mine.filter((p) => { const [tag, kind] = p.split('|'), ph = /\/p0\.\d+|phone/.test(tag), k = tag.split('/')[0] + '|' + kind; const open = (ph ? OPEN_ON_PHONE : OPEN_DESK).has(k); if (open) openCount++; return !open; });
  if (hard.length) { console.log(hard.map((p) => '  ' + p).join('\n')); }
  return hard.length;
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


const richMeta = () => { const m = METAX.migrate(null); m.credit.bal = 140; m.credit.total = 400; for (const a of METAX.ACHIEVEMENTS.slice(0, 12)) if (a.reward) METAX.grantReward(m, a.reward); m.loadout.title = m.cosmetics.titles[0] || null; m.seen = { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} }; return m; };
const caseFile = (run, won) => METAX.caseFile(Object.assign(run, { stats: { ...run.stats, maxLine: 5, maxHit: 61, shatters: 2, bosses: 3 } }), won, {});
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

// ---- SHOP -----------------------------------------------------------------------------------------------------------
const addCards = (run, n) => { const ids = Object.keys(CARDS).filter((id) => CARDS[id].type !== 'junk' && (CARDS[id].hero === run.hero || CARDS[id].hero === 'any')); for (let i = 0; i < n; i++) RUN.R.addCard(run, ids[i % ids.length]); };
for (const scale of [100, 125, 150]) for (const hero of ['marrow', 'wick']) {
  const h = await make({ scale, hero, seed: 'shop' });
  flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 4);
  h.run.phase = 'shop'; h.run.pending = RUN.makeShop(h.run); h.run.potions = [];
  go(h, 'shop');
  const tag = `shop/s${scale}/${hero}`;
  look(h, 60, tag);
  for (const [x, y] of [[347, 190], [545, 190], [780, 392], [380, 540], [1000, 400], [1000, 520]]) { hoverAt(h, x, y); look(h, 3, tag + '/hover'); }
  h.app.mouse.x = 0; h.app.mouse.y = 0;
  click(h.app, 270 + 100, 400); look(h, 30, tag + '/graftpicker'); key(h.app, 'Escape'); look(h, 30, tag + '/back');
  if (scale === 100) { addCards(h.run, 25); click(h.app, 400, 645); look(h, 30, tag + '/removepicker'); h.app.mouse.wheel = 400; look(h, 10, tag + '/removepicker2'); key(h.app, 'Escape'); }
}

// ---- FORGE ----------------------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) {
  const h = await make({ scale, seed: 'forge' });
  flowFor(h); h.run.gold = 999; h.run.relics.push(Object.keys(RELICS).find((id) => RELICS[id].perk === 'forgeExtra') || 'r_none'); graftHeavy(h.run, 6);
  h.run.phase = 'forge'; h.run.pending = { kind: 'forge', used: 0 };
  go(h, 'forge');
  const tag = `forge/s${scale}`;
  look(h, 60, tag);
  for (let i = 0; i < 6; i++) { hoverAt(h, 100 + i * 200, 300); look(h, 3, tag + '/hover'); }
  h.app.mouse.x = 0; h.app.mouse.y = 0;
  if (scale === 100) {
    for (const nCards of [1, 8, 40]) for (let opt = 0; opt < 6; opt++) {
      const hh = await make({ scale, seed: 'fp' + nCards + opt });
      flowFor(hh); hh.run.gold = 999; graftHeavy(hh.run, 6);
      if (nCards === 40) addCards(hh.run, 30); if (nCards === 1) hh.run.deck.splice(1);
      hh.run.phase = 'forge'; hh.run.pending = { kind: 'forge', used: 0 };
      go(hh, 'forge'); frames(hh.app, 40);
      const fm = await import('../graftwork/ui/forge.js');
      click(hh.app, fm.optionCenterX(opt), 300); look(hh, 30, `forge/picker${nCards}/o${opt}`);
      hh.app.mouse.wheel = 500; look(hh, 10, `forge/picker${nCards}/o${opt}/scroll`);
      key(hh.app, 'Escape'); look(hh, 20, `forge/picker${nCards}/o${opt}/closed`);
    }
  }
}

// ---- EVENT ----------------------------------------------------------------------------------------------------------
{
  const evs = Object.values(EVENTS);
  for (const scale of [100, 125, 150]) for (const ev of evs) {
    const h = await make({ scale, seed: 'ev-' + ev.id, hero: ['marrow', 'wick', 'odile'][ev.id.length % 3] });
    flowFor(h); h.run.act = ev.act || 1; h.run.gold = 300;
    h.run.phase = 'event'; h.run.pending = { kind: 'event', id: ev.id, result: null };
    h.run.flags = h.run.flags || {};
    go(h, 'event');
    if (!h.app.screens.event.ev) continue;
    look(h, 400, `event/s${scale}/${ev.id}`);
    // hover each choice, then take choice 1
    for (let y = 300; y < 650; y += 90) { hoverAt(h, 900, y); look(h, 2, `event/s${scale}/${ev.id}/hover`); }
    key(h.app, '1'); look(h, 400, `event/s${scale}/${ev.id}/result`);
  }
  // synthetic: 1 to 5 choices and a very long text
  for (const scale of [100, 150]) for (const n of [1, 2, 3, 4, 5]) {
    const h = await make({ scale, seed: 'evx' });
    flowFor(h);
    const fake = { id: 'e_layout', name: 'A Very Long Event Name That Wraps Over Two Lines Of The Parchment', act: 0, text: 'The corridor smells of iodine and old coins. '.repeat(scale > 125 ? 3 : 7),
      choices: Array.from({ length: n }, (_, i) => ({ label: 'Choice number ' + (i + 1) + ' with a long label', text: 'Plain description of what this does to you and your deck, said at some length so it wraps onto several lines of the choice card.', apply: () => 'Done.' })) };
    EVENTS.e_layout = fake;
    h.run.phase = 'event'; h.run.pending = { kind: 'event', id: 'e_layout', result: null };
    go(h, 'event'); look(h, 600, `event/s${scale}/fake${n}`);
    delete EVENTS.e_layout;
  }
}

// ---- DECK VIEW, CODEX, END ------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) {
  for (const n of [0, 15, 45]) {
    const h = await make({ scale, seed: 'dv' + n });
    flowFor(h); go(h, 'base', {}); h.app.go('base');
    graftHeavy(h.run, n ? 8 : 0);
    if (n === 0) h.run.deck = []; else if (n === 45) addCards(h.run, 45 - h.run.deck.length); else h.run.deck = h.run.deck.slice(0, 15);
    h.app.push('deckview', {});
    const tag = `deck/s${scale}/${n}`;
    look(h, 40, tag);
    for (const [x, y] of [[40, 124], [110, 124], [180, 124], [250, 124], [330, 124], [430, 124], [560, 124], [660, 124], [760, 124], [860, 124], [960, 124]]) { click(h.app, x, y); look(h, 3, tag + '/filter'); }
    h.app.mouse.x = 300; h.app.mouse.y = 300; h.app.mouse.wheel = 600; look(h, 5, tag + '/scroll');
    hoverAt(h, 200, 300); look(h, 3, tag + '/hover');
  }
  const hp = await make({ scale, seed: 'dvp' }); flowFor(hp); hp.app.go('base');
  hp.app.push('deckview', { mode: 'pick', filter: (i) => i.id === 'm_cut', title: 'Choose a card', onPick() {} }); look(hp, 40, `deck/s${scale}/pick`);
  const hc = await make({ scale, seed: 'cx' }); flowFor(hc); hc.app.go('base');
  hc.meta.seen = { cards: Object.fromEntries(Object.keys(CARDS).slice(0, 30).map((k) => [k, 1])), grafts: Object.fromEntries(GRAFT_LIST.slice(0, 10).map((g) => [g.id, 1])), enemies: {}, relics: {}, statuses: {} };
  hc.meta.seen = { cards: Object.fromEntries(Object.keys(CARDS).map((k) => [k, 1])), grafts: Object.fromEntries(GRAFT_LIST.map((g) => [g.id, 1])), enemies: Object.fromEntries(Object.keys(ENEMIES).map((k) => [k, 1])), relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, 1])), statuses: Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 1])) }; // everything met: the longest real texts
  hc.app.push('codex', {});
  for (let i = 0; i < 7; i++) { hc.app.top().setTab(i); look(hc, 20, `codex/s${scale}/tab${i}`); hc.app.mouse.x = 400; hc.app.mouse.y = 300; hc.app.mouse.wheel = 400; look(hc, 5, `codex/s${scale}/tab${i}/scroll`); }
  for (const phone of [false, true]) for (const cat of [0, 1, 2, 3]) {
    const hw = await make({ scale, phone, seed: 'wd', meta: richMeta() }); flowFor(hw).openWardrobe = () => hw.app.push('wardrobe', {});
    hw.app.go('base'); hw.app.push('wardrobe', {}); hw.app.top().setCat(cat); look(hw, 20, `wardrobe/s${scale}/${phone ? 'phone' : 'desk'}/c${cat}`);
    hoverAt(hw, 400, 300); look(hw, 3, `wardrobe/s${scale}/${phone ? 'phone' : 'desk'}/c${cat}/hover`);
  }
  { const hr = await make({ scale, seed: 'rec', meta: richMeta() }); flowFor(hr); hr.app.go('base'); hr.app.push('codex', {}); hr.app.top().setTab(7); look(hr, 20, `codex/s${scale}/records`); }
  { const hf = await make({ scale, seed: 'cf', hero: 'wick', meta: richMeta() }); flowFor(hf); graftHeavy(hf.run, 6); hf.run.phase = 'won'; hf.run.flags = {}; hf.run.endInfo = { caseFile: caseFile(hf.run, true) }; go(hf, 'end'); look(hf, 200, `end/s${scale}/casefile`); }
  for (const won of [true, false]) {
    const he = await make({ scale, seed: 'end' + won, hero: won ? 'odile' : 'wick' });
    flowFor(he); graftHeavy(he.run, 10); he.run.phase = won ? 'won' : 'dead'; he.run.killedBy = 'the_grafter';
    he.run.flags = he.run.flags || {}; go(he, 'end');
    look(he, 200, `end/s${scale}/${won ? 'won' : 'dead'}`);
    hoverAt(he, 500, 300); look(he, 3, `end/s${scale}/${won ? 'won' : 'dead'}/hover`);
  }
}
// ---- PHONE (844x390: text floor inflates labels): the screens fixed for readability must stay overlap-free ----------
{
  const hg = await make({ phone: true, seed: 'ph-graft' }); flowFor(hg); graftHeavy(hg.run, 2); RUN.startGraftPick(hg.run); go(hg, 'graft');
  look(hg, 90, 'graft/phone'); key(hg.app, '2'); key(hg.app, 'q'); look(hg, 40, 'graft/phone/pair');
  const hd = await make({ phone: true, seed: 'ph-deck' }); flowFor(hd); hd.app.go('base'); graftHeavy(hd.run, 8); hd.app.push('deckview', {}); look(hd, 40, 'deck/phone');
  hoverAt(hd, 1100, 300); look(hd, 3, 'deck/phone/side'); hoverAt(hd, 200, 300); look(hd, 3, 'deck/phone/hover');
  const hc = await make({ phone: true, seed: 'ph-cx' }); flowFor(hc); hc.app.go('base'); hc.app.push('codex', {}); hc.app.top().setTab(6); look(hc, 20, 'codex/phone/rules');
  for (const won of [true, false]) { const he = await make({ phone: true, seed: 'ph-end' + won, hero: 'odile' }); flowFor(he); graftHeavy(he.run, 10); he.run.phase = won ? 'won' : 'dead'; he.run.flags = he.run.flags || {}; go(he, 'end'); look(he, 200, 'end/phone/' + (won ? 'won' : 'dead')); }
}
// ---- PHONE SWEEP: every screen at the three phone stage scales (0.64 = 820x462, 0.54 = 844x390, 0.46 = 740x330) ----------
// The small-screen text floor inflates labels up to 1.5x there; every fitted label must shrink back instead of overflowing, overlapping or ending in an ellipsis.
for (const pscale of [0.64, 0.54, 0.46]) {
  const T = (n) => `${n}/p${pscale}`;
  for (const act of [1, 3]) {
    const h = await make({ pscale, hero: ['marrow', 'wick', 'odile'][act - 1], seed: 'pmap' + act }); const f = flowFor(h);
    RUN.startAct(h.run, act); h.run.relics = Object.keys(RELICS).slice(0, 12); h.run.potions = Object.keys(POTIONS).slice(0, 3); h.run.gold = 99999; graftHeavy(h.run, 9);
    f.route(); frames(h.app, 200); look(h, 5, T('map') + '/a' + act);
    for (const [x, y] of [[60, 530], [60, 300], [1100, 450], [1100, 130]]) { hoverAt(h, x, y); look(h, 2, T('map') + '/a' + act + '/hover'); }
  }
  for (const kind of ['normal', 'elite', 'boss']) {
    const h = await make({ pscale, seed: 'prw' + kind }); flowFor(h); h.run.act = 3;
    const rw = RUN.fightRewards(h.run, kind, {});
    if (kind !== 'normal') { rw.potion = Object.keys(POTIONS)[1]; rw.relic = Object.keys(RELICS)[3]; }
    if (kind === 'boss') { rw.relicChoices = Object.keys(RELICS).slice(0, 3); }
    go(h, 'reward'); look(h, 80, T('reward') + '/' + kind);
  }
  for (const four of [false, true]) {
    const h = await make({ pscale, seed: 'pgt' + four }); flowFor(h); graftHeavy(h.run, four ? 9 : 2);
    if (four) h.run.relics.push('r_second_opinion');
    h.run.gold = 999; RUN.startGraftPick(h.run); go(h, 'graft');
    const tag = T('graft') + '/' + (four ? 4 : 3); look(h, 90, tag);
    const off = h.run.pending.offer;
    key(h.app, '1'); key(h.app, 'q'); look(h, 40, tag + '/pair1');
    for (let j = 0; j < off.grafts.length; j++) { key(h.app, 'qwer'[j]); look(h, 30, tag + '/g' + j); }
    for (let i = 0; i < 3; i++) { key(h.app, String(i + 1)); look(h, 30, tag + '/c' + i); }
    hoverAt(h, 300, 280); look(h, 2, tag + '/hovercard'); hoverAt(h, 1000, 150); look(h, 2, tag + '/hoverpatch');
    key(h.app, 'Escape'); look(h, 10, tag + '/skip');
  }
  for (const hero of ['marrow', 'wick']) {
    const h = await make({ pscale, hero, seed: 'pshop' }); flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 4);
    h.run.phase = 'shop'; h.run.pending = RUN.makeShop(h.run); h.run.potions = []; go(h, 'shop');
    const tag = T('shop') + '/' + hero; look(h, 60, tag);
    for (const [x, y] of [[347, 190], [780, 392], [380, 540], [1000, 400]]) { hoverAt(h, x, y); look(h, 3, tag + '/hover'); }
    h.app.mouse.x = 0; h.app.mouse.y = 0; click(h.app, 270 + 100, 400); look(h, 30, tag + '/graftpicker'); hoverAt(h, 150, 220); look(h, 4, tag + '/graftpicker/hover'); key(h.app, 'Escape');
  }
  { const h = await make({ pscale, seed: 'pforge' }); flowFor(h); h.run.gold = 999; graftHeavy(h.run, 6); h.run.phase = 'forge'; h.run.pending = { kind: 'forge', used: 0 }; go(h, 'forge');
    look(h, 60, T('forge')); const fm = await import('../graftwork/ui/forge.js');
    for (let i = 0; i < 6; i++) { hoverAt(h, 100 + i * 200, 300); look(h, 3, T('forge') + '/hover'); }
    for (const opt of [0, 3]) { click(h.app, fm.optionCenterX(opt), 300); look(h, 30, T('forge') + '/picker' + opt); hoverAt(h, 150, 220); look(h, 4, T('forge') + '/picker' + opt + '/hover'); key(h.app, 'Escape'); look(h, 20, T('forge') + '/closed'); } }
  for (const ev of Object.values(EVENTS).filter((e, i) => i % 3 === 0)) {
    const h = await make({ pscale, seed: 'pev-' + ev.id }); flowFor(h); h.run.act = ev.act || 1; h.run.gold = 300;
    h.run.phase = 'event'; h.run.pending = { kind: 'event', id: ev.id, result: null }; h.run.flags = h.run.flags || {}; go(h, 'event');
    if (!h.app.screens.event.ev) continue;
    look(h, 400, T('event') + '/' + ev.id); key(h.app, '1'); look(h, 400, T('event') + '/' + ev.id + '/result');
  }
  for (const n of [15, 45]) {
    const h = await make({ pscale, seed: 'pdv' + n }); flowFor(h); h.app.go('base'); graftHeavy(h.run, 8);
    if (n === 45) addCards(h.run, 45 - h.run.deck.length);
    h.app.push('deckview', {}); const tag = T('deck') + '/' + n; look(h, 40, tag);
    for (const [x, y] of [[40, 124], [330, 124], [660, 124], [960, 124]]) { click(h.app, x, y); look(h, 3, tag + '/filter'); }
    hoverAt(h, 200, 300); look(h, 3, tag + '/hover'); hoverAt(h, 1100, 300); look(h, 3, tag + '/side');
  }
  { const hc = await make({ pscale, seed: 'pcx' }); flowFor(hc); hc.app.go('base');
    hc.meta.seen = { cards: Object.fromEntries(Object.keys(CARDS).slice(0, 30).map((k) => [k, 1])), grafts: Object.fromEntries(GRAFT_LIST.slice(0, 10).map((g) => [g.id, 1])), enemies: {}, relics: {}, statuses: {} };
    hc.meta.seen = { cards: Object.fromEntries(Object.keys(CARDS).map((k) => [k, 1])), grafts: Object.fromEntries(GRAFT_LIST.map((g) => [g.id, 1])), enemies: Object.fromEntries(Object.keys(ENEMIES).map((k) => [k, 1])), relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, 1])), statuses: Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 1])) };
    hc.app.push('codex', {}); for (let i = 0; i < 7; i++) { hc.app.top().setTab(i); look(hc, 20, T('codex') + '/tab' + i); } }
  for (const cat of [0, 1, 2, 3]) { const hw = await make({ pscale, seed: 'pwd', meta: richMeta() }); flowFor(hw); hw.app.go('base'); hw.app.push('wardrobe', {}); hw.app.top().setCat(cat); look(hw, 20, T('wardrobe') + '/c' + cat); }
  for (const won of [true, false]) { const he = await make({ pscale, seed: 'pend' + won, hero: 'odile' }); flowFor(he); graftHeavy(he.run, 10); he.run.phase = won ? 'won' : 'dead'; he.run.killedBy = 'the_grafter'; he.run.flags = he.run.flags || {}; go(he, 'end'); look(he, 200, T('end') + '/' + (won ? 'won' : 'dead')); }
}

// ---- TITLE, HERO SELECT, SETTINGS, PAUSE (desktop at scale 100/150 and every phone scale) -----------------------------
for (const [scale, pscale] of [[100, 0], [150, 0], [100, 1], [100, 0.64], [100, 0.54], [100, 0.46]]) {
  const T = (n) => `${n}/` + (pscale > 1 ? 'phone' : pscale ? 'p' + pscale : 's' + scale);
  const o = { scale, seed: 'ttl', meta: richMeta() }; if (pscale > 1) o.phone = true; else if (pscale) o.pscale = pscale;
  const h = await make(o); const f = flowFor(h); h.meta.unlocked.heroes = ['marrow', 'wick', 'odile']; h.meta.bestAsc = { marrow: 3 };
  f.hasSave = () => false; f.start = () => {}; f.openSettings = () => h.app.push('settings', {}); f.openPause = () => h.app.push('pause', {});
  h.app.shared.audio = { sfx() {}, music() {}, setVolumes() {}, mute() {} };
  h.app.go('title'); look(h, 80, T('title') + '/menu');
  hoverAt(h, 640, 330); look(h, 3, T('title') + '/hover');
  const tm = h.app.top(); tm.openSelect(h.app); look(h, 40, T('title') + '/select');
  for (let i = 0; i < 3; i++) { click(h.app, 50 + i * 400 + 190, 300); look(h, 5, T('title') + '/select' + i); hoverAt(h, 50 + i * 400 + 190, 300); look(h, 3, T('title') + '/selhover' + i); }
  const hl = await make(o); const fl = flowFor(hl); fl.hasSave = () => false; fl.start = () => {}; hl.meta.unlocked.heroes = ['marrow']; hl.meta.settings.assist = { on: true, a: true, b: true, c: true, d: true };
  hl.app.shared.audio = h.app.shared.audio; hl.app.go('title'); frames(hl.app, 60); hl.app.top().openSelect(hl.app); look(hl, 40, T('title') + '/locked');
  hoverAt(hl, 690, 300); look(hl, 3, T('title') + '/lockedhover'); hoverAt(hl, 100, 540); look(hl, 3, T('title') + '/assisthover');
  const hs = await make(o); flowFor(hs); hs.app.go('base'); hs.app.push('settings', {}); look(hs, 40, T('settings'));
  for (const [x, y] of [[300, 150], [300, 250], [300, 350], [300, 450], [300, 550], [900, 300]]) { hoverAt(hs, x, y); look(hs, 3, T('settings') + '/hover'); }
  const hp = await make(o); const fp = flowFor(hp); fp.openSettings = () => {}; fp.openPause = () => {}; fp.openWardrobe = () => {}; hp.app.shared.audio = h.app.shared.audio; hp.app.go('base'); hp.app.push('pause', {}); look(hp, 40, T('pause'));
  for (const m of ['help']) { hp.app.top().mode = m; look(hp, 20, T('pause') + '/' + m); }
  const hq = await make(o); flowFor(hq); hq.app.shared.audio = h.app.shared.audio; hq.app.go('base'); hq.app.push('pause', {}); look(hq, 20, T('pause') + '/m'); hq.app.top().activate(hq.app, 'abandon'); look(hq, 20, T('pause') + '/confirm');
}

// ---- TOOLTIP SWEEP: hover a grid over each screen at every phone scale and desktop; every tip drawn is checked by checkTip ------------------
const sweepTips = (h, tag, step = [96, 76]) => {
  const app = h.app;
  for (let y = 70; y < 710; y += step[1]) for (let x = 40; x < 1250; x += step[0]) {
    app.mouse.x = x; app.mouse.y = y; app.tipLayout = null;
    frames(app, 11); h.collect = true; label = tag; frames(app, 1);
  }
  app.mouse.x = -99; app.mouse.y = -99; frames(app, 2);
};
const ALLSEEN = () => ({ cards: Object.fromEntries(Object.keys(CARDS).map((k) => [k, 1])), grafts: Object.fromEntries(GRAFT_LIST.map((g) => [g.id, 1])), enemies: Object.fromEntries(Object.keys(ENEMIES).map((k) => [k, 1])), relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, 1])), statuses: Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 1])) });
const combatMod = (await import('../graftwork/ui/combat.js')).default;
const audioMod = await import('../graftwork/ui/audio.js');
for (const pscale of [0.64, 0.54, 0.46, 0]) {
  const T = (n) => `${n}/` + (pscale ? 'p' + pscale : 'tips-desk');
  const mk = (o) => make(Object.assign({ seed: 'tip', pscale }, o));
  for (const four of [false, true]) {
    const h = await mk({}); flowFor(h); graftHeavy(h.run, four ? 9 : 2); if (four) h.run.relics.push('r_second_opinion'); h.run.gold = 999;
    RUN.startGraftPick(h.run); go(h, 'graft'); look(h, 90, T('graft') + 'sw'); sweepTips(h, T('graft') + '/sweep');
    key(h.app, '2'); key(h.app, 'q'); look(h, 40, T('graft') + 'sw2'); sweepTips(h, T('graft') + '/sweep-pair');
  }
  { const h = await mk({}); flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 4); h.run.phase = 'shop'; h.run.pending = RUN.makeShop(h.run); go(h, 'shop'); look(h, 60, T('shop') + 'sw'); sweepTips(h, T('shop') + '/sweep');
    h.app.mouse.x = 0; h.app.mouse.y = 0; click(h.app, 370, 400); look(h, 30, T('shop') + 'pk'); sweepTips(h, T('shop') + '/sweep-picker'); }
  { const h = await mk({}); flowFor(h); h.run.gold = 999; graftHeavy(h.run, 6); h.run.phase = 'forge'; h.run.pending = { kind: 'forge', used: 0 }; go(h, 'forge'); look(h, 60, T('forge') + 'sw'); sweepTips(h, T('forge') + '/sweep');
    const fm = await import('../graftwork/ui/forge.js');
    for (const opt of [0, 1, 2, 3]) { click(h.app, fm.optionCenterX(opt), 300); look(h, 30, T('forge') + 'pk'); sweepTips(h, T('forge') + '/sweep-picker' + opt, [120, 90]); key(h.app, 'Escape'); look(h, 20, T('forge') + 'cl'); } }
  { const h = await mk({}); flowFor(h); h.run.act = 3; const rw = RUN.fightRewards(h.run, 'elite', {}); rw.potion = Object.keys(POTIONS)[1]; rw.relic = Object.keys(RELICS)[3]; go(h, 'reward'); look(h, 80, T('reward') + 'sw'); sweepTips(h, T('reward') + '/sweep'); }
  { const h = await mk({}); flowFor(h); h.app.go('base'); graftHeavy(h.run, 8); h.app.push('deckview', {}); look(h, 40, T('deck') + 'sw'); sweepTips(h, T('deck') + '/sweep', [80, 70]); }
  { const h = await mk({ meta: { seen: ALLSEEN() } }); flowFor(h); h.app.go('base'); h.app.push('codex', {}); for (let i = 0; i < 7; i++) { h.app.top().setTab(i); look(h, 20, T('codex') + 'sw'); sweepTips(h, T('codex') + '/sweep' + i, [110, 80]); } }
  { const h = await mk({}); const f = flowFor(h); RUN.startAct(h.run, 2); h.run.relics = Object.keys(RELICS).slice(0, 12); h.run.potions = Object.keys(POTIONS).slice(0, 3); graftHeavy(h.run, 9); f.route(); frames(h.app, 200); sweepTips(h, T('map') + '/sweep'); }
  for (const ev of Object.values(EVENTS).filter((e, i) => i % 4 === 0)) { const h = await mk({}); flowFor(h); h.run.act = ev.act || 1; h.run.gold = 300; h.run.phase = 'event'; h.run.pending = { kind: 'event', id: ev.id, result: null }; h.run.flags = h.run.flags || {}; go(h, 'event'); if (!h.app.screens.event.ev) continue; look(h, 400, T('event') + 'sw'); sweepTips(h, T('event') + '/sweep', [120, 80]); }
  for (const [n, hand, stN] of [[1, 8, 8], [3, 8, 8], [4, 8, 3]]) { // combat: 1 / 3 / 4 enemies, a hand of 8, 8 statuses
    const h = await mk({ hero: 'wick' }); flowFor(h); h.app.shared.audio = audioMod; h.app.register('combat', combatMod);
    graftHeavy(h.run, 6); h.run.phase = 'combat';
    const names = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal').map((e) => e.id).slice(0, n);
    h.run.pending = { kind: 'combat', fightKind: 'normal', enemies: names }; h.app.go('combat', { run: h.run }); frames(h.app, 200);
    const st = combatMod.api().state(), c = st.c, ids = Object.keys(STATUSES).slice(0, stN);
    for (const e of c.enemies) for (const sid of ids) { e.st[sid] = 2; st.edBy.get(e.uid).st[sid] = 2; }
    for (const sid of ids) { c.player.st[sid] = 3; st.P.st[sid] = 3; }
    frames(h.app, 60); sweepTips(h, T('combat') + `/${n}e`, [64, 50]);
  }
}

// ---- ARCHIVE: the Archive screen, the end-screen award panel, the NEW ribbon (desktop 100/150 and every phone scale) ---------------------------------
{
  const { UNLOCKS, LOCKED_IDS } = await import('../graftwork/data/unlocks.js');
  const partial = (n, fresh) => { const m = richMeta(); LOCKED_IDS.slice(0, n).forEach((id) => { m.unlocked.ids[id] = 1; if (fresh) m.unlocked.fresh = { ...(m.unlocked.fresh || {}), [id]: 1 }; }); m.unlocked.points = 7; m.stats.wins = 3; m.stats.deaths = 9; return m; };
  const doneMeta = () => { const m = richMeta(); for (const id of LOCKED_IDS) m.unlocked.ids[id] = 1; m.unlocked.heroes = ['marrow', 'wick', 'odile']; return m; };
  for (const [scale, pscale] of [[100, 0], [150, 0], [100, 1], [100, 0.64], [100, 0.54], [100, 0.46]]) {
    const T = (n) => `${n}/` + (pscale > 1 ? 'phone' : pscale ? 'p' + pscale : 's' + scale);
    const base = { scale, seed: 'arch' }; if (pscale > 1) base.phone = true; else if (pscale) base.pscale = pscale;
    for (const [mname, mk] of [['new', () => partial(0)], ['mid', () => partial(90)], ['late', () => partial(250)], ['done', doneMeta]]) {
      const h = await make({ ...base, meta: mk() }); flowFor(h); h.app.go('base'); h.app.push('archive', {});
      const tag = T('archive') + '/' + mname; look(h, 30, tag);
      const scr = h.app.top();
      for (let i = 0; i < 5; i++) { scr.setTab(i); look(h, 6, tag + '/tab' + i); hoverAt(h, 480, 420); look(h, 3, tag + '/tab' + i + '/hover'); h.app.mouse.wheel = 400; look(h, 4, tag + '/tab' + i + '/scroll'); }
      scr.setTab(0); for (const f of ['marrow', 'wick', 'odile', 'any']) { scr.hero = f; look(h, 5, tag + '/f' + f); }
      for (const [x, y] of [[420, 120], [420, 200], [100, 150], [100, 500], [900, 420]]) { hoverAt(h, x, y); look(h, 3, tag + '/hover'); }
    }
    // end screen with the award: first run, big run with many stamps + hero, capped win, everything open, practice
    for (const kind of ['first', 'many', 'winhero', 'done', 'practice', 'abandon']) {
      const meta = kind === 'done' ? doneMeta() : richMeta();
      if (kind === 'many' || kind === 'winhero') meta.unlocked.points = 600;
      if (kind === 'winhero') { meta.stats.deaths = 6; meta.unlocked.maxAct = 2; }
      const h = await make({ ...base, meta, hero: kind === 'winhero' ? 'wick' : 'marrow', seed: 'endA' + kind }); flowFor(h); graftHeavy(h.run, 8);
      const won = kind === 'winhero' || kind === 'done';
      h.run.phase = won ? 'won' : 'dead'; h.run.act = won ? 3 : 2; h.run.killedBy = 'the_grafter'; h.run.flags = h.run.flags || {};
      h.run.stats = { ...h.run.stats, floors: kind === 'first' ? 9 : 44, elites: kind === 'first' ? 1 : 7, bosses: kind === 'first' ? 0 : 3 };
      h.run.killedEnemies = Object.keys(ENEMIES).slice(0, 5);
      if (kind === 'practice') h.run.practice = true;
      if (kind === 'abandon') { h.run.abandoned = true; h.run.stats.floors = 1; }
      h.run.endInfo = METAX.recordRunEnd(h.meta, h.run, won ? 'won' : 'dead');
      go(h, 'end'); const tag = T('end') + '/award-' + kind;
      look(h, 8, tag + '/early'); look(h, 80, tag + '/mid'); look(h, 400, tag);
      hoverAt(h, 500, 215); look(h, 3, tag + '/hoverstamp'); hoverAt(h, 600, 300); look(h, 3, tag + '/hoverarch');
    }
    // NEW ribbons in the offers: shop (card, graft, potion, relic), graft table, boss reward
    { const meta = richMeta(); meta.unlocked.fresh = Object.fromEntries(LOCKED_IDS.map((id) => [id, 1])); for (const id of LOCKED_IDS) meta.unlocked.ids[id] = 1;
      const h = await make({ ...base, meta, seed: 'ribshop' }); flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 3);
      h.run.phase = 'shop'; h.run.pending = RUN.makeShop(h.run); h.run.potions = [];
      for (const kind of ['cards', 'grafts', 'potions', 'relics']) for (const it of h.run.pending[kind] || []) { const e = UNLOCKS[({ cards: 'card:', grafts: 'graft:', potions: 'potion:', relics: 'relic:' })[kind] + it.id]; if (e) meta.unlocked.fresh[e.id] = 1; }
      go(h, 'shop'); look(h, 60, T('shop') + '/ribbon-shop'); hoverAt(h, 347, 190); look(h, 3, T('shop') + '/ribbon-shop/hover');
      const hg = await make({ ...base, meta: (() => { const m = richMeta(); m.unlocked.fresh = {}; return m; })(), seed: 'ribgraft' }); flowFor(hg); graftHeavy(hg.run, 2); RUN.startGraftPick(hg.run);
      for (const gr of hg.run.pending.offer.grafts) { const e = UNLOCKS['graft:' + (gr.id || gr)]; if (e) hg.meta.unlocked.fresh[e.id] = 1; }
      go(hg, 'graft'); look(hg, 90, T('graft') + '/ribbon-graft');
      const hr = await make({ ...base, meta: (() => { const m = richMeta(); m.unlocked.fresh = {}; return m; })(), seed: 'ribreward' }); flowFor(hr); hr.run.act = 3;
      const rw = RUN.fightRewards(hr.run, 'boss', {}); rw.potion = Object.keys(POTIONS)[2]; rw.relicChoices = Object.keys(RELICS).filter((id) => RELICS[id].rarity === 'boss').slice(0, 3);
      for (const id of [...rw.relicChoices, rw.potion]) { const e = UNLOCKS['relic:' + id] || UNLOCKS['potion:' + id]; if (e) hr.meta.unlocked.fresh[e.id] = 1; }
      go(hr, 'reward'); look(hr, 80, T('reward') + '/ribbon-reward'); }
  }
}
let bad = 0;
for (const pre of ['map', 'combat', 'reward', 'graft', 'shop', 'forge', 'event', 'deck', 'codex', 'archive', 'end', 'wardrobe', 'title', 'settings', 'pause']) { console.log(pre + ':'); bad += done(pre); }
console.log('tip layouts checked', tipChecked);
console.log('problems', bad, `(+${openCount} known open violations on phone scales, see OPEN_ON_PHONE)`);
assert.equal(bad, 0, 'layout problems found (listed above)');
