// Clawspire -- AUDIO. Every sound is synthesised on the fly with WebAudio:
// no samples, no network. The module is lazy by design: nothing touches
// AudioContext, localStorage or navigator at load time, so it loads under
// Node, and every public call no-ops until init() has built the graph on the
// first user gesture.
//
// Graph:  sfx voices -> sfxBus ------------------------------\
//         music layer (one per mode, crossfaded) -> musBus -> duckG -> comp -> master -> destination
//
// Music is a small generative chiptune sequencer. Each mode's tune is built
// once from U.rng(U.hashStr('clawspire:' + mode)), so the same mode always
// plays the same tune, and scheduled with the usual lookahead pattern (a
// cheap timer wakes up every 25 ms and queues any 16th notes due in the next
// 120 ms on the AudioContext clock, which is sample accurate).
const AUDIO = (() => {
  const NAMES = ['clawMove', 'clawDrop', 'clawTouch', 'clawClose', 'clawLift', 'clawRelease', 'itemLand',
    'itemSlip', 'chute', 'jackpot', 'hit', 'hitBig', 'block', 'heal', 'poison', 'burn', 'freeze', 'shake',
    'enemyDie', 'playerHurt', 'win', 'lose', 'click', 'buy', 'reveal', 'brush', 'step', 'coin', 'upgrade',
    'turn', 'boss'];
  const MODES = ['off', 'title', 'map', 'fight', 'elite', 'boss', 'win'];
  const KEY = 'clawspire_audio';
  const LOOKAHEAD = 0.12;     // seconds of notes queued ahead of the clock
  const XFADE = 1.0;          // crossfade between music modes
  const MAX_VOICES = 32;      // concurrent sfx cap, protects mobile CPUs

  const S = {
    ac: null, comp: null, master: null, sfxBus: null, musBus: null, duckG: null,
    white: null, crunch: null,
    vSfx: 0.8, vMus: 0.5,
    prefs: null,              // {sfx, music}, read lazily from localStorage
    want: 'off',              // the mode the game asked for (kept while music is toggled off)
    seqs: [],                 // live sequencer instances (the current one + any fading out)
    songs: {},                // generated tunes, cached per mode
    last: {},                 // per-sfx last play time, for throttling
    ends: [],                 // end times of live sfx voices
    timer: null,
    r: U.rng(0xC1A5),         // tiny per-call variation (detune, noise offsets), deterministic
  };

  // ---------------------------------------------------------------- prefs
  function store() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  function prefs() {
    if (S.prefs) return S.prefs;
    S.prefs = { sfx: true, music: true };
    try {
      const ls = store();
      const raw = ls && ls.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          if (typeof o.sfx === 'boolean') S.prefs.sfx = o.sfx;
          if (typeof o.music === 'boolean') S.prefs.music = o.music;
        }
      }
    } catch (e) { /* corrupt or blocked storage: keep defaults */ }
    return S.prefs;
  }
  function savePrefs() {
    try {
      const ls = store();
      if (ls) ls.setItem(KEY, JSON.stringify({ sfx: prefs().sfx, music: prefs().music }));
    } catch (e) { /* private mode quota etc: the toggle still works for this session */ }
  }

  // ---------------------------------------------------------------- init
  // Builds the graph on the first call that finds an AudioContext; later calls
  // only resume a suspended context (mobile browsers suspend until a gesture).
  function init() {
    if (!S.ac) {
      const W = typeof window !== 'undefined' ? window : null;
      const C = W && (W.AudioContext || W.webkitAudioContext);
      if (!C) return false;
      let ac;
      try { ac = new C(); } catch (e) { return false; }
      try { build(ac); } catch (e) { S.ac = null; return false; }
      if (!S.timer && typeof setInterval === 'function') {
        try { S.timer = setInterval(tick, 25) || null; } catch (e) { S.timer = null; }
      }
      if (S.want !== 'off' && prefs().music) startMode(S.want);
    }
    if (S.ac.state === 'suspended' && S.ac.resume) {
      try { const p = S.ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }
    return true;
  }

  function build(ac) {
    S.ac = ac;
    const comp = ac.createDynamicsCompressor();
    setP(comp.threshold, -16); setP(comp.knee, 20); setP(comp.ratio, 4);
    setP(comp.attack, 0.004); setP(comp.release, 0.2);
    const master = ac.createGain(); setP(master.gain, 0.9);
    const sfxBus = ac.createGain(); setP(sfxBus.gain, prefs().sfx ? S.vSfx : 0);
    const musBus = ac.createGain(); setP(musBus.gain, S.vMus);
    const duckG = ac.createGain(); setP(duckG.gain, 1);
    sfxBus.connect(comp); musBus.connect(duckG); duckG.connect(comp);
    comp.connect(master); master.connect(ac.destination);
    Object.assign(S, { comp, master, sfxBus, musBus, duckG });
    // One second of white noise, plus a sample-and-hold "crunch" copy that
    // sounds bitcrushed: hits use it for grit without a WaveShaper.
    const sr = ac.sampleRate || 44100;
    const rn = U.rng(9001);
    S.white = ac.createBuffer(1, sr, sr);
    S.crunch = ac.createBuffer(1, sr, sr);
    const w = S.white.getChannelData(0), c = S.crunch.getChannelData(0);
    let hold = 0;
    for (let i = 0; i < w.length; i++) {
      w[i] = rn() * 2 - 1;
      if (i % 7 === 0) hold = rn() < 0.5 ? -1 : 1;
      c[i] = hold * (0.6 + 0.4 * w[i] * w[i]);
    }
  }

  // Sets an AudioParam (or a plain field on a minimal fake) right now.
  function setP(p, v) {
    if (!p) return;
    try { p.value = v; } catch (e) { /* read-only in some fakes */ }
  }

  const now = () => (S.ac ? S.ac.currentTime || 0 : 0);
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ---------------------------------------------------------------- voice kit
  // Percussive envelope: silence, attack to peak, exponential tail to silence.
  function env(param, t, a, peak, dur) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
    param.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
  }

  function filt(type, f, q) {
    const b = S.ac.createBiquadFilter();
    b.type = type; setP(b.frequency, f); if (q != null) setP(b.Q, q);
    return b;
  }

  /* One oscillator voice.
     s = {w: wave, f: Hz, to?: end Hz, at: offset s, dur, v: peak, a: attack,
          lp?/hp?/bp?: filter Hz, q?, vib?: [rate Hz, depth Hz], lin?: linear slide} */
  function blip(dest, t0, s) {
    const ac = S.ac, t = t0 + (s.at || 0), dur = s.dur || 0.1;
    const o = ac.createOscillator();
    o.type = s.w || 'square';
    o.frequency.setValueAtTime(s.f, t);
    if (s.to) {
      if (s.lin) o.frequency.linearRampToValueAtTime(s.to, t + dur);
      else o.frequency.exponentialRampToValueAtTime(Math.max(20, s.to), t + dur);
    }
    if (s.det) setP(o.detune, s.det);
    let head = o;
    const fType = s.lp ? 'lowpass' : s.hp ? 'highpass' : s.bp ? 'bandpass' : null;
    if (fType) { const f = filt(fType, s.lp || s.hp || s.bp, s.q); o.connect(f); head = f; }
    const g = ac.createGain();
    env(g.gain, t, s.a || 0.004, s.v == null ? 0.3 : s.v, dur);
    head.connect(g); g.connect(dest);
    if (s.vib) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.type = 'sine'; l.frequency.setValueAtTime(s.vib[0], t); setP(lg.gain, s.vib[1]);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  /* A filtered noise burst. s = {at, dur, v, a, type, f, to?, q, crunch?, rate?} */
  function hiss(dest, t0, s) {
    const ac = S.ac, t = t0 + (s.at || 0), dur = s.dur || 0.1;
    const src = ac.createBufferSource();
    src.buffer = s.crunch ? S.crunch : S.white;
    src.loop = true;
    if (s.rate) setP(src.playbackRate, s.rate);
    const f = filt(s.type || 'bandpass', s.f || 1000, s.q == null ? 0.8 : s.q);
    if (s.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, s.to), t + dur);
    const g = ac.createGain();
    env(g.gain, t, s.a || 0.002, s.v == null ? 0.3 : s.v, dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, S.r() * 0.8); src.stop(t + dur + 0.05);
    return src;
  }

  // Normalises opts.mass: accepts a small "item units" number (1 = a normal
  // item) or a raw physics body mass (px area * density, ~700 for a 30px ball).
  function massOf(o) {
    let m = +o.mass;
    if (!(m > 0)) return 1;
    if (m > 20) m = m / 700;
    return U.clamp(m, 0.15, 6);
  }

  // ---------------------------------------------------------------- sfx bank
  // Each entry: (out, t, o, p) where out is this call's gain node, t the start
  // time, o the caller's opts and p a pitch multiplier. Returns the voice's
  // length in seconds (for the voice cap).
  const BANK = {
    // Motor whir: a buzzy saw through a lowpass, pitch ramping up as it spins up.
    clawMove(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 92 * p, to: 128 * p, dur: 0.16, v: 0.16, a: 0.02, lp: 700, q: 4, vib: [38, 6] });
      blip(out, t, { w: 'square', f: 184 * p, to: 250 * p, dur: 0.14, v: 0.04, a: 0.02, lp: 1200 });
      return 0.18;
    },
    // Cable zip: a falling bandpassed noise sweep plus a descending ratchet.
    clawDrop(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 4200 * p, to: 700, q: 3, dur: 0.32, v: 0.3, a: 0.01 });
      blip(out, t, { w: 'square', f: 900 * p, to: 260 * p, dur: 0.3, v: 0.06, lp: 2400, vib: [60, 70] });
      return 0.34;
    },
    // Soft tick when the palm meets the pile.
    clawTouch(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 340 * p, to: 180 * p, dur: 0.07, v: 0.28 });
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.03, v: 0.12 });
      return 0.08;
    },
    // Metallic clack: two hard square ticks and an inharmonic ring (1 : 2.76 : 5.4, like a struck bar).
    clawClose(out, t, o, p) {
      blip(out, t, { w: 'square', f: 1900 * p, to: 700 * p, dur: 0.035, v: 0.22 });
      blip(out, t, { at: 0.03, w: 'square', f: 2500 * p, to: 900 * p, dur: 0.03, v: 0.18 });
      [1, 2.76, 5.4].forEach((k, i) => blip(out, t, { w: 'sine', f: 620 * k * p, dur: 0.22 - i * 0.05, v: 0.09 / (i + 1) }));
      hiss(out, t, { type: 'highpass', f: 5200, dur: 0.05, v: 0.2 });
      return 0.24;
    },
    // Servo: a filtered square rising in pitch with a slight wobble.
    clawLift(out, t, o, p) {
      blip(out, t, { w: 'square', f: 170 * p, to: 330 * p, dur: 0.42, v: 0.12, a: 0.03, lp: 900, q: 6, vib: [22, 9], lin: true });
      blip(out, t, { w: 'sawtooth', f: 85 * p, to: 165 * p, dur: 0.42, v: 0.06, a: 0.03, lp: 500, lin: true });
      return 0.46;
    },
    // Spring release: a catch click then a "boing" (sine with a fast decaying wobble).
    clawRelease(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 3800, dur: 0.025, v: 0.25 });
      blip(out, t, { at: 0.015, w: 'triangle', f: 420 * p, to: 260 * p, dur: 0.34, v: 0.26, vib: [26, 90] });
      return 0.38;
    },
    // Pitched thud, deeper and longer for heavier things.
    itemLand(out, t, o, p) {
      const m = massOf(o);
      const f = U.clamp(210 / Math.sqrt(m), 55, 480) * p;
      const v = 0.34 * U.clamp(o.vel == null ? 1 : o.vel, 0.15, 1.4);
      blip(out, t, { w: 'sine', f: f * 2.2, to: f, dur: 0.06 + 0.05 * Math.min(m, 3), v });
      hiss(out, t, { type: 'lowpass', f: U.clamp(f * 7, 500, 3500), dur: 0.05, v: v * 0.5 });
      if (m > 2) blip(out, t, { w: 'triangle', f: 70, to: 40, dur: 0.18, v: v * 0.8 });
      return 0.2;
    },
    // Slip: a sliding "whoop" down plus a scrape, the sound of a bad grab.
    itemSlip(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 980 * p, to: 260 * p, dur: 0.28, v: 0.18, vib: [9, 25] });
      hiss(out, t, { type: 'bandpass', f: 2600, to: 900, q: 2, dur: 0.2, v: 0.1 });
      return 0.3;
    },
    // Descending clatter down the chute, then a bright prize ding.
    chute(out, t, o, p) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const at = i * 0.045 + S.r() * 0.012;
        blip(out, t, { at, w: 'square', f: (1500 - i * 170) * p, to: (900 - i * 110) * p, dur: 0.03, v: 0.1, hp: 400 });
        hiss(out, t, { at, type: 'bandpass', f: 3000 - i * 300, q: 4, dur: 0.03, v: 0.12 });
      }
      const d = n * 0.045 + 0.03;
      blip(out, t, { at: d, w: 'sine', f: 1760 * p, dur: 0.6, v: 0.2 });
      blip(out, t, { at: d, w: 'sine', f: 2637 * p, dur: 0.45, v: 0.09 });
      blip(out, t, { at: d, w: 'triangle', f: 880 * p, dur: 0.3, v: 0.08 });
      return d + 0.6;
    },
    // Fanfare: fast major arpeggio up two octaves, then a held chord with sparkle.
    jackpot(out, t, o, p) {
      duck(1.5);
      const arp = [60, 64, 67, 72, 76, 79, 84, 88];
      arp.forEach((n, i) => blip(out, t, { at: i * 0.055, w: 'square', f: mtof(n) * p, dur: 0.1, v: 0.1, lp: 5000 }));
      const h = arp.length * 0.055;
      [72, 76, 79, 84].forEach((n) => {
        blip(out, t, { at: h, w: 'square', f: mtof(n) * p, dur: 0.7, v: 0.07, lp: 3500, vib: [6, 4] });
        blip(out, t, { at: h, w: 'triangle', f: mtof(n - 12) * p, dur: 0.8, v: 0.08 });
      });
      for (let i = 0; i < 5; i++) blip(out, t, { at: h + 0.1 + i * 0.09, w: 'sine', f: mtof(96 + (i % 3) * 3) * p, dur: 0.12, v: 0.05 });
      return h + 0.85;
    },
    // Crunchy hit: bitcrushed noise + a punchy pitch drop. More damage = lower and longer.
    hit(out, t, o, p) {
      const k = U.clamp((o.amt == null ? 6 : +o.amt || 0) / 20, 0, 1);
      hiss(out, t, { type: 'bandpass', f: (2400 - 1500 * k) * p, q: 1.2, dur: 0.07 + 0.1 * k, v: 0.32 + 0.12 * k, crunch: true });
      blip(out, t, { w: 'square', f: (340 - 150 * k) * p, to: 60, dur: 0.08 + 0.06 * k, v: 0.18, lp: 1800 });
      return 0.2;
    },
    // Big hit: sub drop, crushed noise, a low body thump.
    hitBig(out, t, o, p) {
      duck(0.35);
      blip(out, t, { w: 'sine', f: 160 * p, to: 38, dur: 0.35, v: 0.5 });
      hiss(out, t, { type: 'lowpass', f: 2600, to: 400, dur: 0.3, v: 0.45, crunch: true });
      blip(out, t, { w: 'square', f: 240 * p, to: 50, dur: 0.16, v: 0.16, lp: 1200 });
      hiss(out, t, { type: 'highpass', f: 4000, dur: 0.04, v: 0.2 });
      return 0.38;
    },
    // Shield: a bright "tink" on top of a dull thunk.
    block(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 150 * p, to: 90, dur: 0.1, v: 0.3 });
      blip(out, t, { w: 'square', f: 1320 * p, dur: 0.12, v: 0.06, hp: 900 });
      blip(out, t, { w: 'sine', f: 1980 * p, dur: 0.25, v: 0.08 });
      hiss(out, t, { type: 'highpass', f: 3500, dur: 0.05, v: 0.15 });
      return 0.28;
    },
    // Heal: a soft rising pentatonic sparkle.
    heal(out, t, o, p) {
      [72, 74, 76, 79, 81, 84].forEach((n, i) => blip(out, t, { at: i * 0.06, w: 'sine', f: mtof(n) * p, dur: 0.3, v: 0.12, a: 0.01 }));
      blip(out, t, { w: 'triangle', f: mtof(60) * p, to: mtof(67) * p, dur: 0.4, v: 0.06, a: 0.05 });
      return 0.7;
    },
    // Poison: little sine bubbles, each swooping up as it pops.
    poison(out, t, o, p) {
      for (let i = 0; i < 6; i++) {
        const f = (260 + S.r() * 380) * p;
        blip(out, t, { at: i * 0.055 + S.r() * 0.02, w: 'sine', f, to: f * 2.3, dur: 0.05, v: 0.16 });
      }
      blip(out, t, { w: 'sawtooth', f: 110 * p, dur: 0.35, v: 0.04, lp: 400, vib: [7, 12] });
      return 0.4;
    },
    // Burn: a lowpassed whoosh with dry crackle ticks scattered over it.
    burn(out, t, o, p) {
      hiss(out, t, { type: 'lowpass', f: 500, to: 1400, dur: 0.4, v: 0.18, a: 0.06 });
      for (let i = 0; i < 9; i++) {
        hiss(out, t, { at: S.r() * 0.38, type: 'highpass', f: 3000 + S.r() * 3000, dur: 0.012, v: 0.2 + S.r() * 0.15, crunch: true });
      }
      return 0.45;
    },
    // Freeze: a glassy inharmonic shimmer and a high crack.
    freeze(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 6000, dur: 0.06, v: 0.25 });
      [1, 2.32, 3.87, 5.1].forEach((k, i) => blip(out, t, {
        at: 0.02 + i * 0.03, w: 'sine', f: 1180 * k * p, dur: 0.5 - i * 0.07, v: 0.08, vib: [11 + i * 3, 8],
      }));
      blip(out, t, { w: 'triangle', f: 2400 * p, to: 3200 * p, dur: 0.25, v: 0.04 });
      return 0.55;
    },
    // Shake: a rattling cabinet, noise gated by a fast square LFO over a low rumble.
    shake(out, t, o, p) {
      const ac = S.ac;
      const gate = ac.createGain(); setP(gate.gain, 0.5);
      const l = ac.createOscillator(), lg = ac.createGain();
      l.type = 'square'; l.frequency.setValueAtTime(15, t); setP(lg.gain, 0.5);
      l.connect(lg); lg.connect(gate.gain); l.start(t); l.stop(t + 0.6);
      gate.connect(out);
      hiss(gate, t, { type: 'bandpass', f: 900, q: 0.8, dur: 0.55, v: 0.4, crunch: true });
      blip(out, t, { w: 'sine', f: 58, to: 45, dur: 0.55, v: 0.25, a: 0.03 });
      return 0.6;
    },
    // Enemy pops: a falling "bwoop" and a puff.
    enemyDie(out, t, o, p) {
      blip(out, t, { w: 'square', f: 520 * p, to: 55, dur: 0.4, v: 0.14, lp: 2400 });
      blip(out, t, { at: 0.05, w: 'triangle', f: 780 * p, to: 80, dur: 0.35, v: 0.1 });
      hiss(out, t, { at: 0.08, type: 'lowpass', f: 1800, to: 300, dur: 0.35, v: 0.22 });
      return 0.5;
    },
    // Player hurt: a sour minor-second buzz and a dull crunch.
    playerHurt(out, t, o, p) {
      duck(0.4);
      blip(out, t, { w: 'sawtooth', f: 180 * p, to: 110, dur: 0.25, v: 0.12, lp: 1400 });
      blip(out, t, { w: 'sawtooth', f: 191 * p, to: 116, dur: 0.25, v: 0.12, lp: 1400 });
      hiss(out, t, { type: 'bandpass', f: 800, dur: 0.14, v: 0.35, crunch: true });
      return 0.3;
    },
    // Victory jingle: da-da-da-DAA over a bass fifth.
    win(out, t, o, p) {
      duck(2.2);
      const mel = [[67, 0, 0.1], [67, 0.12, 0.1], [67, 0.24, 0.1], [72, 0.38, 0.7], [76, 0.38, 0.7], [79, 0.38, 0.7]];
      mel.forEach(([n, at, d]) => blip(out, t, { at, w: 'square', f: mtof(n) * p, dur: d, v: 0.09, lp: 4000, vib: at > 0.3 ? [6, 5] : null }));
      blip(out, t, { at: 0.38, w: 'triangle', f: mtof(48) * p, dur: 0.8, v: 0.22 });
      blip(out, t, { at: 0.38, w: 'triangle', f: mtof(55) * p, dur: 0.8, v: 0.12 });
      return 1.2;
    },
    // Defeat: a sad descending trombone, three notes with a droopy vibrato.
    lose(out, t, o, p) {
      duck(2.4);
      [[64, 0], [63, 0.35], [62, 0.7]].forEach(([n, at]) => blip(out, t, { at, w: 'sawtooth', f: mtof(n - 12) * p, dur: 0.32, v: 0.12, lp: 1100, a: 0.03 }));
      blip(out, t, { at: 1.05, w: 'sawtooth', f: mtof(49) * p, to: mtof(46) * p, dur: 0.9, v: 0.12, lp: 900, a: 0.03, vib: [5, 6] });
      return 2.0;
    },
    // UI click: one crisp tick.
    click(out, t, o, p) {
      blip(out, t, { w: 'square', f: 1250 * p, to: 900 * p, dur: 0.03, v: 0.12, lp: 5000 });
      return 0.05;
    },
    // Cha-ching.
    buy(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 5000, dur: 0.08, v: 0.2 });
      blip(out, t, { at: 0.04, w: 'square', f: mtof(83) * p, dur: 0.08, v: 0.08 });
      blip(out, t, { at: 0.11, w: 'square', f: mtof(88) * p, dur: 0.3, v: 0.08, vib: [8, 6] });
      blip(out, t, { at: 0.11, w: 'sine', f: mtof(100) * p, dur: 0.25, v: 0.05 });
      return 0.42;
    },
    // Ink splat on the map: a wet low "blop" and a lowpass smear.
    reveal(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 320 * p, to: 110, dur: 0.14, v: 0.3 });
      hiss(out, t, { type: 'lowpass', f: 2200, to: 260, q: 2, dur: 0.22, v: 0.3 });
      blip(out, t, { at: 0.08, w: 'sine', f: 520 * p, to: 700 * p, dur: 0.05, v: 0.08 });
      return 0.26;
    },
    // Brush: a bristly swish rising, then a bigger splat.
    brush(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 900, to: 4200, q: 1.5, dur: 0.24, v: 0.25, a: 0.08 });
      hiss(out, t, { at: 0.22, type: 'lowpass', f: 1800, to: 200, q: 2, dur: 0.3, v: 0.35 });
      blip(out, t, { at: 0.22, w: 'sine', f: 260 * p, to: 80, dur: 0.2, v: 0.3 });
      return 0.55;
    },
    // Map hop: a small wooden knock.
    step(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 210 * p, to: 120, dur: 0.07, v: 0.25 });
      hiss(out, t, { type: 'bandpass', f: 1800, q: 3, dur: 0.025, v: 0.1 });
      return 0.09;
    },
    // Classic coin: B then E.
    coin(out, t, o, p) {
      blip(out, t, { w: 'square', f: 988 * p, dur: 0.06, v: 0.08 });
      blip(out, t, { at: 0.06, w: 'square', f: 1319 * p, dur: 0.22, v: 0.08 });
      return 0.3;
    },
    // Power-up: a vibrato square sweeping up through an arpeggio.
    upgrade(out, t, o, p) {
      [60, 64, 67, 71, 72, 76, 79, 83, 84].forEach((n, i) => blip(out, t, { at: i * 0.04, w: 'square', f: mtof(n) * p, dur: 0.07, v: 0.07, lp: 4500 }));
      blip(out, t, { at: 0.36, w: 'triangle', f: mtof(84) * p, dur: 0.45, v: 0.12, vib: [9, 14] });
      return 0.85;
    },
    // Turn banner: an airy whoosh and a two-note chime.
    turn(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 600, to: 3000, q: 1, dur: 0.22, v: 0.12, a: 0.1 });
      blip(out, t, { at: 0.1, w: 'triangle', f: mtof(76) * p, dur: 0.15, v: 0.14 });
      blip(out, t, { at: 0.2, w: 'triangle', f: mtof(81) * p, dur: 0.3, v: 0.14 });
      return 0.5;
    },
    // Boss arrives: a low tritone cluster with slow tremolo and a gong-ish strike.
    boss(out, t, o, p) {
      duck(2.5);
      [33, 39, 40].forEach((n) => blip(out, t, { w: 'sawtooth', f: mtof(n) * p, dur: 2.0, v: 0.12, a: 0.15, lp: 600, vib: [3, 1.5] }));
      [1, 1.48, 2.1, 2.9].forEach((k, i) => blip(out, t, { w: 'sine', f: 98 * k * p, dur: 1.8 - i * 0.3, v: 0.1 / (i + 1) }));
      hiss(out, t, { type: 'lowpass', f: 900, to: 120, dur: 1.2, v: 0.3 });
      return 2.1;
    },
  };

  // Minimum spacing per sfx so per-frame callers (contacts, steering) do not stack.
  const GAP = { clawMove: 0.1, clawTouch: 0.08, itemLand: 0.035, itemSlip: 0.08, hit: 0.03, click: 0.03,
    step: 0.05, coin: 0.04, poison: 0.05, burn: 0.05, freeze: 0.05, block: 0.03, heal: 0.05 };
  const LEVEL = { clawMove: 0.7, clawLift: 0.8, itemLand: 0.9, boss: 1.1, jackpot: 1.1, hitBig: 1.1 };

  /* Plays a named effect. opts: {vol, pitch, mass (itemLand), vel (itemLand
     impact 0..1), amt (hit damage)}. Returns true when something was queued. */
  function sfx(name, opts) {
    if (!S.ac || !prefs().sfx) return false;
    const fn = BANK[name];
    if (!fn) return false;
    const o = opts || {};
    const t = now() + 0.005;
    const gap = GAP[name] || 0.015;
    if (S.last[name] != null && t - S.last[name] < gap) return false;
    // Prune finished voices, then refuse if we are at the cap.
    S.ends = S.ends.filter((e) => e > t);
    if (S.ends.length >= MAX_VOICES) return false;
    S.last[name] = t;
    try {
      const out = S.ac.createGain();
      setP(out.gain, (LEVEL[name] || 1) * U.clamp(o.vol == null ? 1 : +o.vol || 0, 0, 2));
      out.connect(S.sfxBus);
      const p = U.clamp(o.pitch == null ? 1 : +o.pitch || 1, 0.25, 4) * (1 + (S.r() - 0.5) * 0.03);
      const len = fn(out, t, o, p) || 0.3;
      S.ends.push(t + len);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Dips the music under a big moment and brings it back.
  function duck(seconds, depth) {
    if (!S.ac || !S.duckG) return;
    const t = now(), g = S.duckG.gain;
    const hold = U.clamp(+seconds || 0.5, 0.05, 10);
    try {
      if (g.cancelScheduledValues) g.cancelScheduledValues(t);
      g.setValueAtTime(g.value == null ? 1 : g.value, t);
      g.linearRampToValueAtTime(U.clamp(depth == null ? 0.3 : depth, 0, 1), t + 0.05);
      g.setValueAtTime(U.clamp(depth == null ? 0.3 : depth, 0, 1), t + hold);
      g.linearRampToValueAtTime(1, t + hold + 0.5);
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- composer
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11],
  };
  // Per-mode feel. root is the bass register (MIDI). prog pools are scale
  // degrees (0-based), one chord per bar.
  const CFG = {
    title: { bpm: 76, root: 38, scale: 'lydian', bass: 'long', lead: 'dreamy', hat: 'soft', drums: 'none',
      wave: 'triangle', bassWave: 'triangle', stab: 0.45, swing: 0, vol: 0.9, leadUp: 36,
      prog: [[0, 4, 5, 3], [0, 1, 4, 0], [5, 3, 0, 4], [0, 2, 3, 1]] },
    map: { bpm: 100, root: 45, scale: 'dorian', bass: 'walk', lead: 'pluck', hat: 'off', drums: 'light',
      wave: 'square', bassWave: 'triangle', stab: 0.3, swing: 0.22, vol: 0.85, leadUp: 24,
      prog: [[0, 3, 0, 4], [0, 6, 3, 4], [0, 2, 3, 6], [3, 0, 6, 4]] },
    fight: { bpm: 138, root: 40, scale: 'minor', bass: 'drive', lead: 'riff', hat: '16', drums: 'rock',
      wave: 'square', bassWave: 'square', stab: 0.3, swing: 0, vol: 0.8, leadUp: 24,
      prog: [[0, 5, 6, 0], [0, 3, 6, 4], [0, 5, 3, 4], [5, 6, 0, 0]] },
    elite: { bpm: 152, root: 38, scale: 'phrygian', bass: 'pedal', lead: 'tense', hat: '16', drums: 'four',
      wave: 'sawtooth', bassWave: 'square', stab: 0.4, swing: 0, vol: 0.75, leadUp: 24,
      prog: [[0, 1, 0, 6], [0, 0, 1, 1], [0, 5, 1, 0], [0, 3, 1, 6]] },
    boss: { bpm: 146, root: 33, scale: 'harm', bass: 'drive', lead: 'riff', hat: '16', drums: 'rock',
      wave: 'sawtooth', bassWave: 'sawtooth', stab: 0.6, swing: 0, vol: 0.8, leadUp: 24, drop: true,
      prog: [[0, 5, 1, 4], [0, 3, 4, 4], [0, 5, 6, 4], [0, 1, 5, 4]] },
    win: { bpm: 128, root: 36, scale: 'major', bass: 'bounce', lead: 'fanfare', hat: '8', drums: 'four',
      wave: 'square', bassWave: 'triangle', stab: 0.5, swing: 0, vol: 0.85, leadUp: 24,
      prog: [[0, 3, 4, 0], [0, 5, 3, 4], [3, 4, 0, 0], [0, 4, 5, 3]] },
  };
  const BAR = 16;              // 16th-note steps per bar
  const PHRASE = 4;            // bars per phrase (one progression)

  // Scale degree -> semitones (degree may be negative or past an octave).
  function deg2semi(scale, d) {
    const n = scale.length, i = ((d % n) + n) % n;
    return scale[i] + 12 * Math.floor(d / n);
  }

  /* Lead motif: two bars of {s: step 0..31, r: degree relative to the chord
     root, d: length in steps}. Rhythm density and interval habits depend on
     the lead style; pitches are a biased random walk over chord-relative
     degrees so the melody follows the progression. */
  function motif(rng, style) {
    const dens = {
      dreamy: [0.85, 0.2, 0, 0], pluck: [0.8, 0.55, 0.25, 0.12], riff: [0.9, 0.7, 0.5, 0.25],
      tense: [0.8, 0.5, 0.55, 0.35], heavy: [0.85, 0.35, 0.1, 0], fanfare: [0.95, 0.8, 0.6, 0.4],
    }[style];
    const out = [];
    let r = rng.pick([0, 2, 4]);
    for (let s = 0; s < 32; s++) {
      // strength: 0 quarter, 1 eighth, 2 sixteenth on the 'e', 3 on the 'a'
      const lvl = s % 4 === 0 ? (s % 8 === 0 ? 0 : 1) : s % 2 === 0 ? 1 : (s % 4 === 1 ? 2 : 3);
      const pBase = style === 'dreamy' ? (s % 8 === 0 ? dens[0] : s % 4 === 0 ? dens[1] : 0) : dens[lvl];
      if (s !== 0 && !rng.chance(pBase)) continue;
      if (style === 'fanfare') {
        r = [0, 2, 4, 7, 9, 11][(out.length) % 6] - (out.length % 12 >= 6 ? 7 : 0);
      } else if (lvl === 0 && style !== 'tense') {
        r = rng.pick([0, 2, 4, 7]);                       // chord tones on the beat
      } else {
        const leap = style === 'tense' ? rng.pick([-1, 1, -1, 1, 3, -4, 4]) : rng.pick([-1, 1, -1, 1, -2, 2, 0]);
        r = U.clamp(r + leap, -3, 9);
      }
      out.push({ s, r, d: 1 });
    }
    // Each note lasts until the next one starts (capped by style), for a legato line.
    const cap = { dreamy: 14, pluck: 2, riff: 3, tense: 2, heavy: 8, fanfare: 2 }[style];
    for (let i = 0; i < out.length; i++) {
      const next = i + 1 < out.length ? out[i + 1].s : 32;
      out[i].d = Math.max(1, Math.min(cap, next - out[i].s));
    }
    return out;
  }

  // Answer phrase: keep the first bar, regenerate the second (call and response).
  function answer(rng, m, style) {
    const alt = motif(rng, style).filter((e) => e.s >= 16);
    return m.filter((e) => e.s < 16).concat(alt);
  }

  function push(steps, i, ev) { if (i >= 0 && i < steps.length) steps[i].push(ev); }

  /* Builds a whole tune for a mode: 2 sections x 2 phrases x 4 bars = 16 bars.
     For boss, the second section is a half-time drop. */
  function compose(mode) {
    const c = CFG[mode];
    const rng = U.rng(U.hashStr('clawspire:' + mode));
    const scale = SCALES[c.scale];
    const bars = 16, len = bars * BAR;
    const steps = [];
    for (let i = 0; i < len; i++) steps.push([]);
    const progA = rng.pick(c.prog);
    let progB = rng.pick(c.prog);
    if (progB === progA) progB = c.prog[(c.prog.indexOf(progA) + 1) % c.prog.length];
    const kickPat = rng.pick([[0, 8], [0, 6, 8], [0, 8, 10], [0, 7, 10]]);
    const secs = [
      { prog: progA, m: motif(rng, c.lead), half: false },
      { prog: progB, m: motif(rng, c.drop ? 'heavy' : c.lead), half: !!c.drop },
    ];
    secs.forEach((sec) => { sec.ans = answer(rng, sec.m, c.drop && sec.half ? 'heavy' : c.lead); });

    for (let b = 0; b < bars; b++) {
      const sec = secs[b < 8 ? 0 : 1];
      const inPhrase = b % PHRASE;
      const chord = sec.prog[inPhrase];
      const nextChord = sec.prog[(inPhrase + 1) % PHRASE];
      const base = b * BAR;
      const croot = c.root + deg2semi(scale, chord);
      const tone = (rel, oct) => c.root + oct + deg2semi(scale, chord + rel);
      const half = sec.half;
      const last = b % 8 === 7;

      // ---- bass
      const bassStyle = half ? 'half' : c.bass;
      if (bassStyle === 'long') {
        push(steps, base, { v: 'bass', n: croot, d: 8, g: 0.9 });
        push(steps, base + 8, { v: 'bass', n: tone(rng.pick([4, 2, 0]), 0), d: 8, g: 0.7 });
      } else if (bassStyle === 'walk') {
        const nr = deg2semi(scale, nextChord);
        const walk = [croot, tone(2, 0), tone(4, 0), c.root + nr + (rng.chance(0.5) ? 1 : -1)];
        walk.forEach((n, i) => push(steps, base + i * 4, { v: 'bass', n, d: 3, g: i === 0 ? 1 : 0.8 }));
      } else if (bassStyle === 'drive') {
        for (let s = 0; s < BAR; s += 2) {
          const oct = s % 4 === 2 && rng.chance(0.35) ? 12 : 0;
          const n = s === 14 && rng.chance(0.5) ? tone(4, 0) : croot + oct;
          push(steps, base + s, { v: 'bass', n, d: 1.6, g: s % 4 === 0 ? 1 : 0.75 });
        }
      } else if (bassStyle === 'pedal') {
        for (let s = 0; s < BAR; s++) {
          const n = (s % 8 === 7 && rng.chance(0.6)) ? croot + 1 : croot;
          push(steps, base + s, { v: 'bass', n, d: 0.8, g: s % 4 === 0 ? 1 : 0.55 });
        }
      } else if (bassStyle === 'bounce') {
        for (let s = 0; s < BAR; s += 2) push(steps, base + s, { v: 'bass', n: croot + (s % 4 === 2 ? 12 : 0), d: 1.5, g: 0.85 });
      } else if (bassStyle === 'half') {
        push(steps, base, { v: 'bass', n: croot - 12, d: 6, g: 1.1 });
        if (rng.chance(0.6)) push(steps, base + 6, { v: 'bass', n: croot - 12, d: 2, g: 0.8 });
        push(steps, base + 10, { v: 'bass', n: tone(rng.pick([4, 0, 6]), -12), d: 5, g: 0.9 });
      }

      // ---- lead (motif, answer, motif, cadence)
      const pair = b % 8;
      const src = pair < 2 ? sec.m : pair < 4 ? sec.ans : pair < 6 ? sec.m : sec.ans;
      const off = (pair % 2) * 16;
      const up = half ? 12 : c.leadUp;
      for (const e of src) {
        if (e.s < off || e.s >= off + 16) continue;
        if (last && e.s - off >= 12) continue;             // leave room for the cadence note
        push(steps, base + e.s - off, { v: 'lead', n: tone(e.r, up), d: e.d, g: 0.8 + (e.s % 4 === 0 ? 0.2 : 0) });
      }
      if (last) push(steps, base + 12, { v: 'lead', n: tone(0, up), d: 4, g: 1 });

      // ---- drums
      const hatMode = half ? '8' : c.hat;
      for (let s = 0; s < BAR; s++) {
        let hv = 0;
        if (hatMode === 'soft') hv = s % 8 === 4 ? 0.6 : (s % 2 === 0 && rng.chance(0.15) ? 0.3 : 0);
        else if (hatMode === 'off') hv = s % 4 === 2 ? 0.8 : (s % 4 === 0 ? 0.25 : 0);
        else if (hatMode === '16') hv = s % 4 === 2 ? 0.8 : s % 2 === 0 ? 0.45 : 0.3;
        else if (hatMode === '8') hv = s % 2 === 0 ? (s % 4 === 2 ? 0.8 : 0.4) : 0;
        if (hv) push(steps, base + s, { v: 'hat', g: hv, open: hatMode !== '16' && s % 8 === 6 && rng.chance(0.3) });
      }
      const drums = half ? 'half' : c.drums;
      if (drums === 'light') {
        push(steps, base, { v: 'kick', g: 0.55 });
        push(steps, base + 8, { v: 'kick', g: 0.4 });
      } else if (drums === 'rock') {
        kickPat.forEach((s) => push(steps, base + s, { v: 'kick', g: s === 0 ? 1 : 0.8 }));
        push(steps, base + 4, { v: 'snare', g: 0.9 });
        push(steps, base + 12, { v: 'snare', g: 1 });
        if (last) { push(steps, base + 14, { v: 'snare', g: 0.6 }); push(steps, base + 15, { v: 'snare', g: 0.8 }); }
      } else if (drums === 'four') {
        for (let s = 0; s < BAR; s += 4) push(steps, base + s, { v: 'kick', g: 0.9 });
        push(steps, base + 12, { v: 'snare', g: mode === 'elite' ? 0.9 : 0.7 });
        if (mode !== 'elite') push(steps, base + 4, { v: 'snare', g: 0.7 });
      } else if (drums === 'half') {
        push(steps, base, { v: 'kick', g: 1.1 });
        if (rng.chance(0.5)) push(steps, base + 10, { v: 'kick', g: 0.8 });
        push(steps, base + 8, { v: 'snare', g: 1.1 });
      }

      // ---- chord stab (always on the downbeat of a boss drop bar)
      if (half || rng.chance(c.stab)) {
        const at = half ? 0 : rng.pick([0, 6, 10, 14]);
        push(steps, base + at, { v: 'stab', ns: [tone(0, 12), tone(2, 12), tone(4, 12)], d: half ? 6 : 2, g: half ? 1.2 : 1 });
      }
    }
    return { mode, bpm: c.bpm, stepDur: 60 / c.bpm / 4, swing: c.swing, len, bars, steps, cfg: c };
  }

  function song(mode) {
    if (!CFG[mode]) return null;
    return S.songs[mode] || (S.songs[mode] = compose(mode));
  }

  // ---------------------------------------------------------------- music voices
  function playEvent(inst, ev, t) {
    const c = inst.song.cfg, sd = inst.song.stepDur, dest = inst.layer;
    const g = (ev.g || 1) * c.vol;
    switch (ev.v) {
      case 'bass':
        blip(dest, t, { w: c.bassWave, f: mtof(ev.n), dur: ev.d * sd, v: 0.3 * g, a: 0.006, lp: c.bassWave === 'triangle' ? 3000 : 700, q: 3 });
        break;
      case 'lead':
        blip(dest, t, { w: c.wave, f: mtof(ev.n), dur: ev.d * sd * 0.95, v: (c.wave === 'triangle' ? 0.15 : 0.08) * g,
          a: c.lead === 'dreamy' ? 0.06 : 0.006, lp: c.wave === 'sawtooth' ? 2600 : 5000,
          vib: ev.d * sd > 0.3 ? [5.5, mtof(ev.n) * 0.008] : null });
        break;
      case 'hat':
        hiss(dest, t, { type: 'highpass', f: 7000, q: 0.7, dur: ev.open ? 0.14 : 0.035, v: 0.09 * g });
        break;
      case 'kick':
        blip(dest, t, { w: 'sine', f: 150, to: 42, dur: 0.18, v: 0.55 * g, a: 0.002 });
        break;
      case 'snare':
        hiss(dest, t, { type: 'bandpass', f: 1900, q: 0.7, dur: 0.12, v: 0.22 * g, crunch: true });
        blip(dest, t, { w: 'triangle', f: 220, to: 150, dur: 0.07, v: 0.12 * g });
        break;
      case 'stab':
        for (const n of ev.ns) blip(dest, t, { w: 'square', f: mtof(n), dur: ev.d * sd, v: 0.045 * g, a: 0.004, lp: 1800 });
        break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- sequencer
  function newLayer(t) {
    const g = S.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + XFADE);
    g.connect(S.musBus);
    return g;
  }

  // Fades out every live sequencer; they keep playing until the fade ends.
  function fadeAll(dur) {
    const t = now();
    for (const q of S.seqs) {
      if (q.fadeEnd != null) continue;
      const gg = q.layer.gain;
      try {
        if (gg.cancelScheduledValues) gg.cancelScheduledValues(t);
        gg.setValueAtTime(Math.max(0.0001, gg.value == null ? 1 : gg.value), t);
        gg.linearRampToValueAtTime(0.0001, t + dur);
      } catch (e) { /* ignore */ }
      q.fadeEnd = t + dur + 0.05;
    }
  }

  function startMode(mode) {
    fadeAll(XFADE);
    if (!S.ac || mode === 'off' || !CFG[mode]) return;
    const t = now() + 0.05;
    S.seqs.push({ mode, song: song(mode), layer: newLayer(t), step: 0, next: t, fadeEnd: null });
    tick();
  }

  // Scheduler: queue every step due within LOOKAHEAD, drop faded-out layers.
  function tick() {
    if (!S.ac) return 0;
    const t = now();
    let queued = 0;
    for (let i = S.seqs.length - 1; i >= 0; i--) {
      const q = S.seqs[i];
      if (q.fadeEnd != null && t >= q.fadeEnd) {
        try { q.layer.disconnect(); } catch (e) { /* ignore */ }
        S.seqs.splice(i, 1);
        continue;
      }
      // A backgrounded tab throttles timers: skip what we missed instead of a burst.
      if (q.next < t - 0.2) q.next = t + 0.02;
      const sd = q.song.stepDur;
      while (q.next < t + LOOKAHEAD) {
        if (q.fadeEnd != null && q.next >= q.fadeEnd) break;
        const at = q.next + (q.step % 2 === 1 ? q.song.swing * sd : 0);
        for (const ev of q.song.steps[q.step]) {
          try { playEvent(q, ev, at); queued++; } catch (e) { /* one bad note never kills the loop */ }
        }
        q.step = (q.step + 1) % q.song.len;
        q.next += sd;
      }
    }
    return queued;
  }

  /* Switches the music mode with a ~1 s crossfade. Before init (or with music
     toggled off) the request is remembered and starts when possible. */
  function music(mode) {
    if (MODES.indexOf(mode) < 0) mode = 'off';
    if (mode === S.want && (mode === 'off' || S.seqs.some((q) => q.mode === mode && q.fadeEnd == null))) return;
    S.want = mode;
    if (!S.ac || !prefs().music) return;
    startMode(mode);
  }

  // ---------------------------------------------------------------- settings
  function setVolume(sfxV, musV) {
    if (sfxV != null && isFinite(+sfxV)) S.vSfx = U.clamp(+sfxV, 0, 1);
    if (musV != null && isFinite(+musV)) S.vMus = U.clamp(+musV, 0, 1);
    applyVol();
    return { sfx: S.vSfx, music: S.vMus };
  }

  function applyVol() {
    if (!S.ac) return;
    const t = now();
    try {
      S.sfxBus.gain.setTargetAtTime(prefs().sfx ? S.vSfx : 0, t, 0.02);
      S.musBus.gain.setTargetAtTime(S.vMus, t, 0.05);
    } catch (e) { /* ignore */ }
  }

  function setSfx(on) {
    prefs().sfx = !!on; savePrefs(); applyVol();
    return prefs().sfx;
  }
  function setMusic(on) {
    prefs().music = !!on; savePrefs();
    if (S.ac) {
      if (prefs().music) { if (S.want !== 'off') startMode(S.want); } else fadeAll(0.4);
    }
    return prefs().music;
  }

  // Phone buzz. 'tap' 10 ms, 'hit' 30 ms, 'hurt' 45 ms, 'jackpot' a pattern, 'boss' a long rumble.
  const BUZZ = { tap: 10, hit: 30, hurt: 45, jackpot: [30, 40, 30, 40, 90], boss: [80, 60, 140] };
  function haptic(kind) {
    const pat = BUZZ[kind];
    if (pat == null) return false;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : (typeof window !== 'undefined' ? window.navigator : null);
      if (!nav || typeof nav.vibrate !== 'function') return false;
      nav.vibrate(pat);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    init, sfx, music, setVolume, duck, haptic,
    names: NAMES.slice(), modes: MODES.slice(),
    get ready() { return !!S.ac; },
    get mode() { return S.want; },
    get volume() { return { sfx: S.vSfx, music: S.vMus }; },
    get sfxOn() { return prefs().sfx; },
    get musicOn() { return prefs().music; },
    toggleSfx() { return setSfx(!prefs().sfx); },
    toggleMusic() { return setMusic(!prefs().music); },
    // true when both channels are off; assigning sets both.
    get muted() { return !prefs().sfx && !prefs().music; },
    set muted(v) { setSfx(!v); setMusic(!v); },
    // test hooks
    _tick: tick,
    _song: song,
    _live: () => S.seqs.map((q) => ({ mode: q.mode, fading: q.fadeEnd != null })),
  };
})();
