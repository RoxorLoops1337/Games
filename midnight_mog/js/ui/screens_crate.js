// Midnight Mog crate screen and OPENING CEREMONY (screen id 'crates').
//
// Shop: the five crates with price, key counts, pity bars (epic, legend, mythic) and an ODDS button that is always visible
// (the table comes from sim/loot.js oddsTable, the same numbers openCrate rolls on). x1, x10 and key opens.
// Ceremony: the result is rolled by loot.openCrate BEFORE anything moves and committed to the profile exactly once, at the
// moment of the tap (app.setProfile + app.save). Everything after that is choreography over `res.drops`: the crate shakes and
// glows (tell by pity and by the drop's own reveal beats), the lid bursts, drops fly out one at a time (ascending rarity, the
// best one last), face-down cards flip with rarity beams, shake, flash, audio.crateBeat. Tap fast-forwards, Skip jumps to the
// summary grid. The summary shows every drop, what is new, what became yarn and stars, and Open Again.
// The tells are decoration: the screen never rolls, re-rolls or edits a drop.
//
// Screen contract (docs/UI.md):  id 'crates'
//   enter(app, params)  params: {crate?: crateId, open?: {crateId?, count?: 1|10, useKey?: bool}}   (open starts a ceremony)
//   update(app, dt, ui) / draw(ctx, app, ui) / exit(app)
import { PAL, RARITY, RARITY_ORDER, rgba, mix, shade, glow, rarityColor, prism } from '../palette.js';
import { drawText } from '../render/text.js';
import * as CATART from '../render/catart.js';
import * as ICONS from '../render/icons.js';
import * as FX from '../render/fx.js';
import { CRATES, CRATE_BY_ID, oddsTable, openCrate } from '../sim/loot.js';
import { crateCost, CRATE_CREEP, CRATE_CREEP_CAP, DUPE_YARN } from '../sim/economy.js';
import { PITY_TIERS, STAR_DUPES, MULTI_COUNT } from '../data/crates.js';
import { CAT_BY_ID } from '../data/cats.js';
import { CARD_BY_ID } from '../data/cards.js';
import { RELIC_BY_ID } from '../data/relics.js';
import { hash32 } from '../data/buildings.js';
import { makeRng } from '../rng.js';
import { clamp, fin, lerp, outBack, outCubic, inOutSine, chamfer, vgrad, hash01, drawGlyph } from './shell.js';

const TAU = Math.PI * 2;
const RI = { common: 0, rare: 1, epic: 2, legend: 3, mythic: 4 };
const KIND_LABEL = { cat: 'CAT', card: 'CARD', relic: 'RELIC', yarn: 'YARN', gems: 'GEMS' };
const PREF = { sel: 0 };                         // last crate looked at survives between visits in one session
const MAX_SLOTS = 12;

/** Rarity colour; mythic cycles through the prism. */
export const rcol = (r, t) => (r === 'mythic' ? prism(fin(t)) : rarityColor(RARITY[r] ? r : 'common'));
const ri = (r) => (RI[r] === undefined ? 0 : RI[r]);

// ------------------------------------------------------------------------------------------------ pure helpers
/** Total price of `count` opens starting now: sums the sequential prices exactly like loot.openCrate charges them. */
export function priceFor(profile, crateId, count) {
  const opens = Math.max(0, ((profile && profile.stats && profile.stats.crateOpens) | 0));
  let total = 0, cur = 'fish';
  for (let i = 0; i < count; i++) { const c = crateCost(crateId, opens + i); total += c.price; cur = c.cur; }
  return { cur, price: total };
}

/** Name, description and kind label of one drop (safe for ids the data no longer knows). */
export function dropInfo(d) {
  const o = { name: String(d.id || '?'), text: '', label: KIND_LABEL[d.kind] || 'ITEM' };
  if (d.kind === 'cat') { const c = CAT_BY_ID[d.id]; if (c) { o.name = c.name; o.text = c.ability ? c.ability.name + ': ' + c.ability.text : c.flavor; o.role = c.role; } }
  else if (d.kind === 'card') { const c = CARD_BY_ID[d.id]; if (c) { o.name = c.name; o.text = c.text; } }
  else if (d.kind === 'relic') { const c = RELIC_BY_ID[d.id]; if (c) { o.name = c.name; o.text = c.text; } }
  else if (d.kind === 'yarn') { o.name = fin(d.amount) + ' Yarn'; o.text = 'A fat ball of yarn.'; }
  else if (d.kind === 'gems') { o.name = fin(d.amount) + ' Gems'; o.text = 'Pure cyan sparkle.'; }
  return o;
}

/** Totals of a pull for the summary line: {n, news, dupes, yarn, gems, stars, dupeYarn, best, byRarity}. */
export function summarize(res) {
  const out = { n: 0, news: 0, dupes: 0, yarn: 0, gems: 0, stars: 0, dupeYarn: 0, best: -1, byRarity: { common: 0, rare: 0, epic: 0, legend: 0, mythic: 0 }, golden: 0 };
  const drops = (res && res.drops) || [];
  out.n = drops.length;
  let bi = -1;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    out.byRarity[RARITY[d.rarity] ? d.rarity : 'common']++;
    if (d.golden) out.golden++;
    if (d.kind === 'yarn') out.yarn += fin(d.amount);
    else if (d.kind === 'gems') out.gems += fin(d.amount);
    else if (d.isNew) out.news++;
    else out.dupes++;
    if (d.kind !== 'yarn' && d.kind !== 'gems') out.dupeYarn += fin(d.dupeValue);
    out.stars += fin(d.starsGained);
    if (bi < 0 || ri(d.rarity) >= ri(drops[bi].rarity)) bi = i;
  }
  out.best = bi;
  return out;
}

// ------------------------------------------------------------------------------------------------ ceremony timeline
// A pure schedule built once from the finished result. Times are seconds from the tap. Nothing in here rolls anything.
const HOLD = [0.05, 0.14, 0.4, 0.8, 1.2];         // face-up time per rarity (x10)
const CHARGE = [0, 0.05, 0.3, 0.6, 0.95];         // face-down anticipation per rarity
const X10_BUDGET = 8.5;                           // seconds the x10 reveals may take at most (anticipation excluded); long pulls are squeezed to fit
const LAUNCH = 0.34, FLIP = 0.3, STOW = 0.3;      // x1 values; x10 runs the same beats ~35% faster

/**
 * buildTimeline(res, {reduced}) -> {events:[{t,type,...}], drops:[{k,d,rarity,t0,tFlip,tFace,tHold,tStow,tEnd}], tBurst, total, n, order, finale}
 * Event types: shake rumble glow pulse flash burst launch charge flip reveal stow end. Sorted by time, ties keep creation order.
 * Reduced motion gives the short version: a quick lid pop and a few hundred milliseconds per drop.
 */
export function buildTimeline(res, o) {
  o = o || {};
  const reduced = !!o.reduced;
  const drops = (res && res.drops) || [];
  const n = drops.length;
  const tl = { events: [], drops: [], tBurst: 0, total: 0, n, order: [], finale: -1 };
  if (!n) return tl;
  let order = res.reveal && Array.isArray(res.reveal.order) && res.reveal.order.length === n ? res.reveal.order.slice() : drops.map((_, i) => i);
  const seen = new Set(order);
  if (seen.size !== n || order.some((d) => !(d >= 0 && d < n))) order = drops.map((_, i) => i);   // never trust metadata blindly
  let finale = res.reveal && Number.isInteger(res.reveal.finale) && res.reveal.finale >= 0 && res.reveal.finale < n ? res.reveal.finale : order[n - 1];
  tl.order = order; tl.finale = finale;
  const ev = tl.events;
  const push = (t, type, extra) => { const e = { t, type }; if (extra) Object.assign(e, extra); ev.push(e); return e; };
  const fd = drops[finale];
  const frar = RARITY[fd.rarity] ? fd.rarity : 'common';
  const beats = (fd.reveal && Array.isArray(fd.reveal.beats)) ? fd.reveal.beats : [];
  const pre = reduced ? 0.12 : 0.45;
  push(0, 'glow', { color: 'cyan', amt: 0.25 });

  // ---- anticipation: the best drop's own beats, squeezed to at most ~2.2s
  const burstBeat = beats.find((b) => b.kind === 'burst');
  const revealBeat = beats.find((b) => b.kind === 'reveal');
  const span = Math.max(0.35, ((burstBeat ? burstBeat.at : revealBeat ? Math.max(0, revealBeat.at - 60) : 600)) / 1000);
  const sc = reduced ? 0 : Math.min(1, 2.2 / span);
  let tB = pre + (reduced ? 0.2 : span * sc + 0.12);
  if (!reduced) {
    for (const b of beats) {
      if (b.kind === 'burst' || b.kind === 'reveal') continue;
      const t = pre + (fin(b.at) / 1000) * sc;
      if (b.kind === 'shake') push(t, 'shake', { power: fin(b.power, 0.3), rarity: frar });
      else if (b.kind === 'rumble') push(t, 'rumble', { power: fin(b.power, 0.5), rarity: frar });
      else if (b.kind === 'crack') { push(t, 'glow', { color: RARITY[b.color] ? b.color : frar, amt: b.hint === 'tease' ? 0.8 : 0.65, crack: true }); }
      else if (b.kind === 'fakeout') {
        push(t, 'glow', { color: RARITY[b.from] ? b.from : frar, amt: 0.95, crack: true, fake: true });
        push(t + 0.12, 'glow', { color: 'dim', amt: 0.15 });
        push(t + 0.42, 'glow', { color: RARITY[b.to] ? b.to : frar, amt: 0.7, crack: true });
      } else if (b.kind === 'pulse') push(t, 'pulse', { color: RARITY[b.color] ? b.color : frar, power: fin(b.power, 0.5) });
      else if (b.kind === 'flash') push(t, 'flash', { color: b.color === 'gold' ? 'gold' : (RARITY[b.color] ? b.color : frar), power: fin(b.power, 0.8) });
    }
  } else push(pre, 'shake', { power: 0.2, rarity: frar });
  if (burstBeat) tB = Math.max(tB, pre + (fin(burstBeat.at) / 1000) * sc);
  push(tB, 'burst', { color: frar, power: burstBeat ? fin(burstBeat.power, 0.4) : 0.2, rarity: frar });
  tl.tBurst = tB;

  // ---- the drops, ascending rarity, best last
  let squeeze = 1;
  if (n > 1 && !reduced) {
    let est = 0;
    for (let k = 0; k < n; k++) { const dr = drops[order[k]], R = ri(dr.rarity); est += 0.22 + 0.2 + 0.1 + CHARGE[R] + HOLD[R] + (dr.golden ? 0.7 : 0) + (order[k] === finale ? 0.4 : 0); }
    squeeze = clamp(X10_BUDGET / est, 0.4, 1);
  }
  let t = tB + (reduced ? 0.06 : 0.24);
  for (let k = 0; k < n; k++) {
    const d = order[k], dr = drops[d];
    const rar = RARITY[dr.rarity] ? dr.rarity : 'common';
    const R = ri(rar);
    const isFinale = d === finale;
    const last = k === n - 1;
    if (!reduced && n > 1 && isFinale && R >= 2) { push(t, 'glow', { color: rar, amt: 1, crack: true }); t += 0.32; }   // breath before the best one
    const dur = reduced
      ? { launch: 0.06, charge: 0, flip: 0.1, hold: n === 1 ? 0.6 : (isFinale ? 0.5 : 0.03), stow: n > 1 ? 0.1 : 0 }
      : {
        launch: n > 1 ? 0.22 : LAUNCH, charge: ((n > 1 ? CHARGE[R] : CHARGE[R] * 1.2) + (dr.golden ? 0.3 : 0) + (isFinale ? 0.1 : 0)) * squeeze, flip: n > 1 ? 0.2 : FLIP,
        hold: n === 1 ? Math.max(0.7, HOLD[R] * 0.8 + 0.3) : (HOLD[R] + (dr.golden ? 0.4 : 0)) * squeeze, stow: n > 1 ? 0.2 : 0,
      };
    const row = { k, d, rarity: rar, t0: t, tFlip: t + dur.launch + dur.charge, tFace: 0, tHold: 0, tStow: 0, tEnd: 0, dur };
    row.tFace = row.tFlip + dur.flip;
    row.tHold = row.tFace + dur.hold;
    row.tStow = row.tHold;
    row.tEnd = row.tStow + dur.stow;
    push(row.t0, 'launch', { k, d, rarity: rar });
    if (dur.charge > 0.2) push(row.t0 + dur.launch, 'charge', { k, d, rarity: rar, dur: dur.charge });
    push(row.tFlip, 'flip', { k, d, rarity: rar });
    push(row.tFace, 'reveal', { k, d, rarity: rar, isNew: !!dr.isNew, golden: !!dr.golden, last });
    if (n > 1) push(row.tStow, 'stow', { k, d, rarity: rar });
    tl.drops.push(row);
    t = n > 1 ? (reduced ? row.tEnd : row.tStow + dur.stow * 0.5) : row.tEnd;   // the next one launches while this one is still stowing
    tl.lastEnd = Math.max(tl.lastEnd || 0, row.tEnd);
  }
  tl.total = Math.max(t, tl.lastEnd || 0) + (n > 1 ? (reduced ? 0.15 : 0.45) : 0);
  push(tl.total, 'end');
  // stable sort by time (Array.prototype.sort is stable in modern engines, ties keep creation order)
  ev.sort((a, b) => a.t - b.t);
  return tl;
}

