// Ludus Maximus 3D: simulation extensions (no DOM). Loaded after sim.js. Everything here is data on the save object S
// and pure functions on LM, so the headless tests in tests/ludus_maximus_3d.test.mjs can drive it.
//   1. THE FALLEN   mortality, fall(), memorial wall S.fallen, grief, heirs, legacy fame      (Hardcore option: S.opts.hardcore)
//   2. RIVAL LUDI   four rival schools with personalities, standings, diplomacy, alliances   (S.ludi)
//   3. CALENDAR     the 12 weeks of the season at a glance (festivals, big events, your entries)
//   4. BARRACKS     mentorship pairs, feasts                                                  (S.mentors, S.feastWeek)
// Philosophy: no counter mechanics. Nothing here punishes a style choice; risk is explicit, shown before you take it, and softened by buildings.
(function (G) {
  const D = G.LM_D, LM = G.LM;
  if (!LM || LM.mortality) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = () => LM.rand();
  const pick = (arr, r) => arr[Math.floor((r || rnd)() * arr.length)];
  const lvlOf = (S, id) => LM.bfx(S, id).l;

  // =========================================================== 1. THE FALLEN
  const RISK = { pit: 0.07, horde: 0.06, champ: 0.08, bounty: 0.1, event: 0.04 };
  LM.RISK_KINDS = Object.keys(RISK);
  LM.hardcore = (S) => !!(S && S.opts && S.opts.hardcore);
  /** chance (0..0.6) that a fighter who just LOST dies. o: {kind, depth, boss}. Events outside the risk modes only kill in Hardcore. */
  LM.mortality = (S, g, o) => {
    o = o || {}; const kind = RISK[o.kind] != null ? o.kind : 'event', hc = LM.hardcore(S);
    if (kind === 'event' && !hc) return 0;
    const depth = Math.max(1, (o.depth | 0) || 1);
    let c = RISK[kind] + (kind === 'pit' ? 0.035 : kind === 'horde' ? 0.025 : 0) * (depth - 1) + (o.boss ? 0.08 : 0);
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
    LM.forumAdd(S, `${e.name} fell in the ${e.kind === 'pit' ? 'Pit' : e.kind === 'horde' ? 'Horde Trial' : e.kind === 'champ' ? 'champion duel' : e.kind === 'bounty' ? 'bounty hunt' : 'arena'}.`);
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

  // =========================================================== weekly hook (called by sim.js weekFinish)
  LM.extWeek = (S, rep) => {
    S.glads.forEach((g) => { if (g.grief > 0) { g.mo = clamp(g.mo - 3, 0, 100); g.grief--; if (g.grief === 0) rep.notes.push(`${g.name} grieves less. The ludus finds its footing.`); } });
    const lf = LM.legacyFame(S); if (lf) { S.fame += lf; rep.notes.push(`The memorial wall draws pilgrims: +${lf} fame.`); }
    LM.mentorWeek(S, rep); LM.ludiWeek(S, rep);
  };
  // founding a new ludus keeps the memorial wall
  const ascend0 = LM.ascend;
  LM.ascend = (S) => { const N = ascend0(S); N.fallen = (S.fallen || []).slice(); return N; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
