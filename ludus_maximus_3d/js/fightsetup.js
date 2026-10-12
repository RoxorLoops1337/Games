// Builds a sim fight from the management layer (ports core of ludus_maximus/fight.js run()): team contexts, tricks, weather, mutators, augments, hazards, duo.
const D = () => globalThis.LM_D, L = () => globalThis.LM;
const mergeCtx = (c, extra) => { if (!extra) return; for (const k in extra.syn) c.syn[k] = (c.syn[k] || 0) + extra.syn[k]; c.xfx = c.xfx || {}; for (const k in extra.xfx) c.xfx[k] = (c.xfx[k] || 0) + extra.xfx[k]; };

/** gl: your glads, opps: opponent glads. o: {ev, stance, tricks, augs, foeAugs, hpf, weather, mutator} */
export function buildFight(S, gl, opps, stance, o = {}) {
  const lm = L(), d = D(), ev = o.ev || {};
  const stB = lm.oppStance(S, opps[0]), odds = lm.odds(S, gl, opps, stance, 30);
  const ctxA = lm.teamCtx(S, gl, stance), ctxB = lm.teamCtx(null, opps, stB);
  (o.tricks || []).forEach((id) => { const T = d.TRICKS.find((t) => t.id === id); if (T.foe) mergeCtx(ctxB, { syn: T.foe, xfx: {} }); if (T.me) mergeCtx(ctxA, { syn: T.me, xfx: {} }); });
  const wxId = o.weather || lm.weather(S, ev.key || 'x' + S.week), WX = d.WEATHER[wxId];
  if (WX.syn) { mergeCtx(ctxA, { syn: WX.syn, xfx: {} }); mergeCtx(ctxB, { syn: WX.syn, xfx: {} }); }
  if (o.mutator) { const mm = { syn: o.mutator.syn || {}, xfx: o.mutator.xfx || {} }; mergeCtx(ctxA, mm); mergeCtx(ctxB, mm); }
  if (o.augs && o.augs.length) mergeCtx(ctxA, lm.augCtx(o.augs));
  if (o.foeAugs && o.foeAugs.length) mergeCtx(ctxB, lm.augCtx(o.foeAugs));
  const unitsA = lm.mkUnits(gl, 'A', ctxA, gl.map((g) => (o.hpf && o.hpf[g.id] != null ? o.hpf[g.id] : 1)));
  const unitsB = lm.mkUnits(opps, 'B', ctxB);
  if (lm.isRevenge(S, ev)) unitsA.forEach((u) => { u.grudge = true; });
  const F = lm.createFight(unitsA, unitsB, { autoA: !!S.flags.auto, manualFavor: true, hazards: (ev.league || 0) >= 2 ? 2 : (ev.league || 0) >= 1 ? 1 : 0 });
  const fp = lm.facPerks(S); F.hypeK = fp.hype * (lm.fest(S, S.week) === 'bacchus' ? 1.3 : 1);
  const dp = unitsA.length > 1 ? lm.duoPair(S, gl) : null;
  if (dp) F.duo = { ids: ['A' + dp.a, 'A' + dp.b], kind: dp.kind, cd: 10, max: d.DUOS[dp.kind].cd };
  if (fp.roarDmg) unitsA.forEach((u) => { u.fx.roarDmg = fp.roarDmg; });
  if (fp.ultStart) unitsA.forEach((u) => u.ults.forEach((c) => { c.cd = Math.max(0, c.cd - fp.ultStart); }));
  F.meta = { weather: wxId, WX, odds, stB, league: ev.league || 0, season: S.season || 1, title: ev.title || '' };
  return F;
}

/** result object shaped like the 2D game's fight result: {win, hype, hpf, odds, F, stB} */
export function fightResult(F, gl) {
  const hpf = {}; F.units.filter((u) => u.side === 'A').forEach((u) => { hpf[u.g.id] = u.hp / u.maxhp; });
  return { win: F.winner === 'A', hype: Math.max(F.peak, F.hype), hpf, odds: F.meta.odds, F, stB: F.meta.stB };
}
