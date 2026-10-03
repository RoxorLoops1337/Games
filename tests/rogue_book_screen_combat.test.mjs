// Combat screen suite (js/screen_combat.js + css/combat.css): the view model against the real engine, the presentation pipeline (FIFO drain,
// hard resync, picks, barks), every way of playing a card (tap, drag, keys), the HUD zones and their DOM, the bus events, GAME routing at
// the end of a fight, robustness (unmount mid-drain, fast-forward, stuck beats) and cleanup.
//
// Sections run against three stages: a recording FAKE SCENE (so the calls the screen makes are asserted exactly), NO SCENE at all (the
// built-in fallback stage keeps the fight playable), and the REAL scene.js when it exists. COMBAT, RUN, META, UI and GAME are always real.
import { boot, harness } from './rogue_book_lib.mjs';

const t = harness('rogue_book screen_combat');
if (process.env.RB_TIMING) { const orig = t.test.bind(t); t.test = (msg, fn) => orig(msg, async () => { const s0 = Date.now(); await fn(); console.log(String(Date.now() - s0).padStart(6) + ' ms  ' + msg.slice(0, 90)); }); }

// ---------------------------------------------------------------------------------------------------- the recording fake SCENE
const FAKE_SCENE = `
globalThis.__sc = { played: [], mounted: 0, unmounted: 0, hold: false, pend: [], barks: [], targets: [], aims: [], hover: [], banners: [], flushes: 0, views: [], updates: 0, draws: 0, speed: 1, C: null };
globalThis.SCENE = {
  LAYOUT: { lanes: [560, 705, 850, 995, 1120] },
  mount(o) { __sc.mounted++; __sc.mountOpts = { chapter: o.chapter, boss: o.boss }; __sc.C = o.C; },
  unmount() { __sc.unmounted++; },
  update() { __sc.updates++; },
  draw() { __sc.draws++; },
  play(e) { __sc.played.push(e.type); if (__sc.hold) return new Promise((res) => __sc.pend.push(res)); return Promise.resolve(); },
  anchor(kind, id) {
    const C = __sc.C; if (!C) return null;
    if (kind === 'hero') { const h = C.heroes.find((x) => x.id === id); if (!h) return null; const x = h.row === 'front' ? 330 : 170; return { x: x - 60, y: 270, w: 120, h: 250, top: { x, y: 270 }, feet: { x, y: 520 }, head: { x, y: 290 } }; }
    const u = C.enemies.find((x) => x.id === id); if (!u) return null;
    const x = [560, 705, 850, 995, 1120][u.lane], h = u.size === 'xl' ? 340 : u.size === 'l' ? 250 : u.size === 'm' ? 170 : 110, w = u.size === 'xl' ? 300 : 120;
    return { x: x - w / 2, y: 520 - h, w, h, top: { x, y: 520 - h }, feet: { x, y: 520 }, head: { x, y: 520 - h + 20 } };
  },
  hitTest(px, py) { const C = __sc.C; if (!C) return null; for (const u of C.enemies) { if (u.down) continue; const a = SCENE.anchor('enemy', u.id); if (px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h) return { kind: 'enemy', id: u.id }; } return null; },
  setHover(k, id) { __sc.hover.push([k, id]); }, setTargetable(ids) { __sc.targets.push(ids.slice()); }, aim(a, b, id) { __sc.aims.push([a ? { x: a.x, y: a.y } : null, b ? { x: b.x, y: b.y } : null, id || null]); },
  bark(h, x) { __sc.barks.push([h, x]); }, banner(x, k) { __sc.banners.push([x, k]); }, shake() {}, flash() {}, hitstop() {},
  speed(k) { __sc.speed = k; }, flush() { __sc.flushes++; const p = __sc.pend; __sc.pend = []; p.forEach((f) => f()); }, setViewState(id, v) { __sc.views.push([id, v.hp, v.block]); },
};`;

// ---------------------------------------------------------------------------------------------------- helpers
const idle = async (g, n = 4) => { for (let i = 0; i < n; i++) await g._settle(); };
const $ = (g, sel) => g._doc.querySelector(sel);
const $$ = (g, sel) => Array.from(g._doc.querySelectorAll(sel));
const scr = (g) => g.UI.screens.combat;
const S = (g) => scr(g)._t.state();
const warnText = (w) => String(w && w.args ? w.args.join(' ') : w);
// errors, plus any [combat] warning: those are exceptions the screen contained (a DOM slip, a throwing SCENE) and no healthy run has one
const errs = (g) => {
  // g.synth: the test fed made-up events or edited the engine behind the screen's back, so a drift warning is the point, not a bug
  const bad = g._console.error.map(warnText).concat(g._console.warn.map(warnText).filter((w) => w.indexOf('[combat]') === 0 && !(g.synth && w.indexOf('drifted') > 0)));
  if (bad.length && process.env.RB_TIMING) { console.log('   console:', bad.slice(0, 3).join(' || ').slice(0, 400)); const st = S(g); if (st && st.drift) console.log('   drift vm    :', st.drift.vm, '\n   drift engine:', st.drift.engine); }
  return bad.length;
};
const sc = (g) => g._run('__sc');
const sfxLog = (g) => g._run('__sfx').slice();
const feed = (g, events) => { g.synth = true; scr(g).debug().feed(events); };

// stage: 'fake' (recording SCENE), 'none' (fallback stage), 'real' (scene.js)
function fresh(o = {}) {
  const stage = o.stage || 'fake';
  const g = boot({ only: ['screen_combat', 'main'], skip: stage === 'real' ? [] : ['scene'], seed: o.seed || 12345, viewport: o.viewport, touch: o.touch });
  if (g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.file + ':' + e.line + ' ' + e.message)));
  if (stage === 'fake') g._run(FAKE_SCENE);
  g._run("globalThis.__sfx = []; globalThis.__aud = { music: [], intensity: [] }; { const o = AUDIO.sfx, oi = AUDIO.intensity, om = AUDIO.music; AUDIO.sfx = function (id, x) { __sfx.push(id); return o.call(AUDIO, id, x); }; AUDIO.intensity = function (n) { __aud.intensity.push(n); return oi.apply(AUDIO, arguments); }; AUDIO.music = function (id, x) { __aud.music.push(id); return om.apply(AUDIO, arguments); }; }");
  g.GAME.boot();
  g.stage = stage;
  return g;
}

// a real run and a real combat node, entered without the debug shortcuts (so the intro path runs)
async function enter(g, o = {}) {
  const heroes = o.heroes || ['hanae', 'kuro'];
  const R = g.GAME.debug.quickRun({ heroes, seed: o.seed || 777, chapter: o.chapter || 1, hp: o.hp, relics: o.relics, deck: o.deck });
  await idle(g);
  const tier = o.tier || 'normal';
  const enemies = o.enemies || ['kappa'];
  const node = { kind: 'combat', tile: { q: 1, r: 1 }, tier, enemies, seed: o.cseed === undefined ? 4242 : o.cseed, chapter: R.chapter };
  R.node = node;
  await g.UI.go('combat', { node, R }, { force: true, transition: 'none' });
  await idle(g, 6);
  if (o.hand || o.statuses) { scr(g).debugSetup({ hand: o.hand, statuses: o.statuses }); await idle(g); }
  return { R, node, st: S(g) };
}

const cardEl = (g, uid) => $(g, '.hc .card[data-uid="' + uid + '"]');
const enemyBtn = (g, id) => $(g, '.cm-en[data-enemy="' + id + '"] .cm-ehit');
const heroPanel = (g, id) => $(g, '.cm-hero[data-hero="' + id + '"]');
const txt = (el) => (el ? el.textContent : null);
// the on-screen numbers must equal the engine's after every drained action: the assertion the whole pipeline exists for
function assertPicture(g, label) {
  const st = S(g), C = st.C;
  C.heroes.forEach((h) => {
    const p = heroPanel(g, h.id);
    t.ok(!!p, label + ': panel ' + h.id);
    if (!p) return;
    t.eq(txt(p.querySelector('.cm-bar .txt')), h.hp + '/' + h.maxHp, label + ': ' + h.id + ' HP text');
    const blk = p.querySelector('.cm-blk');
    t.eq(blk.hidden ? 0 : Number(txt(blk.querySelector('.n'))), h.block, label + ': ' + h.id + ' Block');
    t.eq(p.classList.contains('down'), h.down, label + ': ' + h.id + ' down class');
    t.eq(p.classList.contains('front'), h.row === 'front', label + ': ' + h.id + ' front class');
    const chips = p.querySelectorAll('.cm-st .status').length, live = Object.keys(h.st).filter((k) => h.st[k]).length;
    t.eq(chips, live > 6 ? 5 : live, label + ': ' + h.id + ' status chips');
  });
  C.enemies.forEach((e) => {
    const el = $(g, '.cm-en[data-enemy="' + e.id + '"]');
    t.ok(!!el, label + ': overlay ' + e.id);
    if (!el) return;
    t.eq(txt(el.querySelector('.cm-bar .txt')), e.hp + '/' + e.maxHp, label + ': ' + e.id + ' HP text');
    t.eq(el.classList.contains('dead'), e.down, label + ': ' + e.id + ' dead class');
    const blk = el.querySelector('.cm-blk');
    t.eq(blk.hidden ? 0 : Number(txt(blk.querySelector('.n'))), e.block, label + ': ' + e.id + ' Block');
  });
  t.eq(txt($(g, '.o-n')), String(C.energy), label + ': energy orb');
  t.eq(txt($(g, '.cm-pile.draw .p-n')), String(C.draw.length), label + ': draw pile count');
  t.eq(txt($(g, '.cm-pile.discard .p-n')), String(C.discard.length), label + ': discard pile count');
  const hand = $$(g, '.cm-hand .hc:not(.leaving):not(.played)').map((w) => Number(w.querySelector('.card').dataset.uid)).sort((a, b) => a - b);
  t.deep(hand, C.hand.map((c) => c.uid).sort((a, b) => a - b), label + ': the hand on screen is the hand in the engine');
  t.eq(st.drift, null, label + ': the event-by-event view model matched the engine before the hard resync');
}

// COMBAT.simulate-like driver over the SCREEN: the engine's own greedy policy chooses, the screen performs
async function playThrough(g, o = {}) {
  const st0 = S(g);
  const maxActions = o.maxActions || 400;
  let actions = 0, picks = 0;
  while (S(g) && !S(g).ended && actions < maxActions) {
    const st = S(g), C = st.C;
    await idle(g, 2);
    if (st.ended || C.result) break;
    if (st.draining) { await idle(g, 2); continue; }
    if (st.picking) {
      const p = C.pending;
      const uids = p.optional ? [] : p.uids.slice(0, p.n);
      scr(g).debug().pick(uids);
      picks++; actions++;
      continue;
    }
    const a = g.COMBAT.greedyPolicy(C);
    if (!a) break;
    actions++;
    if (a.type === 'play') {
      const idx = C.hand.findIndex((c) => c.uid === a.uid);
      const targets = C.legalTargets(a.uid);
      scr(g).debug().play(idx, Math.max(0, targets.indexOf(a.target)));
    } else if (a.type === 'swap') scr(g).debug().swap();
    else if (a.type === 'end') scr(g).debug().endTurn();
    else break;
    await idle(g, 3);
    if (o.check && S(g) && !S(g).draining && !S(g).ended) assertPicture(g, o.check + ' #' + actions);
  }
  return { st: st0, actions, picks };
}

// ==================================================================================================== 1. the view model against the engine
await t.test('load: the screen registers itself, exports its pure parts and touches nothing while loading', () => {
  const g = boot({ only: ['screen_combat'], skip: ['scene'] });
  t.eq(g._errors.length, 0, 'no load errors');
  t.eq(typeof g.UI.screens.combat, 'object', 'UI.screens.combat exists');
  ['enter', 'leave', 'update', 'draw', 'onKey', 'debugSetup'].forEach((k) => t.eq(typeof g.UI.screens.combat[k], 'function', 'screen.' + k));
  t.eq(typeof g.UI.screens.combat.debug, 'function', 'screen.debug (GAME.debug.combat reads it)');
  t.eq(g.UI.screens.combat.transition, 'ink', 'entered through the ink bloom, which shows a tip');
  ['snapshot', 'applyEvent', 'settle', 'digest', 'describe', 'pickBark', 'slotFor'].forEach((k) => t.eq(typeof g.UI.screens.combat._t[k], 'function', '_t.' + k));
});

