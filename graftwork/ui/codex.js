// CODEX: modal reference book (flow.openCodex()). Tabs: Cards / Grafts / Relics / Enemies / Statuses / Schools / Rules.
// Entries not yet in meta.seen[kind][id] show as silhouettes with a hint. Type to search (seen entries only).
import { tscale } from './graft_parts.js';
import { COL, W, H, rgba } from './core.js';
import { drawCard, drawGraftPatch, drawSchoolGlyph, CARD_W, CARD_H } from '../art/cards.js';
import { drawStatus, drawRelic } from '../art/icons.js';
import { drawEnemy, enemyBounds } from '../art/enemies.js';
import { CARDS, GRAFTS, RELICS, ENEMIES, STATUSES, SCHOOLS, HEROES, GRAFT_LIST } from '../data/index.js';
import { cardSpec } from '../engine/cards.js';
import { drawSeamBadge } from './seam_ui.js';
import { drawVellum, drawEmptyMark } from '../art/plates.js';
import { statusText, opText } from '../engine/text.js';
import { glossTip } from './tooltips.js';
import { cardGrid, gridKey, scrollArea, inView, pill, gaugeCells } from './deckview.js';
import { lnw } from '../art/linework.js';
import { isItemUnlocked, lockedHint } from '../engine/unlock.js';
import { categoryCounts, padlock } from './archive_kit.js';
const GATE_KIND = { cards: 'card', grafts: 'graft', relics: 'relic' };

const TABS = ['Cards', 'Grafts', 'Relics', 'Enemies', 'Statuses', 'Schools', 'Rules', 'Records'];
// Rules words an entry names, for the hover glossary: [texts, options]
function entryGloss(kind, id, d) {
  if (kind === 'grafts') return [[d.boon, d.price, String(d.tier || '').toUpperCase(), 'W' + d.weight], { school: d.school }];
  if (kind === 'relics') return [[d.text], {}];
  if (kind === 'statuses') return [[], { ids: [id] }];
  if (kind === 'enemies') return [Object.values(d.moves || {}).flatMap((m) => [m.name, m.note, m.tip, ...(m.fx || []).map((op) => { try { return opText(op, 0); } catch (e) { return ''; } })]), {}];
  return [[], {}];
}
const KINDS = ['cards', 'grafts', 'relics', 'enemies', 'statuses'];
const KEYS = { cards: CARDS, grafts: GRAFTS, relics: RELICS, enemies: ENEMIES, statuses: STATUSES };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------- seen bookkeeping
function runOwns(run, kind, id) {
  if (!run) return false;
  if (kind === 'cards') return run.deck.some((i) => i.id === id);
  if (kind === 'grafts') return run.deck.some((i) => i.grafts.includes(id));
  if (kind === 'relics') return (run.relics || []).includes(id);
  return false;
}
export function isSeen(app, kind, id) {
  if (kind === 'statuses') return true; // statuses are rules, not secrets: every one has a readable glossary entry
  const m = app.shared.meta, s = m && m.seen && m.seen[kind];
  return !!((s && s[id]) || runOwns(app.shared.run, kind, id));
}
// Locked = the Archive has not opened it yet (hint says how); unseen = open but never offered to you. Locked wins only while the entry is not seen.
export function isLocked(app, kind, id) { const k = GATE_KIND[kind]; return !!k && !isSeen(app, kind, id) && !isItemUnlocked(app.shared.meta, k, id); }
function seenCount(app, kind) { return Object.keys(KEYS[kind]).filter((id) => isSeen(app, kind, id)).length; }

// ---------------------------------------------------------------- filters
const SCHOOL_IDS = () => Object.keys(SCHOOLS);
const FILTERS = {
  cards: [['all', 'All'], ['marrow', 'Marrow'], ['wick', 'Wick'], ['odile', 'Odile'], ['any', 'Neutral'], ['junk', 'Junk']],
  grafts: () => [['all', 'All'], ...SCHOOL_IDS().map((s) => [s, SCHOOLS[s].name])],
  relics: [['all', 'All'], ['start', 'Starter'], ['common', 'Common'], ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['boss', 'Boss'], ['shop', 'Shop']],
  enemies: [['all', 'All'], ['1', 'Act 1'], ['2', 'Act 2'], ['3', 'Act 3'], ['elite', 'Elites'], ['boss', 'Bosses']],
  statuses: [['all', 'All'], ['good', 'Boons'], ['bad', 'Banes']],
};
function filtersFor(kind) { const f = FILTERS[kind]; return typeof f === 'function' ? f() : f; }
function passes(kind, f, d) {
  if (f === 'all') return true;
  if (kind === 'cards') return f === 'junk' ? d.rarity === 'junk' : f === 'any' ? d.hero === 'any' && d.rarity !== 'junk' : d.hero === f;
  if (kind === 'grafts') return d.school === f;
  if (kind === 'relics') return d.rarity === f;
  if (kind === 'enemies') return f === 'elite' || f === 'boss' ? d.kind === f : String(d.act) === f;
  if (kind === 'statuses') return f === 'good' ? d.good : !d.good;
  return true;
}
const hintFor = {
  cards: (d) => `${d.rarity === 'junk' ? 'A junk card' : `A ${d.rarity} ${d.type}`}${d.hero && d.hero !== 'any' ? ` of ${HEROES[d.hero] ? HEROES[d.hero].name : d.hero}` : ''}. Find it in a reward, shop or event.`,
  grafts: (d) => `A ${d.tier} ${SCHOOLS[d.school] ? SCHOOLS[d.school].name : ''} graft. Weight ${d.weight}. Be offered it to learn it.`,
  relics: (d) => `A ${d.rarity === 'start' ? 'starter' : d.rarity} relic. Elites, bosses and shops carry them.`,
  enemies: (d) => `An Act ${d.act} ${d.kind}. Meet it to learn its moves.`,
  statuses: () => 'A status effect. Meet it in combat.',
};

