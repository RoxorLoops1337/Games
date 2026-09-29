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
    'turn', 'boss',
    // the juice pass
    'proc', 'combo', 'crit', 'shatter', 'tick', 'cardFlip', 'relic', 'footstep', 'bloom', 'heartbeat', 'whoosh', 'stamp', 'victory'];
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
    // round 3, dynamic fight music: the layers the game wants on (musicState),
    // the clock time a switched-off layer stops being scheduled (its fade
    // tail), and the per-mode layer tunes.
    lay: { hype: false, tense: false },
    layT: { hype: -1, tense: -1 },
    lsongs: {},
    // round 6, per-act music: the act biome the game is in (0 = none: the
    // base tunes), which picks the map and fight variants (ACT_CFG).
    act: 0,
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
    const master = ac.createGain(); setP(master.gain, 0.9 * (S.vMaster == null ? 1 : S.vMaster));   // round 6: the settings' master volume
    const sfxBus = ac.createGain(); setP(sfxBus.gain, prefs().sfx ? S.vSfx : 0);
    const musBus = ac.createGain(); setP(musBus.gain, S.vMus);
    const duckG = ac.createGain(); setP(duckG.gain, 1);
    sfxBus.connect(comp); musBus.connect(duckG); duckG.connect(comp);
    // MIX (round 10): the minor sfx (ui, soft, mid tiers) ride their own
    // gain into the sfx bus so a big sting can duck them, and a brick-wall
    // limiter after the master gain catches whatever still stacks up.
    const minorG = ac.createGain(); setP(minorG.gain, 1);
    minorG.connect(sfxBus);
    const lim = mixLimiter(ac);
    comp.connect(master);
    if (lim) { master.connect(lim); lim.connect(ac.destination); } else master.connect(ac.destination);
    Object.assign(S, { comp, master, sfxBus, musBus, duckG, minorG, lim });
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

  Object.assign(BANK, {
    // A relic or synergy fires: a quick two-note glass ping, pitched by opts.tier.
    proc(out, t, o, p) {
      const up = U.clamp(+o.tier || 0, 0, 3) * 2;
      blip(out, t, { w: 'triangle', f: mtof(84 + up) * p, dur: 0.09, v: 0.12 });
      blip(out, t, { at: 0.06, w: 'sine', f: mtof(91 + up) * p, dur: 0.22, v: 0.1, vib: [9, 7] });
      hiss(out, t, { type: 'highpass', f: 6000, dur: 0.04, v: 0.08 });
      return 0.3;
    },
    // A named combo: a rising stab, bigger with opts.tier (1..3). Tier 3 adds
    // a sub drop, a cymbal swell and a held major chord.
    combo(out, t, o, p) {
      const tier = U.clamp(Math.round(+o.tier || 1), 1, 3);
      duck(0.4 + tier * 0.35);
      const arp = tier === 1 ? [67, 71, 74] : tier === 2 ? [64, 67, 71, 76, 79] : [60, 64, 67, 72, 76, 79, 84];
      arp.forEach((n, i) => blip(out, t, { at: i * 0.045, w: 'square', f: mtof(n) * p, dur: 0.09, v: 0.09, lp: 5200 }));
      const h = arp.length * 0.045;
      blip(out, t, { at: h, w: 'sawtooth', f: mtof(arp[arp.length - 1]) * p, dur: 0.25 + tier * 0.15, v: 0.07, lp: 3000, vib: [7, 6] });
      hiss(out, t, { at: 0, type: 'bandpass', f: 800, to: 5000, q: 1, dur: h + 0.1, v: 0.08 + tier * 0.03, a: h });
      if (tier >= 2) blip(out, t, { at: h, w: 'triangle', f: mtof(arp[0] - 12) * p, dur: 0.5, v: 0.14 });
      if (tier >= 3) {
        blip(out, t, { w: 'sine', f: 130, to: 35, dur: 0.5, v: 0.4 });
        [0, 4, 7, 12].forEach((k) => blip(out, t, { at: h + 0.05, w: 'square', f: mtof(72 + k) * p, dur: 0.8, v: 0.05, lp: 3500, vib: [6, 5] }));
        hiss(out, t, { at: h, type: 'highpass', f: 5000, dur: 0.8, v: 0.12 });
        return h + 0.9;
      }
      return h + 0.45;
    },
    // A crushing hit: the hitBig body plus a bright metallic crack on top.
    crit(out, t, o, p) {
      duck(0.35);
      blip(out, t, { w: 'sine', f: 190 * p, to: 34, dur: 0.4, v: 0.5 });
      hiss(out, t, { type: 'lowpass', f: 3200, to: 380, dur: 0.32, v: 0.45, crunch: true });
      [1, 2.76, 5.4].forEach((k, i) => blip(out, t, { w: 'square', f: 900 * k * p, to: 500 * k * p, dur: 0.12 - i * 0.02, v: 0.07 }));
      hiss(out, t, { type: 'highpass', f: 5000, dur: 0.07, v: 0.28 });
      return 0.42;
    },
    // Glass or ice breaking: a crack and a shower of tiny high tinkles.
    shatter(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.12, v: 0.3, crunch: true });
      for (let i = 0; i < 8; i++) blip(out, t, { at: 0.02 + S.r() * 0.25, w: 'sine', f: (2600 + S.r() * 2400) * p, dur: 0.06, v: 0.06 });
      blip(out, t, { w: 'triangle', f: 700 * p, to: 200, dur: 0.1, v: 0.12 });
      return 0.35;
    },
    // Counter roll tick: tiny and dry, pitched by opts.pitch.
    tick(out, t, o, p) {
      blip(out, t, { w: 'square', f: 1850 * p, dur: 0.018, v: 0.05, lp: 6000 });
      return 0.03;
    },
    // A card dealt face up: a papery flick.
    cardFlip(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2600 * p, to: 5200 * p, q: 1.5, dur: 0.07, v: 0.22 });
      blip(out, t, { at: 0.05, w: 'triangle', f: 520 * p, to: 380 * p, dur: 0.04, v: 0.06 });
      return 0.12;
    },
    // Relic reveal: a shimmering swell into a bright chord.
    relic(out, t, o, p) {
      duck(1.4);
      hiss(out, t, { type: 'bandpass', f: 1500, to: 7000, q: 2, dur: 0.6, v: 0.1, a: 0.5 });
      [0, 4, 7, 11, 14].forEach((k, i) => blip(out, t, { at: 0.5 + i * 0.03, w: 'triangle', f: mtof(72 + k) * p, dur: 0.9, v: 0.07, vib: [5, 4] }));
      for (let i = 0; i < 6; i++) blip(out, t, { at: 0.55 + i * 0.07, w: 'sine', f: mtof(96 + (i % 3) * 4) * p, dur: 0.1, v: 0.04 });
      return 1.5;
    },
    // A crawler's footstep on the map: a soft scuff.
    footstep(out, t, o, p) {
      hiss(out, t, { type: 'lowpass', f: 900 * p, to: 300, dur: 0.06, v: 0.14 });
      blip(out, t, { w: 'sine', f: 120 * p, to: 70, dur: 0.05, v: 0.12 });
      return 0.08;
    },
    // A hex blooming into light: a soft airy chime (opts.pitch walks it up).
    bloom(out, t, o, p) {
      blip(out, t, { w: 'sine', f: mtof(79) * p, dur: 0.35, v: 0.06, a: 0.02 });
      blip(out, t, { w: 'sine', f: mtof(86) * p, dur: 0.25, v: 0.03, a: 0.02 });
      hiss(out, t, { type: 'highpass', f: 7000, dur: 0.12, v: 0.03, a: 0.03 });
      return 0.36;
    },
    // Low hp: a muffled lub-dub.
    heartbeat(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 62 * p, to: 44, dur: 0.12, v: 0.4 });
      blip(out, t, { at: 0.2, w: 'sine', f: 55 * p, to: 40, dur: 0.14, v: 0.3 });
      return 0.38;
    },
    // Something flying fast: an air whoosh (a slip, a thrown prize).
    whoosh(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 600 * p, to: 2600 * p, q: 1.8, dur: 0.22, v: 0.18, a: 0.08 });
      return 0.24;
    },
    // A rubber stamp slamming down (SOLD): thud plus a papery slap.
    stamp(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 140 * p, to: 60, dur: 0.12, v: 0.4 });
      hiss(out, t, { type: 'bandpass', f: 1400, dur: 0.06, v: 0.3, crunch: true });
      return 0.16;
    },
    // The last enemy falls: a rising gliss into a bright hit (the slow-mo sting).
    victory(out, t, o, p) {
      duck(1.2);
      blip(out, t, { w: 'square', f: mtof(60) * p, to: mtof(84) * p, dur: 0.5, v: 0.06, lp: 4000, lin: true });
      hiss(out, t, { type: 'bandpass', f: 500, to: 6000, q: 1, dur: 0.5, v: 0.12, a: 0.4 });
      [72, 76, 79, 84].forEach((n) => blip(out, t, { at: 0.5, w: 'triangle', f: mtof(n) * p, dur: 0.6, v: 0.08 }));
      blip(out, t, { at: 0.5, w: 'sine', f: 110, to: 45, dur: 0.4, v: 0.35 });
      return 1.1;
    },
  });

  // Minimum spacing per sfx so per-frame callers (contacts, steering) do not stack.
  const GAP = { clawMove: 0.1, clawTouch: 0.08, itemLand: 0.035, itemSlip: 0.08, hit: 0.03, click: 0.03,
    step: 0.05, coin: 0.04, poison: 0.05, burn: 0.05, freeze: 0.05, block: 0.03, heal: 0.05,
    proc: 0.06, tick: 0.035, cardFlip: 0.05, footstep: 0.06, bloom: 0.07, heartbeat: 0.5, whoosh: 0.06, crit: 0.05, shatter: 0.05 };
  const LEVEL = { clawMove: 0.7, clawLift: 0.8, itemLand: 0.9, boss: 1.1, jackpot: 1.1, hitBig: 1.1, crit: 1.1, combo: 1.05, tick: 0.8, bloom: 0.8 };

  // ---------------------------------------------------------------- loot
  // Prize capsules, tickets and the payout tally (DESIGN.md "Loot").
  Object.assign(BANK, {
    // A capsule drops onto the pedestal: a hollow plastic thunk and a boing.
    capDrop(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 190 * p, to: 70, dur: 0.14, v: 0.4 });
      hiss(out, t, { type: 'bandpass', f: 900, dur: 0.05, v: 0.18 });
      blip(out, t, { at: 0.08, w: 'triangle', f: 320 * p, to: 520 * p, dur: 0.18, v: 0.12, vib: [18, 30] });
      return 0.3;
    },
    // A tap cracks the shell: a plastic snap, higher and harder with opts.n.
    capCrack(out, t, o, p) {
      const n = U.clamp(+o.n || 0, 0, 4);
      hiss(out, t, { type: 'highpass', f: 2400 + n * 500, dur: 0.05 + n * 0.015, v: 0.28 + n * 0.05, crunch: true });
      blip(out, t, { w: 'square', f: (620 + n * 180) * p, to: (300 + n * 60) * p, dur: 0.06, v: 0.12, lp: 4200 });
      blip(out, t, { w: 'sine', f: (140 - n * 12) * p, to: 60, dur: 0.1, v: 0.3 });
      for (let i = 0; i < 2 + n; i++) blip(out, t, { at: 0.03 + i * 0.03, w: 'sine', f: (2400 + S.r() * 2200) * p, dur: 0.04, v: 0.04 });
      return 0.2;
    },
    // It turned rarer: a swelling riser into a bright two-chord shimmer.
    capUpgrade(out, t, o, p) {
      duck(1.0);
      hiss(out, t, { type: 'bandpass', f: 700, to: 8000, q: 1.6, dur: 0.4, v: 0.16, a: 0.35 });
      blip(out, t, { w: 'sawtooth', f: mtof(60) * p, to: mtof(84) * p, dur: 0.38, v: 0.06, lp: 3800, lin: true });
      [72, 76, 79, 84, 88].forEach((n, i) => blip(out, t, { at: 0.38 + i * 0.035, w: 'square', f: mtof(n) * p, dur: 0.5, v: 0.06, lp: 4500, vib: [7, 5] }));
      for (let i = 0; i < 6; i++) blip(out, t, { at: 0.42 + i * 0.06, w: 'sine', f: mtof(96 + (i % 3) * 4) * p, dur: 0.1, v: 0.05 });
      return 1.0;
    },
    // The capsule bursts: a pop, a paper crackle and a chord; opts.tier
    // 0..3 (common..legendary) stacks a fanfare and a sub hit on top.
    capBurst(out, t, o, p) {
      const tier = U.clamp(+o.tier || 0, 0, 3);
      duck(0.6 + tier * 0.3);
      blip(out, t, { w: 'sine', f: 420 * p, to: 90, dur: 0.12, v: 0.4 });
      hiss(out, t, { type: 'bandpass', f: 1800, to: 600, q: 0.7, dur: 0.2, v: 0.3, crunch: true });
      for (let i = 0; i < 10; i++) hiss(out, t, { at: 0.05 + S.r() * 0.5, type: 'highpass', f: 5000, dur: 0.02, v: 0.06 });
      const chord = [[72, 76, 79], [72, 76, 79, 84], [67, 72, 76, 79, 84], [60, 67, 72, 76, 79, 84, 88]][tier];
      chord.forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.03, w: i % 2 ? 'triangle' : 'square', f: mtof(n) * p, dur: 0.6 + tier * 0.2, v: 0.06, lp: 4200, vib: [6, 4] }));
      if (tier >= 2) blip(out, t, { w: 'sine', f: 130, to: 36, dur: 0.5, v: 0.4 });
      if (tier >= 3) for (let i = 0; i < 8; i++) blip(out, t, { at: 0.3 + i * 0.07, w: 'sine', f: mtof(96 + (i % 4) * 3) * p, dur: 0.12, v: 0.05 });
      return 0.9 + tier * 0.25;
    },
    // Tickets feeding out of the cabinet: a quick ratchet of paper clicks.
    ticket(out, t, o, p) {
      for (let i = 0; i < 3; i++) {
        hiss(out, t, { at: i * 0.028, type: 'bandpass', f: 3400 * p, q: 3, dur: 0.018, v: 0.12 });
        blip(out, t, { at: i * 0.028, w: 'square', f: 1100 * p, dur: 0.012, v: 0.03, hp: 600 });
      }
      return 0.1;
    },
    // A payout line ticks in: a register ding, walking up with opts.pitch.
    tally(out, t, o, p) {
      blip(out, t, { w: 'square', f: 1320 * p, dur: 0.05, v: 0.07, lp: 5000 });
      blip(out, t, { at: 0.04, w: 'sine', f: 1980 * p, dur: 0.22, v: 0.08 });
      hiss(out, t, { type: 'bandpass', f: 2600, dur: 0.03, v: 0.1 });
      return 0.27;
    },
    // The total slams in: a thump and a cash register ka-ching.
    slam(out, t, o, p) {
      duck(0.5);
      blip(out, t, { w: 'sine', f: 150 * p, to: 50, dur: 0.18, v: 0.5 });
      hiss(out, t, { type: 'lowpass', f: 1800, to: 300, dur: 0.12, v: 0.3, crunch: true });
      blip(out, t, { at: 0.1, w: 'square', f: 2093 * p, dur: 0.06, v: 0.07, lp: 6000 });
      blip(out, t, { at: 0.16, w: 'sine', f: 2637 * p, dur: 0.5, v: 0.1, vib: [9, 8] });
      blip(out, t, { at: 0.16, w: 'sine', f: 3136 * p, dur: 0.4, v: 0.05 });
      return 0.66;
    },
    // The roulette flicks past a slot: a tiny wooden tock.
    roulette(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 900 * p, to: 700 * p, dur: 0.03, v: 0.12 });
      return 0.05;
    },
    // DOUBLE REWARD: two stacked fanfares a fifth apart.
    double(out, t, o, p) {
      duck(1.4);
      [0, 7].forEach((k, j) => [60, 64, 67, 72].forEach((n, i) => blip(out, t, { at: j * 0.22 + i * 0.05, w: 'square', f: mtof(n + k) * p, dur: 0.12, v: 0.08, lp: 5000 })));
      [72, 79, 84, 88].forEach((n) => blip(out, t, { at: 0.5, w: 'square', f: mtof(n) * p, dur: 0.8, v: 0.05, lp: 3800, vib: [6, 5] }));
      blip(out, t, { at: 0.5, w: 'sine', f: 110, to: 45, dur: 0.4, v: 0.35 });
      return 1.35;
    },
  });
  Object.assign(GAP, { ticket: 0.05, tally: 0.05, roulette: 0.03, capCrack: 0.06 });
  Object.assign(LEVEL, { capBurst: 1.1, capUpgrade: 1.05, slam: 1.05 });
  NAMES.push('capDrop', 'capCrack', 'capUpgrade', 'capBurst', 'ticket', 'tally', 'slam', 'roulette', 'double');

  // ---------------------------------------------------------------- cabinet materials
  // What things sound like in the bin (DESIGN.md "Cabinet materials"): each
  // material has its own voice for a hard landing (opts.vel 0..1.4 scales
  // it), plus the cabinet toys (fuse, blast, near miss, golden prize, the
  // claw's happy ding and the Lucky Claw).
  const impV = (o) => 0.3 * U.clamp(o.vel == null ? 1 : +o.vel || 0, 0.2, 1.4);
  Object.assign(BANK, {
    // Metal: a bright clank, an inharmonic ring (1 : 2.76 : 5.4) and a scrape.
    clank(out, t, o, p) {
      const v = impV(o);
      blip(out, t, { w: 'square', f: 1250 * p, to: 820 * p, dur: 0.03, v: v * 0.6, lp: 5200 });
      [1, 2.76, 5.4].forEach((k, i) => blip(out, t, { w: 'sine', f: 560 * k * p, dur: 0.28 - i * 0.06, v: v * 0.32 / (i + 1) }));
      hiss(out, t, { type: 'highpass', f: 4200, dur: 0.05, v: v * 0.5 });
      return 0.3;
    },
    // Glass: a few high glassy pings.
    tinkle(out, t, o, p) {
      const v = impV(o);
      for (let i = 0; i < 3; i++) blip(out, t, { at: i * 0.035 + S.r() * 0.01, w: 'sine', f: (2900 + i * 620 + S.r() * 300) * p, dur: 0.12, v: v * 0.22 });
      hiss(out, t, { type: 'highpass', f: 6500, dur: 0.02, v: v * 0.3 });
      return 0.2;
    },
    // Glass cracking: a sharp tick, a splintering crackle and a bent ping.
    crack(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 2600, dur: 0.07, v: 0.42, crunch: true });
      for (let i = 0; i < 5; i++) hiss(out, t, { at: 0.02 + i * 0.022 + S.r() * 0.01, type: 'bandpass', f: 3800 + S.r() * 2400, q: 6, dur: 0.012, v: 0.18 });
      blip(out, t, { w: 'sine', f: 3400 * p, to: 2300 * p, dur: 0.18, v: 0.12 });
      return 0.22;
    },
    // Heavy: a deep floor thump with a rattle of the cabinet on top.
    thud(out, t, o, p) {
      const v = impV(o) * 1.4;
      blip(out, t, { w: 'sine', f: 95 * p, to: 38, dur: 0.24, v });
      hiss(out, t, { type: 'lowpass', f: 500, to: 120, dur: 0.14, v: v * 0.6, crunch: true });
      for (let i = 0; i < 3; i++) blip(out, t, { at: 0.05 + i * 0.03, w: 'square', f: (700 + i * 160) * p, dur: 0.02, v: v * 0.08, lp: 3000 });
      return 0.3;
    },
    // Rubber: the cartoon boing (a sine with a wobbling pitch bend).
    boing(out, t, o, p) {
      const v = impV(o);
      blip(out, t, { w: 'sine', f: 200 * p, to: 520 * p, dur: 0.22, v: v * 0.8, vib: [22, 60] });
      blip(out, t, { w: 'triangle', f: 100 * p, to: 70, dur: 0.08, v: v * 0.5 });
      return 0.24;
    },
    // Food: a soft wet squish.
    squish(out, t, o, p) {
      const v = impV(o);
      hiss(out, t, { type: 'lowpass', f: 1400 * p, to: 300, q: 3, dur: 0.1, v: v * 0.6 });
      blip(out, t, { w: 'sine', f: 260 * p, to: 120, dur: 0.08, v: v * 0.5 });
      return 0.12;
    },
    // Potion: liquid glugs inside the glass.
    slosh(out, t, o, p) {
      const v = impV(o);
      for (let i = 0; i < 3; i++) blip(out, t, { at: i * 0.06, w: 'sine', f: (300 + i * 90 + S.r() * 40) * p, to: (520 + i * 60) * p, dur: 0.06, v: v * 0.35 });
      hiss(out, t, { type: 'bandpass', f: 900, q: 2, dur: 0.16, v: v * 0.2 });
      return 0.2;
    },
    // Magic: a soft bell chime with a shimmer.
    chime(out, t, o, p) {
      const v = impV(o);
      [84, 91].forEach((n, i) => blip(out, t, { at: i * 0.04, w: 'sine', f: mtof(n) * p, dur: 0.4, v: v * 0.2, vib: [6, 6] }));
      hiss(out, t, { type: 'highpass', f: 7000, dur: 0.1, v: v * 0.1, a: 0.02 });
      return 0.44;
    },
    // A fuse catching: a hissing fizz with crackles.
    fuse(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 5200 * p, q: 1.2, dur: 0.5, v: 0.2, a: 0.02 });
      for (let i = 0; i < 6; i++) hiss(out, t, { at: S.r() * 0.45, type: 'highpass', f: 6000, dur: 0.012, v: 0.2 });
      return 0.52;
    },
    // The fuse's countdown beep (opts.pitch goes up on the last turn).
    beep(out, t, o, p) {
      blip(out, t, { w: 'square', f: 1760 * p, dur: 0.07, v: 0.09, lp: 5000 });
      return 0.09;
    },
    // A bomb going off in the bin: a sub drop, a crunchy blast and debris.
    boom(out, t, o, p) {
      duck(0.9, 0.2);
      blip(out, t, { w: 'sine', f: 120 * p, to: 28, dur: 0.6, v: 0.7 });
      hiss(out, t, { type: 'lowpass', f: 2600, to: 160, dur: 0.55, v: 0.6, crunch: true });
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.08, v: 0.35 });
      for (let i = 0; i < 6; i++) blip(out, t, { at: 0.12 + S.r() * 0.4, w: 'square', f: (500 + S.r() * 900) * p, dur: 0.02, v: 0.05, lp: 3000 });
      return 0.7;
    },
    // SO CLOSE: the sad trombone, two falling notes and a wah.
    groan(out, t, o, p) {
      [[62, 0], [61, 0.2], [60, 0.4]].forEach(([n, at]) => blip(out, t, { at, w: 'sawtooth', f: mtof(n - 12) * p, dur: 0.18, v: 0.07, lp: 900 }));
      blip(out, t, { at: 0.6, w: 'sawtooth', f: mtof(47) * p, to: mtof(44) * p, dur: 0.5, v: 0.08, lp: 800, vib: [5, 14] });
      return 1.1;
    },
    // A Golden Prize grabbed: a short bright fanfare.
    fanfare(out, t, o, p) {
      duck(0.9);
      [67, 72, 76, 79].forEach((n, i) => blip(out, t, { at: i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.08, lp: 5000 }));
      [76, 79, 84].forEach((n) => blip(out, t, { at: 0.3, w: 'triangle', f: mtof(n) * p, dur: 0.55, v: 0.08, vib: [6, 5] }));
      for (let i = 0; i < 5; i++) blip(out, t, { at: 0.32 + i * 0.06, w: 'sine', f: mtof(96 + (i % 3) * 3) * p, dur: 0.08, v: 0.04 });
      return 0.9;
    },
    // The claw comes home loaded: a little two-tone ding.
    ding(out, t, o, p) {
      blip(out, t, { w: 'sine', f: mtof(88) * p, dur: 0.25, v: 0.13 });
      blip(out, t, { at: 0.09, w: 'sine', f: mtof(93) * p, dur: 0.4, v: 0.12 });
      return 0.5;
    },
    // Lucky Claw: a rising sparkle into a power-up chord.
    lucky(out, t, o, p) {
      duck(0.6);
      blip(out, t, { w: 'square', f: mtof(64) * p, to: mtof(88) * p, dur: 0.3, v: 0.06, lp: 4000, lin: true });
      [76, 81, 85, 88].forEach((n) => blip(out, t, { at: 0.3, w: 'triangle', f: mtof(n) * p, dur: 0.45, v: 0.07 }));
      hiss(out, t, { type: 'bandpass', f: 2000, to: 8000, q: 2, dur: 0.3, v: 0.08 });
      return 0.78;
    },
  });
  Object.assign(GAP, { clank: 0.05, tinkle: 0.05, crack: 0.05, thud: 0.08, boing: 0.06, squish: 0.06, slosh: 0.08, chime: 0.08, fuse: 0.2, beep: 0.2, boom: 0.1, groan: 0.5, fanfare: 0.3, ding: 0.3, lucky: 0.3 });
  Object.assign(LEVEL, { boom: 1.15, thud: 1.0 });
  NAMES.push('clank', 'tinkle', 'crack', 'thud', 'boing', 'squish', 'slosh', 'chime', 'fuse', 'beep', 'boom', 'groan', 'fanfare', 'ding', 'lucky');

  // ---------------------------------------------------------------- monsters
  // Enemies eating your stuff and getting angry (DESIGN.md "Enemies").
  Object.assign(BANK, {
    // A wet swallow: a throat thump sliding down, a little slurp on top.
    gulp(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 260 * p, to: 70, dur: 0.22, v: 0.4 });
      hiss(out, t, { type: 'bandpass', f: 900 * p, to: 300, q: 3, dur: 0.16, v: 0.16 });
      blip(out, t, { at: 0.12, w: 'triangle', f: 140 * p, to: 55, dur: 0.16, v: 0.28 });
      return 0.32;
    },
    // A burp (items coming back up): a buzzy saw wobbling down; opts.big for a death burst.
    burp(out, t, o, p) {
      const big = !!o.big;
      blip(out, t, { w: 'sawtooth', f: (big ? 110 : 150) * p, to: (big ? 60 : 90) * p, dur: big ? 0.45 : 0.28, v: 0.22, lp: 700, q: 5, vib: [24, 18] });
      hiss(out, t, { type: 'lowpass', f: 600, dur: big ? 0.3 : 0.18, v: 0.16, crunch: true });
      if (big) blip(out, t, { at: 0.05, w: 'sine', f: 500 * p, to: 900 * p, dur: 0.2, v: 0.12 });
      return big ? 0.5 : 0.32;
    },
    // Phase two: a growl that swells into a roar, a sub hit under it.
    roar(out, t, o, p) {
      duck(1.2);
      blip(out, t, { w: 'sawtooth', f: 70 * p, to: 120 * p, dur: 0.9, v: 0.2, a: 0.12, lp: 900, q: 6, vib: [11, 14] });
      blip(out, t, { w: 'square', f: 105 * p, to: 180 * p, dur: 0.8, v: 0.08, a: 0.15, lp: 1400, vib: [7, 10] });
      hiss(out, t, { type: 'bandpass', f: 500, to: 1400, q: 1.2, dur: 0.9, v: 0.2, a: 0.2, crunch: true });
      blip(out, t, { w: 'sine', f: 90, to: 35, dur: 0.5, v: 0.4 });
      return 1.0;
    },
  });
  Object.assign(GAP, { gulp: 0.08, burp: 0.1, roar: 0.4 });
  Object.assign(LEVEL, { roar: 1.1 });
  NAMES.push('gulp', 'burp', 'roar');

  // Meta progression (DESIGN.md "Meta"): the attract mode's coin, sticker
  // slaps, Prizedex discoveries and a Tilt level going up.
  Object.assign(BANK, {
    // A coin into the slot: a bright clink, a rattle down the chute, a clunk and the credit chime.
    coinIn(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 2600 * p, to: 2300 * p, dur: 0.08, v: 0.16 });
      blip(out, t, { at: 0.02, w: 'sine', f: 3900 * p, dur: 0.12, v: 0.06 });
      for (let i = 0; i < 4; i++) hiss(out, t, { at: 0.1 + i * 0.05, type: 'bandpass', f: 3000 - i * 400, q: 6, dur: 0.03, v: 0.1 - i * 0.015 });
      blip(out, t, { at: 0.32, w: 'sine', f: 180 * p, to: 70, dur: 0.1, v: 0.35 });
      [76, 83, 88].forEach((n, i) => blip(out, t, { at: 0.42 + i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.05, lp: 3500 }));
      return 0.75;
    },
    // A sticker slapped on the corner: a smack plus a sparkly rising arpeggio.
    sticker(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 1800, q: 1.2, dur: 0.05, v: 0.3, crunch: true });
      [79, 83, 86, 91].forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.06, w: 'triangle', f: mtof(n) * p, dur: 0.22, v: 0.08 }));
      blip(out, t, { at: 0.32, w: 'sine', f: mtof(98) * p, dur: 0.4, v: 0.04, vib: [7, 12] });
      return 0.75;
    },
    // A first sighting for the Prizedex: a quick "ooh" chime.
    discover(out, t, o, p) {
      blip(out, t, { w: 'sine', f: mtof(84) * p, dur: 0.14, v: 0.08 });
      blip(out, t, { at: 0.07, w: 'sine', f: mtof(91) * p, dur: 0.24, v: 0.07, vib: [6, 8] });
      hiss(out, t, { type: 'highpass', f: 6500, dur: 0.1, v: 0.03, a: 0.02 });
      return 0.32;
    },
    // A Tilt level up: an electric buzz winding up into a tense stab.
    tiltUp(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 90 * p, to: 180 * p, dur: 0.3, v: 0.12, lp: 1400, q: 4 });
      [0, 6, 12].forEach((k) => blip(out, t, { at: 0.26, w: 'square', f: mtof(50 + k) * p, dur: 0.24, v: 0.05, lp: 2200 }));
      hiss(out, t, { type: 'bandpass', f: 400, to: 2400, q: 1.4, dur: 0.3, v: 0.08 });
      return 0.55;
    },
  });
  Object.assign(GAP, { coinIn: 0.3, sticker: 0.2, discover: 0.15, tiltUp: 0.08 });
  NAMES.push('coinIn', 'sticker', 'discover', 'tiltUp');

  // ---------------------------------------------------------------- bosses
  // Boss and elite spectacle (DESIGN.md "Bosses"): the versus card, the four
  // cabinet signatures, heavy footsteps and the death finale. The stings
  // duck the music so they cut through it.
  Object.assign(BANK, {
    // The VS slam: a fat drum hit (sub kick + snare crack) with a thunder tail.
    vsSlam(out, t, o, p) {
      duck(0.8, 0.25);
      blip(out, t, { w: 'sine', f: 150 * p, to: 38, dur: 0.45, v: 0.75 });
      hiss(out, t, { type: 'bandpass', f: 1800, q: 0.7, dur: 0.18, v: 0.5, crunch: true });
      hiss(out, t, { at: 0.03, type: 'lowpass', f: 1400, to: 90, dur: 1.1, v: 0.32, crunch: true });
      blip(out, t, { at: 0.02, w: 'square', f: 3200 * p, to: 700, dur: 0.06, v: 0.08, lp: 6000 });
      return 1.2;
    },
    // A boss arrives: a long sub rumble that swells and fades.
    rumble(out, t, o, p) {
      const len = U.clamp(+o.len || 1.6, 0.4, 4);
      blip(out, t, { w: 'sawtooth', f: 41 * p, dur: len, v: 0.16, a: len * 0.35, lp: 220, vib: [7, 3] });
      hiss(out, t, { type: 'lowpass', f: 260, dur: len, v: 0.35, a: len * 0.3, crunch: true, rate: 0.5 });
      return len + 0.1;
    },
    // Heavy footsteps: a thump with a wooden knock (opts.big for a boss).
    stomp(out, t, o, p) {
      const k = o.big ? 1.3 : 1;
      blip(out, t, { w: 'sine', f: 95 * p / k, to: 32, dur: 0.28 * k, v: 0.55 });
      hiss(out, t, { type: 'lowpass', f: 700, to: 120, dur: 0.16 * k, v: 0.3, crunch: true });
      return 0.35 * k;
    },
    // The Hoard's coin avalanche: a cascade of clinks over a pour.
    coinSpill(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 3500, dur: 0.9, v: 0.12, a: 0.1 });
      for (let i = 0; i < 16; i++) {
        const at = i * 0.05 + S.r() * 0.03, f = (1900 + S.r() * 1500) * p;
        blip(out, t, { at, w: 'sine', f, dur: 0.09, v: 0.07 });
        blip(out, t, { at: at + 0.01, w: 'sine', f: f * 2.7, dur: 0.05, v: 0.03 });
      }
      return 1.0;
    },
    // Hot metal meets a hand: a sharp sizzle.
    sizzle(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 5000, dur: 0.45, v: 0.28, a: 0.01 });
      hiss(out, t, { type: 'bandpass', f: 2600 * p, to: 900, q: 2, dur: 0.3, v: 0.16, crunch: true });
      return 0.5;
    },
    // Molten slag drips: a heavy drop and a hiss.
    drip(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 520 * p, to: 140, dur: 0.12, v: 0.25 });
      hiss(out, t, { at: 0.08, type: 'highpass', f: 4000, dur: 0.3, v: 0.12 });
      return 0.4;
    },
    // Ice creeping over metal: a glassy rising shimmer and creaks.
    freezeOver(out, t, o, p) {
      for (let i = 0; i < 6; i++) blip(out, t, { at: i * 0.06, w: 'sine', f: mtof(84 + i * 2) * p, dur: 0.25, v: 0.05 });
      hiss(out, t, { type: 'bandpass', f: 5000, to: 9000, q: 3, dur: 0.5, v: 0.1 });
      hiss(out, t, { at: 0.2, type: 'bandpass', f: 400, q: 6, dur: 0.12, v: 0.2, crunch: true });
      return 0.6;
    },
    // The ice breaks: a crack and a spray of pings.
    iceBreak(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 2200, dur: 0.1, v: 0.5, crunch: true });
      for (let i = 0; i < 7; i++) blip(out, t, { at: 0.02 + S.r() * 0.2, w: 'sine', f: (2500 + S.r() * 2500) * p, dur: 0.1, v: 0.07 });
      blip(out, t, { w: 'sine', f: 180 * p, to: 60, dur: 0.2, v: 0.3 });
      return 0.4;
    },
    // The Prize Master takes the claw: a warped carnival organ glide.
    hijack(out, t, o, p) {
      duck(1.0, 0.35);
      [[60, 0], [63, 0.12], [67, 0.24], [66, 0.36]].forEach(([n, at]) => blip(out, t, { at, w: 'square', f: mtof(n) * p, to: mtof(n - 1) * p, dur: 0.16, v: 0.06, lp: 2400, vib: [6, 9] }));
      blip(out, t, { at: 0.5, w: 'sawtooth', f: mtof(55) * p, to: mtof(43) * p, dur: 0.6, v: 0.08, lp: 1200, vib: [4, 12] });
      return 1.2;
    },
    // The bin is shuffled: a card shuffle clatter.
    shuffle(out, t, o, p) {
      for (let i = 0; i < 10; i++) hiss(out, t, { at: i * 0.045, type: 'bandpass', f: (1500 + S.r() * 1500) * p, q: 1.5, dur: 0.04, v: 0.16 });
      return 0.55;
    },
    // The final phase: a two-tone siren.
    alarm(out, t, o, p) {
      duck(1.4, 0.3);
      for (let i = 0; i < 3; i++) {
        blip(out, t, { at: i * 0.46, w: 'square', f: 660 * p, to: 880 * p, dur: 0.22, v: 0.07, lp: 3000, lin: true });
        blip(out, t, { at: i * 0.46 + 0.23, w: 'square', f: 880 * p, to: 660 * p, dur: 0.22, v: 0.07, lp: 3000, lin: true });
      }
      return 1.45;
    },
    // One blast of the death finale's chain.
    kaboom(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 90 * p, to: 25, dur: 0.5, v: 0.55 });
      hiss(out, t, { type: 'lowpass', f: 3200 * p, to: 200, dur: 0.45, v: 0.45, crunch: true });
      return 0.55;
    },
    // BOSS DEFEATED: a big major fanfare over a gong.
    bossDown(out, t, o, p) {
      duck(3.0, 0.15);
      [60, 64, 67, 72].forEach((n, i) => blip(out, t, { at: i * 0.09, w: 'square', f: mtof(n) * p, dur: 0.16, v: 0.08, lp: 4500 }));
      [72, 76, 79, 84].forEach((n) => blip(out, t, { at: 0.4, w: 'triangle', f: mtof(n) * p, dur: 1.6, v: 0.07, vib: [5, 4] }));
      [1, 1.48, 2.1, 2.9].forEach((k, i) => blip(out, t, { at: 0.4, w: 'sine', f: 130 * k * p, dur: 2.2 - i * 0.3, v: 0.1 / (i + 1) }));
      hiss(out, t, { at: 0.4, type: 'highpass', f: 6000, dur: 1.2, v: 0.08, a: 0.05 });
      return 2.7;
    },
    // Music stings under the VS card: boss (minor, heavy) and elite (shorter).
    stingBoss(out, t, o, p) {
      duck(2.4, 0.2);
      [[45, 0], [44, 0.35], [45, 0.7]].forEach(([n, at]) => {
        blip(out, t, { at, w: 'sawtooth', f: mtof(n) * p, dur: 0.3, v: 0.12, lp: 900 });
        blip(out, t, { at, w: 'square', f: mtof(n + 12) * p, dur: 0.28, v: 0.05, lp: 1800 });
      });
      [57, 60, 63, 66].forEach((n) => blip(out, t, { at: 1.05, w: 'sawtooth', f: mtof(n) * p, dur: 1.2, v: 0.05, a: 0.05, lp: 1600, vib: [5, 3] }));
      return 2.3;
    },
    stingElite(out, t, o, p) {
      duck(1.2, 0.3);
      [[57, 0], [60, 0.14], [63, 0.28]].forEach(([n, at]) => blip(out, t, { at, w: 'square', f: mtof(n) * p, dur: 0.14, v: 0.07, lp: 2400 }));
      blip(out, t, { at: 0.42, w: 'sawtooth', f: mtof(66) * p, dur: 0.7, v: 0.07, lp: 2000, vib: [6, 5] });
      return 1.2;
    },
  });
  Object.assign(GAP, { vsSlam: 0.3, rumble: 0.8, stomp: 0.12, coinSpill: 0.5, sizzle: 0.1, drip: 0.15, freezeOver: 0.4, iceBreak: 0.2,
    hijack: 0.8, shuffle: 0.4, alarm: 1.0, kaboom: 0.06, bossDown: 2.0, stingBoss: 2.0, stingElite: 1.0 });
  Object.assign(LEVEL, { vsSlam: 1.15, kaboom: 1.05, bossDown: 1.1, stomp: 1.05 });
  NAMES.push('vsSlam', 'rumble', 'stomp', 'coinSpill', 'sizzle', 'drip', 'freezeOver', 'iceBreak', 'hijack', 'shuffle', 'alarm', 'kaboom', 'bossDown', 'stingBoss', 'stingElite');

  // ---------------------------------------------------------------- claw types
  // The claws' own voices (DESIGN.md "Claw types"): the coin clunk and the
  // motor spinning up at the start of a turn, the glass tap of a bored claw,
  // the jackpot twirl, the magnet's hum / zap / let-go, the scoop's slosh,
  // the rubber hand's squish, the harpoon's shot and thunk.
  Object.assign(BANK, {
    // A token into the Rig: a short clink and a solid clunk (no credit chime).
    clawCoin(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 2400 * p, to: 2100 * p, dur: 0.06, v: 0.12 });
      hiss(out, t, { at: 0.05, type: 'bandpass', f: 2600, q: 5, dur: 0.05, v: 0.08 });
      blip(out, t, { at: 0.12, w: 'sine', f: 160 * p, to: 60, dur: 0.12, v: 0.4 });
      hiss(out, t, { at: 0.12, type: 'lowpass', f: 900, dur: 0.06, v: 0.2, crunch: true });
      return 0.26;
    },
    // The claw motor spinning up: a rising whine with a ratchet.
    clawSpin(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 90 * p, to: 520 * p, dur: 0.55, v: 0.07, lp: 1800, q: 3 });
      blip(out, t, { w: 'square', f: 45 * p, to: 260 * p, dur: 0.55, v: 0.04, lp: 900 });
      for (let i = 0; i < 6; i++) hiss(out, t, { at: i * 0.08, type: 'bandpass', f: 1800 + i * 300, q: 8, dur: 0.018, v: 0.07 });
      blip(out, t, { at: 0.5, w: 'sine', f: mtof(88) * p, dur: 0.1, v: 0.06 });
      return 0.62;
    },
    // A bored claw knocking on the glass: two hollow taps.
    clawTap(out, t, o, p) {
      for (let i = 0; i < 2; i++) {
        blip(out, t, { at: i * 0.16, w: 'sine', f: 1400 * p, to: 900 * p, dur: 0.05, v: 0.14 });
        hiss(out, t, { at: i * 0.16, type: 'bandpass', f: 3200, q: 4, dur: 0.02, v: 0.12 });
      }
      return 0.26;
    },
    // The jackpot twirl: a whirring spin up into a little ta-da.
    clawCheer(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 300 * p, to: 1200 * p, dur: 0.35, v: 0.07, vib: [18, 30] });
      [72, 76, 79, 84].forEach((n, i) => blip(out, t, { at: 0.3 + i * 0.05, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.06, lp: 4500 }));
      return 0.62;
    },
    // The magnet warming up: a mains hum with a buzz on top.
    magHum(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 60 * p, dur: 0.7, v: 0.1, a: 0.08, lp: 500 });
      blip(out, t, { w: 'square', f: 120 * p, dur: 0.7, v: 0.04, a: 0.1, lp: 900, vib: [8, 3] });
      hiss(out, t, { type: 'bandpass', f: 2400, q: 3, dur: 0.6, v: 0.03, a: 0.1 });
      return 0.72;
    },
    // Metal slapping onto the live magnet: a zap and a clack.
    magZap(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.09, v: 0.3, crunch: true });
      blip(out, t, { w: 'square', f: 1800 * p, to: 300 * p, dur: 0.08, v: 0.08, lp: 5000 });
      blip(out, t, { at: 0.03, w: 'sine', f: 700 * p, dur: 0.12, v: 0.14 });
      return 0.16;
    },
    // The magnet lets go: a power-down whoop and a hiss.
    magDrop(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 240 * p, to: 50, dur: 0.35, v: 0.08, lp: 1200 });
      hiss(out, t, { type: 'bandpass', f: 1200, to: 300, q: 1.5, dur: 0.3, v: 0.08 });
      return 0.38;
    },
    // The scoop biting into the pile: a gravelly slosh.
    scoopSlosh(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 700 * p, to: 1800 * p, q: 1.3, dur: 0.22, v: 0.22, crunch: true });
      for (let i = 0; i < 5; i++) hiss(out, t, { at: 0.03 + i * 0.035, type: 'bandpass', f: 2200 + i * 380, q: 5, dur: 0.02, v: 0.08 });
      blip(out, t, { w: 'sine', f: 180 * p, to: 110, dur: 0.12, v: 0.2 });
      return 0.28;
    },
    // The rubber hand squeezing: a squeaky squish.
    handSquish(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 900 * p, to: 1500 * p, dur: 0.1, v: 0.09, vib: [40, 80] });
      hiss(out, t, { type: 'lowpass', f: 1600 * p, to: 400, q: 4, dur: 0.14, v: 0.25 });
      blip(out, t, { at: 0.05, w: 'triangle', f: 240 * p, to: 140, dur: 0.1, v: 0.2 });
      return 0.2;
    },
    // The harpoon fires: a crossbow twang and a rope whizz.
    hookFire(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 220 * p, to: 110 * p, dur: 0.14, v: 0.25, vib: [60, 20] });
      hiss(out, t, { type: 'bandpass', f: 1600, to: 5200, q: 1.4, dur: 0.18, v: 0.16 });
      return 0.22;
    },
    // The barb sinks in: a meaty thunk.
    hookThunk(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 220 * p, to: 70, dur: 0.12, v: 0.4 });
      hiss(out, t, { type: 'lowpass', f: 1400, to: 200, dur: 0.08, v: 0.28, crunch: true });
      blip(out, t, { at: 0.02, w: 'square', f: 900 * p, dur: 0.02, v: 0.05, lp: 3000 });
      return 0.16;
    },
  });
  Object.assign(GAP, { clawCoin: 0.2, clawSpin: 0.4, clawTap: 0.3, clawCheer: 0.5, magHum: 0.5, magZap: 0.06, magDrop: 0.3, scoopSlosh: 0.12, handSquish: 0.12, hookFire: 0.15, hookThunk: 0.1 });
  NAMES.push('clawCoin', 'clawSpin', 'clawTap', 'clawCheer', 'magHum', 'magZap', 'magDrop', 'scoopSlosh', 'handSquish', 'hookFire', 'hookThunk');

  // ---------------------------------------------------------------- CR8 (round 8)
  // Mama Mech and two new claws (DESIGN.md "Mama Mech and two new claws"):
  // the vacuum's roar, each slurp up the hose, the choke of a clog, the blow
  // at the chute; the twin claws' servo and double clack; the turret's
  // ratchet as a part goes on, its power-up, its shots and the mega blast.
  Object.assign(BANK, {
    // The vacuum spins up: a rising whine over a roar of air.
    vacWhoosh(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 500 * p, to: 2600 * p, q: 0.9, dur: 0.55, v: 0.2, a: 0.08 });
      blip(out, t, { w: 'sawtooth', f: 140 * p, to: 420 * p, dur: 0.5, v: 0.05, lp: 1400, a: 0.06 });
      return 0.6;
    },
    // A prize shoots up the hose: a hollow fwoomp that rises in pitch.
    vacSlurp(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 180 * p, to: 900 * p, dur: 0.16, v: 0.22 });
      hiss(out, t, { type: 'bandpass', f: 1200 * p, to: 4200 * p, q: 3, dur: 0.14, v: 0.12 });
      blip(out, t, { at: 0.12, w: 'triangle', f: 1400 * p, dur: 0.05, v: 0.06 });
      return 0.2;
    },
    // A big thing plugs the nozzle: a thunk and a choked, sputtering motor.
    vacClog(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 160 * p, to: 60, dur: 0.14, v: 0.35 });
      for (let i = 0; i < 4; i++) hiss(out, t, { at: 0.08 + i * 0.09, type: 'lowpass', f: 700, dur: 0.05, v: 0.14, crunch: true });
      blip(out, t, { at: 0.05, w: 'sawtooth', f: 90 * p, to: 50, dur: 0.4, v: 0.06, lp: 600 });
      return 0.46;
    },
    // Over the chute: the canister blows out with a puff.
    vacBlow(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2400 * p, to: 600, q: 1, dur: 0.3, v: 0.2 });
      blip(out, t, { w: 'sine', f: 600 * p, to: 200, dur: 0.18, v: 0.1 });
      return 0.32;
    },
    // The twin heads slide to their prizes: a little servo whirr.
    twinSeek(out, t, o, p) {
      blip(out, t, { w: 'square', f: 300 * p, to: 520 * p, dur: 0.18, v: 0.04, lp: 1800 });
      blip(out, t, { at: 0.02, w: 'square', f: 330 * p, to: 560 * p, dur: 0.16, v: 0.03, lp: 1800 });
      return 0.22;
    },
    // Both small claws clamp: clack-clack.
    twinClick(out, t, o, p) {
      for (let i = 0; i < 2; i++) {
        blip(out, t, { at: i * 0.07, w: 'triangle', f: (1500 + i * 300) * p, to: 700 * p, dur: 0.04, v: 0.12 });
        hiss(out, t, { at: i * 0.07, type: 'highpass', f: 3500, dur: 0.03, v: 0.1 });
      }
      return 0.14;
    },
    // A part bolted onto the turret: a ratchet and a clank.
    turBuild(out, t, o, p) {
      for (let i = 0; i < 3; i++) hiss(out, t, { at: i * 0.045, type: 'bandpass', f: 2200 + i * 400, q: 7, dur: 0.02, v: 0.1 });
      blip(out, t, { at: 0.14, w: 'triangle', f: 520 * p, to: 380 * p, dur: 0.1, v: 0.16 });
      return 0.26;
    },
    // A new turret level: a power-up arpeggio over a motor.
    turUp(out, t, o, p) {
      const lv = Math.max(1, Math.min(5, (o && o.lv) | 0 || 1));
      blip(out, t, { w: 'sawtooth', f: 120 * p, to: 360 * p, dur: 0.4, v: 0.05, lp: 1600 });
      [60, 64, 67, 72].slice(0, 2 + Math.min(2, lv >> 1)).forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.07, w: 'square', f: mtof(n + lv) * p, dur: 0.12, v: 0.07, lp: 4000 }));
      return 0.5;
    },
    // A turret shot: a punchy pew, deeper at a higher level.
    turFire(out, t, o, p) {
      const lv = Math.max(1, Math.min(5, (o && o.lv) | 0 || 1));
      blip(out, t, { w: 'square', f: (1100 - lv * 110) * p, to: 180, dur: 0.1, v: 0.1, lp: 3000 });
      hiss(out, t, { type: 'lowpass', f: 1600, to: 300, dur: 0.07, v: 0.14 + lv * 0.02, crunch: true });
      return 0.14;
    },
    // The Mega Mech's last shot hits everything: a boom with a zap on top.
    turMega(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 110 * p, to: 40, dur: 0.45, v: 0.4 });
      hiss(out, t, { type: 'lowpass', f: 1200, to: 150, dur: 0.4, v: 0.3, crunch: true });
      blip(out, t, { at: 0.02, w: 'sawtooth', f: 1800 * p, to: 300, dur: 0.12, v: 0.06, lp: 5000 });
      return 0.5;
    },
  });
  Object.assign(GAP, { vacWhoosh: 0.4, vacSlurp: 0.05, vacClog: 0.4, vacBlow: 0.3, twinSeek: 0.2, twinClick: 0.1, turBuild: 0.08, turUp: 0.3, turFire: 0.05, turMega: 0.4 });
  NAMES.push('vacWhoosh', 'vacSlurp', 'vacClog', 'vacBlow', 'twinSeek', 'twinClick', 'turBuild', 'turUp', 'turFire', 'turMega');
  // ---------------------------------------------------------------- /CR8

  // ---------------------------------------------------------------- ROS (round 10)
  // Ms. Bubbles, the mutator pack and three pets (DESIGN.md "Ms. Bubbles, the
  // mutator pack and three pets"): a bubble blown (a soft rising blub), a pop,
  // the Bubble Combo (a cascade of pops up a major arpeggio), the earthquake's
  // groan, the penguin's belly slide, the robot vacuum's whirr and beep.
  Object.assign(BANK, {
    rosBlow(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 260 * p, to: 620 * p, dur: 0.22, v: 0.16, a: 0.03 });
      blip(out, t, { at: 0.06, w: 'sine', f: 520 * p, to: 900 * p, dur: 0.12, v: 0.06 });
      return 0.26;
    },
    rosPop(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 1300 * p, to: 500 * p, dur: 0.05, v: 0.2 });
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.03, v: 0.12 });
      return 0.08;
    },
    rosCombo(out, t, o, p) {
      const n = Math.max(2, Math.min(6, (o && o.n) | 0 || 2));
      [72, 76, 79, 84, 88, 91].slice(0, n + 1).forEach((m, i) => {
        blip(out, t, { at: i * 0.06, w: 'sine', f: mtof(m) * p, to: mtof(m) * p * 0.6, dur: 0.07, v: 0.16 });
        hiss(out, t, { at: i * 0.06, type: 'highpass', f: 3500, dur: 0.02, v: 0.08 });
      });
      blip(out, t, { at: (n + 1) * 0.06, w: 'triangle', f: mtof(96) * p, dur: 0.25, v: 0.07 });
      return 0.2 + n * 0.06;
    },
    rosQuake(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 48 * p, to: 32, dur: 0.7, v: 0.12, lp: 300 });
      hiss(out, t, { type: 'lowpass', f: 400, to: 120, dur: 0.6, v: 0.25, crunch: true });
      return 0.72;
    },
    rosSlide(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2600 * p, to: 1200 * p, q: 2, dur: 0.45, v: 0.14 });
      blip(out, t, { w: 'triangle', f: 900 * p, to: 1400 * p, dur: 0.18, v: 0.05 });
      return 0.46;
    },
    rosSweep(out, t, o, p) {
      blip(out, t, { w: 'square', f: 180 * p, to: 240 * p, dur: 0.2, v: 0.04, lp: 1200 });
      blip(out, t, { at: 0.14, w: 'square', f: 1400 * p, dur: 0.05, v: 0.05, lp: 5000 });
      return 0.22;
    },
  });
  Object.assign(GAP, { rosBlow: 0.08, rosPop: 0.04, rosCombo: 0.4, rosQuake: 0.5, rosSlide: 0.3, rosSweep: 0.08 });
  NAMES.push('rosBlow', 'rosPop', 'rosCombo', 'rosQuake', 'rosSlide', 'rosSweep');
  // ---------------------------------------------------------------- /ROS

  // ---------------------------------------------------------------- SCHOOL (round 11)
  // Claw School (DESIGN.md "Claw School and the Practice Cabinet"): the school
  // bell as a lesson starts, a star popping onto the result card (opts.n 1..3
  // climbs), the pass jingle, a kind two-note "try again", chalk on the board.
  Object.assign(BANK, {
    schBell(out, t, o, p) {
      for (let i = 0; i < 9; i++) blip(out, t, { at: i * 0.045, w: 'triangle', f: 1480 * p, dur: 0.04, v: 0.1 });
      blip(out, t, { w: 'sine', f: 2960 * p, dur: 0.42, v: 0.03, vib: [22, 30] });
      return 0.5;
    },
    schStar(out, t, o, p) {
      const n = Math.max(1, Math.min(3, (o && o.n) | 0 || 1));
      blip(out, t, { w: 'triangle', f: mtof(76 + n * 4) * p, dur: 0.22, v: 0.12 });
      blip(out, t, { at: 0.05, w: 'sine', f: mtof(88 + n * 4) * p, dur: 0.3, v: 0.05 });
      hiss(out, t, { type: 'highpass', f: 6000, dur: 0.12, v: 0.05 });
      return 0.36;
    },
    schPass(out, t, o, p) {
      [72, 76, 79, 84].forEach((m, i) => blip(out, t, { at: i * 0.08, w: 'square', f: mtof(m) * p, dur: i === 3 ? 0.34 : 0.1, v: 0.05, lp: 3200 }));
      blip(out, t, { at: 0.24, w: 'triangle', f: mtof(60) * p, dur: 0.4, v: 0.1 });
      return 0.62;
    },
    schFail(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: mtof(67) * p, to: mtof(66) * p, dur: 0.22, v: 0.13 });
      blip(out, t, { at: 0.24, w: 'triangle', f: mtof(62) * p, to: mtof(58) * p, dur: 0.42, v: 0.13, vib: [6, 8] });
      return 0.7;
    },
    schChalk(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 3200 * p, to: 2400 * p, q: 3, dur: 0.14, v: 0.1 });
      hiss(out, t, { at: 0.09, type: 'bandpass', f: 2800 * p, q: 3, dur: 0.08, v: 0.07 });
      return 0.2;
    },
  });
  Object.assign(GAP, { schBell: 0.8, schStar: 0.06, schPass: 0.5, schFail: 0.5, schChalk: 0.08 });
  NAMES.push('schBell', 'schStar', 'schPass', 'schFail', 'schChalk');
  // ---------------------------------------------------------------- /SCHOOL

  // ---------------------------------------------------------------- arcade
  // The map's arcade (DESIGN.md "Arcade"): plinko pegs and drops, the prize
  // wheel's clicker, the slot machine's lever / reels / thunks, the drumroll
  // of suspense, win jingles, the jackpot fanfare, the sad trombone, the
  // event dice, and the roaming monsters (spotted you, a step, an ambush).
  Object.assign(BANK, {
    // A token rattles into the top of the board.
    plinkDrop(out, t, o, p) {
      for (let i = 0; i < 3; i++) blip(out, t, { at: i * 0.05, w: 'triangle', f: (1800 - i * 300) * p, to: 1200 * p, dur: 0.04, v: 0.08 });
      blip(out, t, { at: 0.14, w: 'sine', f: 330 * p, to: 180, dur: 0.1, v: 0.18 });
      return 0.26;
    },
    // A peg ding: a bright bell partial, pitch rising down the board (opts.pitch).
    peg(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 1320 * p, dur: 0.16, v: 0.1 });
      blip(out, t, { w: 'triangle', f: 2640 * p, dur: 0.06, v: 0.04 });
      return 0.18;
    },
    // The big wheel heaves into motion: a ratchet and a rising whoosh.
    wheelSpin(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 400, to: 2400, q: 1.2, dur: 0.5, v: 0.14 });
      for (let i = 0; i < 6; i++) hiss(out, t, { at: i * 0.05, type: 'bandpass', f: 3000, q: 8, dur: 0.015, v: 0.1 });
      return 0.52;
    },
    // The flapper clicking over a peg.
    wheelTick(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 3400 * p, q: 6, dur: 0.018, v: 0.2 });
      blip(out, t, { w: 'square', f: 900 * p, dur: 0.02, v: 0.04, lp: 3000 });
      return 0.04;
    },
    // The slot lever: a spring stretch and a clunk.
    lever(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 220 * p, to: 90, dur: 0.18, v: 0.06, lp: 1400 });
      blip(out, t, { at: 0.16, w: 'sine', f: 140 * p, to: 55, dur: 0.12, v: 0.35 });
      hiss(out, t, { at: 0.16, type: 'lowpass', f: 1200, dur: 0.06, v: 0.2, crunch: true });
      return 0.32;
    },
    // The reels whirring up.
    reelSpin(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 70 * p, to: 180 * p, dur: 0.9, v: 0.05, lp: 900, vib: [22, 8] });
      for (let i = 0; i < 12; i++) hiss(out, t, { at: 0.1 + i * 0.065, type: 'bandpass', f: 2600, q: 7, dur: 0.012, v: 0.06 });
      return 0.95;
    },
    // A reel stops: a thunk and a latch.
    reelStop(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 180 * p, to: 70, dur: 0.12, v: 0.4 });
      hiss(out, t, { type: 'bandpass', f: 1800, q: 3, dur: 0.03, v: 0.16 });
      blip(out, t, { at: 0.03, w: 'square', f: 1200 * p, dur: 0.025, v: 0.04, lp: 4000 });
      return 0.16;
    },
    // Suspense: a snare roll swelling.
    drumroll(out, t, o, p) {
      for (let i = 0; i < 18; i++) hiss(out, t, { at: i * 0.045, type: 'bandpass', f: 1900, q: 1.5, dur: 0.03, v: 0.04 + i * 0.006 });
      blip(out, t, { w: 'sine', f: 70, dur: 0.85, v: 0.08, a: 0.5 });
      return 0.9;
    },
    // A win: a quick rising arpeggio.
    arcWin(out, t, o, p) {
      [72, 76, 79, 84].forEach((n, i) => blip(out, t, { at: i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.14, v: 0.07, lp: 5000 }));
      blip(out, t, { at: 0.28, w: 'triangle', f: mtof(88) * p, dur: 0.3, v: 0.08, vib: [7, 8] });
      return 0.62;
    },
    // THE JACKPOT: bells, a fanfare and a shower of coin pings.
    arcJackpot(out, t, o, p) {
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => blip(out, t, { at: i * 0.06, w: 'square', f: mtof(n) * p, dur: 0.18, v: 0.07, lp: 5200 }));
      [72, 76, 79].forEach((n) => blip(out, t, { at: 0.5, w: 'sawtooth', f: mtof(n) * p, dur: 0.8, v: 0.05, lp: 3200, vib: [6, 6] }));
      for (let i = 0; i < 10; i++) blip(out, t, { at: 0.55 + i * 0.07, w: 'triangle', f: (2000 + (i % 3) * 400) * p, dur: 0.06, v: 0.05 });
      blip(out, t, { at: 0.5, w: 'sine', f: 110, to: 55, dur: 0.5, v: 0.3 });
      return 1.4;
    },
    // Nothing: a little wah-wah.
    arcLose(out, t, o, p) {
      [0, 1, 2].forEach((i) => blip(out, t, { at: i * 0.22, w: 'sawtooth', f: mtof(58 - i) * p, to: mtof(57 - i) * p, dur: 0.2, v: 0.05, lp: 1200, lin: true }));
      blip(out, t, { at: 0.66, w: 'sawtooth', f: mtof(55) * p, to: mtof(52) * p, dur: 0.5, v: 0.05, lp: 1000, vib: [6, 10], lin: true });
      return 1.2;
    },
    // Walking up to a cabinet: its attract jingle.
    arcIn(out, t, o, p) {
      [79, 76, 79, 84].forEach((n, i) => blip(out, t, { at: i * 0.09, w: 'square', f: mtof(n) * p, dur: 0.08, v: 0.05, lp: 4200 }));
      return 0.45;
    },
    // A die rattling across the floor.
    diceRoll(out, t, o, p) {
      for (let i = 0; i < 9; i++) hiss(out, t, { at: i * 0.1 + (i % 2) * 0.02, type: 'bandpass', f: 2400 + (i % 3) * 500, q: 5, dur: 0.02, v: 0.14 - i * 0.008 });
      return 1.0;
    },
    // The die lands: a clack and a ta-da.
    diceLand(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2000, q: 4, dur: 0.04, v: 0.25 });
      blip(out, t, { w: 'sine', f: 260 * p, to: 120, dur: 0.08, v: 0.25 });
      [76, 81].forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.08, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.06, lp: 4200 }));
      return 0.34;
    },
    // A monster spots you: a sharp alarm sting.
    roamWake(out, t, o, p) {
      blip(out, t, { w: 'square', f: mtof(81) * p, dur: 0.07, v: 0.08, lp: 4000 });
      blip(out, t, { at: 0.08, w: 'square', f: mtof(86) * p, dur: 0.12, v: 0.08, lp: 4000 });
      blip(out, t, { w: 'sawtooth', f: 90 * p, to: 60, dur: 0.2, v: 0.08, lp: 600 });
      return 0.24;
    },
    // A monster hop on the map.
    roamStep(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 120 * p, to: 60, dur: 0.1, v: 0.22 });
      hiss(out, t, { type: 'lowpass', f: 600, dur: 0.05, v: 0.12, crunch: true });
      return 0.12;
    },
    // AMBUSH: a stab and a snarl.
    ambush(out, t, o, p) {
      [0, 6, 1].forEach((d, i) => blip(out, t, { at: i * 0.06, w: 'sawtooth', f: mtof(52 + d) * p, dur: 0.22, v: 0.08, lp: 2400 }));
      hiss(out, t, { type: 'bandpass', f: 500, to: 180, q: 2, dur: 0.4, v: 0.22, crunch: true });
      blip(out, t, { w: 'sine', f: 90, to: 45, dur: 0.35, v: 0.3 });
      return 0.45;
    },
  });
  Object.assign(GAP, { peg: 0.03, wheelTick: 0.02, reelStop: 0.05, drumroll: 0.8, arcWin: 0.2, arcJackpot: 1.2, arcLose: 0.6, diceRoll: 0.5, roamWake: 0.3, roamStep: 0.08, ambush: 0.5, plinkDrop: 0.1, lever: 0.2, reelSpin: 0.4, wheelSpin: 0.4, arcIn: 0.4, diceLand: 0.2 });
  Object.assign(LEVEL, { arcJackpot: 1.15, peg: 0.8, wheelTick: 0.85 });
  NAMES.push('plinkDrop', 'peg', 'wheelSpin', 'wheelTick', 'lever', 'reelSpin', 'reelStop', 'drumroll', 'arcWin', 'arcJackpot', 'arcLose', 'arcIn', 'diceRoll', 'diceLand', 'roamWake', 'roamStep', 'ambush');

  // ---------------------------------------------------------------- bestiary
  // The round 4 enemies' tricks (DESIGN.md "Enemies", the bestiary): a
  // giggle for the tickled claw, a goo splat, the magnetic lid's rising hum,
  // digging, a ghost's boo, the bulldozer's engine and scrape, the rival
  // claw's servo whirr. (The prize wheel uses the arcade's spin and ticks.)
  Object.assign(BANK, {
    // A giggle: quick rising squeaks with a wobble.
    giggle(out, t, o, p) {
      for (let i = 0; i < 5; i++) blip(out, t, { at: i * 0.07, w: 'triangle', f: (700 + i * 90) * p, to: (900 + i * 110) * p, dur: 0.06, v: 0.09, vib: [30, 40] });
      return 0.4;
    },
    // A wet splat: a low noise thump and a sliding bubble.
    gooSplat(out, t, o, p) {
      hiss(out, t, { type: 'lowpass', f: 900 * p, to: 200, dur: 0.18, v: 0.3 });
      blip(out, t, { at: 0.02, w: 'sine', f: 220 * p, to: 520 * p, dur: 0.12, v: 0.14 });
      blip(out, t, { at: 0.1, w: 'sine', f: 380 * p, to: 180 * p, dur: 0.1, v: 0.08 });
      return 0.24;
    },
    // The lid magnetizes: a rising electric hum and a zap.
    magLift(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 60 * p, to: 180 * p, dur: 0.55, v: 0.1, lp: 900, vib: [50, 6] });
      blip(out, t, { w: 'square', f: 120 * p, to: 360 * p, dur: 0.5, v: 0.04, lp: 1600 });
      hiss(out, t, { at: 0.45, type: 'highpass', f: 3000, dur: 0.06, v: 0.14 });
      return 0.6;
    },
    // Digging: two gritty shovel scrapes and a thump of earth.
    dig(out, t, o, p) {
      for (let i = 0; i < 2; i++) hiss(out, t, { at: i * 0.11, type: 'bandpass', f: 1400 * p, to: 500, q: 1.5, dur: 0.09, v: 0.2, crunch: true });
      blip(out, t, { at: 0.2, w: 'sine', f: 110 * p, to: 60, dur: 0.12, v: 0.22 });
      return 0.34;
    },
    // BOO: a hollow sliding whistle.
    boo(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 520 * p, to: 260 * p, dur: 0.5, v: 0.14, vib: [6, 18] });
      blip(out, t, { w: 'triangle', f: 780 * p, to: 390 * p, dur: 0.45, v: 0.05, vib: [6, 25] });
      return 0.55;
    },
    // The bulldozer: an engine rev and the blade's scrape along the floor.
    dozer(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 55 * p, to: 95 * p, dur: 0.6, v: 0.16, lp: 600, vib: [22, 8] });
      hiss(out, t, { at: 0.15, type: 'bandpass', f: 700, to: 1500, q: 1.2, dur: 0.9, v: 0.12, crunch: true });
      blip(out, t, { at: 0.9, w: 'square', f: 1000 * p, dur: 0.08, v: 0.05, lp: 3000 });
      blip(out, t, { at: 1.05, w: 'square', f: 1000 * p, dur: 0.08, v: 0.05, lp: 3000 });
      return 1.15;
    },
    // The rival claw: a thin servo whirr up and a ratchet.
    rivalClaw(out, t, o, p) {
      blip(out, t, { w: 'square', f: 420 * p, to: 760 * p, dur: 0.35, v: 0.05, lp: 2200, vib: [40, 30] });
      for (let i = 0; i < 4; i++) hiss(out, t, { at: 0.35 + i * 0.04, type: 'bandpass', f: 3200, q: 7, dur: 0.02, v: 0.1 });
      return 0.55;
    },
  });
  Object.assign(GAP, { giggle: 0.35, gooSplat: 0.1, magLift: 0.4, dig: 0.15, boo: 0.3, dozer: 0.8, rivalClaw: 0.4 });
  NAMES.push('giggle', 'gooSplat', 'magLift', 'dig', 'boo', 'dozer', 'rivalClaw');

  // ---------------------------------------------------------------- pets (round 5)
  // Companion pets (DESIGN.md "Pets"): a chirp per species (opts.pitch), a
  // hop, the helping action's whoosh, a crunch, a honk, the level-up jingle,
  // hearts; whack-a-mole (a pop, a bonk, a bomb, a combo ping, the round's
  // whistle) and skee-ball (the roll, the hop off the ramp, a ring's clunk,
  // the 100 cup's bells, the ticket spray).
  Object.assign(BANK, {
    // A pet's little voice: a two-note chirp (pitch sets the species).
    petChirp(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 900 * p, to: 1400 * p, dur: 0.06, v: 0.12 });
      blip(out, t, { at: 0.07, w: 'sine', f: 1300 * p, to: 1000 * p, dur: 0.07, v: 0.1 });
      return 0.16;
    },
    // A hop off the frame or across the pile.
    petHop(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 300 * p, to: 700 * p, dur: 0.1, v: 0.12 });
      return 0.12;
    },
    // The helping action: a swish and a pop.
    petAct(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 900, to: 2600, q: 1.4, dur: 0.14, v: 0.12 });
      blip(out, t, { at: 0.1, w: 'sine', f: 520 * p, to: 880 * p, dur: 0.1, v: 0.18 });
      return 0.22;
    },
    // The raccoon eats junk: crunch crunch, a gulp.
    petCrunch(out, t, o, p) {
      for (let i = 0; i < 3; i++) hiss(out, t, { at: i * 0.09, type: 'bandpass', f: 1700 * p, q: 2, dur: 0.05, v: 0.16, crunch: true });
      blip(out, t, { at: 0.3, w: 'sine', f: 260 * p, to: 120, dur: 0.12, v: 0.2 });
      return 0.44;
    },
    // HONK: the goose, two nasal squawks.
    petHonk(out, t, o, p) {
      for (let i = 0; i < 2; i++) blip(out, t, { at: i * 0.16, w: 'sawtooth', f: 420 * p, to: 360 * p, dur: 0.12, v: 0.07, lp: 1400, vib: [18, 20] });
      return 0.32;
    },
    // A pet grows a level: a bright rising run and a sparkle.
    petLevel(out, t, o, p) {
      [67, 71, 74, 79, 83].forEach((n, i) => blip(out, t, { at: i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.06, lp: 5200 }));
      for (let i = 0; i < 5; i++) blip(out, t, { at: 0.38 + i * 0.05, w: 'triangle', f: (2400 + i * 300) * p, dur: 0.05, v: 0.04 });
      return 0.7;
    },
    // Hearts: a soft two-note coo.
    petLove(out, t, o, p) {
      blip(out, t, { w: 'sine', f: mtof(76) * p, dur: 0.12, v: 0.1, vib: [6, 6] });
      blip(out, t, { at: 0.11, w: 'sine', f: mtof(81) * p, dur: 0.18, v: 0.1, vib: [6, 6] });
      return 0.32;
    },
    // Whack-a-mole: a mole pops up.
    molePop(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 240 * p, to: 620 * p, dur: 0.08, v: 0.16 });
      return 0.1;
    },
    // BONK: the mallet lands on a mole (a squeak on a golden one, opts.pitch).
    bonk(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 180 * p, to: 70, dur: 0.1, v: 0.4 });
      hiss(out, t, { type: 'bandpass', f: 1200, q: 2, dur: 0.05, v: 0.2 });
      blip(out, t, { at: 0.03, w: 'square', f: 1400 * p, to: 2000 * p, dur: 0.06, v: 0.05, lp: 4000 });
      return 0.16;
    },
    // The mallet hits a bomb: a pop and a fizzle.
    moleBomb(out, t, o, p) {
      hiss(out, t, { type: 'lowpass', f: 1600, to: 200, dur: 0.4, v: 0.4, crunch: true });
      blip(out, t, { w: 'sine', f: 110 * p, to: 40, dur: 0.35, v: 0.4 });
      return 0.42;
    },
    // A combo step: a ping that climbs with opts.pitch.
    moleCombo(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 1046 * p, dur: 0.09, v: 0.07 });
      blip(out, t, { at: 0.05, w: 'triangle', f: 1568 * p, dur: 0.1, v: 0.05 });
      return 0.16;
    },
    // The referee's whistle: the round starts or ends.
    whistle(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 2200 * p, dur: 0.32, v: 0.1, vib: [30, 60] });
      return 0.34;
    },
    // Skee-ball: the ball rumbling up the lane.
    skeeRoll(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 60 * p, to: 110 * p, dur: 0.7, v: 0.06, lp: 400, vib: [12, 6] });
      hiss(out, t, { type: 'lowpass', f: 500, dur: 0.7, v: 0.08 });
      return 0.72;
    },
    // Off the hump and into the air.
    skeeHop(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 160 * p, to: 90, dur: 0.1, v: 0.3 });
      hiss(out, t, { type: 'highpass', f: 2000, dur: 0.12, v: 0.06 });
      return 0.14;
    },
    // The ball drops into a ring: a wooden clunk, brighter for more points.
    skeeRing(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 140 * p, to: 80, dur: 0.12, v: 0.35 });
      hiss(out, t, { type: 'bandpass', f: 900, q: 3, dur: 0.05, v: 0.2 });
      [72, 76, 79].forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.05, w: 'square', f: mtof(n) * p, dur: 0.08, v: 0.05, lp: 4200 }));
      return 0.3;
    },
    // The ticket spray: a paper flutter with a register ding.
    ticketSpray(out, t, o, p) {
      for (let i = 0; i < 10; i++) hiss(out, t, { at: i * 0.035, type: 'bandpass', f: 3000 + (i % 3) * 600, q: 4, dur: 0.02, v: 0.06 });
      blip(out, t, { at: 0.36, w: 'triangle', f: 2093 * p, dur: 0.2, v: 0.06 });
      return 0.6;
    },
  });
  Object.assign(GAP, { petChirp: 0.2, petHop: 0.1, petAct: 0.15, petCrunch: 0.3, petHonk: 0.3, petLevel: 0.6, petLove: 0.25, molePop: 0.04, bonk: 0.03, moleBomb: 0.2, moleCombo: 0.05, whistle: 0.3, skeeRoll: 0.4, skeeHop: 0.1, skeeRing: 0.1, ticketSpray: 0.3 });
  NAMES.push('petChirp', 'petHop', 'petAct', 'petCrunch', 'petHonk', 'petLevel', 'petLove', 'molePop', 'bonk', 'moleBomb', 'moleCombo', 'whistle', 'skeeRoll', 'skeeHop', 'skeeRing', 'ticketSpray');

  // ---------------------------------------------------------------- vault (round 5)
  // The Prize Vault (DESIGN.md "Prize Vault"): the glass door sliding open on
  // the redemption counter, a purchase (register and sparkle), equipping (a
  // latch and a chime), a capsule's new prize (a bright fanfare, bigger for
  // a legendary), a dupe paying out tickets (a coin cascade), the share card
  // (a camera shutter).
  Object.assign(BANK, {
    // A glass door sliding open, then a shimmering chord.
    vaultOpen(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 900, to: 2600, q: 1.2, dur: 0.32, v: 0.1 });
      [72, 76, 79, 84].forEach((n, i) => blip(out, t, { at: 0.18 + i * 0.05, w: 'sine', f: mtof(n) * p, dur: 0.5, v: 0.05, vib: [6, 6] }));
      return 0.75;
    },
    // A purchase: a register bell, a drawer thunk and a rising sparkle.
    vaultBuy(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 2093 * p, dur: 0.25, v: 0.1 });
      blip(out, t, { at: 0.02, w: 'sine', f: 3136 * p, dur: 0.3, v: 0.05 });
      blip(out, t, { at: 0.12, w: 'sine', f: 110 * p, to: 60, dur: 0.12, v: 0.3 });
      [79, 83, 86, 91, 95].forEach((n, i) => blip(out, t, { at: 0.2 + i * 0.045, w: 'square', f: mtof(n) * p, dur: 0.1, v: 0.04, lp: 5000 }));
      return 0.6;
    },
    // Equip: a solid latch and a two note chime.
    vaultEquip(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2400, q: 5, dur: 0.03, v: 0.2 });
      blip(out, t, { at: 0.01, w: 'square', f: 180 * p, to: 120, dur: 0.05, v: 0.12, lp: 1500 });
      blip(out, t, { at: 0.07, w: 'sine', f: mtof(81) * p, dur: 0.16, v: 0.08 });
      blip(out, t, { at: 0.15, w: 'sine', f: mtof(88) * p, dur: 0.26, v: 0.07 });
      return 0.42;
    },
    // A new prize out of a Vault Capsule: a fanfare; o.tier 3 (legendary) climbs a whole rainbow of notes.
    vaultNew(out, t, o, p) {
      const tier = Math.max(0, Math.min(3, (o && o.tier) | 0));
      const notes = tier >= 3 ? [72, 76, 79, 84, 88, 91, 96] : tier >= 2 ? [72, 76, 79, 84, 88] : [72, 76, 79, 84];
      notes.forEach((n, i) => blip(out, t, { at: 0.05 + i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.16, v: 0.05, lp: 4200 }));
      blip(out, t, { at: 0.05 + notes.length * 0.07, w: 'triangle', f: mtof(notes[notes.length - 1]) * p, dur: 0.6, v: 0.07, vib: [6, 10] });
      return 0.6 + notes.length * 0.07;
    },
    // A dupe: coins pour back into the wallet.
    vaultDupe(out, t, o, p) {
      for (let i = 0; i < 7; i++) blip(out, t, { at: 0.04 + i * 0.06, w: 'triangle', f: (2400 + (i % 3) * 300) * p, to: (2000 + (i % 3) * 250) * p, dur: 0.07, v: 0.07 });
      blip(out, t, { at: 0.5, w: 'sine', f: mtof(84) * p, dur: 0.3, v: 0.06 });
      return 0.8;
    },
    // The share card: a camera shutter and a little flash whine.
    vaultShare(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.04, v: 0.25 });
      hiss(out, t, { at: 0.07, type: 'highpass', f: 2600, dur: 0.05, v: 0.2 });
      blip(out, t, { at: 0.12, w: 'sine', f: 1800 * p, to: 4200 * p, dur: 0.3, v: 0.03 });
      return 0.42;
    },
  });
  Object.assign(GAP, { vaultOpen: 0.4, vaultBuy: 0.2, vaultEquip: 0.1, vaultNew: 0.4, vaultDupe: 0.4, vaultShare: 0.3 });
  NAMES.push('vaultOpen', 'vaultBuy', 'vaultEquip', 'vaultNew', 'vaultDupe', 'vaultShare');

  // ---------------------------------------------------------------- SETS (round 6)
  // Relic sets (a piece clicking into place, the set complete fanfare), the
  // boon draft (cards sliding out of the chute, a flip, the deal struck) and
  // the Compactor (an item dropping in, the hydraulic hiss, the crunch, the
  // new item popping out).
  Object.assign(BANK, {
    // A second piece: a chain link snapping shut and a bright two-note chime.
    setPiece(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 3200, q: 4, dur: 0.03, v: 0.18 });
      blip(out, t, { at: 0.01, w: 'square', f: 900 * p, to: 600 * p, dur: 0.04, v: 0.08, lp: 3000 });
      blip(out, t, { at: 0.06, w: 'triangle', f: mtof(79) * p, dur: 0.18, v: 0.1 });
      blip(out, t, { at: 0.14, w: 'triangle', f: mtof(86) * p, dur: 0.3, v: 0.09, vib: [6, 6] });
      return 0.46;
    },
    // A set complete: three chain links, a brass fanfare, a sub hit and sparkles.
    setDone(out, t, o, p) {
      duck(1.6);
      for (let i = 0; i < 3; i++) {
        hiss(out, t, { at: i * 0.09, type: 'bandpass', f: 2800 + i * 400, q: 4, dur: 0.03, v: 0.2 });
        blip(out, t, { at: i * 0.09, w: 'square', f: (700 + i * 150) * p, dur: 0.035, v: 0.07, lp: 3200 });
      }
      [60, 64, 67, 72].forEach((n, i) => blip(out, t, { at: 0.3 + i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.14, v: 0.08, lp: 4200 }));
      [72, 76, 79, 84].forEach((n) => blip(out, t, { at: 0.6, w: setWave(n), f: mtof(n) * p, dur: 0.9, v: 0.055, lp: 3800, vib: [5, 5] }));
      blip(out, t, { at: 0.6, w: 'sine', f: 110, to: 40, dur: 0.5, v: 0.4 });
      for (let i = 0; i < 8; i++) blip(out, t, { at: 0.7 + i * 0.06, w: 'sine', f: mtof(91 + (i % 4) * 3) * p, dur: 0.1, v: 0.045 });
      return 1.55;
    },
    // Three cards sliding out of the chute: a paper shuffle over a low drone.
    boonDeal(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 55 * p, dur: 1.1, v: 0.06, lp: 400, a: 0.2 });
      for (let i = 0; i < 3; i++) hiss(out, t, { at: 0.12 + i * 0.13, type: 'bandpass', f: 2400, to: 900, q: 1.2, dur: 0.1, v: 0.16 });
      return 1.2;
    },
    // A card flips face up: a whoosh and a bright tick.
    boonFlip(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 1200, to: 4200, q: 1.4, dur: 0.12, v: 0.16 });
      blip(out, t, { at: 0.1, w: 'triangle', f: 1500 * p, to: 1900 * p, dur: 0.07, v: 0.1 });
      blip(out, t, { at: 0.12, w: 'sine', f: mtof(84) * p, dur: 0.2, v: 0.06 });
      return 0.34;
    },
    // A deal struck: a gavel knock and a sly minor-to-major sting.
    boonPick(out, t, o, p) {
      duck(1.0);
      blip(out, t, { w: 'sine', f: 180 * p, to: 70, dur: 0.12, v: 0.45 });
      hiss(out, t, { type: 'lowpass', f: 1600, dur: 0.06, v: 0.2, crunch: true });
      [[57, 60, 64], [60, 64, 67, 72]].forEach((ch, j) => ch.forEach((n) => blip(out, t, { at: 0.14 + j * 0.2, w: 'square', f: mtof(n) * p, dur: j ? 0.7 : 0.18, v: 0.05, lp: 3600, vib: j ? [6, 5] : null })));
      return 1.0;
    },
    // An item dropped into the chamber: a hollow metal clonk.
    cmpFeed(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: 320 * p, to: 180 * p, dur: 0.09, v: 0.22 });
      hiss(out, t, { type: 'bandpass', f: 1800 * p, q: 3, dur: 0.04, v: 0.12 });
      return 0.14;
    },
    // The hydraulics: a rising hiss and a motor whine.
    cmpPress(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 500 * p, to: 2400 * p, q: 0.8, dur: 0.42, v: 0.22, a: 0.08 });
      blip(out, t, { w: 'sawtooth', f: 70 * p, to: 140 * p, dur: 0.42, v: 0.08, lp: 900, lin: true });
      return 0.48;
    },
    // The crunch: a heavy slam, splintering noise, metal groans.
    cmpCrunch(out, t, o, p) {
      duck(0.8);
      blip(out, t, { w: 'sine', f: 120 * p, to: 30, dur: 0.35, v: 0.6 });
      hiss(out, t, { type: 'lowpass', f: 3200, to: 300, dur: 0.3, v: 0.45, crunch: true });
      for (let i = 0; i < 6; i++) hiss(out, t, { at: 0.03 + i * 0.045, type: 'highpass', f: 2600 + (i % 3) * 900, dur: 0.03, v: 0.1, crunch: true });
      blip(out, t, { at: 0.12, w: 'sawtooth', f: 90 * p, to: 60 * p, dur: 0.4, v: 0.06, lp: 600 });
      return 0.6;
    },
    // The new item pops out of the bale: a cork pop and a shimmer.
    cmpPop(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 380 * p, to: 900 * p, dur: 0.08, v: 0.3 });
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.05, v: 0.12 });
      [76, 79, 84, 88].forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.05, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.05, lp: 5000 }));
      return 0.45;
    },
  });
  // (the chord of the set fanfare alternates two waves for a little shimmer)
  function setWave(n) { return n % 2 ? 'triangle' : 'square'; }
  Object.assign(GAP, { setPiece: 0.3, setDone: 0.8, boonDeal: 0.6, boonFlip: 0.08, boonPick: 0.4, cmpFeed: 0.05, cmpPress: 0.2, cmpCrunch: 0.2, cmpPop: 0.3 });
  Object.assign(LEVEL, { setDone: 1.1, cmpCrunch: 1.1 });
  NAMES.push('setPiece', 'setDone', 'boonDeal', 'boonFlip', 'boonPick', 'cmpFeed', 'cmpPress', 'cmpCrunch', 'cmpPop');

  // ---------------------------------------------------------------- EVOLVE (round 7)
  // Item evolutions (the item charging up out of the chute, the new form
  // bursting in) and the pet synergy sparkle.
  Object.assign(BANK, {
    // Charging: a rising hum under a quickening shimmer.
    evoRise(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 90 * p, to: 360 * p, dur: 1.2, v: 0.07, lp: 1400, a: 0.3 });
      blip(out, t, { w: 'sine', f: 220 * p, to: 880 * p, dur: 1.25, v: 0.06, vib: [8, 14] });
      for (let i = 0; i < 10; i++) blip(out, t, { at: 0.1 + i * 0.1 * (1 - i * 0.05), w: 'triangle', f: mtof(76 + i * 2) * p, dur: 0.06, v: 0.04 });
      return 1.3;
    },
    // The burst: a crash of glass, a sub hit, a bright major fanfare and sparkles.
    evoBurst(out, t, o, p) {
      duck(1.8);
      hiss(out, t, { type: 'highpass', f: 2600, dur: 0.35, v: 0.22 });
      blip(out, t, { w: 'sine', f: 120, to: 36, dur: 0.6, v: 0.45 });
      [60, 64, 67, 72, 76].forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.06, w: 'square', f: mtof(n) * p, dur: 0.16, v: 0.07, lp: 4200 }));
      [72, 76, 79, 84].forEach((n) => blip(out, t, { at: 0.42, w: n % 2 ? 'triangle' : 'square', f: mtof(n) * p, dur: 1.0, v: 0.05, lp: 3800, vib: [5, 6] }));
      for (let i = 0; i < 10; i++) blip(out, t, { at: 0.5 + i * 0.05, w: 'sine', f: mtof(88 + (i % 5) * 2) * p, dur: 0.09, v: 0.04 });
      return 1.5;
    },
    // A pet synergy: a two-note chirp and a sparkle.
    petSyn(out, t, o, p) {
      blip(out, t, { w: 'triangle', f: mtof(79) * p, dur: 0.08, v: 0.08 });
      blip(out, t, { at: 0.07, w: 'triangle', f: mtof(86) * p, dur: 0.12, v: 0.08 });
      for (let i = 0; i < 3; i++) blip(out, t, { at: 0.14 + i * 0.04, w: 'sine', f: mtof(93 + i * 2) * p, dur: 0.07, v: 0.035 });
      return 0.32;
    },
  });
  Object.assign(GAP, { evoRise: 0.8, evoBurst: 0.8, petSyn: 0.12 });
  Object.assign(LEVEL, { evoBurst: 1.1 });
  NAMES.push('evoRise', 'evoBurst', 'petSyn');

  // ---------------------------------------------------------------- SECRET (round 6)
  // The secret act (DESIGN.md "Secret act (round 6)"): a golden key found
  // (a jingle and a sparkle run), the hidden door grinding open, and The
  // Machine's cabinet events (the live rail's zap, the steel shutter and its
  // dents, zero g, the junk flood), the glass cracking, its voice, the long
  // power down and the credits' chime. The music modes 'backroom' and
  // 'machine' are added next to CFG below.
  Object.assign(BANK, {
    // A golden key: a bright jingle of key teeth, then a rising sparkle run.
    keyGet(out, t, o, p) {
      for (let i = 0; i < 4; i++) blip(out, t, { at: i * 0.03, w: 'triangle', f: (2600 + i * 420) * p, dur: 0.08, v: 0.08 });
      [76, 79, 83, 88, 91].forEach((n, i) => blip(out, t, { at: 0.12 + i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.16, v: 0.07, lp: 5200 }));
      blip(out, t, { at: 0.5, w: 'sine', f: mtof(95) * p, dur: 0.6, v: 0.06, vib: [7, 12] });
      return 1.1;
    },
    // The hidden door: a low creak with a wobble, a stone rumble, a hiss of cold air.
    doorOpen(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 90 * p, to: 55 * p, dur: 1.6, v: 0.12, a: 0.2, lp: 520, vib: [5, 9] });
      hiss(out, t, { type: 'lowpass', f: 240, dur: 1.8, v: 0.22, a: 0.3, crunch: true });
      hiss(out, t, { at: 0.9, type: 'bandpass', f: 1800, to: 500, q: 0.6, dur: 1.2, v: 0.08, a: 0.2 });
      blip(out, t, { at: 1.5, w: 'sine', f: 55 * p, to: 32, dur: 0.5, v: 0.4 });
      return 2.1;
    },
    // The live rail: a buzzing arc and a crackle.
    secZap(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 180 * p, to: 90 * p, dur: 0.28, v: 0.14, lp: 3200, vib: [60, 70] });
      blip(out, t, { w: 'square', f: 1400 * p, to: 300 * p, dur: 0.12, v: 0.06 });
      for (let i = 0; i < 5; i++) hiss(out, t, { at: i * 0.045, type: 'highpass', f: 3000, dur: 0.03, v: 0.18 });
      return 0.32;
    },
    // The steel shutter slamming down over the chute.
    secShutter(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 700, to: 200, q: 1, dur: 0.35, v: 0.2 });
      blip(out, t, { at: 0.3, w: 'sine', f: 90 * p, to: 40, dur: 0.3, v: 0.5 });
      blip(out, t, { at: 0.3, w: 'square', f: 420 * p, to: 380 * p, dur: 0.2, v: 0.05, lp: 1800 });
      return 0.65;
    },
    // A heavy prize dents the shutter: a hard metal clang.
    secClang(out, t, o, p) {
      blip(out, t, { w: 'square', f: 523 * p, dur: 0.35, v: 0.07, lp: 2400 });
      blip(out, t, { w: 'triangle', f: 1310 * p, dur: 0.4, v: 0.06 });
      blip(out, t, { w: 'sine', f: 110 * p, to: 60, dur: 0.18, v: 0.35 });
      hiss(out, t, { type: 'highpass', f: 2600, dur: 0.06, v: 0.2 });
      return 0.45;
    },
    // Zero g: a rising, wobbling whoosh.
    secGrav(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 120 * p, to: 700 * p, dur: 0.9, v: 0.16, vib: [8, 30] });
      hiss(out, t, { type: 'bandpass', f: 400, to: 3000, q: 1.5, dur: 0.9, v: 0.1 });
      return 1.0;
    },
    // The junk flood: a heavy clattering pour.
    secFlood(out, t, o, p) {
      for (let i = 0; i < 9; i++) {
        hiss(out, t, { at: i * 0.06, type: 'bandpass', f: 500 + (i % 4) * 300, q: 2, dur: 0.07, v: 0.16, crunch: true });
        if (i % 3 === 0) blip(out, t, { at: i * 0.06, w: 'sine', f: 120 * p, to: 70, dur: 0.1, v: 0.25 });
      }
      return 0.7;
    },
    // The glass cracking: a sharp snap and a spray of tinkles.
    glassCrack(out, t, o, p) {
      hiss(out, t, { type: 'highpass', f: 2200, dur: 0.05, v: 0.35 });
      blip(out, t, { w: 'triangle', f: 3100 * p, to: 2400 * p, dur: 0.08, v: 0.06 });
      for (let i = 0; i < 4; i++) blip(out, t, { at: 0.04 + i * 0.05, w: 'sine', f: (3800 + i * 500) * p, dur: 0.06, v: 0.035 });
      return 0.3;
    },
    // The Machine's voice: a vocoder-ish three note bleep.
    secVoice(out, t, o, p) {
      [45, 43, 40].forEach((n, i) => blip(out, t, { at: i * 0.11, w: 'sawtooth', f: mtof(n) * p, dur: 0.1, v: 0.1, lp: 1200, q: 6, vib: [30, 8] }));
      return 0.4;
    },
    // A low machine hum (a phase change, the service lights).
    secHum(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 55 * p, dur: 1.0, v: 0.08, a: 0.1, lp: 300 });
      blip(out, t, { w: 'sine', f: 110 * p, dur: 1.0, v: 0.06, a: 0.1, vib: [4, 2] });
      return 1.05;
    },
    // The cabinet powers down: a long falling whine, the relays clunking off.
    powerDown(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 880 * p, to: 30, dur: 2.6, v: 0.12, a: 0.02, lp: 2400 });
      blip(out, t, { w: 'sine', f: 220 * p, to: 25, dur: 2.8, v: 0.18 });
      for (let i = 0; i < 4; i++) blip(out, t, { at: 0.5 + i * 0.55, w: 'sine', f: 70 * p, to: 40, dur: 0.12, v: 0.35 });
      hiss(out, t, { at: 2.4, type: 'lowpass', f: 900, to: 80, dur: 0.8, v: 0.1 });
      return 3.2;
    },
    // The credits: a warm major chord that blooms.
    creditsChime(out, t, o, p) {
      [60, 64, 67, 72, 76].forEach((n, i) => blip(out, t, { at: i * 0.06, w: 'triangle', f: mtof(n) * p, dur: 1.6, v: 0.05, a: 0.05 }));
      return 1.8;
    },
  });
  Object.assign(GAP, { keyGet: 0.5, doorOpen: 1, secZap: 0.12, secShutter: 0.3, secClang: 0.06, secGrav: 0.5, secFlood: 0.4, glassCrack: 0.05, secVoice: 0.3, secHum: 0.6, powerDown: 2, creditsChime: 1 });
  NAMES.push('keyGet', 'doorOpen', 'secZap', 'secShutter', 'secClang', 'secGrav', 'secFlood', 'glassCrack', 'secVoice', 'secHum', 'powerDown', 'creditsChime');

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
    // Prune finished voices, then refuse if we are at the cap (MIX round 10:
    // per tier, and the global cap never stops a sting).
    const tier = mixTier(name);
    if (!mixVoiceOk(tier, t)) return false;
    S.last[name] = t;
    try {
      const out = S.ac.createGain();
      const vary = mixVary(name, t);   // MIX: subtle pitch and level spread on the repeated sounds
      setP(out.gain, mixLevel(name) * vary.v * U.clamp(o.vol == null ? 1 : +o.vol || 0, 0, 2));
      out.connect(MIX_MINOR[tier] && S.minorG ? S.minorG : S.sfxBus);
      const p = U.clamp(o.pitch == null ? 1 : +o.pitch || 1, 0.25, 4) * (1 + (S.r() - 0.5) * 0.03) * vary.p;
      S.cur = tier;
      let len;
      try { len = fn(out, t, o, p) || 0.3; } finally { S.cur = null; }
      if (MIX_STING[tier]) mixSting(name, len);   // MIX: a big sting ducks the music and the minor sfx
      mixVoiceAdd(tier, t + len, out);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Dips the music under a big moment and brings it back. MIX (round 10):
     ducks merge instead of cutting each other short (the deeper depth and
     the later end win), and a duck asked for by a hit-sized voice is a short
     shallow dip, not a hole in the music (mixDuckShape). */
  function duck(seconds, depth) {
    if (!S.ac || !S.duckG) return;
    const t = now();
    const hold = U.clamp(+seconds || 0.5, 0.05, 10);
    let d = U.clamp(depth == null ? 0.3 : +depth, 0, 1);
    if (!isFinite(d)) d = 0.3;
    const sh = mixDuckShape(hold, d);
    mixRamp(S.duckG.gain, S.dk.mus, t, sh.hold, sh.depth);
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
  // SECRET (round 6): the Back Room's hum and The Machine's fight.
  Object.assign(CFG, {
    backroom: { bpm: 88, root: 38, scale: 'phrygian', bass: 'pedal', lead: 'tense', hat: 'soft', drums: 'light',
      wave: 'triangle', bassWave: 'sawtooth', stab: 0.25, swing: 0, vol: 0.75, leadUp: 24,
      prog: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 3, 1, 6], [0, 1, 5, 4]] },
    machine: { bpm: 160, root: 33, scale: 'harm', bass: 'drive', lead: 'riff', hat: '16', drums: 'four',
      wave: 'sawtooth', bassWave: 'square', stab: 0.6, swing: 0, vol: 0.8, leadUp: 24, drop: true,
      prog: [[0, 1, 5, 4], [0, 6, 1, 4], [0, 5, 6, 4], [0, 1, 0, 4]] },
  });
  MODES.push('backroom', 'machine');
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
  function compose(mode, act) {
    const c = accCfg(mode, act);
    const rng = U.rng(U.hashStr('clawspire:' + mode + (c.actKey ? ':act' + c.actKey : '') + (c.seaKey ? ':sea:' + c.seaKey : '')));   // (SEASON: its own tune)
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
      accFlavor(c, steps, base, b, tone, rng, half);   // the act's own colour (round 6); the base tunes have none
      seaFlavor(c, steps, base, b, tone, rng);   // the season's own voices (round 7); only its tunes have them
    }
    return { mode, act: c.actKey || 0, bpm: c.bpm, stepDur: 60 / c.bpm / 4, swing: c.swing, len, bars, steps, cfg: c };
  }

  function song(mode, act) {
    if (!CFG[mode]) return null;
    const key = accSongKey(mode, act);
    return S.songs[key] || (S.songs[key] = compose(mode, act));
  }

  /* ---------------------------------------------------------------- per-act music (round 6)
     Each act biome gets its own map theme and its own fight colour, on top
     of the same composer: act 1 (the cellar arcade) is synthpop, a bouncing
     octave bass, four on the floor and a filtered 16th arpeggio; act 2 (the
     foundry) an industrial furnace groove, a phrygian pedal bass, anvil
     clanks on the offbeats and a hissing steam hat; act 3 (the vault) an
     icy music box, a lydian lullaby on bell tones with a sparkle an octave
     up and a slow sub. The fight, elite and boss tunes keep their own
     tempo and key (and the round 3 hype / tense layers) and borrow the
     act's timbre. S.act 0 (the title, the tests) plays the base tunes, so
     every base song is unchanged. ACT_CFG[act][mode] overrides CFG[mode];
     ACT_CFG[act].all is merged into every mode of that act. */
  const ACT_CFG = {
    1: {
      all: { arp: 0.55 },
      map: { bpm: 112, root: 45, scale: 'dorian', bass: 'bounce', lead: 'pluck', hat: '8', drums: 'four', wave: 'square', bassWave: 'square',
        stab: 0.35, swing: 0, vol: 0.8, leadUp: 24, arp: 1, prog: [[0, 5, 3, 4], [0, 3, 5, 4], [5, 3, 0, 4], [0, 6, 5, 4]] },
    },
    2: {
      all: { clank: 1 },
      map: { bpm: 96, root: 40, scale: 'phrygian', bass: 'pedal', lead: 'heavy', hat: 'off', drums: 'rock', wave: 'sawtooth', bassWave: 'sawtooth',
        stab: 0.5, swing: 0.12, vol: 0.8, leadUp: 12, clank: 1, steam: 1, prog: [[0, 1, 0, 6], [0, 0, 1, 5], [0, 6, 5, 1], [0, 3, 1, 0]] },
      fight: { scale: 'phrygian', bassWave: 'sawtooth', steam: 1 },
    },
    3: {
      all: { box: 1 },
      map: { bpm: 84, root: 50, scale: 'lydian', bass: 'long', lead: 'dreamy', hat: 'soft', drums: 'none', wave: 'triangle', bassWave: 'sine',
        stab: 0.2, swing: 0.08, vol: 0.85, leadUp: 36, box: 1, prog: [[0, 4, 5, 3], [0, 1, 4, 3], [5, 3, 0, 4], [0, 2, 1, 4]] },
      fight: { scale: 'harm', wave: 'triangle' },
    },
  };
  const ACT_NAMES = { 1: 'arcade synthpop', 2: 'industrial furnace groove', 3: 'icy music box' };
  // The act a mode varies by: title, win and off never do.
  const ACT_MODES = { map: 1, fight: 1, elite: 1, boss: 1 };
  function accActOf(mode, act) {
    const a = act == null ? S.act : act;
    return ACT_MODES[mode] && ACT_CFG[a] ? a : 0;
  }
  function accSongKey(mode, act) {
    const sk = seaSongKey(mode); if (sk) return sk;   // SEASON: the season's own title / map tune
    const a = accActOf(mode, act);
    return a ? mode + ':act' + a : mode;
  }
  // The mode's config for an act: the base, the act's all, the act's own.
  function accCfg(mode, act) {
    const sc = seaCfgOf(mode); if (sc) return sc;   // SEASON: the season's variant wins over the act's
    const a = accActOf(mode, act);
    if (!a) return CFG[mode];
    return Object.assign({}, CFG[mode], ACT_CFG[a].all || {}, ACT_CFG[a][mode] || {}, { actKey: a });
  }
  // The act's extra voices for one bar: the synthpop arpeggio, the foundry's
  // anvil clanks and steam, the vault's bell sparkles. Only a config that
  // asks for them draws from the rng, so the base tunes stay bit for bit.
  function accFlavor(c, steps, base, b, tone, rng, half) {
    if (!c.actKey) return;
    if (c.arp) {
      const pat = [0, 2, 4, 7, 4, 2];
      for (let s = 0; s < BAR; s += 2) {
        if (c.arp < 1 && s % 4 !== 0 && !rng.chance(c.arp)) continue;
        push(steps, base + s, { v: 'arp', n: tone(pat[(s / 2 + b) % pat.length], 24), g: s % 8 === 0 ? 1 : 0.7 });
      }
    }
    if (c.clank) {
      push(steps, base + 6, { v: 'clank', n: tone(0, 36), g: 0.9 });
      if (b % 2 === 1 || rng.chance(0.4)) push(steps, base + 14, { v: 'clank', n: tone(1, 36), g: 0.7 });
    }
    if (c.steam && (b % 4 === 3)) push(steps, base + 8, { v: 'steam', g: half ? 1.2 : 1 });
    if (c.box) {
      // bells: the chord tones a twelfth up, sparse and ringing
      for (const s of [0, 6, 10]) if (s === 0 || rng.chance(0.5)) push(steps, base + s, { v: 'bell', n: tone(rng.pick([0, 2, 4, 7]), 36), g: s === 0 ? 1 : 0.7 });
    }
    if (c.bub) depFlavor(c, steps, base, b, tone, rng);   // DEP: the Neon Depths' bubbles
  }
  /* Tells the music which act biome the player is in (1..3; 0 = none).
     A live map or fight tune of another act crossfades into this act's
     (a little slower than a screen change). Returns the act. */
  function setAct(a) {
    a = ACT_CFG[a] ? a | 0 : 0;
    if (a === S.act) return S.act;
    S.act = a;
    if (S.ac && prefs().music && ACT_MODES[S.want] && S.seqs.some((q) => q.mode === S.want && q.fadeEnd == null && (q.act || 0) !== accActOf(S.want))) startMode(S.want, ACT_XFADE);
    return S.act;
  }
  const ACT_XFADE = 1.6;

  /* ---------------------------------------------------------------- SEASON (round 7)
     Seasonal events (DESIGN.md "Seasonal events (round 7)"): each season has
     its own title and map tune on the same composer. Claw-o-ween is a
     spooky organ swing (harmonic minor, a creeping walking bass, a church
     organ pad, a low bell tolling every four bars); Winter Wonderclaw a
     sleigh bell jingle (major, bouncing, sleigh bells on the eighths, a
     chime up high). AUDIO.setSeason(id) picks it (null: none, the base and
     act tunes bit for bit); a live title / map tune crossfades into it.
     Sounds for the trick-or-treat door and the candy. */
  const SEA_CFG = {
    halloween: {
      title: { bpm: 84, root: 38, scale: 'harm', bass: 'walk', lead: 'tense', hat: 'soft', drums: 'light', wave: 'triangle', bassWave: 'triangle',
        stab: 0.3, swing: 0.2, vol: 0.85, leadUp: 24, organ: 0.6, toll: 1, prog: [[0, 5, 3, 4], [0, 1, 4, 0], [5, 3, 1, 4], [0, 3, 5, 4]] },
      map: { bpm: 104, root: 40, scale: 'harm', bass: 'walk', lead: 'pluck', hat: 'off', drums: 'light', wave: 'square', bassWave: 'triangle',
        stab: 0.25, swing: 0.3, vol: 0.8, leadUp: 24, organ: 0.35, toll: 1, prog: [[0, 3, 0, 4], [0, 5, 1, 4], [5, 3, 0, 4], [0, 1, 3, 4]] },
    },
    winter: {
      title: { bpm: 92, root: 43, scale: 'major', bass: 'long', lead: 'dreamy', hat: 'soft', drums: 'none', wave: 'triangle', bassWave: 'sine',
        stab: 0.25, swing: 0.1, vol: 0.85, leadUp: 36, sleigh: 0.5, chime: 1, jingle: 0.9, prog: [[0, 3, 4, 0], [0, 5, 3, 4], [3, 4, 0, 5], [0, 4, 5, 3]] },
      map: { bpm: 116, root: 45, scale: 'major', bass: 'bounce', lead: 'pluck', hat: '8', drums: 'four', wave: 'square', bassWave: 'triangle',
        stab: 0.35, swing: 0, vol: 0.8, leadUp: 24, sleigh: 1, chime: 0.6, jingle: 1, prog: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 1, 4], [3, 4, 0, 0]] },
    },
  };
  const SEA_NAMES = { halloween: 'spooky organ swing', winter: 'sleigh bell jingle' };
  const SEA_XFADE = 1.2;
  const SEA_FULL = {};
  const seaOn = (mode) => !!(S.sea && SEA_CFG[S.sea] && SEA_CFG[S.sea][mode]);
  function seaSongKey(mode) { return seaOn(mode) ? mode + ':sea:' + S.sea : ''; }
  // The season's config for a mode (the act's colour voices off), or null.
  function seaCfgOf(mode) {
    if (!seaOn(mode)) return null;
    const k = S.sea + ':' + mode;
    return SEA_FULL[k] || (SEA_FULL[k] = Object.assign({}, CFG[mode], { arp: 0, clank: 0, steam: 0, box: 0 }, SEA_CFG[S.sea][mode], { seaKey: S.sea }));
  }
  // The season's own voices for one bar (only its configs draw from the rng).
  function seaFlavor(c, steps, base, b, tone, rng) {
    if (!c.seaKey) return;
    if (c.organ && (b % 2 === 0 || rng.chance(c.organ))) push(steps, base, { v: 'organ', ns: [tone(0, 12), tone(2, 12), tone(4, 12)], d: 14, g: 0.9 });
    if (c.toll && b % 4 === 0) push(steps, base, { v: 'bell', n: tone(0, 12), g: 1.3 });
    if (c.sleigh) for (let s = 0; s < BAR; s += 2) if (s % 4 === 0 || rng.chance(c.sleigh)) push(steps, base + s, { v: 'sleigh', g: s % 4 === 0 ? 1 : 0.6 });
    if (c.chime) for (const s of [0, 8]) if (s === 0 || rng.chance(c.chime * 0.6)) push(steps, base + s, { v: 'bell', n: tone(rng.pick([0, 2, 4]), 36), g: 0.8 });
    if (c.jingle) winJingle(c, steps, base, b, tone);   // WIN (round 12): the winter hook (draws nothing from the rng)
  }
  function seaVoice(dest, t, ev, g, sd) {
    if (ev.v === 'organ') {
      for (const n of ev.ns || []) {
        blip(dest, t, { w: 'triangle', f: mtof(n), dur: ev.d * sd, v: 0.028 * g, a: 0.09, vib: [5, mtof(n) * 0.006] });
        blip(dest, t, { w: 'square', f: mtof(n) * 1.004, dur: ev.d * sd, v: 0.01 * g, a: 0.09, lp: 1300 });
      }
    } else if (ev.v === 'sleigh') {
      hiss(dest, t, { type: 'highpass', f: 7600, q: 0.8, dur: 0.07, v: 0.05 * g });
      blip(dest, t, { w: 'sine', f: 5100, dur: 0.05, v: 0.008 * g, a: 0.001 });
      blip(dest, t, { w: 'sine', f: 6400, dur: 0.04, v: 0.006 * g, a: 0.001, at: 0.02 });
    }
  }
  /* The season the music plays in (null: none). A live title or map tune
     of another season crossfades into this one. Returns the season. */
  function setSeason(id) {
    id = id && SEA_CFG[id] ? id : null;
    if (id === (S.sea || null)) return S.sea || null;
    S.sea = id;
    if (S.ac && prefs().music && S.want && CFG[S.want] && S.seqs.some((q) => q.mode === S.want && q.fadeEnd == null && q.song !== song(S.want, accActOf(S.want)))) startMode(S.want, SEA_XFADE);
    return S.sea || null;
  }
  Object.assign(BANK, {
    // Knuckles on an old wooden door.
    knock(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 190 * p, to: 90, dur: 0.09, v: 0.45, a: 0.001 });
      hiss(out, t, { type: 'bandpass', f: 900 * p, q: 1.4, dur: 0.05, v: 0.3, crunch: true });
      return 0.15;
    },
    // The door swings open: a long wobbling hinge.
    creak(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 150 * p, to: 95 * p, dur: 0.85, v: 0.08, a: 0.05, lp: 1400, q: 4, vib: [11, 14] });
      blip(out, t, { at: 0.3, w: 'square', f: 420 * p, to: 330 * p, dur: 0.4, v: 0.025, lp: 1800, vib: [16, 20] });
      hiss(out, t, { type: 'lowpass', f: 400, dur: 0.9, v: 0.08, a: 0.2 });
      return 1.0;
    },
    // A treat: a happy arpeggio and a sparkle.
    treat(out, t, o, p) {
      [72, 76, 79, 84].forEach((n, i) => blip(out, t, { at: i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.14, v: 0.07, lp: 4800 }));
      blip(out, t, { at: 0.3, w: 'sine', f: mtof(96) * p, dur: 0.5, v: 0.05, vib: [8, 14] });
      return 0.85;
    },
    // A ghost: a wobbling "whooo" sliding down, then a low thump.
    boo(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 620 * p, to: 260 * p, dur: 0.9, v: 0.16, a: 0.08, vib: [6, 30] });
      blip(out, t, { w: 'triangle', f: 930 * p, to: 390 * p, dur: 0.8, v: 0.05, a: 0.1, vib: [6, 40] });
      blip(out, t, { at: 0.05, w: 'sine', f: 90, to: 45, dur: 0.25, v: 0.4 });
      return 1.0;
    },
    // A curse: a witch's cackle, five nasal bleeps tumbling down.
    cackle(out, t, o, p) {
      [88, 86, 84, 83, 81].forEach((n, i) => blip(out, t, { at: i * 0.09, w: 'square', f: mtof(n) * p, dur: 0.07, v: 0.06, lp: 2600, q: 5, vib: [40, 18] }));
      hiss(out, t, { at: 0.1, type: 'bandpass', f: 1400, q: 2, dur: 0.4, v: 0.05 });
      return 0.6;
    },
    // Candy: a wrapper crinkle and a tiny ding.
    candy(out, t, o, p) {
      for (let i = 0; i < 3; i++) hiss(out, t, { at: i * 0.03, type: 'highpass', f: 5200, dur: 0.025, v: 0.12 });
      blip(out, t, { at: 0.06, w: 'sine', f: mtof(88) * p, dur: 0.18, v: 0.06 });
      return 0.3;
    },
  });
  Object.assign(GAP, { knock: 0.1, creak: 0.8, treat: 0.5, boo: 0.6, cackle: 0.5, candy: 0.06 });
  NAMES.push('knock', 'creak', 'treat', 'boo', 'cackle', 'candy');

  /* ---------------------------------------------------------------- WIN (round 12)
     Winter Wonderclaw (DESIGN.md "Winter Wonderclaw (round 12)"): the winter
     title and map tunes carry a jingle, a sleigh bell hook in the old
     three-three-six rhythm on the bar's own chord tones (so it always fits
     the harmony), on the first four bars of each half; fights keep their
     tunes. And the advent present and Krampus get their sounds: a ribbon
     tug, the lid's pop, the present's jingle, a lump of coal. */
  // [step, chord-relative degree, length in steps] per bar of the hook.
  const WIN_JINGLE = [[[0, 2, 4], [4, 2, 4], [8, 2, 8]], [[0, 2, 4], [4, 2, 4], [8, 2, 8]], [[0, 2, 4], [4, 4, 4], [8, 0, 6], [14, 1, 2]], [[0, 2, 16]]];
  function winJingle(c, steps, base, b, tone) {
    const bar = b % 8;
    if (bar > 3) return;
    for (const [s, rel, d] of WIN_JINGLE[bar]) push(steps, base + s, { v: 'bell', n: tone(rel, 36), g: 0.9 * c.jingle, d });
    if (bar === 3) push(steps, base + 8, { v: 'sleigh', g: 1 });
  }
  Object.assign(BANK, {
    // A satin ribbon tugged: a rising zip of cloth and a little squeak.
    winRibbon(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 1800 * p, to: 5200 * p, q: 2.2, dur: 0.16, v: 0.22, a: 0.01 });
      blip(out, t, { at: 0.05, w: 'sine', f: 1300 * p, to: 1900 * p, dur: 0.08, v: 0.03 });
      return 0.25;
    },
    // The lid pops off: a cork pop and a bright ping.
    winPop(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 420 * p, to: 160 * p, dur: 0.07, v: 0.4, a: 0.001 });
      hiss(out, t, { type: 'bandpass', f: 1600 * p, q: 1.2, dur: 0.05, v: 0.3 });
      blip(out, t, { at: 0.04, w: 'triangle', f: mtof(88) * p, dur: 0.22, v: 0.05 });
      return 0.35;
    },
    // A present opens: sleigh bells shaking over a major arpeggio, then a chime.
    winGift(out, t, o, p) {
      [76, 79, 83, 88].forEach((n, i) => blip(out, t, { at: i * 0.06, w: 'triangle', f: mtof(n) * p, dur: 0.22, v: 0.08 }));
      for (let i = 0; i < 6; i++) hiss(out, t, { at: 0.02 + i * 0.055, type: 'highpass', f: 7200, q: 0.8, dur: 0.06, v: 0.07 });
      blip(out, t, { at: 0.26, w: 'sine', f: mtof(100) * p, dur: 0.6, v: 0.05, vib: [7, 12] });
      return 0.95;
    },
    // A lump of coal thuds into the bin, soot hissing off it.
    winCoal(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 120 * p, to: 55, dur: 0.14, v: 0.5, a: 0.001 });
      hiss(out, t, { type: 'lowpass', f: 900 * p, dur: 0.12, v: 0.25, crunch: true });
      hiss(out, t, { at: 0.05, type: 'bandpass', f: 3000, q: 0.7, dur: 0.25, v: 0.06, a: 0.03 });
      return 0.35;
    },
  });
  Object.assign(GAP, { winRibbon: 0.08, winPop: 0.2, winGift: 0.4, winCoal: 0.05 });
  NAMES.push('winRibbon', 'winPop', 'winGift', 'winCoal');

  /* ---------------------------------------------------------------- STORY (round 8)
     DESIGN.md "Stories, the rival and alternate bosses (round 8)": a story
     beat turning, a callback coming back around, Grabby Gary's laugh, the
     claw-off bell, the Plushie Queen's squeak, the Conveyor King's belt,
     the Arctic Arcade's freeze, the crab's snip and the hunted sting. */
  Object.assign(BANK, {
    // A page of the story turns: a paper flick and a soft two-note chime.
    stoPage(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2600 * p, q: 0.9, dur: 0.12, v: 0.12 });
      blip(out, t, { at: 0.06, w: 'sine', f: mtof(79) * p, dur: 0.22, v: 0.06 });
      blip(out, t, { at: 0.14, w: 'sine', f: mtof(84) * p, dur: 0.3, v: 0.05 });
      return 0.45;
    },
    // Something from earlier comes back: a harp run up and a bell on top.
    stoCallback(out, t, o, p) {
      [67, 71, 74, 79, 83, 86].forEach((n, i) => blip(out, t, { at: i * 0.05, w: 'triangle', f: mtof(n) * p, dur: 0.3, v: 0.06 }));
      blip(out, t, { at: 0.32, w: 'sine', f: mtof(91) * p, dur: 0.7, v: 0.06, vib: [6, 10] });
      return 1.0;
    },
    // Grabby Gary: a nasal "nyeh heh heh", three bleeps bouncing down.
    garyTaunt(out, t, o, p) {
      [76, 72, 69, 72, 67].forEach((n, i) => blip(out, t, { at: i * 0.085, w: 'square', f: mtof(n) * p, to: mtof(n - 2) * p, dur: 0.07, v: 0.06, lp: 2400, q: 6 }));
      return 0.55;
    },
    // The claw-off bell: ding ding.
    clawOffBell(out, t, o, p) {
      for (const at of [0, 0.18]) {
        blip(out, t, { at, w: 'sine', f: 1320 * p, dur: 0.6, v: 0.14 });
        blip(out, t, { at, w: 'sine', f: 2640 * p, dur: 0.35, v: 0.05 });
        hiss(out, t, { at, type: 'highpass', f: 6000, dur: 0.03, v: 0.1 });
      }
      return 0.85;
    },
    // A squeaky plush toy.
    plushSqueak(out, t, o, p) {
      blip(out, t, { w: 'square', f: 900 * p, to: 1500 * p, dur: 0.09, v: 0.07, lp: 3200, q: 8 });
      blip(out, t, { at: 0.1, w: 'square', f: 1400 * p, to: 800 * p, dur: 0.12, v: 0.06, lp: 3000, q: 8 });
      return 0.25;
    },
    // The conveyor starts: a motor spinning up, rollers clacking.
    beltRun(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 55 * p, to: 110 * p, dur: 0.7, v: 0.08, lp: 600 });
      for (let i = 0; i < 6; i++) hiss(out, t, { at: 0.08 + i * 0.1, type: 'bandpass', f: 1800, q: 3, dur: 0.03, v: 0.1, crunch: true });
      return 0.8;
    },
    // An item freezes into the block: a crackling crunch and a cold shimmer.
    iceGrow(out, t, o, p) {
      for (let i = 0; i < 5; i++) hiss(out, t, { at: i * 0.04, type: 'highpass', f: 4200 + i * 400, dur: 0.035, v: 0.12, crunch: true });
      blip(out, t, { at: 0.12, w: 'sine', f: mtof(96) * p, to: mtof(89) * p, dur: 0.5, v: 0.04, vib: [9, 20] });
      return 0.6;
    },
    // The Claw Crab snips twice.
    crabSnip(out, t, o, p) {
      for (const at of [0, 0.11]) {
        hiss(out, t, { at, type: 'bandpass', f: 3400 * p, q: 4, dur: 0.035, v: 0.2, crunch: true });
        blip(out, t, { at, w: 'triangle', f: 1900 * p, to: 700 * p, dur: 0.05, v: 0.08 });
      }
      return 0.3;
    },
    // Hunted: a low stab and a tense rising minor second.
    hunted(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 73 * p, dur: 0.6, v: 0.16, lp: 900 });
      blip(out, t, { at: 0.05, w: 'square', f: mtof(64) * p, dur: 0.5, v: 0.05, lp: 1800 });
      blip(out, t, { at: 0.05, w: 'square', f: mtof(65) * p, dur: 0.5, v: 0.05, lp: 1800 });
      return 0.7;
    },
  });
  Object.assign(GAP, { stoPage: 0.2, stoCallback: 0.8, garyTaunt: 0.5, clawOffBell: 0.6, plushSqueak: 0.06, beltRun: 0.5, iceGrow: 0.2, crabSnip: 0.2, hunted: 0.8 });
  NAMES.push('stoPage', 'stoCallback', 'garyTaunt', 'clawOffBell', 'plushSqueak', 'beltRun', 'iceGrow', 'crabSnip', 'hunted');
  /* ---------------------------------------------------------------- /STORY */

  /* ---------------------------------------------------------------- DUO (round 11)
     DESIGN.md "Duo: pass and play (round 11)": the hand-off card flipping
     over, the coin toss, the countdown and READY, a sabotage card slapped
     down, the crowd at the podium, and the taunts, each with its own voice
     (opts.v: kazoo, boing, trombone, horn, beatbox, mic, sing, cheer). */
  const DUO_V = {
    // "nyah nyah": a buzzy kazoo, two notes bouncing
    kazoo(out, t, p) {
      [[74, 0], [71, 0.16], [74, 0.3], [71, 0.44]].forEach(([n, at]) => blip(out, t, { at, w: 'sawtooth', f: mtof(n) * p, to: mtof(n - 1) * p, dur: 0.13, v: 0.07, lp: 1900, q: 7, vib: [22, 16] }));
      return 0.65;
    },
    // a cartoon spring: a boing sliding up and wobbling
    boing(out, t, p) {
      blip(out, t, { w: 'sine', f: 180 * p, to: 720 * p, dur: 0.45, v: 0.14, vib: [18, 60] });
      blip(out, t, { at: 0.02, w: 'triangle', f: 360 * p, to: 1400 * p, dur: 0.3, v: 0.04, vib: [18, 90] });
      return 0.5;
    },
    // the sad trombone: wah wah wah waaah, down a semitone each time
    trombone(out, t, p) {
      [[63, 0, 0.26], [62, 0.3, 0.26], [61, 0.6, 0.26], [60, 0.9, 0.8]].forEach(([n, at, dur]) => blip(out, t, { at, w: 'sawtooth', f: mtof(n - 12) * p, dur, v: 0.09, a: 0.04, lp: 900, q: 3, vib: at > 0.8 ? [6, 12] : null }));
      return 1.75;
    },
    // an air horn: three fat blasts, the last one long
    horn(out, t, p) {
      for (const [at, dur] of [[0, 0.16], [0.2, 0.16], [0.4, 0.55]]) {
        blip(out, t, { at, w: 'sawtooth', f: 466 * p, dur, v: 0.06, lp: 3200 });
        blip(out, t, { at, w: 'sawtooth', f: 587 * p, dur, v: 0.05, lp: 3200 });
        blip(out, t, { at, w: 'square', f: 233 * p, dur, v: 0.04, lp: 1800 });
      }
      return 0.95;
    },
    // boots and cats: kick, hat, snare, hat (the owners' own beat)
    beatbox(out, t, p) {
      const step = 0.13;
      for (let i = 0; i < 8; i++) {
        const at = i * step, k = i % 4;
        if (k === 0) blip(out, t, { at, w: 'sine', f: 140 * p, to: 42, dur: 0.14, v: 0.35 });
        else if (k === 2) { hiss(out, t, { at, type: 'bandpass', f: 1900, q: 0.9, dur: 0.1, v: 0.2 }); blip(out, t, { at, w: 'triangle', f: 210 * p, to: 150, dur: 0.07, v: 0.08 }); }
        else hiss(out, t, { at, type: 'highpass', f: 7000, dur: 0.035, v: 0.09 });
      }
      return 1.1;
    },
    // a mic drop: a thud, a clatter and a squeal of feedback
    mic(out, t, p) {
      blip(out, t, { w: 'sine', f: 110 * p, to: 40, dur: 0.22, v: 0.4 });
      hiss(out, t, { at: 0.02, type: 'bandpass', f: 900, q: 1.5, dur: 0.16, v: 0.15, crunch: true });
      blip(out, t, { at: 0.18, w: 'sine', f: 2900 * p, to: 3300 * p, dur: 0.6, v: 0.025, a: 0.15, vib: [5, 30] });
      return 0.85;
    },
    // a little sung line: la la la LA
    sing(out, t, p) {
      [[72, 0], [74, 0.16], [76, 0.32], [79, 0.5]].forEach(([n, at], i) => {
        blip(out, t, { at, w: 'triangle', f: mtof(n) * p, dur: i === 3 ? 0.5 : 0.15, v: 0.08, a: 0.02, vib: [6, 9] });
        blip(out, t, { at, w: 'sine', f: mtof(n + 12) * p, dur: i === 3 ? 0.4 : 0.12, v: 0.02 });
      });
      return 1.05;
    },
    // a cheer: a rising whoop and two claps
    cheer(out, t, p) {
      blip(out, t, { w: 'triangle', f: 380 * p, to: 820 * p, dur: 0.35, v: 0.08, vib: [9, 20] });
      for (const at of [0.34, 0.5]) hiss(out, t, { at, type: 'bandpass', f: 1500, q: 1.2, dur: 0.06, v: 0.22, crunch: true });
      return 0.65;
    },
  };
  Object.assign(BANK, {
    // The hand-off card flips over: a paper swish and a click.
    duoFlip(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 1600 * p, q: 0.8, dur: 0.22, v: 0.14, a: 0.06 });
      blip(out, t, { at: 0.2, w: 'triangle', f: 1400 * p, dur: 0.05, v: 0.08 });
      return 0.35;
    },
    // The coin toss: a thumb flick, the ring of the spin, a clink on landing (opts.land).
    duoCoin(out, t, o, p) {
      if (o && o.land) {
        blip(out, t, { w: 'sine', f: 2200 * p, dur: 0.35, v: 0.08 });
        blip(out, t, { at: 0.08, w: 'sine', f: 2750 * p, dur: 0.3, v: 0.05 });
        hiss(out, t, { type: 'highpass', f: 6000, dur: 0.03, v: 0.12 });
        return 0.45;
      }
      hiss(out, t, { type: 'highpass', f: 4000, dur: 0.03, v: 0.14 });
      for (let i = 0; i < 6; i++) blip(out, t, { at: 0.05 + i * 0.09, w: 'sine', f: (1800 + i * 90) * p, dur: 0.06, v: 0.035 });
      return 0.65;
    },
    // A countdown beep (opts.n: 3, 2, 1 climb).
    duoCount(out, t, o, p) {
      const n = Math.max(0, Math.min(5, (o && o.n) | 0));
      blip(out, t, { w: 'square', f: mtof(76 + (3 - n) * 2) * p, dur: 0.1, v: 0.06, lp: 3000 });
      return 0.15;
    },
    // READY: a bright arpeggio up.
    duoReady(out, t, o, p) {
      [76, 79, 84, 88].forEach((n, i) => blip(out, t, { at: i * 0.05, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.06, lp: 5000 }));
      return 0.4;
    },
    // A sabotage card slapped down: a card slap and a sneaky villain chord.
    duoSabo(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2400, q: 1.1, dur: 0.05, v: 0.3, crunch: true });
      [60, 63, 66].forEach((n) => blip(out, t, { at: 0.06, w: 'sawtooth', f: mtof(n - 12) * p, dur: 0.5, v: 0.05, lp: 1300 }));
      blip(out, t, { at: 0.06, w: 'square', f: mtof(81) * p, to: mtof(78) * p, dur: 0.35, v: 0.03, lp: 2400 });
      return 0.65;
    },
    // The crowd at the podium: a swell of cheering and a few claps.
    duoCrowd(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 1100, q: 0.6, dur: 1.4, v: 0.12, a: 0.35 });
      for (let i = 0; i < 7; i++) hiss(out, t, { at: 0.2 + i * 0.13 + (i % 3) * 0.02, type: 'bandpass', f: 1500 + (i % 3) * 300, q: 1.2, dur: 0.05, v: 0.14, crunch: true });
      blip(out, t, { at: 0.1, w: 'triangle', f: 520 * p, to: 900 * p, dur: 0.4, v: 0.04, vib: [8, 20] });
      return 1.45;
    },
    // A taunt or a cheer in its own voice (opts.v, the kazoo when unknown).
    duoTaunt(out, t, o, p) {
      const v = DUO_V[o && o.v] || DUO_V.kazoo;
      return v(out, t, p);
    },
    // DUO NET (round 15): online co-op's link chimes (opts.k): join (a friend is in: two notes up),
    // turn (your turn: a bright three-note call), lost (the line drops: two notes down), back (it is up again).
    duoLink(out, t, o, p) {
      const k = o && o.k, seq = k === 'lost' ? [79, 72] : k === 'turn' ? [72, 79, 84] : k === 'back' ? [72, 76, 79] : [76, 83];
      seq.forEach((n, i) => blip(out, t, { at: i * 0.09, w: k === 'lost' ? 'triangle' : 'square', f: mtof(n) * p, dur: 0.14, v: 0.06, lp: 4200 }));
      return 0.2 + seq.length * 0.09;
    },
  });
  Object.assign(GAP, { duoFlip: 0.2, duoCoin: 0.1, duoCount: 0.08, duoReady: 0.2, duoSabo: 0.3, duoCrowd: 1.0, duoTaunt: 0.4, duoLink: 0.3 });
  NAMES.push('duoFlip', 'duoCoin', 'duoCount', 'duoReady', 'duoSabo', 'duoCrowd', 'duoTaunt', 'duoLink');
  /* ---------------------------------------------------------------- /DUO */

  /* ---------------------------------------------------------------- FAMILY + REROLL (round 9)
     DESIGN.md "Enemy families (round 9)" and "Shop reroll (round 9)": a
     family walks on (a band count-in, a vending jingle, a choir chord), the
     Crescendo ticks up the scale, the SOLO's power chord, a cancelled SOLO's
     record scratch, cans and coins and a restock, the choir's hum, a
     shattered globe, the angry choir; the reroll's rare-card shine. */
  Object.assign(BANK, {
    // A family walks on: opts.fam band | vending | choir.
    famIntro(out, t, o, p) {
      const f = o && o.fam;
      if (f === 'vending') { [72, 76, 79, 84].forEach((n, i) => blip(out, t, { at: i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.09, v: 0.05, lp: 3000 })); return 0.5; }
      if (f === 'choir') { [60, 64, 67, 71].forEach((n) => blip(out, t, { w: 'sine', f: mtof(n) * p, dur: 0.9, v: 0.035, a: 0.12, vib: [5, 4] })); return 1.0; }
      // the band: stick clicks counting in, then a kick
      for (let i = 0; i < 3; i++) hiss(out, t, { at: i * 0.13, type: 'highpass', f: 5200, dur: 0.025, v: 0.14 });
      blip(out, t, { at: 0.39, w: 'sine', f: 120 * p, to: 45 * p, dur: 0.18, v: 0.22 });
      return 0.6;
    },
    // A Crescendo beat: a tom and a note climbing with the meter (opts.n 1..8).
    famBeat(out, t, o, p) {
      const n = Math.max(1, Math.min(8, (o && o.n) | 0 || 1));
      blip(out, t, { w: 'sine', f: 160 * p, to: 70 * p, dur: 0.12, v: 0.16 });
      blip(out, t, { at: 0.02, w: 'triangle', f: mtof([60, 62, 64, 65, 67, 69, 71, 72][n - 1]) * p, dur: 0.16, v: 0.07 });
      return 0.2;
    },
    // The SOLO is coming: a snare roll into a sustained bend.
    famReady(out, t, o, p) {
      for (let i = 0; i < 8; i++) hiss(out, t, { at: i * 0.045, type: 'bandpass', f: 1800, q: 1.2, dur: 0.04, v: 0.08 + i * 0.012 });
      blip(out, t, { at: 0.36, w: 'sawtooth', f: mtof(64) * p, to: mtof(66) * p, dur: 0.45, v: 0.05, lp: 2200, vib: [7, 12] });
      return 0.85;
    },
    // The SOLO: a distorted power chord and a cymbal.
    famSolo(out, t, o, p) {
      for (const n of [40, 47, 52]) blip(out, t, { w: 'sawtooth', f: mtof(n) * p, dur: 0.7, v: 0.07, lp: 1600, q: 3, det: n === 47 ? 8 : 0 });
      blip(out, t, { at: 0.18, w: 'square', f: mtof(76) * p, to: mtof(79) * p, dur: 0.4, v: 0.04, lp: 2600, vib: [6, 18] });
      hiss(out, t, { type: 'highpass', f: 6500, dur: 0.6, v: 0.1 });
      return 0.9;
    },
    // A SOLO knocked off: a record scratch and a deflating note.
    famCancel(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 900, to: 2600, q: 3, dur: 0.14, v: 0.16, crunch: true });
      hiss(out, t, { at: 0.15, type: 'bandpass', f: 2600, to: 700, q: 3, dur: 0.12, v: 0.14, crunch: true });
      blip(out, t, { at: 0.3, w: 'square', f: mtof(67) * p, to: mtof(55) * p, dur: 0.4, v: 0.05, lp: 1400 });
      return 0.75;
    },
    // A restock: the machine's clunk and a can's fizz.
    famRestock(out, t, o, p) {
      blip(out, t, { w: 'square', f: 150 * p, to: 80 * p, dur: 0.08, v: 0.12, lp: 900 });
      hiss(out, t, { at: 0.08, type: 'highpass', f: 3800, dur: 0.35, v: 0.08 });
      return 0.45;
    },
    // An empty can clattering in.
    famCan(out, t, o, p) {
      const k = o && o.i ? 1.2 : 1;
      blip(out, t, { w: 'triangle', f: 1400 * p * k, to: 900 * p * k, dur: 0.06, v: 0.08 });
      blip(out, t, { at: 0.07, w: 'triangle', f: 1100 * p * k, to: 700 * p * k, dur: 0.05, v: 0.06 });
      hiss(out, t, { type: 'bandpass', f: 3000, q: 4, dur: 0.05, v: 0.07, crunch: true });
      return 0.2;
    },
    // The Change Machine: a register's clunk and the coins sliding in.
    famChange(out, t, o, p) {
      blip(out, t, { w: 'square', f: 220 * p, to: 110 * p, dur: 0.06, v: 0.1, lp: 1200 });
      for (let i = 0; i < 4; i++) blip(out, t, { at: 0.08 + i * 0.05, w: 'triangle', f: (1900 - i * 120) * p, dur: 0.05, v: 0.05 });
      return 0.4;
    },
    // It breaks and pays out: a bell and a coin cascade.
    famPayout(out, t, o, p) {
      blip(out, t, { w: 'sine', f: mtof(88) * p, dur: 0.5, v: 0.08 });
      for (let i = 0; i < 8; i++) blip(out, t, { at: 0.05 + i * 0.045, w: 'triangle', f: (1500 + (i % 3) * 300) * p, dur: 0.05, v: 0.05 });
      return 0.6;
    },
    // The choir hums together: a soft "ooh" chord with a slow swell.
    famHum(out, t, o, p) {
      for (const n of [57, 64, 69, 72]) blip(out, t, { w: 'triangle', f: mtof(n) * p, dur: 0.8, v: 0.045, a: 0.15, lp: 1800, vib: [5, 5] });
      hiss(out, t, { at: 0.1, type: 'bandpass', f: 1200, q: 0.8, dur: 0.6, v: 0.04 });
      return 0.9;
    },
    // A globe shatters: glass and a falling chime.
    famShatter(out, t, o, p) {
      for (let i = 0; i < 6; i++) hiss(out, t, { at: i * 0.025, type: 'highpass', f: 4000 + i * 500, dur: 0.05, v: 0.14, crunch: true });
      [84, 79, 76, 72].forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.07, w: 'sine', f: mtof(n) * p, dur: 0.25, v: 0.05 }));
      return 0.5;
    },
    // The choir gets angry: a low minor cluster and a growl.
    famAngry(out, t, o, p) {
      for (const n of [45, 48, 51]) blip(out, t, { w: 'sawtooth', f: mtof(n) * p, dur: 0.6, v: 0.05, lp: 700 });
      hiss(out, t, { type: 'lowpass', f: 400, dur: 0.5, v: 0.1, crunch: true });
      return 0.7;
    },
    // A rare prize lands on the rerolled shelf: a bright two-note sparkle.
    rrShine(out, t, o, p) {
      blip(out, t, { w: 'sine', f: mtof(88) * p, dur: 0.18, v: 0.07 });
      blip(out, t, { at: 0.07, w: 'sine', f: mtof(95) * p, dur: 0.3, v: 0.06, vib: [9, 14] });
      hiss(out, t, { type: 'highpass', f: 8000, dur: 0.12, v: 0.05 });
      return 0.4;
    },
  });
  Object.assign(GAP, { famIntro: 0.8, famBeat: 0.05, famReady: 0.6, famSolo: 0.6, famCancel: 0.5, famRestock: 0.2, famCan: 0.05, famChange: 0.3, famPayout: 0.4, famHum: 0.5, famShatter: 0.2, famAngry: 0.5, rrShine: 0.08 });
  NAMES.push('famIntro', 'famBeat', 'famReady', 'famSolo', 'famCancel', 'famRestock', 'famCan', 'famChange', 'famPayout', 'famHum', 'famShatter', 'famAngry', 'rrShine');
  /* ---------------------------------------------------------------- /FAMILY + REROLL */

  /* ---------------------------------------------------------------- LORE (round 9)
     DESIGN.md "Lore and the weekly challenge (round 9)": the act intro's
     music sting in the floor's own voice (opts.biome: cellar synth arpeggio,
     foundry anvil and brass, vault music box, machine glitch; a loop gets a
     CRT boot), the typewriter under its lines, a Codex page turning up, the
     old high score board flickering on and a medal clinking onto the ribbon. */
  Object.assign(BANK, {
    loreSting(out, t, o, p) {
      duck(1.8, 0.35);
      const b = (o && o.biome) || 'cellar';
      if (b === 'foundry') {
        for (const at of [0, 0.3]) { hiss(out, t, { at, type: 'bandpass', f: 3200 * p, q: 6, dur: 0.05, v: 0.2, crunch: true }); blip(out, t, { at, w: 'triangle', f: 1480 * p, to: 1100 * p, dur: 0.25, v: 0.08 }); }
        [[43, 0.1], [46, 0.4], [50, 0.7]].forEach(([n, at]) => blip(out, t, { at, w: 'sawtooth', f: mtof(n) * p, dur: 0.9, v: 0.08, a: 0.04, lp: 900 }));
        hiss(out, t, { at: 1.0, type: 'highpass', f: 3000, dur: 0.5, v: 0.06, a: 0.1 });
      } else if (b === 'vault') {
        [79, 83, 86, 91, 86, 95].forEach((n, i) => { blip(out, t, { at: i * 0.16, w: 'sine', f: mtof(n) * p, dur: 0.8, v: 0.07 }); blip(out, t, { at: i * 0.16, w: 'sine', f: mtof(n + 12) * p, dur: 0.3, v: 0.02 }); });
      } else if (b === 'machine') {
        for (let i = 0; i < 8; i++) blip(out, t, { at: i * 0.07, w: 'square', f: mtof(40 + ((i * 7) % 12)) * p, dur: 0.06, v: 0.06, lp: 2200 });
        blip(out, t, { at: 0.6, w: 'sawtooth', f: 55 * p, dur: 1.1, v: 0.12, a: 0.05, lp: 500, vib: [6, 3] });
      } else if (b === 'loop') {
        blip(out, t, { w: 'sine', f: 1000 * p, dur: 0.12, v: 0.08 });
        blip(out, t, { at: 0.18, w: 'square', f: 2000 * p, dur: 0.05, v: 0.04, lp: 3000 });
        [60, 67, 72].forEach((n, i) => blip(out, t, { at: 0.35 + i * 0.12, w: 'triangle', f: mtof(n) * p, dur: 0.6, v: 0.06 }));
      } else {
        [60, 63, 67, 70, 72, 75].forEach((n, i) => blip(out, t, { at: i * 0.09, w: 'square', f: mtof(n) * p, dur: 0.12, v: 0.05, lp: 2600 }));
        blip(out, t, { at: 0.56, w: 'sawtooth', f: mtof(48) * p, dur: 1.0, v: 0.08, a: 0.03, lp: 800 });
        blip(out, t, { at: 0.56, w: 'triangle', f: mtof(72) * p, dur: 1.0, v: 0.05, a: 0.05, vib: [5, 4] });
      }
      return 1.6;
    },
    // One key of a typewriter on a very old terminal.
    loreType(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 4200 * p, q: 3, dur: 0.018, v: 0.1, crunch: true });
      blip(out, t, { w: 'square', f: 1800 * p, dur: 0.012, v: 0.02, lp: 3000 });
      return 0.05;
    },
    // A new Codex page: a page flick and a rising three-note chime.
    loreUnlock(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 2200 * p, q: 0.8, dur: 0.14, v: 0.1 });
      [72, 76, 83].forEach((n, i) => blip(out, t, { at: 0.08 + i * 0.08, w: 'triangle', f: mtof(n) * p, dur: 0.4, v: 0.06 }));
      return 0.7;
    },
    // The old high score board flickers on: a CRT thunk and a buzz.
    loreBoard(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 160 * p, to: 60, dur: 0.12, v: 0.2 });
      blip(out, t, { at: 0.05, w: 'sawtooth', f: 60 * p, dur: 0.4, v: 0.05, lp: 400 });
      hiss(out, t, { at: 0.03, type: 'highpass', f: 7000, dur: 0.25, v: 0.05 });
      return 0.5;
    },
    // A medal clinks onto its ribbon: a bright double chime over a major chord.
    wkMedal(out, t, o, p) {
      for (const at of [0, 0.12]) blip(out, t, { at, w: 'sine', f: 2100 * p, dur: 0.5, v: 0.08 });
      [67, 71, 74, 79].forEach((n, i) => blip(out, t, { at: 0.2 + i * 0.05, w: 'triangle', f: mtof(n) * p, dur: 1.1, v: 0.05, a: 0.02 }));
      return 1.3;
    },
  });
  Object.assign(GAP, { loreSting: 1.2, loreType: 0.035, loreUnlock: 0.5, loreBoard: 0.4, wkMedal: 0.8 });
  NAMES.push('loreSting', 'loreType', 'loreUnlock', 'loreBoard', 'wkMedal');
  /* ---------------------------------------------------------------- /LORE */

  // ---------------------------------------------------------------- music voices
  function playEvent(inst, ev, t) {
    const c = inst.song.cfg, sd = inst.song.stepDur, dest = inst.layer;
    const g = (ev.g || 1) * c.vol;
    switch (ev.v) {
      case 'bass':
        blip(dest, t, { w: c.bassWave, f: mtof(ev.n), dur: ev.d * sd, v: 0.3 * g, a: 0.006, lp: c.bassWave === 'triangle' ? 3000 : 700, q: 3 });
        break;
      case 'lead':
        if (c.dub && depLead(dest, t, ev, g, sd, c)) break;   // DEP: the muffled dub lead with its tape echo
        if (c.box && inst.mode === 'map') {
          // the vault's music box: a struck tine that rings out, a quiet octave overtone
          blip(dest, t, { w: 'sine', f: mtof(ev.n), dur: Math.max(0.5, ev.d * sd * 1.6), v: 0.17 * g, a: 0.003 });
          blip(dest, t, { w: 'sine', f: mtof(ev.n + 12), dur: 0.35, v: 0.045 * g, a: 0.002 });
          break;
        }
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
      // round 6, the acts' colour (ACT_CFG / accFlavor)
      case 'arp':
        blip(dest, t, { w: 'sawtooth', f: mtof(ev.n), dur: sd * 0.9, v: 0.035 * g, a: 0.003, lp: 2400, q: 6 });
        break;
      case 'clank':
        // an anvil: two inharmonic square partials through a band pass and a metal tick
        blip(dest, t, { w: 'square', f: mtof(ev.n), dur: 0.22, v: 0.05 * g, a: 0.001, bp: 2600, q: 9 });
        blip(dest, t, { w: 'square', f: mtof(ev.n) * 2.76, dur: 0.12, v: 0.03 * g, a: 0.001, bp: 5200, q: 9 });
        hiss(dest, t, { type: 'highpass', f: 6000, q: 0.7, dur: 0.03, v: 0.08 * g, crunch: true });
        break;
      case 'steam':
        hiss(dest, t, { type: 'bandpass', f: 3000, to: 900, q: 0.6, dur: sd * 6, v: 0.05 * g, a: 0.05 });
        break;
      case 'bell':
        blip(dest, t, { w: 'sine', f: mtof(ev.n), dur: 0.9, v: 0.05 * g, a: 0.002 });
        blip(dest, t, { w: 'triangle', f: mtof(ev.n) * 3.01, dur: 0.25, v: 0.012 * g, a: 0.001 });
        break;
      default: if (!depVoice(dest, t, ev, g, sd)) seaVoice(dest, t, ev, g, sd); break;   // SEASON: the organ and the sleigh bells; DEP: the bubbles
    }
  }

  // ---------------------------------------------------------------- sequencer
  function newLayer(t, xf, k) {
    const g = S.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(k || 1, t + (xf || XFADE));   // MIX: k is the mode's level (mixMusK)
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

  function startMode(mode, xf) {
    fadeAll(xf || XFADE);
    if (!LAYERED[mode]) { S.lay.hype = false; S.lay.tense = false; }
    if (!S.ac || mode === 'off' || !CFG[mode]) return;
    const t = now() + 0.05;
    const act = accActOf(mode);   // round 6: the act's variant of the tune
    const q = { mode, act, song: song(mode, act), layer: newLayer(t, xf, mixMusK(mode, act)), step: 0, next: t, fadeEnd: null };
    // Fight modes carry two extra layers on their own gains under the
    // mode's layer (so the mode crossfade still fades them): hype
    // (percussion on a streak or combo) and tense (low hp, phase two).
    if (LAYERED[mode]) {
      q.lay = layerSong(mode, act);
      q.lg = {}; q.lt = {};
      for (const k of LAYER_NAMES) {
        const g = S.ac.createGain();
        setP(g.gain, S.lay[k] ? 1 : 0.0001);
        g.connect(q.layer);
        q.lg[k] = g; q.lt[k] = S.lay[k] ? 1 : 0;
      }
    }
    S.seqs.push(q);
    tick();
  }

  // ---------------------------------------------------------------- dynamic fight music (round 3)
  /* The fight, elite and boss tunes layer up with the game's state: the base
     loop always, a hype layer (shaker 16ths, claps, tom fills closing each
     phrase) while the player is on a streak or just fired a combo, and a
     tense layer (a low pulsing drone, a heartbeat kick, a high tremolo
     minor second) under 30% hp or while a boss or elite is in phase two.
     musicState({hype, tense}) switches them with smooth setTargetAtTime
     crossfades; victory() plays a sting and fades the fight out. Layers
     ride the music bus, so the music toggle and volume apply. Each mode's
     layer tune is built once from its own seed (the base song is untouched). */
  const LAYERED = { fight: 1, elite: 1, boss: 1 };
  LAYERED.machine = 1;   // SECRET (round 6): The Machine's fight layers up like a boss
  const LAYER_NAMES = ['hype', 'tense'];
  const LAYER_FADE = 0.45;   // setTargetAtTime time constant (about 1.4 s to settle)
  const LAYER_TAIL = 2.5;    // a switched-off layer keeps playing this long while it fades
  function composeLayers(mode, act) {
    const base = song(mode, act);
    if (!base) return null;
    const c = base.cfg, rng = U.rng(U.hashStr('clawspire:layers:' + mode + (base.act ? ':act' + base.act : '')));
    const hype = [], tense = [];
    for (let i = 0; i < base.len; i++) { hype.push([]); tense.push([]); }
    const hi = c.root + 36;
    for (let b = 0; b < base.bars; b++) {
      const s0 = b * BAR, fill = b % PHRASE === PHRASE - 1;
      for (let s = 0; s < BAR; s++) {
        push(hype, s0 + s, { v: 'shaker', g: s % 4 === 0 ? 0.9 : s % 2 === 0 ? 0.55 : 0.35 });
        if (s === 4 || s === 12) push(hype, s0 + s, { v: 'clap', g: 1 });
        if (!fill && (s === 3 || s === 11) && rng.chance(0.45)) push(hype, s0 + s, { v: 'kick', g: 0.45 });
        if (fill && s >= 8 && s % 2 === 0) push(hype, s0 + s, { v: 'tom', n: c.root + 19 - (s - 8), g: 0.75 + (s - 8) * 0.04 });
        if (s % 2 === 0) push(tense, s0 + s, { v: 'trem', n: hi + (Math.floor(s / 4) % 2), d: 2, g: s % 4 === 0 ? 0.8 : 0.55 });
      }
      push(tense, s0, { v: 'drone', n: c.root, d: BAR, g: 1 });
      push(tense, s0, { v: 'hbeat', g: 1 });
      push(tense, s0 + 3, { v: 'hbeat', g: 0.65 });
      if (rng.chance(0.5)) push(tense, s0 + 8, { v: 'hbeat', g: 0.8 });
    }
    return { mode, hype, tense };
  }
  function layerSong(mode, act) {
    if (!LAYERED[mode] || !CFG[mode]) return null;
    const key = accSongKey(mode, act == null ? 0 : act);
    return S.lsongs[key] || (S.lsongs[key] = composeLayers(mode, act == null ? 0 : act));
  }
  function playLayerEvent(q, ev, t, dest) {
    const c = q.song.cfg, sd = q.song.stepDur, g = (ev.g || 1) * c.vol;
    switch (ev.v) {
      case 'shaker': hiss(dest, t, { type: 'highpass', f: 9000, q: 0.8, dur: 0.03, v: 0.07 * g }); break;
      case 'clap':
        for (let i = 0; i < 3; i++) hiss(dest, t, { at: i * 0.011, type: 'bandpass', f: 1300, q: 1.1, dur: i === 2 ? 0.11 : 0.02, v: 0.16 * g, crunch: i === 2 });
        break;
      case 'kick': blip(dest, t, { w: 'sine', f: 140, to: 45, dur: 0.14, v: 0.4 * g, a: 0.002 }); break;
      case 'tom': blip(dest, t, { w: 'triangle', f: mtof(ev.n), to: mtof(ev.n) * 0.6, dur: 0.16, v: 0.28 * g, a: 0.002 }); break;
      case 'drone': blip(dest, t, { w: 'sawtooth', f: mtof(ev.n), dur: ev.d * sd, v: 0.11 * g, a: 0.25, lp: 420, q: 4, vib: [0.5, mtof(ev.n) * 0.012] }); break;
      case 'hbeat': blip(dest, t, { w: 'sine', f: 62, to: 38, dur: 0.16, v: 0.5 * g, a: 0.003 }); break;
      case 'trem': blip(dest, t, { w: 'square', f: mtof(ev.n), dur: ev.d * sd * 0.8, v: 0.03 * g, a: 0.01, lp: 3200, vib: [11, mtof(ev.n) * 0.02] }); break;
      default: break;
    }
  }
  // The game says what the fight feels like (called every frame; only a
  // change does anything). Returns the layers now on.
  function musicState(o) {
    o = o || {};
    const t = now();
    let changed = false;
    for (const k of LAYER_NAMES) {
      const want = !!o[k];
      if (S.lay[k] === want) continue;
      S.lay[k] = want; changed = true;
      if (!want) S.layT[k] = t + LAYER_TAIL;
      for (const q of S.seqs) {
        if (!q.lg || !q.lg[k] || q.fadeEnd != null) continue;
        q.lt[k] = want ? 1 : 0;
        try {
          const gp = q.lg[k].gain;
          if (gp.cancelScheduledValues) gp.cancelScheduledValues(t);
          gp.setTargetAtTime(want ? 1 : 0.0001, t, LAYER_FADE);
        } catch (e) { /* a minimal fake */ }
      }
    }
    return { hype: S.lay.hype, tense: S.lay.tense, changed };
  }
  // The last enemy fell: fade the fight out under a short major-key sting in
  // the fight tune's key, on the music bus. False when music is off.
  function victory() {
    S.lay.hype = false; S.lay.tense = false;
    if (!S.ac || !prefs().music) return false;
    const q = S.seqs.find((x) => x.fadeEnd == null && LAYERED[x.mode]);
    const c = (q && q.song.cfg) || CFG.fight;
    fadeAll(0.6);
    S.want = 'off';
    try {
      const t = now() + 0.04, sd = 60 / c.bpm / 4;
      const out = S.ac.createGain();
      setP(out.gain, 0.9 * c.vol);
      out.connect(S.musBus);
      const r = c.root + 24;
      [0, 4, 7, 12].forEach((n, i) => blip(out, t, { at: i * sd, w: 'square', f: mtof(r + n), dur: sd * 1.1, v: 0.1, lp: 4200 }));
      const hold = t + sd * 4;
      for (const n of [0, 4, 7, 12, 16]) blip(out, hold, { w: n === 0 ? 'triangle' : 'square', f: mtof(r + n - (n === 0 ? 12 : 0)), dur: 1.1, v: n === 0 ? 0.22 : 0.055, a: 0.01, lp: 3000, vib: [5.5, mtof(r + n) * 0.01] });
      blip(out, hold, { w: 'sine', f: 150, to: 40, dur: 0.25, v: 0.5, a: 0.002 });
      hiss(out, hold, { type: 'highpass', f: 5000, q: 0.5, dur: 0.9, v: 0.12 });
      return true;
    } catch (e) { return false; }
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
        // the dynamic fight layers: scheduled while on, and through their fade tail
        if (q.lay) for (const k of LAYER_NAMES) {
          if (!S.lay[k] && t > S.layT[k]) continue;
          const evs = q.lay[k][q.step];
          if (evs) for (const ev of evs) { try { playLayerEvent(q, ev, at, q.lg[k]); queued++; } catch (e) { /* never kills the loop */ } }
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
    if (mode === S.want && (mode === 'off' || S.seqs.some((q) => q.mode === mode && q.fadeEnd == null && (q.act || 0) === accActOf(mode)))) return;
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
      if (S.master) S.master.gain.setTargetAtTime(0.9 * (S.vMaster == null ? 1 : S.vMaster), t, 0.03);
    } catch (e) { /* ignore */ }
  }
  // Round 6: the settings' master volume (0..1) over both buses; the sound
  // and music toggles still mute their own bus. Remembered before init.
  function setMaster(v) {
    if (v != null && isFinite(+v)) S.vMaster = U.clamp(+v, 0, 1);
    applyVol();
    return S.vMaster == null ? 1 : S.vMaster;
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

  // ---------------------------------------------------------------- intro stinger
  // A 10 second timeline for INTRO (js/intro.js), scheduled in one go against
  // the AudioContext clock so it stays locked to the picture. Built from the
  // sfx bank and the fight tune, through its own bus so a skip can cut it.
  const INTRO_LEN = 10;
  const INTRO_SEED = 0x1A70;
  function introSchedule(bus, t0) {
    const ac = S.ac;
    // One voice of a bank entry at t0 + at, with its own level and pitch.
    const v = (name, at, o) => {
      const fn = BANK[name];
      if (!fn) return;
      o = o || {};
      const g = ac.createGain();
      setP(g.gain, (LEVEL[name] || 1) * (o.vol == null ? 1 : o.vol));
      g.connect(bus);
      fn(g, t0 + at, o, U.clamp(o.pitch == null ? 1 : o.pitch, 0.25, 4));
    };
    const whip = (at) => {
      hiss(bus, t0 + at, { type: 'bandpass', f: 500, to: 4200, q: 1.2, dur: 0.1, v: 0.3, a: 0.01 });
      hiss(bus, t0 + at, { type: 'highpass', f: 6000, dur: 0.02, v: 0.15 });
    };
    // 0.0-1.0 the drop: a dying bulb, the marquee chase, the bass hit, the slam.
    [0.03, 0.09, 0.16, 0.24, 0.31, 0.36].forEach((at, i) => blip(bus, t0, { at, w: 'square', f: 3200 - i * 120, to: 2200, dur: 0.02, v: 0.05 }));
    blip(bus, t0, { at: 0.0, w: 'sine', f: 60, dur: 0.42, v: 0.05, a: 0.05, vib: [8, 3] });
    v('hitBig', 0.4, { vol: 1.25, pitch: 0.85 });
    for (let i = 0; i < 13; i++) blip(bus, t0, { at: 0.4 + i * 0.023, w: 'square', f: 700 + i * 90, dur: 0.045, v: 0.07, lp: 5000 });
    v('clawDrop', 0.62, { vol: 1.1 });
    v('clawMove', 0.62, { pitch: 1.1 }); v('clawMove', 0.74, { pitch: 1.25 }); v('clawMove', 0.86, { pitch: 1.4 });
    hiss(bus, t0, { at: 0.64, type: 'bandpass', f: 300, to: 3200, q: 1.5, dur: 0.36, v: 0.28, a: 0.1 });
    // 1.0-3.0 the scatter: the impact, a slow-motion clatter, the close, the rise.
    v('hitBig', 1.0, { vol: 1.35, pitch: 0.7 });
    v('clawTouch', 1.0, { pitch: 0.8 });
    v('shake', 1.02, { vol: 0.8 });
    for (let i = 0; i < 15; i++) v('itemLand', 1.06 + i * 0.066 + (i % 3) * 0.012, { mass: 0.8 + (i % 4) * 0.7, vel: 1 - i * 0.04, pitch: 0.55 + (i % 5) * 0.06, vol: 0.9 });
    v('clawClose', 2.1, { pitch: 0.95 });
    v('clawLift', 2.35, { pitch: 1.35, vol: 1.1 });
    for (let i = 0; i < 6; i++) v('itemLand', 2.45 + i * 0.09, { mass: 0.6 + (i % 3) * 0.5, vel: 0.8, pitch: 1 + (i % 3) * 0.1 });
    v('itemSlip', 2.6, { vol: 0.6 });
    // 3.0-5.5 the fight montage: whips, the lunge, the sword hit, the stamps, the freeze.
    whip(3.0);
    hiss(bus, t0, { at: 3.05, type: 'lowpass', f: 400, to: 1800, dur: 0.3, v: 0.25, a: 0.05 });
    v('hitBig', 3.3, { vol: 0.55, pitch: 0.9 });
    v('step', 3.36, { pitch: 0.7, vol: 1.2 });
    whip(3.6);
    hiss(bus, t0, { at: 3.62, type: 'bandpass', f: 700, to: 2600, q: 2, dur: 0.2, v: 0.22, a: 0.02 });
    v('hit', 3.82, { amt: 12, vol: 1.2 });
    v('hitBig', 3.82, { vol: 1.1 });
    v('coin', 3.86, { pitch: 1.2, vol: 0.8 });
    whip(4.2);
    v('burn', 4.23, { vol: 1.1 });
    v('poison', 4.35, { vol: 1.1 });
    v('freeze', 4.5, { vol: 1.2 });
    v('hitBig', 4.54, { vol: 0.6, pitch: 1.2 });
    whip(4.85);
    v('block', 4.86, { pitch: 1.3 });
    v('freeze', 5.0, { pitch: 1.4, vol: 0.5 });
    v('hit', 5.17, { amt: 7 });
    v('block', 5.17, { pitch: 0.9, vol: 1.1 });
    // 5.5-7.5 the climb: a riser, ink splashes and steps racing up the road, the boss hit.
    whip(5.5);
    blip(bus, t0, { at: 5.5, w: 'sawtooth', f: 55, to: 440, lin: true, dur: 1.85, v: 0.13, a: 0.2, lp: 1100, q: 2 });
    blip(bus, t0, { at: 5.5, w: 'square', f: 110, to: 880, lin: true, dur: 1.85, v: 0.05, a: 0.4, lp: 1600 });
    hiss(bus, t0, { at: 5.5, type: 'bandpass', f: 250, to: 5200, q: 0.9, dur: 1.85, v: 0.22, a: 0.6 });
    for (let i = 0; i < 12; i++) v('reveal', 5.6 + i * 0.14, { pitch: 0.9 + i * 0.07, vol: 0.8 });
    for (let i = 0; i < 14; i++) v('step', 5.62 + i * 0.12, { pitch: 0.8 + i * 0.06, vol: 0.7 });
    v('boss', 7.3, { vol: 0.9 });
    v('hitBig', 7.3, { vol: 1.35, pitch: 0.8 });
    // 7.5-10 the name: a chord stab, nine metal clacks, the fight lead, the claw opening, typing, the fanfare.
    whip(7.5);
    v('hitBig', 7.5, { vol: 0.8 });
    const sg = song('fight');
    if (sg) {
      const c = sg.cfg, scale = SCALES[c.scale];
      const root = c.root + 12;
      [0, 2, 4].forEach((d) => blip(bus, t0, { at: 7.5, w: 'square', f: mtof(root + deg2semi(scale, d) + 12), dur: 0.5, v: 0.08, a: 0.004, lp: 2200 }));
      blip(bus, t0, { at: 7.5, w: 'triangle', f: mtof(root - 12), dur: 0.6, v: 0.2 });
      // the lead motif and its bass under the logo, from the tune's first bars
      const layer = ac.createGain(); setP(layer.gain, 0.85); layer.connect(bus);
      const inst = { song: sg, layer };
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        for (const ev of sg.steps[i]) {
          try { playEvent(inst, ev, t0 + 7.6 + i * sg.stepDur); } catch (e) { /* one bad note never stops the stinger */ }
        }
      }
    }
    for (let i = 0; i < 9; i++) {
      v('clawClose', 7.55 + i * 0.08 + 0.1, { pitch: 0.9 + i * 0.05, vol: 0.75 });
      v('hit', 7.55 + i * 0.08 + 0.1, { amt: 4, vol: 0.5 });
    }
    v('clawRelease', 8.45, { vol: 1.1 });
    for (let i = 0; i < 22; i++) v('click', 8.65 + i * 0.034, { pitch: 1.4 + (i % 3) * 0.15, vol: 0.6 });
    v('hitBig', 9.6, { vol: 1.4 });
    v('jackpot', 9.62, { vol: 0.9 });
    [60, 64, 67, 72].forEach((n) => blip(bus, t0, { at: 9.6, w: 'square', f: mtof(n), dur: 0.5, v: 0.07, lp: 3500, vib: [6, 4] }));
    blip(bus, t0, { at: 9.6, w: 'triangle', f: mtof(48), dur: 0.55, v: 0.2 });
  }

  /* Schedules the whole stinger from t0 (default: now). Returns a handle
     {t0, end, stop()} or null before init (or with both channels off,
     unless o.force). Deterministic: the per-call rng is reseeded. */
  function intro(t0, o) {
    o = o || {};
    if (!S.ac) return null;
    if (!o.force && !prefs().sfx && !prefs().music) return null;
    const ac = S.ac;
    const t = t0 == null ? now() + 0.05 : +t0;
    const bus = ac.createGain();
    const level = o.level == null ? Math.max(S.vSfx, S.vMus) * 0.9 : o.level;
    try { bus.gain.setValueAtTime(level, t); bus.gain.setValueAtTime(level, t + INTRO_LEN - 0.1); bus.gain.linearRampToValueAtTime(0.0001, t + INTRO_LEN); } catch (e) { setP(bus.gain, level); }
    bus.connect(S.comp || S.master || ac.destination);
    const saved = S.r;
    S.r = U.rng(INTRO_SEED);
    try { introSchedule(bus, t); } catch (e) { /* a broken voice never kills the rest */ }
    S.r = saved;
    let stopped = false;
    return {
      t0: t, end: t + INTRO_LEN,
      stop() {
        if (stopped) return;
        stopped = true;
        try {
          const n = now();
          if (bus.gain.cancelScheduledValues) bus.gain.cancelScheduledValues(n);
          bus.gain.setValueAtTime(bus.gain.value == null ? level : bus.gain.value, n);
          bus.gain.linearRampToValueAtTime(0.0001, n + 0.08);
        } catch (e) { setP(bus.gain, 0); }
        try { if (typeof setTimeout === 'function') setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 200); } catch (e) { /* ignore */ }
      },
    };
  }

  // Runs fn with the graph temporarily built on another context (the
  // offline renderer), then puts the live graph back.
  function withContext(ac, fn) {
    const keys = ['ac', 'comp', 'master', 'sfxBus', 'musBus', 'duckG', 'white', 'crunch', 'minorG', 'lim', 'dk', 'vox'];   // MIX: the minor bus, the limiter, the duck and voice state stay the live graph's
    const saved = {};
    for (const k of keys) saved[k] = S[k];
    try { S.dk = mixDuckFresh(); S.vox = []; build(ac); return fn(); } finally { for (const k of keys) S[k] = saved[k]; }
  }
  // AudioBuffer -> 16-bit PCM WAV (RIFF) ArrayBuffer.
  function encodeWav(buf) {
    const ch = Math.max(1, buf.numberOfChannels || 1), n = buf.length | 0, sr = buf.sampleRate || 44100;
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    const out = new ArrayBuffer(44 + n * ch * 2);
    const dv = new DataView(out);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
    let p = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const s = U.clamp(data[c][i] || 0, -1, 1);
        dv.setInt16(p, s < 0 ? s * 32768 : s * 32767, true);
        p += 2;
      }
    }
    return out;
  }
  /* Renders the stinger offline (44.1 kHz stereo) and resolves to a WAV
     ArrayBuffer. Needs window.OfflineAudioContext; no user gesture required. */
  function renderIntroWav(seconds) {
    const sec = U.clamp(+seconds || INTRO_LEN, 1, 60);
    const Wn = typeof window !== 'undefined' ? window : null;
    const OC = Wn && (Wn.OfflineAudioContext || Wn.webkitOfflineAudioContext);
    if (!OC) return Promise.reject(new Error('no OfflineAudioContext'));
    const sr = 44100;
    let oc;
    try { oc = new OC(2, Math.round(sr * sec), sr); } catch (e) { return Promise.reject(e); }
    try {
      withContext(oc, () => intro(0.02, { force: true, level: 0.72 }));
    } catch (e) { return Promise.reject(e); }
    let p;
    try { p = oc.startRendering(); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(p).then((buf) => encodeWav(buf));
  }

  /* ================================================================ MIX (round 10)
     The mix pass (DESIGN.md "Mix and juice pass 2"). Every sfx sits in a
     loudness tier: ui ticks quiet, soft for the machine's own clatter, mid
     for hits and pickups, big for crushing moments, huge for the stings
     (jackpot, boss down, evolution, a legendary capsule, win and lose).
     Each voice was rendered offline (an OfflineAudioContext, K-weighted,
     the loudest 100 ms window) and MIX_TRIM holds the dB that lands it on
     its tier's target (MIX_TARGET, +-MIX_WIN). A tier is also a voice
     category with its own cap (MIX_CAP; the global MAX_VOICES never stops
     a sting). The ui, soft and mid voices ride S.minorG so a sting ducks
     them with the music (mixSting); ducks merge instead of cutting each
     other short (mixRamp); a hit-sized voice only dips the music
     (mixDuckShape). The repeated sounds (footsteps, ticks, hits, landings)
     get a seeded pitch and level spread that never repeats the same note
     twice in a row (mixVary). A limiter after the master gain is the last
     word (mixLimiter). */
  const MIX_TIERS = ['tick', 'ui', 'soft', 'mid', 'big', 'huge'];
  const MIX_TARGET = { tick: -38, ui: -32, soft: -28, mid: -24, big: -19.5, huge: -15.5 };   // dB, K-weighted, loudest 100 ms, pre-bus
  const MIX_WIN = 2.5;                  // +- dB a trimmed voice may sit from its target
  const MIX_TRIM_MAX = [-14, 12];       // how far a trim may pull or push a voice
  const MIX_CAP = { tick: 3, ui: 4, soft: 8, mid: 10, big: 6, huge: 3 };
  const MIX_MINOR = { tick: 1, ui: 1, soft: 1, mid: 1 };   // the tiers a sting ducks
  const MIX_STING = { huge: 1 };
  const MIX_LIST = {
    tick: 'tick wheelTick loreType roulette ticket diceRoll',
    ui: 'click cardFlip tally peg boonFlip stoPage footstep step bloom roamStep petHop cmpFeed vaultEquip twinSeek famBeat candy beep wheelSpin shuffle rosPop schChalk',
    soft: 'clawMove clawDrop clawTouch clawClose clawLift clawRelease itemLand itemSlip whoosh tinkle squish slosh chime boing fuse ' +
      'magHum magDrop scoopSlosh handSquish hookFire twinClick vacWhoosh vacSlurp vacBlow turBuild clawCoin clawSpin clawTap ' +
      'plinkDrop lever reelSpin reelStop skeeRoll skeeHop drip sizzle petChirp petAct petLove giggle dig magLift ' +
      'beltRun iceGrow secHum secGrav glassCrack creak knock molePop diceLand famCan famHum plushSqueak rrShine ' +
      'arcLose arcIn petHonk moleCombo ticketSpray boonDeal petSyn secVoice crabSnip famReady famChange groan rosBlow rosSlide rosSweep winRibbon winCoal',
    big: 'hitBig crit combo upgrade relic capUpgrade slam boom roar vsSlam kaboom turMega arcWin ambush famSolo ' +
      'cmpCrunch doorOpen loreSting wkMedal fanfare lucky lose stingBoss rosCombo schPass winGift',
    huge: 'jackpot win victory capBurst double bossDown arcJackpot setDone evoBurst powerDown boss',
  };
  // mid (the default): hits, blocks, statuses, pickups, the stingElite, clawCheer, petLevel, setPiece, evoRise ...
  const MIX_TIER = {};
  for (const k in MIX_LIST) for (const n of MIX_LIST[k].split(' ')) if (n) MIX_TIER[n] = k;
  // dB per voice on top of LEVEL (measured, see DESIGN.md); a voice not listed plays at its LEVEL
  const MIX_TRIM = {
    clawMove: 5.5, clawDrop: -1, clawTouch: -0.5, clawClose: -6, clawLift: -2, clawRelease: -6, itemLand: -3.5, itemSlip: -3.5, chute: -6.5,
    jackpot: 2, hit: -1.5, hitBig: -7.5, block: -0.5, heal: 0.5, poison: 4, burn: 5, freeze: -2.5, shake: -5.5, enemyDie: -1.5, win: 2, lose: 8,
    click: 1, buy: 2, reveal: -1, brush: -1.5, step: -2.5, coin: 4.5, upgrade: 7.5, turn: 4, boss: 5, proc: 3, combo: 4.5, crit: -8.5, shatter: -1.5,
    tick: 4.5, cardFlip: 2.5, relic: 5, footstep: 4.5, bloom: 0.5, heartbeat: 0.5, whoosh: 8, stamp: -2.5, victory: 2.5, capDrop: -2.5, capCrack: -3,
    capUpgrade: 3.5, capBurst: -1.5, ticket: 1.5, tally: -3.5, slam: -2, roulette: -0.5, double: 2, clank: 0.5, tinkle: -0.5, crack: -4, thud: -4,
    boing: -4.5, squish: 3, slosh: 4.5, fuse: -3, beep: -0.5, boom: -12.5, groan: 5, fanfare: 6, ding: 0.5, lucky: 6.5, gulp: -4.5, burp: 1,
    roar: -3.5, sticker: 3.5, discover: 5.5, tiltUp: 5.5, vsSlam: -10.5, rumble: -6, stomp: -7.5, coinSpill: -3.5, sizzle: -11, drip: -4.5,
    freezeOver: 6, iceBreak: -7.5, hijack: 8, shuffle: 5.5, alarm: 7, kaboom: -8.5, bossDown: 3, stingBoss: 8, stingElite: 8, clawCoin: -6,
    clawSpin: 4, clawTap: 4, clawCheer: 7.5, magHum: 1.5, magZap: -1, magDrop: 5.5, scoopSlosh: -2.5, hookFire: -1.5, hookThunk: -2, vacWhoosh: 3,
    vacSlurp: -2, vacClog: -1.5, vacBlow: 0.5, twinSeek: 2, twinClick: 1.5, turBuild: 3.5, turUp: 7, turFire: 5.5, turMega: -3.5, plinkDrop: 1,
    wheelSpin: 8.5, wheelTick: 5.5, lever: -5.5, reelSpin: 8, reelStop: -6, drumroll: 4, arcWin: 10, arcJackpot: 2.5, arcLose: 8.5, arcIn: 7,
    diceRoll: 10, diceLand: -1.5, roamWake: 5.5, roamStep: -4.5, ambush: 1.5, giggle: 6.5, gooSplat: 5.5, magLift: 2.5, boo: -6.5, dozer: 3.5,
    rivalClaw: 8.5, petChirp: 2.5, petHop: 2, petAct: 1, petCrunch: 3.5, petHonk: 10.5, petLevel: 7.5, petLove: 3, molePop: 3, bonk: -1.5,
    moleBomb: -9, moleCombo: 7.5, whistle: 2, skeeRoll: 6.5, skeeHop: -3, skeeRing: -0.5, ticketSpray: 6, vaultOpen: 5.5, vaultBuy: 1,
    vaultEquip: -1.5, vaultNew: 7, vaultDupe: 9, vaultShare: 1, setPiece: 6, boonDeal: 5, boonFlip: -0.5, boonPick: -3.5, cmpFeed: -2.5,
    cmpPress: 6.5, cmpCrunch: -8.5, cmpPop: 0.5, evoRise: 5.5, evoBurst: -2, petSyn: 5.5, keyGet: 4, doorOpen: 0.5, secZap: 1, secShutter: -6,
    secClang: -3.5, secGrav: -5.5, secFlood: 2.5, glassCrack: -4.5, secVoice: 8, secHum: 2.5, powerDown: 2.5, creditsChime: 3.5, knock: -6,
    creak: 2.5, treat: 5.5, cackle: 9, candy: -2.5, stoPage: 0.5, stoCallback: 4.5, garyTaunt: 9, clawOffBell: -2, plushSqueak: 4, beltRun: 4.5,
    iceGrow: 2.5, crabSnip: 6, hunted: 1, famIntro: 2, famBeat: -3, famReady: 8, famSolo: 4, famCancel: 8, famRestock: 4.5, famCan: 7.5,
    famChange: 5.5, famPayout: 3.5, famHum: -1, famShatter: 5.5, famAngry: 5, rrShine: 1, loreSting: 8.5, loreType: 5.5, loreUnlock: 8, loreBoard: 3,
    wkMedal: 7,
    // round 10 (ROS): Ms. Bubbles and the new pets
    rosBlow: -3, rosPop: -3.5, rosCombo: 8, rosQuake: 1.5, rosSlide: 5, rosSweep: 7.5,
    // round 11 (SCHOOL): the bell, a star, the pass, a try again, chalk
    schBell: 6, schStar: 4, schPass: 7.5, schFail: 4, schChalk: 10,
    // round 12 (WIN): the advent present's ribbon (soft), its jingle (big), Krampus's coal (soft); the lid's pop sits on mid untrimmed
    winRibbon: 6.5, winGift: 8.5, winCoal: -8.5,
  };
  // [pitch spread (fraction), level spread (dB)] for the sounds that repeat back to back
  const MIX_VARY = {};
  for (const n of ['footstep', 'step', 'roamStep', 'petHop', 'itemLand', 'clank', 'thud', 'tinkle', 'hit', 'block', 'bonk', 'molePop', 'knock',
    'hookThunk', 'magZap', 'famCan', 'secClang', 'glassCrack', 'skeeHop', 'turFire', 'vacSlurp', 'coin', 'candy', 'plushSqueak', 'cmpFeed', 'rosPop']) MIX_VARY[n] = [0.045, 1.5];
  for (const n of ['tick', 'click', 'peg', 'wheelTick', 'reelStop', 'ticket', 'loreType', 'cardFlip', 'roulette', 'famBeat', 'twinClick']) MIX_VARY[n] = [0.02, 1];
  const MIX_SEED = 0x313;
  const MIX_DUCK = { att: 0.05, rel: 0.5, musBig: 0.6, holdBig: 0.4, minor: 0.5, minorHold: 1.1, stingMus: 0.35 };
  const MIX_LIM = { threshold: -2, knee: 0, ratio: 20, attack: 0.002, release: 0.12 };
  S.dk = mixDuckFresh(); S.vox = []; S.mr = U.rng(MIX_SEED); S.rep = {}; S.vary = { p: 1, v: 1 }; S.lastVary = null;

  function mixTier(name) { return MIX_TIER[name] || 'mid'; }
  function mixLevel(name) { const tr = MIX_TRIM[name]; return (LEVEL[name] || 1) * (tr ? Math.pow(10, tr / 20) : 1); }
  // The brick wall after the master gain; null on a context without compressors.
  function mixLimiter(ac) {
    if (!ac || !ac.createDynamicsCompressor) return null;
    try {
      const l = ac.createDynamicsCompressor();
      setP(l.threshold, MIX_LIM.threshold); setP(l.knee, MIX_LIM.knee); setP(l.ratio, MIX_LIM.ratio);
      setP(l.attack, MIX_LIM.attack); setP(l.release, MIX_LIM.release);
      return l;
    } catch (e) { return null; }
  }
  // Room for one more voice of this tier at t (finished voices are pruned).
  function mixVoiceOk(tier, t) {
    const v = S.vox;
    let n = 0, all = 0;
    for (let i = v.length - 1; i >= 0; i--) {
      if (v[i].end <= t) { v.splice(i, 1); continue; }
      all++; if (v[i].tier === tier) n++;
    }
    if (n >= (MIX_CAP[tier] || 8)) return false;
    return !!MIX_STING[tier] || all < MAX_VOICES;
  }
  function mixVoiceAdd(tier, end) { S.vox.push({ tier, end }); }
  /* The spread for a repeated sound: a seeded pitch and level offset, never
     within a third of the spread of the last one (no machine gun). One
     reused object; S.lastVary is what the tests read. */
  function mixVary(name, t) {
    const r = S.vary;
    r.p = 1; r.v = 1;
    const sp = MIX_VARY[name];
    if (!sp) return r;
    const last = S.rep[name];
    let dp = (S.mr() * 2 - 1) * sp[0];
    if (last && Math.abs(dp - last.dp) < sp[0] * 0.35) {
      // too close to the last one: step half the spread away, the way that stays in range
      const up = dp >= last.dp ? 1 : -1;
      dp = last.dp + up * sp[0] * 0.5;
      if (Math.abs(dp) > sp[0]) dp = last.dp - up * sp[0] * 0.5;
    }
    const dv = (S.mr() * 2 - 1) * sp[1];
    if (last) { last.dp = dp; last.t = t; } else S.rep[name] = { dp, t };
    r.p = 1 + dp; r.v = Math.pow(10, dv / 20);
    S.lastVary = { name, p: r.p, v: r.v };
    return r;
  }
  function mixDuckFresh() { return { mus: { t0: null, from: 1, depth: 1, until: -1, end: -1 }, minor: { t0: null, from: 1, depth: 1, until: -1, end: -1 } }; }
  // A duck asked for from inside a hit-sized voice is a short shallow dip.
  function mixDuckShape(hold, depth) {
    const sh = S.dsh || (S.dsh = { hold: 0, depth: 1 });
    if (S.cur && !MIX_STING[S.cur]) { sh.hold = Math.min(hold, MIX_DUCK.holdBig); sh.depth = Math.max(depth, MIX_DUCK.musBig); }
    else { sh.hold = hold; sh.depth = depth; }
    return sh;
  }
  // The duck's gain at time t from the model (the AudioParam follows the same curve).
  function mixDuckAt(st, t) {
    if (st.t0 == null || t >= st.end) return 1;
    if (t < st.t0) return 1;
    if (t < st.t0 + MIX_DUCK.att) return st.from + (st.depth - st.from) * (t - st.t0) / MIX_DUCK.att;
    if (t < st.until) return st.depth;
    return st.depth + (1 - st.depth) * (t - st.until) / MIX_DUCK.rel;
  }
  // Ducks a gain to depth for hold s, merging with a duck already under way.
  function mixRamp(g, st, t, hold, depth) {
    const cur = mixDuckAt(st, t);
    const on = st.t0 != null && t < st.until;
    const d = on ? Math.min(depth, st.depth) : depth;
    const until = Math.max(t + Math.max(hold, MIX_DUCK.att + 0.01), on ? st.until : -1);
    st.t0 = t; st.from = cur; st.depth = d; st.until = until; st.end = until + MIX_DUCK.rel;
    if (!g) return;
    try {
      if (g.cancelScheduledValues) g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(d, t + MIX_DUCK.att);
      g.setValueAtTime(d, until);
      g.linearRampToValueAtTime(1, until + MIX_DUCK.rel);
    } catch (e) { /* a minimal fake */ }
  }
  // A sting: the minor sfx step back for a moment and the music with them.
  function mixSting(name, len) {
    if (!S.ac) return;
    const t = now();
    mixRamp(S.minorG && S.minorG.gain, S.dk.minor, t, U.clamp(len * 0.6, 0.3, MIX_DUCK.minorHold), MIX_DUCK.minor);
    if (S.duckG) mixRamp(S.duckG.gain, S.dk.mus, t, U.clamp(len * 0.8, 0.6, 2.5), MIX_DUCK.stingMus);
  }
  /* Offline rendering for the measuring page and the suites: builds the
     graph on ac for the call (withContext) and schedules one sfx voice
     (o.sfx, o.opts, o.pitch; o.raw: without the trim) or o.secs of a tune
     (o.music, o.act, o.season, o.layers: ['hype', 'tense']) straight into
     ac.destination, or through the real buses and the limiter with o.bus.
     o.gain scales it. Returns the voice's length in seconds. */
  function mixOffline(ac, o) {
    o = o || {};
    return withContext(ac, () => {
      const t0 = o.t0 == null ? 0.02 : +o.t0;
      const savedR = S.r;
      S.r = U.rng(0xC1A5);
      try {
        if (o.sfx) {
          const fn = BANK[o.sfx];
          if (!fn) return 0;
          const tier = mixTier(o.sfx);
          const g = ac.createGain();
          setP(g.gain, (o.raw ? (LEVEL[o.sfx] || 1) : mixLevel(o.sfx)) * (o.gain == null ? 1 : +o.gain));
          g.connect(o.bus ? (MIX_MINOR[tier] ? S.minorG : S.sfxBus) : ac.destination);
          S.cur = tier;
          let len;
          try { len = fn(g, t0, o.opts || {}, o.pitch || 1) || 0.3; } finally { S.cur = null; }
          if (o.bus && MIX_STING[tier]) mixSting(o.sfx, len);
          return len;
        }
        if (o.music) {
          const sv = S.sea, sa = S.act;
          S.sea = o.season || null; S.act = o.act || 0;
          try {
            const a = accActOf(o.music, o.act || 0);
            const sg = song(o.music, a);
            if (!sg) return 0;
            const layer = ac.createGain();
            setP(layer.gain, (o.gain == null ? 1 : +o.gain) * (o.bus ? 1 : S.vMus) * mixMusK(o.music, a));
            layer.connect(o.bus ? S.musBus : ac.destination);
            const inst = { mode: o.music, act: a, song: sg, layer };
            const lay = o.layers && o.layers.length ? layerSong(o.music, a) : null;
            const secs = o.secs || 8, sd = sg.stepDur;
            for (let i = 0, tt = t0; tt < t0 + secs; i++, tt += sd) {
              const st = i % sg.len, at = tt + (st % 2 === 1 ? sg.swing * sd : 0);
              for (const ev of sg.steps[st]) { try { playEvent(inst, ev, at); } catch (e) { /* one bad note */ } }
              if (lay) for (const k of o.layers) { const evs = lay[k] && lay[k][st]; if (evs) for (const ev of evs) { try { playLayerEvent(inst, ev, at, layer); } catch (e) { /* */ } } }
            }
            return secs;
          } finally { S.sea = sv; S.act = sa; }
        }
        return 0;
      } finally { S.r = savedR; }
    });
  }
  // The music's level per mode (1 unless the measurements said a tune sits too hot under the sfx).
  // dB per tune (accSongKey), so every tune sits about -33 dB integrated and
  // under -28.5 dB in its loudest 400 ms as heard: 5 dB or more under a mid sfx.
  const MIX_MUS = {
    title: -1.5, win: -1.5, backroom: 2.5, machine: -2, map: 1.5, 'map:act1': -2.5, 'map:act2': 1, 'map:act3': -4.5,
    fight: -2.5, 'fight:act1': -2, 'fight:act2': -0.5, 'fight:act3': -2, elite: -1, 'elite:act1': -1, 'elite:act2': -1, 'elite:act3': -1,
    'title:sea:halloween': 2, 'map:sea:halloween': 2, 'title:sea:winter': -2, 'map:sea:winter': -1.5,
  };
  function mixMusK(mode, act) { const d = MIX_MUS[accSongKey(mode, act)]; return d ? Math.pow(10, d / 20) : 1; }

  /* ---------------------------------------------------------------- DEP (round 15): the Neon Depths
     DESIGN.md "The Neon Depths (round 15)". The flooded basement is act 4 to
     the music (the game's accMusicAct says 4 on a dive's map and in its
     fights): its map theme is a muffled dub (72 bpm minor, a sub bass that
     walks, a one-drop half-time kit, offbeat chord skanks, a dreamy lead
     through a low pass with a tape echo), and every mode of the act (the
     fight, elite and boss variants keep their own tempo, key and layers)
     borrows the echo and the bubbles (blips that sweep up like a bubble
     leaving a regulator). Only a config with dub / bub draws from the rng
     for them, so every other tune stays bit for bit. Sounds, calibrated
     into their MIX tiers: the angler's lure pings like sonar, jellies bloop,
     a sting crackles, a pincer snips, live water zaps, a chest creaks (or
     chomps), the High Tide rolls in. */
  ACT_CFG[4] = {
    all: { dub: 1, bub: 1 },
    map: { bpm: 72, root: 38, scale: 'minor', bass: 'walk', lead: 'dreamy', hat: 'off', drums: 'half', wave: 'triangle', bassWave: 'sine',
      stab: 0.55, swing: 0.14, vol: 0.85, leadUp: 12, prog: [[0, 5, 3, 4], [0, 3, 5, 6], [5, 3, 0, 4], [0, 6, 5, 4]] },
    fight: { scale: 'dorian', wave: 'triangle' },
    elite: { wave: 'triangle' },
  };
  ACT_NAMES[4] = 'flooded dub';
  Object.assign(MIX_MUS, { 'map:act4': 0, 'fight:act4': -2.5, 'elite:act4': -1, 'boss:act4': -1.5 });
  // accFlavor: bubbles rise off the beat, two or three a bar (only a dub config draws for them).
  function depFlavor(c, steps, base, b, tone, rng) {
    for (const s of [3, 7, 11, 15]) if (rng.chance(s === 7 ? 0.7 : 0.35)) push(steps, base + s, { v: 'bub', n: tone(rng.pick([0, 2, 4]), 36), g: 0.8 });
  }
  // playEvent's lead in a dub config: muffled under a low pass, with a tape echo a dotted eighth later, and another.
  function depLead(dest, t, ev, g, sd, c) {
    const f = mtof(ev.n), dur = Math.max(0.12, ev.d * sd * 0.95), w = c.wave === 'sawtooth' ? 'triangle' : c.wave;
    blip(dest, t, { w, f, dur, v: 0.14 * g, a: 0.02, lp: 900, q: 2 });
    blip(dest, t + sd * 3, { w: 'sine', f, dur: dur * 0.8, v: 0.06 * g, a: 0.02, lp: 700 });
    blip(dest, t + sd * 6, { w: 'sine', f, dur: dur * 0.7, v: 0.025 * g, a: 0.02, lp: 520 });
    return true;
  }
  // playEvent's default: the bubble voice (a sine that sweeps up fast); false for any other voice.
  function depVoice(dest, t, ev, g, sd) {
    if (ev.v !== 'bub') return false;
    const f = mtof(ev.n);
    blip(dest, t, { w: 'sine', f: f * 0.5, to: f * 1.4, dur: 0.07, v: 0.05 * g, a: 0.004 });
    blip(dest, t + 0.05, { w: 'sine', f: f * 0.7, to: f * 1.8, dur: 0.05, v: 0.025 * g, a: 0.003 });
    return true;
  }
  Object.assign(BANK, {
    // The angler's lure: a sonar ping and its echo.
    depLure(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 1180 * p, to: 1120 * p, dur: 0.5, v: 0.14, a: 0.005 });
      blip(out, t, { at: 0.28, w: 'sine', f: 1180 * p, to: 1120 * p, dur: 0.4, v: 0.05, a: 0.005 });
      blip(out, t, { w: 'triangle', f: 590 * p, dur: 0.2, v: 0.04 });
      return 0.72;
    },
    // Jellies drifting in: two bloops.
    depBubble(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 240 * p, to: 700 * p, dur: 0.1, v: 0.16, a: 0.01 });
      blip(out, t, { at: 0.09, w: 'sine', f: 330 * p, to: 900 * p, dur: 0.08, v: 0.1, a: 0.01 });
      return 0.2;
    },
    // A jelly stings the claw: a nettle crackle over a high buzz.
    depSting(out, t, o, p) {
      blip(out, t, { w: 'square', f: 2200 * p, to: 1600 * p, dur: 0.12, v: 0.05, lp: 5000, vib: [40, 200] });
      hiss(out, t, { type: 'highpass', f: 4000, dur: 0.1, v: 0.14, crunch: true });
      blip(out, t, { at: 0.05, w: 'sine', f: 880 * p, to: 440 * p, dur: 0.12, v: 0.08 });
      return 0.2;
    },
    // A pincer snips shut (a clack and a scrape).
    depPinch(out, t, o, p) {
      for (const at of [0, 0.08]) hiss(out, t, { at, type: 'bandpass', f: 3600 * p, q: 5, dur: 0.03, v: 0.22, crunch: true });
      blip(out, t, { at: 0.08, w: 'triangle', f: 700 * p, to: 420 * p, dur: 0.06, v: 0.08 });
      hiss(out, t, { at: 0.12, type: 'bandpass', f: 1400 * p, q: 1.5, dur: 0.18, v: 0.06 });
      return 0.32;
    },
    // Live water: a mains hum that bites, and a crack.
    depZap(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 110 * p, dur: 0.28, v: 0.1, lp: 2400, vib: [30, 20] });
      blip(out, t, { w: 'square', f: 1760 * p, to: 900 * p, dur: 0.1, v: 0.04, lp: 4000 });
      hiss(out, t, { type: 'highpass', f: 3000, dur: 0.16, v: 0.16, crunch: true });
      return 0.32;
    },
    // A sunken chest: a wet creak; opts.bite adds a chomp.
    depChest(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 600 * p, to: 1100 * p, q: 3, dur: 0.3, v: 0.5 });
      blip(out, t, { w: 'sawtooth', f: 180 * p, to: 140 * p, dur: 0.25, v: 0.12, lp: 900 });
      if (o && o.bite) { blip(out, t, { at: 0.26, w: 'square', f: 140 * p, to: 70, dur: 0.1, v: 0.12, lp: 1200 }); hiss(out, t, { at: 0.26, type: 'lowpass', f: 1500, dur: 0.08, v: 0.2, crunch: true }); }
      return 0.42;
    },
    // High Tide: the water rolls in over a bass drop.
    depTide(out, t, o, p) {
      hiss(out, t, { type: 'lowpass', f: 300 * p, to: 1800 * p, q: 0.8, dur: 0.9, v: 0.2, a: 0.25 });
      blip(out, t, { w: 'sine', f: 90 * p, to: 42, dur: 0.9, v: 0.3, a: 0.02 });
      [50, 57, 62].forEach((n, i) => blip(out, t, { at: 0.1 + i * 0.12, w: 'triangle', f: mtof(n) * p, dur: 0.5, v: 0.05, lp: 1100 }));
      return 1.0;
    },
  });
  Object.assign(GAP, { depLure: 0.3, depBubble: 0.08, depSting: 0.08, depPinch: 0.1, depZap: 0.12, depChest: 0.15, depTide: 0.8 });
  NAMES.push('depLure', 'depBubble', 'depSting', 'depPinch', 'depZap', 'depChest', 'depTide');
  Object.assign(MIX_TIER, { depBubble: 'soft', depPinch: 'soft', depLure: 'mid', depSting: 'mid', depZap: 'mid', depChest: 'mid', depTide: 'big' });
  Object.assign(MIX_TRIM, { depLure: -0.5, depBubble: 1, depSting: 4, depPinch: 5.5, depZap: 1.5, depChest: 5.5, depTide: -1.5 });
  /* ---------------------------------------------------------------- /DEP */

  /* ---------------------------------------------------------------- CAB (round 16): the cabinet is alive
     DESIGN.md "The cabinet is alive (round 16)". The machine's own voices:
     the event sign's reel ticking round and slamming down, the surge's
     power-up, a shower of coins, the PERFECT chime (opts.n, a streak, climbs),
     a claw straining under a heavy load (opts.vel), a prize's squeak, a spark
     landing in the Jackpot Lamp (pitch climbs with the level) and the
     lamp's FEVER siren. Calibrated into their MIX tiers. */
  Object.assign(BANK, {
    // The event reel: a dry slot tick.
    cabRoll(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 3400 * p, q: 6, dur: 0.025, v: 0.3 });
      blip(out, t, { w: 'square', f: 1250 * p, dur: 0.03, v: 0.08, lp: 3000 });
      return 0.05;
    },
    // The sign lands: a clack, a thump and a bright two-note ding.
    cabLand(out, t, o, p) {
      hiss(out, t, { type: 'bandpass', f: 1800 * p, q: 2, dur: 0.05, v: 0.3, crunch: true });
      blip(out, t, { w: 'sine', f: 150 * p, to: 70, dur: 0.14, v: 0.35 });
      blip(out, t, { at: 0.05, w: 'triangle', f: mtof(84) * p, dur: 0.18, v: 0.12 });
      blip(out, t, { at: 0.12, w: 'triangle', f: mtof(91) * p, dur: 0.26, v: 0.1 });
      return 0.4;
    },
    // POWER SURGE: a rising electric whine over a crackle, then a zap.
    cabSurge(out, t, o, p) {
      blip(out, t, { w: 'sawtooth', f: 110 * p, to: 880 * p, dur: 0.45, v: 0.08, lp: 3200, q: 4, vib: [30, 25] });
      blip(out, t, { w: 'square', f: 55 * p, to: 440 * p, dur: 0.45, v: 0.04, lp: 1400 });
      hiss(out, t, { type: 'highpass', f: 3500, dur: 0.4, v: 0.08, crunch: true, a: 0.1 });
      blip(out, t, { at: 0.42, w: 'square', f: 1760 * p, to: 440 * p, dur: 0.12, v: 0.08, lp: 5000 });
      hiss(out, t, { at: 0.42, type: 'highpass', f: 2500, dur: 0.12, v: 0.2, crunch: true });
      return 0.6;
    },
    // COIN SHOWER: a patter of little clinks falling in.
    cabRain(out, t, o, p) {
      const notes = [96, 91, 98, 93, 100, 95, 101, 94];
      notes.forEach((n, i) => {
        blip(out, t, { at: i * 0.055, w: 'triangle', f: mtof(n) * p, to: mtof(n) * p * 0.94, dur: 0.09, v: 0.07 });
        hiss(out, t, { at: i * 0.055, type: 'bandpass', f: 6000, q: 5, dur: 0.02, v: 0.06 });
      });
      return 0.55;
    },
    // PERFECT: a glassy chime with a sparkle on top; a streak (opts.n) climbs.
    cabPerfect(out, t, o, p) {
      const up = Math.min(4, Math.max(1, (o && o.n) | 0 || 1)) - 1, k = p * Math.pow(2, up * 2 / 12);
      [79, 86, 91].forEach((n, i) => blip(out, t, { at: i * 0.045, w: 'sine', f: mtof(n) * k, dur: 0.5 - i * 0.08, v: 0.16 - i * 0.03, a: 0.003 }));
      blip(out, t, { w: 'triangle', f: mtof(98) * k, dur: 0.35, v: 0.05, vib: [12, 18] });
      hiss(out, t, { type: 'highpass', f: 7000, to: 11000, dur: 0.3, v: 0.05 });
      return 0.55;
    },
    // A claw straining: a low metal groan with a creak (opts.vel, the load).
    cabCreak(out, t, o, p) {
      const v = U.clamp(o && o.vel != null ? +o.vel : 0.6, 0.1, 1.2);
      blip(out, t, { w: 'sawtooth', f: 95 * p, to: 70 * p, dur: 0.35, v: 0.07 * (0.5 + v), lp: 700, q: 6, vib: [22, 6] });
      for (let i = 0; i < 4; i++) hiss(out, t, { at: i * 0.07, type: 'bandpass', f: (900 + i * 170) * p, q: 12, dur: 0.035, v: 0.12 * (0.5 + v) });
      return 0.4;
    },
    // A prize's squeak (a rubber-duck chirp up).
    cabSqueak(out, t, o, p) {
      blip(out, t, { w: 'square', f: 900 * p, to: 1700 * p, dur: 0.09, v: 0.06, lp: 3500, q: 3 });
      blip(out, t, { at: 0.08, w: 'sine', f: 1500 * p, to: 1150 * p, dur: 0.08, v: 0.08 });
      return 0.18;
    },
    // A spark lands in the Jackpot Lamp: a soft bell blip (pitch climbs with the level).
    cabLamp(out, t, o, p) {
      blip(out, t, { w: 'sine', f: 1320 * p, dur: 0.16, v: 0.12, a: 0.003 });
      blip(out, t, { w: 'triangle', f: 2640 * p, dur: 0.08, v: 0.03 });
      return 0.18;
    },
    // LAMP FEVER: a siren sweep into a fanfare run.
    cabFever(out, t, o, p) {
      for (let i = 0; i < 2; i++) blip(out, t, { at: i * 0.3, w: 'square', f: 620 * p, to: 1240 * p, dur: 0.28, v: 0.06, lp: 3000, lin: true });
      [72, 76, 79, 84, 88].forEach((n, i) => blip(out, t, { at: 0.6 + i * 0.07, w: 'square', f: mtof(n) * p, dur: 0.16, v: 0.06, lp: 4200 }));
      blip(out, t, { at: 0.95, w: 'triangle', f: mtof(96) * p, dur: 0.5, v: 0.08, vib: [6, 10] });
      hiss(out, t, { at: 0.6, type: 'highpass', f: 5000, dur: 0.6, v: 0.05 });
      return 1.45;
    },
  });
  Object.assign(GAP, { cabRoll: 0.04, cabLand: 0.2, cabSurge: 0.5, cabRain: 0.3, cabPerfect: 0.2, cabCreak: 0.25, cabSqueak: 0.12, cabLamp: 0.05, cabFever: 1 });
  NAMES.push('cabRoll', 'cabLand', 'cabSurge', 'cabRain', 'cabPerfect', 'cabCreak', 'cabSqueak', 'cabLamp', 'cabFever');
  Object.assign(MIX_TIER, { cabRoll: 'tick', cabLamp: 'ui', cabCreak: 'soft', cabSqueak: 'soft', cabLand: 'mid', cabSurge: 'mid', cabRain: 'mid', cabPerfect: 'big', cabFever: 'big' });
  Object.assign(MIX_TRIM, { cabRoll: -3.6, cabLamp: -3.1, cabCreak: 5.1, cabSqueak: 3.1, cabLand: -2.4, cabSurge: 0.1, cabRain: 8.5, cabPerfect: 1.1, cabFever: 7.5 });
  /* ---------------------------------------------------------------- /CAB */

  const mixApi = {
    TIERS: MIX_TIERS, TARGET: MIX_TARGET, WIN: MIX_WIN, CAP: MIX_CAP, TIER: MIX_TIER, TRIM: MIX_TRIM, VARY: MIX_VARY,
    DUCK: MIX_DUCK, LIM: MIX_LIM, MUS: MIX_MUS, MINOR: MIX_MINOR, STING: MIX_STING,
    tier: mixTier, level: mixLevel, musK: mixMusK, offline: mixOffline,
    seed(n) { S.mr = U.rng(n == null ? MIX_SEED : n); S.rep = {}; S.lastVary = null; },
    get last() { return S.lastVary; },
    duckAt(t) { const tt = t == null ? now() : +t; return { music: mixDuckAt(S.dk.mus, tt), minor: mixDuckAt(S.dk.minor, tt) }; },
    voices(t) {
      const tt = t == null ? now() : +t, c = { all: 0 };
      for (const k of MIX_TIERS) c[k] = 0;
      for (const v of S.vox) if (v.end > tt) { c[v.tier]++; c.all++; }
      return c;
    },
    get limiter() { return S.lim || null; },
  };

  return {
    mix: mixApi,   // MIX (round 10): tiers, trims, caps, ducks, the spread and the offline renderer
    init, sfx, music, setVolume, duck, haptic, intro, renderIntroWav,
    musicState, victory,   // round 3: the dynamic fight layers and the victory sting
    get layers() { return { hype: S.lay.hype, tense: S.lay.tense }; },
    _layerSong: layerSong,
    _liveLayers: () => S.seqs.filter((q) => q.lg).map((q) => ({ mode: q.mode, hype: q.lt.hype, tense: q.lt.tense, fading: q.fadeEnd != null })),
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
    // round 6: per-act music (the act biome picks the map and fight variants)
    setAct, get act() { return S.act; }, ACT_CFG, ACT_NAMES, setMaster, get master() { return S.vMaster == null ? 1 : S.vMaster; },
    // round 7: the seasonal events' title and map tunes
    setSeason, get season() { return S.sea || null; }, SEA_CFG, SEA_NAMES, _seaSong: (m, id) => { const k = S.sea; S.sea = id || null; try { return song(m, S.act); } finally { S.sea = k; } },
    _songFor: (m, a) => song(m, a == null ? S.act : a),
    _actOf: (m, a) => accActOf(m, a),
    _liveActs: () => S.seqs.map((q) => ({ mode: q.mode, act: q.act || 0, fading: q.fadeEnd != null })),
    // test hooks
    _tick: tick,
    _song: (m, a) => song(m, a == null ? 0 : a),
    _live: () => S.seqs.map((q) => ({ mode: q.mode, fading: q.fadeEnd != null })),
  };
})();
