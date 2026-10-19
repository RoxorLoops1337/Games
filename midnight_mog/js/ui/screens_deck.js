// Midnight Mog meta screens, part 1: the deck builder, the cat roster with its detail view, and the relic collection.
// Part 2 (map, quests, bestiary, settings, Nine Lives) lives in screens_meta.js and imports the kit exported from here.
//
// Every screen follows docs/UI.md: Screen = {id, enter(app, params), update(app, dt, ui), draw(ctx, app, ui), exit(app)}.
// Every action calls a sim function, then app.setProfile(newProfile) and app.save(). Nothing here mutates a profile in place.
// Screen ids: 'deck', 'roster' (params {cat}), 'relics'.
//
// Sim helpers that the sim folder does not have yet (level up, deck editing, auto build) are exported here as pure
// functions on profiles so the bots, the tests and any other screen can reuse them:
//   levelUpCat(p, id, times) levelUpCard(p, id, times) starUpCat(p, id) catLevelCost(p, id) cardLevelCost(p, id)
//   deckAdd(p, cardId) deckRemoveAt(p, index) deckSort(p) autoBuildDeck(p) deckCurve(p) synergyHints(p) catStatsAt(cat, level, stars)
import { PAL, RARITY, RARITY_ORDER, ROLE_COLOR, rgba, mix, shade, glow, rarityColor, prism } from '../palette.js';
import { drawText, formatNum, wrapText } from '../render/text.js';
import * as CATART from '../render/catart.js';
import * as ICONS from '../render/icons.js';
import { chamfer, clamp, fin, inside } from './shell.js';
import { CATS, CAT_BY_ID, CAT_ROLES } from '../data/cats.js';
import { CARD_BY_ID } from '../data/cards.js';
import { RELICS, RELIC_BY_ID } from '../data/relics.js';
import { STAR_DUPES, MAX_STARS } from '../data/crates.js';
import { cost, levelMult, milestoneMult, starMult, multipliers, POOLS } from '../sim/economy.js';
import { deckPower, deckSlots, HAND_SIZE } from '../sim/deck.js';
import { starsForDupes } from '../sim/loot.js';
import { townStats, payWithXp, recordStats } from '../sim/town.js';

const TAU = Math.PI * 2;
const RARITY_POWER = { common: 1, rare: 2, epic: 4, legend: 8, mythic: 16 };
const RARITY_INDEX = Object.fromEntries(RARITY_ORDER.map((r, i) => [r, i]));

// =================================================================================================== kit (shared with screens_meta)

/** Guarded sound effect: app.audio may be null (tests) and unknown names are harmless. */
export function sfx(app, name) { try { if (app && app.audio && app.audio.sfx) app.audio.sfx(name); } catch (e) { /* audio is optional */ } }

/** Commit a new profile: setProfile then save. Returns the profile. */
export function commit(app, p) { app.setProfile(p); if (app.save) app.save(); return p; }

export function toast(app, msg, kind) { if (app && app.toast) app.toast(msg, kind || 'info'); }

/** "Need 340 more yarn" */
export function needMsg(cur, have, need) { return 'Need ' + formatNum(Math.max(1, Math.ceil(need - have))) + ' more ' + cur; }

export function curColor(cur) { return cur === 'fish' ? PAL.bone : cur === 'yarn' ? PAL.magenta : cur === 'gems' ? PAL.cyan : cur === 'tokens' ? PAL.lime : PAL.bone; }

export function goBack(app) { if (app && app.router) app.router.back(); }

/**
 * Backdrop, back button, title and currency strip. Returns {y, back}: y is where content may start, back is true on the frame
 * the back button was tapped (the caller decides what back means). o: {district, dim, back:false, sub, onBack}
 */
export function pageHeader(ui, app, title, o) {
  o = o || {};
  const ctx = ui.ctx, c = ui.content;
  ui.clear(PAL.void);
  ui.background(o.district || 'rooftop_row', { dim: o.dim === undefined ? 0.5 : o.dim });
  const top = c.y + 8;
  let back = false;
  let tx = c.x + 16;
  if (o.back !== false) {
    if (ui.button('hdr:back', { x: c.x + 12, y: top, w: 44, h: 44 }, '', { kind: 'icon', icon: 'back', aria: 'Back' })) back = true;
    if (ui.keyHit('escape') && !ui.hasDialog()) { ui.eatKey('escape'); back = true; }
    tx = c.x + 66;
  }
  drawText(ctx, title, tx, top + 31, { size: 26, kind: 'display', gradient: [PAL.bone, PAL.cyan], glow: 10, glowColor: PAL.cyan, maxWidth: c.x + c.w - 16 - tx });
  if (o.sub) drawText(ctx, o.sub, c.x + c.w - 16, top + 30, { size: 13, align: 'right', color: PAL.boneDim, maxWidth: c.w * 0.4 });
  ui.currencyStrip({ x: c.x + 12, y: top + 50, w: c.w - 24, h: 26 }, app.profile.cur);
  return { y: top + 84, back };
}

/** Small chamfered label. (x,y) is the top-left, or the top-right when o.right. Returns the chip width. */
export function chip(ctx, x, y, label, color, o) {
  o = o || {};
  const size = o.size || 12, h = o.h || 20, pad = 7;
  const iconW = o.icon ? h - 2 : 0;
  const tw = drawTextWidth(ctx, label, size);
  const w = Math.ceil(tw + pad * 2 + iconW);
  const x0 = o.right ? x - w : x;
  ctx.save();
  chamfer(ctx, x0, y, w, h, 4);
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = rgba(shade(color, -0.65), 0.95); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(color, 0.9); ctx.stroke();
  ctx.restore();
  if (o.icon) o.icon(ctx, x0 + h / 2 + 1, y + h / 2, h - 5);
  drawText(ctx, label, x0 + iconW + pad, y + h / 2 + size * 0.36, { size, weight: 800, color: o.textColor || PAL.bone, stroke: 2.5 });
  return w;
}
function drawTextWidth(ctx, label, size) { ctx.save(); ctx.font = '800 ' + size + 'px sans-serif'; const w = fin(ctx.measureText(String(label)).width); ctx.restore(); return w; }

/** Currency icon plus amount. align 'left' | 'right' on x. Returns the drawn width. */
export function price(ctx, ui, cur, amount, x, cy, size, ok, align) {
  const txt = formatNum(amount);
  const s = size || 14;
  const tw = drawTextWidth(ctx, txt, s) + 2;
  const iw = s * 1.2;
  const x0 = align === 'right' ? x - tw - iw : x;
  ICONS.drawCurrency(ctx, cur, x0 + iw / 2, cy, iw, ui ? ui.t : 0);
  drawText(ctx, txt, x0 + iw + 2, cy + s * 0.36, { size: s, weight: 800, color: ok === false ? PAL.magenta : PAL.bone, stroke: 3 });
  return tw + iw;
}

/** Five-point star. */
export function starShape(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath();
}

/** Row of `total` star slots, `n` filled. cx is the centre. */
export function starRow(ctx, n, total, cx, cy, r, t) {
  const gap = r * 2.35, x0 = cx - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    const x = x0 + i * gap, on = i < n;
    ctx.save();
    if (on) glow(ctx, x, cy, r * 2.4, PAL.cyan, 0.35 + 0.1 * Math.sin(fin(t) * 3 + i));
    starShape(ctx, x, cy, r); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = on ? PAL.bone : PAL.ink3; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = on ? PAL.cyan : PAL.slate; ctx.stroke();
    ctx.restore();
  }
}