// ---------------------------------------------------------------- silhouettes
const silCache = new Map();
function enemySilhouette(def, sc) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const key = def.id + '|' + sc.toFixed(2);
  if (silCache.has(key)) return silCache.get(key);
  const cv = document.createElement('canvas'); cv.width = 130; cv.height = 150;
  const g = cv.getContext('2d'); if (!g) return null;
  drawEnemy(g, def, 65, 142, { scale: sc, t: 0 });
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#0c0a09'; g.fillRect(0, 0, 130, 150);
  silCache.set(key, cv); return cv;
}
function qmark(app, x, y, size, color) { app.text('?', x, y - size * 0.62, { size, bold: true, align: 'center', color: color || 'rgba(232,220,196,.35)' }); }

function unknownCard(app, ctx, cx, cy, sc, hot, locked) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
  app.rr(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14); ctx.fillStyle = hot ? 'rgba(34,27,23,.8)' : 'rgba(21,17,15,.7)'; ctx.fill();
  ctx.lineWidth = lnw(4); ctx.strokeStyle = 'rgba(232,220,196,.22)'; ctx.setLineDash([14, 9]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  if (locked) padlock(ctx, cx, cy + 6, 1.7 * sc / 0.56 * 0.6); else qmark(app, cx, cy + 10, 64 * sc / 0.56 * 0.6);
}

// ---------------------------------------------------------------- list cells
// Cell text is stacked from measured heights (app.text returns the height it drew), and every cell grows with the effective text size (phones, large text),
// so name, details and rules never share pixels. Long texts are fitted to the cell width (shrink, then wrap, then a soft ellipsis; tooltips carry the full text).
const LHT = (app, size, o) => Math.round(app.sz(size, o) * 1.22);
const growOf = (app) => Math.max(1, app.sz(13, { ui: true }) / 13);
const CELLS = {
  grafts: { h: 112, draw(app, ctx, id, d, seen, x, y, w, h) {
    if (!seen) {
      app.rr(x + 8, y + 8, 124, h - 16, 14); ctx.fillStyle = '#15110f'; ctx.fill(); ctx.setLineDash([8, 6]); ctx.lineWidth = lnw(2); ctx.strokeStyle = 'rgba(232,220,196,.25)'; ctx.stroke(); ctx.setLineDash([]);
      if (isLocked(app, 'grafts', id)) padlock(ctx, x + 70, y + h / 2, 2.2); else qmark(app, x + 70, y + h / 2, 44);
      const lk = isLocked(app, 'grafts', id);
      app.text(lk ? 'Locked graft' : 'Unknown graft', x + 146, y + 12, { size: 17, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: w - 158, lines: 1 } });
      app.text(lk ? lockedHint(id) : hintFor.grafts(d), x + 146, y + 12 + LHT(app, 17, { bold: true }) + 6, { size: 13, ui: true, italic: true, lineH: 16, color: 'rgba(232,220,196,.55)', fit: { w: w - 158, lines: 3, soft: true } });
      return;
    }
    drawGraftPatch(ctx, d, x + 8, y + 10, 128, h - 20);
    const col = COL[d.school] || COL.vellum, tx = x + 148, tw = w - 160;
    let yy = y + 8;
    yy += app.text(d.name, tx, yy, { size: 17, bold: true, color: COL.vellum, fit: { w: tw, lines: 1 } }) + 3;
    drawSchoolGlyph(ctx, d.school, tx + 7, yy + LHT(app, 12, { ui: true }) / 2, 6, col);
    yy += app.text(`${(SCHOOLS[d.school] || {}).name} · Weight ${d.weight} · ${cap(d.tier)}`, tx + 18, yy, { size: 12, ui: true, color: 'rgba(232,220,196,.7)', fit: { w: tw - 18, lines: 1 } }) + 5;
    const lc = Math.ceil(Math.max(app.measure('Boon', 12, { ui: true, bold: true }), app.measure('Price', 12, { ui: true, bold: true }))) + 8;
    app.text('Boon', tx, yy, { size: 12, ui: true, bold: true, color: COL.good });
    yy += Math.max(LHT(app, 12, { ui: true }), app.text(d.boon, tx + lc, yy, { size: 13, ui: true, lineH: 15, color: COL.vellum, fit: { w: tw - lc, lines: 2, soft: true } })) + 4;
    app.text('Price', tx, yy, { size: 12, ui: true, bold: true, color: COL.bad });
    app.text(d.price, tx + lc, yy, { size: 13, ui: true, lineH: 15, color: '#ffb0b0', fit: { w: tw - lc, lines: 2, soft: true } });
  } },
  relics: { h: 96, draw(app, ctx, id, d, seen, x, y, w, h) {
    if (!seen) {
      ctx.save(); ctx.fillStyle = '#15110f'; ctx.beginPath(); ctx.arc(x + 44, y + h / 2, 28, 0, 6.283); ctx.fill(); ctx.setLineDash([6, 5]); ctx.lineWidth = lnw(2); ctx.strokeStyle = 'rgba(232,220,196,.25)'; ctx.stroke(); ctx.restore();
      if (isLocked(app, 'relics', id)) padlock(ctx, x + 44, y + h / 2, 1.8); else qmark(app, x + 44, y + h / 2, 34);
      const lk = isLocked(app, 'relics', id);
      app.text(lk ? 'Locked relic' : 'Unknown relic', x + 88, y + 12, { size: 17, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: w - 100, lines: 1 } });
      app.text(lk ? lockedHint(id) : hintFor.relics(d), x + 88, y + 12 + LHT(app, 17, { bold: true }) + 6, { size: 13, ui: true, italic: true, lineH: 16, color: 'rgba(232,220,196,.55)', fit: { w: w - 100, lines: 3, soft: true } });
      return;
    }
    drawRelic(ctx, id, x + 44, y + h / 2, 56);
    const rar = cap(d.rarity === 'start' ? 'starter' : d.rarity), rarW = Math.ceil(app.measure(rar, 12, { ui: true, bold: true })) + 10;
    const nh = app.text(d.name, x + 88, y + 8, { size: 17, bold: true, color: COL.vellum, fit: { w: w - 100 - rarW, lines: 1 } });
    app.text(rar, x + w - 12, y + 8, { size: 12, ui: true, bold: true, align: 'right', color: d.rarity === 'rare' || d.rarity === 'boss' ? COL.lamp : 'rgba(232,220,196,.6)' });
    app.text(d.text, x + 88, y + 8 + nh + 4, { size: 13, ui: true, lineH: 15, color: COL.vellum, fit: { w: w - 100, lines: 4, soft: true } });
  } },
  enemies: { h: 152, draw(app, ctx, id, d, seen, x, y, w, h) {
    const b = enemyBounds(d), sc = Math.min(0.9, 128 / b.h, 118 / b.w);
    if (seen) drawEnemy(ctx, d, x + 70, y + 140, { scale: sc, t: app.t });
    else { const sil = enemySilhouette(d, sc); if (sil) ctx.drawImage(sil, x + 5, y - 2); else drawEnemy(ctx, d, x + 70, y + 140, { scale: sc }); }
    const tx = x + 142, tw = w - 154;
    if (!seen) {
      app.text('Unknown', tx, y + 12, { size: 17, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: tw, lines: 1 } });
      app.text(hintFor.enemies(d), tx, y + 12 + LHT(app, 17, { bold: true }) + 6, { size: 13, ui: true, italic: true, lineH: 16, color: 'rgba(232,220,196,.55)', fit: { w: tw, lines: 4, soft: true } });
      return;
    }
    const hp = Array.isArray(d.hp) ? `${d.hp[0]} to ${d.hp[1]} HP` : `${d.hp} HP`;
    let yy = y + 8;
    yy += app.text(d.name, tx, yy, { size: 17, bold: true, color: d.kind === 'boss' ? COL.lamp : COL.vellum, fit: { w: tw, lines: 1 } }) + 3;
    yy += app.text(`Act ${d.act} · ${cap(d.kind)} · ${hp}`, tx, yy, { size: 12, ui: true, color: 'rgba(232,220,196,.7)', fit: { w: tw, lines: 1 } }) + 5;
    const moves = Object.values(d.moves || {}).filter((m) => !m.hidden).map((m) => m.name || '?');
    const mlw = Math.ceil(app.measure('Moves', 12, { ui: true, bold: true })) + 8;
    app.text('Moves', tx, yy, { size: 12, ui: true, bold: true, color: COL.lamp });
    const mh = app.text(moves.join(', ') || 'Unknown', tx + mlw, yy, { size: 13, ui: true, lineH: 15, color: COL.vellum, fit: { w: tw - mlw, lines: 3, soft: true } });
    yy += Math.max(mh, LHT(app, 12, { ui: true })) + 4;
    if (d.flavor) app.text(d.flavor, tx, yy, { size: 13, italic: true, lineH: 15, color: 'rgba(232,220,196,.65)', fit: { w: tw, lines: 2, soft: true } });
  } },
  statuses: { h: 78, draw(app, ctx, id, d, seen, x, y, w, h) {
    if (!seen) {
      ctx.save(); ctx.fillStyle = '#15110f'; ctx.beginPath(); ctx.arc(x + 38, y + h / 2, 22, 0, 6.283); ctx.fill(); ctx.setLineDash([5, 4]); ctx.lineWidth = lnw(2); ctx.strokeStyle = 'rgba(232,220,196,.25)'; ctx.stroke(); ctx.restore();
      qmark(app, x + 38, y + h / 2, 28);
      app.text('Unknown status', x + 76, y + 10, { size: 16, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: w - 88, lines: 1 } });
      app.text(hintFor.statuses(d), x + 76, y + 10 + LHT(app, 16, { bold: true }) + 4, { size: 13, ui: true, italic: true, color: 'rgba(232,220,196,.55)', fit: { w: w - 88, lines: 3, soft: true } });
      return;
    }
    drawStatus(ctx, id, x + 38, y + h / 2, 44, d.good);
    const kindW = Math.ceil(app.measure('Boon', 12, { ui: true, bold: true })) + 10;
    const nh = app.text(d.name, x + 76, y + 8, { size: 16, bold: true, color: d.good ? COL.good : COL.bad, fit: { w: w - 88 - kindW, lines: 1 } });
    app.text(d.good ? 'Boon' : 'Bane', x + w - 12, y + 8, { size: 12, ui: true, bold: true, align: 'right', color: 'rgba(232,220,196,.55)' });
    let desc = ''; try { desc = statusText(id, 2); } catch { desc = ''; }
    app.text(desc, x + 76, y + 8 + nh + 3, { size: 13, ui: true, lineH: 15, color: COL.vellum, fit: { w: w - 88, lines: 3, soft: true } });
  } },
};

