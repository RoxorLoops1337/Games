// Stacking Cats: headless tests for the soundtrack (per theme and mode). We cannot listen here, so besides running the
// scheduler against a fake Web Audio clock we check that the generated music is structurally sane.
import assert from 'node:assert/strict';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
class FakeAudio {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; this.calls = 0; }
  resume() {}
  node() { this.calls++; return { connect() {}, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), type: '', buffer: null }; }
  createGain() { return this.node(); } createOscillator() { return this.node(); } createBiquadFilter() { return this.node(); } createBufferSource() { return this.node(); }
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
}
globalThis.window = { AudioContext: FakeAudio };
globalThis.document = { hidden: false };
const { Sfx, songInfo, THEME_COUNT, MUSIC_MODES, MUSIC_VOICE_CAP } = await import('../stacking_cats/audio.js');

function fresh() { const s = new Sfx(); s.unlock(); s.noteLog = []; return s; }
function run(s, seconds, dt = 0.025) { for (let x = 0; x < seconds; x += dt) { s.ctx.currentTime += dt; s.pump(); } }
function done(s) { s.stopMusic(); }

t('theme count matches the game themes', () => {
  assert.equal(THEME_COUNT, 6);
  assert.deepEqual(MUSIC_MODES, ['calm', 'fight', 'boss']);
});

t('every theme and mode: tempo, key range, note lengths and 16 bar form are sane', () => {
  for (let th = 0; th < THEME_COUNT; th++) for (const mode of MUSIC_MODES) {
    const sg = songInfo(th, mode), id = `${th}/${mode}`;
    assert.ok(sg.def.bpm >= 70 && sg.def.bpm <= 150, id + ' bpm ' + sg.def.bpm);
    assert.equal(sg.bars.length, 16, id);
    assert.equal(sg.chords.length, 8, id);
    const barDur = 16 * sg.spb;
    let melodic = 0, mel = 0;
    for (const bar of sg.bars) {
      assert.equal(bar.length, 16, id);
      for (const step of bar) for (const e of step) {
        assert.ok(e.dur > 0 && e.dur <= barDur + 1e-9, `${id} note ${e.k} longer than a bar: ${e.dur}`);
        assert.ok(e.v > 0 && e.v < 0.5, id + ' volume ' + e.v);
        if (e.f) { melodic++; assert.ok(e.f >= 35 && e.f <= 3600, `${id} ${e.k} pitch out of range ${e.f}`); }
        if (e.k === 'mel') mel++;
      }
    }
    assert.ok(melodic > 40, id + ' has notes');
    assert.ok(mel >= 12, id + ' has a lead melody');
  }
});

t('chord progressions repeat after 8 bars, the melody does not (A A B A)', () => {
  const sig = (bar, kinds) => JSON.stringify(bar.flatMap((st, s) => st.filter((e) => kinds.includes(e.k)).map((e) => [s, e.k, +e.f.toFixed(2), +e.dur.toFixed(4)])));
  for (let th = 0; th < THEME_COUNT; th++) for (const mode of MUSIC_MODES) {
    const sg = songInfo(th, mode);
    for (let b = 0; b < 8; b++) assert.equal(sig(sg.bars[b], ['bass', 'pad', 'arp']), sig(sg.bars[b + 8], ['bass', 'pad', 'arp']), `${th}/${mode} bar ${b}`);
    const mp = (a, b) => sig(sg.bars[a], ['mel']) === sig(sg.bars[b], ['mel']);
    let same = 0;
    for (let b = 0; b < 8; b++) if (mp(b, b + 8)) same++;
    assert.ok(same < 8, `${th}/${mode} melody should vary between the two halves`);
    // phrase B (bars 8 to 11) differs from phrase A (bars 0 to 3)
    assert.ok(![0, 1, 2, 3].every((b) => mp(b, b + 8)), `${th}/${mode} phrase B differs from A`);
    // A and A' share a rhythm (same note onsets in the first three bars)
    const onsets = (b) => JSON.stringify(sg.bars[b].map((st) => st.filter((e) => e.k === 'mel').length));
    for (let b = 0; b < 3; b++) assert.equal(onsets(b), onsets(b + 4), `${th}/${mode} A repeats its rhythm`);
  }
});

t('each theme has its own identity and boss differs from fight', () => {
  const ids = new Set();
  for (let th = 0; th < THEME_COUNT; th++) for (const mode of MUSIC_MODES) {
    const d = songInfo(th, mode).def;
    ids.add([mode, d.bpm, d.root, d.lead, d.scale.join(), d.bassInst].join('|'));
  }
  assert.equal(ids.size, THEME_COUNT * 3, 'all 18 songs are distinct');
  for (let th = 0; th < THEME_COUNT; th++) {
    const c = songInfo(th, 'calm').def, f = songInfo(th, 'fight').def, b = songInfo(th, 'boss').def;
    assert.ok(f.bpm > c.bpm, 'fight faster than calm ' + th);
    assert.equal(c.drums, 0); assert.equal(f.drums, 1); assert.equal(b.drums, 2);
    assert.notEqual(b.scale.join(), f.scale.join(), 'boss scale differs from fight ' + th);
    assert.notEqual(b.bass, f.bass);
  }
  const leads = new Set([0, 1, 2, 3, 4, 5].map((th) => songInfo(th, 'calm').def.lead));
  assert.ok(leads.size >= 5, 'calm leads use different timbres');
});

