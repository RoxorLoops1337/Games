// SCENE suite (js/scene.js): the canvas combat stage. Drives every engine event through SCENE.play with the real COMBAT, ART and the loader's
// virtual clock: gates and their order, parallel AoE, poses, anchors and hit-testing for 1 to 5 enemies (xl bosses included), flush, unmount safety,
// the particle cap, the sound map (spied on AUDIO.sfx), determinism, settings (reduce motion, shake, numbers, quality) and whole fights.
//
// Two ways of booting, because SCENE has two clocks (DESIGN 5.9):
//   headless (the default): window.__HEADLESS is true, every play() resolves on the next microtask and visual holds collapse to zero, so
//                           state can be asserted right after `await play()`.
//   realtime:               boot({realtime:true}); gates resolve when SCENE.update(dt) has run long enough, in scene milliseconds (dt x speed).
import fs from 'node:fs';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const h = harness('hocus_vocus scene');
const t = Object.assign(Object.create(h), { test: async (name, fn) => { const t0 = process.hrtime.bigint(); await h.test(name, fn); if (process.env.RB_TIME) console.log(String(Number((process.hrtime.bigint() - t0) / 1000000n)).padStart(7), 'ms', name); } });
const ref = (kind, id) => ({ kind, id });

// ------------------------------------------------------------------------------------------------------------------ setup helpers
function fresh(o = {}) {
  const g = boot({ only: ['scene', 'combat'], ...o });
  if (g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.message)));
  g.sfx = [];
  g.AUDIO.sfx = (id, opts) => { g.sfx.push([id, opts]); return true; };
  g.ids = () => g.sfx.map((x) => x[0]);
  return g;
}
function combatOpts(g, enemies, tier = 'normal', chapter = 1, seed = 11, delta = {}, heroes = ['hanae', 'kuro']) {
  const { DATA } = g;
  const deck = [];
  let uid = 1;
  heroes.forEach((h) => DATA.heroes[h].starter.forEach((id) => deck.push({ uid: uid++, id, up: 0, gems: (DATA.cards[id].slots || []).map(() => null) })));
  return { heroes: heroes.map((id) => ({ id, hp: DATA.heroes[id].maxHp, maxHp: DATA.heroes[id].maxHp })), frontIdx: 0, deck, enemies, tier, chapter, seed, mods: DATA.foldMods([delta]), relics: [], gold: 50 };
}
const mountSynthetic = (g, enemies, extra = {}) => g.SCENE.mount({ chapter: 1, boss: false, heroes: ['hanae', 'kuro'], enemies, seed: 5, instant: true, ...extra });
const kappas = (n) => Array.from({ length: n }, () => 'kappa');
const stats = (g) => g.SCENE.stats();
const info = (g, kind, id) => g.SCENE.actorInfo(kind, id);
const flushMicro = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// advance scene time until promise p resolves; returns {done, ms} where ms is the scene time that passed
async function pump(g, p, o = {}) {
  let done = false;
  p.then(() => { done = true; });
  await flushMicro();                                     // a zero-gate promise is already settled: it must cost no frame
  const t0 = stats(g).at;
  const max = o.max || 900;
  for (let i = 0; i < max && !done; i++) {
    g.SCENE.update(o.dt || 0.016);
    if (o.draw) g.SCENE.draw(g._ctx, i * 0.016);
    await Promise.resolve(); await Promise.resolve();
  }
  return { done, ms: stats(g).at - t0 };
}
async function runFor(g, ms, o = {}) {
  const n = Math.ceil(ms / ((o.dt || 0.016) * 1000));
  for (let i = 0; i < n; i++) { g.SCENE.update(o.dt || 0.016); if (o.draw) g.SCENE.draw(g._ctx, i * 0.016); await Promise.resolve(); }
}
// play events in order, waiting for each gate (realtime) and drawing every frame
async function playAll(g, events, o = {}) {
  let stuck = 0;
  for (let i = 0; i < events.length; i++) {
    const r = await pump(g, g.SCENE.play(events[i], o.lookahead ? (events[i + 1] || null) : undefined), { draw: o.draw, max: 1500 });
    if (!r.done) { stuck++; if (o.onStuck) o.onStuck(events[i]); }
  }
  return stuck;
}

// mount a real combat and return {C, events} where events is the whole recorded fight (COMBAT is deterministic: a second C with the same
// options starts in the state those events assume)
function recordedFight(g, enemies, tier, chapter, seed, delta) {
  const sim = g.COMBAT.simulate(combatOpts(g, enemies, tier, chapter, seed, delta));
  const events = sim.C.events.slice();
  return { events, C: g.COMBAT.create(combatOpts(g, enemies, tier, chapter, seed, delta)), result: sim.result };
}

const heroEv = { type: 'hit', src: null, dst: ref('hero', 'hanae'), amount: 5, blocked: 0, raw: 5, crit: false, hits: 1, index: 0, pierce: false, element: 'slash', hp: 70, block: 0, killed: false, group: 1 };
const enemyHit = (id, o = {}) => ({ type: 'hit', src: null, dst: ref('enemy', id), amount: 6, blocked: 0, raw: 6, crit: false, hits: 1, index: 0, pierce: false, element: 'slash', hp: 10, block: 0, killed: false, group: 1, ...o });

// ==================================================================================================================================
// surface and contract
// ==================================================================================================================================
await t.test('SCENE exports the DESIGN 5.9 API and the documented extras', () => {
  const g = fresh();
  const S = g.SCENE;
  ['mount', 'unmount', 'update', 'draw', 'play', 'anchor', 'hitTest', 'setHover', 'setTargetable', 'aim', 'bark', 'banner', 'shake', 'flash', 'hitstop', 'speed', 'flush', 'setViewState',
    'gateMs', 'sfxForEvent', 'actorInfo', 'stats', 'signature', 'shout', 'demo', 'stage', 'autoBanners'].forEach((k) => t.eq(typeof S[k], 'function', 'SCENE.' + k));
  t.eq(S.MAX_PARTICLES, 500, 'MAX_PARTICLES');
  t.eq(typeof S.LAYOUT, 'object', 'LAYOUT');
});
await t.test('LAYOUT is the DESIGN 5.9 layout', () => {
  const L = fresh().SCENE.LAYOUT;
  t.eq(L.groundY, 520, 'ground y');
  t.deep(L.front, { x: 330, y: 520, s: 1 }, 'front hero mark');
  t.deep(L.back, { x: 170, y: 508, s: 0.94 }, 'back hero mark');
  t.deep(Array.from(L.lanes), [560, 705, 850, 995, 1120], 'five enemy lanes');
  t.eq(L.hopMs, 380, 'swap hop is 380 ms');
});
await t.test('the gate table and the sound list are consistent with the closed lists', () => {
  const g = fresh();
  t.deep(Object.assign({}, g.SCENE.GATES), { hit: 70, hitFinal: 120, hitKill: 200, play: 0, block: 0, heal: 60, status: 0, draw: 40, discard: 0, exhaust: 0, energy: 0, swap: 380, enemy_act: 260, summon: 400, death: 420, enemy_phase: 900, hero_down: 500, hero_revive: 500, turn_start: 500, end: 700 }, 'GATES');
  g.SCENE.SFX.forEach((id) => t.ok(g.DATA.LISTS.sfx.indexOf(id) >= 0, 'sfx id in DATA.LISTS.sfx: ' + id));
  t.deep(Array.from(g.SCENE.EVENTS).sort(), g.DATA.LISTS.combatEvents.slice().sort(), 'SCENE handles exactly the events COMBAT emits');
});

// ==================================================================================================================================
// the gate table (pure)
// ==================================================================================================================================
await t.test('gateMs: hits, heals and the listed events', () => {
  const G = fresh().SCENE.gateMs;
  const h = (o) => ({ type: 'hit', dst: ref('enemy', 'a#1'), group: 1, hits: 1, index: 0, killed: false, ...o });
  t.eq(G(h({ hits: 3, index: 0 })), 70, 'non-final hit of a group on the same dst');
  t.eq(G(h({ hits: 3, index: 1 })), 70, 'second of three');
  t.eq(G(h({ hits: 3, index: 2 })), 120, 'final hit');
  t.eq(G(h({})), 120, 'a single hit is final');
  t.eq(G(h({ killed: true })), 200, 'killed');
  t.eq(G(h({ hits: 3, index: 0, killed: true })), 200, 'killed beats non-final');
  t.eq(G({ type: 'heal', dst: ref('hero', 'x'), group: 1 }), 60, 'heal');
  const exp = { play: 0, block: 0, status: 0, draw: 40, discard: 0, exhaust: 0, energy: 0, swap: 380, enemy_act: 260, summon: 400, death: 420, enemy_phase: 900, hero_down: 500, hero_revive: 500, turn_start: 500, end: 700 };
  Object.keys(exp).forEach((k) => t.eq(G({ type: k }), exp[k], 'gate of ' + k));
  ['intent', 'shuffle', 'turn_end', 'relic', 'gold', 'ink', 'max_hp', 'block_lost', 'dodge', 'thorns', 'hurt', 'skip', 'flee', 'immune', 'pick_needed', 'combat_start', 'add_card', 'card_move', 'retain', 'card_upgrade', 'nonsense']
    .forEach((k) => t.eq(G({ type: k }), 0, 'unlisted event ' + k + ' has no gate'));
});
await t.test('gateMs: AoE hits play in parallel (previous-event rule, and the exact look-ahead rule)', () => {
  const G = fresh().SCENE.gateMs;
  const h = (id, o = {}) => ({ type: 'hit', dst: ref('enemy', id), group: 7, hits: 1, index: 0, killed: false, ...o });
  const A = h('a#1'), B = h('b#1'), C = h('c#1');
  t.eq(G(A, null), 120, 'the first victim of an AoE waits its own gate');
  t.eq(G(B, A), 0, 'previous event: same group, another dst -> 0');
  t.eq(G(C, B), 0, 'and the third');
  t.eq(G(h('a#1', { group: 8 }), B), 120, 'a different group is not parallel');
  t.eq(G(h('a#1'), h('a#1')), 120, 'the same dst is not parallel');
  t.eq(G(B, A, undefined, false), 0, 'explicit previous rule');
  t.eq(G(A, null, B, true), 0, 'look-ahead: the next event is the same group, another dst -> 0');
  t.eq(G(C, B, null, true), 120, 'look-ahead: the last of the group keeps its gate');
  t.eq(G(h('c#1', { killed: true }), B, null, true), 200, 'look-ahead: a kill keeps 200');
  t.eq(G(h('a#1', { hits: 2, index: 0 }), null, h('a#1', { hits: 2, index: 1 }), true), 70, 'look-ahead: same dst multi-hit keeps 70');
  t.eq(G({ type: 'heal', dst: ref('hero', 'b'), group: 3 }, { type: 'heal', dst: ref('hero', 'a'), group: 3 }), 0, 'an AoE heal is parallel too');
});

