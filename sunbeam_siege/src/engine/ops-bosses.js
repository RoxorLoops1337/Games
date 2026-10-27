/* SUNBEAM SIEGE boss and elite engine support (agent C1 follow-up).
 * Classic script. Load after registry.js, card-inst.js, battle.js and battle-ai.js (it patches their prototypes and registries).
 * It does not edit those files. See design/C1-engine-notes.md for the registry API.
 *
 * Adds ops:      inhale, swallow, spit, jamCheck (Vacuum Mk IX), trap, tickTrapTimers, freeTrapped (Vet Carrier),
 *                damagePctMax, floodByLevel, dawnTick, respawnTick (Great Bath, Dawn), ownerMeter, ownerDamage (Coil, Plug),
 *                skitter, witchChain (Red Dot), log, stagger. Replaces the stub ops extraMove, respawnIn, summonReruns,
 *                forceWitchingHour and wraps damage (so "ignores: hide" works and AoE can reach the Red Dot).
 * Adds passives: pressure, burst_pipe, bag, overheat, parry, soaked, weight, appointment, skitter, redot_overheat, fixate,
 *                tap, evaporate, sunrise, final_flush, frenzy_clock, fake_dot, text.
 * Adds specials (pest actions of kind "special"): inhale, swallow, trap, setStance, healBoss, floorHazard, summonReruns.
 * Patches:       AI.initPest (meter definitions become numbers), AI.checkPhase (passivesAdd, Dawn phase on Night 9),
 *                AI.select (Duelist stance), AI.act (Red Dot moveTo, special bridge), AI.takeTurn (Dawn extra move),
 *                Battle damage (Parry, Overheated, Red Dot reach), addStatus (Soaked, Sterile Lights), canNap (Fixate),
 *                recalc (Red Dot untargetable while not Overheated or Yarned), zoomAttack (Zoom reaches the Red Dot),
 *                discardHand (start of Cat Attacks hazards: Draft and Suds), execOp (AoE reaches the Red Dot).
 * State it adds to B.state: S.trapped[] (cats held by Latches), S.dawn {active, rounds}, S.respawns[], pest.bag {cards, cats}.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB;
  if (!SB || !SB.engine || !SB.battle || !SB.battle.Battle || !SB.engine.ai) return;
  var E = SB.engine, OP = E.ops, PS = E.passives, AI = E.ai, U = SB.util;
  if (E.bossOpsLoaded) return;
  E.bossOpsLoaded = true;
  var BP = SB.battle.Battle.prototype;

  function rv(key, dflt) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : dflt; }
  function clone(x) { return x ? U.deepClone(x) : x; }
  function has(list, v) { return !!list && list.indexOf(v) >= 0; }
  function runEffs(B, p, effs, extra) {
    if (!effs || !effs.length) return;
    var ctx = B.makeCtx(Object.assign({ src: { kind: 'pest', unit: p }, self: p, subject: p, floorOverride: p.floor, lk: 'bossop:' + p.uid }, extra || {}));
    B.runEffects(effs, ctx);
  }
  function findOwner(B, id) {
    var l = B.livePests().filter(function (q) { return q.id === id && !q.removed; });
    return l.length ? l[0] : null;
  }
  function meterOf(p, name) { return (p.meter && typeof p.meter[name] === 'number') ? p.meter[name] : 0; }
  function setMeter(p, name, v) {
    p.meter = p.meter || {};
    var mx = p.meterMax && p.meterMax[name];
    if (mx !== undefined && mx !== null) v = Math.min(mx, v);
    p.meter[name] = Math.max(0, v);
    return p.meter[name];
  }
  function forceStatus(B, u, id, n) {
    // direct set that bypasses the boss Yarn halving (a Jam is a real stun)
    if (!u || !u.statuses) return;
    var cur = u.statuses[id] || 0;
    if (cur >= n) return;
    u.statuses[id] = n; B.touch();
    B.emit('status', { uid: u.uid, status: id, amount: n - cur, total: n, floor: u.floor, pos: u.pos, side: u.kind, kind: 'add' });
  }
  function spawnRoomFloor(B, order, size) {
    for (var i = 0; i < order.length; i++) {
      var fi = order[i];
      if (B.S.floors[fi] && B.pestSize(fi) + size <= B.S.floors[fi].capacity.pestSize) return fi;
    }
    return -1;
  }

  // ======================================================================================
  // 1. meters: boss data defines meters as {start, max, label}; the engine ops need plain numbers
  // ======================================================================================
  function normMeters(p) {
    if (!p.meter) p.meter = {};
    p.meterMax = p.meterMax || {};
    p.meterLabel = p.meterLabel || {};
    Object.keys(p.meter).forEach(function (k) {
      var m = p.meter[k];
      if (m && typeof m === 'object') {
        if (m.max !== undefined) p.meterMax[k] = m.max;
        if (m.label) p.meterLabel[k] = m.label;
        p.meter[k] = (k === 'stance') ? null : (m.start || 0);
      }
    });
  }
  var origInit = AI.initPest;
  AI.initPest = function (B, p) {
    normMeters(p);
    return origInit.call(AI, B, p);
  };

  // ======================================================================================
  // 2. passives (init hooks and attack bonuses; their effect lists run through the normal trigger queue)
  // ======================================================================================
  function ensureMeters(p) { normMeters(p); }
  PS.register('pressure', { init: ensureMeters });
  PS.register('burst_pipe', { init: ensureMeters });
  PS.register('bag', { init: function (p) { ensureMeters(p); p.bag = p.bag || { cards: [], cats: [] }; } });
  PS.register('overheat', { init: ensureMeters });
  PS.register('redot_overheat', { init: ensureMeters });
  PS.register('parry', { init: function (p) { ensureMeters(p); p.flags.parry = true; } });
  PS.register('soaked', { init: function (p) { p.flags.soaked = true; } });
  PS.register('weight', {
    init: ensureMeters,
    attack: function (B, p) { return 2 * trappedBy(B, p).length; }
  });
  PS.register('appointment', { init: ensureMeters });
  PS.register('skitter', { init: function (p) { ensureMeters(p); p.flags.dotReal = true; p.flags.aoeReach = true; } });
  PS.register('fixate', { init: function () {} });
  PS.register('tap', { init: ensureMeters });
  PS.register('evaporate', { init: function () {} });
  PS.register('sunrise', { init: function () {} });
  PS.register('final_flush', { init: function () {} });
  PS.register('frenzy_clock', { init: function () {} });
  PS.register('fake_dot', { init: function (p) { p.flags.decoy = true; } });
  PS.register('text', { init: function () {} });

  // ======================================================================================
  // 3. generic small ops
  // ======================================================================================
  OP.register('log', function (ctx, e, B) { if (e.text) B.toast(e.text); });
  OP.register('stagger', function (ctx, e, B) { var p = ctx.self; if (p && p.kind === 'pest') p.skipRound = B.S.round; });
  OP.register('extraMove', function (ctx, e, B) { B.S.counters.extraMove = true; });

  // damage: "ignores: ['hide']" bypasses Fluff and hit modifiers; AoE reach of the Red Dot is handled in execOp
  var oldDamage = OP.get('damage');
  OP.register('damage', function (ctx, e, B) {
    if (has(e.ignores, 'hide') || has(e.ignores, 'fluff')) {
      var n = e.amount !== undefined ? B.num(e.amount, ctx) : 1;
      var spec = e.target !== undefined ? e.target : 'self';
      B.targets(spec, ctx, e).forEach(function (t) {
        if (t && (t.kind === 'pest' || t.kind === 'cat')) B.damage(t, n, { kind: 'direct', srcId: 'ignoresHide', noWake: false });
      });
      return;
    }
    return oldDamage(ctx, e, B);
  });

  OP.register('damagePctMax', function (ctx, e, B) {
    var spec = e.target !== undefined ? e.target : 'self';
    B.targets(spec, ctx, e).forEach(function (t) {
      if (!t || (t.kind !== 'pest' && t.kind !== 'cat')) return;
      var mx = B.maxHpOf(t), n = Math.max(1, Math.ceil(mx * (e.pct || 0) / 100));
      B.damage(t, n, { kind: 'direct', srcId: 'pctMax' });
    });
  });

  // damage or meter changes aimed at another pest (a Coil hurting the Hose, the Plug draining the Bath)
  OP.register('ownerMeter', function (ctx, e, B) {
    var o = findOwner(B, e.owner); if (!o) return;
    var v = meterOf(o, e.meter) + (e.amount || 0);
    setMeter(o, e.meter, v);
    if (e.meter === 'waterLevel') syncFlood(B, o);
    B.emit('meter', { uid: o.uid, meter: e.meter, amount: e.amount || 0, total: o.meter[e.meter], floor: o.floor, pos: o.pos });
  });
  OP.register('ownerDamage', function (ctx, e, B) {
    var o = findOwner(B, e.owner); if (!o) return;
    B.damage(o, e.amount || 0, { kind: 'direct', srcId: 'owner' });
  });
  // keep the shared meter helpers honest when the stock ops run on boss meters
  OP.register('addMeter', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    normMeters(p);
    var v = meterOf(p, e.meter) + (e.amount === undefined ? 1 : e.amount);
    if (e.max !== undefined) v = Math.min(e.max, v);
    setMeter(p, e.meter, v);
  });
  OP.register('setMeter', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    normMeters(p);
    var v = e.value !== undefined ? e.value : (e.amount || 0);
    p.meter[e.meter] = Math.max(0, p.meterMax && p.meterMax[e.meter] !== undefined ? Math.min(p.meterMax[e.meter], v) : v);
  });

  // ======================================================================================
  // 4. Great Bath: water level floods the house from the Attic down
  // ======================================================================================
  function syncFlood(B, boss) {
    var lvl = Math.max(0, Math.min(3, Math.floor(meterOf(boss, 'waterLevel'))));
    for (var fi = 0; fi < B.numFloors; fi++) {
      var f = B.S.floors[fi];
      var wet = (B.numFloors - 1 - fi) < lvl;
      if (wet && !f.hazards.puddle) {
        f.hazards.puddle = { id: 'puddle', since: B.S.round, flood: true };
        B.emit('status', { floor: fi, status: 'puddle', kind: 'hazard', side: 'floor', amount: 1, total: 1 });
      } else if (!wet && f.hazards.puddle && f.hazards.puddle.flood) {
        delete f.hazards.puddle;
        B.emit('status', { floor: fi, status: 'puddle', kind: 'hazard', side: 'floor', amount: -1, total: 0 });
      }
    }
  }
  OP.register('floodByLevel', function (ctx, e, B) { if (ctx.self) syncFlood(B, ctx.self); });

  // plugs and other things that come back: respawnIn schedules, respawnTick (every Dusk) brings them back
  OP.register('respawnIn', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    var S = B.S; S.respawns = S.respawns || [];
    S.respawns.push({ round: S.round + (e.rounds || 3), id: p.id, floor: (e.floor ? e.floor - 1 : p.floor), source: p.source || null });
  });
  OP.register('respawnTick', function (ctx, e, B) {
    var S = B.S; if (!S.respawns || !S.respawns.length) return;
    var keep = [];
    S.respawns.forEach(function (r) {
      if (r.round > S.round) { keep.push(r); return; }
      if (B.livePests().some(function (q) { return q.id === r.id; })) return;
      var fi = spawnRoomFloor(B, [r.floor, 1, 0, 2], (SB.content.pest(r.id) || { size: 1 }).size || 1);
      if (fi < 0) { keep.push(r); return; }
      B.spawnPest(r.id, fi, 'back', { from: 'summon', source: r.source });
      B.toast('The Plug is back in the tub');
    });
    S.respawns = keep;
  });

  // Reruns: miniature echoes of the bosses beaten this run (fallback Rubber Duck)
  function summonRerun(B, p, e) {
    var defeated = ((B.run && B.run.defeatedBosses) || (B.enc && B.enc.defeatedBosses) || []).slice();
    var rules = SB.data.bossRules || {};
    var alive = B.livePests().filter(function (q) { return /^pest_rerun_/.test(q.id); }).length;
    var n = e.perRound || e.count || 1;
    for (var i = 0; i < n; i++) {
      if (alive >= 3) return;
      var idx = (p.counters.rerunIdx = (p.counters.rerunIdx || 0) + 1) - 1;
      var bid = defeated.length ? defeated[idx % defeated.length] : null;
      var id = bid && rules.rerunFor && rules.rerunFor[bid];
      if (!id || !SB.content.pest(id)) id = e.fallback || 'pest_add_rubber_duck';
      var order = Array.isArray(e.floors) ? e.floors.map(function (x) { return x - 1; }) : [0, 1, 2];
      var start = B.rng.int(order.length), rotated = order.slice(start).concat(order.slice(0, start));
      var fi = spawnRoomFloor(B, rotated, (SB.content.pest(id) || { size: 1 }).size || 1);
      if (fi < 0) fi = rotated[0];
      B.spawnPest(id, fi, 'back', { yarn: rv('yarn_summoned_pest_start', 1), from: 'summon', source: p.uid });
      alive++;
    }
  }
  OP.register('summonReruns', function (ctx, e, B) { if (ctx.self) summonRerun(B, ctx.self, e); });

  // ======================================================================================
  // 5. Dawn (Night 9): armed when a phase flagged dawn begins. Pests repeat their intent, winIf dawnRounds becomes live
  // ======================================================================================
  function armDawn(B, p, phase) {
    var S = B.S;
    S.dawn = S.dawn || { active: false, rounds: 0 };
    if (S.dawn.active) return;
    S.dawn.active = true; S.dawn.rounds = 0; S.dawn.round = S.round;
    S.counters.extraMove = true;
    var need = rv('dawn_rounds_to_win', 5);
    var w = S.win;
    function hasDawn(x) { return !!x && (x.type === 'dawnRounds' || (x.type === 'any' && (x.conds || x.of || x.conditions || x.any || []).some(hasDawn))); }
    if (!hasDawn(w)) S.win = w ? { type: 'any', conds: [w, { type: 'dawnRounds', atLeast: need }] } : { type: 'any', conds: [{ type: 'bossDead' }, { type: 'dawnRounds', atLeast: need }] };
    B.emit('dawn', { round: S.round, boss: p.uid, need: need });
    B.touch();
  }
  OP.register('dawnTick', function (ctx, e, B) {
    var S = B.S; S.dawn = S.dawn || { active: false, rounds: 0 };
    if (!S.dawn.active) return;
    S.dawn.rounds++;
    if (ctx.self) { ctx.self.meter = ctx.self.meter || {}; ctx.self.meter.dawnRounds = S.dawn.rounds; }
    B.emit('dawnTick', { rounds: S.dawn.rounds });
  });

  // ======================================================================================
  // 6. Boss phases: replacement for AI.checkPhase (adds passivesAdd and the generic Dawn phase for Night 9)
  // ======================================================================================
  AI.checkPhase = function (B, p) {
    if (!p.boss || p.dead || p.removed) return;
    var d = SB.content.pest(p.id);
    if (!d) return;
    var phases = (d.phases || []).slice();
    var realCount = phases.length;
    if (B.enc && B.enc.dawn && B.enc.dawnPhase && !phases.some(function (ph) { return ph.dawn; })) phases.push(B.enc.dawnPhase);
    if (!phases.length) return;
    var guard = 0;
    while (guard++ < 4 && !B.S.over) {
      var entered = p.phasesEntered || 0;
      var next = phases[entered];
      if (!next) break;
      var pct = p.hp * 100 / p.maxHp;
      if (!(pct <= (next.hpPctBelow || 0))) break;
      p.phasesEntered = entered + 1;
      var appended = entered >= realCount;
      if (!appended) { p.pat.phase = entered; p.pat.idx = 0; p.pat.cd = null; p.pat.round = 0; }
      (next.traitsRemove || []).forEach(function (t) { delete p.traitSet[String(t).toLowerCase()]; });
      (next.traitsAdd || []).forEach(function (t) { p.traitSet[String(t).toLowerCase()] = true; });
      (next.clears || []).forEach(function (s) { B.removeStatus(p, s); });
      if (next.stagger) p.skipRound = B.S.round;
      B.emit('phase', { boss: p.uid, phaseId: next.id, name: next.name, announce: next.announce });
      if (next.announce) B.toast(next.announce);
      if (next.dawn) armDawn(B, p, next);
      if (next.onEnter) runEffs(B, p, next.onEnter);
      (next.passivesAdd || []).forEach(function (ps) {
        p.passives.push(clone(ps));
        if (ps.on && ps.effects) {
          var trig = E.normTrigger(ps.on);
          p.fx[trig] = (p.fx[trig] || []).concat(clone(ps.effects).map(function (ef) { ef.passiveId = ps.id; return ef; }));
        }
        var pd = PS.get(ps.id); if (pd && pd.init) pd.init(p, ps);
      });
      AI.select(B, p);
    }
  };

  // ======================================================================================
  // 7. Pest AI patches
  // ======================================================================================
  var origSelect = AI.select;
  AI.select = function (B, p) {
    origSelect.call(AI, B, p);
    // Spray Bottle Duelist: the stance on the intent is the stance in force during the player's turn
    if (p.flags && p.flags.parry) {
      var a = p.nextAction;
      p.stance = (a && a.op === 'setStance') ? a.stance : null;
      p.meter.stance = p.stance;
    }
  };

  var origAct = AI.act;
  AI.act = function (B, p) {
    var a = p.nextAction;
    // a special with no registered handler but a registered op: run the op with the action's fields
    if (a && a.kind === 'special' && !AI.specials[a.op] && E.ops.has(a.op)) {
      runEffs(B, p, [Object.assign({}, a, { op: a.op })]);
      if (a.then && a.then.kind) { var save = p.nextAction; p.nextAction = a.then; AI.act(B, p); p.nextAction = save; }
      return true;
    }
    var r = origAct.call(AI, B, p);
    if (a && a.moveTo && p.flags && p.flags.dotReal && !p.dead) p.pendingMove = a.moveTo - 1;
    return r;
  };

  // Dawn: every pest repeats its current intent once more per Pest Attacks phase
  var origTake = AI.takeTurn;
  AI.takeTurn = function (B, p) {
    if (!p.nextAction) AI.select(B, p);
    var before = p.nextAction ? clone(p.nextAction) : null;
    var skipped = p.skipRound === B.S.round || !!p.statuses.yarn || !!p.statuses.scared;
    origTake.call(AI, B, p);
    if (!skipped && before && B.S.counters.extraMove && !p.dead && !p.removed && !B.S.over && before.kind !== 'summon' && !p.queued) {
      var save = p.nextAction;
      p.nextAction = before;
      AI.act(B, p);
      B.reap(); B.drain();
      if (!p.dead && !p.removed) p.nextAction = save;
    }
  };

  // specials registered as AI.specials (pest actions of kind "special")
  AI.specials.healBoss = function (B, p, a) { B.pests().forEach(function (q) { if (q.boss && !q.dead) B.heal(q, a.amount || 6); }); };
  AI.specials.setStance = function (B, p, a) {
    normMeters(p);
    p.stance = a.stance || null; p.meter.stance = p.stance;
    B.toast(p.name + ' takes the ' + p.stance + ' stance');
  };
  AI.specials.floorHazard = function (B, p, a) {
    var own = p.floor, list;
    if (Array.isArray(a.floors)) list = a.floors.map(function (x) { return x - 1; });
    else if (a.floors === 'reach') list = [own, own - 1, own + 1];
    else if (a.floors === 'each') list = [0, 1, 2];
    else list = [own];
    list.filter(function (x) { return x >= 0 && x < B.numFloors; }).forEach(function (fi) {
      var f = B.S.floors[fi];
      if (f.hazards[a.hazard]) return;
      f.hazards[a.hazard] = { id: a.hazard, since: B.S.round };
      B.emit('status', { floor: fi, status: a.hazard, kind: 'hazard', side: 'floor', amount: 1, total: 1 });
    });
  };
  AI.specials.summonReruns = function (B, p, a) { summonRerun(B, p, a); };

  // Red Dot: moves after it acts, heat rises, fixates the floor it lands on
  OP.register('skitter', function (ctx, e, B) {
    var p = ctx.self; if (!p || p.dead || p.removed) return;
    if (p.pendingMove === undefined || p.pendingMove === null) return;
    var to = p.pendingMove; p.pendingMove = null;
    if (to < 0 || to >= B.numFloors) return;
    if (to !== p.floor && B.pestSize(to) + p.size <= B.S.floors[to].capacity.pestSize) B.movePest(p, to, { kind: 'teleport' });
    normMeters(p);
    setMeter(p, 'heat', meterOf(p, 'heat') + 1);
    B.emit('meter', { uid: p.uid, meter: 'heat', amount: 1, total: p.meter.heat, floor: p.floor, pos: p.pos });
  });
  // Laser Pointer Frenzy: a forced Witching Hour every round for N rounds
  OP.register('forceWitchingHour', function (ctx, e, B) {
    if (!B.S.rules.nightClock) return;
    var c = B.S.clock;
    c.forceNext = true; c.chain = true;
    c.forceLeft = Math.max(0, (e.duration || 1) - 1);
  });
  OP.register('witchChain', function (ctx, e, B) {
    var c = B.S.clock;
    if (c && c.isWitching && c.forceLeft > 0 && B.S.rules.nightClock) { c.forceNext = true; c.forceLeft--; }
  });

  // ======================================================================================
  // 8. Vacuum Mk IX: inhale, swallow, spit, jam
  // ======================================================================================
  function bagOf(p) { p.bag = p.bag || { cards: [], cats: [] }; return p.bag; }
  function addBag(B, p, n) {
    normMeters(p);
    if (n) setMeter(p, 'bag', meterOf(p, 'bag') + n);
    jamCheck(B, p);
  }
  function inhale(B, p, n, bagAdd) {
    var S = B.S, bag = bagOf(p), took = 0;
    for (var i = 0; i < n; i++) {
      if (!S.draw.length) B.shuffleDiscardIntoDraw();
      if (!S.draw.length) break;
      bag.cards.push(S.draw.shift()); took++;
    }
    B.syncPiles();
    B.emit('inhale', { uid: p.uid, floor: p.floor, count: took, bag: bag.cards.length + bag.cats.length });
    if (took) B.toast(p.name + ' inhales ' + took + (took === 1 ? ' card' : ' cards'));
    addBag(B, p, bagAdd);
  }
  function swallowCat(B, p, c) {
    var bag = bagOf(p);
    if (c.boxed) B.unseatCat(c, 'swallow');
    var rec = { floor: c.floor, pos: c.pos };
    B.removeUnit(c);
    c.removed = false; c.swallowedBy = p.uid; c.swallowSlot = rec;
    bag.cats.push(c);
    B.emit('swallow', { uid: c.uid, by: p.uid, floor: rec.floor, pos: rec.pos, name: c.name });
    B.toast(p.name + ' swallows ' + c.name);
  }
  function placeBack(B, c, floor, pos) {
    // returns true when the cat is back on a floor
    var order = [floor], i;
    for (i = 0; i < B.numFloors; i++) if (order.indexOf(i) < 0) order.push(i);
    for (i = 0; i < order.length; i++) {
      var fi = order[i], f = B.S.floors[fi];
      if (B.catSize(fi) + (c.size || 1) <= f.capacity.cats) {
        c.removed = false; c.dead = false; c.floor = fi; c.swallowedBy = null; c.trappedBy = null;
        f.cats.splice(Math.max(0, Math.min(pos === undefined ? f.cats.length : pos, f.cats.length)), 0, c);
        B.reindex(fi); B.touch();
        B.emit('deploy', { uid: c.uid, cardUid: c.cardUid, id: c.id, name: c.name, floor: fi, pos: c.pos, released: true });
        return true;
      }
    }
    // nowhere to stand: the card simply goes back to the discard (no life lost)
    if (c.cardUid && B.S.cards[c.cardUid]) B.toDiscard(c.cardUid);
    B.emit('toast', { text: c.name + ' has nowhere to stand and heads home' });
    return false;
  }
  function spit(B, p) {
    var bag = bagOf(p), S = B.S;
    var cards = bag.cards.slice(), cats = bag.cats.slice();
    bag.cards = []; bag.cats = [];
    if (cards.length) { S.draw = cards.concat(S.draw); B.syncPiles(); }
    cats.forEach(function (c) { var slot = c.swallowSlot || { floor: c.floor, pos: 0 }; placeBack(B, c, slot.floor, slot.pos); c.swallowSlot = null; });
    setMeter(p, 'bag', 0);
    if (cards.length || cats.length) {
      B.emit('spit', { uid: p.uid, floor: p.floor, cards: cards.length, cats: cats.length });
      B.toast(p.name + ' spits everything back');
    }
  }
  function jamCheck(B, p) {
    var need = (p.meterMax && p.meterMax.bag) || 10;
    if (meterOf(p, 'bag') < need) return false;
    B.emit('jam', { uid: p.uid, floor: p.floor });
    B.toast(p.name + ' JAMS');
    forceStatus(B, p, 'yarn', 2);
    B.addStatus(p, 'spooked', 3, { force: true });
    spit(B, p);
    return true;
  }
  OP.register('inhale', function (ctx, e, B) { if (ctx.self) inhale(B, ctx.self, e.cards || e.amount || 1, e.bag === undefined ? (e.cards || 1) : e.bag); });
  OP.register('swallow', function (ctx, e, B) { if (ctx.self) doSwallow(B, ctx.self, e); });
  OP.register('spit', function (ctx, e, B) { if (ctx.self) spit(B, ctx.self); });
  OP.register('jamCheck', function (ctx, e, B) { if (ctx.self) jamCheck(B, ctx.self); });
  function doSwallow(B, p, a) {
    var tg = AI.resolve(B, p, { floors: a.floors || 'own', pick: a.pick || 'front' }, true);
    var swallowed = 0;
    tg.cats.forEach(function (c) { if (!c.dead && !c.removed) { swallowCat(B, p, c); swallowed++; } });
    addBag(B, p, swallowed ? (a.bag === undefined ? 3 : a.bag) * (a.perCat ? swallowed : 1) : 0);
  }
  AI.specials.inhale = function (B, p, a) { inhale(B, p, a.cards || 1, a.bag === undefined ? (a.cards || 1) : a.bag); };
  AI.specials.swallow = function (B, p, a) { doSwallow(B, p, a); };
  AI.specials.spit = function (B, p) { spit(B, p); };

  // ======================================================================================
  // 9. Vet Carrier: trap and Latches
  // ======================================================================================
  function trappedList(B) { return B.S.trapped || (B.S.trapped = []); }
  function trappedBy(B, p) { return trappedList(B).filter(function (r) { return r.by === p.uid; }); }
  function syncSlots(B, p) { if (p && p.meter) { normMeters(p); p.meter.slots = trappedBy(B, p).length; } }
  function trapPick(B, p, a) {
    var cands = [];
    var floors = (a.floors === 'own' || a.floors === undefined) ? [p.floor] : [0, 1, 2].slice(0, B.numFloors);
    floors.forEach(function (fi) {
      B.S.floors[fi].cats.forEach(function (c) {
        if (c.dead || c.removed) return;
        if (B.isHidden(c) || c.hidden) return;
        cands.push(c);
      });
    });
    if (!cands.length) return null;
    if (a.pick === 'random') return B.pickOne(cands);
    var best = cands[0];
    cands.forEach(function (c) { if (B.atk(c) > B.atk(best)) best = c; });
    return best;
  }
  function trapOne(B, p, a) {
    normMeters(p);
    var max = (p.meterMax && p.meterMax.slots) || 3;
    if (trappedBy(B, p).length >= max) return false;
    var c = trapPick(B, p, a); if (!c) return false;
    // the Latch has to stand somewhere, otherwise nothing is trapped
    var order = [c.floor]; for (var i = B.numFloors - 1; i >= 0; i--) if (order.indexOf(i) < 0) order.push(i);
    var lf = spawnRoomFloor(B, order, 1);
    if (lf < 0) return false;
    var rec = { catUid: c.uid, cat: c, floor: c.floor, pos: c.pos, timer: a.timer || 3, by: p.uid, latchUid: null };
    if (c.boxed) B.unseatCat(c, 'trap');
    B.removeUnit(c);
    c.removed = false; c.isTrapped = true; c.trappedBy = p.uid;
    var base = (SB.content.pest('pest_add_latch') || { hp: 12 }).hp || 12;
    var latch = B.spawnPest('pest_add_latch', lf, 'back', { mod: { hpMult: (a.latchHp || base) / base, fluff: a.latchHide !== undefined ? a.latchHide : undefined }, from: 'summon', source: p.uid });
    rec.latchUid = latch ? latch.uid : null;
    trappedList(B).push(rec);
    syncSlots(B, p);
    B.emit('trap', { uid: c.uid, by: p.uid, floor: rec.floor, pos: rec.pos, latch: rec.latchUid, name: c.name });
    B.toast(p.name + ' checks in ' + c.name);
    return true;
  }
  function doTrap(B, p, a) {
    var n = a.count || 1;
    for (var i = 0; i < n; i++) if (!trapOne(B, p, a)) break;
  }
  function releaseRec(B, rec, why) {
    var list = trappedList(B), i = list.indexOf(rec);
    if (i >= 0) list.splice(i, 1);
    var c = rec.cat;
    c.isTrapped = false;
    var back = placeBack(B, c, rec.floor, rec.pos);
    if (back && why === 'freed') {
      B.addFluff(c, 3, { force: true });
      origAddStatus.call(B, c, 'rested', 1, { force: true });
    }
    var boss = B.pestByUid(rec.by); if (boss) syncSlots(B, boss);
    B.emit('release', { uid: c.uid, floor: c.floor, pos: c.pos, why: why });
    return back;
  }
  function killLatch(B, rec) {
    var l = rec.latchUid && B.pestByUid(rec.latchUid);
    if (l && !l.dead) { l.dead = true; l.silent = true; }
  }
  OP.register('trap', function (ctx, e, B) { if (ctx.self) doTrap(B, ctx.self, e); });
  AI.specials.trap = function (B, p, a) { doTrap(B, p, a); };
  OP.register('freeTrapped', function (ctx, e, B) {
    var latch = ctx.self; if (!latch) return;
    var rec = trappedList(B).filter(function (r) { return r.latchUid === latch.uid; })[0];
    if (rec) releaseRec(B, rec, 'freed');
  });
  OP.register('tickTrapTimers', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    trappedBy(B, p).forEach(function (rec) {
      rec.timer--;
      if (rec.timer > 0) return;
      // vaccinated: the cat spends a life, the card goes to the discard, the Latch is gone
      killLatch(B, rec);
      var c = rec.cat, list = trappedList(B), i = list.indexOf(rec);
      if (i >= 0) list.splice(i, 1);
      c.isTrapped = false; c.removed = true;
      var inst = c.instUid ? B.instByUid(c.instUid) : null;
      B.emit('vaccinate', { uid: c.uid, by: p.uid, name: c.name });
      B.toast(c.name + ' gets its shots');
      if (inst) B.spendLifeFor(c, inst, 1);
      syncSlots(B, p);
    });
    B.reap();
  });

  // ======================================================================================
  // 10. Battle prototype patches
  // ======================================================================================
  var AOE = { allEnemies: 1, allPests: 1, allEnemiesOnFloor: 1, allPestsOnFloor: 1, otherEnemiesOnFloor: 1, otherPestsOnFloor: 1 };

  var origDamageFn = BP.damage;
  BP.damage = function (tgt, base, o) {
    if (tgt && tgt.kind === 'pest' && !tgt.dead && !tgt.removed && tgt.flags) {
      var kind = (o && o.kind) || 'hit';
      // Red Dot: status damage and Zoom hits always reach it, Overheated takes +50 percent
      if (tgt.flags.aoeReach) {
        if (tgt.untargetable && ((o && o.zoom) || kind === 'direct' || kind === 'shatter')) o = Object.assign({}, o, { force: true });
        if (tgt.statuses.overheated && kind === 'hit') o = Object.assign({}, o, { pct: ((o && o.pct) || 0) + 50 });
      }
      // Spray Bottle Duelist: Parry turns the first hit of the round back at the attacker
      if (tgt.flags.parry && tgt.stance === 'Parry' && kind === 'hit' && base > 0 && tgt.parryRound !== this.S.round) {
        tgt.parryRound = this.S.round;
        var att = o && o.src && o.src.kind === 'cat' ? o.src : null;
        this.emit('damage', { uid: tgt.uid, amount: 0, prevented: true, parried: true, floor: tgt.floor, pos: tgt.pos, side: 'pest', from: att ? att.uid : null });
        this.toast(tgt.name + ' parries');
        if (att && !att.dead && !att.removed) this.addStatus(att, 'wet', 2, { src: 'parry' });
        return 0;
      }
    }
    return origDamageFn.call(this, tgt, base, o);
  };

  var origAddStatus = BP.addStatus;
  BP.addStatus = function (u, id, n, o) {
    if (u && u.kind === 'cat' && n > 0 && (id === 'rested' || id === 'hidden')) {
      var fl = this.S.floors[u.floor];
      if (fl && fl.hazards && fl.hazards.sterile_lights) return 0;
    }
    var r = origAddStatus.apply(this, arguments);
    if (r > 0 && id === 'wet' && u && u.kind === 'cat' && (u.statuses.wet || 0) >= 3 && u.soakRound !== this.S.round) {
      var self = this;
      if (this.livePests().some(function (q) { return q.flags && q.flags.soaked; })) {
        u.soakRound = this.S.round;
        origAddStatus.call(this, u, 'scared', 1, { src: 'soaked' });
      }
    }
    return r;
  };

  var origCanNap = BP.canNap;
  BP.canNap = function (cat, forced) {
    if (!forced && cat && cat.statuses && cat.statuses.fixated) return { ok: false, reason: 'Fixated on the dot' };
    return origCanNap.apply(this, arguments);
  };
  // fixate is used on cats by the Red Dot
  (function () {
    var d = E.statuses.get('fixated');
    if (d) d.side = ['cat', 'pest'];
  })();

  var origRecalc = BP.recalc;
  BP.recalc = function () {
    var r = origRecalc.apply(this, arguments);
    this.pests().forEach(function (p) { if (p.flags && p.flags.dotReal) p.untargetable = !(p.statuses.overheated || p.statuses.yarn); });
    return r;
  };

  // Zoom is the one thing besides AoE and status damage that reaches the Red Dot (RULES section 10, ruling 5)
  BP.zoomAttack = function (cat) {
    var all = this.livePests().filter(function (p) { return !p.removed && ((!p.untargetable && !p.traitSet.untargetable) || (p.flags && p.flags.aoeReach)); });
    if (!all.length || cat.dead) return false;
    var tgt = all.length > 1 ? this.pickOne(all) : all[0];
    var pw = Math.ceil(this.atk(cat) / rv('zoom_damage_divisor', 2));
    cat.zoomedRound = this.S.round;
    this.emit('zoom', { uid: cat.uid, floor: cat.floor, pos: cat.pos, to: tgt.uid, toFloor: tgt.floor, toPos: tgt.pos });
    this.catHit(cat, tgt, pw, { kind: 'zoom', zoom: true, ranged: true });
    this.fire('onAnyZoom', { subject: cat, target: tgt, floor: cat.floor });
    this.fire('onZoom', { subject: cat, target: tgt, floor: cat.floor });
    this.drain();
    return true;
  };

  var origExecOp = BP.execOp;
  BP.execOp = function (op, ctx, e, name) {
    var dots = null;
    if (e && AOE[e.target]) {
      // Suds: an AoE reveals the pests hiding in the suds (on the floor for the OnFloor targets, everywhere otherwise)
      var fl = /OnFloor$/.test(e.target) ? this.ctxFloor(ctx) : null, rev = false;
      this.pests().forEach(function (p) { if (p._sudsHid && (fl === null || p.floor === fl)) { p.sudsRevealed = true; rev = true; } });
      if (rev) this.recalc();
      dots = this.livePests().filter(function (p) { return p.flags && p.flags.aoeReach && p.untargetable; });
      dots.forEach(function (p) { p.untargetable = false; });
    }
    try { return origExecOp.call(this, op, ctx, e, name); }
    finally { if (dots) dots.forEach(function (p) { p.untargetable = true; }); }
  };

  // Start of Cat Attacks hazards: Draft (last cat swaps with the front cat) and Suds (cats shuffle)
  var origDiscardHand = BP.discardHand;
  BP.discardHand = function () {
    var r = origDiscardHand.apply(this, arguments);
    var B = this;
    B.S.floors.forEach(function (f, fi) {
      if (f.cats.length < 2) return;
      if (f.hazards.draft) {
        var first = f.cats[0], last = f.cats[f.cats.length - 1];
        f.cats[0] = last; f.cats[f.cats.length - 1] = first;
        B.reindex(fi); B.touch();
        B.emit('move', { uid: last.uid, side: 'cat', from: fi, to: fi, kind: 'shove', pos: 0 });
      } else if (f.hazards.suds) {
        B.rng.shuffle(f.cats);
        B.reindex(fi); B.touch();
      }
    });
    return r;
  };

  E.boss = { normMeters: normMeters, trappedBy: trappedBy, spit: spit, jamCheck: jamCheck, syncFlood: syncFlood, armDawn: armDawn };
})();
