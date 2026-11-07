// EVENT screen (run.phase === 'event', run.pending = {kind:'event', id, result}).
// Left: a framed mood scene (procedural). Right: a parchment panel with the scene text (typewriter), choices, then the result.
import { glossTip, cardGlossTip } from './tooltips.js';
import { tscale, wrapLimit } from './graft_parts.js';
import { COL, EASE, W, H, clamp, lerp, rgba, FONT, FONT_UI } from './core.js';
import * as RUN from '../engine/run.js';
import { cardSpec } from '../engine/cards.js';
import { EVENTS, RELICS } from '../data/index.js';
import { Fx } from './fx.js';
import { drawEventPlate } from '../art/plates.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawCard, CARD_W, CARD_H } from '../art/cards.js';
import { drawHeart, drawCoin, drawRelic, drawEventSeal } from '../art/icons.js';
import { lnw } from '../art/linework.js';
import { eventSource } from './ward_kit.js';
import { drawCardZoom } from './card_zoom.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const FRAME = { x: 36, y: 40, w: 520, h: 560 };
const EV_BAND = { x: 576, y: 70, bottom: 700, dir: -1 }; // glossary tips open over the picture on the left, never over the choices
const PANEL = { x: 584, y: 64, w: 664, h: 632 }; // starts under the global Pause / Fullscreen zone (y 0..56)
const ACT_TINT = { 1: ['#1c2b24', '#4f7a5f', '#bfe3c8'], 2: ['#2b1d12', '#8a5a2b', '#ffd596'], 3: ['#1c1230', '#6b4fa0', '#f5e6a8'] };
const CHOICE_GUARD = 0.15; // s after the text is fully shown before a choice can be picked
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
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = lnw(2); g.strokeRect(x - 50 * s, y - 44 * s, 56 * s, 44 * s); g.strokeRect(x - 30 * s, y - 84 * s, 46 * s, 40 * s);
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

function drawScene(g, ev, act, t, rm) {
  const [dark, mid, light] = ACT_TINT[act] || ACT_TINT[1];
  const h = hash(ev.id);
  g.save();
  g.beginPath(); g.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h); g.clip();
  g.save(); g.translate(FRAME.x, FRAME.y); const sc = Math.max(FRAME.w / W, FRAME.h / H); g.scale(sc, sc); drawBackground(g, 'event', t); g.restore();
  // engraved plate (baked once per event and act: sepia wash, motif keyed by the event id, hatch veil, vignette, paper edge)
  drawEventPlate(g, ev.id, act, FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  // the one practical: a hanging lamp, its pool breathes unless motion is reduced
  const lx = FRAME.x + FRAME.w * (0.3 + ((h >> 3) % 40) / 100), ly = FRAME.y + 150;
  const flick = rm ? 1 : 1 + Math.sin(t * 7 + h) * 0.03 + Math.sin(t * 13.3) * 0.02;
  const lg = g.createRadialGradient(lx, ly, 6, lx, ly, 240 * flick); lg.addColorStop(0, rgba(light, 0.3)); lg.addColorStop(0.4, rgba(light, 0.08)); lg.addColorStop(1, rgba(light, 0));
  g.fillStyle = lg; g.fillRect(FRAME.x + 10, FRAME.y + 10, FRAME.w - 20, FRAME.h - 20);
  g.strokeStyle = '#2b1e1a'; g.lineWidth = lnw(2); g.beginPath(); g.moveTo(lx, FRAME.y + 12); g.lineTo(lx, ly - 10); g.stroke();
  g.beginPath(); g.arc(lx, ly, 8, 0, 6.283); g.fillStyle = light; g.fill(); g.lineWidth = lnw(2); g.strokeStyle = '#2b1e1a'; g.stroke();
  // drifting motes
  for (let i = 0; i < (rm ? 0 : 16); i++) {
    const px = FRAME.x + ((hash('m' + i + ev.id) % 1000) / 1000) * FRAME.w + Math.sin(t * 0.4 + i) * 12;
    const py = FRAME.y + FRAME.h - ((t * (10 + (i % 5) * 4) + (hash('n' + i) % 600)) % (FRAME.h));
    g.fillStyle = rgba(light, 0.22 + 0.15 * Math.sin(t * 2 + i)); g.beginPath(); g.arc(px, py, 1.5 + (i % 3) * 0.6, 0, 6.283); g.fill();
  }
  g.restore();
  // frame: stitched border and corner tabs
  g.save();
  g.lineWidth = lnw(8); g.strokeStyle = '#2b2018'; g.strokeRect(FRAME.x - 4, FRAME.y - 4, FRAME.w + 8, FRAME.h + 8);
  g.restore();
}

