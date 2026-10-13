// Ludus Maximus 3D: simulation extensions (no DOM). Loaded after sim.js. Everything here is data on the save object S
// and pure functions on LM, so the headless tests in tests/ludus_maximus_3d.test.mjs can drive it.
//   1. THE FALLEN   mortality, fall(), memorial wall S.fallen, grief, heirs, legacy fame      (Hardcore option: S.opts.hardcore)
//   2. RIVAL LUDI   four rival schools with personalities, standings, diplomacy, alliances   (S.ludi)
//   3. CALENDAR     the 12 weeks of the season at a glance (festivals, big events, your entries)
//   4. BARRACKS     mentorship pairs, feasts                                                  (S.mentors, S.feastWeek)
//   5. VENATIO      Roman beast hunts: beast data (D.BEASTS), hunts, rewards, trophies, bestiary         (S.venatio)
// Philosophy: no counter mechanics. Nothing here punishes a style choice; risk is explicit, shown before you take it, and softened by buildings.
(function (G) {
  const D = G.LM_D, LM = G.LM;
  if (!LM || LM.mortality) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = () => LM.rand();
  const pick = (arr, r) => arr[Math.floor((r || rnd)() * arr.length)];
  const lvlOf = (S, id) => LM.bfx(S, id).l;

  // =========================================================== 1. THE FALLEN
  const RISK = { pit: 0.07, horde: 0.06, champ: 0.08, bounty: 0.1, event: 0.04, hunt: 0.07 };
  LM.RISK_KINDS = Object.keys(RISK);
  LM.hardcore = (S) => !!(S && S.opts && S.opts.hardcore);
  /** chance (0..0.6) that a fighter who just LOST dies. o: {kind, depth, boss}. Events outside the risk modes only kill in Hardcore. */
  LM.mortality = (S, g, o) => {
    o = o || {}; const kind = RISK[o.kind] != null ? o.kind : 'event', hc = LM.hardcore(S);
    if (kind === 'event' && !hc) return 0;
    const depth = Math.max(1, (o.depth | 0) || 1);
    let c = RISK[kind] + (kind === 'pit' ? 0.035 : kind === 'horde' ? 0.025 : kind === 'hunt' ? 0.02 : 0) * (depth - 1) + (o.boss ? 0.08 : 0);
    if (g && g.lvl < 3 && depth < 3 && !hc) return 0;                       // greenhorns on the first floors are spared unless you chose Hardcore
    const mit = 1 - 0.1 * lvlOf(S, 'infirmary') - 0.08 * lvlOf(S, 'shrine') - ((S.perks || {}).luck || 0) * 0.03;
    c *= clamp(mit, 0.4, 1);
    if (g && g.trait === 'lucky') c *= 0.75;
    if (hc) c *= 1.35;
    return clamp(c, 0, 0.6);
  };
  /** one roll with the sim RNG. Returns {dies, chance}. */
  LM.deathRoll = (S, g, o) => { const chance = LM.mortality(S, g, o); return { dies: chance > 0 && rnd() < chance, chance }; };

  /** the fighter is dead: memorial entry, gear to the armory, team grief, inheritance, an heir offer. Returns the report for the ceremony. */
  LM.fall = (S, g, o) => {
    o = o || {}; S.fallen = S.fallen || [];
    const best = D.STATS.reduce((a, s) => (g.st[s] > g.st[a] ? s : a), 'str');
    const e = { name: g.name, nick: g.nick || '', style: g.style, lvl: g.lvl, w: g.rec.w, l: g.rec.l, fame: g.fame || 0, best, skin: g.skin, hair: g.hair, plume: g.plume, face: g.face, title: g.title || '', wk: S.week, season: S.season, kind: o.kind || 'event', depth: o.depth | 0, by: o.by || '', id: g.id };
    S.fallen.push(e); if (S.fallen.length > 60) S.fallen.shift();
    const others = S.glads.filter((x) => x !== g), grief = [];
    others.forEach((x) => {
      const b = LM.bond(S, g.id, x.id), drop = 6 + Math.round(b * 0.2) + (x.trait === 'hothead' ? 3 : 0) - (x.trait === 'coolhead' ? 3 : 0);
      x.mo = clamp(x.mo - drop, 0, 100); if (b >= 50) x.grief = 3; else if (b >= 25) x.grief = 1;
      grief.push({ id: x.id, name: x.name, drop, bond: b });
    });
    // inheritance: the closest friend inherits the dead man's drills (+stat) and a vow
    let inherited = null;
    const close = others.map((x) => ({ x, b: LM.bond(S, g.id, x.id) })).filter((r) => r.b >= 30).sort((a, b) => b.b - a.b)[0];
    if (close) { const v = Math.max(1, Math.ceil(g.lvl / 4)); close.x.st[best] += v; close.x.vow = e.name; LM.diary(S, close.x, `Swore to carry on for ${e.name}: +${v} ${D.SN[best]}.`); inherited = { id: close.x.id, name: close.x.name, stat: best, v }; }
    // the crowd remembers a brave death
    const fame = Math.round(8 + g.lvl * 2 + g.rec.w * 0.5); S.fame += fame; e.honor = fame;
    // an heir (pupil or son) steps forward for anyone who mattered
    let heir = null;
    if (g.lvl >= 3) { S.heirPending = { of: e.name, style: g.style, lvl: Math.max(1, Math.floor(g.lvl / 3)), best, w: e.wk }; heir = S.heirPending; }
    S.stats.fallen = (S.stats.fallen || 0) + 1;
    LM.forumAdd(S, `${e.name} fell in the ${e.kind === 'pit' ? 'Pit' : e.kind === 'horde' ? 'Horde Trial' : e.kind === 'champ' ? 'champion duel' : e.kind === 'bounty' ? 'bounty hunt' : e.kind === 'hunt' ? 'Venatio' : 'arena'}.`);
    S.news = S.news || []; S.news.push(`${e.name} fell at ${e.kind === 'pit' ? 'the Pit' : 'the arena'}. The ludus mourns.`);
    (S.mentors || []).slice().forEach((m) => { if (m.m === g.id || m.p === g.id) LM.mentorEnd(S, m, 'fell'); });
    LM.release(S, g);
    return { entry: e, grief, inherited, heir, fame };
  };
  LM.legacyFame = (S) => Math.min(10, (S.fallen || []).filter((f) => f.lvl >= 5).length * 2 + (S.fallen || []).filter((f) => f.lvl >= 10).length);
  /** the heir offer that follows a death: the pupil joins (free, talented), or a monument is raised for fame */
  LM.heirRecruit = (S) => {
    const p = S.heirPending; if (!p) return null;
    const g = LM.makeGlad({ id: S.nextId++, style: p.style, lvl: p.lvl, q: 0.95 });
    g.tal[p.best] = 3; g.heirOf = p.of; g.title = 'Heir of ' + p.of; g.act = 'rest'; g.mo = 85; LM.assignStory(g); return g;
  };
  LM.takeHeir = (S) => {
    const p = S.heirPending; if (!p) return 'No heir waits';
    if (S.glads.length >= LM.rosterCap(S)) return 'Barracks full';
    const g = LM.heirRecruit(S); S.glads.push(g); S.heirPending = null; LM.diary(S, g, `Takes up the arms of ${p.of}.`); return { glad: g };
  };
  LM.monument = (S) => {
    const p = S.heirPending; if (!p) return 'No heir waits';
    const f = 15 + p.lvl * 4; S.fame += f; S.heirPending = null; return { fame: f };
  };

  // =========================================================== 2. RIVAL LUDI
  LM.PERS = {
    brutal: { n: 'Brutal', who: 'the Butcher', d: 'Wins by terror and respects only strength. Gifts bore him; a sparring bout in his yard earns his regard. Cross him and his men ambush your barracks.', gift: 3, spar: 6, ally: 'Spreads your name: extra fame every week.' },
    cunning: { n: 'Cunning', who: 'the Fox', d: 'Sells secrets and sets traps. Flattery works, rumors rarely do. A grudge costs you gold from the strongbox.', gift: 12, spar: 6, ally: 'Spies in every ludus: scouting +1 level each week.' },
    honorable: { n: 'Honorable', who: 'the Just', d: 'A veteran who keeps his word. Joint training is welcome and gifts are politely received. Never raids, but remembers an insult.', gift: 8, spar: 11, ally: 'Brotherhood: every fighter gets morale and energy each week.' },
    greedy: { n: 'Greedy', who: 'the Coin-Counter', d: 'Everything has a price. Gifts work wonders; a spurned partner pays men to poach your recruits.', gift: 24, spar: 5, ally: 'Trade ties: extra gold every week.' },
  };
  const PERS_IDS = Object.keys(LM.PERS);
  LM.ludiInit = (S) => {
    if (S.ludi && S.ludi.list && S.ludi.list.length === 4) return S.ludi;
    const r = LM.mulberry(LM.hash(S.seed + 'ludi')); const names = D.LUDI.slice(); const order = PERS_IDS.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const list = order.map((pers, i) => {
      const nm = names.splice(Math.floor(r() * names.length), 1)[0];
      return { id: 'L' + i, name: nm, owner: pick(D.FIRST, r) + ' ' + LM.PERS[pers].who, pers, rel: pers === 'honorable' ? 10 : 0, score: 0, str: 0.85 + r() * 0.35, ally: false, seen: 0, act: {} };
    });
    S.ludi = { list, hist: [], allyId: null };
    return S.ludi;
  };
  LM.ludiOf = (S, id) => LM.ludiInit(S).list.find((l) => l.id === id);
  LM.ludiMood = (l) => (l.ally ? 'Allied' : l.rel >= 60 ? 'Devoted' : l.rel >= 25 ? 'Friendly' : l.rel > -25 ? 'Neutral' : l.rel > -50 ? 'Cold' : 'Hostile');
  LM.ludiYouScore = (S, rec) => { const sl = S.sl || { wins: 0, tour: 0 }; const w = rec ? rec.wins : S.stats.wins - sl.wins, t = rec ? rec.tour : S.stats.tourneys - sl.tour; return w * 3 + t * 6; };
  LM.ludiTable = (S) => {
    const L = LM.ludiInit(S).list.map((l) => ({ id: l.id, name: l.name, score: Math.round(l.score), you: false, pers: l.pers }));
    L.push({ id: 'you', name: S.name || 'Your ludus', score: LM.ludiYouScore(S), you: true });
    return L.sort((a, b) => b.score - a.score);
  };
  LM.ludiCost = (S, kind) => { const ml = LM.maxLeague(S); return kind === 'gift' ? 40 + 20 * ml : kind === 'rumor' ? 30 : kind === 'ally' ? 150 + 60 * ml : 0; };
  /** why an action is not possible, or '' */
  LM.ludiWhy = (S, id, kind, g) => {
    const l = LM.ludiOf(S, id); if (!l) return 'Unknown ludus';
    if (kind === 'break') return l.ally ? '' : 'Not allied';
    if (l.act[kind] === S.week) return 'Done this week';
    const cost = LM.ludiCost(S, kind);
    if (S.gold < cost) return `Needs ${cost} gold`;
    if (kind === 'ally') { if (l.ally) return 'Already allied'; if (S.ludi.allyId) return 'You already have an ally'; if (l.rel < 60) return 'Needs regard 60'; }
    if (kind === 'spar') { if (l.rel <= -30) return 'They refuse to host you'; if (!g) return 'Pick a fighter'; if (g.inj > 0) return 'Injured'; if (g.en < 30) return 'Too tired'; }
    return '';
  };
  /** perform a diplomatic action. Returns {msg, rel} or an error string. */
  LM.ludiAct = (S, id, kind, g) => {
    const why = LM.ludiWhy(S, id, kind, g); if (why) return why;
    const l = LM.ludiOf(S, id), P = LM.PERS[l.pers]; let msg = '';
    const cost = LM.ludiCost(S, kind); S.gold -= cost; if (kind !== 'break') l.act[kind] = S.week; l.seen = S.week;
    const rel0 = l.rel;
    if (kind === 'gift') { l.rel = clamp(l.rel + P.gift, -100, 100); msg = `${l.owner} accepts your gift.${l.pers === 'brutal' ? ' He barely looks at it.' : l.pers === 'greedy' ? ' His eyes shine.' : ''}`; }
    else if (kind === 'spar') {
      const xp = Math.round((18 + 3 * g.lvl) * (l.pers === 'brutal' ? 1.5 : 1)); const up = LM.addXp(g, xp); g.en = clamp(g.en - (l.pers === 'brutal' ? 30 : 18), 0, 100);
      l.rel = clamp(l.rel + P.spar, -100, 100); let hurt = '';
      if (l.pers === 'brutal' && rnd() < 0.15) { g.inj = 1; hurt = ` ${g.name} limps home (injured 1 week).`; }
      msg = `${g.name} trains in the yard of ${l.name}: +${xp} XP${up.length ? ', LEVEL ' + up[up.length - 1] : ''}.${hurt}`;
    } else if (kind === 'rumor') {
      const caught = rnd() < (l.pers === 'cunning' ? 0.6 : l.pers === 'honorable' ? 0.45 : 0.3);
      l.score = Math.max(0, l.score - 4); l.rel = clamp(l.rel - (l.pers === 'honorable' ? 35 : 20), -100, 100);
      if (caught) { S.fame = Math.max(0, S.fame - 12); msg = `The rumor is traced to you. -12 fame, and ${l.name} will not forget.`; l.rel = clamp(l.rel - 10, -100, 100); } else msg = `Whispers hurt ${l.name} (-4 standing). Nobody knows it was you.`;
      if (l.ally) { l.ally = false; S.ludi.allyId = null; msg += ' The alliance is broken.'; }
    } else if (kind === 'ally') { l.ally = true; S.ludi.allyId = l.id; l.rel = clamp(l.rel + 5, -100, 100); msg = `${l.name} is now your ally. ${P.ally}`; }
    else if (kind === 'break') { l.ally = false; S.ludi.allyId = null; l.rel = clamp(l.rel - 30, -100, 100); msg = `You break with ${l.name}.`; }
    LM.forumAdd(S, msg.split('. ')[0] + '.');
    return { msg, rel: l.rel - rel0 };
  };
  LM.ludiWeek = (S, rep) => {
    const T = LM.ludiInit(S), ml = LM.maxLeague(S), season = Math.ceil(Math.max(1, S.week - 1) / 12);
    T.list.forEach((l) => {
      l.score += (1 + rnd() * 3) * l.str * (1 + 0.08 * (season - 1)) * (l.pers === 'brutal' ? 1.1 : 1);
      if (!l.ally) l.rel = clamp(l.rel + (l.rel > 0 ? -1 : l.rel < 0 ? 1 : 0) + (l.seen && S.week - l.seen >= 4 && l.rel < 40 && l.rel > 0 ? -1 : 0), -100, 100);
      if (l.ally) {
        if (l.pers === 'greedy') { const g = 20 + 8 * ml; S.gold += g; rep.income += g; rep.notes.push(`${l.name} trade ties: +${g} gold.`); }
        else if (l.pers === 'brutal') { const f = 5 + 2 * ml; S.fame += f; rep.notes.push(`${l.name} spreads your name: +${f} fame.`); }
        else if (l.pers === 'cunning') { S.spy = { until: Math.max((S.spy && S.spy.until) || 0, S.week + 1) }; rep.notes.push(`${l.name} spies keep an eye on the rivals (scouting +1).`); }
        else { S.glads.forEach((x) => { x.mo = clamp(x.mo + 4, 0, 100); x.en = clamp(x.en + 3, 0, 100); }); rep.notes.push(`${l.name} sends a bard and wine. Spirits rise.`); }
        l.rel = clamp(l.rel - 1, -100, 100);
        if (l.rel < 40) { l.ally = false; T.allyId = null; rep.notes.push(`The alliance with ${l.name} has cooled and ends.`); }
      } else if (l.rel <= -50 && S.week - (l.raid || -9) >= 3 && rnd() < 0.28) {
        l.raid = S.week; const gl = S.glads.filter((x) => x.inj <= 0);
        if (l.pers === 'cunning') { const loss = Math.min(Math.floor(S.gold * 0.1), 40 + 15 * ml); if (loss > 0) { S.gold -= loss; rep.notes.push(`${l.name} thieves picked the strongbox: -${loss} gold.`); } }
        else if (l.pers === 'brutal' && gl.length) { const x = pick(gl); x.en = clamp(x.en - 20, 0, 100); x.mo = clamp(x.mo - 6, 0, 100); rep.notes.push(`${l.name} thugs ambushed ${x.name} in the street (-20 energy).`); }
        else if (l.pers === 'greedy' && S.recruits && S.recruits.length) { const x = S.recruits.slice().sort((a, b) => LM.stars(b) - LM.stars(a))[0]; S.recruits = S.recruits.filter((r) => r !== x); rep.notes.push(`${l.name} bought ${x.name} out from under you.`); }
        else { S.fame = Math.max(0, S.fame - 3); rep.notes.push(`${l.owner} snubs you in the forum (-3 fame).`); }
      }
    });
    if (rep.recap) {
      const rows = LM.ludiTable(S).map((r) => (r.you ? Object.assign(r, { score: LM.ludiYouScore(S, rep.recap) }) : r)).sort((a, b) => b.score - a.score);
      const champ = rows[0]; T.hist.push({ season: rep.season - 1, champ: champ.name, you: !!champ.you, score: champ.score });
      if (T.hist.length > 12) T.hist.shift();
      if (champ.you && champ.score > 0) { const f = 40 + 15 * ml; S.fame += f; rep.notes.push(`Your ludus tops the season standings! +${f} fame.`); }
      else if (champ.score > 0) rep.notes.push(`${champ.name} tops the season standings.`);
      T.list.forEach((l) => { l.score = 0; });
    }
  };

  // =========================================================== 3. CALENDAR
  LM.calendar = (S) => {
    const base = Math.floor((S.week - 1) / 12) * 12, ml = LM.maxLeague(S), weeks = [];
    for (let i = 1; i <= 12; i++) {
      const week = base + i, fest = LM.festival(S, week), big = week % 12 === 0 ? 'grand' : week % 4 === 0 ? 'tourney' : null, team = week % 4 === 2;
      const entries = Object.keys(S.entries).filter((k) => k.split(':')[0] === String(week)).map((key) => {
        const tag = key.split(':')[2], title = tag === 'g' ? 'Grand Games' : tag === 't' ? 'Tournament' : tag === 'm' ? 'Team Clash' : 'Duel';
        return { key, title, ids: S.entries[key].ids.slice() };
      });
      weeks.push({ week, n: i, festival: fest ? { id: fest.id, n: fest.n, d: fest.d, c: fest.c } : null, big, team, entries, past: week < S.week, now: week === S.week, wx: LM.weather(S, `${week}:${ml}:d0`) });
    }
    return { season: Math.ceil(S.week / 12), start: base + 1, end: base + 12, weeks, league: ml };
  };

  // =========================================================== 4. BARRACKS: mentors and feasts
  LM.mentorSlots = (S) => 1 + (lvlOf(S, 'sparring') > 0 ? 1 : 0) + (lvlOf(S, 'barracks') >= 3 ? 1 : 0);
  LM.mentorWhy = (S, mId, pId) => {
    const m = S.glads.find((x) => x.id === mId), p = S.glads.find((x) => x.id === pId);
    if (!m || !p || m === p) return 'Pick two fighters';
    if (m.lvl < p.lvl + 3) return `${m.name} must be 3 levels above ${p.name}`;
    if ((S.mentors || []).some((x) => x.m === mId || x.p === mId || x.m === pId || x.p === pId)) return 'Already in a pair';
    if ((S.mentors || []).length >= LM.mentorSlots(S)) return 'No free mentor slot';
    return '';
  };
  LM.mentorStart = (S, mId, pId) => {
    const why = LM.mentorWhy(S, mId, pId); if (why) return why;
    S.mentors = S.mentors || []; S.mentors.push({ m: mId, p: pId, since: S.week, wk: 0 }); LM.addBond(S, mId, pId, 8); return '';
  };
  LM.mentorEnd = (S, pair, why) => { S.mentors = (S.mentors || []).filter((x) => !(x.m === pair.m && x.p === pair.p)); return why; };
  LM.mentorWeek = (S, rep) => {
    (S.mentors || []).slice().forEach((pr) => {
      const m = S.glads.find((x) => x.id === pr.m), p = S.glads.find((x) => x.id === pr.p);
      if (!m || !p) { LM.mentorEnd(S, pr, 'gone'); return; }
      if (m.inj > 0 || p.inj > 0) return;
      const xp = 8 + m.lvl; const up = LM.addXp(p, xp); pr.wk++; LM.addBond(S, m.id, p.id, 5); m.mo = clamp(m.mo + 2, 0, 100); p.mo = clamp(p.mo + 2, 0, 100);
      rep.notes.push(`${m.name} teaches ${p.name}: +${xp} XP${up.length ? ', LEVEL ' + up[up.length - 1] + '!' : ''}.`);
      if (p.lvl >= m.lvl - 1) { LM.mentorEnd(S, pr, 'grad'); LM.addBond(S, m.id, p.id, 10); S.fame += 10; LM.diary(S, p, `Graduated from the teaching of ${m.name}.`); rep.notes.push(`${p.name} has graduated from ${m.name}'s teaching. +10 fame.`); }
    });
  };
  LM.feastCost = (S, tier) => Math.round(S.glads.length * (tier === 'banquet' ? 20 : 8));
  LM.feastWhy = (S, tier) => {
    if (!S.glads.length) return 'No fighters'; if (S.feastWeek === S.week) return 'You already feasted this week';
    const c = LM.feastCost(S, tier); return S.gold < c ? `Needs ${c} gold` : '';
  };
  LM.feast = (S, tier) => {
    const why = LM.feastWhy(S, tier); if (why) return why;
    const b = tier === 'banquet'; S.gold -= LM.feastCost(S, tier); S.feastWeek = S.week;
    S.glads.forEach((x) => { x.mo = clamp(x.mo + (b ? 12 : 6), 0, 100); x.en = clamp(x.en + (b ? 8 : 0), 0, 100); if (x.grief) x.grief = Math.max(0, x.grief - (b ? 2 : 1)); });
    for (let i = 0; i < S.glads.length; i++) for (let j = i + 1; j < S.glads.length; j++) LM.addBond(S, S.glads[i].id, S.glads[j].id, b ? 3 : 1);
    return { msg: b ? 'A banquet for the whole ludus. Songs until dawn.' : 'A shared supper warms the barracks.' };
  };


  // =========================================================== 5. VENATIO: the beast hunts
  // Beasts are arena units with their own "styles" (non enumerable in D.STYLES so recruit and style pickers never list them). Stats go through the same
  // derive() as gladiators (mul/base per beast); the AI (pounce, pack flank, charge, trample, stomp, enrage) lives in core/arena.js beastThink.
  // No counter mechanics: a lion is not "weak to" a style, it is simply a different tempo with its own numbers.
  const BEASTS = D.BEASTS = {
    wolf: { n: 'Wolf', role: 'Pack hunter', c: '#8b919c', ai: 'pack', sz: 0.8, h: 0.95, range: 1.35, ms: 1.28, aps: 1.05, pelt: 'Wolf Pelt', val: 14,
      mul: { hp: 0.62, atk: 0.78, def: 0.7, spd: 1.1, crit: 1.05, eva: 1.25 }, base: { str: 9, agi: 14, end: 7, skl: 9, wil: 8 }, fur: '#7d838d', fur2: '#c9c6bd', mane: '#5f646d', enrage: null,
      names: ['Grey Shadow', 'Ashfang', 'Nightmaw', 'Duskhowl', 'Scar-ear', 'Lupa', 'Hunger', 'Silverback'],
      d: 'Hunts in packs. Circles at a distance, then rushes in from several sides and bites for bleeding wounds.',
      lore: ['Grey shapes at the edge of the sand. Wolves are never alone.', 'They bite and fade, bite and fade. Each wolf near the target makes every bite harder.', 'A wolf that sees its prey stunned or weak commits at once. Cut the pack down one at a time.', 'Roman hunters baited packs with a bleeding goat: the crowd loves the circling.'] },
    lion: { n: 'Lion', role: 'Ambusher', c: '#c8963c', ai: 'pounce', sz: 1.05, h: 1.4, range: 1.7, ms: 1.1, aps: 0.9, pelt: 'Lion Pelt', val: 32,
      mul: { hp: 1.0, atk: 1.18, def: 0.8, spd: 1.0, crit: 1.15, eva: 0.9 }, base: { str: 13, agi: 12, end: 9, skl: 10, wil: 10 }, fur: '#c69a52', fur2: '#e6cd9c', mane: '#6a4020', enrage: { at: 0.3, atk: 0.25, aps: 0.25, ms: 0.15 },
      names: ['Leo of Numidia', 'Scarmane', 'Goldjaw', 'Red Mane', 'Barbarus', 'Sahara', 'Ironpaw', 'Atlas'],
      d: 'Stalks in a circle, then leaps for a heavy pouncing strike with a bleeding bite. Enrages when badly hurt.',
      lore: ['The king of the Libyan sands. Its roar silences the stands.', 'It stalks at a distance until the leap is ready (about every 8 seconds). The pounce slows its victim.', 'After the leap it bites for bleeding and claws quickly. Keep wounds closed and the lion is just a big cat.', 'Under 30% health a lion goes wild: faster and harder. Finish it before it recovers its nerve.'] },
    bear: { n: 'Bear', role: 'Brute', c: '#6b4a32', ai: 'bear', sz: 1.35, h: 1.5, range: 1.9, ms: 0.82, aps: 0.65, pelt: 'Bear Pelt', val: 40,
      mul: { hp: 1.75, atk: 1.25, def: 1.1, spd: 0.8, crit: 0.8, eva: 0.5 }, base: { str: 15, agi: 6, end: 15, skl: 7, wil: 12 }, fur: '#5b3d28', fur2: '#7a5a3c', mane: '#3e2a1c', enrage: { at: 0.35, atk: 0.3, aps: 0.3, ms: 0.2 },
      names: ['Ursus', 'Dacian Bear', 'Old Grudge', 'Mountain King', 'Brownhide', 'Thrace Bear'],
      d: 'Slow and huge. Wide swipes hit everyone in reach, a mauling blow bleeds, and a rearing roar slows the hunters.',
      lore: ['A mountain of fur from the Caledonian woods.', 'It swings wide: everyone near the target is hit. Spread out when it rears up.', 'Every third blow is a mauling that bleeds. Its roar at 65% health slows hunters for three seconds.', 'Slow on its feet. Kiting a bear, or hitting from two sides, wins the fight long before the enrage.'] },
    boar: { n: 'Boar', role: 'Charger', c: '#4e4038', ai: 'boar', sz: 1.0, h: 1.0, range: 1.4, ms: 1.0, aps: 0.8, pelt: 'Boar Hide', val: 22,
      mul: { hp: 1.25, atk: 1.0, def: 1.15, spd: 0.9, crit: 0.7, eva: 0.6 }, base: { str: 12, agi: 8, end: 13, skl: 6, wil: 12 }, fur: '#4a3d34', fur2: '#6b5a4a', mane: '#2e2520', enrage: { at: 0.4, atk: 0.3, aps: 0.2, ms: 0.25 },
      names: ['Calydon', 'Tuskborn', 'Ironbristle', 'Erymanthus', 'Mudcrown', 'Black Tusk'],
      d: 'Paws the sand, then charges in a straight line and knocks a hunter off their feet. Gores for bleeding up close.',
      lore: ['Bristling, short-tempered, built like a battering ram.', 'It telegraphs its charge: half a second of pawing. Step out of the line and it runs past.', 'After a charge it is winded for a moment. That is the time to strike.', 'Wounded boars charge more often and hit harder. Never ignore one at the edge of the ring.'] },
    nemean: { n: 'Nemean Lion', role: 'Boss', c: '#e8c35a', ai: 'pounce', sz: 1.8, h: 2.4, range: 2.4, ms: 1.0, aps: 0.8, boss: true, pelt: 'Nemean Hide', val: 260,
      mul: { hp: 2.9, atk: 1.35, def: 1.7, spd: 1.0, crit: 0.9, eva: 0.6 }, base: { str: 16, agi: 12, end: 15, skl: 11, wil: 16 }, fur: '#d9b24a', fur2: '#f0dc9a', mane: '#3b2412', enrage: { at: 0.5, atk: 0.3, aps: 0.3, ms: 0.25 },
      names: ['The Nemean Lion'],
      d: 'The golden-hided lion of legend. Armored hide, mauling combos, bleeding pounce, a roar that slows. Enrages at half health.',
      lore: ['A lion twice the size of any other, with fur that glints like bronze.', 'Its hide turns blades: it has far more armor than any beast, so strong weapons and armor-piercing skills matter.', 'Every fourth attack is a three-hit maul. Its roar at 75% health slows everyone nearby.', 'At half health it goes berserk. Bring three hunters, keep ultimates for the enrage.'] },
    elephant: { n: 'War Elephant', role: 'Boss', c: '#8f8a84', ai: 'trample', sz: 2.3, h: 3.6, range: 2.7, ms: 0.85, aps: 0.55, boss: true, pelt: 'Elephant Hide', val: 300,
      mul: { hp: 3.7, atk: 1.5, def: 1.3, spd: 0.9, crit: 0.7, eva: 0.3 }, base: { str: 18, agi: 6, end: 18, skl: 8, wil: 16 }, fur: '#8a8782', fur2: '#a9a49a', mane: '#6a6761', enrage: { at: 0.35, atk: 0.3, aps: 0.35, ms: 0.3 },
      names: ["Hannibal's Heir", 'Pyrrhus', 'Gaetulian Titan', 'Surus'],
      d: 'A war elephant with a handler in the howdah. Trample charge, ground-shaking stomp, trunk swats and thrown javelins.',
      lore: ['Carried over the Alps by Carthage. The ground trembles under it.', 'The handler on its back throws javelins every few seconds at anyone staying out of reach.', 'It telegraphs the trample for almost a second. Run perpendicular. The stomp slows everyone within 3.5 metres.', 'Under 35% health it charges twice as often. Burst it down.'] },
  };
  D.BEAST_IDS = Object.keys(BEASTS);
  for (const id of D.BEAST_IDS) { const B = BEASTS[id]; Object.defineProperty(D.STYLES, id, { value: { id, n: B.n, role: B.role, c: B.c, d: B.d, mul: B.mul, base: B.base, beats: [], sig: null, beast: true }, enumerable: false, writable: true, configurable: true }); }
  D.BEAST_TROPHIES = {
    lionmane: { n: "Lion's Mane", kind: 'lion', ch: 0.14, fame: 1, d: 'A golden mane nailed above the gate.' },
    wolffang: { n: "Alpha's Fang", kind: 'wolf', ch: 0.08, fame: 1, d: 'The fang of a pack leader on a leather cord.' },
    bearclaw: { n: 'Bear Claw Necklace', kind: 'bear', ch: 0.14, fame: 1, d: 'Claws as long as a dagger.' },
    boartusk: { n: 'Calydonian Tusk', kind: 'boar', ch: 0.12, fame: 1, d: 'A curved tusk, polished and mounted.' },
    nemeanhide: { n: 'Nemean Hide', kind: 'nemean', ch: 1, fame: 4, d: 'The golden pelt no blade could cut. The whole city talks of it.' },
    ivory: { n: 'War Elephant Ivory', kind: 'elephant', ch: 1, fame: 4, d: 'A tusk taller than a man.' },
  };
  // hunts: kinds = [kind, count]; party = fighters you send; min = league needed (a festival of Mars, Bacchus or the Imperial Visit opens one league early); g/f = gold / fame multipliers of the league purse
  D.HUNTS = {
    wolves: { n: 'Wolf pack', party: 1, kinds: [['wolf', 3]], lo: -1, min: 0, g: 1.1, f: 0.9, pw: 1.0, risk: 1, d: 'Three wolves circle and rush from every side. One fighter, no cover.' },
    boars: { n: 'Boar drive', party: 1, kinds: [['boar', 2]], lo: 0, min: 0, g: 1.25, f: 1.0, pw: 0.58, risk: 1, d: 'Two boars charge in turns. Learn to sidestep.' },
    lion: { n: "Lion's den", party: 1, kinds: [['lion', 1]], lo: 1, min: 0, g: 1.4, f: 1.2, pw: 1.02, risk: 2, d: 'A single lion: stalks, leaps, bites. The classic.' },
    bears: { n: 'Bear pit', party: 2, kinds: [['bear', 1], ['wolf', 2]], lo: 0, min: 1, g: 1.9, f: 1.5, pw: 1.2, risk: 2, d: 'A bear with two wolves at its heels. Bring a partner.' },
    pride: { n: 'The pride', party: 2, kinds: [['lion', 2], ['wolf', 1]], lo: 0, min: 1, g: 2.1, f: 1.7, pw: 1.15, risk: 2, d: 'Two lions leap in turns. Bring a partner.' },
    menagerie: { n: 'Menagerie release', party: 3, kinds: [['lion', 1], ['bear', 1], ['boar', 2]], lo: 0, min: 2, g: 3.2, f: 2.4, pw: 0.95, risk: 3, d: 'The keepers open every cage. Three fighters, four beasts.' },
    nemean: { n: 'The Nemean Lion', party: 3, kinds: [['nemean', 1], ['wolf', 2]], lo: 1, min: 2, g: 4.4, f: 3.4, pw: 1.1, risk: 3, boss: true, d: 'The golden lion of legend and two wolves of its court.' },
    elephant: { n: 'War elephant', party: 3, kinds: [['elephant', 1]], lo: 1, min: 2, g: 4.6, f: 3.6, pw: 0.9, risk: 3, boss: true, d: 'A war elephant, a handler with javelins, and a ground that shakes.' },
  };
  D.HUNT_IDS = Object.keys(D.HUNTS);
  const BEAST_FEST = ['mars', 'jupiter', 'bacchus'];
  const emptyV = () => ({ week: 0, hunts: 0, wins: 0, losses: 0, kills: {}, seen: {}, first: {}, pelts: {}, trophies: [], bossKills: {}, felled: 0, best: 0 });
  /** the Venatio record on the save (created on demand, added to migrate below) */
  LM.venatio = (S) => { if (!S.venatio) S.venatio = emptyV(); const V = S.venatio; for (const k of ['kills', 'seen', 'first', 'pelts', 'bossKills']) V[k] = V[k] || {}; V.trophies = V.trophies || []; return V; };
  LM.beastFest = (S) => BEAST_FEST.includes(LM.fest(S, S.week));
  /** can the ludus send hunters this week? Needs the Stands (level 1), the Provincial Games league, or a festival that calls for beasts. */
  LM.venatioState = (S) => {
    const V = LM.venatio(S), ml = LM.maxLeague(S), st = lvlOf(S, 'stands'), fest = LM.beastFest(S);
    const via = st >= 1 ? 'stands' : ml >= 1 ? 'league' : fest ? 'festival' : '';
    if (!via) return { ok: false, used: false, via, why: 'Build the Stands, reach the Provincial Games (120 fame), or wait for a festival of Mars, Bacchus or the Imperial Visit.' };
    if (!S.glads.length) return { ok: false, used: false, via, why: 'You have no fighters.' };
    if (V.week === S.week) return { ok: false, used: true, via, why: 'The beasts are already dealt with this week.' };
    return { ok: true, used: false, via, why: '', fest };
  };
  LM.huntLevel = (S, h) => Math.max(1, 1 + LM.maxLeague(S) * 3 + Math.floor((S.week - 1) / 12) + h.lo + (h.boss ? 1 : 0));
  /** hunts on offer this week */
  LM.venatioHunts = (S) => {
    const ml = LM.maxLeague(S) + (LM.beastFest(S) ? 1 : 0), L0 = D.LEAGUES[LM.maxLeague(S)];
    return D.HUNT_IDS.filter((id) => D.HUNTS[id].min <= ml).map((id) => {
      const h = D.HUNTS[id], lvl = LM.huntLevel(S, h);
      return Object.assign({ id, key: `hunt${S.week}:${id}`, lvl, gold: Math.round(L0.purse * h.g * (LM.beastFest(S) ? 1.25 : 1)), fame: Math.max(4, Math.round(L0.fameWin * h.f * (LM.beastFest(S) ? 1.25 : 1))) }, h);
    });
  };
  /** one beast record, shaped like a gladiator record so mkUnits / derive / odds / the portrait renderer take it unchanged */
  LM.makeBeast = (kind, lvl, o) => {
    o = o || {}; const B = BEASTS[kind], r = o.r || rnd; lvl = Math.max(1, Math.round(lvl));
    const g = { id: o.id || 'b:' + kind + ':' + lvl + ':' + Math.floor(r() * 1e6), name: o.name || pick(B.names, r), nick: '', style: kind, beast: kind, boss: !!B.boss, lvl, xp: 0, st: {}, tal: {}, trait: '', techs: [], pend: [], gear: {}, mast: [], ult2: null, rune: null, en: 100, mo: 70, inj: 0, act: 'rest', rec: { w: 0, l: 0 }, fame: 0, color: null, skin: B.fur, hair: B.mane, plume: B.fur2, face: 0, look: { coat: r(), mane: r(), scar: r() }, pw: o.pw || 1 };
    const sb = D.STATS.reduce((a, k) => a + B.base[k], 0), pts = lvl * 4.5 * (o.power == null ? 0.9 : o.power);
    D.STATS.forEach((k) => { g.tal[k] = 1; g.st[k] = B.base[k] * (0.92 + r() * 0.16); });
    for (let l = 2; l <= lvl; l++) D.STATS.forEach((k) => { g.st[k] += LM.levelGain(null, g, k); });
    D.STATS.forEach((k) => { g.st[k] += (pts * B.base[k]) / sb; });
    return g;
  };
  /** the beasts of a hunt (stable for the week: seeded by the save seed and the hunt key) */
  LM.huntBeasts = (S, h) => {
    const r = LM.mulberry(LM.hash(S.seed + h.key)), out = []; let n = 0;
    h.kinds.forEach(([kind, cnt]) => { for (let i = 0; i < cnt; i++) out.push(LM.makeBeast(kind, h.lvl, { r, id: `${h.key}#${n++}`, power: h.boss && kind !== 'wolf' ? 1.0 : 0.9, pw: (h.pw || 1) * (BEASTS[kind].pw || 1) })); });
    return out;
  };
  const wlvl = (S) => lvlOf(S, 'stands');
  /** settle a finished hunt. res: {win, F} from fightResult. Pays gold and fame, drops pelts and trophies, records the bestiary, XP and injuries. */
  LM.venatioSettle = (S, h, glads, res) => {
    const V = LM.venatio(S), ml = LM.maxLeague(S), win = !!res.win, units = (res.F && res.F.units) || [];
    const beasts = units.filter((u) => u.beast), slain = beasts.filter((u) => u.down);
    V.hunts++; if (win) V.wins++; else V.losses++; V.week = S.week;
    const rep = { win, gold: 0, fame: 0, pelts: {}, trophies: [], item: null, xp: 0, up: [], inj: [], kills: {}, notes: [] };
    beasts.forEach((u) => { V.seen[u.beast] = (V.seen[u.beast] || 0) + 1; });
    slain.forEach((u) => { V.kills[u.beast] = (V.kills[u.beast] || 0) + 1; rep.kills[u.beast] = (rep.kills[u.beast] || 0) + 1; if (V.first[u.beast] == null) V.first[u.beast] = S.week; if (BEASTS[u.beast].boss) V.bossKills[u.beast] = (V.bossKills[u.beast] || 0) + 1; });
    V.felled += slain.length;
    const fm = (LM.beastFest(S) ? 1.25 : 1) * (1 + wlvl(S) * 0.04);
    const frac = win ? 1 : slain.length / Math.max(1, beasts.length) * 0.5;
    rep.gold = Math.round(h.gold * frac * LM.diffGold(S) * (1 + 0.1 * ((S.perks || {}).gold || 0)) * (1 + LM.bfx(S, 'stands').v * 0.5)); rep.fame = Math.round(h.fame * frac * fm);
    S.gold += rep.gold; S.fame += rep.fame; V.best = Math.max(V.best, win ? h.risk : 0);
    // pelts (every beast slain; a lost hunt keeps half), trophies (kind chance; bosses always, once)
    slain.forEach((u) => { if (win || rnd() < 0.5) { V.pelts[u.beast] = (V.pelts[u.beast] || 0) + 1; rep.pelts[u.beast] = (rep.pelts[u.beast] || 0) + 1; } });
    if (win) {
      for (const id in D.BEAST_TROPHIES) {
        const T = D.BEAST_TROPHIES[id]; if (!slain.some((u) => u.beast === T.kind)) continue;
        if (rnd() < T.ch * (1 + 0.05 * lvlOf(S, 'shrine'))) { if (V.trophies.includes(id)) { S.gold += 40; rep.gold += 40; rep.notes.push(`A second ${T.n}: sold for 40 gold.`); } else { V.trophies.push(id); rep.trophies.push(id); } }
      }
      const bossH = !!h.boss, itemCh = bossH ? 1 : h.risk >= 2 ? 0.2 : 0.1;
      if (rnd() < itemCh) { const it = LM.genItem(rnd, { league: ml, ilvl: 4 + ml * 5 + Math.floor(S.week / 6), rar: bossH ? 3 + (rnd() < 0.35 ? 1 : 0) : 2, luck: LM.bfx(S, 'shrine').v }), sold = LM.addItem(S, it); rep.item = it; if (sold) rep.notes.push(`Armory full: sold ${sold.name}.`); }
    }
    // fighters: XP, energy and injuries
    rep.xp = Math.round((10 + 8 * h.risk + 4 * beasts.length) * (win ? 1 : 0.5));
    glads.forEach((g) => {
      const ups = LM.addXp(g, rep.xp); if (ups.length) rep.up.push({ id: g.id, lvl: ups[ups.length - 1] });
      const u = units.find((x) => x.g && x.g.id === g.id), hpf = u ? u.hp / u.maxhp : 1;
      if ((!win && rnd() < 0.5) || (win && hpf < 0.3 && rnd() < 0.2)) { g.inj = 1 + Math.floor(rnd() * 2); rep.inj.push({ id: g.id, name: g.name, w: g.inj }); }
      if (win && g.rec) g.rec.w++; else if (g.rec) g.rec.l++;
    });
    if (win) LM.forumAdd(S, `${glads.map((g) => g.name).join(' & ')} won the ${h.n} hunt${rep.trophies.length ? ' and brought home a trophy' : ''}.`);
    S.stats.hunts = (S.stats.hunts || 0) + 1;
    return rep;
  };
  LM.pelt = (kind) => BEASTS[kind].pelt;
  LM.peltValue = (S, kind) => Math.round(BEASTS[kind].val * (1 + 0.1 * lvlOf(S, 'market')));
  LM.sellPelts = (S, kind) => { const V = LM.venatio(S), n = V.pelts[kind] || 0; if (!n) return 0; const g = n * LM.peltValue(S, kind); V.pelts[kind] = 0; S.gold += g; return g; };
  /** bestiary page data: what you know grows with kills (stats after 1 kill, tactics after 3) */
  LM.bestiary = (S) => {
    const V = LM.venatio(S);
    return D.BEAST_IDS.map((kind) => {
      const B = BEASTS[kind], kills = V.kills[kind] || 0, seen = V.seen[kind] || 0, known = kills > 0 || seen > 0, tier = kills >= 6 ? 3 : kills >= 3 ? 2 : kills >= 1 ? 1 : 0;
      const sample = LM.makeBeast(kind, 5, { r: LM.mulberry(LM.hash('bestiary' + kind)), id: 'sample' }), d = LM.derive(sample, { noperf: true });
      return { kind, n: B.n, role: B.role, c: B.c, boss: !!B.boss, known, seen, kills, first: V.first[kind], pelts: V.pelts[kind] || 0, peltName: B.pelt, peltValue: LM.peltValue(S, kind),
        tier, lore: B.lore.slice(0, known ? 1 + tier : 0), d: known ? B.d : 'Not yet met in the arena.', stats: kills >= 1 ? { hp: Math.round(d.hp), atk: Math.round(d.atk), def: Math.round(d.def), spd: Math.round(d.spd) } : null,
        trophies: Object.keys(D.BEAST_TROPHIES).filter((id) => D.BEAST_TROPHIES[id].kind === kind).map((id) => ({ id, n: D.BEAST_TROPHIES[id].n, d: D.BEAST_TROPHIES[id].d, own: V.trophies.includes(id) })), sample };
    });
  };
  LM.trophyFame = (S) => LM.venatio(S).trophies.reduce((a, id) => a + (D.BEAST_TROPHIES[id] ? D.BEAST_TROPHIES[id].fame : 0), 0);
  LM.venatioWeek = (S, rep) => { const f = LM.trophyFame(S); if (f > 0) { S.fame += f; rep.notes.push(`The trophy hall draws crowds: +${f} fame.`); } };
  // beasts have no gladiator ultimates
  const ultsOf0 = LM.ultsOf; LM.ultsOf = (g) => (g && g.beast ? [] : ultsOf0(g));
  const migrate0 = LM.migrate; LM.migrate = (S) => { const N = migrate0(S); LM.venatio(N); return N; };

  // =========================================================== weekly hook (called by sim.js weekFinish)
  LM.extWeek = (S, rep) => {
    S.glads.forEach((g) => { if (g.grief > 0) { g.mo = clamp(g.mo - 3, 0, 100); g.grief--; if (g.grief === 0) rep.notes.push(`${g.name} grieves less. The ludus finds its footing.`); } });
    const lf = LM.legacyFame(S); if (lf) { S.fame += lf; rep.notes.push(`The memorial wall draws pilgrims: +${lf} fame.`); }
    LM.mentorWeek(S, rep); LM.ludiWeek(S, rep); LM.venatioWeek(S, rep);
  };
  // founding a new ludus keeps the memorial wall
  const ascend0 = LM.ascend;
  LM.ascend = (S) => { const N = ascend0(S); N.fallen = (S.fallen || []).slice(); return N; };

  // =========================================================== QA: save versioning, validation, recovery, export/import
  // S.v stays 1 (the format marker the loader and old saves rely on). S.sv is the schema version inside it: bump LM.SAVE_VER and add a step to
  // LM.SAVE_STEPS whenever a field changes meaning. A save from the future (sv > SAVE_VER) still loads, flagged "newer".
  // Storage keys are NEVER renamed: the live key is ludus_maximus_3d_v1; the backup and corrupt stash below are extra keys.
  const KEY = 'ludus_maximus_3d_v1', BAK = KEY + '_backup', BAD = KEY + '_corrupt';
  LM.SAVE_KEY = KEY; LM.SAVE_VER = 2;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  LM.SAVE_STEPS = {
    1: (S) => { // 1 -> 2: every container the 3D layer reads is guaranteed to exist
      S.opts = isObj(S.opts) ? S.opts : {}; S.flags = isObj(S.flags) ? S.flags : {}; S.fallen = Array.isArray(S.fallen) ? S.fallen : []; S.mentors = Array.isArray(S.mentors) ? S.mentors : [];
      if (!S.ludi || !Array.isArray(S.ludi.list)) { try { LM.ludiInit(S); } catch (e) { delete S.ludi; } }
      return S;
    },
  };
  /** make a parsed save structurally safe. Returns the list of repairs made (empty = it was clean). Mutates S. */
  LM.sanitize = (S) => {
    const fixed = [], note = (m) => fixed.push(m);
    for (const [k, d] of [['gold', 0], ['fame', 0], ['laurels', 0], ['week', 1], ['season', 1], ['nextId', 1], ['rows', 2]]) if (!fin(S[k])) { note(k + ' was not a number'); S[k] = d; }
    S.week = Math.max(1, Math.floor(S.week)); S.season = Math.max(1, Math.floor(S.season)); S.gold = Math.max(0, S.gold);
    if (typeof S.name !== 'string' || !S.name.trim()) { note('name'); S.name = 'Ludus Maximus'; }
    S.name = S.name.slice(0, 40);
    if (!fin(S.color) || S.color < 0 || S.color >= (D.COLORS || []).length) { note('color'); S.color = 0; }
    for (const k of ['fac', 'sl', 'perks', 'entries', 'rivals', 'bonds', 'trophies', 'stats', 'flags', 'opts']) if (!isObj(S[k])) { if (S[k] !== undefined) note(k + ' was not an object'); S[k] = {}; }
    for (const k of Object.keys(S.entries)) { const e = S.entries[k]; // PLAN: an entry keeps its old stance string and may carry an optional battle plan (no schema bump: both are read defensively)
      if (!isObj(e) || !Array.isArray(e.ids)) { note('entry ' + k + ' was unreadable'); delete S.entries[k]; continue; }
      if (!LM.STANCE[e.stance]) e.stance = 'bal'; if (e.plan !== undefined && !(isObj(e.plan) && LM.FORMS[e.plan.form] && isObj(e.plan.roles))) delete e.plan; }
    for (const k of ['glads', 'items', 'relics', 'relicOn', 'contracts', 'legends']) if (!Array.isArray(S[k])) { if (S[k] !== undefined) note(k + ' was not a list'); S[k] = []; }
    if (!Array.isArray(S.plots)) { note('plots'); S.plots = []; }
    while (S.plots.length < 16) S.plots.push(null); S.plots = S.plots.slice(0, 16).map((p) => (p && typeof p === 'object' && D.BUILD[p.b] && fin(p.l) ? p : null));
    for (const k of ['sen', 'mer', 'ple']) if (!fin(S.fac[k])) S.fac[k] = 0;
    for (const k of ['fights', 'wins', 'losses', 'tourneys', 'spares', 'weeks', 'contracts']) if (!fin(S.stats[k])) S.stats[k] = 0;
    const seen = new Set(), keep = [];
    for (const g of S.glads) {
      if (!isObj(g) || !D.STYLES[g.style] || !isObj(g.st) || !fin(g.id) || seen.has(g.id)) { note('dropped an unreadable gladiator'); continue; }
      seen.add(g.id);
      if (!isObj(g.tal)) g.tal = {}; if (!Array.isArray(g.techs)) g.techs = [D.STYLES[g.style].sig]; if (!isObj(g.gear)) g.gear = {}; if (!isObj(g.rec)) g.rec = { w: 0, l: 0 };
      if (typeof g.name !== 'string' || !g.name) g.name = 'Gladiator'; if (typeof g.act !== 'string') g.act = 'rest';
      D.STATS.forEach((st) => { if (!fin(g.st[st])) g.st[st] = D.STYLES[g.style].base[st]; if (!fin(g.tal[st])) g.tal[st] = 1; });
      g.lvl = fin(g.lvl) ? Math.max(1, Math.floor(g.lvl)) : 1; g.xp = fin(g.xp) ? Math.max(0, g.xp) : 0;
      g.en = fin(g.en) ? clamp(g.en, 0, 100) : 100; g.mo = fin(g.mo) ? clamp(g.mo, 0, 100) : 70; g.inj = fin(g.inj) ? Math.max(0, g.inj) : 0;
      keep.push(g);
    }
    S.glads = keep; S.nextId = Math.max(S.nextId, 1 + Math.max(0, ...keep.map((g) => g.id)));
    S.items = S.items.filter((it) => isObj(it)); // gear: a non-object entry would crash every list
    return fixed;
  };
  const migrateQ = LM.migrate;
  LM.migrate = (S) => {
    LM.sanitize(S); const from = fin(S.sv) ? S.sv : 1;
    let N = migrateQ(S);
    for (let v = from; v < LM.SAVE_VER; v++) if (LM.SAVE_STEPS[v]) N = LM.SAVE_STEPS[v](N) || N;
    if (from < LM.SAVE_VER) N.sv = LM.SAVE_VER; else if (!fin(N.sv)) N.sv = LM.SAVE_VER;
    return N;
  };
  const store = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const fetchRaw = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  /** try to rescue a damaged save text: parse as is, then close a truncated document. Returns a migrated save or null. */
  LM.salvage = (raw) => {
    if (typeof raw !== 'string' || raw.length < 20) return null;
    const take = (o) => { try { if (o && isObj(o.save) && !o.plots) o = o.save; /* file envelope */ return o && o.v === 1 && Array.isArray(o.plots) && Array.isArray(o.glads) && fin(o.week) && fin(o.gold) ? LM.migrate(o) : null; /* a rescue must contain real progress, not just brackets */ } catch (e) { return null; } };
    try { const r = take(JSON.parse(raw)); if (r) return r; } catch (e) { /* fall through to truncation repair */ }
    // walk the text, remember open brackets, then cut back to a clean boundary and close them
    let stack = [], inStr = false, esc = false, cuts = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{' || c === '[') stack.push(c); else if (c === '}' || c === ']') stack.pop(); else if (c === ',') cuts.push([i, stack.slice()]);
    }
    for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 60; k--, tries++) {
      const [i, st] = cuts[k]; const txt = raw.slice(0, i) + st.slice().reverse().map((b) => (b === '{' ? '}' : ']')).join('');
      try { const r = take(JSON.parse(txt)); if (r) return r; } catch (e) { /* keep cutting back */ }
    }
    return null;
  };
  /** inspect the stored save: {status: none|ok|migrated|newer|corrupt, S, raw, from, repairs, err} */
  LM.loadEx = () => {
    const raw = fetchRaw(KEY); if (!raw) return { status: 'none', S: null, raw: null };
    let o; try { o = JSON.parse(raw); } catch (e) { return { status: 'corrupt', S: null, raw, err: 'The save is not valid JSON (' + String(e.message).slice(0, 80) + ').' }; }
    if (!isObj(o) || o.v !== 1 || !Array.isArray(o.plots)) return { status: 'corrupt', S: null, raw, err: 'The save is missing its core data.' };
    const from = fin(o.sv) ? o.sv : 1, repairs = LM.sanitize(o);
    let S; try { S = LM.migrate(o); } catch (e) { return { status: 'corrupt', S: null, raw, err: 'Upgrading the save failed: ' + String(e.message).slice(0, 80) }; }
    if (from < LM.SAVE_VER && !fetchRaw(BAK)) store(BAK, raw); // keep the pre-upgrade copy once
    return { status: from > LM.SAVE_VER ? 'newer' : from < LM.SAVE_VER ? 'migrated' : 'ok', S, raw, from, repairs };
  };
  LM.load = () => LM.loadEx().S;
  LM.hasBackup = () => !!fetchRaw(BAK);
  LM.loadBackup = () => { const raw = fetchRaw(BAK); return raw ? LM.salvage(raw) : null; };
  /** move a damaged save aside (so nothing is lost) and clear the live key; returns true when the stash was written */
  LM.stashCorrupt = (raw) => { const ok = store(BAD, raw); store(KEY, null); return ok; };
  LM.corruptRaw = () => fetchRaw(BAD);
  LM.save = (S) => { try { if (S) S.sv = LM.SAVE_VER; localStorage.setItem(KEY, JSON.stringify(S)); LM.saveError = null; return true; } catch (e) { LM.saveError = e; return false; } };
  /** a plain JSON file for download: {game, sv, exported, save} */
  LM.exportFile = (S) => JSON.stringify({ game: 'ludus_maximus_3d', sv: LM.SAVE_VER, exported: new Date().toISOString().slice(0, 19) + 'Z', save: S }, null, 1);
  /** parse an imported file or pasted text. Accepts the file envelope, a bare save object, or the old base64 code. Returns {S} or {err} */
  LM.parseImport = (text) => {
    text = String(text || '').trim(); if (!text) return { err: 'The file is empty.' };
    if (text.length > 8e6) return { err: 'That file is far too large to be a save.' };
    let o = null;
    if (text[0] === '{') { try { o = JSON.parse(text); } catch (e) { const r = LM.salvage(text); return r ? { S: r, repaired: true } : { err: 'That file is not valid JSON.' }; } }
    else { const S = LM.importCode(text); return S ? { S } : { err: 'That is not a Ludus Maximus save code or file.' }; }
    if (isObj(o) && o.game && o.game !== 'ludus_maximus_3d') return { err: 'That file belongs to another game.' };
    const save = isObj(o) && isObj(o.save) ? o.save : o;
    if (!isObj(save) || save.v !== 1 || !Array.isArray(save.plots)) return { err: 'That file does not contain a Ludus Maximus save.' };
    try { LM.sanitize(save); return { S: LM.migrate(save), newer: fin(save.sv) && save.sv > LM.SAVE_VER }; } catch (e) { return { err: 'The save could not be read: ' + String(e.message).slice(0, 80) }; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ===========================================================================================================================
// WAVE 2: body-part wounds and scars, patron contracts, the deep event deck. Pure sim, no DOM. State on S:
//   g.wounds [{id, part, w, w0, tr, rest}]  g.inj = longest wound in weeks (old code keeps working)  g.weak {w, mods}  g.scars [ids from D.SCARS]
//   S.spons {active, offers, done, rel, cool, hist, beatQ}      S.evHist S.evLog S.evQ S.evFlags S.evStatus S.evCtx
// Nothing here uses the sim RNG for injuries or scars (hash rolls keyed on the save seed), so old seeded tests are unaffected.
// ===========================================================================================================================
(function (G) {
  const D = G.LM_D, LM = G.LM;
  if (!LM || LM.addWound) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = () => LM.rand();
  const lvlOf = (S, id) => LM.bfx(S, id).l;
  const det = (S, ...p) => LM.mulberry(LM.hash(String(S.seed) + '|' + p.join('|')));
  const ml0 = (S) => LM.maxLeague(S);
  const cost2 = (S, c) => Math.round(c[0] + c[1] * ml0(S));
  const PLAN_SC = { ease: 1, rest: 0.8, pou: 0.85, doc: 0.45, surg: 0.12 };

  // =========================================================== 1. WOUNDS AND SCARS
  LM.MAX_SCARS = 5;
  LM.bodyMods = (g) => {
    const m = {}; let any = false;
    (g.scars || []).forEach((id) => { const s = D.SCARS[id]; if (s) for (const k in s.mods) { m[k] = (m[k] || 0) + s.mods[k]; any = true; } });
    if (g.weak && g.weak.w > 0) for (const k in g.weak.mods) { m[k] = (m[k] || 0) + g.weak.mods[k]; any = true; }
    return any ? m : null;
  };
  LM.scarFame = (g) => (g.scars || []).reduce((a, id) => a + ((D.SCARS[id] || {}).fame || 0), 0);
  const derive0 = LM.derive;
  LM.derive = (g, ctx) => {
    const d = derive0(g, ctx), m = LM.bodyMods(g); if (!m) return d;
    for (const k of ['hp', 'atk', 'def', 'spd']) if (m[k]) d[k] *= 1 + m[k];
    if (m.crit) d.crit = clamp(d.crit + m.crit, 0, 0.6); if (m.eva) d.eva = clamp(d.eva + m.eva, 0, 0.4);
    return d;
  };
  /** one line per effect for tooltips and pickers, e.g. ['-8% attack', '+3% crit'] */
  LM.modText = (m) => {
    const N = { hp: 'health', atk: 'damage', def: 'armor', spd: 'speed', crit: 'crit chance', eva: 'dodge' }, out = [];
    for (const k in m) if (m[k]) out.push(`${m[k] > 0 ? '+' : '-'}${Math.round(Math.abs(m[k]) * 100)}% ${N[k]}`);
    return out;
  };
  LM.woundOf = (g) => (g.wounds || []).slice().sort((a, b) => b.w - a.w)[0] || null;

  let wseq = 1;
  LM.addWound = (S, g, part, w, o) => {
    o = o || {}; g.wounds = g.wounds || []; const P = D.WOUNDS[part] || D.WOUNDS.gash;
    const wd = { id: S.wseq = (S.wseq || wseq++) + 1, part: D.WOUNDS[part] ? part : 'gash', w: clamp(Math.round(w), 1, 9), tr: null, rest: false, wk: S.week };
    wd.w0 = wd.w; g.wounds.push(wd); g.inj = Math.max(g.inj || 0, wd.w); LM.diary(S, g, `${P.n}${wd.w > 1 ? ` (${wd.w} weeks)` : ''}.`);
    return wd;
  };
  /** which part gets hurt: hash roll, heavier tails when the fighter was nearly dead */
  LM.woundPart = (S, g, salt, hpf) => {
    const r = det(S, 'wpart', g.id, S.week, salt, (S.stats || {}).fights || 0), W = { gash: 3, ribs: 2, arm: 1.5, knee: 1.5, head: 1.2, eye: 0.25 };
    if (hpf != null && hpf < 0.25) { W.eye *= 3; W.head *= 1.6; W.arm *= 1.5; W.gash *= 0.6; }
    const tot = Object.values(W).reduce((a, b) => a + b, 0); let x = r() * tot;
    for (const k in W) { x -= W[k]; if (x < 0) return k; } return 'gash';
  };
  /** a new injury of base weeks w (1 to 3 in the old scale) to a random part. Returns the wound. */
  LM.woundGive = (S, g, w, part, hpf) => {
    part = part && part !== 'any' ? part : LM.woundPart(S, g, w, hpf); const P = D.WOUNDS[part];
    return LM.addWound(S, g, part, clamp(Math.round(w * P.k), 1, 8));
  };
  /** keep wounds consistent when old code sets or lowers g.inj directly (brawls, visitors, tests) */
  LM.syncWounds = (S, g) => {
    g.wounds = g.wounds || []; const mx = g.wounds.reduce((a, b) => Math.max(a, b.w), 0), inj = Math.max(0, g.inj || 0);
    if (inj > mx) {
      const top = LM.woundOf(g);
      if (top) { top.w = inj; top.w0 = Math.max(top.w0, inj); top.tr = null; top.bad = false; }
      else { const part = LM.woundPart(S, g, 'sync'); g.wounds.push({ id: S.wseq = (S.wseq || wseq++) + 1, part, w: inj, w0: inj, tr: null, rest: false, wk: S.week }); }
    } else if (inj < mx) {
      g.wounds.slice().forEach((wd) => { if (wd.w > inj) wd.w = inj; if (wd.w <= 0) LM.closeWound(S, g, wd, { how: 'cured' }); });
    }
    g.inj = g.wounds.reduce((a, b) => Math.max(a, b.w), 0);
    return g.wounds;
  };
  LM.scarChance = (S, g, wd) => {
    const P = D.WOUNDS[wd.part]; if (!P || (g.scars || []).includes(P.scar) || (g.scars || []).length >= LM.MAX_SCARS) return 0;
    let c = P.sc * (wd.w0 >= 5 ? 1.3 : wd.w0 <= 2 ? 0.7 : 1) * (PLAN_SC[wd.tr] || 1) * (wd.rest ? 0.8 : 1) * (wd.bad ? 1.5 : 1);
    c *= clamp(1 - 0.14 * lvlOf(S, 'infirmary'), 0.3, 1); if (g.trait === 'lucky') c *= 0.75;
    return clamp(c, 0, 0.75);
  };
  /** remove a healed wound: scar roll, a short weakness. Returns {scar, wound}. */
  LM.closeWound = (S, g, wd, o) => {
    o = o || {}; g.wounds = (g.wounds || []).filter((x) => x !== wd); const P = D.WOUNDS[wd.part] || D.WOUNDS.gash, out = { wound: wd, scar: null };
    const ch = LM.scarChance(S, g, wd), roll = det(S, 'scar', g.id, wd.id)();
    if (o.force || (ch > 0 && roll < ch)) { g.scars = g.scars || []; if (!g.scars.includes(P.scar)) { g.scars.push(P.scar); out.scar = P.scar; LM.diary(S, g, `Scarred for life: ${D.SCARS[P.scar].n}.`); } }
    const len = wd.w0 >= 4 ? 2 : 1; const mods = Object.assign({}, g.weak && g.weak.w > 0 ? g.weak.mods : {});
    for (const k in P.weak) mods[k] = (mods[k] || 0) + P.weak[k];
    if (Object.keys(P.weak).length) g.weak = { w: Math.max(len, g.weak ? g.weak.w : 0), mods, part: wd.part };
    g.inj = g.wounds.reduce((a, b) => Math.max(a, b.w), 0);
    S.woundLog = (S.woundLog || []).concat([{ wk: S.week, id: g.id, name: g.name, part: wd.part, scar: out.scar }]).slice(-30);
    return out;
  };
  LM.healWounds = (S, g, n, o) => {
    o = o || {}; LM.syncWounds(S, g); const closed = [];
    (g.wounds || []).slice().forEach((wd) => { wd.w -= n + (o.rest && wd.rest ? 1 : 0); if (wd.w <= 0) closed.push(LM.closeWound(S, g, wd, { how: 'healed' })); });
    g.inj = (g.wounds || []).reduce((a, b) => Math.max(a, b.w), 0); return closed;
  };
  // ---- treatment: the Treat or Rest decision
  const trCost = (S, kind) => { const c = D.TREATS[kind] ? D.TREATS[kind].c : [0, 0]; return Math.round(c[0] + c[1] * ml0(S)); };
  LM.treatCost = (S, kind) => trCost(S, kind);
  LM.treatWhy = (S, g, wd, kind) => {
    if (!wd || g.inj <= 0) return 'Not injured';
    if (kind === 'rest' || kind === 'ease') return '';
    if (wd.tr === 'doc' || wd.tr === 'surg') return 'Already treated';
    if (kind === 'surg' && wd.w < 4) return 'Only for wounds of 4 weeks or more';
    if (S.gold < trCost(S, kind)) return `Need ${trCost(S, kind)} gold`;
    return '';
  };
  /** chances shown before you commit: {heal: weeks saved, scar: new scar chance %, risk: complication %} */
  LM.treatOdds = (S, g, wd, kind) => {
    const cur = LM.scarChance(S, g, wd), keep = (k) => Object.assign({}, wd, { tr: k });
    const after = kind === 'rest' ? LM.scarChance(S, g, Object.assign({}, wd, { rest: true })) : kind === 'ease' ? LM.scarChance(S, g, Object.assign({}, wd, { rest: false })) : LM.scarChance(S, g, keep(kind));
    return { scar: Math.round(after * 100), scarNow: Math.round(cur * 100), heal: kind === 'doc' ? 2 : kind === 'pou' ? 0.6 : kind === 'surg' ? 1 : kind === 'rest' ? 1 : 0, risk: kind === 'surg' ? 25 : kind === 'pou' ? 40 : 0 };
  };
  LM.setRest = (S, g, wd, on) => { wd.rest = !!on; return ''; };
  LM.treatWound = (S, g, wd, kind) => {
    LM.syncWounds(S, g); if (!g.wounds.includes(wd)) wd = LM.woundOf(g);
    const why = LM.treatWhy(S, g, wd, kind); if (why) return why;
    if (kind === 'rest' || kind === 'ease') { wd.rest = kind === 'rest'; return { ok: true, msg: kind === 'rest' ? 'Strict bed rest.' : 'Back to light duty.' }; }
    S.gold -= trCost(S, kind); let msg = '', ok = true, bad = false;
    if (kind === 'doc') { wd.w -= 2; wd.tr = 'doc'; msg = 'The physician works until dusk: two weeks saved.'; }
    else if (kind === 'pou') { if (rnd() < 0.6) { wd.w -= 1; msg = 'The poultice draws the swelling: a week saved.'; } else { ok = false; msg = 'The poultice did not help this time.'; } wd.tr = wd.tr || 'pou'; }
    else if (kind === 'surg') {
      wd.tr = 'surg'; if (rnd() < 0.25) { wd.w += 2; wd.bad = true; bad = true; g.mo = clamp(g.mo - 10, 0, 100); ok = false; msg = 'The surgery goes badly: two more weeks and a nasty scar risk.'; } else { wd.w -= 1; msg = 'The surgeon is steady and thorough: a week saved, and the wound will close clean.'; }
    }
    wd.w0 = Math.max(wd.w0, wd.w);
    if (wd.w <= 0) LM.closeWound(S, g, wd, { how: 'treated' }); g.inj = (g.wounds || []).reduce((a, b) => Math.max(a, b.w), 0);
    return { ok, bad, msg, weeks: g.inj };
  };
  // the old API: treat the longest wound, return '' or an error
  LM.treat = (S, g, kind, wid) => {
    if (g.inj <= 0) return 'Not injured'; LM.syncWounds(S, g);
    const wd = (wid && g.wounds.find((x) => x.id === wid)) || LM.woundOf(g); const r = LM.treatWound(S, g, wd, kind === 'physician' ? 'doc' : kind);
    return typeof r === 'string' ? r : '';
  };
  LM.healBonus = (S) => (LM.sponsorHas && LM.sponsorHas(S, 'temple') ? 1 : 0);

  // ---- hooks: a fight's injuries become wounds; each week wounds heal and scar; scars add fame
  const settle0 = LM.settle;
  LM.settle = (S, ev, glads, res) => {
    const rep = settle0(S, ev, glads, res), sc = [];
    (rep.inj || []).forEach((i) => {
      const g = glads.find((x) => x.id === i.id); if (!g) return; const hpf = res && res.hpf ? res.hpf[g.id] : null;
      g.wounds = g.wounds || []; g.inj = g.wounds.reduce((a, b) => Math.max(a, b.w), 0);   // the sim already set g.inj = i.w; replace it with a real wound
      const wd = LM.woundGive(S, g, i.w, null, hpf); i.w = wd.w; i.part = wd.part; i.wid = wd.id; i.name = D.WOUNDS[wd.part].n;
    });
    glads.forEach((g) => { const f = LM.scarFame(g); if (f > 0) sc.push(f); });
    if (sc.length && rep.fame > 0) { const extra = Math.round(rep.fame * (sc.reduce((a, b) => a + b, 0) / glads.length)); if (extra > 0) { S.fame += extra; rep.fame += extra; rep.notes.push(`Scars draw the crowd: +${extra} fame.`); } }
    if (LM.sponsorNote) LM.sponsorNote(S, ev, glads, res, rep);
    return rep;
  };
  const train0 = LM.weekTrain;
  LM.weekTrain = (S) => {
    const pre = S.glads.map((g) => { LM.syncWounds(S, g); return { g, inj0: g.inj, rest: (g.wounds || []).some((w) => w.rest) }; });
    const rep = train0(S), hb = LM.healBonus(S);
    pre.forEach(({ g, inj0, rest }) => {
      const line = (rep.lines || []).find((l) => l.id === g.id);
      if (inj0 <= 0) { if (g.weak) { g.weak.w--; if (g.weak.w <= 0) delete g.weak; } return; }
      const dec = Math.max(1, inj0 - g.inj) + hb;
      g.inj = inj0; (g.wounds || []).forEach((wd) => { wd.w += 0; });                 // g.inj was lowered by the sim; wounds heal by the same amount
      const closed = LM.healWounds(S, g, dec, { rest: true });
      if (rest && g.inj > 0) g.mo = clamp(g.mo - 3, 0, 100);
      if (line) {
        line.wounds = (g.wounds || []).map((w) => ({ part: w.part, w: w.w }));
        if (closed.length) line.txt += ` ${closed.map((c) => D.WOUNDS[c.wound.part].n).join(', ')} healed.`;
        closed.forEach((c) => { if (c.scar) line.txt += ` A scar remains: ${D.SCARS[c.scar].n}.`; });
        if (g.inj <= 0 && g.weak) line.txt += ` Still weak for ${g.weak.w} week${g.weak.w > 1 ? 's' : ''}.`;
        line.scar = closed.map((c) => c.scar).filter(Boolean);
      }
    });
    return rep;
  };
  const fall0 = LM.fall;
  LM.fall = (S, g, o) => { const sc = (g.scars || []).slice(), r = fall0(S, g, o); if (r && r.entry) r.entry.scars = sc; return r; };
  const retire0 = LM.retire;
  LM.retire = (S, g) => { const sc = (g.scars || []).slice(), r = retire0(S, g); if (r === '' && S.legends && S.legends.length) S.legends[S.legends.length - 1].scars = sc; return r; };

  // =========================================================== 2. THE DEEP EVENT DECK
  const LEGACY = { patron: ['The senator\'s villa', 'patron', 1], brawl: ['Barracks brawl', 'barracks', 1], trainer: ['Wandering trainer', 'coin', 0.8], spoiled: ['Spoiled barley', 'barracks', 0.8], spy: ['A rival spy', 'rival', 0.8], sponsor: ['A merchant\'s month', 'patron', 0], priest: ['Traveling priest', 'omen', 0.8], champion: ['Retired champion', 'fame', 0.6], defector: ['A defector', 'rival', 0.6], coins: ['A lucky find', 'luck', 0.8], festival: ['Town festival', 'fame', 0.8], veteran: ['An old veteran', 'barracks', 0.8] };
  Object.keys(LEGACY).forEach((id) => { const E = LM.EVENTS[id]; if (E) { E.n = LEGACY[id][0]; E.tag = LEGACY[id][1]; E.w = LEGACY[id][2]; E.cd = 8; } });
  const COND = {
    two: (S) => S.glads.length >= 2, room: (S) => S.glads.length < LM.rosterCap(S), wounded: (S) => S.glads.some((g) => g.inj > 0), poor: (S) => S.gold < 150,
    fallen: (S) => (S.fallen || []).length > 0, scarred: (S) => S.glads.some((g) => (g.scars || []).length), unhappy: (S) => S.glads.some((g) => g.mo < 55), lvl4: (S) => S.glads.some((g) => g.lvl >= 4),
    vet: (S) => S.glads.some((g) => g.rec.w >= 8), hostile: (S) => LM.ludiInit(S).list.some((l) => l.rel <= -25 && !l.ally) || S.week >= 14,
    fame: (S, a) => S.fame >= +a, ml: (S, a) => ml0(S) >= +a, f: (S, a) => !!(S.evFlags || {})[a], nf: (S, a) => !(S.evFlags || {})[a] && !((S.evStatus || {})[a] >= S.week),
    nsp: (S, a) => !LM.sponsorHas(S, a) && !((S.spons || {}).offers || []).some((o) => o.sid === a) && !(((S.spons || {}).cool || {})[a] > S.week),
  };
  LM.evCheck = (S, conds) => (conds || []).every((c) => { const [k, a] = c.split(':'); return COND[k] ? COND[k](S, a) : true; });
  const PFN = {
    pguard: (S) => ((S.evFlags || {}).guarded ? 0.85 : 0.5),
    pchamp: (S) => { const b = S.glads.reduce((a, g) => Math.max(a, g.lvl), 1); return clamp(0.3 + 0.045 * (b - (3 + 3 * ml0(S))), 0.15, 0.8); },
    pchamp2: (S) => clamp(PFN.pchamp(S) + 0.12, 0.2, 0.88),
    pbet: (S) => (((S.evFlags || {}).betMult || 2) > 2 ? 0.45 : 0.52),
  };
  const WHO = {
    any: (S) => S.glads.length ? S.glads[Math.floor(rnd() * S.glads.length)] : null,
    best: (S) => S.glads.slice().sort((a, b) => b.lvl - a.lvl)[0] || null, worst: (S) => S.glads.slice().sort((a, b) => a.mo - b.mo)[0] || null, young: (S) => S.glads.slice().sort((a, b) => a.lvl - b.lvl)[0] || null,
    healthy: (S) => { const a = S.glads.filter((g) => g.inj <= 0); return a.length ? a[Math.floor(rnd() * a.length)] : WHO.any(S); },
    vet: (S) => S.glads.slice().sort((a, b) => b.rec.w - a.rec.w)[0] || null,
    scarred: (S) => { const a = S.glads.filter((g) => (g.scars || []).length); return a.length ? a[Math.floor(rnd() * a.length)] : WHO.any(S); },
    plot: (S) => WHO.worst(S),
  };
  const CHAMPS = ['Aulus the Gull', 'Rufio Longarm', 'Brasidas of Tarentum', 'Caeso Hammerhand', 'Draco the Quiet', 'Marcus Bright-Eye', 'Sextus Ironlip'];
  /** resolve who/rival/names for an event and store them on S.evCtx so the text is stable until the player chooses */
  LM.evPrepare = (S, id, q) => {
    const E = LM.EVENTS[id], d = E && E.deck, r = det(S, 'evctx', id, S.week), ctx = {};
    let who = null; if (q && q.whoId != null) who = S.glads.find((g) => g.id === q.whoId) || null;
    if (!who && d && d.who) who = (WHO[d.who] || WHO.any)(S);
    if (who) { ctx.who = who.id; ctx.wn = who.name; } else if (q && q.nm) ctx.wn = q.nm;
    const L = LM.ludiInit(S).list, hostile = L.slice().sort((a, b) => a.rel - b.rel)[0], rv = hostile && hostile.rel <= -15 ? hostile : L[Math.floor(r() * L.length)];
    ctx.rival = rv.name; ctx.rivalId = rv.id; ctx.champ = CHAMPS[Math.floor(r() * CHAMPS.length)]; ctx.pat = ['Valerius Corvus', 'Aemilius Paulus', 'Fabius Lentulus', 'Domitia Cato'][Math.floor(r() * 4)];
    const fl = (S.fallen || [])[(S.fallen || []).length - 1]; ctx.fallen = fl ? fl.name : 'a fallen man';
    S.evCtx = ctx; return ctx;
  };
  const fill = (t, ctx) => String(t || '').replace(/\{(who|rival|champ|pat|fallen)\}/g, (m, k) => (k === 'who' ? ctx.wn || 'the man' : ctx[k] || ''));
  LM.evText = (S, s) => fill(s, S.evCtx || {});
  const gAmt = (S, a, b) => Math.round(a + (b || 0) * ml0(S));
  const whoOf = (S, ctx) => (ctx && ctx.who != null ? S.glads.find((g) => g.id === ctx.who) : null);
  const gname = (g) => g.name;

  /** apply a list of ops; returns short effect labels for the result chips */
  LM.applyFx = (S, fx, ctx) => {
    ctx = ctx || S.evCtx || {}; const out = []; S.evFlags = S.evFlags || {}; S.evStatus = S.evStatus || {}; S.evQ = S.evQ || [];
    (fx || []).forEach((op) => {
      const k = op[0], g = whoOf(S, ctx);
      if (k === 'gold') { const a = gAmt(S, op[1], op[2]), before = S.gold; S.gold = Math.max(0, S.gold + a); out.push(`${a >= 0 ? '+' : ''}${S.gold - before} gold`); }
      else if (k === 'fame') { const a = gAmt(S, op[1], op[2]), before = S.fame; S.fame = Math.max(0, S.fame + a); out.push(`${a >= 0 ? '+' : ''}${S.fame - before} fame`); }
      else if (k === 'mo' || k === 'en') { S.glads.forEach((x) => { x[k] = clamp(x[k] + op[1], 0, 100); }); out.push(`${k === 'mo' ? 'Morale' : 'Energy'} ${op[1] >= 0 ? '+' : ''}${op[1]} (all)`); }
      else if ((k === 'moW' || k === 'enW') && g) { const f = k === 'moW' ? 'mo' : 'en'; g[f] = clamp(g[f] + op[1], 0, 100); out.push(`${gname(g)} ${f === 'mo' ? 'morale' : 'energy'} ${op[1] >= 0 ? '+' : ''}${op[1]}`); }
      else if (k === 'xp' || k === 'xpYoung') { const t = k === 'xp' ? (g || WHO.any(S)) : WHO.young(S); if (t) { const up = LM.addXp(t, op[1]); out.push(`${gname(t)} +${op[1]} XP${up.length ? ', level ' + up[up.length - 1] : ''}`); } }
      else if (k === 'stat') { const t = g || WHO.any(S); if (t) { const s = op[2] || D.STATS[Math.floor(rnd() * 5)]; t.st[s] += op[1]; out.push(`${gname(t)} +${op[1]} ${D.SA[s]}`); } }
      else if (k === 'hurt') {
        if (op[3] != null && rnd() >= op[3]) return; let t = g && g.inj <= 0 ? g : null; if (!t) { const hs = S.glads.filter((x) => x.inj <= 0); t = hs.length ? hs[Math.floor(rnd() * hs.length)] : null; }
        if (t) { const wd = LM.woundGive(S, t, op[2] || 1, op[1], null); out.push(`${gname(t)}: ${D.WOUNDS[wd.part].n}, ${wd.w}w`); }
      }
      else if (k === 'bond') { const t = g || WHO.any(S), o = S.glads.filter((x) => x !== t); if (t && o.length) { const b = o[Math.floor(rnd() * o.length)]; LM.addBond(S, t.id, b.id, op[1]); out.push(`${op[1] >= 0 ? 'Closer' : 'Strained'}: ${t.name} and ${b.name}`); } }
      else if (k === 'fac') { const r = LM.facGain(S, op[1], op[2]); out.push(r.text); }
      else if (k === 'q') {
        const e = { id: op[1], due: S.week + op[2], whoId: ctx.gone ? null : (ctx.who != null ? ctx.who : null), nm: ctx.gone ? ctx.gone.name : (ctx.wn || '') }; S.evQ.push(e);
      }
      else if (k === 'flag') S.evFlags[op[1]] = S.week; else if (k === 'clear') delete S.evFlags[op[1]];
      else if (k === 'status') { S.evStatus[op[1]] = S.week + op[2]; out.push(op[1] === 'plague' ? `Sickness for ${op[2]} weeks` : op[1]); }
      else if (k === 'sp') { const sid = ctx.sid || ((S.spons && S.spons.active[0]) || {}).sid; if (sid) { const r = LM.sponsorRel(S, sid, op[1]); if (r) out.push(r); } }
      else if (k === 'ludi') { const l = LM.ludiOf(S, ctx.rivalId) || LM.ludiInit(S).list[0]; l.rel = clamp(l.rel + op[1], -100, 100); out.push(`${l.name} regard ${op[1] >= 0 ? '+' : ''}${op[1]}`); }
      else if (k === 'recruit') {
        if (S.glads.length >= LM.rosterCap(S)) { out.push('Barracks full'); return; }
        const ml = ml0(S), n = LM.makeGlad({ lvl: 1 + ml * 3 + (op[1] || 0), q: op[2] != null ? op[2] : 0.6, id: S.nextId++, randRune: true }); n.act = 'rest'; LM.assignStory(n); S.glads.push(n); out.push(`${n.name} joins (${D.STYLES[n.style].n}, Lv ${n.lvl})`);
      }
      else if (k === 'item') { const ml = ml0(S), it = LM.genItem(rnd, { league: ml, ilvl: 2 + ml * 5 + Math.floor(S.week / 6), rar: Math.min(4, 1 + ml + (op[1] || 0)) }), sold = LM.addItem(S, it); out.push(sold ? `Armory full: sold ${sold.name}` : `Gear: ${it.name}`); }
      else if (k === 'desert') {
        const t = g || WHO.worst(S); if (t && S.glads.length > 1) {
          ctx.gone = { id: t.id, name: t.name }; LM.release(S, t); (S.mentors || []).slice().forEach((m) => { if (m.m === t.id || m.p === t.id) LM.mentorEnd(S, m, 'gone'); });
          if (op[1] === 'free') { S.freed = (S.freed || []).concat([{ name: t.name, wk: S.week, lvl: t.lvl }]).slice(-20); LM.forumAdd(S, `${t.name} walks out of the gate a free man.`); out.push(`${t.name} leaves a free man`); } else { S.glads.forEach((x) => { x.mo = clamp(x.mo - 4, 0, 100); }); LM.forumAdd(S, `${t.name} ran from the ludus.`); out.push(`${t.name} is gone`); }
        }
      }
      else if (k === 'offer') { const r = LM.sponsorOffer(S, op[1]); out.push(r ? 'A patron takes notice' : 'Patron\'s offer waits'); }
      else if (k === 'heal') { let n = 0; S.glads.forEach((x) => { if (x.inj > 0) { LM.healWounds(S, x, op[1]); n++; } }); if (n) out.push(`${n} wound${n > 1 ? 's' : ''} eased`); }
      else if (k === 'scar') { const t = g || WHO.any(S); if (t && (t.scars || []).length < LM.MAX_SCARS && !(t.scars || []).includes(op[1]) && rnd() < op[2]) { t.scars = (t.scars || []).concat([op[1]]); LM.diary(S, t, `Scarred: ${D.SCARS[op[1]].n}.`); out.push(`${t.name}: ${D.SCARS[op[1]].n}`); } }
      else if (k === 'bet') { S.evFlags.betMult = op[1]; S.evFlags.betAmt = ctx.paid || 0; }
      else if (k === 'payBet') { const a = Math.round((S.evFlags.betAmt || 0) * (S.evFlags.betMult || 2)); S.gold += a; out.push(`+${a} gold`); }
      else if (k === 'chance') { out.push(...LM.applyFx(S, rnd() < op[1] ? op[2] : op[3], ctx)); }
    });
    return out;
  };
  /** run choice i of a deck event: pays the cost, rolls the outcome, applies it. Returns the result text. */
  LM.runChoice = (S, E, i, ctx) => {
    ctx = ctx || S.evCtx || LM.evPrepare(S, E.id); const c = E.c[i]; S.evCtx = ctx; ctx.paid = 0;
    if (c.cost) { const a = gAmt(S, c.cost[0], c.cost[1]); if (S.gold < a) { S.evLast = { r: 'You cannot afford it.', fx: [], bad: true }; return 'You cannot afford it.'; } S.gold -= a; ctx.paid = a; }
    let out = c.o[c.o.length - 1];
    for (const o of c.o) { if (o.p == null) { out = o; break; } const p = typeof o.p === 'string' ? PFN[o.p](S, ctx) : o.p; if (rnd() < p) { out = o; break; } }
    const fx = LM.applyFx(S, out.fx, ctx); if (c.cost) fx.unshift(`-${ctx.paid} gold`);
    const txt = fill(out.r, ctx); S.evLast = { r: txt, fx, lucky: out.p != null }; return txt;
  };
  LM.evCooldown = (S, id, E) => (S.evHist && S.evHist[id] != null ? S.evHist[id] + ((E.deck && E.deck.cd) || E.cd || 10) - S.week : 0);
  LM.evEligible = (S) => Object.keys(LM.EVENTS).filter((id) => {
    const E = LM.EVENTS[id], d = E.deck; if (d && d.follow) return false; if ((d ? d.w : E.w) === 0) return false;
    if (S.week < ((d && d.wk) || 3)) return false; if (LM.evCooldown(S, id, E) > 0) return false; return !d || LM.evCheck(S, d.if);
  });
  LM.rollEvent = (S) => {
    if (S.week < 3 || S.glads.length === 0) return null; S.evQ = S.evQ || [];
    const di = S.evQ.findIndex((q) => q.due <= S.week);
    if (di >= 0) {
      const q = S.evQ.splice(di, 1)[0]; let id = q.id; const E0 = LM.EVENTS[id];
      if (E0 && E0.deck && E0.deck.swap && (S.evFlags || {})[E0.deck.swap[0]]) id = E0.deck.swap[1];
      if (LM.EVENTS[id]) { S.pendingEv = id; LM.evPrepare(S, id, q); return id; }
    }
    const last = (S.evLog || [])[(S.evLog || []).length - 1]; if (rnd() > (last && last.wk === S.week - 1 ? 0.26 : 0.4)) return null;
    const ids = LM.evEligible(S); if (!ids.length) return null;
    const wt = ids.map((id) => { const E = LM.EVENTS[id]; return E.deck ? (E.deck.w == null ? 1 : E.deck.w) : (E.w == null ? 1 : E.w); }), tot = wt.reduce((a, b) => a + b, 0); let x = rnd() * tot, id = ids[0];
    for (let i = 0; i < ids.length; i++) { x -= wt[i]; if (x < 0) { id = ids[i]; break; } }
    S.pendingEv = id; LM.evPrepare(S, id); return id;
  };
  /** what the dialog shows: resolved text and choices with costs and risk hints */
  LM.evView = (S) => {
    const id = S.pendingEv, E = id && LM.EVENTS[id]; if (!E) return null; if (!S.evCtx) LM.evPrepare(S, id);
    const d = E.deck;
    return { id, n: fill((d && d.n) || E.n || 'Event', S.evCtx), tag: (d && d.tag) || E.tag || '', follow: !!(d && d.follow), text: fill(d ? d.t : E.t, S.evCtx), choices: E.c.map((c, i) => { const cost = d && c.cost ? gAmt(S, c.cost[0], c.cost[1]) : 0; return { i, l: fill(c.l, S.evCtx), h: (d && c.h) || '', cost, short: cost > S.gold }; }) };
  };
  LM.runEvent = (S, i) => {
    const id = S.pendingEv, E = LM.EVENTS[id]; S.pendingEv = null; if (!E) return '';
    const c = E.c[i] || E.c[E.c.length - 1]; let msg, fx = [];
    if (E.deck) { msg = LM.runChoice(S, E.deck, E.c.indexOf(c), S.evCtx); fx = (S.evLast || {}).fx || []; } else { msg = c.run(S); S.evLast = { r: msg, fx: [] }; }
    S.evHist = S.evHist || {}; S.evHist[id] = S.week; S.evLog = (S.evLog || []).concat([{ wk: S.week, id, n: fill((E.deck && E.deck.n) || E.n || id, S.evCtx || {}), tag: (E.deck && E.deck.tag) || E.tag || '', choice: fill(c.l, S.evCtx || {}), r: msg, fx, follow: !!(E.deck && E.deck.follow) }]).slice(-80);
    S.evCtx = null; return msg;
  };
  (D.EVDECK || []).forEach((d) => {
    LM.EVENTS[d.id] = { t: d.t, n: d.n, tag: d.tag, deck: d, c: d.c.map((c, i) => ({ l: c.l, h: c.h, cost: c.cost, run: (S) => LM.runChoice(S, d, i, S.evCtx) })) };
  });
  LM.evThreads = (S) => (S.evQ || []).map((q) => ({ id: q.id, n: (LM.EVENTS[q.id] || {}).n || q.id, due: q.due, in: q.due - S.week, tag: ((LM.EVENTS[q.id] || {}).deck || {}).tag || '' })).sort((a, b) => a.due - b.due);
  LM.evStatusList = (S) => Object.keys(S.evStatus || {}).filter((k) => S.evStatus[k] >= S.week).map((k) => ({ id: k, left: S.evStatus[k] - S.week + 1 }));

  // =========================================================== 3. PATRONS (sponsor contracts)
  LM.sponsInit = (S) => { S.spons = S.spons || { active: [], offers: [], done: {}, rel: {}, cool: {}, hist: [], beatQ: [], seq: 1, seen: {} }; return S.spons; };
  LM.sponsorSlots = (S) => 1 + (ml0(S) >= 2 ? 1 : 0) + (ml0(S) >= 3 ? 1 : 0);   // fame opens slots; the money follows the fighters (patronTier)
  LM.sponsorHas = (S, sid) => !!S.spons && S.spons.active.some((c) => c.sid === sid);
  LM.sponsorRel = (S, sid, n) => {
    const T = LM.sponsInit(S);
    if (n <= -100) { T.active.filter((c) => c.sid === sid).forEach((c) => { T.hist.push({ sid, wk: S.week, res: 'ended', n: 'Contract ended: exposed' }); }); T.active = T.active.filter((c) => c.sid !== sid); T.cool[sid] = S.week + 10; T.rel[sid] = 0; return `${D.SPONSORS[sid].n} walks away`; }
    T.rel[sid] = clamp((T.rel[sid] || 0) + n, 0, 100); return `${D.SPONSORS[sid].n} regard ${n >= 0 ? '+' : ''}${n}`;
  };
  /** patrons pay for the league you really fight in: fame opens the door, but the best fighter's level sets the money */
  LM.patronTier = (S) => { const top = S.glads.reduce((a, g) => Math.max(a, g.lvl), 1); let t = 0; D.LEAGUES.forEach((L) => { if (top >= L.lvl - 1) t = L.id; }); return Math.min(ml0(S), t); };
  const stip = (S) => [7, 15, 32, 70][LM.patronTier(S)];
  const DEM = {
    wins: (S, v, w) => ({ k: 'wins', n: v ? 4 : 2 + (w > 6 ? 1 : 0), got: 0 }), appear: (S, v, w) => ({ k: 'appear', n: v ? 6 : 4, got: 0 }),
    winrate: (S, v) => ({ k: 'winrate', pct: v ? 70 : 55, min: 4 }), nodeath: () => ({ k: 'nodeath' }),
    spare: (S, v) => ({ k: 'spare', n: v ? 2 : 1, got: 0 }),
    style: (S, v, w, r) => { const have = Array.from(new Set(S.glads.map((g) => g.style))); const pool = have.length ? have : D.STYLE_IDS; return { k: 'style', style: pool[Math.floor(r() * pool.length)], n: v ? 3 : 2, got: 0 }; },
  };
  /** the two offers for a patron: steady and bold. Pure of the sim RNG. */
  LM.sponsorTerms = (S, sid, ren) => {
    const P = D.SPONSORS[sid], T = LM.sponsInit(S), done = T.done[sid] || 0, rel = T.rel[sid] || 0, out = [];
    ['steady', 'bold'].forEach((v) => {
      const r = det(S, 'spterm', sid, T.seq, v), bold = v === 'bold', weeks = bold ? 8 : 6;
      const pay = Math.round(stip(S) * P.pay * (bold ? 1.35 : 1) * (1 + rel / 250 + 0.05 * done));
      const dem = (bold ? P.kinds : P.kinds.slice(0, 1)).map((k) => DEM[k](S, bold, weeks, r));
      out.push({ v, weeks, pay, bonus: Math.round(pay * weeks * (bold ? 1.2 : 1.0)), dem, pen: Math.round(pay * weeks * 0.35) });
    });
    return out;
  };
  LM.sponsorOffer = (S, sid, ren) => {
    const T = LM.sponsInit(S); if (T.offers.some((o) => o.sid === sid) || LM.sponsorHas(S, sid) || (T.cool[sid] || 0) > S.week) return null;
    const o = { id: T.seq++, sid, wk: S.week, exp: S.week + 3, ren: !!ren, terms: LM.sponsorTerms(S, sid, ren) }; T.offers.push(o); return o;
  };
  LM.sponsorWhy = (S, o) => (LM.sponsInit(S).active.length >= LM.sponsorSlots(S) ? `All ${LM.sponsorSlots(S)} patron slot${LM.sponsorSlots(S) > 1 ? 's are' : ' is'} taken` : '');
  LM.sponsorAccept = (S, offerId, variant) => {
    const T = LM.sponsInit(S), o = T.offers.find((x) => x.id === offerId); if (!o) return 'The offer has lapsed'; const why = LM.sponsorWhy(S, o); if (why) return why;
    const t = o.terms.find((x) => x.v === variant) || o.terms[0];
    const c = { id: T.seq++, sid: o.sid, v: t.v, wk0: S.week, weeks: t.weeks, left: t.weeks, age: 0, pay: t.pay, bonus: t.bonus, pen: t.pen, dem: JSON.parse(JSON.stringify(t.dem)), fights: 0, wins: 0, fall0: S.stats.fallen || 0, spare0: S.stats.spares || 0, earned: 0 };
    T.active.push(c); T.offers = T.offers.filter((x) => x !== o); LM.forumAdd(S, `${D.SPONSORS[o.sid].n} signs your ludus for ${t.weeks} weeks.`); return '';
  };
  LM.sponsorDecline = (S, offerId) => { const T = LM.sponsInit(S), o = T.offers.find((x) => x.id === offerId); T.offers = T.offers.filter((x) => x.id !== offerId); if (o) T.cool[o.sid] = S.week + 3; return ''; };
  LM.sponsorDemand = (S, c, d) => {
    const T = LM.sponsInit(S); let got = 0, need = 1, text = '', failed = false;
    if (d.k === 'wins') { got = d.got; need = d.n; text = `Win ${d.n} fights`; }
    else if (d.k === 'appear') { got = d.got; need = d.n; text = `Appear in ${d.n} fights`; }
    else if (d.k === 'style') { got = d.got; need = d.n; text = `${d.n} wins by a ${D.STYLES[d.style].n}`; }
    else if (d.k === 'spare') { got = (S.stats.spares || 0) - c.spare0; need = d.n; text = `Spare ${d.n} beaten foe${d.n > 1 ? 's' : ''}`; }
    else if (d.k === 'winrate') { got = c.fights ? Math.round((c.wins / c.fights) * 100) : 0; need = d.pct; text = `Win at least ${d.pct}% of fights (${d.min}+ fights)`; failed = false; return { text, got, need, ok: c.fights >= d.min && got >= need, failed: false, unit: '%', min: d.min }; }
    else if (d.k === 'nodeath') { failed = (S.stats.fallen || 0) > c.fall0; text = 'Nobody dies'; return { text, got: failed ? 0 : 1, need: 1, ok: !failed, failed }; }
    return { text, got: Math.min(got, need), need, ok: got >= need, failed };
  };
  LM.sponsorNote = (S, ev, glads, res, rep) => {
    const T = S.spons; if (!T || !T.active.length) return; const won = !!(res && (res.win || res.place === 1));
    T.active.forEach((c) => {
      c.fights++; if (won) c.wins++;
      c.dem.forEach((d) => { if (d.k === 'appear') d.got++; else if (d.k === 'wins' && won) d.got++; else if (d.k === 'style' && won && glads.some((g) => g.style === d.style)) d.got++; });
    });
  };
  const endContract = (S, c, rep) => {
    const T = S.spons, P = D.SPONSORS[c.sid], rs = c.dem.map((d) => LM.sponsorDemand(S, c, d)), okN = rs.filter((r) => r.ok).length, breach = rs.some((r) => r.failed);
    T.active = T.active.filter((x) => x !== c); let res = 'ok', msg = '';
    if (!breach && okN === rs.length) {
      S.gold += c.bonus; rep.income += c.bonus; T.rel[c.sid] = clamp((T.rel[c.sid] || 0) + 12, 0, 100); T.done[c.sid] = (T.done[c.sid] || 0) + 1; const f = 6 + 6 * ml0(S); S.fame += f; res = 'ok';
      msg = `${P.n} is delighted: contract kept. +${c.bonus} gold, +${f} fame.`;
      if (c.sid === 'smith') { const ml = ml0(S), it = LM.genItem(rnd, { league: ml, ilvl: 3 + ml * 5 + Math.floor(S.week / 6), rar: Math.min(4, 2 + (ml >= 2 ? 1 : 0)) }); LM.addItem(S, it); msg += ` The Guild adds a piece of steel: ${it.name}.`; }
      T.cool[c.sid] = S.week; LM.sponsorOffer(S, c.sid, true);
    } else if (!breach && okN * 2 >= rs.length) { T.rel[c.sid] = clamp((T.rel[c.sid] || 0) - 4, 0, 100); res = 'meh'; msg = `${P.n} is lukewarm: only part of the terms were met. No bonus.`; T.cool[c.sid] = S.week + 3; }
    else {
      res = 'fail'; T.rel[c.sid] = clamp((T.rel[c.sid] || 0) - 15, 0, 100); T.cool[c.sid] = S.week + 6;
      let pen = '';
      if (P.pen === 'gold') { const g = Math.min(S.gold, c.pen); S.gold -= g; pen = `${g} gold clawed back`; }
      else if (P.pen === 'fame') { const f = Math.min(S.fame, 10 + 8 * ml0(S)); S.fame -= f; pen = `-${f} fame`; }
      else if (P.pen === 'sen') { const r = LM.facGain(S, 'sen', -12); pen = r.text; }
      else if (P.pen === 'ludi') { const l = LM.ludiInit(S).list.slice().sort((a, b) => b.rel - a.rel)[0]; l.rel = clamp(l.rel - 15, -100, 100); const f = Math.min(S.fame, 8 + 4 * ml0(S)); S.fame -= f; pen = `-${f} fame, ${l.name} sneers`; }
      else { S.glads.forEach((g) => { g.mo = clamp(g.mo - 6, 0, 100); }); pen = 'the men feel the shame (-6 morale)'; }
      msg = `${P.n} cancels: ${breach ? 'a fighter fell under your watch' : 'terms missed'}. ${pen}.`;
    }
    T.hist.push({ sid: c.sid, wk: S.week, res, n: msg, earned: c.earned }); if (T.hist.length > 30) T.hist.shift();
    rep.notes.push(msg); LM.forumAdd(S, msg.split('. ')[0] + '.');
  };
  LM.sponsorWeek = (S, rep) => {
    const T = LM.sponsInit(S);
    T.offers = T.offers.filter((o) => o.exp >= S.week);
    T.active.slice().forEach((c) => {
      c.age++; c.left--; const P = D.SPONSORS[c.sid];
      const breach = c.dem.some((d) => d.k === 'nodeath') && (S.stats.fallen || 0) > c.fall0;
      if (!breach) { S.gold += c.pay; rep.income += c.pay; c.earned += c.pay; rep.notes.push(`${P.n} pays ${c.pay} gold.`); }
      if (c.sid === 'wine') S.glads.forEach((g) => { g.mo = clamp(g.mo + 2, 0, 100); });
      else if (c.sid === 'senator') LM.facGain(S, 'sen', 2);
      else if (c.sid === 'veil') S.spy = { until: Math.max((S.spy && S.spy.until) || 0, S.week + 1) };
      const i = T.done[c.sid] || 0, bs = D.SPBEATS[c.sid]; T.seen = T.seen || {};
      if (c.age === 2 && bs && bs[i] && !T.seen[c.sid + i]) { T.seen[c.sid + i] = true; T.beatQ.push({ sid: c.sid, i, cid: c.id }); }
      if (breach || c.left <= 0) endContract(S, c, rep);
    });
    if (S.week >= 3 && T.offers.length < 2 && T.active.length < LM.sponsorSlots(S) && rnd() < 0.3) {
      const ok = D.SPONSOR_IDS.filter((id) => D.SPONSORS[id].fame <= S.fame && !LM.sponsorHas(S, id) && !T.offers.some((o) => o.sid === id) && (T.cool[id] || 0) <= S.week);
      if (ok.length) { const sid = ok[Math.floor(rnd() * ok.length)]; if (LM.sponsorOffer(S, sid)) rep.notes.push(`${D.SPONSORS[sid].n} sends word: an offer waits in the Patrons tab.`); }
    }
  };
  LM.beatView = (S) => {
    const T = LM.sponsInit(S), b = T.beatQ[0]; if (!b) return null; const B = D.SPBEATS[b.sid][b.i]; if (!B) { T.beatQ.shift(); return LM.beatView(S); }
    if (!b.ctx) { const who = WHO.any(S), L = LM.ludiInit(S).list; b.ctx = { who: who ? who.id : null, wn: who ? who.name : 'the man', rival: L[b.i % L.length].name, rivalId: L[b.i % L.length].id, sid: b.sid }; }
    return { sid: b.sid, i: b.i, P: D.SPONSORS[b.sid], text: fill(B.tx, b.ctx), choices: B.c.map((c, k) => ({ k, l: fill(c.l, b.ctx), cost: c.cost ? gAmt(S, c.cost[0], c.cost[1]) : 0 })) };
  };
  LM.beatResolve = (S, k) => {
    const T = LM.sponsInit(S), b = T.beatQ[0]; if (!b) return null; const v = LM.beatView(S), B = D.SPBEATS[b.sid][b.i], c = B.c[k] || B.c[0]; T.beatQ.shift();
    let fx = []; if (c.cost) { const a = gAmt(S, c.cost[0], c.cost[1]); if (S.gold < a) return { msg: 'You cannot afford it, and the moment passes.', fx: [] }; S.gold -= a; fx.push(`-${a} gold`); }
    fx = fx.concat(LM.applyFx(S, c.fx, b.ctx)); S.evLast = { r: fill(c.l, b.ctx), fx }; return { msg: `${v.choices[k] ? v.choices[k].l : c.l}.`, fx };
  };

  const week0 = LM.extWeek;
  LM.extWeek = (S, rep) => {
    week0(S, rep);
    const pl = (S.evStatus || {}).plague;
    if (pl >= S.week) { S.glads.forEach((g) => { g.en = clamp(g.en - 10, 0, 100); g.mo = clamp(g.mo - 2, 0, 100); }); rep.notes.push('The sickness lingers in the barracks (-10 energy, -2 morale).'); }
    LM.sponsorWeek(S, rep);
  };
  const migrate0 = LM.migrate;
  LM.migrate = (S) => { const N = migrate0(S); LM.sponsInit(N); (N.glads || []).forEach((g) => { g.scars = g.scars || []; g.wounds = g.wounds || []; }); return N; };
  const ascend1 = LM.ascend;
  LM.ascend = (S) => { const N = ascend1(S); N.freed = (S.freed || []).slice(); return N; };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ================================================================================================================================================
// WAVE 3 (gladiator / achievements agent): FIGHT HURT and TROPHIES. Third wrapper block, loaded last so it wraps the wave 2 wrappers.
//   Fight hurt: a wounded fighter may be sent anyway (LM.enter opts.hurt, the picker's "Fight hurt"). While g.hurtFight is set LM.derive subtracts LM.hurtMods
//   (twice the weakness of every wound plus a general penalty per week of injury). After every fight LM.hurtAfter rolls whether the wound worsens (idempotent per result).
//   Trophies: 9 Venatio trophies and 22 more are appended to D.TROPHIES; their rules live in LM.TCX, progress in LM.trophyProgress.
// ================================================================================================================================================
(function (G) {
  const D = G.LM_D, LM = G.LM;
  if (!LM || LM.hurtOk) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const det = (S, ...p) => LM.mulberry(LM.hash(String(S.seed) + '|' + p.join('|')));
  const lvlOf = (S, id) => { try { return LM.bfx(S, id).l; } catch (e) { return 0; } };

  // ---------------------------------------------------------------- fight hurt
  /** may this fighter be sent hurt? (any wounded human fighter) */
  LM.hurtOk = (S, g) => !!g && !g.beast && (g.inj > 0 || (g.wounds || []).some((w) => w.w > 0));
  const weeksOf = (g) => Math.max(g.inj || 0, (g.wounds || []).reduce((a, w) => Math.max(a, w.w), 0));
  /** derived stat changes while fighting hurt: twice every wound's weakness plus a general penalty that grows with the weeks left (4% a week, 16% at most) */
  LM.hurtMods = (g) => {
    const wk = weeksOf(g), gen = clamp(0.04 * wk, 0.04, 0.16), m = { hp: -gen * 0.6, atk: -gen, def: -gen * 0.5, spd: -gen * 0.8 };
    (g.wounds || []).forEach((wd) => { const P = D.WOUNDS[wd.part]; if (P) for (const k in P.weak) m[k] = (m[k] || 0) + P.weak[k] * 2; });
    return m;
  };
  LM.hurtText = (g) => { const m = LM.hurtMods(g), out = []; for (const k of ['hp', 'atk', 'def', 'spd', 'crit', 'eva']) if (m[k]) out.push(`${m[k] > 0 ? '+' : ''}${Math.round(m[k] * 100)}% ${k === 'hp' ? 'health' : k === 'atk' ? 'damage' : k === 'def' ? 'armor' : k === 'spd' ? 'speed' : k === 'crit' ? 'crit' : 'dodge'}`); return out; };
  /** the explicit trade-off: chance the worst wound gets worse if you win / lose, and by how many weeks */
  LM.hurtRisk = (S, g) => {
    const wk = weeksOf(g), mit = clamp(1 - 0.08 * lvlOf(S, 'infirmary') - (g.trait === 'lucky' ? 0.1 : 0), 0.4, 1), base = 0.1 + 0.05 * wk;
    return { weeks: wk, win: clamp(base * mit, 0.05, 0.6), lose: clamp((base + 0.3) * mit, 0.15, 0.9), addWin: 1, addLose: 2, mods: LM.hurtMods(g), text: LM.hurtText(g) };
  };
  LM.hurtMark = (S, g, on = true) => { if (g) { if (on && LM.hurtOk(S, g)) g.hurtFight = 1; else delete g.hurtFight; } };
  LM.hurtClear = (S) => { (S.glads || []).forEach((g) => { delete g.hurtFight; }); };
  /** run a thunk with the hurt penalty applied (picker odds) */
  LM.withHurt = (S, g, fn) => { const had = g.hurtFight, inj = g.inj; g.hurtFight = 1; try { return fn(); } finally { if (had) g.hurtFight = had; else delete g.hurtFight; g.inj = inj; } };
  /** roll the worsening after a fight for a fighter marked hurt. Returns null when not hurt, else {worse, chance, add, id, name, part, w, newWound}. Does not clear the mark (a Pit run keeps fighting hurt). */
  LM.hurtAfter = (S, g, o) => {
    o = o || {}; if (!g || !g.hurtFight) return null; LM.syncWounds(S, g);
    if (!(g.wounds || []).some((w) => w.w > 0)) { delete g.hurtFight; return null; }
    const R = LM.hurtRisk(S, g), win = !!o.win, chance = win ? R.win : R.lose, rr = det(S, 'hurt', g.id, S.week, S.hseq = (S.hseq || 0) + 1);
    const roll = rr(), worse = roll < chance, out = { id: g.id, name: g.name, worse, chance, win, add: 0, newWound: null, kind: o.kind || '' };
    if (worse) {
      const top = g.wounds.slice().sort((a, b) => b.w - a.w)[0], add = win ? R.addWin : R.addLose; out.add = add; top.w += add; top.w0 = Math.max(top.w0 || 0, top.w); top.worse = (top.worse || 0) + 1; top.tr = null; out.part = top.part; out.w = top.w;
      if (!win && g.wounds.length < 3 && rr() < 0.4) { const wd = LM.woundGive(S, g, 2, null, 0.15); out.newWound = { part: wd.part, name: D.WOUNDS[wd.part].n, w: wd.w }; }
      g.inj = g.wounds.reduce((a, b) => Math.max(a, b.w), 0); g.mo = clamp(g.mo - 4, 0, 100);
      LM.diary && LM.diary(S, g, `Fought hurt and made it worse (+${add} week${add > 1 ? 's' : ''}).`);
    } else LM.diary && LM.diary(S, g, 'Fought hurt and held together.');
    S.stats = S.stats || {}; S.stats.hurtFights = (S.stats.hurtFights || 0) + 1; if (win) S.stats.hurtWins = (S.stats.hurtWins || 0) + 1;
    return out;
  };
  /** roll for every marked fighter once per fight result (res.hurt is the cache, so UI and settle can both call it) */
  LM.hurtResolve = (S, glads, res, kind) => {
    if (!res) return []; res.hurt = res.hurt || []; const done = new Set(res.hurt.map((x) => x.id));
    (glads || []).forEach((g) => { if (g && g.hurtFight && !done.has(g.id)) { const r = LM.hurtAfter(S, g, { win: !!res.win || res.place === 1, kind }); if (r) { res.hurt.push(r); done.add(g.id); } } });
    return res.hurt;
  };
  LM.hurtLine = (r) => (r.worse ? `${r.name} fought hurt and the wound got worse: +${r.add} week${r.add > 1 ? 's' : ''}${r.newWound ? `, and a new ${r.newWound.name.toLowerCase()}` : ''}.` : `${r.name} fought hurt and the wound held.`);

  const derive1 = LM.derive;
  LM.derive = (g, ctx) => {
    const d = derive1(g, ctx); if (!g.hurtFight || !(g.wounds || []).some((w) => w.w > 0)) return d;
    const m = LM.hurtMods(g); for (const k of ['hp', 'atk', 'def', 'spd']) if (m[k]) d[k] *= 1 + m[k];
    if (m.crit) d.crit = clamp(d.crit + m.crit, 0, 0.6); if (m.eva) d.eva = clamp(d.eva + m.eva, 0, 0.4); d.hurt = true; return d;
  };
  const enter1 = LM.enter;
  /** opts.hurt = ids of wounded fighters sent anyway; the entry remembers them (entry.hurt) */
  LM.enter = (S, ev, ids, stance, opts) => {
    const want = (opts && opts.hurt) || [], saved = [];
    want.forEach((id) => { const g = S.glads.find((x) => x.id === id); if (g && ids.includes(id) && g.inj > 0) { saved.push([g, g.inj]); g.inj = 0; } });
    let r; try { r = enter1(S, ev, ids, stance); } finally { saved.forEach(([g, i]) => { g.inj = i; }); }
    if (!r && saved.length && S.entries[ev.key]) S.entries[ev.key].hurt = saved.map(([g]) => g.id);
    return r;
  };
  /** can this entry still run at its date? Hurt entries may keep their wounded fighters. */
  LM.entryReady = (S, en) => en.ids.every((id) => { const g = S.glads.find((x) => x.id === id); return g && (g.inj <= 0 || (en.hurt || []).includes(id)); });
  /** mark the fighters of an entry who are still wounded when the day comes */
  LM.entryMarkHurt = (S, en) => { (en.hurt || []).forEach((id) => { const g = S.glads.find((x) => x.id === id); if (g) LM.hurtMark(S, g, true); }); };
  const settle1 = LM.settle;
  LM.settle = (S, ev, glads, res) => {
    const rep = settle1(S, ev, glads, res), h = LM.hurtResolve(S, glads, res, ev && ev.kind);
    if (h.length) { rep.hurt = h; h.forEach((r) => rep.notes.push(LM.hurtLine(r))); }
    streak(S, !!(res && (res.win || res.place === 1)), glads, res); return rep;
  };
  const venSettle1 = LM.venatioSettle;
  LM.venatioSettle = (S, h, glads, res) => {
    const hr = LM.hurtResolve(S, glads, res, 'hunt'), rep = venSettle1(S, h, glads, res), V = LM.venatio(S), units = (res.F && res.F.units) || [];
    if (hr.length) { rep.hurt = hr; hr.forEach((r) => rep.notes.push(LM.hurtLine(r))); }
    if (res.win) {
      V.cleared = V.cleared || {}; V.cleared[h.id] = (V.cleared[h.id] || 0) + 1; V.solo = V.solo || {};
      if ((h.party || 1) === 1) units.filter((u) => u.beast && u.down).forEach((u) => { V.solo[u.beast] = (V.solo[u.beast] || 0) + 1; });
    }
    return rep;
  };
  const week3 = LM.extWeek;
  LM.extWeek = (S, rep) => {
    week3(S, rep); LM.hurtClear(S);
    if (LM.hardcore(S)) { S.hcWeeks = (S.hcWeeks || 0) + 1; if (S.hcFallen0 == null) S.hcFallen0 = (S.stats && S.stats.fallen) || 0; } else { S.hcWeeks = 0; delete S.hcFallen0; }
    if (rep && rep.recap && LM.hardcore(S)) { // a whole season survived in Hardcore
      const f = (S.stats && S.stats.fallen) || 0;
      if (S.hcFallen0 != null && f === S.hcFallen0 && (S.hcWeeks || 0) >= 10 && S.glads.length) { S.stats.hcSeasons = (S.stats.hcSeasons || 0) + 1; rep.notes.push('A whole Hardcore season and nobody died. The ludus breathes out.'); }
      S.hcFallen0 = f; S.hcWeeks = 0;
    }
  };
  function streak(S, win, glads, res) { S.stats = S.stats || {}; if (win) { S.stats.streak = (S.stats.streak || 0) + 1; S.stats.streakBest = Math.max(S.stats.streakBest || 0, S.stats.streak); } else S.stats.streak = 0; }

  // ---------------------------------------------------------------- trophies
  const V3 = (S) => LM.venatio(S), K = (S, k) => (V3(S).kills[k] || 0);
  const BEAST_T = [['kill_wolf', 'wolf', 'Wolfsbane', 'Slay a wolf in the Venatio.', 'wolf'], ['kill_boar', 'boar', 'Boar Hunter', 'Slay a boar in the Venatio.', 'boar'], ['kill_lion', 'lion', 'Lion Slayer', 'Slay a lion in the Venatio.', 'lion'],
    ['kill_bear', 'bear', 'Bearbaiter', 'Slay a bear in the Venatio.', 'bear'], ['kill_nemean', 'nemean', 'Heracles Reborn', 'Slay the Nemean lion.', 'nemean'], ['kill_elephant', 'elephant', 'Elephant Breaker', 'Bring down a war elephant.', 'elephant']];
  const LUDUS_OLD = ['legendary', 'fullset', 'forge5', 'rich', 'lvl20', 'legend1', 'runes', 'relics6', 'faction', 'ascended']; D.TROPHIES.forEach((t) => { if (!t.cat) t.cat = LUDUS_OLD.includes(t.id) ? 'Ludus' : 'Glory'; });
  const TCX = {};
  const PG = {}; // id -> (S) => [value, max]
  const add = (id, n, d, r, ic, cat, ok, pg) => { D.TROPHIES.push({ id, n, d, r, ic, cat }); TCX[id] = ok; if (pg) PG[id] = pg; };
  BEAST_T.forEach(([id, kind, n, d, ic]) => add(id, n, d, { gold: kind === 'nemean' || kind === 'elephant' ? 400 : 100, fame: kind === 'nemean' || kind === 'elephant' ? 20 : 6 }, ic, 'Venatio', (S) => K(S, kind) >= 1, (S) => [Math.min(1, K(S, kind)), 1]));
  add('solo_lion', 'Alone with the Lion', 'Slay a lion with a single fighter on the hunt.', { gold: 250, fame: 15 }, 'lion', 'Venatio', (S) => ((V3(S).solo || {}).lion || 0) >= 1, (S) => [Math.min(1, (V3(S).solo || {}).lion || 0), 1]);
  add('menagerie', 'Master of the Menagerie', 'Win the Menagerie hunt.', { gold: 500, fame: 25, laurels: 1 }, 'cage', 'Venatio', (S) => ((V3(S).cleared || {}).menagerie || 0) >= 1, (S) => [Math.min(1, (V3(S).cleared || {}).menagerie || 0), 1]);
  add('allpelts', 'Wall of Pelts', 'Own a pelt of every kind of beast (kept or sold).', { gold: 400, fame: 20, laurels: 1 }, 'pelt', 'Venatio', (S) => (D.BEAST_IDS || []).every((k) => K(S, k) >= 1), (S) => [(D.BEAST_IDS || []).filter((k) => K(S, k) >= 1).length, (D.BEAST_IDS || []).length]);
  const st = (S, k) => (S.stats && S.stats[k]) || 0;
  add('streak5', 'Hot Streak', 'Win 5 events in a row.', { gold: 80 }, 'flame', 'Glory', (S) => st(S, 'streakBest') >= 5, (S) => [Math.min(5, st(S, 'streakBest')), 5]);
  add('streak10', 'Unbroken', 'Win 10 events in a row.', { gold: 300, fame: 15, laurels: 1 }, 'flame', 'Glory', (S) => st(S, 'streakBest') >= 10, (S) => [Math.min(10, st(S, 'streakBest')), 10]);
  add('wins100', 'Hundred Victories', 'Win 100 fights.', { gold: 900, laurels: 2 }, 'laurel', 'Glory', (S) => st(S, 'wins') >= 100, (S) => [Math.min(100, st(S, 'wins')), 100]);
  add('champ1', 'Duelist', 'Defeat the rival owner\'s champion.', { gold: 150, fame: 10 }, 'sword', 'Glory', (S) => st(S, 'champs') >= 1, (S) => [Math.min(1, st(S, 'champs')), 1]);
  add('bounty3', 'Bounty Hunter', 'Claim 3 bounties.', { gold: 200, fame: 10 }, 'scroll', 'Glory', (S) => st(S, 'bounties') >= 3, (S) => [Math.min(3, st(S, 'bounties')), 3]);
  add('pitperf', 'Flawless Descent', 'Clear 5 Pit floors in one descent without any fight ending below 40% health.', { gold: 300, fame: 15 }, 'skull', 'Glory', (S) => st(S, 'pitPerfect') >= 1, (S) => [Math.min(1, st(S, 'pitPerfect')), 1]);
  add('hurtwin', 'Walk It Off', 'Win a fight with a wounded fighter.', { gold: 100, fame: 5 }, 'bandage', 'Glory', (S) => st(S, 'hurtWins') >= 1, (S) => [Math.min(1, st(S, 'hurtWins')), 1]);
  add('hc1', 'Iron Season', 'Survive a whole season on Hardcore without a death.', { gold: 400, fame: 25, laurels: 2 }, 'shield', 'Survival', (S) => st(S, 'hcSeasons') >= 1, (S) => [Math.min(1, st(S, 'hcSeasons')), 1]);
  add('freed1', 'Cap of Liberty', 'Set a gladiator free.', { gold: 100, fame: 20 }, 'cap', 'Survival', (S) => (S.freed || []).length >= 1, (S) => [Math.min(1, (S.freed || []).length), 1]);
  add('scar2', 'Battle Scarred', 'Have a fighter carry 2 scars.', { gold: 80 }, 'scar', 'Survival', (S) => S.glads.some((g) => (g.scars || []).length >= 2), (S) => [Math.min(2, Math.max(0, ...S.glads.map((g) => (g.scars || []).length))), 2]);
  add('scar4', 'A Map of Old Wars', 'Have a fighter carry 4 scars.', { gold: 250, fame: 12 }, 'scar', 'Survival', (S) => S.glads.some((g) => (g.scars || []).length >= 4), (S) => [Math.min(4, Math.max(0, ...S.glads.map((g) => (g.scars || []).length))), 4]);
  add('memento', 'Memento Mori', 'Raise a name on the memorial wall.', { fame: 10 }, 'wreath', 'Survival', (S) => (S.fallen || []).length >= 1, (S) => [Math.min(1, (S.fallen || []).length), 1]);
  add('legends3', 'Hall of Heroes', 'Have 3 legends in the Hall.', { gold: 300, fame: 20 }, 'laurel', 'Ludus', (S) => (S.legends || []).length >= 3, (S) => [Math.min(3, (S.legends || []).length), 3]);
  add('lvl10', 'Seasoned', 'Raise a gladiator to level 10.', { gold: 150 }, 'star', 'Ludus', (S) => S.glads.some((g) => g.lvl >= 10), (S) => [Math.min(10, Math.max(0, ...S.glads.map((g) => g.lvl))), 10]);
  add('patron1', 'Well Connected', 'Complete a patron contract in full.', { gold: 120, fame: 10 }, 'coin', 'Ludus', (S) => (((S.spons || {}).done) || []).length >= 1 || st(S, 'contracts') >= 1, (S) => [Math.min(1, (((S.spons || {}).done) || []).length || st(S, 'contracts')), 1]);
  add('fame500', 'Famous', 'Reach 500 fame.', { gold: 200 }, 'fame', 'Ludus', (S) => S.fame >= 500, (S) => [Math.min(500, S.fame | 0), 500]);
  add('year1', 'A Year in the Sand', 'Play 52 weeks.', { gold: 200, laurels: 1 }, 'calendar', 'Ludus', (S) => S.week >= 52, (S) => [Math.min(52, S.week), 52]);
  add('events20', 'Storyteller', 'Meet 20 different events in the Chronicle.', { gold: 150, fame: 8 }, 'scroll', 'Ludus', (S) => Object.keys(S.evHist || {}).length >= 20, (S) => [Math.min(20, Object.keys(S.evHist || {}).length), 20]);
  LM.TCX = TCX;
  // progress for the old trophies, so every card can show a bar
  const old = { wins10: (S) => [Math.min(10, st(S, 'wins')), 10], wins50: (S) => [Math.min(50, st(S, 'wins')), 50], champ5: (S) => [Math.min(5, st(S, 'tourneys')), 5], mercy5: (S) => [Math.min(5, st(S, 'spares')), 5], upset5: (S) => [Math.min(5, st(S, 'upsets')), 5],
    pit5: (S) => [Math.min(5, S.pitBest || 0), 5], pit10: (S) => [Math.min(10, S.pitBest || 0), 10], forge5: (S) => [Math.min(5, st(S, 'merges')), 5], rich: (S) => [Math.min(5000, S.gold | 0), 5000], daily5: (S) => [Math.min(5, S.dailyBest || 0), 5] };
  Object.assign(PG, old);
  /** [value, max] for a trophy id, or null when it is a one-shot with no meaningful progress */
  LM.trophyProgress = (S, id) => { const f = PG[id]; if (!f) return null; try { const r = f(S); return r && isFinite(r[0]) ? r : null; } catch (e) { return null; } };
  const ct1 = LM.checkTrophies;
  LM.checkTrophies = (S) => {
    const out = ct1(S); S.trophies = S.trophies || {};
    D.TROPHIES.forEach((t) => { if (TCX[t.id] && !S.trophies[t.id] && TCX[t.id](S)) { S.trophies[t.id] = S.week; S.gold += t.r.gold || 0; S.fame += t.r.fame || 0; S.laurels += t.r.laurels || 0; out.push(t); } });
    return out;
  };
  const mig3 = LM.migrate;
  LM.migrate = (S) => { const N = mig3(S); N.stats = N.stats || {}; (N.glads || []).forEach((g) => { delete g.hurtFight; }); return N; };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ================================================================================================================================================
// MOVE (rearrange the ludus): fourth wrapper block, loaded last. Owner request: "move your buildings, even if it costs something".
//   LM.moveQuote(S, from, to)      what a move or swap would cost: {kind:'move'|'swap', gold, weeks:[a,b], d, fx[], ok, why}
//   LM.moveBuilding(S, from, to, {busy})   '' on success, else the reason. `to` empty = move, `to` built = swap.
//   LM.moveUndo(S, plot)           same week only, returns D.MOVE.undoRefund of the price
//   LM.moving(S, i)                the construction record {f,s,u,w,c,x} of plot i while it is still being rebuilt, else null
//   LM.moveWhySource / LM.moveWhyDest   reasons shown on the markers (pinned, under construction, locked land, ...)
//   LM.moveEffects(S, from, to)    neighbour synergy changes the move would cause (adjacency is read from position, so it is always live)
// Save: the ONLY new data is an optional `mv` object on a plot {f: other plot, s: start week, u: ready week, w: weeks, c: gold paid, x: 1 if swap}. Old saves have none;
// no schema bump is needed (readers treat a missing mv as "finished"). A building under construction has level 0 perks (LM.bfx), gives no neighbour synergy,
// cannot be upgraded or moved again, and keeps its level. Barracks keep 3 beds in tents (level 1 capacity) so the roster is never evicted.
// ================================================================================================================================================
(function (G) {
  const D = G.LM_D, LM = G.LM;
  if (!LM || LM.moveBuilding) return;
  const M = D.MOVE, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), fin = (v) => typeof v === 'number' && isFinite(v);
  const rc = (i) => [Math.floor(i / LM.COLS), i % LM.COLS];
  const r5 = (v) => Math.round(v / 5) * 5;
  LM.moveDist = (a, b) => { const [ra, ca] = rc(a), [rb, cb] = rc(b); return Math.abs(ra - rb) + Math.abs(ca - cb); };
  LM.moving = (S, i) => { const p = S.plots[i]; return p && p.mv && fin(p.mv.u) && S.week < p.mv.u ? p.mv : null; };
  /** gold put into a building over all its levels (what a move re-lays) */
  LM.moveValue = (p) => { let v = 0; for (let l = 1; l <= p.l; l++) v += D.BUILD[p.b].c0 * D.BMULT[l]; return v; };
  const rawGold = (p, d) => LM.moveValue(p) * M.rate * (0.65 + 0.35 * d) * (M.big.includes(p.b) ? M.bigMult : 1) * (p.l >= 5 ? M.lv5Mult : 1);
  const weeksFor = (p, d) => clamp(1 + (p.l >= 3 ? 1 : 0) + (p.l >= 5 ? 1 : 0) + (d >= 4 ? 1 : 0), 1, 3);
  const slotOk = (S, i) => Number.isInteger(i) && i >= 0 && i < 16 && i < S.rows * LM.COLS;

  LM.moveWhySource = (S, i) => {
    if (!Number.isInteger(i) || i < 0 || i >= 16) return 'No such plot';
    const p = S.plots[i]; if (!p) return 'Nothing to move here';
    if (M.pinned[p.b]) return M.pinned[p.b];
    if (LM.moving(S, i)) return 'Still under construction';
    return '';
  };
  LM.moveWhyDest = (S, from, to) => {
    if (!slotOk(S, to)) return 'Unclaimed land. Buy the row first.';
    if (to === from) return 'It is already here';
    const q = S.plots[to]; if (!q) return '';
    if (M.pinned[q.b]) return `${D.BUILD[q.b].n} cannot be moved, so it cannot swap`;
    if (LM.moving(S, to)) return `${D.BUILD[q.b].n} is still under construction`;
    return '';
  };
  /** the busy rules every move has to pass: a fight or event in progress (opts.busy from the UI, S.pendingEv from the sim) */
  const busyWhy = (S, opts) => (opts && opts.busy ? 'Not while a fight or event is in progress' : S.pendingEv ? 'Answer the pending event first' : '');

  LM.moveEffects = (S, from, to) => {
    const sim = { plots: S.plots.map((p) => (p ? { b: p.b, l: p.l } : null)), week: S.week };
    const before = {}; D.BUILD_IDS.forEach((id) => { const i = LM.plotOf(sim, id); before[id] = i < 0 ? 0 : LM.synAt(sim, i); });
    const a = sim.plots[from], b = sim.plots[to]; sim.plots[to] = a; sim.plots[from] = b || null;
    const out = [];
    D.BUILD_IDS.forEach((id) => { const i = LM.plotOf(sim, id); const n = i < 0 ? 0 : LM.synAt(sim, i); const was = before[id]; if (n !== was && D.BUILD[id].syn) out.push({ b: id, was, now: n, pct: (n - was) * 10 }); else if (n !== was) out.push({ b: id, was, now: n, pct: 0 }); });
    return out;
  };

  LM.moveQuote = (S, from, to) => {
    const bad = LM.moveWhySource(S, from) || LM.moveWhyDest(S, from, to);
    if (bad) return { ok: false, why: bad, gold: 0, weeks: [0, 0], d: 0, kind: S.plots[to] ? 'swap' : 'move', fx: [] };
    const A = S.plots[from], B = S.plots[to], d = LM.moveDist(from, to);
    if (!B) { const gold = Math.max(M.minGold, r5(rawGold(A, d))); return { ok: true, why: '', kind: 'move', gold, weeks: [weeksFor(A, d), 0], d, fx: LM.moveEffects(S, from, to), big: M.big.includes(A.b) || A.l >= 5 }; }
    const gold = Math.max(M.minGold, r5((rawGold(A, d) + rawGold(B, d)) * M.swapRate));
    return { ok: true, why: '', kind: 'swap', gold, weeks: [Math.max(1, weeksFor(A, d) - 1), Math.max(1, weeksFor(B, d) - 1)], d, fx: LM.moveEffects(S, from, to), big: M.big.includes(A.b) || M.big.includes(B.b) || A.l >= 5 || B.l >= 5 };
  };

  LM.moveBuilding = (S, from, to, opts) => {
    const why = busyWhy(S, opts); if (why) return why;
    const q = LM.moveQuote(S, from, to); if (!q.ok) return q.why;
    if (S.gold < q.gold) return `Not enough gold (need ${q.gold})`;
    S.gold -= q.gold;
    const A = S.plots[from], B = S.plots[to];
    if (q.kind === 'move') { S.plots[to] = A; S.plots[from] = null; A.mv = { f: from, s: S.week, u: S.week + q.weeks[0], w: q.weeks[0], c: q.gold }; }
    else { S.plots[to] = A; S.plots[from] = B; A.mv = { f: from, s: S.week, u: S.week + q.weeks[0], w: q.weeks[0], c: q.gold, x: 1 }; B.mv = { f: to, s: S.week, u: S.week + q.weeks[1], w: q.weeks[1], c: 0, x: 1 }; }
    S.stats = S.stats || {}; S.stats.moves = (S.stats.moves || 0) + 1; S.stats.moveGold = (S.stats.moveGold || 0) + q.gold;
    return '';
  };

  /** can plot i's move still be undone? -> {ok, refund, why} (same week only, never after the work is done) */
  LM.moveUndoInfo = (S, i) => {
    const p = S.plots[i], m = p && p.mv; if (!m || !LM.moving(S, i)) return { ok: false, refund: 0, why: 'Nothing to undo' };
    if (m.s !== S.week) return { ok: false, refund: 0, why: 'The crew has already started: undo is only possible in the week of the move' };
    if (!Number.isInteger(m.f) || m.f < 0 || m.f > 15) return { ok: false, refund: 0, why: 'Nothing to undo' };
    const other = S.plots[m.f]; const paid = m.x ? (m.c || (other && other.mv ? other.mv.c : 0) || 0) : m.c;
    return { ok: true, refund: Math.floor(paid * M.undoRefund), why: '' };
  };
  LM.moveUndo = (S, i) => {
    const info = LM.moveUndoInfo(S, i); if (!info.ok) return info.why;
    const p = S.plots[i], m = p.mv, f = m.f;
    if (m.x) { const o = S.plots[f]; if (!o || !o.mv) return 'Nothing to undo'; delete p.mv; delete o.mv; S.plots[i] = o; S.plots[f] = p; }
    else { if (S.plots[f]) return 'The old plot is taken'; delete p.mv; S.plots[f] = p; S.plots[i] = null; }
    S.gold += info.refund; S.stats = S.stats || {}; S.stats.moves = Math.max(0, (S.stats.moves || 0) - 1); S.stats.moveGold = Math.max(0, (S.stats.moveGold || 0) - info.refund);
    return '';
  };

  // ---- perks pause while a building is under construction
  const bfx0 = LM.bfx;
  LM.bfx = (S, id) => { const i = LM.plotOf(S, id); if (i >= 0 && LM.moving(S, i)) { const B = D.BUILD[id]; return { l: 0, syn: 0, v: B.v[0], i, building: true }; } return bfx0(S, id); };
  const syn0 = LM.synAt;
  LM.synAt = (S, i) => { const p = S.plots[i]; if (!p || LM.moving(S, i)) return 0; const like = D.BUILD[p.b].like; return LM.neighbors(i).filter((n) => S.plots[n] && !LM.moving(S, n) && like.includes(S.plots[n].b)).length; };
  void syn0;
  const cap0 = LM.rosterCap;
  LM.rosterCap = (S) => { const i = LM.plotOf(S, 'barracks'); return i >= 0 && LM.moving(S, i) ? D.BUILD.barracks.v[1] : cap0(S); };
  const up0 = LM.upgrade;
  LM.upgrade = (S, i) => (LM.moving(S, i) ? 'Under construction' : up0(S, i));

  // ---- weekly: finished work is reported and the record dropped
  const wk0 = LM.extWeek;
  LM.extWeek = (S, rep) => {
    if (wk0) wk0(S, rep);
    S.plots.forEach((p) => { if (p && p.mv && S.week >= p.mv.u) { if (rep && rep.notes) rep.notes.push(`The crew has finished the ${D.BUILD[p.b].n} in its new place. Its perks are back.`); delete p.mv; } });
  };
  // ---- save: an optional field, validated on load (old saves simply have none)
  const mig4 = LM.migrate;
  LM.migrate = (S) => {
    const N = mig4(S);
    (N.plots || []).forEach((p) => { if (!p || !p.mv) return; const m = p.mv; if (typeof m !== 'object' || !fin(m.u) || !fin(m.s) || N.week >= m.u) delete p.mv; else { m.f = Number.isInteger(m.f) && m.f >= 0 && m.f < 16 ? m.f : -1; m.c = fin(m.c) ? m.c : 0; m.w = fin(m.w) ? m.w : Math.max(1, m.u - m.s); } });
    return N;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
