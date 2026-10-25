// THE GRAFT TABLE: pick one of your own cards and one graft, read the whole bill, then sew.
// Immediate-mode screen. The run is only changed through engine/run.js (applyGraft, skipGraft, rerollGraftOffer, afterGraft).
import { COL, EASE, clamp, lerp, rgba } from './core.js';
import { Fx } from './fx.js';
import * as RUN from '../engine/run.js';
import { cardSpec, canGraft } from '../engine/cards.js';
import { CARDS, GRAFTS, SCHOOLS } from '../data/index.js';
import { drawCard, drawGraftPatch, drawSchoolGlyph, CARD_W, CARD_H } from '../art/cards.js';
import { drawBackground } from '../art/backgrounds.js';
import * as ICONS from '../art/icons.js';
import {
  TIER, schoolColor, shatterChance, cantReason, resonanceInfo, wrapLimit, drawStaple, keyBadge, drawSeam, drawCrack, drawGauge, drawLamp,
} from './graft_parts.js';

const SC = 1.05;                       // offered card scale
const CW = CARD_W * SC, CH = CARD_H * SC;
const CARD_Y = 274;                   // card centre line
const TRAY_X = 826, TRAY_W = 430;
const AFTER = { x: 24, y: 466, w: 776, h: 244 };
const GRAFT_KEYS = ['q', 'w', 'e', 'r'];
const SKIP_OPTS = ['heal', 'budget', 'gold'];
const DIM = 'rgba(232,220,196,.6)';

let st = null;

const sfx = (app, name, o) => { const a = app.shared && app.shared.audio; if (a && a.sfx) { try { a.sfx(name, o); } catch (e) { /* audio is optional */ } } };

function layout(offer) {
  const n = offer.cards.length, m = offer.grafts.length;
  const startX = 412 - ((n - 1) * 257) / 2;
  const cards = offer.cards.map((uid, i) => ({ uid, cx: startX + i * 257, cy: CARD_Y, x: startX + i * 257 - CW / 2, y: CARD_Y - CH / 2, w: CW, h: CH }));
  const ph = m > 3 ? 84 : 108, gap = m > 3 ? 8 : 9;
  const patches = offer.grafts.map((gid, j) => ({ gid, x: TRAY_X, y: 80 + j * (ph + gap), w: TRAY_W, h: ph }));
  const end = 80 + m * (ph + gap);
  return { cards, patches, infoY: end + 2, infoH: 548 - (end + 2) - 6 };
}

function skipLimit(run) { return RUN.perk(run, 'extraSkipChoice') ? 2 : 1; }

export default {
  enter(app, params) {
    const run = (params && params.run) || app.shared.run;
    if (!run.pending || run.pending.kind !== 'graft' || !run.pending.offer) RUN.startGraftPick(run);
    const meta = app.shared.meta || {};
    st = {
      run, offer: run.pending.offer, t: 0, dealT: 0, selCard: null, selGraft: null, morphT: 1, pvKey: '', pv: null,
      menu: false, skipPick: [], fx: new Fx(), mode: 'pick', anim: null, snap: null, lift: {}, note: null, ending: false,
      reduce: !!(meta.settings && meta.settings.reduceMotion), done: false,
    };
    st.rects = layout(st.offer);
    this.st = st;
  },
  leave() { st = null; },

  update(app, dt) {
    if (!st) return;
    const d = st.fx.update(dt);
    st.t += dt; st.dealT += dt; st.morphT = Math.min(1, st.morphT + dt / 0.5);
    if (st.note) { st.note.age += dt; if (st.note.age > 2.6) st.note = null; }
    if (st.mode === 'attach' && st.anim) advanceAnim(app, d);
    if (app.top && app.top() !== this) return;      // an overlay (deck view) is on top: ignore keys
    for (const e of app.pressedKeys) onKey(app, e.key);
  },

  key() { return false; },

  draw(app) {
    if (!st) return;
    const ctx = app.ctx, run = st.run;
    const live = st.mode === 'pick';
    const interactive = live && !st.menu && !app.blocked;

    drawBackground(ctx, 'table', st.t);
    // vignette so the lamp pool reads
    ctx.save();
    const vg = ctx.createRadialGradient(412, 300, 200, 412, 300, 780);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
    const swing = 0.5 * Math.exp(-2.2 * st.t) * Math.cos(5.5 * st.t) + 0.012 * Math.sin(st.t * 1.3);
    drawLamp(ctx, 412, swing, clamp(st.t * 2.5, 0, 1));

    const sh = st.reduce ? { x: 0, y: 0 } : st.fx.shakeOffset();
    ctx.save(); ctx.translate(sh.x, sh.y);

    const strain = RUN.strainInfo(run);
    const counts = RUN.resonance(run).counts;
    const R = st.rects;
    const inst = st.selCard ? RUN.findInst(run, st.selCard) : null;
    const g = st.selGraft ? GRAFTS[st.selGraft] : null;
    const pair = !!(inst && g && (live ? canGraft(inst, st.selGraft) : true));
    const pv = pair ? (live ? getPreview(inst, st.selGraft) : st.snap.pv) : null;
    const tithedSet = new Set(pair ? pv.after.tithed : strain.tithed);

    drawTopBar(app, strain, interactive);

    // ---- cards ----
    R.cards.forEach((r, i) => drawOfferCard(app, r, i, { inst, g, pair, pv, tithedSet, interactive, counts }));
    // ---- tray ----
    R.patches.forEach((r, j) => drawPatchTile(app, r, j, { inst, interactive, counts }));
    drawInfoPanel(app, R, counts);
    // ---- AFTER panel ----
    drawAfter(app, { strain, pair, pv, inst, g, tithedSet, interactive });
    // ---- buttons ----
    drawButtons(app, { pair, pv, interactive, live });

    if (st.mode === 'attach' && st.anim) drawAttach(app);

    ctx.restore();
    st.fx.draw(ctx); st.fx.drawFlash(ctx, 1280, 720);

    if (st.menu) drawSkipMenu(app);
    // click anywhere skips the attach animation
    if (st.mode === 'attach' && app.mouse.released) finishAnim(app);
  },
};

