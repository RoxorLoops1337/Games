// Synth: every sound is generated, no audio files.
// Buses: sfx and music (with a duck gain) -> master -> limiter -> out. Music is a sectioned 16-step groove:
// key and tempo change every 5 stages, bosses get their own tense track, and the layers follow
// mix({ stage, boss, groove (0..1), danger (0..1) }).
import { beatBpm as simBpm, SKINS, skinFor } from './sim.js';
import { pumpDepth, pumpEnv } from './audio_pump.js';
export function createAudio() {
  let ac = null, master = null, sfxBus = null, musBus = null, duckG = null, mlp = null, muffled = false, muted = false, musicAllowed = true, noiseBuf = null, beatTick = false, wantMusic = false, tickOn = false;
  let musicOn = false, step = 0, nextT = 0, timer = null, intensity = 0;
  let mixS = { stage: 1, boss: false, groove: 0, danger: 0, skin: 'love', bphase: 0 };
  let live = 0, chain = 0, chainT = 0, vol = 1, uiT = 0, bstreak = 0, lastBeatShot = 0, beatNow = 0, fresh = false;
  const last = {};
  function ensure() {
    if (ac) return ac;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.5 * vol;
      const lim = ac.createDynamicsCompressor();   // brickwall-ish limiter so nothing clips
      lim.threshold.value = -10; lim.knee.value = 3; lim.ratio.value = 14; lim.attack.value = 0.003; lim.release.value = 0.16;
      master.connect(lim); lim.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.72; sfxBus.connect(master);
      duckG = ac.createGain(); duckG.gain.value = 1; duckG.connect(master);
      mlp = ac.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = muffled ? MUF_SHUT : MUF_OPEN; mlp.connect(duckG);   // music only: closes under cards and pause
      musBus = ac.createGain(); musBus.gain.value = muffled ? MUS_MUFFLED : MUS_GAIN; musBus.connect(mlp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; return null; }
    return ac;
  }
  const MUF_OPEN = 20000, MUF_SHUT = 650, MUS_GAIN = 0.62, MUS_MUFFLED = 0.5;
  const bus = b => (b === 'm' ? musBus : sfxBus);
  function tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0, b = 's') {
    if (!ac || muted || live > 40) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(bus(b)); o.start(t); o.stop(t + dur + 0.02);
    live++; o.onended = () => { live--; };
  }
  function noise(dur, vol = 0.2, f0 = 2000, f1 = 300, type = 'lowpass', delay = 0, b = 's') {
    if (!ac || muted || live > 40) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus(b)); s.start(t); s.stop(t + dur);
    live++; s.onended = () => { live--; };
  }
  // a held note that breathes with the kick: dips on t and on every beat (see audio_pump.js)
  function pumpTone(f, dur, type, vol, delay, beat, depth) {
    if (!ac || muted || live > 40) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    const pts = pumpEnv(vol, dur, beat, depth); g.gain.setValueAtTime(pts[0][1], t + pts[0][0]);
    for (let i = 1; i < pts.length; i++) g.gain.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
    o.connect(g); g.connect(bus('m')); o.start(t); o.stop(t + dur + 0.02);
    live++; o.onended = () => { live--; };
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

  const card0f = n => (n >= 2 ? 233 : 185);
  const sfx = {
    shoot: () => gate('shoot', 70) && tone(520 + Math.random() * 60, 0.07, 'square', 0.04, -200),
    // hit: the timbre follows the weapon that landed it (e.src), a crit adds a bright ping
    hit: e => {
      const src = (e && e.src) || 'capsule', R = Math.random();
      if (!gate('hit' + src, src === 'capsule' ? 35 : 55) || !gate('hit', 18)) return;
      switch (src) {
        case 'swab': tone(150, 0.09, 'sine', 0.11, -60); noise(0.05, 0.05, 900, 200); break;
        case 'daggers': tone(1500 + R * 250, 0.04, 'sine', 0.05, 500); break;
        case 'tower': tone(100, 0.18, 'sawtooth', 0.07, -25); tone(200, 0.14, 'triangle', 0.04, -40); break;
        case 'dragon': tone(720 + R * 80, 0.07, 'sine', 0.05, 220); noise(0.04, 0.025, 6000, 3000, 'highpass'); break;
        case 'needles': tone(2100 + R * 200, 0.03, 'square', 0.03, -900); break;
        case 'stick': tone(82, 0.13, 'sine', 0.16, -40); noise(0.04, 0.06, 1200, 300); break;
        case 'bubble': tone(380 + R * 60, 0.09, 'sine', 0.07, 520); break;
        case 'satellite': tone(1240, 0.12, 'sine', 0.04); tone(1860, 0.1, 'sine', 0.025, 0, 0.03); break;
        case 'maw': noise(0.08, 0.15, 1800, 300); tone(110, 0.1, 'square', 0.08, -50); break;
        case 'encore': tone(300, 0.14, 'sawtooth', 0.05, 700); break;
        default: tone(240 + R * 80, 0.05, 'triangle', 0.07, -90);
      }
      if (e && e.crit) tone(1568 + R * 120, 0.06, 'triangle', 0.05, 0, 0.01);
    },
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
    coin: () => { if (!gate('coin', 45)) return; const j = (chain % 4) * 30; tone(1319 + j, 0.07, 'square', 0.055); tone(1976 + j, 0.16, 'triangle', 0.1, 0, 0.05); tone(3951, 0.1, 'sine', 0.025, 0, 0.06); },
    hurt: () => { noise(0.3, 0.28, 900, 100); tone(140, 0.3, 'sawtooth', 0.18, -80); duck(0.5, 0.3); },
    block: () => tone(900, 0.1, 'triangle', 0.09, -300),
    power: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, 0, i * 0.06)); tone(1568, 0.3, 'sine', 0.04, 0, 0.18); },
    levelup: () => { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.18, 'square', 0.1, 0, i * 0.07)); tone(1760, 0.35, 'sine', 0.05, 0, 0.28); duck(0.35, 0.4); },
    upgrade: () => { tone(700, 0.12, 'triangle', 0.09, 300); tone(1400, 0.2, 'sine', 0.04, 0, 0.08); },
    spit: () => gate('spit', 60) && tone(200, 0.15, 'sawtooth', 0.05, 160),
    roar: () => { tone(70, 0.7, 'sawtooth', 0.2, -25); noise(0.6, 0.16, 600, 80); duck(0.5, 0.6); },
    clear: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.24, 'triangle', 0.1, 0, i * 0.09)); [1047, 1319, 1568].forEach(f => tone(f, 0.6, 'sine', 0.05, 0, 0.45)); duck(0.7, 1.2); },
    stage: e => { if (e && e.boss) sfx.bossintro(); else { sfx.riser(); tone(330, 0.12, 'square', 0.07, 80, 0.5); tone(494, 0.14, 'triangle', 0.05, 0, 0.6); } },
    // stage start: a short rising sweep into the first notes
    riser: () => { if (!gate('riser', 400)) return; noise(0.5, 0.05, 500, 7000, 'bandpass'); tone(220, 0.5, 'triangle', 0.04, 440); },
    swarm: () => tone(180, 0.25, 'square', 0.06, 120),
    revive: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.22, 'sine', 0.11, 0, i * 0.08)); tone(1568, 0.5, 'sine', 0.04, 0, 0.3); duck(0.5, 0.6); },
    dead: () => { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.12, -30, i * 0.18)); noise(0.8, 0.18, 800, 60); duck(0.9, 1.5); },
    click: () => { if (now() - uiT > 90) tone(640, 0.04, 'triangle', 0.06, -120); },
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
    // loot count-up: a tiny rising pentatonic tick (e.n = 0..1 progress), and a big flash chord for a legendary find
    counttick: e => { if (!gate('counttick', 55)) return; const k = Math.max(0, Math.min(1, (e && e.n) || 0)); tone(pentHz(Math.round(k * 9), 79), 0.05, 'triangle', 0.045); },
    legend: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 'triangle', 0.07, 0, i * 0.05)); tone(2093, 0.9, 'sine', 0.05, 0, 0.3); noise(0.6, 0.05, 4000, 9000, 'bandpass', 0.05); duck(0.5, 0.8); },

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
    groovehit: e => { if (!gate('groovehit', 200)) return; const k = Math.min(4, ((e && e.n) || 5) / 5 | 0); tone(pentHz(k + 2, 72), 0.14, 'triangle', 0.07); tone(pentHz(k + 4, 72), 0.2, 'sine', 0.05, 0, 0.06);
      // the tier is also countable by ear: tier 2 and up add one more pulse each (a rising run), tier 4 ends in a bright chord
      for (let i = 1; i < k; i++) tone(pentHz(k + 2 + i, 72), 0.1, 'triangle', 0.06, 0, 0.1 + i * 0.07);
      if (k >= 4) for (const d of [0, 2, 4]) tone(pentHz(9 + d, 72), 0.34, 'sine', 0.05, 0, 0.36); },
    // groove fell apart: a short falling two-note sigh (only after a good streak), so it is audible that the bonus is gone
    groovelost: () => { if (!gate('groovelost', 400)) return; tone(pentHz(6, 72), 0.12, 'triangle', 0.05, -40); tone(pentHz(3, 72), 0.2, 'sine', 0.05, -60, 0.08); },
    // a long kill streak (5+) stops: a small sad trombone, three sagging notes and a soft deflating hiss
    sigh: () => { if (!gate('sigh', 900)) return; [[330, 0], [311, 0.2], [294, 0.4]].forEach(([f, d], i) => tone(f, i < 2 ? 0.2 : 0.55, 'sawtooth', 0.035, i < 2 ? -25 : -180, d)); tone(147, 0.9, 'triangle', 0.03, -120, 0.4); noise(0.5, 0.025, 1800, 300, 'lowpass', 0.45); },
    // perfect clear (three stars): a bright fanfare that rides on top of the normal clear jingle
    perfect: () => {
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'triangle', 0.07, 0, 0.5 + i * 0.07));
      [1047, 1319, 1568, 2093].forEach(f => tone(f, 0.9, 'sine', 0.045, 0, 0.84));
      tone(3136, 0.5, 'sine', 0.02, 0, 0.9); noise(0.7, 0.04, 5000, 11000, 'bandpass', 0.8); duck(0.75, 1.7);
    },
    // boss phase change (e.n = 1 or 2): a low hit, a falling tritone and a rising siren, harder the second time
    bossphase: e => {
      const n = e && e.n >= 2 ? 2 : 1;
      tone(55, 0.7, 'sawtooth', 0.12 + n * 0.015, -18); tone(card0f(n), 0.5, 'square', 0.045, -70, 0.05); noise(0.6, 0.07, 300, 2500, 'bandpass'); tone(300, 0.7, 'sawtooth', 0.025, 500 * n, 0.1);
      if (n === 2) { tone(card0f(n) * 0.707, 0.5, 'square', 0.045, -50, 0.3); noise(0.5, 0.08, 2500, 90, 'lowpass', 0.3); }
      duck(0.55, 0.8);
    },
    // snake reached the line: sharp alarm
    leak: () => { if (!gate('leak', 250)) return; tone(220, 0.25, 'sawtooth', 0.15, -110); tone(165, 0.3, 'square', 0.08, -60, 0.05); noise(0.3, 0.15, 1200, 100); duck(0.5, 0.4); },
    // on-beat shot: a crisp tick, climbing a pentatonic ladder while the player keeps hitting every beat
    beatshot: () => {
      const spb = 60 / (beatNow || 120), n = now();
      if (n - lastBeatShot < spb * 550) return;   // one tick per beat
      bstreak = n - lastBeatShot < spb * 1600 ? bstreak + 1 : 1; lastBeatShot = n;
      const f = pentHz(Math.min(9, bstreak), 84);
      tone(f, 0.05, 'triangle', 0.05, 0); noise(0.02, 0.03, 8000, 4000, 'highpass');
      if (bstreak > 0 && bstreak % 8 === 0) { tone(f * 2, 0.22, 'sine', 0.05, 0, 0.03); tone(f * 3, 0.3, 'sine', 0.025, 0, 0.06); }
      if (bstreak > 0 && bstreak % 10 === 0) sfx.streakburst({ n: bstreak });   // milestone: 10, 20, 30 ... (the HUD chip bursts on the same counts)
    },
    // streak milestone (10 / 20 / 30 on-beat shots in a row): a rising pentatonic run into a bright chord, a glitter sweep
    // and, from 20, a low thump under it. Tier 1..3 gets bigger each time, the loudest stays well under the clear jingle.
    streakburst: e => {
      const k = Math.max(1, Math.min(3, Math.round(((e && e.n) || 10) / 10)));
      for (let i = 0; i < 3 + k; i++) tone(pentHz(4 + i, 72), 0.12, 'triangle', 0.06, 0, 0.03 + i * 0.045);
      const at = 0.05 + (3 + k) * 0.045;
      for (const d of k >= 3 ? [0, 2, 4, 7] : [0, 2, 4]) tone(pentHz(9 + d, 72), 0.4 + 0.1 * k, 'sine', 0.045, 0, at);
      noise(0.35 + 0.1 * k, 0.04, 3000, 11000, 'bandpass', 0.02);
      if (k >= 2) { tone(110, 0.3, 'sine', 0.14, -40); noise(0.08, 0.06, 900, 200); }
      duck(0.25 + 0.08 * k, 0.4);
    },
    // Encore beam fires / becomes ready
    encore: () => { noise(0.9, 0.12, 400, 6000, 'bandpass'); tone(110, 0.9, 'sawtooth', 0.12, 440); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.06, 0, 0.1 + i * 0.05)); duck(0.55, 0.9); },
    encoreready: () => { [784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'sine', 0.07, 0, i * 0.07)); tone(1568, 0.5, 'triangle', 0.04, 0, 0.22); },
    // gold cell popped: coin shower; gold cell faded away: a soft falling blip
    goldpop: () => { if (!gate('goldpop', 80)) return; for (let i = 0; i < 5; i++) tone(1568 + i * 220 + (i % 2) * 90, 0.09, 'square', 0.03, 0, i * 0.04); tone(2093, 0.4, 'sine', 0.05, 0, 0.18); },
    goldfade: () => gate('goldfade', 200) && tone(880, 0.25, 'sine', 0.04, -420),
    // a cell died right at the line: tight rising whoosh
    clutch: () => { if (!gate('clutch', 300)) return; noise(0.25, 0.08, 600, 5000, 'bandpass'); tone(330, 0.2, 'triangle', 0.07, 660); },
    // run checkpoint chest: two-note banner
    checkpoint: () => { tone(523, 0.12, 'triangle', 0.08); tone(784, 0.3, 'triangle', 0.08, 0, 0.1); tone(1047, 0.35, 'sine', 0.04, 0, 0.1); },
    // result screen: numbers counting up (e.f 0..1 climbs the pitch) and the little ding when a row lands
    count: e => { if (!gate('count', 48)) return; const f = Math.max(0, Math.min(1, (e && e.f) || 0)); tone(660 + f * 660, 0.03, 'square', 0.025); },
    countend: () => { tone(1568, 0.06, 'triangle', 0.05); tone(2093, 0.12, 'sine', 0.04, 0, 0.04); },
    // soft UI set
    ready: () => { tone(1320, 0.07, 'sine', 0.05); tone(1760, 0.09, 'sine', 0.045, 0, 0.05); },
    // beat streak milestone (10 / 20 / 30): a rising arpeggio that climbs a step higher each time
    streakmile: e => { const k = Math.max(0, Math.min(2, (((e && e.n) || 10) / 10 | 0) - 1)), r = [1, 1.26, 1.5][k]; [523, 659, 784, 1047].forEach((f, i) => tone(f * r, 0.11, 'triangle', 0.06, 0, i * 0.055)); tone(1568 * r, 0.4, 'sine', 0.035, 0, 0.2); },
    tap: () => { uiT = now(); tone(760, 0.035, 'sine', 0.06, -150); },
    tab: () => { uiT = now(); tone(520, 0.05, 'triangle', 0.05); tone(780, 0.06, 'sine', 0.04, 0, 0.03); },
    back: () => { uiT = now(); tone(440, 0.07, 'triangle', 0.06, -150); },
    toggle: () => { uiT = now(); tone(600, 0.05, 'triangle', 0.06); tone(900, 0.07, 'sine', 0.05, 0, 0.045); },
    buy: () => { uiT = now(); tone(1319, 0.06, 'square', 0.04); tone(1760, 0.12, 'triangle', 0.06, 0, 0.05); tone(2349, 0.12, 'sine', 0.03, 0, 0.1); },
    // a sheet (pause, settings, a panel) slides in or out: a soft airy sweep under the tap, rising to open and falling to close
    open: () => { uiT = now(); noise(0.14, 0.03, 700, 3600, 'bandpass', 0.02); tone(520, 0.08, 'sine', 0.035, 260, 0.03); },
    close: () => { uiT = now(); noise(0.12, 0.028, 3200, 600, 'bandpass', 0.02); tone(520, 0.08, 'sine', 0.03, -230, 0.02); },
    // slider drag: a small tick whose pitch follows the value (e: { f: 0..1 }), so the volume can be judged by ear
    slide: e => { if (!gate('slide', 55)) return; const f = Math.max(0, Math.min(1, (e && e.f) || 0)); tone(480 + 520 * f, 0.03, 'sine', 0.05, -60); },
    deny: () => { uiT = now(); tone(200, 0.09, 'square', 0.06, -30); tone(160, 0.12, 'square', 0.06, -30, 0.08); },
  };
  sfx.card0 = () => sfx.card({ rarity: 0 }); sfx.card1 = () => sfx.card({ rarity: 1 }); sfx.card2 = () => sfx.card({ rarity: 2 });
  sfx.card3 = () => sfx.card({ rarity: 3 }); sfx.card4 = () => sfx.card({ rarity: 4 }); sfx.card5 = () => sfx.card({ rarity: 5 });
  // revive countdown: e.n is 3, 2, 1: the thump gets louder and a high tick joins in
  sfx.heartbeat = e => { const k = 1 + (3 - Math.max(1, Math.min(3, (e && e.n) || 3))) * 0.18; tone(62, 0.13, 'sine', Math.min(0.5, 0.3 * k), -18); tone(52, 0.16, 'sine', Math.min(0.4, 0.24 * k), -14, 0.17); if (e && e.n === 1) tone(1320, 0.05, 'square', 0.03, 0, 0.17); };
  sfx.star1 = () => sfx.star({ n: 1 }); sfx.star2 = () => sfx.star({ n: 2 }); sfx.star3 = () => sfx.star({ n: 3 });

  // ---------------------------------------------------------------- music
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], phryg: [0, 1, 3, 5, 7, 8, 10] };
  const ROOTS = [0, 2, 4, 7, 9, 5, 10, 3, 8, 6];   // C D E G A F Bb Eb Ab F#: one key per 5 stages
  const PROG = [[0, 5, 3, 4], [5, 3, 0, 4], [3, 4, 2, 5], [0, 4, 5, 3]];   // 4 bars per section, sections cycle
  const BPROG = [[0, 0, 1, 0], [0, 5, 1, 4], [0, 0, 1, 6], [0, 1, 0, 4]];
  const note = (scale, deg, rootMidi) => rootMidi + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  // one groove flavour per snake species (index = SKINS order). sw: swing on odd 16ths (fraction of a step), arp/lead/bass: waveforms,
  // hats: 0 offbeat, 1 straight eighths, 2 none, 3 open offbeats, kx: extra kick steps, ad: arp step divisor, ao: arp octave, minor: force the minor scale
  const VARS = [
    { sw: 0, arp: 'square', lead: 'triangle', bass: 'triangle', hats: 0, kx: [], ad: 1, ao: 0, pad: 'sine' },
    { sw: 0.2, arp: 'sawtooth', lead: 'square', bass: 'triangle', hats: 0, kx: [7], ad: 1, ao: 0, pad: 'sine' },
    { sw: 0, arp: 'triangle', lead: 'square', bass: 'triangle', hats: 1, kx: [], ad: 1, ao: 0, pad: 'triangle' },
    { sw: 0, arp: 'square', lead: 'sawtooth', bass: 'sawtooth', hats: 0, kx: [10, 14], ad: 1, ao: -12, pad: 'sine' },
    { sw: 0.1, arp: 'sine', lead: 'sine', bass: 'sine', hats: 2, kx: [], ad: 2, ao: 0, pad: 'triangle' },
    { sw: 0, arp: 'square', lead: 'triangle', bass: 'triangle', hats: 3, kx: [], ad: 1, ao: 0, pad: 'sine' },
    { sw: 0.32, arp: 'square', lead: 'sawtooth', bass: 'triangle', hats: 1, kx: [3], ad: 1, ao: 12, pad: 'sine' },
    { sw: 0, arp: 'sawtooth', lead: 'sawtooth', bass: 'sawtooth', hats: 2, kx: [6, 10], ad: 1, ao: -12, pad: 'sawtooth' },
    { sw: 0.05, arp: 'sine', lead: 'sine', bass: 'sine', hats: 3, kx: [], ad: 1, ao: 12, pad: 'triangle' },
    { sw: 0.15, arp: 'triangle', lead: 'triangle', bass: 'sine', hats: 2, kx: [11], ad: 2, ao: 0, pad: 'sine', minor: true },
  ];
  const varOf = skin => VARS[Math.max(0, SKINS.indexOf(skin)) % VARS.length];
  const LEAD = [0, 2, 4, 2, 1, 4, 2, 0], LEADB = [0, 1, 0, 3, 0, 1, 4, 3];
  function kick(t, v = 0.3) { tone(150, 0.16, 'sine', v, -110, t, 'm'); noise(0.02, 0.05, 4000, 800, 'lowpass', t, 'm'); }
  function snare(t, v = 0.1) { noise(0.13, v, 3000, 1200, 'bandpass', t, 'm'); tone(190, 0.09, 'triangle', v * 0.7, -70, t, 'm'); }
  function hat(t, v = 0.03, open) { noise(open ? 0.14 : 0.03, v, 9000, 6000, 'highpass', t, 'm'); }
  let beatAt = 0, beatBpm = 0;
  // (re)start the scheduler for the current wish: full music, or only the metronome when music is off but the tick is on
  function restart() {
    musicOn = wantMusic && musicAllowed; tickOn = wantMusic && !musicAllowed && beatTick;
    clearInterval(timer);
    if ((musicOn || tickOn) && ensure()) { step = 0; fresh = true; nextT = ac.currentTime + 0.05; timer = setInterval(pump, 80); }
    else { musicOn = tickOn = false; }
  }
  function pump() {
    if (!(musicOn || tickOn) || !ac) return;
    const m = mixS, boss = m.boss, tier = Math.floor(Math.max(0, m.stage - 1) / 5) % ROOTS.length;
    // groove meter and snake closeness raise the layers
    const lvl = Math.min(1, m.groove * 0.75 + m.danger * 0.45 + intensity * 0.2);
    const bpm = simBpm(m.stage);   // the sim beat clock tempo, so on-beat shots line up with the kick
    const sp = 60 / bpm / 4;
    while (nextT < ac.currentTime + 0.25) {
      const s = step % 16, bar = (step >> 4) % 4, sec = (step >> 6), t = Math.max(0, nextT - ac.currentTime);
      if (s % 4 === 0) { beatAt = nextT; beatBpm = bpm; beatNow = bpm; }   // for the screen edge pulse (see beat())
      if (!muted && tickOn) { if (s % 4 === 0) tone(s === 0 && bar === 0 ? 1319 : 988, 0.05, 'triangle', s === 0 && bar === 0 ? 0.2 : 0.15, 0, t, 'm'); }   // music off, beat tick on: the metronome alone
      else if (!muted) {
        const V = varOf(m.skin), bp = boss ? m.bphase : 0, ts = (s & 1) ? t + V.sw * sp : t;
        const sc = boss ? SCALES.phryg : (tier % 3 === 2 || V.minor ? SCALES.minor : SCALES.major);
        const root = 36 + ROOTS[tier] + (boss ? 5 : 0);
        const prog = (boss ? BPROG : PROG)[sec % 4], deg = prog[bar];
        const bassM = note(sc, deg, root), c0 = note(sc, deg, root + 24), c1 = note(sc, deg + 2, root + 24), c2 = note(sc, deg + 4, root + 24);
        // drums
        if (s % 4 === 0) kick(t, boss ? 0.32 : 0.26 + lvl * 0.04);
        else if (boss && (s === 6 || s === 14)) kick(t, 0.2);
        else if (lvl > 0.5 && s === 10) kick(t, 0.16);
        else if (!boss && lvl > 0.35 && V.kx.includes(s)) kick(t, 0.13);
        else if (bp >= 1 && (s === 10 || (bp >= 2 && s === 3))) kick(t, 0.17);
        if ((s === 4 || s === 12) && (lvl > 0.2 || boss)) snare(t, boss ? 0.13 : 0.09);
        if (lvl > 0.1 || boss) {
          const hm = boss ? 0 : V.hats;
          if (hm === 1) { if (s % 2 === 0) hat(t, s % 4 === 0 ? 0.02 : 0.03, s === 14); }
          else if (hm === 3) { if (s % 4 === 2) hat(t, 0.04, true); else if (lvl > 0.65 && s % 4 === 0) hat(t, 0.015); }
          else if (hm !== 2) { if (s % 4 === 2) hat(t, 0.035, s === 14); else if ((lvl > 0.65 || bp >= 1) && s % 2 === 1) hat(ts, 0.018); }
        }
        // bass: eighths, octave jump to keep it moving
        if (s % 2 === 0) tone(hz(bassM + (s % 8 === 6 ? 12 : 0)), sp * 1.9, boss ? 'sawtooth' : V.bass, boss ? 0.1 : V.bass === 'sawtooth' ? 0.1 : 0.14, 0, t, 'm');
        // pad on the bar line
        if (s === 0 && (lvl > 0.15 || boss)) { [c0, c1, c2].forEach(n => pumpTone(hz(n - 12), sp * 15, boss || bp >= 2 ? 'sawtooth' : V.pad, boss ? 0.02 + bp * 0.004 : 0.03, t, sp * 4, pumpDepth(lvl, boss))); }
        // arp over the chord
        if (lvl > 0.3 || boss) { const q = [c0, c1, c2, c1][(s >> (boss ? 0 : 1)) % 4]; if (s % (boss ? 2 : 2 * V.ad) === 0) tone(hz(q + (sec % 2 && s >= 8 ? 12 : 0) + (boss ? (bp >= 1 && s % 4 === 2 ? 12 : 0) : V.ao)), sp * 1.6, boss ? 'square' : V.arp, boss ? 0.026 : 0.022, 0, ts, 'm'); }
        // lead melody from high groove
        if ((lvl > 0.62 || (boss && (lvl > 0.4 || bp >= 1))) && (s % 4 === 0 || s === 6 || s === 11 || s === 14)) {
          const li = (bar * 4 + (s >> 2) + (s === 14 ? 1 : 0)) % 8, ld = deg + (boss ? LEADB : LEAD)[li];
          tone(hz(note(sc, ld, root + 36) + (bp >= 2 ? 12 : 0)), sp * 2.6, boss ? 'sawtooth' : V.lead, boss ? 0.03 : V.lead === 'sawtooth' || V.lead === 'square' ? 0.032 : 0.05, 0, t, 'm');
        }
        // species motif: 4 notes spread over the second and fourth bar
        if ((bar & 1) === 1 && s % 4 === 0 && !boss && lvl > 0.05) tone(hz(note(sc, motifOf(m.stage)[s >> 2], root + 36)), sp * 3, 'sine', 0.032, 0, t, 'm');
        // boss only: sub drone, off-beat sub pulses, a rising siren and a snare roll that lead into the next section
        if (boss) {
          if (s === 0) pumpTone(hz(bassM - 12), sp * 15.5, 'sine', 0.1, t, sp * 4, pumpDepth(lvl, true));
          if (s % 4 === 2) tone(hz(bassM - 12), sp * 1.6, 'sine', 0.12, -3, t, 'm');
          if (bar === 3 && s === 8) tone(330, sp * 8, 'sawtooth', 0.018, 520, t, 'm');
          if (bar === 3 && s >= 12) snare(t, 0.05 + (s - 12) * 0.03);
        }
        // accessibility: an optional woodblock click on every beat (higher on the bar line), so the rhythm can be felt without the mix
        if (beatTick && s % 4 === 0) tone(s === 0 && bar === 0 ? 1319 : 988, 0.05, 'triangle', s === 0 && bar === 0 ? 0.2 : 0.15, 0, t, 'm');
        // danger: a ticking clock when the snake is close to the line
        if (m.danger > 0.55 && s % 4 === 0) tone(1760, 0.03, 'square', 0.025 + m.danger * 0.02, 0, t, 'm');
        // section ends: riser into a crash
        if (bar === 3 && s === 12 && lvl > 0.35) noise(sp * 4, 0.06, 800, 9000, 'bandpass', t, 'm');
        if (bar === 0 && s === 0 && step > 0 && lvl > 0.35) noise(0.5, 0.05, 7000, 3000, 'highpass', t, 'm');
      }
      nextT += sp; step++;
    }
  }
  // one short 4 note phrase per snake species (scale degrees), played softly as a bell over the groove
  const MOTIFS = [[0, 2, 4, 2], [0, 4, 2, 5], [4, 2, 0, 2], [0, 1, 4, 2], [2, 4, 5, 4], [0, 2, 1, 4], [4, 5, 4, 2], [0, 3, 2, 4], [5, 4, 2, 0], [2, 0, 2, 4]];
  const motifOf = stage => MOTIFS[(Math.max(1, stage | 0) - 1) % MOTIFS.length];
  return {
    unlock() { const a = ensure(); if (a && a.state === 'suspended') { try { a.resume(); } catch (e) { /* ignore */ } } },
    play(name, e) { if (ac && sfx[name]) { try { sfx[name](e); } catch (err) { /* never break the game over a sound */ } } },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5 * vol; },
    setVolume(v) { vol = Math.max(0, Math.min(1, +v)); if (!(vol >= 0)) vol = 1; if (master && !muted) master.gain.value = 0.5 * vol; },
    get volume() { return vol; },
    motif: motifOf,
    get muted() { return muted; },
    music(on) {
      wantMusic = !!on; restart();
    },
    // the beat tick is a metronome of its own: with the music switched off it still clicks on every beat
    setBeatTick(b) { beatTick = !!b; if ((wantMusic && !musicAllowed && beatTick) !== tickOn) restart(); },
    setMusicAllowed(b) { musicAllowed = b; if (!b || tickOn) restart(); },
    get tickOnly() { return tickOn; },
    get musicAllowed() { return musicAllowed; },
    intensity(v) { intensity = v; },
    // groove 0..1, danger 0..1 (how close the face is to the line), stage number, boss flag
    mix(o) { if (o) mixS = { stage: o.stage || 1, boss: !!o.boss, groove: Math.max(0, Math.min(1, o.groove || 0)), danger: Math.max(0, Math.min(1, o.danger || 0)), skin: o.skin || skinFor(o.stage || 1), bphase: Math.max(0, Math.min(2, o.bphase | 0)) }; },
    // close the music behind a lowpass (cards, pause) and open it again; call every frame, only changes act
    muffle(on) {
      on = !!on; if (on === muffled) return; muffled = on;
      if (!ac || !mlp) return;
      const t = ac.currentTime;
      try { mlp.frequency.cancelScheduledValues(t); mlp.frequency.setTargetAtTime(on ? MUF_SHUT : MUF_OPEN, t, on ? 0.05 : 0.14); musBus.gain.setTargetAtTime(on ? MUS_MUFFLED : MUS_GAIN, t, 0.08); } catch (e) { /* ignore */ }
    },
    get muffled() { return muffled; },
    duck,
    get beatStreak() { return bstreak && now() - lastBeatShot < 60 / (beatNow || 120) * 1600 ? bstreak : 0; },
    // align the music grid to the sim beat clock: simPhase 0..1 is the sim's beat phase now (see beatPhase in sim.js)
    sync(simPhase) {
      if (!(musicOn || tickOn) || !ac || !beatNow || !(simPhase >= 0)) return;
      const spb = 60 / beatNow, sp = spb / 4, Q = nextT + ((4 - (step & 3)) & 3) * sp;
      let ap = ((ac.currentTime - (ac.outputLatency || ac.baseLatency || 0) - Q) / spb) % 1; if (ap < 0) ap += 1;
      let e = simPhase - ap; e -= Math.round(e);   // -0.5..0.5 of a beat; positive: the sim is ahead, so the music must come sooner
      const sec = e * spb;
      if (fresh && step < 5) { nextT += sec < 0 ? -sec : spb - sec; fresh = false; return; }   // first alignment after the music starts
      fresh = false;
      if (Math.abs(sec) > 0.1) { if (gate('resync', 1500)) nextT += sec < 0 ? -sec : spb - sec; return; }
      if (Math.abs(sec) > 0.012) nextT -= Math.max(-0.0025, Math.min(0.0025, sec));
    },
    // where we are in the beat: { bpm, phase 0..1 since the last kick }, or null when the music is not playing
    beat() {
      if (!(musicOn || tickOn) || !ac || !beatBpm) return null;
      const spb = 60 / beatBpm; let ph = ((ac.currentTime - beatAt) / spb) % 1; if (ph < 0) ph += 1;
      return { bpm: beatBpm, phase: ph };
    },
    names: () => Object.keys(sfx),
  };
}
