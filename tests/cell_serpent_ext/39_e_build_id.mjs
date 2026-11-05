// Batch 16 (agent e): build identity (names from cards, collection in the save, share picture, wiring).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTraits, buildName, buildTagline, topWeapons, recordBuild, cleanBuilds, cardLines, drawShareCard, shareCard, BARE_NAME, BUILD_CAP, UP_WORD, WEAPON_WORD, CARD_W, CARD_H } from '../../cell_serpent/build_id_b16e.js';
import { defaultSave, sanitizeSave, WEAPONS, CAPSULE_UPS, PASSIVES, SKINS } from '../../cell_serpent/sim.js';
const rd = p => readFileSync(new URL('../../cell_serpent/' + p, import.meta.url), 'utf8');
const lo = ['swab', 'daggers', 'tower'];

// names
assert.equal(buildName(buildTraits({ swab: { lv: 1 } }, {}, lo, 0)), BARE_NAME, 'a loadout skill at level 1 is not a pick');
assert.equal(buildName(null), BARE_NAME);
assert.equal(buildName(buildTraits({ tower: { lv: 3 } }, { burst: 2 }, lo, 4)), 'Echo Cow Duet');
assert.equal(buildName(buildTraits({ tower: { lv: 4 }, dragon: { lv: 2 } }, { burst: 3, aspd: 1, crit: 1 }, lo, 9)), 'Echo Cow Band');
assert.equal(buildName(buildTraits({}, { aspd: 3 }, lo, 3)), 'Quickstep Solo');
assert.equal(buildName(buildTraits({}, { aspd: 3, crit: 1 }, lo, 4)), 'Quickstep Perfect Pitch Duet');
assert.equal(buildName(buildTraits({ maw: { lv: 1 } }, {}, lo, 1)), 'Bulldog Solo', 'a skill found on a yellow cell counts from level 1');
// ties are deterministic and key order does not matter
assert.equal(buildName(buildTraits({}, { aspd: 1, burst: 1 }, [], 2)), buildName(buildTraits({}, { burst: 1, aspd: 1 }, [], 2)));
// every upgrade and weapon id has a word
for (const u of [...CAPSULE_UPS, ...PASSIVES]) assert.ok(UP_WORD[u.id], 'word for ' + u.id);
for (const w of WEAPONS) assert.ok(WEAPON_WORD[w.id], 'word for ' + w.id);
// names are plain letters (they are stored in the save) and no em dash anywhere
const sample = [{}, { aspd: 1 }, { burst: 2, crit: 1, gear: 1, fan: 2, brg: 1, chk: 1 }];
for (const u of sample) for (const w of [{}, { tower: { lv: 5 }, maw: { lv: 3 }, swab: { lv: 3 } }]) assert.match(buildName(buildTraits(w, u, lo, 5)), /^[A-Za-z\- ]+$/);
assert.ok(!/—/.test(rd('build_id_b16e.js')));
assert.match(buildTagline(buildTraits({ tower: { lv: 3 } }, {}, lo, 2)), /^2 cards, Cow power$/);
assert.equal(buildTagline(buildTraits({}, {}, lo, 0)), 'No cards picked, just the voices');
assert.deepEqual(topWeapons(buildTraits({ tower: { lv: 4 }, dragon: { lv: 2 }, swab: { lv: 3 } }, {}, lo, 5), 2), [{ id: 'tower', lv: 3 }, { id: 'swab', lv: 2 }]);

