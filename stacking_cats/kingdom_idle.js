// Whiskerton Walk: idle behaviours of the walking cat. Pure (no DOM, no Math.random, no clock), seeded and deterministic.
//
//   const s = idleState(seed);                       // seed: any string or number (the cat key)
//   const o = stepIdle(s, dt, inp);                  // call once per frame, any dt up to 0.25 (split into small sub steps inside)
//   inp = { moving, grounded, nearTarget, lookAtX, t, catX?, poke?, reduced? }
//     moving      the cat is walking or running (idle timers reset, outputs ease back to neutral)
//     grounded    false while jumping or falling (counts as awake, like moving)
//     nearTarget  the cat stands by something of interest (door, npc, building): it perks up and tracks it with its head
//     lookAtX     the point of interest. With catX given it is a world x (offset = (lookAtX - catX) / 160), without catX it is
//                 already a screen offset. Either way it is clamped to -1..1, positive is to the right of the screen.
//     t           optional wall clock, ignored (the module keeps its own clock so it stays deterministic)
//     poke        any other input (button, tap, key): wakes the cat like movement does
//     reduced     true: return the still version of the pose (see reducedIdle), no blink, twitch, sway or breathing
//   o = {
//     pose        'idle' | 'sit' | 'sleep' | 'groom' | 'yawn' | 'stretch' | 'look'
//     blink       eyelid 0 (open) .. 1 (shut); includes blinks, drowsiness, yawns and sleep
//     headYaw     -1..1, positive looks to the right of the screen (mirror it yourself with the facing)
//     headPitch   -1..1, positive looks up
//     earL, earR  -1..1, 0 neutral, positive perked or flicked up, negative flat
//     breath      0..1, a smooth in and out wave (0.5 at rest), faster when excited, slow and deep asleep
//     excite      0..1 (feeds the tail mood), a startle spikes it
//     --- additions ---
//     sitAmt      0..1 eased, how far into the sitting posture (stays 1 asleep)
//     sleepAmt    0..1 eased, how far curled up (draw the curl by this, not by the pose, so there is no pop)
//     zzz         true once the cat is properly asleep, zzzT 0..1 repeats every 2.4 s to animate the Zs
//     startle     0..1, the wake up jolt (decays in about 0.4 s): squash the body, widen the eyes
//     idleT       seconds since the cat last moved or was poked
//   }
// The returned object is owned by the state and reused every call: read it, do not keep it. Every value is eased (exponential
// smoothing, independent of dt) so nothing pops, the only fast moves are the blink and the startle.
// Timing (re rolled with the seed on every wake): sit after 5.2 to 7 s, sleep after 22 to 28 s (a yawn comes just before),
// blink every 2.2 to 6.5 s (sometimes a double), ear twitch every 1.5 to 6 s, an event (look, stretch, yawn, groom) every 3 to 7.5 s.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const ease = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export const IDLE = {
  sitAt: [5.2, 7], sleepAt: [22, 28], preYawn: 1.7,
  blinkGap: [2.2, 6.5], blinkDur: 0.18, doubleBlink: 0.12,
  twitchGap: [1.5, 6], twitchDur: 0.4,
  eventGap: [3, 7.5], wakeGap: [2, 5],
  zzzPeriod: 2.4, maxDt: 0.25, sub: 0.05,
};

