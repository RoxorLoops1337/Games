// SHOWMANSHIP moves (POSE): the eight dance moves of the pose game as procedural clips, built ON TOP of the public animator (char_anim.js exports its clip table CL;
// char_clips.js registers its clips the same way). Every clip here is prefixed 'pz_' so nothing in characters.js / char_*.js changes behaviour.
//   MOVES[id] = { id, word, short, color, keys, sfx }   ids: left right duck jump point spin freeze clap (the order of Core.POSE_LEVELS moves)
//   performMove(char, id, spb)    starts the move clip (one-shot, returns to the 'pz_groove' bounce), records root motion (spin turn, jump lift) for rootMotion()
//   rootMotion(char, dt)          per frame: the whole-body turn for SPIN (the clip only poses the limbs; the object turns), returns { spin, air } for fx
//   groove(char, beat, amp)       the between-moves bounce on the metronome
// Rig space (char_anim.js): +z forward (towards the camera on the pose stage), character LEFT = +x. The pose game is seen from the front, so screen LEFT = rig -x
// = the character's RIGHT side: "STEP LEFT" is a step to the right foot side, which is the player's left on screen (mirror rule of a dance class).
import { CL, stance, sm, clamp, lerp } from './char_anim.js';
const PI = Math.PI, TAU = PI * 2, S = Math.sin, Cs = Math.cos;

export const MOVE_IDS = ['left', 'right', 'duck', 'jump', 'point', 'spin', 'freeze', 'clap'];
export const MOVES = {
  left: { id: 'left', word: 'STEP LEFT', short: 'LEFT', color: '#2ee6ff', keys: ['ArrowLeft', 'KeyA'], keyLabel: '←', sfx: 'step' },
  right: { id: 'right', word: 'STEP RIGHT', short: 'RIGHT', color: '#ff3ea5', keys: ['ArrowRight', 'KeyD'], keyLabel: '→', sfx: 'step' },
  duck: { id: 'duck', word: 'DUCK', short: 'DUCK', color: '#9dff4a', keys: ['ArrowDown', 'KeyS'], keyLabel: '↓', sfx: 'swoosh' },
  jump: { id: 'jump', word: 'JUMP', short: 'JUMP', color: '#ffd23f', keys: ['ArrowUp', 'KeyW'], keyLabel: '↑', sfx: 'go' },
  point: { id: 'point', word: 'POINT', short: 'POINT', color: '#b07bff', keys: ['KeyQ', 'KeyJ'], keyLabel: 'Q', sfx: 'hit_good' },
  spin: { id: 'spin', word: 'SPIN', short: 'SPIN', color: '#ff8a3d', keys: ['KeyE', 'KeyK'], keyLabel: 'E', sfx: 'whoosh' },
  freeze: { id: 'freeze', word: 'FREEZE', short: 'FREEZE', color: '#9fe9ff', keys: ['KeyF', 'KeyL'], keyLabel: 'F', sfx: 'record' },
  clap: { id: 'clap', word: 'CLAP', short: 'CLAP', color: '#fff2a8', keys: ['Space'], keyLabel: 'SPACE', sfx: 'clap' },
};
export const KEYMAP = {}; MOVE_IDS.forEach((id) => MOVES[id].keys.forEach((k) => { KEYMAP[k] = id; }));

// attack / hold envelope: snaps into the pose in about 0.09 s (the accent lands on the beat), holds, then the crossfade back to the groove takes over
const hit = (t, a) => sm(t / (a || 0.09));
const face = (P, open, brow, smile) => { P.mouthOpen = open; P.brow = brow; P.smile = smile === undefined ? 1.3 : smile; P.cheek = 0.2; };

// ----- groove: bounce on the beat between moves (opts.phase = beats), knees pulse, shoulders roll, head nods
CL.pz_groove = function (P, c, dt, o) {
  const b = o.phase !== undefined ? o.phase : c.t * (o.bpm || 96) / 60, amp = o.amp === undefined ? 1 : o.amp, q = 0.5 + 0.5 * Cs(b * TAU), sw = S(b * PI);
  P.hipsY = -0.025 - 0.035 * q * amp; P.hipsX = 0.018 * sw * amp; P.hipsRZ = -0.04 * sw * amp; P.chestRZ = 0.05 * sw * amp; P.chestRY = 0.08 * sw * amp; P.spineRX = 0.03;
  P.neckRX = 0.03 + 0.07 * q * amp; P.headRZ = 0.05 * sw * amp; P.headRX = 0.02;
  stance(P, 0.13, 0.25);
  P.aWL = P.aWR = 1; P.aXL = 0.27; P.aXR = -0.27; P.aYL = 0.68 + 0.05 * q * amp + 0.04 * Math.max(0, sw); P.aYR = 0.68 + 0.05 * q * amp + 0.04 * Math.max(0, -sw); P.aZL = P.aZR = 0.16;
  P.pXL = 0.7; P.pXR = -0.7; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.3; P.shrug = 0.3 * q * amp; face(P, 0.12, 0.15, 1.2);
};