// the collection
{
  const s = { builds: {} };
  assert.deepEqual(recordBuild(s, 'Echo Cow Duet'), { name: 'Echo Cow Duet', fresh: true, count: 1, total: 1 });
  assert.equal(recordBuild(s, 'Echo Cow Duet').fresh, false);
  assert.equal(recordBuild(s, BARE_NAME).fresh, false); assert.ok(!(BARE_NAME in s.builds), 'the bare run is not collected');
  const t = {}; for (let i = 0; i < BUILD_CAP + 5; i++) recordBuild(t, 'Name' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + ((i / 26) | 0)));
  assert.equal(Object.keys(t.builds).length, BUILD_CAP, 'the collection is capped');
  assert.equal(recordBuild(null, 'x').fresh, false);
  assert.deepEqual(cleanBuilds({ 'Echo Cow Duet': 3, 'bad<script>': 2, ok: -4, Fine: 'x' }), { 'Echo Cow Duet': 3 });
}
// the save: default, sanitised, and an old save without the field still loads
{
  assert.deepEqual(defaultSave().builds, {});
  const s = sanitizeSave({ builds: { 'Echo Cow Duet': 2, '<b>': 1, Loud: 1e9 }, cleared: 3 });
  assert.deepEqual(s.builds, { 'Echo Cow Duet': 2, Loud: 9999 });
  assert.deepEqual(sanitizeSave({ cleared: 3 }).builds, {});
  assert.deepEqual(sanitizeSave({ builds: [1, 2] }).builds, {});
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(s))).builds, s.builds, 'round trip');
}

// the picture lines and a fake canvas draw (headless)
{
  const L = cardLines({ won: true, stage: 7, stars: 2, time: 83, kills: 120, groove: 40.4 }, 'Mighty Moxies');
  assert.equal(L.stage, 'Stage 7: Mighty Moxies'); assert.match(L.result, /^CLEARED/); assert.deepEqual(L.facts, [['TIME', '1:23'], ['CELLS', '120'], ['GROOVE', '40']]);
  assert.equal(cardLines({ won: false, stage: 3, progress: 0.91, time: 5 }, '').result, '91% CLEARED');
  const calls = []; const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? s => ({ width: String(s).length * 30 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); }, set: () => true });
  const cv = { getContext: () => ctx, width: 0, height: 0 };
  drawShareCard(cv, { name: 'Echo Cow Choir', tagline: 't', weapons: [{ id: 'tower', lv: 2 }], r: { won: true, stage: 1, stars: 3, time: 1, kills: 1 }, skin: 'frosty', url: 'u' }, {});
  assert.equal(cv.width, CARD_W); assert.equal(cv.height, CARD_H); assert.ok(calls.includes('fillText') && calls.includes('fill'));
  for (const sk of SKINS) drawShareCard({ getContext: () => ctx }, { name: 'Quickstep Perfect Pitch Duet Plus', r: {}, skin: sk }, {});
  // no picture possible: reports fail so the caller can fall back to the text share
  assert.equal(await shareCard({ name: 'X', r: {}, weapons: [] }, null, 't', null, { doc: { createElement: () => ({ getContext: () => ctx, toBlob: cb => cb(null) }) }, nav: {} }), 'fail');
}

// wiring
{
  const main = rd('main.js'), html = rd('index.html'), sim = rd('sim.js');
  assert.ok(/from '\.\/build_id_b16e\.js'/.test(main) && /recordBuild\(save, bn\)/.test(main) && /shareCard\(info, iconURL/.test(main) && /shareResult\(txt, toast\)/.test(main), 'result uses build id and falls back to the text share');
  assert.ok(/pbname16e/.test(main) && /buildName\(buildTraits\(g\.weap, g\.ups, save\.loadout/.test(main), 'pause shows the name');
  assert.ok(html.includes('id="rBuild"') && html.includes('@css:39-e-build') && html.includes('end @css:39-e-build'));
  assert.ok(html.indexOf('@css:39-e-build') < html.indexOf('@css:34-phone-hub'), 'css block sits before the phone block');
  assert.ok(/builds: \{\}, plat:/.test(sim) && /s\.builds = \{\}/.test(sim));
  assert.ok(/\.rbuild16e\{[^}]*font-size:14px/.test(html) && /@media \(max-height:700px\)\{\.rbuild16e\{display:none\}\}/.test(html), 'short phones keep RETRY and MENU');
}
console.log('39_e_build_id: checks passed');
