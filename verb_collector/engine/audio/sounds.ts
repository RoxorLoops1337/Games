/**
 * Procedural audio for Verb Collector.
 *
 * Pure Web Audio API — no external assets, no extra packages. Every SFX and
 * music track is synthesised at call time so we ship zero binary payload.
 *
 * Aesthetic: manuscript-roguelike. SFX are tactile parchment / quill / wax /
 * wood / metal. Music is Tolkien / DnD-session pads with modal melodies.
 *
 * Caller owns the AudioContext lifecycle and must `resume()` it after a user
 * gesture before calling any of these. Everything here assumes the context is
 * already running (or will be soon — scheduled events will still fire).
 */

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface SoundLib {
  playClick(ctx: AudioContext, out: AudioNode): void;
  playToken(ctx: AudioContext, out: AudioNode): void;
  playCast(ctx: AudioContext, out: AudioNode): void;
  playHit(ctx: AudioContext, out: AudioNode): void;
  playBurn(ctx: AudioContext, out: AudioNode): void;
  playFreeze(ctx: AudioContext, out: AudioNode): void;
  playHeal(ctx: AudioContext, out: AudioNode): void;
  playBlock(ctx: AudioContext, out: AudioNode): void;
  playEnemyAttack(ctx: AudioContext, out: AudioNode): void;
  playEnemyDeath(ctx: AudioContext, out: AudioNode): void;
  playReward(ctx: AudioContext, out: AudioNode): void;
  playSceneEnter(ctx: AudioContext, out: AudioNode): void;
  playVictory(ctx: AudioContext, out: AudioNode): void;
  playDefeat(ctx: AudioContext, out: AudioNode): void;
  playInk(ctx: AudioContext, out: AudioNode): void;

  startMusic(
    ctx: AudioContext,
    out: AudioNode,
    track: 'menu' | 'world' | 'combat' | 'boss',
  ): MusicHandle;
}

export interface MusicHandle {
  stop(fadeMs?: number): void;
}

// ---------------------------------------------------------------------------
// Tiny synth helpers
// ---------------------------------------------------------------------------

type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface ToneOpts {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  peak?: number;
  detune?: number;
}

/**
 * One-shot pitched note with a simple ADSR envelope. Returns the gain node
 * so the caller can chain more (e.g. a filter, or another envelope).
 */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  duration: number,
  type: OscType = 'sine',
  opts: ToneOpts = {},
): GainNode {
  const t = ctx.currentTime;
  const attack = opts.attack ?? 0.005;
  const decay = opts.decay ?? 0.05;
  const sustain = opts.sustain ?? 0.6;
  const release = opts.release ?? 0.08;
  const peak = opts.peak ?? 0.3;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  if (opts.detune) osc.detune.value = opts.detune;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + attack + decay);
  g.gain.setValueAtTime(Math.max(0.0001, peak * sustain), t + duration);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration + release);

  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + duration + release + 0.02);
  return g;
}

/**
 * Short burst of filtered noise. Used for parchment scratch, fire crackles,
 * wax-seal thump tails, etc.
 */
function noise(
  ctx: AudioContext,
  out: AudioNode,
  duration: number,
  filter?: { type: BiquadFilterType; freq: number; q?: number },
  peak = 0.2,
  attack = 0.005,
): void {
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    if (filter.q !== undefined) f.Q.value = filter.q;
    src.connect(f).connect(g).connect(out);
  } else {
    src.connect(g).connect(out);
  }
  src.start(t);
  src.stop(t + duration + 0.02);
}

/** Schedule a tone at a precise audio-clock time (for music scheduling). */
function schedTone(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  duration: number,
  type: OscType,
  peak: number,
  attack = 0.01,
  release = 0.1,
  detune = 0,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + attack);
  g.gain.setValueAtTime(peak, when + Math.max(attack, duration - release));
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

/** Scheduled noise hit (used for music drums). */
function schedNoise(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  duration: number,
  filterFreq: number,
  filterType: BiquadFilterType,
  peak: number,
): void {
  const samples = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  src.connect(f).connect(g).connect(out);
  src.start(when);
  src.stop(when + duration + 0.02);
}

