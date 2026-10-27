/* SUNBEAM SIEGE champion and upgrade support ops (agent C4).
 * Loaded after the engine files (index.html opsFiles list). Only uses the registry convention
 * (SB.engine.ops / targets / checks / counters / triggers / flags) plus thin wrappers around Battle.prototype
 * methods where a champion flag has to change an existing rule. No em dashes.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var E = SB.engine, U = SB.util;
  if (!E || !SB.battle || !SB.battle.Battle) return;
  var P = SB.battle.Battle.prototype;
  function rv(key, d) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : d; }
  function one(x) { return x ? [x] : []; }
  function liveCats(B, f) { return B.S.floors[f].cats.filter(function (c) { return !c.dead && !c.removed; }); }
  function flagOn(B, floor, flag) { return liveCats(B, floor).some(function (c) { return c.flags && c.flags[flag]; }); }

  // ---- registry additions -----------------------------------------------------------------
  ['pounceSweep', 'boxesPermanentOnFloor', 'frenzyAnyFloor', 'overhealToFluff', 'fluffGainDouble', 'zoomTwice', 'immuneFrazzled', 'pileBonusDouble', 'boxDurability+3']
    .forEach(function (f) { E.flags.register(f, true); });
  E.stats.register('stretchPerRested', true);
  E.stats.register('stretchOwnPerRested', true);
  E.stats.register('stretchOwnFlat', true);


  // ---- triggers that champions listen to from the board ---------------------------------------
  // onShatter: any cat hears it when any pest takes Knock Shatter (data: Shadow B2).
  E.triggers.register('onShatter', { scope: 'any' });
  // onBoxFlattened: cats on the floor of the flattened Box hear it (Shadow C2).
  E.triggers.register('onBoxFlattened', { scope: 'floor' });
  // onAnyNap: any cat on the floor of a cat that just fell asleep hears it, triggerSource is the napper (Crumpet C1).
  E.triggers.register('onAnyNap', { scope: 'floor' });
  var baseNapCat = P.napCat;
  P.napCat = function (cat, o) {
    var r = baseNapCat.apply(this, arguments);
    if (r && cat && cat.napping) { this.fire('onAnyNap', { subject: cat, floor: cat.floor }); }
    return r;
  };

  // ---- checks ---------------------------------------------------------------------------------
  // True during the round of a Witching Hour (Maxine final C, Duchess final C).
  E.checks.register('isZoomiesTurn', function (ctx, e, B) { return !!(B.S.clock && B.S.clock.isWitching); });

  // ---- Maxine -----------------------------------------------------------------------------------
  // frenzyAnyFloor: the first Frenzy hit hits her own front pest, the extra hits pick pests on any floor.
  var baseCatAttack = P.catAttack;
  P.catAttack = function (cat) {
    if (!(cat && cat.flags && cat.flags.frenzyAnyFloor && (cat.statuses.frenzy || 0) > 0)) return baseCatAttack.call(this, cat);
    var self = this, fl = cat.floor, orig = P.targetablePests;
    this.targetablePests = function (fi) {
      var own = orig.call(self, fi);
      if (fi !== fl || !own.length) return own;
      var more = [];
      for (var g = 0; g < self.numFloors; g++) if (g !== fl) more = more.concat(orig.call(self, g));
      return own.concat(more);
    };
    try { return baseCatAttack.call(this, cat); } finally { delete this.targetablePests; }
  };


  // ---- fight end -------------------------------------------------------------------------------
  // battle.js never fires onBattleEnd for cats, so cat effects written as onFightEnd (Duchess A2) get it here on a win.
  var baseFinish = P.finish;
  P.finish = function (outcome) {
    if (outcome === 'win' && !this.S.over && !this._endFiring) {
      this._endFiring = true;
      try { this.fire('onBattleEnd', { subject: null }); this.drain(); } finally { this._endFiring = false; }
    }
    return baseFinish.call(this, outcome);
  };

  // ---- Hearth: Duchess -------------------------------------------------------------------------
  // fluffGainDouble: Fluff the owner gains is doubled.
  var baseAddFluff = P.addFluff;
  P.addFluff = function (u, n, o) {
    if (u && u.kind === 'cat' && u.flags && u.flags.fluffGainDouble && n > 0) n = n * 2;
    return baseAddFluff.call(this, u, n, o);
  };
  // overhealToFluff: while such a cat is on the board, healing beyond full Health becomes Fluff on the healed cat.
  var baseHeal = P.heal;
  P.heal = function (u, n, o) {
    var g = baseHeal.call(this, u, n, o);
    if (u && u.kind === 'cat' && n > 0 && g < n && !u.removed && !u.dead && this.cats().some(function (c) { return c.flags && c.flags.overhealToFluff && !c.removed && !c.dead; })) {
      this.addFluff(u, n - g, {});
    }
    return g;
  };
  // zoomTwice / witchingMaster: Witching Hour Zoom hits twice, or at full damage.
  var baseZoom = P.zoomAttack;
  P.zoomAttack = function (cat) {
    var rules = SB.data.rules, old = rules.zoom_damage_divisor, self = this;
    var once = function () {
      if (cat.flags && cat.flags.witchingMaster) { rules.zoom_damage_divisor = 1; try { return baseZoom.call(self, cat); } finally { rules.zoom_damage_divisor = old; } }
      return baseZoom.call(self, cat);
    };
    var r = once();
    if (r && cat.flags && cat.flags.zoomTwice && !cat.removed && !cat.dead) once();
    return r;
  };
  // immuneFrazzled / witchingMaster: never Frazzled
  var baseAddStatus = P.addStatus;
  P.addStatus = function (u, id, n, o) {
    if (id === 'frazzled' && u && u.kind === 'cat' && u.flags && (u.flags.immuneFrazzled || u.flags.witchingMaster)) return 0;
    return baseAddStatus.call(this, u, id, n, o);
  };
  // napNoSkip: a napping cat with the flag still attacks.
  var prevCatAttack = P.catAttack;
  P.catAttack = function (cat) {
    if (cat && cat.napping && cat.flags && cat.flags.napNoSkip) {
      cat.napping = false;
      try { return prevCatAttack.call(this, cat); } finally { cat.napping = true; }
    }
    return prevCatAttack.call(this, cat);
  };
  // ---- Hearth: Crumpet -------------------------------------------------------------------------
  // napOnDeploy on a champion lets every cat on the floor Nap the turn it is played.
  var baseCanNap = P.canNap;
  P.canNap = function (cat, forced) {
    var granted = false;
    if (!forced && cat && cat.flags && !cat.flags.napOnDeploy && this.S.floors[cat.floor].cats.some(function (c) { return c !== cat && c.flags && c.flags.napOnDeploy && !c.removed && !c.dead; })) {
      cat.flags.napOnDeploy = true; granted = true;
    }
    try { return baseCanNap.call(this, cat, forced); } finally { if (granted) delete cat.flags.napOnDeploy; }
  };
  // pileBonusDouble on a champion applies to the whole floor (the flag is read per cat in recalc).
  var baseRecalc = P.recalc;
  P.recalc = function () {
    this.S.floors.forEach(function (f) {
      var src = f.cats.some(function (c) { return c.flags && c.flags.pileBonusDouble && !c.__pbd && !c.removed && !c.dead; });
      f.cats.forEach(function (c) {
        if (src && !(c.flags && c.flags.pileBonusDouble)) { c.flags.pileBonusDouble = true; c.__pbd = 1; }
        else if (!src && c.__pbd) { delete c.flags.pileBonusDouble; c.__pbd = 0; }
      });
    });
    return baseRecalc.apply(this, arguments);
  };
  // restedCap: cats on a floor with such a champion can hold more Rested.
  var baseStatusMax = P.statusMax;
  P.statusMax = function (u, id) {
    var m = baseStatusMax.call(this, u, id);
    if (id === 'rested' && u && u.kind === 'cat' && this.S.floors[u.floor]) {
      this.S.floors[u.floor].cats.forEach(function (c) { if (c.mods && c.mods.restedCap && !c.removed && !c.dead) m += c.mods.restedCap; });
    }
    return m;
  };
  var restedDef = E.statuses.get('rested');
  if (restedDef) restedDef.dusk = function (B) {
    B.cats().forEach(function (c) {
      if (!c.napping || c.dead) return;
      B.heal(c, rv('nap_heal_per_round', 2) + (c.flags.napHealBonus || 0));
      var gain = rv('rested_gain_per_round', 1) + (B.S.floors[c.floor].statuses.heat_lamp ? 1 : 0) + (c.kw.deepsleep ? 1 : 0);
      if (B.S.floors[c.floor].statuses.foil) gain = 0;
      var cur = c.statuses.rested || 0, max = B.statusMax(c, 'rested');
      var add = Math.min(max - cur, gain);
      if (add > 0) { c.statuses.rested = cur + add; B.emit('status', { uid: c.uid, status: 'rested', amount: add, total: cur + add, floor: c.floor, pos: c.pos, side: 'cat', kind: 'add' }); B.statMax('maxRested', cur + add); }
      B.fire('onNapTick', { subject: c, floor: c.floor });
    });
  };
  // stretchPerRested: Stretch damage +N per Rested stack for cats waking on a floor with such a champion.
  var baseWake = P.wakeCat;
  P.wakeCat = function (cat, o) {
    var rested = cat && cat.statuses ? (cat.statuses.rested || 0) : 0, per = 0, flat = 0;
    if (cat && this.S.floors[cat.floor]) this.S.floors[cat.floor].cats.forEach(function (c) { if (c.mods && c.mods.stretchPerRested && !c.removed && !c.dead) per += c.mods.stretchPerRested; });
    // upgrades on the waking cat itself: Deep Sleeper (per Rested stack) and Deep Stretch (flat)
    if (cat && cat.mods) { per += cat.mods.stretchOwnPerRested || 0; flat += cat.mods.stretchOwnFlat || 0; }
    var r = baseWake.call(this, cat, o);
    var extra = (rested > 0 ? rested * per : 0) + flat;
    if (r && extra > 0 && !(o && o.noStretch) && !cat.dead && !cat.removed) {
      var tgt = this.frontPest(cat.floor);
      if (tgt) { this.damage(tgt, extra, { src: cat, kind: 'hit', melee: true, noClaws: true, noAmbush: true }); this.reap(); this.drain(); }
    }
    return r;
  };
  // kneadDouble: permanent ("run") buffs the owner makes are doubled.
  var baseBuff = E.ops.get('buff');
  E.ops.register('buff', function (ctx, e, B) {
    if (e && e.duration === 'run' && ctx.self && ctx.self.kind === 'cat' && ctx.self.flags && ctx.self.flags.kneadDouble && !e.__doubled) {
      e = Object.assign({}, e, { amount: B.num(e.amount, ctx) * 2, __doubled: true });
    }
    return baseBuff(ctx, e, B);
  });

  // ---- Shadow ------------------------------------------------------------------------------
  // "attackTarget" on onAttack / onCatAttack triggers (no explicit target in the event): the front pest the cat will hit.
  var baseAttackTarget = E.targets.get('attackTarget');
  E.targets.register('attackTarget', function (ctx, e, B) {
    var d = ctx.data, s = ctx.subject;
    var explicit = !!((d && d.target) || ctx.target);
    // remembered per fire, so several effects on one attack all aim at the same pest even after it was Knocked away
    if (!explicit && d && d._atkTarget && !d._atkTarget.dead && !d._atkTarget.removed && !d._atkTarget.queued) return [d._atkTarget];
    var r = baseAttackTarget(ctx, e, B);
    if (!(r && r.length) && s && s.kind === 'cat') { var fp = B.frontPest(s.floor); r = fp ? [fp] : []; }
    if (!explicit && d && r && r.length) d._atkTarget = r[0];
    return r || [];
  });
  E.targets.register('knockedEnemy', function (ctx) { var t = ctx.data && ctx.data.target; return one(t && t.kind === 'pest' ? t : null); });
  // a Knock only counts as "hers" when the champion is the one who pushed
  E.checks.register('subjectIsSelf', function (ctx) { return !!(ctx.self && ctx.subject === ctx.self); });

  // Pounce Sweep (Shadow final A): the Pounce hits every pest on the floor, only the front one takes the Ambush bonus.
  var basePounce = P.pounceAttack;
  P.pounceAttack = function (cat, n, o) {
    var fl = (o && o.floor !== undefined) ? o.floor : cat.floor;
    var front = (o && o.target) || this.frontPest(fl);
    var did = basePounce.call(this, cat, n, o);
    if (did && cat.flags && cat.flags.pounceSweep && !cat.dead && !cat.removed) {
      var self = this, pw = this.atk(cat) + n;
      this.targetablePests(fl).filter(function (p) { return p !== front; })
        .forEach(function (p) { if (!cat.dead && !p.dead) self.catHit(cat, p, pw, { kind: 'pounce', pounce: true, noAmbush: true }); });
      this.drain();
    }
    return did;
  };

  // Boxes that never wear out (Shadow final C)
  var baseBoxDamage = E.ops.get('boxDamage');
  E.ops.register('boxDamage', function (ctx, e, B) {
    var floors = B.targets(e.target || 'thisFloor', ctx, e).filter(function (t) { return t.kind === 'floor'; });
    var protectedFloor = floors.length && floors.every(function (f) { return flagOn(B, f.index, 'boxesPermanentOnFloor'); });
    if (protectedFloor) return;
    return baseBoxDamage(ctx, e, B);
  });

  // =====================================================================================================
  // Shared damage wrapper: Ethereal, enemy auras (damageTaken), and cheatDeathOnce for the whole floor.
  // =====================================================================================================
  var baseDamage = P.damage;
  P.damage = function (tgt, base, o) {
    o = o || {};
    var kind = o.kind || 'hit';
    // Ethereal: the next hits from pests against this cat deal 0, one stack per hit.
    if (tgt && tgt.kind === 'cat' && !tgt.dead && !tgt.removed && kind === 'hit' && base > 0 && (tgt.statuses.ethereal || 0) > 0 && o.src && o.src.kind === 'pest') {
      this.removeStatus(tgt, 'ethereal', 1);
      this.emit('damage', { uid: tgt.uid, side: 'cat', from: o.src.uid, amount: 0, absorbed: 0, dmgKind: 'hit', floor: tgt.floor, pos: tgt.pos, lethal: false, hp: tgt.health, fluff: tgt.fluff, prevented: true, ethereal: true });
      this.fire('onEtherealPrevent', { subject: o.src, target: tgt, floor: tgt.floor, amount: base });
      return 0;
    }
    // Aura "damageTaken" on pests: flat bonus on every hit that would deal damage (Parcel 2b).
    if (tgt && tgt.kind === 'pest' && kind === 'hit' && base > 0) {
      if (this._dirty && this.cats().some(function (c) { return c.aura && c.aura.some(function (x) { return x.stat === 'damageTaken'; }); })) this.recalc();
      if (tgt._aura && tgt._aura.damageTaken) base += tgt._aura.damageTaken;
    }
    // cheatDeathOnce on a champion covers every cat on her floor, once per fight in total.
    var src = null;
    if (tgt && tgt.kind === 'cat' && !tgt.dead && !tgt.removed && this.S.floors[tgt.floor]) {
      var list = this.S.floors[tgt.floor].cats;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c !== tgt && c.flags && c.flags.cheatDeathOnce && !c.counters.cheated && !c.dead && !c.removed) { src = c; break; }
      }
    }
    if (!src) return baseDamage.call(this, tgt, base, o);
    var had = tgt.flags.cheatDeathOnce, prev = tgt.counters.cheated, loss;
    tgt.flags.cheatDeathOnce = true; tgt.counters.cheated = 0;
    try { loss = baseDamage.call(this, tgt, base, o); }
    finally {
      if (tgt.counters.cheated) src.counters.cheated = 1;
      tgt.counters.cheated = prev;
      if (had === undefined) delete tgt.flags.cheatDeathOnce; else tgt.flags.cheatDeathOnce = had;
    }
    return loss;
  };
  ['addStatus', 'removeStatus'].forEach(function (fn) {
    var orig = P[fn];
    P[fn] = function () { var r = orig.apply(this, arguments); this._dirty = true; return r; };
  });
  // Ethereal: a stacking buff with a cap of 3 (champion tiers can raise it), no Dusk decay.
  var etherealDef = E.statuses.get('ethereal');
  if (etherealDef && typeof etherealDef === 'object') { etherealDef.kind = 'I'; etherealDef.max = 3; }
  E.triggers.register('onEtherealPrevent', { scope: 'any' });
  E.counters.register('preventedDamage', function (ctx) { return (ctx.data && ctx.data.amount) || 0; });
  // pests: aura power (Tuppence 3a) counts as attack
  var basePestBonus = P.pestBonus;
  P.pestBonus = function (p) { return basePestBonus.call(this, p) + ((p && p._aura && p._aura.power) || 0); };

  // =====================================================================================================
  // Moon and Mischief champions: generic support for the A06 patch format (see champions-mm.js NEEDS)
  // =====================================================================================================
  function unitFor(c) { return c.filterUnit || c.subject || (c.data && c.data.target) || c.target || null; }
  // filter checks look at the unit being filtered first
  E.checks.register('targetLives', function (c) { var t = c.filterUnit || c.subject || (c.data && c.data.target) || c.target; return t && t.lives !== undefined ? t.lives : 0; });
  E.checks.register('targetInBox', function (c) { var t = unitFor(c); return !!(t && t.boxed); });
  E.checks.register('targetMarked', function (c) { var t = unitFor(c); return !!(t && t.statuses && t.statuses.marked); });
  E.checks.register('subjectIsNotSelf', function (ctx) { return !!(ctx.self && ctx.subject && ctx.subject !== ctx.self); });
  // other pests on the floor: never the pest that triggered the effect
  E.targets.register('otherEnemiesOnFloor', function (c, e, B) {
    var f = B.ctxFloor(c);
    return B.S.floors[f].pests.filter(function (x) {
      var t = (c.data && c.data.target) || c.target;
      return !x.dead && !x.removed && !x.untargetable && x !== c.self && x !== c.subject && !(t && t.kind === 'pest' && x === t);
    });
  });

  // Effects may name their own floor: floorOf "triggerSource" or floor "chosenFloor"; the Landed trigger resolves on the landing floor.
  var baseRunEffect = P.runEffect;
  P.runEffect = function (e, ctx, key) {
    if (e && ctx) {
      var fo = null;
      if (e.floorOf === 'triggerSource') {
        fo = ctx.subject && ctx.subject.floor !== undefined ? ctx.subject.floor : (ctx.data && ctx.data.floor !== undefined ? ctx.data.floor : null);
      } else if (e.floor === 'chosenFloor' && ctx.choice && ctx.choice.floor !== undefined) fo = ctx.choice.floor;
      else if (ctx.trigger === 'onAnyEnemyLanded' && ctx.subject && ctx.subject.kind === 'pest') fo = ctx.subject.floor;
      if (fo !== null && fo !== undefined) {
        ctx = Object.assign({}, ctx, { floorOverride: fo });
        if (e.floorOf) { e = Object.assign({}, e); delete e.floorOf; }   // resolved here; ops with their own floorOf handling must not redo it
      }
    }
    return baseRunEffect.call(this, e, ctx, key);
  };

  // activated abilities: by id or index, with a chosen target ({catUid} or {floor}) and the `requires` list
  var baseUse = P.useAbility;
  P.useAbility = function (catUid, idx, target) {
    if (idx === 'scratch') return baseUse.call(this, catUid, idx);
    var S = this.S, c = this.catByUid(catUid);
    if (S.over || S.turn !== 'player' || !c || c.dead || c.removed) return { ok: false, reason: 'Not available' };
    var list = c.activated || [], a = null, index = 0;
    if (typeof idx === 'string') { for (var i = 0; i < list.length; i++) if (list[i].id === idx) { a = list[i]; index = i; break; } }
    else { index = idx || 0; a = list[index]; }
    if (!a) return { ok: false, reason: 'No ability' };
    var tcat = target && target.catUid ? this.catByUid(target.catUid) : null;
    if (a.targeting === 'cat' && !tcat) return { ok: false, reason: 'Choose a cat' };
    if (a.targeting === 'floor' && !(target && target.floor !== undefined)) return { ok: false, reason: 'Choose a floor' };
    var key = 'act:' + c.uid + ':' + index;
    if (a.requires && a.requires.length) {
      var rctx = this.makeCtx({ src: { kind: 'cat', unit: c }, self: c, subject: tcat || c, target: tcat, choice: target || null, floorOverride: c.floor, lk: key });
      if (!this.checkAll(a.requires, rctx)) return { ok: false, reason: 'That cat does not qualify' };
    }
    var cost = a.free ? 0 : (a.cost || 0);
    if (cost > S.zoomies) return { ok: false, reason: 'Not enough Zoomies' };
    if (a.limit && !this.limitOk(key, a.limit, null)) return { ok: false, reason: 'Already used' };
    S.zoomies -= cost;
    this.emit('play', { uid: c.uid, id: c.id, name: a.name || c.name, type: 'ability', cost: cost, floor: c.floor });
    var ctx = this.makeCtx({ src: { kind: 'cat', unit: c }, self: c, subject: c, target: tcat, choice: target || null, floorOverride: c.floor, lk: key });
    this.runEffects(a.effects || a.do || [], ctx);
    this.drain(); this.reap(); this.refresh();
    return { ok: true };
  };

  // champion rules (card.rules, active while the champion is on the board)
  function champRule(B, key) {
    var val;
    B.cats().forEach(function (c) { if (c.rules && c.rules[key] !== undefined && !c.removed && !c.dead) val = c.rules[key]; });
    return val;
  }
  var baseMod = P.mod;
  P.mod = function (name, dflt) {
    var v = baseMod.call(this, name, dflt);
    if (name === 'surgeAt' || name === 'surgeZoomies' || name === 'crashTurns') {
      var r = champRule(this, name === 'surgeAt' ? 'surgeThreshold' : name);
      if (r !== undefined) {
        if (name === 'surgeAt') return (v || 0) + (r - rv('nip_max', 10));
        if (name === 'surgeZoomies') return (v || 0) + (r - rv('surge_zoomies_now', 2));
        return (v || 0) + (r - 1 - Math.floor(((this.S.nip && this.S.nip.excess) || 0) / rv('crash_excess_divisor', 3)));
      }
    }
    return v;
  };
  var baseBeginRound = P.beginRound;
  P.beginRound = function () {
    var rules = SB.data.rules, kz = 'crash_zoomies_penalty', kd = 'crash_draw_penalty';
    var hz = Object.prototype.hasOwnProperty.call(rules, kz), hd = Object.prototype.hasOwnProperty.call(rules, kd), oz = rules[kz], od = rules[kd];
    if (this.S.round >= 0) {
      if (champRule(this, 'crashZoomiesPenalty') === 0) rules[kz] = 0;
      if (champRule(this, 'crashDrawPenalty') === 0) rules[kd] = 0;
    }
    try { return baseBeginRound.call(this); }
    finally {
      if (hz) rules[kz] = oz; else delete rules[kz];
      if (hd) rules[kd] = od; else delete rules[kd];
    }
  };
  var baseAddNip = P.addNip;
  P.addNip = function (n) {
    var nip = this.S.nip;
    if (n > 0 && nip.surge > 0 && champRule(this, 'nipKeptDuringSurge')) {
      var cap = rv('nip_max', 10) + this.mod('surgeAt', 0);
      nip.meter = Math.min(cap + rv('nip_excess_cap', 5), nip.meter + n);
      this.emit('nip', { meter: nip.meter, max: cap, amount: n });
      return n;
    }
    return baseAddNip.call(this, n);
  };

  // cat deaths: onAnyDeath for cats, after the Life accounting (the subject carries the NEW Life count)
  var baseCatDown = P.catDown;
  P.catDown = function (c) {
    var r = baseCatDown.call(this, c);
    if (c && c.instUid) {
      var inst = this.instByUid(c.instUid);
      if (inst) c.lives = inst.lives;
      this.fire('onAnyDeath', { subject: c, floor: c.floor });
    }
    return r;
  };
  // dead pests parked in the Garden (Evict, Shatter on a pest that left through the flap) are cleaned up
  var baseReap = P.reap;
  P.reap = function () {
    var r = baseReap.apply(this, arguments);
    var S = this.S, self = this;
    if (S.garden && S.garden.some(function (p) { return p.dead; })) {
      var dead = S.garden.filter(function (p) { return p.dead; });
      S.garden = S.garden.filter(function (p) { return !p.dead; });
      dead.forEach(function (p) { p.removed = true; self.emit('death', { uid: p.uid, side: 'pest', id: p.id, name: p.name, floor: p.floor, pos: p.pos, killer: p.killer || null }); self.pestDown(p); });
      this.checkEnd();
    }
    return r;
  };
  // last-life save: the cat comes back on the board with 1 Health and Fluff (Oswin 3c)
  var baseSpendLifeFor = P.spendLifeFor;
  P.spendLifeFor = function (c, inst, cost) {
    this.S.reviveSpec = null;
    var r = baseSpendLifeFor.call(this, c, inst, cost);
    var spec = this.S.reviveSpec;
    if (spec && spec.uid === c.uid) {
      this.S.reviveSpec = null;
      var S = this.S, di = S.discard.indexOf(c.cardUid);
      if (di >= 0) S.discard.splice(di, 1);
      var u = this.deployCat(c.cardUid, c.floor, c.pos, { noPounce: true, noDeploy: true, noFightStart: true, noBox: true, from: 'save' });
      if (u) { u.health = Math.max(1, spec.health || 1); u.fluff = spec.fluff || 0; this.touch(); this.emit('status', { uid: u.uid, status: 'fluff', amount: u.fluff, total: u.fluff, floor: u.floor, pos: u.pos, side: 'cat', kind: 'add' }); }
    }
    return r;
  };
  E.ops.register('saveCat', function (ctx, e, B) {
    var c = ctx.subject, payer = ctx.self, S = B.S;
    if (!c || c.kind !== 'cat' || !c.instUid || !payer || payer === c || payer.kind !== 'cat') return;
    S.savedInst = S.savedInst || {};
    if (S.savedInst[c.instUid]) return;              // once per cat per fight
    if (!B.spendLife(payer, e.pay || 1, { voluntary: true })) return;
    S.savedInst[c.instUid] = true;
    S.preventLife = true;
    S.counters.prevented = (S.counters.prevented || 0) + 1;
    S.reviveSpec = { uid: c.uid, health: e.health || 1, fluff: e.fluff || 0 };
  });
  // a cat that died and kept a Life: its card goes from the discard pile to the hand
  var baseMoveCard = E.ops.get('moveCard');
  E.ops.register('moveCard', function (ctx, e, B) {
    var list = B.targets(e.target || 'triggerSource', ctx, e);
    var dead = list.filter(function (t) { return t && t.kind === 'cat' && (t.removed || t.dead); });
    if (!dead.length) return baseMoveCard(ctx, e, B);
    dead.forEach(function (t) {
      var S = B.S, i = S.discard.indexOf(t.cardUid);
      if (i < 0 || S.hand.length >= B.handLimit()) return;
      S.discard.splice(i, 1); S.hand.push({ uid: t.cardUid, card: null });
      B.syncPiles(); B.emit('draw', { uid: t.cardUid, id: t.id, returned: true });
    });
  });
  // spendLives: remember the total spent by this use (Cash Out damage scales with it)
  E.ops.register('spendLives', function (ctx, e, B) {
    var total = 0;
    B.targets(e.target || 'allCats', ctx, e).forEach(function (t) {
      if (!t || t.kind !== 'cat') return;
      var n = e.amount === 'all' ? t.lives - (e.keep || 0) : B.num(e.amount, ctx);
      if (n > 0 && t.lives - n >= (e.keep || 1)) { if (B.spendLife(t, n, { voluntary: true })) { B.addToBank(n); total += n; } }
    });
    B.S.spentNow = total;
  });
  E.counters.register('livesSpentNow', function (ctx, e, B) { return B.S.spentNow || 0; });
  // Fluff with a filter (Oswin 1c)
  var baseFluffOp = E.ops.get('fluff');
  E.ops.register('fluff', function (ctx, e, B) {
    if (!e.filter) return baseFluffOp(ctx, e, B);
    var n = B.num(e.amount, ctx);
    B.targets(e.target || 'self', ctx, e).forEach(function (t) {
      if (!t || (t.kind !== 'cat' && t.kind !== 'pest')) return;
      if (!B.checkAll(e.filter, Object.assign({}, ctx, { filterUnit: t }))) return;
      if (n > 0) B.addFluff(t, n, {});
    });
  });
  // Evict: removed for good and counted as defeated (bosses and Anchored are exempt)
  E.ops.register('evict', function (ctx, e, B) {
    B.targets(e.target || 'triggerSource', ctx, e).forEach(function (p) {
      if (!p || p.kind !== 'pest' || p.boss || p.dead) return;
      if (p.traitSet && p.traitSet.anchored) return;
      if (e.filter && !B.checkAll(e.filter, Object.assign({}, ctx, { filterUnit: p }))) return;
      p.dead = true; p.killer = null; p.evicted = true;
    });
    B.reap();
  });
  // damage that scales with Yarn on the individual target (Parcel 1b) or on its floor (Parcel 3b, bosses half)
  var baseDamageOp = E.ops.get('damage');
  E.ops.register('damage', function (ctx, e, B) {
    var a = e.amount;
    if (!(a && typeof a === 'object' && (a.per === 'targetYarn' || a.per === 'yarnOnTargetFloor'))) return baseDamageOp(ctx, e, B);
    var kind = e.kind === 'shatter' ? 'shatter' : 'hit';
    var src = ctx.self && (ctx.self.kind === 'cat' || ctx.self.kind === 'pest') ? ctx.self : null;
    B.targets(e.target || 'chosenEnemy', ctx, e).forEach(function (t) {
      if (!t || t.kind !== 'pest' || t.dead) return;
      var y = 0;
      if (a.per === 'targetYarn') y = t.statuses.yarn || 0;
      else B.S.floors[t.floor].pests.forEach(function (q) { if (!q.dead) y += q.statuses.yarn || 0; });
      var n = (a.base || 0) + Math.floor((a.mult === undefined ? 1 : a.mult) * y);
      if (a.per === 'yarnOnTargetFloor' && t.boss) n = Math.floor(n / 2);
      if (n > 0) B.damage(t, n, { kind: kind, src: src, noClaws: true, noAmbush: true, srcId: 'effect' });
    });
  });

  // knock with an `ignoreGrip` flag on the effect (Tumble 3c extra Knocks)
  var baseKnockOp = E.ops.get('knock');
  E.ops.register('knock', function (ctx, e, B) {
    if (!e.ignoreGrip) return baseKnockOp(ctx, e, B);
    var src = ctx.self && ctx.self.kind === 'cat' ? ctx.self : null;
    var n = B.num(e.amount === undefined ? 1 : e.amount, ctx);
    B.targets(e.target || 'frontEnemy', ctx, e).forEach(function (p) {
      if (p && p.kind === 'pest' && !p.dead) B.knockPest(p, n, { src: src, ignoreGrip: true });
    });
  });

  // =====================================================================================================
  // Upgrades: keyword riders (Knock Plus, Yarn Binder, Hairball Heirloom) and Cardboard Castle
  // =====================================================================================================
  // A scratch can grant the keyword "knock", "yarn" or "hairball" with a number. The card's own Knock, Yarn and Hairball effects
  // get that number added, whether the card is being played (ctx.card) or is a cat on the board (ctx.self).
  function rider(ctx, name) {
    var n = 0;
    if (ctx.card && ctx.card.keywords && typeof ctx.card.keywords[name] === 'number') n += ctx.card.keywords[name];
    else if (ctx.self && ctx.self.kind === 'cat' && ctx.self.kw && typeof ctx.self.kw[name] === 'number') n += ctx.self.kw[name];
    return n;
  }
  function withRider(opName, name, match) {
    var base = E.ops.get(opName);
    E.ops.register(opName, function (ctx, e, B) {
      if (!match(e)) return base(ctx, e, B);
      var r = rider(ctx, name);
      if (!r) return base(ctx, e, B);
      return base(ctx, Object.assign({}, e, { amount: B.num(e.amount === undefined ? 1 : e.amount, ctx) + r }), B);
    });
  }
  withRider('knock', 'knock', function () { return true; });
  // "knockShatter": extra Shatter per floor on the Knocks of a card or cat that carries it
  E.keywords.register('knockShatter', true);
  var baseKnockOp3 = E.ops.get('knock');
  E.ops.register('knock', function (ctx, e, B) {
    var extra = rider(ctx, 'knockShatter');
    if (!extra) return baseKnockOp3(ctx, e, B);
    return baseKnockOp3(ctx, Object.assign({}, e, { shatter: (e.shatter || SB.data.rules.knock_shatter_per_floor || 2) + extra }), B);
  });
  withRider('applyStatus', 'yarn', function (e) { return e.status === 'yarn'; });
  withRider('applyStatus', 'hairball', function (e) { return e.status === 'hairball'; });
  withRider('floorStatus', 'hairball', function (e) { return e.status === 'hairball'; });
  // Hairball Heirloom: the Hairball cards a card (or cat) creates deal more damage when played
  var baseCreateOp = E.ops.get('createCard');
  E.ops.register('createCard', function (ctx, e, B) {
    var r = rider(ctx, 'hairball');
    if (!r) return baseCreateOp(ctx, e, B);
    var before = {}; Object.keys(B.S.cards).forEach(function (k) { before[k] = 1; });
    var out = baseCreateOp(ctx, e, B);
    Object.keys(B.S.cards).forEach(function (k) {
      var rec = B.S.cards[k];
      if (before[k] || !rec || !rec.eff || rec.eff.id !== 'curse_hairball') return;
      ((rec.eff.effects && rec.eff.effects.onPlay) || []).forEach(function (x) { if (x.type === 'damage' && typeof x.amount === 'number') x.amount += r; });
      rec.eff.text = (rec.eff.text || '').replace(/Deal (\d+) damage/, function (m, n) { return 'Deal ' + (parseInt(n, 10) + r) + ' damage'; });
    });
    return out;
  });

  // Cardboard Castle: the Boxes a card with the flag places hold 1 more cat and have +3 durability
  var baseBoxOp2 = E.ops.get('box');
  E.ops.register('box', function (ctx, e, B) {
    var f = ctx.card && ctx.card.flags;
    if (!f || !(f['boxCapacity+1'] || f['boxDurability+3'])) return baseBoxOp2(ctx, e, B);
    B._castle = { cap: !!f['boxCapacity+1'], dur: f['boxDurability+3'] ? 3 : 0 };
    try { return baseBoxOp2(ctx, e, B); } finally { B._castle = null; }
  });
  var basePlaceBox2 = P.placeBox;
  P.placeBox = function (floor, o) {
    var room = basePlaceBox2.call(this, floor, o);
    if (room && this._castle) {
      if (this._castle.cap) room.fits += 1;
      if (this._castle.dur) { room.durability += this._castle.dur; room.maxDurability += this._castle.dur; }
    }
    return room;
  };

  // "played this fight" with no card named means the card this effect belongs to (Fish Finder)
  E.checks.register('playedThisFight', function (c, e, B) {
    var id = e.card || e.id;
    if (!id && c.self && c.self.cardUid && B.S.cards[c.self.cardUid]) id = B.S.cards[c.self.cardUid].id;
    var n = (B.S.playedFight && B.S.playedFight[id]) || 0;
    return typeof e.value === 'boolean' ? n > 0 : n;
  });

  // =====================================================================================================
  // Evolution quests (data/upgrades.js evolutions). The Run layer reads result.stats.quest = { instUid: { counter: n } }
  // and the Legend Ceremony needs the counter of the stage quest, so the battle has to count them:
  //   kneadTotal (Biscuit Cat), turnsInPile3 (Dumpling Cat), ambushKills (Pippin), rebornCount (Lantern Cat),
  //   wonInBox (Gus the Box Cat), yarnCardsInFight (Tangled Skein, counted once a fight reaches the quest number).
  // =====================================================================================================
  function questInst(B, instUid) {
    var inst = instUid ? B.instByUid(instUid) : null;
    var evo = inst && SB.content.evolution(inst.id);
    if (!evo) return null;
    for (var i = 0; i < evo.stages.length; i++) if (evo.stages[i].id === inst.id && evo.stages[i].quest) return { inst: inst, quest: evo.stages[i].quest };
    return null;
  }
  function questAdd(B, instUid, counter, n) {
    var q = questInst(B, instUid);
    if (!q || q.quest.check.counter !== counter) return;
    var S = B.S; S.questCt = S.questCt || {};
    var m = S.questCt[instUid] = S.questCt[instUid] || {};
    m[counter] = (m[counter] || 0) + n;
  }
  var baseDoKnead = P.doKnead;
  P.doKnead = function (unit) {
    var gain = baseDoKnead.apply(this, arguments);
    if (gain > 0 && unit && unit.instUid) questAdd(this, unit.instUid, 'kneadTotal', gain);
    return gain;
  };
  var baseFire2 = P.fire;
  P.fire = function (name, data) {
    if (name === 'onReborn' && data && data.subject && data.subject.instUid) questAdd(this, data.subject.instUid, 'rebornCount', 1);
    return baseFire2.apply(this, arguments);
  };
  var baseDamage3 = P.damage;
  P.damage = function (tgt, base, o) {
    var att = o && o.src;
    var pre = !!(att && att.kind === 'cat' && att.kw && att.kw.ambush && !att.ambushUsed && tgt && tgt.kind === 'pest');
    var r = baseDamage3.apply(this, arguments);
    if (pre && att.ambushUsed && (tgt.dead || tgt.hp <= 0) && att.instUid) questAdd(this, att.instUid, 'ambushKills', 1);
    return r;
  };
  var baseEndTurn = P.endTurn;
  P.endTurn = function () {
    var self = this;
    if (this.S && !this.S.over && this.S.turn === 'player') {
      this.cats().forEach(function (c) { if (c.instUid && !c.dead && !c.removed && self.pileSizeOf(c) >= 3) questAdd(self, c.instUid, 'turnsInPile3', 1); });
    }
    return baseEndTurn.apply(this, arguments);
  };
  var basePlayCard3 = P.playCard;
  P.playCard = function (uid) {
    var rec = this.S.cards[uid], tags = rec && rec.eff && rec.eff.tags;
    var r = basePlayCard3.apply(this, arguments);
    if (r && r.ok && tags && tags.indexOf('yarn') >= 0) this.S.yarnCardsFight = (this.S.yarnCardsFight || 0) + 1;
    return r;
  };
  var baseResult = P.result;
  P.result = function () {
    var had = this.resultCache, r = baseResult.apply(this, arguments);
    if (!r || r._quest) return r;
    var self = this, S = this.S, q = {};
    Object.keys(S.questCt || {}).forEach(function (u) { q[u] = Object.assign({}, S.questCt[u]); });
    function add(u, k, n) { q[u] = q[u] || {}; q[u][k] = (q[u][k] || 0) + n; }
    if (S.outcome === 'win') {
      this.cats().forEach(function (c) { if (c.instUid && !c.dead && !c.removed && c.boxed && questInst(self, c.instUid) && questInst(self, c.instUid).quest.check.counter === 'wonInBox') add(c.instUid, 'wonInBox', 1); });
    }
    Object.keys(S.countedPlays || {}).forEach(function (u) {
      var qi = questInst(self, u);
      if (qi && qi.quest.check.counter === 'yarnCardsInFight' && (S.yarnCardsFight || 0) >= qi.quest.check.n) add(u, 'yarnCardsInFight', qi.quest.check.n);
    });
    r.stats.quest = q; r._quest = true;
    return r;
  };

  // Gus, Master of the Warehouse: Boxes on his floor hold 1 more cat.
  E.keywords.register('boxFitsPlus', true);
  var baseRecalc3 = P.recalc;
  P.recalc = function () {
    var r = baseRecalc3.apply(this, arguments);
    this.S.floors.forEach(function (f) {
      var bonus = f.cats.some(function (c) { return !c.dead && !c.removed && c.kw && c.kw.boxFitsPlus; }) ? 1 : 0;
      f.rooms.forEach(function (rm) {
        if (rm.rtype !== 'box') return;
        if (rm._fitsBase === undefined) rm._fitsBase = rm.fits;
        rm.fits = rm._fitsBase + bonus;
      });
    });
    return r;
  };
})();
