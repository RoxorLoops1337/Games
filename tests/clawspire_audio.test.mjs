// Clawspire AUDIO suite. Part 1 runs the module the way Node sees it (no
// AudioContext at all): everything must no-op. Part 2 installs a fake
// AudioContext that counts node creation and drives the music scheduler by
// hand through AUDIO._tick().
import { boot, harness } from './clawspire_lib.mjs';

const T = harness('clawspire audio');

const NAMES = ['clawMove', 'clawDrop', 'clawTouch', 'clawClose', 'clawLift', 'clawRelease', 'itemLand',
  'itemSlip', 'chute', 'jackpot', 'hit', 'hitBig', 'block', 'heal', 'poison', 'burn', 'freeze', 'shake',
  'enemyDie', 'playerHurt', 'win', 'lose', 'click', 'buy', 'reveal', 'brush', 'step', 'coin', 'upgrade',
  'turn', 'boss',
  // the juice pass
  'proc', 'combo', 'crit', 'shatter', 'tick', 'cardFlip', 'relic', 'footstep', 'bloom', 'heartbeat', 'whoosh', 'stamp', 'victory',
  // the bestiary (round 4): the new enemies' tricks
  'giggle', 'gooSplat', 'magLift', 'dig', 'boo', 'dozer', 'rivalClaw'];
const MODES = ['off', 'title', 'map', 'fight', 'elite', 'boss', 'win'];

/* ---------------------------------------------------------------- part 1: headless */
T.test('loads headless with one namespace', () => {
  const api = boot({ only: ['util', 'audio'] });
  T.ok(api.AUDIO && typeof api.AUDIO === 'object', 'AUDIO namespace exists');
  T.ok(api.U && typeof api.U.rng === 'function', 'U loaded alongside');
  T.eq(api.AUDIO.ready, false, 'not ready before init');
  T.eq(Object.keys(api._store).length, 0, 'loading does not touch localStorage');
});

T.test('every sfx name is known and no-ops before init', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  for (const n of NAMES) T.ok(AUDIO.names.includes(n), `sfx name listed: ${n}`);
  for (const n of NAMES) {
    let r;
    try { r = AUDIO.sfx(n, { mass: 2, amt: 12, vol: 1 }); } catch (e) { T.ok(false, `sfx ${n} threw before init: ${e}`); continue; }
    T.eq(r, false, `sfx ${n} returns false before init`);
  }
  T.eq(AUDIO.sfx('nope'), false, 'unknown sfx is a no-op');
  AUDIO.sfx('hit'); AUDIO.sfx('itemLand'); // no opts at all
});

T.test('init without an AudioContext is safe and repeatable', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  T.eq(AUDIO.init(), false, 'init returns false with no AudioContext');
  T.eq(AUDIO.init(), false, 'second init is also safe');
  T.eq(AUDIO.ready, false, 'still not ready');
  T.eq(AUDIO._tick(), 0, 'tick is a no-op');
  AUDIO.duck(1);
  for (const n of NAMES) AUDIO.sfx(n);
});

T.test('every music mode is accepted before init', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  for (const m of MODES) T.ok(AUDIO.modes.includes(m), `mode listed: ${m}`);
  for (const m of MODES) {
    try { AUDIO.music(m); T.eq(AUDIO.mode, m, `mode remembered: ${m}`); } catch (e) { T.ok(false, `music ${m} threw: ${e}`); }
  }
  AUDIO.music('disco');
  T.eq(AUDIO.mode, 'off', 'unknown mode falls back to off');
});

T.test('songs are deterministic and distinct per mode', () => {
  const a = boot({ only: ['util', 'audio'] }).AUDIO;
  const b = boot({ only: ['util', 'audio'] }).AUDIO;
  const sig = (s) => JSON.stringify(s.steps);
  const seen = new Set();
  for (const m of MODES) {
    if (m === 'off') { T.eq(a._song(m), null, 'off has no song'); continue; }
    const s1 = a._song(m), s2 = b._song(m);
    T.ok(s1 && s1.len === s1.steps.length && s1.len > 0, `${m} song has steps`);
    T.eq(sig(s1), sig(s2), `${m} song identical across boots`);
    seen.add(sig(s1));
    const voices = new Set(s1.steps.flat().map((e) => e.v));
    for (const v of ['bass', 'lead', 'hat']) T.ok(voices.has(v), `${m} song has ${v}`);
    T.ok(s1.steps.flat().every((e) => e.v === 'hat' || e.v === 'kick' || e.v === 'snare' || (e.ns || [e.n]).every(Number.isFinite)),
      `${m} notes are finite`);
  }
  T.eq(seen.size, MODES.length - 1, 'each mode has its own tune');
  const tempos = MODES.filter((m) => m !== 'off').map((m) => a._song(m).bpm);
  T.ok(a._song('fight').bpm > a._song('map').bpm && a._song('map').bpm > a._song('title').bpm, 'fight > map > title tempo');
  T.ok(tempos.every((x) => x >= 60 && x <= 180), 'tempos are sane');
  const boss = a._song('boss');
  const bassIn = (b0, b1) => boss.steps.slice(b0 * 16, b1 * 16).flat().filter((e) => e.v === 'bass').length;
  T.ok(bassIn(8, 16) < bassIn(0, 8) / 2, 'boss second half is a half-time drop (sparser bass)');
  T.ok(a._song('boss').steps.flat().some((e) => e.v === 'stab'), 'boss has chord stabs');
});

T.test('toggles persist to localStorage', () => {
  const api = boot({ only: ['util', 'audio'] });
  const { AUDIO } = api;
  T.eq(AUDIO.sfxOn, true, 'sfx on by default');
  T.eq(AUDIO.musicOn, true, 'music on by default');
  T.eq(AUDIO.muted, false, 'not muted by default');
  T.eq(AUDIO.toggleSfx(), false, 'toggleSfx returns new state');
  T.eq(JSON.parse(api._store.clawspire_audio).sfx, false, 'sfx off persisted');
  T.eq(JSON.parse(api._store.clawspire_audio).music, true, 'music still on in store');
  T.eq(AUDIO.toggleMusic(), false, 'toggleMusic returns new state');
  T.eq(api._store.clawspire_audio, JSON.stringify({ sfx: false, music: false }), 'store is exactly {sfx, music}');
  T.eq(AUDIO.muted, true, 'both off reads as muted');
  AUDIO.muted = false;
  T.eq(AUDIO.sfxOn && AUDIO.musicOn, true, 'muted = false turns both on');
  T.eq(JSON.parse(api._store.clawspire_audio).music, true, 'unmute persisted');

  const again = boot({ only: ['util', 'audio'], store: { clawspire_audio: JSON.stringify({ sfx: false, music: true }) } });
  T.eq(again.AUDIO.sfxOn, false, 'stored sfx off is read back');
  T.eq(again.AUDIO.musicOn, true, 'stored music on is read back');
  const junk = boot({ only: ['util', 'audio'], store: { clawspire_audio: '{not json' } });
  T.eq(junk.AUDIO.sfxOn, true, 'corrupt store falls back to defaults');
  const broken = boot({ only: ['util', 'audio'] });
  broken._window.localStorage.setItem = () => { throw new Error('quota'); };
  T.eq(broken.AUDIO.toggleSfx(), false, 'toggle survives a throwing store');
});

T.test('setVolume clamps', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  let v = AUDIO.setVolume(2, -1);
  T.eq(v.sfx, 1, 'sfx clamped to 1'); T.eq(v.music, 0, 'music clamped to 0');
  v = AUDIO.setVolume(0.25, 0.6);
  T.eq(v.sfx, 0.25, 'sfx set'); T.eq(v.music, 0.6, 'music set');
  v = AUDIO.setVolume(null, NaN);
  T.eq(v.sfx, 0.25, 'null keeps sfx'); T.eq(v.music, 0.6, 'NaN keeps music');
  T.eq(AUDIO.volume.music, 0.6, 'volume getter reflects state');
});

T.test('haptic calls vibrate or no-ops', () => {
  const api = boot({ only: ['util', 'audio'] });
  const calls = [];
  api._window.navigator.vibrate = (p) => { calls.push(p); return true; };
  T.eq(api.AUDIO.haptic('tap'), true, 'tap vibrates');
  api.AUDIO.haptic('hit'); api.AUDIO.haptic('jackpot');
  T.eq(calls[0], 10, 'tap is 10ms'); T.eq(calls[1], 30, 'hit is 30ms');
  T.ok(Array.isArray(calls[2]) && calls[2].length > 2, 'jackpot is a pattern');
  T.eq(api.AUDIO.haptic('nonsense'), false, 'unknown kind no-ops');
  delete api._window.navigator.vibrate;
  T.eq(api.AUDIO.haptic('tap'), false, 'no vibrate API no-ops');
  api._window.navigator.vibrate = () => { throw new Error('blocked'); };
  T.eq(api.AUDIO.haptic('hit'), false, 'a throwing vibrate no-ops');
});

/* ---------------------------------------------------------------- part 2: fake AudioContext */
function fakeAudio() {
  const count = { total: 0 };
  const bump = (k) => { count[k] = (count[k] || 0) + 1; count.total++; };
  const param = (v) => ({
    value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {},
  });
  const node = (extra) => Object.assign({ connect() {}, disconnect() {} }, extra);
  const ctxs = [];
  class FakeAC {
    constructor() {
      this.currentTime = 0; this.sampleRate = 8000; this.state = 'suspended'; this.resumed = 0;
      this.destination = node({});
      ctxs.push(this);
    }
    resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
    createOscillator() { bump('osc'); return node({ type: 'sine', frequency: param(440), detune: param(0), start() {}, stop() {} }); }
    createGain() { bump('gain'); return node({ gain: param(1) }); }
    createBiquadFilter() { bump('filter'); return node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }); }
    createBufferSource() { bump('src'); return node({ buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {} }); }
    createBuffer(ch, len) { bump('buffer'); const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
    createDynamicsCompressor() {
      bump('comp');
      return node({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) });
    }
  }
  return { FakeAC, count, ctxs };
}

function bootFake(store) {
  const api = boot({ only: ['util', 'audio'], store });
  const fake = fakeAudio();
  api._window.AudioContext = fake.FakeAC;
  return { api, AUDIO: api.AUDIO, fake };
}

T.test('init uses the AudioContext once and resumes it', () => {
  const { AUDIO, fake } = bootFake();
  T.eq(AUDIO.init(), true, 'init succeeds with an AudioContext');
  T.eq(fake.ctxs.length, 1, 'one context created');
  T.ok(fake.count.comp >= 1, 'master compressor created');
  T.ok(fake.ctxs[0].resumed >= 1, 'suspended context resumed');
  T.eq(AUDIO.ready, true, 'ready after init');
  fake.ctxs[0].state = 'suspended';
  T.eq(AUDIO.init(), true, 'second init ok');
  T.eq(fake.ctxs.length, 1, 'no second context');
  T.eq(fake.ctxs[0].resumed, 2, 'second init resumes again');
});

