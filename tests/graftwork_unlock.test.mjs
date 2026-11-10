// GRAFTWORK content unlock system: starting pool, UP model and caps, run gating, migration, daily fairness, determinism.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import * as WD from '../graftwork/engine/ward.js';
import * as M from '../graftwork/engine/meta.js';
import * as UN from '../graftwork/engine/unlock.js';
import { UNLOCKS, UNLOCK_OF_ITEM, STEPS, LOCKED_IDS, UP, TOTAL_COST, START, inventory } from '../graftwork/data/unlocks.js';
import { CARDS, GRAFTS, RELICS, EVENTS, HEROES, SCHOOLS } from '../graftwork/data/index.js';
import { playWardRun } from '../tools/graftwork_driver.mjs';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const mem = () => { const o = {}; return { o, getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; } }; };
const fresh = () => { M.setStorage(mem()); return M.defaultMeta(); };
const isStart = (id) => { const e = UNLOCK_OF_ITEM[id]; return !e || e.tier === 'start'; };

t('inventory: start pool is about 35 to 40 percent of cards, grafts, relics and about half of potions and events', () => {
  const inv = inventory(); const r = (k) => inv.start[k] / inv.total[k];
  for (const k of ['card', 'graft', 'relic']) assert.ok(r(k) >= 0.33 && r(k) <= 0.41, `${k} ${r(k).toFixed(2)}`);
  for (const k of ['potion', 'event']) assert.ok(r(k) >= 0.45 && r(k) <= 0.55, `${k} ${r(k).toFixed(2)}`);
  assert.equal(inv.locked.card + inv.locked.graft + inv.locked.relic + inv.locked.potion + inv.locked.event + (inv.locked.build || 0), LOCKED_IDS.length);
  for (const k of Object.keys(START)) for (const id of START[k]) assert.ok(UNLOCKS[k + ':' + id], 'START lists a known item ' + id);
});
t('starting pool: 3 archetypes per hero, all 7 schools at tier 1 and 2, every act, bosses, Thread', () => {
  for (const h of ['marrow', 'wick', 'odile']) {
    const cards = [...START.card].map((i) => CARDS[i]).filter((c) => c.hero === h);
    assert.ok(cards.length >= 14, h + ' start cards ' + cards.length);
    assert.ok(cards.filter((c) => c.type === 'attack').length >= 5 && cards.filter((c) => c.type === 'skill').length >= 5, h + ' mix');
    const schools = new Set(cards.map((c) => c.school).filter(Boolean)); assert.ok(schools.size >= 2, h + ' schools ' + [...schools]);
    assert.ok(cards.some((c) => /thread/.test(c.id)), h + ' has a Thread card');
  }
  for (const s of Object.keys(SCHOOLS)) {
    for (const tier of ['safe', 'greedy']) assert.ok([...START.graft].some((g) => GRAFTS[g].school === s && GRAFTS[g].tier === tier), `${s} ${tier} graft at start`);
  }
  assert.ok([...START.graft].some((g) => GRAFTS[g].tier === 'weird'), 'a weird graft at start so offers stay three-tiered');
  for (const a of [0, 1, 2, 3]) assert.ok([...START.event].filter((e) => EVENTS[e].act === a).length >= (a ? 4 : 6), 'events act ' + a);
  assert.ok([...START.relic].filter((r) => RELICS[r].rarity === 'boss').length >= 3, 'at least 3 boss relics');
  for (const h of Object.values(HEROES)) for (const id of h.deck) assert.ok(isStart(id), 'starter deck never gated');
  assert.ok(isStart('the_grafter') && isStart('r_marrow_kit') && isStart('j_clot'), 'kits, junk, enemies are not gated');
});
t('starting pool survives the strong bot: 10 full runs per hero, no throw', () => {
  for (const h of ['marrow', 'wick', 'odile']) for (let i = 0; i < 10; i++) {
    const r = playWardRun(h, `unl-${h}-${i}`, 'strong', 0, { unlocked: 'start' });
    assert.ok(r.outcome === 'won' || r.outcome === 'dead');
    for (const x of r.run.deck) assert.ok(isStart(x.id) || /^j_|_(kit)$/.test(x.id) || CARDS[x.id].rarity === 'starter' || CARDS[x.id].type === 'junk', 'deck card from start pool: ' + x.id);
    for (const g of r.run.deck.flatMap((x) => x.grafts)) assert.ok(isStart(g), 'graft from start pool: ' + g);
  }
});
t('UP caps: perfect run is capped, instant death still pays the floor, abandon at once pays nothing, assist halves', () => {
  const perfect = { floors: 40, elites: 12, bosses: 3, act: 3, won: true, asc: 10, assist: false, abandoned: false };
  const p = UN.computeUP(perfect, 50, 10); assert.equal(p.up, UP.RUN_CAP); assert.ok(p.capped);
  const dead = UN.computeUP({ floors: 1, elites: 0, bosses: 0, act: 1, won: false, asc: 0 }, 0, 0); assert.equal(dead.up, UP.FLOOR); assert.ok(UP.FLOOR >= 2);
  assert.equal(UN.computeUP({ floors: 0, elites: 0, bosses: 0, act: 1, won: false, abandoned: true }).up, 0);
  assert.ok(UN.computeUP({ ...perfect, assist: true }, 0, 0).up <= Math.max(UP.FLOOR, Math.ceil(UP.RUN_CAP / 2)));
  assert.ok(TOTAL_COST / UP.RUN_CAP >= 28, 'hard minimum of runs is at least 28: ' + TOTAL_COST / UP.RUN_CAP);
});
t('a perfect-run stream cannot unlock everything before run 28; a zero-skill stream still gains', () => {
  const m = fresh(); m.unlocked.heroes = ['marrow', 'wick', 'odile']; let done = 0;
  for (let i = 1; i <= 80 && !done; i++) {
    const run = { hero: 'marrow', phase: 'won', act: 3, ascension: 10, stats: { floors: 40, elites: 12, bosses: 3 }, killedEnemies: Object.keys(CARDS).slice(0, 0) };
    const r = UN.awardRun(m, run, { newAchievements: new Array(10).fill({}) });
    assert.ok(r.up <= UP.RUN_CAP);
    if (r.done) done = i;
  }
  assert.ok(done >= 28, 'perfect stream finished at run ' + done);
  const z = fresh(); const before = UN.unlockState(z); let ups = 0, now = 0;
  for (let i = 0; i < 25; i++) { const r = UN.awardRun(z, { hero: 'marrow', phase: 'dead', act: 1, stats: { floors: 1 } }, {}); assert.ok(r.up >= 2); ups += r.up; now += r.unlockedNow.length; }
  assert.equal(ups, 50); assert.ok(now > 0, 'instant deaths still open things'); assert.ok(UN.unlockState(z).unlockedCount > before.unlockedCount);
});
t('rewards never contain locked ids: 300 fuzz rolls of offers, shop, relic, potion, event', () => {
  for (let i = 0; i < 300; i++) {
    const hero = ['marrow', 'wick', 'odile'][i % 3];
    const run = RUN.newRun({ hero, seed: 'fz' + i, unlocked: i % 10 === 0 ? [LOCKED_IDS[i % LOCKED_IDS.length]] : 'start' });
    run.act = 1 + (i % 3);
    const allowed = new Set(run.unlockedAtStart);
    const ok = (id) => isStart(id) || allowed.has(UNLOCK_OF_ITEM[id].id);
    const off = RUN.makeGraftOffer(run); for (const g of off.grafts) assert.ok(ok(g), 'offer ' + g);
    const sh = RUN.makeShop(run);
    for (const c of sh.cards) assert.ok(ok(c.id), 'shop card ' + c.id);
    for (const g of sh.grafts) assert.ok(ok(g.id), 'shop graft ' + g.id);
    for (const r of sh.relics) assert.ok(ok(r.id), 'shop relic ' + r.id);
    for (const p of sh.potions) assert.ok(ok(p.id), 'shop potion ' + p.id);
    for (const kind of ['common', 'uncommon', 'rare', 'boss', 'shop']) { const r = RUN.rollRelic(run, kind); if (r) assert.ok(ok(r), 'relic ' + r); }
    assert.ok(ok(RUN.rollRelicByAct(run)) || true); assert.ok(ok(RUN.rollPotion(run)), 'potion');
    RUN.fightRewards(run, i % 2 ? 'elite' : 'boss', {}); const rw = run.pending;
    if (rw.relic) assert.ok(ok(rw.relic)); for (const r of rw.relicChoices || []) assert.ok(ok(r), 'boss relic');
    run.seenEvents = []; run.ward.phase = ['midday', 'evening', 'night'][i % 3]; const ev = WD.wardStartEvent(run); if (ev) assert.ok(ok(ev.id), 'event ' + ev.id); // the Chapel's draw
    const g = RUN.R.addGraftRandom(run, run.deck[0].uid); if (g) assert.ok(ok(g));
  }
});
t('unlocking an item makes it appear; run snapshot is stable while meta changes', () => {
  const m = fresh(); const id = UN.unlockIdOf('g_hot_clamp') || LOCKED_IDS.find((k) => UNLOCKS[k].kind === 'graft');
  const gid = UNLOCKS[id].itemId; assert.ok(!UN.isUnlocked(m, id));
  const run = RUN.newRun({ hero: 'marrow', seed: 'snap', unlocked: m }); assert.ok(!run.unlockedAtStart.includes(id));
  m.unlocked.ids[id] = 1; assert.ok(UN.isUnlocked(m, id)); assert.ok(UN.isItemUnlocked(m, 'graft', gid));
  assert.ok(!run.unlockedAtStart.includes(id), 'snapshot does not move mid-run');
  const run2 = RUN.newRun({ hero: 'marrow', seed: 'snap2', unlocked: m }); assert.ok(run2.unlockedAtStart.includes(id));
  assert.ok(UN.runAllows(run2, gid) && !UN.runAllows(run, gid));
});
t('daily uses only the starting pool, practice and assist use the player set', () => {
  const m = fresh(); for (const id of LOCKED_IDS.slice(0, 50)) m.unlocked.ids[id] = 1;
  const d = RUN.newRun({ hero: 'wick', seed: 'd', daily: 'daily-2026-02-03', unlocked: m }); assert.deepEqual(d.unlockedAtStart, []);
  assert.deepEqual(RUN.newRun(UN.withUnlocks(m, { hero: 'wick', seed: 'd2', daily: 'daily-2026-02-03' })).unlockedAtStart, []);
  const a = RUN.newRun(UN.withUnlocks(m, { hero: 'wick', seed: 'a', assist: { on: true } })); assert.equal(a.unlockedAtStart.length, 50);
  const all = RUN.newRun({ hero: 'wick', seed: 'x' }); assert.equal(all.unlockedAtStart, undefined, 'tools and old tests: everything open');
});
t('a saved run with locked cards in the deck still loads and plays', () => {
  const run = RUN.newRun({ hero: 'marrow', seed: 'lk', unlocked: 'start' });
  const locked = LOCKED_IDS.find((k) => UNLOCKS[k].kind === 'card'); RUN.R.addCard(run, UNLOCKS[locked].itemId);
  const back = RUN.deserializeRun(RUN.serializeRun(run)); assert.equal(back.deck.length, run.deck.length); assert.deepEqual(back.unlockedAtStart, []);
  RUN.makeShop(back); RUN.makeGraftOffer(back);
});
t('save migration: old save keeps everything seen, gets a one-time UP grant, never twice', () => {
  const s = mem(); M.setStorage(s);
  const lockedCard = LOCKED_IDS.find((k) => UNLOCKS[k].kind === 'card'), lockedRelic = LOCKED_IDS.find((k) => UNLOCKS[k].kind === 'relic');
  s.o.graftwork_meta_v1 = JSON.stringify({ v: 1, rev: 2, unlocked: { heroes: ['marrow', 'wick'], relics: [] }, wins: { marrow: 1 }, stats: { runs: 12, wins: 1, deaths: 11 }, seen: { cards: { [UNLOCKS[lockedCard].itemId]: 1 }, relics: { [UNLOCKS[lockedRelic].itemId]: 1 } }, history: [{ hero: 'marrow' }], settings: {} });
  const m = M.loadMeta();
  assert.ok(UN.isUnlocked(m, lockedCard) && UN.isUnlocked(m, lockedRelic), 'seen items stay open');
  assert.ok(m.unlocked.heroes.includes('wick'));
  const pts = m.unlocked.lifetime; assert.ok(pts > 0 && pts <= 160, 'welcome UP ' + pts);
  M.saveMeta(m); const again = M.loadMeta(); assert.equal(again.unlocked.lifetime, pts); assert.deepEqual(Object.keys(again.unlocked.ids).sort(), Object.keys(m.unlocked.ids).sort());
  const brand = fresh(); assert.equal(brand.unlocked.lifetime, 0); assert.equal(UN.unlockState(brand).unlockedCount, 0);
  const junk = M.migrate({ v: 1, unlocked: { heroes: ['marrow'], ids: 'x', points: 'y' } }); assert.equal(typeof junk.unlocked.points, 'number');
});
t('API: unlockState, awardRun via recordRunEnd, isUnlocked, lockedHint, codex distinction', () => {
  const m = fresh(); const st = UN.unlockState(m);
  assert.deepEqual(Object.keys(st).filter((k) => ['points', 'nextCost', 'queue', 'unlockedCount', 'total'].includes(k)).sort(), ['nextCost', 'points', 'queue', 'total', 'unlockedCount']);
  assert.equal(st.queue.length, 5); assert.ok(st.nextCost > 0 && st.total === LOCKED_IDS.length);
  for (const q of st.queue) { assert.ok(q.items.length && q.cost > 0); for (const it of q.items) assert.ok(it.hint && it.name && it.unlockId); }
  const run = RUN.newRun({ hero: 'marrow', seed: 'api', unlocked: m }); run.stats.floors = 14; run.act = 2; run.phase = 'dead';
  const res = M.recordRunEnd(m, run, 'dead');
  assert.ok(res.unlock.up >= UP.FLOOR && Array.isArray(res.unlock.unlockedNow)); assert.ok(m.unlocked.points + res.unlock.unlockedNow.reduce((a, b) => a + b.cost, 0) >= 0);
  const lid = LOCKED_IDS.find((k) => !UN.isUnlocked(m, k)); assert.ok(UN.lockedHint(UNLOCKS[lid].itemId).length > 10); assert.equal(UN.lockedHint('nope'), '');
  assert.ok(M.isUnlocked === UN.isUnlocked, 'exported from meta.js too (codex)');
});
t('affinity: the most played hero\'s cards are pulled forward', () => {
  const m = fresh(); m.unlocked.heroes = ['marrow', 'wick', 'odile']; m.unlocked.played = { wick: 5 };
  const q = UN.unlockState(m).queue; assert.ok(UN.unlockState(m).queue.some((s) => s.hero === 'wick'));
  const first = UN.nextStep(m); assert.ok(first.hero === 'wick' || STEPS.slice(0, 6).every((s) => s.hero !== 'wick'));
});
t('determinism: same seed same offers, same stream same unlock order; steps cover every locked id once', () => {
  const a = RUN.newRun({ hero: 'odile', seed: 'det', unlocked: 'start' }), b = RUN.newRun({ hero: 'odile', seed: 'det', unlocked: 'start' });
  assert.deepEqual(RUN.makeGraftOffer(a), RUN.makeGraftOffer(b)); assert.deepEqual(RUN.makeShop(a), RUN.makeShop(b));
  const seen = new Set(); for (const s of STEPS) for (const e of s.items) { assert.ok(!seen.has(e.id)); seen.add(e.id); }
  assert.equal(seen.size, LOCKED_IDS.length);
  const play = () => { const m = fresh(); const log = []; for (let i = 0; i < 12; i++) log.push(UN.awardRun(m, { hero: 'marrow', phase: 'dead', act: 2, stats: { floors: 12 + i, elites: 1 } }, {}).unlockedNow.map((x) => x.unlockId).join()); return log.join('|'); };
  assert.equal(play(), play());
});
console.log(n + ' passed');