// ---------------------------------------------------------------- helpers
function getPreview(inst, gid) {
  const key = inst.uid + '|' + gid + '|' + inst.grafts.length + '|' + st.run.deck.length;
  if (st.pvKey !== key) { st.pvKey = key; st.pv = RUN.previewPick(st.run, inst.uid, gid); }
  return st.pv;
}
function setSelection(app, card, graft) {
  const old = st.selCard + '|' + st.selGraft;
  if (card !== undefined) st.selCard = card;
  if (graft !== undefined) st.selGraft = graft;
  if (st.selCard && st.selGraft) {
    const inst = RUN.findInst(st.run, st.selCard);
    if (!canGraft(inst, st.selGraft)) {
      // the one just clicked wins, the other side is dropped
      const msg = cantReason(inst, st.selGraft);
      if (card !== undefined && card !== null) st.selGraft = null; else st.selCard = null;
      st.note = { text: msg + ' Selection cleared on the other side.', age: 0 };
      sfx(app, 'error');
    }
  }
  if (old !== st.selCard + '|' + st.selGraft) { st.morphT = 0; sfx(app, 'cardPlay', { vol: 0.5 }); }
}
function clickCard(app, i) {
  const uid = st.rects.cards[i] && st.rects.cards[i].uid; if (!uid) return;
  setSelection(app, st.selCard === uid ? null : uid, undefined);
}
function clickGraft(app, j) {
  const gid = st.rects.patches[j] && st.rects.patches[j].gid; if (!gid) return;
  setSelection(app, undefined, st.selGraft === gid ? null : gid);
}

function onKey(app, k) {
  if (!k) return;
  const key = k.length === 1 ? k.toLowerCase() : k;
  if (st.mode === 'attach') { if (key === 'Enter' || key === 'Escape' || key === ' ') finishAnim(app); return; }
  if (st.mode !== 'pick') return;
  if (st.menu) {
    if (key === 'Escape') { st.menu = false; sfx(app, 'uiBack'); }
    else if (key >= '1' && key <= '3') toggleSkip(app, SKIP_OPTS[+key - 1]);
    else if (key === 'Enter') confirmSkip(app);
    return;
  }
  if (key >= '1' && key <= '3') clickCard(app, +key - 1);
  else if (GRAFT_KEYS.includes(key)) clickGraft(app, GRAFT_KEYS.indexOf(key));
  else if (key === 'Enter') confirmGraft(app);
  else if (key === 'Escape') { st.menu = true; st.skipPick = []; sfx(app, 'uiClick'); }
}

// ---------------------------------------------------------------- top bar
function drawTopBar(app, strain, interactive) {
  const ctx = app.ctx, run = st.run;
  app.text(`Budget ${strain.weight}/${strain.budget}`, 24, 8, { size: 25, bold: true, color: strain.strain > 0 ? '#ff9aa6' : COL.vellum, shadow: true });
  drawGauge(app, 24, 42, 360, 16, strain.weight, strain.budget, 0, st.t);
  if (app.inRect(24, 6, 372, 58)) app.tooltip('Budget', 'The total graft weight your deck carries for free. Every point over Budget is Strain, and each Strain Tithes one Bare card: it fights at -25% numbers that combat. Strain with no Bare card left to take it becomes Backfire.', { color: COL.lamp });
  const sx = 470;
  app.text(`Strain ${strain.strain}`, sx, 8, { size: 25, bold: true, color: strain.strain > 0 ? COL.bad : COL.good, shadow: true });
  app.text(strain.strain === 0 ? 'Nothing is Tithed' : `${strain.tithed.length} card${strain.tithed.length === 1 ? '' : 's'} Tithed now${strain.backfire ? `, Backfire ${strain.backfire}` : ''}`, sx, 40, { size: 15, ui: true, color: DIM });
  if (app.inRect(sx - 6, 6, 250, 58)) app.tooltip('Strain', 'Weight over Budget. Each point lands a Tithe on the cheapest, oldest Bare card in your deck.', { color: COL.bad });
  // purse + hp
  ICONS.drawCoin(ctx, 770, 30, 26);
  app.text(String(run.gold), 790, 17, { size: 24, bold: true, color: COL.gold, shadow: true });
  ICONS.drawHeart(ctx, 890, 30, 26);
  app.text(`${run.hp}/${run.maxHp}`, 910, 17, { size: 24, bold: true, color: '#ffb3bd', shadow: true });
  if (app.button('Deck', 1130, 14, 126, 42, { size: 20, key: undefined, disabled: !interactive })) { sfx(app, 'uiClick'); app.shared.flow.openDeck(); }
  if (app.inRect(1130, 14, 126, 42)) app.tooltip('Your deck', 'Open the full deck: every card, its grafts and who is Tithed.');
}

