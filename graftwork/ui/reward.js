// SPOILS: what the fight left on the table. Gold, a potion, an elite relic or a boss relic choice, then on to the graft table.
// Everything is claimed through engine/run.js; whatever is not claimed is forfeited on Continue.
import { COL, EASE, clamp, lerp, rgba } from './core.js';
import { Fx } from './fx.js';
import * as RUN from '../engine/run.js';
import { RELICS, POTIONS } from '../data/index.js';
import { drawBackground } from '../art/backgrounds.js';
import * as ICONS from '../art/icons.js';
import { wrapLimit, keyBadge } from './graft_parts.js';

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
    drawBackground(ctx, ACT_THEME[run.act] || 'ward', st.t);
    ctx.save(); ctx.fillStyle = 'rgba(8,6,5,.55)'; ctx.fillRect(0, 0, 1280, 720); ctx.restore();

    // purse
    ICONS.drawCoin(ctx, 1090, 34, 28);
    app.text(String(run.gold), 1112, 20, { size: 26, bold: true, color: COL.gold, shadow: true });
    ICONS.drawHeart(ctx, 960, 34, 28);
    app.text(`${run.hp}/${run.maxHp}`, 982, 20, { size: 26, bold: true, color: '#ffb3bd', shadow: true });

    const kind = rw.kind === 'elite' || rw.kind === 'boss' ? rw.kind : 'normal';
    app.text('Spoils', 640, 22, { size: 54, bold: true, align: 'center', color: COL.lamp, shadow: true });
    app.text(`${KIND[kind]}. Take what you can carry.`, 640, 84, { size: 19, italic: true, align: 'center', color: DIM });

    const rows = buildRows(app);
    let y = 128;
    rows.forEach((r, i) => { y = drawRow(app, r, i, y); });

    // boss relic choice
    if (st.init.choices) drawChoices(app, y + 6);

    // forfeit notes
    const notes = [];
    if (rw.gold > 0) notes.push(`${rw.gold} gold is still on the table. It will be left behind.`);
    if (rw.potion) notes.push('The potion will be left behind.');
    if (rw.relic) notes.push('The relic will be left behind.');
    if (rw.relicChoices && rw.relicChoices.length) notes.push('Choose a relic, or leave them all.');
    notes.slice(0, 2).forEach((n, i) => app.text(n, 640, 596 + i * 20, { size: 15, ui: true, align: 'center', color: '#ffb36b' }));

    const toGraft = rw.graft && RUN.graftableCards(run).length > 0;
    const label = toGraft ? 'Continue to the graft table' : 'Continue to the map';
    if (app.button(label, 390, 646, 500, 60, { size: 26, fill: '#5a3f10', color: '#ffe9a8', sub: notes.length ? 'Unclaimed spoils are forfeited' : undefined, subColor: '#ffb36b' })) doContinue(app);
    if (app.inRect(390, 646, 500, 60)) app.tooltip(label, toGraft ? 'Next you pick one of your cards and one graft. Or decline for a small prize.' : 'Back to the map.', { color: COL.lamp });

    st.fx.draw(ctx); st.fx.drawFlash(ctx, 1280, 720);
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
  if (r.id === 'gold') return { title: `${init.gold} gold`, line: 'Coins left on the table.', col: COL.gold, tip: ['Added to your purse.'], head: 'Gold' };
  if (r.id === 'potion') {
    const p = POTIONS[init.potion]; const r2 = RARITY[p.rarity] || RARITY.common;
    return { title: p.name, line: p.text, col: r2.color, head: 'Potion', tip: [r2.name + ' potion.', p.text, 'Used from the combat screen.'], icon: (c, x, y, s) => ICONS.drawPotion(c, init.potion, x, y, s) };
  }
  const rl = RELICS[init.relic]; const r2 = RARITY[rl.rarity] || RARITY.common;
  return { title: rl.name, line: rl.text, col: r2.color, head: r2.name + ' relic', tip: [r2.name + ' relic.', rl.text], icon: (c, x, y, s) => ICONS.drawRelic(c, init.relic, x, y, s) };
}