T.test('webkitAudioContext fallback', () => {
  const api = boot({ only: ['util', 'audio'] });
  const fake = fakeAudio();
  api._window.webkitAudioContext = fake.FakeAC;
  T.eq(api.AUDIO.init(), true, 'init finds webkitAudioContext');
});

T.test('every sfx creates nodes after init', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of NAMES) {
    ac.currentTime += 3;       // clear throttles and the voice cap between calls
    const before = fake.count.total;
    let r;
    try { r = AUDIO.sfx(n, { mass: 1.5, amt: 9, vol: 0.8, vel: 0.7 }); } catch (e) { T.ok(false, `sfx ${n} threw: ${e && e.stack}`); continue; }
    T.eq(r, true, `sfx ${n} played`);
    T.ok(fake.count.total - before >= 2, `sfx ${n} created nodes (${fake.count.total - before})`);
  }
  // opts extremes
  for (const o of [{ mass: 0 }, { mass: 5000 }, { amt: -5 }, { amt: 999 }, { vol: 'x' }, { pitch: 0 }, null]) {
    ac.currentTime += 3;
    try { AUDIO.sfx('itemLand', o); AUDIO.sfx('hit', o); } catch (e) { T.ok(false, `odd opts threw: ${JSON.stringify(o)}`); }
  }
});

T.test('juice sfx: combo scales with its tier, ticks and heartbeats are throttled', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  const nodes = [];
  for (const tier of [1, 2, 3]) {
    ac.currentTime += 5;
    const before = fake.count.total;
    T.eq(AUDIO.sfx('combo', { tier }), true, `combo tier ${tier} plays`);
    nodes.push(fake.count.total - before);
  }
  T.ok(nodes[0] < nodes[1] && nodes[1] < nodes[2], `bigger tiers build more voices (${nodes.join(' < ')})`);
  ac.currentTime += 5;
  T.eq(AUDIO.sfx('combo', { tier: 99 }), true, 'an out of range tier clamps');
  ac.currentTime += 5;
  T.eq(AUDIO.sfx('tick'), true, 'a counter tick plays');
  T.eq(AUDIO.sfx('tick'), false, 'a second tick in the same instant is throttled');
  ac.currentTime += 0.2;
  T.eq(AUDIO.sfx('heartbeat'), true, 'a heartbeat plays');
  ac.currentTime += 0.2;
  T.eq(AUDIO.sfx('heartbeat'), false, 'heartbeats are at least half a second apart');
  for (const n of ['proc', 'crit', 'shatter', 'cardFlip', 'relic', 'footstep', 'bloom', 'whoosh', 'stamp', 'victory']) {
    ac.currentTime += 3;
    T.eq(AUDIO.sfx(n, { pitch: 1.3, tier: 2 }), true, `${n} plays with opts`);
  }
});

T.test('loot sfx: capsule ritual, tickets, the payout tally', () => {
  const LOOT = ['capDrop', 'capCrack', 'capUpgrade', 'capBurst', 'ticket', 'tally', 'slam', 'roulette', 'double'];
  const cold = boot({ only: ['util', 'audio'] }).AUDIO;
  for (const n of LOOT) { T.ok(cold.names.includes(n), `loot sfx listed: ${n}`); T.eq(cold.sfx(n), false, `${n} no-ops before init`); }
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of LOOT) {
    ac.currentTime += 3;
    const before = fake.count.total;
    T.eq(AUDIO.sfx(n, { n: 2, tier: 1, pitch: 1.2 }), true, `${n} plays`);
    T.ok(fake.count.total - before >= 2, `${n} builds voices`);
  }
  const burst = [];
  for (const tier of [0, 3]) { ac.currentTime += 5; const b0 = fake.count.total; AUDIO.sfx('capBurst', { tier }); burst.push(fake.count.total - b0); }
  T.ok(burst[1] > burst[0], `a legendary burst is bigger than a common one (${burst.join(' < ')})`);
  ac.currentTime += 3;
  T.eq(AUDIO.sfx('ticket'), true, 'a ticket feed plays');
  T.eq(AUDIO.sfx('ticket'), false, 'ticket feeds are throttled');
});

T.test('sfx throttling, voice cap, and sfx toggle', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  ac.currentTime = 10;
  T.eq(AUDIO.sfx('clawMove'), true, 'first clawMove plays');
  T.eq(AUDIO.sfx('clawMove'), false, 'immediate repeat is throttled');
  ac.currentTime += 0.5;
  T.eq(AUDIO.sfx('clawMove'), true, 'plays again after the gap');
  let played = 0;
  for (let i = 0; i < 100; i++) { ac.currentTime += 0.036; if (AUDIO.sfx('itemLand', { mass: 1 })) played++; }
  T.eq(played, 100, 'spaced landings all play');
  played = 0;
  for (let i = 0; i < 100; i++) { ac.currentTime += 0.02; if (AUDIO.sfx('lose')) played++; }
  // MIX (round 10): the cap is per loudness tier now (lose is a big sting: 6 at once)
  T.ok(played >= 4 && played <= 12, `voice cap limits a flood of long voices (${played})`);
  ac.currentTime += 5;
  AUDIO.toggleSfx();
  const before = fake.count.total;
  T.eq(AUDIO.sfx('hit'), false, 'sfx off: nothing plays');
  T.eq(fake.count.total, before, 'sfx off: no nodes');
  AUDIO.toggleSfx();
  T.eq(AUDIO.sfx('hit'), true, 'sfx back on');
  AUDIO.duck(1.2); AUDIO.duck(0); AUDIO.setVolume(0.3, 0.3);
});

// Advances the fake clock in 25 ms slices the way the real interval would and
// returns how many music events were queued.
function run(AUDIO, ac, seconds) {
  let n = 0;
  const steps = Math.round(seconds / 0.025);
  for (let i = 0; i < steps; i++) { ac.currentTime += 0.025; n += AUDIO._tick(); }
  return n;
}

T.test('music schedules notes, crossfades, and stops', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  AUDIO.music('fight');
  const n1 = run(AUDIO, ac, 2);
  T.ok(n1 > 20, `fight schedules notes over 2s (${n1})`);
  const live = AUDIO._live();
  T.eq(live.length, 1, 'one live sequencer');
  T.eq(live[0].mode, 'fight', 'it is the fight tune');
  AUDIO.music('fight');
  T.eq(AUDIO._live().length, 1, 'same mode again does not restart');

  AUDIO.music('boss');
  const x = AUDIO._live();
  T.eq(x.length, 2, 'crossfade: old and new layers overlap');
  T.ok(x.some((q) => q.mode === 'fight' && q.fading) && x.some((q) => q.mode === 'boss' && !q.fading), 'fight fading, boss rising');
  run(AUDIO, ac, 1.5);
  T.eq(AUDIO._live().length, 1, 'faded layer dropped after ~1s');
  T.eq(AUDIO._live()[0].mode, 'boss', 'boss remains');

  AUDIO.music('off');
  run(AUDIO, ac, 1.5);
  T.eq(AUDIO._live().length, 0, 'off: no live sequencers after the fade');
  const before = fake.count.total;
  const n2 = run(AUDIO, ac, 3);
  T.eq(n2, 0, 'off: no notes scheduled');
  T.eq(fake.count.total, before, 'off: no nodes created');
});

T.test('every music mode plays with the fake context', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const m of MODES) {
    try {
      AUDIO.music(m);
      const n = run(AUDIO, ac, 2.5);
      if (m === 'off') T.eq(n, 0, 'off is silent');
      else T.ok(n > 5, `${m} schedules notes (${n})`);
    } catch (e) { T.ok(false, `music ${m} threw: ${e && e.stack}`); }
  }
});

T.test('a long stall skips ahead instead of bursting', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  AUDIO.music('map');
  run(AUDIO, ac, 1);
  ac.currentTime += 30;           // backgrounded tab: timers stopped for 30s
  const burst = AUDIO._tick();
  T.ok(burst < 40, `no 30s burst after a stall (${burst})`);
});

T.test('music requested before init starts on init; music toggle', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.music('title');
  T.eq(AUDIO._live().length, 0, 'nothing live before init');
  AUDIO.init();
  const ac = fake.ctxs[0];
  T.eq(AUDIO._live().length, 1, 'pending mode starts on init');
  T.ok(run(AUDIO, ac, 2) > 0, 'title plays');
  T.eq(AUDIO.toggleMusic(), false, 'music toggled off');
  run(AUDIO, ac, 1);
  T.eq(AUDIO._live().length, 0, 'music off stops sequencers');
  T.eq(run(AUDIO, ac, 2), 0, 'music off schedules nothing');
  AUDIO.music('fight');
  T.eq(run(AUDIO, ac, 1), 0, 'mode change while off stays silent');
  T.eq(AUDIO.mode, 'fight', 'but the mode is remembered');
  AUDIO.toggleMusic();
  T.eq(AUDIO._live()[0].mode, 'fight', 'music on resumes the remembered mode');
  T.ok(run(AUDIO, ac, 1) > 0, 'and it plays');

  const muted = bootFake({ clawspire_audio: JSON.stringify({ sfx: true, music: false }) });
  muted.AUDIO.music('fight');
  muted.AUDIO.init();
  T.eq(muted.AUDIO._live().length, 0, 'stored music off: init does not start music');
});

/* ---------------------------------------------------------------- part 3: the intro stinger */
T.test('AUDIO.intro schedules the 10 s stinger against the clock, deterministic, stoppable', () => {
  const { AUDIO, fake } = bootFake();
  T.eq(AUDIO.intro(), null, 'intro before init is null');
  AUDIO.init();
  const ac = fake.ctxs[0];
  ac.currentTime = 5;
  const before = fake.count.total;
  const h = AUDIO.intro();
  T.ok(h && typeof h.stop === 'function', 'returns a handle with stop()');
  T.near(h.t0, 5.05, 0.01, 'starts just after now by default');
  T.near(h.end, h.t0 + 10, 0.001, 'ends 10 s later');
  const made = fake.count.total - before;
  T.ok(made > 400, `builds a big graph [${made} nodes]`);
  T.ok(fake.count.osc > 150 && fake.count.src > 40, `oscillators and noise voices [${fake.count.osc} osc, ${fake.count.src} noise]`);
  h.stop(); h.stop();
  // explicit t0 and determinism: the same node counts from a fresh boot
  const b2 = bootFake(); b2.AUDIO.init();
  const c0 = b2.fake.count.total;
  const h2 = b2.AUDIO.intro(12);
  T.eq(h2.t0, 12, 'explicit t0 honoured');
  T.eq(b2.fake.count.total - c0, made, 'same schedule size on a fresh boot');
  // both channels off: nothing unless forced
  const off = bootFake({ clawspire_audio: JSON.stringify({ sfx: false, music: false }) });
  off.AUDIO.init();
  T.eq(off.AUDIO.intro(), null, 'muted profile: no stinger');
  T.ok(off.AUDIO.intro(0, { force: true }), 'forced anyway for the offline render');
});

