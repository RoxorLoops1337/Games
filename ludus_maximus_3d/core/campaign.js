// Ludus Maximus 3D: depth wave 10, module "campaign" (no DOM). Loaded after arena.js (index.html script tag; in Node arena.js requires it at its tail).
// CAMPAIGN: the story spine. Five chapters tied to the leagues, a named nemesis who remembers what you did to him, branching scenes whose flags
// carry across chapters, three endings (glory, freedom, ruin) and an epilogue. State lives on S.camp (optional, created lazily from S.seed).
// Rules: optional save fields only (old saves must load), no global rnd() draws that change an existing stream order (every roll here is a hash of the seed
// or a private mulberry), never add unit fields (core/arena.js blankUnit owns that). Every wrapper keeps the old behaviour when S.camp is absent.
// UI: js/screens/campaign.js (scenes, Story tab, epilogue), js/ceremonies.js (chapter card, finale). No em dashes in any text.
(function (G) {
  const D = G.LM_D, L = G.LM;
  if (!D || !L || L.campaign) return;
  const clamp = L.clamp, hash = L.hash, mul = L.mulberry;
  const C = L.campaign = { ver: 1 };

  // ================================================================ data: chapters
  // from/to: the fame span of the chapter. Beats unfold with progress through it; when progress reaches 1 and every beat was told, the finale bout opens.
  const CHS = [
    { n: 'I', t: 'Dust and Debts', lg: 0, from: 0, to: 90, line: 'A failing ludus, a restless town and a name nobody knows.', goal: 'Win fame in the Pit, then face the Pit Lord.', fin: "The Pit Lord's Gate" },
    { n: 'II', t: "The Governor's Eye", lg: 1, from: 90, to: 330, line: 'Provincial crowds, provincial money, and a man who keeps a list.', goal: 'Rise in the Provincial Games and settle the quarrel in public.', fin: "The Governor's Final" },
    { n: 'III', t: 'Marble and Blood', lg: 2, from: 330, to: 1050, line: 'The Colosseum swallows names. Yours has to be louder than the stone.', goal: 'Make the Colosseum remember you, then beat its champion.', fin: 'The Colosseum Champion' },
    { n: 'IV', t: 'The Purple Rumour', lg: 2, from: 1050, to: 1700, line: 'Word reaches the palace. Word is never free.', goal: 'Hold your house together while the palace watches.', fin: 'The Account Is Settled' },
    { n: 'V', t: "The Emperor's Games", lg: 3, from: 1700, to: 2700, line: 'One day of games, and every choice you made comes to the gate.', goal: 'Reach the Imperial Games and win the day.', fin: "The Emperor's Day" },
  ];
  C.CH = CHS;
  const GS = [1, 1.8, 3.5, 6, 9], FS = [1, 2.2, 5, 9, 15], XS = [1, 1.6, 2.4, 3.2, 4];
  const g5 = (n) => Math.max(5, Math.round(n / 5) * 5);

  // ================================================================ data: the cast
  const POOL = {
    doc: [['Tarquin the Limp', 'Tarquin'], ['Old Brasidas', 'Brasidas'], ['Cato the Grey', 'Cato'], ['Nestor of Rhodes', 'Nestor'], ['Silvanus Scarback', 'Silvanus']],
    sen: [['Senator Aemilius Pavo', 'Aemilius'], ['Senator Valeria Corva', 'Valeria'], ['Senator Gaius Fulvus', 'Fulvus'], ['Senator Livia Marcella', 'Livia']],
    pri: [['Calpurnia of Fortuna', 'Calpurnia'], ['Ocellia of Vesta', 'Ocellia'], ['Sabina of Nemesis', 'Sabina']],
    av: ['Quintus', 'Lucilla', 'Marcellus', 'Sabinus', 'Cornelia', 'Decimus'],
  };
  // the nemesis: four rival champions, each tied to the rival school of the same nature (ext.js ludi). Style and trait feed the real fighter.
  const NEM = [
    { id: 'brennus', name: 'Brennus', nick: 'the Unbowed', from: 'a village of the Arverni', style: 'murmillo', trait: 'ironjaw', pers: 'brutal', g: 'm', col: '#7a2f2f',
      grudge: 'Your ludus bought the paper that put him on the sand. He was a free smith with a forge and a sister. He remembers the stamp on the contract.',
      cry: 'I was a man before I was a number. You made me a number.', kin: 'his sister Brenna' },
    { id: 'zenon', name: 'Zenon', nick: 'Quicksilver', from: 'the docks of Tarsus', style: 'retiarius', trait: 'coolhead', pers: 'cunning', g: 'm', col: '#2c6a8a',
      grudge: 'You outbid his school for the doctore who trained you both. He says every move you teach is a move he was owed, and he keeps the account in his head.',
      cry: 'Everything you do, I was taught first. I will take it back, one wrist at a time.', kin: 'his old doctore' },
    { id: 'varia', name: 'Varia', nick: 'the Magpie', from: 'the salt flats of Ostia', style: 'thraex', trait: 'grudge', pers: 'greedy', g: 'f', col: '#8a6a1c',
      grudge: 'The man who owned your ludus before you sold her contract for forty denarii when she was sixteen. She has priced you at the same, and she is patient.',
      cry: 'Forty denarii. I counted them twice. Now I am here to count yours.', kin: 'her little brother' },
    { id: 'rufus', name: 'Rufus Scaeva', nick: 'the Heron', from: 'the freedmen of Puteoli', style: 'hoplomachus', trait: 'underdog', pers: 'honorable', g: 'm', col: '#4a7a3a',
      grudge: 'Five years ago a champion of your house cut his tendon in a bout that should have been stopped. He came back anyway, slower and wiser, wanting one clean bout with the name on your gate.',
      cry: 'No tricks, no tricks. Just the two of us, and the truth of it.', kin: 'his old comrade' },
  ];
  C.NEM = NEM;
  // what the nemesis does with a battle plan as he grows (used by the oppPlan wrapper in team fights; the dossier prints these before you commit)
  const TAC = [
    { n: 'Plain steel', d: 'No tricks yet. He fights his style and nothing else.', form: 'line', show: 0, hunt: false },
    { n: 'Takes the front', d: 'In a team he leads a wedge and draws your line onto himself.', form: 'wedge', role: 'vanguard', show: 0, hunt: false },
    { n: 'Hunts your champion', d: 'In a team he marks the fighter who last beat him and his whole side follows.', form: 'pincer', role: 'hunter', show: 0, hunt: true },
    { n: 'Plays the stands', d: 'Cocky and dangerous. He stops to salute the crowd, so he is slower to strike, and he hits harder than before.', form: 'pincer', role: 'hunter', show: 1, hunt: true },
  ];
  C.TAC = TAC;
  const SCAR_ORDER = ['gash_scar', 'lost_eye', 'old_ribs', 'stiff_arm', 'ringing', 'bad_knee'];

  // ================================================================ state
  const live = (S) => !!(S && S.week >= 3 && !(S.flags && S.flags.tut && typeof S.flags.tut === 'object' && !S.flags.tut.done));
  C.ready = live;
  /** the campaign state; created lazily and deterministically from the seed. Returns null until week 3 so a new game is never touched. */
  C.get = (S, force) => {
    if (!S) return null;
    if (S.camp && S.camp.v === 1 && S.camp.nem) return S.camp;
    if (!force && S.week < 3) return null;
    return (S.camp = make(S));
  };
  function make(S) {
    const r = mul(hash(S.seed + '|cast')), pk = (a) => a[Math.floor(r() * a.length)];
    const doc = pk(POOL.doc), sen = pk(POOL.sen), pri = pk(POOL.pri), av = pk(POOL.av);
    const ai = hash(S.seed + '|nem') % NEM.length, A = NEM[ai];
    let school = null, lan = 'the rival lanista';
    try { const li = L.ludiInit(S); school = li.list.find((l) => l.pers === A.pers) || li.list[0]; lan = school.owner; } catch (e) { /* no ludi */ }
    const look = { skin: D.SKIN[Math.floor(r() * D.SKIN.length)], hair: D.HAIR[Math.floor(r() * D.HAIR.length)], plume: D.PLUME[Math.floor(r() * D.PLUME.length)], face: Math.floor(r() * 3), color: A.col };
    let ch = 1; if (S.week > 12 || S.fame > 40) CHS.forEach((x, i) => { if (S.fame >= x.from && S.fame > 0) ch = i + 1; });
    const c = {
      v: 1, ch, seen: {}, flags: {}, q: [], log: [], done: {}, card: ch, lastBeat: S.week - 2, fin: null, end: null, started: S.week,
      cast: { doc: doc[0], docS: doc[1], sen: sen[0], senS: sen[1], pri: pri[0], priS: pri[1], lan, lanS: String(lan).split(' ')[0], school: school ? school.name : 'the rival school', schoolId: school ? school.id : null, av: av },
      nem: { a: ai, name: A.name, nick: A.nick, style: A.style, trait: A.trait, school: school ? school.name : 'the rival school', state: 'rival', stage: 1, w: 0, l: 0, hum: 0, met: 0, scars: [], fates: [], intro: false, next: null, lastMeet: 0, mark: null, ign: 0, look, prev: null, trust: 0, sincere: null, ring: 0 },
      cfate: {}, stake: 0,
    };
    for (let i = 1; i < ch; i++) { c.done[i] = -1; for (const b of BEATS) if (b.ch === i) c.seen[b.id] = -1; }
    if (ch > 1) { c.nem.intro = true; c.nem.next = S.week + 2; c.nem.stage = clamp(ch, 1, 4); c.nem.scars = SCAR_ORDER.slice(0, Math.min(2, ch - 1)); }
    c.fel = null;
    return c;
  }
  C.chapter = (S) => { const c = C.get(S); return c ? CHS[clamp(c.ch, 1, 5) - 1] : null; };
  /** 0..1 through the current chapter's fame span (1 when the chapter is past its end) */
  C.progress = (S) => { const c = C.get(S); if (!c || c.ch > 5) return 1; const x = CHS[c.ch - 1]; return clamp((S.fame - x.from) / (x.to - x.from), 0, 1); };
  const logAdd = (S, c, t) => { c.log.push({ wk: S.week, ch: c.ch, t }); if (c.log.length > 60) c.log.splice(0, c.log.length - 60); };

  // ================================================================ names, tokens, conditions
  const he = (n) => (NEM[n.a].g === 'f' ? { he: 'she', He: 'She', him: 'her', his: 'her', His: 'Her' } : { he: 'he', He: 'He', him: 'him', his: 'his', His: 'His' });
  const fellow = (S, c) => {
    let g = c && c.fel != null ? S.glads.find((x) => x.id === c.fel) : null;
    if (!g) { g = S.glads.slice().sort((a, b) => (b.fame || 0) - (a.fame || 0) || a.id - b.id)[0] || null; if (g && c) c.fel = g.id; }
    return g;
  };
  C.fellow = fellow;
  /** replace {tokens} in story text */
  C.fill = (S, text) => {
    const c = S.camp; if (!c) return text; const p = he(c.nem), f = fellow(S, c), A = NEM[c.nem.a];
    const map = {
      doc: c.cast.docS, docF: c.cast.doc, sen: c.cast.senS, senF: c.cast.sen, pri: c.cast.priS, priF: c.cast.pri, lan: c.cast.lanS, lanF: c.cast.lan, school: c.cast.school,
      nem: c.nem.name, nick: c.nem.nick, from: A.from, grudge: A.grudge, cry: A.cry, kin: A.kin, prev: c.nem.prev || c.nem.name, av: c.nem.name,
      fel: f ? f.name : 'a veteran of your house', ludus: S.name || 'your ludus', he: p.he, He: p.He, him: p.him, his: p.his, His: p.His,
    };
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (map[k] != null ? map[k] : m));
  };
  const hasFate = (c, id) => c.nem.fates.some((f) => f.id === id);
  const TERMS = {
    fallen: (S) => (S.fallen || []).length > 0, spared: (S, c) => hasFate(c, 'spare'), killed: (S, c) => !!c.nem.prev || hasFate(c, 'kill'), ransomed: (S, c) => hasFate(c, 'ransom'),
    lost: (S, c) => c.nem.l > 0, hum: (S, c) => c.nem.hum > 0, met: (S, c) => c.nem.met > 0, unmet: (S, c) => c.nem.met === 0,
    loan: (S, c) => !!c.flags.loan && !c.flags.loanPaid, debt: (S, c) => !!c.flags.debt && !c.flags.debtPaid, fellow: (S) => S.glads.length > 0,
    room: (S) => S.glads.length < L.rosterCap(S), scarred: (S, c) => c.nem.scars.length > 0,
  };
  /** 'a&!b&@ally&spared': flags, !negation, @nemesis-state, named terms */
  C.cond = (S, c, expr) => {
    if (!expr) return true;
    return String(expr).split('|').some((orp) => orp.split('&').every((raw) => {
      let t = raw.trim(), neg = false; if (t[0] === '!') { neg = true; t = t.slice(1); }
      let v; if (t[0] === '@') v = c.nem.state === t.slice(1); else if (TERMS[t]) v = !!TERMS[t](S, c); else v = !!c.flags[t];
      return neg ? !v : v;
    }));
  };

  // ================================================================ rewards and effects
  const scale = (c, k, n) => (k === 'gold' ? g5(n * GS[clamp(c.ch, 1, 5) - 1]) : k === 'fame' ? Math.max(1, Math.round(n * FS[clamp(c.ch, 1, 5) - 1])) : k === 'xp' ? Math.round(n * XS[clamp(c.ch, 1, 5) - 1]) : n);
  /** the exact numbers of an effect object, as chips: [{t, tone}] */
  C.chips = (S, fx, c) => {
    c = c || S.camp; const out = [], sg = (n) => (n > 0 ? '+' : '') + n;
    if (!fx) return out;
    if (fx.gold) { const v = scale(c, 'gold', fx.gold); out.push({ t: `${sg(v)} gold`, tone: v > 0 ? 'good' : 'bad' }); }
    if (fx.fame) { const v = scale(c, 'fame', fx.fame); out.push({ t: `${sg(v)} fame`, tone: v > 0 ? 'good' : 'bad' }); }
    for (const [k, nm] of [['sen', 'Senate'], ['mer', 'Merchants'], ['ple', 'Plebs']]) if (fx[k]) out.push({ t: `${nm} ${sg(fx[k])}`, tone: fx[k] > 0 ? 'good' : 'bad' });
    if (fx.xp) out.push({ t: `+${scale(c, 'xp', fx.xp)} XP to every fighter`, tone: 'good' });
    if (fx.mo) out.push({ t: `${sg(fx.mo)} morale, all fighters`, tone: fx.mo > 0 ? 'good' : 'bad' });
    if (fx.en) out.push({ t: `${sg(fx.en)} energy, all fighters`, tone: fx.en > 0 ? 'good' : 'bad' });
    if (fx.tire) out.push({ t: `Your best fighter loses ${fx.tire} energy and 5 morale`, tone: 'bad' });
    if (fx.item) out.push({ t: `A ${D.RAR[clamp(fx.item, 0, 4)].n || 'rare'} item`, tone: 'good' });
    if (fx.recruit) out.push({ t: 'A fighter joins your ludus', tone: 'good' });
    if (fx.grief) out.push({ t: 'Every fighter is released from grief', tone: 'good' });
    if (fx.stake) out.push({ t: `Stake ${stakeOf(S)} gold now. Win: ${stakeOf(S) * 4} back. Lose: Ruin`, tone: 'warn' });
    if (fx.note) out.push({ t: fx.note, tone: 'warn' });
    return out;
  };
  const stakeOf = (S) => clamp(Math.floor(S.gold * 0.6), 0, 3000);
  const why = (S, c, ch) => {
    if (ch.fx && ch.fx.gold < 0 && S.gold < scale(c, 'gold', -ch.fx.gold)) return 'Not enough gold';
    if (ch.fx && ch.fx.stake && stakeOf(S) < 50) return 'You have nothing worth staking';
    if (ch.fx && ch.fx.recruit && S.glads.length >= L.rosterCap(S)) return 'Barracks full';
    if (ch.need === 'room' && S.glads.length >= L.rosterCap(S)) return 'Barracks full';
    if (ch.need === 'fellow' && !S.glads.length) return 'No fighters';
    return '';
  };
  const rngFor = (S, tag) => mul(hash(S.seed + '|' + tag + '|' + S.week));
  const addGold = (S, n) => { S.gold = Math.max(0, S.gold + n); };
  /** apply an effect object. Returns the list of what happened (strings). Never draws the global random stream. */
  function applyFx(S, c, fx, tag) {
    const out = []; if (!fx) return out;
    const r = rngFor(S, 'fx' + tag);
    if (fx.gold) { const v = scale(c, 'gold', fx.gold); addGold(S, v); out.push(`${v > 0 ? '+' : ''}${v} gold`); }
    if (fx.fame) { const v = scale(c, 'fame', fx.fame); S.fame = Math.max(0, S.fame + v); out.push(`${v > 0 ? '+' : ''}${v} fame`); }
    for (const k of ['sen', 'mer', 'ple']) if (fx[k] && L.facGain) L.facGain(S, k, fx[k]);
    if (fx.mo) S.glads.forEach((g) => { g.mo = clamp(g.mo + fx.mo, 0, 100); });
    if (fx.en) S.glads.forEach((g) => { g.en = clamp(g.en + fx.en, 0, 100); });
    if (fx.xp) { const v = scale(c, 'xp', fx.xp); L.withRandom(r, () => S.glads.forEach((g) => { L.addXp(g, v); })); }
    if (fx.tire) { const f = S.glads.slice().sort((a, b) => b.lvl - a.lvl || a.id - b.id)[0]; if (f) { f.en = clamp(f.en - fx.tire, 0, 100); f.mo = clamp(f.mo - 5, 0, 100); out.push(`${f.name} is worn out`); } }
    if (fx.grief) S.glads.forEach((g) => { if (g.grief > 0) g.grief = 0; });
    if (fx.item) { const it = L.withRandom(r, () => L.genItem(r, { league: CHS[clamp(c.ch, 1, 5) - 1].lg, ilvl: 4 + c.ch * 4, rar: clamp(fx.item, 0, 4), luck: 0 })); const sold = L.addItem(S, it); out.push(`${it.name}${sold ? ' (the armory was full, one old piece was sold)' : ''}`); c.lastItem = it.name; }
    if (fx.recruit) { const g = recruit(S, c, r); if (g) out.push(`${g.name} joins your ludus`); }
    if (fx.stake) { c.stake = stakeOf(S); addGold(S, -c.stake); out.push(`${c.stake} gold staked`); }
    return out;
  }
  function recruit(S, c, r) {
    if (S.glads.length >= L.rosterCap(S)) { addGold(S, scale(c, 'gold', 40)); return null; }
    const style = D.STYLE_IDS[Math.floor(r() * D.STYLE_IDS.length)], lvl = Math.max(2, Math.round(2 + c.ch * 3.5));
    const g = L.withRandom(r, () => L.makeGlad({ r, id: S.nextId++, style, lvl, q: 0.75 }));
    g.act = 'rest'; g.en = 100; g.mo = 85; L.withRandom(r, () => L.assignStory(g)); g.fame = 0; S.glads.push(g); return g;
  }

  // ================================================================ the nemesis as a real fighter
  const GROW = (n) => ({ lvlB: clamp(n.stage - 3 + (n.l > 0 ? 1 : 0), 0, 2), pw: 1.03 + 0.03 * (n.stage - 1) });
  const stageOf = (c) => clamp(c.ch + (c.nem.l >= 2 ? 1 : 0), 1, 4);
  const nemCache = new Map();
  /** the nemesis (or his successor) as an opponent glad, deterministic for the same state. base = the level of the fighter he replaces. */
  C.nemGlad = (S, league, base, opt) => {
    const c = S.camp, n = c.nem, o = opt || {}; const key = [S.seed, n.name, n.stage, n.l, n.w, n.scars.join('+'), n.state, league, base, o.up | 0, o.ease | 0].join('|');
    let g = nemCache.get(key); if (g) return JSON.parse(JSON.stringify(g));
    const r = mul(hash(S.seed + '|nemg|' + n.name + '|' + n.stage)), G2 = GROW(n);
    const rv = { id: 'nem', name: n.name, nick: n.nick, ludus: n.school, style: n.style, trait: n.trait, skin: n.look.skin, hair: n.look.hair, plume: n.look.plume, face: n.look.face, color: n.look.color };
    const lvl = Math.max(1, base + G2.lvlB + (o.up | 0) - (o.ease | 0));
    g = L.withRandom(r, () => L.mkOpp(S, rv, lvl, G2.pw, r, league, true)); // gear ids use the global stream: keep it private
    D.STATS.forEach((s) => { g.st[s] *= 1 + 0.015 * (n.stage - 1); });
    g.nem = n.state === 'avenger' ? 2 : 1; g.scars = n.scars.slice(); g.title = n.nick;
    if (n.stage >= 3) { const have = new Set(g.techs), pool = D.TECH_POOL.filter((t) => !have.has(t)); for (let i = 0; i < n.stage - 2 && pool.length; i++) g.techs.push(pool.splice(Math.floor(r() * pool.length), 1)[0]); }
    if (nemCache.size > 80) nemCache.clear(); nemCache.set(key, JSON.parse(JSON.stringify(g)));
    return g;
  };
  const CHAMP = [['Gorgo', 'the Pit Lord', 'hoplomachus'], ['Hector Vane', 'the Governor\'s Favourite', 'thraex'], ['Magnus', 'the Colossus', 'murmillo'], ['Aurelian', 'the Purple Shield', 'dimachaerus'], ['Carus', "the Emperor's Champion", 'hoplomachus']];
  function champGlad(S, ch, league, base, ease) {
    const [nm, nk, st] = CHAMP[ch - 1], r = mul(hash(S.seed + '|champ' + ch));
    const rv = { id: 'cf' + ch, name: nm, nick: nk, ludus: ch === 5 ? 'The Imperial Barracks' : 'The Arena', style: st, trait: ['ironjaw', 'coolhead', 'hothead', 'grudge', 'bloodlust'][ch - 1], skin: D.SKIN[Math.floor(r() * 6)], hair: D.HAIR[Math.floor(r() * 6)], plume: D.PLUME[Math.floor(r() * 7)], face: Math.floor(r() * 3), color: '#6a6a78' };
    const g = L.withRandom(r, () => L.mkOpp(S, rv, Math.max(1, base + 1 - (ease | 0)), 1.05, r, league, true)); g.cf = ch; g.title = nk; g.rv = null; g.id = 'ocf' + ch + ':' + g.lvl; return g;
  }
  /** a glad-like stand-in for a portrait of a speaker (never saved) */
  C.speakerGlad = (S, who) => {
    const c = C.get(S); if (!c) return null;
    if (who === 'nem') return C.nemGlad(S, CHS[c.ch - 1].lg, 4 + c.ch * 3, {});
    if (who === 'fel') return fellow(S, c);
    if (who === 'doc') {
      const r = mul(hash(S.seed + '|docg')), g = L.makeGlad({ r, id: 'npc-doc', style: 'hoplomachus', name: c.cast.docS, nick: '', lvl: 9, q: 0.5, trait: 'ironjaw', skin: D.SKIN[2 + Math.floor(r() * 3)], hair: '#6b6b73', face: 1 });
      g.scars = ['stiff_arm', 'gash_scar']; return g;
    }
    return null;
  };

  // ================================================================ hooks: events, plan, fate, settle
  const ev0 = L.events;
  L.events = (S, week, league) => {
    const out = ev0(S, week, league), c = S && S.camp;
    if (!c || !c.nem) return out;
    try { inject(S, c, week, league, out); } catch (e) { /* the schedule is never broken by the story */ }
    return out;
  };
  const nemOn = (c) => c.nem.intro && (c.nem.state === 'rival' || c.nem.state === 'avenger' || c.nem.state === 'traitor');
  function inject(S, c, week, league, out) {
    const n = c.nem, lg = CHS[clamp(c.ch, 1, 5) - 1].lg;
    // the finale: every week from the day it opens until it is won
    if (c.fin && league === c.fin.lg && week >= c.fin.wk) {
      const even = out.find((e) => e.kind === 'duel' && e.diff === 1) || out[0], x = CHS[c.fin.ch - 1], base = even ? even.opps[0].lvl : 5, L0 = D.LEAGUES[league], ease = Math.min(2, c.fin.tries | 0);
      const useNem = nemOn(c) && (c.fin.ch === 2 || c.fin.ch === 4 || (c.fin.ch === 5 && n.state !== 'dead'));
      const foe = useNem ? C.nemGlad(S, league, base, { up: 1 + (c.fin.ch === 5 && n.state === 'traitor' ? 1 : 0), ease }) : champGlad(S, c.fin.ch, league, base, ease);
      out.push({ key: `${week}:${league}:cf`, kind: 'duel', week, league, diff: 2, camp: 'cf', title: `Finale: ${x.fin}`, size: 1, opps: [foe], purse: Math.round(L0.purse * 3.2), fame: Math.round(L0.fameWin * 4), fee: 0 });
    }
    const nl = n.lg != null ? n.lg : Math.min(lg, L.maxLeague ? L.maxLeague(S) : lg);
    if (!nemOn(c) || league !== nl) return;
    // the grudge match replaces the "even" duel on his appointed weeks
    if (n.next != null && (week === n.next || week === n.next + 1) && !(c.fin && c.fin.wk <= week)) {
      const i = out.findIndex((e) => e.key === `${week}:${league}:d1`);
      if (i >= 0) {
        const e = out[i], foe = C.nemGlad(S, league, e.opps[0].lvl, {});
        out[i] = Object.assign({}, e, { camp: 'nem', title: `Grudge Match: ${n.name}`, opps: [foe], purse: Math.round(e.purse * 1.3), fame: Math.round(e.fame * 1.4) });
      }
      return;
    }
    // in the brackets: a seeded slot, only when he has been introduced and is not about to get his own match
    if (n.stage >= 1 && week > (n.lastMeet || 0) + 2 && !(n.next != null && week >= n.next - 1 && week <= n.next + 1)) {
      const roll = hash(S.seed + '|nb|' + week) % 100;
      for (const e of out) {
        if ((e.kind === 'tourney' && roll < 55) || (e.kind === 'grand' && roll < 80)) {
          const k = e.kind === 'grand' ? 2 : 1; if (e.opps.length > k) { e.opps = e.opps.slice(); e.opps[k] = C.nemGlad(S, league, e.opps[k].lvl, {}); e.camp = 'nemb'; e.title = `${e.title}`; }
        } else if (e.kind === 'team' && n.stage >= 2 && roll < 45) {
          e.opps = e.opps.slice(); e.opps[0] = C.nemGlad(S, league, e.opps[0].lvl, {}); e.camp = 'nemb';
        }
      }
    }
  }
  const plan0 = L.oppPlan;
  /** the nemesis plays by his stage: in a team he forms a wedge or a pincer, takes the hunter role and marks the fighter who last beat him; a solo showman at stage 4 */
  L.oppPlan = (S, opps, gl) => {
    const p = plan0(S, opps, gl); const c = S && S.camp; if (!p || !c || !c.nem || !opps) return p;
    const i = opps.findIndex((o) => o && o.nem); if (i < 0) return p;
    const t = TAC[clamp(c.nem.stage, 1, 4) - 1], n = opps.length;
    if (n === 1) { p.show = t.show; return p; }
    if (L.FORMS[t.form]) { p.form = t.form; const pre = L.FORMS[t.form].roles(n); opps.forEach((o, k) => { p.roles[o.id] = o.nem ? (t.role || pre[k] || 'free') : (L.ROLES[p.roles[o.id]] ? p.roles[o.id] : pre[k] || 'free'); }); }
    if (t.hunt && gl && gl.length > 1) { const m = gl.findIndex((g) => g.id === c.nem.mark); if (m >= 0) p.prio = m; }
    return p;
  };

  const fate0 = L.fate;
  L.fate = (S, ev, rep, choice, foe) => {
    const r = fate0(S, ev, rep, choice, foe), c = S && S.camp;
    if (!r || !foe || !c) return r;
    try {
      if (foe.nem) onFate(S, c, ev, r, foe);
      else if (foe.cf) { c.cfate[foe.cf] = r.id; }
    } catch (e) { /* ignore */ }
    return r;
  };
  function onFate(S, c, ev, r, foe) {
    const n = c.nem; n.fates.push({ wk: S.week, id: r.id, ch: c.ch }); n.lastFate = { wk: S.week, id: r.id };
    if (r.id === 'kill') {
      n.prev = n.name; n.deadName = n.name; n.deadNick = n.nick; n.state = 'avenger'; n.avenged = false;
      const r2 = mul(hash(S.seed + '|av' + S.week)), nm = POOL.av[Math.floor(r2() * POOL.av.length)];
      n.name = nm; n.nick = 'the Avenger'; n.stage = clamp(n.stage - 1, 1, 4); n.w = 0; n.l = 0; n.hum = 0; n.scars = []; n.mark = null; n.trait = 'grudge'; n.next = S.week + 5; n.lastMeet = S.week;
      c.flags.bloodHand = 1; logAdd(S, c, `You killed ${n.prev}. ${nm} swears to avenge ${n.prev}.`);
    } else if (r.id === 'spare') {
      c.flags.sparedNem = 1; logAdd(S, c, `You spared ${n.name}.`);
      if (r.joined) { r.joined.nem = 0; delete r.joined.nem; makeAlly(S, c, r.joined); }
    } else if (r.id === 'ransom') { c.flags.ransomedNem = 1; logAdd(S, c, `${n.school} paid to take ${n.name} home.`); }
  }
  /** he is on your side now: decide, from what you have done and a hash of the seed, whether it is sincere */
  C.trustPct = (S) => {
    const c = C.get(S); if (!c) return 0; const st = S.stats || {};
    return clamp(Math.round(35 + 12 * Math.min(3, st.spares || 0) + (c.flags.parley ? 12 : 0) + (c.flags.oath ? 8 : 0) + (c.flags.respect ? 8 : 0) + (c.flags.honest ? 4 : 0) - 8 * Math.min(4, st.kills || 0) - (c.nem.hum > 0 ? 10 : 0)), 10, 90);
  };
  function makeAlly(S, c, g) {
    const n = c.nem; n.state = 'ally'; n.trust = C.trustPct(S); n.sincere = (hash(S.seed + '|trust|' + n.name) % 100) < n.trust; n.ring = g ? g.id : null; n.next = null;
    c.flags.nemAlly = 1; logAdd(S, c, `${n.name} joins your ludus.`);
  }
  C.makeAlly = makeAlly;

  const tAdv0 = L.tourneyAdvance;
  L.tourneyAdvance = (S, T, iWon) => {
    const c = S && S.camp;
    if (c && c.nem && T && T.alive) { try { const o = L.tourneyOpp(T); if (o && o.nem) meet(S, c, { won: !!iWon, kind: 'bracket', hpf: null, ids: T.slots[0] && T.slots[0].id != null ? [T.slots[0].id] : [] }); } catch (e) { /* ignore */ } }
    return tAdv0(S, T, iWon);
  };
  const settle0 = L.settle;
  L.settle = (S, ev, glads, res) => {
    const rep = settle0(S, ev, glads, res), c = S && S.camp;
    if (!c || !c.nem || !ev || !ev.opps) return rep;
    try {
      const won = !!(res && (res.win || res.place === 1));
      if (ev.camp === 'cf') finaleDone(S, c, ev, res, rep, won, glads);
      else if (ev.kind !== 'tourney' && ev.kind !== 'grand' && ev.opps.some((o) => o && o.nem)) {
        const h = res && res.hpf ? glads.reduce((a, g) => a + (res.hpf[g.id] != null ? res.hpf[g.id] : 0.5), 0) / Math.max(1, glads.length) : 0.5;
        meet(S, c, { won, kind: ev.camp === 'nem' ? 'grudge' : 'team', hpf: h, show: res && res.show | 0, ids: glads.map((g) => g.id) });
      }
    } catch (e) { /* ignore */ }
    return rep;
  };
  /** record a bout with the nemesis: scars, mark, growth, and a scene for the next quiet moment */
  function meet(S, c, m) {
    const n = c.nem; n.met++; n.lastMeet = S.week; n.stage0 = n.stage; const m0 = { wk: S.week, won: m.won, kind: m.kind, hum: false, scar: null, ch: c.ch };
    if (m.won) {
      n.w++; if (m.ids && m.ids.length) n.mark = m.ids[0]; else if (m.mark) n.mark = m.mark;
      if ((m.hpf != null && m.hpf >= 0.7) || (m.show | 0) >= 2) { n.hum++; m0.hum = true; }
      if (n.scars.length < 3 && hash(S.seed + '|scar|' + n.name + '|' + n.w) % 100 < 70) { const sc = SCAR_ORDER.find((x) => !n.scars.includes(x)); if (sc) { n.scars.push(sc); m0.scar = sc; } }
    } else { n.l++; }
    n.stage = stageOf(c); m0.stage = n.stage; m0.stage0 = n.stage0;
    n.next = S.week + 4 + (hash(S.seed + '|nx|' + S.week) % 3);
    c.q.push({ t: 'meet', m: m0 });
  }
  // the recent fate of a meeting is attached when the scene is built (the fate is decided after the settle in a duel)

  function finaleDone(S, c, ev, res, rep, won, glads) {
    const f = c.fin; if (!f) return; const chn = f.ch;
    if (won) {
      c.done[chn] = S.week; c.fin = null; logAdd(S, c, `Chapter ${CHS[chn - 1].n} finale won: ${CHS[chn - 1].fin}.`);
      if (ev.opps[0] && ev.opps[0].nem) { meet(S, c, { won: true, kind: 'finale', hpf: 0.4, ids: glads.map((g) => g.id) }); c.q.pop(); }
      if (chn === 5) { if (c.stake) { const win = c.stake * 4; addGold(S, win); rep.notes.push(`The wager pays: ${win} gold.`); c.stake = 0; c.flags.wagerWon = 1; } c.q.push({ t: 'fin', ch: chn, win: true }); c.q.push({ t: 'end' }); }
      else { c.q.push({ t: 'fin', ch: chn, win: true }); c.ch = chn + 1; c.card = c.ch; c.lastBeat = S.week; if (c.ch === 2 && c.nem.state === 'rival') c.nem.stage = Math.max(c.nem.stage, 2); }
    } else {
      f.tries = (f.tries | 0) + 1;
      if (ev.opps[0] && ev.opps[0].nem) { meet(S, c, { won: false, kind: 'finale', hpf: 0, ids: [] }); c.q.pop(); }
      if (chn === 5 && c.stake) { ruin(S, c, rep); return; }
      c.q.push({ t: 'fin', ch: chn, win: false });
    }
  }
  function ruin(S, c, rep) {
    c.end = 'ruin'; c.endWk = S.week; c.stake = 0; c.fin = null; addGold(S, -S.gold); S.fame = Math.round(S.fame * 0.88);
    if (S.glads.length > 1) { const g = S.glads.slice().sort((a, b) => a.lvl - b.lvl || b.id - a.id)[0]; L.release(S, g); c.lostTo = g.name; }
    c.q.push({ t: 'ruin' }); logAdd(S, c, 'The wager was called. The ludus was seized.'); if (rep && rep.notes) rep.notes.push('The wager is lost. The Senator\'s clerks are at your gate.');
  }

  // ================================================================ weekly hook
  const week0 = L.extWeek;
  L.extWeek = (S, rep) => {
    if (week0) week0(S, rep);
    try { weekly(S, rep || { notes: [] }); } catch (e) { /* the story never breaks the week */ }
  };
  function weekly(S, rep) {
    if (!S.camp && !live(S)) return;
    const c = C.get(S); if (!c || !live(S)) return; const n = c.nem;
    n.lg = Math.min(CHS[clamp(c.ch, 1, 5) - 1].lg, L.maxLeague ? L.maxLeague(S) : 0);
    // boons: small and optional
    if (c.flags.oath && !c.flags.docFades && S.glads.length) {
      const g = S.glads.slice().sort((a, b) => a.lvl - b.lvl || a.id - b.id)[0]; L.withRandom(rngFor(S, 'oath'), () => L.addXp(g, 5));
      if (rep.notes && S.week % 4 === 0) rep.notes.push(`${c.cast.docS} drills ${g.name} in the evenings (+5 XP a week).`);
    }
    // a nemesis who was not met keeps waiting and grows impatient
    if (nemOn(c) && n.next != null && S.week > n.next + 1 && !(c.fin)) { n.next = S.week + 3; n.ign++; if (n.ign % 2 === 0 && rep.notes) rep.notes.push(`${n.name} is telling the taverns that you hide behind your fighters.`); }
    // chapter finale opens when the span is crossed and every beat of the chapter is told
    if (c.ch <= 5 && !c.fin && !c.done[c.ch] && !c.end) {
      const x = CHS[c.ch - 1], told = BEATS.filter((b) => b.ch === c.ch).every((b) => c.seen[b.id] != null);
      if (S.fame >= x.to && told && !c.q.some((q) => q.t === 'finopen')) { c.fin = { ch: c.ch, lg: x.lg, wk: S.week, tries: 0 }; c.q.push({ t: 'finopen', ch: c.ch }); if (rep.notes) rep.notes.push(`The finale of chapter ${x.n} is open: ${x.fin}. Find it in the Arena.`); }
    }
    // the traitor leaves in the night (revealed in chapter 5, scene b51)
  }

  // ================================================================ scenes: beats
  // line: [speaker, text, cond?]. choice: { l: label, h: hint, if: cond, need, fx, set: {flag}, then: [lines], act: (S,c)=>void }
  // fx numbers are authoring units: gold and fame scale with the chapter (see GS, FS, XS) and the exact result is printed as chips before the player commits.
  const BEATS = [
    // ---------------------------------------------------------------- chapter I
    { id: 'b11', ch: 1, at: 0, t: 'The Doctore at the Gate', lines: [
      ['nar', 'Dawn on the training sand. The yard smells of barley, oil and old rope. At the gate, {docF} leans on a stick and watches your fighters sweat.'],
      ['doc', 'You bought the walls and the debts together, Lanista. Walls I can mend. Debts I can only outlive.'],
      ['doc', 'Thirty years in this trade. I buried more men than I trained. The good ones taught me one rule: a fighter who thinks you value him fights twice as long.'],
    ], cs: [
      { l: 'Swear the oath: no man of mine dies for a purse.', set: { oath: 1 }, fx: { mo: 5 }, h: 'Every week the doctore drills your youngest fighter (+5 XP).', then: [['doc', 'Words are cheap. But I will hold you to them, and I will work for them.']] },
      { l: 'Tell him only results matter.', set: { hard: 1 }, fx: { gold: 30 }, then: [['doc', 'Results. Aye. They are why men are buried in the first place. Still, a purse is a purse.']] },
      { l: 'Ask for the old tricks of the trade.', set: { tricks: 1 }, fx: { xp: 10 }, then: [['doc', 'Sit. Watch the feet, not the sword. Everything you need is in the feet.']] },
    ] },
    { id: 'b12', ch: 1, at: 0.25, t: "A Neighbour's Wine", lines: [
      ['nar', 'A litter stops at your gate. The man who climbs out wears too many rings and smiles with half his face.'],
      ['lan', '{lanF}, of {school}. A new lanista in the district. I like to know my neighbours before the sand does.'],
      ['lan', 'Business is a river, friend. Let me lend you some silver, no interest, to put meat on those boys. Friends should help friends.'],
      ['doc', '(low) Nothing is free from a man with that many rings.'],
    ], cs: [
      { l: 'Take the loan.', set: { loan: 1 }, fx: { gold: 80, mer: 2 }, h: 'He will ask for it back with interest in chapter III.', then: [['lan', 'Splendid. We shall be great friends, you and I.']] },
      { l: 'Thank him, and send him off.', set: { proud: 1 }, fx: { fame: 3 }, then: [['lan', 'Pride. How refreshing. It never lasts, but how refreshing.']] },
      { l: 'Pour him a cup and listen.', set: { listened: 1 }, fx: { mer: 3, xp: 4 }, then: [['lan', 'Ask me anything. Everyone does, eventually. I answer very little, and very expensively.']] },
    ] },
    { id: 'b13', ch: 1, at: 0.5, t: 'A Name on the Wall', pre: (S, c) => { c.nem.intro = true; c.nem.next = S.week + 2; logAdd(S, c, `${c.nem.name} ${c.nem.nick} has noticed your ludus.`); }, lines: [
      ['nar', "The Pit draws the town's drunks and its gamblers. Tonight the crowd is chanting one name, and you do not know it yet."],
      ['fel', "That is {nem}, {nick}. Came up from {from}. Eleven bouts, eleven wins, and {he} has not once gone down to the sand."],
      ['nem', 'So you are the one who holds the paper on that ludus. Good. I wanted to see the face before I take it apart.'],
      ['nar', '{grudge}'],
    ], cs: [
      { l: 'Send a cup of wine to his bench.', set: { respect: 1 }, fx: { gold: -10 }, h: 'Respect between enemies. It will matter if you ever spare him.', then: [['nem', '(raises the cup, does not drink) Wine from my enemy. We will see what it costs.']] },
      { l: 'Study how he fights.', set: { studied: 1 }, fx: { xp: 8 }, then: [['fel', 'The left foot drags before every lunge. Watch it, and you will know.']] },
      { l: 'Say nothing. Let the sand decide.', set: { silent: 1 }, then: [['nar', 'You walk out into the night air. The chanting follows you down the street.']] },
    ] },
    { id: 'b14', ch: 1, at: 0.9, t: 'Before the Pit Lord', lines: [
      ['nar', 'The little shrine at the end of the street is lit by one lamp. {priF} is trimming the wick.'],
      ['pri', 'Fortune is a woman, and she hates to be hurried. Before the Pit Lord\'s gate, even the bold light a lamp.'],
      ['pri', 'I do not ask for much. A coin, a wick, and a name said aloud.'],
    ], cs: [
      { l: 'Offer a lamp and a coin.', set: { blessed: 1 }, fx: { gold: -25, mo: 10 }, then: [['pri', 'Fortune has heard. She does not promise. She listens.']] },
      { l: 'Keep your coin for the barley.', set: { nobless: 1 }, then: [['pri', 'The gods do not mind. Their servants eat, as everyone does.']] },
    ] },
    // ---------------------------------------------------------------- chapter II
    { id: 'b21', ch: 2, at: 0, t: "The Senator's Letter", lines: [
      ['nar', 'A courier in a clean toga is not a thing the provinces see often. He carries a sealed tablet and refuses to be hurried.'],
      ['sen', '"The Governor\'s Games reward houses with discipline and a good crowd. I hold some influence and some coin that is not otherwise employed. Let us be useful to each other." The seal reads {senF}.'],
      ['doc', 'Patrons are like fleas, Lanista. Easy to catch, hard to stop feeling.'],
    ], cs: [
      { l: "Accept the Senator's loan.", set: { debt: 1 }, fx: { gold: 80, sen: 6 }, h: 'He will call in a favour in chapter III.', then: [['sen', '(by letter) Wise. A house is only as large as its friends.']] },
      { l: 'Accept his friendship, not his coin.', set: { friend: 1 }, fx: { sen: 4, fame: 2 }, then: [['sen', '(by letter) A man who can tell the difference is rare. I shall remember it.']] },
      { l: 'Decline politely. Your house stands on its own sand.', set: { free: 1 }, fx: { ple: 4 }, then: [['sen', '(by letter) Independent. We shall see how long that lasts.']] },
    ] },
    { id: 'b22', ch: 2, at: 0.3, t: 'The Grudge Has a Voice', lines: [
      ['nar', 'A boy from the {school} yard slips into your barracks at dusk with a folded rag. Inside, scratched in charcoal: a date, a place, and one line.'],
      ['nem', '{cry}'],
      ['nar', '{grudge}'],
      ['lan', '{lanF} does not forbid it. {lanF} sells tickets.', '@rival'],
      ['fel', 'Whatever {he} wants, {he} wants it badly. That makes a man easy to read. Or easy to fear.'],
    ], cs: [
      { l: 'Answer in public: let it be a feud the town can watch.', set: { feud: 1 }, fx: { fame: 4 }, then: [['nem', '(a message comes back by evening) Good. I wanted witnesses.']] },
      { l: 'Pay for a parley and hear him out.', set: { parley: 1 }, fx: { gold: -40 }, h: 'If you ever spare him, he is likelier to be sincere.', then: [['nem', 'We spoke for an hour. I did not forgive you. I understood you a little. It is worse.']] },
      { l: 'Burn the rag.', set: { ignored: 1 }, act: (S, c) => { c.nem.ign++; }, then: [['nar', 'It burns green at the edges. Somewhere across town someone smiles.']] },
    ] },
    { id: 'b23', ch: 2, at: 0.55, t: 'What the Smoke Says', lines: [
      ['nar', 'The priestess {priF} has come up the hill in the rain, which she does not do for small matters.'],
      ['pri', 'The entrails were clear this morning, and the wrong colour. I am not telling you to be afraid. I am telling you to be careful.'],
      ['pri', 'The dead of your house are restless. Names without altar-rites wander the lower passage.', 'fallen'],
      ['pri', 'Your house has been lucky so far. Luck is a loan, Lanista.', '!fallen'],
    ], cs: [
      { l: 'Pay for rites for the dead.', if: 'fallen', fx: { gold: -30, grief: 1, mo: 6 }, set: { rites: 1 }, then: [['pri', 'Done. The lamp will burn three nights. They will rest.']] },
      { l: 'Ask her to bless the living.', fx: { gold: -30, mo: 6, en: 15 }, set: { blessed2: 1 }, then: [['pri', 'Bring them to the shrine. Let them touch the stone.']] },
      { l: 'Send her away with thanks.', then: [['pri', 'Gods keep their own accounts. So do I.']] },
    ] },
    { id: 'b24', ch: 2, at: 0.8, t: 'The Rudis', need: 'fellow', lines: [
      ['fel', 'May I speak, Lanista? Not as a fighter. As a man who counts his bouts.'],
      ['fel', 'There is a number, they say. After enough years, enough wins, a man is handed the wooden sword. The rudis. Does that number exist, or is it a story told to keep our arms moving?'],
    ], cs: [
      { l: 'Promise: when the Games are won, the rudis for every man of this house.', set: { promised: 1 }, fx: { mo: 8 }, h: 'Break it later and the whole barracks will know.', then: [['fel', '(very quiet) Then I will fight like a man with a future. I had forgotten how.']] },
      { l: 'Tell him the truth: you cannot promise what you do not hold.', set: { honest: 1 }, fx: { mo: 2 }, then: [['fel', 'A straight answer. I will take it over a sweet one.']] },
      { l: 'Say the arena decides, not you.', set: { cold: 1 }, fx: { mo: -3 }, then: [['fel', 'Yes, Lanista.']] },
    ] },
    // ---------------------------------------------------------------- chapter III
    { id: 'b31', ch: 3, at: 0, t: 'A Debt Comes Due', lines: [
      ['nar', 'The Colosseum smells of wet stone and lamp oil. Your name is on a tablet by the gate. So, it turns out, is someone else\'s.'],
      ['sen', 'I have been patient. A man in my position cannot be seen to lend for nothing. There is a dinner at my villa on the Ides. I would like your finest fighter standing behind my couch, armed and silent.', 'debt'],
      ['sen', 'A small dinner at my villa. I should like the Governor\'s wife to see a fighter up close. Bring your finest.', 'friend&!debt'],
      ['sen', 'You turned my coin down and now you are in my city. I admire that, and I shall remember that I was not asked.', 'free'],
    ], cs: [
      { l: 'Send your finest to the villa.', if: 'debt', fx: { tire: 40, fame: 6, gold: 20 }, set: { servedSen: 1, debtPaid: 1 }, h: 'The debt is cleared by service.', then: [['sen', 'Admirable. The Governor\'s wife has not stopped talking about the scars.']] },
      { l: 'Repay the loan in coin.', if: 'debt', fx: { gold: -45, sen: -2 }, set: { debtPaid: 1, repaid: 1 }, then: [['sen', 'Coin. Very clean. Very cold. As you wish.']] },
      { l: 'Refuse.', if: 'debt', fx: { sen: -10 }, set: { defied: 1 }, h: 'The Senate will remember.', then: [['sen', 'Then the loan stands. I shall find another way to collect.']] },
      { l: 'Attend the dinner with your finest.', if: '!debt&friend', fx: { tire: 25, fame: 6, sen: 6 }, set: { servedSen: 1 }, then: [['sen', 'Splendid. A little wine, a little blood on the stairs. Everyone leaves happy.']] },
      { l: 'Send polite regrets.', if: '!debt', then: [['sen', 'Regrets are accepted. They are also remembered.']] },
    ] },
    { id: 'b32', ch: 3, at: 0.3, t: 'Rings and Knives', lines: [
      ['lan', '{lanF} knows how a ludus dies: slowly, from the kitchen. I hear your barley is not what it was.'],
      ['doc', 'A boy from {school} was seen at the well last night, Lanista. Not drawing water.'],
      ['lan', 'And I believe you owe me a small sum, friend. With the interest of friendship.', 'loan'],
    ], cs: [
      { l: 'Repay the loan now.', if: 'loan', fx: { gold: -90 }, set: { loanPaid: 1 }, then: [['lan', 'Clean accounts, clean friendships. You may keep the well.']] },
      { l: 'Post a guard on the well and kitchen.', fx: { gold: -35 }, set: { guarded: 1 }, then: [['doc', 'Two old soldiers with bad knees and long memories. It will do.']] },
      { l: 'Walk into {school} and tell {lanF} you know.', fx: { fame: 5, mo: -4 }, set: { threat: 1 }, h: 'Nerves in the barracks while the matter hangs.', then: [['lan', '(smiles with half his face) I know nothing about any well.']] },
      { l: 'Ignore it.', fx: { mo: -8, en: -10 }, set: { sick: 1 }, h: 'Something in the water. Every fighter feels it.', then: [['doc', 'I told you.']] },
    ] },
    { id: 'b33', ch: 3, at: 0.55, t: 'The Man You Made', lines: [
      ['nar', '{nem} is waiting at the edge of the practice yard when you come back from the baths. {He} carries no weapon, and that is somehow worse.'],
      ['nem', 'We have not yet crossed blades where it counts. But I have heard you speak of me. I have heard your men speak of me. That is already a victory.', 'unmet&@rival'],
      ['nem', 'You left me breath at the sand. A debt like that rots a man from the inside. I do not like owing you.', 'spared&@rival'],
      ['nem', '{school} paid for me like a mule. I am told the price was fair. I resented every coin.', 'ransomed&!spared&@rival'],
      ['nem', 'You went down before me. I thought it would taste sweeter.', 'lost&!spared&!ransomed&@rival'],
      ['nem', 'You made a joke of me before the whole town. I laughed too, afterwards. It was not a happy laugh.', 'hum&!spared&!ransomed&!lost&@rival'],
      ['nem', 'You opened the account with your hand on {prev}. I will close it with mine.', '@avenger'],
      ['nem', 'I fought beside your name for a season and I was wrong about most of it.', '@ally'],
    ], cs: [
      { l: 'Offer him a place in your house.', if: 'spared&@rival', need: 'room', fx: { note: 'Trust: {trust}%. He may be sincere. He may not.' }, act: (S, c) => { const g = nemRecruit(S, c); if (g) makeAlly(S, c, g); }, set: { offered: 1 }, then: [['nem', '(a long silence) A roof. A bowl. I will think of it as a loan, not a gift.']] },
      { l: 'Tell him the next bout will be the last.', set: { threat2: 1 }, fx: { fame: 3 }, then: [['nem', 'Then let it be a good one.']] },
      { l: 'Let him go without a word.', set: { silentNem: 1 }, fx: { ple: 3 }, then: [['nar', '{nem} lingers a moment, then goes. The yard dogs do not bark.']] },
    ] },
    { id: 'b34', ch: 3, at: 0.8, t: "The Doctore's Cough", lines: [
      ['nar', '{docF} has not come to the yard for three mornings. You find him by the bath-house wall with a blanket over his knees.'],
      ['doc', 'Tell me the number of the fights, Lanista. I stopped counting at three hundred. I should like to know where I ended.'],
      ['doc', 'I made you a promise in the first month. I think I have kept it.', 'oath'],
    ], cs: [
      { l: 'Send for the best physician in Rome.', fx: { gold: -80, mo: 5 }, set: { docLives: 1 }, then: [['doc', 'A physician. For an old man. Lanista, you are going to ruin me with kindness.']] },
      { l: 'Sit with him in the sun and let the yard come to listen.', fx: { xp: 10 }, set: { docFades: 1 }, h: 'He will leave you his old sword.', act: (S, c) => { c.docItem = true; }, then: [['doc', '(smiling) Watch the feet. Always the feet.']] },
    ] },
    // ---------------------------------------------------------------- chapter IV
    { id: 'b41', ch: 4, at: 0, t: 'The Account', lines: [
      ['nar', 'Rumour arrives before the courier does. Someone in the palace has read your name aloud.'],
      ['nem', 'I hear the palace is watching you now. Then it is watching me too. Good. A grudge should have an audience.', '@rival'],
      ['nem', 'The palace watches. Let it see that my brother\'s killer still breathes. Let it see me end that.', '@avenger'],
      ['nem', 'They whisper in the Senator\'s house, Lanista. About you. About the Games. I thought you ought to know.', '@ally'],
      ['nem', 'You may have bought me, Lanista, but you did not buy what I know. I am sorry for what I will do.', '@traitor'],
    ], cs: [
      { l: 'Pay the weregild for {prev}\'s death.', if: '@avenger', fx: { gold: -90 }, set: { weregild: 1 }, h: 'His grudge softens. His fists do not.', act: (S, c) => { c.nem.soft = 1; }, then: [['nem', 'Gold for blood. I take it because the dead cannot. It does not make us friends.']] },
      { l: 'Tell him you will meet him in the sand.', if: '@avenger', set: { defiant: 1 }, fx: { fame: 4 }, then: [['nem', 'Good.']] },
      { l: 'Answer: the sand will say who deserves the palace.', if: '@rival', set: { answered: 1 }, fx: { fame: 3 }, then: [['nem', 'It always does.']] },
      { l: 'Thank him, and keep him close.', if: '@ally', set: { thanked: 1 }, fx: { mo: 3 }, then: [['nem', 'Close is where I am most useful.']] },
      { l: 'Say nothing.', then: [['nar', 'The yard wind carries the conversation away.']] },
    ] },
    { id: 'b42', ch: 4, at: 0.35, t: 'The Wager', lines: [
      ['nar', 'The Senator receives you on a terrace above the forum. The wine is better than yours, and he lets you notice.'],
      ['sen', 'The Emperor\'s Games are a once in a decade affair. A house with courage and credit could make a fortune. Stake your treasury on your champion. I will back you at four to one.'],
      ['sen', 'Win, and you are rich. Lose, and, well. I should have to take the house. It is the custom.'],
      ['doc', '(to you, afterwards) A man who offers you a bet has already counted the loser.'],
    ], cs: [
      { l: 'Decline. You want your house, not his fortune.', set: { noWager: 1 }, fx: { sen: -2 }, then: [['sen', 'Prudence is a virtue. Nobody ever put it on a monument.']] },
      { l: 'Sign for the wager when the Games arrive.', set: { wagerOffer: 1 }, h: 'You decide in chapter V. The exact stake is printed there.', then: [['sen', 'I shall hold the pen. You will hold the nerve.']] },
    ] },
    { id: 'b43', ch: 4, at: 0.7, t: 'What the God Asks', lines: [
      ['nar', 'The temple of Mars is a different thing from the little shrine at home. Here the priestess {priF} receives you in a room of cold marble.'],
      ['pri', 'The god takes his due. Dedicate the Games to someone, and he will remember whom.'],
      ['pri', 'You have names on your wall, Lanista. They would not mind being named.', 'fallen'],
    ], cs: [
      { l: 'Dedicate the Games to your fallen.', if: 'fallen', fx: { gold: -40, mo: 8, fame: 4 }, set: { vowDead: 1 }, then: [['pri', 'It is done. The wall will be lit on the Ides.']] },
      { l: 'Dedicate the Games to the living.', fx: { gold: -40, mo: 8, xp: 6 }, set: { vowLiving: 1 }, then: [['pri', 'The living are the god\'s best audience.']] },
      { l: 'Dedicate the Games to the Emperor.', fx: { gold: -40, sen: 5, ple: -3 }, set: { vowEmperor: 1 }, then: [['pri', 'Politics. The god forgives politics. He does not forget it.']] },
    ] },
    // ---------------------------------------------------------------- chapter V
    { id: 'b51', ch: 5, at: 0, t: 'Eve of the Games', pre: (S, c) => { const n = c.nem; if (n.state === 'ally' && n.sincere === false && S.glads.some((g) => g.id === n.ring)) { n.state = 'traitor'; c.flags.betrayed = 1; const gl = S.glads.find((g) => g.id === n.ring); if (gl) L.release(S, gl); addGold(S, -Math.round(Math.min(S.gold, 90 * GS[3] * 0.4))); S.glads.forEach((g) => { g.mo = clamp(g.mo - 8, 0, 100); }); n.next = null; n.stage = Math.min(4, n.stage + 1); logAdd(S, c, `${n.name} sold your house to ${n.school}.`); } }, lines: [
      ['nar', 'Rome has put on its best marble for the Emperor\'s Games. Every household in the empire that can spare a coin has spared it.'],
      ['nem', 'I came to say goodbye, Lanista. And to say that when we meet it will not be a quarrel. It will be a matter of honour. Of whom the empire forgets.', '@rival'],
      ['nem', 'I told you I would be at your shoulder at the end. I am. I will stand where you tell me to stand.', '@ally'],
      ['nar', 'In the night {nem} has gone. A pouch is missing from the strongbox, and {his} cot is cold. Across the city, the {school} gate is open.', 'betrayed'],
      ['doc', '(grim) Betrayed by a man you spared. It has happened to better lanistas than you.', 'betrayed'],
      ['nem', 'You killed {prev}. Tomorrow I kill you, or I die trying. Either way the account closes.', '@avenger'],
    ], cs: [
      { l: 'Tear up the Senator\'s contract.', if: 'wagerOffer&!noWager', fx: { sen: -4 }, set: { noWager: 1 }, then: [['sen', 'As you like. I shall tell people you were wise. It costs me nothing.']] },
      { l: 'Stake {stake} gold on your champion. Win: 4x back. Lose: Ruin.', if: 'wagerOffer&!noWager', fx: { stake: 1 }, set: { wager: 1 }, h: 'The Senator holds your money in escrow. If you lose the Emperor\'s Day, the house is his.', then: [['sen', 'It is signed. May Fortune love you more than she has loved me.']] },
      { l: 'Go to the baths and clear your head.', if: '!wagerOffer|noWager', fx: { mo: 4 }, then: [['nar', 'Steam, cold water, the shapes of men on benches. Nobody asks you for anything.']] },
    ] },
    { id: 'b52', ch: 5, at: 0.5, t: 'The Last Vigil', lines: [
      ['nar', 'The night before the Emperor\'s Day the barracks does not sleep. Someone has hung lamps from the rafters.'],
      ['fel', 'I know you promised. I know what I said. I am not asking tonight, Lanista. Tonight I am only asking that you stay.', 'promised'],
      ['fel', 'Whatever comes, we came in through one gate. Let us fight like we did.', '!promised'],
      ['doc', 'Feet, Lanista. Always the feet.', 'docFades'],
    ], cs: [
      { l: 'Feast the whole barracks.', fx: { gold: -50, mo: 12, en: 10 }, set: { feasted: 1 }, then: [['nar', 'Bread, oil, honey and wine. For one night the house is a family.']] },
      { l: 'Drill until midnight.', fx: { xp: 8, en: -8 }, set: { drilled: 1 }, then: [['doc', 'You will be tired. That is what mornings are for.']] },
      { l: 'Sit with them in the dark and say nothing.', fx: { mo: 8 }, set: { vigil: 1 }, then: [['nar', 'No one speaks. No one has to.']] },
    ] },
    { id: 'b53', ch: 5, at: 0.9, t: 'Purple Shade', lines: [
      ['nar', 'A herald in white wool stands at your gate. He does not smile. He reads from a tablet.'],
      ['nar', '"The Emperor will watch the day. The house of {ludus} will be named at the third horn. Present your champion."'],
      ['pri', 'Whatever you choose, choose it the way you would want it remembered.'],
    ], cs: [
      { l: 'Present the house with honour: no tricks, no show.', set: { honour: 1 }, fx: { fame: 6 }, then: [['nar', 'The herald makes a note. Somewhere above him a cloud of purple moves.']] },
      { l: 'Present the house with spectacle.', set: { spectacle: 1 }, fx: { fame: 3, ple: 5 }, then: [['nar', 'The herald smiles for the first time. The crowd will love it. The Emperor may not.']] },
    ] },
  ];
  C.BEATS = BEATS;

  /** the nemesis as a fighter on your side (for the ally offer): same build as his foe self, no school, a fresh id */
  function nemRecruit(S, c) {
    if (S.glads.length >= L.rosterCap(S)) return null;
    const lg = CHS[clamp(c.ch, 1, 5) - 1].lg, top = S.glads.reduce((a, g) => Math.max(a, g.lvl), 1), g = C.nemGlad(S, lg, top, {});
    g.id = S.nextId++; g.act = 'rest'; g.en = 100; g.mo = 80; g.inj = 0; g.rv = null; delete g.lud; delete g.nem; g.color = null; g.rec = { w: 0, l: 0 }; g.fame = 0; g.sw = 0; L.withRandom(rngFor(S, 'ally'), () => L.assignStory(g)); S.glads.push(g); return g;
  }

  // ---------------------------------------------------------------- finale outcome scenes
  const FINWIN = [
    { lines: [['nar', 'The Pit Lord goes down in the middle of the sand, and the town forgets to breathe, and then remembers.'], ['doc', 'Look at that. A house with a name now.'], ['nar', 'Overnight the district talks of nothing else. Provincial scouts are already asking about your fighters.']], pick: 'The town offers you its thanks. Choose one.' },
    { lines: [['nar', 'The Governor himself rises. The Provincial Final belongs to your house.'], ['sen', '(by letter) Rome has a long memory and a short list. Your name is now on both.'], ['nar', 'Before the crowd has gone home a litter from the capital is already at your gate.']], pick: 'The Governor sends gifts. Choose one.' },
    { lines: [['nar', 'Marble does not applaud. It listens. For a moment even the stone seems to lean in.'], ['doc', 'The Colosseum remembers its champions. For about a month. After that, you have to remind it.'], ['nar', 'A seat in the shade has been kept for your lanista. Someone high up has noticed.']], pick: 'The city remembers. Choose one gift.' },
    { lines: [['nar', 'Whatever was owed between your houses is paid at last, one way or another, in front of fifty thousand people.'], ['doc', 'It never feels the way you imagine. You do not get to keep the anger.'], ['nar', 'A palace freedman delivers a scroll sealed in purple. The Emperor\'s Games are open to you.']], pick: 'The palace sends its favour. Choose one.' },
    { lines: [['nar', 'The third horn sounds. The champion of the empire falls. The Emperor rises, and the whole city rises with him.']], pick: '' },
  ];
  const FINLOSE = [
    { lines: [['doc', 'You lost the gate, not the war. The Pit Lord is a man, and men can be beaten.'], ['nar', 'The finale stays open. The fight will be a little easier next time, and the lesson will not fade.']] },
    { lines: [['nar', 'The Governor looks away. It does not mean he has stopped watching.'], ['doc', 'Go again when you are ready. The final will wait.']] },
    { lines: [['nar', 'The stone does not clap. It does not jeer. It just goes on being stone.'], ['doc', 'You can go again. A little wiser, a little less proud.']] },
    { lines: [['nar', 'The account is still open. It is only a matter of who closes it.'], ['doc', 'Take your time. Heal. Go again.']] },
    { lines: [['nar', 'The Emperor\'s Day is not done with you. Not yet.'], ['doc', 'Heal. The day does not end until one of you does.']] },
  ];
  const REWARD_RAR = [1, 2, 2, 3, 3];
  const rewardsFor = (ch) => (ch >= 5 ? [] : [{ l: 'A purse from the grateful.', fx: { gold: 60 } }, { l: 'A veteran asks to join your ludus.', fx: { recruit: 1 } }, { l: "The beaten champion's blade.", fx: { item: REWARD_RAR[ch - 1] } }]);

  // ---------------------------------------------------------------- the endings
  const END_CS = [
    { id: 'glory', l: 'Take the laurel: your name in marble.', fx: { fame: 25, gold: 90 }, h: 'Glory. Your house goes on. If you promised the rudis, the barracks will not forget the broken word.' },
    { id: 'freedom', l: 'Ask the Emperor for the rudis, for every man of your house.', fx: {}, h: 'Freedom. Every fighter in your barracks leaves a free man, and becomes a legend of the house. You keep your gold and your name.' },
  ];

  // ================================================================ the scene API for the UI
  const SPK = {
    nar: { name: '', role: 'narrator' }, doc: { role: 'Your doctore' }, lan: { role: 'Rival lanista' }, sen: { role: 'Your patron' }, pri: { role: 'Priestess' }, fel: { role: 'A fighter of your house' }, nem: { role: 'Your rival' },
  };
  C.speaker = (S, who) => {
    const c = S.camp, base = SPK[who] || SPK.nar; let name = '';
    if (who === 'doc') name = c.cast.doc; else if (who === 'lan') name = c.cast.lan; else if (who === 'sen') name = c.cast.sen; else if (who === 'pri') name = 'Priestess ' + c.cast.pri;
    else if (who === 'fel') { const f = fellow(S, c); name = f ? f.name : 'A veteran'; } else if (who === 'nem') name = c.nem.name + (c.nem.state === 'avenger' ? ' the Avenger' : ' ' + c.nem.nick);
    return { id: who, name, role: who === 'nem' && c.nem.state === 'ally' ? 'Your ally' : who === 'nem' && c.nem.state === 'avenger' ? 'Avenger of ' + (c.nem.prev || 'the fallen') : base.role, ico: { doc: 'shield', lan: 'coin', sen: 'star', pri: 'heart', fel: 'sword', nem: 'skull', nar: 'scroll' }[who] || 'scroll' };
  };
  const resolveLines = (S, c, lines) => lines.filter((l) => C.cond(S, c, l[2])).map((l) => ({ who: l[0], spk: C.speaker(S, l[0]), text: C.fill(S, l[1]) }));
  const fillTrust = (S, t) => String(t).replace('{trust}', String(C.trustPct(S))).replace('{stake}', String(stakeOf(S)));

  function beatScene(S, c, b) {
    if (b.pre && !(c.pre || {})[b.id]) { c.pre = c.pre || {}; c.pre[b.id] = 1; b.pre(S, c); }
    const cs = (b.cs || []).map((ch, i) => ({ ch, i })).filter((x) => C.cond(S, c, x.ch.if)).map(({ ch, i }) => ({
      i, label: fillTrust(S, C.fill(S, ch.l)), hint: ch.h ? fillTrust(S, C.fill(S, ch.h)) : '', chips: C.chips(S, ch.fx, c).map((x) => Object.assign({}, x, { t: fillTrust(S, x.t) })), why: why(S, c, ch),
    }));
    return { kind: 'beat', id: b.id, ch: c.ch, title: b.t, lines: resolveLines(S, c, b.lines), choices: cs };
  }
  function dueBeat(S, c) {
    if (c.ch > 5 || c.end) return null;
    if (S.week - c.lastBeat < 2) return null;
    const x = CHS[c.ch - 1], p = clamp((S.fame - x.from) / (x.to - x.from), 0, 1);
    const b = BEATS.find((q) => q.ch === c.ch && c.seen[q.id] == null && (q.need !== 'fellow' || S.glads.length)); if (!b) return null;
    const prev = BEATS.filter((q) => q.ch === c.ch && BEATS.indexOf(q) < BEATS.indexOf(b)); if (prev.some((q) => c.seen[q.id] == null && !(q.need === 'fellow' && !S.glads.length))) return null;
    return p >= b.at ? b : null;
  }
  const meetScene = (S, c, m) => {
    const n = c.nem, p = he(n), lines = [], f = n.lastFate && n.lastFate.wk === m.wk ? n.lastFate.id : null, nm = n.name;
    const nar = (t) => lines.push(['nar', t]);
    if (m.won) {
      if (f === 'kill') { nar(`${n.prev || nm} lies where the sand drank the last of it. The crowd has gone quiet in the way crowds do when they have got what they asked for.`); lines.push(['lan', 'Blood for blood, then. {school} does not forget a debt.']); }
      else if (f === 'spare') { lines.push(['nem', 'You could have ended it. I want you to know I did not ask.']); nar(`${nm} gets to ${p.his} feet without help, and does not look back.`); }
      else if (f === 'ransom') { lines.push(['nem', '{school} paid for me like a mule. I will remember the price, and who named it.']); }
      else if (m.hum) { lines.push(['nem', 'A joke at my cost, before the whole town. I will return it with interest.']); }
      else lines.push(['nem', 'This is not finished. You know it is not.']);
      if (m.hum && f && f !== 'kill') nar(`The crowd laughed, and ${nm} heard every voice of it.`);
    } else { lines.push(['nem', 'The sand is cheap, and your hope is cheaper.']); lines.push(['fel', 'Quick. Quicker than the rumour. We will need a plan, Lanista.']); }
    if (m.scar) nar(`${nm} walks away with a new mark: ${D.SCARS[m.scar].n.toLowerCase()}.`);
    if (m.stage > (m.stage0 || 1)) nar(`${nm} fights differently now: ${TAC[m.stage - 1].n.toLowerCase()}.`);
    return { kind: 'meet', id: 'meet' + m.wk, ch: c.ch, title: m.won ? `After the bout: ${nm}` : `${nm} remembers`, lines: resolveLines(S, c, lines), choices: [] };
  };
  const finScene = (S, c, q) => {
    const k = q.ch - 1, W = q.win ? FINWIN[k] : FINLOSE[k]; const sc = { kind: q.win ? 'finwin' : 'finlose', id: 'fin' + q.ch + (q.win ? 'w' : 'l'), ch: q.ch, title: q.win ? CHS[k].fin : 'Not yet', lines: resolveLines(S, c, W.lines), choices: [] };
    if (q.win && rewardsFor(q.ch).length) { sc.pick = W.pick; sc.choices = rewardsFor(q.ch).map((ch, i) => ({ i, label: ch.l, hint: '', chips: C.chips(S, ch.fx, c), why: why(S, c, ch) })); sc.rewards = true; }
    return sc;
  };
  const finopenScene = (S, c, q) => {
    const x = CHS[q.ch - 1], L2 = [['nar', `${x.fin}. The day is set. The gate is open to anyone who dares.`]];
    if (q.ch === 2 || q.ch === 4) L2.push(['nem', 'You will not be able to look away this time. Neither will I.', '@rival|@avenger']);
    if (q.ch === 5) L2.push(['doc', 'There is one more bout, Lanista. And then there is the rest of your life.']);
    return { kind: 'finopen', id: 'fo' + q.ch, ch: q.ch, title: x.fin, lines: resolveLines(S, c, L2), choices: [] };
  };
  const endScene = (S, c) => ({
    kind: 'end', id: 'end', ch: 5, title: "The Emperor's Day",
    lines: resolveLines(S, c, [['nar', 'The Emperor lifts a hand and the stadium falls silent, as the sea does in a story. Every man in your house is on the sand, bloodied, breathing.'], ['sen', 'Name your boon, Lanista. This is the one day the empire says yes.', 'friend|debt|servedSen'], ['fel', 'You remember what you said, Lanista.', 'promised'], ['nem', 'I would not interrupt this for the world. Say what you want. I will not let you fall.', '@ally']]),
    choices: END_CS.map((e, i) => ({ i, id: e.id, label: e.l, hint: e.h, chips: e.id === 'freedom' ? [{ t: `${S.glads.length} fighter${S.glads.length === 1 ? '' : 's'} leave as free men`, tone: 'warn' }, { t: `+${S.glads.length * 2 + 3} laurels`, tone: 'good' }] : [{ t: '+25 fame, +90 gold, +3 laurels', tone: 'good' }, ...(c.flags.promised ? [{ t: 'The promised rudis is broken: -15 morale', tone: 'bad' }] : [])], why: '' })),
  });
  const ruinScene = (S, c) => ({
    kind: 'ruin', id: 'ruin', ch: 5, title: 'The Wager Is Called',
    lines: resolveLines(S, c, [['nar', 'The Emperor\'s Day is lost, and with it the stake. The Senator\'s clerks arrive before the sand has been raked.'], ['sen', 'I am sorry, Lanista. It is the custom. I shall remember how bravely you bet.'], ['doc', 'It is a bad day. It is not the last day.']]), choices: [],
  });

  /** the next thing to show: {kind:'card'} | a scene | {kind:'epilogue'} | null */
  C.next = (S) => {
    if (!live(S)) return null; const c = C.get(S); if (!c) return null;
    if (c.q.length) {
      const q = c.q[0];
      if (q.t === 'meet') return Object.assign(meetScene(S, c, q.m), { fromQ: true });
      if (q.t === 'fin') return Object.assign(finScene(S, c, q), { fromQ: true });
      if (q.t === 'finopen') return Object.assign(finopenScene(S, c, q), { fromQ: true });
      if (q.t === 'end') return Object.assign(endScene(S, c), { fromQ: true });
      if (q.t === 'ruin') return Object.assign(ruinScene(S, c), { fromQ: true });
      if (q.t === 'epi') return { kind: 'epilogue', fromQ: true };
    }
    if (c.card) return { kind: 'card', ch: c.card, chapter: CHS[c.card - 1] };
    const b = dueBeat(S, c); if (b) return beatScene(S, c, b);
    return null;
  };
  /** mark a non-choice scene as seen (meet, finopen, finlose, ruin, card, epilogue) */
  C.dismiss = (S, sc) => {
    const c = C.get(S); if (!c || !sc) return;
    if (sc.kind === 'card') { c.card = 0; return; }
    if (sc.fromQ && c.q.length) { const q = c.q.shift(); if (q.t === 'ruin') c.q.push({ t: 'epi' }); }
  };
  /** the player picked option i of a scene. Returns {done:[strings], then:[lines]} */
  C.choose = (S, sc, i) => {
    const c = C.get(S); const out = { done: [], then: [] }; if (!c || !sc) return out;
    if (sc.kind === 'beat') {
      const b = BEATS.find((x) => x.id === sc.id); if (!b) return out; const ch = (b.cs || [])[i]; if (!ch) return out;
      if (why(S, c, ch)) return out;
      out.done = applyFx(S, c, ch.fx, b.id + i); if (ch.set) Object.assign(c.flags, ch.set); if (ch.act) ch.act(S, c);
      c.seen[b.id] = S.week; c.lastBeat = S.week; logAdd(S, c, `${b.t}: ${fillTrust(S, C.fill(S, ch.l))}`);
      if (c.docItem) { c.docItem = false; applyFx(S, c, { item: 2 }, 'doc'); out.done.push('The doctore\'s old sword: ' + (c.lastItem || 'a veteran blade')); }
      out.then = resolveLines(S, c, ch.then || []);
      return out;
    }
    if (sc.kind === 'finwin' && sc.rewards) {
      const R = rewardsFor(sc.ch)[i]; if (!R || why(S, c, R)) return out; out.done = applyFx(S, c, R.fx, 'fw' + sc.ch + i); c.flags['rew' + sc.ch] = R.fx.recruit ? 'recruit' : R.fx.item ? 'item' : 'gold'; C.dismiss(S, sc); return out;
    }
    if (sc.kind === 'end') {
      const e = END_CS[i]; if (!e) return out; end(S, c, e.id); out.done = ['Ending: ' + C.ENDINGS[e.id].t]; return out;
    }
    return out;
  };
  function end(S, c, id) {
    c.end = id; c.endWk = S.week; c.q.shift();
    S.fame += id === 'glory' ? 25 : 40; if (id === 'glory') addGold(S, 90); S.laurels = (S.laurels || 0) + (id === 'glory' ? 3 : S.glads.length * 2 + 3);
    if (id === 'glory' && c.flags.promised) { S.glads.forEach((g) => { g.mo = clamp(g.mo - 15, 0, 100); }); c.flags.broken = 1; }
    if (id === 'freedom') {
      c.freed = S.glads.map((g) => g.name); S.legends = S.legends || []; S.mentors = [];
      S.glads.slice().forEach((g) => { const best = D.STATS.reduce((a, s) => (g.st[s] > g.st[a] ? s : a), 'str'); S.legends.push({ name: g.name, nick: g.nick, style: g.style, lvl: g.lvl, best, w: g.rec.w, l: g.rec.l, skin: g.skin, hair: g.hair, plume: g.plume, face: g.face, title: 'Freedman', wk: S.week }); L.release(S, g); });
      c.flags.freed = 1;
    }
    logAdd(S, c, 'Ending: ' + C.ENDINGS[id].t); c.q.push({ t: 'epi' });
  }

  // ================================================================ endings and the epilogue
  C.ENDINGS = {
    glory: { t: 'A Name in Marble', k: 'Glory' },
    freedom: { t: 'The Wooden Sword', k: 'Freedom' },
    ruin: { t: 'Ashes on the Sand', k: 'Ruin' },
  };
  C.epilogue = (S) => {
    const c = C.get(S, true); if (!c || !c.end) return null; const n = c.nem, p = he(n), id = c.end, E = C.ENDINGS[id], st = S.stats || {}, fill = (t) => C.fill(S, t), paras = [];
    if (id === 'glory') paras.push('The Emperor rises, and fifty thousand voices rise with him. {ludus} is a name now, carved where the legions can read it. Your fighters will be sung in taverns long after the sand has been raked over.');
    if (id === 'freedom') paras.push('The Emperor is not a sentimental man, but crowds are, and he knows it. The wooden sword is placed in the hand of each fighter of {ludus}. The gate stands open, and for the first time in its history men walk out through it on their own business.');
    if (id === 'ruin') paras.push('The wager is called and the sand is dry. {senF}\'s clerks arrive before the cheering has stopped. {ludus} is a story people tell about pride, and the walls will hold a different house by spring.');
    if (c.flags.promised && id === 'freedom') paras.push('{fel} has been counting this day for years. He will not tell you what he is thinking. His hands shake a little as he takes the sword.');
    if (c.flags.promised && id === 'glory') paras.push('You did not keep the promise you made to your fighters. {fel} says nothing about it. That is the worst part.');
    if ((S.fallen || []).length) paras.push(`The names on your memorial wall were read out too, ${(S.fallen || []).length === 1 ? 'one name' : (S.fallen || []).length + ' names'}, because someone told the herald to. Nobody laughed.`);
    if (n.state === 'rival') paras.push(n.l > n.w ? '{nem}, {nick}, still fights, and still thinks the account is open. Some say {he} watches your gate. Some say it is a courtesy.' : '{nem}, {nick}, still fights. {He} has stopped telling people your name.');
    else if (n.state === 'dead' || n.state === 'avenger') paras.push((n.prev ? `${n.prev} is buried outside the walls of {school}. {av} keeps the grave swept and does not say why.` : '{nem} is gone.'));
    else if (n.state === 'ally') paras.push('{nem} stands at your side at the end, no longer the man who walked into your yard with murder in {his} eyes. Some debts are paid with breath.');
    else if (n.state === 'traitor') paras.push('{nem} sold your house once and lost anyway. Some debts do not need a lanista to collect them.');
    if (c.flags.docLives) paras.push('{doc} lived to see it, and complained about the food.'); else if (c.flags.docFades) paras.push('{doc} did not live to see it. His sword hangs over your door.');
    const fates = { kill: 'killed', spare: 'spared', ransom: 'ransomed' }, said = n.fates.map((f) => fates[f.id]).filter(Boolean);
    const nemLine = `Your rival: ${n.deadName || n.name} ${n.deadNick || n.nick}. ${n.met ? `You met ${n.met} time${n.met === 1 ? '' : 's'}: ${n.w} won, ${n.l} lost.` : 'You never crossed blades.'}${said.length ? ` You ${said.join(', then ')} ${p.him}.` : ''}`;
    return {
      id, title: E.t, kind: E.k, paras: paras.map(fill), foes: said, nemLine,
      stats: [['Weeks', S.week - 1], ['Seasons', S.season || 1], ['Record', `${st.wins || 0}W ${st.losses || 0}L`], ['Fame', Math.round(S.fame)], ['Gold', Math.round(S.gold)], ['Spared', st.spares || 0], ['Killed', st.kills || 0], ['Ransoms', st.ransoms || 0], ['Trophies', Object.keys(S.trophies || {}).length]],
      fallen: (S.fallen || []).map((f) => ({ name: f.name, nick: f.nick || '', lvl: f.lvl, style: f.style })), freed: c.freed || [],
      nemesis: { name: n.name, nick: n.nick, state: n.state, w: n.w, l: n.l, met: n.met, prev: n.prev, scars: n.scars.slice() },
    };
  };
  /** a short line for the title screen under Continue (never empty text) */
  C.titleLine = (S) => {
    const c = S && S.camp; if (!c || !c.nem) return '';
    if (c.end) return `Story complete: ${C.ENDINGS[c.end].k}`;
    return `Chapter ${CHS[clamp(c.ch, 1, 5) - 1].n}: ${CHS[clamp(c.ch, 1, 5) - 1].t}`;
  };

  // ================================================================ the nemesis dossier (UI reads this)
  C.dossier = (S) => {
    const c = C.get(S); if (!c) return null; const n = c.nem, A = NEM[n.a], t = TAC[clamp(n.stage, 1, 4) - 1], rv = (S.rivals || {}).nem || { w: 0, l: 0 };
    const G2 = GROW(n);
    return { name: n.name, nick: n.nick, state: n.state, from: A.from, style: n.style, school: n.school, grudge: n.intro ? A.grudge : 'You have not yet heard his name.', intro: n.intro, stage: n.stage, tactic: t, level: G2.lvlB, scars: n.scars.map((s) => D.SCARS[s].n), w: n.w, l: n.l, hum: n.hum, met: n.met, next: n.next, fates: n.fates.slice(), mark: n.mark, prev: n.prev, trust: n.trust, sincere: n.sincere, rec: rv, kin: A.kin, soft: !!n.soft };
  };
  C.chapterCards = () => CHS;
  /** every authored string of the story as one text (tests scan it for em dashes and unresolved tokens) */
  C.allText = () => JSON.stringify([CHS, NEM, TAC, POOL, BEATS.map((b) => ({ t: b.t, lines: b.lines, cs: b.cs })), FINWIN, FINLOSE, END_CS, CHAMP]);
  C.rewardsFor = rewardsFor;

  // ================================================================ save validation (optional field)
  const mig = L.migrate;
  L.migrate = (S) => {
    const N = mig(S), c = N && N.camp;
    if (c !== undefined && c !== null) {
      const ok = c && typeof c === 'object' && c.v === 1 && c.nem && typeof c.nem === 'object' && Array.isArray(c.q) && c.cast && NEM[c.nem.a];
      if (!ok) delete N.camp; else {
        c.ch = clamp(Math.round(+c.ch) || 1, 1, 5); c.seen = c.seen && typeof c.seen === 'object' ? c.seen : {}; c.flags = c.flags && typeof c.flags === 'object' ? c.flags : {}; c.log = Array.isArray(c.log) ? c.log : []; c.done = c.done && typeof c.done === 'object' ? c.done : {}; c.cfate = c.cfate || {};
        const n = c.nem; n.scars = Array.isArray(n.scars) ? n.scars.filter((s) => D.SCARS[s]) : []; n.fates = Array.isArray(n.fates) ? n.fates : []; n.look = n.look || { skin: D.SKIN[0], hair: D.HAIR[0], plume: D.PLUME[0], face: 0, color: '#7a2f2f' }; n.stage = clamp(n.stage | 0 || 1, 1, 4);
        c.q = c.q.filter((q) => q && typeof q.t === 'string'); if (c.fin && !(c.fin.ch >= 1 && c.fin.ch <= 5)) c.fin = null; c.stake = Math.max(0, +c.stake || 0);
      }
    }
    return N;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
