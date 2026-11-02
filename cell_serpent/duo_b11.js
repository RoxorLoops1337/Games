// 02-duo-pets (round 11): celebrations. The duo and pets react to the good moments of a run.
// 1) boss kill: the arms-up cheer (cheer.js force) with a full pet routine, driven from the 'kill' event.
// 2) upgrade pick: a quick hop with a ring of little stars around the duo and a hop for each pet.
// 3) new weapon: the duo holds the new weapon high for a moment, it spins in over their heads and the pets look up at it.
// Pure maths plus a few numbers of state: nothing is allocated per frame (the pose objects are reused).
export const TAU = 6.2832;
export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const PICK_LEN = 0.7, WEAPON_LEN = 1.5, BOSS_TIER = 4;
// skill id -> weapon sprite id in the art kit
export const WEAPON_SPR = { swab: 'swab', daggers: 'dagger', tower: 'tower', dragon: 'dragon', needles: 'needle', stick: 'stick', bubble: 'bubble', satellite: 'perch', maw: 'maw' };
export function createB11() { return { pickT: -9, wT: -9, wId: '', bossT: -9 }; }

// feed every sim event; g: the live game (to tell a new weapon from a level on an old one). Returns 'boss' | 'weapon' | 'pick' | '' for the caller.
export function b11Event(B, e, g, t) {
  if (e.t === 'kill' && e.head && e.boss) { B.bossT = t; return 'boss'; }
  if (e.t === 'upgrade') {
    B.pickT = t;
    const w = e.kind === 'weapon' && g && g.weap && g.weap[e.id];
    if (w && w.lv <= 1 && WEAPON_SPR[e.id]) { B.wT = t; B.wId = e.id; return 'weapon'; }
    return 'pick';
  }
  return '';
}
const PK = { dy: 0, sy: 1, sx: 1, u: -1 };
// the duo's quick hop after picking an upgrade, u in seconds since the pick
export function pickPose(u) {
  if (u < 0 || u >= PICK_LEN) { PK.dy = 0; PK.sy = 1; PK.sx = 1; PK.u = -1; return PK; }
  const k = u / PICK_LEN; PK.u = k;
  if (k < 0.2) { const c = k / 0.2; PK.dy = 0; PK.sy = 1 - 0.07 * c; PK.sx = 1 + 0.05 * c; }   // crouch
  else if (k < 0.8) { const s = Math.sin((k - 0.2) / 0.6 * Math.PI); PK.dy = s * 26; PK.sy = 1 + s * 0.07; PK.sx = 1 / PK.sy; }
  else { const q = Math.sin((k - 0.8) / 0.2 * Math.PI); PK.dy = 0; PK.sy = 1 - q * 0.06; PK.sx = 1 + q * 0.04; }
  return PK;
}
// star i of n in the ring that opens around the duo after a pick: writes {x, y, s, a}
export function ringStar(o, i, n, cx, cy, u) {
  const k = clamp01(u), a = i * TAU / n + k * 1.6, r = 30 + 64 * (1 - (1 - k) * (1 - k));
  o.x = cx + Math.cos(a) * r; o.y = cy + Math.sin(a) * r * 0.55 - k * 18; o.s = 9 * Math.sin(Math.min(1, k * 1.15) * Math.PI) + 1; o.a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  return o;
}
const WP = { x: 0, y: 0, rot: 0, s: 0, a: 0, hold: false, u: -1 };
// the weapon held over the duo's heads, u in seconds since the pickup: spins in, hangs with a bob, shrinks away.
export function weaponPose(u, reduce) {
  if (u < 0 || u >= WEAPON_LEN) { WP.u = -1; WP.s = 0; WP.a = 0; WP.hold = false; WP.x = WP.y = WP.rot = 0; return WP; }
  const k = u / WEAPON_LEN; WP.u = k; WP.hold = k < 0.8;
  const inn = clamp01(k / 0.22), out = clamp01((k - 0.8) / 0.2), e = 1 - (1 - inn) * (1 - inn);
  const back = 1 + 0.35 * Math.sin(Math.min(1, inn) * Math.PI);   // overshoot on the way in
  WP.s = e * back * (1 - out * 0.7); WP.a = 1 - out;
  WP.y = -128 - e * 34 - (reduce ? 0 : Math.sin(u * 5) * 4) - out * 40; WP.x = 0;
  WP.rot = reduce ? 0 : (1 - e) * 5.5 + Math.sin(u * 4) * 0.08;
  return WP;
}
// do the pets look up at the held weapon? 1 while it hangs over the duo
export const lookUp = u => (u < 0 || u >= WEAPON_LEN ? 0 : Math.sin(clamp01(u / WEAPON_LEN) * Math.PI) > 0.35 ? 1 : 0);