// The harness runs tests synchronously, so the async render is awaited at top level.
await (async () => { try {
  const api = boot({ only: ['util', 'audio'] });
  const { AUDIO } = api;
  let rejected = false;
  await AUDIO.renderIntroWav(2).catch(() => { rejected = true; });
  T.eq(rejected, true, 'rejects without an OfflineAudioContext');
  const fake = fakeAudio();
  const made = [];
  class FakeOffline extends fake.FakeAC {
    constructor(ch, len, sr) { super(); this.ch = ch; this.length = len; this.sampleRate = sr; this.state = 'running'; made.push(this); }
    startRendering() {
      const ch = this.ch, len = this.length;
      const data = []; for (let c = 0; c < ch; c++) { const d = new Float32Array(len); for (let i = 0; i < len; i++) d[i] = Math.sin(i * 0.05) * 0.5; data.push(d); }
      return Promise.resolve({ numberOfChannels: ch, length: len, sampleRate: this.sampleRate, getChannelData: (c) => data[c] });
    }
  }
  api._window.OfflineAudioContext = FakeOffline;
  const buf = await AUDIO.renderIntroWav(2);
  T.ok(buf instanceof ArrayBuffer, 'resolves to an ArrayBuffer');
  T.eq(made.length, 1, 'one offline context');
  T.eq(made[0].ch, 2, 'stereo'); T.eq(made[0].sampleRate, 44100, '44.1 kHz'); T.eq(made[0].length, 88200, '2 s of samples');
  const dv = new DataView(buf);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  T.eq(tag(0), 'RIFF', 'RIFF header'); T.eq(tag(8), 'WAVE', 'WAVE tag'); T.eq(tag(12), 'fmt ', 'fmt chunk'); T.eq(tag(36), 'data', 'data chunk');
  T.eq(dv.getUint16(22, true), 2, '2 channels'); T.eq(dv.getUint32(24, true), 44100, 'sample rate'); T.eq(dv.getUint16(34, true), 16, '16 bit');
  T.eq(buf.byteLength, 44 + 88200 * 4, 'header + samples');
  T.eq(dv.getUint32(40, true), 88200 * 4, 'data size');
  T.ok(Math.abs(dv.getInt16(44 + 20 * 4, true) - Math.round(Math.sin(20 * 0.05) * 0.5 * 32767)) <= 1, 'samples encoded');
  T.eq(AUDIO.ready, false, 'the live graph is untouched (still not initialised)');
  T.ok(fake.count.osc > 150, `the schedule ran on the offline context [${fake.count.osc} osc]`);
} catch (e) { T.ok(false, 'renderIntroWav test threw :: ' + (e && e.stack || e)); } })();

T.test('cabinet materials: every material voice plays, landings scale with opts.vel, the fuse beep is throttled', () => {
  const MAT_NAMES = ['clank', 'tinkle', 'crack', 'thud', 'boing', 'squish', 'slosh', 'chime', 'fuse', 'beep', 'boom', 'groan', 'fanfare', 'ding', 'lucky'];
  const { AUDIO, fake } = bootFake();
  for (const n of MAT_NAMES) T.ok(AUDIO.names.includes(n), 'sfx name listed: ' + n);
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of MAT_NAMES) {
    ac.currentTime += 3;
    const before = fake.count.total;
    let r = false;
    try { r = AUDIO.sfx(n, { vel: 0.8, pitch: 1.2 }); } catch (e) { T.ok(false, n + ' threw ' + e); }
    T.ok(r && fake.count.total - before >= 2, 'material sfx ' + n + ' plays');
  }
  for (const o of [{ vel: -3 }, { vel: 99 }, { vel: 'x' }, null]) { ac.currentTime += 3; try { AUDIO.sfx('clank', o); AUDIO.sfx('thud', o); } catch (e) { T.ok(false, 'odd vel threw'); } }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('beep'), 'a beep plays');
  T.eq(AUDIO.sfx('beep'), false, 'a second beep right away is throttled');
});

T.test('bosses: the versus card, signatures, footfalls and finale voices play; stings are throttled', () => {
  const BOSS_NAMES = ['vsSlam', 'rumble', 'stomp', 'coinSpill', 'sizzle', 'drip', 'freezeOver', 'iceBreak', 'hijack', 'shuffle', 'alarm', 'kaboom', 'bossDown', 'stingBoss', 'stingElite'];
  const { AUDIO, fake } = bootFake();
  for (const n of BOSS_NAMES) { T.ok(AUDIO.names.includes(n), 'sfx name listed: ' + n); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of BOSS_NAMES) {
    ac.currentTime += 5;
    const before = fake.count.total;
    let r = false;
    try { r = AUDIO.sfx(n, { big: true, len: 2, pitch: 0.9 }); } catch (e) { T.ok(false, n + ' threw ' + e); }
    T.ok(r && fake.count.total - before >= 2, 'boss sfx ' + n + ' plays');
  }
  ac.currentTime += 5;
  T.ok(AUDIO.sfx('stingBoss'), 'a boss sting plays');
  T.eq(AUDIO.sfx('stingBoss'), false, 'a second sting right away is throttled');
  for (const o of [{ len: -1 }, { len: 99 }, { len: 'x' }, null]) { ac.currentTime += 5; try { AUDIO.sfx('rumble', o); } catch (e) { T.ok(false, 'odd rumble len threw'); } }
});

T.test('claw types: every claw voice plays, no-ops cold, and the spin-up is throttled', () => {
  const CLAW_NAMES = ['clawCoin', 'clawSpin', 'clawTap', 'clawCheer', 'magHum', 'magZap', 'magDrop', 'scoopSlosh', 'handSquish', 'hookFire', 'hookThunk'];
  const { AUDIO, fake } = bootFake();
  for (const n of CLAW_NAMES) { T.ok(AUDIO.names.includes(n), 'sfx name listed: ' + n); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of CLAW_NAMES) {
    ac.currentTime += 3;
    const before = fake.count.total;
    let r = false;
    try { r = AUDIO.sfx(n, { pitch: 1.1 }); } catch (e) { T.ok(false, n + ' threw ' + e); }
    T.ok(r && fake.count.total - before >= 2, 'claw sfx ' + n + ' plays');
  }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('clawSpin'), 'a spin-up plays');
  T.eq(AUDIO.sfx('clawSpin'), false, 'a second one right away is throttled');
});

T.test('arcade: every arcade voice plays, no-ops cold, and the clicker is throttled', () => {
  const ARC_NAMES = ['plinkDrop', 'peg', 'wheelSpin', 'wheelTick', 'lever', 'reelSpin', 'reelStop', 'drumroll', 'arcWin', 'arcJackpot', 'arcLose', 'arcIn', 'diceRoll', 'diceLand', 'roamWake', 'roamStep', 'ambush'];
  const { AUDIO, fake } = bootFake();
  for (const n of ARC_NAMES) { T.ok(AUDIO.names.includes(n), 'sfx name listed: ' + n); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of ARC_NAMES) {
    ac.currentTime += 3;
    const before = fake.count.total;
    let r = false;
    try { r = AUDIO.sfx(n, { pitch: 1.2 }); } catch (e) { T.ok(false, n + ' threw ' + e); }
    T.ok(r && fake.count.total - before >= 2, 'arcade sfx ' + n + ' plays');
  }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('wheelTick'), 'a click');
  T.eq(AUDIO.sfx('wheelTick'), false, 'a second click in the same instant is throttled');
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('arcJackpot') && !AUDIO.sfx('arcJackpot'), 'one jackpot fanfare at a time');
});

/* ------------------------------------------- round 3: dynamic fight music */
T.test('dynamic music: the layers never throw headless', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  let r;
  try { r = AUDIO.musicState({ hype: true, tense: true }); } catch (e) { T.ok(false, 'musicState threw before init ' + e); }
  T.ok(r && r.hype && r.tense && r.changed, 'the wanted layers are remembered before init');
  T.eq(JSON.stringify(AUDIO.layers), '{"hype":true,"tense":true}', 'layers getter');
  T.eq(AUDIO.musicState({ hype: true, tense: true }).changed, false, 'the same state again is not a change');
  T.eq(AUDIO.victory(), false, 'no sting before init');
  T.eq(JSON.stringify(AUDIO.layers), '{"hype":false,"tense":false}', 'the victory clears the layers');
  AUDIO.musicState(null); AUDIO.musicState(); AUDIO.musicState({ hype: 'yes' });
  T.eq(AUDIO._layerSong('map'), null, 'only the fight modes layer up');
  for (const m of ['fight', 'elite', 'boss']) {
    const L = AUDIO._layerSong(m), base = AUDIO._song(m);
    T.ok(L && L.hype.length === base.len && L.tense.length === base.len, m + ': the layers loop with the base song');
    const hv = new Set(L.hype.flat().map(e => e.v)), tv = new Set(L.tense.flat().map(e => e.v));
    T.ok(hv.has('shaker') && hv.has('clap') && hv.has('tom'), m + ': the hype layer is percussion (shaker, claps, tom fills)');
    T.ok(tv.has('drone') && tv.has('hbeat') && tv.has('trem'), m + ': the tense layer is a drone, a heartbeat and a tremolo');
    T.ok(L.tense.flat().every(e => e.n == null || Number.isFinite(e.n)), m + ': finite notes');
  }
  const again = boot({ only: ['util', 'audio'] }).AUDIO;
  T.eq(JSON.stringify(again._layerSong('boss')), JSON.stringify(AUDIO._layerSong('boss')), 'the layer tunes are deterministic');
  T.eq(JSON.stringify(again._song('fight').steps), JSON.stringify(boot({ only: ['util', 'audio'] }).AUDIO._song('fight').steps), 'the base songs are unchanged by the layers');
});

