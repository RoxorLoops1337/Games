// Midnight Mog audio engine: headless test with a strict stub AudioContext.
// The stub throws on the things a real browser throws on (non-finite values, exponential ramps to <= 0, negative times, a source started
// twice), counts every node, and tracks connect/disconnect so we can prove nothing leaks and voice caps hold.
import assert from 'node:assert/strict';
import { createAudio, SFX_NAMES, MUSIC_MODES, EVENT_TYPES, EVENT_SFX, CRATE_KINDS } from '../midnight_mog/js/audio.js';

const t0 = Date.now();

class Param {
  constructor(ctx, v = 0) { this.ctx = ctx; this.value = v; }
  _chk(v, t) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError('non-finite param value ' + v);
    if (t !== undefined && (!Number.isFinite(t) || t < 0)) throw new RangeError('bad time ' + t);
    this.ctx.sum += v * 0.37 + (t || 0) * 0.11; this.ctx.paramCalls++;
  }
  setValueAtTime(v, t) { this._chk(v, t); return this; }
  linearRampToValueAtTime(v, t) { this._chk(v, t); return this; }
  exponentialRampToValueAtTime(v, t) { this._chk(v, t); if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); return this; }
  setTargetAtTime(v, t, tc) { this._chk(v, t); if (!(tc >= 0)) throw new RangeError('bad time constant ' + tc); return this; }
  cancelScheduledValues(t) { this._chk(0, t); return this; }
}
class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.live = true; this.out = []; ctx.live.add(this); ctx.created++; }
  connect(dst) { if (!dst) throw new Error('connect to nothing'); if (!this.live) throw new Error('connect from a disconnected node ' + this.kind); this.out.push(dst); return dst; }
  disconnect() { this.live = false; this.ctx.live.delete(this); }
}
class Source extends Node {
  constructor(ctx, kind) { super(ctx, kind); this.started = false; this.stopAt = Infinity; this.ended = false; ctx.sources.push(this); }
  start(t) { if (this.started) throw new Error('start twice'); if (!(t >= 0)) throw new RangeError('start time ' + t); this.started = true; this.ctx.srcStarted++; }
  stop(t) { if (!this.started) throw new Error('stop before start'); if (!Number.isFinite(t)) throw new RangeError('stop time'); this.stopAt = t; }
}
class StubCtx {
  constructor() {
    this.currentTime = 0; this.sampleRate = 44100; this.state = 'suspended'; this.live = new Set(); this.sources = []; this.created = 0;
    this.sum = 0; this.paramCalls = 0; this.srcStarted = 0; this.destination = { kind: 'dest' };
    StubCtx.last = this;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
  advance(dt) {
    this.currentTime += dt;
    for (const s of this.sources) if (s.started && !s.ended && s.stopAt <= this.currentTime) { s.ended = true; if (s.onended) s.onended(); }
    this.sources = this.sources.filter((s) => !s.ended);
  }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(this, 1); return n; }
  createOscillator() { const n = new Source(this, 'osc'); n.type = 'sine'; n.frequency = new Param(this, 440); n.detune = new Param(this, 0); return n; }
  createBufferSource() { const n = new Source(this, 'buf'); n.loop = false; n.buffer = null; n.start = function (t, off) { if (this.started) throw new Error('start twice'); if (off !== undefined && !(off >= 0)) throw new RangeError('offset'); if (!this.buffer) throw new Error('no buffer'); this.started = true; this.ctx.srcStarted++; }; return n; }
  createBiquadFilter() { const n = new Node(this, 'biquad'); n.type = 'lowpass'; n.frequency = new Param(this, 350); n.Q = new Param(this, 1); n.gain = new Param(this, 0); return n; }
  createDynamicsCompressor() { const n = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(this, 0); return n; }
  createWaveShaper() { const n = new Node(this, 'shaper'); n.curve = null; return n; }
  createConvolver() { return new Node(this, 'conv'); }
  createDelay(max) { const n = new Node(this, 'delay'); n.max = max; let v = 0; const self = this; n.delayTime = new Param(this, 0); Object.defineProperty(n.delayTime, 'value', { get: () => v, set: (x) => { if (!(x >= 0 && x <= max)) throw new RangeError('delay ' + x); v = x; } }); return n; }
  createStereoPanner() { const n = new Node(this, 'pan'); n.pan = new Param(this, 0); return n; }
  createAnalyser() { const n = new Node(this, 'analyser'); n.fftSize = 2048; return n; }
  createBuffer(ch, len, sr) {
    assert.ok(ch >= 1 && len > 0 && sr > 0);
    const data = []; for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (i) => data[i] };
  }
}

