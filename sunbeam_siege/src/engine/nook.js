/* SUNBEAM SIEGE: Nap Nook (agent C2).
 * Classic script. Attaches SB.nook.
 * Options (pick one): Curl Up (heal 30 percent max Warmth, 20 percent at Mischief 6+), Knead (+3 max Warmth, heal 8),
 * Groom (adopt out one card, no heal), Lick Wounds (+1 life to up to 3 cats), Deep Sleep (+2 lives to one cat, or wakes a
 * champion who is sitting out). A Growth Spurt for a ready Kitten is free on top of the pick.
 * No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  var N = SB.nook = SB.nook || {};
  function RU() { return SB.run.U; }
  function rules() { return SB.data.rules || {}; }

  N.curlUpPct = function (run) {
    var rm = SB.run.rankMods(run);
    return rm.nookCurlUpPct != null ? rm.nookCurlUpPct : (rules().nook_curl_up_pct || 30) / 100;
  };
  N.options = function (run) {
    var pct = N.curlUpPct(run);
    var heal = Math.round(run.maxWarmth * pct);
    var cats = RU().cats(run);
    var opts = [
      { id: 'curl_up', label: 'Curl Up', text: 'Heal ' + Math.round(pct * 100) + '% of max Warmth (' + heal + ').', heal: heal },
      { id: 'knead', label: 'Knead', text: '+' + (rules().nook_knead_max_warmth || 3) + ' max Warmth and heal ' + (rules().nook_knead_heal || 8) + '.', flavor: 'Kneading the cushion. A job well done.' },
      { id: 'groom', label: 'Groom', text: 'Remove 1 card from the deck. No heal.', needs: 'card' },
      { id: 'lick_wounds', label: 'Lick Wounds', text: '+' + (rules().lick_wounds_lives || 1) + ' Life to up to ' + (rules().lick_wounds_max_cats || 3) + ' cats.', needs: 'cats' },
      { id: 'deep_sleep', label: 'Deep Sleep', text: '+' + (rules().deep_sleep_lives || 2) + ' Lives to one cat. A champion who sits out wakes with ' + (rules().champion_long_nap_return_lives || 3) + '.', needs: 'cat' }
    ];
    opts.forEach(function (o) { o.available = N.available(run, o.id); });
    return opts;
  };
  N.open = function (run) {
    var cur = run.current || (run.current = {});
    cur.nook = { chosen: null };
    var P = SB.post.evolvable(run).filter(function (e) { return e.kind === 'growthSpurt'; });
    return { options: N.options(run), growthSpurt: P, healPct: N.curlUpPct(run) };
  };
  N.available = function (run, id) {
    if (id === 'groom') return run.deck.some(function (i) { return RU().canRemove(run, i).ok; });
    if (id === 'lick_wounds') return RU().cats(run).some(function (c) { return c.lives < c.maxLives; });
    if (id === 'deep_sleep') return RU().cats(run).length > 0;
    return true;
  };
  // arg: groom {uid}; lick_wounds {uids:[..]}; deep_sleep {uid}
  N.choose = function (run, optionId, arg) {
    var cur = run.current;
    if (!cur || run.status !== 'nook') return { ok: false, reason: 'Not at a Nap Nook.' };
    cur.nook = cur.nook || { chosen: null };
    if (cur.nook.chosen) return { ok: false, reason: 'One pick per nook. The cushion is already taken.' };
    arg = arg || {};
    var R = rules(), out;
    switch (optionId) {
      case 'curl_up': {
        var h = RU().heal(run, Math.round(run.maxWarmth * N.curlUpPct(run)));
        out = { ok: true, healed: h, text: 'You curl up. The house goes quiet.' };
        break;
      }
      case 'knead': {
        RU().raiseMaxWarmth(run, R.nook_knead_max_warmth || 3, false);
        var h2 = RU().heal(run, R.nook_knead_heal || 8);
        out = { ok: true, healed: h2, maxWarmth: run.maxWarmth, text: 'Kneading the cushion. A job well done.' };
        break;
      }
      case 'groom': {
        var inst = RU().inst(run, arg.uid);
        var c = RU().canRemove(run, inst);
        if (!c.ok) return { ok: false, reason: c.reason };
        var d = RU().def(inst);
        var isCurse = d && d.type === 'curse';
        RU().removeInst(run, inst.uid);
        if (!isCurse) { run.adopted++; run.removals = run.removals || 0; }
        out = { ok: true, removed: inst.id, text: 'They will be loved. The sofa has been warned.' };
        break;
      }
      case 'lick_wounds': {
        var uids = (arg.uids || []).slice(0, R.lick_wounds_max_cats || 3);
        var n = 0;
        uids.forEach(function (u) {
          var cat = RU().inst(run, u);
          if (cat && RU().isCat(cat)) { n += RU().gainLives(run, cat, R.lick_wounds_lives || 1, false) ? 1 : 0; }
        });
        if (!n) return { ok: false, reason: 'Pick up to three cats that need a lick.' };
        out = { ok: true, cats: n, text: 'Groomed to a shine. Lives restored.' };
        break;
      }
      case 'deep_sleep': {
        var cat2 = RU().inst(run, arg.uid);
        if (!cat2 || !RU().isCat(cat2)) return { ok: false, reason: 'Pick a cat for the long nap.' };
        if (cat2.sitOut) {
          cat2.sitOut = false;
          cat2.lives = R.champion_long_nap_return_lives || 3;
          if (cat2.maxLives < cat2.lives) cat2.maxLives = cat2.lives;
          out = { ok: true, woke: cat2.uid, text: 'The champion wakes, stretches and files a complaint.' };
        } else {
          RU().gainLives(run, cat2, R.deep_sleep_lives || 2, false);
          out = { ok: true, uid: cat2.uid, lives: cat2.lives, text: 'A very long nap. Several lives were found down the back of it.' };
        }
        break;
      }
      default:
        return { ok: false, reason: 'No such option.' };
    }
    cur.nook.chosen = optionId;
    return out;
  };
  N.growthSpurt = function (run, uid) { return SB.post.growthSpurt(run, uid); };
})();
