/*
 * tower_roguelike/js/audio.js
 * Procedural WebAudio SFX + music module. Zero external assets.
 * Attaches to window.TD.audio. Plain ES2017, no modules/imports.
 */
(function () {
  'use strict';

  window.TD = window.TD || {};

  // ---- Persistent settings -------------------------------------------------
  var LS_SFX = 'td_sfx';
  var LS_MUSIC = 'td_music';
  var LS_VOL = 'td_vol';

  function lsGetBool(key, dflt) {
    try {
      var v = localStorage.getItem(key);
      if (v === null) return dflt;
      return v === '1' || v === 'true';
    } catch (e) { return dflt; }
  }
  function lsGetFloat(key, dflt) {
    try {
      var v = localStorage.getItem(key);
      if (v === null) return dflt;
      var f = parseFloat(v);
      return isNaN(f) ? dflt : f;
    } catch (e) { return dflt; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }

  // ---- Module state ---------------------------------------------------------
  var sfxEnabled = lsGetBool(LS_SFX, true);
  var musicEnabled = lsGetBool(LS_MUSIC, true);
  var masterVol = clamp01(lsGetFloat(LS_VOL, 0.7));

  var ctx = null;            // AudioContext (lazily created)
  var supported = true;      // becomes false if WebAudio unavailable
  var masterGain = null;     // master bus -> destination
  var sfxBus = null;         // sfx bus -> master
  var musicBus = null;       // music bus -> master
  var noiseBuffer = null;    // shared white-noise buffer

  // Music scheduler state
  var currentTheme = 0;      // last requested theme (remembered even when muted)
  var musicPlaying = false;  // scheduler active
  var schedulerTimer = null; // setInterval handle for the lookahead scheduler
  var nextNoteTime = 0;      // absolute ctx time of next note to schedule
  var stepIndex = 0;         // index into the current pattern
  var SCHED_LOOKAHEAD_MS = 25;   // how often the scheduler runs
  var SCHED_AHEAD = 0.1;         // schedule notes this far ahead (100ms)

  function clamp01(v) {
    if (typeof v !== 'number' || isNaN(v)) return 0;
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  // ---- Init -----------------------------------------------------------------
  // Lazily create the AudioContext. Safe to call repeatedly. Should be called
  // from a user gesture the first time so we can resume a suspended context.
  function init() {
    if (!supported) return;
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { supported = false; return; }
        ctx = new AC();

        masterGain = ctx.createGain();
        masterGain.gain.value = masterVol;
        masterGain.connect(ctx.destination);

        sfxBus = ctx.createGain();
        sfxBus.gain.value = sfxEnabled ? 1 : 0;
        sfxBus.connect(masterGain);

        musicBus = ctx.createGain();
        musicBus.gain.value = musicEnabled ? 0.18 : 0; // music kept low
        musicBus.connect(masterGain);

        noiseBuffer = makeNoiseBuffer();
        loadSamples();
      }
      // Resume if a gesture unlocked us.
      if (ctx && ctx.state === 'suspended' && ctx.resume) {
        ctx.resume();
      }
    } catch (e) {
      supported = false;
    }
  }

  function makeNoiseBuffer() {
    try {
      var len = Math.floor(ctx.sampleRate * 1.0);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    } catch (e) { return null; }
  }

  // ---- Bus / settings setters ----------------------------------------------
  function setSfxEnabled(b) {
    sfxEnabled = !!b;
    lsSet(LS_SFX, sfxEnabled ? 1 : 0);
    if (sfxBus && ctx) {
      try { sfxBus.gain.setValueAtTime(sfxEnabled ? 1 : 0, ctx.currentTime); } catch (e) {}
    }
  }
  function setMusicEnabled(b) {
    musicEnabled = !!b;
    lsSet(LS_MUSIC, musicEnabled ? 1 : 0);
    if (musicBus && ctx) {
      try { musicBus.gain.setValueAtTime(musicEnabled ? 0.18 : 0, ctx.currentTime); } catch (e) {}
    }
    // If music was requested while muted, start it now that we're enabled.
    if (musicEnabled && !musicPlaying) {
      startMusic(currentTheme);
    } else if (!musicEnabled && musicPlaying) {
      // keep scheduler running is wasteful; stop it but remember theme.
      stopScheduler();
    }
  }
  function isSfxEnabled() { return sfxEnabled; }
  function isMusicEnabled() { return musicEnabled; }

  function setMasterVolume(v) {
    masterVol = clamp01(v);
    lsSet(LS_VOL, masterVol);
    if (masterGain && ctx) {
      try { masterGain.gain.setValueAtTime(masterVol, ctx.currentTime); } catch (e) {}
    }
  }

  // ---- Low-level synth helpers ---------------------------------------------
  // Each helper is wrapped by callers in try/catch so one bad sound never throws.

  function now() { return ctx.currentTime; }

  // A single oscillator note with an ADSR-ish envelope into the sfx bus.
  function tone(opts) {
    var t0 = (opts.start != null) ? opts.start : now();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd != null) {
      var glideEnd = t0 + (opts.dur || 0.2);
      if (opts.exp) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), glideEnd);
      else osc.frequency.linearRampToValueAtTime(opts.freqEnd, glideEnd);
    }
    var peak = (opts.gain != null) ? opts.gain : 0.3;
    var atk = (opts.attack != null) ? opts.attack : 0.005;
    var dur = (opts.dur != null) ? opts.dur : 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var dest = opts.dest || sfxBus;
    if (opts.filter) {
      var f = ctx.createBiquadFilter();
      f.type = opts.filter.type || 'lowpass';
      f.frequency.setValueAtTime(opts.filter.freq || 1000, t0);
      if (opts.filter.q != null) f.Q.value = opts.filter.q;
      osc.connect(g); g.connect(f); f.connect(dest);
    } else {
      osc.connect(g); g.connect(dest);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return { osc: osc, gain: g };
  }

  // A burst of filtered noise (explosions, zaps, buzzes).
  function noise(opts) {
    if (!noiseBuffer) return;
    var t0 = (opts.start != null) ? opts.start : now();
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var g = ctx.createGain();
    var peak = (opts.gain != null) ? opts.gain : 0.3;
    var dur = (opts.dur != null) ? opts.dur : 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var f = ctx.createBiquadFilter();
    f.type = opts.filterType || 'lowpass';
    f.frequency.setValueAtTime(opts.filterFreq || 1200, t0);
    if (opts.filterFreqEnd != null) {
      f.frequency.exponentialRampToValueAtTime(Math.max(1, opts.filterFreqEnd), t0 + dur);
    }
    if (opts.q != null) f.Q.value = opts.q;

    src.connect(f); f.connect(g); g.connect(opts.dest || sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    return { src: src, gain: g };
  }

  // ---- Sound effect definitions --------------------------------------------
  var SFX = {
    shoot: function () {
      tone({ type: 'square', freq: 900, freqEnd: 300, exp: true, dur: 0.12, gain: 0.18, attack: 0.002 });
    },
    shootHeavy: function () {
      tone({ type: 'sawtooth', freq: 320, freqEnd: 90, exp: true, dur: 0.28, gain: 0.3,
        filter: { type: 'lowpass', freq: 800 } });
      noise({ dur: 0.18, gain: 0.12, filterType: 'lowpass', filterFreq: 500 });
    },
    hit: function () {
      tone({ type: 'square', freq: 1400, dur: 0.05, gain: 0.12, attack: 0.001 });
    },
    enemyDeath: function () {
      tone({ type: 'triangle', freq: 600, freqEnd: 140, exp: true, dur: 0.22, gain: 0.22 });
    },
    bossDeath: function () {
      var t = now();
      noise({ start: t, dur: 1.0, gain: 0.5, filterType: 'lowpass', filterFreq: 1800, filterFreqEnd: 120 });
      tone({ start: t, type: 'sawtooth', freq: 180, freqEnd: 35, exp: true, dur: 0.9, gain: 0.4,
        filter: { type: 'lowpass', freq: 600 } });
      tone({ start: t + 0.05, type: 'square', freq: 90, freqEnd: 30, exp: true, dur: 0.7, gain: 0.3 });
    },
    place: function () {
      var t = now();
      tone({ start: t, type: 'sine', freq: 220, dur: 0.06, gain: 0.25 });
      tone({ start: t + 0.04, type: 'square', freq: 140, freqEnd: 80, exp: true, dur: 0.12, gain: 0.3,
        filter: { type: 'lowpass', freq: 700 } });
    },
    sell: function () {
      var t = now();
      tone({ start: t, type: 'sine', freq: 880, dur: 0.08, gain: 0.18 });
      tone({ start: t + 0.07, type: 'sine', freq: 520, dur: 0.14, gain: 0.18 });
    },
    upgrade: function () {
      var t = now();
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        tone({ start: t + i * 0.06, type: 'triangle', freq: notes[i], dur: 0.18, gain: 0.16 });
      }
    },
    coin: function () {
      var t = now();
      tone({ start: t, type: 'sine', freq: 988, dur: 0.06, gain: 0.16 });
      tone({ start: t + 0.05, type: 'sine', freq: 1319, dur: 0.12, gain: 0.16 });
    },
    cardPick: function () {
      var t = now();
      var notes = [1319, 1568, 1760, 2093, 2637];
      for (var i = 0; i < notes.length; i++) {
        tone({ start: t + i * 0.05, type: 'sine', freq: notes[i], dur: 0.25, gain: 0.1,
          filter: { type: 'highpass', freq: 800 } });
      }
    },
    bargain: function () {
      var t = now();
      tone({ start: t, type: 'sawtooth', freq: 70, freqEnd: 110, dur: 0.9, gain: 0.22,
        filter: { type: 'lowpass', freq: 400, q: 6 } });
      tone({ start: t, type: 'sine', freq: 55, dur: 0.9, gain: 0.18 });
    },
    waveStart: function () {
      var t = now();
      tone({ start: t, type: 'sawtooth', freq: 330, dur: 0.35, gain: 0.22,
        filter: { type: 'lowpass', freq: 1200 } });
      tone({ start: t, type: 'sawtooth', freq: 247, dur: 0.35, gain: 0.18,
        filter: { type: 'lowpass', freq: 1200 } });
      tone({ start: t + 0.3, type: 'sawtooth', freq: 392, dur: 0.4, gain: 0.22,
        filter: { type: 'lowpass', freq: 1400 } });
    },
    bossWarn: function () {
      var t = now();
      // Two alternating tense tones.
      tone({ start: t, type: 'square', freq: 440, dur: 0.22, gain: 0.2,
        filter: { type: 'bandpass', freq: 600, q: 4 } });
      tone({ start: t + 0.26, type: 'square', freq: 370, dur: 0.22, gain: 0.2,
        filter: { type: 'bandpass', freq: 500, q: 4 } });
    },
    lifeLost: function () {
      noise({ dur: 0.3, gain: 0.3, filterType: 'bandpass', filterFreq: 300, q: 1 });
      tone({ type: 'sawtooth', freq: 160, freqEnd: 70, exp: true, dur: 0.3, gain: 0.18,
        filter: { type: 'lowpass', freq: 500 } });
    },
    gameOver: function () {
      var t = now();
      var notes = [440, 392, 349.23, 261.63];
      for (var i = 0; i < notes.length; i++) {
        tone({ start: t + i * 0.22, type: 'triangle', freq: notes[i], dur: 0.45, gain: 0.2 });
      }
    },
    victory: function () {
      var t = now();
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      for (var i = 0; i < notes.length; i++) {
        tone({ start: t + i * 0.12, type: 'triangle', freq: notes[i], dur: 0.4, gain: 0.18 });
      }
      tone({ start: t + 0.6, type: 'square', freq: 1046.5, dur: 0.5, gain: 0.12 });
    },
    uiClick: function () {
      tone({ type: 'square', freq: 660, dur: 0.04, gain: 0.1, attack: 0.001 });
    },
    uiHover: function () {
      tone({ type: 'sine', freq: 880, dur: 0.03, gain: 0.04, attack: 0.001 });
    },
    error: function () {
      var t = now();
      tone({ start: t, type: 'sawtooth', freq: 150, dur: 0.18, gain: 0.2,
        filter: { type: 'lowpass', freq: 400, q: 4 } });
      tone({ start: t + 0.12, type: 'sawtooth', freq: 110, dur: 0.2, gain: 0.2,
        filter: { type: 'lowpass', freq: 350, q: 4 } });
    },
    freeze: function () {
      var t = now();
      // icy shimmer: high detuned sines + a filtered noise sweep
      var notes = [1568, 2093, 2637, 3136];
      for (var i = 0; i < notes.length; i++) {
        tone({ start: t + i * 0.03, type: 'sine', freq: notes[i], dur: 0.4, gain: 0.06,
          filter: { type: 'highpass', freq: 1200 } });
      }
      noise({ start: t, dur: 0.5, gain: 0.05, filterType: 'highpass', filterFreq: 4000 });
    },
    zap: function () {
      var t = now();
      noise({ start: t, dur: 0.18, gain: 0.25, filterType: 'bandpass', filterFreq: 3000, q: 2 });
      tone({ start: t, type: 'sawtooth', freq: 1800, freqEnd: 600, exp: true, dur: 0.12, gain: 0.12,
        filter: { type: 'highpass', freq: 800 } });
    },
    explode: function () {
      var t = now();
      noise({ start: t, dur: 0.5, gain: 0.4, filterType: 'lowpass', filterFreq: 1600, filterFreqEnd: 150 });
      tone({ start: t, type: 'square', freq: 120, freqEnd: 40, exp: true, dur: 0.4, gain: 0.25 });
    }
  };

  // ---- Real sound samples (Kenney Interface Sounds, CC0) -------------------
  // These genuine .wav assets override the procedural synth for the named
  // events. They are fetched + decoded lazily on init; until a sample is ready
  // (or if a fetch/decode fails, e.g. offline) the procedural fallback plays,
  // so audio never silently breaks.
  var SAMPLE_URLS = {
    uiClick: 'assets/sfx/uiClick.wav',
    place: 'assets/sfx/place.wav',
    upgrade: 'assets/sfx/upgrade.wav',
    sell: 'assets/sfx/sell.wav',
    coin: 'assets/sfx/coin.wav',
    cardPick: 'assets/sfx/cardPick.wav',
    bargain: 'assets/sfx/bargain.wav',
    error: 'assets/sfx/error.wav',
    waveStart: 'assets/sfx/waveStart.wav',
    lifeLost: 'assets/sfx/lifeLost.wav'
  };
  var sampleBuffers = {};      // name -> decoded AudioBuffer
  var samplesRequested = false;

  function loadSamples() {
    if (samplesRequested || !ctx || typeof fetch !== 'function') return;
    samplesRequested = true;
    Object.keys(SAMPLE_URLS).forEach(function (name) {
      try {
        fetch(SAMPLE_URLS[name])
          .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(); })
          .then(function (buf) {
            return new Promise(function (res, rej) {
              // callback form for broad Safari support
              ctx.decodeAudioData(buf, res, rej);
            });
          })
          .then(function (decoded) { sampleBuffers[name] = decoded; })
          .catch(function () { /* keep procedural fallback */ });
      } catch (e) {}
    });
  }

  function playSample(name) {
    var buf = sampleBuffers[name];
    if (!buf || !ctx || !sfxBus) return false;
    try {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(sfxBus);
      src.start();
      return true;
    } catch (e) { return false; }
  }

  // Play a one-shot SFX by name. Unknown names no-op. Never throws.
  function play(name) {
    if (!supported || !sfxEnabled) return;
    try {
      init();
      if (!ctx) return;
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
      if (playSample(name)) return;          // prefer the real CC0 sample
      var fn = SFX[name];
      if (typeof fn === 'function') fn();     // else fall back to the synth
    } catch (e) { /* swallow: a bad sound must never break the game */ }
  }

  // ---- Music ----------------------------------------------------------------
  // Each theme defines a scale (semitone offsets), a root note, tempo, and the
  // oscillator/timbre mood. The scheduler walks an arpeggio pattern.
  var THEMES = [
    // 0: calm minor pentatonic
    { name: 'calm', root: 220.0, scale: [0, 3, 5, 7, 10, 12], step: 0.36,
      osc: 'sine', pad: true, padType: 'triangle', octaveJump: 0.5 },
    // 1: tense (Phrygian-ish), faster
    { name: 'tense', root: 196.0, scale: [0, 1, 3, 5, 7, 8, 10], step: 0.28,
      osc: 'triangle', pad: true, padType: 'sawtooth', octaveJump: 0.4 },
    // 2: dark / boss (low minor), slow and heavy
    { name: 'boss', root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], step: 0.42,
      osc: 'sawtooth', pad: true, padType: 'square', octaveJump: 0.3 },
    // 3: bright major-ish, hopeful
    { name: 'bright', root: 261.63, scale: [0, 2, 4, 7, 9, 12], step: 0.32,
      osc: 'triangle', pad: true, padType: 'sine', octaveJump: 0.5 },
    // 4: mysterious whole-tone-ish
    { name: 'mystery', root: 174.61, scale: [0, 2, 4, 6, 8, 10, 12], step: 0.34,
      osc: 'sine', pad: true, padType: 'triangle', octaveJump: 0.45 }
  ];

  // Schedule a single arpeggio note + occasional pad chord at absolute time t.
  function scheduleStep(theme, t) {
    try {
      // Arpeggio note: walk up/down through the scale.
      var sl = theme.scale.length;
      var pos = stepIndex % (sl * 2);
      var idx = pos < sl ? pos : (sl * 2 - 1 - pos); // up then down
      var semis = theme.scale[idx];
      var freq = theme.root * Math.pow(2, semis / 12);

      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = theme.osc;
      osc.frequency.setValueAtTime(freq, t);
      var dur = theme.step * 0.9;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(musicBus);
      osc.start(t);
      osc.stop(t + dur + 0.02);

      // Pad chord every 8 steps for a gentle bed.
      if (theme.pad && (stepIndex % 8 === 0)) {
        var padRoot = theme.root * theme.octaveJump; // an octave (or so) lower
        var chord = [0, theme.scale[2] || 4, theme.scale[4] || 7];
        var pdur = theme.step * 8;
        for (var c = 0; c < chord.length; c++) {
          var pf = padRoot * Math.pow(2, chord[c] / 12);
          var po = ctx.createOscillator();
          var pg = ctx.createGain();
          po.type = theme.padType;
          po.frequency.setValueAtTime(pf, t);
          pg.gain.setValueAtTime(0.0001, t);
          pg.gain.exponentialRampToValueAtTime(0.12, t + pdur * 0.2);
          pg.gain.exponentialRampToValueAtTime(0.0001, t + pdur);
          var pfilt = ctx.createBiquadFilter();
          pfilt.type = 'lowpass';
          pfilt.frequency.setValueAtTime(800, t);
          po.connect(pg); pg.connect(pfilt); pfilt.connect(musicBus);
          po.start(t);
          po.stop(t + pdur + 0.05);
        }
      }
    } catch (e) { /* never throw from the scheduler */ }
  }

  // Lookahead scheduler: runs every SCHED_LOOKAHEAD_MS, schedules notes whose
  // time is within SCHED_AHEAD of now. Uses ctx.currentTime so timing is tight.
  function schedulerTick() {
    if (!ctx || !musicPlaying) return;
    try {
      var theme = THEMES[currentTheme % THEMES.length];
      while (nextNoteTime < ctx.currentTime + SCHED_AHEAD) {
        scheduleStep(theme, nextNoteTime);
        nextNoteTime += theme.step;
        stepIndex++;
      }
    } catch (e) {}
  }

  function startScheduler() {
    if (schedulerTimer != null) return;
    stepIndex = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    musicPlaying = true;
    schedulerTimer = setInterval(schedulerTick, SCHED_LOOKAHEAD_MS);
    schedulerTick();
  }

  function stopScheduler() {
    musicPlaying = false;
    if (schedulerTimer != null) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  // Start/replace looping background music. Remembers the theme even if muted.
  function startMusic(themeIndex) {
    if (!supported) return;
    if (typeof themeIndex === 'number' && !isNaN(themeIndex)) {
      currentTheme = ((themeIndex % THEMES.length) + THEMES.length) % THEMES.length;
    }
    if (!musicEnabled) return; // stay silent but remember theme
    try {
      init();
      if (!ctx) return;
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
      // Clean switch: stop any existing scheduler, fade music bus back up.
      stopScheduler();
      if (musicBus) {
        try {
          musicBus.gain.cancelScheduledValues(ctx.currentTime);
          musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
          musicBus.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.3);
        } catch (e) {}
      }
      startScheduler();
    } catch (e) {}
  }

  // Cleanly stop the scheduler and fade out the music bus.
  function stopMusic() {
    if (!supported) return;
    try {
      stopScheduler();
      if (musicBus && ctx) {
        musicBus.gain.cancelScheduledValues(ctx.currentTime);
        musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
        musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        // restore the nominal bus level shortly after for next start
        musicBus.gain.setValueAtTime(musicEnabled ? 0.18 : 0, ctx.currentTime + 0.45);
      }
    } catch (e) {}
  }

  // ---- Public API -----------------------------------------------------------
  window.TD.audio = {
    init: init,
    setSfxEnabled: setSfxEnabled,
    setMusicEnabled: setMusicEnabled,
    isSfxEnabled: isSfxEnabled,
    isMusicEnabled: isMusicEnabled,
    setMasterVolume: setMasterVolume,
    play: play,
    startMusic: startMusic,
    stopMusic: stopMusic
  };
})();