// ------------------------------------------------------------------------------------------------ drawing: cards
/** Back of a face-down drop card: violet stripes, a paw sigil and a halo in the rarity colour (the beam colour is the tell). */
export function drawCardBack(ctx, x, y, w, h, rarity, t) {
  const rar = RARITY[rarity] ? rarity : 'common';
  const col = rcol(rar, t), c = Math.max(4, w * 0.06);
  ctx.save();
  ctx.translate(x, y);
  if (ri(rar) >= 1) glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.8, col, 0.15 + 0.08 * ri(rar));
  chamfer(ctx, 0, 0, w, h, c); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = vgrad(ctx, 'cback', h, PAL.ink3, PAL.violet, PAL.ink2); ctx.fill();
  ctx.save(); chamfer(ctx, 0, 0, w, h, c); ctx.clip();
  ctx.strokeStyle = rgba(PAL.violetHi, 0.16); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -h; i < w; i += 9) { ctx.moveTo(i, h); ctx.lineTo(i + h, 0); }
  ctx.stroke();
  ctx.restore();
  // sigil: a paw
  const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.3;
  ctx.fillStyle = rgba(col, 0.9); ctx.strokeStyle = PAL.ink; ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.28, s * 0.62, s * 0.5, 0, 0, TAU); ctx.stroke(); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = -2.5 + i * 0.66;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * s * 0.8, cy + Math.sin(a) * s * 0.8 - s * 0.1, s * 0.22, 0, TAU); ctx.stroke(); ctx.fill();
  }
  chamfer(ctx, 0, 0, w, h, c); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
  chamfer(ctx, 4, 4, w - 8, h - 8, Math.max(0, c - 2)); ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.bone, 0.1); ctx.stroke();
  ctx.restore();
}

/**
 * Face of a drop card (5:7). o: {t, compact (thumbnail: no body text), pop:0..1 (tag pop-in), hl:0..1 (highlight pulse)}.
 * Cats show the portrait, cards the card art, relics the medallion, yarn and gems the currency icon with the amount.
 * Tags: NEW (lime), a dupe chip with the yarn it became, star pips for cat dupes, GOLDEN (x2).
 */
export function drawDropCard(ctx, d, x, y, w, h, o) {
  o = o || {};
  const t = fin(o.t), rar = RARITY[d.rarity] ? d.rarity : 'common';
  const col = rcol(rar, t), c = Math.max(4, w * 0.06), info = dropInfo(d);
  const compact = !!o.compact || h < 150;
  ctx.save();
  ctx.translate(x, y);
  chamfer(ctx, 0, 0, w, h, c); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = vgrad(ctx, 'dcard', h, PAL.ink3, PAL.ink2, PAL.ink); ctx.fill();
  const ax = 4, ay = 4, aw = w - 8, ah = Math.round(h * (compact ? 0.62 : 0.54));
  ctx.save(); chamfer(ctx, ax, ay, aw, ah, Math.max(2, c - 2)); ctx.clip();
  ctx.fillStyle = rgba(shade(col, -0.7), 1); ctx.fillRect(ax, ay, aw, ah);
  let drew = false;
  try {
    if (d.kind === 'cat' && CAT_BY_ID[d.id]) { CATART.drawCatPortrait(ctx, d.id, ax, ay, aw, ah, { t, level: 1, stars: fin(d.stars) }); drew = true; }
    else if (d.kind === 'card' && CARD_BY_ID[d.id]) { CATART.drawCardArt(ctx, CARD_BY_ID[d.id], ax, ay, aw, ah, { t }); drew = true; }
    else if (d.kind === 'relic') {
      ctx.fillStyle = cardBackdrop(ctx, 'relic', ax + aw / 2, ay + ah / 2, Math.max(aw, ah) * 0.7, RARITY[rar].color); ctx.fillRect(ax, ay, aw, ah);
      ICONS.drawRelic(ctx, d.id, ax + aw / 2, ay + ah / 2, Math.min(aw, ah) * 0.86, t); drew = true;
    } else if (d.kind === 'yarn' || d.kind === 'gems') {
      ctx.fillStyle = cardBackdrop(ctx, d.kind, ax + aw / 2, ay + ah / 2, Math.max(aw, ah) * 0.7, d.kind === 'gems' ? PAL.cyan : PAL.magenta); ctx.fillRect(ax, ay, aw, ah);
      ICONS.drawCurrency(ctx, d.kind, ax + aw / 2, ay + ah * 0.46, Math.min(aw, ah) * 0.66, t); drew = true;
    }
  } catch (e) { drew = false; }
  if (!drew) { ctx.fillStyle = PAL.violet; ctx.fillRect(ax, ay, aw, ah); }
  ctx.restore();
  // name banner
  const by = ay + ah - 1, bh = Math.max(14, h * (compact ? 0.15 : 0.12));
  ctx.fillStyle = rgba(PAL.ink, 0.94); ctx.fillRect(4, by, w - 8, bh);
  ctx.fillStyle = rgba(col, 0.9); ctx.fillRect(4, by, w - 8, 1.5); ctx.fillRect(4, by + bh - 1, w - 8, 1);
  const fs = clamp(w * 0.115, 8, 16);
  drawText(ctx, info.name, w / 2, by + bh / 2 + fs * 0.34, { size: fs, kind: 'display', align: 'center', color: ri(rar) >= 3 ? col : PAL.bone, maxWidth: w - 12, stroke: 2.5 });
  if (!compact) {
    const ty = by + bh + 4, small = clamp(w * 0.07, 9.5, 12.5);
    drawText(ctx, info.label + (info.role ? '  ' + info.role.toUpperCase() : ''), w / 2, ty + small, { size: small, kind: 'body', weight: 800, align: 'center', color: col, stroke: 2.5 });
    const lines = wrapShort(ctx, info.text, w - 14, small);
    const room = Math.max(0, Math.floor((h - (ty + small + 8) - 8) / (small * 1.2)));
    for (let i = 0; i < Math.min(lines.length, room, 4); i++) drawText(ctx, lines[i], w / 2, ty + small * 2.3 + i * small * 1.2, { size: small, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, stroke: 2 });
  }
  CATART.drawRarityFrame(ctx, rar, 0, 0, w, h, t, { chamfer: c });
  // tags
  const pop = o.pop === undefined ? 1 : clamp(o.pop, 0, 1), pp = outBack(pop);
  if (d.isNew && d.kind !== 'yarn' && d.kind !== 'gems') {
    const tw = compact ? Math.max(24, w * 0.46) : Math.max(36, w * 0.4), th = compact ? 12 : 18;
    ctx.save(); ctx.translate(compact ? 3 : 6, compact ? 3 : 8); ctx.rotate(-0.12); ctx.scale(pp, pp);
    chamfer(ctx, 0, 0, tw, th, 3); ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = PAL.lime; ctx.fill();
    drawText(ctx, 'NEW', tw / 2, th / 2 + (compact ? 3.5 : 5), { size: compact ? 9 : 13, kind: 'display', align: 'center', color: PAL.ink, stroke: false });
    ctx.restore();
  } else if (d.dupeValue > 0 || d.kind === 'cat') {
    const txt = d.dupeValue > 0 ? '+' + fmtNum(d.dupeValue) : 'DUPE';
    const th = compact ? 12 : 17, tw = Math.max(compact ? 26 : 40, txt.length * (compact ? 6 : 8) + 14);
    ctx.save(); ctx.translate(w - tw - 3, h - th - 3); ctx.globalAlpha *= 0.4 + 0.6 * pp;
    chamfer(ctx, 0, 0, tw, th, 3); ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = shade(PAL.magenta, -0.2); ctx.fill();
    drawText(ctx, txt, tw / 2, th / 2 + (compact ? 3.5 : 5), { size: compact ? 9 : 12, kind: 'body', weight: 800, align: 'center', color: PAL.bone, stroke: 2 });
    ctx.restore();
  }
  if (d.kind === 'cat' && fin(d.starsGained) > 0 && !compact) CATART.drawStarPips(ctx, d.stars, w / 2, ay + ah - 10, Math.min(w, 80), t);
  if (d.golden) {
    const gx = w - (compact ? 10 : 20), gy = compact ? 10 : 22;
    glow(ctx, gx, gy, compact ? 14 : 24, PAL.gold, 0.6);
    drawText(ctx, 'x2', gx, gy + (compact ? 3.5 : 5), { size: compact ? 9 : 14, kind: 'display', align: 'center', color: PAL.goldHot, stroke: 3 });
  }
  if (o.hl > 0) {
    glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.8, col, 0.25 * o.hl);
    chamfer(ctx, -1, -1, w + 2, h + 2, c + 1); ctx.lineWidth = 2; ctx.strokeStyle = rgba(col, 0.6 + 0.4 * o.hl); ctx.stroke();
  }
  ctx.restore();
}

