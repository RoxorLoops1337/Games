// SPOILS: what the fight left on the table. Gold, a potion, an elite relic or a boss relic choice, then on to the graft table.
// Everything is claimed through engine/run.js; whatever is not claimed is forfeited on Continue.
import { newRibbon } from './archive_kit.js';
import { COL, EASE, clamp, lerp, rgba } from './core.js';
import { Fx } from './fx.js';
import * as RUN from '../engine/run.js';
import { RELICS, POTIONS } from '../data/index.js';
import { drawBackground } from '../art/backgrounds.js';
import * as ICONS from '../art/icons.js';
import { wrapLimit, keyBadge, tscale } from './graft_parts.js';
import { maybeTip } from './tutorial.js';
import { lnw } from '../art/linework.js';
import { buildPickRow, goldNote } from './ward_kit.js';
import { BUILD_CARDS } from '../data/ward.js';

const ACT_THEME = { 1: 'ward', 2: 'market', 3: 'theatre' };
const RARITY = {
  start: { name: 'Starter', color: '#bfb59c' }, common: { name: 'Common', color: '#e8dcc4' }, uncommon: { name: 'Uncommon', color: '#7fcf8a' },
  rare: { name: 'Rare', color: '#F2C14E' }, boss: { name: 'Boss', color: '#c58bff' }, shop: { name: 'Shop', color: '#7fd1e0' },
};
const KIND = { normal: 'Fight won', elite: 'Elite felled', boss: 'Boss felled' };
const DIM = 'rgba(232,220,196,.6)';
const PX = 290, PW = 700;

let st = null;
const sfx = (app, name, o) => { const a = app.shared && app.shared.audio; if (a && a.sfx) { try { a.sfx(name, o); } catch (e) { /* audio optional */ } } };

