// Clawspire AUDIO suite. Part 1 runs the module the way Node sees it (no
// AudioContext at all): everything must no-op. Part 2 installs a fake
// AudioContext that counts node creation and drives the music scheduler by
// hand through AUDIO._tick().
import { boot, harness } from './clawspire_lib.mjs';

const T = harness('clawspire audio');

const NAMES = ['clawMove', 'clawDrop', 'clawTouch', 'clawClose', 'clawLift', 'clawRelease', 'itemLand',
  'itemSlip', 'chute', 'jackpot', 'hit', 'hitBig', 'block', 'heal', 'poison', 'burn', 'freeze', 'shake',
  'enemyDie', 'playerHurt', 'win', 'lose', 'click', 'buy', 'reveal', 'brush', 'step', 'coin', 'upgrade',
  'turn', 'boss'];
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

T.done();
