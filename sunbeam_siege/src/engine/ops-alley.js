/* SUNBEAM SIEGE: engine additions for the Alley Tabbies card set (src/data/cards-alley.js), card verification pass.
 * Loaded after registry.js and battle.js (registry convention, see design/C1-engine-notes.md). No Math.random.
 * Additive only: names are registered, nothing in battle.js or registry.js is edited. No em dashes.
 *
 * What this file adds or fixes:
 *  - check targetDied: a spell's "if it kills" test. The registry version only looked at ctx.subject or ctx.target,
 *    which a played spell does not have, so Cheap Shot never drew and Domino Hit never refunded. This wrapper keeps
 *    the old answer and, for a spell with a chosen enemy, reports true once that enemy has left the board.
 *  - op spendAllButOne: Void the Warranty. The generic lives op spends one Life per call, so "all but 1" never
 *    happened. This spends every Life but one on each target Cat, remembers the count for the counter lastSpent
 *    (0 when nothing could be spent) and respects the never-spend-the-last-Life rule.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var E = SB.engine;
  if (!E || !E.ops || !E.checks) return;
  var OP = E.ops, CK = E.checks;

  var origDied = CK.get('targetDied');
  CK.register('targetDied', function (c, e, B, arg) {
    if (origDied && origDied(c, e, B, arg)) return true;
    if (c.subject || c.target || (c.data && c.data.target)) return false;
    if (c.choice && c.choice.pestUid) {
      var p = B.pestByUid(c.choice.pestUid);
      return !p || !!p.dead || !!p.removed;
    }
    return false;
  });

  OP.register('spendAllButOne', function (ctx, e, B) {
    var spent = 0;
    B.targets(e.target !== undefined ? e.target : 'chosenCat', ctx, e).forEach(function (t) {
      if (!t || t.kind !== 'cat' || t.dead || t.removed) return;
      var n = (t.lives || 0) - 1;
      if (n > 0 && B.spendLife(t, n, { voluntary: true })) spent += n;
    });
    B.S.lastSpent = spent;
    return spent;
  });
})();
