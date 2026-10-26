// Drop the Bass: the doodle HUD toolkit, effects layer and battle view, headless. Every export of doodle_hud.js draws on a mock ctx without throwing and keeps
// save/restore balanced, both styles work through hudx.js, the Fx draw methods work in both styles, the doodle effects use no glow/additive/gradient,
// and the doodle files never touch Math.random, Date or an em dash.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as DH from '../drop_the_bass/js/doodle_hud.js';
import * as HX from '../drop_the_bass/js/hudx.js';
import * as DFX from '../drop_the_bass/js/doodle_fx.js';
import { Fx } from '../drop_the_bass/js/fx.js';
import { setStyle } from '../drop_the_bass/js/style.js';
import { drawGlyph } from '../drop_the_bass/js/art_entities.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mock() {
  const st = { saves: 0, restores: 0, calls: 0, nan: 0, comp: new Set(), grad: 0, filter: 0 };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => { st.grad++; return { addColorStop() {} }; };
      if (k === 'createPattern') return () => ({});
      if (k === 'canvas') return { width: 540, height: 960 };
      if (k in t) return t[k];
      return (...a) => { st.calls++; for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) st.nan++; };
    },
    set(t, k, v) { if (k === 'globalCompositeOperation') st.comp.add(v); if (k === 'filter') st.filter++; t[k] = v; return true; },
  });
  return ctx;
}
const bal = (c, m) => { ok(c.__st.saves === c.__st.restores, m + ' save/restore balanced'); ok(c.__st.nan === 0, m + ' no NaN'); };

// ---- every export of doodle_hud
const expected = ['FONT', 'darken', 'lighten', 'mix', 'rgba', 'setHudScale', 'setHudTime', 'rrectPath', 'rrect', 'glass', 'button', 'liquidBar', 'bezel', 'text', 'wrapText', 'rgba'];
for (const k of new Set(expected)) ok(k in DH, 'doodle_hud exports ' + k);
ok(typeof DH.FONT === 'string' && DH.FONT.includes('Patrick Hand'), 'hand-drawn font first');
function exercise(H, label) {
  H.setHudScale(2); if (H.setHudTime) H.setHudTime(1.3);
  const c = mock();
  H.glass(c, 10, 10, 190, 44, 14, { edge: '#5b3fd0' }); H.glass(c, 10, 10, 80, 30, 10, { edge: '#ff4a5e', glow: '#ff4a5e', glowA: 0.5 }); H.glass(c, 0, 0, 300, 60, 18, {});
  for (const col of ['#e63c9a', '#2a74b8', '#33266e', '#b9b3c8']) {
    H.button(c, { x: 20, y: 20, w: 170, h: 46 }, col, { label: 'START WAVE 1', sub: 'tap to begin', size: 17 });
    H.button(c, { x: 20, y: 20, w: 58, h: 68 }, col, { icon: 'merge', glyph: drawGlyph, sub: 'MERGE', size: 13, press: 1, dim: true });
    H.button(c, { x: 20, y: 20, w: 204, h: 92 }, col, { radius: 22, press: 0.5, glow: 0.4, glowColor: '#fff', shine: 0.3 });
  }
  for (const f of [0, 0.3, 1]) H.liquidBar(c, 50, 20, 120, 22, f, '#2fd36a', '#9dff7a', 2.2, { lag: Math.min(1, f + 0.2), ticks: [0.33, 0.66], glow: 0.4 });
  H.bezel(c, 40, 40, 17, '#ffc83d'); H.bezel(c, 40, 40, 44, '#6a5ba8', {});
  H.text(c, 'DROP', 10, 10, 27, '#fff', 'left', 900, { glow: '#ff9ad6', blur: 8 }); H.text(c, 'x', 10, 10, 12, '#fff', 'center'); H.text(c, 'WAVE 5/20', 0, 0, 19, '#fff', 'right');
  H.text(c, 'a very long line of text that is not coverable by the kit font!', 5, 5, 30, '#fff', 'center');
  H.text(c, '', 0, 0, 20, '#fff'); H.text(c, 12345, 0, 0, 24, '#fff');
  H.wrapText(c, 'Merge two of the same level to power up your speakers.', 10, 10, 300, 16, 20, '#241140', 'left');
  H.rrect(c, 0, 0, 10, 10, 4); H.rrectPath(c, 0, 0, 10, 10, 4);
  ok(typeof H.mix('#ff0000', 0.5) === 'string' && typeof H.lighten('#336699', 0.2) === 'string' && typeof H.darken('#336699', 0.2) === 'string' && typeof H.rgba('#336699', 0.5) === 'string', label + ' colour helpers');
  bal(c, label); ok(c.__st.calls > 20, label + ' draws something');
  // determinism of the call stream at a fixed time
  const a = mock(), b = mock(); H.glass(a, 0, 0, 200, 50, 14, { edge: '#abc123' }); H.glass(b, 0, 0, 200, 50, 14, { edge: '#abc123' }); ok(a.__st.calls === b.__st.calls, label + ' deterministic');
}
exercise(DH, 'doodle_hud');
setStyle('doodle'); exercise(HX, 'hudx(doodle)');
setStyle('classic'); exercise(HX, 'hudx(stored classic is ignored)');
setStyle('doodle');

