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
  T.ok(played > 20 && played <= 40, `voice cap limits a flood of long voices (${played})`);
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

T.done();
