// Accessibility kit: colourblind palettes + simulation, flash limiter, high contrast, gamepad -> key bridge, live announcements.
// Pure enough to run headless (no DOM needed). Install once with installA11y(app); main.js calls applySettings(app) every frame.
import { COL } from './core.js';
import { FX_OPTS, flashGate } from './fx.js';
import { SCHOOL_COLORS, COLX, CB, clearCardCache } from '../art/cards.js';

export const A11Y_DEFAULTS = { flashes: true, highContrast: false, colorblindMode: 'deuteranopia', announce: true };
export const CB_MODES = ['deuteranopia', 'protanopia', 'tritanopia'];
export const SCHOOLS = ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded'];
export const SCHOOL_PATTERNS = { ember: 'diag', echo: 'waves', hoard: 'dots', blood: 'drops', rust: 'cross', static: 'zig', gilded: 'check' };
export const BASE_SCHOOLS = { ember: '#E8571F', echo: '#6CC6D6', hoard: '#B8922A', blood: '#A3142F', rust: '#8F4A2A', static: '#D9E84A', gilded: '#EFD98F' };
// Palettes found by searching for the best worst-case CIE76 distance between the seven schools under each simulated deficiency. Shapes and patterns carry the rest.
export const PALETTES = {
  deuteranopia: { ember: '#791515', echo: '#3CA7DD', hoard: '#1FAD7E', blood: '#3C3CDD', rust: '#272768', static: '#3CDD3C', gilded: '#F4F4BE' },
  protanopia: { ember: '#943838', echo: '#3CA7DD', hoard: '#587915', blood: '#713CDD', rust: '#272768', static: '#3CDD3C', gilded: '#EAEAC8' },
  tritanopia: { ember: '#DD3C71', echo: '#155879', hoard: '#DDA73C', blood: '#A73CDD', rust: '#793715', static: '#3CDD3C', gilded: '#C8EAC8' },
};

