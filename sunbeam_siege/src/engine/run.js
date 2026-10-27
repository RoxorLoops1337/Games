/* SUNBEAM SIEGE: run state and flow (agent C2).
 * Classic script. Attaches SB.run. Owns: new run, node entry, encounter building, battle result handling, reward claims,
 * act transitions, champion tiers, treasure, save and load, run summary.
 * Companion files: map.js (SB.map, SB.run.rngFor, SB.run.generateMap), rewards.js (SB.rewards), shop.js (SB.shop),
 * events-engine.js (SB.event), post.js (SB.post), nook.js (SB.nook), profile.js (SB.profile).
 * Everything is deterministic: every roll draws from SB.run.rngFor(seed, stream, key) with a per node key, so a reload
 * cannot reroll a reward and choices never shift another stream.
 * Run state is plain JSON (see newRun). No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  SB.data = SB.data || {};
  var Run = SB.run = SB.run || {};
  var SAVE_KEY = 'nl_run_v1';
  var VERSION = 1;

  function CC() { return SB.content; }
  function rules() { return SB.data.rules || {}; }
  function meta() { return SB.data.meta || {}; }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ================================================================== U: shared helpers */
  var U = Run.U = Run.U || {};
  U.clone = clone;
  U.clamp = clamp;
  U.rng = function (run, stream, key) { return Run.rngFor(run.seed, stream, key); };
  U.nextUid = function (run) {
    run.nextUid = (run.nextUid || 0) + 1;
    return 'c_' + ('0000' + run.nextUid).slice(-4);
  };
  U.log = function (run, text) {
    run.log = run.log || [];
    run.log.push(text);
    if (run.log.length > 120) run.log.shift();
  };
  U.stat = function (run, key, n) { run.stats[key] = (run.stats[key] || 0) + (n === undefined ? 1 : n); };
  U.statMax = function (run, key, v) { run.stats.best = run.stats.best || {}; if (v > (run.stats.best[key] || 0)) run.stats.best[key] = v; };

  Run.rankMods = function (run) {
    var m = meta();
    return (m.cumulativeMods ? m.cumulativeMods(run.rank || 0) : {}) || {};
  };

  // aggregated relic mods: numbers add, booleans or, strings last wins
  Run.mod = function (run, key) {
    var total = 0, flag = false, any = false;
    for (var i = 0; i < run.relics.length; i++) {
      var def = CC().relic(run.relics[i].id);
      if (!def || !def.mods || def.mods[key] === undefined) continue;
      var v = def.mods[key];
      any = true;
      if (typeof v === 'number') total += v; else if (v === true) flag = true;
    }
    if (!any) return 0;
    return flag && total === 0 ? true : total;
  };
  U.mod = Run.mod;
  U.hasRelic = function (run, id) {
    for (var i = 0; i < run.relics.length; i++) if (run.relics[i].id === id) return true;
    return false;
  };
  U.relicEntry = function (run, id) {
    for (var i = 0; i < run.relics.length; i++) if (run.relics[i].id === id) return run.relics[i];
    return null;
  };

  /* ---- fish ---- */
  U.addFish = function (run, n, opts) {
    opts = opts || {};
    n = Math.round(n);
    if (n > 0 && opts.pct !== false) {
      var pct = Run.mod(run, 'fishGainPct');
      if (typeof pct === 'number' && pct) n = Math.round(n * (1 + pct / 100));
    }
    if (n >= 0) { run.fish += n; U.stat(run, 'fishEarned', n); return n; }
    var loss = Math.min(run.fish, -n);
    run.fish -= loss;
    U.stat(run, 'fishSpent', loss);
    return -loss;
  };
  U.spendFish = function (run, n) {
    if (run.fish < n) return false;
    run.fish -= n;
    U.stat(run, 'fishSpent', n);
    return true;
  };

  /* ---- warmth ---- */
  U.refreshMaxWarmth = function (run) {
    var rm = Run.rankMods(run);
    var base = run.maxWarmthBase;
    var mod = Run.mod(run, 'maxWarmth');
    run.maxWarmth = Math.max(1, base + (typeof mod === 'number' ? mod : 0));
    if (run.warmth > run.maxWarmth) run.warmth = run.maxWarmth;
    return run.maxWarmth;
  };
  U.heal = function (run, n) {
    var before = run.warmth;
    run.warmth = clamp(run.warmth + Math.round(n), 0, run.maxWarmth);
    var gained = run.warmth - before;
    if (gained > 0) U.stat(run, 'warmthHealed', gained);
    return gained;
  };
  // events and shops never kill: warmth stays at 1 or more
  U.hurtSafe = function (run, n) {
    var before = run.warmth;
    run.warmth = Math.max(1, run.warmth - Math.round(n));
    var lost = before - run.warmth;
    if (lost > 0) { U.stat(run, 'warmthLost', lost); U.statMin(run, 'lowestWarmth', run.warmth); }
    return lost;
  };
  U.statMin = function (run, key, v) { if (run.stats[key] === undefined || v < run.stats[key]) run.stats[key] = v; };
  U.raiseMaxWarmth = function (run, n, healToo) {
    run.maxWarmthBase += n;
    U.refreshMaxWarmth(run);
    if (healToo !== false) run.warmth = Math.min(run.maxWarmth, run.warmth + n);
  };

  /* ---- card instances ---- */
  function livesFor(def) {
    var R = rules();
    if (def.type === 'champion') return R.lives_champion || 9;
    var l = def.stats && def.stats.lives;
    if (typeof l === 'number') return l;
    var tags = def.tags || [];
    if (tags.indexOf('kitten') >= 0) return R.lives_kitten || 2;
    if (def.stats && def.stats.size >= 2) return R.lives_large || 4;
    return R.lives_standard || 3;
  }
  U.makeInst = function (run, cardId, origin) {
    var def = CC().card(cardId);
    if (!def) throw new Error('unknown card ' + cardId);
    var inst = null;
    if (SB.cardInst && typeof SB.cardInst.make === 'function') {
      try { inst = SB.cardInst.make(def.id); } catch (e) { inst = null; }
    }
    if (!inst || typeof inst !== 'object') {
      inst = {
        uid: null, id: def.id, scratches: [], fork: null, knead: { attack: 0, health: 0, value: 0 }, plays: 0, masteryRank: 0,
        growth: { power: 0, health: 0 }, lives: 0, maxLives: 0
      };
      if (def.type === 'champion') inst.champion = { tiers: [] };
    }
    inst.uid = U.nextUid(run);
    inst.id = def.id;
    inst.scratches = inst.scratches || [];
    if (inst.fork === undefined) inst.fork = null;
    if (inst.knead === undefined) inst.knead = { attack: 0, health: 0, value: 0 };
    inst.plays = inst.plays || 0;
    inst.masteryRank = inst.masteryRank || 0;
    inst.growth = inst.growth || { power: 0, health: 0 };
    if (!inst.maxLives) { inst.maxLives = livesFor(def); }
    if (inst.lives === undefined || inst.lives === null || inst.lives === 0) inst.lives = inst.maxLives;
    if (def.type === 'champion') inst.champion = inst.champion || { tiers: [] };
    inst.origin = origin || 'draft';
    inst.slotBonus = inst.slotBonus || 0;
    return inst;
  };
  U.addCard = function (run, cardId, origin) {
    var inst = U.makeInst(run, cardId, origin);
    run.deck.push(inst);
    U.statMax(run, 'maxDeckSize', run.deck.length);
    return inst;
  };
  U.inst = function (run, uid) {
    for (var i = 0; i < run.deck.length; i++) if (run.deck[i].uid === uid) return run.deck[i];
    return null;
  };
  U.def = function (inst) { return CC().card(inst.id); };
  U.isChampion = function (inst) { var d = U.def(inst); return !!d && d.type === 'champion'; };
  U.isCat = function (inst) { var d = U.def(inst); return !!d && (d.type === 'unit' || d.type === 'champion'); };
  U.cats = function (run) { return run.deck.filter(U.isCat); };
  U.champion = function (run) {
    for (var i = 0; i < run.deck.length; i++) if (U.isChampion(run.deck[i])) return run.deck[i];
    return null;
  };
  // gain lives, optionally raising the cap (hard cap 9)
  U.gainLives = function (run, inst, n, raiseMax) {
    var cap = rules().lives_cap || 9;
    if (n >= 0) {
      var before = inst.lives;
      inst.lives = Math.min(cap, inst.lives + n);
      if (raiseMax !== false && inst.lives > inst.maxLives) inst.maxLives = inst.lives;
      if (raiseMax === false && inst.lives > inst.maxLives) inst.lives = Math.max(before, inst.maxLives);
      return inst.lives - before;
    }
    var b2 = inst.lives;
    inst.lives = Math.max(1, inst.lives + n);   // run level losses never delete a cat
    return inst.lives - b2;
  };
  U.removeInst = function (run, uid) {
    for (var i = 0; i < run.deck.length; i++) {
      if (run.deck[i].uid === uid) { return run.deck.splice(i, 1)[0]; }
    }
    return null;
  };
  U.deckMin = function () { return rules().deck_min || 8; };
  U.canRemove = function (run, inst) {
    if (!inst) return { ok: false, reason: 'No such card.' };
    var d = U.def(inst);
    if (d && d.type === 'champion') return { ok: false, reason: 'Champions stay with the clowder.' };
    if (run.deck.length <= U.deckMin()) return { ok: false, reason: 'The clowder cannot go below ' + U.deckMin() + ' cards.' };
    return { ok: true };
  };

  /* ---- relics ---- */
  function applyPickupEffect(run, eff) {
    var R = rules();
    if (!eff) return;
    switch (eff.type) {
      case 'addCard': {
        var id = typeof eff.pool === 'string' ? eff.pool : null;
        if (!id && eff.card) id = eff.card;
        if (!id && eff.pool) {
          var rng = U.rng(run, 'misc', 'pickup:' + (run.nextUid || 0));
          var want = eff.pool.rarity;
          var clans = eff.pool.clan === 'run' ? [run.clan, run.side] : [eff.pool.clan];
          var list = SB.rewards.allDraftable().filter(function (c) {
            return clans.indexOf(CC().clanId ? CC().clanId(c.clan) : c.clan) >= 0 && (want === 'legendary' ? c.rarity === 'rare' : c.rarity === want);
          });
          // legendary non champion cards do not exist yet: the best available stand in is a Rare of the run clans
          var pick = rng.pick(list);
          id = pick && pick.id;
        }
        if (id) U.addCard(run, id, 'relic');
        break;
      }
      case 'lives':
        U.cats(run).forEach(function (c) {
          if (eff.target === 'allCats' || (eff.target === 'champion' && U.isChampion(c))) U.gainLives(run, c, eff.amount, true);
        });
        break;
      case 'warmth': U.heal(run, eff.amount); break;
      case 'maxWarmth': U.raiseMaxWarmth(run, eff.amount, true); break;
      case 'fish': U.addFish(run, eff.amount); break;
      default: break;
    }
  }
  U.giveRelic = function (run, relicId, source) {
    var def = CC().relic(relicId);
    if (!def) throw new Error('unknown relic ' + relicId);
    if (U.hasRelic(run, relicId)) return null;
    var entry = { id: def.id, counter: def.counter ? (def.counter.start || 0) : 0, at: run.visited ? run.visited.length : 0 };
    if (source) entry.src = source;
    run.relics.push(entry);
    U.statMax(run, 'maxRelics', run.relics.length);
    var mw = def.mods && def.mods.maxWarmth;
    if (typeof mw === 'number') {
      U.refreshMaxWarmth(run);
      if (mw > 0) run.warmth = Math.min(run.maxWarmth, run.warmth + mw);
    }
    if (def.mods && def.mods.champStartTier) run.tierUnlocked = Math.min(3, (run.tierUnlocked || 0) + def.mods.champStartTier);
    if (def.mods && def.mods.whittleSlotsPerAct) { /* applied at each act start */ }
    (def.pickup || []).forEach(function (e) { applyPickupEffect(run, e); });
    U.log(run, 'Relic: ' + def.name);
    return def;
  };
  // run level relic hooks. Battle time hooks belong to the battle engine.
  U.runHooks = function (run, on, ctx) {
    ctx = ctx || {};
    var fired = [];
    run.relics.slice().forEach(function (entry) {
      var def = CC().relic(entry.id);
      if (!def) return;
      (def.hooks || []).forEach(function (h) {
        if (h.on !== on) return;
        if (h.if && !condsOk(h.if, ctx)) return;
        (h.effects || []).forEach(function (e) { hookEffect(run, entry, def, e, ctx); });
        fired.push(entry.id);
      });
    });
    return fired;
  };
  function condsOk(list, ctx) {
    return list.every(function (c) {
      var v = ctx[c.check];
      switch (c.op) {
        case '!=': return v !== c.value;
        case '==': return v === c.value;
        case '>=': return v >= c.value;
        case '<=': return v <= c.value;
        case '>': return v > c.value;
        case '<': return v < c.value;
        default: return true;
      }
    });
  }
  function hookEffect(run, entry, def, e, ctx) {
    switch (e.type) {
      case 'warmth': U.heal(run, e.amount); break;
      case 'fish': U.addFish(run, e.amount); break;
      case 'counter': {
        var cap = def.counter && def.counter.cap != null ? def.counter.cap : 999;
        if (e.op === 'set') entry.counter = Math.min(cap, e.amount);
        else entry.counter = Math.min(cap, (entry.counter || 0) + e.amount);
        break;
      }
      case 'lives':
        U.cats(run).forEach(function (c) {
          if (e.target === 'allCats' || (e.target === 'champion' && U.isChampion(c))) U.gainLives(run, c, e.amount, true);
        });
        break;
      case 'buff':
        if (e.duration === 'run') U.cats(run).forEach(function (c) {
          if (e.target === 'champion' && U.isChampion(c)) { c.growth = c.growth || { power: 0, health: 0 }; c.growth[e.stat === 'health' ? 'health' : 'power'] += e.amount; }
        });
        break;
      case 'shopDiscountFirst': run.flags.firstPurchaseDiscount = e.amount; break;
      default: break;
    }
  }
  // Spare Whisker: the battle engine calls this when Warmth would reach 0. Returns {saved, warmth, clearFloor}.
  Run.tryLastLife = function (run) {
    var entry = U.relicEntry(run, 'relic_spare_whisker');
    if (!entry) return { saved: false };
    var rm = Run.rankMods(run);
    if (rm.removeRelics && rm.removeRelics.indexOf('relic_spare_whisker') >= 0) return { saved: false };
    run.relics = run.relics.filter(function (r) { return r.id !== 'relic_spare_whisker'; });
    run.warmth = Math.min(run.maxWarmth, 12);
    run.flags.lastLifeUsed = true;
    U.log(run, 'Sunbeam flickers. The Spare Whisker is spent.');
    return { saved: true, warmth: run.warmth, clearFloor: 3 };
  };

  /* ================================================================== seeds */
  var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  Run.normalizeSeed = function (s) {
    if (s === undefined || s === null) return null;
    var t = String(s).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    if (t.length !== 8) return null;
    for (var i = 0; i < t.length; i++) if (ALPHABET.indexOf(t.charAt(i)) < 0) return null;
    return t;
  };
  // menus only: this is the one place Math.random is allowed
  Run.randomSeed = function () {
    var s = '';
    for (var i = 0; i < 8; i++) s += ALPHABET.charAt(Math.floor(Math.random() * 32));
    return s;
  };

  /* ================================================================== champions */
  function championIdFor(opts) {
    var m = meta();
    var id = opts.championId;
    var map = (m.championIdMap) || {};
    if (id && map[id]) id = map[id];
    if (id && CC().champion(id)) return id;
    // placeholder ids like champion_alley_1 resolve by clan and slot order
    var mm = id && /^champion_([a-z]+)_(\d)$/.exec(id);
    var list = CC().champions().filter(function (c) { return c.clan === (mm ? mm[1] : opts.clan); });
    if (mm) return (list[parseInt(mm[2], 10) - 1] || list[0] || {}).id;
    return (list[0] || {}).id;
  }

  /* ================================================================== newRun */
  Run.newRun = function (opts) {
    opts = opts || {};
    var R = rules();
    var seed = Run.normalizeSeed(opts.seed) || (opts.seed ? String(opts.seed).toUpperCase().slice(0, 8) : Run.randomSeed());
    var clan = opts.clan || 'alley';
    var side = opts.side || (clan === 'alley' ? 'hearth' : 'alley');
    if (clan === side) throw new Error('side clan must differ from main clan');
    var champId = championIdFor({ championId: opts.championId, clan: clan });
    var champDef = CC().champion(champId);
    if (!champDef) throw new Error('no champion for ' + clan);
    if (champDef.clan !== clan) throw new Error('champion ' + champId + ' does not belong to clan ' + clan);
    var rank = Math.max(0, Math.min(10, opts.rank | 0));
    var rm = meta().cumulativeMods ? meta().cumulativeMods(rank) : {};

    var run = {
      v: VERSION, seed: seed, seedSource: opts.seedSource || (opts.seed ? 'typed' : 'random'),
      rng: { map: 0, reward: 0, shop: 0, event: 0, misc: 0 },
      clan: clan, side: side, championId: champId, giftId: null, rank: rank, tutorial: !!opts.tutorial,
      deck: [], relics: [], fish: R.fish_start || 60,
      maxWarmthBase: (R.warmth_max || 40) + (rm.maxWarmthDelta || 0), warmth: 0, maxWarmth: 0,
      act: 1, night: 0, nightsSurvived: 0,
      map: null, pos: null, status: 'map', flags: {}, stats: { best: {} }, omens: [], log: [],
      visited: [], history: [], bosses: {}, defeatedBosses: [],
      usedEvents: [], usedEncounters: [], usedElites: [], eventFightActs: {},
      pity: { rare: 0 }, offered: { relics: [] }, blockedRelics: [],
      mystery: { battleW: null, rolls: 0 },
      shopsSeen: 0, adopted: 0, removals: 0, litters: 0, tierUnlocked: 0, tiersTaken: 0,
      current: null, pending: null, nextUid: 0, startedAt: Date.now(), secondsBase: 0, outcome: null, killedBy: null
    };
    U.refreshMaxWarmth(run);
    run.warmth = run.maxWarmth;

    // relic gating from the profile (level locked relics) and rank 10 removals
    var prof = opts.profile;
    if (prof && meta().relicGates) {
      meta().relicGates.forEach(function (g) {
        if (!meta().isRelicAvailable(prof, g.id)) run.blockedRelics.push(g.id);
      });
    }
    (rm.removeRelics || []).forEach(function (id) { if (run.blockedRelics.indexOf(id) < 0) run.blockedRelics.push(id); });

    // starting deck
    var decks = SB.data.starterDecks;
    var list = (decks && decks.byChampion[champId] && decks.byChampion[champId][side]) || (decks && decks.build(champId, clan, side));
    list.forEach(function (id) { U.addCard(run, id, 'starter'); });

    // heirloom: the clan has two, the run starts with one
    var heirs = CC().relics().filter(function (r) { return r.rarity === 'starter' && r.clan === clan; });
    var heirId = opts.heirloom && heirs.some(function (h) { return h.id === opts.heirloom; }) ? opts.heirloom : (heirs[0] && heirs[0].id);
    if (heirId) U.giveRelic(run, heirId, 'heirloom');

    // cradle gift
    if (!rm.noCradleGift && opts.gift) Run.applyGift(run, opts.gift, opts.giftArgs || {});

    Run.generateMap(run);
    U.statMax(run, 'maxDeckSize', run.deck.length);
    if (!opts.noSave) Run.save(run);
    return run;
  };

  /* ---- cradle gifts (SB.data.meta.cradleGifts) ---- */
  Run.giftChoices = function (seed, profile) {
    var all = (meta().cradleGifts || []).filter(function (g) {
      if (!profile) return !g.unlock || g.unlock.type === 'start';
      return profile.unlocked.gifts.indexOf(g.id) >= 0 || !g.unlock || g.unlock.type === 'start';
    });
    var rng = Run.rngFor(seed, 'gift', 0);
    var pool = all.slice();
    rng.shuffle(pool);
    return pool.slice(0, 3).map(function (g) { return g.id; });
  };
  Run.applyGift = function (run, giftId, args) {
    var gift = (meta().cradleGifts || []).filter(function (g) { return g.id === giftId; })[0];
    if (!gift) return false;
    run.giftId = giftId;
    U.stat(run, 'cradleGifts', 1);
    var rng = U.rng(run, 'gift', giftId);
    gift.effects.forEach(function (e) {
      switch (e.type) {
        case 'gainFish': U.addFish(run, e.value, { pct: false }); break;
        case 'maxWarmth': U.raiseMaxWarmth(run, e.value, false); break;
        case 'healWarmth': U.heal(run, e.value); break;
        case 'upgradeStarterCard': {
          var targets = run.deck.filter(function (i) { return !U.isChampion(i) && i.origin === 'starter'; });
          var t = (args.uid && U.inst(run, args.uid)) || rng.pick(targets);
          if (t) t.plus = true;
          break;
        }
        case 'gainRelic': {
          var rid = SB.rewards.rollRelic(run, rng, 'event', e.rarity);
          if (rid) U.giveRelic(run, rid, 'gift');
          break;
        }
        case 'removeStarterCards': {
          var cands = run.deck.filter(function (i) { return !U.isChampion(i) && i.origin === 'starter'; });
          var chosen = [];
          if (args.uids) args.uids.forEach(function (u) { var x = U.inst(run, u); if (x && !U.isChampion(x)) chosen.push(x); });
          while (chosen.length < e.count && cands.length) {
            var pick = rng.pick(cands.filter(function (c) { return chosen.indexOf(c) < 0; }));
            if (!pick) break;
            chosen.push(pick);
          }
          chosen.slice(0, e.count).forEach(function (c) {
            if (run.deck.length > U.deckMin()) { U.removeInst(run, c.uid); U.addFish(run, e.fishEach, { pct: false }); }
          });
          break;
        }
        case 'startDeckLives':
          run.deck.forEach(function (c) { if (!U.isChampion(c) && U.isCat(c)) U.gainLives(run, c, e.value, true); });
          break;
        case 'firstShopDiscountPct': run.flags.firstShopDiscountPct = e.value; break;
        case 'addCard': for (var k = 0; k < (e.count || 1); k++) U.addCard(run, e.cardId, 'gift'); break;
        case 'startShade': run.flags.startShade = e.value; break;
        default: break;
      }
    });
    return true;
  };

  /* ================================================================== node helpers */
  function nightFor(node) {
    if (node.nightNo) return node.nightNo;
    var base = (node.act - 1) * 3;
    return base + (node.r <= 2 ? 1 : (node.r <= 5 ? 2 : 3));
  }
  Run.nightFor = nightFor;
  Run.hpScaleFor = function (nightNo) {
    return Math.round((1 + (rules().hp_scale_per_night || 0.05) * (nightNo - 1)) * 1000) / 1000;
  };
  function kindOf(node) {
    return node.type === 'battle' ? 'prowl' : node.type;
  }

  /* ---- omens (resolved effects so the battle engine does not need to know about doubling) ---- */
  Run.resolveOmen = function (omenId, doubled) {
    var o = (meta().omens || []).filter(function (x) { return x.id === omenId; })[0];
    if (!o) return null;
    var effects = o.effects.map(function (e) {
      var c = clone(e);
      if (doubled) {
        Object.keys(e).forEach(function (k) {
          if (k.indexOf('doubled') === 0) {
            var target = k === 'doubled' ? 'value' : k.charAt(7).toLowerCase() + k.slice(8);
            c[target] = e[k];
          }
        });
      }
      Object.keys(c).forEach(function (k) { if (k.indexOf('doubled') === 0) delete c[k]; });
      return c;
    });
    return { id: o.id, name: o.name, text: o.text, flavor: o.flavor, doubled: !!doubled, effects: effects };
  };

  /* ================================================================== encounters */
  function normPool(run, node, opts) {
    var act = run.act;
    return CC().pests().filter(function (p) {
      if (p.tier !== 'pest') return false;
      if (p.raw && (p.raw.tutorialOnly || p.raw.addOnly)) return false;
      if (/^pest_(add|rerun)_/.test(p.id)) return false;
      if (p.nightVisitor && !opts.visitors) return false;
      if (!(p.acts[0] <= act && act <= p.acts[1])) return false;
      if (opts.maxThreat && p.threat > opts.maxThreat) return false;
      return true;
    });
  }
  function spawnFloorOf(p) {
    var f = p.spawnFloor;
    return (typeof f === 'number' && f >= 1 && f <= 3) ? f : 1;
  }
  function fillWave(rng, pool, budget, counts, maxPests, sizeCap) {
    var picks = [], remaining = budget, size = 0, guard = 0;
    while (remaining > 0 && picks.length < maxPests && guard++ < 40) {
      var cands = pool.filter(function (p) { return p.threat <= remaining && size + p.size <= sizeCap; });
      if (!cands.length) break;
      var p = rng.weighted(cands, function (c) { return (1 + c.threat) / (1 + (counts[c.id] || 0) * 1.5); });
      if (!p) break;
      picks.push(p);
      counts[p.id] = (counts[p.id] || 0) + 1;
      remaining -= p.threat;
      size += p.size;
    }
    if (!picks.length && pool.length) {
      var cheapest = pool.slice().sort(function (a, b) { return a.threat - b.threat; })[0];
      picks.push(cheapest);
    }
    return picks;
  }
  function spawnsOf(picks) {
    return picks.map(function (p) { return { id: p.id, floor: spawnFloorOf(p), at: 'back' }; });
  }


  // C5's hand built encounters (SB.data.encounters / encounterRules). Null when unavailable, then the budget generator runs.
  function handBuilt(run, node, kind, nightNo, base, rng, rm) {
    var ER = SB.data && SB.data.encounterRules, EN = SB.data && SB.data.encounters;
    if (!ER || !EN || !ER.pick || !EN['act' + run.act]) return null;
    var ctx = {
      act: run.act, kind: kind, row: (node.r || 0) + 1, nightSlot: (node.r || 0) <= 2 ? 'A' : 'B', mystery: !!node.mystery,
      used: run.usedEncounters, rowPicked: [], recent: (run.recentEnc || []).slice(-2).reverse(), deckTags: {},
      rng: function () { return rng.next(); }
    };
    var picked = ER.pick(ctx);
    if (!picked) return null;
    var enc = ER.bind(picked, nightNo, { rank: run.rank, lookupPest: function (id) { return CC().pest(id); }, omen: base.omen });
    enc.type = kind; enc.act = run.act; enc.nightNo = nightNo; enc.nodeId = node.id; enc.hpScale = base.hpScale;
    enc.impatienceRound = base.impatienceRound; enc.rank = run.rank; enc.omen = base.omen; enc.source = 'handbuilt';
    if (kind === 'night' || kind === 'elite') enc.witching = true;
    if (node.soft) enc.soft = true;
    if (kind === 'elite') {
      enc.elite = true;
      enc.eliteId = picked.elite || null;
      if (rm.eliteExtraAffixes) enc.eliteExtraAffixes = rm.eliteExtraAffixes;
    }
    if (base.omen && base.omen.id === 'omen_quiet_house' && enc.waves.length) {
      var extra = rm.omenDouble ? 2 : 1;
      for (var q = 0; q < extra; q++) { var lw = enc.waves[enc.waves.length - 1]; enc.waves.push({ round: lw.round + 2, spawns: JSON.parse(JSON.stringify(lw.spawns)) }); }
    }
    if (base.omen && base.omen.id === 'omen_hunters_moon' && enc.waves.length) {
      var esc = rng.pick(normPool(run, node, {}).filter(function (p) { return p.size === 2; }));
      var cnt = rm.omenDouble ? 2 : 1;
      for (var z = 0; z < cnt && esc; z++) enc.waves[0].spawns.push({ id: esc.id, floor: spawnFloorOf(esc), at: 'back', escort: true });
    }
    run.usedEncounters.push(picked.id);
    run.recentEnc = (run.recentEnc || []).concat([{ archetype: picked.archetype, family: picked.family }]).slice(-4);
    return enc;
  }

  Run.encounterFor = function (run, node, kindIn) {
    var kind = kindIn || kindOf(node);
    var nightNo = nightFor(node);
    var rm = Run.rankMods(run);
    var R = rules();
    var a = Math.max(0, Math.min(2, run.act - 1));
    var base = {
      id: 'enc_gen_' + node.id, name: null, type: kind, act: run.act, nightNo: nightNo, nodeId: node.id,
      hpScale: Run.hpScaleFor(nightNo), impatienceRound: R.impatience_round || 16, rank: run.rank,
      omen: null, waves: [], budget: 0, source: 'generated'
    };
    // omen
    if (node.omen) {
      base.omen = Run.resolveOmen(node.omen, !!rm.omenDouble);
    }
    if (kind === 'boss') {
      var bossDef = CC().pest(node.bossId || run.bosses[run.act]);
      var enc = clone(bossDef.raw.encounter || { waves: [] });
      enc.type = 'boss'; enc.act = run.act; enc.nightNo = nightNo; enc.nodeId = node.id; enc.bossId = bossDef.id;
      enc.name = bossDef.name; enc.hpScale = base.hpScale; enc.rank = run.rank; enc.omen = base.omen; enc.source = 'boss';
      var n9 = SB.data.bossRules && SB.data.bossRules.night9;
      if (nightNo === 9 && n9 && n9.appendDawnTo && n9.appendDawnTo.indexOf(bossDef.id) >= 0) {
        enc.dawn = true;
        enc.dawnPhase = clone(SB.data.dawnPhaseTemplate);
      }
      if (rm.bossSecondPhaseMove) enc.bossSecondPhaseMove = true;
      enc.defeatedBosses = run.defeatedBosses.slice();
      enc.budget = (R.threat_boss || [45, 70, 100])[a];
      return enc;
    }
    var rng = U.rng(run, 'enc', node.id);
    var hand = handBuilt(run, node, kind, nightNo, base, rng, rm);
    if (hand) return hand;
    var pool = normPool(run, node, { maxThreat: node.soft ? 2 : null });
    var counts = {};
    var budget, shares, waveCount;
    if (kind === 'night') { budget = (R.threat_night || [20, 32, 46])[a]; shares = [0.2, 0.25, 0.3, 0.25]; }
    else if (kind === 'elite') { budget = (R.threat_elite || [28, 42, 60])[a]; shares = [0.2, 0.2, 0.3, 0.3]; }
    else { budget = (R.threat_prowl || [12, 20, 30])[a]; shares = [0.3, 0.4, 0.3]; }
    if (node.soft) budget = R.threat_soft_open || 8;
    // Quiet House: one extra wave (two when doubled)
    if (base.omen && base.omen.id === 'omen_quiet_house') {
      var extra = rm.omenDouble ? 2 : 1;
      for (var q = 0; q < extra; q++) shares.push(shares[shares.length - 1]);
    }
    var eliteDef = null;
    if (kind === 'elite') {
      var ids = CC().eliteIdsByAct(run.act).filter(function (id) { return run.usedElites.indexOf(id) < 0; });
      if (!ids.length) ids = CC().eliteIdsByAct(run.act);
      var eid = rng.pick(ids);
      eliteDef = CC().pest(eid);
      base.eliteId = eid;
      base.elite = true;
      budget = Math.max(6, budget - eliteDef.threat);
      if (rm.eliteExtraAffixes) base.eliteExtraAffixes = rm.eliteExtraAffixes;
    }
    base.budget = budget;
    var sum = shares.reduce(function (s, x) { return s + x; }, 0);
    var sizeCap = 7;
    shares.forEach(function (sh, i) {
      var wb = Math.max(1, Math.round(budget * sh / sum));
      var picks = fillWave(rng, pool, wb, counts, 8, sizeCap);
      var sp = spawnsOf(picks);
      if (i === 0 && kind === 'prowl' && rm.prowlWave1ExtraPests) {
        for (var e = 0; e < rm.prowlWave1ExtraPests; e++) {
          var cheap = rng.pick(pool.filter(function (p) { return p.threat <= 2; })) || pool[0];
          if (cheap) sp.push({ id: cheap.id, floor: spawnFloorOf(cheap), at: 'back' });
        }
      }
      if (i === 1 && eliteDef) sp.unshift({ id: eliteDef.id, floor: spawnFloorOf(eliteDef), at: 'back', elite: true });
      if (i === 0 && base.omen && base.omen.id === 'omen_hunters_moon') {
        var esc = rng.pick(normPool(run, node, {}).filter(function (p) { return p.size === 2; }));
        var cnt = rm.omenDouble ? 2 : 1;
        for (var z = 0; z < cnt && esc; z++) sp.push({ id: esc.id, floor: spawnFloorOf(esc), at: 'back', escort: true });
      }
      base.waves.push({ round: 1 + i * 2, share: sh, spawns: sp });
    });
    base.name = eliteDef ? eliteDef.name : (kind === 'night' ? 'Night ' + nightNo : 'Prowl');
    if (kind === 'night' || kind === 'elite') base.witching = true;
    if (node.soft) base.soft = true;
    return base;
  };

  // event fights name an encounter id (enc_evt_*); fall back to a generated prowl when content lacks the id
  Run.eventEncounter = function (run, encId, tier, nodeId) {
    var def = CC().encounter(encId);
    var nightNo = nightFor({ act: run.act, r: 3, id: nodeId || 'evt' });
    var enc;
    if (def) {
      enc = clone(def);
      enc.type = tier === 'elite' ? 'elite' : 'prowl';
      enc.hpScale = Run.hpScaleFor(nightNo);
      enc.nightNo = nightNo;
      enc.act = run.act;
      enc.rank = run.rank;
      enc.source = 'event';
    } else {
      enc = Run.encounterFor(run, { id: encId, act: run.act, r: 3, type: tier === 'elite' ? 'elite' : 'battle' }, tier === 'elite' ? 'elite' : 'prowl');
      enc.id = encId;
    }
    return enc;
  };

  /* ================================================================== node entry */
  function recentTypes(run, n) {
    return run.history.slice(-n).map(function (h) { return h.type; });
  }
  Run.mysteryWeights = function (run) {
    var a = Math.max(0, Math.min(2, run.act - 1));
    var battleW = run.mystery.battleW != null ? run.mystery.battleW : [36, 30, 28][a];
    var w = {
      event: [40, 38, 36][a], battle: battleW, treasure: 8,
      shop: recentTypes(run, 2).indexOf('shop') >= 0 ? 0 : 8, nook: 8,
      elite: (run.act >= 2 && run.warmth > run.maxWarmth * 0.5) ? [0, 8, 12][a] : 0
    };
    return w;
  };
  function resolveMystery(run, node) {
    var rng = U.rng(run, 'mystery', node.id);
    var w = Run.mysteryWeights(run);
    var keys = Object.keys(w);
    var pick = rng.weighted(keys, function (k) { return w[k]; });
    if (pick === 'battle') run.mystery.battleW = Math.max(12, w.battle - 12);
    else run.mystery.battleW = Math.min(50, w.battle + 6);
    run.mystery.rolls++;
    return pick;
  }

  Run.enterNode = function (run, nodeId) {
    if (run.status === 'over') throw new Error('run is over');
    if (run.status !== 'map') throw new Error('finish the current node first (' + run.status + ')');
    var avail = Run.availableNodes(run);
    if (avail.indexOf(nodeId) < 0) throw new Error('node ' + nodeId + ' is not reachable');
    var node = run.map.nodes[nodeId];
    run.pos = nodeId;
    run.visited.push(nodeId);
    var type = node.type, mystery = false;
    if (type === 'mystery') {
      mystery = true;
      var res = resolveMystery(run, node);
      type = res === 'battle' ? 'battle' : res;   // battle, event, treasure, shop, nook, elite
    }
    run.history.push({ nodeId: nodeId, type: type, act: run.act, mystery: mystery });
    run.current = { nodeId: nodeId, type: type, mystery: mystery, startWarmth: run.warmth, startFish: run.fish, entered: run.visited.length };
    var out;
    switch (type) {
      case 'battle': case 'night': case 'elite': case 'boss':
        out = enterBattle(run, node, type, mystery);
        break;
      case 'shop':
        run.status = 'shop';
        out = { type: 'shop', payload: SB.shop.open(run) };
        break;
      case 'event': {
        run.status = 'event';
        var ev = SB.event.pick(run);
        run.current.eventId = ev ? ev.id : null;
        U.stat(run, 'eventsSeen', 1);
        out = { type: 'event', payload: { event: ev } };
        break;
      }
      case 'post':
        run.status = 'post';
        out = { type: 'post', payload: SB.post.open(run) };
        break;
      case 'nook':
        run.status = 'nook';
        out = { type: 'nook', payload: SB.nook.open(run) };
        break;
      case 'treasure': {
        run.status = 'treasure';
        var rng = U.rng(run, 'loot', nodeId + ':treasure');
        run.current.relic = SB.rewards.rollRelic(run, rng, 'treasure');
        out = { type: 'treasure', payload: { relic: null, canOpen: !!run.current.relic, sitHealPct: rules().treasure_sit_heal_pct || 20, sitFish: rules().treasure_sit_fish || 15, node: node } };
        break;
      }
      default:
        throw new Error('unknown node type ' + type);
    }
    out.node = node;
    if (mystery) { out.payload = out.payload || {}; out.payload.fromMystery = true; out.payload.revealed = type; }
    if (!run.noAutosave) Run.save(run);
    return out;
  };

  function enterBattle(run, node, type, mystery) {
    var kind = type === 'battle' ? 'prowl' : type;
    var useNode = node;
    if (mystery) {
      // a mystery that became a battle or elite behaves like a free row node of that kind
      useNode = clone(node);
      useNode.type = type;
      useNode.omen = null;
      useNode.mystery = true;
    }
    var enc = Run.encounterFor(run, useNode, kind);
    var rewards = SB.rewards.rollForNode(run, useNode, { kind: kind, mystery: mystery && kind === 'prowl' });
    U.stat(run, 'draftsSeen', 1);
    if (kind === 'elite') run.usedElites.push(enc.eliteId);
    if (enc.omen) run.omens.push({ id: enc.omen.id, survived: false, nodeId: node.id });
    run.status = 'battle';
    run.current.kind = kind;
    run.current.encounter = enc;
    run.current.rewards = rewards;
    run.current.nightNo = useNode.nightNo || null;
    run.current.hpScale = enc.hpScale;
    run.pending = null;
    return {
      type: kind === 'prowl' ? 'battle' : kind,
      payload: { kind: kind, encounter: enc, node: node, mystery: mystery, startWarmth: run.warmth, omen: enc.omen,
        seed: Run.battleSeed(run, node.id) }
    };
  }
  // the seed C1's battle should use: rngFor(seed, 'battle', nodeId) per RULES. Returned as the string so battle can hash it itself.
  Run.battleSeed = function (run, nodeId) { return run.seed + ':battle:' + nodeId; };

  /* ================================================================== growth (mastery, evolution) */
  function masteryThresholds(run, inst, def) {
    var base = (def && def.type === 'champion') ? (rules().mastery_thresholds_champion || [4, 9, 15]) : (rules().mastery_thresholds || [3, 7, 12]);
    var delta = Run.mod(run, 'masteryThresholdDelta');
    delta = typeof delta === 'number' ? delta : 0;
    var fast = (inst.scratches || []).some(function (s) { var u = CC().upgrade(s); return u && u.effects && u.effects.some(function (e) { return e.op === 'setFlag' && e.flag === 'fastLearner'; }); });
    if (fast) delta -= 1;
    return base.map(function (t) { return Math.max(2, t + delta); });
  }
  Run.masteryThresholds = masteryThresholds;
  function masteryText(def, rank) {
    var t = def.type === 'champion' ? 'unit' : def.type;
    if (rank === 1) return t === 'unit' ? '+1 Attack' : (t === 'spell' ? '+1 value' : '+1 charge');
    if (rank === 2) return t === 'unit' ? '+3 Health' : '+1 value';
    return 'Named Mastery bonus unlocked';
  }
  function evoChainOf(cardId) {
    var evo = CC().evolution(cardId);
    if (!evo) return null;
    var idx = -1;
    evo.stages.forEach(function (s, i) { if (s.id === cardId) idx = i; });
    return { evo: evo, index: idx };
  }
  Run.growthNeeded = function (run, evo) {
    var base = evo.growthNeeded || rules().growth_per_stage || 3;
    var b = Run.mod(run, 'birthThreshold');
    return (typeof b === 'number' && b > 0) ? Math.min(base, b) : base;
  };
  Run.questDone = function (inst, quest) {
    if (!quest) return true;
    var c = (inst.quest && inst.quest[quest.check.counter]) || 0;
    return c >= quest.check.n;
  };

  function applyGrowth(run, result) {
    var report = [];
    var st = (result && result.stats) || {};
    var plays = st.plays || st.playsByUid || result.playsByUid || {};
    var cap = rules().mastery_plays_counted_per_fight || 3;
    var extra = Run.mod(run, 'masteryExtraPlay');
    extra = typeof extra === 'number' ? extra : 0;
    // battle supplied lines (kneading, growth counters) pass straight through
    (result.growth || []).forEach(function (g) {
      if (typeof g === 'string') report.push({ kind: 'battle', text: g });
      else report.push(Object.assign({ kind: g.kind || 'battle' }, g));
    });
    var applied = !!(result && result.growthApplied);
    run.deck.forEach(function (inst) {
      var def = U.def(inst);
      if (!def) return;
      var n = plays[inst.uid] || 0;
      if (n > 0 && !applied) {
        var counted = Math.min(cap, n) + (extra ? extra : 0);
        var beforeRank = inst.masteryRank || 0;
        inst.plays = (inst.plays || 0) + counted;
        var th = masteryThresholds(run, inst, def);
        var rank = 0;
        for (var i = 0; i < th.length; i++) if (inst.plays >= th[i]) rank = i + 1;
        inst.masteryRank = Math.max(beforeRank, rank);
        if (inst.masteryRank > beforeRank) {
          for (var rr = beforeRank + 1; rr <= inst.masteryRank; rr++) {
            report.push({ kind: 'mastery', uid: inst.uid, cardId: inst.id, name: def.name, rank: rr, text: def.name + ' reached Mastery ' + rr + ': ' + masteryText(def, rr) + '.' });
          }
        } else {
          var nextT = th[Math.min(2, beforeRank)];
          if (beforeRank < 3) report.push({ kind: 'plays', uid: inst.uid, cardId: inst.id, name: def.name, text: def.name + ' played ' + counted + (counted === 1 ? ' time' : ' times') + ' (' + inst.plays + '/' + nextT + ' toward Mastery ' + (beforeRank + 1) + ').' });
        }
        // evolution growth: one point per fight in which the card was played
        var ch = evoChainOf(inst.id);
        if (ch && ch.index < ch.evo.stages.length - 1) {
          var need = Run.growthNeeded(run, ch.evo);
          var before = inst.growthFights || 0;
          inst.growthFights = Math.min(need, before + 1);
          if (inst.growthFights > before) {
            var ready = inst.growthFights >= need;
            report.push({ kind: 'evolution', uid: inst.uid, cardId: inst.id, name: def.name, text: def.name + ' Growth ' + inst.growthFights + '/' + need + (ready ? '. Ready for a Growth Spurt!' : '.') });
          }
        }
      }
    });
    // quest counters supplied by the battle: { uid: { counterName: n } }
    var q = st.quest || result.quest || {};
    Object.keys(q).forEach(function (uid) {
      var inst = U.inst(run, uid);
      if (!inst) return;
      inst.quest = inst.quest || {};
      Object.keys(q[uid]).forEach(function (k) { inst.quest[k] = (inst.quest[k] || 0) + q[uid][k]; });
    });
    return report;
  }
  Run.applyGrowth = applyGrowth;

  // Sweep: cats at 0 lives are lost for good (Empty Collar) and champions sit out until the next Act.
  Run.normalizeLives = function (run) {
    var lost = [];
    for (var i = run.deck.length - 1; i >= 0; i--) {
      var inst = run.deck[i];
      if (!U.isCat(inst)) continue;
      if (inst.lives > 0) continue;
      if (U.isChampion(inst)) { inst.sitOut = true; inst.lives = 0; lost.push({ uid: inst.uid, id: inst.id, champion: true }); continue; }
      var d = U.def(inst);
      run.deck.splice(i, 1);
      var collar = U.makeInst(run, 'token_empty_collar', 'collar');
      collar.maxLives = 1; collar.lives = 1;
      run.deck.splice(i, 0, collar);
      lost.push({ uid: inst.uid, id: inst.id, name: d && d.name });
    }
    return lost;
  };

  /* ================================================================== battle result */
  function absorbStats(run, st) {
    var cat = (meta().statsCatalog || []);
    cat.forEach(function (s) {
      var v = st[s.key];
      if (typeof v !== 'number') return;
      if (s.kind === 'sum') {
        if (['runsStarted', 'runsWon', 'runsLost', 'runsRetired', 'fishEarned', 'fishSpent', 'warmthLost', 'warmthHealed', 'eventsSeen', 'shopVisits', 'upgrades', 'battlesWon', 'elitesBeaten', 'bossesBeaten', 'nightsSurvived', 'cleanNights'].indexOf(s.key) >= 0) return;
        U.stat(run, s.key, v);
      } else U.statMax(run, s.key, v);
    });
  }

  Run.finishBattle = function (run, result) {
    if (run.status !== 'battle' || !run.current) throw new Error('no battle in progress');
    result = result || { outcome: 'win' };
    var cur = run.current;
    var st = result.stats || {};
    // sync Warmth with the battle
    var endW = typeof result.warmth === 'number' ? result.warmth : (result.sunbeam && typeof result.sunbeam.warmth === 'number' ? result.sunbeam.warmth : (typeof st.warmthEnd === 'number' ? st.warmthEnd : null));
    if (endW !== null) run.warmth = clamp(Math.round(endW), 0, run.maxWarmth);
    var lostW = typeof st.warmthLost === 'number' ? st.warmthLost : Math.max(0, cur.startWarmth - run.warmth);
    if (lostW > 0) { U.stat(run, 'warmthLost', lostW); U.statMin(run, 'lowestWarmth', run.warmth); }
    absorbStats(run, st);
    Run.normalizeLives(run);

    if (result.outcome !== 'win') {
      if (run.warmth <= 0) {
        var ll = Run.tryLastLife(run);
        if (ll.saved) {
          // the battle engine normally handles this mid fight; if it reached us anyway the fight is still lost
          run.warmth = 0;
        }
      }
      run.status = 'over';
      run.outcome = 'lost';
      run.killedBy = result.killedBy || st.killedBy || null;
      run.killedAt = { nodeId: cur.nodeId, act: run.act, round: st.round || null, floor: st.floor || null };
      run.current = null;
      if (!run.noAutosave) Run.clearSave();
      return { defeat: true, killedBy: run.killedBy, summary: Run.summary(run, 'lost') };
    }

    var kind = cur.kind, rew = cur.rewards || {};
    var node = run.map.nodes[cur.nodeId];
    var clean = lostW === 0;
    U.stat(run, 'battlesWon', 1);
    if (kind === 'elite') U.stat(run, 'elitesBeaten', 1);
    if (kind === 'boss') { U.stat(run, 'bossesBeaten', 1); run.defeatedBosses.push(node.bossId || run.bosses[run.act]); }
    if (cur.nightNo || node.nightNo) {
      run.nightsSurvived = Math.max(run.nightsSurvived, nightFor(node));
      run.night = run.nightsSurvived;
      U.stat(run, 'nightsSurvived', 1);
    }
    run.omens.forEach(function (o) { if (o.nodeId === cur.nodeId) o.survived = true; });

    var payload = {
      nodeId: cur.nodeId, kind: kind, nightNo: cur.nightNo || null, act: run.act,
      fish: 0, fishLines: [], cardChoices: [], skipFish: 0, growthReport: [], heal: 0, healLines: [],
      boss: kind === 'boss'
    };

    // fish
    var fishAmt = rew.fish || 0;
    var got = U.addFish(run, fishAmt);
    payload.fishLines.push({ label: kind === 'boss' ? 'Boss spoils' : (kind === 'elite' ? 'Elite spoils' : 'Winnings'), amount: got });
    if (cur.mystery && kind === 'prowl') payload.fishLines.push({ label: 'Surprise tax included', amount: 0 });
    if (clean) {
      var cn = rules();
      var cf = U.addFish(run, cn.clean_night_fish || 8);
      payload.fishLines.push({ label: 'Clean Night', amount: cf });
      var ch = U.heal(run, cn.clean_night_heal || 3);
      payload.heal += ch; payload.healLines.push({ label: 'Clean Night', amount: ch });
      U.stat(run, 'cleanNights', 1);
      got += cf;
    }
    var rm = Run.rankMods(run);
    if (node.nightNo && (node.nightNo - 1) % 3 === 0 && kind === 'night' && !rm.noDawnRest) {
      var dh = U.heal(run, rules().dawn_rest_heal || 4);
      payload.heal += dh; payload.healLines.push({ label: 'Dawn Rest', amount: dh });
    }
    // postcards from adopted cats
    if (run.adopted > 0) {
      var per = Run.mod(run, 'postcardFish');
      per = (typeof per === 'number' && per) ? per : (rules().postcard_fish_per_card || 2);
      var pc = Math.min(rules().postcard_cap_per_fight || 12, run.adopted * per);
      var pg = U.addFish(run, pc, { pct: false });
      payload.fishLines.push({ label: 'Postcards', amount: pg });
      got += pg;
    }
    // boss: heal, max warmth
    if (kind === 'boss') {
      var bossDef = CC().pest(node.bossId || run.bosses[run.act]);
      var rw = (bossDef && bossDef.rewards) || {};
      var hp = U.heal(run, Math.round(run.maxWarmth * (rw.healPct != null ? rw.healPct : (rules().boss_heal_pct || 40) / 100)));
      payload.heal += hp; payload.healLines.push({ label: 'Victory warmth', amount: hp });
      var bonus = rw.maxWarmthBonus != null ? rw.maxWarmthBonus : ((rules().warmth_max_after_boss || [])[run.act - 1] ? 5 : 0);
      if (run.act >= 3) bonus = rw.maxWarmthBonus != null ? rw.maxWarmthBonus : 0;
      if (bonus) { U.raiseMaxWarmth(run, bonus, true); payload.maxWarmthGain = bonus; }
      if (run.act >= 3 || (bossDef && bossDef.tier === 'final')) payload.victory = nightFor(node) >= 9;
      payload.bossName = bossDef && bossDef.name;
    }
    payload.fish = got;

    // relic hooks at fight end
    var hookCtx = { fightType: kind === 'prowl' ? 'battle' : kind };
    var fe = U.runHooks(run, 'onFightEnd', hookCtx);
    if (fe.length) payload.relicTriggers = fe;

    // growth
    payload.growthReport = applyGrowth(run, result);

    // offers
    if (rew.draft) { payload.cardChoices = rew.draft.ids.slice(); payload.skipFish = rew.draft.skipFish; payload.bigDraft = !!rew.draft.big; }
    if (rew.relic) payload.relicChoices = rew.relic.choices.slice();
    if (rew.relic) payload.relicForced = !!rew.relic.forced;
    if (rew.charm) payload.clanReward = { charmChoices: rew.charm.choices.slice(), pick: 1, of: rew.charm.of };
    // champion upgrade on Nights 2, 5 and 8
    var nn = node.nightNo || cur.nightNo;
    if (nn && [2, 5, 8].indexOf(nn) >= 0 && kind !== 'boss') {
      var tier = (nn + 1) / 3;
      run.tierUnlocked = Math.max(run.tierUnlocked, tier);
    }
    var champ = U.champion(run);
    if (champ && run.tiersTaken < run.tierUnlocked && run.tiersTaken < 3 && nn && [2, 5, 8].indexOf(nn) >= 0) {
      payload.championUpgrade = { tier: run.tiersTaken + 1, options: Run.championOptions(run, run.tiersTaken + 1) };
    }
    payload.state = { warmth: run.warmth, maxWarmth: run.maxWarmth, fish: run.fish };

    run.pending = {
      payload: payload, cardDone: !payload.cardChoices.length, relicDone: !payload.relicChoices, charmDone: !payload.clanReward,
      championDone: !payload.championUpgrade, eventFight: !!cur.eventFight, boss: kind === 'boss', node: cur.nodeId
    };
    run.status = 'reward';
    run.current = null;
    if (!run.noAutosave) Run.save(run);
    return payload;
  };

  /* ================================================================== reward claims */
  Run.pickCard = function (run, cardId) {
    var p = run.pending;
    if (!p || run.status !== 'reward') throw new Error('no rewards pending');
    if (p.cardDone) return { ok: false, reason: 'already resolved' };
    if (cardId === null || cardId === undefined) {
      var f = U.addFish(run, p.payload.skipFish || 6, { pct: false });
      U.stat(run, 'cardsSkipped', 1);
      p.cardDone = true;
      return { ok: true, skipped: true, fish: f };
    }
    if (p.payload.cardChoices.indexOf(cardId) < 0) return { ok: false, reason: 'not on offer' };
    var inst = U.addCard(run, cardId, 'draft');
    p.cardDone = true;
    return { ok: true, uid: inst.uid, card: cardId };
  };
  Run.pickRelic = function (run, relicId) {
    var p = run.pending;
    if (!p || run.status !== 'reward') throw new Error('no rewards pending');
    if (p.relicDone) return { ok: false, reason: 'already resolved' };
    if (relicId === null || relicId === undefined) { p.relicDone = true; return { ok: true, skipped: true }; }
    if (!p.payload.relicChoices || p.payload.relicChoices.indexOf(relicId) < 0) return { ok: false, reason: 'not on offer' };
    var def = U.giveRelic(run, relicId, p.boss ? 'boss' : 'reward');
    p.relicDone = true;
    return { ok: true, relic: def };
  };
  Run.pickCharm = function (run, charmId, targetUid) {
    var p = run.pending;
    if (!p || run.status !== 'reward') throw new Error('no rewards pending');
    if (p.charmDone) return { ok: false, reason: 'already resolved' };
    if (charmId === null || charmId === undefined) { p.charmDone = true; return { ok: true, skipped: true }; }
    if (!p.payload.clanReward || p.payload.clanReward.charmChoices.indexOf(charmId) < 0) return { ok: false, reason: 'not on offer' };
    var r = Run.applyCharm(run, charmId, targetUid);
    if (r.ok) p.charmDone = true;
    return r;
  };
  Run.applyCharm = function (run, charmId, uid) {
    var charm = SB.rewards.charmDef(charmId);
    var inst = U.inst(run, uid);
    if (!charm || !inst) return { ok: false, reason: 'unknown charm or card' };
    if (!SB.rewards.charmFits(inst, charm)) return { ok: false, reason: 'That charm does not fit this card.' };
    var replaced = inst.charm || null;
    inst.charm = charmId;
    return { ok: true, replaced: replaced };
  };
  Run.claimChampionUpgrade = function (run, optionId) {
    var p = run.pending;
    if (!p || run.status !== 'reward') throw new Error('no rewards pending');
    if (p.championDone) return { ok: false, reason: 'already resolved' };
    if (optionId === null || optionId === undefined) { p.championDone = true; return { ok: true, skipped: true }; }
    var r = Run.championUpgrade(run, p.payload.championUpgrade.tier, optionId);
    if (r.ok) p.championDone = true;
    return r;
  };
  Run.skip = function (run, what) {
    var p = run.pending;
    if (!p) return { ok: false };
    if (what === 'card') return Run.pickCard(run, null);
    if (what === 'relic') return Run.pickRelic(run, null);
    if (what === 'charm') return Run.pickCharm(run, null);
    if (what === 'champion') return Run.claimChampionUpgrade(run, null);
    return { ok: false };
  };
  Run.rewardsPending = function (run) {
    var p = run.pending;
    if (!p) return [];
    var out = [];
    if (!p.cardDone) out.push('card');
    if (!p.relicDone) out.push('relic');
    if (!p.charmDone) out.push('charm');
    if (!p.championDone) out.push('champion');
    return out;
  };
  // Leave the reward screen. Card draft must be resolved; the rest may be left (skipped).
  Run.proceed = function (run) {
    if (run.status !== 'reward' || !run.pending) throw new Error('nothing to proceed from');
    var p = run.pending;
    if (!p.cardDone) throw new Error('resolve the card draft first');
    var boss = p.boss;
    var victory = !!(p.payload && p.payload.victory);
    run.pending = null;
    if (boss) {
      if (victory) {
        run.status = 'over';
        run.outcome = 'won';
        if (!run.noAutosave) Run.clearSave();
        return { next: 'victory', summary: Run.summary(run, 'won') };
      }
      return Run.startAct(run, run.act + 1);
    }
    run.status = 'map';
    if (!run.noAutosave) Run.save(run);
    return { next: 'map' };
  };

  /* ================================================================== acts */
  Run.startAct = function (run, act) {
    var R = rules();
    var info = { next: 'act', act: act, lines: [] };
    run.act = act;
    // Fridge Rule
    var fr = [R.fish_fridge_threshold || 120, R.fish_fridge_rate || 0.15];
    if ((R.fish_fridge_acts || [2, 3]).indexOf(act) >= 0 && run.fish > fr[0]) {
      var lost = Math.ceil((run.fish - fr[0]) * fr[1]);
      run.fish -= lost;
      U.stat(run, 'fridgeLosses', lost);
      info.fridgeLoss = lost;
      info.lines.push("The fish in your pocket have made themselves known. Gerald's cousin collects " + lost + ' Fish for dignity.');
    }
    // +1 life to every cat, champions return from sitting out with 3
    U.cats(run).forEach(function (c) {
      if (c.sitOut) { c.sitOut = false; c.lives = R.champion_long_nap_return_lives || 3; if (c.maxLives < c.lives) c.maxLives = c.lives; return; }
      c.lives = Math.min(c.maxLives, c.lives + (R.lives_act_start_gain || 1));
    });
    // Whittle Kit: +1 scratch slot on every card, max 3 total
    var wk = Run.mod(run, 'whittleSlotsPerAct');
    if (typeof wk === 'number' && wk > 0) {
      run.deck.forEach(function (c) {
        if (SB.post && SB.post.slotsOf && SB.post.slotsOf(run, c) < (R.scratch_slots_cap || 3)) c.slotBonus = (c.slotBonus || 0) + wk;
      });
    }
    U.runHooks(run, 'onActStart', {});
    run.map = null;
    Run.generateMap(run);
    run.status = 'map';
    run.flags.eventFightThisAct = false;
    if (!run.noAutosave) Run.save(run);
    return info;
  };

  /* ================================================================== treasure */
  Run.treasure = function (run, choice) {
    if (run.status !== 'treasure' || !run.current) throw new Error('no treasure open');
    var out;
    if (choice === 'open') {
      var id = run.current.relic;
      var def = id ? U.giveRelic(run, id, 'treasure') : null;
      U.stat(run, 'treasuresOpened', 1);
      out = { ok: true, relic: def };
    } else {
      var R = rules();
      var h = U.heal(run, Math.round(run.maxWarmth * (R.treasure_sit_heal_pct || 20) / 100));
      var f = U.addFish(run, R.treasure_sit_fish || 15);
      U.stat(run, 'boxSits', 1);
      out = { ok: true, healed: h, fish: f, text: 'The box is warm. The relic can wait.' };
    }
    return out;
  };

  /* ================================================================== leaving non battle nodes */
  Run.leaveNode = function (run) {
    if (['shop', 'event', 'post', 'nook', 'treasure'].indexOf(run.status) < 0) throw new Error('not in a node (' + run.status + ')');
    if (run.status === 'event' && run.current && run.current.eventPending && run.current.eventPending.length) throw new Error('resolve the event first');
    run.current = null;
    run.status = 'map';
    if (!run.noAutosave) Run.save(run);
    return { next: 'map' };
  };
  // event fight: the event engine calls this to turn the node into a battle
  Run.startEventFight = function (run, fight) {
    var enc = Run.eventEncounter(run, fight.encounter, fight.tier, run.current.nodeId);
    var node = run.map.nodes[run.current.nodeId];
    var rewards = SB.rewards.rollForNode(run, node, { kind: fight.tier === 'elite' ? 'elite' : 'prowl', event: fight.rewards || {} });
    run.status = 'battle';
    run.current.kind = fight.tier === 'elite' ? 'elite' : 'prowl';
    run.current.encounter = enc;
    run.current.rewards = rewards;
    run.current.eventFight = true;
    run.current.startWarmth = run.warmth;
    run.current.nightNo = null;
    run.flags.eventFightActs = run.flags.eventFightActs || {};
    run.flags.eventFightActs[run.act] = true;
    if (!run.noAutosave) Run.save(run);
    return { type: fight.tier === 'elite' ? 'elite' : 'battle', payload: { kind: run.current.kind, encounter: enc, node: node, eventFight: true, startWarmth: run.warmth, omen: null } };
  };

  /* ================================================================== champion tiers */
  function normOption(o, pathKey, slot, champId) {
    var path = String(o.path || pathKey || '').toUpperCase();
    return Object.assign({}, o, { path: path, tier: slot.slot || slot.tier });
  }
  // Normalised options for a tier: [{id, path, name, text, flavor, art, ops|patch, tier}]
  Run.championOptions = function (run, tier) {
    var champ = U.champion(run);
    if (!champ) return [];
    var def = U.def(champ);
    var slot = (def.upgradeSlots || [])[tier - 1];
    if (!slot) return [];
    var opts = [];
    if (slot.options) slot.options.forEach(function (o) { opts.push(normOption(o, null, slot)); });
    else ['a', 'b', 'c'].forEach(function (k) { if (slot[k]) opts.push(normOption(slot[k], k, slot)); });
    return opts;
  };
  Run.championState = function (run) {
    var champ = U.champion(run);
    if (!champ) return null;
    var def = U.def(champ);
    var ids = (champ.champion && champ.champion.tiers) || [];
    var picked = ids.map(function (id, i) {
      var opts = Run.championOptions(run, i + 1);
      return opts.filter(function (o) { return o.id === id; })[0] || null;
    });
    var paths = picked.map(function (o) { return o && o.path; });
    var pure = ids.length === 3 && paths[0] && paths[0] === paths[1] && paths[1] === paths[2];
    var finalForm = null;
    if (pure && def.finalForms) finalForm = def.finalForms[paths[0]] || def.finalForms[paths[0].toLowerCase()] || null;
    return { championUid: champ.uid, championId: champ.id, picked: picked, paths: paths, pure: !!pure, finalForm: finalForm };
  };
  Run.championUpgrade = function (run, tier, optionId) {
    var champ = U.champion(run);
    if (!champ) return { ok: false, reason: 'No champion.' };
    champ.champion = champ.champion || { tiers: [] };
    if (tier !== champ.champion.tiers.length + 1) return { ok: false, reason: 'Take the tiers in order.' };
    if (tier > run.tierUnlocked) return { ok: false, reason: 'That tier is not unlocked yet.' };
    var opt = Run.championOptions(run, tier).filter(function (o) { return o.id === optionId; })[0];
    if (!opt) return { ok: false, reason: 'No such option.' };
    champ.champion.tiers.push(optionId);
    run.tiersTaken = champ.champion.tiers.length;
    var st = Run.championState(run);
    champ.champion.paths = st.paths;
    champ.champion.finalForm = st.finalForm ? st.finalForm.id : null;
    champ.champion.pure = st.pure;
    U.stat(run, 'upgrades', 1);
    U.log(run, 'Champion tier ' + tier + ': ' + opt.name);
    return { ok: true, option: opt, finalForm: st.finalForm || null, state: st };
  };

  /* ================================================================== save / load */
  function store() {
    try { return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : (root.localStorage || null); } catch (e) { return null; }
  }
  Run.lastError = null;
  Run.save = function (run) {
    try {
      var s = store();
      if (!s) return false;
      run.savedAt = Date.now();
      run.secondsBase = Run.elapsed(run);
      run.startedAt = Date.now();
      s.setItem(SAVE_KEY, JSON.stringify(run));
      return true;
    } catch (e) { Run.lastError = { code: 'save', message: String(e && e.message || e) }; return false; }
  };
  Run.load = function () {
    Run.lastError = null;
    var raw = null;
    try {
      var s = store();
      if (!s) return null;
      raw = s.getItem(SAVE_KEY);
      if (!raw) return null;
      var run = JSON.parse(raw);
      if (!run || run.v !== VERSION || !run.seed || !Array.isArray(run.deck) || !run.map || !run.map.nodes || !Array.isArray(run.relics)) throw new Error('shape');
      run.startedAt = Date.now();
      return run;
    } catch (e) {
      Run.lastError = { code: 'corrupt', message: 'The cat knocked this one off the shelf', raw: raw };
      return null;
    }
  };
  Run.hasSave = function () {
    try { var s = store(); return !!(s && s.getItem(SAVE_KEY)); } catch (e) { return false; }
  };
  Run.clearSave = function () {
    try { var s = store(); if (s) s.removeItem(SAVE_KEY); return true; } catch (e) { return false; }
  };
  Run.elapsed = function (run) { return (run.secondsBase || 0) + Math.max(0, Math.round((Date.now() - (run.startedAt || Date.now())) / 1000)); };
  // battle snapshot at a turn start (C1's B.serialize()); stored with the run
  Run.saveBattle = function (run, snapshot) { run.battle = snapshot || null; if (!run.noAutosave) Run.save(run); };

  /* ================================================================== summary */
  var FLAVOR = {
    won: ['The Sunbeam holds. The cushion is warm. Nobody will mention the vase.', 'Nine lives, one cushion, zero regrets.', 'Dawn arrives. The cats pretend they planned it.'],
    lost: ['The cushion is cold. Someone will have to warm it up again.', 'The Sunbeam winks out. The cats file a complaint.', 'It was a good house. It will be again.'],
    retired: ['Went for a nap. The house can wait.']
  };
  Run.summary = function (run, outcome) {
    outcome = outcome || run.outcome || 'lost';
    var won = outcome === 'won';
    var rng = U.rng(run, 'misc', 'summary');
    var champ = U.champion(run);
    var cs = Run.championState(run);
    var killed = run.killedBy;
    var nights = run.nightsSurvived || 0;
    var stats = clone(run.stats);
    var deckByClan = {};
    run.deck.forEach(function (i) {
      var d = U.def(i);
      var clan = d ? (CC().clanId ? CC().clanId(d.clan) : d.clan) : 'neutral';
      (deckByClan[clan] = deckByClan[clan] || []).push({ uid: i.uid, id: i.id, name: d && d.name, scratches: (i.scratches || []).length, fork: i.fork, charm: i.charm || null, plus: !!i.plus, mastery: i.masteryRank || 0, lives: i.lives });
    });
    var seconds = Run.elapsed(run);
    var runForMeta = {
      result: outcome, seed: run.seed, seedSource: run.seedSource, daily: !!run.daily, dailyDate: run.dailyDate, rank: run.rank,
      mainClan: run.clan, sideClan: run.side, championId: run.championId, giftId: run.giftId, killedBy: killed,
      nightsSurvived: nights, elitesBeaten: stats.elitesBeaten || 0, bossesBeaten: stats.bossesBeaten || 0, seconds: seconds,
      deckSize: run.deck.length, relicCount: run.relics.length, lowestWarmth: stats.lowestWarmth === undefined ? run.warmth : stats.lowestWarmth,
      livesSpent: stats.livesSpent || 0, best: stats.best || {},
      omens: run.omens.map(function (o) { return { id: o.id, survived: !!o.survived }; })
    };
    (meta().statsCatalog || []).forEach(function (s) { if (s.kind === 'sum' && typeof stats[s.key] === 'number') runForMeta[s.key] = stats[s.key]; });
    runForMeta.nightsSurvived = nights;
    var xp = meta().runXp ? meta().runXp(runForMeta, null) : { total: 0 };
    var highlights = [];
    var best = stats.best || {};
    if (best.longestTurnCards) highlights.push('You played ' + best.longestTurnCards + ' cards in one turn. Your paws filed a complaint.');
    if (best.biggestHit) highlights.push('Biggest single hit: ' + best.biggestHit + '. The pest has been informed.');
    if (best.maxPurr) highlights.push('Biggest stack: Purr x' + best.maxPurr + '.');
    if (stats.livesSpent) highlights.push('Lives spent: ' + stats.livesSpent + '. The cats consider this an investment.');
    if (stats.fridgeLosses) highlights.push("Gerald's cousin collected " + stats.fridgeLosses + ' Fish from your pocket.');
    if (highlights.length < 3 && stats.fishEarned) highlights.push('Fish earned: ' + stats.fishEarned + '. Fish spent: ' + (stats.fishSpent || 0) + '.');
    if (highlights.length < 3) highlights.push('Nights survived: ' + nights + ' of 9. The house remembers.');
    return {
      outcome: outcome, won: won,
      title: won ? 'The Sunbeam Holds' : (outcome === 'retired' ? 'Went for a nap' : 'The Cushion Is Cold'),
      flavor: rng.pick(FLAVOR[outcome] || FLAVOR.lost),
      rank: run.rank, seed: run.seed, seconds: seconds, nightsSurvived: nights, nightsOf: 9,
      killedBy: won ? null : killed, defeated: won ? (run.defeatedBosses[run.defeatedBosses.length - 1] || null) : null,
      clan: run.clan, side: run.side, champion: champ ? { id: champ.id, lives: champ.lives, tiers: (champ.champion && champ.champion.tiers) || [], paths: cs && cs.paths, finalForm: cs && cs.finalForm ? cs.finalForm.name : null } : null,
      deck: deckByClan, deckSize: run.deck.length,
      relics: run.relics.map(function (r) { return r.id; }),
      route: run.history.map(function (h) { return { nodeId: h.nodeId, type: h.type, act: h.act }; }),
      stats: stats, highlights: highlights.slice(0, 3),
      whiskerXp: xp.total, xp: xp,
      share: 'Nine Lives | ' + (won ? 'Victory' : 'Defeat') + ' | Rank ' + run.rank + ' | ' + run.clan + ' + ' + run.side + ' | ' + fmtTime(seconds) + ' | Night ' + nights + '/9 | seed ' + run.seed,
      metaRun: runForMeta
    };
  };
  function fmtTime(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  Run.retire = function (run) {
    run.status = 'over';
    run.outcome = 'retired';
    run.killedBy = 'Went for a nap';
    var s = Run.summary(run, 'retired');
    if (!run.noAutosave) Run.clearSave();
    return s;
  };
})();