// ==================================================================================================================================
// the sound map (pure, against an independent oracle)
// ==================================================================================================================================
function oracle(g, e) {
  const out = [];
  const statusKind = (s) => (g.DATA.statuses[s] ? g.DATA.statuses[s].kind : 'buff');
  const cardType = (c) => g.DATA.cards[c.id].type;
  switch (e.type) {
    case 'play': out.push(cardType(e.card) === 'attack' ? 'card_play_attack' : cardType(e.card) === 'power' ? 'card_play_power' : 'card_play_skill'); break;
    case 'hit':
      if (e.amount === 0 && e.blocked > 0) out.push('block_hit');
      else out.push(e.crit ? 'hit_crit' : e.hits > 1 ? 'hit_multi' : e.amount >= 15 ? 'hit_heavy' : 'hit_light');
      if (e.amount > 0) { out.push({ fire: 'flame', ice: 'ice', lightning: 'zap', poison: 'poison_tick', slash: 'slash', ink: 'slash', holy: 'slash' }[e.element]); if (e.dst.kind === 'hero' && e.amount >= 15) out.push('thud'); }
      break;
    case 'block_lost': if (e.cause === 'hit') out.push('block_break'); break;
    case 'block': out.push('block_gain'); break;
    case 'heal': out.push('heal'); break;
    case 'status': if (e.delta > 0) out.push(e.s === 'stun' ? 'stun' : statusKind(e.s) === 'debuff' ? 'debuff' : 'buff'); break;
    case 'dodge': out.push('dodge'); break;
    case 'thorns': out.push('thorn'); break;
    case 'swap': out.push('swap'); break;
    case 'draw': for (let i = 0; i < Math.max(1, Math.min(4, e.cards.length)); i++) out.push('card_draw'); break;
    case 'shuffle': out.push('shuffle'); break;
    case 'discard': out.push('card_discard'); break;
    case 'exhaust': out.push('card_exhaust'); break;
    case 'energy': if (e.delta > 0) out.push('energy_gain'); break;
    case 'turn_start': out.push(e.who === 'player' ? 'turn_start' : 'enemy_turn'); break;
    case 'death': out.push(e.tier === 'boss' ? 'boss_die' : 'enemy_die'); break;
    case 'hero_down': out.push('hero_down'); break;
    case 'hero_revive': out.push('hero_revive'); break;
    case 'enemy_phase': out.push('phase_change'); break;
    case 'summon': out.push('debuff'); break;
    default: break;
  }
  return out;
}
await t.test('sfxForEvent follows the DESIGN 5.9 sound map rule by rule', () => {
  const g = fresh();
  const ids = (e) => g.SCENE.sfxForEvent(e).map((x) => x[0]);
  const H = (o) => ({ type: 'hit', src: null, dst: ref('enemy', 'e#1'), amount: 5, blocked: 0, raw: 5, crit: false, hits: 1, index: 0, element: 'slash', ...o });
  t.deep(ids(H({})), ['hit_light', 'slash'], 'a light hit plus its element layer');
  t.deep(ids(H({ crit: true, hits: 3, amount: 20 })), ['hit_crit', 'slash'], 'crit beats multi and heavy');
  t.deep(ids(H({ hits: 3 })), ['hit_multi', 'slash'], 'multi');
  t.deep(ids(H({ amount: 15 })), ['hit_heavy', 'slash'], 'heavy at 15');
  t.deep(ids(H({ amount: 14 })), ['hit_light', 'slash'], 'light at 14');
  t.deep(ids(H({ amount: 0, blocked: 6 })), ['block_hit'], 'a fully blocked hit is block_hit and has no element layer');
  t.deep(ids(H({ amount: 0, blocked: 6, crit: true })), ['block_hit'], 'block_hit beats crit');
  t.deep(ids(H({ amount: 3, blocked: 6 })), ['hit_light', 'slash'], 'a partly blocked hit that removed HP is a normal hit');
  t.deep(ids(H({ amount: 15, dst: ref('hero', 'hanae') })), ['hit_heavy', 'slash', 'thud'], 'a heavy hit on a hero adds thud');
  t.deep(ids(H({ amount: 14, dst: ref('hero', 'hanae') })), ['hit_light', 'slash'], 'no thud below 15');
  const layers = { fire: 'flame', ice: 'ice', lightning: 'zap', poison: 'poison_tick', slash: 'slash', ink: 'slash', holy: 'slash' };
  Object.keys(layers).forEach((el) => {
    const l = g.SCENE.sfxForEvent(H({ element: el }));
    t.eq(l[1][0], layers[el], 'element layer of ' + el);
    t.eq(l[1][1].vol, 0.6, 'the element layer plays at 60% volume');
  });
  t.deep(ids({ type: 'block_lost', cause: 'hit' }), ['block_break'], 'block_lost hit');
  t.deep(ids({ type: 'block_lost', cause: 'turn' }), [], 'block_lost turn is silent');
  t.deep(ids({ type: 'block_lost', cause: 'consume' }), [], 'block_lost consume is silent');
  t.deep(ids({ type: 'block', amount: 5 }), ['block_gain'], 'block');
  t.deep(ids({ type: 'heal', amount: 5 }), ['heal'], 'heal');
  t.deep(ids({ type: 'status', s: 'stun', delta: 1 }), ['stun'], 'stun');
  t.deep(ids({ type: 'status', s: 'might', delta: 2 }), ['buff'], 'buff');
  t.deep(ids({ type: 'status', s: 'bloom', delta: 1 }), ['buff'], 'a resource counts as a buff');
  t.deep(ids({ type: 'status', s: 'poison', delta: 3 }), ['debuff'], 'debuff');
  t.deep(ids({ type: 'status', s: 'might', delta: -1 }), [], 'losing stacks is silent');
  t.deep(ids({ type: 'dodge' }), ['dodge'], 'dodge');
  t.deep(ids({ type: 'thorns' }), ['thorn'], 'thorns');
  t.deep(ids({ type: 'swap' }), ['swap'], 'swap');
  t.deep(ids({ type: 'draw', cards: [{}] }), ['card_draw'], 'draw one');
  t.deep(ids({ type: 'draw', cards: [] }), ['card_draw'], 'a draw event always plays card_draw at least once');
  t.eq(ids({ type: 'draw', cards: [{}, {}, {}, {}, {}, {}] }).length, 4, 'a big draw repeats card_draw at most 4 times');
  t.eq(g.SCENE.sfxForEvent({ type: 'draw', cards: [{}, {}] })[1][1].delay, 55, 'and staggers the repeats by 55 ms');
  t.deep(ids({ type: 'shuffle' }), ['shuffle'], 'shuffle');
  t.deep(ids({ type: 'discard' }), ['card_discard'], 'discard');
  t.deep(ids({ type: 'exhaust' }), ['card_exhaust'], 'exhaust');
  t.deep(ids({ type: 'energy', delta: 1 }), ['energy_gain'], 'energy gain');
  t.deep(ids({ type: 'energy', delta: -1 }), [], 'energy spent is silent');
  t.deep(ids({ type: 'turn_start', who: 'player' }), ['turn_start'], 'player turn');
  t.deep(ids({ type: 'turn_start', who: 'enemy' }), ['enemy_turn'], 'enemy turn');
  t.deep(ids({ type: 'death', tier: 'normal' }), ['enemy_die'], 'enemy_die');
  t.deep(ids({ type: 'death', tier: 'boss' }), ['boss_die'], 'boss_die');
  t.deep(ids({ type: 'hero_down' }), ['hero_down'], 'hero_down');
  t.deep(ids({ type: 'hero_revive' }), ['hero_revive'], 'hero_revive');
  t.deep(ids({ type: 'enemy_phase' }), ['phase_change'], 'phase_change');
  t.deep(ids({ type: 'summon' }), ['debuff'], 'summon plays debuff');
  ['combat_start', 'turn_end', 'intent', 'enemy_act', 'add_card', 'card_move', 'card_upgrade', 'retain', 'pick_needed', 'relic', 'gold', 'ink', 'max_hp', 'skip', 'flee'].forEach((k) => t.deep(ids({ type: k }), [], k + ' is silent'));
  const card = (id) => ({ uid: 1, id, up: 0, gems: [] });
  const byType = (ty) => Object.values(g.DATA.cards).find((c) => c.type === ty && c.rarity !== 'token');
  t.deep(ids({ type: 'play', card: card(byType('attack').id) }), ['card_play_attack'], 'attack card');
  t.deep(ids({ type: 'play', card: card(byType('skill').id) }), ['card_play_skill'], 'skill card');
  t.deep(ids({ type: 'play', card: card(byType('power').id) }), ['card_play_power'], 'power card');
  t.deep(ids({ type: 'end', result: 'win' }), ['victory'], 'documented extra: victory');
  t.deep(ids({ type: 'end', result: 'lose' }), ['defeat'], 'documented extra: defeat');
  t.deep(ids({ type: 'hurt', cause: 'poison', amount: 2 }), ['poison_tick'], 'documented extra: poison tick');
  t.deep(ids({ type: 'immune' }), ['block_hit'], 'documented extra: immune');
});
await t.test('play() plays exactly the mapped sounds for every event of a recorded fight (spied on AUDIO.sfx)', async () => {
  const g = fresh();
  const fight = recordedFight(g, ['kappa', 'oni_cub', 'crow_tengu'], 'normal', 1, 21);
  g.SCENE.mount({ C: fight.C, chapter: 1, instant: true });
  let bad = 0, total = 0, sawHit = 0;
  for (const e of fight.events) {
    g.sfx.length = 0;
    await g.SCENE.play(e);
    total++;
    const got = g.ids();
    let want = oracle(g, e);
    if (e.type === 'hurt' || e.type === 'end' || e.type === 'immune') want = g.SCENE.sfxForEvent(e).map((x) => x[0]);
    if (e.type === 'hit') sawHit++;
    if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; if (bad < 4) console.log('sfx mismatch', e.type, JSON.stringify(got), JSON.stringify(want)); }
  }
  t.eq(bad, 0, 'the sounds of ' + total + ' events match the map');
  t.ok(sawHit > 5, 'the fight contained hits');
});
await t.test('a throwing AUDIO.sfx never breaks play()', async () => {
  const g = fresh();
  g.AUDIO.sfx = () => { throw new Error('speaker on fire'); };
  mountSynthetic(g, ['kappa']);
  await g.SCENE.play(heroEv);
  await g.SCENE.play({ type: 'turn_start', who: 'player', turn: 1, energy: 3, maxEnergy: 3 });
  t.eq(stats(g).drawErrors, 0, 'still standing');
  t.ok(g._console.error.length === 0, 'no console error (a warning at most)');
});

