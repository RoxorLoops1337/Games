/* SUNBEAM SIEGE: reward rolling (agent C2).
 * Classic script. Attaches SB.rewards. Pure roll helpers: they read the run, consume an rng stream handed in by the
 * caller and only touch run.pity / run.offered (bookkeeping that must survive a reload).
 * Odds per RULES.md: draft odds and Rare pity follow A03 (points taken from Common, +1 per draft without a Rare,
 * cap 20), clan split 60/30/10 (SB.data.rules), Night odds follow A07 because A03 has no Night row.
 * No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  SB.data = SB.data || {};
  var R = SB.rewards = SB.rewards || {};

  function rules() { return SB.data.rules || {}; }
  function CC() { return SB.content; }
  function actIdx(run) { return Math.max(0, Math.min(2, (run.act || 1) - 1)); }

  /* ------------------------------------------------------------------ odds tables */
  var NIGHT_ODDS = [[50, 38, 12], [44, 42, 14], [38, 44, 18]];          // A07 section 8
  var RELIC_ODDS = [[55, 33, 12], [55, 33, 12], [45, 38, 17]];          // elite, event
  var TREASURE_ODDS = [[70, 30, 0], [45, 40, 15], [30, 45, 25]];        // A07 section 9

  R.baseOdds = function (run, kind) {
    var r = rules(), a = actIdx(run);
    if (kind === 'night') return NIGHT_ODDS[a].slice();
    if (kind === 'elite') return (r.odds_elite || [40, 40, 20]).slice();
    if (kind === 'boss') return (r.odds_boss || [0, 0, 100]).slice();
    return ((r['odds_act' + (a + 1)]) || [62, 32, 6]).slice();
  };
  // [common, uncommon, rare] with pity applied (points move from Common to Rare)
  R.draftOdds = function (run, kind) {
    var o = R.baseOdds(run, kind);
    if (kind === 'boss') return o;
    var pity = Math.min((run.pity && run.pity.rare) || 0, rules().rare_pity_cap || 20);
    var take = Math.min(pity, o[0]);
    return [o[0] - take, o[1], o[2] + take];
  };

  /* ------------------------------------------------------------------ card pools */
  var poolCache = null;
  function laterStageIds() {
    var set = {};
    (SB.data.evolutions || []).forEach(function (e) {
      (e.stages || []).forEach(function (s, i) { if (i > 0) set[s.id] = true; });
    });
    return set;
  }
  function tokenIds() {
    var set = {};
    (SB.data.championsAHTokens || []).forEach(function (c) { set[c.id] = true; });
    return set;
  }
  // every card the drafts may ever show, grouped by clan. Cached per content build.
  R.allDraftable = function () {
    if (poolCache && poolCache.src === CC().cards().length) return poolCache.list;
    var later = laterStageIds(), toks = tokenIds(), out = [];
    CC().cards().forEach(function (c) {
      if (!c || !c.id) return;
      if (['common', 'uncommon', 'rare'].indexOf(c.rarity) < 0) return;
      if (['unit', 'spell', 'toy'].indexOf(c.type) < 0) return;
      if (later[c.id] || toks[c.id]) return;
      var tags = c.tags || [];
      if (tags.indexOf('token') >= 0 || tags.indexOf('goblin') >= 0 || tags.indexOf('starter') >= 0 || c.tutorialOnly) return;
      if (c.unlock && c.unlock !== 'start') return;
      out.push(c);
    });
    poolCache = { src: CC().cards().length, list: out };
    return out;
  };
  R.cardCap = function (def) {
    if (def.rarity === 'rare') return 3;
    if (def.type === 'champion') return 2;
    return 5;
  };
  R.countInDeck = function (run, id) {
    var n = 0;
    run.deck.forEach(function (i) { if (i.id === id) n++; });
    return n;
  };
  R.poolFor = function (run, group) {
    var main = run.clan, side = run.side;
    return R.allDraftable().filter(function (c) {
      var clan = CC().clanId ? CC().clanId(c.clan) : c.clan;
      if (group === 'main') return clan === main;
      if (group === 'side') return clan === side;
      if (group === 'neutral') return clan === 'neutral';
      return false;
    });
  };

  // Roll a draft of up to n distinct cards. opts: kind, count, mainOnly, rarities (restrict), rng
  R.rollDraft = function (run, rng, kind, opts) {
    opts = opts || {};
    var n = opts.count || rules().reward_card_choices || 3;
    var odds = R.draftOdds(run, kind);
    var split = rules().clan_split_main_side_neutral || [60, 30, 10];
    var groups = { main: R.poolFor(run, 'main'), side: R.poolFor(run, 'side'), neutral: R.poolFor(run, 'neutral') };
    var order = ['common', 'uncommon', 'rare'];
    var picks = [], seen = {};
    function usable(c) { return !seen[c.id] && R.countInDeck(run, c.id) < R.cardCap(c); }
    function tryPick(src, rar) {
      var cands = groups[src].filter(function (c) { return c.rarity === rar && usable(c); });
      return cands.length ? rng.pick(cands) : null;
    }
    for (var i = 0; i < n; i++) {
      var got = null, t;
      for (t = 0; t < 6 && !got; t++) {
        var src = opts.mainOnly ? 'main' : rng.weighted(['main', 'side', 'neutral'], function (s) { return split[['main', 'side', 'neutral'].indexOf(s)]; });
        var rarOdds = odds.slice();
        if (opts.rarities) rarOdds = rarOdds.map(function (w, k) { return opts.rarities.indexOf(order[k]) >= 0 ? w : 0; });
        var rar = rng.weighted(order, function (x) { return rarOdds[order.indexOf(x)]; }) || 'common';
        got = tryPick(src, rar);
        if (!got) {
          // slide to a neighbouring rarity in the same source, then another source
          var alts = order.filter(function (x) { return x !== rar && (!opts.rarities || opts.rarities.indexOf(x) >= 0); });
          for (var a = 0; a < alts.length && !got; a++) got = tryPick(src, alts[a]);
        }
      }
      if (!got) {
        // last resort: anything usable from any group
        var any = [];
        ['main', 'side', 'neutral'].forEach(function (g) {
          if (opts.mainOnly && g !== 'main') return;
          groups[g].forEach(function (c) { if (usable(c) && (!opts.rarities || opts.rarities.indexOf(c.rarity) >= 0)) any.push(c); });
        });
        got = rng.pick(any);
      }
      if (got) { seen[got.id] = true; picks.push(got); }
    }
    var hasRare = picks.some(function (c) { return c.rarity === 'rare'; });
    return { ids: picks.map(function (c) { return c.id; }), hasRare: hasRare };
  };
  R.updatePity = function (run, hasRare) {
    run.pity = run.pity || { rare: 0 };
    run.pity.rare = hasRare ? 0 : Math.min(rules().rare_pity_cap || 20, (run.pity.rare || 0) + (rules().rare_pity_step || 1));
  };

  /* ------------------------------------------------------------------ relics */
  R.ownedRelic = function (run, id) {
    for (var i = 0; i < run.relics.length; i++) if (run.relics[i].id === id) return true;
    return false;
  };
  R.relicWeight = function (run, r) {
    if (!r.clan) return 1;
    if (r.clan === run.clan || r.clan === run.side) return 2;
    return 0;
  };
  // candidates by rarity. opts.allowShop / opts.boss
  R.relicCandidates = function (run, rarity, opts) {
    opts = opts || {};
    var blocked = run.blockedRelics || [];
    var offered = (run.offered && run.offered.relics) || [];
    return CC().relics().filter(function (r) {
      if (r.rarity !== rarity) return false;
      if (R.ownedRelic(run, r.id) || blocked.indexOf(r.id) >= 0) return false;
      if ((r.tags || []).indexOf('event') >= 0 && !opts.event) return false;
      if (opts.excludeIds && opts.excludeIds.indexOf(r.id) >= 0) return false;
      if (rarity === 'boss' && offered.indexOf(r.id) >= 0) return false;
      return R.relicWeight(run, r) > 0;
    });
  };
  R.rollRelicRarity = function (run, rng, table) {
    var o = table[actIdx(run)];
    return rng.weighted(['common', 'uncommon', 'rare'], function (x) { return o[['common', 'uncommon', 'rare'].indexOf(x)]; }) || 'common';
  };
  // one relic id for elite / event / treasure style rewards
  R.rollRelic = function (run, rng, source, forceRarity) {
    var table = source === 'treasure' ? TREASURE_ODDS : RELIC_ODDS;
    var rar = forceRarity || R.rollRelicRarity(run, rng, table);
    var order = [rar].concat(['common', 'uncommon', 'rare'].filter(function (x) { return x !== rar; }));
    for (var i = 0; i < order.length; i++) {
      var c = R.relicCandidates(run, order[i]);
      if (c.length) return rng.weighted(c, function (r) { return R.relicWeight(run, r); }).id;
    }
    return null;
  };
  R.rollBossRelics = function (run, rng, n) {
    n = n || rules().boss_relic_choices || 3;
    var pool = R.relicCandidates(run, 'boss');
    var out = [];
    while (out.length < n && pool.length) {
      var pick = rng.weighted(pool, function (r) { return R.relicWeight(run, r); });
      if (!pick) break;
      out.push(pick.id);
      pool = pool.filter(function (r) { return r.id !== pick.id; });
    }
    run.offered = run.offered || { relics: [] };
    out.forEach(function (id) { if (run.offered.relics.indexOf(id) < 0) run.offered.relics.push(id); });
    return out;
  };

  /* ------------------------------------------------------------------ charms */
  R.charmDef = function (id) {
    var list = SB.data.charms || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  R.charmPool = function (clan) {
    return (SB.data.charms || []).filter(function (c) { return c.clan === clan || c.clan === 'neutral'; });
  };
  // n distinct charm ids; two thirds from the main clan pool, one third from the side clan pool
  R.rollCharms = function (run, rng, n) {
    var out = [];
    var guard = 0;
    while (out.length < n && guard++ < 40) {
      var useMain = rng.next() < 2 / 3;
      var pool = R.charmPool(useMain ? run.clan : run.side).filter(function (c) { return out.indexOf(c.id) < 0; });
      if (!pool.length) pool = (SB.data.charms || []).filter(function (c) { return out.indexOf(c.id) < 0; });
      var p = rng.pick(pool);
      if (p) out.push(p.id);
    }
    return out;
  };
  R.charmFits = function (inst, charm) {
    var def = CC().card(inst.id);
    if (!def || def.type === 'curse' || def.rarity === 'token') return false;
    var t = def.type === 'champion' ? 'unit' : def.type;
    if (charm.fits.indexOf('any') < 0 && charm.fits.indexOf(t) < 0) return false;
    var req = charm.requires || {}, k = def.keywords || {};
    if (req.minCost != null && (typeof def.cost !== 'number' || def.cost < req.minCost)) return false;
    if (req.lacksKeyword && k[req.lacksKeyword]) return false;
    if (req.hasKeyword && !k[req.hasKeyword]) return false;
    return true;
  };

  /* ------------------------------------------------------------------ fish */
  R.fishBase = function (run, kind) {
    var r = rules(), a = actIdx(run);
    var table = { prowl: r.fish_prowl, night: r.fish_night, elite: r.fish_elite, boss: r.fish_boss };
    var row = table[kind] || [12, 16, 20];
    return row[a] || 0;
  };
  R.rollFish = function (run, rng, kind) {
    var base = R.fishBase(run, kind);
    if (kind === 'boss') return base;
    var v = rules().fish_variance || 2;
    var amt = base + rng.int(-v, v);
    var rm = SB.run.rankMods ? SB.run.rankMods(run) : {};
    if (kind === 'prowl' && rm.prowlFishMult) amt = Math.round(amt * rm.prowlFishMult);
    return Math.max(0, amt);
  };

  /* ------------------------------------------------------------------ the node roll */
  // Called once on node entry. Everything the player may be offered after victory is decided here and stored.
  // ctx: {kind:'prowl'|'night'|'elite'|'boss', node, mystery:bool, event:{fish,draft,relic}}
  R.rollForNode = function (run, node, ctx) {
    var kind = ctx.kind;
    var rng = SB.run.rngFor(run.seed, 'loot', node.id + (ctx.event ? ':event' : ''));
    var out = { kind: kind, nodeId: node.id, nightNo: node.nightNo || null, act: run.act };
    var rank = SB.run.rankMods(run);
    if (ctx.event) {
      var ev = ctx.event;
      out.fish = ev.fish || 0;
      out.event = true;
      if (ev.draft) {
        var d0 = R.rollDraft(run, rng, 'prowl', { count: 3 });
        R.updatePity(run, d0.hasRare);
        out.draft = { ids: d0.ids, skipFish: rules().fish_skip_draft || 6 };
      }
      if (ev.relic) {
        var rid = R.rollRelic(run, rng, 'event', typeof ev.relic === 'string' ? ev.relic : undefined);
        if (rid) out.relic = { choices: [rid], forced: true, source: 'event' };
      }
      return out;
    }
    out.fish = R.rollFish(run, rng, kind);
    if (ctx.mystery) out.fish += 10;
    var firstDraft = !(run.stats && run.stats.draftsSeen);
    if (kind === 'boss') {
      var bd = R.rollDraft(run, rng, 'boss', { count: rules().boss_rare_choices || 3, rarities: ['rare', 'uncommon'] });
      // make sure at least one Rare, odds say all Rare
      R.updatePity(run, true);
      out.draft = { ids: bd.ids, skipFish: rules().fish_skip_draft || 6, big: true };
      var rels = R.rollBossRelics(run, rng, 3);
      out.relic = { choices: rels, forced: false, source: 'boss', pick: 1 };
      out.charm = { choices: R.rollCharms(run, rng, 3), pick: 1, of: 3 };
    } else {
      var dr = R.rollDraft(run, rng, kind === 'elite' ? 'elite' : (kind === 'night' ? 'night' : 'prowl'),
        firstDraft && kind === 'prowl' ? { mainOnly: true, rarities: ['common', 'uncommon'] } : {});
      R.updatePity(run, dr.hasRare);
      out.draft = { ids: dr.ids, skipFish: rules().fish_skip_draft || 6 };
      if (kind === 'elite') {
        var rid2 = R.rollRelic(run, rng, 'elite');
        if (rid2) out.relic = { choices: [rid2], forced: true, source: 'elite' };
      }
      if (kind === 'night' && node.nightNo && (node.nightNo - 1) % 3 === 0) {
        out.charm = { choices: R.rollCharms(run, rng, 2), pick: 1, of: 2 };
      }
    }
    out.rankFishMult = rank.prowlFishMult || 1;
    return out;
  };
})();