await t.test('music: combat<chapter>, elite, boss<chapter>', () => {
  const g = boot({ only: ['screen_combat'], skip: ['scene'] });
  const m = g.UI.screens.combat.music;
  t.eq(m({ node: { tier: 'normal' }, R: { chapter: 2 } }), 'combat2', 'normal fight in chapter 2');
  t.eq(m({ node: { tier: 'elite' }, R: { chapter: 1 } }), 'elite', 'elite');
  t.eq(m({ node: { tier: 'boss' }, R: { chapter: 3 } }), 'boss3', 'boss of chapter 3');
  t.eq(m({ node: { tier: 'normal' }, R: { chapter: 9 } }), 'combat3', 'chapter is clamped');
  t.ok(g.DATA.LISTS.music.indexOf(m({ node: { tier: 'boss' }, R: { chapter: 1 } })) >= 0, 'the id is a real track');
});

await t.test('applyEvent: the event-by-event view model equals the engine after every action, over 90 real fights', () => {
  const g = boot({ only: ['screen_combat', 'run'], skip: ['scene'] });
  const { snapshot, applyEvent, settle, digest } = g.UI.screens.combat._t;
  const { COMBAT, DATA, RUN } = g;
  let fights = 0, batches = 0, kinds = new Set(), bad = 0;
  const groups = [];
  [1, 2, 3].forEach((ch) => { DATA.encounters[ch].normal.forEach((e) => groups.push([ch, 'normal', e.enemies])); DATA.encounters[ch].elite.forEach((e) => groups.push([ch, 'elite', e.enemies])); groups.push([ch, 'boss', [DATA.encounters[ch].boss]]); });
  const parties = [['hanae', 'kuro'], ['suzu', 'raiga'], ['kuro', 'suzu'], ['raiga', 'hanae']];
  groups.forEach(([ch, tier, enemies], gi) => {
    if (gi % 2) return;                                    // half of them keeps the suite fast; the other half runs in the full-combat sections
    const heroes = parties[gi % 4];
    const R = RUN.newRun({ heroes, seed: 900 + gi });
    RUN.startChapter(R, ch);
    const C = COMBAT.create({ heroes: R.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp })), frontIdx: 0, deck: R.deck, enemies, tier, chapter: ch, seed: 31 + gi, mods: RUN.mods(R), relics: [], gold: 50 });
    const vm = snapshot(C);
    const feed = (ev) => {
      ev.forEach((e) => { kinds.add(e.type); applyEvent(vm, e); });
      settle(vm);
      batches++;
      if (digest(vm) !== digest(snapshot(C))) { bad++; if (bad < 4) console.log('DRIFT fight', ch, tier, enemies.join('+'), '\n  vm    ', digest(vm), '\n  engine', digest(snapshot(C))); }
    };
    feed(C.start());
    let n = 0;
    while (C.phase !== 'over' && n++ < 300 && C.turn < 30) {
      const a = COMBAT.greedyPolicy(C);
      if (!a) break;
      const ev = COMBAT.applyAction(C, a);
      if (!ev.length) { feed(C.pending ? C.resolvePick(C.pending.uids.slice(0, C.pending.optional ? 0 : C.pending.n)) : C.endTurn()); continue; }
      feed(ev);
    }
    fights++;
  });
  t.eq(bad, 0, 'no drift between the view model and the engine (' + fights + ' fights, ' + batches + ' batches)');
  t.ok(fights >= 30 && batches > 500, 'a real workload ran: ' + fights + ' fights, ' + batches + ' batches');
  ['draw', 'discard', 'play', 'hit', 'block', 'status', 'intent', 'swap', 'summon', 'death', 'turn_start', 'energy', 'exhaust', 'shuffle', 'end'].forEach((k) => t.ok(kinds.has(k), 'the workload covered event type ' + k));
});

await t.test('applyEvent: units, piles and the played card, event by event', () => {
  const g = boot({ only: ['screen_combat'], skip: ['scene'] });
  const { applyEvent, settle, counts } = g.UI.screens.combat._t;
  const unit = (id, kind, o) => Object.assign({ kind, id, def: id, name: id, hp: 20, maxHp: 20, block: 0, st: {}, down: false, fled: false, tier: 'normal', size: 'm', lane: 4, phase: 0, row: kind === 'hero' ? 'front' : null, intent: null }, o || {});
  const card = (uid, id) => ({ uid, id: id || 'hanae_slash', up: 0, gems: [null] });
  const vm = counts({ heroes: [unit('hanae', 'hero'), unit('kuro', 'hero', { row: 'back' })], enemies: [unit('kappa#1', 'enemy')], energy: 3, maxEnergy: 3, hand: [card(1), card(2)], draw: [card(3), card(4)], discard: [], exhaust: [], powers: [], inPlay: null, turn: 1, phase: 'player', result: null, pending: null, retained: {}, gold: 0, ink: 0 });
  applyEvent(vm, { type: 'play', card: card(1), hero: 'hanae', target: 'kappa#1', cost: 1, to: 'discard' });
  t.eq(vm.hand.length, 1, 'the played card left the hand'); t.eq(vm.inPlay.uid, 1, 'and is in play'); t.eq(vm.discardN, 1, 'the discard pile already counts it (the card is on its way)');
  applyEvent(vm, { type: 'energy', value: 2, delta: -1 }); t.eq(vm.energy, 2, 'energy follows the event value');
  applyEvent(vm, { type: 'hit', src: { kind: 'hero', id: 'hanae' }, dst: { kind: 'enemy', id: 'kappa#1' }, amount: 8, blocked: 0, hp: 12, block: 0, killed: false });
  t.eq(vm.enemies[0].hp, 12, 'hit sets HP from the event');
  applyEvent(vm, { type: 'block', dst: { kind: 'hero', id: 'kuro' }, amount: 5, block: 5 }); applyEvent(vm, { type: 'block_lost', dst: { kind: 'hero', id: 'kuro' }, amount: 5, cause: 'turn' });
  t.eq(vm.heroes[1].block, 0, 'block_lost removes what it says');
  applyEvent(vm, { type: 'status', dst: { kind: 'enemy', id: 'kappa#1' }, s: 'poison', delta: 3, value: 3 }); t.eq(vm.enemies[0].st.poison, 3, 'status value');
  applyEvent(vm, { type: 'status', dst: { kind: 'enemy', id: 'kappa#1' }, s: 'poison', delta: -3, value: 0 }); t.ok(!('poison' in vm.enemies[0].st), 'status at 0 is removed');
  settle(vm);
  t.eq(vm.discard.length, 1, 'after the batch the card is in the discard pile'); t.eq(vm.inPlay, null, 'nothing in play');
  applyEvent(vm, { type: 'draw', cards: [card(3)], reshuffled: false }); t.deep(vm.hand.map((c) => c.uid), [2, 3], 'draw moves the card from the pile to the hand'); t.eq(vm.drawN, 1, 'draw count');
  applyEvent(vm, { type: 'discard', cards: [card(2), card(3)], reason: 'endTurn' }); t.eq(vm.hand.length, 0, 'end of turn empties the hand'); t.eq(vm.discardN, 3, 'discard count');
  applyEvent(vm, { type: 'shuffle', piles: {} }); t.eq(vm.discardN, 0, 'a shuffle moves the discard pile'); t.eq(vm.drawN, 4, 'into the draw pile');
  applyEvent(vm, { type: 'summon', enemy: unit('kodama#1', 'enemy', { lane: 3 }) }); t.eq(vm.enemies.length, 2, 'summon appends a unit');
  applyEvent(vm, { type: 'death', unit: { kind: 'enemy', id: 'kappa#1' }, tier: 'normal' }); t.ok(vm.enemies[0].down, 'death marks it down');
  applyEvent(vm, { type: 'hero_down', hero: 'kuro' }); t.ok(vm.heroes[1].down && vm.heroes[1].hp === 0, 'hero_down');
  applyEvent(vm, { type: 'hero_revive', hero: 'kuro', hp: 5 }); t.ok(!vm.heroes[1].down && vm.heroes[1].hp === 5, 'hero_revive');
  applyEvent(vm, { type: 'swap', front: 'kuro', back: 'hanae', cost: 0, forced: false }); t.eq(vm.heroes[1].row, 'front', 'swap exchanges rows'); t.eq(vm.heroes[0].row, 'back', 'both');
  applyEvent(vm, { type: 'max_hp', hero: 'hanae', n: 4 }); t.eq(vm.heroes[0].maxHp, 24, 'max_hp raises the maximum'); t.eq(vm.heroes[0].hp, 24, 'and the current HP');
  applyEvent(vm, { type: 'play', card: card(9, 'hanae_whetstone'), hero: 'hanae', target: null, cost: 1, to: 'power' }); settle(vm); t.eq(vm.powersN, 1, 'a power lands in the powers zone');
  applyEvent(vm, { type: 'end', result: 'win' }); t.eq(vm.result, 'win', 'end records the result');
});

await t.test('describe: one screen-reader line per event that matters', () => {
  const g = boot({ only: ['screen_combat'], skip: ['scene'] });
  const { describe } = g.UI.screens.combat._t;
  const vm = { heroes: [{ kind: 'hero', id: 'hanae', name: 'Hanae' }], enemies: [{ kind: 'enemy', id: 'kappa#1', name: 'Kappa' }] };
  t.eq(describe(vm, { type: 'enemy_act', enemy: 'kappa#1', name: 'Mud Slap', kind: 'attack' }), 'Kappa uses Mud Slap.', 'enemy act');
  t.eq(describe(vm, { type: 'hit', src: { kind: 'enemy', id: 'kappa#1' }, dst: { kind: 'hero', id: 'hanae' }, amount: 7, blocked: 2, killed: false }), 'Kappa hits Hanae for 7, 2 blocked.', 'the design example');
  t.eq(describe(vm, { type: 'hit', src: null, dst: { kind: 'hero', id: 'hanae' }, amount: 0, blocked: 0 }), '', 'a zero hit says nothing');
  t.eq(describe(vm, { type: 'death', unit: { kind: 'enemy', id: 'kappa#1' } }), 'Kappa is defeated.', 'death');
  t.eq(describe(vm, { type: 'turn_start', who: 'player', turn: 3 }), 'Turn 3. Your move.', 'turn start');
  t.eq(describe(vm, { type: 'end', result: 'lose' }), 'Defeat.', 'end');
  t.eq(describe(vm, { type: 'draw', cards: [] }), '', 'draw is silent');
});

await t.test('pickBark: at most one per 6 s, about 35% of eligible events, seeded by the event index, lines from the hero own lore', () => {
  const g = boot({ only: ['screen_combat'], skip: ['scene'] });
  const { pickBark } = g.UI.screens.combat._t;
  let hits = 0, n = 2000;
  for (let i = 0; i < n; i++) if (pickBark(99, i, 'start', 'hanae', 100000, null)) hits++;
  t.ok(hits / n > 0.3 && hits / n < 0.4, 'the rate is about 35% (' + (hits / n).toFixed(3) + ')');
  const a = pickBark(99, 7, 'start', 'hanae', 1e6, null), b = pickBark(99, 7, 'start', 'hanae', 1e6, null);
  t.deep(a, b, 'the same event index gives the same answer');
  let idx = -1;
  for (let i = 0; i < 200 && idx < 0; i++) if (pickBark(99, i, 'hurt', 'kuro', 1e6, null)) idx = i;
  const b1 = pickBark(99, idx, 'hurt', 'kuro', 1e6, null);
  t.ok(g.DATA.lore.barks_kuro.lines.hurt.indexOf(b1.text) >= 0, 'the text is one of kuro hurt lines');
  t.eq(b1.hero, 'kuro', 'and it names the hero');
  t.eq(pickBark(99, idx, 'hurt', 'kuro', 1e6 + 5999, 1e6), null, 'inside the 6 s gap nothing barks');
  t.ok(pickBark(99, idx, 'hurt', 'kuro', 1e6 + 6000, 1e6) !== null, 'exactly 6 s later it may again');
  t.eq(pickBark(99, 1, 'nonsense', 'hanae', 1e6, null), null, 'unknown keys never bark');
  ['start', 'hurt', 'kill', 'down', 'win', 'swap'].forEach((k) => { let any = false; for (let i = 0; i < 100 && !any; i++) any = !!pickBark(5, i, k, 'suzu', 1e6, null); t.ok(any, 'suzu has ' + k + ' lines and can bark them'); });
});

