/* SUNBEAM SIEGE: engine additions for neutral cards, starters, charms and relics (verification pass).
 * Loaded after registry.js and battle.js (see C1-engine-notes.md, registry convention). No Math.random.
 * Overrides are registered by name, so a later file with the same name wins; keep this file additive.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var E = SB.engine;
  if (!E || !E.ops) return;
  var U = SB.util;
  function amt(B, ctx, e, d) { var v = e.amount !== undefined ? e.amount : (e.n !== undefined ? e.n : d); return B.num(v, ctx); }

  // thisCard: the card behind the trigger. Own-unit triggers (onDeath on a cat) carry self, not ctx.cardUid.
  E.targets.register('thisCard', function (c) {
    var uid = c.cardUid || (c.self && c.self.kind === 'cat' ? c.self.cardUid : null) || (c.subject && c.subject.kind === 'cat' ? c.subject.cardUid : null);
    return uid ? [{ kind: 'card', uid: uid }] : [];
  });

  // removeCard from hand: the card leaves the battle and, if it is a run card, the run deck for good.
  E.ops.register('removeCard', function (ctx, e, B) {
    if (!e.from) return;
    var S = B.S, n = amt(B, ctx, e, 1);
    var pile = S.hand.map(function (h) { return h.uid; });
    if (e.filter === 'curse') pile = pile.filter(function (u) { return S.cards[u].eff.type === 'curse'; });
    pile.slice(0, n).forEach(function (u) {
      var rec = S.cards[u];
      B.removeFromHand(u);
      S.exhaust.push(u);
      B.emit('exhaust', { uid: u, id: rec.id, removed: true });
      if (rec.inst && B.run && B.run.deck) {
        var ix = -1;
        B.run.deck.forEach(function (i, k) { if (i.uid === rec.inst) ix = k; });
        if (ix >= 0) B.run.deck.splice(ix, 1);
        (B.S.removedFromDeck = B.S.removedFromDeck || []).push(rec.inst);
      }
    });
    B.syncPiles();
  });


  var BT = SB.battle, P = BT && BT.Battle && BT.Battle.prototype;
  function rv(key, d) { var r = SB.data.rules || {}; return r[key] !== undefined ? r[key] : d; }

  // ---------------------------------------------------------------------------------------------------
  // New registry names used by relics.js / cards-neutral.js
  // ---------------------------------------------------------------------------------------------------
  ['curseDrawExhaust', 'doNotDisturb'].forEach(function (n) { E.mods.register(n, true); });
  ['onDusk', 'onHit', 'onHandReady'].forEach(function (n) { E.hooks.register(n, true); });
  E.triggers.register('onHandReady', { scope: 'global' });   // fired once the hand is drawn at the start of each player turn

  // ---------------------------------------------------------------------------------------------------
  // Targets and checks
  // ---------------------------------------------------------------------------------------------------
  // allCatsOnFloor / allEnemiesOnFloor: data may name a floor with e.floor (1-based, like the rest of the data files).
  function floorFrom(B, c, e) { return (typeof e.floor === 'number') ? e.floor - 1 : B.ctxFloor(c); }
  E.targets.register('allCatsOnFloor', function (c, e, B) {
    var f = floorFrom(B, c, e);
    return (B.S.floors[f] ? B.S.floors[f].cats : []).filter(function (x) { return !x.dead && !x.removed; });
  });
  E.targets.register('allEnemiesOnFloor', function (c, e, B) {
    var f = floorFrom(B, c, e);
    return (B.S.floors[f] ? B.S.floors[f].pests : []).filter(function (x) { return !x.dead && !x.removed && !x.untargetable; });
  });
  E.targets.alias('allPestsOnFloor', 'allEnemiesOnFloor');
  // onKill carries the killer as `subject`; the old target only looked at data.killer.
  E.targets.register('triggerSourceKiller', function (c) {
    var k = c.killer || (c.trigger === 'onKill' ? c.subject : null);
    return k ? [k] : [];
  });
  // chosen target of a card (ctx.choice) when no trigger target exists
  function chosenPest(c, B) { return c.choice && c.choice.pestUid ? B.pestByUid(c.choice.pestUid) : null; }
  E.checks.register('targetFloor', function (c, e, B) {
    var t = c.subject || (c.data && c.data.target) || c.target || chosenPest(c, B);
    return t ? t.floor + 1 : 0;
  });
  E.checks.register('targetIsEliteOrBoss', function (c, e, B) {
    // onKill carries the killer as subject and the dead pest as target: look for the pest among them
    var cand = [c.filterUnit, c.data && c.data.target, c.target, c.subject], t = null;
    for (var i = 0; i < cand.length; i++) if (cand[i] && cand[i].kind === 'pest') { t = cand[i]; break; }
    return !!(t && (t.tier === 'elite' || t.boss));
  });
  // card checks fall back to the deployed cat when a trigger carries a unit instead of a card (onCatDeployed)
  function cardish(c) {
    var cd = c.card || (c.data && c.data.card);
    if (cd) return cd;
    var s = c.subject;
    if (s && s.kind === 'cat') return { id: s.id, type: s.type, cost: s.unitCost, keywords: s.kw || {}, tags: s.tags || [] };
    return null;
  }
  E.checks.register('cardId', function (c) { var cd = cardish(c); return cd ? cd.id : ''; });
  E.checks.register('cardType', function (c) { var cd = cardish(c); return cd ? cd.type : ''; });
  E.checks.register('cardCost', function (c) { var cd = cardish(c); return cd ? cd.cost : 0; });
  E.checks.register('cardKeyword:*', function (c, e, B, arg) { var cd = cardish(c); return !!(cd && cd.keywords && cd.keywords[arg]); });
  E.checks.register('cardTag:*', function (c, e, B, arg) { var cd = cardish(c); return !!(cd && cd.tags && cd.tags.indexOf(arg) >= 0); });

  // ---------------------------------------------------------------------------------------------------
  // Ops
  // ---------------------------------------------------------------------------------------------------
  // Relic counters honor the cap written on the relic definition.
  E.ops.register('counter', function (ctx, e, B) {
    var r = ctx.src && ctx.src.relic; if (!r) return;
    var n = amt(B, ctx, e, 1), d = SB.content.relic(r.id);
    var cap = d && d.counter && d.counter.cap != null ? d.counter.cap : 999;
    r.counter = r.counter || 0;
    r.counter = Math.min(cap, e.op === 'set' ? n : r.counter + n);
  });
  // The relic is spent: it also leaves the run.
  E.ops.register('consumeRelic', function (ctx, e, B) {
    var r = ctx.src && ctx.src.relic; if (!r) return;
    r.used = true;
    var rel = B.run && B.run.relics, i = rel ? rel.indexOf(r) : -1;
    if (i >= 0) { rel.splice(i, 1); B.run.flags = B.run.flags || {}; B.run.flags.lastLifeUsed = true; }
    B._mods = null;
  });
  // exhaustCard mode "triggerCard": the card that caused the trigger
  var exhaustOrig = E.ops.get('exhaustCard');
  E.ops.register('exhaustCard', function (ctx, e, B) {
    if (e.mode !== 'triggerCard') return exhaustOrig(ctx, e, B);
    var uid = ctx.cardUid || (ctx.data && ctx.data.cardUid);
    if (uid && B.handIndex(uid) >= 0) { B.removeFromHand(uid); B.toExhaust(uid); }
  });
  // Frazzle that the Witching Hour Zoom queued for next round is cleansed too
  E.ops.register('cleanseFrazzle', function (ctx, e, B) {
    B.S.pendingFrazzle = [];
    B.cats().forEach(function (c) { if (c.statuses.frazzled) B.removeStatus(c, 'frazzled'); });
  });
  // Pile of 3 or more heals one more (Pile Permit: 2 or more heal 1, 3 or more heal 2)
  E.ops.register('pileHeal', function (ctx, e, B) {
    var min = e.minSize || 3, n = amt(B, ctx, e, 1);
    B.S.floors.forEach(function (f, fi) {
      B.pileRuns(fi).forEach(function (run) {
        var size = run.length + B.mod('pileBonus', 0) + (f._pileAura || 0);
        if (run.length >= 2 && size >= min) run.forEach(function (c) { if (!c.dead && !c.removed) B.heal(c, n); });
      });
    });
  });
  // Next Day Delivery: the first Box of the battle is free, this marks it used
  E.ops.register('markFirstBox', function (ctx, e, B) { B.S.counters.firstBoxUsed = 1; });
  // Black Cat Crossing: the Reborn card comes back with Fluff for its next deployment
  E.ops.register('rebornFluff', function (ctx, e, B) {
    var s = ctx.subject; if (!s || s.kind !== 'cat') return;
    var rec = B.S.cards[s.cardUid]; if (rec) rec.rebornFluff = (rec.rebornFluff || 0) + amt(B, ctx, e, 1);
  });

  // Paw Print in Flour: a Life is only spent when the cat falls, so a plain buff on the unit would vanish with it.
  // The buff is kept on the card record and re-applied when the Reborn cat is deployed again (for the rest of the battle).
  E.ops.register('cardFightBuff', function (ctx, e, B) {
    var s = ctx.subject; if (!s || s.kind !== 'cat') return;
    var n = amt(B, ctx, e, 1), rec = B.S.cards[s.cardUid]; if (!rec) return;
    rec.fightPower = (rec.fightPower || 0) + n;
    if (!s.removed && !s.dead) s.buffs.power += n;
  });

  if (!P) return;
  // ---------------------------------------------------------------------------------------------------
  // Battle prototype wraps. Each one is small and keeps the original behaviour unless a relic mod asks for more.
  // ---------------------------------------------------------------------------------------------------
  // 2. Relic hooks onDrawn (card id in ctx.card) and onNipGain were declared by relics.js but never fired.
  var drawOrig = P.drawOne;
  P.drawOne = function () {
    var uid = drawOrig.apply(this, arguments);
    if (uid && this.S.cards[uid]) this.fire('onDrawn', { subject: null, card: this.S.cards[uid].eff, cardUid: uid });
    return uid;
  };
  var nipOrig = P.addNip;
  P.addNip = function (n) {
    var r = nipOrig.apply(this, arguments);
    // Nip added by an onNipGain hook itself (Catnip Stain) must not trigger the hook again
    if (r > 0 && !this._nipGainOpen) { this._nipGainOpen = true; try { this.fire('onNipGain', { subject: null, amount: r }); this.drain(); } finally { this._nipGainOpen = false; } }
    return r;
  };
  // 3. onHandReady: after the draw of each player turn (hooks that need the hand: Pigeon Feather, Toy Chest)
  var roundOrig = P.beginRound;
  P.beginRound = function () {
    roundOrig.apply(this, arguments);
    if (!this.S.over && this.S.turn === 'player') { this.fire('onHandReady', { subject: null }); this.drain(); this.refresh && this.refresh(); }
  };
  // 4. firstBoxFree
  var costOrig = P.cardCost;
  P.cardCost = function (uid) {
    var c = costOrig.apply(this, arguments);
    if (c > 0 && this.mod('firstBoxFree', 0) && !this.S.counters.firstBoxUsed) {
      var rec = this.S.cards[uid], on = rec && rec.eff.effects && rec.eff.effects.onPlay;
      if (on && on.some(function (x) { return x && x.type === 'box'; })) return 0;
    }
    return c;
  };
  // 5. Curses drawn are exhausted and replaced (Clean Bill of Health): the curse's own onDrawn effect never runs
  var cardTrigOrig = P.fireCardTrigger;
  P.fireCardTrigger = function (trig, uids) {
    if (trig === 'onDrawn' && this.mod('curseDrawExhaust', 0)) {
      var self = this, S = this.S, rest = [], redraw = 0;
      uids.forEach(function (uid) {
        var rec = S.cards[uid];
        if (rec && rec.eff.type === 'curse' && self.handIndex(uid) >= 0) { self.removeFromHand(uid); self.toExhaust(uid); redraw++; }
        else rest.push(uid);
      });
      cardTrigOrig.call(this, trig, rest);
      for (var i = 0; i < redraw; i++) this.drawCards(1);
      return;
    }
    return cardTrigOrig.apply(this, arguments);
  };
  // 6. retainSlots: keep N cards of the player's choice (B.toggleRetain(uid)); unchosen slots keep the dearest playable cards
  P.toggleRetain = function (uid) {
    var S = this.S; S.retainPick = S.retainPick || [];
    var i = S.retainPick.indexOf(uid);
    if (i >= 0) { S.retainPick.splice(i, 1); return { ok: true, kept: false }; }
    if (this.handIndex(uid) < 0) return { ok: false, reason: 'Not in hand' };
    if (S.retainPick.length >= this.mod('retainSlots', 0)) return { ok: false, reason: 'No retain slot free' };
    S.retainPick.push(uid); return { ok: true, kept: true };
  };
  var discOrig = P.discardHand;
  P.discardHand = function () {
    var n = this.mod('retainSlots', 0), S = this.S, marked = [];
    if (n > 0) {
      var pick = (S.retainPick || []).filter(function (u) { return S.hand.some(function (h) { return h.uid === u; }); });
      if (pick.length < n) {
        var rest = S.hand.filter(function (h) { var e = S.cards[h.uid].eff; return pick.indexOf(h.uid) < 0 && !e.keywords.retain && e.type !== 'curse' && !e.unplayable; })
          .sort(function (a, b) { return (S.cards[b.uid].eff.cost || 0) - (S.cards[a.uid].eff.cost || 0); });
        rest.slice(0, n - pick.length).forEach(function (h) { pick.push(h.uid); });
      }
      pick.slice(0, n).forEach(function (u) { var k = S.cards[u].eff.keywords; if (!k.retain) { k.retain = true; marked.push(k); } });
    }
    S.retainPick = [];
    try { return discOrig.apply(this, arguments); }
    finally { marked.forEach(function (k) { delete k.retain; }); }
  };
  // 7. pileIgnoreGaps: every cat on the floor is one Pile
  var pileOrig = P.pileRuns;
  P.pileRuns = function (floor) {
    var runs = pileOrig.call(this, floor);
    if (!this.mod('pileIgnoreGaps', 0) || this.S.rules.noPile) return runs;
    var all = this.S.floors[floor].cats.filter(function (c) { return !c.dead; });
    return all.length ? [all] : [];
  };
  // 8. flapDelay: pests knocked out of the Cellar wait extra rounds in the Garden
  var gardenOrig = P.retryGarden;
  P.retryGarden = function () {
    var S = this.S, d = this.mod('flapDelay', 0), held = [];
    if (d > 0) {
      S.garden = S.garden.filter(function (u) {
        if (u.flapDizzy) { if (u.flapReady === undefined) u.flapReady = S.round + d; if (S.round < u.flapReady) { held.push(u); return false; } }
        return true;
      });
    }
    var r = gardenOrig.apply(this, arguments);
    if (held.length) S.garden = held.concat(S.garden);
    return r;
  };
  // 9. nightVisitorThreatPct: bigger visitor packs
  var visOrig = P.spawnNightVisitors;
  P.spawnNightVisitors = function () {
    var pct = this.mod('nightVisitorThreatPct', 0);
    if (!pct) return visOrig.apply(this, arguments);
    var enc = this.enc, had = enc.nightVisitorMult;
    enc.nightVisitorMult = (had || 1) * (1 + pct / 100);
    try { return visOrig.apply(this, arguments); } finally { if (had === undefined) delete enc.nightVisitorMult; else enc.nightVisitorMult = had; }
  };
  // 10. Black Cat Crossing: a Reborn card keeps its Fluff for the next deployment
  var mkOrig = P.mkCat;
  P.mkCat = function (cardUid, floor) {
    var u = mkOrig.apply(this, arguments), rec = this.S.cards[cardUid];
    if (rec && rec.rebornFluff) { u.pendingFluff = rec.rebornFluff; rec.rebornFluff = 0; }
    if (rec && rec.fightPower) u.buffs.power += rec.fightPower;
    return u;
  };
  var placeOrig = P.placeCat;
  P.placeCat = function () {
    var u = placeOrig.apply(this, arguments);
    if (u && u.pendingFluff) { this.addFluff(u, u.pendingFluff, { src: { kind: 'system' } }); u.pendingFluff = 0; }
    return u;
  };

  // ---------------------------------------------------------------------------------------------------
  // Collar Charms (SB.data.charms). The run layer stores inst.charm = charmId, but card-inst.js never read it,
  // so charms did nothing. SB.cardInst.effective is wrapped here to fold the charm's ops into the card,
  // and SB.run.applyCharm is wrapped to apply the instance-level ops (addLives, grantMasteryRank) once.
  // ---------------------------------------------------------------------------------------------------
  function charmDef(id) {
    var list = (SB.data && SB.data.charms) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function addMainValue(card, delta) {
    if (!delta) return;
    var list = (card.effects && card.effects.onPlay) || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e && typeof e.amount === 'number' && e.type !== 'zoomies' && e.type !== 'lives') { e.amount += delta; return; }
      if (e && e.amount && typeof e.amount === 'object' && typeof e.amount.base === 'number' && e.type !== 'zoomies' && e.type !== 'lives') { e.amount.base += delta; return; }
    }
  }
  function mergeKeyword(card, name, n) {
    var kw = card.keywords;
    if (name === 'knead') {
      var cur = kw.knead;
      if (cur && typeof cur === 'object') cur.n = (cur.n || 0) + (n || 1);
      else kw.knead = { n: n || 1, stat: 'attack', trigger: 'onPlay', cap: 12 };
      return;
    }
    if (kw[name] === undefined || kw[name] === false) kw[name] = (n === undefined ? true : n);
    else if (typeof kw[name] === 'number' && typeof n === 'number') kw[name] += n;
    else if (kw[name] === true && typeof n === 'number') kw[name] = n;
  }
  function applyCharmOps(card, charm) {
    (charm.effects || []).forEach(function (o) {
      switch (o.op) {
        case 'addStat': {
          var st = o.stat === 'attack' ? 'power' : o.stat;
          if (st === 'power' || st === 'health') { if (card.stats) card.stats[st] = (card.stats[st] || 0) + o.value; }
          else if (st === 'cost') { if (card.cost !== null && card.cost !== 'X') card.cost = Math.max(0, card.cost + o.value); }
          else if (st === 'value') addMainValue(card, o.value);
          break;
        }
        case 'grantKeyword': mergeKeyword(card, o.keyword, o.n !== undefined ? o.n : o.amount); break;
        case 'setFlag':
          if (o.flag === 'retain' || o.flag === 'innate') card.keywords[o.flag] = true;
          else card.flags[o.flag] = (o.value === undefined ? true : o.value);
          break;
        case 'addTrigger': {
          var t = E.normTrigger(o.when || o.trigger);
          var grp = { type: 'group', effects: U.deepClone(o['do'] || o.effects || []) };
          if (o.limit) grp.limit = U.deepClone(o.limit);
          card.effects[t] = (card.effects[t] || []).concat([grp]);
          break;
        }
        default: break; // addLives and grantMasteryRank are instance level, see applyCharmInstance
      }
    });
  }
  function applyCharmInstance(inst, charm) {
    (charm.effects || []).forEach(function (o) {
      if (o.op === 'addLives') { inst.maxLives = Math.min(9, (inst.maxLives || 0) + o.n); inst.lives = Math.min(inst.maxLives, (inst.lives || 0) + o.n); }
      if (o.op === 'grantMasteryRank') inst.masteryRank = Math.min(3, (inst.masteryRank || 0) + o.n);
    });
  }
  var wrapped = { eff: false, run: false };
  function wrapRun() {
    if (wrapped.run || !SB.run || !SB.run.applyCharm) return;
    var orig = SB.run.applyCharm;
    SB.run.applyCharm = function (run, charmId, uid) {
      var r = orig.apply(this, arguments);
      if (r && r.ok) {
        var charm = charmDef(charmId), inst = SB.run.U && SB.run.U.inst ? SB.run.U.inst(run, uid) : null;
        if (charm && inst && !(inst.charmApplied && inst.charmApplied[charmId])) {
          applyCharmInstance(inst, charm);
          inst.charmApplied = inst.charmApplied || {};
          inst.charmApplied[charmId] = true;
        }
      }
      return r;
    };
    wrapped.run = true;
  }
  function wrapEffective() {
    if (wrapped.eff || !SB.cardInst || !SB.cardInst.effective) return;
    var orig = SB.cardInst.effective;
    SB.cardInst.effective = function (inst, opts) {
      wrapRun();
      var card = orig.apply(this, arguments);
      var charm = inst && inst.charm ? charmDef(inst.charm) : null;
      if (charm && card) {
        applyCharmOps(card, charm);
        card.charm = { id: charm.id, name: charm.name, text: charm.text };
        card.unplayable = card.cost === null || !!card.keywords.unplayable;
        card.baseCost = card.cost;
        if (card.stats) { card.power = card.stats.power; card.health = card.stats.health; }
      }
      return card;
    };
    wrapped.eff = true;
  }
  wrapEffective();
  wrapRun();
})();