// Backdrop gradients for relic and currency cards: local coordinates, so one gradient per (size, colour) serves every card.
const BG_GRADS = new Map();
function cardBackdrop(ctx, key, cx, cy, r, col) {
  const k = key + '|' + Math.round(cx) + '|' + Math.round(cy) + '|' + Math.round(r) + '|' + col;
  let g = BG_GRADS.get(k);
  if (!g) {
    if (BG_GRADS.size > 200) BG_GRADS.clear();
    g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    g.addColorStop(0, rgba(col, 0.42)); g.addColorStop(1, rgba(PAL.ink, 1));
    BG_GRADS.set(k, g);
  }
  return g;
}

function fmtNum(n) { n = Math.round(fin(n)); return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n); }
function wrapShort(ctx, str, maxW, fs) {
  const words = String(str || '').split(' '), out = [];
  let line = '';
  ctx.save(); ctx.font = '600 ' + Math.round(fs) + 'px "Trebuchet MS",sans-serif';
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (line && ctx.measureText(test).width > maxW) { out.push(line); line = wd; } else line = test;
  }
  ctx.restore();
  if (line) out.push(line);
  return out;
}

/** Additive light rays fanned from (x,y). n rays, radius r; spin 0 for reduced motion. No gradients, no allocation. */
function drawRays(ctx, x, y, r, col, a, t, n, spin, prismic) {
  if (a <= 0.003 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + t * spin + Math.sin(i * 12.9) * 0.1;
    const wdt = 0.07 + 0.05 * hash01('ray' + i);
    ctx.fillStyle = rgba(prismic ? prism(t + i / n, 0.5) : col, a * (0.5 + 0.5 * hash01('rl' + i)));
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang - wdt) * r, y + Math.sin(ang - wdt) * r);
    ctx.lineTo(x + Math.cos(ang + wdt) * r, y + Math.sin(ang + wdt) * r);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** A vertical beam of stacked translucent bars (cheap, additive). from (x,yBottom) up to yTop. */
