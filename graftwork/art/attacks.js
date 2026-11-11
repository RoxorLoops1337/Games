// Enemy attack rigs: pure pose math, no drawing, no DOM (design/JUICE.md).
//
// timing(id, body, moveId?) -> { tell, act, hold, rec, impactMs, hits[], weight, kind }   ms. impactMs = tell + act = the frame the damage event lands.
//   Multi-hit moves list every impact in `hits` (the last equals impactMs); single hits give [impactMs].
// pose(id, body, phase, k, moveId?) -> { dx, dy, sx, sy, rot, glow, extra } or null.
//   phase 'tell'|'act'|'hold'|'rec', k 0..1 inside the phase. dx px toward hero is NEGATIVE, dy up is NEGATIVE, rot radians.
//   sx = 1/sy always (volume preserved). Deformation is capped per body: soft 1.3, normal 1.18, hard 1.08.
//   All channels are continuous across tell->act->hold->rec (rec ends at rest: 0,0,1,1,0,0).
// extra cues: contact (true on the frame window around impact), weight ('light'|'heavy'|'boss'), shakeDir (radians the hit pushes along:
//   PI = leftwards at the hero, PI/2 = straight down), attacking (false for guard/buff/cast poses), kind, plus per-signature cues:
//   splat, droplets, clipboard, stamp, blot, inhale, blow, push, hose, orbit, peel, peelK, hit, thread, ghost, dim, flatline, sparks, flash,
//   stiffen, bell, flames, glint, embedded, limb, strain, snap, spit, beam, reach, gaze, spin, guard, flex, cast, call, heal.
import { ENEMIES } from '../data/index.js';
import { clampOrdered as clamp, lerp, TAU } from '../ui/util.js';

const PI = Math.PI;
const smooth = (t) => t * t * (3 - 2 * t);
const backIn = (t, s = 1.7) => t * t * ((s + 1) * t - s);
const expoOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.pow(2, -10 * t)) / (1 - Math.pow(2, -10)));
const elasticOut = (t, p = 0.3) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * TAU) / p) + 1);
// critically damped spring step response complement, normalised so S(0)=1 and S(1)=0 exactly
const SW = 9, SC = (1 + SW) * Math.exp(-SW);
const spring = (t) => ((1 + SW * t) * Math.exp(-SW * t) - SC) / (1 - SC);

// ---------------------------------------------------------------- bodies
const ALIAS = { slime: 'dome', gurney: 'box', stand: 'podium', coin: 'disc', hound: 'jagged', fish: 'lure', mummy: 'striped', pills: 'capsules', moth: 'wings', nurse: 'lamp' };
const BODIES = ['dome', 'tall', 'cylinder', 'stilts', 'wings', 'striped', 'capsules', 'bellows', 'tail', 'lamp', 'figure', 'box', 'bell', 'jar', 'hunched', 'disc', 'lure', 'jagged', 'balance', 'cleaver', 'bloom', 'barrels', 'columns', 'candle', 'loupe', 'podium', 'tophat', 'torch', 'masks', 'cherub', 'puppet', 'cone', 'eyebox', 'curtain', 'clappers', 'outline', 'hat', 'conductor', 'patchwork', 'blob'];
export const BODY_KEYWORDS = BODIES.slice();
const SOFT = new Set(['dome', 'cylinder', 'jar', 'bloom', 'blob', 'bellows', 'hunched', 'capsules']);
const HARD = new Set(['box', 'bell', 'cleaver', 'barrels', 'columns', 'podium', 'torch', 'candle', 'balance', 'disc', 'loupe', 'tophat', 'cone', 'eyebox']);
const bodyKey = (b) => (BODIES.includes(b) ? b : ALIAS[b] || 'blob');
const maxDef = (bk) => (SOFT.has(bk) ? 1.3 : HARD.has(bk) ? 1.08 : 1.18);

