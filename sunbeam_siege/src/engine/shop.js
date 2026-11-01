/* SUNBEAM SIEGE: Gerald's Back Alley Bazaar (agent C2).
 * Classic script. Attaches SB.shop. Stock, prices, sales, haggling, services, black market and Gerald's banter, all seeded
 * from rngFor(seed, 'shop', nodeId...). State lives in run.current.shop (JSON) so a reload shows the same shop.
 * Data: SB.data.shop (B15), prices follow A07/B15, Shoo uses the RULES price (75 + 25 each time).
 * No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  SB.data = SB.data || {};
  var S = SB.shop = SB.shop || {};

  function CC() { return SB.content; }
  function RU() { return SB.run.U; }
  function D() { return SB.data.shop; }
  function rules() { return SB.data.rules || {}; }
  function actIdx(run) { return Math.max(0, Math.min(2, run.act - 1)); }
  function round5(n) { return Math.max(0, Math.round(n / 5) * 5); }

  /* ------------------------------------------------------------------ prices */
  S.priceMult = function (run) {
    var m = D().prices.actCreep[actIdx(run)] || 1;
    var rm = SB.run.rankMods(run);
    if (rm.shopPriceMult) m *= rm.shopPriceMult;
    var pct = SB.run.mod(run, 'shopPricePct');
    if (typeof pct === 'number' && pct) m *= (1 + pct / 100);
    return m;
  };
  function priced(run, rng, base, noVariance) {
    var v = noVariance ? 1 : (1 + (rng.next() * 2 - 1) * (D().prices.card.variance || 0.1));
    return round5(base * v * S.priceMult(run));
  }

  /* ------------------------------------------------------------------ stock builders */
  function cardPool(run, group) { return SB.rewards.poolFor(run, group); }
  function pickCards(run, rng, plan, seen, rarityWeights) {
    // plan: array of 'main' | 'side' | 'neutral'
    var out = [];
    plan.forEach(function (grp) {
      var pool = cardPool(run, grp).filter(function (c) { return !seen[c.id] && SB.rewards.countInDeck(run, c.id) < SB.rewards.cardCap(c); });
      var rar = rng.weighted(['common', 'uncommon', 'rare'], function (r) { return rarityWeights[r]; });
      var list = pool.filter(function (c) { return c.rarity === rar; });
      if (!list.length) list = pool;
      var pick = rng.pick(list);
      if (pick) { seen[pick.id] = true; out.push(pick); }
    });
    return out;
  }
  function buildCards(run, rng, preBoss, seen) {
    var st = D().stock.cards;
    var plan = [];
    for (var i = 0; i < st.split.main; i++) plan.push('main');
    for (i = 0; i < st.split.side; i++) plan.push('side');
    for (i = 0; i < st.split.neutral; i++) plan.push('neutral');
    var cards = pickCards(run, rng, plan, seen, st.rarityWeights);
    // at least one Uncommon or better
    if (cards.length && !cards.some(function (c) { return c.rarity !== 'common'; })) {
      var up = cardPool(run, 'main').filter(function (c) { return c.rarity === 'uncommon' && !seen[c.id]; });
      var rep = rng.pick(up);
      if (rep) { seen[cards[0].id] = false; cards[0] = rep; seen[rep.id] = true; }
    }
    if (preBoss) {
      var extra = cardPool(run, 'main').concat(cardPool(run, 'side')).filter(function (c) { return c.rarity === 'rare' && !seen[c.id]; });
      var e = rng.pick(extra);
      if (e) { seen[e.id] = true; cards.push(e); }
    }
    var extraMod = SB.run.mod(run, 'shopExtraRare');
    return cards;
  }
  function itemOfCard(run, rng, def, slot) {
    var base = D().prices.card[def.rarity] || 75;
    return { slot: slot, kind: 'card', id: def.id, name: def.name, text: def.text, rarity: def.rarity, price: priced(run, rng, base), sold: false };
  }

  function relicBase(def) {
    if (def.price) return def.price;
    return D().prices.relic[def.rarity === 'shop' ? 'uncommon' : def.rarity] || 160;
  }
  function relicCandidates(run, rarity, taken) {
    var out = SB.rewards.relicCandidates(run, rarity).filter(function (r) { return taken.indexOf(r.id) < 0; });
    if (D().stock.relics.preferShopPool) {
      var shopOnes = SB.rewards.relicCandidates(run, 'shop').filter(function (r) { return taken.indexOf(r.id) < 0; });
      // shop relics stand in for the Uncommon slot
      if (rarity === 'uncommon') out = out.concat(shopOnes, shopOnes);
    }
    return out;
  }
  function buildRelics(run, rng) {
    var slots = D().stock.relics.slots.slice();
    var extra = SB.run.mod(run, 'shopExtraRelic');
    if (typeof extra === 'number' && extra > 0) for (var i = 0; i < extra; i++) slots.push(['common', 'uncommon', 'rare']);
    var taken = [], out = [];
    slots.forEach(function (opt) {
      var order = [rng.pick(opt)].concat(opt, ['common', 'uncommon', 'rare']);
      for (var k = 0; k < order.length; k++) {
        var c = relicCandidates(run, order[k], taken);
        if (c.length) {
          var r = rng.weighted(c, function (x) { return SB.rewards.relicWeight(run, x); });
          if (r) { taken.push(r.id); out.push(r); break; }
        }
      }
    });
    return out;
  }
  function buildStall(run, rng) {
    var st = D().stock.postStall;
    var maxTier = st.maxTierByAct[actIdx(run)];
    var cats = RU().cats(run);
    var clans = [run.clan, run.side];
    var weight = function (u) {
      var w = u.rarity === 'rare' ? 2 : (u.rarity === 'uncommon' ? 5 : 10);
      var r = u.requires || {};
      if (r.clanOrTag && r.clanOrTag.some(function (t) { return clans.indexOf(t) >= 0; })) w *= (1 + 4 * st.keywordBias);
      return w;
    };
    var pool = CC().upgrades().filter(function (u) {
      if (u.tier > maxTier) return false;
      // useful if some card in the deck can take it
      return run.deck.some(function (i) { var d = CC().card(i.id); return d && SB.data.upgradeFits(d, u); });
    });
    var out = [];
    while (out.length < st.scratches && pool.length) {
      var p = rng.weighted(pool, weight);
      if (!p) break;
      out.push(p);
      pool = pool.filter(function (u) { return u !== p; });
    }
    var stallPct = SB.run.mod(run, 'postStallPct');
    var mult = 1 + ((typeof stallPct === 'number' ? stallPct : 0) / 100);
    return out.map(function (u) {
      return { kind: 'stall', id: u.id, name: u.name, text: u.text, tier: u.tier, rarity: u.rarity, price: round5((u.costFish || 40) * mult * S.priceMult(run)), sold: false, needs: 'card' };
    });
  }
  function buildConsumables(run, rng) {
    var st = D().stock.consumables;
    var pool = st.pool.slice(), out = [];
    while (out.length < st.count && pool.length) {
      var id = rng.pick(pool);
      pool = pool.filter(function (x) { return x !== id; });
      var def = D().consumables.filter(function (c) { return c.id === id; })[0];
      if (def) out.push({ kind: 'consumable', id: def.id, name: def.name, text: def.text, price: round5(def.cost * S.priceMult(run)), sold: false, needs: /chosenCat/.test(JSON.stringify(def.effect)) ? 'cat' : null, effect: def.effect });
    }
    return out;
  }
  function buildBlackMarket(run, rng, node) {
    var bm = D().blackMarket;
    var chance = bm.chance['act' + (actIdx(run) + 1)] || 0;
    if (node && typeof node.r === 'number' && node.r < 2) return null;
    if (!rng.chance(chance)) return null;
    var items = bm.items.filter(function (it) {
      if (it.kind === 'relic') {
        var rid = it.relic.replace(/^rl_/, 'relic_');
        var def = CC().relic(rid);
        return def && !SB.rewards.ownedRelic(run, rid) && (run.blockedRelics || []).indexOf(rid) < 0;
      }
      return true;
    });
    var pool = items.slice(), out = [];
    while (out.length < 3 && pool.length) {
      var it = rng.pick(pool);
      pool = pool.filter(function (x) { return x !== it; });
      out.push({ kind: 'black', id: it.id, name: it.name, text: it.text, flavor: it.flavor, bmKind: it.kind, relic: it.relic ? it.relic.replace(/^rl_/, 'relic_') : null, price: it.cost, sold: false, effect: it.effect || null, needs: it.id === 'bm_forbidden_tuna' ? 'cat' : null });
    }
    return out.length ? { intro: bm.intro, items: out } : null;
  }

  /* ------------------------------------------------------------------ banter */
  function line(run, key, salt) {
    var list = D().dialogue[key];
    if (!list) return '';
    if (!Array.isArray(list)) list = list['act' + (actIdx(run) + 1)] || [];
    if (!list.length) return '';
    var rng = RU().rng(run, 'shop', 'banter:' + (run.current && run.current.nodeId) + ':' + key + ':' + (salt || 0));
    return rng.pick(list);
  }
  function moodLine(run) {
    var th = D().reactions.fishThresholds;
    if (run.fish < th.poor) return line(run, 'poor');
    if (run.fish > th.rich) return line(run, 'rich');
    return '';
  }

  /* ------------------------------------------------------------------ open */
  S.open = function (run) {
    var cur = run.current || (run.current = {});
    var node = run.map && run.map.nodes[cur.nodeId];
    var rng = RU().rng(run, 'shop', cur.nodeId + ':stock');
    run.shopsSeen = (run.shopsSeen || 0) + 1;
    RU().stat(run, 'shopVisits', 1);
    var preBoss = !!(node && node.r === 6);
    var seen = {};
    var stock = [];
    var cards = buildCards(run, rng, preBoss, seen);
    var saleIdx = -1;
    cards.forEach(function (c, i) { stock.push(itemOfCard(run, rng, c, 'c' + i)); });
    // one card on sale (never a Rare unless nothing else exists)
    var nonRare = stock.map(function (s, i) { return s.rarity !== 'rare' ? i : -1; }).filter(function (i) { return i >= 0; });
    saleIdx = nonRare.length ? rng.pick(nonRare) : (stock.length ? 0 : -1);
    if (saleIdx >= 0) {
      stock[saleIdx].sale = true;
      stock[saleIdx].was = stock[saleIdx].price;
      stock[saleIdx].price = round5(stock[saleIdx].price * (1 - D().sale.cardSale.discount));
    }
    var relics = buildRelics(run, rng);
    var discounted = rng.chance(D().sale.relicDiscount.chance) && relics.length ? rng.int(0, relics.length - 1) : -1;
    relics.forEach(function (r, i) {
      var it = { slot: 'r' + i, kind: 'relic', id: r.id, name: r.name, text: r.text, rarity: r.rarity, price: priced(run, rng, relicBase(r)), sold: false };
      if (i === discounted) { it.sale = true; it.was = it.price; it.price = round5(it.price * (1 - D().sale.relicDiscount.discount)); }
      stock.push(it);
    });
    // collar charm
    var charmIds = SB.rewards.rollCharms(run, rng, 1);
    charmIds.forEach(function (id, i) {
      var ch = SB.rewards.charmDef(id);
      stock.push({ slot: 'm' + i, kind: 'charm', id: id, name: ch.name, text: ch.text, price: priced(run, rng, D().prices.collarCharm), sold: false, needs: 'card' });
    });
    buildStall(run, rng).forEach(function (it, i) { it.slot = 's' + i; stock.push(it); });
    stock.push({ slot: 'v0', kind: 'voucher', id: 'fork_voucher', name: 'Fork Voucher', text: 'Choose any card that has a Fork and take one.', price: round5(D().prices.forkVoucher * S.priceMult(run)), sold: false, needs: 'card' });
    buildConsumables(run, rng).forEach(function (it, i) { it.slot = 'k' + i; stock.push(it); });
    var visit = run.shopsSeen;
    if (visit === (D().sale.loyalty.visits || 3)) {
      stock.push({ slot: 'k9', kind: 'consumable', id: 'shop_tuna_tin', name: 'Tuna Tin (loyalty)', text: 'Give one cat +1 life. On the house.', price: 0, sold: false, needs: 'cat', effect: D().consumables[0].effect, loyalty: true });
    }
    var first = run.flags.firstPurchaseDiscount;
    run.flags.firstPurchaseDiscount = 0;
    SB.run.U.runHooks(run, 'onShopEnter', {});
    var clip = run.flags.firstPurchaseDiscount || 0;
    run.flags.firstPurchaseDiscount = first || 0;
    var state = {
      visit: visit, nodeId: cur.nodeId, preBoss: preBoss, milkUsed: false, rerolls: 0, haggled: false, bought: 0, bulkReady: false,
      couponMult: 1, firstPurchaseDiscount: clip, boxSwapOffer: null
    };
    // gifts and coupons from earlier
    if (run.flags.firstShopDiscountPct && visit === 1) state.couponMult *= (1 - run.flags.firstShopDiscountPct / 100);
    if (run.flags.shopCouponShops > 0) { state.couponMult *= 0.75; run.flags.shopCouponShops--; }
    var shop = {
      stock: stock, state: state, black: buildBlackMarket(run, rng, node),
      greeting: line(run, 'greeting'), mood: moodLine(run), banter: '', preBoss: preBoss
    };
    shop.banter = shop.greeting;
    cur.shop = shop;
    return S.view(run);
  };

  // everything the UI needs, with services priced for now
  S.view = function (run) {
    var shop = run.current && run.current.shop;
    if (!shop) throw new Error('no shop open');
    var view = {
      stock: shop.stock.map(function (it) { return Object.assign({}, it, { finalPrice: S.finalPrice(run, it) }); }),
      services: S.services(run), banter: shop.banter, greeting: shop.greeting, mood: shop.mood, preBoss: shop.preBoss,
      black: shop.black ? { intro: shop.black.intro, items: shop.black.items.map(function (it) { return Object.assign({}, it, { finalPrice: it.price }); }) } : null,
      fish: run.fish, visit: shop.state.visit
    };
    return view;
  };
  S.finalPrice = function (run, item) {
    var shop = run.current.shop, st = shop.state;
    if (item.price === 0 && item.loyalty) return 0;
    var p = item.price * st.couponMult;
    if (item.kind === 'black') return item.price;
    if (st.bulkReady) p *= 0.9;
    if (st.firstPurchaseDiscount) p *= (1 - st.firstPurchaseDiscount / 100);
    if (item.haggle === 'win') p *= (1 - D().sale.haggle.successDiscount);
    if (item.haggle === 'fail') p *= (1 + D().sale.haggle.failSurcharge);
    return round5(p);
  };
  S.find = function (run, ref) {
    var shop = run.current && run.current.shop;
    if (!shop) return null;
    var key = (ref && typeof ref === 'object') ? (ref.slot || ref.id) : ref;
    var all = shop.stock.concat(shop.black ? shop.black.items.map(function (b, i) { b.slot = b.slot || 'b' + i; return b; }) : []);
    for (var i = 0; i < all.length; i++) if (all[i].slot === key || (all[i].id === key && !all[i].sold)) return all[i];
    return null;
  };

  /* ------------------------------------------------------------------ services (prices) */
  S.shooPrice = function (run) {
    var sv = D().services.shoo;
    if (SB.run.mod(run, 'adoptOutFree')) return 0;
    var n = SB.run.mod(run, 'removalNoEscalate') ? 0 : (run.removals || 0);
    return Math.min(sv.maxCost || 300, sv.base + sv.step * n);
  };
  S.rerollPrice = function (run) {
    var st = run.current.shop.state, sv = D().services.reroll;
    if (SB.run.mod(run, 'freeShopReroll') && st.rerolls === 0) return 0;
    return sv.base + sv.step * st.rerolls;
  };
  S.litterPrice = function (run) {
    var sv = D().services.litter;
    var freeN = SB.run.mod(run, 'freeLitterPerAct');
    run.litterAct = run.litterAct || {};
    if (typeof freeN === 'number' && freeN > 0 && !run.litterAct[run.act]) return 0;
    return sv.base + sv.step * (run.litters || 0);
  };
  S.services = function (run) {
    var st = run.current.shop.state, sv = D().services;
    return {
      shoo: { price: S.shooPrice(run), text: 'Adopt out a card (not the champion).' },
      warm_milk: { price: sv.warm_milk.cost, heal: sv.warm_milk.heal, available: !st.milkUsed },
      reroll: { price: S.rerollPrice(run) },
      box_swap: { price: sv.box_swap.cost },
      litter: { price: S.litterPrice(run) },
      whittle: { price: sv.whittle.cost },
      knead: { price: sv.knead.cost },
      sell: { common: D().prices.sell.common, other: D().prices.sell.other, mult: S.sellMult(run) },
      haggle: { price: D().sale.haggle.cost, available: !st.haggled }
    };
  };

  /* ------------------------------------------------------------------ buying */
  function reaction(run, key) { return line(run, key, run.current.shop.state.bought); }
  S.buy = function (run, itemRef, args) {
    var shop = run.current && run.current.shop;
    if (!shop || run.status !== 'shop') return { ok: false, reason: 'The shop is shut.' };
    var item = S.find(run, itemRef);
    args = args || (itemRef && itemRef.args) || {};
    if (itemRef && typeof itemRef === 'object') {
      ['uid', 'forkId', 'tradeUid', 'stat'].forEach(function (k) { if (itemRef[k] !== undefined && args[k] === undefined) args[k] = itemRef[k]; });
    }
    if (!item) return { ok: false, reason: 'Gerald does not have that.' };
    if (item.sold) return { ok: false, reason: 'Sold. Gerald has already spent it.' };
    var st = shop.state;
    var price = S.finalPrice(run, item);
    var trade = null;
    // validate targets before taking money
    var inst = args.uid ? RU().inst(run, args.uid) : null;
    var check = validateTarget(run, item, inst, args);
    if (!check.ok) return check;
    if (item.kind === 'black' && args.tradeUid) {
      var ti = RU().inst(run, args.tradeUid);
      var td = ti && CC().card(ti.id);
      if (!ti || !td || td.type === 'champion') return { ok: false, reason: 'Gerald will not take that in trade.' };
      var val = (td.rarity === 'common' || td.rarity === 'basic' ? D().prices.sell.common : D().prices.sell.other) * 3;
      if (val < price - run.fish && run.fish < price) return { ok: false, reason: 'That card is not worth enough.' };
      trade = ti;
    }
    var pay = price;
    if (trade) {
      var tv = (CC().card(trade.id).rarity === 'common' || CC().card(trade.id).rarity === 'basic' ? D().prices.sell.common : D().prices.sell.other) * 3;
      pay = Math.max(0, price - tv);
    }
    if (run.fish < pay) return { ok: false, reason: 'Not enough Fish.', price: pay, banter: line(run, 'poor') };
    if (trade && run.deck.length <= RU().deckMin()) return { ok: false, reason: 'The clowder cannot shrink further.' };
    var result = applyItem(run, item, inst, args);
    if (!result.ok) return result;
    if (pay) RU().spendFish(run, pay);
    if (trade) RU().removeInst(run, trade.uid);
    item.sold = true;
    st.bought++;
    if (st.firstPurchaseDiscount) st.firstPurchaseDiscount = 0;
    else if (st.bulkReady) st.bulkReady = false;
    if (st.bought === 3 && !st.bulkUsed) { st.bulkReady = true; st.bulkUsed = true; }
    var banter = reaction(run, item.kind === 'relic' ? 'onBuyRelic' : (item.kind === 'black' ? 'blackMarketBuy' : 'onBuy'));
    shop.banter = banter;
    result.price = pay;
    result.banter = banter;
    return result;
  };

  function validateTarget(run, item, inst, args) {
    if (item.needs === 'card' || item.needs === 'cat') {
      if (!inst) return { ok: false, reason: 'Pick a card first.' };
      if (item.needs === 'cat' && !RU().isCat(inst)) return { ok: false, reason: 'That needs a cat.' };
    }
    if (item.kind === 'stall') {
      var up = CC().upgrade(item.id);
      var chk = SB.post.canApply(run, inst, up, { ignoreTier: true, replace: typeof args.replace === 'number' });
      if (!chk.ok) return chk;
    }
    if (item.kind === 'charm') {
      var ch = SB.rewards.charmDef(item.id);
      if (!SB.rewards.charmFits(inst, ch)) return { ok: false, reason: 'That charm does not fit this card.' };
    }
    if (item.kind === 'voucher') {
      var fk = SB.post.forksFor(run, inst).filter(function (f) { return f.id === args.forkId; })[0];
      if (!fk) return { ok: false, reason: 'Pick a card that has a Fork, and one of its forks.' };
      if (inst.fork) return { ok: false, reason: 'That card already has a Fork.' };
      if (SB.post.freeSlots(run, inst) <= 0) return { ok: false, reason: 'No free scratch slot.' };
    }
    if (item.kind === 'card') {
      var cd = CC().card(item.id);
      if (SB.rewards.countInDeck(run, item.id) >= SB.rewards.cardCap(cd)) return { ok: false, reason: 'You already hold plenty of those.' };
    }
    if (item.kind === 'relic' && SB.rewards.ownedRelic(run, item.id)) return { ok: false, reason: 'Already owned.' };
    return { ok: true };
  }

  function applyItem(run, item, inst, args) {
    var shop = run.current.shop, price = S.finalPrice(run, item);
    switch (item.kind) {
      case 'card': {
        var added = RU().addCard(run, item.id, 'shop');
        return { ok: true, uid: added.uid, card: item.id };
      }
      case 'relic': {
        var def = RU().giveRelic(run, item.id, 'shop');
        return { ok: true, relic: def };
      }
      case 'charm': {
        var r = SB.run.applyCharm(run, item.id, inst.uid);
        return r;
      }
      case 'stall': {
        var rr = SB.post.scratch(run, inst.uid, item.id, { free: false, price: 0, stall: true, replace: args.replace, ignoreTier: true });
        return rr;
      }
      case 'voucher': {
        var rf = SB.post.fork(run, inst.uid, args.forkId, { paid: true, price: 0 });
        return rf;
      }
      case 'consumable': return applyConsumable(run, item, inst);
      case 'black': return applyBlack(run, item, inst);
      default: return { ok: false, reason: 'Unknown item.' };
    }
  }
  function applyConsumable(run, item, inst) {
    var e = item.effect || {};
    switch (e.type) {
      case 'lives':
        if (e.target === 'allCatsInDeck') RU().cats(run).forEach(function (c) { RU().gainLives(run, c, e.amount, true); });
        else RU().gainLives(run, inst, e.amount, true);
        return { ok: true };
      case 'nextFightNip': run.flags.nextFightNip = (run.flags.nextFightNip || 0) + e.amount; return { ok: true };
      case 'warmth': return { ok: true, healed: RU().heal(run, e.amount) };
      case 'nextFightYarnCellar': run.flags.nextFightYarnCellar = (run.flags.nextFightYarnCellar || 0) + e.amount; return { ok: true };
      case 'actFluff': run.flags.luckyCollar = { uid: inst.uid, amount: e.amount, act: run.act }; return { ok: true };
      default: return { ok: false, reason: 'Gerald cannot explain this item.' };
    }
  }
  function applyBlack(run, item, inst) {
    var st = run.current.shop.state;
    switch (item.id) {
      case 'bm_spare_whisker': case 'bm_fake_gold_whisker': case 'bm_extra_slot': {
        var def = RU().giveRelic(run, item.relic, 'black');
        if (def && item.id === 'bm_fake_gold_whisker') RU().relicEntry(run, item.relic).fightsLeft = 3;
        return { ok: !!def, relic: def, reason: def ? undefined : 'Already owned.' };
      }
      case 'bm_forbidden_tuna':
        RU().gainLives(run, inst, 3, true);
        RU().addCard(run, 'curse_vet_appointment', 'black');
        return { ok: true };
      case 'bm_sealed_box': {
        var rng = RU().rng(run, 'shop', run.current.nodeId + ':sealed');
        var rid = SB.rewards.rollRelic(run, rng, 'event', rng.weighted(['common', 'uncommon', 'rare'], function (r) { return item.effect.weights[r]; }));
        var d2 = rid ? RU().giveRelic(run, rid, 'black') : null;
        return { ok: !!d2, relic: d2, reason: d2 ? undefined : 'The box was empty. Gerald is as surprised as you.' };
      }
      case 'bm_used_collar':
        if (run.tierUnlocked >= 3) return { ok: false, reason: 'All tiers are already open.' };
        run.tierUnlocked = Math.min(3, Math.max(run.tierUnlocked, run.tiersTaken) + 1);
        return { ok: true, championTierNow: true };
      case 'bm_counterfeit_nip':
        run.flags.nextFightNip = item.effect.amount; run.flags.nextFightCrashTurns = item.effect.crashTurns; return { ok: true };
      case 'bm_gerald_coupon':
        run.flags.shopCouponShops = Math.max(0, (item.effect.shops || 2) - 1);
        st.couponMult *= (1 - item.effect.amount);
        return { ok: true };
      default: return { ok: false, reason: 'Gerald cannot explain this item.' };
    }
  }

  /* ------------------------------------------------------------------ haggle */
  S.haggle = function (run, itemRef) {
    var shop = run.current && run.current.shop;
    var item = S.find(run, itemRef);
    if (!shop || !item || item.sold || item.kind === 'black') return { ok: false, reason: 'Nothing to haggle over.' };
    var st = shop.state, hg = D().sale.haggle;
    if (st.haggled) return { ok: false, reason: 'Gerald only haggles once per visit.' };
    if (!RU().spendFish(run, hg.cost)) return { ok: false, reason: 'Not enough Fish.' };
    st.haggled = true;
    var rng = RU().rng(run, 'shop', shop.state.nodeId + ':haggle');
    var win = rng.next() < hg.successChance;
    item.haggle = win ? 'win' : 'fail';
    shop.banter = line(run, win ? 'onHaggleWin' : 'onHaggleFail');
    return { ok: true, success: win, banter: shop.banter, finalPrice: S.finalPrice(run, item) };
  };

  /* ------------------------------------------------------------------ services */
  S.remove = function (run, uid) {
    var shop = run.current && run.current.shop;
    if (!shop) return { ok: false, reason: 'The shop is shut.' };
    var inst = RU().inst(run, uid);
    var c = RU().canRemove(run, inst);
    if (!c.ok) return c;
    var def = RU().def(inst);
    var stray = (def.tags || []).indexOf('stray') >= 0;
    var price = stray ? 0 : S.shooPrice(run);
    if (run.fish < price) return { ok: false, reason: 'Not enough Fish.', price: price };
    RU().spendFish(run, price);
    RU().removeInst(run, uid);
    var isCurse = def.type === 'curse';
    if (!isCurse) run.adopted++;
    if (!stray) run.removals = (run.removals || 0) + 1;
    // scratches refund 10 Fish each
    var refund = (inst.scratches || []).length * (D().services.shoo.scratchRefundFish || 10);
    if (refund) RU().addFish(run, refund, { pct: false });
    shop.banter = line(run, 'onShoo');
    return { ok: true, price: price, refund: refund, banter: shop.banter, text: D().services.shoo.flavor };
  };
  S.warmMilk = function (run) {
    var shop = run.current.shop, sv = D().services.warm_milk;
    if (shop.state.milkUsed) return { ok: false, reason: 'One saucer per visit.' };
    if (!RU().spendFish(run, sv.cost)) return { ok: false, reason: 'Not enough Fish.' };
    shop.state.milkUsed = true;
    var h = RU().heal(run, sv.heal);
    shop.banter = line(run, 'onWarmMilk');
    return { ok: true, healed: h, banter: shop.banter };
  };
  S.reroll = function (run) {
    var shop = run.current.shop, st = shop.state;
    var price = S.rerollPrice(run);
    if (!RU().spendFish(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    st.rerolls++;
    var rng = RU().rng(run, 'shop', st.nodeId + ':reroll:' + st.rerolls);
    var seen = {};
    shop.stock.forEach(function (it) { if (it.kind === 'card') seen[it.id] = true; });
    var keepSold = shop.stock.filter(function (it) { return it.kind === 'card' && it.sold; });
    var fresh = buildCards(run, rng, false, {});
    var newCards = fresh.map(function (c, i) { return itemOfCard(run, rng, c, 'c' + i); });
    var saleIdx = newCards.map(function (s, i) { return s.rarity !== 'rare' ? i : -1; }).filter(function (i) { return i >= 0; });
    if (saleIdx.length) {
      var k = rng.pick(saleIdx);
      newCards[k].sale = true; newCards[k].was = newCards[k].price; newCards[k].price = round5(newCards[k].price * 0.5);
    }
    var rest = shop.stock.filter(function (it) { return it.kind !== 'card'; });
    shop.stock = newCards.concat(rest);
    shop.banter = line(run, 'onReroll', st.rerolls);
    return { ok: true, price: price, banter: shop.banter };
  };
  S.sellMult = function (run) {
    var m = SB.run.mod(run, 'sellPricePct');
    return 1 + ((typeof m === 'number' ? m : 0) / 100);
  };
  S.sell = function (run, uid) {
    var shop = run.current && run.current.shop;
    if (!shop) return { ok: false, reason: 'The shop is shut.' };
    var inst = RU().inst(run, uid);
    var c = RU().canRemove(run, inst);
    if (!c.ok) return c;
    var def = RU().def(inst);
    var base = (def.rarity === 'common' || def.rarity === 'basic' || def.type === 'curse') ? D().prices.sell.common : D().prices.sell.other;
    var gain = Math.round(base * S.sellMult(run));
    RU().removeInst(run, uid);
    RU().addFish(run, gain, { pct: false });
    shop.banter = line(run, 'onSell');
    return { ok: true, fish: gain, banter: shop.banter };
  };
  S.boxSwap = function (run, uid, pickId) {
    var shop = run.current.shop, price = D().services.box_swap.cost;
    var choices = SB.post.boxSwapChoices(run, uid, shop.state.nodeId);
    if (!choices.length) return { ok: false, reason: 'That one will not fit in a box.' };
    if (pickId === undefined || pickId === null) return { ok: true, choices: choices, price: price, preview: true };
    if (choices.indexOf(pickId) < 0) return { ok: false, reason: 'Not one of the boxes.' };
    if (!RU().spendFish(run, price)) return { ok: false, reason: 'Not enough Fish.' };
    var r = SB.post.boxSwap(run, uid, pickId);
    r.price = price;
    r.text = 'It is a box. It is now also a different cat.';
    return r;
  };
  S.litter = function (run, uid) {
    var inst = RU().inst(run, uid);
    if (!inst) return { ok: false, reason: 'No such card.' };
    var c = SB.post.canLitter(run, inst);
    if (!c.ok) return c;
    var price = S.litterPrice(run);
    if (!RU().spendFish(run, price)) return { ok: false, reason: 'Not enough Fish.', price: price };
    var r = SB.post.litter(run, uid);
    if (r.ok) {
      if (price === 0 && SB.run.mod(run, 'freeLitterPerAct')) { run.litterAct = run.litterAct || {}; run.litterAct[run.act] = true; }
      else run.litters = (run.litters || 0) + 1;
    }
    r.price = price;
    return r;
  };
  S.whittle = function (run, uid) { return SB.post.whittle(run, uid); };
  S.knead = function (run, uid, stat) { return SB.post.knead(run, uid, stat); };
})();