/** Wrapped paragraph. Returns the y after the last line. */
export function para(ctx, str, x, y, maxW, o) {
  o = o || {};
  const size = o.size || 13, lh = o.lh || Math.round(size * 1.3);
  const lines = wrapText(ctx, str, maxW, { size, kind: 'body', weight: o.weight || 600 });
  const max = o.maxLines || lines.length;
  for (let i = 0; i < Math.min(lines.length, max); i++) {
    let s = lines[i];
    if (i === max - 1 && lines.length > max) s = s.replace(/\s*\S*$/, '') + '...';
    drawText(ctx, s, x, y + size + i * lh - 2, { size, weight: o.weight || 600, color: o.color || PAL.boneDim, align: o.align || 'left', stroke: 2 });
  }
  return y + Math.min(lines.length, max) * lh;
}

// =================================================================================================== sim helpers (pure, profile in, profile out)

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
function setCur(p, patch) { return { ...p, cur: { ...p.cur, ...patch } }; }

/** Cost discounts from the town (Training Dojo style buildings), as fractions 0..0.4. */
export function townDiscounts(p) {
  const ts = townStats(p);
  return { cat: clamp(fin(ts.catLevelDiscount), 0, 0.4), card: clamp(fin(ts.cardLevelDiscount === undefined ? ts.cardCostDiscount : ts.cardLevelDiscount), 0, 0.4) };
}

/** Yarn for the next level of a cat (Infinity at max level or when the cat is not owned). */
export function catLevelCost(p, id) {
  const c = p.cats && p.cats[id], def = CAT_BY_ID[id];
  if (!c || !def) return Infinity;
  const base = cost('cat_level', c.level, { rarity: def.rarity });
  return Number.isFinite(base) ? Math.ceil(base * (1 - townDiscounts(p).cat)) : Infinity;
}
export function cardLevelCost(p, id) {
  const c = p.cards && p.cards[id], def = CARD_BY_ID[id];
  if (!c || !def) return Infinity;
  const base = cost('card_level', c.level, { rarity: def.rarity });
  return Number.isFinite(base) ? Math.ceil(base * (1 - townDiscounts(p).card)) : Infinity;
}

/** Yarn plus training xp a cat level can be paid with. */
export function catBudget(p) { return fin(p.cur.yarn) + Math.floor(fin(p.town && p.town.xp)); }

/**
 * Raise a cat by up to `times` levels (stops when it cannot pay or hits the max). Training xp pays first (1 xp = 1 yarn).
 * Returns {ok, reason: null|'locked'|'max'|'poor', profile, levels, spent, need}.
 */
export function levelUpCat(p, id, times = 1) {
  if (!p.cats || !p.cats[id]) return { ok: false, reason: 'locked', profile: p, levels: 0, spent: 0, need: 0 };
  let q = p, levels = 0, spent = 0, need = 0, reason = null;
  for (let i = 0; i < Math.max(1, times); i++) {
    const c = q.cats[id];
    const pr = catLevelCost(q, id);
    if (!Number.isFinite(pr)) { reason = 'max'; break; }
    if (catBudget(q) < pr) { reason = 'poor'; need = pr - catBudget(q); break; }
    const pay = payWithXp(q, pr);
    q = setCur(pay.profile, { yarn: q.cur.yarn - pay.yarnDue });
    q = { ...q, cats: { ...q.cats, [id]: { ...c, level: c.level + 1 } } };
    q = recordStats(q, { catLevelUps: 1 });
    levels++; spent += pr;
  }
  return levels ? { ok: true, reason: null, profile: q, levels, spent, need: 0 } : { ok: false, reason, profile: p, levels: 0, spent: 0, need };
}

export function levelUpCard(p, id, times = 1) {
  if (!p.cards || !p.cards[id]) return { ok: false, reason: 'locked', profile: p, levels: 0, spent: 0, need: 0 };
  let q = p, levels = 0, spent = 0, need = 0, reason = null;
  for (let i = 0; i < Math.max(1, times); i++) {
    const c = q.cards[id];
    const pr = cardLevelCost(q, id);
    if (!Number.isFinite(pr)) { reason = 'max'; break; }
    if (q.cur.yarn < pr) { reason = 'poor'; need = pr - q.cur.yarn; break; }
    q = { ...setCur(q, { yarn: q.cur.yarn - pr }), cards: { ...q.cards, [id]: { ...c, level: c.level + 1 } } };
    levels++; spent += pr;
  }
  return levels ? { ok: true, reason: null, profile: q, levels, spent, need: 0 } : { ok: false, reason, profile: p, levels: 0, spent: 0, need };
}

/** Stars follow duplicates automatically when crates open. This only repairs a profile whose stars lag its dupes. */
export function starUpCat(p, id) {
  const c = p.cats && p.cats[id];
  if (!c) return { ok: false, reason: 'locked', profile: p };
  const want = Math.min(MAX_STARS, starsForDupes(c.dupes | 0));
  if (want <= (c.stars | 0)) return { ok: false, reason: 'none', profile: p };
  return { ok: true, reason: null, profile: { ...p, cats: { ...p.cats, [id]: { ...c, stars: want } } }, stars: want };
}

/** Stats of a cat at a level and star count: base plus per level, times the milestone and star multipliers (same as sim/effects). */
export function catStatsAt(cat, level, stars) {
  const L = Math.max(1, level | 0), mm = milestoneMult(L) * starMult(stars | 0);
  return {
    hp: (cat.base.hp + cat.perLevel.hp * (L - 1)) * mm,
    dmg: (cat.base.dmg + cat.perLevel.dmg * (L - 1)) * mm,
    range: cat.base.range, rate: cat.base.rate, speed: cat.base.speed, mult: mm,
  };
}

// ---- deck editing

/** Owned card ids with copies: [{id, card, count, level, inDeck, free}] sorted summons first, rarity descending, then name. */
export function ownedCards(p) {
  const used = {};
  for (const id of p.deck || []) used[id] = (used[id] || 0) + 1;
  const out = [];
  for (const id of Object.keys(p.cards || {})) {
    const e = p.cards[id], card = CARD_BY_ID[id];
    if (!card || !(e.count > 0)) continue;
    if (card.type === 'summon' && !(p.cats && p.cats[card.effect.cat])) continue;
    out.push({ id, card, count: e.count | 0, level: e.level | 0 || 1, inDeck: used[id] || 0, free: (e.count | 0) - (used[id] || 0) });
  }
  const tw = { summon: 0, spell: 1, trap: 2, build: 3 };
  out.sort((a, b) => tw[a.card.type] - tw[b.card.type] || RARITY_INDEX[b.card.rarity] - RARITY_INDEX[a.card.rarity] || (a.card.name < b.card.name ? -1 : 1));
  return out;
}

/** Add a card to the deck. reason: unowned | copies | full. */
export function deckAdd(p, id) {
  const e = p.cards && p.cards[id], card = CARD_BY_ID[id];
  if (!e || !card) return { ok: false, reason: 'unowned', profile: p };
  const deck = p.deck || [];
  if (deck.length >= deckSlots(p)) return { ok: false, reason: 'full', profile: p };
  if (deck.filter((x) => x === id).length >= (e.count | 0)) return { ok: false, reason: 'copies', profile: p };
  return { ok: true, reason: null, profile: { ...p, deck: deck.concat(id) } };
}