/** MIDI note → frequency (A4 = 69 = 440Hz). */
function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// SFX
// ---------------------------------------------------------------------------

function playClick(ctx: AudioContext, out: AudioNode): void {
  // Crisp paper tap: short filtered click + tiny high tick.
  noise(ctx, out, 0.04, { type: 'bandpass', freq: 2200, q: 4 }, 0.18, 0.001);
  tone(ctx, out, 1800, 0.03, 'square', { attack: 0.001, decay: 0.02, sustain: 0.0, release: 0.02, peak: 0.05 });
}

function playToken(ctx: AudioContext, out: AudioNode): void {
  // Quill inking a word onto paper — high-passed noise scratch with a quick decay.
  noise(ctx, out, 0.12, { type: 'highpass', freq: 1800, q: 0.7 }, 0.22, 0.004);
  // Small woody tick where the nib lands.
  tone(ctx, out, 540, 0.05, 'triangle', { attack: 0.002, decay: 0.03, sustain: 0.1, release: 0.04, peak: 0.08 });
}

function playCast(ctx: AudioContext, out: AudioNode): void {
  // Sealing wax stamp: low thump + brief metallic ring shimmer.
  const tThump = ctx.currentTime;
  const oscT = ctx.createOscillator();
  oscT.type = 'sine';
  oscT.frequency.setValueAtTime(180, tThump);
  oscT.frequency.exponentialRampToValueAtTime(55, tThump + 0.18);
  const gT = ctx.createGain();
  gT.gain.setValueAtTime(0.0001, tThump);
  gT.gain.exponentialRampToValueAtTime(0.5, tThump + 0.005);
  gT.gain.exponentialRampToValueAtTime(0.0001, tThump + 0.32);
  oscT.connect(gT).connect(out);
  oscT.start(tThump);
  oscT.stop(tThump + 0.36);

  // Metallic shimmer: detuned high sines, brief, after the thump lands.
  const shimmerOut = ctx.createGain();
  shimmerOut.gain.value = 0.12;
  shimmerOut.connect(out);
  const shimmerStart = ctx.currentTime + 0.04;
  [2400, 3200, 4800].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = i * 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, shimmerStart);
    g.gain.exponentialRampToValueAtTime(0.18, shimmerStart + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, shimmerStart + 0.25);
    o.connect(g).connect(shimmerOut);
    o.start(shimmerStart);
    o.stop(shimmerStart + 0.3);
  });

  // Whiff of noise for the wax compress.
  noise(ctx, out, 0.08, { type: 'lowpass', freq: 1200 }, 0.15, 0.002);
}

function playHit(ctx: AudioContext, out: AudioNode): void {
  // Wooden thump: square wave through a lowpass with fast decay.
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(lp).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.22);
  noise(ctx, out, 0.04, { type: 'lowpass', freq: 2000 }, 0.18, 0.001);
}

function playBurn(ctx: AudioContext, out: AudioNode): void {
  // Crackling fire: broadband noise pumped through a midrange bandpass.
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const spike = Math.random() < 0.04 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.4;
    data[i] = spike;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
  g.gain.setValueAtTime(0.28, t + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + 0.55);
  tone(ctx, out, 70, 0.4, 'triangle', { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.2, peak: 0.08 });
}

function playFreeze(ctx: AudioContext, out: AudioNode): void {
  // Shimmery descending arpeggio of pure sine tones (icy harp).
  const t0 = ctx.currentTime;
  const notes = [88, 83, 79, 76, 72];
  notes.forEach((m, i) => {
    const when = t0 + i * 0.06;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.18, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + 0.4);
    // Octave-up shimmer partner.
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = mtof(m + 12);
    o2.detune.value = 8;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.exponentialRampToValueAtTime(0.06, when + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    o2.connect(g2).connect(out);
    o2.start(when);
    o2.stop(when + 0.45);
  });
}

