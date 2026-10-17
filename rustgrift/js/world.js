'use strict';
// ===================== WORLD: Crews & Turf logic (WORLD_DESIGN.md sections 4-6, 8, 10) =====================
// Global `World` API + run.world state + integration hooks into the existing scenes (no other file is edited):
//   newRun / makeMapScene / rollGraft are re-assigned (wrapping the originals),
//   RewardScene.prototype.enter/next, BattleScene.prototype.enter/applyCard/startPlayerTurn/endTurnSeq/drawBase/update,
//   NegotiationScene.prototype.enter/startPlayerTurn/finish/drawToken, EncounterScene.prototype.enter, ShopScene.prototype.enter,
//   MenuScene.prototype.cont are wrapped (each wrapper calls the original).
const World = (() => {
  const SLOTS = ['Day', 'Dusk', 'Night'], DAYS = 6, NIGHT = 2;
  const ADJ = {}; VENUE_IDS.forEach(v => { ADJ[v] = []; });
  EDGES.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });
  const w_ = () => (G.run && G.run.world) || null;
  const run_ = () => G.run;
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k] != null ? o[k] : '');
  const half = v => { const a = Math.abs(v) / 2, i = Math.floor(a), f = a - i; return (v < 0 ? '-' : '+') + (i ? i : '') + (f ? '½' : (i ? '' : '0')); };

  // ------------------------------------------------------------------ state
  function freshNpc() { return { rapport: 0, defeated: false, recruited: false, metToday: false, giftedToday: false, hiddenUntil: 0 }; }
  function init(run, act, carry) {
    act = act || 1;
    const ch = charById(run.char) || {};
    const w = {
      act, day: 1, slot: 0, at: 'home_studio', standing: {}, half: {}, turf: {}, contestedBy: {}, npc: {},
      requests: [], favours: [], buzz: 0, rumors: [], rumorLog: [], pending: null, flags: {}, log: [], offers: {},
      visited: { home_studio: 1 }, touched: {}, dayDelta: {}, queue: [], lastCred: null, lastResult: null, notes: [], reqN: 0,
      tieKey: {}, bonded: {}, safeUntil: 0,
      stats: { fights: 0, talks: 0, travels: 0, ambushes: 0, bounties: 0, flips: 0, reqDone: 0, reqFailed: 0, recruits: 0 }
    };
    CREW_IDS.forEach(c => { w.standing[c] = 0; w.half[c] = 0; w.touched[c] = 1; w.dayDelta[c] = 0; w.tieKey[c] = Math.random(); });
    VENUE_IDS.forEach(v => { const d = VENUES[v].district; w.turf[v] = CREWS[d] ? d : 'none'; });
    NPC_IDS.forEach(id => { w.npc[id] = freshNpc(); });
    if (carry) {
      // act 2: same Quarter, same friends and enemies, everyone louder
      Object.assign(w.standing, carry.standing); Object.assign(w.half, carry.half); Object.assign(w.turf, carry.turf);
      for (const v in w.turf) if (w.turf[v] === 'contested') w.turf[v] = (carry.contestedBy[v] && carry.contestedBy[v].to) || 'none';
      NPC_IDS.forEach(id => { const o = carry.npc[id]; if (o) { w.npc[id].rapport = o.rapport; w.npc[id].recruited = o.recruited; } });
      w.favours = carry.favours.slice(); w.bonded = Object.assign({}, carry.bonded); w.stats = carry.stats;
      w.requests = carry.requests.filter(r => r.state === 'done' || r.state === 'failed');
      w.reqN = carry.reqN; w.flags.act1Buzz = carry.buzz;
      w.rumors = [pick(RUMORS.act2), pick(RUMORS.idle)];
    } else {
      const st = ch.start || {};
      for (const c in st) if (CREWS[c]) w.standing[c] = clamp(Math.round(st[c]), -3, 3);
      w.rumors = ['Headliner Night is in six days. Every crew wants the Stage.', pick(RUMORS.idle)];
    }
    w.rumorLog.push({ day: 1, act, lines: w.rumors.slice() });
    run.map = null; run.pos = -1;
    run.world = w; // so helpers below work while building
    w.buzz = buzz();
    return w;
  }
  function reset(run, act) {
    const old = run.world; run.act = act;
    const w = init(run, act, old);
    run.world = w; syncFavourCards(run); saveRun();
    return w;
  }
  // a reload may land mid-encounter (save happened before): drop a stale pending, keep everything else
  function normalize(run) {
    const w = run && run.world; if (!w) return;
    if (w.pending) { w.pending = null; }
    if (!w.queue) w.queue = [];
    syncFavourCards(run);
  }

  // ------------------------------------------------------------------ names, colours, time
  function name(id) {
    const w = w_(), act = w ? w.act : 1;
    if (CREWS[id]) return crewName(id, act);
    if (VENUES[id]) return VENUES[id].name;
    if (NPCS[id]) return NPCS[id].name;
    if (ENEMIES[id]) return ENEMIES[id].name;
    return id === 'none' ? 'Nobody' : id === 'contested' ? 'Contested' : String(id);
  }
  function crewColor(id) { return CREWS[id] ? CREWS[id].color : id === 'contested' ? '#e8e0c8' : '#cfc6b8'; }
  function slotName(s) { const w = w_(); return SLOTS[s != null ? s : (w ? w.slot : 0)]; }
  function dayLabel() { const w = w_(); if (!w) return ''; return `Day ${w.day} · ${SLOTS[w.slot]}` + (finalNight() ? ' · HEADLINER NIGHT' : ''); }
  function timeLeft() { const w = w_(); if (!w) return 0; return Math.max(0, (DAYS - w.day) * 3 + (NIGHT - w.slot)); }
  function finalNight() { const w = w_(); return !!w && w.day >= DAYS && w.slot >= NIGHT; }
  function scale(v) { const w = w_(); return w && w.act >= 2 ? Math.round(v * 1.4) : v; }
  function eid(npcId) { const w = w_(); return w && w.act >= 2 && ENEMIES[npcId + '_a2'] ? npcId + '_a2' : npcId; }
  // spend n slots; each rollover past Night runs dawn. Clamped at Day 6 Night (the finale has to happen there).
  function advance(n) {
    const w = w_(); if (!w) return [];
    const lines = [];
    for (let i = 0; i < (n || 1); i++) {
      if (finalNight()) break;
      w.slot++;
      if (w.slot > NIGHT) { w.slot = 0; w.day++; lines.push(...endDay()); }
    }
    if (finalNight() && !w.flags.finalNightAnnounced) { w.flags.finalNightAnnounced = 1; const l = 'HEADLINER NIGHT! Every crew is heading for The Stage. Travel is free tonight: get there.'; lines.push(l); w.rumors.unshift(l); }
    return lines;
  }
  function endDay() {
    const w = w_(), run = run_(), lines = [];
    // 1. people reset
    NPC_IDS.forEach(id => { const o = w.npc[id]; o.metToday = false; o.giftedToday = false; if (o.defeated && o.hiddenUntil < w.day) o.defeated = false; });
    w.offers = {};
    // 2. contested lairs settle
    for (const v of Object.keys(w.contestedBy)) {
      const c = w.contestedBy[v]; delete w.contestedBy[v];
      flipTurf(v, c.to, c.from, lines, true);
    }
    // 3. request deadlines
    for (const r of w.requests) if (r.state === 'active' && r.deadline < w.day) failRequest(r, lines);
    // 4. AI turf war (35%)
    if (Math.random() < .35) aiTurfGrab(lines);
    // 5. old grudges cool off: Enemy/Hostile crews you left alone for 2 days drift half a step up
    for (const c of CREW_IDS) if (w.standing[c] <= -2 && w.touched[c] <= w.day - 3) { adjust(c, .5, 'grudge cooled', { ripple: false, quiet: true }); w.touched[c] = w.day - 1; }
    // 6. yesterday's standing news
    for (const c of CREW_IDS) {
      const d = w.dayDelta[c] || 0; w.dayDelta[c] = 0;
      const npc = pick(crewMember(c).filter(id => NPCS[id].role !== 'boss')) || crewMember(c)[0];
      if (d >= 2) lines.push(fill(pick(RUMORS.standingUp), { crew: CREWS[c].short, npc: NPCS[npc].name }));
      else if (d <= -2) lines.push(fill(pick(RUMORS.standingDown), { crew: CREWS[c].short, npc: NPCS[npc].name }));
    }
    // 7. Hostile crews send their Enforcer hunting (one bounty per dawn)
    const hostile = CREW_IDS.filter(c => w.standing[c] <= -3);
    if (hostile.length) {
      const c = pick(hostile), enf = crewMember(c, 'enforcer')[0];
      w.queue.push({ type: 'bounty', crew: c, npc: enf, day: w.day });
      lines.push(fill(pick(RUMORS.bounty), { crew: CREWS[c].short, npc: NPCS[enf].name }));
    }
    while (lines.length < 2) { const l = pick(RUMORS.idle); if (!lines.includes(l)) lines.push(l); }
    w.rumors = lines.slice(0, 5); w.rumorLog.push({ day: w.day, act: w.act, lines: w.rumors.slice() });
    if (w.rumorLog.length > 30) w.rumorLog.shift();
    if (run && run.maxhp) { /* dawn heal is 0 by design */ }
    w.buzz = buzz();
    return w.rumors.slice();
  }
  function turfCount(c) { const w = w_(); return VENUE_IDS.filter(v => w.turf[v] === c).length; }
  function aiTurfGrab(lines) {
    const w = w_(); const crews = shuffle(CREW_IDS.slice());
    for (const c of crews) {
      const mine = VENUE_IDS.filter(v => w.turf[v] === c);
      const cands = [];
      for (const v of mine) for (const n of ADJ[v]) {
        const V = VENUES[n], own = w.turf[n];
        if (['lair', 'studio', 'stage'].includes(V.type) || own === c || own === 'contested' || cands.includes(n)) continue;
        if (own === 'none' || (CREWS[own] && turfCount(own) < turfCount(c))) cands.push(n);
      }
      if (cands.length) { const v = pick(cands); flipTurf(v, c, w.turf[v], lines, false); return true; }
    }
    return false;
  }
  function flipTurf(v, to, from, lines, byPlayer) {
    const w = w_();
    to = CREWS[to] ? to : 'none';
    w.turf[v] = to; w.stats.flips++;
    if (byPlayer) {
      if (CREWS[to]) adjust(to, 1, 'took ' + VENUES[v].name, { ripple: false });
      if (CREWS[from] && from !== to) adjust(from, -1, 'lost ' + VENUES[v].name, { ripple: false });
    }
    if (lines) lines.push(CREWS[to] ? fill(pick(RUMORS.turfFlip), { crew: CREWS[to].short, venue: VENUES[v].name }) : `${VENUES[v].name} belongs to nobody now. Fresh paint, no tags.`);
    w.buzz = buzz();
  }

  // ------------------------------------------------------------------ standing & rapport
  function standing(c) { const w = w_(); return w && CREWS[c] ? w.standing[c] : 0; }
  function standingName(n) { return STANDING_NAMES[String(clamp(Math.round(n), -3, 3))]; }
  // delta in steps (may be .5). o.ripple (default true): +: friends +.5, rivals -.5;  -: rivals +.5
  function adjust(c, delta, why, o = {}) {
    const w = w_(); if (!w || !CREWS[c] || !delta) return null;
    const before = w.standing[c];
    // diminishing returns: the last step to Bonded is slow (falling is always full speed)
    if (delta > 0 && before >= 2 && !o.full) delta = delta / 2;
    let s2 = clamp(w.standing[c] * 2 + (w.half[c] || 0) + Math.round(delta * 2), -6, 6);
    const st = s2 >= 0 ? Math.floor(s2 / 2) : -Math.floor(-s2 / 2);
    w.standing[c] = st; w.half[c] = s2 - st * 2;
    w.dayDelta[c] = (w.dayDelta[c] || 0) + Math.round(delta * 2); w.touched[c] = w.day;
    if (!o.quiet) { w._cred = w._cred || []; w._cred.push({ crew: c, d: Math.round(delta * 2) }); }
    w.log.push({ day: w.day, slot: w.slot, crew: c, d: delta, why: why || '', to: st });
    if (w.log.length > 80) w.log.shift();
    // first time Bonded: the crew's unique graft
    if (st >= 3 && before < 3 && !w.bonded[c]) {
      w.bonded[c] = 1; const g = CREW_GRAFT[c];
      if (g && run_() && !run_().grafts.includes(g)) { addGraft(run_(), g); note(`${CREWS[c].short} made you family: ${GRAFTS[g].name} attached!`); }
    }
    if (o.ripple !== false) {
      const C_ = CREWS[c];
      if (delta > 0) { C_.friends.forEach(f => adjust(f, .5, 'friend of ' + C_.short, { ripple: false })); C_.rivals.forEach(r => adjust(r, -.5, 'rival of ' + C_.short, { ripple: false })); }
      else C_.rivals.forEach(r => adjust(r, .5, 'rival of ' + C_.short, { ripple: false }));
    }
    w.buzz = buzz();
    return { crew: c, before, after: st };
  }
  function rapport(id) { const w = w_(); return w && w.npc[id] ? w.npc[id].rapport : 0; }
  function adjustRapport(id, d) { const w = w_(); if (!w || !w.npc[id]) return 0; const o = w.npc[id]; o.rapport = clamp(o.rapport + d, -2, 2); return o.rapport; }
  function note(s) { const w = w_(); if (w) { w.notes.push(s); if (w.notes.length > 12) w.notes.shift(); w._credNotes = w._credNotes || []; w._credNotes.push(s); } }
  function credLine() {
    const w = w_(), agg = {};
    (w._cred || []).forEach(e => { agg[e.crew] = (agg[e.crew] || 0) + e.d; });
    const parts = Object.keys(agg).filter(c => agg[c]).map(c => `${CREWS[c].short} ${half(agg[c])} (${standingName(w.standing[c])})`);
    let s = parts.length ? 'Street Cred: ' + parts.join(' · ') : 'Street Cred: nobody important noticed.';
    if (w._credNotes && w._credNotes.length) s += ' · ' + w._credNotes.join(' · ');
    w._cred = []; w._credNotes = [];
    return s;
  }

  // ------------------------------------------------------------------ where is everyone
  function npcLocation(id) {
    const w = w_(), n = NPCS[id]; if (!w || !n) return null;
    if (n.crew === 'neutral') return n.venue;
    const s = w.standing[n.crew];
    if (n.role === 'boss') return (s >= 3 || s <= -3) && w.turf[n.venue] === n.crew ? n.venue : null;
    if (n.role === 'enforcer') return w.turf[n.venue] === n.crew ? n.venue : null;
    if (n.role === 'grunt') {
      const streets = VENUE_IDS.filter(v => VENUES[v].type === 'street' && w.turf[v] === n.crew).sort((a, b) => (b === n.venue) - (a === n.venue));
      if (!streets.length) return null;
      const gi = crewMember(n.crew, 'grunt').indexOf(id);
      return streets[gi] || streets[0];
    }
    return n.venue; // merchants & fixers keep their stalls whoever paints the walls
  }
  function npcPresent(id) {
    const w = w_(), o = w.npc[id], n = NPCS[id];
    if (!o || (o.defeated && o.hiddenUntil >= w.day)) return false;
    if (n.nightOnly && w.slot !== NIGHT) return false;
    if (finalNight() && !(n.shop || n.crew === 'neutral')) return false; // everyone else is at The Stage
    return true;
  }
  function npcsAt(v) { const w = w_(); if (!w || v === 'the_stage') return []; return NPC_IDS.filter(id => npcLocation(id) === v && npcPresent(id)); }
  function neighbors(v) {
    const w = w_(); v = v || (w && w.at);
    return (ADJ[v] || []).map(id => {
      const locked = id === 'the_stage' && !stageUnlocked();
      return { id, cost: finalNight() ? 0 : 1, locked, why: locked ? `Opens on Day 6 Night (or from Day 3 once your Buzz hits ${stageBuzz()}).` : '' };
    });
  }
  function distance(a, b) {
    const seen = { [a]: 0 }, q = [a];
    while (q.length) { const v = q.shift(); if (v === b) return seen[v]; for (const n of ADJ[v]) if (seen[n] == null) { seen[n] = seen[v] + 1; q.push(n); } }
    return 99;
  }
  function pathTo(a, b) { // shortest path (list of venue ids after a)
    const prev = { [a]: null }, q = [a];
    while (q.length) { const v = q.shift(); if (v === b) break; for (const n of ADJ[v]) if (!(n in prev)) { prev[n] = v; q.push(n); } }
    if (!(b in prev)) return [];
    const out = []; for (let v = b; v !== a; v = prev[v]) out.unshift(v); return out;
  }

  // ------------------------------------------------------------------ travel
  function travel(to) {
    const w = w_(), run = run_(); if (!w) return { ok: false, why: 'No world.' };
    const nb = neighbors(w.at).find(n => n.id === to);
    if (!nb) return { ok: false, why: 'Not connected.' };
    if (nb.locked) return { ok: false, why: nb.why };
    const events = []; const dawn = advance(nb.cost);
    if (dawn.length) events.push({ type: 'dawn', lines: dawn });
    const from = w.at; w.at = to; w.visited[to] = (w.visited[to] || 0) + 1; w.stats.travels++;
    if (run.stats) run.stats.nodes++;
    // request progress
    for (const r of w.requests) {
      if (r.state !== 'active') continue;
      if (r.type === 'deliver' && r.venue === to) events.push({ type: 'text', lines: [completeRequest(r)] });
      if (r.type === 'scout' && r.venues.includes(to)) { r.seen = r.seen || []; if (!r.seen.includes(to)) r.seen.push(to); if (r.seen.length >= r.venues.length) events.push({ type: 'text', lines: [completeRequest(r)] }); }
    }
    // forced events (bounty hunters) first, then ambush roll
    const forced = takeEvents(); events.push(...forced);
    if (!forced.length) { const amb = rollAmbush(to); if (amb) events.push(amb); else { const se = streetEvent(to); if (se) events.push(se); } }
    saveRun();
    return { ok: true, from, arrivedAt: to, events, slot: w.slot, day: w.day };
  }
  function rollAmbush(v) {
    const w = w_(); if (finalNight() || w.safeUntil >= w.day * 3 + w.slot) return null;
    const V = VENUES[v], owner = w.turf[v]; if (!CREWS[owner] || !['street', 'lair', 'market'].includes(V.type)) return null;
    const s = w.standing[owner];
    const grunts = npcsAt(v).filter(id => NPCS[id].role === 'grunt' && NPCS[id].crew === owner);
    let p = 0; if (s <= -2) p = .45; else if (s === -1) p = .18; else if (s === 0) p = V.type === 'street' ? .08 : 0;
    if (Math.random() >= p) return null;
    const enemy = s <= -2;
    let ids = grunts.length ? [pick(grunts)] : [];
    if (!ids.length) { if (!enemy) return null; ids = []; }
    const enemies = ids.map(eid);
    if (enemy) enemies.push(eid(CREW_KIT[owner].minion));
    if (!enemies.length) return null;
    w.stats.ambushes++;
    const lead = ids[0] || null;
    return {
      type: 'ambush', crew: owner,
      lines: [enemy ? `AMBUSH! ${CREWS[owner].short} were waiting for you at ${V.name}.` : `${lead ? NPCS[lead].name : 'Someone'} steps into your path at ${V.name}. "${pick(NPCS[lead].barks)}"`],
      encounter: { kind: 'encounter', mode: 'choice', enemies, npc: lead, venue: v, flags: { ambush: 1, choice: 1, noSlot: 1, noTalk: enemy ? 1 : 0 } }
    };
  }
  function streetEvent(v) {
    const w = w_(), run = run_(), V = VENUES[v];
    if (V.type !== 'street' && V.type !== 'den') return null;
    if (Math.random() > .22) return null;
    const r = Math.random();
    if (r < .4) { const g = ri(6, 14) * w.act; run.money += g; return { type: 'text', lines: [`You find ${g} shil in a guitar case nobody is watching. Finders keepers, losers busk.`] }; }
    if (r < .7) { const h = Math.min(run.maxhp - run.hp, 5); run.hp += h; return { type: 'text', lines: [`A street-food van plays your song. Free chips! (+${h} HP)`] }; }
    return { type: 'text', lines: ['Overheard: ' + pick(RUMORS.idle)] };
  }
  function takeEvents() {
    const w = w_(); const out = [];
    while (w.queue.length) {
      const q = w.queue.shift();
      if (q.type === 'bounty') {
        if (w.standing[q.crew] > -3 || finalNight()) continue;
        w.stats.bounties++;
        out.push({
          type: 'bounty', crew: q.crew, lines: [`${NPCS[q.npc].name} found you. ${CREWS[q.crew].short} want a word. With fists.`],
          encounter: { kind: 'encounter', mode: 'choice', enemies: [eid(q.npc)], npc: q.npc, venue: w.at, flags: { bounty: 1, elite: 1, choice: 1, noSlot: 1, noTalk: 1 } }
        });
      }
    }
    return out;
  }
  function events() { return takeEvents(); }

  // ------------------------------------------------------------------ rest / venue actions
  function venueActions(v) {
    const w = w_(); v = v || w.at; const V = VENUES[v], out = [], run = run_();
    if (V.rest) out.push({ id: 'rest', label: `Rest (+${Math.round(run.maxhp * .35)} HP)`, cost: { slots: finalNight() ? 0 : 1, shil: 0 }, enabled: run.hp < run.maxhp && !w.flags['rested' + w.day + '_' + w.slot], why: run.hp >= run.maxhp ? 'You feel great already.' : '' });
    if (V.type === 'studio') {
      out.push({ id: 'upgrade', label: 'Rework a card (upgrade)', cost: { slots: 0, shil: 0 }, enabled: !w.flags['upg' + w.day], why: w.flags['upg' + w.day] ? 'One rework per day.' : '' });
      const rc = 40 * w.act; out.push({ id: 'remove', label: `Cut a card (${rc} shil)`, cost: { slots: 0, shil: rc }, enabled: run.money >= rc, why: run.money >= rc ? '' : 'Not enough shil.' });
      out.push({ id: 'favours', label: 'Swap Favours', cost: { slots: 0, shil: 0 }, enabled: recruitedList().length > 0, why: recruitedList().length ? '' : 'Nobody owes you a favour yet.' });
    }
    if (v === 'the_stage') out.push({ id: 'finale', label: 'HEADLINER NIGHT', cost: { slots: 0, shil: 0 }, enabled: stageUnlocked(), why: stageUnlocked() ? '' : `Opens on Day 6 Night (or from Day 3 at Buzz ${stageBuzz()}).` });
    return out;
  }
  function doVenue(id) {
    const w = w_(), run = run_();
    if (id === 'rest') {
      const h = Math.round(run.maxhp * .35), got = Math.min(h, run.maxhp - run.hp); run.hp += got;
      w.flags['rested' + w.day + '_' + w.slot] = 1;
      const lines = [`You crash on the sofa and wake up humming. (+${got} HP)`];
      const dawn = advance(1); const evs = takeEvents(); saveRun();
      return { kind: 'text', lines: lines.concat(dawn), healed: got, events: (dawn.length ? [{ type: 'dawn', lines: dawn }] : []).concat(evs) };
    }
    if (id === 'upgrade') { w.flags['upg' + w.day] = 1; return { kind: 'pick', pick: 'upgrade' }; }
    if (id === 'remove') { const rc = 40 * w.act; if (run.money < rc) return { kind: 'text', lines: ['Not enough shil.'] }; return { kind: 'pick', pick: 'remove', cost: rc }; }
    if (id === 'favours') return { kind: 'favours', recruited: recruitedList(), active: w.favours.slice() };
    if (id === 'finale') return finale();
    return { kind: 'text', lines: ['Nothing happens.'] };
  }
  function rest() { return doVenue('rest'); }
  // helpers the scene can call after a 'pick' result
  function upgradeCard(tab, idx) { const run = run_(), l = tab === 'n' ? run.ndeck : run.deck; if (l[idx] && !l[idx].up) { l[idx].up = true; saveRun(); return true; } return false; }
  function removeCard(tab, idx, cost) { const run = run_(), l = tab === 'n' ? run.ndeck : run.deck; if (!l[idx] || run.money < (cost || 0)) return false; if (/^favour_/.test(l[idx].id)) return false; l.splice(idx, 1); run.money -= cost || 0; saveRun(); return true; }

  // ------------------------------------------------------------------ actions per NPC
  function shopMul(c) { const s = standing(c); return s >= 2 ? .75 : s <= -2 ? 1.3 : 1; }
  function giftCost() { const w = w_(); return 15 * w.act; }
  function recruitCost(id) {
    const n = NPCS[id], w = w_(); if (n.crew === 'neutral') return 30 * w.act;
    if (n.role === 'boss') return 0;
    return Math.round((n.role === 'enforcer' ? 70 : 50) * w.act * (standing(n.crew) >= 2 ? .75 : 1));
  }
  function canRecruit(id) {
    const n = NPCS[id], o = w_().npc[id];
    if (!FAVOUR_NPCS.includes(id) || o.recruited) return { ok: false, why: o.recruited ? 'Already owes you one.' : 'Not the favour-doing type.' };
    if (n.crew === 'neutral') return o.rapport >= 1 ? { ok: true } : { ok: false, why: 'Chat with Jordan first.' };
    const s = standing(n.crew);
    if (n.role === 'boss') return s >= 3 ? { ok: true } : { ok: false, why: 'Bosses only join the Bonded.' };
    if (n.role === 'enforcer') return s >= 2 && o.rapport >= 1 ? { ok: true } : { ok: false, why: `Needs Friend standing with ${CREWS[n.crew].short} and rapport 1.` };
    return o.rapport >= 2 ? { ok: true } : { ok: false, why: `Needs rapport 2 (now ${o.rapport}).` };
  }
  function activeRequests() { const w = w_(); return w.requests.filter(r => r.state === 'active'); }
  function actions(id) {
    const w = w_(), run = run_(), n = NPCS[id]; if (!w || !n) return [];
    const o = w.npc[id], c = n.crew, s = standing(c), out = [];
    const add = (aid, label, cost, enabled, why) => out.push({ id: aid, label, cost: cost || { slots: 0, shil: 0 }, enabled: !!enabled, why: enabled ? '' : (why || '') });
    const cold = CREWS[c] && s <= -2;
    add('chat', `Chat with ${n.name}`, null, !o.metToday && !cold, o.metToday ? 'You already caught up today.' : `${CREWS[c] ? CREWS[c].short : ''} won't chat with an Enemy.`);
    if (['fixer', 'merchant', 'boss'].includes(n.role) && n.crew !== 'neutral') {
      const mine = activeRequests().find(r => r.giver === id);
      if (mine && mine.type === 'favour') add('request', `Hand over ${mine.cost} shil`, { slots: 0, shil: mine.cost }, run.money >= mine.cost, 'Not enough shil.');
      else if (mine) add('request', 'Request in progress', null, false, 'You are already on their job.');
      else {
        const ok = o.rapport >= 0 && s >= -1 && activeRequests().length < 3;
        add('request', 'Ask for work', null, ok, activeRequests().length >= 3 ? 'You already juggle 3 requests.' : o.rapport < 0 ? 'They don\'t trust you yet.' : 'Their crew won\'t hire you.');
      }
    }
    if (n.shop) add('trade', s >= 2 ? 'Trade (-25%, Friend price)' : s <= -2 ? 'Trade (+30%, Enemy price)' : 'Trade', null, !(o.defeated), 'Shop shut.');
    if (FAVOUR_NPCS.includes(id)) {
      const cr = canRecruit(id), cost = recruitCost(id);
      add('recruit', cost ? `Recruit as Favour (${cost} shil)` : 'Recruit as Favour', { slots: 0, shil: cost }, cr.ok && run.money >= cost, cr.ok ? 'Not enough shil.' : cr.why);
    }
    if (n.crew !== 'neutral') add('gift', `Gift (${giftCost()} shil)`, { slots: 0, shil: giftCost() }, !o.giftedToday && run.money >= giftCost() && !cold, o.giftedToday ? 'One gift a day is plenty.' : cold ? 'They\'d throw it back.' : 'Not enough shil.');
    if (n.role === 'grunt' && s >= 2) add('pass', 'Ask for safe passage', null, true, '');
    if (n.crew !== 'neutral' && !finalNight()) {
      add('fight', 'Challenge: FIGHT', { slots: 1, shil: 0 }, true, '');
      add('talk', 'Challenge: TALK', { slots: 1, shil: 0 }, s > -3, 'Hostile crews don\'t negotiate.');
    }
    return out;
  }
  function act_(id, aid) { return actions(id).find(a => a.id === aid); }
  function encounter(id, venue) {
    const n = NPCS[id]; const out = [eid(id)];
    return out;
  }
  function doAction(id, aid) {
    const w = w_(), run = run_(), n = NPCS[id];
    const a = act_(id, aid);
    if (!a) return { kind: 'text', lines: ['They look at you blankly.'] };
    if (!a.enabled) return { kind: 'text', lines: [a.why || 'Not now.'], disabled: true };
    const o = w.npc[id], c = n.crew;
    switch (aid) {
      case 'chat': {
        o.metToday = true; const r = adjustRapport(id, 1); if (CREWS[c]) w.touched[c] = w.day;
        const lines = [`${n.name}: "${pick(n.greet)}"`];
        if (Math.random() < .5) lines.push('They lean in: "' + pick(w.rumors.concat(RUMORS.idle)) + '"');
        lines.push(`Rapport with ${n.name}: ${r >= 0 ? '+' : ''}${r}`);
        saveRun(); return { kind: 'text', lines, npc: id };
      }
      case 'request': {
        const mine = activeRequests().find(r => r.giver === id);
        if (mine && mine.type === 'favour') { run.money -= mine.cost; const l = completeRequest(mine); saveRun(); return { kind: 'text', lines: [l], npc: id }; }
        let r = w.offers[id];
        if (!r || r.offeredDay !== w.day) { r = makeRequest(id); w.offers[id] = r; }
        return { kind: 'request', request: r, npc: id };
      }
      case 'trade': {
        w.shopCtx = { npc: id, mul: shopMul(c) };
        return { kind: 'shop', npc: id, mul: shopMul(c) };
      }
      case 'recruit': {
        const cost = recruitCost(id); run.money -= cost; o.recruited = true; w.stats.recruits++;
        let lines = [`${n.name} is in! "${pick(n.barks)}"`];
        if (w.favours.length < 3) { w.favours.push(id); lines.push(`Their Favour card joins both your decks.`); }
        else lines.push('Your Favour list is full: swap them in at the Home Studio.');
        if (CREWS[c]) adjust(c, 1, 'recruited ' + n.name);
        lines.push(credLine());
        syncFavourCards(run); saveRun();
        return { kind: 'recruit', npc: id, ok: true, lines };
      }
      case 'gift': {
        const cost = giftCost(); run.money -= cost; o.giftedToday = true; const r = adjustRapport(id, 1); if (CREWS[c]) w.touched[c] = w.day;
        saveRun();
        return { kind: 'gift', npc: id, ok: true, cost, lines: [`You hand ${n.name} a little something (${cost} shil). "${pick(['Aw, you shouldn\'t have!', 'Ooh, is this limited edition?', 'I\'ll treasure this. For a week.', 'Hm. Acceptable.'])}"`, `Rapport: ${r >= 0 ? '+' : ''}${r}`] };
      }
      case 'pass': {
        w.safeUntil = w.day * 3 + w.slot + 3; o.metToday = true;
        return { kind: 'text', lines: [`${n.name} nods you through. "${CREWS[c].short} turf is your turf, friend." (No ambushes for the next 3 slots.)`], npc: id };
      }
      case 'fight': case 'talk': {
        const V = VENUES[w.at];
        const flags = { elite: n.role === 'enforcer' ? 1 : 0, boss: n.role === 'boss' ? 1 : 0 };
        return { kind: 'encounter', mode: aid, enemies: encounter(id, w.at), npc: id, venue: w.at, flags, lines: [`${n.name}: "${pick(n.barks)}"`], venueName: V.name };
      }
    }
    return { kind: 'text', lines: ['...'] };
  }

  // ------------------------------------------------------------------ requests
  function rivalsOf(c) { const r = CREWS[c] ? CREWS[c].rivals.slice() : []; return r.length ? r : CREW_IDS.filter(x => x !== c && !(CREWS[c] && CREWS[c].friends.includes(x))); }
  function makeRequest(giver) {
    const w = w_(), n = NPCS[giver], c = n.crew, act = w.act, friend = standing(c) >= 2;
    const types = [['silence', 3], ['deliver', 2], ['scout', 2], ['favour', 1]];
    const enemyLairs = VENUE_IDS.filter(v => VENUES[v].type === 'lair' && w.turf[v] !== c && CREWS[w.turf[v]] && npcLocation(crewMember(w.turf[v], 'enforcer')[0]) === v);
    if (enemyLairs.length && n.role !== 'merchant') types.push(['turf', n.role === 'boss' ? 3 : 1.5]);
    let tot = types.reduce((s, t) => s + t[1], 0), r = Math.random() * tot, type = 'silence';
    for (const t of types) { r -= t[1]; if (r <= 0) { type = t[0]; break; } }
    const req = { id: 'rq' + (++w.reqN), type, giver, crew: c, target: null, venue: null, reward: {}, deadline: Math.min(DAYS, w.day + 2), state: 'offered', desc: '', offeredDay: w.day, act: w.act };
    if (type === 'silence') {
      const cands = NPC_IDS.filter(id => rivalsOf(c).includes(NPCS[id].crew) && ['grunt', 'enforcer'].includes(NPCS[id].role) && npcLocation(id));
      const prefer = cands.filter(id => NPCS[id].role === 'grunt');
      const t = pick(prefer.length ? prefer : cands);
      if (!t) req.type = 'deliver'; else { req.target = t; req.venue = npcLocation(t); }
    }
    if (req.type === 'deliver') {
      const cands = VENUE_IDS.filter(v => !['studio', 'stage'].includes(VENUES[v].type) && v !== w.at && distance(NPCS[giver].venue, v) >= 2 && distance(NPCS[giver].venue, v) <= 4);
      req.venue = pick(cands) || 'junk_cafe';
    }
    if (req.type === 'scout') { const cands = shuffle(VENUE_IDS.filter(v => v !== w.at && v !== 'the_stage' && v !== 'home_studio')); req.venues = cands.slice(0, 2); req.venue = req.venues[0]; }
    if (req.type === 'favour') { req.cost = 30 * act + ri(0, 2) * 5; }
    if (req.type === 'turf') { const v = pick(enemyLairs.filter(v => rivalsOf(c).includes(w.turf[v]))) || pick(enemyLairs); req.venue = v; req.target = crewMember(w.turf[v], 'enforcer')[0]; req.deadline = Math.min(DAYS, w.day + 3); }
    const shil = Math.round((req.type === 'turf' ? 60 : req.type === 'favour' ? req.cost + 25 : 35) * act * (friend ? 1.5 : 1));
    req.reward = { shil, standing: 1, rapport: 1, card: friend || Math.random() < .4 };
    req.desc = REQUEST_TYPES[req.type].describe(req) + ' ' + pick(REQUEST_FLAVOUR[c] || REQUEST_FLAVOUR.neutral);
    return req;
  }
  function acceptRequest(r) {
    const w = w_(); if (!w || !r) return { ok: false, why: 'No request.' };
    if (activeRequests().length >= 3) return { ok: false, why: 'You can only juggle 3 requests.' };
    if (w.requests.find(q => q.id === r.id)) return { ok: false, why: 'Already accepted.' };
    r.state = 'active'; r.acceptedDay = w.day; w.requests.push(r);
    if (w.offers[r.giver] && w.offers[r.giver].id === r.id) delete w.offers[r.giver];
    // an already-satisfied scout/deliver target still needs the trip: nothing completes on accept
    saveRun();
    return { ok: true, request: r };
  }
  function completeRequest(r) {
    const w = w_(), run = run_(); if (r.state !== 'active') return '';
    r.state = 'done'; r.doneDay = w.day; w.stats.reqDone++;
    const rw = r.reward, parts = [];
    run.money += rw.shil; run.stats.gold += rw.shil; parts.push(`+${rw.shil} shil`);
    adjust(r.crew, rw.standing, 'request done');
    adjustRapport(r.giver, rw.rapport);
    if (rw.card) {
      const kind = Math.random() < .5 ? 'b' : 'n', id = rollCards(kind, run, 1, { elite: true })[0];
      if (id) { (kind === 'b' ? run.deck : run.ndeck).push({ id, up: false }); parts.push(`card: ${(BC[id] || NC[id]).name}`); r.cardGot = id; }
    }
    const s = `Request done for ${NPCS[r.giver].name}! (${parts.join(', ')})`;
    r.result = s; note(s); w.buzz = buzz();
    return s;
  }
  function failRequest(r, lines) {
    const w = w_(); r.state = 'failed'; w.stats.reqFailed++;
    adjust(r.crew, -1, 'request failed', { ripple: false }); adjustRapport(r.giver, -1);
    const s = `${NPCS[r.giver].name} waited for you. You never came. (${CREWS[r.crew] ? CREWS[r.crew].short : ''} -1)`;
    r.result = s; if (lines) lines.push(s); note(s);
  }
  function requests() { const w = w_(); return w ? w.requests : []; }

  // ------------------------------------------------------------------ favours
  function recruitedList() { const w = w_(); return NPC_IDS.filter(id => w.npc[id] && w.npc[id].recruited); }
  function favourCardId(npcId, kind) { return 'favour_' + npcId + (kind === 'n' ? '_t' : ''); }
  function favours() { const w = w_(); return w ? w.favours.slice() : []; }
  function setFavours(list) {
    const w = w_(), run = run_(); if (!w) return [];
    const ok = [];
    for (const id of list || []) if (w.npc[id] && w.npc[id].recruited && !ok.includes(id) && ok.length < 3) ok.push(id);
    w.favours = ok; syncFavourCards(run); saveRun();
    return ok.slice();
  }
  // exactly one Favour card per active friend in each deck (and nothing for dismissed friends)
  function syncFavourCards(run) {
    if (!run || !run.world) return;
    const fav = run.world.favours;
    const keepUp = {};
    for (const key of ['deck', 'ndeck']) {
      const l = run[key]; if (!l) continue;
      for (let i = l.length - 1; i >= 0; i--) if (/^favour_/.test(l[i].id)) { if (l[i].up) keepUp[key + l[i].id] = 1; l.splice(i, 1); }
      for (const id of fav) { const cid = favourCardId(id, key === 'deck' ? 'b' : 'n'); if ((key === 'deck' ? BC : NC)[cid]) l.push({ id: cid, up: !!keepUp[key + cid], favour: 1 }); }
    }
  }

  // ------------------------------------------------------------------ turf / buzz / finale
  function turf(v) { const w = w_(); return w ? (w.turf[v] || 'none') : 'none'; }
  function buzz() {
    const w = w_(); if (!w) return 0;
    let b = 0;
    for (const v of VENUE_IDS) { const o = w.turf[v]; if (CREWS[o] && w.standing[o] >= 2) b++; }
    b += w.requests.filter(r => r.state === 'done' && (r.act || 1) === w.act).length;
    for (const c of CREW_IDS) { if (w.standing[c] >= 3) b += 2; if (w.standing[c] <= -3) b -= 1; }
    return Math.max(0, b);
  }
  // early Headliner: Buzz 8 in act 1 (12 in act 2, since standing and turf carry over) and not before Day 3
  function stageBuzz() { const w = w_(); return w && w.act >= 2 ? 12 : 8; }
  function stageUnlocked() { const w = w_(); return !!w && (finalNight() || (buzz() >= stageBuzz() && w.day >= 3)); }
  function finaleOrder() {
    const w = w_();
    return CREW_IDS.slice().sort((a, b) => (w.standing[a] * 2 + (w.half[a] || 0)) - (w.standing[b] * 2 + (w.half[b] || 0)) || w.tieKey[a] - w.tieKey[b]);
  }
  function finale() {
    const w = w_(); if (!w) return null;
    const order = finaleOrder(), lo = order[0], lo2 = order[1];
    const boss = crewMember(lo, 'boss')[0], enf = crewMember(lo2, 'enforcer')[0];
    const b = buzz(), mul = Math.max(.6, 1 - .1 * Math.floor(b / 2));
    const be = eid(boss), ee = eid(enf);
    const cards = [];
    CREW_IDS.forEach(c => { if (w.standing[c] >= 3) { const bb = crewMember(c, 'boss')[0]; if (bb !== boss) cards.push('favour_' + bb); } });
    w.favours.forEach(id => { if (!cards.includes('favour_' + id)) cards.push('favour_' + id); });
    return {
      kind: 'encounter', mode: 'choice', enemies: [be, ee], npc: boss, venue: 'the_stage',
      flags: { finale: 1, boss: 1, choice: 1, noSlot: 1, early: finalNight() ? 0 : 1, hpMul: { [be]: mul, [ee]: .6 }, finaleCards: cards.slice(0, 5), crews: [lo, lo2], buzz: b },
      lines: [`HEADLINER NIGHT! ${NPCS[boss].name} of ${CREWS[lo].short} takes the Stage, with ${NPCS[enf].name} of ${CREWS[lo2].short} as backup.` + (b >= 2 ? ` Your Buzz (${b}) has them rattled: -${Math.round((1 - mul) * 100)}% HP.` : '')]
    };
  }
  function rumors() { const w = w_(); return w ? w.rumors.slice() : []; }

  // ------------------------------------------------------------------ encounters
  function goSafe(fn) {
    if (!G.trans) { go(fn); return; }
    if (G.trans.phase === 0) { const old = G.trans.fn; G.trans.fn = () => { old(); fn(); }; }
    else fn();
  }
  function beginEncounter(res) {
    const w = w_(), run = run_(); if (!w || !res || res.kind !== 'encounter') return false;
    const flags = Object.assign({}, res.flags || {});
    if (res.mode === 'choice') flags.choice = 1;
    w._cred = []; w._credNotes = [];
    w.pending = { npc: res.npc, mode: res.mode, venue: res.venue || w.at, enemies: res.enemies.slice(), flags, day: w.day, slot: w.slot };
    syncFavourCards(run);
    const elite = !!(flags.elite), boss = !!(flags.boss);
    const node = { type: boss ? 'boss' : elite ? 'elite' : 'fight', enc: res.enemies.slice(), world: 1, noTalk: !!flags.noTalk, leader: res.npc ? eid(res.npc) : null };
    let mk;
    if (flags.choice) mk = () => new EncounterScene(node);
    else if (res.mode === 'talk') mk = () => new NegotiationScene({ enemy: node.leader || res.enemies[0], fightIds: res.enemies.slice(), node, elite, boss });
    else mk = () => new BattleScene({ enemies: res.enemies.slice(), node, elite, boss });
    goSafe(() => setScene(mk()));
    return true;
  }
  // RewardScene.enter: apply the world outcome of the encounter that produced this reward
  function resolve(r) {
    const w = w_(), run = run_(); const p = w && w.pending;
    if (!p || r.chest || r.world) return false;
    w._cred = w._cred || []; w._credNotes = w._credNotes || [];
    const outcome = r.talk ? 'talk' : 'fight';
    const npcs = p.enemies.map(e => ENEMIES[e] && ENEMIES[e].npc).filter(Boolean);
    const lead = p.npc || npcs[0], crew = lead ? crewOf(lead) : null;
    if (outcome === 'fight') w.stats.fights++; else w.stats.talks++;
    if (p.flags.finale) {
      w.flags.finaleWon = 1; note('HEADLINER NIGHT IS YOURS!');
      if (p.flags.early) { const b = 60 * w.act; r.gold += b; run.hp = Math.min(run.maxhp, run.hp + Math.round(run.maxhp * .2)); note(`Early headliner bonus: +${b} shil`); }
    } else {
      if (p.talkFailed && crew) adjust(crew, -.5, 'talks broke down');
      if (crew && CREWS[crew]) {
        if (outcome === 'fight') { if (!p.flags.bounty) adjust(crew, -1, 'beat ' + NPCS[lead].name); }
        else adjust(crew, 1, 'persuaded ' + NPCS[lead].name);
      }
      for (const id of npcs) {
        const o = w.npc[id]; if (!o) continue;
        if (outcome === 'fight') adjustRapport(id, -1);
        o.defeated = true; o.hiddenUntil = w.day; // they lick their wounds until tomorrow
      }
      if (p.flags.bounty) { r.gold = Math.round(r.gold * 1.5); note('Bounty broken: x1.5 shil'); }
      // Enforcer down at their own lair: the lair is contested until dawn
      const V = VENUES[p.venue];
      for (const id of npcs) {
        if (NPCS[id].role !== 'enforcer' || NPCS[id].venue !== p.venue || !V || V.type !== 'lair' || w.turf[p.venue] !== NPCS[id].crew) continue;
        const req = activeRequests().find(q => q.type === 'turf' && q.venue === p.venue);
        let to = req ? req.crew : null;
        if (!to) { const fr = CREW_IDS.filter(c => c !== NPCS[id].crew && w.standing[c] >= 1).sort((a, b) => w.standing[b] - w.standing[a]); to = fr[0] || 'none'; }
        w.turf[p.venue] = 'contested'; w.contestedBy[p.venue] = { to, from: NPCS[id].crew };
        note(`${V.name} is contested! It flips to ${CREWS[to] ? CREWS[to].short : 'nobody'} at dawn.`);
        if (req) completeRequest(req);
      }
      for (const q of activeRequests()) if (q.type === 'silence' && npcs.includes(q.target)) completeRequest(q);
    }
    if (run.grafts.includes('gold_clause')) r.gold = Math.round(r.gold * 1.3);
    const dawn = p.flags.noSlot ? [] : advance(1);
    if (dawn.length) note('A new day dawns: check the Street Buzz.');
    w.lastCred = credLine();
    w.lastResult = { npc: p.npc, venue: p.venue, outcome, finale: !!p.flags.finale, dawn, enemies: p.enemies };
    w.pending = null;
    r.world = { venue: p.venue, finale: !!p.flags.finale };
    w.buzz = buzz();
    return true;
  }
  // RewardScene.next for world rewards
  function afterReward(r) {
    const w = w_(), run = run_();
    if (r.world && r.world.finale) {
      if (run.act >= 2) { goSafe(() => setScene(new VictoryScene())); return; }
      reset(run, 2);
      goSafe(() => setScene(makeMapScene({ intro: true, venue: 'home_studio' })));
      return;
    }
    const ev = takeEvents();
    if (ev.length && ev[0].encounter) { w.flags.pendingEvent = ev[0]; saveRun(); beginEncounter(ev[0].encounter); return; }
    saveRun();
    goSafe(() => setScene(makeMapScene({ venue: (r.world && r.world.venue) || w.at })));
  }

  // ------------------------------------------------------------------ battle allies (Favour cards)
  function* spawnAlly(sc, npcId) {
    sc.allies = sc.allies || [];
    const n = NPCS[npcId]; if (!n) return;
    const ex = sc.allies.find(a => a.ally === npcId && !a.leaving);
    const f = favourStats(npcId), v = {};
    for (const k in f.v) v[k] = (k === 'n' || k === 'blk' || k === 'heal') ? scale(f.v[k]) : f.v[k];
    if (ex) { ex.turns = 3; ex.pose.hop = .01; floatText(ex.x, ex.y - 220, 'Encore!', CREWS[n.crew] ? CREWS[n.crew].color : C.cream, 30); yield .3; return; }
    const base = ENEMIES[n.enemy || ''] ? ENEMIES[n.enemy].spec : { kind: 'rj', rj: n.rj, scale: 1 };
    const spec = Object.assign({}, base, { scale: (base.scale || 1) * .82 });
    const i = sc.allies.filter(a => !a.leaving).length;
    const u = makeUnit(spec, n.name, 1, 115 - i * 52, 448 - i * 10, { ally: npcId, crew: n.crew, turns: 3, act: f.act, v, isAlly: 1 });
    u.x = -80; u.tx = 115 - i * 52;
    sc.allies.push(u);
    Snd.play('summon'); u.pose.hop = .01;
    floatText(u.tx, u.y - 230, `${n.name} jumps in!`, CREWS[n.crew] ? CREWS[n.crew].colorLight : C.cream, 30);
    burst(u.tx, u.y - 90, 26, { col: [CREWS[n.crew] ? CREWS[n.crew].color : C.mustard, C.cream, C.mustard], shape: 'star', min: 60, max: 300, up: 120 });
    yield .45;
  }
  function* allyTurn(sc) {
    const P = sc.P;
    for (const a of (sc.allies || []).slice()) {
      if (sc.over) return;
      if (a.leaving || a.turns <= 0) continue;
      const v = a.v, col = CREWS[a.crew] ? CREWS[a.crew].colorLight : C.cream;
      a.pose.atkT = 0; Snd.play('whoosh'); yield .22;
      const al = () => sc.alive();
      if (a.act === 'loop') { for (let h = 0; h < (v.h || 1); h++) { const t = pick(al()); if (!t) break; yield* sc.hit(a, t, sc.calc(a, t, v.n)); if (sc.over) return; if (h < v.h - 1) { a.pose.atkT = 0; yield .14; } } }
      else if (a.act === 'hit') { const t = pick(al()); if (t) yield* sc.hit(a, t, sc.calc(a, t, v.n)); }
      else if (a.act === 'shield') { P.block += v.blk; Snd.play('block'); floatText(P.x, P.y - 230, `+${v.blk} Block`, C.sky, 30); const t = pick(al()); if (t && v.weak) sc.addStatus(t, 'weak', v.weak); }
      else if (a.act === 'hex') { for (const t of al().slice()) { if (v.n) yield* sc.hit(a, t, sc.calc(a, t, v.n), { slash: false }); if (sc.over) return; if (!t.dead) { if (v.weak) sc.addStatus(t, 'weak', v.weak, true); if (v.vuln) sc.addStatus(t, 'vuln', v.vuln, true); } } Snd.play('debuff'); floatText(W / 2 + 200, 220, 'Shhhh...', col, 34); }
      else { if (v.blk) { P.block += v.blk; Snd.play('block'); floatText(P.x, P.y - 230, `+${v.blk} Block`, C.sky, 28); } if (v.heal) { const hh = Math.min(v.heal, P.maxhp - P.hp); P.hp += hh; Snd.play('heal'); floatText(P.x + 30, P.y - 200, `+${v.heal}`, C.green, 32); } }
      if (sc.over) return;
      a.turns--;
      floatText(a.x, a.y - 250 * a.scale, a.turns > 0 ? `${a.name} (${a.turns})` : `${a.name}: peace out!`, col, 24);
      if (a.turns <= 0) a.leaving = true;
      yield .25;
    }
  }

  return {
    init, reset, normalize, get crews() { return CREWS; }, get venues() { return VENUES; }, get npcs() { return NPCS; },
    npcsAt, npcLocation, neighbors, travel, distance, pathTo, slotName, dayLabel, timeLeft, advance, endDay, finalNight,
    standing, standingName, adjust, rapport, adjustRapport, actions, do: doAction, encounter, beginEncounter, resolve, afterReward,
    requests, activeRequests, acceptRequest, makeRequest, completeRequest, favours, setFavours, favourCardId, recruitedList, syncFavourCards,
    turf, turfCount, buzz, stageBuzz, finale, finaleOrder, stageUnlocked, name, crewColor, rumors, events, scale, eid,
    venueActions, doVenue, rest, upgradeCard, removeCard, credLine, shopMul, canRecruit, flipTurf,
    _spawnAlly: spawnAlly, _allyTurn: allyTurn, SLOTS, DAYS, ADJ
  };
})();