// ---------------------------------------------------------------- styles
// T = pose at the end of the tell, I = pose at impact. sq in -1..1: +1 = max stretch along y (tall/narrow), -1 = max squash (flat/wide).
// arc: extra lift (px) during act. hold(k) additive wobble that is zero at both ends. x(phase,k,c) extra cues.
const STYLES = {
  lunge: { T: { dx: 12, dy: 0, rot: 0.08, sq: 0.5, glow: 0.2 }, I: { dx: -62, dy: 2, rot: -0.1, sq: -0.6, glow: 0.5 }, sd: PI },
  pounce: { T: { dx: 10, dy: 6, rot: 0.1, sq: -0.6, glow: 0.1 }, I: { dx: -70, dy: 0, rot: -0.25, sq: -0.5, glow: 0.4 }, arc: 34, sd: PI },
  slam: { T: { dx: 10, dy: -30, rot: 0.28, sq: 0.7, glow: 0.3 }, I: { dx: -22, dy: 5, rot: -0.22, sq: -0.7, glow: 0.4 }, sd: PI / 2, hold: (k) => ({ dy: -2 * Math.sin(PI * k) }) },
  stab: { T: { dx: 18, dy: -4, rot: 0.18, sq: 0.4, glow: 0.1 }, I: { dx: -78, dy: 0, rot: -0.05, sq: -0.45, glow: 0.4 }, sd: PI },
  sweep: { T: { dx: 12, dy: -6, rot: 0.4, sq: 0.3, glow: 0.1 }, I: { dx: -36, dy: 2, rot: -0.5, sq: -0.3, glow: 0.3 }, sd: PI },
  whirl: { T: { dx: 8, dy: -2, rot: 0.7, sq: 0.3, glow: 0.1 }, I: { dx: -44, dy: 0, rot: -0.8, sq: -0.3, glow: 0.3 }, sd: PI, x: (p, k) => ({ spin: p === 'act' ? k : p === 'tell' ? 0 : 1 }) },
  dive: { T: { dx: 20, dy: -56, rot: 0.5, sq: 0.5, glow: 0.2 }, I: { dx: -92, dy: 2, rot: -0.45, sq: -0.6, glow: 0.4 }, sd: PI },
  ram: { T: { dx: 28, dy: 0, rot: 0.05, sq: 0.6, glow: 0.2 }, I: { dx: -90, dy: 0, rot: -0.03, sq: -0.8, glow: 0.4 }, sd: PI },
  stomp: { T: { dx: 4, dy: 5, rot: 0, sq: -0.8, glow: 0.1 }, I: { dx: -26, dy: 0, rot: -0.05, sq: -0.9, glow: 0.4 }, arc: 40, sd: PI / 2 },
  spit: { T: { dx: 12, dy: -4, rot: 0.2, sq: 0.6, glow: 0.6 }, I: { dx: -10, dy: 0, rot: -0.15, sq: -0.5, glow: 1 }, sd: PI, x: (p, k) => ({ spit: p === 'act' ? k : p === 'hold' ? 1 : 0 }) },
  beam: { T: { dx: 6, dy: -2, rot: 0.05, sq: 0.3, glow: 0.5 }, I: { dx: -8, dy: 0, rot: 0, sq: -0.1, glow: 1 }, sd: PI, x: (p, k) => ({ beam: p === 'tell' ? 0.2 * k : p === 'act' ? 0.2 + 0.8 * k : p === 'hold' ? 1 : 1 - k }) },
  reach: { T: { dx: 10, dy: 0, rot: 0.06, sq: 0.4, glow: 0.1 }, I: { dx: -46, dy: -2, rot: -0.12, sq: -0.5, glow: 0.3 }, sd: PI, x: (p, k) => ({ reach: p === 'tell' ? 0.1 * k : p === 'act' ? 0.1 + 0.9 * k : p === 'hold' ? 1 : 1 - k }) },
  gaze: { T: { dx: 0, dy: -4, rot: 0, sq: 0.5, glow: 0.7 }, I: { dx: -6, dy: -2, rot: 0, sq: 0.1, glow: 1 }, sd: PI, hold: (k) => ({ dx: 1.5 * Math.sin(PI * 8 * k) * Math.sin(PI * k) }), x: (p, k) => ({ gaze: p === 'tell' ? k * 0.7 : p === 'act' ? 0.7 + 0.3 * k : p === 'hold' ? 1 : 1 - k }) },
  // ---- signatures (JUICE.md) ----
  splat: { // bedpan_slime: flat squash, arcing leap, splat dome 1.4 wide
    T: { dx: 4, dy: 3, rot: 0, sq: -1, glow: 0 }, I: { dx: -70, dy: 0, rot: 0, sq: -1, glow: 0.3 }, arc: 56, sd: PI / 2,
    x: (p, k) => ({ squash: p === 'tell' ? k : 1, splat: p === 'hold' ? 1.4 : p === 'rec' ? lerp(1.4, 1, smooth(k)) : p === 'act' ? lerp(1, 1.4, k * k * k) : 1, droplets: p === 'hold' ? 1 - k : p === 'act' && k > 0.85 ? (k - 0.85) / 0.15 : 0 }),
  },
  clipboard: { // orderly: clipboard overhead, slam and stamp, ink blot on the hero
    T: { dx: 6, dy: -22, rot: 0.2, sq: 0.6, glow: 0.2 }, I: { dx: -30, dy: 4, rot: -0.2, sq: -0.5, glow: 0.4 }, sd: PI / 2,
    x: (p, k) => ({ clipboard: p === 'tell' ? expoOut(k) : p === 'act' ? 1 - expoOut(k) : 0, stamp: p === 'hold' ? 1 : 0, blot: p === 'hold' ? 1 : p === 'rec' ? 1 : 0 }),
  },
  breath: { // iron_lung blow: inhale (ribs spread, hose tightens) then blow, hero pushed 20 px
    T: { dx: 6, dy: -2, rot: -0.03, sq: 0.6, glow: 0.3 }, I: { dx: -18, dy: 0, rot: 0.02, sq: -0.4, glow: 0.8 }, sd: PI,
    x: (p, k) => { const inh = p === 'tell' ? smooth(k) : p === 'act' ? 1 - expoOut(k) : 0; return { inhale: inh, hose: inh, blow: p === 'act' ? k : p === 'hold' ? 1 - k : 0, push: p === 'act' ? 20 * expoOut(k) : p === 'hold' ? 20 : p === 'rec' ? 20 * (1 - smooth(k)) : 0 }; },
  },
  inhale: { // iron_lung inhale move (buff): non-attacking
    T: { dx: 0, dy: -2, rot: 0, sq: 0.3, glow: 0.1 }, I: { dx: 0, dy: -5, rot: 0, sq: 0.7, glow: 0.4 }, sd: 0, kind: 'buff',
    x: (p, k) => ({ inhale: p === 'tell' ? 0.6 * k : p === 'act' ? 0.6 + 0.4 * k : p === 'hold' ? 1 : 1 - k, hose: p === 'rec' ? 1 - k : 1 }),
  },
  tailwhip: { // stitch_rat: tail whip, thread drags a ghost of the stolen patch into the body
    T: { dx: 14, dy: 0, rot: 0.5, sq: 0.4, glow: 0.1 }, I: { dx: -48, dy: 0, rot: -0.7, sq: -0.4, glow: 0.5 }, sd: PI,
    x: (p, k) => ({ thread: p === 'tell' ? 0 : p === 'act' ? expoOut(k) : p === 'hold' ? 1 : 1 - smooth(k), ghost: p === 'hold' ? k * 0.2 : p === 'rec' ? 0.2 + 0.8 * smooth(k) : 0 }),
  },
  swarm: { // pill_swarm: capsules orbit faster each hit and peel off one by one
    T: { dx: 0, dy: -8, rot: 0, sq: 0.3, glow: 0.3 }, I: { dx: -34, dy: 0, rot: -0.1, sq: -0.3, glow: 0.6 }, sd: PI, multi: true,
    x: (p, k, c) => { const n = c.hits; const o = p === 'tell' ? 1 + k : p === 'act' ? 2 + 2 * k : 4 - 3 * k; const idx = p === 'act' ? k * n : p === 'tell' ? 0 : n; return { orbit: o, peel: Math.min(n, Math.floor(idx)), peelK: idx - Math.floor(idx), hit: p === 'act' ? Math.min(n - 1, Math.floor(k * n)) : n - 1 }; },
  },
  lampstab: { // night_nurse: lamp goes dark (screen dims 30%), syringe stabs from the dark
    T: { dx: 10, dy: -4, rot: 0.15, sq: 0.5, glow: 0 }, I: { dx: -84, dy: 0, rot: -0.04, sq: -0.5, glow: 0.2 }, sd: PI,
    x: (p, k) => ({ dim: p === 'tell' ? 0.3 * smooth(Math.min(1, k / 0.9)) : p === 'act' ? 0.3 : p === 'hold' ? 0.3 : 0.3 * (1 - smooth(k)), lampDark: p !== 'rec' }),
  },
  paddles: { // defibrillator: flatline, paddles rub with sparks, Clear = 120 ms white flash, hero stiffens
    T: { dx: 6, dy: -4, rot: 0.04, sq: 0.3, glow: 0.4 }, I: { dx: -40, dy: 0, rot: -0.04, sq: -0.3, glow: 1 }, sd: PI,
    x: (p, k) => ({ flatline: p === 'tell' ? smooth(Math.min(1, k * 3)) : p === 'rec' ? 1 - smooth(Math.min(1, k * 2)) : p === 'hold' ? 0.8 : 1, sparks: p === 'act' || p === 'tell' && k > 0.6 ? 0.5 + 0.5 * Math.sin(k * 90) : 0, flash: p === 'act' ? clamp((k - 0.6) / 0.4, 0, 1) : p === 'hold' ? 1 - k : 0, stiffen: p === 'act' ? clamp((k - 0.6) / 0.4, 0, 1) : p === 'hold' ? 1 : p === 'rec' ? 1 - smooth(k) : 0 }),
  },
  pendulum: { // the_matron: bell rears, candle flames streak, swings like a pendulum, low bell strike, horizontal shake
    T: { dx: 26, dy: -8, rot: 0.6, sq: 0.4, glow: 0.3 }, I: { dx: -54, dy: 6, rot: -0.45, sq: -0.5, glow: 0.6 }, sd: PI,
    hold: (k) => ({ rot: -0.12 * Math.sin(TAU * 1.5 * k) * (1 - k) }),
    x: (p, k) => ({ shakeDir: PI, flames: p === 'tell' ? k : p === 'act' ? 1 : p === 'hold' ? 1 - 0.5 * k : 0.5 * (1 - k), bell: p === 'hold' ? 1 - k : 0, swing: p === 'tell' ? -k : p === 'act' ? -1 + 2 * expoOut(k) : 1 }),
  },
  chop: { // cleaver: falls in 50 ms and freezes 120 ms, blade embedded
    T: { dx: 14, dy: -24, rot: 0.55, sq: 0.5, glow: 0.8 }, I: { dx: -40, dy: 8, rot: -0.35, sq: -0.6, glow: 0.3 }, sd: PI / 2,
    x: (p, k) => ({ glint: p === 'tell' ? smooth(k) : 0, embedded: p === 'hold' ? 1 : p === 'rec' ? 1 - smooth(Math.min(1, k * 1.5)) : 0 }),
  },
  raise: { // cleaver Raise: tilts back and holds with a glint (non-attacking)
    T: { dx: 8, dy: -12, rot: 0.5, sq: 0.5, glow: 0.6 }, I: { dx: 8, dy: -16, rot: 0.58, sq: 0.55, glow: 1 }, sd: 0, kind: 'guard',
    hold: (k) => ({ rot: 0.02 * Math.sin(TAU * 2 * k) }),
    x: (p, k) => ({ glint: p === 'tell' ? 0.3 * k : p === 'act' ? 0.3 + 0.7 * k : p === 'hold' ? 0.7 + 0.3 * Math.sin(PI * k) : 1 - k }),
  },
  limb: { // the_grafter: a limb made of YOUR graft patches, stitches strain, snaps back
    T: { dx: 14, dy: 0, rot: 0.06, sq: 0.3, glow: 0.4 }, I: { dx: -52, dy: -2, rot: -0.1, sq: -0.2, glow: 1 }, sd: PI,
    x: (p, k) => ({ limb: p === 'tell' ? 0.2 * backIn(k) : p === 'act' ? lerp(0.2, 1, expoOut(k)) : p === 'hold' ? 1 : 1 - Math.pow(k, 0.3), strain: p === 'tell' ? 0.3 * k : p === 'act' ? lerp(0.3, 0.8, k) : p === 'hold' ? lerp(0.8, 1, k) : 1 - clamp(k * 4, 0, 1), snap: p === 'rec' && k < 0.25 ? 1 : 0 }),
  },
  // ---- non-attacking ----
  guard: { T: { dx: 0, dy: 2, rot: 0, sq: -0.5, glow: 0 }, I: { dx: 0, dy: -2, rot: 0, sq: 0.3, glow: 0.6 }, sd: 0, kind: 'guard', x: (p, k) => ({ guard: p === 'tell' ? 0.3 * k : p === 'act' ? 0.3 + 0.7 * k : p === 'hold' ? 1 : 1 - k }) },
  flex: { T: { dx: 0, dy: 2, rot: 0, sq: -0.4, glow: 0.1 }, I: { dx: 0, dy: -8, rot: 0, sq: 0.6, glow: 0.9 }, sd: 0, kind: 'buff', x: (p, k) => ({ flex: p === 'tell' ? 0.2 * k : p === 'act' ? 0.2 + 0.8 * k : p === 'hold' ? 1 : 1 - k }) },
  cast: { T: { dx: 6, dy: -4, rot: 0.12, sq: 0.3, glow: 0.4 }, I: { dx: -4, dy: -2, rot: -0.05, sq: 0.1, glow: 1 }, sd: PI, kind: 'cast', x: (p, k) => ({ cast: p === 'tell' ? 0.3 * k : p === 'act' ? 0.3 + 0.7 * k : p === 'hold' ? 1 : 1 - k }) },
};
STYLES.call = { ...STYLES.flex, x: (p, k) => ({ call: p === 'tell' ? 0.2 * k : p === 'act' ? 0.2 + 0.8 * k : p === 'hold' ? 1 : 1 - k }) };
STYLES.heal = { ...STYLES.flex, x: (p, k) => ({ heal: p === 'tell' ? 0.2 * k : p === 'act' ? 0.2 + 0.8 * k : p === 'hold' ? 1 : 1 - k }) };

