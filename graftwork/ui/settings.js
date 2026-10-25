// Settings modal (app.push('settings')). Persists into app.shared.meta.settings, then flow.saveMeta().
// Flags other screens may read from app.shared.meta.settings:
//   master/sfx/music 0..1, muted bool, screenShake bool (default true), reducedMotion bool (default false),
//   colorblind bool (add pattern/shape cues), textSize 'normal' | 'large'.
import { COL, W, H, EASE, clamp, rgba } from './core.js';
import { clearRun } from '../engine/save.js';

export const DEFAULTS = { master: 0.8, sfx: 0.8, music: 0.35, muted: false, screenShake: true, reducedMotion: false, colorblind: false, textSize: 'normal' };

export function settingsOf(app) {
  const meta = app.shared.meta;
  if (!meta.settings || typeof meta.settings !== 'object') meta.settings = {};
  const s = meta.settings;
  for (const k of Object.keys(DEFAULTS)) if (s[k] === undefined) s[k] = DEFAULTS[k];
  return s;
}

export default {
  enter(app) {
    this.k = 0; this.drag = null; this.reset = 0; this.fresh = true;
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
    if (this.fresh) { app.mouse.released = false; app.mouse.pressed = false; this.fresh = false; }
    const live = app.top() === this;
    const k = EASE.out(clamp(this.k, 0, 1));
    g.save(); g.fillStyle = `rgba(6,4,3,${0.72 * k})`; g.fillRect(0, 0, W, H); g.restore();
    const w = 600, h = 560, x = 640 - w / 2, y = 80 + (1 - k) * 20;
    g.save(); g.globalAlpha = k;
    app.panel(x, y, w, h, { r: 16, fill: 'rgba(22,18,16,.98)', stroke: 'rgba(232,220,196,.5)', lw: 2.5 });
    app.text('Settings', x + 32, y + 22, { size: 32, bold: true });
    // close X
    const cx = x + w - 54, cy = y + 16, over = app.inRect(cx, cy, 38, 38);
    app.panel(cx, cy, 38, 38, { r: 8, fill: over ? 'rgba(90,40,40,.9)' : 'rgba(40,32,28,.9)', stroke: over ? COL.scar : 'rgba(232,220,196,.4)' });
    g.save(); g.strokeStyle = COL.vellum; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + 11, cy + 11); g.lineTo(cx + 27, cy + 27); g.moveTo(cx + 27, cy + 11); g.lineTo(cx + 11, cy + 27); g.stroke(); g.restore();
    if (over) app.cursor = 'pointer';
    if (app.clicked(cx, cy, 38, 38)) { this.close(app); g.restore(); return; }
    const sy0 = y + 82;
    // sliders
    const sliders = [['master', 'Master volume'], ['sfx', 'Sound effects'], ['music', 'Music']];
    sliders.forEach(([key, label], i) => this.slider(app, key, label, x + 32, sy0 + i * 52, w - 64, s));
    // toggles
    const toggles = [
      ['muted', 'Mute all sound', 'Silences everything. Volumes are kept.'],
      ['screenShake', 'Screen shake', 'Camera kick on heavy hits.'],
      ['reducedMotion', 'Reduced motion', 'Fewer particles, no flashes, no hit-stop, calmer menus.'],
      ['colorblind', 'Colorblind patterns', 'Adds pattern and shape cues on top of colors.'],
      ['textSize', 'Large text', 'Bigger text where the layout allows it.'],
    ];
    const ty0 = sy0 + 3 * 52 + 14;
    app.text('OPTIONS', x + 32, ty0 - 8, { size: 12, ui: true, bold: true, color: COL.lamp });
    toggles.forEach(([key, label, tip], i) => {
      const yy = ty0 + 14 + i * 46;
      const isText = key === 'textSize';
      const on = isText ? s.textSize === 'large' : !!s[key];
      const tx = x + w - 32 - 64, hov = app.inRect(x + 32, yy, w - 64, 40);
      if (hov) { app.tooltip(label, tip); app.cursor = 'pointer'; }
      app.text(label, x + 32, yy + 9, { size: 20, color: hov ? '#fff' : COL.vellum });
      // switch
      g.save();
      app.rr(tx, yy + 6, 64, 28, 14); g.fillStyle = on ? '#6a8f4e' : '#3a322d'; g.fill();
      g.strokeStyle = on ? '#b6e08f' : 'rgba(232,220,196,.4)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = on ? '#f4ecd2' : '#9b8f7a'; g.beginPath(); g.arc(tx + (on ? 50 : 14), yy + 20, 10, 0, 6.283); g.fill();
      g.restore();
      app.text(on ? 'On' : 'Off', tx - 12, yy + 11, { size: 15, ui: true, align: 'right', color: on ? '#b6e08f' : '#8c8372' });
      if (app.clicked(x + 32, yy, w - 64, 40) && live) {
        if (isText) s.textSize = on ? 'normal' : 'large'; else s[key] = !on;
        this.applyAudio(app); this.persist(app);
        if (app.shared.audio && !s.muted) app.shared.audio.sfx('uiClick');
      }
    });
    // reset
    const ry = ty0 + 14 + toggles.length * 46 + 14;
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
    if (live && app.pressedKeys.some((e) => e.key === 'Escape')) { if (this.reset) this.reset = 0; else this.close(app); }
  },
  slider(app, key, label, x, y, w, s) {
    const g = app.ctx, live = app.top() === this;
    const tx = x + 190, tw = w - 190 - 56, ty = y + 18;
    app.text(label, x, y + 6, { size: 20 });
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
    g.strokeStyle = 'rgba(14,14,14,.7)'; g.lineWidth = 1.5; g.beginPath();
    for (let i = 1; i < 20; i++) { const px = tx + (tw * i) / 20; g.moveTo(px, ty - 6); g.lineTo(px, ty + 6); }
    g.stroke();
    // staple thumb
    const hx = tx + tw * v;
    g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 6; g.fillStyle = over || this.drag === key ? '#ffe9a8' : '#d6a94a';
    app.rr(hx - 8, ty - 15, 16, 30, 4); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = '#fff1b8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx - 3, ty - 9); g.lineTo(hx - 3, ty + 9); g.moveTo(hx + 3, ty - 9); g.lineTo(hx + 3, ty + 9); g.stroke();
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
  g.save(); g.strokeStyle = 'rgba(232,220,196,.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  for (let x = x1; x < x2; x += 12) { g.moveTo(x, y1 - 3); g.lineTo(x, y1 + 3); }
  g.stroke(); g.restore();
}