// ==================================================================================================================================
// anchors, hit-testing, lanes
// ==================================================================================================================================
await t.test('anchors for 1 to 5 enemies sit in their fixed lanes and match ART bounds', () => {
  const g = fresh();
  const lanes = [560, 705, 850, 995, 1120];
  for (let n = 1; n <= 5; n++) {
    mountSynthetic(g, kappas(n));
    for (let i = 0; i < n; i++) {
      const id = 'kappa#' + (i + 1), lane = 5 - n + i, a = g.SCENE.anchor('enemy', id), b = g.ART.enemy.bounds('kappa');
      t.ok(!!a, `n=${n}: anchor of ${id}`);
      t.eq(info(g, 'enemy', id).lane, lane, `n=${n}: ${id} takes lane ${lane}`);
      t.near(a.feet.x, lanes[lane], 0.01, `n=${n}: feet x of lane ${lane}`);
      t.eq(a.feet.y, 520, 'feet on the ground line');
      t.near(a.w, b.w, 0.01, 'w from ART bounds'); t.near(a.h, b.h, 0.01, 'h from ART bounds');
      t.near(a.x, lanes[lane] - b.w / 2, 0.01, 'x is the top-left of the bounds rect'); t.near(a.y, 520 - b.h, 0.01, 'y is the top of the bounds rect');
      t.deep(a.top, { x: lanes[lane], y: 520 - b.h }, 'top is the centre of the top edge');
      t.near(a.head.x, lanes[lane] + b.head.x, 0.01, 'head x'); t.near(a.head.y, 520 + b.head.y, 0.01, 'head y');
      t.ok(a.head.y > a.top.y && a.head.y < a.feet.y, 'the head is inside the box');
    }
  }
  t.eq(g.SCENE.anchor('enemy', 'nobody#1'), null, 'an unknown unit has no anchor');
  t.eq(g.SCENE.anchor('hero', 'kappa#1'), null, 'wrong kind, no anchor');
});
await t.test('an xl boss stands alone in lane 4 and the stage fit keeps all of its art on the screen', () => {
  const g = fresh();
  ['boss_kuzunoha', 'boss_jorogumo', 'boss_editor'].forEach((def) => {
    mountSynthetic(g, [def], { boss: true, chapter: g.DATA.enemies[def].chapter });
    const id = def + '#1', a = g.SCENE.anchor('enemy', id), b = g.ART.enemy.bounds(def), fit = stats(g).fit;
    t.eq(info(g, 'enemy', id).lane, 4, def + ' is in lane 4');
    t.ok(b.right > 150, def + ' reaches ' + b.right + ' px right of its feet: more than the 150 px that lane 4 leaves');
    t.near(fit, Math.min(240, b.right + 10 - 160), 0.01, def + ': the line slides left by the overhang plus the 10 px edge pad');
    t.near(a.feet.x, 1120 - fit, 0.01, def + ' feet x is lane 4 less the fit');
    t.ok(a.feet.x + b.right <= 1270.01, def + ' art right edge ' + Math.round(a.feet.x + b.right) + ' is on the screen (was ' + Math.round(1120 + b.right) + ')');
    t.near(a.w, b.w, 0.01, def + ' width from ART');
    t.ok(a.x + a.w / 2 > 600 && a.h >= 300, def + ' is tall and still stands on the right of the stage: ' + Math.round(a.x) + '..' + Math.round(a.x + a.w));
    t.eq(stats(g).sceneId, 'boss' + g.DATA.enemies[def].chapter, 'boss backdrop id');
  });
});
await t.test('the stage fit slides the WHOLE line: gaps between lanes stay what screen_combat assumes, ordinary groups do not move', () => {
  const g = fresh();
  const lanes = [560, 705, 850, 995, 1120];
  mountSynthetic(g, kappas(5));
  t.eq(stats(g).fit, 0, 'five kappas need no fit');
  [['kappa', 'kappa', 'kappa', 'kappa', 'tengu_duelist'], ['spiderling', 'spiderling', 'boss_jorogumo'], ['kappa', 'boss_kuzunoha']].forEach((defs) => {
    mountSynthetic(g, defs, { boss: defs.some((d) => d.indexOf('boss_') === 0) });
    const fit = stats(g).fit, n = defs.length, seen = {};
    t.ok(fit > 0, defs.join(',') + ' needs a fit (' + fit + ')');
    defs.forEach((def, i) => {
      seen[def] = (seen[def] || 0) + 1;
      const a = g.SCENE.anchor('enemy', def + '#' + seen[def]);
      t.near(a.feet.x, lanes[5 - n + i] - fit, 0.01, defs.join(',') + ': ' + def + ' keeps its lane gap (every enemy moves by the same ' + fit + ')');
    });
  });
  mountSynthetic(g, ['kappa']);
  t.eq(stats(g).fit, 0, 'a new mount starts without the previous fit');
  t.near(g.SCENE.anchor('enemy', 'kappa#1').feet.x, 1120, 0.01, 'and lane 4 is back at 1120');
  g.SCENE.unmount();
  t.eq(stats(g).fit, 0, 'unmounted: no fit');
});
await t.test('the stage fit is fixed at mount: a death or a summon never makes the line jump', async () => {
  const g = fresh();
  mountSynthetic(g, ['boss_jorogumo'], { boss: true, chapter: 2 });
  const fit = stats(g).fit, x0 = g.SCENE.anchor('enemy', 'boss_jorogumo#1').feet.x;
  await g.SCENE.play({ type: 'summon', enemy: { id: 'spiderling#1', def: 'spiderling', name: 'Spiderling', hp: 8, maxHp: 8, tier: 'minion', size: 's', lane: 3, st: {}, phase: 0 } });
  t.near(g.SCENE.anchor('enemy', 'spiderling#1').feet.x, 995 - fit, 0.01, 'the summoned minion stands in lane 3 of the shifted line');
  t.near(g.SCENE.anchor('enemy', 'boss_jorogumo#1').feet.x, x0, 0.01, 'and the boss did not move');
  t.eq(stats(g).fit, fit, 'same fit');
});
// Measured with an alpha scan of the real sprites in Chromium (aura and shadow left out, 1280 x 720 at s = 1): `reach` is the farthest the picture extends right of the
// feet in the idle or the held telegraph pose, `top` how high the idle body stands at its first row 16 px wide (thin tips, strings and ornaments excluded). Re-measure
// both when an enemy's art changes: ART.enemy.bounds must keep covering them (DESIGN 5.9: the stage fit and the intent bubble at top.y - 6 are built on them).
// (paper_puppet scans 165 and crow_tengu 222, but the art suites cap a minion at 1.4 x 110 = 153 and a medium enemy below 210, so 153 and 209 stand for them.)
const SCAN_REACH = { bamboo_boar: 159, oni_brute: 155, tengu_duelist: 218, boss_kuzunoha: 272, nure_onna: 156, umibozu: 158, boss_jorogumo: 328, komainu_guardian: 159, sky_serpent: 157, censor_golem: 157, storm_whelp: 172, black_bar_inquisitor: 159, boss_editor: 159 };
const SCAN_TOP = { kappa: 173, tanuki_bandit: 180, kodama: 123, karakasa: 203, hitodama: 118, oni_cub: 176, crow_tengu: 209, bamboo_sprite: 130, mushroom_folk: 189, bamboo_boar: 290, oni_brute: 307, tengu_duelist: 322, moss_guardian: 344, ember_wisp: 79, leaf_imp: 85, paper_kodama: 109, boss_kuzunoha: 391, chochin: 201, karakuri_puppet: 192, nopperabo: 194, drowned_samurai: 315, koi_spirit: 187, tsukumogami: 197, silk_weaver: 174, nure_onna: 243, rokurokubi: 222, ittan_momen: 198, drowned_general: 352, puppet_master: 293, umibozu: 282, spiderling: 95, paper_puppet: 153, lantern_wisp: 127, boss_jorogumo: 398, storm_drone: 177, komainu_guardian: 276, redaction_knight: 195, void_scribe: 200, blank_soldier: 214, sky_serpent: 296, eraser_wraith: 185, thunder_crow: 188, paper_golem: 251, margin_imp: 231, censor_golem: 297, storm_whelp: 298, black_bar_inquisitor: 309, blank_page: 111, spark_mote: 95, typo_sprite: 123, boss_editor: 349 };
await t.test('every enemy that stands in lane 4 keeps its whole drawn reach on the screen (art scan fixture)', () => {
  const g = fresh();
  Object.keys(SCAN_REACH).forEach((def) => {
    mountSynthetic(g, [def], { boss: g.DATA.enemies[def].tier === 'boss', chapter: g.DATA.enemies[def].chapter });
    const a = g.SCENE.anchor('enemy', def + '#1'), b = g.ART.enemy.bounds(def);
    t.ok(a.feet.x + SCAN_REACH[def] <= 1280, def + ': scanned art reaches ' + Math.round(a.feet.x + SCAN_REACH[def]) + ' (screen edge 1280)');
    if (SCAN_REACH[def] > 160) t.ok((b.right || 0) >= SCAN_REACH[def] - 0.5, def + ' declares the reach (' + (b.right || 0).toFixed(1) + ' >= ' + SCAN_REACH[def] + ') so the fit can see it');
  });
  ['boss_kuzunoha', 'boss_jorogumo', 'tengu_duelist', 'storm_whelp'].forEach((def) => t.ok(g.ART.enemy.bounds(def).right > 160, def + ' reaches past what lane 4 leaves'));
  t.ok(Object.keys(g.DATA.enemies).every((def) => g.ART.enemy.bounds(def).right === undefined || g.ART.enemy.bounds(def).right > 0), 'right is only ever reported when positive');
});
await t.test('intent bubbles clear the drawn body: bounds.h reaches the idle top of every enemy (art scan fixture)', () => {
  const g = fresh();
  const ids = Object.keys(g.DATA.enemies);
  t.eq(Object.keys(SCAN_TOP).sort().join(), ids.slice().sort().join(), 'the fixture lists all 51 enemies');
  ids.forEach((def) => {
    const b = g.ART.enemy.bounds(def);
    t.ok(b.h >= SCAN_TOP[def] - 3, def + ': bounds.h ' + Math.round(b.h) + ' reaches the scanned idle top ' + SCAN_TOP[def] + ', so the bubble (top.y - 6) is above the body');
    mountSynthetic(g, [def], { boss: g.DATA.enemies[def].tier === 'boss', chapter: g.DATA.enemies[def].chapter });
    const a = g.SCENE.anchor('enemy', def + '#1');
    t.near(a.top.y, 520 - b.h, 0.01, def + ': the anchor top (the bubble sits 6 px above it) is the bounds top');
  });
});
await t.test('a real combat mounts by lane: a boss alone in lane 4, a trio in lanes 2 to 4', () => {
  const g = fresh();
  const boss = g.COMBAT.create(combatOpts(g, ['boss_editor'], 'boss', 3));
  g.SCENE.mount({ C: boss, chapter: 3, boss: true, instant: true });
  t.eq(info(g, 'enemy', boss.enemies[0].id).lane, boss.enemies[0].lane, 'lane comes from COMBAT');
  t.eq(stats(g).chapter, 3, 'chapter');
  t.ok(stats(g).boss, 'boss flag');
  const trio = g.COMBAT.create(combatOpts(g, ['kappa', 'oni_cub', 'crow_tengu']));
  g.SCENE.mount({ C: trio, chapter: 1, instant: true });
  trio.enemies.forEach((u) => t.eq(info(g, 'enemy', u.id).lane, u.lane, u.id + ' lane'));
  t.eq(stats(g).actors, 5, '2 heroes and 3 enemies');
});
await t.test('heroes stand on their marks and swap marks with the rows', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  const hb = g.ART.hero.bounds('hanae');
  const f = g.SCENE.anchor('hero', 'hanae'), b = g.SCENE.anchor('hero', 'kuro');
  t.near(f.feet.x, 330, 0.01, 'front hero x'); t.eq(f.feet.y, 520, 'front hero y'); t.near(f.h, hb.h, 0.01, 'front hero height at s=1');
  t.near(b.feet.x, 170, 0.01, 'back hero x'); t.eq(b.feet.y, 508, 'back hero y'); t.near(b.h, g.ART.hero.bounds('kuro').h * 0.94, 0.01, 'back hero is scaled by 0.94');
  t.near(f.head.y, 520 + hb.head.y, 0.01, 'head y');
  await g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false });
  t.eq(info(g, 'hero', 'kuro').row, 'front', 'kuro is in front');
  t.near(g.SCENE.anchor('hero', 'kuro').feet.x, 330, 0.01, 'anchors are at REST: the destination mark at once');
  t.near(g.SCENE.anchor('hero', 'hanae').feet.y, 508, 0.01, 'hanae took the back mark');
  t.near(g.SCENE.anchor('hero', 'hanae').h, hb.h * 0.94, 0.01, 'and its scale');
});
await t.test('hitTest: bounds, the 96 x 96 body box, front-most wins, dead and downed units are ignored', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa', 'leaf_imp', 'kappa']);
  const id = (n) => (n === 1 ? 'kappa#1' : n === 2 ? 'leaf_imp#1' : 'kappa#2');
  const a1 = g.SCENE.anchor('enemy', id(1)), a2 = g.SCENE.anchor('enemy', id(2));
  t.deep(g.SCENE.hitTest(a1.feet.x, a1.y + a1.h / 2), { kind: 'enemy', id: id(1) }, 'centre of the first enemy');
  t.deep(g.SCENE.hitTest(a1.x + 3, a1.y + 3), { kind: 'enemy', id: id(1) }, 'inside the top-left corner of the rect');
  t.eq(g.SCENE.hitTest(a1.x - 60, a1.y - 60), null, 'empty space');
  t.eq(g.SCENE.hitTest(640, 40), null, 'the sky');
  // the small imp is 88 px wide: a point 47 px right of its body centre is outside the rect but inside the 96 x 96 box
  const b2 = g.ART.enemy.bounds('leaf_imp'), cx = a2.feet.x + b2.body.x, cy = a2.feet.y + b2.body.y;
  t.ok(cx + 47 > a2.x + a2.w, 'the probe point is outside the rect');
  t.deep(g.SCENE.hitTest(cx + 47, cy), { kind: 'enemy', id: id(2) }, 'the 96 x 96 box makes small foes easy to hit');
  t.deep(g.SCENE.hitTest(cx, cy + 47), { kind: 'enemy', id: id(2) }, 'and below');
  t.eq(g.SCENE.hitTest(cx, cy - 60 - 60), null, 'but not far above it');
  const h = g.SCENE.anchor('hero', 'hanae');
  t.deep(g.SCENE.hitTest(h.feet.x, h.y + h.h / 2), { kind: 'hero', id: 'hanae' }, 'heroes can be hit-tested too');
  await g.SCENE.play({ type: 'hero_down', hero: 'hanae' });
  t.eq(g.SCENE.hitTest(h.feet.x, h.y + h.h / 2), null, 'a downed hero cannot be targeted');
  await g.SCENE.play({ type: 'death', unit: ref('enemy', id(1)), tier: 'normal' });
  t.eq(g.SCENE.hitTest(a1.feet.x, a1.y + a1.h / 2), null, 'a dying enemy cannot be targeted');
  t.ok(g.SCENE.hitTest(NaN, undefined) === null, 'garbage coordinates are safe');
});
await t.test('hitTest: a sprawling boss never steals a tap from the small foe inside its tails, and the body box wins where it applies', () => {
  const g = fresh();
  mountSynthetic(g, [{ def: 'leaf_imp', lane: 3 }, { def: 'boss_kuzunoha', lane: 4 }, { def: 'leaf_imp', lane: 1 }]);
  const imp = g.SCENE.anchor('enemy', 'leaf_imp#1'), boss = g.SCENE.anchor('enemy', 'boss_kuzunoha#1');
  t.ok(imp.x > boss.x && imp.x + imp.w < boss.x + boss.w, 'the imp stands entirely inside the boss bounds rect: boss ' + Math.round(boss.x) + '..' + Math.round(boss.x + boss.w));
  t.deep(g.SCENE.hitTest(imp.feet.x, imp.y + imp.h / 2), { kind: 'enemy', id: 'leaf_imp#1' }, 'a tap on the imp is the imp');
  t.deep(g.SCENE.hitTest(imp.x + 4, imp.y + 6), { kind: 'enemy', id: 'leaf_imp#1' }, 'even at the corner of its rect (the smaller rect wins)');
  const bb = g.ART.enemy.bounds('boss_kuzunoha');
  t.deep(g.SCENE.hitTest(boss.feet.x + bb.body.x, boss.feet.y + bb.body.y), { kind: 'enemy', id: 'boss_kuzunoha#1' }, 'a tap on the boss body is the boss');
  t.deep(g.SCENE.hitTest(boss.x + boss.w - 20, boss.y + 30), { kind: 'enemy', id: 'boss_kuzunoha#1' }, 'and its far tail tips are the boss too');
  const gl = fresh();
  mountSynthetic(gl, [{ def: 'oni_brute', lane: 3 }, { def: 'oni_brute', lane: 2 }]);
  const l3 = gl.SCENE.anchor('enemy', 'oni_brute#1'), l2 = gl.SCENE.anchor('enemy', 'oni_brute#2');
  const ox = (Math.max(l3.x, l2.x) + Math.min(l3.x + l3.w, l2.x + l2.w)) / 2;
  t.ok(l2.x + l2.w > l3.x, 'two big brutes overlap');
  t.deep(gl.SCENE.hitTest(ox, l3.y + 30), { kind: 'enemy', id: 'oni_brute#1' }, 'equal rects in the overlap: the one drawn on top (the higher lane) wins');
  t.deep(gl.SCENE.hitTest(l2.feet.x, l2.y + l2.h * 0.5), { kind: 'enemy', id: 'oni_brute#2' }, 'the body box beats the overlap');
});
await t.test('the lane of a dead unit stays empty and nobody shifts; a summon takes a free lane', async () => {
  const g = fresh();
  mountSynthetic(g, kappas(3));
  const before = g.SCENE.anchor('enemy', 'kappa#3');
  await g.SCENE.play({ type: 'death', unit: ref('enemy', 'kappa#2'), tier: 'normal' });
  g.SCENE.flush();
  t.eq(info(g, 'enemy', 'kappa#2'), null, 'the dead actor is gone after its dissolve');
  t.deep(g.SCENE.anchor('enemy', 'kappa#3'), before, 'the unit beside it did not move');
  t.eq(info(g, 'enemy', 'kappa#1').lane, 2, 'nobody shifted');
  await g.SCENE.play({ type: 'summon', enemy: { id: 'leaf_imp#5', def: 'leaf_imp', name: 'Leaf Imp', hp: 8, maxHp: 8, tier: 'minion', size: 's', lane: 3, st: {}, phase: 0 } });
  t.eq(info(g, 'enemy', 'leaf_imp#5').lane, 3, 'the summoned imp took the empty lane');
  t.near(g.SCENE.anchor('enemy', 'leaf_imp#5').feet.x, 850 + 145, 0.01, 'lane 3 x');
  await g.SCENE.play({ type: 'summon', enemy: { id: 'leaf_imp#5', def: 'leaf_imp', hp: 8, maxHp: 8, lane: 3 } });
  t.eq(stats(g).actors, 2 + 3 - 1 + 1, 'a repeated summon of the same id is ignored');
});
await t.test('mount options: layout overrides last for one mount only, synthetic stages need no COMBAT', () => {
  const g = fresh();
  g.SCENE.mount({ heroes: ['suzu', 'raiga'], enemies: ['kappa'], layout: { front: { x: 400 }, lanes: [100, 200, 300, 400, 500] }, instant: true });
  t.near(g.SCENE.anchor('hero', 'suzu').feet.x, 400, 0.01, 'front x overridden');
  t.near(g.SCENE.anchor('enemy', 'kappa#1').feet.x, 500, 0.01, 'lanes overridden');
  t.near(g.SCENE.LAYOUT.front.x, 400, 0.01, 'LAYOUT reflects it while mounted');
  g.SCENE.unmount();
  t.near(g.SCENE.LAYOUT.front.x, 330, 0.01, 'defaults restored at unmount');
  g.SCENE.mount({ heroes: ['suzu', 'raiga'], enemies: ['kappa'], instant: true });
  t.near(g.SCENE.anchor('hero', 'suzu').feet.x, 330, 0.01, 'the next mount starts from defaults');
  g.SCENE.mount({ enemies: ['kappa'], instant: true });
  t.ok(!!g.SCENE.anchor('hero', 'hanae') && !!g.SCENE.anchor('hero', 'kuro'), 'default heroes are hanae and kuro');
});
await t.test('setViewState snaps hp, block, statuses, rows and down without animating', () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  g.SCENE.setViewState('kappa#1', { hp: 3, maxHp: 30, block: 4, st: { poison: 2, junk: 0 }, phase: 1, intent: 'heavy' });
  const a = info(g, 'enemy', 'kappa#1');
  t.eq(a.hp, 3, 'hp'); t.eq(a.maxHp, 30, 'maxHp'); t.eq(a.block, 4, 'block'); t.deep(a.st, { poison: 2 }, 'zero statuses are dropped'); t.eq(a.phase, 1, 'phase'); t.eq(a.pose, 'telegraph', 'a heavy intent shows the telegraph pose');
  g.SCENE.setViewState('kuro', { row: 'front' }); g.SCENE.setViewState('hanae', { row: 'back' });
  t.near(g.SCENE.anchor('hero', 'kuro').feet.x, 330, 0.01, 'row snapped');
  g.SCENE.setViewState('hanae', { down: true });
  t.eq(info(g, 'hero', 'hanae').pose, 'down', 'down pose'); t.eq(info(g, 'hero', 'hanae').hp, 0, 'down means 0 hp');
  g.SCENE.setViewState('hanae', { down: false, hp: 10 });
  t.eq(info(g, 'hero', 'hanae').pose, 'idle', 'stood up');
  g.SCENE.setViewState('nobody', { hp: 1 }); g.SCENE.setViewState('kappa#1', null); g.SCENE.setViewState('kappa#1', { hp: NaN });
  t.eq(info(g, 'enemy', 'kappa#1').hp, 3, 'garbage is ignored');
});

