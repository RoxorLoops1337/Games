// Title screen: logo, menu, hero select (New Run), Daily Run, Credits. Owner: title/end/settings.
// States: 'menu' | 'select' | 'credits'. Keys come from app.pressedKeys (works in the browser and in headless tests).
import { COL, FONT, FONT_UI, EASE, W, H, rgba, clamp } from './core.js';
import { drawPortrait } from '../art/heroes.js';
import { drawSchoolGlyph } from '../art/cards.js';
import * as RUN from '../engine/run.js';
import { HEROES, SCHOOLS, CARDS } from '../data/index.js';
import { percentLabel } from './archive_kit.js';
import { heroHint } from '../engine/unlock.js';
import { heroUnlocked, maxAscension, startRelicOf, practiceList, dailyPlayed } from '../engine/meta.js';
import { ASSIST_OPTIONS, ASSIST_NOTE, ASSIST_DEFAULT, assistFlags } from '../engine/assist.js';
import { loadRun } from '../engine/save.js';
import { hashSeed } from '../engine/rng.js';
import { canFullscreen, isFullscreen, isIPhone, fsButton, fsRegisterRect, requestFs } from './fullscreen.js';
import { installAvailable, install } from './install.js';
import { lnw } from '../art/linework.js';
import { drawModeSwitch, modeOf } from './ward_kit.js';
import { createScene } from './title_scene.js';
import { createLogo, taglineAt, INTRO_S } from './title_logo.js';

// The one-line goal under the tagline, per mode (no map in the Ward: it is a hospital you build and a route you walk).
export const goalText = (mode) => (mode === 'ward' ? 'Goal: build your ward, sew your own cards, beat each Act boss.' : 'Goal: climb the map, sew your own cards, beat each Act boss.');
const compact = (app) => app.scale < 0.95; // phone stage: a menu column on the left, the two cards on the right, the scene in the middle

export const VERSION = 'v1.0';
const HERO_ORDER = ['marrow', 'wick', 'odile'];
const TYPE_NAMES = { attack: 'Attack', skill: 'Skill', power: 'Power' };

// one scene and one logo for the whole session: their caches (room layers, baked letters) survive leaving and re-entering the title
export const SCENE = createScene(), LOGO = createLogo();
let INTRO_SEEN = false;                       // the sewing intro plays on the first title of a page load only
export const resetTitleIntro = () => { INTRO_SEEN = false; };
const REAL_BROWSER = () => typeof window !== 'undefined' && !!window.location && typeof window.location.href === 'string';
const settingsOf = (app) => (app.shared.meta && app.shared.meta.settings) || {};
const calm = (app) => !!settingsOf(app).reducedMotion;
const todaySeed = () => RUN.dailySeed();

// ---------- small drawing helpers ----------
function padlock(g, x, y, s, col = '#9b8f7a') {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = col; g.lineWidth = lnw(5); g.beginPath(); g.arc(0, -8, 11, Math.PI, 0); g.lineTo(11, 0); g.moveTo(-11, -8); g.lineTo(-11, 0); g.stroke();
  g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(-17, -2, 34, 26, 4) : g.rect(-17, -2, 34, 26); g.fill();
  g.fillStyle = '#1A1614'; g.beginPath(); g.arc(0, 8, 4, 0, 6.283); g.fill(); g.fillRect(-1.5, 8, 3, 9);
  g.restore();
}
function stitchLine(g, x1, y1, x2, y2, o = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.floor(len / (o.step || 12)));
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux, s = o.size || 4;
  g.save(); g.strokeStyle = o.color || '#0E0E0E'; g.lineWidth = lnw(o.lw || 2); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.beginPath();
  for (let i = 0; i <= n; i++) { const px = x1 + ux * (len * i / n), py = y1 + uy * (len * i / n); g.moveTo(px - nx * s, py - ny * s); g.lineTo(px + nx * s, py + ny * s); }
  g.stroke(); g.restore();
}
// ---------- the screen ----------
// Hero accent colours (Marrow's blood red) are too dark to read as small labels on the dark panel: mix them toward vellum.
export function labelColor(hex, k = 0.62) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#e8dcc4';
  const n = parseInt(m[1], 16), mix = (c) => Math.round(c + (255 - c) * k);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('');
}