// ----- step left (screen left = rig -x): wide step out on the right foot, weight over it, right arm thrown out flat, left fist on the chest, head whips to the side
function step(P, c, s) {           // s = -1 screen left, +1 screen right
  const t = c.t, k = hit(t, 0.1), up = S(PI * clamp(t / 0.11, 0, 1)), R = s < 0 ? 'R' : 'L', L = s < 0 ? 'L' : 'R', bounce = Math.exp(-Math.max(0, t - 0.1) * 10) * k;
  P.hipsX = 0.11 * s * k; P.hipsY = -0.05 * k - 0.03 * bounce; P.hipsRZ = -0.07 * s * k; P.chestRZ = 0.1 * s * k; P.chestRY = 0.14 * s * k; P.headRY = 0.45 * s * k; P.headRZ = 0.12 * s * k; P.neckRY = 0.15 * s * k; P.spineRX = 0.04;
  P.lWL = P.lWR = 1; P['lX' + R] = s * lerp(0.12, 0.33, k); P['lX' + L] = -s * lerp(0.12, 0.03, k); P.lYL = P.lYR = 0.085; P['lY' + R] += 0.1 * up * (1 - k * 0.5); P.lZL = P.lZR = 0; P['fY' + R] = (R === 'L' ? 1 : -1) * 0.45; P['fY' + L] = (L === 'L' ? 1 : -1) * 0.15;
  P['aW' + R] = 1; P['aX' + R] = s * lerp(0.28, 0.6, k); P['aY' + R] = lerp(0.7, 0.98, k); P['aZ' + R] = lerp(0.16, 0.06, k); P['p' + 'X' + R] = s * 0.2; P['pY' + R] = -1; P['pZ' + R] = -0.6; P['hW' + R] = k; P['hX' + R] = s; P['hY' + R] = 0.15; P['hZ' + R] = 0;
  P['aW' + L] = 1; P['aX' + L] = -s * 0.02; P['aY' + L] = 0.84; P['aZ' + L] = 0.24; P['pX' + L] = -s; P['pY' + L] = -0.4; P['pZ' + L] = 0;
  face(P, 0.35 + 0.2 * bounce, 0.4);
}
CL.pz_left = function (P, c) { step(P, c, -1); };
CL.pz_right = function (P, c) { step(P, c, 1); };

// ----- duck: deep squat, leaning in, forearms crossed in front of the face, eyes squeezed
CL.pz_duck = function (P, c) {
  const t = c.t, k = hit(t, 0.08), w = Math.exp(-Math.max(0, t - 0.08) * 8) * k;
  P.hipsY = -0.25 * k - 0.02 * w; P.hipsZ = -0.04 * k; P.hipsRX = 0.32 * k; P.spineRX = 0.16 * k; P.chestRX = 0.08 * k; P.neckRX = -0.12 * k; P.headRX = -0.06 * k; P.sq = -0.05 * w;
  stance(P, lerp(0.12, 0.2, k), lerp(0.2, 0.55, k));
  P.aWL = P.aWR = 1; P.aXL = -0.05; P.aXR = 0.05; P.aYL = lerp(0.7, 0.9, k); P.aYR = lerp(0.7, 0.86, k); P.aZL = P.aZR = lerp(0.18, 0.36, k); P.pXL = 1; P.pXR = -1; P.pYL = P.pYR = -0.7; P.pZL = P.pZR = 0;
  P.shrug = 1.2 * k; face(P, 0.45, 0.6, 0.6); P.eyeH = 1 - 0.45 * k; P.frown = 0.3 * k;
};