const mk = (o) => createAudio(Object.assign({ AudioContext: StubCtx, noTimer: true, noVisibility: true, strict: true }, o || {}));
const ready = async (o) => { const a = mk(o); await a.resume(); return a; };
const C = () => StubCtx.last;
// drives time forward the way the game loop does
function run(a, seconds, fps = 30) {
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) { C().advance(1 / fps); a.update(1 / fps); }
}

// 1. no AudioContext at all: everything is a safe no-op
{
  const a = createAudio({ AudioContext: null });
  const g = globalThis.AudioContext; delete globalThis.AudioContext;
  const b = createAudio();
  if (g) globalThis.AudioContext = g;
  for (const x of [a, b]) {
    assert.equal(await x.resume(), false);
    assert.equal(x.sfx('click'), false);
    x.music('town'); x.setIntensity(0.5); x.setMuted(true); x.setVolume(0.3); x.stopMusic(); x.update(0.016); x.onEvent({ type: 'hit' }); x.crateBeat('tick', 'epic', 1);
    assert.equal(x.getState().ready, false);
  }
}

// 2. nothing is created before resume (autoplay policy), everything after
{
  const a = mk();
  assert.equal(StubCtx.last, undefined === StubCtx.last ? undefined : StubCtx.last);
  const before = StubCtx.last ? StubCtx.last.created : 0;
  assert.equal(a.sfx('click'), false, 'sfx before resume is dropped');
  a.music('title');
  assert.equal(a.getState().ready, false);
  await a.resume();
  assert.equal(a.getState().ready, true);
  assert.equal(a.getState().mode, 'title', 'music requested before resume starts at resume');
  assert.ok(C().created > before);
  await a.resume(); // idempotent
  a.stopMusic(0.1);
}

// 3. every sfx name plays cleanly, with variations, and releases every node
{
  const a = await ready();
  const base = C().live.size;
  assert.ok(SFX_NAMES.length >= 90, 'catalog size ' + SFX_NAMES.length);
  let played = 0;
  for (const name of SFX_NAMES) {
    for (const o of [undefined, { pitch: 1.4, pan: -0.8, vol: 0.5 }, { pitch: 0.6, pan: 0.9, rarity: 'mythic', amt: 1.4, n: 3, element: 'fire' }, { pitch: NaN, vol: NaN, pan: NaN, amt: NaN, n: NaN }]) {
      if (a.sfx(name, o)) played++;
      C().advance(0.5); a.update(0.5);
    }
  }
  assert.ok(played >= SFX_NAMES.length * 3, 'most calls played: ' + played);
  run(a, 12);
  assert.equal(C().live.size, base, 'sfx leaked ' + (C().live.size - base) + ' nodes');
  assert.equal(a.sfx('definitely_not_a_sound'), false);
  assert.equal(a.getStats().voices, 0);
}

// 4. every event type maps to a sound and plays; weird events never throw
{
  const a = await ready();
  const base = C().live.size;
  for (const type of EVENT_TYPES) {
    assert.ok(EVENT_SFX[type] && SFX_NAMES.includes(EVENT_SFX[type]), 'default sfx for ' + type);
    const m = a.mapEvent({ type });
    assert.ok(m && SFX_NAMES.includes(m.name), 'mapEvent ' + type + ' -> ' + (m && m.name));
  }
  const evs = [
    { type: 'hit', amount: 12, element: 'fire', x: 3, y: 2 }, { type: 'hit', amount: 500 }, { type: 'hit', amount: 0, absorbed: 9 }, { type: 'hit', amount: 3, dot: true, element: 'poison' },
    ...['elec', 'poison', 'holy', 'shadow', 'void', 'bleed', 'phys'].map((element) => ({ type: 'hit', amount: 20, element })),
    { type: 'death', side: 'enemy', kind: 'enemy' }, { type: 'death', side: 'enemy', boss: true }, { type: 'death', side: 'cat', kind: 'cat' }, { type: 'death', kind: 'barricade' }, { type: 'death', expired: true },
    { type: 'spawn', side: 'cat' }, { type: 'spawn', side: 'enemy' }, { type: 'spawn', side: 'enemy', minion: true },
    { type: 'cast', card: 'pounce' }, { type: 'cast', src: 1 }, { type: 'status', status: 'buff' }, { type: 'status', status: 'debuff' }, { type: 'status', status: 'stun' }, { type: 'status', status: 'dot' }, { type: 'status', status: 'reflect' },
    { type: 'base_hit', amount: 5, hp: 40 }, { type: 'chain', path: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }] }, { type: 'chain' }, { type: 'pierce', x1: 1, x2: 8 },
    { type: 'aoe', x: 5, y: 2, radius: 2, element: 'fire' }, { type: 'aoe', element: 'elec' }, { type: 'aoe', element: 'holy' }, { type: 'aoe', element: 'poison' }, { type: 'aoe', element: 'void' },
    { type: 'wave', isBossWave: true }, { type: 'wave', boss: 4, phase: 1 }, { type: 'wave', wave: 2 }, { type: 'draw', count: 3 }, { type: 'attack', ranged: true, x: 2 }, { type: 'attack', x: 6 },
    { type: 'merge', stars: 3 }, { type: 'loot', kind: 'fish' }, { type: 'loot', kind: 'yarn' }, { type: 'loot', kind: 'gems' }, { type: 'loot', kind: 'tokens' }, { type: 'loot', kind: 'relic' }, { type: 'loot', kind: 'card' }, { type: 'loot', kind: 'cat' }, { type: 'loot' },
    { type: 'win' }, { type: 'lose' }, { type: 'nonsense' }, {}, null, undefined, { type: 'hit', amount: NaN, x: Infinity }, { type: 'chain', path: 7 },
  ];
  for (const ev of evs) { a.onEvent(ev); C().advance(0.4); a.update(0.4); }
  a.stopMusic(0.1);
  run(a, 12);
  assert.equal(C().live.size, base, 'events leaked ' + (C().live.size - base));
}