T.test('dynamic music: layers switch on state changes, crossfade and respect the music toggle', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  const run = (secs) => { let n = 0; for (let i = 0; i < secs / 0.025; i++) { ac.currentTime += 0.025; n += AUDIO._tick(); } return n; };
  AUDIO.music('fight');
  run(1);
  let L = AUDIO._liveLayers();
  T.eq(L.length, 1, 'the fight tune carries the layer gains');
  T.ok(L[0].hype === 0 && L[0].tense === 0, 'both layers start silent');
  const base = run(4);
  AUDIO.musicState({ hype: true });
  L = AUDIO._liveLayers();
  T.ok(L[0].hype === 1 && L[0].tense === 0, 'a streak brings in the hype layer');
  const hyped = run(4);
  T.ok(hyped > base * 1.3, `more notes with the percussion on (${base} -> ${hyped})`);
  AUDIO.musicState({ hype: true, tense: true });
  T.ok(AUDIO._liveLayers()[0].tense === 1, 'low hp brings in the tense layer');
  const both = run(4);
  T.ok(both > hyped, `and more again with the tension (${hyped} -> ${both})`);
  AUDIO.musicState({ hype: false, tense: false });
  L = AUDIO._liveLayers();
  T.ok(L[0].hype === 0 && L[0].tense === 0, 'switched off');
  const tail = run(1.5);
  T.ok(tail > base / 4 * 1.2 * 0.8, 'the layers keep playing through their fade tail');
  run(3);
  const after = run(4);
  T.ok(after < both, `and stop after it (${after})`);
  // a boss keeps the state it is handed; a map tune has no layers
  AUDIO.musicState({ tense: true });
  AUDIO.music('boss');
  run(1.5);
  T.ok(AUDIO._liveLayers().some(x => x.mode === 'boss' && x.tense === 1 && !x.fading), 'the boss tune starts with the tension already on');
  AUDIO.music('map');
  run(1.5);
  T.eq(AUDIO._liveLayers().filter(x => !x.fading).length, 0, 'the map has no layers');
  T.eq(JSON.stringify(AUDIO.layers), '{"hype":false,"tense":false}', 'leaving the fight resets them');
  // the victory sting
  AUDIO.music('fight');
  run(1);
  const n0 = fake.count.total;
  T.eq(AUDIO.victory(), true, 'the victory sting plays');
  T.ok(fake.count.total - n0 >= 8, 'a fanfare of voices');
  T.ok(AUDIO._live().every(x => x.fading), 'the fight fades out under it');
  // music off: no sting, no layers
  AUDIO.toggleMusic();
  T.eq(AUDIO.victory(), false, 'music off: no sting');
  AUDIO.musicState({ hype: true });
  T.eq(AUDIO._liveLayers().filter(x => !x.fading).length, 0, 'music off: nothing layers up');
});

/* ---------------------------------------------------------------- round 6: per-act music */
T.test('round 6: every act has its own map theme and fight colour, the base tunes unchanged', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  const base = JSON.stringify(boot({ only: ['util', 'audio'] }).AUDIO._song('map').steps);
  T.eq(AUDIO.act, 0, 'no act before the game says so');
  T.eq(AUDIO._actOf('map'), 0, 'act 0 plays the base map tune');
  for (const m of ['title', 'win', 'off']) T.eq(AUDIO._actOf(m, 2), 0, `${m} never varies by act`);
  const maps = [1, 2, 3].map(a => AUDIO._songFor('map', a));
  T.ok(maps.every(s => s && s.act >= 1), 'three act map themes');
  T.ok(maps[0].bpm !== maps[1].bpm && maps[1].bpm !== maps[2].bpm && maps[0].bpm !== maps[2].bpm, 'each at its own tempo (' + maps.map(s => s.bpm).join(', ') + ')');
  T.ok(new Set(maps.map(s => s.cfg.scale)).size === 3, 'and in its own mode (' + maps.map(s => s.cfg.scale).join(', ') + ')');
  const voices = (s) => new Set(s.steps.flat().map(e => e.v));
  T.ok(voices(maps[0]).has('arp'), 'act 1: the synthpop arpeggio');
  T.ok(voices(maps[1]).has('clank') && voices(maps[1]).has('steam'), 'act 2: anvil clanks and steam');
  T.ok(voices(maps[2]).has('bell') && maps[2].cfg.box, 'act 3: music box bells');
  for (const m of ['fight', 'elite', 'boss']) {
    const b = AUDIO._song(m);
    for (const a of [1, 2, 3]) {
      const s = AUDIO._songFor(m, a);
      T.ok(s && s.act === a && JSON.stringify(s.steps) !== JSON.stringify(b.steps), `${m} act ${a}: its own variant`);
      const L = AUDIO._layerSong(m, a);
      T.ok(L && L.hype.length === s.len && L.tense.length === s.len, `${m} act ${a}: hype and tense layers fit it`);
    }
  }
  T.ok(voices(AUDIO._songFor('fight', 2)).has('clank') && voices(AUDIO._songFor('boss', 3)).has('bell'), 'the fights borrow the act timbre');
  T.eq(JSON.stringify(AUDIO._song('map').steps), base, 'the base map tune is bit for bit the old one');
  T.eq(JSON.stringify(AUDIO._songFor('map', 2).steps), JSON.stringify(boot({ only: ['util', 'audio'] }).AUDIO._songFor('map', 2).steps), 'an act theme is deterministic');
  T.eq(AUDIO.setAct(7), 0, 'an unknown act plays the base tunes');
  T.eq(AUDIO.setAct(2), 2, 'setAct remembers the act before init');
  AUDIO.music('map');
  T.eq(AUDIO.mode, 'map', 'and music still remembers the mode');
});

T.test('round 6: the act switches crossfade the live tune, fights keep their layers, volume and mute hold', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  const run = (secs) => { let n = 0; for (let i = 0; i < secs / 0.025; i++) { ac.currentTime += 0.025; n += AUDIO._tick(); } return n; };
  AUDIO.setAct(1);
  AUDIO.music('map');
  run(0.5);
  T.eq(JSON.stringify(AUDIO._liveActs()), '[{"mode":"map","act":1,"fading":false}]', 'act 1 map theme live');
  AUDIO.setAct(2);
  let L = AUDIO._liveActs();
  T.ok(L.length === 2 && L.some(x => x.act === 1 && x.fading) && L.some(x => x.act === 2 && !x.fading), 'a new act crossfades into its theme');
  run(2.2);
  T.eq(JSON.stringify(AUDIO._liveActs()), '[{"mode":"map","act":2,"fading":false}]', 'the old act drops after the fade');
  AUDIO.music('map');
  T.eq(AUDIO._liveActs().length, 1, 'the same mode and act again does not restart');
  AUDIO.music('fight');
  run(0.3);
  T.ok(AUDIO._liveActs().some(x => x.mode === 'fight' && x.act === 2 && !x.fading), 'the fight plays the act 2 variant');
  AUDIO.musicState({ hype: true, tense: true });
  const lay = AUDIO._liveLayers().find(x => !x.fading);
  T.ok(lay && lay.hype === 1 && lay.tense === 1, 'the hype and tense layers still switch on');
  let queued = 0, threw = false;
  try { queued = run(3); } catch (e) { threw = true; }
  T.ok(!threw && queued > 0, 'the act variants play without throwing (' + queued + ' notes)');
  T.eq(AUDIO.victory(), true, 'the victory sting over an act variant');
  run(1);
  AUDIO.setAct(3);
  AUDIO.music('boss');
  run(0.5);
  T.ok(AUDIO._liveActs().some(x => x.mode === 'boss' && x.act === 3 && !x.fading), 'act 3 boss variant');
  T.eq(AUDIO.setMaster(0.5), 0.5, 'master volume set');
  T.eq(AUDIO.setMaster(3), 1, 'and clamped');
  T.eq(AUDIO.master, 1, 'the getter reads it');
  AUDIO.toggleMusic();
  run(1);
  T.eq(AUDIO._liveActs().filter(x => !x.fading).length, 0, 'music off: nothing plays');
  AUDIO.setAct(1);
  T.eq(AUDIO._liveActs().filter(x => !x.fading).length, 0, 'an act change with music off stays silent');
  AUDIO.toggleMusic();
  T.ok(AUDIO._liveActs().some(x => x.mode === 'boss' && x.act === 1 && !x.fading), 'music on resumes the mode in the current act');
});

T.test('round 6 sets: the set, boon and Compactor voices play, no-op cold, and are throttled', () => {
  const SET_NAMES = ['setPiece', 'setDone', 'boonDeal', 'boonFlip', 'boonPick', 'cmpFeed', 'cmpPress', 'cmpCrunch', 'cmpPop'];
  const { AUDIO, fake } = bootFake();
  for (const n of SET_NAMES) { T.ok(AUDIO.names.includes(n), 'sfx name listed: ' + n); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of SET_NAMES) {
    ac.currentTime += 3;
    const before = fake.count.total;
    let r = false;
    try { r = AUDIO.sfx(n, { pitch: 1.1, n: 3 }); } catch (e) { T.ok(false, n + ' threw ' + e); }
    T.ok(r && fake.count.total - before >= 2, 'set sfx ' + n + ' plays');
  }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('setDone') && !AUDIO.sfx('setDone'), 'one set fanfare at a time');
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('cmpCrunch') && !AUDIO.sfx('cmpCrunch'), 'one crunch at a time');
});

T.test('round 7 evolve: the evolution and pet synergy voices play, no-op cold, and are throttled', () => {
  const EVO_NAMES = ['evoRise', 'evoBurst', 'petSyn'];
  const { AUDIO, fake } = bootFake();
  for (const n of EVO_NAMES) { T.ok(AUDIO.names.includes(n), 'sfx name listed: ' + n); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of EVO_NAMES) {
    ac.currentTime += 3;
    const before = fake.count.total;
    let r = false;
    try { r = AUDIO.sfx(n, { pitch: 1.2 }); } catch (e) { T.ok(false, n + ' threw ' + e); }
    T.ok(r && fake.count.total - before >= 2, 'evolve sfx ' + n + ' plays');
  }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('evoBurst') && !AUDIO.sfx('evoBurst'), 'one evolution burst at a time');
});

