/* SUNBEAM SIEGE card instances (agent C1).
 * SB.cardInst.make(id, opts) creates a deck instance. SB.cardInst.effective(inst) computes the display card
 * in the order fixed by A06 section 2:
 *   printed card -> evolution form (separate card id) -> fork patch -> "+" upgrade patch -> scratches
 *   (addStat first, then mulStat rounded up) -> champion tiers -> mastery -> kneading -> run growth.
 * The result is a plain JSON-safe object used by the battle and by SB.ui.card.
 * Instance shape (API.md):
 *   { uid, id, scratches:[upgradeIds], fork, knead:{attack,health,value}, plays, masteryRank,
 *     growth:{power,health}, lives, maxLives, champion:{tiers:[optionIds]}, slots, evoGrowth, origin }
 * The special scratch id "plus" applies the card's printed A03 "upgrade" patch.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var U = SB.util;
  var CI = SB.cardInst = SB.cardInst || {};

  var uidCounter = 0;
  CI.resync = function (deck) {
    (deck || []).forEach(function (i) {
      var m = /^c_(\d+)$/.exec(i && i.uid || '');
      if (m) uidCounter = Math.max(uidCounter, parseInt(m[1], 10));
    });
    return uidCounter;
  };
  function nextUid(opts) {
    if (opts && opts.uid) return opts.uid;
    if (opts && opts.run) { opts.run.nextUid = (opts.run.nextUid || 0) + 1; return 'c_' + opts.run.nextUid; }
    uidCounter++;
    return 'c_' + uidCounter;
  }

  function def(id) { return SB.content.card(id); }

  CI.defaultLives = function (d) {
    if (!d) return 1;
    if (d.type === 'champion') return (d.stats && d.stats.lives) || 9;
    if (d.stats && d.stats.lives) return d.stats.lives;
    var tags = d.tags || [];
    if (tags.indexOf('large') >= 0) return 4;
    if (tags.indexOf('kitten') >= 0) return 2;
    return 3;
  };

  CI.make = function (id, opts) {
    opts = opts || {};
    var d = def(id);
    var rid = d ? d.id : id;
    var isCat = d && (d.type === 'unit' || d.type === 'champion');
    var lives = isCat ? CI.defaultLives(d) : 0;
    var inst = {
      uid: nextUid(opts), id: rid, scratches: [], fork: null,
      knead: { attack: 0, health: 0, value: 0 }, plays: 0, masteryRank: 0,
      growth: { power: 0, health: 0 }, lives: lives, maxLives: lives,
      champion: { tiers: [] }, slots: 0, evoGrowth: 0, origin: opts.origin || 'draft'
    };
    if (d) {
      var r = d.rarity;
      inst.slots = d.type === 'champion' ? 2 : (r === 'rare' || r === 'legendary' ? 2 : (r === 'curse' || r === 'token' ? 0 : 1));
    }
    return inst;
  };

  // Starting deck per RULES / A03 section 7: Champion, 4 main basics, 2 Swat, 2 Catnap, 1 Cardboard Box, 1 side basic.
  var CLAN_BASIC = { alley: 'alley_basic_kitten', hearth: 'hearth_basic_kitten', moon: 'moon_basic_kitten', mischief: 'mischief_basic_kitten', neutral: 'neutral_house_cat' };
  CI.clanBasic = function (clan) { return CLAN_BASIC[SB.content.clanId(clan)] || 'neutral_house_cat'; };
  CI.starterDeck = function (clan, side, championId, opts) {
    var ids = [championId];
    var main = CI.clanBasic(clan), sd = CI.clanBasic(side || 'neutral');
    for (var i = 0; i < 4; i++) ids.push(main);
    ids.push('neutral_swat', 'neutral_swat', 'neutral_catnap', 'neutral_catnap', 'neutral_cardboard_box', sd);
    return ids.map(function (id) { return CI.make(id, Object.assign({ origin: 'start' }, opts || {})); });
  };

  // ---- patch helpers -------------------------------------------------------
  var DEFAULT_THRESHOLDS = [3, 7, 12];
  var CHAMP_THRESHOLDS = [4, 9, 15];

  function cloneEffects(e) { return e ? U.deepClone(e) : {}; }

  function normTrig(t) {
    return (SB.engine && SB.engine.normTrigger) ? SB.engine.normTrigger(t) : t;
  }

  // Add delta to the card's "main number": first numeric amount in onPlay that is not a Zoomies or lives effect.
  function addMainValue(card, delta) {
    if (!delta) return;
    var skip = { zoomies: 1, lives: 1, draw: 0 };
    // toys act on their turn triggers, so a toy with no number on play grows its Start or End of turn number instead
    var lists = [(card.effects && card.effects.onPlay) || []];
    if (card.type === 'toy') lists.push((card.effects && card.effects.onTurnStart) || [], (card.effects && card.effects.onTurnEnd) || []);
    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e && typeof e.amount === 'number' && !skip[e.type]) { e.amount += delta; return; }
        if (e && e.amount && typeof e.amount === 'object' && typeof e.amount.base === 'number' && !skip[e.type]) { e.amount.base += delta; return; }
      }
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

  function addGroupTrigger(card, op) {
    var t = normTrig(op.when || op.trigger);
    var grp = { type: 'group', effects: U.deepClone(op.do || op.effects || []) };
    if (op.if) grp.if = U.deepClone(op.if);
    if (op.limit) grp.limit = U.deepClone(op.limit);
    if (op.oncePerTurn) grp.limit = { per: 'turn', n: 1 };
    if (op.oncePerFight || op.once) grp.limit = { per: 'fight', n: 1 };
    if (op.capPerFight) grp.limit = { per: 'fight', n: op.capPerFight };
    if (op.when2) grp.when2 = op.when2;
    card.effects[t] = (card.effects[t] || []).concat([grp]);
  }

  // Apply A06 style ops (champion options, scratches) to the working card.
  function applyOps(card, ops, phase) {
    (ops || []).forEach(function (o) {
      if (!o) return;
      if (phase === 'add' && (o.op === 'mulStat')) return;
      if (phase === 'mul' && o.op !== 'mulStat') return;
      switch (o.op) {
        case 'addStat': {
          var st = o.stat === 'attack' ? 'power' : o.stat;
          if (st === 'power' || st === 'health') card.stats[st] = (card.stats[st] || 0) + o.value;
          else if (st === 'cost') { if (card.cost !== null && card.cost !== 'X') card.cost = Math.max(o.min !== undefined ? o.min : 0, card.cost + o.value); }
          else if (st === 'value') addMainValue(card, o.value);
          else if (st === 'charges') card.charges = (card.charges || 0) + o.value;
          else card.mods[st] = (card.mods[st] || 0) + o.value; // knockShatter, restedCap, stretchPerRested ...
          break;
        }
        case 'mulStat': {
          var s2 = o.stat === 'attack' ? 'power' : o.stat;
          if (card.stats[s2] !== undefined) card.stats[s2] = Math.ceil(card.stats[s2] * o.factor);
          break;
        }
        case 'grantKeyword': mergeKeyword(card, o.keyword, o.n !== undefined ? o.n : o.amount); break;
        case 'addTrigger': addGroupTrigger(card, o); break;
        case 'setFlag': {
          if (o.flag === 'retain' || o.flag === 'innate') card.keywords[o.flag] = true;
          else if (o.flag === 'noExhaust') card.keywords.exhaust = false;
          else card.flags[o.flag] = (o.value === undefined ? true : o.value);
          break;
        }
        case 'addLives': /* handled on the instance by CI.applyScratch */ break;
        case 'addSlot': break;
        case 'grantMasteryRank': break;
        case 'addAura': card.aura.push({ stat: o.stat, amount: o.amount, target: o.target, 'if': o.if, filter: o.filter }); break;
        default: U.warnOnce('upgradeop:' + o.op, 'unsupported upgrade op ' + o.op);
      }
    });
  }

  // A03 9.4 patch (plus upgrade, forks) and A06 MM champion patches.
  function applyPatch(card, p) {
    if (!p) return;
    if (p.cost !== undefined) card.cost = p.cost;
    if (p.targeting) card.targeting = p.targeting;
    if (p.stats) Object.keys(p.stats).forEach(function (k) { card.stats[k] = p.stats[k]; });
    if (p.statsAdd) Object.keys(p.statsAdd).forEach(function (k) { card.stats[k] = (card.stats[k] || 0) + p.statsAdd[k]; });
    if (p.keywords) Object.keys(p.keywords).forEach(function (k) { if (p.keywords[k] === false) delete card.keywords[k]; else card.keywords[k] = p.keywords[k]; });
    if (p.text) card.text = p.text;
    if (p.effects) Object.keys(p.effects).forEach(function (t) { card.effects[normTrig(t)] = U.deepClone(p.effects[t]); });
    if (p.addEffects) Object.keys(p.addEffects).forEach(function (t) {
      var nt = normTrig(t);
      card.effects[nt] = (card.effects[nt] || []).concat(U.deepClone(p.addEffects[t]));
    });
    if (p.aura) card.aura = U.deepClone(p.aura);
    if (p.addAura) card.aura = card.aura.concat(U.deepClone(p.addAura));
    if (p.addActivated) card.activated = card.activated.concat(U.deepClone(U.toArray(p.addActivated)));
    if (p.setActivated) Object.keys(p.setActivated).forEach(function (id) {
      card.activated.forEach(function (a) { if (a.id === id) Object.keys(p.setActivated[id]).forEach(function (k) { a[k] = U.deepClone(p.setActivated[id][k]); }); });
    });
    if (p.rules) Object.keys(p.rules).forEach(function (k) { card.rules[k] = p.rules[k]; });
    if (p.statusCapAdd) Object.keys(p.statusCapAdd).forEach(function (k) { card.statusCapAdd[k] = (card.statusCapAdd[k] || 0) + p.statusCapAdd[k]; });
  }

  CI.findChampionOption = function (d, optionId) {
    var slots = (d && d.upgradeSlots) || [];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var opts = s.options || [s.a, s.b, s.c].filter(Boolean);
      for (var j = 0; j < opts.length; j++) if (opts[j].id === optionId) return Object.assign({ slot: s.slot || (i + 1) }, opts[j]);
    }
    return null;
  };

  function mastery(inst, d) {
    var th = (d && d.mastery && d.mastery.thresholds) || (d && d.type === 'champion' ? CHAMP_THRESHOLDS : DEFAULT_THRESHOLDS);
    return th;
  }
  CI.masteryThresholds = function (inst, extraDelta) {
    var d = def(inst.id);
    var th = mastery(inst, d).slice();
    var delta = extraDelta || 0;
    return th.map(function (t) { return Math.max(2, t + delta); });
  };

  // Definition level flags: an array of names (Crumpet pileWeight2) or an object of name: value.
  function baseFlags(d) {
    var out = {};
    if (Array.isArray(d.flags)) d.flags.forEach(function (f) { out[f] = true; });
    else if (d.flags && typeof d.flags === 'object') Object.keys(d.flags).forEach(function (k) { out[k] = d.flags[k]; });
    return out;
  }

  // ---- effective -------------------------------------------------------------
  CI.effective = function (inst, opts) {
    var d = def(inst.id);
    if (!d) {
      U.warnOnce('nocard:' + inst.id, 'unknown card id ' + inst.id);
      return { uid: inst.uid, id: inst.id, name: U.titleCase(inst.id), type: 'spell', clan: 'neutral', rarity: 'common', cost: 0, text: 'Missing card.',
        keywords: {}, effects: {}, aura: [], activated: [], stats: null, tags: [], flags: {}, mods: {}, rules: {}, statusCapAdd: {} };
    }
    var card = {
      uid: inst.uid, id: d.id, name: d.name, nameBase: d.name, type: d.type, clan: d.clan, rarity: d.rarity,
      cost: d.cost === undefined ? 0 : d.cost, targeting: d.targeting || (d.type === 'unit' || d.type === 'champion' ? 'floor' : 'none'),
      stats: d.stats ? U.deepClone(d.stats) : null, keywords: U.deepClone(d.keywords || {}), text: d.text || '',
      flavor: d.flavor, tags: (d.tags || []).slice(), effects: cloneEffects(d.effects), aura: U.deepClone(d.aura || []),
      activated: U.deepClone(d.activated || []), art: d.art, flags: baseFlags(d), mods: {}, rules: {}, statusCapAdd: {},
      junk: d.junk, upgraded: false, scratchText: [], charges: d.charges || 0, spec: d.spec ? U.deepClone(d.spec) : null,
      shortName: d.shortName, title: d.title
    };
    // normalize effect trigger names
    var norm = {};
    Object.keys(card.effects).forEach(function (t) { var n = normTrig(t); norm[n] = (norm[n] || []).concat(card.effects[t]); });
    card.effects = norm;

    // 1. fork replaces named effects
    if (inst.fork) {
      var fk = SB.content.fork(inst.fork);
      if (fk) {
        applyPatch(card, fk.patch);
        card.nameSub = fk.name; card.name = d.name + ': ' + fk.name; card.upgraded = true;
        if (fk.text) card.text = fk.text;
      }
    }
    // 2. printed "+" upgrade and scratches in applied order
    var plus = inst.scratches && inst.scratches.indexOf('plus') >= 0;
    if (plus && d.upgrade) {
      applyPatch(card, d.upgrade);
      if (!inst.fork) card.name = d.name + '+';
      card.upgraded = true;
    }
    var ups = (inst.scratches || []).filter(function (s) { return s !== 'plus'; }).map(function (id) { return SB.content.upgrade(id); }).filter(Boolean);
    ups.forEach(function (u) { applyOps(card, u.effects, 'add'); if (u.text) card.scratchText.push(u.text); });
    ups.forEach(function (u) { applyOps(card, u.effects, 'mul'); });
    if (ups.length) card.upgraded = true;
    // 3. champion tiers
    if (d.type === 'champion') {
      var tiers = (inst.champion && inst.champion.tiers) || [];
      var paths = [];
      var tierInfo = [];
      tiers.forEach(function (oid) {
        var op = CI.findChampionOption(d, oid);
        if (!op) { U.warnOnce('champopt:' + oid, 'unknown champion option ' + oid); return; }
        if (op.ops) applyOps(card, op.ops, 'add'), applyOps(card, op.ops, 'mul');
        if (op.patch) applyPatch(card, op.patch);
        if (op.text && d.upgradeSlots && !op.patch) card.scratchText.push(op.text);
        paths.push((op.path || '').toUpperCase());
        tierInfo.push({ id: oid, name: op.name, path: op.path, text: op.text });
      });
      if (paths.length === 3 && paths[0] && paths.every(function (p) { return p === paths[0]; }) && d.finalForms && d.finalForms[paths[0]]) {
        var ff = d.finalForms[paths[0]];
        applyOps(card, ff.ops, 'add'); applyOps(card, ff.ops, 'mul');
        if (ff.patch) applyPatch(card, ff.patch);
        card.finalForm = { id: ff.id, name: ff.name, text: ff.text };
      }
      card.champion = { tiers: tierInfo, path: paths[0] || null, finalForm: card.finalForm || null };
      if (tiers.length) card.upgraded = true;
    }
    // 4. mastery rank gains
    var rank = inst.masteryRank || 0;
    if (rank >= 1 && card.stats) {
      if (card.type === 'unit' || card.type === 'champion') {
        card.stats.power += 1;
        if (rank >= 2) card.stats.health += 3;
        if (d.type === 'champion') { if (rank >= 1) card.stats.power += 1; if (rank >= 2) card.stats.health += 3; }
      }
    } else if (rank >= 1 && (card.type === 'spell' || card.type === 'toy')) {
      addMainValue(card, Math.min(rank, 2));
    }
    // 5. kneading and run growth
    var k = inst.knead || {};
    if (card.stats) {
      card.stats.power += (k.attack || 0) + ((inst.growth && inst.growth.power) || 0);
      card.stats.health += (k.health || 0) + ((inst.growth && inst.growth.health) || 0);
    }
    if (k.value) addMainValue(card, k.value);

    // lives and derived display fields
    if (card.stats) {
      card.lives = inst.lives !== undefined ? inst.lives : card.stats.lives;
      card.maxLives = inst.maxLives !== undefined ? inst.maxLives : card.stats.lives;
      card.power = card.stats.power; card.health = card.stats.health; card.size = card.stats.size || 1;
      if (card.flags && card.flags.survive1) card.survive1 = true;
    }
    card.mastery = { rank: rank, plays: inst.plays || 0, thresholds: CI.masteryThresholds(inst, card.flags && card.flags.fastLearner ? -1 : 0) };
    card.knead = { attack: k.attack || 0, health: k.health || 0, value: k.value || 0 };
    card.scratches = (inst.scratches || []).slice();
    card.fork = inst.fork || null;
    card.unplayable = card.cost === null || !!card.keywords.unplayable;
    card.costX = card.cost === 'X';
    card.baseCost = card.cost;
    return card;
  };

  // Effective view of a bare definition (tokens, created cards) without an instance.
  CI.effectiveDef = function (id, uid) {
    var inst = CI.make(id, { uid: uid || ('t_' + id) });
    return CI.effective(inst);
  };

  // ---- upgrades -------------------------------------------------------------
  CI.hasKeyword = function (inst, k) { var e = CI.effective(inst); return !!e.keywords[k]; };

  CI.canApply = function (inst, upgradeId) {
    var d = def(inst.id);
    if (!d) return { ok: false, reason: 'unknown card' };
    if (d.type === 'curse' || d.rarity === 'token') return { ok: false, reason: 'cannot upgrade' };
    if (upgradeId === 'plus') {
      if (!d.upgrade) return { ok: false, reason: 'no upgrade' };
      if (inst.scratches.indexOf('plus') >= 0) return { ok: false, reason: 'already upgraded' };
      return { ok: true };
    }
    var u = SB.content.upgrade(upgradeId);
    if (!u) return { ok: false, reason: 'unknown upgrade' };
    var slots = inst.slots || 1;
    var used = inst.scratches.length + (inst.fork ? 1 : 0);
    if (used >= slots && !(inst.scratches.indexOf('plus') >= 0 && used - 1 < slots)) { /* overscratch is a shop decision */ }
    if (inst.scratches.indexOf(upgradeId) >= 0) return { ok: false, reason: 'already applied' };
    if (SB.data.upgradeFits && !SB.data.upgradeFits(d, u)) return { ok: false, reason: 'does not fit' };
    if (u.group) {
      var clash = inst.scratches.some(function (s) { var o = SB.content.upgrade(s); return o && o.group === u.group; });
      if (clash) return { ok: false, reason: 'group ' + u.group };
    }
    return { ok: true };
  };

  // Applies a scratch to the instance, including the immediate instance-level ops (lives, mastery rank, slots).
  CI.applyScratch = function (inst, upgradeId) {
    var ok = CI.canApply(inst, upgradeId);
    if (!ok.ok) return ok;
    inst.scratches.push(upgradeId);
    var u = SB.content.upgrade(upgradeId);
    if (u) (u.effects || []).forEach(function (o) {
      if (o.op === 'addLives') { inst.maxLives = Math.min(9, inst.maxLives + o.n); inst.lives = Math.min(inst.maxLives, inst.lives + o.n); }
      if (o.op === 'grantMasteryRank') inst.masteryRank = Math.min(3, (inst.masteryRank || 0) + o.n);
      if (o.op === 'addSlot') inst.slots = Math.min(3, (inst.slots || 1) + o.n);
    });
    return { ok: true };
  };

  CI.pickChampionOption = function (inst, optionId) {
    var d = def(inst.id);
    var op = CI.findChampionOption(d, optionId);
    if (!op) return { ok: false, reason: 'unknown option' };
    inst.champion = inst.champion || { tiers: [] };
    inst.champion.tiers.push(optionId);
    (op.ops || []).forEach(function (o) {
      if (o.op === 'addLives') { inst.maxLives = Math.min(9, inst.maxLives + o.n); inst.lives = Math.min(inst.maxLives, inst.lives + o.n); }
    });
    if (op.patch && op.patch.statsAdd && op.patch.statsAdd.lives) {
      inst.maxLives = Math.min(9, inst.maxLives + op.patch.statsAdd.lives); inst.lives = Math.min(inst.maxLives, inst.lives + op.patch.statsAdd.lives);
    }
    return { ok: true };
  };
})();
