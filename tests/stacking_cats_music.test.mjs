// Stacking Cats: headless tests for the soundtrack (per theme and mode). We cannot listen here, so besides running the
// scheduler against a fake Web Audio clock we check that the generated music is structurally sane.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
class FakeAudio {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; this.calls = 0; }
  resume() {}
  node() { this.calls++; return { connect() {}, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), playbackRate: param(), detune: param(), type: '', buffer: null }; }
  createGain() { return this.node(); } createOscillator() { return this.node(); } createBiquadFilter() { return this.node(); } createBufferSource() { return this.node(); }
  decodeAudioData(ab, ok, bad) { const p = ab && ab.byteLength > 16 ? Promise.resolve({ duration: 27.6, sampleRate: 24000, length: 662248, numberOfChannels: 1 }) : Promise.reject(new Error('bad data')); if (ok) p.then(ok, bad); return p; }
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
  s.last.boom = -1e9; s.play('boom'); s.last.roar = -1e9; s.ctx.currentTime += 0.5; s.play('roar');
  assert.ok(dipped >= 2, 'ducked ' + dipped);
  done(s);
});


// ---- the recorded meows: the bank, the pure helpers, and the sample paths of the engine
const { MEOW_CLIPS, MEOW_BANK } = await import('../stacking_cats/meow_bank.js');
const mv = await import('../stacking_cats/meow_voice.js');
const wav = readFileSync(new URL('../stacking_cats/meows.wav', import.meta.url));
const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) >> 1);
const clipData = (c) => Array.from(pcm.subarray(c.at, c.at + c.len), (v) => v / 32768);
const rmsOf = (a) => Math.sqrt(a.reduce((s2, v) => s2 + v * v, 0) / a.length);

t('meows.wav is a mono 16 bit file and every clip sits inside it, in order, with silent guards between', () => {
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF'); assert.equal(wav.toString('latin1', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1, 'mono'); assert.equal(wav.readUInt32LE(24), MEOW_BANK.rate); assert.equal(wav.readUInt16LE(34), 16);
  assert.ok(MEOW_CLIPS.length >= 25, 'clips: ' + MEOW_CLIPS.length);
  assert.equal(new Set(MEOW_CLIPS.map((c) => c.id)).size, MEOW_CLIPS.length, 'unique ids');
  let end = 0;
  for (const c of MEOW_CLIPS) {
    assert.ok(c.at >= end && c.at + c.len <= pcm.length, c.id + ' inside the file');
    for (let i = end; i < c.at; i++) assert.equal(pcm[i], 0, c.id + ' guard before the clip is silent');
    end = c.at + c.len;
    assert.ok(c.len / MEOW_BANK.rate >= 0.5 && c.len / MEOW_BANK.rate <= 1.6, c.id + ' length');
  }
});

t('every clip is cut tight: sound right at both ends, faded so nothing clicks, no long silence inside', () => {
  const sr = MEOW_BANK.rate, ms = sr / 1000;
  for (const c of MEOW_CLIPS) {
    const x = clipData(c);
    assert.ok(Math.abs(x[0]) < 0.003 && Math.abs(x[x.length - 1]) < 0.003, c.id + ' starts and ends at zero (no click)');
    let a = 0, b = x.length - 1;
    while (Math.abs(x[a]) < 0.02) a++;
    while (Math.abs(x[b]) < 0.02) b--;
    assert.ok(a / ms <= 75, c.id + ' has ' + (a / ms).toFixed(0) + ' ms before the first real sound');
    assert.ok((x.length - 1 - b) / ms <= 100, c.id + ' has ' + ((x.length - 1 - b) / ms).toFixed(0) + ' ms after the last real sound');
    let run = 0, worst = 0;
    for (const v of x) { if (Math.abs(v) < 0.004) { run++; worst = Math.max(worst, run); } else run = 0; }
    assert.ok(worst < 60 * ms, c.id + ' silent stretch of ' + (worst / ms).toFixed(0) + ' ms');
  }
});

t('every clip is level matched and none clips', () => {
  for (const c of MEOW_CLIPS) {
    const x = clipData(c), peak = Math.max(...x.map(Math.abs));
    assert.ok(peak <= 0.86 && peak > 0.15, c.id + ' peak ' + peak.toFixed(3));
    const loud = x.filter((v) => Math.abs(v) > 0.02);
    const db = 20 * Math.log10(rmsOf(loud));
    assert.ok(db > -23.5 && db < -14.5, c.id + ' loudness ' + db.toFixed(1) + ' dB');
  }
});