function playHeal(ctx: AudioContext, out: AudioNode): void {
  // Warm major-third bell: root + maj3 + perfect 5th, sine, slow decay.
  const root = 72; // C5
  [root, root + 4, root + 7].forEach((m, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(m);
    const g = ctx.createGain();
    const t = ctx.currentTime + i * 0.02;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.95);
  });
  // Soft body — triangle root one octave down.
  tone(ctx, out, mtof(root - 12), 0.7, 'triangle', { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.2, peak: 0.08 });
}

function playBlock(ctx: AudioContext, out: AudioNode): void {
  // Low metallic clang: stacked detuned squares through a bandpass.
  const t = ctx.currentTime;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 420;
  bp.Q.value = 4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  bp.connect(g).connect(out);
  [220, 277, 330, 415].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.detune.value = (i - 1) * 5;
    o.connect(bp);
    o.start(t);
    o.stop(t + 0.5);
  });
  noise(ctx, out, 0.05, { type: 'highpass', freq: 2500 }, 0.12, 0.001);
}

function playEnemyAttack(ctx: AudioContext, out: AudioNode): void {
  // Sharp percussive thwack — pitched sweep + noise burst.
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(380, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.22);
  noise(ctx, out, 0.06, { type: 'bandpass', freq: 1800, q: 1.2 }, 0.22, 0.001);
}

function playEnemyDeath(ctx: AudioContext, out: AudioNode): void {
  // A breathy sigh (noise sweeping down) followed by a low quiet thump.
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.exponentialRampToValueAtTime(380, t + 0.4);
  bp.Q.value = 1.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + 0.55);
  // Low thump after the sigh.
  const thumpAt = t + 0.35;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, thumpAt);
  o.frequency.exponentialRampToValueAtTime(45, thumpAt + 0.2);
  const gt = ctx.createGain();
  gt.gain.setValueAtTime(0.0001, thumpAt);
  gt.gain.exponentialRampToValueAtTime(0.22, thumpAt + 0.01);
  gt.gain.exponentialRampToValueAtTime(0.0001, thumpAt + 0.4);
  o.connect(gt).connect(out);
  o.start(thumpAt);
  o.stop(thumpAt + 0.45);
}

function playReward(ctx: AudioContext, out: AudioNode): void {
  // Small fanfare: major arpeggio C E G C, plucked-string flavour (triangle).
  const root = 72;
  const notes = [root, root + 4, root + 7, root + 12];
  notes.forEach((m, i) => {
    const when = ctx.currentTime + i * 0.08;
    schedTone(ctx, out, when, mtof(m), 0.35, 'triangle', 0.18, 0.005, 0.15);
    schedTone(ctx, out, when, mtof(m + 12), 0.35, 'sine', 0.06, 0.005, 0.15, 4);
  });
}

function playSceneEnter(ctx: AudioContext, out: AudioNode): void {
  // Page-turn whoosh: filtered noise sweep + a low soft thump.
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.45), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + 0.5);
  tone(ctx, out, 110, 0.25, 'sine', { attack: 0.02, decay: 0.05, sustain: 0.4, release: 0.1, peak: 0.1 });
}