function drawBeam(ctx, x, yBottom, yTop, wdt, col, a) {
  if (a <= 0.003 || yBottom <= yTop) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const k = 1 - i * 0.2;
    ctx.fillStyle = rgba(i === 4 ? PAL.bone : col, a * (0.1 + i * 0.07));
    ctx.fillRect(x - wdt * k * 0.5, yTop, wdt * k, yBottom - yTop);
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the screen
export function createCrateScreen() {
  const S = {
    app: null, ui: null, params: null, mode: 'shop', t: 0, sel: 0,
    fx: null, fxLayout: null, fxW: 0, fxH: 0, tile: { w: 56, h: 56 },
    // opening state
    res: null, tl: null, T: 0, ei: 0, crateId: 'alley_crate', count: 1, useKey: false, committed: 0, setProfileCalls: 0,
    revealed: [], revealT: [], flipped: [], stowed: [], skipped: false, tapLock: 0,
    glowCol: 'cyan', glowAmt: 0.25, glowTarget: 0.25, shakeAmt: 0, open: 0, openTarget: 0, burstT: -9, pulseT: -9, pulseCol: 'rare', pulsePow: 0,
    slowT: 0, slowScale: 1, sumT: 0, pendingOpen: null, summary: null, totalFired: 0,
    // overlays
    odds: '', oddsH: 900, inspect: -1, cache: { profile: null, id: '', tbl: null },
    g: { cx: 195, crateX: 195, crateY: 300, crateS: 200, spot: { x: 0, y: 0, w: 100, h: 140 }, slots: [], gridTop: 0, mouthY: 0, slotW: 60, slotH: 84 },
    ds: { phase: 0, p: 0, x: 0, y: 0, s: 1, rot: 0, sx: 1, face: 0 },
  };
  for (let i = 0; i < MAX_SLOTS; i++) S.g.slots.push({ x: 0, y: 0, w: 60, h: 84 });
  const G = S.g;

  const audio = () => (S.app && S.app.audio) || null;
  function beat(kind, rarity, i, o) { const a = audio(); if (a && a.crateBeat) { try { a.crateBeat(kind, rarity, i, o); } catch (e) { /* audio is optional */ } } }
  function sfx(name, o) { const a = audio(); if (a && a.sfx) { try { a.sfx(name, o); } catch (e) { /* audio is optional */ } } }
  function reduced() { return !!(S.ui && S.ui.reduceMotion); }
  const hexOf = (name, t) => (name === 'cyan' ? PAL.cyan : name === 'dim' ? PAL.violet : name === 'gold' ? PAL.gold : name === 'magenta' ? PAL.magenta : RARITY[name] ? rcol(name, t) : PAL.cyan);

  function ensureFx(ui) {
    if (!S.fx) S.fx = FX.createFx(hash32('crates', ui.w));
    if (S.fxW !== ui.w || S.fxH !== ui.h || !S.fxLayout) {
      const k = clamp(ui.w / 390, 0.9, 1.5);
      S.tile.w = 56 * k; S.tile.h = 56 * k;
      S.fxLayout = { w: ui.w, h: ui.h, field: { x: 0, y: 0, w: ui.w, h: ui.h }, tile: () => S.tile };
      S.fxW = ui.w; S.fxH = ui.h;
      FX.setLayout(S.fx, S.fxLayout);
    }
    S.fx.reducedMotion = reduced();
    S.fx.autoOverlay = true;
  }

  // ---- odds cache (pure function of profile and crate; recomputed only when either changes)
  function oddsOf(profile, id) {
    const c = S.cache;
    if (c.profile !== profile || c.id !== id) { c.profile = profile; c.id = id; try { c.tbl = oddsTable(id, profile); } catch (e) { c.tbl = null; } }
    return c.tbl;
  }

  // ---------------------------------------------------------------------------------------------- opening
  function startOpen(crateId, count, useKey) {
    if (S.mode !== 'shop' && S.mode !== 'summary') return false;       // a second tap in the same frame cannot charge twice
    const app = S.app, ui = S.ui;
    if (!app || !CRATE_BY_ID[crateId]) return false;
    count = count === MULTI_COUNT ? MULTI_COUNT : 1;
    const p = app.profile;
    const st = p.stats || {};
    const key = 'crate:' + crateId + ':' + (st.crateOpens | 0) + ':' + (st.cratesTotal | 0) + ':' + count + (useKey ? 'k' : '');
    const rng = app.rng ? app.rng(key) : makeRng(hash32(p.seed, key));
    const res = openCrate(p, crateId, rng, { count, useKey: !!useKey });
    if (res.error) {
      const msg = res.error === 'no_key' ? 'Need ' + res.need + ' keys (you have ' + res.have + ')' : 'Need ' + fmtNum(res.need - res.have) + ' more ' + res.cur;
      if (ui) ui.toast(msg, 'warn');
      sfx('deny');
      return false;
    }
    // the one and only charge: the new profile is committed now, before any animation
    app.setProfile(res.profile);
    S.setProfileCalls++;
    if (app.save) app.save();
    S.committed++;
    S.res = res; S.crateId = crateId; S.count = count; S.useKey = !!useKey;
    S.summary = summarize(res);
    S.tl = buildTimeline(res, { reduced: reduced() });
    S.T = 0; S.ei = 0; S.skipped = false; S.tapLock = 0.3;
    S.revealed = res.drops.map(() => false); S.revealT = res.drops.map(() => -9); S.flipped = res.drops.map(() => false); S.stowed = res.drops.map(() => false);
    S.glowCol = 'cyan'; S.glowAmt = 0.25; S.glowTarget = 0.25; S.shakeAmt = 0; S.open = 0; S.openTarget = 0; S.burstT = -9; S.pulseT = -9; S.slowT = 0; S.inspect = -1; S.sumT = 0;
    S.mode = 'ceremony';
    const a = audio(); if (a && a.music) { try { a.music('crate'); } catch (e) { /* optional */ } }
    return true;
  }

  function mouth() { return { x: G.crateX, y: G.crateY - G.crateS * 0.04 }; }

  // Fire one timeline event. silent: update state only (used when fast-forwarding), no sound, particles or shake.
  function fire(e, silent) {
    const fx = S.fx, rr = reduced();
    const idx = e.k === undefined ? 0 : e.k;
    switch (e.type) {
      case 'glow':
        S.glowCol = e.color; S.glowTarget = e.amt;
        if (!silent && e.crack) beat('tick', RARITY[e.color] ? e.color : 'rare', idx);
        break;
      case 'shake': S.shakeAmt = Math.max(S.shakeAmt, 0.3 + e.power); if (!silent) beat('shake', e.rarity, idx); break;
      case 'rumble': S.shakeAmt = Math.max(S.shakeAmt, 0.5 + e.power * 0.8); S.glowTarget = Math.max(S.glowTarget, 0.5 + e.power * 0.4); if (!silent) beat('rise', e.rarity, idx, { dur: 1.2 }); break;
      case 'pulse':
        S.pulseT = S.T; S.pulseCol = e.color; S.pulsePow = e.power;
        if (!silent) { const m = mouth(); FX.burstAt(fx, m.x, m.y, hexOf(e.color, S.t), 10, { speed: 90, life: 0.5, ringR: 70 + 40 * e.power }); fx.trauma = Math.min(1, fx.trauma + (rr ? 0 : 0.12)); }
        break;
      case 'flash':
        if (!silent) { fx.flash.color = e.color === 'gold' ? PAL.goldHot : hexOf(e.color, S.t); fx.flash.alpha = Math.max(fx.flash.alpha, (rr ? 0.2 : 0.55) * e.power); fx.flash.add = true; }
        break;
      case 'burst':
        S.openTarget = 1; S.burstT = S.T; S.shakeAmt = 0; S.glowTarget = 1; S.glowCol = e.color;
        if (!silent) {
          const m = mouth(), col = hexOf(e.color, S.t), R = ri(e.color);
          FX.burstAt(fx, m.x, m.y, col, 18 + R * 8, { speed: 170 + R * 40, life: 0.8, gravity: 160, ringR: 80 + R * 30, flash: true, shape: 'star' });
          fx.trauma = Math.min(1, fx.trauma + (rr ? 0 : 0.25 + e.power * 0.4));
          if (!rr && R >= 2) fx.chroma = Math.max(fx.chroma, 0.5 + 0.1 * R);
          if (R >= 1) { fx.flash.color = col; fx.flash.alpha = Math.max(fx.flash.alpha, (rr ? 0.15 : 0.3) * e.power + 0.1); fx.flash.add = true; }
          beat('open', e.color, 0);
        }
        break;
      case 'launch':
        if (!silent) { const m = mouth(); FX.burstAt(fx, m.x, m.y, hexOf(e.rarity, S.t), 6 + 3 * ri(e.rarity), { speed: 110, life: 0.45, ring: false }); if (ri(e.rarity) < 2) beat('tick', e.rarity, e.k); }
        break;
      case 'charge':
        if (!silent) beat('rise', e.rarity, e.k, { dur: e.dur });
        break;
      case 'flip': S.flipped[e.d] = true; break;
      case 'reveal': {
        S.revealed[e.d] = true; S.revealT[e.d] = S.T;
        if (!silent) revealEffects(e);
        break;
      }
      case 'stow': {
        S.stowed[e.d] = true;
        if (!silent) { const sl = G.slots[e.d]; if (sl) FX.burstAt(S.fx, sl.x + sl.w / 2, sl.y + sl.h / 2, hexOf(e.rarity, S.t), 5, { speed: 70, life: 0.35, ring: false }); }
        break;
      }
      default: break;
    }
  }

  function revealEffects(e) {
    const fx = S.fx, rr = reduced(), R = ri(e.rarity), sp = G.spot, cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2, col = hexOf(e.rarity, S.t);
    const d = S.res.drops[e.d];
    beat('reveal', e.rarity, e.k, { isNew: !!e.isNew });
    FX.burstAt(fx, cx, cy, col, 8 + R * 10, { speed: 120 + R * 50, life: 0.5 + R * 0.12, gravity: 120, ringR: 50 + R * 24, flash: R >= 2, shape: R >= 2 ? 'star' : 'spark' });
    if (!rr) fx.trauma = Math.min(1, fx.trauma + (R >= 4 ? 0.7 : R >= 3 ? 0.5 : R >= 2 ? 0.28 : 0.04 * R));
    if (R >= 2) { fx.flash.color = col; fx.flash.alpha = Math.max(fx.flash.alpha, (rr ? 0.12 : 0.28) + 0.06 * R); fx.flash.add = true; }
    if (R >= 3 && !rr) fx.chroma = Math.max(fx.chroma, 0.8);
    if (R >= 4 && !rr) { S.slowT = 0.55; S.slowScale = 0.3; }
    if (d && d.golden) {
      fx.flash.color = PAL.goldHot; fx.flash.alpha = Math.max(fx.flash.alpha, rr ? 0.25 : 0.7); fx.flash.add = true;
      FX.burstAt(fx, cx, cy, PAL.gold, 26, { speed: 240, life: 1, gravity: 200, ringR: 120, flash: true, shape: 'star', color2: PAL.goldHot });
    }
    if (e.isNew && d && d.kind !== 'yarn' && d.kind !== 'gems') beat('new', e.rarity, e.k);
    else if (d && (d.dupeValue > 0)) beat('dupe', e.rarity, e.k);
  }

  function seek(T2, silent) {
    const ev = S.tl.events;
    S.T = Math.max(S.T, T2);
    while (S.ei < ev.length && ev[S.ei].t <= S.T) { fire(ev[S.ei], silent); S.ei++; }
  }

  function finishCeremony() {
    S.mode = 'summary'; S.sumT = 0; S.glowTarget = 0.5; S.inspect = -1;
    for (let i = 0; i < S.revealed.length; i++) { S.revealed[i] = true; S.flipped[i] = true; S.stowed[i] = S.count > 1; }
  }

  /** Skip: jump to the summary grid. Nothing is lost: the result was committed at the tap. One reveal sound for the best drop. */
  function skipAll() {
    if (S.mode !== 'ceremony') return;
    const sm = S.summary, best = sm && sm.best >= 0 ? S.res.drops[sm.best] : null;
    seek(S.tl.total + 1, true);
    S.skipped = true;
    if (best) {
      beat('reveal', best.rarity, 0, { isNew: !!best.isNew });
      if (S.fx && ri(best.rarity) >= 2) { S.fx.flash.color = hexOf(best.rarity, S.t); S.fx.flash.alpha = reduced() ? 0.12 : 0.3; S.fx.flash.add = true; }
    }
    finishCeremony();
  }

  // Tap during the ceremony: skip the current wait (anticipation or charge) or the current hold, never a reveal moment.
  function fastForward() {
    if (S.tapLock > 0) return;
    const tl = S.tl, T = S.T;
    if (T < tl.tBurst - 0.05) { seek(tl.tBurst - 0.05, true); return; }
    for (let i = 0; i < tl.drops.length; i++) {
      const r = tl.drops[i];
      if (T < r.tFlip - 0.02) { seek(r.tFlip - 0.02, true); return; }
      if (T >= r.tFace && T < r.tEnd - 0.05) { seek(r.tEnd - 0.05, true); return; }
      if (T < r.tEnd) return;
    }
  }

  // The whole ceremony logic without drawing: tests step this directly.
  function advance(dt) {
    if (S.mode !== 'ceremony' || !S.tl) return;
    if (S.tapLock > 0) S.tapLock -= dt;
    let d = dt;
    if (S.slowT > 0) { S.slowT -= dt; d = dt * S.slowScale; }
    S.T += d;
    const ev = S.tl.events;
    while (S.ei < ev.length && ev[S.ei].t <= S.T) { fire(ev[S.ei], false); S.ei++; }
    if (S.T >= S.tl.total) finishCeremony();
  }

  // ---------------------------------------------------------------------------------------------- lifecycle
  const screen = {
    id: 'crates',
    enter(app, params) {
      S.app = app; S.params = params || {};
      S.mode = 'shop'; S.res = null; S.tl = null; S.odds = ''; S.inspect = -1; S.t = 0; S.committed = 0; S.setProfileCalls = 0;
      let sel = PREF.sel;
      if (S.params.crate) { const i = CRATES.findIndex((c) => c.id === S.params.crate); if (i >= 0) sel = i; }
      S.sel = clamp(sel, 0, CRATES.length - 1);
      S.pendingOpen = S.params.open || null;
      const a = audio(); if (a && a.music) { try { a.music('town'); } catch (e) { /* optional */ } }
    },
    update(app, dt, ui) {
      S.app = app; S.ui = ui;
      dt = clamp(fin(dt, 1 / 60), 0, 0.1);
      S.t += dt;
      ensureFx(ui);
      if (S.pendingOpen) { const o = S.pendingOpen; S.pendingOpen = null; if (o.crateId) { const i = CRATES.findIndex((c) => c.id === o.crateId); if (i >= 0) S.sel = i; } startOpen(o.crateId || CRATES[S.sel].id, o.count, o.useKey); }
      FX.update(S.fx, dt);
      if (S.mode === 'ceremony') {
        geometry(ui);
        advance(dt);
      }
      // easing for the crate visuals
      S.glowAmt += (S.glowTarget - S.glowAmt) * Math.min(1, dt * 6);
      S.shakeAmt *= Math.exp(-dt * 2.4);
      S.open += (S.openTarget - S.open) * Math.min(1, dt * (reduced() ? 40 : 9));
      if (S.mode === 'summary') S.sumT += dt;
    },
    exit(app) {
      const a = (app && app.audio) || audio();
      if (a && a.stopMusic && S.mode !== 'shop') { try { a.stopMusic(); } catch (e) { /* optional */ } }
      S.mode = 'shop'; S.res = null; S.tl = null; S.odds = '';
    },
    draw(ctx, app, ui) {
      S.app = app; S.ui = ui;
      ensureFx(ui);
      geometry(ui);
      if (S.mode === 'shop') drawShop(ctx, app, ui);
      else drawCeremony(ctx, app, ui);
      if (S.odds) drawOddsSheet(ctx, app, ui);
      else if (S.inspect >= 0 && S.res) drawInspect(ctx, app, ui);
    },
    // test and lab hooks
    advance, startOpen, skipAll, fastForward,
    get state() { return S; },
  };

  // ---------------------------------------------------------------------------------------------- geometry
  function geometry(ui) {
    const c = ui.content, n = S.res ? S.res.drops.length : 1;
    G.cx = c.x + c.w / 2; G.W = c.w;
    const top = ui.safe.top;
    if (n <= 1) {
      G.crateS = Math.min(c.w * 0.62, ui.h * 0.3, 250);
      G.crateX = G.cx; G.crateY = ui.h * 0.4;
      const sh = Math.min(ui.h * 0.4, c.w * 0.56 * 1.4);
      G.spot.h = sh; G.spot.w = sh / 1.4;
      G.spot.x = G.cx - G.spot.w / 2; G.spot.y = ui.h * 0.41 - sh / 2;
    } else {
      G.crateS = Math.min(c.w * 0.3, ui.h * 0.15, 130);
      G.crateX = G.cx; G.crateY = top + 52 + G.crateS * 0.55;
      const pad = 12, gap = 6;
      const sw = Math.min((c.w - pad * 2 - gap * 4) / 5, (ui.h * 0.2 - gap) / 1.4);
      G.slotW = sw; G.slotH = sw * 1.4;
      G.gridTop = ui.h - 92 - ui.safe.bottom - G.slotH * 2 - gap - 26;
      const gx = G.cx - (sw * 5 + gap * 4) / 2;
      for (let i = 0; i < MAX_SLOTS; i++) {
        const s2 = G.slots[i];
        s2.w = sw; s2.h = G.slotH; s2.x = gx + (i % 5) * (sw + gap); s2.y = G.gridTop + Math.floor(i / 5) * (G.slotH + gap);
      }
      const crateBottom = G.crateY + G.crateS * 0.5;
      const avail = G.gridTop - (crateBottom + 8) - 86;
      const sh = clamp(Math.min(avail, c.w * 0.46 * 1.4), 120, 300);
      G.spot.h = sh; G.spot.w = sh / 1.4;
      G.spot.x = G.cx - G.spot.w / 2; G.spot.y = crateBottom + 8 + 44;
    }
    G.mouthY = G.crateY;
  }

  // ---------------------------------------------------------------------------------------------- shop
  function drawBar(ctx, x, y, w, h, v, col, soft) {
    ctx.save(); ctx.translate(x, y);
    chamfer(ctx, 0, 0, w, h, Math.min(4, h * 0.3)); ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = PAL.ink2; ctx.fill();
    ctx.save(); chamfer(ctx, 0, 0, w, h, Math.min(4, h * 0.3)); ctx.clip();
    const fw = w * clamp(v, 0, 1);
    ctx.fillStyle = col; ctx.fillRect(0, 0, fw, h);
    ctx.fillStyle = rgba(PAL.bone, 0.45); ctx.fillRect(0, 0, fw, 1.5);
    if (v >= 0.995) { ctx.fillStyle = rgba(PAL.bone, 0.3 + 0.3 * Math.sin(S.t * 8)); ctx.fillRect(0, 0, w, h); }
    ctx.restore();
    if (soft > 0 && soft < 1) { ctx.fillStyle = rgba(PAL.bone, 0.85); ctx.fillRect(w * soft - 1, -2, 2, h + 4); }
    chamfer(ctx, 0, 0, w, h, Math.min(4, h * 0.3)); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, 0.8); ctx.stroke();
    ctx.restore();
  }

  function drawShop(ctx, app, ui) {
    const p = app.profile, c = ui.content, X = c.x, W = c.w, t = ui.t;
    ui.clear(PAL.void);
    ui.background('rooftop_row', { dim: 0.42 });
    const def = CRATES[S.sel], id = def.id;
    const tbl = oddsOf(p, id);
    const keys = Math.max(0, Math.floor(((p.town && p.town.keys && p.town.keys[id]) || 0)));
    // ---- top row
    const ty = c.y + 10;
    if (ui.button('back', { x: X + 12, y: ty, w: 46, h: 46 }, '', { kind: 'icon', icon: 'back', aria: 'Back' }) || ui.keyHit('escape')) { ui.eatKey('escape'); if (app.router && app.router.back) app.router.back(); }
    ui.currencyStrip({ x: X + 66, y: ty + 7, w: W - 78, h: 32 }, p.cur, { show: ['fish', 'yarn', 'gems'] });
    // ---- crate tiles
    const tileY = ty + 56, tileH = 84, gap = 6, tw = (W - 24 - gap * 4) / 5;
    for (let i = 0; i < CRATES.length; i++) {
      const cd = CRATES[i], x = X + 12 + i * (tw + gap), on = i === S.sel;
      const st = ui.region('tile:' + cd.id, { x, y: tileY, w: tw, h: tileH }, { focus: true, label: cd.name });
      const pr = priceFor(p, cd.id, 1), afford = (p.cur[pr.cur] || 0) >= pr.price;
      const k = (p.town && p.town.keys && p.town.keys[cd.id]) | 0;
      ctx.save(); ctx.translate(x, tileY);
      if (on) glow(ctx, tw / 2, tileH / 2, tw * 1.1, PAL.cyan, 0.35);
      chamfer(ctx, 0, 0, tw, tileH, 6); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = vgrad(ctx, 'ctile', tileH, on ? PAL.ink3 : PAL.ink2, PAL.ink); ctx.fill();
      ctx.lineWidth = on ? 2.5 : 1.5; ctx.strokeStyle = on ? PAL.cyan : (st.hover ? PAL.violetHi : PAL.violet); ctx.stroke();
      ICONS.drawCrate(ctx, cd.id, tw / 2, 33, tw * 0.82, { t, glow: 0.6 });
      ICONS.drawCurrency(ctx, pr.cur, 11, tileH - 12, 15, t);
      drawText(ctx, fmtNum(pr.price), tw - 5, tileH - 7, { size: 13, kind: 'body', weight: 800, align: 'right', color: afford ? PAL.bone : PAL.magenta, maxWidth: tw - 24, stroke: 3 });
      ctx.restore();
      if (k > 0) ui.badge(x + tw - 4, tileY + 6, k, { color: PAL.lime });
      if (st.tap) { S.sel = i; PREF.sel = i; }
    }
    // ---- bottom block geometry
    const bottom = c.y + c.h - 14, btnH = 58;
    const mainY = bottom - btnH;
    const keyRowY = mainY - 52;
    const pityH = 112;
    const pityY = (keys > 0 ? keyRowY : mainY) - 10 - pityH;
    // ---- stage
    const stageTop = tileY + tileH + 6, stageBot = pityY - 6, stageH = Math.max(120, stageBot - stageTop);
    const cs = clamp(Math.min(stageH * 0.62, W * 0.5, 250), 90, 250);
    const cx = X + W / 2, cy = stageTop + stageH * 0.43;
    const hum = tbl ? maxPityFrac(tbl) : 0;
    glow(ctx, cx, cy, cs * 1.25, hexFromArt(def), 0.22 + 0.2 * hum);
    ICONS.drawCrate(ctx, id, cx, cy + Math.sin(t * 1.7) * 3, cs, { t, glow: hexFromArt(def), shake: hum > 0.85 ? (hum - 0.85) * 2.4 : 0 });
    drawText(ctx, def.name, cx, stageTop + stageH - 40, { size: 28, kind: 'display', align: 'center', gradient: [PAL.bone, PAL.cyan], glow: 10, glowColor: PAL.cyan, maxWidth: W - 100 });
    const lines = ui.wrap(def.blurb, W - 100, { size: 13, kind: 'body', weight: 600 });
    for (let i = 0; i < Math.min(2, lines.length); i++) drawText(ctx, lines[i], cx, stageTop + stageH - 18 + i * 16, { size: 13, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, stroke: 3 });
    // arrows
    const arrow = (dir) => (cc, x, y, s) => { cc.save(); cc.translate(x, y); cc.scale(dir, 1); cc.strokeStyle = PAL.bone; cc.lineWidth = 3.5; cc.lineCap = 'round'; cc.lineJoin = 'round'; cc.beginPath(); cc.moveTo(s * 0.22, -s * 0.34); cc.lineTo(-s * 0.2, 0); cc.lineTo(s * 0.22, s * 0.34); cc.stroke(); cc.restore(); };
    if (ui.button('prev', { x: X + 8, y: cy - 24, w: 44, h: 48 }, '', { kind: 'secondary', icon: arrow(1), aria: 'Previous crate' }) || ui.keyHit('left')) { ui.eatKey('left'); S.sel = (S.sel + CRATES.length - 1) % CRATES.length; PREF.sel = S.sel; }
    if (ui.button('next', { x: X + W - 52, y: cy - 24, w: 44, h: 48 }, '', { kind: 'secondary', icon: arrow(-1), aria: 'Next crate' }) || ui.keyHit('right')) { ui.eatKey('right'); S.sel = (S.sel + 1) % CRATES.length; PREF.sel = S.sel; }
    // ---- pity panel
    const pin = ui.panel({ x: X + 12, y: pityY, w: W - 24, h: pityH }, { title: 'PITY', color: PAL.violetHi });
    const rowH = pin.h / 3;
    const tierNames = { epic: 'EPIC', legend: 'LEGEND', mythic: 'MYTHIC' };
    for (let i = 0; i < PITY_TIERS.length; i++) {
      const tier = PITY_TIERS[i], pt = tbl && tbl.pity[tier], ry = pin.y + i * rowH;
      const col = rcol(tier, t);
      drawText(ctx, tierNames[tier], pin.x + 2, ry + rowH * 0.62, { size: 15, kind: 'display', color: pt ? col : PAL.slate, stroke: 3 });
      if (pt) {
        const v = pt.counter / pt.hard;
        drawBar(ctx, pin.x + 74, ry + rowH * 0.22, pin.w - 74 - 74, rowH * 0.5, v, col, pt.soft / pt.hard);
        const left = pt.remaining;
        drawText(ctx, left <= 1 ? 'NEXT!' : left + ' to go', pin.x + pin.w, ry + rowH * 0.64, { size: 13, kind: 'body', weight: 800, align: 'right', color: left <= 1 ? PAL.lime : PAL.boneDim, maxWidth: 70, stroke: 3 });
      } else drawText(ctx, 'no guarantee in this crate', pin.x + 74, ry + rowH * 0.62, { size: 13, kind: 'body', weight: 600, color: PAL.slate, stroke: 3 });
    }
    // ---- buttons
    const p1 = priceFor(p, id, 1), p10 = priceFor(p, id, MULTI_COUNT);
    const a1 = (p.cur[p1.cur] || 0) >= p1.price, a10 = (p.cur[p10.cur] || 0) >= p10.price;
    const bw = (W - 24 - 16) / 4;
    if (ui.button('odds', { x: X + 12, y: mainY, w: bw, h: btnH }, 'ODDS', { kind: 'info', sub: 'see all', size: 18 })) S.odds = id;
    if (ui.button('open1', { x: X + 12 + bw + 8, y: mainY, w: bw * 1.5, h: btnH }, 'OPEN x1', { kind: 'primary', sub: fmtNum(p1.price) + ' ' + p1.cur, disabled: !a1, pulse: a1, size: 20 })) startOpen(id, 1, false);
    else if (!a1 && ui.tapId === 'open1') ui.toast('Need ' + fmtNum(p1.price - (p.cur[p1.cur] || 0)) + ' more ' + p1.cur, 'warn');
    if (ui.button('open10', { x: X + 12 + bw * 2.5 + 16, y: mainY, w: bw * 1.5, h: btnH }, 'OPEN x10', { kind: 'primary', sub: fmtNum(p10.price) + ' ' + p10.cur, disabled: !a10, size: 20 })) startOpen(id, MULTI_COUNT, false);
    else if (!a10 && ui.tapId === 'open10') ui.toast('Need ' + fmtNum(p10.price - (p.cur[p10.cur] || 0)) + ' more ' + p10.cur, 'warn');
    if (keys > 0) {
      const kw = keys >= MULTI_COUNT ? (W - 24 - 8) / 2 : W - 24;
      if (ui.button('key1', { x: X + 12, y: keyRowY, w: kw, h: 46 }, 'USE KEY x1', { kind: 'positive', sub: keys + ' key' + (keys === 1 ? '' : 's') + ' ready', size: 17 })) startOpen(id, 1, true);
      if (keys >= MULTI_COUNT && ui.button('key10', { x: X + 12 + kw + 8, y: keyRowY, w: kw, h: 46 }, 'USE 10 KEYS', { kind: 'positive', size: 17 })) startOpen(id, MULTI_COUNT, true);
    }
    if (tbl && tbl.luck.level > 0) {
      const lw = 128, lx = X + W - 12 - lw - 12, ly = pityY - 11;
      chamfer(ctx, lx, ly, lw, 24, 5); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = shade(PAL.cyanDeep, -0.35); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.bone, 0.5); ctx.stroke();
      drawText(ctx, 'LUCK L' + tbl.luck.level + '  x' + tbl.luck.mult.toFixed(2), lx + lw / 2, ly + 17, { size: 13, kind: 'display', align: 'center', color: PAL.bone, stroke: 3, maxWidth: lw - 10 });
    }
    ui.vignette(0.4);
  }

  function hexFromArt(def) {
    const a = def.art && def.art.glow;
    if (a && PAL[a]) return PAL[a];
    return PAL.cyan;
  }
  function maxPityFrac(tbl) {
    let m = 0;
    for (const tier of PITY_TIERS) { const pt = tbl.pity[tier]; if (pt) m = Math.max(m, pt.counter / pt.hard); }
    return m;
  }

  // ---------------------------------------------------------------------------------------------- ceremony drawing
  function dropState(k, T, out) {
    const r = S.tl.drops[k];
    out.phase = 0; out.p = 0; out.face = 0; out.sx = 1; out.rot = 0; out.s = 1;
    const sp = G.spot, scx = sp.x + sp.w / 2, scy = sp.y + sp.h / 2, m = mouth();
    out.x = scx; out.y = scy;
    if (T < r.t0) { out.phase = -1; return out; }
    const n = S.tl.n;
    if (T < r.t0 + r.dur.launch) {
      const p = (T - r.t0) / r.dur.launch, e = outCubic(p);
      out.phase = 1; out.p = p;
      out.x = lerp(m.x, scx, e); out.y = lerp(m.y, scy, e) - Math.sin(Math.PI * e) * sp.h * 0.3;
      out.s = lerp(0.3, 1, outBack(p)); out.rot = (1 - e) * 0.5 * (k % 2 ? 1 : -1);
      return out;
    }
    if (T < r.tFlip) { out.phase = 2; out.p = (T - r.t0 - r.dur.launch) / Math.max(0.001, r.dur.charge); const ch = out.p; const jit = (RI[r.rarity] >= 2 ? ch * 3 : ch) * (reduced() ? 0 : 1); out.x += Math.sin(S.t * 63) * jit; out.y += Math.cos(S.t * 51) * jit * 0.6; out.s = 1 + 0.04 * Math.sin(S.t * 9) * ch; return out; }
    if (T < r.tFace) { const p = (T - r.tFlip) / r.dur.flip; out.phase = 3; out.p = p; out.sx = Math.abs(Math.cos(Math.PI * p)); out.face = p >= 0.5 ? 1 : 0; out.s = 1 + 0.14 * Math.sin(Math.PI * p); return out; }
    if (n > 1 && T >= r.tStow) {
      if (T >= r.tEnd) { out.phase = 6; out.face = 1; const sl = G.slots[r.d]; out.x = sl.x + sl.w / 2; out.y = sl.y + sl.h / 2; out.s = sl.w / sp.w; return out; }
      const p = (T - r.tStow) / r.dur.stow, e = inOutSine(p), sl = G.slots[r.d];
      out.phase = 5; out.p = p; out.face = 1;
      out.x = lerp(scx, sl.x + sl.w / 2, e); out.y = lerp(scy, sl.y + sl.h / 2, e); out.s = lerp(1, sl.w / sp.w, e);
      return out;
    }
    out.phase = 4; out.p = (T - r.tFace) / Math.max(0.001, r.dur.hold); out.face = 1;
    out.y += reduced() ? 0 : Math.sin(S.t * 2.2) * 3;
    return out;
  }

  function drawCeremony(ctx, app, ui) {
    const t = ui.t, c = ui.content, fx = S.fx, rr = reduced();
    const summary = S.mode === 'summary';
    const tl = S.tl, n = tl ? tl.n : 1;
    ui.clear(PAL.void);
    ui.background(null, { dim: 0.62 });
    const best = S.summary && S.summary.best >= 0 ? S.res.drops[S.summary.best] : null;
    const gcol = hexOf(S.glowCol, t);
    ctx.save();
    ctx.translate(fx.shake.x, fx.shake.y);
    // atmosphere
    glow(ctx, G.crateX, G.crateY, G.crateS * 2.2 + ui.h * 0.25, gcol, 0.2 + 0.4 * S.glowAmt);
    const bursted = S.openTarget > 0.5;
    const bestR = best ? ri(best.rarity) : 0;
    if (bursted && !summary && bestR >= 2) drawRays(ctx, G.crateX, G.crateY, ui.h * 0.9, gcol, 0.05 + 0.03 * bestR, t, 12, rr ? 0 : 0.18, best.rarity === 'mythic');
    // pulse ring on the crate
    const pa = S.T - S.pulseT;
    if (!rr && pa >= 0 && pa < 0.6) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 3; ctx.strokeStyle = rgba(hexOf(S.pulseCol, t), (1 - pa / 0.6) * 0.8);
      ctx.beginPath(); ctx.arc(G.crateX, G.crateY, G.crateS * (0.4 + pa * 1.4), 0, TAU); ctx.stroke(); ctx.restore();
    }
    // crate
    const shakeV = clamp(S.shakeAmt, 0, 1.6) * (rr ? 0 : 1);
    ctx.save();
    const sink = n === 1 ? outCubic(S.open) : 0;                       // a single drop takes the stage: the crate sinks away
    ctx.globalAlpha = (summary && n > 1 ? 0.55 : 1) * (1 - 0.7 * sink);
    ICONS.drawCrate(ctx, S.crateId, G.crateX, G.crateY + sink * G.crateS * 0.55, G.crateS * (1 - 0.3 * sink), { t, open: S.open, glow: gcol, shake: shakeV });
    ctx.restore();
    // slots (x10)
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        const s = G.slots[i];
        const filled = S.stowed[i] || (summary);
        ctx.save();
        if (!filled) {
          chamfer(ctx, s.x, s.y, s.w, s.h, 5); ctx.fillStyle = rgba(PAL.ink, 0.5); ctx.fill(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(PAL.violetHi, 0.5); ctx.stroke(); ctx.setLineDash([]);
        } else {
          const dd = S.res.drops[i];
          drawDropCard(ctx, dd, s.x, s.y, s.w, s.h, { t, compact: true, pop: summary && !rr ? clamp(S.sumT / 0.3, 0, 1) : 1, hl: summary && i === S.summary.best ? 0.6 + 0.4 * Math.sin(t * 4) : 0 });
        }
        ctx.restore();
      }
    }
    // the drop in the spotlight
    if (!summary && tl) {
      for (let k = 0; k < tl.drops.length; k++) {
        const r = tl.drops[k];
        if (S.T < r.t0) break;
        if (n > 1 && S.T >= r.tEnd) continue;
        dropState(k, S.T, S.ds);
        drawSpotDrop(ctx, k, S.res.drops[r.d], S.ds, t);
      }
    } else if (summary && n === 1) {
      const d0 = S.res.drops[0], sp = G.spot;
      const pop = rr ? 1 : outBack(clamp(S.sumT / 0.25, 0, 1));
      drawRays(ctx, sp.x + sp.w / 2, sp.y + sp.h / 2, sp.h * 1.2, hexOf(d0.rarity, t), ri(d0.rarity) >= 2 ? 0.05 + 0.02 * ri(d0.rarity) : 0, t, 10, rr ? 0 : 0.15, d0.rarity === 'mythic');
      drawDropCard(ctx, d0, sp.x, sp.y, sp.w, sp.h, { t, pop, hl: ri(d0.rarity) >= 2 ? 0.5 + 0.5 * Math.sin(t * 3) : 0 });
      const R0 = ri(d0.rarity), fs0 = [18, 22, 34, 42, 50][R0];
      drawText(ctx, RARITY[d0.rarity].name.toUpperCase() + (R0 >= 2 ? '!' : ''), sp.x + sp.w / 2, sp.y - 12, { size: fs0 * (0.8 + 0.2 * pop), kind: 'display', align: 'center', color: rcol(d0.rarity, t), glow: R0 >= 2 ? 14 : 0, glowColor: rcol(d0.rarity, t), stroke: Math.max(3, fs0 * 0.14), maxWidth: G.W - 30 });
    }
    FX.draw(ctx, fx, t);
    ctx.restore();
    // ---- HUD
    if (!summary) drawCeremonyHud(ctx, app, ui);
    else drawSummary(ctx, app, ui);
    ui.vignette(0.45);
  }

  function drawSpotDrop(ctx, k, d, ds, t) {
    const sp = G.spot, w = sp.w, h = sp.h, R = ri(d.rarity), col = hexOf(d.rarity, t);
    const r = S.tl.drops[k];
    const T = S.T;
    // beam and aura while it is out
    if (ds.phase >= 1 && ds.phase <= 4 && R >= 1) {
      const a = ds.phase === 1 ? ds.p : ds.phase === 2 ? 0.6 + 0.4 * ds.p : ds.phase === 3 ? 1 : Math.max(0, 1 - ds.p * 1.3);
      const m = mouth();
      drawBeam(ctx, m.x, m.y, Math.min(ds.y - h * 0.3, m.y - 40), w * (0.5 + 0.12 * R), col, a * (0.12 + 0.08 * R));
      drawBeam(ctx, ds.x, ds.y + h * 0.5, 0, w * (0.35 + 0.08 * R), col, a * (0.05 + 0.05 * R));
      glow(ctx, ds.x, ds.y, Math.max(w, h) * (0.7 + 0.15 * R), col, 0.18 + 0.08 * R * a);
    }
    if (ds.phase === 2 && R >= 2 && !reduced()) drawRays(ctx, ds.x, ds.y, h * (0.8 + ds.p * 0.8), col, 0.05 + 0.06 * ds.p, t, 10, 0.4, d.rarity === 'mythic');
    if ((ds.phase === 3 || ds.phase === 4) && R >= 3) drawRays(ctx, ds.x, ds.y, h * 1.3, col, 0.07, t, 14, reduced() ? 0 : 0.25, d.rarity === 'mythic');
    ctx.save();
    ctx.translate(ds.x, ds.y);
    ctx.rotate(ds.rot);
    ctx.scale(ds.s * Math.max(0.02, ds.sx), ds.s);
    if (ds.face === 0) drawCardBack(ctx, -w / 2, -h / 2, w, h, d.rarity, t);
    else {
      const popT = S.revealT[r.d] >= 0 ? clamp((T - S.revealT[r.d]) / 0.3, 0, 1) : 0;
      drawDropCard(ctx, d, -w / 2, -h / 2, w, h, { t, pop: ds.phase >= 4 ? popT : 0, compact: ds.phase === 5 ? true : undefined, hl: R >= 2 && ds.phase === 4 ? 0.6 + 0.4 * Math.sin(t * 5) : 0 });
    }
    ctx.restore();
    // name of the rarity and the new / dupe line while it is on stage
    if (ds.phase === 4 || (ds.phase === 3 && ds.face === 1)) {
      const age = clamp((T - r.tFace) / 0.3 + (ds.phase === 3 ? 0.3 : 0), 0, 1), pop = outBack(age);
      const label = RARITY[d.rarity].name.toUpperCase() + (R >= 2 ? '!' : '');
      const fs = [18, 22, 34, 42, 50][R];
      ctx.save();
      ctx.globalAlpha = clamp(age * 2, 0, 1);
      drawText(ctx, label, ds.x, sp.y - 12 - (1 - pop) * 14, { size: fs * (0.8 + 0.2 * pop), kind: 'display', align: 'center', color: col, glow: R >= 2 ? 14 : 0, glowColor: col, stroke: Math.max(3, fs * 0.14), maxWidth: G.W - 30 });
      if (d.golden) drawText(ctx, 'GOLDEN x2', ds.x, sp.y - 12 - fs - 6, { size: 22, kind: 'display', align: 'center', color: PAL.goldHot, glow: 10, glowColor: PAL.gold, maxWidth: G.W - 30 });
      // under the card
      let ly = sp.y + sp.h + 26;
      if (d.isNew && d.kind !== 'yarn' && d.kind !== 'gems') {
        drawText(ctx, d.kind === 'cat' ? 'NEW CAT!' : d.kind === 'relic' ? 'NEW RELIC!' : 'NEW CARD!', ds.x, ly, { size: 24 * (0.85 + 0.15 * pop), kind: 'display', align: 'center', color: PAL.lime, glow: 10, glowColor: PAL.lime });
        if (d.kind === 'cat') drawText(ctx, 'Its call card joins your collection', ds.x, ly + 20, { size: 13, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, stroke: 3 });
      } else if (d.kind === 'yarn' || d.kind === 'gems') {
        drawText(ctx, '+' + fin(d.amount) + ' ' + d.kind, ds.x, ly, { size: 22, kind: 'display', align: 'center', color: d.kind === 'gems' ? PAL.cyan : PAL.bone });
      } else {
        drawText(ctx, 'DUPLICATE', ds.x, ly, { size: 20, kind: 'display', align: 'center', color: PAL.boneDim });
        const conv = (d.kind === 'cat' ? (fin(d.starsGained) > 0 ? 'Star ' + fin(d.stars) + ' reached, ' : '') : d.kind === 'card' ? 'Copy x' + fin(d.count) + ', ' : '') + '+' + fin(d.dupeValue) + ' yarn';
        ICONS.drawCurrency(ctx, 'yarn', ds.x - 6 - conv.length * 3.6, ly + 16, 16, t);
        drawText(ctx, conv, ds.x + 8, ly + 21, { size: 14, kind: 'body', weight: 700, align: 'center', color: PAL.bone, stroke: 3 });
      }
      ctx.restore();
    }
  }

  function drawCeremonyHud(ctx, app, ui) {
    const c = ui.content, tl = S.tl;
    // tap anywhere region first (buttons registered later win)
    const st = ui.region('cer:tap', { x: 0, y: 0, w: ui.w, h: ui.h }, null);
    if (st.tap) fastForward();
    let cur = 0;
    for (let i = 0; i < tl.drops.length; i++) if (S.T >= tl.drops[i].t0) cur = i + 1;
    if (tl.n > 1) drawText(ctx, Math.min(cur, tl.n) + ' / ' + tl.n, c.x + 16, ui.safe.top + 36, { size: 22, kind: 'display', color: PAL.bone, stroke: 4 });
    else drawText(ctx, S.useKey ? 'KEY OPEN' : 'OPENING', c.x + 16, ui.safe.top + 36, { size: 20, kind: 'display', color: PAL.boneDim, stroke: 4 });
    if (ui.button('skip', { x: c.x + c.w - 112, y: ui.safe.top + 10, w: 100, h: 46 }, 'SKIP', { kind: 'secondary', size: 18 }) || ui.keyHit('escape')) { ui.eatKey('escape'); skipAll(); }
    if (S.T < tl.tBurst && S.tapLock <= 0) drawText(ctx, 'tap to hurry', c.x + c.w / 2, ui.h - ui.safe.bottom - 28, { size: 13, kind: 'body', weight: 700, align: 'center', color: rgba(PAL.boneDim, 0.6 + 0.3 * Math.sin(ui.t * 4)), stroke: 3 });
  }

  function drawSummary(ctx, app, ui) {
    const c = ui.content, W = c.w, X = c.x, sm = S.summary, res = S.res, n = res.drops.length, p = app.profile, t = ui.t;
    const rr = reduced();
    const a = rr ? 1 : clamp(S.sumT / 0.3, 0, 1);
    const best = res.drops[sm.best];
    const bcol = rcol(best.rarity, t);
    // headline
    let y = n > 1 ? G.crateY + G.crateS * 0.5 + 24 : G.spot.y + G.spot.h + 34;
    ctx.save(); ctx.globalAlpha = a;
    if (n > 1) {
      drawText(ctx, 'PULL COMPLETE', X + W / 2, y, { size: 30, kind: 'display', align: 'center', gradient: [PAL.bone, PAL.cyan], glow: 10, glowColor: PAL.cyan, maxWidth: W - 30 });
      y += 22;
      drawText(ctx, 'Best: ' + dropInfo(best).name + ' (' + RARITY[best.rarity].name + ')', X + W / 2, y, { size: 15, kind: 'body', weight: 800, align: 'center', color: bcol, maxWidth: W - 30, stroke: 3 });
      y += 16;
    } else {
      const info = dropInfo(best);
      drawText(ctx, best.isNew && best.kind !== 'yarn' && best.kind !== 'gems' ? 'NEW ' + KIND_LABEL[best.kind] + '!' : best.dupeValue > 0 ? 'DUPLICATE' : 'REWARD', X + W / 2, y - 6, { size: 28, kind: 'display', align: 'center', color: best.isNew ? PAL.lime : PAL.bone, glow: best.isNew ? 10 : 0, glowColor: PAL.lime });
      const conv = best.dupeValue > 0 ? '+' + fin(best.dupeValue) + ' yarn' + (best.kind === 'cat' && best.starsGained > 0 ? '  and star ' + best.stars : '') : '';
      if (conv) drawText(ctx, conv, X + W / 2, y + 18, { size: 15, kind: 'body', weight: 800, align: 'center', color: PAL.bone, stroke: 3 });
      void info;
      y += 24;
    }
    // chips
    const chips = [];
    if (sm.news) chips.push({ text: sm.news + ' new', col: PAL.lime });
    if (sm.dupes) chips.push({ text: sm.dupes + ' dupe' + (sm.dupes === 1 ? '' : 's') + ' +' + fmtNum(sm.dupeYarn) + ' yarn', col: PAL.magenta });
    if (sm.yarn) chips.push({ text: '+' + fmtNum(sm.yarn) + ' yarn', col: PAL.magenta });
    if (sm.gems) chips.push({ text: '+' + fmtNum(sm.gems) + ' gems', col: PAL.cyan });
    if (sm.stars) chips.push({ text: sm.stars + ' star' + (sm.stars === 1 ? '' : 's'), col: PAL.cyan });
    if (sm.golden) chips.push({ text: sm.golden + ' golden', col: PAL.gold });
    let cx = 0; const widths = chips.map((ch) => ch.text.length * 7.4 + 22);
    const total = widths.reduce((s2, v) => s2 + v, 0) + 6 * Math.max(0, chips.length - 1);
    const wrapAt = W - 24;
    let rowW = 0, row = 0; const rows = [[]];
    for (let i = 0; i < chips.length; i++) { if (rowW + widths[i] > wrapAt && rows[row].length) { row++; rows.push([]); rowW = 0; } rows[row].push(i); rowW += widths[i] + 6; }
    void total; void cx;
    for (let r2 = 0; r2 < rows.length; r2++) {
      const ids = rows[r2], rw = ids.reduce((s2, i) => s2 + widths[i] + 6, -6);
      let x = X + W / 2 - rw / 2;
      for (const i of ids) {
        const ch = chips[i], w = widths[i];
        chamfer(ctx, x, y, w, 22, 4); ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = rgba(shade(ch.col, -0.65), 0.95); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = ch.col; ctx.stroke();
        drawText(ctx, ch.text, x + w / 2, y + 16, { size: 13, kind: 'body', weight: 800, align: 'center', color: ch.col === PAL.gold ? PAL.goldHot : PAL.bone, stroke: 2.5, maxWidth: w - 8 });
        x += w + 6;
      }
      y += 28;
    }
    // the best pull, big, in the space above the grid (tap to read it)
    if (n > 1) {
      const availH = G.gridTop - 16 - y;
      if (availH >= 100) {
        const bh2 = Math.min(availH, 210), bw2 = bh2 / 1.4, bx = X + W / 2 - bw2 / 2, by = y + (availH - bh2) / 2;
        const pop2 = rr ? 1 : outBack(clamp((S.sumT - 0.15) / 0.3, 0, 1));
        ctx.save(); ctx.translate(bx + bw2 / 2, by + bh2 / 2); ctx.scale(pop2, pop2); ctx.translate(-bw2 / 2, -bh2 / 2);
        drawRays(ctx, bw2 / 2, bh2 / 2, bh2 * 0.9, bcol, ri(best.rarity) >= 2 ? 0.05 : 0, t, 10, rr ? 0 : 0.15, best.rarity === 'mythic');
        drawDropCard(ctx, best, 0, 0, bw2, bh2, { t, hl: ri(best.rarity) >= 2 ? 0.5 + 0.5 * Math.sin(t * 3) : 0.2 });
        ctx.restore();
        const sb = ui.region('slot:best', { x: bx, y: by, w: bw2, h: bh2 }, { focus: true, label: 'Best pull: ' + dropInfo(best).name });
        if (sb.tap) S.inspect = sm.best;
      }
    }
    ctx.restore();
    // tap a thumbnail to inspect (x10)
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        const s = G.slots[i];
        const stt = ui.region('slot:' + i, { x: s.x, y: s.y, w: s.w, h: s.h }, { focus: true, label: dropInfo(res.drops[i]).name });
        if (stt.tap) S.inspect = i;
      }
    } else {
      const sp = G.spot, stt = ui.region('slot:0', { x: sp.x, y: sp.y, w: sp.w, h: sp.h }, { focus: true, label: dropInfo(res.drops[0]).name });
      if (stt.tap) S.inspect = 0;
    }
    // buttons
    const bottom = c.y + c.h - 14, bh = 58;
    const pr = priceFor(p, S.crateId, S.count), afford = S.useKey ? ((p.town && p.town.keys && p.town.keys[S.crateId]) | 0) >= S.count : (p.cur[pr.cur] || 0) >= pr.price;
    const sub = S.useKey ? S.count + ' key' + (S.count === 1 ? '' : 's') : fmtNum(pr.price) + ' ' + pr.cur;
    const bw = (W - 24 - 8) * 0.64, dw = W - 24 - 8 - bw;
    const gain = a >= 1 || rr;
    if (ui.button('again', { x: X + 12, y: bottom - bh, w: bw, h: bh }, 'OPEN AGAIN x' + S.count, { kind: 'primary', sub, disabled: !afford || !gain, pulse: afford, size: 20 })) startOpen(S.crateId, S.count, S.useKey);
    else if (!afford && ui.tapId === 'again') ui.toast(S.useKey ? 'Not enough keys' : 'Need ' + fmtNum(pr.price - (p.cur[pr.cur] || 0)) + ' more ' + pr.cur, 'warn');
    if (ui.button('done', { x: X + 12 + bw + 8, y: bottom - bh, w: dw, h: bh }, 'DONE', { kind: 'secondary', size: 20, disabled: !gain }) || (gain && ui.keyHit('escape') && ui.eatKey('escape'))) {
      S.mode = 'shop'; S.res = null; S.tl = null; S.open = 0; S.openTarget = 0;
      const au = audio(); if (au && au.music) { try { au.music('town'); } catch (e) { /* optional */ } }
    }
    ui.currencyStrip({ x: X + 12, y: ui.safe.top + 10, w: W - 24 - 54, h: 30 }, p.cur, { show: ['fish', 'yarn', 'gems'] });
    if (ui.button('odds2', { x: X + W - 12 - 46, y: ui.safe.top + 6, w: 46, h: 46 }, '', { kind: 'info', icon: 'info', aria: 'Odds' })) S.odds = S.crateId;
  }

  // ---------------------------------------------------------------------------------------------- overlays
  function drawInspect(ctx, app, ui) {
    const d = S.res.drops[S.inspect];
    if (!d) { S.inspect = -1; return; }
    ui.pushLayer();
    ctx.save(); ctx.fillStyle = rgba(PAL.void, 0.82); ctx.fillRect(0, 0, ui.w, ui.h); ctx.restore();
    const blk = ui.region('insp:block', { x: 0, y: 0, w: ui.w, h: ui.h }, null);
    if (blk.tap || ui.keyHit('escape')) { ui.eatKey('escape'); S.inspect = -1; }
    const cw = Math.min(ui.content.w - 60, 260), ch = cw * 1.4;
    const x = ui.w / 2 - cw / 2, y = Math.max(ui.safe.top + 24, ui.h / 2 - ch / 2 - 30);
    const col = rcol(d.rarity, ui.t);
    drawRays(ctx, ui.w / 2, y + ch / 2, ch * 0.9, col, ri(d.rarity) >= 2 ? 0.06 : 0, ui.t, 10, reduced() ? 0 : 0.2, d.rarity === 'mythic');
    drawDropCard(ctx, d, x, y, cw, ch, { t: ui.t });
    const info = dropInfo(d);
    let ly = y + ch + 26;
    drawText(ctx, RARITY[d.rarity].name.toUpperCase() + ' ' + info.label, ui.w / 2, ly, { size: 18, kind: 'display', align: 'center', color: col });
    ly += 8;
    const lines = ui.wrap(info.text, Math.min(ui.content.w - 40, 320), { size: 14, kind: 'body', weight: 600 });
    for (const ln of lines.slice(0, 4)) { ly += 19; drawText(ctx, ln, ui.w / 2, ly, { size: 14, kind: 'body', weight: 600, align: 'center', color: PAL.bone, stroke: 3 }); }
    if (d.dupeValue > 0) { ly += 24; drawText(ctx, 'Duplicate: +' + d.dupeValue + ' yarn' + (d.kind === 'cat' && d.starsGained > 0 ? ', star ' + d.stars : ''), ui.w / 2, ly, { size: 14, kind: 'body', weight: 800, align: 'center', color: PAL.magenta, stroke: 3 }); }
    drawText(ctx, 'tap to close', ui.w / 2, ui.h - ui.safe.bottom - 22, { size: 13, kind: 'body', weight: 700, align: 'center', color: PAL.boneDim, stroke: 3 });
    ui.popLayer();
  }

  const pct = (x) => {
    const v = x * 100;
    if (v <= 0) return '0%';
    if (v >= 99.995) return '100%';
    const s = v >= 10 ? v.toFixed(1) : v.toFixed(2);
    return s.replace(/0+$/, '').replace(/\.$/, '') + '%';
  };

  function drawOddsSheet(ctx, app, ui) {
    const p = app.profile, id = S.odds, def = CRATE_BY_ID[id], tbl = oddsOf(p, id);
    if (!def || !tbl) { S.odds = ''; return; }
    ui.pushLayer();
    ctx.save(); ctx.fillStyle = rgba(PAL.void, 0.86); ctx.fillRect(0, 0, ui.w, ui.h); ctx.restore();
    const blk = ui.region('odds:block', { x: 0, y: 0, w: ui.w, h: ui.h }, null);
    const c = ui.content;
    const sx = c.x + 8, sw = c.w - 16, sy = ui.safe.top + 10, sh = ui.h - sy - ui.safe.bottom - 10;
    ui.region('odds:panel', { x: sx, y: sy, w: sw, h: sh }, null);
    const inner = ui.panel({ x: sx, y: sy, w: sw, h: sh }, { title: 'ODDS: ' + def.name.toUpperCase(), glow: true, color: PAL.cyan });
    const closeR = { x: sx + sw - 54, y: sy + 8, w: 44, h: 44 };
    const bodyR = { x: inner.x, y: inner.y + 6, w: inner.w, h: inner.h - 6 - 60 };
    ui.scroll('odds:scroll', bodyR, S.oddsH, (cc, w) => { S.oddsH = Math.max(200, drawOddsBody(cc, ui, tbl, def, w) + 8); }, {});
    const cl = ui.button('odds:close', { x: inner.x, y: inner.y + inner.h - 50, w: inner.w, h: 48 }, 'CLOSE', { kind: 'secondary', size: 18 });
    if (cl || ui.keyHit('escape') || blk.tap) { ui.eatKey('escape'); S.odds = ''; }
    void closeR;
    ui.popLayer();
  }

  // Draws the odds body in local coordinates and returns its height. Everything printed is read from oddsTable().
  function drawOddsBody(ctx, ui, tbl, def, w) {
    let y = 4;
    const t = ui.t;
    const line = (txt, o2) => {
      const lines = ui.wrap(txt, w - 4, { size: (o2 && o2.size) || 13, kind: 'body', weight: (o2 && o2.weight) || 600 });
      for (const l of lines) { y += ((o2 && o2.size) || 13) + 5; drawText(ctx, l, 2, y, { size: (o2 && o2.size) || 13, kind: 'body', weight: (o2 && o2.weight) || 600, color: (o2 && o2.color) || PAL.boneDim, stroke: 3 }); }
    };
    const head = (txt, col) => { y += 26; drawText(ctx, txt, 2, y, { size: 17, kind: 'display', color: col || PAL.bone, stroke: 4 }); y += 4; ctx.fillStyle = rgba(col || PAL.violetHi, 0.5); ctx.fillRect(2, y, w - 4, 1.5); };
    // price
    const pr = tbl.price;
    y += 18; ICONS.drawCurrency(ctx, pr.cur, 14, y - 5, 22, t);
    drawText(ctx, fmtNum(pr.price) + ' ' + pr.cur + ' per open', 32, y, { size: 16, kind: 'body', weight: 800, color: PAL.bone, stroke: 3 });
    y += 4;
    line('Price creeps up ' + pct(CRATE_CREEP) + ' per open this run, capped at x' + CRATE_CREEP_CAP + ', so pity cannot be bought cheap. Opens so far: ' + tbl.price.opens + '.', { size: 12 });
    // rarity table
    head('RARITY');
    y += 8;
    drawText(ctx, 'Base', w - 96, y + 6, { size: 12, kind: 'body', weight: 800, align: 'right', color: PAL.boneDim, stroke: 3 });
    drawText(ctx, 'Next pull', w - 4, y + 6, { size: 12, kind: 'body', weight: 800, align: 'right', color: PAL.cyan, stroke: 3 });
    y += 12;
    for (const r of tbl.rarity) {
      const col = rcol(r.id, t);
      y += 26;
      ctx.fillStyle = rgba(col, 0.1); ctx.fillRect(0, y - 19, w, 24);
      ctx.fillStyle = col; ctx.fillRect(0, y - 19, 3, 24);
      drawText(ctx, RARITY[r.id].name, 10, y - 2, { size: 16, kind: 'display', color: col, stroke: 3 });
      drawText(ctx, pct(r.base), w - 96, y - 2, { size: 14, kind: 'mono', weight: 800, align: 'right', color: PAL.bone, stroke: 3 });
      drawText(ctx, pct(r.now), w - 4, y - 2, { size: 14, kind: 'mono', weight: 800, align: 'right', color: Math.abs(r.now - r.base) > 1e-9 ? PAL.cyan : PAL.bone, stroke: 3 });
    }
    y += 6;
    line('Next pull includes your pity counters' + (tbl.luck.level > 0 ? ' and crate luck L' + tbl.luck.level + ' (x' + tbl.luck.mult.toFixed(2) + ' on rare and up)' : '') + '. Nothing else changes the odds: not spending, not time, not streaks.', { size: 12 });
    // pity
    head('PITY (guaranteed drops)', PAL.lime);
    for (const tier of PITY_TIERS) {
      const pt = tbl.pity[tier], col = rcol(tier, t);
      y += 6;
      if (!pt) { y += 16; drawText(ctx, RARITY[tier].name + ': not guaranteed in this crate', 2, y, { size: 13, kind: 'body', weight: 700, color: PAL.slate, stroke: 3 }); continue; }
      y += 18;
      drawText(ctx, RARITY[tier].name + ' or better', 2, y, { size: 15, kind: 'display', color: col, stroke: 3 });
      drawText(ctx, pt.counter + ' / ' + pt.hard, w - 4, y, { size: 14, kind: 'mono', weight: 800, align: 'right', color: PAL.bone, stroke: 3 });
      y += 6; drawBar(ctx, 2, y, w - 4, 10, pt.counter / pt.hard, col, pt.soft / pt.hard); y += 10;
      line('Guaranteed on pull ' + pt.hard + '. From pull ' + pt.soft + ' the chance climbs to 100%. Chance right now: ' + pct(pt.chanceNow) + '.', { size: 12 });
    }
    // content
    head('WHAT DROPS', PAL.cyan);
    const kinds = ['cat', 'card', 'relic', 'yarn', 'gems'];
    y += 10;
    for (let k = 0; k < kinds.length; k++) drawText(ctx, kinds[k].toUpperCase(), 76 + k * ((w - 80) / 5) + ((w - 80) / 10), y + 4, { size: 11, kind: 'body', weight: 800, align: 'center', color: PAL.boneDim, stroke: 3 });
    y += 6;
    for (const rid of ['common', 'rare', 'epic', 'legend', 'mythic']) {
      if (tbl.rarity.find((r) => r.id === rid).base <= 0) continue;
      y += 22;
      drawText(ctx, RARITY[rid].name, 2, y - 2, { size: 13, kind: 'display', color: rcol(rid, t), stroke: 3 });
      for (let k = 0; k < kinds.length; k++) drawText(ctx, pct(tbl.content[rid][kinds[k]]), 76 + k * ((w - 80) / 5) + ((w - 80) / 10), y - 2, { size: 12, kind: 'mono', weight: 700, align: 'center', color: tbl.content[rid][kinds[k]] > 0 ? PAL.bone : PAL.slate, stroke: 3 });
    }
    y += 4;
    const pools = tbl.pools;
    line('Pool sizes: ' + RARITY_ORDER.filter((r) => tbl.rarity.find((x) => x.id === r).base > 0).map((r) => RARITY[r].name + ' ' + pools[r].cat + ' cats, ' + pools[r].card + ' cards, ' + pools[r].relic + ' relics').join('; ') + '. Every item of a rarity and kind is equally likely.', { size: 12 });
    // multi, golden
    head('X10 AND GOLDEN', PAL.magenta);
    line('x10 opens ten in a row at ten sequential prices. If none of the ten reaches ' + RARITY[tbl.multi.guarantee].name + ' or better, the last one is rolled only among ' + RARITY[tbl.multi.guarantee].name + ' and better.', { size: 13 });
    line('Golden: each pull has a ' + pct(tbl.golden) + ' chance to flash gold. A golden pull doubles the amounts and never changes the rarity.', { size: 13 });
    // dupes
    head('DUPLICATES', PAL.violetHi);
    line('A duplicate pays yarn: ' + RARITY_ORDER.map((r) => RARITY[r].name + ' ' + DUPE_YARN[r]).join(', ') + ' (cards pay half). Duplicate cats also add stars at ' + STAR_DUPES.slice(0, 5).join(', ') + ' total dupes.', { size: 13 });
    head('HONESTY', PAL.cyan);
    line('The result is rolled and saved before the animation starts. The shake, the glow colour and the near-miss flashes are decoration chosen after the roll and cannot change it. Skip shows exactly the same drops.', { size: 13, color: PAL.bone });
    y += 14;
    return y;
  }

  return screen;
}

export const crateScreen = createCrateScreen();
export default crateScreen;
