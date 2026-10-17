'use strict';
// ===================== WORLD TEST: unit checks + a bot that plays whole acts through the World API =====================
// Console:  await WorldTest.units()                       -> {pass, fail, fails}
//           await WorldTest.run('rook', 3, 'act1')        -> summary for 3 seeds (mode 'act1' | 'full')
//           await WorldTest.all(2, 'full')                -> every hero
// Drives BattleScene / NegotiationScene / EncounterScene / RewardScene directly (no WorldMapScene/VenueScene needed).
const WorldTest = (() => {
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const sleep = () => new Promise(r => setTimeout(r, 0));
  function snapshot() { return { run: G.run, scene: G.scene, save: localStorage.getItem('rg_run'), meta: JSON.stringify(G.meta), fast: G.settings.fast, rnd: Math.random }; }
  function restore(s) {
    Math.random = s.rnd; G.run = s.run; G.trans = null; G.modal = null; G.settings.fast = s.fast;
    try { if (s.save == null) localStorage.removeItem('rg_run'); else localStorage.setItem('rg_run', s.save); } catch (e) { }
    G.meta = JSON.parse(s.meta); saveMeta();
    setScene(s.scene && !(s.scene instanceof BattleScene) && !(s.scene instanceof NegotiationScene) ? s.scene : new MenuScene());
  }

  // ------------------------------------------------------------------ unit checks
  async function units() {
    const snap = snapshot(); const fails = []; let pass = 0;
    const ok = (c, m) => { if (c) pass++; else fails.push(m); };
    try {
      Math.random = mulberry(77);
      // data shape
      ok(Object.keys(CREWS).length === 5, 'five crews');
      ok(NPC_IDS.length === 26, '25 NPCs + jordan (got ' + NPC_IDS.length + ')');
      ok(VENUE_IDS.length === 17, '17 venues');
      ok(EDGES.every(e => VENUES[e[0]] && VENUES[e[1]]), 'edges reference venues');
      for (const id of NPC_IDS) {
        if (id === 'jordan') continue;
        const e = ENEMIES[id], e2 = ENEMIES[id + '_a2'];
        ok(e && e.talk && e.spec.kind === 'rj' && e.spec.rj === 'npc_' + id, 'enemy entry ' + id);
        ok(e2 && e2.hp[0] > e.hp[0] && e2.talk.core > e.talk.core, 'act2 variant ' + id);
        for (const a of e.talk.args) ok(!!ARGS[a], 'arg template ' + a);
        for (const m of e.moves) if (m.t === 'sum') ok(!!ENEMIES[m.id], 'summon ' + m.id);
      }
      for (const id of FAVOUR_NPCS) { ok(BC['favour_' + id] && NC['favour_' + id + '_t'], 'favour cards ' + id); ok(cd({ id: 'favour_' + id }).text.length > 10 && cd({ id: 'favour_' + id + '_t' }).arg, 'favour text ' + id); }
      ok(!cardPool('b', { char: 'rook' }).some(c => c.favour), 'favour cards never roll as rewards');
      for (const c of CREW_IDS) ok(GRAFTS[CREW_GRAFT[c]], 'crew graft ' + c);
      // new run
      G.run = newRun('rook'); let run = G.run, w = run.world;
      ok(run.map === null && run.pos === -1 && w && w.act === 1 && w.day === 1 && w.slot === 0 && w.at === 'home_studio', 'newRun builds world');
      ok(w.standing.loop_rats === 1 && w.standing.gloss === -1, 'hero start standing');
      ok(run.deck.length === 10 && run.grafts[0] === 'wire_spool', 'starter deck kept');
      // travel cost
      let r = World.travel('busker_alley'); ok(!r.ok, 'cannot travel to non-neighbour');
      r = World.travel('the_stage'); ok(!r.ok, 'stage locked on day 1');
      r = World.travel('scrapyard'); ok(r.ok && w.at === 'scrapyard' && w.slot === 1 && w.day === 1, 'travel costs 1 slot');
      // slot rollover
      w.slot = 2; const lines = World.advance(1); ok(w.day === 2 && w.slot === 0 && lines.length >= 2 && w.rumors.length >= 2, 'slot rollover runs dawn + Street Buzz');
      // standing clamping & halves & ripple
      World.adjust('static_choir', 10, 't', { ripple: false }); ok(w.standing.static_choir === 3, 'clamp +3');
      World.adjust('static_choir', -20, 't', { ripple: false }); ok(w.standing.static_choir === -3, 'clamp -3');
      w.standing.scrap_kings = 0; w.half.scrap_kings = 0;
      World.adjust('scrap_kings', .5, 't', { ripple: false }); ok(w.standing.scrap_kings === 0 && w.half.scrap_kings === 1, 'half step kept');
      World.adjust('scrap_kings', .5, 't', { ripple: false }); ok(w.standing.scrap_kings === 1 && w.half.scrap_kings === 0, 'second half step rounds up');
      const g0 = w.standing.gloss * 2 + w.half.gloss, b0 = w.standing.bass_cartel * 2 + w.half.bass_cartel, l0 = w.standing.loop_rats * 2 + w.half.loop_rats;
      World.adjust('gloss', 1, 't');
      ok(w.standing.gloss * 2 + w.half.gloss === g0 + 2 && w.standing.bass_cartel * 2 + w.half.bass_cartel === b0 + 1 && w.standing.loop_rats * 2 + w.half.loop_rats === l0 - 1, 'ripple to friend/rival');
      // gating
      w.standing.bass_cartel = -2; ok(!World.actions('cartel_wanda').find(a => a.id === 'chat').enabled, 'Enemy: no chat');
      w.standing.bass_cartel = -3; ok(!World.actions('cartel_wanda').find(a => a.id === 'talk').enabled, 'Hostile: no talk');
      w.standing.bass_cartel = 0; ok(!World.actions('cartel_wanda').find(a => a.id === 'recruit').enabled, 'rapport gate on recruit');
      // boss presence
      ok(!World.npcLocation('loop_mama'), 'boss hidden at Neutral/Friendly');
      w.standing.loop_rats = 3; ok(World.npcLocation('loop_mama') === 'busker_alley', 'boss appears when Bonded');
      w.standing.loop_rats = 1;
      // night-only
      w.slot = 0; ok(!World.npcsAt('club_woofer').includes('cartel_snare'), 'Snare only at night');
      w.slot = 2; ok(World.npcsAt('club_woofer').includes('cartel_snare'), 'Snare at night');
      w.slot = 0;
      // request lifecycle: deliver to a neighbour
      w.at = 'home_studio'; w.standing.scrap_kings = 0;
      const req = World.makeRequest('scrap_carla'); req.type = 'deliver'; req.venue = 'rust_bridge'; req.desc = REQUEST_TYPES.deliver.describe(req);
      ok(World.acceptRequest(req).ok && req.state === 'active', 'accept request');
      const m0 = run.money; r = World.travel('rust_bridge');
      ok(req.state === 'done' && run.money >= m0 + req.reward.shil - 0 && w.standing.scrap_kings >= 1, 'deliver completes on arrival');
      const req2 = World.makeRequest('scrap_carla'); req2.type = 'scout'; req2.venues = ['home_studio', 'junk_cafe']; World.acceptRequest(req2);
      req2.deadline = w.day - 1; const sk = w.standing.scrap_kings; w.slot = 2; World.advance(1);
      ok(req2.state === 'failed' && w.standing.scrap_kings === sk - 1, 'expired request fails, giver crew -1');
      ok(World.activeRequests().length <= 3, 'max 3 active');
      // favour injection/removal
      w.npc.scrap_carla.recruited = true; w.npc.loop_dotty.recruited = true;
      World.setFavours(['scrap_carla', 'loop_dotty', 'scrap_carla']);
      const cnt = (l, id) => l.filter(c => c.id === id).length;
      ok(cnt(run.deck, 'favour_scrap_carla') === 1 && cnt(run.ndeck, 'favour_scrap_carla_t') === 1 && cnt(run.deck, 'favour_loop_dotty') === 1, 'favour cards injected once');
      World.syncFavourCards(run); ok(cnt(run.deck, 'favour_scrap_carla') === 1, 'sync is idempotent');
      World.setFavours(['loop_dotty']); ok(cnt(run.deck, 'favour_scrap_carla') === 0 && cnt(run.ndeck, 'favour_scrap_carla_t') === 0 && cnt(run.deck, 'favour_loop_dotty') === 1, 'dismissed favour removed');
      World.setFavours(['gloss_mute']); ok(World.favours().length === 0, 'only recruited friends allowed');
      // save/load round trip
      w.npc.loop_dotty.recruited = true; World.setFavours(['loop_dotty']);
      const json = JSON.stringify(run); const back = JSON.parse(json);
      const before = { at: World.npcsAt(w.at), buzz: World.buzz(), st: JSON.stringify(w.standing), lab: World.dayLabel(), acts: World.actions('loop_dotty').map(a => a.id + a.enabled).join() };
      G.run = back; World.normalize(back);
      const after = { at: World.npcsAt(back.world.at), buzz: World.buzz(), st: JSON.stringify(back.world.standing), lab: World.dayLabel(), acts: World.actions('loop_dotty').map(a => a.id + a.enabled).join() };
      ok(JSON.stringify(before) === JSON.stringify(after), 'save/load round trip');
      ok(JSON.stringify(back) === json, 'normalize keeps a clean save unchanged');
      run = back; w = run.world;
      // contested lair + flip at dawn
      w.standing.gloss = 1; w.turf.busker_alley = 'loop_rats';
      w.pending = { npc: 'loop_stomp', mode: 'fight', venue: 'busker_alley', enemies: ['loop_stomp'], flags: { elite: 1 } };
      const rw = { gold: 40, cards: [], kind: 'b', graft: null }; World.resolve(rw);
      ok(w.turf.busker_alley === 'contested' && rw.world && w.lastCred && /Loop Rats/.test(w.lastCred), 'beating an Enforcer contests the lair + Street Cred');
      w.slot = 2; World.advance(1); ok(w.turf.busker_alley !== 'contested', 'contested lair settles at dawn (' + w.turf.busker_alley + ')');
      // finale spec
      CREW_IDS.forEach((c, i) => { w.standing[c] = i - 2; w.half[c] = 0; });
      const f = World.finale(); ok(f.npc === crewMember(CREW_IDS[0], 'boss')[0] && f.enemies.length === 2 && f.flags.finale, 'finale = boss of lowest crew + enforcer of 2nd');
      // final night clamp
      w.day = 6; w.slot = 1; World.advance(5); ok(w.day === 6 && w.slot === 2 && World.finalNight() && World.stageUnlocked(), 'time clamps at Day 6 Night, stage opens');
      ok(World.neighbors('home_studio').every(n => n.cost === 0), 'free travel on Headliner Night');
      // act 2
      World.reset(run, 2); ok(run.act === 2 && run.world.act === 2 && run.world.day === 1 && World.eid('loop_echo') === 'loop_echo_a2', 'act 2 reset');
      ok(run.deck.filter(c => c.id === 'favour_loop_dotty').length === 1, 'favours carried into act 2');
      // ally in battle
      G.run = newRun('mourn'); run = G.run; run.world.npc.cartel_wanda.recruited = true; World.setFavours(['cartel_wanda']);
      run.world.pending = { npc: 'cartel_kick', mode: 'fight', venue: 'club_woofer', enemies: ['cartel_kick'], flags: {} };
      G.settings.fast = 1; setScene(new BattleScene({ enemies: ['cartel_kick'], node: { type: 'fight', enc: ['cartel_kick'] } }));
      const sc = G.scene; let k = 0;
      while ((sc.phase !== 'player' || sc.busy) && k++ < 600) stepN(1);
      sc.hand.push({ inst: newInst('favour_cartel_wanda'), x: 70, y: 660, rot: 0, sc: 1, a: 1 }); sc.ap = 3;
      ok(sc.tryPlay(sc.hand.length - 1, null), 'favour card playable');
      k = 0; while (sc.busy && k++ < 600) stepN(1);
      ok(sc.allies && sc.allies.length === 1 && sc.allies[0].turns === 3, 'ally spawned');
      const hp0 = sc.enemies[0].hp; sc.endTurn(); k = 0; while ((sc.phase !== 'player' || sc.busy) && !sc.over && k++ < 900) stepN(1);
      ok(sc.allies[0] && sc.allies[0].turns === 2 && (sc.enemies[0].hp < hp0 || sc.over), 'ally acted at end of turn');
      // timed talk argument
      run.world.pending = { npc: 'cartel_kick', mode: 'talk', venue: 'club_woofer', enemies: ['cartel_kick'], flags: {} };
      setScene(new NegotiationScene({ enemy: 'cartel_kick', fightIds: ['cartel_kick'], node: { type: 'fight', enc: ['cartel_kick'] } }));
      const ns = G.scene; k = 0; while ((ns.phase !== 'player' || ns.busy) && k++ < 600) stepN(1);
      ns.hand.push({ inst: newInst('favour_cartel_wanda_t'), x: 70, y: 660, rot: 0, sc: 1, a: 1 }); ns.ap = 3; ns.tryPlay(ns.hand.length - 1, null);
      k = 0; while (ns.busy && k++ < 600) stepN(1);
      ok(ns.pargs.some(a => a.life === 3), 'favour argument placed');
      for (let t = 0; t < 3 && !ns.over; t++) { ns.endTurn(); k = 0; while ((ns.phase !== 'player' || ns.busy) && !ns.over && k++ < 900) stepN(1); }
      ok(ns.over || !ns.pargs.some(a => a.favour), 'favour argument expires after 3 turns');
      run.world.pending = null;
    } catch (e) { fails.push('EXCEPTION ' + (e && e.stack || e)); }
    restore(snap);
    return { pass, fail: fails.length, fails };
  }

  // ------------------------------------------------------------------ bots
  function incoming(sc) { return sc.alive().reduce((s, e) => { const m = e.intent; if (!m) return s; if (m.t === 'atk') return s + sc.calc(e, sc.P, m.n) * (m.h || 1); if (m.t === 'deb' && m.dmg) return s + sc.calc(e, sc.P, m.dmg); return s; }, 0); }
  function botBattle(sc) {
    if (sc.phase !== 'player' || sc.busy || sc.over) return;
    const al = sc.alive(); if (!al.length) return;
    const tgt = al.slice().sort((a, b) => a.hp - b.hp)[0];
    const inc = incoming(sc) - sc.P.block;
    let best = -1, bs = 0;
    sc.hand.forEach((h, i) => {
      const d = cd(h.inst); if (d.unplayable || d.cost > sc.ap) return;
      let s = 1;
      if (d.special === 'ally') s = 60;
      if (d.dmg != null) s += d.dmg * (d.hits || 1) * (d.all ? al.length : 1) + (d.dmg >= tgt.hp ? 20 : 0);
      if (d.special === 'detonate') s += (tgt.st.bleed || 0) * d.mult;
      if (d.special === 'bodyslam') s += sc.P.block;
      if (d.blk) s += inc > 0 ? Math.min(d.blk, inc) * 1.3 : 1;
      if (d.bleed || d.weak || d.vuln) s += 4;
      if (d.str || d.plating || d.thorns) s += sc.turn <= 2 ? 10 : 3;
      if (d.draw || d.ap) s += 4;
      if (d.heal) s += sc.P.hp < sc.P.maxhp * .6 ? d.heal : 0;
      if (d.hurt && sc.P.hp <= d.hurt + 5) s = 0;
      s /= Math.max(.5, d.cost);
      if (s > bs) { bs = s; best = i; }
    });
    if (best < 0 || !sc.tryPlay(best, sc.needsTarget(best) ? tgt : null)) sc.endTurn();
  }
  function botTalk(sc) {
    if (sc.phase !== 'player' || sc.busy || sc.over) return;
    const pressure = sc.oargs.filter(a => a.kind === 'pressure').reduce((s, a) => s + a.n, 0) + (sc.tk.moves[sc.oi % sc.tk.moves.length] || 0);
    const inc = pressure - sc.P.block;
    const weakArg = sc.oargs.slice().sort((a, b) => a.resolve - b.resolve)[0];
    let best = -1, bs = 0;
    sc.hand.forEach((h, i) => {
      const d = cd(h.inst); if (d.unplayable || d.cost > sc.ap) return;
      let s = 1;
      if (d.inf != null) s += d.inf * (d.hits || 1) * 1.6;
      if (d.comp) s += inc > 0 ? Math.min(d.comp, inc) * (sc.P.hp < sc.P.maxhp * .5 ? 1.5 : .8) : 1;
      if (d.arg) s += d.favour ? 40 : 12;
      if (d.soften) s += 3; if (d.draw || d.ap) s += 3; if (d.hurt && sc.P.hp <= d.hurt + 4) s = 0;
      s /= Math.max(.5, d.cost); if (s > bs) { bs = s; best = i; }
    });
    if (best < 0) { sc.endTurn(); return; }
    let t = null;
    if (sc.needsTarget(best)) { const d = cd(sc.hand[best].inst); t = weakArg && weakArg.resolve <= d.inf * (d.hits || 1) && weakArg.kind !== 'fort' ? weakArg : sc.coreT; }
    if (!sc.tryPlay(best, t)) sc.endTurn();
  }
  function botEncounter(sc, st) {
    if (sc.t < .6) return;
    const n = sc.node, elite = n.type === 'elite', boss = n.type === 'boss';
    const talk = sc.leader && Math.random() < st.talkP;
    sc.t = -99; // act once
    if (talk) go(() => setScene(new NegotiationScene({ enemy: sc.leader.id, fightIds: n.enc, node: n, elite, boss })));
    else go(() => setScene(new BattleScene({ enemies: n.enc, node: n, elite, boss })));
  }
  function botReward(sc, st) {
    if (sc.t < 1.1 || sc._bot) return;
    sc._bot = 1;
    if (!sc.picked && sc.r.cards.length) { if (Math.random() < .8) { const i = ri(0, sc.r.cards.length - 1); sc.take(i, sc.r.cards[i]); st.cards++; } else sc.picked = true; }
    if (sc.r.graft && !sc.gotGraft) { sc.gotGraft = true; addGraft(G.run, sc.r.graft); st.grafts++; }
    if (G.run.world && G.run.world.lastCred && sc.r.world) st.cred.push(G.run.world.lastCred);
    sc.next();
  }
  function botShop(sc, st) {
    if (sc._bot) return; sc._bot = 1; const run = G.run;
    const items = sc.bcards.concat(sc.ncards).filter(it => !it.sold && it.price <= run.money - 40).sort((a, b) => a.price - b.price);
    if (items[0] && Math.random() < .7) { const it = items[0]; run.money -= it.price; it.sold = true; (BC[it.id] && sc.bcards.includes(it) ? run.deck : run.ndeck).push({ id: it.id, up: false }); st.bought++; }
    go(() => setScene(makeMapScene()));
  }
  // one world decision per call
  function worldTick(st) {
    const run = G.run, w = run.world;
    if (!w || w.pending) return;
    const doIt = (id, aid) => { const r = World.do(id, aid); st.actions[aid] = (st.actions[aid] || 0) + 1; return handle(r, st); };
    // 1) headliner
    const hpk = run.hp / run.maxhp;
    const wantStage = World.stageUnlocked() && (World.finalNight() || (World.buzz() >= 8 && hpk > .6) || w.day >= 6);
    if (wantStage) {
      if (w.at === 'the_stage') { st.finales++; World.beginEncounter(World.finale()); return; }
      if (hpk < .8 && VENUES[w.at].rest && !w.flags['rested' + w.day + '_' + w.slot] && run.hp < run.maxhp) { handle(World.rest(), st); return; }
      if (hpk < .8 && w.at !== 'home_studio' && !st['prep' + run.act]) { st['prep' + run.act] = 1; const p0 = World.pathTo(w.at, 'home_studio'); if (p0[0]) { travel(p0[0], st); return; } }
      const p = World.pathTo(w.at, 'the_stage'); travel(p[0], st); return;
    }
    st.free = (st.freeKey === w.day * 3 + w.slot) ? st.free + 1 : 0; st.freeKey = w.day * 3 + w.slot;
    // 2) free actions (bounded per slot)
    if (st.free < 10) {
      if (w.at === 'home_studio' && World.recruitedList().length > World.favours().length) { World.setFavours(World.recruitedList().slice(-3)); return; }
      for (const id of World.npcsAt(w.at)) {
        const acts = World.actions(id), A_ = k => acts.find(a => a.id === k && a.enabled);
        const rq = A_('request');
        if (rq && /Hand over/.test(rq.label) && run.money > rq.cost.shil + 30) { doIt(id, 'request'); return; }
        if (A_('recruit') && run.money > 90) { doIt(id, 'recruit'); return; }
        if (A_('chat')) { doIt(id, 'chat'); return; }
        if (rq && !/Hand over/.test(rq.label) && World.activeRequests().length < 3) { doIt(id, 'request'); return; }
        if (A_('gift') && run.money > 120 && World.rapport(id) < 2 && FAVOUR_NPCS.includes(id)) { doIt(id, 'gift'); return; }
        if (A_('trade') && run.money > 160 && !st.shopped[w.day + id]) { st.shopped[w.day + id] = 1; doIt(id, 'trade'); return; }
      }
    }
    // 3) rest when hurt
    if (hpk < .55 && VENUES[w.at].rest && run.hp < run.maxhp && !w.flags['rested' + w.day + '_' + w.slot]) { st.rests++; handle(World.rest(), st); return; }
    // 4) pick a fight / talk here
    const here = World.npcsAt(w.at).filter(id => NPCS[id].crew !== 'neutral');
    const reqT = World.activeRequests().map(r => r.target).filter(Boolean);
    let target = here.find(id => reqT.includes(id));
    if (!target && hpk > .55) target = here.filter(id => ['grunt'].includes(NPCS[id].role) || (NPCS[id].role === 'enforcer' && hpk > .8 && st.elites < 3 && st.encounters >= 4)).sort((a, b) => World.standing(NPCS[a].crew) - World.standing(NPCS[b].crew))[0];
    if (target && World.standing(NPCS[target].crew) >= 2 && !reqT.includes(target)) target = null;
    if (target && hpk > .4) {
      const acts = World.actions(target), talkOk = acts.find(a => a.id === 'talk' && a.enabled);
      const mode = talkOk && Math.random() < st.talkP ? 'talk' : 'fight';
      if (NPCS[target].role === 'enforcer') st.elites++;
      st.encounters++; doIt(target, mode); return;
    }
    // 5) travel: towards request goals, a rest stop when hurt, else explore
    let goal = null;
    for (const r of World.activeRequests()) {
      if (r.type === 'deliver') goal = r.venue;
      else if (r.type === 'scout') goal = r.venues.find(v => !(r.seen || []).includes(v));
      else if (r.type === 'silence' || r.type === 'turf') goal = (r.target && World.npcLocation(r.target)) || r.venue;
      if (goal) break;
    }
    if (hpk < .5) goal = ['junk_cafe', 'home_studio'].sort((a, b) => World.distance(w.at, a) - World.distance(w.at, b))[0];
    let next;
    if (goal && goal !== w.at) next = World.pathTo(w.at, goal)[0];
    if (!next) { const nb = World.neighbors(w.at).filter(n => !n.locked); next = (nb.find(n => !w.visited[n.id]) || pick(nb)).id; }
    travel(next, st);
  }
  function travel(to, st) {
    const r = World.travel(to); st.travels++;
    if (!r.ok) { st.errors.push('travel failed ' + to + ': ' + r.why); return; }
    for (const e of r.events) { if (e.type === 'ambush') st.ambushes++; if (e.type === 'bounty') st.bounties++; }
    const ev = r.events.find(e => e.encounter); if (ev) { st.encounters++; World.beginEncounter(ev.encounter); }
  }
  function handle(res, st) {
    if (!res) return;
    if (res.kind === 'encounter') { World.beginEncounter(res); return; }
    if (res.kind === 'request') { const a = World.acceptRequest(res.request); if (a.ok) st.requests++; return; }
    if (res.kind === 'shop') { go(() => setScene(new ShopScene())); return; }
    const ev = (res.events || []).find(e => e.encounter); if (ev) World.beginEncounter(ev.encounter);
  }

  async function playOne(hero, seed, mode, maxIter) {
    Math.random = mulberry(seed * 9973 + hero.length);
    G.trans = null; G.modal = null; G._err = null; G.settings.fast = 1;
    G.run = newRun(hero); setScene(makeMapScene({ intro: true }));
    const st = { hero, seed, mode, result: null, encounters: 0, travels: 0, ambushes: 0, bounties: 0, finales: 0, rests: 0, requests: 0, cards: 0, grafts: 0, bought: 0, elites: 0, talkP: .4, actions: {}, shopped: {}, cred: [], errors: [], free: 0, freeKey: -1, iters: 0, t0: performance.now() };
    let lastScene = null, still = 0;
    for (let it = 0; it < (maxIter || 60000); it++) {
      st.iters = it;
      stepN(3, 1 / 30, false);
      if (G._err) { st.errors.push(G._err.split('\n')[0]); G._err = null; }
      const sc = G.scene;
      if (sc === lastScene) still++; else { still = 0; lastScene = sc; }
      if (still > 4000) { st.errors.push('stuck in ' + (sc && sc.constructor.name)); st.result = 'stuck'; break; }
      if (sc instanceof GameOverScene) { st.result = 'gameover'; st.cause = sc.o && sc.o.cause; st.lastEnc = st.lastEncSeen; break; }
      if (sc instanceof VictoryScene) { st.result = 'victory'; break; }
      if (mode === 'act1' && G.run.act === 2) { st.result = 'act1-clear'; break; }
      if (G.run.world && G.run.world.pending) st.lastEncSeen = { e: G.run.world.pending.enemies.join(','), f: Object.keys(G.run.world.pending.flags).join(','), day: G.run.world.day, hp: G.run.hp };
      if (G.trans) continue;
      try {
        if (sc instanceof BattleScene) botBattle(sc);
        else if (sc instanceof NegotiationScene) botTalk(sc);
        else if (sc instanceof EncounterScene) botEncounter(sc, st);
        else if (sc instanceof RewardScene) botReward(sc, st);
        else if (sc instanceof ShopScene) botShop(sc, st);
        else if (sc instanceof RestScene || sc instanceof EventScene) go(() => setScene(makeMapScene()));
        else if (sc instanceof MenuScene || sc instanceof CharSelectScene) { st.errors.push('fell back to menu'); st.result = 'menu'; break; }
        else worldTick(st);
      } catch (e) { st.errors.push('EXC ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); st.result = 'exception'; break; }
      if (it % 150 === 0) await sleep();
    }
    const run = G.run, w = run.world;
    Object.assign(st, {
      act: run.act, day: w ? w.day : 0, slot: w ? w.slot : 0, hp: run.hp + '/' + run.maxhp, money: run.money, deck: run.deck.length + '/' + run.ndeck.length,
      buzz: w ? World.buzz() : 0, standing: w ? Object.assign({}, w.standing) : {}, favours: w ? w.favours.slice() : [], wstats: w ? Object.assign({}, w.stats) : {},
      ms: Math.round(performance.now() - st.t0), credSample: st.cred.slice(-2)
    });
    delete st.shopped; delete st.cred; delete st.t0; delete st.free; delete st.freeKey;
    return st;
  }
  async function run(hero, seeds, mode) {
    hero = hero || 'rook'; mode = mode || 'act1';
    const list = Array.isArray(seeds) ? seeds : Array.from({ length: seeds || 1 }, (_, i) => i + 1);
    const snap = snapshot(); const out = [];
    try { for (const s of list) out.push(await playOne(hero, s, mode)); }
    finally { restore(snap); }
    const tally = {}; out.forEach(o => { tally[o.result] = (tally[o.result] || 0) + 1; });
    return { hero, mode, tally, errors: out.reduce((n, o) => n + o.errors.length, 0), runs: out };
  }
  async function all(seeds, mode) { const res = {}; for (const ch of CHARS) res[ch.id] = await run(ch.id, seeds, mode); return res; }
  return { units, run, all, playOne, mulberry };
})();