export default {
  enter(app, params) {
    const run = (params && params.run) || app.shared.run;
    const rw = run.pending && run.pending.kind !== undefined ? run.pending : (run.pending = { kind: 'normal', gold: 0, graft: true });
    st = {
      run, rw, t: 0, fx: new Fx(), taken: {}, done: false,
      buildInit: Array.isArray(rw.buildChoice) && rw.buildChoice.length ? rw.buildChoice.slice() : null, // Ward mode: pick 1 of 3 building plans
      init: { gold: rw.gold || 0, potion: rw.potion || null, relic: rw.relic || null, choices: rw.relicChoices ? rw.relicChoices.slice() : null },
    };
    this.st = st;
  },
  leave() { st = null; },

  update(app, dt) {
    if (!st) return;
    st.fx.update(dt); st.t += dt;
    if (app.top && app.top() !== this) return;
    for (const e of app.pressedKeys) onKey(app, e.key);
  },
  key() { return false; },

  draw(app) {
    if (!st) return;
    const ctx = app.ctx, run = st.run, rw = st.rw;
    const S = tscale(app), K = (size, cap = 1.25) => ({ size: Math.round(size * Math.min(S, cap)), fixed: true });
    drawBackground(ctx, ACT_THEME[run.act] || 'ward', st.t);
    ctx.save(); ctx.fillStyle = 'rgba(8,6,5,.4)'; ctx.fillRect(0, 0, 1280, 720); ctx.restore();

    // purse: top left, so the top right stays free for the global Pause / Fullscreen buttons
    const ph = Math.round(26 * Math.min(S, 1.25) * 1.22);
    app.reg('reward-purse', 24, 14, 250, 8 + ph * 2, { group: 'purse' });
    ICONS.drawCoin(ctx, 44, 14 + 8 + ph / 2, 28);
    app.text(String(run.gold), 68, 22, { ...K(26), bold: true, color: COL.gold, shadow: true, maxW: 190 });
    ICONS.drawHeart(ctx, 44, 14 + 8 + ph + ph / 2, 28);
    app.text(`${run.hp}/${run.maxHp}`, 68, 22 + ph, { ...K(26), bold: true, color: '#ffb3bd', shadow: true, maxW: 190 });

    const kind = rw.kind === 'elite' || rw.kind === 'boss' ? rw.kind : 'normal';
    let sub = `${KIND[kind]}. Take what you can carry.`;
    if (rw.ward) { // Ward mode: what the rooms gave (wood and stone are already in the store)
      const wd = rw.ward, got = [wd.wood ? `+${wd.wood} wood` : '', wd.stone ? `+${wd.stone} stone` : ''].filter(Boolean).join(', ');
      sub = `${KIND[kind]}${wd.count > 1 ? ` (${wd.count} monsters)` : ''}.` + (got ? ` Salvage: ${got}.` : '') + (goldNote(wd, run.ward && run.ward.phase, kind) ? ' ' + goldNote(wd, run.ward && run.ward.phase, kind) : '');
      if (rw.wardBonus) sub += ` Early: +${rw.wardBonus.gold} gold, ${BUILD_CARDS[rw.wardBonus.card] ? BUILD_CARDS[rw.wardBonus.card].name : 'a plan'}.`;
    }
    const th = app.text('Spoils', 640, 16, { size: app.scale < 0.95 && st.init.choices ? 40 : 52, bold: true, align: 'center', color: COL.lamp, shadow: true, fixed: true });
    const sh = app.text(sub, 640, 16 + th + 2, { ...K(19), italic: true, align: 'center', color: DIM, maxW: 560 });
    app.reg('reward-head', 340, 14, 600, th + sh + 6, { group: 'head' });

    const rows = buildRows(app);
    const compact = !!st.init.choices;
    let y = 16 + th + sh + 12;
    // No relic choice: the short list would hang in the top third of the screen, so centre it between the header and the notes.
    if (!compact) { const est = rows.reduce((a, r) => a + (r.id === 'relic' ? 96 : 80) + 12, 0) + (st.buildInit ? 162 : 0); y += Math.round(clamp((560 - y - est) / 2 - 10, 0, 120)); }
    rows.forEach((r, i) => { y = drawRow(app, r, i, y, compact, K); });
    if (st.buildInit) y += buildPickRow(app, run, rw, PX, y, PW, compact ? 112 : 150, st) + (compact ? 6 : 12); // Ward mode: building plan pick

    // forfeit notes (footer zone above the button)
    const notes = [];
    if (rw.gold > 0) notes.push(`${rw.gold} gold is still on the table. It will be left behind.`);
    if (rw.potion) notes.push('The potion will be left behind.');
    if (rw.relic) notes.push('The relic will be left behind.');
    if (rw.relicChoices && rw.relicChoices.length) notes.push('Choose a relic, or leave them all.');
    if (st.buildInit && st.build === undefined) notes.push('The building plans will be left behind.');
    // a full boss reward (rows, plans and the relic cards) has no room for a stack of notes: one line says it all
    if (st.init.choices && notes.length > 1) notes.splice(0, notes.length, notes.length > 2 || rw.relicChoices ? 'Whatever you leave is left behind.' : notes[0]);
    const nl = Math.max(Math.round(15 * Math.min(S, 1.25) * 1.22), Math.ceil(app.sz(Math.round(15 * Math.min(S, 1.25)), { ui: true, fixed: true }) * 1.2)), shown = notes.slice(0, S > 1.2 ? 1 : 2);
    if (shown.length) app.reg('reward-notes', 340, 640 - 8 - shown.length * nl, 600, shown.length * nl, { group: 'notes' });
    shown.forEach((n, i) => app.text(n, 640, 640 - 8 - (shown.length - i) * nl, { ...K(15), ui: true, align: 'center', color: '#ffb36b', fit: { w: 590, h: nl }, lineH: nl }));

    // boss relic choice: the cards take the room between the rows and the notes
    if (st.init.choices) drawChoices(app, y + 2, K, 640 - 8 - shown.length * nl - 6);

    const toGraft = rw.graft && RUN.graftableCards(run).length > 0;
    const label = toGraft ? 'Continue to the graft table' : 'Continue to the map';
    app.reg('reward-continue', 360, 646, 560, 60, { group: 'continue' });
    if (app.button(label, 360, 646, 560, 60, { size: Math.round(24 * Math.min(S, 1.25) / S), fill: '#5a3f10', color: '#ffe9a8', fit: true })) doContinue(app);
    if (app.inRect(360, 646, 560, 60)) app.tooltip(label, toGraft ? 'Next you pick one of your cards and one graft. Or decline for a small prize.' : 'Back to the map.', { color: COL.lamp });

    if (!st) return;
    st.fx.draw(ctx); st.fx.drawFlash(ctx, 1280, 720);
    maybeTip(app, 'rewardspoils', 288, 230, 'Click a reward to claim it. Anything you leave is forfeited when you continue. Then you graft one of your own cards.', { pos: { x: 12, y: 330 }, w: 206 });
  },
};