/** Remove the card at a deck index. Keeps at least HAND_SIZE cards and at least one summon. reason: min | summon | index. */
export function deckRemoveAt(p, index) {
  const deck = p.deck || [];
  if (!(index >= 0 && index < deck.length)) return { ok: false, reason: 'index', profile: p };
  if (deck.length <= HAND_SIZE) return { ok: false, reason: 'min', profile: p };
  const id = deck[index];
  const next = deck.filter((_, i) => i !== index);
  if (CARD_BY_ID[id] && CARD_BY_ID[id].type === 'summon' && !next.some((x) => CARD_BY_ID[x] && CARD_BY_ID[x].type === 'summon')) return { ok: false, reason: 'summon', profile: p };
  return { ok: true, reason: null, profile: { ...p, deck: next }, id };
}

/** Deck sorted by cost, then type, then name (cosmetic). */
export function deckSort(p) {
  const tw = { summon: 0, spell: 1, trap: 2, build: 3 };
  const deck = (p.deck || []).slice().sort((a, b) => {
    const A = CARD_BY_ID[a], B = CARD_BY_ID[b];
    return A.cost - B.cost || tw[A.type] - tw[B.type] || (a < b ? -1 : a > b ? 1 : 0);
  });
  return { ...p, deck };
}

/** Energy-cost histogram of the deck: counts for cost 0,1,2,3,4,5+. */
export function deckCurve(p) {
  const out = [0, 0, 0, 0, 0, 0];
  for (const id of p.deck || []) { const c = CARD_BY_ID[id]; if (c) out[Math.min(5, Math.max(0, c.cost | 0))]++; }
  return out;
}

const SPELL_PRIO = ['pounce', 'catnip_stash', 'curious_cat', 'hairball_barrage', 'lightning_whisker', 'meteor_of_yarn', 'moonlit_mend', 'catnip_surge', 'neon_flash',
  'cat_nap', 'zoomies', 'fish_stand', 'yarn_pylon', 'scratch_post_slam', 'starfall_purrade', 'midnight_howl', 'final_pounce', 'second_wind', 'tuna_tripwire', 'neon_mine',
  'mouse_trap_mk2', 'bear_trap_bell', 'fortified_roof', 'water_tower_pump', 'cardboard_fort', 'fur_ball', 'tail_flick'];

/**
 * Best deck from what the player owns: about 60% cats with a tank, ranged, melee and support spread, then the best spells and
 * traps, then fill. Honours copies owned and the slot limit. Returns an array of card ids (always at least one summon when
 * the player owns any).
 */
export function autoBuildDeck(p) {
  const slots = deckSlots(p);
  const own = ownedCards(p);
  const summons = own.filter((o) => o.card.type === 'summon');
  const nSummon = clamp(Math.round(slots * 0.6), Math.min(5, summons.length), 9);
  const catOf = (o) => CAT_BY_ID[o.card.effect.cat];
  const value = (o) => {
    const cat = catOf(o), e = p.cats[cat.id];
    return RARITY_POWER[cat.rarity] * levelMult(e.level) * starMult(e.stars) / Math.pow(Math.max(1, o.card.cost), 0.55);
  };
  summons.sort((a, b) => value(b) - value(a) || (a.id < b.id ? -1 : 1));
  const chosen = [];
  const have = (id) => chosen.filter((x) => x === id).length;
  const take = (o) => { if (have(o.id) < o.count && chosen.length < nSummon) { chosen.push(o.id); return true; } return false; };
  for (const want of [['tank'], ['archer', 'mage'], ['brawler', 'trapper'], ['support', 'archer', 'mage']]) {
    const o = summons.find((s) => want.includes(catOf(s).role) && have(s.id) === 0);
    if (o) take(o);
  }
  for (let again = true; again && chosen.length < nSummon;) {
    again = false;
    for (const o of summons) if (chosen.length < nSummon && have(o.id) < Math.min(2, o.count)) { take(o); again = true; }
  }
  const deck = chosen.slice();
  const others = new Map(own.filter((o) => o.card.type !== 'summon').map((o) => [o.id, o]));
  for (const id of SPELL_PRIO) { const o = others.get(id); if (deck.length < slots && o && !deck.includes(id)) deck.push(id); }
  const pw = (o) => RARITY_POWER[o.card.rarity] * levelMult(o.level);
  const rest = own.slice().sort((a, b) => pw(b) - pw(a) || (a.id < b.id ? -1 : 1));
  for (const o of rest) while (deck.length < slots && deck.filter((x) => x === o.id).length < o.count) deck.push(o.id);
  return deck.slice(0, slots);
}

/** Tag counts of the deck: cat tags and roles from summon cards, card types from the rest. */
function deckTags(p) {
  const tags = {};
  const add = (k) => { tags[k] = (tags[k] || 0) + 1; };
  for (const id of p.deck || []) {
    const card = CARD_BY_ID[id];
    if (!card) continue;
    add(card.type);
    if (card.type === 'summon') { const cat = CAT_BY_ID[card.effect.cat]; if (cat) { add(cat.role); for (const t of cat.tags) add(t); } }
  }
  return tags;
}

/** Up to four short hints: relic and tag synergies first, then problems. [{text, kind:'good'|'warn'}] */
export function synergyHints(p) {
  const tags = deckTags(p), hints = [];
  const owned = Object.keys(p.relics || {}).filter((k) => p.relics[k] && RELIC_BY_ID[k]);
  const found = [];
  for (const id of owned) {
    const r = RELIC_BY_ID[id];
    let best = null;
    for (const s of r.synergy || []) if (tags[s] >= 2 && (!best || tags[s] > best.n)) best = { n: tags[s], tag: s };
    if (best) found.push({ r, ...best, score: best.n * (1 + RARITY_INDEX[r.rarity]) });
  }
  found.sort((a, b) => b.score - a.score || (a.r.id < b.r.id ? -1 : 1));
  for (const f of found.slice(0, 2)) hints.push({ text: f.r.name + ' x' + f.n + ' ' + f.tag, kind: 'good' });
  const info = deckPower(p);
  const curve = deckCurve(p);
  const warns = [];
  if (!tags.summon) warns.push('No cat cards');
  if (!tags.tank) warns.push('No tank');
  if (!(tags.archer || tags.mage)) warns.push('No ranged cats');
  if (info.avgCost > 3.2) warns.push('Heavy curve');
  if (!(curve[0] + curve[1])) warns.push('Nothing cheap');
  for (const w of warns.slice(0, 4 - hints.length)) hints.push({ text: w, kind: 'warn' });
  if (!hints.length) hints.push({ text: 'Balanced deck', kind: 'good' });
  return hints.slice(0, 4);
}

// =================================================================================================== deck builder

const TYPE_FILTERS = [{ id: 'all', label: 'ALL' }, { id: 'summon', label: 'CATS' }, { id: 'spell', label: 'SPELLS' }, { id: 'trap', label: 'TRAPS' }, { id: 'build', label: 'BUILD' }];
const CURVE_COLORS = [PAL.lime, PAL.lime, PAL.cyan, PAL.cyan, PAL.violetHi, PAL.magenta];

