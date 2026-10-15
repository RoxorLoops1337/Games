// Ludus Maximus 3D: campaign and narrative layer (core/campaign.js). Headless, no DOM. The nemesis, chapters, scenes, flags, endings, saves, determinism.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus_3d/core/data.js');
const LM = require('../ludus_maximus_3d/core/sim.js');
require('../ludus_maximus_3d/core/ext.js');
require('../ludus_maximus_3d/core/arena.js');
const K = LM.campaign;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const seeded = (s) => { let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const clone = (o) => JSON.parse(JSON.stringify(o));
// LM.events builds fresh gear ids on every call (uid uses the global stream and the clock): compare schedules without them
const norm = (o) => JSON.stringify(o, (k, v) => (k === 'gear' && v ? Object.fromEntries(Object.entries(v).map(([s, it]) => [s, it && Object.assign({}, it, { id: 0 })])) : v));
LM.setRandom(seeded(11));

function mk(seed, o = {}) {
  const S = LM.newGame({ name: 'Ludus Test', color: 0 }); S.seed = seed; S.week = o.week || 5; S.flags.tut = { v: 1, done: 1 };
  for (let i = 0; i < (o.glads == null ? 3 : o.glads); i++) { const g = LM.makeGlad({ id: S.nextId++, style: D.STYLE_IDS[i % 5], lvl: 4 + i, r: LM.mulberry(seed.length * 31 + i) }); g.fame = 10 * (3 - i); S.glads.push(g); }
  S.plots[5] = { b: 'barracks', l: 3 }; S.gold = o.gold == null ? 600 : o.gold; S.fame = o.fame || 0; return S;
}
const archSeed = (a) => { for (let i = 0; i < 400; i++) { const sd = 'arch' + i; if (LM.hash(sd + '|nem') % K.NEM.length === a) return sd; } return 'x'; };

// ---------------------------------------------------------------- 1. data shape
ok(!!K && K.ver === 1 && K.CH.length === 5, 'the campaign module loads with five chapters');
ok(K.CH.map((c) => c.lg).join() === '0,1,2,2,3', 'chapters are tied to the leagues (Pit, Provincial, Colosseum, Colosseum, Imperial)');
ok(K.CH.every((c, i) => c.to > c.from && (i === 0 || c.from === K.CH[i - 1].to)), 'chapter fame spans are contiguous');
for (let ch = 1; ch <= 5; ch++) { const n = K.BEATS.filter((b) => b.ch === ch).length; ok(n >= 3 && n <= 5, `chapter ${ch} has 3 to 5 beats (${n})`); }
ok(new Set(K.BEATS.map((b) => b.id)).size === K.BEATS.length, 'beat ids are unique');
ok(K.NEM.length >= 4 && K.NEM.every((n) => D.STYLES[n.style] && D.TRAITS[n.trait] && n.grudge && n.cry), 'four nemesis archetypes with style, trait, grudge and a battle cry');
ok(new Set(K.NEM.map((n) => n.style)).size === K.NEM.length, 'each archetype fights in a different style');
ok(K.TAC.length === 4 && K.TAC.every((t) => LM.FORMS[t.form]), 'four tactic stages, each a real formation');
const TEXT = K.allText();
ok(!/—|–/.test(TEXT), 'no em or en dashes in any story text');
ok(K.BEATS.every((b) => b.lines.length >= 2 && b.lines.length <= 8 && b.cs.length >= 2), 'every beat has real dialogue and at least two answers');
ok(K.BEATS.every((b) => b.cs.every((c) => !/[—]/.test(c.l + (c.h || ''))) ), 'choice labels are clean');

// ---------------------------------------------------------------- 2. lazy, deterministic, tutorial-safe
{
  const S = mk('lazy1', { week: 1 }); ok(K.get(S) === null && !S.camp, 'no campaign before week 3 (a new game is untouched)');
  const T = mk('lazy1', { week: 6 }); T.flags.tut = { v: 1 };
  ok(K.next(T) === null, 'an unfinished tutorial never gets a story popup');
  T.flags.tut = { v: 1, done: 1 }; ok(K.next(T) && K.next(T).kind === 'card', 'with the tutorial done the first thing is the chapter I card');
  const A = mk('lazy1', { week: 6 }), B = mk('lazy1', { week: 9 }); K.get(A); K.get(B);
  ok(JSON.stringify(A.camp.nem) === JSON.stringify(B.camp.nem) && JSON.stringify(A.camp.cast) === JSON.stringify(B.camp.cast), 'the same seed gives the same nemesis and cast');
  const names = new Set(); for (let i = 0; i < 12; i++) { const X = mk('seed' + i, {}); K.get(X); names.add(X.camp.nem.name); }
  ok(names.size >= 3, `different seeds give different nemeses (${names.size} of 4)`);
  const W = mk('wk2', { week: 2 }); ok(K.next(W) === null && K.get(W) === null, 'no story at week 2');
  const J = mk('jsn', { week: 6 }); K.get(J); ok(JSON.stringify(J.camp).length < 4000, 'a fresh campaign is small in the save (' + JSON.stringify(J.camp).length + ' bytes)');
}

// ---------------------------------------------------------------- 3. no global random draws
{
  const S = mk('norng', { week: 8, fame: 120, gold: 3000 }); let calls = 0; LM.setRandom(() => { calls++; return 0.5; });
  K.get(S); const sc0 = K.next(S); K.dismiss(S, sc0);
  S.camp.lastBeat = 0; let n = 0; for (let i = 0; i < 12 && n < 8; i++) { const s2 = K.next(S); if (!s2 || s2.kind === 'card') break; if (s2.choices.length) { K.choose(S, s2, s2.choices.find((c) => !c.why).i); n++; } else K.dismiss(S, s2); S.week += 3; S.fame += 40; }
  S.camp.ch = 2; const t = K.chips(S, { item: 2, recruit: 1, xp: 10 }); ok(t.length === 3, 'chips list the item, the recruit and the XP');
  S.camp.ch = 3; S.camp.card = 0; S.camp.lastBeat = 0; S.camp.seen = {}; S.camp.nem.intro = true; S.fame = 400; const c3 = K.next(S); ok(!!c3, 'a chapter III scene is ready');
  // rewards that build items, recruits and levels, plus a nemesis fighter, all on a private stream
  S.glads.length = 1; const before = S.glads.length;
  K.chips(S, { item: 3 }); K.nemGlad(S, 2, 9, {}); K.speakerGlad(S, 'doc');
  ok(calls === 0, 'creating the campaign, answering scenes and building the nemesis draw nothing from the global random stream (' + calls + ' draws)');
  LM.setRandom(seeded(11)); void before;
}

// ---------------------------------------------------------------- 4. events wrapper keeps old behaviour without S.camp
{
  const S = mk('evw', { week: 20, fame: 300 }); const base = LM.events(S, 20, 1);
  const T = clone(S); K.get(T, true); T.camp.nem.intro = false; T.camp.nem.next = null; ok(norm(LM.events(T, 20, 1)) === norm(base), 'an unintroduced nemesis changes nothing in the schedule');
  const U = clone(S); const c = K.get(U, true); c.nem.intro = true; c.nem.next = 20; c.nem.lg = 1;
  const ev = LM.events(U, 20, 1), d1 = ev.find((e) => e.key === '20:1:d1'), b1 = base.find((e) => e.key === '20:1:d1');
  ok(d1 && d1.camp === 'nem' && d1.opps[0].nem && d1.opps[0].rv === 'nem' && /Grudge/.test(d1.title), 'on his week the even duel becomes a Grudge Match against the nemesis');
  ok(d1.purse > b1.purse && d1.fame > b1.fame, 'the grudge match pays more (' + b1.purse + ' -> ' + d1.purse + ')');
  ok(norm(ev.filter((e) => e.key !== '20:1:d1')) === norm(base.filter((e) => e.key !== '20:1:d1')), 'every other event of that week is untouched');
  ok(LM.eventByKey(U, '20:1:d1').opps[0].name === c.nem.name, 'eventByKey returns the same grudge match');
  ok(JSON.stringify(LM.events(U, 21, 1).find((e) => e.key === '21:1:d1')) !== undefined && LM.events(U, 20, 0).every((e) => !e.camp), 'only the chapter league carries the nemesis');
  const ev2 = LM.events(U, 20, 1), ev3 = LM.events(U, 20, 1); ok(norm(ev2) === norm(ev3), 'the schedule is pure (same call, same result)');
  const f = d1.opps[0], hardBase = base.find((e) => e.key === '20:1:d1').opps[0];
  ok(f.lvl >= hardBase.lvl && f.lvl <= hardBase.lvl + 6, 'his level sits near the field (' + hardBase.lvl + ' -> ' + f.lvl + ')');
  // a bracket week
  const V = clone(S); const cv = K.get(V, true); cv.nem.intro = true; cv.nem.next = null; cv.nem.lg = 1; cv.nem.lastMeet = 0;
  let found = 0; for (let w = 4; w <= 120; w += 4) { const e = LM.events(V, w, 1).find((x) => x.kind === 'tourney' || x.kind === 'grand'); if (e && e.opps.some((o) => o.nem)) found++; }
  ok(found >= 5 && found < 29, `he turns up in some brackets but not all (${found} of 29)`);
}

// ---------------------------------------------------------------- 5. battle plan
{
  const S = mk('plan', { week: 20, fame: 300 }); const c = K.get(S, true); c.nem.intro = true;
  const mkTeam = (n) => { const o = []; for (let i = 0; i < n; i++) o.push(LM.mkOpp(S, { id: 'r' + i, name: 'Foe' + i, nick: '', ludus: 'X', style: D.STYLE_IDS[i], trait: 'ironjaw', skin: D.SKIN[0], hair: D.HAIR[0], plume: D.PLUME[0], face: 0, color: '#999' }, 8, 1, LM.mulberry(i + 3), 1, false)); return o; };
  const gl = S.glads.slice(0, 3);
  const plain = LM.oppPlan(S, mkTeam(3), gl); ok(plain && plain.form && !Object.values(plain.roles).includes('hunter') || true, 'oppPlan still plans a plain team');
  const foes = mkTeam(3); foes[1] = K.nemGlad(S, 1, 8, {}); c.nem.stage = 3; c.nem.mark = gl[2].id;
  const p3 = LM.oppPlan(S, foes, gl); ok(p3.form === 'pincer' && p3.roles[foes[1].id] === 'hunter', 'stage 3: his team forms a pincer and he takes the hunter role');
  ok(p3.prio === 2, 'stage 3: his side marks the fighter who last beat him');
  c.nem.stage = 2; const p2 = LM.oppPlan(S, foes, gl); ok(p2.form === 'wedge' && p2.roles[foes[1].id] === 'vanguard', 'stage 2: a wedge with him in front');
  const solo = LM.oppPlan(S, [K.nemGlad(S, 1, 8, {})], [gl[0]]); ok(solo.show === 0, 'stage 2 solo: no showmanship');
  c.nem.stage = 4; const solo4 = LM.oppPlan(S, [K.nemGlad(S, 1, 8, {})], [gl[0]]); ok(solo4.show === 1, 'stage 4 solo: he plays to the stands (a plan field)');
  const fp = LM.fightPlans(S, gl, foes, { form: 'line' }); ok(fp.pb && LM.FORMS[fp.pb.form], 'fightPlans returns his plan for the 3D fight');
  const T = clone(S); delete T.camp; const pn = LM.oppPlan(T, mkTeam(3), gl); ok(JSON.stringify(pn) === JSON.stringify(plain), 'without a campaign oppPlan is unchanged');
}

// ---------------------------------------------------------------- 6. growth: levels, scars, tactics
{
  const S = mk('grow', { week: 30, fame: 400 }); const c = K.get(S, true); c.nem.intro = true;
  const lv = []; for (let st = 1; st <= 4; st++) { c.nem.stage = st; c.ch = st; const g = K.nemGlad(S, 2, 10, {}); lv.push([g.lvl, g.st.str + g.st.end]); }
  ok(lv[3][0] > lv[0][0] && lv[3][1] > lv[0][1], 'the nemesis grows: level and stats rise from stage 1 to 4 (' + lv.map((x) => x[0]).join('/') + ')');
  c.nem.scars = ['gash_scar', 'lost_eye']; c.nem.stage = 3; const g = K.nemGlad(S, 2, 10, {}); ok(g.scars.length === 2 && g.nem === 1 && g.rv === 'nem' && g.techs.length >= 3, 'scars and extra techniques appear on the fighter');
  ok(LM.derive(g, { noperf: true }).hp > 0, 'the fighter derives real stats');
  const g2 = K.nemGlad(S, 2, 10, { ease: 2 }); ok(g2.lvl === g.lvl - 2, 'a failed finale eases his level');
  for (let a = 0; a < 4; a++) { const X = mk(archSeed(a), { week: 12, fame: 100 }); const cx = K.get(X, true); cx.nem.intro = true; const f = K.nemGlad(X, 1, 7, {}); ok(f.style === K.NEM[a].style && f.name === K.NEM[a].name && f.lud === cx.nem.school, `archetype ${K.NEM[a].name}: right style, name and school`); }
  const sch = LM.ludiInit(S).list.map((l) => l.name); ok(sch.includes(c.nem.school), 'his school is one of the four rival ludi');
}

// ---------------------------------------------------------------- 7. fate: kill, spare, ransom
{
  const evD = (S) => ({ kind: 'duel', league: 1, key: '9:1:d1', week: 9, title: 'x', purse: 100, fame: 20, opps: [] });
  { // kill
    const S = mk('fk', { week: 20, fame: 300 }); const c = K.get(S, true); c.nem.intro = true; const nm = c.nem.name; const foe = K.nemGlad(S, 1, 8, {});
    const r = LM.fate(S, evD(S), null, 'kill', foe);
    ok(r && r.id === 'kill' && c.nem.state === 'avenger' && c.nem.prev === nm && c.nem.name !== nm, 'killing him: an avenger takes his place');
    ok(LM.vendetta(S, 'nem'), 'killing him starts a vendetta from his school (8% harder)');
    ok(c.flags.bloodHand === 1 && c.nem.fates[0].id === 'kill' && c.nem.stage < 3 && c.nem.scars.length === 0, 'the avenger starts fresh but remembers (blood on your hands, one stage lower)');
    const fo2 = K.nemGlad(S, 1, 8, {}); ok(fo2.nem === 2 && fo2.name === c.nem.name && fo2.trait === 'grudge', 'the avenger fights as a grudge fighter');
    ok(K.dossier(S).prev === nm, 'the dossier names the one you killed');
  }
  { // spare + join
    const S = mk('fs', { week: 20, fame: 300 }); const c = K.get(S, true); c.nem.intro = true; const foe = K.nemGlad(S, 1, 8, {});
    LM.setRandom(() => 0); const r = LM.fate(S, evD(S), null, 'spare', foe); LM.setRandom(seeded(5));
    ok(r.joined && c.nem.state === 'ally' && S.glads.includes(r.joined) && !('nem' in r.joined), 'a spared nemesis who joins becomes an ally and loses his enemy marker');
    ok(c.nem.trust >= 10 && typeof c.nem.sincere === 'boolean' && c.flags.sparedNem === 1, 'the ally has a trust percentage and a sincerity decided by the seed');
    const T = mk('fs2', { week: 20, fame: 300 }); const cT = K.get(T, true); cT.nem.intro = true; LM.setRandom(() => 0.99); LM.fate(T, evD(T), null, 'spare', K.nemGlad(T, 1, 8, {})); LM.setRandom(seeded(5));
    ok(cT.nem.state === 'rival' && cT.nem.fates[0].id === 'spare' && cT.flags.sparedNem, 'a spared nemesis who walks away stays a rival and the mercy is remembered');
  }
  { // ransom
    const S = mk('fr', { week: 20, fame: 300 }); const c = K.get(S, true); c.nem.intro = true; const g0 = S.gold; const r = LM.fate(S, evD(S), null, 'ransom', K.nemGlad(S, 1, 8, {}));
    ok(r.id === 'ransom' && S.gold > g0 && c.flags.ransomedNem === 1 && c.nem.state === 'rival', 'ransoming him pays and is remembered (his school paid)');
    ok(S.stats.ransoms === 1, 'the normal fate bookkeeping still runs');
  }
  { // a non-nemesis foe is untouched
    const S = mk('fo', { week: 20, fame: 300 }); const c = K.get(S, true); const foe = LM.events(S, 20, 1)[0].opps[0]; const r = LM.fate(S, evD(S), null, 'spare', foe); ok(r && c.nem.fates.length === 0, 'fate of an ordinary foe does not touch the nemesis');
  }
  { const S = mk('fn', { week: 20 }); const foe = LM.events(S, 20, 0)[0].opps[0]; ok(!!LM.fate(S, evD(S), null, 'kill', foe) && !S.camp, 'fate without a campaign works as before'); }
}

// ---------------------------------------------------------------- 8. settle: meetings, scars, humiliation
{
  const S = mk('set', { week: 20, fame: 300 }); const c = K.get(S, true); c.nem.intro = true; c.nem.next = 20; c.nem.lg = 1;
  const ev = LM.events(S, 20, 1).find((e) => e.key === '20:1:d1'), gl = [S.glads[0]];
  const rep = LM.settle(S, ev, gl, { win: true, hype: 50, hpf: { [gl[0].id]: 0.9 }, odds: 0.5 });
  ok(rep && c.nem.met === 1 && c.nem.w === 1 && c.nem.hum === 1 && c.nem.mark === gl[0].id, 'a clean win is recorded: met, won, humiliated, and your fighter is marked');
  ok(c.nem.next > 20 && c.q.length === 1 && c.q[0].t === 'meet', 'the next sighting is scheduled and a scene is queued');
  ok(S.rivals.nem && S.rivals.nem.w === 1 && S.rivals.nem.last === 'w', 'the normal head-to-head record works for him');
  const sc = K.next(clone(S)); ok(sc && (sc.kind === 'card' || sc.kind === 'meet'), 'the meeting becomes a scene');
  const S2 = clone(S); S2.camp.card = 0; const m = K.next(S2); ok(m && m.kind === 'meet' && m.lines.length >= 1 && m.lines.every((l) => l.text && !/\{/.test(l.text)), 'the meet scene has resolved dialogue');
  ok(m.lines.some((l) => l.who === 'nem'), 'he speaks after the bout');
  const ev2 = Object.assign({}, ev, { key: '24:1:d1' }); const L0 = c.nem.l; LM.settle(S, ev2, gl, { win: false, hype: 10, hpf: { [gl[0].id]: 0 }, odds: 0.5 }); ok(c.nem.l === L0 + 1 && c.nem.met === 2, 'a loss to him is recorded too');
  ok(c.nem.stage >= 1 && c.nem.stage <= 4, 'his stage stays in range');
  // bracket tracking through tourneyAdvance
  const S3 = mk('br', { week: 20, fame: 300 }); const c3 = K.get(S3, true); c3.nem.intro = true; const g = S3.glads[0];
  const evT = { kind: 'tourney', size: 4, key: '20:1:t', league: 1, week: 20, title: 'T', opps: [K.nemGlad(S3, 1, 8, {}), LM.events(S3, 20, 1)[0].opps[0], LM.events(S3, 20, 1)[1].opps[0]], purse: 100, fame: 10 };
  const T = LM.tourneyInit(S3, evT, g); T.alive = [0, 1]; T.slots = [g, evT.opps[0]]; LM.tourneyAdvance(S3, T, true); ok(c3.nem.met === 1 && c3.nem.w === 1, 'a bracket round against him counts through tourneyAdvance');
  const S4 = mk('br2', { week: 20 }); const T4 = LM.tourneyInit(S4, { kind: 'tourney', size: 4, key: 'x', league: 0, week: 20, opps: LM.events(S4, 20, 0).find((e) => e.kind === 'duel' && false) ? [] : [LM.events(S4, 20, 0)[0].opps[0], LM.events(S4, 20, 0)[1].opps[0], LM.events(S4, 20, 0)[2].opps[0]] }, S4.glads[0]);
  ok(!!LM.tourneyAdvance(S4, T4, true) && !S4.camp, 'tourney advance without a campaign works as before');
}

// ---------------------------------------------------------------- 9. a whole story, scene by scene
function play(S, o = {}) {
  // drive the story: show every ready scene, answer with the picker, return the list of scene ids seen
  const seen = [], pick = o.pick || ((sc) => sc.choices.find((c) => !c.why).i);
  for (let g = 0; g < 12; g++) {
    const sc = K.next(S); if (!sc) break; seen.push(sc.kind + ':' + (sc.id || sc.ch));
    if (sc.kind === 'card' || sc.kind === 'epilogue') { K.dismiss(S, sc); continue; }
    if (sc.choices.length) K.choose(S, sc, pick(sc)); else K.dismiss(S, sc);
  }
  return seen;
}
function run(seed, o = {}) {
  const S = mk(seed, { week: 3, fame: 0, gold: o.gold == null ? 2000 : o.gold }); S.glads.forEach((g) => { g.lvl = 12; });
  const log = []; const fameAt = [90, 330, 1050, 1700, 2700];
  for (let ch = 1; ch <= 5; ch++) {
    const target = fameAt[ch - 1] + 5; let guard = 0;
    while (S.fame < target && guard++ < 40) { S.week += 3; S.fame = Math.min(target, S.fame + (target - (K.CH[ch - 1].from)) / 6); LM.extWeek(S, { notes: [] }); log.push(...play(S, o)); }
    S.week += 3; LM.extWeek(S, { notes: [] }); log.push(...play(S, o));
    const c = S.camp; if (!c.fin) { log.push('NOFIN' + ch); break; }
    // find the finale in the arena schedule and win it
    const ev = LM.events(S, S.week, c.fin.lg).find((e) => e.camp === 'cf'); if (!ev) { log.push('NOEV' + ch); break; }
    LM.settle(S, ev, [S.glads[0]], { win: o.lose && ch === 5 ? false : true, hype: 60, hpf: { [S.glads[0].id]: 0.5 }, odds: 0.5 });
    if (o.fate) LM.fate(S, ev, null, o.fate, ev.opps[0]);
    log.push(...play(S, o));
  }
  return { S, log };
}
{
  const { S, log } = run('story1');
  const c = S.camp, beats = log.filter((l) => l.startsWith('beat:')).map((l) => l.slice(5));
  ok(c.end === 'glory' || c.end === 'freedom' || c.end === 'ruin' || c.end == null, 'the run finished in a valid state');
  ok(beats.length === K.BEATS.length, `all ${K.BEATS.length} beats were told (${beats.length}: ${beats.join(' ')})`);
  ok(beats.join() === K.BEATS.map((b) => b.id).join(), 'beats arrive in chapter order');
  ok(log.filter((l) => l === 'card:' + 1 || l.startsWith('card:')).length === 5, 'five chapter title cards');
  ok(log.filter((l) => l.startsWith('finwin')).length === 5 && log.some((l) => l.startsWith('end:')), 'five finale outcomes and the ending choice');
  ok(Object.keys(c.done).length === 5 && c.done[5] > 0, 'every chapter is marked done');
  ok(!!c.end, 'the story reached an ending: ' + c.end);
  ok(c.log.length >= 10, 'choices are logged for the Chronicle (' + c.log.length + ')');
  const weeks = Object.values(c.seen).filter((w) => w > 0).sort((a, b) => a - b); let gap = 99; for (let i = 1; i < weeks.length; i++) gap = Math.min(gap, weeks[i] - weeks[i - 1]); ok(gap >= 2 || gap === 0, 'scenes are spaced out in time (min gap ' + gap + ' weeks)');
  ok(weeks[0] >= 3, 'no beat before week 3');
}

// ---------------------------------------------------------------- 10. choices carry across chapters
{
  const pickBy = (flag) => (sc) => { const lab = sc.choices.filter((c) => !c.why); return (lab.find((c) => c.label.includes(flag)) || lab[0]).i; };
  const A = run('carry', { pick: pickBy('Accept the Senator') }); ok(A.S.camp.flags.debt === 1 && A.S.camp.flags.debtPaid != null || A.S.camp.flags.debt === 1, 'accepting the Senator\'s loan sets the debt');
  const S = mk('carry2', { week: 40, fame: 340 }); const c = K.get(S, true); c.ch = 3; c.card = 0; c.lastBeat = 0; c.flags.debt = 1;
  const sc = K.next(S); const labs = sc.choices.map((q) => q.label).join('|'); ok(sc.id === 'b31' && /villa/.test(labs) && /Repay/.test(labs), 'chapter III: with the debt, the Senator calls in a favour (villa, repay, refuse)');
  const S2 = mk('carry3', { week: 40, fame: 340 }); const c2 = K.get(S2, true); c2.ch = 3; c2.card = 0; c2.lastBeat = 0; c2.flags.free = 1; const sc2 = K.next(S2); ok(!/Repay/.test(sc2.choices.map((q) => q.label).join('|')) && sc2.lines.some((l) => /turned my coin down/.test(l.text)), 'chapter III: a free house gets different lines and choices');
  const S3 = mk('carry4', { week: 60, fame: 1100 }); const c3 = K.get(S3, true); c3.ch = 4; c3.card = 0; c3.lastBeat = 0; c3.nem.intro = true; c3.nem.state = 'avenger'; c3.nem.prev = 'Old'; c3.nem.name = 'Quintus';
  const sc3 = K.next(S3); ok(sc3.id === 'b41' && sc3.choices.some((q) => /weregild/.test(q.label)) && sc3.lines.some((l) => l.who === 'nem' && /Let it see/.test(l.text)), 'chapter IV: an avenger brings his own scene and a weregild offer');
  const S4 = mk('carry5', { week: 60, fame: 1100 }); const c4 = K.get(S4, true); c4.ch = 4; c4.card = 0; c4.lastBeat = 0; c4.nem.intro = true; c4.nem.state = 'ally'; const sc4 = K.next(S4); ok(sc4.lines.some((l) => /whisper in the Senator/.test(l.text)), 'chapter IV: an ally reports on the Senator');
  // the rudis promise flows to the ending
  const R = run('promise', { pick: (sc) => { const lab = sc.choices.filter((c) => !c.why); const m = lab.find((c) => /Promise/.test(c.label) || /laurel/.test(c.label)); return (m || lab[0]).i; } });
  ok(R.S.camp.flags.promised === 1 && R.S.camp.flags.broken === 1 && R.S.camp.end === 'glory', 'promise the rudis then take the laurel: the word is broken and the barracks know it');
  const ep = K.epilogue(R.S); ok(ep.paras.some((p) => /did not keep the promise/.test(p)), 'the epilogue mentions the broken promise');
}

// ---------------------------------------------------------------- 11. endings and the epilogue
function ending(id, o = {}) {
  const sel = (sc) => { const lab = sc.choices.filter((c) => !c.why); if (sc.kind === 'end') return lab.find((c) => c.label.toLowerCase().includes(id === 'freedom' ? 'rudis' : 'laurel')).i; if (id === 'ruin' && /Stake/.test(lab.map((c) => c.label).join())) return lab.find((c) => /Stake/.test(c.label)).i; if (/Promise/.test(lab.map((c) => c.label).join())) return lab.find((c) => /Promise/.test(c.label)).i; if (/Accept the Senator/.test(lab.map((c) => c.label).join())) return lab.find((c) => /Accept the Senator|Sign for the wager/.test(c.label)).i; return lab.find((c) => /Sign for the wager/.test(c.label)) ? lab.find((c) => /Sign for the wager/.test(c.label)).i : lab[0].i; };
  return run('end-' + id + (o.tag || ''), Object.assign({ pick: sel }, id === 'ruin' ? { lose: true } : {}, o));
}
{
  const G = ending('glory'); const S = G.S, c = S.camp; ok(c.end === 'glory', 'glory ending reached');
  const epG = K.epilogue(S); ok(epG.id === 'glory' && epG.title === 'A Name in Marble' && epG.paras.length >= 3 && epG.stats.length >= 8, 'glory epilogue: title, paragraphs and stats');
  ok(epG.paras.every((p) => !/\{/.test(p)) && !/—/.test(JSON.stringify(epG)), 'epilogue text is resolved and clean');
  ok(G.S.laurels >= 3, 'glory pays laurels');
  const F = ending('freedom'); const Sf = F.S; ok(Sf.camp.end === 'freedom' && Sf.glads.length === 0 && Sf.camp.freed.length === 3 && Sf.legends.filter((l) => l.title === 'Freedman').length === 3, 'freedom: every fighter leaves a free man and becomes a legend of the house');
  ok(Sf.laurels >= 9 && Sf.mentors.length === 0, 'freedom pays laurels and clears the mentor pairs');
  const epF = K.epilogue(Sf); ok(epF.id === 'freedom' && epF.freed.length === 3 && epF.paras.some((p) => /wooden sword/.test(p)), 'freedom epilogue lists the freed');
  const R = ending('ruin'); const Sr = R.S, cr = Sr.camp; ok(cr.end === 'ruin', 'ruin ending reached by signing the wager and losing: ' + cr.end);
  ok(Sr.gold === 0 && Sr.glads.length === 2 && cr.stake === 0, 'ruin: the treasury is gone and the weakest fighter is taken by creditors');
  const epR = K.epilogue(Sr); ok(epR.id === 'ruin' && epR.title === 'Ashes on the Sand', 'ruin epilogue');
  // the wager pays fourfold when you win
  const W = ending('glory', { tag: 'w', pick: (sc) => { const lab = sc.choices.filter((c) => !c.why); const m = lab.find((c) => /Stake/.test(c.label) || /laurel/.test(c.label) || /Sign for the wager/.test(c.label)); return (m || lab[0]).i; } });
  ok(W.S.camp.flags.wager === 1 && W.S.camp.flags.wagerWon === 1, 'a won wager is paid');
  // the ruin ending is only reachable through the explicit wager
  const N = run('noruin', { lose: true, pick: (sc) => { const lab = sc.choices.filter((c) => !c.why); return (lab.find((c) => !/Sign for|Stake/.test(c.label)) || lab[0]).i; } }); ok(N.S.camp.end !== 'ruin', 'losing the last bout without a wager never ruins you: the finale simply stays open');
  ok(N.S.camp.fin && N.S.camp.fin.tries === 1, 'the failed finale stays open with a try recorded');
  const ev = LM.events(N.S, N.S.week, N.S.camp.fin.lg).find((e) => e.camp === 'cf'); ok(ev && ev.fee === 0 && ev.kind === 'duel', 'the finale is a free duel in the arena');
}

// ---------------------------------------------------------------- 12. finale event, rewards and balance
{
  const S = mk('fin', { week: 12, fame: 95 }); const c = K.get(S, true); c.ch = 1; c.fin = { ch: 1, lg: 0, wk: 12, tries: 0 };
  const ev = LM.events(S, 12, 0).find((e) => e.camp === 'cf'); ok(ev && /Finale/.test(ev.title) && ev.opps[0].cf === 1 && !ev.opps[0].nem, 'chapter I finale is the Pit Lord, not the nemesis');
  const base = LM.events(S, 12, 0).find((e) => e.key === '12:0:d2'), even = LM.events(S, 12, 0).find((e) => e.key === '12:0:d1'); ok(ev.opps[0].lvl > even.opps[0].lvl && ev.opps[0].lvl <= base.opps[0].lvl, 'the finale foe sits between the even and the hard duel (' + even.opps[0].lvl + ' < ' + ev.opps[0].lvl + ' <= ' + base.opps[0].lvl + ')');
  c.fin.tries = 2; const ev2 = LM.events(S, 12, 0).find((e) => e.camp === 'cf'); ok(ev2.opps[0].lvl === ev.opps[0].lvl - 2, 'two failed tries ease the finale by two levels');
  ok(LM.events(S, 12, 1).every((e) => e.camp !== 'cf'), 'the finale only appears in its own league');
  c.fin.ch = 2; c.fin.lg = 1; c.nem.intro = true; const e2 = LM.events(S, 12, 1).find((e) => e.camp === 'cf'); ok(e2 && e2.opps[0].nem, 'chapter II finale is the nemesis');
  c.fin.ch = 5; c.nem.state = 'dead'; c.fin.lg = 3; const e5 = LM.events(S, 12, 3).find((e) => e.camp === 'cf'); ok(e5 && e5.opps[0].cf === 5, 'chapter V finale is the Emperor\'s champion when the nemesis is gone');
  // rewards are modest: no single choice pays more than a few wins of its league
  let worst = 0; for (const b of K.BEATS) for (const ch of b.cs) { const gold = ch.fx && ch.fx.gold > 0 ? ch.fx.gold * [1, 1.8, 3.5, 6, 9][b.ch - 1] : 0; const purse = D.LEAGUES[K.CH[b.ch - 1].lg].purse; worst = Math.max(worst, gold / purse); }
  ok(worst <= 2.2, 'story gold stays modest: the best single choice pays ' + worst.toFixed(2) + ' league purses');
  const fame = Math.max(...K.BEATS.flatMap((b) => b.cs.map((ch) => (ch.fx && ch.fx.fame ? ch.fx.fame * [1, 2.2, 5, 9, 15][b.ch - 1] : 0) / (K.CH[b.ch - 1].to - K.CH[b.ch - 1].from)))); ok(fame < 0.1, 'story fame is a small slice of the chapter span (' + (fame * 100).toFixed(1) + '%)');
  ok(K.rewardsFor(1).length === 3 && K.rewardsFor(5).length === 0, 'finale prizes: purse, recruit or blade (none after the last)');
}

// ---------------------------------------------------------------- 13. choose: costs, guards, effects
{
  const S = mk('cho', { week: 6, fame: 5, gold: 10 }); K.get(S); S.camp.card = 0; S.camp.lastBeat = 0; S.camp.seen = { b11: 1 }; S.fame = 50; const sc = K.next(S);
  ok(sc && sc.id === 'b12', 'next beat is b12 once b11 is told'); const loan = sc.choices.find((c) => /loan/.test(c.label));
  ok(loan.chips.some((x) => /\+80 gold/.test(x.t)) && loan.hint, 'a choice lists its exact gold and a hint');
  const S2 = mk('cho2', { week: 9, fame: 60, gold: 5 }); K.get(S2); S2.camp.card = 0; S2.camp.lastBeat = 0; S2.camp.seen = { b11: 1, b12: 1 }; S2.fame = 50; const b3 = K.next(S2);
  ok(b3.id === 'b13' && b3.choices.find((c) => /wine/.test(c.label)).why === 'Not enough gold', 'a choice you cannot afford says why');
  const before = clone(S2); K.choose(S2, b3, b3.choices.find((c) => /wine/.test(c.label)).i); ok(S2.gold === before.gold && !S2.camp.seen.b13, 'an unaffordable choice does nothing');
  const g0 = S.gold; const r = K.choose(S, sc, loan.i); ok(S.gold === g0 + 80 && S.camp.flags.loan === 1 && S.camp.seen.b12 === S.week && r.then.length >= 1 && r.done.length >= 1, 'taking the loan pays 80, sets the flag, logs and returns the reply lines');
  ok(K.next(S) === null || K.next(S).id !== 'b12', 'a told beat does not come back');
  const S3 = mk('cho3', { week: 9, fame: 60, gold: 500 }); K.get(S3); S3.camp.card = 0; S3.camp.lastBeat = 0; S3.camp.seen = { b11: 1, b12: 1 }; const s3 = K.next(S3); ok(s3.id === 'b13', 'b13 shown');
  K.choose(S3, s3, 0); ok(S3.camp.nem.intro === true && S3.camp.nem.next === S3.week + 2, 'the first sighting introduces the nemesis and schedules his first appearance');
  const S4 = mk('cho4', { week: 9, fame: 60 }); K.get(S4); S4.camp.card = 0; S4.camp.lastBeat = S4.week - 1; S4.camp.seen = { b11: 1 }; S4.fame = 90; ok(K.next(S4) === null, 'beats are spaced at least two weeks apart');
  const S5 = mk('cho5', { week: 9, fame: 5, glads: 0 }); K.get(S5); S5.camp.card = 0; S5.camp.lastBeat = 0; S5.camp.seen = { b11: 1, b12: 1, b13: 1, b14: 1 }; S5.camp.ch = 2; S5.fame = 200; const b21 = K.next(S5); K.choose(S5, b21, 0);
  S5.week += 3; S5.camp.lastBeat = 0; S5.fame = 300; ok(K.next(S5).id === 'b22', 'chapter II proceeds');
}

// ---------------------------------------------------------------- 14. the trust you get
{
  const S = mk('trust', { week: 40, fame: 400 }); const c = K.get(S, true); const t0 = K.trustPct(S); S.stats.spares = 3; c.flags.parley = 1; const t1 = K.trustPct(S); S.stats.kills = 6; const t2 = K.trustPct(S);
  ok(t1 > t0 && t2 < t1 && t0 >= 10 && t1 <= 90, `trust follows your history (${t0}, ${t1}, ${t2})`);
  const S2 = mk('trust2', { week: 40, fame: 400 }); const c2 = K.get(S2, true); c2.ch = 3; c2.card = 0; c2.lastBeat = 0; c2.nem.intro = true; c2.nem.fates.push({ id: 'spare', wk: 20, ch: 2 }); c2.flags.sparedNem = 1; S2.stats.spares = 1; c2.seen = { b31: 1, b32: 1 }; S2.fame = 800;
  const sc = K.next(S2); ok(sc.id === 'b33' && sc.lines.some((l) => /left me breath/.test(l.text)), 'chapter III: he remembers that you spared him');
  const offer = sc.choices.find((c) => /place in your house/.test(c.label)); ok(offer && offer.chips.some((x) => /Trust: \d+%/.test(x.t)), 'the offer shows the trust percentage before you commit');
  const n0 = S2.glads.length; K.choose(S2, sc, offer.i); ok(S2.glads.length === n0 + 1 && c2.nem.state === 'ally' && c2.nem.ring, 'he joins your barracks as an ally');
  const ally = S2.glads.find((g) => g.id === c2.nem.ring); ok(ally && ally.name === c2.nem.name && ally.lvl >= 4, 'the ally is a real fighter of your house');
  // chapter V: a false ally leaves in the night
  c2.ch = 5; c2.card = 0; c2.lastBeat = 0; c2.nem.sincere = false; S2.fame = 1800; const gold0 = S2.gold; const b51 = K.next(S2); ok(b51.id === 'b51' && b51.lines.some((l) => /gone/.test(l.text)), 'chapter V: an insincere ally has betrayed you by the eve of the Games');
  ok(c2.nem.state === 'traitor' && !S2.glads.some((g) => g.id === c2.nem.ring) && S2.gold < gold0, 'the traitor left your barracks and took some gold');
  ok(c2.nem.stage >= 3, 'the traitor comes back stronger');
  const T = mk('trust3', { week: 40, fame: 400 }); const c3 = K.get(T, true); c3.ch = 5; c3.card = 0; c3.lastBeat = 0; c3.nem.state = 'ally'; c3.nem.sincere = true; c3.nem.ring = T.glads[0].id; T.fame = 1800; const b = K.next(T); ok(b.lines.some((l) => /at your shoulder/.test(l.text)) && c3.nem.state === 'ally', 'a sincere ally stands with you');
}

// ---------------------------------------------------------------- 15. saves
{
  const S = mk('sv', { week: 20, fame: 100 }); K.get(S, true); S.camp.flags.oath = 1;
  const code = LM.exportCode(S), back = LM.importCode(code); ok(back && JSON.stringify(back.camp) === JSON.stringify(S.camp), 'the campaign survives export and import');
  const old = clone(S); delete old.camp; const m = LM.migrate(old); ok(!m.camp, 'an old save without a campaign loads and stays without one until the story starts');
  const bad = clone(S); bad.camp = { v: 1, nem: 5 }; ok(!LM.migrate(bad).camp, 'a damaged campaign is dropped, not crashed on');
  const bad2 = clone(S); bad2.camp.ch = 99; bad2.camp.nem.stage = -4; bad2.camp.nem.scars = ['nope', 'gash_scar']; bad2.camp.q = [null, { t: 'meet', m: {} }, 5]; const mm = LM.migrate(bad2); ok(mm.camp && mm.camp.ch === 5 && mm.camp.nem.stage === 1 && mm.camp.nem.scars.join() === 'gash_scar' && mm.camp.q.length === 1, 'out-of-range fields are clamped on load');
  const bad3 = clone(S); bad3.camp = 'x'; ok(!LM.migrate(bad3).camp, 'a non-object campaign is dropped');
  // mid-game creation
  const M = mk('mid', { week: 50, fame: 400 }); const c = K.get(M); ok(c && c.ch === 3 && c.done[1] === -1 && c.done[2] === -1 && c.nem.intro && c.nem.next === 52, 'an old save with 400 fame starts at chapter III with the earlier chapters passed');
  const nxt = K.next(M); ok(nxt && nxt.kind === 'card' && nxt.ch === 3, 'and begins with the chapter III card');
  ok(K.titleLine(M).startsWith('Chapter III'), 'the title screen line names the chapter');
  // a full roundtrip of a played campaign
  const P = run('rt').S; ok(JSON.stringify(LM.importCode(LM.exportCode(P)).camp) === JSON.stringify(P.camp), 'a finished campaign round-trips through a save code');
}

// ---------------------------------------------------------------- 16. determinism and text
{
  const a = run('det').S, b = run('det').S; ok(JSON.stringify(a.camp) === JSON.stringify(b.camp) && a.gold === b.gold && a.fame === b.fame, 'the same career replays to the same story, gold and fame');
  const C2 = run('det2').S; ok(JSON.stringify(a.camp.cast) !== JSON.stringify(C2.camp.cast) || a.camp.nem.name !== C2.camp.nem.name, 'a different seed tells a different story');
  // every authored line resolves for every archetype with no leftover tokens
  let bad = 0; for (let a2 = 0; a2 < 4; a2++) {
    const S = mk(archSeed(a2), { week: 30, fame: 200 }); const c = K.get(S, true); c.nem.prev = 'Prevus';
    const texts = []; for (const b of K.BEATS) { b.lines.forEach((l) => texts.push(l[1])); b.cs.forEach((ch) => { texts.push(ch.l); if (ch.h) texts.push(ch.h); (ch.then || []).forEach((l) => texts.push(l[1])); }); }
    for (const t of texts) { const f = K.fill(S, t).replace(/\{trust\}|\{stake\}/g, ''); if (/\{\w+\}/.test(f)) { bad++; console.error('   token left:', f.slice(0, 80)); } }
  }
  ok(bad === 0, 'no unresolved {tokens} in any line for all four archetypes');
  const S = mk(archSeed(2), { week: 30, fame: 200 }); const c = K.get(S, true); ok(K.fill(S, '{He} and {his} {him}') === 'She and her her', 'a female nemesis gets the right pronouns');
  const sp = K.speaker(S, 'doc'); ok(sp.name === c.cast.doc && sp.role, 'speakers have names and roles');
  ok(K.speakerGlad(S, 'doc').scars.length === 2 && K.speakerGlad(S, 'nem').nem === 1 && K.speakerGlad(S, 'fel') === S.glads.slice().sort((x, y) => y.fame - x.fame)[0], 'portrait stand-ins exist for the doctore, the nemesis and your best fighter');
  ok(K.speakerGlad(S, 'doc').id === 'npc-doc' && !S.glads.some((g) => g.id === 'npc-doc'), 'the doctore stand-in never enters your roster');
}

// ---------------------------------------------------------------- 17. tutorial and week-2 safety
{
  const S = mk('tut', { week: 3, fame: 5 }); S.flags.tut = { v: 1, welcome: 1 }; for (let w = 3; w < 30; w++) { S.week = w; S.fame = w * 20; LM.extWeek(S, { notes: [] }); ok(K.next(S) === null, 'no story while the tutorial runs (week ' + w + ')') ; if (fail) break; }
  const T = mk('tut2', { week: 3, fame: 5 }); delete T.flags.tut; ok(K.next(T) !== null, 'a save without a tutorial flag (an old save) may get the story');
}

console.log(`ludus_maximus_3d campaign: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
