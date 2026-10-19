// Midnight Mog audio: a fully procedural Web Audio engine. No audio files, no libraries.
// Sound identity: neon synthwave (detuned saw pads, plucky arps, sub bass, gated pumping) fused with cats
// (filtered noise purr textures with a 25Hz amplitude flutter, formant-swept meows).
//
// USAGE
//   const audio = createAudio();            // safe anywhere, even without AudioContext (every call becomes a no-op)
//   button.onclick = () => audio.resume();  // autoplay policy: nothing is created before the first resume()
//   audio.music('town'); audio.setIntensity(0.6); audio.sfx('click');
//   each frame: audio.update(dt); for (const ev of drainEvents(b)) audio.onEvent(ev);
//
// PUBLIC API (returned by createAudio)
//   resume() -> Promise<boolean>        creates/unsuspends the context and the master chain (idempotent)
//   setMuted(b) setVolume(v 0..1)       the caller persists them; getState() reads them back
//   sfx(name, o?) -> bool               o = {vol, pitch, pan -1..1, rarity, amt, n, element, seed}; false when throttled or unknown
//   onEvent(ev)                         maps every battle event type to a sound (throttled, voice capped)
//   music(mode, o?)                     'title'|'town'|'battle'|'boss'|'win'|'lose'|'crate'; o.restart re-starts the same mode
//   stopMusic(fade=0.6)  setIntensity(0..1)  update(dt)
//   crateBeat(kind, rarity, i, o?)      kind 'tick'|'shake'|'rise'|'open'|'reveal'|'new'|'dupe'; rarity common..mythic; i = beat index
//   duck(depth=0.5, seconds=0.4)        dips the music under a big moment
//   getAnalyser() getState() getStats() dispose()   lab and test helpers; debug.pumpTo(seconds) pre-schedules music offline
// Exports: createAudio, SFX_NAMES, MUSIC_MODES, EVENT_TYPES, EVENT_SFX (default sfx name per event type), CRATE_KINDS.
//
// Safety: master chain = bus mix -> compressor -> tanh soft clip -> master gain -> destination. sfx voices are capped globally and per
// sound, throttled per sound, and every node group disconnects itself when its sources end (no leaks after stopMusic).

const TAU = Math.PI * 2;
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// small integer hash to [0,1): all variation is deterministic, so a given call sequence always sounds the same
function hash(n) {
  n = Math.floor(fin(n)) | 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
const PENT = [1, 1.125, 1.25, 1.5, 1.667, 2];
const E = 0.0001;

// ------------------------------------------------------------------------------------------------ synth kit
function makeSynth(C) {
  const hasPan = typeof C.createStereoPanner === 'function';
  let noiseBuf = null;
  function getNoise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.max(1024, Math.floor(C.sampleRate * 2));
    const b = C.createBuffer(1, len, C.sampleRate);
    const d = b.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
    noiseBuf = b;
    return b;
  }
  // node groups: every node of a voice is disconnected once all of its sources have ended
  const G = () => ({ n: [], live: 0 });
  const add = (g, n) => { g.n.push(n); return n; };
  function release(g) { for (let i = 0; i < g.n.length; i++) { try { g.n[i].disconnect(); } catch (e) { /* already gone */ } } g.n.length = 0; }
  function run(g, src, t0, t1, off) {
    g.live++;
    src.onended = () => { if (--g.live <= 0) release(g); };
    if (off === undefined) src.start(t0); else src.start(t0, off);
    src.stop(Math.max(t1, t0 + 0.01));
  }
  // percussive/ADSR envelope on a gain param; returns the end time
  function env(p, t, peak, a, d, s, hold, r) {
    peak = Math.max(E, fin(peak, 0.1));
    const sus = Math.max(E, peak * s);
    p.setValueAtTime(E, t);
    p.linearRampToValueAtTime(peak, t + Math.max(0.0005, a));
    const t2 = t + Math.max(0.0005, a) + Math.max(0.002, d);
    p.exponentialRampToValueAtTime(sus, t2);
    const t3 = Math.max(t2, t + hold);
    p.setValueAtTime(sus, t3);
    p.exponentialRampToValueAtTime(E, t3 + Math.max(0.01, r));
    return t3 + Math.max(0.01, r);
  }
  function outTo(g, out, dest, pan) {
    if (pan && hasPan) { const p = add(g, C.createStereoPanner()); p.pan.value = clamp(pan, -1, 1); out.connect(p); p.connect(dest); } else out.connect(dest);
  }

  // oscillator voice: unison, glide, lowpass/highpass sweeps, vibrato
  function tone(dest, o) {
    const g = G(), t = fin(o.t), dur = Math.max(0.01, fin(o.dur, 0.2)), r = o.r === undefined ? 0.06 : o.r;
    const end = t + dur + r + 0.04;
    const n = clamp(o.unison || 1, 1, 5);
    const out = add(g, C.createGain());
    env(out.gain, t, fin(o.vol, 0.2) / Math.sqrt(n), o.a === undefined ? 0.004 : o.a, o.d === undefined ? 0.08 : o.d, o.s === undefined ? 0.4 : o.s, dur, r);
    let head = out;
    if (o.lp) {
      const f = add(g, C.createBiquadFilter()); f.type = 'lowpass'; f.Q.value = o.q || 0.7;
      f.frequency.setValueAtTime(Math.max(30, o.lp), t);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.lp2), t + Math.max(0.01, o.lpT || dur));
      f.connect(head); head = f;
    }
    if (o.hp) {
      const f = add(g, C.createBiquadFilter()); f.type = 'highpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(Math.max(20, o.hp), t);
      f.connect(head); head = f;
    }
    const f0 = Math.max(1, fin(o.f, 440)), f2 = o.f2 ? Math.max(1, fin(o.f2, f0)) : 0;
    let lfo = null, lg = null;
    if (o.vib) {
      lfo = add(g, C.createOscillator()); lfo.frequency.value = o.vib.rate || 5.5;
      lg = add(g, C.createGain()); lg.gain.value = o.vib.depth || 15; lfo.connect(lg);
    }
    for (let i = 0; i < n; i++) {
      const osc = add(g, C.createOscillator());
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(f0, t);
      if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + Math.max(0.01, o.glide || dur));
      osc.detune.value = (n > 1 ? (i - (n - 1) / 2) * (o.spread || 12) : 0) + (o.detune || 0);
      if (lg) lg.connect(osc.detune);
      osc.connect(head);
      run(g, osc, t, end);
    }
    if (lfo) run(g, lfo, t, end);
    outTo(g, out, dest, o.pan);
    return end;
  }

  // filtered noise burst
  function noise(dest, o) {
    const g = G(), t = fin(o.t), dur = Math.max(0.01, fin(o.dur, 0.1)), r = o.r === undefined ? 0.05 : o.r;
    const end = t + dur + r + 0.04;
    const src = add(g, C.createBufferSource()); src.buffer = getNoise(); src.loop = true;
    const f = add(g, C.createBiquadFilter()); f.type = o.ft || 'bandpass';
    f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(Math.max(30, fin(o.f, 1000)), t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + Math.max(0.01, o.fT || dur));
    const out = add(g, C.createGain());
    env(out.gain, t, fin(o.vol, 0.2), o.a === undefined ? 0.002 : o.a, o.d === undefined ? 0.05 : o.d, o.s === undefined ? 0.3 : o.s, dur, r);
    src.connect(f); f.connect(out);
    outTo(g, out, dest, o.pan);
    run(g, src, t, end, hash(fin(o.seed, 0) * 977 + 13) * 1.5);
    return end;
  }

  // two-operator FM bell/epiano: ratio sets the timbre (1 mellow keys, 2 glass, 3.5 metal), idx the brightness
  function fmBell(dest, o) {
    const g = G(), t = fin(o.t), dur = Math.max(0.05, fin(o.dur, 0.4)), f = Math.max(20, fin(o.f, 880));
    const end = t + dur + 0.1;
    const car = add(g, C.createOscillator()); car.type = 'sine'; car.frequency.value = f;
    const mod = add(g, C.createOscillator()); mod.type = 'sine'; mod.frequency.value = f * (o.ratio || 2);
    const mg = add(g, C.createGain());
    const idx = fin(o.idx, 2) * f;
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.04), t + dur * 0.8);
    const out = add(g, C.createGain());
    out.gain.setValueAtTime(E, t);
    out.gain.linearRampToValueAtTime(Math.max(E, fin(o.vol, 0.2)), t + (o.a || 0.003));
    out.gain.exponentialRampToValueAtTime(E, t + dur);
    mod.connect(mg); mg.connect(car.frequency); car.connect(out);
    outTo(g, out, dest, o.pan);
    run(g, car, t, end); run(g, mod, t, end);
    return end;
  }

  // sustained vowel choir: saw stack through a shared formant bank
  const VOWELS = {
    ah: [[800, 9, 1], [1150, 10, 0.55], [2900, 12, 0.18]],
    oh: [[450, 8, 1], [800, 9, 0.4], [2830, 12, 0.1]],
    ee: [[300, 8, 1], [2300, 10, 0.5], [3000, 12, 0.2]],
  };
  function choir(dest, o) {
    const g = G(), t = fin(o.t), dur = Math.max(0.2, fin(o.dur, 1.5)), r = o.r === undefined ? 0.5 : o.r;
    const end = t + dur + r + 0.05;
    const notes = o.notes && o.notes.length ? o.notes : [220];
    const out = add(g, C.createGain());
    env(out.gain, t, fin(o.vol, 0.2), o.a === undefined ? 0.5 : o.a, 0.3, 0.8, dur, r);
    const mix = add(g, C.createGain()); mix.gain.value = 1 / Math.sqrt(notes.length * 2);
    for (const v of VOWELS[o.vowel || 'ah']) {
      const bp = add(g, C.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = v[0]; bp.Q.value = v[1];
      const vg = add(g, C.createGain()); vg.gain.value = v[2] * 2.2;
      mix.connect(bp); bp.connect(vg); vg.connect(out);
    }
    const lfo = add(g, C.createOscillator()); lfo.frequency.value = 5.2;
    const lg = add(g, C.createGain()); lg.gain.value = 18; lfo.connect(lg);
    for (let i = 0; i < notes.length; i++) {
      for (let k = 0; k < 2; k++) {
        const osc = add(g, C.createOscillator()); osc.type = 'sawtooth';
        osc.frequency.value = Math.max(20, fin(notes[i], 220)); osc.detune.value = k ? 9 : -9;
        lg.connect(osc.detune); osc.connect(mix);
        run(g, osc, t, end);
      }
    }
    run(g, lfo, t, end);
    outTo(g, out, dest, o.pan);
    return end;
  }

  // a meow: sawtooth source, pitch contour, two swept formants (F1 opens, F2 falls: "mee-ow"), breath noise
  const MEOWS = {
    mew: [[0, 0.85, 420, 2300], [0.32, 1.2, 700, 2100], [1, 0.78, 560, 1000]],
    mrow: [[0, 1.0, 650, 1400], [0.45, 0.82, 820, 1100], [1, 0.58, 480, 800]],
    sad: [[0, 1.1, 500, 2000], [0.3, 1.18, 680, 1600], [1, 0.62, 440, 950]],
    chirp: [[0, 0.9, 520, 2200], [1, 1.35, 620, 2700]],
    angry: [[0, 0.9, 700, 1300], [0.3, 1.0, 900, 1150], [1, 0.5, 600, 900]],
  };
  function meow(dest, o) {
    const g = G(), t = fin(o.t), dur = Math.max(0.08, fin(o.dur, 0.45)), f = Math.max(80, fin(o.f, 560));
    const pts = MEOWS[o.shape || 'mew'] || MEOWS.mew;
    const end = t + dur + 0.1;
    const amp = add(g, C.createGain());
    amp.gain.setValueAtTime(E, t);
    amp.gain.linearRampToValueAtTime(Math.max(E, fin(o.vol, 0.3)), t + Math.min(0.05, dur * 0.2));
    amp.gain.setValueAtTime(Math.max(E, fin(o.vol, 0.3)) * 0.8, t + dur * 0.6);
    amp.gain.exponentialRampToValueAtTime(E, t + dur);
    const src = add(g, C.createOscillator()); src.type = 'sawtooth';
    src.frequency.setValueAtTime(f * pts[0][1], t);
    const lfo = add(g, C.createOscillator()); lfo.frequency.value = 6.2;
    const lg = add(g, C.createGain()); lg.gain.value = o.shape === 'angry' ? 60 : 22; lfo.connect(lg); lg.connect(src.detune);
    const fm = [add(g, C.createBiquadFilter()), add(g, C.createBiquadFilter())];
    const fg = [add(g, C.createGain()), add(g, C.createGain())];
    fm[0].type = 'bandpass'; fm[1].type = 'bandpass'; fm[0].Q.value = 5; fm[1].Q.value = 7;
    fg[0].gain.value = 1.4; fg[1].gain.value = 0.9;
    fm[0].frequency.setValueAtTime(pts[0][2], t); fm[1].frequency.setValueAtTime(pts[0][3], t);
    for (let i = 1; i < pts.length; i++) {
      const tt = t + dur * pts[i][0];
      src.frequency.linearRampToValueAtTime(f * pts[i][1], tt);
      fm[0].frequency.linearRampToValueAtTime(pts[i][2], tt);
      fm[1].frequency.linearRampToValueAtTime(pts[i][3], tt);
    }
    for (let i = 0; i < 2; i++) { src.connect(fm[i]); fm[i].connect(fg[i]); fg[i].connect(amp); }
    outTo(g, amp, dest, o.pan);
    run(g, src, t, end); run(g, lfo, t, end);
    noise(dest, { t: t + 0.01, dur: dur * 0.7, r: 0.05, vol: fin(o.vol, 0.3) * 0.22, ft: 'bandpass', f: 3600, q: 1.2, a: 0.03, s: 0.6, seed: o.seed });
    return end;
  }

  // purr: brown-ish noise with a 25Hz amplitude flutter plus a soft sub body
  function purr(dest, o) {
    const g = G(), t = fin(o.t), dur = Math.max(0.2, fin(o.dur, 1.5)), r = o.r === undefined ? 0.4 : o.r;
    const end = t + dur + r + 0.05;
    const rate = fin(o.rate, 25);
    const src = add(g, C.createBufferSource()); src.buffer = getNoise(); src.loop = true;
    const lp = add(g, C.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = o.bright || 260; lp.Q.value = 0.9;
    const hp = add(g, C.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 45;
    const am = add(g, C.createGain()); am.gain.value = 0.5;
    const lfo = add(g, C.createOscillator()); lfo.type = 'triangle'; lfo.frequency.value = rate;
    const lg = add(g, C.createGain()); lg.gain.value = 0.48; lfo.connect(lg); lg.connect(am.gain);
    const out = add(g, C.createGain());
    env(out.gain, t, fin(o.vol, 0.2), o.a === undefined ? Math.min(0.5, dur * 0.4) : o.a, 0.2, 0.9, dur, r);
    src.connect(lp); lp.connect(hp); hp.connect(am);
    const sub = add(g, C.createOscillator()); sub.type = 'sine'; sub.frequency.value = o.sub || 52;
    const sg = add(g, C.createGain()); sg.gain.value = 0.35; sub.connect(sg); sg.connect(am);
    am.connect(out);
    outTo(g, out, dest, o.pan);
    run(g, src, t, end, hash(fin(o.seed, 0) * 31 + 5) * 1.5); run(g, lfo, t, end); run(g, sub, t, end);
    return end;
  }

  function sparkle(d, t, n, base, vol, k) {
    let end = t;
    for (let i = 0; i < n; i++) {
      const f = base * PENT[Math.floor(hash(i * 17 + Math.floor(fin(k) * 10000)) * PENT.length)];
      end = Math.max(end, tone(d, { t: t + i * 0.05, f, dur: 0.04, r: 0.2, vol, a: 0.002, d: 0.05, s: 0.2 }));
    }
    return end;
  }

  return { tone, noise, fmBell, choir, meow, purr, sparkle, hasPan, G, add, run };
}

// ------------------------------------------------------------------------------------------------ drums (shared by sfx and music)
function kick(S, d, t, vol, deep) {
  S.tone(d, { t, f: deep ? 120 : 150, f2: deep ? 34 : 42, glide: 0.11, dur: 0.18, r: 0.12, vol, a: 0.001, d: 0.16, s: 0.02 });
  S.noise(d, { t, dur: 0.012, r: 0.02, vol: vol * 0.3, ft: 'highpass', f: 2500, seed: 1 });
  return t + 0.4;
}
function snare(S, d, t, vol) {
  S.noise(d, { t, dur: 0.1, r: 0.1, vol: vol * 0.8, ft: 'bandpass', f: 2100, q: 0.7, a: 0.001, d: 0.09, s: 0.1, seed: 2 });
  S.tone(d, { t, f: 210, f2: 150, glide: 0.08, type: 'triangle', dur: 0.08, r: 0.06, vol: vol * 0.5, a: 0.001, d: 0.07, s: 0.1 });
  return t + 0.3;
}
function clap(S, d, t, vol) {
  for (let i = 0; i < 3; i++) S.noise(d, { t: t + i * 0.011, dur: 0.012, r: 0.02, vol: vol * 0.6, ft: 'bandpass', f: 1300, q: 1.1, a: 0.001, d: 0.01, s: 0.2, seed: 5 + i });
  S.noise(d, { t: t + 0.03, dur: 0.1, r: 0.12, vol: vol * 0.5, ft: 'bandpass', f: 1200, q: 0.9, a: 0.002, d: 0.1, s: 0.1, seed: 9 });
  return t + 0.3;
}
function hat(S, d, t, vol, open) {
  S.noise(d, { t, dur: open ? 0.14 : 0.025, r: open ? 0.1 : 0.02, vol, ft: 'highpass', f: 7500, q: 0.5, a: 0.001, d: open ? 0.14 : 0.025, s: 0.1, seed: open ? 3 : 4 });
  return t + 0.3;
}

// ------------------------------------------------------------------------------------------------ SFX catalog
const SFX = Object.create(null);
// def(name, priority 0..4, per-sound voice cap, min gap seconds, reverb send, level, fn(S, dest, t, p) -> end time)
function def(name, pri, cap, gap, wet, vol, fn, vr) { SFX[name] = { pri, cap, gap, wet, vol, fn, vr: vr === undefined ? 0.06 : vr }; }
const mx = (...a) => Math.max(...a);

// ---- UI
def('click', 1, 3, 0.03, 0, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 1500 * p.pitch, f2: 760 * p.pitch, glide: 0.04, type: 'square', dur: 0.03, r: 0.04, vol: 0.07, lp: 5200 }),
  S.tone(d, { t, f: 540 * p.pitch, type: 'triangle', dur: 0.05, r: 0.06, vol: 0.14, a: 0.002 }),
  S.noise(d, { t, dur: 0.012, r: 0.02, vol: 0.08, ft: 'highpass', f: 4000, seed: p.k })));
