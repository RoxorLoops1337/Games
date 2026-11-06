/* SUNBEAM SIEGE: engine additions for the Moonwhiskers card set (src/data/cards-moon.js), card verification pass.
 * Loaded after registry.js and battle.js (registry convention, see design/C1-engine-notes.md). No Math.random.
 * Everything here is registered by name or is a thin wrapper around a Battle.prototype method, so it is additive.
 * No em dashes.
 *
 * What this file adds or fixes:
 *  - lives op: upTo (spend as many as possible, always leaving 1) and a per-effects-array tally exposed as the
 *    counter and check "livesSpent" (the old counter was the fight total, so a second Gambler drew too much).
 *  - witching op: mode next obeys the no-twice rule, mode chain works once per battle.
 *  - witchingEcho keyword (Mrs. Midnight): doubles the built-in Witching Hour Zoomies, draw and free Zoom.
 *  - unfrazzled keyword and the spareFrazzle op (Stopped Grandfather Clock): no Frazzled after a Witching Hour.
 *  - rebornFight op and Reborn granted by effects now really send the card back to hand.
 *  - returnFromDiscard lives param now ADDS lives (Seance Saucer: "It gains a Life").
 *  - Undertaker style refund: trigger onLifeWouldBeLost + op preventLifeLoss, resolved before the Life is taken.
 *  - onBattleEnd effects of moon cats (Probate Persian) run when the battle is won.
 *  - checks targetMarked (spells and attacks), catsInDiscard, triggerIsSelf, returnedFromDiscard.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var E = SB.engine;
  if (!E || !E.ops || !SB.battle || !SB.battle.Battle) return;
  var P = SB.battle.Battle.prototype;
  if (P.__moonOps) return;
  P.__moonOps = true;
  var OP = E.ops, CK = E.checks, CN = E.counters, TG = E.targets;
  function rv(key, d) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : d; }
  function amt(B, ctx, e, d) { var v = e.amount !== undefined ? e.amount : (e.n !== undefined ? e.n : d); return B.num(v, ctx); }
  function one(x) { return x ? [x] : []; }

  // ---- shared helpers (also defined by ops-mischief.js, first loader wins) ----------------------------------
  E.cardfix = E.cardfix || {};
  if (!E.cardfix.attackTargetOf) {
    // The pest an attack, Zoom or spell is aimed at. onAttack events carry no explicit target, so use the front pest.
    E.cardfix.attackTargetOf = function (c, B) {
      var t = (c.data && c.data.target) || c.target;
      if (t && t.kind === 'pest') return t;
      if (c.choice && c.choice.pestUid) { var p = B.pestByUid(c.choice.pestUid); if (p) return p; }
      if ((c.trigger === 'onAttack' || c.trigger === 'onCatAttack') && c.self && c.self.kind === 'cat') return B.frontPest(c.self.floor) || null;
      return null;
    };
  }
  var baseAttackTarget = TG.get('attackTarget');
  TG.register('attackTarget', function (c, e, B) {
    var r = baseAttackTarget ? baseAttackTarget(c, e, B) : [];
    if (r && r.length) return r;
    return one(E.cardfix.attackTargetOf(c, B));
  });

  // ---- checks and counters ----------------------------------------------------------------------------------
  CK.register('targetMarked', function (c, e, B) {
    var t = c.filterUnit || E.cardfix.attackTargetOf(c, B) || c.subject;
    return !!(t && t.statuses && t.statuses.marked);
  });
  CK.register('livesSpent', function (c) { return (c.store && c.store.livesSpent) || 0; });
  CN.register('livesSpent', function (c) { return (c.store && c.store.livesSpent) || 0; });
  CK.register('catsInDiscard', function (c, e, B) {
    return B.S.discard.filter(function (u) { var t = B.S.cards[u].eff.type; return t === 'unit' || t === 'champion'; }).length;
  });
  CK.register('returnedFromDiscard', function (c) { return (c.store && c.store.returned) || 0; });
  CK.register('triggerIsSelf', function (c) { return !!(c.self && c.subject === c.self); });

  // ---- triggers ---------------------------------------------------------------------------------------------
  E.triggers.register('onLifeWouldBeLost', { scope: 'self' });

  // ---- lives op: upTo and the livesSpent tally -------------------------------------------------------------
  var baseLives = OP.get('lives');
  OP.register('lives', function (ctx, e, B) {
    var before = B.S.livesSpentFight || 0;
    var n = amt(B, ctx, e, 1);
    if (e.upTo && n < 0) {
      var spec = e.target !== undefined ? e.target : 'self';
      B.targets(spec, ctx, e).forEach(function (t) {
        if (!t || t.kind !== 'cat') return;
        var k = Math.min(-n, t.lives - 1);
        for (var i = 0; i < k; i++) B.spendLife(t, 1, { voluntary: true }); // one event per Life, so Ninth Sibling and the Empress count each
      });
    } else baseLives(ctx, e, B);
    ctx.store = ctx.store || {};
    ctx.store.livesSpent = (ctx.store.livesSpent || 0) + ((B.S.livesSpentFight || 0) - before);
  });

  // ---- Witching Hour ops ------------------------------------------------------------------------------------
  OP.register('witching', function (ctx, e, B) {
    var S = B.S, c = S.clock;
    if (!S.rules.nightClock) return;
    if (e.mode === 'chain') {
      if (c.chainUsed) return;
      c.chainUsed = true; c.forceNext = true; c.chain = true;
      B.emit('toast', { text: 'The next round is also a Witching Hour' });
      return;
    }
    if (c.isWitching) return; // never twice in a row
    c.forceNext = true;
    B.emit('toast', { text: 'The next round is a Witching Hour' });
  });

  // Mrs. Midnight: the Zoomies and the draw of a Witching Hour happen twice (several sources do not stack).
  OP.register('witchingEcho', function (ctx, e, B) {
    var S = B.S;
    if (!S.clock.isWitching) return;
    S.counters.echoRound = S.counters.echoRound || 0;
    if (S.counters.echoRound === S.round) return;
    S.counters.echoRound = S.round;
    B.addZoomies(rv('witching_zoomies_bonus', 2));
    B.drawCards(rv('witching_draw_bonus', 1));
  });
  function echoActive(B) { return B.cats().some(function (c) { return !c.dead && !c.removed && c.kw && c.kw.witchingEcho; }); }
  var baseZoom = P.zoomAttack;
  P.zoomAttack = function (cat) {
    var did = baseZoom.call(this, cat);
    if (did && this.S.clock.isWitching && !cat.removed && !cat.dead && echoActive(this)) baseZoom.call(this, cat);
    return did;
  };

  // Frazzled never lands on an unfrazzled cat, or on a cat spared by Stopped Grandfather Clock last round.
  var baseAddStatus = P.addStatus;
  P.addStatus = function (u, id, n, o) {
    if (id === 'frazzled' && u && u.kind === 'cat' && n > 0) {
      if ((u.kw && u.kw.unfrazzled) || (u.flags && u.flags.immuneFrazzled) || u.spareFrazzle === this.S.round - 1) return 0;
    }
    return baseAddStatus.call(this, u, id, n, o);
  };
  OP.register('spareFrazzle', function (ctx, e, B) {
    B.targets(e.target || 'allCatsOnFloor', ctx, e).forEach(function (c) { if (c.kind === 'cat') c.spareFrazzle = B.S.round; });
  });

  // ---- Reborn from effects, and the Undertaker refund -------------------------------------------------------
  OP.register('rebornFight', function (ctx, e, B) {
    B.S.rebornFight = B.S.rebornFight || {};
    B.targets(e.target || 'chosenCat', ctx, e).forEach(function (c) {
      if (c.kind !== 'cat') return;
      c.kw.reborn = true; B.S.rebornFight[c.cardUid] = true; B.touch();
    });
  });
  OP.register('preventLifeLoss', function (ctx, e, B) { B.S.moonPrevent = true; });

  function sendBack(B, c, why) {
    var S = B.S, rb = (c.kw && c.kw.reborn) || (S.rebornFight && S.rebornFight[c.cardUid]);
    if (rb && S.hand.length < B.handLimit()) {
      S.hand.push({ uid: c.cardUid, card: null }); B.emit('draw', { uid: c.cardUid, id: c.id, reborn: true });
      B.fire('onReborn', { subject: c, floor: c.floor });
    } else B.toDiscard(c.cardUid);
  }
  var baseSpendLifeFor = P.spendLifeFor;
  P.spendLifeFor = function (c, inst, cost) {
    var S = this.S, rec = S.cards[c.cardUid], eff = rec && rec.eff;
    // refund style effects run before the Life is taken
    var list = c.fx && c.fx.onLifeWouldBeLost;
    if (list && list.length) {
      S.moonPrevent = false;
      this.runEffects(list, this.makeCtx({ src: { kind: 'cat', unit: c }, self: c, subject: c, floorOverride: c.floor, lk: 'cat:' + c.uid + ':wouldLose' }));
      if (S.moonPrevent) {
        S.moonPrevent = false;
        this.toast(c.name + ' keeps its Life');
        sendBack(this, c);
        return;
      }
    }
    // Reborn gained from an effect lives on the unit or the fight record, not on the card
    var temp = false;
    if (eff && ((c.kw && c.kw.reborn) || (S.rebornFight && S.rebornFight[c.cardUid])) && !(eff.keywords && eff.keywords.reborn)) {
      eff.keywords = eff.keywords || {}; eff.keywords.reborn = true; temp = true;
    }
    try { return baseSpendLifeFor.call(this, c, inst, cost); }
    finally { if (temp && eff && eff.keywords) delete eff.keywords.reborn; }
  };

  // ---- returnFromDiscard: lives param adds Lives ------------------------------------------------------------
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
      ctx.store = ctx.store || {}; ctx.store.returned = (ctx.store.returned || 0) + 1;
      if (e.lives && S.cards[u].inst) {
        var inst = B.instByUid(S.cards[u].inst);
        if (inst) { inst.lives = Math.min(rv('lives_cap', 9), inst.lives + e.lives); if (inst.maxLives < inst.lives) inst.maxLives = inst.lives; }
      }
      if (S.hand.length < B.handLimit()) {
        S.hand.push({ uid: u, card: null }); B.emit('draw', { uid: u, id: S.cards[u].id, returned: true });
        if (e.costDelta) S.cards[u].costMod.played -= e.costDelta;
      } else S.discard.push(u);
    }
    B.syncPiles();
  });

  // ---- end of battle: moon cats on the board run their onBattleEnd effects when the battle is won -----------
  var baseFinish = P.finish;
  P.finish = function (outcome) {
    var S = this.S;
    if (outcome === 'win' && !S.over && !S.moonEndDone) {
      S.moonEndDone = true;
      var self = this;
      this.cats().forEach(function (c) {
        if (c.dead || c.removed || !c.fx || !c.fx.onBattleEnd || !c.fx.onBattleEnd.length || c.clan !== 'moon') return;
        try { self.runEffects(c.fx.onBattleEnd, self.makeCtx({ src: { kind: 'cat', unit: c }, self: c, subject: c, floorOverride: c.floor, lk: 'cat:' + c.uid + ':battleEnd' })); }
        catch (err) { SB.util.warnOnce('moonEnd:' + err.message, err.message); }
      });
    }
    return baseFinish.call(this, outcome);
  };
})();