function playVictory(ctx: AudioContext, out: AudioNode): void {
  // Full bright fanfare in D major: I - V - vi - IV-ish. Brass-y saw + bell.
  const t0 = ctx.currentTime;
  const bass = [38, 45, 47, 43];
  const lead = [
    [62, 66, 69, 74],
    [69, 73, 76, 81],
    [71, 74, 78, 83],
    [67, 71, 74, 79],
  ];
  const brass = ctx.createBiquadFilter();
  brass.type = 'lowpass';
  brass.frequency.value = 1800;
  const brassG = ctx.createGain();
  brassG.gain.value = 0.22;
  brass.connect(brassG).connect(out);

  bass.forEach((m, i) => {
    const when = t0 + i * 0.45;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(1.0, when + 0.02);
    g.gain.setValueAtTime(0.9, when + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
    o.connect(g).connect(brass);
    o.start(when);
    o.stop(when + 0.5);

    const chord = lead[i];
    if (chord) {
      chord.forEach((nm, j) => {
        const w = when + j * 0.09;
        schedTone(ctx, out, w, mtof(nm), 0.25, 'triangle', 0.18, 0.005, 0.12);
        schedTone(ctx, out, w, mtof(nm + 12), 0.25, 'sine', 0.06, 0.005, 0.12, 5);
      });
    }
  });
  // Final big bell sustain.
  const tail = t0 + bass.length * 0.45;
  [62, 66, 69, 74].forEach((m) => {
    schedTone(ctx, out, tail, mtof(m), 1.4, 'sine', 0.12, 0.02, 0.6);
  });
}

function playDefeat(ctx: AudioContext, out: AudioNode): void {
  // Slow descending modal cadence in D Aeolian: i bVII bVI V (Dm C Bb A).
  const t0 = ctx.currentTime;
  const chords = [
    [50, 53, 57],
    [48, 52, 55],
    [46, 50, 53],
    [45, 49, 52],
  ];
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  const mainG = ctx.createGain();
  mainG.gain.value = 0.18;
  lp.connect(mainG).connect(out);

  chords.forEach((c, i) => {
    const when = t0 + i * 0.7;
    c.forEach((m, j) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = j * 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.6, when + 0.08);
      g.gain.setValueAtTime(0.55, when + 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.75);
      o.connect(g).connect(lp);
      o.start(when);
      o.stop(when + 0.8);
    });
    const root = c[0];
    if (root !== undefined) {
      const ob = ctx.createOscillator();
      ob.type = 'triangle';
      ob.frequency.value = mtof(root - 12);
      const gb = ctx.createGain();
      gb.gain.setValueAtTime(0.0001, when);
      gb.gain.exponentialRampToValueAtTime(0.25, when + 0.05);
      gb.gain.exponentialRampToValueAtTime(0.0001, when + 0.78);
      ob.connect(gb).connect(out);
      ob.start(when);
      ob.stop(when + 0.85);
    }
  });
}

function playInk(ctx: AudioContext, out: AudioNode): void {
  // Liquid drip + faint shimmer — gaining ink should feel precious.
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.25);
  schedTone(ctx, out, t + 0.04, mtof(86), 0.25, 'sine', 0.08, 0.005, 0.18);
}

// ---------------------------------------------------------------------------
// Music — modal pads, plucked melodies, scheduled on the audio clock
// ---------------------------------------------------------------------------

interface InternalHandle extends MusicHandle {
  stopped: boolean;
}

/**
 * Scheduler that runs a tick function periodically and lets it schedule
 * events ahead of `ctx.currentTime`.
 */
function startScheduler(
  ctx: AudioContext,
  handle: InternalHandle,
  tick: (now: number, lookahead: number) => void,
  intervalMs = 100,
  lookaheadSec = 0.25,
): void {
  const loop = (): void => {
    if (handle.stopped) return;
    tick(ctx.currentTime, lookaheadSec);
    setTimeout(loop, intervalMs);
  };
  loop();
}

function fadeAndDisconnect(ctx: AudioContext, g: GainNode, fadeMs: number, target: AudioNode): void {
  const t = ctx.currentTime;
  const fade = Math.max(0.01, fadeMs / 1000);
  try {
    g.gain.cancelScheduledValues(t);
    const cur = Math.max(0.0001, g.gain.value);
    g.gain.setValueAtTime(cur, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
  } catch {
    // ignore — context may be closed
  }
  setTimeout(() => {
    try {
      g.disconnect(target);
    } catch {
      // ignore
    }
    try {
      g.disconnect();
    } catch {
      // ignore
    }
  }, fadeMs + 60);
}

/**
 * Soft sustained pad chord: stack of detuned sawtooth oscillators through a
 * slow-opening lowpass + gentle gain.
 */
function makePad(
  ctx: AudioContext,
  out: AudioNode,
  midiNotes: number[],
  peak = 0.07,
): { stop: (when: number) => void } {
  const t = ctx.currentTime;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(800, t);
  lp.frequency.linearRampToValueAtTime(1600, t + 4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 2.5);
  lp.connect(g).connect(out);

  const oscs: OscillatorNode[] = [];
  midiNotes.forEach((m) => {
    [0, 7].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det - 3.5;
      o.connect(lp);
      o.start(t);
      oscs.push(o);
    });
  });

  return {
    stop: (when: number) => {
      try {
        g.gain.cancelScheduledValues(when);
        const cur = Math.max(0.0001, g.gain.value);
        g.gain.setValueAtTime(cur, when);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 1.5);
      } catch {
        // ignore
      }
      oscs.forEach((o) => {
        try {
          o.stop(when + 1.8);
        } catch {
          // ignore
        }
      });
    },
  };
}