def('hover', 0, 2, 0.07, 0, 0.7, (S, d, t, p) => S.tone(d, { t, f: 1900 * p.pitch, dur: 0.02, r: 0.05, vol: 0.04, a: 0.002 }), 0.1);
def('toggle', 1, 2, 0.05, 0, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 700 * p.pitch, type: 'triangle', dur: 0.035, r: 0.04, vol: 0.14 }),
  S.tone(d, { t: t + 0.045, f: 1050 * p.pitch, type: 'triangle', dur: 0.035, r: 0.05, vol: 0.12 })));
def('tab', 1, 2, 0.05, 0, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 330 * p.pitch, f2: 400 * p.pitch, type: 'triangle', dur: 0.05, r: 0.06, vol: 0.16 }),
  S.noise(d, { t, dur: 0.02, vol: 0.05, ft: 'bandpass', f: 1800, seed: p.k })));
def('back', 1, 2, 0.06, 0, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 660 * p.pitch, type: 'triangle', dur: 0.06, r: 0.05, vol: 0.15 }),
  S.tone(d, { t: t + 0.07, f: 440 * p.pitch, type: 'triangle', dur: 0.09, r: 0.1, vol: 0.15 })));
def('confirm', 1, 2, 0.08, 0.1, 0.9, (S, d, t, p) => mx(
  S.fmBell(d, { t, f: 659 * p.pitch, ratio: 2, idx: 1, dur: 0.25, vol: 0.2 }),
  S.fmBell(d, { t: t + 0.08, f: 988 * p.pitch, ratio: 2, idx: 1, dur: 0.4, vol: 0.2 })));
def('error', 2, 2, 0.15, 0, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 118 * p.pitch, type: 'square', unison: 2, spread: 40, dur: 0.1, r: 0.04, vol: 0.2, lp: 700 }),
  S.tone(d, { t: t + 0.13, f: 104 * p.pitch, type: 'square', unison: 2, spread: 40, dur: 0.14, r: 0.06, vol: 0.2, lp: 600 })), 0.02);
def('levelup', 3, 1, 0.5, 0.4, 1, (S, d, t, p) => {
  let e = t;
  [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
    e = mx(e, S.tone(d, { t: t + i * 0.075, f: f * p.pitch, type: 'sawtooth', dur: 0.12, r: 0.25, vol: 0.14, lp: 5200, lp2: 900, lpT: 0.2, d: 0.1, s: 0.2 }));
    e = mx(e, S.fmBell(d, { t: t + i * 0.075, f: f * 2 * p.pitch, ratio: 2, idx: 1.2, dur: 0.5, vol: 0.1 }));
  });
  e = mx(e, S.tone(d, { t, f: 130, f2: 65, glide: 0.4, dur: 0.5, r: 0.2, vol: 0.28 }));
  return mx(e, S.sparkle(d, t + 0.3, 6, 2093, 0.07, p.k));
}, 0.01);
def('build', 2, 2, 0.2, 0.2, 0.9, (S, d, t, p) => {
  let e = t;
  for (let i = 0; i < 3; i++) {
    e = mx(e, S.tone(d, { t: t + i * 0.09, f: 220 * p.pitch, f2: 90, glide: 0.06, dur: 0.05, r: 0.05, vol: 0.3 }));
    e = mx(e, S.noise(d, { t: t + i * 0.09, dur: 0.03, vol: 0.2, ft: 'bandpass', f: 2200 + i * 300, seed: i + p.k * 9 }));
  }
  return mx(e, S.fmBell(d, { t: t + 0.3, f: 1175 * p.pitch, ratio: 2, idx: 1.5, dur: 0.5, vol: 0.18 }), S.sparkle(d, t + 0.32, 3, 2000, 0.05, p.k));
});
def('upgrade', 3, 1, 0.3, 0.35, 0.95, (S, d, t, p) => {
  let e = SFX.build.fn(S, d, t, p);
  [659, 880, 1319].forEach((f, i) => { e = mx(e, S.tone(d, { t: t + 0.35 + i * 0.07, f: f * p.pitch, type: 'sawtooth', dur: 0.1, r: 0.3, vol: 0.12, lp: 4800, lp2: 800, lpT: 0.25 })); });
  return e;
});
def('unlock', 3, 1, 0.3, 0.4, 0.95, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.3, f: 800, f2: 6000, vol: 0.18, a: 0.2, ft: 'bandpass', q: 1.5 }),
  S.fmBell(d, { t: t + 0.3, f: 880 * p.pitch, ratio: 2, idx: 1.6, dur: 0.7, vol: 0.22 }),
  S.fmBell(d, { t: t + 0.4, f: 1319 * p.pitch, ratio: 2, idx: 1.6, dur: 0.9, vol: 0.2 }),
  S.sparkle(d, t + 0.4, 5, 2093, 0.06, p.k)));

// ---- pickups
def('coin', 1, 3, 0.04, 0.12, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 988 * p.pitch, type: 'square', dur: 0.06, r: 0.05, vol: 0.11, lp: 4200 }),
  S.tone(d, { t: t + 0.06, f: 1319 * p.pitch, type: 'square', dur: 0.2, r: 0.18, vol: 0.11, lp: 4200, d: 0.15, s: 0.3 }),
  S.fmBell(d, { t: t + 0.06, f: 2637 * p.pitch, ratio: 3.5, idx: 1, dur: 0.3, vol: 0.06 })), 0.04);
def('fish', 1, 3, 0.04, 0.1, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 420 * p.pitch, f2: 980 * p.pitch, glide: 0.07, dur: 0.07, r: 0.05, vol: 0.2, a: 0.003 }),
  S.tone(d, { t: t + 0.08, f: 560 * p.pitch, f2: 1250 * p.pitch, glide: 0.06, dur: 0.06, r: 0.1, vol: 0.14, a: 0.003 }),
  S.sparkle(d, t + 0.12, 2, 1800, 0.04, p.k)), 0.08);
def('yarn', 1, 3, 0.05, 0.12, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 392 * p.pitch, f2: 588 * p.pitch, glide: 0.09, type: 'triangle', dur: 0.14, r: 0.12, vol: 0.2, vib: { rate: 9, depth: 25 } }),
  S.noise(d, { t, dur: 0.12, vol: 0.07, ft: 'bandpass', f: 900, f2: 2400, a: 0.05, seed: p.k }),
  S.tone(d, { t: t + 0.13, f: 784 * p.pitch, type: 'triangle', dur: 0.08, r: 0.15, vol: 0.12 })), 0.07);
def('gem', 2, 3, 0.06, 0.35, 0.9, (S, d, t, p) => mx(
  S.fmBell(d, { t, f: 1568 * p.pitch, ratio: 3.5, idx: 1.4, dur: 0.5, vol: 0.2 }),
  S.fmBell(d, { t: t + 0.07, f: 2349 * p.pitch, ratio: 3.5, idx: 1.4, dur: 0.7, vol: 0.16 }),
  S.sparkle(d, t + 0.08, 4, 2600, 0.04, p.k)));
def('token', 1, 3, 0.05, 0.1, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 660 * p.pitch, type: 'square', dur: 0.04, r: 0.02, vol: 0.09, lp: 4000 }),
  S.tone(d, { t: t + 0.045, f: 990 * p.pitch, type: 'square', dur: 0.04, r: 0.02, vol: 0.09, lp: 4000 }),
  S.tone(d, { t: t + 0.09, f: 1320 * p.pitch, type: 'square', dur: 0.12, r: 0.1, vol: 0.09, lp: 4000 })));
def('relic', 3, 1, 0.3, 0.5, 1, (S, d, t, p) => mx(
  S.choir(d, { t, notes: [262, 392, 523], dur: 0.8, a: 0.2, r: 0.5, vol: 0.18 }),
  S.fmBell(d, { t: t + 0.25, f: 1047 * p.pitch, ratio: 2, idx: 1.5, dur: 1.0, vol: 0.22 }),
  S.sparkle(d, t + 0.3, 6, 2093, 0.06, p.k)));

// ---- cat voices
def('meow', 1, 2, 0.2, 0.18, 0.9, (S, d, t, p) => S.meow(d, { t, f: 540 * p.pitch, dur: 0.42, vol: 0.34, shape: 'mew', seed: p.k }), 0.18);
def('meow_happy', 1, 2, 0.2, 0.25, 0.9, (S, d, t, p) => mx(
  S.meow(d, { t, f: 720 * p.pitch, dur: 0.16, vol: 0.28, shape: 'chirp', seed: p.k }),
  S.meow(d, { t: t + 0.19, f: 800 * p.pitch, dur: 0.3, vol: 0.3, shape: 'mew', seed: p.k + 1 })), 0.1);
def('meow_sad', 1, 2, 0.3, 0.3, 0.9, (S, d, t, p) => S.meow(d, { t, f: 480 * p.pitch, dur: 0.7, vol: 0.32, shape: 'sad', seed: p.k }), 0.1);
def('meow_angry', 2, 2, 0.3, 0.2, 0.9, (S, d, t, p) => mx(
  S.meow(d, { t, f: 330 * p.pitch, dur: 0.55, vol: 0.4, shape: 'angry', seed: p.k }),
  S.tone(d, { t, f: 110, type: 'sawtooth', dur: 0.4, r: 0.1, vol: 0.1, lp: 500 })), 0.08);
def('chirp', 0, 2, 0.1, 0.15, 0.9, (S, d, t, p) => S.meow(d, { t, f: 900 * p.pitch, dur: 0.12, vol: 0.2, shape: 'chirp', seed: p.k }), 0.2);
def('purr', 1, 1, 0.5, 0.15, 0.9, (S, d, t, p) => S.purr(d, { t, dur: 1.8 * (p.n || 1), vol: 0.5, rate: 24 + p.k * 3, seed: p.k }));
def('hiss', 1, 2, 0.3, 0.1, 0.9, (S, d, t, p) => S.noise(d, { t, dur: 0.4, r: 0.15, vol: 0.28, ft: 'highpass', f: 5200, f2: 3500, q: 0.6, a: 0.04, d: 0.15, s: 0.6, seed: p.k }));

// ---- card and battle UI
def('card_hover', 0, 2, 0.08, 0, 0.8, (S, d, t, p) => S.noise(d, { t, dur: 0.03, vol: 0.06, ft: 'highpass', f: 5000, seed: p.k }));
def('card_play', 2, 3, 0.05, 0.15, 0.9, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.12, f: 500, f2: 3500, vol: 0.2, a: 0.04, seed: p.k }),
  S.tone(d, { t: t + 0.08, f: 180, f2: 70, glide: 0.1, dur: 0.1, r: 0.06, vol: 0.38 }),
  S.fmBell(d, { t: t + 0.08, f: 1175 * p.pitch, ratio: 2, idx: 1, dur: 0.25, vol: 0.1 })));
def('card_deny', 2, 2, 0.12, 0, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 200, f2: 130, glide: 0.1, type: 'square', dur: 0.12, r: 0.05, vol: 0.14, lp: 800 }),
  S.noise(d, { t, dur: 0.06, vol: 0.06, ft: 'bandpass', f: 400, seed: p.k })));
def('card_draw', 0, 3, 0.04, 0, 0.8, (S, d, t, p) => {
  let e = t; const n = clamp(Math.round(p.n || 1), 1, 3);
  for (let i = 0; i < n; i++) {
    e = mx(e, S.noise(d, { t: t + i * 0.055, dur: 0.035, vol: 0.12, ft: 'highpass', f: 4000, seed: p.k * 5 + i }));
    e = mx(e, S.tone(d, { t: t + i * 0.055, f: 1300 * p.pitch, f2: 800, glide: 0.03, type: 'triangle', dur: 0.03, vol: 0.06 }));
  }
  return e;
});
def('energy', 0, 2, 0.1, 0.15, 0.85, (S, d, t, p) => mx(
  S.tone(d, { t, f: 720 * p.pitch, f2: 1440 * p.pitch, glide: 0.09, dur: 0.1, r: 0.08, vol: 0.14 }),
  S.fmBell(d, { t: t + 0.04, f: 1568 * p.pitch, ratio: 2, idx: 1, dur: 0.2, vol: 0.08 })), 0.04);

