// Ludus Maximus 3D: headless balance harness. Plays many seeded careers with a competent, boring policy and prints the economy,
// win rates by league, injury / scar / death rates, event and patron activity.
//   node tools/ludus3d_balance.mjs [--careers 200] [--weeks 96] [--seed 1] [--hardcore] [--policy solid|lazy] [--json out.json]
// Runs entirely on core/*.js (no DOM). Deterministic for a given --seed.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus_3d/core/data.js');
const LM = require('../ludus_maximus_3d/core/sim.js');
require('../ludus_maximus_3d/core/ext.js');
require('../ludus_maximus_3d/core/arena.js');

const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const N = +opt('careers', 200), WEEKS = +opt('weeks', 96), SEED = +opt('seed', 1), HARD = a.includes('--hardcore'), POLICY = opt('policy', 'solid'), JSON_OUT = opt('json', '');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const PRIO = ['palaestra', 'barracks', 'infirmary', 'market', 'kitchen', 'bath', 'sparring', 'stands', 'forge', 'scout', 'shrine', 'hall'];

let CUR = null; const cw0 = LM.closeWound; LM.closeWound = (S2, g2, wd, o2) => { const r = cw0(S2, g2, wd, o2); if (CUR) { CUR.closed = (CUR.closed || 0) + 1; if (r.scar) CUR.newScars = (CUR.newScars || 0) + 1; } return r; };
const sw0 = LM.sponsorWeek; LM.sponsorWeek = (S2, rep) => { const g = S2.gold, f = S2.fame; sw0(S2, rep); if (CUR) { CUR.src.spG += S2.gold - g; CUR.src.spF += S2.fame - f; } };
function career(seed) {
  LM.setRandom(LM.mulberry(seed * 7919 + 13));
  const S = LM.newGame({ name: 'B' + seed }); S.seed = 's' + seed; if (HARD) S.opts = { hardcore: true };
  const M = { src: { spG: 0, spF: 0, setG: 0, setF: 0, evG: 0, evF: 0, wkG: 0, wkF: 0, upk: 0 }, seed, gold: [], fame: [], league: [], fights: [0, 0, 0, 0], wins: [0, 0, 0, 0], inj: [0, 0, 0, 0], parts: {}, scars: 0, deaths: 0, losses: [0, 0, 0, 0], evs: 0, evGold: 0, prize: 0, spIncome: 0, spOk: 0, spFail: 0, spMeh: 0, spAcc: 0, bankrupt: 0, wkInj: 0, wkHurtMax: 0, glads: [], upkeepShort: 0, healTime: 0, healN: 0 };
  const tryHire = () => {
    LM.ensureShops(S);
    while (S.glads.length < LM.rosterCap(S) && S.recruits && S.recruits.length) {
      const c = S.recruits.slice().sort((x, y) => (LM.stars(y) * 80 + y.lvl * 30 - y.cost * 0.3) - (LM.stars(x) * 80 + x.lvl * 30 - x.cost * 0.3))[0];
      if (!c || S.gold < c.cost + (S.glads.length ? 120 : 40)) break; if (LM.hire(S, c)) break;
    }
  };
  const tryBuild = () => {
    for (const id of PRIO) {
      const i = LM.plotOf(S, id);
      if (i < 0) { const free = S.plots.findIndex((p, k) => !p && k < S.rows * LM.COLS); const c = LM.buildCost(id, 1); if (free >= 0 && S.fame >= D.BUILD[id].fame && S.gold >= c + 150) { if (!LM.build(S, free, id)) return; } continue; }
      const p = S.plots[i]; if (p.l >= 5 || p.l >= LM.levelCap(S)) continue; const c = LM.buildCost(id, p.l + 1);
      if (S.gold >= c + 150 && (id !== 'barracks' || S.glads.length >= LM.rosterCap(S) - 0)) { if (!LM.upgrade(S, i)) return; }
    }
    if (S.rows < 4 && S.fame >= LM.landFame(S) && S.gold >= LM.landCost(S) + 300) LM.buyLand(S);
  };
  const shop = () => {   // a real player turns spare gold into gear every week
    for (let k = 0; k < 3 && S.market; k++) {
      let best = null;
      S.glads.forEach((gl) => S.market.forEach((it) => { const up = LM.itemScore(it) - (gl.gear[it.slot] ? LM.itemScore(gl.gear[it.slot]) : 0), price = LM.buyVal(S, it); if (up > 0 && price < S.gold * 0.4 && S.gold - price > 60 && (!best || up / price > best.up / best.price)) best = { gl, it, up, price }; }));
      if (!best) break; if (LM.buyItem(S, best.it)) break; LM.equip(S, best.gl, best.it);
    }
  };
  const plan = () => {
    S.glads.forEach((g) => {
      if (g.inj > 0 || g.en < 45) { g.act = 'rest'; return; }
      if (S.gold < 60 && g.en > 55) { g.act = 'work'; return; }
      const B = D.STYLES[g.style].base; let best = 'str', bv = 1e9;
      D.STATS.forEach((s) => { const v = (g.st[s] / B[s]) / (0.8 + 0.1 * g.tal[s]); if (v < bv && g.st[s] < LM.cap(g)) { bv = v; best = s; } }); g.act = best;
    });
  };
  const fight = (gl, opps, ev) => {
    const ctxA = LM.teamCtx(S, gl, 'bal'), ctxB = LM.teamCtx(null, opps, LM.oppStance(S, opps[0]));
    const F = LM.quick(LM.mkUnits(gl, 'A', ctxA, gl.map(() => 1)), LM.mkUnits(opps, 'B', ctxB));
    const hpf = {}; F.units.filter((u) => u.side === 'A').forEach((u) => { hpf[u.g.id] = u.hp / u.maxhp; });
    return { win: F.winner === 'A', hype: Math.max(F.peak, F.hype), hpf, odds: 0.5, F };
  };
  const doSettle = (ev, gl, res) => {
    const g0 = S.gold, f0 = S.fame, rep = LM.settle(S, ev, gl, res); M.prize += S.gold - g0; M.src.setG += S.gold - g0; M.src.setF += S.fame - f0;
    const L = ev.league, K = ev.kind; M.fights[L]++; if (res.win || res.place === 1) M.wins[L]++; else M.losses[L]++; M.kind = M.kind || {}; const kk = (M.kind[K + L] = M.kind[K + L] || [0, 0, 0]); kk[0]++; if (res.win || res.place === 1) kk[1]++; kk[2] += (rep.inj || []).length;
    (rep.inj || []).forEach((i) => { M.inj[L]++; M.parts[i.part || 'gash'] = (M.parts[i.part || 'gash'] || 0) + 1; M.healN++; M.healTime += i.w; });
    if (HARD && !(res.win || res.place === 1)) gl.forEach((g) => { if (res.hpf[g.id] != null && res.hpf[g.id] <= 0.01 || true) { const r = LM.deathRoll(S, g, { kind: 'event' }); if (r.dies && S.glads.length > 1 && res.hpf[g.id] < 0.2) { LM.fall(S, g, { kind: 'event' }); M.deaths++; } } });
    return rep;
  };
  const runKey = (key) => {
    const ev = LM.eventByKey(S, key), en = S.entries[key]; if (!ev) return;
    const gl = en.ids.map((id) => S.glads.find((g) => g.id === id)).filter(Boolean);
    if (gl.length !== en.ids.length || gl.some((g) => g.inj > 0)) { LM.withdraw(S, key); return; }
    if (ev.kind === 'tourney' || ev.kind === 'grand') {
      const g = gl[0], T = LM.tourneyInit(S, ev, g); let champion = false, hpf = 1, hype = 0;
      for (;;) { const opp = LM.tourneyOpp(T), ctxA = LM.teamCtx(S, [g], 'bal'), ctxB = LM.teamCtx(null, [opp], LM.oppStance(S, opp));
        const F = LM.quick(LM.mkUnits([g], 'A', ctxA, [T.hpf]), LM.mkUnits([opp], 'B', ctxB)), win = F.winner === 'A'; hype = Math.max(hype, F.peak, F.hype); hpf = F.units[0].hp / F.units[0].maxhp;
        const r = LM.tourneyAdvance(S, T, win); if (win) { if (r.champion) { champion = true; break; } T.hpf = Math.min(1, hpf + 0.4); } else break; }
      doSettle(ev, [g], { win: champion, place: LM.placeOf(T, champion), hype, hpf: { [g.id]: hpf }, odds: 0.5 });
    } else { const res = fight(gl, ev.opps, ev); doSettle(ev, gl, res); }
  };
  const enterAll = () => {
    const free = () => S.glads.filter((g) => g.inj <= 0 && g.en >= 50 && !LM.busy(S, g, S.week)).sort((x, y) => y.lvl - x.lvl);
    for (let league = LM.maxLeague(S); league >= 0; league--) {
      const evs = LM.events(S, S.week, league), min = league === 0 ? 0 : D.LEAGUES[league].lvl - 1, able = () => free().filter((g) => g.lvl >= min);
      for (const ev of evs.filter((e) => e.kind === 'grand' || e.kind === 'tourney')) { const f = able(); if (f.length && S.gold >= ev.fee + 30 && f[0].lvl >= Math.max(...ev.opps.map((o) => o.lvl)) + (ev.kind === 'grand' ? 0 : -1)) LM.enter(S, ev, [f[0].id], 'bal'); }
      for (const ev of evs.filter((e) => e.kind === 'team')) { const f = able(), n = LM.teamSize(ev); if (f.length >= n && S.gold >= ev.fee + 30 && f.slice(0, n).reduce((x, g) => x + g.lvl, 0) / n >= ev.opps[0].lvl + 1) LM.enter(S, ev, f.slice(0, n).map((g) => g.id), 'bal'); }
      const duels = evs.filter((e) => e.kind === 'duel');
      for (const g of able()) {   // level-gap rule of thumb measured with LM.quick: easy at -2, even at +1, hard at +3
        const cand = duels.filter((e) => !S.entries[e.key] && S.gold >= e.fee && g.lvl - e.opps[0].lvl >= (e.diff === 0 ? -2 : e.diff === 1 ? 1 : 3)).sort((x, y) => y.diff - x.diff)[0];
        if (cand) LM.enter(S, cand, [g.id], 'bal');
      }
    }
  };
  const handleEvent = () => {
    if (!S.pendingEv) return; const E = LM.EVENTS[S.pendingEv]; if (!E) { S.pendingEv = null; return; }
    const v = LM.evView(S), ok = (v ? v.choices : E.c.map((c, i) => ({ i, cost: 0 }))).filter((c) => !c.short); const c = ok.length ? ok[Math.floor(LM.rand() * ok.length)] : { i: E.c.length - 1 };
    const g0 = S.gold, f0 = S.fame; LM.runEvent(S, c.i); M.evs++; M.evGold += S.gold - g0; M.src.evG += S.gold - g0; M.src.evF += S.fame - f0;
  };
  const sponsors = () => {
    const T = LM.sponsInit(S); T.offers.slice().forEach((o) => { if (!LM.sponsorWhy(S, o)) { const v = LM.rand() < 0.3 ? 'bold' : 'steady'; if (!LM.sponsorAccept(S, o.id, v)) M.spAcc++; } });
    while (T.beatQ.length) LM.beatResolve(S, 0);
  };
  const treat = () => {
    S.glads.forEach((g) => { LM.syncWounds(S, g); (g.wounds || []).slice().forEach((wd) => {
      if (wd.w >= 4 && S.gold > 400) LM.treatWound(S, g, wd, 'surg'); else if (wd.w >= 3 && S.gold > 220 && !LM.treatWhy(S, g, wd, 'doc')) LM.treatWound(S, g, wd, 'doc'); else if (wd.w >= 2 && !wd.rest) LM.setRest(S, g, wd, true); }); });
  };

  CUR = M;
  for (let w = 1; w <= WEEKS; w++) {
    tryHire(); tryBuild(); if (S.week % 4 === 1) LM.rerollMarket(S); shop(); S.glads.forEach((g) => LM.autoEquip(S, g)); if (POLICY !== 'lazy') treat();
    plan(); if (S.glads.length) enterAll();
    const g0 = S.gold;
    LM.weekTrain(S);
    for (const key of LM.dueKeys(S)) runKey(key);
    const before = S.gold, fbefore = S.fame, fin = LM.weekFinish(S); M.src.wkG += S.gold - before; M.src.wkF += S.fame - fbefore; M.src.upk += fin.upkeep || 0;
    if (fin.upkeep && S.gold < 5) M.upkeepShort++;
    const hurt = S.glads.filter((g) => g.inj > 0).length; M.wkInj += hurt; M.wkHurtMax = Math.max(M.wkHurtMax, hurt);
    sponsors(); handleEvent();
    if (w % 12 === 0) { M.gold.push(S.gold); M.fame.push(S.fame); M.league.push(LM.maxLeague(S)); }
    if (S.gold < 15 && S.glads.length === 0) M.bankrupt = 1;
    if (!S.glads.length) { // wiped out (hardcore): rehire the cheapest
      LM.ensureShops(S); const c = S.recruits.slice().sort((x, y) => x.cost - y.cost)[0]; if (c && S.gold >= c.cost) LM.hire(S, c);
    }
  }
  const T = LM.sponsInit(S); T.hist.forEach((h) => { if (h.res === 'ok') M.spOk++; else if (h.res === 'fail') M.spFail++; else if (h.res === 'meh') M.spMeh++; M.spIncome += h.earned || 0; });
  M.scars = S.glads.reduce((x, g) => x + (g.scars || []).length, 0); M.nGl = S.glads.length; M.lvl = S.glads.reduce((x, g) => Math.max(x, g.lvl), 0); M.fame_end = S.fame; M.gold_end = S.gold; M.fallen = (S.fallen || []).length;
  M.wounded = S.glads.filter((g) => (g.scars || []).length).length;
  return M;
}