// ---- Track: menu ----------------------------------------------------------

function startMenuMusic(ctx: AudioContext, out: AudioNode): MusicHandle {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(out);
  const t0 = ctx.currentTime;
  master.gain.exponentialRampToValueAtTime(0.55, t0 + 3);

  const handle: InternalHandle = {
    stopped: false,
    stop: (fadeMs = 600) => {
      handle.stopped = true;
      fadeAndDisconnect(ctx, master, fadeMs, out);
    },
  };

  // Pad: D3 + F3 + A3 + C4 (Dm7 voicing — Aeolian flavour).
  makePad(ctx, master, [50, 53, 57, 60], 0.08);
  // Low drone an octave below.
  makePad(ctx, master, [38], 0.05);

  // Harp notes drawn from D Aeolian (D E F G A Bb C D).
  const scale = [62, 64, 65, 67, 69, 70, 72, 74];
  let nextNoteTime = ctx.currentTime + 2;

  startScheduler(ctx, handle, (now, lookahead) => {
    while (nextNoteTime < now + lookahead) {
      const phraseLen = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < phraseLen; i++) {
        const m = scale[Math.floor(Math.random() * scale.length)];
        if (m !== undefined) {
          const when = nextNoteTime + i * 0.35;
          schedTone(ctx, master, when, mtof(m), 1.2, 'triangle', 0.1, 0.01, 0.9);
          schedTone(ctx, master, when, mtof(m + 12), 1.0, 'sine', 0.03, 0.01, 0.9, 6);
        }
      }
      nextNoteTime += 4 + Math.random() * 2;
    }
  });

  return handle;
}

// ---- Track: world ---------------------------------------------------------

function startWorldMusic(ctx: AudioContext, out: AudioNode): MusicHandle {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(out);
  const t0 = ctx.currentTime;
  master.gain.exponentialRampToValueAtTime(0.55, t0 + 2);

  const handle: InternalHandle = {
    stopped: false,
    stop: (fadeMs = 800) => {
      handle.stopped = true;
      fadeAndDisconnect(ctx, master, fadeMs, out);
    },
  };

  // Pad: D, A, C — D Mixolydian's b7 gives the pastoral modal flavour.
  makePad(ctx, master, [50, 57, 60], 0.05);
  makePad(ctx, master, [38], 0.04);

  // Lead bus: plucked square through a lowpass.
  const leadLP = ctx.createBiquadFilter();
  leadLP.type = 'lowpass';
  leadLP.frequency.value = 2200;
  const leadGain = ctx.createGain();
  leadGain.gain.value = 0.32;
  leadLP.connect(leadGain).connect(master);

  // D Mixolydian melodic palette: D E F# G A B C D.
  const scale = [62, 64, 66, 67, 69, 71, 72, 74, 76, 78];

  // 80 bpm => eighth note = 0.375s.
  const eighth = 0.375;
  const loopBars = 16;
  const eighthsPerLoop = loopBars * 8;

  // Pre-generate a melodic skeleton so it loops cleanly.
  const seed: Array<number | null> = [];
  for (let i = 0; i < eighthsPerLoop; i++) {
    if (i % 2 === 1 && Math.random() < 0.6) {
      seed.push(null);
    } else if (Math.random() < 0.25) {
      seed.push(null);
    } else {
      const pick = scale[Math.floor(Math.random() * scale.length)];
      seed.push(pick ?? null);
    }
  }
  // Anchor the downbeat of each bar to D or A so it feels rooted.
  for (let b = 0; b < loopBars; b++) {
    seed[b * 8] = b % 2 === 0 ? 62 : 69;
  }

  let nextEighth = ctx.currentTime + 0.2;
  let step = 0;

  startScheduler(ctx, handle, (now, lookahead) => {
    while (nextEighth < now + lookahead) {
      const note = seed[step % eighthsPerLoop];
      if (note !== null && note !== undefined) {
        schedTone(ctx, leadLP, nextEighth, mtof(note), 0.45, 'square', 0.18, 0.005, 0.2);
        schedTone(ctx, master, nextEighth, mtof(note - 12), 0.4, 'sine', 0.05, 0.005, 0.2);
      }
      // Gentle drum on beats 1 and 3.
      if (step % 4 === 0) {
        schedTone(ctx, master, nextEighth, 80, 0.18, 'sine', 0.18, 0.002, 0.1);
        schedNoise(ctx, master, nextEighth, 0.05, 1200, 'lowpass', 0.05);
      }
      step++;
      nextEighth += eighth;
    }
  });

  return handle;
}