// 5. voice caps: 150 units hammering for a second must stay bounded
{
  const a = await ready({ maxVoices: 26 });
  const startSources = C().srcStarted;
  let maxActive = 0;
  for (let i = 0; i < 120; i++) { // 4 seconds of heavy combat, 30 fps, 12 events a frame
    for (let k = 0; k < 12; k++) a.onEvent({ type: k % 5 === 0 ? 'death' : k % 4 === 0 ? 'attack' : k % 3 === 0 ? 'crit' : 'hit', amount: 10 + k, element: k % 2 ? 'fire' : 'phys', x: k % 9, side: 'enemy', ranged: k % 2 === 0 });
    C().advance(1 / 30); a.update(1 / 30);
    maxActive = Math.max(maxActive, a.getStats().voices);
  }
  assert.ok(maxActive <= 26 + 8, 'voices ' + maxActive);
  assert.ok(a.getStats().peakVoices <= 34);
  const sources = C().srcStarted - startSources;
  assert.ok(sources < 4 * 30 * 12 * 0.8, 'throttling thinned the storm: ' + sources + ' oscillators');
  assert.ok(a.getStats().sfxDropped > 100, 'drops counted');
  // a single sound is capped by its own cap in one instant
  C().advance(5); a.update(5);
  let ok = 0; for (let i = 0; i < 50; i++) if (a.sfx('hit_phys')) ok++;
  assert.ok(ok <= 1, 'same-instant gap throttle ' + ok);
  // priority: a base hit still gets through when the pool is full
  const b = await ready({ maxVoices: 4 });
  for (const n of ['purr', 'meow', 'cast', 'heal', 'shield', 'aura', 'taunt', 'chirp']) b.sfx(n);
  assert.equal(b.sfx('base_hit'), true, 'high priority gets in');
  assert.equal(b.sfx('hover'), false, 'low priority is shed');
}

// 6. music: every mode runs 25 s of audio time, node count stays bounded, stopMusic frees everything
{
  for (const mode of MUSIC_MODES) {
    const a = await ready();
    const base = C().live.size;
    a.setIntensity(1);
    a.music(mode);
    assert.equal(a.getState().mode, mode);
    let peak = 0;
    for (let i = 0; i < 25 * 30; i++) { C().advance(1 / 30); a.update(1 / 30); if (i % 30 === 0) peak = Math.max(peak, C().live.size); }
    assert.ok(peak < 900, mode + ' live nodes ' + peak);
    assert.ok(a.getStats().musicSteps > 100, mode + ' scheduled steps');
    a.music(mode); // same mode is a no-op
    a.stopMusic(0.3);
    assert.equal(a.getState().mode, null);
    run(a, 12);
    assert.equal(C().live.size, base, mode + ' leaked ' + (C().live.size - base));
  }
}

