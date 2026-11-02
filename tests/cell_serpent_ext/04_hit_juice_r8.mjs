// Hit juice round 8: finishing blow and rung sounds, species head death, muzzle flashes, best-moment data.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const j8 = await import(join(root, 'hit_juice8.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const R = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 9, stage: 4 });
const S = R.state, P = R.hj.pools;

// sound tables: every weapon and species has a recipe, rung pitches climb
for (const id of ['capsule', 'swab', 'daggers', 'tower', 'stick', 'needles', 'satellite', 'maw', 'puppy', 'encore']) assert.ok(j8.FIN_REC[id].length >= 3, 'finish recipe ' + id);
for (const id of ['love', 'rust', 'sneezy', 'grumpy', 'sleepy', 'disco', 'sour', 'mighty', 'frosty', 'gloomy', 'piggy']) assert.ok(j8.DEATH_REC[id].length >= 3, 'death recipe ' + id);
for (let n = 1; n < 8; n++) assert.ok(j8.rungHz(n + 1) > j8.rungHz(n), 'rung pitch climbs');
assert.equal(j8.rungOf(2), 2); assert.equal(j8.rungOf(8), 8); assert.equal(j8.rungOf(9), 1);
const sfx = {}; j8.registerHj8(sfx, () => {}, () => {}, () => {}, () => true);
for (const n of ['fin_daggers', 'fin_capsule', 'death_frosty', 'death_gloomy', 'rung1', 'rung8']) { assert.equal(typeof sfx[n], 'function', n); sfx[n](); }

// events queue the sounds: a head kill right after a needle hit asks for the needle finish and the species death
const q = () => R.takeSounds();
q();
R.onEvent({ t: 'hit', x: 300, y: 400, d: 5, crit: false, src: 'needles', s: {} }, g);
R.onEvent({ t: 'kill', x: 300, y: 400, r: 30, kind: 'normal', skin: 'frosty', head: true }, g);
const snd = q();
assert.ok(snd.includes('fin_needles') && snd.includes('death_frosty'), 'finish and death sounds queued: ' + snd.join());
// the head death mark exists and is species tagged
assert.ok(P.marks.some(m => m.k === 'sdeath' && m.wk === 'frosty'), 'species death mark');
// a chain climbs the rungs
for (let i = 0; i < 3; i++) R.onEvent({ t: 'kill', x: 100 + i * 20, y: 400, r: 30, kind: 'normal', skin: 'love' }, g);
assert.ok(q().some(n => /^rung\d$/.test(n)), 'rung sounds in a chain');
for (let i = 0; i < 120; i++) R.draw(g, null, 1 / 60);
assert.equal(P.marks.length, 0, 'marks end');
// every species draws without throwing
for (const sk of ['love', 'rust', 'sneezy', 'grumpy', 'sleepy', 'disco', 'sour', 'mighty', 'frosty', 'gloomy', 'piggy', 'nope']) for (const k of [0, 0.3, 0.9]) j8.drawSpeciesDeath(stubCtx(), sk, k, 1, () => {});
for (const w of ['needles', 'dragon', 'bubble', 'swab']) for (const k of [0, 0.5]) j8.drawMuzzle(stubCtx(), w, k, 1);
// muzzle flashes come from the weapon events
for (const t of ['needles', 'dragon', 'bubble', 'swab']) { R.onEvent({ t }, g); assert.ok(P.marks.some(m => m.k === 'muz' && m.wk === t), 'muzzle ' + t); }
// reduce motion: no marks but the sounds still play
R.setOptions({ reduceMotion: true }); P.marks.length = 0; q();
R.onEvent({ t: 'kill', x: 300, y: 400, r: 30, kind: 'normal', skin: 'rust', head: true }, g);
assert.equal(P.marks.length, 0); assert.ok(q().includes('death_rust'), 'sounds ignore reduce motion');
R.setOptions({ reduceMotion: false });
// best moment
S.t += 5;
for (let i = 0; i < 3; i++) { R.onEvent({ t: 'hit', x: 200, y: 300, d: 9, crit: true, src: 'capsule', s: {} }, g); S.t += 0.2; }
const m = R.hj.moment();
assert.ok(m.chain >= 3 && m.heads >= 1 && m.crit >= 2, 'moment tally');
assert.match(j8.momentLine({ chain: 12, crit: 0, finish: 'daggers' }), /12-cell chain, finished by dagger/);
assert.equal(j8.momentLine({ chain: 2, crit: 0, finish: '' }), '');
assert.match(j8.momentLine({ chain: 2, crit: 3, finish: 'x' }), /Crit streak x4/);