// ---- Track: combat --------------------------------------------------------

function startCombatMusic(ctx: AudioContext, out: AudioNode): MusicHandle {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(out);
  const t0 = ctx.currentTime;
  master.gain.exponentialRampToValueAtTime(0.55, t0 + 1.5);

  const handle: InternalHandle = {
    stopped: false,
    stop: (fadeMs = 600) => {
      handle.stopped = true;
      fadeAndDisconnect(ctx, master, fadeMs, out);
    },
  };

  // Low drones at D1 + D2.
  makePad(ctx, master, [38, 50], 0.07);

  // Ostinato bus.
  const ostLP = ctx.createBiquadFilter();
  ostLP.type = 'lowpass';
  ostLP.frequency.value = 1800;
  const ostG = ctx.createGain();
  ostG.gain.value = 0.28;
  ostLP.connect(ostG).connect(master);

  // 110 bpm => eighth ≈ 0.273s.
  const eighth = 60 / 110 / 2;
  // Ostinato in D Aeolian (D F A C across an octave).
  const ostPattern = [50, 57, 53, 60, 50, 57, 53, 62];
  // Sparse flute melody (triangle).
  const meloScale = [62, 65, 67, 69, 70, 72, 74, 77];
  const meloPattern: Array<number | null> = [];
  for (let i = 0; i < 32; i++) {
    if (i % 4 === 0 && Math.random() < 0.7) {
      const p = meloScale[Math.floor(Math.random() * meloScale.length)];
      meloPattern.push(p ?? null);
    } else if (Math.random() < 0.15) {
      const p = meloScale[Math.floor(Math.random() * meloScale.length)];
      meloPattern.push(p ?? null);
    } else {
      meloPattern.push(null);
    }
  }

  let nextEighth = ctx.currentTime + 0.2;
  let step = 0;

  startScheduler(ctx, handle, (now, lookahead) => {
    while (nextEighth < now + lookahead) {
      const op = ostPattern[step % ostPattern.length];
      if (op !== undefined) {
        schedTone(ctx, ostLP, nextEighth, mtof(op), 0.22, 'square', 0.15, 0.003, 0.12);
      }
      // Bass beat on every quarter note.
      if (step % 2 === 0) {
        schedTone(ctx, master, nextEighth, 55, 0.2, 'sine', 0.32, 0.002, 0.1);
        schedNoise(ctx, master, nextEighth, 0.04, 1800, 'highpass', 0.04);
      }
      // Snare-ish on beats 2 and 4.
      if (step % 4 === 2) {
        schedNoise(ctx, master, nextEighth, 0.08, 2200, 'highpass', 0.08);
      }
      const mp = meloPattern[step % meloPattern.length];
      if (mp !== null && mp !== undefined) {
        schedTone(ctx, master, nextEighth, mtof(mp), 0.5, 'triangle', 0.12, 0.01, 0.25);
      }
      step++;
      nextEighth += eighth;
    }
  });

  return handle;
}

// ---- Track: boss ----------------------------------------------------------