// ---- hits (one per element family)
def('hit_phys', 0, 5, 0.035, 0, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 190 * p.pitch, f2: 55, glide: 0.09, dur: 0.07, r: 0.08, vol: 0.5, a: 0.001, d: 0.06, s: 0.1 }),
  S.noise(d, { t, dur: 0.04, r: 0.05, vol: 0.32, ft: 'bandpass', f: 1800 * p.pitch, f2: 600, q: 0.9, a: 0.001, d: 0.03, s: 0.1, seed: p.k })));
def('hit_light', 0, 4, 0.04, 0, 0.8, (S, d, t, p) => mx(
  S.tone(d, { t, f: 440 * p.pitch, f2: 210, glide: 0.05, type: 'triangle', dur: 0.04, r: 0.05, vol: 0.3, a: 0.001 }),
  S.noise(d, { t, dur: 0.02, vol: 0.18, ft: 'highpass', f: 3200, seed: p.k })));
def('hit_heavy', 1, 3, 0.05, 0.08, 0.95, (S, d, t, p) => mx(
  S.tone(d, { t, f: 130 * p.pitch, f2: 36, glide: 0.14, dur: 0.16, r: 0.12, vol: 0.8, a: 0.001, d: 0.14, s: 0.05 }),
  S.noise(d, { t, dur: 0.12, r: 0.08, vol: 0.45, ft: 'lowpass', f: 1400, f2: 180, a: 0.001, d: 0.1, s: 0.1, seed: p.k }),
  S.tone(d, { t, f: 95, type: 'sawtooth', dur: 0.1, r: 0.06, vol: 0.2, lp: 700, a: 0.001 })));
def('hit_fire', 0, 4, 0.05, 0.1, 0.9, (S, d, t, p) => {
  let e = mx(
    S.noise(d, { t, dur: 0.2, r: 0.1, vol: 0.38, ft: 'lowpass', f: 3200, f2: 380, a: 0.005, d: 0.18, s: 0.2, seed: p.k }),
    S.tone(d, { t, f: 220 * p.pitch, f2: 80, glide: 0.15, type: 'sawtooth', dur: 0.14, r: 0.06, vol: 0.18, lp: 1200 }));
  for (let i = 0; i < 3; i++) e = mx(e, S.noise(d, { t: t + 0.04 + i * 0.045 + p.k * 0.02, dur: 0.012, vol: 0.14, ft: 'highpass', f: 5000, seed: p.k * 7 + i }));
  return e;
});
def('hit_elec', 0, 4, 0.05, 0.12, 0.9, (S, d, t, p) => {
  let e = t;
  for (let i = 0; i < 4; i++) e = mx(e, S.tone(d, { t: t + i * 0.022, f: (700 + hash(i * 13 + p.k * 1000) * 2200) * p.pitch, type: 'square', dur: 0.02, r: 0.01, vol: 0.12, lp: 6000, a: 0.001 }));
  return mx(e, S.noise(d, { t, dur: 0.09, vol: 0.22, ft: 'highpass', f: 4800, seed: p.k }));
});
def('hit_poison', 0, 3, 0.06, 0.1, 0.85, (S, d, t, p) => {
  let e = t;
  for (let i = 0; i < 3; i++) e = mx(e, S.tone(d, { t: t + i * 0.045, f: (280 + i * 60) * p.pitch, f2: (650 + i * 90) * p.pitch, glide: 0.04, dur: 0.045, r: 0.03, vol: 0.18, a: 0.003 }));
  return mx(e, S.noise(d, { t, dur: 0.14, vol: 0.12, ft: 'bandpass', f: 500, f2: 1300, q: 3, seed: p.k }));
});
def('hit_holy', 0, 3, 0.06, 0.35, 0.9, (S, d, t, p) => mx(
  S.fmBell(d, { t, f: 1047 * p.pitch, ratio: 2, idx: 2, dur: 0.4, vol: 0.2 }),
  S.tone(d, { t, f: 523 * p.pitch, dur: 0.15, r: 0.25, vol: 0.12 }),
  S.tone(d, { t, f: 160, f2: 70, glide: 0.08, dur: 0.06, vol: 0.25 })));
def('hit_shadow', 0, 3, 0.06, 0.25, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 320 * p.pitch, f2: 60, glide: 0.25, type: 'sawtooth', dur: 0.22, r: 0.1, vol: 0.28, lp: 900, lp2: 140, a: 0.005 }),
  S.noise(d, { t, dur: 0.18, vol: 0.18, ft: 'lowpass', f: 900, f2: 120, seed: p.k })));
def('hit_void', 0, 3, 0.06, 0.4, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 72 * p.pitch, type: 'square', unison: 2, spread: 30, dur: 0.3, r: 0.15, vol: 0.28, lp: 320, a: 0.01 }),
  S.noise(d, { t, dur: 0.25, vol: 0.2, ft: 'bandpass', f: 180, f2: 2200, q: 2, a: 0.15, seed: p.k }),
  S.tone(d, { t: t + 0.22, f: 150, f2: 30, glide: 0.2, dur: 0.2, vol: 0.4 })));
def('hit_bleed', 0, 3, 0.05, 0, 0.9, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.12, r: 0.06, vol: 0.4, ft: 'bandpass', f: 1000, f2: 250, q: 4, a: 0.003, seed: p.k }),
  S.tone(d, { t, f: 150 * p.pitch, f2: 70, glide: 0.08, dur: 0.07, vol: 0.3 })));
def('hit_dot', 0, 3, 0.1, 0, 0.7, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.02, vol: 0.1, ft: 'highpass', f: 4000, seed: p.k }),
  S.tone(d, { t, f: 600 * p.pitch, f2: 380, glide: 0.03, dur: 0.03, vol: 0.07 })), 0.12);
def('shield_hit', 1, 3, 0.05, 0.2, 0.9, (S, d, t, p) => mx(
  S.fmBell(d, { t, f: 880 * p.pitch, ratio: 1.5, idx: 2, dur: 0.22, vol: 0.28 }),
  S.noise(d, { t, dur: 0.03, vol: 0.14, ft: 'bandpass', f: 3000, seed: p.k })));
def('crit', 2, 3, 0.05, 0.25, 1, (S, d, t, p) => mx(
  S.tone(d, { t, f: 1568, f2: 2093, glide: 0.05, type: 'square', dur: 0.06, r: 0.05, vol: 0.13, lp: 6000 }),
  S.fmBell(d, { t, f: 2093 * p.pitch, ratio: 3.5, idx: 3, dur: 0.32, vol: 0.28 }),
  S.noise(d, { t, dur: 0.08, vol: 0.25, ft: 'highpass', f: 6000, seed: p.k }),
  S.tone(d, { t, f: 140, f2: 45, glide: 0.1, dur: 0.1, vol: 0.5 })));

// ---- deaths and spawns
def('death_enemy', 1, 4, 0.04, 0.15, 0.95, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.22, r: 0.1, vol: 0.4, ft: 'bandpass', f: 1500, f2: 200, q: 0.8, a: 0.002, d: 0.2, s: 0.1, seed: p.k }),
  S.tone(d, { t, f: 520 * p.pitch, f2: 60, glide: 0.22, dur: 0.22, r: 0.08, vol: 0.4, a: 0.002, d: 0.2, s: 0.1 }),
  S.tone(d, { t, f: 230 * p.pitch, f2: 55, glide: 0.2, type: 'square', dur: 0.18, r: 0.05, vol: 0.12, lp: 1200 }),
  S.sparkle(d, t + 0.08, 2, 1800, 0.05, p.k)));
def('death_boss', 4, 1, 0.5, 0.55, 1, (S, d, t, p) => {
  let e = mx(
    S.tone(d, { t, f: 76, f2: 26, glide: 0.8, dur: 0.9, r: 0.4, vol: 0.9, a: 0.003, d: 0.8, s: 0.05 }),
    S.noise(d, { t, dur: 1.0, r: 0.4, vol: 0.65, ft: 'lowpass', f: 2200, f2: 70, a: 0.003, d: 0.9, s: 0.1, seed: p.k }),
    S.tone(d, { t, f: 230, f2: 40, glide: 0.9, type: 'sawtooth', dur: 0.9, r: 0.3, vol: 0.34, lp: 900, lp2: 90, a: 0.004 }),
    S.fmBell(d, { t, f: 110, ratio: 3.5, idx: 2, dur: 1.6, vol: 0.3 }));
  for (let i = 1; i <= 3; i++) e = mx(e, S.tone(d, { t: t + i * 0.17, f: 90 / i, f2: 30, glide: 0.2, dur: 0.2, r: 0.2, vol: 0.5 / i }));
  return e;
}, 0.02);
def('death_cat', 2, 2, 0.15, 0.3, 0.95, (S, d, t, p) => mx(
  S.meow(d, { t, f: 560 * p.pitch, dur: 0.5, vol: 0.3, shape: 'sad', seed: p.k }),
  S.noise(d, { t: t + 0.4, dur: 0.15, vol: 0.16, ft: 'bandpass', f: 800, f2: 200, seed: p.k })));
def('death_minion', 0, 3, 0.06, 0, 0.8, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.1, r: 0.06, vol: 0.22, ft: 'lowpass', f: 1500, f2: 300, seed: p.k }),
  S.tone(d, { t, f: 420 * p.pitch, f2: 120, glide: 0.1, type: 'triangle', dur: 0.08, vol: 0.18 })));
def('death_wood', 1, 3, 0.06, 0.05, 0.9, (S, d, t, p) => {
  let e = mx(S.noise(d, { t, dur: 0.12, vol: 0.4, ft: 'bandpass', f: 700, q: 2, seed: p.k }), S.tone(d, { t, f: 150, f2: 65, glide: 0.1, dur: 0.1, vol: 0.4 }));
  for (let i = 0; i < 3; i++) e = mx(e, S.noise(d, { t: t + 0.05 + i * 0.04, dur: 0.015, vol: 0.2, ft: 'bandpass', f: 1500 + i * 400, q: 3, seed: p.k * 3 + i }));
  return e;
});
def('spawn_cat', 1, 3, 0.08, 0.35, 0.9, (S, d, t, p) => {
  let e = mx(
    S.noise(d, { t, dur: 0.3, r: 0.1, vol: 0.2, ft: 'bandpass', f: 300, f2: 2600, q: 1.2, a: 0.12, d: 0.2, s: 0.3, seed: p.k }),
    S.fmBell(d, { t: t + 0.18, f: 880 * p.pitch, ratio: 2, idx: 1.4, dur: 0.35, vol: 0.18 }),
    S.fmBell(d, { t: t + 0.25, f: 1319 * p.pitch, ratio: 2, idx: 1.4, dur: 0.5, vol: 0.16 }));
  if (p.k > 0.55) e = mx(e, S.meow(d, { t: t + 0.12, f: (800 + p.k * 300) * p.pitch, dur: 0.14, vol: 0.14, shape: 'chirp', seed: p.k }));
  return e;
});
def('spawn_enemy', 0, 3, 0.1, 0.1, 0.85, (S, d, t, p) => mx(
  S.tone(d, { t, f: 170 * p.pitch, f2: 70, glide: 0.18, type: 'square', dur: 0.18, r: 0.06, vol: 0.18, lp: 650 }),
  S.noise(d, { t, dur: 0.16, vol: 0.12, ft: 'bandpass', f: 220, f2: 900, q: 2, seed: p.k }),
  S.tone(d, { t: t + 0.05, f: 900 * p.pitch, f2: 300, glide: 0.04, type: 'square', dur: 0.04, vol: 0.05, lp: 3000 })));
def('spawn_minion', 0, 3, 0.07, 0.05, 0.8, (S, d, t, p) => S.tone(d, { t, f: 400 * p.pitch, f2: 820 * p.pitch, glide: 0.05, dur: 0.05, r: 0.06, vol: 0.18, a: 0.002 }));

// ---- casts, buffs, heals
def('cast', 1, 3, 0.07, 0.35, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 440 * p.pitch, f2: 880 * p.pitch, glide: 0.25, dur: 0.28, r: 0.12, vol: 0.14, a: 0.05 }),
  S.fmBell(d, { t: t + 0.12, f: 1319 * p.pitch, ratio: 2, idx: 1.4, dur: 0.4, vol: 0.14 }),
  S.noise(d, { t, dur: 0.22, vol: 0.07, ft: 'highpass', f: 5000, a: 0.1, seed: p.k })));
def('cast_card', 1, 3, 0.07, 0.3, 0.9, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.22, f: 600, f2: 3000, vol: 0.18, a: 0.08, seed: p.k }),
  S.tone(d, { t, f: 330 * p.pitch, f2: 660 * p.pitch, glide: 0.18, type: 'triangle', dur: 0.2, r: 0.1, vol: 0.18 }),
  S.fmBell(d, { t: t + 0.15, f: 988 * p.pitch, ratio: 2, idx: 1.2, dur: 0.3, vol: 0.12 })));
def('heal', 1, 3, 0.09, 0.4, 0.9, (S, d, t, p) => {
  let e = t;
  [1319, 1661, 1976].forEach((f, i) => { e = mx(e, S.fmBell(d, { t: t + i * 0.06, f: f * p.pitch, ratio: 2, idx: 0.9, dur: 0.4, vol: 0.14 })); });
  return mx(e, S.tone(d, { t, f: 659 * p.pitch, dur: 0.25, r: 0.2, vol: 0.08, a: 0.06 }), S.sparkle(d, t + 0.1, 3, 2600, 0.03, p.k));
});
def('status_buff', 0, 3, 0.1, 0.15, 0.85, (S, d, t, p) => mx(
  S.tone(d, { t, f: 660 * p.pitch, type: 'triangle', dur: 0.06, r: 0.05, vol: 0.14 }),
  S.tone(d, { t: t + 0.07, f: 880 * p.pitch, type: 'triangle', dur: 0.1, r: 0.12, vol: 0.14 })));
def('status_debuff', 0, 3, 0.1, 0.1, 0.85, (S, d, t, p) => mx(
  S.tone(d, { t, f: 330 * p.pitch, f2: 220, glide: 0.15, type: 'sawtooth', unison: 2, spread: 30, dur: 0.15, r: 0.08, vol: 0.14, lp: 1500 }),
  S.tone(d, { t: t + 0.06, f: 247 * p.pitch, f2: 165, glide: 0.15, type: 'sawtooth', unison: 2, spread: 30, dur: 0.15, r: 0.1, vol: 0.12, lp: 1200 })));
def('status_stun', 1, 3, 0.1, 0.15, 0.9, (S, d, t, p) => {
  let e = S.tone(d, { t, f: 240, f2: 100, glide: 0.08, dur: 0.09, r: 0.05, vol: 0.4 });
  [1200, 1500, 1800].forEach((f, i) => { e = mx(e, S.fmBell(d, { t: t + 0.06 + i * 0.05, f: f * p.pitch, ratio: 2, idx: 1, dur: 0.2, vol: 0.09 })); });
  return e;
});
def('status_dot', 0, 2, 0.15, 0, 0.7, (S, d, t, p) => S.noise(d, { t, dur: 0.18, vol: 0.1, ft: 'highpass', f: 5000, a: 0.03, seed: p.k }));
def('shield', 1, 3, 0.08, 0.4, 0.9, (S, d, t, p) => mx(
  S.fmBell(d, { t, f: 1319 * p.pitch, ratio: 1.4, idx: 1.5, dur: 0.55, vol: 0.2 }),
  S.tone(d, { t, f: 880 * p.pitch, dur: 0.25, r: 0.25, vol: 0.1, a: 0.12 }),
  S.noise(d, { t, dur: 0.12, vol: 0.08, ft: 'highpass', f: 7000, a: 0.04, seed: p.k })));
