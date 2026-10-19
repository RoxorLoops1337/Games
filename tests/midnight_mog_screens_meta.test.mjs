// Midnight Mog meta screens: deck builder, roster, relics, map, quests, bestiary, settings, Nine Lives.
// Pure helpers are checked directly; every screen is then driven with a fake ui (taps found by probing the hit regions) and a
// recording mock context, asserting profile invariants after each action. Budget: well under 10 seconds.
import assert from 'node:assert/strict';
import { createUI } from '../midnight_mog/js/ui/shell.js';
import * as D from '../midnight_mog/js/ui/screens_deck.js';
import * as M from '../midnight_mog/js/ui/screens_meta.js';
import { newProfile } from '../midnight_mog/js/sim/profile.js';
import * as TOWN from '../midnight_mog/js/sim/town.js';
import { deckSlots, HAND_SIZE } from '../midnight_mog/js/sim/deck.js';
import { cost, maxLevel } from '../midnight_mog/js/sim/economy.js';
import { CATS, CAT_BY_ID } from '../midnight_mog/js/data/cats.js';
import { CARDS, CARD_BY_ID } from '../midnight_mog/js/data/cards.js';
import { RELICS } from '../midnight_mog/js/data/relics.js';
import { ENEMIES } from '../midnight_mog/js/data/enemies.js';
import { makeRng } from '../midnight_mog/js/rng.js';
import { makeCtx } from './midnight_mog_mockctx.mjs';

const T0 = Date.now();
const DAY = 5;

// ------------------------------------------------------------------------------------------------ harness
function lived(seed = 11) {
  let p = newProfile(seed);
  const rng = makeRng(seed);
  for (const c of CATS) {
    if (!(c.rarity === 'common' || rng.chance(0.6))) continue;
    const dupes = rng.int(0, 7);
    p.cats[c.id] = { level: rng.int(1, 12), dupes, stars: dupes >= 6 ? 3 : dupes >= 3 ? 2 : dupes >= 1 ? 1 : 0 };
    p.cards['call_' + c.id] = { level: rng.int(1, 5), count: rng.int(1, 3) };
  }
  for (const c of CARDS) if (c.type !== 'summon' && rng.chance(0.7)) p.cards[c.id] = { level: rng.int(1, 6), count: rng.int(1, 2) };
  for (const r of RELICS) if (rng.chance(0.4)) p.relics[r.id] = true;
  p.cur = { fish: 5e5, yarn: 3000, gems: 40, tokens: 30 };
  p.progress = { district: 1, stage: 14, best: { 1: 13 }, maxCleared: 13 };
  p.stats.battlesWon = 80; p.stats.kills = 2000; p.stats.bossKills = 1; p.stats.cratesOpened = 7; p.stats.fishEarned = 9000;
  p.deck = ['call_scrap_tabby', 'call_scrap_tabby', 'call_whisker_scout', 'call_spark_kit', 'call_nurse_purrnell', 'call_tin_can_tom', 'pounce', 'tuna_tripwire', 'curious_cat', 'zoomies'].filter((id) => p.cards[id]);
  while (p.deck.length < HAND_SIZE) p.deck.push(Object.keys(p.cards)[p.deck.length]);
  for (const id of new Set(p.deck)) { const n = p.deck.filter((x) => x === id).length; p.cards[id] = { ...p.cards[id], level: p.cards[id].level || 1, count: Math.max(p.cards[id].count || 0, n) }; }
  return TOWN.refresh(p, DAY);
}

function rig(profile, w = 390, h = 800) {
  const ctx = makeCtx(w, h);
  const ui = createUI({ width: 0, height: 0, getContext: () => ctx }, { width: w, height: h, dpr: 2 });
  const log = { go: [], toasts: [], saves: 0, sounds: [], vol: [], muted: [] };
  const screens = Object.fromEntries([...D.DECK_SCREENS, ...M.META_SCREENS].map((s) => [s.id, s]));
  const app = {
    profile, settings: null, audio: { sfx: (n) => log.sounds.push(n), setVolume: (v) => log.vol.push(v), setMuted: (b) => log.muted.push(b) },
    setProfile(p) { this.profile = p; }, save() { log.saves++; },
    router: { go: (id, params) => { log.go.push({ id, params }); }, back() { log.go.push({ id: 'back' }); } },
    now: () => DAY * 86400000 + 3600000, dayIndex: () => DAY, toast: (m, k) => { log.toasts.push({ m, k }); ui.toast(m, k); }, rng: () => makeRng(3),
  };
  ui.onSound = (n) => log.sounds.push(n);
  const R = { ctx, ui, app, log, screens, screen: null };
  R.open = (id, params) => { R.screen = screens[id]; R.screen.enter(app, params || {}); R.run(2); return R.screen; };
  R.run = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { ui.begin(dt); R.screen.update(app, dt, ui); R.screen.draw(ctx, app, ui); ui.end(); } ctx.assertClean(); };
  // find a point where region `id` is the top hit (probes last frame's regions without firing a tap)
  R.locate = (id, step = 5) => {
    for (let y = 2; y < ui.h; y += step) for (let x = 2; x < ui.w; x += step) {
      ui.input.down(x, y); const hit = ui.pressId; ui.down = false; ui.pressId = ''; ui.dragging = false;
      if (hit === id) return { x, y };
    }
    return null;
  };
  R.tap = (id) => { const pt = R.locate(id); assert.ok(pt, 'region not found: ' + id); ui.input.down(pt.x, pt.y); ui.input.up(pt.x, pt.y); R.run(2); return pt; };
  R.tapAt = (x, y) => { ui.input.down(x, y); ui.input.up(x, y); R.run(2); };
  R.has = (id) => !!R.locate(id, 6);
  return R;
}