// default style per body keyword
const BODY_STYLE = {
  dome: 'splat', tall: 'slam', cylinder: 'slam', stilts: 'stab', wings: 'dive', striped: 'sweep', capsules: 'swarm', bellows: 'breath', tail: 'tailwhip', lamp: 'stab', figure: 'whirl',
  box: 'ram', bell: 'pendulum', jar: 'slam', hunched: 'reach', disc: 'lunge', lure: 'lunge', jagged: 'pounce', balance: 'sweep', cleaver: 'chop', bloom: 'spit', barrels: 'ram',
  columns: 'stomp', candle: 'spit', loupe: 'gaze', podium: 'slam', tophat: 'reach', torch: 'sweep', masks: 'gaze', cherub: 'dive', puppet: 'reach', cone: 'gaze', eyebox: 'gaze',
  curtain: 'slam', clappers: 'stomp', outline: 'stab', hat: 'sweep', conductor: 'sweep', patchwork: 'limb', blob: 'lunge',
};
// per enemy signature (by name and body); ids missing here fall back to BODY_STYLE
const ID_STYLE = {
  bedpan_slime: 'splat', slime_bit: 'pounce', orderly: 'clipboard', leech_jar: 'beam', crutchling: 'stab', fever_moth: 'dive', gauze_mummy: 'sweep', pill_swarm: 'swarm', iron_lung: 'breath',
  stitch_rat: 'tailwhip', night_nurse: 'lampstab', candy_striper: 'whirl', candy_volunteer: 'whirl', the_resident: 'reach', two_gurneys: 'ram', gurney_foot: 'ram', defibrillator: 'paddles',
  the_matron: 'pendulum', jarhead: 'slam', haggler: 'reach', coin_mite: 'lunge', lantern_fish: 'lunge', rust_hound: 'pounce', scale_merchant: 'sweep', cleaver: 'chop', mold_bloom: 'spit',
  twin_barrels: 'ram', ledgerman: 'stomp', wax_sealer: 'spit', pickled_thing: 'lunge', bidder: 'stab', the_appraiser: 'gaze', auction_house: 'slam', pickled_king: 'stomp', the_broker: 'reach',
  usher: 'sweep', mask_chorus: 'gaze', gilded_cherub: 'dive', puppet: 'reach', spotlight: 'gaze', prompter: 'gaze', velvet_curtain: 'slam', applause: 'stomp', understudy: 'stab', critic: 'sweep',
  heckler: 'spit', the_diva: 'gaze', stagehands: 'slam', gold_leaf_golem: 'stomp', the_impresario: 'sweep', the_grafter: 'limb',
  suture_wasp: 'dive', ward_clerk: 'clipboard', knitter: 'reach', surge_tick: 'lunge', needle_nanny: 'stab', brine_surgeon: 'stab', scissor_nurse: 'sweep', ferric_warden: 'slam',
  tax_collector: 'reach', stage_manager: 'sweep', understudys_shadow: 'lunge', locksmith: 'stab',
};
// per move overrides (id:move)
const MOVE_STYLE = { 'iron_lung:inhale': 'inhale', 'cleaver:raise': 'raise', 'the_matron:ring': 'call', 'night_nurse:tuck': 'heal' };