t('the bank has tonal, short, long and sung meows and a noisy one for drums', () => {
  for (const tag of ['tone', 'short', 'long', 'sing', 'noisy']) assert.ok(MEOW_CLIPS.some((c) => c.tags.includes(tag)), tag);
  for (const c of MEOW_CLIPS.filter((c2) => c2.tags.includes('tone'))) assert.ok(c.f0 >= 200 && c.f0 <= 1200, c.id + ' f0 ' + c.f0);
});

t('meowPlan: stable per cat and mood, every cat has its own pitch, moods shift it the right way', () => {
  const ids = ['tabby', 'mochi', 'leo', 'pearl', 'zeus', 'nori', 'biscuit', 'hexa'];
  for (const id of ids) {
    const a = mv.meowPlan(id, 'pick', 0.5), b = mv.meowPlan(id, 'pick', 0.5);
    assert.deepEqual(a, b, 'deterministic');
    for (const k of ['pick', 'happy', 'cheer', 'sad', 'worried', 'nope']) { const p = mv.meowPlan(id, k, 0.3); assert.ok(p.clip && p.rate >= 0.5 && p.rate <= 2.2 && p.gain > 0, id + k); }
    assert.ok(mv.meowPlan(id, 'cheer').rate > mv.meowPlan(id, 'pick').rate && mv.meowPlan(id, 'sad').rate < mv.meowPlan(id, 'pick').rate, 'cheer is higher and sad is lower');
    assert.ok(mv.meowPlan(id, 'worried').wobble > 0 && mv.meowPlan(id, 'pick').wobble === 0, 'worried wobbles');
    assert.ok(Math.abs(mv.meowPlan(id, 'pick', 0).rate / mv.meowPlan(id, 'pick', 1).rate - 1) < 0.06, 'a repeat tap only wobbles the pitch a little');
  }
  assert.ok(new Set(ids.map((id) => mv.catPitch(id).toFixed(3))).size === ids.length, 'distinct pitches');
  assert.ok(mv.MEOW_MOODS.pick.gain <= 0.7, 'never louder than the synth meow');
});

t('clipForNote picks the closest recording and a sane playback rate, or nothing out of range', () => {
  for (const f of [262, 330, 440, 523, 660, 880, 1046]) { const r = mv.clipForNote(f); assert.ok(r && r.rate >= 0.5 && r.rate <= 2.2, f + ''); assert.ok(Math.abs(r.clip.f0 * r.rate - f) < 0.5, 'lands on the note'); }
  assert.ok(Math.abs(mv.clipForNote(500).rate - 1) < 0.15, '500 Hz needs hardly any shift');
  assert.equal(mv.clipForNote(0), null); assert.equal(mv.clipForNote(60), null); assert.equal(mv.clipForNote(9000), null);
  const first = mv.clipForNote(520), other = mv.clipForNote(520, first.clip.id);
  assert.notEqual(other.clip.id, first.clip.id, 'a different clip can be asked for, so a run of equal notes is not one recording');
});

const withBank = () => { const s = fresh(); s.meowBuf = { duration: 27.6, sampleRate: 24000, length: 662248, numberOfChannels: 1 }; return s; };
const sources = (s) => { const log = []; const orig = s.ctx.createBufferSource.bind(s.ctx); s.ctx.createBufferSource = () => { const nd = orig(); nd.buffer = null; const o = { n: nd, args: [], stopAt: null }; log.push(o); const st = nd.start; nd.start = (...a) => { o.args = a; return st && st.apply(nd, a); }; const sp = nd.stop; nd.stop = (a) => { o.stopAt = a; return sp && sp.apply(nd, [a]); }; return nd; }; return log; };

t('with the bank loaded a cat meow plays the real recording at its offset, pitch and length', () => {
  const s = withBank(); const log = sources(s); s.ctx.currentTime = 5; s.meow('tabby', 'pick');
  const rec = log.filter((l) => l.n.buffer === s.meowBuf);
  assert.equal(rec.length, 1, 'one sample source');
  const plan = mv.meowPlan('tabby', 'pick', 0.5), [when, offset] = rec[0].args;
  assert.ok(Math.abs(when - 5) < 1e-6 && Math.abs(offset - plan.clip.at / MEOW_BANK.rate) < 1e-6, 'starts at the clip');
  const secs = plan.clip.len / MEOW_BANK.rate / plan.rate;
  assert.ok(rec[0].stopAt > when + secs * 0.9 && rec[0].stopAt < when + secs + 0.2, 'stops when the clip ends: ' + (rec[0].stopAt - when).toFixed(2) + ' vs ' + secs.toFixed(2));
  assert.ok(rec[0].n.playbackRate.value > 0.5 && rec[0].n.playbackRate.value < 2.3);
  s.meowsOn = false; s.ctx.currentTime += 1; s.meow('tabby', 'pick'); assert.equal(log.filter((l) => l.n.buffer === s.meowBuf).length, 1, 'switched off: nothing more');
});

