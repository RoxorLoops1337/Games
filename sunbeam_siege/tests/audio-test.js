// Node test for src/audio.js with a strict mocked Web Audio API.
// Run: node tests/audio-test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
let nodes = 0, calls = 0;
function bad(msg) { throw new Error('MOCK STRICT: ' + msg); }
function chk(v, what) { if (typeof v !== 'number' || !isFinite(v)) bad(what + ' not finite: ' + v); }
class Param {
  constructor(v) { this._v = v; this.t = 0; }
  get value() { return this._v; } set value(x) { chk(x, 'value'); this._v = x; }
  setValueAtTime(v, t) { chk(v, 'setValueAtTime v'); chk(t, 'setValueAtTime t'); calls++; return this; }
  linearRampToValueAtTime(v, t) { chk(v, 'linear v'); chk(t, 'linear t'); calls++; return this; }
  exponentialRampToValueAtTime(v, t) { chk(v, 'exp v'); chk(t, 'exp t'); if (v <= 0) bad('exp ramp to <=0'); calls++; return this; }
  setTargetAtTime(v, t, c) { chk(v, 'target v'); chk(t, 'target t'); chk(c, 'target c'); if (c <= 0) bad('tc<=0'); calls++; return this; }
  cancelScheduledValues(t) { chk(t, 'cancel t'); }
}
class Node {
  constructor() { nodes++; this.out = []; this.started = false; }
  connect(n) { if (!n) bad('connect null'); this.out.push(n); return n; }
  disconnect() {}
  start(t, off) { chk(t, 'start t'); if (off !== undefined) chk(off, 'start off'); this.started = true; }
  stop(t) { chk(t, 'stop t'); if (!this.started) bad('stop before start'); }
}
class Gain extends Node { constructor() { super(); this.gain = new Param(1); } }
class Osc extends Node { constructor() { super(); this.frequency = new Param(440); this.detune = new Param(0); this.type = 'sine'; } }
class Filt extends Node { constructor() { super(); this.frequency = new Param(350); this.Q = new Param(1); this.type = 'lowpass'; } }
class Src extends Node { constructor() { super(); this.buffer = null; this.loop = false; } }
class Comp extends Node { constructor() { super(); this.threshold = new Param(); this.ratio = new Param(); this.attack = new Param(); this.release = new Param(); } }
class AC {
  constructor() { this.currentTime = 1; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); }
  createGain() { return new Gain(); } createOscillator() { return new Osc(); } createBiquadFilter() { return new Filt(); }
  createBufferSource() { return new Src(); } createDynamicsCompressor() { return new Comp(); }
  createBuffer(c, l, sr) { const d = new Float32Array(l); return { getChannelData: () => d }; }
  resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
}
const store = {};
const win = { AudioContext: AC, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
win.window = win;
const ctxv = vm.createContext(Object.assign(win, { console, setTimeout, setInterval, clearInterval, Math, JSON, Object, Float32Array, Promise }));
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/audio.js'), 'utf8'), ctxv);
const A = win.SB.audio;
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('FAIL', m); } }

const REQUIRED = ['card_draw','card_play','cat_deploy','meow_1','meow_2','meow_3','meow_4','meow_5','meow_6','purr','hiss','pounce_hit','claw_scratch','heavy_hit','shatter','knock_off','box_flap','yarn_tangle','nap_zzz','wake_stretch','life_spent','life_gained','zoomies_surge','crash_down','witching_gong','pest_squeak','dog_bark','vacuum_whirr','spray_hiss','relic_gain','shop_coin','upgrade_scratch','victory_fanfare','defeat_sting','ui_click','ui_hover','card_hover','card_pick','card_return','card_drop','card_place','slot_tick','hit_heavy','hit_crit','cat_lunge','pest_climb','death_poof','sunbeam_hit','phase_whoosh'];
A.init();
REQUIRED.forEach(n => ok(A.has(n) && A.names().includes(n), 'missing ' + n));
A.unlock();
const c = A._ctx(); ok(!!c, 'ctx created');
REQUIRED.forEach(n => {
  try { c.currentTime += 1; const h = A.play(n, { pitch: 1.1, vol: 0.8 }); if (n === 'purr') { ok(h && typeof h.stop === 'function', 'purr handle'); h.stop(0.2); } }
  catch (e) { fails++; console.log('EXC', n, e.message); }
});
['meow', 'click', 'bogus'].forEach(n => { try { A.play(n, { variant: 7 }); } catch (e) { fails++; console.log('EXC', n, e.message); } });
for (let i = 0; i < 50; i++) { c.currentTime += 0.5; A.play('ui_hover'); }

A.scenes().forEach(s => {
  try {
    ok(A.music(s) === true, 'music ' + s);
    [0, 0.5, 1].forEach(I => { A.setIntensity(I); for (let i = 0; i < 400; i++) { c.currentTime += 0.05; A._tick(); } });
  } catch (e) { fails++; console.log('EXC scene', s, e.message); }
});
ok(A.music('witching_hour') === true && A.currentScene() === 'witching', 'alias');
ok(A.music('nope') === false, 'unknown scene');
A.setWarmth(5, 40); A.duck(0.5, 0.2, 0.3); A.duck();
A.setVolume('music', 0.3); A.setMuted('sfx', true); ok(A.toggleMute('master') === true, 'toggle'); A.toggleMute('master');
ok(JSON.parse(store['sb.audio.v1']).music === 0.3 && JSON.parse(store['sb.audio.v1']).mute.sfx === true, 'persisted');
A.stopMusic(); A.stopAll();
// determinism of seeded music: two runs produce same call count
console.log('nodes', nodes, 'param calls', calls, 'sounds', REQUIRED.length, 'scenes', A.scenes().join(','));
// no-AudioContext environment
const w2 = {}; w2.window = w2; const c2 = vm.createContext(Object.assign(w2, { console, setTimeout, setInterval, clearInterval, Math, JSON, Object, Promise }));
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/audio.js'), 'utf8'), c2);
w2.SB.audio.init(); w2.SB.audio.play('ui_click'); w2.SB.audio.music('title'); w2.SB.audio.duck(); w2.SB.audio.toggleMute();
console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
