// Accessibility batch 12 (agent k). DOM and input helpers only, no game rules, no save changes.
//  - ring (circle) stages: the aim is reachable from the keyboard (left and right turn it, up and down and the
//    diagonals snap it) and from the on-screen slide bar (the thumb turns the aim), and a screen reader hears
//    "Aiming: up right" when the aim settles in another one of eight directions (rate limited).
import { announce } from './access.js';

const TAU = Math.PI * 2;
export const AIM_NAMES = ['right', 'down right', 'down', 'down left', 'left', 'up left', 'up', 'up right'];
// canvas angle (0 = right, PI/2 = down, y grows downward) to one of eight words
export function aimWords(a) {
  if (!isFinite(a)) return AIM_NAMES[6];
  const i = Math.round((((a % TAU) + TAU) % TAU) / (TAU / 8)) % 8;
  return AIM_NAMES[i];
}
export const aimSpeech = a => 'Aiming: ' + aimWords(a);

// keys that snap the aim: up/down alone or with left/right make the eight compass directions. Left or right alone returns null
// (those keys turn the aim smoothly). keys uses lower case names like the game does.
export function keyAim(keys) {
  const up = !!(keys.arrowup || keys.w), dn = !!(keys.arrowdown || keys.s), lf = !!(keys.arrowleft || keys.a), rt = !!(keys.arrowright || keys.d);
  const v = (dn ? 1 : 0) - (up ? 1 : 0), h = (rt ? 1 : 0) - (lf ? 1 : 0);
  if (!v) return null;
  return h ? Math.atan2(v, h) : v < 0 ? -Math.PI / 2 : Math.PI / 2;
}

// the slide bar (left handed or not) turns the aim in ring stages: sdx in -1..1, dt in seconds. Returns the new target angle.
export const SLIDER_TURN = 3.4;   // radians per second at full deflection
export const sliderAim = (tgt, sdx, dt) => tgt + Math.max(-1, Math.min(1, +sdx || 0)) * SLIDER_TURN * dt;

// rate limited announcer. st is {sec, since, said, at}; call every frame with the eased aim and the clock in ms.
// The new direction must hold for SETTLE ms and at least GAP ms must have passed since the last line. Returns the line or ''.
export const AIM_SETTLE = 350, AIM_GAP = 1500;
export function aimStep(st, angle, nowMs) {
  const w = aimWords(angle);
  if (st.sec !== w) { st.sec = w; st.since = nowMs; }
  if (st.said === undefined) { st.said = w; st.at = nowMs; return ''; }   // the start direction is read with the stage start line
  if (w === st.said || nowMs - st.since < AIM_SETTLE || nowMs - st.at < AIM_GAP) return '';
  st.said = w; st.at = nowMs; return 'Aiming: ' + w;
}
export const newAimState = () => ({ sec: '', since: 0, said: undefined, at: 0 });
let live = newAimState();
export function resetAimSr() { live = newAimState(); }
export function watchAim(angle, nowMs = Date.now()) { const s = aimStep(live, angle, nowMs); if (s) announce(s); return s; }

// the game field's name tells keyboard and screen reader players how this stage is steered
export const FIELD_LABEL = 'Game field. The duo slides left and right and shoots up on its own. Keys: arrows or A and D to move, space for Encore, P to pause.';
export const RING_LABEL = 'Game field. The duo stands in the middle of the circle and shoots where it aims. Keys: left and right arrows or A and D turn the aim, up and down arrows snap it, up with left or right aims diagonally, space for Encore, P to pause. The aim is spoken, for example: Aiming: up right.';
export function setFieldLabel(ring) { if (typeof document === 'undefined') return; const c = document.getElementById('c'); if (c) c.setAttribute('aria-label', ring ? RING_LABEL : FIELD_LABEL); const sl = document.getElementById('accSlider'); if (sl) sl.setAttribute('aria-label', ring ? 'Aim bar. Slide left to turn the aim anticlockwise, right for clockwise.' : 'Slide bar'); }