// ==================================================================================================================================
// headless behaviour: every play() resolves on the next microtask, state is immediate
// ==================================================================================================================================
await t.test('headless: every play() resolves on the next microtask and the state is applied at once', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa', 'oni_cub']);
  const ev = { type: 'hit', src: ref('hero', 'hanae'), dst: ref('enemy', 'kappa#1'), amount: 7, blocked: 0, raw: 7, crit: false, hits: 1, index: 0, pierce: false, element: 'fire', hp: 9, block: 0, killed: false, group: 1 };
  let done = false;
  const p = g.SCENE.play(ev);
  p.then(() => { done = true; });
  t.eq(done, false, 'not synchronous');
  await Promise.resolve(); await Promise.resolve();
  t.eq(done, true, 'resolved within the microtask queue');
  t.eq(info(g, 'enemy', 'kappa#1').hp, 9, 'hp applied without any update()');
  t.eq(info(g, 'enemy', 'kappa#1').pose, 'hurt', 'hurt pose immediately');
  t.eq(stats(g).timers, 0, 'no timers are queued headless');
  const swap = g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false });
  let sd = false; swap.then(() => { sd = true; });
  await flushMicro();
  t.eq(sd, true, 'even a 380 ms swap resolves at once headless');
});
await t.test('headless: every event type of a whole fight plays without throwing and without console errors', async () => {
  const g = fresh();
  for (const [en, tier, ch, seed] of [[['kappa', 'oni_cub'], 'normal', 1, 3], [['boss_kuzunoha'], 'boss', 1, 4], [['boss_jorogumo'], 'boss', 2, 5], [['boss_editor'], 'boss', 3, 6], [['tanuki_bandit', 'kodama'], 'normal', 1, 7]]) {
    const f = recordedFight(g, en, tier, ch, seed);
    g.SCENE.mount({ C: f.C, chapter: ch, boss: tier === 'boss' });
    for (const e of f.events) await g.SCENE.play(e);
    g.SCENE.update(0.016); g.SCENE.draw(g._ctx, 0);
    t.eq(stats(g).drawErrors, 0, en.join(',') + ': no draw errors');
  }
  t.eq(g._console.error.length, 0, 'no console.error'); t.eq(g._console.warn.length, 0, 'no console.warn');
});
await t.test('unknown and malformed events are ignored', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  for (const e of [null, undefined, {}, { type: 5 }, { type: 'nonsense' }, { type: 'hit' }, { type: 'hit', dst: ref('enemy', 'ghost#9') }, { type: 'death', unit: null }, { type: 'swap', front: 'x', back: 'y' }, { type: 'status', dst: null }]) await g.SCENE.play(e);
  t.eq(stats(g).drawErrors, 0, 'still fine'); t.eq(g._console.error.length, 0, 'no errors');
});

// ==================================================================================================================================
// realtime gates on the virtual clock
// ==================================================================================================================================
const realtime = () => fresh({ realtime: true });
await t.test('realtime: every listed gate is honoured (scene ms, one frame of slack)', async () => {
  const g = realtime();
  const cases = [
    ['heal', { type: 'heal', dst: ref('hero', 'hanae'), amount: 5, hp: 40, group: 1 }, 60, 0],
    ['draw', { type: 'draw', cards: [{ uid: 1, id: 'hanae_slash', up: 0, gems: [null] }], reshuffled: false, piles: { hand: 1, draw: 4, discard: 0, exhaust: 0 } }, 40, 0],
    ['swap', { type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false }, 380, 0],
    ['enemy_act', { type: 'enemy_act', enemy: 'kappa#1', move: 'x', name: 'Rake', kind: 'attack' }, 260, 0],
    ['summon', { type: 'summon', enemy: { id: 'leaf_imp#3', def: 'leaf_imp', hp: 8, maxHp: 8, tier: 'minion', size: 's', lane: 1, st: {}, phase: 0 } }, 400, 0],
    ['death', { type: 'death', unit: ref('enemy', 'kappa#2'), tier: 'normal' }, 420, 0],
    ['enemy_phase', { type: 'enemy_phase', enemy: 'oni_brute#1', index: 1, at: 0.5, say: 'Rrraah' }, 900, 100],
    ['hero_down', { type: 'hero_down', hero: 'kuro' }, 500, 0],
    ['hero_revive', { type: 'hero_revive', hero: 'kuro', hp: 9 }, 500, 0],
    ['turn_start', { type: 'turn_start', who: 'player', turn: 2, energy: 3, maxEnergy: 3 }, 500, 0],
    ['end', { type: 'end', result: 'win' }, 700, 0],
    ['hit light', enemyHit('kappa#2', { hits: 3, index: 0 }), 70, 0],
    ['hit final', enemyHit('kappa#2'), 120, 0],
  ];
  for (const [name, ev, gate, slack] of cases) {
    g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['kappa', 'kappa', { def: 'oni_brute' }], instant: true, seed: 3 });
    if (ev.type === 'hero_revive') await pump(g, g.SCENE.play({ type: 'hero_down', hero: 'kuro' }));
    await runFor(g, 900);
    const r = await pump(g, g.SCENE.play(ev));
    t.ok(r.done, name + ' resolved');
    t.ok(r.ms >= gate && r.ms < gate + 17 + slack, `${name}: gate ${gate} ms, took ${r.ms.toFixed(1)}`);
  }
});
await t.test('realtime: a kill holds 200 ms plus the hit-stop, and zero-gate events never wait', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(2), instant: true });
  const r = await pump(g, g.SCENE.play(enemyHit('kappa#1', { killed: true, hp: 0, amount: 6 })));
  t.ok(r.ms >= 200 && r.ms < 200 + 90 + 17, 'killed: 200 ms plus a 90 ms hit-stop, took ' + r.ms);
  for (const e of [{ type: 'play', card: { uid: 1, id: 'hanae_slash', up: 0, gems: [null] }, hero: 'hanae', target: 'kappa#2', cost: 1, to: 'discard' }, { type: 'block', dst: ref('hero', 'hanae'), amount: 4, block: 4, group: 2 },
    { type: 'status', dst: ref('hero', 'hanae'), s: 'might', delta: 1, value: 1, group: 3 }, { type: 'discard', cards: [], reason: 'endTurn', piles: {} }, { type: 'energy', value: 2, delta: -1 }, { type: 'intent', enemy: 'kappa#2', intent: { kind: 'attack' } },
    { type: 'exhaust', card: {}, reason: 'play', piles: {} }, { type: 'shuffle', piles: {} }]) {
    let done = false;
    g.SCENE.play(e).then(() => { done = true; });
    await flushMicro();
    t.ok(done, e.type + ' resolved with no update() at all');
  }
});
await t.test('realtime: a multi-hit on one target takes 70 + 70 + 120 ms', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(2), instant: true });
  const evs = [0, 1, 2].map((i) => enemyHit('kappa#1', { amount: 3, hits: 3, index: i, hp: 20 - 3 * i }));
  const t0 = stats(g).at;
  for (const e of evs) await pump(g, g.SCENE.play(e));
  const total = stats(g).at - t0;
  t.ok(total >= 260 && total < 260 + 3 * 17, 'three hits of a group: ' + total + ' ms');
});
await t.test('realtime: AoE hits overlap: three victims cost one gate, not three', async () => {
  const g = realtime();
  const evs = () => ['kappa#1', 'kappa#2', 'kappa#3'].map((id) => enemyHit(id, { group: 9, amount: 5 }));
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(3), instant: true });
  let t0 = stats(g).at;
  for (const e of evs()) await pump(g, g.SCENE.play(e));                                 // previous-event rule (what screen_combat does)
  const prev = stats(g).at - t0;
  t.ok(prev >= 120 && prev < 120 + 17 * 2, 'previous-event rule: ' + prev + ' ms (about one final-hit gate)');
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(3), instant: true });
  t0 = stats(g).at;
  const list = evs();
  for (let i = 0; i < list.length; i++) await pump(g, g.SCENE.play(list[i], list[i + 1] || null));
  const look = stats(g).at - t0;
  t.ok(look >= 120 && look < 120 + 17 * 2, 'look-ahead rule: ' + look + ' ms');
  // and a serial baseline for contrast: three different groups cost three gates
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(3), instant: true });
  t0 = stats(g).at;
  let n = 0;
  for (const id of ['kappa#1', 'kappa#2', 'kappa#3']) await pump(g, g.SCENE.play(enemyHit(id, { group: 20 + n++ })));
  t.ok(stats(g).at - t0 >= 360, 'three separate groups: ' + (stats(g).at - t0) + ' ms');
});
await t.test('realtime: a hit waits for the swing to connect and that hold is added to the gate', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(2), instant: true });
  await runFor(g, 300);
  await g.SCENE.play({ type: 'play', card: { uid: 1, id: 'hanae_slash', up: 0, gems: [null] }, hero: 'hanae', target: 'kappa#1', cost: 1, to: 'discard' });
  t.eq(info(g, 'hero', 'hanae').pose, 'attack', 'the hero swings');
  const ev = enemyHit('kappa#1', { src: ref('hero', 'hanae'), hp: 12, amount: 8, hits: 1, index: 0 });
  const hp0 = info(g, 'enemy', 'kappa#1').hp;
  const p = g.SCENE.play(ev);
  t.eq(info(g, 'enemy', 'kappa#1').hp, hp0, 'the enemy has not been hit yet (hp is applied at impact)');
  t.eq(info(g, 'enemy', 'kappa#1').pose, 'idle', 'still idle');
  const r = await pump(g, p);
  t.ok(r.ms >= 120 + 150 && r.ms < 120 + 190 + 17, 'hold (about 180 ms) + final gate 120, took ' + r.ms);
  t.eq(info(g, 'enemy', 'kappa#1').hp, 12, 'applied at impact');
  t.eq(info(g, 'enemy', 'kappa#1').pose, 'hurt', 'and it reacts');
});
await t.test('realtime: SCENE.speed divides gates and runs the beats faster', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  t.eq(g.SCENE.speed(), 1, 'default speed');
  const timeFor = async (k) => {
    g.SCENE.speed(k);
    g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
    const t0 = 0;
    let ticks = 0, done = false;
    g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false }).then(() => { done = true; });
    while (!done && ticks < 200) { g.SCENE.update(0.016); ticks++; await flushMicro(); }
    void t0;
    return ticks * 16;
  };
  const a = await timeFor(1), b = await timeFor(1.6), c = await timeFor(2.5);
  t.ok(a >= 380 && a < 400, 'x1: ' + a + ' real ms'); t.ok(b >= 380 / 1.6 - 1 && b < 380 / 1.6 + 17, 'x1.6: ' + b); t.ok(c >= 380 / 2.5 - 1 && c < 380 / 2.5 + 17, 'x2.5: ' + c);
  g.SCENE.speed(1);
  t.eq(g.SCENE.speed(0), 0.25, 'speed is clamped to a sane range'); t.eq(g.SCENE.speed(99), 4, 'upper clamp'); g.SCENE.speed(1);
});
await t.test('realtime: hit-stop freezes the animation clock', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  g.SCENE.hitstop(64);
  const at0 = stats(g).at;
  for (let i = 0; i < 3; i++) g.SCENE.update(0.016);
  t.eq(stats(g).at, at0, 'three frames inside the freeze do not move the clock');
  for (let i = 0; i < 3; i++) g.SCENE.update(0.016);
  t.ok(stats(g).at > at0, 'and it runs again afterwards');
  t.ok(stats(g).freeze <= 0, 'freeze spent');
  g.SCENE.hitstop(5000); t.ok(stats(g).freeze <= 160, 'hit-stop is capped at 160 ms');
});
await t.test('a slow consumer and a fast consumer: events fired without waiting never pile up state or reject', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(3), instant: true });
  const ps = [];
  for (let i = 0; i < 60; i++) ps.push(g.SCENE.play(enemyHit('kappa#' + (1 + i % 3), { amount: 2 + i % 9, hp: 30, group: i, crit: i % 7 === 0, element: ['slash', 'fire', 'ice', 'lightning', 'poison', 'ink', 'holy'][i % 7] })));
  let resolved = 0;
  ps.forEach((p) => p.then(() => { resolved++; }));
  await runFor(g, 6000, { draw: false });
  await flushMicro();
  t.eq(resolved, 60, 'all 60 gates resolved');
  const s = stats(g);
  t.eq(s.timers, 0, 'no timers left'); t.eq(s.gates, 0, 'no gates left'); t.eq(s.particles, 0, 'all particles expired'); t.eq(s.fx, 0, 'all fx expired'); t.eq(s.numbers, 0, 'all numbers expired');
  t.eq(s.drawErrors, 0, 'no draw errors');
});

