// Sound: synthesis, space, distance.
//
// Every sample this module plays is generated at runtime. There are no files to
// download, which is the same constraint the rest of the repo puts on textures,
// and it turns out to suit gunfire better than a sample library would: a sampled
// shot is one gun in one room at one distance, and the moment you move it the
// illusion goes. Synthesis lets the same shot be a whipcrack at two metres and a
// rolling boom at eighty, which is the difference that actually reads.
//
// The model of a gunshot used throughout is the standard three-part one:
//
//   1. the muzzle blast — the expanding propellant gas, an almost-impulsive
//      broadband transient with a sub-millisecond rise and a 10–25 ms decay. It
//      carries the "crack" and almost all of the perceived loudness up close.
//   2. the body — the low-frequency pressure pulse, 60–200 Hz, which is what a
//      big cartridge has and a small one does not. Synthesised as a fast
//      downward pitch sweep plus noise through a resonant lowpass, because the
//      gas column really is a decaying resonance and not a tone.
//   3. the tail — the environment answering back. This is modelled longer and
//      louder than intuition suggests, because past roughly thirty metres the
//      direct sound has fallen below the level of its own accumulated
//      reflections, which is exactly why distant gunfire reads as a rolling
//      crack rather than a bang. Getting this balance to move with distance is
//      the single most convincing thing in the whole file.
//
// On top of that: propagation delay (343 m/s, audible past ~15 m), air
// absorption as a distance-driven lowpass (air is a lowpass filter, and a
// gunshot at sixty metres is not a quiet gunshot, it is a dull one), HRTF
// panning off the camera, occlusion from the same raycaster the bullets use,
// and a convolution reverb whose impulse responses are built here from
// exponentially-decaying band-split noise plus discrete early reflections
// derived from image-source distances.
//
// Import-time purity applies: nothing below touches an AudioContext until
// `resume()` is called from a user gesture, and every method is a no-op without
// one, so the headless suite can import this straight into Node.

import { SURFACE } from '../core/constants.js';
import { lineOfSight, raycast } from '../world/collision.js';

const SPEED_OF_SOUND = 343;      // m/s at ~20 °C, close enough for a desert dusk
const MAX_DELAY = 0.75;          // cap propagation delay; past ~250 m nothing is audible anyway

// ── weapon voices ────────────────────────────────────────────────────────────
//
// Each entry is a spectral fingerprint rather than a recording. `blast` is the
// centre of the muzzle transient's band, `bodyHi`/`bodyLo` are the endpoints of
// the pressure pulse's downward sweep, and `tailHz` is the low-mid roll that the
// convolver then smears into the room. Bigger cartridges sit lower and last
// longer in every one of those numbers; small ones are all transient.

const GUNS = {
  rifle: {
    lvl: 2.05, blast: 1800, blastQ: 0.60, blastDec: 0.0155, snap: 4600, snapLvl: 0.85,
    bodyHi: 230, bodyLo: 66, bodyDec: 0.052, bodyLvl: 0.80,
    tailHz: 940, tailDec: 0.30, tailLvl: 0.46,
    mech: 0.50, boltAt: 0.042, caseAt: 0.30, caseHz: 2650,
  },
  smg: {
    lvl: 1.65, blast: 2300, blastQ: 0.72, blastDec: 0.0105, snap: 5200, snapLvl: 0.70,
    bodyHi: 190, bodyLo: 84, bodyDec: 0.032, bodyLvl: 0.48,
    tailHz: 1150, tailDec: 0.20, tailLvl: 0.32,
    mech: 0.72, boltAt: 0.028, caseAt: 0.24, caseHz: 3100,
  },
  pistol: {
    lvl: 1.70, blast: 2050, blastQ: 0.66, blastDec: 0.0125, snap: 4900, snapLvl: 0.62,
    bodyHi: 210, bodyLo: 92, bodyDec: 0.036, bodyLvl: 0.55,
    tailHz: 1050, tailDec: 0.22, tailLvl: 0.34,
    mech: 0.85, boltAt: 0.048, caseAt: 0.34, caseHz: 3000,
  },
  shotgun: {
    lvl: 2.35, blast: 1150, blastQ: 0.50, blastDec: 0.0235, snap: 3400, snapLvl: 0.55,
    bodyHi: 175, bodyLo: 48, bodyDec: 0.088, bodyLvl: 1.25,
    tailHz: 640, tailDec: 0.42, tailLvl: 0.68,
    mech: 0.95, boltAt: 0.30, caseAt: 0, caseHz: 1500,
  },
  sniper: {
    lvl: 2.55, blast: 1450, blastQ: 0.54, blastDec: 0.0215, snap: 4100, snapLvl: 1.0,
    bodyHi: 250, bodyLo: 52, bodyDec: 0.098, bodyLvl: 1.30,
    tailHz: 700, tailDec: 0.58, tailLvl: 0.80,
    mech: 0.80, boltAt: 0.22, caseAt: 0.55, caseHz: 2200,
  },
  lmg: {
    lvl: 2.20, blast: 1620, blastQ: 0.58, blastDec: 0.0175, snap: 4300, snapLvl: 0.80,
    bodyHi: 220, bodyLo: 58, bodyDec: 0.066, bodyLvl: 1.00,
    tailHz: 820, tailDec: 0.38, tailLvl: 0.56,
    mech: 0.62, boltAt: 0.036, caseAt: 0.28, caseHz: 2400,
  },
  // Suppressed fire is not "quiet gunfire": the blast is gone almost entirely
  // and what is left is the action, so the mechanical layer is dominant.
  suppressed: {
    lvl: 0.85, blast: 900, blastQ: 0.9, blastDec: 0.030, snap: 2600, snapLvl: 0.30,
    bodyHi: 150, bodyLo: 70, bodyDec: 0.045, bodyLvl: 0.30,
    tailHz: 520, tailDec: 0.16, tailLvl: 0.14,
    mech: 1.6, boltAt: 0.020, caseAt: 0.26, caseHz: 2800,
  },
};

// ── surface timbres ──────────────────────────────────────────────────────────
//
// A footstep and a bullet impact on the same material share a resonance and
// differ only in energy and attack, so both read off one table. `res` are the
// modal frequencies the material rings at, `ring` how long those modes survive,
// `grit` how much broadband noise the contact throws off, `thump` how much of
// the energy ends up below 200 Hz.

const MAT = {
  [SURFACE.CONCRETE]: { res: [820, 1900, 3600], ring: 0.030, q: 5, grit: 1.00, gritHz: 2400, gritDec: 0.055, thump: 0.55, thumpHz: 130, bright: 1.0 },
  // Sheet metal radiates: it is a driven panel, not a struck lump, and it is the
  // loudest thing in this table. Sand is the quietest surface that exists —
  // nearly all of the energy goes into moving grains rather than into the air —
  // so its `grit` is low even though its decay is the longest here.
  [SURFACE.METAL]:    { res: [1180, 2740, 5300], ring: 0.34, q: 26, grit: 1.15, gritHz: 4200, gritDec: 0.030, thump: 0.30, thumpHz: 180, bright: 1.35 },
  [SURFACE.SAND]:     { res: [420, 900, 1700], ring: 0.008, q: 1.4, grit: 0.85, gritHz: 3100, gritDec: 0.115, thump: 0.42, thumpHz: 92, bright: 0.55 },
  [SURFACE.WOOD]:     { res: [320, 640, 1450], ring: 0.075, q: 9, grit: 0.85, gritHz: 1800, gritDec: 0.048, thump: 0.80, thumpHz: 105, bright: 0.75 },
  [SURFACE.GLASS]:    { res: [2400, 4300, 6900], ring: 0.20, q: 22, grit: 1.10, gritHz: 6200, gritDec: 0.070, thump: 0.14, thumpHz: 240, bright: 1.55 },
  [SURFACE.FLESH]:    { res: [260, 520, 950], ring: 0.014, q: 3, grit: 0.75, gritHz: 900, gritDec: 0.045, thump: 0.95, thumpHz: 78, bright: 0.35 },
  [SURFACE.FOLIAGE]:  { res: [1600, 3200, 5400], ring: 0.010, q: 2, grit: 1.35, gritHz: 4600, gritDec: 0.140, thump: 0.10, thumpHz: 200, bright: 1.15 },
  [SURFACE.WATER]:    { res: [380, 760, 1500], ring: 0.020, q: 6, grit: 1.15, gritHz: 2000, gritDec: 0.130, thump: 0.60, thumpHz: 88, bright: 0.70 },
  [SURFACE.RUBBER]:   { res: [180, 380, 720], ring: 0.020, q: 4, grit: 0.45, gritHz: 1200, gritDec: 0.035, thump: 0.90, thumpHz: 95, bright: 0.40 },
};
const mat = (s) => MAT[s] || MAT[SURFACE.CONCRETE];

// ── spaces ───────────────────────────────────────────────────────────────────
//
// Two impulse responses, crossfaded by how enclosed the listener is.
//
// The outdoor IR is the interesting one. An open desert has no diffuse field
// worth the name — there is nothing to bounce between — so its "reverb" is a
// handful of discrete slap-backs off whatever structures are out there, arriving
// at 2·d/343 and falling off as 1/d. Those taps are placed from real distances:
// a wall 15 m away answers at 87 ms, one at 100 m answers at 583 ms. Between the
// taps the tail is nearly empty, which is precisely what makes outdoor gunfire
// sound like a crack that rolls away rather than a bathroom.
//
// The interior IR is the opposite: short, immediately dense, and dark, because
// the mixing time of a small concrete room is a few milliseconds and its high
// frequencies are eaten by every bounce.