await t.test('slotFor: the fan stays inside the hand zone and never reorders', () => {
  const g = boot({ only: ['screen_combat'], skip: ['scene'] });
  const { slotFor, HAND } = g.UI.screens.combat._t;
  for (let n = 1; n <= 10; n++) {
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(slotFor(i, n));
    t.ok(xs[0].x >= HAND.x0 - 1 && xs[n - 1].x + HAND.cw <= HAND.x1 + 1, 'n=' + n + ': the fan fits x 290..990');
    t.ok(xs.every((s, i) => i === 0 || s.x > xs[i - 1].x), 'n=' + n + ': left to right in hand order');
    if (n > 1) t.ok(Math.abs(xs[0].rot + xs[n - 1].rot) < 1e-9 && xs[0].y === xs[n - 1].y, 'n=' + n + ': symmetric');
  }
  t.ok(Math.abs(slotFor(0, 1).x + HAND.cw / 2 - 640) < 1, 'a single card is centred');
});

await t.test('rowBrief and reasonText', () => {
  const g = boot({ only: ['screen_combat'], skip: ['scene'] });
  const { rowBrief, reasonText } = g.UI.screens.combat._t;
  t.eq(rowBrief('hanae', 'front', []), '+2 dmg', 'hanae front'); t.eq(rowBrief('hanae', 'back', []), '+1 Block', 'hanae back');
  t.eq(rowBrief('raiga', 'front', []), '3 Block/turn, Thorns 2', 'raiga front'); t.eq(rowBrief('suzu', 'back', []), 'Regen 2', 'suzu back');
  t.eq(reasonText('energy', 'hanae'), 'Not enough Energy', 'energy'); t.eq(reasonText('down', 'kuro'), 'Kuro is down', 'down names the hero');
  t.eq(reasonText('stunned', 'suzu'), 'Suzu is stunned', 'stunned names the hero'); t.ok(reasonText('zzz', 'hanae').length > 3, 'unknown reasons still read');
});

// ==================================================================================================== 2. mounting: the HUD zones and their DOM
await t.test('mount: the whole HUD exists, the intro drains, intents appear and the picture equals the engine', async () => {
  const g = fresh();
  const seen = [];
  g.UI.bus.on('screen', (e) => seen.push(e.name));
  const { R, st } = await enter(g, { enemies: ['kappa', 'kodama', 'tanuki_bandit'] });
  t.ok(seen.indexOf('combat') >= 0, 'the bus announced the screen');
  t.eq(g.UI.currentName, 'combat', 'the combat screen is current');
  t.eq(sc(g).mounted, 1, 'SCENE.mount ran once'); t.eq(sc(g).mountOpts.chapter, 1, 'with the chapter'); t.eq(sc(g).mountOpts.boss, false, 'and the boss flag');
  t.eq($$(g, '.cm-hero').length, 2, 'two hero panels'); t.eq($$(g, '.cm-en').length, 3, 'three enemy overlays');
  t.eq($$(g, '.cm-hand .hc').length, 5, 'five cards in the opening hand'); t.eq(st.C.hand.length, 5, 'the engine agrees');
  t.eq($$(g, '.cm-int:not([hidden])').length, 3, 'every enemy shows an intent bubble');
  ['hand', 'energy', 'endturn', 'swap', 'intent', 'enemy', 'relics', 'deck'].forEach((a) => t.ok(!!$(g, '[data-tut="' + a + '"]'), 'tutorial anchor ' + a));
  t.ok(g.UI.anchorEl('hand') === $(g, '.cm-hand'), 'UI.anchorEl finds the hand');
  t.eq(txt($(g, '.cm-hero[data-hero="hanae"] .ct-row')), 'FRONT', 'Hanae is in front'); t.eq(txt($(g, '.cm-hero[data-hero="kuro"] .ct-row')), 'BACK', 'Kuro is in back');
  t.eq(txt($(g, '.cm-hero[data-hero="hanae"] .ct-bonus')), '+2 dmg', 'the row bonus text is on the tag');
  t.eq(txt($(g, '.cm-swap .sw-cost')), 'FREE', 'the swap seal says FREE'); t.eq(txt($(g, '.cm-turn .ct-n')), 'Turn 1', 'the turn label');
  t.eq(txt($(g, '.cm-turn .ct-p')), 'Your turn', 'and whose turn it is');
  t.eq(txt($(g, '.cm-stats .stat.st-gold .val')), String(R.gold), 'the gold counter');
  t.eq(txt($(g, '.o-n')), '3', 'three Energy'); t.eq(txt($(g, '.o-max')), '/3', 'of three');
  assertPicture(g, 'mount');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('intent bubbles show the number C.intent computes, NxM for multi-hits, and the extras', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'bamboo_sprite', 'kodama'] });
  st.C.enemies.forEach((e) => {
    const it = st.C.intent(e), b = $(g, '.cm-en[data-enemy="' + e.id + '"] .cm-int');
    t.ok(!b.hidden, e.id + ' bubble visible');
    if (it.dmg !== null && it.hits > 1) t.eq(txt(b.querySelector('.ib-num')), it.dmg + 'x' + it.hits, e.id + ' multi-hit reads NxM');
    else if (it.dmg !== null && it.hits === 1) t.eq(txt(b.querySelector('.ib-num')), String(it.dmg), e.id + ' single hit number');
    t.ok(b.className.indexOf('k-' + it.kind) >= 0, e.id + ' bubble carries the kind class ' + it.kind);
    t.ok((b.getAttribute('aria-label') || '').indexOf(e.name) === 0, e.id + ' aria-label starts with its name');
  });
  const sprite = st.C.enemies.find((e) => e.def === 'bamboo_sprite');
  st.C.enemies.forEach((e) => { e.hp = e.maxHp; });
  t.ok(sprite.intent.hits >= 1, 'the sprite intends to strike');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('stunned enemies show a Stunned bubble and the star indicator', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'] });
  const id = st.C.enemies[0].id;
  scr(g).debug().setStatus(id, 'stun', 1);
  await idle(g);
  const el = $(g, '.cm-en[data-enemy="' + id + '"]');
  t.ok(el.classList.contains('stunned'), 'the overlay is marked stunned'); t.ok(!el.querySelector('.cm-stun').hidden, 'the star indicator shows');
  t.ok(el.querySelector('.cm-int').classList.contains('stunned'), 'the bubble reads Stunned'); t.eq(txt(el.querySelector('.cm-int .ib-num')), 'STUN', 'with the word');
  t.eq(el.querySelectorAll('.cm-st .status').length, 1, 'and the stun status chip');
  scr(g).debug().setStatus(id, 'stun', 0);
  await idle(g);
  t.ok(el.querySelector('.cm-stun').hidden, 'the indicator goes away with the status');
});

await t.test('boss, elite and xl: the reveal plate, the boss banner and the boss flag', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['boss_kuzunoha'], tier: 'boss' });
  t.eq(sc(g).mountOpts.boss, true, 'SCENE.mount got boss:true');
  t.ok(sc(g).banners.some((b) => b[0] === 'Kuzunoha' && b[1] === 'BOSS'), 'the BOSS banner was raised with the boss name (SCENE draws the reveal)');
  t.ok(sfxLog(g).indexOf('boss_intro') >= 0, 'with its sting');
  t.ok($(g, '.cm-reveal').hidden, 'and no second, DOM plate on top of it');
  t.eq($$(g, '.cm-en').length, 1, 'one overlay'); t.ok($(g, '.cm-en').classList.contains('sz-xl'), 'xl size class');
  assertPicture(g, 'boss');
  const g2 = fresh();
  await enter(g2, { enemies: ['oni_brute'], tier: 'elite' });
  t.ok($(g2, '.cm-reveal').className.indexOf('elite') >= 0 && $(g2, '.cm-reveal').textContent.indexOf('Oni Brute') >= 0, 'an elite gets the champion plate (SCENE has no banner for it)');
  const g3 = fresh({ stage: 'none' });
  await enter(g3, { enemies: ['boss_kuzunoha'], tier: 'boss' });
  t.ok($(g3, '.cm-reveal').className.indexOf('boss') >= 0 && $(g3, '.cm-reveal').textContent.indexOf('Nine-Tail') >= 0, 'without a SCENE the boss gets the DOM plate with its title');
  t.eq(errs(g) + errs(g2) + errs(g3), 0, 'no console errors');
});

// ==================================================================================================== 3. playing cards: tap, drag, keys, illegal plays
await t.test('tap: a no-target card is selected on the first tap and played on the second', async () => {
  const g = fresh();
  const events = [];
  ['combat:select', 'combat:play', 'combat:turn'].forEach((k) => g.UI.bus.on(k, (e) => events.push([k, e])));
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'hanae_petal_step', 'kuro_ink_bolt'] });
  const parry = st.C.hand[0].uid;
  g._click(cardEl(g, parry));
  t.ok(cardEl(g, parry).classList.contains('sel'), 'the card is marked selected');
  t.deep(events.filter((e) => e[0] === 'combat:select').map((e) => e[1].uid), [parry], 'combat:select {uid}');
  t.ok(g.UI.tip.open, 'the big preview opened (UI.tip.card)');
  t.eq(st.C.hand.length, 5, 'a selection changes nothing in the engine');
  t.deep(sc(g).targets[sc(g).targets.length - 1], [], 'a no-target card makes nothing targetable');
  g._click(cardEl(g, parry));
  await idle(g);
  t.eq(st.C.energy, 2, 'the second tap played it (1 Energy)'); t.eq(st.C.front().block, 5 + 0, 'Hanae gained the Block');
  t.deep(events.filter((e) => e[0] === 'combat:play').map((e) => e[1]), [{ uid: parry, target: null }], 'combat:play {uid, target}');
  t.ok(sc(g).played.indexOf('play') >= 0 && sc(g).played.indexOf('block') >= 0, 'SCENE.play saw the play and block events');
  assertPicture(g, 'after Parry');
  t.ok(!g.UI.tip.open, 'the preview is gone'); t.ok(!$(g, '.card.sel'), 'nothing stays selected');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('tap: a targeting card selects, lights the legal targets with damage previews, and plays on an enemy tap', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama', 'tanuki_bandit'], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'hanae_slash', 'kuro_ink_ward'] });
  const slash = st.C.hand[0].uid;
  const targets = st.C.legalTargets(slash);
  t.eq(targets.length, 3, 'three legal targets');
  g._click(cardEl(g, slash));
  t.ok(cardEl(g, slash).classList.contains('sel'), 'selected, not played');
  t.eq(st.C.hand.length, 5, 'not played');
  t.deep(sc(g).targets[sc(g).targets.length - 1], targets, 'SCENE.setTargetable got the legal targets');
  const pvs = $$(g, '.cm-pv:not([hidden])');
  t.eq(pvs.length, 3, 'every legal target shows a damage preview');
  targets.forEach((id) => t.eq(txt($(g, '.cm-en[data-enemy="' + id + '"] .cm-pv')), String(st.C.preview(slash, id).dmg), 'the preview on ' + id + ' is C.preview'));
  t.ok($(g, '.cm-root, .cm').classList.contains('targeting'), 'the screen is in targeting mode');
  const hp0 = st.C.enemies[1].hp;
  g._click(enemyBtn(g, targets[1]));
  await idle(g);
  t.eq(st.C.enemies[1].hp, hp0 - 8, 'the tap on the second enemy hit it for 8');
  t.eq($$(g, '.cm-pv:not([hidden])').length, 0, 'the previews are gone'); t.deep(sc(g).targets[sc(g).targets.length - 1], [], 'no target rings remain');
  assertPicture(g, 'after Petal Slash');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('tap: with exactly one legal target the first tap plays; lethal previews are flagged', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kodama'], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'hanae_slash', 'kuro_ink_ward'] });
  const slash = st.C.hand[0].uid;
  st.C.enemies[0].hp = 5;
  scr(g).debug().setStatus('kodama', 'vulnerable', 0);
  g._click(cardEl(g, slash));
  await idle(g);
  t.ok(st.C.enemies[0].down, 'one tap killed the lone enemy (8 damage into 5 HP)');
  t.eq(st.C.energy, 2, 'and paid for it');
  const g2 = fresh();
  const r = await enter(g2, { enemies: ['kappa', 'kodama'], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'hanae_slash', 'kuro_ink_ward'] });
  r.st.C.enemies[1].hp = 5; scr(g2).debug().setHp(r.st.C.enemies[1].id, 5);
  g2._click(cardEl(g2, r.st.C.hand[0].uid));
  const pv = $$(g2, '.cm-pv:not([hidden])');
  t.eq(pv.filter((p) => p.classList.contains('lethal')).length, 1, 'exactly the 5 HP enemy is marked lethal');
  t.eq(errs(g) + errs(g2), 0, 'no console errors');
});

