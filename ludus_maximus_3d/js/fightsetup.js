// Builds a sim fight from the management layer (ports core of ludus_maximus/fight.js run()): team contexts, tricks, weather, mutators, augments, hazards, duo.
const D = () => globalThis.LM_D, L = () => globalThis.LM;
const mergeCtx = (c, extra) => { if (!extra) return; for (const k in extra.syn) c.syn[k] = (c.syn[k] || 0) + extra.syn[k]; c.xfx = c.xfx || {}; for (const k in extra.xfx) c.xfx[k] = (c.xfx[k] || 0) + extra.xfx[k]; };

/** gl: your glads, opps: opponent glads. o: {ev, stance, tricks, augs, foeAugs, hpf, weather, mutator} */
export function buildFight(S, gl, opps, stance, o = {}) {
  const lm = L(), d = D(), ev = o.ev || {};
  const plan = stance && typeof stance === 'object' ? stance : null; // PLAN: a battle plan (roles, formation, priority, showmanship); a plain string is the old stance
  const { pa, pb } = lm.fightPlans(S, gl, opps, plan);
  const stB = plan && gl.length > 1 ? 'bal' : lm.oppStance(S, opps[0]), odds = lm.odds(S, gl, opps, pa || stance, 30);
  const ctxA = lm.teamCtx(S, gl, pa || stance), ctxB = lm.teamCtx(null, opps, stB); if (pb) ctxB.plan = lm.normPlan(pb, opps);
  (o.tricks || []).forEach((id) => { const T = d.TRICKS.find((t) => t.id === id); if (T.foe) mergeCtx(ctxB, { syn: T.foe, xfx: {} }); if (T.me) mergeCtx(ctxA, { syn: T.me, xfx: {} }); });
  const wxId = o.weather || lm.weather(S, ev.key || 'x' + S.week), WX = d.WEATHER[wxId];
  if (WX.syn) { mergeCtx(ctxA, { syn: WX.syn, xfx: {} }); mergeCtx(ctxB, { syn: WX.syn, xfx: {} }); }
  if (o.mutator) { const mm = { syn: o.mutator.syn || {}, xfx: o.mutator.xfx || {} }; mergeCtx(ctxA, mm); mergeCtx(ctxB, mm); }
  if (o.augs && o.augs.length) mergeCtx(ctxA, lm.augCtx(o.augs));
  if (o.foeAugs && o.foeAugs.length) mergeCtx(ctxB, lm.augCtx(o.foeAugs));
  const unitsA = lm.mkUnits(gl, 'A', ctxA, gl.map((g) => (o.hpf && o.hpf[g.id] != null ? o.hpf[g.id] : 1)));
  const unitsB = lm.mkUnits(opps, 'B', ctxB);
  if (lm.isRevenge(S, ev)) unitsA.forEach((u) => { u.grudge = true; });
  unitsB.forEach((u) => { if (u.g && lm.vendetta && lm.vendetta(S, u.g.rv)) u.grudge = true; });   // FATE: you killed one of his school: vendetta (+8% damage, see arena.js)
  const bout = (ev.bout && lm.BOUTS && lm.BOUTS[ev.bout] && ev.bout) || (o.bout && lm.BOUTS && lm.BOUTS[o.bout] && o.bout) || ''; // COMBAT: special bout rules (core/arena.js LM.BOUTS)
  const F = lm.createFight(unitsA, unitsB, { autoA: !!S.flags.auto, manualFavor: true, hazards: (ev.league || 0) >= 2 ? 2 : (ev.league || 0) >= 1 ? 1 : 0, deep: o.deep !== false, bout }); // COMBAT: deep = stamina, weapon classes, armour weight
  const fp = lm.facPerks(S); F.hypeK = fp.hype * (lm.fest(S, S.week) === 'bacchus' ? 1.3 : 1);
  const dp = unitsA.length > 1 ? lm.duoPair(S, gl) : null;
  lm.planFight(F, pa, pb);
  if (dp) F.duo = { ids: ['A' + dp.a, 'A' + dp.b], kind: dp.kind, cd: 10, max: d.DUOS[dp.kind].cd };
  if (fp.roarDmg) unitsA.forEach((u) => { u.fx.roarDmg = fp.roarDmg; });
  if (fp.ultStart) unitsA.forEach((u) => u.ults.forEach((c) => { c.cd = Math.max(0, c.cd - fp.ultStart); }));
  // deterministic replay: reseed right after building, snapshot, then record taps (see FightView.tap and Game.watchReplay)
  const seed = (Math.random() * 4294967296) >>> 0; lm.setRandom(lm.mulberry(seed));
  F.replay = { seed, taps: [], snap: null };
  F.meta = { weather: wxId, WX, odds, stB, league: ev.league || 0, season: S.season || 1, title: ev.title || '', kind: ev.kind || '', festival: lm.fest(S, ev.week || S.week) || '', theme: o.theme || ev.theme || '', plan: pa, planB: pb, show: pa ? pa.show : 0 }; // ARENA_THEME: kind + festival pick the arena look
  // COMBAT: arena hazards per theme (F.meta.hazards, drawn by js/env_arena.js) and the optional hands-on control of one fighter (a preference, default off)
  { const lg = ev.league || 0, th = ev.theme || o.theme || lm.themeFor(lg, ev.key || 'w' + S.week), noHaz = opps.some((g) => g.beast) || o.hazards === false;
    F.meta.hazTheme = th; F.meta.bout = bout; F.meta.boutLine = bout ? lm.BOUTS[bout].line : ''; if (!noHaz && lg >= 1) lm.setHazards(F, lm.hazardPlan(th, lg, ev.key || 'w' + S.week)); else F.meta.hazards = [];
    const dcp = o.dc !== undefined ? o.dc : globalThis.LM3D_DC; // { on, gid }: set by the plan sheet / settings (js/screens/plan.js, more.js)
    if (dcp && dcp.on && !opps.some((g) => g.beast && false)) { const i = Math.max(0, gl.findIndex((g) => g.id === dcp.gid)); if (lm.dcEnable(F, 'A' + i)) F.meta.dc = 'A' + i; } }
  F.replay.snap = structuredClone(F);
  return F;
}

/** result object shaped like the 2D game's fight result: {win, hype, hpf, odds, F, stB} */
export function fightResult(F, gl) {
  L().setRandom(null);
  const hpf = {}; F.units.filter((u) => u.side === 'A').forEach((u) => { hpf[u.g.id] = u.hp / u.maxhp; });
  const fate = F.replay && F.replay.fate ? F.replay.fate : null;   // FATE: the decision made at the end of the fight (kill / spare / ransom), undefined when it was not asked in the arena
  const hype = Math.max(F.peak, F.hype) + (fate && L().fateHype ? L().fateHype(fate.choice) : 0);   // the crowd reacts to the verdict (kill +15, mercy +6); settle caps hype at 100
  return { win: F.winner === 'A', hype, hpf, odds: F.meta.odds, F, stB: F.meta.stB, show: F.meta.show | 0, fate };
}