// ---------------------------------------------------------------- offered cards
function drawOfferCard(app, r, i, c) {
  const ctx = app.ctx, run = st.run;
  const inst = RUN.findInst(run, r.uid); if (!inst) return;
  const sel = st.selCard === r.uid;
  const deal = EASE.out(clamp((st.dealT - i * 0.1) / 0.5, 0, 1));
  if (deal <= 0) return;
  const hover = c.interactive && deal >= 1 && app.inRect(r.x, r.y, r.w, r.h);
  const target = sel ? -18 : hover ? -9 : 0;
  st.lift[r.uid] = lerp(st.lift[r.uid] || 0, target, Math.min(1, app.dt * 14));
  const cx = r.cx, cy = r.cy + st.lift[r.uid] - (1 - deal) * 420;
  const dim = st.mode === 'pick' && c.g && !canGraft(inst, st.selGraft);
  const tithed = c.tithedSet.has(r.uid) && seamProgress(r.uid) >= 1;
  const pairSel = sel && c.pair;

  ctx.save();
  ctx.globalAlpha = deal;
  if (sel) { ctx.save(); ctx.shadowColor = COL.lamp; ctx.shadowBlur = 36; ctx.fillStyle = rgba(COL.lamp, 0.5); app.rr(cx - CW / 2 + 6, cy - CH / 2 + 6, CW - 12, CH - 12, 14); ctx.fill(); ctx.restore(); }
  else if (hover) { ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 20; ctx.fillStyle = 'rgba(255,255,255,.18)'; app.rr(cx - CW / 2 + 8, cy - CH / 2 + 8, CW - 16, CH - 16, 14); ctx.fill(); ctx.restore(); }

  if (pairSel) {
    // the card morphs into its new self
    const e = EASE.out(st.morphT);
    const after = c.pv.spec, before = cardSpec(inst);
    const pulse = 1 + 0.07 * Math.sin(Math.PI * e);
    if (e < 1) drawCard(ctx, before, cx, cy, { scale: SC * pulse, alpha: (1 - e) * deal });
    drawCard(ctx, after, cx, cy, { scale: SC * pulse, alpha: Math.max(0.001, e) * deal, glow: 1, selected: true, preview: true });
    if (e < 1) { // stitch shimmer sweeping down the card
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * (1 - e);
      const yy = cy - CH / 2 + CH * e; ctx.fillStyle = COL.lamp; ctx.fillRect(cx - CW / 2, yy - 3, CW, 6); ctx.restore();
    }
    // sewn-on patch badge
    const gc = schoolColor(c.g.school);
    ctx.save(); ctx.translate(cx + CW / 2 - 28, cy + CH / 2 - 30); ctx.rotate(0.12);
    ctx.fillStyle = '#2b231e'; ctx.strokeStyle = gc; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); app.rr(-24, -16, 48, 32, 5); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    drawSchoolGlyph(ctx, c.g.school, 0, 0, 9, gc); ctx.restore();
  } else {
    drawCard(ctx, cardSpec(inst), cx, cy, { scale: SC, tithed, selected: sel, hover, dim: dim ? 0.5 : 0 });
  }
  if (dim) { ctx.save(); ctx.fillStyle = 'rgba(12,10,9,.58)'; app.rr(cx - CW / 2, cy - CH / 2, CW, CH, 12); ctx.fill(); ctx.restore(); app.text('Cannot take it', cx, cy - 10, { size: 22, bold: true, align: 'center', color: '#ffb3bd', stroke: '#1a0a0c', strokeW: 5 }); }
  // tithe seam (preview or current)
  const seamP = seamProgress(r.uid);
  if (c.tithedSet.has(r.uid) && seamP < 1) drawSeam(ctx, cx, cy, CW - 10, CH - 14, seamP, st.t);
  // overload crack
  if (pairSel ? c.pv.overload : inst.grafts.length >= 2) {
    if (pairSel) drawCrack(ctx, cx, cy, CW, CH, overloadProgress(), st.t);
    else {
      ctx.save(); ctx.globalAlpha = 0.9 * deal;
      app.rr(cx - 68, cy - CH / 2 - 15, 136, 22, 6); ctx.fillStyle = '#3a2a08'; ctx.fill(); ctx.strokeStyle = COL.lamp; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      app.text('NEXT = OVERLOAD', cx, cy - CH / 2 - 12, { size: 13, ui: true, bold: true, align: 'center', color: COL.lamp });
    }
  }
  ctx.restore();

  // caption row
  const base = CARDS[inst.id];
  const cap = (inst.plays ? `Played ${inst.plays}x` : 'Never played') + '   ' + (inst.grafts.length ? `${inst.grafts.length} graft${inst.grafts.length > 1 ? 's' : ''}` : 'Bare');
  app.text(cap, cx + 12, r.cy + CH / 2 + 12, { size: 14, ui: true, align: 'center', color: DIM, alpha: deal });
  keyBadge(app, String(i + 1), cx - CW / 2 + 12, r.cy + CH / 2 + 22);

  if (hover) {
    const lines = [];
    if (base.flavor) lines.push(base.flavor);
    lines.push(inst.plays ? `Played ${inst.plays} times.` : 'Never played.');
    lines.push(inst.grafts.length ? 'Grafts: ' + inst.grafts.map((x) => (GRAFTS[x] ? GRAFTS[x].name : x)).join(', ') + '.' : 'No grafts: a Bare card can be Tithed.');
    if (tithed) lines.push('This card will be Tithed: -25% numbers that combat.');
    if (inst.grafts.length >= 2) lines.push('A third graft is an OVERLOAD.');
    if (dim) lines.push('CANNOT TAKE THE SELECTED GRAFT: ' + cantReason(inst, st.selGraft));
    app.tooltip(spec2name(inst), null, { lines, color: COL[base.type] ? '#e8dcc4' : COL.lamp });
    if (app.clicked(r.x, r.y, r.w, r.h)) clickCard(app, i);
  }
}
const spec2name = (inst) => CARDS[inst.id].name + (inst.up ? '+' : '');

// ---------------------------------------------------------------- graft tray
function drawPatchTile(app, r, j, c) {
  const ctx = app.ctx;
  const g = GRAFTS[r.gid]; if (!g) return;
  const tier = TIER[g.tier] || TIER.safe;
  const sc = schoolColor(g.school);
  const sel = st.selGraft === r.gid;
  const slide = EASE.out(clamp((st.dealT - 0.25 - j * 0.1) / 0.5, 0, 1));
  if (slide <= 0) return;
  const compact = st.rects.patches.length > 3;
  const dim = st.mode === 'pick' && c.inst && !canGraft(c.inst, r.gid);
  const hover = c.interactive && slide >= 1 && app.inRect(r.x, r.y, r.w, r.h);
  const key = 'p' + r.gid;
  st.lift[key] = lerp(st.lift[key] || 0, sel ? -6 : hover ? -3 : 0, Math.min(1, app.dt * 14));
  const x = r.x + (1 - slide) * 520, y = r.y + st.lift[key], w = r.w, h = r.h;
  const hidden = st.mode === 'attach' && sel && st.anim && st.anim.t < 0.5;
  if (hidden) return;
  ctx.save();
  ctx.globalAlpha = slide * (st.mode === 'attach' && sel ? 0.25 : 1);
  if (sel) { ctx.shadowColor = COL.lamp; ctx.shadowBlur = 26; }
  drawPatchBody(app, g, x, y, w, h, { tier, sc, compact, sel, hover, dim });
  ctx.restore();
  keyBadge(app, GRAFT_KEYS[j].toUpperCase(), x - 14, y + h / 2);

  if (hover) {
    const info = resonanceInfo(st.run, g.school, c.counts);
    const lines = [`${tier.label} graft, weight ${g.weight}.`, 'Boon: ' + g.boon, 'Price: ' + g.price];
    const hp = g.mods.find((m) => m.k === 'maxHp'); if (hp) lines.push(`Permanently costs ${-hp.n} max HP.`);
    if (info) lines.push(...info.lines);
    if (dim) lines.push('CANNOT GO ON THE SELECTED CARD: ' + cantReason(c.inst, r.gid));
    app.tooltip(g.name, null, { lines, color: sc });
    if (app.clicked(x, y, w, h)) clickGraft(app, j);
  }
}