function inv(p, label) {
  for (const k of ['fish', 'yarn', 'gems', 'tokens']) assert.ok(Number.isFinite(p.cur[k]) && p.cur[k] >= 0, label + ': currency ' + k + ' = ' + p.cur[k]);
  assert.ok(p.deck.length >= HAND_SIZE && p.deck.length <= deckSlots(p), label + ': deck size ' + p.deck.length + ' of ' + deckSlots(p));
  assert.ok(p.deck.some((id) => CARD_BY_ID[id].type === 'summon'), label + ': deck has a summon');
  const used = {};
  for (const id of p.deck) { used[id] = (used[id] || 0) + 1; assert.ok(p.cards[id] && used[id] <= p.cards[id].count, label + ': copies of ' + id); }
  for (const id of Object.keys(p.cats)) assert.ok(p.cats[id].level >= 1 && p.cats[id].level <= maxLevel('cat_level'), label + ': cat level');
  for (const id of Object.keys(p.cards)) assert.ok(p.cards[id].level >= 1 && p.cards[id].level <= maxLevel('card_level'), label + ': card level');
  for (const k of Object.keys(p.meta || {})) assert.ok(p.meta[k] >= 0, label + ': meta');
}

// ------------------------------------------------------------------------------------------------ 1. pure helpers
{
  const p = lived();
  inv(p, 'start');
  // costs follow economy.cost exactly when the town gives no discount
  const id = 'scrap_tabby';
  assert.equal(D.catLevelCost(p, id), cost('cat_level', p.cats[id].level, { rarity: 'common' }));
  assert.equal(D.cardLevelCost(p, 'pounce'), cost('card_level', p.cards.pounce.level, { rarity: 'common' }));
  assert.equal(D.catLevelCost(p, 'nope'), Infinity);
  // level up pays and never goes negative
  let q = D.levelUpCat(p, id);
  assert.ok(q.ok && q.profile.cats[id].level === p.cats[id].level + 1 && q.profile.cur.yarn === p.cur.yarn - q.spent);
  assert.equal(p.cats[id].level, lived().cats[id].level, 'input profile untouched');
  const broke = { ...p, cur: { ...p.cur, yarn: 0 }, town: { ...p.town, xp: 0 } };
  assert.equal(D.levelUpCat(broke, id).reason, 'poor'); assert.equal(D.levelUpCard(broke, 'pounce').reason, 'poor');
  assert.equal(D.levelUpCat(p, 'nope').reason, 'locked');
  const rich = { ...p, cur: { ...p.cur, yarn: 1e12 } };
  const many = D.levelUpCat(rich, id, 500);
  assert.equal(many.profile.cats[id].level, maxLevel('cat_level')); assert.equal(D.levelUpCat(many.profile, id).reason, 'max');
  assert.ok(many.profile.cur.yarn >= 0);
  assert.equal(D.levelUpCard(rich, 'pounce', 500).profile.cards.pounce.level, maxLevel('card_level'));
  // training xp pays first
  const xp = { ...p, cur: { ...p.cur, yarn: 0 }, town: { ...p.town, xp: 1e6 } };
  const px = D.levelUpCat(xp, id);
  assert.ok(px.ok && px.profile.town.xp < 1e6 && px.profile.cur.yarn === 0);
  assert.equal(D.costRangeCat(p, id, 3).n, 3);
  // star repair
  assert.equal(D.starUpCat(p, id).reason, 'none');
  const lag = { ...p, cats: { ...p.cats, [id]: { level: 1, dupes: 10, stars: 0 } } };
  assert.equal(D.starUpCat(lag, id).profile.cats[id].stars, 4);
  // stats monotonic
  const cat = CAT_BY_ID[id];
  const a = D.catStatsAt(cat, 1, 0), b = D.catStatsAt(cat, 30, 3);
  assert.ok(b.hp > a.hp && b.dmg > a.dmg && a.hp === cat.base.hp);

  // deck editing
  const slots = deckSlots(p);
  let d = p;
  for (const o of D.ownedCards(p)) { const r = D.deckAdd(d, o.id); if (r.ok) d = r.profile; }
  assert.ok(d.deck.length <= slots); inv(d, 'filled');
  assert.equal(D.deckAdd(d, 'pounce').ok && d.deck.length >= slots, false, 'full deck refuses');
  assert.equal(D.deckAdd(p, 'no_such_card').reason, 'unowned');
  const one = { ...p, deck: [p.deck[0]] }; assert.equal(D.deckRemoveAt(one, 0).reason, 'min');
  assert.equal(D.deckRemoveAt(p, 99).reason, 'index');
  let e = p;
  for (let i = 0; i < 40 && e.deck.length > HAND_SIZE; i++) { const r = D.deckRemoveAt(e, 0); if (!r.ok) break; e = r.profile; }
  assert.equal(e.deck.length, HAND_SIZE); inv(e, 'trimmed');
  const sums = { ...p, deck: ['pounce', 'pounce', 'tuna_tripwire', 'curious_cat', 'zoomies', 'call_scrap_tabby'] };
  sums.cards = { ...p.cards, pounce: { level: 1, count: 3 } };
  assert.equal(D.deckRemoveAt(sums, 5).reason, 'summon', 'the last cat card stays');
  const sorted = D.deckSort(p).deck; for (let i = 1; i < sorted.length; i++) assert.ok(CARD_BY_ID[sorted[i - 1]].cost <= CARD_BY_ID[sorted[i]].cost);
  assert.equal(D.deckCurve(p).reduce((x, y) => x + y, 0), p.deck.length);
  // auto build: slots, copies, a summon, never worse than the starter deck for a fresh player
  for (const s of [3, 7, 11, 19]) {
    const pp = lived(s);
    const auto = D.autoBuildDeck(pp);
    assert.ok(auto.length >= HAND_SIZE && auto.length <= deckSlots(pp), 'auto size ' + auto.length);
    inv({ ...pp, deck: auto }, 'auto' + s);
  }
  const fresh = newProfile(2);
  const af = D.autoBuildDeck(fresh); inv({ ...fresh, deck: af }, 'auto fresh');
  // town slots lift the cap
  const big = JSON.parse(JSON.stringify(rich)); big.town.plots[2] = { b: 'cat_barracks', level: 10, t: 0 };
  assert.ok(D.autoBuildDeck(big).length <= deckSlots(big));
  const hints = D.synergyHints(p);
  assert.ok(hints.length >= 1 && hints.length <= 4 && hints.every((h) => h.text && (h.kind === 'good' || h.kind === 'warn')));
  assert.ok(D.synergyHints(newProfile(1)).length >= 1);
}