function buildRows() {
  const rows = [], rw = st.rw, init = st.init;
  if (init.gold > 0) rows.push({ id: 'gold', taken: rw.gold === 0 });
  if (init.potion) rows.push({ id: 'potion', taken: !rw.potion });
  if (init.relic) rows.push({ id: 'relic', taken: !rw.relic });
  return rows;
}

function rowInfo(r) {
  const init = st.init, run = st.run;
  if (r.id === 'gold') return { title: `${init.gold} gold`, line: 'Coins left on the table.', col: COL.gold, tip: null, head: 'Gold' };
  if (r.id === 'potion') {
    const p = POTIONS[init.potion]; const r2 = RARITY[p.rarity] || RARITY.common;
    return { title: p.name, line: p.text, col: r2.color, head: 'Potion', tip: ['Used from the combat screen: pick it from your potion slots. It is spent when drunk.'], icon: (c, x, y, s) => ICONS.drawPotion(c, init.potion, x, y, s) };
  }
  const rl = RELICS[init.relic]; const r2 = RARITY[rl.rarity] || RARITY.common;
  return { title: rl.name, line: rl.text, col: r2.color, head: r2.name + ' relic', tip: ['Kept for the rest of the run. Its effect is always on.'], icon: (c, x, y, s) => ICONS.drawRelic(c, init.relic, x, y, s) };
}