// ---------------------------------------------------------------- timing classes
const TABLE = { light: { tell: 120, act: 60, hold: 40, rec: 180 }, heavy: { tell: 280, act: 70, hold: 90, rec: 320 }, boss: { tell: 450, act: 90, hold: 140, rec: 400 } };
const SUPPORT = { tell: 100, act: 110, hold: 50, rec: 200 };
// signature weight and timing when no move is named (or when the named move is the signature)
const SIG = {
  bedpan_slime: { move: 'slap', weight: 'light', t: { tell: 200, act: 140, hold: 120, rec: 220 } },
  orderly: { move: 'stamp', weight: 'heavy', t: { tell: 300, act: 70, hold: 90, rec: 320 } },
  iron_lung: { move: 'blow', weight: 'heavy' },
  night_nurse: { move: 'injection', weight: 'heavy', t: { tell: 280, act: 70, hold: 90, rec: 320 } },
  defibrillator: { move: 'discharge', weight: 'heavy' },
  the_matron: { move: 'rap', weight: 'boss' },
  cleaver: { move: 'chop', weight: 'heavy', t: { tell: 280, act: 50, hold: 120, rec: 320 } },
  the_grafter: { move: 'stitch', weight: 'boss' },
};
const enemyOf = (id) => (ENEMIES && ENEMIES[id]) || null;
const movesOf = (def, moveId) => { if (!def || !def.moves || !moveId) return null; const m = def.moves; return Array.isArray(m) ? m.find((x) => x.id === moveId) || null : m[moveId] || null; };
const num = (v, d) => (typeof v === 'number' ? v : v && typeof v === 'object' ? (v.max ?? v.min ?? v.base ?? d) : d);