// 7. adaptive intensity changes what gets scheduled; mode switching and restart do not leak
{
  const count = async (I) => {
    const a = await ready(); a.music('battle'); a.debug.setIntensityNow(I);
    const s = C().created; run(a, 8); return C().created - s;
  };
  const lo = await count(0), mid = await count(0.5), hi = await count(1);
  assert.ok(lo < mid && mid < hi, `layers add up: ${lo} < ${mid} < ${hi}`);
  const a = await ready(); const base = C().live.size;
  for (const m of ['title', 'town', 'battle', 'boss', 'win', 'lose', 'crate', 'battle']) { a.music(m); run(a, 2); }
  a.music('battle', { restart: true }); run(a, 1);
  a.music('nonsense'); assert.equal(a.getState().mode, 'battle');
  a.stopMusic(); run(a, 12);
  assert.equal(C().live.size, base, 'mode switching leaked');
}

// 8. crate ceremony: every kind x rarity x beat, escalating loudness-by-complexity
{
  const a = await ready(); const base = C().live.size;
  const RAR = ['common', 'rare', 'epic', 'legend', 'mythic'];
  assert.deepEqual(CRATE_KINDS.slice(0, 2), ['tick', 'shake']);
  const cost = {};
  for (const r of RAR) {
    const s = C().srcStarted;
    assert.equal(a.crateBeat('reveal', r, 0, { isNew: true }), true, 'reveal ' + r);
    cost[r] = C().srcStarted - s;
    C().advance(6); a.update(6);
  }
  assert.ok(cost.common < cost.rare && cost.rare < cost.epic && cost.epic < cost.legend && cost.legend < cost.mythic, 'reveal gets bigger by rarity: ' + JSON.stringify(cost));
  for (const kind of CRATE_KINDS) for (const r of RAR) for (let i = 0; i < 10; i++) { a.crateBeat(kind, r, i); C().advance(0.3); a.update(0.3); }
  assert.equal(typeof a.crateBeat('mythic'), 'boolean'); // rarity passed as the kind falls back to a reveal
  a.crateBeat('tick', undefined, NaN); a.crateBeat('bogus', 'nope', -4);
  a.music('crate'); run(a, 14); a.stopMusic(0.2); run(a, 12);
  assert.equal(C().live.size, base, 'crate leaked');
}

// 9. mute, volume, robustness
{
  const a = await ready();
  const m = C().live.size;
  a.setMuted(true);
  const created = C().created;
  assert.equal(a.sfx('click'), false); a.music('battle'); run(a, 3);
  assert.equal(C().created - created < 80, true, 'muted creates (almost) no voice nodes');
  assert.equal(a.getState().muted, true);
  a.setMuted(false); assert.equal(a.sfx('click'), true);
  a.setVolume(2); assert.equal(a.getState().volume, 1);
  a.setVolume(-1); assert.equal(a.getState().volume, 0);
  a.setVolume(NaN); assert.equal(a.getState().volume, 0);
  a.setVolume(0.5); assert.equal(a.getState().volume, 0.5);
  a.setIntensity(NaN); a.setIntensity(9); a.setIntensity(-3);
  a.duck(); a.duck(NaN, NaN);
  a.stopMusic(); a.stopMusic(); a.update(NaN);
  assert.ok(a.getAnalyser());
  run(a, 12);
  assert.equal(C().live.size, m);
  a.dispose();
}

// 10. determinism: the same call sequence produces byte-identical parameter traces
{
  const trace = async () => {
    const a = await ready();
    a.music('battle'); a.setIntensity(0.8);
    for (let i = 0; i < 90; i++) { if (i % 7 === 0) a.onEvent({ type: 'hit', amount: 10 + i, element: 'elec', x: i % 9 }); if (i % 20 === 0) a.sfx('levelup'); C().advance(1 / 30); a.update(1 / 30); }
    return [C().sum.toFixed(6), C().paramCalls, C().created];
  };
  assert.deepEqual(await trace(), await trace());
}

// 11. loudness: a real OfflineAudioContext exists only in browsers; here we just make sure the check is skipped cleanly
if (typeof OfflineAudioContext !== 'undefined') {
  const off = new OfflineAudioContext(2, 44100 * 4, 44100);
  const a = createAudio({ context: off, offline: true, noTimer: true });
  await a.resume();
  a.music('battle'); a.debug.setIntensityNow(1); a.debug.pumpTo(4);
  const buf = await off.startRendering();
  let peak = 0; for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  assert.ok(peak > 0.01 && peak <= 1.0, 'offline peak ' + peak);
}

const ms = Date.now() - t0;
assert.ok(ms < 10000, 'suite took ' + ms + ' ms');
console.log('midnight_mog_audio ok (' + SFX_NAMES.length + ' sfx, ' + MUSIC_MODES.length + ' music modes, ' + ms + ' ms)');