def('cleanse', 1, 2, 0.12, 0.4, 0.9, (S, d, t, p) => {
  let e = t;
  [2093, 1760, 1568, 1319].forEach((f, i) => { e = mx(e, S.fmBell(d, { t: t + i * 0.04, f: f * p.pitch, ratio: 2, idx: 0.8, dur: 0.3, vol: 0.1 })); });
  return mx(e, S.noise(d, { t, dur: 0.15, vol: 0.06, ft: 'highpass', f: 8000, seed: p.k }));
});
def('aura', 0, 2, 0.35, 0.5, 0.8, (S, d, t, p) => {
  let e = t;
  [220, 330, 440].forEach((f, i) => { e = mx(e, S.tone(d, { t, f: f * p.pitch, type: 'triangle', dur: 0.5, r: 0.3, vol: 0.07, a: 0.25, lp: 1500, detune: (i - 1) * 5 })); });
  return e;
});
def('taunt', 2, 2, 0.3, 0.15, 0.9, (S, d, t, p) => mx(
  S.meow(d, { t, f: 420 * p.pitch, dur: 0.4, vol: 0.34, shape: 'mrow', seed: p.k }),
  S.tone(d, { t: t + 0.05, f: 220, type: 'sawtooth', dur: 0.1, r: 0.05, vol: 0.12, lp: 900 })));
def('reflect', 1, 3, 0.07, 0.3, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 2200 * p.pitch, f2: 1400, glide: 0.06, dur: 0.07, r: 0.03, vol: 0.14 }),
  S.fmBell(d, { t, f: 1760 * p.pitch, ratio: 2.76, idx: 4, dur: 0.3, vol: 0.18 }),
  S.noise(d, { t, dur: 0.02, vol: 0.12, ft: 'highpass', f: 6000, seed: p.k })));

// ---- attacks, areas, control
def('attack_melee', 0, 3, 0.06, 0, 0.7, (S, d, t, p) => S.noise(d, { t, dur: 0.07, r: 0.04, vol: 0.12, ft: 'bandpass', f: 600, f2: 2600, q: 1, a: 0.015, seed: p.k }), 0.1);
def('attack_ranged', 0, 3, 0.06, 0.05, 0.7, (S, d, t, p) => mx(
  S.tone(d, { t, f: 700 * p.pitch, f2: 300, glide: 0.08, type: 'sawtooth', dur: 0.08, r: 0.05, vol: 0.1, lp: 3200, lp2: 500, lpT: 0.08 }),
  S.noise(d, { t, dur: 0.03, vol: 0.08, ft: 'highpass', f: 6000, seed: p.k })), 0.12);
def('chain', 2, 2, 0.08, 0.25, 0.95, (S, d, t, p) => {
  let e = t; const n = clamp(Math.round(p.n || 3), 2, 6);
  for (let i = 0; i < n; i++) {
    e = mx(e, S.tone(d, { t: t + i * 0.05, f: (600 + hash(i * 31 + p.k * 1000) * 2200) * p.pitch, type: 'square', dur: 0.04, r: 0.02, vol: 0.14, lp: 6000, a: 0.001 }));
    e = mx(e, S.noise(d, { t: t + i * 0.05, dur: 0.04, vol: 0.12, ft: 'highpass', f: 5000, seed: p.k * 3 + i }));
  }
  return mx(e, S.tone(d, { t, f: 55, type: 'sawtooth', dur: 0.05 * n, r: 0.05, vol: 0.12, lp: 400 }));
});
def('pierce', 1, 3, 0.06, 0.1, 0.9, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.12, r: 0.04, vol: 0.3, ft: 'highpass', f: 2000, f2: 9000, q: 0.7, a: 0.01, seed: p.k }),
  S.tone(d, { t, f: 1400 * p.pitch, f2: 2800 * p.pitch, glide: 0.1, dur: 0.1, vol: 0.14 }),
  S.tone(d, { t, f: 150, f2: 80, glide: 0.06, dur: 0.05, vol: 0.2 })));
def('aoe', 2, 2, 0.1, 0.35, 1, (S, d, t, p) => {
  const s = clamp(fin(p.amt, 1), 0.5, 1.6);
  let e = mx(
    S.tone(d, { t, f: 100, f2: 30, glide: 0.4, dur: 0.5, r: 0.2, vol: 0.7 * s, a: 0.002, d: 0.45, s: 0.05 }),
    S.noise(d, { t, dur: 0.45, r: 0.15, vol: 0.5 * s, ft: 'lowpass', f: 1800, f2: 120, a: 0.002, d: 0.4, s: 0.1, seed: p.k }));
  const el = p.element;
  if (el === 'fire') for (let i = 0; i < 5; i++) e = mx(e, S.noise(d, { t: t + 0.1 + i * 0.05, dur: 0.012, vol: 0.12, ft: 'highpass', f: 5000, seed: p.k * 9 + i }));
  else if (el === 'elec') e = mx(e, SFX.hit_elec.fn(S, d, t, p));
  else if (el === 'holy') e = mx(e, S.fmBell(d, { t: t + 0.05, f: 1047, ratio: 2, idx: 2, dur: 0.7, vol: 0.2 }));
  else if (el === 'poison') e = mx(e, SFX.hit_poison.fn(S, d, t + 0.05, p));
  else if (el === 'shadow' || el === 'void') e = mx(e, S.tone(d, { t, f: 300, f2: 50, glide: 0.4, type: 'sawtooth', dur: 0.4, vol: 0.2, lp: 700 }));
  return e;
});
def('knockback', 1, 3, 0.07, 0.05, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 170 * p.pitch, f2: 70, glide: 0.1, dur: 0.12, r: 0.06, vol: 0.5 }),
  S.noise(d, { t, dur: 0.15, vol: 0.25, ft: 'bandpass', f: 500, f2: 1600, q: 1, a: 0.02, seed: p.k })));
def('pull', 1, 2, 0.1, 0.15, 0.9, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.25, vol: 0.3, ft: 'bandpass', f: 300, f2: 2800, q: 2, a: 0.15, seed: p.k }),
  S.tone(d, { t, f: 200 * p.pitch, f2: 700 * p.pitch, glide: 0.25, dur: 0.25, vol: 0.14, a: 0.1 }),
  S.tone(d, { t: t + 0.25, f: 110, f2: 55, glide: 0.08, dur: 0.1, vol: 0.4 })));
def('execute', 3, 2, 0.15, 0.4, 1, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.12, vol: 0.5, ft: 'highpass', f: 3000, f2: 9000, a: 0.005, seed: p.k }),
  S.tone(d, { t, f: 620, f2: 80, glide: 0.2, type: 'sawtooth', dur: 0.2, vol: 0.28, lp: 3000, lp2: 300 }),
  S.fmBell(d, { t: t + 0.04, f: 220, ratio: 3.5, idx: 2, dur: 0.6, vol: 0.28 }),
  S.tone(d, { t: t + 0.05, f: 125, f2: 38, glide: 0.2, dur: 0.25, vol: 0.7 })));
def('trap_set', 1, 2, 0.12, 0.05, 0.85, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.02, vol: 0.25, ft: 'bandpass', f: 2500, q: 3, seed: p.k }),
  S.noise(d, { t: t + 0.07, dur: 0.02, vol: 0.2, ft: 'bandpass', f: 3200, q: 3, seed: p.k + 1 }),
  S.tone(d, { t: t + 0.09, f: 300, f2: 520, glide: 0.07, type: 'triangle', dur: 0.08, r: 0.1, vol: 0.14, vib: { rate: 30, depth: 40 } })));
def('trap_trigger', 3, 3, 0.05, 0.3, 1, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.04, vol: 0.7, ft: 'bandpass', f: 2200, q: 1.5, a: 0.001, seed: p.k }),
  S.noise(d, { t, dur: 0.15, vol: 0.3, ft: 'lowpass', f: 5000, f2: 300, a: 0.001, seed: p.k + 1 }),
  S.tone(d, { t, f: 1500, f2: 200, glide: 0.08, type: 'square', dur: 0.08, vol: 0.14, lp: 4000 }),
  S.fmBell(d, { t, f: 330, ratio: 4.1, idx: 2.5, dur: 0.45, vol: 0.28 }),
  S.tone(d, { t, f: 100, f2: 40, glide: 0.1, dur: 0.12, vol: 0.55 })));
def('barricade', 1, 2, 0.12, 0.05, 0.9, (S, d, t, p) => {
  let e = mx(S.tone(d, { t, f: 130, f2: 62, glide: 0.12, dur: 0.15, vol: 0.5 }), S.noise(d, { t, dur: 0.1, vol: 0.3, ft: 'bandpass', f: 420, q: 2, seed: p.k }));
  for (let i = 0; i < 2; i++) e = mx(e, S.noise(d, { t: t + 0.09 + i * 0.07, dur: 0.02, vol: 0.2, ft: 'bandpass', f: 900, q: 4, seed: p.k * 5 + i }));
  return e;
});
def('burrow', 1, 2, 0.15, 0.05, 0.9, (S, d, t, p) => {
  let e = mx(S.noise(d, { t, dur: 0.32, vol: 0.45, ft: 'lowpass', f: 700, f2: 140, q: 1.2, seed: p.k }), S.tone(d, { t, f: 100, f2: 48, glide: 0.3, dur: 0.3, vol: 0.4 }));
  for (let i = 0; i < 3; i++) e = mx(e, S.noise(d, { t: t + 0.08 + i * 0.08, dur: 0.03, vol: 0.14, ft: 'bandpass', f: 300 + i * 80, q: 2, seed: p.k * 7 + i }));
  return e;
});
def('emerge', 1, 2, 0.15, 0.1, 0.95, (S, d, t, p) => {
  let e = mx(S.noise(d, { t, dur: 0.22, vol: 0.5, ft: 'lowpass', f: 200, f2: 1600, a: 0.04, seed: p.k }), S.tone(d, { t: t + 0.08, f: 125, f2: 42, glide: 0.18, dur: 0.22, vol: 0.7 }));
  for (let i = 0; i < 3; i++) e = mx(e, S.noise(d, { t: t + 0.12 + i * 0.05, dur: 0.02, vol: 0.14, ft: 'bandpass', f: 800 + i * 300, q: 3, seed: p.k * 3 + i }));
  return e;
});
def('summon_call', 1, 2, 0.4, 0.4, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 330 * p.pitch, f2: 220, glide: 0.4, type: 'sawtooth', unison: 2, spread: 25, dur: 0.4, r: 0.15, vol: 0.2, lp: 1000, a: 0.04, vib: { rate: 6, depth: 30 } }),
  S.noise(d, { t, dur: 0.35, vol: 0.12, ft: 'bandpass', f: 1200, q: 3, seed: p.k }),
  S.meow(d, { t: t + 0.05, f: 300, dur: 0.45, vol: 0.18, shape: 'angry', seed: p.k })));
def('merge', 3, 1, 0.25, 0.4, 1, (S, d, t, p) => {
  const n = clamp(Math.round(p.n || 2), 1, 3) + 3;
  const notes = [523, 659, 784, 1047, 1319, 1568];
  let e = t;
  for (let i = 0; i < n; i++) e = mx(e, S.tone(d, { t: t + i * 0.055, f: notes[i] * p.pitch, type: 'sawtooth', dur: 0.1, r: 0.2, vol: 0.16, lp: 5200, lp2: 800, lpT: 0.18, d: 0.08, s: 0.2 }));
  const te = t + n * 0.055;
  [523, 659, 784].forEach((f) => { e = mx(e, S.tone(d, { t: te, f: f * 2 * p.pitch, type: 'sawtooth', unison: 2, spread: 14, dur: 0.25, r: 0.4, vol: 0.09, lp: 4000, lp2: 1000, lpT: 0.5 })); });
  e = mx(e, S.noise(d, { t, dur: n * 0.055, f: 2000, f2: 9000, ft: 'highpass', vol: 0.1, a: 0.2, seed: p.k }));
  e = mx(e, S.tone(d, { t: te, f: 120, f2: 50, glide: 0.2, dur: 0.25, vol: 0.45 }));
  return mx(e, S.sparkle(d, te, 5, 2093, 0.05, p.k));
}, 0.01);
def('revive', 3, 1, 0.5, 0.45, 1, (S, d, t, p) => {
  let e = mx(S.tone(d, { t, f: 70, f2: 50, glide: 0.1, dur: 0.1, vol: 0.6 }), S.tone(d, { t: t + 0.18, f: 66, f2: 46, glide: 0.1, dur: 0.1, vol: 0.5 }));
  [523, 659, 784, 1047].forEach((f, i) => { e = mx(e, S.fmBell(d, { t: t + 0.35 + i * 0.08, f: f * p.pitch, ratio: 2, idx: 1.1, dur: 0.6, vol: 0.18 })); });
  e = mx(e, S.choir(d, { t: t + 0.3, notes: [262, 330, 392], dur: 0.6, a: 0.2, r: 0.5, vol: 0.14 }));
  return mx(e, S.meow(d, { t: t + 0.55, f: 760, dur: 0.3, vol: 0.2, shape: 'mew', seed: p.k }));
});

// ---- waves, rules, rewards
def('wave', 3, 1, 0.8, 0.4, 1, (S, d, t, p) => {
  let e = t;
  [147, 220].forEach((f) => { e = mx(e, S.tone(d, { t, f, type: 'sawtooth', unison: 3, spread: 16, dur: 0.35, r: 0.3, vol: 0.18, lp: 400, lp2: 2400, lpT: 0.25, a: 0.03 })); });
  [196, 294].forEach((f) => { e = mx(e, S.tone(d, { t: t + 0.3, f, type: 'sawtooth', unison: 3, spread: 16, dur: 0.5, r: 0.4, vol: 0.17, lp: 500, lp2: 2600, lpT: 0.3, a: 0.03 })); });
  return mx(e, S.tone(d, { t, f: 73, dur: 0.8, r: 0.3, vol: 0.4 }), S.noise(d, { t, dur: 0.3, f: 300, f2: 4000, vol: 0.1, a: 0.2, seed: p.k }));
});
def('wave_boss', 4, 1, 1.5, 0.55, 1, (S, d, t, p) => {
  let e = mx(
    S.tone(d, { t, f: 41, dur: 1.5, r: 0.5, vol: 0.7, a: 0.3 }),
    S.tone(d, { t, f: 110, type: 'sawtooth', unison: 2, spread: 20, dur: 1.6, r: 0.4, vol: 0.2, lp: 300, lp2: 1000, lpT: 1.4, a: 0.4 }),
    S.tone(d, { t, f: 155.6, type: 'sawtooth', unison: 2, spread: 20, dur: 1.6, r: 0.4, vol: 0.18, lp: 300, lp2: 1000, lpT: 1.4, a: 0.4 }),
    S.noise(d, { t, dur: 1.4, vol: 0.34, f: 200, f2: 3500, q: 1.5, a: 1.1, ft: 'bandpass', seed: p.k }));
  e = mx(e, S.tone(d, { t: t + 1.4, f: 90, f2: 28, glide: 0.6, dur: 0.7, r: 0.4, vol: 0.9 }), S.fmBell(d, { t: t + 1.4, f: 82, ratio: 3.5, idx: 2, dur: 1.5, vol: 0.3 }));
  return e;
});
def('boss_phase', 4, 1, 1, 0.45, 1, (S, d, t, p) => mx(
  S.tone(d, { t, f: 95, f2: 55, glide: 0.8, type: 'sawtooth', unison: 3, spread: 40, dur: 0.8, r: 0.3, vol: 0.34, lp: 500, lp2: 200, vib: { rate: 14, depth: 50 } }),
  S.noise(d, { t, dur: 0.7, vol: 0.3, ft: 'bandpass', f: 700, f2: 300, q: 2, seed: p.k }),
  S.tone(d, { t, f: 880, type: 'square', dur: 0.1, r: 0.03, vol: 0.12, lp: 3000 }),
  S.tone(d, { t: t + 0.13, f: 660, type: 'square', dur: 0.1, r: 0.03, vol: 0.12, lp: 3000 }),
  S.tone(d, { t: t + 0.4, f: 880, type: 'square', dur: 0.1, r: 0.03, vol: 0.12, lp: 3000 }),
  S.tone(d, { t: t + 0.53, f: 660, type: 'square', dur: 0.1, r: 0.03, vol: 0.12, lp: 3000 }),
  S.tone(d, { t, f: 60, f2: 30, glide: 0.5, dur: 0.6, vol: 0.6 })));