function moveInfo(mv) {
  const fx = (mv && mv.fx) || [];
  let per = 0, hits = 1, has = false, blockSelf = false, heal = false, summon = false, buff = false, debuff = false;
  for (const f of fx) {
    if (!f) continue;
    if (f.op === 'dmg') { has = true; per = Math.max(per, num(f.n, 12)); hits = Math.max(hits, f.hits ? clamp(Math.round(num(f.hits, 3)), 1, 10) : 1); }
    else if (f.op === 'block') blockSelf = true;
    else if (f.op === 'heal') heal = true;
    else if (f.op === 'summon') summon = true;
    else if (f.op === 'status') { if (f.to === 'self' || f.to === 'allies') buff = true; else debuff = true; }
    else if (f.op === 'addCard') debuff = true;
  }
  return { dmg: has, per, hits, total: per * hits, blockSelf, heal, summon, buff, debuff };
}

// resolve everything the rig needs about (id, body, moveId)
function resolve(id, body, moveId) {
  const def = enemyOf(id);
  const bk = bodyKey(body || (def && def.art && def.art.body));
  const kind = def && def.kind || 'normal';
  const sig = SIG[id];
  const mv = movesOf(def, moveId);
  let style = (moveId && MOVE_STYLE[id + ':' + moveId]) || ID_STYLE[id] || BODY_STYLE[bk] || 'lunge';
  let cls = 'attack', weight = 'light', hits = 1, sigMove = !moveId || !sig || moveId === sig.move;
  if (mv) {
    const m = moveInfo(mv);
    if (!MOVE_STYLE[id + ':' + moveId]) {
      if (m.dmg) cls = 'attack';
      else if (m.heal) { cls = 'heal'; style = 'heal'; }
      else if (m.summon) { cls = 'call'; style = 'call'; }
      else if (m.blockSelf) { cls = 'guard'; style = 'guard'; }
      else if (m.buff && !m.debuff) { cls = 'buff'; style = 'flex'; }
      else { cls = 'cast'; style = 'cast'; }
    }
    if (m.dmg) {
      hits = m.hits;
      const big = m.per >= 15 || (hits === 1 && m.total >= 15);
      weight = kind === 'boss' ? (m.per >= 14 || m.total >= 20 ? 'boss' : m.per >= 8 ? 'heavy' : 'light') : big || (kind === 'elite' && m.per >= 14) ? 'heavy' : 'light';
      if (hits > 1 && kind !== 'boss') weight = m.per >= 15 ? 'heavy' : 'light';
    }
  } else if (sig) weight = sig.weight;
  else weight = kind === 'boss' ? 'boss' : kind === 'elite' ? 'heavy' : 'light';
  const sdef = STYLES[style];
  if (sdef.kind && !MOVE_STYLE[id + ':' + moveId] && cls === 'attack' && !mv) cls = sdef.kind;
  if (MOVE_STYLE[id + ':' + moveId]) cls = sdef.kind || 'attack';
  if (sdef.multi && hits < 2 && cls === 'attack') hits = Math.max(2, hits);
  if (!mv && sdef.multi) hits = 5;
  if (hits > 1 && !sdef.multi && cls === 'attack') { /* multi-hit uses the style with pulsed strikes */ }
  return { id, bk, style, sdef, cls, weight, hits: cls === 'attack' ? hits : 1, sigT: sig && sig.t && sigMove && cls === 'attack' ? sig.t : null };
}