// ===================================================================== integration hooks
(function worldHooks() {
  const W0 = () => G.run && G.run.world;
  // ---- run creation: same deck/graft setup, then the living map instead of the node map
  const origNewRun = newRun;
  newRun = function (charId) {
    const run = origNewRun(charId);
    run.map = null; run.pos = -1;
    World.init(run, 1);
    return run;
  };
  // ---- map scene: world runs never fall back to the node map (it is null). Until world_scenes.js lands, a small fallback scene.
  makeMapScene = function (o) {
    if (G.run && G.run.world) return (typeof WorldMapScene === 'function') ? new WorldMapScene(o || {}) : new WorldFallbackScene(o || {});
    return new MapScene(o);
  };
  // ---- crew grafts are earned, never rolled or sold
  const origRollGraft = rollGraft;
  rollGraft = function (run) {
    const cands = Object.keys(GRAFTS).filter(g => !run.grafts.includes(g) && !GRAFTS[g].crew);
    return cands.length ? pick(cands) : null;
  };
  // ---- reward screen: outcome -> standing/rapport/requests/turf + Street Cred, and back to the venue
  const rEnter = RewardScene.prototype.enter;
  RewardScene.prototype.enter = function () {
    const run = G.run;
    if (run && run.world && run.world.pending && !this.r.chest) World.resolve(this.r);
    else if (run && run.grafts.includes('gold_clause') && !this.r.chest && !this.r.world) this.r.gold = Math.round(this.r.gold * 1.3);
    if (run && run.grafts.includes('tin_crown') && !this.r.talk && !this.r.chest) run.hp = Math.min(run.maxhp, run.hp + 4);
    this.cred = run && run.world && this.r.world ? run.world.lastCred : null;
    return rEnter.call(this);
  };
  const rNext = RewardScene.prototype.next;
  RewardScene.prototype.next = function () {
    if (G.run && G.run.world && this.r.world) { if (this._went) return; this._went = 1; World.afterReward(this.r); return; }
    return rNext.call(this);
  };
  // ---- encounter intro: ambush/bounty = no talking; the challenged NPC leads the talk
  const eEnter = EncounterScene.prototype.enter;
  EncounterScene.prototype.enter = function () {
    const r = eEnter.call(this);
    const n = this.node;
    if (n && n.world) {
      if (n.noTalk) this.leader = null;
      else if (n.leader) this.leader = this.units.find(u => u.id === n.leader && u.def.talk) || this.leader;
    }
    return r;
  };
  // ---- battle: venue backdrop, finale HP scaling, crew grafts, Favour allies
  function applyHpMul(units, flags) {
    if (!flags || !flags.hpMul) return;
    for (const u of units) { const m = flags.hpMul[u.id]; if (m && !u._hpMul) { u._hpMul = 1; u.maxhp = u.hp = u.dhp = Math.max(1, Math.round(u.hp * m)); } }
  }
  const bEnter = BattleScene.prototype.enter;
  BattleScene.prototype.enter = function () {
    if (bEnter) bEnter.call(this);
    const w = W0(); this.allies = [];
    if (w && w.pending) { const V = VENUES[w.pending.venue]; if (V) { this.bg = V.bg; this.bgSeed = V.x % 13 + 1; } applyHpMul(this.enemies, w.pending.flags); }
  };
  const nEnter = NegotiationScene.prototype.enter;
  NegotiationScene.prototype.enter = function () {
    if (nEnter) nEnter.call(this);
    const w = W0();
    if (w && w.pending) { const V = VENUES[w.pending.venue]; if (V) { this.bg = V.bg; this.bgSeed = V.x % 13 + 2; } const f = w.pending.flags; if (f && f.hpMul && f.hpMul[this.opts.enemy]) { const O = this.O; O.maxhp = O.hp = O.dhp = Math.max(1, Math.round(O.hp * f.hpMul[this.opts.enemy])); } }
  };
  const bApply = BattleScene.prototype.applyCard;
  BattleScene.prototype.applyCard = function* (d, target) {
    if (d.special === 'ally') { yield* World._spawnAlly(this, d.ally); return; }
    yield* bApply.call(this, d, target);
  };
  // finaleCards hold battle ids (favour_<npc>); a talk finale gets the talk twins
  const handCard = (sc, id) => { const neg = sc instanceof NegotiationScene; if (neg) id = id + '_t'; if (sc.hand.length < 10 && (neg ? NC : BC)[id]) sc.hand.push({ inst: newInst(id), x: 70, y: 660, rot: -.4, sc: .35, a: 1 }); };
  const bSpt = BattleScene.prototype.startPlayerTurn;
  BattleScene.prototype.startPlayerTurn = function* (first) {
    const g = this.run.grafts, P = this.P;
    if (first) {
      if (g.includes('loop_pedal')) P.st.str = (P.st.str || 0) + 1;
      if (g.includes('sub_chain')) P.block += 8;
      if (g.includes('tin_crown')) P.st.plating = (P.st.plating || 0) + 2;
      if (g.includes('hush_veil')) for (const e of this.alive()) { this.addStatus(e, 'weak', 1, true); this.addStatus(e, 'vuln', 1, true); }
    }
    yield* bSpt.call(this, first);
    if (this.over) return;
    if (!first && g.includes('sub_chain')) { P.block += 2; floatText(P.x, P.y - 230, '+2 Block', C.sky, 24); }
    if (!first && g.includes('loop_pedal') && this.turn % 3 === 0) this.addStatus(P, 'str', 1);
    const w = W0();
    if (first && w && w.pending && w.pending.flags.finaleCards) { for (const id of w.pending.flags.finaleCards) handCard(this, id); }
  };
  const bEts = BattleScene.prototype.endTurnSeq;
  BattleScene.prototype.endTurnSeq = function* () {
    if (this.allies && this.allies.length) { yield* World._allyTurn(this); if (this.over) return; }
    yield* bEts.call(this);
  };
  // enemy plating adds to enemy Block moves
  const bDoMove = BattleScene.prototype.doMove;
  BattleScene.prototype.doMove = function* (e) {
    const m = e.intent;
    if (m && m.t === 'blk' && e.st.plating) { e.intent = Object.assign({}, m, { n: m.n + e.st.plating }); yield* bDoMove.call(this, e); e.intent = m; return; }
    yield* bDoMove.call(this, e);
  };
  const bBase = BattleScene.prototype.drawBase;
  BattleScene.prototype.drawBase = function (c) {
    bBase.call(this, c);
    if (!this.allies || !this.allies.length) return;
    for (const a of this.allies) {
      drawUnit(c, a, 1);
      if (!a.leaving) {
        const col = CREWS[a.crew] ? CREWS[a.crew].color : C.mustard;
        c.save(); c.translate(a.x, a.y + 26); inkEll(c, 0, 0, 15, 15, col, { seed: 7, lw: 3, off: 0, shade: false, n: 8 }); c.restore();
        txt(c, String(a.turns), a.x, a.y + 33, { size: 18, font: FD, color: C.ink, align: 'center' });
        if (UI.enabled && Math.abs(In.x - a.x) < 50 && In.y > a.y - 200 && In.y < a.y + 40) tip(a.name + ' (Favour)', `${BC['favour_' + a.ally] ? BC['favour_' + a.ally].text : ''}\nTurns left: ${a.turns}`);
      }
    }
  };
  const bUpd = BattleScene.prototype.update;
  BattleScene.prototype.update = function (dt) {
    bUpd.call(this, dt);
    if (!this.allies || !this.allies.length) return;
    for (const u of this.allies) {
      const p = u.pose;
      if (p.atkT >= 0) { p.atkT += dt; if (p.atkT > 0.6) p.atkT = -1; }
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2.5);
      p.dx *= Math.pow(.0005, dt);
      if (p.hop > 0) { p.hop += dt * 1.8; if (p.hop > 1) p.hop = 0; }
      u.x = lerp(u.x, u.leaving ? -140 : u.tx, 1 - Math.pow(u.leaving ? .2 : .002, dt));
    }
    this.allies = this.allies.filter(u => !(u.leaving && u.x < -120));
  };
  // ---- negotiation: Favour arguments last 3 turns; Choir 'hush' softens pressure; crew grafts; finale hand
  const nSpt = NegotiationScene.prototype.startPlayerTurn;
  NegotiationScene.prototype.startPlayerTurn = function* (first) {
    const P = this.P, g = this.run.grafts;
    if (first && g.includes('gold_clause')) P.block += 6;
    // patience: long stalemates end. From turn 9 the room heckles you for 2 more Resolve each turn.
    if (!first && this.turn >= 8 && !this.over) {
      const n = (this.turn - 7) * 2; floatText(W / 2, 200, 'The crowd is getting bored!', C.mustard, 30);
      yield* this.pressure(n, this.O.x); if (this.over) return;
    }
    for (const a of this.pargs) if (a.kind === 'hush') { this.soften += a.n; a.pop = .01; floatText(this.O.x, this.O.y - 240, `Shh: -${a.n} pressure`, '#c4f4f9', 24); }
    yield* nSpt.call(this, first);
    if (this.over) return;
    for (let i = this.pargs.length - 1; i >= 0; i--) {
      const a = this.pargs[i]; if (!a.life) continue;
      a.life--; if (a.life <= 0) { this.pargs.splice(i, 1); floatText(this.slotX(i, true), 300, `${a.name} heads home`, C.cream, 22); }
    }
    const w = W0();
    if (first && w && w.pending && w.pending.flags.finaleCards) for (const id of w.pending.flags.finaleCards) handCard(this, id);
  };
  const nApply = NegotiationScene.prototype.applyCard;
  NegotiationScene.prototype.applyCard = function* (d, target) {
    yield* nApply.call(this, d, target);
    if (d.arg && d.arg.life && this.pargs.length) { if (d.ally && NPCS[d.ally]) { this.say(this.P, `${NPCS[d.ally].name}: "${pick(NPCS[d.ally].barks)}"`, 1.6); } }
  };
  const nTok = NegotiationScene.prototype.drawToken;
  NegotiationScene.prototype.drawToken = function (c, a, x, y, player) {
    nTok.call(this, c, a, x, y, player);
    if (player && a.life) {
      txt(c, `${a.life} turn${a.life > 1 ? 's' : ''}`, x, y + 66, { size: 14, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 3 });
      if (a.kind === 'hush' && Math.abs(In.x - x) < 42 && Math.abs(In.y - y) < 52 && UI.enabled) tip(a.name, `Their pressure is ${a.n} weaker each turn. ${a.life} turns left.`);
    }
  };
  const nFin = NegotiationScene.prototype.finish;
  NegotiationScene.prototype.finish = function* () {
    const w = W0(); if (w && w.pending && this.over === 'lose') w.pending.talkFailed = 1;
    yield* nFin.call(this);
  };
  // ---- shop: standing prices, no crew grafts on sale, the merchant's own patter
  const sEnter = ShopScene.prototype.enter;
  ShopScene.prototype.enter = function () {
    sEnter.call(this);
    const run = G.run, w = W0();
    const bad = this.grafts.filter(it => GRAFTS[it.id].crew);
    if (bad.length) {
      const pool = shuffle(Object.keys(GRAFTS).filter(g => !run.grafts.includes(g) && !GRAFTS[g].crew && !this.grafts.some(x => x.id === g)));
      this.grafts = this.grafts.filter(it => !GRAFTS[it.id].crew).concat(pool.slice(0, bad.length).map(id => ({ id, sold: false, price: GRAFTS[id].cost })));
    }
    if (w && w.shopCtx) {
      const m = w.shopCtx.mul, n = NPCS[w.shopCtx.npc];
      this.bcards.concat(this.ncards).concat(this.grafts).forEach(it => { it.price = Math.round(it.price * m * (w.act >= 2 ? 1.15 : 1)); });
      this.removeCost = Math.round(this.removeCost * m);
      if (n) { this.line = pick(n.greet); this.npc = n.id; this.title = n.name; }
      w.shopCtx = null;
    }
  };
  // ---- continue from the menu: drop any half-finished encounter
  const mCont = MenuScene.prototype.cont;
  MenuScene.prototype.cont = function () {
    const r = mCont.call(this);
    if (G.run && G.run.world) World.normalize(G.run);
    return r;
  };
})();

