/* SUNBEAM SIEGE: regular pest and elite passives (agent pests pass).
 * Loaded after registry.js, battle.js and battle-ai.js (index.html opsFiles order). No Math.random, no module syntax.
 * Registered by name, so a later file with the same name wins. This file only adds; it never edits battle.js.
 *
 * What lives here
 *   1. passives for the text-only entries of enemies-dogs.js (ids: fearless, long_boy, heavy, stubborn, groomed, wet_ruin,
 *      guard_duty, leashed, floor_budget, tracker, excited, climber_sneaky, nocturnal, pack_leader, rage_floor),
 *   2. the "rule:" passives of the household pests (immuneToScared, floorStatus, capacity, onHitBy, untargetable, staminaDrain,
 *      onCatAmbush, and friends) plus verdict, mirror, playDead, curl,
 *   3. real behaviour for elite flag passives that were only flags (chill, ring, snooze, cling, nest, puddle_self, fizzle, ...),
 *   4. pattern conditions used by the conditional pest patterns (holdingCat, cycleIndexEven, catHpAtMost, onceUnused, ...),
 *   5. a few ops with a fuller meaning than the first version (hide, wipe, applyStatus with fromStored).
 *
 * Engine seams used (all additive):
 *   - PS.register(id, { init, attack, onDamaged }) for passive tables (init may push effect lists onto p.fx),
 *   - triggers.register('onPestSpawned', {scope:'any'}), fired from a thin wrapper of Battle.spawnPest,
 *   - thin wrappers of Battle.addStatus (immunities, caps), Battle.damage (Play Dead) and Battle.catAttack (laser chase).
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var E = SB.engine;
  if (!E || !E.ops || !E.passives) return;
  var U = SB.util;
  var BT = SB.battle && SB.battle.Battle && SB.battle.Battle.prototype;
  var PS = E.passives, OP = E.ops, CD = E.conds;

  function rv(key, dflt) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : dflt; }
  function live(B) { return B.pests().filter(function (p) { return !p.dead && !p.removed; }); }
  function liveCats(B) { return B.cats().filter(function (c) { return !c.dead && !c.removed; }); }
  function floorCats(B, fi) { return (B.S.floors[fi] ? B.S.floors[fi].cats : []).filter(function (c) { return !c.dead && !c.removed; }); }
  function pushFx(p, trig, list) { p.fx = p.fx || {}; p.fx[trig] = (p.fx[trig] || []).concat(list); }
  function moveFx(p, from, to) {
    if (!p.fx || !p.fx[from]) return;
    p.fx[to] = (p.fx[to] || []).concat(p.fx[from]);
    delete p.fx[from];
  }
  function addTrait(p, t) { p.traitSet = p.traitSet || {}; p.traitSet[t] = true; }
  function aliasOf(id) { var A = SB.battle && SB.battle.STATUS_ALIAS; return (A && A[id]) || id; }

  // ---------------------------------------------------------------------------------------------------------------
  // triggers
  // ---------------------------------------------------------------------------------------------------------------
  E.triggers.register('onPestSpawned', { scope: 'any' });

  // ---------------------------------------------------------------------------------------------------------------
  // pattern conditions (conditional patterns read `rules: [{ if, action }]`)
  // ---------------------------------------------------------------------------------------------------------------
  function me(ctx) { return ctx.self; }
  CD.register('holdingCat', function (c) { var p = me(c); return !!(p && p.trapped && p.trapped.length); });
  CD.register('cycleIndexEven', function (c) { var p = me(c); return !!p && ((p.pat && p.pat.round) || 0) % 2 === 0; });
  CD.register('turnIsOdd', function (c, v, B) { return B.S.round % 2 === 1; });
  CD.register('catHpAtMost', function (c, v, B) {
    var p = me(c); if (!p) return false;
    return floorCats(B, p.floor).some(function (x) { return x.health <= v; });
  });
  CD.register('witchingHour', function (c, v, B) { return !!B.S.clock.isWitching; });
  // side-effect free "once" gate: pair it with the markOnce op in the action effects
  CD.register('onceUnused', function (c, v) { var p = me(c); return !!p && !(p.counters && p.counters['once_' + v]); });
  OP.register('markOnce', function (ctx, e) { var p = ctx.self; if (p) { p.counters = p.counters || {}; p.counters['once_' + e.key] = 1; } });

  // ---------------------------------------------------------------------------------------------------------------
  // ops
  // ---------------------------------------------------------------------------------------------------------------
  function scaredCats(B) { return liveCats(B).filter(function (c) { return c.statuses.scared; }); }

  // hide: pest gains Fluff. Forms: {amountFrom:'rage', minRage}, {amountPer, per:'scaredCats'|'cats'|'pests'}, {amount}
  OP.register('hide', function (ctx, e, B) {
    var s = ctx.self; if (!s || s.dead || s.removed) return;
    var n = 0;
    if (e.amountFrom === 'rage') {
      var r = s.statuses.rage || 0;
      if (r >= (e.minRage || 0) && r > 0) n = r;
    } else if (e.amountPer !== undefined) {
      var cnt = 0;
      if (e.per === 'scaredCats') cnt = scaredCats(B).length;
      else if (e.per === 'cats') cnt = liveCats(B).length;
      else if (e.per === 'otherPests') cnt = live(B).filter(function (q) { return q !== s; }).length;
      n = e.amountPer * cnt;
      if (e.cap !== undefined) n = Math.min(n, e.cap);
    } else if (typeof e.amount === 'number') n = e.amount;
    if (n > 0) B.addFluff(s, n);
  });

  // wipe: strips a status or a pool. what: fluff|purr|rested|box|<status>; amount: 'all'|'half'|N; storeAs keeps the total in ctx.store.
  OP.register('wipe', function (ctx, e, B) {
    var what = e.what || 'claws';
    var targets = e.target ? B.targets(e.target, ctx, e) : [];
    if (!e.target || e.target === 'attackTarget') {
      var t0 = (ctx.data && ctx.data.target) || ctx.target; targets = t0 ? [t0] : [];
    }
    var total = 0;
    targets.forEach(function (x) {
      if (!x) return;
      if (x.kind === 'floor') {
        if (what === 'purr') { var pu = B.floorStatus(x.index, 'purr'); if (pu) { B.S.floors[x.index].statuses.purr = 0; delete B.S.floors[x.index].statuses.purr; total += pu; B.touch(); } }
        else if (what === 'box' || what === 'tape') {
          // box wipes flatten Boxes (into Flat Packs); tape wipes peel off Tape Squares (no Flat Pack)
          var n = e.amount === 'all' ? 99 : (typeof e.amount === 'number' ? e.amount : 1);
          B.S.floors[x.index].rooms.filter(function (r) { return r.rtype === 'box' && !!r.tape === (what === 'tape'); }).slice(0, n).forEach(function (r) { B.flattenBox(r, 'pest'); total++; });
        }
        else {
          // any other floor status: hairball piles, puddles, foil and so on
          var fs = B.S.floors[x.index].statuses, fcur = fs[aliasOf(what)] || 0;
          if (fcur) {
            var ftake = e.amount === 'all' || e.amount === undefined ? fcur : (e.amount === 'half' ? Math.ceil(fcur / 2) : Math.min(fcur, B.num(e.amount, ctx)));
            total += -B.addFloorStatus(x, aliasOf(what), -ftake);
          }
        }
        return;
      }
      if (!x.statuses) return;
      var id = what;
      if (what === 'purr' && x.kind === 'cat') {
        var fl = B.S.floors[x.floor]; if (fl && fl.statuses.purr) { total += fl.statuses.purr; delete fl.statuses.purr; B.touch(); }
        return;
      }
      if (what === 'fluff') {
        var have = x.fluff || 0;
        var take = e.amount === 'all' || e.amount === undefined ? have : (e.amount === 'half' ? Math.ceil(have / 2) : Math.min(have, B.num(e.amount, ctx)));
        total += B.stripFluff(x, take);
      } else {
        var cur = B.stn(x, aliasOf(id));
        var tk = e.amount === 'all' || e.amount === undefined ? undefined : (e.amount === 'half' ? Math.ceil(cur / 2) : B.num(e.amount, ctx));
        total += B.removeStatus(x, id, tk) || 0;
      }
    });
    if (e.storeAs) { ctx.store = ctx.store || {}; ctx.store[e.storeAs] = total; }
  });

  // applyStatus with { fromStored } amounts and `cap` as an alias of `max`
  ['applyStatus', 'addStatus', 'status'].forEach(function (name) {
    var orig = OP.get(name);
    if (typeof orig !== 'function' || orig._ppWrapped) return;
    var w = function (ctx, e, B) {
      var ee = e;
      if (e.amount && typeof e.amount === 'object' && e.amount.fromStored) {
        var v = (ctx.store && ctx.store[e.amount.fromStored]) || 0;
        ee = Object.assign({}, e, { amount: v });
      }
      if (ee.cap !== undefined && ee.max === undefined) ee = Object.assign({}, ee, { max: ee.cap });
      return orig(ctx, ee, B);
    };
    w._ppWrapped = true;
    OP.register(name, w);
  });

  // ---- passive helper ops (data refers to these through fx lists pushed by passive init)
  OP.register('guardDuty', function (ctx, e, B) {
    var g = ctx.self, s = ctx.subject;
    if (!g || g.dead || !s || s === g || s.kind !== 'pest' || s.dead || s.removed) return;
    if (s.floor !== g.floor || !B.hasTrait(s, 'dog')) return;
    B.addFluff(s, e.amount || 3);
  });
  OP.register('groomRuin', function (ctx, e, B) {
    var p = ctx.self, d = ctx.data || {};
    if (!p || p.dead || aliasOf(d.status) !== 'wet') return;
    if (!p.statuses.groomed_ruined) {
      B.stripFluff(p, 9999);
      B.addStatus(p, 'groomed_ruined', 1, { force: true });
      B.toast(p.name + ' is ruined');
    }
  });
  OP.register('packLeaderRage', function (ctx, e, B) {
    var p = ctx.self, s = ctx.subject;
    if (!p || p.dead || p.removed || !s || s === p) return;
    B.addStatus(p, 'rage', e.amount || 1, { src: 'pack_leader' });
  });
  OP.register('foilScare', function (ctx, e, B) {
    var p = ctx.self, c = ctx.subject;
    if (!p || p.dead || p.removed || !c || c.kind !== 'cat' || c.dead || c.floor !== p.floor) return;
    B.addStatus(c, 'scared', e.amount || 1, { src: p.id });
  });
  OP.register('wakeFromDead', function (ctx, e, B) {
    var p = ctx.self;
    if (!p || p.dead || !p.playDeadWake || B.S.round < p.playDeadWake) return;
    p.playDeadWake = 0; p.untargetable = false;
    B.addFluff(p, p.flags.playDeadFluff || 4);
    B.toast(p.name + ' wakes up');
  });
  OP.register('curlAnchor', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    p.flags.anchored = true; p.curlRound = B.S.round;
  });
  OP.register('uncurl', function (ctx, e, B) {
    var p = ctx.self;
    if (p && p.flags.anchored && p.curlRound !== undefined && B.S.round > p.curlRound) { p.flags.anchored = false; p.curlRound = undefined; }
  });
  OP.register('chaseDot', function (ctx, e, B) {
    var dot = ctx.self; if (!dot) return;
    floorCats(B, dot.floor).forEach(function (c) {
      if (c.napping || c.hidden || c.boxed || B.atk(c) <= 0) return;
      B.addStatus(c, 'frazzled', e.frazzled || 1, { src: dot.id });
      c.chaseRound = B.S.round + 1; c.chaseBy = dot.uid;
    });
  });
  OP.register('dotTimeout', function (ctx, e, B) {
    var p = ctx.self; if (!p || p.dead) return;
    p.counters.onBoard = (p.counters.onBoard || 0) + 1;
    var lim = p.flags.dotTimeout || 8;
    if (p.counters.onBoard >= lim || (p.meter && p.meter.stamina <= 0)) { p.dead = true; B.toast(p.name + ' clicks off'); }
  });
  // a Knocked Carrier Crate takes its passenger along
  OP.register('carryTrapped', function (ctx, e, B) {
    var p = ctx.self;
    if (!p || ctx.subject !== p || !p.trapped) return;
    p.trapped.forEach(function (u) { var c = (B.S.attached || []).filter(function (x) { return x.uid === u; })[0]; if (c) c.floor = p.floor; });
  });
  // pests created by this pest (summon sets `source`)
  E.targets.register('summonedByMe', function (c, e, B) {
    var me2 = c.self; if (!me2) return [];
    return live(B).filter(function (q) { return q.source === me2.uid; });
  });
  // Alarm Clock: a hit that does not kill it delays the next ring
  OP.register('delayCountdown', function (ctx, e, B) {
    var p = ctx.self;
    if (!p || p.dead || p.hp <= 0 || !p.pat || p.pat.cd === null || p.pat.cd === undefined) return;
    p.pat.cd = Math.min(e.max || 99, p.pat.cd + (e.amount || 1));
    if (E.ai) E.ai.select(B, p);
  });
  OP.register('stickyLint', function (ctx, e, B) {
    var a = ctx.target || (ctx.data && ctx.data.target);
    if (a && a.kind === 'cat') B.stripFluff(a, e.amount || 1);
  });
  OP.register('snoozeAlarm', function (ctx, e, B) {
    var p = ctx.self; if (!p || p.dead || p.removed) return;
    if (p.hp * 2 >= p.maxHp || p.counters.snoozed) return;
    p.counters.snoozed = 1;
    B.addStatus(p, 'dizzy', 2, { force: true });
    B.heal(p, 20);
    B.toast(p.name + ' hits Snooze');
  });
  OP.register('nestDrop', function (ctx, e, B) {
    var p = ctx.self; if (!p) return;
    // the stolen toys go back to their old floor, or the first floor with a free room slot
    (p.stolenRooms || []).forEach(function (r) {
      var order = [r.floor].concat([0, 1, 2].filter(function (x) { return x !== r.floor; }));
      for (var k = 0; k < order.length; k++) {
        var fi = order[k], f = B.S.floors[fi];
        if (f && f.rooms.length < f.capacity.rooms) {
          r.removed = false; r.floor = fi; f.rooms.push(r); B.reindex(fi); B.touch();
          B.emit('room', { uid: r.uid, id: r.id, floor: fi, rtype: r.rtype, name: r.name, action: 'place', returned: true });
          return;
        }
      }
    });
    p.stolenRooms = []; p.stolenRoom = null;
    if (OP.get('grantFish')) B.runEffects([{ op: 'grantFish', amount: e.fish || 20 }], ctx);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // passives
  // ---------------------------------------------------------------------------------------------------------------
  function reg(id, def) { PS.register(id, def); }
  var NOOP = { init: function () {} };

  // RULES section 10 ruling 4: Dazed is Dizzy, Tangled is Yarn. The engine tables still map Dazed to Yarn, so correct them here.
  if (SB.battle && SB.battle.STATUS_ALIAS) SB.battle.STATUS_ALIAS.dazed = 'dizzy';
  if (E.statuses && E.statuses.has('dizzy')) E.statuses.alias('dazed', 'dizzy');

  // ---- dogs (the former text-only entries)
  reg('fearless', { init: function (p) { p.immune = p.immune || []; if (p.immune.indexOf('scared') < 0) p.immune.push('scared'); } });
  reg('long_boy', NOOP); // the Stretch intent already reaches the floor above (floors: 'ownAndUp')
  reg('heavy', { init: function (p) { addTrait(p, 'heavy'); } });
  reg('stubborn', { init: function (p, ps) { p.flags.statusCap = Object.assign({}, p.flags.statusCap || {}, { dizzy: ps.cap || 1 }); } });
  reg('groomed', NOOP); // 10 Hide comes from the onSpawn list of the pest
  reg('wet_ruin', { init: function (p) { pushFx(p, 'onStatusApplied', [{ op: 'groomRuin' }]); } });
  reg('guard_duty', { init: function (p, ps) { pushFx(p, 'onPestSpawned', [{ op: 'guardDuty', amount: ps.amount || 3 }]); } });
  reg('leashed', NOOP); // Battle.knockPest refuses to move a Leashed dog while a Dog Walker stands
  reg('floor_budget', NOOP);
  reg('tracker', { init: function (p) { addTrait(p, 'tracker'); p.flags.ignoreHidden = true; } });
  reg('excited', {
    onDamaged: function (B, p, ps) {
      if (p.dead || p.hp <= 0 || p.flags.excitedUsed) return;
      if (p.hp * 2 < p.maxHp) { p.flags.excitedUsed = true; B.addStatus(p, 'rage', ps.rage || 3, { src: 'excited' }); }
    }
  });
  reg('climber_sneaky', { init: function (p) { addTrait(p, 'climber'); addTrait(p, 'sneaky'); } });
  reg('nocturnal', { init: function (p) { addTrait(p, 'nocturnal'); } });
  reg('pack_leader', { init: function (p, ps) { pushFx(p, 'onAnyDogDeath', [{ op: 'packLeaderRage', amount: ps.amount || 1 }]); } });
  reg('rage_floor', {
    init: function (p, ps) { p.flags.rageFloor = ps.min || 1; },
    attack: function (B, p) { var m = p.flags.rageFloor || 1; if (!p.dead && (p.statuses.rage || 0) < m) p.statuses.rage = m; return 0; }
  });

  // ---- household rule passives (AI.initPest looks these up as "rule:<first key>")
  reg('rule:immuneToScared', { init: function (p, ps) { p.flags.immuneScared = (ps.rule && ps.rule.immuneToScared) || ['hidden']; } });
  reg('rule:floorStatus', {
    init: function (p, ps) {
      p.flags.foil = true; p.flags.noRested = !!(ps.rule && ps.rule.noRested);
      pushFx(p, 'onCatDeployed', [{ op: 'foilScare', amount: 1 }]);
    }
  });
  reg('rule:anchored', { init: function (p) { addTrait(p, 'anchored'); } });
  reg('rule:heavy', { init: function (p) { addTrait(p, 'heavy'); } });
  reg('rule:nocturnal', { init: function (p) { addTrait(p, 'nocturnal'); } });
  reg('rule:capacity', {
    init: function (p, ps) {
      p.flags.capacity = (ps.rule && ps.rule.capacity) || 1;
      pushFx(p, 'onKnockLand', [{ op: 'carryTrapped' }]);
    }
  });
  reg('rule:onHitBy', { init: function (p) { pushFx(p, 'onHitBy', [{ op: 'stickyLint', amount: 1 }]); } });
  reg('rule:pausedByWet', { init: function (p) { p.flags.pausedByWet = true; } });
  reg('rule:sneakySunbeamDmg', { init: function (p) { addTrait(p, 'sneaky'); } });
  reg('rule:untargetable', {
    init: function (p) {
      p.untargetable = true; p.traitSet.untargetable = true; p.flags.laserDot = true;
      var d = SB.content.pest(p.id), raw = (d && d.raw) || {};
      p.meter = p.meter || {}; p.meter.stamina = raw.stamina || 8;
      p.flags.dotTimeout = (raw.timeout && raw.timeout.rounds) || 8;
      pushFx(p, 'onDusk', [{ op: 'dotTimeout' }]);
    }
  });
  reg('rule:staminaDrain', NOOP);  // paid in the catAttack wrapper below
  reg('rule:onCatAmbush', NOOP);   // paid in the catAttack wrapper below
  reg('rule:onPhase6', NOOP);

  // Bath Tub Tide: Splash and Overflow add the Water counter
  reg('tide', {
    attack: function (B, p) {
      var a = p.nextAction;
      if (!a || (a.id !== 'splash' && a.id !== 'overflow')) return 0;
      return (p.counters && p.counters.water) || 0;
    }
  });

  // Vet Scale: Verdict hits for 2 plus 2 per cat on the floor (read when the intent is built)
  reg('verdict', {
    attack: function (B, p, ps) {
      var a = p.nextAction;
      if (!a || a.id !== 'verdict') return 0;
      return (ps.per || 2) * B.S.floors[p.floor].cats.filter(function (c) { return !c.dead && !c.removed; }).length;
    }
  });
  // Tomcat: copies the strongest cat on its floor
  reg('mirror', {
    init: function (p) { p.flags.mirror = true; },
    attack: function (B, p, ps) {
      var a = p.nextAction;
      if (!a || !a.mirror) return 0;
      var c = E.ai.mirrorCat(B, p);
      return (c ? B.atk(c, true) : 0) + (ps.add || 0);
    }
  });
  // Possum: first lethal hit leaves 1 HP (handled in the damage wrapper), wakes with Fluff
  reg('playDead', {
    init: function (p, ps) {
      p.flags.playDead = true; p.flags.playDeadFluff = ps.fluff || 4;
      pushFx(p, 'onDusk', [{ op: 'wakeFromDead' }]);
    }
  });
  // Hedgehog: after Curl Up it is Anchored until its next action
  reg('curl', {
    init: function (p) {
      p.flags.curls = true;
      pushFx(p, 'onPestPhaseStart', [{ op: 'uncurl' }]);
    }
  });

  // ---- elites that were only flags
  // Count Cucumber: Scared cats are scared when the pest phase ends, Dusk would already have ticked them off
  PS.register('chill', { init: function (p) { p.flags.chill = true; moveFx(p, 'onDusk', 'onPestPhaseEnd'); } });
  // Mop and Bucket: wet while its floor is a Puddle (re-checked each round start and when the pest phase ends)
  PS.register('puddle_self', { init: function (p) { p.flags.puddleSelf = true; moveFx(p, 'onRoundStart', 'onPestPhaseStart'); } });
  // Static Duster: every hit it lands strips the Fluff of the target and both neighbours (applied in the damage wrapper)
  PS.register('cling', {
    init: function (p) {
      p.flags.cling = true;
      if (p.fx && p.fx.onPestAttack) p.fx.onPestAttack = p.fx.onPestAttack.filter(function (x) { return x.op !== 'stripFluff'; });
    }
  });
  // Wheelie Bin Warden: finds Hidden cats and hits them for double
  PS.register('sniff', { init: function (p) { p.flags.ignoreHidden = true; p.flags.doubleVsHidden = true; } });
  // Grand Finale Crate: Wet applied to it adds a round to the fuse (only Wet counts)
  PS.register('fizzle', {
    init: function (p) {
      p.flags.fizzle = true;
      if (p.fx && p.fx.onStatusApplied) p.fx.onStatusApplied = p.fx.onStatusApplied.filter(function (x) { return x.passiveId !== 'fizzle'; });
      pushFx(p, 'onStatusApplied', [{ op: 'fizzleFuse' }]);
    }
  });
  OP.register('fizzleFuse', function (ctx, e, B) {
    var p = ctx.self, d = ctx.data || {};
    if (!p || p.dead || aliasOf(d.status) !== 'wet') return;
    p.meter = p.meter || {};
    p.meter.fuse = Math.min(e.max || 5, (p.meter.fuse || 0) + 1);
  });

  // Magpie the Fence: stolen toys come back with the 20 Fish
  PS.register('nest', {
    init: function (p) {
      p.flags.nest = true;
      if (p.fx && p.fx.onDeath) p.fx.onDeath = p.fx.onDeath.filter(function (x) { return x.op !== 'returnStolen' && x.op !== 'grantFish'; });
      pushFx(p, 'onDeath', [{ op: 'nestDrop', fish: 20 }]);
    }
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Battle wrappers (thin, guarded so a double load does nothing)
  // ---------------------------------------------------------------------------------------------------------------
  if (BT && !BT._pestOpsPatched) {
    BT._pestOpsPatched = true;

    // Does this cat ignore Scared because of a living pest? (Count Cucumber, Thunderstorm)
    function scaredShield(B, cat) {
      var ps = live(B);
      for (var i = 0; i < ps.length; i++) {
        var list = ps[i].flags && ps[i].flags.immuneScared;
        if (!list) continue;
        for (var k = 0; k < list.length; k++) {
          var rule = list[k];
          if (rule === 'hidden' && (cat.hidden || cat.statuses.hidden)) return true;
          if (rule === 'catnipPeak' && (cat.statuses.catnip || 0) >= 4) return true;
          var m = /^pile>=(\d+)$/.exec(rule);
          if (m && pileSize(B, cat) >= +m[1]) return true;
        }
      }
      return false;
    }
    function pileSize(B, cat) {
      var runs = [], cur = [];
      floorCats(B, cat.floor).forEach(function (c) {
        if (c.statuses.shamed || c.statuses.coned) { if (cur.length) runs.push(cur); cur = []; return; }
        cur.push(c);
      });
      if (cur.length) runs.push(cur);
      for (var i = 0; i < runs.length; i++) if (runs[i].indexOf(cat) >= 0) return runs[i].length >= 2 ? runs[i].length : 0;
      return 0;
    }
    function foilOn(B, floor) { return live(B).some(function (p) { return p.floor === floor && p.flags && p.flags.noRested; }); }

    var _addStatus = BT.addStatus;
    BT.addStatus = function (u, id, n, o) {
      if (u && n > 0 && !(o && o.force && u.kind === 'cat')) {
        var key = aliasOf(id);
        if (u.kind === 'pest' && u.flags && u.flags.statusCap && u.flags.statusCap[key] !== undefined) {
          n = Math.min(n, u.flags.statusCap[key] - (u.statuses[key] || 0));
          if (n <= 0) return 0;
        }
        if (u.kind === 'cat') {
          if (key === 'scared' && scaredShield(this, u)) return 0;
          if (key === 'rested' && foilOn(this, u.floor)) return 0;
        }
      }
      return _addStatus.call(this, u, id, n, o);
    };

    var _spawnPest = BT.spawnPest;
    BT.spawnPest = function () {
      var u = _spawnPest.apply(this, arguments);
      if (u && !u.queued && !u.removed && !u.dead) this.fire('onPestSpawned', { subject: u, floor: u.floor });
      return u;
    };

    function clingStrip(B, src, tgt) {
      var list = [tgt];
      B.S.floors[tgt.floor].cats.forEach(function (c) { if (c !== tgt && !c.dead && !c.removed && Math.abs(c.pos - tgt.pos) === 1) list.push(c); });
      var total = 0;
      list.forEach(function (c) { total += B.stripFluff(c, 9999); });
      if (total > 0 && !src.dead) B.addFluff(src, Math.min(total, 20));
    }

    var _damage = BT.damage;
    BT.damage = function (tgt, base, o) {
      var r = _damage.apply(this, arguments);
      if (o && o.src && o.src.kind === 'pest' && o.src.flags && o.src.flags.cling && tgt && tgt.kind === 'cat' && (o.kind || 'hit') === 'hit' && !o.noCling && !tgt.removed) clingStrip(this, o.src, tgt);
      if (tgt && tgt.kind === 'pest' && tgt.dead && !tgt.removed && tgt.flags && tgt.flags.playDead && !tgt.flags.playDeadUsed) {
        tgt.flags.playDeadUsed = true;
        tgt.dead = false; tgt.killer = null; tgt.killedByKind = null; tgt.killedPounce = false; tgt.killedBy = null; tgt.killedByPest = null;
        this.setHp(tgt, 1);
        tgt.untargetable = true; tgt.playDeadWake = this.S.round + 1;
        this.addStatus(tgt, 'dizzy', 2, { force: true });
        this.toast(tgt.name + ' plays dead');
        this.touch();
      }
      return r;
    };

    var _catAttack = BT.catAttack;
    BT.catAttack = function (cat) {
      var S = this.S;
      var dots = live(this).filter(function (p) { return p.flags && p.flags.laserDot && p.floor === cat.floor; });
      if (dots.length && !cat.dead && !cat.removed && !cat.napping) {
        var dot = dots[0];
        if (cat.chaseRound === S.round && cat.chaseBy === dot.uid) {
          cat.chaseRound = undefined; cat.chased = true;
          dot.meter.stamina = Math.max(0, (dot.meter.stamina || 0) - 1);
          this.emit('chase', { uid: cat.uid, dot: dot.uid, stamina: dot.meter.stamina });
          if (dot.meter.stamina <= 0) { dot.dead = true; this.toast(dot.name + ' blinks out'); }
          return false;
        }
        if ((cat.hidden || cat.boxed) && this.atk(cat) > 0) {
          dot.meter.stamina = Math.max(0, (dot.meter.stamina || 0) - 4);
          this.toast(cat.name + ' catches the dot');
          if (dot.meter.stamina <= 0) { dot.dead = true; this.toast(dot.name + ' blinks out'); }
        }
      }
      return _catAttack.call(this, cat);
    };
  }

  // Magpie the Fence: remember the stolen Toy itself so Nest can give it back
  if (E.ai && E.ai.specials) {
    E.ai.specials.steal = function (B, p, a) {
      var rooms = [];
      B.S.floors.forEach(function (f) { f.rooms.forEach(function (r) { if (r.rtype === 'toy') rooms.push(r); }); });
      if (!rooms.length) return;
      var r = B.pickOne(rooms);
      B.removeRoom(r, 'stolen');
      p.stolenRoom = r.id; p.stolenRooms = (p.stolenRooms || []).concat([r]);
      B.toast(p.name + ' steals ' + r.name);
    };
  }

  // the laser dot's Tease uses `chase`
  OP.register('chase', function (ctx, e, B) { OP.get('chaseDot')(ctx, e, B); });

  // 'chasers' target: cats that gave chase this fight, falling back to the old pest-trait meaning
  (function () {
    var orig = E.targets.get('chasers');
    E.targets.register('chasers', function (c, e, B) {
      var cats = liveCats(B).filter(function (x) { return x.chased; });
      if (c.self && c.self.flags && c.self.flags.laserDot) return cats;
      return typeof orig === 'function' ? orig(c, e, B) : cats;
    });
  })();
})();
