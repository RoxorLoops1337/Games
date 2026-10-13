// Ludus Maximus: arena combat engine. Real-time 2D simulation: gladiators move, chase, strafe, swing,
// cast skills automatically and fire player-triggered ultimates. No DOM; the renderer reads unit state.
(function (G) {
  const D = G.LM_D, L = G.LM;
  const R = 8.6, R0 = R; // arena radius in meters
  const clamp = L.clamp; const rnd = () => L.rand();
  const alive = (F, side) => F.units.filter((u) => u.side === side && !u.down);
  // allocation-free variants for the per-step hot paths (think / beastThink / separate). The buffers are module scratch: think is never re-entered,
  // and nothing keeps `foes` past the call (every callee that needs it later builds its own array with alive / filter)
  const foesBuf = [], sepBuf = [];
  function aliveInto(F, side, out) { const us = F.units; let n = 0; for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.side === side && !u.down) out[n++] = u; } out.length = n; return out; }
  const other = (s) => (s === 'A' ? 'B' : 'A');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const emit = (F, e) => { if (!F.quiet) F.ev.push(e); };
  L.ARENA_R = R;
  const SHOWT = L.SHOW, PRIO = L.PRIO; // PLAN: Showmanship table (core/sim.js)
  const DK = 0.3; // global damage scale: keeps fights readable (~20s)

  // the unit's effect table: derive() returns a sparse object whose keys depend on the gear (31 hidden classes in 112 units); the unit gets ONE fixed shape with
  // every key the arena reads (0 = absent, identical for every `fx.k ?` / `fx.k || 0` test). roarDmg is filled by js/fightsetup.js.
  const mkFx = (f) => ({ vamp: f.vamp || 0, thunder: f.thunder || 0, thorns: f.thorns || 0, sprint: f.sprint || 0, shield: f.shield || 0, sear: f.sear || 0, roarDmg: f.roarDmg || 0, riposte: f.riposte || 0, revive: f.revive || 0, regen: f.regen || 0, ramp: f.ramp || 0, grow: f.grow || 0, giant: f.giant || 0, fury: f.fury || 0, frenzy: f.frenzy || 0, exec: f.exec || 0, bleed: f.bleed || 0, ultcd: f.ultcd || 0, stalwart: f.stalwart || 0, pen: f.pen || 0, lastbreath: f.lastbreath || 0, haste: f.haste || 0, critdmg: f.critdmg || 0 });
  // u.s (timed statuses): ONE shape for every unit. 0 = absent (a status is a number of seconds or an object with .t), never delete, never add a key that is not here.
  const ST_KEYS = ['stun', 'slow', 'blind', 'root', 'air', 'silence', 'bleed', 'pull', 'dash', 'guard', 'ccimm', 'inv', 'spin', 'frenzy', 'taunt', 'rage', 'press', 'hold', 'retreat', 'gstance', 'roar', 'rally', 'netted', 'expo', 'unb', 'sprint', 'phase', 'nimbus', 'lastB'];
  const ST_TIMED = ST_KEYS.filter((k) => k !== 'dash' && k !== 'pull'); // upkeep counts these down; dash / pull are driven by motion()
  const mkSt = () => ({ stun: 0, slow: 0, blind: 0, root: 0, air: 0, silence: 0, bleed: 0, pull: 0, dash: 0, guard: 0, ccimm: 0, inv: 0, spin: 0, frenzy: 0, taunt: 0, rage: 0, press: 0, hold: 0, retreat: 0, gstance: 0, roar: 0, rally: 0, netted: 0, expo: 0, unb: 0, sprint: 0, phase: 0, nimbus: 0, lastB: 0 });
  // THE unit shape. Every unit (gladiator or beast) is made from this one literal, so there is exactly one hidden class; the optional fields (beast block, command / AI
  // flags, stance timers) are declared here with a placeholder and only ever ASSIGNED later. Never add or delete a unit field anywhere else: it makes the hot functions
  // deopt on 'wrong map'. Keep the order stable (structuredClone snapshots and the replay rely on nothing but the values, the shape is for the JIT).
  function blankUnit() {
    return {
      id: '', side: 'A', i: 0, g: null, name: '', style: '', tr: null,
      x: 0, y: 0, z: 0, face: 1, mvx: 0, mvy: 0, kx: 0, ky: 0, spdNow: 0,
      maxhp: 0, hp: 0, shield: 0, atk: 0, def: 0, ms: 0, aps: 0, range: 0, crit: 0, eva: 0, fx: null, wil: 0, rk: null, rm: null,
      atkT: 0, wind: 0, wt: null, cast: 0, tgt: null, strafeT: 0, strafeDir: 1, skills: null, ults: null,
      s: null, stk: null, hits: null, down: false, gritUsed: false, stal: false, revived: false, lbUsed: false,
      dmg: 0, taken: 0, crits: 0, grudge: false, bacc: 0, racc: 0, srT: 0.5, noDmgT: 9, graspReady: true, graspT: 0, elecAt: 0, phaseAt: 0, thCnt: 0, fs: null, airT: 1,
      frT: 0, ltT: 0, cqT: 0, swap: null, cmdCd: 0, cmdId: null, aiFell: 0, aiPressed: 0, aiHeld: 0,
      role: '', show: 0, flT: 0, // PLAN: battle-plan role ('' = none) and Showmanship level 0..3 (declared here, only ever assigned), next flourish time
      beast: null, bx: null, ai: null, sz: 0, boss: false, enraged: false, wa: null, bs: null,
    };
  }
  function mkUnitG(g, side, i, n, ctx, hpFrac, grudge) {
    const d = L.derive(g, ctx); const fx = mkFx(d.fx); const maxhp = Math.round(d.hp);
    const u = blankUnit();
    u.id = side + i; u.side = side; u.i = i; u.g = g; u.name = g.name; u.style = g.style; u.tr = D.TRAITS[g.trait] || {};
    u.x = side === 'A' ? -6.4 : 6.4; u.y = (i - (n - 1) / 2) * (n > 2 ? 4.3 : 3.6); u.face = side === 'A' ? 1 : -1;
    u.maxhp = maxhp; u.hp = Math.max(1, Math.round(maxhp * (hpFrac == null ? 1 : hpFrac))); u.shield = fx.shield ? maxhp * 0.08 * fx.shield : 0;
    u.atk = d.atk; u.def = d.def; u.ms = 2.7 + d.spd * 0.026; u.aps = 0.5 + d.spd * 0.0095; u.range = D.RANGE[g.style];
    u.crit = d.crit; u.eva = d.eva; u.fx = fx; u.wil = g.st.wil; u.rk = g.rune ? g.rune.k : null; u.rm = new Set(g.rune ? g.rune.m : []);
    // the random draws keep their original order: atkT, one per skill, one per ult
    u.atkT = 0.3 + rnd() * 0.5;
    u.skills = (g.techs || []).map((id) => ({ id, cd: 2 + rnd() * 4 }));
    u.ults = L.ultsOf(g).map((id) => ({ id, cd: 5 + rnd() * 2, max: D.ULTS[id].cd }));
    u.s = mkSt(); u.stk = { fr: 0, lt: 0, cq: 0, gr: 0 }; u.hits = []; u.grudge = !!grudge;
    if (ctx && ctx.plan && !g.beast) applyPlan(u, g, side, i, n, ctx.plan);
    return u;
  }
  // PLAN: roles and formations move the start position and trade a little stat for a job; Showmanship trades damage and armor for fame. No random draws.
  function applyPlan(u, g, side, i, n, pl) {
    if (n > 1) {
      const F0 = L.FORMS[pl.form] || L.FORMS.line, pre = F0.roles(n), rid = (pl.roles && L.ROLES[pl.roles[g.id]] && pl.roles[g.id]) || pre[i] || 'free', R = L.ROLES[rid], m = R.mods;
      let p = F0.pos(i, n), x = p.x + R.dx, y = p.y * R.ky; const r = Math.hypot(x, y); if (r > R0 * 0.97) { x *= R0 * 0.97 / r; y *= R0 * 0.97 / r; }
      u.x = side === 'A' ? x : -x; u.y = y; u.role = rid === 'free' ? '' : rid;
      if (F0.mods && (F0.mods.atk || F0.mods.def)) { u.atk *= 1 + (F0.mods.atk || 0); u.def *= 1 + (F0.mods.def || 0); } // the formation's own team-wide trade (the Line's discipline)
      if (m.hp) { const f = 1 + m.hp, mx = Math.max(1, Math.round(u.maxhp * f)); u.hp = Math.max(1, Math.round(u.hp * mx / u.maxhp)); u.maxhp = mx; }
      if (m.atk) u.atk *= 1 + m.atk; if (m.def) u.def *= 1 + m.def; if (m.ms) u.ms *= 1 + m.ms; if (m.eva) u.eva = clamp(u.eva + m.eva, 0, 0.4); if (m.crit) u.crit = clamp(u.crit + m.crit, 0, 0.8);
    } else if (pl.show > 0) {
      const sh = L.SHOW[Math.min(3, pl.show | 0)]; u.show = Math.min(3, pl.show | 0); u.atk *= 1 - sh.atk; u.def *= 1 - sh.def; u.flT = 2.5 + 0.8 * i;
    }
  }
  // BEAST (Venatio): a beast record (core/ext.js LM.makeBeast) becomes an ordinary unit with its own range, speed, size and AI state (beastThink below)
  function mkUnit(g, side, i, n, ctx, hpFrac, grudge) {
    const u = mkUnitG(g, side, i, n, ctx, hpFrac, grudge); if (!g.beast) return u;
    const B = D.BEASTS[g.beast], d = L.derive(g, ctx);
    u.beast = g.beast; u.bx = B; u.ai = B.ai; u.range = B.range; u.ms = (2.7 + d.spd * 0.026) * B.ms; u.aps = (0.5 + d.spd * 0.0095) * B.aps; u.sz = B.sz; u.boss = !!B.boss; u.enraged = false;
    if (g.pw && g.pw !== 1) { u.maxhp = Math.round(u.maxhp * g.pw); u.hp = Math.max(1, Math.round(u.hp * g.pw)); u.atk *= Math.sqrt(g.pw); } // hunt tuning (D.HUNTS pw)
    u.skills = []; u.ults = []; u.atkT = 0.6 + rnd() * 0.8;
    u.bs = { pounce: 0.4 + rnd() * 0.6, charge: 0.4 + rnd() * 0.8, back: 0, stomp: 4 + rnd(), roar: 0, jab: 3 + rnd() * 2, t: rnd() * 2, mode: 'circle', combo: 0, howl: false, dir: rnd() < 0.5 ? 1 : -1, n: 0 };
    return u;
  }
  L.mkUnits = (glads, side, ctx, hpFracs, grudge) => glads.map((g, i) => mkUnit(g, side, i, glads.length, ctx, hpFracs && hpFracs[i], grudge));
  L.createFight = (A, B, o) => {
    o = o || {};
    return { t: 0, A, B, units: A.concat(B), ev: [], hype: 0, peak: 0, done: false, winner: null, auto: { A: !!o.autoA, B: true }, foc: { A: null, B: null }, quiet: !!o.quiet, sched: [], dtmax: 0.1, duo: o.duo ? { ids: o.duo.ids, kind: o.duo.kind, cd: 10, max: D.DUOS[o.duo.kind].cd } : null, manualFavor: !!o.manualFavor, favorReady: false, hazards: o.hazards || 0, hazT: 7 + rnd() * 3, zones: [], cmd: { rally: 6, swap: 0 }, cmdAI: !!o.cmdAI,
      // declared up front so the fight keeps one hidden class (js/fightsetup.js fills hypeK / meta / replay, L.step counts n)
      n: 0, hypeK: 0, meta: null, replay: null,
      pri: { A: false, B: false } }; // PLAN: a side whose focus came from its battle plan: when that target falls the side picks the weakest left
  };

  // ---------- derived live stats ----------
  const hasteK = (u) => 1 + 0.06 * (u.fx.haste || 0) + (u.rm.has('cosmic') ? 0.08 : 0);
  const ultK = (u) => hasteK(u) + 0.1 * (u.fx.ultcd || 0);
  function apsOf(u) {
    let m = 1 + (u.stk.fr || 0) * 0.03 * (u.fx.frenzy || 0); const s = u.s;
    if (u.rk === 'lethal') m += (u.stk.lt || 0) * 0.06;
    if (u.rm.has('celerity')) m += 0.04;
    if (s.rage) m += 0.6; if (s.rally) m += s.rally.spd; if (s.lastB) m += 0.4; if (s.phase) m += 0.4; if (s.roar) m += 0.15;
    if (s.slow) m *= s.slow.f;
    if (s.gstance) m *= 0.5; // TACTICS: a guarding fighter does not swing
    if (u.enraged) m += u.bx.enrage.aps; // BEAST
    return u.aps * m;
  }
  function msOf(u) {
    let m = 1; const s = u.s;
    if (u.rm.has('celerity')) m += 0.04; if (u.rk === 'lethal' && (u.stk.lt || 0) >= 6) m += 0.12;
    if (s.sprint) m += 0.12 * s.sprint.v; if (s.phase) m += 0.35; if (s.nimbus) m += 0.25; if (s.unb) m += 0.2; if (s.spin) m += 0.3; if (s.rage) m += 0.1;
    if (s.slow) m *= 0.4 + 0.6 * s.slow.f;
    if (s.press) m += 0.12; if (s.retreat) m += 0.3; if (s.gstance) m *= 0.4; // TACTICS
    if (u.enraged) m += u.bx.enrage.ms; // BEAST
    return u.ms * m;
  }
  L.apsOf = apsOf; L.msOf = msOf;
  L.windOf = (u) => Math.min(0.22, 0.4 / apsOf(u)) * (u.show ? SHOWT[u.show].wd : 1); // PLAN: a showman winds up longer (the view uses the same number)

  // ---------- damage ----------
  function dmgMul(F, u, t, o) {
    let m = 1; const av = L.adv(u.style, t.style); m *= av > 0 ? 1.1 : av < 0 ? 0.92 : 1;
    if (av < 0 && u.tr.underdog) m *= 1 + u.tr.underdog;
    if (u.grudge && u.tr.grudge) m *= 1 + u.tr.grudge;
    else if (u.grudge && u.side === 'B') m *= 1.08;   // FATE: a vendetta (you killed one of his school) makes the foe hit harder; player revenge stays trait-only
    if (u.s.frenzy) m *= 1 + u.s.frenzy.atk;
    if (u.fx.fury) m *= 1 + u.fx.fury * 0.1 * (1 - u.hp / u.maxhp);
    if (u.rm.has('laststand')) m *= 1 + 0.12 * (1 - u.hp / u.maxhp);
    const tp = t.hp / t.maxhp;
    if (u.fx.exec && tp < 0.35) m *= 1 + u.fx.exec * 0.08;
    if (u.rm.has('coup') && tp < 0.4) m *= 1.08;
    if (u.fx.giant && t.maxhp > u.maxhp) m *= 1 + 0.1 * u.fx.giant;
    if (u.rk === 'conq') m *= 1 + 0.025 * (u.stk.cq || 0);
    if (u.stk.gr) m *= 1 + 0.006 * (u.fx.grow || 0) * u.stk.gr;
    if (u.fx.ramp) m *= 1 + 0.03 * u.fx.ramp * Math.min(5, Math.floor(F.t / 5));
    if (u.rm.has('gather')) m *= 1 + 0.01 * Math.min(6, Math.floor(F.t / 5));
    if (u.s.roar && u.fx.roarDmg) m *= 1 + u.fx.roarDmg;
    if (u.enraged) m *= 1 + u.bx.enrage.atk; // BEAST
    if (u.s.press) m *= 1.12; // TACTICS: Press
    if (F.t > 40) m *= 1 + (F.t - 40) * 0.03;
    if (o.exec && tp < o.exec.th) m *= o.exec.m / (o.mult || 1);
    return m;
  }
  function damage(F, t, amt, src) {
    t.hp -= amt; t.taken += amt;
    if (t.hp <= 0 && !t.down) {
      if (t.fx.revive && !t.revived) { t.revived = true; t.hp = Math.round(t.maxhp * 0.2 * Math.min(1, t.fx.revive)); t.s.inv = 0.6; emit(F, { k: 'revive', dst: t.id }); return; }
      t.hp = 0; t.down = true; t.s = mkSt(); emit(F, { k: 'down', dst: t.id, src: src && src.id }); F.hype += 10;
      if (F.pri && F.pri[other(t.side)] && F.foc[other(t.side)] === t.id) F.foc[other(t.side)] = refocus(F, t.side); // PLAN: the priority target fell
      if (!alive(F, t.side).length) finish(F, other(t.side));
    }
  }
  // the weakest fighter left on `side` (lowest hp, first on a tie), or null: where a battle plan's focus goes when its target falls
  function refocus(F, side) { const us = F.units; let b = null; for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.side === side && !u.down && (!b || u.hp < b.hp)) b = u; } return b ? b.id : null; }
  function finish(F, w) { if (F.done) return; F.done = true; F.winner = w; emit(F, { k: 'end', winner: w }); }
  function heal(F, u, amt) { amt = Math.min(u.maxhp - u.hp, Math.round(amt)); if (amt <= 0 || u.down) return; u.hp += amt; emit(F, { k: 'heal', dst: u.id, amt }); }
  function cc(F, t, key, val, dur) {
    if (t.down) return false;
    if (t.s.ccimm || t.s.spin || t.s.inv) { emit(F, { k: 'resist', dst: t.id }); return false; }
    if (key === 'stun' && rnd() < t.wil * 0.003) { emit(F, { k: 'resist', dst: t.id }); return false; }
    t.s[key] = val; if (key === 'stun' || key === 'air') { t.wind = 0; t.cast = 0; t.s.dash = 0; }
    if (key === 'air') t.airT = dur; emit(F, { k: 'status', dst: t.id, st: key, t: dur }); return true;
  }
  function strike(F, u, t, o) {
    o = o || {}; if (t.down || u.down) return 0;
    if (t.s.inv) { emit(F, { k: 'miss', src: u.id, dst: t.id, inv: 1 }); return 0; }
    const av = L.adv(u.style, t.style);
    let hc = 0.94 - t.eva - (u.s.blind ? 0.4 : 0) + (t.s.netted ? 0.12 : 0) - (t.s.retreat ? 0.2 : 0); if (o.sure) hc = 1; hc = clamp(hc, 0.3, 1);
    if (rnd() > hc) { emit(F, { k: 'miss', src: u.id, dst: t.id }); return 0; }
    const df = t.def * (1 + (t.s.frenzy ? t.s.frenzy.def : 0)) * (1 - (o.ignore || 0)) * (1 - Math.min(0.6, 0.08 * (u.fx.pen || 0)));
    let dmg = DK * u.atk * (o.mult || 1) * (0.85 + rnd() * 0.3) * (60 / (60 + Math.max(0, df))) * dmgMul(F, u, t, o);
    if (u.rk === 'first') { u.fs = u.fs || new Set(); if (!u.fs.has(t.id)) { u.fs.add(t.id); dmg *= 2.2; } dmg *= 1.05; }
    if (u.rk === 'grasp' && u.graspReady && o.basic) { dmg += t.maxhp * 0.02; u.graspReady = false; u.graspT = 5; heal(F, u, u.maxhp * 0.015); const g = Math.round(u.maxhp * 0.003); u.maxhp += g; u.hp += g; emit(F, { k: 'rune', src: u.id, id: 'grasp' }); }
    const crit = rnd() < clamp(u.crit + (o.critB || 0), 0, 0.8); if (crit) dmg *= 1.6 + 0.15 * (u.fx.critdmg || 0);
    if (t.s.guard) dmg *= 1 - t.s.guard.f;
    if (F.pri[other(t.side)] && F.foc[other(t.side)] === t.id) dmg *= PRIO.guard; // PLAN: a marked foe is expected: its side closes ranks around it
    if (t.s.press) dmg *= 1.1; if (t.s.expo) dmg *= 1.1; if (t.s.hold) dmg *= 0.85; // TACTICS: the price of Press / Rally, the reward of Hold
    if (t.rm.has('bone') && t.noDmgT >= 3) { dmg *= 0.75; t.noDmgT = 0; }
    dmg = Math.max(1, Math.round(dmg)); const shown = dmg;
    if (t.shield > 0) { const ab = Math.min(t.shield, dmg); t.shield -= ab; dmg -= ab; }
    let save = '';
    if (dmg >= t.hp) {
      if (t.fx.stalwart && !t.stal) { t.stal = true; dmg = t.hp - 1; save = 'STALWART'; }
      else if (!t.gritUsed && rnd() < t.wil * 0.004) { t.gritUsed = true; dmg = t.hp - 1; save = 'GRIT'; F.hype += 14; }
    }
    u.dmg += shown; if (crit) u.crits++; t.noDmgT = 0;
    emit(F, { k: 'hit', src: u.id, dst: t.id, dmg: shown, crit, adv: av, tech: o.tag, save, basic: !!o.basic });
    F.hype += (2 + (shown / t.maxhp) * 50 + (crit ? 5 : 0)) * (u.show ? SHOWT[u.show].hy : 1);
    if (dmg > 0) damage(F, t, dmg, u);
    if (!o.noProc) procs(F, u, t, shown, crit, o);
    return shown;
  }
  function zap(F, u, t, mult, tag) {
    emit(F, { k: 'zap', src: u.id, dst: t.id }); strike(F, u, t, { mult, sure: true, noProc: true, tag });
    const nx = alive(F, other(u.side)).filter((f) => f !== t).sort((a, b) => dist(a, t) - dist(b, t))[0];
    if (nx && dist(nx, t) < 5) { emit(F, { k: 'zap', src: t.id, dst: nx.id }); strike(F, u, nx, { mult: mult * 0.6, sure: true, noProc: true, tag }); }
  }
  function procs(F, u, t, dmg, crit, o) {
    const fx = u.fx;
    if (o.basic) {
      if (fx.frenzy) { u.stk.fr = Math.min(8, (u.stk.fr || 0) + 1); u.frT = 3.2; }
      if (u.rk === 'lethal') { u.stk.lt = Math.min(6, (u.stk.lt || 0) + 1); u.ltT = 4; }
      if (u.rk === 'conq') { u.stk.cq = Math.min(8, (u.stk.cq || 0) + 1); u.cqT = 5; }
      if (fx.grow) u.stk.gr = (u.stk.gr || 0) + 1;
      if (fx.sprint) u.s.sprint = { v: fx.sprint, t: 1.5 };
      const hs = u.hits; hs.push(F.t); let hn = 0; for (let i = 0; i < hs.length; i++) if (F.t - hs[i] <= 3) hs[hn++] = hs[i]; hs.length = hn; // keep the last 3 s, in place
      if (u.rk === 'electro' && u.hits.length >= 3 && F.t >= u.elecAt) { u.elecAt = F.t + 7; u.hits.length = 0; emit(F, { k: 'rune', src: u.id, id: 'electro' }); zap(F, u, t, 1.2, 'electro'); }
      if (u.rk === 'phase' && u.hits.length >= 3 && F.t >= u.phaseAt) { u.phaseAt = F.t + 4; u.hits.length = 0; u.s.phase = 3; emit(F, { k: 'rune', src: u.id, id: 'phase' }); }
      if (fx.thunder) { u.thCnt++; if (u.thCnt >= 3) { u.thCnt = 0; zap(F, u, t, 0.3 * fx.thunder, 'thunder'); } }
    }
    if (u.rk === 'conq' && (u.stk.cq || 0) >= 8) heal(F, u, dmg * 0.06);
    if (fx.vamp) heal(F, u, dmg * fx.vamp * 0.04);
    if (u.s.rage) heal(F, u, dmg * 0.15);
    if (!t.down && ((fx.bleed && rnd() < fx.bleed * 0.15) || (crit && u.tr.bleedcrit))) { t.s.bleed = { dps: u.atk * 0.1 * DK, t: 4 }; emit(F, { k: 'status', dst: t.id, st: 'bleed' }); }
    if (t.fx.thorns && !u.down) { const r = Math.round(dmg * t.fx.thorns * 0.05); if (r > 0) { emit(F, { k: 'thorn', src: t.id, dst: u.id, dmg: r }); damage(F, u, r, t); } }
    if (!o.noRip && !t.down && !u.down && t.fx.riposte && rnd() < t.fx.riposte * 0.08) strike(F, t, u, { mult: 0.7, noRip: true, noProc: true, tag: 'riposte' });
  }

  // ---------- skills (auto) ----------
  function startDash(F, u, tx, ty, fn) { u.s.dash = { tx, ty, t: 0.5, fn }; emit(F, { k: 'dash', src: u.id }); }
  const toward = (u, t, d) => { const dx = t.x - u.x, dy = t.y - u.y, l = Math.hypot(dx, dy) || 1; return [dx / l * d, dy / l * d]; };
  function castSkill(F, u, sk, t, foes) {
    const T = D.TECHS[sk.id]; sk.cd = T.cd; u.cast = 0.22; emit(F, { k: 'tech', src: u.id, tech: sk.id });
    F.hype += 5;
    if (T.tg === 'enemy') {
      if (sk.id === 'lunge') { const [ox, oy] = toward(u, t, Math.max(0, dist(u, t) - 1.1)); startDash(F, u, u.x + ox, u.y + oy, () => { strike(F, u, t, { mult: T.mult, ignore: T.ignore, sure: true, tag: sk.id }); }); return; }
      const n = T.hits || 1;
      for (let h = 0; h < n; h++) { if (h === 0) strike(F, u, t, { mult: T.mult, ignore: T.ignore, critB: T.crit, exec: T.exec, tag: sk.id }); else F.sched.push({ at: F.t + h * 0.14, fn: () => { if (!u.down && !t.down) strike(F, u, t, { mult: T.mult, critB: T.crit, tag: sk.id }); } }); }
      if (!t.down) {
        if (T.stun) cc(F, t, 'stun', T.stun, T.stun);
        if (T.slow) { cc(F, t, 'slow', { f: T.slow.f, t: T.slow.t }, T.slow.t); t.s.netted = T.netted; }
        if (T.blind) cc(F, t, 'blind', T.blind, T.blind);
      }
      if (sk.id === 'netthrow') emit(F, { k: 'proj', src: u.id, dst: t.id, c: '#f5ead2' });
    } else if (T.tg === 'enemies') {
      emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2.4, c: '#f5ead2' }); foes.filter((f) => dist(u, f) <= 2.5).forEach((f) => strike(F, u, f, { mult: T.mult, tag: sk.id }));
    } else if (T.tg === 'self') {
      if (T.heal) heal(F, u, u.maxhp * T.heal);
      if (T.guard) { u.s.guard = { f: T.guard.f, t: T.guard.t }; emit(F, { k: 'status', dst: u.id, st: 'guard' }); }
      if (T.taunt) { u.s.taunt = T.taunt; emit(F, { k: 'status', dst: u.id, st: 'taunt' }); }
      if (T.frenzy) { u.s.frenzy = { atk: T.frenzy.atk, def: T.frenzy.def, t: T.frenzy.t }; emit(F, { k: 'status', dst: u.id, st: 'frenzy' }); }
    } else if (T.tg === 'team') {
      alive(F, u.side).forEach((a) => { a.s.rally = { spd: T.rally.spd, t: T.rally.t }; emit(F, { k: 'status', dst: a.id, st: 'rally' }); });
    }
  }
  function skillOk(F, u, sk, t, foes, d) {
    const T = D.TECHS[sk.id]; const hpf = u.hp / u.maxhp; const allies = alive(F, u.side);
    if (T.tg === 'enemy') { const rg = sk.id === 'lunge' ? 5.5 : sk.id === 'netthrow' ? 6.5 : sk.id === 'dirtkick' ? 3 : u.range + 0.4; if (d > rg || (sk.id === 'lunge' && d < 2.2)) return false; }
    if (T.tg === 'enemies' && d > 2.4) return false;
    if (T.heal && hpf > 0.55) return false;
    if (T.guard && !T.taunt && hpf > 0.7) return false;
    if (T.taunt && allies.length < 2) return false;
    if (T.rally && allies.length < 2) return false;
    if (T.frenzy && (hpf < 0.35 || d > u.range + 1.5)) return false;
    if (T.exec && t.hp / t.maxhp > T.exec.th && rnd() < 0.7) return false;
    return true;
  }

  // ---------- ultimates (player or AI) ----------
  function castUlt(F, u, k, t) {
    const slot = u.ults[k]; const U = D.ULTS[slot.id]; slot.cd = U.cd; u.cast = 0.2; F.hype += 22;
    emit(F, { k: 'ult', src: u.id, id: slot.id, c: U.c }); if (u.rm.has('nimbus')) u.s.nimbus = 3;
    const foes = alive(F, other(u.side));
    switch (slot.id) {
      case 'pulverize':
        emit(F, { k: 'aoe', x: u.x, y: u.y, r: 3.6, c: U.c, big: 1 });
        foes.filter((f) => dist(u, f) <= 3.6).forEach((f) => { strike(F, u, f, { mult: 1, sure: true, noProc: true, tag: 'pulverize' }); cc(F, f, 'air', 1.1, 1.1); });
        u.s.guard = { f: 0.2, t: 3 }; break;
      case 'hookshot': {
        emit(F, { k: 'hook', src: u.id, dst: t.id }); strike(F, u, t, { mult: 0.9, sure: true, noProc: true, tag: 'hookshot' });
        if (!t.down) { const [ox, oy] = toward(t, u, 0); const dx = u.x - t.x, dy = u.y - t.y, l = Math.hypot(dx, dy) || 1; if (!t.s.ccimm && !t.s.spin) t.s.pull = { tx: u.x - dx / l * 1.3, ty: u.y - dy / l * 1.3, t: 0.6 }; cc(F, t, 'stun', 1.2, 1.2); void ox; void oy; }
        break;
      }
      case 'bladedance': {
        u.s.inv = 0.6; const [ox, oy] = toward(u, t, Math.max(0, dist(u, t) - 1.0));
        startDash(F, u, u.x + ox, u.y + oy, () => {
          emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2.4, c: U.c });
          strike(F, u, t, { mult: 1.5, sure: true, noProc: true, tag: 'bladedance' });
          alive(F, other(u.side)).filter((f) => f !== t && dist(u, f) <= 2.4).forEach((f) => strike(F, u, f, { mult: 0.8, sure: true, noProc: true, tag: 'bladedance' }));
        }); break;
      }
      case 'skewer': {
        emit(F, { k: 'proj', src: u.id, dst: t.id, c: U.c, long: 1 });
        const dx = t.x - u.x, dy = t.y - u.y, l = Math.hypot(dx, dy) || 1; const nx = dx / l, ny = dy / l;
        foes.forEach((f) => { const px = f.x - u.x, py = f.y - u.y; const proj = px * nx + py * ny; const off = Math.abs(px * ny - py * nx); if (proj > 0 && proj < 12 && off < 1.0) { strike(F, u, f, { mult: 1.8, sure: true, noProc: true, tag: 'skewer' }); cc(F, f, 'slow', { f: 0.6, t: 3 }, 3); } });
        break;
      }
      case 'tornado': u.s.spin = { t: 3, tick: 0 }; u.s.ccimm = 3; emit(F, { k: 'status', dst: u.id, st: 'spin' }); break;
      case 'unbreakable':
        for (const x of CLEAR_CC) u.s[x] = 0; u.z = 0;
        u.s.guard = { f: 0.7, t: 6 }; u.s.ccimm = 6; u.s.unb = 6; emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2, c: U.c }); break;
      case 'bloodrage': u.s.rage = 6; u.s.ccimm = 6; emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2, c: U.c }); break;
      case 'meteor': {
        const tx = t.x, ty = t.y; emit(F, { k: 'tele', x: tx, y: ty, r: 3.2, t: 1.2, c: U.c });
        F.sched.push({ at: F.t + 1.2, fn: () => {
          if (F.done) return; emit(F, { k: 'aoe', x: tx, y: ty, r: 3.2, c: U.c, big: 1, meteor: 1 });
          alive(F, other(u.side)).filter((f) => Math.hypot(f.x - tx, f.y - ty) <= 3.2).forEach((f) => { strike(F, u, f, { mult: 3, sure: true, noProc: true, tag: 'meteor' }); cc(F, f, 'stun', 1, 1); });
        } }); break;
      }
      case 'duststorm':
        emit(F, { k: 'aoe', x: u.x, y: u.y, r: 8, c: U.c, big: 1 });
        foes.forEach((f) => { cc(F, f, 'slow', { f: 0.45, t: 4 }, 4); cc(F, f, 'blind', 3, 3); }); break;
      default: break;
    }
  }
  function nearestFoe(F, u) { return alive(F, other(u.side)).sort((a, b) => dist(u, a) - dist(u, b))[0]; }
  // player trigger. returns true | 'range' | false
  L.useUlt = (F, uid, k, targetId) => {
    const u = F.units.find((x) => x.id === uid); if (!u || u.down || F.done) return false;
    const slot = u.ults[k]; if (!slot || slot.cd > 0) return false;
    const unb = slot.id === 'unbreakable';
    if (!unb && (u.s.stun || u.s.air || u.s.dash || u.s.pull)) return false;
    let t = targetId ? F.units.find((x) => x.id === targetId && !x.down) : null;
    if (!t && F.foc[u.side]) t = F.units.find((x) => x.id === F.foc[u.side] && !x.down);
    if (!t) t = nearestFoe(F, u); if (!t) return false;
    const U = D.ULTS[slot.id]; if (U.rng && dist(u, t) > U.rng) return 'range';
    castUlt(F, u, k, t); return true;
  };
  // TACTICS: in live fights the foe's big area ultimates are announced by a short ground telegraph (circle or line) so the player can read them and answer
  // with a stance or a stun of their own. The ultimate is paid for when the telegraph starts; a stun, knock-up or death during the wind-up cancels it.
  const TELE_ULT = { pulverize: { t: 0.5, r: 3.6 }, skewer: { t: 0.5, r: 1, line: 12 } };
  function aiCast(F, u, k, t) {
    const sl = u.ults[k], T = TELE_ULT[sl.id]; if (!(F.cmdAI && u.side === 'B' && T)) { castUlt(F, u, k, t); return; }
    const U = D.ULTS[sl.id], ang = Math.atan2(t.y - u.y, t.x - u.x), tid = t.id, len = Math.hypot(t.x - u.x, t.y - u.y);
    sl.cd = U.cd; u.cast = T.t + 0.03;
    emit(F, { k: 'tele', x: u.x, y: u.y, r: T.r, t: T.t, c: U.c, ult: sl.id, src: u.id, ang, len: T.line || 0 });
    F.sched.push({ at: F.t + T.t, fn: () => {
      if (F.done || u.down || u.s.stun || u.s.air) return; const tt = F.units.find((x) => x.id === tid && !x.down) || nearestFoe(F, u); if (!tt) return;
      castUlt(F, u, k, T.line ? { id: tt.id, x: u.x + Math.cos(ang) * Math.max(3, len), y: u.y + Math.sin(ang) * Math.max(3, len) } : tt);
    } });
  }
  function aiUlt(F, u, foes, t, d, dt) {
    if (rnd() > dt * 2.5) return;
    for (let k = 0; k < u.ults.length; k++) {
      const sl = u.ults[k]; if (sl.cd > 0) continue; const U = D.ULTS[sl.id]; const hpf = u.hp / u.maxhp; let ok = false;
      switch (sl.id) {
        case 'pulverize': ok = anyWithin(u, foes, 3.2); break;
        case 'hookshot': ok = d > 3.5 && d < 9.5; break;
        case 'bladedance': ok = d > 3 && d < 7.5; break;
        case 'skewer': ok = d > 3.5 && d < 10.5; break;
        case 'tornado': ok = anyWithin(u, foes, 2.2); break;
        case 'unbreakable': ok = hpf < 0.55 || !!(u.s.stun || u.s.air); break;
        case 'bloodrage': ok = d < 3 && hpf > 0.3; break;
        case 'meteor': ok = d < 11; break;
        case 'duststorm': ok = anyWithin(u, foes, 6) && hpf < 0.8; break;
        default: break;
      }
      if (ok && !(U.rng && d > U.rng)) { aiCast(F, u, k, t); return; }
    }
  }

  // ---------- per-step logic ----------
  function chooseTarget(F, u, foes) {
    const n = foes.length, rl = u.role; let i;
    for (i = 0; i < n; i++) if (foes[i].s.taunt) return foes[i];
    if (F.cmdAI && u.side === 'B') { for (i = 0; i < n; i++) { const f = foes[i]; if (f.s.press && !f.s.hold && dist(u, f) < 6.5) return f; } } // TACTICS: whoever presses forward draws the foe's eye
    if (u.swap) { const sid = u.swap.id; for (i = 0; i < n; i++) if (foes[i].id === sid) return foes[i]; }
    const fid = F.foc[u.side];
    if (fid) {
      for (i = 0; i < n; i++) if (foes[i].id === fid) {
        const f = foes[i];
        if (rl === 'hunter') { const d0 = dist(u, f); if (d0 > 3.5) for (let j = 0; j < n; j++) { const a = foes[j]; if (a !== f && a.tgt === u.id && dist(u, a) < 2.2) return a; } return f; } // PLAN: a Hunter drops the mark only for someone on top of them
        if (!rl || (rl === 'vanguard' ? dist(u, f) < 6.5 : rl === 'anchor' ? dist(u, f) < u.range + 3.2 : true)) return f; // PLAN: the front line and the anchors fight what is within reach
        break;
      }
    }
    if (u.tgt) { const tid = u.tgt; for (i = 0; i < n; i++) if (foes[i].id === tid) return foes[i]; }
    // lowest (distance x hp weight): same pick as the old stable sort()[0] (ties keep the first)
    let avg = 0; if (rl === 'flanker') { for (i = 0; i < n; i++) avg += foes[i].maxhp; avg /= n; }
    let best = null, bk = 0;
    for (i = 0; i < n; i++) {
      const f = foes[i]; let k = dist(u, f) * (0.6 + 0.8 * (f.hp / f.maxhp));
      if (f.role === 'vanguard') k *= 0.8; // PLAN: the Vanguard draws the foe
      if (rl === 'flanker') k *= (0.75 + 0.5 * f.maxhp / avg) * (f.range > 2.4 ? 0.85 : 1); // PLAN: the Flanker goes for the weak and the back line
      else if (rl === 'anchor' && f.tgt && f.tgt !== u.id && f.tgt.charCodeAt(0) === u.id.charCodeAt(0)) k *= 0.78; // PLAN: the Anchor covers an ally who is being hit
      if (!best || k < bk) { best = f; bk = k; }
    }
    return best;
  }
  const CLEAR_CC = ['stun', 'slow', 'blind', 'root', 'air', 'silence', 'bleed', 'pull'];
  function upkeep(F, u, dt) {
    const s = u.s;
    for (let i = 0; i < ST_TIMED.length; i++) {
      const key = ST_TIMED[i], v = s[key]; if (!v) continue;
      if (typeof v === 'number') { s[key] = v - dt; if (s[key] <= 0) s[key] = 0; } else { v.t -= dt; if (v.t <= 0) s[key] = 0; }
    }
    u.atkT -= dt; u.noDmgT += dt; if (u.cmdCd > 0) u.cmdCd -= dt; if (u.swap && (u.swap.t -= dt) <= 0) u.swap = null;
    const hk = hasteK(u) * dt, sks = u.skills; for (let i = 0; i < sks.length; i++) sks[i].cd = Math.max(0, sks[i].cd - hk); const uk = ultK(u) * dt, uls = u.ults; for (let i = 0; i < uls.length; i++) uls[i].cd = Math.max(0, uls[i].cd - uk);
    if (u.frT > 0 && (u.frT -= dt) <= 0) u.stk.fr = 0; if (u.ltT > 0 && (u.ltT -= dt) <= 0) u.stk.lt = 0; if (u.cqT > 0 && (u.cqT -= dt) <= 0) u.stk.cq = 0;
    if (u.graspT > 0 && (u.graspT -= dt) <= 0) u.graspReady = true;
    if (u.fx.regen) { u.racc += u.maxhp * 0.0025 * u.fx.regen * dt; if (u.racc >= 1) { const h = Math.floor(u.racc); u.racc -= h; heal(F, u, h); } }
    if (u.fx.lastbreath && !u.lbUsed && u.hp < u.maxhp * 0.3) { u.lbUsed = true; u.s.lastB = 5; heal(F, u, u.maxhp * 0.1); emit(F, { k: 'status', dst: u.id, st: 'rage' }); }
    if (s.bleed) { u.bacc += s.bleed.dps * dt; if (u.bacc >= 1) { const d = Math.floor(u.bacc); u.bacc -= d; emit(F, { k: 'bleed', dst: u.id, dmg: d }); damage(F, u, d, null); } }
    if (u.fx.sear) { u.srT -= dt; if (u.srT <= 0) { u.srT = 0.5; alive(F, other(u.side)).forEach((f) => { if (dist(u, f) < 2.4) { const d = Math.max(1, Math.round(DK * u.atk * 0.025 * u.fx.sear * (60 / (60 + f.def)))); emit(F, { k: 'bleed', dst: f.id, dmg: d, fire: 1 }); damage(F, f, d, u); } }); } }
    if (s.spin) { s.spin.tick -= dt; if (s.spin.tick <= 0) { s.spin.tick = 0.25; emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2, c: '#c2395f' }); alive(F, other(u.side)).forEach((f) => { if (dist(u, f) < 2.1) strike(F, u, f, { mult: 0.4, sure: true, noProc: true, tag: 'tornado' }); }); } }
  }
  function think(F, u, dt) {
    if (u.down) return; const s = u.s;
    if (s.stun || s.air || s.dash || s.pull) { u.mvx = u.mvy = 0; return; }
    if (u.cast > 0) { u.cast -= dt; u.mvx = u.mvy = 0; return; }
    if (u.wind > 0) { u.wind -= dt; u.mvx = u.mvy = 0; if (u.wind <= 0) resolveAttack(F, u); return; }
    if (F.zones.length) { let z = null; for (let i = 0; i < F.zones.length; i++) { const q = F.zones[i]; if (Math.hypot(u.x - q.x, u.y - q.y) < q.r + 0.6) { z = q; break; } } if (z) { const dx = u.x - z.x, dy = u.y - z.y, l = Math.hypot(dx, dy) || 1; u.mvx = dx / l; u.mvy = dy / l; return; } }
    if (u.beast) return beastThink(F, u, dt); // BEAST
    const foes = aliveInto(F, other(u.side), foesBuf); if (!foes.length) return;
    const t = chooseTarget(F, u, foes); u.tgt = t.id; const d = dist(u, t);
    if (Math.abs(t.x - u.x) > 0.15) u.face = t.x > u.x ? 1 : -1;
    if (F.auto[u.side]) aiUlt(F, u, foes, t, d, dt);
    if (u.cast > 0) return;
    if (u.show && F.t >= u.flT && d <= u.range + 3 && u.hp > u.maxhp * 0.35) { // PLAN: a flourish: the fighter stops and plays to the stands (the cost is the time), the crowd pays for it
      const sh = SHOWT[u.show]; u.flT = F.t + sh.gap; u.cast = sh.cast; u.mvx = u.mvy = 0; F.hype += 5 * u.show; emit(F, { k: 'flourish', src: u.id, lv: u.show }); return;
    }
    if (F.cmdAI && u.side === 'B') aiCmd(F, u, foes, t, d);
    if (s.retreat) { retreatMove(F, u, foes); return; } // TACTICS
    if (s.gstance) { u.mvx = u.mvy = 0; return; }
    if (rnd() < dt * 3 && !s.silence) { for (const sk of u.skills) { if (sk.cd <= 0 && skillOk(F, u, sk, t, foes, d)) { castSkill(F, u, sk, t, foes); return; } } }
    if (d <= u.range + 0.1) {
      u.strafeT -= dt; if (u.strafeT <= 0) { u.strafeT = 1 + rnd() * 1.5; u.strafeDir = rnd() < 0.5 ? -1 : 1; }
      const nx = (t.x - u.x) / (d || 1), ny = (t.y - u.y) / (d || 1);
      if (u.style === 'retiarius' && d < u.range * 0.62) { u.mvx = -nx * 0.9; u.mvy = -ny * 0.9; }
      else if (u.role === 'skirmisher' && d < u.range * 0.7 && u.atkT > 0.15 && Math.hypot(u.x, u.y) < R * 0.8) { u.mvx = -nx * 0.9 - ny * u.strafeDir * 0.25; u.mvy = -ny * 0.9 + nx * u.strafeDir * 0.25; } // PLAN: the Skirmisher gives ground while the blow recovers
      else { u.mvx = -ny * u.strafeDir * 0.3; u.mvy = nx * u.strafeDir * 0.3; }
      if (u.atkT <= 0 && !s.spin) { u.wt = t.id; u.wind = L.windOf(u); u.atkT = 1 / apsOf(u); emit(F, { k: 'atk', src: u.id, dst: t.id }); }
    } else if (s.hold) { u.mvx = u.mvy = 0; } else { const nx = (t.x - u.x) / d, ny = (t.y - u.y) / d; u.mvx = nx; u.mvy = ny; if (u.role) roleChase(F, u, t, d, nx, ny); }
  }
  // PLAN: how a role walks toward its target. Anchors stay near the team while someone else carries the fight, Flankers swing wide before they close.
  const AC = { x: 0, y: 0, free: 0 };
  function allyCenter(F, u) { const us = F.units; let n = 0, x = 0, y = 0, fr = 0; for (let i = 0; i < us.length; i++) { const a = us[i]; if (a === u || a.side !== u.side || a.down || a.beast) continue; n++; x += a.x; y += a.y; if (a.role !== 'anchor') fr++; } if (n) { AC.x = x / n; AC.y = y / n; } AC.free = fr; return n; }
  function roleChase(F, u, t, d, nx, ny) {
    if (u.role === 'anchor') {
      if (allyCenter(F, u) && AC.free > 0 && Math.hypot(t.x - AC.x, t.y - AC.y) > 6) { // the foe is far from the team and a partner is free to meet it: stay home
        const hx = AC.x - u.x, hy = AC.y - u.y, hd = Math.hypot(hx, hy); if (hd > 3) { u.mvx = hx / hd * 0.8; u.mvy = hy / hd * 0.8; } else { u.mvx = u.mvy = 0; }
      }
    } else if (u.role === 'flanker') {
      const k = d > 5 ? 0.55 : d > u.range + 1.5 ? 0.3 : 0; if (!k) return;
      const wy = Math.abs(u.y) > 0.8 ? (u.y > 0 ? 1 : -1) : ((u.i & 1) ? 1 : -1), dir = wy * (nx >= 0 ? 1 : -1), tx = -ny * dir * k, ty = nx * dir * k, l = Math.hypot(nx + tx, ny + ty) || 1;
      u.mvx = (nx + tx) / l; u.mvy = (ny + ty) / l;
    }
  }
  // ---------- BEAST AI (Venatio). No counters: every beast is a different tempo (pounce, pack flank, charge, trample, stomp) with its own stats and an enrage;
  // the player answers with stats, positioning and ultimates, never with a style rock-paper-scissors. Uses only rnd() (replay safe).
  const bAng = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const bGo = (u, tx, ty, k) => { const dx = tx - u.x, dy = ty - u.y, l = Math.hypot(dx, dy) || 1; u.mvx = dx / l * k; u.mvy = dy / l * k; };
  const bTan = (u, t, dir, k, close) => { const dx = t.x - u.x, dy = t.y - u.y, l = Math.hypot(dx, dy) || 1, nx = dx / l, ny = dy / l; u.mvx = -ny * dir * k + nx * close; u.mvy = nx * dir * k + ny * close; };
  function bAtk(F, u, t, kind, o) { // start an attack with its own windup; the damage lands in beastHit (called from resolveAttack)
    u.wt = t.id; u.wa = { kind, mult: o.mult !== undefined ? o.mult : 1, bleed: o.bleed !== undefined ? o.bleed : 0, cleave: o.cleave !== undefined ? o.cleave : 0, kb: o.kb !== undefined ? o.kb : 0, hits: o.hits !== undefined ? o.hits : 1 }; u.wind = o.wind || 0.22; u.atkT = (o.rec || 1) / apsOf(u);
    emit(F, { k: 'atk', src: u.id, dst: t.id, beast: kind, w: u.wind });
  }
  function beastHit(F, u, t) {
    const wa = u.wa; u.wa = null; const reach = u.range + 0.9;
    if (dist(u, t) > reach) { emit(F, { k: 'whiff', src: u.id }); return; }
    let mult = wa.mult;
    if (u.ai === 'pack') { const pk = F.units.filter((x) => x !== u && x.beast === u.beast && !x.down && x.side === u.side && dist(x, t) < 5).length; mult *= 1 + 0.1 * Math.min(3, pk); } // the pack bites harder together
    const hit = (f, m) => {
      const dmg = strike(F, u, f, { mult: m, basic: true, tag: wa.kind }); if (!dmg || f.down) return;
      if (wa.bleed && rnd() < wa.bleed) { f.s.bleed = { dps: u.atk * 0.1 * DK * (u.boss ? 1.4 : 1), t: 4 }; emit(F, { k: 'status', dst: f.id, st: 'bleed', t: 4 }); }
      if (wa.kb) { const a = bAng(u, f); f.kx += Math.cos(a) * wa.kb; f.ky += Math.sin(a) * wa.kb; }
    };
    hit(t, mult);
    if (wa.cleave) alive(F, other(u.side)).forEach((f) => { if (f !== t && dist(u, f) <= reach) hit(f, mult * wa.cleave); });
    for (let h = 1; h < wa.hits; h++) F.sched.push({ at: F.t + 0.2 * h, fn: () => { if (u.down || t.down || u.s.stun || dist(u, t) > reach + 0.4) return; emit(F, { k: 'atk', src: u.id, dst: t.id, beast: wa.kind === 'maul' ? 'claw' : wa.kind }); hit(t, mult * 0.8); } });
  }
  function bEnrage(F, u) { u.enraged = true; u.cast = 0.9; emit(F, { k: 'beast', a: 'enrage', src: u.id }); emit(F, { k: 'status', dst: u.id, st: 'rage', t: 6 }); F.hype += 12; }
  function bRoar(F, u, r, slow, dur, a) { // r = 0: a pure show-off roar
    u.cast = 0.85; emit(F, { k: 'beast', a: a || 'roar', src: u.id, r }); F.hype += 8;
    if (r > 0) F.sched.push({ at: F.t + 0.45, fn: () => { if (u.down) return; alive(F, other(u.side)).forEach((f) => { if (dist(u, f) <= r) cc(F, f, 'slow', { f: slow, t: dur }, dur); }); } });
  }
  // a straight run through everything in the way: telegraph, dash, each foe hit once, knocked up, then the beast is winded
  function bCharge(F, u, t, o) {
    u.cast = o.tele; emit(F, { k: 'beast', a: 'telegraph', src: u.id, x: t.x, y: t.y, r: o.r, ang: bAng(u, t) }); const gx = t.x, gy = t.y;
    F.sched.push({ at: F.t + o.tele, fn: () => {
      if (u.down || u.s.stun || F.done) return;
      const a = bAng(u, { x: gx, y: gy }), len = clamp(Math.hypot(gx - u.x, gy - u.y) + 3.5, 7, 15), seen = new Set();
      u.s.dash = { tx: u.x + Math.cos(a) * len, ty: u.y + Math.sin(a) * len, t: len / o.sp + 0.25, sp: o.sp,
        tick: () => { alive(F, other(u.side)).forEach((f) => { if (seen.has(f.id) || dist(u, f) > o.r) return; seen.add(f.id); const dmg = strike(F, u, f, { mult: o.mult, basic: true, tag: o.tag }); if (dmg && !f.down) { const k = bAng(u, f); f.kx += Math.cos(k) * o.kb; f.ky += Math.sin(k) * o.kb; cc(F, f, 'air', o.air, o.air); } }); },
        fn: () => { u.cast = o.rec; emit(F, { k: 'beast', a: 'winded', src: u.id }); } };
      emit(F, { k: 'dash', src: u.id }); emit(F, { k: 'beast', a: 'charge', src: u.id }); F.hype += 6;
    } });
  }
  function bPounce(F, u, t, o) {
    u.cast = 0.38; emit(F, { k: 'atk', src: u.id, dst: t.id, beast: 'pounce' });
    F.sched.push({ at: F.t + 0.38, fn: () => {
      if (u.down || u.s.stun || t.down || F.done) return; const a = bAng(t, u);
      u.s.dash = { tx: t.x + Math.cos(a) * 1.1, ty: t.y + Math.sin(a) * 1.1, t: 0.6, sp: 21, fn: () => {
        const dmg = strike(F, u, t, { mult: o.mult, basic: true, tag: 'pounce' }); u.atkT = 0.45; emit(F, { k: 'beast', a: 'land', src: u.id }); F.hype += 6;
        if (dmg && !t.down) { f_bleed(F, u, t, o.bleed); cc(F, t, 'slow', { f: 0.6, t: 1.3 }, 1.3); }
      } };
    } });
  }
  function f_bleed(F, u, f, ch) { if (ch && rnd() < ch) { f.s.bleed = { dps: u.atk * 0.1 * DK * (u.boss ? 1.4 : 1), t: 4 }; emit(F, { k: 'status', dst: f.id, st: 'bleed', t: 4 }); } }
  function beastThink(F, u, dt) {
    const foes = aliveInto(F, other(u.side), foesBuf); if (!foes.length) { u.mvx = u.mvy = 0; return; }
    const t = chooseTarget(F, u, foes); u.tgt = t.id; const d = dist(u, t), b = u.bs, B = u.bx, ai = u.ai, swing = u.atkT <= 0;
    if (Math.abs(t.x - u.x) > 0.15) u.face = t.x > u.x ? 1 : -1;
    b.pounce -= dt; b.charge -= dt; b.stomp -= dt; b.jab -= dt; b.t -= dt;
    if (!u.enraged && B.enrage && u.hp < u.maxhp * B.enrage.at) { bEnrage(F, u); return; }
    if (!b.howl) { b.howl = true; if (u.i === 0 && (B.boss || ai === 'pack' || ai === 'pounce')) { bRoar(F, u, 0, 1, 0, ai === 'pack' ? 'howl' : 'roar'); return; } }
    const inR = d <= u.range + 0.1;
    if (ai === 'pack') {
      const mates = F.units.filter((x) => x.beast === u.beast && x.side === u.side && !x.down), idx = Math.max(0, mates.indexOf(u)), n = mates.length;
      if (b.mode === 'circle') {
        const rushing = mates.some((x) => x !== u && x.bs.mode === 'rush');
        if (b.t <= 0 || (rushing && b.t < 1.5) || t.hp < t.maxhp * 0.3 || t.s.stun) { b.mode = 'rush'; b.t = 3.5; }
        else { const a = idx / n * 6.2832 + F.t * 0.42 * b.dir, R0 = 3.5; bGo(u, t.x + Math.cos(a) * R0, t.y + Math.sin(a) * R0, d > R0 + 1.5 ? 1 : 0.85); return; }
      }
      if (b.mode === 'fade') { if (b.t <= 0) { b.mode = 'circle'; b.t = 1.5 + rnd() * 1.8; } else { bGo(u, u.x * 2 - t.x, u.y * 2 - t.y, 1.1); return; } }
      if (b.mode === 'rush') {
        if (inR) { if (swing) { bAtk(F, u, t, 'bite', { mult: 1, bleed: 0.3, wind: 0.18, rec: 0.9 }); b.mode = 'fade'; b.t = 0.7 + rnd() * 0.4; } else { u.mvx = u.mvy = 0; } }
        else if (b.t <= 0) { b.mode = 'circle'; b.t = 1.2 + rnd() * 1.2; } else bGo(u, t.x, t.y, 1.1);
        return;
      }
    } else if (ai === 'pounce') {
      if (b.pounce <= 0 && d <= 2.0 && b.back < 0.6 && !t.s.air) { b.back += dt; bGo(u, u.x * 2 - t.x, u.y * 2 - t.y, 1.2); return; } // spring clear of a clinch to leap again
      if (b.pounce <= 0 && d > 1.9 && d < 8.5 && !t.s.air) { bPounce(F, u, t, { mult: B.boss ? 1.5 : 1.7, bleed: 0.55 }); b.pounce = (u.enraged ? 4.5 : 7) + rnd() * 2; b.back = 0; return; }
      if (B.boss && b.roar === 0 && u.hp < u.maxhp * 0.75) { b.roar = 1; bRoar(F, u, 5, 0.75, 3, 'roar'); return; }
      if (inR) {
        bTan(u, t, b.dir, 0.25, 0);
        if (swing) { b.n++; if (B.boss && b.n % 4 === 0) bAtk(F, u, t, 'maul', { mult: 0.62, hits: 3, bleed: 0.3, wind: 0.22, rec: 1.3 }); else if (b.n % 3 === 0) bAtk(F, u, t, 'bite', { mult: 1.15, bleed: 0.4, wind: 0.24, rec: 1.1 }); else bAtk(F, u, t, 'claw', { mult: 0.78, bleed: 0.12, wind: 0.14, rec: 0.75 }); }
      } else if (b.pounce > 1 && d < 7 && !B.boss) bTan(u, t, b.dir, 0.95, d > 5 ? 0.5 : -0.05); // stalk: circle at a distance until the leap is ready
      else bGo(u, t.x, t.y, 1);
    } else if (ai === 'bear') {
      if (!b.roar && u.hp < u.maxhp * 0.65) { b.roar = 1; bRoar(F, u, 4.2, 0.75, 3, 'roar'); return; }
      if (inR) { bTan(u, t, b.dir, 0.15, 0); if (swing) { b.n++; if (b.n % 3 === 0) bAtk(F, u, t, 'maul', { mult: 1.45, bleed: 0.35, wind: 0.42, rec: 1.3 }); else bAtk(F, u, t, 'swipe', { mult: 0.95, cleave: 0.6, kb: 3.2, wind: 0.3, rec: 1 }); } }
      else bGo(u, t.x, t.y, 0.95);
    } else if (ai === 'boar') {
      if (b.charge <= 0 && d > 2.6 && d < 10.5) { bCharge(F, u, t, { tele: 0.55, sp: 13.5, r: 1.2, mult: 1.3, kb: 5.5, air: 0.7, rec: 0.9, tag: 'charge' }); b.charge = (u.enraged ? 5.5 : 8.5) + rnd() * 2; return; }
      if (inR) { bTan(u, t, b.dir, 0.3, 0); if (swing) bAtk(F, u, t, 'gore', { mult: 1, bleed: 0.3, kb: 2, wind: 0.2, rec: 1 }); }
      else bGo(u, t.x, t.y, 1);
    } else if (ai === 'trample') { // war elephant: stomp, trample charge, trunk swat, and the handler's javelins from the howdah
      if (b.jab <= 0) { const far = foes.filter((f) => dist(u, f) > 2.6 && dist(u, f) < 9.5); if (far.length) { const f = far[(rnd() * far.length) | 0]; b.jab = 3.4 + rnd() * 1.4; emit(F, { k: 'beast', a: 'javelin', src: u.id, dst: f.id }); emit(F, { k: 'proj', src: u.id, dst: f.id, c: '#f5ead2' }); strike(F, u, f, { mult: 0.5, sure: true, noProc: true, tag: 'javelin' }); } else b.jab = 1; }
      if (b.stomp <= 0 && foes.some((f) => dist(u, f) < 3.2)) {
        b.stomp = (u.enraged ? 5 : 7.5) + rnd(); u.cast = 0.75; emit(F, { k: 'beast', a: 'stomp', src: u.id, x: u.x, y: u.y, r: 3.5 });
        F.sched.push({ at: F.t + 0.55, fn: () => { if (u.down || u.s.stun || F.done) return; emit(F, { k: 'aoe', x: u.x, y: u.y, r: 3.5, c: '#c9b79c', big: 1 }); F.hype += 8; alive(F, other(u.side)).forEach((f) => { if (dist(u, f) <= 3.5) { strike(F, u, f, { mult: 0.95, sure: true, noProc: true, tag: 'stomp' }); if (!f.down) cc(F, f, 'slow', { f: 0.55, t: 3 }, 3); } }); } });
        return;
      }
      if (b.charge <= 0 && d > 3.4 && d < 11) { bCharge(F, u, t, { tele: 0.85, sp: 12.5, r: 1.7, mult: 1.55, kb: 8, air: 0.9, rec: 1.2, tag: 'trample' }); b.charge = (u.enraged ? 6.5 : 10) + rnd() * 2; return; }
      if (inR) { bTan(u, t, b.dir, 0.12, 0); if (swing) bAtk(F, u, t, 'swat', { mult: 1.15, cleave: 0.6, kb: 5, wind: 0.4, rec: 1.2 }); }
      else bGo(u, t.x, t.y, 0.95);
    }
  }
  function resolveAttack(F, u) {
    const t = F.units.find((x) => x.id === u.wt); if (!t || t.down || u.s.stun) { u.wa = null; return; }
    if (u.wa) { beastHit(F, u, t); return; } // BEAST
    if (dist(u, t) <= u.range + 0.9) strike(F, u, t, { mult: 1, basic: true }); else emit(F, { k: 'whiff', src: u.id });
  }
  function motion(F, u, dt) {
    if (u.down) return; const s = u.s; const x0 = u.x, y0 = u.y;
    if (s.air) { const p = clamp(1 - s.air / u.airT, 0, 1); u.z = 3.2 * 4 * p * (1 - p); } else u.z = 0;
    if (s.dash) {
      const d = s.dash; d.t -= dt; const dx = d.tx - u.x, dy = d.ty - u.y, len = Math.hypot(dx, dy), step = (d.sp || 24) * dt; // BEAST: d.sp = own speed, d.tick = per-step hook (trample)
      if (len <= step || d.t <= 0) { u.x = d.tx; u.y = d.ty; const fn = d.fn; s.dash = 0; if (d.tick) d.tick(); if (fn) fn(); } else { u.x += (dx / len) * step; u.y += (dy / len) * step; if (d.tick) d.tick(); }
    } else if (s.pull) {
      const d = s.pull; d.t -= dt; const dx = d.tx - u.x, dy = d.ty - u.y, len = Math.hypot(dx, dy), step = 18 * dt;
      if (len <= step || d.t <= 0) { u.x = d.tx; u.y = d.ty; s.pull = 0; } else { u.x += (dx / len) * step; u.y += (dy / len) * step; }
    } else if (!s.stun && !s.air && !s.root && u.cast <= 0 && u.wind <= 0) {
      const sp = msOf(u); u.x += u.mvx * sp * dt; u.y += u.mvy * sp * dt;
    }
    if (u.kx || u.ky) { u.x += u.kx * dt; u.y += u.ky * dt; const f = Math.pow(0.02, dt); u.kx *= f; u.ky *= f; }
    const r = Math.hypot(u.x, u.y); if (r > R) { u.x *= R / r; u.y *= R / r; }
    u.spdNow = Math.hypot(u.x - x0, u.y - y0) / dt;
  }
  function separate(F) {
    const all = F.units, us = sepBuf; let m = 0; for (let i = 0; i < all.length; i++) { const u = all[i]; if (!u.down && !u.s.air) us[m++] = u; } us.length = m;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j]; let dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy); const min = 1.05 * 0.5 * ((a.sz || 1) + (b.sz || 1)); // BEAST: bigger bodies keep more room
      if (d < min) { if (d < 0.001) { dx = rnd() - 0.5; dy = rnd() - 0.5; d = Math.hypot(dx, dy) || 1; } const p = (min - d) / 2; const nx = dx / d, ny = dy / d; if (!a.s.dash) { a.x -= nx * p; a.y -= ny * p; } if (!b.s.dash) { b.x += nx * p; b.y += ny * p; } }
    }
  }
  const sideHp = (F, s) => { const us = F.units; let h = 0, m = 0; for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.side === s) { h += u.hp; m += u.maxhp; } } return h / m; };
  const aliveCount = (F, side) => { const us = F.units; let n = 0; for (let i = 0; i < us.length; i++) if (us[i].side === side && !us[i].down) n++; return n; };
  const anyWithin = (u, foes, r) => { for (let i = 0; i < foes.length; i++) if (dist(u, foes[i]) < r) return true; return false; };
  function roar(F, forced) {
    F.peak = Math.max(F.peak, F.hype); F.hype = 0;
    const side = forced || (sideHp(F, 'A') <= sideHp(F, 'B') ? 'A' : 'B'); const fav = !!forced;
    alive(F, side).forEach((u) => { u.s.roar = fav ? 6 : 4; u.ults.forEach((c) => { c.cd = Math.max(0, c.cd - (fav ? 5 : 4)); }); if (fav) heal(F, u, u.maxhp * 0.15); });
    emit(F, { k: 'roar', side, fav });
  }
  // the player's comeback button: only appears when the crowd backs your side (you are behind)
  L.useDuo = (F) => {
    const d = F.duo; if (!d || d.cd > 0 || F.done) return false; const us = d.ids.map((id) => F.units.find((u) => u.id === id)); if (us.some((u) => !u || u.down)) return false;
    const [u1, u2] = us; const foes = alive(F, 'B'); if (!foes.length) return false; const t = (F.foc.A && foes.find((f) => f.id === F.foc.A)) || foes.sort((p, q) => dist(u1, p) - dist(u1, q))[0];
    d.cd = d.max; F.hype += 25; emit(F, { k: 'ult', src: u1.id, id: 'duo:' + d.kind, c: D.DUOS[d.kind].c });
    if (d.kind === 'pincer') {
      [u1, u2].forEach((u, i) => { u.s.inv = 0.5; const ang = i ? 2.4 : -2.4; const tx = t.x + Math.cos(ang) * 1.2, ty = t.y + Math.sin(ang) * 1.2; startDash(F, u, tx, ty, () => { strike(F, u, t, { mult: 1.4, sure: true, noProc: true, tag: 'pincer' }); if (i === 1 && !t.down) cc(F, t, 'stun', 1, 1); emit(F, { k: 'aoe', x: t.x, y: t.y, r: 2, c: D.DUOS.pincer.c }); }); });
    } else if (d.kind === 'wall') {
      [u1, u2].forEach((u) => { u.s.guard = { f: 0.5, t: 5 }; u.s.ccimm = 5; emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2, c: D.DUOS.wall.c }); }); u1.s.taunt = 4;
    } else {
      [u1, u2].forEach((u) => { u.s.rage = 5; u.s.ccimm = 5; emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2.6, c: D.DUOS.storm.c }); alive(F, 'B').forEach((f) => { if (dist(u, f) < 3) strike(F, u, f, { mult: 0.6, sure: true, noProc: true, tag: 'twin storm' }); }); });
    }
    return true;
  };
  L.useFavor = (F) => { if (!F.favorReady || F.done) return false; F.favorReady = false; roar(F, 'A'); return true; };
  function hazard(F) {
    const ang = rnd() * 6.28, rr = Math.sqrt(rnd()) * R * 0.72; const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr; const big = F.hazards > 1; const r = big ? 2.7 : 2.1;
    F.zones.push({ x, y, r, at: F.t + 1.5 }); emit(F, { k: 'tele', x, y, r, t: 1.5, c: '#e8742a', haz: 1 });
    F.sched.push({ at: F.t + 1.5, fn: () => {
      F.zones = F.zones.filter((z) => z.at > F.t + 0.01 || z.x !== x); if (F.done) return; emit(F, { k: 'aoe', x, y, r, c: '#e8742a', big: 1, haz: 1 });
      F.units.filter((u) => !u.down && Math.hypot(u.x - x, u.y - y) <= r).forEach((u) => { if (u.s.inv) return; const dmg = Math.round(u.maxhp * (big ? 0.09 : 0.06)); emit(F, { k: 'hit', src: null, dst: u.id, dmg, crit: false, adv: 0, tech: 'hazard', hz: 1 }); damage(F, u, dmg, null); if (!u.down) cc(F, u, 'air', 0.8, 0.8); });
    } });
  }
  L.step = (F, dt) => {
    if (F.done) return; F.t += dt;
    if (F.sched.length) { const due = F.sched.filter((e) => F.t >= e.at); if (due.length) { F.sched = F.sched.filter((e) => F.t < e.at); due.forEach((e) => e.fn()); } }
    if (F.duo && F.duo.cd > 0) F.duo.cd -= dt;
    if (F.cmd) { if (F.cmd.rally > 0) F.cmd.rally -= dt; if (F.cmd.swap > 0) F.cmd.swap -= dt; }
    F.n = (F.n || 0) + 1; const us = F.units, nU = us.length, rv = F.n % 2 === 0; // even steps walk the units back to front (no reversed copy)
    for (let i = 0; i < nU; i++) { const u = us[rv ? nU - 1 - i : i]; if (!u.down) upkeep(F, u, dt); }
    if (F.done) return;
    for (let i = 0; i < nU; i++) think(F, us[rv ? nU - 1 - i : i], dt);
    for (let i = 0; i < nU; i++) motion(F, us[rv ? nU - 1 - i : i], dt);
    separate(F);
    if (F.hype >= 100 / (F.hypeK || 1) && !F.done) {
      const behind = sideHp(F, 'A') <= sideHp(F, 'B');
      if (F.manualFavor && behind) { if (!F.favorReady) { F.favorReady = true; F.hype = 100 / (F.hypeK || 1); emit(F, { k: 'favorready' }); } else F.hype = Math.min(F.hype, 100 / (F.hypeK || 1)); } else roar(F, F.manualFavor && !behind ? 'B' : null);
    }
    if (F.hazards && !F.done) { F.hazT -= dt; if (F.hazT <= 0) { F.hazT = 11 + rnd() * 5; hazard(F); } }
    F.peak = Math.max(F.peak, F.hype);
    if (!F.done && F.t > 95) { const hp = (s) => F.units.filter((u) => u.side === s).reduce((a, u) => a + u.hp / u.maxhp, 0); finish(F, hp('A') >= hp('B') ? 'A' : 'B'); }
  };

  // ---------- TACTICS: player commands (stances per fighter, team Rally, partner Swap). Every command is a tap keyed by F.n (replay safe), uses no rnd(),
  // and trades something for something: the data below is what the HUD shows (gain / cost) so nothing is hidden.
  L.CMD = {
    press:   { n: 'Press',     stance: 1, dur: 8, cd: 14, c: '#d2412b', gain: 'Hits +12%, speed +12%', cost: 'Takes +10% damage and the foe turns on you' },
    hold:    { n: 'Hold',      stance: 1, dur: 8, cd: 12, c: '#4a8fd0', gain: 'Takes 15% less damage', cost: 'Will not chase: ranged foes get free hits' },
    retreat: { n: 'Fall back', stance: 1, dur: 3, cd: 14, c: '#3f9a6a', gain: 'Speed +30%, +20% dodge', cost: 'Cannot attack while backing off' },
    guard:   { n: 'Guard',     stance: 1, dur: 4, cd: 12, c: '#9a6ad8', gain: 'Blocks 40% of damage', cost: 'Slow and swings at half speed' },
    swap:    { n: 'Swap',      team: 1,   dur: 6, cd: 8,  c: '#e0b04a', gain: 'Partners trade targets', cost: 'Both lose 0.7 s re-aiming' },
    rally:   { n: 'Rally',     team: 1,   dur: 6, cd: 28, c: '#2fb0a0', gain: 'Allies swing 25% faster', cost: 'Everyone takes +10% damage' },
  };
  L.CMD_ORDER = ['press', 'hold', 'retreat', 'guard', 'swap', 'rally'];
  const STANCE_KEYS = { press: 'press', hold: 'hold', retreat: 'retreat', guard: 'gstance' };
  function setStance(F, u, id) {
    const C = L.CMD[id]; for (const k in STANCE_KEYS) { u.s[STANCE_KEYS[k]] = 0; } if (u.s.guard && u.s.guard.stance) u.s.guard = 0;
    u.s[STANCE_KEYS[id]] = { t: C.dur }; u.cmdCd = C.cd; u.cmdId = id;
    if (id === 'guard') { u.s.guard = { f: 0.4, t: C.dur, stance: 1 }; emit(F, { k: 'status', dst: u.id, st: 'guard', t: C.dur }); }
    emit(F, { k: 'cmd', a: id, src: u.id, side: u.side, t: C.dur });
  }
  // kind 'stance' (a = unit id, b = press|hold|retreat|guard|none), 'swap', 'rally' (a = side, default A). Returns true | 'cd' | false.
  L.command = (F, kind, a, b) => {
    if (!F || F.done) return false; if (!F.cmd) F.cmd = { rally: 0, swap: 0 };
    if (kind === 'stance') {
      const u = F.units.find((x) => x.id === a); if (!u || u.down || u.beast) return false;
      if (b === 'none') { let had = false; for (const k in STANCE_KEYS) if (u.s[STANCE_KEYS[k]]) { u.s[STANCE_KEYS[k]] = 0; had = true; } if (u.s.guard && u.s.guard.stance) u.s.guard = 0; return had; }
      if (!L.CMD[b] || !L.CMD[b].stance) return false;
      if ((u.cmdCd || 0) > 0) return 'cd';
      setStance(F, u, b); return true;
    }
    const side = a === 'B' ? 'B' : 'A', al = alive(F, side).filter((u) => !u.beast);
    if (kind === 'rally') {
      if (F.cmd.rally > 0) return 'cd'; if (!al.length) return false; const C = L.CMD.rally; F.cmd.rally = C.cd;
      al.forEach((u) => { u.s.rally = { spd: 0.25, t: C.dur }; u.s.expo = { t: C.dur }; emit(F, { k: 'status', dst: u.id, st: 'rally', t: C.dur }); emit(F, { k: 'status', dst: u.id, st: 'expo', t: C.dur }); });
      emit(F, { k: 'cmd', a: 'rally', side, src: al[0].id, t: C.dur }); return true;
    }
    if (kind === 'swap') {
      const foes = alive(F, other(side)); if (F.cmd.swap > 0) return 'cd'; if (al.length < 2 || foes.length < 2) return false;
      const cur = al.map((u) => foes.find((f) => f.id === u.tgt) || foes.slice().sort((p, q) => dist(u, p) - dist(u, q))[0]);
      let next = cur.map((_, i) => cur[(i + 1) % al.length]);
      if (next.every((t, i) => t === cur[i])) next = cur.map((t, i) => (i === 0 ? t : foes.filter((f) => f !== t).sort((p, q) => dist(al[i], p) - dist(al[i], q))[0]));
      const C = L.CMD.swap; F.cmd.swap = C.cd;
      al.forEach((u, i) => { u.swap = { id: next[i].id, t: C.dur }; u.atkT = Math.max(u.atkT, 0.7); });
      emit(F, { k: 'cmd', a: 'swap', side, src: al[0].id, t: C.dur, pairs: al.map((u, i) => [u.id, next[i].id]) }); return true;
    }
    return false;
  };
  // the stance a fighter is in right now ('' = none), for the HUD
  L.stanceOf = (u) => { for (const k in STANCE_KEYS) if (u.s[STANCE_KEYS[k]]) return k; return ''; };
  function retreatMove(F, u, foes) {
    let nf = foes[0], bd = 1e9; for (const f of foes) { const d = dist(u, f); if (d < bd) { bd = d; nf = f; } }
    let ax = u.x - nf.x, ay = u.y - nf.y, l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
    const r = Math.hypot(u.x, u.y); if (r > R * 0.62) { const k = (r - R * 0.62) / (R * 0.38) * 1.6; ax -= u.x / r * k; ay -= u.y / r * k; l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l; }
    u.mvx = ax; u.mvy = ay; if (Math.abs(nf.x - u.x) > 0.15) u.face = nf.x > u.x ? 1 : -1;
  }
  // The foe's tactics (live fights only, F.cmdAI): deterministic, no rnd(), and each one is announced (cmd event) so the player sees it.
  function aiCmd(F, u, foes, t, d) {
    if (u.beast || (u.cmdCd || 0) > 0 || F.t < 4 || L.stanceOf(u)) return;
    const hp = u.hp / u.maxhp; // every test below is pure, so the cheap ones run first and the side sums only when a branch can fire
    if (hp < 0.22 && !u.aiFell && anyWithin(u, foes, 4)) { u.aiFell = 1; setStance(F, u, 'retreat'); return; }
    if (hp > 0.6 && d < 6 && !u.aiPressed && sideHp(F, u.side) > sideHp(F, other(u.side)) + 0.25) { u.aiPressed = 1; setStance(F, u, 'press'); return; }
    if (hp < 0.45 && d > u.range + 1 && !u.aiHeld && aliveCount(F, u.side) > 1) { u.aiHeld = 1; setStance(F, u, 'hold'); }
  }
  // PLAN: start a fight with the battle plans of both sides: the priority target becomes the side's focus (the same F.foc a tap on an enemy sets)
  L.planFight = (F, pa, pb) => {
    if (pa && pa.prio != null && F.units.some((u) => u.id === 'B' + pa.prio)) { F.foc.A = 'B' + pa.prio; F.pri.A = true; }
    if (pb && pb.prio != null && F.units.some((u) => u.id === 'A' + pb.prio)) { F.foc.B = 'A' + pb.prio; F.pri.B = true; }
  };
  L.focus = (F, side, id) => { F.foc[side] = F.foc[side] === id ? null : id; };
  L.quick = (A, B, o) => {
    const F = L.createFight(A, B, Object.assign({ autoA: true, quiet: true }, o)); if (o && o.plans) L.planFight(F, o.plans.pa, o.plans.pb); let n = 0; while (!F.done && n++ < 1500) L.step(F, 0.1); return F;
  };
  // win chance of team A glads vs team B glads. Seeded, so the number is stable between renders.
  L.odds = (S, gA, gB, stanceA, n) => {
    n = n || 30; let w = 0;
    const pls = stanceA && typeof stanceA === 'object' ? L.fightPlans(S, gA, gB, stanceA) : null; // PLAN: a battle plan changes the odds (both sides' plans, same as the real fight)
    L.withRandom(L.mulberry(L.hash(gA.map((g) => g.id + ':' + g.lvl).join() + '|' + gB.map((g) => g.name + g.lvl).join() + (pls ? L.planKey(pls.pa) : stanceA || ''))), () => {
      const ca = L.teamCtx(S, gA, pls ? pls.pa : stanceA || 'bal'); const cb = L.teamCtx(null, gB, 'bal'); if (pls && pls.pb) cb.plan = pls.pb;
      for (let i = 0; i < n; i++) { const F = L.quick(L.mkUnits(gA, 'A', ca), L.mkUnits(gB, 'B', cb), pls ? { plans: pls } : undefined); if (F.winner === 'A') w++; }
    });
    return w / n;
  };
  // generalise the field representations of the literals above once at load (Smi -> double -> object), so the first fights do not deprecate their maps under optimised code
  (function primeShapes() {
    const st = mkSt(), fx = mkFx({}), stk = { fr: 0, lt: 0, cq: 0, gr: 0 }, u = blankUnit();
    const NUM = ['stun', 'blind', 'root', 'air', 'silence', 'ccimm', 'inv', 'taunt', 'rage', 'roar', 'netted', 'unb', 'phase', 'nimbus', 'lastB']; // timers that are plain seconds; the rest hold {t, ...} objects
    for (const k of Object.keys(st)) { if (NUM.includes(k)) st[k] = 0.5; else st[k] = { t: 1 }; st[k] = 0; }
    for (const k of Object.keys(fx)) fx[k] = 0.5; for (const k of Object.keys(stk)) stk[k] = 0.5;
    for (const k of Object.keys(u)) { const v = u[k]; if (typeof v === 'number') u[k] = 0.5; }
    const r0 = L.rand; L.rand = () => 0.5; // createFight draws one rnd() (hazT): keep the real random stream untouched while priming the fight literal
    try { const F = L.createFight([], [], {}); for (const k of ['t', 'hype', 'peak', 'hazT', 'hypeK']) F[k] = 0.5; F.meta = {}; F.replay = {}; F.winner = 'A'; } finally { L.rand = r0; }
    u.role = 'vanguard'; u.tgt = 'A0'; u.wt = 'A0'; u.swap = { id: 'A0', t: 1 }; u.cmdId = 'press'; u.beast = 'lion'; u.ai = 'pounce'; u.bx = {}; u.wa = {}; u.bs = {}; u.fs = {};
  })();
})(typeof globalThis !== 'undefined' ? globalThis : this);