// SEASON (round 7): the seasonal tunes and the trick-or-treat door's sounds.
T.test('season: the door and candy sounds play after init and no-op before', () => {
  const { AUDIO, fake } = bootFake();
  const SEA_SFX = ['knock', 'creak', 'treat', 'boo', 'cackle', 'candy'];
  for (const n of SEA_SFX) { T.ok(AUDIO.names.includes(n), n + ' is a known sound'); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of SEA_SFX) {
    ac.currentTime += 3;
    const before = fake.count.total;
    T.ok(AUDIO.sfx(n) && fake.count.total - before >= 2, n + ' plays');
  }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('creak') && !AUDIO.sfx('creak'), 'one creak at a time');
});
T.test('season: Claw-o-ween and winter have their own title and map tunes; the base tunes are untouched', () => {
  const { AUDIO } = bootFake();
  const base = JSON.stringify(AUDIO._song('title').steps), baseMap = JSON.stringify(AUDIO._song('map').steps);
  const ht = AUDIO._seaSong('title', 'halloween'), hm = AUDIO._seaSong('map', 'halloween'), wt = AUDIO._seaSong('title', 'winter'), wm = AUDIO._seaSong('map', 'winter');
  T.ok(ht.cfg.seaKey === 'halloween' && ht.cfg.scale === 'harm' && ht.bpm !== AUDIO._song('title').bpm, 'the spooky title: harmonic minor, its own tempo');
  const has = (s, v) => s.steps.some(st => st.some(e => e.v === v));
  T.ok(has(ht, 'organ') && has(hm, 'organ') && has(ht, 'bell'), 'an organ pad and a tolling bell');
  T.ok(has(wt, 'sleigh') && has(wm, 'sleigh') && wm.cfg.scale === 'major', 'sleigh bells in a major key for winter');
  T.ok(!has(AUDIO._song('title'), 'organ') && !has(AUDIO._song('map'), 'sleigh'), 'the base tunes have neither');
  T.eq(JSON.stringify(AUDIO._seaSong('title', 'halloween').steps), JSON.stringify(ht.steps), 'deterministic');
  T.eq(JSON.stringify(AUDIO._song('title').steps), base, 'the base title is unchanged after');
  T.eq(JSON.stringify(AUDIO._song('map').steps), baseMap, 'and the base map');
  T.eq(AUDIO._seaSong('title', null), AUDIO._song('title'), 'no season plays the base tune');
  T.eq(AUDIO._seaSong('fight', 'halloween'), AUDIO._song('fight'), 'fights keep their own tunes (and layers)');
  T.ok(AUDIO.SEA_CFG.halloween && AUDIO.SEA_CFG.winter && AUDIO.SEA_NAMES.halloween, 'the configs and their names are exposed');
});
// WIN (round 12): the winter jingle and the advent / Krampus sounds
T.test('winter: the title and map carry the jingle hook on the chord\'s own tones; fights and Claw-o-ween do not', () => {
  const { AUDIO } = bootFake();
  const wt = AUDIO._seaSong('title', 'winter'), wm = AUDIO._seaSong('map', 'winter'), ht = AUDIO._seaSong('title', 'halloween');
  // the hook: three bells on the same note, twice, then a run of four, then a long one (bars 0..3 of each half)
  const hook = (s, b0) => [0, 1, 2, 3].map(b => s.steps.slice((b0 + b) * 16, (b0 + b + 1) * 16).map((st, i) => st.filter(e => e.v === 'bell' && e.d).map(e => i)).flat());
  for (const [s, name] of [[wt, 'title'], [wm, 'map']]) {
    for (const b0 of [0, 8]) {
      const h = hook(s, b0);
      T.eq(JSON.stringify(h), JSON.stringify([[0, 4, 8], [0, 4, 8], [0, 4, 8, 14], [0]]), `${name}: the jingle rhythm from bar ${b0}`);
    }
    const bar0 = s.steps.slice(0, 16).map(st => st.filter(e => e.v === 'bell' && e.d)).flat();
    T.ok(bar0.length === 3 && bar0.every(e => e.n === bar0[0].n), `${name}: jingle, jingle, jingle (one note)`);
    T.ok(s.steps.slice(4 * 16, 8 * 16).every(st => !st.some(e => e.v === 'bell' && e.d)), `${name}: the answer bars leave room`);
  }
  T.ok(!ht.steps.some(st => st.some(e => e.v === 'bell' && e.d)), 'Claw-o-ween has no jingle');
  T.eq(AUDIO._seaSong('fight', 'winter'), AUDIO._song('fight'), 'fights keep their own tunes');
  T.eq(JSON.stringify(AUDIO._seaSong('map', 'winter').steps), JSON.stringify(wm.steps), 'deterministic');
});
T.test('winter: the ribbon, the pop, the present and the coal play in their tiers', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  const want = { winRibbon: 'soft', winPop: 'mid', winGift: 'big', winCoal: 'soft' };
  for (const n in want) {
    ac.currentTime += 2;
    const before = fake.count.total;
    T.ok(AUDIO.names.includes(n) && AUDIO.sfx(n) && fake.count.total - before >= 2, n + ' plays');
    T.eq(AUDIO.mix.tier(n), want[n], n + ' sits in ' + want[n]);
  }
  T.ok(AUDIO.mix.TRIM.winRibbon > 0 && AUDIO.mix.TRIM.winCoal < 0, 'calibrated (the ribbon lifted, the coal pulled down)');
});
T.test('season: setSeason crossfades a live title or map tune, before init it is remembered', () => {
  const { AUDIO, fake } = bootFake();
  T.eq(AUDIO.setSeason('halloween'), 'halloween', 'remembered before init');
  T.eq(AUDIO.setSeason('easter'), null, 'an unknown season is none');
  T.eq(AUDIO.season, null, 'none');
  AUDIO.init();
  const ac = fake.ctxs[0];
  const run = (secs) => { for (let i = 0; i < secs / 0.025; i++) { ac.currentTime += 0.025; AUDIO._tick(); } };
  AUDIO.music('title');
  run(0.5);
  T.eq(AUDIO._live().length, 1, 'the base title plays');
  AUDIO.setSeason('halloween');
  let L = AUDIO._live();
  T.ok(L.length === 2 && L.filter(x => x.fading).length === 1, 'the season crossfades the title into its tune');
  run(2);
  T.eq(AUDIO._live().length, 1, 'the old one drops after the fade');
  AUDIO.setSeason('halloween');
  T.eq(AUDIO._live().length, 1, 'the same season again does nothing');
  AUDIO.music('fight');
  run(1.5);
  const n = AUDIO._live().filter(x => !x.fading).length;
  AUDIO.setSeason(null);
  T.eq(AUDIO._live().filter(x => !x.fading).length, n, 'a fight is not restarted by the season');
  AUDIO.music('map');
  run(0.3);
  T.ok(AUDIO._live().some(x => x.mode === 'map' && !x.fading), 'the map plays');
});

// STORY (round 8): story pages, callbacks, Grabby Gary, the alternate bosses' tricks.
T.test('story: every new voice plays after init and no-ops before', () => {
  const { AUDIO, fake } = bootFake();
  const STO_SFX = ['stoPage', 'stoCallback', 'garyTaunt', 'clawOffBell', 'plushSqueak', 'beltRun', 'iceGrow', 'crabSnip', 'hunted'];
  for (const n of STO_SFX) { T.ok(AUDIO.names.includes(n), n + ' is a known sound'); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of STO_SFX) {
    ac.currentTime += 3;
    const before = fake.count.total;
    T.ok(AUDIO.sfx(n) && fake.count.total - before >= 2, n + ' plays');
  }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('stoCallback') && !AUDIO.sfx('stoCallback'), 'one callback chime at a time');
});

T.test('CR8: the vacuum, the twin claws and Mama Mech\'s turret have their sounds', () => {
  const { AUDIO, fake } = bootFake();
  const CR8_SFX = ['vacWhoosh', 'vacSlurp', 'vacClog', 'vacBlow', 'twinSeek', 'twinClick', 'turBuild', 'turUp', 'turFire', 'turMega'];
  for (const n of CR8_SFX) { T.ok(AUDIO.names.includes(n), n + ' is a known sound'); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of CR8_SFX) {
    ac.currentTime += 3;
    const before = fake.count.total;
    T.ok(AUDIO.sfx(n, { lv: 3, pitch: 1.1 }) && fake.count.total - before >= 2, n + ' plays');
  }
  for (const lv of [0, 1, 5, 99]) { ac.currentTime += 3; T.ok(AUDIO.sfx('turUp', { lv }), 'turUp at lv ' + lv); }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('turFire') && !AUDIO.sfx('turFire'), 'a volley is rate-limited');
});

// FAMILY + REROLL (round 9): the families' voices and the reroll's rare shine.
T.test('round 9: every family voice and the reroll shine play after init and no-op before', () => {
  const { AUDIO, fake } = bootFake();
  const R9_SFX = ['famIntro', 'famBeat', 'famReady', 'famSolo', 'famCancel', 'famRestock', 'famCan', 'famChange', 'famPayout', 'famHum', 'famShatter', 'famAngry', 'rrShine'];
  for (const n of R9_SFX) { T.ok(AUDIO.names.includes(n), n + ' is a known sound'); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of R9_SFX) {
    ac.currentTime += 3;
    const before = fake.count.total;
    T.ok(AUDIO.sfx(n) && fake.count.total - before >= 2, n + ' plays');
  }
  for (const fam of ['band', 'vending', 'choir', 'nope']) { ac.currentTime += 3; T.ok(AUDIO.sfx('famIntro', { fam }), 'famIntro for ' + fam); }
  for (const n of [0, 1, 4, 8, 99]) { ac.currentTime += 3; T.ok(AUDIO.sfx('famBeat', { n }), 'famBeat at ' + n); }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('famSolo') && !AUDIO.sfx('famSolo'), 'one SOLO at a time');
  // the reels reuse the arcade's lever and reel sounds
  for (const n of ['lever', 'reelSpin', 'reelStop']) T.ok(AUDIO.names.includes(n), n + ' is there for the reroll');
});

/* ---------------------------------------------------------------- MIX (round 10)
   A tiny offline WebAudio in plain JS: just what audio.js builds (oscillators,
   gains, biquads with the spec's dB Q for low and high pass, looping noise
   buffers, audio-rate param inputs, the set / linear / exponential / target /
   cancel timeline). Compressors pass through (the measurements are pre-bus).
   Each node only holds the samples it is live for. Against Chromium's
   OfflineAudioContext it lands within 0.1 dB on the median voice and 2.5 dB
   at worst (its square and saw waves are not band-limited). */