const SPACES = {
  outdoor: {
    // `damp` and `bright` are low for an open space because the *paths* are
    // long: a slap-back off a wall 100 m out has been through 200 m of air
    // before it arrives, which by the same absorption law `airCut` uses has
    // already taken everything above about 1.5 kHz off it. An outdoor tail is
    // sparse and long, but it is not bright.
    rt60: 2.10, predelay: 0.055, density: 0.13, damp: 0.42, bright: 5200,
    taps: [
      { t: 0.087, g: 0.52, pan: -0.7 },   // structure ~15 m out
      { t: 0.152, g: 0.38, pan: 0.6 },    // ~26 m
      { t: 0.245, g: 0.30, pan: -0.35 },  // ~42 m
      { t: 0.396, g: 0.22, pan: 0.8 },    // ~68 m
      { t: 0.583, g: 0.15, pan: -0.15 },  // ~100 m
      { t: 0.810, g: 0.09, pan: 0.25 },   // the far ridge
    ],
  },
  indoor: {
    rt60: 0.66, predelay: 0.006, density: 1.0, damp: 0.40, bright: 3400,
    taps: [
      { t: 0.012, g: 0.70, pan: -0.5 },
      { t: 0.014, g: 0.62, pan: 0.4 },
      { t: 0.023, g: 0.55, pan: 0.15 },
      { t: 0.035, g: 0.44, pan: -0.25 },
      { t: 0.052, g: 0.30, pan: 0.55 },
    ],
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// buffers
// ═════════════════════════════════════════════════════════════════════════════

// A long noise buffer played from a random offset at a random rate is a better
// source than a fresh buffer per shot: identical spectrum, no per-shot
// allocation, and the offset alone gives enough variation that two consecutive
// rounds never phase-cancel into the same click.
function noiseBuffer(ctx, seconds, pink) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    if (!pink) {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } else {
      // Kellet's economical pink filter: six one-poles summed, flat to within a
      // few tenths of a dB across the audible band. Pink is what wind and
      // distant rumble actually are; white noise reads as tape hiss.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    // Crossfade the tail into the head so a looped source has no seam. Without
    // this the ambience bed ticks once per loop, which is the one artefact the
    // ear finds instantly.
    const fade = Math.min(Math.floor(ctx.sampleRate * 0.25), n >> 2);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
  }
  return buf;
}

// Procedural impulse response.
//
// The tail is band-split noise with a different RT60 per band, because every
// real surface absorbs more at high frequency than at low and air adds its own
// HF loss on top: a room that rings for 0.7 s at 200 Hz rings for maybe 0.3 s at
// 8 kHz. Envelopes advance by repeated multiplication rather than an exp() per
// sample — the same curve for a tenth of the cost, and this runs at boot.
//
// Echo density is ramped in with a Bernoulli mask whose probability rises with
// time. Before the mixing time a real tail is a handful of separable
// reflections; only afterwards is it Gaussian. Holding the early part sparse is
// what stops every IR sounding like a spring reverb.
function buildIR(ctx, spec) {
  const rate = ctx.sampleRate;
  const len = Math.max(64, Math.floor(rate * (spec.rt60 * 1.2 + spec.predelay + 0.05)));
  const buf = ctx.createBuffer(2, len, rate);
  const K = 6.907755;                       // ln(1000): the exponent that lands 60 dB down at t = rt60
  const rt = [spec.rt60 * 1.35, spec.rt60, spec.rt60 * spec.damp];
  const dec = rt.map((r) => Math.exp(-K / (Math.max(r, 0.02) * rate)));
  const aLo = 1 - Math.exp(-2 * Math.PI * 380 / rate);
  const aMid = 1 - Math.exp(-2 * Math.PI * 2600 / rate);
  const aBright = 1 - Math.exp(-2 * Math.PI * spec.bright / rate);
  const pre = Math.floor(spec.predelay * rate);
  const tMix = 0.09;

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp1 = 0, lp2 = 0, out = 0, dcz = 0;
    let e0 = 1, e1 = 1, e2 = 1;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      const p = Math.min(1, spec.density * Math.pow(0.05 + t / tMix, 1.5));
      e0 *= dec[0]; e1 *= dec[1]; e2 *= dec[2];
      // Energy-compensate the thinning, so sparse and dense tails sit at the
      // same loudness and differ only in texture.
      const n = Math.random() < p ? (Math.random() * 2 - 1) / Math.sqrt(p) : 0;
      lp1 += aLo * (n - lp1);
      lp2 += aMid * (n - lp2);
      const s = lp1 * e0 + (lp2 - lp1) * e1 + (n - lp2) * e2;
      out += aBright * (s - out);           // material darkening, applied to the whole tail
      dcz += 0.0006 * (out - dcz);          // one-pole rumble trap around 45 Hz
      d[i] = out - dcz;
    }

    // Early reflections. Each is a short filtered burst rather than a single
    // sample: a naked impulse is a click, a 2 ms burst is a wall.
    for (const tap of spec.taps) {
      const at = pre + Math.floor(tap.t * rate);
      const w = Math.floor(rate * 0.0022);
      // Pan by writing the tap harder into one channel — a real reflection comes
      // from one direction, and decorrelating them is most of the stereo width.
      const side = ch === 0 ? 1 - Math.max(0, tap.pan) : 1 + Math.min(0, tap.pan);
      // A late tap has travelled further, so it is darker: the one-pole gets
      // slower with arrival time on exactly the same 1/(1+d/k) curve the
      // per-voice air filter uses, with d recovered from the tap's own delay.
      const a = 0.45 / (1 + (tap.t * SPEED_OF_SOUND) / 40);
      let z = 0;
      for (let i = 0; i < w && at + i < len; i++) {
        const env = Math.exp(-i / (w * 0.32));
        z += a * ((Math.random() * 2 - 1) - z);
        d[at + i] += z * env * tap.g * side * 0.9 / Math.sqrt(a / 0.45);
      }
    }
  }

  // Normalise on peak, not energy: the send gains decide loudness, this only has
  // to guarantee a long IR cannot drive the convolver into the ceiling.
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  if (peak > 1e-6) {
    const g = 0.86 / peak;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }
  return buf;
}

// Soft clipping.
//
// A WaveShaper's curve is indexed by input over [−1, 1] and inputs beyond that
// clamp to the endpoints, so the endpoint value *is* the ceiling. Two shapes are
// wanted: `norm` gives a unity-in/unity-out compressive curve for adding
// harmonics inside a voice, and the un-normalised form is used with a 1/drive
// pre-gain on the master, which makes the whole chain compute tanh(x) and
// therefore asymptote at exactly 1.0 no matter how many voices land on one
// sample. tanh is the right shape for both: near-linear where the mix normally
// lives, a gentle knee where a firefight pushes it, no discontinuity anywhere.
function satCurve(drive, norm) {
  const n = 2048, c = new Float32Array(n);
  const k = norm ? Math.tanh(drive) : 1;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / k;
  }
  return c;
}
const MASTER_DRIVE = 3;

// ═════════════════════════════════════════════════════════════════════════════
// the graph
// ═════════════════════════════════════════════════════════════════════════════
//
//   voices ─┬─ dry ──────────────────────────┐
//           └─ send ─ verbIn ─ conv×2 ─ verb ┤
//                                            ├─ bus{weapon,world,music} ─┐
//                                            │                           │
//                     ui, body (heartbeat, tinnitus) ────────────────┐   │
//                                                                    │   ▼
//                             duck ─ muffle ─ comp ─ satIn ─ sat ────┴─ master ─ out
//
// The UI and "body" buses skip the muffle so a hitmarker stays legible through a
// concussion and your own heartbeat is not filtered by the room — it is not in
// the room.

function buildRig(ctx, quality) {
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  const sat = ctx.createWaveShaper();
  sat.curve = satCurve(MASTER_DRIVE, false);
  sat.oversample = '4x';
  sat.connect(master);

  const satIn = ctx.createGain();
  satIn.gain.value = 1 / MASTER_DRIVE;
  satIn.connect(sat);

  // Glue rather than a brickwall — the waveshaper is the true ceiling, this only
  // has to stop a sustained firefight from swamping everything quiet.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -9;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  comp.connect(satIn);

  // Concussion filter. Sits at the top of the audible band normally and is swept
  // down to a few hundred Hz by a blast, which is what a stunned ear actually
  // does — the stapedius reflex plus a temporary threshold shift take the top
  // two octaves first.
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.Q.value = 0.4;
  muffle.connect(comp);

  const duck = ctx.createGain();
  duck.gain.value = 1;
  duck.connect(muffle);

  const bus = {
    weapon: ctx.createGain(),
    world: ctx.createGain(),
    music: ctx.createGain(),
    ui: ctx.createGain(),
    body: ctx.createGain(),
  };
  bus.weapon.gain.value = 1.0;
  bus.world.gain.value = 0.9;
  bus.music.gain.value = 0.34;
  bus.ui.gain.value = 0.55;
  bus.body.gain.value = 0.9;
  bus.weapon.connect(duck);
  bus.world.connect(duck);
  bus.music.connect(duck);
  bus.ui.connect(comp);
  bus.body.connect(comp);

  // Reverb. One shared convolver per space, crossfaded, fed by per-voice sends —
  // a convolver per shot would be both wasteful and wrong, since every source in
  // a room shares the room.
  const verbIn = ctx.createGain();
  verbIn.gain.value = 1;
  const verb = ctx.createGain();
  verb.gain.value = 0.9;
  verb.connect(duck);

  const conv = {};
  const convGain = {};
  for (const name of Object.keys(SPACES)) {
    const c = ctx.createConvolver();
    c.normalize = false;
    c.buffer = buildIR(ctx, SPACES[name]);
    const g = ctx.createGain();
    g.gain.value = name === 'outdoor' ? 1 : 0;
    verbIn.connect(c); c.connect(g); g.connect(verb);
    conv[name] = c; convGain[name] = g;
  }

  return {
    ctx, master, sat, satIn, comp, muffle, duck, bus, verbIn, verb, conv, convGain,
    noise: { white: noiseBuffer(ctx, 2.0, false), pink: noiseBuffer(ctx, 4.0, true) },
    quality,
    hrtf: quality >= 2,
    maxVoices: quality >= 3 ? 30 : quality >= 2 ? 24 : 16,
    voices: [],
    dying: [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// voice plumbing
// ═════════════════════════════════════════════════════════════════════════════

// Attack-then-exponential-decay on a gain param. `setTargetAtTime` is a genuine
// exponential rather than the fake one `exponentialRampToValueAtTime` gives, and
// physical decays are exponential, so it is the right primitive. It never
// reaches zero, hence every caller stops its source at ~7τ (−60 dB).
function ar(param, t0, peak, attack, tau) {
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  param.setTargetAtTime(0.0001, t0 + attack, Math.max(tau, 0.0005));
}
const tailOf = (attack, tau) => attack + tau * 7;

// Voice bookkeeping. `level` is the caller's honest estimate of how loud this
// voice will be at the listener; when the pool is full the quietest one is
// ramped out over 8 ms rather than cut, because a hard stop on a decaying tail
// is a click, and a click is louder than the voice it saved.
//
// A stolen voice leaves `voices` immediately and finishes fading in `dying`.
// Leaving it in the live pool until the next sweep would make the cap advisory
// rather than binding, and a mag dump at 12 rounds a second outruns a sweep
// that only happens once a frame — measured at 2617 concurrent voices before
// this was split in two.
function release(v) {
  for (const n of v.nodes) { try { n.disconnect(); } catch { /* already gone */ } }
}

function claim(rig, level) {
  if (rig.voices.length < rig.maxVoices) return true;
  let worst = -1, wl = level;
  for (let i = 0; i < rig.voices.length; i++) {
    if (rig.voices[i].level < wl) { wl = rig.voices[i].level; worst = i; }
  }
  if (worst < 0) return false;                    // nothing quieter — drop the newcomer
  const now = rig.ctx.currentTime;
  const v = rig.voices.splice(worst, 1)[0];
  try {
    v.head.gain.cancelScheduledValues(now);
    v.head.gain.setTargetAtTime(0, now, 0.008);
  } catch { /* the param was already released */ }
  v.endsAt = now + 0.05;
  rig.dying.push(v);
  // A suspended context freezes `currentTime`, so the fade queue would never
  // drain on its own. Bound it too, and take the click over the leak.
  while (rig.dying.length > rig.maxVoices) release(rig.dying.shift());
  return true;
}

function reap(rig, now) {
  for (const list of [rig.voices, rig.dying]) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].endsAt <= now) { release(list[i]); list.splice(i, 1); }
    }
  }
}

// Builds the dry/wet fork every sound hangs off. The returned gain carries its
// own voice record on `.v`, so nested constructors can register their nodes with
// the right parent instead of guessing at the end of the list.
function head(rig, busNode, wet, level, endsAt) {
  const ctx = rig.ctx;
  const g = ctx.createGain();
  g.gain.value = 1;
  const dry = ctx.createGain();
  dry.gain.value = 1;
  g.connect(dry); dry.connect(busNode);
  const nodes = [g, dry];
  if (wet > 0.001) {
    const w = ctx.createGain();
    w.gain.value = wet;
    g.connect(w); w.connect(rig.verbIn);
    nodes.push(w);
  }
  const v = { head: g, level, endsAt, nodes };
  rig.voices.push(v);
  g.v = v;
  return g;
}

// Spatialiser. HRTF is worth its cost on the sounds that matter — it is the only
// thing that puts a sound behind you — but it is a convolution per voice, so
// below the high tiers everything drops to equal-power panning.
//
// Distance attenuation is left to the panner's inverse model (a true 1/r law
// past the reference distance); the spectral half of distance is handled
// separately by `airCut`, because the two are independent physics and folding
// them together is what makes a distant sound merely quiet.
function place(rig, node, pos, hrtf, ref) {
  const p = rig.ctx.createPanner();
  p.panningModel = (hrtf !== false && rig.hrtf) ? 'HRTF' : 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = ref || 5;
  p.rolloffFactor = 1;
  p.maxDistance = 400;
  if (p.positionX) {
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
  } else if (p.setPosition) p.setPosition(pos.x, pos.y, pos.z);
  node.connect(p);
  return p;
}