// A patch of dark leather, stitched edge, art swatch on the left, bill on the right.
function drawPatchBody(app, g, x, y, w, h, o) {
  const ctx = app.ctx;
  const { tier, sc, compact, sel, hover, dim } = o;
  ctx.save();
  app.rr(x, y, w, h, 10);
  const grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, sel ? '#3a2e24' : '#2f2620'); grd.addColorStop(1, sel ? '#2a211a' : '#211b17');
  ctx.fillStyle = grd; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = sel ? COL.lamp : hover ? '#fff3c4' : 'rgba(232,220,196,.35)'; ctx.stroke();
  // stitched inner border in school colour
  ctx.setLineDash([6, 5]); ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(sc, 0.85);
  app.rr(x + 5, y + 5, w - 10, h - 10, 7); ctx.stroke(); ctx.setLineDash([]);
  // swatch
  const sw = 64, sx = x + 12, sy = y + 12, sh = h - 24;
  ctx.save(); app.rr(sx, sy, sw, sh, 6); ctx.clip();
  const fg = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
  fg.addColorStop(0, rgba(sc, 0.75)); fg.addColorStop(1, rgba(sc, 0.3));
  ctx.fillStyle = fg; ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = 'rgba(14,12,10,.22)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = -sh; i < sw; i += 6) { ctx.moveTo(sx + i, sy); ctx.lineTo(sx + i + sh * 0.7, sy + sh); }
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 1.5; ctx.strokeStyle = sc; app.rr(sx, sy, sw, sh, 6); ctx.stroke();
  ctx.beginPath(); ctx.arc(sx + sw / 2, sy + sh / 2, 21, 0, 6.283); ctx.fillStyle = 'rgba(20,16,14,.82)'; ctx.fill(); ctx.strokeStyle = sc; ctx.lineWidth = 2; ctx.stroke();
  drawSchoolGlyph(ctx, g.school, sx + sw / 2, sy + sh / 2, 15, sc);
  ctx.restore();

  const tx = x + 88, tw = w - 88 - 12;
  // tier ribbon
  const rw = 74;
  ctx.save();
  ctx.fillStyle = tier.color;
  ctx.beginPath(); ctx.moveTo(x + w - 10 - rw, y + 9); ctx.lineTo(x + w - 10, y + 9); ctx.lineTo(x + w - 10, y + 27); ctx.lineTo(x + w - 10 - rw, y + 27); ctx.lineTo(x + w - 10 - rw + 8, y + 18); ctx.closePath(); ctx.fill();
  ctx.restore();
  app.text(tier.label, x + w - 10 - rw / 2 + 4, y + 11, { size: 13, ui: true, bold: true, align: 'center', color: tier.ink });
  // staples (weight)
  for (let i = 0; i < g.weight; i++) drawStaple(app.ctx, x + w - 22 - (g.weight - i) * 19 + 4, y + 33, 14, '#d8dde0');
  app.text('weight ' + g.weight, x + w - 12 - rw - 4 - (compact ? 0 : 0), y + 11, { size: 12, ui: true, align: 'right', color: DIM });
  // name
  app.text(g.name, tx, y + 7, { size: compact ? 18 : 20, bold: true, color: COL.vellum, shadow: true });
  // boon + price
  const lines = compact ? 1 : 2;
  const boonL = wrapLimit(app, g.boon, tw - 40, 14, lines, { ui: true });
  const priceL = wrapLimit(app, g.price, tw - 40, 14, lines, { ui: true });
  let yy = y + (compact ? 30 : 34);
  app.text('Boon', tx, yy, { size: 13, ui: true, bold: true, color: COL.good });
  boonL.forEach((ln, i) => app.text(ln, tx + 40, yy + i * 16, { size: 14, ui: true, color: COL.vellum }));
  yy += lines * 16 + 3;
  app.text('Price', tx, yy, { size: 13, ui: true, bold: true, color: COL.bad });
  priceL.forEach((ln, i) => app.text(ln, tx + 40, yy + i * 16, { size: 14, ui: true, color: '#ff7a7a' }));
  const hp = g.mods.find((m) => m.k === 'maxHp');
  if (hp) {
    const label = `MAX HP ${hp.n}`;
    const lw = app.measure(label, 13, { ui: true, bold: true }) + 14;
    app.rr(x + w - 12 - lw, y + h - 28, lw, 20, 5); ctx.save(); ctx.fillStyle = '#4a0f18'; ctx.fill(); ctx.strokeStyle = COL.bad; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    app.text(label, x + w - 12 - lw / 2, y + h - 26, { size: 13, ui: true, bold: true, align: 'center', color: '#ffb3bd' });
  }
  if (dim) { ctx.save(); ctx.fillStyle = 'rgba(12,10,9,.62)'; app.rr(x, y, w, h, 10); ctx.fill(); ctx.restore(); app.text('Cannot go on this card', x + w / 2, y + h / 2 - 9, { size: 17, bold: true, align: 'center', color: '#ffb3bd', shadow: true }); }
}