function drawRow(app, r, i, y) {
  const ctx = app.ctx, run = st.run, rw = st.rw;
  const info = rowInfo(r);
  const h = r.id === 'relic' ? 96 : 80;
  const slide = EASE.out(clamp((st.t - 0.15 - i * 0.12) / 0.45, 0, 1));
  const x = PX + (1 - slide) * 60;
  const full = r.id === 'potion' && !r.taken && run.potions.length >= RUN.potionSlots(run);
  const can = !r.taken && !full;
  const hover = can && !app.blocked && app.inRect(x, y, PW, h);
  ctx.save();
  ctx.globalAlpha = slide;
  if (hover) { ctx.shadowColor = info.col; ctx.shadowBlur = 22; }
  app.rr(x, y + (hover ? -2 : 0), PW, h, 12);
  ctx.fillStyle = r.taken ? 'rgba(30,26,22,.7)' : hover ? '#3a2e24' : '#2b231e'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = hover ? 3 : 2; ctx.strokeStyle = r.taken ? 'rgba(232,220,196,.15)' : hover ? COL.lamp : 'rgba(232,220,196,.4)'; ctx.stroke();
  ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = r.taken ? 'rgba(232,220,196,.1)' : rgba(info.col, 0.6); app.rr(x + 5, y + 5 + (hover ? -2 : 0), PW - 10, h - 10, 8); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  const yy = y + (hover ? -2 : 0);
  ctx.save(); ctx.globalAlpha = slide * (r.taken ? 0.4 : 1);
  const cy = yy + h / 2;
  if (r.id === 'gold') ICONS.drawCoin(ctx, x + 58, cy, 52); else info.icon(ctx, x + 58, cy, 56);
  ctx.restore();
  const a = slide * (r.taken ? 0.45 : 1);
  app.text(info.head.toUpperCase(), x + 108, yy + 11, { size: 13, ui: true, bold: true, color: DIM, alpha: a });
  app.text(info.title, x + 108, yy + 26, { size: 26, bold: true, color: info.col, shadow: true, alpha: a });
  if (r.id !== 'gold') wrapLimit(app, info.line, PW - 108 - 190, 15, r.id === 'relic' ? 3 : 2, { ui: true }).forEach((ln, k) => app.text(ln, x + 108, yy + 58 + k * 17 - (r.id === 'relic' ? 0 : 6), { size: 15, ui: true, color: COL.vellum, alpha: a }));
  else app.text(info.line, x + 108, yy + 56, { size: 15, ui: true, color: COL.vellum, alpha: a });
  // status chip
  const label = r.taken ? 'Taken' : full ? 'Slots full' : 'Take';
  const cw = 130, ch = 40, cx = x + PW - cw - 18, cyy = cy - ch / 2;
  ctx.save(); ctx.globalAlpha = slide;
  app.rr(cx, cyy, cw, ch, 8); ctx.fillStyle = r.taken ? 'rgba(80,100,80,.35)' : full ? 'rgba(90,20,30,.6)' : hover ? '#6a4a14' : '#4a3410'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = r.taken ? 'rgba(127,207,138,.5)' : full ? COL.bad : COL.lamp; ctx.stroke(); ctx.restore();
  app.text(label, cx + cw / 2, cyy + 8, { size: 20, bold: true, align: 'center', color: r.taken ? COL.good : full ? '#ffb3bd' : '#ffe9a8', alpha: slide });
  keyBadge(app, String(i + 1), x - 16, cy);

  if (!app.blocked && app.inRect(x, y, PW, h)) {
    if (full) app.tooltip(info.title, `Potion slots full (${run.potions.length}/${RUN.potionSlots(run)}). Use a potion in combat to make room, or leave this one.`, { color: COL.bad });
    else app.tooltip(info.title, null, { lines: info.tip, color: info.col });
    if (can && app.clicked(x, y, PW, h)) claim(app, r.id, x + PW / 2, cy);
  }
  return y + h + 12;
}

function drawChoices(app, y) {
  const ctx = app.ctx, rw = st.rw, init = st.init;
  const n = init.choices.length;
  const w = 210, h = 250, gap = 24;
  const totalW = n * w + (n - 1) * gap, x0 = 640 - totalW / 2;
  const picked = st.taken.boss;
  app.text(picked ? 'Relic claimed.' : 'Choose ONE relic', 640, y + 2, { size: 20, bold: true, align: 'center', color: picked ? COL.good : '#c58bff', shadow: true });
  init.choices.forEach((id, i) => {
    const rl = RELICS[id]; if (!rl) return;
    const r2 = RARITY[rl.rarity] || RARITY.boss;
    const slide = EASE.out(clamp((st.t - 0.2 - i * 0.12) / 0.45, 0, 1));
    const mine = picked === id, locked = picked && !mine;
    const x = x0 + i * (w + gap), yy = y + 30 + (1 - slide) * 80;
    const hover = !picked && !app.blocked && app.inRect(x, yy, w, h);
    ctx.save(); ctx.globalAlpha = slide * (locked ? 0.3 : 1);
    if (hover || mine) { ctx.shadowColor = mine ? COL.good : '#c58bff'; ctx.shadowBlur = 26; }
    app.rr(x, yy + (hover ? -4 : 0), w, h, 12);
    ctx.fillStyle = hover ? '#33283a' : '#271f2c'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = hover || mine ? 3 : 2; ctx.strokeStyle = mine ? COL.good : hover ? COL.lamp : 'rgba(197,139,255,.55)'; ctx.stroke();
    ctx.restore();
    const hy = yy + (hover ? -4 : 0);
    ctx.save(); ctx.globalAlpha = slide * (locked ? 0.3 : 1);
    ICONS.drawRelic(ctx, id, x + w / 2, hy + 52, 62);
    ctx.restore();
    const a = slide * (locked ? 0.3 : 1);
    app.text(rl.name, x + w / 2, hy + 94, { size: 21, bold: true, align: 'center', color: r2.color, shadow: true, alpha: a, maxW: w - 16, lineH: 23 });
    app.text(r2.name.toUpperCase() + ' RELIC', x + w / 2, hy + 122, { size: 12, ui: true, bold: true, align: 'center', color: DIM, alpha: a });
    wrapLimit(app, rl.text, w - 28, 14, 6, { ui: true }).forEach((ln, k) => app.text(ln, x + w / 2, hy + 142 + k * 16, { size: 14, ui: true, align: 'center', color: COL.vellum, alpha: a }));
    if (mine) app.text('TAKEN', x + w / 2, hy + h - 26, { size: 16, bold: true, align: 'center', color: COL.good });
    else keyBadge(app, 'QWE'[i], x + 18, hy + 18);
    if (!picked && !app.blocked && app.inRect(x, yy, w, h)) {
      app.tooltip(rl.name, null, { lines: [r2.name + ' relic.', rl.text, 'Only one can be taken.'], color: r2.color });
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
