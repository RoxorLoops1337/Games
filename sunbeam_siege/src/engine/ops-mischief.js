/* SUNBEAM SIEGE: engine additions for the Mischief card set (src/data/cards-mischief.js), card verification pass.
 * Loaded after registry.js and battle.js (registry convention, see design/C1-engine-notes.md). No Math.random.
 * Everything here is registered by name or is a thin wrapper around a Battle.prototype method, so it is additive.
 * No em dashes.
 *
 * What this file adds or fixes:
 *  - attackTarget on onAttack events (no explicit target in the event) is the front pest the cat will hit;
 *    new check attackTargetYarned and counter yarnOnAttackTarget read that target instead of the attacking cat.
 *  - Trigger onAfterAttack (self): fires after a cat's hits, with the last pest it hit as the target.
 *    Used by Shelf Gremlin (Knock after the hit lands) and Too Small For This (bounce after it has attacked).
 *  - Trigger onAnyKnock (global): every successful Knock by anyone. Table Surfer and Tall Shelf use it, because the
 *    old onKnock trigger is self scoped (only the knocking cat) and silent for spell Knocks.
 *  - Fragile toys: B.knockOffToy(roomUid, catUid) lets a cat on the floor knock a Fragile toy off (once per cat per
 *    turn). Fires the toy's onKnockedOff effects, then the toy is destroyed. Target frontEnemyBelow on the Cellar
 *    falls back to the Cellar front pest.
 *  - damage op: floorOf (Tip the Glass hits the LANDING floor, not the floor the pest left).
 *  - createCard of a Hairball: at most 6 in hand (the rest go to the discard pile) and onHairballCreated fires once
 *    per Hairball, so Gag Reflex and Fur Factory count every one.
 *  - op boxIfNone: Cardboard Annex puts a Box on every floor that has none (the old check ran for one floor only).
 *  - Tape Squares hold Large cats.
 *  - op yarnDiscount (Cat's Cradle): spells aimed at a Yarned pest cost less this turn (granted before the cost check).
 *  - Hand changes mark the board dirty, so auras that read the hand (Hairball Appreciator) stay current.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var E = SB.engine;
  if (!E || !E.ops || !SB.battle || !SB.battle.Battle) return;
  var P = SB.battle.Battle.prototype;
  if (P.__mischiefOps) return;
  P.__mischiefOps = true;
  var OP = E.ops, CK = E.checks, CN = E.counters, TG = E.targets;
  function rv(key, d) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : d; }
  function amt(B, ctx, e, d) { var v = e.amount !== undefined ? e.amount : (e.n !== undefined ? e.n : d); return B.num(v, ctx); }
  function one(x) { return x ? [x] : []; }

  // ---- shared helpers (also defined by ops-moon.js, first loader wins) ---------------------------------------
  E.cardfix = E.cardfix || {};
  if (!E.cardfix.attackTargetOf) {
    E.cardfix.attackTargetOf = function (c, B) {
      var t = (c.data && c.data.target) || c.target;
      if (t && t.kind === 'pest') return t;
      if (c.choice && c.choice.pestUid) { var p = B.pestByUid(c.choice.pestUid); if (p) return p; }
      if ((c.trigger === 'onAttack' || c.trigger === 'onCatAttack') && c.self && c.self.kind === 'cat') return B.frontPest(c.self.floor) || null;
      return null;
    };
  }
  var attackTargetOf = E.cardfix.attackTargetOf;
  var baseAttackTarget = TG.get('attackTarget');
  TG.register('attackTarget', function (c, e, B) {
    var r = baseAttackTarget ? baseAttackTarget(c, e, B) : [];
    if (r && r.length) return r;
    return one(attackTargetOf(c, B));
  });
  CK.register('attackTargetYarned', function (c, e, B) { var t = attackTargetOf(c, B); return !!(t && t.statuses && t.statuses.yarn > 0); });
  CN.register('yarnOnAttackTarget', function (c, e, B) { var t = attackTargetOf(c, B); return t && t.statuses ? (t.statuses.yarn || 0) : 0; });

  // ---- onAfterAttack ------------------------------------------------------------------------------------------
  E.triggers.register('onAfterAttack', { scope: 'self' });
  var baseCatHit = P.catHit;
  P.catHit = function (cat, pest, power, o) { if (cat) cat.lastHitUid = pest ? pest.uid : null; return baseCatHit.call(this, cat, pest, power, o); };
  var baseCatAttack = P.catAttack;
  P.catAttack = function (cat) {
    cat.lastHitUid = null;
    var did = baseCatAttack.call(this, cat);
    if (did && !cat.removed && !cat.dead && cat.fx && cat.fx.onAfterAttack && cat.fx.onAfterAttack.length) {
      var t = cat.lastHitUid ? this.pestByUid(cat.lastHitUid) : null;
      if (t && (t.dead || t.removed)) t = null;
      this.fire('onAfterAttack', { subject: cat, target: t, floor: cat.floor });
      this.drain();
    }
    return did;
  };

  // ---- onAnyKnock -----------------------------------------------------------------------------------------------
  E.triggers.register('onAnyKnock', { scope: 'global' });
  var baseKnock = P.knockPest;
  P.knockPest = function (p, n, o) {
    var from = p ? p.floor : 0;
    var r = baseKnock.call(this, p, n, o);
    if (r) this.fire('onAnyKnock', { subject: (o && o.src) || null, target: p, floor: from });
    return r;
  };

  // ---- Fragile toys ---------------------------------------------------------------------------------------------
  TG.register('frontEnemyBelow', function (c, e, B) {
    var f = B.ctxFloor(c) - 1;
    if (f < 0) f = 0; // the Cellar has no floor below: use its own front pest
    var l = B.S.floors[f].pests.filter(function (p) { return !p.dead && !p.removed && !p.untargetable; });
    return one(l[0]);
  });
  P.knockOffToy = function (roomUid, catUid) {
    var S = this.S;
    if (S.over || S.turn !== 'player') return { ok: false, reason: 'Not your turn' };
    var room = this.roomByUid(roomUid);
    if (!room || room.rtype !== 'toy' || room.removed || !(room.kw && room.kw.fragile)) return { ok: false, reason: 'That toy is not Fragile' };
    var c = catUid ? this.catByUid(catUid) : (S.floors[room.floor].cats.filter(function (x) { return !x.dead && !x.removed; })[0] || null);
    if (!c || c.dead || c.removed || c.floor !== room.floor) return { ok: false, reason: 'Needs a cat on that floor' };
    if (!this.limitOk('knockoff:' + c.uid, { per: 'turn', n: 1 }, null)) return { ok: false, reason: 'That cat already knocked something off this turn' };
    this.emit('room', { uid: room.uid, floor: room.floor, rtype: 'toy', action: 'knockoff', by: c.uid });
    var list = room.fx && room.fx.onKnockedOff;
    if (list && list.length) {
      this.runEffects(list, this.makeCtx({ src: { kind: 'room', unit: room }, self: room, subject: c, floorOverride: room.floor, lk: 'room:' + room.uid + ':knockedOff' }));
    }
    this.removeRoom(room, 'knocked off');
    if (room.cardUid && S.cards[room.cardUid]) this.toExhaust(room.cardUid);
    this.stat('toysKnockedOff');
    this.drain(); this.reap(); this.refresh();
    return { ok: true };
  };

  // ---- damage floorOf ------------------------------------------------------------------------------------------
  var baseDamage = OP.get('damage');
  OP.register('damage', function (ctx, e, B) {
    if (e.floorOf) {
      var u = B.targets(e.floorOf, ctx, e)[0];
      if (!u || u.queued) return;
      return baseDamage(Object.assign({}, ctx, { floorOverride: u.floor }), e, B);
    }
    return baseDamage(ctx, e, B);
  });

  // ---- Hairballs ---------------------------------------------------------------------------------------------------
  function hairballsInHand(B) { return B.S.hand.filter(function (h) { return B.S.cards[h.uid].id === 'curse_hairball'; }).length; }
  var baseCreate = P.createCard;
  P.createCard = function (id, amount, to, opts) {
    var rid = SB.content.resolveId(id);
    if (rid !== 'curse_hairball') return baseCreate.apply(this, arguments);
    var made = [], n = amount || 1, cap = rv('hairball_hand_max', 6);
    for (var i = 0; i < n; i++) {
      var dest = to || 'hand';
      if (dest === 'hand' && hairballsInHand(this) >= cap) dest = 'discard';
      made = made.concat(baseCreate.call(this, id, 1, dest, opts)); // each call fires onHairballCreated once
    }
    return made;
  };
  var baseSync = P.syncPiles;
  P.syncPiles = function () { this._dirty = true; return baseSync.apply(this, arguments); };

  // ---- Boxes ------------------------------------------------------------------------------------------------------
  OP.register('boxIfNone', function (ctx, e, B) {
    B.S.floors.forEach(function (f) {
      if (B.boxesOnFloor(f.index) > 0 || !B.roomFree(f.index)) return;
      var room = B.placeBox(f.index, { kind: e.kind, size: e.size, durability: e.durability });
      if (room) { B.stat('boxPlaced'); B.fire('onBoxPlaced', { subject: room, floor: f.index }); }
    });
  });
  var baseAutoSeat = P.autoSeat;
  P.autoSeat = function (unit) {
    if (baseAutoSeat.call(this, unit)) return true;
    if (unit.size > 1 && !unit.statuses.coned) {
      var f = this.S.floors[unit.floor];
      for (var i = 0; i < f.rooms.length; i++) {
        var rm = f.rooms[i];
        if (rm.rtype === 'box' && rm.tape && rm.occupants.length < rm.fits) { this.seatCat(unit, rm); return true; }
      }
    }
    return false;
  };

  // ---- Cat's Cradle ---------------------------------------------------------------------------------------------
  OP.register('yarnDiscount', function (ctx, e, B) {
    var S = B.S, d = S.yarnDiscount;
    S.yarnDiscount = { round: S.round, n: (d && d.round === S.round ? d.n : 0) + amt(B, ctx, e, 1) };
  });
  var basePlay = P.playCard;
  P.playCard = function (uid, target) {
    var S = this.S, d = S.yarnDiscount, rec = S.cards[uid], refund = 0;
    if (d && d.round === S.round && d.n > 0 && rec && rec.eff.type === 'spell' && rec.eff.targeting === 'enemy' && target) {
      var p = target.pestUid ? this.pestByUid(target.pestUid) : (S.floors[target.floor] && S.floors[target.floor].pests[target.pos]);
      var cost = this.cardCost(uid);
      if (p && p.statuses.yarn > 0 && typeof cost === 'number') refund = Math.min(d.n, cost);
    }
    // The discount is granted before the cost check, so a spell that costs exactly the Zoomies left after Cat's Cradle is playable.
    var granted = refund ? this.addZoomies(refund) : 0;
    var r = basePlay.call(this, uid, target);
    if (granted && !(r && r.ok)) this.addZoomies(-granted);
    return r;
  };
})();
