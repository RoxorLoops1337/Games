// CODEX: modal reference book (flow.openCodex()). Tabs: Cards / Grafts / Relics / Enemies / Statuses / Schools / Rules.
// Entries not yet in meta.seen[kind][id] show as silhouettes with a hint. Type to search (seen entries only).
import { COL, W, H, rgba } from './core.js';
import { drawCard, drawGraftPatch, drawSchoolGlyph, CARD_W, CARD_H } from '../art/cards.js';
import { drawStatus, drawRelic } from '../art/icons.js';
import { drawEnemy, enemyBounds } from '../art/enemies.js';
import { CARDS, GRAFTS, RELICS, ENEMIES, STATUSES, SCHOOLS, HEROES, GRAFT_LIST } from '../data/index.js';
import { cardSpec } from '../engine/cards.js';
import { statusText } from '../engine/text.js';
import { cardGrid, gridKey, scrollArea, inView, pill, clampText, gaugeCells } from './deckview.js';

const TABS = ['Cards', 'Grafts', 'Relics', 'Enemies', 'Statuses', 'Schools', 'Rules'];
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
  const m = app.shared.meta, s = m && m.seen && m.seen[kind];
  return !!((s && s[id]) || runOwns(app.shared.run, kind, id));
}
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

function unknownCard(app, ctx, cx, cy, sc, hot) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
  app.rr(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14); ctx.fillStyle = hot ? '#221b17' : '#15110f'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(232,220,196,.22)'; ctx.setLineDash([14, 9]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  qmark(app, cx, cy + 10, 64 * sc / 0.56 * 0.6);
}