function mixRenderAC(SR, secs) {
  const N = Math.round(SR * secs);
  const at = (t) => Math.max(0, Math.min(N, Math.ceil(t * SR)));
  // adds node n's buffer into o, which covers [a, z)
  const mixIn = (o, a, z, n) => { const r = n.rng(), x = n.buf(); const lo = Math.max(a, r[0]), hi = Math.min(z, r[1]); for (let i = lo; i < hi; i++) o[i - a] += x[i - r[0]]; };
  class Param {
    constructor(v) { this.value = v; this.ev = []; this.ins = []; }
    setValueAtTime(v, t) { this.ev.push({ k: 's', v, t }); return this; }
    linearRampToValueAtTime(v, t) { this.ev.push({ k: 'l', v, t }); return this; }
    exponentialRampToValueAtTime(v, t) { this.ev.push({ k: 'e', v, t }); return this; }
    setTargetAtTime(v, t, c) { this.ev.push({ k: 'g', v, t, c }); return this; }
    cancelScheduledValues(t) { this.ev = this.ev.filter((e) => e.t < t); return this; }
    // the value over [a, z): the timeline (set, linear, exponential, target) plus audio-rate inputs
    buf(a, z) {
      const o = new Float32Array(Math.max(0, z - a));
      const ev = this.ev.map((e, i) => Object.assign({ i }, e)).sort((x, y) => x.t - y.t || x.i - y.i);
      let s = a, pv = this.value, pt = 0, tg = null;   // s: the next sample to write
      const cur = (i) => (tg ? tg.v + (tg.v0 - tg.v) * Math.exp(-(i / SR - tg.t) / tg.c) : pv);
      const hold = (to) => { for (to = Math.min(to, z); s < to; s++) o[s - a] = cur(s); };
      for (const e of ev) {
        const e0 = at(e.t);
        if (e.k === 's') { hold(e0); pv = e.v; pt = e.t; tg = null; }
        else if (e.k === 'l' || e.k === 'e') {
          const v0 = tg ? cur(s) : pv, t0 = tg ? s / SR : pt, span = e.t - t0, ex = e.k === 'e' && v0 * e.v > 0;
          tg = null;
          for (const to = Math.min(e0, z); s < to; s++) {
            const u = span > 0 ? Math.min(1, Math.max(0, (s / SR - t0) / span)) : 1;
            o[s - a] = ex ? v0 * Math.pow(e.v / v0, u) : e.k === 'e' ? v0 : v0 + (e.v - v0) * u;
          }
          pv = e.v; pt = e.t;
        } else if (e.k === 'g') { hold(e0); const v0 = cur(e0); tg = { v: e.v, t: e.t, c: Math.max(1e-4, e.c), v0 }; pt = e.t; }
      }
      hold(z);
      for (const n of this.ins) mixIn(o, a, z, n);
      return o;
    }
  }
  class Node {
    constructor() { this.ins = []; this.b = null; this.r = null; }
    connect(d) { d.ins.push(this); return d; }
    disconnect() {}
    rng() {
      if (this.r) return this.r;
      let a = N, z = 0;
      for (const n of this.ins) { const r = n.rng(); if (r[1] > r[0]) { a = Math.min(a, r[0]); z = Math.max(z, r[1]); } }
      if (z > a && this.tail) z = Math.min(N, z + Math.round(this.tail * SR));
      return (this.r = z > a ? [a, z] : [0, 0]);
    }
    sum() { const [a, z] = this.rng(), o = new Float32Array(z - a); for (const n of this.ins) mixIn(o, a, z, n); return o; }
    buf() { return this.b || (this.b = this.sum()); }
  }
  class Gain extends Node {
    constructor() { super(); this.gain = new Param(1); }
    buf() { if (this.b) return this.b; const [a, z] = this.rng(), o = this.sum(), g = this.gain.buf(a, z); for (let i = 0; i < o.length; i++) o[i] *= g[i]; return (this.b = o); }
  }
  class Osc extends Node {
    constructor() { super(); this.type = 'sine'; this.frequency = new Param(440); this.detune = new Param(0); this.t0 = Infinity; this.t1 = Infinity; }
    start(t) { this.t0 = t || 0; } stop(t) { this.t1 = t; }
    rng() { if (!this.r) { const a = at(this.t0), z = this.t1 === Infinity ? N : at(this.t1); this.r = z > a ? [a, z] : [0, 0]; } return this.r; }
    buf() {
      if (this.b) return this.b;
      const [a, z] = this.rng(), o = new Float32Array(z - a), f = this.frequency.buf(a, z), d = this.detune.buf(a, z);
      let ph = 0;
      for (let j = 0; j < o.length; j++) {
        const fr = ph - Math.floor(ph);
        switch (this.type) {
          case 'square': o[j] = fr < 0.5 ? 1 : -1; break;
          case 'sawtooth': o[j] = 2 * fr - 1; break;
          case 'triangle': o[j] = fr < 0.25 ? 4 * fr : fr < 0.75 ? 2 - 4 * fr : 4 * fr - 4; break;
          default: o[j] = Math.sin(2 * Math.PI * fr);
        }
        ph += f[j] * (d[j] ? Math.pow(2, d[j] / 1200) : 1) / SR;
      }
      return (this.b = o);
    }
  }
  class Biquad extends Node {
    constructor() { super(); this.type = 'lowpass'; this.frequency = new Param(350); this.Q = new Param(1); this.gain = new Param(0); this.tail = 0.08; }
    buf() {
      if (this.b) return this.b;
      const [a, z] = this.rng(), x = this.sum(), o = new Float32Array(z - a), F = this.frequency.buf(a, z), Q = this.Q.buf(a, z);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, lf = -1, lq = -1, b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
      for (let i = 0; i < o.length; i++) {
        const f = Math.min(F[i], SR / 2 - 1), q = Q[i];
        if (f !== lf || q !== lq) {
          lf = f; lq = q;
          const w = 2 * Math.PI * Math.max(1, f) / SR, c = Math.cos(w), s = Math.sin(w);
          let n0, n1, n2, al;
          if (this.type === 'bandpass') { al = s / (2 * Math.max(1e-4, q)); n0 = al; n1 = 0; n2 = -al; }
          else {
            al = s / (2 * Math.pow(10, q / 20));
            if (this.type === 'highpass') { n0 = (1 + c) / 2; n1 = -(1 + c); n2 = (1 + c) / 2; } else { n0 = (1 - c) / 2; n1 = 1 - c; n2 = (1 - c) / 2; }
          }
          const d0 = 1 + al;
          b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0; a1 = -2 * c / d0; a2 = (1 - al) / d0;
        }
        const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y;
      }
      return (this.b = o);
    }
  }
  class Src extends Node {
    constructor() { super(); this.buffer = null; this.loop = false; this.playbackRate = new Param(1); this.t0 = Infinity; this.t1 = Infinity; this.off = 0; }
    start(t, off) { this.t0 = t || 0; this.off = off || 0; } stop(t) { this.t1 = t; }
    rng() { if (!this.r) { const a = at(this.t0), z = this.t1 === Infinity ? N : at(this.t1); this.r = z > a && this.buffer ? [a, z] : [0, 0]; } return this.r; }
    buf() {
      if (this.b) return this.b;
      const [a, z] = this.rng(), o = new Float32Array(z - a);
      if (!this.buffer) return (this.b = o);
      const d = this.buffer.getChannelData(0), L = d.length, r = this.playbackRate.buf(a, z), bs = (this.buffer.sampleRate || SR) / SR;
      let p = this.off * (this.buffer.sampleRate || SR);
      for (let j = 0; j < o.length; j++) { let k = Math.floor(p); if (k >= L) { if (!this.loop) break; k %= L; } o[j] = d[k]; p += r[j] * bs; }
      return (this.b = o);
    }
  }
  class Comp extends Node {
    constructor() { super(); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) this[k] = new Param(0); }
  }
  const dest = new Node();
  dest.rng = () => [0, N];
  return {
    sampleRate: SR, currentTime: 0, state: 'running', length: N, destination: dest,
    createGain: () => new Gain(), createOscillator: () => new Osc(), createBiquadFilter: () => new Biquad(),
    createBufferSource: () => new Src(), createDynamicsCompressor: () => new Comp(),
    createBuffer: (ch, len, sr) => { const d = new Float32Array(len); return { length: len, sampleRate: sr, numberOfChannels: 1, getChannelData: () => d }; },
    render: () => dest.buf(),
  };
}
/* The measuring page's numbers: K-weighted (a +4 dB shelf at 1.5 kHz and a
   38 Hz high pass), the loudest 100 ms window (st) and 400 ms window (m), the
   whole (int), all in dB, and the peak in dBFS. */
function mixMeasure(x, SR) {
  const biq = (x, hs, f, q, gdb) => {
    const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, gdb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (!hs) { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq); a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq; }
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  };
  let pk = 0, all = 0;
  for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  const k = biq(biq(x, true, 1500, 0.71, 4), false, 38, 0.5, 0);
  for (let i = 0; i < k.length; i++) all += k[i] * k[i];
  const win = (ms) => {
    const n = Math.round(SR * ms / 1000), hop = Math.round(SR * 0.01);
    let best = 0, acc = 0;
    for (let i = 0; i < k.length; i++) { acc += k[i] * k[i]; if (i >= n) acc -= k[i - n] * k[i - n]; if (i >= n - 1 && i % hop === 0) best = Math.max(best, acc / n); }
    if (k.length < n) best = all / n;
    return best > 0 ? 10 * Math.log10(best) : -120;
  };
  return { peak: 20 * Math.log10(pk || 1e-6), st: win(100), m: win(400), int: all > 0 ? 10 * Math.log10(all / k.length) : -120 };
}
// The options each voice was calibrated with (the rest play with none).
const MIX_OPTS = { itemLand: { mass: 1, vel: 1 }, hit: { amt: 6 }, combo: { tier: 2 }, capBurst: { tier: 3 }, capCrack: { n: 2 }, proc: { tier: 1 } };
const MIX_SR = 44100;
function mixRenderSfx(AUDIO, n, o) {
  const opts = o || MIX_OPTS[n] || {};
  const len = AUDIO.mix.offline(mixRenderAC(MIX_SR, 0.01), { sfx: n, opts }) || 0.5;
  const ac = mixRenderAC(MIX_SR, Math.min(6, len + 0.35));
  AUDIO.mix.offline(ac, { sfx: n, opts });
  return mixMeasure(ac.render(), MIX_SR);
}