// ----- jump: quick crouch, a star jump (feet tucked, arms in a V), squash on landing. c.st.air (0..1) is read by rootMotion for the shadow / dust
CL.pz_jump = function (P, c, dt, o) {
  const t = c.t, T = clamp((o.spb || 0.6) * 0.62, 0.3, 0.42), cr = t < 0.06 ? sm(t / 0.06) : 0, u = clamp((t - 0.06) / T, 0, 1), air = t >= 0.06 && u < 1 ? S(u * PI) : 0, land = u >= 1 ? Math.exp(-(t - 0.06 - T) * 9) : 0, set = sm((t - 0.06) / 0.08);
  c.st.air = air;
  P.hipsY = -0.08 * cr + 0.34 * air - 0.08 * land; P.hipsRX = 0.12 * cr - 0.06 * air + 0.1 * land; P.spineRX = 0.06 * cr; P.chestRX = -0.1 * air; P.neckRX = -0.12 * air; P.headRX = -0.06 * air; P.sq = -0.06 * cr + 0.1 * air - 0.08 * land;
  P.lWL = P.lWR = 1; P.lXL = 0.12 + 0.07 * air; P.lXR = -0.12 - 0.07 * air; P.lYL = P.lYR = 0.085 + 0.34 * air + 0.15 * air; P.lZL = P.lZR = -0.06 * air; P.fPL = P.fPR = -0.55 * air; P.fYL = 0.2; P.fYR = -0.2;
  P.aWL = P.aWR = 1; P.aXL = lerp(0.24, 0.4, set); P.aXR = -lerp(0.24, 0.4, set); P.aYL = P.aYR = lerp(0.62, 1.24, set) + 0.34 * air - 0.08 * land - 0.06 * cr; P.aZL = P.aZR = 0.08; P.pXL = 0.8; P.pXR = -0.8; P.pYL = P.pYR = -0.2; P.pZL = P.pZR = -0.6;
  P.hWL = P.hWR = set; P.hXL = 0.5; P.hXR = -0.5; P.hYL = P.hYR = 1; P.hZL = P.hZR = 0.1;
  face(P, 0.75, 0.75, 1.5); P.mouthW = 1.15;
};

// ----- point: the disco point. Right arm (screen left) up and out at the sky, left hand on the hip, hip popped the other way, chin up after the hand
CL.pz_point = function (P, c) {
  const t = c.t, k = hit(t, 0.09), jab = Math.exp(-Math.max(0, t - 0.09) * 7) * k;
  P.hipsX = 0.07 * k; P.hipsRZ = 0.1 * k; P.hipsY = -0.03 * k; P.chestRZ = -0.12 * k; P.chestRY = -0.2 * k; P.chestRX = -0.05 * k; P.neckRY = -0.12 * k; P.headRY = -0.3 * k; P.headRX = -0.22 * k; P.headRZ = -0.08 * k;
  P.lWL = P.lWR = 1; P.lXL = 0.15; P.lXR = -0.1; P.lYL = P.lYR = 0.085; P.lZL = 0; P.lZR = 0.06 * k; P.fYL = 0.35; P.fYR = -0.1;
  P.aWR = 1; P.aXR = lerp(-0.27, -0.44, k) - 0.02 * jab; P.aYR = lerp(0.7, 1.26, k) + 0.03 * jab; P.aZR = lerp(0.16, 0.14, k); P.pXR = -1; P.pYR = -0.2; P.pZR = -0.3; P.hWR = k; P.hXR = -0.6; P.hYR = 0.8; P.hZR = 0.15;
  P.aWL = 1; P.aXL = 0.28; P.aYL = 0.6; P.aZL = 0.03; P.pXL = 1; P.pYL = -0.2; P.pZL = -0.7; P.hWL = 0;
  face(P, 0.3 + 0.25 * jab, 0.45, 1.4); P.browTilt = -0.2;
};

// ----- spin: arms flung wide, one foot tucked to the knee (passe) while the root object turns a full circle (rootMotion), arms snap up in a V at the end
CL.pz_spin = function (P, c, dt, o) {
  const t = c.t, T = c.st.T || 0.45, k = hit(t, 0.06), u = clamp(t / T, 0, 1), done = sm((t - T) / 0.1), mid = S(u * PI);
  P.hipsY = -0.02 + 0.03 * mid - 0.03 * done; P.chestRX = -0.04; P.headRX = -0.05; P.sq = 0.04 * mid;
  P.lWL = P.lWR = 1; P.lXR = -0.03; P.lYR = 0.085; P.lZR = 0; P.lXL = lerp(0.12, 0.05, k * (1 - done)); P.lYL = 0.085 + 0.24 * k * (1 - done); P.lZL = 0.05 * k * (1 - done); P.fPL = -0.4 * k * (1 - done); P.fYL = 0.2; P.fYR = 0;
  const ay = lerp(lerp(0.7, 0.98, k), 1.22, done), ax = lerp(lerp(0.27, 0.55, k), 0.36, done);
  P.aWL = P.aWR = 1; P.aXL = ax; P.aXR = -ax; P.aYL = P.aYR = ay; P.aZL = P.aZR = 0.05; P.pXL = 0.3; P.pXR = -0.3; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.5; P.hWL = P.hWR = 0.6; P.hXL = 1; P.hXR = -1; P.hYL = P.hYR = 0.3 + done; P.hZL = P.hZR = 0;
  face(P, 0.25 + 0.45 * done, 0.3 + 0.4 * done, 1.4); void o;
};

