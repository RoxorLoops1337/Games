/* SUNBEAM SIEGE battle engine (agent C1).
 * SB.battle.create(run, encounter, opts) -> B. See design/API.md and design/C1-engine-notes.md.
 * Deterministic: one mulberry32 RNG per battle, no Math.random. All state lives in B.state (JSON-safe).
 * Floors are 0-based indexes in the battle API and events (0 Cellar, 1 Parlor, 2 Attic).
 * Data files use the 1-based floor numbers of A02/A03 (floor 1 = Cellar); conversions happen at the edges.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var U = SB.util;
  var BT = SB.battle = SB.battle || {};

  function ENG() { return SB.engine; }
  function R() { return SB.data.rules || {}; }
  function rv(key, dflt) { var r = R(); return r[key] !== undefined ? r[key] : dflt; }

  var PHASES = ['setup', 'draw', 'play', 'end_turn', 'cat_attacks', 'pest_attacks', 'pest_advance', 'spawn', 'dusk', 'over'];
  var DUSK_ORDER = ['wet', 'dizzy', 'scared', 'frazzled', 'yarn', 'hiss', 'hairball', 'purr', 'rested', 'rage'];

  function Battle(run, enc, opts) {
    this.run = run || {};
    this.enc = enc || { id: 'adhoc', waves: [] };
    this.opts = opts || {};
    this.S = null;
    this.state = null;
    this.rng = null;
    this._lis = [];
    this._evbuf = [];
    this._queue = [];
    this._draining = false;
    this._setupEvents = null;
    this._mods = null;
  }
  BT.Battle = Battle;
  var P = Battle.prototype;

  BT.create = function (run, encounter, opts) {
    var B = new Battle(run, encounter, opts || {});
    B.init();
    return B;
  };

  BT.restore = function (run, snap) {
    var B = new Battle(run, snap.enc, snap.opts || {});
    B.S = B.state = U.deepClone(snap.state);
    B.rng = U.makeRng(0);
    B.rng.setState(snap.rng);
    B._mods = null;
    B.relicSetup();
    return B;
  };

  // ---- small helpers ---------------------------------------------------------
  P.uid = function (prefix) { this.S.nextUid++; return prefix + this.S.nextUid; };
  P.log = function (msg) {
    var l = this.S.log; l.push(msg); if (l.length > 80) l.splice(0, l.length - 80);
  };
  P.emit = function (type, data) {
    var e = Object.assign({ type: type, seq: this.S.seq++ }, data || {});
    this._evbuf.push(e);
    if (this._setupEvents) this._setupEvents.push(e);
    for (var i = 0; i < this._lis.length; i++) { try { this._lis[i](e); } catch (err) { U.warnOnce('lis:' + err.message, 'event listener error ' + err.message); } }
    return e;
  };
  P.on = function (fn, o) {
    this._lis.push(fn);
    if (o && o.replay && this._setupEvents) this._setupEvents.forEach(function (e) { fn(e); });
    return this;
  };
  P.off = function (fn) { var i = this._lis.indexOf(fn); if (i >= 0) this._lis.splice(i, 1); return this; };
  P.takeEvents = function () { var b = this._evbuf; this._evbuf = []; return b; };
  P.toast = function (msg) { this.emit('toast', { text: msg }); this.log(msg); };
  P.fl = function (i) { return this.S.floors[i]; };
  P.floors = function () { return this.S.floors; };
  P.numFloors = 3;

  P.cats = function () { var out = []; this.S.floors.forEach(function (f) { f.cats.forEach(function (c) { out.push(c); }); }); return out; };
  P.pests = function () { var out = []; this.S.floors.forEach(function (f) { f.pests.forEach(function (c) { out.push(c); }); }); return out; };
  P.rooms = function () { var out = []; this.S.floors.forEach(function (f) { f.rooms.forEach(function (c) { out.push(c); }); }); return out; };
  P.livePests = function () { return this.pests().filter(function (p) { return !p.dead; }); };
  P.liveCats = function () { return this.cats().filter(function (p) { return !p.dead; }); };
  P.catByUid = function (uid) { var c = this.cats(); for (var i = 0; i < c.length; i++) if (c[i].uid === uid) return c[i]; return null; };
  P.pestByUid = function (uid) {
    var c = this.pests(); for (var i = 0; i < c.length; i++) if (c[i].uid === uid) return c[i];
    var g = this.S.garden; for (var j = 0; j < g.length; j++) if (g[j].uid === uid) return g[j];
    var a = this.S.attached || []; for (var k = 0; k < a.length; k++) if (a[k].uid === uid) return a[k];
    return null;
  };
  P.roomByUid = function (uid) { var c = this.rooms(); for (var i = 0; i < c.length; i++) if (c[i].uid === uid) return c[i]; return null; };
  P.unitByUid = function (uid) { return this.catByUid(uid) || this.pestByUid(uid) || this.roomByUid(uid); };
  P.isCat = function (u) { return !!u && u.kind === 'cat'; };
  P.isPest = function (u) { return !!u && u.kind === 'pest'; };
  P.reindex = function (fi) {
    var f = this.S.floors[fi];
    f.cats.forEach(function (c, i) { c.floor = fi; c.pos = i; });
    f.pests.forEach(function (c, i) { c.floor = fi; c.pos = i; });
    f.rooms.forEach(function (c, i) { c.floor = fi; c.slot = i; });
  };
  P.catSize = function (fi) { return U.sum(this.S.floors[fi].cats, function (c) { return c.size || 1; }); };
  P.pestSize = function (fi) { return U.sum(this.S.floors[fi].pests, function (c) { return c.size || 1; }); };
  P.mod = function (name, dflt) {
    // sum of relic mods named `name` plus champion/board rules; dflt is returned when no relic sets it
    var m = this.relicMods();
    return m[name] !== undefined ? m[name] : dflt;
  };
  P.relicMods = function () {
    if (this._mods) return this._mods;
    var out = {};
    var self = this;
    (this.run.relics || []).forEach(function (r) {
      var d = SB.content.relic(r.id);
      if (!d || !d.mods) return;
      Object.keys(d.mods).forEach(function (k) {
        var v = d.mods[k];
        if (typeof v === 'number' && typeof out[k] === 'number') out[k] += v;
        else if (typeof v === 'number') out[k] = v;
        else out[k] = v;
      });
    });
    this._mods = out;
    return out;
  };
  P.relicSetup = function () { this._mods = null; };

  P.cardDef = function (id) { return SB.content.card(id); };
  P.pestDef = function (id) { return SB.content.pest(id); };

  // ---- RNG --------------------------------------------------------------------
  P.rand = function () { return this.rng.next(); };
  P.pickOne = function (list) { return this.rng.pick(list); };

  // ---- init ---------------------------------------------------------------------
  P.init = function () {
    var run = this.run, enc = this.enc, opts = this.opts;
    var seed = opts.seed !== undefined ? opts.seed : U.hash(run.seed === undefined ? 'seed' : run.seed, enc.nodeId || enc.id || 'node');
    this.rng = U.makeRng(typeof seed === 'number' ? seed : U.hash(seed));
    var tutorial = !!(opts.tutorial || enc.tutorial);
    var rulesEnc = enc.rules || {};
    var maxW = run.maxWarmth || rv('warmth_max', 40);
    var warm = run.warmth === undefined ? maxW : run.warmth;
    if (this.mod('maxWarmth', 0)) { /* max Warmth relic is applied by run, not here */ }
    var S = this.S = this.state = {
      v: 1, id: enc.id || 'battle', seed: seed, round: 0, phase: 'setup', turn: 'resolving', over: false, outcome: null,
      zoomies: 0, zoomiesNext: 0, zoomiesPenalty: 0, nip: { meter: 0, surge: 0, crash: 0, excess: 0, crashTurn: 0 }, bank: 0,
      hand: [], draw: [], drawCount: 0, discard: [], discardCount: 0, exhaust: [], exhaustCount: 0, cards: {},
      floors: [], garden: [], attached: [], sunbeam: { warmth: warm, max: maxW, shade: 0 },
      clock: { round: 0, nextWitching: 3, isWitching: false, last: -9, forceNext: false, chain: false, chainUsed: false },
      intents: [], incoming: [0, 0, 0, 0], log: [], nextUid: 0, seq: 1, limits: {}, passives: [], counters: {},
      rules: {
        nightClock: rulesEnc.nightClock === true ? !opts.noWitching : !(opts.noWitching || tutorial || rulesEnc.nightClock === false), // a tutorial fight may ask for the clock explicitly (fight 4, the Witching Hour)
        impatience: !(rulesEnc.impatience === false || tutorial),
        impatienceRound: enc.impatienceRound || rv('impatience_round', 16),
        dazedKnock: !!rulesEnc.dazedKnock, noPile: !!rulesEnc.noPile, tutorial: tutorial
      },
      waveIdx: 0, spawnedWaves: {}, cardsPlayedThisTurn: 0, playedThisTurn: [], napsThisTurn: 0, kills: 0, killsRound: 0,
      knockedRound: {}, stats: { damageDealt: 0, damageTaken: 0, kills: 0, cardsPlayed: 0, livesLost: 0, sunbeamDamage: 0, rounds: 0, fish: 0 },
      playedFight: {}, countedPlays: {}, growth: [], lost: [], sitOut: [], pendingFrazzle: [], hazards: [], meters: {}, nextWitchingForced: false,
      enemyLog: [], fightType: enc.type || (enc.tier) || 'prowl', win: enc.winIf || null, dawn: { active: false, rounds: 0 },
      zoomiesTurnBonus: 0, extraDrawNext: 0, killedBosses: [], echoUsed: {}, floorsBlocked: {}, lastDamageDealt: 0
    };
    this.rng.setState(this.rng.getState()); // no-op, keeps API symmetrical
    var cap = rv('cat_slots_per_floor', 4), pcap = rv('pest_capacity_per_floor', 5), rcap = rv('room_slots_per_floor', 2) + (this.mod('roomSlots', 0));
    for (var i = 0; i < this.numFloors; i++) {
      S.floors.push({ kind: 'floor', index: i, cats: [], pests: [], rooms: [], statuses: {}, hazards: {}, capacity: { cats: cap, pestSize: pcap, rooms: rcap } });
    }
    this._setupEvents = [];
    this.relicSetup();
    this.buildDeck();
    this.setupTutorialCats();
    // relic counters and battle hooks
    this.fire('onBattleStart', { subject: null });
    this.drain();
    this.runChampionStartAbilities();
    this.spawnWave(1, true);
    this.drain();
    this.reap();
    this.updateIntents();
    this.refresh();
    this.beginRound();
    this._setupEvents = this._setupEvents.concat([]);
    var keep = this._setupEvents;
    this._setupEvents = null;
    this.setupEvents = keep;
  };

  // ---- deck ----------------------------------------------------------------------
  P.registerCard = function (uid, id, inst, fightOnly) {
    var eff;
    if (inst) eff = SB.cardInst.effective(inst);
    else { eff = SB.cardInst.effectiveDef(id, uid); eff.uid = uid; }
    this.S.cards[uid] = { uid: uid, id: id, inst: inst ? inst.uid : null, fightOnly: !!fightOnly, costMod: { turn: 0, played: 0 }, eff: eff };
    return this.S.cards[uid];
  };
  P.recomputeCard = function (uid) {
    var c = this.S.cards[uid]; if (!c) return;
    if (c.inst) { var inst = this.instByUid(c.inst); if (inst) c.eff = SB.cardInst.effective(inst); }
  };
  P.instByUid = function (uid) {
    var d = this.run.deck || [];
    for (var i = 0; i < d.length; i++) if (d[i].uid === uid) return d[i];
    return null;
  };
  P.cardEff = function (uid) { var c = this.S.cards[uid]; return c ? c.eff : null; };
  P.cardCost = function (uid) {
    var c = this.S.cards[uid]; if (!c) return 0;
    var eff = c.eff;
    if (eff.cost === null || eff.cost === 'X') return eff.cost;
    var cost = eff.cost - (c.costMod.turn || 0) - (c.costMod.played || 0) - (c.costMod.fight || 0);
    return Math.max(0, cost);
  };
  P.cardView = function (uid) {
    var c = this.S.cards[uid];
    var v = Object.assign({}, c.eff);
    v.cost = this.cardCost(uid);
    v.baseCost = c.eff.cost;
    return v;
  };

  P.buildDeck = function () {
    var self = this, S = this.S;
    var deck = (this.run.deck || []).filter(function (i) { return !i.sitOut; });
    var innate = [], rest = [];
    deck.forEach(function (inst) {
      var rec = self.registerCard(inst.uid, inst.id, inst, false);
      if (rec.eff.keywords && rec.eff.keywords.innate) innate.push(inst.uid); else rest.push(inst.uid);
    });
    this.rng.shuffle(rest);
    S.draw = innate.concat(rest);
    S.drawCount = S.draw.length;
  };

  P.setupTutorialCats = function () {
    var setup = this.enc.setup;
    if (!setup || !setup.cats) return;
    var self = this;
    setup.cats.forEach(function (sc) {
      var id = sc.card;
      var uid = self.uid('f');
      self.registerCard(uid, id, null, true);
      var f = (sc.floor || 1) - 1;
      var pos = sc.pos === 'back' || sc.pos === undefined ? undefined : sc.pos;
      var unit = self.placeCat(uid, f, pos, { silent: true, free: true, noBox: true });
      if (unit && sc.ref) unit.ref = sc.ref;
      if (unit) { var sl = ((self.S.cards[uid].eff || {}).stats || {}).lives; if (sl) { unit.lives = sl; unit.maxLives = sl; } }
    });
  };

  P.runChampionStartAbilities = function () { /* champion onFightStart triggers run via fire('onBattleStart') on placed cats */ };

  // ---- piles --------------------------------------------------------------------
  P.syncPiles = function () {
    var S = this.S;
    S.drawCount = S.draw.length; S.discardCount = S.discard.length; S.exhaustCount = S.exhaust.length;
  };
  P.handLimit = function () { return rv('hand_limit', 10) + this.mod('handLimit', 0); };
  P.shuffleDiscardIntoDraw = function () {
    var S = this.S;
    if (!S.discard.length) return false;
    var pile = S.discard.slice();
    S.discard = [];
    this.rng.shuffle(pile);
    S.draw = S.draw.concat(pile);
    this.emit('shuffle', { count: pile.length });
    this.fireCardTrigger('onShuffle', pile);
    return true;
  };
  P.drawOne = function () {
    var S = this.S;
    if (!S.draw.length) { if (!this.shuffleDiscardIntoDraw()) return null; }
    var uid = S.draw.shift();
    if (S.hand.length >= this.handLimit()) {
      S.discard.push(uid);
      this.emit('discard', { uid: uid, overdraw: true });
      this.fireCardTrigger('onDiscard', [uid]);
      this.syncPiles();
      return null;
    }
    S.hand.push({ uid: uid, card: null });
    this.emit('draw', { uid: uid, id: S.cards[uid].id });
    this.syncPiles();
    this.fireCardTrigger('onDrawn', [uid]);
    return uid;
  };
  P.drawCards = function (n) {
    var drawn = 0;
    for (var i = 0; i < n && !this.S.over; i++) {
      if (this.drawOne()) drawn++;
      else if (!this.S.draw.length && !this.S.discard.length) break;
    }
    return drawn;
  };
  P.handIndex = function (uid) { var h = this.S.hand; for (var i = 0; i < h.length; i++) if (h[i].uid === uid) return i; return -1; };
  P.removeFromHand = function (uid) { var i = this.handIndex(uid); if (i >= 0) this.S.hand.splice(i, 1); return i >= 0; };
  P.toDiscard = function (uid) { this.S.discard.push(uid); this.syncPiles(); this.emit('discard', { uid: uid }); };
  P.toExhaust = function (uid) {
    var c = this.S.cards[uid];
    this.S.exhaust.push(uid); this.syncPiles();
    this.emit('exhaust', { uid: uid, id: c && c.id });
    this.fireCardTrigger('onExhaust', [uid]);
  };
  // fires onDrawn, onDiscard, onExhaust, onShuffle, onTurnEndInHand from the card's own effects (curses, relic-less)
  P.fireCardTrigger = function (trig, uids) {
    var self = this;
    uids.forEach(function (uid) {
      var c = self.S.cards[uid]; if (!c) return;
      var list = c.eff.effects && c.eff.effects[trig];
      if (list && list.length) {
        self.queue(function () {
          self.runEffects(list, self.makeCtx({ src: { kind: 'card', card: uid }, cardUid: uid, lk: 'card:' + uid + ':' + trig }));
        });
      }
    });
    if (trig === 'onDrawn') this.drain();
  };

  P.createCard = function (id, amount, to, opts) {
    var S = this.S, made = [];
    var rid = SB.content.resolveId(id);
    if (!SB.content.card(rid)) { U.warnOnce('mkcard:' + id, 'createCard: unknown card ' + id); return made; }
    for (var i = 0; i < (amount || 1); i++) {
      var uid = this.uid('f');
      var crec = this.registerCard(uid, rid, null, true);
      // A card that copies itself (Domino Hit) makes the copy in the same upgraded state: same Scratches and Fork, nothing else
      var likeRec = opts && opts.like ? S.cards[opts.like] : null;
      var likeInst = likeRec && (likeRec.inst ? this.instByUid(likeRec.inst) : likeRec.likeInst);
      if (likeInst && likeInst.id === rid && ((likeInst.scratches && likeInst.scratches.length) || likeInst.fork)) {
        var twin = SB.cardInst.make(rid, { uid: uid });
        twin.scratches = (likeInst.scratches || []).slice(); twin.fork = likeInst.fork;
        crec.eff = SB.cardInst.effective(twin); crec.eff.uid = uid; crec.likeInst = twin;
      }
      var dest = to || 'hand';
      if (dest === 'hand') {
        if (S.hand.length >= this.handLimit()) { S.discard.push(uid); this.emit('discard', { uid: uid, overdraw: true }); }
        else { S.hand.push({ uid: uid, card: null }); this.emit('draw', { uid: uid, id: rid, created: true }); }
      } else if (dest === 'draw') {
        var at = S.draw.length ? this.rng.int(S.draw.length + 1) : 0;
        S.draw.splice(at, 0, uid);
      } else if (dest === 'draw_top') S.draw.unshift(uid);
      else S.discard.push(uid);
      this.emit('create', { uid: uid, id: rid, to: dest });
      made.push(uid);
      this.syncPiles();
    }
    if (rid === 'curse_hairball') this.fire('onHairballCreated', { subject: null });
    return made;
  };

  // ---- ctx ------------------------------------------------------------------------
  P.makeCtx = function (o) {
    var ctx = Object.assign({ B: this, src: { kind: 'system' }, self: null, subject: null, target: null, choice: null, x: 0, store: {}, lk: 'sys' }, o || {});
    return ctx;
  };
  P.ctxFloor = function (ctx) {
    if (ctx.floorOverride !== undefined && ctx.floorOverride !== null) return ctx.floorOverride;
    if (ctx.self && ctx.self.floor !== undefined && (ctx.self.kind === 'cat' || ctx.self.kind === 'pest' || ctx.self.kind === 'room')) return ctx.self.floor;
    if (ctx.floor !== undefined && ctx.floor !== null) return ctx.floor;
    if (ctx.choice && ctx.choice.floor !== undefined) return ctx.choice.floor;
    if (ctx.choice && ctx.choice.pestUid) { var p = this.pestByUid(ctx.choice.pestUid); if (p) return p.floor; }
    if (ctx.choice && ctx.choice.catUid) { var c = this.catByUid(ctx.choice.catUid); if (c) return c.floor; }
    if (ctx.subject && ctx.subject.floor !== undefined) return ctx.subject.floor;
    return 0;
  };

  // ---- trigger queue ---------------------------------------------------------------
  P.queue = function (fn) { if (this._immediate) { fn(); return; } this._queue.push(fn); };
  P.fireNow = function (name, data) { var prev = this._immediate; this._immediate = true; try { this.fire(name, data); } finally { this._immediate = prev; } };
  P.drain = function () {
    if (this._draining) return;
    this._draining = true;
    var guard = 0;
    try {
      while (this._queue.length && !this.S.over) {
        var job = this._queue.shift();
        job();
        this.reap();
        if (++guard > 5000) { U.warnOnce('drain-guard', 'trigger queue exceeded 5000 jobs, dropped'); this._queue.length = 0; break; }
      }
    } finally { this._draining = false; }
    if (this.S.over) this._queue.length = 0;
    this.checkEnd();
  };

  var RELIC_CANON = { onNightPhase: 'onWitchingHour', onZoom: 'onAnyZoom', onLifeLost: 'onAnyLifeLost', onLifeSpent: 'onAnyLifeSpent' };
  // Collect every listener of `name` in the tie-break order of A02 section 4.
  P.collectListeners = function (name, data) {
    var E = ENG(), def = E.triggers.get(name) || { scope: 'any' };
    var out = [], self = this, S = this.S;
    var subject = data.subject || null;
    var sFloor = data.floor !== undefined ? data.floor : (subject && subject.floor !== undefined ? subject.floor : null);
    // 1 relics (hooks)
    (this.run.relics || []).forEach(function (r, ri) {
      var d = SB.content.relic(r.id); if (!d) return;
      (d.hooks || []).forEach(function (h, hi) {
        if (E.normHook(h.on) !== name && E.normTrigger(h.on) !== name) return;
        // a few moments are fired under several names; a relic hook is dispatched on exactly one canonical name
        var want = RELIC_CANON[h.on];
        if (want && want !== name) return;
        out.push({ kind: 'relic', relic: r, def: d, hook: h, lk: 'relic:' + r.id + ':' + hi });
      });
    });
    // 1b passives registered by spells
    S.passives.forEach(function (p) {
      if (p.trigger === name && !p.dead) out.push({ kind: 'passive', passive: p, lk: 'passive:' + p.id });
    });
    // 2 rooms by floor then slot
    S.floors.forEach(function (f) {
      f.rooms.forEach(function (rm) {
        var list = rm.fx && rm.fx[name]; if (!list || !list.length) return;
        if (def.scope !== 'global' && sFloor !== null && sFloor !== rm.floor) return;
        out.push({ kind: 'room', unit: rm, list: list, lk: 'room:' + rm.uid + ':' + name });
      });
    });
    // 3 cats
    S.floors.forEach(function (f) {
      f.cats.forEach(function (c) {
        var list = c.fx && c.fx[name]; if (!list || !list.length) return;
        if (def.scope === 'self' && subject !== c) return;
        if (def.scope === 'floor' && sFloor !== null && sFloor !== c.floor) return;
        if (def.notSelf && subject === c) return;
        out.push({ kind: 'cat', unit: c, list: list, lk: 'cat:' + c.uid + ':' + name });
      });
    });
    // 4 pests
    S.floors.forEach(function (f) {
      f.pests.forEach(function (p) {
        var list = p.fx && p.fx[name]; if (!list || !list.length) return;
        if (def.scope === 'self' && subject !== p) return;
        if (def.scope === 'floor' && sFloor !== null && sFloor !== p.floor) return;
        out.push({ kind: 'pest', unit: p, list: list, lk: 'pest:' + p.uid + ':' + name });
      });
    });
    return out;
  };

  // fire(name, data): data = { subject, target, floor, amount, ...extra }. Queues the effects; callers drain().
  P.fire = function (rawName, data) {
    if (this.S.over) return;
    var E = ENG(), name = E.normTrigger(rawName);
    data = data || {};
    var self = this;
    var ls = this.collectListeners(name, data);
    ls.forEach(function (l) {
      var subject = data.subject || null;
      var ctxBase = { subject: subject, target: data.target || null, floor: data.floor, trigger: name, data: data, killer: data.killer || null,
        card: data.card || null, cardUid: data.cardUid || null, store: {} };
      self.queue(function () {
        if (l.kind === 'relic') {
          var h = l.hook;
          var ctx = self.makeCtx(Object.assign({}, ctxBase, { src: { kind: 'relic', relic: l.relic }, self: null, lk: l.lk }));
          if (h.if && !self.checkAll(h.if, ctx)) return;
          if (h.limit && !self.limitOk(l.lk + ':h', h.limit, ctx, l.relic)) return;
          self.runEffects(h.effects || [], ctx);
        } else if (l.kind === 'passive') {
          var p = l.passive;
          var pctx = self.makeCtx(Object.assign({}, ctxBase, { src: { kind: 'passive', card: p.card }, self: p.ownerUid ? self.catByUid(p.ownerUid) : null, lk: l.lk, passiveFloor: p.floor }));
          if (p.once && p.fired) return;
          if (p.once) p.fired = true;
          self.runEffects(p.effects || [], pctx);
        } else {
          var u = l.unit;
          if (u.removed && !E.triggers.allowRemoved(name)) return;
          var uctx = self.makeCtx(Object.assign({}, ctxBase, { src: { kind: l.kind, unit: u }, self: u, lk: l.lk, floorOverride: undefined }));
          if (u.kind !== 'room' && data.floor === undefined && u.floor !== undefined) uctx.floorHint = u.floor;
          var times = (u.flags && u.flags.doubleTrigger && l.kind === 'room' && (name === 'onTurnStart' || name === 'onTurnEnd')) ? 2 : 1;
          for (var t = 0; t < times; t++) self.runEffects(l.list, uctx);
        }
      });
    });
  };

  // ---- limits --------------------------------------------------------------------
  P.limitOk = function (key, limit, ctx, relic) {
    if (!limit) return true;
    var per = limit.per || 'turn', n = limit.n === undefined ? 1 : limit.n;
    var S = this.S;
    var k = key + (limit.keyed ? ':' + ((ctx && ctx.subject && ctx.subject.uid) || (ctx && ctx.target && ctx.target.uid) || '') : '');
    var scopeId;
    if (per === 'turn' || per === 'round') scopeId = S.round;
    else if (per === 'fight' || per === 'battle') scopeId = 'b';
    else if (per === 'act' || per === 'run') {
      // stored on the relic instance (survives battles)
      if (relic) {
        relic.lim = relic.lim || {};
        var cur = relic.lim[k];
        var sid = per === 'act' ? (this.run.act || 1) : 'r';
        if (!cur || cur.s !== sid) cur = relic.lim[k] = { s: sid, n: 0 };
        if (cur.n >= n) return false;
        cur.n++; return true;
      }
      scopeId = 'b';
    } else scopeId = 'b';
    var rec = S.limits[k];
    if (!rec || rec.s !== scopeId) rec = S.limits[k] = { s: scopeId, n: 0 };
    if (rec.n >= n) return false;
    rec.n++;
    return true;
  };

  // ---- effect execution --------------------------------------------------------------
  P.runEffects = function (list, ctx) {
    if (!list) return;
    var base = ctx.lk || 'x';
    for (var i = 0; i < list.length; i++) {
      if (this.S.over) return;
      this.runEffect(list[i], ctx, base + '#' + i);
    }
  };

  P.runEffect = function (e, ctx, key) {
    if (!e) return;
    var E = ENG();
    var name = e.type || e.op;
    var op = name && E.ops.get(name);
    if (!op) {
      U.warnOnce('op:' + name, 'unsupported effect op "' + name + '"');
      return;
    }
    if (e.if && !this.checkAll(e.if, ctx)) return;
    var lim = e.limit;
    if (!lim && e.oncePerTurn) lim = { per: 'turn', n: 1 };
    if (!lim && (e.oncePerFight || e.once === true)) lim = { per: 'fight', n: 1 };
    if (!lim && e.capPerFight && name !== 'fish') lim = { per: 'fight', n: e.capPerFight };
    if (lim && !this.limitOk(key, lim, ctx, ctx.src && ctx.src.relic)) return;
    var times = e.times === undefined ? 1 : Math.max(0, this.num(e.times, ctx));
    if (e.floor === 'eachFloor') {
      var self = this;
      for (var f = 0; f < this.numFloors; f++) {
        var c2 = Object.assign({}, ctx, { floorOverride: f });
        for (var t = 0; t < times; t++) { this.execOp(op, c2, e, name); if (this.S.over) return; }
      }
    } else {
      for (var t2 = 0; t2 < times; t2++) {
        var r = this.execOp(op, ctx, e, name);
        if (this.S.over) return;
        if (r === 'stop') break;
      }
    }
    this.reap();
  };
  P.execOp = function (op, ctx, e, name) {
    var r;
    try { r = op(ctx, e, this); }
    catch (err) {
      U.warnOnce('opfail:' + name + ':' + err.message, 'op "' + name + '" failed: ' + err.message);
      if (SB.util.throwOps) throw err;
    }
    ctx.last = r;
    return r;
  };

  // numbers and AmountExpr
  P.num = function (x, ctx) {
    if (typeof x === 'number') return x;
    if (!x || typeof x !== 'object') return 0;
    var E = ENG();
    var base = x.base || 0, v = 0;
    if (x.per) {
      var c = E.counters.get(x.per);
      var cv = c ? c(ctx, x, this) : (U.warnOnce('counter:' + x.per, 'unsupported counter "' + x.per + '"'), 0);
      if (x.div) v = Math.floor(cv / x.div);
      else v = Math.floor((x.mult === undefined ? 1 : x.mult) * cv);
    }
    var r = base + v;
    if (x.cap !== undefined && r > x.cap) r = x.cap;
    if (x.max !== undefined && r > x.max) r = x.max;
    if (x.min !== undefined && r < x.min) r = x.min;
    return r;
  };

  P.checkAll = function (list, ctx) {
    var l = U.toArray(list);
    for (var i = 0; i < l.length; i++) if (!this.checkOne(l[i], ctx)) return false;
    return true;
  };
  P.checkOne = function (c, ctx) {
    var E = ENG();
    if (typeof c === 'string') {
      var ck = E.checks.get(c);
      if (!ck) { var cf0 = E.conds.get(c); if (cf0) return !!cf0(ctx, true, this); U.warnOnce('check:' + c, 'unsupported check "' + c + '"'); return false; }
      return !!ck(ctx, {}, this, '');
    }
    if (!c || typeof c !== 'object') return true;
    if (c.check) {
      var nm = c.check, arg = '';
      var fn = E.checks.get(nm);
      if (!fn) { var ix = nm.indexOf(':'); if (ix > 0) { arg = nm.slice(ix + 1); fn = E.checks.get(nm.slice(0, ix) + ':*'); } }
      if (!fn) { U.warnOnce('check:' + nm, 'unsupported check "' + nm + '"'); return false; }
      var val = fn(ctx, c, this, arg);
      var exp = c.value;
      var op = c.op || '==';
      if (typeof val === 'boolean' && typeof exp === 'boolean') return U.cmp(val, op, exp);
      if (typeof val === 'boolean' && typeof exp === 'number') return U.cmp(val ? 1 : 0, op, exp);
      return U.cmp(val, op, exp);
    }
    // pattern style conditions: { roundAtLeast: 2 } etc.
    var ks = Object.keys(c).filter(function (k) { return k !== 'op' && k !== 'value'; });
    for (var i = 0; i < ks.length; i++) {
      var cf = E.conds.get(ks[i]);
      if (!cf) { U.warnOnce('cond:' + ks[i], 'unsupported condition "' + ks[i] + '"'); return false; }
      if (!cf(ctx, c[ks[i]], this)) return false;
    }
    return true;
  };

  // target resolution: returns an array of refs (units, floor refs, {kind:'player'} ...)
  P.targets = function (spec, ctx, e) {
    if (spec === undefined || spec === null) return [];
    var E = ENG();
    var fn = E.targets.get(spec);
    if (!fn) { U.warnOnce('target:' + spec, 'unsupported target "' + spec + '"'); return []; }
    var r = fn(ctx, e || {}, this);
    return r ? (Array.isArray(r) ? r : [r]) : [];
  };
  P.catTargets = function (spec, ctx, e) { return this.targets(spec, ctx, e).filter(function (t) { return t && t.kind === 'cat' && !t.removed; }); };
  P.pestTargets = function (spec, ctx, e) { return this.targets(spec, ctx, e).filter(function (t) { return t && t.kind === 'pest' && !t.removed; }); };

  // ---- unit factories ---------------------------------------------------------------
  P.mkCat = function (cardUid, floor) {
    var S = this.S, rec = S.cards[cardUid], eff = rec.eff, st = eff.stats || { power: 0, health: 1, lives: 1, size: 1 };
    var inst = rec.inst ? this.instByUid(rec.inst) : null;
    var kw = U.deepClone(eff.keywords || {});
    var flags = U.deepClone(eff.flags || {});
    if (kw.decoy) flags.decoy = true;
    var tags = (eff.tags || []).slice();
    var size = st.size || (tags.indexOf('large') >= 0 ? 2 : 1);
    var unit = {
      kind: 'cat', uid: this.uid('k'), cardUid: cardUid, instUid: inst ? inst.uid : null, id: eff.id, name: eff.name, art: eff.art,
      basePower: st.power || 0, power: st.power || 0, health: st.health, maxHealth: st.health, baseMax: st.health, fluff: 0,
      lives: inst ? inst.lives : 1, maxLives: inst ? inst.maxLives : 1, size: size, statuses: {}, napping: false, hidden: false, boxed: null,
      floor: floor, pos: 0, kw: kw, fx: U.deepClone(eff.effects || {}), aura: U.deepClone(eff.aura || []), flags: flags, mods: U.deepClone(eff.mods || {}),
      rules: U.deepClone(eff.rules || {}), buffs: { power: 0, health: 0 }, tbuff: { power: 0 }, token: !inst, champion: eff.type === 'champion',
      activated: U.deepClone(eff.activated || []), playedRound: S.round, tags: tags, counters: {}, revealed: false, statusCaps: eff.statusCapAdd || {},
      napRound: -9, wokeRound: -9, rudeRound: -9, zoomedRound: -9, forcedNapRound: -9, cheated: false, ambushUsed: false, text: eff.text, unitCost: eff.cost,
      type: eff.type, clan: eff.clan, rarity: eff.rarity
    };
    if (unit.token) { unit.lives = 1; unit.maxLives = 1; }
    return unit;
  };

  // A cat can be placed if the cat Size sum fits.
  P.canPlaceCat = function (cardUid, floor) {
    var rec = this.S.cards[cardUid]; if (!rec) return false;
    var size = (rec.eff.stats && rec.eff.stats.size) || ((rec.eff.tags || []).indexOf('large') >= 0 ? 2 : 1);
    return this.catSize(floor) + size <= this.S.floors[floor].capacity.cats;
  };

  P.placeCat = function (cardUid, floor, pos, o) {
    o = o || {};
    var S = this.S, f = S.floors[floor];
    if (!this.canPlaceCat(cardUid, floor)) { this.toast('No room on that floor'); return null; }
    var unit = this.mkCat(cardUid, floor);
    // Reborn keeps half the Claws (round down) the cat died with (A04, Last Gasp Gus)
    if (S.rebornClaws && S.rebornClaws[cardUid]) { unit.statuses.claws = S.rebornClaws[cardUid]; delete S.rebornClaws[cardUid]; }
    var p = pos === undefined || pos === null || pos > f.cats.length ? f.cats.length : Math.max(0, pos);
    f.cats.splice(p, 0, unit);
    this.reindex(floor);
    this.touch();
    this.emit('deploy', { uid: unit.uid, cardUid: cardUid, id: unit.id, name: unit.name, floor: floor, pos: unit.pos, from: o.from || null, token: unit.token });
    // Boxes: auto seat unless declined
    if (!o.noBox) this.autoSeat(unit);
    return unit;
  };

  P.autoSeat = function (unit) {
    if (unit.size > 1 && !this.mod('largeCatsFitBoxes', 0)) return false;
    if (unit.statuses.coned) return false;
    var f = this.S.floors[unit.floor];
    for (var i = 0; i < f.rooms.length; i++) {
      var rm = f.rooms[i];
      if (rm.rtype === 'box' && rm.occupants.length < rm.fits + this.mod('boxCapacity', 0)) { this.seatCat(unit, rm); return true; }
    }
    return false;
  };
  P.seatCat = function (unit, box) {
    box.occupants.push(unit.uid);
    unit.boxed = box.uid;
    unit.revealed = false;
    this.stat('boxEntries'); this.stat('boxSits');
    this.touch();
    this.emit('box', { uid: unit.uid, box: box.uid, floor: unit.floor, action: 'enter' });
    this.fire('onBoxEnter', { subject: unit, floor: unit.floor });
    this.fire('onBoxEntered', { subject: unit, floor: unit.floor });
  };
  P.unseatCat = function (unit, why) {
    if (!unit.boxed) return;
    var box = this.roomByUid(unit.boxed);
    if (box) { var i = box.occupants.indexOf(unit.uid); if (i >= 0) box.occupants.splice(i, 1); }
    unit.boxed = null;
    unit.revealed = false;
    this.touch();
    this.emit('box', { uid: unit.uid, box: box && box.uid, floor: unit.floor, action: 'leave', why: why || null });
    this.fire('onUnbox', { subject: unit, floor: unit.floor });
  };

  // Full deployment of a cat card: place, Deploy effects, onCatDeployed triggers, Pounce.
  P.deployCat = function (cardUid, floor, pos, o) {
    o = o || {};
    var unit = this.placeCat(cardUid, floor, pos, o);
    if (!unit) return null;
    var eff = this.S.cards[cardUid].eff;
    // fight start effects (champions): run once per unit placement
    if (unit.fx.onBattleStart && unit.fx.onBattleStart.length && !o.noFightStart) {
      this.runEffects(unit.fx.onBattleStart, this.makeCtx({ src: { kind: 'cat', unit: unit }, self: unit, subject: unit, lk: 'cat:' + unit.uid + ':start' }));
    }
    var onPlay = unit.fx.onPlay || [];
    if (onPlay.length && !o.noDeploy) {
      this.runEffects(onPlay, this.makeCtx({ src: { kind: 'cat', unit: unit }, self: unit, subject: unit, choice: o.choice || null, x: o.x || 0, lk: 'cat:' + unit.uid + ':play', cardUid: cardUid }));
    }
    if (unit.removed) return unit;
    // Knead keyword (default trigger onPlay)
    this.kneadTrigger(unit, 'onPlay');
    if (unit.kw.fluff && typeof unit.kw.fluff === 'number') this.addFluff(unit, unit.kw.fluff, { src: { kind: 'system' } });
    this.fire('onCatDeployed', { subject: unit, floor: unit.floor });
    if (o.summoned) this.fire('onSummon', { subject: unit, floor: unit.floor });
    if (this.mod('napOnPlay', 0) && unit.size && !unit.token) { /* relic napOnPlay handled in cats that may nap the turn they are played */ }
    this.drain();
    if (!unit.removed && !o.noPounce) {
      var pn = unit.kw.pounce;
      if (pn) this.pounceAttack(unit, typeof pn === 'number' ? pn : 1, {});
    }
    this.drain();
    return unit;
  };

  P.kneadTrigger = function (unit, trig) {
    var k = unit.kw.knead;
    if (!k || unit.token) return;
    var kt = (typeof k === 'object' ? (k.trigger || 'onPlay') : 'onPlay');
    if (kt !== trig) return;
    var n = (typeof k === 'object' ? k.n : k) || 1;
    var stat = (typeof k === 'object' ? k.stat : 'attack') || 'attack';
    this.doKnead(unit, stat, n);
  };
  P.doKnead = function (unit, stat, n) {
    var inst = unit.instUid ? this.instByUid(unit.instUid) : null;
    var S = this.S;
    if (unit.flags.kneadDouble || (this.mod('kneadFirstDouble', 0) && !S.counters.kneadFirst)) { n *= 2; S.counters.kneadFirst = 1; }
    if (!inst) {
      // fight-only cat: apply to the unit only
      if (stat === 'health') { unit.baseMax += n; unit.maxHealth += n; unit.health += n; } else unit.basePower += n;
      return 0;
    }
    var cap = (unit.champion ? rv('knead_cap_champion', 20) : rv('knead_cap', 12)) + this.mod('kneadCapBonus', 0);
    var tot = (inst.knead.attack || 0) + (inst.knead.health || 0) + (inst.knead.value || 0);
    var gain = Math.max(0, Math.min(n, cap - tot));
    if (gain <= 0) return 0;
    var key = stat === 'health' ? 'health' : (stat === 'value' ? 'value' : 'attack');
    inst.knead[key] += gain;
    if (key === 'attack') unit.basePower += gain; else if (key === 'health') { unit.baseMax += gain; unit.maxHealth += gain; unit.health += gain; }
    S.counters.kneadTotal = (S.counters.kneadTotal || 0) + gain;
    S.growth.push({ kind: 'knead', uid: inst.uid, id: inst.id, name: unit.name, stat: key, amount: gain, text: unit.name + ' kneaded +' + gain + ' ' + (key === 'attack' ? 'Attack' : key) });
    this.emit('status', { uid: unit.uid, status: 'knead', amount: gain, kind: 'knead' });
    this.recomputeCard(unit.cardUid);
    this.fire('onKneadTriggered', { subject: unit });
    return gain;
  };

  // ---- rooms -------------------------------------------------------------------------
  P.roomFree = function (floor) { var f = this.S.floors[floor]; return f.rooms.length < f.capacity.rooms; };
  P.boxesOnFloor = function (floor) { return this.S.floors[floor].rooms.filter(function (r) { return r.rtype === 'box'; }).length; };
  P.maxBoxes = function (floor) {
    var m = rv('boxes_max_per_floor', 2);
    this.S.floors[floor].cats.forEach(function (c) { if (c.rules && c.rules.maxBoxesPerFloor) m = Math.max(m, c.rules.maxBoxesPerFloor); });
    return m;
  };
  P.placeRoom = function (floor, spec) {
    var S = this.S, f = S.floors[floor];
    if (!this.roomFree(floor)) { this.toast('No room slot on that floor'); return null; }
    var room = Object.assign({ kind: 'room', uid: this.uid('r'), floor: floor, slot: f.rooms.length, fx: {}, aura: [], kw: {}, flags: {}, occupants: [], rtype: 'toy' }, spec);
    f.rooms.push(room);
    this.reindex(floor);
    this.touch();
    this.emit('room', { uid: room.uid, id: room.id, floor: floor, rtype: room.rtype, name: room.name, action: 'place' });
    return room;
  };
  P.placeToy = function (cardUid, floor) {
    var rec = this.S.cards[cardUid], eff = rec.eff;
    var fx = U.deepClone(eff.effects || {});
    var onPlay = fx.onPlay; delete fx.onPlay;
    var room = this.placeRoom(floor, { cardUid: cardUid, id: eff.id, name: eff.name, art: eff.art, fx: fx, aura: U.deepClone(eff.aura || []), kw: U.deepClone(eff.keywords || {}),
      flags: U.deepClone(eff.flags || {}), tags: (eff.tags || []).slice(), text: eff.text, rtype: 'toy', charges: eff.charges || 0 });
    // Durability (Yarn Ball 3, Tangled Skein 4, Whole Sweater 6) plus charges ("Lasts 2 more turns") is how many rounds the toy stays; no number means the whole fight
    var raw = SB.content.card && SB.content.card(eff.id), life = ((raw && raw.durability) || eff.durability || 0) + (eff.charges || 0);
    if (life > 0) { room.durability = life; room.maxDurability = life; room.expires = true; }
    return { room: room, onPlay: onPlay };
  };
  P.placeBox = function (floor, o) {
    o = o || {};
    if (this.boxesOnFloor(floor) >= this.maxBoxes(floor)) { this.toast('That floor has all the Boxes it can hold'); return null; }
    var kinds = {
      cardboard: { name: 'Cardboard Box', fits: rv('box_fits', 1), dur: rv('box_durability_cardboard', 3), bonus: 1, hide: true },
      laundry: { name: 'Laundry Basket', fits: rv('big_box_fits', 2), dur: rv('box_durability_laundry_basket', 4), bonus: 1, hide: true },
      shoebox: { name: 'Shoebox', fits: 1, dur: rv('box_durability_shoebox', 2), bonus: 0, hide: true },
      paper: { name: 'Paper Bag', fits: 1, dur: rv('box_durability_paper_bag', 2), bonus: -1, hide: true },
      tape: { name: 'Tape Square', fits: 1, dur: 99, bonus: 1, hide: false, tape: true }
    };
    var k = kinds[o.kind || 'cardboard'] || kinds.cardboard;
    var fits = o.size || k.fits;
    var dur = o.durability || k.dur;
    var room = this.placeRoom(floor, { id: 'box_' + (o.kind || 'cardboard'), name: k.name, rtype: 'box', boxKind: o.kind || 'cardboard', fits: fits, durability: dur, maxDurability: dur,
      sitBonus: k.bonus, hides: k.hide, tape: !!k.tape, art: 'toy_box', fx: {}, occupants: [] });
    return room;
  };
  P.flattenBox = function (room, why) {
    var f = this.S.floors[room.floor];
    var i = f.rooms.indexOf(room); if (i < 0) return;
    var self = this;
    room.occupants.slice().forEach(function (uid) { var c = self.catByUid(uid); if (c) self.unseatCat(c, 'flatten'); });
    f.rooms.splice(i, 1);
    this.reindex(room.floor);
    this.touch();
    this.emit('room', { uid: room.uid, floor: room.floor, rtype: 'box', action: 'flatten', why: why || null });
    this.fire('onBoxFlattened', { subject: null, floor: room.floor });
    this.fire('onAnyBoxFlattened', { subject: null, floor: room.floor });
    if (!room.tape && !room.noPack) this.createCard('token_flat_pack', 1, 'discard');
  };
  P.removeRoom = function (room, why) {
    var f = this.S.floors[room.floor];
    var i = f.rooms.indexOf(room); if (i < 0) return;
    if (room.rtype === 'box') return this.flattenBox(room, why);
    f.rooms.splice(i, 1);
    room.removed = true;
    this.reindex(room.floor);
    this.touch();
    this.emit('room', { uid: room.uid, floor: room.floor, rtype: room.rtype, action: 'remove', why: why || null });
  };

  // ---- dirty tracking and recalculation -------------------------------------------------
  P.touch = function () { this._dirty = true; };
  P.ensure = function () { if (this._dirty !== false) this.recalc(); };

  // Piles: runs of consecutive cats. Returns array of runs (arrays of cats).
  P.pileRuns = function (floor) {
    var cats = this.S.floors[floor].cats, runs = [], cur = [];
    var self = this;
    if (this.S.rules.noPile) return runs;
    var ignoreGaps = this.mod('pileIgnoreGaps', 0);
    cats.forEach(function (c) {
      var breaks = c.statuses.shamed || c.statuses.coned || c.dead;
      if (breaks) { if (cur.length) runs.push(cur); cur = []; return; }
      cur.push(c);
    });
    if (cur.length) runs.push(cur);
    // Laundry Basket: the cats sharing a basket count as adjacent, so the runs they sit in join into one Pile
    this.S.floors[floor].rooms.forEach(function (rm) {
      if (rm.rtype !== 'box' || rm.boxKind !== 'laundry' || !rm.occupants || rm.occupants.length < 2) return;
      var ins = [];
      rm.occupants.forEach(function (uid) {
        for (var i = 0; i < runs.length; i++) if (runs[i].some(function (c) { return c.uid === uid; })) { if (ins.indexOf(runs[i]) < 0) ins.push(runs[i]); break; }
      });
      if (ins.length < 2) return;
      var merged = [];
      ins.forEach(function (r) { merged = merged.concat(r); });
      var first = runs.indexOf(ins[0]);
      runs = runs.filter(function (r) { return ins.indexOf(r) < 0; });
      runs.splice(Math.min(first, runs.length), 0, merged);
    });
    return runs;
  };
  P.pileSizeOf = function (cat) {
    if (!cat || cat.removed || this.S.rules.noPile) return 0;
    var runs = this.pileRuns(cat.floor), self = this;
    for (var i = 0; i < runs.length; i++) {
      if (runs[i].indexOf(cat) >= 0) {
        var P0 = U.sum(runs[i], function (c) { return c.flags.pileWeight2 ? 2 : 1; });
        P0 += this.mod('pileBonus', 0);
        var fa = (this.S.floors[cat.floor]._pileAura || 0);
        P0 += fa;
        // a Pile needs two real cats; Family Portrait style bonuses and heavy cats grow a Pile but never make one out of a lone cat
        return runs[i].length >= 2 ? P0 : 0;
      }
    }
    return 0;
  };

  P.recalc = function () {
    this._dirty = false;
    var S = this.S, self = this, E = ENG();
    var cats = this.cats();
    S.floors.forEach(function (f) { f._pileAura = 0; });
    cats.forEach(function (c) { c._aura = { power: 0, health: 0, kw: {} }; });
    this.pests().forEach(function (p) { p._aura = { damageTaken: 0, power: 0 }; });
    // aura providers: rooms then cats
    var providers = [];
    S.floors.forEach(function (f) { f.rooms.forEach(function (r) { if (r.aura && r.aura.length) providers.push(r); }); });
    cats.forEach(function (c) { if (c.aura && c.aura.length && !c.napDisabled) providers.push(c); });
    // first pass: pileSize auras (they change pile size)
    var pass = function (onlyPile) {
      providers.forEach(function (pv) {
        pv.aura.forEach(function (a) {
          var isPile = a.stat === 'pileSize';
          if (isPile !== onlyPile) return;
          var ctx = self.makeCtx({ src: { kind: pv.kind, unit: pv }, self: pv, floorOverride: pv.floor, lk: 'aura' });
          if (a.if && !self.checkAll(a.if, ctx)) return;
          var targets = self.targets(a.target || 'self', ctx, a);
          var amt = self.num(a.amount, ctx);
          if (a.stat === 'pileSize') { S.floors[pv.floor]._pileAura += amt; return; }
          targets.forEach(function (t) {
            if (!t || !t._aura) return;
            if (a.filter) { var c2 = self.makeCtx({ src: ctx.src, self: pv, target: t, subject: t, floorOverride: pv.floor, lk: 'aura' }); if (!self.checkAll(a.filter, c2)) return; }
            if (a.stat === 'power') t._aura.power += amt;
            else if (a.stat === 'health') t._aura.health += amt;
            else if (a.stat === 'damageTaken') t._aura.damageTaken += amt;
            else if (a.stat && a.stat.indexOf('keyword:') === 0) t._aura.kw[a.stat.slice(8)] = true;
          });
        });
      });
    };
    pass(true);
    // snug and piles
    S.floors.forEach(function (f, fi) {
      f.cats.forEach(function (c) { c._snug = 0; c._pile = 0; });
      var runs = S.rules.noPile ? [] : self.pileRuns(fi);
      runs.forEach(function (run) {
        var Psz = U.sum(run, function (c) { return c.flags.pileWeight2 ? 2 : 1; }) + self.mod('pileBonus', 0) + f._pileAura;
        if (run.length < 2) return;  // a Pile needs two real cats, a lone cat never counts as a Pile of 2
        var snug = rv('pile_attack_divisor', 2) ? Math.floor(Psz / rv('pile_attack_divisor', 2)) : 0;
        run.forEach(function (c) {
          c._pile = Psz;
          var sn = c.flags.pileBonusDouble ? Psz : snug;
          c._snug = (c.zoomedRound === S.round) ? 0 : sn;
        });
      });
    });
    pass(false);
    // derived stats for cats
    cats.forEach(function (c) {
      var relicHp = self.mod('catMaxHealth', 0);
      var newMax = c.baseMax + c.buffs.health + c._aura.health + relicHp;
      var oldMax = c.maxHealth;
      c.maxHealth = newMax;
      if (newMax > oldMax && c._auraHp !== undefined) c.health += (newMax - oldMax);
      if (c.health > c.maxHealth) c.health = c.maxHealth;
      c._auraHp = 1;
      c.hidden = self.isHidden(c);
      c.cornered = self.isCornered(c);
      c.power = self.atk(c, true) + (c.statuses.claws || 0);
    });
    // Suds hazard: pests (not bosses) standing in suds are Hidden (untargetable) until they act or an AoE reveals them
    this.pests().forEach(function (p) {
      var hid = !p.dead && !p.removed && !p.queued && !p.boss && !p.sudsRevealed && self.hasHazard(p.floor, 'suds');
      if (hid && !p._sudsHid) { p._sudsHid = true; p._untgtBefore = !!p.untargetable; p.untargetable = true; }
      else if (!hid && p._sudsHid) { p._sudsHid = false; p.untargetable = !!p._untgtBefore; }
      p.hidden = !!p._sudsHid;
    });
    // pests: aura power via attack calculators
    this.pests().forEach(function (p) { p.fluffShown = p.fluff; });
  };

  // Cornered: 2+ max Lives and at or under `corneredAt` Lives (1 by default, Cornered Collar raises it).
  P.corneredAt = function () { return Math.max(1, this.mod('corneredAt', 1)); };
  P.isCornered = function (c) { return !!c && c.maxLives >= 2 && c.lives >= 1 && c.lives <= this.corneredAt(); };

  // Floor hazards: set by floorHazard ops, plus the Laser Zone that follows the real Red Dot ("the floor it stands on glows red").
  P.hasHazard = function (fi, id) {
    var f = this.S.floors[fi]; if (!f) return false;
    if (f.hazards[id]) return true;
    if (id === 'laser_zone') return f.pests.some(function (p) { return !p.dead && !p.removed && p.id === 'pest_boss_red_dot'; });
    return false;
  };

  P.isHidden = function (c) {
    if (c.statuses.hidden > 0) return true;
    if (c.boxed && !c.revealed) { var b = this.roomByUid(c.boxed); return !!(b && b.hides); }
    return false;
  };

  // Attack value of a cat (without Claws, which are a per-hit flat bonus).
  P.atk = function (c, skipEnsure) {
    if (!skipEnsure) this.ensure();
    var S = this.S;
    var aura = c._aura || { power: 0 };
    var v = c.basePower + c.buffs.power + (c.tbuff.power || 0) + aura.power + (c._snug || 0);
    if (c.boxed) { var b = this.roomByUid(c.boxed); if (b) v += b.sitBonus === undefined ? rv('box_power_bonus', 1) : b.sitBonus; }
    if (this.isCornered(c)) v += this.mod('corneredBonus', rv('lives_cornered_attack', 2));
    if (S.nip.surge > 0) v += rv('surge_attack_bonus', 2) + (S.nip.excess || 0);
    if (c.rudeRound === S.round) v += rv('rude_awakening_attack', 2);
    v += this.mod('catPower', 0);
    if (c.statuses.frazzled && v > 0) v = Math.max(1, v - 2);
    if (c.floor === 2 && false) v += 0;
    return Math.max(0, v);
  };

  // ======================================================================================
  // unit helpers: hp, statuses, fluff, healing
  // ======================================================================================
  var ALIAS = { dazed: 'yarn', tangled: 'yarn', hide: 'fluff', armor: 'fluff', taunt: 'decoy', thorns: 'bristle', 'dull': 'dull' };
  BT.STATUS_ALIAS = ALIAS;
  P.getHp = function (u) { return u.kind === 'cat' ? u.health : u.hp; };
  P.setHp = function (u, v) { if (u.kind === 'cat') u.health = v; else u.hp = v; };
  P.maxHpOf = function (u) { return u.kind === 'cat' ? u.maxHealth : u.maxHp; };
  P.stn = function (u, id) { return (u && u.statuses && u.statuses[id]) || 0; };
  P.has = function (u, id) { return this.stn(u, id) > 0; };
  P.hasTrait = function (p, t) { return !!(p && p.traitSet && p.traitSet[String(t).toLowerCase()]); };
  P.isBossPest = function (p) { return !!(p && p.boss); };
  P.stat = function (k, n) { var s = this.S.stats; s[k] = (s[k] || 0) + (n === undefined ? 1 : n); };
  P.statMax = function (k, v) { var s = this.S.stats; if (!(s[k] >= v)) s[k] = v; };

  P.statusMax = function (u, id) {
    var d = ENG().statuses.get(id), m = d && d.max !== undefined ? d.max : rv('stack_global_cap', 99);
    if (u && u.statusCaps && u.statusCaps[id]) m += u.statusCaps[id];
    if (id === 'rested') m = rv('rested_max', 4) + this.mod('maxRested', 0) + (u && u.statusCaps && u.statusCaps.rested ? 0 : 0);
    return m;
  };

  P.addStatus = function (u, id, n, o) {
    o = o || {};
    if (!u || !n) return 0;
    id = ALIAS[id] || id;
    if (id === 'fluff') return n > 0 ? this.addFluff(u, n, o) : this.stripFluff(u, -n, o);
    if (u.kind === 'floor') return this.addFloorStatus(u, id, n, o);
    if (u.kind === 'room') return 0;
    if (u.removed) return 0;
    var E = ENG(), d = E.statuses.get(id);
    if (!d) { U.warnOnce('status:' + id, 'unsupported status "' + id + '"'); d = { kind: 'I', max: 99 }; }
    if (d.side && d.side.indexOf(u.kind) < 0) return 0;
    var cur = u.statuses[id] || 0;
    if (n < 0) return this.removeStatus(u, id, -n, o);
    // immunities and special application rules
    if (u.kind === 'pest') {
      if (u.immune && u.immune.indexOf(id) >= 0) return 0;
      if (u.boss && (id === 'scared')) return 0;
      if (u.boss && id === 'yarn') n = Math.ceil(n / rv('yarn_boss_duration_divisor', 2));
      if (id === 'dizzy' && u.tier === 'elite') { n = Math.max(0, Math.min(n, rv('dizzy_elite_stack_cap', 3) - cur)); if (!n) return 0; }
      if (id === 'rage' && (this.stn(u, 'hiss') >= rv('hiss_rage_block_threshold', 3) || this.stn(u, 'hairball') >= rv('hairball_gagging_threshold', 5) || u.statuses.groomed_ruined)) return 0;
    } else if (u.kind === 'cat') {
      if (id === 'scared' && (u.hidden || u.statuses.catnip)) return 0;
      if ((id === 'rested' || id === 'hidden') && u.statuses.wet) return 0;
      if (id === 'scared' && (this.floorStatus(u.floor, 'purr') >= rv('purr_thresholds', [5, 10, 20, 30, 40])[4])) return 0;
    }
    var mx = this.statusMax(u, id);
    if (u.kind === 'cat' && id === 'dizzy') mx = rv('dizzy_max_cat', 5);
    if (u.kind === 'pest' && id === 'dizzy') mx = rv('dizzy_max_pest', 20);
    var nv = Math.min(mx, cur + n);
    if (nv === cur) return 0;
    u.statuses[id] = nv;
    var gained = nv - cur;
    if (u.kind === 'cat' && id === 'wet' && cur === 0) {
      if (u.statuses.claws) { u.statuses.claws = Math.floor(u.statuses.claws / 2); if (!u.statuses.claws) delete u.statuses.claws; }
      delete u.statuses.bristle;
    }
    if (u.kind === 'pest' && id === 'wet' && cur === 0 && u.statuses.rage) { u.statuses.rage = Math.floor(u.statuses.rage / 2); if (!u.statuses.rage) delete u.statuses.rage; }
    if (u.kind === 'cat' && id === 'scared') { delete u.statuses.purr; }
    if (u.kind === 'cat' && id === 'dizzy') { delete u.statuses.frenzy; }
    this.touch();
    this.emit('status', { uid: u.uid, status: id, amount: gained, total: nv, floor: u.floor, pos: u.pos, side: u.kind, kind: 'add' });
    if (id === 'yarn') { this.statMax('maxYarnOnPest', nv); }
    if (id === 'rested') this.statMax('maxRested', nv);
    if (u.kind === 'pest' && id === 'hiss' && nv >= rv('hiss_scared_threshold', 2) && u.hissScaredRound !== this.S.round) { u.hissScaredRound = this.S.round; this.addStatus(u, 'scared', 1, { src: 'hiss' }); }
    this.fire('onStatusApplied', { subject: u, status: id, amount: gained, floor: u.floor, src: o.src });
    return gained;
  };
  P.removeStatus = function (u, id, n, o) {
    if (!u || !u.statuses) return 0;
    id = ALIAS[id] || id;
    if (id === 'fluff') return this.stripFluff(u, n === undefined ? 9999 : n, o);
    var cur = u.statuses[id] || 0; if (!cur) return 0;
    var take = n === undefined || n === null ? cur : Math.min(cur, n);
    var nv = cur - take;
    if (nv > 0) u.statuses[id] = nv; else delete u.statuses[id];
    this.touch();
    this.emit('status', { uid: u.uid, status: id, amount: -take, total: nv, floor: u.floor, pos: u.pos, side: u.kind, kind: 'remove' });
    return take;
  };
  P.setStatus = function (u, id, n) {
    var cur = this.stn(u, id);
    if (n > cur) return this.addStatus(u, id, n - cur);
    if (n < cur) return -this.removeStatus(u, id, cur - n);
    return 0;
  };
  P.clearDebuffs = function (u) {
    var E = ENG(), self = this;
    Object.keys(u.statuses).forEach(function (id) {
      var d = E.statuses.get(id);
      if (id === 'marked' || id === 'cozy') return;
      if (d && d.tone === 'debuff') self.removeStatus(u, id);
    });
  };
  P.clearBuffs = function (u) {
    var E = ENG(), self = this;
    Object.keys(u.statuses).forEach(function (id) {
      var d = E.statuses.get(id);
      if (id === 'marked') return;
      if (d && d.tone === 'buff') self.removeStatus(u, id);
    });
    if (u.fluff) this.stripFluff(u, u.fluff);
  };

  // floor statuses
  P.floorStatus = function (fi, id) { var f = this.S.floors[fi]; return (f && f.statuses[id]) || 0; };
  P.addFloorStatus = function (f, id, n, o) {
    if (typeof f === 'number') f = this.S.floors[f];
    if (!f) return 0;
    id = ALIAS[id] || id;
    var E = ENG(), d = E.floorStatuses.get(id);
    if (!d) { U.warnOnce('fstatus:' + id, 'unsupported floor status "' + id + '"'); d = { max: 99 }; }
    var cur = f.statuses[id] || 0;
    var cap = d.max !== undefined ? d.max : 99;
    var nv = Math.max(0, Math.min(cap, cur + n));
    if (nv === cur) return 0;
    if (!cur && Object.keys(f.statuses).length >= rv('status_slots_per_floor', 2) && d.slotted !== false && id !== 'purr') { this.toast('That floor has no room for another status'); return 0; }
    if (nv) f.statuses[id] = nv; else delete f.statuses[id];
    this.touch();
    this.emit('status', { floor: f.index, status: id, amount: nv - cur, total: nv, side: 'floor', kind: nv > cur ? 'add' : 'remove' });
    if (id === 'purr') this.statMax('maxPurr', nv);
    return nv - cur;
  };

  P.addFluff = function (u, n, o) {
    o = o || {};
    if (!u || n <= 0 || u.removed) return 0;
    if (u.kind === 'floor' || u.kind === 'room') return 0;
    if (u.kind === 'sunbeam' || u.kind === 'player') { return this.addShade(n); }
    if (u.kind === 'cat' && u.statuses.wet && !o.force) return 0;
    if (u.kind === 'pest' && u.statuses.groomed_ruined) return 0;
    var max = u.kind === 'cat' ? rv('fluff_max', 50) : 99;
    var nv = Math.min(max, (u.fluff || 0) + n), g = nv - (u.fluff || 0);
    if (g <= 0) return 0;
    u.fluff = nv;
    this.touch();
    this.emit('status', { uid: u.uid, status: 'fluff', amount: g, total: nv, floor: u.floor, pos: u.pos, side: u.kind, kind: 'add' });
    if (u.kind === 'cat') this.statMax('maxFluff', nv);
    return g;
  };
  P.stripFluff = function (u, n, o) {
    if (!u || !u.fluff) return 0;
    var take = Math.min(u.fluff, n === undefined ? u.fluff : n);
    u.fluff -= take; this.touch();
    this.emit('status', { uid: u.uid, status: 'fluff', amount: -take, total: u.fluff, floor: u.floor, pos: u.pos, side: u.kind, kind: 'remove' });
    return take;
  };
  P.addShade = function (n) {
    var sb = this.S.sunbeam; sb.shade = Math.max(0, sb.shade + n); this.touch();
    this.emit('status', { status: 'shade', amount: n, total: sb.shade, side: 'sunbeam', kind: 'add' });
    return n;
  };
  P.addWarmth = function (n, o) {
    var sb = this.S.sunbeam, before = sb.warmth;
    sb.warmth = Math.min(sb.max, sb.warmth + n);
    var d = sb.warmth - before;
    if (d > 0) this.emit('heal', { side: 'sunbeam', amount: d, total: sb.warmth, kind: 'warmth' });
    this.touch();
    return d;
  };
  P.heal = function (u, n, o) {
    o = o || {};
    if (!u || n <= 0) return 0;
    if (u.kind === 'sunbeam' || u.kind === 'player') return this.addWarmth(n, o);
    if (u.removed || u.dead) return 0;
    if (u.kind !== 'cat' && u.kind !== 'pest') return 0;
    var mx = this.maxHpOf(u), cur = this.getHp(u), nv = Math.min(mx, cur + n), g = nv - cur;
    if (g <= 0) return 0;
    this.setHp(u, nv);
    this.touch();
    this.emit('heal', { uid: u.uid, amount: g, total: nv, floor: u.floor, pos: u.pos, side: u.kind, kind: o.kind || 'heal' });
    return g;
  };

  // ======================================================================================
  // pest construction, placement, waves
  // ======================================================================================
  var SIZE_NAMES = { small: 1, medium: 2, large: 3, boss: 5 };
  P.mkPest = function (id, o) {
    o = o || {};
    var rid = id;
    var def = SB.content.pest(rid);
    if (!def) { U.warnOnce('nopest:' + id, 'unknown pest ' + id); return null; }
    var scale = (o.hpScale !== undefined ? o.hpScale : (this.enc.hpScale || 1)) * (this.enc.tutorial ? 1 : rv('pestHpMult', 1));
    var hp = def.hp;
    if (!def.isBoss) hp = Math.max(1, Math.round(hp * scale));
    else hp = Math.max(1, Math.round(hp * (this.enc.bossHpScale || 1) * rv('pestHpMult', 1)));
    if (o.mod && o.mod.hpMult) hp = Math.max(1, Math.round(hp * o.mod.hpMult));
    var E = ENG();
    var fx = {};
    var addFx = function (trig, list) {
      if (!list || !list.length) return;
      trig = E.normTrigger(trig);
      fx[trig] = (fx[trig] || []).concat(U.deepClone(list));
    };
    addFx('onDeath', def.onDeath);
    addFx('onHit', def.onHit);
    addFx('onSpawn', def.onSpawn);
    addFx('onKnocked', def.raw.onKnocked);
    (def.passives || []).forEach(function (ps) {
      if (ps && ps.on && ps.effects) addFx(ps.on, ps.effects.map(function (e) { var c = Object.assign({}, e); c.passiveId = ps.id; return c; }));
    });
    var traitSet = U.deepClone(def.traitSet);
    var unit = {
      kind: 'pest', uid: this.uid('p'), id: def.id, name: (o.mod && o.mod.name) || def.name, hp: hp, maxHp: hp, fluff: (o.mod && o.mod.fluff !== undefined ? o.mod.fluff : def.fluff) || 0,
      size: def.size, statuses: {}, intent: null, floor: 0, pos: 0, traits: def.traits.slice(), tags: def.tags.slice(), traitSet: traitSet, art: def.art, skin: o.mod && o.mod.skin,
      fx: fx, boss: !!def.isBoss, tier: def.tier, immune: (def.immune || []).slice(), passives: U.deepClone(def.passives || []), pat: { idx: 0, cd: null, phase: -1, round: 0 },
      act: null, spawnedRound: this.S.round, appearedRound: this.S.round, dead: false, removed: false, flags: {}, counters: {}, meter: {}, threat: def.threat,
      attackBuff: 0, tempBuff: 0, hitCap: def.hitCap || 0, untargetable: !!def.untargetable, hiddenIntent: !!def.hiddenIntent, knockedRound: -9, noClimbRound: -9,
      carriedFish: 0, source: o.source || null, nv: !!def.nightVisitor, nextAction: null, host: null
    };
    if (def.meters) unit.meter = U.deepClone(def.meters);
    if (unit.traitSet.heavy || unit.traitSet.anchored) { /* handled in knock */ }
    return unit;
  };

  P.pdef = function (p) { return SB.content.pest(p.id); };

  // Place a pest at a floor if it fits; otherwise it joins the Garden queue.
  P.placePest = function (unit, floor, at, o) {
    o = o || {};
    var S = this.S;
    floor = Math.max(0, Math.min(this.numFloors - 1, floor));
    var f = S.floors[floor];
    var cap = f.capacity.pestSize;
    if (this.pestSize(floor) + unit.size <= cap) {
      var p = at === 'front' ? 0 : f.pests.length;
      f.pests.splice(p, 0, unit);
      unit.floor = floor; unit.queued = false;
      this.reindex(floor);
      this.touch();
      this.emit('spawn', { uid: unit.uid, id: unit.id, name: unit.name, floor: floor, pos: unit.pos, from: o.from || 'wave', size: unit.size, hp: unit.hp });
      return true;
    }
    unit.queued = true; unit.gardenFloor = floor; unit.gardenAt = at || 'back';
    if (o.front) S.garden.unshift(unit); else S.garden.push(unit);
    this.touch();
    this.emit('spawn', { uid: unit.uid, id: unit.id, name: unit.name, floor: floor, from: 'garden', queued: true });
    return false;
  };

  P.spawnPest = function (id, floor, at, o) {
    o = o || {};
    var unit = this.mkPest(id, o);
    if (!unit) return null;
    if (o.yarn) this.addStatus(unit, 'yarn', o.yarn, { force: true });
    unit.source = o.source || null;
    var placed = this.placePest(unit, floor, at, o);
    if (placed || unit.queued) {
      ENG().ai.initPest(this, unit);
      if (placed) { this.fire('onSpawn', { subject: unit, floor: unit.floor }); }
    }
    return unit;
  };

  P.waveList = function () { return (this.enc.waves || []).slice().sort(function (a, b) { return a.round - b.round; }); };
  P.spawnWave = function (round, silent) {
    var self = this, S = this.S, any = false;
    (this.enc.waves || []).forEach(function (w, wi) {
      if (w.round !== round || S.spawnedWaves[wi]) return;
      S.spawnedWaves[wi] = true; any = true;
      (w.spawns || []).forEach(function (sp) {
        var n = sp.count || 1;
        for (var i = 0; i < n; i++) {
          var fl = (sp.floor || 1) - 1;
          var u = self.spawnPest(sp.id, fl, sp.at || 'back', { mod: sp.mod, hpScale: sp.hpScale, from: 'wave' });
          if (u && sp.ref) u.ref = sp.ref;
          if (u && sp.boss) u.boss = true;
          if (u && u.boss && !S.bossUid) S.bossUid = u.uid;
          if (u && sp.id === (self.enc.bossId || '__') && !S.bossUid) S.bossUid = u.uid;
        }
      });
    });
    if (any) this.emit('wave', { round: round });
    return any;
  };
  P.wavesPending = function () {
    var S = this.S, n = 0;
    (this.enc.waves || []).forEach(function (w, wi) { if (!S.spawnedWaves[wi]) n++; });
    return n;
  };
  P.retryGarden = function () {
    var S = this.S, keep = [], self = this;
    var q = S.garden.slice(); S.garden = [];
    q.forEach(function (u) {
      var f = S.floors[u.gardenFloor];
      if (self.pestSize(u.gardenFloor) + u.size <= f.capacity.pestSize) {
        u.queued = false;
        var at = u.gardenAt === 'front' ? 0 : f.pests.length;
        f.pests.splice(at, 0, u);
        u.floor = u.gardenFloor; self.reindex(u.floor);
        if (u.flapDizzy) { self.addStatus(u, 'dizzy', 1, { force: true }); u.flapDizzy = false; }
        self.touch();
        self.emit('spawn', { uid: u.uid, id: u.id, name: u.name, floor: u.floor, pos: u.pos, from: 'garden', size: u.size, hp: u.hp });
        ENG().ai.select(self, u);
        keep.push(u);
      } else S.garden.push(u);
    });
    return keep.length;
  };

  // Night Visitors: a wave of about 25 percent of a normal wave's threat
  P.spawnNightVisitors = function () {
    var S = this.S, self = this;
    var enc = this.enc;
    var rules = SB.data.encounterRules;
    var specs = null;
    // scripted visitors (tutorial fight 4: enc.nightVisitors [{afterRound, spawns:[{ref,id,floor,at}]}]) replace the random pack
    if (enc.nightVisitors && enc.nightVisitors.length) {
      var made = 0;
      enc.nightVisitors.forEach(function (nv) {
        if (nv.afterRound !== undefined && nv.afterRound !== S.round) return;
        (nv.spawns || []).forEach(function (sp) {
          var u = self.spawnPest(sp.id, (sp.floor || 1) - 1, sp.at || 'back', { from: 'visitor' });
          if (u) { if (sp.ref) u.ref = sp.ref; made++; }
        });
      });
      if (made) this.emit('witching', { phase: 'visitors', count: made, round: S.round });
      return made;
    }
    try {
      if (rules && rules.visitorPackFor) {
        var pack = rules.visitorPackFor(enc, S.clock.witchingCount || 1, this.rand.bind(this), 1);
        var r = pack && pack.spawns;
        if (r && r.length) specs = r;
      }
    } catch (err) { U.warnOnce('visitors:' + err.message, 'visitorPackFor failed: ' + err.message); }
    if (!specs) {
      var act = enc.act || this.run.act || 1;
      var ids = SB.content.nightVisitorIds(act);
      if (!ids.length) return 0;
      var wavesN = Math.max(1, (enc.waves || []).length);
      var budget = Math.max(1, Math.round((enc.threat || 12) / wavesN * rv('night_visitor_threat_pct', 25) / 100));
      specs = [];
      var guard = 0, spent = 0;
      while (spent < budget && guard++ < 6) {
        var id = this.pickOne(ids), d = SB.content.pest(id);
        if (!d) break;
        specs.push({ id: id, floor: 1, at: 'back' });
        spent += Math.max(1, d.threat || 1);
      }
    }
    var mult = enc.nightVisitorMult || 1;
    var count = 0;
    specs.forEach(function (sp) {
      var id = typeof sp === 'string' ? sp : sp.id;
      var n = (sp.count || 1);
      for (var i = 0; i < n; i++) { if (self.spawnPest(id, (sp.floor || 1) - 1, sp.at || 'back', { from: 'visitor' })) count++; }
    });
    if (count) this.emit('witching', { phase: 'visitors', count: count, round: S.round });
    return count;
  };

  // ======================================================================================
  // damage pipeline
  // ======================================================================================
  P.clawsOf = function (u) { return (u && u.statuses && u.statuses.claws) || 0; };

  // power of a pest attack before percent and Hiss (flat bonuses)
  P.pestBonus = function (p) {
    var S = this.S, b = 0, self = this;
    b += p.statuses.rage || 0;
    b += p.attackBuff || 0;
    b += p.tempBuff || 0;
    if (S.rules.impatience && S.round >= S.rules.impatienceRound) b += (S.round - S.rules.impatienceRound + 1) * rv('impatience_attack_per_round', 1) - (p.impatienceBase || 0) * 0;
    if (this.hasTrait(p, 'nocturnal') && S.clock.isWitching) b += rv('nocturnal_attack_bonus', 2);
    if (p.statuses.frazzled) b -= 2;
    (p.passives || []).forEach(function (ps) {
      var pd = ENG().passives.get(ps.id || ps.rule);
      if (pd && pd.attack) b += pd.attack(self, p, ps) || 0;
    });
    return b;
  };

  // The only function that changes Health. Returns HP actually lost.
  // o: { src: unit|null, kind: 'hit'|'shatter'|'direct'|'dot', melee, pierce, noFluff, noHiss, pct, pounce, zoom, hitNo, free }
  P.damage = function (tgt, base, o) {
    o = o || {};
    var S = this.S;
    if (!tgt || tgt.dead || tgt.removed) return 0;
    if (tgt.kind === 'sunbeam' || tgt.kind === 'player') return this.hitSunbeam(base, o);
    if (tgt.kind !== 'cat' && tgt.kind !== 'pest') return 0;
    if (tgt.kind === 'pest' && (tgt.untargetable || tgt.traitSet.untargetable) && !o.force) return 0;
    var kind = o.kind || 'hit', att = o.src && (o.src.kind === 'cat' || o.src.kind === 'pest') ? o.src : null;
    var amt = base, pct = 0, E = ENG();
    if (kind === 'hit') {
      if (att && att.kind === 'cat' && !o.noClaws) amt += this.clawsOf(att);
      if (tgt.kind === 'pest') {
        if (tgt.statuses.marked && !o.noMarked) pct += rv('marked_percent', 50);
        if (tgt.statuses.yarn && o.src) { var others = this.livePests().filter(function (q) { return q !== tgt && q.floor === tgt.floor && q.statuses.yarn; }).length; amt += others; }
      }
      if (att && att.kind === 'cat' && att.kw.ambush && !att.ambushUsed && !o.noAmbush) {
        var am = att.kw.ambush === true ? 2 : Math.max(2, att.kw.ambush);
        pct += 100 * (am - 1); att.ambushUsed = true;
      }
      if (att && att.kind === 'cat' && att.statuses.catnip >= 4) pct += 100;
      if (tgt.statuses.spooked) pct += 50;
      if (att && att.statuses && att.statuses.dull) pct -= 25;
      if (o.pct) pct += o.pct;
      if (pct) amt = Math.floor(amt * (100 + pct) / 100);
      if (amt < 0) amt = 0;
      if (tgt.kind === 'pest' && (tgt.traitSet.spectral || tgt.flags.spectral) && att && att.kind === 'cat' && !S.clock.isWitching && amt > 0) amt = Math.max(1, Math.floor(amt / 2));
      if (att && att.kind === 'pest' && !o.noHiss) amt = Math.max(0, amt - (att.statuses.hiss || 0));
      if (tgt.kind === 'cat' && att && att.kind === 'pest') {
        if (this.mod('atticCatDamageReduction', 0) && tgt.floor === 2) amt = Math.max(0, amt - this.mod('atticCatDamageReduction', 0));
        amt = Math.max(0, amt - (tgt.flags.damageReduction || 0));
      }
    } else if (kind === 'shatter') {
      if (tgt.kind === 'pest') {
        if (tgt.statuses.wet) amt = Math.floor(amt * (100 + rv('wet_pest_shatter_percent', 50)) / 100);
        if (tgt.traitSet.slippery && !o.noSlippery) amt = amt * rv('slippery_shatter_multiplier', 2);
        if (tgt.flags.noShatter) amt = 0;
      }
      this.stat('shatterDamage', amt);
    }
    if (tgt.kind === 'pest' && kind === 'hit' && amt > 0) {
      var pd = SB.content.pest(tgt.id), cut = 0;
      ((pd && pd.passives) || []).forEach(function (ps) {
        (ps.effects || []).forEach(function (ef) {
          if (ef.op !== 'reduceIncoming') return;
          var n = S.floors[tgt.floor].pests.filter(function (q) { return q !== tgt && !q.dead; }).length;
          cut += Math.min(ef.maxPct || 100, (ef.pctPer || 0) * n);
        });
      });
      if (cut) amt = Math.floor(amt * (100 - Math.min(100, cut)) / 100);
    }
    if (tgt.kind === 'pest' && tgt.hitCap && amt > tgt.hitCap && kind === 'hit') amt = tgt.hitCap;
    if (tgt.flags && tgt.flags.preventNext && amt > 0) { tgt.flags.preventNext--; this.emit('damage', { uid: tgt.uid, amount: 0, prevented: true, floor: tgt.floor, pos: tgt.pos, side: tgt.kind }); return 0; }
    if (tgt.kind === 'cat' && amt > 0 && o.src && tgt.flags.reduceIncoming) amt = Math.max(0, amt - tgt.flags.reduceIncoming);
    // laser_zone hazard (Red Dot): Frazzled cats on a lit floor take 2 extra from hits and direct damage
    if (tgt.kind === 'cat' && amt > 0 && (kind === 'hit' || kind === 'direct') && tgt.statuses.frazzled && this.hasHazard(tgt.floor, 'laser_zone')) amt += rv('laser_zone_frazzled_extra', 2);
    var absorbed = 0;
    if (kind === 'hit' && !o.pierce && !o.noFluff && tgt.fluff > 0 && amt > 0) {
      absorbed = Math.min(tgt.fluff, amt); tgt.fluff -= absorbed; amt -= absorbed;
    }
    var hp = this.getHp(tgt), loss = Math.min(Math.max(0, amt), hp);
    // survive effects for cats
    if (tgt.kind === 'cat' && loss >= hp && loss > 0) {
      if (tgt.flags.survive1 && !tgt.counters.survived) { tgt.counters.survived = 1; loss = hp - 1; this.toast(tgt.name + ' hangs on'); }
      else if (tgt.flags.cheatDeathOnce && !tgt.counters.cheated) { tgt.counters.cheated = 1; loss = hp - 1; this.toast(tgt.name + ' cheats death'); }
    }
    this.setHp(tgt, hp - loss);
    if (loss > 0 || absorbed > 0) this.touch();
    var lethal = hp - loss <= 0;
    this.emit('damage', { uid: tgt.uid, side: tgt.kind, from: att ? att.uid : (o.srcId || null), amount: loss, absorbed: absorbed, dmgKind: kind, floor: tgt.floor, pos: tgt.pos, lethal: lethal,
      hp: hp - loss, fluff: tgt.fluff, pounce: !!o.pounce, zoom: !!o.zoom, hit: o.hitNo || 0, melee: !!o.melee });
    if (att && att.kind === 'cat') { this.stat('damageDealt', loss); this.statMax('biggestHit', loss + absorbed); }
    if (tgt.kind === 'cat') {
      if (loss > 0 || absorbed > 0) {
        if (tgt.hidden || tgt.statuses.hidden) { this.removeStatus(tgt, 'hidden'); }
        if (tgt.boxed && !tgt.revealed) { tgt.revealed = true; this.emit('box', { uid: tgt.uid, box: tgt.boxed, floor: tgt.floor, action: 'reveal' }); }
      }
      if (loss > 0 && tgt.napping && !o.noWake) this.rudeAwakening(tgt);
      if (tgt.kw.ragebait && (loss > 0 || absorbed > 0) && o.src && o.src.kind === 'pest') this.addStatus(tgt, 'claws', typeof tgt.kw.ragebait === 'number' ? tgt.kw.ragebait : 1);
      if (att && att.kind === 'pest') this.stat('damageTaken', loss);
    } else {
      if (att && att.kind === 'cat') { tgt.lastHitBy = att.uid; }
      if (o.src) tgt.lastSrc = o.src.uid;
    }
    // bristle returns damage to melee attackers
    if (o.melee && loss > 0 && tgt.statuses.bristle && att && !att.dead && !att.removed && !o.noBristle) {
      this.damage(att, tgt.statuses.bristle, { kind: 'direct', src: tgt, noBristle: true, noWake: false });
    }
    if (tgt.kind === 'pest' && tgt.passives.length) {
      var self = this;
      tgt.passives.forEach(function (ps) { var pd = E.passives.get(ps.id || ps.rule); if (pd && pd.onDamaged) pd.onDamaged(self, tgt, ps, { amount: loss, absorbed: absorbed, src: o.src, kind: kind }); });
    }
    if (loss > 0 || absorbed > 0) {
      this.fire('onDamaged', { subject: tgt, amount: loss, absorbed: absorbed, src: o.src || null, floor: tgt.floor, dmgKind: kind, target: att });
      if (tgt.kind === 'pest') {
        if (att && att.kind === 'cat') this.fire('onHit', { subject: tgt, target: att, amount: loss, floor: tgt.floor });
        this.fire('onHitBy', { subject: tgt, target: att, amount: loss, floor: tgt.floor });
      }
    }
    if (tgt.kind === 'pest' && tgt.boss && hp - loss > 0 && (loss > 0)) { var selfB = this; this.queue(function () { E.ai.checkPhase(selfB, tgt); }); }
    if (hp - loss <= 0) {
      tgt.dead = true;
      tgt.killer = att && att.kind === 'cat' ? att.uid : null;
      tgt.killedByKind = kind; tgt.killedPounce = !!o.pounce; tgt.killedBy = att ? att.id : (o.srcId || null);
      tgt.killedByPest = att && att.kind === 'pest' ? att.id : null;
    }
    return loss;
  };

  P.hitSunbeam = function (base, o) {
    o = o || {};
    var sb = this.S.sunbeam, amt = Math.max(0, base);
    amt = Math.ceil(amt * rv('sunbeamHitMult', 1));
    var att = o.src && o.src.kind === 'pest' ? o.src : null;
    if (att && !o.noHiss) amt = Math.max(0, amt - (att.statuses.hiss || 0));
    var absorbed = Math.min(sb.shade, amt); sb.shade -= absorbed; amt -= absorbed;
    var loss = Math.min(amt, Math.max(0, sb.warmth));
    sb.warmth -= loss; this.touch();
    this.stat('warmthLost', loss);
    this.emit('sunbeamHit', { amount: loss, absorbed: absorbed, from: att ? att.uid : null, warmth: sb.warmth, shade: sb.shade, floor: att ? att.floor : 2 });
    this.fire('onSunbeamHit', { subject: att, amount: loss, floor: 2 });
    if (att && this.mod('sunbeamThorns', 0)) this.damage(att, this.mod('sunbeamThorns', 0), { kind: 'direct' });
    if (sb.warmth <= 0) { this.S.killedBy = att ? att.id : (o.srcId || null); }
    return loss;
  };

  P.rudeAwakening = function (cat) {
    if (!cat.napping) return;
    if (cat.flags.noRude || this.isDoNotDisturb(cat)) return;
    var rested = cat.statuses.rested || 0;
    cat.napping = false; cat.rudeRound = this.S.round; cat.wokeRound = this.S.round;
    this.removeStatus(cat, 'rested');
    this.stat('rudeAwakenings');
    this.touch();
    this.emit('wake', { uid: cat.uid, floor: cat.floor, pos: cat.pos, rude: true, rested: rested });
    this.fire('onWake', { subject: cat, floor: cat.floor, rude: true });
  };
  P.isDoNotDisturb = function (cat) {
    var fl = this.S.floors[cat.floor], self = this;
    var protectedByRoom = fl.rooms.some(function (r) { return r.flags && r.flags.noRude; }) || fl.rooms.some(function (r) { return r.noRude; });
    if (protectedByRoom) return true;
    if (this.mod('doNotDisturb', 0) && !this.S.counters.dnd) { this.S.counters.dnd = 1; return true; }
    return false;
  };

  // ======================================================================================
  // death, lives, removal
  // ======================================================================================
  P.removeUnit = function (u) {
    var S = this.S, f = S.floors[u.floor];
    if (!f) return;
    var list = u.kind === 'cat' ? f.cats : (u.kind === 'pest' ? f.pests : f.rooms);
    var i = list.indexOf(u);
    if (i < 0) return;
    list.splice(i, 1);
    u.removed = true;
    if (u.kind === 'cat' && u.boxed) { var b = this.roomByUid(u.boxed); if (b) { var j = b.occupants.indexOf(u.uid); if (j >= 0) b.occupants.splice(j, 1); } }
    this.reindex(u.floor);
    this.touch();
  };

  P.fireOwn = function (u, trig, data) {
    var list = u.fx && u.fx[trig];
    if (!list || !list.length) return;
    var self = this;
    data = data || {};
    this.queue(function () {
      var ctx = self.makeCtx({ src: { kind: u.kind, unit: u }, self: u, subject: data.subject || u, target: data.target || null, floorOverride: u.floor, trigger: trig, data: data, killer: data.killer || null, lk: u.kind + ':' + u.uid + ':' + trig });
      self.runEffects(list, ctx);
    });
  };

  P.reap = function () {
    if (this._reaping) return;
    this._reaping = true;
    var guard = 0;
    try {
      while (guard++ < 60) {
        var dc = [], dp = [], S = this.S;
        S.floors.forEach(function (f) {
          f.cats.forEach(function (c) { if (c.dead && !c.removed) dc.push(c); });
          f.pests.forEach(function (p) { if (p.dead && !p.removed) dp.push(p); });
        });
        if (!dc.length && !dp.length) break;
        var self = this;
        dc.forEach(function (c) { self.removeUnit(c); self.emit('death', { uid: c.uid, side: 'cat', id: c.id, name: c.name, floor: c.floor, pos: c.pos, killedBy: c.killedByPest || c.killedBy || null }); });
        dp.forEach(function (p) { self.removeUnit(p); self.emit('death', { uid: p.uid, side: 'pest', id: p.id, name: p.name, floor: p.floor, pos: p.pos, killer: p.killer || null }); });
        dp.forEach(function (p) { self.pestDown(p); });
        dc.forEach(function (c) { self.catDown(c); });
      }
    } finally { this._reaping = false; }
    this.checkEnd();
  };

  P.pestDown = function (p) {
    var S = this.S;
    if (p.banished || p.silent) { this.emit('pestDown', { uid: p.uid, id: p.id, floor: p.floor, silent: true }); return; }
    this.stat('pestsDefeated'); S.kills++; S.killsRound++;
    var killer = p.killer ? this.catByUid(p.killer) : null;
    this.fireOwn(p, 'onDeath', { subject: p, killer: killer });
    if (p.fx && p.fx['onDeathEffects']) this.fireOwn(p, 'onDeathEffects', { subject: p });
    // attached parasites let go
    var self = this;
    (S.attached || []).slice().forEach(function (a) { if (a.hostPest === p.uid) self.detachParasite(a, 'host dead'); });
    if (killer && !killer.removed) {
      this.fire('onKill', { subject: killer, target: p, floor: killer.floor, killedFloor: p.floor });
      if (p.killedPounce) this.fire('onPounceKill', { subject: killer, target: p, floor: killer.floor });
      if (this.isCornered(killer)) this.stat('cornerKills');
      if (p.statuses.marked) {
        this.addStatus(killer, 'claws', 1);
        if (S.counters.markedRefundRound !== S.round) { S.counters.markedRefundRound = S.round; this.addZoomies(1); }
        this.fire('onMarkedKill', { subject: killer, target: p });
      }
    }
    this.fire('onAnyPestDeath', { subject: p, floor: p.floor, killer: killer });
    this.fire('onAnyDeath', { subject: p, floor: p.floor, killer: killer });
    if (this.hasTrait(p, 'dog')) this.fire('onAnyDogDeath', { subject: p, floor: p.floor, killer: killer });
    if (p.id === 'pest_hornet') this.fire('onHornetDeath', { subject: p });
    if (p.carriedFish) { /* returnCarriedFish handled by op */ }
    this.emit('pestDown', { uid: p.uid, id: p.id, floor: p.floor, boss: p.boss });
  };

  P.addZoomies = function (n, o) {
    var S = this.S;
    var before = S.zoomies;
    S.zoomies = Math.max(0, Math.min(rv('zoomies_cap', 10), S.zoomies + n));
    if (S.zoomies !== before) this.statMax('maxZoomiesInTurn', S.zoomies);
    return S.zoomies - before;
  };

  // Spend N lives of a cat (damage death or effect). Returns false if refused.
  P.spendLife = function (cat, n, o) {
    o = o || {};
    n = n || 1;
    var inst = cat.instUid ? this.instByUid(cat.instUid) : null;
    if (!inst) {
      // token: dies
      if (!o.voluntary) { cat.dead = true; this.reap(); }
      return !o.voluntary;
    }
    if (o.voluntary && cat.lives <= n) return false;
    var self = this;
    // "When this loses a Life" (Dusk Mouser, Hollow Tabby) is a loss, not a voluntary Spend; spends still reach the Any triggers below
    if (!o.voluntary) this.fire('onLifeLost', { subject: cat, floor: cat.floor, amount: n, voluntary: false });
    this.fire('onAnyLifeLost', { subject: cat, floor: cat.floor, amount: n });
    this.fire('onAnyLifeSpent', { subject: cat, floor: cat.floor, amount: n });
    cat.lives = Math.max(0, cat.lives - n);
    inst.lives = cat.lives;
    this.S.lastSpent = n;
    this.S.livesSpentFight = (this.S.livesSpentFight || 0) + n;
    this.stat('livesSpent', n);
    this.touch();
    this.emit('lifeSpent', { uid: cat.uid, id: cat.id, floor: cat.floor, pos: cat.pos, lives: cat.lives, amount: n, voluntary: !!o.voluntary });
    if (this.isCornered(cat) && cat.lives + n > this.corneredAt()) this.fire('onAnyCornered', { subject: cat, floor: cat.floor });
    return true;
  };

  // A cat has been removed from the board with 0 HP (or killed). Settle lives and the card.
  P.catDown = function (c) {
    var S = this.S, self = this;
    var inst = c.instUid ? this.instByUid(c.instUid) : null;
    var floor = c.floor;
    this.fireOwn(c, 'onDeath', { subject: c });
    if (!inst) { this.fire('onAllyDeath', { subject: c, floor: floor }); return; }
    var cost = (c.killedByPest && this.pestCostly(c.killedByPest)) ? rv('lives_costly_loss', 2) : 1;
    this.spendLifeFor(c, inst, cost);
    this.fire('onAllyDeath', { subject: c, floor: floor });
  };
  P.pestCostly = function (id) { var d = SB.content.pest(id); return !!(d && d.traitSet && d.traitSet.costly); };
  P.spendLifeFor = function (c, inst, cost) {
    var S = this.S;
    S.preventLife = false;
    this.fireNow('onAnyLifeWouldBeLost', { subject: c, floor: c.floor });
    if (S.preventLife) {
      S.preventLife = false;
      this.toast(c.name + ' keeps its Life');
      this.toDiscard(c.cardUid);
      return;
    }
    this.fireOwn(c, 'onLifeLost', { subject: c });
    this.fire('onAnyLifeLost', { subject: c, floor: c.floor, amount: cost });
    this.fire('onAnyLifeSpent', { subject: c, floor: c.floor, amount: cost });
    inst.lives = Math.max(0, inst.lives - cost);
    c.lives = inst.lives;
    S.livesSpentFight = (S.livesSpentFight || 0) + cost;
    S.lastSpent = cost;
    this.stat('livesSpent', cost);
    this.emit('lifeSpent', { uid: c.uid, id: c.id, floor: c.floor, pos: c.pos, lives: inst.lives, amount: cost, lethal: true });
    var eff = S.cards[c.cardUid] ? S.cards[c.cardUid].eff : null;
    var exhaustKw = eff && eff.keywords && eff.keywords.exhaust;
    if (inst.lives >= 1) {
      this.recomputeCard(c.cardUid);
      if (exhaustKw) this.toExhaust(c.cardUid);
      else if (eff && eff.keywords && eff.keywords.reborn && S.hand.length < this.handLimit()) {
        var halfClaws = Math.floor((c.statuses.claws || 0) / 2);
        if (halfClaws > 0) { S.rebornClaws = S.rebornClaws || {}; S.rebornClaws[c.cardUid] = halfClaws; }
        S.hand.push({ uid: c.cardUid, card: null }); this.emit('draw', { uid: c.cardUid, id: c.id, reborn: true });
        this.fire('onReborn', { subject: c, floor: c.floor });
      } else this.toDiscard(c.cardUid);
    } else {
      S.lost.push({ uid: inst.uid, id: inst.id, champion: c.champion });
      this.stat('catsLostForGood');
      this.toExhaust(c.cardUid);
      this.fire('onFinalDeath', { subject: c, floor: c.floor });
      this.emit('toast', { text: c.name + ' has used its last life' });
    }
  };

  // ======================================================================================
  // target helpers
  // ======================================================================================
  P.targetablePests = function (fi) {
    return this.S.floors[fi].pests.filter(function (p) { return !p.dead && !p.removed && !p.untargetable && !p.traitSet.untargetable; });
  };
  P.frontPest = function (fi) { var l = this.targetablePests(fi); return l.length ? l[0] : null; };
  P.visibleCats = function (fi) {
    return this.S.floors[fi].cats.filter(function (c) { return !c.dead && !c.removed; });
  };
  // cats that count as blockers for the Hold rule and the Sunbeam (Hidden cats do not count)
  P.blockers = function (fi) {
    return this.S.floors[fi].cats.filter(function (c) { return !c.dead && !c.removed && !c.hidden; });
  };

  // ======================================================================================
  // cat attacks
  // ======================================================================================
  P.emitAttack = function (att, tgt, kind, extra) {
    this.emit('attack', Object.assign({ uid: att.uid, side: att.kind, floor: att.floor, pos: att.pos, to: tgt ? tgt.uid : null, toFloor: tgt ? tgt.floor : null, toPos: tgt ? tgt.pos : null, kind: kind || 'melee' }, extra || {}));
  };
  P.revealAttacker = function (cat) {
    if (cat.statuses.hidden) this.removeStatus(cat, 'hidden');
    if (cat.boxed && !cat.revealed) {
      this.stat('attacksFromBoxes');
      if (cat.fx.onUnbox && cat.fx.onUnbox.length) { this.unseatCat(cat, 'attack'); }  // unseatCat fires onUnbox once (self scope reaches the cat)
      else { cat.revealed = true; this.emit('box', { uid: cat.uid, box: cat.boxed, floor: cat.floor, action: 'reveal' }); }
    }
    this.touch();
  };

  // one hit of a cat on a pest. Returns HP lost.
  P.catHit = function (cat, pest, power, o) {
    o = o || {};
    this.emitAttack(cat, pest, o.kind || 'melee', { hit: o.hitNo || 0 });
    var lost = this.damage(pest, power, { src: cat, kind: 'hit', melee: o.melee !== false && !o.ranged, pounce: o.pounce, zoom: o.zoom, hitNo: o.hitNo, noAmbush: o.noAmbush, noClaws: o.noClaws });
    this.reap();
    return lost;
  };

  // The normal attack of a cat in the Cat Attacks phase. Returns true if it attacked.
  P.catAttack = function (cat) {
    var S = this.S;
    if (cat.dead || cat.removed || cat.napping || cat.statuses.scared) return false;
    var pw = this.atk(cat);
    if (pw <= 0 && !cat.statuses.claws) return false;
    var hits = 1 + (cat.statuses.frenzy || 0) + (typeof cat.kw.multistrike === 'number' ? cat.kw.multistrike - 1 : 0);
    var fl = cat.floor;
    if (!this.frontPest(fl)) return false;
    this.revealAttacker(cat);
    this.fire('onAttack', { subject: cat, floor: fl });
    this.fire('onCatAttack', { subject: cat, floor: fl });
    this.drain();
    pw = this.atk(cat);
    var frenzy = cat.statuses.frenzy || 0;
    for (var h = 0; h < hits; h++) {
      if (cat.dead || cat.removed) break;
      var tl = this.targetablePests(fl);
      if (!tl.length) break;
      var tgt;
      if (frenzy > 0 && h > 0) tgt = tl.length > 1 ? this.pickOne(tl) : tl[0];
      else if (frenzy > 0 && h === 0) tgt = tl[0];
      else tgt = tl[0];
      var dizzyMis = this.dizzyMisdirect(cat, tgt, tl);
      if (dizzyMis) tgt = dizzyMis;
      if (h > 0 && frenzy > 0 && !this.mod('frenzyNoSelfDamage', 0) && !cat.flags.frenzyNoSelfDamage) {
        this.damage(cat, rv('frenzy_self_damage_per_extra_hit', 1), { kind: 'direct', srcId: 'frenzy', noWake: true });
        this.reap();
        if (cat.dead || cat.removed) break;
      }
      this.catHit(cat, tgt, pw, { hitNo: h + 1 });
    }
    this.drain();
    return true;
  };
  P.dizzyMisdirect = function (att, tgt, list) {
    var d = att.statuses && att.statuses.dizzy;
    if (!d) return null;
    var pctv = Math.min(rv('dizzy_misdirect_percent_cap', 75), d * rv('dizzy_misdirect_percent_per_stack', 25));
    if (this.rng.int(100) < pctv) {
      var others = list.filter(function (q) { return q !== tgt; });
      if (others.length) return this.pickOne(others);
    }
    return null;
  };

  // Pounce: on deploy attack once at the front pest of the floor for Power + N.
  P.pounceAttack = function (cat, n, o) {
    o = o || {};
    if (cat.dead || cat.removed) return false;
    var fl = o.floor !== undefined ? o.floor : cat.floor;
    var tgt = o.target || this.frontPest(fl);
    if (!tgt) return false;
    this.revealAttacker(cat);
    this.fire('onPounce', { subject: cat, floor: cat.floor });
    var pw = this.atk(cat) + n;
    this.catHit(cat, tgt, pw, { kind: 'pounce', pounce: true });
    this.fire('onCatAttack', { subject: cat, floor: cat.floor });
    this.drain();
    return true;
  };

  // Zoom: free half-damage (round up) hit on a random pest on any floor
  P.zoomAttack = function (cat) {
    var all = this.livePests().filter(function (p) { return !p.untargetable && !p.traitSet.untargetable && !p.removed; });
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

  // ======================================================================================
  // Nap and Stretch
  // ======================================================================================
  P.canNap = function (cat, forced) {
    if (cat.dead || cat.removed) return { ok: false, reason: 'gone' };
    if (cat.napping) return { ok: false, reason: 'already asleep' };
    if (!forced) {
      if (cat.playedRound === this.S.round && !cat.flags.napOnDeploy && !this.mod('napOnPlay', 0)) return { ok: false, reason: 'Cannot nap the turn it is played' };
      if (cat.wokeRound === this.S.round) return { ok: false, reason: 'Just woke up' };
      if (cat.statuses.scared) return { ok: false, reason: 'Too scared to sleep' };
    }
    return { ok: true };
  };
  P.napCat = function (cat, o) {
    o = o || {};
    var ok = this.canNap(cat, o.forced);
    if (!ok.ok) return false;
    cat.napping = true; cat.napRound = this.S.round;
    this.S.napsThisTurn++;
    this.stat('napsTaken');
    this.touch();
    this.emit('nap', { uid: cat.uid, floor: cat.floor, pos: cat.pos, forced: !!o.forced });
    this.fire('onNap', { subject: cat, floor: cat.floor });
    return true;
  };
  P.wakeCat = function (cat, o) {
    o = o || {};
    if (!cat.napping || cat.dead || cat.removed) return false;
    if (this.S.rules.preventWake && !o.force) return false;
    if (cat.flags.preventWake) return false;
    var rested = cat.statuses.rested || 0;
    cat.napping = false; cat.wokeRound = this.S.round;
    this.touch();
    this.emit('wake', { uid: cat.uid, floor: cat.floor, pos: cat.pos, rested: rested, stretch: rested > 0 });
    // Stretch attack
    var bonus = Math.min(rv('stretch_damage_cap', 18), rested * rv('stretch_damage_per_rested', 3));
    if (!o.noStretch) {
      var tgt = this.frontPest(cat.floor);
      if (tgt) {
        this.revealAttacker(cat);
        this.stat('stretchAttacks'); this.statMax('biggestStretch', this.atk(cat) + bonus);
        this.emit('zoom', { uid: cat.uid, floor: cat.floor, pos: cat.pos, to: tgt.uid, toFloor: tgt.floor, toPos: tgt.pos, stretch: true });
        this.catHit(cat, tgt, this.atk(cat) + bonus, { kind: 'stretch' });
      }
    }
    if (rested > 0) {
      this.removeStatus(cat, 'rested');
      var gain = Math.floor(rested / rv('wake_attack_stacks_per_point', 2));
      if (gain > 0) { cat.buffs.power += gain; this.touch(); }
    }
    this.fire('onWake', { subject: cat, floor: cat.floor, rested: rested });
    this.drain();
    return true;
  };

  // ======================================================================================
  // Knock It Off
  // ======================================================================================
  P.knockPest = function (p, n, o) {
    o = o || {};
    var S = this.S;
    if (!p || p.dead || p.removed || p.queued) return false;
    n = Math.max(1, n || 1);
    if (p.traitSet.anchored || p.flags.anchored) { this.toast(p.name + ' will not budge'); this.emit('knock', { uid: p.uid, from: p.floor, to: p.floor, failed: true, floors: 0 }); return false; }
    if (p.statuses.leashed && this.livePests().some(function (q) { return q.id === 'pest_dog_walker'; }) && !o.ignoreLeash) { this.toast('Leashed'); return false; }
    var grip = p.knockedRound === S.round && !(o.ignoreGrip || (o.src && o.src.flags && o.src.flags.ignoreGrip));
    if (grip) {
      var sh = n * rv('knock_grip_shatter_per_floor', 1);
      this.emit('knock', { uid: p.uid, from: p.floor, to: p.floor, failed: true, floors: 0, grip: true });
      this.damage(p, sh, { kind: 'shatter', srcId: 'knock', src: o.src || null });
      this.reap();
      return false;
    }
    var move = n;
    if (p.traitSet.light || p.statuses.wet) move += rv('knock_light_extra_floors', 1);
    if (p.traitSet.heavy) move -= rv('knock_heavy_fewer_floors', 1);
    var from = p.floor;
    var shatterPer = rv('knock_shatter_per_floor', 2) + (o.shatterBonus || 0) + this.knockShatterBonus(p, o);
    p.knockedRound = S.round; p.noClimbRound = S.round;
    this.stat('knocksDone');
    if (move <= 0) {
      // heavy: does not move but still takes shatter for one floor
      this.emit('knock', { uid: p.uid, from: from, to: from, floors: 0, heavy: true });
      this.damage(p, shatterPer, { kind: 'shatter', src: o.src || null, srcId: 'knock' });
      this.fire('onKnock', { subject: o.src || p, target: p, floor: from });
      this.reap();
      return true;
    }
    var dest = from - move;
    this.fire('onKnock', { subject: o.src || null, target: p, floor: from });
    if (dest < 0) {
      // out the cat flap
      var fell = from + 1;
      var dmg = rv('knock_shatter_cellar', 3) + Math.max(0, fell - 1) * shatterPer;
      this.emit('knock', { uid: p.uid, from: from, to: -1, flap: true, floors: fell });
      this.damage(p, dmg, { kind: 'shatter', src: o.src || null, srcId: 'knock' });
      this.stat('pestsKnockedOutCellar');
      this.reap();
      if (!p.dead) {
        this.removeUnit(p);
        p.removed = false; p.queued = true; p.gardenFloor = 0; p.gardenAt = 'back'; p.flapDizzy = true;
        S.garden.unshift(p);
        this.touch();
        this.emit('flap', { uid: p.uid, id: p.id, from: from });
        this.fire('onAnyFlapExit', { subject: p, floor: from });
        this.fireOwn(p, 'onKnocked', { subject: p });
      }
      this.drain();
      return true;
    }
    var fd = S.floors[dest];
    if (this.pestSize(dest) + p.size > fd.capacity.pestSize) {
      this.toast('No room below for ' + p.name);
      this.emit('knock', { uid: p.uid, from: from, to: from, failed: true, floors: 0, full: true });
      p.knockedRound = -9; p.noClimbRound = -9;
      return false;
    }
    this.removeUnit(p);
    p.removed = false;
    fd.pests.push(p);
    p.floor = dest;
    this.reindex(from); this.reindex(dest);
    this.touch();
    this.emit('knock', { uid: p.uid, from: from, to: dest, floors: move, pos: p.pos });
    this.emit('move', { uid: p.uid, side: 'pest', from: from, to: dest, kind: 'knock' });
    var dmgFell = shatterPer * move;
    // other pests on the landing floor take shatter too
    var others = fd.pests.filter(function (q) { return q !== p && !q.dead; });
    this.damage(p, dmgFell, { kind: 'shatter', src: o.src || null, srcId: 'knock' });
    var self = this;
    others.forEach(function (q) { self.damage(q, rv('knock_shatter_landing_others', 2), { kind: 'shatter', src: o.src || null, srcId: 'knock' }); });
    if (!p.dead && !p.traitSet.slippery && !o.noDizzy) this.addStatus(p, 'dizzy', rv('knock_landing_dizzy', 1), { src: 'knock' });
    this.fire('onKnockLand', { subject: p, floor: dest, from: from });
    this.fire('onAnyEnemyLanded', { subject: p, floor: dest });
    this.fire('onShatter', { subject: p, floor: dest, amount: dmgFell });
    this.fireOwn(p, 'onKnocked', { subject: p });
    this.reap();
    this.drain();
    return true;
  };
  P.knockShatterBonus = function (p, o) {
    var b = 0, self = this;
    this.cats().forEach(function (c) { if (c.mods && c.mods.knockShatter) b += c.mods.knockShatter; });
    return b + this.mod('knockShatter', 0);
  };

  // ======================================================================================
  // Nip meter, Surge and Crash
  // ======================================================================================
  P.addNip = function (n) {
    var S = this.S, nip = S.nip;
    if (n <= 0) return 0;
    if (nip.surge > 0 || nip.crash > 0) return 0;
    var cap = rv('nip_max', 10) + this.mod('surgeAt', 0);
    nip.meter = Math.min(cap + rv('nip_excess_cap', 5), nip.meter + n);
    this.emit('nip', { meter: nip.meter, max: cap, amount: n });
    if (nip.meter >= cap) this.startSurge(nip.meter - cap);
    return n;
  };
  P.startSurge = function (excess) {
    var S = this.S, nip = S.nip;
    nip.excess = Math.min(rv('nip_excess_cap', 5), excess || 0);
    nip.meter = 0; nip.surge = 2; nip.surgeNext = 1;
    var z = rv('surge_zoomies_now', 2) + this.mod('surgeZoomies', 0);
    S.zoomies = Math.min(rv('surge_zoomies_turn_cap', 10), S.zoomies + z);
    this.stat('nipSurges');
    this.touch();
    this.emit('surge', { excess: nip.excess, zoomies: S.zoomies });
    this.fire('onSurgeStart', { subject: null });
    this.fire('onSurge', { subject: null });
  };
  P.startCrash = function () {
    var S = this.S, nip = S.nip;
    nip.crash = 1 + Math.floor((nip.excess || 0) / rv('crash_excess_divisor', 3)) + this.mod('crashTurns', 0);
    nip.crashFresh = true; nip.excess = 0;
  };
  P.endCrash = function () {
    var nip = this.S.nip;
    if (nip.crash > 0) { nip.crash = 0; nip.crashFresh = false; this.emit('crash', { ended: true }); }
  };

  // ======================================================================================
  // Witching Hour helper
  // ======================================================================================
  P.witchingEvery = function () { return this.mod('witchingEvery', 0) || rv('witching_interval', 3); };
  P.scheduleClock = function () {
    var S = this.S, c = S.clock, every = this.witchingEvery();
    var forced = c.forceNext;
    var isW = !!(S.rules.nightClock && ((S.round % every === 0 && c.last !== S.round - 1) || forced));
    if (forced && S.rules.nightClock) c.forceNext = false;
    c.round = S.round; c.isWitching = isW;
    if (isW) { c.last = S.round; c.witchingCount = (c.witchingCount || 0) + 1; }
    var nxt = S.round + 1;
    while (nxt % every !== 0 || nxt - 1 === c.last) nxt++;
    c.nextWitching = S.rules.nightClock ? nxt : 0;
    c.announce = S.rules.nightClock && c.nextWitching === S.round + 1;
  };

  // ======================================================================================
  // round flow
  // ======================================================================================
  P.beginRound = function () {
    var S = this.S, self = this;
    S.round++; S.stats.rounds = S.round;
    S.killsRound = 0; S.cardsPlayedThisTurn = 0; S.playedThisTurn = []; S.napsThisTurn = 0; S.zoomiesPenalty = 0;
    S.turn = 'resolving'; S.phase = 'draw';
    this.scheduleClock();
    var w = S.clock.isWitching;
    this.emit('phase', { phase: 'draw', round: S.round });
    // pending Frazzle from last Witching Hour
    (S.pendingFrazzle || []).forEach(function (uid) { var c = self.catByUid(uid); if (c && !c.napping && !c.boxed) self.addStatus(c, 'frazzled', 1, { force: true }); });
    S.pendingFrazzle = [];
    // start of turn statuses
    this.cats().forEach(function (c) {
      c.tbuff.power = 0;
      if (w && c.statuses.frenzy) { c.statuses.frenzy = Math.min(rv('frenzy_max', 5), c.statuses.frenzy * 2); }
      var cat = c;
      cat.ambushTurn = 0;
    });
    // Crash
    var nip = S.nip;
    var crashing = nip.crash > 0;
    if (crashing) {
      this.stat('nipCrashes');
      this.emit('crash', { turns: nip.crash, fresh: !!nip.crashFresh });
      if (nip.crashFresh) {
        nip.crashFresh = false;
        this.cats().forEach(function (c) { if (!c.napping && !c.boxed) { if (self.napCat(c, { forced: true })) self.addStatus(c, 'rested', 1); } });
        this.fire('onCrashStart', { subject: null });
      }
    }
    // Zoomies
    var z = rv('zoomies_per_turn', 3) + this.mod('baseZoomies', 0);
    if (w) { z += rv('witching_zoomies_bonus', 2) + this.mod('witchingZoomies', 0); }
    if (nip.surgeNext > 0) { z += rv('surge_zoomies_next_turn', 2) + this.mod('surgeZoomies', 0); nip.surgeNext = 0; }
    if (crashing) z -= this.mod('crashZoomiesPenalty', 0) || rv('crash_zoomies_penalty', 1);
    z += (S.zoomiesNext || 0); S.zoomiesNext = 0;
    S.zoomies = U.clamp(z, 0, rv('zoomies_cap', 10));
    this.statMax('maxZoomiesInTurn', S.zoomies);
    var draws = rv('draw_per_turn', 5) + this.mod('drawPerTurn', 0) + (w ? rv('witching_draw_bonus', 1) : 0) - (crashing ? (this.mod('crashDrawPenalty', 0) || rv('crash_draw_penalty', 1)) : 0) + (S.extraDrawNext || 0);
    S.extraDrawNext = 0;
    if (w) {
      this.emit('witching', { phase: 'start', round: S.round, zoomies: S.zoomies });
      this.fire('onWitchingHour', { subject: null });  // onWitching and onNightPhase hooks and card keys normalise to this name
    }
    this.fire('onTurnStart', { subject: null });
    this.drain();
    if (S.over) return;
    var script = this.scriptedHand(S.round);
    if (script) { draws = this.stackScriptedHand(script); }
    this.drawCards(Math.max(0, draws));
    this.drain();
    if (S.over) return;
    S.phase = 'play'; S.turn = 'player';
    this.updateIntents();
    this.refresh();
    this.emit('phase', { phase: 'play', round: S.round });
    // free pre-play automation: nothing
  };

  // Scripted hands (tutorial fights and tests): opts.hands[round-1] or enc.rounds[n].hand, a list of card ids
  P.scriptedHand = function (round) {
    var o = this.opts || {};
    if (o.hands && o.hands[round - 1]) return o.hands[round - 1];
    var r = this.enc && this.enc.scripted && (this.enc.rounds || []).filter(function (x) { return x.n === round; })[0];
    return r && r.hand ? r.hand : null;
  };
  P.stackScriptedHand = function (ids) {
    var S = this.S, first = [], self = this, pool = S.draw.concat(S.discard);
    ids.forEach(function (id) {
      for (var i = 0; i < pool.length; i++) {
        if (S.cards[pool[i]].id === id) { first.push(pool[i]); pool.splice(i, 1); return; }
      }
    });
    S.draw = S.draw.filter(function (u) { return first.indexOf(u) < 0; });
    S.discard = S.discard.filter(function (u) { return first.indexOf(u) < 0; });
    S.draw = first.concat(S.draw);
    this.syncPiles();
    return first.length;
  };

  P.discardHand = function () {
    var S = this.S, self = this, keep = [];
    var retainSlots = this.mod('retainSlots', 0);
    var hand = S.hand.slice();
    S.hand = [];
    hand.forEach(function (h) {
      var eff = S.cards[h.uid].eff, kw = eff.keywords || {};
      // end of turn in hand triggers
      if (eff.effects && eff.effects.onTurnEndInHand) self.fireCardTrigger('onTurnEndInHand', [h.uid]);
      if (kw.retain) { keep.push(h); return; }
      if (kw.fleeting) { self.toExhaust(h.uid); return; }
      self.toDiscard(h.uid);
      self.fireCardTrigger('onDiscard', [h.uid]);
    });
    S.hand = keep;
    this.drain();
  };

  // endTurn never leaves turn='resolving' behind: an exception anywhere in the round is logged (SB.util.engineErrors and a
  // warning) and the round is finished gracefully so the player gets control back (see recoverRound).
  P.endTurn = function () {
    var S = this.S;
    this._stage = 'resolve';
    try { return this._endTurnBody(); }
    catch (err) {
      if (U.throwOps) throw err;
      this.recoverRound(err);
      return this.takeEvents();
    } finally {
      // belt and braces: whatever happened above, the battle is either over or waiting for the player
      if (!S.over && S.turn === 'resolving') { S.turn = 'player'; S.phase = 'play'; this.touch(); }
    }
  };
  P.recoverRound = function (err) {
    var S = this.S, msg = (err && err.message) || String(err), stage = this._stage;
    U.engineErrors = U.engineErrors || [];
    U.engineErrors.push({ message: msg, stack: err && err.stack ? String(err.stack).split('\n').slice(0, 4).join(' | ') : '', round: S.round, phase: S.phase, stage: stage });
    U.warnOnce('endTurn:' + msg, 'endTurn failed in ' + S.phase + ' (round ' + S.round + '): ' + msg);
    // clear re-entrancy guards and any half-run trigger queue
    this._draining = false; this._reaping = false; this._immediate = false; this._queue.length = 0;
    try { this.reap(); this.checkEnd(); } catch (e1) { U.warnOnce('endTurn:reap:' + e1.message, 'recover reap failed: ' + e1.message); }
    if (S.over) return;
    if (stage === 'resolve') {
      // the round broke before the next one started: start it now
      try { this._stage = 'begin'; this.beginRound(); } catch (e2) { U.warnOnce('endTurn:begin:' + e2.message, 'recover beginRound failed: ' + e2.message); }
    }
    if (!S.over && S.turn !== 'player') {
      // beginRound itself broke (or failed again): hand control back with whatever was drawn, topping the hand up if it is empty
      S.turn = 'player'; S.phase = 'play';
      try { if (!S.hand.length) this.drawCards(rv('draw_per_turn', 5)); } catch (e3) { /* nothing more to do */ }
      this.touch();
    }
    this.emit('toast', { text: 'The round was cut short by a glitch. Carry on.' });
  };
  P._endTurnBody = function () {
    var S = this.S, self = this;
    if (S.over) return this.takeEvents();
    if (S.turn !== 'player') return this.takeEvents();
    S.turn = 'resolving'; S.phase = 'end_turn';
    this.emit('phase', { phase: 'end_turn', round: S.round });
    this.fire('onTurnEnd', { subject: null });
    // Purr N keyword on units
    this.cats().forEach(function (c) { if (c.kw.purr && !c.dead) self.addFloorStatus(c.floor, 'purr', typeof c.kw.purr === 'number' ? c.kw.purr : 1); });
    this.drain();
    if (S.over) return this.takeEvents();
    this.discardHand();
    S.zoomies = 0;
    if (S.over) return this.takeEvents();
    var pestsFirst = rv('pestsFirst', true);
    for (var pass = 0; pass < 2; pass++) {
    if ((pass === 0) === pestsFirst) {
    // PEST ATTACKS
    S.phase = 'pest_attacks'; this.emit('phase', { phase: 'pest_attacks', round: S.round });
    ENG().ai.pestPhase(this);
    this.drain();
    if (S.over) return this.takeEvents();
    } else {
    // CAT ATTACKS
    S.phase = 'cat_attacks'; this.emit('phase', { phase: 'cat_attacks', round: S.round });
    this.ensure();
    if (S.clock.isWitching) {
      var zoomers = this.cats().filter(function (c) { return !c.napping && !c.boxed && !c.dead; });
      zoomers.forEach(function (c) { if (!c.removed) { self.zoomAttack(c); } });
      zoomers.forEach(function (c) { if (!c.removed && !c.dead) { S.pendingFrazzle.push(c.uid); } });
      this.stat('witchingHours');
    }
    var idle = [];
    for (var fi = 0; fi < this.numFloors && !S.over; fi++) {
      var order = S.floors[fi].cats.slice();
      for (var k = 0; k < order.length && !S.over; k++) {
        var c = order[k];
        if (c.removed || c.dead) continue;
        var did = this.catAttack(c);
        if (!did && !c.napping && this.atk(c) > 0) idle.push(c);
        this.drain();
      }
    }
    idle.forEach(function (c) { if (!c.removed) self.fireOwn(c, 'onIdle', { subject: c }); });
    this.drain();
    if (S.over) return this.takeEvents();
    this.tickEndOfCatPhase();
    }
    }
    // PEST ADVANCE
    S.phase = 'pest_advance'; this.emit('phase', { phase: 'pest_advance', round: S.round });
    this.pestAdvance();
    this.drain();
    if (S.over) return this.takeEvents();
    // SPAWN
    S.phase = 'spawn'; this.emit('phase', { phase: 'spawn', round: S.round });
    this.retryGarden();
    this.spawnWave(S.round + 1);
    if (S.clock.isWitching) this.spawnNightVisitors();
    this.fire('onSpawnPhase', { subject: null });
    this.drain();
    if (S.over) return this.takeEvents();
    this.checkEnd();
    if (S.over) return this.takeEvents();
    // DUSK
    S.phase = 'dusk'; this.emit('phase', { phase: 'dusk', round: S.round });
    this.dusk();
    this.drain();
    if (S.over) return this.takeEvents();
    this.checkEnd();
    if (S.over) return this.takeEvents();
    this._stage = 'begin';
    this.beginRound();
    return this.takeEvents();
  };

  P.tickEndOfCatPhase = function () { /* reserved for end of cat phase timing */ };

  // Hold rule and climbing
  P.pestAdvance = function () {
    var S = this.S, self = this;
    for (var fi = this.numFloors - 2; fi >= 0; fi--) {
      var list = S.floors[fi].pests.slice();
      for (var k = 0; k < list.length; k++) {
        var p = list[k];
        if (p.dead || p.removed || p.floor !== fi) continue;
        if (p.statuses.scared && !p.boss) {
          if (fi > 0) this.knockPest(p, 1, { noDizzy: true, ignoreGrip: true });
          continue;
        }
        if (!this.canClimb(p)) continue;
        var steps = this.hasTrait(p, 'glider') ? 2 : 1;
        for (var s = 0; s < steps; s++) {
          var from = p.floor, to = from + 1;
          if (to >= this.numFloors) break;
          if (this.pestSize(to) + p.size > S.floors[to].capacity.pestSize) break;
          this.movePest(p, to, { kind: 'climb' });
          if (!this.canHold(p)) { /* gliders continue only when still free */ }
        }
      }
    }
  };
  P.canHold = function (p) { return this.blockers(p.floor).length > 0 && !this.hasTrait(p, 'climber') && !this.hasTrait(p, 'glider'); };
  P.canClimb = function (p) {
    var S = this.S;
    if (p.statuses.yarn || p.statuses.scared) return false;
    if (p.noClimbRound === S.round) return false;
    if (p.flags.noClimb || p.traitSet.anchoredfloor) return false;
    if (p.untargetable && p.traitSet.cannot_be_attacked) return false;
    if (p.boss && p.flags.stationary) return false;
    if (p.statuses.fixated) return false;
    var climber = this.hasTrait(p, 'climber') || this.hasTrait(p, 'glider') || this.hasTrait(p, 'flying');
    if (!rv('pestsAlwaysClimb', true) && !climber && this.blockers(p.floor).length > 0) return false;
    if (p.pat && p.pat.noClimb) return false;
    return true;
  };
  P.movePest = function (p, to, o) {
    o = o || {};
    var from = p.floor, S = this.S;
    if (from === to) return false;
    this.removeUnit(p);
    p.removed = false;
    var f = S.floors[to];
    if (o.at === 'front') f.pests.unshift(p); else f.pests.push(p);
    p.floor = to;
    this.reindex(from); this.reindex(to);
    this.touch();
    this.emit('move', { uid: p.uid, side: 'pest', from: from, to: to, kind: o.kind || 'move', pos: p.pos });
    if (o.kind === 'climb') this.fire('onPestClimb', { subject: p, floor: to, from: from });
    this.fire('onEnemyEnter', { subject: p, floor: to, from: from });
    return true;
  };

  // ======================================================================================
  // Dusk
  // ======================================================================================
  P.allUnits = function () { return this.cats().concat(this.pests()); };
  P.dusk = function () {
    var S = this.S, self = this, E = ENG();
    var seen = {};
    DUSK_ORDER.concat(E.statuses.names()).forEach(function (id) {
      if (seen[id]) return; seen[id] = 1;
      var def = E.statuses.get(id);
      if (def && def.dusk) def.dusk(self);
      self.reap();
    });
    // piles
    S.floors.forEach(function (f, fi) {
      var runs = self.pileRuns(fi);
      runs.forEach(function (run) {
        var Psz = U.sum(run, function (c) { return c.flags.pileWeight2 ? 2 : 1; }) + self.mod('pileBonus', 0) + f._pileAura;
        if (run.length < 2) return;
        if (Psz >= (self.mod('pileHealMinSize', 0) || rv('pile_heal_min_size', 3))) run.forEach(function (c) { self.heal(c, rv('pile_heal_amount', 1)); });
        if (Psz >= rv('heap_size', 4) || (Psz >= 3 && run.some(function (c) { return c.flags.heapAt3; }))) run.forEach(function (c) { self.addFluff(c, rv('heap_fluff_per_round', 2)); });
        if (Psz > 0) self.statMax('maxPile', Psz);
      });
    });
    // hazards
    ENG().ai.tickHazards(this);
    this.fire('onDusk', { subject: null });
    this.drain();
    // worn toys: durability counts down once per round after the toy has had its turn, at 0 it is gone
    S.floors.forEach(function (f) {
      f.rooms.slice().forEach(function (rm) {
        if (rm.rtype !== 'toy' || !rm.expires) return;
        rm.durability--;
        self.emit('room', { uid: rm.uid, floor: rm.floor, rtype: 'toy', action: 'damage', durability: rm.durability });
        if (rm.durability <= 0) self.removeRoom(rm, 'worn out');
      });
    });
    // clear this-round scratch
    this.cats().forEach(function (c) { c.tbuff.power = 0; });
    this.pests().forEach(function (p) { p.tempBuff = 0; p.hissScaredRound = p.hissScaredRound; });
    Object.keys(S.cards).forEach(function (uid) { S.cards[uid].costMod.turn = 0; });
    // Nip meter progress
    var nip = S.nip;
    if (nip.crash > 0 && !nip.crashFresh) { nip.crash--; if (nip.crash === 0) this.emit('crash', { ended: true }); }
    if (nip.surge > 0) {
      nip.surge--;
      if (nip.surge === 0) { nip.surgeNext = 0; this.startCrash(); }
    }
    // zoomies and per round counters
    S.limitsRound = S.round;
    this.touch();
  };

  // ======================================================================================
  // end of battle
  // ======================================================================================
  P.bossAlive = function () {
    var S = this.S;
    if (!S.bossUid) return false;
    var b = this.pestByUid(S.bossUid);
    return !!(b && !b.dead && !b.removed);
  };
  P.winTest = function (w) {
    var S = this.S;
    if (!w) return null;
    if (w.type === 'bossDead') return S.bossUid ? !this.bossAlive() : null;
    if (w.type === 'any') { var self = this, r = false; (w.of || w.conds || w.conditions || w.any || []).forEach(function (x) { if (self.winTest(x)) r = true; }); return r; }
    if (w.type === 'dawnRounds') return S.dawn.active && S.dawn.rounds >= (w.atLeast || w.rounds || w.n || 3);
    return null;
  };
  P.checkEnd = function () {
    var S = this.S;
    if (S.over) return;
    if (S.sunbeam.warmth <= 0) {
      if (!S.lossChecked) {
        S.lossChecked = true;
        this.fire('onLoss', { subject: null });
        var guard = 0;
        while (this._queue.length && guard++ < 200 && !S.over) { var job = this._queue.shift(); try { job(); } catch (err) { U.warnOnce('loss:' + err.message, err.message); } }
        S.lossChecked = false;
        if (S.sunbeam.warmth > 0) return;
      } else return;
      return this.finish('lose');
    }
    var w = S.win;
    var tw = this.winTest(w);
    if (tw === true) return this.finish('win');
    var pests = this.livePests().length + S.garden.length + (S.attached || []).filter(function (a) { return !a.dead; }).length;
    if (!w || tw === null) {
      if (!pests && this.wavesPending() === 0 && !(S.dawn && S.dawn.active && S.dawn.rounds < 1)) return this.finish('win');
    }
  };
  P.finish = function (outcome) {
    var S = this.S;
    if (S.over) return;
    if (outcome === 'win' && S.win && S.win.type === 'bossDead') {
      // remaining pests vanish
      var self = this;
      this.pests().forEach(function (p) { p.dead = true; p.removed = true; });
      S.floors.forEach(function (f) { f.pests = []; }); S.garden = [];
    }
    S.over = true; S.outcome = outcome; S.turn = 'over'; S.phase = 'over';
    this._queue.length = 0;
    this.emit(outcome === 'win' ? 'win' : 'lose', { round: S.round, warmth: S.sunbeam.warmth, killedBy: S.killedBy || null });
    this.resultCache = null;
    this.touch();
  };
  P.surrender = function () {
    if (this.S.over) return { ok: false, reason: 'over' };
    this.S.sunbeam.warmth = 0; this.S.killedBy = 'surrender'; this.S.surrendered = true;
    this.finish('lose');
    return { ok: true };
  };

  P.result = function () {
    var S = this.S;
    if (!S.over) return null;
    if (this.resultCache) return this.resultCache;
    var plays = {};
    Object.keys(S.countedPlays).forEach(function (u) { plays[u] = S.countedPlays[u]; });
    var self = this;
    var growth = S.growth.slice();
    var st = Object.assign({}, S.stats, { plays: plays, warmthEnd: S.sunbeam.warmth, round: S.round, killedBy: S.killedBy || null, hairballsCoughed: S.stats.hairballsCoughed || 0 });
    this.resultCache = { outcome: S.outcome, warmth: S.sunbeam.warmth, growth: growth, stats: st, loot: {}, lost: S.lost.slice(), killedBy: S.killedBy || null, rounds: S.round, growthApplied: false };
    return this.resultCache;
  };


  // ======================================================================================
  // small board helpers used by ops
  // ======================================================================================
  P.addToBank = function (n) {
    var S = this.S;
    S.bank = Math.max(0, S.bank + n);
    this.emit('bank', { amount: n, total: S.bank });
    if (n > 0) this.fire('onBank', { subject: null, amount: n });
  };
  P.summonCat = function (id, floor, at) {
    var rid = SB.content.resolveId(id);
    if (!SB.content.card(rid)) { U.warnOnce('summon:' + id, 'summon: unknown card ' + id); return null; }
    var uid = this.uid('f');
    this.registerCard(uid, rid, null, true);
    if (!this.canPlaceCat(uid, floor)) { this.toast('No room to summon'); return null; }
    return this.deployCat(uid, floor, at === 'front' ? 0 : undefined, { summoned: true, from: 'summon' });
  };
  P.shoveCat = function (c, to) {
    var f = this.S.floors[c.floor], i = f.cats.indexOf(c);
    if (i < 0) return false;
    f.cats.splice(i, 1);
    if (to === 'front') f.cats.unshift(c); else f.cats.push(c);
    this.reindex(c.floor); this.touch();
    this.emit('move', { uid: c.uid, side: 'cat', from: c.floor, to: c.floor, kind: 'shove', pos: c.pos });
    return true;
  };
  P.moveCat = function (c, to) {
    var from = c.floor;
    var f = this.S.floors[from], i = f.cats.indexOf(c);
    if (i < 0) return false;
    if (c.boxed) this.unseatCat(c, 'moved');
    f.cats.splice(i, 1);
    this.S.floors[to].cats.push(c);
    c.floor = to;
    this.reindex(from); this.reindex(to); this.touch();
    this.emit('move', { uid: c.uid, side: 'cat', from: from, to: to, kind: 'carry', pos: c.pos });
    return true;
  };

  // ======================================================================================
  // public API: canPlay, playCard, toggleNap, serialize, refresh
  // ======================================================================================
  P.isRoomToy = function (eff) {
    var fx = eff.effects || {};
    var other = Object.keys(fx).some(function (k) { return k !== 'onPlay' && fx[k] && fx[k].length; });
    return other || (eff.aura && eff.aura.length) || (eff.activated && eff.activated.length) || !!(eff.flags && eff.flags.room);
  };
  P.playOps = function (eff) { return (eff.effects && eff.effects.onPlay) || []; };
  P.opsInclude = function (list, name) {
    var f = false;
    (function walk(o) { if (!o || f) return; if (Array.isArray(o)) { o.forEach(walk); return; } if (typeof o === 'object') { if (o.type === name || o.op === name) f = true; Object.keys(o).forEach(function (k) { walk(o[k]); }); } })(list);
    return f;
  };

  P.canPlay = function (uid) {
    var S = this.S, rec = S.cards[uid];
    var no = function (r) { return { ok: false, reason: r, targets: [], needsTarget: 'none' }; };
    if (S.over) return no('The battle is over');
    if (S.turn !== 'player') return no('Not your turn');
    if (!rec || this.handIndex(uid) < 0) return no('Not in hand');
    var eff = rec.eff, kw = eff.keywords || {};
    if (eff.unplayable || kw.unplayable) return no('Unplayable');
    var cost = this.cardCost(uid);
    var x = 0;
    if (cost === 'X' || cost === null || eff.costX) { cost = 0; } else if (cost > S.zoomies) return no('Not enough Zoomies');
    var type = eff.type, targets = [], need = 'none', self = this;
    if (type === 'unit' || type === 'champion') {
      need = 'floor';
      for (var fi = 0; fi < this.numFloors; fi++) if (this.canPlaceCat(uid, fi)) targets.push({ floor: fi });
      if (!targets.length) return { ok: false, reason: 'No room for this cat', targets: [], needsTarget: 'floor' };
    } else if (type === 'toy' && this.isRoomToy(eff)) {
      need = 'floor';
      for (var f2 = 0; f2 < this.numFloors; f2++) if (this.roomFree(f2)) targets.push({ floor: f2 });
      if (!targets.length) return { ok: false, reason: 'No free room slot', targets: [], needsTarget: 'floor' };
    } else {
      var t = eff.targeting || 'none';
      if (t === 'enemy' || t === 'pest') {
        need = 'pest';
        this.pests().forEach(function (p) { if (!p.dead && !p.untargetable && !p.traitSet.untargetable) targets.push({ pestUid: p.uid, floor: p.floor, pos: p.pos }); });
        if (!targets.length) return { ok: false, reason: 'No enemies to target', targets: [], needsTarget: 'pest' };
      } else if (t === 'cat' || t === 'ally') {
        need = 'cat';
        this.cats().forEach(function (c) { if (!c.dead) targets.push({ catUid: c.uid, floor: c.floor, pos: c.pos }); });
        if (!targets.length) return { ok: false, reason: 'No cats to target', targets: [], needsTarget: 'cat' };
      } else if (t === 'floor') {
        need = 'floor';
        var isBox = this.opsInclude(this.playOps(eff), 'box');
        for (var f3 = 0; f3 < this.numFloors; f3++) {
          if (isBox && (!this.roomFree(f3) || this.boxesOnFloor(f3) >= this.maxBoxes(f3))) continue;
          targets.push({ floor: f3 });
        }
        if (!targets.length) return { ok: false, reason: isBox ? 'No floor can take a Box' : 'No floor', targets: [], needsTarget: 'floor' };
      }
    }
    return { ok: true, reason: null, targets: targets, needsTarget: need };
  };

  P.playCard = function (uid, target) {
    var S = this.S;
    target = target || {};
    var chk = this.canPlay(uid);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    var choice = {};
    if (chk.needsTarget === 'floor') {
      var tf = target.floor !== undefined ? target.floor : (target.pestUid && this.pestByUid(target.pestUid) ? this.pestByUid(target.pestUid).floor : undefined);
      if (tf === undefined) { if (chk.targets.length === 1) tf = chk.targets[0].floor; else return { ok: false, reason: 'Pick a floor' }; }
      if (!chk.targets.some(function (t) { return t.floor === tf; })) return { ok: false, reason: 'Cannot play there' };
      choice.floor = tf; choice.pos = target.pos;
    } else if (chk.needsTarget === 'pest') {
      var pu = target.pestUid;
      if (!pu && target.floor !== undefined && target.pos !== undefined) { var pp = S.floors[target.floor] && S.floors[target.floor].pests[target.pos]; pu = pp && pp.uid; }
      if (!pu) { if (chk.targets.length === 1) pu = chk.targets[0].pestUid; else return { ok: false, reason: 'Pick an enemy' }; }
      if (!chk.targets.some(function (t) { return t.pestUid === pu; })) return { ok: false, reason: 'Invalid target' };
      choice.pestUid = pu; choice.floor = this.pestByUid(pu).floor;
    } else if (chk.needsTarget === 'cat') {
      var cu = target.catUid;
      if (!cu && target.floor !== undefined && target.pos !== undefined) { var cc = S.floors[target.floor] && S.floors[target.floor].cats[target.pos]; cu = cc && cc.uid; }
      if (!cu) { if (chk.targets.length === 1) cu = chk.targets[0].catUid; else return { ok: false, reason: 'Pick a cat' }; }
      if (!chk.targets.some(function (t) { return t.catUid === cu; })) return { ok: false, reason: 'Invalid target' };
      choice.catUid = cu; choice.floor = this.catByUid(cu).floor;
    }
    var rec = S.cards[uid], eff = rec.eff, kw = eff.keywords || {};
    var cost = this.cardCost(uid), x = 0;
    if (cost === 'X' || cost === null || eff.costX) { x = S.zoomies; S.zoomies = 0; cost = x; }
    else S.zoomies -= cost;
    this.removeFromHand(uid);
    S.cardsPlayedThisTurn++; S.playedThisTurn.push(eff.id);
    this.stat('cardsPlayed'); this.statMax('longestTurnCards', S.cardsPlayedThisTurn);
    S.playedFight[eff.id] = (S.playedFight[eff.id] || 0) + 1;
    if (rec.inst) S.countedPlays[rec.inst] = (S.countedPlays[rec.inst] || 0) + 1;
    this.emit('play', { uid: uid, id: eff.id, name: eff.name, type: eff.type, cost: cost, floor: choice.floor, pestUid: choice.pestUid, catUid: choice.catUid });
    rec.costMod.played = 0;
    var ctx = this.makeCtx({ src: { kind: 'card', card: uid }, self: null, choice: choice, x: x, cardUid: uid, card: eff, lk: 'card:' + uid + ':' + S.cardsPlayedThisTurn, floorOverride: choice.floor });
    var dest = 'discard';
    var fate = null;
    if (eff.type === 'unit' || eff.type === 'champion') {
      var u = this.deployCat(uid, choice.floor, choice.pos, { choice: choice, x: x });
      dest = 'board';
      if (!u) dest = 'discard';
    } else if (eff.type === 'toy' && this.isRoomToy(eff)) {
      var r = this.placeToy(uid, choice.floor);
      dest = 'board';
      if (r && r.room) {
        var pctx = this.makeCtx({ src: { kind: 'room', unit: r.room }, self: r.room, choice: choice, x: x, floorOverride: choice.floor, lk: 'room:' + r.room.uid + ':play' });
        this.runEffects(r.onPlay || [], pctx);
        this.fire('onToyPlaced', { subject: r.room, floor: choice.floor });
      } else dest = 'discard';
    } else {
      this.runEffects(this.playOps(eff), ctx);
      if (kw.echo && !S.echoUsed[eff.id + ':' + uid]) { S.echoUsed[eff.id + ':' + uid] = 1; this.runEffects(this.playOps(eff), ctx); }
    }
    if (dest === 'discard') {
      if (kw.exhaust) this.toExhaust(uid); else this.toDiscard(uid);
    }
    this.fire('onCardPlayed', { subject: null, card: eff, cardUid: uid, floor: choice.floor });
    this.drain();
    this.reap();
    this.refresh();
    return { ok: true };
  };

  P.toggleNap = function (catUid) {
    var S = this.S;
    if (S.over || S.turn !== 'player') return { ok: false, reason: 'Not your turn' };
    var c = this.catByUid(catUid);
    if (!c) return { ok: false, reason: 'No such cat' };
    if (c.napping) {
      if (c.napRound === S.round && !c.flags.wakeAnytime) return { ok: false, reason: 'It only just fell asleep' };
      if (!this.wakeCat(c)) return { ok: false, reason: 'Cannot wake' };
    } else {
      var ck = this.canNap(c);
      if (!ck.ok) return ck;
      this.napCat(c);
    }
    this.drain(); this.reap(); this.refresh();
    return { ok: true };
  };

  // champion or cat activated abilities: B.useAbility(catUid, index)
  // Scratch: tap a host cat and pay Zoomies to pull an attached parasite off (removeCost from the pest's parasite block)
  P.scratchOff = function (catUid) {
    var S = this.S, c = this.catByUid(catUid);
    if (S.over || S.turn !== 'player' || !c) return { ok: false, reason: 'Not available' };
    var a = (S.attached || []).filter(function (x) { return x.kind === 'pest' && !x.dead && x.host === c.uid; })[0];
    if (!a) return { ok: false, reason: 'Nothing attached' };
    var par = (SB.content.pest(a.id) || {}).parasite || {};
    var cost = par.removeCost == null ? 1 : par.removeCost;
    if (cost > S.zoomies) return { ok: false, reason: 'Not enough Zoomies' };
    S.zoomies -= cost;
    this.emit('play', { uid: c.uid, id: c.id, name: 'Scratch', type: 'ability', cost: cost, floor: c.floor });
    this.detachParasite(a, 'scratch');
    this.refresh();
    return { ok: true };
  };

  P.useAbility = function (catUid, idx) {
    if (idx === 'scratch') return this.scratchOff(catUid);
    var S = this.S, c = this.catByUid(catUid);
    if (S.over || S.turn !== 'player' || !c) return { ok: false, reason: 'Not available' };
    var a = (c.activated || [])[idx || 0];
    if (!a) return { ok: false, reason: 'No ability' };
    var cost = a.cost || 0;
    if (cost > S.zoomies) return { ok: false, reason: 'Not enough Zoomies' };
    var key = 'act:' + c.uid + ':' + (idx || 0);
    if (a.limit && !this.limitOk(key, a.limit, null)) return { ok: false, reason: 'Already used' };
    S.zoomies -= cost;
    this.emit('play', { uid: c.uid, id: c.id, name: a.name || c.name, type: 'ability', cost: cost, floor: c.floor });
    var ctx = this.makeCtx({ src: { kind: 'cat', unit: c }, self: c, subject: c, floorOverride: c.floor, lk: key });
    this.runEffects(a.effects || a.do || [], ctx);
    this.drain(); this.reap(); this.refresh();
    return { ok: true };
  };

  P.serialize = function () {
    return { v: 1, enc: U.deepClone(this.enc), opts: U.deepClone(this.opts), state: U.deepClone(this.S), rng: this.rng.getState() };
  };

  P.updateIntents = function () { ENG().ai.updateIntents(this); };

  P.refresh = function () {
    var S = this.S, self = this;
    this.ensure();
    this.syncPiles();
    S.hand.forEach(function (h) { h.card = self.cardView(h.uid); });
    if (!S.over) this.updateIntents();
    S.incomingTotal = S.incoming ? S.incoming.reduce(function (a, b) { return a + b; }, 0) : 0;
  };

  // convenience for tests and tools
  P.playByIndex = function (i, target) { var h = this.S.hand[i]; return h ? this.playCard(h.uid, target) : { ok: false, reason: 'No such card' }; };
  P.view = function () { return this.S; };


})();