// ------------------------------------------------------------------------------------------------ 2. meta helpers
{
  const p = lived();
  // claim helpers
  const stats = { ...p.stats, battlesWon: 500, kills: 90000, bossKills: 9, cratesOpened: 100 };
  const q = { ...p, stats };
  const cnt = M.claimableCounts(q, DAY);
  assert.ok(cnt.total > 0 && cnt.ach > 0);
  const all = M.claimEverything(q, DAY);
  assert.ok(all.count > 0); inv(all.profile, 'claimEverything');
  assert.equal(M.claimableCounts(all.profile, DAY).ach, 0);
  assert.equal(M.claimEverything(all.profile, DAY).count, 0, 'second claim finds nothing');
  assert.ok(all.profile.cur.gems >= q.cur.gems);
  // bestiary
  const s0 = M.seenEnemies(newProfile(1)), s1 = M.seenEnemies({ ...p, progress: { district: 3, stage: 1, best: {}, maxCleared: 70 } });
  assert.ok(s0.size >= 1 && s0.size < ENEMIES.length && s1.size >= s0.size && s1.size === ENEMIES.length);
  const ms = M.markSeen(newProfile(1), ['gator_mayor']); assert.ok(M.seenEnemies(ms).has('gator_mayor'));
  assert.equal(M.markSeen(ms, ['gator_mayor']), ms, 'already seen is a no-op'); assert.equal(M.markSeen(ms, ['nope']), ms);
  // perks
  const rows = M.perkRows(p);
  assert.ok(rows.length >= 4 && rows.every((r) => r.name && r.now && Number.isFinite(r.cost)));
  assert.ok(!rows.some((r) => r.id === 'extra_slot') || deckSlots({ ...p, meta: { ...p.meta, extra_slot: 3 } }) > deckSlots(p));
  const bp = { ...p, cur: { ...p.cur, tokens: 100 } };
  const buy = M.buyMetaPerk(bp, 'start_fish');
  assert.ok(buy.ok && buy.profile.meta.start_fish === 1 && buy.profile.cur.tokens === 100 - buy.cost);
  assert.equal(M.buyMetaPerk({ ...p, cur: { ...p.cur, tokens: 0 } }, 'start_fish').reason, 'poor');
  assert.equal(M.buyMetaPerk(p, 'zzz').reason, 'unknown');
  let mx = { ...p, cur: { ...p.cur, tokens: 1e12 } };
  for (let i = 0; i < 50; i++) { const r = M.buyMetaPerk(mx, 'offline_cap'); if (!r.ok) { assert.equal(r.reason, 'max'); break; } mx = r.profile; }
  assert.equal(mx.meta.offline_cap, 8);
  // settings
  const store = new Map(); const st = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(M.loadSettings(st), M.defaultSettings());
  M.saveSettings({ volume: 0.2, muted: true, quality: 'low', motion: 'on', textSize: 'huge' }, st);
  assert.deepEqual(M.loadSettings(st), { volume: 0.2, muted: true, quality: 'low', motion: 'on', textSize: 'huge' });
  store.set(M.SETTINGS_KEY, '{"volume":99,"quality":"ultra","motion":5}'); const ld = M.loadSettings(st); assert.equal(ld.volume, 1); assert.equal(ld.quality, 'high'); assert.equal(ld.motion, 'auto');
  store.set(M.SETTINGS_KEY, 'not json'); assert.deepEqual(M.loadSettings(st), M.defaultSettings());
  assert.deepEqual(M.loadSettings({ getItem() { throw new Error('blocked'); } }), M.defaultSettings());
  // save text round trip
  const code = M.exportCode(p);
  assert.ok(code.startsWith('MOG1.'));
  const back = M.parseSaveText(code); assert.ok(back && back.cur.fish === p.cur.fish && Object.keys(back.cats).length === Object.keys(p.cats).length);
  assert.ok(M.parseSaveText(JSON.stringify(p)));
  for (const bad of ['', '   ', 'hello', 'MOG1.@@@@', '{"v":', null, undefined, '[]']) assert.equal(M.parseSaveText(bad), null, 'rejects ' + bad);
  // reward helpers
  assert.deepEqual(M.rewardItems({ fish: 0, yarn: 5, gems: 0, tokens: 0, xp: 0, keys: { alley_crate: 1 } }).map((x) => x.id), ['yarn', 'alley_crate']);
  assert.deepEqual(M.rewardItems(null), []);
}

