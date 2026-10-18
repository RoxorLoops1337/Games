// Profile, save and migration: round trip, fuzzed corruption, v0 fixture, storage helpers.
import assert from 'node:assert/strict';
import { makeRng } from '../midnight_mog/js/rng.js';
import {
  newProfile, migrate, serialize, deserialize, tryDeserialize, sanitize, saveToStorage, loadFromStorage, clearStorage,
  touchSeen, grantDailyGems, SAVE_KEY, BACKUP_KEY, PROFILE_VERSION,
} from '../midnight_mog/js/sim/profile.js';
import { STARTER_DECK, CARD_BY_ID } from '../midnight_mog/js/data/cards.js';
import { CAT_BY_ID } from '../midnight_mog/js/data/cats.js';
import { COUNTER_KEYS, refreshQuests, newQuestState } from '../midnight_mog/js/data/quests.js';
import { crateCost, MAX_CUR } from '../midnight_mog/js/sim/economy.js';
import { openCrate } from '../midnight_mog/js/sim/loot.js';
import { deckSlots } from '../midnight_mog/js/sim/deck.js';

const em = String.fromCharCode(0x2014);

// ---- new profile
const p = newProfile(1234, 5000);
assert.equal(p.v, PROFILE_VERSION);
assert.equal(p.seed, 1234);
assert.deepEqual(p.deck, STARTER_DECK);
assert.equal(Object.keys(p.cats).length, 3);
for (const id of Object.keys(p.cats)) assert.ok(CAT_BY_ID[id]);
assert.ok(p.town.plots.length >= 4 && p.town.plots[0].b === 'tuna_cannery' && p.town.plots[0].t === 5000);
for (const k of COUNTER_KEYS) assert.equal(p.stats[k], 0);
for (const k of ['offline_cap', 'offline_eff', 'start_fish', 'crate_luck', 'extra_slot']) assert.equal(p.meta[k], 0);
assert.deepEqual(p.quests, newQuestState());
assert.equal(p.lastSeen, 5000);
for (const id of p.deck) assert.ok(p.cards[id], 'deck card owned ' + id);
assert.ok(deckSlots(p) >= 12);
// the first crate opens at once (inside the first 2 minutes)
const price = crateCost('alley_crate', 0);
assert.ok(p.cur[price.cur] >= price.price * 2, 'can afford 2 first crates');
const opened = openCrate(p, 'alley_crate', makeRng(1));
assert.ok(!opened.error && opened.drops.length === 1);
assert.deepEqual(newProfile(7), newProfile(7), 'deterministic');

// ---- round trip (including a played-in profile)
assert.deepEqual(deserialize(serialize(p)), p);
let q = opened.profile;
q.pity['neon_crate@legend'] = 17;
q.pity['neon_crate'] = 3;
q.town.keys.alley_crate = 2;
q.town.streak = { days: 5, last: 40 };
q.town.visitor = { slot: 9, claimed: true };
q.town.mapsCleared = { comet_rift: 40 };
q.town.plots[1] = { b: 'catnip_garden', level: 3, t: 99, opt: { district: 'rooftop_row', strain: 'dmg' } };
q.meta.crate_luck = 2;
q.stats.fishEarned = 123456;
q.relics.stray_crown = true;
q.quests = refreshQuests(q.quests, 41, q, { perMinute: { fish: 100 } });
q.lastSeen = 9000;
const rt = deserialize(serialize(q));
assert.equal(rt.pity['neon_crate@legend'], 17, 'pity int keys survive');
assert.equal(rt.pity['neon_crate'], 3);
assert.deepEqual(rt.town.plots[1], q.town.plots[1]);
assert.deepEqual(rt.quests, q.quests);
assert.deepEqual(rt.town.mapsCleared, { comet_rift: 40 });
assert.deepEqual(rt.town.streak, { days: 5, last: 40 });
assert.equal(rt.meta.crate_luck, 2);
assert.equal(rt.stats.fishEarned, 123456);
assert.equal(rt.stats.crateOpens, q.stats.crateOpens);
assert.deepEqual(migrate(rt), rt, 'idempotent');
const input = JSON.stringify(q);
migrate(q); sanitize(q);
assert.equal(JSON.stringify(q), input, 'inputs never mutated');
assert.ok(!serialize(q).includes(em));

