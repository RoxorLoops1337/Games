/* SUNBEAM SIEGE audio (B21). Classic script. Pure Web Audio synthesis, zero files.
 * Defines window.SB.audio. See design/B21-audio.md for the API.
 * No Math.random is used for anything that touches combat; sfx jitter only. */
(function (root) {
  'use strict';
  root.SB = root.SB || {};

  var KEY = 'sb.audio.v1';
  var ctx = null, master, comp, musicGain, duckGain, sfxIn;
  var noiseBuf = null;
  var settings = { master: 0.8, music: 0.55, sfx: 0.9, mute: { master: false, music: false, sfx: false } };
  var inited = false, pendingScene = null, seed = 1337;
  var lastPlayed = {};
  var loops = [];

  // ---------- small utils ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function clamp(x, a, b) { x = +x; if (!isFinite(x)) x = a; return Math.max(a, Math.min(b, x)); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fin(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }

  // ---------- settings ----------
  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      ['master', 'music', 'sfx'].forEach(function (k) { if (typeof s[k] === 'number') settings[k] = clamp(s[k], 0, 1); });
      if (s.mute && typeof s.mute === 'object') {
        ['master', 'music', 'sfx'].forEach(function (k) { settings.mute[k] = !!s.mute[k]; });
      }
    } catch (e) { /* storage blocked or corrupt: keep defaults */ }
  }
  function save() {
    try { if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  function applyVolumes() {
    if (!ctx) return;
    var now = ctx.currentTime;
    function lv(k) { return settings.mute[k] ? 0 : settings[k]; }
    master.gain.setTargetAtTime(lv('master'), now, 0.03);
    musicGain.gain.setTargetAtTime(lv('music') * 0.9, now, 0.05);
    sfxIn.gain.setTargetAtTime(lv('sfx'), now, 0.03);
  }

  // ---------- context ----------
  function ensure() {
    if (ctx) return true;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      musicGain = ctx.createGain(); musicGain.gain.value = 0;
      duckGain = ctx.createGain(); duckGain.gain.value = 1;
      sfxIn = ctx.createGain(); sfxIn.gain.value = 0;
      musicGain.connect(duckGain); duckGain.connect(master);
      sfxIn.connect(master);
      master.connect(comp); comp.connect(ctx.destination);
      // white noise buffer (2s), made with a seeded generator
      var len = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0), r = mulberry32(99);
      for (var i = 0; i < len; i++) d[i] = r() * 2 - 1;
      applyVolumes();
    } catch (e) { ctx = null; return false; }
    resume();
    if (pendingScene) { var p = pendingScene; pendingScene = null; music(p); }
    return true;
  }
  function resume() {
    try { if (ctx && ctx.state === 'suspended' && ctx.resume) { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } } catch (e) { /* ignore */ }
  }
  function running() { return ctx && (ctx.state === 'running' || ctx.state === undefined); }

  // ---------- synthesis primitives ----------
  function done(node, extra) {
    node.onended = function () { try { node.disconnect(); if (extra) extra.disconnect(); } catch (e) { /* ignore */ } };
  }
  // o: t, type, f, f2, dur, vol, a, rel, glide, detune, lp, lp2, ftype, q, dest
  function tone(o) {
    if (!ctx) return null;
    var t = fin(o.t, ctx.currentTime), dur = Math.max(0.02, fin(o.dur, 0.2));
    var a = Math.min(fin(o.a, 0.004), dur * 0.9), vol = Math.max(0.0002, fin(o.vol, 0.2));
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, fin(o.f, 440)), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, fin(o.f2, 440)), t + dur * (o.glide || 1));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (o.rel) {
      g.gain.setValueAtTime(vol, Math.max(t + a, t + dur - o.rel));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var fl = null;
    if (o.lp) {
      fl = ctx.createBiquadFilter(); fl.type = o.ftype || 'lowpass';
      fl.frequency.setValueAtTime(Math.max(10, o.lp), t);
      if (o.lp2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.lp2), t + dur);
      fl.Q.value = o.q || 0.7;
      osc.connect(fl); fl.connect(g);
    } else osc.connect(g);
    g.connect(o.dest || sfxIn);
    osc.start(t); osc.stop(t + dur + 0.05);
    done(osc, g);
    return osc;
  }
  // o: t, dur, vol, a, type, f, f2, q, dest
  function noise(o) {
    if (!ctx || !noiseBuf) return null;
    var t = fin(o.t, ctx.currentTime), dur = Math.max(0.02, fin(o.dur, 0.15));
    var a = Math.min(fin(o.a, 0.003), dur * 0.9), vol = Math.max(0.0002, fin(o.vol, 0.2));
    var src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    fl.type = o.type || 'bandpass';
    fl.frequency.setValueAtTime(Math.max(10, fin(o.f, 2000)), t);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t + dur);
    fl.Q.value = o.q || 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (o.swell) { // peak later than the attack
      g.gain.linearRampToValueAtTime(vol, t + dur * o.swell);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(o.dest || sfxIn);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    done(src, g);
    return src;
  }
  // formant voice: sawtooth through two parallel bandpass filters, pitch and formants sweep
  var MEOWS = [
    { n: 'mew',    dur: 0.42, p: [620, 920, 700],   f1: [500, 850, 600],  f2: [1500, 2400, 1700], vib: 0 },
    { n: 'mrrow',  dur: 0.7,  p: [330, 520, 300],   f1: [420, 780, 450],  f2: [1100, 1900, 1000], vib: 22 },
    { n: 'grump',  dur: 0.6,  p: [210, 240, 150],   f1: [380, 620, 360],  f2: [900, 1300, 800],   vib: 12 },
    { n: 'kitten', dur: 0.26, p: [1000, 1500, 1250], f1: [700, 1000, 800], f2: [2400, 3200, 2600], vib: 0 },
    { n: 'huh',    dur: 0.55, p: [380, 430, 760],   f1: [450, 700, 900],  f2: [1300, 1700, 2500], vib: 0 },
    { n: 'yowl',   dur: 1.1,  p: [380, 700, 520],   f1: [500, 900, 700],  f2: [1400, 2100, 1600], vib: 30 }
  ];
  function voice(t, spec, vol, pitch, soft, dest) {
    if (!ctx) return;
    var dur = spec.dur * (soft ? 1.15 : 1), pm = pitch || 1;
    var src = ctx.createOscillator(), g = ctx.createGain(), mix = ctx.createGain();
    src.type = soft ? 'triangle' : 'sawtooth';
    var p = spec.p;
    src.frequency.setValueAtTime(p[0] * pm, t);
    src.frequency.linearRampToValueAtTime(p[1] * pm, t + dur * 0.4);
    src.frequency.linearRampToValueAtTime(p[2] * pm, t + dur);
    var lfo = null, lg = null;
    if (spec.vib) {
      lfo = ctx.createOscillator(); lg = ctx.createGain();
      lfo.frequency.setValueAtTime(spec.vib / 4, t); lg.gain.setValueAtTime(p[1] * pm * 0.03, t);
      lfo.connect(lg); lg.connect(src.frequency); lfo.start(t); lfo.stop(t + dur + 0.05); done(lfo, lg);
    }
    [spec.f1, spec.f2].forEach(function (f, i) {
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = i ? 5 : 4;
      bp.frequency.setValueAtTime(f[0], t);
      bp.frequency.linearRampToValueAtTime(f[1], t + dur * 0.4);
      bp.frequency.linearRampToValueAtTime(f[2], t + dur);
      var bg = ctx.createGain(); bg.gain.setValueAtTime(i ? 0.6 : 1, t);
      src.connect(bp); bp.connect(bg); bg.connect(mix);
    });
    var v = Math.max(0.0003, vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.06, dur * 0.2));
    g.gain.setValueAtTime(v, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mix.connect(g); g.connect(dest || sfxIn);
    src.start(t); src.stop(t + dur + 0.05); done(src, g);
    noise({ t: t, dur: dur * 0.5, vol: v * 0.12, type: 'highpass', f: 3500, dest: dest });
  }

  // kit wraps primitives with per-call time offset, pitch and volume scaling
  function kit(t, o) {
    var v = o.vol == null ? 1 : clamp(o.vol, 0, 2), p = o.pitch ? clamp(o.pitch, 0.25, 4) : 1;
    return {
      t: t, v: v, p: p,
      tone: function (x) {
        x = Object.assign({}, x); x.t = t + (x.at || 0); x.vol = (x.vol == null ? 0.25 : x.vol) * v;
        x.f = (x.f || 440) * p; if (x.f2) x.f2 *= p; if (x.lp) x.lp *= p; if (x.lp2) x.lp2 *= p;
        return tone(x);
      },
      noise: function (x) {
        x = Object.assign({}, x); x.t = t + (x.at || 0); x.vol = (x.vol == null ? 0.2 : x.vol) * v;
        x.f = (x.f || 2000) * (0.5 + p * 0.5); if (x.f2) x.f2 *= (0.5 + p * 0.5);
        return noise(x);
      },
      meow: function (i, vol, soft, at) { voice(t + (at || 0), MEOWS[i % MEOWS.length], vol * v, p * rnd(0.96, 1.04), soft); }
    };
  }

  // ---------- SFX library ----------
  var SFX = {};
  SFX.card_draw = function (k) {
    k.noise({ type: 'bandpass', f: 3200, f2: 1400, q: 1.2, dur: 0.09, vol: 0.2 });
    k.tone({ type: 'triangle', f: 640, f2: 420, dur: 0.05, vol: 0.05, at: 0.01 });
  };
  SFX.card_play = function (k) {
    k.noise({ type: 'bandpass', f: 1300, q: 0.9, dur: 0.06, vol: 0.28 });
    k.tone({ f: 230, f2: 110, dur: 0.14, vol: 0.28 });
    k.tone({ type: 'triangle', f: 880, f2: 1100, dur: 0.08, vol: 0.06, at: 0.03 });
  };
  SFX.cat_deploy = function (k) { k.meow(3, 0.16, true); k.tone({ type: 'sine', f: 520, f2: 780, dur: 0.18, vol: 0.05, at: 0.05 }); };
  for (var mi = 0; mi < 6; mi++) (function (i) {
    SFX['meow_' + (i + 1)] = function (k) { k.meow(i, 0.2); };
  })(mi);
  SFX.hiss = function (k) {
    k.noise({ type: 'bandpass', f: 6500, q: 0.7, dur: 0.6, vol: 0.28, swell: 0.4 });
    k.noise({ type: 'bandpass', f: 2800, q: 0.6, dur: 0.5, vol: 0.1, at: 0.02 });
  };
  SFX.pounce_hit = function (k) {
    k.noise({ type: 'lowpass', f: 1000, f2: 200, dur: 0.14, vol: 0.5 });
    k.tone({ f: 170, f2: 50, dur: 0.16, vol: 0.5 });
    k.noise({ type: 'highpass', f: 4000, dur: 0.04, vol: 0.12 });
  };
  SFX.claw_scratch = function (k) {
    for (var i = 0; i < 3; i++) {
      k.noise({ type: 'bandpass', f: 5200 - i * 400, f2: 2400, q: 1.5, dur: 0.07, vol: 0.2, at: i * 0.045 });
      k.noise({ type: 'highpass', f: 6500, dur: 0.05, vol: 0.08, at: i * 0.045 });
    }
  };
  SFX.heavy_hit = function (k) {
    k.tone({ f: 95, f2: 32, dur: 0.4, vol: 0.7 });
    k.noise({ type: 'lowpass', f: 600, f2: 90, dur: 0.28, vol: 0.55 });
    k.tone({ type: 'square', f: 70, f2: 30, dur: 0.22, vol: 0.12, lp: 300 });
    k.noise({ type: 'highpass', f: 3000, dur: 0.05, vol: 0.15 });
  };
  SFX.shatter = function (k) {
    k.noise({ type: 'highpass', f: 3500, q: 0.5, dur: 0.55, vol: 0.32 });
    k.tone({ f: 110, f2: 45, dur: 0.25, vol: 0.4 });
    for (var i = 0; i < 9; i++) k.tone({ f: rnd(2200, 6500), dur: rnd(0.05, 0.14), vol: rnd(0.05, 0.1), at: rnd(0.02, 0.4) });
  };
  SFX.knock_off = function (k) {
    var at = 0, gap = 0.07;
    for (var i = 0; i < 6; i++) {
      k.noise({ type: 'bandpass', f: rnd(1500, 4000), q: 2, dur: 0.05, vol: 0.2, at: at });
      k.tone({ type: 'triangle', f: rnd(300, 800), f2: rnd(150, 300), dur: 0.07, vol: 0.14, at: at });
      at += gap; gap *= 1.35;
    }
    k.tone({ f: 120, f2: 60, dur: 0.15, vol: 0.3, at: at });
  };
  SFX.box_flap = function (k) {
    k.noise({ type: 'bandpass', f: 800, q: 0.7, dur: 0.07, vol: 0.32 });
    k.noise({ type: 'bandpass', f: 500, q: 0.7, dur: 0.08, vol: 0.24, at: 0.07 });
    k.tone({ type: 'square', f: 130, f2: 80, dur: 0.07, vol: 0.06, lp: 400, at: 0.01 });
  };
  SFX.yarn_tangle = function (k) {
    var fr = [500, 700, 450, 620];
    for (var i = 0; i < 4; i++) k.tone({ type: 'triangle', f: fr[i], f2: fr[(i + 1) % 4], dur: 0.12, vol: 0.09, at: i * 0.07 });
    k.noise({ type: 'highpass', f: 5200, dur: 0.35, vol: 0.06 });
  };
  SFX.nap_zzz = function (k) {
    [660, 554, 440].forEach(function (f, i) {
      k.tone({ f: f, dur: 0.6, vol: 0.12, a: 0.02, at: i * 0.15 });
      k.tone({ f: f * 2.01, dur: 0.3, vol: 0.03, at: i * 0.15 });
    });
  };
  SFX.wake_stretch = function (k) {
    k.tone({ type: 'sawtooth', f: 200, f2: 330, dur: 0.55, vol: 0.12, lp: 500, lp2: 1100, q: 2, glide: 0.7 });
    k.noise({ type: 'bandpass', f: 800, f2: 2500, dur: 0.4, vol: 0.08, at: 0.1 });
    k.meow(4, 0.1, true, 0.45);
  };
  SFX.life_spent = function (k) {
    k.tone({ f: 330, f2: 290, dur: 1.0, vol: 0.3, a: 0.004 });
    k.tone({ f: 495, f2: 440, dur: 0.6, vol: 0.1 });
    k.tone({ f: 82, dur: 0.5, vol: 0.12 });
  };
  SFX.life_gained = function (k) {
    [523, 659, 784].forEach(function (f, i) { k.tone({ f: f, dur: 0.35, vol: 0.14, at: i * 0.07 }); });
    k.tone({ f: 1568, dur: 0.5, vol: 0.05, at: 0.2 });
  };
  SFX.zoomies_surge = function (k) {
    k.noise({ type: 'bandpass', f: 300, f2: 4200, q: 1.2, dur: 0.7, vol: 0.3, a: 0.05, swell: 0.7 });
    k.tone({ type: 'sawtooth', f: 140, f2: 900, dur: 0.6, vol: 0.1, lp: 1200, a: 0.05 });
    k.tone({ type: 'square', f: 280, f2: 1800, dur: 0.5, vol: 0.04, lp: 3000, a: 0.05 });
  };
  SFX.crash_down = function (k) {
    k.tone({ type: 'sawtooth', f: 620, f2: 70, dur: 0.8, vol: 0.28, lp: 1500, lp2: 150 });
    k.noise({ type: 'lowpass', f: 900, f2: 100, dur: 0.6, vol: 0.2 });
    k.tone({ f: 60, f2: 30, dur: 0.5, vol: 0.3, at: 0.6 });
  };
  SFX.witching_gong = function (k) {
    [110, 164.8, 233, 331, 468].forEach(function (f, i) {
      k.tone({ f: f, f2: f * 0.995, dur: 3.2 - i * 0.35, vol: 0.2 / (1 + i * 0.5), a: 0.01 });
    });
    k.noise({ type: 'lowpass', f: 1500, f2: 200, dur: 0.4, vol: 0.25 });
    k.tone({ f: 55, dur: 2.5, vol: 0.25 });
  };
  SFX.pest_squeak = function (k) {
    k.tone({ type: 'square', f: 2300, f2: 3300, dur: 0.06, vol: 0.07, lp: 4000 });
    k.tone({ type: 'square', f: 3100, f2: 2000, dur: 0.07, vol: 0.06, lp: 4000, at: 0.08 });
  };
  SFX.dog_bark = function (k) {
    [0, 0.22].forEach(function (at, i) {
      k.tone({ type: 'sawtooth', f: 240 - i * 20, f2: 130, dur: 0.16, vol: 0.28, lp: 900, lp2: 500, q: 3, at: at });
      k.noise({ type: 'bandpass', f: 1200, q: 1.5, dur: 0.09, vol: 0.18, at: at });
    });
  };
  SFX.vacuum_whirr = function (k) {
    k.tone({ type: 'sawtooth', f: 90, f2: 240, dur: 1.1, vol: 0.18, lp: 700, lp2: 2200, a: 0.1, glide: 0.8 });
    k.noise({ type: 'bandpass', f: 1500, q: 0.5, dur: 1.1, vol: 0.2, a: 0.1, swell: 0.7 });
  };
  SFX.spray_hiss = function (k) {
    k.tone({ type: 'square', f: 1800, f2: 900, dur: 0.02, vol: 0.08 });
    for (var i = 0; i < 3; i++) k.noise({ type: 'highpass', f: 5000, q: 0.5, dur: 0.1, vol: 0.25, at: 0.02 + i * 0.12 });
  };
  SFX.relic_gain = function (k) {
    [392, 523, 659, 784, 1047].forEach(function (f, i) { k.tone({ type: 'triangle', f: f, dur: 0.3, vol: 0.14, at: i * 0.08 }); });
    k.tone({ f: 2093, dur: 1.1, vol: 0.05, at: 0.4, a: 0.05 });
  };
  SFX.shop_coin = function (k) {
    k.tone({ type: 'square', f: 1319, dur: 0.07, vol: 0.08, lp: 5000 });
    k.tone({ type: 'square', f: 1760, dur: 0.3, vol: 0.09, lp: 5000, at: 0.07 });
    k.tone({ f: 3520, dur: 0.2, vol: 0.03, at: 0.07 });
  };
  SFX.upgrade_scratch = function (k) {
    SFX.claw_scratch(k);
    [659, 880, 1175].forEach(function (f, i) { k.tone({ type: 'triangle', f: f, dur: 0.25, vol: 0.11, at: 0.18 + i * 0.07 }); });
  };
  SFX.victory_fanfare = function (k) {
    var seq = [[523, 0, 0.14], [523, 0.16, 0.14], [659, 0.32, 0.14], [784, 0.48, 0.2], [659, 0.7, 0.12], [1047, 0.84, 0.9]];
    seq.forEach(function (n) {
      k.tone({ type: 'sawtooth', f: n[0], dur: n[2] + 0.1, vol: 0.14, lp: 2400, lp2: 1200, a: 0.015, at: n[1], rel: 0.08 });
      k.tone({ type: 'triangle', f: n[0] / 2, dur: n[2] + 0.1, vol: 0.1, at: n[1] });
    });
    [523, 659, 784].forEach(function (f) { k.tone({ type: 'triangle', f: f, dur: 1.6, vol: 0.08, a: 0.03, at: 0.84 }); });
    k.tone({ f: 2093, dur: 1.2, vol: 0.03, at: 0.9 });
  };
  SFX.defeat_sting = function (k) {
    [[392, 0], [349, 0.3], [311, 0.6], [262, 0.95]].forEach(function (n, i) {
      k.tone({ type: 'sawtooth', f: n[0], dur: i === 3 ? 1.8 : 0.4, vol: 0.14, lp: 900, lp2: 300, a: 0.02, at: n[1] });
    });
    k.tone({ f: 65, f2: 55, dur: 2.0, vol: 0.25, at: 0.95 });
  };
  SFX.ui_click = function (k) {
    k.tone({ f: 900, f2: 600, dur: 0.05, vol: 0.18 });
    k.noise({ type: 'bandpass', f: 3000, dur: 0.02, vol: 0.08 });
  };
  SFX.ui_hover = function (k) { k.tone({ f: 1250, f2: 1400, dur: 0.035, vol: 0.05, a: 0.003 }); };

  var LOOPS = {};
  // purr: low-frequency amplitude-modulated noise. Returns a handle with stop().
  LOOPS.purr = function (k, o) {
    var t = k.t, fade = 0.4;
    var src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), am = ctx.createGain(), out = ctx.createGain();
    var lfo = ctx.createOscillator(), lg = ctx.createGain(), sub = ctx.createOscillator(), sg = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    lp.type = 'lowpass'; lp.frequency.value = 220 * k.p; lp.Q.value = 1.2;
    am.gain.value = 0.5;                          // base level, the LFO swings it
    lfo.type = 'sine'; lfo.frequency.value = 24 * (0.85 + k.p * 0.15); lg.gain.value = 0.45;
    lfo.connect(lg); lg.connect(am.gain);
    sub.type = 'sine'; sub.frequency.value = 48 * k.p; sg.gain.value = 0.15;
    sub.connect(sg); sg.connect(am);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.9 * k.v, t + fade);
    src.connect(lp); lp.connect(am); am.connect(out); out.connect(sfxIn);
    src.start(t); lfo.start(t); sub.start(t);
    var stopped = false;
    var h = {
      stop: function (f) {
        if (stopped || !ctx) return; stopped = true;
        var now = ctx.currentTime, ff = clamp(f == null ? 0.5 : f, 0.02, 5);
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(Math.max(0.0001, out.gain.value || 0.5), now);
        out.gain.exponentialRampToValueAtTime(0.0001, now + ff);
        [src, lfo, sub].forEach(function (n) { try { n.stop(now + ff + 0.05); } catch (e) { /* ignore */ } });
        done(src, out);
        var i = loops.indexOf(h); if (i >= 0) loops.splice(i, 1);
      }
    };
    loops.push(h);
    if (o && o.dur) h._timer = setTimeoutSafe(function () { h.stop(); }, o.dur * 1000);
    return h;
  };
  function setTimeoutSafe(fn, ms) { var id = setTimeout(fn, ms); if (id && id.unref) id.unref(); return id; }

  var ALIAS = { meow: null, purr_start: 'purr', click: 'ui_click', hover: 'ui_hover', gong: 'witching_gong', coin: 'shop_coin', bark: 'dog_bark', squeak: 'pest_squeak', win: 'victory_fanfare', lose: 'defeat_sting' };
  var THROTTLE = { ui_hover: 0.04, ui_click: 0.03, card_draw: 0.04, pest_squeak: 0.05, claw_scratch: 0.04 };
  var NOOP = { stop: function () {} };

  function names() { return Object.keys(SFX).concat(Object.keys(LOOPS), ['meow']); }
  function has(n) { return !!(SFX[n] || LOOPS[n] || n === 'meow' || (ALIAS[n])); }

  function play(name, opts) {
    opts = opts || {};
    if (name in ALIAS && ALIAS[name]) name = ALIAS[name];
    if (!has(name)) return NOOP;
    if (!ensure() || !running()) { resume(); return NOOP; }
    try {
      var now = ctx.currentTime, th = THROTTLE[name];
      if (th && lastPlayed[name] != null && now - lastPlayed[name] < th) return NOOP;
      lastPlayed[name] = now;
      var t = now + 0.005 + fin(opts.delay, 0);
      var k = kit(t, opts);
      if (name === 'meow') {
        var v = opts.variant != null ? opts.variant : Math.floor(Math.random() * 6);
        k.meow(((v % 6) + 6) % 6, 0.2);
        return NOOP;
      }
      if (LOOPS[name]) return LOOPS[name](k, opts);
      SFX[name](k, opts);
      if (name === 'victory_fanfare' || name === 'defeat_sting') duck(0.6, 2.2, 1.2);
      else if (name === 'witching_gong') duck(0.5, 1.5, 1.5);
      else if (name === 'heavy_hit' || name === 'shatter') duck(0.25, 0.12, 0.3);
    } catch (e) { /* audio must never break the game */ }
    return NOOP;
  }

  // ---------- ducking and volume API ----------
  function duck(amount, hold, release) {
    if (!ctx) return;
    amount = clamp(amount == null ? 0.4 : amount, 0, 0.95);
    var now = ctx.currentTime;
    try {
      duckGain.gain.cancelScheduledValues(now);
      duckGain.gain.setTargetAtTime(1 - amount, now, 0.02);
      duckGain.gain.setTargetAtTime(1, now + clamp(hold == null ? 0.5 : hold, 0, 10), clamp((release == null ? 0.6 : release) / 3, 0.02, 3));
    } catch (e) { /* ignore */ }
  }
  function setVolume(kind, v) {
    if (!settings.hasOwnProperty(kind) || kind === 'mute') return;
    settings[kind] = clamp(v, 0, 1); save(); applyVolumes();
  }
  function setMuted(kind, on) {
    kind = kind || 'master';
    if (!(kind in settings.mute)) return;
    settings.mute[kind] = !!on; save(); applyVolumes();
  }
  function toggleMute(kind) {
    kind = kind || 'master';
    if (!(kind in settings.mute)) return false;
    setMuted(kind, !settings.mute[kind]); return settings.mute[kind];
  }

  // ---------- music ----------
  var SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], majPent: [0, 2, 4, 7, 9], minPent: [0, 3, 5, 7, 10],
    minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10], blues: [0, 3, 5, 6, 7, 10]
  };
  var M = { scene: null, S: null, timer: null, next: 0, step: 0, I: 0, targetI: 0, dest: null };

  function mt(o) { o.dest = M.dest; return tone(o); }
  function mn(o) { o.dest = M.dest; return noise(o); }
  function kick(t, v) { mt({ t: t, f: 150, f2: 42, dur: 0.16, vol: v || 0.3, a: 0.002 }); mn({ t: t, type: 'lowpass', f: 800, dur: 0.02, vol: (v || 0.3) * 0.3 }); }
  function snare(t, v) { mn({ t: t, type: 'bandpass', f: 1900, q: 0.8, dur: 0.11, vol: v || 0.14 }); mt({ t: t, type: 'triangle', f: 210, f2: 150, dur: 0.07, vol: (v || 0.14) * 0.5 }); }
  function hat(t, v) { mn({ t: t, type: 'highpass', f: 7500, q: 0.5, dur: 0.035, vol: v || 0.04 }); }
  function pluck(t, f, dur, v) { mt({ t: t, type: 'triangle', f: f, dur: dur, vol: v, lp: 2600, lp2: 450, a: 0.003 }); }
  function boxNote(t, f, v) {
    mt({ t: t, f: f, dur: 1.0, vol: v, a: 0.002 });
    mt({ t: t, f: f * 2, dur: 0.45, vol: v * 0.3, a: 0.002 });
    mt({ t: t, f: f * 4.02, dur: 0.18, vol: v * 0.15, a: 0.002 });
  }
  function bell(t, f, dur, v) {
    mt({ t: t, f: f, dur: dur, vol: v, a: 0.004 });
    mt({ t: t, f: f * 2.76, dur: dur * 0.5, vol: v * 0.35, a: 0.004 });
    mt({ t: t, f: f * 5.4, dur: dur * 0.2, vol: v * 0.12, a: 0.004 });
  }
  function pad(t, freqs, dur, v, type) {
    freqs.forEach(function (f, i) { mt({ t: t, type: type || 'triangle', f: f, dur: dur, vol: v, a: dur * 0.25, rel: dur * 0.4, detune: (i - 1) * 4, lp: 1400 }); });
  }

  var SCENES = {};
  SCENES.title = { bpm: 78, root: 60, scale: 'majPent', prog: [0, 3, 4, 2], fn: function (S) {
    var s = S.s, cd = S.cd, r = S.rng;
    if (s === 0) { pad(S.t, [S.f(cd, -1), S.f(cd + 2, -1), S.f(cd + 4, -1)], 16 * S.dur, 0.035); }
    if (s === 0 || s === 8) mt({ t: S.t, f: S.f(cd, -2), dur: 6 * S.dur, vol: 0.12, a: 0.02 });
    if (s % 2 === 0 && r() < (s % 4 === 0 ? 0.8 : 0.45)) {
      var m = S.st; m.last = clamp((m.last == null ? 3 : m.last) + pick2(r, [-2, -1, -1, 1, 1, 2]), -1, 9);
      if (s === 0) m.last = cd + pick2(r, [0, 2, 4]) + 5;
      boxNote(S.t, S.f(m.last, 1), 0.08);
    }
  } };
  SCENES.map = { bpm: 92, root: 62, scale: 'dorian', prog: [0, 3, 4, 0], fn: function (S) {
    var s = S.s, cd = S.cd, r = S.rng, arp = [0, 2, 4, 2, 5, 4, 2, 1];
    if (s === 0) pad(S.t, [S.f(cd, -1), S.f(cd + 4, -1)], 16 * S.dur, 0.03, 'sine');
    if (s % 2 === 0 && r() < 0.78) pluck(S.t, S.f(cd + arp[(s / 2) % 8], 0), 3 * S.dur, 0.09);
    if ((s === 0 || s === 10) && r() < 0.9) pluck(S.t, S.f(cd, -2), 4 * S.dur, 0.13);
    if (s === 7 && r() < 0.3) pluck(S.t, S.f(cd + 7, 1), 4 * S.dur, 0.05);
  } };
  SCENES.battle = { bpm: 112, root: 57, scale: 'minPent', prog: [0, 0, 3, 4], tempo: 0.18, fn: function (S) {
    var s = S.s, cd = S.cd, r = S.rng, I = S.I;
    var bassHits = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1];
    if (bassHits[s]) {
      var up = (s === 6 || s === 15) ? 1 : 0;
      mt({ t: S.t, type: 'square', f: S.f(cd, -2 + up), dur: 2 * S.dur, vol: 0.09 + 0.04 * I, lp: 520 + 700 * I, lp2: 220, a: 0.003 });
      if (I > 0.7) mt({ t: S.t, type: 'sawtooth', f: S.f(cd, -1), dur: S.dur, vol: 0.03, lp: 900 });
    }
    if (s === 0 || s === 8 || (I > 0.35 && s === 6) || (I > 0.7 && (s === 4 || s === 12))) kick(S.t, 0.28 + 0.08 * I);
    if (s === 12 || (I > 0.1 && s === 4)) snare(S.t, 0.1 + 0.07 * I);
    if (s % 2 === 0) hat(S.t, 0.03 + 0.03 * I); else if (I > 0.5) hat(S.t, 0.02 + 0.02 * I);
    if (I > 0.25 && (s === 2 || s === 7 || s === 11 || s === 14) && r() < 0.35 + 0.45 * I) pluck(S.t, S.f(cd + pick2(r, [0, 2, 4, 5, 7]), 1), 2 * S.dur, 0.07);
    if (I > 0.6 && s === 0 && S.bar % 2 === 1) mt({ t: S.t, type: 'sawtooth', f: S.f(cd, 0) * 1.0595, dur: 3 * S.dur, vol: 0.04, lp: 1200 });
    if (I > 0.8 && (s === 0 || s === 3 || s === 6)) mt({ t: S.t, type: 'sawtooth', f: S.f(cd + 2, 0), dur: S.dur * 0.8, vol: 0.05, lp: 1800 });
  } };
  SCENES.witching = { bpm: 88, root: 54, scale: 'phryg', prog: [0, 1, 0, 4], tempo: 0.1, fn: function (S) {
    var s = S.s, r = S.rng, I = Math.max(S.I, 0.35);
    if (s === 0 && S.bar % 2 === 0) {
      mt({ t: S.t, f: S.f(0, -2), dur: 32 * S.dur, vol: 0.09, a: 1.5, rel: 2 });
      mt({ t: S.t, f: S.f(4, -2) * 1.007, dur: 32 * S.dur, vol: 0.05, a: 2, rel: 2 });
    }
    if (s % 4 === 0) {
      var up = (s / 4) % 2 === 0;
      mn({ t: S.t, type: 'bandpass', f: up ? 3600 : 2800, q: 9, dur: 0.03, vol: 0.12 });
      mt({ t: S.t, f: up ? 1800 : 1400, dur: 0.025, vol: 0.05 });
    }
    if (s % 2 === 0 && r() < 0.2 + 0.2 * I) bell(S.t, S.f(pick2(r, [0, 1, 3, 4, 6, 7]), 1) * (1 + (r() - 0.5) * 0.01), 1.6, 0.05);
    if (I > 0.5 && s === 0) mt({ t: S.t, f: 1200, f2: 1260, dur: 4 * S.dur * 4, vol: 0.015, a: 1, rel: 1.5 });
    if (I > 0.3 && (s === 0 || s === 3)) mt({ t: S.t, f: 62, f2: 40, dur: 0.18, vol: 0.26 });
  } };
  SCENES.boss = { bpm: 132, root: 52, scale: 'minor', prog: [0, 5, 3, 4], fn: function (S) {
    var s = S.s, cd = S.cd, r = S.rng;
    var pat = [0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 7, 0, 3, 0, 5, 6];
    var o = pat[s] >= 7 ? 1 : 0, dg = pat[s] >= 7 ? pat[s] - 7 : pat[s];
    mt({ t: S.t, type: 'sawtooth', f: S.f(cd + dg, -2 + o), dur: S.dur * 1.1, vol: 0.09, lp: 900, lp2: 300, a: 0.003 });
    if (s % 4 === 0 || (s === 14 && r() < 0.5)) kick(S.t, 0.34);
    if (s === 4 || s === 12) snare(S.t, 0.17);
    hat(S.t, s % 4 === 2 ? 0.05 : 0.025);
    if (s === 0 || s === 3 || s === 6 || s === 10) {
      [0, 2, 4].forEach(function (d) { mt({ t: S.t, type: 'sawtooth', f: S.f(cd + d, 0), dur: S.dur * 1.5, vol: 0.035, lp: 1800, lp2: 700, detune: d * 3 }); });
    }
    if (S.bar % 2 === 1 && [0, 2, 3, 6, 8, 10, 11, 14].indexOf(s) >= 0 && r() < 0.85) {
      mt({ t: S.t, type: 'sawtooth', f: S.f(cd + pick2(r, [0, 2, 4, 7, 9]), 1), dur: S.dur * 1.4, vol: 0.05, lp: 2600, lp2: 900 });
    }
    if (s === 0 && S.bar % 4 === 0) mn({ t: S.t, type: 'highpass', f: 5000, dur: 1.2, vol: 0.07 });
  } };
  var SHOP_PROG = [{ r: 0, c: [4, 7, 11] }, { r: 9, c: [4, 7, 10] }, { r: 2, c: [3, 7, 10] }, { r: 7, c: [4, 7, 10] }];
  SCENES.shop = { bpm: 100, root: 58, scale: 'blues', prog: [0, 1, 2, 3], swing: 0.5, fn: function (S) {
    var s = S.s, r = S.rng, ch = SHOP_PROG[S.bar % 4], nx = SHOP_PROG[(S.bar + 1) % 4];
    if (s % 4 === 0) {
      var kq = s / 4, base = S.root - 12;
      var off = [ch.r, ch.r + ch.c[0], ch.r + ch.c[1], nx.r - 1][kq];
      mt({ t: S.t, type: 'triangle', f: mtof(base + off), dur: 3.4 * S.dur, vol: 0.16, lp: 700, a: 0.01 });
    }
    if ((s === 0 || s === 6 || (s === 10 && r() < 0.5)) ) {
      ch.c.forEach(function (iv) {
        var f = mtof(S.root + 12 + ch.r + iv);
        mt({ t: S.t, f: f, dur: 5 * S.dur, vol: 0.035, a: 0.003 });
        mt({ t: S.t, type: 'triangle', f: f * 2, dur: 2 * S.dur, vol: 0.012, a: 0.003 });
      });
    }
    if (s % 4 === 0) mn({ t: S.t, type: 'highpass', f: 6500, dur: 0.12, vol: 0.035 });
    if (s % 4 === 2) mn({ t: S.t, type: 'highpass', f: 6500, dur: 0.07, vol: 0.022 });
    if (s === 4 || s === 12) mn({ t: S.t, type: 'bandpass', f: 2500, dur: 0.05, vol: 0.05 });
    if (s % 2 === 0 && r() < 0.35) {
      var m = S.st; m.last = clamp((m.last == null ? 3 : m.last) + pick2(r, [-2, -1, 1, 2]), 0, 9);
      mt({ t: S.t, type: 'sawtooth', f: S.f(m.last, 1), dur: 3 * S.dur, vol: 0.04, lp: 1300, lp2: 600, a: 0.02 });
    }
  } };
  SCENES.victory = { bpm: 104, root: 60, scale: 'major', prog: [0, 4, 5, 3], fn: function (S) {
    var s = S.s, cd = S.cd, r = S.rng, arp = [0, 2, 4, 7, 4, 2, 4, 2];
    if (s === 0) pad(S.t, [S.f(cd, 0), S.f(cd + 2, 0), S.f(cd + 4, 0)], 16 * S.dur, 0.04);
    if (s === 0 || s === 8) { mt({ t: S.t, f: S.f(cd, -2), dur: 6 * S.dur, vol: 0.14, a: 0.01 }); kick(S.t, 0.12); }
    if (s % 2 === 0 && r() < 0.85) bell(S.t, S.f(cd + arp[(s / 2) % 8], 1), 1.1, 0.06);
    if (s % 4 === 2) hat(S.t, 0.018);
  } };
  SCENES.defeat = { bpm: 56, root: 57, scale: 'minor', prog: [0, 5, 3, 0], fn: function (S) {
    var s = S.s, cd = S.cd, r = S.rng;
    if (s === 0) { pad(S.t, [S.f(cd, -1), S.f(cd + 2, -1), S.f(cd + 4, -1)], 16 * S.dur, 0.04, 'sine'); mt({ t: S.t, f: S.f(cd, -2), dur: 12 * S.dur, vol: 0.12, a: 0.3 }); }
    if (s % 4 === 0 && r() < 0.35) bell(S.t, S.f(cd + pick2(r, [0, 2, 4, 6]), 1), 1.8, 0.04);
  } };
  var SCENE_ALIAS = { witching_hour: 'witching', night: 'witching', elite: 'battle', event: 'map', nap: 'title', rest: 'title', menu: 'title', win: 'victory', lose: 'defeat', gameover: 'defeat' };

  function pick2(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  function makeState(name) {
    var sc = SCENES[name];
    return { name: name, def: sc, st: {}, root: sc.root, scale: SCALES[sc.scale], bar: 0 };
  }
  function degFreq(S, d, oct) {
    var sc = S.scale, n = sc.length, i = Math.floor(d / n), k = ((d % n) + n) % n;
    return mtof(S.root + sc[k] + 12 * (i + (oct || 0)));
  }
  function stepDur() {
    var def = M.S.def, mul = 1 + (def.tempo || 0) * M.I;
    return 60 / (def.bpm * mul) / 4;
  }
  function tick() {
    if (!ctx || !M.S) return;
    if (!running()) { return; }
    var now = ctx.currentTime;
    if (M.next < now - 0.1) M.next = now + 0.05;      // we fell behind (tab was hidden), resync
    var guard = 0;
    while (M.next < now + 0.2 && guard++ < 64) {
      M.I += (M.targetI - M.I) * 0.08;
      var S = M.S, dur = stepDur(), s = M.step % 16, bar = Math.floor(M.step / 16);
      var def = S.def, t = M.next + ((def.swing && s % 4 === 2) ? def.swing * dur * 1.33 : 0);
      if (s === 0 || !S.rng || S.rngBar !== bar) { S.rng = mulberry32((seed + hash(S.name) + bar * 7919) >>> 0); S.rngBar = bar; }
      var ctxo = {
        t: t, s: s, bar: bar, dur: dur, I: M.I, rng: S.rng, st: S.st, root: S.root,
        cd: def.prog[bar % def.prog.length],
        f: function (d, o) { return degFreq(S, d, o); }
      };
      M.dest = S.out;
      try { def.fn(ctxo); } catch (e) { /* never let music kill the scheduler */ }
      M.next += dur; M.step++;
    }
  }
  function startTimer() {
    if (M.timer) return;
    M.timer = setInterval(tick, 40);
    if (M.timer && M.timer.unref) M.timer.unref();
  }
  function music(scene) {
    if (scene === false || scene === 'off' || scene === 'stop' || scene == null) { stopMusic(); return true; }
    scene = SCENE_ALIAS[scene] || scene;
    if (!SCENES[scene]) return false;
    if (!ensure()) { pendingScene = scene; return false; }
    if (M.scene === scene) return true;
    var now = ctx.currentTime;
    if (M.S && M.S.out) fadeOut(M.S.out, 0.6);
    var S = makeState(scene);
    S.out = ctx.createGain(); S.out.gain.setValueAtTime(0.0001, now);
    S.out.gain.setTargetAtTime(1, now, 0.25);
    S.out.connect(musicGain);
    M.S = S; M.scene = scene; M.step = 0; M.next = now + 0.08; M.dest = S.out;
    startTimer();
    return true;
  }
  function fadeOut(node, secs) {
    var now = ctx.currentTime;
    try {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(0, now, secs / 3);
    } catch (e) { /* ignore */ }
    var id = setTimeout(function () { try { node.disconnect(); } catch (e) { /* ignore */ } }, (secs + 4) * 1000);
    if (id && id.unref) id.unref();
  }
  function stopMusic() {
    pendingScene = null;
    if (ctx && M.S && M.S.out) fadeOut(M.S.out, 0.8);
    M.S = null; M.scene = null;
    if (M.timer) { clearInterval(M.timer); M.timer = null; }
  }
  function setIntensity(x) { M.targetI = clamp(x, 0, 1); }
  // convenience: Sunbeam Warmth danger, 0 = full warmth (calm), 1 = nearly out
  function setWarmth(cur, max) { setIntensity(1 - clamp(cur / (max || 40), 0, 1)); }

  // ---------- init ----------
  function init(opts) {
    opts = opts || {};
    if (inited) return api;
    inited = true;
    if (opts.seed != null) seed = opts.seed | 0;
    load();
    var doc = root.document;
    if (doc && doc.addEventListener) {
      var unlock = function () {
        ensure(); resume();
        if (ctx && ctx.state === 'running') {
          ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (e) { doc.removeEventListener(e, unlock, true); });
        }
      };
      ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (e) { doc.addEventListener(e, unlock, true); });
      doc.addEventListener('visibilitychange', function () {
        if (!ctx) return;
        try { if (doc.hidden) ctx.suspend && ctx.suspend(); else resume(); } catch (e) { /* ignore */ }
      });
    }
    return api;
  }

  var api = {
    init: init, play: play, music: music, stopMusic: stopMusic, setIntensity: setIntensity, setWarmth: setWarmth,
    duck: duck, setVolume: setVolume, setMuted: setMuted, toggleMute: toggleMute,
    isMuted: function (k) { return !!settings.mute[k || 'master']; },
    getSettings: function () { return JSON.parse(JSON.stringify(settings)); },
    setSeed: function (n) { seed = n | 0; },
    names: names, has: has, scenes: function () { return Object.keys(SCENES); },
    stopAll: function () { loops.slice().forEach(function (h) { h.stop(0.1); }); },
    currentScene: function () { return M.scene; },
    unlock: function () { ensure(); resume(); },
    _tick: tick, _ctx: function () { return ctx; }
  };
  root.SB.audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