function drawInfoPanel(app, R, counts) {
  const ctx = app.ctx;
  const x = TRAY_X, y = R.infoY, w = TRAY_W, h = R.infoH;
  app.panel(x, y, w, h, { fill: 'rgba(20,16,14,.8)', stroke: 'rgba(232,220,196,.25)', r: 8 });
  const hov = R.patches.find((r) => app.inRect(r.x, r.y, r.w, r.h));
  const gid = hov ? hov.gid : st.selGraft;
  const g = gid && GRAFTS[gid];
  if (!g) { app.text('Hover a graft to read its school and what resonance it wakes.', x + 14, y + 12, { size: 15, ui: true, color: DIM, maxW: w - 28 }); return; }
  const info = resonanceInfo(st.run, g.school, counts);
  drawSchoolGlyph(ctx, g.school, x + 24, y + 24, 12, info.color);
  app.text(`${info.name} ${Math.min(info.n, info.next)}/${info.next} resonance`, x + 46, y + 10, { size: 19, bold: true, color: info.color });
  const after = info.n + 1;
  const wakes = after === 3 || after === 6;
  let yy = y + 36;
  if (wakes) { app.text(`Sewing this wakes the ${after}-graft bonus.`, x + 14, yy, { size: 14, ui: true, bold: true, color: COL.lamp }); yy += 18; }
  const bonus = info.n >= 6 ? SCHOOLS[g.school].resonance[6] : SCHOOLS[g.school].resonance[info.n >= 3 ? 6 : 3];
  const lines = wrapLimit(app, `${info.n >= 6 ? 'Active at 6' : info.n >= 3 ? 'Next at 6' : 'At 3'}: ${bonus}`, w - 28, 14, Math.max(1, Math.floor((y + h - yy - 4) / 17)), { ui: true });
  lines.forEach((ln, i) => app.text(ln, x + 14, yy + i * 17, { size: 14, ui: true, color: COL.vellum }));
}

// ---------------------------------------------------------------- AFTER panel
function drawAfter(app, c) {
  const ctx = app.ctx, run = st.run;
  const { x, y, w, h } = AFTER;
  const { pair, pv, strain } = c;
  app.panel(x, y, w, h, { fill: 'rgba(18,15,13,.9)', stroke: pair ? 'rgba(242,193,78,.7)' : 'rgba(232,220,196,.3)', lw: pair ? 2.5 : 2 });
  const A = pair ? pv.after : strain, B = pair ? pv.before : strain;
  app.text(pair ? 'AFTER' : 'THE TABLE', x + 16, y + 8, { size: 28, bold: true, color: pair ? COL.lamp : COL.vellum, shadow: true });
  const sub = st.note ? st.note.text : pair ? `${c.g.name} on ${spec2name(c.inst)}. Nothing is sewn until you press Sew it on.` : 'Choose one of your cards and one graft. This panel shows the whole bill first.';
  app.text(sub, x + (pair ? 134 : 196), y + 15, { size: 14, ui: true, color: st.note ? '#ff9aa6' : DIM, maxW: w - (pair ? 150 : 212) });

  // rows
  const lx = x + 16;
  const rowBudget = y + 46, rowStrain = y + 82, rowTithe = y + 114;
  app.text('BUDGET', lx, rowBudget + 5, { size: 14, ui: true, bold: true, color: DIM });
  const wTxt = pair ? `${B.weight}/${B.budget}  →  ${A.weight}/${A.budget}` : `${A.weight}/${A.budget}`;
  app.text(wTxt, lx + 80, rowBudget, { size: 24, bold: true, color: A.weight > A.budget ? '#ff9aa6' : COL.vellum });
  const addW = pair ? A.weight - B.weight : 0;
  drawGauge(app, lx + 262, rowBudget + 2, w - 262 - 32, 22, B.weight, A.budget, addW, st.t);
  if (app.inRect(lx, rowBudget - 4, w - 32, 36)) app.tooltip('Budget', pair ? `Weight ${B.weight} → ${A.weight} against a Budget of ${A.budget}. The pulsing cells are what this graft adds${A.weight > A.budget ? '; red cells are Strain' : ''}.` : 'Filled cells are graft weight in your deck, the gold line is your Budget. Red cells are Strain.', { color: COL.lamp });

  app.text('STRAIN', lx, rowStrain + 5, { size: 14, ui: true, bold: true, color: DIM });
  const sCol = A.strain > B.strain ? COL.bad : A.strain > 0 ? '#ffb36b' : COL.good;
  app.text(pair ? `${B.strain}  →  ${A.strain}` : `${A.strain}`, lx + 80, rowStrain, { size: 24, bold: true, color: sCol });
  let verdict = A.strain === 0 ? 'Within Budget. Nobody pays.' : `${A.tithed.length} Tithe${A.tithed.length === 1 ? '' : 's'} land${A.tithed.length === 1 ? 's' : ''} on Bare cards.`;
  app.text(verdict, lx + 262, rowStrain + 4, { size: 16, ui: true, color: A.strain ? '#ffb3b3' : COL.good });
  // max hp
  let hpMod = null;
  if (pair) { const m = c.g.mods.find((k) => k.k === 'maxHp'); if (m && !(c.inst.waived && c.inst.waived.includes(c.g.id))) hpMod = m; }
  if (hpMod) {
    const after = Math.max(10, run.maxHp + hpMod.n);
    app.text(`MAX HP ${run.maxHp} → ${after}`, x + w - 16, rowStrain + 1, { size: 20, bold: true, align: 'right', color: COL.bad, shadow: true });
  }

  // tithe strip
  app.text('TITHED', lx, rowTithe + 7, { size: 14, ui: true, bold: true, color: COL.bad });
  const names = (u) => { const i = RUN.findInst(run, u); return i ? CARDS[i.id].name : '?'; };
  const tithedUids = pair ? A.tithed : strain.tithed;
  let cx = lx + 80, cy = rowTithe;
  const chipH = 28, maxX = x + w - 16;
  let rows = 1, shown = 0;
  const anim = st.mode === 'attach' && st.anim ? st.anim : null;
  if (!tithedUids.length) {
    app.text(A.backfire ? 'No Bare card left to take it.' : 'Nobody. The deck absorbs it.', cx, rowTithe + 5, { size: 16, ui: true, color: A.backfire ? COL.bad : COL.good });
  }
  for (const u of tithedUids) {
    const label = names(u);
    const cw = app.measure(label, 14, { ui: true, bold: true }) + 26;
    if (cx + cw > maxX) { if (rows >= 2) break; rows++; cx = lx + 80; cy += chipH + 6; }
    const isNew = pair && !pv.before.tithed.includes(u);
    const hov = app.inRect(cx, cy, cw, chipH);
    ctx.save();
    ctx.globalAlpha = isNew || !pair ? 1 : 0.65;
    app.rr(cx, cy, cw, chipH, 6); ctx.fillStyle = '#2a1114'; ctx.fill(); ctx.strokeStyle = isNew ? '#ff4d63' : 'rgba(179,38,58,.7)'; ctx.lineWidth = isNew ? 2 : 1.5; ctx.stroke();
    ctx.restore();
    const p = anim ? seamProgress(u) : 1;
    ctx.save(); ctx.globalAlpha = 0.75; drawSeam(ctx, cx + cw / 2, cy + chipH / 2, cw - 6, chipH - 8, p, st.t); ctx.restore();
    app.text(label, cx + cw / 2, cy + 6, { size: 14, ui: true, bold: true, align: 'center', color: COL.vellum, stroke: '#1a0a0c', strokeW: 4 });
    if (hov) app.tooltip(label, (isNew ? 'Newly Tithed by this graft. ' : 'Already Tithed. ') + 'Fights at -25% numbers that combat.', { color: COL.bad });
    cx += cw + 8; shown++;
  }
  if (shown < tithedUids.length) app.text(`+${tithedUids.length - shown} more`, cx, cy + 6, { size: 14, ui: true, bold: true, color: COL.bad });
  let wy = rowTithe + rows * (chipH + 6) + 2;

  // warnings
  const warns = [];
  if (pair && pv.overload) {
    const pct = Math.round(shatterChance(run) * 100);
    warns.push({ gold: true, head: 'OVERLOAD', text: `numbers x1.5, ${pct} percent to SHATTER on first play each combat, weighs +1 extra.` });
  }
  if (A.backfire > 0 && (pair ? A.backfire >= B.backfire : true)) {
    warns.push({ head: 'BACKFIRE', text: `${A.backfire} grafted card${A.backfire > 1 ? 's' : ''} in your opening hand jam each turn (+1 cost). ${A.overflow} Strain has no Bare card to Tithe.` });
  }
  for (const wn of warns) {
    if (wy + 34 > y + h - 4) break;
    const bh = 36;
    ctx.save();
    app.rr(lx, wy, w - 32, bh, 7);
    ctx.fillStyle = wn.gold ? 'rgba(80,58,10,.85)' : 'rgba(80,12,22,.85)'; ctx.fill();
    ctx.strokeStyle = wn.gold ? COL.lamp : COL.bad; ctx.lineWidth = 2; if (wn.gold) ctx.setLineDash([9, 3, 2, 3]); ctx.stroke();
    ctx.restore();
    const hw = app.measure(wn.head + ':', 16, { ui: true, bold: true });
    app.text(wn.head + ':', lx + 12, wy + 8, { size: 16, ui: true, bold: true, color: wn.gold ? COL.lamp : '#ff8f9c' });
    app.text(wn.text, lx + 12 + hw + 6, wy + 9, { size: 14.5, ui: true, color: COL.vellum, maxW: w - 32 - hw - 36 });
    wy += bh + 5;
  }
  if (!pair && !warns.length) app.text('Keys: 1 2 3 pick a card, Q W E pick a graft, Enter sews, Esc declines.', lx, y + h - 24, { size: 14, ui: true, color: 'rgba(232,220,196,.45)' });
}