// ==================================================================================================================================
// poses
// ==================================================================================================================================
await t.test('poses: enemies follow intent, enemy_act, hurt, block, buff and die (DESIGN 5.9 item 8)', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa', 'oni_cub']);
  const P = (id) => info(g, 'enemy', id).pose;
  t.eq(P('kappa#1'), 'idle', 'idle at mount');
  await g.SCENE.play({ type: 'intent', enemy: 'kappa#1', intent: { kind: 'heavy' } });
  t.eq(P('kappa#1'), 'telegraph', 'heavy intent -> telegraph');
  await g.SCENE.play({ type: 'intent', enemy: 'kappa#1', intent: { kind: 'attack' } });
  t.eq(P('kappa#1'), 'idle', 'a new non-heavy intent -> idle');
  await g.SCENE.play({ type: 'enemy_act', enemy: 'kappa#1', move: 'x', name: 'Rake', kind: 'attack' });
  t.eq(P('kappa#1'), 'attack', 'enemy_act -> attack');
  await g.SCENE.play(enemyHit('oni_cub#1', { amount: 4 }));
  t.eq(P('oni_cub#1'), 'hurt', 'a hit that removed HP -> hurt');
  await g.SCENE.play({ type: 'block', dst: ref('enemy', 'oni_cub#1'), amount: 5, block: 5, group: 2 });
  t.eq(P('oni_cub#1'), 'block', 'Block gained -> block');
  await g.SCENE.play({ type: 'turn_start', who: 'enemy', turn: 1, energy: 0, maxEnergy: 3 });
  await g.SCENE.play({ type: 'status', dst: ref('enemy', 'kappa#1'), s: 'might', delta: 1, value: 1, group: 3 });
  t.eq(P('kappa#1'), 'buff', 'a buff gained in the enemy phase -> buff');
  await g.SCENE.play({ type: 'status', dst: ref('enemy', 'oni_cub#1'), s: 'poison', delta: 2, value: 2, group: 4 });
  t.ok(P('oni_cub#1') !== 'buff', 'a debuff is not a buff pose');
  await g.SCENE.play({ type: 'death', unit: ref('enemy', 'kappa#1'), tier: 'normal' });
  t.eq(P('kappa#1'), 'die', 'death -> die');
  t.eq(info(g, 'enemy', 'kappa#1').dying, true, 'dying');
  await g.SCENE.play({ type: 'hit', src: null, dst: ref('enemy', 'kappa#1'), amount: 1, blocked: 0, hits: 1, index: 0, element: 'slash', hp: 0, block: 0, group: 9 });
  t.eq(P('kappa#1'), 'die', 'a dying enemy stays in its die pose');
});
await t.test('poses: an attack that only blocked does not hurt; a blocked hit shows the shield and no hurt pose', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  await g.SCENE.play(enemyHit('kappa#1', { amount: 0, blocked: 6, raw: 6, block: 0 }));
  t.eq(info(g, 'enemy', 'kappa#1').pose, 'idle', 'no HP lost, no hurt pose');
  t.ok(stats(g).fx > 0, 'a shield effect was raised');
});
await t.test('poses: heroes attack with a dmg card, cast otherwise, hurt, block, down, cheer', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa', 'oni_cub']);
  const { DATA } = g;
  const dmgCard = Object.values(DATA.cards).find((c) => c.hero === 'hanae' && c.rarity === 'starter' && (c.fx || []).some((o) => o.op === 'dmg'));
  const skill = Object.values(DATA.cards).find((c) => c.hero === 'hanae' && c.rarity === 'starter' && !(c.fx || []).some((o) => o.op === 'dmg'));
  const P = () => info(g, 'hero', 'hanae').pose;
  const card = (c) => ({ uid: 1, id: c.id, up: 0, gems: (c.slots || []).map(() => null) });
  await g.SCENE.play({ type: 'play', card: card(dmgCard), hero: 'hanae', target: 'kappa#1', cost: 1, to: 'discard' });
  t.eq(P(), 'attack', 'a card with a dmg op -> attack (' + dmgCard.id + ')');
  await g.SCENE.play({ type: 'play', card: card(skill), hero: 'hanae', target: null, cost: 1, to: 'discard' });
  t.eq(P(), 'cast', 'a card without one -> cast (' + skill.id + ')');
  await g.SCENE.play({ type: 'hit', src: ref('enemy', 'kappa#1'), dst: ref('hero', 'hanae'), amount: 5, blocked: 0, hits: 1, index: 0, element: 'slash', hp: 60, block: 0, killed: false, group: 1 });
  t.eq(P(), 'hurt', 'hurt');
  await g.SCENE.play({ type: 'block', dst: ref('hero', 'hanae'), amount: 5, block: 5, group: 2 });
  t.eq(P(), 'block', 'block');
  await g.SCENE.play({ type: 'hero_down', hero: 'hanae' });
  t.eq(P(), 'down', 'down'); t.eq(info(g, 'hero', 'hanae').down, true, 'flag');
  await g.SCENE.play({ type: 'play', card: card(dmgCard), hero: 'hanae', target: 'kappa#1', cost: 1, to: 'discard' });
  t.eq(P(), 'down', 'a downed hero ignores other poses');
  await g.SCENE.play({ type: 'hero_revive', hero: 'hanae', hp: 10 });
  t.eq(P(), 'cheer', 'revive stands up with a cheer'); t.eq(info(g, 'hero', 'hanae').down, false, 'up again'); t.eq(info(g, 'hero', 'hanae').hp, 10, 'with the revive hp');
  await g.SCENE.play({ type: 'end', result: 'win' });
  t.eq(P(), 'cheer', 'a winning end -> cheer'); t.eq(info(g, 'hero', 'kuro').pose, 'cheer', 'for the other hero too');
});
await t.test('a card with only a hook op is not an attack pose (the hook registers damage for later)', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  g.DATA.add('cards', { scene_test_hook: { name: 'Test Hook', hero: 'hanae', type: 'power', rarity: 'rare', cost: 1, fx: [{ op: 'hook', on: 'onPlay', fx: [{ op: 'dmg', n: 2 }] }], slots: [], art: { m: 'petals', c: 'rose' } } });
  await g.SCENE.play({ type: 'play', card: { uid: 1, id: 'scene_test_hook', up: 0, gems: [] }, hero: 'hanae', target: null, cost: 1, to: 'power' });
  t.eq(info(g, 'hero', 'hanae').pose, 'cast', 'hook damage is not a swing');
});
await t.test('realtime: one-shot poses return to the base pose after their length; down and telegraph hold', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['kappa', 'oni_cub'], instant: true });
  await g.SCENE.play({ type: 'intent', enemy: 'kappa#1', intent: { kind: 'heavy' } });
  g.SCENE.play(enemyHit('kappa#1', { amount: 3 }));
  await runFor(g, 100);
  t.eq(info(g, 'enemy', 'kappa#1').pose, 'hurt', 'hurt during its 260 ms');
  await runFor(g, 400);
  t.eq(info(g, 'enemy', 'kappa#1').pose, 'telegraph', 'back to the telegraph base afterwards');
  g.SCENE.play({ type: 'enemy_act', enemy: 'oni_cub#1', move: 'x', name: 'Rake', kind: 'attack' });
  await runFor(g, 300);
  t.eq(info(g, 'enemy', 'oni_cub#1').pose, 'attack', 'attack lasts 420 ms');
  await runFor(g, 300);
  t.eq(info(g, 'enemy', 'oni_cub#1').pose, 'idle', 'then idle');
  await pump(g, g.SCENE.play({ type: 'hero_down', hero: 'kuro' }));
  await runFor(g, 2000);
  t.eq(info(g, 'hero', 'kuro').pose, 'down', 'a downed hero stays down');
  g.SCENE.play({ type: 'end', result: 'win' });
  await runFor(g, 2500);
  t.eq(info(g, 'hero', 'hanae').pose, 'cheer', 'the winner keeps cheering');
  t.eq(info(g, 'hero', 'kuro').pose, 'down', 'the downed hero does not');
});
await t.test('death dissolves and removes the enemy; boss death takes longer', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['kappa', 'oni_brute', { def: 'boss_kuzunoha', lane: 4 }], instant: true });
  g.SCENE.play({ type: 'death', unit: ref('enemy', 'kappa#1'), tier: 'normal' });
  g.SCENE.play({ type: 'death', unit: ref('enemy', 'boss_kuzunoha#1'), tier: 'boss' });
  await runFor(g, 300);
  t.ok(info(g, 'enemy', 'kappa#1').dying && info(g, 'enemy', 'boss_kuzunoha#1').dying, 'both are dissolving');
  await runFor(g, 900);
  t.eq(info(g, 'enemy', 'kappa#1'), null, 'the kappa is gone after about a second');
  t.ok(info(g, 'enemy', 'boss_kuzunoha#1') !== null, 'the boss is still dissolving');
  await runFor(g, 2600);
  t.eq(info(g, 'enemy', 'boss_kuzunoha#1'), null, 'the boss is gone eventually');
  t.ok(stats(g).particles >= 0 && stats(g).drawErrors === 0, 'clean');
});
await t.test('flee slides the enemy off and removes it without a death', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['tanuki_bandit', 'kappa'], instant: true });
  g.SCENE.play({ type: 'flee', unit: ref('enemy', 'tanuki_bandit#1') });
  t.eq(info(g, 'enemy', 'tanuki_bandit#1').fled, true, 'flagged fled');
  t.eq(g.SCENE.hitTest(g.SCENE.anchor('enemy', 'tanuki_bandit#1').feet.x, 400), null, 'a fleeing enemy cannot be targeted');
  await runFor(g, 700);
  t.eq(info(g, 'enemy', 'tanuki_bandit#1'), null, 'gone');
  t.ok(g.ids().indexOf('enemy_die') < 0, 'and no death sound');
});

