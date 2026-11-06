/* SUNBEAM SIEGE: event engine (agent C2).
 * Classic script. Attaches SB.event.
 *   SB.event.pick(run, eventId?)            choose the event for the current Event node (forced follow-ups first)
 *   SB.event.options(run, event)            choices with enabled flag and the unmet requirement text
 *   SB.event.needs(run, event, idx)         the player picks this choice will ask for (cats, cards, drafts)
 *   SB.event.choose(run, event, idx, args)  resolve a choice. args.picks = [..] answers the needs in order,
 *                                           args.auto = true lets the engine answer them from the event rng stream.
 *                                           Returns {ok, text, fightEncounter?, effectsApplied[], needs?}
 *   SB.event.pickDraft(run, cardId)         claim an event card draft (or null to skip)
 * Chance outcomes roll on rngFor(seed, 'event', nodeId:eventId:choice), so a reload cannot reroll them.
 * No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  var E = SB.event = SB.event || {};
  E.gaps = E.gaps || {};
  function RU() { return SB.run.U; }
  function CC() { return SB.content; }
  function rules() { return SB.data.rules || {}; }
  function all() { return SB.data.events || []; }
  function byId(id) { for (var i = 0; i < all().length; i++) if (all()[i].id === id) return all()[i]; return null; }
  E.byId = byId;
  E.all = all;

  var WEIGHTS = { boon: 30, gamble: 25, trade: 20, story: 15, fight: 10 };

  /* ------------------------------------------------------------------ selection */
  function flagSet(run, f) { var v = run.flags[f]; return v !== undefined && v !== null && v !== false && v !== 0; }
  E.pick = function (run, eventId) {
    var cur = run.current || (run.current = {});
    var used = run.usedEvents = run.usedEvents || [];
    var ev = null;
    if (eventId) ev = byId(eventId);
    if (!ev) {
      // forced follow ups come first
      var forced = all().filter(function (e) {
        return e.forced && e.requires && e.requires.flag && flagSet(run, e.requires.flag) && e.acts.indexOf(run.act) >= 0 && used.indexOf(e.id) < 0;
      });
      if (forced.length) ev = forced[0];
    }
    if (!ev) {
      var rng = RU().rng(run, 'event', 'pick:' + (cur.nodeId || run.act));
      var fightDone = !!(run.flags.eventFightActs && run.flags.eventFightActs[run.act]);
      var pool = all().filter(function (e) {
        return !e.forced && !(e.requires && e.requires.flag) && e.acts.indexOf(run.act) >= 0 && used.indexOf(e.id) < 0 && !(e.category === 'fight' && fightDone);
      });
      if (!pool.length) pool = all().filter(function (e) { return !e.forced && !(e.requires && e.requires.flag) && used.indexOf(e.id) < 0 && e.category !== 'fight'; });
      if (!pool.length) pool = all().filter(function (e) { return !e.forced && !(e.requires && e.requires.flag) && e.category !== 'fight'; });
      // category weight, home act events favoured 2 to 1 over shared ones
      ev = rng.weighted(pool, function (e) { return (WEIGHTS[e.category] || 10) * (e.homeAct === run.act ? 2 : 1); });
    }
    if (!ev) return null;
    if (used.indexOf(ev.id) < 0) used.push(ev.id);
    cur.eventId = ev.id;
    cur.eventPending = [];
    cur.eventDone = false;
    return ev;
  };

  /* ------------------------------------------------------------------ requirements */
  function catLivesOk(run, n) { return RU().cats(run).some(function (c) { return c.lives >= n; }); }
  E.checkReq = function (run, req) {
    if (!req) return { ok: true };
    if (req.fish !== undefined && run.fish < req.fish) return { ok: false, text: 'Needs ' + req.fish + ' Fish' };
    if (req.clan && run.clan !== req.clan && run.side !== req.clan) return { ok: false, text: 'Needs a ' + req.clan + ' clan' };
    if (req.flag && !flagSet(run, req.flag)) return { ok: false, text: 'Needs: ' + req.flag.replace(/_/g, ' ') };
    if (req.champion && !RU().champion(run)) return { ok: false, text: 'Needs your champion' };
    if (req.curses && run.deck.filter(function (i) { var d = RU().def(i); return d && d.type === 'curse'; }).length < req.curses) return { ok: false, text: 'Needs a curse in your deck' };
    if (req.catLives && !catLivesOk(run, req.catLives)) return { ok: false, text: 'Needs a cat with ' + req.catLives + ' lives' };
    return { ok: true };
  };
  E.options = function (run, event) {
    return event.choices.map(function (c, i) {
      var r = E.checkReq(run, c.req);
      return { idx: i, id: c.id, label: c.label, enabled: r.ok, reqText: r.ok ? null : r.text, req: c.req || null };
    });
  };

  /* ------------------------------------------------------------------ planning */
  // flatten chance ops into concrete ops (rolled once, deterministically) and collect result text
  function flatten(run, ev, idx, ops, rng, out, texts) {
    ops.forEach(function (op) {
      if (op.op === 'chance') {
        var roll = rng.next(), acc = 0, chosen = op.outcomes[op.outcomes.length - 1];
        for (var i = 0; i < op.outcomes.length; i++) { acc += op.outcomes[i].p; if (roll < acc) { chosen = op.outcomes[i]; break; } }
        if (chosen.result) texts.push(chosen.result);
        flatten(run, ev, idx, chosen.effects || [], rng, out, texts);
      } else out.push(op);
    });
  }
  function plan(run, ev, idx) {
    var ch = ev.choices[idx];
    var nodeKey = (run.current && run.current.nodeId) || ('act' + run.act);
    var rng = RU().rng(run, 'event', nodeKey + ':' + ev.id + ':' + ch.id);
    var ops = [], texts = [];
    flatten(run, ev, idx, ch.effects || [], rng, ops, texts);
    return { ops: ops, texts: texts, rng: rng, choice: ch };
  }
  function needOf(run, op) {
    switch (op.op) {
      case 'lives': if (op.who === 'choose') return { op: 'lives', kind: 'cat' }; return null;
      case 'removeCard':
        if (op.mode === 'choose') return { op: 'removeCard', kind: 'card', count: op.count || 1, curseOnly: !!op.curseOnly };
        return null;
      case 'duplicateCard': return op.mode === 'choose' ? { op: 'duplicateCard', kind: 'card' } : null;
      case 'upgradeCard': return op.mode === 'choose' ? { op: 'upgradeCard', kind: 'card' } : null;
      default: return null;
    }
  }
  E.needs = function (run, event, idx) {
    var p = plan(run, event, idx), out = [];
    p.ops.forEach(function (op) {
      var n = needOf(run, op);
      if (!n) return;
      var count = n.count || 1;
      for (var k = 0; k < count; k++) {
        var cand = candidates(run, op);
        // an op with nothing to choose from is skipped later and asks nothing
        if (cand.length) out.push(Object.assign({}, n, { candidates: cand.map(function (i) { return i.uid; }) }));
      }
    });
    return out;
  };
  function candidates(run, op) {
    if (op.op === 'lives') return RU().cats(run);
    if (op.op === 'removeCard') {
      return run.deck.filter(function (i) {
        var d = RU().def(i);
        if (op.curseOnly && !(d && d.type === 'curse')) return false;
        return RU().canRemove(run, i).ok;
      });
    }
    if (op.op === 'duplicateCard') return run.deck.filter(function (i) { return SB.post.canLitter(run, i).ok; });
    if (op.op === 'upgradeCard') return run.deck.filter(function (i) { return SB.post.isUpgradeable(run, i) && upgradeFor(run, i, RU().rng(run, 'event', 'probe'), true); });
    return [];
  }
  function upgradeFor(run, inst, rng, probe) {
    var offers = SB.post.rollScratches(run, inst, rng, 3, SB.post.maxTier(run));
    return offers.length ? offers[0] : null;
  }

  /* ------------------------------------------------------------------ applying */
  function safeAdd(run, id, applied) {
    if (!CC().card(id)) { E.gaps[id] = true; applied.push({ op: 'addCard', card: id, missing: true }); return null; }
    var inst = RU().addCard(run, id, 'event');
    applied.push({ op: 'addCard', card: id, uid: inst && inst.uid });
    return inst;
  }
  function relicGrant(run, op, rng, applied) {
    var id = op.relic;
    if (!id) id = SB.rewards.rollRelic(run, rng, 'event', op.rarity);
    if (id && !CC().relic(id)) { E.gaps[id] = true; id = null; }
    if (!id) { RU().addFish(run, 30, { pct: false }); applied.push({ op: 'addRelic', fallbackFish: 30 }); return; }
    if (SB.rewards.ownedRelic(run, id)) { RU().addFish(run, 30, { pct: false }); applied.push({ op: 'addRelic', dup: id, fallbackFish: 30 }); return; }
    RU().giveRelic(run, id, 'event');
    applied.push({ op: 'addRelic', relic: id });
  }
  function draftPool(run, rng, op) {
    var count = op.count || 3, ids = [];
    var pool = op.pool;
    if (pool === 'rare') {
      var cands = ['main', 'side', 'neutral'].reduce(function (a, g) { return a.concat(SB.rewards.poolFor(run, g)); }, []).filter(function (c) { return c.rarity === 'rare' && SB.rewards.countInDeck(run, c.id) < SB.rewards.cardCap(c); });
      while (ids.length < count && cands.length) { var c = rng.pick(cands); ids.push(c.id); cands = cands.filter(function (x) { return x !== c; }); }
      return ids;
    }
    if (pool === 'mischief') {
      var m = SB.rewards.allDraftable().filter(function (c) { return (CC().clanId ? CC().clanId(c.clan) : c.clan) === 'mischief'; });
      if (!m.length) m = SB.rewards.allDraftable();
      while (ids.length < count && m.length) { var c2 = rng.pick(m); ids.push(c2.id); m = m.filter(function (x) { return x !== c2; }); }
      return ids;
    }
    var group = pool === 'side' ? 'side' : (pool === 'neutral' ? 'neutral' : 'main');
    var list = SB.rewards.poolFor(run, group).filter(function (c) { return SB.rewards.countInDeck(run, c.id) < SB.rewards.cardCap(c); });
    while (ids.length < count && list.length) { var c3 = rng.pick(list); ids.push(c3.id); list = list.filter(function (x) { return x !== c3; }); }
    return ids;
  }

  E.choose = function (run, ev, idx, args) {
    args = args || {};
    if (typeof ev === 'string') ev = byId(ev);
    var cur = run.current;
    if (!cur || run.status !== 'event') return { ok: false, reason: 'Not at an event.' };
    if (cur.eventDone) return { ok: false, reason: 'Already resolved.' };
    var ch = ev.choices[idx];
    if (!ch) return { ok: false, reason: 'No such choice.' };
    var rq = E.checkReq(run, ch.req);
    if (!rq.ok) return { ok: false, reason: rq.text };
    var p = plan(run, ev, idx);
    // collect needs so nothing half applies
    var picks = (args.picks || []).slice();
    var needs = E.needs(run, ev, idx);
    if (needs.length && picks.length < needs.length) {
      if (args.auto) {
        var arng = RU().rng(run, 'event', 'auto:' + ev.id + ':' + idx);
        for (var n = picks.length; n < needs.length; n++) {
          var cands = needs[n].candidates.filter(function (u) { return picks.indexOf(u) < 0; });
          picks.push(arng.pick(cands.length ? cands : needs[n].candidates));
        }
      } else return { ok: false, needs: needs, reason: 'Make your picks first.' };
    }
    // payment check for payDebt
    var applied = [], texts = p.texts.slice(), fight = null, pickAt = 0;
    var rng = p.rng;
    for (var i = 0; i < p.ops.length; i++) {
      var op = p.ops[i];
      switch (op.op) {
        case 'fish':
          if (op.amount >= 0) RU().addFish(run, op.amount, { pct: false, event: true });
          else if (!RU().spendFish(run, -op.amount)) run.fish = 0;
          applied.push(op); break;
        case 'warmth':
          if (op.amount >= 0) RU().heal(run, op.amount);
          else RU().hurtSafe(run, -op.amount);
          applied.push(op); break;
        case 'maxWarmth': RU().raiseMaxWarmth(run, op.amount, true); applied.push(op); break;
        case 'lives': {
          var targets = [];
          var cats = RU().cats(run);
          if (op.who === 'all') targets = cats;
          else if (op.who === 'champion') targets = [RU().champion(run)].filter(Boolean);
          else if (op.who === 'lowest') { var low = cats.slice().sort(function (a, b) { return a.lives - b.lives; })[0]; targets = low ? [low] : []; }
          else if (op.who === 'random') { var r1 = rng.pick(cats); targets = r1 ? [r1] : []; }
          else if (op.who === 'choose') {
            if (needs.length && candidates(run, op).length) { var inst = RU().inst(run, picks[pickAt++]); if (inst) targets = [inst]; }
          }
          targets.forEach(function (t) {
            if (t.sitOut && op.amount > 0) { t.sitOut = false; t.lives = Math.max(t.lives, 1); }
            RU().gainLives(run, t, op.amount, true);
          });
          applied.push({ op: 'lives', amount: op.amount, who: op.who, uids: targets.map(function (t) { return t.uid; }) });
          break;
        }
        case 'addCard': safeAdd(run, op.card, applied); break;
        case 'cardDraft': {
          var ids = draftPool(run, RU().rng(run, 'event', (cur.nodeId || '') + ':' + ev.id + ':draft' + i), op);
          if (ids.length) { cur.eventPending = (cur.eventPending || []).concat([{ kind: 'draft', ids: ids }]); }
          applied.push({ op: 'cardDraft', ids: ids });
          break;
        }
        case 'removeCard': {
          var cnt = op.count || 1;
          for (var k = 0; k < cnt; k++) {
            var tgt = null;
            if (op.mode === 'choose') { if (needs.length && candidates(run, op).length) tgt = RU().inst(run, picks[pickAt++]); }
            else if (op.mode === 'random') { tgt = rng.pick(candidates(run, op)); }
            else if (op.mode === 'specific') { tgt = run.deck.filter(function (x) { return x.id === op.card || (CC().card(x.id) && CC().card(op.card) && CC().card(x.id).id === CC().card(op.card).id); })[0] || null; }
            if (tgt && RU().canRemove(run, tgt).ok) {
              RU().removeInst(run, tgt.uid);
              var td = CC().card(tgt.id);
              if (!(td && td.type === 'curse')) run.adopted = (run.adopted || 0) + 1;
              applied.push({ op: 'removeCard', card: tgt.id });
            }
          }
          break;
        }
        case 'duplicateCard': {
          var src = null;
          if (needs.length && candidates(run, op).length) src = RU().inst(run, picks[pickAt++]);
          if (src && SB.post.canLitter(run, src).ok) {
            var copy = RU().addCard(run, src.id, 'event');
            if (copy) { copy.lives = src.lives; copy.maxLives = src.maxLives; copy.scratches = (src.scratches || []).slice(); copy.plus = src.plus; }
            applied.push({ op: 'duplicateCard', card: src.id });
          }
          break;
        }
        case 'upgradeCard': {
          var uc = null;
          if (op.mode === 'choose') { if (needs.length && candidates(run, op).length) uc = RU().inst(run, picks[pickAt++]); }
          else { var cs = candidates(run, op); uc = rng.pick(cs); }
          if (uc) {
            var upg = upgradeFor(run, uc, rng);
            if (upg) {
              var res = SB.post.scratch(run, uc.uid, upg.id, { free: false, price: 0, stall: true, replace: SB.post.freeSlots(run, uc) <= 0 ? 0 : undefined, ignoreTier: true });
              applied.push({ op: 'upgradeCard', uid: uc.uid, upgrade: upg.id, ok: !!(res && res.ok) });
            } else if (!uc.plus && RU().def(uc).upgrade) {
              SB.post.plus(run, uc.uid, { free: true, price: 0 });
              applied.push({ op: 'upgradeCard', uid: uc.uid, plus: true });
            }
          }
          break;
        }
        case 'evolveCard': {
          var holder = run.deck.filter(function (x) { return x.id === op.from; })[0];
          if (holder && CC().card(op.to)) { holder.id = op.to; holder.evolved = (holder.evolved || 0) + 1; applied.push(op); }
          else if (!CC().card(op.to)) { E.gaps[op.to] = true; applied.push({ op: 'evolveCard', missing: op.to }); }
          break;
        }
        case 'addRelic': relicGrant(run, op, RU().rng(run, 'event', (cur.nodeId || '') + ':' + ev.id + ':relic' + i), applied); break;
        case 'fight': fight = op; applied.push(op); break;
        case 'setFlag': run.flags[op.flag] = op.value === undefined ? true : op.value; applied.push(op); break;
        case 'clearFlag': delete run.flags[op.flag]; applied.push(op); break;
        case 'payDebt': {
          var owed = Number(run.flags.gerald_debt) || 0;
          var amt = Math.round(owed * (op.rate || 1));
          if (!RU().spendFish(run, amt)) { run.fish = 0; }
          delete run.flags.gerald_debt;
          applied.push({ op: 'payDebt', amount: amt });
          break;
        }
        default: applied.push({ op: op.op, ignored: true });
      }
    }
    RU().stat(run, 'eventsResolved', 1);
    cur.eventDone = true;
    cur.eventChoice = ch.id;
    var text = [ch.result].concat(texts).filter(Boolean).join(' ');
    var out = { ok: true, text: text, effectsApplied: applied, pending: cur.eventPending || [] };
    if (fight) {
      cur.eventDone = true;
      var started = SB.run.startEventFight(run, fight);
      out.fightEncounter = fight.encounter;
      out.fight = started;
    }
    if (!run.noAutosave) SB.run.save(run);
    return out;
  };

  // claim one of the drafts an event opened (cardId null skips). Returns {ok}
  E.pickDraft = function (run, cardId) {
    var cur = run.current;
    if (!cur || !cur.eventPending || !cur.eventPending.length) return { ok: false, reason: 'No draft waiting.' };
    var d = cur.eventPending[0];
    if (cardId) {
      if (d.ids.indexOf(cardId) < 0) return { ok: false, reason: 'Not on offer.' };
      RU().addCard(run, cardId, 'event');
    }
    cur.eventPending.shift();
    return { ok: true, picked: cardId || null, remaining: cur.eventPending.length };
  };
  // used by tests and UIs that want every pending draft answered automatically
  E.autoDrafts = function (run) {
    var cur = run.current, n = 0;
    while (cur && cur.eventPending && cur.eventPending.length) { E.pickDraft(run, cur.eventPending[0].ids[0]); n++; }
    return n;
  };
})();