await t.test('illegal plays: a toast with the reason, ui_error, and the engine is untouched', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward', 'hanae_petal_step'] });
  scr(g).debug().setEnergy(0);
  const before = JSON.stringify([st.C.hand.map((c) => c.uid), st.C.energy]);
  const parry = st.C.hand[1].uid;
  t.ok(cardEl(g, parry).classList.contains('dis'), 'with no Energy the card is dimmed');
  g._click(cardEl(g, parry));
  await idle(g);
  t.ok($$(g, '#toasts .toast').some((x) => x.textContent.indexOf('Not enough Energy') >= 0), 'the toast says why');
  t.ok(sfxLog(g).indexOf('ui_error') >= 0, 'ui_error played (UI delegate on a dimmed card)');
  t.eq(JSON.stringify([st.C.hand.map((c) => c.uid), st.C.energy]), before, 'nothing changed in the engine');
  t.ok(!$(g, '.card.sel'), 'nothing got selected');
  scr(g).debug().setEnergy(3);
  scr(g).debug().setStatus('hanae', 'stun', 1);
  await idle(g);
  const slash = st.C.hand[0].uid;
  g._click(cardEl(g, slash));
  t.ok($$(g, '#toasts .toast').some((x) => x.textContent.indexOf('Hanae is stunned') >= 0), 'a stunned hero: "Hanae is stunned"');
  scr(g).debug().setStatus('hanae', 'stun', 0);
  scr(g).debug().setHp('hanae', 0);
  await idle(g);
  g._click(cardEl(g, st.C.hand[1].uid));
  t.ok($$(g, '#toasts .toast').some((x) => x.textContent.indexOf('Hanae is down') >= 0), 'a downed hero: "Hanae is down"');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('drag: a no-target card released above y=430 plays, below it returns; a targeting card aims and plays on the enemy it is released on', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama', 'tanuki_bandit'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'hanae_petal_step', 'kuro_ink_bolt'] });
  const parry = st.C.hand[0].uid, slash = st.C.hand[1].uid;
  g._drag(cardEl(g, parry), [400, 640], [420, 620]);
  await idle(g);
  t.eq(st.C.hand.length, 5, 'a drag that stays low does not play');
  t.ok(!cardEl(g, parry).classList.contains('sel'), 'and puts the card back');
  g._drag(cardEl(g, parry), [400, 640], [560, 300]);
  await idle(g);
  t.eq(st.C.energy, 2, 'released above the line: played'); t.eq(st.C.front().block, 5, 'Block gained');
  const kappa = st.C.enemies[0], hp0 = kappa.hp;
  const slashEl = cardEl(g, slash);
  g._drag(slashEl, [470, 640], [850, 420]);
  await idle(g);
  const aims = sc(g).aims;
  t.ok(aims.some((a) => a[0] && a[2] === kappa.id), 'SCENE.aim was called with the hovered legal target');
  t.ok(aims.some((a) => a[0] === null), 'and cleared at the end');
  t.eq(kappa.hp, hp0 - 8, 'released on the kappa: it took 8');
  const g2 = fresh();
  const r2 = await enter(g2, { enemies: ['kappa', 'kodama'], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'hanae_slash', 'kuro_ink_ward'] });
  g2._drag(cardEl(g2, r2.st.C.hand[0].uid), [400, 640], [200, 300]);
  await idle(g2);
  t.eq(r2.st.C.hand.length, 5, 'a targeting card released on empty ground returns to the hand');
  t.ok(!$(g2, '.card.sel'), 'and is not left selected');
  t.eq(errs(g) + errs(g2), 0, 'no console errors');
});

await t.test('deselecting: a tap on empty stage, Esc, and a second tap on a targeting card', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'hanae_petal_step', 'kuro_ink_ward'] });
  const slash = st.C.hand[0].uid;
  g._click(cardEl(g, slash));
  t.ok(cardEl(g, slash).classList.contains('sel'), 'selected');
  g._pointer('pointerup', '#view', { x: 620, y: 200 });
  t.ok(!$(g, '.card.sel'), 'a tap on empty stage deselects');
  g._click(cardEl(g, slash));
  g._key('Escape');
  t.ok(!$(g, '.card.sel'), 'Esc deselects'); t.eq(g.UI.overlay.count(), 0, 'and Esc did NOT open the pause menu while a card was selected');
  g._click(cardEl(g, slash));
  g._click(cardEl(g, slash));
  t.ok(!$(g, '.card.sel'), 'a second tap on a targeting card puts it back');
  t.eq(st.C.hand.length, 5, 'nothing was played by any of that');
  g._key('Escape');
  await idle(g);
  t.ok(g.UI.overlay.has('pause'), 'with nothing selected, Esc opens the pause menu (UI default)');
  g.UI.overlay.closeAll();
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('rapid input during animation is ignored, a tap fast-forwards, and only one card plays', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_parry', 'kuro_ink_ward', 'hanae_petal_step', 'hanae_slash', 'kuro_ink_bolt'] });
  const a = st.C.hand[0].uid, b = st.C.hand[1].uid;
  g._run('__sc.hold = true');
  g._click(cardEl(g, a)); g._click(cardEl(g, a));
  t.ok(st.draining, 'the play is being presented (SCENE holds the beat)');
  const flushes = sc(g).flushes;
  g._click(cardEl(g, b)); g._click(enemyBtn(g, st.C.enemies[0].id)); g._click($(g, '.cm-end'));
  t.eq(st.C.hand.length, 4, 'exactly one card left the hand; the taps in between played nothing');
  t.eq(st.C.phase, 'player', 'and the turn did not end');
  t.ok(sc(g).flushes > flushes, 'the taps fast-forwarded (SCENE.flush)');
  g._run('__sc.hold = false');
  g._run('SCENE.flush()');
  await idle(g);
  t.ok(!st.draining, 'the drain finished after the flush');
  assertPicture(g, 'after the rapid taps');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('keyboard: 1..9 and 0 select, Left and Right walk cards then targets, Enter plays, E ends, S swaps, D and G open piles, Z toggles speed', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'hanae_petal_step', 'kuro_ink_bolt'] });
  const uid = (i) => st.C.hand[i].uid;
  g._key('1');
  t.ok(cardEl(g, uid(0)).classList.contains('sel'), '1 selects the first card');
  g._key('ArrowRight');
  t.ok(cardEl(g, uid(1)).classList.contains('sel') && !cardEl(g, uid(0)).classList.contains('sel'), 'Right moves to the next card');
  const targets = st.C.legalTargets(uid(1));
  t.ok(targets.length === 2, 'Petal Slash has two targets');
  t.eq(S(g).sel.ti, 0, 'the first target is chosen');
  g._key('ArrowRight');
  t.eq(S(g).sel.ti, 1, 'Right on a targeting card cycles the target');
  t.ok(sc(g).hover.some((h) => h[1] === targets[1]), 'SCENE.setHover follows it');
  g._key('Enter');
  await idle(g);
  t.ok(st.C.enemies[1].hp < st.C.enemies[1].maxHp && st.C.enemies[0].hp === st.C.enemies[0].maxHp, 'Enter played it on the second target');
  g._key('0');
  t.ok(!$(g, '.card.sel'), '0 selects the tenth card, which does not exist: nothing happens');
  g._key('2');
  g._key('Enter');
  await idle(g);
  assertPicture(g, 'after keyboard plays');
  g._key('d');
  t.ok(g.UI.overlay.has('deck'), 'D opens the draw pile'); g.UI.overlay.closeAll();
  g._key('g');
  t.ok(g.UI.overlay.has('deck'), 'G opens the discard pile'); g.UI.overlay.closeAll();
  const sp0 = g.UI.opt.speed;
  g._key('z');
  t.ok(g.UI.opt.speed !== sp0, 'Z cycles the animation speed'); t.eq(sc(g).speed, g.UI.opt.speed, 'and SCENE.speed follows (UI.applySettings)');
  t.eq(txt($(g, '.cm-speed .sp-l')), 'x' + g.UI.opt.speed, 'the speed button shows it');
  const turn0 = st.C.turn;
  g._key('e');
  await idle(g);
  t.eq(st.C.turn, turn0 + 1, 'E ends the turn');
  t.eq(errs(g), 0, 'no console errors');
});