export function createDeckScreen() {
  const S = { filter: 'all', sel: null, flash: -1, flashT: 0, dragId: '', shake: 0 };
  const screen = {
    id: 'deck',
    state: S,
    enter(app, params) {
      S.filter = (params && params.filter) || 'all';
      S.sel = (params && params.card) || (app.profile.deck && app.profile.deck[0]) || null;
      S.flash = -1; S.flashT = 0; S.dragId = ''; S.shake = 0;
    },
    update(app, dt) { S.flashT = Math.max(0, S.flashT - dt); S.shake = Math.max(0, S.shake - dt * 3); },
    draw(ctx, app, ui) {
      const p = app.profile;
      const hd = pageHeader(ui, app, 'DECK', { sub: 'Tap to add, tap a slot to remove' });
      if (hd.back) { goBack(app); return; }
      const c = ui.content, X = c.x + 12, W = c.w - 24;
      const botY = c.y + c.h - 10;
      let y = hd.y;
      const info = deckPower(p);
      const slots = info.slots;
      const deck = p.deck || [];

      // ---- deck panel
      const cols = slots <= 12 ? 6 : Math.ceil(slots / 2), rows = Math.ceil(Math.max(slots, deck.length) / cols), gap = 5;
      let cw = (W - 20 - gap * (cols - 1)) / cols, ch = cw * 1.4;
      const maxDeckH = Math.max(120, ui.h * 0.27);
      if (rows * ch + (rows - 1) * gap + 30 > maxDeckH) { ch = (maxDeckH - 30 - (rows - 1) * gap) / rows; cw = ch / 1.4; }
      const panelH = rows * ch + (rows - 1) * gap + 30;
      const deckRect = { x: X, y: y + 10, w: W, h: panelH };
      const dragCol = ui.down && ui.dragging && ui.pressId.indexOf('col:') === 0;
      const over = dragCol && inside(deckRect, ui.px, ui.py);
      const inner = ui.panel(deckRect, { title: 'DECK ' + deck.length + '/' + slots, glow: over, color: over ? PAL.cyan : undefined });
      const gridW = cols * cw + (cols - 1) * gap, gx = inner.x + (inner.w - gridW) / 2;
      // drops resolve against last frame's regions, the rect is stable
      const dp = ui.drop;
      if (dp && dp.id.indexOf('col:') === 0 && inside(deckRect, dp.x, dp.y)) this.add(app, ui, dp.id.slice(4));
      else if (dp && dp.id.indexOf('slot:') === 0 && !inside(deckRect, dp.x, dp.y)) this.remove(app, ui, parseInt(dp.id.slice(5), 10));
      const dk = app.profile.deck || [];
      for (let i = 0; i < Math.max(slots, dk.length); i++) {
        const r = { x: gx + (i % cols) * (cw + gap), y: inner.y + 2 + Math.floor(i / cols) * (ch + gap), w: cw, h: ch };
        if (i < dk.length) {
          const id = dk[i], e = app.profile.cards[id];
          const st = ui.card('slot:' + i, r, id, { compact: true, selected: S.sel === id });
          if (e && e.level > 1) drawText(ctx, 'L' + e.level, r.x + r.w / 2, r.y + r.h - 4, { size: Math.max(9, cw * 0.19), weight: 800, align: 'center', stroke: 3 });
          if (S.flash === i && S.flashT > 0) {
            const k = 1 - S.flashT / 0.5;
            ctx.save(); ctx.globalAlpha = 1 - k; chamfer(ctx, r.x - k * 6, r.y - k * 6, r.w + k * 12, r.h + k * 12, 5); ctx.lineWidth = 2; ctx.strokeStyle = PAL.cyan; ctx.stroke(); ctx.restore();
          }
          if (st.tap) { S.sel = id; this.remove(app, ui, i); }
          else if (st.long) { S.sel = id; }
          if (st.hover) ui.tip(r, CARD_BY_ID[id].name, CARD_BY_ID[id].text);
        } else {
          ctx.save(); ctx.setLineDash([4, 4]); chamfer(ctx, r.x, r.y, r.w, r.h, 5); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(PAL.violetHi, over ? 0.9 : 0.45); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = rgba(PAL.violetHi, 0.45); ctx.fillRect(r.x + r.w / 2 - 6, r.y + r.h / 2 - 1, 12, 2); ctx.fillRect(r.x + r.w / 2 - 1, r.y + r.h / 2 - 6, 2, 12);
          ctx.restore();
        }
      }
      y = deckRect.y + deckRect.h + 8;

      // ---- stats panel: curve histogram, numbers, buttons
      const statsH = 88;
      const sp = ui.panel({ x: X, y, w: W, h: statsH }, { pad: 8 });
      const curve = deckCurve(app.profile);
      const maxC = Math.max(3, ...curve);
      const hx = sp.x, hw = Math.min(150, sp.w * 0.42), hh = sp.h - 26;
      const bw = hw / 6;
      for (let i = 0; i < 6; i++) {
        const bh = Math.max(curve[i] ? 4 : 1, (curve[i] / maxC) * hh), bx = hx + i * bw + 2;
        ctx.fillStyle = curve[i] ? CURVE_COLORS[i] : rgba(PAL.violet, 0.6);
        ctx.fillRect(bx, sp.y + hh - bh, bw - 4, bh);
        if (curve[i]) { ctx.fillStyle = rgba(PAL.bone, 0.7); ctx.fillRect(bx, sp.y + hh - bh, bw - 4, 1); drawText(ctx, curve[i], bx + (bw - 4) / 2, sp.y + hh - bh - 2, { size: 11, weight: 800, align: 'center', stroke: 2.5 }); }
        drawText(ctx, i === 5 ? '5+' : String(i), bx + (bw - 4) / 2, sp.y + sp.h, { size: 11, weight: 800, align: 'center', color: PAL.boneDim, stroke: 2 });
      }
      const ix = hx + hw + 10;
      const bwid = Math.min(96, sp.w * 0.3);
      drawText(ctx, 'AVG COST', ix, sp.y + 12, { size: 11, weight: 800, color: PAL.boneDim, stroke: 2 });
      drawText(ctx, info.avgCost.toFixed(1), ix, sp.y + 34, { size: 24, kind: 'display', color: info.avgCost > 3.2 ? PAL.magenta : PAL.cyan });
      drawText(ctx, 'POWER ' + formatNum(info.power, { decimals: 1 }), ix, sp.y + 50, { size: 12, weight: 800, color: PAL.bone, stroke: 2.5 });
      const t = info.types;
      drawText(ctx, t.summon + ' cats  ' + t.spell + ' spells  ' + (t.trap + t.build) + ' other', ix, sp.y + sp.h - 2, { size: 11, weight: 700, color: PAL.boneDim, stroke: 2, maxWidth: sp.x + sp.w - bwid - 8 - ix });
      const bx = sp.x + sp.w - bwid;
      if (ui.button('deck:auto', { x: bx, y: sp.y - 2, w: bwid, h: 34 }, 'AUTO', { kind: 'primary', size: 16 })) this.auto(app, ui);
      if (ui.button('deck:sort', { x: bx, y: sp.y + 38, w: bwid, h: 34 }, 'SORT', { kind: 'secondary', size: 14 })) {
        commit(app, deckSort(app.profile)); sfx(app, 'card_cycle'); S.flash = -1;
      }
      y += statsH + 6;

      // ---- hints
      const hints = synergyHints(app.profile);
      let hxp = X;
      for (const h of hints) {
        const col = h.kind === 'good' ? PAL.lime : PAL.magenta;
        const wch = chip(ctx, hxp, y, h.text, col, { size: 12 });
        hxp += wch + 6;
        if (hxp > X + W) break;
      }
      for (const issue of info.issues) { if (issue.indexOf('over') >= 0 || issue.indexOf('copies') >= 0) { chip(ctx, X + W, y, '!', PAL.magenta, { right: true }); break; } }
      y += 26;

      // ---- filter tabs
      S.filter = ui.tabs('deck:filter', { x: X, y, w: W, h: 34 }, TYPE_FILTERS, S.filter);
      y += 40;

      // ---- detail strip (bottom) and collection (fills the middle)
      const detH = 96;
      const detY = botY - detH;
      const colH = Math.max(100, detY - 8 - y);
      this.collection(ctx, app, ui, { x: X, y, w: W, h: colH });
      this.detail(ctx, app, ui, { x: X, y: detY, w: W, h: detH });

      // ---- drag ghost on top
      const dragId = ui.down && ui.dragging ? ui.pressId : '';
      if (dragId.indexOf('col:') === 0 || dragId.indexOf('slot:') === 0) {
        const id = dragId.indexOf('col:') === 0 ? dragId.slice(4) : (app.profile.deck || [])[parseInt(dragId.slice(5), 10)];
        if (id) {
          ctx.save(); ctx.globalAlpha = 0.9;
          ui.card('ghost', { x: ui.px - cw * 0.6, y: ui.py - ch * 0.9, w: cw * 1.2, h: ch * 1.2 }, id, { compact: true, noRegion: true, selected: true });
          ctx.restore();
        }
      }
      ui.vignette(0.4);
    },
    add(app, ui, id) {
      const r = deckAdd(app.profile, id);
      S.sel = id;
      if (r.ok) {
        commit(app, r.profile); S.flash = r.profile.deck.length - 1; S.flashT = 0.5; sfx(app, 'card_select');
        ui.announce('Added ' + CARD_BY_ID[id].name);
      } else {
        sfx(app, 'deny');
        toast(app, r.reason === 'full' ? 'Deck is full' : r.reason === 'copies' ? 'No spare copies of ' + CARD_BY_ID[id].name : 'Not owned', 'warn');
      }
    },
    remove(app, ui, index) {
      const r = deckRemoveAt(app.profile, index);
      if (r.ok) { commit(app, r.profile); S.flash = -1; sfx(app, 'card_cycle'); ui.announce('Removed ' + CARD_BY_ID[r.id].name); }
      else { sfx(app, 'deny'); toast(app, r.reason === 'min' ? 'Keep at least ' + HAND_SIZE + ' cards' : r.reason === 'summon' ? 'Keep at least one cat card' : 'Nothing there', 'warn'); }
    },
    auto(app, ui) {
      const before = deckPower(app.profile).power;
      const deck = autoBuildDeck(app.profile);
      if (deck.length < HAND_SIZE) { toast(app, 'Not enough cards to build a deck', 'warn'); sfx(app, 'deny'); return; }
      const next = { ...app.profile, deck };
      commit(app, next);
      const after = deckPower(next).power;
      sfx(app, 'card_play');
      toast(app, 'Deck built, power ' + formatNum(after, { decimals: 1 }) + (after > before ? ' (+' + formatNum(after - before, { decimals: 1 }) + ')' : ''), 'ok');
      ui.announce('Deck rebuilt');
    },
    collection(ctx, app, ui, r) {
      const list = ownedCards(app.profile).filter((o) => S.filter === 'all' || o.card.type === S.filter);
      if (!list.length) { drawText(ctx, 'Nothing here yet. Open crates to find more.', r.x + r.w / 2, r.y + r.h / 2, { size: 14, align: 'center', color: PAL.boneDim }); return; }
      const rows = r.h >= 330 ? 3 : r.h >= 190 ? 2 : 1, gap = 6;
      const ch = (r.h - 12 - gap * (rows - 1) - 4) / rows, cw = ch / 1.4;
      const nCols = Math.ceil(list.length / rows);
      const content = nCols * (cw + gap) + gap;
      ui.scroll('deck:col', r, content, () => {
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          const cr = { x: gap + Math.floor(i / rows) * (cw + gap), y: 10 + (i % rows) * (ch + gap), w: cw, h: ch };
          const st = ui.card('col:' + o.id, cr, o.card, { level: o.level, count: o.free, disabled: o.free <= 0, selected: S.sel === o.id, compact: ch < 100 });
          if (st.tap) this.add(app, ui, o.id);
          else if (st.long) S.sel = o.id;
          if (st.hover && !ui.down) ui.tip(cr, o.card.name, o.card.text);
          if (o.inDeck) {
            ctx.save(); chamfer(ctx, cr.x + cr.w - 22, cr.y + cr.h * 0.5 - 8, 20, 16, 4); ctx.fillStyle = rgba(PAL.ink, 0.85); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = PAL.cyan; ctx.stroke(); ctx.restore();
            drawText(ctx, o.inDeck + '/' + o.count, cr.x + cr.w - 12, cr.y + cr.h * 0.5 + 4, { size: 10, weight: 800, align: 'center', stroke: 2.5 });
          }
        }
      }, { axis: 'x' });
    },
    detail(ctx, app, ui, r) {
      const p = app.profile;
      const id = S.sel && p.cards[S.sel] ? S.sel : null;
      const inn = ui.panel(r, { pad: 8, rarity: id ? CARD_BY_ID[id].rarity : undefined });
      if (!id) { drawText(ctx, 'Pick a card to see its text and level it up.', inn.x + inn.w / 2, inn.y + inn.h / 2 + 5, { size: 13, align: 'center', color: PAL.boneDim, maxWidth: inn.w }); return; }
      const card = CARD_BY_ID[id], e = p.cards[id];
      const cardW = inn.h / 1.4;
      ui.card('det:card', { x: inn.x, y: inn.y, w: cardW, h: inn.h }, card, { compact: true, noRegion: true, level: e.level });
      const btnW = Math.min(122, inn.w * 0.36);
      const tx = inn.x + cardW + 8, tw = inn.w - cardW - 8 - btnW - 8;
      drawText(ctx, card.name, tx, inn.y + 15, { size: 15, kind: 'display', color: card.rarity === 'legend' || card.rarity === 'mythic' ? rarityColor(card.rarity) : PAL.bone, maxWidth: tw });
      chip(ctx, tx, inn.y + 22, card.type.toUpperCase() + '  COST ' + card.cost, rarityColor(card.rarity), { size: 11, h: 17 });
      para(ctx, card.text, tx, inn.y + 42, tw, { size: 12, lh: 14, maxLines: 3 });
      // level buttons
      const bh = card.type === 'summon' ? (inn.h - 4) / 2 : inn.h;
      const cp = cardLevelCost(p, id), maxed = !Number.isFinite(cp);
      const ok = !maxed && p.cur.yarn >= cp;
      const bx = inn.x + inn.w - btnW;
      if (ui.button('det:card_lv', { x: bx, y: inn.y, w: btnW, h: bh }, maxed ? 'MAX' : 'CARD LV ' + (e.level + 1), { kind: ok ? 'positive' : 'secondary', size: 13, sub: maxed ? 'Lv ' + e.level : formatNum(cp) + ' yarn', disabled: maxed })) {
        const res = levelUpCard(app.profile, id);
        if (res.ok) { commit(app, res.profile); sfx(app, 'reward_tick'); toast(app, card.name + ' is now Lv ' + res.profile.cards[id].level, 'ok'); }
        else { sfx(app, 'deny'); toast(app, needMsg('yarn', p.cur.yarn, cp), 'warn'); }
      }
      if (card.type === 'summon') {
        const cat = CAT_BY_ID[card.effect.cat], ce = p.cats[cat.id];
        const cc = catLevelCost(p, cat.id), cmax = !Number.isFinite(cc);
        const cok = !cmax && catBudget(p) >= cc;
        if (ui.button('det:cat_lv', { x: bx, y: inn.y + bh + 4, w: btnW, h: bh }, cmax ? 'MAX' : 'CAT LV ' + (ce.level + 1), { kind: cok ? 'positive' : 'secondary', size: 13, sub: cmax ? 'Lv ' + ce.level : formatNum(cc) + ' yarn', disabled: cmax })) {
          const res = levelUpCat(app.profile, cat.id);
          if (res.ok) { commit(app, res.profile); sfx(app, 'reward_tick'); toast(app, cat.name + ' is now Lv ' + res.profile.cats[cat.id].level, 'ok'); }
          else { sfx(app, 'deny'); toast(app, needMsg('yarn', catBudget(p), cc), 'warn'); }
        }
      }
    },
    exit() { S.dragId = ''; },
  };
  return screen;
}