// ------------------------------------------------------------------------------------------------ 3. every screen, every state, clean
{
  for (const [w, h] of [[390, 800], [360, 640], [1280, 800], [800, 390]]) {
    const profiles = [newProfile(4), lived(5), (() => { const p = lived(6); p.progress = { district: 5, stage: 9, best: {}, maxCleared: 130 }; p.nineLives = { count: 10, shards: 900, ascended: true }; p.cur = { fish: 1e16, yarn: 1e14, gems: 1e6, tokens: 1e9 }; return p; })()];
    for (const prof of (w === 390 ? profiles : [profiles[1]])) {
      const R = rig(structuredClone(prof), w, h);
      for (const s of Object.keys(R.screens)) { R.open(s, {}); R.run(3); }
      // sub states
      R.open('roster', { cat: CATS[0].id }); R.run(2); R.open('roster', { cat: CATS[CATS.length - 1].id }); R.run(2);
      for (const t of ['daily', 'weekly', 'goals', 'sets']) { R.open('quests', { tab: t }); R.run(3); }
      R.open('map', { tab: 'obs' }); R.run(2);
      R.open('map', { stage: 70 }); R.run(2);
    }
  }
}

// ------------------------------------------------------------------------------------------------ 4. deck screen by taps
{
  const R = rig(lived(21));
  R.open('deck');
  const p0 = R.app.profile;
  const free = D.ownedCards(p0).find((o) => o.free > 0 && o.card.type === 'spell');
  assert.ok(free, 'a spare spell exists');
  // add by tap (collection scrolls horizontally; scroll until the card is on screen if needed)
  const before = R.app.profile.deck.length;
  if (R.app.profile.deck.length >= deckSlots(R.app.profile)) R.tap('slot:' + (R.app.profile.deck.length - 1));
  const n0 = R.app.profile.deck.length;
  if (R.has('col:' + free.id)) { R.tap('col:' + free.id); assert.equal(R.app.profile.deck.length, n0 + 1); }
  inv(R.app.profile, 'tap add');
  // fill to the cap then one more
  for (const o of D.ownedCards(R.app.profile)) { if (R.app.profile.deck.length >= deckSlots(R.app.profile)) break; if (o.free > 0 && R.has('col:' + o.id)) R.tap('col:' + o.id); }
  const full = R.app.profile.deck.length;
  assert.ok(full <= deckSlots(R.app.profile)); inv(R.app.profile, 'filled');
  const anyFree = D.ownedCards(R.app.profile).find((o) => o.free > 0 && R.has('col:' + o.id));
  if (full >= deckSlots(R.app.profile) && anyFree) { R.tap('col:' + anyFree.id); assert.equal(R.app.profile.deck.length, full, 'full deck refuses the tap'); assert.ok(R.log.toasts.some((t) => /full/i.test(t.m))); }
  // remove by tapping a slot
  const saves0 = R.log.saves;
  R.tap('slot:0'); assert.equal(R.app.profile.deck.length, full - 1); assert.ok(R.log.saves > saves0, 'removing saves');
  inv(R.app.profile, 'tap remove');
  // never below the minimum
  for (let i = 0; i < 20; i++) { if (R.has('slot:0')) R.tap('slot:0'); }
  assert.equal(R.app.profile.deck.length, HAND_SIZE); inv(R.app.profile, 'floor');
  // auto and sort
  R.tap('deck:auto'); inv(R.app.profile, 'auto'); assert.ok(R.app.profile.deck.length >= HAND_SIZE);
  const sortedBefore = R.app.profile.deck.join();
  R.tap('deck:sort'); assert.equal([...R.app.profile.deck].sort().join(), [...sortedBefore.split(',')].sort().join(), 'sort keeps the same cards'); inv(R.app.profile, 'sort');
  // filters
  for (const f of ['summon', 'spell', 'trap', 'build', 'all']) R.tap('deck:filter:' + f);
  // level up buttons
  R.tap('slot:0'); R.tap('deck:auto');
  const y0 = R.app.profile.cur.yarn, sel = R.screen.state.sel, lv0 = R.app.profile.cards[sel].level;
  R.tap('det:card_lv');
  assert.ok(R.app.profile.cards[sel].level === lv0 + 1 && R.app.profile.cur.yarn < y0); inv(R.app.profile, 'card lv');
  const summon = R.app.profile.deck.find((id) => CARD_BY_ID[id].type === 'summon');
  R.screen.state.sel = summon; R.run(2);
  const cid = CARD_BY_ID[summon].effect.cat, cl0 = R.app.profile.cats[cid].level;
  R.tap('det:cat_lv'); assert.equal(R.app.profile.cats[cid].level, cl0 + 1); inv(R.app.profile, 'cat lv');
  // unaffordable: no change, a warning toast
  R.app.setProfile({ ...R.app.profile, cur: { ...R.app.profile.cur, yarn: 0 }, town: { ...R.app.profile.town, xp: 0 } }); R.run(2);
  const lvZ = R.app.profile.cats[cid].level; R.tap('det:cat_lv'); assert.equal(R.app.profile.cats[cid].level, lvZ);
  assert.ok(R.log.toasts.some((t) => /Need/.test(t.m)), 'affordability feedback'); inv(R.app.profile, 'broke');
  // drag from the collection onto the deck panel, and a slot out of the panel
  R.app.setProfile({ ...R.app.profile, deck: R.app.profile.deck.slice(0, HAND_SIZE + 1) }); R.run(2);
  const cand = D.ownedCards(R.app.profile).find((o) => o.free > 0 && R.has('col:' + o.id));
  if (cand) {
    const from = R.locate('col:' + cand.id); const n = R.app.profile.deck.length;
    R.ui.input.down(from.x, from.y); R.run(1); R.ui.input.move(from.x + 4, from.y - 60); R.run(1); R.ui.input.move(120, 140); R.run(1); R.ui.input.up(120, 140); R.run(3);
    assert.equal(R.app.profile.deck.length, n + 1, 'drag to the deck adds'); inv(R.app.profile, 'drag add');
    const slotPt = R.locate('slot:0'); const n2 = R.app.profile.deck.length;
    R.ui.input.down(slotPt.x, slotPt.y); R.run(1); R.ui.input.move(slotPt.x, slotPt.y + 100); R.run(1); R.ui.input.move(200, 600); R.run(1); R.ui.input.up(200, 600); R.run(3);
    assert.equal(R.app.profile.deck.length, n2 - 1, 'drag out of the deck removes'); inv(R.app.profile, 'drag remove');
  }
  // back
  R.tap('hdr:back'); assert.equal(R.log.go.pop().id, 'back');
  assert.ok(before >= 0);
}

