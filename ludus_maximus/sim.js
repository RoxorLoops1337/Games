// Ludus Maximus: simulation core (no DOM). Gladiators, gear, combat engine, fixtures, economy.
(function (G) {
  const D = G.LM_D;
  const LM = { D };
  let rnd = Math.random;
  LM.setRandom = (f) => { rnd = f || Math.random; };
  LM.rand = () => rnd();
  LM.withRandom = (f, fn) => { const keep = rnd; rnd = f; try { return fn(); } finally { rnd = keep; } };

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
  LM.spyActive = (S) => !!(S.spy && S.week <= S.spy.until);
  LM.scoutLevel = (S) => Math.min(3, D.BUILD.scout.v[LM.bfx(S, 'scout').l] + (LM.spyActive(S) ? 1 : 0));
  // intel gets stale: rivals keep training, so what you scouted weeks ago understates them
  LM.weeksAhead = (S, week) => Math.max(0, week - S.week);
  LM.staleErr = (S, week) => LM.weeksAhead(S, week) * 0.03 * (LM.scoutLevel(S) >= 3 ? 0.3 : 1);
  LM.scoutVal = (S, week, v) => v * (1 - LM.staleErr(S, week));
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
  function mastPicks(g, r) {
    const pool = Object.keys(D.MASTS).filter((m) => !(g.mast || []).includes(m)); const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor((r || rnd)() * pool.length), 1)[0]);
    return out;
  }
  const ult2Picks = (r) => { const a = pick(D.ULT2, r); return [a, pick(D.ULT2.filter((x) => x !== a), r)]; };
  function makeGlad(o) {
    const r = o.r || rnd; const style = o.style || pick(D.STYLE_IDS, r); const S = D.STYLES[style]; const lvl = o.lvl || 1; const q = o.q == null ? r() : o.q;
    const g = {
      id: o.id || 0, name: o.name || pick(D.FIRST, r), nick: o.nick != null ? o.nick : (r() < 0.55 ? pick(D.NICK, r) : ''), style,
      skin: o.skin || pick(D.SKIN, r), hair: o.hair || pick(D.HAIR, r), plume: o.plume || pick(D.PLUME, r), face: o.face != null ? o.face : Math.floor(r() * 3),
      lvl, xp: 0, st: {}, tal: {}, trait: o.trait || pick(D.TRAIT_IDS, r), techs: [S.sig], pend: [], gear: {}, mast: [], ult2: null,
      rune: { k: 'lethal', m: ['celerity', 'coup'] },
      en: 100, mo: 70, inj: 0, act: 'rest', rec: { w: 0, l: 0 }, fame: 0, color: o.color || null,
    };
    D.STATS.forEach((s) => {
      g.tal[s] = 1 + (r() < 0.22 + 0.4 * q ? 1 : 0) + (r() < 0.06 + 0.3 * q ? 1 : 0);
      g.st[s] = S.base[s] * (0.92 + r() * 0.16);
    });
    for (let l = 2; l <= lvl; l++) D.STATS.forEach((s) => { g.st[s] += LM.levelGain(null, g, s); });
    if (lvl >= 3) g.techs.push(techPicks(g, r)[0]);
    if (lvl >= 6) g.techs.push(techPicks(g, r)[0]);
    for (let l = 5; l <= Math.min(lvl, 20); l += 5) g.mast.push(mastPicks(g, r)[0]);
    if (lvl >= 8) g.ult2 = ult2Picks(r)[0];
    if (o.randRune) { const ms = Object.keys(D.MINORS); g.rune = { k: pick(Object.keys(D.KEYSTONES), r), m: [pick(ms, r)] }; g.rune.m.push(pick(ms.filter((x) => x !== g.rune.m[0]), r)); }
    return g;
  }
  LM.makeGlad = makeGlad;
  LM.stars = (g) => clamp(Math.round(((D.STATS.reduce((a, s) => a + g.tal[s], 0) - 5) / 10) * 4 + 1), 1, 5);
  LM.fullName = (g) => g.name + (g.nick ? ' ' + g.nick : '');
  LM.addXp = (g, xp) => {
    const up = []; g.xp += xp; g.pend = g.pend || [];
    while (g.xp >= LM.need(g.lvl)) {
      g.xp -= LM.need(g.lvl); g.lvl++; up.push(g.lvl);
      D.STATS.forEach((s) => { g.st[s] += LM.levelGain(null, g, s); });
      if (g.lvl === 3 || g.lvl === 6) g.pend.push({ t: 'tech', o: techPicks(g) });
      if (g.lvl === 8 && !g.ult2) g.pend.push({ t: 'ult', o: ult2Picks() });
      if (g.lvl % 5 === 0 && g.lvl <= 20) g.pend.push({ t: 'mast', o: mastPicks(g) });
    }
    return up;
  };
  LM.choosePick = (g, id) => {
    const p = g.pend && g.pend[0]; if (!p || !p.o.includes(id)) return false;
    if (p.t === 'tech') g.techs.push(id); else if (p.t === 'mast') g.mast.push(id); else g.ult2 = id;
    g.pend.shift(); return true;
  };
  LM.pickName = (t, id) => (t === 'tech' ? D.TECHS[id] : t === 'mast' ? D.MASTS[id] : D.ULTS[id]);
  LM.ultsOf = (g) => [D.STYLE_ULT[g.style]].concat(g.ult2 ? [g.ult2] : []);
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
  LM.buyVal = (S, it) => Math.round(LM.sellVal(it) * 3.5 * (it.sp ? 1.5 : 1) * (1 - 0.03 * LM.bfx(S, 'market').l - LM.facPerks(S).shop - (LM.fest(S, S.week) === 'saturn' ? 0.2 : 0)));
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
    S.items.push(out); S.stats.merges = (S.stats.merges || 0) + 1; LM.note(S, 'merge'); return { item: out };
  };
  LM.evolveCost = (it) => 120 * (it.rar + 1) * (it.rar + 1);
  LM.canEvolve = (S, it) => it.rar < 4 && it.up >= Math.max(1, LM.maxUp(S));
  // Evolve: a fully upgraded item becomes the next rarity, keeps its affixes and set, gains one more affix.
  LM.evolve = (S, it) => {
    if (it.rar >= 4) return 'Already legendary'; if (!LM.canEvolve(S, it)) return 'Upgrade it to the Forge limit first';
    const c = LM.evolveCost(it); if (S.gold < c) return 'Not enough gold';
    S.gold -= c; const n = genItem(rnd, { slot: it.slot, rar: it.rar + 1, ilvl: it.ilvl + 2 });
    const have = new Set(it.af.map((a) => a.id)); const af = it.af.map((a) => ({ id: a.id, v: a.id === 'stalwart' ? 1 : Math.min(3, a.v + (rnd() < 0.4 ? 1 : 0)) }));
    n.af.forEach((a) => { if (af.length < D.RAR[n.rar].af && !have.has(a.id)) { af.push(a); have.add(a.id); } });
    it.rar = n.rar; it.ilvl = n.ilvl; it.st = n.st; it.af = af; it.up = 0; it.set = it.set || n.set;
    it.name = it.set ? `${D.SETS[it.set].n} ${it.name.split(' ').slice(-1)[0]}` : `${D.ADJ[it.rar][Math.floor(rnd() * D.ADJ[it.rar].length)]} ${it.name.split(' ').slice(-1)[0]}`; return '';
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
  LM.STANCE_D = { bal: 'No changes.', agg: '+15% damage, -10% armor.', grd: '+20% armor, -8% damage, -5% speed.', cun: '+8% crit, +8% dodge, -5% HP.' };
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
    (g.mast || []).forEach((id) => { const m = D.MASTS[id]; if (m) add(fx, m.fx); });
    if (g.rune) (g.rune.m || []).forEach((id) => { const m = D.MINORS[id]; if (m && m.fx) add(fx, m.fx); });
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
  LM.teamCtx = (S, glads, stance) => {
    const sy = LM.synergy(glads.map((g) => g.style)); const fx = Object.assign({}, sy.fx);
    if (S && glads.length > 1) { let tot = 0, n = 0; for (let i = 0; i < glads.length; i++) for (let j = i + 1; j < glads.length; j++) { tot += LM.bond(S, glads[i].id, glads[j].id); n++; } const b = (tot / n / 100) * 0.06; fx.atk = (fx.atk || 0) + b; fx.def = (fx.def || 0) + b; }
    const xfx = {};
    if (S) (S.relicOn || []).forEach((id) => { const r = D.RELICS.find((x) => x.id === id); if (r) { if (r.syn) add(fx, r.syn); if (r.xfx) add(xfx, r.xfx); } });
    return { syn: fx, xfx, stance: stance || 'bal', list: sy.list };
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
  LM.diffMul = (S) => [0.88, 1, 1.12][S && S.opts && S.opts.diff != null ? S.opts.diff : 1];
  LM.diffGold = (S) => [1.1, 1, 1.15][S && S.opts && S.opts.diff != null ? S.opts.diff : 1];
  function mkOpp(S, rv, lvl, power, r, league, rarShift) {
    const g = makeGlad({ r, randRune: true, style: rv.style, name: rv.name, nick: rv.nick, trait: rv.trait, lvl, q: 0.5, skin: rv.skin, hair: rv.hair, plume: rv.plume, face: rv.face, color: rv.color });
    const S0 = D.STYLES[rv.style]; const sb = D.STATS.reduce((a, s) => a + S0.base[s], 0); const pts = lvl * 4.5 * power;
    D.STATS.forEach((s) => { g.st[s] += (pts * S0.base[s]) / sb; g.st[s] *= LM.diffMul(S); });
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


  LM.oppStance = (S, o) => ({ hothead: 'agg', ironjaw: 'grd', coolhead: 'cun' }[o.trait] || 'bal');

  // ---------- the bookmaker: public odds know level and style only ----------
  LM.publicOdds = (gl, opps) => {
    const avg = (a) => a.reduce((x, g) => x + g.lvl, 0) / a.length;
    const ad = gl.length === 1 && opps.length === 1 ? LM.adv(gl[0].style, opps[0].style) : 0;
    return clamp(0.5 + 0.04 * (avg(gl) - avg(opps)) + 0.12 * ad, 0.08, 0.92);
  };
  LM.wagerMult = (gl, opps, S) => Math.round(clamp(0.93 / LM.publicOdds(gl, opps) + (S ? LM.facPerks(S).payout : 0), 1.1, 8) * 10) / 10;
  LM.wagerOptions = (S) => [0.1, 0.25, 0.5].map((f) => Math.min(Math.round(S.gold * f), 2000)).filter((v) => v >= 5);


  // ---------- augments (pick 1 of 3 before a fight, ARAM Mayhem style) ----------
  const TIERW = [[70, 30, 0], [40, 55, 5], [15, 65, 20], [0, 50, 50]];
  LM.augOffer = (S, level, have, forceTop) => {
    const w = TIERW[clamp(level, 0, 3)]; const out = []; const taken = new Set((have || []).map((a) => a.id));
    for (let i = 0; i < 3; i++) {
      let t; if (forceTop && i === 0) t = 2; else { let x = rnd() * 100; t = 0; while (t < 2 && (x -= w[t]) >= 0) t++; }
      let pool = D.AUGMENTS.filter((a) => a.t === t && !taken.has(a.id)); if (!pool.length) pool = D.AUGMENTS.filter((a) => !taken.has(a.id));
      const a = pick(pool); taken.add(a.id); out.push(a);
    }
    return out;
  };
  LM.augCtx = (augs) => { const syn = {}, xfx = {}; augs.forEach((b) => { if (b.syn) add(syn, b.syn); if (b.xfx) add(xfx, b.xfx); }); return { syn, xfx }; };

  // ---------- runes & relics ----------
  LM.runeOwned = (S, kind, id) => (S.runes || D.RUNE_START)[kind].includes(id);
  LM.unlockRune = (S) => {
    const lock = []; Object.keys(D.KEYSTONES).forEach((id) => { if (!S.runes.k.includes(id)) lock.push({ kind: 'k', id }); }); Object.keys(D.MINORS).forEach((id) => { if (!S.runes.m.includes(id)) lock.push({ kind: 'm', id }); });
    if (!lock.length) return null; const r = pick(lock); S.runes[r.kind].push(r.id); return r;
  };
  LM.setKeystone = (S, g, id) => { if (LM.runeOwned(S, 'k', id)) g.rune.k = id; };
  LM.toggleMinor = (S, g, id) => {
    if (!LM.runeOwned(S, 'm', id)) return; const m = g.rune.m; const i = m.indexOf(id);
    if (i >= 0) m.splice(i, 1); else { if (m.length >= 2) m.shift(); m.push(id); }
  };
  LM.relicSlots = (S) => 2 + LM.bfx(S, 'shrine').l + LM.facPerks(S).slots;
  LM.dropRelic = (S) => {
    const pool = D.RELICS.filter((r) => !(S.relics || []).includes(r.id)); if (!pool.length) return null;
    const r = pick(pool); S.relics.push(r.id); if (S.relicOn.length < LM.relicSlots(S)) S.relicOn.push(r.id); return r;
  };
  LM.toggleRelic = (S, id) => {
    const i = S.relicOn.indexOf(id); if (i >= 0) { S.relicOn.splice(i, 1); return ''; }
    if (S.relicOn.length >= LM.relicSlots(S)) return 'All relic slots are full (the Shrine adds more)'; S.relicOn.push(id); return '';
  };
  LM.relicGold = (S) => (S.relicOn || []).reduce((a, id) => a + ((D.RELICS.find((r) => r.id === id) || {}).gold || 0), 0);

  // ---------- Pit of Trials ----------
  LM.pitOpp = (S, floor, g) => {
    const boss = floor % 5 === 0; const lvl = Math.max(1, Math.round(g.lvl * 0.75 + floor * 1.1 + (boss ? 3 : 0)));
    const style = pick(D.STYLE_IDS); const ml = LM.maxLeague(S);
    const rv = { id: null, name: pick(D.FIRST), nick: boss ? 'the Pit Lord' : pick(D.NICK), ludus: 'The Pit', style, skin: pick(D.SKIN), hair: pick(D.HAIR), plume: pick(D.PLUME), face: Math.floor(rnd() * 3), trait: pick(D.TRAIT_IDS), color: pick(D.COLORS).c };
    const o = mkOpp(S, rv, lvl, 0.78 + floor * 0.045 + (boss ? 0.15 : 0), rnd, Math.min(3, ml), boss);
    o.rv = null; o.id = 'pit' + floor; return o;
  };
  LM.dayKey = () => new Date().toISOString().slice(0, 10);
  LM.dailyDone = (S) => !!(S.daily && S.daily.day === LM.dayKey());
  LM.dailySeed = (floor, tag) => mulberry(hash('daily' + LM.dayKey() + tag + floor));
  LM.pitReward = (S, floor, boons, lost) => {
    const ml = LM.maxLeague(S); const L0 = D.LEAGUES[ml];
    let gold = 0, fame = 0; for (let f = 1; f <= floor; f++) { gold += L0.purse * 0.3 * (1 + f * 0.18); fame += Math.round(L0.fameWin * 0.25 * (1 + f * 0.1)); }
    gold *= 1 + 0; gold *= 1 + 0.1 * ((S.perks || {}).gold || 0);
    if (lost) { gold *= 0.5; fame = Math.round(fame * 0.5); }
    const items = []; const n = Math.floor(floor / 3);
    for (let i = 0; i < n; i++) items.push(genItem(rnd, { league: ml, ilvl: 2 + ml * 5 + floor, luck: 0.04 * floor + LM.bfx(S, 'shrine').v }));
    if (floor >= 5 && !lost) items.push(genItem(rnd, { league: Math.min(3, ml + 1), ilvl: 3 + ml * 5 + floor, rar: Math.min(4, 2 + (floor >= 10 ? 1 : 0)) }));
    return { gold: Math.round(gold), fame: Math.round(fame), items, boss: floor >= 5 && !lost };
  };

  // ---------- legacy ghosts (your old champions come back as rivals) ----------
  LM.ghostOpp = (S, ghost, lvl) => {
    const g = JSON.parse(JSON.stringify(ghost)); const f = Math.min(1, lvl / Math.max(1, g.lvl));
    D.STATS.forEach((s) => { g.st[s] *= f; }); g.lvl = Math.min(g.lvl, lvl); g.rv = null; g.gh = true; g.color = '#7d7d8c'; g.id = 'gh' + ghost.name + g.lvl;
    D.SLOTS.forEach((sl) => { if (g.gear[sl] && g.gear[sl].rar > 2) delete g.gear[sl]; });
    g.inj = 0; g.en = 100; g.mo = 80; return g;
  };

  // ---------- scouting (fog of war) ----------
  // 0: style + level only. 1: stat grades + trait. 2: exact numbers, techs, gear, win odds. 3: affixes/sets, derived stats, runes and masteries.
  LM.fogNote = ['Style and level only', 'Stat grades and trait', 'Exact stats, gear, techs, win odds', 'Everything, incl. gear effects, runes and masteries'];

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
  LM.tourneyInit = (S, ev, g) => ({ key: ev.key, size: ev.size, slots: [g].concat(ev.opps), alive: Array.from({ length: ev.size }, (_, i) => i), hist: [], round: 0, hpf: 1, won: 0 });
  LM.tourneyOpp = (T) => { const mi = T.alive.indexOf(0); return T.slots[T.alive[mi ^ 1]]; };
  LM.tourneyPairs = (T) => { const p = []; for (let i = 0; i < T.alive.length; i += 2) p.push([T.alive[i], T.alive[i + 1]]); return p; };
  LM.tourneyAdvance = (S, T, iWon) => {
    const next = [];
    LM.tourneyPairs(T).forEach(([a, b]) => {
      if (a === 0 || b === 0) { if (iWon) next.push(0); else next.push(a === 0 ? b : a); return; }
      const F = LM.quick(LM.mkUnits([T.slots[a]], 'A', { noperf: true }), LM.mkUnits([T.slots[b]], 'B', { noperf: true }), { autoA: true });
      next.push(F.winner === 'A' ? a : b);
    });
    T.hist.push(next.slice()); T.round++; T.alive = next; return { over: !iWon || next.length === 1, champion: iWon && next.length === 1 };
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
    fame *= 1 + ft / glads.length + LM.facPerks(S).fame + (LM.fest(S, ev.week) === 'mars' ? 0.25 : 0);
    const perks = S.perks || {}; gold *= LM.diffGold(S); gold *= 1 + 0.1 * (perks.gold || 0) + (LM.fest(S, ev.week) === 'jupiter' ? 0.3 : 0) + LM.facPerks(S).gold + LM.relicGold(S) + (glads.some((g) => g.rune && g.rune.k === 'first') ? 0.1 : 0) + (res.win || res.place ? LM.bfx(S, 'stands').v : 0); fame *= 1 + (res.win ? LM.bfx(S, 'stands').v * 0.5 : 0);
    gold *= LM.favMul(glads); gold = Math.round(gold); fame = Math.round(fame); S.gold += gold; S.fame += fame; rep.gold = gold; rep.fame = fame;
    const oppLvl = Math.max(...ev.opps.map((o) => o.lvl));
    const big = ev.kind === 'tourney' || ev.kind === 'grand' ? 1.6 : 1;
    glads.forEach((g) => {
      const win = res.win; LM.favGain(g, win, res.hype || 0); const xp = Math.round((win ? 24 + oppLvl * 5 : 12 + oppLvl * 2) * big);
      const up = LM.addXp(g, xp); rep.xp.push({ id: g.id, xp, up }); if (up.length) { rep.lvl.push({ id: g.id, to: up[up.length - 1] }); LM.diary(S, g, `Reached level ${up[up.length - 1]}.`); }
      LM.diary(S, g, `${win ? 'Won' : 'Lost'}: ${ev.title || ev.kind}.`);
      if (win) { g.rec.w++; g.sw = (g.sw || 0) + 1; g.mo = clamp(g.mo + 10, 0, 100); } else { g.rec.l++; g.mo = clamp(g.mo - 8, 0, 100); }
      g.fame += Math.round(fame / glads.length); g.en = clamp(g.en - 25, 0, 100);
      const hpf = res.hpf && res.hpf[g.id] != null ? res.hpf[g.id] : win ? 0.6 : 0.2;
      let ic = (win ? 0.05 : 0.18) + (hpf < 0.25 ? 0.12 : 0); ic *= 1 - 0.12 * LM.bfx(S, 'infirmary').l;
      if (rnd() < ic) { g.inj = 1 + Math.floor(rnd() * 3); rep.inj.push({ id: g.id, w: g.inj }); }
    });
    for (let i = 0; i < glads.length; i++) for (let j = i + 1; j < glads.length; j++) LM.addBond(S, glads[i].id, glads[j].id, 4);
    const luck = LM.bfx(S, 'shrine').v + (perks.luck || 0) * 0.05 + glads.reduce((a, g) => a + (D.TRAITS[g.trait].luck || 0), 0) / glads.length;
    const lootLvl = Math.max(1, oppLvl);
    const rolloot = () => genItem(rnd, { league: ev.league, ilvl: lootLvl, luck });
    if (ev.loot && res.place === 1) { rep.choice = [rolloot(), rolloot(), rolloot()]; rep.relic = (ev.kind === 'grand' || rnd() < 0.4) ? LM.dropRelic(S) : null; rep.rune = rnd() < 0.6 ? LM.unlockRune(S) : null; }
    else if (res.win && rnd() < 0.3 + 0.1 * (ev.diff || 0)) rep.loot.push(rolloot());
    rep.loot.forEach((it) => { const sold = LM.addItem(S, it); if (sold) rep.notes.push(`Armory full: sold ${sold.name}`); });
    // rivals head-to-head
    ev.opps.forEach((o) => { if (!o.rv) return; S.rivals = S.rivals || {}; const r0 = S.rivals[o.rv] || { w: 0, l: 0, last: '' }; if (res.win || res.place === 1) { r0.w++; r0.last = 'w'; } else { r0.l++; r0.last = 'l'; } S.rivals[o.rv] = r0; });
    const wonAny = res.win || res.place === 1; rep.fac = [];
    if (wonAny) {
      if (res.odds != null && res.odds < 0.4) { rep.fac.push(LM.facGain(S, 'ple', 8)); S.stats.upsets = (S.stats.upsets || 0) + 1; }
      if (LM.fest(S, ev.week)) S.stats.festWins = (S.stats.festWins || 0) + 1; if (ev.kind === 'team') S.stats.teamWins = (S.stats.teamWins || 0) + 1;
      if ((res.hype || 0) >= 100) rep.fac.push(LM.facGain(S, 'ple', 4));
      if (ev.kind === 'tourney' || ev.kind === 'grand') rep.fac.push(LM.facGain(S, 'sen', ev.kind === 'grand' ? 14 : 9));
      else rep.fac.push(LM.facGain(S, 'sen', 1));
    }
    LM.ownerTick(S, wonAny); S.forum = (S.forum || []).concat([{ w: S.week, t: `${wonAny ? 'Won' : 'Lost'}: ${ev.title || ev.kind} (hype ${Math.round(res.hype || 0)})` }]).slice(-30); S.stats.fights++; if (wonAny) { S.stats.wins++; if (S.sponsor && S.sponsor.pledge) S.sponsor.pledge.got++; } else S.stats.losses++;
    if (wonAny) { LM.note(S, 'win', { styles: glads.map((g) => g.style), kind: ev.kind }); if (ev.kind === 'tourney' || ev.kind === 'grand') { S.stats.tourneys++; LM.note(S, 'tourney'); if (ev.kind === 'grand' && ev.league === 3) S.flags.imperial = true; } if (ev.kind === 'team') LM.note(S, 'team'); if (res.odds != null && res.odds < 0.4) LM.note(S, 'upset'); }
    return rep;
  };
  LM.mercy = (S, ev, rep, choice) => {
    if (choice === 'mercy') {
      const f = Math.round(rep.fame * 0.2) + 2; S.fame += f; rep.fame += f; S.stats.spares++; LM.note(S, 'mercy'); LM.facGain(S, 'sen', 6); LM.facGain(S, 'ple', 2);
      const o = ev.opps[0]; const cap = LM.rosterCap(S);
      if (ev.kind === 'duel' && S.glads.length < cap && rnd() < 0.3) {
        const g = JSON.parse(JSON.stringify(o)); g.id = S.nextId++; g.act = 'rest'; g.en = 100; g.mo = 80; g.inj = 0; g.rv = null; g.color = null; g.rec = { w: 0, l: 0 }; g.fame = 0; delete g.story; LM.assignStory(g); S.glads.push(g); return { f, joined: g };
      }
      return { f };
    }
    const gd = Math.round(rep.gold * 0.2) + 5; S.gold += gd; rep.gold += gd; LM.facGain(S, 'mer', 5); return { gd };
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
    const free = LM.fest(S, S.week) === 'ceres'; const cost = free ? 0 : m.c * S.glads.length; if (S.gold >= cost) { S.gold -= cost; rep.menuCost = cost; } else m = D.MENUS[0];
    const ring = LM.bfx(S, 'sparring'); const pal = 1 + LM.bfx(S, 'palaestra').v; const bath = LM.bfx(S, 'bath').v; const inf = LM.bfx(S, 'infirmary').v;
    const sparrers = [];
    S.glads.forEach((g) => {
      let act = LM.activity(g); const T = D.TRAITS[g.trait]; const line = { id: g.id, name: g.name, act: act.id, txt: '' };
      if (g.inj > 0) { act = D.ACTS[5]; line.txt = `Injured (${g.inj}w left), resting.`; g.inj = Math.max(0, g.inj - (1 + Math.floor(inf))); }
      if (act.t === 'train' && g.en < 5) { act = D.ACTS[5]; line.txt = 'Too tired to train, rested instead.'; }
      if (act.t === 'train') {
        const s = act.s; const base = 2.2 + rnd() * 1.6; const tal = 0.7 + 0.15 * g.tal[s];
        const food = 1 + (m.bon[s] || 0) + (m.bon.all || 0); const mood = 0.9 + (0.2 * g.mo) / 100; const enm = g.en < 25 ? 0.5 : 1;
        const drill = g.drill && g.drill.week === S.week ? 1 + g.drill.m : 1; let gain = drill * base * tal * pal * food * (1 + (T.train || 0)) * mood * enm * LM.legendTrain(S, s) * (1 + 0.08 * ((S.perks || {}).train || 0));
        if (g.st[s] >= LM.cap(g)) { gain *= 0.2; line.txt = 'At the level cap, fight to grow further. '; }
        g.st[s] += gain; g.en = clamp(g.en - Math.round(22 * (1 - (T.tire || 0))), 0, 100); g.mo = clamp(g.mo - 1, 0, 100);
        line.txt += `+${gain.toFixed(1)} ${D.SA[s]}`; line.gain = gain; line.stat = s;
      } else if (act.t === 'spar') {
        const xp = ring.l ? Math.round(ring.v) : 4; const up = LM.addXp(g, xp); g.st.skl += 0.4; g.en = clamp(g.en - 18, 0, 100);
        line.txt = `Sparred: +${xp} XP${up.length ? ', LEVEL ' + up[up.length - 1] + '!' : ''}`; sparrers.push(g);
      } else if (act.t === 'spy') {
        S.spy = { until: S.week + 2 }; g.en = clamp(g.en - 20, 0, 100); g.mo = clamp(g.mo + 1, 0, 100); line.txt = 'Spied on the rival ludi: scouting +1 level for 2 weeks';
      } else if (act.t === 'work') {
        const gd = Math.round((25 + g.lvl * 4) * (1 + 0.1 * ((S.perks || {}).gold || 0))); S.gold += gd; rep.work += gd; g.en = clamp(g.en - 28, 0, 100); g.mo = clamp(g.mo - 3, 0, 100); line.txt = `Odd jobs: +${gd} gold`;
      } else if (act.t === 'rest') {
        g.en = clamp(g.en + 45 + bath, 0, 100); g.mo = clamp(g.mo + 3, 0, 100); if (!line.txt) line.txt = 'Rested';
      }
      g.en = clamp(g.en + 18 + (T.regen || 0) + (m.en || 0) + (free ? 10 : 0), 0, 100); g.mo = clamp(g.mo + (m.mo || 0), 0, 100);
      rep.lines.push(line);
    });
    for (let i = 0; i < sparrers.length; i++) for (let j = i + 1; j < sparrers.length; j++) LM.addBond(S, sparrers[i].id, sparrers[j].id, 3);
    return rep;
  };
  LM.dueKeys = (S) => Object.keys(S.entries).filter((k) => k.split(':')[0] === String(S.week));
  LM.weekFinish = (S) => {
    const rep = { upkeep: 0, income: 0, notes: [], season: null };
    const up = LM.fest(S, S.week) === 'saturn' ? 0 : LM.upkeep(S); const paid = Math.min(S.gold, up); S.gold -= paid; rep.upkeep = paid;
    if (paid < up) { S.glads.forEach((g) => { g.mo = clamp(g.mo - 10, 0, 100); }); rep.notes.push('You could not pay the full upkeep. Morale dropped.'); }
    const inc = LM.weeklyIncome(S) + LM.facPerks(S).weekly + (S.sponsor && S.sponsor.weeks > 0 ? S.sponsor.gold : 0); S.gold += inc; rep.income = inc;
    if (S.sponsor && S.sponsor.weeks > 0) { S.sponsor.weeks--; if (S.sponsor.weeks <= 0) { const pl = S.sponsor.pledge; if (pl && pl.got >= pl.n) { S.gold += pl.bonus; rep.income += pl.bonus; rep.notes.push(`Pledge kept! The merchant adds a ${pl.bonus} gold bonus.`); } else rep.notes.push(pl ? `Your sponsor deal has ended. Pledge missed (${pl.got}/${pl.n} wins).` : 'Your sponsor deal has ended.'); S.sponsor = null; } }
    const sh = LM.bfx(S, 'shrine'); if (sh.l) { const f = Math.round(sh.v * 60); S.fame += f; if (f) rep.notes.push(`The shrine drew ${f} fame.`); }
    Object.keys(S.entries).forEach((k) => { if (parseInt(k.split(':')[0], 10) <= S.week) delete S.entries[k]; });
    S.week++; S.stats.weeks++; S.glads.forEach((g) => { g.fav = Math.max(0, (g.fav || 0) - 2); });
    if ((S.week - 1) % 12 === 0) {
      S.season = Math.ceil(S.week / 12); rep.season = S.season; const sl = S.sl || { fame: 0, wins: 0, losses: 0, tour: 0 }; const mvp = S.glads.slice().sort((a, b) => (b.sw || 0) - (a.sw || 0))[0];
      rep.recap = { wins: S.stats.wins - sl.wins, losses: S.stats.losses - sl.losses, fame: S.fame - sl.fame, tour: S.stats.tourneys - sl.tour, mvp: mvp && (mvp.sw || 0) > 0 ? { name: mvp.name, w: mvp.sw, id: mvp.id } : null };
      S.sl = { fame: S.fame, wins: S.stats.wins, losses: S.stats.losses, tour: S.stats.tourneys }; S.glads.forEach((g) => { g.sw = 0; });
      rep.recap.rival = LM.rivalOfYear(S);
      rep.recap.prizes = LM.seasonPrizes(S);
      S.awards = (S.awards || []).concat([{ season: S.season - 1, mvp: rep.recap.mvp ? rep.recap.mvp.name : null, wins: rep.recap.wins, rival: rep.recap.rival ? rep.recap.rival.a + ' and ' + rep.recap.rival.b : null }]).slice(-12);
    }
    S.market = null; S.recruits = null; LM.relTick(S); rep.story = LM.storyCheck(S);
    LM.fillContracts(S);
    LM.ladderCheck(S).forEach((r) => { rep.notes.push(`Season ladder: ${r.n} wins reached! +${r.gold} gold, +${r.fame} fame.`); });
    if (S.week - (S.lastBackup || 0) >= 12 && S.week % 4 === 1) rep.notes.push('Tip: back up your ludus. Open More, then Save code, and keep the code somewhere safe.');
    { const me = LM.moodEvent(S); if (me) rep.notes.push(me); }
    rep.nicks = LM.earnNick(S); rep.news = LM.crier(S, rep);
    rep.ev = LM.rollEvent(S);
    return rep;
  };

  // ---------- festival weeks ----------
  LM.festival = (S, week) => {
    if (week < 2) return null; const r = mulberry(hash(S.seed + 'fest' + week)); if (r() > 0.34) return null;
    return D.FESTIVALS[Math.floor(r() * D.FESTIVALS.length)];
  };
  LM.fest = (S, week) => (LM.festival(S, week) || {}).id || '';

  // ---------- weather, mutators, trophies ----------
  LM.weather = (S, key) => { const r = mulberry(hash(S.seed + 'wx' + key)); const x = r(); return x < 0.4 ? 'clear' : x < 0.55 ? 'rain' : x < 0.7 ? 'dust' : x < 0.85 ? 'heat' : 'night'; };
  LM.mutator = (tag) => D.MUTATORS[hash('mut' + tag) % D.MUTATORS.length];
  const itemsOf = (S) => S.items.concat(...S.glads.map((g) => D.SLOTS.map((x) => g.gear[x]).filter(Boolean)));
  const TC = {
    first: (S) => S.stats.wins >= 1, wins10: (S) => S.stats.wins >= 10, wins50: (S) => S.stats.wins >= 50, champ: (S) => S.stats.tourneys >= 1, champ5: (S) => S.stats.tourneys >= 5,
    imperial: (S) => !!S.flags.imperial, mercy5: (S) => S.stats.spares >= 5, upset: (S) => (S.stats.upsets || 0) >= 1, upset5: (S) => (S.stats.upsets || 0) >= 5, team: (S) => (S.stats.teamWins || 0) >= 1,
    pit5: (S) => (S.pitBest || 0) >= 5, pit10: (S) => (S.pitBest || 0) >= 10, daily5: (S) => (S.dailyBest || 0) >= 5, legendary: (S) => itemsOf(S).some((i) => i.rar >= 4),
    fullset: (S) => S.glads.some((g) => Object.values(LM.setCounts(g)).some((n) => n >= 4)), forge5: (S) => (S.stats.merges || 0) >= 5, rich: (S) => S.gold >= 5000, lvl20: (S) => S.glads.some((g) => g.lvl >= 20),
    legend1: (S) => (S.legends || []).length >= 1, runes: (S) => S.runes.k.length >= Object.keys(D.KEYSTONES).length, relics6: (S) => S.relics.length >= 6,
    bouts: (S) => (S.stats.bouts || 0) >= 1, faction: (S) => ['sen', 'mer', 'ple'].some((id) => LM.facRep(S, id) >= 100), festwin: (S) => (S.stats.festWins || 0) >= 1, ascended: (S) => (S.ascensions || 0) >= 1,
  };
  LM.checkTrophies = (S) => {
    S.trophies = S.trophies || {}; const out = [];
    D.TROPHIES.forEach((t) => { if (!S.trophies[t.id] && TC[t.id] && TC[t.id](S)) { S.trophies[t.id] = S.week; S.gold += t.r.gold || 0; S.fame += t.r.fame || 0; S.laurels += t.r.laurels || 0; out.push(t); } });
    S.flags = S.flags || {}; if (!S.flags.allTroph && Object.keys(S.trophies).length >= D.TROPHIES.length) { S.flags.allTroph = true; S.laurels += 3; out.push({ id: 'all', n: 'Grand Collector', d: 'Earn every trophy.', r: { laurels: 3 } }); }
    return out;
  };

  // ---------- factions ----------
  LM.facRep = (S, id) => ((S.fac || {})[id] || 0);
  LM.facTier = (S, id) => { const r = LM.facRep(S, id); return r >= 100 ? 4 : r >= 75 ? 3 : r >= 50 ? 2 : r >= 25 ? 1 : 0; };
  LM.facGain = (S, id, n) => { S.fac = S.fac || { sen: 0, mer: 0, ple: 0 }; const before = LM.facTier(S, id); S.fac[id] = clamp((S.fac[id] || 0) + n, 0, 100); const after = LM.facTier(S, id); return { text: `${D.FACTIONS[id].n} ${n >= 0 ? '+' : ''}${n}`, up: after > before ? D.FACTIONS[id].perks[after - 1] : '' }; };
  LM.facPerks = (S) => { const t = (id) => LM.facTier(S, id); return { fame: (t('sen') >= 1 ? 0.05 : 0) + (t('sen') >= 3 ? 0.1 : 0), slots: t('sen') >= 2 ? 1 : 0, weekly: (t('sen') >= 4 ? 40 : 0) + (t('mer') >= 4 ? 60 : 0), shop: t('mer') >= 1 ? 0.05 : 0, gold: t('mer') >= 2 ? 0.1 : 0, payout: t('mer') >= 3 ? 0.2 : 0, hype: t('ple') >= 1 ? 1.15 : 1, ultStart: t('ple') >= 2 ? 3 : 0, rerolls: t('ple') >= 3 ? 2 : 0, roarDmg: t('ple') >= 4 ? 0.08 : 0 }; };

  // ---------- relationships: friendships (bonds) and rivalries inside the ludus ----------
  LM.relTick = (S) => {
    S.rivalry = S.rivalry || {}; const gs = S.glads.filter((g) => g.lvl >= 3 && g.inj <= 0);
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
      const a = gs[i], b = gs[j]; const k = bkey(a.id, b.id); const friends = LM.bond(S, a.id, b.id) >= 50;
      const add = ((a.style === b.style ? 3 : 0) + (a.act === b.act ? 2 : 0) + (a.fame > 0 && b.fame > 0 ? 1 : 0)) * (friends ? 0.4 : 1);
      S.rivalry[k] = clamp((S.rivalry[k] || 0) + (add > 0 ? add : -1), 0, 100); if (add > 0) { S.rvy = S.rvy || {}; S.rvy[k] = (S.rvy[k] || 0) + add; }
      if (S.rivalry[k] >= 45 && !S.pendingRiv) { S.pendingRiv = [a.id, b.id]; LM.forumAdd(S, `Tension rises between ${a.name} and ${b.name}.`); }
    }
  };
  LM.rivalryOf = (S, a, b) => (S.rivalry || {})[bkey(a, b)] || 0;
  LM.seasonPrizes = (S) => {
    const ml = LM.maxLeague(S); const out = [];
    for (let i = 0; i < 3; i++) { const it = genItem(rnd, { slot: D.SLOTS[i * 2 % D.SLOTS.length], league: Math.min(3, ml + 1), ilvl: 4 + ml * 5 + S.season * 2, rar: Math.min(4, 3 + (ml >= 2 ? 1 : 0)) }); it.name = `Season ${S.season - 1} ${it.name}`; out.push(it); }
    return out;
  };
  LM.takePrize = (S, it) => { LM.addItem(S, it); return it; };
  LM.diary = (S, g, t) => { g.dy = (g.dy || []).concat([{ w: S.week, t }]).slice(-12); };
  LM.forumAdd = (S, t) => { S.forum = (S.forum || []).concat([{ w: S.week, t }]).slice(-30); };
  LM.rivalryResolve = (S, a, b, choice, winnerId) => {
    LM.forumAdd(S, choice === 'partner' ? `${a.name} and ${b.name} train as partners now.` : `${a.name} and ${b.name} settled things in the sand.`);
    S.rivalry = S.rivalry || {}; const k = bkey(a.id, b.id); S.pendingRiv = null; const out = { lines: [] };
    if (choice === 'duel') {
      const w = winnerId === a.id ? a : b, l = w === a ? b : a; const up = LM.addXp(w, 40), up2 = LM.addXp(l, 20);
      w.mo = clamp(w.mo + 15, 0, 100); l.mo = clamp(l.mo - 8, 0, 100); LM.addBond(S, a.id, b.id, 6); S.rivalry[k] = 0; S.stats.bouts = (S.stats.bouts || 0) + 1;
      out.lines.push(`${w.name} wins the bout (+40 XP${up.length ? ', LEVEL ' + up[up.length - 1] : ''}). ${l.name} learns from it (+20 XP${up2.length ? ', LEVEL ' + up2[up2.length - 1] : ''}).`);
    } else if (choice === 'partner') {
      LM.addBond(S, a.id, b.id, 20); S.rivalry[k] = 0; a.mo = clamp(a.mo + 5, 0, 100); b.mo = clamp(b.mo + 5, 0, 100); out.lines.push(`${a.name} and ${b.name} train side by side now. Bond +20.`);
    } else { S.rivalry[k] = Math.max(0, (S.rivalry[k] || 0) - 15); out.lines.push('The tension simmers down, for now.'); }
    return out;
  };

  // ---------- backstories ----------
  LM.assignStory = (g) => { if (!g.story) g.story = { id: pick(D.STORIES).id, done: false }; return g; };
  LM.storyDef = (g) => D.STORIES.find((x) => x.id === (g.story || {}).id);
  LM.storyProg = (g) => { const st = LM.storyDef(g); if (!st) return 0; return st.goal.k === 'wins' ? g.rec.w : st.goal.k === 'lvl' ? g.lvl : g.fame; };
  LM.storyCheck = (S) => {
    const out = [];
    S.glads.forEach((g) => { const st = LM.storyDef(g); if (!st || g.story.done || LM.storyProg(g) < st.goal.n) return; g.story.done = true; LM.diary(S, g, `Completed their quest: ${st.rew.title}.`); g.st[st.rew.stat] += st.rew.v; g.title = st.rew.title; S.fame += st.rew.fame; out.push({ g, st }); });
    return out;
  };

  // ---------- town crier, earned nicknames, rival owner ----------
  LM.earnNick = (S) => {
    const out = [];
    S.glads.forEach((g) => { g.dd = g.dd || []; D.DEEDS.forEach((d) => { if (!g.dd.includes(d.id) && d.ok(g)) { g.dd.push(d.id); LM.diary(S, g, `Earned the name "${d.n}".`); g.st[d.st] += 2; g.nick = d.n; out.push({ g, nick: d.n }); } }); });
    return out;
  };
  LM.ownerTick = (S, won) => {
    if (!S.rowner) S.rowner = { name: pick(D.FIRST) + ' of ' + pick(D.LUDI), w: 0, l: 0 };
    const o = S.rowner; S.news = S.news || [];
    if (won) { o.l++; if (o.l >= 4) { const f = 50 + 15 * LM.maxLeague(S); S.fame += f; S.news.push(`${o.name} is humbled! Their ludus kneels to you (+${f} fame).`); S.rowner = null; } }
    else { o.w++; if (o.w % 3 === 0) S.news.push(`${o.name} boasts in the forum: "Your gladiators are soft!"`); }
  };
  LM.champOpp = (S, g) => {
    const rv = { id: null, name: pick(D.FIRST), nick: 'Champion', ludus: (S.rowner && S.rowner.name) || 'Rival Ludus', style: pick(D.STYLE_IDS), skin: pick(D.SKIN), hair: pick(D.HAIR), plume: pick(D.PLUME), face: Math.floor(rnd() * 3), trait: pick(D.TRAIT_IDS), color: pick(D.COLORS).c };
    const o = mkOpp(S, rv, g.lvl + 2, 1.1, rnd, Math.min(3, LM.maxLeague(S)), false); o.rv = null; o.id = 'champ'; return o;
  };
  LM.champReady = (S) => !!(S.rowner && S.rowner.w >= 3 && S.champWeek !== S.week);
  LM.champResult = (S, win) => {
    S.champWeek = S.week; if (!win) { if (S.rowner) S.rowner.w++; return { gold: 0, fame: 0 }; }
    const gold = Math.round((60 + 40 * LM.maxLeague(S)) * LM.diffGold(S)), fame = 60 + 20 * LM.maxLeague(S); S.gold += gold; S.fame += fame;
    S.news = S.news || []; S.news.push(`${S.rowner ? S.rowner.name : 'The rival owner'} lost their champion to you and slinks away (+${fame} fame).`); S.rowner = null; S.stats.champs = (S.stats.champs || 0) + 1; return { gold, fame };
  };
  // infirmary treatment, crowd favorite, bounty board
  LM.treat = (S, g, kind) => {
    if (g.inj <= 0) return 'Not injured'; const ml = LM.maxLeague(S); const cost = kind === 'doc' ? 60 + 25 * ml : 20 + 10 * ml;
    if (S.gold < cost) return 'Need ' + cost + ' gold'; S.gold -= cost;
    if (kind === 'doc') g.inj = Math.max(0, g.inj - 2); else if (rnd() < 0.6) g.inj = Math.max(0, g.inj - 1); else return '';
    return '';
  };
  LM.treatCost = (S, kind) => (kind === 'doc' ? 60 + 25 * LM.maxLeague(S) : 20 + 10 * LM.maxLeague(S));
  LM.favMul = (glads) => 1 + 0.2 * (glads.reduce((a, g) => a + (g.fav || 0), 0) / Math.max(1, glads.length)) / 100;
  LM.favGain = (g, win, hype) => { g.fav = clamp((g.fav || 0) + (win ? (hype >= 100 ? 10 : 6) : -4), 0, 100); };
  LM.bountyReady = (S) => S.week >= 2 && S.bountyWeek !== S.week;
  LM.bountyOpp = (S, g) => { const o = LM.champOpp(S, g); o.nick = 'Outlaw'; o.ludus = 'Wanted'; o.id = 'bounty'; return o; };
  LM.bountyResult = (S, win) => {
    S.bountyWeek = S.week; if (!win) return { gold: 0, fame: 0 };
    const gold = Math.round((50 + 35 * LM.maxLeague(S)) * LM.diffGold(S)), fame = 20 + 10 * LM.maxLeague(S); S.gold += gold; S.fame += fame; S.stats.bounties = (S.stats.bounties || 0) + 1; return { gold, fame };
  };
  LM.TRAIT_MOOD = {
    showman: { good: 'practiced a flourish and drew a crowd', bad: 'was upstaged at supper and sulks' },
    hothead: { good: 'won a wrestling bet in the barracks', bad: 'smashed a bench in a rage' },
    lucky: { good: 'found a coin in the sand' }, coolhead: { bad: 'shrugged off a restless night' },
    frugal: { good: 'saved a few coins and smiles about it' }, hordearius: { good: 'enjoyed a second bowl of barley' },
  };
  LM.moodEvent = (S) => {
    if (!S.glads.length || rnd() > 0.3) return null; const g = pick(S.glads); const good = rnd() < 0.5; const tm = LM.TRAIT_MOOD[g.trait] || {};
    if (good) { g.mo = clamp(g.mo + (g.trait === 'lucky' ? 22 : 15), 0, 100); return `${g.name} ${tm.good || 'saw a good omen in the sand'}. Morale up!`; }
    const k = g.trait === 'coolhead' ? 0.5 : 1; g.mo = clamp(g.mo - 12 * k, 0, 100); g.en = clamp(g.en - 10 * k, 0, 100); return `${g.name} ${tm.bad || 'had a bad night, restless with dark dreams'}.`;
  };
  // season ladder: win milestones inside each season pay out once
  LM.LADDER = [{ n: 3, gold: 60, fame: 20 }, { n: 6, gold: 120, fame: 40 }, { n: 10, gold: 220, fame: 80 }, { n: 15, gold: 400, fame: 150 }];
  LM.ladderWins = (S) => S.stats.wins - ((S.sl || {}).wins || 0);
  LM.ladderCheck = (S) => {
    const season = Math.ceil(S.week / 12); if (!S.ladder || S.ladder.season !== season) S.ladder = { season, tier: 0 }; const w = LM.ladderWins(S); const out = [];
    LM.LADDER.forEach((t, i) => { if (i >= S.ladder.tier && w >= t.n) { S.ladder.tier = i + 1; const gold = Math.round(t.gold * LM.diffGold(S)); S.gold += gold; S.fame += t.fame; out.push({ n: t.n, gold, fame: t.fame }); } });
    return out;
  };
  // planner presets, apprentices, market raids
  LM.preset = (S, kind) => {
    let n = 0;
    S.glads.forEach((g) => {
      if (g.inj > 0) return; let act = g.act;
      if (kind === 'rest') act = 'rest'; else if (kind === 'work') act = g.en >= 40 ? 'work' : 'rest'; else if (kind === 'spar') act = g.en >= 45 ? 'spar' : 'rest';
      else if (kind === 'boot') { if (g.en < 45) act = 'rest'; else { const st = D.STATS.slice().sort((a, b) => g.st[a] - g.st[b])[0]; act = st; } }
      if (act !== g.act) { g.act = act; n++; }
    });
    return n;
  };
  LM.apprentice = (S, g) => {
    const lg = (S.legends || []).find((l) => !l.mentored); if (!lg) return null;
    lg.mentored = true; g.mentor = lg.name; g.st[lg.best] += 1; return lg;
  };
  LM.raid = (S) => {
    if (!S.rowner || S.rowner.w < 2 || !S.market || rnd() > 0.35) return false;
    const before = S.market.length; S.market = S.market.filter((x) => !x.sp); if (S.market.length === before) return false; S.raidWeek = S.week; return true;
  };
  LM.crier = (S, rep) => {
    const out = (S.news || []).splice(0); const top = S.glads.slice().sort((a, b) => b.fame - a.fame)[0];
    (rep.nicks || []).forEach((x) => out.push(`The crowd now calls ${x.g.name} "${x.nick}".`));
    if (top && top.fame > 0 && out.length < 3) out.push(pick(['The streets whisper about %n.', '%n draws crowds to the gates.', 'Poets are writing verses for %n.']).replace('%n', top.name));
    if (S.sponsor && S.sponsor.pledge && out.length < 3) out.push(`Your sponsor waits to see ${S.sponsor.pledge.n - S.sponsor.pledge.got > 0 ? S.sponsor.pledge.n - S.sponsor.pledge.got + ' more win(s)' : 'the pledge paid'}.`);
    const res = out.slice(0, 3); S.forum = (S.forum || []).concat(res.map((t) => ({ w: S.week, t }))).slice(-30); return res;
  };

  // ---------- rival of the year: the pair that clashed most this season ----------
  LM.rivalOfYear = (S) => {
    const rv = S.rvy || {}; S.rvy = {}; let best = null;
    Object.keys(rv).forEach((k) => { const ids = k.split('-').map(Number); const a = S.glads.find((g) => g.id === ids[0]), b = S.glads.find((g) => g.id === ids[1]); if (a && b && rv[k] >= 12 && (!best || rv[k] > best.v)) best = { a, b, v: rv[k] }; });
    if (!best) return null;
    const fame = 40 + 10 * LM.maxLeague(S); S.fame += fame; [best.a, best.b].forEach((g) => { g.mo = clamp(g.mo + 12, 0, 100); }); LM.addBond(S, best.a.id, best.b.id, 10);
    return { a: best.a.name, b: best.b.name, fame };
  };

  // ---------- horde trial: one fighter against escalating packs ----------
  LM.hordeWave = (S, wave, g) => {
    const n = Math.min(5, 1 + Math.floor(wave / 2)); const lvl = Math.max(1, Math.round(g.lvl * 0.55 + wave * 0.6)); const out = []; const ml = LM.maxLeague(S);
    for (let i = 0; i < n; i++) {
      const rv = { id: null, name: pick(D.FIRST), nick: pick(D.NICK), ludus: 'The Horde', style: pick(D.STYLE_IDS), skin: pick(D.SKIN), hair: pick(D.HAIR), plume: pick(D.PLUME), face: Math.floor(rnd() * 3), trait: pick(D.TRAIT_IDS), color: pick(D.COLORS).c };
      const o = mkOpp(S, rv, lvl, 0.8 + wave * 0.02, rnd, Math.min(3, ml), false); o.rv = null; o.id = 'h' + wave + '_' + i; out.push(o);
    }
    return out;
  };
  LM.hordeReward = (S, wave, lost) => {
    const L0 = D.LEAGUES[LM.maxLeague(S)]; let gold = 0, fame = 0; for (let w = 1; w <= wave; w++) { gold += L0.purse * 0.22 * (1 + w * 0.2); fame += Math.round(L0.fameWin * 0.2 * (1 + w * 0.1)); }
    gold *= LM.diffGold(S) * (1 + 0.1 * ((S.perks || {}).gold || 0)); if (lost) { gold *= 0.6; fame = Math.round(fame * 0.6); }
    const items = []; for (let i = 0; i < Math.floor(wave / 4); i++) items.push(genItem(rnd, { league: LM.maxLeague(S), ilvl: 2 + LM.maxLeague(S) * 5 + wave, luck: 0.03 * wave + LM.bfx(S, 'shrine').v }));
    return { gold: Math.round(gold), fame: Math.round(fame), items };
  };

  // ---------- duo ultimates (bonded pairs in team fights) ----------
  LM.duoPair = (S, glads) => {
    let best = null;
    for (let i = 0; i < glads.length; i++) for (let j = i + 1; j < glads.length; j++) { const bd = LM.bond(S, glads[i].id, glads[j].id); if (bd >= 60 && (!best || bd > best.bd)) best = { a: i, b: j, bd }; }
    if (!best) return null; const st = [glads[best.a].style, glads[best.b].style];
    const kind = st.includes('murmillo') ? 'wall' : st.includes('retiarius') || st.includes('hoplomachus') ? 'pincer' : 'storm';
    return { a: best.a, b: best.b, kind };
  };

  // ---------- recruits & market ----------
  LM.genRecruit = (S) => {
    const eye = ((S.perks || {}).eye || 0) * 0.08; const ml = LM.maxLeague(S); const lvl = 1 + Math.floor(ml * 3.2 + rnd() * 2);
    const g = makeGlad({ lvl, q: clamp(rnd() * 0.85 + eye, 0, 1), id: S.nextId++ });
    g.act = 'rest'; LM.assignStory(g); g.cost = Math.round(70 + LM.stars(g) * 45 + lvl * 38); return g;
  };
  LM.ensureShops = (S) => {
    if (!S.recruits) S.recruits = [LM.genRecruit(S), LM.genRecruit(S), LM.genRecruit(S)];
    if (!S.market) LM.rerollMarket(S);
  };
  LM.rerollMarket = (S) => {
    const ml = LM.maxLeague(S); const luck = LM.bfx(S, 'shrine').v + ((S.perks || {}).luck || 0) * 0.05;
    S.market = []; for (let i = 0; i < 6; i++) S.market.push(genItem(rnd, { league: ml, ilvl: 2 + ml * 5 + Math.floor(S.week / 6), luck }));
    const sp = genItem(rnd, { league: Math.min(3, ml + 1), ilvl: 3 + ml * 5 + Math.floor(S.week / 6), rar: Math.min(4, 2 + (ml >= 2 ? 1 : 0)), luck }); sp.sp = true; S.market.push(sp); LM.raid(S);
  };
  LM.hire = (S, g) => {
    if (S.glads.length >= LM.rosterCap(S)) return 'Barracks full'; if (S.gold < g.cost) return 'Not enough gold';
    LM.apprentice(S, g); S.gold -= g.cost; S.recruits = S.recruits.filter((x) => x !== g); delete g.cost; S.glads.push(g); return '';
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
    S.legends = S.legends || []; const pen = { gold: 40 + g.lvl * 15 + g.rec.w * 3, fame: 20 + g.rec.w * 2 }; S.gold += pen.gold; S.fame += pen.fame;
    S.legends.push({ name: g.name, nick: g.nick, style: g.style, lvl: g.lvl, best, w: g.rec.w, l: g.rec.l, skin: g.skin, hair: g.hair, plume: g.plume, face: g.face, title: g.title || '', wk: S.week });
    S.lastRetire = pen; LM.release(S, g); return '';
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

  // ---------- training drill (tap-timing minigame) ----------
  LM.drillMult = (acc) => (acc >= 0.9 ? 0.4 : acc >= 0.7 ? 0.25 : acc >= 0.45 ? 0.1 : 0);
  LM.canDrill = (S, g) => g.act && D.ACTS.find((a) => a.id === g.act).t === 'train' && !(g.drill && g.drill.week === S.week) && g.inj <= 0;
  LM.setDrill = (S, g, acc) => { g.drill = { week: S.week, m: LM.drillMult(acc) }; return g.drill.m; };

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
    sponsor: {
      t: 'A wealthy merchant wants to sponsor one of your fighters for a month.',
      c: [{ l: 'Accept the deal', run: (S) => { const g = rg(S); const gd = 25 + 15 * LM.maxLeague(S); S.sponsor = { weeks: 4, gold: gd, name: g.name, pledge: { n: 3, got: 0, bonus: gd * 4 } }; return `${g.name} wears the merchant's colors: +${gd} gold per week for 4 weeks. Pledge: win 3 fights in that time for a ${gd * 4} gold bonus.`; } }, { l: 'Decline', run: () => 'The merchant tips his hat and leaves.' }],
    },
    priest: {
      t: 'A traveling priest offers a blessing for the whole ludus.',
      c: [{ l: 'Blessing of vigor (+15 energy)', run: (S) => { S.glads.forEach((g) => { g.en = clamp(g.en + 15, 0, 100); }); return 'Everyone feels refreshed.'; } }, { l: 'Blessing of spirit (+20 morale)', run: (S) => { S.glads.forEach((g) => { g.mo = clamp(g.mo + 20, 0, 100); }); return 'Spirits are sky high.'; } }, { l: 'Blessing of fortune (+25 fame)', run: (S) => { S.fame += 25; return 'Word of the blessing spreads. +25 fame.'; } }],
    },
    champion: {
      t: 'A retired champion offers a private masterclass for a fee.',
      c: [{ l: 'Pay 120 gold', run: (S) => { if (S.gold < 120) return 'You cannot afford it.'; const g = S.glads.slice().sort((a, b) => b.lvl - a.lvl)[0]; const s = pick(D.STATS); S.gold -= 120; g.st[s] += 6; return `${g.name} gained +6 ${D.SA[s]} from the masterclass.`; } }, { l: 'Politely refuse', run: () => 'The old champion shrugs.' }],
    },
    defector: {
      t: 'A fighter from a rival ludus asks to defect to your school.',
      c: [{ l: 'Welcome them', run: (S) => { if (S.glads.length >= LM.rosterCap(S)) return 'Your barracks are full, so they walk on.'; const ml = LM.maxLeague(S); const g = makeGlad({ lvl: 1 + ml * 3 + Math.floor(rnd() * 3), q: 0.6, id: S.nextId++, randRune: true }); g.act = 'rest'; LM.assignStory(g); S.glads.push(g); return `${g.name} (${D.STYLES[g.style].n}, Lv ${g.lvl}) joins your ludus!`; } }, { l: 'Send them away', run: () => 'Loyalty matters. They leave.' }],
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
    const gain = LM.laurelsFor(S); const keep = { fac: { sen: Math.floor(S.fac.sen / 2), mer: Math.floor(S.fac.mer / 2), ple: Math.floor(S.fac.ple / 2) }, perks: S.perks, laurels: S.laurels + gain, legends: S.legends, name: S.name, color: S.color, ascensions: (S.ascensions || 0) + 1, sound: S.sound, flags: { tutor: true }, stats: Object.assign({}, S.stats) };
    const N = LM.newGame({ name: keep.name, color: keep.color, perks: keep.perks, laurels: keep.laurels, legends: keep.legends, ascensions: keep.ascensions, sound: keep.sound });
    N.stats = keep.stats; N.fac = keep.fac; N.trophies = S.trophies || {};
    const snap = S.glads.concat(S.ghosts || []).filter((g) => g.st).sort((a, b) => b.lvl - a.lvl).slice(0, 6).map((g) => { const c = JSON.parse(JSON.stringify(g)); c.lud = 'Ghost of ' + S.name; c.act = 'rest'; return c; });
    N.ghosts = snap; return N;
  };

  // ---------- state ----------
  LM.newGame = (o) => {
    o = o || {}; const perks = o.perks || {};
    const S = {
      v: 1, name: o.name || 'Ludus Maximus', color: o.color || 0, seed: Math.floor(rnd() * 1e9).toString(36), week: 1, season: 1,
      gold: 250 + 150 * (perks.start || 0), fame: 0, laurels: o.laurels || 0, perks, rows: 2, plots: new Array(16).fill(null), glads: [], nextId: 1, items: [],
      fac: { sen: 0, mer: 0, ple: 0 }, sl: { fame: 0, wins: 0, losses: 0, tour: 0 }, runes: { k: D.RUNE_START.k.slice(), m: D.RUNE_START.m.slice() }, relics: [], relicOn: [], entries: {}, menu: 'barley', rivals: {}, contracts: [], legends: o.legends || [], bonds: {}, market: null, recruits: null, pendingEv: null,
      stats: { fights: 0, wins: 0, losses: 0, tourneys: 0, spares: 0, weeks: 0, contracts: 0 }, flags: o.flags || {}, ascensions: o.ascensions || 0, sound: o.sound !== false,
    };
    S.plots[6] = { b: 'kitchen', l: 1 }; S.plots[5] = { b: 'barracks', l: 1 + Math.min(1, perks.start || 0) }; S.plots[2] = { b: 'palaestra', l: 1 };
    LM.fillContracts(S); LM.ensureShops(S); return S;
  };
  const KEY = 'ludus_maximus_v1';
  LM.save = (S) => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be blocked */ } };
  LM.load = () => { try { const t = localStorage.getItem(KEY); if (!t) return null; const S = JSON.parse(t); return S && S.v === 1 ? LM.migrate(S) : null; } catch (e) { return null; } };
  LM.migrate = (S) => {
    S.fac = S.fac || { sen: 0, mer: 0, ple: 0 }; S.trophies = S.trophies || {}; S.sl = S.sl || { fame: S.fame || 0, wins: (S.stats || {}).wins || 0, losses: (S.stats || {}).losses || 0, tour: (S.stats || {}).tourneys || 0 };
    (S.glads || []).forEach((g) => { if (!g.story) LM.assignStory(g); });
    S.runes = S.runes || { k: D.RUNE_START.k.slice(), m: D.RUNE_START.m.slice() }; S.relics = S.relics || []; S.relicOn = S.relicOn || [];
    (S.glads || []).concat(S.ghosts || []).forEach((g) => {
      g.pend = g.pend || (g.pick ? [{ t: 'tech', o: g.pick }] : []); delete g.pick; g.mast = g.mast || []; g.rune = g.rune || { k: 'lethal', m: ['celerity', 'coup'] };
      if (g.ult2 === undefined) g.ult2 = null; if (g.lvl >= 8 && !g.ult2 && !g.pend.some((p) => p.t === 'ult')) g.pend.push({ t: 'ult', o: ult2Picks() });
    });
    return S;
  };
  LM.wipe = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  LM.exportCode = (S) => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  LM.importCode = (t) => { try { const S = JSON.parse(decodeURIComponent(escape(atob(t.trim())))); return S && S.v === 1 && S.plots ? LM.migrate(S) : null; } catch (e) { return null; } };

  G.LM = LM;
  if (typeof module !== 'undefined') module.exports = LM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
