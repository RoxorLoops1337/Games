// Ludus Maximus: arena combat engine. Real-time 2D simulation: gladiators move, chase, strafe, swing,
// cast skills automatically and fire player-triggered ultimates. No DOM; the renderer reads unit state.
(function (G) {
  const D = G.LM_D, L = G.LM;
  const R = 8.6; // arena radius in meters
  const clamp = L.clamp; const rnd = () => L.rand();
  const alive = (F, side) => F.units.filter((u) => u.side === side && !u.down);
  const other = (s) => (s === 'A' ? 'B' : 'A');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const emit = (F, e) => { if (!F.quiet) F.ev.push(e); };
  L.ARENA_R = R;
  const DK = 0.3; // global damage scale: keeps fights readable (~20s)

  function mkUnit(g, side, i, n, ctx, hpFrac, grudge) {
    const d = L.derive(g, ctx); const fx = d.fx; const maxhp = Math.round(d.hp);
    return {
      id: side + i, side, i, g, name: g.name, style: g.style, tr: D.TRAITS[g.trait] || {},
      x: side === 'A' ? -6.4 : 6.4, y: (i - (n - 1) / 2) * (n > 2 ? 4.3 : 3.6), z: 0, face: side === 'A' ? 1 : -1, mvx: 0, mvy: 0, kx: 0, ky: 0, spdNow: 0,
      maxhp, hp: Math.max(1, Math.round(maxhp * (hpFrac == null ? 1 : hpFrac))), shield: fx.shield ? maxhp * 0.08 * fx.shield : 0,
      atk: d.atk, def: d.def, ms: 2.7 + d.spd * 0.026, aps: 0.5 + d.spd * 0.0095, range: D.RANGE[g.style],
      crit: d.crit, eva: d.eva, fx, wil: g.st.wil, rk: g.rune ? g.rune.k : null, rm: new Set(g.rune ? g.rune.m : []),
      atkT: 0.3 + rnd() * 0.5, wind: 0, wt: null, cast: 0, tgt: null, strafeT: 0, strafeDir: 1,
      skills: (g.techs || []).map((id) => ({ id, cd: 2 + rnd() * 4 })),
      ults: L.ultsOf(g).map((id) => ({ id, cd: 5 + rnd() * 2, max: D.ULTS[id].cd })),
      s: {}, stk: {}, hits: [], down: false, gritUsed: false, stal: false, revived: false, lbUsed: false,
      dmg: 0, taken: 0, crits: 0, grudge: !!grudge, bacc: 0, racc: 0, srT: 0.5, noDmgT: 9, graspReady: true, graspT: 0, elecAt: 0, phaseAt: 0, thCnt: 0, fs: null, airT: 1,
    };
  }
  L.mkUnits = (glads, side, ctx, hpFracs, grudge) => glads.map((g, i) => mkUnit(g, side, i, glads.length, ctx, hpFracs && hpFracs[i], grudge));
  L.createFight = (A, B, o) => {
    o = o || {};
    return { t: 0, A, B, units: A.concat(B), ev: [], hype: 0, peak: 0, done: false, winner: null, auto: { A: !!o.autoA, B: true }, foc: { A: null, B: null }, quiet: !!o.quiet, sched: [], dtmax: 0.1, duo: o.duo ? { ids: o.duo.ids, kind: o.duo.kind, cd: 10, max: D.DUOS[o.duo.kind].cd } : null, manualFavor: !!o.manualFavor, favorReady: false, hazards: o.hazards || 0, hazT: 7 + Math.random() * 3, zones: [] };
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
    return u.aps * m;
  }
  function msOf(u) {
    let m = 1; const s = u.s;
    if (u.rm.has('celerity')) m += 0.04; if (u.rk === 'lethal' && (u.stk.lt || 0) >= 6) m += 0.12;
    if (s.sprint) m += 0.12 * s.sprint.v; if (s.phase) m += 0.35; if (s.nimbus) m += 0.25; if (s.unb) m += 0.2; if (s.spin) m += 0.3; if (s.rage) m += 0.1;
    if (s.slow) m *= 0.4 + 0.6 * s.slow.f;
    return u.ms * m;
  }
  L.apsOf = apsOf; L.msOf = msOf;

  // ---------- damage ----------
  function dmgMul(F, u, t, o) {
    let m = 1; const av = L.adv(u.style, t.style); m *= av > 0 ? 1.1 : av < 0 ? 0.92 : 1;
    if (av < 0 && u.tr.underdog) m *= 1 + u.tr.underdog;
    if (u.grudge && u.tr.grudge) m *= 1 + u.tr.grudge;
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
    if (F.t > 40) m *= 1 + (F.t - 40) * 0.03;
    if (o.exec && tp < o.exec.th) m *= o.exec.m / (o.mult || 1);
    return m;
  }
  function damage(F, t, amt, src) {
    t.hp -= amt; t.taken += amt;
    if (t.hp <= 0 && !t.down) {
      if (t.fx.revive && !t.revived) { t.revived = true; t.hp = Math.round(t.maxhp * 0.35); t.s.inv = 1.2; emit(F, { k: 'revive', dst: t.id }); return; }
      t.hp = 0; t.down = true; t.s = {}; emit(F, { k: 'down', dst: t.id, src: src && src.id }); F.hype += 10;
      if (!alive(F, t.side).length) finish(F, other(t.side));
    }
  }
  function finish(F, w) { if (F.done) return; F.done = true; F.winner = w; emit(F, { k: 'end', winner: w }); }
  function heal(F, u, amt) { amt = Math.min(u.maxhp - u.hp, Math.round(amt)); if (amt <= 0 || u.down) return; u.hp += amt; emit(F, { k: 'heal', dst: u.id, amt }); }
  function cc(F, t, key, val, dur) {
    if (t.down) return false;
    if (t.s.ccimm || t.s.spin || t.s.inv) { emit(F, { k: 'resist', dst: t.id }); return false; }
    if (key === 'stun' && rnd() < t.wil * 0.003) { emit(F, { k: 'resist', dst: t.id }); return false; }
    t.s[key] = val; if (key === 'stun' || key === 'air') { t.wind = 0; t.cast = 0; delete t.s.dash; }
    if (key === 'air') t.airT = dur; emit(F, { k: 'status', dst: t.id, st: key, t: dur }); return true;
  }
  function strike(F, u, t, o) {
    o = o || {}; if (t.down || u.down) return 0;
    if (t.s.inv) { emit(F, { k: 'miss', src: u.id, dst: t.id, inv: 1 }); return 0; }
    const av = L.adv(u.style, t.style);
    let hc = 0.94 - t.eva - (u.s.blind ? 0.4 : 0) + (t.s.netted ? 0.12 : 0); if (o.sure) hc = 1; hc = clamp(hc, 0.3, 1);
    if (rnd() > hc) { emit(F, { k: 'miss', src: u.id, dst: t.id }); return 0; }
    const df = t.def * (1 + (t.s.frenzy ? t.s.frenzy.def : 0)) * (1 - (o.ignore || 0)) * (1 - Math.min(0.6, 0.08 * (u.fx.pen || 0)));
    let dmg = DK * u.atk * (o.mult || 1) * (0.85 + rnd() * 0.3) * (60 / (60 + Math.max(0, df))) * dmgMul(F, u, t, o);
    if (u.rk === 'first') { u.fs = u.fs || new Set(); if (!u.fs.has(t.id)) { u.fs.add(t.id); dmg *= 2.2; } dmg *= 1.05; }
    if (u.rk === 'grasp' && u.graspReady && o.basic) { dmg += t.maxhp * 0.02; u.graspReady = false; u.graspT = 5; heal(F, u, u.maxhp * 0.015); const g = Math.round(u.maxhp * 0.003); u.maxhp += g; u.hp += g; emit(F, { k: 'rune', src: u.id, id: 'grasp' }); }
    const crit = rnd() < clamp(u.crit + (o.critB || 0), 0, 0.8); if (crit) dmg *= 1.6 + 0.15 * (u.fx.critdmg || 0);
    if (t.s.guard) dmg *= 1 - t.s.guard.f;
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
    F.hype += 2 + (shown / t.maxhp) * 50 + (crit ? 5 : 0);
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
      u.hits.push(F.t); u.hits = u.hits.filter((x) => F.t - x <= 3);
      if (u.rk === 'electro' && u.hits.length >= 3 && F.t >= u.elecAt) { u.elecAt = F.t + 7; u.hits.length = 0; emit(F, { k: 'rune', src: u.id, id: 'electro' }); zap(F, u, t, 1.2, 'electro'); }
      if (u.rk === 'phase' && u.hits.length >= 3 && F.t >= u.phaseAt) { u.phaseAt = F.t + 4; u.hits.length = 0; u.s.phase = 3; emit(F, { k: 'rune', src: u.id, id: 'phase' }); }
      if (fx.thunder) { u.thCnt++; if (u.thCnt >= 3) { u.thCnt = 0; zap(F, u, t, 0.35 * fx.thunder, 'thunder'); } }
    }
    if (u.rk === 'conq' && (u.stk.cq || 0) >= 8) heal(F, u, dmg * 0.06);
    if (fx.vamp) heal(F, u, dmg * fx.vamp * 0.04);
    if (u.s.rage) heal(F, u, dmg * 0.15);
    if (!t.down && ((fx.bleed && rnd() < fx.bleed * 0.15) || (crit && u.tr.bleedcrit))) { t.s.bleed = { dps: u.atk * 0.1 * DK, t: 4 }; emit(F, { k: 'status', dst: t.id, st: 'bleed' }); }
    if (t.fx.thorns && !u.down) { const r = Math.round(dmg * t.fx.thorns * 0.06); if (r > 0) { emit(F, { k: 'thorn', src: t.id, dst: u.id, dmg: r }); damage(F, u, r, t); } }
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
        ['stun', 'slow', 'blind', 'root', 'air', 'silence', 'bleed', 'pull'].forEach((x) => { delete u.s[x]; }); u.z = 0;
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
  function aiUlt(F, u, foes, t, d, dt) {
    if (rnd() > dt * 2.5) return;
    for (let k = 0; k < u.ults.length; k++) {
      const sl = u.ults[k]; if (sl.cd > 0) continue; const U = D.ULTS[sl.id]; const hpf = u.hp / u.maxhp; let ok = false;
      switch (sl.id) {
        case 'pulverize': ok = foes.some((f) => dist(u, f) < 3.2); break;
        case 'hookshot': ok = d > 3.5 && d < 9.5; break;
        case 'bladedance': ok = d > 3 && d < 7.5; break;
        case 'skewer': ok = d > 3.5 && d < 10.5; break;
        case 'tornado': ok = foes.some((f) => dist(u, f) < 2.2); break;
        case 'unbreakable': ok = hpf < 0.55 || !!(u.s.stun || u.s.air); break;
        case 'bloodrage': ok = d < 3 && hpf > 0.3; break;
        case 'meteor': ok = d < 11; break;
        case 'duststorm': ok = foes.some((f) => dist(u, f) < 6) && hpf < 0.8; break;
        default: break;
      }
      if (ok && !(U.rng && d > U.rng)) { castUlt(F, u, k, t); return; }
    }
  }

  // ---------- per-step logic ----------
  function chooseTarget(F, u, foes) {
    const tn = foes.find((f) => f.s.taunt); if (tn) return tn;
    const fid = F.foc[u.side]; if (fid) { const f = foes.find((x) => x.id === fid); if (f) return f; }
    if (u.tgt) { const f = foes.find((x) => x.id === u.tgt); if (f) return f; }
    return foes.slice().sort((a, b) => dist(u, a) * (0.6 + 0.8 * (a.hp / a.maxhp)) - dist(u, b) * (0.6 + 0.8 * (b.hp / b.maxhp)))[0];
  }
  function upkeep(F, u, dt) {
    const s = u.s;
    for (const key in s) {
      if (key === 'dash' || key === 'pull') continue; const v = s[key];
      if (typeof v === 'number') { s[key] = v - dt; if (s[key] <= 0) delete s[key]; } else { v.t -= dt; if (v.t <= 0) delete s[key]; }
    }
    u.atkT -= dt; u.noDmgT += dt;
    const hk = hasteK(u) * dt; u.skills.forEach((k) => { k.cd = Math.max(0, k.cd - hk); }); const uk = ultK(u) * dt; u.ults.forEach((k) => { k.cd = Math.max(0, k.cd - uk); });
    if (u.frT > 0 && (u.frT -= dt) <= 0) u.stk.fr = 0; if (u.ltT > 0 && (u.ltT -= dt) <= 0) u.stk.lt = 0; if (u.cqT > 0 && (u.cqT -= dt) <= 0) u.stk.cq = 0;
    if (u.graspT > 0 && (u.graspT -= dt) <= 0) u.graspReady = true;
    if (u.fx.regen) { u.racc += u.maxhp * 0.006 * u.fx.regen * dt; if (u.racc >= 1) { const h = Math.floor(u.racc); u.racc -= h; heal(F, u, h); } }
    if (u.fx.lastbreath && !u.lbUsed && u.hp < u.maxhp * 0.3) { u.lbUsed = true; u.s.lastB = 5; heal(F, u, u.maxhp * 0.1); emit(F, { k: 'status', dst: u.id, st: 'rage' }); }
    if (s.bleed) { u.bacc += s.bleed.dps * dt; if (u.bacc >= 1) { const d = Math.floor(u.bacc); u.bacc -= d; emit(F, { k: 'bleed', dst: u.id, dmg: d }); damage(F, u, d, null); } }
    if (u.fx.sear) { u.srT -= dt; if (u.srT <= 0) { u.srT = 0.5; alive(F, other(u.side)).forEach((f) => { if (dist(u, f) < 2.4) { const d = Math.max(1, Math.round(DK * u.atk * 0.1 * u.fx.sear * (60 / (60 + f.def)))); emit(F, { k: 'bleed', dst: f.id, dmg: d, fire: 1 }); damage(F, f, d, u); } }); } }
    if (s.spin) { s.spin.tick -= dt; if (s.spin.tick <= 0) { s.spin.tick = 0.25; emit(F, { k: 'aoe', x: u.x, y: u.y, r: 2, c: '#c2395f' }); alive(F, other(u.side)).forEach((f) => { if (dist(u, f) < 2.1) strike(F, u, f, { mult: 0.4, sure: true, noProc: true, tag: 'tornado' }); }); } }
  }
  function think(F, u, dt) {
    if (u.down) return; const s = u.s;
    if (s.stun || s.air || s.dash || s.pull) { u.mvx = u.mvy = 0; return; }
    if (u.cast > 0) { u.cast -= dt; u.mvx = u.mvy = 0; return; }
    if (u.wind > 0) { u.wind -= dt; u.mvx = u.mvy = 0; if (u.wind <= 0) resolveAttack(F, u); return; }
    if (F.zones.length) { const z = F.zones.find((q) => Math.hypot(u.x - q.x, u.y - q.y) < q.r + 0.6); if (z) { const dx = u.x - z.x, dy = u.y - z.y, l = Math.hypot(dx, dy) || 1; u.mvx = dx / l; u.mvy = dy / l; return; } }
    const foes = alive(F, other(u.side)); if (!foes.length) return;
    const t = chooseTarget(F, u, foes); u.tgt = t.id; const d = dist(u, t);
    if (Math.abs(t.x - u.x) > 0.15) u.face = t.x > u.x ? 1 : -1;
    if (F.auto[u.side]) aiUlt(F, u, foes, t, d, dt);
    if (u.cast > 0) return;
    if (rnd() < dt * 3 && !s.silence) { for (const sk of u.skills) { if (sk.cd <= 0 && skillOk(F, u, sk, t, foes, d)) { castSkill(F, u, sk, t, foes); return; } } }
    if (d <= u.range + 0.1) {
      u.strafeT -= dt; if (u.strafeT <= 0) { u.strafeT = 1 + rnd() * 1.5; u.strafeDir = rnd() < 0.5 ? -1 : 1; }
      const nx = (t.x - u.x) / (d || 1), ny = (t.y - u.y) / (d || 1);
      if (u.style === 'retiarius' && d < u.range * 0.62) { u.mvx = -nx * 0.9; u.mvy = -ny * 0.9; } else { u.mvx = -ny * u.strafeDir * 0.3; u.mvy = nx * u.strafeDir * 0.3; }
      if (u.atkT <= 0 && !s.spin) { u.wt = t.id; u.wind = Math.min(0.22, 0.4 / apsOf(u)); u.atkT = 1 / apsOf(u); emit(F, { k: 'atk', src: u.id, dst: t.id }); }
    } else { const nx = (t.x - u.x) / d, ny = (t.y - u.y) / d; u.mvx = nx; u.mvy = ny; }
  }
  function resolveAttack(F, u) {
    const t = F.units.find((x) => x.id === u.wt); if (!t || t.down || u.s.stun) return;
    if (dist(u, t) <= u.range + 0.9) strike(F, u, t, { mult: 1, basic: true }); else emit(F, { k: 'whiff', src: u.id });
  }
  function motion(F, u, dt) {
    if (u.down) return; const s = u.s; const x0 = u.x, y0 = u.y;
    if (s.air) { const p = clamp(1 - s.air / u.airT, 0, 1); u.z = 3.2 * 4 * p * (1 - p); } else u.z = 0;
    if (s.dash) {
      const d = s.dash; d.t -= dt; const dx = d.tx - u.x, dy = d.ty - u.y, len = Math.hypot(dx, dy), step = 24 * dt;
      if (len <= step || d.t <= 0) { u.x = d.tx; u.y = d.ty; const fn = d.fn; delete s.dash; if (fn) fn(); } else { u.x += (dx / len) * step; u.y += (dy / len) * step; }
    } else if (s.pull) {
      const d = s.pull; d.t -= dt; const dx = d.tx - u.x, dy = d.ty - u.y, len = Math.hypot(dx, dy), step = 18 * dt;
      if (len <= step || d.t <= 0) { u.x = d.tx; u.y = d.ty; delete s.pull; } else { u.x += (dx / len) * step; u.y += (dy / len) * step; }
    } else if (!s.stun && !s.air && !s.root && u.cast <= 0 && u.wind <= 0) {
      const sp = msOf(u); u.x += u.mvx * sp * dt; u.y += u.mvy * sp * dt;
    }
    if (u.kx || u.ky) { u.x += u.kx * dt; u.y += u.ky * dt; const f = Math.pow(0.02, dt); u.kx *= f; u.ky *= f; }
    const r = Math.hypot(u.x, u.y); if (r > R) { u.x *= R / r; u.y *= R / r; }
    u.spdNow = Math.hypot(u.x - x0, u.y - y0) / dt;
  }
  function separate(F) {
    const us = F.units.filter((u) => !u.down && !u.s.air);
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j]; let dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy); const min = 1.05;
      if (d < min) { if (d < 0.001) { dx = rnd() - 0.5; dy = rnd() - 0.5; d = Math.hypot(dx, dy) || 1; } const p = (min - d) / 2; const nx = dx / d, ny = dy / d; if (!a.s.dash) { a.x -= nx * p; a.y -= ny * p; } if (!b.s.dash) { b.x += nx * p; b.y += ny * p; } }
    }
  }
  const sideHp = (F, s) => { const us = F.units.filter((u) => u.side === s); return us.reduce((a, u) => a + u.hp, 0) / us.reduce((a, u) => a + u.maxhp, 0); };
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
    F.n = (F.n || 0) + 1; const us = F.n % 2 ? F.units : F.units.slice().reverse();
    for (let i = 0; i < us.length; i++) if (!us[i].down) upkeep(F, us[i], dt);
    if (F.done) return;
    for (let i = 0; i < us.length; i++) think(F, us[i], dt);
    for (let i = 0; i < us.length; i++) motion(F, us[i], dt);
    separate(F);
    if (F.hype >= 100 / (F.hypeK || 1) && !F.done) {
      const behind = sideHp(F, 'A') <= sideHp(F, 'B');
      if (F.manualFavor && behind) { if (!F.favorReady) { F.favorReady = true; F.hype = 100 / (F.hypeK || 1); emit(F, { k: 'favorready' }); } else F.hype = Math.min(F.hype, 100 / (F.hypeK || 1)); } else roar(F, F.manualFavor && !behind ? 'B' : null);
    }
    if (F.hazards && !F.done) { F.hazT -= dt; if (F.hazT <= 0) { F.hazT = 11 + rnd() * 5; hazard(F); } }
    F.peak = Math.max(F.peak, F.hype);
    if (!F.done && F.t > 95) { const hp = (s) => F.units.filter((u) => u.side === s).reduce((a, u) => a + u.hp / u.maxhp, 0); finish(F, hp('A') >= hp('B') ? 'A' : 'B'); }
  };
  L.focus = (F, side, id) => { F.foc[side] = F.foc[side] === id ? null : id; };
  L.quick = (A, B, o) => {
    const F = L.createFight(A, B, Object.assign({ autoA: true, quiet: true }, o)); let n = 0; while (!F.done && n++ < 1500) L.step(F, 0.1); return F;
  };
  // win chance of team A glads vs team B glads. Seeded, so the number is stable between renders.
  L.odds = (S, gA, gB, stanceA, n) => {
    n = n || 30; let w = 0;
    L.withRandom(L.mulberry(L.hash(gA.map((g) => g.id + ':' + g.lvl).join() + '|' + gB.map((g) => g.name + g.lvl).join() + (stanceA || ''))), () => {
      const ca = L.teamCtx(S, gA, stanceA || 'bal'); const cb = L.teamCtx(null, gB, 'bal');
      for (let i = 0; i < n; i++) { const F = L.quick(L.mkUnits(gA, 'A', ca), L.mkUnits(gB, 'B', cb)); if (F.winner === 'A') w++; }
    });
    return w / n;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
