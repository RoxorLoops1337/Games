// Batch 16 g: voice clips (pure logic, save, wiring, no em dash)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const V = await import(join(root, 'voice_b16g.js'));
const sim = await import(join(root, 'sim.js'));
const U = await import(join(root, 'unlock_b12p.js'));
const rd = f => readFileSync(join(root, f), 'utf8');
const EM = String.fromCharCode(0x2014);

assert.equal(V.STINGS.length, 5);
for (const s of V.STINGS) assert.ok(V.recipe(s.id).length > 0, 'recipe ' + s.id);
assert.deepEqual(V.sanitizeVoice(null), { got: {}, n: 0 });
assert.deepEqual(V.sanitizeVoice({ got: { kick: 1, bogus: 1 }, n: -4 }), { got: { kick: 1 }, n: 0 });
const sv = sim.sanitizeSave({});
assert.deepEqual(sv.voice, { got: {}, n: 0 }, 'fresh save has voice');
assert.ok(sim.sanitizeSave({ voice: { got: { yeah: 1, x: 1 } } }).voice.got.yeah === 1);
assert.deepEqual(V.voiceCollect(sv), [], 'nothing earned on a fresh account');
sv.cleared = 8; sv.runs = 7;
assert.deepEqual(V.voiceCollect(sv).sort(), ['hat', 'kick', 'uh']);
assert.deepEqual(V.voiceCollect(sv), [], 'collected once');
assert.equal(V.stingFor('clear', sv), 'uh');
sv.cleared = 20; assert.equal(V.stingFor('clear', sv), 'yeah');
assert.equal(V.stingFor('nope', sv), null);
assert.equal(V.stingFor('besttime', sim.sanitizeSave({})), null);
const fresh = c => ({ cleared: c, unlocked: { legacy: 0, seen: {} } });
assert.ok(U.unlockInfo('voice') && !U.isUnlocked('voice', fresh(3)) && U.isUnlocked('voice', fresh(4)));

// synth wiring with a fake context
const calls = [];
const mk = () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, Q: {}, connect() {}, start() {}, stop() {} });
const ac = { currentTime: 0, createOscillator: mk, createGain: mk, createBiquadFilter: mk };
const sfx = {};
V.registerB16g(sfx, (...a) => calls.push(['tone', ...a]), (...a) => calls.push(['noise', ...a]), () => {}, () => true, { ac: () => ac, out: () => ({}), muted: () => false });
sfx.voice({ id: 'kick' });
assert.ok(calls.some(c => c[0] === 'tone') && calls.some(c => c[0] === 'noise'));
sfx.voice({ id: 'yeah' }); sfx.voice({ id: 'uh' }); sfx.voice({ id: 'zzz' });
assert.equal(V.voiceFilesOn(), false, 'real files are opt in');

// bindVoice answers moments once per gap
const played = [];
const au = { play: n => { played.push(n); } };
V.bindVoice(au, () => ({ cleared: 20, runs: 9, kills: 999 }));
au.play('clear'); au.play('bossintro');
await new Promise(r => setTimeout(r, 400));
assert.equal(played.filter(n => n === 'voice').length, 1, 'one sting per gap');

// wiring
const m = rd('main.js'), h = rd('hub2.js'), a = rd('audio.js'), ix = rd('index.html');
assert.ok(m.includes('bindVoice(audio') && m.includes('voiceAfterRun(save, audio, toast, persist)'), 'main wiring');
assert.ok(h.includes('voiceCard(s,') && a.includes('registerB16g(sfx'), 'hub and audio wiring');
assert.ok(ix.indexOf('@css:39-g-voice') > 0 && ix.indexOf('@css:39-g-voice') < ix.indexOf('@css:34-phone-hub'), 'css block before phone-hub');
for (const f of ['voice_b16g.js', 'assets/voice/README.md']) assert.ok(!rd(f).includes(EM), 'no em dash in ' + f);
console.log('39_g_voice ok');
