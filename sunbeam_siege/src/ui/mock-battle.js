/* SUNBEAM SIEGE mock-battle.js (agent C3). A tiny fake of SB.battle that follows design/API.md so the battle UI can be built
 * and tested before the real engine exists. NOT a rules implementation. Used only by battle-demo.html.
 * SB.mockBattle.create(run, encounter, opts) -> same surface as SB.battle.create.  No em dashes. */
(function () {
  'use strict';
  window.SB = window.SB || {};

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var SIZE = { small: 1, medium: 2, large: 3, boss: 5 };

  function allCards() {
    var out = {};
    Object.keys(SB.data || {}).forEach(function (k) { if (/^(cards|champions)/.test(k) && Array.isArray(SB.data[k])) SB.data[k].forEach(function (c) { if (c && c.id) out[c.id] = c; }); });
    return out;
  }
  function allPests() {
    var out = {};
    Object.keys(SB.data || {}).forEach(function (k) { if (/^enemies/.test(k) && Array.isArray(SB.data[k])) SB.data[k].forEach(function (c) { if (c && c.id) out[c.id] = c; }); });
    return out;
  }
  function flat(def) {
    var st = def.stats || {};
    return { id: def.id, name: def.name, type: def.type, clan: def.clan, rarity: def.rarity, cost: def.cost, power: st.power, health: st.health, lives: st.lives,
      text: def.text, flavor: def.flavor, keywords: def.keywords || {}, art: def.art, tags: def.tags || [], targeting: def.targeting, size: st.size || 1 };
  }

  var DECK = ['alley_bin_diver', 'neutral_house_cat', 'alley_tin_can_tom', 'neutral_swat', 'neutral_swat', 'neutral_catnap', 'neutral_cardboard_box',
    'alley_fence_walker', 'neutral_tuna_snack', 'neutral_spring_cleaning', 'neutral_shove', 'alley_back_door_bandit', 'neutral_cushion_cat', 'neutral_two_paw_swat', 'neutral_window_watcher'];

  function create(run, encounter, opts) {
    opts = opts || {};
    var rnd = mulberry32(opts.seed || 7), CARDS = allCards(), PESTS = allPests();
    var listeners = [], uidN = 100, evlog = [];
    var deck = (run && run.deck && run.deck.length ? run.deck : DECK.map(function (id, i) { return { uid: 'k' + i, id: id, lives: (CARDS[id] && CARDS[id].stats && CARDS[id].stats.lives) || 3 }; }));
    var S = {
      round: 1, phase: 'player', turn: 'player', zoomies: 3, nip: { meter: 0, surge: false, crash: 0 }, bank: 0,
      hand: [], drawCount: 0, discardCount: 0, exhaustCount: 0, discard: [], exhaust: [],
      floors: [0, 1, 2].map(function () { return { cats: [], pests: [], rooms: [], statuses: {}, capacity: { cats: 4, pestSize: 5, rooms: 2 } }; }),
      garden: [], sunbeam: { warmth: 40, max: 40, shade: 4 }, clock: { round: 1, nextWitching: 3, isWitching: false },
      intents: [], incoming: [0, 0, 0, 0], log: []
    };
    var drawPile = deck.map(function (c) { return c.uid; });
    for (var i = drawPile.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = drawPile[i]; drawPile[i] = drawPile[j]; drawPile[j] = t; }
    var byUid = {}; deck.forEach(function (c) { byUid[c.uid] = c; });
    var played = {}; // uid -> true while on board
    var stats = { damage: 0, cardsPlayed: 0 };
    var over = null;

    function emit(e) { evlog.push(e); listeners.forEach(function (fn) { fn(e); }); S.log.push(e.type + (e.amount != null ? ' ' + e.amount : '')); if (S.log.length > 60) S.log.shift(); return e; }
    function inst(uid) { return byUid[uid]; }
    function cardOf(uid) { var c = inst(uid), d = CARDS[c.id]; var f = flat(d); if (c.lives != null && f.lives != null) f.lives = c.lives; return f; }
    function mkPest(id, floor, pos) {
      var d = PESTS[id] || PESTS.pest_field_mouse;
      var size = typeof d.size === 'number' ? d.size : (SIZE[d.size] || d.room || 1);
      return { uid: 'p' + (uidN++), id: d.id, name: d.name, hp: d.hp, maxHp: d.hp, fluff: d.fluff || 0, size: size, statuses: {}, intent: null, floor: floor, pos: pos, traits: d.traits || [], tags: d.tags || [], art: d.art };
    }
    function mkCat(uid, floor, pos) {
      var c = inst(uid), d = CARDS[c.id], st = d.stats || {};
      return { uid: 'u' + uid, cardUid: uid, id: d.id, name: d.shortName || d.name, power: st.power, health: st.health, maxHealth: st.health, lives: c.lives, maxLives: st.lives || c.lives,
        statuses: {}, napping: false, hidden: false, boxed: false, floor: floor, pos: pos, art: d.art, justPlayed: true, champion: d.type === 'champion' };
    }
    function findUnit(uid) {
      for (var f = 0; f < 3; f++) {
        var u = S.floors[f].cats.concat(S.floors[f].pests).filter(function (x) { return x.uid === uid; })[0];
        if (u) return u;
      }
      return null;
    }
    function repack(f) { S.floors[f].cats.forEach(function (c, i) { c.pos = i; c.floor = f; }); S.floors[f].pests.forEach(function (p, i) { p.pos = i; p.floor = f; }); }
    function pestSize(f) { return S.floors[f].pests.reduce(function (a, p) { return a + p.size; }, 0); }

    function computeIntents() {
      S.intents = []; S.incoming = [0, 0, 0, 0];
      for (var f = 0; f < 3; f++) {
        S.floors[f].pests.forEach(function (p) {
          var cats = S.floors[f].cats.filter(function (c) { return !c.hidden; });
          var dmg = Math.max(1, Math.round(p.maxHp / 6) + (p.size > 1 ? 1 : 0));
          var it;
          if (p.statuses.yarn) it = { pestUid: p.uid, icon: 'intent_sleep', text: 'Tangled in yarn. Skips this round.', dmg: 0, floors: [], kind: 'sleep' };
          else if (cats.length) { it = { pestUid: p.uid, icon: 'intent_attack', text: 'Attacks the front cat for ' + dmg + '.', dmg: dmg, floors: [f], kind: 'attack' }; S.incoming[f] += dmg; }
          else if (f < 2) it = { pestUid: p.uid, icon: 'intent_climb', text: 'Climbs to the next floor.', dmg: 0, floors: [f + 1], kind: 'climb' };
          else { it = { pestUid: p.uid, icon: 'intent_sunbeam', text: 'Reaches the Sunbeam for ' + dmg + ' Warmth.', dmg: dmg, floors: [3], kind: 'sunbeam' }; S.incoming[3] += dmg; }
          p.intent = it; S.intents.push(it);
        });
      }
    }
    function draw(n) {
      for (var k = 0; k < n; k++) {
        if (S.hand.length >= 10) break;
        if (!drawPile.length) { drawPile = S.discard.slice(); S.discard = []; for (var q = drawPile.length - 1; q > 0; q--) { var r = Math.floor(rnd() * (q + 1)); var tt = drawPile[q]; drawPile[q] = drawPile[r]; drawPile[r] = tt; } }
        if (!drawPile.length) break;
        var uid = drawPile.shift();
        S.hand.push({ uid: uid, card: cardOf(uid) });
        emit({ type: 'draw', cardUid: uid, uid: uid });
      }
      sync();
    }
    function sync() { S.drawCount = drawPile.length; S.discardCount = S.discard.length; S.exhaustCount = S.exhaust.length; computeIntents(); }

    // ---- setup scenario
    S.floors[0].cats.push(mkCat('k0', 0, 0)); S.floors[0].cats[0].statuses = { claws: 2 }; S.floors[0].cats[0].justPlayed = false; played.k0 = true;
    S.floors[0].cats[0].lives = 3;
    S.floors[1].cats.push(mkCat('k2', 1, 0)); S.floors[1].cats[0].justPlayed = false; S.floors[1].cats[0].statuses = { fluff: 3, purr: 2 }; played.k2 = true;
    S.floors[0].pests.push(mkPest('pest_field_mouse', 0, 0), mkPest('pest_alley_rat', 0, 1));
    S.floors[1].pests.push(mkPest('pest_brute_rat', 1, 0));
    S.floors[2].pests.push(mkPest('pest_alarm_vole', 2, 0)); S.floors[2].pests[0].statuses = { dizzy: 1 };
    S.floors[0].rooms.push({ id: 'neutral_welcome_mat', name: 'Welcome Mat', kind: 'toy', text: 'Cats here gain 1 Fluff each round.' });
    S.garden = [mkPest('pest_pantry_mouse', -1, 0), mkPest('pest_guard_dog', -1, 1), mkPest('pest_boss_rat_king', -1, 2)];
    deck.forEach(function (c) { if (c.uid === 'k0' || c.uid === 'k2') drawPile.splice(drawPile.indexOf(c.uid), 1); });
    for (var f = 0; f < 3; f++) repack(f);
    draw(5);
    S.log.length = 0; evlog.length = 0;

    function targetsFor(c) {
      var tg = c.targeting || (c.type === 'unit' ? 'floor' : 'none'), out = [];
      if (tg === 'floor') { for (var f = 0; f < 3; f++) { if (c.type === 'toy' ? S.floors[f].rooms.length < 2 : S.floors[f].cats.length < 4) out.push({ floor: f }); } return { needs: 'floor', targets: out }; }
      if (tg === 'enemy') { for (var g = 0; g < 3; g++) S.floors[g].pests.forEach(function (p) { out.push({ pestUid: p.uid, floor: g, pos: p.pos }); }); return { needs: 'pest', targets: out }; }
      if (tg === 'cat') { for (var h = 0; h < 3; h++) S.floors[h].cats.forEach(function (u) { out.push({ catUid: u.uid, floor: h, pos: u.pos }); }); return { needs: 'cat', targets: out }; }
      return { needs: 'none', targets: [] };
    }
    function damage(src, tgt, amount, kind) {
      var abs = Math.min(tgt.fluff || 0, amount); if (tgt.fluff) tgt.fluff -= abs;
      var cs = tgt.statuses && tgt.statuses.fluff; if (cs && !abs) { abs = Math.min(cs, amount); tgt.statuses.fluff -= abs; if (!tgt.statuses.fluff) delete tgt.statuses.fluff; }
      var real = amount - abs;
      if (tgt.maxHp !== undefined) tgt.hp = Math.max(0, tgt.hp - real); else tgt.health = Math.max(0, tgt.health - real);
      stats.damage += real;
      emit({ type: 'damage', from: src && src.uid, to: tgt.uid, uid: tgt.uid, amount: real, blocked: abs, kind: kind || 'hit', floor: tgt.floor, pos: tgt.pos, hp: tgt.maxHp !== undefined ? tgt.hp : tgt.health });
      return (tgt.maxHp !== undefined ? tgt.hp : tgt.health) <= 0;
    }
    function killPest(p) {
      emit({ type: 'death', uid: p.uid, side: 'pest', floor: p.floor, pos: p.pos, id: p.id });
      var fl = S.floors[p.floor]; fl.pests = fl.pests.filter(function (x) { return x !== p; }); repack(p.floor);
    }
    function killCat(c) {
      var fl = S.floors[c.floor]; var ci = inst(c.cardUid);
      ci.lives -= 1; emit({ type: 'lifeSpent', uid: c.uid, floor: c.floor, pos: c.pos, lives: ci.lives });
      emit({ type: 'death', uid: c.uid, side: 'cat', floor: c.floor, pos: c.pos, id: c.id });
      fl.cats = fl.cats.filter(function (x) { return x !== c; }); repack(c.floor); delete played[c.cardUid];
      if (ci.lives > 0) S.discard.push(c.cardUid);
    }
    function checkEnd() {
      if (over) return true;
      var left = S.garden.length; S.floors.forEach(function (f) { left += f.pests.length; });
      if (!left) { over = { outcome: 'win' }; emit({ type: 'win' }); S.turn = 'over'; return true; }
      if (S.sunbeam.warmth <= 0) { over = { outcome: 'lose' }; emit({ type: 'lose' }); S.turn = 'over'; return true; }
      return false;
    }

    var B = {
      state: S,
      on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
      canPlay: function (uid) {
        var h = S.hand.filter(function (x) { return x.uid === uid; })[0];
        if (S.turn !== 'player') return { ok: false, reason: 'Not your turn.', targets: [], needsTarget: 'none' };
        if (!h) return { ok: false, reason: 'Card is not in hand.', targets: [], needsTarget: 'none' };
        var c = h.card;
        if (c.type === 'curse') return { ok: false, reason: 'Unplayable.', targets: [], needsTarget: 'none' };
        if (c.cost > S.zoomies) return { ok: false, reason: 'Not enough Zoomies.', targets: [], needsTarget: 'none' };
        var t = targetsFor(c);
        if (t.needs !== 'none' && !t.targets.length) return { ok: false, reason: 'No valid target.', targets: [], needsTarget: t.needs };
        return { ok: true, reason: null, targets: t.targets, needsTarget: t.needs };
      },
      playCard: function (uid, target) {
        var cp = B.canPlay(uid); if (!cp.ok) return { ok: false, reason: cp.reason };
        var h = S.hand.filter(function (x) { return x.uid === uid; })[0], c = h.card;
        S.zoomies -= c.cost; S.hand = S.hand.filter(function (x) { return x !== h; }); stats.cardsPlayed++;
        emit({ type: 'play', cardUid: uid, uid: uid, card: c, target: target, cost: c.cost });
        var exhaust = /exhaust/i.test(c.text || '') || (c.keywords && c.keywords.exhaust);
        if (c.type === 'unit' || c.type === 'champion') {
          var f = target.floor, cat = mkCat(uid, f, S.floors[f].cats.length); S.floors[f].cats.push(cat); played[uid] = true; repack(f);
          emit({ type: 'deploy', uid: cat.uid, cardUid: uid, floor: f, pos: cat.pos, unit: clone(cat) });
          if (c.keywords && c.keywords.pounce && S.floors[f].pests.length) {
            var tp = S.floors[f].pests[0]; emit({ type: 'attack', from: cat.uid, to: tp.uid, kind: 'pounce', floor: f });
            if (damage(cat, tp, cat.power + c.keywords.pounce, 'pounce')) killPest(tp);
          }
        } else if (c.type === 'toy') {
          var fl = S.floors[target.floor]; fl.rooms.push({ id: c.id, name: c.name, kind: 'toy', text: c.text }); emit({ type: 'status', floor: target.floor, status: 'room', kind: 'room', name: c.name });
          if (c.id === 'neutral_cardboard_box') exhaust = false;
        } else if (cp.needsTarget === 'pest') {
          var p = findUnit(target.pestUid); emit({ type: 'attack', from: 'player', to: p.uid, kind: 'spell', floor: p.floor });
          if (damage(null, p, /(\d+) damage/.test(c.text) ? +RegExp.$1 : 4, 'hit')) killPest(p);
        } else if (cp.needsTarget === 'cat') {
          var u = findUnit(target.catUid);
          if (/heal|tuna|nap/i.test(c.text + c.name)) { var amt = Math.min(3, u.maxHealth - u.health); u.health += amt; emit({ type: 'heal', uid: u.uid, amount: amt || 3, floor: u.floor, pos: u.pos }); }
          u.statuses.fluff = (u.statuses.fluff || 0) + 2; emit({ type: 'status', uid: u.uid, status: 'fluff', amount: 2, floor: u.floor, pos: u.pos });
        } else {
          S.zoomies += 1; emit({ type: 'zoom', amount: 1, kind: 'zoomies' }); draw(1);
        }
        if (exhaust) { S.exhaust.push(uid); } else if (!played[uid]) S.discard.push(uid);
        sync(); checkEnd();
        return { ok: true };
      },
      toggleNap: function (catUid) {
        var u = findUnit(catUid); if (!u) return { ok: false, reason: 'No such cat.' };
        if (u.justPlayed) return { ok: false, reason: 'Cats cannot nap the turn they are played.' };
        u.napping = !u.napping; emit({ type: u.napping ? 'nap' : 'wake', uid: u.uid, floor: u.floor, pos: u.pos });
        if (u.napping) { u.statuses.rested = Math.min(4, (u.statuses.rested || 0) + 1); } else { delete u.statuses.rested; }
        sync(); return { ok: true };
      },
      endTurn: function () {
        if (S.turn !== 'player') return [];
        var start = evlog.length;
        S.turn = 'resolving';
        S.hand.forEach(function (x) { S.discard.push(x.uid); }); S.hand = [];
        emit({ type: 'phase', name: 'cat_attacks', text: 'Cats Attack' });
        for (var f = 0; f < 3; f++) {
          S.floors[f].cats.slice().forEach(function (c) {
            c.justPlayed = false;
            if (c.napping) { var hh = Math.min(2, c.maxHealth - c.health); c.health += hh; emit({ type: 'heal', uid: c.uid, amount: 2, floor: c.floor, pos: c.pos }); return; }
            var tp = S.floors[c.floor].pests[0]; if (!tp) return;
            emit({ type: 'attack', from: c.uid, to: tp.uid, kind: 'claw', floor: c.floor, pos: c.pos });
            var dmg = c.power + ((c.statuses.claws) || 0);
            if (damage(c, tp, dmg, 'hit')) killPest(tp);
          });
        }
        if (!checkEnd()) {
          emit({ type: 'phase', name: 'pest_attacks', text: 'Pests Attack' });
          for (var g = 0; g < 3; g++) {
            S.floors[g].pests.slice().forEach(function (p) {
              if (p.statuses.yarn) { p.statuses.yarn--; if (!p.statuses.yarn) delete p.statuses.yarn; return; }
              var cats = S.floors[p.floor].cats;
              var it = p.intent || { dmg: 1, kind: 'attack' };
              if (cats.length) {
                var tc = cats[0]; emit({ type: 'attack', from: p.uid, to: tc.uid, kind: 'claw', floor: p.floor, pos: p.pos });
                if (damage(p, tc, it.dmg || 1, 'hit')) killCat(tc);
              } else if (p.floor === 2) {
                emit({ type: 'attack', from: p.uid, to: 'sunbeam', kind: 'sunbeam', floor: 2 });
                var d = it.dmg || 1, sh = Math.min(S.sunbeam.shade, d); S.sunbeam.shade -= sh; S.sunbeam.warmth = Math.max(0, S.sunbeam.warmth - (d - sh));
                emit({ type: 'sunbeamHit', amount: d - sh, shade: sh, warmth: S.sunbeam.warmth, uid: p.uid });
              }
            });
          }
          emit({ type: 'phase', name: 'advance', text: 'Pests Climb' });
          for (var a = 2; a >= 0; a--) {
            S.floors[a].pests.slice().forEach(function (p) {
              if (S.floors[a].cats.length || a >= 2) return;
              if (pestSize(a + 1) + p.size > 5) return;
              S.floors[a].pests = S.floors[a].pests.filter(function (x) { return x !== p; }); S.floors[a + 1].pests.push(p);
              emit({ type: 'move', uid: p.uid, from: a, to: a + 1, floor: a + 1 }); repack(a); repack(a + 1);
            });
          }
          if (S.garden.length && pestSize(0) + S.garden[0].size <= 5) {
            var np = S.garden.shift(); np.floor = 0; S.floors[0].pests.push(np); repack(0);
            emit({ type: 'spawn', uid: np.uid, floor: 0, pos: np.pos, from: 'garden', unit: clone(np) });
          }
        }
        if (!checkEnd()) {
          S.round++; S.clock.round = S.round;
          S.clock.isWitching = S.round % 3 === 0; S.clock.nextWitching = S.round % 3 === 0 ? S.round + 3 : S.round + (3 - S.round % 3);
          emit({ type: 'phase', name: 'dusk', text: 'Dusk' });
          S.zoomies = S.clock.isWitching ? 5 : 3;
          if (S.clock.isWitching) {
            emit({ type: 'witching', round: S.round });
            S.floors.forEach(function (fl) { fl.cats.forEach(function (c) { if (c.napping) return; var tp = S.floors[0].pests[0] || S.floors[1].pests[0] || S.floors[2].pests[0]; if (!tp) return; emit({ type: 'zoom', uid: c.uid, to: tp.uid, floor: c.floor, pos: c.pos }); if (damage(c, tp, Math.floor(c.power / 2), 'zoom')) killPest(tp); }); });
          }
          emit({ type: 'phase', name: 'draw', text: 'Round ' + S.round });
          draw(S.clock.isWitching ? 6 : 5);
          S.turn = 'player';
          checkEnd();
        }
        sync();
        return evlog.slice(start);
      },
      surrender: function () { over = { outcome: 'lose', surrendered: true }; S.turn = 'over'; emit({ type: 'lose' }); return { ok: true }; },
      result: function () {
        if (!over) return null;
        return { outcome: over.outcome, surrendered: !!over.surrendered, stats: stats, loot: { fish: 14 },
          growth: [
            { kind: 'mastery', name: 'Swat', text: 'Swat reached Mastery 1: +1 damage next time.' },
            { kind: 'kneading', name: 'Tin Can Tom', text: 'Tin Can Tom kneaded +1 Attack.' },
            { kind: 'lives', name: 'Bin Diver', text: 'Bin Diver kept all 3 lives.' },
            { kind: 'xp', name: 'Fence Walker', text: 'Fence Walker played 3 times, 4 to go to Mastery 2.' }
          ] };
      },
      serialize: function () { return clone(S); },
      _cheatWin: function () { S.garden = []; for (var f = 0; f < 3; f++) S.floors[f].pests.slice().forEach(function (p) { emit({ type: 'attack', from: S.floors[f].cats[0] ? S.floors[f].cats[0].uid : 'player', to: p.uid }); damage(null, p, 999, 'hit'); killPest(p); }); checkEnd(); sync(); },
      _cheatHurt: function () { S.sunbeam.warmth = 9; sync(); },
      _mock: true
    };
    return B;
  }
  SB.mockBattle = { create: create };
  SB.mockRun = function () {
    return { seed: 7, clan: 'alley', side: 'hearth', deck: DECK.map(function (id, i) { return { uid: 'k' + i, id: id, lives: 3, maxLives: 3, scratches: [] }; }), relics: [{ id: 'relic_torn_ear_tag', counter: 0 }, { id: 'relic_lucky_whisker', counter: 0 }], fish: 31, warmth: 40, maxWarmth: 40, act: 1, night: 3, flags: {}, stats: {}, log: [] };
  };
})();
