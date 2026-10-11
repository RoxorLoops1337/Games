// Ludus Maximus: simulation core (no DOM). Gladiators, gear, combat engine, fixtures, economy.
(function (G) {
  const D = G.LM_D;
  const LM = { D };
  let rnd = Math.random;
  LM.setRandom = (f) => { rnd = f || Math.random; };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr, r) => arr[Math.floor((r || rnd)() * arr.length)];
  const uid = () => Math.floor(rnd() * 1e9).toString(36) + Date.now().toString(36).slice(-3);
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  LM.mulberry = mulberry; LM.hash = hash; LM.clamp = clamp;
  const add = (o, p) => { for (const k in p) o[k] = (o[k] || 0) + p[k]; return o; };

  // ---------- styles ----------
  const adv = (a, b) => (D.STYLES[a].beats.includes(b) ? 1 : D.STYLES[b].beats.includes(a) ? -1 : 0);
  LM.adv = adv;
  LM.counters = (style) => D.STYLE_IDS.filter((s) => D.STYLES[s].beats.includes(style)); // styles that beat `style`

  // ---------- buildings ----------
  LM.COLS = 4;
  LM.plotOf = (S, id) => S.plots.findIndex((p) => p && p.b === id);
  LM.neighbors = (i) => { const o = []; const c = i % LM.COLS; if (c > 0) o.push(i - 1); if (c < LM.COLS - 1) o.push(i + 1); if (i - LM.COLS >= 0) o.push(i - LM.COLS); if (i + LM.COLS < 16) o.push(i + LM.COLS); return o; };
  LM.synAt = (S, i) => { const p = S.plots[i]; if (!p) return 0; const like = D.BUILD[p.b].like; return LM.neighbors(i).filter((n) => S.plots[n] && like.includes(S.plots[n].b)).length; };
  LM.bfx = (S, id) => {
    const i = LM.plotOf(S, id); const B = D.BUILD[id];
    if (i < 0) return { l: 0, syn: 0, v: B.v[0], i };
    const l = S.plots[i].l; const syn = B.syn ? LM.synAt(S, i) : 0;
    return { l, syn, v: B.v[l] * (1 + 0.1 * syn), i };
  };
  LM.rosterCap = (S) => D.BUILD.barracks.v[LM.plotOf(S, 'barracks') < 0 ? 0 : S.plots[LM.plotOf(S, 'barracks')].l];
  LM.armoryCap = (S) => 20 + LM.bfx(S, 'forge').l * 4 + (LM.bfx(S, 'forge').l ? 0 : 0);
  LM.scoutLevel = (S) => D.BUILD.scout.v[LM.bfx(S, 'scout').l];
  LM.lookahead = (S) => D.look(LM.bfx(S, 'scout').l);
  LM.maxLeague = (S) => { let m = 0; D.LEAGUES.forEach((L) => { if (S.fame >= L.fame) m = L.id; }); return m; };
  LM.buildCost = (id, lvl) => Math.round(D.BUILD[id].c0 * D.BMULT[lvl]);
  LM.levelCap = (S) => D.RLEVELCAP[LM.maxLeague(S)];
  LM.landCost = (S) => [0, 0, 400, 1200, 0][S.rows] || 0;
  LM.landFame = (S) => [0, 0, 100, 400, 0][S.rows] || 0;
  LM.build = (S, i, id) => {
    const B = D.BUILD[id]; if (S.plots[i] || LM.plotOf(S, id) >= 0 || i >= S.rows * LM.COLS) return 'Cannot build there';
    if (S.fame < B.fame) return `Needs ${B.fame} fame`;
    const c = LM.buildCost(id, 1); if (S.gold < c) return 'Not enough gold';
    S.gold -= c; S.plots[i] = { b: id, l: 1 }; return '';
  };
  LM.upgrade = (S, i) => {
    const p = S.plots[i]; if (!p) return 'Nothing here'; if (p.l >= 5) return 'Max level';
    if (p.l >= LM.levelCap(S)) return 'Win more fame to unlock the next level';
    const c = LM.buildCost(p.b, p.l + 1); if (S.gold < c) return 'Not enough gold';
    S.gold -= c; p.l++; return '';
  };
  LM.buyLand = (S) => {
    if (S.rows >= 4) return 'Fully expanded'; if (S.fame < LM.landFame(S)) return `Needs ${LM.landFame(S)} fame`;
    if (S.gold < LM.landCost(S)) return 'Not enough gold'; S.gold -= LM.landCost(S); S.rows++; return '';
  };

  // ---------- gladiators ----------
  LM.levelGain = (S_, g, s) => 1.6 * (D.STYLES[g.style].base[s] / 10) * (0.7 + 0.15 * g.tal[s]);
  LM.need = (l) => 40 + l * 30;
  LM.cap = (g) => 20 + g.lvl * 6;
  function techPicks(g, r) {
    const own = new Set(g.techs); const pool = D.TECH_POOL.filter((t) => !own.has(t));
    const a = pick(pool, r); const b = pick(pool.filter((t) => t !== a), r); return [a, b];
  }
  function makeGlad(o) {
    const r = o.r || rnd; const style = o.style || pick(D.STYLE_IDS, r); const S = D.STYLES[style]; const lvl = o.lvl || 1; const q = o.q == null ? r() : o.q;
    const g = {
      id: o.id || 0, name: o.name || pick(D.FIRST, r), nick: o.nick != null ? o.nick : (r() < 0.55 ? pick(D.NICK, r) : ''), style,
      skin: o.skin || pick(D.SKIN, r), hair: o.hair || pick(D.HAIR, r), plume: o.plume || pick(D.PLUME, r), face: o.face != null ? o.face : Math.floor(r() * 3),
      lvl, xp: 0, st: {}, tal: {}, trait: o.trait || pick(D.TRAIT_IDS, r), techs: [S.sig], pick: null, gear: {},
      en: 100, mo: 70, inj: 0, act: 'rest', rec: { w: 0, l: 0 }, fame: 0, color: o.color || null,
    };
    D.STATS.forEach((s) => {
      g.tal[s] = 1 + (r() < 0.22 + 0.4 * q ? 1 : 0) + (r() < 0.06 + 0.3 * q ? 1 : 0);
      g.st[s] = S.base[s] * (0.92 + r() * 0.16);
    });
    for (let l = 2; l <= lvl; l++) D.STATS.forEach((s) => { g.st[s] += LM.levelGain(null, g, s); });
    if (lvl >= 3) g.techs.push(techPicks(g, r)[0]);
    if (lvl >= 6) g.techs.push(techPicks(g, r)[0]);
    return g;
  }
  LM.makeGlad = makeGlad;
  LM.stars = (g) => clamp(Math.round(((D.STATS.reduce((a, s) => a + g.tal[s], 0) - 5) / 10) * 4 + 1), 1, 5);
  LM.fullName = (g) => g.name + (g.nick ? ' ' + g.nick : '');
  LM.addXp = (g, xp) => {
    const up = []; g.xp += xp;
    while (g.xp >= LM.need(g.lvl)) {
      g.xp -= LM.need(g.lvl); g.lvl++; up.push(g.lvl);
      D.STATS.forEach((s) => { g.st[s] += LM.levelGain(null, g, s); });
      if ((g.lvl === 3 || g.lvl === 6) && !g.pick) g.pick = techPicks(g);
    }
    return up;
  };
  LM.choosePick = (g, id) => { if (g.pick && g.pick.includes(id)) { g.techs.push(id); g.pick = null; return true; } return false; };
  LM.statTotal = (g) => D.STATS.reduce((a, s) => a + g.st[s], 0);
  LM.grade = (v, lvl) => { const x = v / (8 + lvl * 4); return x < 0.75 ? 'D' : x < 0.95 ? 'C' : x < 1.15 ? 'B' : x < 1.4 ? 'A' : 'S'; };

  // ---------- items ----------
  const RARW = [[68, 26, 6, 0, 0], [45, 35, 16, 4, 0], [25, 35, 28, 10, 2], [10, 25, 33, 25, 7]];
  function rollRar(r, league, luck) {
    const w = RARW[clamp(league, 0, 3)]; let x = r() * 100, k = 0;
    for (; k < 5; k++) { x -= w[k]; if (x < 0) break; }
    k = Math.min(k, 4); if (k < 4 && r() < luck) k++; return k;
  }
  function genItem(r, o) {
    r = r || rnd; o = o || {};
    const slot = o.slot || pick(D.SLOTS, r); const rar = o.rar != null ? o.rar : rollRar(r, o.league || 0, o.luck || 0);
    const ilvl = Math.max(1, Math.round(o.ilvl || 1)); const R = D.RAR[rar]; const pw = (3 + ilvl * 1.6) * R.m;
    const f = () => 0.8 + r() * 0.4; const rd = (x) => Math.round(x * 10) / 10; const st = {};
    if (slot === 'weapon') { st.atk = pw * 0.7 * f(); if (r() < 0.5) { if (r() < 0.5) st.crit = 1.5 + ilvl * 0.12; else st.spd = pw * 0.3 * f(); } }
    else if (slot === 'shield') { st.def = pw * 0.5 * f(); st.hp = pw * 1.2 * f(); }
    else if (slot === 'armor') { st.hp = pw * 2.4 * f(); st.def = pw * 0.3 * f(); }
    else if (slot === 'helm') { st.def = pw * 0.25 * f(); st.hp = pw * 0.8 * f(); if (r() < 0.5) { if (r() < 0.5) st.eva = 1 + ilvl * 0.08; else st.crit = 1 + ilvl * 0.1; } }
    else {
      const opts = [['atk', pw * 0.3], ['hp', pw * 1], ['spd', pw * 0.25], ['crit', 1 + ilvl * 0.1], ['eva', 1 + ilvl * 0.08]];
      for (let n = 0; n < 2; n++) { const [k, v] = opts.splice(Math.floor(r() * opts.length), 1)[0]; st[k] = v * f(); }
    }
    for (const k in st) st[k] = rd(st[k]);
    const allowed = D.AFFIX_IDS.filter((a) => D.AFFIX[a].slots.includes(slot)); const af = [];
    for (let n = 0; n < R.af && allowed.length; n++) {
      const id = allowed.splice(Math.floor(r() * allowed.length), 1)[0];
      let v = 1 + (r() < 0.35 ? 1 : 0) + (rar >= 3 && r() < 0.3 ? 1 : 0); if (id === 'stalwart') v = 1; af.push({ id, v });
    }
    const set = rar >= 2 && r() < (rar === 4 ? 0.8 : rar === 3 ? 0.5 : 0.3) ? pick(D.SET_IDS, r) : null;
    const base = pick(D.BASES[slot], r);
    return { id: uid(), slot, name: set ? `${D.SETS[set].n} ${base}` : `${pick(D.ADJ[rar], r)} ${base}`, rar, ilvl, up: 0, st, af, set };
  }
  LM.genItem = genItem;
  LM.sellVal = (it) => Math.round((8 + it.ilvl * 2.2) * D.RAR[it.rar].m * D.RAR[it.rar].m * (1 + 0.35 * it.up));
  LM.buyVal = (S, it) => Math.round(LM.sellVal(it) * 3.5 * (1 - 0.03 * LM.bfx(S, 'market').l));
  LM.upCost = (it) => Math.round((20 + it.ilvl * 6) * D.RAR[it.rar].m * Math.pow(it.up + 1, 1.4));
  LM.maxUp = (S) => D.BUILD.forge.v[LM.bfx(S, 'forge').l];
  LM.itemScore = (it) => {
    const f = 1 + 0.08 * it.up; let s = 0; const t = it.st;
    s += (t.atk || 0) * 2 + (t.def || 0) * 2 + (t.hp || 0) * 0.4 + (t.spd || 0) * 1.5 + (t.crit || 0) * 3 + (t.eva || 0) * 3;
    return s * f + it.af.length * 6 + (it.set ? 5 : 0);
  };
  LM.upgradeItem = (S, it) => {
    if (it.up >= LM.maxUp(S)) return LM.maxUp(S) ? 'Upgrade the Forge for more' : 'Build a Forge first';
    const c = LM.upCost(it); if (S.gold < c) return 'Not enough gold'; S.gold -= c; it.up++; return '';
  };
  LM.mergeCost = (rar) => 60 * (rar + 1) * (rar + 1);
  LM.merge = (S, items) => {
    if (items.length !== 3) return { err: 'Pick three items' };
    const rar = items[0].rar; if (items.some((i) => i.rar !== rar)) return { err: 'All three must share a rarity' };
    if (rar >= 4) return { err: 'Legendary is the top' };
    if (LM.bfx(S, 'forge').l < 1) return { err: 'Build a Forge first' };
    const c = LM.mergeCost(rar); if (S.gold < c) return { err: 'Not enough gold' };
    S.gold -= c; const ids = new Set(items.map((i) => i.id));
    S.items = S.items.filter((i) => !ids.has(i.id));
    const out = genItem(rnd, { slot: pick(items).slot, rar: rar + 1, ilvl: Math.max(...items.map((i) => i.ilvl)) + 1 });
    S.items.push(out); LM.note(S, 'merge'); return { item: out };
  };
  LM.reforgeCost = (it) => 90 * it.rar;
  LM.reforge = (S, it) => {
    if (!it.af.length) return 'No affix to reforge'; const c = LM.reforgeCost(it); if (S.gold < c) return 'Not enough gold';
    S.gold -= c; const allowed = D.AFFIX_IDS.filter((a) => D.AFFIX[a].slots.includes(it.slot) && !it.af.some((x) => x.id === a));
    const k = Math.floor(rnd() * it.af.length); const id = pick(allowed); it.af[k] = { id, v: id === 'stalwart' ? 1 : 1 + (rnd() < 0.4 ? 1 : 0) + (it.rar >= 3 && rnd() < 0.3 ? 1 : 0) }; return '';
  };
  LM.addItem = (S, it) => {
    const cap = LM.armoryCap(S); let sold = null;
    if (S.items.length >= cap) { S.items.sort((a, b) => LM.itemScore(a) - LM.itemScore(b)); sold = S.items.shift(); S.gold += LM.sellVal(sold); }
    S.items.push(it); return sold;
  };
  LM.equip = (S, g, it) => {
    const old = g.gear[it.slot]; S.items = S.items.filter((i) => i.id !== it.id); g.gear[it.slot] = it; if (old) S.items.push(old);
  };
  LM.unequip = (S, g, slot) => { const it = g.gear[slot]; if (!it) return; if (S.items.length >= LM.armoryCap(S)) return 'Armory full'; delete g.gear[slot]; S.items.push(it); return ''; };
  LM.autoEquip = (S, g) => {
    D.SLOTS.forEach((slot) => {
      let best = g.gear[slot]; S.items.filter((i) => i.slot === slot).forEach((i) => { if (!best || LM.itemScore(i) > LM.itemScore(best)) best = i; });
      if (best && best !== g.gear[slot]) LM.equip(S, g, best);
    });
  };
  LM.setCounts = (g) => { const c = {}; D.SLOTS.forEach((s) => { const it = g.gear && g.gear[s]; if (it && it.set) c[it.set] = (c[it.set] || 0) + 1; }); return c; };

  // ---------- derived combat stats ----------
  const STANCE = { agg: { atk: 0.15, def: -0.1 }, bal: {}, grd: { def: 0.2, atk: -0.08, spd: -0.05 }, cun: { crit: 0.08, eva: 0.08, hp: -0.05 } };
  LM.STANCES = { bal: 'Balanced', agg: 'Aggressive', grd: 'Guarded', cun: 'Cunning' };
  const BEATS = { agg: 'cun', cun: 'grd', grd: 'agg' };
  LM.stanceBeat = (a, b) => (BEATS[a] === b ? 1 : BEATS[b] === a ? -1 : 0);
  LM.STANCE = STANCE;
  LM.perf = (g) => { const fe = g.en >= 60 ? 1 : 0.85 + (0.15 * g.en) / 60; const fm = 0.95 + (0.1 * g.mo) / 100; return fe * fm; };
  function derive(g, ctx) {
    ctx = ctx || {}; const s = g.st; const m = D.STYLES[g.style].mul; const G0 = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0, eva: 0 }; const fx = {}; const sc = {};
    D.SLOTS.forEach((slot) => {
      const it = g.gear && g.gear[slot]; if (!it) return; const f = 1 + 0.08 * (it.up || 0);
      for (const k in it.st) G0[k] = (G0[k] || 0) + it.st[k] * f;
      it.af.forEach((a) => { fx[a.id] = (fx[a.id] || 0) + a.v; });
      if (it.set) sc[it.set] = (sc[it.set] || 0) + 1;
    });
    if (ctx.xfx) add(fx, ctx.xfx);
    const sets = [];
    for (const id in sc) { const n = sc[id]; if (n >= 2) { add(fx, D.SETS[id].two); sets.push({ id, n: 2 }); } if (n >= 4) { add(fx, D.SETS[id].four); sets.push({ id, n: 4 }); } }
    const T = D.TRAITS[g.trait] || {}; const sy = ctx.syn || {}; const st = STANCE[ctx.stance || 'bal'];
    const pc = (k) => 1 + (fx[k] || 0) + (T[k] || 0) + (sy[k] || 0) + (st[k] || 0);
    const pf = ctx.noperf ? 1 : LM.perf(g);
    const hp = ((50 + s.end * 4.2 + g.lvl * 6) * m.hp + G0.hp) * pc('hp');
    const atk = ((6 + s.str * 0.85 + s.skl * 0.3) * m.atk + G0.atk) * pc('atk') * pf;
    const def = ((s.end * 0.32 + s.skl * 0.08) * m.def + G0.def) * (pc('def') + (fx.plated || 0) * 0.04) * pf;
    const spd = ((30 + s.agi * 0.55) * m.spd + G0.spd) * (pc('spd') + (fx.fleet || 0) * 0.04) * pf;
    const crit = clamp(((4 + s.skl * 0.35) * m.crit + G0.crit) / 100 + (fx.crit || 0) + (sy.crit || 0) + (st.crit || 0) + (T.crit || 0) + (fx.lucky || 0) * 0.03, 0, 0.6);
    const eva = clamp(((s.agi * 0.3) * m.eva + G0.eva) / 100 + (fx.eva || 0) + (sy.eva || 0) + (st.eva || 0), 0, 0.4);
    return { hp, atk, def, spd, crit, eva, fx, sets, pf };
  }
  LM.derive = derive;

  // ---------- team synergies & bonds ----------
  LM.synergy = (styles) => {
    const fx = {}; const list = []; const left = styles.slice();
    if (styles.length >= 2) {
      D.SYN.forEach((sy) => {
        const pool = left.slice(); let ok = true;
        for (const need of sy.need) { const i = pool.indexOf(need); if (i < 0) { ok = false; break; } pool.splice(i, 1); }
        if (ok) { list.push(sy); add(fx, sy.fx); }
      });
      if (styles.length >= 3 && new Set(styles).size === styles.length) { list.push({ n: 'Full Ring', d: '+8% damage, +8% armor' }); add(fx, { atk: 0.08, def: 0.08 }); }
      if (new Set(styles).size === 1) { list.push({ n: 'Brothers in Arms', d: '+6% HP, damage, armor' }); add(fx, { hp: 0.06, atk: 0.06, def: 0.06 }); }
    }
    return { fx, list };
  };
  const bkey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  LM.bond = (S, a, b) => (S.bonds && S.bonds[bkey(a, b)]) || 0;
  LM.addBond = (S, a, b, n) => { S.bonds = S.bonds || {}; const k = bkey(a, b); S.bonds[k] = clamp((S.bonds[k] || 0) + n, 0, 100); };
  LM.teamCtx = (S, glads, stance, vs) => {
    const sy = LM.synergy(glads.map((g) => g.style)); const fx = Object.assign({}, sy.fx);
    if (S && glads.length > 1) { let tot = 0, n = 0; for (let i = 0; i < glads.length; i++) for (let j = i + 1; j < glads.length; j++) { tot += LM.bond(S, glads[i].id, glads[j].id); n++; } const b = (tot / n / 100) * 0.06; fx.atk = (fx.atk || 0) + b; fx.def = (fx.def || 0) + b; }
    const sb = vs ? LM.stanceBeat(stance || 'bal', vs) : 0;
    if (sb > 0) { fx.atk = (fx.atk || 0) + 0.12; fx.crit = (fx.crit || 0) + 0.05; } else if (sb < 0) fx.def = (fx.def || 0) - 0.05;
    return { syn: fx, stance: stance || 'bal', list: sy.list, beat: sb };
  };

  // ---------- combat engine ----------
  const alive = (F, side) => F.units.filter((u) => u.side === side && !u.down);
  function mkUnit(g, side, i, ctx, hpFrac, grudge) {
    const d = derive(g, ctx);
    return {
      id: side + i, side, i, g, name: g.name, style: g.style, tr: D.TRAITS[g.trait] || {},
      maxhp: Math.round(d.hp), hp: Math.max(1, Math.round(d.hp * (hpFrac == null ? 1 : hpFrac))), atk: d.atk, def: d.def, spd: d.spd, crit: d.crit, eva: d.eva, fx: d.fx,
      wil: g.st.wil, gauge: rnd() * 30, techs: (g.techs || []).map((id) => ({ id, cd: 2 + rnd() * 4 })), s: {}, down: false, gritUsed: false, stal: false,
      dmg: 0, taken: 0, crits: 0, grudge: !!grudge, bacc: 0,
    };
  }
  LM.mkUnits = (glads, side, ctx, hpFracs, grudge) => glads.map((g, i) => mkUnit(g, side, i, ctx, hpFracs && hpFracs[i], grudge));
  function createFight(A, B, o) {
    o = o || {};
    return { t: 0, A, B, units: A.concat(B), ev: [], hype: 0, peak: 0, done: false, winner: null, auto: { A: !!o.autoA, B: true }, foc: { A: null, B: null }, quiet: !!o.quiet };
  }
  LM.createFight = createFight;
  const emit = (F, e) => { if (!F.quiet) F.ev.push(e); };
  const other = (s) => (s === 'A' ? 'B' : 'A');
  function setStatus(F, t, key, val, dur) {
    if (t.down) return;
    if (key === 'stun' && rnd() < t.wil * 0.003) { emit(F, { k: 'resist', dst: t.id }); return; }
    t.s[key] = val; emit(F, { k: 'status', dst: t.id, st: key, t: dur });
  }
  function damage(F, t, amt, srcUnit) {
    t.hp -= amt; t.taken += amt;
    if (t.hp <= 0 && !t.down) {
      t.hp = 0; t.down = true; emit(F, { k: 'down', dst: t.id, src: srcUnit && srcUnit.id }); F.hype += 10;
      if (!alive(F, t.side).length) finish(F, other(t.side));
    }
  }
  function finish(F, winner) { if (F.done) return; F.done = true; F.winner = winner; emit(F, { k: 'end', winner }); }
  function heal(F, u, amt) { amt = Math.min(u.maxhp - u.hp, Math.round(amt)); if (amt <= 0) return; u.hp += amt; emit(F, { k: 'heal', dst: u.id, amt }); }
  function pickTarget(F, u, foes) {
    const tn = foes.find((f) => f.s.taunt); if (tn) return tn;
    const fid = F.foc[u.side]; if (fid) { const f = foes.find((x) => x.id === fid); if (f) return f; }
    if (rnd() < 0.55) return foes.reduce((a, b) => (a.hp / a.maxhp <= b.hp / b.maxhp ? a : b));
    return foes[Math.floor(rnd() * foes.length)];
  }
  function strike(F, u, t, o) {
    o = o || {}; if (t.down || u.down) return 0;
    const av = adv(u.style, t.style);
    let hc = 0.93 - t.eva - (u.s.blind ? 0.4 : 0) + (t.s.netted ? 0.12 : 0); hc = clamp(hc, 0.3, 0.97);
    if (rnd() > hc) { emit(F, { k: 'miss', src: u.id, dst: t.id }); return 0; }
    let a = u.atk * (1 + (u.s.frenzy ? u.s.frenzy.atk : 0));
    if (u.fx.fury) a *= 1 + u.fx.fury * 0.1 * (1 - u.hp / u.maxhp);
    const df = t.def * (1 + (t.s.frenzy ? t.s.frenzy.def : 0)) * (1 - (o.ignore || 0));
    let dmg = a * (o.mult || 1) * (0.85 + rnd() * 0.3) * (60 / (60 + Math.max(0, df)));
    dmg *= av > 0 ? 1.25 : av < 0 ? 0.85 : 1;
    if (av < 0 && u.tr.underdog) dmg *= 1 + u.tr.underdog;
    if (u.grudge && u.tr.grudge) dmg *= 1 + u.tr.grudge;
    if (u.fx.exec && t.hp / t.maxhp < 0.35) dmg *= 1 + u.fx.exec * 0.08;
    if (o.exec && t.hp / t.maxhp < o.exec.th) dmg *= o.exec.m / (o.mult || 1);
    const crit = rnd() < clamp(u.crit + (o.critB || 0), 0, 0.8); if (crit) dmg *= 1.6;
    if (t.s.guard) dmg *= 1 - t.s.guard.f;
    dmg = Math.max(1, Math.round(dmg));
    let save = '';
    if (dmg >= t.hp) {
      if (t.fx.stalwart && !t.stal) { t.stal = true; dmg = t.hp - 1; save = 'STALWART'; }
      else if (!t.gritUsed && rnd() < t.wil * 0.004) { t.gritUsed = true; dmg = t.hp - 1; save = 'GRIT'; F.hype += 14; }
    }
    u.dmg += dmg; if (crit) u.crits++;
    emit(F, { k: 'hit', src: u.id, dst: t.id, dmg, crit, adv: av, tech: o.tag, save });
    F.hype += 2 + (dmg / t.maxhp) * 50 + (crit ? 5 : 0);
    damage(F, t, dmg, u);
    if (u.fx.vamp) heal(F, u, dmg * u.fx.vamp * 0.04);
    if (!t.down && ((u.fx.bleed && rnd() < u.fx.bleed * 0.15) || (crit && u.tr.bleedcrit))) { t.s.bleed = { dps: u.atk * 0.1, t: 4 }; emit(F, { k: 'status', dst: t.id, st: 'bleed' }); }
    if (t.fx.thorns && !u.down) { const r = Math.round(dmg * t.fx.thorns * 0.06); if (r > 0) { emit(F, { k: 'thorn', src: t.id, dst: u.id, dmg: r }); damage(F, u, r, t); } }
    if (!o.noRip && !t.down && !u.down && t.fx.riposte && rnd() < t.fx.riposte * 0.08) strike(F, t, u, { mult: 0.7, noRip: true, tag: 'riposte' });
    return dmg;
  }
  function useTech(F, u, k, target) {
    const t = u.techs[k]; const T = D.TECHS[t.id]; if (!T || t.cd > 0 || u.down || F.done) return false;
    t.cd = T.cd; F.hype += 6; emit(F, { k: 'tech', src: u.id, tech: t.id });
    const foes = alive(F, other(u.side)); const allies = alive(F, u.side);
    if (T.tg === 'enemy' && foes.length) {
      const tg = target && !target.down ? target : pickTarget(F, u, foes);
      for (let h = 0; h < (T.hits || 1); h++) strike(F, u, tg, { mult: T.mult, ignore: T.ignore, critB: T.crit, exec: T.exec, tag: t.id });
      if (!tg.down) {
        if (T.stun) setStatus(F, tg, 'stun', T.stun, T.stun);
        if (T.slow) setStatus(F, tg, 'slow', { f: T.slow.f, t: T.slow.t }, T.slow.t);
        if (T.netted) tg.s.netted = T.netted;
        if (T.blind) setStatus(F, tg, 'blind', T.blind, T.blind);
      }
    } else if (T.tg === 'enemies') {
      foes.forEach((f) => strike(F, u, f, { mult: T.mult, tag: t.id }));
    } else if (T.tg === 'self') {
      if (T.heal) heal(F, u, u.maxhp * T.heal);
      if (T.guard) { u.s.guard = { f: T.guard.f, t: T.guard.t }; emit(F, { k: 'status', dst: u.id, st: 'guard' }); }
      if (T.taunt) { u.s.taunt = T.taunt; emit(F, { k: 'status', dst: u.id, st: 'taunt' }); }
      if (T.frenzy) { u.s.frenzy = { atk: T.frenzy.atk, def: T.frenzy.def, t: T.frenzy.t }; emit(F, { k: 'status', dst: u.id, st: 'frenzy' }); }
    } else if (T.tg === 'team') {
      allies.forEach((a) => { a.s.rally = { spd: T.rally.spd, t: T.rally.t }; emit(F, { k: 'status', dst: a.id, st: 'rally' }); });
    }
    return true;
  }
  function aiTech(F, u, foes) {
    const allies = alive(F, u.side); const hpf = u.hp / u.maxhp;
    const order = u.techs.map((_, i) => i).sort(() => rnd() - 0.5);
    for (const k of order) {
      const t = u.techs[k]; const T = D.TECHS[t.id]; if (t.cd > 0) continue;
      if (T.heal && hpf > 0.55) continue;
      if (T.guard && !T.taunt && hpf > 0.7 && rnd() < 0.7) continue;
      if (T.taunt && allies.length < 2) continue;
      if (T.rally && allies.length < 2 && rnd() < 0.7) continue;
      if (T.frenzy && hpf < 0.35) continue;
      if (T.exec && !foes.some((f) => f.hp / f.maxhp < T.exec.th) && rnd() < 0.7) continue;
      if (T.tg === 'enemies' && foes.length < 2 && rnd() < 0.6) continue;
      if (rnd() < 0.8) return k;
    }
    return -1;
  }
  function act(F, u) {
    const foes = alive(F, other(u.side)); if (!foes.length || u.down) return;
    if (F.auto[u.side]) { const k = aiTech(F, u, foes); if (k >= 0) { useTech(F, u, k); return; } }
    strike(F, u, pickTarget(F, u, foes), { mult: 1 });
  }
  function roar(F) {
    F.peak = Math.max(F.peak, F.hype); F.hype = 0;
    const hpf = (s) => { const us = F.units.filter((u) => u.side === s); return us.reduce((a, u) => a + u.hp, 0) / us.reduce((a, u) => a + u.maxhp, 0); };
    const side = hpf('A') <= hpf('B') ? 'A' : 'B';
    alive(F, side).forEach((u) => { u.gauge += 45; u.techs.forEach((t) => { t.cd = Math.max(0, t.cd - 3); }); });
    emit(F, { k: 'roar', side });
  }
  function step(F, dt) {
    if (F.done) return; F.t += dt;
    for (const u of F.units) {
      if (u.down) continue; const s = u.s;
      for (const key in s) { const v = s[key]; if (typeof v === 'number') { s[key] = v - dt; if (s[key] <= 0) delete s[key]; } else { v.t -= dt; if (v.t <= 0) delete s[key]; } }
      if (s.bleed) { u.bacc += s.bleed.dps * dt; if (u.bacc >= 1) { const d = Math.floor(u.bacc); u.bacc -= d; emit(F, { k: 'bleed', dst: u.id, dmg: d }); damage(F, u, d, null); } }
      u.techs.forEach((t) => { t.cd = Math.max(0, t.cd - dt); });
      if (!s.stun) u.gauge += u.spd * (s.slow ? s.slow.f : 1) * (s.rally ? 1 + s.rally.spd : 1) * dt;
    }
    if (F.done) return;
    const ready = F.units.filter((u) => !u.down && u.gauge >= 100).sort((a, b) => b.gauge - a.gauge);
    for (const u of ready) { if (F.done) break; if (u.down) continue; u.gauge -= 100; act(F, u); }
    if (F.hype >= 100 && !F.done) roar(F);
    F.peak = Math.max(F.peak, F.hype);
    if (!F.done && F.t > 140) {
      const hpf = (s) => F.units.filter((u) => u.side === s).reduce((a, u) => a + u.hp / u.maxhp, 0);
      finish(F, hpf('A') >= hpf('B') ? 'A' : 'B');
    }
  }
  LM.step = step;
  LM.useTech = (F, uid_, k, targetId) => {
    const u = F.units.find((x) => x.id === uid_); if (!u || u.down || u.s.stun) return false;
    const tg = targetId ? F.units.find((x) => x.id === targetId) : null;
    const ok = useTech(F, u, k, tg); if (ok) u.gauge = Math.max(0, u.gauge - 25); return ok;
  };
  LM.focus = (F, side, id) => { F.foc[side] = F.foc[side] === id ? null : id; };
  LM.quick = (A, B, o) => {
    const F = createFight(A, B, Object.assign({ autoA: true, quiet: true }, o)); let n = 0; while (!F.done && n++ < 1500) step(F, 0.25); return F;
  };
  // win chance of team A glads vs team B glads, stable seed so the number does not jitter between renders
  LM.odds = (S, gA, gB, stanceA, n, stanceB) => {
    n = n || 36; const keep = rnd; let w = 0; rnd = mulberry(hash(gA.map((g) => g.id + ':' + g.lvl).join() + '|' + gB.map((g) => g.name + g.lvl).join() + (stanceA || '') + (stanceB || '')));
    try {
      const ca = LM.teamCtx(S, gA, stanceA || 'bal', stanceB); const cb = LM.teamCtx(null, gB, stanceB || 'bal', stanceA || 'bal');
      for (let i = 0; i < n; i++) { const F = LM.quick(LM.mkUnits(gA, 'A', ca), LM.mkUnits(gB, 'B', cb)); if (F.winner === 'A') w++; }
    } finally { rnd = keep; }
    return w / n;
  };

  // ---------- rivals, opponents, fixtures ----------
  LM.rivals = (S, league) => {
    const r = mulberry(hash(S.seed + 'riv' + league)); const out = [];
    for (let j = 0; j < 8; j++) {
      out.push({
        id: league + '-' + j, league, name: pick(D.FIRST, r), nick: pick(D.NICK, r), ludus: D.LUDI[(league * 8 + j) % D.LUDI.length], style: D.STYLE_IDS[j % 5],
        skin: pick(D.SKIN, r), hair: pick(D.HAIR, r), plume: pick(D.PLUME, r), face: Math.floor(r() * 3), trait: pick(D.TRAIT_IDS, r), color: pick(D.COLORS, r).c,
      });
    }
    return out;
  };
  LM.rivalById = (S, id) => LM.rivals(S, parseInt(id, 10))[parseInt(id.split('-')[1], 10)];
  function mkOpp(S, rv, lvl, power, r, league, rarShift) {
    const g = makeGlad({ r, style: rv.style, name: rv.name, nick: rv.nick, trait: rv.trait, lvl, q: 0.5, skin: rv.skin, hair: rv.hair, plume: rv.plume, face: rv.face, color: rv.color });
    const S0 = D.STYLES[rv.style]; const sb = D.STATS.reduce((a, s) => a + S0.base[s], 0); const pts = lvl * 4.5 * power;
    D.STATS.forEach((s) => { g.st[s] += (pts * S0.base[s]) / sb; });
    D.SLOTS.forEach((slot) => {
      if (r() < 0.55 + 0.1 * league) {
        let rar = rollRar(r, league, 0); if (rarShift && r() < 0.35) rar = Math.min(4, rar + 1);
        g.gear[slot] = genItem(r, { slot, rar, ilvl: Math.max(1, lvl - 1) });
      }
    });
    g.rv = rv.id; g.lud = rv.ludus; g.id = 'o' + rv.id + ':' + lvl; return g;
  }
  LM.mkOpp = mkOpp;
  const SIZE_T = { tourney: 4, grand: 8 };
  LM.events = (S, week, league) => {
    const L = D.LEAGUES[league]; const season = Math.ceil(week / 12); const r = mulberry(hash(S.seed + '|' + week + '|' + league));
    const riv = LM.rivals(S, league); const used = new Set();
    const take = () => { let i; let guard = 0; do { i = Math.floor(r() * riv.length); } while (used.has(i) && guard++ < 30); used.add(i); return riv[i]; };
    const baseLvl = (d) => L.lvl + d + (season - 1) * 2 + Math.floor(((week - 1) % 12) / 4);
    const sm = 1 + 0.2 * (season - 1); const out = [];
    for (let d = 0; d < 3; d++) {
      const DF = D.DIFF[d]; const rv = take(); let opp = mkOpp(S, rv, baseLvl(DF.l), DF.p, r, league, d === 2);
      const gh = (S.ghosts || []);
      const ghosted = d === 2 && league >= 1 && gh.length && r() < 0.5; if (ghosted) opp = LM.ghostOpp(S, gh[Math.floor(r() * gh.length)], baseLvl(DF.l));
      const purse = Math.round(L.purse * DF.m * sm * (ghosted ? 1.5 : 1));
      out.push({ key: `${week}:${league}:d${d}`, kind: 'duel', week, league, diff: d, title: `${DF.n} Duel`, size: 1, opps: [opp], purse, fame: Math.round(L.fameWin * DF.m), fee: Math.round(purse * 0.12) });
    }
    const field = (n, bonus) => { const a = []; for (let i = 0; i < n; i++) { const rv = take(); a.push(mkOpp(S, rv, baseLvl(1) + bonus, 1.05, r, league, true)); } return a; };
    if (week % 12 === 0) {
      const purse = Math.round(L.purse * 8 * sm);
      out.push({ key: `${week}:${league}:g`, kind: 'grand', week, league, title: league === 3 ? 'IMPERIAL GAMES' : 'Grand Games', size: 8, opps: field(7, 2), purse, fame: Math.round(L.fameWin * 7), fee: Math.round(purse * 0.1), loot: 3 });
    } else if (week % 4 === 0) {
      const purse = Math.round(L.purse * 4 * sm);
      out.push({ key: `${week}:${league}:t`, kind: 'tourney', week, league, title: 'Tournament', size: 4, opps: field(3, 1), purse, fame: Math.round(L.fameWin * 3.2), fee: Math.round(purse * 0.1), loot: 3 });
    }
    if (week % 4 === 2) {
      const n = league >= 2 ? 3 : 2; const purse = Math.round(L.purse * 2.5 * sm);
      out.push({ key: `${week}:${league}:m`, kind: 'team', week, league, title: `Team Clash ${n}v${n}`, size: n, opps: field(n, 0), purse, fame: Math.round(L.fameWin * 2.2), fee: Math.round(purse * 0.12) });
    }
    return out;
  };
  LM.eventByKey = (S, key) => { const [w, l] = key.split(':'); return LM.events(S, parseInt(w, 10), parseInt(l, 10)).find((e) => e.key === key); };
  LM.teamSize = (ev) => (ev.kind === 'team' ? ev.size : 1);
  LM.isRevenge = (S, ev) => ev.kind === 'duel' && S.rivals && S.rivals[ev.opps[0].rv] && S.rivals[ev.opps[0].rv].last === 'l';


  // ---------- rival habits (stance tells) ----------
  LM.habit = (opp) => {
    const r = mulberry(hash('habit' + (opp.rv || opp.name))); const fav = ['agg', 'grd', 'cun', 'bal'][Math.floor(r() * 4)];
    return { fav, p: 0.5 + r() * 0.25 };
  };
  LM.oppStance = (S, opp, r) => {
    r = r || rnd; if (!opp.rv) return pick(['agg', 'grd', 'cun', 'bal'], r);
    const h = LM.habit(opp); if (r() < h.p) return h.fav; return pick(['agg', 'grd', 'cun', 'bal'].filter((x) => x !== h.fav), r);
  };
  LM.noteStance = (S, opp, st) => { if (!opp.rv) return; S.rivals = S.rivals || {}; const r0 = S.rivals[opp.rv] || (S.rivals[opp.rv] = { w: 0, l: 0, last: '' }); r0.seen = r0.seen || {}; r0.seen[st] = (r0.seen[st] || 0) + 1; r0.lastSt = st; };
  LM.expectedStance = (S, opp) => (opp.rv ? LM.habit(opp).fav : 'bal');

  // ---------- the bookmaker: public odds know level and style only ----------
  LM.publicOdds = (gl, opps) => {
    const avg = (a) => a.reduce((x, g) => x + g.lvl, 0) / a.length;
    const ad = gl.length === 1 && opps.length === 1 ? LM.adv(gl[0].style, opps[0].style) : 0;
    return clamp(0.5 + 0.04 * (avg(gl) - avg(opps)) + 0.12 * ad, 0.08, 0.92);
  };
  LM.wagerMult = (gl, opps) => Math.round(clamp(0.93 / LM.publicOdds(gl, opps), 1.1, 8) * 10) / 10;
  LM.wagerOptions = (S) => [0.1, 0.25, 0.5].map((f) => Math.min(Math.round(S.gold * f), 2000)).filter((v) => v >= 5);

  // ---------- Pit of Trials ----------
  LM.pitOpp = (S, floor, g) => {
    const boss = floor % 5 === 0; const lvl = Math.max(1, Math.round(g.lvl * 0.75 + floor * 1.1 + (boss ? 3 : 0)));
    const style = pick(D.STYLE_IDS); const ml = LM.maxLeague(S);
    const rv = { id: null, name: pick(D.FIRST), nick: boss ? 'the Pit Lord' : pick(D.NICK), ludus: 'The Pit', style, skin: pick(D.SKIN), hair: pick(D.HAIR), plume: pick(D.PLUME), face: Math.floor(rnd() * 3), trait: pick(D.TRAIT_IDS), color: pick(D.COLORS).c };
    const o = mkOpp(S, rv, lvl, 0.78 + floor * 0.045 + (boss ? 0.15 : 0), rnd, Math.min(3, ml), boss);
    o.rv = null; o.id = 'pit' + floor; return o;
  };
  LM.pitPick = (S, have) => {
    const pool = D.BOONS.slice(); const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };
  LM.boonCtx = (boons) => {
    const syn = {}, xfx = {};
    boons.forEach((b) => { if (b.syn) add(syn, b.syn); if (b.xfx) add(xfx, b.xfx); });
    return { syn, xfx };
  };
  LM.pitReward = (S, floor, boons, lost) => {
    const ml = LM.maxLeague(S); const L0 = D.LEAGUES[ml];
    let gold = 0, fame = 0; for (let f = 1; f <= floor; f++) { gold += L0.purse * 0.3 * (1 + f * 0.18); fame += Math.round(L0.fameWin * 0.25 * (1 + f * 0.1)); }
    gold *= 1 + boons.reduce((a, b) => a + (b.gold || 0), 0); gold *= 1 + 0.1 * ((S.perks || {}).gold || 0);
    if (lost) { gold *= 0.5; fame = Math.round(fame * 0.5); }
    const items = []; const n = Math.floor(floor / 3);
    for (let i = 0; i < n; i++) items.push(genItem(rnd, { league: ml, ilvl: 2 + ml * 5 + floor, luck: 0.04 * floor + LM.bfx(S, 'shrine').v }));
    if (floor >= 5 && !lost) items.push(genItem(rnd, { league: Math.min(3, ml + 1), ilvl: 3 + ml * 5 + floor, rar: Math.min(4, 2 + (floor >= 10 ? 1 : 0)) }));
    return { gold: Math.round(gold), fame: Math.round(fame), items };
  };

  // ---------- legacy ghosts (your old champions come back as rivals) ----------
  LM.ghostOpp = (S, ghost, lvl) => {
    const g = JSON.parse(JSON.stringify(ghost)); const f = Math.min(1, lvl / Math.max(1, g.lvl));
    D.STATS.forEach((s) => { g.st[s] *= f; }); g.lvl = Math.min(g.lvl, lvl); g.rv = null; g.gh = true; g.color = '#7d7d8c'; g.id = 'gh' + ghost.name + g.lvl;
    D.SLOTS.forEach((sl) => { if (g.gear[sl] && g.gear[sl].rar > 2) delete g.gear[sl]; });
    g.inj = 0; g.en = 100; g.mo = 80; return g;
  };

  // ---------- scouting (fog of war) ----------
  // 0: style + level only. 1: stat grades + trait. 2: exact numbers, techs, gear, win odds. 3: affixes/sets, derived stats, AI habits.
  LM.fogNote = ['Style and level only', 'Stat grades and trait', 'Exact stats, gear, techs, win odds', 'Everything, incl. gear effects and habits'];

  // ---------- entering events ----------
  LM.healthy = (g) => g.inj <= 0;
  LM.entryFor = (S, key) => S.entries[key];
  LM.busy = (S, g, week) => Object.keys(S.entries).some((k) => k.split(':')[0] === String(week) && S.entries[k].ids.includes(g.id));
  LM.enter = (S, ev, ids, stance) => {
    if (S.entries[ev.key]) return 'Already entered';
    if (S.fame < D.LEAGUES[ev.league].fame) return 'League locked';
    if (ids.length !== LM.teamSize(ev) && ev.kind !== 'tourney' && ev.kind !== 'grand') return 'Wrong team size';
    if (S.gold < ev.fee) return 'Not enough gold for the entry fee';
    for (const id of ids) { const g = S.glads.find((x) => x.id === id); if (!g || g.inj > 0) return 'A fighter is injured'; if (LM.busy(S, g, ev.week)) return 'A fighter is already entered that week'; }
    S.gold -= ev.fee; S.entries[ev.key] = { ids, stance: stance || 'bal', paid: ev.fee }; return '';
  };
  LM.withdraw = (S, key) => { const e = S.entries[key]; if (!e) return; S.gold += e.paid; delete S.entries[key]; };

  // ---------- tournaments ----------
  LM.tourneyInit = (S, ev, g) => ({ key: ev.key, size: ev.size, slots: [g].concat(ev.opps), alive: Array.from({ length: ev.size }, (_, i) => i), round: 0, hpf: 1, won: 0 });
  LM.tourneyOpp = (T) => { const mi = T.alive.indexOf(0); return T.slots[T.alive[mi ^ 1]]; };
  LM.tourneyPairs = (T) => { const p = []; for (let i = 0; i < T.alive.length; i += 2) p.push([T.alive[i], T.alive[i + 1]]); return p; };
  LM.tourneyAdvance = (S, T, iWon) => {
    const next = [];
    LM.tourneyPairs(T).forEach(([a, b]) => {
      if (a === 0 || b === 0) { if (iWon) next.push(0); else next.push(a === 0 ? b : a); return; }
      const F = LM.quick(LM.mkUnits([T.slots[a]], 'A', { noperf: true }), LM.mkUnits([T.slots[b]], 'B', { noperf: true }), { autoA: true });
      next.push(F.winner === 'A' ? a : b);
    });
    T.round++; T.alive = next; return { over: !iWon || next.length === 1, champion: iWon && next.length === 1 };
  };
  // finishing place after elimination in the round just played (T.round already advanced)
  LM.placeOf = (T, champion) => (champion ? 1 : (T.size >> (T.round - 1)) / 2 + 1);

  // ---------- settlement ----------
  LM.legendTrain = (S, stat) => {
    const slots = Math.round(LM.bfx(S, 'hall').v); let m = 1;
    (S.legends || []).slice(0, slots).forEach((l) => { m += 0.015 + (l.best === stat ? 0.03 : 0); }); return m;
  };
  LM.settle = (S, ev, glads, res) => {
    const rep = { gold: 0, fame: 0, xp: [], inj: [], lvl: [], loot: [], choice: null, notes: [], place: res.place || 0 };
    let gold = 0, fame = 0;
    if (ev.kind === 'tourney' || ev.kind === 'grand') {
      const p = res.place; const frac = p === 1 ? 1 : p === 2 ? 0.35 : p <= 4 ? 0.1 : 0; gold = ev.purse * frac; fame = ev.fame * (p === 1 ? 1 : p === 2 ? 0.45 : p <= 4 ? 0.2 : 0.06);
    } else if (res.win) { gold = ev.purse; fame = ev.fame; } else { gold = ev.purse * 0.1; fame = ev.fame * 0.2; }
    if (ev.kind === 'duel' && res.win && LM.isRevenge(S, ev)) { gold *= 1.25; fame *= 1.25; rep.notes.push('Revenge bonus +25%'); }
    fame *= 0.85 + Math.min(res.hype || 0, 100) / 300;
    let ft = 0; glads.forEach((g) => { ft += (D.TRAITS[g.trait].fame || 0); ['weapon', 'shield', 'armor', 'helm', 'charm'].forEach((s) => { const it = g.gear[s]; if (it) it.af.forEach((a) => { if (a.id === 'showy') ft += 0.1 * a.v; }); }); });
    fame *= 1 + ft / glads.length;
    const perks = S.perks || {}; gold *= 1 + 0.1 * (perks.gold || 0) + (res.win || res.place ? LM.bfx(S, 'stands').v : 0); fame *= 1 + (res.win ? LM.bfx(S, 'stands').v * 0.5 : 0);
    gold = Math.round(gold); fame = Math.round(fame); S.gold += gold; S.fame += fame; rep.gold = gold; rep.fame = fame;
    const oppLvl = Math.max(...ev.opps.map((o) => o.lvl));
    const big = ev.kind === 'tourney' || ev.kind === 'grand' ? 1.6 : 1;
    glads.forEach((g) => {
      const win = res.win; const xp = Math.round((win ? 24 + oppLvl * 5 : 12 + oppLvl * 2) * big);
      const up = LM.addXp(g, xp); rep.xp.push({ id: g.id, xp, up }); if (up.length) rep.lvl.push({ id: g.id, to: up[up.length - 1] });
      if (win) { g.rec.w++; g.mo = clamp(g.mo + 10, 0, 100); } else { g.rec.l++; g.mo = clamp(g.mo - 8, 0, 100); }
      g.fame += Math.round(fame / glads.length); g.en = clamp(g.en - 25, 0, 100);
      const hpf = res.hpf && res.hpf[g.id] != null ? res.hpf[g.id] : win ? 0.6 : 0.2;
      let ic = (win ? 0.05 : 0.18) + (hpf < 0.25 ? 0.12 : 0); ic *= 1 - 0.12 * LM.bfx(S, 'infirmary').l;
      if (rnd() < ic) { g.inj = 1 + Math.floor(rnd() * 3); rep.inj.push({ id: g.id, w: g.inj }); }
    });
    for (let i = 0; i < glads.length; i++) for (let j = i + 1; j < glads.length; j++) LM.addBond(S, glads[i].id, glads[j].id, 4);
    const luck = LM.bfx(S, 'shrine').v + (perks.luck || 0) * 0.05 + glads.reduce((a, g) => a + (D.TRAITS[g.trait].luck || 0), 0) / glads.length;
    const lootLvl = Math.max(1, oppLvl);
    const rolloot = () => genItem(rnd, { league: ev.league, ilvl: lootLvl, luck });
    if (ev.loot && res.place === 1) rep.choice = [rolloot(), rolloot(), rolloot()];
    else if (res.win && rnd() < 0.3 + 0.1 * (ev.diff || 0)) rep.loot.push(rolloot());
    rep.loot.forEach((it) => { const sold = LM.addItem(S, it); if (sold) rep.notes.push(`Armory full: sold ${sold.name}`); });
    // rivals head-to-head
    ev.opps.forEach((o) => { if (!o.rv) return; S.rivals = S.rivals || {}; const r0 = S.rivals[o.rv] || { w: 0, l: 0, last: '' }; if (res.win || res.place === 1) { r0.w++; r0.last = 'w'; } else { r0.l++; r0.last = 'l'; } S.rivals[o.rv] = r0; });
    const wonAny = res.win || res.place === 1;
    S.stats.fights++; if (wonAny) S.stats.wins++; else S.stats.losses++;
    if (wonAny) { LM.note(S, 'win', { styles: glads.map((g) => g.style), kind: ev.kind }); if (ev.kind === 'tourney' || ev.kind === 'grand') { S.stats.tourneys++; LM.note(S, 'tourney'); if (ev.kind === 'grand' && ev.league === 3) S.flags.imperial = true; } if (ev.kind === 'team') LM.note(S, 'team'); if (res.odds != null && res.odds < 0.4) LM.note(S, 'upset'); }
    return rep;
  };
  LM.mercy = (S, ev, rep, choice) => {
    if (choice === 'mercy') {
      const f = Math.round(rep.fame * 0.2) + 2; S.fame += f; rep.fame += f; S.stats.spares++; LM.note(S, 'mercy');
      const o = ev.opps[0]; const cap = LM.rosterCap(S);
      if (ev.kind === 'duel' && S.glads.length < cap && rnd() < 0.3) {
        const g = JSON.parse(JSON.stringify(o)); g.id = S.nextId++; g.act = 'rest'; g.en = 100; g.mo = 80; g.inj = 0; g.rv = null; g.color = null; g.rec = { w: 0, l: 0 }; g.fame = 0; S.glads.push(g); return { f, joined: g };
      }
      return { f };
    }
    const gd = Math.round(rep.gold * 0.2) + 5; S.gold += gd; rep.gold += gd; return { gd };
  };

  // ---------- weekly economy ----------
  LM.menuOk = (S, m) => D.BUILD.kitchen.v[LM.bfx(S, 'kitchen').l] >= m.k;
  LM.upkeep = (S) => S.glads.reduce((a, g) => a + Math.round((6 + g.lvl * 0.8) * (1 + (D.TRAITS[g.trait].upkeep || 0))), 0);
  LM.weeklyIncome = (S) => Math.round(LM.bfx(S, 'market').v);
  LM.activity = (g) => D.ACTS.find((a) => a.id === g.act) || D.ACTS[5];
  LM.weekTrain = (S) => {
    const rep = { lines: [], work: 0, menuCost: 0 };
    const menu = D.MENUS.find((m) => m.id === S.menu) || D.MENUS[0];
    let m = LM.menuOk(S, menu) ? menu : D.MENUS[0];
    const cost = m.c * S.glads.length; if (S.gold >= cost) { S.gold -= cost; rep.menuCost = cost; } else m = D.MENUS[0];
    const ring = LM.bfx(S, 'sparring'); const pal = 1 + LM.bfx(S, 'palaestra').v; const bath = LM.bfx(S, 'bath').v; const inf = LM.bfx(S, 'infirmary').v;
    const sparrers = [];
    S.glads.forEach((g) => {
      let act = LM.activity(g); const T = D.TRAITS[g.trait]; const line = { id: g.id, name: g.name, act: act.id, txt: '' };
      if (g.inj > 0) { act = D.ACTS[5]; line.txt = `Injured (${g.inj}w left), resting.`; g.inj = Math.max(0, g.inj - (1 + Math.floor(inf))); }
      if (act.t === 'train' && g.en < 5) { act = D.ACTS[5]; line.txt = 'Too tired to train, rested instead.'; }
      if (act.t === 'train') {
        const s = act.s; const base = 2.2 + rnd() * 1.6; const tal = 0.7 + 0.15 * g.tal[s];
        const food = 1 + (m.bon[s] || 0) + (m.bon.all || 0); const mood = 0.9 + (0.2 * g.mo) / 100; const enm = g.en < 25 ? 0.5 : 1;
        let gain = base * tal * pal * food * (1 + (T.train || 0)) * mood * enm * LM.legendTrain(S, s) * (1 + 0.08 * ((S.perks || {}).train || 0));
        if (g.st[s] >= LM.cap(g)) { gain *= 0.2; line.txt = 'At the level cap, fight to grow further. '; }
        g.st[s] += gain; g.en = clamp(g.en - Math.round(22 * (1 - (T.tire || 0))), 0, 100); g.mo = clamp(g.mo - 1, 0, 100);
        line.txt += `+${gain.toFixed(1)} ${D.SA[s]}`; line.gain = gain; line.stat = s;
      } else if (act.t === 'spar') {
        const xp = ring.l ? Math.round(ring.v) : 4; const up = LM.addXp(g, xp); g.st.skl += 0.4; g.en = clamp(g.en - 18, 0, 100);
        line.txt = `Sparred: +${xp} XP${up.length ? ', LEVEL ' + up[up.length - 1] + '!' : ''}`; sparrers.push(g);
      } else if (act.t === 'work') {
        const gd = Math.round((25 + g.lvl * 4) * (1 + 0.1 * ((S.perks || {}).gold || 0))); S.gold += gd; rep.work += gd; g.en = clamp(g.en - 28, 0, 100); g.mo = clamp(g.mo - 3, 0, 100); line.txt = `Odd jobs: +${gd} gold`;
      } else if (act.t === 'rest') {
        g.en = clamp(g.en + 45 + bath, 0, 100); g.mo = clamp(g.mo + 3, 0, 100); if (!line.txt) line.txt = 'Rested';
      }
      g.en = clamp(g.en + 18 + (T.regen || 0) + (m.en || 0), 0, 100); g.mo = clamp(g.mo + (m.mo || 0), 0, 100);
      rep.lines.push(line);
    });
    for (let i = 0; i < sparrers.length; i++) for (let j = i + 1; j < sparrers.length; j++) LM.addBond(S, sparrers[i].id, sparrers[j].id, 3);
    return rep;
  };
  LM.dueKeys = (S) => Object.keys(S.entries).filter((k) => k.split(':')[0] === String(S.week));
  LM.weekFinish = (S) => {
    const rep = { upkeep: 0, income: 0, notes: [], season: null };
    const up = LM.upkeep(S); const paid = Math.min(S.gold, up); S.gold -= paid; rep.upkeep = paid;
    if (paid < up) { S.glads.forEach((g) => { g.mo = clamp(g.mo - 10, 0, 100); }); rep.notes.push('You could not pay the full upkeep. Morale dropped.'); }
    const inc = LM.weeklyIncome(S); S.gold += inc; rep.income = inc;
    const sh = LM.bfx(S, 'shrine'); if (sh.l) { const f = Math.round(sh.v * 60); S.fame += f; if (f) rep.notes.push(`The shrine drew ${f} fame.`); }
    Object.keys(S.entries).forEach((k) => { if (parseInt(k.split(':')[0], 10) <= S.week) delete S.entries[k]; });
    S.week++; S.stats.weeks++;
    if ((S.week - 1) % 12 === 0) { S.season = Math.ceil(S.week / 12); rep.season = S.season; }
    S.market = null; S.recruits = null;
    LM.fillContracts(S);
    rep.ev = LM.rollEvent(S);
    return rep;
  };

  // ---------- recruits & market ----------
  LM.genRecruit = (S) => {
    const eye = ((S.perks || {}).eye || 0) * 0.08; const ml = LM.maxLeague(S); const lvl = 1 + Math.floor(ml * 3.2 + rnd() * 2);
    const g = makeGlad({ lvl, q: clamp(rnd() * 0.85 + eye, 0, 1), id: S.nextId++ });
    g.act = 'rest'; g.cost = Math.round(70 + LM.stars(g) * 45 + lvl * 38); return g;
  };
  LM.ensureShops = (S) => {
    if (!S.recruits) S.recruits = [LM.genRecruit(S), LM.genRecruit(S), LM.genRecruit(S)];
    if (!S.market) LM.rerollMarket(S);
  };
  LM.rerollMarket = (S) => {
    const ml = LM.maxLeague(S); const luck = LM.bfx(S, 'shrine').v + ((S.perks || {}).luck || 0) * 0.05;
    S.market = []; for (let i = 0; i < 6; i++) S.market.push(genItem(rnd, { league: ml, ilvl: 2 + ml * 5 + Math.floor(S.week / 6), luck }));
  };
  LM.hire = (S, g) => {
    if (S.glads.length >= LM.rosterCap(S)) return 'Barracks full'; if (S.gold < g.cost) return 'Not enough gold';
    S.gold -= g.cost; S.recruits = S.recruits.filter((x) => x !== g); delete g.cost; S.glads.push(g); return '';
  };
  LM.buyItem = (S, it) => {
    const p = LM.buyVal(S, it); if (S.gold < p) return 'Not enough gold'; S.gold -= p; S.market = S.market.filter((x) => x !== it); LM.addItem(S, it); return '';
  };
  LM.sellItem = (S, it) => { S.items = S.items.filter((x) => x.id !== it.id); S.gold += LM.sellVal(it); };
  LM.retrain = (S, g, style) => { const c = 60 + g.lvl * 15; if (S.gold < c) return 'Not enough gold'; S.gold -= c; g.style = style; g.techs = [D.STYLES[style].sig].concat(g.techs.slice(1)); g.mo = clamp(g.mo - 10, 0, 100); return ''; };
  LM.retrainCost = (g) => 60 + g.lvl * 15;
  LM.release = (S, g) => {
    D.SLOTS.forEach((s) => { if (g.gear[s]) S.items.push(g.gear[s]); }); S.glads = S.glads.filter((x) => x !== g);
    Object.keys(S.entries).forEach((k) => { if (S.entries[k].ids.includes(g.id)) LM.withdraw(S, k); });
  };
  LM.retire = (S, g) => {
    if (g.lvl < 8) return 'Needs level 8';
    const best = D.STATS.reduce((a, s) => (g.st[s] > g.st[a] ? s : a), 'str');
    S.legends = S.legends || []; S.legends.push({ name: g.name, nick: g.nick, style: g.style, lvl: g.lvl, best, w: g.rec.w, l: g.rec.l, skin: g.skin, hair: g.hair, plume: g.plume, face: g.face });
    LM.release(S, g); return '';
  };

  // ---------- contracts ----------
  LM.fillContracts = (S) => {
    S.contracts = S.contracts || [];
    while (S.contracts.length < 3) {
      const ml = LM.maxLeague(S); const T = pick(D.CONTRACT.filter((t) => !S.contracts.some((c) => c.id === t.id)));
      if (!T) break;
      let n = pick(T.n); let arg = null;
      if (T.id === 'level') n = Math.max(3, Math.max(0, ...S.glads.map((g) => g.lvl)) + 2);
      if (T.id === 'winstyle') arg = pick(D.STYLE_IDS);
      const rew = { gold: Math.round((60 + 50 * ml * ml) * (0.8 + rnd() * 0.5)), fame: Math.round(6 + 10 * ml), item: rnd() < 0.3 ? genItem(rnd, { league: ml, ilvl: 2 + ml * 5, luck: 0.1 }) : null };
      S.contracts.push({ id: T.id, n, arg, p: 0, rew, done: false });
    }
  };
  LM.contractText = (c) => D.CONTRACT.find((t) => t.id === c.id).t(c.n, c.arg);
  LM.note = (S, type, data) => {
    (S.contracts || []).forEach((c) => {
      if (c.done) return;
      if (c.id === 'win' && type === 'win') c.p++;
      else if (c.id === 'winstyle' && type === 'win' && data.styles.includes(c.arg)) c.p++;
      else if (c.id === 'tourney' && type === 'tourney') c.p++;
      else if (c.id === 'upset' && type === 'upset') c.p++;
      else if (c.id === 'mercy' && type === 'mercy') c.p++;
      else if (c.id === 'merge' && type === 'merge') c.p++;
      else if (c.id === 'team' && type === 'team') c.p++;
      if (c.p >= c.n) c.done = true;
    });
  };
  LM.contractProgress = (S, c) => {
    if (c.id === 'level') return Math.max(0, ...S.glads.map((g) => g.lvl));
    if (c.id === 'epic') return S.items.concat(...S.glads.map((g) => D.SLOTS.map((s) => g.gear[s]).filter(Boolean))).some((i) => i.rar >= 3) ? 1 : 0;
    return c.p;
  };
  LM.claimContract = (S, i) => {
    const c = S.contracts[i]; if (!c) return null; if (LM.contractProgress(S, c) < c.n) return null;
    S.gold += c.rew.gold; S.fame += c.rew.fame; if (c.rew.item) LM.addItem(S, c.rew.item);
    S.contracts.splice(i, 1); LM.fillContracts(S); S.stats.contracts++; return c;
  };

  // ---------- random events ----------
  const rg = (S, pred) => { const a = S.glads.filter(pred || (() => true)); return a.length ? pick(a) : null; };
  LM.EVENTS = {
    patron: {
      t: 'A wealthy senator wants a private show at his villa.',
      c: [{ l: 'Send a fighter', run: (S) => { const g = rg(S, (x) => x.inj <= 0); if (!g) return 'Nobody was healthy enough.'; const gd = 80 * (1 + LM.maxLeague(S)) + 40; g.en = clamp(g.en - 25, 0, 100); S.gold += gd; return `${g.name} performed and earned ${gd} gold.`; } }, { l: 'Decline politely', run: () => 'The senator shrugs.' }],
    },
    brawl: {
      t: 'A brawl breaks out in the barracks!',
      c: [{ l: 'Break it up', run: (S) => { S.glads.forEach((g) => { g.en = clamp(g.en - 8, 0, 100); g.mo = clamp(g.mo + 3, 0, 100); }); return 'Order restored. Everyone is a bit tired.'; } },
        { l: 'Let them settle it', run: (S) => { if (S.glads.length < 2) return 'Nobody to brawl.'; const a = rg(S); const b = rg(S, (x) => x !== a); LM.addBond(S, a.id, b.id, 12); if (rnd() < 0.5) a.inj = 1; return `${a.name} and ${b.name} are tighter now${a.inj ? ', but ' + a.name + ' is hurt' : ''}.`; } }],
    },
    trainer: {
      t: 'A wandering trainer offers a private lesson.',
      c: [{ l: 'Pay 60 gold', run: (S) => { if (S.gold < 60) return 'You cannot afford it.'; const g = rg(S); const s = pick(D.STATS); S.gold -= 60; g.st[s] += 4; return `${g.name} gained +4 ${D.SA[s]}.`; } }, { l: 'Not today', run: () => 'The trainer wanders off.' }],
    },
    spoiled: {
      t: 'The barley delivery is spoiled.',
      c: [{ l: 'Buy fresh lentils (40g)', run: (S) => { if (S.gold < 40) { S.glads.forEach((g) => { g.en = clamp(g.en - 15, 0, 100); }); return 'No gold. Everyone eats it and feels rough.'; } S.gold -= 40; return 'Fresh lentils saved the week.'; } },
        { l: 'Eat it anyway', run: (S) => { S.glads.forEach((g) => { g.en = clamp(g.en - 15, 0, 100); }); return 'Everyone lost 15 energy.'; } }],
    },
    spy: {
      t: 'You catch a rival ludus spy sketching your fighters.',
      c: [{ l: 'Parade them through town', run: (S) => { S.fame += 12; return '+12 fame.'; } }, { l: 'Let them go', run: () => 'They tip their hat.' }],
    },
    coins: { t: 'You find a pouch of coins under a practice dummy.', c: [{ l: 'Keep it', run: (S) => { const gd = 30 + 25 * LM.maxLeague(S); S.gold += gd; return `+${gd} gold.`; } }] },
    festival: {
      t: 'The town is holding a festival.',
      c: [{ l: 'Host a feast (50g)', run: (S) => { if (S.gold < 50) return 'You cannot afford a feast.'; S.gold -= 50; S.fame += 20; S.glads.forEach((g) => { g.mo = clamp(g.mo + 10, 0, 100); }); return '+20 fame, morale up.'; } }, { l: 'Skip it', run: () => 'A quiet week.' }],
    },
    veteran: {
      t: 'An old veteran offers to coach for a meal.',
      c: [{ l: 'Welcome them', run: (S) => { const g = rg(S); const up = LM.addXp(g, 40); return `${g.name} learned a lot (+40 XP)${up.length ? ', LEVEL ' + up[up.length - 1] + '!' : ''}.`; } }, { l: 'Send away', run: () => 'They shrug and leave.' }],
    },
  };
  LM.rollEvent = (S) => {
    if (S.week < 3 || S.glads.length === 0 || rnd() > 0.35) return null;
    const id = pick(Object.keys(LM.EVENTS)); S.pendingEv = id; return id;
  };
  LM.runEvent = (S, i) => { const E = LM.EVENTS[S.pendingEv]; S.pendingEv = null; return E ? E.c[i].run(S) : ''; };

  // ---------- ascension (new ludus) ----------
  LM.laurelsFor = (S) => Math.floor(Math.sqrt(S.fame) / 3) + (S.flags.imperial ? 5 : 0) + (S.legends || []).length;
  LM.perkCost = (S, p) => 1 + ((S.perks || {})[p.id] || 0);
  LM.buyPerk = (S, id) => { const p = D.PERKS.find((x) => x.id === id); const lv = (S.perks[id] || 0); if (lv >= p.max) return 'Max'; const c = LM.perkCost(S, p); if (S.laurels < c) return 'Not enough laurels'; S.laurels -= c; S.perks[id] = lv + 1; return ''; };
  LM.canAscend = (S) => S.fame >= 1800 || S.flags.imperial;
  LM.ascend = (S) => {
    const gain = LM.laurelsFor(S); const keep = { perks: S.perks, laurels: S.laurels + gain, legends: S.legends, name: S.name, color: S.color, ascensions: (S.ascensions || 0) + 1, sound: S.sound, flags: { tutor: true }, stats: Object.assign({}, S.stats) };
    const N = LM.newGame({ name: keep.name, color: keep.color, perks: keep.perks, laurels: keep.laurels, legends: keep.legends, ascensions: keep.ascensions, sound: keep.sound });
    N.stats = keep.stats;
    const snap = S.glads.concat(S.ghosts || []).filter((g) => g.st).sort((a, b) => b.lvl - a.lvl).slice(0, 6).map((g) => { const c = JSON.parse(JSON.stringify(g)); c.lud = 'Ghost of ' + S.name; c.act = 'rest'; return c; });
    N.ghosts = snap; return N;
  };

  // ---------- state ----------
  LM.newGame = (o) => {
    o = o || {}; const perks = o.perks || {};
    const S = {
      v: 1, name: o.name || 'Ludus Maximus', color: o.color || 0, seed: Math.floor(rnd() * 1e9).toString(36), week: 1, season: 1,
      gold: 250 + 150 * (perks.start || 0), fame: 0, laurels: o.laurels || 0, perks, rows: 2, plots: new Array(16).fill(null), glads: [], nextId: 1, items: [],
      entries: {}, menu: 'barley', rivals: {}, contracts: [], legends: o.legends || [], bonds: {}, market: null, recruits: null, pendingEv: null,
      stats: { fights: 0, wins: 0, losses: 0, tourneys: 0, spares: 0, weeks: 0, contracts: 0 }, flags: o.flags || {}, ascensions: o.ascensions || 0, sound: o.sound !== false,
    };
    S.plots[6] = { b: 'kitchen', l: 1 }; S.plots[5] = { b: 'barracks', l: 1 + Math.min(1, perks.start || 0) }; S.plots[2] = { b: 'palaestra', l: 1 };
    LM.fillContracts(S); LM.ensureShops(S); return S;
  };
  const KEY = 'ludus_maximus_v1';
  LM.save = (S) => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be blocked */ } };
  LM.load = () => { try { const t = localStorage.getItem(KEY); if (!t) return null; const S = JSON.parse(t); return S && S.v === 1 ? S : null; } catch (e) { return null; } };
  LM.wipe = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  LM.exportCode = (S) => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  LM.importCode = (t) => { try { const S = JSON.parse(decodeURIComponent(escape(atob(t.trim())))); return S && S.v === 1 && S.plots ? S : null; } catch (e) { return null; } };

  G.LM = LM;
  if (typeof module !== 'undefined') module.exports = LM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