// ---------------------------------------------------------------- buttons
function drawButtons(app, c) {
  const run = st.run;
  const { pair, pv, interactive } = c;
  const rerollFree = RUN.perk(run, 'rerollFree');
  const cost = RUN.rerollCost(run);
  const locked = run.ascension >= 8;
  const poor = !rerollFree && run.gold < cost;
  const can = interactive && !locked && !poor;
  const sub = locked ? 'Locked (Ascension 8)' : rerollFree ? 'Free' : `${cost} gold`;
  if (app.button('Reroll offer', TRAY_X, 556, 208, 46, { size: 19, sub, disabled: !can, subColor: poor && !locked ? '#ff9aa6' : undefined }) && can) {
    if (RUN.rerollGraftOffer(run)) {
      st.offer = run.pending.offer; st.rects = layout(st.offer); st.selCard = null; st.selGraft = null; st.dealT = 0; st.morphT = 1; st.pvKey = '';
      sfx(app, 'shuffle'); if (!rerollFree) sfx(app, 'coin', { vol: 0.5 });
    } else sfx(app, 'error');
  }
  if (app.inRect(TRAY_X, 556, 208, 46)) app.tooltip('Reroll', locked ? 'Rerolling is closed at Ascension 8 and above.' : poor ? `You need ${cost} gold. Each reroll costs 10 more.` : 'Deal a fresh set of cards and grafts. Each reroll costs 10 more gold.');
  if (app.button('Decline the graft', TRAY_X + 222, 556, 208, 46, { size: 19, sub: 'Heal, Budget or gold instead', disabled: !interactive }) ) { st.menu = true; st.skipPick = []; sfx(app, 'uiClick'); }
  if (app.inRect(TRAY_X + 222, 556, 208, 46)) app.tooltip('Decline the graft', `Sew nothing and take ${skipLimit(run) > 1 ? 'two' : 'one'} of: heal 8 HP, +1 Budget for the rest of the run, or +10 gold. Esc.`);

  const lab = st.mode === 'attach' ? 'Sewing...' : 'Sew it on';
  let subT = 'Choose a card and a graft';
  if (pair) {
    subT = `Budget ${pv.before.weight}/${pv.before.budget} → ${pv.after.weight}/${pv.after.budget}`;
    const nt = pv.after.tithed.filter((u) => !pv.before.tithed.includes(u)).length;
    if (nt) subT += `, ${nt} more Tithed`;
  } else if (st.selCard || st.selGraft) subT = st.selCard ? 'Now choose a graft' : 'Now choose a card';
  const ok = pair && interactive;
  if (app.button(lab, TRAY_X, 612, TRAY_W, 76, { size: 28, sub: subT, disabled: !ok, fill: ok ? '#5a3f10' : undefined, color: ok ? '#ffe9a8' : undefined })) confirmGraft(app);
  if (ok && app.inRect(TRAY_X, 612, TRAY_W, 76)) app.tooltip('Sew it on', 'Permanent. The graft stays on this card for the rest of the run unless you strip it at a Forge.', { color: COL.lamp });
}