// style name of an enemy's move ('splat', 'spit', ...); ui/combat.js uses it to decide whether the body closes the distance
export function styleOf(id, body, moveId) { try { return resolve(id, body, moveId).style; } catch (e) { return ''; } }

export function timing(id, body, moveId) {
  const r = resolve(id, body, moveId);
  let t;
  if (r.cls !== 'attack') t = SUPPORT; else t = r.sigT || TABLE[r.weight];
  let { tell, act, hold, rec } = t;
  const hits = [];
  if (r.hits > 1) {
    const g = r.hits > 5 ? 70 : 90;
    act = Math.max(act, 60) + (r.hits - 1) * g;
    for (let i = 0; i < r.hits; i++) hits.push(tell + t.act + i * g);
  }
  const impactMs = tell + act;
  if (!hits.length) hits.push(impactMs);
  return { tell, act, hold, rec, impactMs, hits, weight: r.cls === 'attack' ? r.weight : 'light', kind: r.cls };
}

const AMP = { light: 1, heavy: 1.2, boss: 1.4 };

// ---------------------------------------------------------------- pose
export function pose(id, body, phase, k, moveId) {
  if (phase !== 'tell' && phase !== 'act' && phase !== 'hold' && phase !== 'rec') return null;
  k = k === k ? clamp(k, 0, 1) : 0;
  return build(resolve(id, body, moveId), phase, k);
}