// ---------------------------------------------------------------- rules illustrations

const RULES = [
  ['Pick a card and a graft', 'After a fight you never add cards. You pick one of your own cards and one graft to sew onto it.'],
  ['Every graft has a boon and a price', 'The boon helps. The price is always paid. Read both before you stitch.'],
  ['Weight and Budget', 'Each graft weighs 1 to 3. Your Budget, 6 to start, is the Weight your deck carries for free.'],
  ['Strain Tithes your plain cards', 'Weight over Budget is Strain. Each point Tithes a plain card: it fights at 75 percent. With no plain card left, grafted cards jam.'],
  ['Overload and Shatter', 'A card holds 2 grafts. The 3rd Overloads it: +1 Weight, numbers x1.5, and a 25 percent chance to Shatter on its first play each combat.'],
  ['Schools and Resonance', 'Grafts belong to schools. Three of one school wake a bonus. Six wake a bigger one.'],
  ['The Thread', 'Cards that share a school tie knots into the Line. A card of another school Cuts it and pays one Stitch per knot after the first. A longer Line pays more.'],
  ['Slack, Tied, Frayed', 'Slack: a card with no school changes nothing. Tied: a Tempered card never cuts, and a Tied Line carries over a turn. Frayed: a jammed card acts as Slack.'],
  ['The Ward: build, then walk', 'In Ward mode each floor is a hospital you build. Mornings you play building plans: rooms spawn fights, events, shops and forges on timers. Lit rooms use power.'],
  ['The die and the route', 'Each walk (midday, evening, night) starts with a die roll. Plan a route of that many rooms next to each other, then Go. Every room on the route triggers in order. G goes, R rests the day.'],
  ['Days, nights and the boss', 'Night pays best and hits hardest. The boss waits in the Theatre: walk in early for a bonus, or be pulled in on the last night. Beat the third floor to win.'],
];
export const CODEX_RULES = RULES; // tests
function ruleArt(app, i, cx, cy, w, h) {
  const ctx = app.ctx, t = app.t;
  const demoGraft = GRAFT_LIST.find((g) => g.tier === 'safe') || GRAFT_LIST[0];
  const g3 = GRAFT_LIST.filter((g) => g.tier === 'safe' && g.school !== demoGraft.school).slice(0, 2);
  const card = (grafts, o = {}) => cardSpec({ uid: 0, id: 'm_cut', grafts, up: 0 });
  const arrow = (x1, y1, x2, col) => { ctx.save(); ctx.strokeStyle = col || COL.lamp; ctx.fillStyle = col || COL.lamp; ctx.lineWidth = lnw(3); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - 8, y1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x2, y1); ctx.lineTo(x2 - 12, y1 - 7); ctx.lineTo(x2 - 12, y1 + 7); ctx.closePath(); ctx.fill(); ctx.restore(); };
  switch (i) {
    case 0: {
      drawCard(ctx, card([]), cx - 124, cy, { scale: 0.4 });
      drawGraftPatch(ctx, demoGraft, cx - 36, cy - 28 + Math.sin(t * 2) * 3, 80, 56);
      arrow(cx + 50, cy, cx + 74);
      drawCard(ctx, card([demoGraft.id]), cx + 124, cy, { scale: 0.4 });
      break;
    }
    case 1: {
      drawGraftPatch(ctx, demoGraft, cx - w / 2 + 18, cy - 42, 100, 84);
      const tx = cx - w / 2 + 132;
      app.text('+', tx, cy - 40, { size: 26, bold: true, color: COL.good });
      app.text(demoGraft.boon, tx + 20, cy - 36, { size: 13, ui: true, lineH: 15, color: COL.vellum, fit: { w: w - 190, lines: 2, soft: true } });
      app.text('-', tx + 2, cy + 6, { size: 28, bold: true, color: COL.bad });
      app.text(demoGraft.price, tx + 20, cy + 10, { size: 13, ui: true, lineH: 15, color: '#ffb0b0', fit: { w: w - 190, lines: 2, soft: true } });
      break;
    }
    case 2: {
      gaugeCells(app, cx - w / 2 + 28, cy - 44, { budget: 6, weight: 4, strain: 0 }, { cell: 22, maxW: 300 });
      app.text('4 of 6', cx - w / 2 + 28 + 175, cy - 40, { size: 13, ui: true, color: COL.good });
      gaugeCells(app, cx - w / 2 + 28, cy + 8, { budget: 6, weight: 8, strain: 2 }, { cell: 22, maxW: 300 });
      app.text('8 of 6', cx - w / 2 + 28 + 175, cy - 14, { size: 13, ui: true, color: COL.bad });
      break;
    }
    case 3: {
      drawCard(ctx, card([demoGraft.id]), cx - 120, cy, { scale: 0.4 });
      app.text('+', cx - 74, cy - 14, { size: 22, bold: true, color: COL.vellum });
      drawCard(ctx, card([]), cx - 20, cy, { scale: 0.4, tithed: true });
      pill(app, 'TITHED', cx - 20, cy + 60, COL.bad);
      app.text('75%', cx + 70, cy - 24, { size: 34, bold: true, color: COL.bad });
      app.text('numbers', cx + 70, cy + 14, { size: 14, ui: true, color: 'rgba(232,220,196,.7)' });
      break;
    }
    case 4: {
      const sp = cardSpec({ uid: 0, id: 'm_cut', grafts: [demoGraft.id, ...g3.map((g) => g.id)].slice(0, 3), up: 0 });
      drawCard(ctx, sp, cx - 70, cy, { scale: 0.42 });
      pill(app, 'OVERLOAD', cx - 70, cy + 60, COL.gold);
      app.text('x1.5', cx + 30, cy - 40, { size: 28, bold: true, color: COL.gold });
      app.text('25% Shatter', cx + 30, cy + 2, { size: 17, bold: true, color: COL.vellum });
      ctx.save(); ctx.fillStyle = COL.gold;
      for (let k = 0; k < 6; k++) { const a = k * 1.1 + 0.4, r = 14 + ((t * 18 + k * 9) % 30); ctx.save(); ctx.translate(cx + 60 + Math.cos(a) * r, cy + 50 + Math.sin(a) * r * 0.6); ctx.rotate(a + t); ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 4); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill(); ctx.restore(); }
      ctx.restore();
      break;
    }
    case 6: { // the Thread: three knots, then the scissors
      ctx.strokeStyle = '#0a0908'; ctx.lineWidth = lnw(3); ctx.beginPath(); ctx.moveTo(cx - 72, cy); ctx.lineTo(cx + 48, cy); ctx.stroke();
      ['ember', 'ember', 'echo'].forEach((sc, k) => { const bx = cx - 60 + k * 40; ctx.beginPath(); ctx.arc(bx, cy, 15, 0, 6.283); ctx.fillStyle = '#1d1813'; ctx.fill(); ctx.lineWidth = lnw(3.4); ctx.strokeStyle = '#C9A227'; ctx.stroke(); drawSchoolGlyph(ctx, sc, bx, cy, 10, (SCHOOLS[sc] || {}).color); });
      drawSeamBadge(app, 'cut', cx + 78, cy, 0.9, 'echo');
      break;
    }
    case 7: { // Slack, Tied, Frayed: a loose thread, a locked knot, a fraying end
      ctx.strokeStyle = '#0a0908'; ctx.lineWidth = lnw(3); ctx.beginPath(); ctx.moveTo(cx - 80, cy); ctx.lineTo(cx + 80, cy); ctx.stroke();
      ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(232,220,196,.6)'; ctx.beginPath(); ctx.arc(cx - 56, cy, 16, 0, 6.283); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 6.283); ctx.fillStyle = '#1d1813'; ctx.fill(); ctx.lineWidth = lnw(4); ctx.strokeStyle = '#C9A227'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 40, cy); for (let k = 1; k <= 5; k++) ctx.lineTo(cx + 40 + k * 7, cy + (k % 2 ? -7 : 7) * Math.sin(t * 3 + k)); ctx.strokeStyle = '#d8a066'; ctx.lineWidth = lnw(2); ctx.stroke();
      break;
    }
    case 8: case 9: case 10: { // the Ward rules: a floor plan with the hero, the die with a route, the day clock
      ctx.save();
      if (i === 8) { for (let k = 0; k < 6; k++) { const rx = cx - 78 + (k % 3) * 54, ry = cy - 34 + Math.floor(k / 3) * 54; app.rr(rx, ry, 46, 46, 6); ctx.fillStyle = k === 4 ? 'rgba(232,220,196,.04)' : '#d8c79d'; ctx.fill(); ctx.lineWidth = lnw(2); ctx.strokeStyle = '#3a2a14'; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(cx - 78 + 6, cy - 34 + 6, 7, 0, 6.283); ctx.fillStyle = COL.lamp; ctx.fill(); }
      else if (i === 9) { app.rr(cx - 82, cy - 22, 44, 44, 8); ctx.fillStyle = '#f0e4c4'; ctx.fill(); ctx.lineWidth = lnw(2); ctx.strokeStyle = '#3a2a14'; ctx.stroke(); app.text('3', cx - 60, cy - 14, { size: 26, bold: true, align: 'center', color: '#2a1c0c' });
        ctx.setLineDash([5, 4]); ctx.strokeStyle = COL.scar; ctx.lineWidth = lnw(3); ctx.beginPath(); ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 10, cy); ctx.lineTo(cx + 10, cy - 24); ctx.lineTo(cx + 50, cy - 24); ctx.stroke(); ctx.setLineDash([]);
        for (const [dx, dy] of [[-20, 0], [10, 0], [10, -24], [50, -24]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 6, 0, 6.283); ctx.fillStyle = '#d8c79d'; ctx.fill(); ctx.stroke(); } }
      else { for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx - 66 + k * 44, cy, 17, 0, 6.283); ctx.fillStyle = k === 3 ? '#26304a' : '#d8c79d'; ctx.fill(); ctx.lineWidth = lnw(2); ctx.strokeStyle = k === 3 ? COL.scar : '#3a2a14'; ctx.stroke(); } }
      ctx.restore();
      break;
    }
    default: {
      const ids = ['ember', 'echo', 'blood'];
      ids.forEach((s, k) => drawSchoolGlyph(ctx, s, cx - 50 + k * 50, cy - 36, 12, (SCHOOLS[s] || {}).color));
      const tx = cx - w / 2 + 34, tw = w - 68, ty = cy + 6;
      app.rr(tx, ty, tw, 9, 4.5); ctx.fillStyle = 'rgba(232,220,196,.15)'; ctx.fill();
      app.rr(tx, ty, tw * 0.5, 9, 4.5); ctx.fillStyle = (SCHOOLS.ember || {}).color || COL.ember; ctx.fill();
      for (const k of [3, 6]) { const x = tx + (tw * k) / 6 - (k === 6 ? 1 : 0); ctx.fillStyle = COL.lamp; ctx.fillRect(x - 1, ty - 4, 2, 17); app.text(String(k), x, ty + 14, { size: 14, bold: true, ui: true, align: 'center', color: COL.lamp }); }
      app.text('bonus', tx + tw * 0.5 - 4, ty - 22, { size: 12, ui: true, align: 'right', color: 'rgba(232,220,196,.7)' });
      app.text('bigger bonus', tx + tw - 4, ty - 22, { size: 12, ui: true, align: 'right', color: 'rgba(232,220,196,.7)' });
    }
  }
}