// Air absorption. The attenuation coefficient of air rises steeply with
// frequency — a few hundredths of a dB per metre at 1 kHz, most of a dB per
// metre at 12 kHz — so the cumulative effect over a long path is a lowpass whose
// corner slides down roughly as 1/(1+d/k). At 1 m it is transparent; at 60 m it
// has taken the top three octaves off, which is exactly the difference between
// "gunshot nearby" and "gunshot over there".
function airCut(d) {
  const f = 19000 / (1 + d / 12);
  return f < 360 ? 360 : f > 20000 ? 20000 : f;
}

// One filter does double duty for air and occlusion; a wall is just a much more
// aggressive absorber than sixty metres of air. Sound diffracts around cover
// rather than stopping at it, so occlusion never mutes — it dulls.
function damper(rig, dist, occl) {
  const f = rig.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 0.7;
  f.frequency.value = airCut(dist) * (1 - 0.86 * occl);
  return f;
}

function noiseSrc(rig, when, dur, rate = 1, pink = false) {
  const s = rig.ctx.createBufferSource();
  const buf = pink ? rig.noise.pink : rig.noise.white;
  s.buffer = buf;
  s.playbackRate.value = rate;
  s.loop = true;
  s.start(when, Math.random() * (buf.duration - 0.5));
  s.stop(when + dur);
  return s;
}

