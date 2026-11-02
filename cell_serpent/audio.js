// Synth: every sound is generated, no audio files.
// Buses: sfx and music (with a duck gain) -> master -> limiter -> out. Music is a sectioned 16-step groove:
// key and tempo change every 5 stages, bosses get their own tense track, and the layers follow
// mix({ stage, boss, groove (0..1), danger (0..1) }).
export function createAudio() {
  let ac = null, master = null, sfxBus = null, musBus = null, duckG = null, muted = false, musicAllowed = true, noiseBuf = null;
  let musicOn = false, step = 0, nextT = 0, timer = null, intensity = 0;
  let mixS = { stage: 1, boss: false, groove: 0, danger: 0 };
  let live = 0, chain = 0, chainT = 0;
  const last = {};
  function ensure() {
    if (ac) return ac;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.6;
      const lim = ac.createDynamicsCompressor();   // brickwall-ish limiter so nothing clips
      lim.threshold.value = -7; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
      master.connect(lim); lim.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      duckG = ac.createGain(); duckG.gain.value = 1; duckG.connect(master);
      musBus = ac.createGain(); musBus.gain.value = 0.55; musBus.connect(duckG);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; return null; }
    return ac;
  }
  const bus = b => (b === 'm' ? musBus : sfxBus);
  function tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0, b = 's') {
    if (!ac || muted || live > 48) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(bus(b)); o.start(t); o.stop(t + dur + 0.02);
    live++; o.onended = () => { live--; };
  }
  function noise(dur, vol = 0.2, f0 = 2000, f1 = 300, type = 'lowpass', delay = 0, b = 's') {
    if (!ac || muted || live > 48) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus(b)); s.start(t); s.stop(t + dur);
    live++; s.onended = () => { live--; };
  }
  // lower the music for a moment (big moments), then let it swell back
  function duck(amt = 0.5, hold = 0.35) {
    if (!ac || !duckG) return;
    const t = ac.currentTime;
    try { duckG.gain.cancelScheduledValues(t); duckG.gain.setTargetAtTime(1 - amt, t, 0.02); duckG.gain.setTargetAtTime(1, t + hold, 0.3); } catch (e) { /* ignore */ }
  }
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const gate = (k, ms) => { const n = now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const PENT = [0, 2, 4, 7, 9];   // major pentatonic: pops always sound in key
  const pentHz = (i, base = 72) => hz(base + PENT[i % 5] + 12 * Math.floor(i / 5));
  function chainPitch() { const n = now(); chain = n - chainT < 650 ? Math.min(chain + 1, 14) : 0; chainT = n; return chain; }

  const sfx = {
    shoot: () => gate('shoot', 70) && tone(520 + Math.random() * 60, 0.07, 'square', 0.04, -200),
    hit: () => gate('hit', 35) && tone(240 + Math.random() * 80, 0.05, 'triangle', 0.07, -90),
    // pop: pitch climbs a pentatonic ladder along a kill chain
    kill: e => {
      if (!gate('kill', 30)) return;
      const c = chainPitch(), f = pentHz(c, 69);
      tone(f, 0.11, 'sine', 0.13, f * 0.35); tone(f * 2, 0.05, 'triangle', 0.05, 0, 0.01); noise(0.07, 0.07, 3500, 500);
      if (e && e.head) { tone(120, 0.45, 'sawtooth', 0.14, -70); noise(0.2, 0.15, 1800, 150); duck(0.4, 0.3); }
    },
    boom: () => { noise(0.55, 0.3, 1500, 80); tone(90, 0.4, 'sawtooth', 0.18, -60); tone(55, 0.5, 'sine', 0.25, -20); duck(0.55, 0.4); },
    split: () => tone(660, 0.12, 'square', 0.06, 300),
    gem: () => gate('gem', 45) && tone(880 + (now() % 7) * 40, 0.08, 'sine', 0.07, 400),
    // coin: a bright two-note ding with a little sparkle on top
    coin: () => { if (!gate('coin', 45)) return; const j = (chain % 4) * 30; tone(1319 + j, 0.07, 'square', 0.04); tone(1976 + j, 0.16, 'triangle', 0.07, 0, 0.05); tone(3951, 0.1, 'sine', 0.025, 0, 0.06); },
    hurt: () => { noise(0.3, 0.28, 900, 100); tone(140, 0.3, 'sawtooth', 0.18, -80); duck(0.5, 0.3); },
    block: () => tone(900, 0.1, 'triangle', 0.09, -300),
    power: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, 0, i * 0.06)); tone(1568, 0.3, 'sine', 0.04, 0, 0.18); },
    levelup: () => { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.18, 'square', 0.07, 0, i * 0.07)); tone(1760, 0.35, 'sine', 0.05, 0, 0.28); duck(0.35, 0.4); },
    upgrade: () => { tone(700, 0.12, 'triangle', 0.09, 300); tone(1400, 0.2, 'sine', 0.04, 0, 0.08); },
    spit: () => gate('spit', 60) && tone(200, 0.15, 'sawtooth', 0.05, 160),
    roar: () => { tone(70, 0.7, 'sawtooth', 0.2, -25); noise(0.6, 0.16, 600, 80); duck(0.5, 0.6); },
    clear: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.24, 'triangle', 0.1, 0, i * 0.09)); [1047, 1319, 1568].forEach(f => tone(f, 0.6, 'sine', 0.05, 0, 0.45)); duck(0.7, 1.2); },
    stage: e => { if (e && e.boss) sfx.bossintro(); else { tone(330, 0.12, 'square', 0.07, 80); tone(494, 0.14, 'triangle', 0.05, 0, 0.1); } },
    swarm: () => tone(180, 0.25, 'square', 0.06, 120),
    revive: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.22, 'sine', 0.11, 0, i * 0.08)); tone(1568, 0.5, 'sine', 0.04, 0, 0.3); duck(0.5, 0.6); },
    dead: () => { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.12, -30, i * 0.18)); noise(0.8, 0.18, 800, 60); duck(0.9, 1.5); },
    click: () => tone(640, 0.04, 'triangle', 0.06, -120),
    // animal voices: every skill has a sound
    moo: () => gate('moo', 160) && (tone(115, 0.5, 'sawtooth', 0.09, -28), tone(230, 0.45, 'triangle', 0.05, -50)),
    meow: () => gate('meow', 140) && (tone(650, 0.16, 'triangle', 0.08, 350), tone(960, 0.22, 'triangle', 0.07, -480, 0.14)),
    chirp: () => gate('chirp', 90) && (tone(1800, 0.06, 'sine', 0.06, 700), tone(2300, 0.06, 'sine', 0.05, -500, 0.07)),
    bark: () => gate('bark', 140) && (noise(0.08, 0.18, 2600, 500), tone(270, 0.12, 'sawtooth', 0.1, -130)),
    quack: () => gate('quack', 120) && (tone(540, 0.11, 'sawtooth', 0.06, -190), tone(500, 0.1, 'sawtooth', 0.05, -160, 0.12)),
    hoot: () => gate('hoot', 220) && (tone(430, 0.3, 'sine', 0.09, -70), tone(430, 0.3, 'sine', 0.07, -70, 0.34)),
    coo: () => gate('coo', 120) && tone(620, 0.18, 'sine', 0.06, 140),
    squeak: () => gate('squeak', 80) && tone(2400, 0.05, 'square', 0.03, -900),
    baa: () => gate('baa', 200) && (tone(320, 0.4, 'sawtooth', 0.07, 45), tone(330, 0.4, 'sawtooth', 0.045, 40, 0.01)),
    oink: () => gate('oink', 200) && (tone(190, 0.1, 'sawtooth', 0.09, 60), tone(200, 0.1, 'sawtooth', 0.08, -40, 0.11)),
    boop: () => gate('boop', 200) && tone(330, 0.2, 'sine', 0.09, -120),
    danger: () => gate('danger', 300) && (tone(150, 0.1, 'square', 0.1), tone(150, 0.1, 'square', 0.1, 0, 0.16)),
    mend: () => gate('mend', 300) && tone(880, 0.12, 'sine', 0.05, 520),
    skip: () => tone(420, 0.1, 'triangle', 0.07, -120),

    // ---- new sounds (see the report for which events should call them)
    pop: e => sfx.kill(e),
    // yellow upgrade cell popped: glassy chime
    cell: () => { if (!gate('cell', 120)) return; [988, 1319, 1760].forEach((f, i) => tone(f, 0.28, 'sine', 0.08, 0, i * 0.055)); tone(2637, 0.4, 'triangle', 0.03, 0, 0.18); duck(0.3, 0.3); },
    // a card appears / is picked, per rarity 0..5 (common to mythic); epic and above get a rising shimmer
    card: e => {
      const r = Math.max(0, Math.min(5, (e && (e.rarity | 0)) || 0));
      const base = [523, 587, 659, 740, 784, 880][r];
      tone(base, 0.16, 'triangle', 0.08); tone(base * 1.5, 0.2, 'sine', 0.05, 0, 0.06);
      if (r >= 1) tone(base * 2, 0.25, 'sine', 0.05, 0, 0.1);
      if (r >= 2) { for (let i = 0; i < 4 + r; i++) tone(base * 2 * Math.pow(1.122, i * 2), 0.18 + i * 0.02, 'sine', 0.05, 0, 0.12 + i * 0.05); }
      if (r >= 4) { noise(0.7, 0.05, 3000, 9000, 'bandpass', 0.05); tone(base / 2, 0.8, 'sawtooth', 0.04, base / 4, 0.1); duck(0.45, 0.6); }
      if (r >= 3) { tone(base * 3, 0.5, 'sine', 0.04, 0, 0.35); duck(0.3, 0.5); }
    },
    // cute stinger for stars (e.n = star number 1..3) and for rare cards
    star: e => {
      const n = Math.max(1, Math.min(3, (e && (e.n | 0)) || 1)), f = [784, 988, 1175][n - 1];
      tone(f, 0.18, 'triangle', 0.09); tone(f * 2, 0.3, 'sine', 0.06, 0, 0.07); tone(f * 3, 0.35, 'sine', 0.025, 0, 0.12);
      if (n === 3) [1047, 1319, 1568, 2093].forEach((g, i) => tone(g, 0.3, 'triangle', 0.06, 0, 0.2 + i * 0.07));
      duck(0.4, 0.5);
    },
    stinger: () => { [659, 880, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, 0, i * 0.06)); tone(2093, 0.4, 'sine', 0.05, 0, 0.26); duck(0.4, 0.5); },
    // boss arrives: low sting with a falling tritone
    bossintro: () => { tone(60, 1.0, 'sawtooth', 0.22, -22); tone(185, 0.6, 'square', 0.07, -60, 0.1); tone(131, 0.7, 'square', 0.07, -40, 0.35); noise(0.9, 0.12, 400, 60); duck(0.6, 1.0); },
    win: () => sfx.clear(),
    // groove milestone (every 5): a small rising blip
    groovehit: e => { if (!gate('groovehit', 200)) return; const k = Math.min(4, ((e && e.n) || 5) / 5 | 0); tone(pentHz(k + 2, 72), 0.14, 'triangle', 0.07); tone(pentHz(k + 4, 72), 0.2, 'sine', 0.05, 0, 0.06); },
    // snake reached the line: sharp alarm
    leak: () => { if (!gate('leak', 250)) return; tone(220, 0.25, 'sawtooth', 0.15, -110); tone(165, 0.3, 'square', 0.08, -60, 0.05); noise(0.3, 0.15, 1200, 100); duck(0.5, 0.4); },
    // soft UI set
    tap: () => tone(760, 0.035, 'sine', 0.06, -150),
    ready: () => { tone(1320, 0.07, 'sine', 0.05); tone(1760, 0.09, 'sine', 0.045, 0, 0.05); },
    tab: () => { tone(520, 0.05, 'triangle', 0.05); tone(780, 0.06, 'sine', 0.04, 0, 0.03); },
    back: () => tone(440, 0.07, 'triangle', 0.06, -150),
    toggle: () => { tone(600, 0.05, 'triangle', 0.06); tone(900, 0.07, 'sine', 0.05, 0, 0.045); },
    buy: () => { tone(1319, 0.06, 'square', 0.04); tone(1760, 0.12, 'triangle', 0.06, 0, 0.05); tone(2349, 0.12, 'sine', 0.03, 0, 0.1); },
    deny: () => { tone(200, 0.09, 'square', 0.06, -30); tone(160, 0.12, 'square', 0.06, -30, 0.08); },
  };
  sfx.card0 = () => sfx.card({ rarity: 0 }); sfx.card1 = () => sfx.card({ rarity: 1 }); sfx.card2 = () => sfx.card({ rarity: 2 });
  sfx.card3 = () => sfx.card({ rarity: 3 }); sfx.card4 = () => sfx.card({ rarity: 4 }); sfx.card5 = () => sfx.card({ rarity: 5 });
  sfx.star1 = () => sfx.star({ n: 1 }); sfx.star2 = () => sfx.star({ n: 2 }); sfx.star3 = () => sfx.star({ n: 3 });

  // ---------------------------------------------------------------- music
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], phryg: [0, 1, 3, 5, 7, 8, 10] };
  const ROOTS = [0, 2, 4, 7, 9, 5, 10, 3, 8, 6];   // C D E G A F Bb Eb Ab F#: one key per 5 stages
  const PROG = [[0, 5, 3, 4], [5, 3, 0, 4], [3, 4, 2, 5], [0, 4, 5, 3]];   // 4 bars per section, sections cycle
  const BPROG = [[0, 0, 1, 0], [0, 5, 1, 4], [0, 0, 1, 6], [0, 1, 0, 4]];
  const note = (scale, deg, rootMidi) => rootMidi + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  const LEAD = [0, 2, 4, 2, 1, 4, 2, 0], LEADB = [0, 1, 0, 3, 0, 1, 4, 3];
  function kick(t, v = 0.3) { tone(150, 0.16, 'sine', v, -110, t, 'm'); noise(0.02, 0.05, 4000, 800, 'lowpass', t, 'm'); }
  function snare(t, v = 0.1) { noise(0.13, v, 3000, 1200, 'bandpass', t, 'm'); tone(190, 0.09, 'triangle', v * 0.7, -70, t, 'm'); }
  function hat(t, v = 0.03, open) { noise(open ? 0.14 : 0.03, v, 9000, 6000, 'highpass', t, 'm'); }
  let beatAt = 0, beatBpm = 0;
  function pump() {
    if (!musicOn || !ac) return;
    const m = mixS, boss = m.boss, tier = Math.floor(Math.max(0, m.stage - 1) / 5) % ROOTS.length;
    // groove meter and snake closeness raise the layers
    const lvl = Math.min(1, m.groove * 0.75 + m.danger * 0.45 + intensity * 0.2);
    const bpm = boss ? 138 + m.danger * 8 : 104 + tier * 3 + m.danger * 10;
    const sp = 60 / bpm / 4;
    while (nextT < ac.currentTime + 0.25) {
      const s = step % 16, bar = (step >> 4) % 4, sec = (step >> 6), t = Math.max(0, nextT - ac.currentTime);
      if (s % 4 === 0) { beatAt = nextT; beatBpm = bpm; }   // for the screen edge pulse (see beat())
      if (!muted) {
        const sc = boss ? SCALES.phryg : (tier % 3 === 2 ? SCALES.minor : SCALES.major);
        const root = 36 + ROOTS[tier] + (boss ? 5 : 0);
        const prog = (boss ? BPROG : PROG)[sec % 4], deg = prog[bar];
        const bassM = note(sc, deg, root), c0 = note(sc, deg, root + 24), c1 = note(sc, deg + 2, root + 24), c2 = note(sc, deg + 4, root + 24);
        // drums
        if (s % 4 === 0) kick(t, boss ? 0.32 : 0.26 + lvl * 0.04);
        else if (boss && (s === 6 || s === 14)) kick(t, 0.2);
        else if (lvl > 0.5 && s === 10) kick(t, 0.16);
        if ((s === 4 || s === 12) && (lvl > 0.2 || boss)) snare(t, boss ? 0.13 : 0.09);
        if (lvl > 0.1 || boss) { if (s % 4 === 2) hat(t, 0.035, s === 14); else if (lvl > 0.65 && s % 2 === 1) hat(t, 0.018); }
        // bass: eighths, octave jump to keep it moving
        if (s % 2 === 0) tone(hz(bassM + (s % 8 === 6 ? 12 : 0)), sp * 1.9, boss ? 'sawtooth' : 'triangle', boss ? 0.1 : 0.14, 0, t, 'm');
        // pad on the bar line
        if (s === 0 && (lvl > 0.15 || boss)) { [c0, c1, c2].forEach(n => tone(hz(n - 12), sp * 15, boss ? 'sawtooth' : 'sine', boss ? 0.02 : 0.03, 0, t, 'm')); }
        // arp over the chord
        if (lvl > 0.3 || boss) { const q = [c0, c1, c2, c1][(s >> (boss ? 0 : 1)) % 4]; if (boss ? s % 2 === 0 : s % 2 === 0) tone(hz(q + (sec % 2 && s >= 8 ? 12 : 0)), sp * 1.6, boss ? 'square' : 'square', boss ? 0.026 : 0.022, 0, t, 'm'); }
        // lead melody from high groove
        if ((lvl > 0.62 || (boss && lvl > 0.4)) && (s % 4 === 0 || s === 6 || s === 11 || s === 14)) {
          const li = (bar * 4 + (s >> 2) + (s === 14 ? 1 : 0)) % 8, ld = deg + (boss ? LEADB : LEAD)[li];
          tone(hz(note(sc, ld, root + 36)), sp * 2.6, boss ? 'sawtooth' : 'triangle', boss ? 0.03 : 0.05, 0, t, 'm');
        }
        // danger: a ticking clock when the snake is close to the line
        if (m.danger > 0.55 && s % 4 === 0) tone(1760, 0.03, 'square', 0.025 + m.danger * 0.02, 0, t, 'm');
        // section ends: riser into a crash
        if (bar === 3 && s === 12 && lvl > 0.35) noise(sp * 4, 0.06, 800, 9000, 'bandpass', t, 'm');
        if (bar === 0 && s === 0 && step > 0 && lvl > 0.35) noise(0.5, 0.05, 7000, 3000, 'highpass', t, 'm');
      }
      nextT += sp; step++;
    }
  }
  return {
    unlock() { const a = ensure(); if (a && a.state === 'suspended') { try { a.resume(); } catch (e) { /* ignore */ } } },
    play(name, e) { if (ac && sfx[name]) { try { sfx[name](e); } catch (err) { /* never break the game over a sound */ } } },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; },
    get muted() { return muted; },
    music(on) {
      musicOn = on && musicAllowed;
      clearInterval(timer);
      if (musicOn && ensure()) { step = 0; nextT = ac.currentTime + 0.05; timer = setInterval(pump, 80); }
    },
    setMusicAllowed(b) { musicAllowed = b; if (!b) { musicOn = false; clearInterval(timer); } },
    get musicAllowed() { return musicAllowed; },
    intensity(v) { intensity = v; },
    // groove 0..1, danger 0..1 (how close the face is to the line), stage number, boss flag
    mix(o) { if (o) mixS = { stage: o.stage || 1, boss: !!o.boss, groove: Math.max(0, Math.min(1, o.groove || 0)), danger: Math.max(0, Math.min(1, o.danger || 0)) }; },
    duck,
    // where we are in the beat: { bpm, phase 0..1 since the last kick }, or null when the music is not playing
    beat() {
      if (!musicOn || !ac || !beatBpm) return null;
      const spb = 60 / beatBpm; let ph = ((ac.currentTime - beatAt) / spb) % 1; if (ph < 0) ph += 1;
      return { bpm: beatBpm, phase: ph };
    },
    names: () => Object.keys(sfx),
  };
}