// ---- targeted repairs
const bad = migrate({
  v: 1, seed: -5.5, cur: { fish: -100, yarn: NaN, gems: Infinity, tokens: '12', junk: 1 },
  cats: { scrap_tabby: { level: -3, dupes: NaN, stars: 99 }, nope_cat: { level: 5 } }, deck: ['zzz', 'pounce'],
  cards: { zzz: { level: 1, count: 1 } }, relics: { nope: true, stray_crown: 1 },
  town: { plots: [{ b: 'tuna_cannery', level: 1e99, t: -4 }, { b: 'nope' }, 7], keys: { alley_crate: -3, fake: 4 } },
  pity: { 'neon_crate@legend': 5, 'neon_crate@zzz': 5, nope: 3, neon_crate: -9 },
  stats: { battlesWon: -4, kills: 'x', __proto__: { a: 1 } }, meta: { crate_luck: 999, evil: 1 }, lastSeen: NaN,
});
assert.equal(bad.seed, 0);
assert.deepEqual(bad.cur, { fish: 0, yarn: 300, gems: 10, tokens: 12 });
assert.equal(bad.cats.scrap_tabby.level, 1);
assert.ok(bad.cats.scrap_tabby.stars <= 8);
assert.ok(!bad.cats.nope_cat);
assert.deepEqual(bad.deck, STARTER_DECK, 'deck too small gets the starter deck');
assert.ok(!bad.cards.zzz && !bad.relics.nope && bad.relics.stray_crown);
assert.equal(bad.town.plots[0].t, 0);
assert.ok(bad.town.plots[0].level <= 1e6);
assert.deepEqual(bad.town.plots[1], {});
assert.deepEqual(bad.town.keys, {});
assert.deepEqual(bad.pity, { 'neon_crate@legend': 5, neon_crate: 0 });
assert.equal(bad.stats.battlesWon, 0);
assert.equal(bad.meta.crate_luck, 5);
assert.ok(!('evil' in bad.meta));
assert.equal(bad.lastSeen, 0);
assert.ok(({}).a === undefined, 'no prototype pollution');
// garden without valid opt gets a valid default
const g = migrate({ town: { plots: [{ b: 'catnip_garden', level: 2, t: 0, opt: { district: 'x' } }] } });
assert.ok(g.town.plots[0].b === 'catnip_garden' ? g.town.plots[0].opt && g.town.plots[0].opt.strain : true);
// non-object inputs
for (const x of [null, undefined, 5, 'x', [], true]) assert.ok(migrate(x).cats);
assert.equal(deserialize('{not json').v, PROFILE_VERSION);
assert.equal(tryDeserialize('{not json'), null);
assert.equal(tryDeserialize('[]'), null);

// ---- migration from a hand made v0 fixture
const v0 = {
  seed: 42, saved: 7777,
  currency: { fish: 900, yarn: 55, gems: 3, tokens: 1 },
  cats: ['scrap_tabby', { id: 'fizz_mog', lvl: 4, level: 4 }, 'ghost_cat'],
  cards: { pounce: 3, zoomies: 1, bogus: 9 },
  deck: ['pounce', 'zoomies', 'call_scrap_tabby', 'curious_cat', 'tuna_tripwire'],
  relics: ['stray_crown', 'nothing'],
  town: [{ building: 'tuna_cannery', lvl: 6, collected: 123 }, { building: 'yarn_mill', lvl: 2, collected: 50 }, {}],
  progress: 14,
};
const m0 = migrate(v0);
assert.equal(m0.v, PROFILE_VERSION);
assert.equal(m0.seed, 42);
assert.equal(m0.lastSeen, 7777);
assert.deepEqual(m0.cur, { fish: 900, yarn: 55, gems: 3, tokens: 1 });
assert.equal(m0.cats.fizz_mog.level, 4);
assert.ok(m0.cats.scrap_tabby && !m0.cats.ghost_cat);
assert.equal(m0.cards.pounce.level, 3);
assert.ok(m0.cards.call_fizz_mog, 'owned cat gets its summon card');
assert.deepEqual(m0.deck, ['pounce', 'zoomies', 'call_scrap_tabby', 'curious_cat', 'tuna_tripwire']);
assert.deepEqual(Object.keys(m0.relics), ['stray_crown']);
assert.deepEqual(m0.town.plots[0], { b: 'tuna_cannery', level: 6, t: 123 });
assert.equal(m0.town.plots[1].b, 'yarn_mill');
assert.ok(m0.town.plots.length >= 4);
assert.equal(m0.progress.stage, 14);
assert.deepEqual(m0.quests, newQuestState());
assert.deepEqual(m0.meta.crate_luck, 0);
assert.deepEqual(deserialize(serialize(m0)), m0);