// ----- freeze: b-boy stance. Arms folded high on the chest, lean back, chin up and tilted, wide planted feet, cool closed smile, and dead still (no bounce)
CL.pz_freeze = function (P, c) {
  const t = c.t, k = hit(t, 0.07), j = Math.exp(-Math.max(0, t - 0.07) * 14) * k;
  P.hipsY = -0.05 * k; P.hipsRX = -0.06 * k; P.hipsRY = 0.15 * k; P.chestRX = -0.1 * k; P.chestRY = -0.12 * k; P.neckRX = -0.06 * k; P.headRX = -0.14 * k; P.headRZ = 0.16 * k; P.headRY = 0.12 * k; P.sq = -0.03 * j;
  stance(P, lerp(0.12, 0.2, k), lerp(0.2, 0.55, k));
  P.aWL = P.aWR = 1; P.aXL = -0.1; P.aXR = 0.11; P.aYL = 0.88; P.aYR = 0.84; P.aZL = 0.21; P.aZR = 0.24; P.pXL = 1; P.pXR = -1; P.pYL = P.pYR = -0.1; P.pZL = P.pZR = -0.2;
  P.shrug = 0.6 * k; face(P, 0.04, -0.35, 1.5); P.browTilt = -0.4; P.eyeH = 0.78;
};

// ----- clap: hands swing in and meet high over the head on the beat (spark there), knees dip with it
CL.pz_clap = function (P, c) {
  const t = c.t, m = t < 0.08 ? sm(t / 0.08) : Math.max(0.55, 1 - (t - 0.08) * 2.2), dip = Math.exp(-Math.max(0, t - 0.08) * 9) * sm(t / 0.08);
  P.hipsY = -0.03 - 0.05 * dip; P.chestRX = -0.06; P.neckRX = -0.1; P.headRX = -0.1; P.sq = -0.03 * dip;
  stance(P, 0.14, 0.3);
  const x = lerp(0.36, 0.03, m), y = lerp(0.98, 1.24, m);
  P.aWL = P.aWR = 1; P.aXL = x; P.aXR = -x; P.aYL = P.aYR = y; P.aZL = P.aZR = 0.12; P.pXL = 0.9; P.pXR = -0.9; P.pYL = P.pYR = -0.3; P.pZL = P.pZR = -0.5;
  P.hWL = P.hWR = m; P.hXL = -0.3; P.hXR = 0.3; P.hYL = P.hYR = 1; P.hZL = P.hZR = 0.1;
  face(P, 0.6 + 0.3 * dip, 0.6, 1.5); P.mouthW = 1.12;
};
MOVE_IDS.forEach((id) => { CL['pz_' + id].restart = true; });

// ======================================================================== driving a character
// performMove: the clip runs for `hold` seconds then the animator returns to 'pz_groove' by itself
export function performMove(ch, id, spb) {
  if (!ch || !MOVES[id]) return; spb = spb || 0.6;
  const hold = clamp(spb * 0.86, 0.36, 0.7), st = ch.__pz || (ch.__pz = { spin: 0, spinT: 0, spinDur: 0.45, air: 0, last: '' });
  ch.play('pz_' + id, { duration: hold, then: 'pz_groove', fade: 0.05, spb });
  if (id === 'spin') { st.spinDur = clamp(spb * 0.78, 0.32, 0.5); st.spin = 0; st.spinT = 0; st.spinning = true; const cur = ch.anim && ch.anim.cur; if (cur) cur.st.T = st.spinDur; }
  st.last = id; st.lastT = 0;
}
// the whole-body turn of SPIN (ease in-out over spinDur) and the jump height for fx. Call every frame after ch.update.
export function rootMotion(ch, dt, baseYaw) {
  const st = ch.__pz || (ch.__pz = { spin: 0, spinT: 0, spinDur: 0.45, air: 0, last: '' });
  if (st.spinning) { st.spinT += dt; const u = clamp(st.spinT / st.spinDur, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; st.spin = e * TAU; if (u >= 1) { st.spinning = false; st.spin = 0; } }
  ch.object.rotation.y = (baseYaw || 0) + st.spin;
  const cur = ch.anim && ch.anim.cur; st.air = cur && cur.name === 'pz_jump' ? cur.st.air || 0 : 0;
  return { spin: st.spinning ? st.spinT / st.spinDur : 0, air: st.air };
}
// the bounce between moves follows the metronome (call every frame; it only updates the opts while the groove clip is active)
export function groove(ch, beat, amp) {
  if (!ch || !ch.anim) return; const clip = ch.anim.clip;
  if (clip === 'pz_groove') ch.play('pz_groove', { phase: beat, amp: amp === undefined ? 1 : amp });
  else if (!/^pz_/.test(clip) && !ch.anim.once) ch.play('pz_groove', { phase: beat, amp: amp === undefined ? 1 : amp, fade: 0.25 });
}