function startBossMusic(ctx: AudioContext, out: AudioNode): MusicHandle {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(out);
  const t0 = ctx.currentTime;
  master.gain.exponentialRampToValueAtTime(0.6, t0 + 1.5);

  const handle: InternalHandle = {
    stopped: false,
    stop: (fadeMs = 800) => {
      handle.stopped = true;
      fadeAndDisconnect(ctx, master, fadeMs, out);
    },
  };

  // Brooding pad below everything.
  makePad(ctx, master, [38, 45, 50], 0.07);

  // Brass bus (sawtooth through lowpass).
  const brassLP = ctx.createBiquadFilter();
  brassLP.type = 'lowpass';
  brassLP.frequency.value = 1400;
  const brassG = ctx.createGain();
  brassG.gain.value = 0.22;
  brassLP.connect(brassG).connect(master);

  // 70 bpm => quarter ≈ 0.857s.
  const quarter = 60 / 70;
  const bar = quarter * 4;

  // Im - bVII - bVI - Im in D Aeolian (Dm, C, Bb, Dm).
  const progression: number[][] = [
    [50, 53, 57],
    [48, 52, 55],
    [46, 50, 53],
    [50, 53, 57],
  ];
  const bassRoots = [38, 36, 34, 38];

  let nextBar = ctx.currentTime + 0.4;
  let chordIdx = 0;

  startScheduler(ctx, handle, (now, lookahead) => {
    while (nextBar < now + lookahead + 0.3) {
      const idx = chordIdx % progression.length;
      const chord = progression[idx];
      const root = bassRoots[idx];
      const start = nextBar;
      const end = nextBar + bar;
      if (chord) {
        chord.forEach((m, i) => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(m);
          o.detune.value = (i - 1) * 5;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(0.55, start + 0.25);
          g.gain.setValueAtTime(0.55, end - 0.25);
          g.gain.exponentialRampToValueAtTime(0.0001, end);
          o.connect(g).connect(brassLP);
          o.start(start);
          o.stop(end + 0.05);
        });
      }
      // Bass drum on every beat.
      for (let b = 0; b < 4; b++) {
        const beatT = start + b * quarter;
        const ob = ctx.createOscillator();
        ob.type = 'sine';
        ob.frequency.setValueAtTime(110, beatT);
        ob.frequency.exponentialRampToValueAtTime(45, beatT + 0.18);
        const gb = ctx.createGain();
        gb.gain.setValueAtTime(0.0001, beatT);
        gb.gain.exponentialRampToValueAtTime(0.5, beatT + 0.005);
        gb.gain.exponentialRampToValueAtTime(0.0001, beatT + 0.3);
        ob.connect(gb).connect(master);
        ob.start(beatT);
        ob.stop(beatT + 0.35);
        schedNoise(ctx, master, beatT, 0.025, 2200, 'highpass', 0.05);
      }
      // Sustained bass drone on the root for the bar.
      if (root !== undefined) {
        const ob = ctx.createOscillator();
        ob.type = 'triangle';
        ob.frequency.value = mtof(root);
        const gb = ctx.createGain();
        gb.gain.setValueAtTime(0.0001, start);
        gb.gain.exponentialRampToValueAtTime(0.18, start + 0.3);
        gb.gain.setValueAtTime(0.18, end - 0.2);
        gb.gain.exponentialRampToValueAtTime(0.0001, end);
        ob.connect(gb).connect(master);
        ob.start(start);
        ob.stop(end + 0.05);
      }
      chordIdx++;
      nextBar += bar;
    }
  });

  return handle;
}

// ---------------------------------------------------------------------------
// Public instance
// ---------------------------------------------------------------------------

export const sounds: SoundLib = {
  playClick,
  playToken,
  playCast,
  playHit,
  playBurn,
  playFreeze,
  playHeal,
  playBlock,
  playEnemyAttack,
  playEnemyDeath,
  playReward,
  playSceneEnter,
  playVictory,
  playDefeat,
  playInk,
  startMusic(ctx, out, track) {
    switch (track) {
      case 'menu':
        return startMenuMusic(ctx, out);
      case 'world':
        return startWorldMusic(ctx, out);
      case 'combat':
        return startCombatMusic(ctx, out);
      case 'boss':
        return startBossMusic(ctx, out);
    }
  },
};

export default sounds;