// ---------------------------------------------------------------- skip menu
function skipOptionInfo(run, id) {
  if (id === 'heal') { const n = Math.min(RUN.SKIP_HEAL, run.maxHp - run.hp); return { name: 'Heal 8 HP', line: n > 0 ? `HP ${run.hp} → ${run.hp + n}` : 'Already at full HP', col: COL.good, tip: 'Restore up to 8 HP now.' }; }
  if (id === 'budget') { const b = RUN.budgetOf(run); return { name: '+1 Budget', line: `Budget ${b} → ${b + 1}`, col: COL.lamp, tip: 'Permanent for the run. More room for weight before Strain.' }; }
  return { name: '+10 gold', line: `Gold ${run.gold} → ${run.gold + 10}`, col: COL.gold, tip: 'Ten gold for the shop.' };
}
function toggleSkip(app, id) {
  const lim = skipLimit(st.run), i = st.skipPick.indexOf(id);
  if (i >= 0) st.skipPick.splice(i, 1);
  else { st.skipPick.push(id); if (st.skipPick.length > lim) st.skipPick.shift(); }
  sfx(app, 'uiClick');
}
function confirmSkip(app) {
  if (!st.skipPick.length || st.mode !== 'pick') { sfx(app, 'error'); return; }
  const run = st.run, picks = st.skipPick.slice();
  RUN.skipGraft(run, picks.length === 1 ? picks[0] : picks);
  for (const p of picks) sfx(app, p === 'heal' ? 'heal' : p === 'gold' ? 'coin' : 'upgrade');
  st.menu = false; st.mode = 'leaving';
  st.fx.burst(640, 360, picks.includes('gold') ? 'coin' : picks.includes('heal') ? 'heal' : 'gild', { n: 24 });
  app.after(450, () => { RUN.afterGraft(run); app.shared.flow.route(); });
}
function drawSkipMenu(app) {
  const ctx = app.ctx, run = st.run;
  ctx.save(); ctx.fillStyle = 'rgba(6,5,4,.78)'; ctx.fillRect(0, 0, 1280, 720); ctx.restore();
  const px = 190, py = 120, pw = 900, ph = 470;
  app.panel(px, py, pw, ph, { fill: 'rgba(24,20,17,.97)', stroke: COL.lamp, lw: 2.5, r: 14 });
  app.text('Decline the graft', 640, py + 18, { size: 34, bold: true, align: 'center', color: COL.lamp, shadow: true });
  const lim = skipLimit(run);
  app.text(lim > 1 ? 'Sew nothing. Your relic lets you take TWO of these.' : 'Sew nothing. Take ONE of these instead.', 640, py + 62, { size: 17, ui: true, align: 'center', color: DIM });
  SKIP_OPTS.forEach((id, i) => {
    const info = skipOptionInfo(run, id);
    const w = 260, h = 230, x = px + 30 + i * (w + 25), y = py + 100;
    const sel = st.skipPick.includes(id);
    const hov = app.inRect(x, y, w, h);
    ctx.save();
    if (sel) { ctx.shadowColor = info.col; ctx.shadowBlur = 24; }
    app.rr(x, y + (hov ? -3 : 0), w, h, 12); ctx.fillStyle = sel ? '#3a2e24' : '#2a221d'; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = sel ? info.col : hov ? '#fff3c4' : 'rgba(232,220,196,.4)'; ctx.stroke();
    ctx.restore();
    const cy = y + 62 + (hov ? -3 : 0);
    if (id === 'heal') ICONS.drawHeart(ctx, x + w / 2, cy, 54);
    else if (id === 'gold') ICONS.drawCoin(ctx, x + w / 2, cy, 54);
    else { ctx.save(); ctx.strokeStyle = COL.lamp; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + w / 2 - 22, cy); ctx.lineTo(x + w / 2 + 22, cy); ctx.moveTo(x + w / 2, cy - 22); ctx.lineTo(x + w / 2, cy + 22); ctx.stroke(); ctx.restore(); }
    app.text(info.name, x + w / 2, y + 108, { size: 26, bold: true, align: 'center', color: info.col, shadow: true });
    app.text(info.line, x + w / 2, y + 148, { size: 17, ui: true, align: 'center', color: COL.vellum });
    app.text(info.tip, x + w / 2, y + 176, { size: 14, ui: true, align: 'center', color: DIM, maxW: w - 30 });
    keyBadge(app, String(i + 1), x + 20, y + 20);
    if (sel) app.text('CHOSEN', x + w / 2, y + h - 26, { size: 14, ui: true, bold: true, align: 'center', color: info.col });
    if (app.clicked(x, y, w, h)) toggleSkip(app, id);
  });
  const ok = st.skipPick.length > 0;
  if (app.button('Back to the table', px + 30, py + ph - 76, 250, 52, { size: 20 })) { st.menu = false; sfx(app, 'uiBack'); }
  if (app.button('Decline the graft', px + pw - 30 - 340, py + ph - 76, 340, 52, { size: 24, disabled: !ok, fill: ok ? '#5a3f10' : undefined, color: ok ? '#ffe9a8' : undefined })) confirmSkip(app);
  app.text(ok ? 'Enter confirms. Esc goes back.' : 'Pick an option (1 2 3).', px + pw / 2 - 30, py + ph - 62, { size: 14, ui: true, align: 'center', color: DIM });
}

// ---------------------------------------------------------------- confirm + attach animation
function confirmGraft(app) {
  if (st.mode !== 'pick' || st.menu) return;
  const run = st.run;
  const inst = st.selCard && RUN.findInst(run, st.selCard);
  if (!inst || !st.selGraft || !canGraft(inst, st.selGraft)) { sfx(app, 'error'); return; }
  const pv = getPreview(inst, st.selGraft);
  const ci = st.offer.cards.indexOf(inst.uid), gi = st.offer.grafts.indexOf(st.selGraft);
  const cardR = st.rects.cards[ci], patchR = st.rects.patches[gi];
  const gid = st.selGraft, uid = inst.uid;
  const res = RUN.applyGraft(run, uid, gid);
  if (!res.ok) { sfx(app, 'error'); return; }
  const newTithed = pv.after.tithed.filter((u) => !pv.before.tithed.includes(u));
  const speed = st.reduce ? 2 : 1;
  const over = !!res.overload;
  st.snap = { pv, uid, gid, cardR, patchR, newTithed, overload: over, g: GRAFTS[gid] };
  st.anim = { t: 0, speed, over, f: {}, end: (over ? 1.9 : newTithed.length ? 2.05 : 1.45) / speed };
  st.mode = 'attach';
  st.dealT = 99;
  sfx(app, 'uiClick');
}