// pose for a body keyword only (unknown enemies); weight 'light'|'heavy'|'boss'
export function defaultPose(body, phase, k, weight = 'light') {
  if (phase !== 'tell' && phase !== 'act' && phase !== 'hold' && phase !== 'rec') return null;
  const bk = bodyKey(body), style = BODY_STYLE[bk] || 'lunge', sdef = STYLES[style];
  const r = { id: null, bk, style, sdef, cls: sdef.kind || 'attack', weight, hits: sdef.multi ? 5 : 1, sigT: null };
  return build(r, phase, k === k ? clamp(k, 0, 1) : 0);
}

function build(r, phase, k) {
  const s = r.sdef, A = AMP[r.weight] || 1, T = s.T, I = s.I;
  const sc = r.cls === 'attack' ? A : 0.8;
  const hits = r.hits;
  const dur = TABLE[r.weight] || TABLE.light; // only the act length matters for pulse maths
  let dx, dy, rot, sq, glow;
  let pdx = 0, pdy = 0, prot = 0;
  if (phase === 'tell') {
    const e = backIn(k);
    dx = T.dx * e * sc; dy = T.dy * e * sc; rot = T.rot * e * sc; sq = T.sq * e; glow = T.glow * Math.max(0, smooth(k));
  } else if (phase === 'act') {
    let e = expoOut(k);
    if (hits > 1 && r.cls === 'attack') { // pulsed strikes: dips between hits, lands full on the last
      const act = 60 + (hits - 1) * (hits > 5 ? 70 : 90), gap = hits > 5 ? 70 : 90;
      const tt = (k * act - 60) / gap;
      const env = clamp(k * act / 60, 0, 1);
      e = e * (0.7 + 0.3 * (0.5 + 0.5 * Math.cos(TAU * tt))) ;
      e = lerp(e * 0.7, e, env) * 1; if (k >= 1) e = 1;
    }
    dx = lerp(T.dx, I.dx, e) * sc; dy = lerp(T.dy, I.dy, e) * sc - (s.arc || 0) * Math.sin(PI * k) * sc; rot = lerp(T.rot, I.rot, e) * sc; sq = lerp(T.sq, I.sq, e); glow = lerp(T.glow, I.glow, e);
  } else if (phase === 'hold') {
    dx = I.dx * sc; dy = I.dy * sc; rot = I.rot * sc; sq = I.sq; glow = I.glow * (1 - 0.15 * Math.sin(PI * k));
    if (s.hold) { const h = s.hold(k); pdx = h.dx || 0; pdy = h.dy || 0; prot = h.rot || 0; }
  } else {
    const sp = spring(k);
    dx = I.dx * sc * sp; dy = I.dy * sc * sp; rot = I.rot * sc * sp; glow = I.glow * sp;
    sq = I.sq * (1 - elasticOut(k)); // settles with overshoot, ends at rest
  }
  dx += pdx; dy += pdy; rot += prot;
  const m = Math.log(maxDef(r.bk));
  sq = clamp(sq, -1, 1);
  const sy = Math.exp(sq * m);
  const extra = s.x ? s.x(phase, k, { hits, body: r.bk }) : {};
  extra.weight = r.weight;
  extra.kind = r.cls;
  extra.attacking = r.cls === 'attack';
  extra.contact = (phase === 'act' && k >= 0.95) || (phase === 'hold' && k <= 0.1);
  if (extra.shakeDir === undefined) extra.shakeDir = s.sd === undefined ? PI : s.sd;
  void dur;
  return { dx, dy, sx: 1 / sy, sy, rot, glow: clamp(glow, 0, 1), extra };
}