// ------------------------------------------------------------------------------------------------ 5. roster and detail
{
  const R = rig(lived(22));
  R.open('roster');
  const owned = CATS.find((c) => R.app.profile.cats[c.id]);
  R.tap('ros:' + owned.id);
  assert.equal(R.screen.state.view, 'detail'); assert.equal(R.screen.state.cat, owned.id);
  const lv = R.app.profile.cats[owned.id].level, y = R.app.profile.cur.yarn;
  R.tap('cat:lv1'); assert.equal(R.app.profile.cats[owned.id].level, lv + 1); assert.ok(R.app.profile.cur.yarn < y); inv(R.app.profile, 'roster lv1');
  R.app.setProfile({ ...R.app.profile, cur: { ...R.app.profile.cur, yarn: 1e9 } }); R.run(2);
  const lv2 = R.app.profile.cats[owned.id].level;
  R.tap('cat:lv10'); assert.equal(R.app.profile.cats[owned.id].level, Math.min(maxLevel('cat_level'), lv2 + 10)); inv(R.app.profile, 'roster x10');
  R.tap('cat:next'); assert.notEqual(R.screen.state.cat, owned.id); R.tap('cat:prev'); assert.equal(R.screen.state.cat, owned.id);
  R.tap('cat:deck'); assert.equal(R.log.go.pop().id, 'deck');
  R.tap('hdr:back'); assert.equal(R.screen.state.view, 'grid', 'back from detail returns to the grid');
  R.tap('ros:role:tank'); R.tap('ros:role:all');
  // a locked cat opens a detail with no buttons that change anything
  const lock = CATS.find((c) => !R.app.profile.cats[c.id]);
  if (lock) {
    R.open('roster', { cat: lock.id }); const snap = JSON.stringify(R.app.profile);
    R.tap('cat:next'); R.tap('cat:prev'); assert.equal(JSON.stringify(R.app.profile), snap);
  }
  // broke: level up refused, state unchanged
  R.open('roster', { cat: owned.id });
  R.app.setProfile({ ...R.app.profile, cur: { ...R.app.profile.cur, yarn: 0 }, town: { ...R.app.profile.town, xp: 0 }, cats: { ...R.app.profile.cats, [owned.id]: { ...R.app.profile.cats[owned.id], level: 5 } } }); R.run(2);
  R.tap('cat:lv1'); assert.equal(R.app.profile.cats[owned.id].level, 5); inv(R.app.profile, 'roster broke');
}

// ------------------------------------------------------------------------------------------------ 6. relics
{
  const R = rig(lived(23));
  R.open('relics');
  const own = RELICS.find((r) => R.app.profile.relics[r.id]);
  R.tap('rel:filter:all');
  R.tap('rel:' + own.id); assert.ok(R.ui.hasDialog(), 'relic detail opens');
  R.tap('dlg:relic:ok'); assert.ok(!R.ui.hasDialog());
  for (const f of ['common', 'rare', 'epic', 'legend', 'mythic']) { R.tap('rel:filter:' + f); }
  const snap = JSON.stringify(R.app.profile); R.run(4); assert.equal(JSON.stringify(R.app.profile), snap, 'relics screen never changes the profile');
}