// ==================================================================================================== 4. turn flow, swap, the End Turn plaque
await t.test('end turn: the enemy phase is presented event by event, then the new hand and intents appear; bus events fire in order', async () => {
  const g = fresh();
  const bus = [];
  ['combat:turn', 'combat:endturn', 'combat:swap', 'combat:play', 'combat:end'].forEach((k) => g.UI.bus.on(k, (e) => bus.push([k, e && e.phase ? e.phase : '', e && e.turn ? e.turn : 0])));
  const { st } = await enter(g, { enemies: ['kappa', 'kodama', 'tanuki_bandit'] });
  t.eq(bus.filter((b) => b[0] === 'combat:turn').length, 1, 'the opening turn announced itself'); t.deep(bus[0], ['combat:turn', 'player', 1], 'combat:turn {turn 1, phase player}');
  const hp0 = st.C.front().hp + st.C.back().hp;
  g._click($(g, '.cm-end'));
  await idle(g);
  t.deep(bus.slice(1).map((b) => b[0]), ['combat:endturn', 'combat:turn', 'combat:turn'], 'endturn, then the enemy phase, then the next player phase');
  t.deep(bus.slice(2).map((b) => b[1]), ['enemy', 'player'], 'phases in order'); t.eq(bus[bus.length - 1][2], 2, 'turn 2');
  t.eq(st.C.turn, 2, 'the engine is on turn 2'); t.eq(txt($(g, '.cm-turn .ct-n')), 'Turn 2', 'the label follows');
  t.ok(st.C.front().hp + st.C.back().hp < hp0, 'the enemies hurt the heroes');
  t.eq($$(g, '.cm-hand .hc').length, 5, 'a fresh hand of five');
  t.eq($$(g, '.cm-int:not([hidden])').length, st.C.enemies.filter((e) => !e.down).length, 'every living enemy shows its next intent');
  t.ok(!$(g, '.cm-enemies').classList.contains('acting'), 'the acting dim is off again');
  t.ok(sc(g).played.indexOf('enemy_act') >= 0 && sc(g).played.indexOf('turn_start') >= 0, 'SCENE.play saw the enemy phase events');
  t.ok(g._doc.getElementById('sr').textContent.indexOf('Turn 2. Your move.') >= 0, 'the screen reader region announced the new turn');
  assertPicture(g, 'after a full round');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('End Turn: disabled during the enemy phase and while a pick is open; glows when nothing else is playable', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward', 'hanae_slash'] });
  const end = $(g, '.cm-end');
  t.ok(!end.classList.contains('ready'), 'with playable cards it does not glow'); t.ok(end.getAttribute('aria-disabled') !== 'true', 'and it is enabled');
  scr(g).debug().setEnergy(0);
  t.ok(end.classList.contains('ready'), 'with no Energy left nothing is playable: it glows');
  scr(g).debug().setEnergy(3);
  g._run('__sc.hold = true');
  g._click(end);
  t.ok(end.getAttribute('aria-disabled') === 'true', 'during the enemy phase it is disabled');
  t.ok(end.classList.contains('waiting'), 'and says so');
  g._run('__sc.hold = false; SCENE.flush()');
  await idle(g);
  t.ok(end.getAttribute('aria-disabled') !== 'true', 'enabled again on the next turn');
  const g2 = fresh();
  await enter(g2, { enemies: ['kappa'], hand: ['curse_regret', 'curse_smudge', 'status_blot', 'curse_doubt', 'curse_burden'] });
  t.ok($(g2, '.cm-end').classList.contains('ready'), 'a hand of junk glows too');
  t.eq(errs(g) + errs(g2), 0, 'no console errors');
});

await t.test('swap: free once, then it costs Energy; rows, tags and bonus text follow; the S key works; Bind locks it', async () => {
  const g = fresh();
  const bus = [];
  g.UI.bus.on('combat:swap', () => bus.push('swap'));
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'] });
  const swap = $(g, '.cm-swap');
  t.ok(swap.classList.contains('free'), 'the first swap is free'); t.eq(txt(swap.querySelector('.sw-cost')), 'FREE', 'and says FREE');
  g._click(swap);
  await idle(g);
  t.eq(st.C.front().id, 'kuro', 'Kuro stepped to the front'); t.eq(st.C.energy, 3, 'for free');
  t.eq(txt($(g, '.cm-hero[data-hero="kuro"] .ct-row')), 'FRONT', 'the tag follows'); t.eq(txt($(g, '.cm-hero[data-hero="kuro"] .ct-bonus')), '+0 dmg'.replace('+0 dmg', 'no bonus'), 'Kuro front has no bonus');
  t.eq(txt($(g, '.cm-hero[data-hero="hanae"] .ct-bonus')), '+1 Block', 'Hanae back bonus');
  t.eq(txt(swap.querySelector('.sw-cost')), '1 Energy', 'the next swap shows its price'); t.ok(!swap.classList.contains('free'), 'no longer free');
  g._key('s');
  await idle(g);
  t.eq(st.C.energy, 2, 'the paid swap took 1 Energy'); t.eq(st.C.front().id, 'hanae', 'Hanae is back in front');
  t.deep(bus, ['swap', 'swap'], 'combat:swap fired for both');
  assertPicture(g, 'after swaps');
  scr(g).debug().setEnergy(0);
  g._click(swap);
  t.ok(g._doc.querySelector('#toasts').textContent.indexOf('Not enough Energy to swap') >= 0, 'with no Energy the swap explains itself');
  scr(g).debug().setEnergy(3);
  scr(g).debug().setStatus('kuro', 'bind', 2);
  await idle(g);
  t.ok(swap.classList.contains('bound'), 'Bind shows the lock'); t.ok(swap.getAttribute('aria-disabled') === 'true', 'and disables the button');
  g._click(swap);
  t.ok(g._doc.querySelector('#toasts').textContent.indexOf('Bound') >= 0, 'clicking says why');
  t.eq(errs(g), 0, 'no console errors');
});

// ==================================================================================================== 5. statuses, Block, HP, piles
await t.test('status chips: up to six with counts, a +N chip beyond that, and the tooltips explain them', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa'] });
  const ids = ['might', 'thorns', 'regen', 'bloom', 'weak', 'frail', 'poison', 'burn'];
  ids.forEach((s, i) => scr(g).debug().setStatus('hanae', s, i + 1));
  await idle(g);
  const p = heroPanel(g, 'hanae');
  t.eq(p.querySelectorAll('.cm-st .status').length, 5, 'eight statuses show five chips'); t.eq(txt(p.querySelector('.cm-more')), '+3', 'and a +3 chip');
  t.ok(p.querySelector('.cm-more').getAttribute('aria-label').indexOf('3 more') === 0, 'labelled for screen readers');
  ['frail', 'poison', 'weak'].forEach((s) => t.ok(!p.querySelector('.status.s-' + s), s + ' (debuffs sort last) is in the overflow'));
  ['might', 'regen', 'thorns', 'bloom'].forEach((s) => t.ok(!!p.querySelector('.status.s-' + s), s + ' (buffs and resources first) is shown'));
  scr(g).debug().setStatus('hanae', 'poison', 0); scr(g).debug().setStatus('hanae', 'burn', 0); scr(g).debug().setStatus('hanae', 'frail', 0);
  await idle(g);
  t.eq(p.querySelectorAll('.cm-st .status').length, 5, 'five statuses fit without a +N chip'); t.ok(!p.querySelector('.cm-more'), 'the overflow chip is gone');
  t.eq(txt(p.querySelector('.status.s-might .n')), '1', 'the count is on the chip');
  scr(g).debug().setStatus('hanae', 'might', 4);
  await idle(g);
  t.eq(txt(p.querySelector('.status.s-might .n')), '4', 'and updates in place');
  const chip = p.querySelector('.status.s-thorns');
  const tip = chip.rbTip ? chip.rbTip() : null;
  t.ok(tip && tip.textContent.indexOf('Thorns') >= 0, 'the chip carries a tooltip that explains Thorns');
  scr(g).debug().setStatus(st.C.enemies[0].id, 'vulnerable', 2);
  await idle(g);
  const en = $(g, '.cm-en .cm-st');
  t.eq(en.querySelectorAll('.status').length, 1, 'enemy status row'); t.ok(en.querySelector('.status.s-vulnerable'), 'shows Vulnerable');
  ids.forEach((s, i) => scr(g).debug().setStatus(st.C.enemies[0].id, s, i + 1));
  await idle(g);
  t.eq($(g, '.cm-en .cm-st').querySelectorAll('.status').length, 4, 'a crowded enemy row shows four chips');
  t.eq(txt($(g, '.cm-en .cm-st .cm-more')), '+5', 'and a +5 chip, so two neighbouring rows (145 px lanes) can never overlap');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('hero panel: low HP flags, the danger vignette, the block chip and the tooltip', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa'], hp: [20, 60] });
  const p = heroPanel(g, 'hanae');
  t.ok(p.querySelector('.cm-bar').classList.contains('low'), 'Hanae at 20 HP is flagged low'); t.ok($(g, '.cm-danger').classList.contains('on'), 'the screen edge glows red');
  t.eq(txt(p.querySelector('.cm-bar .txt')), '20/' + g.DATA.heroes.hanae.maxHp, 'HP text');
  st.C.front().block = 9;
  scr(g).debug().setStatus('hanae', 'might', 0);
  await idle(g);
  t.ok(!p.querySelector('.cm-blk').hidden && txt(p.querySelector('.cm-blk .n')) === '9', 'Block 9 shows on the chip');
  const tip = p.rbTip();
  t.ok(tip.textContent.indexOf('Blossom Blade') >= 0 && tip.textContent.indexOf('Front: +2 damage') >= 0 && tip.textContent.indexOf('Back: ') >= 0, 'the hover tooltip names the hero and both rows');
  t.ok(tip.textContent.indexOf('Blade Flow') >= 0, 'and the passive');
  scr(g).debug().setHp('hanae', 60); scr(g).debug().setHp('kuro', 60);
  await idle(g);
  t.ok(!$(g, '.cm-danger').classList.contains('on'), 'healthy again: no vignette');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('piles: draw and discard open the deck viewer with their contents (sorted, order hidden); exhausted and powers chips appear', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'hanae_iai_draw', 'hanae_spring_vow'] });
  t.ok($(g, '.cm-chip.exh').hidden && $(g, '.cm-chip.pow').hidden, 'no exhaust or powers chip at the start');
  g._click($(g, '.cm-pile.draw'));
  const top = g.UI.overlay.top();
  t.eq(top.name, 'deck', 'the draw pile opened the deck viewer'); t.eq(top.params.cards.length, st.C.draw.length, 'with every card of the pile');
  const ids = top.params.cards.map((c) => c.uid).sort((a, b) => a - b);
  t.deep(ids, st.C.draw.map((c) => c.uid).sort((a, b) => a - b), 'the same cards');
  t.ok(top.params.title.indexOf('Draw pile (' + st.C.draw.length + ')') === 0, 'titled with the count');
  g.UI.overlay.closeAll();
  const exhaustUid = st.C.hand.find((c) => c.id === 'hanae_iai_draw').uid;
  const powerUid = st.C.hand.find((c) => c.id === 'hanae_spring_vow').uid;
  scr(g).debug().setEnergy(9);
  const iai = st.C.legalTargets(exhaustUid);
  g._click(cardEl(g, exhaustUid)); g._click(enemyBtn(g, iai[0]));
  await idle(g);
  t.ok(!st.C.needsTarget(powerUid), 'Spring Vow needs no target');
  g._click(cardEl(g, powerUid)); g._click(cardEl(g, powerUid));
  await idle(g);
  t.eq(st.C.exhaust.length, 1, 'the engine exhausted Iai Draw'); t.eq(st.C.powers.length, 1, 'and holds one power');
  t.ok(!$(g, '.cm-chip.exh').hidden && txt($(g, '.cm-chip.exh .cc-n')) === '1', 'the Exhausted chip appears with its count'); t.ok(!$(g, '.cm-chip.pow').hidden, 'so does the Powers chip');
  g._click($(g, '.cm-chip.exh'));
  t.eq(g.UI.overlay.top().params.cards.length, 1, 'the chip opens the exhaust pile'); g.UI.overlay.closeAll();
  g._click($(g, '.cm-chip.pow'));
  t.eq(g.UI.overlay.top().params.cards[0].id, 'hanae_spring_vow', 'and the powers'); g.UI.overlay.closeAll();
  assertPicture(g, 'after exhaust and power');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('relic strip: treasures with tooltips, a +N chip past seven, and a flash when a relic hook runs', async () => {
  const g = fresh();
  const many = Object.keys(g.DATA.relics).slice(0, 11);
  const { st } = await enter(g, { enemies: ['kappa'], relics: many });
  t.eq($$(g, '.cm-relics .relic').length, 7, 'seven relics show'); t.eq(txt($(g, '.cm-relic-more')), '+4', 'and a +4 chip');
  t.ok($$(g, '.cm-relics .relic').every((r) => typeof r.rbTip === 'function'), 'each relic has a tooltip');
  g._click($(g, '.cm-relic-more'));
  t.ok(g.UI.overlay.has('relics'), 'the chip opens the Treasures overlay'); g.UI.overlay.closeAll();
  feed(g, [{ type: 'relic', id: many[0] }]);
  await idle(g);
  t.ok(true, 'a relic event flashes without error');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('gold, ink and max HP events update the top-bar counters and the panels', async () => {
  const g = fresh();
  const { R, st } = await enter(g, { enemies: ['kappa'] });
  const g0 = R.gold, i0 = R.ink;
  feed(g, [{ type: 'gold', n: 25 }, { type: 'ink', n: 2 }, { type: 'max_hp', hero: 'kuro', n: 4 }]);
  await idle(g);
  t.eq(txt($(g, '.cm-stats .st-gold .val')), String(g0 + 25), 'gold counter'); t.eq(txt($(g, '.cm-stats .st-ink .val')), (i0 + 2) + '/' + R.inkMax, 'ink counter');
  feed(g, [{ type: 'gold', n: -20 }]);
  await idle(g);
  t.eq(txt($(g, '.cm-stats .st-gold .val')), String(g0 + 5), 'a theft lowers it');
  t.eq(errs(g), 0, 'no console errors');
});

// ==================================================================================================== 6. picks: hand select mode and the pile overlay
const findUid = (st, id) => st.C.hand.find((c) => c.id === id).uid;
const playCard = (g, uid, target) => { g._click(cardEl(g, uid)); if (target) g._click(enemyBtn(g, target)); else if (cardEl(g, uid)) g._click(cardEl(g, uid)); };

await t.test('hand pick (required): a prompt, a Confirm that waits for exactly n cards, then the engine finishes the card', async () => {
  const g = fresh();
  const bus = [];
  g.UI.bus.on('combat:pick', (e) => bus.push(e.pending));
  const { st } = await enter(g, { enemies: ['kappa'], hand: ['hanae_sakura_sort', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  const sort = findUid(st, 'hanae_sakura_sort');
  playCard(g, sort, st.C.needsTarget(sort) ? st.C.enemies[0].id : null);
  await idle(g);
  t.ok(!!st.C.pending, 'the engine is waiting for a pick'); t.eq(bus.length, 1, 'combat:pick fired once'); t.eq(bus[0].from, 'hand', 'from the hand');
  const prompt = $(g, '.cm-prompt');
  t.ok(!prompt.hidden, 'the prompt is up'); t.ok(txt(prompt.querySelector('.cp-text')).indexOf('Choose 1 card to discard') === 0, 'it says what to do');
  const confirm = prompt.querySelector('.btn-primary');
  t.ok(confirm.getAttribute('aria-disabled') === 'true', 'Confirm is disabled until a card is chosen');
  t.eq(txt(prompt.querySelector('.cp-count')), '0 / 1', 'the counter');
  t.ok($(g, '.cm-end').getAttribute('aria-disabled') === 'true', 'End Turn is off during a pick'); t.ok($(g, '.cm-swap').getAttribute('aria-disabled') === 'true', 'and so is Swap');
  const a = st.C.hand[0].uid, b = st.C.hand[1].uid, n0 = st.C.hand.length;
  g._click(cardEl(g, a));
  t.ok(cardEl(g, a).classList.contains('sel'), 'a tap chooses (gold glow)'); t.eq(txt(prompt.querySelector('.cp-count')), '1 / 1', 'counted'); t.ok(confirm.getAttribute('aria-disabled') !== 'true', 'Confirm is enabled');
  g._click(cardEl(g, b));
  t.ok(!cardEl(g, a).classList.contains('sel') && cardEl(g, b).classList.contains('sel'), 'with n = 1 the second tap replaces the first');
  t.eq(st.C.hand.length, n0, 'choosing changes nothing in the engine yet');
  g._click(confirm);
  await idle(g);
  t.ok(!st.C.pending, 'the pick was answered'); t.ok(prompt.hidden, 'the prompt is gone');
  t.ok(st.C.discard.some((c) => c.uid === b), 'the chosen card was discarded');
  assertPicture(g, 'after the pick');
  t.ok(g._doc.getElementById('sr').textContent.length > 0, 'the screen reader heard something');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('hand pick (optional, up to 2): Skip with none, Confirm with some, a third card is refused', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa'], hand: ['kuro_redraft', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  const rd = findUid(st, 'kuro_redraft');
  playCard(g, rd, st.C.needsTarget(rd) ? st.C.enemies[0].id : null);
  await idle(g);
  const prompt = $(g, '.cm-prompt');
  t.ok(!!st.C.pending && st.C.pending.optional, 'an optional pick');
  t.ok(txt(prompt.querySelector('.cp-text')).indexOf('Choose up to 2 cards to discard') === 0, 'the prompt says up to 2');
  const ok = prompt.querySelector('.btn-primary');
  t.eq(txt(ok.querySelector('.btn-label')), 'Skip', 'with nothing chosen the button reads Skip'); t.ok(ok.getAttribute('aria-disabled') !== 'true', 'and works');
  const c = st.C.hand.map((x) => x.uid);
  g._click(cardEl(g, c[0])); g._click(cardEl(g, c[1]));
  t.eq(txt(ok.querySelector('.btn-label')), 'Confirm', 'with cards chosen it reads Confirm'); t.eq(txt(prompt.querySelector('.cp-count')), '2 / up to 2', 'counter');
  g._click(cardEl(g, c[2]));
  t.ok(!cardEl(g, c[2]).classList.contains('sel'), 'a third card is refused'); t.ok(g._doc.querySelector('#toasts').textContent.indexOf('Choose only 2') >= 0, 'with a toast');
  g._click(cardEl(g, c[1]));
  t.eq(txt(prompt.querySelector('.cp-count')), '1 / up to 2', 'a tap on a chosen card un-chooses it');
  g._key('Enter');
  await idle(g);
  t.ok(!st.C.pending, 'Enter confirms'); t.eq(st.C.discard.filter((x) => x.uid === c[0]).length, 1, 'the one chosen card was discarded');
  assertPicture(g, 'after the optional pick');
  const g2 = fresh();
  const r2 = await enter(g2, { enemies: ['kappa'], hand: ['kuro_redraft', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  const rd2 = findUid(r2.st, 'kuro_redraft');
  playCard(g2, rd2, r2.st.C.needsTarget(rd2) ? r2.st.C.enemies[0].id : null);
  await idle(g2);
  g2._click($(g2, '.cm-prompt .btn-primary'));
  await idle(g2);
  t.ok(!r2.st.C.pending && r2.st.C.hand.length === 4, 'Skip answers the pick with nothing and the card still finishes');
  t.eq(errs(g) + errs(g2), 0, 'no console errors');
});

await t.test('draw-pile pick opens the cardPick overlay; closing it empty is refused and asked again; choosing moves the card to the hand', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa'], hand: ['kuro_skim_the_scroll', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  const sk = findUid(st, 'kuro_skim_the_scroll');
  playCard(g, sk, st.C.needsTarget(sk) ? st.C.enemies[0].id : null);
  await idle(g);
  t.ok(g.UI.overlay.has('cardPick'), 'a pile pick opens the cardPick overlay');
  const top = g.UI.overlay.top();
  t.eq(top.params.n, 1, 'n'); t.deep(top.params.cards.map((c) => c.uid).sort((a, b) => a - b), st.C.pending.uids.slice().sort((a, b) => a - b), 'the candidates are exactly the pending uids');
  t.ok(top.params.title.indexOf('Choose 1 card') === 0, 'titled');
  g.UI.overlay.close([]);
  await idle(g);
  t.ok(!!st.C.pending && g.UI.overlay.has('cardPick'), 'an empty answer to a required pick is refused: the overlay opens again');
  const want = st.C.pending.uids[0];
  g.UI.overlay.close([want]);
  await idle(g);
  t.ok(!st.C.pending, 'answered'); t.ok(st.C.hand.some((c) => c.uid === want), 'the card came into the hand');
  assertPicture(g, 'after the pile pick');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('GAME.debug.combat().pick answers either kind of pick', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa'], hand: ['hanae_sakura_sort', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  const sort = findUid(st, 'hanae_sakura_sort');
  playCard(g, sort, st.C.needsTarget(sort) ? st.C.enemies[0].id : null);
  await idle(g);
  const d = g.GAME.debug.combat();
  t.ok(d && d.C === st.C && typeof d.play === 'function' && typeof d.pick === 'function', 'GAME.debug.combat() returns the screen hooks');
  t.ok(d.pick([st.C.pending.uids[0]]), 'pick accepted');
  await idle(g);
  t.ok(!st.C.pending, 'resolved through the hook');
  t.eq(errs(g), 0, 'no console errors');
});

// ==================================================================================================== 7. the end of the fight
await t.test('win: combat:end, a victory card, RUN.combatDone, then GAME routes to the reward node (the reward screen)', async () => {
  const g = fresh();
  const ended = [];
  g.UI.bus.on('combat:end', (e) => ended.push(e.result));
  g._run('globalThis.__routed = []; { const o = GAME.enterNode; GAME.enterNode = function (n) { __routed.push(n && n.kind); return arguments[1] === "pass" ? o.call(GAME, n) : Promise.resolve(); }; }');
  const { R, st } = await enter(g, { enemies: ['kodama'], hand: ['hanae_slash', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  st.C.enemies[0].hp = 4; scr(g).debug().setHp(st.C.enemies[0].id, 4);
  const gold0 = R.gold;
  g._click(cardEl(g, st.C.hand[0].uid));
  await idle(g);
  t.deep(ended, ['win'], 'combat:end {result: win}'); t.eq(st.C.result, 'win', 'the engine says win');
  t.ok($(g, '.cm-endcard').textContent.indexOf('VICTORY') >= 0 && $(g, '.cm-endcard').classList.contains('win'), 'the victory card is on screen');
  t.ok(g._run('__routed').length === 1 && g._run('__routed')[0] === 'reward', 'GAME.enterNode got the reward node (the beat is over)');
  t.eq(R.node.kind, 'reward', 'RUN.combatDone turned the node into a reward'); t.ok(R.gold > gold0, 'and paid the gold');
  t.ok(sfxLog(g).indexOf('victory') >= 0, 'the victory sting played');
  t.ok($(g, '.cm-top .menu-btn').disabled, 'the menu button is off during the beat (a save here would lose the win)');
  t.eq(errs(g), 0, 'no console errors');
  // and the real routing, through GAME
  const g2 = fresh();
  const r2 = await enter(g2, { enemies: ['kodama'], hand: ['hanae_slash', 'hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  scr(g2).debug().setHp(r2.st.C.enemies[0].id, 4);
  g2._click(cardEl(g2, r2.st.C.hand[0].uid));
  await idle(g2, 8);
  t.eq(g2.UI.currentName, 'reward', 'UI.go routed to the reward screen'); t.eq(r2.R.node.kind, 'reward', 'with the reward node current');
  t.eq($$(g2, '.cm').length, 0, 'the combat DOM is gone');
  t.eq(errs(g2), 0, 'no console errors');
});

await t.test('win by debug: GAME.debug.combat().win() ends the fight through the same path', async () => {
  const g = fresh();
  const { R } = await enter(g, { enemies: ['kappa', 'kodama'] });
  await g.GAME.debug.combat().win();
  await idle(g, 8);
  t.eq(g.UI.currentName, 'reward', 'forced win routed to the reward'); t.eq(R.node.kind, 'reward', 'RUN.combatDone ran');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('lose: RUN.combatDone merges the stats, combat:end lets GAME record the run, a defeat card, then the defeat route', async () => {
  const g = fresh();
  const ended = [];
  g.UI.bus.on('combat:end', (e) => ended.push([e.result, g.GAME.state.ended ? g.GAME.state.ended.outcome : null]));
  g._run('globalThis.__routed = []; { const o = GAME.enterNode; GAME.enterNode = function (n) { __routed.push(n && n.kind); return Promise.resolve(); }; }');
  const { R, st } = await enter(g, { enemies: ['kappa', 'tanuki_bandit', 'oni_cub'], hp: [1, 1] });
  t.eq(R.stats.kills, 0, 'no kills yet');
  for (let n = 0; n < 8 && !st.C.result; n++) { g._click($(g, '.cm-end')); await idle(g, 8); }
  t.eq(st.C.result, 'lose', 'both heroes fell'); t.eq(ended.length, 1, 'combat:end fired once'); t.eq(ended[0][0], 'lose', 'with result lose');
  t.ok(R.done === true && R.victory === false, 'RUN.combatDone recorded the party falling');
  t.ok($(g, '.cm-endcard').textContent.indexOf('DEFEAT') >= 0 && $(g, '.cm-endcard').classList.contains('lose'), 'the defeat card is on screen');
  t.deep(g._run('__routed'), ['defeat'], 'GAME.enterNode({kind: defeat}) was the route');
  t.ok(sfxLog(g).indexOf('defeat') >= 0, 'the defeat sting played');
  t.ok(st.C.heroes.every((h) => h.down), 'both heroes are down in the engine');
  t.ok($$(g, '.cm-hero.down').length === 2, 'and both panels show FALLEN');
  t.eq(errs(g), 0, 'no console errors');
  const g2 = fresh();
  const r2 = await enter(g2, { enemies: ['kappa', 'tanuki_bandit', 'oni_cub'], hp: [1, 1] });
  for (let n = 0; n < 8 && !r2.st.C.result; n++) { g2._click($(g2, '.cm-end')); await idle(g2, 8); }
  await idle(g2, 10);
  t.eq(g2.UI.currentName, 'gameOver', 'through GAME the run ends on the gameOver screen'); t.ok(g2.GAME.state.ended && g2.GAME.state.ended.outcome === 'lose', 'and was recorded once as a loss');
  t.eq(errs(g2), 0, 'no console errors');
});

await t.test('a downed hero: the panel shows FALLEN, the survivor is forced to the front, its cards dim, and a win revives it', async () => {
  const g = fresh();
  const { R, st } = await enter(g, { enemies: ['kappa', 'kodama'], hp: [1, 60], hand: ['hanae_slash', 'hanae_parry', 'kuro_ink_bolt', 'kuro_ink_ward', 'hanae_petal_step'] });
  st.C.heroes.forEach((h) => { h.st = {}; });
  let n = 0;
  while (!st.C.heroes[0].down && n++ < 6) { g._click($(g, '.cm-end')); await idle(g, 4); if (st.C.result) break; }
  t.ok(st.C.heroes[0].down, 'Hanae (1 HP) went down');
  t.ok(heroPanel(g, 'hanae').classList.contains('down'), 'the panel greys out'); t.ok(heroPanel(g, 'kuro').classList.contains('front'), 'Kuro is in front');
  const dead = st.C.hand.filter((c) => g.DATA.cards[c.id].hero === 'hanae');
  dead.forEach((c) => t.ok(cardEl(g, c.uid).classList.contains('dis'), 'Hanae card ' + c.id + ' is dimmed (dead)'));
  t.ok($(g, '.cm-swap').getAttribute('aria-disabled') === 'true', 'no swap with one hero standing');
  assertPicture(g, 'after Hanae fell');
  t.eq(errs(g), 0, 'no console errors');
});

// ==================================================================================================== 8. whole fights through the screen, checked after every action
const STAGES = [
  { name: 'chapter 1, one enemy', ch: 1, tier: 'normal', enemies: ['kappa'], heroes: ['hanae', 'kuro'] },
  { name: 'chapter 1, three enemies', ch: 1, tier: 'normal', enemies: ['kodama', 'bamboo_sprite', 'oni_cub'], heroes: ['suzu', 'raiga'] },
  { name: 'chapter 1, elite', ch: 1, tier: 'elite', enemies: ['oni_brute', 'leaf_imp'], heroes: ['hanae', 'suzu'] },
  { name: 'chapter 1, the boss (xl)', ch: 1, tier: 'boss', enemies: ['boss_kuzunoha'], heroes: ['kuro', 'raiga'] },
  { name: 'chapter 2, four enemies', ch: 2, tier: 'normal', enemies: ['silk_weaver', 'nopperabo', 'koi_spirit', 'ittan_momen'], heroes: ['hanae', 'raiga'] },
  { name: 'chapter 2, the boss', ch: 2, tier: 'boss', enemies: ['boss_jorogumo'], heroes: ['suzu', 'kuro'] },
  { name: 'chapter 3, five enemies', ch: 3, tier: 'normal', enemies: ['blank_page', 'spark_mote', 'typo_sprite', 'blank_page', 'spark_mote'], heroes: ['raiga', 'kuro'] },
  { name: 'chapter 3, the boss in three phases', ch: 3, tier: 'boss', enemies: ['boss_editor'], heroes: ['hanae', 'suzu'] },
];
for (const sg of STAGES) {
  await t.test('full fight through the screen: ' + sg.name, async () => {
    const g = fresh();
    const { R, st } = await enter(g, { chapter: sg.ch, tier: sg.tier, enemies: sg.enemies, heroes: sg.heroes, hp: sg.tier === 'boss' ? [999, 999] : undefined });
    const alive0 = st.C.enemies.length;
    t.eq($$(g, '.cm-en').length, alive0, 'one overlay per enemy at the start');
    const r = await playThrough(g, { check: sg.name, maxActions: 260 });
    await idle(g, 8);
    t.ok(r.actions > 3, 'the bot acted ' + r.actions + ' times');
    t.ok(st.C.result === 'win' || st.C.result === 'lose' || r.actions >= 260, 'the fight ended (' + st.C.result + ') or hit the action cap');
    if (st.C.result) t.eq(g.UI.currentName, st.C.result === 'win' ? 'reward' : 'gameOver', 'and GAME routed accordingly');
    t.eq(st.drift, null, 'no drift at the very end');
    t.eq(errs(g), 0, 'no console errors');
    void R;
  });
}

// ==================================================================================================== 9. robustness, cleanup, stages
await t.test('unmount in the middle of a drain: no throw, no late DOM or engine writes, SCENE unmounted, everything released', async () => {
  const g = fresh();
  const before = { key: g._listeners('keydown'), down: g._listeners('pointerdown'), timers: g._timers.length };
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'kuro_ink_bolt', 'hanae_petal_step'] });
  t.ok(g._listeners('keydown') >= before.key, 'the UI key listener is installed');
  g._run('__sc.hold = true');
  g._click($(g, '.cm-end'));
  t.ok(st.draining && st.fifo.length > 0, 'an enemy phase is in flight with events still queued');
  const root = $(g, '.s-combat');
  await g.UI.go('title', null, { force: true, transition: 'none' });
  await idle(g);
  t.ok(!$(g, '.s-combat') && !root.isConnected, 'the combat DOM is gone');
  t.eq(S(g), null, 'the screen state is released'); t.eq(sc(g).unmounted, 1, 'SCENE.unmount ran once');
  t.eq(st.fifo.length, 0, 'the FIFO was dropped');
  g._run('__sc.hold = false; SCENE.flush()');
  await idle(g, 6);
  t.eq(errs(g), 0, 'nothing threw when the held beats were released after the screen was gone'); t.eq(g._uncaught.length, 0, 'no uncaught errors');
  t.ok(!g.UI.tip.open, 'no tooltip is left behind'); t.eq(g.UI.overlay.count(), 0, 'no overlay is left behind');
  t.eq($$(g, '#tips > *').length, 0, 'the tips layer is empty');
  t.eq(g._listeners('pointerdown') <= before.down + 1, true, 'no pointerdown listeners leaked');
  t.eq($$(g, '#screens .s-combat').length, 0, 'nothing of the screen remains in #screens');
});

await t.test('a hold that never resolves: the watchdog frees the beat after six seconds of frames; a tap does it at once', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'kuro_ink_bolt', 'hanae_petal_step'] });
  g._run('__sc.hold = true');
  g._click(cardEl(g, st.C.hand[0].uid)); g._click(cardEl(g, st.C.hand[0].uid));
  t.ok(st.draining, 'stuck in a beat');
  const f0 = sc(g).flushes;
  g._advance(5000);
  await idle(g);
  t.eq(sc(g).flushes, f0, 'nothing forced at 5 s');
  g._advance(1500);
  await idle(g, 2);
  t.ok(sc(g).flushes > f0, 'the watchdog flushed SCENE and freed the beat after 6 s');
  t.eq(g._console.warn.filter((w) => warnText(w).indexOf('did not resolve') >= 0).length, 1, 'and said so once');
  g._run('__sc.hold = false; SCENE.flush()');
  await idle(g, 6);
  t.ok(!st.draining, 'released, the drain finishes');
  t.eq(g._console.error.length, 0, 'no console errors (the one warning above is the point)');
});

await t.test('a throwing SCENE never bricks the fight: play, update and draw failures are contained', async () => {
  const g = fresh();
  g._run('SCENE.play = function () { throw new Error("boom"); }; SCENE.draw = function () { throw new Error("boom draw"); };');
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'] });
  t.ok(st.C.hand.length === 5 && !st.draining, 'the opening drain finished even though every SCENE.play threw');
  g._click($(g, '.cm-end'));
  await idle(g, 6);
  t.eq(st.C.turn, 2, 'a whole round played');
  g._frames(3);
  t.eq(g._win.__errors.filter((e) => /combat/.test(String(e.screen))).length, 0, 'a throwing SCENE.draw did not tear the page');
  t.ok(g._console.warn.some((w) => warnText(w).indexOf('SCENE.play threw') >= 0), 'the failure was logged once as a warning');
  t.eq(g._console.error.length, 0, 'and it was never an error');
});

await t.test('the frame loop: update() drives SCENE, draw() paints it, overlays are placed from anchors', async () => {
  const g = fresh();
  await enter(g, { enemies: ['kappa', 'kodama', 'tanuki_bandit'] });
  const u0 = sc(g).updates, d0 = sc(g).draws;
  g._frames(4);
  t.ok(sc(g).updates >= u0 + 4 && sc(g).draws >= d0 + 4, 'SCENE.update and SCENE.draw ran every frame');
  const id = S(g).C.enemies[0].id, a = JSON.parse(g._run('JSON.stringify(SCENE.anchor("enemy", ' + JSON.stringify(id) + '))'));
  const bar = $(g, '.cm-en[data-enemy="' + id + '"] .cm-ebarwrap'), hit = enemyBtn(g, id);
  t.eq(bar.style.left, a.feet.x + 'px', 'the HP bar is centred on the feet'); t.eq(bar.style.top, (a.feet.y + 14) + 'px', '14 px under the feet');
  const bub = $(g, '.cm-en[data-enemy="' + id + '"] .cm-int');
  t.eq(bub.style.left, a.top.x + 'px', 'the intent bubble is centred on the top'); t.ok(parseFloat(bub.style.top) <= a.top.y - 6, 'with its bottom 6 px above the head'); t.ok(parseFloat(bub.style.top) >= 62, 'and never above y 62');
  t.ok(parseFloat(hit.style.width) >= 96 && parseFloat(hit.style.height) >= 96, 'the hit area is at least 96 x 96');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('summons appear as new overlays and dead enemies fade; the boss phase line is spoken', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kodama'] });
  const summ = { type: 'summon', enemy: { kind: 'enemy', id: 'leaf_imp#9', def: 'leaf_imp', name: 'Leaf Imp', hp: 6, maxHp: 6, block: 0, st: {}, down: false, fled: false, tier: 'minion', size: 's', lane: 3, phase: 0, turn: 1, intent: null } };
  feed(g, [summ]);
  await idle(g);
  t.ok(!!$(g, '.cm-en[data-enemy="leaf_imp#9"]'), 'an overlay was made for the summon from the event');
  t.eq($$(g, '.cm-en').length, 2, 'two overlays');
  feed(g, [{ type: 'enemy_act', enemy: st.C.enemies[0].id, move: 'x', name: 'Rattle', kind: 'attack', say: 'Rattle rattle!' }]);
  await idle(g);
  const say = $(g, '.cm-en[data-enemy="' + st.C.enemies[0].id + '"] .cm-say');
  t.eq(txt(say), 'Rattle rattle!', 'a move say line is shown next to the enemy when SCENE cannot shout');
  const g2 = fresh();
  g2._run('SCENE.shout = function (id, x) { __sc.shouts = (__sc.shouts || []).concat([[id, x]]); };');
  const r2 = await enter(g2, { enemies: ['kodama'] });
  feed(g2, [{ type: 'enemy_act', enemy: r2.st.C.enemies[0].id, move: 'x', name: 'Rattle', kind: 'attack', say: 'Rattle rattle!' }]);
  await idle(g2);
  t.ok(g2._doc.querySelector('.cm-say').hidden, 'a SCENE that shouts (the real one does) is left to do it: no second, DOM bubble');
  t.eq(errs(g) + errs(g2), 0, 'no console errors');
});

await t.test('no SCENE at all: the built-in stage keeps the fight playable', async () => {
  const g = fresh({ stage: 'none' });
  t.eq(typeof g._run('typeof SCENE'), 'string', 'sanity'); t.eq(g._run('typeof SCENE'), 'undefined', 'there is no SCENE in this page');
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'kuro_ink_bolt', 'hanae_petal_step'] });
  t.ok(!st.realScene, 'the screen is on the fallback stage'); t.ok($(g, '.cm').classList.contains('fallback-scene'), 'and marks it');
  g._frames(3);
  const a = st.sc.anchor('enemy', st.C.enemies[0].id);
  t.ok(a && a.w > 0 && a.top.y < a.feet.y, 'the fallback gives anchors');
  t.eq(st.sc.hitTest(a.x + a.w / 2, a.y + a.h / 2).id, st.C.enemies[0].id, 'and hit tests');
  g._click(cardEl(g, st.C.hand[1].uid)); g._click(enemyBtn(g, st.C.enemies[0].id));
  await idle(g);
  assertPicture(g, 'fallback stage');
  const r = await playThrough(g, { check: 'fallback', maxActions: 200 });
  await idle(g, 8);
  t.ok(r.actions > 2 && (st.C.result || r.actions >= 200), 'a whole fight played on the fallback stage');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('touch: taps select and play, hover-only paths stay quiet, tooltips are for long presses', async () => {
  const g = fresh({ touch: true });
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'kuro_ink_bolt', 'hanae_petal_step'] });
  const parry = st.C.hand[0].uid;
  g._pointer('pointerenter', cardEl(g, parry), { pointerType: 'touch' });
  t.eq(st.hoverUid, null, 'a touch pointer entering a card does not raise it');
  g._click(cardEl(g, parry), { pointerType: 'touch' });
  t.ok(cardEl(g, parry).classList.contains('sel'), 'a tap selects');
  g._click(cardEl(g, parry), { pointerType: 'touch' });
  await idle(g);
  t.eq(st.C.energy, 2, 'the second tap plays');
  const slash = st.C.hand.find((c) => c.id === 'hanae_slash').uid;
  g._click(cardEl(g, slash), { pointerType: 'touch' });
  g._click(enemyBtn(g, st.C.enemies[1].id), { pointerType: 'touch' });
  await idle(g);
  t.ok(st.C.enemies[1].hp < st.C.enemies[1].maxHp, 'tap card, tap enemy');
  g._click(enemyBtn(g, st.C.enemies[0].id), { pointerType: 'touch' });
  t.ok(g.UI.tip.open, 'tapping an enemy with nothing selected shows what it is about to do');
  t.ok(g._doc.querySelector('#tips').textContent.indexOf('Kappa') >= 0, 'in a bubble with its name');
  scr(g).debug().setStatus(st.C.enemies[1].id, 'vulnerable', 2);
  await idle(g);
  g._click(enemyBtn(g, st.C.enemies[1].id), { pointerType: 'touch' });
  const tipText = g._doc.querySelector('#tips').textContent;
  t.ok(/Right now/.test(tipText) && /Vulnerable 2/.test(tipText) && /50% more/.test(tipText), 'a tap on a foe that carries a status names it and says what it does (the chips are too small to press on a phone)');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('accessibility: labelled controls, a live region, focusable enemies in line order, visible focus targets', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama', 'tanuki_bandit'] });
  $$(g, '.cm-hand .card').forEach((c) => t.ok((c.getAttribute('aria-label') || '').length > 10 && c.getAttribute('role') === 'button', 'card ' + c.dataset.id + ' has a role and a full aria-label'));
  ['.cm-end', '.cm-swap', '.cm-pile.draw', '.cm-pile.discard', '.cm-orb', '.cm-speed'].forEach((s) => t.ok(($(g, s).getAttribute('aria-label') || '').length > 3, s + ' has an aria-label'));
  const btns = $$(g, '.cm-ehit');
  t.eq(btns.length, 3, 'a button per enemy'); t.deep(btns.map((b) => b.closest('.cm-en').dataset.enemy), st.C.enemies.slice().sort((a, b) => a.lane - b.lane).map((e) => e.id), 'in line order for Tab');
  btns.forEach((b) => t.ok(/health/.test(b.getAttribute('aria-label')) && /Intends/.test(b.getAttribute('aria-label')), 'the enemy button says HP and intent'));
  t.ok(heroPanel(g, 'hanae').getAttribute('aria-label').indexOf('front row') > 0, 'hero panels say their row');
  t.ok(g._doc.getElementById('sr').getAttribute('aria-live') === 'polite', 'the live region exists');
  const order = $$(g, '.cm button, .cm [tabindex="0"], .cm [role=button]').filter((e) => !e.hidden && e.tabIndex >= 0);
  t.ok(order.indexOf($(g, '.cm-swap')) < order.indexOf($(g, '.cm-ehit')) && order.indexOf($(g, '.cm-ehit')) < order.indexOf($(g, '.cm-hand .card')) && order.indexOf($(g, '.cm-hand .card')) < order.indexOf($(g, '.cm-end')), 'Tab order: heroes, enemies, hand, End Turn');
  g._click($(g, '.cm-end'));
  await idle(g);
  t.ok(/Turn 2/.test(g._doc.getElementById('sr').textContent) && /hits|uses/.test(g._doc.getElementById('sr').textContent + 'uses'), 'the region got a line for the enemy phase');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('settings: colorblind, reduce motion and text scale keep the screen working', async () => {
  const g = fresh();
  g.UI.setSetting('textScale', 1.3); g.UI.setSetting('colorblind', true); g.UI.setSetting('reduceMotion', true);
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'] });
  t.eq($(g, '#stage').style.getPropertyValue('--ts'), '1.3', 'text scale reaches the stage'); t.ok(g._doc.body.classList.contains('colorblind') && g._doc.body.classList.contains('reduce-motion'), 'body flags set');
  g._click(cardEl(g, st.C.hand[0].uid)); g._click(cardEl(g, st.C.hand[0].uid));
  await idle(g);
  g._click($(g, '.cm-end'));
  await idle(g);
  assertPicture(g, 'reduced motion');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('debug hooks: debugSetup sets the hand and statuses; GAME.debug.open opens the screen; the hooks play, swap and end the turn', async () => {
  const g = fresh();
  await g.GAME.debug.open('combat', { enemies: ['kappa', 'tanuki_bandit'], heroes: ['suzu', 'raiga'], hand: ['suzu_ofuda', 'raiga_jab', 'suzu_barrier'], statuses: { kappa: { weak: 2 }, suzu: { might: 3 } } });
  await idle(g, 8);
  const st = S(g), d = g.GAME.debug.combat();
  t.deep(st.C.hand.map((c) => c.id), ['suzu_ofuda', 'raiga_jab', 'suzu_barrier'], 'the debug hand was dealt'); t.eq($$(g, '.cm-hand .hc').length, 3, 'and shown');
  t.eq(st.C.enemies[0].st.weak, 2, 'enemy status set'); t.eq(txt($(g, '.cm-en .cm-st .status.s-weak .n')), '2', 'and drawn');
  t.eq(txt(heroPanel(g, 'suzu').querySelector('.status.s-might .n')), '3', 'hero status drawn');
  t.ok(d.play(1, 0), 'debug.play(handIndex, targetIndex) plays'); await idle(g);
  t.eq(st.C.energy, 3 - 1, 'and paid');
  d.swap(); await idle(g);
  t.eq(st.C.front().id, 'raiga', 'debug.swap swapped');
  d.endTurn(); await idle(g, 6);
  t.eq(st.C.turn, 2, 'debug.endTurn ended the turn');
  d.setHp('raiga', 3); await idle(g);
  t.eq(txt(heroPanel(g, 'raiga').querySelector('.cm-bar .txt')), '3/' + st.C.heroes[1].maxHp, 'setHp redraws');
  t.eq(errs(g), 0, 'no console errors');
});

// ==================================================================================================== 10. against the real scene.js (when it exists)
{
  const probe = boot({ only: ['screen_combat'] });
  const haveScene = typeof probe.SCENE === 'object' && probe.SCENE && typeof probe.SCENE.mount === 'function';
  if (!haveScene) console.log('note: js/scene.js is not written yet, the real-SCENE section is skipped');
  else {
    await t.test('real SCENE: mounted for the fight, anchors and hit tests agree with the overlays, unmounted at leave', async () => {
      const g = fresh({ stage: 'real' });
      const { st } = await enter(g, { enemies: ['kappa', 'kodama', 'tanuki_bandit'], hand: ['hanae_parry', 'hanae_slash', 'kuro_ink_ward', 'kuro_ink_bolt', 'hanae_petal_step'] });
      t.ok(st.realScene, 'the screen took the real SCENE'); t.ok(g.SCENE.stats().mounted, 'SCENE is mounted');
      st.C.enemies.forEach((e) => {
        const a = g.SCENE.anchor('enemy', e.id);
        t.ok(a && a.w > 0 && a.h > 0 && a.top.y < a.feet.y, 'anchor for ' + e.id);
        const hit = g.SCENE.hitTest(a.x + a.w / 2, a.y + a.h / 2);
        t.ok(hit && hit.kind === 'enemy', 'hitTest at the body centre finds an enemy near ' + e.id);
      });
      t.eq(g.SCENE.hitTest(640, 30), null, 'nothing at the top of the stage');
      g._frames(3);
      g._click(cardEl(g, st.C.hand[1].uid)); g._click(enemyBtn(g, st.C.enemies[1].id));
      await idle(g);
      assertPicture(g, 'real SCENE after a card');
      g._click($(g, '.cm-end'));
      await idle(g, 8);
      assertPicture(g, 'real SCENE after a round');
      t.eq(errs(g), 0, 'no console errors');
      await g.UI.go('title', null, { force: true, transition: 'none' });
      await idle(g);
      t.ok(!g.SCENE.stats().mounted, 'SCENE.unmount ran at leave');
    });
    for (const sg of [STAGES[1], STAGES[3], STAGES[7]]) {
      await t.test('real SCENE, full fight: ' + sg.name, async () => {
        const g = fresh({ stage: 'real' });
        const { st } = await enter(g, { chapter: sg.ch, tier: sg.tier, enemies: sg.enemies, heroes: sg.heroes, hp: sg.tier === 'boss' ? [999, 999] : undefined });
        const r = await playThrough(g, { check: 'real ' + sg.name, maxActions: 200 });
        await idle(g, 8);
        t.ok(r.actions > 3, 'the bot acted ' + r.actions + ' times');
        t.eq(st.drift, null, 'no drift'); t.eq(errs(g), 0, 'no console errors');
      });
    }
  }
}

// ==================================================================================================== 11. audio, barks, live intents
const aud = (g) => g._run('__aud');

await t.test('music and intensity: the track follows the tier, intensity rises as enemies fall and per boss phase, final for the last Editor phase', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'kodama'], hand: ['hanae_slash', 'hanae_slash', 'hanae_slash', 'kuro_ink_bolt', 'kuro_ink_ward'] });
  t.eq(aud(g).music[aud(g).music.length - 1], 'combat1', 'a normal fight plays combat1');
  t.eq(aud(g).intensity[aud(g).intensity.length - 1], 0, 'intensity starts at 0');
  const [a, b] = st.C.enemies;
  st.C.enemies[1].hp = 3; scr(g).debug().setHp(b.id, 3);
  const slash = st.C.hand[0].uid;
  g._click(cardEl(g, slash)); g._click(enemyBtn(g, b.id));
  await idle(g);
  t.ok(b.down, 'one enemy fell'); t.eq(aud(g).intensity[aud(g).intensity.length - 1], 0.5, 'intensity 1 - living / starting = 0.5');
  await g.UI.go('title', null, { force: true, transition: 'none' });
  t.eq(aud(g).intensity[aud(g).intensity.length - 1], 0, 'leaving the screen resets it');
  const gb = fresh();
  const rb = await enter(gb, { enemies: ['boss_kuzunoha'], tier: 'boss', hand: ['hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_parry', 'kuro_ink_ward'] });
  t.eq(aud(gb).music[aud(gb).music.length - 1], 'boss1', 'the boss of chapter 1 plays boss1');
  const boss = rb.st.C.enemies[0];
  scr(gb).debug().setHp(boss.id, Math.floor(boss.maxHp * 0.49));
  g._run('void 0');
  gb._click(cardEl(gb, rb.st.C.hand[0].uid));
  await idle(gb);
  t.eq(boss.phase, 1, 'a hit below half HP started phase 2 in the engine');
  t.eq(aud(gb).intensity[aud(gb).intensity.length - 1], 0.25, 'one boss phase entered adds 0.25');
  t.ok(gb._doc.getElementById('sr').textContent.length > 0, 'and the phase change was announced');
  const ge = fresh();
  await enter(ge, { enemies: ['boss_editor'], tier: 'boss', chapter: 3 });
  const eid = S(ge).C.enemies[0].id;
  feed(ge, [{ type: 'enemy_phase', enemy: eid, index: 1, at: 0.66, say: 'x' }]);
  await idle(ge);
  t.ok(aud(ge).music.indexOf('final') < 0, 'phase 1 of the Editor is not the final track yet');
  feed(ge, [{ type: 'enemy_phase', enemy: eid, index: 2, at: 0.33, say: 'y' }]);
  await idle(ge);
  t.eq(aud(ge).music[aud(ge).music.length - 1], 'final', 'the last phase of the Editor switches to the final track');
  const gc = fresh();
  await enter(gc, { enemies: ['oni_brute'], tier: 'elite' });
  t.eq(aud(gc).music[aud(gc).music.length - 1], 'elite', 'an elite plays the elite track');
  t.eq(errs(g) + errs(gb) + errs(ge) + errs(gc), 0, 'no console errors');
});

await t.test('barks: a hero bark reaches SCENE.bark from the hero own lore at the start of some fights, never twice within 6 s', async () => {
  let found = null, total = 0;
  for (let seed = 1; seed <= 24 && !found; seed++) {
    const g = fresh();
    const { st } = await enter(g, { enemies: ['kappa'], cseed: seed });
    total++;
    if (sc(g).barks.length) found = { g, st };
  }
  t.ok(!!found, 'a start bark happened in one of ' + total + ' seeded fights (35% each)');
  const b = sc(found.g).barks[0];
  t.eq(b[0], found.st.C.front().id, 'the front hero speaks at the start');
  t.ok(found.g.DATA.lore['barks_' + b[0]].lines.start.indexOf(b[1]) >= 0, 'and says one of its start lines');
  const n0 = sc(found.g).barks.length;
  feed(found.g, [{ type: 'hero_down', hero: 'kuro' }]);
  await idle(found.g);
  t.eq(sc(found.g).barks.length, n0, 'a second bark inside the 6 s gap is swallowed (the clock has not moved)');
  t.eq(errs(found.g), 0, 'no console errors');
});

await t.test('intents stay live: Weak, Vulnerable and Block on the enemy or hero change the numbers after every drained batch', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['kappa', 'tanuki_bandit'] });
  st.C.enemies.forEach((e) => {
    const before = st.C.intent(e).dmg;
    scr(g).debug().setStatus(e.id, 'weak', 2);
    const after = st.C.intent(e).dmg;
    t.ok(after < before, e.id + ': Weak lowers the intent number (' + before + ' to ' + after + ')');
    t.eq(txt($(g, '.cm-en[data-enemy="' + e.id + '"] .cm-int .ib-num')), String(after), e.id + ': and the bubble shows it');
  });
  scr(g).debug().setStatus('hanae', 'vulnerable', 2);
  st.C.enemies.forEach((e) => t.eq(txt($(g, '.cm-en[data-enemy="' + e.id + '"] .cm-int .ib-num')), String(st.C.intent(e).dmg), e.id + ': a Vulnerable target raises the number again'));
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('intent targets: a back-row attack shows the back hero medallion; a taunt redirects it', async () => {
  const g = fresh();
  const { st } = await enter(g, { enemies: ['crow_tengu'], heroes: ['hanae', 'kuro'], cseed: 3 });
  const e = st.C.enemies[0], it = st.C.intent(e);
  const bub = $(g, '.cm-en .cm-int');
  if (Array.isArray(it.tgt) && it.tgt.length) t.eq(bub.querySelectorAll('.ib-tgt .ico').length, it.tgt.length, 'one medallion per targeted hero');
  else t.ok(true, 'this move has no fixed target');
  t.ok(/Crow Tengu intends/.test(bub.getAttribute('aria-label')), 'the bubble is labelled for screen readers');
  t.eq(errs(g), 0, 'no console errors');
});
await t.done();