// =================================================================================================== roster and cat detail

const ROLE_FILTERS = ['all'].concat(CAT_ROLES);

function roleIcon(role) { return (ctx, cx, cy, s) => { if (role === 'all') { ctx.fillStyle = PAL.bone; ctx.fillRect(cx - s * 0.3, cy - s * 0.3, s * 0.25, s * 0.25); ctx.fillRect(cx + s * 0.05, cy - s * 0.3, s * 0.25, s * 0.25); ctx.fillRect(cx - s * 0.3, cy + s * 0.05, s * 0.25, s * 0.25); ctx.fillRect(cx + s * 0.05, cy + s * 0.05, s * 0.25, s * 0.25); } else ICONS.drawRoleIcon(ctx, role, cx, cy, s); }; }

export function createRosterScreen() {
  const S = { view: 'grid', cat: null, role: 'all', n: 0 };
  const screen = {
    id: 'roster',
    state: S,
    enter(app, params) {
      S.role = 'all';
      S.cat = params && params.cat && CAT_BY_ID[params.cat] ? params.cat : null;
      S.view = S.cat ? 'detail' : 'grid';
    },
    update() {},
    draw(ctx, app, ui) {
      const p = app.profile;
      const owned = CATS.filter((c) => p.cats[c.id]).length;
      const hd = pageHeader(ui, app, S.view === 'detail' ? 'CAT' : 'CATS', { sub: owned + '/' + CATS.length + ' collected' });
      if (hd.back) { if (S.view === 'detail') S.view = 'grid'; else goBack(app); return; }
      if (S.view === 'detail' && S.cat) this.detail(ctx, app, ui, hd.y);
      else this.grid(ctx, app, ui, hd.y);
      ui.vignette(0.4);
    },
    grid(ctx, app, ui, y0) {
      const p = app.profile, c = ui.content, X = c.x + 12, W = c.w - 24;
      // role chips
      const chipW = (W - 6 * 6) / 7;
      for (let i = 0; i < ROLE_FILTERS.length; i++) {
        const role = ROLE_FILTERS[i];
        if (ui.button('ros:role:' + role, { x: X + i * (chipW + 6), y: y0, w: chipW, h: 40 }, '', { kind: 'icon', icon: roleIcon(role), toggled: S.role === role, size: 24, aria: role })) S.role = role;
      }
      const list = CATS.filter((cat) => S.role === 'all' || cat.role === S.role).slice().sort((a, b) => {
        const oa = p.cats[a.id] ? 0 : 1, ob = p.cats[b.id] ? 0 : 1;
        return oa - ob || RARITY_INDEX[b.rarity] - RARITY_INDEX[a.rarity] || (a.name < b.name ? -1 : 1);
      });
      const colsN = c.w >= 480 ? 5 : 4, gap = 8;
      const tw = (W - gap * (colsN - 1)) / colsN, th = tw * 1.25;
      const top = y0 + 48, view = { x: X - 4, y: top, w: W + 8, h: c.y + c.h - top - 6 };
      const rows = Math.ceil(list.length / colsN);
      ui.scroll('ros:grid', view, rows * (th + gap) + gap, () => {
        for (let i = 0; i < list.length; i++) {
          const cat = list[i], e = p.cats[cat.id];
          const r = { x: 4 + (i % colsN) * (tw + gap), y: gap + Math.floor(i / colsN) * (th + gap), w: tw, h: th };
          const canUp = e && (p.deck || []).includes('call_' + cat.id) && Number.isFinite(catLevelCost(p, cat.id)) && catBudget(p) >= catLevelCost(p, cat.id);
          const st = ui.catTile('ros:' + cat.id, r, cat.id, { level: e ? e.level : 0, stars: e ? e.stars : 0, locked: !e, badge: canUp ? '!' : 0 });
          if (st.tap) { S.cat = cat.id; S.view = 'detail'; sfx(app, 'card_select'); }
        }
      });
    },
    detail(ctx, app, ui, y0) {
      const p = app.profile, c = ui.content, X = c.x + 12, W = c.w - 24;
      const cat = CAT_BY_ID[S.cat];
      if (!cat) { S.view = 'grid'; return; }
      const e = p.cats[cat.id];
      const role = ROLE_COLOR[cat.role], rc = rarityColor(cat.rarity);
      // bottom action bar
      const barH = 58, barY = c.y + c.h - barH - 8;
      // prev / next
      const order = CATS.map((x) => x.id), ix = order.indexOf(cat.id);
      if (ui.button('cat:prev', { x: X, y: y0 - 2, w: 44, h: 36 }, '', { kind: 'icon', icon: 'back', aria: 'Previous cat' })) S.cat = order[(ix + order.length - 1) % order.length];
      if (ui.button('cat:next', { x: X + W - 44, y: y0 - 2, w: 44, h: 36 }, '', { kind: 'icon', icon: 'play', aria: 'Next cat' })) S.cat = order[(ix + 1) % order.length];
      drawText(ctx, cat.name, X + W / 2, y0 + 24, { size: 22, kind: 'display', align: 'center', color: cat.rarity === 'legend' || cat.rarity === 'mythic' ? rc : PAL.bone, maxWidth: W - 110, glow: cat.rarity === 'common' ? 0 : 8, glowColor: rc });
      const view = { x: X - 4, y: y0 + 40, w: W + 8, h: barY - 8 - (y0 + 40) };
      const heroH = clamp(view.h * 0.36, 150, 230);
      ui.scroll('cat:scroll', view, heroH + 600, (cx, w, sy) => {
        const lx = 4, lw = W;
        let y = 2;
        // hero
        const hr = { x: lx, y, w: lw, h: heroH };
        cx.save(); chamfer(cx, hr.x, hr.y, hr.w, hr.h, 8); cx.clip();
        CATART.drawCatPortrait(cx, cat.id, hr.x, hr.y, hr.w, hr.h, { t: ui.t, level: e ? e.level : 1, stars: e ? e.stars : 0 });
        if (!e) { cx.fillStyle = rgba(PAL.void, 0.78); cx.fillRect(hr.x, hr.y, hr.w, hr.h); drawText(cx, '?', hr.x + hr.w / 2, hr.y + hr.h / 2 + 30, { size: 90, kind: 'display', align: 'center', color: PAL.slate }); }
        cx.restore();
        CATART.drawRarityFrame(cx, cat.rarity, hr.x, hr.y, hr.w, hr.h, ui.t, { chamfer: 8 });
        chip(cx, hr.x + 10, hr.y + 10, RARITY[cat.rarity].name.toUpperCase(), rc, { size: 12 });
        chip(cx, hr.x + hr.w - 10, hr.y + 10, cat.role.toUpperCase(), role, { size: 12, right: true, icon: (c2, ix2, iy2, s) => ICONS.drawRoleIcon(c2, cat.role, ix2, iy2, s) });
        if (e) {
          drawText(cx, 'LV ' + e.level, hr.x + 14, hr.y + hr.h - 12, { size: 26, kind: 'display', color: PAL.bone });
        }
        y += heroH + 12;
        // stars
        const stars = e ? e.stars : 0, dupes = e ? e.dupes : 0;
        const sp = ui.panel({ x: lx, y, w: lw, h: 108 }, { title: 'STARS', pad: 10 });
        starRow(cx, stars, MAX_STARS, sp.x + sp.w / 2, sp.y + 16, 10, ui.t);
        if (stars < MAX_STARS) {
          const need = STAR_DUPES[stars], prev = stars > 0 ? STAR_DUPES[stars - 1] : 0;
          ui.bar({ x: sp.x, y: sp.y + 40, w: sp.w, h: 16 }, (dupes - prev) / Math.max(1, need - prev), { kind: 'progress', label: formatNum(dupes) + ' / ' + formatNum(need) + ' copies' });
          drawText(cx, 'Next star: +' + Math.round((starMult(stars + 1) - starMult(stars)) * 100) + '% HP and damage', sp.x + sp.w / 2, sp.y + 76, { size: 12, align: 'center', color: PAL.boneDim, stroke: 2, maxWidth: sp.w });
        } else drawText(cx, 'Max stars. Extra copies pay yarn.', sp.x + sp.w / 2, sp.y + 56, { size: 13, align: 'center', color: PAL.boneDim });
        y += 108 + 22;
        // stats
        const L = e ? e.level : 1;
        const now = catStatsAt(cat, L, stars), nxt = catStatsAt(cat, L + 1, stars);
        const stp = ui.panel({ x: lx, y, w: lw, h: 190 }, { title: 'STATS AT LV ' + L, pad: 10 });
        const rowsS = [['HP', now.hp, nxt.hp - now.hp, PAL.hp], ['DAMAGE', now.dmg, nxt.dmg - now.dmg, PAL.cyan], ['RANGE', now.range, 0, PAL.boneDim], ['ATTACKS / S', now.rate, 0, PAL.boneDim], ['SPEED', now.speed, 0, PAL.boneDim]];
        for (let i = 0; i < rowsS.length; i++) {
          const ry = stp.y + 8 + i * 25, rr = rowsS[i];
          drawText(cx, rr[0], stp.x, ry + 9, { size: 12, weight: 800, color: PAL.boneDim, stroke: 2 });
          const txt = rr[0] === 'RANGE' || rr[0] === 'ATTACKS / S' || rr[0] === 'SPEED' ? (rr[1] === 0 ? 'holds' : String(Math.round(rr[1] * 100) / 100)) : formatNum(rr[1]);
          drawText(cx, txt, stp.x + stp.w * 0.5, ry + 10, { size: 15, weight: 800, align: 'right', color: PAL.bone, stroke: 3 });
          if (rr[2] > 0 && e && Number.isFinite(catLevelCost(p, cat.id))) drawText(cx, '+' + formatNum(rr[2]), stp.x + stp.w * 0.5 + 8, ry + 10, { size: 13, weight: 800, color: PAL.lime, stroke: 3 });
        }
        drawText(cx, 'Milestone x' + milestoneMult(L) + '   Stars x' + starMult(stars).toFixed(2), stp.x, stp.y + stp.h - 4, { size: 12, color: PAL.boneDim, weight: 700, stroke: 2 });
        y += 190 + 22;
        // ability
        const ab = cat.ability;
        const ap = ui.panel({ x: lx, y, w: lw, h: 112 }, { title: 'ABILITY', pad: 10, color: role });
        drawText(cx, ab.name, ap.x, ap.y + 16, { size: 17, kind: 'display', color: PAL.bone, maxWidth: ap.w * 0.62 });
        chip(cx, ap.x + ap.w, ap.y + 2, ab.cooldown + 's cooldown', role, { right: true, size: 11, h: 18 });
        para(cx, ab.text, ap.x, ap.y + 26, ap.w, { size: 13, maxLines: 2 });
        const tagsY = ap.y + ap.h - 22;
        let tx = ap.x;
        for (const t of cat.tags) { tx += chip(cx, tx, tagsY, t, PAL.violetHi, { size: 11, h: 18 }) + 5; }
        y += 112 + 18;
        para(cx, '"' + cat.flavor + '"', lx + 8, y, lw - 16, { size: 13, color: PAL.boneDim, weight: 600, maxLines: 3 });
      });
      // bottom bar
      const bw3 = (W - 16) / 3;
      if (!e) {
        drawText(ctx, 'Not found yet. Open crates to meet this cat.', X + W / 2, barY + 22, { size: 14, align: 'center', color: PAL.boneDim, maxWidth: W });
        return;
      }
      const cc = catLevelCost(p, cat.id), maxed = !Number.isFinite(cc), budget = catBudget(p);
      const ok1 = !maxed && budget >= cc;
      if (ui.button('cat:lv1', { x: X, y: barY, w: bw3 * 1.25, h: barH }, maxed ? 'MAX LEVEL' : 'LEVEL UP', { kind: ok1 ? 'positive' : 'secondary', size: 17, sub: maxed ? '' : formatNum(cc) + ' yarn', disabled: maxed })) {
        const r = levelUpCat(app.profile, cat.id);
        if (r.ok) { commit(app, r.profile); sfx(app, 'reward_tick'); toast(app, cat.name + ' Lv ' + r.profile.cats[cat.id].level, 'ok'); }
        else { sfx(app, 'deny'); toast(app, needMsg('yarn', budget, cc), 'warn'); }
      }
      const x10 = costRangeCat(p, cat.id, 10);
      const ok10 = !maxed && Number.isFinite(x10.total) && budget >= x10.total;
      if (ui.button('cat:lv10', { x: X + bw3 * 1.25 + 8, y: barY, w: bw3 * 0.8, h: barH }, 'x10', { kind: ok10 ? 'primary' : 'secondary', size: 17, sub: x10.n ? formatNum(x10.total) : '', disabled: maxed })) {
        const r = levelUpCat(app.profile, cat.id, 10);
        if (r.ok) { commit(app, r.profile); sfx(app, 'reward_tick'); toast(app, cat.name + ' +' + r.levels + ' levels', 'ok'); }
        else { sfx(app, 'deny'); toast(app, needMsg('yarn', budget, x10.total), 'warn'); }
      }
      const cardId = 'call_' + cat.id;
      const inDeck = (p.deck || []).includes(cardId);
      if (ui.button('cat:deck', { x: X + bw3 * 2.05 + 16, y: barY, w: W - bw3 * 2.05 - 16, h: barH }, inDeck ? 'IN DECK' : 'TO DECK', { kind: inDeck ? 'info' : 'secondary', size: 15 })) {
        if (app.router) app.router.go('deck', { card: cardId });
      }
      if (e && starsForDupes(e.dupes | 0) > (e.stars | 0)) {
        const r = starUpCat(p, cat.id);
        if (r.ok) { commit(app, r.profile); toast(app, cat.name + ' reached ' + r.stars + ' stars', 'ok'); }
      }
    },
    exit() {},
  };
  return screen;
}

