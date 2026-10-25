// Title screen: logo, menu, hero select (New Run), Daily Run, Credits. Owner: title/end/settings.
// States: 'menu' | 'select' | 'credits'. Keys come from app.pressedKeys (works in the browser and in headless tests).
import { COL, FONT, FONT_UI, EASE, W, H, rgba, clamp } from './core.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawPortrait } from '../art/heroes.js';
import { drawSchoolGlyph } from '../art/cards.js';
import * as RUN from '../engine/run.js';
import { HEROES, SCHOOLS, CARDS } from '../data/index.js';
import { heroUnlocked, maxAscension } from '../engine/meta.js';
import { loadRun } from '../engine/save.js';
import { hashSeed } from '../engine/rng.js';

export const VERSION = 'v1.0';
const HERO_ORDER = ['marrow', 'wick', 'odile'];
const TYPE_NAMES = { attack: 'Attack', skill: 'Skill', power: 'Power' };

const settingsOf = (app) => (app.shared.meta && app.shared.meta.settings) || {};
const calm = (app) => !!settingsOf(app).reducedMotion;
const todaySeed = () => RUN.dailySeed();

// ---------- small drawing helpers ----------
function padlock(g, x, y, s, col = '#9b8f7a') {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.arc(0, -8, 11, Math.PI, 0); g.lineTo(11, 0); g.moveTo(-11, -8); g.lineTo(-11, 0); g.stroke();
  g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(-17, -2, 34, 26, 4) : g.rect(-17, -2, 34, 26); g.fill();
  g.fillStyle = '#1A1614'; g.beginPath(); g.arc(0, 8, 4, 0, 6.283); g.fill(); g.fillRect(-1.5, 8, 3, 9);
  g.restore();
}
function stitchLine(g, x1, y1, x2, y2, o = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.floor(len / (o.step || 12)));
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux, s = o.size || 4;
  g.save(); g.strokeStyle = o.color || '#0E0E0E'; g.lineWidth = o.lw || 2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.beginPath();
  for (let i = 0; i <= n; i++) { const px = x1 + ux * (len * i / n), py = y1 + uy * (len * i / n); g.moveTo(px - nx * s, py - ny * s); g.lineTo(px + nx * s, py + ny * s); }
  g.stroke(); g.restore();
}
function staple(g, x, y, ang = 0, s = 1) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.strokeStyle = '#d6a94a'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14, -3); g.lineTo(-14, 3); g.lineTo(14, 3); g.lineTo(14, -3); g.stroke();
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.strokeStyle = '#fff1b8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-13, 1.5); g.lineTo(13, 1.5); g.stroke();
  g.restore();
}

// ---------- logo ----------
function drawLogo(app, cx, cy, k) {
  const g = app.ctx, t = app.t;
  const size = 132;
  g.save();
  g.font = `bold ${size}px ${FONT}`; g.textBaseline = 'alphabetic';
  const w1 = g.measureText('GRAFT').width, w2 = g.measureText('WORK').width;
  const gap = 30 * (1 - 0 * k) + (1 - k) * 220;
  const total = w1 + w2 + gap;
  const x1 = cx - total / 2, x2 = x1 + w1 + gap;
  const base = cy + size * 0.34;
  const bob = calm(app) ? 0 : Math.sin(t * 1.1) * 1.2;
  g.globalAlpha = clamp(k * 2, 0, 1);
  const half = (txt, x, y, rot, fill, edge) => {
    g.save(); g.translate(x, y + bob); g.rotate(rot);
    g.textAlign = 'left';
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(txt, 4, 6);
    g.lineWidth = 7; g.strokeStyle = edge; g.strokeText(txt, 0, 0);
    const gr = g.createLinearGradient(0, -size * 0.75, 0, 0); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]);
    g.fillStyle = gr; g.fillText(txt, 0, 0);
    // stitched incisions across the letters (clipped to a thin band, drawn on top of the glyphs)
    g.globalCompositeOperation = 'source-atop';
    g.restore();
  };
  half('GRAFT', x1, base, -0.012, ['#f3e8cf', '#c9b88f'], '#120d0b');
  half('WORK', x2, base + 4, 0.01, ['#e2c98a', '#a68a4c'], '#120d0b');
  g.globalCompositeOperation = 'source-over';
  // stitched seams cut through the letters
  const seamY = cy - 6 + bob;
  g.globalAlpha = clamp(k * 2 - 0.4, 0, 1);
  const seam = (x0, x3, y0, ang) => {
    g.save(); g.translate(x0, y0); g.rotate(ang); const L = x3 - x0;
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke();
    g.strokeStyle = '#0a0808'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke();
    g.lineWidth = 3; g.beginPath(); for (let x = 8; x < L; x += 16) { g.moveTo(x - 4, -13); g.lineTo(x + 4, 13); } g.stroke();
    g.strokeStyle = 'rgba(255,240,200,.25)'; g.lineWidth = 1; g.beginPath(); for (let x = 8; x < L; x += 16) { g.moveTo(x - 3, -12); g.lineTo(x + 3, 12); } g.stroke();
    g.restore();
  };
  seam(x1 + w1 * 0.1, x1 + w1 * 0.9, seamY - 4, -0.04);
  seam(x2 + w2 * 0.12, x2 + w2 * 0.88, seamY + 14, 0.035);
  // vertical join between the halves
  const jx = x1 + w1 + gap / 2;
  g.globalAlpha = clamp((k - 0.6) / 0.4, 0, 1);
  stitchLine(g, jx, base - size * 0.72, jx, base + 6, { size: 9, step: 13, lw: 3, color: '#0a0808' });
  staple(g, jx, base - size * 0.5, Math.PI / 2, 1.5);
  staple(g, jx, base - size * 0.16, Math.PI / 2, 1.5);
  g.restore();
  return { x1, x2, w1, w2, jx, base };
}