// ---- fuzzed corruption: 1000 random mutations never throw and always yield a playable profile
function playable(pr) {
  assert.equal(pr.v, PROFILE_VERSION);
  assert.ok(Number.isInteger(pr.seed) && pr.seed >= 0);
  for (const k of ['fish', 'yarn', 'gems', 'tokens']) assert.ok(Number.isInteger(pr.cur[k]) && pr.cur[k] >= 0 && pr.cur[k] <= MAX_CUR, 'cur ' + k);
  assert.ok(Object.keys(pr.cats).length >= 1);
  for (const id of Object.keys(pr.cats)) assert.ok(CAT_BY_ID[id] && pr.cats[id].level >= 1);
  assert.ok(pr.deck.length >= 4);
  for (const id of pr.deck) assert.ok(CARD_BY_ID[id] && pr.cards[id]);
  assert.ok(pr.town.plots.length >= 4 && pr.town.plots.some((x) => x.b));
  assert.ok(pr.progress.district >= 1 && pr.progress.stage >= 1);
  assert.ok(Number.isFinite(pr.lastSeen) && pr.lastSeen >= 0);
  const s = JSON.stringify(pr);
  assert.ok(!/NaN|Infinity|:null,\"(?!weekly|ach)/.test(s.replace(/"(daily|weekly)":null/g, '')), 'no stray nulls');
  assert.deepEqual(JSON.parse(serialize(pr)), JSON.parse(s), 'stable under re-serialize');
  assert.ok(deckSlots(pr) >= 12);
}
const JUNK = [NaN, Infinity, -Infinity, -1, 1e300, null, undefined, 'str', {}, [], true, '__proto__', { __proto__: null }, 0.5];
function mutate(root, rng) {
  // walk to a random node and replace, delete or retype it
  let node = root, key = null, parent = null;
  for (let depth = 0; depth < 6; depth++) {
    if (node === null || typeof node !== 'object') break;
    const keys = Object.keys(node);
    if (!keys.length) break;
    parent = node; key = rng.pick(keys); node = node[key];
    if (rng.chance(0.3)) break;
  }
  if (parent === null) return;
  const r = rng.next();
  if (r < 0.6) parent[key] = rng.pick(JUNK);
  else if (r < 0.8) delete parent[key];
  else if (Array.isArray(parent)) parent.splice(Number(key), 1);
  else parent[key + '_x'] = rng.pick(JUNK);
}
const rng = makeRng(99);
const base = q;
let strs = 0;
for (let i = 0; i < 1000; i++) {
  const copy = JSON.parse(JSON.stringify(base));
  const n = rng.int(1, 5);
  for (let k = 0; k < n; k++) mutate(copy, rng);
  const fixed = migrate(copy);
  playable(fixed);
  // the text route too: random byte damage
  if (i % 4 === 0) {
    let s = serialize(base);
    for (let k = 0; k < 3; k++) { const at = rng.int(0, s.length - 1); s = s.slice(0, at) + s.slice(at + rng.int(1, 40)); }
    const back = deserialize(s);
    playable(back); strs++;
  }
}
assert.ok(strs > 100);
// whole-field wipes
for (const key of Object.keys(base)) { const c = JSON.parse(JSON.stringify(base)); delete c[key]; playable(migrate(c)); c[key] = 'zzz'; playable(migrate(c)); }

// ---- storage helpers with a fake
function fakeStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
const st = fakeStorage();
assert.equal(loadFromStorage(st), null, 'empty storage');
assert.equal(saveToStorage(p, st), true);
assert.ok(st.m.has(SAVE_KEY) && !st.m.has(BACKUP_KEY));
assert.deepEqual(loadFromStorage(st), p);
const p2 = { ...p, cur: { ...p.cur, fish: 777 } };
saveToStorage(p2, st);
assert.equal(JSON.parse(st.m.get(BACKUP_KEY)).cur.fish, p.cur.fish, 'backup is the previous save');
assert.equal(loadFromStorage(st).cur.fish, 777);
st.m.set(SAVE_KEY, '{{{ broken');
assert.equal(loadFromStorage(st).cur.fish, p.cur.fish, 'falls back to backup');
saveToStorage(p2, st);
assert.equal(JSON.parse(st.m.get(BACKUP_KEY)).cur.fish, p.cur.fish, 'corrupt main never overwrites a good backup');
st.m.set(SAVE_KEY, 'junk'); st.m.set(BACKUP_KEY, 'junk');
assert.equal(loadFromStorage(st), null);
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
assert.equal(saveToStorage(p, throwing), false);
assert.equal(loadFromStorage(throwing), null);
clearStorage(throwing);
clearStorage(st);
assert.equal(st.m.size, 0);

// ---- lastSeen monotonic, daily gem cap
assert.equal(touchSeen({ lastSeen: 100 }, 50).lastSeen, 100);
assert.equal(touchSeen({ lastSeen: 100 }, 150).lastSeen, 150);
assert.equal(touchSeen({ lastSeen: 100 }, NaN).lastSeen, 100);
let gp = newProfile(3);
let r = grantDailyGems(gp, 30, 10);
assert.equal(r.granted, 30);
r = grantDailyGems(r.profile, 30, 10);
assert.equal(r.granted, 10, 'cap 40 per day');
r = grantDailyGems(r.profile, 5, 10);
assert.equal(r.granted, 0);
r = grantDailyGems(r.profile, 5, 11);
assert.equal(r.granted, 5, 'new day resets');
assert.equal(gp.cur.gems, 10, 'input untouched');
assert.equal(deserialize(serialize(r.profile)).stats.gemToday, 5);

console.log('midnight_mog profile ok');