/** Cost to raise a cat `n` levels (stops early at max). Returns {n, total}. */
export function costRangeCat(p, id, n) {
  let total = 0, k = 0;
  const c = p.cats && p.cats[id];
  if (!c) return { n: 0, total: Infinity };
  for (let i = 0; i < n; i++) {
    const level = c.level + i;
    const base = cost('cat_level', level, { rarity: CAT_BY_ID[id].rarity });
    if (!Number.isFinite(base)) break;
    total += Math.ceil(base * (1 - townDiscounts(p).cat)); k++;
  }
  return { n: k, total: k ? total : Infinity };
}

// =================================================================================================== relics

export function createRelicScreen() {
  const S = { filter: 'all', open: null };
  const screen = {
    id: 'relics',
    state: S,
    enter() { S.filter = 'all'; S.open = null; },
    update() {},
    draw(ctx, app, ui) {
      const p = app.profile;
      const have = RELICS.filter((r) => p.relics[r.id]).length;
      const hd = pageHeader(ui, app, 'RELICS', { sub: have + '/' + RELICS.length });
      if (hd.back) { goBack(app); return; }
      const c = ui.content, X = c.x + 12, W = c.w - 24;
      let y = hd.y;
      // bonus banner
      const m = multipliers(p);
      const bp = ui.panel({ x: X, y, w: W, h: 46 }, { pad: 8, glow: have > 0 });
      drawText(ctx, 'RELIC BONUS', bp.x, bp.y + 14, { size: 12, weight: 800, color: PAL.boneDim, stroke: 2 });
      drawText(ctx, '+' + Math.round((m.relics - 1) * 100) + '% income', bp.x, bp.y + 32, { size: 18, kind: 'display', color: PAL.lime });
      drawText(ctx, '+' + Math.round(POOLS.relic.each * 100) + '% per relic, soft cap at +' + Math.round(POOLS.relic.cap * 100) + '%', bp.x + bp.w, bp.y + 30, { size: 12, align: 'right', color: PAL.boneDim, maxWidth: bp.w * 0.55 });
      y += 54;
      const tabs = [{ id: 'all', label: 'ALL' }].concat(RARITY_ORDER.map((r) => ({ id: r, label: RARITY[r].name.toUpperCase() })));
      S.filter = ui.tabs('rel:filter', { x: X, y, w: W, h: 32 }, tabs, S.filter);
      y += 40;
      const list = RELICS.filter((r) => S.filter === 'all' || r.rarity === S.filter).slice().sort((a, b) => (p.relics[b.id] ? 1 : 0) - (p.relics[a.id] ? 1 : 0) || RARITY_INDEX[b.rarity] - RARITY_INDEX[a.rarity] || (a.name < b.name ? -1 : 1));
      const colsN = c.w >= 480 ? 4 : 3, gap = 8, tw = (W - gap * (colsN - 1)) / colsN, th = tw * 1.1;
      const view = { x: X - 4, y, w: W + 8, h: c.y + c.h - y - 6 };
      const rows = Math.ceil(list.length / colsN);
      let tapped = null;
      ui.scroll('rel:grid', view, rows * (th + gap) + gap, () => {
        for (let i = 0; i < list.length; i++) {
          const rel = list[i], own = !!p.relics[rel.id];
          const r = { x: 4 + (i % colsN) * (tw + gap), y: gap + Math.floor(i / colsN) * (th + gap), w: tw, h: th };
          const st = ui.region('rel:' + rel.id, r, { focus: true, label: own ? rel.name : 'Locked relic' });
          const rc = rarityColor(rel.rarity), col = rel.rarity === 'mythic' ? prism(ui.t) : rc;
          ctx.save(); ctx.translate(r.x, r.y + (st.down ? 2 : 0));
          if (own && RARITY[rel.rarity].glowAlpha > 0.3) glow(ctx, tw / 2, th / 2, tw * 0.8, col, RARITY[rel.rarity].glowAlpha * 0.4);
          chamfer(ctx, 0, 0, tw, th, 7); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
          ctx.fillStyle = own ? mix(PAL.ink3, PAL.ink2, 0.4) : PAL.ink2; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = own ? col : rgba(PAL.slate, 0.5); ctx.stroke();
          ctx.restore();
          if (own) {
            ICONS.drawRelic(ctx, rel.id, r.x + tw / 2, r.y + th * 0.42, tw * 0.62, ui.t);
            drawText(ctx, rel.name, r.x + tw / 2, r.y + th - 9, { size: 11, weight: 800, align: 'center', maxWidth: tw - 10, stroke: 2.5, color: rel.rarity === 'legend' || rel.rarity === 'mythic' ? rc : PAL.bone });
          } else {
            ctx.save(); ctx.globalAlpha = 0.55; ICONS.drawRelic(ctx, rel.id, r.x + tw / 2, r.y + th * 0.42, tw * 0.55, 0); ctx.restore();
            ctx.fillStyle = rgba(PAL.void, 0.8); chamfer(ctx, r.x + 2, r.y + 2, tw - 4, th - 4, 6); ctx.fill();
            drawText(ctx, '?', r.x + tw / 2, r.y + th * 0.55, { size: 34, kind: 'display', align: 'center', color: PAL.slate });
            drawText(ctx, RARITY[rel.rarity].name, r.x + tw / 2, r.y + th - 9, { size: 11, weight: 800, align: 'center', color: PAL.slate, stroke: 2 });
          }
          if (st.tap) tapped = rel;
        }
      });
      if (tapped) { S.open = tapped.id; sfx(app, 'card_select'); this.openDialog(ui, app, tapped); }
      ui.vignette(0.4);
    },
    openDialog(ui, app, rel) {
      const own = !!app.profile.relics[rel.id];
      const matches = [];
      for (const cat of CATS) if (app.profile.cats[cat.id] && (rel.synergy || []).some((s) => cat.tags.includes(s) || cat.role === s)) matches.push(cat);
      ui.dialog({
        id: 'relic', title: own ? rel.name : 'Unknown relic', height: own ? 150 : 8,
        text: own ? rel.text : 'Found in crates and from bosses. Odds are shown on the crate screen.',
        buttons: [{ id: 'ok', label: 'CLOSE', kind: 'secondary' }], cancelId: 'ok',
        body: (c2, r) => {
          if (!own) return;
          ICONS.drawRelic(c2, rel.id, r.x + 34, r.y + 38, 64, ui.t);
          chip(c2, r.x + 76, r.y + 6, RARITY[rel.rarity].name.toUpperCase(), rarityColor(rel.rarity), { size: 11, h: 18 });
          let tx = r.x + 76;
          for (const s of (rel.synergy || []).slice(0, 4)) tx += chip(c2, tx, r.y + 30, s, PAL.violetHi, { size: 11, h: 18 }) + 4;
          para(c2, '"' + rel.flavor + '"', r.x + 76, r.y + 54, r.w - 80, { size: 12, maxLines: 3 });
          drawText(c2, matches.length ? 'Works with ' + matches.slice(0, 3).map((x) => x.name).join(', ') + (matches.length > 3 ? ' +' + (matches.length - 3) : '') : 'No owned cat shares its tags yet.', r.x + r.w / 2, r.y + 134, { size: 12, align: 'center', color: matches.length ? PAL.lime : PAL.boneDim, maxWidth: r.w });
        },
      });
    },
    exit() { S.open = null; },
  };
  return screen;
}

export const deckScreen = createDeckScreen();
export const rosterScreen = createRosterScreen();
export const relicScreen = createRelicScreen();
export const DECK_SCREENS = [deckScreen, rosterScreen, relicScreen];
