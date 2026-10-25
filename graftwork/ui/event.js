// EVENT screen (run.phase === 'event', run.pending = {kind:'event', id, result}).
// Left: a framed mood scene (procedural). Right: a parchment panel with the scene text (typewriter), choices, then the result.
import { COL, EASE, W, H, clamp, lerp, rgba, FONT, FONT_UI } from './core.js';
import * as RUN from '../engine/run.js';
import { cardSpec } from '../engine/cards.js';
import { EVENTS, RELICS } from '../data/index.js';
import { Fx } from './fx.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawCard, CARD_W, CARD_H } from '../art/cards.js';
import { drawHeart, drawCoin, drawRelic } from '../art/icons.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const FRAME = { x: 36, y: 40, w: 520, h: 560 };
const PANEL = { x: 584, y: 28, w: 664, h: 664 };
const ACT_TINT = { 1: ['#1c2b24', '#4f7a5f', '#bfe3c8'], 2: ['#2b1d12', '#8a5a2b', '#ffd596'], 3: ['#1c1230', '#6b4fa0', '#f5e6a8'] };
const CPS = 62; // typewriter chars per second

function reduced(app) { const s = app.shared.meta && app.shared.meta.settings; return !!(s && (s.reduceMotion || s.reducedMotion)); }

// ---------- procedural silhouettes ----------
const SIL = {
  figure(g, x, y, s, c) { // hooded figure, feet at y
    g.fillStyle = c; g.beginPath(); g.moveTo(x - 34 * s, y); g.quadraticCurveTo(x - 30 * s, y - 90 * s, x - 10 * s, y - 118 * s);
    g.quadraticCurveTo(x, y - 140 * s, x + 10 * s, y - 118 * s); g.quadraticCurveTo(x + 30 * s, y - 90 * s, x + 34 * s, y); g.closePath(); g.fill();
    g.beginPath(); g.arc(x, y - 124 * s, 13 * s, 0, 6.283); g.fill();
  },
  table(g, x, y, s, c) {
    g.fillStyle = c; g.fillRect(x - 70 * s, y - 56 * s, 140 * s, 8 * s); g.fillRect(x - 62 * s, y - 48 * s, 8 * s, 48 * s); g.fillRect(x + 54 * s, y - 48 * s, 8 * s, 48 * s);
    g.fillRect(x - 40 * s, y - 80 * s, 14 * s, 24 * s); g.beginPath(); g.arc(x + 10 * s, y - 68 * s, 12 * s, 0, 6.283); g.fill(); g.fillRect(x + 32 * s, y - 70 * s, 22 * s, 14 * s);
  },
  door(g, x, y, s, c, glow) {
    g.fillStyle = c; g.fillRect(x - 56 * s, y - 190 * s, 112 * s, 190 * s);
    g.fillStyle = glow; g.beginPath(); g.moveTo(x - 38 * s, y); g.lineTo(x - 38 * s, y - 130 * s); g.quadraticCurveTo(x, y - 170 * s, x + 38 * s, y - 130 * s); g.lineTo(x + 38 * s, y); g.closePath(); g.fill();
  },
  crates(g, x, y, s, c) {
    g.fillStyle = c; g.fillRect(x - 50 * s, y - 44 * s, 56 * s, 44 * s); g.fillRect(x + 10 * s, y - 34 * s, 44 * s, 34 * s); g.fillRect(x - 30 * s, y - 84 * s, 46 * s, 40 * s);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(x - 50 * s, y - 44 * s, 56 * s, 44 * s); g.strokeRect(x - 30 * s, y - 84 * s, 46 * s, 40 * s);
  },
  gurney(g, x, y, s, c) {
    g.fillStyle = c; g.fillRect(x - 74 * s, y - 52 * s, 148 * s, 10 * s); g.fillRect(x - 66 * s, y - 42 * s, 6 * s, 28 * s); g.fillRect(x + 60 * s, y - 42 * s, 6 * s, 28 * s);
    g.beginPath(); g.arc(x - 62 * s, y - 8 * s, 8 * s, 0, 6.283); g.arc(x + 62 * s, y - 8 * s, 8 * s, 0, 6.283); g.fill();
    g.beginPath(); g.ellipse(x, y - 64 * s, 60 * s, 12 * s, 0, 0, 6.283); g.fill();
  },
  jars(g, x, y, s, c) {
    for (let i = 0; i < 3; i++) { const jx = x + (i - 1) * 40 * s, jh = (62 + (i === 1 ? 20 : 0)) * s; g.fillStyle = c; g.beginPath(); g.roundRect ? g.roundRect(jx - 14 * s, y - jh, 28 * s, jh, 6 * s) : g.rect(jx - 14 * s, y - jh, 28 * s, jh); g.fill(); g.fillRect(jx - 9 * s, y - jh - 8 * s, 18 * s, 8 * s); }
  },
  chair(g, x, y, s, c) {
    g.fillStyle = c; g.fillRect(x - 36 * s, y - 52 * s, 72 * s, 12 * s); g.fillRect(x - 36 * s, y - 120 * s, 14 * s, 80 * s); g.fillRect(x - 28 * s, y - 40 * s, 8 * s, 40 * s); g.fillRect(x + 20 * s, y - 40 * s, 8 * s, 40 * s);
    g.fillRect(x + 36 * s, y - 100 * s, 30 * s, 6 * s); g.fillRect(x + 56 * s, y - 100 * s, 5 * s, 20 * s);
  },
  curtain(g, x, y, s, c) {
    g.fillStyle = c; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x - 80 * s + i * 32 * s, y - 230 * s); g.quadraticCurveTo(x - 66 * s + i * 32 * s, y - 120 * s, x - 76 * s + i * 32 * s, y); g.lineTo(x - 50 * s + i * 32 * s, y); g.quadraticCurveTo(x - 40 * s + i * 32 * s, y - 120 * s, x - 48 * s + i * 32 * s, y - 230 * s); g.closePath(); g.fill(); }
  },
};
const SETS = [['door', 'figure'], ['table', 'figure', 'crates'], ['gurney', 'figure'], ['jars', 'table'], ['chair', 'figure', 'crates'], ['curtain', 'figure', 'table'], ['figure', 'crates'], ['door', 'jars', 'figure']];