def('base_hit', 4, 2, 0.22, 0.25, 1, (S, d, t, p) => {
  const s = clamp(fin(p.amt, 1), 0.6, 1.5);
  let e = mx(
    S.tone(d, { t, f: 92, f2: 34, glide: 0.4, dur: 0.5, r: 0.2, vol: 0.9 * s, a: 0.002, d: 0.4, s: 0.05 }),
    S.noise(d, { t, dur: 0.4, r: 0.1, vol: 0.55 * s, ft: 'lowpass', f: 1600, f2: 100, a: 0.002, d: 0.35, s: 0.1, seed: p.k }));
  for (let i = 0; i < 4; i++) e = mx(e, S.tone(d, { t: t + 0.04 + i * 0.1, f: i % 2 ? 660 : 880, type: 'square', dur: 0.085, r: 0.02, vol: 0.18, lp: 3200, a: 0.003 }));
  return e;
}, 0.01);
def('rule', 1, 2, 0.2, 0.2, 0.85, (S, d, t, p) => mx(
  S.tone(d, { t, f: 1000, f2: 1500, glide: 0.03, type: 'square', dur: 0.04, r: 0.02, vol: 0.09, lp: 4000 }),
  S.tone(d, { t: t + 0.07, f: 1500, f2: 800, glide: 0.04, type: 'square', dur: 0.05, r: 0.03, vol: 0.09, lp: 4000 }),
  S.noise(d, { t: t + 0.04, dur: 0.04, vol: 0.07, ft: 'highpass', f: 6000, seed: p.k })));
def('reward', 1, 2, 0.12, 0.3, 0.9, (S, d, t, p) => mx(SFX.coin.fn(S, d, t, p), S.sparkle(d, t + 0.1, 3, 2400, 0.04, p.k)));
def('loot_card', 2, 2, 0.1, 0.3, 0.95, (S, d, t, p) => mx(
  S.noise(d, { t, dur: 0.1, vol: 0.14, ft: 'highpass', f: 4000, seed: p.k }),
  S.fmBell(d, { t: t + 0.04, f: 988 * p.pitch, ratio: 2, idx: 1.2, dur: 0.4, vol: 0.2 }),
  S.fmBell(d, { t: t + 0.11, f: 1480 * p.pitch, ratio: 2, idx: 1.2, dur: 0.5, vol: 0.18 })));
def('loot_cat', 3, 1, 0.3, 0.45, 1, (S, d, t, p) => mx(
  S.meow(d, { t, f: 740 * p.pitch, dur: 0.4, vol: 0.3, shape: 'mew', seed: p.k }),
  S.fmBell(d, { t: t + 0.3, f: 1319 * p.pitch, ratio: 2, idx: 1.4, dur: 0.7, vol: 0.2 }),
  S.sparkle(d, t + 0.3, 5, 2200, 0.05, p.k)));
def('win', 4, 1, 1, 0.4, 1, (S, d, t, p) => mx(
  S.tone(d, { t, f: 90, f2: 45, glide: 0.4, dur: 0.5, r: 0.3, vol: 0.6 }),
  S.noise(d, { t, dur: 0.5, f: 500, f2: 7000, ft: 'highpass', vol: 0.12, a: 0.35, seed: p.k }),
  S.fmBell(d, { t: t + 0.35, f: 1047, ratio: 2, idx: 1.5, dur: 1.2, vol: 0.2 })));
def('lose', 4, 1, 1, 0.5, 1, (S, d, t, p) => mx(
  S.tone(d, { t, f: 110, f2: 40, glide: 0.8, dur: 0.9, r: 0.4, vol: 0.7, a: 0.01 }),
  S.noise(d, { t, dur: 0.7, f: 1200, f2: 90, ft: 'lowpass', vol: 0.3, seed: p.k }),
  S.fmBell(d, { t: t + 0.1, f: 196, ratio: 3.5, idx: 2, dur: 1.4, vol: 0.2 })));

// ---- crates (see also crateBeat)
def('crate_tick', 1, 3, 0.04, 0.15, 0.9, (S, d, t, p) => {
  const lv = clamp(fin(p.amt, 0.4), 0, 1.2);
  const f = 392 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19][clamp(Math.round(p.n || 0), 0, 8)] / 12);
  let e = mx(
    S.noise(d, { t, dur: 0.02, vol: 0.14 + lv * 0.1, ft: 'bandpass', f: 2200, q: 3, seed: p.k }),
    S.tone(d, { t, f, type: 'triangle', dur: 0.05, r: 0.1, vol: 0.12 + lv * 0.1 }));
  if (lv > 0.55) e = mx(e, S.fmBell(d, { t, f: f * 2, ratio: 2, idx: 1 + lv, dur: 0.25, vol: 0.06 * lv }));
  if (lv > 0.9) e = mx(e, S.tone(d, { t, f: 60, f2: 45, glide: 0.1, dur: 0.12, vol: 0.3 }));
  return e;
}, 0.02);
def('crate_shake', 1, 2, 0.08, 0.1, 0.9, (S, d, t, p) => {
  let e = t; const lv = clamp(fin(p.amt, 0.5), 0, 1.2);
  for (let i = 0; i < 4; i++) e = mx(e, S.noise(d, { t: t + i * 0.045, dur: 0.025, vol: 0.14 + lv * 0.1, ft: 'bandpass', f: 500 + hash(i + p.k * 100) * 900, q: 3, seed: p.k * 3 + i }));
  return mx(e, S.tone(d, { t, f: 80 + lv * 20, f2: 55, glide: 0.1, dur: 0.15, vol: 0.28 + lv * 0.2 }));
});
def('crate_lid', 3, 1, 0.3, 0.3, 1, (S, d, t, p) => mx(
  S.tone(d, { t, f: 200, f2: 520, glide: 0.18, type: 'sawtooth', dur: 0.2, r: 0.04, vol: 0.09, lp: 1400, vib: { rate: 22, depth: 60 } }),
  S.tone(d, { t: t + 0.2, f: 150, f2: 60, glide: 0.08, dur: 0.1, vol: 0.55 }),
  S.noise(d, { t: t + 0.2, dur: 0.18, f: 1500, f2: 7000, ft: 'highpass', vol: 0.3, seed: p.k }),
  S.tone(d, { t: t + 0.22, f: 400, f2: 900, glide: 0.1, type: 'triangle', dur: 0.1, r: 0.15, vol: 0.12, vib: { rate: 28, depth: 80 } }),
  S.sparkle(d, t + 0.25, 4, 2400, 0.05, p.k)));
def('new_tag', 2, 1, 0.3, 0.4, 1, (S, d, t, p) => mx(
  S.fmBell(d, { t, f: 1319 * p.pitch, ratio: 2, idx: 1.3, dur: 0.35, vol: 0.2 }),
  S.fmBell(d, { t: t + 0.09, f: 1976 * p.pitch, ratio: 2, idx: 1.3, dur: 0.6, vol: 0.2 }),
  S.meow(d, { t: t + 0.12, f: 820, dur: 0.28, vol: 0.2, shape: 'chirp', seed: p.k })));
def('dupe_tag', 1, 1, 0.3, 0.15, 0.9, (S, d, t, p) => mx(
  S.tone(d, { t, f: 150, f2: 80, glide: 0.08, dur: 0.1, vol: 0.4 }),
  S.tone(d, { t: t + 0.06, f: 392 * p.pitch, f2: 520, glide: 0.1, type: 'triangle', dur: 0.12, r: 0.12, vol: 0.12, vib: { rate: 9, depth: 25 } })));

// ---- crate reveals, escalating by rarity
const REVEAL = {};
REVEAL.common = (S, d, t, p) => mx(
  S.tone(d, { t, f: 523 * p.pitch, type: 'triangle', dur: 0.12, r: 0.22, vol: 0.28, lp: 3200 }),
  S.noise(d, { t, dur: 0.02, vol: 0.1, ft: 'bandpass', f: 2400, q: 3, seed: p.k }),
  S.sparkle(d, t + 0.05, 1, 1568, 0.03, p.k));
REVEAL.rare = (S, d, t, p) => mx(
  S.fmBell(d, { t, f: 784 * p.pitch, ratio: 2, idx: 1.6, dur: 0.55, vol: 0.26 }),
  S.fmBell(d, { t: t + 0.09, f: 1175 * p.pitch, ratio: 2, idx: 1.6, dur: 0.7, vol: 0.24 }),
  S.sparkle(d, t + 0.18, 3, 2349, 0.05, p.k),
  S.tone(d, { t, f: 120, f2: 60, glide: 0.1, dur: 0.12, vol: 0.3 }));
REVEAL.epic = (S, d, t, p) => {
  let e = S.noise(d, { t, dur: 0.7, r: 0.1, f: 1500, f2: 9000, q: 1.4, vol: 0.2, a: 0.5, ft: 'bandpass', seed: p.k });
  [659, 784, 988, 1175, 1480, 1760].forEach((f, i) => { e = mx(e, S.fmBell(d, { t: t + 0.12 + i * 0.075, f: f * p.pitch, ratio: 2, idx: 1.4, dur: 0.6, vol: 0.17 })); });
  [330, 415, 494, 622].forEach((f, i) => { e = mx(e, S.tone(d, { t: t + 0.55, f: f * p.pitch, type: 'sawtooth', unison: 2, spread: 14, dur: 0.7, r: 0.6, vol: 0.075, lp: 3200, lp2: 800, lpT: 1, a: 0.04, vib: { rate: 6, depth: 14 }, detune: i })); });
  e = mx(e, S.tone(d, { t: t + 0.6, f: 82, f2: 40, glide: 0.4, dur: 0.5, r: 0.3, vol: 0.5 }));
  return mx(e, S.sparkle(d, t + 0.7, 6, 2637, 0.05, p.k));
};
REVEAL.legend = (S, d, t, p) => {
  let e = S.choir(d, { t, notes: [147, 220, 294, 370, 440], dur: 1.7, a: 0.7, r: 0.9, vol: 0.2 });
  e = mx(e, S.choir(d, { t: t + 0.7, notes: [587, 740], dur: 1.2, a: 0.3, r: 0.9, vol: 0.1, vowel: 'oh' }));
  for (let i = 0; i < 7; i++) e = mx(e, S.fmBell(d, { t: t + 0.55 + i * 0.085, f: 1568 * (1 + i * 0.125) * p.pitch, ratio: 2, idx: 1.5, dur: 0.9, vol: 0.12 }));
  e = mx(e, S.tone(d, { t: t + 0.8, f: 72, f2: 28, glide: 0.8, dur: 0.9, r: 0.5, vol: 0.75 }));
  e = mx(e, S.noise(d, { t: t + 0.8, dur: 0.5, r: 0.3, vol: 0.38, ft: 'lowpass', f: 1500, f2: 100, a: 0.003, seed: p.k }));
  return mx(e, S.sparkle(d, t + 1.0, 8, 2093, 0.05, p.k));
};
REVEAL.mythic = (S, d, t, p) => {
  let e = S.noise(d, { t, dur: 1.3, r: 0.1, f: 100, f2: 12000, q: 1.2, vol: 0.34, a: 1.0, ft: 'bandpass', seed: p.k });
  e = mx(e, S.tone(d, { t, f: 55, f2: 880, glide: 1.3, type: 'sawtooth', dur: 1.3, r: 0.05, vol: 0.14, lp: 400, lp2: 5000, lpT: 1.3, a: 1.0 }));
  const b = t + 1.3;
  e = mx(e, S.tone(d, { t: b, f: 110, f2: 24, glide: 1.4, dur: 2, r: 1, vol: 0.95, a: 0.003, d: 1.5, s: 0.1 }));
  [73, 147, 220, 294, 370, 440, 587].forEach((f, i) => { e = mx(e, S.tone(d, { t: b, f, type: 'sawtooth', unison: 3, spread: 18, dur: 2.2, r: 1.3, vol: 0.06, lp: 6500, lp2: 900, lpT: 3, a: 0.02, detune: i * 2 })); });
  e = mx(e, S.choir(d, { t: b - 0.1, notes: [147, 220, 294, 370, 440], dur: 2.6, a: 0.25, r: 1.2, vol: 0.24 }));
  e = mx(e, S.choir(d, { t: b + 0.3, notes: [587, 740, 880], dur: 2, a: 0.4, r: 1.2, vol: 0.12, vowel: 'oh' }));
  const sc = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
  for (let i = 0; i < sc.length; i++) e = mx(e, S.fmBell(d, { t: b + i * 0.06, f: mtof(sc[i]) * p.pitch, ratio: i % 2 ? 2 : 3.5, idx: 1.6, dur: 1.4, vol: 0.14 }));
  e = mx(e, S.noise(d, { t: b, dur: 1.5, r: 0.5, f: 6000, f2: 12000, ft: 'highpass', vol: 0.12, a: 0.01, d: 1.3, s: 0.1, seed: p.k + 1 }));
  e = mx(e, S.noise(d, { t: b, dur: 0.6, r: 0.4, f: 2000, f2: 80, ft: 'lowpass', vol: 0.45, a: 0.002, d: 0.5, s: 0.1, seed: p.k + 2 }));
  return mx(e, S.sparkle(d, b + 0.5, 12, 2093, 0.05, p.k));
};
for (const r of ['common', 'rare', 'epic', 'legend', 'mythic']) {
  const pri = r === 'common' ? 2 : r === 'rare' ? 3 : 4;
  def('reveal_' + r, pri, r === 'mythic' || r === 'legend' ? 1 : 2, 0.2, r === 'mythic' ? 0.85 : r === 'legend' ? 0.7 : r === 'epic' ? 0.55 : 0.35, 1, REVEAL[r], 0.01);
}
def('reveal', 3, 1, 0.2, 0.4, 1, (S, d, t, p) => (REVEAL[p.rarity] || REVEAL.common)(S, d, t, p), 0.01);
def('crate_rise', 3, 1, 0.3, 0.3, 1, (S, d, t, p) => {
  const lv = clamp(fin(p.amt, 0.5), 0, 1.2), len = fin(p.dur, 1.1);
  return mx(
    S.noise(d, { t, dur: len, r: 0.1, f: 300, f2: 2500 + lv * 8000, q: 1.5, vol: 0.12 + lv * 0.18, a: len * 0.8, ft: 'bandpass', seed: p.k }),
    S.tone(d, { t, f: 140 + lv * 40, f2: 420 + lv * 700, glide: len, type: 'sawtooth', dur: len, r: 0.05, vol: 0.05 + lv * 0.08, lp: 600, lp2: 3000, lpT: len, a: len * 0.8 }));
}, 0.01);