const MIX_LOUD = {};
T.test('mix: every sound renders inside its loudness tier, and nothing is jarring', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  const M = AUDIO.mix;
  T.eq(M.TIERS.join(), 'tick,ui,soft,mid,big,huge', 'six tiers, quiet to loud');
  for (let i = 1; i < M.TIERS.length; i++) T.ok(M.TARGET[M.TIERS[i]] >= M.TARGET[M.TIERS[i - 1]] + 3.5, `${M.TIERS[i]} sits at least 3.5 dB over ${M.TIERS[i - 1]}`);
  const listed = new Set(Object.keys(M.TIER).concat(Object.keys(M.TRIM)));
  for (const n of AUDIO.names) {
    const t = M.tier(n);
    T.ok(M.TIERS.includes(t), `${n} has a tier (${t})`);
    const r = mixRenderSfx(AUDIO, n);
    MIX_LOUD[n] = r;
    T.ok(Number.isFinite(r.st) && r.st > -80, `${n} makes a sound (${r.st.toFixed(1)} dB)`);
    // the renderer runs up to 2.5 dB hot on raw square waves, so the window leans up
    const lo = M.TARGET[t] - M.WIN - 1, hi = M.TARGET[t] + M.WIN + 2.5;
    if (listed.has(n)) T.ok(r.st >= lo && r.st <= hi, `${n} sits in its ${t} tier: ${r.st.toFixed(1)} dB in ${lo}..${hi}`);
    else T.ok(r.st <= hi, `${n} (not calibrated, ${t}) is not jarring: ${r.st.toFixed(1)} <= ${hi}`);
    T.ok(r.peak < 0, `${n} never clips before the bus (${r.peak.toFixed(1)} dBFS)`);
  }
  // the tiers' medians land on their targets, in order
  let last = -Infinity;
  for (const t of M.TIERS) {
    const v = AUDIO.names.filter((n) => M.tier(n) === t).map((n) => MIX_LOUD[n].st).sort((a, b) => a - b);
    const med = v[v.length >> 1];
    T.ok(v.length > 0 && Math.abs(med - M.TARGET[t]) <= 1.5, `${t} median ${med.toFixed(1)} on its target ${M.TARGET[t]}`);
    T.ok(med > last, `${t} is louder than the tier under it`);
    last = med;
  }
  // the ones the owner named: UI ticks quiet, hits medium, jackpots and bosses loud
  for (const [n, t] of [['tick', 'tick'], ['click', 'ui'], ['hit', 'mid'], ['block', 'mid'], ['hitBig', 'big'], ['crit', 'big'], ['jackpot', 'huge'], ['bossDown', 'huge'], ['evoBurst', 'huge'], ['capBurst', 'huge']]) T.eq(M.tier(n), t, `${n} is ${t}`);
  T.ok(MIX_LOUD.jackpot.st > MIX_LOUD.hit.st + 6 && MIX_LOUD.hit.st > MIX_LOUD.click.st + 6 && MIX_LOUD.click.st > MIX_LOUD.tick.st + 3, 'jackpot > hit > click > tick, by a margin');
  // opts still scale inside a voice: a legendary burst over a common one, a tier 3 combo over a tier 1
  T.ok(mixRenderSfx(AUDIO, 'capBurst', { tier: 3 }).st > mixRenderSfx(AUDIO, 'capBurst', { tier: 0 }).st, 'a legendary capsule bursts louder than a common one');
  T.ok(mixRenderSfx(AUDIO, 'combo', { tier: 3 }).st > mixRenderSfx(AUDIO, 'combo', { tier: 1 }).st + 4, 'a tier 3 combo is well over a tier 1');
  // the untrimmed level is still there for the before / after table
  const raw = mixRenderAC(MIX_SR, 1.5);
  AUDIO.mix.offline(raw, { sfx: 'boom', raw: true });
  T.ok(mixMeasure(raw.render(), MIX_SR).st > MIX_LOUD.boom.st + 8, 'boom was 12 dB too hot before the trim');
});

T.test('mix: the music and its layers sit under the sfx', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  const M = AUDIO.mix;
  // as heard: the sfx bus is at 0.8 of the sfx level, the tune already carries the music bus's 0.5
  const midHeard = M.TARGET.mid + 20 * Math.log10(0.8);
  for (const [mode, act, season, layers] of [['fight', 0], ['fight', 0, null, ['hype', 'tense']], ['boss', 3, null, ['hype', 'tense']], ['map', 1], ['map', 3], ['title', 0], ['map', 0, 'halloween'], ['title', 0, 'winter'], ['machine', 0]]) {
    const ac = mixRenderAC(22050, 6.1);
    T.ok(M.offline(ac, { music: mode, act, season, layers, secs: 6 }) > 0, `${mode} ${season || act} renders`);
    const r = mixMeasure(ac.render(), 22050);
    const tag = `${mode}:${season || act}${layers ? '+layers' : ''}`;
    T.ok(r.int <= midHeard - 5, `${tag} sits 5 dB or more under a hit (${r.int.toFixed(1)} vs ${midHeard.toFixed(1)})`);
    T.ok(r.m <= midHeard + 0.5, `${tag}'s loudest moment stays under a hit (${r.m.toFixed(1)})`);
  }
  T.ok(M.musK('map', 3) < 1 && M.musK('map', 2) > 1 && M.musK('boss', 1) === 1, 'the per-tune levels are read per act');
});

T.test('mix: a sting ducks the music and the minor sfx, and both come back', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  const M = AUDIO.mix;
  ac.currentTime = 10;
  T.eq(M.duckAt(10).music, 1, 'no duck at rest');
  T.eq(AUDIO.sfx('jackpot'), true, 'a jackpot');
  let d = M.duckAt(10.2);
  T.ok(d.music <= 0.35, `the music dips under it (${d.music})`);
  T.ok(d.minor <= 0.55 && d.minor > 0, `the minor sfx step back (${d.minor})`);
  T.ok(M.duckAt(10.03).music < 1 && M.duckAt(10.03).music > d.music, 'the dip ramps in, it does not click');
  d = M.duckAt(13);
  T.eq(d.music, 1, 'the music is back 3 s later'); T.eq(d.minor, 1, 'the minor sfx too');
  // a hit-sized duck is a short shallow dip, the minor sfx untouched
  ac.currentTime = 20;
  AUDIO.sfx('hitBig');
  d = M.duckAt(20.2);
  T.ok(d.music >= 0.55 && d.music < 1, `a big hit only dips the music (${d.music})`);
  T.eq(d.minor, 1, 'and leaves the minor sfx alone');
  T.eq(M.duckAt(21).music, 1, 'back within a second');
  ac.currentTime = 25;
  AUDIO.sfx('hit');
  T.eq(M.duckAt(25.1).music, 1, 'a plain hit ducks nothing');
  // ducks merge: a big hit right after a jackpot never cuts the jackpot's duck short
  ac.currentTime = 30;
  AUDIO.sfx('jackpot');
  ac.currentTime = 30.3;
  AUDIO.sfx('hitBig');
  T.ok(M.duckAt(31).music <= 0.35, 'the jackpot keeps the music down through the hit');
  T.eq(M.duckAt(33).music, 1, 'and lets it back');
  // every sting ducks: the list
  for (const n of ['win', 'victory', 'bossDown', 'evoBurst', 'capBurst', 'setDone', 'arcJackpot']) {
    ac.currentTime += 10;
    T.eq(AUDIO.sfx(n, { tier: 3 }), true, n + ' plays');
    const x = M.duckAt(ac.currentTime + 0.15);
    T.ok(x.music < 0.5 && x.minor < 0.6, `${n} ducks the music and the minor sfx (${x.music.toFixed(2)}, ${x.minor.toFixed(2)})`);
  }
  // the game's own duck (no voice) keeps its shape
  ac.currentTime += 10;
  AUDIO.duck(1.2);
  T.ok(M.duckAt(ac.currentTime + 1).music <= 0.31, 'AUDIO.duck(1.2) holds the music at 0.3');
  T.eq(M.duckAt(ac.currentTime + 1).minor, 1, 'and is music only');
});

T.test('mix: voices are capped per tier, and the tiers do not starve each other', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  const M = AUDIO.mix;
  T.ok(M.CAP.tick + M.CAP.ui + M.CAP.soft + M.CAP.mid + M.CAP.big < 32, 'the capped tiers can never fill the global 32 on their own');
  ac.currentTime = 5;
  let played = 0, most = 0;
  for (let i = 0; i < 60; i++) { ac.currentTime += 0.072; if (AUDIO.sfx('bloom')) played++; most = Math.max(most, M.voices().ui); }
  T.ok(most <= M.CAP.ui && most >= 3, `at most ${M.CAP.ui} ui voices at once (${most})`);
  T.ok(played < 60 && played > 20, `a flood of blooms is thinned, not silenced (${played})`);
  ac.currentTime += 5;
  let wins = 0;
  for (let i = 0; i < 8; i++) { ac.currentTime += 0.02; if (AUDIO.sfx('win')) wins++; }
  T.eq(wins, M.CAP.huge, `at most ${M.CAP.huge} stings at once`);
  T.eq(AUDIO.sfx('hit'), true, 'a hit still plays under three stings');
  T.eq(M.voices().huge, M.CAP.huge, 'the voice counter sees them');
  ac.currentTime += 2;
  T.eq(AUDIO.sfx('win'), true, 'a sting plays again once they have rung out');
  ac.currentTime += 5;
  let ticks = 0;
  for (let i = 0; i < 40; i++) { ac.currentTime += 0.036; if (AUDIO.sfx('tick')) ticks++; }
  T.eq(ticks, 40, 'spaced counter ticks all play (they are short)');
});

T.test('mix: repeated sounds vary a little, never the same twice in a row, deterministic under a seed', () => {
  const seq = (seed) => {
    const { AUDIO, fake } = bootFake();
    AUDIO.init();
    const ac = fake.ctxs[0];
    AUDIO.mix.seed(seed);
    const out = [];
    ac.currentTime = 3;
    for (let i = 0; i < 16; i++) { ac.currentTime += 0.1; AUDIO.sfx('footstep'); out.push(AUDIO.mix.last); }
    ac.currentTime += 1;
    AUDIO.sfx('jackpot');
    return { out, after: AUDIO.mix.last, AUDIO };
  };
  const a = seq(7), b = seq(7), c = seq(8);
  T.eq(JSON.stringify(a.out), JSON.stringify(b.out), 'the same seed gives the same spread');
  T.ok(JSON.stringify(a.out) !== JSON.stringify(c.out), 'another seed another');
  const sp = a.AUDIO.mix.VARY.footstep;
  T.ok(a.out.every((x) => x.name === 'footstep' && Math.abs(x.p - 1) <= sp[0] + 1e-9), `pitch within +-${sp[0] * 100}%`);
  T.ok(a.out.every((x) => Math.abs(20 * Math.log10(x.v)) <= sp[1] + 1e-9), `level within +-${sp[1]} dB`);
  let minStep = Infinity;
  for (let i = 1; i < a.out.length; i++) minStep = Math.min(minStep, Math.abs(a.out[i].p - a.out[i - 1].p));
  T.ok(minStep >= sp[0] * 0.3, `no two footsteps in a row on the same pitch (smallest step ${(minStep * 100).toFixed(2)}%)`);
  T.ok(new Set(a.out.map((x) => x.p.toFixed(4))).size >= 12, 'a walk is not a machine gun');
  T.eq(a.after.name, 'footstep', 'a sting is never spread (it keeps its pitch)');
  for (const n of ['footstep', 'step', 'tick', 'hit', 'itemLand', 'click', 'peg']) T.ok(a.AUDIO.mix.VARY[n], n + ' is spread');
  for (const n of ['jackpot', 'bossDown', 'combo', 'heal']) T.ok(!a.AUDIO.mix.VARY[n], n + ' is not');
});