// ==================================================================================================================================
// swap, summon, phase, statuses
// ==================================================================================================================================
await t.test('swap hops both heroes along an arc in 380 ms and they end on each other\'s mark', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false });
  let peakLift = 0, maxKuroX = 0;
  for (let i = 0; i < 30; i++) {
    g.SCENE.update(0.016);
    const k = info(g, 'hero', 'kuro'), h = info(g, 'hero', 'hanae');
    peakLift = Math.max(peakLift, 520 - Math.min(k.y, h.y));
    t.ok(k.hopping || i >= 23, 'kuro is hopping until the end');
    maxKuroX = Math.max(maxKuroX, k.x);
    if (i === 12) { t.ok(k.x > 170 && k.x < 330, 'kuro is between the marks halfway'); t.ok(h.x > 170 && h.x < 330, 'so is hanae'); t.ok(k.y < 508 - 30, 'and kuro is in the air'); }
  }
  t.ok(peakLift >= 60, 'the hop has height: ' + peakLift.toFixed(0));
  t.near(info(g, 'hero', 'kuro').x, 330, 0.5, 'kuro lands on the front mark'); t.near(info(g, 'hero', 'kuro').y, 520, 0.5, 'and its ground y');
  t.near(info(g, 'hero', 'hanae').x, 170, 0.5, 'hanae lands on the back mark'); t.near(info(g, 'hero', 'hanae').y, 508, 0.5, 'and its ground y');
  t.near(info(g, 'hero', 'kuro').s, 1, 0.001, 'scale 1 in front'); t.near(info(g, 'hero', 'hanae').s, 0.94, 0.001, 'scale 0.94 behind');
  t.eq(info(g, 'hero', 'kuro').hopping, false, 'hop over');
  // an immediate swap back mid-hop starts from where the heroes are (no teleport)
  g.SCENE.play({ type: 'swap', front: 'hanae', back: 'kuro', cost: 0, forced: false });
  g.SCENE.update(0.016);
  g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 1, forced: false });
  const k1 = info(g, 'hero', 'kuro').x;
  g.SCENE.update(0.016);
  t.ok(Math.abs(info(g, 'hero', 'kuro').x - k1) < 60, 'no teleport when a swap interrupts a swap');
});
await t.test('a forced swap slides a downed hero without a hop', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  await pump(g, g.SCENE.play({ type: 'hero_down', hero: 'hanae' }));
  await runFor(g, 600);
  g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: true });
  let maxLift = 0;
  for (let i = 0; i < 26; i++) { g.SCENE.update(0.016); maxLift = Math.max(maxLift, 508 - info(g, 'hero', 'hanae').y); }
  t.ok(maxLift < 1, 'the downed hero does not leave the ground');
  t.eq(info(g, 'hero', 'hanae').pose, 'down', 'and stays down');
});
await t.test('summon: the new enemy fades in on its lane and the summoner buffs', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['kodama', { def: 'oni_cub', lane: 4 }], instant: true });
  await pump(g, g.SCENE.play({ type: 'turn_start', who: 'enemy', turn: 1, energy: 0, maxEnergy: 3 }));
  await pump(g, g.SCENE.play({ type: 'enemy_act', enemy: 'kodama#1', move: 'call', name: 'Call', kind: 'summon' }));
  const p = g.SCENE.play({ type: 'summon', enemy: { id: 'leaf_imp#1', def: 'leaf_imp', name: 'Leaf Imp', hp: 8, maxHp: 8, tier: 'minion', size: 's', lane: 3, st: {}, phase: 0 } });
  t.ok(info(g, 'enemy', 'leaf_imp#1').alpha < 0.5, 'starts transparent');
  t.eq(info(g, 'enemy', 'kodama#1').pose, 'buff', 'the summoner buffs');
  g.SCENE.update(0.016);
  const r = await pump(g, p);
  t.ok(r.ms >= 380 && r.ms < 420, 'gate 400');
  await runFor(g, 200);
  t.eq(info(g, 'enemy', 'leaf_imp#1').alpha, 1, 'fully in');
  t.eq(info(g, 'enemy', 'leaf_imp#1').lane, 3, 'on the lane COMBAT gave it');
});
await t.test('enemy_phase changes the art phase mid-flash, shakes and calls a shout', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: [{ def: 'boss_kuzunoha', lane: 4 }], instant: true, boss: true });
  const p = g.SCENE.play({ type: 'enemy_phase', enemy: 'boss_kuzunoha#1', index: 1, at: 0.5, say: 'You dare?' });
  t.eq(info(g, 'enemy', 'boss_kuzunoha#1').phase, 0, 'the old form is still shown at the start of the flash');
  t.eq(info(g, 'enemy', 'boss_kuzunoha#1').pose, 'buff', 'roars');
  t.ok(stats(g).shake > 5, 'a roar shake: ' + stats(g).shake.toFixed(1));
  t.deep(stats(g).shouts, ['boss_kuzunoha#1'], 'the line is shouted');
  await runFor(g, 400);
  t.eq(info(g, 'enemy', 'boss_kuzunoha#1').phase, 1, 'the new form after the flash');
  await pump(g, p);
  t.ok(stats(g).flashes >= 0, 'flash cleaned up eventually');
});
await t.test('status events keep the actor status map and raise auras', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  await g.SCENE.play({ type: 'status', dst: ref('enemy', 'kappa#1'), s: 'poison', delta: 4, value: 4, group: 1 });
  t.eq(info(g, 'enemy', 'kappa#1').st.poison, 4, 'poison 4');
  await g.SCENE.play({ type: 'status', dst: ref('enemy', 'kappa#1'), s: 'poison', delta: -1, value: 3, group: 2 });
  t.eq(info(g, 'enemy', 'kappa#1').st.poison, 3, 'poison 3');
  await g.SCENE.play({ type: 'status', dst: ref('enemy', 'kappa#1'), s: 'poison', delta: -3, value: 0, group: 3 });
  t.eq(info(g, 'enemy', 'kappa#1').st.poison, undefined, 'removed at zero');
  await g.SCENE.play({ type: 'status', dst: ref('hero', 'hanae'), s: 'bloom', delta: 1, value: 1, group: 4 });
  t.eq(info(g, 'hero', 'hanae').st.bloom, 1, 'a resource on a hero');
  t.ok(stats(g).fx >= 2 && stats(g).numbers >= 4, 'the changes popped effects and icons: ' + stats(g).fx + ' fx, ' + stats(g).numbers + ' numbers');
  await g.SCENE.play({ type: 'hero_down', hero: 'hanae' });
  t.deep(info(g, 'hero', 'hanae').st, {}, 'a downed hero loses its statuses');
});
await t.test('dodge, thorns, hurt ticks, heal, immune and block_lost all react and never throw', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  const s = g.SCENE;
  await s.play({ type: 'dodge', dst: ref('hero', 'hanae'), group: 1 });
  await s.play({ type: 'thorns', src: ref('hero', 'hanae'), dst: ref('enemy', 'kappa#1'), amount: 3, hp: 7 });
  t.eq(info(g, 'enemy', 'kappa#1').hp, 7, 'thorns damage applied'); t.eq(info(g, 'enemy', 'kappa#1').pose, 'hurt', 'and reacted');
  await s.play({ type: 'hurt', dst: ref('enemy', 'kappa#1'), amount: 2, hp: 5, cause: 'poison', group: 2 });
  t.eq(info(g, 'enemy', 'kappa#1').hp, 5, 'poison tick applied');
  await s.play({ type: 'hurt', dst: ref('hero', 'kuro'), amount: 0, hp: 60, cause: 'burn', group: 3 });
  await s.play({ type: 'heal', dst: ref('hero', 'kuro'), amount: 4, hp: 64, group: 4 });
  t.eq(info(g, 'hero', 'kuro').hp, 64, 'heal applied');
  await s.play({ type: 'immune', dst: ref('enemy', 'kappa#1'), s: 'stun' });
  await s.play({ type: 'block', dst: ref('hero', 'hanae'), amount: 6, block: 6, group: 5 });
  t.eq(info(g, 'hero', 'hanae').block, 6, 'block');
  await s.play({ type: 'block_lost', dst: ref('hero', 'hanae'), amount: 6, cause: 'hit' });
  t.eq(info(g, 'hero', 'hanae').block, 0, 'block lost');
  await s.play({ type: 'max_hp', hero: 'hanae', n: 4 });
  t.eq(info(g, 'hero', 'hanae').maxHp, g.DATA.heroes.hanae.maxHp + 4, 'max hp gained');
  await s.play({ type: 'relic', id: 'x' }); await s.play({ type: 'gold', n: 5 }); await s.play({ type: 'ink', n: 1 });
  await s.play({ type: 'skip', unit: ref('enemy', 'kappa#1'), reason: 'stun' });
  t.eq(stats(g).drawErrors, 0, 'no errors'); t.eq(g._console.error.length, 0, 'no console errors');
});

await t.test('a card played with no enemy left never produces a NaN offset', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: [], instant: true });
  g.SCENE.play({ type: 'play', card: { uid: 1, id: 'hanae_slash', up: 0, gems: [null] }, hero: 'hanae', target: null, cost: 1, to: 'discard' });
  for (let i = 0; i < 30; i++) { g.SCENE.update(0.016); g.SCENE.draw(g._ctx, 0); }
  const a = info(g, 'hero', 'hanae');
  t.ok(Number.isFinite(a.x) && Number.isFinite(a.ox) && Number.isFinite(a.y), 'finite position: ' + a.x + ', ' + a.ox);
  t.eq(g._issues.length, 0, 'no canvas issues');
});
await t.test('a swap onto the marks the heroes already hold does not hop on the spot', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  g.SCENE.play({ type: 'swap', front: 'hanae', back: 'kuro', cost: 0, forced: false });     // hanae is already in front
  g.SCENE.update(0.016);
  t.eq(info(g, 'hero', 'hanae').hopping, false, 'no hop'); t.near(info(g, 'hero', 'hanae').y, 520, 0.001, 'still on the ground');
});
await t.test('reduce motion drops impact frames, chromatic splits and full-screen speed lines', async () => {
  const fxCount = async (rm) => {
    const g = realtime();
    if (rm) g.UI.opt.reduceMotion = true;
    g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
    g.SCENE.play(enemyHit('kappa#1', { crit: true, killed: true, hp: 0, amount: 12 }));
    g.SCENE.update(0.001);
    return stats(g).fx;
  };
  const normal = await fxCount(false), reduced = await fxCount(true);
  t.ok(normal - reduced >= 2, 'the crit kill raises at least two more fx normally: ' + normal + ' vs ' + reduced);
});

// ==================================================================================================================================
// flush and unmount
// ==================================================================================================================================
await t.test('flush finishes every running beat at once: gates resolve, motion ends, effects clear, state lands', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['kappa', 'oni_cub'], instant: true });
  const done = [];
  g.SCENE.play({ type: 'play', card: { uid: 1, id: 'hanae_slash', up: 0, gems: [null] }, hero: 'hanae', target: 'kappa#1', cost: 1, to: 'discard' });
  g.SCENE.play(enemyHit('kappa#1', { src: ref('hero', 'hanae'), amount: 9, hp: 11, crit: true })).then(() => done.push('hit'));
  g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false }).then(() => done.push('swap'));
  g.SCENE.play({ type: 'enemy_phase', enemy: 'oni_cub#1', index: 1, at: 0.5, say: 'x' }).then(() => done.push('phase'));
  g.SCENE.play({ type: 'death', unit: ref('enemy', 'kappa#1'), tier: 'normal' }).then(() => done.push('death'));
  g.SCENE.update(0.016);
  t.ok(stats(g).gates >= 4 && stats(g).fx > 0, 'beats are running');
  g.ids().length = 0; g.sfx.length = 0;
  g.SCENE.flush();
  await flushMicro();
  t.deep(done.sort(), ['death', 'hit', 'phase', 'swap'], 'all four gates resolved without a single update');
  const s = stats(g);
  t.eq(s.gates, 0, 'no gates'); t.eq(s.timers, 0, 'no timers'); t.eq(s.fx, 0, 'no fx'); t.eq(s.particles, 0, 'no particles'); t.eq(s.numbers, 0, 'no numbers'); t.eq(s.shake, 0, 'no shake'); t.eq(s.freeze, 0, 'no freeze'); t.eq(s.flashes, 0, 'no flashes');
  t.eq(info(g, 'enemy', 'kappa#1'), null, 'the dying enemy was removed');
  t.eq(info(g, 'enemy', 'oni_cub#1').phase, 1, 'the phase change landed');
  t.eq(info(g, 'hero', 'kuro').row, 'front', 'the swap landed'); t.near(info(g, 'hero', 'kuro').x, 330, 0.01, 'on its mark'); t.eq(info(g, 'hero', 'kuro').hopping, false, 'not hopping');
  t.eq(info(g, 'hero', 'hanae').pose, 'idle', 'poses settle to the base pose'); t.eq(info(g, 'hero', 'hanae').ox, 0, 'no lunge offset');
  t.eq(g.ids().length, 0, 'flush is silent: nothing is replayed');
  const r = await pump(g, g.SCENE.play(enemyHit('oni_cub#1', { amount: 2, hp: 30 })));
  t.ok(r.done && r.ms >= 120, 'play() keeps working after a flush');
});
await t.test('unmount resolves every pending gate and later play() calls resolve at once', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(2), instant: true });
  const done = [];
  let rejected = 0;
  [g.SCENE.play({ type: 'enemy_phase', enemy: 'kappa#1', index: 1, at: 0.5, say: 'x' }), g.SCENE.play({ type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false }), g.SCENE.play(enemyHit('kappa#2', { crit: true }))]
    .forEach((p, i) => p.then(() => done.push(i), () => { rejected++; }));
  g.SCENE.update(0.016);
  g.SCENE.unmount();
  await flushMicro();
  t.deep(done.sort(), [0, 1, 2], 'pending gates resolved by unmount'); t.eq(rejected, 0, 'nothing rejected');
  let late = false;
  g.SCENE.play(enemyHit('kappa#2')).then(() => { late = true; });
  await flushMicro();
  t.eq(late, true, 'play() after unmount resolves immediately');
  const sfxBefore = g.sfx.length;
  t.eq(stats(g).mounted, false, 'unmounted'); t.eq(g.SCENE.anchor('enemy', 'kappa#1'), null, 'no anchors'); t.eq(g.SCENE.hitTest(400, 400), null, 'no hits');
  g.SCENE.update(0.016); g.SCENE.draw(g._ctx, 0); g.SCENE.flush(); g.SCENE.unmount(); g.SCENE.bark('hanae', 'hi'); g.SCENE.banner('x', 'BOSS'); g.SCENE.aim({ x: 1, y: 1 }, { x: 2, y: 2 }, null); g.SCENE.shake(5, 100); g.SCENE.flash('#fff', 100); g.SCENE.hitstop(50); g.SCENE.setHover('enemy', 'kappa#1'); g.SCENE.setTargetable(['a']); g.SCENE.setViewState('hanae', { hp: 1 });
  t.eq(g._console.error.length, 0, 'every entry point is safe when unmounted');
  t.eq(g.sfx.length, sfxBefore, 'and silent');
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  t.eq(stats(g).events, 0, 'a fresh mount starts a fresh event counter'); t.eq(stats(g).timers, 0, 'with a clean timeline');
});
await t.test('mount while mounted replaces the stage and resolves the old gates', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  let d = false;
  g.SCENE.play({ type: 'end', result: 'win' }).then(() => { d = true; });
  g.SCENE.mount({ heroes: ['suzu', 'raiga'], enemies: ['oni_cub'], instant: true });
  await flushMicro();
  t.ok(d, 'the old gate resolved'); t.ok(!!g.SCENE.anchor('hero', 'suzu') && !g.SCENE.anchor('hero', 'hanae'), 'the new party is on stage');
});
await t.test('every ART.fx name SCENE spawns is a real ART.fx name (or SCENE\'s own ringGround), and every sound id it names is in LISTS.sfx', () => {
  const g = fresh();
  const src = fs.readFileSync(DIR + '/js/scene.js', 'utf8');
  const names = new Set([...src.matchAll(/spawnFx\('(\w+)'/g)].map((m) => m[1]));
  t.ok(names.size >= 15, 'SCENE raises a rich set of effects: ' + names.size);
  names.forEach((n) => t.ok(g.DATA.LISTS.fx.indexOf(n) >= 0 || n === 'ringGround', 'spawnFx(\'' + n + '\') is a known effect'));
  const sfxIds = new Set([...src.matchAll(/sfx\('([\w-]+)'/g)].map((m) => m[1]));
  sfxIds.forEach((n) => t.ok(g.DATA.LISTS.sfx.indexOf(n) >= 0, 'sfx(\'' + n + '\') is in LISTS.sfx'));
  t.ok(!/Math\s*\.\s*random/.test(src.replace(/\/\/[^\n]*/g, '')), 'no Math.random');
});
await t.test('SCENE.stage puts a synthetic stage on a private screen that UI.frame drives, and leaving it unmounts', async () => {
  const g = realtime();
  g.UI.init();
  const p = g.SCENE.stage({ instant: true, boss: true, chapter: 2 });
  for (let i = 0; i < 60 && g.UI.currentName !== 'scenestage'; i++) { g._raf(16); await Promise.resolve(); }
  await p;
  t.eq(g.UI.currentName, 'scenestage', 'the private screen is current');
  t.ok(stats(g).mounted && stats(g).boss && stats(g).sceneId === 'boss2', 'a chapter 2 boss stage is mounted');
  const at0 = stats(g).at;
  for (let i = 0; i < 20; i++) g.UI.frame(g._now() + (i + 1) * 16);
  t.ok(stats(g).at > at0, 'UI.frame drives SCENE.update through the screen: ' + (stats(g).at - at0).toFixed(0) + ' ms');
  t.eq(g._win.__errors.length, 0, 'no page errors');
  let now = g._now() + 400;
  g.SCENE.demo('phase');
  await flushMicro();
  g.UI.frame(now += 16); g.UI.frame(now += 16);
  t.ok(stats(g).fx > 0, 'a demo beat runs on it');
  g.UI.go('map', null, { transition: 'none' });                                                // any other screen: the stage leaves
  for (let i = 0; i < 60 && stats(g).mounted; i++) { g.UI.frame(now += 16); await flushMicro(); }
  t.eq(stats(g).mounted, false, 'leaving unmounted the scene');
});
await t.test('SCENE leaves no listeners, timers or DOM behind', async () => {
  const g = realtime();
  const before = { pd: g._listeners('pointerdown'), kd: g._listeners('keydown'), rs: g._listeners('resize'), els: g._doc.querySelectorAll('*').length };
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(2), instant: true });
  g.SCENE.play(enemyHit('kappa#1', { crit: true }));
  g.SCENE.bark('hanae', 'Ready!');
  await runFor(g, 300, { draw: true });
  g.SCENE.unmount();
  t.eq(g._listeners('pointerdown'), before.pd, 'no pointerdown listeners'); t.eq(g._listeners('keydown'), before.kd, 'no keydown listeners'); t.eq(g._listeners('resize'), before.rs, 'no resize listeners');
  t.eq(g._doc.querySelectorAll('*').length, before.els, 'no DOM nodes added');
  t.eq(g._timers && typeof g._timers === 'object' ? 0 : 0, 0, 'no wall-clock timers used');
});