function drawScene(g, ev, act, t) {
  const [dark, mid, light] = ACT_TINT[act] || ACT_TINT[1];
  const h = hash(ev.id);
  g.save();
  g.beginPath(); g.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h); g.clip();
  g.save(); g.translate(FRAME.x, FRAME.y); const sc = Math.max(FRAME.w / W, FRAME.h / H); g.scale(sc, sc); drawBackground(g, 'event', t); g.restore();
  // act wash
  const wash = g.createLinearGradient(0, FRAME.y, 0, FRAME.y + FRAME.h);
  wash.addColorStop(0, rgba(dark, 0.78)); wash.addColorStop(0.6, rgba(mid, 0.42)); wash.addColorStop(1, rgba(dark, 0.9));
  g.fillStyle = wash; g.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  // light pool
  const lx = FRAME.x + FRAME.w * (0.3 + ((h >> 3) % 40) / 100), ly = FRAME.y + 150;
  const flick = 1 + Math.sin(t * 7 + h) * 0.03 + Math.sin(t * 13.3) * 0.02;
  const lg = g.createRadialGradient(lx, ly, 6, lx, ly, 280 * flick); lg.addColorStop(0, rgba(light, 0.5)); lg.addColorStop(0.35, rgba(light, 0.16)); lg.addColorStop(1, rgba(light, 0));
  g.fillStyle = lg; g.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  // hanging lamp
  g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(lx, FRAME.y); g.lineTo(lx, ly - 14); g.stroke();
  g.fillStyle = light; g.shadowColor = light; g.shadowBlur = 18; g.beginPath(); g.arc(lx, ly, 9, 0, 6.283); g.fill(); g.shadowBlur = 0;
  // floor
  const fy = FRAME.y + FRAME.h - 96;
  const fg = g.createLinearGradient(0, fy, 0, FRAME.y + FRAME.h); fg.addColorStop(0, rgba('#0a0807', 0.55)); fg.addColorStop(1, rgba('#050403', 0.95));
  g.fillStyle = fg; g.fillRect(FRAME.x, fy, FRAME.w, 96);
  g.strokeStyle = rgba(light, 0.14); g.lineWidth = 1; g.beginPath(); g.moveTo(FRAME.x, fy); g.lineTo(FRAME.x + FRAME.w, fy); g.stroke();
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(FRAME.x + FRAME.w / 2 + (i - 3) * 20, fy); g.lineTo(FRAME.x + FRAME.w / 2 + (i - 3) * 160, FRAME.y + FRAME.h); g.stroke(); }
  // silhouettes
  const set = SETS[h % SETS.length];
  const sil = '#070605';
  const glow = rgba(light, 0.55);
  set.forEach((name, i) => {
    const x = FRAME.x + 110 + i * (FRAME.w - 220) / Math.max(1, set.length - 1 || 1) + (set.length === 1 ? 150 : 0) + (((h >> (i * 4)) & 7) - 3) * 6;
    const y = fy + 70 + (i % 2) * 14, s = 1.15 + (((h >> (i * 3 + 1)) & 3) * 0.08);
    g.save(); g.shadowColor = rgba(light, 0.4); g.shadowBlur = 8;
    SIL[name](g, x, y, s, sil, glow);
    g.restore();
  });
  // drifting motes
  for (let i = 0; i < 16; i++) {
    const px = FRAME.x + ((hash('m' + i + ev.id) % 1000) / 1000) * FRAME.w + Math.sin(t * 0.4 + i) * 12;
    const py = FRAME.y + FRAME.h - ((t * (10 + (i % 5) * 4) + (hash('n' + i) % 600)) % (FRAME.h));
    g.fillStyle = rgba(light, 0.22 + 0.15 * Math.sin(t * 2 + i)); g.beginPath(); g.arc(px, py, 1.5 + (i % 3) * 0.6, 0, 6.283); g.fill();
  }
  // edge vignette
  const vg = g.createRadialGradient(FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h / 2, 160, FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h / 2, 420);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)'); g.fillStyle = vg; g.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  g.restore();
  // frame: stitched border and corner tabs
  g.save();
  g.lineWidth = 8; g.strokeStyle = '#2b2018'; g.strokeRect(FRAME.x - 4, FRAME.y - 4, FRAME.w + 8, FRAME.h + 8);
  g.lineWidth = 2; g.strokeStyle = 'rgba(232,220,196,.55)'; g.setLineDash([9, 7]); g.strokeRect(FRAME.x + 6, FRAME.y + 6, FRAME.w - 12, FRAME.h - 12); g.setLineDash([]);
  g.restore();
}