export default {
  enter(app, params) {
    const run = app.shared.run; this.run = run;
    this.fx = new Fx();
    this.picker = null; this.busy = false; this.heartPulse = 0; this.goldPulse = 0;
    this.shown = 0; this.t = 0; this.doneT = null; this.resultT = 0; this.resultShown = 0; this.pickScroll = 0; this.flash = null;
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
  // the parchment follows the text scale up to 125%
  draw(app) {
    const ts = app.textScale; app.textScale = Math.min(tscale(app), 1.25);
    try { this.drawEvent(app); } finally { app.textScale = ts; }
  },
  drawEvent(app) {
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
    drawScene(g, ev, run.act, app.t, reduced(app));
    this.drawHud(app, run);
    this.drawPanel(app, run, ev);
    g.restore();
    this.fx.draw(g); this.fx.drawFlash(g, W, H);
    if (this.picker) this.drawPicker(app, run, ev);
    if (this.gotRelic && RELICS[this.gotRelic]) {
      this.gotRelicT += app.dt; const r = RELICS[this.gotRelic];
      const a = clamp(this.gotRelicT < 0.3 ? this.gotRelicT / 0.3 : 1, 0, 1);
      app.reg('event-relic', FRAME.x + 60, FRAME.y + 150, FRAME.w - 120, 130, { overlay: true });
      g.save(); g.globalAlpha = a; app.panel(FRAME.x + 60, FRAME.y + 150, FRAME.w - 120, 130, { fill: 'rgba(14,12,10,.92)', stroke: COL.lamp, lw: 2.5 });
      drawRelic(g, this.gotRelic, FRAME.x + 110, FRAME.y + 205, 56);
      app.text('Relic gained', FRAME.x + 156, FRAME.y + 166, { size: 13, ui: true, bold: true, color: COL.lamp });
      app.text(r.name, FRAME.x + 156, FRAME.y + 184, { size: 22, bold: true });
      wrapLimit(app, r.text, FRAME.w - 240, 14, 3, { ui: true }).forEach((ln, q) => app.text(ln, FRAME.x + 156, FRAME.y + 210 + q * Math.round(17 * tscale(app)), { size: 14, ui: true, color: 'rgba(232,220,196,.8)' }));
      g.restore();
    }
  },
  drawHud(app, run) {
    const g = app.ctx;
    const y = FRAME.y + FRAME.h + 34;
    app.reg('event-hud', FRAME.x, y - 20, FRAME.w, 40, { group: 'hud' });
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
    const P = PANEL, ix = P.x + 36, iw = P.w - 72, k = tscale(app);
    app.reg('event-frame', FRAME.x, FRAME.y, FRAME.w, FRAME.h, { group: 'frame' });
    app.reg('event-panel', P.x, P.y, P.w, P.h, { group: 'panel' });
    // parchment
    g.save();
    app.rr(P.x + 4, P.y + 6, P.w, P.h, 10); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
    app.rr(P.x, P.y, P.w, P.h, 10);
    const pg = g.createLinearGradient(P.x, P.y, P.x + P.w, P.y + P.h); pg.addColorStop(0, '#e2d5b6'); pg.addColorStop(1, '#cbbb95'); g.fillStyle = pg; g.fill();
    g.strokeStyle = '#2b1e1a'; g.lineWidth = lnw(3); g.stroke();
    g.lineWidth = lnw(1.5); g.strokeStyle = 'rgba(43,30,26,.4)'; g.setLineDash([8, 6]); app.rr(P.x + 10, P.y + 10, P.w - 20, P.h - 20, 6); g.stroke(); g.setLineDash([]);
    g.restore();

    // title
    const src = this.run && this.run.mode === 'ward' ? eventSource(this.run.pending) : null; // Ward: which room and hour the event came from
    app.text(src ? `${src.head} (${src.lean})` : ev.act ? `ACT ${['', 'I', 'II', 'III'][ev.act]} EVENT` : 'EVENT', ix, P.y + 30, { size: 13, ui: true, bold: true, color: 'rgba(43,30,26,.55)', maxW: iw });
    const th = app.text(ev.name, ix, P.y + 48, { size: 36, bold: true, color: COL.ink, maxW: iw, lineH: 42 });
    let y = P.y + 48 + th + 8;
    g.strokeStyle = COL.scar; g.lineWidth = lnw(2.5); g.setLineDash([10, 7]); g.beginPath(); g.moveTo(ix, y); g.lineTo(ix + iw, y); g.stroke(); g.setLineDash([]);
    y += 20;

    // scene text, typewriter
    const TS = ev.text.length > 560 ? 15 : ev.text.length > 330 ? 18 : 21, TL = Math.max(Math.round((TS === 21 ? 29 : TS === 18 ? 25 : 21) * k), Math.ceil(app.sz(TS) * 1.2)); // pitch follows the real (phone-inflated) font size
    const storyY = y;
    const lines = app.wrap(ev.text, iw, TS, {});
    const total = ev.text.length;
    const shown = Math.min(total, Math.floor(this.shown));
    let left = shown;
    lines.forEach((ln, i) => {
      const n = Math.max(0, Math.min(ln.length, left)); left -= ln.length + 1;
      if (n > 0) app.text(ln.slice(0, n), ix, y + i * TL, { size: TS, color: this.result !== null ? 'rgba(43,30,26,.7)' : COL.ink });
    });
    const typing = shown < total;
    if (typing) this.doneT = null; else if (this.doneT == null) this.doneT = this.t; // choices arm 150 ms after the text is fully shown
    if (typing && Math.floor(app.t * 2) % 2 === 0) { // blinking quill mark
      app.text('|', ix + iw - 6, y + (lines.length - 1) * TL, { size: TS, color: COL.scar });
    }
    y += lines.length * TL + 16;
    const textEnd = y;
    if (!app.blocked && !this.picker && app.inRect(ix, storyY, iw, textEnd - storyY)) glossTip(app, '', [ev.text], { x: ix, y: storyY, w: iw, h: textEnd - storyY, band: EV_BAND });
    // click panel to finish the text
    if (typing) {
      if (!app.blocked && !this.picker && mouse.released && app.inRect(P.x, P.y, P.w, P.h)) this.shown = 1e9;
      for (const e of app.pressedKeys) if (e.key === 'Enter' || e.key === ' ') this.shown = 1e9;
      app.text('click to skip', P.x + P.w - 28, P.y + P.h - 34, { size: 14, ui: true, align: 'right', italic: true, color: 'rgba(43,30,26,.45)' });
      return;
    }

    if (this.result !== null && this.result !== undefined) { this.drawResult(app, ix, iw, y); return; }

    // choices
    const choices = RUN.eventChoices(run);
    const room = P.y + P.h - 16 - y, many = choices.length;
    const lp = Math.max(Math.round(19 * k), Math.round(app.sz(15, { ui: true }) * 1.22)); // real line pitch of the 15 px sub text (phones inflate it)
    const mk = (lim) => choices.map((c) => { const sub = c.text && lim ? wrapLimit(app, c.text, iw - 36, 15, lim, { ui: true }) : []; return { sub, h: Math.round((lim ? 50 : 38) * k * 0.9) + sub.length * lp + (c.ok ? 6 : Math.round(22 * k)) }; });
    let ms = mk(4); const tot = (a) => a.reduce((n, m) => n + m.h + 10, 0);
    if (tot(ms) > room) ms = mk(2);
    if (tot(ms) > room) ms = mk(1);
    const bare = tot(ms) > room; if (bare) { ms = mk(0); if (tot(ms) > room) { const hh = Math.max(30, Math.floor((room - choices.length * 10) / choices.length)); ms = ms.map((m) => ({ sub: [], h: hh })); } } // no room: labels only, the description moves into the hover tooltip
    choices.forEach((c, idx) => {
      const sub = ms[idx].sub;
      const h = ms[idx].h;
      const x = ix, w = iw;
      app.reg('event-choice' + idx, x, y - 2, w, h + 2, { group: 'panel' });
      const over = c.ok && !this.picker && app.inRect(x, y, w, h);
      g.save();
      app.rr(x, y + (over ? -2 : 0), w, h, 8);
      g.fillStyle = !c.ok ? 'rgba(43,30,26,.10)' : over ? 'rgba(179,38,58,.20)' : 'rgba(43,30,26,.12)'; g.fill();
      g.lineWidth = lnw(over ? 2.8 : 1.8); g.strokeStyle = !c.ok ? 'rgba(43,30,26,.3)' : over ? COL.scar : 'rgba(43,30,26,.6)'; if (!c.ok) g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
      g.restore();
      // number tab
      const cmp = h < 44, ly = cmp ? Math.max(2, Math.round((h - 16 * 1.22 * k) / 2)) : 10;
      drawEventSeal(g, x + 18, y + (cmp ? ly + 8 : 24), cmp ? 11 : 13, c.ok, over); // engraved wax roundel under the number
      app.text(String(idx + 1), x + 18, y + (cmp ? ly : 13), { size: cmp ? 16 : 20, bold: true, color: c.ok ? COL.scar : 'rgba(43,30,26,.35)', align: 'center' });
      app.text(wrapLimit(app, c.label, w - 190, 22, 1, { bold: true })[0], x + 36, y + ly, { size: cmp ? 16 : 22, bold: true, color: c.ok ? COL.ink : 'rgba(43,30,26,.45)' });
      sub.forEach((ln, kk) => app.text(ln, x + 36, y + Math.round(42 * k * 0.9) + kk * lp, { size: 15, ui: true, color: c.ok ? 'rgba(43,30,26,.8)' : 'rgba(43,30,26,.4)' }));
      if (!c.ok) app.text(this.reasonFor(run, c, ev), x + 36, y + h - Math.round(22 * k), { size: 14, maxW: w - 50, ui: true, bold: true, color: 'rgba(150,40,50,.85)' });
      else if (c.pick === 'card') app.text('Choose a card', x + w - 14, y + 14, { size: 13, ui: true, italic: true, align: 'right', color: 'rgba(43,30,26,.6)' });
      if (!this.picker && app.inRect(x, y, w, h)) { if (over) app.cursor = 'pointer'; if (bare && c.text) app.tooltip(c.label, c.text, { gloss: [c.label], anchor: { x, y, w, h, band: EV_BAND } }); else glossTip(app, '', [c.label, c.text || ''], { x, y, w, h, band: EV_BAND }); } // Boon, Price and result words: Gilt, Burn, Strain... each explained beside the choice
      let fire = false;
      if (c.ok && !this.picker && !this.busy && this.doneT != null && this.t - this.doneT >= CHOICE_GUARD) {
        if (over && mouse.released && mouse.pressStart && app.inRect(x, y, w, h)) { fire = true; if (app.onClick) app.onClick(); }
        if (app.pressedKeys.some((e) => e.key === String(idx + 1))) fire = true;
      }
      if (fire) this.pick(app, c, run);
      y += h + 10;
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
    const k = tscale(app), RL = Math.max(Math.round(30 * k), Math.ceil(app.sz(22, { italic: true }) * 1.2));
    const lines = app.wrap(text, iw - 40, 22, { italic: true });
    const h = lines.length * RL + 44;
    app.reg('event-result', ix, y, iw, h, { group: 'panel' });
    if (!app.blocked && app.inRect(ix, y, iw, h)) glossTip(app, '', [text], { x: ix, y, w: iw, h, band: EV_BAND });
    app.rr(ix, y, iw, h, 8); g.fillStyle = 'rgba(179,38,58,.08)'; g.fill();
    g.strokeStyle = COL.scar; g.lineWidth = lnw(2); g.setLineDash([9, 6]); g.stroke(); g.setLineDash([]);
    let left = Math.floor(this.resultShown);
    lines.forEach((ln, i) => { const n = Math.max(0, Math.min(ln.length, left)); left -= ln.length + 1; if (n > 0) app.text(ln.slice(0, n), ix + 20, y + 22 + i * RL, { size: 22, italic: true, color: COL.ink }); });
    if (this.resultShown < text.length) { if (!app.blocked && app.mouse.released) this.resultShown = 1e9; return; }
    const by = Math.min(y + h + 26, P.y + P.h - 76);
    app.reg('event-continue', ix + iw - 240, by, 240, 56, { group: 'panel' });
    if (app.button('Continue', ix + iw - 240, by, 240, 56, { size: 24, fill: '#5a1a22', stroke: COL.scar, key: 'enter' })) this.cont(app);
    if (app.pressedKeys.some((e) => e.key === ' ')) this.cont(app);
  },
  // The card picker (remove / upgrade / transform / choose): a full opaque screen, so the event under it never shows through.
  // Card size is chosen by pickerLayout(): the largest scale that shows every card (no scroll) but never under the readable size for this screen
  // (phones: about 0.58 device-independent scale, so the rules text is legible); a longer list scrolls (wheel, or a finger drag). A finger held on a card
  // (0.35 s) opens the big zoom face; lifting closes it without choosing.
  drawPicker(app, run, ev) {
    const g = app.ctx, mouse = app.mouse, pk = this.picker;
    app.reg('event-picker', 0, 0, W, H, { overlay: true });
    g.fillStyle = '#0b0807'; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 760); vg.addColorStop(0, 'rgba(60,44,34,.35)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const th = app.text(pk.label, 640, 14, { size: 30, bold: true, align: 'center', fit: { w: 960, lines: 1 } });
    app.text(pk.text || 'Choose a card.', 640, 14 + th + 2, { size: 16, ui: true, align: 'center', color: 'rgba(232,220,196,.75)', fit: { w: 960, lines: 2 } });
    const L = pickerLayout(app, pk.cards.length), { sc, cw, ch, gap, per, gx, viewTop, viewH, maxS } = L;
    pk.scroll = clamp((pk.scroll || 0) + (mouse.wheel ? mouse.wheel * 0.6 : 0), 0, maxS);
    const rowTop = (r) => viewTop + gap / 2 + r * (ch + gap) - pk.scroll + L.yoff;
    const zoomed = pk.zoom !== undefined && pk.zoom >= 0;
    let hover = -1;
    app.reg('scroll-picker', 0, viewTop, W, viewH, { overlay: true });
    g.save(); g.beginPath(); g.rect(0, viewTop, W, viewH); g.clip();
    pk.cards.forEach((inst, i) => {
      const cx = gx + (i % per) * (cw + gap) + cw / 2, top = rowTop(Math.floor(i / per)), cy = top + ch / 2;
      if (top > viewTop + viewH || top + ch < viewTop) return;
      const over = !zoomed && mouse.y > viewTop && mouse.y < viewTop + viewH && Math.abs(mouse.x - cx) < cw / 2 && Math.abs(mouse.y - cy) < ch / 2;
      if (over) hover = i;
      let spec; try { spec = cardSpec(inst); } catch (e) { return; }
      drawCard(g, spec, cx, cy, { scale: sc * (over && !mouse.touch ? 1.05 : 1), glow: over ? 1 : 0, selected: over && !mouse.touch });
      if (over && mouse.touch && mouse.down) { g.save(); app.rr(cx - cw / 2 - 2, cy - ch / 2 - 2, cw + 4, ch + 4, 8); g.lineWidth = 3; g.strokeStyle = COL.lamp; g.stroke(); g.restore(); }
      if (over && pk.f !== app.frame && mouse.released && mouse.pressStart && Math.abs(mouse.pressStart.x - cx) < cw / 2 + 4 && !pk.zoomed) { if (app.onClick) app.onClick(); this.choose(app, pk.i, inst.uid); }
    });
    g.restore();
    // hold to zoom (touch and mouse): the finger or button must stay on the same card, still, for HOLD_S
    if (hover >= 0 && mouse.down && !zoomed) {
      if (pk.hold && pk.hold.i === hover) { if (app.t - pk.hold.t0 >= PICK_HOLD_S && Math.abs(mouse.y - pk.hold.y) < 10) { pk.zoom = hover; pk.zoomed = true; } } else pk.hold = { i: hover, t0: app.t, y: mouse.y };
    } else if (!mouse.down) { pk.hold = null; }
    if (zoomed) {
      let spec = null; try { spec = cardSpec(pk.cards[pk.zoom]); } catch (e) { /* unreadable card */ }
      if (spec) drawCardZoom(app, spec, { hint: 'Release to close' });
      if (!mouse.down) { pk.zoom = undefined; app.mouse.released = false; pk.zoomedUntil = app.frame + 1; }
    } else if (pk.zoomed && !mouse.down) pk.zoomed = false;
    if (!zoomed && hover >= 0 && !mouse.touch) { app.cursor = 'pointer'; const hi = pk.cards[hover]; try { const cx0 = gx + (hover % per) * (cw + gap) + cw / 2, cy0 = rowTop(Math.floor(hover / per)) + ch / 2; cardGlossTip(app, cardSpec(hi), { x: cx0 - cw / 2, y: cy0 - ch / 2, w: cw, h: ch }); } catch (e) { /* unreadable card: no tip */ } }
    if (maxS > 0) {
      const sh = Math.max(40, viewH * viewH / (viewH + maxS)); g.fillStyle = 'rgba(232,220,196,.15)'; g.fillRect(W - 14, viewTop, 5, viewH); g.fillStyle = 'rgba(232,220,196,.6)'; g.fillRect(W - 15, viewTop + (pk.scroll / maxS) * (viewH - sh), 7, sh);
      if (pk.scroll < maxS - 1) app.text('Scroll for more. Hold a card to read it.', 640, viewTop + viewH + 4, { size: 12, ui: true, align: 'center', color: 'rgba(232,220,196,.6)', fit: { w: 600, lines: 1 } });
    } else app.text('Hold a card to read it.', 640, viewTop + viewH + 4, { size: 12, ui: true, align: 'center', color: 'rgba(232,220,196,.45)', fit: { w: 600, lines: 1 } });
    if (!zoomed && app.button('Cancel', 540, H - 52, 200, 40, { size: 20, key: 'escape' }) && pk.f !== app.frame) this.picker = null;
  },
};

const PICK_HOLD_S = 0.35;
// Pure layout of the picker grid (exported for tests). n cards in the stage space 1280x720.
export function pickerLayout(app, n) {
  const viewTop = 88, viewH = H - viewTop - 74, gap = 14, side = 28, availW = W - 2 * side;
  const s0 = app.scale > 0 ? app.scale : 1, want = clamp(0.58 / s0, 0.62, 1), maxS0 = app.scale < 0.95 ? 1 : 0.9;
  const shape = (sc) => { const cw = CARD_W * sc, ch = CARD_H * sc, per = Math.max(1, Math.min(n || 1, Math.floor((availW + gap) / (cw + gap)))), rows = Math.ceil((n || 1) / per); return { sc, cw, ch, per, rows, contentH: rows * (ch + gap) }; };
  let best = null;
  for (let sc = maxS0; sc >= 0.5; sc -= 0.02) { const q = shape(sc); if (q.contentH <= viewH) { best = q; break; } }
  const S = best && best.sc >= Math.min(want, maxS0) - 1e-6 ? best : shape(Math.min(want, maxS0)); // readable size first, scrolling when the list is longer
  const gridW = S.per * S.cw + (S.per - 1) * gap, maxS = Math.max(0, S.contentH - viewH);
  return { ...S, gap, gx: (W - gridW) / 2, viewTop, viewH, maxS, yoff: S.contentH < viewH ? (viewH - S.contentH) / 2 : 0 };
}