T.test('mix: the graph has a limiter after the master, and the offline renderer leaves the live graph alone', () => {
  const { AUDIO, fake } = bootFake();
  T.eq(AUDIO.mix.limiter, null, 'no limiter before init');
  AUDIO.init();
  T.ok(fake.count.comp >= 2, `the glue compressor and the limiter (${fake.count.comp})`);
  const lim = AUDIO.mix.limiter;
  T.ok(lim && lim.threshold.value === AUDIO.mix.LIM.threshold && lim.ratio.value >= 12, 'the limiter is a brick wall');
  const ac = fake.ctxs[0];
  ac.currentTime = 4;
  AUDIO.sfx('jackpot');
  const before = AUDIO.mix.duckAt(4.2).music;
  const off = mixRenderAC(8000, 0.5);
  AUDIO.mix.offline(off, { sfx: 'bossDown', bus: true });
  T.eq(AUDIO.mix.limiter, lim, 'the live limiter is back');
  T.eq(AUDIO.mix.duckAt(4.2).music, before, 'an offline sting never ducks the live music');
  T.eq(AUDIO.mix.offline(off, { sfx: 'nope' }), 0, 'an unknown voice renders nothing');
  T.eq(AUDIO.mix.tier('nope'), 'mid', 'an unknown voice is mid');
});

// DUO (round 11): the hand-off, the coin, the countdown, sabotage, the crowd and every taunt's own voice
T.test('duo: every new voice plays after init and no-ops before; every taunt voice sounds different', () => {
  const { AUDIO, fake } = bootFake();
  const DUO_SFX = ['duoFlip', 'duoCoin', 'duoCount', 'duoReady', 'duoSabo', 'duoCrowd', 'duoTaunt'];
  for (const n of DUO_SFX) { T.ok(AUDIO.names.includes(n), n + ' is a known sound'); T.eq(AUDIO.sfx(n), false, n + ' no-ops before init'); }
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n of DUO_SFX) {
    ac.currentTime += 3;
    const before = fake.count.total;
    T.ok(AUDIO.sfx(n, { n: 2 }) && fake.count.total - before >= 2, n + ' plays');
  }
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('duoCoin', { land: true }), 'the coin lands with a clink');
  const nodes = new Set();
  for (const v of ['kazoo', 'boing', 'trombone', 'horn', 'beatbox', 'mic', 'sing', 'cheer']) {
    ac.currentTime += 3;
    const before = fake.count.total;
    T.ok(AUDIO.sfx('duoTaunt', { v }), v + ': a taunt voice plays');
    nodes.add(fake.count.total - before);
  }
  T.ok(nodes.size >= 4, `the taunt voices are built differently (${[...nodes].join(', ')} nodes)`);
  ac.currentTime += 3;
  T.ok(AUDIO.sfx('duoTaunt', { v: 'nope' }), 'an unknown voice falls back to the kazoo');
  T.ok(!AUDIO.sfx('duoTaunt', { v: 'horn' }), 'one taunt at a time (the gap)');
});

/* ---------------------------------------------------------------- DEP (round 15): the Neon Depths' dub */
T.test('dep: the Depths are act 4 to the music: a muffled dub map theme, every mode bubbles, the old acts unchanged', () => {
  const { AUDIO } = boot({ only: ['util', 'audio'] });
  const fresh = boot({ only: ['util', 'audio'] }).AUDIO;
  T.ok(AUDIO.ACT_CFG[4] && AUDIO.ACT_NAMES[4] === 'flooded dub', 'act 4: the flooded dub');
  const map = AUDIO._songFor('map', 4);
  T.ok(map && map.act === 4 && map.cfg.dub && map.cfg.bub, 'its own map theme, dub and bubbles');
  T.ok([1, 2, 3].every(a => AUDIO._songFor('map', a).bpm !== map.bpm) && map.bpm < AUDIO._songFor('map', 3).bpm, `the slowest map theme (${map.bpm} bpm)`);
  const voices = (s) => new Set(s.steps.flat().map(e => e.v));
  T.ok(voices(map).has('bub') && voices(map).has('snare') && voices(map).has('bass'), 'bubbles over a one-drop kit and a walking sub');
  for (const m of ['fight', 'elite', 'boss']) {
    const s = AUDIO._songFor(m, 4), b = AUDIO._song(m);
    T.ok(s && s.act === 4 && s.cfg.dub && JSON.stringify(s.steps) !== JSON.stringify(b.steps) && JSON.stringify(s.steps) !== JSON.stringify(AUDIO._songFor(m, 3).steps), `${m} act 4: its own variant`);
    T.ok(voices(s).has('bub'), `${m} act 4 bubbles`);
    const L = AUDIO._layerSong(m, 4);
    T.ok(L && L.hype.length === s.len && L.tense.length === s.len, `${m} act 4: the hype and tense layers fit it`);
  }
  for (const a of [0, 1, 2, 3]) for (const m of ['map', 'fight', 'boss']) T.ok(!voices(AUDIO._songFor(m, a)).has('bub'), `${m} act ${a}: no bubbles (the old tunes stay bit for bit)`);
  T.eq(JSON.stringify(AUDIO._songFor('map', 4).steps), JSON.stringify(fresh._songFor('map', 4).steps), 'deterministic');
  T.eq(AUDIO.setAct(4), 4, 'setAct takes the Depths');
  T.ok(AUDIO.mix.musK('fight', 4) < 1, 'the dub fight sits a little under the others');
});

T.test('dep: the dub plays live (a tape echo lead, bubbles), the act switch crossfades, and its sounds sit in their tiers', () => {
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  const run = (secs) => { let n = 0; for (let i = 0; i < secs / 0.025; i++) { ac.currentTime += 0.025; n += AUDIO._tick(); } return n; };
  AUDIO.setAct(3); AUDIO.music('map'); run(0.5);
  AUDIO.setAct(4);
  const L = AUDIO._liveActs();
  T.ok(L.some(x => x.act === 3 && x.fading) && L.some(x => x.act === 4 && !x.fading), 'the vault crossfades into the Depths');
  let queued = 0, threw = false;
  try { queued = run(4); AUDIO.music('boss'); AUDIO.musicState({ hype: true, tense: true }); queued += run(3); } catch (e) { threw = true; console.log(e.stack); }
  T.ok(!threw && queued > 0, `the dub plays without throwing (${queued} notes)`);
  const M = AUDIO.mix;
  const want = { depLure: 'mid', depBubble: 'soft', depSting: 'mid', depPinch: 'soft', depZap: 'mid', depChest: 'mid', depTide: 'big' };
  for (const n in want) {
    T.ok(AUDIO.names.includes(n), n + ' is a sound');
    T.eq(M.tier(n), want[n], `${n} is ${want[n]}`);
    ac.currentTime += 2;
    T.ok(AUDIO.sfx(n), n + ' plays');
  }
  ac.currentTime += 2;
  T.ok(AUDIO.sfx('depChest', { bite: 1 }), 'a biting chest chomps');
  // levels, as heard, against a hit
  const midHeard = M.TARGET.mid + 20 * Math.log10(0.8);
  for (const [mode, layers] of [['map'], ['fight', ['hype', 'tense']], ['boss', ['hype', 'tense']]]) {
    const oc = mixRenderAC(22050, 6.1);
    T.ok(M.offline(oc, { music: mode, act: 4, layers, secs: 6 }) > 0, `${mode} act 4 renders`);
    const r = mixMeasure(oc.render(), 22050);
    T.ok(r.int <= midHeard - 5, `${mode}:4 sits 5 dB or more under a hit (${r.int.toFixed(1)})`);
    T.ok(r.m <= midHeard + 0.5, `${mode}:4's loudest moment stays under a hit (${r.m.toFixed(1)})`);
  }
});

T.test('cab (round 16): the cabinet\'s voices play after init, no-op before, sit in their tiers and scale', () => {
  const want = { cabRoll: 'tick', cabLamp: 'ui', cabCreak: 'soft', cabSqueak: 'soft', cabLand: 'mid', cabSurge: 'mid', cabRain: 'mid', cabPerfect: 'big', cabFever: 'big' };
  const cold = boot({ only: ['util', 'audio'] }).AUDIO;
  for (const n in want) { T.ok(cold.names.includes(n), n + ' is a sound'); T.eq(cold.sfx(n), false, n + ' no-ops before init'); }
  const { AUDIO, fake } = bootFake();
  AUDIO.init();
  const ac = fake.ctxs[0];
  for (const n in want) {
    ac.currentTime += 2;
    const before = fake.count.total;
    T.ok(AUDIO.sfx(n, { vel: 0.8, n: 2, pitch: 1.1 }), n + ' plays');
    T.ok(fake.count.total > before, n + ' makes nodes');
    T.eq(AUDIO.mix.tier(n), want[n], `${n} is ${want[n]}`);
  }
  ac.currentTime += 2; T.ok(AUDIO.sfx('cabRoll'), 'a reel tick');
  T.eq(AUDIO.sfx('cabRoll'), false, 'the reel ticks are throttled');
  ac.currentTime += 2; T.ok(AUDIO.sfx('cabFever'), 'the fever');
  ac.currentTime += 0.3; T.eq(AUDIO.sfx('cabFever'), false, 'a second fever right after is held back');
  // as heard: each inside its tier's window (the renderer's numbers, printed for the trims)
  const M = boot({ only: ['util', 'audio'] }).AUDIO;
  const lv = [];
  for (const n in want) {
    const r = mixRenderSfx(M, n), t = M.mix.tier(n), lo = M.mix.TARGET[t] - M.mix.WIN - 1, hi = M.mix.TARGET[t] + M.mix.WIN + 2.5;
    lv.push(n + ' ' + r.st.toFixed(1) + ' (' + t + ' ' + M.mix.TARGET[t] + ')');
    T.ok(r.st >= lo && r.st <= hi, `${n} sits in its ${t} tier: ${r.st.toFixed(1)} dB in ${lo}..${hi}`);
    T.ok(r.peak < 0, `${n} never clips (${r.peak.toFixed(1)} dBFS)`);
  }
  if (process.env.CAB_LEVELS) console.log('cab levels: ' + lv.join(' | '));
  // the load and a streak scale inside their voices
  T.ok(mixRenderSfx(M, 'cabCreak', { vel: 1.1 }).st > mixRenderSfx(M, 'cabCreak', { vel: 0.2 }).st + 2, 'a heavier load creaks louder');
  T.ok(mixRenderSfx(M, 'cabPerfect', { n: 1 }).st > -80 && mixRenderSfx(M, 'cabPerfect', { n: 4 }).st > -80, 'a PERFECT streak still chimes');
});

T.done();