t('scheduler runs every theme and mode: notes are scheduled, voices stay under the cap', () => {
  for (let th = 0; th < THEME_COUNT; th++) for (const mode of MUSIC_MODES) {
    const s = fresh();
    s.setTheme(th); s.music(mode);
    for (const lv of [0, 0.4, 0.7, 1]) { s.setIntensity(lv); run(s, 3); }
    assert.ok(s.noteLog.length > 20, `${th}/${mode} scheduled ${s.noteLog.length}`);
    assert.ok(s.noteLog.every((x) => x.t >= 0 && x.dur > 0));
    assert.ok(s.peakVoices <= Math.ceil(MUSIC_VOICE_CAP * 1.25), `${th}/${mode} voices ${s.peakVoices}`);
    done(s);
  }
});

t('notes are scheduled ahead of the clock but never far ahead', () => {
  const s = fresh(); s.music('fight');
  for (let i = 0; i < 200; i++) { s.ctx.currentTime += 0.025; s.pump(); }
  const ahead = Math.max(...s.noteLog.map((x) => x.t)) - s.ctx.currentTime;
  assert.ok(ahead < 0.5, 'look ahead ' + ahead);
  done(s);
});

t('intensity adds layers and is clamped', () => {
  const count = (lv) => { const s = fresh(); s.setIntensity(lv); s.music('fight'); run(s, 8); const c = s.noteLog.length; done(s); return c; };
  assert.ok(count(1) > count(0), 'high combo adds hats and arpeggio');
  const s = fresh();
  s.setIntensity(5); assert.equal(s.intensity, 1);
  s.setIntensity(-2); assert.equal(s.intensity, 0);
  s.setIntensity(NaN); assert.equal(s.intensity, 0);
});

t('switching mode and theme mid song waits for the bar line and crossfades', () => {
  const s = fresh();
  s.setTheme(0); s.music('calm'); run(s, 2.2);
  assert.equal(s.songKey, '0calm');
  const busA = s.bus;
  s.music('fight'); s.setTheme(2);
  // not switched yet unless a bar line happened to fall exactly here; run past one calm bar
  run(s, 4.5);
  assert.equal(s.songKey, '2fight');
  assert.notEqual(s.bus, busA, 'new bus');
  assert.ok(s.noteLog.some((x) => x.song === '2fight'));
  s.music('boss'); run(s, 4);
  assert.equal(s.songKey, '2boss');
  for (let th = 0; th < THEME_COUNT; th++) { s.setTheme(th); run(s, 2.5); }
  assert.ok(s.peakVoices <= Math.ceil(MUSIC_VOICE_CAP * 1.25));
  done(s);
});

t('setTheme never throws on bad input and wraps', () => {
  const s = new Sfx();
  for (const v of [undefined, null, NaN, -1, 99, 2.7, 'x', {}]) s.setTheme(v);
  s.setTheme(7); assert.equal(s.theme, 1);
  s.setTheme(-1); assert.equal(s.theme, 5);
  assert.doesNotThrow(() => s.music('calm'));   // before unlock: silent
  assert.doesNotThrow(() => s.stopMusic());
  assert.doesNotThrow(() => s.play('boom'));
});

t('nothing is scheduled after stop, and music can start again', () => {
  const s = fresh(); s.music('boss'); run(s, 2);
  s.stopMusic();
  const calls = s.ctx.calls, notes = s.noteLog.length;
  run(s, 5);
  assert.equal(s.ctx.calls, calls); assert.equal(s.noteLog.length, notes); assert.equal(s.timer, 0);
  s.music('calm'); run(s, 2);
  assert.ok(s.noteLog.length > notes, 'restarts');
  done(s);
});

t('page hidden pauses the scheduler, visible again resumes it', () => {
  let handler = null;
  document.addEventListener = (ev, fn) => { if (ev === 'visibilitychange') handler = fn; };
  const s = fresh(); s.music('fight'); run(s, 1);
  assert.ok(handler, 'visibility hook installed');
  document.hidden = true; handler();
  assert.equal(s.timer, 0, 'timer cleared while hidden');
  const calls = s.ctx.calls; run(s, 3);
  assert.equal(s.ctx.calls, calls, 'no scheduling while hidden');
  document.hidden = false; handler();
  assert.ok(s.timer, 'timer back'); run(s, 1);
  assert.ok(s.ctx.calls > calls);
  done(s); delete document.addEventListener;
});

t('music off or sfx off schedules nothing; big effects duck the music', () => {
  const s = fresh(); s.musicOn = false; s.music('calm'); run(s, 2);
  assert.equal(s.noteLog.length, 0);
  s.musicOn = true; run(s, 2);
  assert.ok(s.noteLog.length > 0);
  let dipped = 0; const gp = s.duck.gain, orig = gp.linearRampToValueAtTime;
  gp.linearRampToValueAtTime = function (v) { if (v < 1) dipped++; return orig.apply(this, arguments); };
  s.last.boom = 0; s.play('boom'); s.last.roar = 0; s.ctx.currentTime += 0.5; s.play('roar');
  assert.ok(dipped >= 2, 'ducked ' + dipped);
  done(s);
});

console.log(`${n} music tests passed`);