// ---------- scene ----------
function drawScene(app, st) {
  const g = app.ctx, t = app.t;
  drawBackground(g, 'title', t);
  const still = calm(app);
  // lamp cone (additive) swaying from the ceiling
  const sway = still ? 0 : Math.sin(t * 0.55) * 0.07;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(640, -20); g.rotate(sway);
  const gr = g.createLinearGradient(0, 0, 0, 760); gr.addColorStop(0, 'rgba(255,214,120,.30)'); gr.addColorStop(0.6, 'rgba(255,190,90,.08)'); gr.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(-34, 0); g.lineTo(34, 0); g.lineTo(430, 760); g.lineTo(-430, 760); g.closePath(); g.fill();
  g.restore();
  // lamp fixture
  g.save(); g.translate(640, -20); g.rotate(sway);
  g.strokeStyle = '#0c0a09'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 30); g.stroke();
  g.fillStyle = '#2b2622'; g.beginPath(); g.moveTo(-40, 62); g.quadraticCurveTo(-34, 30, 0, 28); g.quadraticCurveTo(34, 30, 40, 62); g.closePath(); g.fill();
  g.fillStyle = '#fbe39a'; g.shadowColor = '#ffd36a'; g.shadowBlur = 30; g.beginPath(); g.ellipse(0, 62, 40, 7, 0, 0, 6.283); g.fill();
  g.restore();
  // vignette
  const vg = g.createRadialGradient(640, 330, 220, 640, 360, 780); vg.addColorStop(0, 'rgba(8,6,5,0)'); vg.addColorStop(1, 'rgba(8,6,5,.78)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // stitched card silhouettes drifting
  if (!still || true) {
    for (const c of st.ghosts) {
      const p = still ? c.p0 : ((c.p0 + t * c.sp) % 1);
      const x = -120 + p * (W + 240), y = c.y + Math.sin(t * 0.4 + c.ph) * (still ? 0 : 18);
      g.save(); g.translate(x, y); g.rotate(c.rot + (still ? 0 : Math.sin(t * 0.3 + c.ph) * 0.08));
      g.globalAlpha = c.a * Math.sin(p * Math.PI);
      g.strokeStyle = '#e8dcc4'; g.lineWidth = 2; g.setLineDash([7, 6]);
      g.beginPath(); g.roundRect ? g.roundRect(-45 * c.s, -63 * c.s, 90 * c.s, 126 * c.s, 8) : g.rect(-45 * c.s, -63 * c.s, 90 * c.s, 126 * c.s); g.stroke();
      g.setLineDash([]); g.beginPath(); g.moveTo(-30 * c.s, 0); g.lineTo(30 * c.s, 0); g.stroke();
      g.restore();
    }
  }
  // dust in the light
  g.save();
  for (const d of st.dust) {
    const y = ((d.y0 - (still ? 0 : t * d.vy)) % 760 + 760) % 760 - 20;
    const x = d.x0 + (still ? 0 : Math.sin(t * d.fx + d.ph) * d.amp);
    const rel = (x - 640 - sway * y) / (30 + y * 0.52);
    const inCone = clamp(1 - Math.abs(rel), 0, 1);
    g.globalAlpha = 0.06 + inCone * 0.55 * (0.6 + 0.4 * Math.sin(t * 2 + d.ph));
    g.fillStyle = inCone > 0.3 ? '#ffe9ae' : '#9d927c';
    g.beginPath(); g.arc(x, y, d.r, 0, 6.283); g.fill();
  }
  g.restore();
}