export default {
  enter(app, params) {
    const run = app.shared.run; this.run = run;
    this.fx = new Fx();
    this.picker = null; this.busy = false; this.heartPulse = 0; this.goldPulse = 0;
    this.shown = 0; this.t = 0; this.resultT = 0; this.resultShown = 0; this.pickScroll = 0; this.flash = null;
    const p = run.pending;
    this.ev = p && EVENTS[p.id];
    if (p && p.result !== null && p.result !== undefined) { this.shown = 1e9; this.resultShown = 1e9; this.result = p.result; this.gain = []; }
    else this.result = null;
    if (reduced(app)) this.shown = 1e9;
    if (app.shared.audio) app.shared.audio.sfx('eventChime', { vol: 0.6 });
  },
  leave() {},
  key() { return false; },
  update(app, dt) {
    this.t += dt;
    const d = this.fx.update(dt);
    this.shown += CPS * dt;
    if (this.result !== null && this.result !== undefined) this.resultShown += CPS * 1.4 * dt;
    this.heartPulse = Math.max(0, this.heartPulse - dt * 2.2);
    this.goldPulse = Math.max(0, this.goldPulse - dt * 2.2);
  },
  reasonFor(run, c, ev) {
    const m = /(\d+)\s*gold/i.exec(c.label + ' ' + (c.text || ''));
    if (m && run.gold < +m[1]) return `Needs ${m[1]} gold`;
    if (c.pick === 'card') return 'No card qualifies';
    return 'Requirement not met';
  },
  choose(app, i, uid) {
    const run = this.run; if (this.busy) return;
    const before = { gold: run.gold, hp: run.hp, maxHp: run.maxHp, relics: run.relics.length, potions: run.potions.length, deck: run.deck.length, relicList: run.relics.slice() };
    const res = RUN.eventChoose(run, i, uid);
    if (res === null || res === undefined) { if (app.shared.audio) app.shared.audio.sfx('error'); return; }
    this.result = res; this.resultShown = reduced(app) ? 1e9 : 0; this.picker = null;
    const gain = [];
    const dg = run.gold - before.gold, dh = run.hp - before.hp, dm = run.maxHp - before.maxHp;
    const au = app.shared.audio, fx = this.fx, hudHeart = { x: FRAME.x + 34, y: FRAME.y + FRAME.h + 34 }, hudCoin = { x: FRAME.x + 190, y: FRAME.y + FRAME.h + 34 };
    if (dg) {
      this.goldPulse = 1;
      if (dg > 0) { fx.burst(hudCoin.x, hudCoin.y, 'coin', { n: 12, angle: -Math.PI / 2, spread: 1.6 }); if (au) au.sfx('coin'); } else if (au) au.sfx('gold', { vol: 0.6 });
      fx.float((dg > 0 ? '+' : '') + dg, hudCoin.x + 40, hudCoin.y - 26, { color: dg > 0 ? COL.gold : COL.bad, size: 28 });
    }
    if (dh || dm) {
      this.heartPulse = 1;
      fx.float((dh >= 0 && !dm ? '+' : '') + (dm ? (dm > 0 ? '+' : '') + dm + ' max' : dh), hudHeart.x + 50, hudHeart.y - 26, { color: (dh < 0 || dm < 0) ? COL.bad : COL.good, size: 28 });
      if (dh > 0 || dm > 0) { fx.burst(hudHeart.x, hudHeart.y, 'heal'); if (au) au.sfx('heal'); } else { fx.burst(hudHeart.x, hudHeart.y, 'blood'); fx.shake(0.25); if (au) au.sfx('loseHp'); }
    }
    if (run.relics.length > before.relics) {
      const rid = run.relics.find((r) => !before.relicList.includes(r));
      fx.ring(FRAME.x + FRAME.w / 2, FRAME.y + 240, COL.lamp, 200, 0.9); fx.burst(FRAME.x + FRAME.w / 2, FRAME.y + 240, 'gild', { n: 24 }); fx.flash(COL.lamp, 0.18, 0.4);
      this.gotRelic = rid; this.gotRelicT = 0; if (au) au.sfx('relic');
    }
    if (run.potions.length > before.potions && au) au.sfx('potion');
    if (run.deck.length !== before.deck && au) au.sfx('upgrade', { vol: 0.5 });
  },
  cont(app) {
    const run = this.run;
    RUN.afterEvent(run);
    app.shared.flow.route();
  },
  draw(app) {
    const g = app.ctx, run = this.run, mouse = app.mouse;
    const ev = this.ev;
    drawBackground(g, 'event', app.t);
    const so = this.fx.shakeOffset();
    g.save(); g.translate(so.x, so.y);
    if (!ev) {
      app.panel(PANEL.x, PANEL.y, PANEL.w, PANEL.h, { fill: '#d9ccae', stroke: '#2b1e1a' });
      app.text('Nothing is here.', PANEL.x + 40, PANEL.y + 60, { size: 30, bold: true, color: COL.ink });
      if (app.button('Continue', PANEL.x + 40, PANEL.y + 140, 200, 54, { size: 22 })) this.cont(app);
      g.restore(); return;
    }
    drawScene(g, ev, run.act, app.t);
    this.drawHud(app, run);
    this.drawPanel(app, run, ev);
    g.restore();
    this.fx.draw(g); this.fx.drawFlash(g, W, H);
    if (this.picker) this.drawPicker(app, run, ev);
    if (this.gotRelic && RELICS[this.gotRelic]) {
      this.gotRelicT += app.dt; const r = RELICS[this.gotRelic];
      const a = clamp(this.gotRelicT < 0.3 ? this.gotRelicT / 0.3 : 1, 0, 1);
      g.save(); g.globalAlpha = a; app.panel(FRAME.x + 60, FRAME.y + 150, FRAME.w - 120, 110, { fill: 'rgba(14,12,10,.92)', stroke: COL.lamp, lw: 2.5 });
      drawRelic(g, this.gotRelic, FRAME.x + 110, FRAME.y + 205, 56);
      app.text('Relic gained', FRAME.x + 156, FRAME.y + 166, { size: 13, ui: true, bold: true, color: COL.lamp });
      app.text(r.name, FRAME.x + 156, FRAME.y + 184, { size: 22, bold: true });
      app.text(r.text, FRAME.x + 156, FRAME.y + 212, { size: 13, ui: true, maxW: FRAME.w - 240, color: 'rgba(232,220,196,.8)' });
      g.restore();
    }
  },
  drawHud(app, run) {
    const g = app.ctx;
    const y = FRAME.y + FRAME.h + 34;
    const hp = 1 + this.heartPulse * 0.45, gp = 1 + this.goldPulse * 0.35;
    g.save(); g.translate(FRAME.x + 34, y); g.scale(hp, hp); drawHeart(g, 0, 0, 30); g.restore();
    app.text(`${run.hp} / ${run.maxHp}`, FRAME.x + 62, y - 13, { size: 24, bold: true, color: this.heartPulse > 0.05 ? '#ff9aa6' : COL.vellum });
    g.save(); g.translate(FRAME.x + 190, y); g.scale(gp, gp); drawCoin(g, 0, 0, 28); g.restore();
    app.text(String(run.gold), FRAME.x + 214, y - 13, { size: 24, bold: true, color: COL.gold });
    app.text(`Deck ${run.deck.length}`, FRAME.x + FRAME.w, y - 9, { size: 17, ui: true, align: 'right', color: 'rgba(232,220,196,.6)' });
    if (app.inRect(FRAME.x + 300, y - 18, 220, 36)) { app.cursor = 'pointer'; if (app.mouse.released && !this.picker) app.shared.flow.openDeck(); }
  },
  drawPanel(app, run, ev) {
    const g = app.ctx, mouse = app.mouse;
    const P = PANEL, ix = P.x + 36, iw = P.w - 72;
    // parchment
    g.save();
    app.rr(P.x + 4, P.y + 6, P.w, P.h, 10); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
    app.rr(P.x, P.y, P.w, P.h, 10);
    const pg = g.createLinearGradient(P.x, P.y, P.x + P.w, P.y + P.h); pg.addColorStop(0, '#e2d5b6'); pg.addColorStop(1, '#cbbb95'); g.fillStyle = pg; g.fill();
    g.strokeStyle = '#2b1e1a'; g.lineWidth = 3; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(43,30,26,.4)'; g.setLineDash([8, 6]); app.rr(P.x + 10, P.y + 10, P.w - 20, P.h - 20, 6); g.stroke(); g.setLineDash([]);
    g.restore();

    // title
    app.text(ev.act ? `ACT ${['', 'I', 'II', 'III'][ev.act]} EVENT` : 'EVENT', ix, P.y + 30, { size: 13, ui: true, bold: true, color: 'rgba(43,30,26,.55)' });
    const th = app.text(ev.name, ix, P.y + 48, { size: 40, bold: true, color: COL.ink, maxW: iw, lineH: 46 });
    let y = P.y + 48 + th + 8;
    g.strokeStyle = COL.scar; g.lineWidth = 2.5; g.setLineDash([10, 7]); g.beginPath(); g.moveTo(ix, y); g.lineTo(ix + iw, y); g.stroke(); g.setLineDash([]);
    y += 20;

    // scene text, typewriter
    const lines = app.wrap(ev.text, iw, 21, {});
    const total = ev.text.length;
    const shown = Math.min(total, Math.floor(this.shown));
    let left = shown;
    lines.forEach((ln, i) => {
      const n = Math.max(0, Math.min(ln.length, left)); left -= ln.length + 1;
      if (n > 0) app.text(ln.slice(0, n), ix, y + i * 29, { size: 21, color: this.result !== null ? 'rgba(43,30,26,.7)' : COL.ink });
    });
    const typing = shown < total;
    if (typing && Math.floor(app.t * 2) % 2 === 0) { // blinking quill mark
      app.text('|', ix + iw - 6, y + (lines.length - 1) * 29, { size: 21, color: COL.scar });
    }
    y += lines.length * 29 + 16;
    const textEnd = y;
    // click panel to finish the text
    if (typing) {
      if (!app.blocked && !this.picker && mouse.released && app.inRect(P.x, P.y, P.w, P.h)) this.shown = 1e9;
      for (const e of app.pressedKeys) if (e.key === 'Enter' || e.key === ' ') this.shown = 1e9;
      app.text('click to skip', P.x + P.w - 28, P.y + P.h - 30, { size: 12, ui: true, align: 'right', italic: true, color: 'rgba(43,30,26,.45)' });
      return;
    }

    if (this.result !== null && this.result !== undefined) { this.drawResult(app, ix, iw, y); return; }

    // choices
    const choices = RUN.eventChoices(run);
    choices.forEach((c, idx) => {
      const sub = c.text ? app.wrap(c.text, iw - 36, 15, { ui: true }) : [];
      const h = 22 + 28 + sub.length * 19 + (c.ok ? 6 : 22);
      const x = ix, w = iw;
      const over = c.ok && !this.picker && app.inRect(x, y, w, h);
      g.save();
      app.rr(x, y + (over ? -2 : 0), w, h, 8);
      g.fillStyle = !c.ok ? 'rgba(43,30,26,.10)' : over ? 'rgba(179,38,58,.20)' : 'rgba(43,30,26,.12)'; g.fill();
      g.lineWidth = over ? 2.8 : 1.8; g.strokeStyle = !c.ok ? 'rgba(43,30,26,.3)' : over ? COL.scar : 'rgba(43,30,26,.6)'; if (!c.ok) g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
      g.restore();
      // number tab
      app.text(String(idx + 1), x + 18, y + 13, { size: 20, bold: true, color: c.ok ? COL.scar : 'rgba(43,30,26,.35)', align: 'center' });
      app.text(c.label, x + 36, y + 11, { size: 22, bold: true, color: c.ok ? COL.ink : 'rgba(43,30,26,.45)' });
      sub.forEach((ln, k) => app.text(ln, x + 36, y + 42 + k * 19, { size: 15, ui: true, color: c.ok ? 'rgba(43,30,26,.8)' : 'rgba(43,30,26,.4)' }));
      if (!c.ok) app.text(this.reasonFor(run, c, ev), x + 36, y + h - 22, { size: 14, ui: true, bold: true, color: 'rgba(150,40,50,.85)' });
      else if (c.pick === 'card') app.text('Choose a card', x + w - 14, y + 14, { size: 13, ui: true, italic: true, align: 'right', color: 'rgba(43,30,26,.6)' });
      if (over) app.cursor = 'pointer';
      let fire = false;
      if (c.ok && !this.picker && !this.busy) {
        if (over && mouse.released && mouse.pressStart && app.inRect(x, y, w, h)) { fire = true; if (app.onClick) app.onClick(); }
        if (app.pressedKeys.some((e) => e.key === String(idx + 1))) fire = true;
      }
      if (fire) this.pick(app, c, run);
      y += h + 12;
    });
  },
  pick(app, c, run) {
    if (c.pick === 'card') {
      const cards = (c.cards || []).map((u) => run.deck.find((d) => d.uid === u)).filter(Boolean);
      if (!cards.length) { if (app.shared.audio) app.shared.audio.sfx('error'); return; }
      this.picker = { i: c.i, cards, scroll: 0, label: c.label, text: c.text, f: app.frame }; this.pickScroll = 0;
    } else this.choose(app, c.i);
  },
  drawResult(app, ix, iw, y) {
    const g = app.ctx, P = PANEL;
    const text = String(this.result);
    const lines = app.wrap(text, iw - 40, 22, { italic: true });
    const h = lines.length * 30 + 44;
    app.rr(ix, y, iw, h, 8); g.fillStyle = 'rgba(179,38,58,.08)'; g.fill();
    g.strokeStyle = COL.scar; g.lineWidth = 2; g.setLineDash([9, 6]); g.stroke(); g.setLineDash([]);
    let left = Math.floor(this.resultShown);
    lines.forEach((ln, i) => { const n = Math.max(0, Math.min(ln.length, left)); left -= ln.length + 1; if (n > 0) app.text(ln.slice(0, n), ix + 20, y + 22 + i * 30, { size: 22, italic: true, color: COL.ink }); });
    if (this.resultShown < text.length) { if (!app.blocked && app.mouse.released) this.resultShown = 1e9; return; }
    const by = Math.min(y + h + 26, P.y + P.h - 90);
    if (app.button('Continue', ix + iw - 240, by, 240, 56, { size: 24, fill: '#5a1a22', stroke: COL.scar, key: 'enter' })) this.cont(app);
    if (app.pressedKeys.some((e) => e.key === ' ')) this.cont(app);
  },
  drawPicker(app, run, ev) {
    const g = app.ctx, mouse = app.mouse, pk = this.picker;
    const blocked0 = app.blocked;
    g.fillStyle = 'rgba(8,6,5,.88)'; g.fillRect(0, 0, W, H);
    app.text(pk.label, 640, 22, { size: 34, bold: true, align: 'center' });
    app.text(pk.text || 'Choose a card.', 640, 64, { size: 16, ui: true, align: 'center', color: 'rgba(232,220,196,.75)', maxW: 800 });
    const sc = 0.56, cw = CARD_W * sc, ch = CARD_H * sc, gap = 16, per = Math.max(1, Math.floor((W - 120 + gap) / (cw + gap)));
    const rows = Math.ceil(pk.cards.length / per);
    const gridW = per * cw + (per - 1) * gap, gx = (W - gridW) / 2;
    const viewTop = 100, viewH = H - viewTop - 90;
    const contentH = rows * (ch + gap);
    const maxS = Math.max(0, contentH - viewH);
    if (mouse.wheel) pk.scroll += mouse.wheel * 0.6;
    pk.scroll = clamp(pk.scroll, 0, maxS);
    let hover = -1;
    g.save(); g.beginPath(); g.rect(0, viewTop, W, viewH); g.clip();
    pk.cards.forEach((inst, i) => {
      const cx = gx + (i % per) * (cw + gap) + cw / 2, cy = viewTop + Math.floor(i / per) * (ch + gap) + ch / 2 + 8 - pk.scroll;
      if (cy < viewTop - ch || cy > viewTop + viewH + ch) return;
      const over = mouse.y > viewTop && mouse.y < viewTop + viewH && Math.abs(mouse.x - cx) < cw / 2 && Math.abs(mouse.y - cy) < ch / 2;
      if (over) hover = i;
      let spec; try { spec = cardSpec(inst); } catch (e) { return; }
      drawCard(g, spec, cx, cy, { scale: sc * (over ? 1.07 : 1), glow: over ? 1 : 0, selected: over });
      if (over && pk.f !== app.frame && mouse.released && mouse.pressStart && Math.abs(mouse.pressStart.x - cx) < cw / 2 + 4) { if (app.onClick) app.onClick(); this.choose(app, pk.i, inst.uid); }
    });
    g.restore();
    if (hover >= 0) app.cursor = 'pointer';
    if (maxS > 0) { g.fillStyle = 'rgba(232,220,196,.15)'; g.fillRect(W - 24, viewTop, 5, viewH); g.fillStyle = 'rgba(232,220,196,.6)'; g.fillRect(W - 25, viewTop + (pk.scroll / maxS) * (viewH - 80), 7, 80); app.text('scroll for more', 640, H - 80, { size: 12, ui: true, align: 'center', color: 'rgba(232,220,196,.45)' }); }
    if (app.button('Cancel', 540, H - 62, 200, 46, { size: 20, key: 'escape' }) && pk.f !== app.frame) this.picker = null;
  },
};