export const SFX_NAMES = Object.freeze(Object.keys(SFX));
export const CRATE_KINDS = Object.freeze(['tick', 'shake', 'rise', 'open', 'reveal', 'new', 'dupe']);
export const MUSIC_MODES = Object.freeze(['title', 'town', 'battle', 'boss', 'win', 'lose', 'crate']);
export const EVENT_TYPES = Object.freeze(['hit', 'crit', 'death', 'spawn', 'cast', 'heal', 'status', 'shield', 'base_hit', 'chain', 'pierce', 'aoe',
  'knockback', 'pull', 'execute', 'trap_set', 'trap_trigger', 'barricade', 'aura', 'energy', 'draw', 'revive', 'wave', 'rule', 'reward', 'cleanse',
  'taunt', 'reflect', 'attack', 'merge', 'burrow', 'emerge', 'summon_call', 'loot', 'win', 'lose']);
// default sfx per event type (onEvent refines by element, side, size and kind)
export const EVENT_SFX = Object.freeze({
  hit: 'hit_phys', crit: 'crit', death: 'death_enemy', spawn: 'spawn_enemy', cast: 'cast', heal: 'heal', status: 'status_buff', shield: 'shield',
  base_hit: 'base_hit', chain: 'chain', pierce: 'pierce', aoe: 'aoe', knockback: 'knockback', pull: 'pull', execute: 'execute', trap_set: 'trap_set',
  trap_trigger: 'trap_trigger', barricade: 'barricade', aura: 'aura', energy: 'energy', draw: 'card_draw', revive: 'revive', wave: 'wave', rule: 'rule',
  reward: 'reward', cleanse: 'cleanse', taunt: 'taunt', reflect: 'reflect', attack: 'attack_melee', merge: 'merge', burrow: 'burrow', emerge: 'emerge',
  summon_call: 'summon_call', loot: 'reward', win: 'win', lose: 'lose',
});
const ELEM_HIT = { fire: 'hit_fire', elec: 'hit_elec', poison: 'hit_poison', holy: 'hit_holy', shadow: 'hit_shadow', void: 'hit_void', bleed: 'hit_bleed' };

// ------------------------------------------------------------------------------------------------ music
// instruments write into a track: k.mix (pumped), k.lead (pumped + echo), k.dry (drums, not pumped), all in the track bus
const lv = (I, th, w = 0.18) => clamp((I - th) / w, 0, 1);
function pumpDuck(k, t, depth) {
  const p = k.pump.gain;
  p.setValueAtTime(depth, t);
  p.linearRampToValueAtTime(1, t + 0.2);
}
function padChord(S, k, t, notes, dur, vol, o) {
  o = o || {};
  for (let i = 0; i < notes.length; i++) {
    S.tone(k.mix, { t, f: mtof(notes[i]), type: 'sawtooth', unison: 3, spread: 14, dur, r: 0.5, vol, lp: o.lp || 650, lp2: o.lp2 || 1700, lpT: dur, q: 0.9, a: o.a === undefined ? dur * 0.35 : o.a, d: dur * 0.3, s: 0.8, detune: i * 2 });
  }
}
function bassNote(S, k, t, midi, dur, vol, kind) {
  const f = mtof(midi);
  S.tone(k.mix, { t, f, dur, r: 0.05, vol: vol * 0.9, a: 0.005, d: dur * 0.5, s: 0.5 });
  if (kind === 'growl') {
    S.tone(k.mix, { t, f, type: 'sawtooth', unison: 2, spread: 24, dur, r: 0.05, vol: vol * 0.7, lp: 700, lp2: 160, lpT: dur, q: 5, a: 0.004, d: dur * 0.6, s: 0.4 });
  } else if (kind !== 'sub') {
    S.tone(k.mix, { t, f: f * 2, type: 'sawtooth', dur, r: 0.04, vol: vol * 0.5, lp: 1500, lp2: 220, lpT: dur * 0.7, q: 3, a: 0.003, d: dur * 0.5, s: 0.2 });
  }
}
function pluckArp(S, k, t, midi, vol, dur) {
  S.tone(k.lead, { t, f: mtof(midi), type: 'sawtooth', unison: 2, spread: 10, dur: dur || 0.1, r: 0.12, vol, lp: 5200, lp2: 700, lpT: 0.16, q: 2, a: 0.002, d: 0.1, s: 0.15 });
}
function leadNote(S, k, t, midi, dur, vol, o) {
  S.tone(k.lead, { t, f: mtof(midi), type: 'sawtooth', unison: 3, spread: 16, dur, r: 0.15, vol, lp: (o && o.lp) || 3600, q: 1.5, a: 0.012, d: 0.1, s: 0.7, vib: { rate: 5.6, depth: 14 } });
}
function bellNote(S, k, t, midi, dur, vol, ratio) {
  S.fmBell(k.lead, { t, f: mtof(midi), ratio: ratio || 2, idx: 1.2, dur, vol });
}
function epiano(S, k, t, midi, dur, vol) {
  S.fmBell(k.mix, { t, f: mtof(midi), ratio: 1, idx: 0.9, dur, vol, a: 0.004 });
  S.tone(k.mix, { t, f: mtof(midi), type: 'triangle', dur: dur * 0.5, r: 0.2, vol: vol * 0.35, lp: 1800 });
}

// ---- title: A minor dream, cats purring under a slow neon arp
const T_CH = [
  { r: 33, p: [57, 60, 64] }, { r: 29, p: [53, 57, 60] }, { r: 36, p: [55, 60, 64] }, { r: 31, p: [55, 59, 62] },
  { r: 33, p: [57, 60, 64] }, { r: 29, p: [53, 57, 60] }, { r: 26, p: [53, 57, 62] }, { r: 28, p: [56, 59, 64] },
];
const T_MEL = {
  2: [[0, 76, 6], [6, 72, 2], [8, 74, 4], [12, 72, 4]], 3: [[0, 71, 8], [8, 69, 8]],
  6: [[0, 77, 6], [6, 74, 2], [8, 72, 4], [12, 74, 4]], 7: [[0, 76, 10], [10, 80, 6]],
};
const T_ARP = [0, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 3, 2, 1, 2, 1];
function playTitle(S, k, pos, t, I) {
  const bar = pos >> 4, st = pos & 15, ch = T_CH[bar % 8], sd = k.sd;
  if (st === 0) {
    padChord(S, k, t, ch.p, sd * 16, 0.05, { lp: 500, lp2: 1500 });
    padChord(S, k, t, [ch.p[0] + 12, ch.p[2] + 12], sd * 16, 0.03, { lp: 800, lp2: 1800 });
    if (bar % 2 === 0) S.purr(k.mix, { t, dur: sd * 30, vol: 0.085, rate: 24, a: sd * 6, seed: bar });
  }
  if (st === 0 || st === 10) bassNote(S, k, t, ch.r, sd * (st === 0 ? 9 : 5), 0.34, 'sub');
  if (st % 2 === 0 && bar >= 1) {
    const tones = [ch.p[0], ch.p[1], ch.p[2], ch.p[0] + 12, ch.p[1] + 12];
    pluckArp(S, k, t, tones[T_ARP[st] % 5] + 12, 0.045, 0.09);
  }
  if (bar >= 2) { if (st === 0 || st === 8) kick(S, k.dry, t, 0.28, true); if (st === 4 || st === 12) hat(S, k.dry, t, 0.045, false); }
  const mel = T_MEL[bar];
  if (mel) for (const m of mel) if (m[0] === st) bellNote(S, k, t, m[1], m[2] * sd + 0.4, 0.12, 2);
  if (bar === 7 && st === 12) S.meow(k.mix, { t, f: 620, dur: 0.5, vol: 0.12, shape: 'mew', seed: 4 });
  if (bar === 3 && st === 12 && I > 0.5) S.purr(k.mix, { t, dur: sd * 4, vol: 0.06, seed: 9 });
}

// ---- town: lofi jazz-synth under a neon rain, swung, lots of purr
const TW_CH = [
  { r: 38, p: [53, 57, 60, 64] }, { r: 43, p: [53, 55, 59, 62] }, { r: 36, p: [52, 55, 59, 64] }, { r: 33, p: [52, 55, 60, 64] },
  { r: 41, p: [52, 57, 60, 65] }, { r: 40, p: [50, 55, 59, 62] }, { r: 38, p: [53, 57, 60, 64] }, { r: 43, p: [53, 55, 59, 62] },
];
const TW_PENT = [72, 74, 76, 79, 81, 84];
function playTown(S, k, pos, t, I) {
  const bar = pos >> 4, st = pos & 15, ch = TW_CH[bar % 8], sd = k.sd;
  if (st === 0) {
    padChord(S, k, t, ch.p.slice(0, 3), sd * 16, 0.04, { lp: 450, lp2: 1100 });
    S.purr(k.mix, { t, dur: sd * 14, vol: 0.075 + 0.04 * I, rate: 25, a: sd * 4, seed: bar });
  }
  if (st === 0 || st === 6) ch.p.forEach((m, i) => epiano(S, k, t + i * 0.012, m, sd * 5, 0.07 - i * 0.006));
  if (st === 10 && bar % 2 === 1) ch.p.slice(1).forEach((m, i) => epiano(S, k, t + i * 0.012, m, sd * 3, 0.045));
  if (st === 0) bassNote(S, k, t, ch.r, sd * 5, 0.36, 'sub');
  if (st === 7) bassNote(S, k, t, ch.r + 7, sd * 3, 0.26, 'sub');
  if (st === 10) bassNote(S, k, t, ch.r + 12, sd * 4, 0.24, 'sub');
  if (st === 0 || st === 10) kick(S, k.dry, t, 0.3 * (0.6 + 0.4 * lv(I, 0.15, 0.3)), true);
  const hv = lv(I, 0.25, 0.25);
  if (hv > 0.05 && st % 2 === 0) hat(S, k.dry, t, 0.04 * hv + 0.01, false);
  if (lv(I, 0.45, 0.2) > 0.1 && (st === 4 || st === 12)) S.noise(k.dry, { t, dur: 0.03, r: 0.05, vol: 0.14, ft: 'bandpass', f: 1600, q: 3, seed: 21 });
  const mv = lv(I, 0.5, 0.2);
  if (mv > 0.05 && st % 2 === 0 && hash(bar * 31 + st * 7 + 3) < 0.22) {
    const n = TW_PENT[Math.floor(hash(bar * 13 + st) * TW_PENT.length)];
    bellNote(S, k, t, n, sd * 4, 0.075 * mv, 2);
  }
  if (st === 14 && bar % 4 === 3 && hash(bar) < 0.7 && I > 0.4) S.meow(k.mix, { t, f: 700 + hash(bar) * 200, dur: 0.22, vol: 0.07 * lv(I, 0.4, 0.3), shape: 'chirp', seed: bar });
}

// ---- battle: D minor, 128 bpm, adaptive layers
const B_CH = [
  { r: 38, p: [62, 65, 69] }, { r: 38, p: [62, 65, 69] }, { r: 34, p: [58, 62, 65] }, { r: 36, p: [60, 64, 67] },
  { r: 38, p: [62, 65, 69] }, { r: 38, p: [62, 65, 69] }, { r: 34, p: [58, 62, 65] }, { r: 33, p: [57, 61, 64] },
];
const B_LEAD = [
  [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 74, 4]],
  [[0, 72, 4], [4, 74, 4], [8, 69, 8]],
  [[0, 70, 2], [2, 74, 2], [4, 77, 4], [8, 74, 2], [10, 72, 2], [12, 70, 4]],
  [[0, 72, 2], [2, 76, 2], [4, 79, 4], [8, 76, 4], [12, 72, 4]],
];
const B_LEAD_END = [[0, 73, 2], [2, 76, 2], [4, 81, 4], [8, 80, 2], [10, 76, 2], [12, 73, 4]];
const B_ARP = [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1];
function playBattle(S, k, pos, t, I) {
  const bar = pos >> 4, st = pos & 15, ch = B_CH[bar % 8], sd = k.sd;
  const kv = lv(I, 0.28), sv = lv(I, 0.5), lvv = lv(I, 0.7), xv = lv(I, 0.88);
  if (st === 0) {
    padChord(S, k, t, ch.p, sd * 16, 0.04 + 0.01 * I, { lp: 600, lp2: 1800 });
    if (pos % 32 === 0) S.purr(k.mix, { t, dur: sd * 28, vol: 0.05, rate: 27, a: sd * 6, seed: bar });
  }
  // bass: eighth-note rolling octaves, sixteenths at the snare layer
  const bOct = (st % 8 === 6 || st % 8 === 3) ? 12 : 0;
  if (st % 2 === 0 || (sv > 0.3 && st % 2 === 1 && st % 4 === 3)) bassNote(S, k, t, ch.r + bOct, sd * 1.7, 0.3 + 0.08 * sv, 'saw');
  const av = lv(I, 0.12);
  if (av > 0.05 && st % 2 === 0) {
    const tones = [ch.p[0], ch.p[1], ch.p[2]];
    pluckArp(S, k, t, tones[B_ARP[st]] + (st % 8 >= 4 ? 24 : 12), 0.04 * av + 0.01);
  }
  if (xv > 0.1 && st % 2 === 1) pluckArp(S, k, t, ch.p[B_ARP[st]] + 36, 0.025 * xv);
  if (kv > 0.05) {
    if (st % 4 === 0) { kick(S, k.dry, t, 0.5 * kv + 0.1, false); pumpDuck(k, t, 0.6); }
    if (st % 4 === 2) hat(S, k.dry, t, 0.06 * kv, false);
  }
  if (sv > 0.05) {
    if (st === 4 || st === 12) { snare(S, k.dry, t, 0.34 * sv); clap(S, k.dry, t, 0.2 * sv); }
    if (st === 14) hat(S, k.dry, t, 0.05 * sv, true);
    if (st % 2 === 1) hat(S, k.dry, t, 0.025 * sv, false);
    if (bar % 8 === 7 && st >= 12) snare(S, k.dry, t, 0.2 * sv * (0.5 + (st - 12) * 0.2));
  }
  if (lvv > 0.05) {
    const phrase = bar % 8 === 7 ? B_LEAD_END : B_LEAD[bar % 4];
    for (const m of phrase) if (m[0] === st) leadNote(S, k, t, m[1], m[2] * sd + 0.05, 0.1 * lvv, { lp: 3000 + 1500 * xv });
  }
  if (xv > 0.1) {
    if (pos % 128 === 0) S.noise(k.dry, { t, dur: 1.2, r: 0.4, vol: 0.14 * xv, ft: 'highpass', f: 6000, a: 0.002, d: 1.2, s: 0.1, seed: 31 });
    if (bar % 8 === 7 && st === 0) S.noise(k.dry, { t, dur: sd * 16, r: 0.05, vol: 0.12 * xv, ft: 'bandpass', f: 400, f2: 8000, q: 1.2, a: sd * 15, seed: 33 });
  }
}