// ---- colour maths (Machado 2009, severity 1.0, linear RGB) ----
const M = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const gam = (v) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
export function simulate(hex, mode) {
  const m = M[mode], c = hexRgb(hex).map(lin);
  return m ? m.map((r) => gam(r[0] * c[0] + r[1] * c[1] + r[2] * c[2])) : hexRgb(hex);
}
function lab(rgb) {
  const [r, g, b] = rgb.map(lin);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z); return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function deltaE(a, b) { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
// smallest perceived distance between any two school colours as seen through `mode`
export function minSeparation(pal, mode) {
  let best = 1e9;
  for (let i = 0; i < SCHOOLS.length; i++) for (let j = i + 1; j < SCHOOLS.length; j++) best = Math.min(best, deltaE(simulate(pal[SCHOOLS[i]], mode), simulate(pal[SCHOOLS[j]], mode)));
  return best;
}

// ---- settings ----
export function a11yOf(app) {
  const meta = app.shared && app.shared.meta; if (!meta) return { ...A11Y_DEFAULTS, colorblind: false };
  const s = meta.settings || (meta.settings = {});
  for (const k of Object.keys(A11Y_DEFAULTS)) if (s[k] === undefined) s[k] = A11Y_DEFAULTS[k];
  if (!CB_MODES.includes(s.colorblindMode)) s.colorblindMode = 'deuteranopia';
  return s;
}
let curPal = null;
export function applyPalette(mode) {
  const pal = mode && PALETTES[mode] ? PALETTES[mode] : BASE_SCHOOLS, key = mode || 'off';
  if (curPal === key) return false; curPal = key;
  for (const k of SCHOOLS) { COL[k] = pal[k]; SCHOOL_COLORS[k] = pal[k]; COLX[k] = pal[k]; }
  CB.on = key !== 'off';
  return true;
}
// Called every frame from main.js overlay (cheap). Returns nothing.
export function applySettings(app) {
  const s = a11yOf(app);
  FX_OPTS.flashes = s.flashes !== false;
  app.highContrast = !!s.highContrast;
  if (applyPalette(s.colorblind ? s.colorblindMode : null)) { try { clearCardCache(); } catch { /* ignore */ } }
}

// ---- flash limiter: never more than 3 flashes in any one second ----
export const flashAllowed = flashGate;
export function resetFlashes() { flashGate.reset(); }

// ---- live announcements ----
// A visually hidden aria-live region. Without a DOM the lines are only logged in app.a11y.log (tests read that).
export function installA11y(app) {
  if (app.a11y) return app.a11y;
  const A = app.a11y = { log: [], last: '', lastAt: -9, polite: null, assertive: null, pad: { held: {} }, announce, pollPad };
  function region(live) {
    try {
      if (typeof document === 'undefined' || !document.body || !document.body.appendChild || !document.createElement) return null;
      const el = document.createElement('div');
      el.setAttribute('role', live === 'assertive' ? 'alert' : 'status'); el.setAttribute('aria-live', live); el.setAttribute('aria-atomic', 'true');
      el.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
      document.body.appendChild(el); return el;
    } catch { return null; }
  }
  function announce(text, assertive) {
    if (!text) return false;
    const st = app.shared && app.shared.meta && app.shared.meta.settings; if (st && st.announce === false) return false;
    if (text === A.last && app.t - A.lastAt < 1) return false;
    A.last = text; A.lastAt = app.t; A.log.push(text); if (A.log.length > 200) A.log.shift();
    const key = assertive ? 'assertive' : 'polite'; if (A[key] === null) A[key] = region(key) || false;
    if (A[key]) A[key].textContent = text;
    return true;
  }
  app.announce = announce;
  const prev = app.preTick; app.preTick = (a, dt) => { if (prev) prev(a, dt); pollPad(a); };
  return A;
}

// ---- gamepad -> keys, so the same focus system and per-screen key handlers serve both ----
export const PAD_MAP = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 0: 'Enter', 1: 'Escape', 3: 'i', 2: 'e', 9: 'Pause', 4: 'ArrowLeft', 5: 'ArrowRight', 6: 'g' }; // 6 = left trigger: Odile's declaration (ui/seam_ui.js)
export function padKeys(pad, held) {
  // returns the keys newly pressed this poll; held is the per-pad edge state
  const out = [], now = {};
  const down = (k) => { now[k] = true; if (!held[k]) out.push(k); };
  const b = pad.buttons || [];
  for (const i of Object.keys(PAD_MAP)) if (b[i] && (b[i].pressed || b[i].value > 0.6)) down(PAD_MAP[i]);
  const ax = pad.axes || [], x = ax[0] || 0, y = ax[1] || 0;
  if (x < -0.55) down('ArrowLeft'); else if (x > 0.55) down('ArrowRight');
  if (y < -0.55) down('ArrowUp'); else if (y > 0.55) down('ArrowDown');
  for (const k of Object.keys(held)) delete held[k];
  Object.assign(held, now);
  return out;
}
export function injectKey(app, key, extra) {
  const e = { key, gamepad: true, shiftKey: false, preventDefault() {}, ...extra };
  app.pressedKeys.push(e); return e;
}
function pollPad(app) {
  let pads = null;
  try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null; } catch { pads = null; }
  if (app.testPads) pads = app.testPads;
  if (!pads) return;
  for (const pad of pads) {
    if (!pad) continue;
    for (const k of padKeys(pad, app.a11y.pad.held)) injectKey(app, k);
    break;
  }
}

// ---- combat watcher: announce turn start, damage taken, enemy intents, victory and defeat ----
export function intentWords(c, intentOf) {
  const parts = [];
  for (const e of c.enemies) {
    if (e.dead) continue;
    let w = '';
    try { w = intentOf(e); } catch { w = ''; }
    parts.push((e.def && e.def.name || 'Enemy') + (w ? ' ' + w : ''));
  }
  return parts.join('. ');
}
export function watchCombat(app, c, intentOf) {
  const A = app.a11y; if (!A || !c) return;
  const w = A.watch && A.watch.c === c ? A.watch : (A.watch = { c, turn: -1, hp: c.player.hp, over: false });
  const turn = c.turn === undefined ? 0 : c.turn;
  if (turn !== w.turn && !c.over) {
    w.turn = turn;
    const ints = intentOf ? intentWords(c, intentOf) : '';
    A.announce(`Turn ${turn}. Energy ${c.energy}. Health ${c.player.hp}.${ints ? ' Enemies: ' + ints + '.' : ''}`, false);
  }
  if (c.player.hp < w.hp) A.announce(`You take ${w.hp - c.player.hp} damage. Health ${c.player.hp}.`, true);
  w.hp = c.player.hp;
}
// Called by the combat screen when the ending animation starts, so the line matches what the player sees.
export function announceEnding(app, win) {
  if (app.a11y) app.a11y.announce(win ? 'Victory. The fight is won.' : 'Defeat. You have fallen.', true);
}