// ---------------------------------------------------------------- list cells
const CELLS = {
  grafts: { h: 112, draw(app, ctx, id, d, seen, x, y, w, h) {
    if (!seen) {
      app.rr(x + 8, y + 8, 124, h - 16, 14); ctx.fillStyle = '#15110f'; ctx.fill(); ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,220,196,.25)'; ctx.stroke(); ctx.setLineDash([]);
      qmark(app, x + 70, y + h / 2, 44);
      app.text('Unknown graft', x + 146, y + 12, { size: 17, bold: true, color: 'rgba(232,220,196,.6)' });
      app.text(hintFor.grafts(d), x + 146, y + 38, { size: 13, ui: true, italic: true, maxW: w - 158, lineH: 16, color: 'rgba(232,220,196,.55)' });
      return;
    }
    drawGraftPatch(ctx, d, x + 8, y + 10, 128, h - 20);
    const col = COL[d.school] || COL.vellum, tx = x + 148, tw = w - 160;
    app.text(d.name, tx, y + 8, { size: 17, bold: true, color: COL.vellum, maxW: tw });
    drawSchoolGlyph(ctx, d.school, tx + 7, y + 36, 6, col);
    app.text(`${(SCHOOLS[d.school] || {}).name} · Weight ${d.weight} · ${cap(d.tier)}`, tx + 18, y + 29, { size: 12, ui: true, color: 'rgba(232,220,196,.7)' });
    app.text('Boon', tx, y + 48, { size: 12, ui: true, bold: true, color: COL.good });
    app.text(clampText(app, d.boon, tw - 38, 13, 2, { ui: true }), tx + 38, y + 48, { size: 13, ui: true, maxW: tw - 38, lineH: 15, color: COL.vellum });
    app.text('Price', tx, y + 80, { size: 12, ui: true, bold: true, color: COL.bad });
    app.text(clampText(app, d.price, tw - 38, 13, 2, { ui: true }), tx + 38, y + 80, { size: 13, ui: true, maxW: tw - 38, lineH: 15, color: '#ffb0b0' });
  } },
  relics: { h: 96, draw(app, ctx, id, d, seen, x, y, w, h) {
    if (!seen) {
      ctx.save(); ctx.fillStyle = '#15110f'; ctx.beginPath(); ctx.arc(x + 44, y + h / 2, 28, 0, 6.283); ctx.fill(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,220,196,.25)'; ctx.stroke(); ctx.restore();
      qmark(app, x + 44, y + h / 2, 34);
      app.text('Unknown relic', x + 88, y + 12, { size: 17, bold: true, color: 'rgba(232,220,196,.6)' });
      app.text(hintFor.relics(d), x + 88, y + 38, { size: 13, ui: true, italic: true, maxW: w - 100, lineH: 16, color: 'rgba(232,220,196,.55)' });
      return;
    }
    drawRelic(ctx, id, x + 44, y + h / 2, 56);
    app.text(d.name, x + 88, y + 8, { size: 17, bold: true, color: COL.vellum, maxW: w - 100 });
    app.text(cap(d.rarity === 'start' ? 'starter' : d.rarity), x + w - 12, y + 10, { size: 12, ui: true, bold: true, align: 'right', color: d.rarity === 'rare' || d.rarity === 'boss' ? COL.lamp : 'rgba(232,220,196,.6)' });
    app.text(clampText(app, d.text, w - 100, 13, 4, { ui: true }), x + 88, y + 32, { size: 13, ui: true, maxW: w - 100, lineH: 15, color: COL.vellum });
  } },
  enemies: { h: 152, draw(app, ctx, id, d, seen, x, y, w, h) {
    const b = enemyBounds(d), sc = Math.min(0.9, 128 / b.h, 118 / b.w);
    if (seen) drawEnemy(ctx, d, x + 70, y + 140, { scale: sc, t: app.t });
    else { const sil = enemySilhouette(d, sc); if (sil) ctx.drawImage(sil, x + 5, y - 2); else drawEnemy(ctx, d, x + 70, y + 140, { scale: sc }); }
    const tx = x + 142, tw = w - 154;
    if (!seen) {
      app.text('Unknown', tx, y + 12, { size: 17, bold: true, color: 'rgba(232,220,196,.6)' });
      app.text(hintFor.enemies(d), tx, y + 38, { size: 13, ui: true, italic: true, maxW: tw, lineH: 16, color: 'rgba(232,220,196,.55)' });
      return;
    }
    const hp = Array.isArray(d.hp) ? `${d.hp[0]} to ${d.hp[1]} HP` : `${d.hp} HP`;
    app.text(d.name, tx, y + 8, { size: 17, bold: true, color: d.kind === 'boss' ? COL.lamp : COL.vellum, maxW: tw });
    app.text(`Act ${d.act} · ${cap(d.kind)} · ${hp}`, tx, y + 31, { size: 12, ui: true, color: 'rgba(232,220,196,.7)' });
    const moves = Object.values(d.moves || {}).filter((m) => !m.hidden).map((m) => m.name || '?');
    app.text('Moves', tx, y + 52, { size: 12, ui: true, bold: true, color: COL.lamp });
    const mt = clampText(app, moves.join(', ') || 'Unknown', tw - 46, 13, 3, { ui: true });
    const mh = app.text(mt, tx + 46, y + 52, { size: 13, ui: true, maxW: tw - 46, lineH: 15, color: COL.vellum });
    if (d.flavor) app.text(clampText(app, d.flavor, tw, 13, 2), tx, y + 56 + mh, { size: 13, italic: true, maxW: tw, lineH: 15, color: 'rgba(232,220,196,.65)' });
  } },
  statuses: { h: 78, draw(app, ctx, id, d, seen, x, y, w, h) {
    if (!seen) {
      ctx.save(); ctx.fillStyle = '#15110f'; ctx.beginPath(); ctx.arc(x + 38, y + h / 2, 22, 0, 6.283); ctx.fill(); ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,220,196,.25)'; ctx.stroke(); ctx.restore();
      qmark(app, x + 38, y + h / 2, 28);
      app.text('Unknown status', x + 76, y + 10, { size: 16, bold: true, color: 'rgba(232,220,196,.6)' });
      app.text(hintFor.statuses(d), x + 76, y + 34, { size: 13, ui: true, italic: true, maxW: w - 88, color: 'rgba(232,220,196,.55)' });
      return;
    }
    drawStatus(ctx, id, x + 38, y + h / 2, 44, d.good);
    app.text(d.name, x + 76, y + 8, { size: 16, bold: true, color: d.good ? COL.good : COL.bad });
    app.text(d.good ? 'Boon' : 'Bane', x + w - 12, y + 10, { size: 12, ui: true, bold: true, align: 'right', color: 'rgba(232,220,196,.55)' });
    let desc = ''; try { desc = statusText(id, 2); } catch { desc = ''; }
    app.text(clampText(app, desc, w - 88, 13, 3, { ui: true }), x + 76, y + 29, { size: 13, ui: true, maxW: w - 88, lineH: 15, color: COL.vellum });
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
];
function ruleArt(app, i, cx, cy, w, h) {
  const ctx = app.ctx, t = app.t;
  const demoGraft = GRAFT_LIST.find((g) => g.tier === 'safe') || GRAFT_LIST[0];
  const g3 = GRAFT_LIST.filter((g) => g.tier === 'safe' && g.school !== demoGraft.school).slice(0, 2);
  const card = (grafts, o = {}) => cardSpec({ uid: 0, id: 'm_cut', grafts, up: 0 });
  const arrow = (x1, y1, x2, col) => { ctx.save(); ctx.strokeStyle = col || COL.lamp; ctx.fillStyle = col || COL.lamp; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - 8, y1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x2, y1); ctx.lineTo(x2 - 12, y1 - 7); ctx.lineTo(x2 - 12, y1 + 7); ctx.closePath(); ctx.fill(); ctx.restore(); };
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
      app.text(clampText(app, demoGraft.boon, w - 190, 13, 2, { ui: true }), tx + 20, cy - 36, { size: 13, ui: true, maxW: w - 190, lineH: 15, color: COL.vellum });
      app.text('-', tx + 2, cy + 6, { size: 28, bold: true, color: COL.bad });
      app.text(clampText(app, demoGraft.price, w - 190, 13, 2, { ui: true }), tx + 20, cy + 10, { size: 13, ui: true, maxW: w - 190, lineH: 15, color: '#ffb0b0' });
      break;
    }
    case 2: {
      gaugeCells(app, cx - w / 2 + 28, cy - 44, { budget: 6, weight: 4, strain: 0 }, { cell: 22, maxW: 300 });
      app.text('4 of 6', cx - w / 2 + 28 + 175, cy - 40, { size: 13, ui: true, color: COL.good });
      gaugeCells(app, cx - w / 2 + 28, cy + 8, { budget: 6, weight: 8, strain: 2 }, { cell: 22, maxW: 300 });
      app.text('8 of 6', cx - w / 2 + 28 + 230, cy + 12, { size: 13, ui: true, color: COL.bad });
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
    this.anim = (app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reduceMotion) ? 1 : 0;
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
      out.push({ id, d, seen });
    }
    return out;
  },
  draw(app) {
    const ctx = app.ctx;
    this.pending = null;
    if (this.anim < 1) this.anim = Math.min(1, this.anim + app.dt / 0.16);
    const k = 1 - Math.pow(1 - this.anim, 3);
    ctx.save(); ctx.fillStyle = `rgba(6,4,3,${0.82 * k})`; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 14);
    app.panel(14, 10, W - 28, H - 20, { r: 14, fill: '#1c1714', stroke: 'rgba(232,220,196,.5)', lw: 3 });
    app.text('Codex', 36, 18, { size: 28, bold: true, color: COL.lamp });
    app.text('Everything you have met. The rest waits in silhouette.', 150, 30, { size: 14, ui: true, italic: true, color: 'rgba(232,220,196,.6)' });
    if (app.button('X', W - 62, 16, 36, 36, { size: 20, ui: true, r: 18 })) this.pending = () => { if (app.top() === this) app.pop(); };
    // tabs
    const tw = 160, ty = 62;
    TABS.forEach((name, i) => {
      const kind = KINDS[i];
      const label = kind ? `${name} ${seenCount(app, kind)}/${Object.keys(KEYS[kind]).length}` : name;
      const on = this.tab === i;
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
      app.rr(sx, 106, 300, 28, 6); ctx.fillStyle = 'rgba(10,8,7,.8)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = this.q ? COL.lamp : 'rgba(232,220,196,.35)'; ctx.stroke();
      const caret = Math.floor(app.t * 2) % 2 ? '|' : '';
      if (this.q) app.text(this.q + caret, sx + 10, 111, { size: 15, ui: true, color: COL.vellum });
      else app.text('Type to search seen entries', sx + 10, 111, { size: 14, ui: true, italic: true, color: 'rgba(232,220,196,.4)' });
    } else {
      app.text(this.tab === 5 ? 'The seven schools. Hold 3 grafts of one to wake its bonus, 6 to wake the bigger one.' : 'The whole Graft system in six panels.', 36, 112, { size: 15, ui: true, italic: true, color: 'rgba(232,220,196,.65)' });
    }
    const CX = 28, CY = 144, CW = W - 56, CH = H - 144 - 20;
    if (kind === 'cards') this.drawCards(app, CX, CY, CW, CH);
    else if (kind) this.drawList(app, kind, CX, CY, CW, CH);
    else if (this.tab === 5) this.drawSchools(app, CX, CY, CW, CH);
    else this.drawRules(app, CX, CY, CW, CH);
    ctx.restore();
    if (this.pending) this.pending();
  },
  drawCards(app, x, y, w, h) {
    const ctx = app.ctx, st = this.state('cards');
    const list = this.entries(app, 'cards');
    this.count = list.length;
    const items = list.map(({ id, d, seen }) => ({
      id, d, seen,
      spec: seen ? cardSpec({ uid: 0, id, grafts: [], up: 0 }) : null,
      draw: seen ? null : (c2, cx, cy, sc, hot) => unknownCard(app, c2, cx, cy, sc, hot),
    }));
    const gw = w - 330;
    const g = cardGrid(app, items, x, y, gw, h, { state: st, scale: 0.56, gap: 10, empty: this.q ? 'Nothing seen matches.' : 'Nothing here.' });
    // side preview
    const px = x + gw + 12, pw = w - gw - 12;
    app.panel(px, y, pw, h, { r: 10, fill: 'rgba(10,8,7,.55)', stroke: 'rgba(232,220,196,.2)', lw: 1.5 });
    const hv = g.hover >= 0 ? items[g.hover] : null;
    if (!hv) { app.text('Hover a card', px + pw / 2, y + h / 2 - 12, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.5)' }); return; }
    const cy = y + 16 + (CARD_H * 1.1) / 2;
    if (hv.seen) drawCard(ctx, hv.spec, px + pw / 2, cy, { scale: 1.1, glow: 0.3, hover: true, preview: true });
    else unknownCard(app, ctx, px + pw / 2, cy, 1.1, true);
    let yy = y + 16 + CARD_H * 1.1 + 14;
    const d = hv.d, heroName = d.hero === 'any' ? 'Neutral' : (HEROES[d.hero] ? HEROES[d.hero].name : d.hero);
    if (hv.seen) {
      app.text(`${heroName} · ${cap(d.rarity)} · ${cap(d.type)}`, px + pw / 2, yy, { size: 14, ui: true, align: 'center', color: 'rgba(232,220,196,.75)' });
    } else {
      app.text('Unknown', px + pw / 2, yy, { size: 17, bold: true, align: 'center', color: 'rgba(232,220,196,.7)' });
      app.text(hintFor.cards(d), px + 14, yy + 24, { size: 13, ui: true, italic: true, maxW: pw - 28, lineH: 16, color: 'rgba(232,220,196,.6)' });
    }
  },
  drawList(app, kind, x, y, w, h) {
    const ctx = app.ctx, st = this.state(kind), cell = CELLS[kind];
    const list = this.entries(app, kind);
    this.count = list.length;
    const gap = 12, cw = Math.floor((w - 16 - gap * 2) / 3), ch = cell.h;
    const rows = Math.ceil(list.length / 3);
    if (!list.length) { app.text(this.q ? 'Nothing seen matches.' : 'Nothing here.', x + w / 2, y + h / 2 - 12, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.5)' }); return; }
    scrollArea(app, st, x, y, w, h, rows * (ch + gap) + gap, (top) => {
      list.forEach((e, i) => {
        const cx = x + 8 + (i % 3) * (cw + gap), cy = top + gap + Math.floor(i / 3) * (ch + gap);
        if (cy + ch < y || cy > y + h) return;
        const hot = inView(app, st, cx, cy, cw, ch);
        app.panel(cx, cy, cw, ch, { r: 10, fill: hot ? 'rgba(40,32,26,.95)' : 'rgba(22,18,15,.9)', stroke: e.seen ? 'rgba(232,220,196,.3)' : 'rgba(232,220,196,.12)', lw: 1.5 });
        ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
        cell.draw(app, ctx, e.id, e.d, e.seen, cx, cy, cw, ch);
        ctx.restore();
      });
    });
  },
  drawSchools(app, x, y, w, h) {
    const ctx = app.ctx, st = this.state('schools'), ids = SCHOOL_IDS();
    const gap = 14, cw = Math.floor((w - 16 - gap) / 2), ch = 166;
    const rows = Math.ceil(ids.length / 2);
    scrollArea(app, st, x, y, w, h, rows * (ch + gap) + gap, (top) => {
      ids.forEach((id, i) => {
        const s = SCHOOLS[id], cx = x + 8 + (i % 2) * (cw + gap), cy = top + gap + Math.floor(i / 2) * (ch + gap);
        if (cy + ch < y || cy > y + h) return;
        const col = s.color || COL.vellum;
        app.panel(cx, cy, cw, ch, { r: 10, fill: 'rgba(22,18,15,.9)', stroke: rgba(col.startsWith('#') ? col : '#888888', 0.55), lw: 2 });
        drawSchoolGlyph(ctx, id, cx + 38, cy + 40, 24, col);
        app.text(s.name, cx + 76, cy + 12, { size: 24, bold: true, color: col });
        app.text(s.blurb, cx + 76, cy + 44, { size: 14, italic: true, maxW: cw - 90, lineH: 17, color: 'rgba(232,220,196,.8)' });
        const total = GRAFT_LIST.filter((g) => g.school === id), seen = total.filter((g) => isSeen(app, 'grafts', g.id)).length;
        app.text(`${seen}/${total.length} grafts seen`, cx + 76, cy + 82, { size: 12, ui: true, color: 'rgba(232,220,196,.55)' });
        [3, 6].forEach((t, k) => {
          const yy = cy + 102 + k * 29;
          pill(app, `${t} grafts`, cx + 56, yy + 10, COL.lamp, { size: 12 });
          app.text(clampText(app, s.resonance[t] || '', cw - 130, 14, 2, { ui: true }), cx + 108, yy, { size: 14, ui: true, maxW: cw - 124, lineH: 15, color: COL.vellum });
        });
      });
    });
  },
  drawRules(app, x, y, w, h) {
    const ctx = app.ctx, gap = 14, cw = Math.floor((w - gap * 2) / 3), ch = Math.floor((h - gap) / 2);
    RULES.forEach(([title, text], i) => {
      const cx = x + (i % 3) * (cw + gap), cy = y + Math.floor(i / 3) * (ch + gap);
      app.panel(cx, cy, cw, ch, { r: 12, fill: 'rgba(22,18,15,.92)', stroke: 'rgba(232,220,196,.3)', lw: 2 });
      ctx.save(); ctx.beginPath(); ctx.rect(cx + 2, cy + 2, cw - 4, 156); ctx.clip();
      app.rr(cx + 6, cy + 6, cw - 12, 148, 8); ctx.fillStyle = 'rgba(232,220,196,.06)'; ctx.fill();
      ruleArt(app, i, cx + cw / 2, cy + 74, cw - 24, 140);
      ctx.restore();
      ctx.save(); ctx.fillStyle = COL.lamp; ctx.beginPath(); ctx.arc(cx + 26, cy + 174, 14, 0, 6.283); ctx.fill(); ctx.restore();
      app.text(String(i + 1), cx + 26, cy + 174 - 10, { size: 18, bold: true, align: 'center', color: COL.ink });
      app.text(title, cx + 48, cy + 162, { size: 18, bold: true, color: COL.lamp, maxW: cw - 60, lineH: 20 });
      app.text(text, cx + 16, cy + 192, { size: 14, ui: true, maxW: cw - 32, lineH: 17, color: COL.vellum });
    });
  },
};