// ---- boss: D phrygian, 138 bpm, half-time weight, growl bass, choir and tritone stabs
const BO_CH = [
  { r: 26, p: [50, 57, 62, 65] }, { r: 27, p: [51, 58, 63, 67] }, { r: 26, p: [50, 57, 62, 65] }, { r: 27, p: [51, 58, 63, 67] },
  { r: 26, p: [50, 57, 62, 65] }, { r: 22, p: [46, 58, 62, 65] }, { r: 27, p: [51, 58, 63, 67] }, { r: 21, p: [45, 57, 61, 64] },
];
function playBoss(S, k, pos, t, Iraw) {
  const I = 0.45 + 0.55 * Iraw;
  const bar = pos >> 4, st = pos & 15, ch = BO_CH[bar % 8], sd = k.sd;
  if (st === 0) {
    padChord(S, k, t, ch.p, sd * 16, 0.045, { lp: 420, lp2: 1300 });
    S.choir(k.mix, { t, notes: ch.p.slice(0, 3).map((m) => mtof(m)), dur: sd * 14, a: sd * 6, r: 0.7, vol: 0.075, vowel: 'oh' });
    if (bar % 2 === 0) bellNote(S, k, t, ch.p[0] + 24, 1.8, 0.07, 3.5);
  }
  if (st % 2 === 0) bassNote(S, k, t, ch.r + ((st === 6 || st === 14) ? 12 : 0), sd * 1.8, 0.4, 'growl');
  if (st === 0 || st === 3 || st === 8 || st === 11) {
    const tri = st === 3 || st === 11 ? 6 : 0;
    S.tone(k.mix, { t, f: mtof(ch.p[0] + tri), type: 'sawtooth', unison: 2, spread: 20, dur: sd * 1.4, r: 0.1, vol: 0.09, lp: 2400, lp2: 500, lpT: 0.2, a: 0.004, d: 0.1, s: 0.3 });
    S.tone(k.mix, { t, f: mtof(ch.p[0] + tri + 7), type: 'sawtooth', unison: 2, spread: 20, dur: sd * 1.4, r: 0.1, vol: 0.07, lp: 2400, lp2: 500, lpT: 0.2, a: 0.004, d: 0.1, s: 0.3 });
  }
  if (st === 0 || st === 7 || st === 10) { kick(S, k.dry, t, 0.75, true); pumpDuck(k, t, 0.5); }
  if (st === 8) { snare(S, k.dry, t, 0.5); clap(S, k.dry, t, 0.3); }
  const hv = lv(I, 0.55, 0.25);
  if (hv > 0.05 && st % 2 === 0) hat(S, k.dry, t, 0.06 * hv, false);
  if (st === 4 && I > 0.6) S.tone(k.dry, { t, f: 60, f2: 40, glide: 0.1, dur: 0.12, vol: 0.4 }); // heartbeat
  if (bar % 4 === 3 && st >= 8) {
    const f = 400 + (st - 8) * 140;
    S.tone(k.lead, { t, f, f2: f * 1.5, glide: sd * 2, type: 'sawtooth', unison: 2, spread: 24, dur: sd * 2, r: 0.1, vol: 0.07 * lv(I, 0.65, 0.2), lp: 3000, a: 0.01, vib: { rate: 6, depth: 25 } });
  }
  if (bar % 8 === 7 && st >= 12) snare(S, k.dry, t, 0.25);
  if (pos % 128 === 0) S.noise(k.dry, { t, dur: 1.5, r: 0.4, vol: 0.16, ft: 'highpass', f: 5000, a: 0.002, d: 1.4, s: 0.1, seed: 41 });
}

// ---- win: fanfare then a gentle victory bed
const W_CH = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
const W_ARP = [72, 76, 79, 84, 88, 84, 79, 76];
function playWin(S, k, pos, t, I) {
  const sd = k.sd;
  if (pos < 48) {
    if (pos < 16 && pos % 2 === 0) {
      pluckArp(S, k, t, W_ARP[(pos / 2) % 8] + (pos >= 8 ? 0 : 0), 0.12, 0.12);
      bellNote(S, k, t, W_ARP[(pos / 2) % 8] + 12, 0.5, 0.06, 2);
    }
    if (pos === 0) { padChord(S, k, t, [48, 52, 55, 60], sd * 16, 0.06, { lp: 900, lp2: 3500, a: 0.1 }); kick(S, k.dry, t, 0.7, true); }
    if (pos === 8) { kick(S, k.dry, t, 0.5, true); clap(S, k.dry, t, 0.3); }
    if (pos === 16) { padChord(S, k, t, [53, 57, 60, 65], sd * 8, 0.06, { lp: 1000, lp2: 3800, a: 0.05 }); [77, 81, 84].forEach((m, i) => bellNote(S, k, t + i * 0.07, m, 0.7, 0.1, 2)); }
    if (pos === 24) { padChord(S, k, t, [55, 59, 62, 67], sd * 8, 0.06, { lp: 1100, lp2: 4000, a: 0.05 }); [79, 83, 86].forEach((m, i) => bellNote(S, k, t + i * 0.07, m, 0.7, 0.1, 2)); }
    if (pos === 32) {
      padChord(S, k, t, [48, 52, 55, 60, 64], sd * 16, 0.07, { lp: 1400, lp2: 5000, a: 0.04 });
      S.choir(k.mix, { t, notes: [mtof(60), mtof(64), mtof(67), mtof(72)], dur: sd * 14, a: 0.3, r: 1, vol: 0.14 });
      kick(S, k.dry, t, 0.8, true); clap(S, k.dry, t, 0.34);
      S.noise(k.dry, { t, dur: 1.4, r: 0.5, vol: 0.12, ft: 'highpass', f: 5000, a: 0.002, d: 1.3, s: 0.1, seed: 51 });
      [84, 88, 91, 96].forEach((m, i) => bellNote(S, k, t + i * 0.08, m, 1.2, 0.09, 2));
      bassNote(S, k, t, 36, sd * 12, 0.5, 'sub');
    }
    return;
  }
  const lp = pos - 48, bar = lp >> 4, st = lp & 15, ch = W_CH[bar % 4];
  if (st === 0) { padChord(S, k, t, ch.map((m) => m + 12), sd * 16, 0.04, { lp: 700, lp2: 2200 }); bassNote(S, k, t, ch[0] - 12, sd * 10, 0.3, 'sub'); S.purr(k.mix, { t, dur: sd * 14, vol: 0.05, seed: bar + 3 }); }
  if (st % 4 === 0) bellNote(S, k, t, ch[(st >> 2) % 3] + 36, 0.9, 0.05, 2);
  if (st === 0 || st === 8) kick(S, k.dry, t, 0.25, true);
  if (st === 4 || st === 12) hat(S, k.dry, t, 0.035, false);
}

// ---- lose: slow D minor, detuned, a lone sad meow
const L_ARP = [69, 65, 62, 57];
function playLose(S, k, pos, t, I) {
  const sd = k.sd;
  if (pos < 32) {
    if (pos === 0) {
      padChord(S, k, t, [38, 45, 50, 53], sd * 24, 0.06, { lp: 350, lp2: 900, a: 0.4 });
      bassNote(S, k, t, 26, sd * 24, 0.5, 'sub');
      S.noise(k.dry, { t, dur: 0.6, r: 0.4, vol: 0.2, ft: 'lowpass', f: 900, f2: 90, seed: 61 });
    }
    if (pos % 8 === 0 && pos < 32) {
      const m = L_ARP[(pos / 8) | 0];
      S.tone(k.lead, { t, f: mtof(m), f2: mtof(m) * 0.985, glide: 1.2, type: 'sawtooth', unison: 2, spread: 28, dur: sd * 7, r: 0.8, vol: 0.12, lp: 1800, lp2: 500, lpT: 1.4, a: 0.05, d: 0.5, s: 0.4, vib: { rate: 4.5, depth: 20 } });
      bellNote(S, k, t, m + 12, 1.4, 0.06, 3.5);
    }
    if (pos === 20) S.meow(k.mix, { t, f: 520, dur: 0.8, vol: 0.16, shape: 'sad', seed: 7 });
    return;
  }
  const lp = pos - 32, bar = lp >> 4, st = lp & 15;
  if (st === 0) {
    const root = bar % 2 ? 34 : 38;
    padChord(S, k, t, [root + 12, root + 19, root + 22 - (bar % 2 ? 0 : 1)], sd * 16, 0.04, { lp: 380, lp2: 800 });
    bassNote(S, k, t, root - 12, sd * 14, 0.3, 'sub');
    S.purr(k.mix, { t, dur: sd * 15, vol: 0.04, bright: 180, seed: bar });
  }
  if (st === 8 && bar % 2 === 0) bellNote(S, k, t, 69 - (bar % 4), 1.4, 0.045, 3.5);
}

// ---- crate: rising tension, driven by the time since the mode started (the caller adds crateBeat on top)
function playCrate(S, k, pos, t, I) {
  const bar = pos >> 4, st = pos & 15, sd = k.sd;
  const T = clamp((t - k.t0) / 9, 0, 1);
  if (st === 0) {
    const root = 33 + (bar % 4 === 3 ? 2 : 0);
    padChord(S, k, t, [root + 12, root + 19, root + 24, root + 27 + (T > 0.5 ? 1 : 0)], sd * 16, 0.04 + 0.03 * T, { lp: 300 + 500 * T, lp2: 700 + 2500 * T, a: sd * 8 });
    S.tone(k.mix, { t, f: mtof(root), dur: sd * 16, r: 0.3, vol: 0.3 + 0.15 * T, a: 0.4 });
    S.noise(k.dry, { t, dur: sd * 15, r: 0.1, f: 250, f2: 1500 + 6000 * T, q: 1.4, vol: 0.03 + 0.1 * T, a: sd * 14, ft: 'bandpass', seed: bar });
  }
  const beat = st % 4 === 0;
  const lubdub = st === 0 || st === 3;
  if (T < 0.4 ? lubdub : (T < 0.75 ? beat || st === 3 : st % 2 === 0)) {
    S.tone(k.dry, { t, f: 72, f2: 42, glide: 0.1, dur: 0.12, r: 0.1, vol: 0.28 + 0.4 * T, a: 0.002 });
  }
  if (T > 0.3 && st % 2 === 0) {
    const sc = [57, 60, 64, 67, 69, 72, 76, 79];
    pluckArp(S, k, t, sc[(st / 2 + bar * 2) % 8] + 12 * (T > 0.7 ? 1 : 0), 0.025 + 0.04 * T);
  }
  if (T > 0.5 && st % 2 === 1) hat(S, k.dry, t, 0.03 * T, false);
  if (T > 0.6 && st === 8) S.fmBell(k.lead, { t, f: 1760 + 800 * T, ratio: 3.5, idx: 1, dur: 0.5, vol: 0.04 * T });
}

const MODES = {
  title: { bpm: 90, len: 128, intro: 0, swing: 0, fadeIn: 1.2, play: playTitle, I0: 0.5 },
  town: { bpm: 78, len: 128, intro: 0, swing: 0.2, fadeIn: 1.2, play: playTown, I0: 0.4 },
  battle: { bpm: 128, len: 128, intro: 0, swing: 0, fadeIn: 0.4, play: playBattle, I0: 0.3 },
  boss: { bpm: 138, len: 128, intro: 0, swing: 0, fadeIn: 0.3, play: playBoss, I0: 0.5 },
  win: { bpm: 100, len: 64, intro: 48, swing: 0, fadeIn: 0.03, play: playWin, stinger: true },
  lose: { bpm: 68, len: 64, intro: 32, swing: 0, fadeIn: 0.05, play: playLose, stinger: true },
  crate: { bpm: 112, len: 64, intro: 0, swing: 0, fadeIn: 0.6, play: playCrate, auto: true },
};