// ---- the Fx layer in both styles, with every kind of effect alive
function fxScene(fx) {
  fx.burst(100, 100, ['#ff5fb0', '#9dff3a'], 30); fx.sparks(120, 100, '#ffc83d', 10); fx.confetti(200, 200, 20); fx.muzzle(100, 100, 0.7, '#ff9226');
  fx.ring(100, 100, 120, '#ffc83d', { fill: true }); fx.ring(50, 50, 40, '#2fe6ff'); fx.line(10, 10, 200, 200, '#fff'); fx.chain([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 90, y: 20 }], '#2fe6ff');
  fx.cone(100, 100, 0.5, 120, 0.4, '#ff5fb0'); fx.light(100, 100, 60, '#ffc83d'); fx.pillar(300, 400, '#9dff3a'); fx.raysBurst(270, 400, '#ffd23c'); fx.aurora('#ff5fb0');
  for (let i = 0; i < 6; i++) fx.trail(1, 10 + i * 10, 10 + i * 5, '#ffb070');
  fx.floater(100, 100, '1234', '#ff9226', 18); fx.floater(140, 100, 'CRIT 99', '#ffc83d', 26, { crit: true }); fx.floater(180, 100, '+5 coins', '#fff', 14); fx.floater(220, 100, 'Weird * chars?', '#fff', 16); fx.floater(260, 100, '', '#fff', 16);
  fx.addShake(10); fx.addChroma(1); fx.doFlash('#ff2a4a', 0.5);
}
for (const style of ['doodle']) {
  setStyle(style);
  const fx = new Fx(); fxScene(fx);
  const c = mock();
  for (let i = 0; i < 40; i++) {
    fx.update(1 / 30); if (i === 20) fxScene(fx);
    fx.drawWorld(c); fx.drawFloaters(c); fx.drawScreenLight(c, 540, 960); fx.speedLines(c, 540, 960, 3);
    fx.post(c, { stage: 'world', cw: 540, ch: 960, dpr: 1, beat: 0.5 }); fx.post(c, { stage: 'grade', cw: 540, ch: 960, dpr: 1, accent: '#ff5fb0', hp: 0.15, beat: 0.3 }); fx.post(c, { cw: 540, ch: 960, dpr: 2, hp: 1 });
    fx.drawFlash(c, 540, 960);
  }
  bal(c, 'Fx ' + style);
  if (style === 'doodle') {
    ok(!c.__st.comp.has('lighter') && !c.__st.comp.has('screen') && !c.__st.comp.has('overlay') && !c.__st.comp.has('multiply'), 'doodle Fx uses no additive/screen/overlay/multiply blend');
    ok(c.__st.grad === 0, 'doodle Fx creates no gradients'); ok(c.__st.filter === 0, 'doodle Fx uses no canvas filter/blur');
  } else ok(c.__st.comp.has('lighter'), 'classic Fx still glows');
}
setStyle('doodle');
// doodle_fx direct: hurt border, empty fx
{ const fx = new Fx(), c = mock(); DFX.hurt(fx, c, 540, 960, 1, 1); DFX.hurt(fx, c, 540, 960, 2, 0); DFX.drawFlash(fx, c, 540, 960); DFX.drawFloaters(fx, c); DFX.drawWorld(fx, c); bal(c, 'doodle_fx empty'); }
// many distinct damage numbers must not grow memory without bound (text cache is capped)
{ const fx = new Fx(), c = mock(); for (let i = 0; i < 400; i++) { fx.floater(50, 50, String(1000 + i * 7), '#ff9226', 16); fx.update(0.016); DFX.drawFloaters(fx, c); } ok(fx.floats.length <= 60, 'floaters capped'); }

// ---- source hygiene
for (const f of ['doodle_hud.js', 'doodle_fx.js', 'doodle_battle.js']) {
  const src = readFileSync(new URL('../drop_the_bass/js/' + f, import.meta.url), 'utf8');
  ok(!/Math\.random|Date\.now|new Date|performance\.now/.test(src), f + ' has no unseeded randomness or clock'); ok(!src.includes(String.fromCharCode(8212)), f + ' has no em dash');
}
for (const f of ['doodle_fx.js', 'doodle_battle.js']) {
  const src = readFileSync(new URL('../drop_the_bass/js/' + f, import.meta.url), 'utf8');
  ok(!/'lighter'|'screen'|createRadialGradient|createLinearGradient|shadowBlur|drawGlow|\.filter\s*=/.test(src), f + ' has no glow, additive blend, gradient, blur or filter');
}
ok(!readFileSync(new URL('../drop_the_bass/ui_doodle.css', import.meta.url), 'utf8').includes(String.fromCharCode(8212)), 'ui_doodle.css has no em dash');
console.log('drop_the_bass doodle_hud: ' + n + ' checks passed');
