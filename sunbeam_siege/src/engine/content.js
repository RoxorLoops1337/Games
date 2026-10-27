/* SUNBEAM SIEGE content lookup (agent C1).
 * Builds SB.content from every SB.data.* array at load. Handles id aliases, forks, encounters, and
 * SB.content.validate() which reports every unknown op, trigger, status, keyword, target, check and counter
 * that data uses and the engine registries (SB.engine.*) do not implement.
 * Load order: util.js, content.js, registry.js, card-inst.js, battle.js, battle-ai.js.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  SB.data = SB.data || {};
  var U = SB.util;
  var C = SB.content = SB.content || {};

  // ---- alias map (A03 bare ids and old clan names) ------------------------
  var ALIASES = {
    hairball: 'curse_hairball',
    swat: 'neutral_swat',
    catnap: 'neutral_catnap',
    cardboard_box: 'neutral_cardboard_box',
    bath_time: 'curse_bath_time',
    vet_appointment: 'curse_vet_appointment',
    wet_sock: 'curse_wet_sock',
    cucumber: 'curse_cucumber',
    off_the_shelf: 'alley_off_the_shelf',
    empty_collar: 'token_empty_collar',
    flat_pack: 'token_flat_pack',
    yarn_ball: 'token_yarn_ball',
    house_cat: 'neutral_house_cat',
    window_watcher: 'neutral_window_watcher',
    alley_basic_unit: 'alley_basic_kitten',
    hearth_basic_unit: 'hearth_basic_kitten',
    lap_basic_unit: 'hearth_basic_kitten',
    moon_basic_unit: 'moon_basic_kitten',
    mischief_basic_unit: 'mischief_basic_kitten'
  };
  C.aliases = ALIASES;
  var CLAN_ALIASES = { lap: 'hearth', shadow: 'moon', yarn: 'mischief' };
  C.clanId = function (c) { return CLAN_ALIASES[c] || c; };

  var CARD_ARRAYS = ['cardsAlley', 'cardsHearth', 'cardsMischief', 'cardsMoon', 'cardsNeutral', 'cardsStarters',
    'championsAH', 'championsMM', 'championsAHTokens'];
  var PEST_ARRAYS = ['enemiesRodents', 'enemiesDogs', 'enemiesHousehold', 'enemiesWild', 'enemiesElites',
    'enemiesBosses', 'enemiesBossAdds'];

  var idx = null;

  function sizeNum(p) {
    var s = p.size;
    if (typeof s === 'number') return s;
    var table = { small: 1, medium: 2, large: 3, boss: 5 };
    if (typeof p.room === 'number') return p.room;
    if (typeof s === 'string' && table[s.toLowerCase()]) return table[s.toLowerCase()];
    return 1;
  }

  function normActs(p) {
    var a = p.acts || p.act;
    if (typeof a === 'number') return [a, a];
    if (Array.isArray(a)) return a.length === 1 ? [a[0], a[0]] : [a[0], a[1]];
    return [1, 3];
  }

  var TRAIT_NAMES = ['climber', 'heavy', 'slippery', 'sneaky', 'light', 'anchored', 'costly', 'nocturnal',
    'tracker', 'glider', 'spectral', 'stoic', 'untargetable', 'court', 'flying', 'cleaner'];

  function normPest(raw) {
    if (!raw) return null;
    var traitSet = {};
    (raw.traits || []).concat(raw.tags || []).forEach(function (t) { traitSet[String(t).toLowerCase()] = true; });
    var tier = raw.tier || 'pest';
    var n = {
      id: raw.id, name: raw.name || U.titleCase(raw.id), tier: tier,
      acts: normActs(raw), size: sizeNum(raw),
      hp: raw.hp || 1, fluff: raw.fluff !== undefined ? raw.fluff : (raw.hide || 0),
      traits: raw.traits || [], tags: raw.tags || [], traitSet: traitSet,
      threat: raw.threat || 1, family: raw.family || null,
      pattern: raw.pattern || { type: 'cycle', actions: [{ kind: 'wait', label: 'Wait' }] },
      passives: raw.passives || [], onSpawn: raw.onSpawn || [], onDeath: raw.onDeath || [],
      onHit: raw.onHit || [], phases: raw.phases || [], hazards: raw.hazards || [], meters: raw.meters || null,
      spawnFloor: raw.spawnFloor || raw.habitat || 1, nightVisitor: !!raw.nightVisitor,
      hiddenIntent: !!raw.hiddenIntent, immune: raw.immune || [], hitCap: raw.hitCap || 0,
      parasite: raw.parasite || null, untargetable: !!raw.untargetable, rageFloor: raw.rageFloor || null,
      rewards: raw.rewards || null, art: raw.art, flavor: raw.flavor, raw: raw
    };
    if (tier === 'boss' || tier === 'final') n.isBoss = true;
    return n;
  }

  function normCard(raw) {
    return raw; // cards are used as written; SB.cardInst computes the effective view
  }

  function build() {
    var D = SB.data;
    idx = { cards: {}, cardList: [], pests: {}, pestList: [], relics: {}, relicList: [], events: {}, eventList: [],
      upgrades: {}, upgradeList: [], forks: [], enc: {}, evo: {}, dupes: [] };
    function addCard(c) {
      if (!c || !c.id) return;
      if (idx.cards[c.id]) { idx.dupes.push('card:' + c.id); return; }
      idx.cards[c.id] = normCard(c); idx.cardList.push(c);
    }
    CARD_ARRAYS.forEach(function (k) { (D[k] || []).forEach(addCard); });
    if (D.tutorial && D.tutorial.cards) D.tutorial.cards.forEach(addCard);
    (D.evolutions || []).forEach(function (e) {
      idx.evo[e.id] = e;
      (e.stages || []).forEach(function (s) { addCard(s); idx.evo[s.id] = e; });
    });
    var addPest = function (p) {
      if (!p || !p.id) return;
      if (idx.pests[p.id]) { idx.dupes.push('pest:' + p.id); return; }
      var n = normPest(p); idx.pests[p.id] = n; idx.pestList.push(n);
    };
    PEST_ARRAYS.forEach(function (k) { (D[k] || []).forEach(addPest); });
    if (D.tutorial && D.tutorial.enemies) D.tutorial.enemies.forEach(function (p) { var q = Object.assign({}, p, { tier: 'tutorial' }); addPest(q); });
    ['relics', 'relicsExtra'].forEach(function (k) {
      (D[k] || []).forEach(function (r) { if (r && r.id) { if (idx.relics[r.id]) idx.dupes.push('relic:' + r.id); else { idx.relics[r.id] = r; idx.relicList.push(r); } } });
    });
    (D.events || []).forEach(function (e) { idx.events[e.id] = e; idx.eventList.push(e); });
    (D.upgrades || []).forEach(function (u) { idx.upgrades[u.id] = u; idx.upgradeList.push(u); });
    idx.forks = D.forks || [];
    // encounters
    (D.enemiesBosses || []).forEach(function (b) { if (b.encounter && b.encounter.id) idx.enc[b.encounter.id] = Object.assign({ type: b.tier === 'final' ? 'boss' : 'boss', bossId: b.id, act: b.act }, b.encounter); });
    if (D.tutorial && D.tutorial.fights) D.tutorial.fights.forEach(function (f) { idx.enc[f.id] = Object.assign({ type: 'prowl', tutorial: true, name: f.title }, f); });
    Object.keys(EXTRA_ENCOUNTERS).forEach(function (k) { if (!idx.enc[k]) idx.enc[k] = EXTRA_ENCOUNTERS[k]; });
  }

  // Event encounters named by events.js NEEDS. Built from existing pests.
  function sp(id, floor, at) { return { id: id, floor: floor || 1, at: at || 'back' }; }
  var EXTRA_ENCOUNTERS = {
    enc_evt_rat_toll: { id: 'enc_evt_rat_toll', name: 'The Toll Rats', type: 'prowl', act: 1, impatienceRound: 16,
      waves: [{ round: 1, spawns: [sp('pest_alley_rat'), sp('pest_field_mouse'), sp('pest_field_mouse')] },
        { round: 3, spawns: [sp('pest_alley_rat'), sp('pest_pantry_mouse')] }] },
    enc_evt_dust_bunnies: { id: 'enc_evt_dust_bunnies', name: 'Dust Bunnies', type: 'prowl', act: 2, impatienceRound: 16,
      waves: [{ round: 1, spawns: [sp('pest_add_dust_bunny'), sp('pest_add_dust_bunny'), sp('pest_add_dust_bunny')] },
        { round: 3, spawns: [sp('pest_add_dust_bunny'), sp('pest_add_dust_bunny'), sp('pest_lint_roller')] }] },
    enc_evt_roomba_revenge: { id: 'enc_evt_roomba_revenge', name: 'Roomba Revenge', type: 'prowl', act: 2, impatienceRound: 16,
      waves: [{ round: 1, spawns: [sp('pest_robot_vacuum'), sp('pest_add_dust_bunny')] },
        { round: 3, spawns: [sp('pest_add_dust_bunny'), sp('pest_add_dust_bunny')] }] },
    enc_evt_gerald_cousins: { id: 'enc_evt_gerald_cousins', name: 'Gerald\'s Cousins', type: 'prowl', act: 2, impatienceRound: 16,
      waves: [{ round: 1, spawns: [sp('pest_raccoon'), sp('pest_raccoon')] }, { round: 3, spawns: [sp('pest_raccoon')] }] },
    enc_evt_roomba_mk2: { id: 'enc_evt_roomba_mk2', name: 'Roomba Mark Two', type: 'elite', act: 3, impatienceRound: 16,
      waves: [{ round: 1, spawns: [sp('pest_robot_vacuum'), sp('pest_robot_vacuum')] },
        { round: 3, spawns: [sp('pest_add_dust_bunny'), sp('pest_add_dust_bunny'), sp('pest_mop')] }] },
    enc_evt_chandelier_spiders: { id: 'enc_evt_chandelier_spiders', name: 'Chandelier Spiders', type: 'prowl', act: 3, impatienceRound: 16,
      waves: [{ round: 1, spawns: [sp('pest_spider', 3), sp('pest_spider', 3)] }, { round: 3, spawns: [sp('pest_spider', 2)] }] },
    enc_evt_pigeon_flock: { id: 'enc_evt_pigeon_flock', name: 'Pigeon Flock', type: 'prowl', act: 3, impatienceRound: 16,
      waves: [{ round: 1, spawns: [sp('pest_crow', 2), sp('pest_crow', 3)] }, { round: 3, spawns: [sp('pest_crow', 3), sp('pest_magpie', 2)] }] }
  };

  C.rebuild = function () { build(); return C; };
  function ix() { if (!idx) build(); return idx; }

  // ---- lookups ---------------------------------------------------------------
  C.resolveId = function (id) {
    if (!id) return id;
    var I = ix();
    if (I.cards[id] || I.pests[id] || I.relics[id]) return id;
    if (ALIASES[id]) return ALIASES[id];
    var m = /^(lap|shadow|yarn)_(.+)$/.exec(id);
    if (m) { var alt = C.clanId(m[1]) + '_' + m[2]; if (I.cards[alt]) return alt; }
    var prefixes = ['neutral_', 'curse_', 'token_', 'alley_', 'hearth_', 'moon_', 'mischief_'];
    for (var i = 0; i < prefixes.length; i++) if (I.cards[prefixes[i] + id]) return prefixes[i] + id;
    return id;
  };
  C.card = function (id) { var I = ix(); return I.cards[id] || I.cards[C.resolveId(id)]; };
  C.cards = function () { return ix().cardList.slice(); };
  C.hasCard = function (id) { return !!C.card(id); };
  C.pest = function (id) { var I = ix(); return I.pests[id] || null; };
  C.pests = function () { return ix().pestList.slice(); };
  C.relic = function (id) { return ix().relics[id] || null; };
  C.relics = function () { return ix().relicList.slice(); };
  C.event = function (id) { return ix().eventList.length ? ix().events[id] || null : null; };
  C.events = function () { return ix().eventList.slice(); };
  C.upgrade = function (id) { return ix().upgrades[id] || null; };
  C.upgrades = function () { return ix().upgradeList.slice(); };
  C.champion = function (id) { var c = C.card(id); return c && c.type === 'champion' ? c : null; };
  C.champions = function () { return ix().cardList.filter(function (c) { return c.type === 'champion' && !c.tutorialOnly; }); };
  C.evolution = function (id) { return ix().evo[id] || null; };
  C.encounter = function (id) { return ix().enc[id] || null; };
  C.registerEncounter = function (def) { if (def && def.id) ix().enc[def.id] = def; return def; };
  C.encounters = function () { var I = ix(); return Object.keys(I.enc).map(function (k) { return I.enc[k]; }); };

  C.enemyIdsByAct = function (act, opts) {
    opts = opts || {};
    return ix().pestList.filter(function (p) {
      if (p.tier !== 'pest') return false;
      if (p.raw && p.raw.tutorialOnly) return false;
      return p.acts[0] <= act && act <= p.acts[1];
    }).map(function (p) { return p.id; });
  };
  C.eliteIdsByAct = function (act) { return ix().pestList.filter(function (p) { return p.tier === 'elite' && p.acts[0] <= act && act <= p.acts[1]; }).map(function (p) { return p.id; }); };
  C.bossIdsByAct = function (act) { return ix().pestList.filter(function (p) { return (p.tier === 'boss') && p.acts[0] === act; }).map(function (p) { return p.id; }); };
  C.nightVisitorIds = function (act) {
    return ix().pestList.filter(function (p) { return p.nightVisitor && p.tier === 'pest' && p.acts[0] <= act && act <= p.acts[1]; }).map(function (p) { return p.id; });
  };

  // Forks for a card id: exact id, alias list, clan-prefixed id. Fuzzy matching by {type, clan, tags} is opt-in
  // (opts.fuzzy) and picks one family per card by a stable hash.
  C.forksFor = function (cardId, opts) {
    var I = ix(); var resolved = C.resolveId(cardId); var card = C.card(cardId);
    var out = [];
    I.forks.forEach(function (f) {
      var hit = f.card === cardId || f.card === resolved || (f.aliases || []).indexOf(cardId) >= 0 || (f.aliases || []).indexOf(resolved) >= 0;
      if (!hit && card && card.clan && f.card === String(card.id).replace(/^[a-z]+_/, '')) hit = (f.clan === C.clanId(card.clan) || f.clan === card.clan);
      if (hit) out = out.concat(f.options || []);
    });
    if (!out.length && opts && opts.fuzzy && card) {
      var fam = I.forks.filter(function (f) {
        var m = f.match || {};
        if (m.type && m.type !== card.type) return false;
        if (m.clan && m.clan !== C.clanId(card.clan)) return false;
        if (m.tags && !m.tags.every(function (t) { return (card.tags || []).indexOf(t) >= 0; })) return false;
        return true;
      });
      if (fam.length) out = fam[U.hash('fork', card.id) % fam.length].options || [];
    }
    return out;
  };
  C.fork = function (forkOptionId) {
    var I = ix();
    for (var i = 0; i < I.forks.length; i++) {
      var os = I.forks[i].options || [];
      for (var j = 0; j < os.length; j++) if (os[j].id === forkOptionId) return os[j];
    }
    return null;
  };

  // ---- usage scan (shared by validate and tests/coverage.js) ---------------
  var LIMIT_SCOPES = { turn: 1, round: 1, fight: 1, battle: 1, run: 1, act: 1 };
  var EFFECT_LIST_KEYS = { 'do': 1, then: 1, onDeath: 1, onSpawn: 1, onHit: 1, onKnocked: 1, onEnter: 1, onDeathEffects: 1, onStatusApplied: 1,
    onAnyDogDeath: 1, onHitBy: 1, pickup: 1, onPhase6: 1, onCatChase: 1, onCatAmbush: 1 };

  C.scanUsage = function () {
    var D = SB.data;
    var U2 = {
      ops: {}, triggers: {}, statuses: {}, targets: {}, checks: {}, counters: {}, keywords: {}, actions: {}, patterns: {},
      picks: {}, floorsSpecs: {}, passives: {}, mods: {}, upgradeOps: {}, flags: {}, stats: {}, hazards: {}, hooks: {},
      conds: {}, winIf: {}, traits: {}, floorStatuses: {}, durations: {}
    };
    function mark(cat, name, owner) {
      if (name === undefined || name === null || typeof name === 'object') return;
      name = String(name);
      var m = U2[cat][name] = U2[cat][name] || { count: 0, owners: [] };
      m.count++;
      if (owner && m.owners.length < 6 && m.owners.indexOf(owner) < 0) m.owners.push(owner);
    }
    function amountExpr(a, owner) {
      if (a && typeof a === 'object' && !Array.isArray(a)) {
        if (a.per) mark('counters', a.per, owner);
        if (a.fromStored) mark('counters', 'fromStored', owner);
      }
    }
    function ifList(list, owner) {
      U.toArray(list).forEach(function (c) {
        if (typeof c === 'string') { mark('conds', c, owner); return; }
        if (!c || typeof c !== 'object') return;
        if (c.check) mark('checks', c.check, owner);
        else Object.keys(c).forEach(function (k) { if (k !== 'op' && k !== 'value') mark('conds', k, owner); });
      });
    }
    var effectKeys = ['type', 'op'];
    function effect(e, owner) {
      if (!e || typeof e !== 'object') return;
      if (e.check && !(e.type || e.op && e.op !== '==')) { mark('checks', e.check, owner); return; }
      var name = e.type || e.op;
      if (typeof name !== 'string') return;
      mark('ops', name, owner);
      if (typeof e.target === 'string') mark('targets', e.target, owner);
      if (typeof e.who === 'string') mark('targets', e.who, owner);
      ['to', 'from', 'holder'].forEach(function (k) { if (typeof e[k] === 'string' && (name === 'spreadStatus' || name === 'trapCat')) mark('targets', e[k], owner); });
      if (typeof e.status === 'string') mark('statuses', e.status, owner);
      if (name === 'status' && typeof e.id === 'string') mark('statuses', e.id, owner);
      if (name === 'floorStatus' && typeof e.status === 'string') mark('floorStatuses', e.status, owner);
      if (name === 'grantKeyword' && e.keyword) mark('keywords', e.keyword, owner);
      if (name === 'resetKeyword' && e.keyword) mark('keywords', e.keyword, owner);
      if (e.duration) mark('durations', e.duration, owner);
      if (e.pick) mark('picks', e.pick, owner);
      amountExpr(e.amount, owner); amountExpr(e.times, owner); amountExpr(e.n, owner);
      if (e.if) ifList(e.if, owner);
      if (e.filter && Array.isArray(e.filter)) ifList(e.filter, owner);
      if (name === 'passive' || name === 'addTrigger') { if (e.trigger) mark('triggers', e.trigger, owner); if (e.when) mark('triggers', e.when, owner); }
      if (Array.isArray(e.effects)) e.effects.forEach(function (x) { effect(x, owner); });
      if (Array.isArray(e.then)) e.then.forEach(function (x) { effect(x, owner); });
      if (Array.isArray(e.do)) e.do.forEach(function (x) { effect(x, owner); });
      if (Array.isArray(e.onHit)) e.onHit.forEach(function (x) { effect(x, owner); });
      if (Array.isArray(e.onDeath)) e.onDeath.forEach(function (x) { effect(x, owner); });
      if (Array.isArray(e.outcomes)) e.outcomes.forEach(function (o) { (o.effects || []).forEach(function (x) { effect(x, owner); }); });
    }
    function effectsMap(map, owner) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach(function (t) {
        mark('triggers', t, owner);
        U.toArray(map[t]).forEach(function (e) { effect(e, owner); });
      });
    }
    function aura(list, owner) {
      U.toArray(list).forEach(function (a) {
        if (!a) return;
        if (a.target) mark('targets', a.target, owner);
        if (a.stat) mark('stats', 'aura:' + a.stat, owner);
        amountExpr(a.amount, owner);
        if (a.if) ifList(a.if, owner);
        if (a.filter) ifList(a.filter, owner);
      });
    }
    function keywords(k, owner) { if (k && typeof k === 'object') Object.keys(k).forEach(function (n) { mark('keywords', n, owner); }); }
    function patchObj(p, owner) {
      if (!p) return;
      if (p.keywords) keywords(p.keywords, owner);
      if (p.effects && !Array.isArray(p.effects)) effectsMap(p.effects, owner);
      if (p.addEffects) effectsMap(p.addEffects, owner);
      if (p.aura) aura(p.aura, owner);
      if (p.addAura) aura(p.addAura, owner);
      U.toArray(p.addActivated).forEach(function (a) { activated(a, owner); });
      if (p.setActivated) Object.keys(p.setActivated).forEach(function (k) { /* shallow merge, nothing to check */ });
      if (p.rules) Object.keys(p.rules).forEach(function (k) { mark('mods', 'rule:' + k, owner); });
      if (p.statusCapAdd) Object.keys(p.statusCapAdd).forEach(function (k) { mark('statuses', k, owner); });
    }
    function activated(a, owner) {
      if (!a) return;
      if (a.requires) ifList(a.requires, owner);
      U.toArray(a.effects).forEach(function (e) { effect(e, owner); });
      mark('flags', 'activated', owner);
    }
    function upgradeOps(ops, owner) {
      U.toArray(ops).forEach(function (o) {
        if (!o) return;
        mark('upgradeOps', o.op, owner);
        if (o.op === 'setFlag') mark('flags', o.flag, owner);
        if (o.op === 'addStat') mark('stats', o.stat, owner);
        if (o.op === 'mulStat') mark('stats', o.stat, owner);
        if (o.op === 'grantKeyword') mark('keywords', o.keyword, owner);
        if (o.op === 'addAura') { if (o.target) mark('targets', o.target, owner); if (o.if) ifList(o.if, owner); }
        if (o.op === 'addTrigger') {
          mark('triggers', o.when, owner);
          U.toArray(o.do).forEach(function (e) { effect(e, owner); });
          if (o.if) ifList(o.if, owner);
          if (o.when2) mark('flags', 'when2:' + o.when2, owner);
        }
      });
    }
    function pattern(p, owner) {
      if (!p) return;
      mark('patterns', p.type, owner);
      var acts = [];
      (p.actions || []).forEach(function (a) { acts.push(a.action || a); });
      (p.rules || []).forEach(function (r) { ifList(r.if, owner); if (r.action) acts.push(r.action); });
      if (p.else) pattern(p.else, owner);
      if (p.between) acts.push(p.between);
      if (p.onZero) acts.push(p.onZero);
      acts.forEach(function (a) { action(a, owner); });
    }
    function action(a, owner) {
      if (!a) return;
      mark('actions', a.kind || 'attack', owner);
      if (a.pick) mark('picks', a.pick, owner);
      if (a.floors !== undefined) mark('floorsSpecs', Array.isArray(a.floors) ? 'list' : String(a.floors), owner);
      if (a.kind === 'special' && a.op) mark('ops', a.op, owner);
      U.toArray(a.effects).forEach(function (e) { effect(e, owner); });
      U.toArray(a.onHit).forEach(function (e) { effect(e, owner); });
      if (a.then && a.then.kind) action(a.then, owner);
      if (a.status && a.kind === 'debuff') mark('statuses', a.status, owner);
      if (typeof a.dmg === 'object' && a.dmg) mark('flags', 'dynamicDmg', owner);
    }
    function pestDef(p) {
      var owner = p.id;
      pattern(p.pattern, owner);
      (p.phases || []).forEach(function (ph) {
        mark('flags', 'phase', owner);
        pattern(ph.pattern, owner);
        U.toArray(ph.onEnter).forEach(function (e) { effect(e, owner); });
        U.toArray(ph.passivesAdd).forEach(function (ps) { passiveDef(ps, owner); });
        if (ph.hazards) mark('flags', 'phaseHazards', owner);
      });
      (p.passives || []).forEach(function (ps) { passiveDef(ps, owner); });
      ['onSpawn', 'onDeath', 'onHit', 'onKnocked', 'onDeathEffects'].forEach(function (k) {
        if (p[k] && p[k].length) { mark('triggers', 'pest:' + k, owner); U.toArray(p[k]).forEach(function (e) { effect(e, owner); }); }
      });
      if (p.onStatusApplied) mark('triggers', 'pest:onStatusApplied', owner);
      if (p.onAnyDogDeath) mark('triggers', 'pest:onAnyDogDeath', owner);
      (p.hazards || []).forEach(function (h) { mark('hazards', h.id, owner); });
      (p.traits || []).concat(p.tags || []).forEach(function (t) { mark('traits', String(t).toLowerCase(), owner); });
      if (p.parasite) mark('flags', 'parasite', owner);
      if (p.meters) Object.keys(p.meters).forEach(function (m) { mark('flags', 'meter:' + m, owner); });
      if (p.encounter && p.encounter.winIf) winIf(p.encounter.winIf, owner);
    }
    function winIf(w, owner) {
      if (!w) return;
      mark('winIf', w.type, owner);
      U.toArray(w.conds).forEach(function (c) { winIf(c, owner); });
    }
    function passiveDef(ps, owner) {
      if (!ps) return;
      mark('passives', ps.id || (ps.rule ? 'rule:' + Object.keys(ps.rule).join('+') : 'text'), owner);
      if (ps.on) mark('triggers', 'pest:' + ps.on, owner);
      U.toArray(ps.effects).forEach(function (e) { effect(e, owner); });
      if (ps.rule) Object.keys(ps.rule).forEach(function (k) { mark('flags', 'rule:' + k, owner); });
    }

    // cards, champions, tokens
    var cards = ix().cardList;
    cards.forEach(function (c) {
      var o = c.id;
      keywords(c.keywords, o);
      effectsMap(c.effects, o);
      aura(c.aura, o);
      if (c.upgrade) patchObj(c.upgrade, o);
      U.toArray(c.activated).forEach(function (a) { activated(a, o); });
      (c.upgradeSlots || []).forEach(function (s) {
        var opts = s.options || [s.a, s.b, s.c].filter(Boolean);
        opts.forEach(function (op) {
          var oo = o + ':' + (op.id || '?');
          if (op.ops) upgradeOps(op.ops, oo);
          if (op.patch) patchObj(op.patch, oo);
        });
      });
    });
    // fork patches
    ix().forks.forEach(function (f) { (f.options || []).forEach(function (op) { patchObj(op.patch, op.id); }); });
    // upgrades
    ix().upgradeList.forEach(function (u) {
      upgradeOps(u.effects, u.id);
      if (u.requires) Object.keys(u.requires).forEach(function (k) { mark('flags', 'requires:' + k, u.id); });
    });
    // evolutions already added to cards through addCard (stages)
    // relics
    ix().relicList.forEach(function (r) {
      var o = r.id;
      (r.hooks || []).forEach(function (h) {
        mark('hooks', h.on, o);
        if (h.if) ifList(h.if, o);
        if (h.limit && h.limit.per) mark('flags', 'limit:' + h.limit.per, o);
        U.toArray(h.effects).forEach(function (e) { effect(e, o); });
      });
      if (r.mods) Object.keys(r.mods).forEach(function (m) { mark('mods', m, o); });
      U.toArray(r.pickup).forEach(function (e) { effect(e, o); });
    });
    // pests
    ix().pestList.forEach(function (p) { pestDef(p.raw); });
    (SB.data.enemiesBosses || []).forEach(function (b) { if (b.encounter) winIf(b.encounter.winIf, b.id); });
    return U2;
  };

  // ---- validate --------------------------------------------------------------
  // Registry names each usage category is compared against. SB.engine is created by registry.js.
  var CATEGORY_REGISTRY = {
    ops: 'ops', triggers: 'triggers', statuses: 'statuses', targets: 'targets', checks: 'checks', counters: 'counters',
    keywords: 'keywords', actions: 'actions', patterns: 'patterns', picks: 'picks', floorsSpecs: 'floorsSpecs',
    passives: 'passives', mods: 'mods', upgradeOps: 'upgradeOps', flags: 'flags', stats: 'stats', hazards: 'hazards',
    hooks: 'hooks', conds: 'conds', winIf: 'winIf', traits: 'traits', floorStatuses: 'floorStatuses', durations: 'durations'
  };
  // Categories that produce an error (unknown names the engine really needs) versus a warning.
  var ERROR_CATS = {};

  C.supported = function (cat, name) {
    var E = SB.engine;
    if (!E) return false;
    var reg = E[CATEGORY_REGISTRY[cat]];
    if (!reg) return true; // category not tracked by the engine
    if (typeof reg.has === 'function') return reg.has(name);
    return Object.prototype.hasOwnProperty.call(reg, name);
  };

  C.validate = function () {
    var errors = [], warnings = [];
    var I = ix();
    I.dupes.forEach(function (d) { errors.push('duplicate id ' + d); });
    // id format
    I.cardList.forEach(function (c) {
      if (!/^[a-z0-9_]+$/.test(c.id)) errors.push('bad card id ' + c.id);
      if ((c.type === 'unit' || c.type === 'champion') && !c.stats) errors.push('card ' + c.id + ' has no stats');
      if ((c.type === 'spell' || c.type === 'toy') && c.stats) warnings.push('card ' + c.id + ' is a ' + c.type + ' with stats');
      if (c.keywords && c.keywords.exhaust && c.keywords.reborn) errors.push('card ' + c.id + ' combines Exhaust and Reborn');
      if (c.keywords && c.keywords.fleeting && c.keywords.retain) errors.push('card ' + c.id + ' combines Fleeting and Retain');
    });
    // reference checks
    var refs = { cards: {}, relics: {}, enc: {}, pests: {} };
    function walk(o, owner) {
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, owner); }); return; }
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (k === 'card' && typeof v === 'string' && /^pest_/.test(v)) refs.pests[v] = owner;
        else if (k === 'card' && typeof v === 'string' && v !== 'cat') refs.cards[v] = owner;
        else if ((k === 'relic') && typeof v === 'string') { if (['common', 'uncommon', 'rare'].indexOf(v) < 0) refs.relics[v] = owner; }
        else if (k === 'encounter' && typeof v === 'string') refs.enc[v] = owner;
        else if ((k === 'id' || k === 'card') && typeof v === 'string' && /^pest_/.test(v) && owner) refs.pests[v] = owner;
        walk(v, owner);
      });
    }
    ['cardsAlley', 'cardsHearth', 'cardsMischief', 'cardsMoon', 'cardsNeutral', 'cardsStarters', 'championsAH', 'championsMM', 'relics', 'upgrades',
      'enemiesDogs', 'enemiesHousehold', 'enemiesRodents', 'enemiesWild', 'enemiesElites', 'enemiesBosses', 'enemiesBossAdds'].forEach(function (k) {
      (SB.data[k] || []).forEach(function (o) { walk(o, o && o.id); });
    });
    (SB.data.events || []).forEach(function (e) { walk(e.choices, e.id); });
    Object.keys(refs.cards).forEach(function (r) { if (!C.card(r)) errors.push('unknown card id "' + r + '" referenced by ' + refs.cards[r]); });
    Object.keys(refs.relics).forEach(function (r) { if (!C.relic(r)) errors.push('unknown relic id "' + r + '" referenced by ' + refs.relics[r]); });
    Object.keys(refs.enc).forEach(function (r) { if (!C.encounter(r)) warnings.push('unknown encounter id "' + r + '" referenced by ' + refs.enc[r]); });
    Object.keys(refs.pests).forEach(function (r) { if (!C.pest(r)) warnings.push('unknown pest id "' + r + '" referenced by ' + refs.pests[r]); });

    // engine support
    if (!SB.engine) {
      warnings.push('SB.engine registries not loaded, skipped op/trigger/status checks');
    } else {
      var usage = C.scanUsage();
      Object.keys(usage).forEach(function (cat) {
        Object.keys(usage[cat]).forEach(function (name) {
          if (C.supported(cat, name)) return;
          var u = usage[cat][name];
          var msg = 'unsupported ' + cat + ' "' + name + '" (' + u.count + ' uses, e.g. ' + u.owners.slice(0, 3).join(', ') + ')';
          if (cat in ERROR_CATS) errors.push(msg); else warnings.push(msg);
        });
      });
    }
    return { errors: errors, warnings: warnings };
  };

  build();
})();