// ------------------------------------------------------------------------------------------------ engine
export function createAudio(opts) {
  opts = opts || {};
  const Ctor = opts.AudioContext || (typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null) || null;
  const MAXV = opts.maxVoices || 26;
  let C = opts.context || null, S = null, ready = false, wantRunning = false;
  let muted = false, volume = 0.8, intensity = 0.4, intensityS = 0.4, lastPumpT = 0;
  let master = null, mix = null, comp = null, shaper = null, sfxBus = null, musBus = null, rvIn = null, rvConv = null, rvOut = null, analyser = null;
  let sfxSend = null, musSend = null;
  const infra = [];
  const voices = [];
  const lastPlay = new Map();
  let track = null, pendingMode = null, timer = null;
  const dying = [];
  const stats = { errors: 0, sfxPlayed: 0, sfxDropped: 0, peakVoices: 0, musicSteps: 0 };
  let ema = 0, counter = 0, duckBase = 0.42;

  const volCurve = (v) => v * v;

  function init() {
    if (S || !C) return;
    S = makeSynth(C);
    const mk = (n) => { infra.push(n); return n; };
    master = mk(C.createGain()); master.gain.value = muted ? 0 : volCurve(volume);
    mix = mk(C.createGain());
    comp = mk(C.createDynamicsCompressor());
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    shaper = mk(C.createWaveShaper());
    const N = 1025, curve = new Float32Array(N), k = 1.5, norm = Math.tanh(k);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / norm; }
    shaper.curve = curve;
    sfxBus = mk(C.createGain()); sfxBus.gain.value = 1.15;
    musBus = mk(C.createGain()); musBus.gain.value = duckBase;
    rvIn = mk(C.createGain());
    rvConv = mk(C.createConvolver());
    rvOut = mk(C.createGain()); rvOut.gain.value = 0.5;
    sfxSend = mk(C.createGain()); sfxSend.gain.value = 0.1;
    musSend = mk(C.createGain()); musSend.gain.value = 0.22;
    // impulse response: 1.9 s of decaying noise that darkens as it fades
    const sr = C.sampleRate || 44100, len = Math.max(512, Math.floor(sr * 1.9));
    const ir = C.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch); let s = 0x9e3779b1 + ch * 7919, lp = 0;
      for (let i = 0; i < len; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const x = i / len, a = 0.15 + 0.8 * x;
        lp = lp * a + ((s / 2147483648) - 1) * (1 - a);
        data[i] = lp * Math.pow(1 - x, 2.6) * 2.2;
      }
    }
    rvConv.buffer = ir;
    sfxBus.connect(mix); musBus.connect(mix);
    sfxBus.connect(sfxSend); sfxSend.connect(rvIn);
    musBus.connect(musSend); musSend.connect(rvIn);
    rvIn.connect(rvConv); rvConv.connect(rvOut); rvOut.connect(mix);
    mix.connect(comp); comp.connect(shaper); shaper.connect(master); master.connect(C.destination);
    if (typeof C.createAnalyser === 'function') { analyser = mk(C.createAnalyser()); analyser.fftSize = 1024; master.connect(analyser); }
    ready = true;
    lastPumpT = C.currentTime;
    if (pendingMode) { const m = pendingMode; pendingMode = null; music(m); }
  }

  function resume() {
    if (!C) {
      if (!Ctor) return Promise.resolve(false);
      try { C = new Ctor(); } catch (e) { C = null; return Promise.resolve(false); }
      if (typeof document !== 'undefined' && document.addEventListener && !opts.noVisibility) {
        document.addEventListener('visibilitychange', () => {
          if (!C || !wantRunning) return;
          try { if (document.hidden) C.suspend && C.suspend(); else C.resume && C.resume(); } catch (e) { /* ignore */ }
        });
      }
    }
    wantRunning = true;
    let p = null;
    try { if (!opts.offline && C.state !== 'running' && typeof C.resume === 'function') p = C.resume(); } catch (e) { p = null; }
    init();
    return Promise.resolve(p).then(() => true, () => true);
  }

  // -------------------------------------------------------------------------------- sfx
  function prune(now) {
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      if (v.end <= now) {
        for (let j = 0; j < v.nodes.length; j++) { try { v.nodes[j].disconnect(); } catch (e) { /* gone */ } }
        voices.splice(i, 1);
      }
    }
  }
  function sfx(name, o) {
    if (!ready || muted || !C) return false;
    const df = SFX[name];
    if (!df) return false;
    o = o || {};
    const now = C.currentTime;
    const last = lastPlay.get(name);
    if (last !== undefined && now - last < df.gap) { stats.sfxDropped++; return false; }
    prune(now);
    let same = 0;
    for (let i = 0; i < voices.length; i++) if (voices[i].name === name) same++;
    const total = voices.length;
    if (same >= df.cap) { stats.sfxDropped++; return false; }
    if (total >= MAXV) { if (df.pri < 2 || total >= MAXV + 8) { stats.sfxDropped++; return false; } }
    else if (df.pri === 0 && total >= MAXV * 0.7) { stats.sfxDropped++; return false; }
    else if (df.pri === 1 && total >= MAXV * 0.9) { stats.sfxDropped++; return false; }
    lastPlay.set(name, now);
    counter++;
    const k = hash(counter * 7919 + hashStr(name) + fin(o.seed) * 31);
    const pitch = clamp(fin(o.pitch, 1), 0.25, 4) * (1 + (k - 0.5) * 2 * df.vr);
    const vol = clamp(fin(o.vol, 1), 0, 2) * df.vol;
    const nodes = [];
    const bus = C.createGain(); bus.gain.value = vol; nodes.push(bus);
    if (o.pan && S.hasPan) { const pn = C.createStereoPanner(); pn.pan.value = clamp(fin(o.pan), -1, 1) * 0.8; bus.connect(pn); pn.connect(sfxBus); nodes.push(pn); } else bus.connect(sfxBus);
    if (df.wet) { const w = C.createGain(); w.gain.value = df.wet; bus.connect(w); w.connect(rvIn); nodes.push(w); }
    const p = { pitch, k, rarity: o.rarity, amt: o.amt, n: o.n, element: o.element, dur: o.dur, pan: o.pan };
    let end = now + 0.2;
    try { end = fin(df.fn(S, bus, now + 0.005, p), now + 0.5); } catch (e) { stats.errors++; if (opts.strict) throw e; end = now + 0.2; }
    voices.push({ name, end: Math.max(end, now + 0.05) + 0.1, nodes });
    stats.sfxPlayed++;
    if (voices.length > stats.peakVoices) stats.peakVoices = voices.length;
    return true;
  }

  function mapEvent(ev) {
    // returns {name, o} or null. Pure apart from the running hit-size average.
    if (!ev || typeof ev.type !== 'string') return null;
    const pan = Number.isFinite(ev.x) ? clamp((ev.x - 4.5) / 7, -0.7, 0.7) : 0;
    switch (ev.type) {
      case 'hit': {
        const amount = Math.max(0, fin(ev.amount));
        if (amount > 0) ema = ema === 0 ? amount : ema * 0.96 + amount * 0.04;
        const ratio = ema > 0 ? amount / ema : 1;
        if (ev.dot) return { name: 'hit_dot', o: { pan } };
        if (amount <= 0 && ev.absorbed) return { name: 'shield_hit', o: { pan } };
        let name = ELEM_HIT[ev.element];
        if (!name) name = ratio > 1.8 ? 'hit_heavy' : ratio < 0.6 ? 'hit_light' : 'hit_phys';
        return { name, o: { pan, vol: 0.75 + 0.25 * clamp(ratio, 0, 1.6) / 1.6 } };
      }
      case 'crit': return { name: 'crit', o: { pan } };
      case 'death':
        if (ev.boss) { duck(0.35, 1.2); return { name: 'death_boss', o: { pan } }; }
        if (ev.kind === 'barricade') return { name: 'death_wood', o: { pan } };
        if (ev.expired || ev.kind === 'minion') return { name: 'death_minion', o: { pan } };
        if (ev.side === 'cat') return { name: 'death_cat', o: { pan } };
        return { name: 'death_enemy', o: { pan } };
      case 'spawn':
        if (ev.minion || ev.kind === 'minion') return { name: 'spawn_minion', o: { pan } };
        return { name: ev.side === 'cat' ? 'spawn_cat' : 'spawn_enemy', o: { pan } };
      case 'cast': return { name: ev.card ? 'cast_card' : 'cast', o: { pan } };
      case 'heal': return { name: 'heal', o: { pan } };
      case 'status': {
        const s = ev.status;
        return { name: s === 'debuff' ? 'status_debuff' : s === 'stun' ? 'status_stun' : s === 'dot' ? 'status_dot' : s === 'reflect' ? 'reflect' : 'status_buff', o: { pan } };
      }
      case 'shield': return { name: 'shield', o: { pan } };
      case 'base_hit': duck(0.5, 0.5); return { name: 'base_hit', o: { amt: 0.8 + clamp(fin(ev.amount) / Math.max(1, fin(ev.hp) + fin(ev.amount)), 0, 0.7) } };
      case 'chain': return { name: 'chain', o: { n: Array.isArray(ev.path) ? ev.path.length : 3, pan } };
      case 'pierce': return { name: 'pierce', o: { pan: clamp((fin(ev.x1) - 4.5) / 7, -0.7, 0.7) } };
      case 'aoe': return { name: 'aoe', o: { pan, element: ev.element, amt: 0.7 + clamp(fin(ev.radius, 1) / 3, 0, 0.9) } };
      case 'knockback': return { name: 'knockback', o: { pan } };
      case 'pull': return { name: 'pull', o: { pan } };
      case 'execute': return { name: 'execute', o: { pan } };
      case 'trap_set': return { name: 'trap_set', o: { pan } };
      case 'trap_trigger': return { name: 'trap_trigger', o: {} };
      case 'barricade': return { name: 'barricade', o: { pan } };
      case 'aura': return { name: 'aura', o: { pan } };
      case 'energy': return { name: 'energy', o: {} };
      case 'draw': return { name: 'card_draw', o: { n: fin(ev.count, 1) } };
      case 'revive': return { name: 'revive', o: { pan } };
      case 'wave':
        if (ev.isBossWave) { duck(0.45, 1.6); return { name: 'wave_boss', o: {} }; }
        if (ev.boss !== undefined) return { name: 'boss_phase', o: {} };
        return { name: 'wave', o: {} };
      case 'rule': return { name: 'rule', o: {} };
      case 'reward': return { name: 'reward', o: {} };
      case 'cleanse': return { name: 'cleanse', o: { pan } };
      case 'taunt': return { name: 'taunt', o: { pan } };
      case 'reflect': return { name: 'reflect', o: { pan } };
      case 'attack': return { name: ev.ranged ? 'attack_ranged' : 'attack_melee', o: { pan: clamp((fin(ev.x) - 4.5) / 7, -0.7, 0.7) } };
      case 'merge': return { name: 'merge', o: { n: fin(ev.stars, 2), pan } };
      case 'burrow': return { name: 'burrow', o: { pan } };
      case 'emerge': return { name: 'emerge', o: { pan } };
      case 'summon_call': return { name: 'summon_call', o: {} };
      case 'loot': {
        const kd = String(ev.kind || '');
        const nm = kd === 'fish' || kd === 'yarn' || kd === 'gem' || kd === 'gems' || kd === 'token' || kd === 'tokens' ? kd.replace(/s$/, '')
          : kd === 'relic' ? 'relic' : kd === 'card' ? 'loot_card' : kd === 'cat' ? 'loot_cat' : 'coin';
        return { name: nm, o: {} };
      }
      case 'win': return { name: 'win', o: {} };
      case 'lose': return { name: 'lose', o: {} };
      default: return null;
    }
  }
  function onEvent(ev) {
    const m = mapEvent(ev);
    if (!m) return false;
    if (ev.type === 'win') music('win'); else if (ev.type === 'lose') music('lose');
    return sfx(m.name, m.o);
  }

  // -------------------------------------------------------------------------------- music
  function posOf(df, s) { return s < df.intro ? s : df.intro + ((s - df.intro) % df.len); }
  function pump(horizon, maxIter) {
    if (!track || !C || !ready) return;
    const now = C.currentTime;
    const dtp = clamp(now - lastPumpT, 0, 0.5); lastPumpT = now;
    const rate = intensity > intensityS ? 1.1 : 0.3;
    intensityS += clamp(intensity - intensityS, -rate * dtp, rate * dtp);
    const tr = track, df = tr.def;
    if (tr.nextT < now - 0.25) tr.nextT = now + 0.03;
    const lim = now + (horizon === undefined ? 0.3 : horizon);
    let guard = maxIter || 48;
    while (tr.nextT < lim && guard-- > 0) {
      const s = tr.step++, pos = posOf(df, s);
      const t = tr.nextT + ((s & 1) ? df.swing * tr.sd : 0);
      if (!muted) {
        try { df.play(S, tr, pos, t, df.auto ? 1 : intensityS); } catch (e) { stats.errors++; if (opts.strict) throw e; /* a bad note must never stop the music */ }
      }
      tr.nextT += tr.sd;
      stats.musicSteps++;
    }
  }
  function startTimer() {
    if (timer || typeof setInterval !== 'function' || opts.noTimer) return;
    timer = setInterval(() => { try { pump(); disposeDying(); } catch (e) { /* ignore */ } }, 45);
    if (timer && timer.unref) timer.unref();
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function retire(tr, tc) {
    if (!tr) return;
    const now = C.currentTime;
    tr.bus.gain.cancelScheduledValues(now);
    tr.bus.gain.setTargetAtTime(0, now, tc);
    dying.push({ nodes: tr.nodes, until: now + tc * 7 + 0.3 });
  }
  function disposeDying() {
    if (!dying.length || !C) return;
    const now = C.currentTime;
    for (let i = dying.length - 1; i >= 0; i--) {
      if (dying[i].until <= now) {
        for (const n of dying[i].nodes) { try { n.disconnect(); } catch (e) { /* gone */ } }
        dying.splice(i, 1);
      }
    }
  }
  function music(mode, o) {
    if (!MODES[mode]) return;
    if (!ready) { pendingMode = mode; return; }
    if (track && track.mode === mode && !(o && o.restart)) return;
    const df = MODES[mode];
    const now = C.currentTime;
    if (track) retire(track, df.stinger ? 0.07 : 0.2);
    const nodes = [];
    const mk = (n) => { nodes.push(n); return n; };
    const bus = mk(C.createGain());
    const t0 = now + 0.06;
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(1, t0 + df.fadeIn);
    bus.connect(musBus);
    const pumpN = mk(C.createGain()); pumpN.connect(bus);
    const mixN = mk(C.createGain()); mixN.connect(pumpN);
    const lead = mk(C.createGain()); lead.connect(pumpN);
    const dly = mk(C.createDelay(1.5)), fb = mk(C.createGain()), fl = mk(C.createBiquadFilter()), es = mk(C.createGain());
    const sd = 60 / df.bpm / 4;
    dly.delayTime.value = clamp(sd * 3, 0.01, 1.4);
    fb.gain.value = 0.34; fl.type = 'lowpass'; fl.frequency.value = 2600; es.gain.value = 0.42;
    lead.connect(es); es.connect(dly); dly.connect(fl); fl.connect(fb); fb.connect(dly); fl.connect(bus);
    track = { mode, def: df, bus, pump: pumpN, mix: mixN, lead, dry: bus, nodes, step: 0, nextT: t0, t0, sd };
    if (df.I0 !== undefined && !(o && o.keepIntensity)) { /* intensity stays caller-driven; I0 is only the title default */ }
    startTimer();
    pump(0.3);
  }
  function stopMusic(fade) {
    pendingMode = null;
    if (!track || !C) return;
    retire(track, clamp(fin(fade, 0.6), 0.02, 4) / 4);
    track = null;
    stopTimer();
  }
  function setIntensity(v) { intensity = clamp(fin(v, intensity), 0, 1); }
  function duck(depth, seconds) {
    if (!ready) return;
    const now = C.currentTime, p = musBus.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(duckBase * clamp(fin(depth, 0.5), 0.05, 1), now, 0.015);
    p.setTargetAtTime(duckBase, now + 0.06, clamp(fin(seconds, 0.4), 0.05, 4) * 0.35);
  }

  // -------------------------------------------------------------------------------- crate ceremony
  const RARITY_LV = { common: 0.2, rare: 0.45, epic: 0.7, legend: 0.9, mythic: 1.1 };
  function crateBeat(kind, rarity, i, o) {
    if (!ready) return false;
    if (RARITY_LV[kind] !== undefined && (rarity === undefined || typeof rarity === 'number')) { i = rarity; rarity = kind; kind = 'reveal'; }
    const r = RARITY_LV[rarity] !== undefined ? rarity : 'common';
    const a = RARITY_LV[r], idx = Math.max(0, Math.floor(fin(i, 0)));
    o = o || {};
    switch (kind) {
      case 'shake': return sfx('crate_shake', { amt: a, seed: idx });
      case 'rise': return sfx('crate_rise', { amt: a, dur: o.dur, seed: idx });
      case 'open': case 'burst': case 'lid': return sfx('crate_lid', { seed: idx });
      case 'reveal': {
        const ok = sfx('reveal_' + r, { seed: idx });
        if (o.isNew) sfx('new_tag', {}); else if (o.isNew === false && (r === 'common' || r === 'rare')) sfx('dupe_tag', {});
        if (r === 'legend' || r === 'mythic') duck(r === 'mythic' ? 0.2 : 0.4, r === 'mythic' ? 4 : 2.4);
        return ok;
      }
      case 'new': return sfx('new_tag', { seed: idx });
      case 'dupe': return sfx('dupe_tag', { seed: idx });
      case 'tick': default: return sfx('crate_tick', { amt: a, n: idx % 9, seed: idx, pitch: 1 });
    }
  }

  // -------------------------------------------------------------------------------- housekeeping
  function setMuted(b) {
    muted = !!b;
    if (master && C) { master.gain.cancelScheduledValues(C.currentTime); master.gain.setTargetAtTime(muted ? 0 : volCurve(volume), C.currentTime, 0.03); }
  }
  function setVolume(v) {
    volume = clamp(fin(v, volume), 0, 1);
    if (master && C && !muted) { master.gain.cancelScheduledValues(C.currentTime); master.gain.setTargetAtTime(volCurve(volume), C.currentTime, 0.03); }
  }
  function update(dt) {
    if (!ready || !C) return;
    prune(C.currentTime);
    disposeDying();
    pump();
  }
  function dispose() {
    stopTimer();
    track = null; voices.length = 0; dying.length = 0;
    try { if (C && C.close && !opts.context) C.close(); } catch (e) { /* ignore */ }
    ready = false;
  }
  function getState() { return { available: !!(Ctor || opts.context), ready, muted, volume, mode: track ? track.mode : null, intensity, voices: voices.length }; }
  function getStats() { return Object.assign({ voices: voices.length, dying: dying.length }, stats); }

  const api = {
    resume, setMuted, setVolume, sfx, onEvent, mapEvent, music, stopMusic, update, setIntensity, crateBeat, duck, dispose, getState, getStats,
    getAnalyser: () => analyser,
    get available() { return !!(Ctor || opts.context); },
    debug: {
      get ctx() { return C; },
      infraCount: () => infra.length,
      pumpTo(sec) { if (!track) return; const keep = C.currentTime; pump(sec - keep, 200000); },
      setIntensityNow(v) { intensity = intensityS = clamp(fin(v, 0), 0, 1); },
    },
  };
  return api;
}