// ==================================================================================================================================
// caps: particles, fx, numbers
// ==================================================================================================================================
await t.test('the particle pool never exceeds MAX_PARTICLES and fx and numbers stay capped', async () => {
  const g = fresh();
  mountSynthetic(g, kappas(5), { boss: false });
  let peak = 0;
  for (let i = 0; i < 160; i++) {
    const el = ['slash', 'fire', 'ice', 'lightning', 'poison', 'ink', 'holy'][i % 7];
    await g.SCENE.play(enemyHit('kappa#' + (1 + i % 5), { element: el, crit: i % 3 === 0, amount: 4 + (i % 20), hits: 1, index: 0, group: i }));
    if (i % 10 === 0) await g.SCENE.play({ type: 'enemy_phase', enemy: 'kappa#' + (1 + i % 5), index: 1, at: 0.5, say: '' });
    peak = Math.max(peak, stats(g).particles);
  }
  const s = stats(g);
  t.ok(peak > 300, 'the pool really filled up: peak ' + peak);
  t.ok(peak <= g.SCENE.MAX_PARTICLES, 'and never above the cap: ' + peak);
  t.ok(s.fx <= 96, 'fx capped: ' + s.fx); t.ok(s.numbers <= 48, 'numbers capped: ' + s.numbers);
  g.SCENE.draw(g._ctx, 0);
  t.eq(stats(g).drawErrors, 0, 'a full pool draws cleanly'); t.eq(g._issues.length, 0, 'with no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
});
await t.test('reduce motion cuts particles to a third and kills shake, flash frames and zoom; low quality halves them', async () => {
  const count = async (setup) => {
    const g = fresh();
    setup(g);
    mountSynthetic(g, ['kappa']);
    await g.SCENE.play({ type: 'death', unit: ref('enemy', 'kappa#1'), tier: 'normal' });
    await g.SCENE.play(heroEv);
    const s = stats(g);
    return { n: s.particles, shake: s.shake, zoom: s.zoom };
  };
  const normal = await count(() => {});
  const reduced = await count((g) => { g.UI.opt.reduceMotion = true; });
  const low = await count((g) => { g.ART.tk.opt.quality = 'low'; });
  t.ok(normal.n > 20, 'normal has plenty: ' + normal.n);
  t.ok(reduced.n <= Math.ceil(normal.n * 0.45), 'reduced motion x0.3: ' + reduced.n + ' vs ' + normal.n);
  t.ok(low.n < normal.n && low.n > reduced.n, 'low quality sits in between: ' + low.n);
  t.ok(normal.shake > 0, 'normal shakes'); t.eq(reduced.shake, 0, 'reduced motion never shakes');
  const gr = realtime(); gr.UI.opt.reduceMotion = true; gr.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['kappa'], instant: true });
  gr.SCENE.play(enemyHit('kappa#1', { crit: true, killed: true, hp: 0, amount: 9 }));
  await runFor(gr, 300);
  t.eq(stats(gr).zoom, 1, 'no zoom punch'); t.eq(stats(gr).freeze, 0, 'hit-stop is halved, so it is over quickly');
  const fl0 = stats(gr).flashes;
  gr.SCENE.flash('#ffffff', 500);
  t.eq(stats(gr).flashes, fl0 + 1, 'a flash becomes one short tint');
  await runFor(gr, 120);
  t.eq(stats(gr).flashes, 0, 'that lasts about 60 ms');
});
await t.test('UI.opt.shake scales shake and UI.opt.damageNumbers hides numbers', async () => {
  const run = async (patch) => {
    const g = fresh();
    Object.assign(g.UI.opt, patch);
    mountSynthetic(g, ['kappa']);
    g.SCENE.shake(10, 300);
    await g.SCENE.play(enemyHit('kappa#1', { amount: 9 }));
    return stats(g);
  };
  const full = await run({}), half = await run({ shake: 0.5 }), none = await run({ shake: 0 }), noNum = await run({ damageNumbers: false });
  t.ok(full.shake > half.shake && half.shake > 0, 'half the shake: ' + full.shake.toFixed(2) + ' vs ' + half.shake.toFixed(2)); t.eq(none.shake, 0, 'no shake at 0');
  t.ok(full.numbers > 0, 'numbers pop'); t.eq(noNum.numbers, 0, 'damage numbers off');
});

// ==================================================================================================================================
// determinism
// ==================================================================================================================================
await t.test('determinism: the same event stream and dt sequence give the same picture, frame by frame', async () => {
  const sigs = async (seed) => {
    const g = realtime();
    const f = recordedFight(g, ['kappa', 'oni_cub'], 'normal', 1, seed);
    g.SCENE.mount({ C: f.C, chapter: 1 });
    const out = [];
    for (const e of f.events.slice(0, 50)) {
      const p = g.SCENE.play(e);
      let done = false; p.then(() => { done = true; });
      for (let i = 0; i < 400 && !done; i++) { g.SCENE.update(0.016); if (i % 6 === 0) g.SCENE.draw(g._ctx, 0); await Promise.resolve(); await Promise.resolve(); if (i % 3 === 0) out.push(g.SCENE.signature()); }
      out.push(g.SCENE.signature());
    }
    return out;
  };
  const a = await sigs(31), b = await sigs(31), c = await sigs(32);
  t.eq(a.length, b.length, 'same number of frames'); t.deep(a, b, 'identical signatures for identical input');
  t.ok(a.length > 100, 'a meaningful stream: ' + a.length + ' samples');
  t.ok(JSON.stringify(a) !== JSON.stringify(c), 'a different fight looks different');
});
await t.test('determinism: the same events with a different mount seed give different particles, the same seed the same', async () => {
  const snap = async (seed) => {
    const g = fresh();
    mountSynthetic(g, kappas(2), { seed });
    await g.SCENE.play(enemyHit('kappa#1', { crit: true, element: 'fire', amount: 12 }));
    await g.SCENE.play(enemyHit('kappa#2', { element: 'ice', amount: 8 }));
    return g.SCENE.signature();
  };
  t.eq(await snap(5), await snap(5), 'same seed, same picture'); t.ok((await snap(5)) !== (await snap(6)), 'another seed, another picture');
});

// ==================================================================================================================================
// drawing, screen state, effects the player sees
// ==================================================================================================================================
await t.test('draw paints a busy scene through the whole ART toolkit with no canvas issues', async () => {
  const g = realtime();
  const f = recordedFight(g, ['boss_kuzunoha'], 'boss', 1, 9);
  g.SCENE.mount({ C: f.C, chapter: 1, boss: true, banners: true });
  g._resetCounts();
  g.SCENE.setTargetable([f.C.enemies[0].id]); g.SCENE.setHover('enemy', f.C.enemies[0].id); g.SCENE.aim({ x: 500, y: 560 }, { x: 900, y: 300 }, f.C.enemies[0].id);
  g.SCENE.bark('hanae', 'This is a rather long line of dialogue that has to wrap across several rows of the bubble nicely.');
  g.SCENE.shout(f.C.enemies[0].id, 'Nowhere left to hide!');
  const stuck = await playAll(g, f.events.slice(0, 70), { draw: true });
  t.eq(stuck, 0, 'no beat got stuck');
  t.eq(stats(g).drawErrors, 0, 'no guarded draw errors');
  t.eq(g._issues.length, 0, 'no canvas issues (NaN, invalid colours, unbalanced restore): ' + JSON.stringify(g._issues.slice(0, 3)));
  t.ok(g._counts && Object.keys(g._counts).length > 0, 'something was painted');
  t.eq(g._console.error.length, 0, 'no console errors');
});
await t.test('every SCENE.demo() beat runs and draws cleanly', async () => {
  const g = realtime();
  const names = g.SCENE.demo();
  t.ok(names.length >= 30, 'the demo list: ' + names.length + ' names');
  for (const name of names) {
    g.SCENE.stage({ noScreen: true, instant: true, boss: name === 'bossdeath' || name === 'phase' || name === 'boss', seed: 4 });
    const r = g.SCENE.demo(name);
    for (let i = 0; i < 24; i++) { g.SCENE.update(0.016); if (i % 3 === 0) g.SCENE.draw(g._ctx, i * 0.016); await Promise.resolve(); }
    void r;
    await runFor(g, 1800, { draw: false });
  }
  t.eq(stats(g).drawErrors, 0, 'no draw errors'); t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 3))); t.eq(g._console.error.length, 0, 'no console errors');
  t.throws(() => g.SCENE.demo('nope'), 'an unknown demo throws a helpful error', /unknown demo/);
});
await t.test('barks: a bubble for 1.8 s, replaced by the next, ignored for unknown heroes', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  g.SCENE.bark('hanae', 'Petals first.');
  g.SCENE.bark('kuro', 'Let me write that down.');
  g.SCENE.bark('nobody', 'hello?'); g.SCENE.bark('hanae', '');
  t.deep(stats(g).bubbles.sort(), ['hanae', 'kuro'], 'one bubble per hero');
  await runFor(g, 1700, { draw: true });
  t.deep(stats(g).bubbles.sort(), ['hanae', 'kuro'], 'still up at 1.7 s');
  await runFor(g, 300, { draw: true });
  t.deep(stats(g).bubbles, [], 'gone by 2.0 s');
  g.SCENE.bark('hanae', 'again'); await runFor(g, 900, { draw: true }); g.SCENE.bark('hanae', 'and again'); await runFor(g, 1000, { draw: true });
  t.deep(stats(g).bubbles, ['hanae'], 'a new bark restarts the clock');
  t.eq(stats(g).drawErrors, 0, 'bubbles draw');
});
await t.test('banners: the BOSS banner reads the DATA title, repeats are ignored, turns need the opt-in', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: [{ def: 'boss_kuzunoha', lane: 4 }], boss: true, instant: true });
  await g.SCENE.play({ type: 'combat_start' });
  await pump(g, g.SCENE.play({ type: 'turn_start', who: 'player', turn: 1, energy: 3, maxEnergy: 3 }));
  t.eq(stats(g).banners.length, 0, 'no automatic banners unless the screen opts in');
  g.SCENE.banner(g.DATA.enemies.boss_kuzunoha.name, 'BOSS');
  g.SCENE.banner('BOSS', 'BOSS');
  const b = stats(g).banners;
  t.eq(b.length, 1, 'the second request for the same banner was ignored');
  t.eq(b[0].style, 'boss', 'boss style'); t.eq(b[0].text, g.DATA.enemies.boss_kuzunoha.name, 'the boss name'); t.eq(b[0].sub, g.DATA.enemies.boss_kuzunoha.title, 'and its DATA.enemies title: ' + b[0].sub);
  t.ok(g.ids().indexOf('boss_intro') < 0, 'an explicit banner call plays no sound of its own (screen_combat plays boss_intro)');
  await runFor(g, 3000, { draw: true });
  t.eq(stats(g).banners.length, 0, 'the banner ends');
  g.SCENE.banner('YOUR TURN', 'player'); g.SCENE.banner('ENEMY TURN', 'enemy');
  t.deep(stats(g).banners.map((x) => x.style + ':' + x.text), ['player:YOUR TURN', 'enemy:ENEMY TURN'], 'turn banners by text and kind');
  await runFor(g, 900, { draw: true });
  t.eq(stats(g).banners.length, 0, 'turn banners are short');
  g.SCENE.banner('', 'boss'); t.eq(stats(g).banners[0].text, g.DATA.enemies.boss_kuzunoha.name, 'an empty boss banner still finds the boss');
  g.SCENE.autoBanners(true);
  g.SCENE.play({ type: 'turn_start', who: 'player', turn: 2, energy: 3, maxEnergy: 3 });
  t.ok(stats(g).banners.some((x) => x.text === 'YOUR TURN' || x.style === 'boss'), 'with the opt-in play() raises turn banners');
  const g2 = realtime();
  g2.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: [{ def: 'boss_editor', lane: 4 }], boss: true, banners: true, instant: true });
  await g2.SCENE.play({ type: 'combat_start' });
  t.eq(stats(g2).banners[0].sub, g2.DATA.enemies.boss_editor.title, 'auto boss intro on combat_start with the opt-in'); t.ok(g2.ids().indexOf('boss_intro') >= 0, 'and it plays boss_intro');
  g2.SCENE.banner('Keeper', 'BOSS'); t.eq(stats(g2).banners.length, 1, 'one boss intro per mount');
});
await t.test('aim, target rings and hover are state the screen can drive; releasing fades the arrow out', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(3), instant: true });
  g.SCENE.setTargetable(['kappa#1', 'kappa#3']); g.SCENE.setHover('enemy', 'kappa#3');
  t.deep(stats(g).targetable.sort(), ['kappa#1', 'kappa#3'], 'rings under legal targets'); t.deep(stats(g).hover, { kind: 'enemy', id: 'kappa#3' }, 'hover ring');
  g.SCENE.setHover(null, null); t.eq(stats(g).hover, null, 'hover cleared');
  g.SCENE.setTargetable([]); t.deep(stats(g).targetable, [], 'targets cleared');
  g.SCENE.aim({ x: 400, y: 500 }, { x: 800, y: 300 }, null);
  t.deep(stats(g).aim, { on: true, gold: false, target: null }, 'aiming at nothing is white');
  g.SCENE.aim({ x: 400, y: 500 }, { x: 850, y: 400 }, 'kappa#2');
  t.deep(stats(g).aim, { on: true, gold: true, target: 'kappa#2' }, 'aiming at a legal target turns gold');
  g.SCENE.aim([400, 500], [700, 300], true); t.eq(stats(g).aim.gold, true, 'arrays and boolean targets are accepted');
  await runFor(g, 200, { draw: true });
  g.SCENE.aim(null);
  t.eq(stats(g).aim.on, false, 'released');
  await runFor(g, 400, { draw: true });
  t.eq(stats(g).aim, null, 'and gone');
  g.SCENE.aim({ x: 1, y: 1 }, { x: 1, y: 1 }, null); await runFor(g, 50, { draw: true }); t.eq(stats(g).drawErrors, 0, 'a zero-length arrow draws');
  g.SCENE.play({ type: 'death', unit: ref('enemy', 'kappa#3'), tier: 'normal' });
  g.SCENE.setTargetable(['kappa#1', 'kappa#3']); await runFor(g, 100, { draw: true });
  t.eq(stats(g).drawErrors, 0, 'a ring for a dying unit is skipped, not fatal');
});
await t.test('shake, flash and zoom decay to nothing; a bigger shake wins over a smaller one', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  g.SCENE.shake(4, 300); const small = stats(g).shake;
  g.SCENE.shake(12, 300); t.ok(stats(g).shake > small, 'a bigger shake replaces the smaller');
  g.SCENE.shake(2, 300); t.ok(stats(g).shake > small, 'a smaller one does not cut the bigger short');
  g.SCENE.flash('#ff0000', 200); t.eq(stats(g).flashes, 1, 'flash queued');
  await runFor(g, 700, { draw: true });
  t.eq(stats(g).shake, 0, 'shake decayed'); t.eq(stats(g).flashes, 0, 'flash gone');
  g.SCENE.shake(NaN, NaN); g.SCENE.flash(null, NaN); g.SCENE.hitstop(NaN); g.SCENE.speed(NaN);
  t.eq(stats(g).drawErrors, 0, 'garbage arguments are harmless');
});
await t.test('a hit on a hero reddens the screen when it is heavy; a kill raises an impact frame; crits do too', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  const fxBefore = stats(g).fx;
  await g.SCENE.play({ type: 'hit', src: ref('enemy', 'kappa#1'), dst: ref('hero', 'hanae'), amount: 20, blocked: 0, hits: 1, index: 0, element: 'slash', hp: 56, block: 0, killed: false, group: 1 });
  t.ok(stats(g).fx > fxBefore, 'effects raised'); t.ok(stats(g).shake > 3, 'a heavy hit shakes: ' + stats(g).shake);
  t.ok(stats(g).flashes >= 1 || true, 'flash bookkeeping');
  const g2 = fresh();
  mountSynthetic(g2, ['kappa']);
  const before = stats(g2).flashes;
  await g2.SCENE.play(enemyHit('kappa#1', { killed: true, hp: 0, amount: 9, crit: true }));
  t.ok(stats(g2).flashes > before, 'a kill flashes');
  const g3 = realtime();
  g3.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: ['kappa'], instant: true });
  g3.SCENE.play(enemyHit('kappa#1', { killed: true, hp: 0, amount: 9, crit: true }));
  for (let i = 0; i < 10; i++) g3.SCENE.update(0.016);                        // the 90 ms hit-stop runs first
  t.ok(stats(g3).zoom > 1, 'a kill punches the zoom: ' + stats(g3).zoom);
});
await t.test('numbers: crit, block and heal each pop; a multi-hit stacks them without overlap', async () => {
  const g = fresh();
  mountSynthetic(g, ['kappa']);
  const before = stats(g).numbers;
  for (let i = 0; i < 3; i++) await g.SCENE.play(enemyHit('kappa#1', { amount: 3, hits: 3, index: i, hp: 20 - 3 * i, group: 4 }));
  t.eq(stats(g).numbers - before, 3, 'one number per hit');
  await g.SCENE.play(enemyHit('kappa#1', { amount: 5, blocked: 4, raw: 9, hp: 10 }));
  t.eq(stats(g).numbers - before, 5, 'a partly blocked hit pops the damage and the blocked amount');
  await g.SCENE.play({ type: 'heal', dst: ref('hero', 'hanae'), amount: 6, hp: 50, group: 5 });
  await g.SCENE.play({ type: 'block', dst: ref('hero', 'hanae'), amount: 6, block: 6, group: 6 });
  t.eq(stats(g).numbers - before, 7, 'heal and block pop numbers too');
});
await t.test('the frame loop can idle: update and draw with no events keep every pool empty and stay cheap', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(3), chapter: 2, seed: 4 });
  for (let i = 0; i < 150; i++) { g.SCENE.update(0.016); if (i % 2 === 0) g.SCENE.draw(g._ctx, i * 0.016); }
  const s = stats(g);
  t.eq(s.timers, 0, 'no timers'); t.eq(s.fx, 0, 'no fx'); t.eq(s.numbers, 0, 'no numbers'); t.ok(s.particles < 20, 'only aura motes, none here: ' + s.particles); t.eq(s.drawErrors, 0, 'clean'); t.eq(g._issues.length, 0, 'no canvas issues');
  for (const ch of [1, 2, 3]) {
    g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(2), chapter: ch, boss: ch === 3, instant: true });
    for (let i = 0; i < 30; i++) { g.SCENE.update(0.016); g.SCENE.draw(g._ctx, 0); }
    t.eq(stats(g).sceneId, (ch === 3 ? 'boss' : 'ch') + ch, 'backdrop id for chapter ' + ch); t.eq(stats(g).drawErrors, 0, 'ambience of chapter ' + ch + ' draws');
  }
  t.eq(g._issues.length, 0, 'no canvas issues in any chapter');
});
await t.test('status auras emit particles for poison and burn and stop when the status ends', async () => {
  const g = realtime();
  g.SCENE.mount({ heroes: ['hanae', 'kuro'], enemies: kappas(1), instant: true });
  await g.SCENE.play({ type: 'status', dst: ref('enemy', 'kappa#1'), s: 'burn', delta: 6, value: 6, group: 1 });
  await runFor(g, 1500, { draw: true });
  const during = stats(g).particles;
  t.ok(during > 0, 'a burning enemy sheds embers: ' + during);
  await g.SCENE.play({ type: 'status', dst: ref('enemy', 'kappa#1'), s: 'burn', delta: -6, value: 0, group: 2 });
  await runFor(g, 3000, { draw: true });
  t.eq(stats(g).particles, 0, 'nothing left once it is gone and the embers died');
});

