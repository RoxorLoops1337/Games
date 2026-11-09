// Settings modal (app.push('settings')). Persists into app.shared.meta.settings, then flow.saveMeta().
// Flags other screens may read from app.shared.meta.settings:
//   master/sfx/music 0..1, muted bool, screenShake bool (default true), reducedMotion bool (default false), fastWalk bool (default false; the Ward's F button, halves the hero's walk pacing),
//   colorblind bool (add pattern/shape cues), textScale 100|125|150 (textSize 'normal'|'large' is kept in sync for old readers),
//   quality 'off'|'low'|'high' (effects), fullscreen bool (last known state).
import { defaultQuality } from './fx.js';
import { cleanGraphics } from './quality.js';
import { COL, W, H, EASE, clamp, rgba } from './core.js';
import { A11Y_DEFAULTS, CB_MODES, a11yOf } from './a11y.js';
import { clearRun } from '../engine/save.js';
import { canFullscreen, isFullscreen, isIPhone, fsRegisterRect, requestFs } from './fullscreen.js';
import { installAvailable, install } from './install.js';
import { lnw } from '../art/linework.js';

export const DEFAULTS = { master: 0.8, sfx: 0.8, music: 0.35, muted: false, screenShake: true, reducedMotion: false, fastWalk: false, colorblind: false, textSize: 'normal', textScale: 100, quality: 'high', graphics: 'auto', fullscreen: false };
export const TEXT_STEPS = [100, 125, 150, 175];
export const QUALITY = ['off', 'low', 'high'];

export function settingsOf(app) {
  const meta = app.shared.meta;
  if (!meta.settings || typeof meta.settings !== 'object') meta.settings = {};
  const s = meta.settings;
  for (const k of Object.keys(A11Y_DEFAULTS)) if (s[k] === undefined) s[k] = A11Y_DEFAULTS[k];
  if (!TEXT_STEPS.includes(s.textScale)) s.textScale = s.textSize === 'large' || s.largeText ? 125 : 100;
  for (const k of Object.keys(DEFAULTS)) if (s[k] === undefined && k !== 'quality') s[k] = DEFAULTS[k];
  if (!QUALITY.includes(s.quality)) s.quality = defaultQuality();
  s.graphics = cleanGraphics(s.graphics);
  return s;
}