function hashSeed(seed) {
  let h = 2166136261;
  const str = typeof seed === 'string' ? seed : 'n' + fin(Number(seed));
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function next(s) {   // mulberry32
  s.r = (s.r + 0x6D2B79F5) | 0;
  let t = Math.imul(s.r ^ (s.r >>> 15), 1 | s.r);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (s, a, b) => a + (b - a) * next(s);
const range = (s, r) => rr(s, r[0], r[1]);

export function idleState(seed) {
  const s = {
    r: hashSeed(seed) | 0, idleT: 0, clock: 0, base: 'idle', ev: null, evGap: 0, preYawned: false, awake: true,
    sitAt: 0, sleepAt: 0,
    blinkIn: 0, bt: -1, bq: 0, lid: 0,
    twIn: 0, tw: null,
    stOut: 0, yaw: 0, pitch: 0, earL: 0, earR: 0, excite: 0, startle: 0, startleT: 0,
    sit: 0, sleep: 0, breathPh: 0, breathHz: 0.3, zzzPh: 0,
    out: { pose: 'idle', blink: 0, headYaw: 0, headPitch: 0, earL: 0, earR: 0, breath: 0.5, excite: 0,
      sitAmt: 0, sleepAmt: 0, zzz: false, zzzT: 0, startle: 0, idleT: 0 },
  };
  s.sitAt = range(s, IDLE.sitAt); s.sleepAt = range(s, IDLE.sleepAt);
  s.blinkIn = rr(s, 0.8, IDLE.blinkGap[1]); s.twIn = range(s, IDLE.twitchGap);
  s.evGap = range(s, IDLE.eventGap);
  s.breathPh = next(s);
  return s;
}

// the still version for reduced motion: posture only, eyes open (shut asleep), no twitch, no sway, no breathing
export function reducedIdle(o) {
  const p = o.pose;
  const posture = p === 'sleep' ? 'sleep' : p === 'sit' || p === 'groom' ? 'sit' : 'idle';
  return { pose: posture, blink: posture === 'sleep' ? 1 : 0, headYaw: 0, headPitch: 0, earL: 0, earR: 0, breath: 0.5, excite: 0,
    sitAmt: posture === 'idle' ? 0 : 1, sleepAmt: posture === 'sleep' ? 1 : 0, zzz: !!o.zzz, zzzT: 0, startle: 0, idleT: o.idleT };
}

function wake(s, strength) {
  s.startle = Math.max(s.startle, strength); s.startleT = 0;
  s.idleT = 0; s.base = 'idle'; s.ev = null; s.preYawned = false; s.awake = true;
  s.sitAt = range(s, IDLE.sitAt); s.sleepAt = range(s, IDLE.sleepAt);
  s.evGap = range(s, IDLE.wakeGap);
}

function startEvent(s, kind, look) {
  const dur = kind === 'look' ? rr(s, 1.4, 2.6) : kind === 'yawn' ? rr(s, 1.5, 2) : kind === 'stretch' ? rr(s, 1.8, 2.4) : rr(s, 3, 5);
  let yaw = 0, pitch = 0;
  if (kind === 'look') {
    const toward = look !== null && Math.abs(look) > 0.08 && next(s) < 0.7;
    yaw = toward ? look : (next(s) < 0.5 ? -1 : 1) * rr(s, 0.4, 0.9);
    pitch = rr(s, -0.15, 0.3);
  }
  s.ev = { kind, t: 0, dur, yaw: clamp(yaw, -1, 1), pitch, ph: next(s) * TAU };
}

function pickEvent(s, look) {
  const u = next(s);
  if (s.base === 'idle') startEvent(s, u < 0.5 ? 'look' : u < 0.7 && s.idleT > 2.5 ? 'yawn' : 'stretch', look);
  else startEvent(s, u < 0.4 ? 'look' : u < 0.85 ? 'groom' : 'yawn', look);
}

function sub(s, h, inp, look) {
  s.clock += h;
  const awake = !!(inp.moving || inp.grounded === false || inp.poke);
  if (awake) {
    if (!s.awake || s.idleT > 0) {
      const strength = s.base === 'sleep' ? 1 : s.sleep > 0.3 ? 0.8 : s.base === 'sit' ? 0.35 : 0;
      wake(s, strength);
    }
    s.awake = true;
  } else { s.awake = false; s.idleT += h; }

  // posture
  if (!awake) {
    if (s.base !== 'sleep' && s.idleT >= s.sleepAt) { s.base = 'sleep'; s.ev = null; }
    else if (s.base === 'idle' && s.idleT >= s.sitAt) { s.base = 'sit'; s.ev = null; s.evGap = rr(s, 1.2, IDLE.eventGap[1]); }
    if (s.base === 'sit' && !s.preYawned && s.idleT >= s.sleepAt - IDLE.preYawn) { s.preYawned = true; startEvent(s, 'yawn', look); s.ev.dur = IDLE.preYawn; }
    if (s.ev) { s.ev.t += h; if (s.ev.t >= s.ev.dur) { s.ev = null; s.evGap = range(s, IDLE.eventGap); } }
    else if (s.base !== 'sleep') { s.evGap -= h; if (s.evGap <= 0) pickEvent(s, look); }
  }
  const ev = s.ev;
  const env = ev ? Math.min(smooth(ev.t / 0.3), smooth((ev.dur - ev.t) / 0.4)) : 0;
  const kind = ev ? ev.kind : null;
  const tracking = !awake && inp.nearTarget && s.base !== 'sleep' && look !== null;

  // posture amounts
  s.sit = ease(s.sit, !awake && s.base !== 'idle' ? 1 : 0, awake ? 7 : 5, h);
  s.sleep = ease(s.sleep, !awake && s.base === 'sleep' ? 1 : 0, awake ? 9 : 1.6, h);
  s.startleT += h;
  s.startle = Math.max(0, s.startle - h * 2.4);
  s.stOut = ease(s.stOut, s.startle, s.startle > s.stOut ? 18 : 8, h);   // quick but not instant attack, so no single frame pop
  const stl = s.stOut;

  // eyelids: blink wave on top of a slow lid (drowsy, yawn, stretch, groom, sleep)
  s.blinkIn -= h;
  if (s.bt < 0 && s.blinkIn <= 0) { s.bt = 0; if (s.bq === 0 && next(s) < IDLE.doubleBlink) s.bq = 1; }
  let wave = 0;
  if (s.bt >= 0) {
    s.bt += h;
    const u = s.bt / IDLE.blinkDur;
    if (u >= 1) { s.bt = -1; if (s.bq > 0) { s.bq--; s.blinkIn = 0.1; } else s.blinkIn = range(s, IDLE.blinkGap); }
    else wave = u < 0.35 ? smooth(u / 0.35) : smooth(1 - (u - 0.35) / 0.65);
  }
  let lidT = 0;
  if (!awake && s.base === 'sit') lidT = clamp((s.idleT - (s.sleepAt - 8)) / 8, 0, 1) * 0.45;
  if (kind === 'yawn') lidT = Math.max(lidT, 0.7 * env);
  else if (kind === 'stretch') lidT = Math.max(lidT, 0.6 * env);
  else if (kind === 'groom') lidT = Math.max(lidT, 0.55 * env);
  s.lid = ease(s.lid, lidT, 6, h);
  const blink = clamp(Math.max(wave * (1 - s.sleep), s.lid * (1 - s.sleep), s.sleep), 0, 1);

  // head
  let yawT = 0, pitchT = 0;
  if (s.base === 'sleep') { yawT = 0.3 * s.sleep; pitchT = -0.8; }
  else {
    if (tracking) { yawT = look * 0.8; pitchT = 0.1; }
    if (kind === 'look') { yawT = ev.yaw * env + yawT * (1 - env); pitchT = ev.pitch * env; }
    else if (kind === 'yawn') pitchT = 0.7 * env;
    else if (kind === 'stretch') pitchT = -0.35 * env;
    else if (kind === 'groom') { pitchT = -0.55 * env; yawT += Math.sin(s.clock * 9 + ev.ph) * 0.12 * env + 0.35 * env; }
    if (s.base === 'sit' && !kind) pitchT += 0.1;
  }
  pitchT += stl * 0.5;
  s.yaw = ease(s.yaw, clamp(yawT, -1, 1), tracking || kind === 'look' ? 7 : 5, h);
  s.pitch = ease(s.pitch, clamp(pitchT, -1, 1), 6, h);

  // ears: a flick every few seconds, flat when asleep, perked when alert
  s.twIn -= h;
  if (!s.tw && s.twIn <= 0 && s.base !== 'sleep') {
    const w = next(s);
    s.tw = { t: 0, l: w < 0.45 ? 1 : w < 0.55 ? 0.7 : 0, r: w >= 0.55 ? 1 : w >= 0.45 ? 0.7 : 0, a: rr(s, 0.6, 1), dir: next(s) < 0.8 ? 1 : -1 };
    if (w >= 0.45 && w < 0.55) s.tw.l = s.tw.r = 0.7;
  }
  let pl = 0, pr = 0;
  if (s.tw) {
    s.tw.t += h;
    const u = s.tw.t / IDLE.twitchDur;
    if (u >= 1) { s.tw = null; s.twIn = range(s, IDLE.twitchGap); }
    else { const p = Math.sin(u * TAU) * (1 - u) * 1.1 * s.tw.a * s.tw.dir; pl = p * s.tw.l; pr = p * s.tw.r; }
  }
  const earBase = 0.35 * (inp.nearTarget ? 1 : 0) * (1 - s.sleep) - 0.45 * s.sleep + stl * 1.0 + (kind === 'yawn' ? -0.4 * env : 0) + (kind === 'groom' ? -0.2 * env : 0);
  s.earL = ease(s.earL, earBase, 8, h);
  s.earR = ease(s.earR, earBase, 8, h);
  const earL = clamp(s.earL + pl * (1 - s.sleep), -1, 1), earR = clamp(s.earR + pr * (1 - s.sleep), -1, 1);

  // excite and breathing
  const exT = Math.max(awake ? 0 : inp.nearTarget ? 0.55 : 0, stl);
  s.excite = ease(s.excite, exT, stl > 0 ? 12 : 3, h);
  const hzT = s.base === 'sleep' ? 0.2 : s.base === 'sit' ? 0.26 : 0.32;
  s.breathHz = ease(s.breathHz, hzT + s.excite * 0.5 + (kind === 'yawn' ? -0.1 * env : 0), 2, h);
  s.breathPh = (s.breathPh + s.breathHz * h) % 1;
  const breath = 0.5 - 0.5 * Math.cos(s.breathPh * TAU);
  s.zzzPh = (s.zzzPh + h / IDLE.zzzPeriod) % 1;

  const o = s.out;
  o.pose = awake ? 'idle' : s.base === 'sleep' ? 'sleep' : kind || s.base;
  if (!awake && !kind && tracking && s.base === 'idle' && Math.abs(s.yaw) > 0.25) o.pose = 'look';
  o.blink = blink; o.headYaw = s.yaw; o.headPitch = s.pitch; o.earL = earL; o.earR = earR;
  o.breath = breath; o.excite = clamp(s.excite, 0, 1);
  o.sitAmt = clamp(s.sit, 0, 1); o.sleepAmt = clamp(s.sleep, 0, 1);
  o.zzz = !awake && s.base === 'sleep' && s.sleep > 0.85; o.zzzT = s.zzzPh;
  o.startle = clamp(s.stOut, 0, 1); o.idleT = s.idleT;
}

export function stepIdle(s, dt, inp = {}) {
  const d = clamp(fin(dt), 0, IDLE.maxDt);
  let look = null;
  if (Number.isFinite(inp.lookAtX)) look = clamp(Number.isFinite(inp.catX) ? (inp.lookAtX - inp.catX) / 160 : inp.lookAtX, -1, 1);
  const n = Math.max(1, Math.ceil(d / IDLE.sub)), h = d / n;
  for (let i = 0; i < n; i++) sub(s, h, inp, look);
  return inp.reduced ? reducedIdle(s.out) : s.out;
}