// ===================================================================== fallback map (only until world_scenes.js provides WorldMapScene)
class WorldFallbackScene {
  constructor(o) { this.o = o || {}; this.t = 0; this.msg = []; this.sel = null; }
  enter() { Snd.setMood('map'); saveRun(); if (this.o.intro) this.msg = [`ACT ${G.run.act}: ${G.run.act === 1 ? 'THE RUST QUARTER' : 'THE QUARTER, REMIXED'}`]; const w = G.run.world; if (w && w.lastCred && this.o.venue) this.msg = [w.lastCred]; }
  update(dt) { this.t += dt; }
  handle(res) {
    if (!res) return;
    if (res.kind === 'encounter') { World.beginEncounter(res); return; }
    if (res.kind === 'shop') { go(() => setScene(new ShopScene())); return; }
    if (res.kind === 'request') { const r = World.acceptRequest(res.request); this.msg = [res.request.desc, r.ok ? 'Accepted!' : r.why]; return; }
    if (res.kind === 'pick') { if (res.pick === 'upgrade') { const sc = new RestScene(); go(() => setScene(sc)); } return; }
    if (res.kind === 'favours') { World.setFavours(res.recruited.slice(-3)); this.msg = ['Favours: ' + World.favours().map(id => NPCS[id].name).join(', ')]; return; }
    this.msg = res.lines || [];
    const ev = (res.events || []).find(e => e.encounter); if (ev) World.beginEncounter(ev.encounter);
  }
  draw(c) {
    const run = G.run, w = run.world; UI.enabled = !G.modal && !G.trans;
    drawPaper(c, null); vignette(c, .4);
    const oy = 130;
    EDGES.forEach(([a, b]) => { const A_ = VENUES[a], B = VENUES[b]; c.strokeStyle = 'rgba(60,35,15,.45)'; c.lineWidth = 3; c.beginPath(); c.moveTo(A_.x, A_.y * .95 + oy); c.lineTo(B.x, B.y * .95 + oy); c.stroke(); });
    const nb = World.neighbors(w.at);
    VENUE_IDS.forEach(v => {
      const V = VENUES[v], x = V.x, y = V.y * .95 + oy, own = World.turf(v), near = nb.find(n => n.id === v);
      inkEll(c, x, y, v === w.at ? 30 : 22, v === w.at ? 30 : 22, World.crewColor(own), { seed: x % 9, lw: 3.5, n: 10 });
      txt(c, V.name, x, y + 40, { size: 15, font: FD, color: C.ink, align: 'center' });
      if (near && !near.locked && UI.hit(x - 26, y - 26, 52, 52)) { UI.cursor = 'pointer'; tip(V.name, V.blurb); if (In.click) { In.click = null; const r = World.travel(v); this.msg = [].concat(...r.events.map(e => e.lines || [])); const ev = r.events.find(e => e.encounter); if (ev) World.beginEncounter(ev.encounter); } }
    });
    txt(c, World.dayLabel() + `   Buzz ${World.buzz()}   ` + CREW_IDS.map(k => `${CREWS[k].short}: ${World.standingName(w.standing[k])}`).join('  '), 20, 86, { size: 17, color: C.ink });
    // residents + actions
    const here = World.npcsAt(w.at); let y = 110;
    txt(c, VENUES[w.at].name + ' (fallback scene: world_scenes.js not loaded)', W - 20, y, { size: 16, align: 'right', color: C.brown }); y += 8;
    here.forEach(id => {
      y += 26; txt(c, NPCS[id].name, W - 330, y, { size: 18, font: FD, color: World.crewColor(NPCS[id].crew) === '#f4b6e0' ? '#b4689a' : World.crewColor(NPCS[id].crew), stroke: C.ink, sw: 3 });
      if (UI.hit(W - 340, y - 18, 320, 24) && In.click) { In.click = null; this.sel = this.sel === id ? null : id; }
      if (this.sel === id) World.actions(id).forEach(a => { y += 30; if (UI.btn(W - 320, y - 22, 300, 28, a.label, { col: a.enabled ? C.teal : C.grey, disabled: !a.enabled, size: 15 })) this.handle(World.do(id, a.id)); });
    });
    World.venueActions(w.at).forEach(a => { y += 34; if (UI.btn(W - 320, y - 22, 300, 30, a.label, { col: a.enabled ? C.mustard : C.grey, disabled: !a.enabled, size: 16 })) this.handle(World.doVenue(a.id)); });
    this.msg.slice(0, 4).forEach((m, i) => txt(c, m.slice(0, 150), 20, 640 + i * 20, { size: 16, color: C.ink }));
    drawHUD(c, run);
  }
  onKey(k) { if (k === 'Escape') openPause(); }
}