const pct = (arr, p) => { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const t0 = Date.now(), R = [];
for (let i = 0; i < N; i++) R.push(career(SEED * 100000 + i));
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const seasons = Math.floor(WEEKS / 12);
console.log(`ludus3d balance: ${N} careers x ${WEEKS} weeks, policy ${POLICY}${HARD ? ', hardcore' : ''}, seed ${SEED} (${secs}s)`);
console.log('\nGOLD at end of season (p10 / median / p90)');
for (let s = 0; s < seasons; s++) { const v = R.map((r) => r.gold[s]).filter((x) => x != null); console.log(`  S${s + 1}: ${pct(v, 0.1)} / ${pct(v, 0.5)} / ${pct(v, 0.9)}`); }
console.log('\nFAME at end of season (p10 / median / p90) and league reached (median)');
for (let s = 0; s < seasons; s++) { const v = R.map((r) => r.fame[s]).filter((x) => x != null), l = R.map((r) => r.league[s]).filter((x) => x != null); console.log(`  S${s + 1}: ${pct(v, 0.1)} / ${pct(v, 0.5)} / ${pct(v, 0.9)}   league ${pct(l, 0.5)}  (share in L2+: ${Math.round((l.filter((x) => x >= 2).length / Math.max(1, l.length)) * 100)}%)`); }
console.log('\nBY LEAGUE: fights, win rate, injury per fight');
for (let L = 0; L < 4; L++) { const f = R.reduce((x, r) => x + r.fights[L], 0), w = R.reduce((x, r) => x + r.wins[L], 0), inj = R.reduce((x, r) => x + r.inj[L], 0); console.log(`  ${D.LEAGUES[L].n.padEnd(18)} fights ${String(f).padStart(7)}  win ${(f ? (100 * w) / f : 0).toFixed(1)}%  injured/fight ${(f ? (100 * inj) / f : 0).toFixed(1)}%`); }
console.log('\nBY EVENT KIND AND LEAGUE: entries, win (bracket: champion) rate, injuries per entry');
for (const K of ['duel', 'team', 'tourney', 'grand']) for (let L = 0; L < 4; L++) { const t = R.reduce((x, r) => { const k = (r.kind || {})[K + L]; return k ? [x[0] + k[0], x[1] + k[1], x[2] + k[2]] : x; }, [0, 0, 0]); if (t[0]) console.log(`  ${K.padEnd(8)} L${L}  ${String(t[0]).padStart(6)}  win ${(100 * t[1] / t[0]).toFixed(1)}%  injuries ${(100 * t[2] / t[0]).toFixed(1)}%`); }
const parts = {}; R.forEach((r) => { for (const k in r.parts) parts[k] = (parts[k] || 0) + r.parts[k]; }); const pt = Object.values(parts).reduce((x, y) => x + y, 0) || 1;
console.log('\nWOUND PARTS: ' + Object.keys(parts).sort((x, y) => parts[y] - parts[x]).map((k) => `${k} ${((100 * parts[k]) / pt).toFixed(0)}%`).join(', '));
const inj = R.reduce((x, r) => x + r.healN, 0), ht = R.reduce((x, r) => x + r.healTime, 0);
console.log(`Average wound length at injury: ${(ht / Math.max(1, inj)).toFixed(2)} weeks; injured fighter-weeks per career week: ${(R.reduce((x, r) => x + r.wkInj, 0) / (N * WEEKS)).toFixed(2)}; max fighters hurt at once (median): ${pct(R.map((r) => r.wkHurtMax), 0.5)}`);
console.log(`Wounds closed per career ${(R.reduce((x, r) => x + (r.closed || 0), 0) / N).toFixed(1)}, scars gained ${(R.reduce((x, r) => x + (r.newScars || 0), 0) / N).toFixed(2)} (${(100 * R.reduce((x, r) => x + (r.newScars || 0), 0) / Math.max(1, R.reduce((x, r) => x + (r.closed || 0), 0))).toFixed(1)}% of wounds)`);
console.log(`Scars per career at the end: mean ${(R.reduce((x, r) => x + r.scars, 0) / N).toFixed(2)}, fighters scarred ${(R.reduce((x, r) => x + r.wounded, 0) / Math.max(1, R.reduce((x, r) => x + r.nGl, 0)) * 100).toFixed(0)}% of roster`);
console.log(`Deaths per career (event losses${HARD ? ', Hardcore' : ', not a risk without Hardcore'}): ${(R.reduce((x, r) => x + r.deaths, 0) / N).toFixed(2)}; fallen on the wall: ${(R.reduce((x, r) => x + r.fallen, 0) / N).toFixed(2)}`);
console.log(`Prize income per career: ${Math.round(R.reduce((x, r) => x + r.prize, 0) / N)} gold; events: ${(R.reduce((x, r) => x + r.evs, 0) / N).toFixed(1)} per career, net gold ${Math.round(R.reduce((x, r) => x + r.evGold, 0) / N)}`);
const SRC = (k) => Math.round(R.reduce((x, r) => x + r.src[k], 0) / N);
console.log(`PER CAREER (${WEEKS} weeks)  gold: fights ${SRC('setG')}, week-end net ${SRC('wkG')} (of which patrons ${SRC('spG')}, upkeep -${SRC('upk')}), events ${SRC('evG')}   fame: fights ${SRC('setF')}, week-end ${SRC('wkF')} (patrons ${SRC('spF')}), events ${SRC('evF')}`);
console.log(`Patrons per career: accepted ${(R.reduce((x, r) => x + r.spAcc, 0) / N).toFixed(2)}, kept ${(R.reduce((x, r) => x + r.spOk, 0) / N).toFixed(2)}, lukewarm ${(R.reduce((x, r) => x + r.spMeh, 0) / N).toFixed(2)}, failed ${(R.reduce((x, r) => x + r.spFail, 0) / N).toFixed(2)}; stipends ${Math.round(R.reduce((x, r) => x + r.spIncome, 0) / N)} gold`);
console.log(`Careers that ended broke: ${R.reduce((x, r) => x + r.bankrupt, 0)}; weeks the upkeep could not be paid in full (mean): ${(R.reduce((x, r) => x + r.upkeepShort, 0) / N).toFixed(2)}`);
console.log(`End of career: fame median ${pct(R.map((r) => r.fame_end), 0.5)}, top level median ${pct(R.map((r) => r.lvl), 0.5)}, roster median ${pct(R.map((r) => r.nGl), 0.5)}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(R));