export default {
  enter(app, params) {
    this.p = params || {};
    this.state = 'menu';
    this.logoK = 0; this.menuK = 0;
    app.sceneT = 0;
    this.seed = ''; this.seedFocus = false;
    this.hero = null; this.asc = 0;
    this.credK = 0; this.confirmAbandon = false; this.toast = null;
    this.lifts = {}; this.clock = 0; this.ambT = 2.5; this.crackT = 1.5;
    // the sewing intro: first title of a page load, real browser only (headless tests pass `intro: true` to see it), never with reduced motion; any input skips it
    const want = this.p.intro !== undefined ? !!this.p.intro : (!INTRO_SEEN && REAL_BROWSER());
    this.introPlanned = want && !calm(app); INTRO_SEEN = true;
    this.introT = 0; this.menuAt = this.introPlanned ? INTRO_S * 0.78 : 0; this.chimed = !this.introPlanned;
    LOGO.reset(); SCENE.ensure(app);
    const flow = app.shared.flow;
    this.hasSave = flow ? flow.hasSave() : false;
    this.saveInfo = this.hasSave ? this.readSave(app) : null;
    this.previewHero = this.pickPreviewHero(app);
    const a = app.shared.audio; if (a && a.mute) a.mute(!!settingsOf(app).muted);
  },
  leave(app) { app.clearTweens(this); },
  readSave(app) {
    try {
      const r = loadRun(); if (!r) return null;
      const h = HEROES[r.hero];
      return { heroId: r.hero, hero: h ? h.name : r.hero, act: r.act, floor: (r.stats && r.stats.floors) || r.row + 1, day: r.ward ? r.ward.day : 0, dayLimit: r.ward ? r.ward.dayLimit : 0, hp: r.hp, maxHp: r.maxHp, asc: r.ascension, daily: !!r.daily, loop: r.loop };
    } catch { return null; }
  },
  update(app, dt) { if (!this.p) return; },
  // the hero card on the left: the hero of the saved run, else of the last run played, else Marrow
  pickPreviewHero(app) {
    const meta = app.shared.meta, ok = (id) => id && HEROES[id] && heroUnlocked(meta, id);
    if (this.saveInfo && ok(this.saveInfo.heroId)) return this.saveInfo.heroId;
    const h = meta && meta.history && meta.history[0] && meta.history[0].hero;
    return ok(h) ? h : 'marrow';
  },
  skipIntro(app) {
    if (!this.introPlanned) return;
    this.introPlanned = false; this.menuAt = this.introT; this.chimed = true; LOGO.reset();
    const a = app.shared.audio; if (a) a.sfx('uiClick', { vol: 0.5 });
  },
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
    const g = app.ctx, meta = app.shared.meta, flow = app.shared.flow, cm = calm(app), dt = Math.min(0.05, app.dt || 0.016);
    // any input skips the intro and is used up by it (a click must not also press a button that is not there yet)
    if (this.introPlanned && !app.blocked && (app.mouse.pressed || app.mouse.released || app.pressedKeys.length)) {
      this.skipIntro(app); app.mouse.pressed = false; app.mouse.released = false; app.mouse.pressStart = null; app.pressedKeys.length = 0;
    }
    this.introT += dt; this.clock += cm ? 0 : dt;
    const p = this.introPlanned ? clamp(this.introT / INTRO_S, 0, 1) : 1;
    if (this.introPlanned && p >= 1) this.introPlanned = false;
    this.menuK = cm ? 1 : clamp((this.introT - this.menuAt) / 0.9, 0, 1);
    this.logoK = p;
    if (!this.chimed && p >= 0.8) { this.chimed = true; const a = app.shared.audio; if (a) a.sfx('graftAttach', { vol: 0.5 }); }
    const sceneK = cm ? 1 : this.introPlanned || this.menuAt ? clamp(this.introT / 1.8, 0, 1) : clamp(this.introT / 0.6, 0, 1);
    SCENE.draw(app, { calm: cm, fade: sceneK });
    this.audioTick(app, dt, cm);
    // logo, thread and tagline (the thread is part of the big title only)
    const menuState = this.state === 'menu';
    const logoY = menuState ? 170 : 62, sc = menuState ? 1 : 0.42;
    g.save();
    if (sc !== 1) { g.translate(640, logoY); g.scale(sc, sc); g.translate(-640, -logoY); }
    LOGO.draw(app, { cx: 640, cy: logoY, p, t: this.clock, calm: cm, thread: menuState });
    g.restore();
    for (const ev of LOGO.take()) { if (ev.tk) this.tick(app, ev.tk); }
    if (menuState) {
      const tg = taglineAt(this.clock, cm), reveal = cm ? 1 : this.introPlanned ? clamp((p - 0.86) / 0.14, 0, 1) : clamp(this.introT / 0.5, 0, 1);
      const cp = compact(app), ty = cp ? 226 : 250, tw = cp ? 480 : 760, gw = cp ? 480 : 1000; // phones: tight under the thread, between the menu column and the cards
      g.save(); g.globalAlpha = reveal * 0.8; g.translate(640, ty + 16); g.scale(1, 0.1); const sg = g.createRadialGradient(0, 0, 0, 0, 0, 480); sg.addColorStop(0, 'rgba(8,6,10,.85)'); sg.addColorStop(0.6, 'rgba(8,6,10,.5)'); sg.addColorStop(1, 'rgba(8,6,10,0)');
      g.fillStyle = sg; g.fillRect(-480, -480, 960, 960); g.restore(); // a soft dark pool keeps the two lines readable over the lit rooms
      const th = app.text(tg.text, 640, ty, { size: 22, italic: true, align: 'center', color: '#d9cba8', shadow: true, alpha: tg.a * reveal, fit: { w: tw, lines: 1 } });
      app.text(goalText(modeOf(meta)), 640, ty + th + 2, { size: 14, align: 'center', color: '#bfae88', shadow: true, alpha: clamp((reveal - 0.3) * 1.4, 0, 1) * 0.85, fit: { w: gw, lines: cp ? 2 : 1 } });
    }
    // keys
    const nav0 = app.navButtons; app.navButtons = !app.blocked; // Tab, arrows and Enter walk the buttons of this screen, never the ones of a modal on top
    const keys = app.blocked ? [] : app.pressedKeys;
    if (this.state === 'menu') this.drawMenu(app, keys);
    else if (this.state === 'select') this.drawSelect(app, keys);
    else if (this.state === 'credits') this.drawCredits(app, keys);
    if (app.blocked) app.navButtons = nav0;
    // top right: fullscreen (reserved zone 1128..1272 x 0..56)
    fsButton(app, 1210, 16, 52, 44, { id: 'title_fs', hint: true });
    // corner: version + credit line + mute (always)
    const vo = { size: 13, ui: true, color: 'rgba(232,220,196,.55)', fit: { w: 400, lines: 1 } }, co = { size: 12, ui: true, italic: true, color: 'rgba(232,220,196,.4)', fit: { w: 400, lines: 1 } };
    if (!(compact(app) && this.state !== 'menu')) { // phones: the select and credits panels use the whole stage, the corner credit line would sit under their buttons
      const vh = app.layoutText('GRAFTWORK ' + VERSION, vo).h, ch = app.layoutText('Cut and sewn by hand. See Credits.', co).h, fy = H - 10 - vh - ch;
      app.text('GRAFTWORK ' + VERSION, 16, fy, vo);
      app.text('Cut and sewn by hand. See Credits.', 16, fy + vh + 1, co);
    }
    const st = settingsOf(app);
    const mx = W - 54, my = H - 54;
    const over = app.inRect(mx, my, 38, 38);
    if (over) { app.cursor = 'pointer'; app.tooltip(st.muted ? 'Sound off' : 'Sound on', 'Click to toggle.'); }
    app.panel(mx, my, 38, 38, { r: 8, fill: over ? 'rgba(60,50,42,.9)' : 'rgba(26,22,20,.8)', stroke: over ? COL.lamp : 'rgba(232,220,196,.4)' });
    g.save(); g.strokeStyle = COL.vellum; g.fillStyle = COL.vellum; g.lineWidth = lnw(2);
    g.beginPath(); g.moveTo(mx + 9, my + 15); g.lineTo(mx + 14, my + 15); g.lineTo(mx + 20, my + 9); g.lineTo(mx + 20, my + 29); g.lineTo(mx + 14, my + 23); g.lineTo(mx + 9, my + 23); g.closePath(); g.fill();
    if (st.muted) { g.strokeStyle = COL.scar; g.lineWidth = lnw(3); g.beginPath(); g.moveTo(mx + 25, my + 14); g.lineTo(mx + 33, my + 24); g.moveTo(mx + 33, my + 14); g.lineTo(mx + 25, my + 24); g.stroke(); }
    else { g.beginPath(); g.arc(mx + 21, my + 19, 6, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(mx + 21, my + 19, 11, -0.9, 0.9); g.stroke(); }
    g.restore();
    if (app.clicked(mx, my, 38, 38)) {
      meta.settings = meta.settings || {}; meta.settings.muted = !meta.settings.muted;
      if (app.shared.audio && app.shared.audio.mute) app.shared.audio.mute(meta.settings.muted);
      flow.saveMeta();
    }
    if (this.toast && this.toast.t > 0) { this.toast.t -= app.dt; app.text(this.toast.msg, 640, H - 60, { size: 16, ui: true, align: 'center', color: COL.lamp, alpha: clamp(this.toast.t, 0, 1), fit: { w: 600, lines: 1 } }); }
  },
  // "tk tk": the needle ticks (the sound functions respect mute and the autoplay rule by themselves)
  tick(app, n) {
    const a = app.shared.audio; if (!a || !a.sfx) return;
    a.sfx('stitchTk');
    if (n > 1) app.timers.push({ ms: 120, fn: () => { if (app.current === 'title' || !app.current) a.sfx('stitchTk', { pitch: 0.9 }); } });
  },
  // the room tone swells now and then, a candle crackles in the distance; only on the menu and when nothing covers the title
  audioTick(app, dt, cm) {
    const a = app.shared.audio; if (!a || !a.sfx || app.blocked || this.state !== 'menu') return;
    this.ambT -= dt; this.crackT -= dt;
    if (this.ambT <= 0) { this.ambT = 5.2; a.sfx('roomTone', { vol: 0.7 }); }
    if (this.crackT <= 0) { this.crackT = 2.2 + ((this.clock * 7.31) % 1) * 4.5; if (!cm) a.sfx('candleCrackle'); }
  },

  // ---- menu ----
  // A brass-framed slab: app.button does the work (hit area, keyboard focus ring, press travel, ripple); this adds the lift on hover or focus (eased, drawn
  // by moving the picture, never the hit area), a drop shadow that opens under the lifted slab, a sheen that crosses it, and stitched ends.
  slab(app, key, label, x, y, w, h, o = {}) {
    const g = app.ctx, F = app.focus, cm = calm(app), dt = Math.min(0.05, app.dt || 0.016);
    const fo = !!(F.active && F.idx >= 0 && F.idx < F.n && F.list[F.idx] && F.list[F.idx].x === x && F.list[F.idx].y === y);
    const hot = !o.disabled && (app.inRect(x, y, w, h) || fo), cur = this.lifts[key] || 0, to = hot ? 1 : 0;
    const lift = this.lifts[key] = cm ? to : cur + (to - cur) * Math.min(1, dt * 14);
    g.save(); // shadow under the slab: wider and softer as it lifts
    g.globalAlpha *= 0.34 + 0.2 * lift; g.fillStyle = '#000'; app.rr(x + 3 - lift * 1.5, y + h - 5 + lift * 3, w - 6 + lift * 3, 10 + lift * 3, 6); g.fill(); g.restore();
    g.save(); g.translate(0, -lift * 3);
    if (o.glow) { g.save(); g.globalAlpha = (o.glow * (cm ? 0.7 : 0.55 + 0.25 * Math.sin(app.t * 2.2))) + 0.25 * lift; g.strokeStyle = COL.lamp; g.lineWidth = lnw(2.5); app.rr(x - 2, y - 2, w + 4, h + 4, 10); g.stroke(); g.restore(); }
    const res = app.button(label, x, y, w, h, { ...o, glow: undefined });
    // stitched ends (three short threads at each end, inside the frame)
    g.save(); g.strokeStyle = 'rgba(232,220,196,.22)'; g.lineWidth = lnw(1.2); g.beginPath();
    for (let i = 0; i < 3; i++) { const yy = y + h / 2 + (i - 1) * 7; g.moveTo(x + 9, yy); g.lineTo(x + 15, yy); g.moveTo(x + w - 15, yy); g.lineTo(x + w - 9, yy); }
    g.stroke(); g.restore();
    if (lift > 0.02 && !o.disabled) { // the sheen
      g.save(); app.rr(x + 3, y + 3, w - 6, h - 6, 6); g.clip();
      const sx = cm ? x + w * 0.5 : x - 40 + ((app.t * 150) % (w + 120)), gr = g.createLinearGradient(sx - 30, y, sx + 30, y + h); gr.addColorStop(0, 'rgba(255,236,190,0)'); gr.addColorStop(0.5, `rgba(255,236,190,${(0.16 * lift).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, h); g.restore();
    }
    g.restore();
    return res;
  },
  pip(app, text, cx, cy, o = {}) { // a small brass pill with a number or a short word: unlock count, Credit
    const g = app.ctx, s = o.size || 12, tw = Math.max(18, Math.min(o.maxW || 60, app.measure(String(text), s, { ui: true, bold: true }) + 12)), th = Math.ceil(app.sz(s, { ui: true, bold: true }) * 1.2) + 4;
    g.save(); g.fillStyle = o.fill || '#d6a94a'; g.strokeStyle = '#5a410c'; g.lineWidth = lnw(1.5); app.rr(cx - tw / 2, cy - th / 2, tw, th, th / 2); g.fill(); g.stroke(); g.restore();
    app.text(String(text), cx, cy - th / 2 + 2, { size: s, ui: true, bold: true, align: 'center', color: '#2a1d05', fit: { w: tw - 6, lines: 1 } });
  },
  drawMenu(app, keys) {
    const g = app.ctx, meta = app.shared.meta, flow = app.shared.flow;
    if (keys.some((e) => e.key === 'Escape') && this.confirmAbandon) this.confirmAbandon = false;
    if (!this.confirmAbandon && flow.openWardrobe && keys.some((e) => e.key === 'w' || e.key === 'W')) flow.openWardrobe();
    const nav0 = app.navButtons; if (this.confirmAbandon) app.navButtons = false; // the buttons behind the dialog are not for the keyboard
    const cp = compact(app), fsOK = canFullscreen() && !cp; // phones have the fullscreen button in the corner: no menu row for it
    const bw = cp ? 330 : 330, bh = cp ? 46 : 48, step = cp ? 50 : (this.hasSave ? 1 : 0) + 5 + (fsOK ? 1 : 0) > 6 ? 52 : 56, x = cp ? 44 : 640 - bw / 2;
    let y = cp ? 288 : 306;
    const k = EASE.out(clamp(this.menuK, 0, 1));
    g.save(); g.globalAlpha = k;
    // the plate behind the menu: a dark glass slab so the live scene never fights the labels
    const items = [];
    if (this.hasSave) items.push('continue');
    items.push('new', 'daily', 'codex', 'settings');
    if (fsOK) items.push('fullscreen');
    items.push('credits');
    const plateH = items.length * step + 14 + (this.hasSave ? 14 : 0);
    app.panel(x - 22, y - 12, bw + 44, plateH, { r: 14, fill: 'rgba(12,9,9,.7)', stroke: 'rgba(201,162,39,.5)' });
    const fresh = meta && meta.unlocked && meta.unlocked.fresh && typeof meta.unlocked.fresh === 'object' ? Object.keys(meta.unlocked.fresh).length : 0;
    const credit = meta && meta.credit ? Math.max(0, Math.floor(meta.credit.bal || 0)) : 0;
    for (const id of items) {
      const yy = y + (1 - k) * 18;
      if (id === 'continue') {
        const s = this.saveInfo;
        const who = cp ? '' : s && s.hero + ', '; // phones: the hero card on the right already names the grafter
        const sub = s ? (s.day ? `${who}Act ${s.act}, Day ${s.day} of ${s.dayLimit}, ${s.hp}/${s.maxHp} HP` : `${who}Act ${s.act}, Floor ${s.floor}, ${s.hp}/${s.maxHp} HP`) : 'Resume your last run';
        if (this.slab(app, id, 'Continue', x, yy, bw, bh + 12, { size: 24, fit: true, fill: '#4a3a1d', stroke: COL.lamp, color: '#fbe9b0', sub, subColor: '#e3d3a4', glow: 0.5 })) { if (!flow.resume()) { this.hasSave = false; } }
        y += step + 14; continue;
      }
      if (id === 'new') {
        if (this.slab(app, id, 'New Run', x, yy, bw, bh, { size: 22 })) { if (this.hasSave) { this.confirmAbandon = true; app.mouse.released = false; } else this.openSelect(app); }
      } else if (id === 'daily') {
        const seed = todaySeed(), hero = RUN.dailyHero(seed), played = (meta.daily ? dailyPlayed(meta, seed) : false);
        const hn = HEROES[hero].name;
        const label = played ? 'Daily Run (played)' : 'Daily Run';
        const modeTag = modeOf(meta) === 'ward' ? 'WARD' : 'CLASSIC';
        if (app.inRect(x, yy, bw, bh)) {
          const mod = RUN.DAILY_MODS[hashStr(seed) % RUN.DAILY_MODS.length];
          app.tooltip(mod.name, `${hn}, seed ${seed}.\nMode: ${modeOf(meta) === 'ward' ? 'The Ward' : 'Classic map'} (change it on the New Run screen).\n${mod.text}`, { color: COL.lamp });
        }
        if (this.slab(app, id, label, x, yy, bw, bh, { size: 22, fit: true, sub: undefined, fill: played ? '#2a2623' : COL.slab2, color: played ? '#b9ad92' : COL.vellum })) {
          this.startDaily(app);
        }
        // the mode this Daily will be played in, on the slab itself
        // (only when it fits beside the centred label: the tag never touches the words)
        const tagO = { size: 11, ui: true, bold: true, align: 'right', color: 'rgba(232,220,196,.5)', fit: { w: 70, lines: 1 } }, tagW = app.layoutText(modeTag, tagO).w, lblW = app.measure(label, 22, { bold: true });
        if (lblW / 2 + tagW + 22 <= bw / 2 - 14) app.text(modeTag, x + bw - 14, yy + bh / 2 - 7, tagO);
      } else if (id === 'codex') {
        const hw = Math.floor((bw - 10) / 2);
        if (this.slab(app, 'codex', 'Codex', x, yy, hw, bh, { size: 22 })) flow.openCodex();
        if (app.inRect(x + hw + 10, yy, hw, bh)) app.tooltip('Wardrobe', 'Spend Credit on card backs, tints, titles and a starting relic. Shortcut: W.' + (credit ? `\nYou have ${credit} Credit.` : ''));
        if (this.slab(app, 'wardrobe', 'Wardrobe', x + hw + 10, yy, hw, bh, { size: 22 }) && flow.openWardrobe) flow.openWardrobe();
        if (credit > 0) this.pip(app, credit, x + hw + 10 + hw - 28, yy + 1, { size: 12, maxW: 52 });
      }
      else if (id === 'settings') {
        const hw = Math.floor((bw - 10) / 2), al = percentLabel(meta);
        if (this.slab(app, 'settings', 'Settings', x, yy, hw, bh, { size: 22, fit: true })) flow.openSettings();
        if (app.inRect(x + hw + 10, yy, hw, bh)) app.tooltip('Archive', 'New cards, grafts, relics, potions and events open after every run. See what is open and what comes next.' + (fresh ? `\n${fresh} new since you last looked.` : ''), { color: COL.lamp });
        app.reg('title-archive', x + hw + 10, yy - 12, hw, bh + 12, { group: 'archive' }); // includes the pip that hangs on its top edge
        if (this.slab(app, 'archive', app.measure(al, 20, { bold: true }) > hw - 16 ? 'Archive' : al, x + hw + 10, yy, hw, bh, { size: 20, fit: true }) && flow.openArchive) flow.openArchive();
        if (fresh > 0) this.pip(app, fresh > 99 ? '99+' : String(fresh), x + hw + 10 + hw - 14, yy + 1, { size: 12, maxW: 40, fill: '#e8c25a' });
      }
      else if (id === 'fullscreen') { fsRegisterRect(app, x, yy, bw, bh); if (this.slab(app, id, 'Fullscreen: ' + (isFullscreen() ? 'On' : 'Off'), x, yy, bw, bh, { size: 22 })) requestFs(app); }
      else if (id === 'credits') {
        const inst = installAvailable(), hw = Math.floor((bw - 10) / 2), cw = inst ? hw : bw; // Install app shares the Credits row: no extra height on any layout
        if (this.slab(app, id, 'Credits', x, yy, cw, bh, { size: 22, fit: true })) { this.go(app, 'credits'); this.credK = 0; app.tween(this, { credK: 1 }, calm(app) ? 1 : 300, 'out'); }
        if (inst) {
          if (app.inRect(x + hw + 10, yy, hw, bh)) app.tooltip('Install app', 'Adds Graftwork to your home screen or app list. Plays fullscreen, works like an app.');
          if (this.slab(app, 'install', 'Install app', x + hw + 10, yy, hw, bh, { size: 20, fit: true, fill: '#3a2f1a', stroke: COL.lamp })) install(app);
        }
      }
      y += step;
    }
    g.restore();
    if (!canFullscreen() && isIPhone()) app.text('Add to Home Screen for fullscreen', 640, y + 6, { size: 13, ui: true, italic: true, align: 'center', color: 'rgba(232,220,196,.6)', fit: { w: 400, lines: 1 } });
    // the hero card on the left, the daily card on the right
    if (cp) { const dh = this.dailyH(app); this.drawDailyCard(app, 900, 232); this.drawHeroCard(app, 900, 712, 232 + dh + 8); }
    else { this.drawHeroCard(app, 28, 626); this.drawDailyCard(app, 930, 312); }
    app.navButtons = nav0;
    if (this.confirmAbandon) this.drawConfirm(app, 'Start a new run?', 'Your saved run will be replaced. This cannot be undone.', 'Replace saved run', () => { this.confirmAbandon = false; this.openSelect(app); }, () => { this.confirmAbandon = false; });
  },
  // a small card for the hero you left off with (the saved run's hero, else the last run's, else Marrow): portrait, name, school, passive
  drawHeroCard(app, x, bottom, minY = 0) {
    const g = app.ctx, id = this.previewHero || 'marrow', h = HEROES[id]; if (!h) return;
    const big = (settingsOf(app).textScale || 100) >= 125 || app.scale < 0.95, w = 300, ph = Math.min(big ? 224 : 168, bottom - minY), y = bottom - ph, k = EASE.out(clamp((this.menuK - 0.1) / 0.9, 0, 1)), school = SCHOOLS[h.school], cm = calm(app), dv = big ? Math.max(92, Math.min(150, ph - 112)) : 106; // the card never runs past `bottom`: a short card trades header height for text room
    app.reg('title-hero-card', x, y, w, ph, { group: 'herocard' });
    g.save(); g.globalAlpha = k; g.translate(-(1 - k) * 40, 0);
    app.panel(x, y, w, ph, { r: 12, fill: 'rgba(12,9,9,.72)', stroke: rgba(h.color, 0.7) });
    app.text(this.saveInfo ? 'YOUR GRAFTER' : 'LAST GRAFTER', x + 16, y + 12, { size: 12, ui: true, bold: true, color: COL.lamp, fit: { w: 150, lines: 1 } });
    drawSchoolGlyph(g, h.school, x + w - 22, y + 20, 9, school.color);
    app.text(school.name, x + w - 36, y + 12, { size: 11, ui: true, bold: true, align: 'right', color: labelColor(school.color, 0.4), fit: { w: 70, lines: 1 } });
    const sway = cm ? 0 : Math.sin(app.t * 1.5) * 1.5;
    g.save(); g.beginPath(); g.arc(x + 16 + 36, y + 76, 38, 0, 6.283); g.fillStyle = rgba(h.color, 0.22); g.fill(); g.restore();
    drawPortrait(g, id, x + 16 + 36, y + 78 + sway, 72);
    const nh = app.text(h.name, x + 104, y + 34, { size: 24, bold: true, shadow: true, fit: { w: w - 120, lines: 1 } });
    const tO = { size: 14, italic: true, color: '#cdbf9d', fit: { w: w - 120, h: dv - 34 - nh - 8, lines: 2 } };
    if (!app.layoutText(h.title, tO).trunc) app.text(h.title, x + 104, y + 34 + nh + 4, tO); // a title that cannot fit whole is left out (the school badge says who it is), never cut
    stitchLine(g, x + 16, y + dv, x + w - 16, y + dv, { color: 'rgba(232,220,196,.25)', size: 3, step: 10, lw: 1 });
    app.text(h.passive, x + 16, y + dv + 8, { size: 13, ui: true, color: '#e0d4b8', fit: { w: w - 32, h: ph - dv - 8 - 8, soft: true } });
    g.restore();
  },
  startDaily(app) {
    const meta = app.shared.meta, flow = app.shared.flow;
    const seed = todaySeed(), hero = RUN.dailyHero(seed);
    meta.daily = meta.daily || {}; meta.daily.lastPlayed = seed; flow.saveMeta();
    const opts = { hero, ascension: 0, seed, daily: seed };
    if (modeOf(meta) === 'ward') opts.mode = 'ward'; // same seeded case, played in the Ward; classic keeps the exact old options
    this.begin(app, opts);
  },
  dailyH(app) { return app.scale < 0.55 ? 250 : app.scale < 0.95 ? 214 : 190; },
  drawDailyCard(app, x, y) {
    const g = app.ctx, meta = app.shared.meta;
    const seed = todaySeed(), hero = RUN.dailyHero(seed), mod = RUN.DAILY_MODS[hashStr(seed) % RUN.DAILY_MODS.length];
    const played = (meta.daily ? dailyPlayed(meta, seed) : false), h = HEROES[hero];
    const k = EASE.out(clamp(this.menuK - 0.2, 0, 1) / 0.8);
    g.save(); g.globalAlpha = k; g.translate((1 - k) * 40, 0);
    const ph = this.dailyH(app); // phones: the inflated rules text needs the extra rows
    app.panel(x, y, 300, ph, { r: 12, fill: 'rgba(14,11,10,.72)', stroke: played ? 'rgba(232,220,196,.25)' : rgba(COL.lamp, 0.55) });
    const modeTxt = modeOf(meta) === 'ward' ? 'WARD' : 'CLASSIC', sO = { size: 13, bold: true, ui: true }, sL = app.layoutText('PLAYED', sO), stW = Math.ceil(sL.w) + 14, stH = Math.ceil(sL.size * 1.22) + 6;
    const mnO = { size: 17, bold: true, fit: { w: 268, lines: 1 } }, mnL = app.layoutText(mod.name, mnO), mnH = Math.ceil(mnL.size * 1.22);
    const stampFree = played && 284 - (16 + mnL.w) - 10 >= stW; // the stamp goes beside the modifier name when there is room, else it takes the place of the mode tag
    app.text("TODAY'S CASE", x + 16, y + 12, { size: 13, ui: true, bold: true, color: COL.lamp, fit: { w: 170, lines: 1 } });
    if (played && !stampFree) app.text('PLAYED', x + 284, y + 12, { size: 13, ui: true, bold: true, align: 'right', color: COL.scar, fit: { w: 90, lines: 1 } });
    else app.text(modeTxt, x + 284, y + 12, { fit: { w: 84, lines: 1 }, bold: true, size: 13, ui: true, align: 'right', color: 'rgba(232,220,196,.6)' });
    drawPortrait(g, hero, x + 16 + 32, y + 66, 64);
    app.text(h.name, x + 100, y + 38, { size: 22, bold: true });
    app.text(h.title, x + 100, y + 64, { size: 14, italic: true, color: '#cdbf9d' });
    stitchLine(g, x + 16, y + 106, x + 284, y + 106, { color: 'rgba(232,220,196,.25)', size: 3, step: 10, lw: 1 });
    const my = y + 116 + mnH + 3;
    app.text(mod.name, x + 16, y + 116, { ...mnO, color: '#f0d27a' });
    app.text(mod.text, x + 16, my, { size: 14, ui: true, color: '#d9cba8', fit: { w: 268, h: y + ph - 8 - my, soft: true } });
    if (stampFree) {
      g.save(); g.translate(x + 284 - stW / 2 - 2, y + 116 + mnH / 2); g.rotate(-0.12); g.strokeStyle = COL.scar; g.lineWidth = lnw(2); g.strokeRect(-stW / 2, -stH / 2, stW, stH);
      app.text('PLAYED', 0, -sL.size * 0.62, { ...sO, align: 'center', color: COL.scar, exact: false, fit: { w: stW - 8, lines: 1 } }); g.restore();
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
    const phone = app.scale < 0.95; // phone stage scales: the boosted text needs a taller panel, so the whole select column uses the spare stage height
    app.text('Choose your grafter', 640, phone ? 92 : 112, { size: 26, align: 'center', bold: true, alpha: k, fit: { w: 700, lines: 1 } });
    const pw = 380, ph = phone ? 396 : 352, gap = 20, px0 = (W - (pw * 3 + gap * 2)) / 2, py = phone ? 122 : 148;
    HERO_ORDER.forEach((id, i) => {
      const h = HEROES[id]; if (!h) return;
      const px = px0 + i * (pw + gap), yy = py + (1 - k) * 30 * (i + 1) / 3;
      this.drawHeroPanel(app, h, px, yy, pw, ph, i);
    });
    drawModeSwitch(app, px0, phone ? 40 : 52, 360, phone ? 46 : 42); // Classic map | The Ward (new), remembered in meta.settings.mode
    const ay = py + ph + 6, ah = phone ? 46 : 32;
    this.drawAssist(app, px0, ay);
    // lower row
    const ly = ay + ah + 2;
    const unlocked = heroUnlocked(meta, this.hero);
    const maxA = Math.min(10, maxAscension(meta, this.hero) + 1);
    this.asc = clamp(this.asc, 0, maxA);
    // seed
    app.text('SEED (optional)', px0, ly, { size: 12, ui: true, bold: true, color: COL.lamp, fit: { w: 250, lines: 1 } });
    const sx = px0, sy = ly + 20, sw = 250, sh = 38;
    const sOver = app.inRect(sx, sy, sw, sh);
    if (app.clicked(sx, sy, sw, sh)) this.seedFocus = true; else if (app.mouse.released && !sOver) this.seedFocus = false;
    app.panel(sx, sy, sw, sh, { r: 6, fill: 'rgba(8,6,5,.8)', stroke: this.seedFocus ? COL.lamp : 'rgba(232,220,196,.35)' });
    if (sOver) app.cursor = 'text';
    const caret = this.seedFocus && Math.floor(app.t * 2) % 2 === 0 ? '|' : '';
    if (this.seed) app.text(this.seed + caret, sx + 12, sy + 8, { size: 18, ui: true, fit: { w: sw - 24, lines: 1 } });
    else app.text(this.seedFocus ? caret : 'random', sx + 12, sy + 9, { size: 16, ui: true, italic: true, color: 'rgba(232,220,196,.4)', fit: { w: sw - 24, lines: 1 } });
    for (const e of keys) {
      if (e.key === 'Backspace') { this.seed = this.seed.slice(0, -1); this.seedFocus = true; }
      else if (e.key.length === 1 && /[a-zA-Z0-9_-]/.test(e.key) && !e.ctrlKey && !e.metaKey && this.seed.length < 20) { this.seed += e.key; this.seedFocus = true; }
    }
    // ascension
    const ax = px0 + 290;
    app.text('ASCENSION', ax, ly, { size: 12, ui: true, bold: true, color: COL.lamp, fit: { w: 130, lines: 1 } });
    if (app.inRect(ax, ly - 4, 120, 70)) app.tooltip('Ascension', 'Difficulty. Leave it at 0 for your first run. Each step adds a harder rule once you have won.', { color: COL.lamp });
    if (app.button('<', ax, ly + 20, 38, 38, { size: 22, disabled: this.asc <= 0 })) this.asc--;
    app.text(String(this.asc), ax + 62, ly + 22, { size: 30, bold: true, align: 'center', color: this.asc ? '#ff9a7a' : COL.vellum });
    if (app.button('>', ax + 86, ly + 20, 38, 38, { size: 22, disabled: this.asc >= maxA })) this.asc++;
    if (maxA < 10 && this.asc >= maxA) app.text('Clear this level to open the next.', ax, ly + 64, { size: 12, ui: true, italic: true, color: 'rgba(232,220,196,.5)', fit: { w: 130, h: 40, lines: 2 } });
    // cumulative modifiers
    const tx = ax + 150, tw = W - px0 - tx;
    const lines = RUN.ASCENSION_TEXT.slice(1, this.asc + 1);
    app.panel(tx - 10, ly - 2, tw + 10, 134, { r: 8, fill: 'rgba(8,6,5,.55)', stroke: 'rgba(232,220,196,.15)' });
    if (!lines.length) app.text('Ascension 0: ' + RUN.ASCENSION_TEXT[0], tx, ly + 8, { size: 14, ui: true, color: 'rgba(232,220,196,.6)', fit: { w: tw - 12, lines: 1 } });
    else {
      const col = lines.length > 5 ? 2 : 1, cw = col === 2 ? tw / 2 - 6 : tw - 12;
      lines.forEach((ln, i) => {
        const cx = tx + Math.floor(i / 5) * (tw / 2), cy = ly + 6 + (i % 5) * 24, last = i === lines.length - 1;
        app.text(`${i + 1}`, cx, cy, { size: 13, ui: true, bold: true, color: last ? '#ff9a7a' : '#a58f6b' });
        app.text(ln, cx + 24, cy, { size: 13, ui: true, color: last ? '#ffe2d6' : '#cdbf9d', fit: { w: cw - 28, h: 24, lines: 1 } });
      });
    }
    // buttons
    const by = ly + 70;
    if (app.button('Back', px0, by, 120, 44, { size: 18 })) this.go(app, 'menu');
    if (app.button('Begin', px0 + 134, by, 116, 44, { size: 22, fill: unlocked ? '#4a3a1d' : undefined, stroke: COL.lamp, disabled: !unlocked, color: '#fbe9b0' }) || (!app.blocked && keys.some((e) => e.key === 'Enter') && unlocked)) {
      const opts = { hero: this.hero, ascension: this.asc };
      if (this.seed.trim()) opts.seed = this.seed.trim();
      const sr = startRelicOf(meta); if (sr) opts.startRelic = sr;
      if (modeOf(meta) === 'ward') opts.mode = 'ward'; // Classic map | The Ward (ui/ward_kit.js drawModeSwitch)
      const af = assistFlags(this.assistOf(app)); if (af) opts.assist = af; // Assist mode (engine/assist.js)
      this.begin(app, opts);
    }
    // Practice a boss: unlocked once a boss has been met; replays it with the deck saved from that run
    const pl = practiceList(meta);
    if (pl.length) {
      this.pi = (this.pi || 0) % pl.length; const p = pl[this.pi];
      app.reg('title-practice', px0 + 264, by, 118, 44, { group: 'practice' });
      if (app.inRect(px0 + 264, by, 118, 44)) app.tooltip('Practice: ' + p.name, 'Retry this boss with the deck you took into it.');
      if (app.button('Practice', px0 + 264, by, 118, 44, { size: 16 })) { if (app.shared.flow.startPractice) app.shared.flow.startPractice(p); }
      if (pl.length > 1 && app.button('>', px0 + 388, by, 30, 44, { size: 18 })) this.pi++;
    }
    if (keys.some((e) => e.key === 'Escape')) this.go(app, 'menu');
    if (keys.some((e) => e.key === 'ArrowRight' && !this.seedFocus)) { }
  },
  // Assist mode: a toggle plus 4 independent options, remembered in meta.settings.assist (off by default)
  assistOf(app) {
    const st = app.shared.meta.settings;
    if (!st.assist || typeof st.assist !== 'object') st.assist = { ...ASSIST_DEFAULT };
    return st.assist;
  },
  drawAssist(app, x, y) {
    const a = this.assistOf(app), flow = app.shared.flow, phone = app.scale < 0.95, h = phone ? 46 : 32;
    const save = () => { if (flow.saveMeta) flow.saveMeta(); };
    app.reg('title-assist', x, y, 130, h, { group: 'assist' });
    if (app.inRect(x, y, 130, h)) app.tooltip('Assist mode', 'An easier way to learn the game. Off by default. ' + ASSIST_NOTE);
    const bw0 = phone ? 176 : 134, dis = phone ? 2 : 0; // labels sit in their buttons: up to two lines on a phone so nothing is cut
    const mid = (txt, o) => { const L = app.layoutText(txt, o); return y + (h - L.h) / 2; }; // vertical centre for one or two fitted lines
    const lab = (txt, bx, bw, o) => { const O = { size: o.size, bold: true, shadow: true, align: 'center', color: o.color || COL.vellum, fit: { w: bw - 4, h: h - 2, lines: dis ? 2 : 1 } }; app.text(txt, bx + bw / 2, mid(txt, O), O); };
    if (app.button('', x, y, 130, h, { fill: a.on ? '#2a3a2a' : undefined, stroke: a.on ? '#8fe0a0' : undefined })) { a.on = !a.on; save(); }
    lab('Assist: ' + (a.on ? 'On' : 'Off'), x, 130, { size: 15 });
    if (!a.on) return;
    ASSIST_OPTIONS.forEach((o, i) => {
      const ox = x + 140 + i * (bw0 + 8), bw = bw0, on = !!a[o.id];
      app.reg('title-assist-' + o.id, ox, y, bw, h, { group: 'assist' });
      if (app.inRect(ox, y, bw, h)) app.tooltip(o.name + (on ? ' (on)' : ' (off)'), o.text);
      if (app.button('', ox, y, bw, h, { fill: on ? '#4a3a1d' : undefined, stroke: on ? COL.lamp : undefined })) { a[o.id] = !on; save(); }
      lab(o.name, ox + 20, bw - 20, { size: 14, color: on ? '#fbe9b0' : undefined });
      const g = app.ctx; g.save(); g.strokeStyle = on ? '#fbe9b0' : 'rgba(232,220,196,.55)'; g.lineWidth = lnw(1.5); g.strokeRect(ox + 8.5, y + h / 2 - 5.5, 11, 11); if (on) { g.fillStyle = '#fbe9b0'; g.fillRect(ox + 11, y + h / 2 - 3, 6, 6); } g.restore();
    });
    const nx = x + 140 + 4 * (bw0 + 8) + 4;
    const NO_ = { size: 12, ui: true, italic: true, color: 'rgba(232,220,196,.6)', fit: { w: W - 50 - nx, h: h + 2, lines: dis ? 2 : 1 } };
    app.text('Assisted runs do not unlock ascensions or achievements.', nx, mid('Assisted runs do not unlock ascensions or achievements.', NO_), NO_);
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
    // name block (fitted: the name and title stop short of the school badge)
    app.text(h.name, x + 108, y + 10, { size: 28, bold: true, color: locked ? '#8c8372' : COL.vellum, shadow: true, fit: { w: w - 108 - 76, lines: 1 } });
    app.text(h.title, x + 108, y + 46, { size: 15, italic: true, color: locked ? '#6d655a' : '#d6c7a6', fit: { w: w - 108 - 14, lines: 1 } });
    // school badge (shape glyph, name to its left; the title row below runs under it)
    drawSchoolGlyph(g, h.school, x + w - 26, y + 16, 11, locked ? '#6d655a' : school.color);
    app.text(school.name, x + w - 14, y + 28, { size: 11, ui: true, bold: true, align: 'right', color: locked ? '#6d655a' : school.color, fit: { w: 60, lines: 1 } });
    if (locked) {
      app.text('LOCKED', x + 24, y + 86, { size: 12, ui: true, bold: true, color: '#8c8372', fit: { w: 120, lines: 1 } });
      const ul = app.text(heroHint(meta, h.id) || (h.unlock ? h.unlock.text : 'Locked.'), x + 24, y + 106, { size: 17, color: '#9b8f7a', italic: true, fit: { w: w - 48, h: 60, lines: 3, soft: true } });
      app.text(h.blurb, x + 24, y + 106 + ul + 8, { size: 14, color: '#6d655a', fit: { w: w - 48, h: 90, lines: 4, soft: true } });
      // a big shrouded bust so the locked card still teases who is waiting (idle breath unless reduced motion)
      g.save(); g.globalAlpha = 0.34 + (calm(app) ? 0 : 0.06 * Math.sin(app.t * 1.6 + idx));
      drawPortrait(g, h.id, x + w / 2, y + ph - 90 + (calm(app) ? 0 : Math.sin(app.t * 1.2 + idx) * 2), 128);
      g.restore();
      g.save(); g.globalAlpha = 0.85; padlock(g, x + w / 2 + 44, y + ph - 40, 0.8); g.restore();
      return;
    }
    // Vertical budget: everything below the header band shares y+88 .. y+ph-26 (SELECTED sits under it). The rules (passive, starter deck) are fitted
    // first and never cut; the flavor blurb takes whatever is left (soft: it may shrink or lose its last line on the smallest phone stage).
    const iw = w - 40, top = y + 88, bottom = y + ph - 26;
    const hp = h.perks && h.perks.hp, gold = h.perks && h.perks.gold;
    const counts = {}, types = { attack: 0, skill: 0, power: 0 };
    for (const id of h.deck) { counts[id] = (counts[id] || 0) + 1; const t = CARDS[id] && CARDS[id].type; if (types[t] !== undefined) types[t]++; }
    const ids = Object.keys(counts), cw = iw / 2, cellW = cw - 12;
    const names = ids.map((id) => `${counts[id]}x ${CARDS[id] ? CARDS[id].name : id}`);
    const rows = Math.ceil(ids.length / 2);
    const deckLbl = `STARTER DECK  ${h.deck.length}`, tl = ['power', 'skill', 'attack'].map((t) => ({ t, s: `${types[t]} ${TYPE_NAMES[t]}` }));
    // m shrinks the design sizes (large text scales); the rules block must fit between the band and SELECTED, so take the largest m that does
    let P = null, P0 = null;
    for (const m of [1, 0.92, 0.85, 0.78, 0.7]) {
      const rowO = { size: 13 * m, ui: true }, hdrO = { size: 12 * m, ui: true, bold: true };
      let rowSz = 99; for (const n of names) rowSz = Math.min(rowSz, app.layoutText(n, { ...rowO, fit: { w: cellW, lines: 1 } }).size);
      const rowPitch = Math.round(rowSz * 1.3);
      const hdrSz = app.layoutText(deckLbl, { ...hdrO, fit: { w: iw, lines: 1 } }).size;
      const tySz = Math.min(hdrSz, ...tl.map((q) => app.layoutText(q.s, { size: 12 * m, ui: true, fit: { w: iw / 3 - 8, lines: 1 } }).size));
      const typesW = tl.reduce((n, q) => n + app.measure(q.s, tySz, { ui: true, exact: true }) + 10, -10);
      const twoRows = app.measure(deckLbl, hdrSz, { ...hdrO, exact: true }) + typesW + 14 > iw; // the type counts drop to their own line when they would touch the label
      const hdrH = Math.round(Math.max(hdrSz, tySz) * 1.25) + 3, deckH = hdrH * (twoRows ? 2 : 1) + rows * rowPitch;
      const lblH = Math.round(app.layoutText('PASSIVE', { ...hdrO, fit: { w: 120, lines: 1 } }).size * 1.22) + 1;
      const hpO = { size: 13 * m, ui: true }, hpTxt = `${hp} HP    ${gold} gold`, hpH = Math.round(app.layoutText(hpTxt, { ...hpO, fit: { w: iw, lines: 1 } }).size * 1.22) + 6;
      const pOpts = { size: 14 * m, lineH: 17 * m }, pL = app.layoutText(h.passive, { ...pOpts, fit: { w: iw, lines: 3 } }), passH = pL.lines.length * pL.lineH + 4;
      const room = bottom - top - (lblH + passH + hpH + deckH + 16);
      P = { m, rowO, hdrO, rowSz, rowPitch, hdrSz, tySz, twoRows, hdrH, lblH, hpO, hpTxt, hpH, pOpts, passH, room };
      if (room >= 0 && !P0) P0 = P;
      if (room >= 0 && !(room >= 14 && app.layoutText(h.blurb, { size: 14 * m, lineH: 17 * m, fit: { w: iw, h: room, lines: 3, soft: true } }).trunc)) break; // smaller rules text until the flavor line is not cut
      if (m === 0.7 && P0) P = P0;
    }
    const { rowO, hdrO, rowSz, rowPitch, hdrSz, tySz, twoRows, hdrH, lblH, hpO, hpTxt, hpH, pOpts, passH, room } = P;
    let yy = top;
    if (room >= 14) { // the flavor blurb takes what is left (soft: it may shrink or lose its last line on the smallest phone stage)
      const bO = { size: 14 * P.m, lineH: 17 * P.m, fit: { w: iw, h: room, lines: 3, soft: true } }, bL = app.layoutText(h.blurb, bO);
      if (!bL.trunc) { // a half sentence ending in "..." reads as a bug: when the whole line cannot fit, leave the flavor out (the rules below are what matter)
        app.text(h.blurb, x + 20, yy, { ...bO, color: '#e0d4b8' });
        yy += bL.lines.length * bL.lineH + 8;
      }
    }
    stitchLine(g, x + 20, yy, x + w - 20, yy, { color: rgba(h.color, 0.55), size: 3, step: 10, lw: 1 });
    yy += 8;
    app.text('PASSIVE', x + 20, yy, { ...hdrO, color: labelColor(h.color), fit: { w: 120, lines: 1 } });
    yy += lblH;
    app.text(h.passive, x + 20, yy, { ...pOpts, color: '#fbe9b0', fit: { w: iw, lines: 3 } });
    yy += passH;
    app.text(hpTxt, x + 20, yy, { ...hpO, color: '#b7aa8c', fit: { w: iw, lines: 1 } });
    yy += hpH;
    app.text(deckLbl, x + 20, yy, { ...hdrO, size: hdrSz, exact: true, color: labelColor(h.color) });
    let tx = x + w - 20;
    if (twoRows) yy += hdrH;
    for (const q of tl) {
      const t = q.t, wd = app.measure(q.s, tySz, { ui: true, exact: true });
      tx -= wd; app.text(q.s, tx, yy, { size: tySz, exact: true, ui: true, color: COL[t] === '#8C2F2F' ? '#f0a0a0' : t === 'skill' ? '#a9cfe0' : '#c9b0e8' }); tx -= 10;
    }
    yy += hdrH;
    ids.forEach((id, i) => {
      const cx = x + 20 + (i % 2) * cw, cy = yy + Math.floor(i / 2) * rowPitch;
      const c = CARDS[id];
      g.save(); g.fillStyle = c ? (COL[c.type] || '#888') : '#888'; g.fillRect(cx, cy + 3, 4, Math.max(11, rowSz - 2)); g.restore();
      app.text(names[i], cx + 10, cy, { ...rowO, color: '#efe3c4', size: rowSz, exact: true });
    });
    if (sel) { app.text('SELECTED', x + w - 20, y + ph - 22, { size: 12, ui: true, bold: true, align: 'right', color: labelColor(h.color), fit: { w: 100, lines: 1 } }); }
  },

  // ---- credits ----
  drawCredits(app, keys) {
    const g = app.ctx, k = EASE.out(clamp(this.credK, 0, 1));
    g.save(); g.fillStyle = 'rgba(0,0,0,.66)'; g.fillRect(0, 0, W, H); g.restore();
    const tall = app.scale < 0.95, w = 700, h = tall ? 580 : 500, x = 640 - w / 2, y = (tall ? 70 : 110) + (1 - k) * 24; // phones: a taller panel, so the inflated text keeps a legible size
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
    // the rows share y+82 .. the tagline; phones inflate every label, so take the largest m whose real heights fit
    let M = 0.7; const room = (y + h - 104) - (y + 82), blk = (m, [a, b]) => { const lA = app.layoutText(a, { size: 15 * m, ui: true, bold: true }), lB = app.layoutText(b, { size: 15 * m, lineH: 19 * m, maxW: w - 80 }); return { hA: Math.ceil(lA.size * 1.22), hB: lB.lines.length * lB.lineH }; };
    for (const m of [1, 0.94, 0.88, 0.82, 0.76, 0.7]) { const gap = Math.round(12 * m); if (rows.reduce((n, r) => { const q = blk(m, r); return n + q.hA + 2 + q.hB + gap; }, -gap) <= room) { M = m; break; } }
    let yy = y + 82;
    for (const [a, b] of rows) {
      const q = blk(M, [a, b]);
      app.text(a, x + 40, yy, { size: 15 * M, ui: true, bold: true, color: COL.lamp });
      yy += q.hA + 2;
      app.text(b, x + 40, yy, { size: 15 * M, maxW: w - 80, color: '#e0d4b8', lineH: 19 * M });
      yy += q.hB + Math.round(12 * M);
    }
    app.text('Cut what you love. Stitch what you need.', 640, y + h - 96, { size: 17, italic: true, align: 'center', color: '#d9cba8' });
    if (app.button('Close', 640 - 70, y + h - 60, 140, 42, { size: 18 }) || keys.some((e) => e.key === 'Escape')) this.go(app, 'menu');
    g.restore();
  },
};

const hashStr = hashSeed;