const T_FLY = 0.5, T_STITCH = 0.5, T_CLUNK = 0.89, T_TITHE = 1.15, T_SLAM = 1.05;

function advanceAnim(app, d) {
  const a = st.anim; if (!a || a.done) return;
  const k = a.speed;
  a.t += d * k;
  const s = st.snap, f = a.f, fx = st.fx;
  const cx = s.cardR.cx, cy = s.cardR.cy - 18;
  const col = schoolColor(s.g.school);
  const T = (v) => v / k;
  if (a.t >= T_STITCH / k && !f.stitch) { f.stitch = 1; sfx(app, 'graftAttach'); if (a.over) sfx(app, 'overload'); }
  if (a.t >= T(T_CLUNK) && !f.clunk) {
    f.clunk = 1;
    fx.hitstop(40);
    fx.emit({ x: cx + 36, y: cy + 92, n: 30, colors: [col, '#ffffff', COL.lamp], speed: 340, life: 0.8, size: 4.5, glow: true, gravity: 380 });
    fx.ring(cx + 36, cy + 92, col, 150, 0.5);
    if (!st.reduce) fx.shake(0.3);
  }
  if (a.t >= T(T_TITHE) && s.newTithed.length) {
    s.newTithed.forEach((u, i) => {
      if (!f['t' + u] && a.t >= T(T_TITHE) + i * 0.14) {
        f['t' + u] = 1; sfx(app, 'graftScar', { vol: i ? 0.6 : 1 });
        const rc = st.rects.cards.find((r) => r.uid === u);
        if (rc) { fx.burst(rc.cx, rc.cy, 'blood', { n: 8 }); fx.float('TITHED', rc.cx, rc.cy - 40, { color: '#ff7a7a', size: 34, big: true }); }
        if (!st.reduce) fx.shake(0.35);
      }
    });
  }
  if (a.over && a.t >= T(T_SLAM) && !f.slam) {
    f.slam = 1; fx.burst(cx, cy, 'shard', { n: 22, speed: 480 }); fx.flash(COL.lamp, 0.35, 0.3);
    if (!st.reduce) { fx.shake(0.8); fx.slowmo(0.4, 500); }
  }
  if (a.t >= a.end) finishAnim(app);
}
function finishAnim(app) {
  const a = st.anim; if (!a || a.done || st.done) return;
  a.done = true; st.done = true;
  const run = st.run;
  RUN.afterGraft(run);
  app.shared.flow.route();
}

function seamProgress(uid) {
  if (st.mode !== 'attach' || !st.anim) return 1;
  const s = st.snap, a = st.anim;
  const i = s.newTithed.indexOf(uid);
  if (i < 0) return 1;
  return clamp((a.t - (T_TITHE / a.speed + i * 0.14)) / (0.45 / a.speed), 0, 1);
}
function overloadProgress() {
  if (st.mode !== 'attach' || !st.anim) return 0.55;
  return clamp((st.anim.t - T_SLAM / st.anim.speed) / (0.35 / st.anim.speed), 0, 1);
}

// patch flying onto the card, needle zigzag, staple
function drawAttach(app) {
  const ctx = app.ctx, a = st.anim, s = st.snap;
  if (!a || !s) return;
  const k = a.speed;
  const t = a.t * k;
  const col = schoolColor(s.g.school);
  const tier = TIER[s.g.tier] || TIER.safe;
  const cx = s.cardR.cx, cy = s.cardR.cy - 18;
  const tx = cx + 36, ty = cy + 92, tw = 150, th = 100;
  const fly = EASE.inOut(clamp(t / T_FLY, 0, 1));
  const sx = s.patchR.x + s.patchR.w / 2, sy = s.patchR.y + s.patchR.h / 2;
  const px = lerp(sx, tx, fly), py = lerp(sy, ty, fly) - Math.sin(Math.PI * fly) * 90;
  const w = lerp(300, tw, fly), h = lerp(s.patchR.h + 30, th, fly);
  ctx.save();
  ctx.translate(px, py); ctx.rotate(0.14 * fly * (1 - 0.0));
  ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 18 * (1 - fly) + 4;
  if (fly < 1) {
    drawGraftPatch(ctx, s.g, -w / 2, -h / 2, w, h, { hover: true });
  } else {
    drawGraftPatch(ctx, s.g, -tw / 2, -th / 2, tw, th, {});
    // needle + thread zigzag, six stitches
    const sp = clamp((t - T_STITCH) / (T_CLUNK - T_STITCH), 0, 1);
    const n = 6, cnt = sp * n;
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([-tw / 2 - 4 + ((tw + 8) / n) * i, (i % 2 ? 1 : -1) * (th / 2 + 7)]);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    let tip = pts[0];
    for (let i = 1; i <= n; i++) {
      if (cnt >= i) { ctx.lineTo(pts[i][0], pts[i][1]); tip = pts[i]; }
      else { const f = clamp(cnt - (i - 1), 0, 1); tip = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; if (f > 0) ctx.lineTo(tip[0], tip[1]); break; }
    }
    ctx.stroke();
    if (sp > 0 && sp < 1) {
      ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(-0.9 + (Math.floor(cnt) % 2 ? 1.8 : 0));
      ctx.strokeStyle = '#e8eef0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 4); ctx.stroke();
      ctx.strokeStyle = '#8a9499'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -27, 2.5, 0, 6.283); ctx.stroke();
      ctx.restore();
    }
    // staple clunk
    if (t >= T_CLUNK) {
      const since = t - T_CLUNK, drop = EASE.out(clamp(since / 0.08, 0, 1));
      drawStaple(ctx, -tw / 2 + 6 + (1 - drop) * 0, -th / 2 - 12 + (1 - drop) * -10, tw - 12, '#e6edf0');
    }
  }
  ctx.restore();
}