function drawRow(app, r, i, y, compact, K) {
  const ctx = app.ctx, run = st.run, rw = st.rw;
  const info = rowInfo(r);
  const S = tscale(app), k = Math.min(S, 1.25);
  const tx = 84, tw = PW - tx - 160;
  const maxLines = compact ? 1 : r.id === 'relic' ? 3 : 2;
  // every label is laid out first (fitted to its box), so the row height follows the sizes the phone really draws
  const hO = { ...K(13), ui: true, bold: true, fit: { w: tw, lines: 1 } }, tO = { ...K(26), bold: true, fit: { w: tw, lines: 1 } };
  const dO = { ...K(15), ui: true, fit: { w: tw, lines: maxLines } };
  const hL = app.layoutText(info.head.toUpperCase(), hO), tL = app.layoutText(info.title, tO), dL = app.layoutText(info.line, dO);
  const lh = dL.lineH, headH = Math.max(Math.round(13 * k * 1.22), Math.ceil(hL.size * 1.2)), titleH = Math.max(Math.round(26 * k * 1.22), Math.ceil(tL.size * 1.2));
  const h = Math.max(compact ? 60 : r.id === 'relic' ? 96 : 80, 12 + headH + titleH + dL.lines.length * lh + 10);
  const slide = EASE.out(clamp((st.t - 0.15 - i * 0.12) / 0.45, 0, 1));
  const x = PX + (1 - slide) * 60;
  const full = r.id === 'potion' && !r.taken && run.potions.length >= RUN.potionSlots(run);
  const can = !r.taken && !full;
  const hover = can && !app.blocked && app.inRect(x, y, PW, h);
  app.reg('reward-row' + i, x, y, PW, h, { group: 'row' + i });
  ctx.save();
  ctx.globalAlpha = slide;
  if (hover) { ctx.shadowColor = info.col; ctx.shadowBlur = 22; }
  app.rr(x, y + (hover ? -2 : 0), PW, h, 12);
  ctx.fillStyle = r.taken ? 'rgba(30,26,22,.7)' : hover ? '#3a2e24' : '#2b231e'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = lnw(hover ? 3 : 2); ctx.strokeStyle = r.taken ? 'rgba(232,220,196,.15)' : hover ? COL.lamp : 'rgba(232,220,196,.4)'; ctx.stroke();
  if (!r.taken) app.panel(x, y + (hover ? -2 : 0), PW, h, { fill: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', r: 12, lw: 2 }); // engraved hatch, inset shadow, rivets (cached)
  ctx.setLineDash([6, 5]); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = r.taken ? 'rgba(232,220,196,.1)' : rgba(info.col, 0.6); app.rr(x + 5, y + 5 + (hover ? -2 : 0), PW - 10, h - 10, 8); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  const yy = y + (hover ? -2 : 0);
  ctx.save(); ctx.globalAlpha = slide * (r.taken ? 0.4 : 1);
  const cy = yy + h / 2;
  ICONS.drawRewardIcon(ctx, r.id, x + 46, cy, 56, { id: r.id === 'relic' ? st.init.relic : st.init.potion, spot: r.id === 'gold' ? undefined : info.col });
  ctx.restore();
  if (!r.taken && r.id !== 'gold') newRibbon(app, r.id === 'relic' ? st.init.relic : st.init.potion, x + 4, yy + 4, 40, { size: 10 });
  const a = slide * (r.taken ? 0.45 : 1);
  let ty = yy + 10;
  app.text(info.head.toUpperCase(), x + tx, ty, { ...hO, color: DIM, alpha: a }); ty += headH;
  app.text(info.title, x + tx, ty, { ...tO, color: info.col, shadow: true, alpha: a }); ty += titleH;
  app.text(info.line, x + tx, ty, { ...dO, color: COL.vellum, alpha: a });
  // status chip
  const label = r.taken ? 'Taken' : full ? 'Slots full' : 'Take';
  const cw = 130, ch = Math.round(40 * Math.min(k, 1.2)), cx = x + PW - cw - 14, cyy = cy - ch / 2;
  app.reg('reward-chip' + i, cx, cyy, cw, ch, { group: 'row' + i });
  ctx.save(); ctx.globalAlpha = slide;
  ICONS.drawRewardChip(ctx, cx, cyy, cw, ch, r.taken ? 'taken' : full ? 'full' : 'take', hover); ctx.restore(); // engraved tag (art/icons.js)
  const fs = Math.min(20 * k, (cw - 12) / (label.length * 0.56));
  app.text(label, cx + cw / 2, cyy + (ch - fs) / 2 - 1, { size: Math.floor(Math.max(14, fs)), fixed: true, bold: true, align: 'center', color: r.taken ? COL.good : full ? '#ffb3bd' : '#ffe9a8', alpha: slide });
  keyBadge(app, String(i + 1), x - 16, cy);

  if (!app.blocked && app.inRect(x, y, PW, h)) {
    const rowAnchor = { x, y, w: PW, h }; // tip sits beside the row, never over its Take chip
    if (full) app.tooltip(info.title, `Potion slots full (${run.potions.length}/${RUN.potionSlots(run)}). Use a potion in combat to make room, or leave this one.`, { color: COL.bad, anchor: rowAnchor, gloss: [info.line] });
    else if (info.tip) app.tooltip(info.title, null, { lines: info.tip, color: info.col, anchor: rowAnchor, gloss: [info.line] }); // adds information only: the row already shows the name and text
    if (can && app.clicked(x, y, PW, h)) claim(app, r.id, x + PW / 2, cy);
  }
  return y + h + (compact ? 6 : 12);
}
// wrapLimit at an exact (already capped) pixel size
function wrapLimitK(app, str, maxW, px, maxLines) { return wrapLimit(app, str, maxW, px, maxLines, { ui: true, fixed: true }); }

function drawChoices(app, y, K, bottom) {
  const ctx = app.ctx, rw = st.rw, init = st.init;
  const S = tscale(app), k = Math.min(S, 1.25);
  const n = init.choices.length;
  const w = 264, gap = 20;
  const totalW = n * w + (n - 1) * gap, x0 = 640 - totalW / 2;
  const picked = st.taken.boss;
  const hh = app.text(picked ? 'Relic claimed.' : 'Choose ONE relic', 640, y, { ...K(20), bold: true, align: 'center', color: picked ? COL.good : '#c58bff', shadow: true, maxW: 500 });
  app.reg('reward-choose', 440, y, 400, hh, { group: 'choose' });
  const h = clamp(Math.floor(bottom - (y + hh + 8)), 104, 232); // never lower than the forfeit notes: the cards shrink to fit (text is fitted into what is left), the old fixed 150 floor ran under the notes on a full boss reward
  init.choices.forEach((id, i) => {
    const rl = RELICS[id]; if (!rl) return;
    const r2 = RARITY[rl.rarity] || RARITY.boss;
    const slide = EASE.out(clamp((st.t - 0.2 - i * 0.12) / 0.45, 0, 1));
    const mine = picked === id, locked = picked && !mine;
    const x = x0 + i * (w + gap), yy = y + hh + 6 + (1 - slide) * 40;
    const hover = !picked && !app.blocked && app.inRect(x, yy, w, h);
    app.reg('reward-choice' + i, x, yy, w, h, { group: 'choice' + i });
    ctx.save(); ctx.globalAlpha = slide * (locked ? 0.3 : 1);
    if (hover || mine) { ctx.shadowColor = mine ? COL.good : '#c58bff'; ctx.shadowBlur = 26; }
    app.rr(x, yy + (hover ? -4 : 0), w, h, 12);
    ctx.fillStyle = hover ? '#33283a' : '#271f2c'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = lnw(hover || mine ? 3 : 2); ctx.strokeStyle = mine ? COL.good : hover ? COL.lamp : 'rgba(197,139,255,.55)'; ctx.stroke();
    ctx.restore();
    const hy = yy + (hover ? -4 : 0);
    ctx.save(); ctx.globalAlpha = slide * (locked ? 0.3 : 1);
    ICONS.drawRelic(ctx, id, x + w / 2, hy + 36, 48);
    ctx.restore();
    if (!locked) newRibbon(app, id, x - 8, hy + 8, w, { size: 10, right: true });
    const a = slide * (locked ? 0.3 : 1);
    let ty = hy + 64;
    ty += app.text(rl.name, x + w / 2, ty, { ...K(21), bold: true, align: 'center', color: r2.color, shadow: true, alpha: a, maxW: w - 24, lineH: Math.round(21 * k * 1.15) });
    if (h >= 200) ty += app.text(r2.name.toUpperCase() + ' RELIC', x + w / 2, ty + 1, { ...K(12), ui: true, bold: true, align: 'center', color: DIM, alpha: a, maxW: w - 24 }) + 4;
    const rh = Math.max(14, hy + h - (mine ? 30 : 10) - ty);
    app.text(rl.text, x + w / 2, ty, { size: Math.round(14 * k), fixed: true, ui: true, align: 'center', color: COL.vellum, alpha: a, fit: { w: w - 28, h: rh, lines: Math.max(1, Math.floor(rh / Math.round(14 * k * 1.2))) } });
    if (mine) app.text('TAKEN', x + w / 2, hy + h - 26, { size: 16, fixed: true, bold: true, align: 'center', color: COL.good });
    else keyBadge(app, 'QWE'[i], x + 18, hy + 18);
    if (!picked && !app.blocked && app.inRect(x, yy, w, h)) {
      app.tooltip(rl.name, null, { lines: ['Only one can be taken, and it is kept for the rest of the run.'], color: r2.color, gloss: [rl.text], anchor: { x, y: yy, w, h, band: { x: clamp(x, 24, 1280 - 24 - 2 * 328), y: yy + h + 12, bottom: 716, dir: 1 } } });
      if (app.clicked(x, yy, w, h)) claim(app, 'boss', x + w / 2, yy + 60, id);
    }
  });
}

function claim(app, what, fx, fy, relicId) {
  const run = st.run, rw = st.rw;
  if (what === 'gold') {
    if (!(rw.gold > 0)) return;
    RUN.claimGold(run, rw);
    st.fx.burst(fx, fy, 'coin', { n: 22, speed: 380 }); st.fx.ring(fx, fy, COL.gold, 110, 0.5);
    sfx(app, 'coin'); sfx(app, 'gold', { vol: 0.6 });
  } else if (what === 'potion') {
    if (!rw.potion) return;
    if (!RUN.addPotion(run, rw.potion)) { sfx(app, 'error'); return; }
    rw.potion = null; st.fx.burst(fx, fy, 'echo', { n: 14 }); sfx(app, 'potion');
  } else if (what === 'relic') {
    if (!rw.relic) return;
    RUN.addRelic(run, rw.relic); rw.relic = null;
    st.fx.burst(fx, fy, 'gild', { n: 22 }); st.fx.ring(fx, fy, COL.lamp, 130, 0.6); sfx(app, 'relic');
  } else if (what === 'boss') {
    if (st.taken.boss || !(rw.relicChoices && rw.relicChoices.includes(relicId))) return;
    RUN.addRelic(run, relicId); st.taken.boss = relicId; rw.relicChoices = null;
    st.fx.burst(fx, fy, 'gild', { n: 30 }); st.fx.ring(fx, fy, '#c58bff', 160, 0.7); st.fx.flash('#c58bff', 0.2, 0.3); sfx(app, 'relic');
  }
}

function onKey(app, k) {
  if (!k || st.done) return;
  const rows = buildRows();
  if (k >= '1' && k <= '9') {
    const n = +k - 1;
    if (rows[n] && !rows[n].taken) claim(app, rows[n].id, 640, 200 + n * 90);
  } else if ('qwe'.includes(k.toLowerCase()) && k.length === 1 && st.init.choices) {
    const id = st.init.choices['qwe'.indexOf(k.toLowerCase())];
    if (id) claim(app, 'boss', 640, 400, id);
  } else if (k === 'Enter') doContinue(app);
}

function doContinue(app) {
  if (st.done) return;
  st.done = true;
  const run = st.run;
  RUN.afterReward(run);
  app.shared.flow.route();
}