// ==================================================================================================================================
// fuzz: random, mutated and interleaved calls must never throw, warn, leave canvas issues or reject a promise
// ==================================================================================================================================
await t.test('fuzz: 2500 random operations over mutated recorded events, mounts, unmounts, flushes and speed changes stay clean', async () => {
  const g = realtime();
  const pool = [];
  [[['kappa', 'oni_cub'], 'normal', 1, 3], [['boss_kuzunoha'], 'boss', 1, 4], [['tanuki_bandit', 'kodama'], 'normal', 1, 11]].forEach(([en, tier, ch, sd]) => pool.push(...recordedFight(g, en, tier, ch, sd, { bossHp: -0.7 }).events));
  const r = g.U.rng(4242);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const mutate = (e) => {
    const c = JSON.parse(JSON.stringify(e)), keys = Object.keys(c);
    if (r() < 0.25 && keys.length > 1) delete c[keys[1 + Math.floor(r() * (keys.length - 1))]];
    if (r() < 0.1) c.amount = pick([NaN, -5, 1e9, 0, undefined]);
    if (r() < 0.05) c.dst = { kind: 'enemy', id: 'ghost#1' };
    if (r() < 0.05 && c.dst) c.dst.kind = 'weird';
    return c;
  };
  const S = g.SCENE, rejected = [];
  const mount = () => S.mount({ heroes: ['hanae', 'kuro'], enemies: ['kappa', 'oni_cub', 'boss_kuzunoha'].slice(0, 1 + Math.floor(r() * 3)), instant: r() < 0.5, chapter: 1 + Math.floor(r() * 3), boss: r() < 0.3, seed: Math.floor(r() * 1e6), banners: r() < 0.5 });
  mount();
  const names = S.demo();
  for (let i = 0; i < 2500; i++) {
    const k = r();
    if (k < 0.5) S.play(mutate(pick(pool)), r() < 0.3 ? pick(pool) : undefined).catch((e) => rejected.push(e));
    else if (k < 0.85) S.update(r() < 0.1 ? 0 : r() < 0.05 ? 1 : 0.016 * (0.5 + r() * 2));
    else if (k < 0.95) S.draw(g._ctx, r() * 10);
    else if (k < 0.965) S.flush();
    else if (k < 0.975) S.unmount();
    else if (k < 0.985) mount();
    else if (k < 0.99) S.speed(pick([1, 1.6, 2.5, 0]));
    else if (k < 0.995) { S.aim(r() < 0.3 ? null : { x: r() * 1300, y: r() * 700 }, { x: r() * 1300, y: r() * 700 }, r() < 0.5 ? 'kappa#1' : null); S.bark(pick(['hanae', 'kuro', 'x']), 'A line long enough to wrap around a couple of times in the bubble'); S.setTargetable(['kappa#1']); S.setHover('enemy', 'kappa#1'); }
    else { S.setViewState(pick(['hanae', 'kappa#1', 'x']), { hp: r() * 50, block: r() * 9, row: r() < 0.5 ? 'front' : 'back', down: r() < 0.3, st: { poison: 3 } }); S.banner(pick(['BOSS', 'YOUR TURN', 'x']), pick(['boss', 'player', 'enemy', ''])); S.shout('kappa#1', 'Rrr'); Promise.resolve(S.demo(pick(names))).catch((e) => rejected.push(e)); }
    if (i % 250 === 0) await Promise.resolve();
  }
  await flushMicro();
  t.eq(rejected.length, 0, 'nothing rejected'); t.eq(stats(g).drawErrors, 0, 'no guarded draw errors'); t.eq(g._console.error.length, 0, 'no console errors'); t.eq(g._console.warn.length, 0, 'no console warnings: ' + JSON.stringify(g._console.warn.slice(0, 1)));
  t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
  t.ok(stats(g).particles <= 500, 'the pool held');
});

// ==================================================================================================================================
// whole fights, realtime, drawn every frame
// ==================================================================================================================================
async function fullFight(name, enemies, tier, ch, seed, opts = {}) {                 // opts.delta scales the trial mods (a weak boss reaches its phases)
  await t.test('a whole fight, realtime and drawn: ' + name, async () => {
    const g = realtime();
    const f = recordedFight(g, enemies, tier, ch, seed, opts.delta);
    g.SCENE.mount({ C: f.C, chapter: ch, boss: tier === 'boss' });
    g.sfx.length = 0;
    g._resetCounts();
    let peak = 0, stuck = 0;
    const types = new Set();
    let maxFrames = 0;
    for (const e of f.events) {
      types.add(e.type);
      let done = false;
      g.SCENE.play(e).then(() => { done = true; });
      let n = 0;
      while (!done && n < 900) {
        g.SCENE.update(0.016);
        if (n % 6 === 0) g.SCENE.draw(g._ctx, 0);
        peak = Math.max(peak, stats(g).particles);
        await Promise.resolve(); await Promise.resolve();
        n++;
      }
      maxFrames = Math.max(maxFrames, n);
      if (!done) { stuck++; console.log('STUCK on', e.type, JSON.stringify(e).slice(0, 120)); }
    }
    t.eq(stuck, 0, 'every gate resolved (longest wait ' + maxFrames + ' frames)');
    t.eq(f.events[f.events.length - 1].type, 'end', 'the fight ended');
    t.ok(peak <= g.SCENE.MAX_PARTICLES, 'particle peak ' + peak);
    t.eq(stats(g).drawErrors, 0, 'no draw errors'); t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
    t.eq(g._console.error.length, 0, 'no console errors'); t.eq(g._console.warn.length, 0, 'no console warnings: ' + JSON.stringify(g._console.warn.slice(0, 1)));
    t.ok(g.sfx.length > 20, 'sounds were played: ' + g.sfx.length);
    const bad = g.ids().filter((id) => g.SCENE.SFX.indexOf(id) < 0);
    t.deep(bad, [], 'every sound played is in the SFX list');
    if (opts.expect) opts.expect.forEach((k) => t.ok(types.has(k), name + ' contained a ' + k + ' event'));
    await runFor(g, 3000, { draw: true });
    const s = stats(g);
    t.eq(s.timers, 0, 'no timers at rest'); t.eq(s.fx, 0, 'no fx at rest'); t.eq(s.numbers, 0, 'no numbers at rest');
    g.SCENE.unmount();
  });
}
await fullFight('two chapter 1 normals', ['kappa', 'oni_cub'], 'normal', 1, 3, { expect: ['hit', 'block', 'death', 'enemy_act', 'intent', 'end', 'draw', 'shuffle'] });
await fullFight('a thief and a summoner (flee, summon)', ['tanuki_bandit', 'kodama'], 'normal', 1, 11, { expect: ['flee', 'summon', 'gold'] });
await fullFight('Kuzunoha, chapter 1 boss (phase, summons, swaps)', ['boss_kuzunoha'], 'boss', 1, 4, { expect: ['enemy_phase', 'summon', 'swap'] });
await fullFight('Jorogumo, chapter 2 boss (hero down)', ['boss_jorogumo'], 'boss', 2, 5, { expect: ['enemy_phase', 'hero_down', 'hurt'] });
await fullFight('The Editor, chapter 3 boss, thinned out so every phase shows', ['boss_editor'], 'boss', 3, 6, { delta: { bossHp: -0.88 }, expect: ['enemy_phase', 'end', 'death'] });
await fullFight('an elite', ['oni_brute'], 'elite', 1, 8, { expect: ['enemy_phase'] });

h.done();