// ---------------------------------------------------------------- the screen
export default {
  enter(app) {
    this.tab = 0; this.q = ''; this.filt = {}; this.sts = {}; this.pending = null;
    this.anim = (app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reducedMotion) ? 1 : 0;
    this.count = 0;
  },
  setTab(i) { this.tab = ((i % TABS.length) + TABS.length) % TABS.length; this.q = ''; },
  state(k) { return this.sts[k] || (this.sts[k] = { scroll: 0, target: 0, focus: -1 }); },
  key(app, e) {
    if (app.top() !== this) return false;
    const k = e.key;
    if (k === 'Escape') { if (this.q) { this.q = ''; return true; } app.pop(); return true; }
    if (k === 'Tab') { this.setTab(this.tab + (e.shiftKey ? -1 : 1)); return true; }
    if (k === 'Backspace') { this.q = this.q.slice(0, -1); return true; }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && this.tab < 5 && k !== ' ' || (k === ' ' && this.q)) { if (this.q.length < 24) this.q += k; this.state(KINDS[this.tab] || 'x').target = 0; return true; }
    if (this.tab === 0) return gridKey(this.state('cards'), e, this.count);
    return false;
  },
  entries(app, kind) {
    const f = this.filt[kind] || 'all', q = this.q.trim().toLowerCase();
    const out = [];
    for (const id of Object.keys(KEYS[kind])) {
      const d = KEYS[kind][id];
      if (d.summonOnly && !isSeen(app, kind, id)) continue;
      if (!passes(kind, f, d)) continue;
      const seen = isSeen(app, kind, id);
      if (q && !(seen && d.name.toLowerCase().includes(q))) continue;
      out.push({ id, d, seen, locked: !seen && isLocked(app, kind, id) });
    }
    return out;
  },
  // the codex follows the text scale up to 125%
  draw(app) {
    const ts = app.textScale; app.textScale = Math.min(tscale(app), 1.25);
    try { this.drawCodex(app); } finally { app.textScale = ts; }
  },
  drawCodex(app) {
    const ctx = app.ctx;
    this.pending = null;
    if (this.anim < 1) this.anim = Math.min(1, this.anim + app.dt / 0.16);
    const k = 1 - Math.pow(1 - this.anim, 3);
    ctx.save(); ctx.fillStyle = `rgba(6,4,3,${0.82 * k})`; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 14);
    app.reg('codex-panel', 14, 10, W - 28, H - 20, { overlay: true });
    app.panel(14, 10, W - 28, H - 20, { r: 14, fill: '#1c1714', stroke: 'rgba(232,220,196,.5)', lw: 3 });
    drawVellum(ctx, 17, 13, W - 34, H - 26, { r: 12, alpha: 0.9 }); // baked vellum behind everything on the page
    app.text('Codex', 36, 18, { size: 28, bold: true, color: COL.lamp });
    app.text('Everything you have met. The rest waits in silhouette.', 150, 30, { size: 14, ui: true, italic: true, color: 'rgba(232,220,196,.6)', fit: { w: 540, lines: 1 } });
    { const kd = KINDS[this.tab], cnt = kd && GATE_KIND[kd] ? categoryCounts(app.shared.meta)[GATE_KIND[kd]] : null;
      if (cnt) app.text(`${TABS[this.tab]} ${cnt.got} of ${cnt.total} unlocked`, 1070, 24, { size: 15, ui: true, bold: true, align: 'right', color: '#f2c14e', fit: { w: 360, lines: 1 } }); }
    app.reg('codex-x', 1080, 16, 36, 36, { group: 'x' }); // left of the global Pause / Fullscreen zone
    if (app.button('X', 1080, 16, 36, 36, { size: 20, ui: true, r: 18 })) this.pending = () => { if (app.top() === this) app.pop(); };
    // tabs
    const tw = 140, ty = 62;
    TABS.forEach((name, i) => {
      const kind = KINDS[i];
      let label = kind ? `${name} ${seenCount(app, kind)}/${Object.keys(KEYS[kind]).length}` : name;
      if (kind && app.measure(label, 15, { ui: true, bold: true }) > tw - 14) label = `${name} ${seenCount(app, kind)}`; // phones inflate the text: drop the total so the label stays inside its tab
      if (kind && app.measure(label, 15, { ui: true, bold: true }) > tw - 14) label = name;
      const on = this.tab === i;
      app.reg('codex-tab' + i, 30 + i * (tw + 6), ty, tw, 34, { group: 'tab' + i });
      if (app.button(label, 30 + i * (tw + 6), ty, tw, 34, { size: 15, ui: true, fill: on ? '#5a4720' : COL.slab2, stroke: on ? COL.lamp : 'rgba(232,220,196,.4)', color: on ? COL.lamp : COL.vellum, r: 7 })) this.setTab(i);
    });
    const kind = KINDS[this.tab];
    // filter chips + search
    if (kind) {
      let fx = 32;
      for (const [fid, label] of filtersFor(kind)) {
        const on = (this.filt[kind] || 'all') === fid;
        const cwid = Math.max(54, app.measure(label, 14, { ui: true, bold: true }) + 24);
        if (app.button(label, fx, 106, cwid, 28, { size: 14, ui: true, r: 6, fill: on ? '#5a4720' : COL.slab2, stroke: on ? COL.lamp : 'rgba(232,220,196,.4)', color: on ? COL.lamp : COL.vellum })) { this.filt[kind] = fid; this.state(kind).target = 0; }
        fx += cwid + 5;
      }
      const sx = W - 300 - 30;
      app.rr(sx, 106, 300, 28, 6); ctx.fillStyle = 'rgba(10,8,7,.8)'; ctx.fill(); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = this.q ? COL.lamp : 'rgba(232,220,196,.35)'; ctx.stroke();
      const caret = Math.floor(app.t * 2) % 2 ? '|' : '';
      if (this.q) app.text(this.q + caret, sx + 10, 111, { size: 15, ui: true, color: COL.vellum });
      else app.text('Type to search seen entries', sx + 10, 111, { size: 14, ui: true, italic: true, color: 'rgba(232,220,196,.4)' });
    } else if (this.tab === 7) {
      app.text('Achievements, Credit and cosmetics. Credit is paid by the case file at the end of a run.', 36, 112, { size: 15, ui: true, italic: true, color: 'rgba(232,220,196,.65)' });
    } else {
      app.text(this.tab === 5 ? 'The seven schools. Hold 3 grafts of one to wake its bonus, 6 to wake the bigger one.' : 'The whole Graft system in eight panels.', 36, 112, { size: 15, ui: true, italic: true, color: 'rgba(232,220,196,.65)' });
    }
    const CX = 28, CY = 144, CW = W - 56, CH = H - 144 - 20;
    app.reg('scroll-codex', CX, 0, CW, H, { overlay: true }); // every cell clips its own content
    if (kind === 'cards') this.drawCards(app, CX, CY, CW, CH);
    else if (kind) this.drawList(app, kind, CX, CY, CW, CH);
    else if (this.tab === 5) this.drawSchools(app, CX, CY, CW, CH);
    else if (this.tab === 7) this.drawRecords(app, CX, CY, CW, CH);
    else this.drawRules(app, CX, CY, CW, CH);
    ctx.restore();
    if (this.pending) this.pending();
  },
  drawCards(app, x, y, w, h) {
    const ctx = app.ctx, st = this.state('cards');
    const list = this.entries(app, 'cards');
    this.count = list.length;
    const items = list.map(({ id, d, seen, locked }) => ({
      id, d, seen, locked,
      spec: seen ? cardSpec({ uid: 0, id, grafts: [], up: 0 }) : null,
      draw: seen ? null : (c2, cx, cy, sc, hot) => unknownCard(app, c2, cx, cy, sc, hot, locked),
    }));
    const gw = w - 330;
    const g = cardGrid(app, items, x, y, gw, h, { state: st, scale: 0.56, gap: 10, empty: this.q ? 'Nothing seen matches.' : 'Nothing here.' });
    // side preview
    const px = x + gw + 12, pw = w - gw - 12;
    app.panel(px, y, pw, h, { r: 10, fill: 'rgba(10,8,7,.55)', stroke: 'rgba(232,220,196,.2)', lw: 1.5 });
    const hv = g.hover >= 0 ? items[g.hover] : null;
    if (!hv) { app.text('Hover a card', px + pw / 2, y + h / 2 - 12, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.5)' }); drawEmptyMark(ctx, x + w / 2, y + h / 2 - 34); return; }
    const cy = y + 16 + (CARD_H * 1.1) / 2;
    if (hv.seen) drawCard(ctx, hv.spec, px + pw / 2, cy, { scale: 1.1, glow: 0.3, hover: true, preview: true });
    else unknownCard(app, ctx, px + pw / 2, cy, 1.1, true, hv.locked);
    let yy = y + 16 + CARD_H * 1.1 + 14;
    const d = hv.d, heroName = d.hero === 'any' ? 'Neutral' : (HEROES[d.hero] ? HEROES[d.hero].name : d.hero);
    if (hv.seen) {
      app.text(`${heroName} · ${cap(d.rarity)} · ${cap(d.type)}`, px + pw / 2, yy, { size: 14, ui: true, align: 'center', color: 'rgba(232,220,196,.75)' });
    } else {
      app.text(hv.locked ? 'Locked' : 'Unknown', px + pw / 2, yy, { size: 17, bold: true, align: 'center', color: hv.locked ? '#c9b98f' : 'rgba(232,220,196,.7)' });
      app.text(hv.locked ? lockedHint(hv.id) : hintFor.cards(d), px + 14, yy + 24, { size: 13, ui: true, italic: true, maxW: pw - 28, lineH: 16, color: 'rgba(232,220,196,.6)' });
    }
  },
  drawList(app, kind, x, y, w, h) {
    const ctx = app.ctx, st = this.state(kind), cell = CELLS[kind];
    const list = this.entries(app, kind);
    this.count = list.length;
    const gap = 12, cw = Math.floor((w - 16 - gap * 2) / 3), ch = Math.round(cell.h * growOf(app));
    const rows = Math.ceil(list.length / 3);
    if (!list.length) { app.text(this.q ? 'Nothing seen matches.' : 'Nothing here.', x + w / 2, y + h / 2 - 12, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.5)' }); return; }
    scrollArea(app, st, x, y, w, h, rows * (ch + gap) + gap, (top) => {
      list.forEach((e, i) => {
        const cx = x + 8 + (i % 3) * (cw + gap), cy = top + gap + Math.floor(i / 3) * (ch + gap);
        if (cy + ch < y || cy > y + h) return;
        const hot = inView(app, st, cx, cy, cw, ch);
        if (hot && e.seen) { const [tx, go] = entryGloss(kind, e.id, e.d); glossTip(app, '', tx, { x: cx, y: cy, w: cw, h: ch }, go); }
        app.panel(cx, cy, cw, ch, { r: 10, fill: hot ? 'rgba(40,32,26,.95)' : 'rgba(22,18,15,.9)', stroke: e.seen ? 'rgba(232,220,196,.3)' : 'rgba(232,220,196,.12)', lw: 1.5 });
        ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
        if (cy < y + h - 24) cell.draw(app, ctx, e.id, e.d, e.seen, cx, cy, cw, ch); // a sliver under the view edge shows only its panel
        ctx.restore();
      });
    });
  },
  // Records: achievements (left, scrolls) and the Credit shop (right: card backs, starting relics, equip)
  drawRecords(app, x, y, w, h) {
    const ctx = app.ctx, meta = app.shared.meta, M = app.shared.flow && app.shared.flow.META;
    if (!meta || !M || !meta.credit) return;
    const lw = Math.floor(w * 0.58), rx = x + lw + 12, rw = w - lw - 12, st = this.state('records');
    const list = M.ACHIEVEMENTS, rh = 62, gap = 8;
    scrollArea(app, st, x, y, lw, h, list.length * (rh + gap) + gap, (top) => {
      list.forEach((a, i) => {
        const cy = top + gap + i * (rh + gap); if (cy + rh < y || cy > y + h) return;
        const done = M.isAchieved(meta, a.id), p = M.achievementProgress(meta, a.id), hidden = a.secret && !done;
        if (!hidden && inView(app, st, x + 8, cy, lw - 16, rh)) glossTip(app, '', [a.text], { x: x + 8, y: cy, w: lw - 16, h: rh });
        app.panel(x + 8, cy, lw - 16, rh, { r: 8, fill: done ? 'rgba(50,40,18,.9)' : 'rgba(22,18,15,.9)', stroke: done ? COL.lamp : 'rgba(232,220,196,.2)', lw: 1.5 });
        app.text(hidden ? '???' : a.name, x + 22, cy + 6, { size: 16, bold: true, color: done ? COL.lamp : COL.vellum, maxW: lw - 200 });
        app.text(hidden ? 'A secret record.' : a.text, x + 22, cy + 28, { size: 13, ui: true, lineH: 15, color: 'rgba(232,220,196,.75)', fit: { w: lw - 60, lines: 2, soft: true } });
        app.text(done ? 'DONE' : p.max > 1 ? `${p.n}/${p.max}` : '', x + lw - 24, cy + 8, { size: 13, ui: true, bold: true, align: 'right', color: done ? COL.good : 'rgba(232,220,196,.6)' });
      });
    });
    app.panel(rx, y, rw, h, { r: 10, fill: 'rgba(10,8,7,.55)', stroke: 'rgba(232,220,196,.2)', lw: 1.5 });
    app.text(`CREDIT  ${meta.credit.bal}`, rx + 16, y + 12, { size: 20, bold: true, color: COL.lamp });
    app.text(`${M.ACHIEVEMENTS.filter((a) => M.isAchieved(meta, a.id)).length}/${M.ACHIEVEMENTS.length} records`, rx + rw - 16, y + 16, { size: 13, ui: true, align: 'right', color: 'rgba(232,220,196,.6)' });
    const rows = [];
    for (const b of M.CARD_BACKS) rows.push({ kind: 'back', id: b.id, label: 'Back: ' + b.name, cost: b.cost, list: meta.cosmetics.backs, eq: meta.loadout.back });
    for (const r of M.START_RELICS) rows.push({ kind: 'relic', id: r.id, label: 'Start: ' + ((RELICS[r.id] || {}).name || r.id), cost: r.cost, list: meta.cosmetics.relics, eq: meta.loadout.relic });
    let yy = y + 48; const bh = 26;
    for (const r of rows) {
      if (yy + bh > y + h - 6) break;
      const owned = r.list.includes(r.id), on = r.eq === r.id;
      app.text(r.label, rx + 14, yy + 4, { size: 14, ui: true, color: owned ? COL.vellum : 'rgba(232,220,196,.6)', maxW: rw - 150 });
      const lab = on ? (r.kind === 'relic' ? 'Unequip' : 'Equipped') : owned ? 'Equip' : r.cost === null ? 'Earn it' : `Buy ${r.cost}`;
      const dis = (!owned && (r.cost === null || meta.credit.bal < r.cost)) || (on && r.kind === 'back');
      if (app.button(lab, rx + rw - 118, yy, 104, bh, { size: 13, ui: true, r: 6, disabled: dis })) {
        if (!owned) M.buy(meta, r.kind, r.id); else M.equip(meta, r.kind, on ? null : r.id);
        app.shared.flow.saveMeta();
      }
      yy += bh + 4;
    }
  },
  drawSchools(app, x, y, w, h) {
    const ctx = app.ctx, st = this.state('schools'), ids = SCHOOL_IDS();
    const gap = 14, cw = Math.floor((w - 16 - gap) / 2), ch = Math.round(166 + (growOf(app) - 1) * 70);
    const rows = Math.ceil(ids.length / 2);
    scrollArea(app, st, x, y, w, h, rows * (ch + gap) + gap, (top) => {
      ids.forEach((id, i) => {
        const s = SCHOOLS[id], cx = x + 8 + (i % 2) * (cw + gap), cy = top + gap + Math.floor(i / 2) * (ch + gap);
        if (cy + ch < y || cy > y + h) return;
        const col = s.color || COL.vellum;
        if (inView(app, st, cx, cy, cw, ch)) glossTip(app, '', [s.blurb, s.resonance[3], s.resonance[6]], { x: cx, y: cy, w: cw, h: ch });
        app.panel(cx, cy, cw, ch, { r: 10, fill: 'rgba(22,18,15,.9)', stroke: rgba(col.startsWith('#') ? col : '#888888', 0.55), lw: 2 });
        drawSchoolGlyph(ctx, id, cx + 38, cy + 40, 24, col);
        let yy = cy + 12;
        yy += app.text(s.name, cx + 76, yy, { size: 24, bold: true, color: col, fit: { w: cw - 90, lines: 1 } }) + 3;
        yy += app.text(s.blurb, cx + 76, yy, { size: 14, italic: true, lineH: 17, color: 'rgba(232,220,196,.8)', fit: { w: cw - 90, lines: 2 } }) + 5;
        const total = GRAFT_LIST.filter((g) => g.school === id), seen = total.filter((g) => isSeen(app, 'grafts', g.id)).length;
        yy += app.text(`${seen}/${total.length} grafts seen`, cx + 76, yy, { size: 12, ui: true, color: 'rgba(232,220,196,.55)', fit: { w: cw - 90, lines: 1 } }) + 6;
        const pillW = Math.ceil(app.measure('6 grafts', 12, { ui: true, bold: true })) + 20;
        [3, 6].forEach((t) => {
          const rh = Math.max(LHT(app, 14, { ui: true }), 20);
          pill(app, `${t} grafts`, cx + 16 + pillW / 2, yy + rh / 2 - 1, COL.lamp, { size: 12 });
          const th = app.text(s.resonance[t] || '', cx + 24 + pillW, yy, { size: 14, ui: true, lineH: 15, color: COL.vellum, fit: { w: cw - 40 - pillW, lines: 2 } });
          yy += Math.max(rh, th) + 6;
        });
      });
    });
  },
  drawRules(app, x, y, w, h) {
    const ctx = app.ctx, gap = 14;
    // phones inflate the text: 3 columns, panels sized to their own words, and the whole sheet scrolls when it outgrows the view
    const big = app.sz(14, { ui: true }) > 15, cols = big ? 3 : 4, cw = Math.floor((w - 16 - gap * (cols - 1)) / cols);
    const titleSz = (t) => (t.length > 30 ? 15 : 18);
    const lh = Math.ceil(app.sz(14, { ui: true }) * 1.2);
    const geo = RULES.map(([title, text]) => {
      const tl = app.wrap(title, cw - 60, titleSz(title), { bold: true }).length, tH = tl * Math.ceil(app.sz(titleSz(title), { bold: true }) * 1.18);
      const bl = app.wrap(text, cw - 32, 14, { ui: true }).length;
      return { tH, bodyY: 164 + Math.max(tH, 28) + 6, bl };
    });
    const rowsN = Math.ceil(RULES.length / cols), baseCh = Math.floor((h - gap) / 2);
    const rowH = [];
    for (let r = 0; r < rowsN; r++) { let m = 0; for (let c = 0; c < cols; c++) { const g = geo[r * cols + c]; if (g) m = Math.max(m, g.bodyY + g.bl * lh + 14); } rowH.push(big ? m : Math.max(baseCh, m)); }
    const contentH = rowH.reduce((a, b) => a + b + gap, 0) - gap;
    this.rulesSt = this.rulesSt || { scroll: 0, target: 0 };
    scrollArea(app, this.rulesSt, x, y, w, h, contentH, (top) => {
      RULES.forEach(([title, text], i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const cx = x + c * (cw + gap), cy = top + rowH.slice(0, r).reduce((a, b) => a + b + gap, 0), ch = rowH[r], g = geo[i];
        if (cy > y + h || cy + ch < y) return;
        if (inView(app, this.rulesSt, cx, cy, cw, ch)) glossTip(app, '', [title, text], { x: cx, y: cy, w: cw, h: ch });
        app.panel(cx, cy, cw, ch, { r: 12, fill: 'rgba(22,18,15,.92)', stroke: 'rgba(232,220,196,.3)', lw: 2 });
        ctx.save(); ctx.beginPath(); ctx.rect(cx + 2, cy + 2, cw - 4, 156); ctx.clip();
        app.rr(cx + 6, cy + 6, cw - 12, 148, 8); ctx.fillStyle = 'rgba(232,220,196,.06)'; ctx.fill();
        if (cy + 156 >= y) ruleArt(app, i, cx + cw / 2, cy + 74, cw - 24, 140);
        ctx.restore();
        ctx.save(); ctx.fillStyle = COL.lamp; ctx.beginPath(); ctx.arc(cx + 26, cy + 178, 14, 0, 6.283); ctx.fill(); ctx.restore();
        app.text(String(i + 1), cx + 26, cy + 178 - 10, { size: 18, bold: true, align: 'center', color: COL.ink });
        app.text(title, cx + 48, cy + 164, { size: titleSz(title), bold: true, color: COL.lamp, maxW: cw - 60, lineH: 20 });
        app.text(text, cx + 16, cy + g.bodyY, { size: 14, ui: true, maxW: cw - 32, lineH: 17, color: COL.vellum });
      });
    });
  },
};