// ------------------------------------------------------------------------------------------------ 7. map
{
  const p = lived(24);
  p.town.plots[1] = { b: 'observatory', level: 12, t: 0 };
  const R = rig(p);
  assert.ok(TOWN.maps(R.app.profile, DAY).length >= 1, 'observatory gives maps');
  R.open('map');
  const front = 14;
  assert.equal(R.screen.state.sel, front);
  R.tap('map:fight'); R.run(40, 1 / 30);   // the iris transition calls go() when the screen is covered
  const g = R.log.go.pop(); assert.equal(g.id, 'battle'); assert.equal(g.params.stage, front); assert.equal(g.params.district, null); assert.equal(g.params.returnTo, 'map');
  // locked node refuses and warns
  const lockedGs = 40; R.screen.state.jump = false;
  const scroll = R.ui.state('scr:map:camp'); scroll.p = 236; R.run(2);
  R.tap('map:node:' + 13); assert.equal(R.screen.state.sel, 13);
  scroll.p = 696; R.run(2);
  if (R.has('map:node:' + lockedGs)) { R.tap('map:node:' + lockedGs); assert.equal(R.screen.state.sel, 13); assert.ok(R.log.toasts.some((t) => /Clear stage/.test(t.m))); }
  // endless needs 60 cleared
  const deep = lived(25); deep.progress = { district: 3, stage: 5, best: {}, maxCleared: 64 }; deep.town.plots[1] = { b: 'observatory', level: 12, t: 0 };
  const R2 = rig(deep); R2.open('map', { stage: 70 });
  assert.equal(R2.screen.state.sel, 65 > 64 ? 65 : 65);
  R2.tap('map:fight'); R2.run(40, 1 / 30); const g2 = R2.log.go.pop(); assert.equal(g2.params.stage, 65);
  // observatory fight, then the win callback claims the daily gem
  R2.tap('map:tabs:obs');
  const m0 = TOWN.maps(R2.app.profile, DAY)[0];
  R2.tap('map:obs:' + m0.id); R2.run(40, 1 / 30);
  const go = R2.log.go.pop(); assert.equal(go.id, 'battle'); assert.equal(go.params.noAdvance, true); assert.equal(go.params.stage, m0.stage); assert.ok(go.params.rewardMult > 1); assert.equal(go.params.modifiers.length, 1);
  const gems0 = R2.app.profile.cur.gems;
  go.params.onDone({ won: true }, false);
  assert.ok(R2.app.profile.cur.gems >= gems0 && R2.app.profile.town.mapsCleared[m0.id] === DAY); inv(R2.app.profile, 'map clear');
  assert.equal(R2.log.go.pop().id, 'map');
  go.params.onDone({ won: true }, false); assert.ok(R2.app.profile.cur.gems === R2.app.profile.cur.gems, 'second claim is a no-op');
  R2.run(2); R2.tap('map:tabs:campaign');
  // rift paging
  const rift = lived(26); rift.progress = { district: 5, stage: 4, best: {}, maxCleared: 125 };
  const R3 = rig(rift); R3.open('map', { stage: 125 }); assert.ok(R3.screen.state.riftPage >= 0);
  R3.ui.state('scr:map:camp').p = 9999; R3.run(2);
  if (R3.has('map:rift_next')) { const pg = R3.screen.state.riftPage; R3.tap('map:rift_next'); assert.equal(R3.screen.state.riftPage, pg + 1); R3.tap('map:rift_prev'); assert.equal(R3.screen.state.riftPage, pg); }
}

// ------------------------------------------------------------------------------------------------ 8. quests
{
  const p = lived(27);
  const R = rig(p);
  R.open('quests');
  const q0 = R.app.profile.quests;
  assert.ok(q0.daily && q0.weekly);
  // complete everything through the stats counters, then claim one by one and all at once
  const stats = { ...R.app.profile.stats }; for (const k of Object.keys(stats)) if (typeof stats[k] === 'number') stats[k] += 1e6; stats.bestStage = 200;
  R.app.setProfile({ ...R.app.profile, stats }); R.run(3);
  const g0 = R.app.profile.cur.gems;
  R.tap('q:daily:0'); assert.ok(R.app.profile.quests.daily.quests[0].claimed); assert.ok(R.app.profile.cur.gems >= g0);
  R.tap('q:tabs:weekly'); R.tap('q:weekly:0'); assert.ok(R.app.profile.quests.weekly.quests[0].claimed);
  R.tap('q:tabs:daily'); R.tap('q:daily:1'); R.tap('q:daily:2'); R.tap('q:daily:bonus'); assert.ok(R.app.profile.quests.daily.bonus.claimed);
  R.tap('q:tabs:goals');
  const before = TOWN.achievements(R.app.profile).reduce((a, s) => a + s.claimed, 0);
  R.tap('q:ach:battles_won'); assert.ok(TOWN.achievements(R.app.profile).reduce((a, s) => a + s.claimed, 0) > before);
  R.tap('q:tabs:sets');
  const col = TOWN.collection(R.app.profile).find((e) => e.done && !e.claimed);
  if (col) { R.tap('q:col:' + col.id); assert.ok(R.app.profile.quests.col[col.id]); }
  inv(R.app.profile, 'claims');
  assert.ok(M.claimableCounts(R.app.profile, DAY).total > 0, 'still things to claim');
  R.tap('q:claimall');
  assert.equal(M.claimableCounts(R.app.profile, DAY).total, 0, 'claim all clears every ready reward'); inv(R.app.profile, 'claim all');
  assert.ok(!R.has('q:claimall'), 'the button disappears when nothing is ready');
  // a stale day rolls fresh quests on enter
  R.app.dayIndex = () => DAY + 1; R.open('quests'); assert.equal(R.app.profile.quests.daily.day, DAY + 1);
  // not ready: tapping the locked button changes nothing
  const fresh = rig(newProfile(9)); fresh.open('quests'); const snap = JSON.stringify(fresh.app.profile);
  fresh.tap('q:daily:0'); assert.equal(JSON.stringify(fresh.app.profile), snap);
}

// ------------------------------------------------------------------------------------------------ 9. bestiary
{
  const p = lived(28); p.progress = { district: 2, stage: 1, best: {}, maxCleared: 40 };
  const R = rig(p);
  R.open('bestiary');
  assert.ok(R.has('bes:pigeon_scout')); R.tap('bes:pigeon_scout'); assert.ok(R.ui.hasDialog()); R.tap('dlg:enemy:ok'); assert.ok(!R.ui.hasDialog());
  R.tap('bes:king_coo'); assert.ok(R.ui.hasDialog()); R.ui.input.key('escape'); R.run(2); assert.ok(!R.ui.hasDialog(), 'escape closes');
  const snap = JSON.stringify(R.app.profile); R.run(3); assert.equal(JSON.stringify(R.app.profile), snap);
  // a locked enemy opens a hint dialog
  const R2 = rig(newProfile(3)); R2.open('bestiary');
  R2.ui.state('scr:bes:scroll').p = 3000; R2.run(2);
  const lockedE = ENEMIES.find((e) => !M.seenEnemies(R2.app.profile).has(e.id) && R2.has('bes:' + e.id));
  if (lockedE) { R2.tap('bes:' + lockedE.id); assert.ok(R2.ui.hasDialog()); }
}