// ---------- the screen ----------
export default {
  enter(app, params) {
    this.p = params || {};
    this.state = 'menu';
    this.logoK = 0; this.menuK = 0;
    app.sceneT = 0;
    this.seed = ''; this.seedFocus = false;
    this.hero = null; this.asc = 0;
    this.credK = 0; this.confirmAbandon = false; this.toast = null;
    this.ghosts = [{ p0: 0.15, sp: 0.012, y: 210, s: 1, rot: -0.2, ph: 0, a: 0.16 }, { p0: 0.7, sp: 0.008, y: 520, s: 0.75, rot: 0.25, ph: 2, a: 0.12 }, { p0: 0.4, sp: 0.016, y: 110, s: 0.55, rot: 0.1, ph: 4, a: 0.1 }];
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.dust = Array.from({ length: 70 }, () => ({ x0: rnd() * W, y0: rnd() * 760, vy: 4 + rnd() * 10, fx: 0.2 + rnd() * 0.6, amp: 6 + rnd() * 22, ph: rnd() * 6, r: 0.8 + rnd() * 1.8 }));
    const flow = app.shared.flow;
    this.hasSave = flow ? flow.hasSave() : false;
    this.saveInfo = this.hasSave ? this.readSave(app) : null;
    const a = app.shared.audio; if (a && a.mute) a.mute(!!settingsOf(app).muted);
    app.tween(this, { logoK: 1 }, calm(app) ? 1 : 1400, 'out', () => { if (a) a.sfx('graftAttach', { vol: 0.5 }); });
    app.tween(this, { menuK: 1 }, calm(app) ? 1 : 900, 'out');
    app.timers.push({ ms: calm(app) ? 1 : 1100, fn: () => {} });
  },
  leave(app) { app.clearTweens(this); },
  readSave(app) {
    try {
      const r = loadRun(); if (!r) return null;
      const h = HEROES[r.hero];
      return { hero: h ? h.name : r.hero, act: r.act, floor: (r.stats && r.stats.floors) || r.row + 1, hp: r.hp, maxHp: r.maxHp, asc: r.ascension, daily: !!r.daily, loop: r.loop };
    } catch { return null; }
  },
  update(app, dt) { if (!this.p) return; },
  go(app, state) { this.state = state; app.mouse.released = false; app.mouse.pressed = false; },
  openSelect(app, hero) {
    this.go(app, 'select'); this.selK = 0; app.tween(this, { selK: 1 }, calm(app) ? 1 : 350, 'out');
    const meta = app.shared.meta;
    this.hero = hero || (this.hero && heroUnlocked(meta, this.hero) ? this.hero : 'marrow'); this.asc = 0;
    this.seed = ''; this.seedFocus = false;
  },
  begin(app, opts) {
    const flow = app.shared.flow;
    const a = app.shared.audio; if (a) a.sfx('graftScar');
    flow.start(opts);
  },
  draw(app) {
    const g = app.ctx, meta = app.shared.meta, flow = app.shared.flow;
    drawScene(app, this);
    const logoY = this.state === 'menu' ? 170 : 62;
    const sc = this.state === 'menu' ? 1 : 0.42;
    g.save();
    if (sc !== 1) { g.translate(640, logoY); g.scale(sc, sc); g.translate(-640, -logoY); }
    drawLogo(app, 640, logoY, this.logoK);
    g.restore();
    if (this.state === 'menu') {
      app.text('Cut what you love. Stitch what you need.', 640, 262, { size: 22, italic: true, align: 'center', color: '#d9cba8', shadow: true, alpha: clamp((this.logoK - 0.6) * 3, 0, 1) });
    }
    // keys
    const keys = app.blocked ? [] : app.pressedKeys;
    if (this.state === 'menu') this.drawMenu(app, keys);
    else if (this.state === 'select') this.drawSelect(app, keys);
    else if (this.state === 'credits') this.drawCredits(app, keys);
    // corner: version + mute (always)
    app.text('GRAFTWORK ' + VERSION, 16, H - 26, { size: 13, ui: true, color: 'rgba(232,220,196,.45)' });
    const st = settingsOf(app);
    const mx = W - 54, my = H - 54;
    const over = app.inRect(mx, my, 38, 38);
    if (over) { app.cursor = 'pointer'; app.tooltip(st.muted ? 'Sound off' : 'Sound on', 'Click to toggle.'); }
    app.panel(mx, my, 38, 38, { r: 8, fill: over ? 'rgba(60,50,42,.9)' : 'rgba(26,22,20,.8)', stroke: over ? COL.lamp : 'rgba(232,220,196,.4)' });
    g.save(); g.strokeStyle = COL.vellum; g.fillStyle = COL.vellum; g.lineWidth = 2;
    g.beginPath(); g.moveTo(mx + 9, my + 15); g.lineTo(mx + 14, my + 15); g.lineTo(mx + 20, my + 9); g.lineTo(mx + 20, my + 29); g.lineTo(mx + 14, my + 23); g.lineTo(mx + 9, my + 23); g.closePath(); g.fill();
    if (st.muted) { g.strokeStyle = COL.scar; g.lineWidth = 3; g.beginPath(); g.moveTo(mx + 25, my + 14); g.lineTo(mx + 33, my + 24); g.moveTo(mx + 33, my + 14); g.lineTo(mx + 25, my + 24); g.stroke(); }
    else { g.beginPath(); g.arc(mx + 21, my + 19, 6, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(mx + 21, my + 19, 11, -0.9, 0.9); g.stroke(); }
    g.restore();
    if (app.clicked(mx, my, 38, 38)) {
      meta.settings = meta.settings || {}; meta.settings.muted = !meta.settings.muted;
      if (app.shared.audio && app.shared.audio.mute) app.shared.audio.mute(meta.settings.muted);
      flow.saveMeta();
    }
    if (this.toast && this.toast.t > 0) { this.toast.t -= app.dt; app.text(this.toast.msg, 640, H - 60, { size: 16, ui: true, align: 'center', color: COL.lamp, alpha: clamp(this.toast.t, 0, 1) }); }
  },

  // ---- menu ----
  drawMenu(app, keys) {
    const g = app.ctx, meta = app.shared.meta, flow = app.shared.flow;
    if (keys.some((e) => e.key === 'Escape') && this.confirmAbandon) this.confirmAbandon = false;
    const bw = 330, bh = 48, step = 56, x = 640 - bw / 2;
    let y = 306;
    const k = EASE.out(clamp(this.menuK, 0, 1));
    g.save(); g.globalAlpha = k;
    // dim plate behind menu for contrast
    const items = [];
    if (this.hasSave) items.push('continue');
    items.push('new', 'daily', 'codex', 'settings', 'credits');
    const plateH = items.length * step + 14 + (this.hasSave ? 14 : 0);
    app.panel(x - 22, y - 12, bw + 44, plateH, { r: 14, fill: 'rgba(14,11,10,.62)', stroke: 'rgba(232,220,196,.12)' });
    for (const id of items) {
      const yy = y + (1 - k) * 18;
      if (id === 'continue') {
        const s = this.saveInfo;
        const sub = s ? `${s.hero}, Act ${s.act}, Floor ${s.floor}, ${s.hp}/${s.maxHp} HP` : 'Resume your last run';
        if (app.button('Continue', x, yy, bw, bh + 12, { size: 24, fill: '#4a3a1d', stroke: COL.lamp, color: '#fbe9b0', sub, subColor: '#e3d3a4' })) { if (!flow.resume()) { this.hasSave = false; } }
        y += step + 14; continue;
      }
      if (id === 'new') {
        if (app.button('New Run', x, yy, bw, bh, { size: 22 })) { if (this.hasSave) { this.confirmAbandon = true; } else this.openSelect(app); }
      } else if (id === 'daily') {
        const seed = todaySeed(), hero = RUN.dailyHero(seed), played = meta.dailyPlayed === seed;
        const hn = HEROES[hero].name;
        const label = played ? 'Daily Run (played)' : 'Daily Run';
        if (app.inRect(x, yy, bw, bh)) {
          const mod = RUN.DAILY_MODS[hashStr(seed) % RUN.DAILY_MODS.length];
          app.tooltip(mod.name, `${hn}, seed ${seed}.\n${mod.text}`, { color: COL.lamp });
        }
        if (app.button(label, x, yy, bw, bh, { size: 22, sub: undefined, fill: played ? '#2a2623' : COL.slab2, color: played ? '#b9ad92' : COL.vellum })) {
          this.startDaily(app);
        }
      } else if (id === 'codex') { if (app.button('Codex', x, yy, bw, bh, { size: 22 })) flow.openCodex(); }
      else if (id === 'settings') { if (app.button('Settings', x, yy, bw, bh, { size: 22 })) flow.openSettings(); }
      else if (id === 'credits') { if (app.button('Credits', x, yy, bw, bh, { size: 22 })) { this.go(app, 'credits'); this.credK = 0; app.tween(this, { credK: 1 }, calm(app) ? 1 : 300, 'out'); } }
      y += step;
    }
    g.restore();
    // daily card on the right
    this.drawDailyCard(app, 930, 312);
    if (this.confirmAbandon) this.drawConfirm(app, 'Start a new run?', 'Your saved run will be replaced. This cannot be undone.', 'Replace saved run', () => { this.confirmAbandon = false; this.openSelect(app); }, () => { this.confirmAbandon = false; });
  },
  startDaily(app) {
    const meta = app.shared.meta, flow = app.shared.flow;
    const seed = todaySeed(), hero = RUN.dailyHero(seed);
    meta.dailyPlayed = seed; flow.saveMeta();
    this.begin(app, { hero, ascension: 0, seed, daily: seed });
  },
  drawDailyCard(app, x, y) {
    const g = app.ctx, meta = app.shared.meta;
    const seed = todaySeed(), hero = RUN.dailyHero(seed), mod = RUN.DAILY_MODS[hashStr(seed) % RUN.DAILY_MODS.length];
    const played = meta.dailyPlayed === seed, h = HEROES[hero];
    const k = EASE.out(clamp(this.menuK - 0.2, 0, 1) / 0.8);
    g.save(); g.globalAlpha = k; g.translate((1 - k) * 40, 0);
    app.panel(x, y, 300, 190, { r: 12, fill: 'rgba(14,11,10,.72)', stroke: played ? 'rgba(232,220,196,.25)' : rgba(COL.lamp, 0.55) });
    app.text("TODAY'S CASE", x + 16, y + 12, { size: 13, ui: true, bold: true, color: COL.lamp });
    app.text(seed.replace('daily-', ''), x + 284, y + 12, { size: 13, ui: true, align: 'right', color: 'rgba(232,220,196,.6)' });
    drawPortrait(g, hero, x + 16 + 32, y + 66, 64);
    app.text(h.name, x + 100, y + 38, { size: 22, bold: true });
    app.text(h.title, x + 100, y + 64, { size: 14, italic: true, color: '#cdbf9d' });
    stitchLine(g, x + 16, y + 106, x + 284, y + 106, { color: 'rgba(232,220,196,.25)', size: 3, step: 10, lw: 1 });
    app.text(mod.name, x + 16, y + 116, { size: 17, bold: true, color: '#f0d27a' });
    app.text(mod.text, x + 16, y + 140, { size: 14, ui: true, maxW: 268, color: '#d9cba8' });
    if (played) {
      g.save(); g.translate(x + 238, y + 62); g.rotate(-0.2); g.strokeStyle = COL.scar; g.lineWidth = 2; g.strokeRect(-40, -13, 80, 26);
      app.text('PLAYED', 0, -8, { size: 14, bold: true, ui: true, align: 'center', color: COL.scar }); g.restore();
    }
    g.restore();
  },
  drawConfirm(app, title, body, yes, onYes, onNo) {
    const g = app.ctx;
    g.save(); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, W, H); g.restore();
    const x = 400, y = 260, w = 480, h = 200;
    app.panel(x, y, w, h, { r: 14, fill: 'rgba(20,16,14,.98)', stroke: COL.lamp });
    app.text(title, 640, y + 22, { size: 26, bold: true, align: 'center' });
    app.text(body, 640, y + 66, { size: 16, ui: true, align: 'center', maxW: 420, color: '#d9cba8' });
    app.blocked = false;
    if (app.button(yes, x + 24, y + 134, 260, 44, { size: 18, fill: '#4a2323', stroke: COL.scar })) onYes();
    if (app.button('Cancel', x + 300, y + 134, 156, 44, { size: 18 })) onNo();
    if (app.pressedKeys.some((e) => e.key === 'Escape')) onNo();
  },

  // ---- hero select ----
  drawSelect(app, keys) {
    const g = app.ctx, meta = app.shared.meta;
    const k = EASE.out(clamp(this.selK, 0, 1));
    g.save(); const dg = g.createLinearGradient(0, 0, 0, 130); dg.addColorStop(0, 'rgba(8,6,5,.0)'); dg.addColorStop(1, 'rgba(8,6,5,.55)'); g.fillStyle = dg; g.fillRect(0, 0, W, 130); g.fillStyle = 'rgba(8,6,5,.55)'; g.fillRect(0, 130, W, H - 130); g.restore();
    app.text('Choose your grafter', 640, 112, { size: 26, align: 'center', bold: true, alpha: k });
    const pw = 380, ph = 352, gap = 20, px0 = (W - (pw * 3 + gap * 2)) / 2, py = 148;
    HERO_ORDER.forEach((id, i) => {
      const h = HEROES[id]; if (!h) return;
      const px = px0 + i * (pw + gap), yy = py + (1 - k) * 30 * (i + 1) / 3;
      this.drawHeroPanel(app, h, px, yy, pw, ph, i);
    });
    // lower row
    const ly = 536;
    const unlocked = heroUnlocked(meta, this.hero);
    const maxA = Math.min(10, maxAscension(meta, this.hero) + 1);
    this.asc = clamp(this.asc, 0, maxA);
    // seed
    app.text('SEED (optional)', px0, ly, { size: 12, ui: true, bold: true, color: COL.lamp });
    const sx = px0, sy = ly + 20, sw = 250, sh = 38;
    const sOver = app.inRect(sx, sy, sw, sh);
    if (app.clicked(sx, sy, sw, sh)) this.seedFocus = true; else if (app.mouse.released && !sOver) this.seedFocus = false;
    app.panel(sx, sy, sw, sh, { r: 6, fill: 'rgba(8,6,5,.8)', stroke: this.seedFocus ? COL.lamp : 'rgba(232,220,196,.35)' });
    if (sOver) app.cursor = 'text';
    const caret = this.seedFocus && Math.floor(app.t * 2) % 2 === 0 ? '|' : '';
    if (this.seed) app.text(this.seed + caret, sx + 12, sy + 8, { size: 18, ui: true });
    else app.text(this.seedFocus ? caret : 'random', sx + 12, sy + 9, { size: 16, ui: true, italic: true, color: 'rgba(232,220,196,.4)' });
    for (const e of keys) {
      if (e.key === 'Backspace') { this.seed = this.seed.slice(0, -1); this.seedFocus = true; }
      else if (e.key.length === 1 && /[a-zA-Z0-9_-]/.test(e.key) && !e.ctrlKey && !e.metaKey && this.seed.length < 20) { this.seed += e.key; this.seedFocus = true; }
    }
    // ascension
    const ax = px0 + 290;
    app.text('ASCENSION', ax, ly, { size: 12, ui: true, bold: true, color: COL.lamp });
    if (app.button('<', ax, ly + 20, 38, 38, { size: 22, disabled: this.asc <= 0 })) this.asc--;
    app.text(String(this.asc), ax + 62, ly + 22, { size: 30, bold: true, align: 'center', color: this.asc ? '#ff9a7a' : COL.vellum });
    if (app.button('>', ax + 86, ly + 20, 38, 38, { size: 22, disabled: this.asc >= maxA })) this.asc++;
    if (maxA < 10 && this.asc >= maxA) app.text('Clear this level to open the next.', ax, ly + 64, { size: 12, ui: true, italic: true, color: 'rgba(232,220,196,.5)', maxW: 130 });
    // cumulative modifiers
    const tx = ax + 150, tw = W - px0 - tx;
    const lines = RUN.ASCENSION_TEXT.slice(1, this.asc + 1);
    app.panel(tx - 10, ly - 2, tw + 10, 134, { r: 8, fill: 'rgba(8,6,5,.55)', stroke: 'rgba(232,220,196,.15)' });
    if (!lines.length) app.text('Ascension 0: ' + RUN.ASCENSION_TEXT[0], tx, ly + 8, { size: 14, ui: true, color: 'rgba(232,220,196,.6)' });
    else {
      const col = lines.length > 5 ? 2 : 1, cw = col === 2 ? tw / 2 - 6 : tw - 12;
      lines.forEach((ln, i) => {
        const cx = tx + Math.floor(i / 5) * (tw / 2), cy = ly + 6 + (i % 5) * 24, last = i === lines.length - 1;
        app.text(`${i + 1}`, cx, cy, { size: 13, ui: true, bold: true, color: last ? '#ff9a7a' : '#a58f6b' });
        app.text(ln, cx + 20, cy, { size: 13, ui: true, color: last ? '#ffe2d6' : '#cdbf9d', maxW: cw - 24, lineH: 14 });
      });
    }
    // buttons
    const by = ly + 70;
    if (app.button('Back', px0, by, 120, 44, { size: 18 })) this.go(app, 'menu');
    if (app.button('Begin', px0 + 134, by, 116, 44, { size: 22, fill: unlocked ? '#4a3a1d' : undefined, stroke: COL.lamp, disabled: !unlocked, color: '#fbe9b0' }) || (!app.blocked && keys.some((e) => e.key === 'Enter') && unlocked)) {
      const opts = { hero: this.hero, ascension: this.asc };
      if (this.seed.trim()) opts.seed = this.seed.trim();
      this.begin(app, opts);
    }
    if (keys.some((e) => e.key === 'Escape')) this.go(app, 'menu');
    if (keys.some((e) => e.key === 'ArrowRight' && !this.seedFocus)) { }
  },
  drawHeroPanel(app, h, x, y, w, ph, idx) {
    const g = app.ctx, meta = app.shared.meta;
    const locked = !heroUnlocked(meta, h.id), sel = this.hero === h.id;
    const over = app.inRect(x, y, w, ph);
    const school = SCHOOLS[h.school];
    const col = locked ? '#6d655a' : h.color;
    if (over && !locked) app.cursor = 'pointer';
    if (app.clicked(x, y, w, ph) && !locked) { this.hero = h.id; this.asc = clamp(this.asc, 0, Math.min(10, maxAscension(meta, h.id) + 1)); if (app.shared.audio) app.shared.audio.sfx('uiClick'); }
    g.save();
    if (sel) { g.shadowColor = h.color; g.shadowBlur = 24; }
    app.panel(x, y, w, ph, { r: 14, fill: locked ? 'rgba(20,18,17,.9)' : 'rgba(24,19,17,.94)', stroke: sel ? h.color : over && !locked ? 'rgba(232,220,196,.6)' : 'rgba(232,220,196,.22)', lw: sel ? 3 : 2 });
    g.restore();
    // header band
    g.save(); app.rr(x + 3, y + 3, w - 6, 74, 11); g.clip();
    const bg = g.createLinearGradient(x, y, x + w, y); bg.addColorStop(0, rgba(col, locked ? 0.1 : 0.42)); bg.addColorStop(1, rgba(col, 0.04)); g.fillStyle = bg; g.fillRect(x, y, w, 80);
    g.restore();
    // portrait
    g.save();
    if (locked) g.globalAlpha = 0.28;
    const sway = sel && !calm(app) ? Math.sin(app.t * 1.5) * 2 : 0;
    drawPortrait(g, h.id, x + 54, y + 40 + sway, 66);
    g.restore();
    if (locked) { padlock(g, x + 54, y + 44, 0.9); }
    // name block
    app.text(h.name, x + 108, y + 12, { size: 28, bold: true, color: locked ? '#8c8372' : COL.vellum, shadow: true });
    app.text(h.title, x + 108, y + 46, { size: 15, italic: true, color: locked ? '#6d655a' : '#d6c7a6' });
    // school badge (shape glyph + name)
    drawSchoolGlyph(g, h.school, x + w - 34, y + 30, 11, locked ? '#6d655a' : school.color);
    app.text(school.name, x + w - 34, y + 46, { size: 11, ui: true, bold: true, align: 'center', color: locked ? '#6d655a' : school.color });
    if (locked) {
      app.text('LOCKED', x + 108, y + 62, { size: 12, ui: true, bold: true, color: '#8c8372' });
      app.text(h.unlock ? h.unlock.text : 'Locked.', x + 24, y + 104, { size: 17, color: '#9b8f7a', maxW: w - 48, italic: true });
      app.text(h.blurb, x + 24, y + 190, { size: 14, color: '#6d655a', maxW: w - 48 });
      return;
    }
    // blurb + passive
    let yy = y + 92;
    yy += app.text(h.blurb, x + 20, yy, { size: 14, maxW: w - 40, color: '#e0d4b8', lineH: 17 }) + 8;
    stitchLine(g, x + 20, yy, x + w - 20, yy, { color: rgba(h.color, 0.55), size: 3, step: 10, lw: 1 });
    yy += 8;
    app.text('PASSIVE', x + 20, yy, { size: 11, ui: true, bold: true, color: h.color });
    yy += 14;
    yy += app.text(h.passive, x + 20, yy, { size: 14, maxW: w - 40, color: '#fbe9b0', lineH: 17 }) + 4;
    const hp = h.perks && h.perks.hp, gold = h.perks && h.perks.gold;
    app.text(`${hp} HP    ${gold} gold`, x + 20, yy, { size: 13, ui: true, color: '#b7aa8c' });
    yy += 26;
    // starter deck
    const counts = {}, types = { attack: 0, skill: 0, power: 0 };
    for (const id of h.deck) { counts[id] = (counts[id] || 0) + 1; const t = CARDS[id] && CARDS[id].type; if (types[t] !== undefined) types[t]++; }
    app.text(`STARTER DECK  ${h.deck.length}`, x + 20, yy, { size: 11, ui: true, bold: true, color: h.color });
    let tx = x + w - 20;
    for (const t of ['power', 'skill', 'attack']) {
      const s = `${types[t]} ${TYPE_NAMES[t]}`; const wd = app.measure(s, 11, { ui: true });
      tx -= wd; app.text(s, tx, yy, { size: 11, ui: true, color: COL[t] === '#8C2F2F' ? '#e08a8a' : t === 'skill' ? '#8fb7c9' : '#b79ad6' }); tx -= 12;
    }
    yy += 17;
    const ids = Object.keys(counts);
    ids.forEach((id, i) => {
      const cx = x + 20 + (i % 2) * ((w - 40) / 2), cy = yy + Math.floor(i / 2) * 18;
      const c = CARDS[id];
      g.save(); g.fillStyle = c ? (COL[c.type] || '#888') : '#888'; g.fillRect(cx, cy + 3, 4, 11); g.restore();
      app.text(`${counts[id]}x ${c ? c.name : id}`, cx + 10, cy, { size: 13, ui: true, color: '#d9cba8' });
    });
    if (sel) { app.text('SELECTED', x + w - 20, y + ph - 22, { size: 11, ui: true, bold: true, align: 'right', color: h.color }); }
  },

  // ---- credits ----
  drawCredits(app, keys) {
    const g = app.ctx, k = EASE.out(clamp(this.credK, 0, 1));
    g.save(); g.fillStyle = 'rgba(0,0,0,.66)'; g.fillRect(0, 0, W, H); g.restore();
    const w = 700, h = 500, x = 640 - w / 2, y = 110 + (1 - k) * 24;
    g.save(); g.globalAlpha = k;
    app.panel(x, y, w, h, { r: 16, fill: 'rgba(20,16,14,.98)', stroke: 'rgba(232,220,196,.45)' });
    app.text('Credits', 640, y + 20, { size: 32, bold: true, align: 'center' });
    stitchLine(g, x + 40, y + 66, x + w - 40, y + 66, { color: 'rgba(232,220,196,.3)', size: 4, step: 12, lw: 1.5 });
    const rows = [
      ['Rules and run structure', 'The lead programmer, who counts weight for a living.'],
      ['Cards, grafts, enemies, relics, events', 'The content authors, one hand per file, no one else\'s scalpel.'],
      ['Screens and interface', 'The UI programmers. Everything is drawn, nothing is pasted.'],
      ['Canvas art', 'The art team. No image files were harmed.'],
      ['Synthesized audio', 'The audio team. Every sound is arithmetic.'],
      ['Meta, unlocks and records', 'The progression programmers.'],
      ['The design council', 'Creative director, game designer, systems designer, narrative director, art director, audio director, technical director. They approved the Budget, and regret nothing.'],
    ];
    let yy = y + 82;
    for (const [a, b] of rows) {
      app.text(a, x + 40, yy, { size: 15, ui: true, bold: true, color: COL.lamp });
      yy += 20;
      yy += app.text(b, x + 40, yy, { size: 15, maxW: w - 80, color: '#e0d4b8', lineH: 19 }) + 12;
    }
    app.text('Cut what you love. Stitch what you need.', 640, y + h - 96, { size: 17, italic: true, align: 'center', color: '#d9cba8' });
    if (app.button('Close', 640 - 70, y + h - 60, 140, 42, { size: 18 }) || keys.some((e) => e.key === 'Escape')) this.go(app, 'menu');
    g.restore();
  },
};

const hashStr = hashSeed;