function osc(rig, when, dur, type = 'sine') {
  const o = rig.ctx.createOscillator();
  o.type = type;
  o.start(when);
  o.stop(when + dur);
  return o;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

// ═════════════════════════════════════════════════════════════════════════════
// sounds
// ═════════════════════════════════════════════════════════════════════════════
//
// Every constructor takes `(rig, o)` where `o` is a fully-resolved description:
// absolute start time, world position or null for head-relative, distance,
// occlusion, gain. Nothing in here reads game state, which is what lets the
// offline renderer drive the identical graph the game plays.

function playGun(rig, o) {
  const ctx = rig.ctx;
  const g = GUNS[o.gun] || GUNS.rifle;
  const d = o.dist || 0;
  const when = o.when + Math.min(d / SPEED_OF_SOUND, MAX_DELAY);
  const occl = o.occl || 0;

  // How much of the direct sound survives, relative to the reflected field. This
  // one number drives the whole near/far character: at 1 m the transient is
  // everything, at 60 m it is a fifth of what the tail is doing.
  const near = 1 / (1 + d / 16);
  const blastLvl = g.lvl * o.gain * (0.22 + 0.78 * near) * (1 - 0.45 * occl);
  const tailLvl = g.lvl * o.gain * g.tailLvl * (0.9 + 1.5 * (1 - near));
  const wet = o.wet != null ? o.wet : 0.16 + 0.70 * (1 - near);
  const tailDec = g.tailDec * (1 + d / 40);

  const end = when + Math.max(tailOf(0.010, tailDec), 0.9) + (g.caseAt ? 0.45 : 0);
  if (!claim(rig, blastLvl)) return;
  const H = head(rig, o.bus || rig.bus.weapon, wet, blastLvl, end + 0.2);
  const V = H.v;

  // Spatialisation: the player's own weapon is at the listener and must not be
  // distance-attenuated or HRTF'd — it would smear a sound whose whole job is to
  // be instant. It gets a small stereo offset instead, because the muzzle is a
  // forearm's length right of your nose.
  let sink = H;
  if (o.pos) {
    const dmp = damper(rig, d, occl);
    const pan = place(rig, dmp, o.pos, true);
    pan.connect(H);
    V.nodes.push(dmp, pan);
    sink = dmp;
  } else if (ctx.createStereoPanner) {
    const sp = ctx.createStereoPanner();
    sp.pan.value = o.pan != null ? o.pan : 0.10;
    sp.connect(H);
    V.nodes.push(sp);
    sink = sp;
  }

  // ── 1. muzzle blast ────────────────────────────────────────────────────────
  // Sub-millisecond rise. Anything slower and the ear hears a "whump" instead of
  // a crack, because the onset is what the auditory system uses to judge
  // impulsiveness at all.
  {
    const dur = tailOf(0.0004, g.blastDec) + 0.02;
    const src = noiseSrc(rig, when, dur, rnd(0.94, 1.08));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(g.blast * rnd(0.94, 1.06), when);
    // The band slides down as the gas column expands and cools.
    bp.frequency.exponentialRampToValueAtTime(g.blast * 0.42, when + g.blastDec * 3);
    bp.Q.value = g.blastQ;
    const shape = ctx.createWaveShaper();
    shape.curve = satCurve(2.2, true);   // the near-field of a muzzle is genuinely non-linear
    shape.oversample = '2x';
    const vg = ctx.createGain();
    // The 2.4 is not a taste knob: a Q≈0.6 bandpass throws away most of a white
    // noise source's amplitude, and the peak overpressure of a real muzzle blast
    // is the transient — if the body layer ends up owning the loudest sample the
    // shot has been built backwards.
    ar(vg.gain, when, blastLvl * 2.4, 0.0004, g.blastDec);
    src.connect(bp); bp.connect(shape); shape.connect(vg); vg.connect(sink);
    V.nodes.push(bp, shape, vg);
  }

  // ── the supersonic snap ────────────────────────────────────────────────────
  // A separate, even shorter, much brighter layer: the N-wave off the projectile
  // rather than the blast off the muzzle. It is why a rifle sounds like a whip
  // and a pistol does not, and it is the first thing air absorption removes,
  // hence the extra factor of `near`.
  if (g.snapLvl > 0) {
    const src = noiseSrc(rig, when, 0.012, rnd(1.0, 1.15));
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = g.snap * 0.55; hp.Q.value = 0.6;
    const vg = ctx.createGain();
    ar(vg.gain, when, blastLvl * g.snapLvl * 0.55 * near, 0.00025, 0.0014);
    src.connect(hp); hp.connect(vg); vg.connect(sink);
    V.nodes.push(hp, vg);
  }

  // ── 2. body ────────────────────────────────────────────────────────────────
  // Two parts, because the low end of a gunshot is two things: a genuinely
  // pitched pulse from the gas column (swept sine) and a broadband thump
  // (resonant-lowpassed noise). Either alone sounds synthetic.
  {
    // Offset behind the blast by ~2 ms: the shock front leaves first and the gas
    // column's resonance only establishes itself behind it. It is a small number
    // but it is what keeps the leading edge in the hands of the transient.
    const t0 = when + 0.002;
    const dur = tailOf(0.001, g.bodyDec) + 0.02;
    const o1 = osc(rig, t0, dur, 'sine');
    o1.frequency.setValueAtTime(g.bodyHi, t0);
    o1.frequency.exponentialRampToValueAtTime(g.bodyLo, t0 + g.bodyDec * 1.6);
    const o2 = osc(rig, t0, dur, 'triangle');
    o2.frequency.setValueAtTime(g.bodyHi * 0.62, t0);
    o2.frequency.exponentialRampToValueAtTime(g.bodyLo * 0.55, t0 + g.bodyDec * 1.9);
    const vg = ctx.createGain();
    ar(vg.gain, t0, blastLvl * g.bodyLvl, 0.0009, g.bodyDec);
    const o2g = ctx.createGain(); o2g.gain.value = 0.45;
    o1.connect(vg); o2.connect(o2g); o2g.connect(vg); vg.connect(sink);

    const nsrc = noiseSrc(rig, t0, dur, rnd(0.9, 1.1));
    const lp = ctx.createBiquadFilter();
    // Q 4 rather than 6: any higher and the filter rings on past the pulse that
    // excited it, which pushes the loudest sample of the shot into the body.
    lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(g.bodyHi * 4.2, t0);
    lp.frequency.exponentialRampToValueAtTime(g.bodyLo * 1.6, t0 + g.bodyDec * 2.2);
    const ng = ctx.createGain();
    ar(ng.gain, t0, blastLvl * g.bodyLvl * 0.6, 0.0006, g.bodyDec * 1.2);
    nsrc.connect(lp); lp.connect(ng); ng.connect(sink);
    V.nodes.push(vg, o2g, lp, ng);
  }

  // ── 3. tail ────────────────────────────────────────────────────────────────
  // The convolver supplies the room, but only for energy that is already there.
  // This layer is the *summed* far field — a hundred reflections off a hundred
  // surfaces too small to model, arriving smeared. It has a slow attack (it
  // cannot arrive before the direct sound) and a long, low decay, and it grows
  // with distance until it is the whole sound.
  {
    const dur = tailOf(0.014, tailDec) + 0.05;
    const src = noiseSrc(rig, when, dur, rnd(0.85, 1.0), true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(g.tailHz * (0.6 + 0.4 * near), when);
    bp.frequency.exponentialRampToValueAtTime(g.tailHz * 0.45, when + tailDec * 2);
    bp.Q.value = 0.85;
    const vg = ctx.createGain();
    ar(vg.gain, when + 0.004, tailLvl, 0.014, tailDec);
    src.connect(bp); bp.connect(vg); vg.connect(sink);
    V.nodes.push(bp, vg);
  }

  // ── mechanical layers ──────────────────────────────────────────────────────
  // Only worth spending nodes on up close; past twenty metres the action is
  // twenty dB under the blast and nobody has ever heard it.
  if (d < 22 && g.mech > 0) {
    const mechLvl = blastLvl * g.mech * 0.11 * (1 / (1 + d / 6));
    playAction(rig, V, sink, when + g.boltAt, mechLvl);
    if (g.caseAt > 0 && d < 12) playCase(rig, V, sink, when + g.caseAt, mechLvl * 0.8, g.caseHz);
  }
}

// The bolt: steel on steel. A very short noise burst for the impact plus two
// high-Q resonances for the ring the receiver adds to it.
function playAction(rig, V, sink, when, lvl) {
  const ctx = rig.ctx;
  const src = noiseSrc(rig, when, 0.06, rnd(0.9, 1.2));
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = rnd(2600, 3600); bp.Q.value = 1.1;
  const vg = ctx.createGain();
  ar(vg.gain, when, lvl, 0.0006, 0.006);
  src.connect(bp); bp.connect(vg); vg.connect(sink);
  V.nodes.push(bp, vg);
  for (const [f, q, a] of [[1750, 20, 0.35], [4100, 26, 0.22]]) {
    const r = ctx.createBiquadFilter();
    r.type = 'bandpass'; r.frequency.value = f * rnd(0.95, 1.05); r.Q.value = q;
    const rg = ctx.createGain();
    ar(rg.gain, when, lvl * a, 0.0006, 0.016);
    bp.connect(r); r.connect(rg); rg.connect(sink);
    V.nodes.push(r, rg);
  }
}

// The ejected case: a thin brass tube bouncing on concrete. Inharmonic partials
// — a tube's modes are not a harmonic series — with fast decays, struck two or
// three times as it bounces, each quieter and a touch higher as it loses energy
// and lands on a smaller contact patch.
function playCase(rig, V, sink, when, lvl, base) {
  const ctx = rig.ctx;
  const bounces = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let b = 0; b < bounces; b++) {
    const t = when + b * rnd(0.07, 0.12) + (b ? rnd(0, 0.03) : 0);
    const amp = lvl * Math.pow(0.55, b);
    for (const ratio of [1, 1.61, 2.29, 3.14]) {
      const o = osc(rig, t, 0.14, 'sine');
      o.frequency.value = base * ratio * rnd(0.96, 1.05) * (1 + b * 0.06);
      const vg = ctx.createGain();
      ar(vg.gain, t, amp * (1 / (1 + ratio * 1.3)), 0.0004, 0.014 / (0.6 + ratio * 0.4));
      o.connect(vg); vg.connect(sink);
      V.nodes.push(vg);
    }
  }
}

// Cloth: a short band-limited noise swell with a slow attack. Fabric has no
// transient at all, which is exactly what distinguishes it from everything else
// in the mix. Given no parent voice it takes one of its own.
function playCloth(rig, V, sink, when, lvl) {
  const ctx = rig.ctx;
  if (!V) {
    if (!claim(rig, 0.05)) return;
    const H = head(rig, sink, 0.08, 0.05, when + 0.6);
    V = H.v; sink = H;
  }
  const dur = rnd(0.10, 0.20);
  const src = noiseSrc(rig, when, dur + 0.05, rnd(0.8, 1.2));
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = rnd(1900, 3400); bp.Q.value = 0.8;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 900;
  const vg = ctx.createGain();
  vg.gain.setValueAtTime(0.0001, when);
  vg.gain.linearRampToValueAtTime(lvl * 0.055, when + dur * 0.4);
  vg.gain.setTargetAtTime(0.0001, when + dur * 0.4, dur * 0.25);
  src.connect(bp); bp.connect(hp); hp.connect(vg); vg.connect(sink);
  V.nodes.push(bp, hp, vg);
}

// Dry fire: a firing pin falling on nothing. Pure mechanism, no gas.
function playDry(rig, o) {
  const ctx = rig.ctx;
  const when = o.when;
  if (!claim(rig, 0.2)) return;
  const H = head(rig, rig.bus.weapon, 0.06, 0.2, when + 0.2);
  const src = noiseSrc(rig, when, 0.05, rnd(1.0, 1.2));
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = rnd(3200, 4200); bp.Q.value = 1.4;
  const vg = ctx.createGain();
  ar(vg.gain, when, 0.34 * (o.gain || 1), 0.0004, 0.0035);
  const r = ctx.createBiquadFilter();
  r.type = 'bandpass'; r.frequency.value = 1450; r.Q.value = 18;
  const rg = ctx.createGain();
  ar(rg.gain, when, 0.10 * (o.gain || 1), 0.0005, 0.020);
  src.connect(bp); bp.connect(vg); vg.connect(H);
  bp.connect(r); r.connect(rg); rg.connect(H);
  H.v.nodes.push(bp, vg, r, rg);
}

// Reload phases. Each is a different mass hitting a different material: the
// magazine release is a small sprung click, the mag drop is a heavier plastic
// clatter, seating it is a firm thunk, and the bolt release is the loudest and
// most metallic thing a rifle does short of firing.
const RELOAD = {
  start:  { hz: 2900, q: 2.0, lvl: 0.16, dec: 0.004, ring: 2600, ringQ: 12, ringLvl: 0.05, ringDec: 0.012, thump: 0 },
  magout: { hz: 1400, q: 1.1, lvl: 0.26, dec: 0.014, ring: 780, ringQ: 7, ringLvl: 0.09, ringDec: 0.035, thump: 0.20 },
  magin:  { hz: 1100, q: 1.0, lvl: 0.34, dec: 0.010, ring: 620, ringQ: 9, ringLvl: 0.12, ringDec: 0.028, thump: 0.34 },
  bolt:   { hz: 3300, q: 1.3, lvl: 0.42, dec: 0.006, ring: 1850, ringQ: 22, ringLvl: 0.20, ringDec: 0.045, thump: 0.12 },
  end:    { hz: 3100, q: 1.3, lvl: 0.36, dec: 0.006, ring: 1900, ringQ: 20, ringLvl: 0.17, ringDec: 0.040, thump: 0.14 },
};

function playReload(rig, o) {
  const ctx = rig.ctx;
  const p = RELOAD[o.phase] || RELOAD.magin;
  const when = o.when;
  const gain = o.gain != null ? o.gain : 1;
  if (!claim(rig, p.lvl)) return;
  const H = head(rig, rig.bus.weapon, 0.10, p.lvl, when + 0.6);
  const V = H.v;
  const src = noiseSrc(rig, when, 0.12, rnd(0.9, 1.15));
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = p.hz * rnd(0.92, 1.08); bp.Q.value = p.q;
  const vg = ctx.createGain();
  ar(vg.gain, when, p.lvl * gain, 0.0005, p.dec);
  src.connect(bp); bp.connect(vg); vg.connect(H);
  V.nodes.push(bp, vg);
  if (p.ringLvl > 0) {
    const r = ctx.createBiquadFilter();
    r.type = 'bandpass'; r.frequency.value = p.ring * rnd(0.96, 1.04); r.Q.value = p.ringQ;
    const rg = ctx.createGain();
    ar(rg.gain, when, p.lvl * p.ringLvl * gain * 4, 0.0006, p.ringDec);
    bp.connect(r); r.connect(rg); rg.connect(H);
    V.nodes.push(r, rg);
  }
  if (p.thump > 0) {
    const t = osc(rig, when, 0.12, 'sine');
    t.frequency.setValueAtTime(rnd(150, 190), when);
    t.frequency.exponentialRampToValueAtTime(72, when + 0.05);
    const tg = ctx.createGain();
    ar(tg.gain, when, p.thump * gain * 0.5, 0.001, 0.016);
    t.connect(tg); tg.connect(H);
    V.nodes.push(tg);
  }
  // Hands moving under a plate carrier. Cheap, and most of what sells a reload
  // as a person doing something rather than a sound effect firing.
  playCloth(rig, V, H, when + 0.02, 0.5 * gain);
}

// Impacts. Three layers off the material table: grit (the surface shattering and
// spalling), modes (what is left ringing), and thump (momentum transferred into
// the mass behind it). Energy scales all three but not equally — a low-energy
// hit is mostly grit, a high-energy one drives the thump.
function playImpact(rig, o) {
  const ctx = rig.ctx;
  const m = mat(o.surface);
  const e = clamp01(o.energy != null ? o.energy : 0.7);
  const d = o.dist || 0;
  const when = o.when + Math.min(d / SPEED_OF_SOUND, MAX_DELAY);
  const near = 1 / (1 + d / 16);
  const lvl = (o.gain != null ? o.gain : 1) * (0.35 + 0.65 * e) * (0.35 + 0.65 * near);
  if (!claim(rig, lvl)) return;

  const wet = o.wet != null ? o.wet : 0.12 + 0.55 * (1 - near);
  const H = head(rig, rig.bus.world, wet, lvl, when + 1.2 + m.ring * 8);
  const V = H.v;
  let sink = H;
  if (o.pos) {
    const dmp = damper(rig, d, o.occl || 0);
    const pan = place(rig, dmp, o.pos);
    pan.connect(H);
    V.nodes.push(dmp, pan);
    sink = dmp;
  }

  // grit
  {
    const dec = m.gritDec * (0.6 + 0.7 * e);
    const src = noiseSrc(rig, when, tailOf(0.0004, dec) + 0.03, rnd(0.85, 1.2));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(m.gritHz * rnd(0.85, 1.18), when);
    bp.frequency.exponentialRampToValueAtTime(m.gritHz * 0.35, when + dec * 3);
    bp.Q.value = 0.55;
    const vg = ctx.createGain();
    ar(vg.gain, when, lvl * m.grit * 0.85, 0.0004, dec);
    src.connect(bp); bp.connect(vg); vg.connect(sink);
    V.nodes.push(bp, vg);
  }
  // modes
  for (let i = 0; i < m.res.length; i++) {
    const r = ctx.createBiquadFilter();
    r.type = 'bandpass'; r.frequency.value = m.res[i] * rnd(0.93, 1.08); r.Q.value = m.q * rnd(0.8, 1.2);
    const src = noiseSrc(rig, when, tailOf(0.0006, m.ring) + 0.05, 1);
    const vg = ctx.createGain();
    // √Q for the same reason the footstep ring needs it: a narrow band passes
    // proportionally less of a broadband excitation, so without it a round on
    // sheet steel comes out quieter than the same round on concrete.
    ar(vg.gain, when, lvl * 0.38 * Math.sqrt(m.q) * Math.pow(0.6, i), 0.0006, m.ring * rnd(0.8, 1.25));
    src.connect(r); r.connect(vg); vg.connect(sink);
    V.nodes.push(r, vg);
  }
  // thump
  if (m.thump > 0.05) {
    const t = osc(rig, when, 0.20, 'sine');
    t.frequency.setValueAtTime(m.thumpHz * rnd(1.5, 2.0), when);
    t.frequency.exponentialRampToValueAtTime(m.thumpHz * 0.55, when + 0.06);
    const tg = ctx.createGain();
    ar(tg.gain, when, lvl * m.thump * (0.4 + 0.8 * e), 0.001, 0.022 + 0.03 * e);
    t.connect(tg); tg.connect(sink);
    V.nodes.push(tg);
  }
  // A ricochet is a fragment leaving with most of its energy, spinning — a
  // descending, vibrato'd whine. Only metal and concrete throw them, and only
  // sometimes, which is why it reads as an event rather than as a texture.
  if ((o.surface === SURFACE.METAL || o.surface === SURFACE.CONCRETE) && e > 0.45 && Math.random() < 0.30) {
    const dur = rnd(0.22, 0.45);
    const t = when + 0.006;
    const w = osc(rig, t, dur + 0.05, 'sawtooth');
    const f0 = rnd(1800, 3400);
    w.frequency.setValueAtTime(f0, t);
    w.frequency.exponentialRampToValueAtTime(f0 * rnd(0.25, 0.45), t + dur);
    const lfo = osc(rig, t, dur + 0.05, 'sine');
    lfo.frequency.value = rnd(18, 34);
    const lg = ctx.createGain(); lg.gain.value = rnd(40, 140);
    lfo.connect(lg); lg.connect(w.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f0 * 0.8; bp.Q.value = 3;
    const vg = ctx.createGain();
    ar(vg.gain, t, lvl * 0.22, 0.004, dur * 0.30);
    w.connect(bp); bp.connect(vg); vg.connect(sink);
    V.nodes.push(lg, bp, vg);
  }
}

// Bullet crack.
//
// A supersonic round drags a Mach cone. What reaches an observer beside the
// trajectory is an N-wave: two pressure discontinuities a few hundred
// microseconds apart, which the ear reads as an extremely sharp crack with no
// body at all. As the cone sweeps past, the path length grows and the wave
// arrives progressively more lowpassed — so the perceptual signature is a bright
// snap collapsing into a dull zip over ~40 ms. That downward sweep is the
// "doppler" people hear, and modelling it explicitly is far more convincing than
// a panner's velocity term, which the spec removed anyway.
function playWhizz(rig, o) {
  const ctx = rig.ctx;
  const miss = Math.max(0.4, o.miss != null ? o.miss : 2);
  const lvl = (o.gain != null ? o.gain : 1) * (1.05 / (1 + miss * 0.55));
  if (lvl < 0.02 || !claim(rig, lvl)) return;
  const when = o.when;
  const H = head(rig, rig.bus.world, 0.20, lvl, when + 0.6);
  const V = H.v;
  let sink = H;
  if (o.pos) {
    // Placed, but with a large reference distance: by definition this happened
    // within a couple of metres of your head, so the direction matters and the
    // distance law does not.
    const pre = ctx.createGain();
    const pan = place(rig, pre, o.pos, true, 40);
    pan.connect(H);
    V.nodes.push(pre, pan);
    sink = pre;
  } else if (ctx.createStereoPanner) {
    const sp = ctx.createStereoPanner();
    sp.pan.value = o.pan != null ? o.pan : rnd(-0.85, 0.85);
    sp.connect(H); V.nodes.push(sp); sink = sp;
  }

  const dur = 0.045 + miss * 0.006;
  const src = noiseSrc(rig, when, dur + 0.06, rnd(1.0, 1.15));
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  const f0 = 6200 / (1 + miss * 0.25);
  bp.frequency.setValueAtTime(f0, when);
  bp.frequency.exponentialRampToValueAtTime(Math.max(280, f0 * 0.13), when + dur);
  bp.Q.value = 1.6;
  const vg = ctx.createGain();
  ar(vg.gain, when, lvl, 0.00025, dur * 0.30);
  src.connect(bp); bp.connect(vg); vg.connect(sink);
  V.nodes.push(bp, vg);

  // A touch of pitched content under the noise gives the zip a body; pure noise
  // reads as a hiss rather than as something with mass going past.
  const w = osc(rig, when, dur + 0.04, 'sawtooth');
  w.frequency.setValueAtTime(f0 * 0.30, when);
  w.frequency.exponentialRampToValueAtTime(Math.max(120, f0 * 0.05), when + dur);
  const wg = ctx.createGain();
  ar(wg.gain, when, lvl * 0.20, 0.0008, dur * 0.22);
  w.connect(wg); wg.connect(sink);
  V.nodes.push(wg);
}

// Footsteps. Same material table as impacts but with a slower attack, far less
// energy, and a heel/toe pair — a real footfall is two contacts about 40 ms
// apart, and playing only one is the difference between a person walking and a
// metronome.
function playStep(rig, o) {
  const ctx = rig.ctx;
  const m = mat(o.surface);
  const hard = o.sprint ? 1.25 : (o.hard != null ? o.hard : 0.8);
  const d = o.dist || 0;
  const near = 1 / (1 + d / 10);
  const lvl = (o.gain != null ? o.gain : 1) * 0.26 * hard * (0.25 + 0.75 * near);
  if (lvl < 0.004 || !claim(rig, lvl)) return;
  const when = o.when + Math.min(d / SPEED_OF_SOUND, MAX_DELAY);
  const H = head(rig, rig.bus.world, 0.10 + 0.35 * (1 - near), lvl, when + 0.9 + m.ring * 8);
  const V = H.v;
  let sink = H;
  if (o.pos) {
    const dmp = damper(rig, d, o.occl || 0);
    const pan = place(rig, dmp, o.pos, false);
    pan.connect(H);
    V.nodes.push(dmp, pan);
    sink = dmp;
  } else if (ctx.createStereoPanner) {
    const sp = ctx.createStereoPanner();
    sp.pan.value = o.pan != null ? o.pan : 0;
    sp.connect(H); V.nodes.push(sp); sink = sp;
  }

  for (const [off, amp] of [[0, 1], [rnd(0.030, 0.052), rnd(0.35, 0.6)]]) {
    const t = when + off;
    const dec = m.gritDec * rnd(0.55, 0.9);
    const src = noiseSrc(rig, t, tailOf(0.0015, dec) + 0.04, rnd(0.8, 1.25));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(m.gritHz * rnd(0.6, 0.95) * m.bright, t);
    bp.frequency.exponentialRampToValueAtTime(m.gritHz * 0.28, t + dec * 3);
    bp.Q.value = 0.5;
    const vg = ctx.createGain();
    ar(vg.gain, t, lvl * m.grit * amp, 0.0015, dec);
    src.connect(bp); bp.connect(vg); vg.connect(sink);
    V.nodes.push(bp, vg);

    if (m.thump > 0.1) {
      const th = osc(rig, t, 0.16, 'sine');
      th.frequency.setValueAtTime(m.thumpHz * rnd(1.1, 1.5), t);
      th.frequency.exponentialRampToValueAtTime(m.thumpHz * 0.6, t + 0.05);
      const tg = ctx.createGain();
      ar(tg.gain, t, lvl * m.thump * amp * 0.7, 0.002, 0.020);
      th.connect(tg); tg.connect(sink);
      V.nodes.push(tg);
    }
    if (m.ring > 0.05 && amp > 0.8) {
      const r = ctx.createBiquadFilter();
      r.type = 'bandpass'; r.frequency.value = m.res[0] * rnd(0.9, 1.12); r.Q.value = m.q;
      const rg = ctx.createGain();
      // A narrow band passes proportionally less of a broadband excitation, so
      // a high-Q material needs the gain back or a steel walkway ends up
      // quieter than sand — which is the wrong way round by about 15 dB.
      ar(rg.gain, t, lvl * 0.5 * Math.sqrt(m.q), 0.002, m.ring * 0.6);
      bp.connect(r); r.connect(rg); rg.connect(sink);
      V.nodes.push(r, rg);
    }
  }
  if (!o.pos) playCloth(rig, V, sink, when, lvl * 2.2);
}

// Non-verbal vocalisation, by formant synthesis.
//
// A glottal source (sawtooth, jittered) through three parallel bandpasses at the
// vowel's formant frequencies. Gliding F1 and F2 across the utterance produces a
// vowel change, which is what makes it read as a person rather than as a filter
// sweep — and keeping it to vowels means there is no language in it, which is
// the point. Breath noise through the same formants stops a shout sounding like
// a synth lead.
const VOX = {
  alert:    { f0: [125, 165], form: [[620, 1180, 2500], [780, 1300, 2600]], dur: 0.30, lvl: 0.55, strain: 2.4, breath: 0.30 },
  bark:     { f0: [140, 120], form: [[700, 1220, 2600], [520, 900, 2450]], dur: 0.42, lvl: 0.62, strain: 2.8, breath: 0.34 },
  suppress: { f0: [150, 132], form: [[660, 1400, 2700], [600, 1000, 2500]], dur: 0.55, lvl: 0.58, strain: 2.6, breath: 0.30 },
  pain:     { f0: [180, 104], form: [[540, 1200, 2400], [420, 820, 2300]], dur: 0.34, lvl: 0.50, strain: 3.2, breath: 0.55 },
  death:    { f0: [150, 72],  form: [[500, 1100, 2350], [360, 700, 2200]], dur: 0.95, lvl: 0.46, strain: 2.2, breath: 0.95 },
  reload:   { f0: [110, 96],  form: [[450, 1050, 2400], [400, 900, 2300]], dur: 0.28, lvl: 0.32, strain: 1.4, breath: 0.30 },
  effort:   { f0: [128, 96],  form: [[560, 1120, 2450], [430, 880, 2300]], dur: 0.22, lvl: 0.30, strain: 1.6, breath: 0.60 },
};

function playVox(rig, o) {
  const ctx = rig.ctx;
  const P = VOX[o.kind] || VOX.bark;
  const d = o.dist || 0;
  const near = 1 / (1 + d / 12);
  const lvl = (o.gain != null ? o.gain : 1) * P.lvl * (0.2 + 0.8 * near);
  if (lvl < 0.01 || !claim(rig, lvl)) return;
  const when = o.when + Math.min(d / SPEED_OF_SOUND, MAX_DELAY);
  // Individuals differ mostly in vocal tract length, which scales every formant
  // together, and in pitch. One number each gives every enemy an identity that
  // survives being heard twice.
  const tract = o.timbre != null ? (0.86 + 0.30 * o.timbre) : rnd(0.86, 1.16);
  const pitch = o.timbre != null ? (0.88 + 0.26 * (1 - o.timbre)) : rnd(0.88, 1.14);
  const dur = P.dur * rnd(0.88, 1.14);
  const H = head(rig, rig.bus.world, 0.18 + 0.5 * (1 - near), lvl, when + dur + 1.0);
  const V = H.v;
  let sink = H;
  if (o.pos) {
    const dmp = damper(rig, d, o.occl || 0);
    const pan = place(rig, dmp, o.pos);
    pan.connect(H);
    V.nodes.push(dmp, pan);
    sink = dmp;
  }

  const src = osc(rig, when, dur + 0.12, 'sawtooth');
  src.frequency.setValueAtTime(P.f0[0] * pitch, when);
  src.frequency.exponentialRampToValueAtTime(Math.max(50, P.f0[1] * pitch), when + dur);
  // Jitter: a perfectly periodic glottal source sounds like a buzzer. A few per
  // cent of random frequency wander is what a real larynx does.
  const jit = osc(rig, when, dur + 0.12, 'triangle');
  jit.frequency.value = rnd(4.5, 7.5);
  const jg = ctx.createGain(); jg.gain.value = P.f0[0] * pitch * 0.035;
  jit.connect(jg); jg.connect(src.frequency);
  V.nodes.push(jg);

  const breath = noiseSrc(rig, when, dur + 0.12, rnd(0.9, 1.1));
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, when);
  bg.gain.linearRampToValueAtTime(P.breath * 0.35, when + dur * 0.25);
  bg.gain.setTargetAtTime(0.0001, when + dur * 0.5, dur * 0.35);
  breath.connect(bg);
  V.nodes.push(bg);

  const strain = ctx.createWaveShaper();
  strain.curve = satCurve(P.strain, true);
  strain.oversample = '2x';

  const mix = ctx.createGain();
  for (let i = 0; i < 3; i++) {
    const a = P.form[0][i] * tract, b = P.form[1][i] * tract;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(a, when);
    f.frequency.exponentialRampToValueAtTime(b, when + dur * 0.8);
    // Formant bandwidths are roughly constant in Hz, not in octaves, so Q has to
    // be derived from the centre frequency rather than fixed.
    f.Q.value = a / (i === 0 ? 90 : i === 1 ? 130 : 190);
    const g = ctx.createGain();
    g.gain.value = [1, 0.5, 0.20][i];
    src.connect(f); bg.connect(f);
    f.connect(g); g.connect(mix);
    V.nodes.push(f, g);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(lvl, when + dur * 0.14);
  env.gain.setValueAtTime(lvl, when + dur * 0.55);
  env.gain.setTargetAtTime(0.0001, when + dur * 0.55, dur * 0.22);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 130;
  mix.connect(strain); strain.connect(hp); hp.connect(env); env.connect(sink);
  V.nodes.push(mix, strain, hp, env);
}

// Explosion. The sub is not decoration — a blast's energy is overwhelmingly
// below 100 Hz, and the crack on top is only its leading edge. Modelled as a
// sine falling from ~110 Hz to sub-30 over a quarter second (the dominant
// frequency of an overpressure wave drops as the fireball expands), plus a
// saturated noise front, plus a long low roll the convolver spreads out.
function playExplosion(rig, o) {
  const ctx = rig.ctx;
  const d = o.dist || 0;
  const near = 1 / (1 + d / 30);
  const lvl = (o.gain != null ? o.gain : 1) * (0.5 + 0.5 * near) * 1.9;
  const when = o.when + Math.min(d / SPEED_OF_SOUND, MAX_DELAY);
  // An explosion never loses a voice contest — `Infinity` makes the steal
  // unconditional — but it still has to take a slot rather than being waved
  // past the cap, or a grenade spam ends up as the one thing that can blow the
  // budget. The voice it holds carries a high level so nothing else steals it.
  if (!claim(rig, Infinity)) return;
  const H = head(rig, rig.bus.world, 0.35 + 0.5 * (1 - near), 8, when + 4.0);
  const V = H.v;
  let sink = H;
  if (o.pos) {
    // Halved distance and occlusion: a blast wave wraps corners, and a wall
    // between you and it changes the timbre far less than it would for a voice.
    const dmp = damper(rig, d * 0.5, (o.occl || 0) * 0.5);
    const pan = place(rig, dmp, o.pos);
    pan.connect(H);
    V.nodes.push(dmp, pan);
    sink = dmp;
  }

  // sub
  {
    const s = osc(rig, when, 1.4, 'sine');
    s.frequency.setValueAtTime(112, when);
    s.frequency.exponentialRampToValueAtTime(26, when + 0.30);
    const g = ctx.createGain();
    ar(g.gain, when, lvl * 1.30, 0.004, 0.16);
    s.connect(g); g.connect(sink);
    V.nodes.push(g);
  }
  // front
  {
    const src = noiseSrc(rig, when, 0.9, rnd(0.85, 1.0));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(9000 * near + 800, when);
    lp.frequency.exponentialRampToValueAtTime(180, when + 0.32);
    const shape = ctx.createWaveShaper();
    shape.curve = satCurve(2.6, true); shape.oversample = '2x';
    const g = ctx.createGain();
    ar(g.gain, when, lvl * 0.95, 0.0008, 0.055);
    src.connect(lp); lp.connect(shape); shape.connect(g); g.connect(sink);
    V.nodes.push(lp, shape, g);
  }
  // roll
  {
    const src = noiseSrc(rig, when, 2.6, rnd(0.6, 0.8), true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(700, when);
    bp.frequency.exponentialRampToValueAtTime(110, when + 1.2);
    const g = ctx.createGain();
    ar(g.gain, when + 0.02, lvl * 0.42, 0.06, 0.36);
    src.connect(bp); bp.connect(g); g.connect(sink);
    V.nodes.push(bp, g);
  }
  // debris, scattered over the following second and a bit
  const n = 5 + (Math.random() * 6 | 0);
  for (let i = 0; i < n; i++) {
    playImpact(rig, {
      when: when + 0.12 + Math.pow(Math.random(), 1.6) * 1.1,
      pos: o.pos, dist: d, occl: o.occl,
      surface: Math.random() < 0.6 ? SURFACE.CONCRETE : SURFACE.METAL,
      energy: rnd(0.2, 0.55), gain: lvl * 0.16,
    });
  }
}

// UI. Deliberately synthetic — a hitmarker is information, not an event in the
// world, and making it diegetic only makes it harder to read through a firefight.
// Short tones, dry, on their own bus past the muffle.
function playBlip(rig, o) {
  const ctx = rig.ctx;
  const when = o.when;
  if (!claim(rig, 0.3)) return;
  const H = head(rig, rig.bus.ui, 0, 0.3, when + 0.5);
  for (const [f, at, dur, amp, type] of o.tones) {
    const s = osc(rig, when + at, dur + 0.03, type || 'triangle');
    s.frequency.setValueAtTime(f, when + at);
    const g = ctx.createGain();
    ar(g.gain, when + at, amp * (o.gain != null ? o.gain : 1), 0.0008, dur * 0.35);
    s.connect(g); g.connect(H);
    H.v.nodes.push(g);
  }
}

const BLIPS = {
  hit:      { tones: [[2350, 0, 0.030, 0.30], [3450, 0.014, 0.026, 0.20]] },
  headshot: { tones: [[2900, 0, 0.030, 0.34], [4350, 0.014, 0.030, 0.26], [5600, 0.030, 0.026, 0.16]] },
  kill:     { tones: [[3100, 0, 0.040, 0.34], [2050, 0.048, 0.060, 0.28], [1380, 0.100, 0.080, 0.20]] },
  pickup:   { tones: [[880, 0, 0.045, 0.26], [1320, 0.050, 0.070, 0.22]] },
  deny:     { tones: [[420, 0, 0.070, 0.24], [300, 0.060, 0.090, 0.20]] },
  wave:     { tones: [[196, 0, 0.35, 0.22, 'sine'], [294, 0.06, 0.40, 0.16, 'sine'], [147, 0.12, 0.55, 0.20, 'sine']] },
};

// Dispatcher shared by the live path and the offline renderer.
function spawn(rig, kind, o) {
  switch (kind) {
    case 'gun': return playGun(rig, o);
    case 'dry': return playDry(rig, o);
    case 'reload': return playReload(rig, o);
    case 'impact': return playImpact(rig, o);
    case 'whizz': return playWhizz(rig, o);
    case 'step': return playStep(rig, o);
    case 'vox': return playVox(rig, o);
    case 'explosion': return playExplosion(rig, o);
    case 'blip': return playBlip(rig, o);
    default: return undefined;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// createAudio
// ═════════════════════════════════════════════════════════════════════════════

export function createAudio(G) {
  let ctx = null;
  let rig = null;
  let failed = false;

  // Everything below is plain data until `resume()` runs — no AudioContext, no
  // window, nothing that would make importing this module in Node throw.
  const S = {
    enclosure: 0,          // 0 = open desert, 1 = sealed interior
    enclosureTarget: 0,
    probe: 0,              // which enclosure ray is cast this frame
    forced: null,          // setSpace() overrides the estimate
    duck: 1, duckTarget: 1, duckHold: 0,
    muffle: 1, muffleTarget: 1,     // 1 = transparent, 0 = blast-deafened
    tinnitus: 0,
    heartT: 0,
    intensity: 0,          // combat heat; drives music and pulls the ambience down
    stepFoot: 1,
    shotCount: 0,
    creakT: 9, farT: 24,
    wind: { a: 0.3, b: 0.2, fa: 240, fb: 1100 },
    musicT: 0, musicStep: 0,
  };

  const amb = { src: [], gain: null, lowBp: null, hiBp: null, lowGain: null, hiGain: null, drone: null, droneLp: null, droneGain: null };
  const body = { tinGain: null };

  const _lp = { x: 0, y: 0, z: 0 };
  const _fwd = { x: 0, y: 0, z: -1 };

  const vol = () => {
    const v = G.settings && G.settings.masterVol;
    return v == null ? 0.8 : v;
  };

  // ── listener ───────────────────────────────────────────────────────────────
  // Driven off the simulation's yaw/pitch rather than off the camera object, so
  // the soundfield does not inherit the render-side shake and bob — which would
  // otherwise wobble the whole world at footstep rate.
  function updateListener(dt) {
    const p = G.player;
    if (!p) return;
    const l = ctx.listener;
    const cp = Math.cos(p.pitch);
    _fwd.x = -Math.sin(p.yaw) * cp;
    _fwd.y = Math.sin(p.pitch);
    _fwd.z = -Math.cos(p.yaw) * cp;
    // Up is derived, not assumed: right = forward × worldUp, up = right ×
    // forward. The spec wants an orthonormal pair and browsers differ in how
    // forgiving they are about being handed one that is not.
    let rx = -_fwd.z, rz = _fwd.x;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = -rz * _fwd.y;
    const uy = rz * _fwd.x - rx * _fwd.z;
    const uz = rx * _fwd.y;
    const ul = Math.hypot(ux, uy, uz) || 1;

    const t = ctx.currentTime;
    const ramp = Math.min(Math.max(dt, 1 / 240), 0.1);
    if (l.positionX) {
      l.positionX.linearRampToValueAtTime(p.pos.x, t + ramp);
      l.positionY.linearRampToValueAtTime(p.pos.y, t + ramp);
      l.positionZ.linearRampToValueAtTime(p.pos.z, t + ramp);
      l.forwardX.linearRampToValueAtTime(_fwd.x, t + ramp);
      l.forwardY.linearRampToValueAtTime(_fwd.y, t + ramp);
      l.forwardZ.linearRampToValueAtTime(_fwd.z, t + ramp);
      l.upX.linearRampToValueAtTime(ux / ul, t + ramp);
      l.upY.linearRampToValueAtTime(uy / ul, t + ramp);
      l.upZ.linearRampToValueAtTime(uz / ul, t + ramp);
    } else if (l.setPosition) {
      l.setPosition(p.pos.x, p.pos.y, p.pos.z);
      l.setOrientation(_fwd.x, _fwd.y, _fwd.z, ux / ul, uy / ul, uz / ul);
    }
    _lp.x = p.pos.x; _lp.y = p.pos.y; _lp.z = p.pos.z;
  }

  // ── enclosure estimate ─────────────────────────────────────────────────────
  // Seven probes — up plus six around — one per frame, so the cost is a single
  // grid-walking raycast per frame and the estimate settles in about a tenth of
  // a second. A ray that hits inside 12 m counts toward enclosure, weighted by
  // how close it hit; the upward ray counts double, because a ceiling is what
  // actually makes a space a room.
  const PROBE_DIRS = [
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0.15, z: 0 }, { x: -1, y: 0.15, z: 0 },
    { x: 0, y: 0.15, z: 1 }, { x: 0, y: 0.15, z: -1 },
    { x: 0.7, y: 0.15, z: 0.7 }, { x: -0.7, y: 0.15, z: -0.7 },
  ];
  const probeHits = new Float32Array(PROBE_DIRS.length);

  function probeSpace() {
    if (!G.world || !G.world.grid || !G.player) return;
    const i = S.probe % PROBE_DIRS.length;
    S.probe++;
    const d = PROBE_DIRS[i];
    const l = Math.hypot(d.x, d.y, d.z);
    const hit = raycast(G.world, G.player.pos, { x: d.x / l, y: d.y / l, z: d.z / l }, 12);
    probeHits[i] = hit ? 1 - hit.t / 12 : 0;
    let sum = probeHits[0] * 2, w = 2;
    for (let k = 1; k < probeHits.length; k++) { sum += probeHits[k]; w++; }
    S.enclosureTarget = clamp01((sum / w) * 1.5);
  }

  // ── ambience ───────────────────────────────────────────────────────────────
  // A desert at dusk is two noise bands and a lot of patience. The low band is
  // the bulk air movement, the high band the whistle it makes over edges; both
  // are pink, both wander, and neither loops audibly because the two source
  // buffers run at incommensurate rates and the filters are on a random walk
  // rather than an LFO.
  function startAmbience() {
    const c = ctx;
    amb.gain = c.createGain();
    amb.gain.gain.value = 0;
    amb.gain.connect(rig.bus.world);
    amb.gain.gain.setTargetAtTime(0.55, c.currentTime, 3.0);

    amb.lowBp = c.createBiquadFilter();
    amb.lowBp.type = 'bandpass'; amb.lowBp.frequency.value = 240; amb.lowBp.Q.value = 0.8;
    amb.lowGain = c.createGain(); amb.lowGain.gain.value = 0.30;
    amb.lowBp.connect(amb.lowGain); amb.lowGain.connect(amb.gain);

    amb.hiBp = c.createBiquadFilter();
    amb.hiBp.type = 'bandpass'; amb.hiBp.frequency.value = 1100; amb.hiBp.Q.value = 3.5;
    amb.hiGain = c.createGain(); amb.hiGain.gain.value = 0.06;
    amb.hiBp.connect(amb.hiGain); amb.hiGain.connect(amb.gain);

    for (const rate of [0.31, 0.47]) {
      const s = c.createBufferSource();
      s.buffer = rig.noise.pink;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(c.currentTime, Math.random() * 3);
      s.connect(amb.lowBp); s.connect(amb.hiBp);
      amb.src.push(s);
    }
  }

  // A distant structural groan: metal or concrete letting go as the day's heat
  // leaves it. A very high-Q resonance excited by almost nothing, sliding
  // slowly, and drowned in reverb — which is what "far away" means.
  function creak() {
    const c = ctx;
    const t = c.currentTime + rnd(0, 0.4);
    const dur = rnd(1.1, 2.6);
    if (!claim(rig, 0.12)) return;
    const H = head(rig, rig.bus.world, 0.85, 0.12, t + dur + 2.5);
    const src = noiseSrc(rig, t, dur + 0.2, rnd(0.2, 0.5), true);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    const f0 = rnd(78, 240);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.linearRampToValueAtTime(f0 * rnd(0.8, 1.3), t + dur);
    f.Q.value = rnd(24, 60);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(rnd(0.10, 0.22), t + dur * 0.35);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.45, dur * 0.30);
    src.connect(f); f.connect(g);
    if (c.createStereoPanner) {
      const sp = c.createStereoPanner();
      sp.pan.value = rnd(-0.9, 0.9);
      g.connect(sp); sp.connect(H);
      H.v.nodes.push(sp);
    } else g.connect(H);
    H.v.nodes.push(f, g);
  }

  // Something happening a long way off. Almost all of the information in a
  // distant event is in what is *missing* from it, so this is an ordinary
  // gunshot put through three hundred metres of air and drowned in the outdoor
  // IR — no special case, just the distance model doing its job.
  function farOff() {
    const kind = Math.random();
    const dist = rnd(140, 340);
    const ang = Math.random() * Math.PI * 2;
    const pos = { x: _lp.x + Math.cos(ang) * dist, y: _lp.y + rnd(-4, 12), z: _lp.z + Math.sin(ang) * dist };
    if (kind < 0.55) {
      const n = 1 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        spawn(rig, 'gun', {
          when: ctx.currentTime + i * rnd(0.09, 0.22), pos, dist,
          gun: Math.random() < 0.5 ? 'rifle' : 'lmg', gain: 2.6, occl: 0, wet: 0.95,
        });
      }
    } else if (kind < 0.8) {
      spawn(rig, 'explosion', { when: ctx.currentTime, pos, dist, gain: 1.4, occl: 0 });
    } else {
      // A bird, or something that wants you to think it is one.
      const t = ctx.currentTime;
      if (!claim(rig, 0.1)) return;
      const H = head(rig, rig.bus.world, 0.7, 0.1, t + 1.4);
      const n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const at = t + i * rnd(0.10, 0.20);
        const o = osc(rig, at, 0.14, 'sine');
        const f0 = rnd(1600, 3000);
        o.frequency.setValueAtTime(f0, at);
        o.frequency.exponentialRampToValueAtTime(f0 * rnd(0.6, 1.6), at + 0.09);
        const g = ctx.createGain();
        ar(g.gain, at, 0.035, 0.006, 0.022);
        o.connect(g); g.connect(H);
        H.v.nodes.push(g);
      }
    }
  }

  // ── music ──────────────────────────────────────────────────────────────────
  // A drone and a pulse, both driven by combat intensity. Deliberately almost
  // subliminal: the job is to make silence feel loaded, not to be listened to.
  function startMusic() {
    const c = ctx;
    amb.droneGain = c.createGain();
    amb.droneGain.gain.value = 0;
    amb.droneGain.connect(rig.bus.music);
    amb.droneLp = c.createBiquadFilter();
    amb.droneLp.type = 'lowpass'; amb.droneLp.frequency.value = 320; amb.droneLp.Q.value = 2;
    amb.droneLp.connect(amb.droneGain);
    const wet = c.createGain(); wet.gain.value = 0.5;
    amb.droneGain.connect(wet); wet.connect(rig.verbIn);
    amb.drone = [];
    // Root, root again slightly detuned, the octave, and a minor second above
    // the root that only arrives with pressure. Introducing the dissonance under
    // load rather than always is what makes it read as tension.
    for (const [f, det, amp] of [[55, -7, 0.5], [55, 6, 0.5], [110, 3, 0.22], [58.3, -4, 0.05]]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = c.createGain(); g.gain.value = amp;
      o.connect(g); g.connect(amb.droneLp);
      o.start();
      amb.drone.push({ o, g });
    }
    amb.droneGain.gain.setTargetAtTime(0.5, c.currentTime, 6);
  }

  function musicPulse(t, heat) {
    const c = ctx;
    if (!claim(rig, 0.15)) return;
    const H = head(rig, rig.bus.music, 0.3, 0.15, t + 1.2);
    const s = osc(rig, t, 0.5, 'sine');
    s.frequency.setValueAtTime(82, t);
    s.frequency.exponentialRampToValueAtTime(41, t + 0.10);
    const g = c.createGain();
    ar(g.gain, t, 0.32 * (0.4 + heat), 0.004, 0.055);
    s.connect(g); g.connect(H);
    H.v.nodes.push(g);
    if (heat > 0.45) {
      const n = noiseSrc(rig, t, 0.16, 1.0);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = rnd(5200, 8200); bp.Q.value = 2;
      const ng = c.createGain();
      ar(ng.gain, t, 0.10 * heat, 0.001, 0.020);
      n.connect(bp); bp.connect(ng); ng.connect(H);
      H.v.nodes.push(bp, ng);
    }
  }

  // ── heartbeat ──────────────────────────────────────────────────────────────
  // Lub-dub: two thumps, the second softer and 0.13 s behind, which is roughly
  // the interval between the mitral and the aortic valve closing. Routed past
  // the muffle because it is inside your head, not in the room.
  function heartbeat(t, amp) {
    const c = ctx;
    if (!claim(rig, amp)) return;
    const H = head(rig, rig.bus.body, 0, amp, t + 1.0);
    for (const [off, a, f0] of [[0, 1, 62], [0.13, 0.62, 52]]) {
      const s = osc(rig, t + off, 0.35, 'sine');
      s.frequency.setValueAtTime(f0 * 1.6, t + off);
      s.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + off + 0.09);
      const g = c.createGain();
      ar(g.gain, t + off, amp * a, 0.006, 0.045);
      s.connect(g); g.connect(H);
      const n = noiseSrc(rig, t + off, 0.14, 0.5, true);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 1;
      const ng = c.createGain();
      ar(ng.gain, t + off, amp * a * 0.5, 0.004, 0.030);
      n.connect(lp); lp.connect(ng); ng.connect(H);
      H.v.nodes.push(g, lp, ng);
    }
  }

  function startTinnitus() {
    const c = ctx;
    body.tinGain = c.createGain();
    body.tinGain.gain.value = 0;
    body.tinGain.connect(rig.bus.body);
    const o = c.createOscillator();
    o.type = 'sine'; o.frequency.value = 4380;
    const og = c.createGain(); og.gain.value = 0.55;
    o.connect(og); og.connect(body.tinGain);
    o.start();
    // A narrow noise band beside the tone: real post-blast tinnitus is a band,
    // not a sine, and a bare sine sounds like a test signal.
    const n = c.createBufferSource();
    n.buffer = rig.noise.white; n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 14;
    const ng = c.createGain(); ng.gain.value = 0.45;
    n.connect(bp); bp.connect(ng); ng.connect(body.tinGain);
    n.start();
  }

  // ── event → sound ──────────────────────────────────────────────────────────

  // Occlusion, from the same raycaster the bullets use. A blocked path does not
  // go silent — sound diffracts around and through — so this only ever feeds the
  // damping filter and a modest level cut.
  const occlusionOf = (pos) =>
    (!pos || !G.world || !G.world.grid) ? 0 : (lineOfSight(G.world, _lp, pos, 0.2) ? 0 : 1);

  const distOf = (pos) =>
    pos ? Math.hypot(pos.x - _lp.x, pos.y - _lp.y, pos.z - _lp.z) : 0;

  // The player's own weapon is head-relative; anything more than a couple of
  // metres away is a world source. Ballistics can say so explicitly with
  // `e.local` or `e.team`; this is the fallback when it does not.
  function isLocal(e) {
    if (e.local != null) return !!e.local;
    if (e.team != null) return e.team === 0;
    if (!e.origin && !e.pos) return true;
    return distOf(e.origin || e.pos) < 2.0;
  }

  function handle(e) {
    if (!ctx || !rig || !e) return;
    // The event drain runs before `update`, so pull the listener position across
    // now rather than working a frame behind on the first shot of a run.
    if (G.player) { _lp.x = G.player.pos.x; _lp.y = G.player.pos.y; _lp.z = G.player.pos.z; }
    const now = ctx.currentTime;

    switch (e.type) {
      case 'shot': {
        const local = isLocal(e);
        const pos = local ? null : (e.origin || e.pos);
        const gun = e.silenced ? 'suppressed'
          : GUNS[e.weapon] ? e.weapon
          : GUNS[e.class] ? e.class : 'rifle';
        spawn(rig, 'gun', {
          when: now, pos, dist: local ? 0 : distOf(pos), gun,
          gain: local ? 1 : 1.15,
          occl: local ? 0 : occlusionOf(pos),
          bus: local ? rig.bus.weapon : rig.bus.world,
        });
        S.intensity = Math.min(1, S.intensity + (local ? 0.10 : 0.13));
        if (local) {
          // Sustained fire deafens. Not enough to be annoying, enough that a mag
          // dump leaves the world a little further away than it was.
          S.shotCount++;
          if (S.shotCount > 6) S.muffleTarget = Math.max(0.55, S.muffleTarget - 0.02);
        }
        break;
      }
      case 'dryfire':
        spawn(rig, 'dry', { when: now, gain: 1 });
        break;
      case 'reload':
        spawn(rig, 'reload', { when: now, phase: e.phase || 'magin', gain: 1 });
        break;
      case 'impact': {
        const pos = e.point || e.pos;
        spawn(rig, 'impact', {
          when: now, pos, dist: distOf(pos), occl: occlusionOf(pos),
          surface: e.surface, energy: e.energy != null ? e.energy : 0.7, gain: 1,
        });
        break;
      }
      case 'whizz': case 'crack': case 'nearMiss': {
        const pos = e.point || e.pos;
        spawn(rig, 'whizz', { when: now, pos, miss: e.miss != null ? e.miss : distOf(pos), gain: 1 });
        S.intensity = Math.min(1, S.intensity + 0.14);
        break;
      }
      case 'step': {
        const local = isLocal(e);
        // Alternate feet so pan and timbre vary; identical consecutive footsteps
        // are the loudest tell that a game is playing a sample.
        S.stepFoot = -S.stepFoot;
        const pos = local ? null : (e.pos || e.point);
        spawn(rig, 'step', {
          when: now, pos, dist: local ? 0 : distOf(pos),
          occl: local ? 0 : occlusionOf(pos),
          surface: e.surface, sprint: e.sprint, gain: local ? 1 : 1.3,
          pan: local ? S.stepFoot * 0.12 : 0,
        });
        break;
      }
      case 'jump':
        spawn(rig, 'vox', { when: now, kind: 'effort', gain: 0.5, dist: 0, timbre: 0.4 });
        spawn(rig, 'step', { when: now, surface: e.surface, hard: 0.5, gain: 0.6, pos: null });
        break;
      case 'land': {
        const hard = e.hard != null ? e.hard : 0.5;
        const local = isLocal(e);
        const pos = local ? null : (e.pos || e.point);
        spawn(rig, 'step', {
          when: now, pos, dist: local ? 0 : distOf(pos),
          occl: local ? 0 : occlusionOf(pos),
          surface: e.surface, hard: 0.9 + hard * 1.9, gain: 1,
        });
        if (local && hard > 0.55) {
          spawn(rig, 'vox', { when: now + 0.02, kind: 'effort', gain: 0.7 * hard, dist: 0, timbre: 0.4 });
        }
        break;
      }
      case 'slide': {
        // A long scrape rather than a hit: noise with no attack at all, swept
        // down as the slide bleeds speed.
        if (!claim(rig, 0.3)) break;
        const H = head(rig, rig.bus.world, 0.15, 0.3, now + 1.4);
        const src = noiseSrc(rig, now, 1.1, 0.9);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 1.1;
        bp.frequency.setValueAtTime(2600, now);
        bp.frequency.exponentialRampToValueAtTime(700, now + 0.85);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.22, now + 0.05);
        g.gain.setTargetAtTime(0.0001, now + 0.25, 0.22);
        src.connect(bp); bp.connect(g); g.connect(H);
        H.v.nodes.push(bp, g);
        spawn(rig, 'vox', { when: now, kind: 'effort', gain: 0.5, dist: 0, timbre: 0.4 });
        break;
      }
      case 'damage': case 'hit': {
        if (e.target === 'player') break;        // the player's own hurt arrives as playerHurt
        const head2 = e.headshot || e.part === 'HEAD';
        spawn(rig, 'blip', Object.assign({ when: now, gain: 1 }, head2 ? BLIPS.headshot : BLIPS.hit));
        const pos = e.point || e.pos;
        if (pos) {
          spawn(rig, 'impact', {
            when: now, pos, dist: distOf(pos), occl: occlusionOf(pos),
            surface: SURFACE.FLESH, energy: clamp01((e.amount || 25) / 60), gain: 0.9,
          });
        }
        S.intensity = Math.min(1, S.intensity + 0.06);
        break;
      }
      case 'kill': {
        spawn(rig, 'blip', Object.assign({ when: now, gain: 1 }, BLIPS.kill));
        const pos = e.pos || e.point;
        if (pos) {
          spawn(rig, 'vox', {
            when: now + 0.04, kind: 'death', pos, dist: distOf(pos),
            occl: occlusionOf(pos), gain: 1, timbre: e.timbre,
          });
        }
        break;
      }
      case 'playerHurt': {
        const amt = e.amount || 10;
        spawn(rig, 'vox', { when: now, kind: amt > 25 ? 'pain' : 'effort', gain: Math.min(1, 0.4 + amt / 60), dist: 0, timbre: 0.35 });
        spawn(rig, 'impact', { when: now, surface: SURFACE.FLESH, energy: clamp01(amt / 50), gain: 0.7 });
        S.intensity = Math.min(1, S.intensity + 0.2);
        break;
      }
      case 'playerDied':
        spawn(rig, 'vox', { when: now, kind: 'death', gain: 1, dist: 0, timbre: 0.35 });
        // Everything goes underwater and stays there, and the heartbeat is
        // allowed to run on for a few seconds after. Oldest trick in the book,
        // still works.
        S.muffleTarget = 0.06;
        S.tinnitus = Math.max(S.tinnitus, 0.5);
        S.duckTarget = 0.35;
        S.duckHold = now + 1.2;
        break;
      case 'explosion': {
        const pos = e.point || e.pos;
        const dist = distOf(pos);
        spawn(rig, 'explosion', { when: now, pos, dist, occl: occlusionOf(pos), gain: e.power != null ? e.power : 1 });
        // Duck everything hard and briefly. The blast has taken the mix; giving
        // it back over 700 ms is what makes the room feel like it stopped.
        const prox = 1 / (1 + dist / 14);
        S.duckTarget = Math.min(S.duckTarget, 1 - 0.75 * prox);
        S.duckHold = now + 0.4;
        if (prox > 0.35) {
          S.muffleTarget = Math.min(S.muffleTarget, 1 - 0.9 * prox);
          S.tinnitus = Math.max(S.tinnitus, prox);
        }
        S.intensity = 1;
        break;
      }
      case 'vox': case 'enemyVox': {
        const pos = e.pos || e.point;
        spawn(rig, 'vox', {
          when: now, kind: e.kind || 'bark', pos, dist: distOf(pos),
          occl: occlusionOf(pos), gain: 1, timbre: e.timbre,
        });
        break;
      }
      case 'enemyHurt':
        spawn(rig, 'vox', { when: now, kind: 'pain', pos: e.pos, dist: distOf(e.pos), occl: occlusionOf(e.pos), gain: 1, timbre: e.timbre });
        break;
      case 'enemyDied':
        spawn(rig, 'vox', { when: now, kind: 'death', pos: e.pos, dist: distOf(e.pos), occl: occlusionOf(e.pos), gain: 1, timbre: e.timbre });
        break;
      case 'spawn':
        if (e.pos) {
          spawn(rig, 'vox', {
            when: now + rnd(0.1, 0.5), kind: 'alert', pos: e.pos,
            dist: distOf(e.pos), occl: occlusionOf(e.pos), gain: 0.8, timbre: e.timbre,
          });
        }
        break;
      case 'pickup':
        spawn(rig, 'blip', Object.assign({ when: now, gain: 1 }, BLIPS.pickup));
        break;
      case 'deny':
        spawn(rig, 'blip', Object.assign({ when: now, gain: 1 }, BLIPS.deny));
        break;
      case 'wave':
        spawn(rig, 'blip', Object.assign({ when: now, gain: 1 }, BLIPS.wave));
        break;
      case 'swap': case 'equip':
        spawn(rig, 'reload', { when: now, phase: 'bolt', gain: 0.7 });
        break;
      case 'ads':
        playCloth(rig, null, rig.bus.weapon, now, 0.7);
        break;
      default:
        break;
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  function update(dt) {
    if (!ctx || !rig) return;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    const now = ctx.currentTime;

    updateListener(dt);
    probeSpace();
    reap(rig, now);

    // Space crossfade. Slow — walking through a doorway takes about a second to
    // change the room, which is roughly how long the ear takes to believe it.
    const target = S.forced != null ? S.forced : S.enclosureTarget;
    S.enclosure += (target - S.enclosure) * (1 - Math.exp(-2.2 * dt));
    // Equal-power: a linear crossfade dips 3 dB in the middle, which reads as
    // the reverb briefly switching off halfway through a doorway.
    const a = S.enclosure * Math.PI * 0.5;
    rig.convGain.indoor.gain.value = Math.sin(a);
    rig.convGain.outdoor.gain.value = Math.cos(a);
    rig.verb.gain.value = 0.9 + 0.35 * S.enclosure;

    // Ducking. Attack is instant — the event sets it directly — and release is a
    // slow exponential, so the mix swells back rather than snapping.
    if (S.duckHold && now > S.duckHold) S.duckHold = 0;
    if (!S.duckHold) S.duckTarget = Math.min(1, S.duckTarget + dt * 1.4);
    S.duck += (S.duckTarget - S.duck) * (1 - Math.exp(-6 * dt));
    rig.duck.gain.value = S.duck;

    // Hearing recovery. Both the muffle and the tinnitus decay over several
    // seconds, and sustained shooting keeps pushing the muffle back down.
    S.muffleTarget = Math.min(1, S.muffleTarget + dt * 0.28);
    S.muffle += (S.muffleTarget - S.muffle) * (1 - Math.exp(-3 * dt));
    S.shotCount *= Math.exp(-dt * 0.8);
    // Map 0..1 onto a logarithmic sweep from 320 Hz to 20 kHz: linear in Hz
    // would spend the whole range in the top octave and do nothing perceptible.
    rig.muffle.frequency.value = 320 * Math.pow(62.5, S.muffle);
    S.tinnitus *= Math.exp(-dt * 0.22);
    if (body.tinGain) body.tinGain.gain.value = Math.max(0, S.tinnitus - 0.05) * 0.035;

    // Combat heat: fast up, slow down. Drives the music and pulls the ambience
    // bed out of the way of a firefight.
    S.intensity = Math.max(0, S.intensity - dt * 0.11);
    if (amb.gain) {
      amb.gain.gain.value = (0.55 - 0.30 * S.intensity) * (0.55 + 0.45 * (1 - S.enclosure));
    }

    // Wind: a bounded random walk, not an LFO. An LFO slow enough to be wind is
    // also slow enough to be recognisably periodic inside a minute.
    const w = S.wind;
    w.a = clamp01(w.a + (Math.random() - 0.5) * dt * 0.9);
    w.b = clamp01(w.b + (Math.random() - 0.5) * dt * 1.3);
    w.fa += (rnd(150, 380) - w.fa) * dt * 0.35;
    w.fb += (rnd(700, 2100) - w.fb) * dt * 0.5;
    if (amb.lowGain) {
      amb.lowBp.frequency.value = w.fa;
      amb.hiBp.frequency.value = w.fb;
      amb.lowGain.gain.value = 0.14 + 0.34 * w.a;
      // The whistle only appears in the gusts — a constant one sounds like a
      // filter, an intermittent one sounds like weather.
      amb.hiGain.gain.value = 0.006 + 0.075 * Math.pow(w.b, 2.2);
    }

    S.creakT -= dt;
    if (S.creakT <= 0) { S.creakT = rnd(9, 26); creak(); }
    S.farT -= dt;
    if (S.farT <= 0) { S.farT = rnd(24, 75); farOff(); }

    if (amb.droneGain) {
      const heat = S.intensity;
      const mv = (G.settings && G.settings.musicVol != null) ? G.settings.musicVol : 0.7;
      amb.droneLp.frequency.value = 260 + 900 * heat;
      amb.droneGain.gain.value = (0.35 + 0.55 * heat) * mv;
      if (amb.drone[3]) amb.drone[3].g.gain.value = 0.05 + 0.35 * heat;
      S.musicT -= dt;
      if (S.musicT <= 0) {
        S.musicT = 0.62 - 0.20 * heat;
        S.musicStep = (S.musicStep + 1) & 7;
        if (heat > 0.12 && (S.musicStep % 2 === 0 || heat > 0.6)) musicPulse(now + 0.02, heat);
      }
    }

    // Heartbeat below a third health. The rate climbs from a resting 62 to a
    // panicking 128 as it falls, which the player reads before they read the bar.
    const p = G.player;
    if (p && p.alive && p.hp > 0 && p.hp / (p.maxHp || 100) < 0.34) {
      const f = 1 - clamp01(p.hp / ((p.maxHp || 100) * 0.34));
      S.heartT -= dt;
      if (S.heartT <= 0) {
        S.heartT = 60 / (62 + 66 * f);
        heartbeat(now + 0.01, 0.20 + 0.42 * f);
      }
    } else S.heartT = 0;

    rig.master.gain.value = vol();
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  function resume() {
    if (failed) return;
    if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return; }
    const AC = typeof globalThis !== 'undefined'
      && (globalThis.AudioContext || globalThis.webkitAudioContext);
    if (!AC) { failed = true; return; }
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      rig = buildRig(ctx, (G.settings && G.settings.quality) != null ? G.settings.quality : 2);
      rig.master.gain.value = vol();
      startAmbience();
      startMusic();
      startTinnitus();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    } catch (err) {
      // No audio is a degraded experience, not a broken game — the same rule the
      // renderer follows for a missing extension.
      failed = true; ctx = null; rig = null;
      if (typeof console !== 'undefined') console.warn('audio unavailable:', (err && err.message) || err);
    }
  }

  // Offline render of the exact graph the game plays, for numeric verification.
  // `sounds` is a list of resolved descriptors — the same shape `spawn` takes —
  // so what gets measured is what gets heard, not a parallel model of it.
  async function renderOffline(spec = {}) {
    const OAC = typeof globalThis !== 'undefined'
      && (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext);
    if (!OAC) return null;
    const rate = spec.rate || 48000;
    const octx = new OAC(2, Math.ceil(rate * (spec.seconds || 2.0)), rate);
    const r = buildRig(octx, spec.quality != null ? spec.quality : 3);
    r.maxVoices = 512;
    r.master.gain.value = spec.vol != null ? spec.vol : 1;
    if (spec.space != null) {
      const a = clamp01(spec.space) * Math.PI * 0.5;
      r.convGain.indoor.gain.value = Math.sin(a);
      r.convGain.outdoor.gain.value = Math.cos(a);
    }
    const l = octx.listener;
    if (l.positionX) {
      l.positionX.value = 0; l.positionY.value = 0; l.positionZ.value = 0;
      l.forwardX.value = 0; l.forwardY.value = 0; l.forwardZ.value = -1;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else if (l.setPosition) { l.setPosition(0, 0, 0); l.setOrientation(0, 0, -1, 0, 1, 0); }
    // `type` picks the constructor; everything else is passed through verbatim,
    // including `kind`, which several constructors use for their own variant.
    for (const s of (spec.sounds || [])) {
      spawn(r, s.type, Object.assign({}, s, { when: s.when || 0 }));
    }
    return octx.startRendering();
  }

  return {
    get ready() { return !!ctx; },
    handle,
    update,
    resume,

    // The level can name its own space; the raycast estimate is a fallback, not
    // an authority. `null` hands control back to the estimator, and a number
    // sets the blend directly.
    setSpace(name) {
      if (name == null) { S.forced = null; return; }
      if (typeof name === 'number') { S.forced = clamp01(name); return; }
      S.forced = name === 'indoor' ? 1 : name === 'outdoor' ? 0 : null;
    },
    get space() { return S.enclosure; },
    get intensity() { return S.intensity; },
    get voiceCount() { return rig ? rig.voices.length : 0; },

    // Direct hooks for systems that would rather call than emit.
    duck(amount, seconds) {
      if (!ctx) return;
      S.duckTarget = Math.min(S.duckTarget, 1 - clamp01(amount));
      S.duckHold = ctx.currentTime + (seconds || 0.4);
    },
    deafen(amount) {
      S.muffleTarget = Math.min(S.muffleTarget, 1 - clamp01(amount));
      S.tinnitus = Math.max(S.tinnitus, clamp01(amount));
    },

    renderOffline,

    suspend() { if (ctx && ctx.suspend) ctx.suspend(); },
    dispose() {
      if (!ctx) return;
      try { for (const s of amb.src) s.stop(); } catch { /* already stopped */ }
      try { ctx.close(); } catch { /* already closed */ }
      ctx = null; rig = null;
    },
  };
}
