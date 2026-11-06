/* SUNBEAM SIEGE: engine additions for the Hearthpaws card set (src/data/cards-hearth.js), card verification pass.
 * Loaded after registry.js and battle.js (registry convention, see design/C1-engine-notes.md). No Math.random.
 * Additive: names are registered and two Battle.prototype / status handlers are wrapped; battle.js and registry.js
 * are not edited. No em dashes.
 *
 * What this file adds or fixes:
 *  - op fluffByPile: Group Hug. The AmountExpr counter pileSize reads the source Cat, and a spell has none, so the
 *    old data gave 0 Fluff. This evaluates each Cat's own Pile size.
 *  - op pileBoost: Heated Blanket and Hearth Rug. The pileSize check ran against the room, which is never in a Pile,
 *    so neither toy ever did anything. This applies fluff and heal to each Cat whose own Pile is big enough.
 *  - op setUnitFlag: sets a flag on the source unit (Window Hammock and Old Mortimer use noRude, which the engine
 *    reads in rudeAwakening and isDoNotDisturb, but card data cannot carry flags).
 *  - check notRudeWake: onWake also fires for a Rude Awakening, which is not a Stretch. Snooze Tabby and Pillow
 *    Bruiser only act on a real Stretch.
 *  - keyword deepsleep: Rested max 6 (statusMax +2 on the Cat) and the Dusk Rested gain of 2 can reach it.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var E = SB.engine;
  if (!E || !E.ops || !SB.battle || !SB.battle.Battle) return;
  var P = SB.battle.Battle.prototype;
  var OP = E.ops, CK = E.checks;
  function rv(key, d) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : d; }
  function num(B, ctx, x, d) { return x === undefined ? d : B.num(x, ctx); }

  OP.register('fluffByPile', function (ctx, e, B) {
    var mult = e.mult === undefined ? 1 : e.mult;
    B.targets(e.target !== undefined ? e.target : 'allCatsOnFloor', ctx, e).forEach(function (c) {
      if (!c || c.kind !== 'cat') return;
      var n = B.pileSizeOf(c) * mult;
      if (n > 0) B.addFluff(c, n);
    });
  });

  OP.register('pileBoost', function (ctx, e, B) {
    var min = e.min === undefined ? 3 : e.min;
    var fl = num(B, ctx, e.fluff, 0), hl = num(B, ctx, e.heal, 0);
    B.targets(e.target !== undefined ? e.target : 'allCatsOnFloor', ctx, e).forEach(function (c) {
      if (!c || c.kind !== 'cat' || c.dead || c.removed) return;
      if (B.pileSizeOf(c) < min) return;
      if (fl > 0) B.addFluff(c, fl);
      if (hl > 0) B.heal(c, hl);
    });
  });

  OP.register('setUnitFlag', function (ctx, e, B) {
    var u = ctx.self;
    if (!u || !u.flags) return;
    u.flags[e.flag] = e.value === undefined ? true : e.value;
    B.touch();
  });

  CK.register('notRudeWake', function (c) { return !(c.data && c.data.rude); });

  // ---- deepsleep: Rested max 6 ---------------------------------------------------------------
  if (!P.__hearthDeep) {
    P.__hearthDeep = true;
    var origMax = P.statusMax;
    P.statusMax = function (u, id) {
      var m = origMax.call(this, u, id);
      if (id === 'rested' && u && u.kind === 'cat' && u.kw && u.kw.deepsleep) m += 2;
      return m;
    };
    var rested = E.statuses.get('rested');
    if (rested && rested.dusk) {
      var origDusk = rested.dusk;
      rested.dusk = function (B) {
        var deep = [];
        B.cats().forEach(function (c) { if (c.napping && !c.dead && !c.removed && c.kw && c.kw.deepsleep) deep.push([c, c.statuses.rested || 0]); });
        origDusk(B);
        deep.forEach(function (pr) {
          var c = pr[0], was = pr[1];
          if (c.removed || c.dead || !c.napping) return;
          var fl = B.S.floors[c.floor] ? B.S.floors[c.floor].statuses : {};
          if (fl.foil) return;
          var gain = rv('rested_gain_per_round', 1) + (fl.heat_lamp ? 1 : 0) + 1;
          var want = Math.min(B.statusMax(c, 'rested'), was + gain), now = c.statuses.rested || 0;
          if (want > now) {
            c.statuses.rested = want; B.touch();
            B.emit('status', { uid: c.uid, status: 'rested', amount: want - now, total: want, floor: c.floor, pos: c.pos, side: 'cat', kind: 'add' });
            B.statMax('maxRested', want);
          }
        });
      };
    }
  }
})();