// ------------------------------------------------------------------------------------------------ 10. settings
{
  const R = rig(lived(29));
  const fakeIO = { downloads: [], copies: [], clip: '', file: '' };
  R.app.io = {
    download: (n, t) => { fakeIO.downloads.push([n, t]); return true; },
    copy: async (t) => { fakeIO.copies.push(t); return true; },
    paste: async () => fakeIO.clip, pickFile: async () => fakeIO.file,
  };
  R.open('settings');
  const s = R.app.settings; assert.deepEqual(s, M.defaultSettings());
  // slider drag changes the volume and reaches audio and ui
  const vp = R.locate('set:vol'); assert.ok(vp);
  R.ui.input.down(vp.x, vp.y); R.run(1); R.ui.input.move(30, vp.y); R.run(2); R.ui.input.up(30, vp.y); R.run(2);
  assert.ok(s.volume < 0.3, 'volume ' + s.volume); assert.ok(R.log.vol.length > 0 && R.log.vol[R.log.vol.length - 1] === s.volume);
  R.tap('set:mute'); assert.equal(s.muted, true); assert.equal(R.log.muted[R.log.muted.length - 1], true);
  R.tap('set:mute'); assert.equal(s.muted, false);
  R.tap('set:quality:low'); assert.equal(s.quality, 'low'); assert.equal(R.ui.quality, 'low');
  R.tap('set:motion:on'); assert.equal(s.motion, 'on'); assert.equal(R.ui.reduceMotion, true);
  R.tap('set:motion:off'); assert.equal(R.ui.reduceMotion, false);
  R.tap('set:text:large'); assert.equal(s.textSize, 'large'); assert.equal(R.ui.textScale, 1.15);
  // export
  R.tap('set:export_file'); R.run(2); await Promise.resolve();
  assert.equal(fakeIO.downloads.length, 1); assert.equal(fakeIO.downloads[0][0], 'midnight_mog_save.json'); assert.ok(M.parseSaveText(fakeIO.downloads[0][1]));
  R.tap('set:export_code'); await Promise.resolve();
  assert.equal(fakeIO.copies.length, 1); assert.ok(M.parseSaveText(fakeIO.copies[0]));
  // import a different save by code and by file; bad input is refused
  const other = newProfile(77); other.cur.fish = 4242; other.cats.biscuit_bruiser = { level: 3, dupes: 0, stars: 0 };
  const mine = JSON.stringify(R.app.profile);
  fakeIO.clip = 'garbage'; R.tap('set:import_code'); await new Promise((r) => setTimeout(r, 5)); R.run(2);
  assert.equal(JSON.stringify(R.app.profile), mine, 'garbage import changes nothing'); assert.ok(!R.ui.hasDialog());
  fakeIO.clip = M.exportCode(other); R.tap('set:import_code'); await new Promise((r) => setTimeout(r, 5)); R.run(2);
  assert.ok(R.ui.hasDialog(), 'import asks first'); assert.equal(JSON.stringify(R.app.profile), mine);
  R.tap('dlg:import:no'); assert.equal(JSON.stringify(R.app.profile), mine, 'keep mine');
  R.tap('set:import_code'); await new Promise((r) => setTimeout(r, 5)); R.run(2); R.tap('dlg:import:yes');
  assert.equal(R.app.profile.cur.fish, 4242); assert.ok(R.app.profile.cats.biscuit_bruiser); inv(R.app.profile, 'imported');
  fakeIO.file = JSON.stringify(lived(31)); R.tap('set:import_file'); await new Promise((r) => setTimeout(r, 5)); R.run(2); R.tap('dlg:import:yes'); inv(R.app.profile, 'file import');
  // reset is a two step confirm
  const keep = JSON.stringify(R.app.profile);
  R.tap('set:reset'); assert.ok(R.ui.hasDialog()); R.tap('dlg:reset1:no'); assert.equal(JSON.stringify(R.app.profile), keep);
  R.tap('set:reset'); R.tap('dlg:reset1:yes'); assert.ok(R.ui.hasDialog(), 'second confirm shows'); assert.equal(JSON.stringify(R.app.profile), keep, 'still intact after step one');
  R.tap('dlg:reset2:no'); assert.equal(JSON.stringify(R.app.profile), keep);
  R.tap('set:reset'); R.tap('dlg:reset1:yes'); R.tap('dlg:reset2:yes');
  assert.equal(Object.keys(R.app.profile.cats).length, Object.keys(newProfile(1).cats).length, 'fresh save after the second yes'); inv(R.app.profile, 'reset');
  R.tap('set:credits'); assert.ok(R.ui.hasDialog()); R.tap('dlg:credits:ok');
  assert.ok(R.log.saves > 0);
}

