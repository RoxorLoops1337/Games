// Stacking Cats: save codes (export, import, cleaning) and the daily challenge client.
import assert from 'node:assert/strict';
import { encodeSave, decodeSave } from '../stacking_cats/savecode.js';
import { dailyScore, fetchBoard, submitScore, rankOf } from '../stacking_cats/daily.js';
import { STARTERS, emptyStats } from '../stacking_cats/cats.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const sample = () => ({
  v: 1, sound: false, music: true, meter: false, diff: 'hard', name: 'Mia the Cat', tips: { first: true }, opt: { shake: 0.5, colorblind: true },
  unlocked: [...STARTERS, 'yuki', 'zeus'], stats: { ...emptyStats(), kills: 1234, bestWave: 17, lvl3Of: { ember: true } },
  kingdom: { coins: 420, earned: 3000, gems: 5, lv: { dojo: 3, tent: 9 }, wonders: { cafe: true } },
  ach: { first: 1700000000000 }, catStats: { tabby: { runs: 4, dmg: 99999, kills: 400, best: 17 } }, daily: { '2026-10-25': { best: 1800, wave: 17 } },
});

await t('a save survives the round trip, including non ASCII names', () => {
  const s = sample(); s.name = 'Mia';
  const code = encodeSave(s);
  assert.ok(code.startsWith('SC1:'));
  const r = decodeSave(code);
  assert.ok(r.ok);
  assert.equal(r.save.stats.kills, 1234);
  assert.equal(r.save.kingdom.lv.dojo, 3);
  assert.equal(r.save.kingdom.lv.tent, 4, 'levels are clamped to the building maximum');
  assert.equal(r.save.kingdom.wonders.cafe, true);
  assert.equal(r.save.diff, 'hard');
  assert.equal(r.save.sound, false);
  assert.ok(r.save.unlocked.includes('zeus'));
  assert.equal(r.save.ach.first, 1700000000000);
  assert.equal(r.save.catStats.tabby.best, 17);
  assert.equal(r.save.daily['2026-10-25'].best, 1800);
  assert.equal(decodeSave(encodeSave({ ...sample(), name: 'Zoë 猫' })).save.name, 'Zo');
});
await t('bad codes are refused without throwing', () => {
  for (const bad of ['', 'hello', 'SC1:', 'SC1:%%%', 'SC1:' + btoa('{"a":1}'), null, undefined]) assert.equal(decodeSave(bad).ok, false);
});
await t('imports are cleaned: unknown cats and buildings dropped, numbers clamped, starters always present', () => {
  const evil = { ...sample(), unlocked: ['nope', 'zeus'], stats: { kills: -5, bestWave: 'x', lvl3Of: { nope: true } }, kingdom: { coins: 1e30, lv: { fake: 9 }, wonders: { fake: true, paw: true } }, name: '<script>alert(1)</script>' };
  const r = decodeSave(encodeSave(evil));
  assert.ok(r.ok);
  assert.ok(STARTERS.every((id) => r.save.unlocked.includes(id)));
  assert.ok(!r.save.unlocked.includes('nope'));
  assert.equal(r.save.stats.kills, 0);
  assert.equal(r.save.stats.bestWave, 0);
  assert.equal(r.save.kingdom.coins, 1e9);
  assert.equal(r.save.kingdom.lv.fake, undefined);
  assert.deepEqual(Object.keys(r.save.kingdom.wonders), ['paw']);
  assert.ok(!/[<>()]/.test(r.save.name));
});
await t('daily score rewards waves most, then kills and nests', () => {
  assert.equal(dailyScore({ wave: 10, kills: 50, bossKills: 2 }), 1150);
  assert.ok(dailyScore({ wave: 11, kills: 0, bossKills: 0 }) > dailyScore({ wave: 10, kills: 90, bossKills: 0 }));
  assert.equal(dailyScore({ wave: 0, kills: 0, bossKills: 0 }), 1);
});
await t('leaderboard client: success, server errors and network failures never throw', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ day: '2026-10-25', top: [{ name: 'A', score: 5 }], all: [] }) });
  const r = await fetchBoard('2026-10-25', ok);
  assert.ok(r.ok && r.top.length === 1);
  assert.equal((await fetchBoard('x', async () => ({ ok: false, status: 503 }))).ok, false);
  assert.equal((await fetchBoard('x', async () => { throw new Error('offline'); })).ok, false);
  assert.equal((await fetchBoard('x', () => new Promise(() => {}), 30)).ok, false, 'times out');
  const posted = [];
  const s = await submitScore({ name: 'A', score: 9 }, async (url, opt) => { posted.push([url, JSON.parse(opt.body)]); return { ok: true, json: async () => ({ day: 'd', top: [{ name: 'A' }], all: [] }) }; });
  assert.ok(s.ok && posted[0][1].score === 9);
  assert.equal((await submitScore({}, async () => ({ ok: false, status: 429 }))).status, 429);
  assert.equal(rankOf([{ name: 'B' }, { name: 'A' }], 'A'), 2);
  assert.equal(rankOf([], 'A'), 0);
});
await t('the Relic Book found list survives the round trip and unknown relic ids are dropped', () => {
  const s = sample(); s.relics = { claws: true, kingcrown: true, 'not a relic': true, __proto__x: true };
  const r = decodeSave(encodeSave(s));
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.save.relics).sort(), ['claws', 'kingcrown']);
  assert.deepEqual(decodeSave(encodeSave(sample())).save.relics, {}, 'an old save without the field has an empty book');
});

console.log(`${n} tests passed`);
