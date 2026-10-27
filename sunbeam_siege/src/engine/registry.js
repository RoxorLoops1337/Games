/* SUNBEAM SIEGE effect registries (agent C1). SB.engine.{ops,triggers,checks,counters,targets,statuses,...}.
 * Other files may add content with, for example:
 *   SB.engine.ops.register('myOp', function (ctx, e, B) { ... });
 *   SB.engine.checks.register('myCheck', function (ctx, c, B, arg) { return value; });
 *   SB.engine.counters.register('myCounter', function (ctx, expr, B) { return number; });
 *   SB.engine.targets.register('myTarget', function (ctx, e, B) { return [unit, ...]; });
 * See design/C1-engine-notes.md.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var U = SB.util;
  var E = SB.engine = SB.engine || {};

  function rv(key, dflt) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : dflt; }

  // ---- registry factory -------------------------------------------------------------
  function makeReg(name, opts) {
    opts = opts || {};
    var items = {}, meta = {};
    var reg = {
      name: name,
      register: function (n, v, m) {
        if (typeof n === 'object') { Object.keys(n).forEach(function (k) { reg.register(k, n[k]); }); return reg; }
        items[n] = (v === undefined ? true : v); if (m) meta[n] = m; return reg;
      },
      alias: function (a, target) { items[a] = items[target]; if (meta[target]) meta[a] = meta[target]; return reg; },
      get: function (n) { n = opts.strip ? opts.strip(n) : n; return Object.prototype.hasOwnProperty.call(items, n) ? items[n] : undefined; },
      has: function (n) { n = opts.strip ? opts.strip(n) : n; if (opts.prefix && typeof n === 'string') { var ix = n.indexOf(':'); if (ix > 0 && opts.prefix[n.slice(0, ix)]) return true; } return Object.prototype.hasOwnProperty.call(items, n); },
      meta: function (n) { return meta[n]; },
      names: function () { return Object.keys(items); }
    };
    return reg;
  }
  E.makeReg = makeReg;

  E.ops = makeReg('ops');
  E.checks = makeReg('checks', { prefix: { targetHasStatus: 1, selfHasStatus: 1, cardKeyword: 1, cardTag: 1 } });
  E.counters = makeReg('counters');
  E.targets = makeReg('targets');
  E.statuses = makeReg('statuses');
  E.floorStatuses = makeReg('floorStatuses');
  E.keywords = makeReg('keywords');
  E.picks = makeReg('picks');
  E.conds = makeReg('conds');
  E.actions = makeReg('actions');
  E.patterns = makeReg('patterns');
  E.floorsSpecs = makeReg('floorsSpecs');
  E.passives = makeReg('passives', { prefix: { rule: 1 } });
  E.mods = makeReg('mods', { prefix: { rule: 1 } });
  E.upgradeOps = makeReg('upgradeOps');
  E.flags = makeReg('flags', { prefix: { rule: 1, meter: 1, requires: 1, when2: 1, limit: 1 } });
  E.stats = makeReg('stats', { prefix: { aura: 1 } });
  E.hazards = makeReg('hazards');
  E.hooks = makeReg('hooks');
  E.winIf = makeReg('winIf');
  E.traits = makeReg('traits');
  E.durations = makeReg('durations');

  // ---- triggers ------------------------------------------------------------------------
  // scope: 'self' (only the subject's own effects), 'any' (rooms on the event floor, cats everywhere), 'floor', 'global'
  var TRIG_ALIAS = {
    onFightStart: 'onBattleStart', fightStart: 'onBattleStart', onFightEnd: 'onBattleEnd', fightEnd: 'onBattleEnd',
    turnStart: 'onTurnStart', turnEnd: 'onTurnEnd', onWitching: 'onWitchingHour', onHit: 'onHit', onLifeSpent: 'onLifeLost',
    onPounceKilled: 'onPounceKill', onDeathOfPest: 'onAnyPestDeath', onNapStart: 'onNap', onZoomies: 'onWitchingHour'
  };
  E.normTrigger = function (n) {
    if (typeof n !== 'string') return n;
    if (n.indexOf('pest:') === 0) n = n.slice(5);
    return TRIG_ALIAS[n] || n;
  };
  var HOOK_ALIAS = { onLifeLost: 'onAnyLifeLost', onLifeSpent: 'onAnyLifeSpent', onNapStart: 'onNap', onDeath: 'onAnyDeath', onNapTick: 'onDusk', onBoxPlaced: 'onBoxPlaced', onKnock: 'onKnock', onZoom: 'onAnyZoom',
    onPounce: 'onPounce', onNightPhase: 'onWitchingHour', onFinalDeath: 'onFinalDeath', onSpawn: 'onSpawn' };
  E.normHook = function (n) { return HOOK_ALIAS[n] || E.normTrigger(n); };

  E.triggers = makeReg('triggers', { strip: function (n) { return E.normTrigger(n); } });
  var T = E.triggers;
  var selfT = ['onAttack', 'onCatAttack', 'onKill', 'onPounceKill', 'onDamaged', 'onDeath', 'onNap', 'onWake', 'onLifeLost', 'onUnbox', 'onKnockedOff', 'onKnocked',
    'onHit', 'onHitBy', 'onPounce', 'onBoxEnter', 'onStatusApplied', 'onSpawn', 'onKneadTriggered', 'onReborn', 'onFinalDeath', 'onIdle', 'onPlay', 'onFightEnd', 'onDeathEffects',
    'onEtherealPrevent', 'onMeter', 'onYarnBreak', 'onBoxFlattened', 'onShatter', 'onKnock', 'onPestAttack', 'onPestIdle'];
  selfT.forEach(function (n) { T.register(n, { scope: 'self' }); });
  ['onCatDeployed', 'onAllyDeath', 'onEnemyEnter', 'onKnockLand', 'onAnyEnemyLanded', 'onAnyCornered', 'onToyPlaced', 'onSummon', 'onBoxPlaced'].forEach(function (n) { T.register(n, { scope: 'any', notSelf: n === 'onCatDeployed' }); });
  ['onAnyLifeLost', 'onAnyLifeSpent', 'onAnyLifeWouldBeLost', 'onAnyZoom', 'onZoom', 'onAnyBoxFlattened', 'onAnyFlapExit', 'onAnyPestDeath', 'onAnyDeath', 'onAnyDogDeath', 'onPestClimb', 'onSunbeamHit', 'onMarkedKill', 'onHornetDeath'].forEach(function (n) { T.register(n, { scope: 'any' }); });
  ['onTurnStart', 'onTurnEnd', 'onBattleStart', 'onBattleEnd', 'onDusk', 'onWitchingHour', 'onSurgeStart', 'onSurge', 'onCrashStart', 'onHairballCreated', 'onCardPlayed', 'onDrawn', 'onTurnEndInHand', 'onDiscard', 'onExhaust', 'onShuffle',
    'onSpawnPhase', 'onLoss', 'onActStart', 'onShopEnter', 'onPestPhaseStart', 'onPestPhaseEnd', 'onRoundStart', 'onNightPhase', 'onNipGain', 'onPickup', 'onBank', 'onNapTick'].forEach(function (n) { T.register(n, { scope: 'global' }); });
  T.allowRemoved = function (n) { return ['onDeath', 'onFinalDeath', 'onAllyDeath', 'onAnyPestDeath', 'onAnyDeath', 'onKnocked', 'onDeathEffects', 'onLifeLost'].indexOf(n) >= 0; };
  // triggers that only the card-level machinery uses
  T.register('onPlay', { scope: 'self' });

  // ---- statuses ---------------------------------------------------------------------------
  var S = E.statuses;
  function st(id, kind, max, side, tone, extra) { S.register(id, Object.assign({ id: id, kind: kind, max: max, side: side, tone: tone }, extra || {})); }
  st('claws', 'I', 30, ['cat'], 'buff');
  st('purr', 'I', 40, ['cat'], 'buff');
  st('fluff', 'I', 50, ['cat', 'pest'], 'buff');
  st('hide', 'I', 50, ['cat', 'pest'], 'buff');
  st('rested', 'I', 6, ['cat'], 'buff');
  st('hidden', 'S', 1, ['cat'], 'buff');
  st('bristle', 'I', 15, ['cat', 'pest'], 'buff');
  st('frenzy', 'ID', 5, ['cat'], 'buff');
  st('catnip', 'I', 10, ['cat'], 'buff');
  st('crash', 'D', 4, ['cat'], 'debuff');
  st('rage', 'I', 20, ['pest'], 'buff');
  st('wet', 'D', 6, ['cat', 'pest'], 'debuff');
  st('scared', 'D', 3, ['cat', 'pest'], 'debuff');
  st('dizzy', 'ID', 20, ['cat', 'pest'], 'debuff');
  st('frazzled', 'D', 3, ['cat', 'pest'], 'debuff');
  st('hiss', 'ID', 10, ['pest'], 'debuff');
  st('yarn', 'D', 4, ['pest'], 'debuff');
  st('marked', 'I', 5, ['pest'], 'debuff');
  st('hairball', 'I', 15, ['pest'], 'debuff');
  st('spooked', 'D', 3, ['cat', 'pest'], 'debuff');
  st('dull', 'D', 3, ['cat', 'pest'], 'debuff');
  st('ethereal', 'S', 1, ['cat'], 'buff');
  st('leashed', 'S', 1, ['pest'], 'debuff');
  st('groomed_ruined', 'S', 1, ['pest'], 'debuff');
  st('shamed', 'S', 1, ['cat'], 'debuff');
  st('coned', 'D', 3, ['cat'], 'debuff');
  st('foil', 'S', 1, ['cat', 'pest'], 'debuff');
  st('overheated', 'D', 3, ['cat', 'pest'], 'debuff');
  st('fixated', 'D', 3, ['pest'], 'buff');
  st('itch', 'ID', 20, ['pest'], 'debuff');
  st('puddle', 'I', 3, ['cat', 'pest'], 'debuff');
  st('cozy', 'I', 4, ['cat'], 'buff');
  st('decoy', 'S', 1, ['cat'], 'buff');
  st('shade', 'I', 99, ['cat'], 'buff');
  st('napping', 'S', 1, ['cat'], 'buff');

  // dusk tick handlers ---------------------------------------------------------------------
  function eachUnit(B, fn) { B.allUnits().slice().forEach(function (u) { if (!u.removed && !u.dead) fn(u); }); }
  S.get('wet').dusk = function (B) {
    eachUnit(B, function (u) {
      if (!u.statuses.wet) return;
      var dry = (u.kind === 'cat' && u.floor === 2) ? 2 : 1;
      var fl = B.S.floors[u.floor]; if (fl && fl.statuses.heat_lamp) dry = 2;
      B.removeStatus(u, 'wet', dry);
    });
    B.S.floors.forEach(function (f, fi) {
      if (f.statuses.puddle) {
        f.cats.forEach(function (c) { B.addStatus(c, 'wet', 1, { force: true }); });
        if (f.statuses.heat_lamp || fi === 2) delete f.statuses.puddle; else B.addFloorStatus(f, 'puddle', -1);
      }
    });
  };
  S.get('dizzy').dusk = function (B) {
    eachUnit(B, function (u) {
      var d = u.statuses.dizzy; if (!d) return;
      B.damage(u, d, { kind: 'direct', srcId: 'dizzy', noWake: true, noBristle: true });
      B.removeStatus(u, 'dizzy', 1);
    });
  };
  ['scared', 'frazzled', 'hiss', 'spooked', 'dull', 'crash', 'coned', 'overheated', 'fixated'].forEach(function (id) {
    S.get(id).dusk = function (B) { eachUnit(B, function (u) { if (u.statuses[id]) B.removeStatus(u, id, 1); }); };
  });
  S.get('yarn').dusk = function (B) {
    eachUnit(B, function (u) { if (u.statuses.yarn) { B.removeStatus(u, 'yarn', 1); if (!u.statuses.yarn) B.fire('onYarnBreak', { subject: u, floor: u.floor }); } });
    // frenzy decays with the same tick window
    B.cats().forEach(function (c) { if (c.statuses.frenzy) B.removeStatus(c, 'frenzy', 1); });
  };
  S.get('hairball').dusk = function (B) {
    eachUnit(B, function (u) {
      var h = u.statuses.hairball; if (!h) return;
      B.damage(u, h, { kind: 'direct', srcId: 'hairball', noBristle: true });
      if (u.kind === 'pest' && u.statuses.wet) {
        var half = Math.floor(h / 2);
        if (half > 0) B.S.floors[u.floor].pests.forEach(function (q) { if (q !== u && !q.dead && Math.abs(q.pos - u.pos) === 1) B.addStatus(q, 'hairball', half); });
      }
      B.removeStatus(u, 'hairball', Math.floor(h / 2));
    });
    // itch
  };
  S.get('purr').dusk = function (B) {
    var th = rv('purr_thresholds', [5, 10, 20, 30, 40]);
    B.S.floors.forEach(function (f, fi) {
      var P = f.statuses.purr || 0;
      // cats' own Purr statuses count toward the floor aura
      if (!P) return;
      var heal = Math.ceil(P / rv('purr_heal_divisor', 2));
      if (P >= th[0]) heal += rv('purr_threshold_5_extra_heal', 1);
      if (P >= th[4]) heal += rv('purr_threshold_40_extra_heal', 3);
      f.cats.forEach(function (c) { if (!c.dead) { B.heal(c, heal, { kind: 'purr' }); if (P >= th[2]) B.addFluff(c, rv('purr_threshold_20_fluff', 1)); } });
      if (P >= th[1]) f.pests.forEach(function (p) { if (p.statuses.rage) B.removeStatus(p, 'rage', rv('purr_threshold_10_rage_strip', 1)); });
      if (fi === 2) {
        var sh = Math.min(rv('sunbeam_purr_heal_cap', 3), Math.floor(P / rv('sunbeam_purr_divisor', 10)));
        if (sh > 0) B.addWarmth(sh);
      }
      B.emit('purr', { floor: fi, total: P });
      var every = B.mod('purrDecayEvery', 0);
      if (!every || B.S.round % every === 0) B.addFloorStatus(f, 'purr', -rv('purr_decay_per_round', 1));
    });
  };
  S.get('rested').dusk = function (B) {
    var max = rv('rested_max', 4) + B.mod('maxRested', 0);
    B.cats().forEach(function (c) {
      if (!c.napping || c.dead) return;
      B.heal(c, rv('nap_heal_per_round', 2) + (c.flags.napHealBonus || 0));
      var gain = rv('rested_gain_per_round', 1) + (B.S.floors[c.floor].statuses.heat_lamp ? 1 : 0) + (c.kw.deepsleep ? 1 : 0);
      if (B.S.floors[c.floor].statuses.foil) gain = 0;
      var cur = c.statuses.rested || 0;
      var add = Math.min(max - cur, gain);
      c.statusCaps.rested = max - rv('rested_max', 4);
      if (add > 0) { c.statuses.rested = cur + add; B.emit('status', { uid: c.uid, status: 'rested', amount: add, total: cur + add, floor: c.floor, pos: c.pos, side: 'cat', kind: 'add' }); B.statMax('maxRested', cur + add); }
      B.fire('onNapTick', { subject: c, floor: c.floor });
    });
  };
  S.get('rage').dusk = function (B) {
    B.pests().forEach(function (p) {
      if (p.dead) return;
      var r = p.statuses.rage || 0;
      if (r >= rv('rage_fluff_threshold', 5)) B.addFluff(p, r);
    });
  };

  // floor statuses
  ['purr', 'hairball', 'puddle', 'foil', 'heat_lamp', 'clutter', 'suds', 'draft', 'rat_tide', 'laser_zone', 'sterile_lights'].forEach(function (id) { E.floorStatuses.register(id, { max: id === 'purr' ? rv('purr_cap', 40) : 99 }); });
  // durations
  ['fight', 'turn', 'played', 'run', 'next'].forEach(function (d) { E.durations.register(d, true); });

  // ---- targets ---------------------------------------------------------------------------------
  var TG = E.targets;
  var PLAYER = { kind: 'player', uid: 'player', floor: 0 };
  function fl(B, ctx) { return B.ctxFloor(ctx); }
  function lc(B) { return B.cats().filter(function (c) { return !c.dead && !c.removed; }); }
  function lp(B) { return B.livePests().filter(function (p) { return !p.removed && !p.untargetable; }); }
  function catsOn(B, f) { return B.S.floors[f].cats.filter(function (c) { return !c.dead && !c.removed; }); }
  function pestsOn(B, f) { return (B.S.floors[f] ? B.S.floors[f].pests : []).filter(function (p) { return !p.dead && !p.removed && !p.untargetable; }); }
  function one(x) { return x ? [x] : []; }
  function pick(B, list) { return list.length ? one(B.pickOne(list)) : []; }
  function floorRef(B, i) { return B.S.floors[i]; }
  function cardRefs(B, uids) { return uids.map(function (u) { return { kind: 'card', uid: u }; }); }
  function tgtUnit(ctx) { return (ctx.data && ctx.data.target) || ctx.target || null; }

  TG.register('self', function (c) { return one(c.self && !c.self.removed ? c.self : (c.self && c.self.kind === 'cat' ? c.self : null)); });
  TG.register('player', function () { return [PLAYER]; });
  TG.register('sunbeam', function () { return [PLAYER]; });
  TG.register('triggerSource', function (c) { return one(c.subject); });
  TG.register('attackTarget', function (c) { var t = tgtUnit(c); return one(t); });
  TG.register('hitCat', function (c) { return one(tgtUnit(c)); });
  TG.register('attacker', function (c) { return one(tgtUnit(c)); });
  TG.register('triggerSourceKiller', function (c) { return one(c.killer); });
  TG.register('chosenCat', function (c, e, B) { return one(c.choice && c.choice.catUid ? B.catByUid(c.choice.catUid) : (c.target && c.target.kind === 'cat' ? c.target : null)); });
  TG.register('chosenEnemy', function (c, e, B) { return one(c.choice && c.choice.pestUid ? B.pestByUid(c.choice.pestUid) : (c.target && c.target.kind === 'pest' ? c.target : null)); });
  TG.register('chosenFloor', function (c, e, B) { return one(floorRef(B, fl(B, c))); });
  TG.register('thisFloor', function (c, e, B) { return one(floorRef(B, fl(B, c))); });
  TG.register('floorBelow', function (c, e, B) { var f = fl(B, c) - 1; return f >= 0 ? one(floorRef(B, f)) : []; });
  TG.register('allFloors', function (c, e, B) { return B.S.floors.slice(); });
  TG.register('otherFloors', function (c, e, B) { var f = fl(B, c); return B.S.floors.filter(function (x) { return x.index !== f; }); });
  TG.register('fullestFloor', function (c, e, B) {
    var best = null, n = -1; B.S.floors.forEach(function (f) { var k = catsOn(B, f.index).length; if (k > n) { n = k; best = f; } }); return one(best);
  });
  TG.register('allCats', function (c, e, B) { return lc(B); });
  TG.register('allCatsOnFloor', function (c, e, B) { return catsOn(B, fl(B, c)); });
  TG.register('otherCatsOnFloor', function (c, e, B) { return catsOn(B, fl(B, c)).filter(function (x) { return x !== c.self; }); });
  TG.register('adjacentCats', function (c, e, B) {
    var s = c.self; if (!s || s.kind !== 'cat') return [];
    return catsOn(B, s.floor).filter(function (x) { return Math.abs(x.pos - s.pos) === 1; });
  });
  TG.register('frontCat', function (c, e, B) { var l = catsOn(B, fl(B, c)); return one(l[0]); });
  TG.register('front', function (c, e, B) { var l = catsOn(B, fl(B, c)); return one(l[0]); });
  TG.register('randomCat', function (c, e, B) { return pick(B, lc(B)); });
  TG.register('randomCatOnFloor', function (c, e, B) { return pick(B, catsOn(B, fl(B, c))); });
  TG.register('weakestCat', function (c, e, B) {
    var l = catsOn(B, fl(B, c)); if (!l.length) l = lc(B);
    var best = null; l.forEach(function (x) { if (!best || x.health < best.health) best = x; }); return one(best);
  });
  TG.register('highestAttackCat', function (c, e, B) {
    var l = lc(B), best = null; l.forEach(function (x) { if (!best || B.atk(x) > B.atk(best)) best = x; }); return one(best);
  });
  function napping(c, e, B) {
    var l = c.self && c.self.kind === 'pest' ? catsOn(B, c.self.floor) : lc(B);
    return l.filter(function (x) { return x.napping; });
  }
  ['napping', 'nappingCats', 'napingCats'].forEach(function (n) { TG.register(n, napping); });
  TG.register('boxedCatsOnFloor', function (c, e, B) { return catsOn(B, fl(B, c)).filter(function (x) { return x.boxed; }); });
  TG.register('champion', function (c, e, B) { return lc(B).filter(function (x) { return x.champion; }); });
  TG.register('trapped', function (c, e, B) { var s = c.self; if (!s || !s.trapped) return []; return s.trapped.map(function (u) { return B.catByUid(u); }).filter(Boolean); });

  TG.register('allEnemies', function (c, e, B) { return lp(B); });
  TG.register('allPests', function (c, e, B) { return lp(B); });
  TG.register('allEnemiesOnFloor', function (c, e, B) { return pestsOn(B, fl(B, c)); });
  TG.register('allPestsOnFloor', function (c, e, B) { return pestsOn(B, fl(B, c)); });
  TG.register('otherEnemiesOnFloor', function (c, e, B) { return pestsOn(B, fl(B, c)).filter(function (x) { return x !== c.self; }); });
  TG.register('otherPestsOnFloor', function (c, e, B) { return pestsOn(B, fl(B, c)).filter(function (x) { return x !== c.self; }); });
  TG.register('frontEnemy', function (c, e, B) { return one(pestsOn(B, fl(B, c))[0]); });
  TG.register('frontEnemyBelow', function (c, e, B) { var f = fl(B, c) - 1; return f >= 0 ? one(pestsOn(B, f)[0]) : []; });
  TG.register('frontEnemyAboveFloor', function (c, e, B) { var f = fl(B, c) + 1; return f < B.numFloors ? one(pestsOn(B, f)[0]) : []; });
  TG.register('frontEnemyEachFloor', function (c, e, B) { var out = []; for (var f = 0; f < B.numFloors; f++) { var p = pestsOn(B, f)[0]; if (p) out.push(p); } return out; });
  TG.register('randomEnemy', function (c, e, B) { return pick(B, lp(B)); });
  TG.register('randomEnemyOnFloor', function (c, e, B) { return pick(B, pestsOn(B, fl(B, c))); });
  TG.register('randomOtherEnemyOnFloor', function (c, e, B) { return pick(B, pestsOn(B, fl(B, c)).filter(function (x) { return x !== c.self && x !== c.subject; })); });
  function byHp(B, list) { return list.slice().sort(function (a, b) { return (b.hp + b.fluff) - (a.hp + a.fluff) || a.floor - b.floor || a.pos - b.pos; }); }
  TG.register('strongestEnemy', function (c, e, B) { return one(byHp(B, lp(B))[0]); });
  TG.register('secondStrongestEnemy', function (c, e, B) { return one(byHp(B, lp(B))[1]); });
  TG.register('yarnedEnemiesOnFloor', function (c, e, B) { return pestsOn(B, fl(B, c)).filter(function (x) { return x.statuses.yarn; }); });
  TG.register('allDogs', function (c, e, B) { return lp(B).filter(function (x) { return B.hasTrait(x, 'dog'); }); });
  TG.register('otherDogsOnFloor', function (c, e, B) { return pestsOn(B, fl(B, c)).filter(function (x) { return x !== c.self && B.hasTrait(x, 'dog'); }); });
  TG.register('leashedDogs', function (c, e, B) { return lp(B).filter(function (x) { return x.statuses.leashed; }); });
  TG.register('splashTargets', function (c, e, B) { var t = tgtUnit(c); if (!t) return []; return pestsOn(B, t.floor).filter(function (x) { return x !== t && Math.abs(x.pos - t.pos) === 1; }); });
  TG.register('chasers', function (c, e, B) { return lp(B).filter(function (x) { return B.hasTrait(x, 'chaser'); }); });
  // cards
  TG.register('hand', function (c, e, B) { return cardRefs(B, B.S.hand.map(function (h) { return h.uid; })); });
  TG.register('firstCardInHand', function (c, e, B) { return B.S.hand.length ? cardRefs(B, [B.S.hand[0].uid]) : []; });
  TG.register('hairballsInHand', function (c, e, B) { return cardRefs(B, B.S.hand.filter(function (h) { return B.S.cards[h.uid].id === 'curse_hairball'; }).map(function (h) { return h.uid; })); });
  TG.register('firstToyInHand', function (c, e, B) { var h = B.S.hand.filter(function (x) { return B.S.cards[x.uid].eff.type === 'toy'; })[0]; return h ? cardRefs(B, [h.uid]) : []; });
  TG.register('thisCard', function (c, e, B) { return c.cardUid ? cardRefs(B, [c.cardUid]) : []; });

  // ---- checks ---------------------------------------------------------------------------------------
  var CK = E.checks;
  function selfOrSubject(c) { return c.self || c.subject; }
  CK.register('selfLives', function (c) { var s = selfOrSubject(c); return s ? s.lives : 0; });
  CK.register('targetLives', function (c) { var t = c.subject || tgtUnit(c); return t && t.lives !== undefined ? t.lives : 0; });
  CK.register('targetDied', function (c) { var t = c.subject || tgtUnit(c); return !!(t && (t.dead || t.removed)); });
  CK.register('pileSize', function (c, e, B) { var s = selfOrSubject(c); return s && s.kind === 'cat' ? B.pileSizeOf(s) : 0; });
  CK.register('selfNapping', function (c) { var s = selfOrSubject(c); return !!(s && s.napping); });
  CK.register('selfAsleep', function (c) { var s = selfOrSubject(c); return !!(s && s.napping); });
  CK.register('purrOnFloor', function (c, e, B) { return B.floorStatus(fl(B, c), 'purr'); });
  CK.register('hasBox', function (c, e, B) { return B.boxesOnFloor(fl(B, c)) > 0; });
  CK.register('boxesOnFloor', function (c, e, B) { return B.boxesOnFloor(fl(B, c)); });
  CK.register('selfInBox', function (c) { var s = selfOrSubject(c); return !!(s && s.boxed); });
  CK.register('targetInBox', function (c) { var t = c.target || tgtUnit(c) || c.subject; return !!(t && t.boxed); });
  CK.register('crashing', function (c, e, B) { return B.S.nip.crash > 0; });
  CK.register('triggerOnThisFloor', function (c, e, B) { var s = c.subject; return !!(s && c.self && s.floor === c.self.floor); });
  CK.register('bank', function (c, e, B) { return B.S.bank; });
  CK.register('targetMarked', function (c) { var t = c.subject || tgtUnit(c); return !!(t && t.statuses && t.statuses.marked); });
  CK.register('targetFloor', function (c) { var t = c.subject || tgtUnit(c); return t ? t.floor + 1 : 0; });
  CK.register('selfClaws', function (c) { var s = selfOrSubject(c); return s && s.statuses ? (s.statuses.claws || 0) : 0; });
  CK.register('selfPower', function (c, e, B) { var s = selfOrSubject(c); return s && s.kind === 'cat' ? B.atk(s) : 0; });
  CK.register('targetPower', function (c, e, B) { var t = c.filterUnit || c.subject || tgtUnit(c); return t && t.kind === 'cat' ? B.atk(t) : (t && t.kind === 'pest' ? B.pestBonus(t) + (t.nextAction && t.nextAction.dmg || 0) : 0); });
  CK.register('targetIsBoss', function (c) { var t = c.filterUnit || c.subject || tgtUnit(c); return !!(t && t.boss); });
  CK.register('targetIsElite', function (c) { var t = c.filterUnit || c.subject || tgtUnit(c); return !!(t && t.tier === 'elite'); });
  CK.register('playedCardId', function (c, e, B) { return c.card ? c.card.id : (c.data && c.data.card ? c.data.card.id : ''); });
  CK.register('cardId', function (c) { var cd = c.card || (c.data && c.data.card); return cd ? cd.id : ''; });
  CK.register('cardType', function (c) { var cd = c.card || (c.data && c.data.card); return cd ? cd.type : ''; });
  CK.register('cardCost', function (c) { var cd = c.card || (c.data && c.data.card); return cd ? cd.cost : 0; });
  CK.register('cardKeyword:*', function (c, e, B, arg) { var cd = c.card || (c.data && c.data.card); return !!(cd && cd.keywords && cd.keywords[arg]); });
  CK.register('cardTag:*', function (c, e, B, arg) { var cd = c.card || (c.data && c.data.card); return !!(cd && cd.tags && cd.tags.indexOf(arg) >= 0); });
  CK.register('cardsPlayedThisTurn', function (c, e, B) { return B.S.cardsPlayedThisTurn; });
  CK.register('catsOnFloor', function (c, e, B) { return catsOn(B, fl(B, c)).length; });
  CK.register('napsThisTurn', function (c, e, B) { return B.S.napsThisTurn; });
  CK.register('nappingCats', function (c, e, B) { return lc(B).filter(function (x) { return x.napping; }).length; });
  CK.register('selfHasStatus:*', function (c, e, B, arg) { var s = selfOrSubject(c); return !!(s && s.statuses && s.statuses[arg]); });
  CK.register('targetHasStatus:*', function (c, e, B, arg) { var t = c.filterUnit || c.subject || tgtUnit(c); return !!(t && t.statuses && t.statuses[arg]); });
  CK.register('handSize', function (c, e, B) { return B.S.hand.length; });
  CK.register('playedThisFight', function (c, e, B) { return B.S.playedFight[e.card || e.id] || 0; });
  CK.register('isWitchingHour', function (c, e, B) { return !!B.S.clock.isWitching; });
  CK.register('fightType', function (c, e, B) { return B.S.fightType; });
  CK.register('round', function (c, e, B) { return B.S.round; });
  CK.register('warmth', function (c, e, B) { return B.S.sunbeam.warmth; });
  CK.register('counter', function (c) { var r = c.src && c.src.relic; return r && r.counter ? r.counter : 0; });
  CK.register('counterMod8', function (c) { var r = c.src && c.src.relic; return r && r.counter ? r.counter % 8 : 0; });
  CK.register('statusId', function (c) { return c.data ? c.data.status : ''; });
  CK.register('hpBelowHalfOnce', function (c, e, B) { var s = selfOrSubject(c); return !!(s && s.kind === 'pest' && s.hp * 2 < s.maxHp && !s.counters.halfOnce && (s.counters.halfOnce = 1)); });
  CK.register('anyCatWetOnFloor', function (c, e, B) { return catsOn(B, fl(B, c)).some(function (x) { return x.statuses.wet; }); });
  CK.register('targetPowerCmp', function () { return 0; });

  // ---- counters (AmountExpr per:) ----------------------------------------------------------------------------
  var CN = E.counters;
  CN.register('livesMissing', function (c) { var s = selfOrSubject(c); return s ? Math.max(0, s.maxLives - s.lives) : 0; });
  CN.register('selfClaws', function (c) { var s = selfOrSubject(c); return s && s.statuses ? (s.statuses.claws || 0) : 0; });
  CN.register('maxClaws', function (c, e, B) { var m = 0; lc(B).forEach(function (x) { m = Math.max(m, x.statuses.claws || 0); }); return m; });
  CN.register('lastSpent', function (c, e, B) { return B.S.lastSpent || 0; });
  CN.register('adjacentCats', function (c, e, B) { return TG.get('adjacentCats')(c, e, B).length; });
  CN.register('catsOnFloor', function (c, e, B) { return catsOn(B, fl(B, c)).length; });
  CN.register('otherCatsOnFloor', function (c, e, B) { return Math.max(0, catsOn(B, fl(B, c)).length - (c.self && c.self.kind === 'cat' ? 1 : 0)); });
  CN.register('fluffOnSelf', function (c) { var s = selfOrSubject(c); return s ? (s.fluff || 0) : 0; });
  CN.register('selfFluff', function (c) { var s = selfOrSubject(c); return s ? (s.fluff || 0) : 0; });
  CN.register('restedOnSelf', function (c) { var s = selfOrSubject(c); return s && s.statuses ? (s.statuses.rested || 0) : 0; });
  CN.register('rested', function (c, e, B) { var s = selfOrSubject(c); return s && s.statuses ? (s.statuses.rested || 0) : U.sum(lc(B), function (x) { return x.statuses.rested || 0; }); });
  CN.register('restedOnFloor', function (c, e, B) { return U.sum(catsOn(B, fl(B, c)), function (x) { return x.statuses.rested || 0; }); });
  CN.register('purrOnFloor', function (c, e, B) { return B.floorStatus(fl(B, c), 'purr'); });
  CN.register('pileSize', function (c, e, B) { var s = selfOrSubject(c); return s && s.kind === 'cat' ? B.pileSizeOf(s) : 0; });
  CN.register('nappingCats', function (c, e, B) { return lc(B).filter(function (x) { return x.napping; }).length; });
  CN.register('napping', function (c, e, B) { return lc(B).filter(function (x) { return x.napping; }).length; });
  CN.register('yarnOnTarget', function (c) { var t = c.subject || tgtUnit(c) || (c.choice && c.choice.pestUid && c.B.pestByUid(c.choice.pestUid)); return t && t.statuses ? (t.statuses.yarn || 0) : 0; });
  CN.register('targetYarn', function (c) { var t = c.subject || tgtUnit(c) || (c.choice && c.choice.pestUid && c.B.pestByUid(c.choice.pestUid)); return t && t.statuses ? (t.statuses.yarn || 0) : 0; });
  CN.register('yarnOnBoard', function (c, e, B) { return U.sum(lp(B), function (p) { return p.statuses.yarn || 0; }); });
  CN.register('yarnOnTargetFloor', function (c, e, B) { return U.sum(pestsOn(B, fl(B, c)), function (p) { return p.statuses.yarn || 0; }); });
  CN.register('hairballsInHand', function (c, e, B) { return B.S.hand.filter(function (h) { return B.S.cards[h.uid].id === 'curse_hairball'; }).length; });
  CN.register('livesSpent', function (c, e, B) { return B.S.livesSpentFight || 0; });
  CN.register('livesSpentFight', function (c, e, B) { return B.S.livesSpentFight || 0; });
  CN.register('livesSpentNow', function (c, e, B) { return B.S.lastSpent || 0; });
  CN.register('catsInDiscard', function (c, e, B) { return B.S.discard.filter(function (u) { var t = B.S.cards[u].eff.type; return t === 'unit' || t === 'champion'; }).length; });
  CN.register('corneredOnFloor', function (c, e, B) { return catsOn(B, fl(B, c)).filter(function (x) { return B.isCornered(x); }).length; });
  CN.register('bank', function (c, e, B) { return B.S.bank; });
  CN.register('selfPower', function (c, e, B) { var s = selfOrSubject(c); return s && s.kind === 'cat' ? B.atk(s) : 0; });
  CN.register('preventedDamage', function (c, e, B) { return B.S.counters.prevented || 0; });
  CN.register('x', function (c) { return c.x || 0; });
  CN.register('counter', function (c) { var r = c.src && c.src.relic; return r && r.counter ? r.counter : 0; });
  CN.register('fromStored', function (c) { return c.store && c.store.stored ? c.store.stored : 0; });
  CN.register('cardsPlayedThisFight', function (c, e, B) { return B.S.stats.cardsPlayed; });
  CN.register('nipExcess', function (c, e, B) { return B.S.nip.excess || 0; });
  CN.register('conedCats', function (c, e, B) { return lc(B).filter(function (x) { return x.statuses.coned; }).length; });
  CN.register('otherPestsOnFloor', function (c, e, B) { return Math.max(0, pestsOn(B, fl(B, c)).length - 1); });
  CN.register('round', function (c, e, B) { return B.S.round; });

  // ---- ops ---------------------------------------------------------------------------------------------
  var OP = E.ops;
  function amt(B, ctx, e, dflt) {
    var v = e.amount !== undefined ? e.amount : (e.n !== undefined ? e.n : (e.value !== undefined ? e.value : dflt));
    if (v === 'all') return 9999;
    return B.num(v === undefined ? 1 : v, ctx);
  }
  function tl(B, ctx, e, dflt) {
    var spec = e.target !== undefined ? e.target : (e.who !== undefined ? e.who : dflt);
    if (spec && typeof spec === 'object') spec = spec.who || spec.name || dflt;
    return B.targets(spec, ctx, e);
  }
  function filt(B, ctx, e, list) {
    if (!e.filter) return list;
    var f = Array.isArray(e.filter) ? e.filter : null;
    return list.filter(function (t) {
      if (e.tagFilter && !(B.hasTrait(t, e.tagFilter))) return false;
      if (f) { var c2 = Object.assign({}, ctx, { filterUnit: t, subject: ctx.subject }); return B.checkAll(f, c2); }
      return true;
    });
  }
  function tagf(B, e, list) { return e.tagFilter ? list.filter(function (t) { return t.kind === 'pest' ? B.hasTrait(t, e.tagFilter) : true; }) : list; }
  function isUnit(t) { return t && (t.kind === 'cat' || t.kind === 'pest'); }
  function srcOf(ctx) { return ctx.self && (ctx.self.kind === 'cat' || ctx.self.kind === 'pest') ? ctx.self : null; }
  function floorIdx(t) { return t && t.kind === 'floor' ? t.index : (t ? t.floor : 0); }

  OP.register('group', function (ctx, e, B) { B.runEffects(e.effects || e.do || [], ctx); });
  OP.register('damage', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1), kind = e.kind === 'shatter' ? 'shatter' : 'hit', src = srcOf(ctx);
    var list = filt(B, ctx, e, tl(B, ctx, e, 'chosenEnemy'));
    list.forEach(function (t) {
      if (t.kind === 'player') { B.hitSunbeam(n, { src: src && src.kind === 'pest' ? src : null, srcId: 'effect' }); return; }
      if (!isUnit(t)) return;
      var o = { kind: kind, src: src, noClaws: true, pierce: !!e.pierce, noAmbush: true, srcId: ctx.src && ctx.src.card ? 'card' : 'effect' };
      if (src && src.kind === 'pest') { o.melee = false; }
      if (ctx.src && ctx.src.kind === 'card') { o.src = null; }
      B.damage(t, n, o);
    });
  });
  OP.register('attack', function (ctx, e, B) {
    // each target cat attacks the front pest of its floor (used by Box Collector style champions)
    var mult = e.mult === undefined ? 1 : e.mult;
    filt(B, ctx, e, tl(B, ctx, e, 'self')).forEach(function (c) {
      if (c.kind !== 'cat' || c.dead || c.removed) return;
      var t = B.frontPest(c.floor); if (!t) return;
      if (!e.stayHidden) B.revealAttacker(c);
      B.catHit(c, t, Math.floor(B.atk(c) * mult), {});
    });
  });
  OP.register('heal', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    var spill = ctx.src && ctx.src.kind === 'room' && ctx.trigger === 'onCatDeployed';
    tagf(B, e, tl(B, ctx, e, 'self')).forEach(function (t) {
      // Treat Bowl style room heals aimed at a freshly deployed cat (always at full health) would do nothing:
      // the heal goes to the most hurt cat on that floor instead.
      if (spill && t && t.kind === 'cat' && B.getHp(t) >= B.maxHpOf(t)) {
        var hurt = B.S.floors[t.floor].cats.filter(function (c) { return !c.dead && !c.removed && B.getHp(c) < B.maxHpOf(c); })
          .sort(function (a, b) { return (B.maxHpOf(b) - B.getHp(b)) - (B.maxHpOf(a) - B.getHp(a)); })[0];
        if (hurt) t = hurt;
      }
      B.heal(t, n);
    });
  });
  OP.register('fluff', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    tl(B, ctx, e, 'self').forEach(function (t) {
      if (e.max !== undefined && t.fluff !== undefined) n = Math.min(n, Math.max(0, e.max - (t.fluff || 0)));
      if (n > 0) B.addFluff(t, n, e.force ? { force: true } : {});
    });
  });
  OP.alias('gainFluff', 'fluff');
  OP.register('hide', function (ctx, e, B) {
    var s = ctx.self; if (!s) return;
    var r = e.amountFrom === 'rage' ? (s.statuses.rage || 0) : 0;
    if (r >= (e.minRage || 0) && r > 0) B.addFluff(s, r);
  });
  OP.register('stripFluff', function (ctx, e, B) {
    var t = tgtUnit(ctx); if (!t) return;
    var list = [t];
    if (e.targets === 'targetAndNeighbors') B.S.floors[t.floor].cats.forEach(function (c) { if (c !== t && Math.abs(c.pos - t.pos) === 1) list.push(c); });
    var total = 0;
    list.forEach(function (x) { total += B.stripFluff(x, e.cap ? e.cap : 9999); });
    if (e.toSelfHide && ctx.self && total) B.addFluff(ctx.self, Math.min(total, e.cap || total));
  });
  function applyStatus(ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    var id = e.status || e.id;
    if (!id) return;
    var src = ctx.self && ctx.self.kind === 'pest' ? ctx.self.id : null;
    tagf(B, e, filt(B, ctx, e, tl(B, ctx, e, 'self'))).forEach(function (t) {
      if (!t) return;
      if (t.kind === 'player') { if (id === 'fluff' || id === 'shade') B.addShade(n); return; }
      var k = n;  // negative amounts take stacks away (addStatus, addFloorStatus and removeStatus all accept them)
      if (k > 0 && e.max !== undefined && isUnit(t)) k = Math.min(k, Math.max(0, e.max - B.stn(t, id)));
      if (!k) return;
      if (t.kind === 'floor') { B.addFloorStatus(t, id, k); return; }
      if (id === 'purr' && t.kind === 'cat') { B.addFloorStatus(t.floor, 'purr', k); return; }
      if (e.duration === 'turn' && id === 'claws') { t.tbuff.power = (t.tbuff.power || 0) + k; B.touch(); return; }
      var got = B.addStatus(t, id, k, { src: src });
      if (got && k > 0 && e.source && isUnit(t)) { t.srcMap = t.srcMap || {}; t.srcMap[id] = e.source; }
    });
  }
  OP.register('applyStatus', applyStatus);
  OP.alias('addStatus', 'applyStatus'); OP.alias('status', 'applyStatus'); OP.alias('conditionalStatusInner', 'applyStatus');
  OP.register('conditionalStatus', function (ctx, e, B) {
    if (e.if && !B.checkAll([e.if].filter(Boolean), ctx)) return;
    applyStatus(ctx, e, B);
  });
  OP.register('removeStatus', function (ctx, e, B) {
    var id = e.status || e.id, got = 0;
    tl(B, ctx, e, 'self').forEach(function (t) {
      if (!isUnit(t)) return;
      var n = e.amount === 'all' || e.amount === undefined && e.n === undefined ? undefined : amt(B, ctx, e, 1);
      got += B.removeStatus(t, id, n);
    });
    if (e.stealToSelf && ctx.self && got) B.addStatus(ctx.self, e.stealToSelf, got);
  });
  OP.alias('clearStatus', 'removeStatus');
  OP.register('removeStatusBySource', function (ctx, e, B) {
    B.pests().concat(B.cats()).forEach(function (u) { if (u.srcMap) Object.keys(u.srcMap).forEach(function (id) { if (u.srcMap[id] === e.source) { B.removeStatus(u, id); delete u.srcMap[id]; } }); });
  });
  OP.register('cleanse', function (ctx, e, B) {
    tl(B, ctx, e, 'chosenCat').forEach(function (t) {
      if (t.kind !== 'cat') return;
      if (e.status) B.removeStatus(t, e.status); else B.clearDebuffs(t);
      (B.S.attached || []).slice().forEach(function (a) { if (a.host === t.uid) B.detachParasite(a, 'cleanse'); });
    });
  });
  OP.register('purge', function (ctx, e, B) { tl(B, ctx, e, 'chosenEnemy').forEach(function (t) { if (t.kind === 'pest') B.clearBuffs(t); }); });
  OP.register('wipe', function (ctx, e, B) {
    var t = tgtUnit(ctx) || null;
    var list = e.target && e.target !== 'attackTarget' ? tl(B, ctx, e, 'attackTarget') : (t ? [t] : []);
    list.forEach(function (x) { if (isUnit(x)) B.removeStatus(x, e.what || 'claws'); });
  });
  OP.register('draw', function (ctx, e, B) { B.drawCards(amt(B, ctx, e, 1)); });
  OP.register('discard', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1), S = B.S, self = B;
    var order = S.hand.slice().sort(function (a, b) {
      var ea = S.cards[a.uid].eff, eb = S.cards[b.uid].eff;
      var pa = (ea.type === 'curse' || ea.unplayable) ? 0 : 1, pb = (eb.type === 'curse' || eb.unplayable) ? 0 : 1;
      return pa - pb;
    });
    if (e.mode === 'random') order = B.rng.shuffle(S.hand.slice());
    var cnt = 0;
    while (cnt < n && order.length) { var h = order.shift(); B.removeFromHand(h.uid); B.toDiscard(h.uid); B.fireCardTrigger('onDiscard', [h.uid]); cnt++; }
  });
  OP.register('exhaustCard', function (ctx, e, B) {
    var S = B.S, n = amt(B, ctx, e, 1), from = e.from || 'hand';
    var pile = from === 'hand' ? S.hand.map(function (h) { return h.uid; }) : (from === 'discard' ? S.discard.slice() : S.draw.slice());
    if (e.card) { var cid = SB.content.resolveId(e.card); pile = pile.filter(function (u) { return S.cards[u].id === cid; }); }
    if (e.filter === 'curse') pile = pile.filter(function (u) { return S.cards[u].eff.type === 'curse'; });
    if (e.mode === 'random') pile = B.rng.shuffle(pile);
    var taken = pile.slice(0, n);
    taken.forEach(function (u) {
      if (from === 'hand') B.removeFromHand(u); else if (from === 'discard') S.discard.splice(S.discard.indexOf(u), 1); else S.draw.splice(S.draw.indexOf(u), 1);
      B.toExhaust(u);
    });
  });
  OP.register('removeCard', function (ctx, e, B) {
    if (!e.from) return; // run-level removal belongs to the run layer
    var S = B.S, n = amt(B, ctx, e, 1);
    var pile = S.hand.map(function (h) { return h.uid; });
    if (e.filter === 'curse') pile = pile.filter(function (u) { return S.cards[u].eff.type === 'curse'; });
    pile.slice(0, n).forEach(function (u) { B.removeFromHand(u); S.exhaust.push(u); B.emit('exhaust', { uid: u, id: S.cards[u].id, removed: true }); });
    B.syncPiles();
  });
  OP.register('createCard', function (ctx, e, B) {
    var cid = e.card || e.id, self = ctx.card && SB.content.resolveId(cid) === ctx.card.id;
    B.createCard(cid, amt(B, ctx, e, 1), e.to || 'hand', self && ctx.cardUid ? { like: ctx.cardUid } : undefined);
  });
  OP.alias('addCard', 'createCard');
  OP.register('zoomies', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    if (e.nextTurn || e.next) { B.S.zoomiesNext = (B.S.zoomiesNext || 0) + n; return; }
    B.addZoomies(n);
  });
  OP.register('catnip', function (ctx, e, B) { B.addNip(amt(B, ctx, e, 1)); });
  OP.register('surge', function (ctx, e, B) { if (!B.S.nip.surge) B.startSurge(0); });
  OP.register('endCrash', function (ctx, e, B) { B.endCrash(); });
  OP.register('witching', function (ctx, e, B) {
    if (!B.S.rules.nightClock) return;
    B.S.clock.forceNext = true; if (e.mode === 'chain') B.S.clock.chain = true;
    B.emit('toast', { text: 'The next round is a Witching Hour' });
  });
  OP.register('forceWitchingHour', function (ctx, e, B) { if (B.S.rules.nightClock) { B.S.clock.forceNext = true; B.S.clock.chain = true; } });
  OP.register('lives', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    if (e.amount === 'all' || e.who === 'choose') { if (!ctx.choice && e.who === 'choose') return; }
    tl(B, ctx, e, 'self').forEach(function (t) {
      if (t.kind !== 'cat') return;
      if (n < 0) { B.spendLife(t, -n, { voluntary: e.spend !== false }); return; }
      var inst = t.instUid ? B.instByUid(t.instUid) : null;
      if (!inst) return;
      var cap = rv('lives_cap', 9);
      inst.lives = Math.min(cap, inst.lives + n); if (inst.maxLives < inst.lives) inst.maxLives = inst.lives;
      t.lives = inst.lives; t.maxLives = inst.maxLives; B.touch();
      B.emit('status', { uid: t.uid, status: 'lives', amount: n, total: t.lives, floor: t.floor, pos: t.pos, side: 'cat', kind: 'add' });
    });
  });
  OP.register('spendLives', function (ctx, e, B) {
    tl(B, ctx, e, 'allCats').forEach(function (t) {
      if (t.kind !== 'cat') return;
      var n = e.amount === 'all' ? t.lives - (e.keep || 0) : amt(B, ctx, e, 1);
      if (n > 0 && t.lives - n >= (e.keep || 1)) { if (B.spendLife(t, n, { voluntary: true })) B.addToBank(n); }
    });
  });
  OP.register('bank', function (ctx, e, B) { B.addToBank(amt(B, ctx, e, 1)); });
  OP.register('bankConvert', function (ctx, e, B) {
    var per = e.per || 3, S = B.S;
    var n = Math.floor(S.bank / per);
    for (var i = 0; i < n; i++) {
      var cats = B.cats().filter(function (c) { return c.instUid; }).sort(function (a, b) { return (a.lives / a.maxLives) - (b.lives / b.maxLives); });
      var c = cats[0]; if (!c) break;
      var inst = B.instByUid(c.instUid); if (!inst || inst.lives >= rv('lives_cap', 9)) break;
      inst.lives++; if (inst.maxLives < inst.lives) inst.maxLives = inst.lives; c.lives = inst.lives; c.maxLives = inst.maxLives;
      S.bank -= per;
      B.S.growth.push({ kind: 'life', uid: inst.uid, id: inst.id, text: c.name + ' gained a Life from banked Lives' });
      B.emit('status', { uid: c.uid, status: 'lives', amount: 1, total: c.lives, floor: c.floor, pos: c.pos, side: 'cat', kind: 'add' });
    }
    B.touch();
  });
  OP.register('prevent', function (ctx, e, B) { B.S.preventLife = true; B.S.counters.prevented = (B.S.counters.prevented || 0) + 1; });
  OP.register('redirectLife', function (ctx, e, B) {
    var s = ctx.self; if (!s || s.kind !== 'cat' || s.lives < 2) return;
    B.S.preventLife = true;
    B.spendLife(s, 1, { voluntary: true });
  });
  OP.register('knock', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1), src = srcOf(ctx);
    var list = filt(B, ctx, e, tl(B, ctx, e, 'frontEnemy')).filter(function (t) { return t.kind === 'pest'; });
    list.forEach(function (p) { B.knockPest(p, n, { src: src && src.kind === 'cat' ? src : null, shatterBonus: e.shatter ? e.shatter - rv('knock_shatter_per_floor', 2) : 0 }); });
  });
  OP.register('evict', function (ctx, e, B) {
    filt(B, ctx, e, tl(B, ctx, e, 'triggerSource')).forEach(function (p) {
      if (p.kind !== 'pest' || p.boss) return;
      B.knockPest(p, 3, { ignoreGrip: true });
    });
  });
  OP.register('banish', function (ctx, e, B) {
    filt(B, ctx, e, tl(B, ctx, e, 'allEnemiesOnFloor')).forEach(function (p) {
      if (p.kind !== 'pest' || p.boss) return;
      p.dead = true; p.banished = true;
    });
  });
  OP.register('nap', function (ctx, e, B) { tl(B, ctx, e, 'self').forEach(function (c) { if (c.kind === 'cat') B.napCat(c, { forced: true }); }); });
  OP.register('wake', function (ctx, e, B) { tl(B, ctx, e, 'self').forEach(function (c) { if (c.kind === 'cat') B.wakeCat(c, { force: true }); }); });
  OP.register('preventWake', function (ctx, e, B) { tl(B, ctx, e, 'triggerSource').forEach(function (c) { if (c.kind === 'cat') c.flags.preventWake = true; }); });
  OP.register('pounce', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    tl(B, ctx, e, 'chosenCat').forEach(function (c) { if (c.kind === 'cat') B.pounceAttack(c, n); });
  });
  OP.register('box', function (ctx, e, B) {
    var floors = [];
    if (e.floorOf === 'triggerSource' && ctx.subject) floors = [B.S.floors[ctx.subject.floor]];
    else floors = tl(B, ctx, e, 'thisFloor').filter(function (t) { return t.kind === 'floor'; });
    floors.forEach(function (f) {
      var room = B.placeBox(f.index, { kind: e.kind, size: e.size, durability: e.durability });
      if (room) {
        B.stat('boxPlaced');
        B.fire('onBoxPlaced', { subject: room, floor: f.index });
        var sit = e.sit || e.seat === 'self';
        if (sit && ctx.self && ctx.self.kind === 'cat' && ctx.self.floor === f.index && !ctx.self.boxed) B.seatCat(ctx.self, room);
      }
    });
  });
  OP.register('unbox', function (ctx, e, B) { tl(B, ctx, e, 'self').forEach(function (c) { if (c.kind === 'cat' && c.boxed) B.unseatCat(c, 'effect'); }); });
  OP.register('enterBox', function (ctx, e, B) {
    tl(B, ctx, e, 'self').forEach(function (c) {
      if (c.kind !== 'cat' || c.boxed) return;
      var f = B.S.floors[c.floor];
      var box = f.rooms.filter(function (r) { return r.rtype === 'box' && r.occupants.length < r.fits; })[0];
      if (box) { B.seatCat(c, box); B.stat('boxEntries'); }
    });
  });
  OP.register('bounce', function (ctx, e, B) {
    tl(B, ctx, e, 'self').forEach(function (c) {
      if (c.kind !== 'cat' || c.removed) return;
      if (c.boxed) B.unseatCat(c, 'bounce');
      B.removeUnit(c);
      var S = B.S;
      if (S.hand.length < B.handLimit()) { S.hand.push({ uid: c.cardUid, card: null }); B.emit('draw', { uid: c.cardUid, id: c.id, bounced: true }); } else B.toDiscard(c.cardUid);
      B.emit('death', { uid: c.uid, side: 'cat', id: c.id, floor: c.floor, pos: c.pos, bounced: true });
    });
  });
  OP.register('moveCard', function (ctx, e, B) {
    tl(B, ctx, e, 'triggerSource').forEach(function (t) {
      if (t.kind === 'cat') { OP.get('bounce')(Object.assign({}, ctx, { self: t }), { target: 'self' }, B); }
      else if (t.kind === 'card') {
        var S = B.S, i = S.discard.indexOf(t.uid);
        if (i >= 0 && S.hand.length < B.handLimit()) { S.discard.splice(i, 1); S.hand.push({ uid: t.uid, card: null }); }
      }
    });
  });
  OP.register('returnFromDiscard', function (ctx, e, B) {
    var S = B.S, n = amt(B, ctx, e, 1);
    var pool = S.discard.filter(function (u) {
      var ef = S.cards[u].eff;
      if (e.card === 'cat') return ef.type === 'unit' || ef.type === 'champion';
      return e.card ? ef.id === SB.content.resolveId(e.card) : true;
    });
    for (var i = 0; i < n && pool.length; i++) {
      var u = B.pickOne(pool); pool.splice(pool.indexOf(u), 1);
      S.discard.splice(S.discard.indexOf(u), 1);
      if (e.lives && S.cards[u].inst) { var inst = B.instByUid(S.cards[u].inst); if (inst && inst.lives < e.lives) inst.lives = e.lives; }
      if (S.hand.length < B.handLimit()) { S.hand.push({ uid: u, card: null }); B.emit('draw', { uid: u, id: S.cards[u].id, returned: true }); if (e.costDelta) S.cards[u].costMod.played -= e.costDelta; }
      else S.discard.push(u);
    }
    B.syncPiles();
  });
  OP.register('buff', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1), stat = e.stat === 'attack' ? 'power' : (e.stat || 'power'), dur = e.duration || 'fight';
    tl(B, ctx, e, 'self').forEach(function (t) {
      if (t.kind === 'pest') { if (stat === 'power') t.attackBuff += n; return; }
      if (t.kind !== 'cat') return;
      if (stat === 'power') {
        if (dur === 'turn') t.tbuff.power = (t.tbuff.power || 0) + n;
        else if (dur === 'run') { t.buffs.power += n; var i1 = t.instUid && B.instByUid(t.instUid); if (i1) { i1.growth = i1.growth || { power: 0, health: 0 }; i1.growth.power = (i1.growth.power || 0) + n; B.S.growth.push({ kind: 'growth', uid: i1.uid, id: i1.id, text: t.name + ' gained +' + n + ' Attack for the run' }); } }
        else t.buffs.power += n;
      } else if (stat === 'health') {
        t.buffs.health += n; t.health += n;
        if (dur === 'run') { var i2 = t.instUid && B.instByUid(t.instUid); if (i2) { i2.growth = i2.growth || { power: 0, health: 0 }; i2.growth.health = (i2.growth.health || 0) + n; } }
      }
      B.touch();
      B.emit('status', { uid: t.uid, status: 'buff:' + stat, amount: n, floor: t.floor, pos: t.pos, side: 'cat', kind: 'add' });
    });
  });
  OP.register('floorStatus', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    tl(B, ctx, e, 'thisFloor').forEach(function (f) { if (f.kind === 'floor') B.addFloorStatus(f, e.status, n); });
  });
  OP.register('grantKeyword', function (ctx, e, B) {
    var kw = e.keyword, n = e.n !== undefined ? e.n : (e.amount !== undefined ? B.num(e.amount, ctx) : true);
    tl(B, ctx, e, 'self').forEach(function (t) {
      if (t.kind === 'cat') { t.kw[kw] = (typeof n === 'number' && typeof t.kw[kw] === 'number') ? t.kw[kw] + n : n; B.touch(); }
      else if (t.kind === 'pest') { t.traitSet[String(kw).toLowerCase()] = true; }
    });
  });
  OP.register('resetKeyword', function (ctx, e, B) {
    tl(B, ctx, e, 'self').forEach(function (t) { if (t.kind === 'cat' && e.keyword === 'ambush') t.ambushUsed = false; });
  });
  OP.register('passive', function (ctx, e, B) {
    var S = B.S;
    S.passives.push({ id: 'ps' + (++S.nextUid), trigger: E.normTrigger(e.trigger), effects: U.deepClone(e.effects || []), once: !!e.once, card: ctx.cardUid || null, ownerUid: ctx.self && ctx.self.kind === 'cat' ? ctx.self.uid : null });
    B.emit('toast', { text: 'A lasting effect begins' });
  });
  OP.register('warmth', function (ctx, e, B) { var n = amt(B, ctx, e, 1); if (n >= 0) B.addWarmth(n); else B.hitSunbeam(-n, { srcId: 'effect', noHiss: true }); });
  OP.register('shade', function (ctx, e, B) { B.addShade(amt(B, ctx, e, 1)); });
  OP.alias('addShade', 'shade');
  OP.register('setWarmth', function (ctx, e, B) { var sb = B.S.sunbeam; sb.warmth = Math.min(sb.max, amt(B, ctx, e, 1)); B.touch(); });
  OP.register('reduceCost', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1), dur = e.duration || 'played', S = B.S;
    var list = tl(B, ctx, e, 'firstCardInHand');
    if (e.filter === 'targetsYarned') list = list.filter(function (r) { var ef = S.cards[r.uid] && S.cards[r.uid].eff; return ef && ef.targeting === 'enemy'; });
    list.forEach(function (r) {
      var uid = r.kind === 'card' ? r.uid : (r.kind === 'cat' ? r.cardUid : null);
      if (!uid || !S.cards[uid]) return;
      var key = dur === 'turn' ? 'turn' : (dur === 'fight' ? 'fight' : 'played');
      S.cards[uid].costMod[key] = (S.cards[uid].costMod[key] || 0) + n;
    });
  });
  OP.register('summon', function (ctx, e, B) {
    var id = e.card || e.id;
    if (!id) return;
    var count = e.count === undefined ? 1 : B.num(e.count, ctx);
    if (/^pest_/.test(id)) {
      var floors = [];
      if (Array.isArray(e.floors)) floors = e.floors.map(function (x) { return x - 1; });
      else if (typeof e.floor === 'number') floors = [e.floor - 1];
      else if (e.floor === 'own' || !e.floor) {
        var t = tl(B, ctx, e, 'thisFloor')[0];
        floors = [t && t.kind === 'floor' ? t.index : (ctx.self ? ctx.self.floor : 0)];
      }
      if (e.onlyIfAbsent && B.livePests().some(function (p) { return p.id === id; })) return;
      if (e.cap && B.livePests().filter(function (p) { return p.id === e.cap.id; }).length >= e.cap.max) return;
      floors.forEach(function (fi) {
        for (var i = 0; i < count; i++) {
          if (e.cap && B.livePests().filter(function (p) { return p.id === e.cap.id; }).length >= e.cap.max) break;
          B.spawnPest(id, fi, e.at || 'back', { yarn: e.dazed || e.yarn || rv('yarn_summoned_pest_start', 1), from: 'summon', source: ctx.self && ctx.self.uid });
        }
      });
      return;
    }
    var fls = tl(B, ctx, e, 'thisFloor').filter(function (t) { return t.kind === 'floor'; });
    fls.forEach(function (f) { for (var i = 0; i < count; i++) B.summonCat(id, f.index, e.at); });
  });
  OP.register('fish', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    if (e.capPerFight) { var got = B.S.counters.fishCap || 0; n = Math.min(n, Math.max(0, e.capPerFight - got)); B.S.counters.fishCap = got + n; }
    if (n === 0) return;
    var run = B.run; run.fish = Math.max(0, (run.fish || 0) + n); B.stat('fish', n);
    B.emit('fish', { amount: n, total: run.fish });
  });
  OP.alias('grantFish', 'fish');
  OP.register('stealFish', function (ctx, e, B) {
    var p = ctx.self, run = B.run; if (!p) return;
    var n = Math.min(e.n || e.amount || 5, run.fish || 0);
    run.fish = (run.fish || 0) - n; p.carriedFish = (p.carriedFish || 0) + n; B.emit('fish', { amount: -n, total: run.fish, stolenBy: p.uid });
  });
  OP.register('returnCarriedFish', function (ctx, e, B) {
    var p = ctx.self, run = B.run; if (!p) return;
    var n = (p.carriedFish || 0) + (p.carriedFish ? (e.bonus || 0) : 0);
    if (n > 0) { run.fish = (run.fish || 0) + n; B.emit('fish', { amount: n, total: run.fish }); }
    p.carriedFish = 0;
  });
  OP.register('flee', function (ctx, e, B) {
    var p = ctx.self; if (!p || p.removed) return;
    B.removeUnit(p); p.fled = true; B.emit('death', { uid: p.uid, side: 'pest', id: p.id, floor: p.floor, fled: true });
    B.toast(p.name + ' escapes' + (p.carriedFish ? ' with your Fish' : ''));
  });
  OP.register('tunnel', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    var to = Math.min(B.numFloors - 1, p.floor + (e.floors || 1));
    if (to !== p.floor && B.pestSize(to) + p.size <= B.S.floors[to].capacity.pestSize) B.movePest(p, to, { kind: 'tunnel' });
  });
  OP.register('gainDmg', function (ctx, e, B) { if (ctx.self) ctx.self.attackBuff += (e.n || 1); });
  OP.register('shove', function (ctx, e, B) {
    tl(B, ctx, e, 'attackTarget').forEach(function (c) { if (c.kind === 'cat') B.shoveCat(c, 'back'); });
  });
  OP.register('shoveCat', function (ctx, e, B) {
    var spec = e.target === 'front' ? 'frontCat' : e.target;
    tl(B, ctx, { target: spec }, 'frontCat').forEach(function (c) { if (c.kind === 'cat') B.shoveCat(c, e.to || 'back'); });
  });
  OP.register('move', function (ctx, e, B) {
    // move a cat (retriever carries it down one floor, or up)
    var dir = e.dir === 'up' ? 1 : -1, n = e.amount || 1;
    tl(B, ctx, e, 'attackTarget').forEach(function (c) {
      if (c.kind !== 'cat' || c.removed) return;
      var to = c.floor + dir * n;
      if (to < 0 || to >= B.numFloors || B.catSize(to) + c.size > B.S.floors[to].capacity.cats) { if (e.onBlocked === 'shove') B.shoveCat(c, 'back'); return; }
      B.moveCat(c, to);
    });
  });
  OP.register('trapCat', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    var c = tl(B, ctx, e, 'weakestCat').filter(function (x) { return x.kind === 'cat' && x.size < (e.excludeSize || 99); })[0];
    if (!c) return;
    if (c.boxed) B.unseatCat(c, 'trap');
    B.removeUnit(c); c.removed = false; c.trappedBy = p.uid; p.trapped = (p.trapped || []).concat([c.uid]);
    B.S.attached.push(Object.assign(c, { trappedBy: p.uid })); c.isTrapped = true;
    B.emit('trap', { uid: c.uid, by: p.uid, floor: p.floor });
  });
  OP.register('releaseCat', function (ctx, e, B) {
    var S = B.S;
    S.attached.slice().forEach(function (c) {
      if (c.kind !== 'cat' || !c.isTrapped) return;
      if (ctx.self && c.trappedBy !== ctx.self.uid) return;
      S.attached.splice(S.attached.indexOf(c), 1); c.isTrapped = false; c.removed = false; c.dead = false;
      var f = S.floors[c.floor]; f.cats.push(c); B.reindex(c.floor); B.touch(); B.emit('deploy', { uid: c.uid, cardUid: c.cardUid, id: c.id, name: c.name, floor: c.floor, pos: c.pos, released: true });
    });
  });
  OP.register('chase', function (ctx, e, B) {
    tl(B, ctx, e, 'allCatsOnFloor').forEach(function (c) { if (c.kind === 'cat') B.addStatus(c, 'frazzled', e.frazzled || 1); });
  });
  OP.register('destroyRoom', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    var rooms = B.S.floors[p.floor].rooms.filter(function (r) { return e.kind === 'any' || r.rtype === e.kind; });
    if (rooms.length) B.removeRoom(B.pickOne(rooms), 'pest');
  });
  OP.register('boxDamage', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    tl(B, ctx, e, 'thisFloor').forEach(function (f) {
      if (f.kind !== 'floor') return;
      f.rooms.filter(function (r) { return r.rtype === 'box'; }).forEach(function (r) { r.durability -= n; B.emit('room', { uid: r.uid, floor: f.index, rtype: 'box', action: 'damage', durability: r.durability }); if (r.durability <= 0) B.flattenBox(r, 'damage'); });
    });
  });
  OP.register('knead', function (ctx, e, B) {
    var n = amt(B, ctx, e, 1);
    tl(B, ctx, e, 'self').forEach(function (c) { if (c.kind === 'cat') B.doKnead(c, e.stat === 'health' ? 'health' : 'attack', n); });
  });
  OP.register('spreadStatus', function (ctx, e, B) {
    var from = B.targets(e.from, ctx, e)[0];
    if (!from || !from.statuses) return;
    var n = from.statuses[e.status] || 0; if (!n) return;
    B.targets(e.to, ctx, e).forEach(function (t) { if (t !== from && isUnit(t)) B.addStatus(t, e.status, n); });
  });
  OP.register('replay', function (ctx, e, B) { /* handled by Echo keyword in playCard */ });
  OP.register('counter', function (ctx, e, B) {
    var r = ctx.src && ctx.src.relic; if (!r) return;
    var n = amt(B, ctx, e, 1);
    r.counter = r.counter || 0;
    if (e.op === 'set') r.counter = n; else r.counter += n;
  });
  OP.register('gainCounter', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    p.counters[e.name] = Math.min(e.max === undefined ? 99 : e.max, (p.counters[e.name] || 0) + (e.amount || 1));
  });
  OP.register('setCounter', function (ctx, e, B) { var p = ctx.self; if (p) p.counters[e.name] = e.amount || 0; });
  OP.register('note', function () {});
  OP.register('reduceIncoming', function () { /* applied in B.damage via the pest passive */ });
  OP.register('flatten', function (ctx, e, B) {
    var from = e.floors === 'all' ? 0 : (ctx.self ? ctx.self.floor : 0);
    B.S.floors.forEach(function (f, fi) { if (fi >= from) f.rooms.slice().forEach(function (r) { if (r.rtype === 'box') B.flattenBox(r, 'op'); }); });
  });
  OP.register('steal', function (ctx, e, B) { var AIm = SB.engine.ai; if (AIm && AIm.specials.steal && ctx.self) AIm.specials.steal(B, ctx.self, e); });
  OP.register('killSelf', function (ctx, e, B) { var p = ctx.self; if (p && !p.dead) { p.dead = true; p.silent = true; } });
  OP.register('consumeRelic', function (ctx, e, B) { var r = ctx.src && ctx.src.relic; if (r) r.used = true; });
  OP.register('clearFloorEnemies', function (ctx, e, B) {
    var f = e.floor ? e.floor - 1 : 0;
    B.S.floors[f].pests.forEach(function (p) { if (!p.boss) { p.dead = true; p.banished = true; } });
  });
  OP.register('capHit', function (ctx, e, B) { if (ctx.self) ctx.self.hitCap = e.amount; });
  OP.register('ignoreHidden', function (ctx, e, B) { if (ctx.self) ctx.self.flags.ignoreHidden = true; });
  OP.register('doubleVs', function (ctx, e, B) { if (ctx.self) ctx.self.flags.doubleVs = e.status; });
  OP.register('removePassive', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    p.passives = p.passives.filter(function (x) { return x.id !== e.id; });
    Object.keys(p.fx).forEach(function (k) { p.fx[k] = p.fx[k].filter(function (x) { return x.passiveId !== e.id; }); });
  });
  OP.register('attackBonusPer', function (ctx, e, B) { /* evaluated by the pest passive table */ });
  OP.register('healBoss', function (ctx, e, B) { B.pests().forEach(function (p) { if (p.boss) B.heal(p, e.amount || 6); }); });
  // control flow helpers used by pest and boss data
  function thenList(ctx, e, B) { B.runEffects(e.then || [], ctx); }
  OP.register('ifMeter', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    var v = (p.meter && p.meter[e.meter]) || 0, ok = true;
    if (e.eq !== undefined) ok = ok && v === e.eq;
    if (e.gte !== undefined) ok = ok && v >= e.gte;
    if (e.lte !== undefined) ok = ok && v <= e.lte;
    if (e.gt !== undefined) ok = ok && v > e.gt;
    if (e.lt !== undefined) ok = ok && v < e.lt;
    if (ok) thenList(ctx, e, B); else if (e.else) B.runEffects(e.else, ctx);
  });
  OP.register('addMeter', function (ctx, e, B) { var p = ctx.self; if (!p) return; p.meter = p.meter || {}; var v = (p.meter[e.meter] || 0) + (e.amount || 1); if (e.max !== undefined) v = Math.min(e.max, v); p.meter[e.meter] = v; });
  OP.register('setMeter', function (ctx, e, B) { var p = ctx.self; if (!p) return; p.meter = p.meter || {}; p.meter[e.meter] = e.value !== undefined ? e.value : (e.amount || 0); });
  OP.register('ifStatus', function (ctx, e, B) { var s = ctx.self; if (s && B.stn(s, e.status) > 0) thenList(ctx, e, B); });
  OP.register('ifStatusAtLeast', function (ctx, e, B) { var s = ctx.self; if (s && B.stn(s, e.status) >= (e.value || 1)) thenList(ctx, e, B); });
  OP.register('unlessStatus', function (ctx, e, B) { var s = ctx.self; if (!s) return; var ids = [].concat(e.status); for (var i = 0; i < ids.length; i++) if (B.stn(s, ids[i]) > 0) return; thenList(ctx, e, B); });
  OP.register('ifRoundEven', function (ctx, e, B) { if (B.S.round % 2 === 0) thenList(ctx, e, B); });
  OP.register('once', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    p.flags.once = p.flags.once || {};
    if (p.flags.once[e.key]) return;
    if (e.if && !B.checkAll([e.if], ctx)) return;
    p.flags.once[e.key] = 1; thenList(ctx, e, B);
  });
  OP.register('setStance', function (ctx, e, B) { var p = ctx.self; if (p) { p.meter = p.meter || {}; p.meter.stance = e.stance; p.stance = e.stance; } });
  OP.register('ifStance', function (ctx, e, B) { var p = ctx.self; if (p && p.stance === e.stance) thenList(ctx, e, B); });
  OP.register('negateHit', function (ctx, e, B) { var p = ctx.self; if (p) p.flags.preventNext = (p.flags.preventNext || 0) + 1; });
  OP.register('floorHazard', function (ctx, e, B) {
    var fls = e.floors || [1, 2, 3];
    fls.forEach(function (n) { var f = B.S.floors[n - 1]; if (f) { f.hazards[e.hazard] = { id: e.hazard, since: B.S.round }; B.emit('status', { floor: n - 1, status: e.hazard, kind: 'hazard', side: 'floor', amount: 1, total: 1 }); } });
  });
  OP.register('clearHazard', function (ctx, e, B) { B.S.floors.forEach(function (f) { delete f.hazards[e.hazard]; }); });
  OP.register('hideIntent', function (ctx, e, B) { if (ctx.self) ctx.self.hiddenIntentUntilDecoys = true; });
  OP.register('extraMove', function (ctx, e, B) { B.S.counters.extraMove = true; });
  OP.register('teleport', function (ctx, e, B) { /* decorative: boss moves to its intent floor */ });
  OP.register('respawnIn', function (ctx, e, B) { /* handled by AI death hook */ });
  OP.register('summonReruns', function (ctx, e, B) {
    var run = B.run, defeated = (run.defeatedBosses || []).slice();
    var n = e.perRound || 1;
    for (var i = 0; i < n; i++) {
      var bid = defeated.length ? defeated[i % defeated.length] : null;
      var id = bid && SB.content.pest(bid) ? 'pest_add_' + String(bid).replace(/^pest_boss_/, '') : e.fallback;
      if (!id || !SB.content.pest(id)) id = e.fallback;
      var f = (e.floors || [1, 2, 3])[B.rng.int((e.floors || [1, 2, 3]).length)] - 1;
      if (id) B.spawnPest(id, f, 'back', { yarn: 1, from: 'summon' });
    }
  });
  OP.register('shopDiscountFirst', function () { /* run layer */ });

  // ---- pest passives ----------------------------------------------------------------------------------------------
  var PS = E.passives;
  function othersWithTag(B, p, tag, sameFloor) {
    return B.livePests().filter(function (q) { return q !== p && B.hasTrait(q, tag) && (!sameFloor || q.floor === p.floor); }).length;
  }
  PS.register('packTactics', {
    attack: function (B, p, ps) { var n = othersWithTag(B, p, ps.tag || 'rat', true) * (ps.perOther || 1); return Math.min(ps.cap || 3, n); }
  });
  PS.register('murder', { attack: function (B, p, ps) { return (ps.dmg || 1) * B.livePests().filter(function (q) { return q !== p && q.id === p.id; }).length; } });
  PS.register('alarm', { init: function (p, ps) { p.fx.onHornetDeath = (p.fx.onHornetDeath || []).concat([{ type: 'gainDmg', n: ps.dmg || 1 }]); } });
  PS.register('bristle', { init: function (p, ps) { p.statuses.bristle = ps.n || 1; } });
  PS.register('spectral', { init: function (p) { p.traitSet.spectral = true; } });
  PS.register('spawnPair', { init: function () {} });
  PS.register('silentWings', { init: function (p) { p.hiddenIntent = true; } });
  PS.register('curl', { init: function () {} });
  PS.register('stoic', { init: function (p) { p.hitCap = 5; } });
  PS.register('court', {
    onDamaged: function () {},
    init: function (p) { p.flags.courtReduce = true; }
  });
  PS.register('cone_power', { attack: function (B, p) { return 2 * B.cats().filter(function (c) { return c.statuses.coned; }).length; } });
  PS.register('mirror', { init: function (p) { p.flags.mirror = true; } });
  PS.register('playDead', { init: function (p) { p.flags.playDead = true; } });
  PS.register('ravenous', { init: function (p) { p.flags.ravenous = true; } });
  PS.register('chill', { init: function (p) { p.flags.chill = true; } });
  PS.register('puddle_self', { init: function (p) { p.flags.puddleSelf = true; } });
  PS.register('cling', { init: function (p) { p.flags.cling = true; } });
  PS.register('sniff', { init: function (p) { p.flags.ignoreHidden = true; } });
  PS.register('ring', { init: function (p) { p.flags.ring = true; } });
  PS.register('snooze', { init: function (p) { p.flags.snooze = true; } });
  PS.register('bolt', { init: function (p) { p.flags.bolt = true; } });
  PS.register('nest', { init: function (p) { p.flags.nest = true; } });
  PS.register('fuse', { init: function (p) { p.meter.fuse = p.meter.fuse === undefined ? 4 : p.meter.fuse; } });
  PS.register('fizzle', { init: function (p) { p.flags.fizzle = true; } });
  PS.register('tribute', { init: function () {} });
  ['rule:anchored', 'rule:heavy', 'rule:capacity', 'rule:immuneToScared', 'rule:nocturnal', 'rule:sneakySunbeamDmg', 'rule:pausedByWet', 'rule:untargetable', 'rule:floorStatus', 'rule:onHitBy'].forEach(function (n) { PS.register(n, { init: function () {} }); });

  // ---- pattern conditions (conds) --------------------------------------------------------------------------------------
  var CD = E.conds;
  function me(ctx) { return ctx.self; }
  CD.register('always', function () { return true; });
  CD.register('carryingFish', function (c) { var p = me(c); return !!(p && p.carriedFish > 0); });
  CD.register('roundAtLeast', function (c, v, B) { var p = me(c); return p ? (B.S.round - (p.appearedRound || 0) + 1) >= v : B.S.round >= v; });
  CD.register('round', function (c, v, B) { return B.S.round === v; });
  CD.register('floorHasNappingCat', function (c, v, B) { var p = me(c); return !!p && B.S.floors[p.floor].cats.some(function (x) { return x.napping && !x.dead; }); });
  CD.register('floorHasRoomItem', function (c, v, B) { var p = me(c); return !!p && B.S.floors[p.floor].rooms.length > 0; });
  CD.register('floorIsPuddle', function (c, v, B) { var p = me(c); return !!p && !!B.S.floors[p.floor].statuses.puddle; });
  CD.register('floorHasNoCats', function (c, v, B) { var p = me(c); return !!p && B.blockers(p.floor).length === 0; });
  CD.register('hpPctBelow', function (c, v) { var p = me(c); return !!p && (p.hp * 100 / p.maxHp) < v; });
  CD.register('hpBelowHalf', function (c) { var p = me(c); return !!p && p.hp * 2 < p.maxHp; });
  CD.register('hpBelowHalfOnce', function (c) { var p = me(c); return !!p && p.hp * 2 < p.maxHp && !p.counters.halfOnce && (p.counters.halfOnce = 1); });
  CD.register('floorHasHiddenCat', function (c, v, B) { var p = me(c); return !!p && B.S.floors[p.floor].cats.some(function (x) { return x.hidden; }); });
  CD.register('anyCatWetOnFloor', function (c, v, B) { var p = me(c); return !!p && B.S.floors[p.floor].cats.some(function (x) { return x.statuses.wet; }); });
  CD.register('status', function (c, v, B) { var p = me(c); return !!p && B.stn(p, v) > 0; });
  CD.register('notStatus', function (c, v, B) { var p = me(c); return !!p && !B.stn(p, v); });
  CD.register('floorCatsAtLeast', function (c, v, B) { var p = me(c); return !!p && B.S.floors[p.floor].cats.length >= v; });

  // ---- naming registries (picks, floors specs, patterns, actions, hazards, winIf, traits, flags, stats, mods, keywords, hooks) --------------
  ['front', 'back', 'all', 'random', 'weakest', 'strongest', 'napping', 'front3', 'mostLives'].forEach(function (n) { E.picks.register(n, true); });
  ['own', 'reach', 'each', 'up', 'down', 'ownAndUp', 'ownOrAbove', 'list', 'sunbeam'].forEach(function (n) { E.floorsSpecs.register(n, true); });
  ['cycle', 'weighted', 'conditional', 'countdown'].forEach(function (n) { E.patterns.register(n, true); });
  ['attack', 'flee', 'steal', 'shield', 'buff', 'summon', 'tunnel', 'debuff', 'sabotage', 'wait', 'trap', 'snatch', 'attach', 'hide', 'special', 'sunbeam'].forEach(function (n) { E.actions.register(n, true); });
  ['bossDead', 'any', 'dawnRounds'].forEach(function (n) { E.winIf.register(n, true); });
  ['rat_tide', 'puddle', 'draft', 'sterile_lights', 'laser_zone', 'suds'].forEach(function (n) { E.hazards.register(n, true); });
  // keywords the engine reads
  ['pounce', 'fleeting', 'ragebait', 'rage_bait', 'reborn', 'exhaust', 'purr', 'deepsleep', 'unfrazzled', 'unplayable', 'retain', 'innate', 'ambush', 'decoy', 'multistrike', 'knead', 'fluff', 'echo', 'climber', 'fragile', 'witchingEcho',
    'hairball', 'knock', 'yarn', 'large', 'kitten'].forEach(function (n) { E.keywords.register(n, true); });
  // traits the engine reads
  ['climber', 'sneaky', 'heavy', 'slippery', 'light', 'anchored', 'nocturnal', 'glider', 'spectral', 'untargetable', 'dog', 'rat', 'costly', 'flying', 'tracker', 'parasite'].forEach(function (n) { E.traits.register(n, true); });
  // descriptive tags: carried by data for UI, search and encounter design; they have no engine behaviour of their own
  ['gerbil', 'pack', 'loud', 'puppy', 'chaser', 'wet', 'slow', 'fetch', 'shover', 'long', 'multifloor', 'dragger', 'garden', 'support', 'rage-caller', 'yowl', 'tank', 'box-breaker', 'armored', 'snob', 'wet-averse',
    'guard', 'human', 'summoner', 'elite-candidate', 'anti-hidden', 'wolf', 'sunbeam-threat', 'household', 'scare_all', 'ambush', 'floor_hazard', 'scare', 'countdown', 'claw_wipe', 'wall', 'shove', 'debuffer',
    'anti_pile', 'hostage', 'vet', 'cleaner', 'box_wipe', 'hairball_wipe', 'purr_wipe', 'wet_applicator', 'splash', 'ammo', 'multi_floor', 'noise', 'anti_hidden', 'anti_yarn', 'dry', 'fluff_wipe', 'rising',
    'weather', 'explosive', 'sunbeam_hit', 'anti_nap', 'puzzle', 'distraction', 'cannot_be_attacked', 'pest', 'mouse', 'tutorial', 'horror', 'elite', 'boss', 'rodent', 'bird', 'insect'].forEach(function (n) { E.traits.register(n, { descriptive: true }); });
  ['dazed', 'tangled'].forEach(function (n) { E.statuses.alias(n, 'yarn'); });
  E.durations.register('3', true);
  // mods the engine reads
  ['baseZoomies', 'drawPerTurn', 'handLimit', 'maxWarmth', 'catMaxHealth', 'catPower', 'retainSlots', 'maxRested', 'pileBonus', 'pileHealMinSize', 'pileIgnoreGaps', 'purrDecayEvery', 'napOnPlay',
    'surgeAt', 'surgeZoomies', 'crashTurns', 'witchingEvery', 'witchingZoomies', 'firstBoxFree', 'boxCapacity', 'largeCatsFitBoxes', 'roomSlots', 'corneredAt', 'corneredBonus', 'frenzyNoSelfDamage',
    'atticCatDamageReduction', 'kneadCapBonus', 'kneadFirstDouble', 'crashZoomiesPenalty', 'crashDrawPenalty', 'intentLookahead', 'doNotDisturb', 'knockShatter', 'sunbeamThorns',
    // run-layer mods: read by C2 (run.js, shop, post), listed here so validate does not flag them
    'postExtraOffers', 'masteryExtraPlay', 'masteryThresholdDelta', 'adoptOutFree', 'postcardFish', 'freeLitterPerAct', 'postStallPct', 'birthThreshold', 'boxSwapChoices', 'boxSwapKeepsMastery',
    'emeryDoublePost', 'whittleSlotsPerAct', 'champTierCrossPath', 'champStartTier', 'legendCeremonyFree', 'shopPricePct', 'sellPricePct', 'freeShopReroll', 'fishGainPct', 'removalNoEscalate',
    'shopExtraRelic', 'shopExtraRare', 'nightVisitorThreatPct', 'flapDelay', 'noPounce', 'noZoom', 'attackOrder', 'catLivesCap'].forEach(function (n) { E.mods.register(n, true); });
  ['surgeThreshold', 'nipKeptDuringSurge'].forEach(function (n) { E.mods.register('rule:' + n, true); });
  // flags handled by card-inst / battle
  ['ignoreGrip', 'frenzyNoSelfDamage', 'decoy', 'cheatDeathOnce', 'napNoSkip', 'napOnDeploy', 'heapAt3', 'kneadDouble', 'activated', 'retain', 'innate', 'fastLearner', 'noExhaust', 'survive1',
    'doubleTrigger', 'witchingMaster', 'dynamicDmg', 'parasite', 'phase', 'boxCapacity+1', 'noRude', 'pileWeight2', 'preventWake'].forEach(function (n) { E.flags.register(n, true); });
  ['power', 'health', 'attack', 'cost', 'value', 'charges', 'knockShatter', 'restedCap'].forEach(function (n) { E.stats.register(n, true); });
  ['power', 'health', 'pileSize', 'damageTaken', 'keyword:deepsleep'].forEach(function (n) { E.stats.register('aura:' + n, true); });
  ['addStat', 'mulStat', 'grantKeyword', 'addTrigger', 'addAura', 'setFlag', 'addLives', 'grantMasteryRank'].forEach(function (n) { E.upgradeOps.register(n, true); });
  // relic hook names (all hooks are routed through B.fire)
  ['onBattleStart', 'onTurnStart', 'onTurnEnd', 'onDeath', 'onDamaged', 'onArmorBroken', 'onLifeSpent', 'onFinalDeath', 'onSunbeamHit', 'onSpawn', 'onSummon', 'onPush', 'onZoomies', 'onCardPlayed', 'onAttack', 'onKill',
    'onDeathOfPest', 'onCatDeployed', 'onDrawn', 'onShuffle', 'onExhaust', 'onDiscard', 'onLifeLost', 'onKnock', 'onShatter', 'onBoxPlaced', 'onBoxEnter', 'onBoxFlattened', 'onUnbox', 'onNapStart', 'onNapTick', 'onWake',
    'onPounce', 'onRudeAwakening', 'onPileChange', 'onNipGain', 'onSurgeStart', 'onSurgeEnd', 'onCrashStart', 'onNightPhase', 'onZoom', 'onFrazzled', 'onFightEnd', 'onActStart', 'onPickup', 'onShopEnter', 'onLoss',
    'onStatusApplied', 'onReborn', 'onPestClimb'].forEach(function (n) { E.hooks.register(n, true); });
})();