export default {
  calm() { return true; }, // only ambient motion: the frame governor may idle it at 30 fps after 4 s without input (ui/quality.js)
  enter(app) {
    this.k = 0; this.foc = 0; this.kb = false; this.rows = []; this.drag = null; this.reset = 0; this.fresh = true;
    settingsOf(app);
    app.tween(this, { k: 1 }, settingsOf(app).reducedMotion ? 1 : 220, 'out');
  },
  leave(app) { app.clearTweens(this); },
  persist(app) { app.shared.flow.saveMeta(); },
  applyAudio(app) {
    const s = settingsOf(app), a = app.shared.audio;
    if (a) { a.setVolumes({ master: s.master, sfx: s.sfx, music: s.music }); if (a.mute) a.mute(s.muted); }
  },
  close(app) { if (app.shared.audio) app.shared.audio.sfx('uiBack'); app.pop(); },
  draw(app) {
    const g = app.ctx, s = settingsOf(app);
    const prevRows = this.rows || []; this.rows = [];
    if (this.fresh) { app.mouse.released = false; app.mouse.pressed = false; this.fresh = false; }
    const live = app.top() === this;
    const k = EASE.out(clamp(this.k, 0, 1));
    g.save(); g.fillStyle = `rgba(6,4,3,${0.72 * k})`; g.fillRect(0, 0, W, H); g.restore();
    const w = 600, h = installAvailable() ? 690 : 686, x = 640 - w / 2, y = 14 + (1 - k) * 20;
    g.save(); g.globalAlpha = k;
    app.panel(x, y, w, h, { r: 16, fill: 'rgba(22,18,16,.98)', stroke: 'rgba(232,220,196,.5)', lw: 2.5 });
    app.text('Settings', x + 32, y + 22, { size: 32, bold: true });
    // close X
    const cx = x + w - 54, cy = y + 16, over = app.inRect(cx, cy, 38, 38);
    app.panel(cx, cy, 38, 38, { r: 8, fill: over ? 'rgba(90,40,40,.9)' : 'rgba(40,32,28,.9)', stroke: over ? COL.scar : 'rgba(232,220,196,.4)' });
    g.save(); g.strokeStyle = COL.vellum; g.lineWidth = lnw(3); g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + 11, cy + 11); g.lineTo(cx + 27, cy + 27); g.moveTo(cx + 27, cy + 11); g.lineTo(cx + 11, cy + 27); g.stroke(); g.restore();
    if (over) app.cursor = 'pointer';
    if (app.clicked(cx, cy, 38, 38)) { this.close(app); g.restore(); return; }
    const sy0 = y + 70;
    // sliders
    const sliders = [['master', 'Master volume'], ['sfx', 'Sound effects'], ['music', 'Music']];
    sliders.forEach(([key, label], i) => this.slider(app, key, label, x + 32, sy0 + i * 40, w - 64, s));
    // toggles
    const toggles = [
      ['muted', 'Mute all sound', 'Silences everything. Volumes are kept.'],
      ['screenShake', 'Screen shake', 'Camera kick on heavy hits.'],
      ['reducedMotion', 'Reduced motion', 'Fewer particles, no flashes, no hit-stop, calmer menus.'],
      ['colorblind', 'Colorblind mode', 'Safe school palette plus pattern and shape cues on cards, statuses and the Thread rail.'],
      ['flashes', 'Screen flashes', 'Off removes every white or colored full-screen flash. Never more than 3 per second either way.'],
      ['highContrast', 'High contrast text', 'Dark outline behind all text.'],
    ];
    const ty0 = sy0 + 3 * 40 + 14;
    app.text('OPTIONS', x + 32, ty0 - 8, { size: 12, ui: true, bold: true, color: COL.lamp });
    const inst = installAvailable(), tst = inst ? 27 : 31, sst = inst ? 37 : 40; // an Install row needs room: the rows pack a little tighter while it shows
    toggles.forEach(([key, label, tip], i) => {
      const yy = ty0 + 14 + i * tst;
      const on = !!s[key];
      const tx = x + w - 32 - 64, hov = app.inRect(x + 32, yy, w - 64, tst - 1);
      this.reg(app, x + 32, yy, w - 64, tst - 1, label, tip, () => { s[key] = !s[key]; this.applyAudio(app); this.persist(app); });
      if (hov) { app.tooltip(label, tip); app.cursor = 'pointer'; }
      app.text(label, x + 32, yy + 9, { size: 20, color: hov ? '#fff' : COL.vellum });
      // switch
      g.save();
      app.rr(tx, yy + 6, 64, 28, 14); g.fillStyle = on ? '#6a8f4e' : '#3a322d'; g.fill();
      g.strokeStyle = on ? '#b6e08f' : 'rgba(232,220,196,.4)'; g.lineWidth = lnw(2); g.stroke();
      g.fillStyle = on ? '#f4ecd2' : '#9b8f7a'; g.beginPath(); g.arc(tx + (on ? 50 : 14), yy + 20, 10, 0, 6.283); g.fill();
      g.restore();
      app.text(on ? 'On' : 'Off', tx - 12, yy + 11, { size: 15, ui: true, align: 'right', color: on ? '#b6e08f' : '#8c8372' });
      if (app.clicked(x + 32, yy, w - 64, tst - 1) && live) {
        s[key] = !on;
        this.applyAudio(app); this.persist(app);
        if (app.shared.audio && !s.muted) app.shared.audio.sfx('uiClick');
      }
    });
    // reset
    const sy1 = ty0 + 14 + toggles.length * tst;
    this.segRow(app, 'Text size', 'Scales text where the layout allows it.', x + 32, sy1, w - 64, TEXT_STEPS.map((v) => [v, v + '%']), s.textScale, (v) => { s.textScale = v; s.textSize = v > 100 ? 'large' : 'normal'; this.persist(app); }, live);
    this.segRow(app, 'Colorblind palette', 'Deuteranopia, protanopia or tritanopia. Used when Colorblind mode is on.', x + 32, sy1 + sst, w - 64, CB_MODES.map((v) => [v, v.slice(0, 3).toUpperCase()]), s.colorblindMode, (v) => { s.colorblindMode = v; this.persist(app); }, live);
    this.segRow(app, 'Effects quality', 'Off: no glow or post effects. Low: light. High: everything.', x + 32, sy1 + sst * 2, w - 64, [['off', 'Off'], ['low', 'Low'], ['high', 'High']], s.quality, (v) => { s.quality = v; this.persist(app); }, live);
    this.segRow(app, 'Graphics', 'Auto adapts to how smooth the game runs on this device. High: always full detail. Low: lighter scene, no post effects, saves battery.', x + 32, sy1 + sst * 3, w - 64, [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']], s.graphics, (v) => { s.graphics = v; this.persist(app); }, live);
    this.fsRow(app, x + 32, sy1 + sst * 4, w - 64, s, live);
    if (inst) this.installRow(app, x + 32, sy1 + sst * 5, w - 64, live);
    const ry = sy1 + sst * (inst ? 6 : 5) + 14 - (inst ? 4 : 0);
    stitch(g, x + 32, ry - 8, x + w - 32, ry - 8);
    if (this.reset === 0) {
      if (app.button('Reset all progress', x + 32, ry + 4, 240, 40, { size: 17, fill: '#3a2020', stroke: 'rgba(179,38,58,.7)' })) this.reset = 1;
    } else if (this.reset === 1) {
      app.text('This erases unlocks, records and your saved run.', x + 32, ry + 2, { size: 14, ui: true, color: '#ff9a9a' });
      if (app.button('Continue', x + 32, ry + 26, 150, 38, { size: 16, fill: '#4a2323', stroke: COL.scar })) this.reset = 2;
      if (app.button('Cancel', x + 196, ry + 26, 110, 38, { size: 16 })) this.reset = 0;
    } else {
      app.text('Last chance. There is no undo.', x + 32, ry + 2, { size: 14, ui: true, bold: true, color: '#ff7a7a' });
      if (app.button('Erase everything', x + 32, ry + 26, 200, 38, { size: 16, fill: '#6a1f1f', stroke: COL.scar })) this.eraseAll(app);
      if (app.button('Cancel', x + 246, ry + 26, 110, 38, { size: 16 })) this.reset = 0;
    }
    if (this.done) { app.text(this.done, x + w - 32, ry + 14, { size: 14, ui: true, align: 'right', color: COL.good }); }
    g.restore();
    if (live) this.keys(app, prevRows);
    if (live && app.pressedKeys.some((e) => e.key === 'Escape')) { if (this.reset) this.reset = 0; else this.close(app); }
  },
  // Keyboard / gamepad rows: reg() records a row each frame (and draws the focus ring + tooltip), keys() acts on last frame's rows.
  reg(app, x, y, w, h, label, tip, act) {
    const i = this.rows.length; this.rows.push({ x, y, w, h, label, tip, act });
    if (this.kb && i === this.foc) {
      const g = app.ctx; g.save(); app.rr(x - 6, y - 2, w + 12, h + 4, 8); g.lineWidth = lnw(2.5); g.strokeStyle = '#ffe9a8'; g.setLineDash && g.setLineDash([6, 4]); g.stroke(); g.restore();
      app.tooltip(label, tip);
    }
  },
  keys(app, rows) {
    const n = rows.length; if (!n) return;
    for (const e of app.pressedKeys) {
      const k = e.key;
      if (k === 'ArrowDown' || (k === 'Tab' && !e.shiftKey)) { this.kb = true; this.foc = (this.foc + 1) % n; }
      else if (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) { this.kb = true; this.foc = (this.foc + n - 1) % n; }
      else if (this.kb && (k === 'ArrowLeft' || k === 'ArrowRight')) { const r = rows[this.foc % n]; if (r) r.act(k === 'ArrowRight' ? 1 : -1); }
      else if (this.kb && (k === 'Enter' || k === ' ')) { const r = rows[this.foc % n]; if (r) r.act(1); }
      else continue;
      if (app.shared.audio) app.shared.audio.sfx('uiHover', { vol: 0.3 });
    }
  },
  key(app, e) { return app.top() === this && ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key); },
  segRow(app, label, tip, x, y, w, opts, cur, set, live) {
    const g = app.ctx, bw = 64, gap = 6, total = opts.length * bw + (opts.length - 1) * gap, sx = x + w - total;
    if (app.inRect(x, y, sx - x - 8, 36)) app.tooltip(label, tip);
    app.text(label, x, y + 7, { size: 20 });
    this.reg(app, x, y, w, 36, label, tip, (d) => { const i = opts.findIndex((o) => o[0] === cur); const n = opts[(i + (d || 1) + opts.length) % opts.length][0]; set(n); });
    opts.forEach(([v, text], i) => {
      const bx = sx + i * (bw + gap), on = v === cur, over = live && app.inRect(bx, y + 2, bw, 32);
      if (over) app.cursor = 'pointer';
      g.save(); app.rr(bx, y + 2, bw, 32, 8); g.fillStyle = on ? '#6a8f4e' : over ? '#4a3f37' : '#3a322d'; g.fill();
      g.lineWidth = lnw(2); g.strokeStyle = on ? '#b6e08f' : 'rgba(232,220,196,.4)'; g.stroke(); g.restore();
      app.text(text, bx + bw / 2, y + 9, { size: 15, ui: true, bold: true, align: 'center', color: on ? '#f4ecd2' : '#c9bda1', fixed: true });
      if (live && app.clicked(bx, y + 2, bw, 32)) { if (v !== cur) set(v); if (app.shared.audio && !this.muted(app)) app.shared.audio.sfx('uiClick'); }
    });
  },
  muted(app) { return !!settingsOf(app).muted; },
  installRow(app, x, y, w, live) {
    const tip = 'Adds Graftwork to your home screen or app list. Plays fullscreen, works like an app.';
    app.text('Install app', x, y + 2, { size: 20 });
    app.text('Plays fullscreen, works like an app', x, y + 24, { size: 12, ui: true, color: '#9b8f7a', fixed: true, fit: { w: w - 150, lines: 1 } });
    const bx = x + w - 130, hov = live && app.inRect(x, y, w, 36);
    this.reg(app, x, y, w, 36, 'Install app', tip, () => { install(app); });
    if (hov) { app.cursor = 'pointer'; app.tooltip('Install app', tip); }
    app.panel(bx, y + 2, 130, 32, { r: 8, fill: hov ? '#4a3a1d' : '#3a2f1a', stroke: COL.lamp });
    app.text('Install', bx + 65, y + 7, { size: 17, bold: true, align: 'center', color: '#fbe9b0' });
    if (live && app.clicked(x, y, w, 36)) install(app);
  },
  fsRow(app, x, y, w, s, live) {
    const g = app.ctx, can = canFullscreen(), on = can && isFullscreen(), tx = x + w - 64;
    app.text('Fullscreen', x, y + 7, { size: 20, color: can ? COL.vellum : '#8c8372' });
    if (!can) { app.text(isIPhone() ? 'Add to Home Screen for fullscreen' : 'Not available here', x + w, y + 11, { size: 14, ui: true, align: 'right', color: '#8c8372', fixed: true }); return; }
    fsRegisterRect(app, x, y, w, 36);
    const hov = live && app.inRect(x, y, w, 36);
    this.reg(app, x, y, w, 36, 'Fullscreen', 'Shortcut: F', () => requestFs(app));
    if (hov) { app.cursor = 'pointer'; app.tooltip('Fullscreen', 'Shortcut: F'); }
    g.save(); app.rr(tx, y + 4, 64, 28, 14); g.fillStyle = on ? '#6a8f4e' : '#3a322d'; g.fill();
    g.strokeStyle = on ? '#b6e08f' : 'rgba(232,220,196,.4)'; g.lineWidth = lnw(2); g.stroke();
    g.fillStyle = on ? '#f4ecd2' : '#9b8f7a'; g.beginPath(); g.arc(tx + (on ? 50 : 14), y + 18, 10, 0, 6.283); g.fill(); g.restore();
    app.text(on ? 'On' : 'Off', tx - 12, y + 9, { size: 15, ui: true, align: 'right', color: on ? '#b6e08f' : '#8c8372' });
    if (live && app.clicked(x, y, w, 36)) requestFs(app);
  },
  slider(app, key, label, x, y, w, s) {
    const g = app.ctx, live = app.top() === this;
    const tx = x + 190, tw = w - 190 - 56, ty = y + 18;
    app.text(label, x, y + 6, { size: 20 });
    this.reg(app, x, y, w, 40, label, 'Left and Right change the volume.', (d) => { s[key] = clamp(Math.round((s[key] + (d || 1) * 0.05) * 100) / 100, 0, 1); this.applyAudio(app); this.persist(app); });
    const hit = [tx - 10, y, tw + 20, 40];
    const over = app.inRect(...hit);
    if (over) app.cursor = 'pointer';
    if (live && app.mouse.pressed && over) this.drag = key;
    if (this.drag === key) {
      if (app.mouse.down) {
        const v = Math.round(clamp((app.mouse.x - tx) / tw, 0, 1) * 100) / 100;
        if (v !== s[key]) { s[key] = v; this.applyAudio(app); }
      } else {
        this.drag = null; this.persist(app);
        if (app.shared.audio && key !== 'music') app.shared.audio.sfx('uiClick');
      }
    }
    const v = clamp(s[key], 0, 1);
    g.save();
    // seam track
    app.rr(tx, ty - 4, tw, 8, 4); g.fillStyle = '#0e0b0a'; g.fill();
    app.rr(tx, ty - 4, tw * v, 8, 4); g.fillStyle = s.muted ? '#6d655a' : COL.lamp; g.fill();
    g.strokeStyle = 'rgba(14,14,14,.7)'; g.lineWidth = lnw(1.5); g.beginPath();
    for (let i = 1; i < 20; i++) { const px = tx + (tw * i) / 20; g.moveTo(px, ty - 6); g.lineTo(px, ty + 6); }
    g.stroke();
    // staple thumb
    const hx = tx + tw * v;
    g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 6; g.fillStyle = over || this.drag === key ? '#ffe9a8' : '#d6a94a';
    app.rr(hx - 8, ty - 15, 16, 30, 4); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = '#fff1b8'; g.lineWidth = lnw(1.5); g.beginPath(); g.moveTo(hx - 3, ty - 9); g.lineTo(hx - 3, ty + 9); g.moveTo(hx + 3, ty - 9); g.lineTo(hx + 3, ty + 9); g.stroke();
    g.restore();
    app.text(Math.round(v * 100) + '%', x + w, y + 8, { size: 17, ui: true, align: 'right', color: '#d9cba8' });
  },
  eraseAll(app) {
    const meta = app.shared.meta, flow = app.shared.flow, keep = { ...settingsOf(app) };
    try { globalThis.localStorage && globalThis.localStorage.removeItem('graftwork_meta_v1'); } catch { /* ignore */ }
    const fresh = flow.META.loadMeta();
    for (const k of Object.keys(meta)) delete meta[k];
    Object.assign(meta, fresh, { settings: keep });
    clearRun();
    flow.saveMeta();
    this.reset = 0; this.done = 'Progress erased.';
    if (app.shared.audio) app.shared.audio.sfx('tithe');
    const t = app.stack.find((sc) => sc.name === 'title'); if (t) { t.hasSave = false; t.saveInfo = null; }
  },
};

function stitch(g, x1, y1, x2, y2) {
  g.save(); g.strokeStyle = 'rgba(232,220,196,.3)'; g.lineWidth = lnw(1.5); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  for (let x = x1; x < x2; x += 12) { g.moveTo(x, y1 - 3); g.lineTo(x, y1 + 3); }
  g.stroke(); g.restore();
}