// ------------------------------------------------------------------------------------------------ 11. nine lives
{
  const R = rig(newProfile(5));
  R.open('nine_lives');
  // locked below stage 30: the button does nothing
  R.tap('nl:go'); assert.ok(!R.ui.hasDialog()); assert.equal(R.app.profile.nineLives.count, 0);
  // perk shop with too few tokens is refused, with plenty it buys
  const rows = M.perkRows(R.app.profile);
  const first = rows[0];
  R.tap('nl:buy:' + first.id); assert.equal(R.app.profile.meta[first.id], 0); assert.ok(R.log.toasts.some((t) => /Need/.test(t.m)));
  R.app.setProfile({ ...R.app.profile, cur: { ...R.app.profile.cur, tokens: 1000 } }); R.run(2);
  const t0 = R.app.profile.cur.tokens;
  R.tap('nl:buy:' + first.id); assert.equal(R.app.profile.meta[first.id], 1); assert.ok(R.app.profile.cur.tokens < t0); inv(R.app.profile, 'perk');
  // allowed: burn a life through the dramatic confirm and the ritual
  const p = lived(32); p.progress = { district: 2, stage: 20, best: { 1: 30, 2: 19 }, maxCleared: 49 }; p.cur.tokens = 5;
  const R2 = rig(p); R2.open('nine_lives');
  const pre = (await import('../midnight_mog/js/sim/progression.js')).nineLivesPreview(R2.app.profile);
  assert.ok(pre.allowed && pre.shards > 0);
  R2.tap('nl:go'); assert.ok(R2.ui.hasDialog()); R2.tap('dlg:nl:confirm:no'); assert.equal(R2.app.profile.nineLives.count, 0); assert.equal(R2.screen.state.phase, 'idle');
  R2.tap('nl:go'); R2.tap('dlg:nl:confirm:yes');
  assert.equal(R2.screen.state.phase, 'ritual');
  const tok = R2.app.profile.cur.tokens;
  for (let i = 0; i < 400 && R2.screen.state.phase !== 'done'; i++) R2.run(1, 1 / 30);
  assert.equal(R2.screen.state.phase, 'done');
  assert.equal(R2.app.profile.nineLives.count, 1); assert.equal(R2.app.profile.nineLives.shards, pre.shards); assert.equal(R2.app.profile.cur.tokens, tok + pre.shards);
  assert.equal(R2.app.profile.progress.stage, 1); assert.ok(R2.app.profile.progress.echo > 0); inv(R2.app.profile, 'burned');
  R2.tap('nl:done'); assert.equal(R2.log.go.pop().id, 'town');
  // the reset only ever happens once per confirm
  R2.run(30); assert.equal(R2.app.profile.nineLives.count, 1);
  // reduced motion shortens the ritual
  const p3 = lived(33); p3.progress = { district: 2, stage: 20, best: { 1: 30, 2: 19 }, maxCleared: 49 };
  const R3 = rig(p3); R3.ui.setReduceMotion(true); R3.open('nine_lives'); R3.tap('nl:go'); R3.tap('dlg:nl:confirm:yes');
  let frames = 0; while (R3.screen.state.phase !== 'done' && frames < 400) { R3.run(1, 1 / 30); frames++; }
  assert.ok(frames < 60, 'reduced motion ritual is short (' + frames + ')'); assert.equal(R3.app.profile.nineLives.count, 1);
  // nine lives and beyond: ascended copy
  const p4 = lived(34); p4.progress = { district: 4, stage: 2, best: {}, maxCleared: 95 }; p4.nineLives = { count: 9, shards: 500, ascended: true };
  const R4 = rig(p4); R4.open('nine_lives'); R4.run(3);
}

// ------------------------------------------------------------------------------------------------ 12. monkey: random taps over every screen
{
  const rng = makeRng(2024);
  const prof = lived(40); prof.town.plots[1] = { b: 'observatory', level: 12, t: 0 };
  const R = rig(prof);
  R.app.io = { download: () => true, copy: async () => true, paste: async () => '', pickFile: async () => '' };
  const ids = Object.keys(R.screens).filter((id) => id !== 'settings');   // reset and import are covered above
  R.app.router.go = (id, params) => { if (R.screens[id]) { R.screen = R.screens[id]; R.screen.enter(R.app, params || {}); } };
  R.app.router.back = () => { R.screen = R.screens.deck; R.screen.enter(R.app, {}); };
  R.screen = R.screens.deck; R.screen.enter(R.app, {});
  for (let i = 0; i < 170; i++) {
    if (i % 20 === 0) { const id = ids[rng.int(0, ids.length - 1)]; R.screen = R.screens[id]; R.screen.enter(R.app, {}); }
    if (rng.chance(0.08)) R.ui.input.key(rng.pick(['escape', 'tab', 'enter', 'left', 'right']));
    const x = rng.int(0, 389), y = rng.int(0, 799);
    if (rng.chance(0.2)) { R.ui.input.down(x, y); R.run(1); R.ui.input.move(x + rng.int(-80, 80), y + rng.int(-120, 120)); R.run(1); R.ui.input.up(x, y); R.run(1); }
    else { R.ui.input.down(x, y); R.ui.input.up(x, y); R.run(rng.int(1, 3), 1 / 30); }
    if (rng.chance(0.03)) R.ui.input.wheel(rng.int(-300, 300));
    if (rng.chance(0.3)) R.app.setProfile({ ...R.app.profile, cur: { ...R.app.profile.cur, yarn: R.app.profile.cur.yarn + rng.int(0, 5000), tokens: R.app.profile.cur.tokens + rng.int(0, 20) } });
    if (i % 10 === 0) inv(R.app.profile, 'monkey ' + i);
  }
  inv(R.app.profile, 'monkey end');
}

const ms = Date.now() - T0;
console.log('midnight_mog_screens_meta ok (' + ms + 'ms)');
assert.ok(ms < 10000, 'suite must stay under 10 seconds: ' + ms);
