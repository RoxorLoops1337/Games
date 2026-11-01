/* SUNBEAM SIEGE pest AI (agent C1): intent selection, execution and previews.
 * Attaches SB.engine.ai. Patterns: cycle, weighted, conditional, countdown. All randomness uses the battle RNG.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  var SB = root.SB = root.SB || {};
  var U = SB.util;
  var E = SB.engine = SB.engine || {};
  var AI = E.ai = E.ai || {};

  function rv(key, dflt) { var r = (SB.data && SB.data.rules) || {}; return r[key] !== undefined ? r[key] : dflt; }

  // ---- pattern access -----------------------------------------------------------------------------
  function pestDef(B, p) { return SB.content.pest(p.id); }
  function currentPattern(B, p) {
    var d = pestDef(B, p);
    if (!d) return null;
    if (p.pat.phase >= 0 && d.phases && d.phases[p.pat.phase] && d.phases[p.pat.phase].pattern) return d.phases[p.pat.phase].pattern;
    return d.pattern;
  }
  function clone(a) { return a ? U.deepClone(a) : a; }

  AI.initPest = function (B, p) {
    var d = pestDef(B, p);
    if (!d) return;
    (d.passives || []).forEach(function (ps) {
      var pd = E.passives.get(ps.id || (ps.rule && 'rule:' + Object.keys(ps.rule)[0]));
      if (pd && pd.init) pd.init(p, ps);
    });
    AI.select(B, p);
  };

  // choose the next action and store it (as a plain copy) in p.nextAction
  AI.select = function (B, p) {
    var pat = currentPattern(B, p);
    var act = null;
    if (!pat) { p.nextAction = { kind: 'wait', label: 'Wait' }; AI.describeInto(B, p); return; }
    var ctx = B.makeCtx({ self: p, floorOverride: p.floor, lk: 'sel:' + p.uid });
    var type = pat.type || 'cycle';
    if (type === 'cycle') {
      var list = pat.actions || [];
      if (list.length) act = clone(list[p.pat.idx % list.length]);
    } else if (type === 'weighted') {
      var opts = pat.actions || pat.options || [];
      var total = U.sum(opts, function (o) { return o.w || 1; });
      if (opts.length) {
        var r = opts.length === 1 ? 0 : B.rand() * total, acc = 0, pickd = opts[0];
        for (var i = 0; i < opts.length; i++) { acc += opts[i].w || 1; if (r < acc) { pickd = opts[i]; break; } }
        act = clone(pickd.action || pickd);
      }
    } else if (type === 'conditional') {
      var rules = pat.rules || [];
      for (var k = 0; k < rules.length; k++) {
        if (rules[k].if === undefined || B.checkAll(rules[k].if === 'always' ? [] : [rules[k].if], ctx)) { act = clone(rules[k].action); break; }
      }
    } else if (type === 'countdown') {
      if (p.pat.cd === null || p.pat.cd === undefined) p.pat.cd = pat.start !== undefined ? pat.start : 3;
      act = clone(p.pat.cd <= 0 ? pat.onZero : pat.between);
      if (act) act._cd = p.pat.cd;
    }
    if (!act) act = { kind: 'wait', label: 'Wait' };
    // Bath Tide Overflow is written with absolute floors [1, 2] but means "this floor and the one below"
    if (act.id === 'overflow' && p.id === 'pest_bath_tide') act.floors = 'ownAndBelow';
    p.nextAction = act;
    AI.describeInto(B, p);
  };

  function advance(B, p) {
    var pat = currentPattern(B, p);
    if (!pat) return;
    var type = pat.type || 'cycle';
    if (type === 'cycle') p.pat.idx++;
    else if (type === 'countdown') {
      var paused = (pat.pausedBy || []).some(function (s) { return B.stn(p, s) > 0; });
      if (p.pat.cd <= 0) p.pat.cd = pat.reset !== undefined ? pat.reset : (pat.start || 3);
      else if (!paused) p.pat.cd--;
    }
    p.pat.round++;
  }

  // ---- targeting ---------------------------------------------------------------------------------------------
  function decoyOrRagebait(B, list, nonAll) {
    var d = list.filter(function (c) { return c.kw && c.kw.ragebait && !c.napping; });
    if (nonAll && d.length) return d;
    var dc = list.filter(function (c) { return c.flags && c.flags.decoy || (c.kw && c.kw.decoy); });
    if (nonAll && dc.length) return dc;
    return list;
  }
  function floorSpecList(B, p, spec) {
    var own = p.floor, n = B.numFloors;
    if (spec === undefined || spec === 'own') return [own];
    if (spec === 'each') return [0, 1, 2];
    if (spec === 'up') return own + 1 < n ? [own + 1] : [];
    if (spec === 'down') return own - 1 >= 0 ? [own - 1] : [];
    if (spec === 'ownAndBelow') return own - 1 >= 0 ? [own, own - 1] : [own];
    if (spec === 'ownAndUp') return own + 1 < n ? [own, own + 1] : [own];
    if (spec === 'ownOrAbove') return own + 1 < n ? [own, own + 1] : [own];
    if (spec === 'sunbeam') return [];
    if (Array.isArray(spec)) return spec.map(function (x) { return x - 1; }).filter(function (x) { return x >= 0 && x < n; }).sort();
    if (spec === 'reach') return [own, own - 1, own + 1].filter(function (x) { return x >= 0 && x < n; });
    return [own];
  }
  function candidates(B, p, fi, pick) {
    var cats = B.S.floors[fi].cats.filter(function (c) { return !c.dead && !c.removed; });
    var ignore = p.flags.ignoreHidden || B.hasTrait(p, 'tracker') || pick === 'all';
    if (!ignore) cats = cats.filter(function (c) { return !c.hidden; });
    return cats;
  }
  function pickFrom(B, p, cats, pick, rnd) {
    if (!cats.length) return [];
    if (pick === 'all') return cats.slice();
    var pool = decoyOrRagebait(B, cats, true);
    switch (pick) {
      case 'back': return [pool[pool.length - 1]];
      case 'random': return rnd ? [B.pickOne(pool)] : [];
      case 'weakest': { var w = pool[0]; pool.forEach(function (c) { if (c.health < w.health) w = c; }); return [w]; }
      case 'strongest': { var s = pool[0]; pool.forEach(function (c) { if (B.atk(c) > B.atk(s)) s = c; }); return [s]; }
      case 'napping': { var n = pool.filter(function (c) { return c.napping; }); return n.length ? [n[0]] : [pool[0]]; }
      case 'mostLives': { var m = pool[0]; pool.forEach(function (c) { if (c.lives > m.lives) m = c; }); return [m]; }
      case 'front3': return pool.slice(0, 3);
      default: return [pool[0]];
    }
  }
  // returns { cats: [...], sunbeam: bool }
  function resolve(B, p, act, rnd) {
    var out = { cats: [], sunbeam: false };
    var spec = act.floors;
    if (spec === 'sunbeam') { out.sunbeam = true; return out; }
    var pick = act.pick || 'front';
    var fls = floorSpecList(B, p, spec);
    if (spec === 'reach') {
      for (var i = 0; i < fls.length; i++) {
        var cs = pickFrom(B, p, candidates(B, p, fls[i], pick), pick, rnd);
        if (cs.length) { out.cats = cs; return finishSun(B, p, out, spec); }
      }
      return finishSun(B, p, out, spec);
    }
    if (spec === 'ownOrAbove') {
      for (var j = 0; j < fls.length; j++) {
        var c2 = pickFrom(B, p, candidates(B, p, fls[j], pick), pick, rnd);
        if (c2.length) { out.cats = c2; return finishSun(B, p, out, spec); }
      }
      return finishSun(B, p, out, spec);
    }
    fls.forEach(function (fi) { out.cats = out.cats.concat(pickFrom(B, p, candidates(B, p, fi, pick), pick, rnd)); });
    return finishSun(B, p, out, spec);
  }
  function finishSun(B, p, out, spec) {
    // The Attic with no blocking cats lets pests hit the Sunbeam
    if (!out.cats.length && p.floor === B.numFloors - 1 && B.blockers(p.floor).length === 0 && (spec === undefined || spec === 'own' || spec === 'reach' || spec === 'ownAndUp' || spec === 'ownOrAbove' || spec === 'ownAndBelow' || spec === 'each' || Array.isArray(spec))) out.sunbeam = true;
    return out;
  }
  AI.resolve = resolve;

  // ---- Mirror (Rival Tomcat) ---------------------------------------------------------------------------------------------
  // The cat a Mirror copies: the strongest cat on its floor, otherwise the strongest cat on any floor.
  AI.mirrorCat = function (B, p) {
    var best = null;
    function scan(list) { list.forEach(function (c) { if (!c.dead && !c.removed && (!best || B.atk(c, true) > B.atk(best, true))) best = c; }); }
    scan(B.S.floors[p.floor].cats);
    if (!best) B.S.floors.forEach(function (f) { scan(f.cats); });
    return best;
  };
  // Hits of a mirrored attack: the copied cat's own number of hits per attack (Frenzy, Multistrike). Floors and pick stay
  // own floor and front, which is how every cat attack is aimed.
  AI.mirrorHits = function (B, p, a) {
    if (!a || !a.mirror || !p.flags.mirror) return a && a.hits || 1;
    var c = AI.mirrorCat(B, p);
    if (!c) return a.hits || 1;
    return 1 + (c.statuses.frenzy || 0) + (typeof c.kw.multistrike === 'number' ? c.kw.multistrike - 1 : 0);
  };

  // ---- damage numbers -------------------------------------------------------------------------------------------------
  function hitDamage(B, p, act) {
    var base = (act.dmg || 0) + B.pestBonus(p);
    if (act.dmg === undefined || act.dmg === null) return 0;
    var pct = 0;
    if (p.statuses.dull) pct -= 25;
    var v = Math.max(0, base);
    if (pct) v = Math.floor(v * (100 + pct) / 100);
    v = Math.max(0, v - (p.statuses.hiss || 0));
    return v;
  }
  AI.hitDamage = hitDamage;

  // ---- describing intents -----------------------------------------------------------------------------------------------
  var ICON = { attack: 'claw', shield: 'shield', buff: 'up', debuff: 'down', summon: 'egg', sunbeam: 'sunbeam', wait: 'zzz', steal: 'hand', flee: 'door', tunnel: 'tunnel', attach: 'special', snatch: 'special', hide: 'shield', trap: 'special', sabotage: 'down', special: 'special' };
  AI.describeInto = function (B, p) {
    var a = p.nextAction;
    if (!a) { p.intent = null; return; }
    var d = { pestUid: p.uid, kind: a.kind, label: a.label || a.kind, icon: a.icon || ICON[a.kind] || 'special', dmg: 0, hits: 1, floors: [], text: '', targetUid: null, sunbeam: false, hidden: false };
    if (p.hiddenIntent || (p.hiddenIntentUntilDecoys && B.livePests().some(function (q) { return q.flags && q.flags.decoy; }))) { d.icon = 'eye'; d.hidden = true; d.text = '?'; d.label = '?'; p.intent = d; return; }
    var dmgKind = a.kind === 'attack' || a.kind === 'steal' && a.dmg || a.kind === 'debuff' && a.dmg || a.kind === 'sunbeam';
    if (p.statuses.yarn) { d.icon = 'zzz'; d.text = 'Zzz ' + p.statuses.yarn; d.kind = 'wait'; p.intent = d; return; }
    if (p.statuses.scared) { d.icon = 'zzz'; d.text = 'Scared'; d.kind = 'wait'; p.intent = d; return; }
    if (a.kind === 'attack' || a.kind === 'steal' || (a.kind === 'debuff' && a.dmg) || a.kind === 'sunbeam') {
      var dm = a.kind === 'sunbeam' ? (a.dmg || 0) : hitDamage(B, p, a);
      d.dmg = dm; d.hits = AI.mirrorHits(B, p, a);
      var tg = a.kind === 'sunbeam' ? { cats: [], sunbeam: true } : resolve(B, p, a, false);
      d.sunbeam = tg.sunbeam;
      d.floors = U.uniq(tg.cats.map(function (c) { return c.floor; }));
      d.targetUids = tg.cats.map(function (c) { return c.uid; });
      d.targetUid = tg.cats.length ? tg.cats[0].uid : null;
      if (!tg.cats.length && !tg.sunbeam && a.pick !== 'random') { d.icon = 'stairs'; d.text = 'Stairs'; d.noTarget = true; }
      else if (a.kind === 'sunbeam' || (tg.sunbeam && !tg.cats.length)) { d.icon = 'sunbeam'; d.text = 'Sunbeam ' + dm + (d.hits > 1 ? ' x' + d.hits : ''); }
      else d.text = (a.label || 'Attack') + ' ' + dm + (d.hits > 1 ? ' x' + d.hits : '');
      if (a.pick === 'random') d.text = (a.label || 'Attack') + ' ' + dm + (d.hits > 1 ? ' x' + d.hits : '');
    } else if (a.kind === 'summon') {
      d.text = a.intent || ('Summons ' + (a.count || 1));
    } else if (a.kind === 'shield' || a.kind === 'hide') {
      d.text = a.intent || ('Fluff ' + (a.amount || ''));
    } else {
      d.text = a.intent || a.text || a.label || a.kind;
    }
    if (a._cd !== undefined && a._cd > 0) { d.countdown = a._cd; d.text = (a.label || '') + (SB.content.pest(p.id).raw.countdownLabel ? '' : '') + ' (' + a._cd + ')'; }
    if (a._cd === 0) d.countdown = 0;
    p.intent = d;
  };

  AI.updateIntents = function (B) {
    var S = B.S, list = [], inc = [0, 0, 0, 0];
    B.pests().forEach(function (p) {
      if (p.dead || p.removed) return;
      // re-select conditional actions every refresh so they stay honest
      var pat = currentPattern(B, p);
      if (pat && (pat.type === 'conditional')) AI.select(B, p); else AI.describeInto(B, p);
      var d = p.intent;
      if (!d) return;
      list.push({ pestUid: p.uid, icon: d.icon, text: d.text, dmg: d.dmg, hits: d.hits, floors: d.floors, kind: d.kind, label: d.label, targetUid: d.targetUid, sunbeam: d.sunbeam, countdown: d.countdown });
      if (d.dmg > 0 && !p.statuses.yarn && !p.statuses.scared && !d.noTarget) {
        var total = d.dmg * d.hits;
        if (d.sunbeam) inc[3] += total;
        (d.floors || []).forEach(function (f) { inc[f] += total; });
      }
    });
    S.intents = list; S.incoming = inc;
  };

  // ---- executing actions ---------------------------------------------------------------------------------------------------
  function runEffs(B, p, effs, extra) {
    if (!effs || !effs.length) return;
    var ctx = B.makeCtx(Object.assign({ src: { kind: 'pest', unit: p }, self: p, subject: p, floorOverride: p.floor, lk: 'pestact:' + p.uid }, extra || {}));
    B.runEffects(effs, ctx);
  }

  function attackAction(B, p, a) {
    var hits = AI.mirrorHits(B, p, a), did = false, lastCat = null;
    var ranged = (a.flags || []).indexOf('ranged') >= 0;
    B.fire('onPestAttack', { subject: p, floor: p.floor });
    B.drain();
    for (var h = 0; h < hits; h++) {
      if (p.dead || p.removed) break;
      var tg = resolve(B, p, a, true);
      // Dizzy pests may bite a neighbour instead
      if (p.statuses.dizzy && tg.cats.length) {
        var pc = Math.min(rv('dizzy_misdirect_percent_cap', 75), p.statuses.dizzy * rv('dizzy_misdirect_percent_per_stack', 25));
        if (B.rng.int(100) < pc) {
          var nb = B.S.floors[p.floor].pests.filter(function (q) { return q !== p && !q.dead && Math.abs(q.pos - p.pos) === 1; });
          if (nb.length) {
            var victim = B.pickOne(nb);
            B.emitAttack(p, victim, 'melee', { hit: h + 1, misdirected: true });
            B.damage(victim, hitDamage(B, p, a), { kind: 'hit', src: p, noHiss: true, melee: true });
            B.reap(); did = true; continue;
          }
        }
      }
      if (!tg.cats.length && !tg.sunbeam) break;
      did = true;
      var dmg = hitDamage(B, p, a);
      var multi = tg.cats.length > 1;
      tg.cats.forEach(function (c) {
        B.emitAttack(p, c, ranged ? 'ranged' : 'melee', { hit: h + 1 });
        var mult = 1;
        if (p.flags.doubleVs && c.statuses[p.flags.doubleVs] || (p.flags.ignoreHidden && c.hidden && p.flags.doubleVsHidden)) mult = 2;
        B.damage(c, dmg * mult, { kind: 'hit', src: p, noHiss: true, melee: !ranged, hitNo: h + 1 });
        lastCat = c;
        (a.onHit || []).length && runEffs(B, p, a.onHit, { target: c, data: { target: c } });
      });
      if (tg.sunbeam && !tg.cats.length) {
        B.emitAttack(p, null, 'sunbeam', { hit: h + 1 });
        B.hitSunbeam(dmg, { src: p, noHiss: true });
      }
      B.reap();
      if (B.S.over) return true;
      B.drain();
    }
    // Sneaky: also hits the Sunbeam from the Attic even with cats present
    if (did && p.floor === B.numFloors - 1 && !p.dead && (B.hasTrait(p, 'sneaky') || (a.flags || []).indexOf('sunbeamToo') >= 0) && B.blockers(p.floor).length > 0) {
      var sd = p.passives.filter(function (x) { return x.rule && x.rule.sneakySunbeamDmg; })[0];
      B.hitSunbeam(sd ? sd.rule.sneakySunbeamDmg : hitDamage(B, p, a), { src: p, noHiss: true });
    }
    if (did) {
      runEffs(B, p, a.effects, { target: lastCat, data: { target: lastCat } });
      if (a.shove && lastCat) B.shoveCat(lastCat, 'back');
    }
    return did;
  }

  function debuffAction(B, p, a) {
    var tg = resolve(B, p, a, true), did = false;
    if (a.dmg) {
      var dmg = hitDamage(B, p, a);
      tg.cats.forEach(function (c) { B.emitAttack(p, c, 'melee', {}); B.damage(c, dmg, { kind: 'hit', src: p, noHiss: true, melee: true }); did = true; });
      B.reap();
    }
    tg.cats.forEach(function (c) {
      if (a.status && !c.dead) { B.addStatus(c, a.status, a.amount || 1, { src: p.id }); did = true; }
      if (a.shove && !c.dead) B.shoveCat(c, 'back');
    });
    if (a.effects && a.effects.length) {
      var last = tg.cats[0] || null;
      runEffs(B, p, a.effects, { target: last, data: { target: last }, choice: last ? { catUid: last.uid, floor: last.floor } : null });
      did = true;
    }
    return did || a.kind === 'debuff';
  }

  function summonAction(B, p, a) {
    if (a.effects && a.effects.length) { runEffs(B, p, a.effects); return true; }
    if (a.onlyIfAbsent && B.livePests().some(function (q) { return q.id === a.id; })) return true;
    var floors = Array.isArray(a.floors) ? a.floors.map(function (x) { return x - 1; }) : (typeof a.floor === 'number' ? [a.floor - 1] : [p.floor]);
    floors.forEach(function (fi) {
      for (var i = 0; i < (a.count || 1); i++) B.spawnPest(a.id, fi, a.at || 'back', { yarn: rv('yarn_summoned_pest_start', 1), from: 'summon', source: p.uid });
    });
    return true;
  }

  AI.specials = {};
  function flattenBoxes(B, fromFloor, all) {
    B.S.floors.forEach(function (f, fi) {
      if (!all && fi < fromFloor) return;
      f.rooms.slice().forEach(function (r) { if (r.rtype === 'box') B.flattenBox(r, 'pest'); });
    });
  }
  AI.specials.flatten = function (B, p, a) { flattenBoxes(B, a.floors === 'all' ? 0 : p.floor, a.floors === 'all'); };
  AI.specials.steal = function (B, p, a) {
    var rooms = [];
    B.S.floors.forEach(function (f) { f.rooms.forEach(function (r) { if (r.rtype === 'toy') rooms.push(r); }); });
    if (rooms.length) { var r = B.pickOne(rooms); B.removeRoom(r, 'stolen'); p.stolenRoom = r.id; B.toast(p.name + ' steals ' + r.name); }
  };
  AI.act = function (B, p) {
    var a = p.nextAction;
    if (!a) return;
    var done = true;
    switch (a.kind) {
      case 'attack': done = attackAction(B, p, a); break;
      case 'steal': {
        if (a.what === 'fluff') {
          var tg = resolve(B, p, a, true);
          tg.cats.forEach(function (c) { var got = B.stripFluff(c, a.n || 4); if (got) B.addFluff(p, got); });
          if (a.dmg) attackAction(B, p, a);
        } else if (a.what === 'roomItem') {
          var rooms = [];
          B.S.floors.forEach(function (f) { f.rooms.forEach(function (r) { if (r.rtype === 'toy') rooms.push(r); }); });
          if (rooms.length) { var r = B.pickOne(rooms); B.removeRoom(r, 'stolen'); p.stolenRoom = r.id; B.toast(p.name + ' steals ' + r.name); }
        } else if (a.dmg) done = attackAction(B, p, a);
        runEffs(B, p, a.effects);
        break;
      }
      case 'sunbeam': {
        var dm = a.dmg || 0;
        B.emitAttack(p, null, 'sunbeam', {});
        B.hitSunbeam(dm, { src: p, noHiss: true });
        runEffs(B, p, a.effects);
        break;
      }
      case 'shield': case 'hide': {
        if (a.amount) B.addFluff(p, a.amount);
        runEffs(B, p, a.effects);
        break;
      }
      case 'buff': case 'wait': case 'flee': case 'tunnel': case 'sabotage': case 'hide2':
        runEffs(B, p, a.effects); break;
      case 'debuff': done = debuffAction(B, p, a); break;
      case 'summon': summonAction(B, p, a); break;
      case 'attach': done = AI.attach(B, p, a); break;
      case 'snatch': done = AI.snatch(B, p, a); break;
      case 'trap': runEffs(B, p, a.effects); break;
      case 'special': {
        var sp = AI.specials[a.op];
        if (sp) sp(B, p, a); else { U.warnOnce('special:' + a.op, 'unsupported boss special "' + a.op + '"'); }
        runEffs(B, p, a.effects);
        if (a.then) { var th = a.then; if (th.kind) { var save = p.nextAction; p.nextAction = th; AI.act(B, p); p.nextAction = save; } }
        break;
      }
      default: runEffs(B, p, a.effects);
    }
    return done;
  };

  // parasites: the pest leaves the board and clings to a cat
  AI.attach = function (B, p, a) {
    var tg = resolve(B, p, a, true).cats[0];
    if (!tg) return false;
    B.removeUnit(p); p.removed = false;
    p.host = tg.uid; p.attachedTo = tg.uid;
    B.S.attached.push(p);
    B.emit('attach', { uid: p.uid, host: tg.uid, floor: tg.floor });
    return true;
  };
  B_attachHelpers();
  function B_attachHelpers() {
    var BT = SB.battle && SB.battle.Battle && SB.battle.Battle.prototype;
    if (!BT) return;
    BT.detachParasite = function (a, why) {
      var S = this.S, i = S.attached.indexOf(a);
      if (i >= 0) S.attached.splice(i, 1);
      if (a.kind === 'pest') { a.dead = true; a.removed = true; a.host = null; this.emit('death', { uid: a.uid, side: 'pest', id: a.id, floor: a.floor, detached: true, why: why }); }
      this.touch();
    };
  }
  AI.snatch = function (B, p, a) {
    var S = B.S;
    var pool = S.draw.slice();
    if (!pool.length) pool = S.discard.slice();
    if (!pool.length) return true;
    var u = B.pickOne(pool);
    var i = S.draw.indexOf(u); if (i >= 0) S.draw.splice(i, 1); else S.discard.splice(S.discard.indexOf(u), 1);
    p.snatched = (p.snatched || []).concat([u]);
    B.syncPiles();
    B.toast(p.name + ' snatches a card');
    return true;
  };
  E.ops.register('returnSnatched', function (ctx, e, B) {
    var p = ctx.self; if (!p || !p.snatched) return;
    p.snatched.forEach(function (u) { B.S.discard.push(u); }); p.snatched = []; B.syncPiles();
  });
  E.ops.register('returnStolen', function (ctx, e, B) { var p = ctx.self; if (p) p.stolenRoom = null; });

  // ---- the Pest Attacks phase ----------------------------------------------------------------------------------------------------
  AI.pestPhase = function (B) {
    var S = B.S;
    // upkeep: Itch and parasites, floors 1 to 3, front to back
    B.pests().forEach(function (p) {
      if (p.dead) return;
      if (p.statuses.itch) { B.damage(p, p.statuses.itch, { kind: 'direct', srcId: 'itch' }); B.removeStatus(p, 'itch', 1); }
    });
    (S.attached || []).slice().forEach(function (a) {
      if (a.kind !== 'pest' || a.dead) return;
      var host = B.catByUid(a.host);
      if (!host) { B.detachParasite(a, 'host gone'); return; }
      var par = (SB.content.pest(a.id) || {}).parasite || {};
      var purr = (S.floors[host.floor] && S.floors[host.floor].statuses && S.floors[host.floor].statuses.purr) || 0;
      if (purr >= 10 && (par.removeBy || []).indexOf('purrAura10') >= 0) { B.detachParasite(a, 'purr'); return; }
      a.bites = (a.bites || 0) + 1;
      var dmg = Math.min(par.maxDmg || 99, (par.dmgPerRound || 1) + (par.growth || 0) * (a.bites - 1));
      B.damage(host, dmg, { kind: par.ignoreFluff === false ? 'hit' : 'direct', src: a, srcId: a.id, noWake: false });
    });
    B.reap();
    B.fire('onPestPhaseStart', { subject: null });
    B.fire('onRoundStart', { subject: null });
    B.drain();
    for (var fi = 0; fi < B.numFloors && !S.over; fi++) {
      var order = S.floors[fi].pests.slice();
      for (var k = 0; k < order.length && !S.over; k++) {
        var p = order[k];
        if (p.dead || p.removed || p.floor !== fi || p.queued) continue;
        AI.takeTurn(B, p);
        B.reap();
        B.drain();
      }
    }
    if (!S.over) { B.fire('onPestPhaseEnd', { subject: null }); B.drain(); }
    // refresh intents for the next player turn
    B.pests().forEach(function (p) { if (!p.dead && !p.removed) AI.select(B, p); });
  };

  AI.takeTurn = function (B, p) {
    var S = B.S;
    if (p.skipRound === S.round) { return; }
    if (!p.nextAction) AI.select(B, p);
    if (p.statuses.yarn) { B.emit('intent', { uid: p.uid, skipped: 'yarn' }); return; }
    if (p.statuses.scared) { B.emit('intent', { uid: p.uid, skipped: 'scared' }); return; }
    // a fresh intent so conditional patterns use the board as it is now
    var pat = currentPattern(B, p);
    if (pat && pat.type === 'conditional') AI.select(B, p);
    var a = p.nextAction;
    B.emit('intent', { uid: p.uid, id: p.id, kind: a.kind, label: a.label, floor: p.floor, pos: p.pos });
    var acted = AI.act(B, p);
    if (p._sudsHid) { p.sudsRevealed = true; B.touch(); }  // Suds: Hidden until the pest acts
    if (acted === false && a.kind === 'attack') {
      // nothing to hit: the pattern does not advance (it will climb instead)
      if (p.statuses.rage === undefined) { /* Rage grows when frustrated */ }
      B.fire('onPestIdle', { subject: p, floor: p.floor });
      return;
    }
    advance(B, p);
    if (!p.dead && !p.removed) AI.select(B, p);
  };

  // ---- boss phases ----------------------------------------------------------------------------------------------------------------
  AI.checkPhase = function (B, p) {
    if (!p.boss || p.dead || p.removed) return;
    var d = pestDef(B, p);
    if (!d || !d.phases || !d.phases.length) return;
    var guard = 0;
    while (guard++ < 4) {
      var next = d.phases[p.pat.phase + 1];
      if (!next) break;
      var pct = p.hp * 100 / p.maxHp;
      if (!(pct < (next.hpPctBelow || 0))) break;
      p.pat.phase++; p.pat.idx = 0; p.pat.cd = null; p.pat.round = 0;
      (next.traitsRemove || []).forEach(function (t) { delete p.traitSet[String(t).toLowerCase()]; });
      (next.traitsAdd || []).forEach(function (t) { p.traitSet[String(t).toLowerCase()] = true; });
      (next.clears || []).forEach(function (s) { B.removeStatus(p, s); });
      if (next.stagger) p.skipRound = B.S.round;
      B.emit('phase', { boss: p.uid, phaseId: next.id, name: next.name, announce: next.announce });
      if (next.announce) B.toast(next.announce);
      if (next.onEnter) runEffs(B, p, next.onEnter);
      AI.select(B, p);
    }
  };

  // ---- hazards -------------------------------------------------------------------------------------------------------------------------
  AI.hazardTick = {
    rat_tide: function (B, fi) {
      var rats = B.S.floors[fi].pests.filter(function (q) { return !q.dead && B.hasTrait(q, 'rat'); }).length;
      var dmg = Math.min(4, rats);
      if (dmg > 0) B.S.floors[fi].cats.forEach(function (c) { B.damage(c, dmg, { kind: 'direct', srcId: 'rat_tide' }); });
    },
    puddle: function (B, fi) { B.S.floors[fi].cats.forEach(function (c) { B.addStatus(c, 'wet', 1, { force: true }); }); },
    suds: function (B, fi) { B.S.floors[fi].cats.forEach(function (c) { B.addStatus(c, 'wet', 1, { force: true }); }); }
  };
  AI.tickHazards = function (B) {
    B.S.floors.forEach(function (f, fi) {
      Object.keys(f.hazards).forEach(function (h) { var fn = AI.hazardTick[h]; if (fn) fn(B, fi); });
    });
    B.reap();
  };
})();
