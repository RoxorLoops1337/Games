// Hocus Vocus: combat rules engine. Pure logic: no DOM, no clock, no banned random call. Deterministic for a given seed.
//
// COMBAT.create(opts) -> C. Everything the UI and the tests need is on C. The contract is DESIGN.md 4.1 to 4.7 and 5.2; this
// header records every public function and the few places where the design left a choice open.
//
// PUBLIC API
//   COMBAT.create({ heroes:[{id,hp,maxHp}], frontIdx, deck:[{uid,id,up,gems}], enemies:[enemyId], tier, chapter, seed, mods, relics:[id], gold }) -> C
//        mods is RUN.mods(R) verbatim (partial objects are fine, missing keys default from DATA.foldMods([])); only energy, hand, startBlock,
//        freeSwaps, enemyHp, eliteHp, bossHp and enemyDmg are read. relics are only for hooks and row bonuses. Enemy HP is rolled in create
//        (C.rng), so units are fully formed before start(); C.start() then runs enemy `start` ops, the opening shuffle, combatStart hooks,
//        the first intents and turn 1. The opening shuffle is not a `shuffle` event and does not fire onShuffle.
//   COMBAT.simulate(opts, policyFn?) -> summary   plays a whole combat with policyFn(C) (default COMBAT.greedyPolicy). The summary is C.summary()
//        plus { turns, actions, capped }, and a NON-ENUMERABLE property C (the finished combat) for callers that want events or piles.
//        opts.maxTurns (default 60) and opts.maxActions (default 3000) stop a runaway combat with result null and capped true.
//   COMBAT.greedyPolicy(C) -> action | null       the default bot. An action is { type:'play', uid, target } | { type:'swap' } |
//        { type:'pick', uids } | { type:'end' }. Write your own policy with the same shape; COMBAT.applyAction(C, action) -> events runs one.
//   COMBAT.applyAction(C, action) -> events
//
// STATE (all plain data; internal engine fields are non-enumerable and start with an underscore)
//   C.turn C.phase ('setup' before start, then 'player' | 'enemy' | 'over') C.energy C.maxEnergy C.result (null | 'win' | 'lose') C.tier C.chapter C.seed
//   C.heroes[2]   { kind:'hero', id, name, hp, maxHp, block, st, fresh, rowSt:{thorns,regen}, down, row }   C.front() C.back() C.unit(id)
//   C.enemies[]   { kind:'enemy', id:'kappa#1', def, name, hp, maxHp, block, st, fresh, down, fled, tier, size, lane, phase, turn, intent, loot, ai }
//   C.hand C.draw C.discard C.exhaust C.powers C.inPlay: deck instances { uid, id, up, gems } (temp cards add tmp:true). C.draw[0] is the TOP
//        of the draw pile (the next card drawn). C.added counts temp cards created, so hand+draw+discard+exhaust+powers+(inPlay?1:0) = deck.length + C.added.
//   C.pending null | { kind:'pick', opId, from, n, then, filter, top, optional, uids }   C.stats (DESIGN 4.10)   C.rng   C.events (every event ever emitted)
//
// ACTIONS (each returns the array of events it produced, also appended to C.events; an illegal call returns [] and changes nothing)
//   C.start()                     see create. Only legal once.
//   C.canPlay(uid, targetId?)     -> { ok, reason } reasons in check order: 'phase' 'pending' 'notInHand' 'down' 'stunned' 'unplayable' 'energy' 'target'
//   C.needsTarget(uid) -> bool    C.legalTargets(uid) -> [unit id]      (pure)
//   C.play(uid, targetId?)        DESIGN 4.3. A pick op pauses the card: the events end with pick_needed and C.pending is set.
//   C.resolvePick(uids)           answers C.pending (unique candidate uids; exactly min(n, candidates), or at most n when optional) and finishes the card.
//        A refused answer returns [] and leaves C.pending untouched. An accepted answer can also return [] (an optional pick answered with no
//        cards changes nothing visible), so test acceptance with `C.pending !== before`, not with the length of the result.
//   C.canSwap() -> { ok, cost, reason }  reasons in check order: 'phase' 'pending' 'bind' 'solo' 'energy'      C.swap()
//   C.endTurn()                   DESIGN 4.2 steps 3 to 6: turn end effects, the enemy phase, round end, new intents, the next player phase (or the end)
//   C.preview(uid, targetId?) -> { dmg (per hit of the first dmg op, or null), hits, block, heal }   adjusted for Might, rows, Weak, Frail, Bulwark and the
//        chosen target's Vulnerable and Mark. Pure: never consumes C.rng.
//   C.intent(enemyUnit | id) -> { move, name, kind, dmg, hits, tgt:[hero ids]|'random', tgtKind, taunted, block?, blockTo?, heal?, healTo?, statuses:[{s,n,to}],
//        adds, summons, removes:[{s,to}], steals?, swap?, flee?, text, stunned? }   computed live from current state (Weak, Might, Vulnerable, Taunt, enemyDmg). Pure.
//        `to`, `blockTo` and `healTo` say who gets the effect as the op does: 'self' (the default for help), 'allEnemies', 'otherEnemy', 'lowestEnemy' for
//        the enemy side, 'front' 'back' 'both' 'random' 'lowest' for heroes. block and heal count every op, whoever it is aimed at (read blockTo and healTo).
//   C.summary() -> { result, heroes:[{id,hp,maxHp,down}], maxHpGain:{heroId:n}, stats, kills, ink, gold }
//        Downed heroes are reported as down with hp 0: RUN revives them at mods.reviveFrac (COMBAT never does, except through a revive op).
//        heroes[].maxHp already includes maxHpGain. gold is the NET change of run gold: gold ops, minus gold stolen, plus stolen gold returned by
//        killing the thief (a fled thief keeps it). `ink` (Vox) is the sum of the `ink` ops. Hero Block and statuses are cleared when the combat ends.
//
// CHOICES THE DESIGN LEFT OPEN (each is covered by a test)
//   * A win found in the middle of a card (the last enemy died) ends when the card has finished, so `cond lastKill` bonuses still pay out; a loss ends at once.
//   * onPlay hooks a card registers do not fire for that same play. Hooks fire in the order hero passives, relics, card hooks.
//   * An owned hook on onHeroDown fires for its own downed owner (a Phoenix), the only exception to "never while the owner is downed".
//   * A downed hero loses Block and statuses (no events: hero_down implies it). The survivor is swapped to the front BEFORE onHeroDown hooks run, so a
//     revive op always stands the hero up in the back row.
//   * `hit.amount` is the HP actually removed (overkill is not counted); `hit.raw` is the damage before Block. Multi-hit AoE ops are hit-major (hit 1 on
//     every victim, then hit 2) with `index` 0-based per victim; a `random` op re-rolls its victim every hit; an `enemy` op whose chosen target died
//     re-targets as random for the remaining hits.
//   * The enemy `swap` op emits swap with forced:true and never fires onSwap hooks. Bind blocks it.
//   * Elite Stun immunity starts when a Stun is applied to an elite and lasts through the next 2 rounds.
//   * A stunned enemy that skips its action loses that move (the intent is not kept for the next round).
//   * Draw pile position for `add to:'draw'` is random unless the enemy op says top:true.
//   * opId of a pick is the path of the op: "1" for the second top-level op, "2.0" for the first op of the then branch of op 2; else branches continue
//     numbering after the then branch, repeat bodies share the loop index.
//   * pick then:'upgrade' only offers cards that can still be upgraded.
//   * Unit ids of enemies are 'defId#n' with a per-def counter that never reuses numbers. Temp card uids continue after the highest deck uid (local
//     counter: the global U.uid is never touched), so an event log is identical for identical inputs.
//
// EVENTS (DESIGN 5.2): combat_start turn_start turn_end draw shuffle discard exhaust add_card card_move card_upgrade retain energy play hit dodge thorns block
//   block_lost heal hurt status immune swap intent enemy_act skip summon enemy_phase death flee hero_down hero_revive pick_needed relic gold ink max_hp end.
//   Cards inside events are copies. `piles` counts are AFTER the event. `end` is always the last event of a combat. Extra fields beyond the design:
//   none on events; extra fields on C.intent objects are listed above.
const COMBAT = (() => {
  'use strict';

  const EPS = 1e-9;
  const fl = (x) => Math.floor(x + EPS);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
  const hide = (o, props) => { Object.keys(props).forEach((k) => Object.defineProperty(o, k, { value: props[k], writable: true, enumerable: false, configurable: true })); return o; };
  const ref = (u) => ({ kind: u.kind, id: u.id });
  const cardCopy = (c) => { const o = { uid: c.uid, id: c.id, up: c.up ? 1 : 0, gems: c.gems.slice() }; if (c.tmp) o.tmp = true; return o; };
  const lineOrder = (list) => list.slice().sort((a, b) => a.lane - b.lane);
  const inRange = (v, c) => (c.gte === undefined || v >= c.gte) && (c.lte === undefined || v <= c.lte);
  const EL_BY_MOTIF = { fire: 'fire', flame_orb: 'fire', ice: 'ice', lightning: 'lightning', thunder_fist: 'lightning', chain_lightning: 'lightning', ink_splash: 'ink', ink_wave: 'ink', brush_stroke: 'ink', calligraphy: 'ink', quill: 'ink' };
  const MAX_LIVING = 5;
  const MAX_DEPTH = 12;

  function create(opts) {
    opts = opts || {};
    const D = DATA;
    const ST = D.statuses;
    const ECO = D.ECONOMY;
    const MAXHAND = ECO.maxHand;
    const mods = Object.assign(D.foldMods([]), opts.mods || {});
    const relicIds = asList(opts.relics).filter((id) => D.relics[id]);
    const seed = opts.seed === undefined ? 1 : opts.seed;
    const rng = U.rng(seed);

    const C = {
      seed, rng, tier: opts.tier || 'normal', chapter: opts.chapter || 1, mods, relics: relicIds,
      turn: 0, phase: 'setup', energy: 0, maxEnergy: mods.energy, result: null,
      heroes: [], enemies: [], hand: [], draw: [], discard: [], exhaust: [], powers: [], inPlay: null, pending: null,
      stats: {
        turns: 0, cardsPlayed: 0, attacksPlayed: 0, damageDealt: 0, damageTaken: 0, blockGained: 0, maxHit: 0, maxTurnDamage: 0, swaps: 0, heroDowns: 0, revives: 0,
        poisonKills: 0, burnKills: 0, thornKills: 0, multiHitTurns: 0, zeroCostTurns: 0, kills: [],
      },
      events: [], added: 0,
    };

    // ---------------------------------------------------------------- engine state (closure)
    let batch = null;             // events of the running action
    let groupN = 0;
    let dead = null;              // 'win' | 'lose' once decided; the end event is emitted when the action finishes
    let gen = null;               // the paused card resolution (pick)
    let depth = 0;                // hook recursion guard
    let serial = 0;               // card play counter
    let T = null;                 // per player turn counters
    let nextUid = 1;
    const enemySerial = {};
    const hooks = [];
    const resCache = new Map();
    let goldTotal = 0, inkTotal = 0;
    let goldPool = isNum(opts.gold) ? Math.max(0, opts.gold) : 0;       // run gold not yet stolen
    const maxHpGain = {};

    const nextGroup = () => ++groupN;
    const emit = (type, data) => { const e = Object.assign({ type }, data || {}); C.events.push(e); if (batch) batch.push(e); return e; };
    const piles = () => ({ hand: C.hand.length, draw: C.draw.length, discard: C.discard.length, exhaust: C.exhaust.length });
    const newTurnState = () => ({ cards: 0, attacks: 0, skills: 0, zero: 0, multi: false, freeUsed: 0, dmg: 0 });
    T = newTurnState();

    function act(fn) {
      const saved = batch;
      batch = [];
      let out;
      try { fn(); finalizeEnd(); } finally { out = batch; batch = saved; }
      return out;
    }

    // ---------------------------------------------------------------- lookups
    const heroById = (id) => C.heroes.find((h) => h.id === id) || null;
    const enemyById = (id) => C.enemies.find((e) => e.id === id) || null;
    const livingHeroes = () => C.heroes.filter((h) => !h.down);
    const livingEnemies = () => lineOrder(C.enemies.filter((e) => !e.down));
    const front = () => C.heroes.find((h) => h.row === 'front') || null;
    const back = () => C.heroes.find((h) => h.row === 'back') || null;
    const otherHero = (h) => C.heroes.find((x) => x.id !== h.id) || null;
    const rowB = (h) => D.rowFor(h.id, h.row, relicIds);
    C.front = front; C.back = back;
    C.unit = (id) => heroById(id) || enemyById(id);

    // ---------------------------------------------------------------- card resolution
    function ownerOf(card) {
      const def = D.cards[card.id];
      if (def && D.heroes[def.hero]) return heroById(def.hero);
      return front();
    }
    function R(card, unit) {
      const u = unit === undefined ? ownerOf(card) : unit;
      const key = card.id + '|' + (card.up ? 1 : 0) + '|' + card.gems.join(',') + '|' + (u ? u.row : '');
      let r = resCache.get(key);
      if (!r) { r = D.resolveCard(card, { unit: u }); resCache.set(key, r); }
      return r;
    }
    const tmode = new Map();
    function needsTargetRes(res) {
      const key = res.id + '|' + (res.up ? 1 : 0) + '|' + res.gems.join(',') + '|' + res.gemActive.join(',');
      let m = tmode.get(key);
      if (m === undefined) { m = D.targetMode(res) === 'enemy'; tmode.set(key, m); }
      return m;
    }

    // ---------------------------------------------------------------- units
    function makeHero(h, i, frontIdx) {
      const def = D.heroes[h.id];
      if (!def) throw new Error('COMBAT.create: unknown hero "' + h.id + '"');
      const maxHp = Math.max(1, Math.floor(h.maxHp === undefined ? def.maxHp : h.maxHp));
      const hp = Math.max(0, Math.min(maxHp, Math.floor(h.hp === undefined ? maxHp : h.hp)));
      const u = { kind: 'hero', id: h.id, name: def.name, hp, maxHp, block: 0, st: {}, fresh: {}, rowSt: { thorns: 0, regen: 0 }, down: hp <= 0, row: i === frontIdx ? 'front' : 'back' };
      return hide(u, { _dmgTaken: 0, _hitsTaken: 0, _downDone: hp <= 0 });
    }
    function rollHp(d) {
      const base = rng.int(d.hp[0], d.hp[1]);
      const f = d.tier === 'boss' ? mods.bossHp : d.tier === 'elite' ? mods.eliteHp : mods.enemyHp;
      return Math.max(1, Math.round(base * f));
    }
    function makeEnemy(defId, lane) {
      const d = D.enemies[defId];
      if (!d) throw new Error('COMBAT.create: unknown enemy "' + defId + '"');
      enemySerial[defId] = (enemySerial[defId] || 0) + 1;
      const hp = rollHp(d);
      const u = {
        kind: 'enemy', id: defId + '#' + enemySerial[defId], def: defId, name: d.name, hp, maxHp: hp, block: 0, st: {}, fresh: {}, down: false, fled: false,
        tier: d.tier, size: d.size, lane, phase: 0, turn: 0, intent: null, loot: 0, ai: { openIdx: 0, seqIdx: 0, fired: {}, recent: [] },
      };
      return hide(u, { _d: d, _aiDef: d.ai, _move: null, _acted: false, _freshSummon: false, _fleeing: false, _killed: false, _stunUntil: undefined, _hookRound: {}, _hookOnce: {} });
    }
    function unitSnapshot(u) {
      return JSON.parse(JSON.stringify({ kind: u.kind, id: u.id, def: u.def, name: u.name, hp: u.hp, maxHp: u.maxHp, block: u.block, st: u.st, fresh: u.fresh, down: u.down, fled: u.fled, tier: u.tier, size: u.size, lane: u.lane, phase: u.phase, turn: u.turn, intent: u.intent, loot: u.loot }));
    }

    // ---------------------------------------------------------------- statuses
    function stunImmune(u) {
      if (u.tier === 'boss') return true;
      if (u.tier === 'elite' && u._stunUntil !== undefined && C.turn <= u._stunUntil) return true;
      return false;
    }
    // apply n stacks (negative removes). Enemies honour def.immune, boss Stun immunity and the elite Stun window. Returns the actual delta.
    function addStatus(u, s, n, group) {
      if (!n || !ST[s] || u.down) return 0;
      if (n > 0 && u.kind === 'enemy') {
        if (s === 'bind') return 0;
        if ((u._d.immune && u._d.immune.indexOf(s) >= 0) || (s === 'stun' && stunImmune(u))) { emit('immune', { dst: ref(u), s }); return 0; }
      }
      const old = u.st[s] || 0;
      let nv = old + n;
      if (s !== 'might') nv = Math.max(0, nv);
      if (nv === 0) delete u.st[s]; else u.st[s] = nv;
      const delta = nv - old;
      if (delta === 0) return 0;
      if (nv === 0 && u.fresh[s]) delete u.fresh[s];
      if (delta > 0 && u.kind === 'hero' && C.phase === 'enemy' && ST[s].stack === 'dur') u.fresh[s] = true;
      if (delta > 0 && s === 'stun' && u.kind === 'enemy' && u.tier === 'elite') u._stunUntil = C.turn + 2;
      emit('status', { dst: ref(u), s, delta, value: nv, group });
      return delta;
    }
    // change a status without immunity or fresh rules (ticks, decay, spending)
    function tickStatus(u, s, delta, group) {
      if (!delta) return 0;
      const old = u.st[s] || 0;
      let nv = old + delta;
      if (s !== 'might') nv = Math.max(0, nv);
      if (nv === 0) { delete u.st[s]; delete u.fresh[s]; } else u.st[s] = nv;
      const d = nv - old;
      if (d) emit('status', { dst: ref(u), s, delta: d, value: nv, group });
      return d;
    }

    // ---------------------------------------------------------------- block, healing, HP loss
    function blockAmount(u, n, rowAdd) {
      return Math.max(0, fl((n + (u.st.bulwark || 0) + (rowAdd || 0)) * ((u.st.frail || 0) > 0 ? 0.75 : 1)));
    }
    function gainBlock(u, amount, group) {
      amount = Math.floor(amount);
      if (amount <= 0 || u.down) return 0;
      u.block += amount;
      if (u.kind === 'hero') C.stats.blockGained += amount;
      emit('block', { dst: ref(u), amount, block: u.block, group });
      return amount;
    }
    function clearBlock(u) {
      if (u.block > 0) { const a = u.block; u.block = 0; emit('block_lost', { dst: ref(u), amount: a, cause: 'turn' }); }
    }
    function healUnit(u, n, group) {
      if (u.down || !(n > 0)) return 0;
      const a = Math.min(Math.floor(n), u.maxHp - u.hp);
      if (a > 0) { u.hp += a; emit('heal', { dst: ref(u), amount: a, hp: u.hp, group }); }
      return a;
    }
    function countLoss(u, loss) {
      if (u.kind === 'hero') { u._dmgTaken += loss; }
      else { C.stats.damageDealt += loss; if (C.phase === 'player') { T.dmg += loss; if (T.dmg > C.stats.maxTurnDamage) C.stats.maxTurnDamage = T.dmg; } }
    }
    // direct HP loss (poison, burn, hurt): ignores Block. Handles nothing after the loss; the caller settles deaths.
    function loseHp(u, amount, cause, group, min1) {
      amount = Math.floor(amount);
      if (u.down || amount <= 0) return 0;
      let loss = Math.min(amount, u.hp);
      if (min1) loss = Math.min(loss, Math.max(0, u.hp - 1));
      if (loss <= 0) return 0;
      u.hp -= loss;
      countLoss(u, loss);
      emit('hurt', { dst: ref(u), amount: loss, hp: u.hp, cause, group });
      return loss;
    }
    // ---------------------------------------------------------------- rows and swaps
    function applyRowStatuses(h) {
      if (h.down) return;
      const b = rowB(h);
      const g = nextGroup();
      ['thorns', 'regen'].forEach((s) => {
        const oldG = h.rowSt[s] || 0, newG = b[s] || 0;
        h.rowSt[s] = newG;
        const cur = h.st[s] || 0;
        const target = Math.max(0, cur - oldG) + newG;
        if (target !== cur) tickStatus(h, s, target - cur, g);
      });
    }
    function swapRows(forced, cost) {
      const a = front(), b = back();
      a.row = 'back'; b.row = 'front';
      emit('swap', { front: b.id, back: a.id, cost, forced });
      C.heroes.forEach((h) => applyRowStatuses(h));
    }
    // exactly one hero standing: it must hold the front row
    function normalizeRows() {
      const alive = livingHeroes();
      if (alive.length === 1 && C.heroes.length === 2 && alive[0].row === 'back') swapRows(true, 0);
    }
    const bound = () => C.heroes.some((h) => !h.down && (h.st.bind || 0) > 0);

    function downHero(h) {
      if (h._downDone) return;
      h._downDone = true;
      h.hp = 0; h.down = true; h.block = 0; h.st = {}; h.fresh = {}; h.rowSt = { thorns: 0, regen: 0 };
      C.stats.heroDowns++;
      emit('hero_down', { hero: h.id });
      const o = otherHero(h);
      if (o && !o.down && o.row === 'back') swapRows(true, 0);
      fireHook('onHeroDown', { hero: h });
      normalizeRows();
      checkEnd();
    }
    function reviveHero(h, hp, group) {
      if (!h || !h.down) return false;
      h.down = false; h._downDone = false;
      h.hp = Math.max(1, Math.min(h.maxHp, hp));
      const o = otherHero(h);
      if (h.row === 'front' && o) { o.row = 'front'; h.row = 'back'; }
      C.stats.revives++;
      emit('hero_revive', { hero: h.id, hp: h.hp });
      applyRowStatuses(h);
      normalizeRows();
      return true;
    }

    // ---------------------------------------------------------------- end of combat
    function checkEnd() {
      if (dead) return;
      if (!C.heroes.some((h) => !h.down)) dead = 'lose';
      else if (!C.enemies.some((e) => !e.down)) dead = 'win';
    }
    function settleInPlay() {
      const card = C.inPlay;
      if (!card) return;
      C.inPlay = null;
      const res = R(card, ownerOf(card));
      if (res.type === 'power') C.powers.push(card);
      else if (res.kw.indexOf('exhaust') >= 0) C.exhaust.push(card);
      else C.discard.push(card);
    }
    function finalizeEnd() {
      if (!dead || C.phase === 'over') return;
      const res = dead;
      if (res === 'win') fireHook('combatEnd', {});
      gen = null; C.pending = null;
      settleInPlay();
      C.result = res; C.phase = 'over';
      emit('end', { result: res });
      C.heroes.forEach((h) => { h.block = 0; h.st = {}; h.fresh = {}; h.rowSt = { thorns: 0, regen: 0 }; });
    }

    // ---------------------------------------------------------------- hits, thorns, kills
    function calcRaw(att, tgt, n) {
      let raw = n, mark = false, vuln = false;
      if (att) {
        if (att.kind === 'hero') raw += rowB(att).dmgAdd || 0;
        raw += att.st.might || 0;
        if (att.kind === 'enemy') raw = fl(raw * mods.enemyDmg);
        if ((tgt.st.mark || 0) > 0) { raw += 3; mark = true; }
        if ((att.st.weak || 0) > 0) raw = fl(raw * 0.75);
      }
      if ((tgt.st.vulnerable || 0) > 0) { raw = fl(raw * 1.5); vuln = true; }
      return { raw: Math.max(0, raw), crit: mark || vuln, mark };
    }

    // one hit of a dmg op. att is the acting unit or null (hook damage). m = { index, hits, group, el, by, credit, cardOrHook }
    function strike(att, tgt, n, o, m) {
      const cr = calcRaw(att, tgt, n);
      if (att && cr.mark) tickStatus(tgt, 'mark', -1, m.group);
      if ((tgt.st.dodge || 0) > 0) {
        tickStatus(tgt, 'dodge', -1, m.group);
        emit('dodge', { dst: ref(tgt), group: m.group });
        return { dodged: true, killed: false, hpLoss: 0 };
      }
      const absorbed = o.pierce ? 0 : Math.min(tgt.block, cr.raw);
      tgt.block -= absorbed;
      const hpLoss = Math.min(cr.raw - absorbed, tgt.hp);
      tgt.hp -= hpLoss;
      const killed = tgt.hp <= 0;
      emit('hit', { src: att ? ref(att) : null, dst: ref(tgt), amount: hpLoss, blocked: absorbed, raw: cr.raw, crit: cr.crit, hits: m.hits, index: m.index, pierce: !!o.pierce, element: m.el, hp: tgt.hp, block: tgt.block, killed, group: m.group });
      if (absorbed > 0 && tgt.block === 0) emit('block_lost', { dst: ref(tgt), amount: absorbed, cause: 'hit' });
      if (tgt.kind === 'hero') {
        if (hpLoss > 0) tgt._hitsTaken++;
        C.stats.damageTaken += hpLoss;
        countLoss(tgt, hpLoss);
        if (killed) tgt.down = true;
        if (att && att.kind === 'enemy') fireHook('onDamaged', { hero: tgt, attacker: att });
      } else {
        C.stats.damageDealt += hpLoss;
        if (C.phase === 'player') { T.dmg += hpLoss; if (T.dmg > C.stats.maxTurnDamage) C.stats.maxTurnDamage = T.dmg; }
        if (cr.raw > C.stats.maxHit) C.stats.maxHit = cr.raw;
        if (killed) tgt.down = true;
        else {
          checkPhases(tgt);
          if (m.cardOrHook && hpLoss > 0) runEnemyHooks(tgt, 'onHurt', {});
        }
      }
      if (att && (tgt.st.thorns || 0) > 0) thornsHit(tgt, att, m.group);
      if (o.lifesteal && att && hpLoss > 0 && !att.down) healUnit(att, hpLoss, m.group);
      if (killed) { tgt.kind === 'hero' ? downHero(tgt) : killEnemy(tgt, m.by || 'card', m.credit || front()); }
      return { dodged: false, killed, hpLoss };
    }

    function thornsHit(owner, victim, group) {
      if (victim.down) return;
      const amount = owner.st.thorns;
      const loss = Math.min(amount, victim.hp);
      if (loss <= 0) return;
      victim.hp -= loss;
      countLoss(victim, loss);
      if (victim.kind === 'hero') C.stats.damageTaken += loss;
      emit('thorns', { src: ref(owner), dst: ref(victim), amount: loss, hp: victim.hp });
      if (victim.hp <= 0) {
        victim.down = true;
        if (victim.kind === 'hero') downHero(victim);
        else killEnemy(victim, 'thorns', owner.kind === 'hero' ? owner : front());
      } else if (victim.kind === 'enemy') checkPhases(victim);
    }

    function killEnemy(u, by, credit) {
      if (u._killed) return;
      u._killed = true;
      u.down = true; u.hp = 0;
      C.stats.kills.push({ def: u.def, tier: u.tier, by });
      if (by === 'poison') C.stats.poisonKills++; else if (by === 'burn') C.stats.burnKills++; else if (by === 'thorns') C.stats.thornKills++;
      emit('death', { unit: ref(u), tier: u.tier });
      if (u.loot > 0) { const g = u.loot; u.loot = 0; goldEvent(g); }
      runEnemyHooks(u, 'onDeath', {});
      C.enemies.forEach((o) => { if (o !== u && !o.down) runEnemyHooks(o, 'onAllyDeath', {}); });
      fireHook('onKill', { hero: credit || front(), enemy: u, tier: u.tier });
      checkEnd();
    }

    function goldEvent(n) { goldTotal += n; emit('gold', { n }); }

    // ---------------------------------------------------------------- enemy phases
    function checkPhases(u) {
      if (u.down || !u._d.phases) return;
      const ph = u._d.phases;
      while (u.phase < ph.length && u.hp / u.maxHp < ph[u.phase].at) {
        const p = ph[u.phase];
        u.phase += 1;
        emit('enemy_phase', { enemy: u.id, index: u.phase, at: p.at, say: p.say });
        if (p.fx) drain(run(p.fx, { kind: 'enemy', enemy: u }));
        if (p.ai) {
          u.ai = { openIdx: 0, seqIdx: 0, fired: {}, recent: [] };
          u._aiDef = p.ai;
          if (!(C.phase === 'enemy' && u._acted)) rollIntent(u);
        }
        if (u.down) return;
      }
    }

    // ---------------------------------------------------------------- enemy AI
    function aiHolds(u, c) {
      const frac = u.hp / u.maxHp;
      if (c.hpLt !== undefined && !(frac < c.hpLt)) return false;
      if (c.hpGt !== undefined && !(frac > c.hpGt)) return false;
      if (c.turnGte !== undefined && !(u.turn >= c.turnGte)) return false;
      if (c.turnEvery !== undefined && (u.turn - 1) % c.turnEvery[0] !== c.turnEvery[1]) return false;
      if (c.alone && C.enemies.some((e) => e !== u && !e.down)) return false;
      if (c.minions !== undefined && !(C.enemies.filter((e) => !e.down && e.tier === 'minion').length < c.minions.lt)) return false;
      if (c.heroStatus !== undefined && !livingHeroes().some((h) => (h.st[c.heroStatus.s] || 0) >= (c.heroStatus.gte === undefined ? 1 : c.heroStatus.gte))) return false;
      if (c.heroDown && !C.heroes.some((h) => h.down)) return false;
      if (c.allyHpLt !== undefined && !C.enemies.some((e) => e !== u && !e.down && e.hp / e.maxHp < c.allyHpLt)) return false;
      if (c.heroHpLt !== undefined && !livingHeroes().some((h) => h.hp / h.maxHp < c.heroHpLt)) return false;
      return true;
    }
    function chooseMove(u) {
      const ai = u._aiDef, st = u.ai;
      let move = null;
      if (ai.open && st.openIdx < ai.open.length) move = ai.open[st.openIdx++];
      if (!move && ai.rules) {
        for (let i = 0; i < ai.rules.length; i++) {
          const r = ai.rules[i];
          if (r.once && st.fired[i]) continue;
          if (aiHolds(u, r.if)) { move = r.do; if (r.once) st.fired[i] = true; break; }
        }
      }
      if (!move) {
        if (ai.seq && ai.seq.length) { move = ai.seq[st.seqIdx % ai.seq.length]; st.seqIdx = (st.seqIdx + 1) % ai.seq.length; }
        else if (ai.weighted && ai.weighted.length) {
          let entries = ai.weighted;
          if (ai.noRepeat) {
            const n = ai.noRepeat, rec = st.recent;
            const banned = rec.length >= n && rec.slice(-n).every((m) => m === rec[rec.length - 1]) ? rec[rec.length - 1] : null;
            const ok = entries.filter((e) => e[0] !== banned);
            if (ok.length) entries = ok;
          }
          move = rng.weighted(entries);
        }
      }
      if (!move || !u._d.moves[move]) move = Object.keys(u._d.moves)[0];
      st.recent.push(move);
      if (st.recent.length > 8) st.recent.shift();
      return move;
    }
    function rollIntent(u) {
      if (u.down) return;
      u._move = chooseMove(u);
      u.intent = computeIntent(u);
      emit('intent', { enemy: u.id, intent: u.intent });
    }

    // hero targets of an enemy attack. rng: false for previews (a random target is reported as null)
    function attackTargets(t, useRng) {
      const alive = livingHeroes();
      if (!alive.length) return { list: [], random: false, taunted: false };
      if (t === 'both') return { list: alive, random: false, taunted: false };
      let base = null;
      if (alive.length === 1) base = alive[0];
      else if (t === 'front') base = front();
      else if (t === 'back') base = back();
      else if (t === 'lowest') base = alive.slice().sort((a, b) => (a.hp - b.hp) || (a.row === 'front' ? -1 : 1))[0];
      let taunted = false;
      if (t !== 'front' && alive.length > 1) {
        const tau = alive.filter((h) => (h.st.taunt || 0) > 0);
        if (tau.length) {
          taunted = true;
          if (base && tau.indexOf(base) >= 0) taunted = false;
          else base = tau.slice().sort((a, b) => (a.row === 'front' ? -1 : 1))[0];
        }
      }
      if (!base && t === 'random') {
        if (!useRng) return { list: alive, random: true, taunted: false };
        base = alive[rng.int(0, alive.length - 1)];
      }
      return { list: base ? [base] : [], random: false, taunted };
    }

    function enemyUnits(t, env) {
      const u = env.enemy;
      const live = livingEnemies();
      if (t === 'self') return u.down ? [] : [u];
      if (t === 'allEnemies') return live;
      if (t === 'otherEnemy') { const o = live.filter((e) => e !== u); return o.length ? [o[rng.int(0, o.length - 1)]] : []; }
      if (t === 'lowestEnemy') return live.length ? [live.slice().sort((a, b) => (a.hp - b.hp) || (a.lane - b.lane))[0]] : [];
      return [];
    }

    // ---------------------------------------------------------------- intents (pure)
    function computeIntent(u) {
      const move = u._d.moves[u._move];
      const blank = { move: u._move, name: move ? move.name : '', kind: 'none', dmg: null, hits: 0, tgt: [], tgtKind: null, taunted: false, statuses: [], adds: [], summons: [], removes: [], text: '' };
      if (!move) return blank;
      if ((u.st.stun || 0) > 0) return Object.assign(blank, { name: 'Stunned', text: 'Stunned', stunned: true });
      const info = { move: u._move, name: move.name, kind: move.kind, dmg: null, hits: 0, tgt: [], tgtKind: null, taunted: false, statuses: [], adds: [], summons: [], removes: [] };
      const env = { kind: 'enemy', enemy: u };
      let best = -1;
      // who an effect lands on, as the op says it ('allEnemies' 'otherEnemy' 'lowestEnemy' stay what they are, so help for another enemy is not mistaken for help for itself)
      const toName = (t, dflt) => (t === undefined ? dflt : t);
      dryWalk(move.fx || [], env, (op) => {
        switch (op.op) {
          case 'dmg': {
            const tg = op.tgt || 'front';
            const at = attackTargets(tg, false);
            const first = at.list[0] || front();
            const n = Math.max(0, evalV(op.n, env, first));
            const hits = Math.max(0, evalV(op.hits === undefined ? 1 : op.hits, env, first));
            const per = first ? calcRaw(u, first, n).raw : n;
            if (per * hits > best) {
              best = per * hits;
              info.dmg = per; info.hits = hits; info.tgtKind = tg; info.taunted = at.taunted;
              info.tgt = at.random ? 'random' : at.list.map((h) => h.id);
            }
            break;
          }
          case 'block': {
            const t = op.tgt || 'self';
            const n = Math.max(0, evalV(op.n, env, front()));
            // the recipient of a Block for "another enemy" is rolled when the move runs, so the intent shows the plain amount; the lowest enemy is known now
            const low = t === 'lowestEnemy' ? livingEnemies().slice().sort((a, b) => (a.hp - b.hp) || (a.lane - b.lane))[0] : null;
            info.block = (info.block || 0) + (t === 'otherEnemy' ? Math.floor(n) : blockAmount(low || u, n, 0));
            if (!info.blockTo) info.blockTo = t;
            break;
          }
          case 'heal':
            info.heal = (info.heal || 0) + Math.max(0, evalV(op.n, env, front()));
            if (!info.healTo) info.healTo = op.tgt || 'self';
            break;
          case 'status': {
            const dflt = D.isDebuff(op.s) ? 'front' : 'self';
            info.statuses.push({ s: op.s, n: evalV(op.n, env, front()), to: toName(op.tgt, dflt) });
            break;
          }
          case 'removeStatus': info.removes.push({ s: op.s, to: toName(op.tgt, (op.s === 'debuffs' || D.isDebuff(op.s)) ? 'self' : 'front') }); break;
          case 'add': info.adds.push({ card: op.card, n: Math.max(0, evalV(op.n === undefined ? 1 : op.n, env, front())), to: op.to || 'discard' }); break;
          case 'summon': info.summons.push({ enemy: op.enemy, n: op.n || 1 }); break;
          case 'stealGold': info.steals = (info.steals || 0) + Math.max(0, evalV(op.n, env, front())); break;
          case 'swap': info.swap = true; break;
          case 'flee': info.flee = true; break;
          default: break;
        }
      });
      info.text = D.intentText ? D.intentText(info) : move.name;
      return info;
    }
    // walk an op list evaluating conditions against current state, visiting each op that would run
    function dryWalk(ops, env, visit) {
      asList(ops).forEach((op) => {
        if (!op) return;
        if (op.op === 'cond') dryWalk(condHolds(op.if, env) ? op.then : op.else, env, visit);
        else if (op.op === 'repeat') { const n = Math.min(20, Math.max(0, evalV(op.n, env))); for (let i = 0; i < n; i++) dryWalk(op.do, env, visit); }
        else visit(op);
      });
    }

    // ---------------------------------------------------------------- values and conditions
    function whoUnit(w, env, victim) {
      const enemyCtx = env.kind === 'enemy';
      if (w === undefined || w === 'self') return enemyCtx ? env.enemy : env.actor;
      if (w === 'ally') return env.actor ? otherHero(env.actor) : null;
      if (enemyCtx) return victim || front();
      return victim || env.target || null;
    }
    function perCount(v, env, victim) {
      const enemyCtx = env.kind === 'enemy';
      const a = enemyCtx ? env.enemy : env.actor;
      switch (v.per) {
        case 'X': return env.X || 0;
        case 'handSize': return C.hand.length;
        case 'drawPile': return C.draw.length;
        case 'discardPile': return C.discard.length;
        case 'exhaustPile': return C.exhaust.length;
        case 'cardsPlayed': return T.cards;
        case 'attacksPlayed': return T.attacks;
        case 'skillsPlayed': return T.skills;
        case 'energy': return C.energy;
        case 'block': { const u = whoUnit(v.who, env, victim); return u ? u.block : 0; }
        case 'hp': { const u = whoUnit(v.who, env, victim); return u ? u.hp : 0; }
        case 'missingHp': { const u = whoUnit(v.who, env, victim); return u ? u.maxHp - u.hp : 0; }
        case 'status': { const u = whoUnit(v.who, env, victim); return u ? (u.st[v.s] || 0) : 0; }
        case 'debuffs': { const u = whoUnit(v.who === undefined ? 'target' : v.who, env, victim); return u ? Object.keys(u.st).filter((s) => D.isDebuff(s)).length : 0; }
        case 'enemies': return C.enemies.filter((e) => !e.down).length;
        case 'kills': return C.stats.kills.length;
        case 'turn': return enemyCtx ? env.enemy.turn : C.turn;
        case 'gems': return env.card ? env.card.gems.filter(Boolean).length : 0;
        case 'front': return a && a.row === 'front' ? 1 : 0;
        case 'damageTaken': return a && a.kind === 'hero' ? a._dmgTaken : 0;
        case 'hitsTaken': return a && a.kind === 'hero' ? a._hitsTaken : 0;
        case 'targetBlock': { const t = victim || env.target; return t ? t.block : 0; }
        case 'picked': return env.picked || 0;
        default: return 0;
      }
    }
    function evalV(v, env, victim) {
      if (isNum(v)) return v;
      if (!isObj(v)) return 0;
      let count = 0;
      if (v.per !== undefined) count = perCount(v, env, victim);
      if (v.upTo !== undefined) count = Math.min(count, v.upTo);
      let val = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * count;
      if (v.min !== undefined) val = Math.max(val, v.min);
      if (v.cap !== undefined) val = Math.min(val, v.cap);
      return fl(val);
    }
    function condHolds(c, env) {
      const enemyCtx = env.kind === 'enemy';
      const a = enemyCtx ? env.enemy : env.actor;
      for (const k of Object.keys(c)) {
        const x = c[k];
        switch (k) {
          case 'row': if (!a || a.row !== x) return false; break;
          case 'status': { const u = whoUnit(x.who, env, null); const have = u ? (u.st[x.s] || 0) : 0; const ok = x.gte === undefined && x.lte === undefined ? have >= 1 : inRange(have, x); if (!ok) return false; break; }
          case 'hpPct': { const u = whoUnit(x.who, env, null); if (!u) return false; const f = u.hp / u.maxHp; if (x.lt !== undefined && !(f < x.lt)) return false; if (x.gt !== undefined && !(f > x.gt)) return false; break; }
          case 'handEmpty': if (x && C.hand.length !== 0) return false; break;
          case 'cardsPlayed': if (!inRange(T.cards, x)) return false; break;
          case 'attacksPlayed': if (!inRange(T.attacks, x)) return false; break;
          case 'turn': if (!inRange(enemyCtx ? env.enemy.turn : C.turn, x)) return false; break;
          case 'lastKill': if (x && !env.lastKill) return false; break;
          case 'targetStatus': { const t = env.target; if (!t) return false; const have = t.st[x.s] || 0; const ok = x.gte === undefined && x.lte === undefined ? have >= 1 : inRange(have, x); if (!ok) return false; break; }
          case 'allyDown': { const o = a ? otherHero(a) : null; if (x && !(o && o.down)) return false; break; }
          case 'block': if (!a || !inRange(a.block, x)) return false; break;
          case 'energy': if (!inRange(C.energy, x)) return false; break;
          case 'handSize': if (!inRange(C.hand.length, x)) return false; break;
          case 'enemies': if (!inRange(C.enemies.filter((e) => !e.down).length, x)) return false; break;
          default: break;
        }
      }
      return true;
    }

    // ---------------------------------------------------------------- targets for card and hook ops
    function heroTargets(t, env) {
      const a = env.actor;
      const alive = livingHeroes();
      switch (t) {
        case 'self': return a && !a.down ? [a] : [];
        case 'ally': { const o = a ? otherHero(a) : null; return o && !o.down && a && !a.down ? [o] : []; }
        case 'both': return alive;
        case 'front': return alive.length === 1 ? alive : (front() && !front().down ? [front()] : []);
        case 'back': return alive.length === 1 ? alive : (back() && !back().down ? [back()] : []);
        default: return [];
      }
    }
    function randomLiving() {
      const l = livingEnemies();
      return l.length ? l[rng.int(0, l.length - 1)] : null;
    }
    function chosenOrRandom(env) {
      return env.target && !env.target.down ? env.target : randomLiving();
    }
    function enemyTargets(t, env) {
      const live = livingEnemies();
      switch (t) {
        case 'enemy': { const c = chosenOrRandom(env); return c ? [c] : []; }
        case 'all': return live;
        case 'random': { const c = randomLiving(); return c ? [c] : []; }
        case 'lowest': return live.length ? [live.slice().sort((a, b) => (a.hp - b.hp) || (a.lane - b.lane))[0]] : [];
        case 'others': { const ex = env.target || env.lastSingle || null; return live.filter((e) => e !== ex); }
        default: return [];
      }
    }
    const isEnemySide = (t) => t === 'enemy' || t === 'all' || t === 'random' || t === 'lowest' || t === 'others';

    // ---------------------------------------------------------------- piles: draw, discard, exhaust, add
    function landed(cards) {
      cards.forEach((c) => {
        const def = D.cards[c.id];
        if (!def || !def.hand || !def.hand.drawn) return;
        const f = front();
        if (!f || dead === 'lose') return;
        if (depth > MAX_DEPTH) return;
        depth++;
        try { drain(run(def.hand.drawn, { kind: 'hand', actor: f, card: R(c, f), X: 0, target: null })); } finally { depth--; }
      });
    }
    function reshuffle() {
      const cards = C.discard.splice(0, C.discard.length);
      const sh = rng.shuffle(cards);
      sh.forEach((c) => C.draw.push(c));
      emit('shuffle', { piles: piles() });
      fireHook('onShuffle', {});
    }
    function drawCards(n) {
      let chunk = [], reshuffled = false;
      const flush = () => {
        if (!chunk.length) return;
        const cards = chunk; chunk = [];
        emit('draw', { cards: cards.map(cardCopy), reshuffled, piles: piles() });
        landed(cards);
      };
      for (let i = 0; i < n; i++) {
        if (C.hand.length >= MAXHAND) break;
        if (C.draw.length === 0) {
          if (C.discard.length === 0) break;
          flush();
          reshuffle();
          reshuffled = true;
        }
        const c = C.draw.shift();
        C.hand.push(c);
        chunk.push(c);
      }
      flush();
    }
    function exhaustCard(card, reason, owner) {
      C.exhaust.push(card);
      emit('exhaust', { card: cardCopy(card), reason, piles: piles() });
      const h = owner || ownerOf(card) || front();
      fireHook('onExhaust', { hero: h, res: R(card, h), card });
    }
    function makeTemp(id, up, gems) {
      const def = D.cards[id];
      return { uid: nextUid++, id, up: up ? 1 : 0, gems: gems ? gems.slice() : (def && def.slots ? def.slots.map(() => null) : []), tmp: true };
    }
    // place new cards. to: hand | draw | discard | exhaust. top: for draw, put on top instead of a random position.
    function placeCards(cards, to, top) {
      C.added += cards.length;
      if (to === 'hand') {
        const inHand = [], over = [];
        cards.forEach((c) => { if (C.hand.length < MAXHAND) { C.hand.push(c); inHand.push(c); } else over.push(c); });
        if (inHand.length) emit('add_card', { cards: inHand.map(cardCopy), to: 'hand', piles: piles() });
        if (over.length) { over.forEach((c) => C.discard.push(c)); emit('discard', { cards: over.map(cardCopy), reason: 'overflow', piles: piles() }); }
        return;
      }
      cards.forEach((c) => {
        if (to === 'draw') C.draw.splice(top ? 0 : rng.int(0, C.draw.length), 0, c);
        else if (to === 'exhaust') C.exhaust.push(c);
        else C.discard.push(c);
      });
      emit('add_card', { cards: cards.map(cardCopy), to, piles: piles() });
    }
    function addCards(id, n, to, up, top) {
      if (!D.cards[id] || n <= 0) return;
      const def = D.cards[id];
      const dest = to || (def.hero === 'curse' || def.hero === 'status' ? 'discard' : 'hand');
      const cards = [];
      for (let i = 0; i < n; i++) cards.push(makeTemp(id, up));
      placeCards(cards, dest, top);
    }
    function gainEnergy(n) {
      const nv = Math.max(0, C.energy + n);
      const d = nv - C.energy;
      C.energy = nv;
      if (d !== 0) emit('energy', { value: C.energy, delta: d });
    }

    // ---------------------------------------------------------------- hooks
    function registerHook(def, owner, src, srcId, born) {
      hooks.push({ on: def.on, fx: def.fx, filter: def.filter, limit: def.limit, once: def.once, every: def.every, owner, src, srcId, count: 0, turnFired: 0, fired: false, active: true, born });
    }
    function fireHook(on, ev) {
      if (depth > MAX_DEPTH) return;
      const list = hooks.filter((h) => h.on === on && h.active);
      if (!list.length) return;
      depth++;
      try { list.forEach((h) => { if (h.active) maybeFire(h, on, ev); }); } finally { depth--; }
    }
    function maybeFire(h, on, ev) {
      const owner = h.owner ? heroById(h.owner) : null;
      if (h.owner && !owner) return;
      if (owner && owner.down && !(on === 'onHeroDown' && ev.hero === owner)) return;
      if (h.born !== undefined && h.born === ev.serial) return;
      const f = h.filter;
      const fh = f && f.hero;
      const evHero = ev.hero || null;
      if (owner) { if (evHero && fh !== 'any' && evHero !== owner) return; }
      else if (fh && fh !== 'any') { const hh = evHero || front(); if (!hh || hh.id !== fh) return; }
      if (f) {
        const res = ev.res || null;
        if (f.type !== undefined && (!res || asList(f.type).indexOf(res.type) < 0)) return;
        if (f.cost !== undefined) { if (!res) return; const c = ev.cost !== undefined ? ev.cost : (isNum(res.cost) ? res.cost : 0); if (!inRange(c, f.cost)) return; }
        if (f.kw !== undefined && (!res || !asList(f.kw).some((k) => res.kw.indexOf(k) >= 0))) return;
        if (f.tier !== undefined && asList(f.tier).indexOf(ev.tier) < 0) return;
        if (f.gems !== undefined) { const gn = res ? res.gems.filter(Boolean).length : 0; if (gn < (f.gems.gte || 0)) return; }
      }
      h.count++;
      if (h.every && h.count % h.every !== 0) return;
      if (h.limit !== undefined && h.turnFired >= h.limit) return;
      if (h.once && h.fired) return;
      h.turnFired++; h.fired = true;
      if (h.once) h.active = false;
      if (h.src === 'relic') emit('relic', { id: h.srcId });
      const TRIG = ['onPlay', 'onDamaged', 'onKill', 'onSwap', 'onHeroDown', 'onExhaust'];
      const actor = owner || (TRIG.indexOf(on) >= 0 && evHero ? evHero : front());
      if (!actor) return;
      let target = ev.target || null;
      if (on === 'onDamaged') target = ev.attacker && !ev.attacker.down ? ev.attacker : null;
      drain(run(h.fx, { kind: 'hook', actor, card: ev.res || null, target, X: 0, hookOn: on, hookEv: ev }));
    }

    function runEnemyHooks(u, on, ev) {
      const list = u._d.hooks;
      if (!list || !list.length || depth > MAX_DEPTH) return;
      list.forEach((h, i) => {
        if (h.on !== on) return;
        if (h.filter && h.filter.type !== undefined && asList(h.filter.type).indexOf(ev.type) < 0) return;
        if (h.once && u._hookOnce[i]) return;
        if (h.limit !== undefined && (u._hookRound[i] || 0) >= h.limit) return;
        u._hookRound[i] = (u._hookRound[i] || 0) + 1;
        if (h.once) u._hookOnce[i] = true;
        depth++;
        try { drain(run(h.fx, { kind: 'enemy', enemy: u, dying: on === 'onDeath' })); } finally { depth--; }
      });
    }

    // ---------------------------------------------------------------- the op executor
    function drain(g) {
      let r = g.next();
      let guard = 0;
      while (!r.done && guard++ < 4) r = g.next([]);
    }

    function* run(ops, env, base, offset) {
      const list = ops || [];
      for (let i = 0; i < list.length; i++) {
        if (dead === 'lose' || C.phase === 'over') return;
        const op = list[i];
        if (!op) continue;
        const path = base === undefined ? String(i + (offset || 0)) : base + '.' + (i + (offset || 0));
        if (op.op === 'cond' || op.op === 'repeat' || op.op === 'pick') yield* control(op, env, path);
        else exec(op, env);
      }
    }
    function* control(op, env, path) {
      if (op.op === 'cond') {
        if (condHolds(op.if, env)) yield* run(op.then, env, path);
        else if (op.else) yield* run(op.else, env, path, asList(op.then).length);
      } else if (op.op === 'repeat') {
        for (let i = 0; i < 100; i++) {
          const n = Math.max(0, evalV(op.n, env));
          if (i >= n || dead === 'lose') break;
          yield* run(op.do, env, path);
        }
      } else {
        yield* doPick(op, env, path);
      }
    }

    function applyConsume(op, env, group) {
      if (op.consume === undefined) return;
      const a = env.actor;
      if (!a || a.down) return;
      const c = isObj(op.consume) ? op.consume : { s: op.consume };
      const cap = c.upTo === undefined ? Infinity : Math.max(0, evalV(c.upTo, env));
      if (c.s === 'block') {
        const take = Math.min(a.block, cap);
        if (take > 0) { a.block -= take; emit('block_lost', { dst: ref(a), amount: take, cause: 'consume' }); }
      } else {
        const take = Math.min(a.st[c.s] || 0, cap);
        if (take > 0) tickStatus(a, c.s, -take, group);
      }
    }
    const nOf = (op, env, victim) => Math.max(0, evalV(op.n, env, victim)) + (op.plus || 0);

    function exec(op, env) {
      const enemyCtx = env.kind === 'enemy';
      switch (op.op) {
        case 'dmg': if (enemyCtx) enemyDmg(op, env); else cardDmg(op, env); break;
        case 'block': doBlock(op, env); break;
        case 'heal': doHeal(op, env); break;
        case 'hurt': doHurt(op, env); break;
        case 'status': doStatus(op, env); break;
        case 'removeStatus': doRemoveStatus(op, env); break;
        case 'draw': { const g = nextGroup(); const n = nOf(op, env); applyConsume(op, env, g); drawCards(n); break; }
        case 'energy': { const g = nextGroup(); const n = evalV(op.n, env); applyConsume(op, env, g); gainEnergy(n); break; }
        case 'add': {
          const n = Math.max(0, evalV(op.n === undefined ? 1 : op.n, env));
          if (enemyCtx) addCards(op.card, n, op.to || 'discard', false, !!op.top); else addCards(op.card, n, op.to, !!op.up, false);
          break;
        }
        case 'swap': {
          if (enemyCtx) { if (!bound() && livingHeroes().length === 2) swapRows(true, 0); break; }
          if (!bound() && livingHeroes().length === 2) { swapRows(false, 0); C.stats.swaps++; fireHook('onSwap', { hero: front() }); }
          break;
        }
        case 'gold': { const n = Math.floor(evalV(op.n, env)); if (n) goldEvent(n); break; }
        case 'ink': { const n = Math.floor(evalV(op.n, env)); if (n) { inkTotal += n; emit('ink', { n }); } break; }
        case 'maxHp': doMaxHp(op, env); break;
        case 'revive': doRevive(op, env); break;
        case 'hook': registerHook(op, env.actor ? env.actor.id : null, 'card', env.card ? env.card.id : null, env.serial); break;
        case 'summon': doSummon(op, env); break;
        case 'stealGold': doSteal(op, env); break;
        case 'flee': if (enemyCtx) env.enemy._fleeing = true; break;
        default: break;
      }
    }

    // ---- damage
    function elementOf(res) {
      return (res && res.art && EL_BY_MOTIF[res.art.m]) || 'slash';
    }
    function cardDmg(op, env) {
      const group = nextGroup();
      const att = env.kind === 'card' ? env.actor : null;
      const tgt = op.tgt || 'enemy';
      const cache = new Map();
      const nFor = (v) => { if (!cache.has(v)) cache.set(v, nOf(op, env, v)); return cache.get(v); };
      let victims = [];
      if (tgt === 'all' || tgt === 'others' || tgt === 'lowest') victims = enemyTargets(tgt, env);
      else if (tgt === 'enemy') victims = enemyTargets('enemy', env);
      const first = victims[0] || null;
      const hits = Math.min(100, Math.max(0, op.hits === undefined ? 1 : evalV(op.hits, env, first)) + (op.hitsPlus || 0));
      let fixedN = null;
      if (op.consume !== undefined) {
        if (tgt === 'random') fixedN = nOf(op, env, null); else victims.forEach(nFor);
        applyConsume(op, env, group);
      }
      const el = op.el || (env.kind === 'card' ? elementOf(env.card) : 'slash');
      let landedHits = 0, killedAny = false;
      let cur = victims[0] || null;
      for (let i = 0; i < hits; i++) {
        if (dead === 'lose') break;
        let vs;
        if (tgt === 'random') { const v = randomLiving(); vs = v ? [v] : []; if (v) env.lastSingle = v; }
        else if (tgt === 'enemy') { if (!cur || cur.down) cur = enemyTargets('enemy', env)[0] || null; vs = cur ? [cur] : []; }
        else vs = victims.filter((v) => !v.down);
        if (!vs.length) break;
        for (const v of vs) {
          const n = fixedN !== null ? fixedN : nFor(v);
          const r = strike(att, v, n, op, { index: i, hits, group, el, by: att ? 'card' : 'hook', credit: env.actor, cardOrHook: true });
          if (!r.dodged) landedHits++;
          if (r.killed) killedAny = true;
          if (dead === 'lose') break;
        }
      }
      if (tgt === 'lowest' && victims[0]) env.lastSingle = victims[0];
      env.lastKill = killedAny;
      if (att && landedHits >= 3 && !T.multi) { T.multi = true; C.stats.multiHitTurns++; }
    }
    function enemyDmg(op, env) {
      const u = env.enemy;
      const group = nextGroup();
      const tgt = op.tgt || 'front';
      const hits = Math.min(100, Math.max(0, evalV(op.hits === undefined ? 1 : op.hits, env, front())));
      const cache = new Map();
      const nFor = (v) => { if (!cache.has(v)) cache.set(v, Math.max(0, evalV(op.n, env, v))); return cache.get(v); };
      const el = op.el || 'slash';
      const acting = () => !u.down || env.dying;       // an onDeath hook still acts for the unit that is dying
      for (let i = 0; i < hits; i++) {
        if (!acting() || dead) break;
        const vs = attackTargets(tgt, true).list;
        for (const v of vs) {
          if (v.down) continue;
          strike(u, v, nFor(v), op, { index: i, hits, group, el, by: 'card', credit: null, cardOrHook: false });
          if (!acting() || dead === 'lose') break;
        }
      }
    }

    // ---- block, heal, hurt
    function doBlock(op, env) {
      const group = nextGroup();
      const enemyCtx = env.kind === 'enemy';
      const targets = enemyCtx ? enemyUnits(op.tgt || 'self', env) : heroTargets(op.tgt || 'self', env);
      const n = nOf(op, env, enemyCtx ? front() : null);
      applyConsume(op, env, group);
      const rowAdd = !enemyCtx && env.kind === 'card' && env.actor ? (rowB(env.actor).blockAdd || 0) : 0;
      targets.forEach((t) => gainBlock(t, blockAmount(t, n, rowAdd), group));
    }
    function doHeal(op, env) {
      const group = nextGroup();
      const enemyCtx = env.kind === 'enemy';
      const targets = enemyCtx ? enemyUnits(op.tgt || 'self', env) : heroTargets(op.tgt || 'self', env);
      const n = nOf(op, env, enemyCtx ? front() : null);
      applyConsume(op, env, group);
      targets.forEach((t) => healUnit(t, n, group));
    }
    function doHurt(op, env) {
      const group = nextGroup();
      const targets = heroTargets(op.tgt || 'self', env);
      const n = nOf(op, env, null);
      applyConsume(op, env, group);
      const cause = env.kind === 'hand' ? 'curse' : 'op';
      targets.forEach((t) => {
        if (loseHp(t, n, cause, group, !op.lethal) > 0 && t.hp <= 0) downHero(t);
      });
    }

    // ---- statuses
    function doStatus(op, env) {
      const group = nextGroup();
      const enemyCtx = env.kind === 'enemy';
      if (enemyCtx) {
        const dflt = D.isDebuff(op.s) ? 'front' : 'self';
        const t = op.tgt || dflt;
        const units = t === 'self' || t === 'allEnemies' || t === 'otherEnemy' || t === 'lowestEnemy' ? enemyUnits(t, env) : heroVictims(t);
        units.forEach((u) => addStatus(u, op.s, Math.floor(evalV(op.n, env, u.kind === 'hero' ? u : front())), group));
        return;
      }
      const t = op.tgt || (D.isDebuff(op.s) ? 'enemy' : 'self');
      const units = isEnemySide(t) ? enemyTargets(t, env) : heroTargets(t, env);
      const ns = units.map((u) => evalV(op.n, env, u.kind === 'enemy' ? u : null));
      applyConsume(op, env, group);
      units.forEach((u, i) => addStatus(u, op.s, ns[i], group));
      if (t === 'random' && units[0]) env.lastSingle = units[0];
    }
    // heroes hit by an enemy status op (no taunt: taunt only redirects attacks)
    function heroVictims(t) {
      const alive = livingHeroes();
      if (!alive.length) return [];
      if (t === 'both') return alive;
      if (alive.length === 1) return alive;
      if (t === 'front') return [front()];
      if (t === 'back') return [back()];
      if (t === 'lowest') return [alive.slice().sort((a, b) => (a.hp - b.hp) || (a.row === 'front' ? -1 : 1))[0]];
      return [alive[rng.int(0, alive.length - 1)]];
    }
    function doRemoveStatus(op, env) {
      const group = nextGroup();
      const enemyCtx = env.kind === 'enemy';
      const s = op.s;
      let units;
      if (enemyCtx) {
        const dflt = (s === 'debuffs' || D.isDebuff(s)) ? 'self' : 'front';
        const t = op.tgt || dflt;
        units = t === 'self' || t === 'allEnemies' || t === 'otherEnemy' || t === 'lowestEnemy' ? enemyUnits(t, env) : heroVictims(t);
      } else {
        const t = op.tgt || ((s === 'debuffs' || D.isDebuff(s)) ? 'self' : (s === 'buffs' || D.isBuff(s)) ? 'enemy' : 'self');
        units = isEnemySide(t) ? enemyTargets(t, env) : heroTargets(t, env);
      }
      units.forEach((u) => {
        if (s === 'debuffs' || s === 'buffs') {
          const kind = s === 'debuffs' ? 'debuff' : 'buff';
          Object.keys(u.st).forEach((k) => { if (ST[k] && ST[k].kind === kind) tickStatus(u, k, -(u.st[k] || 0), group); });
        } else {
          const have = u.st[s] || 0;
          const take = op.n === undefined ? have : Math.min(have, Math.max(0, evalV(op.n, env, null)));
          if (take > 0) tickStatus(u, s, -take, group);
        }
      });
    }

    // ---- run level ops and heroes
    function doMaxHp(op, env) {
      const n = Math.floor(evalV(op.n, env));
      if (!n) return;
      heroTargets(op.tgt || 'self', env).forEach((h) => {
        const before = h.maxHp;
        h.maxHp = Math.max(1, h.maxHp + n);
        const d = h.maxHp - before;
        if (d > 0) h.hp = Math.min(h.maxHp, h.hp + d); else h.hp = Math.min(h.hp, h.maxHp);
        if (d) { maxHpGain[h.id] = (maxHpGain[h.id] || 0) + d; emit('max_hp', { hero: h.id, n: d }); }
      });
    }
    function doRevive(op, env) {
      let h = null;
      if (env.hookOn === 'onHeroDown' && env.hookEv && env.hookEv.hero && env.hookEv.hero.down) h = env.hookEv.hero;
      else h = C.heroes.find((x) => x.down) || null;
      if (!h) return;
      const hp = op.pct !== undefined ? Math.round(op.pct * h.maxHp) : Math.floor(evalV(op.n, env));
      reviveHero(h, Math.max(1, hp), nextGroup());
    }

    // ---- enemy only
    function doSummon(op, env) {
      const n = op.n || 1;
      for (let i = 0; i < n; i++) {
        if (C.enemies.filter((e) => !e.down).length >= MAX_LIVING) return;
        const taken = new Set(C.enemies.filter((e) => !e.down).map((e) => e.lane));
        let lane = -1;
        for (let l = 4; l >= 0; l--) if (!taken.has(l)) { lane = l; break; }
        if (lane < 0 || !D.enemies[op.enemy]) return;
        const m = makeEnemy(op.enemy, lane);
        m._freshSummon = C.phase === 'enemy';
        C.enemies.push(m);
        emit('summon', { enemy: unitSnapshot(m) });
        m.turn = 1;
        if (m._d.start) drain(run(m._d.start, { kind: 'enemy', enemy: m }));
        rollIntent(m);
      }
    }
    function doSteal(op, env) {
      const u = env.enemy;
      const want = Math.max(0, Math.floor(evalV(op.n, env, front())));
      const take = Math.min(want, goldPool);
      if (take <= 0) return;
      goldPool -= take;
      u.loot += take;
      goldEvent(-take);
    }
    function leave(u) {
      u._fleeing = false;
      u.down = true; u.fled = true; u.loot = 0;
      emit('flee', { unit: ref(u) });
      checkEnd();
    }

    // ---- pick
    function pileOf(name) { return name === 'hand' ? C.hand : name === 'draw' ? C.draw : name === 'discard' ? C.discard : C.exhaust; }
    function* doPick(op, env, path) {
      if (dead) return;
      let cands = pileOf(op.from).slice();
      if (op.from === 'draw' && op.top) cands = cands.slice(0, op.top);
      const f = op.filter;
      if (f) cands = cands.filter((c) => { const d = D.cards[c.id]; return d && (f.type === undefined || d.type === f.type) && (f.hero === undefined || d.hero === f.hero); });
      if (op.then === 'upgrade') cands = cands.filter((c) => { const d = D.cards[c.id]; return d && d.up && !c.up; });
      const n = Math.max(0, evalV(op.n, env));
      if (!cands.length || n === 0) { env.picked = 0; return; }
      let chosen;
      if (op.random) {
        const k = Math.min(n, cands.length);
        chosen = rng.shuffle(cands).slice(0, k);
      } else if (env.kind !== 'card') {
        // only a played card can pause for the player: a pick reached from a hook, a hand op or an enemy op (the validator forbids it,
        // this keeps unvalidated content from leaving a stale pending) chooses at random
        chosen = rng.shuffle(cands).slice(0, Math.min(n, cands.length));
      } else if (!op.optional && cands.length <= n) {
        chosen = cands;
      } else {
        C.pending = { kind: 'pick', opId: path, from: op.from, n: Math.min(n, cands.length), then: op.then, filter: op.filter || null, top: op.top || null, optional: !!op.optional, uids: cands.map((c) => c.uid) };
        emit('pick_needed', { pending: JSON.parse(JSON.stringify(C.pending)) });
        const uids = yield;
        chosen = uids.map((uid) => cands.find((c) => c.uid === uid)).filter(Boolean);
      }
      env.picked = chosen.length;
      applyPick(op, chosen, env);
    }
    function applyPick(op, cards, env) {
      const from = op.from;
      const owner = env.actor || front();
      switch (op.then) {
        case 'discard': {
          if (from === 'hand') {
            cards.forEach((c) => { const i = C.hand.indexOf(c); if (i >= 0) C.hand.splice(i, 1); C.discard.push(c); });
            if (cards.length) emit('discard', { cards: cards.map(cardCopy), reason: 'pick', piles: piles() });
          } else {
            cards.forEach((c) => { const i = pileOf(from).indexOf(c); if (i >= 0) pileOf(from).splice(i, 1); C.discard.push(c); emit('card_move', { card: cardCopy(c), from, to: 'discard', piles: piles() }); });
          }
          break;
        }
        case 'exhaust': cards.forEach((c) => { const i = pileOf(from).indexOf(c); if (i >= 0) pileOf(from).splice(i, 1); exhaustCard(c, 'pick', owner); }); break;
        case 'retain': cards.forEach((c) => { c.keep = true; }); if (cards.length) emit('retain', { cards: cards.map(cardCopy) }); break;
        case 'upgrade': cards.forEach((c) => { c.up = 1; emit('card_upgrade', { card: cardCopy(c) }); }); break;
        case 'toHand':
          cards.forEach((c) => {
            const pile = pileOf(from);
            if (C.hand.length >= MAXHAND) {
              if (from === 'discard') return;
              const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1);
              C.discard.push(c);
              emit('discard', { cards: [cardCopy(c)], reason: 'overflow', piles: piles() });
              return;
            }
            const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1);
            C.hand.push(c);
            emit('card_move', { card: cardCopy(c), from, to: 'hand', piles: piles() });
          });
          break;
        case 'toDrawTop':
          cards.forEach((c) => { const pile = pileOf(from); const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); C.draw.unshift(c); emit('card_move', { card: cardCopy(c), from, to: 'draw', piles: piles() }); });
          break;
        case 'copy': {
          const copies = cards.map((c) => makeTemp(c.id, c.up, c.gems));
          if (copies.length) placeCards(copies, 'hand', false);
          break;
        }
        default: break;
      }
    }

    // ---------------------------------------------------------------- turn flow
    function tickHeroStart(h) {
      if (h.down) return;
      const g = nextGroup();
      if (h.st.plating) gainBlock(h, h.st.plating, g);
      const sb = (rowB(h).startBlock || 0) + mods.startBlock;
      if (sb > 0) gainBlock(h, sb, g);
      if (h.st.ritual) addStatus(h, 'might', h.st.ritual, g);
      if (h.st.regen) { healUnit(h, h.st.regen, g); tickStatus(h, 'regen', -1, g); }
      if (h.st.poison) {
        const p = h.st.poison;
        loseHp(h, p, 'poison', g, false);
        if (h.hp <= 0) { downHero(h); return; }
        tickStatus(h, 'poison', -1, g);
      }
    }
    function beginPlayerTurn() {
      C.turn += 1; C.stats.turns = C.turn; C.phase = 'player';
      T = newTurnState();
      hooks.forEach((h) => { h.turnFired = 0; });
      C.enemies.forEach((u) => { u._hookRound = {}; });
      C.energy = C.maxEnergy;
      emit('turn_start', { who: 'player', turn: C.turn, energy: C.energy, maxEnergy: C.maxEnergy });
      C.heroes.forEach((h) => { if (!h.down) clearBlock(h); });
      C.heroes.forEach((h) => applyRowStatuses(h));
      for (const h of C.heroes) { tickHeroStart(h); if (dead) return; }
      fireHook('turnStart', {});
      if (dead) return;
      const n = Math.max(0, mods.hand + livingHeroes().reduce((s, h) => s + (rowB(h).drawAdd || 0), 0));
      if (C.turn === 1) {
        const inn = [];
        for (let i = 0; i < C.draw.length && C.hand.length + inn.length < MAXHAND; i++) {
          const c = C.draw[i];
          if (R(c, ownerOf(c)).kw.indexOf('innate') >= 0) inn.push(c);
        }
        if (inn.length) {
          inn.forEach((c) => { C.draw.splice(C.draw.indexOf(c), 1); C.hand.push(c); });
          emit('draw', { cards: inn.map(cardCopy), reshuffled: false, piles: piles() });
          landed(inn);
        }
        drawCards(Math.max(0, n - C.hand.length));
      } else drawCards(n);
    }

    function rollAllIntents() {
      lineOrder(C.enemies.filter((e) => !e.down)).forEach((u) => {
        u._acted = false;
        if (u._freshSummon) { u._freshSummon = false; return; }
        u.turn += 1;
        rollIntent(u);
      });
    }
    function enemyTick(u) {
      const g = nextGroup();
      if (u.st.plating) gainBlock(u, u.st.plating, g);
      if (u.st.ritual) tickStatus(u, 'might', u.st.ritual, g);
      if (u.st.regen) { healUnit(u, u.st.regen, g); tickStatus(u, 'regen', -1, g); }
      if (u.st.poison) {
        const p = u.st.poison;
        loseHp(u, p, 'poison', g, false);
        if (u.hp <= 0) { killEnemy(u, 'poison', front()); return; }
        checkPhases(u);
        if (!u.down) tickStatus(u, 'poison', -1, g);
      }
    }
    function enemyAct(u) {
      u._acted = true;
      if ((u.st.stun || 0) > 0) {
        emit('skip', { unit: ref(u), reason: 'stun' });
        tickStatus(u, 'stun', -1, nextGroup());
        return;
      }
      const move = u._d.moves[u._move];
      if (!move) return;
      const e = { enemy: u.id, move: u._move, name: move.name, kind: move.kind };
      if (move.say) e.say = move.say;
      emit('enemy_act', e);
      drain(run(move.fx || [], { kind: 'enemy', enemy: u }));
      if (u._fleeing && !u.down) leave(u);
    }
    function endOfRound() {
      const g = nextGroup();
      const units = () => C.heroes.filter((h) => !h.down).concat(livingEnemies());
      units().forEach((u) => {
        if (dead === 'lose' || u.down) return;
        const b = u.st.burn || 0;
        if (b <= 0) return;
        loseHp(u, b, 'burn', g, false);
        if (u.hp <= 0) { if (u.kind === 'hero') downHero(u); else killEnemy(u, 'burn', front()); return; }
        if (u.kind === 'enemy') checkPhases(u);
        if (!u.down) tickStatus(u, 'burn', fl(b / 2) - b, g);
      });
      if (dead) return;
      const g2 = nextGroup();
      units().forEach((u) => {
        Object.keys(u.st).forEach((s) => {
          if (!ST[s] || ST[s].stack !== 'dur') return;
          if (u.kind === 'enemy' && s === 'stun') return;
          if (u.fresh[s]) return;
          tickStatus(u, s, -1, g2);
        });
      });
      C.heroes.concat(C.enemies).forEach((u) => { u.fresh = {}; });
    }
    function enemyPhase() {
      C.phase = 'enemy';
      emit('turn_start', { who: 'enemy', turn: C.turn, energy: C.energy, maxEnergy: C.maxEnergy });
      C.heroes.forEach((h) => { h._dmgTaken = 0; h._hitsTaken = 0; });
      livingEnemies().forEach((u) => clearBlock(u));
      for (const u of livingEnemies()) { if (u.down) continue; enemyTick(u); if (dead) break; }
      if (!dead) {
        for (const u of livingEnemies()) { if (dead) break; if (u.down) continue; if (u._freshSummon) continue; enemyAct(u); }
      }
      if (!dead) endOfRound();
      emit('turn_end', { who: 'enemy' });
    }

    // ---------------------------------------------------------------- public actions
    C.canPlay = (uid, targetId) => {
      const no = (reason) => ({ ok: false, reason });
      if (C.phase !== 'player') return no('phase');
      if (C.pending) return no('pending');
      const card = C.hand.find((c) => c.uid === uid);
      if (!card) return no('notInHand');
      const actor = ownerOf(card);
      if (!actor || actor.down) return no('down');
      if ((actor.st.stun || 0) > 0) return no('stunned');
      const res = R(card, actor);
      if (res.kw.indexOf('unplayable') >= 0 || res.cost === null) return no('unplayable');
      if (res.cost !== 'X' && C.energy < res.cost) return no('energy');
      if (needsTargetRes(res)) { const t = targetId ? enemyById(targetId) : null; if (!t || t.down) return no('target'); }
      return { ok: true, reason: null };
    };
    C.needsTarget = (uid) => {
      const card = C.hand.find((c) => c.uid === uid) || (C.inPlay && C.inPlay.uid === uid ? C.inPlay : null);
      return card ? needsTargetRes(R(card, ownerOf(card))) : false;
    };
    C.legalTargets = (uid) => (C.needsTarget(uid) ? livingEnemies().map((e) => e.id) : []);

    function* playRoutine(card, targetId) {
      const actor = ownerOf(card);
      const res = R(card, actor);
      const costX = res.cost === 'X';
      const X = costX ? C.energy : 0;
      const paid = costX ? X : res.cost;
      C.energy -= paid;
      const to = res.type === 'power' ? 'power' : res.kw.indexOf('exhaust') >= 0 ? 'exhaust' : 'discard';
      const target = targetId ? enemyById(targetId) : null;
      const pe = { card: cardCopy(card), hero: actor.id, target: target && needsTargetRes(res) ? target.id : null, cost: paid, to };
      if (costX) pe.x = X;
      emit('play', pe);
      if (paid !== 0) emit('energy', { value: C.energy, delta: -paid });
      const mySerial = ++serial;
      const env = { kind: 'card', actor, card: res, X, target: pe.target ? target : null, lastKill: false, picked: 0, serial: mySerial };
      yield* run(res.fx, env);
      // settle the card
      C.inPlay = null;
      if (to === 'power') C.powers.push(card);
      else if (to === 'exhaust') exhaustCard(card, 'play', actor);
      else C.discard.push(card);
      if (dead === 'lose') return;
      fireHook('onPlay', { hero: actor, res, cost: paid, target: pe.target ? target : null, serial: mySerial });
      C.enemies.forEach((u) => { if (!u.down) runEnemyHooks(u, 'onHeroPlay', { type: res.type }); });
      T.cards++; if (res.type === 'attack') T.attacks++; if (res.type === 'skill') T.skills++;
      C.stats.cardsPlayed++; if (res.type === 'attack') C.stats.attacksPlayed++;
      if (!costX && paid === 0) { T.zero++; if (T.zero === 3) C.stats.zeroCostTurns++; }
    }
    function advance(g, val) {
      const r = g.next(val);
      if (r.done) gen = null;
    }
    C.play = (uid, targetId) => {
      if (!C.canPlay(uid, targetId).ok) return [];
      return act(() => {
        const i = C.hand.findIndex((c) => c.uid === uid);
        const card = C.hand.splice(i, 1)[0];
        C.inPlay = card;
        gen = playRoutine(card, targetId);
        advance(gen);
      });
    };
    C.resolvePick = (uids) => {
      const p = C.pending;
      if (!p || !gen || !Array.isArray(uids)) return [];
      if (new Set(uids).size !== uids.length) return [];
      if (uids.some((u) => p.uids.indexOf(u) < 0)) return [];
      const need = p.n;
      if (p.optional ? uids.length > need : uids.length !== need) return [];
      return act(() => {
        C.pending = null;
        advance(gen, uids.slice());
      });
    };
    C.canSwap = () => {
      const free = T.freeUsed < mods.freeSwaps;
      const cost = free ? 0 : ECO.swapCost;
      const no = (reason) => ({ ok: false, cost, reason });
      if (C.phase !== 'player') return no('phase');
      if (C.pending) return no('pending');
      if (bound()) return no('bind');
      if (livingHeroes().length < 2 || C.heroes.length < 2) return no('solo');
      if (C.energy < cost) return no('energy');
      return { ok: true, cost, reason: null };
    };
    C.swap = () => {
      const cs = C.canSwap();
      if (!cs.ok) return [];
      return act(() => {
        if (cs.cost > 0) gainEnergy(-cs.cost); else T.freeUsed++;
        swapRows(false, cs.cost);
        C.stats.swaps++;
        fireHook('onSwap', { hero: front() });
      });
    };
    C.endTurn = () => {
      if (C.phase !== 'player' || C.pending || dead) return [];
      return act(() => {
        const f = front();
        C.hand.slice().forEach((c) => {
          const def = D.cards[c.id];
          if (dead || !def || !def.hand || !def.hand.turnEnd || C.hand.indexOf(c) < 0) return;
          const actor = ownerOf(c) || f;
          if (actor) drain(run(def.hand.turnEnd, { kind: 'hand', actor: def.hero === 'curse' || def.hero === 'status' ? front() : actor, card: R(c, actor), X: 0, target: null }));
        });
        if (dead) return;
        fireHook('turnEnd', {});
        if (dead) return;
        C.hand.slice().forEach((c) => {
          if (R(c, ownerOf(c)).kw.indexOf('ethereal') >= 0) { C.hand.splice(C.hand.indexOf(c), 1); exhaustCard(c, 'ethereal', ownerOf(c) || front()); }
        });
        if (dead) return;
        const kept = C.hand.filter((c) => c.keep || R(c, ownerOf(c)).kw.indexOf('retain') >= 0);
        const toss = C.hand.filter((c) => kept.indexOf(c) < 0);
        if (kept.length) emit('retain', { cards: kept.map(cardCopy) });
        if (toss.length) {
          toss.forEach((c) => { C.hand.splice(C.hand.indexOf(c), 1); C.discard.push(c); });
          emit('discard', { cards: toss.map(cardCopy), reason: 'endTurn', piles: piles() });
        }
        C.hand.forEach((c) => { c.keep = false; });
        emit('turn_end', { who: 'player' });
        enemyPhase();
        if (dead) return;
        rollAllIntents();
        beginPlayerTurn();
      });
    };

    C.start = () => {
      if (C.phase !== 'setup') return [];
      return act(() => {
        emit('combat_start', {});
        lineOrder(C.enemies).forEach((u) => { if (u._d.start) drain(run(u._d.start, { kind: 'enemy', enemy: u })); });
        const sh = rng.shuffle(C.draw);
        C.draw.splice(0, C.draw.length);
        sh.forEach((c) => C.draw.push(c));
        fireHook('combatStart', {});
        lineOrder(C.enemies).forEach((u) => { if (!u.down) { u.turn = 1; rollIntent(u); } });
        beginPlayerTurn();
      });
    };

    // ---------------------------------------------------------------- preview and intent (pure)
    C.preview = (uid, targetId) => {
      const out = { dmg: null, hits: 0, block: 0, heal: 0 };
      const card = C.hand.find((c) => c.uid === uid) || (C.inPlay && C.inPlay.uid === uid ? C.inPlay : null);
      if (!card) return out;
      const actor = ownerOf(card);
      if (!actor) return out;
      const res = R(card, actor);
      const target = targetId ? enemyById(targetId) : null;
      const sim = { kind: 'hero', id: actor.id, hp: actor.hp, maxHp: actor.maxHp, block: actor.block, st: Object.assign({}, actor.st), row: actor.row, down: actor.down, _dmgTaken: actor._dmgTaken, _hitsTaken: actor._hitsTaken };
      const env = { kind: 'card', actor: sim, card: res, X: res.cost === 'X' ? C.energy : 0, target: target && !target.down ? target : null, lastKill: false, picked: 0 };
      const rowAdd = () => (D.rowFor(sim.id, sim.row, relicIds).dmgAdd || 0);
      const visit = (op) => {
        switch (op.op) {
          case 'dmg': {
            if (out.dmg !== null) break;
            const t = env.target || (op.tgt === 'all' || op.tgt === 'lowest' ? livingEnemies()[0] : null) || null;
            const n = Math.max(0, evalV(op.n, env, t)) + (op.plus || 0);
            let raw = n + rowAdd() + (sim.st.might || 0);
            if (t && (t.st.mark || 0) > 0) raw += 3;
            if ((sim.st.weak || 0) > 0) raw = fl(raw * 0.75);
            if (t && (t.st.vulnerable || 0) > 0) raw = fl(raw * 1.5);
            out.dmg = Math.max(0, raw);
            out.hits = Math.max(0, op.hits === undefined ? 1 : evalV(op.hits, env, t)) + (op.hitsPlus || 0);
            break;
          }
          case 'block': {
            const t = op.tgt || 'self';
            if (t === 'self' || t === 'both' || (t === 'front' && sim.row === 'front') || (t === 'back' && sim.row === 'back')) {
              const g = blockAmount(sim, nOf(op, env, null), rowB(sim).blockAdd || 0);
              out.block += g; sim.block += g;
            }
            break;
          }
          case 'heal': { const t = op.tgt || 'self'; if (t === 'self' || t === 'both') out.heal += nOf(op, env, null); break; }
          case 'status': {
            const t = op.tgt || (D.isDebuff(op.s) ? 'enemy' : 'self');
            if (t === 'self' || t === 'both') sim.st[op.s] = (sim.st[op.s] || 0) + evalV(op.n, env, null);
            break;
          }
          case 'swap': if (!bound() && livingHeroes().length === 2) sim.row = sim.row === 'front' ? 'back' : 'front'; break;
          default: break;
        }
      };
      dryWalk(res.fx, env, visit);
      return out;
    };
    C.intent = (u) => {
      const unit = typeof u === 'string' ? enemyById(u) : u;
      return unit && unit.kind === 'enemy' && !unit.down ? computeIntent(unit) : null;
    };
    C.summary = () => {
      const heroesOut = C.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp, down: h.down }));
      const stats = JSON.parse(JSON.stringify(C.stats));
      return { result: C.result, heroes: heroesOut, maxHpGain: Object.assign({}, maxHpGain), stats, kills: stats.kills.slice(), ink: inkTotal, gold: goldTotal };
    };

    // ---------------------------------------------------------------- construction
    const frontIdx = opts.frontIdx || 0;
    asList(opts.heroes).forEach((h, i) => C.heroes.push(makeHero(h, i, frontIdx)));
    if (C.heroes.length === 2 && C.heroes[0].id === C.heroes[1].id) throw new Error('COMBAT.create: the party is two distinct heroes');
    const enemyIds = asList(opts.enemies).slice(0, 5);
    enemyIds.forEach((id, i) => C.enemies.push(makeEnemy(id, 5 - enemyIds.length + i)));
    const deck = asList(opts.deck);
    deck.forEach((c) => { if (isNum(c.uid) && c.uid >= nextUid) nextUid = c.uid + 1; });
    deck.forEach((c) => {
      const def = D.cards[c.id];
      const slotN = def && def.slots ? def.slots.length : asList(c.gems).length;
      const gems = [];
      for (let i = 0; i < slotN; i++) gems.push((c.gems && c.gems[i]) || null);
      const inst = { uid: isNum(c.uid) ? c.uid : nextUid++, id: c.id, up: c.up ? 1 : 0, gems };
      C.draw.push(inst);
    });
    C.deckSize = C.draw.length;
    // hero passives, then relic hooks, in registration order (card hooks join later)
    C.heroes.forEach((h) => asList(D.heroes[h.id].passives).forEach((p) => registerHook(p, h.id, 'passive', p.id)));
    relicIds.forEach((id) => {
      const r = D.relics[id];
      asList(r.hooks).forEach((h) => { if (D.LISTS.combatHooks.indexOf(h.on) >= 0) registerHook(h, r.hero || null, 'relic', id); });
    });
    hide(C, { _hooks: hooks });
    return C;
  }

  // ------------------------------------------------------------------------------------------------
  // The default bot. Greedy by a fixed value heuristic; the balance bot reuses it.
  // ------------------------------------------------------------------------------------------------
  const RARITY_RANK = { token: 0, starter: 1, common: 2, uncommon: 3, rare: 4 };
  function cardWorth(card) {
    const d = DATA.cards[card.id];
    if (!d) return 0;
    if (d.type === 'curse' || d.type === 'status') return -10;
    return (RARITY_RANK[d.rarity] || 0) + (card.up ? 0.5 : 0) + (isNum(d.cost) ? d.cost * 0.1 : 0.3);
  }
  function choosePick(C) {
    const p = C.pending;
    const pile = p.from === 'hand' ? C.hand : p.from === 'draw' ? C.draw : p.from === 'discard' ? C.discard : C.exhaust;
    const cands = p.uids.map((uid) => pile.find((c) => c.uid === uid)).filter(Boolean);
    const junkFirst = p.then === 'discard' || p.then === 'exhaust';
    cands.sort((a, b) => (junkFirst ? cardWorth(a) - cardWorth(b) : cardWorth(b) - cardWorth(a)) || a.uid - b.uid);
    if (p.optional) {
      const take = cands.filter((c) => (junkFirst ? cardWorth(c) < 0 : true)).slice(0, p.n);
      return take.map((c) => c.uid);
    }
    return cands.slice(0, p.n).map((c) => c.uid);
  }
  function scoreCard(C, card, targetId) {
    const actor = C.unit(DATA.cards[card.id].hero) || C.front();
    const res = DATA.resolveCard(card, { unit: actor });
    const pv = C.preview(card.uid, targetId);
    const tgt = targetId ? C.unit(targetId) : null;
    const f = C.front();
    let incoming = 0;
    C.enemies.forEach((e) => { if (e.down) return; const it = e.intent; if (it && it.dmg && it.tgt !== null) incoming += it.dmg * it.hits; });
    const need = Math.max(0, incoming - (f ? f.block : 0));
    let s = 0;
    if (pv.dmg !== null) {
      const total = pv.dmg * pv.hits * (res.fx.some((o) => o.op === 'dmg' && (o.tgt === 'all')) ? Math.max(1, C.enemies.filter((e) => !e.down).length) : 1);
      const cap = tgt ? tgt.hp + tgt.block : total;
      s += Math.min(total, cap) * 1.0 + (tgt && total >= tgt.hp + tgt.block ? 6 : 0);
    }
    s += Math.min(pv.block, need) * 1.3 + Math.max(0, pv.block - need) * 0.15;
    s += pv.heal * (f && f.hp < f.maxHp * 0.6 ? 0.9 : 0.2);
    DATA.cardOps(res).forEach((o) => {
      const n = isNum(o.n) ? o.n : (isObj(o.n) ? (o.n.base || o.n.mul || 1) : 1);
      if (o.op === 'draw') s += 3 * n;
      else if (o.op === 'energy') s += 4 * n;
      else if (o.op === 'status') {
        const debuff = DATA.isDebuff(o.s);
        const enemySide = o.tgt === undefined ? debuff : ['enemy', 'all', 'random', 'lowest', 'others'].indexOf(o.tgt) >= 0;
        const w = { poison: 2.2, vulnerable: 3, weak: 2.5, stun: 8, mark: 2, burn: 1.5, frail: 1, might: 3, bulwark: 2, thorns: 1.5, dodge: 3, regen: 2, ritual: 5, plating: 2, taunt: 1.5, bloom: 1.5, sumi: 1.5, ward: 1.5, charge: 1.5 }[o.s] || 1;
        s += (enemySide === debuff ? w * Math.abs(n) : -w * 0.2);
      } else if (o.op === 'hook') s += 6;
      else if (o.op === 'pick') s += 1.5;
      else if (o.op === 'hurt') s -= n;
      else if (o.op === 'gold' || o.op === 'ink') s += 1;
    });
    if (res.type === 'power') s += 6;
    const cost = res.cost === 'X' ? Math.max(1, C.energy) : Math.max(0.5, res.cost);
    return { value: s, per: s / cost };
  }
  function bestTarget(C, card) {
    const ts = C.legalTargets(card.uid);
    if (!ts.length) return null;
    let best = null, bs = -Infinity;
    ts.forEach((id) => { const e = C.unit(id); const sc = -(e.hp + e.block) + (e.tier === 'boss' ? -1 : 0); if (sc > bs) { bs = sc; best = id; } });
    return best;
  }
  function greedyPolicy(C) {
    if (C.pending) return { type: 'pick', uids: choosePick(C) };
    if (C.phase !== 'player') return null;
    const cs = C.canSwap();
    if (cs.ok && cs.cost === 0) {
      const f = C.front(), b = C.back();
      if (f && b) {
        const ff = f.hp / f.maxHp, bf = b.hp / b.maxHp;
        const pf = DATA.heroes[f.id].prefer, pb = DATA.heroes[b.id].prefer;
        if ((ff < 0.4 && bf > ff + 0.25) || (pf === 'back' && pb === 'front' && ff > 0.4 && bf > 0.4)) return { type: 'swap' };
      }
    }
    let best = null;
    C.hand.forEach((card) => {
      const target = bestTarget(C, card);
      if (!C.canPlay(card.uid, target).ok) return;
      const sc = scoreCard(C, card, target);
      if (sc.value > 0.5 && (!best || sc.per > best.per + 1e-9)) best = { uid: card.uid, target, per: sc.per };
    });
    return best ? { type: 'play', uid: best.uid, target: best.target } : { type: 'end' };
  }
  function applyAction(C, a) {
    if (!a) return [];
    if (a.type === 'play') return C.play(a.uid, a.target);
    if (a.type === 'swap') return C.swap();
    if (a.type === 'pick') return C.resolvePick(a.uids);
    if (a.type === 'end') return C.endTurn();
    return [];
  }
  function simulate(opts, policyFn) {
    const C = create(opts);
    const pol = policyFn || greedyPolicy;
    const maxTurns = (opts && opts.maxTurns) || 60, maxActions = (opts && opts.maxActions) || 3000;
    C.start();
    let actions = 0, stall = 0, capped = false;
    while (C.phase !== 'over') {
      if (C.turn > maxTurns || actions >= maxActions) { capped = true; break; }
      const a = pol(C);
      const ev = applyAction(C, a);
      actions++;
      if (!ev.length) {
        stall++;
        if (stall >= 3) {
          const fb = C.pending ? C.resolvePick(C.pending.uids.slice(0, C.pending.optional ? 0 : C.pending.n)) : C.endTurn();
          if (!fb.length) { capped = true; break; }
          stall = 0;
        }
      } else stall = 0;
    }
    const s = C.summary();
    s.turns = C.turn; s.actions = actions; s.capped = capped;
    Object.defineProperty(s, 'C', { value: C, enumerable: false });
    return s;
  }

  return { create, simulate, greedyPolicy, applyAction };
})();
