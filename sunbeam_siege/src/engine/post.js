/* SUNBEAM SIEGE: Scratching Post, upgrades, forks, evolution, kneading, whittle (agent C2).
 * Classic script. Attaches SB.post. Implements A06 sections 2 to 8 and 11 for the run layer:
 *   open / options / reroll / scratch / fork / plus: the free Post node flow (one free upgrade per visit)
 *   buyScratch / buyFork / whittle / knead / championTier / growthSpurt / legendCeremony: paid services
 *   slotsOf / canApply / rollOffers: fit rules (slots, groups, redundancy, tier gate by Post material)
 * The instance fields written here: scratches[], fork (fork option id), plus (bool, the card's own "+" upgrade patch),
 * slotBonus, whittled, postKneads, growthFights, knead (number or {attack,health,value}), masteryRank, plays.
 * Offers are seeded by (seed, node id, card uid, reroll count) so a reload cannot reroll them.
 * No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  SB.data = SB.data || {};
  var P = SB.post = SB.post || {};

  function CC() { return SB.content; }
  function RU() { return SB.run.U; }
  function rules() { return SB.data.rules || {}; }
  var MATERIALS = ['Cardboard Post', 'Sisal Post', 'Cedar Post'];

  function actIdx(run) { return Math.max(0, Math.min(2, run.act - 1)); }
  P.maxTier = function (run) { return (rules().scratch_max_tier_by_act || [1, 2, 3])[actIdx(run)]; };
  P.offerCount = function (run) {
    var base = (rules().scratch_offers_by_act || [3, 3, 4])[actIdx(run)];
    var extra = SB.run.mod(run, 'postExtraOffers');
    return base + (typeof extra === 'number' ? extra : 0);
  };
  P.material = function (run) { return MATERIALS[actIdx(run)]; };

  /* ------------------------------------------------------------------ slots and fit */
  function evoStage(inst) {
    var evo = CC().evolution(inst.id);
    if (!evo) return null;
    for (var i = 0; i < evo.stages.length; i++) if (evo.stages[i].id === inst.id) return evo.stages[i];
    return null;
  }
  P.baseSlots = function (def, inst) {
    if (def.type === 'champion') return rules().scratch_champion_generic_slots || 2;
    if (def.type === 'curse' || def.rarity === 'token') return 0;
    var st = inst && evoStage(inst);
    if (st && st.slots) return st.slots;
    if (def.rarity === 'rare') return rules().scratch_slots_rare || 2;
    return 1;
  };
  P.slotsOf = function (run, inst) {
    var def = CC().card(inst.id);
    if (!def) return 0;
    var base = P.baseSlots(def, inst);
    if (base === 0) return 0;
    var cap = rules().scratch_slots_cap || 3;
    return Math.min(def.type === 'champion' ? cap + 1 : cap, base + (inst.slotBonus || 0));
  };
  P.usedSlots = function (inst) { return (inst.scratches || []).length + (inst.fork ? 1 : 0); };
  P.freeSlots = function (run, inst) { return P.slotsOf(run, inst) - P.usedSlots(inst); };

  function grantsOf(upg) {
    return (upg.effects || []).filter(function (e) { return e.op === 'grantKeyword'; });
  }
  // may this generic upgrade be applied to this instance?  returns {ok, reason}
  P.canApply = function (run, inst, upg, opts) {
    opts = opts || {};
    var def = CC().card(inst.id);
    if (!def) return { ok: false, reason: 'Unknown card.' };
    if (def.type === 'curse' || def.rarity === 'token') return { ok: false, reason: 'Nothing to scratch here.' };
    if (!SB.data.upgradeFits(def, upg)) return { ok: false, reason: 'Does not fit this card.' };
    if (upg.tier > P.maxTier(run) && !opts.ignoreTier) return { ok: false, reason: 'This Post is too soft for that scratch.' };
    var sc = inst.scratches || [];
    if (sc.indexOf(upg.id) >= 0) return { ok: false, reason: 'Already scratched in.' };
    if (upg.group) {
      for (var i = 0; i < sc.length; i++) {
        var other = CC().upgrade(sc[i]);
        if (other && other.group === upg.group) return { ok: false, reason: 'Clashes with ' + other.name + '.' };
      }
    }
    var kw = def.keywords || {};
    var gs = grantsOf(upg);
    for (var g = 0; g < gs.length; g++) {
      var e = gs[g];
      var has = !!kw[e.keyword];
      sc.forEach(function (sid) {
        var u2 = CC().upgrade(sid);
        if (u2 && grantsOf(u2).some(function (x) { return x.keyword === e.keyword; })) has = true;
      });
      var stackable = typeof e.n === 'number' && ['purr', 'knead', 'armor', 'claws', 'multistrike'].indexOf(e.keyword) >= 0;
      if (has && !stackable) return { ok: false, reason: 'Already has ' + e.keyword + '.' };
    }
    if (P.freeSlots(run, inst) <= 0 && !opts.replace) return { ok: false, reason: 'No free scratch slot.', full: true };
    return { ok: true };
  };

  P.upgradeCatalog = function () { return CC().upgrades(); };

  function weightOf(u) { return u.rarity === 'rare' ? 2 : (u.rarity === 'uncommon' ? 5 : 10); }

  // n distinct generic offers for an instance
  P.rollScratches = function (run, inst, rng, n, maxTier) {
    var cands = P.upgradeCatalog().filter(function (u) {
      if (u.tier > maxTier) return false;
      var ok = P.canApply(run, inst, u, { replace: true, ignoreTier: true });
      return ok.ok;
    });
    var out = [];
    while (out.length < n && cands.length) {
      var p = rng.weighted(cands, function (u) { return weightOf(u) * (u.tier === 3 ? 0.5 : 1); });
      if (!p) break;
      out.push(p);
      cands = cands.filter(function (u) { return u !== p && (!p.group || u.group !== p.group); });
    }
    return out;
  };

  P.forksFor = function (run, inst) {
    return CC().forksFor(inst.id) || [];
  };
  P.isUpgradeable = function (run, inst) {
    var def = CC().card(inst.id);
    if (!def || def.type === 'curse' || def.rarity === 'token') return false;
    if (!inst.plus && def.upgrade) return true;
    if (P.baseSlots(def, inst) > 0 && (P.freeSlots(run, inst) > 0 || P.forksFor(run, inst).length)) return true;
    return false;
  };

  /* ------------------------------------------------------------------ the node */
  P.open = function (run) {
    var cur = run.current || (run.current = {});
    cur.post = { freeUsed: false, rerolls: 0, offers: {}, emeryUsed: false };
    var eligible = run.deck.filter(function (i) { return P.isUpgradeable(run, i); }).map(function (i) { return i.uid; });
    var payload = {
      act: run.act, material: P.material(run), maxTier: P.maxTier(run), offerCount: P.offerCount(run),
      freeAvailable: eligible.length > 0, eligible: eligible,
      services: P.services(run), growth: P.evolvable(run),
      emery: !!SB.run.mod(run, 'emeryDoublePost')
    };
    if (!eligible.length) {
      // no upgradeable cards: the node becomes a Nook-lite (heal 10 percent)
      var h = RU().heal(run, Math.round(run.maxWarmth * 0.10));
      payload.nookLite = true; payload.healed = h; cur.post.freeUsed = true;
    }
    return payload;
  };

  P.rerollPrice = function (run) { return (rules().post_reroll_price || 15) + (rules().post_reroll_increment || 15) * (run.current.post.rerolls || 0); };

  // Offers for one card. Entry kinds: fork (carries its options), plus, scratch.
  P.options = function (run, uid) {
    var inst = RU().inst(run, uid);
    if (!inst) throw new Error('no such card');
    var cur = run.current;
    var post = cur && cur.post ? cur.post : (cur.post = { freeUsed: false, rerolls: 0, offers: {} });
    var def = CC().card(inst.id);
    var rng = RU().rng(run, 'post', (cur.nodeId || 'x') + ':' + uid + ':' + post.rerolls);
    var offers = [];
    var count = P.offerCount(run);
    var forks = P.forksFor(run, inst);
    var forkEntry = null;
    if (forks.length && !inst.fork && P.freeSlots(run, inst) > 0) {
      forkEntry = { kind: 'fork', options: forks.map(function (f) { return { id: f.id, name: f.name, text: f.text, flavor: f.flavor, cost: f.cost || 90 }; }) };
      offers.push(forkEntry);
    }
    var scratches = P.rollScratches(run, inst, rng, count - (forkEntry ? 1 : 0), P.maxTier(run));
    scratches.forEach(function (u) {
      offers.push({ kind: 'scratch', id: u.id, name: u.name, text: u.text, flavor: u.flavor, tier: u.tier, rarity: u.rarity, cost: u.costFish, replace: P.freeSlots(run, inst) <= 0 });
    });
    var plusEntry = null;
    if (!inst.plus && def.upgrade) {
      plusEntry = { kind: 'plus', id: 'plus', name: def.name + '+', text: def.upgrade.text || 'The card\'s own upgrade.', cost: (rules().scratch_price_by_tier || [40])[0] };
      offers.push(plusEntry);
    }
    post.offers[uid] = offers.map(function (o) { return o.kind === 'fork' ? 'fork' : o.id; });
    post.offerForks = post.offerForks || {};
    if (forkEntry) post.offerForks[uid] = forkEntry.options.map(function (f) { return f.id; });
    return {
      uid: uid, cardId: inst.id, slots: P.slotsOf(run, inst), used: P.usedSlots(inst), freeAvailable: !post.freeUsed,
      offers: offers, rerollPrice: P.rerollPrice(run), rerollsLeft: Math.max(0, (rules().post_reroll_max || 3) - post.rerolls)
    };
  };
  P.reroll = function (run, uid) {
    var post = run.current && run.current.post;
    if (!post) throw new Error('not at a Post');
    if (post.rerolls >= (rules().post_reroll_max || 3)) return { ok: false, reason: 'The post is out of ideas.' };
    var price = P.rerollPrice(run);
    if (!RU().spendFish(run, price)) return { ok: false, reason: 'Not enough Fish.' };
    post.rerolls++;
    return { ok: true, price: price, options: P.options(run, uid) };
  };

  /* ------------------------------------------------------------------ applying */
  function applyImmediate(run, inst, upg) {
    (upg.effects || []).forEach(function (e) {
      if (e.op === 'addLives') RU().gainLives(run, inst, e.n || e.value || 1, true);
      if (e.op === 'grantMasteryRank') {
        var def = CC().card(inst.id);
        var th = SB.run.masteryThresholds(run, inst, def);
        inst.masteryRank = Math.min(3, (inst.masteryRank || 0) + (e.n || 1));
        inst.plays = Math.max(inst.plays || 0, th[inst.masteryRank - 1] || 0);
      }
      if (e.op === 'addSlot') inst.slotBonus = (inst.slotBonus || 0) + (e.n || 1);
    });
  }
  function charge(run, price) {
    if (!price) return true;
    return RU().spendFish(run, price);
  }
  function priceOf(run, upg) {
    var base = upg.costFish || (rules().scratch_price_by_tier || [40, 75, 120])[upg.tier - 1];
    return base;
  }

  // Apply a generic scratch. opts: free (use the node's free pick), replace (index of the scratch to destroy), price override
  P.scratch = function (run, uid, upgradeId, opts) {
    opts = opts || {};
    var inst = RU().inst(run, uid);
    var upg = CC().upgrade(upgradeId);
    if (!inst || !upg) return { ok: false, reason: 'Unknown card or scratch.' };
    var post = run.current && run.current.post;
    var useFree = false;
    if (post && !post.freeUsed && post.offers[uid] && post.offers[uid].indexOf(upgradeId) >= 0 && opts.free !== false) useFree = true;
    if (opts.free === true && !post) useFree = true;
    var replacing = typeof opts.replace === 'number' && opts.replace >= 0 && P.freeSlots(run, inst) <= 0;
    var chk = P.canApply(run, inst, upg, { replace: replacing, ignoreTier: opts.ignoreTier || !!(opts.stall) });
    if (!chk.ok) return chk;
    var price = useFree ? 0 : priceOf(run, upg);
    if (!useFree && opts.price !== undefined) price = opts.price;
    if (replacing && !useFree) price = Math.round(price * (rules().scratch_overscratch_price_percent || 150) / 100);
    if (!charge(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    if (replacing) inst.scratches.splice(opts.replace, 1);
    inst.scratches.push(upg.id);
    applyImmediate(run, inst, upg);
    RU().stat(run, 'upgrades', 1);
    if (useFree) post.freeUsed = true;
    var result = { ok: true, free: useFree, price: price, uid: uid, upgrade: upg.id };
    // Emery Board: the first scratch at each Post is applied to two cards
    if (useFree && opts.also && SB.run.mod(run, 'emeryDoublePost') && !post.emeryUsed) {
      var inst2 = RU().inst(run, opts.also);
      if (inst2 && inst2 !== inst && P.canApply(run, inst2, upg).ok) {
        inst2.scratches.push(upg.id);
        applyImmediate(run, inst2, upg);
        post.emeryUsed = true;
        result.also = opts.also;
        RU().stat(run, 'upgrades', 1);
      }
    }
    return result;
  };
  P.fork = function (run, uid, forkId, opts) {
    opts = opts || {};
    var inst = RU().inst(run, uid);
    if (!inst) return { ok: false, reason: 'No such card.' };
    var f = P.forksFor(run, inst).filter(function (x) { return x.id === forkId; })[0];
    if (!f) return { ok: false, reason: 'That fork does not belong to this card.' };
    var post = run.current && run.current.post;
    var useFree = !!(post && !post.freeUsed && post.offerForks && post.offerForks[uid] && post.offerForks[uid].indexOf(forkId) >= 0) && !opts.paid;
    if (inst.fork && !opts.replaceFork) return { ok: false, reason: 'This card already took a fork.' };
    if (!inst.fork && P.freeSlots(run, inst) <= 0) return { ok: false, reason: 'No free scratch slot.' };
    var price = useFree ? 0 : (opts.price !== undefined ? opts.price : (f.cost || rules().fork_price || 90));
    if (!charge(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    inst.fork = forkId;
    RU().stat(run, 'upgrades', 1);
    if (useFree) post.freeUsed = true;
    return { ok: true, free: useFree, price: price, fork: f };
  };
  P.plus = function (run, uid, opts) {
    opts = opts || {};
    var inst = RU().inst(run, uid);
    var def = inst && CC().card(inst.id);
    if (!inst || !def || !def.upgrade) return { ok: false, reason: 'No upgrade on this card.' };
    if (inst.plus) return { ok: false, reason: 'Already upgraded.' };
    var post = run.current && run.current.post;
    var useFree = !!(post && !post.freeUsed && post.offers[uid] && post.offers[uid].indexOf('plus') >= 0) && !opts.paid;
    var price = useFree ? 0 : (opts.price !== undefined ? opts.price : (rules().scratch_price_by_tier || [40])[0]);
    if (!charge(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    inst.plus = true;
    RU().stat(run, 'upgrades', 1);
    if (useFree) post.freeUsed = true;
    return { ok: true, free: useFree, price: price };
  };

  /* ------------------------------------------------------------------ services */
  P.services = function (run) {
    var R = rules();
    var disc = SB.run.mod(run, 'postStallPct');
    return {
      scratch: { prices: R.scratch_price_by_tier || [40, 75, 120] },
      fork: { price: R.fork_price || 90 },
      whittle: { price: R.whittle_price || 120 },
      knead: { price: R.post_knead_price || 15, maxPerCard: R.post_knead_max_per_card || 2 },
      reroll: { price: run.current && run.current.post ? P.rerollPrice(run) : (R.post_reroll_price || 15) },
      championTier: { prices: R.champion_tier_price || [60, 100, 150] },
      legendCeremony: { price: P.legendPrice(run) },
      stallDiscountPct: typeof disc === 'number' ? disc : 0
    };
  };
  P.whittle = function (run, uid) {
    var inst = RU().inst(run, uid);
    if (!inst) return { ok: false, reason: 'No such card.' };
    if (inst.whittled) return { ok: false, reason: 'Already whittled.' };
    if (P.slotsOf(run, inst) <= 0) return { ok: false, reason: 'Nothing to whittle.' };
    var cap = rules().scratch_slots_cap || 3;
    if (P.slotsOf(run, inst) >= cap + (CC().card(inst.id).type === 'champion' ? 1 : 0)) return { ok: false, reason: 'Already at the slot cap.' };
    var price = rules().whittle_price || 120;
    if (!RU().spendFish(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    inst.slotBonus = (inst.slotBonus || 0) + 1;
    inst.whittled = true;
    return { ok: true, price: price, slots: P.slotsOf(run, inst) };
  };
  function kneadTotal(inst) {
    if (typeof inst.knead === 'number') return inst.knead;
    var k = inst.knead || {};
    return (k.attack || 0) + (k.health || 0) + (k.value || 0);
  }
  P.kneadTotal = kneadTotal;
  function addKnead(inst, stat, n) {
    if (typeof inst.knead === 'number') { inst.knead += n; return; }
    inst.knead = inst.knead || { attack: 0, health: 0, value: 0 };
    inst.knead[stat] = (inst.knead[stat] || 0) + n;
  }
  P.knead = function (run, uid, stat) {
    var inst = RU().inst(run, uid);
    var def = inst && CC().card(inst.id);
    if (!inst || !def) return { ok: false, reason: 'No such card.' };
    if (def.type === 'curse' || def.rarity === 'token') return { ok: false, reason: 'Nothing to knead.' };
    var max = rules().post_knead_max_per_card || 2;
    if ((inst.postKneads || 0) >= max) return { ok: false, reason: 'Kneaded enough.' };
    var cap = def.type === 'champion' ? (rules().knead_cap_champion || 20) : (rules().knead_cap || 12);
    if (kneadTotal(inst) >= cap) return { ok: false, reason: 'At the knead cap.' };
    var allowed = def.type === 'unit' || def.type === 'champion' ? ['attack', 'health'] : ['value'];
    stat = allowed.indexOf(stat) >= 0 ? stat : allowed[0];
    var price = rules().post_knead_price || 15;
    if (!RU().spendFish(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    addKnead(inst, stat, 1);
    inst.postKneads = (inst.postKneads || 0) + 1;
    return { ok: true, price: price, stat: stat };
  };

  /* ------------------------------------------------------------------ champion tiers (paid early or pending) */
  P.championTierState = function (run) {
    var taken = run.tiersTaken || 0;
    var cap = run.act;      // paid tiers cannot run ahead of the act number
    var next = taken + 1;
    var prices = rules().champion_tier_price || [60, 100, 150];
    if (next > 3) return { next: null };
    var pending = next <= run.tierUnlocked;
    return { next: next, free: pending, price: pending ? 0 : prices[next - 1], buyable: pending || next <= cap, options: SB.run.championOptions(run, next) };
  };
  P.championTier = function (run, optionId) {
    var s = P.championTierState(run);
    if (!s.next) return { ok: false, reason: 'All tiers taken.' };
    if (!s.buyable) return { ok: false, reason: 'That tier is not reachable yet.' };
    if (!s.free) {
      if (!RU().spendFish(run, s.price)) return { ok: false, reason: 'Not enough Fish.', price: s.price };
      run.tierUnlocked = Math.max(run.tierUnlocked, s.next);
    }
    var r = SB.run.championUpgrade(run, s.next, optionId);
    if (!r.ok && !s.free) { RU().addFish(run, s.price, { pct: false }); }
    return r;
  };

  /* ------------------------------------------------------------------ evolution */
  P.evolvable = function (run) {
    var out = [];
    run.deck.forEach(function (inst) {
      var evo = CC().evolution(inst.id);
      if (!evo) return;
      var idx = -1;
      evo.stages.forEach(function (s, i) { if (s.id === inst.id) idx = i; });
      if (idx < 0 || idx >= evo.stages.length - 1) return;
      var need = SB.run.growthNeeded(run, evo);
      if (idx === 0 && (inst.growthFights || 0) >= need) out.push({ uid: inst.uid, kind: 'growthSpurt', from: inst.id, to: evo.stages[1].id });
      if (idx === 1 && run.act >= 2 && SB.run.questDone(inst, evo.stages[1].quest)) out.push({ uid: inst.uid, kind: 'legend', from: inst.id, to: evo.stages[2].id, price: P.legendPrice(run) });
    });
    return out;
  };
  P.legendPrice = function (run) {
    return SB.run.mod(run, 'legendCeremonyFree') ? 0 : (rules().legend_ceremony_price || 90);
  };
  function evolveInst(run, inst, evo, toIdx) {
    var from = inst.id;
    inst.id = evo.stages[toIdx].id;
    inst.growthFights = 0;
    inst.plays = 0;
    inst.lives = Math.min(rules().lives_cap || 9, inst.lives + 1);
    inst.maxLives = Math.min(rules().lives_cap || 9, Math.max(inst.maxLives + 1, inst.lives));
    inst.evolved = (inst.evolved || 0) + 1;
    RU().log(run, 'Evolved: ' + from + ' to ' + inst.id);
  }
  P.growthSpurt = function (run, uid) {
    var inst = RU().inst(run, uid);
    var info = P.evolvable(run).filter(function (e) { return e.uid === uid && e.kind === 'growthSpurt'; })[0];
    if (!inst || !info) return { ok: false, reason: 'Not ready to stretch yet.' };
    evolveInst(run, inst, CC().evolution(inst.id), 1);
    return { ok: true, to: inst.id, text: 'The small cat stretches. It is now a bigger cat.' };
  };
  P.legendCeremony = function (run, uid) {
    var inst = RU().inst(run, uid);
    var info = P.evolvable(run).filter(function (e) { return e.uid === uid && e.kind === 'legend'; })[0];
    if (!inst || !info) return { ok: false, reason: 'The Legend Ceremony needs a finished quest, and at least a Sisal Post.' };
    var price = P.legendPrice(run);
    if (price && !RU().spendFish(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    evolveInst(run, inst, CC().evolution(inst.id), 2);
    return { ok: true, to: inst.id, price: price };
  };

  /* ------------------------------------------------------------------ Box Swap and Litter (used by shop and events) */
  P.boxSwapChoices = function (run, uid, key) {
    var inst = RU().inst(run, uid);
    var def = inst && CC().card(inst.id);
    if (!inst || !def) return [];
    var evo = CC().evolution(inst.id);
    if (def.type === 'champion' || (evo && (inst.growthFights || 0) > 1)) return [];
    var n = SB.run.mod(run, 'boxSwapChoices');
    n = (typeof n === 'number' && n) ? n : (rules().box_swap_choices || 3);
    var rng = RU().rng(run, 'shop', 'boxswap:' + key + ':' + uid);
    var want = def.rarity === 'basic' ? 'common' : def.rarity;
    var pool = SB.rewards.allDraftable().filter(function (c) {
      var clan = CC().clanId ? CC().clanId(c.clan) : c.clan;
      return c.rarity === want && (clan === run.clan || clan === run.side) && c.id !== inst.id && c.type === def.type;
    });
    if (pool.length < n) pool = SB.rewards.allDraftable().filter(function (c) { return c.rarity === want && c.id !== inst.id; });
    var picks = [];
    while (picks.length < n && pool.length) {
      var p = rng.pick(pool);
      picks.push(p.id);
      pool = pool.filter(function (c) { return c.id !== p.id; });
    }
    return picks;
  };
  P.boxSwap = function (run, uid, newId) {
    var inst = RU().inst(run, uid);
    var nd = CC().card(newId);
    if (!inst || !nd) return { ok: false, reason: 'Unknown card.' };
    var keepMastery = !!SB.run.mod(run, 'boxSwapKeepsMastery');
    inst.id = nd.id;
    // scratches that still fit survive, up to the new slot count
    var kept = [];
    (inst.scratches || []).forEach(function (sid) {
      var u = CC().upgrade(sid);
      if (u && SB.data.upgradeFits(nd, u) && kept.length < Math.max(0, P.baseSlots(nd, inst) + (inst.slotBonus || 0))) kept.push(sid);
    });
    inst.scratches = kept;
    inst.fork = null;
    inst.plus = false;
    if (!keepMastery) { inst.masteryRank = 0; inst.plays = 0; }
    if (typeof inst.knead === 'number') inst.knead = Math.floor(inst.knead / 2);
    else if (inst.knead) { ['attack', 'health', 'value'].forEach(function (k) { inst.knead[k] = Math.floor((inst.knead[k] || 0) / 2); }); }
    inst.growthFights = 0;
    inst.lives = Math.max(1, Math.min(inst.lives, 9));
    var base = CC().card(nd.id);
    var l = base.stats && base.stats.lives;
    if (l && inst.maxLives < l) { inst.maxLives = l; inst.lives = Math.max(inst.lives, 1); }
    return { ok: true, id: nd.id };
  };
  P.canLitter = function (run, inst) {
    var def = CC().card(inst.id);
    if (!def || def.type === 'champion' || def.type === 'curse') return { ok: false, reason: 'Not that one.' };
    var evo = CC().evolution(inst.id);
    if (evo && evo.stages[evo.stages.length - 1].id === inst.id) return { ok: false, reason: 'Legends do not do litters.' };
    var n = SB.rewards.countInDeck(run, inst.id);
    var max = def.rarity === 'rare' ? (rules().litter_max_copies_rare || 2) : (rules().litter_max_copies_other || 3);
    if (n >= max) return { ok: false, reason: 'Enough of those already.' };
    return { ok: true };
  };
  P.litter = function (run, uid) {
    var inst = RU().inst(run, uid);
    if (!inst) return { ok: false, reason: 'No such card.' };
    var c = P.canLitter(run, inst);
    if (!c.ok) return c;
    var copy = JSON.parse(JSON.stringify(inst));
    copy.uid = RU().nextUid(run);
    copy.plays = 0;
    copy.origin = 'litter';
    copy.growthFights = 0;
    run.deck.push(copy);
    RU().statMax(run, 'maxDeckSize', run.deck.length);
    return { ok: true, uid: copy.uid, text: 'Congratulations, it is two.' };
  };
})();