t('without the bank the synth meow is still used (the file is still loading or offline)', () => {
  const s = fresh(); const log = sources(s); s.ctx.currentTime = 3; const before = s.ctx.calls; s.meow('tabby', 'pick');
  assert.equal(log.filter((l) => s.meowBuf && l.n.buffer === s.meowBuf).length, 0);
  assert.ok(s.ctx.calls - before > 6, 'oscillators and filters were made: ' + s.ctx.calls);
});

await (async () => {
  const s = fresh();
  assert.ok(!s.meowBuf, 'not loaded yet');
  assert.equal(await s.setMeowBank(new ArrayBuffer(64)), true); assert.ok(s.meowBuf && s.meowBuf.duration > 1, 'decoded');
  const bad = fresh(); assert.equal(await bad.setMeowBank(new ArrayBuffer(4)), false); assert.ok(!bad.meowBuf, 'a broken file leaves the synth in charge');
  assert.equal(await new Sfx().setMeowBank(new ArrayBuffer(64)), false, 'no audio context, no crash');
  n++; console.log('ok the bank decodes into one buffer, and a broken or missing file never throws');
})();

t('some songs sing with the meows and fall back to their own lead until the bank has loaded', () => {
  const withMew = []; 
  for (let th = 0; th < THEME_COUNT; th++) for (const mode of MUSIC_MODES) { const sg = songInfo(th, mode); if (sg.def.mew) withMew.push(`${th}/${mode}`); }
  assert.ok(withMew.length >= 5 && withMew.length <= 9, 'meow songs: ' + withMew.join(','));
  assert.ok(withMew.some((k) => k.endsWith('calm')) && withMew.some((k) => k.endsWith('fight')), 'calm and fight both');
  const th = +withMew.find((k) => k.endsWith('calm')).split('/')[0];
  const plain = fresh(); plain.setTheme(th); plain.music('calm'); run(plain, 12);
  assert.ok(!plain.noteLog.some((e) => e.inst === 'mewlead') && plain.noteLog.some((e) => e.inst === plain_lead(th, 'calm')), 'oscillator lead before the bank is there');
  const s = withBank(); const log = sources(s); s.setTheme(th); s.music('calm'); run(s, 12);
  const mel = s.noteLog.filter((e) => e.inst === 'mewlead');
  assert.ok(mel.length >= 6, 'meow notes: ' + mel.length);
  const used = log.filter((l) => l.n.buffer === s.meowBuf);
  assert.ok(used.length >= mel.length * 0.9, 'a recording per meow note');
  for (const l of used) { const r = l.n.playbackRate.value; assert.ok(r >= 0.5 && r <= 2.3, 'rate ' + r); assert.ok(l.args[1] >= 0 && l.args[1] < 27.6, 'offset inside the bank'); }
  done(s); done(plain);
});
function plain_lead(th, mode) { return songInfo(th, mode).def.lead; }

t('the meow drum kit plays kick, snare and hat from recordings in kit songs only', () => {
  let kitSong = null;
  for (let th = 0; th < THEME_COUNT && !kitSong; th++) { const sg = songInfo(th, 'fight'); if (sg.def.mewKit) kitSong = th; }
  assert.notEqual(kitSong, null, 'a fight song has the kit');
  const s = withBank(); const log = sources(s); s.setTheme(kitSong); s.music('fight'); run(s, 8);
  const drums = s.noteLog.filter((e) => ['kick', 'snare', 'hat'].includes(e.inst)).length, samp = log.filter((l) => l.n.buffer === s.meowBuf).length;
  assert.ok(drums > 20 && samp >= drums * 0.9, `drums ${drums} sampled ${samp}`);
  done(s);
  let plainSong = null;
  for (let th = 0; th < THEME_COUNT && plainSong === null; th++) { const sg = songInfo(th, 'fight'); if (!sg.def.mewKit && !sg.def.mew) plainSong = th; }
  const p = withBank(); const plog = sources(p); p.setTheme(plainSong); p.music('fight'); run(p, 8);
  assert.equal(plog.filter((l) => l.n.buffer === p.meowBuf).length, 0, 'other songs keep their synth drums');
  done(p);
});

t('the sample voices respect the voice budget and never exceed it', () => {
  const s = withBank(); sources(s); s.setTheme(3); s.music('fight'); s.setIntensity(1); run(s, 40);
  assert.ok(s.peakVoices <= MUSIC_VOICE_CAP * 1.25 + 1, 'peak voices ' + s.peakVoices);
  done(s);
});

console.log(`${n} music tests passed`);
