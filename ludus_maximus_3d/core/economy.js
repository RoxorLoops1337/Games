// Ludus Maximus 3D: depth wave 10, module "economy" (no DOM). Loaded after arena.js (index.html script tag; in Node arena.js requires it at its tail).
// ECONOMY AND WORLD layer: the weekly ledger, loans, the fighter auction, the caravan and the back alley, the bookmaker and political favors,
// hired staff, and the province circuit. Pure functions on LM and data on the optional save object S.eco (created lazily, old saves load untouched).
// Rules kept: optional save fields only, no rnd() draws (every roll here is seeded from S.seed + week, so the combat stream order never changes),
// wrappers keep the old behaviour while S.eco is absent or L.economy.off is set (the balance tool uses that for its "before" run).
(function (G) {
  const D = G.LM_D, L = G.LM;
  if (!D || !L || L.economy) return;
  const EC = L.economy = { ver: 1, off: false };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const rg = (S, tag) => L.mulberry(L.hash(String(S.seed) + '|eco|' + tag));   // a private stream: never touches the combat random stream
  const rr = (S, tag) => rg(S, tag)();
  const pickR = (arr, r) => arr[Math.floor(r() * arr.length)];
  const ml = (S) => L.maxLeague(S);
  const tierOf = (S, id) => L.facTier(S, id);
  const QN = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const quarter = (wk) => Math.floor(((wk - 1) % 12) / 3);
  L.quarterName = (wk) => QN[quarter(wk)];

  // =====================================================================  STATE
  /** the economy record, created on first touch. Every field is optional and repaired here, so a damaged or old save never breaks a screen. */
  L.eco = (S) => {
    if (!isObj(S.eco)) S.eco = {};
    const E = S.eco;
    for (const k of ['loans', 'ledger', 'bets', 'hist', 'betLog']) if (!Array.isArray(E[k])) E[k] = [];
    for (const k of ['cur', 'staff', 'cargo', 'fav', 'res', 'auc', 'stat', 'ren']) if (!isObj(E[k])) E[k] = {};
    if (!fin(E.sus)) E.sus = 0;
    if (!fin(E.arrears)) E.arrears = 0;
    return E;
  };
  const stat = (S, k, n) => { const E = L.eco(S); E.stat[k] = (E.stat[k] || 0) + (n == null ? 1 : n); };
  const note = (S, rep, t) => { if (rep && rep.notes) rep.notes.push(t); };
  const pay = (S, n) => { const p = Math.max(0, Math.min(S.gold, Math.round(n))); S.gold -= p; return p; };

  // =====================================================================  1. FINANCES
  /** governor's tribute: nothing until the province notices you (fame 200), then a share of your standing. Eased by the Senate and by the clerk favor. */
  L.tributeInfo = (S) => {
    const E = L.eco(S), base = S.fame < 200 ? 0 : Math.round(clamp((S.fame - 150) * 0.011, 0, 90)), cuts = [];
    let mul = 1;
    if (tierOf(S, 'sen') >= 2) { mul -= 0.25; cuts.push('Senate standing -25%'); }
    if ((E.fav.clerk || 0) >= S.week) { mul -= 0.6; cuts.push('Clerk bribed -60%'); }
    return { base, amount: Math.round(base * Math.max(0.1, mul)), cuts };
  };
  L.tribute = (S) => L.tributeInfo(S).amount;
  /** only the grand buildings (level 3 and up) cost money to keep standing */
  L.buildingUpkeep = (S) => S.plots.reduce((a, p) => a + (p && p.l >= 3 ? (p.l - 2) * 4 : 0), 0);
  L.lodging = (S) => (L.townNow(S) ? Math.round(S.glads.length * 5) : 0);
  L.foodCost = (S) => {
    if (L.fest(S, S.week) === 'ceres') return 0;
    const menu = D.MENUS.find((m) => m.id === S.menu) || D.MENUS[0], m = L.menuOk(S, menu) ? menu : D.MENUS[0];
    return Math.round(m.c * S.glads.length * (1 - L.staffFx(S).food));
  };
  L.loanDue = (S) => L.eco(S).loans.reduce((a, l) => a + l.pay, 0);
  /** the fixed weekly bill, itemised. wages = the gladiators' keep (the sim's own upkeep). */
  L.weeklyBill = (S) => {
    const wages = L.fest(S, S.week) === 'saturn' ? 0 : L.upkeep(S);
    const o = { food: L.foodCost(S), wages, staff: L.staffWage(S), building: L.buildingUpkeep(S), tribute: L.tribute(S), lodging: L.lodging(S), loans: L.loanDue(S) };
    o.total = o.food + o.wages + o.staff + o.building + o.tribute + o.lodging + o.loans; return o;
  };
  L.weeklyFixedIncome = (S) => {
    const o = { market: L.weeklyIncome(S), faction: L.facPerks(S).weekly, patron: S.sponsor && S.sponsor.weeks > 0 ? S.sponsor.gold : 0 };
    o.total = o.market + o.faction + o.patron; return o;
  };
  /** average prize and goal income of the last four weeks of the ledger, 0 with no history */
  L.recentPrize = (S) => { const l = L.eco(S).ledger.slice(-4); return l.length ? Math.round(l.reduce((a, x) => a + (x.prize || 0) + (x.goals || 0), 0) / l.length) : 0; };
  /** the next n weeks: expected income and costs, with the gold you would hold if you earned the recent average */
  L.projection = (S, n) => {
    n = n || 4; const out = []; let gold = S.gold; const prize = L.recentPrize(S);
    const loans = L.eco(S).loans.map((l) => ({ pay: l.pay, left: l.left, bal: l.bal, rate: l.rate }));
    for (let i = 0; i < n; i++) {
      const wk = S.week + i, fi = L.weeklyFixedIncome(S), b = L.weeklyBill(S);
      const lp = loans.reduce((a, l) => a + (l.left > 0 ? Math.min(l.pay, l.bal * (1 + l.rate)) : 0), 0);
      const exp = b.food + b.wages + b.staff + b.building + b.tribute + b.lodging + lp;
      const inc = fi.total + prize; gold = gold + inc - exp;
      loans.forEach((l) => { if (l.left > 0) { l.bal = Math.max(0, l.bal * (1 + l.rate) - l.pay); l.left--; } });
      out.push({ wk, income: Math.round(inc), fixed: Math.round(fi.total), prize, expense: Math.round(exp), loans: Math.round(lp), net: Math.round(inc - exp), gold: Math.round(gold) });
    }
    return out;
  };

  // ---- loans
  const LENDERS = {
    temple: { n: 'Temple Pawnbroker', who: 'A priest with a ledger', rate: 0.02, fame: 0, terms: [4, 8], max: (S) => 120 + Math.round(S.fame * 0.15), harsh: 0, d: 'Cheap and patient. Missed payments cost you standing, not property.' },
    guild: { n: 'Guild of Moneychangers', who: 'A banker with soft hands', rate: 0.035, fame: 60, terms: [4, 8, 12], max: (S) => 180 + Math.round(S.fame * 0.35), harsh: 1, d: 'Fair terms for known names. The Merchants shave a little off the rate.' },
    usurer: { n: 'Gaius the Usurer', who: 'A man who smiles too often', rate: 0.07, fame: 0, terms: [4, 6], max: (S) => 260 + Math.round(S.fame * 0.5), harsh: 2, d: 'Lends to anyone, fast, and takes what he is owed. Dear.' },
  };
  L.LENDERS = LENDERS; L.LENDER_IDS = Object.keys(LENDERS);
  L.loanRate = (S, id) => Math.max(0.012, LENDERS[id].rate - (id === 'guild' ? 0.004 * tierOf(S, 'mer') : 0) - (id === 'temple' ? 0.002 * tierOf(S, 'ple') : 0));
  const annuity = (P, r, n) => (n <= 0 ? P : Math.ceil((P * r) / (1 - Math.pow(1 + r, -n))));
  L.debtTotal = (S) => L.eco(S).loans.reduce((a, l) => a + l.bal, 0);
  /** how much you may owe in all: grows with fame and with what you actually earn */
  L.creditLimit = (S) => Math.round(100 + S.fame * 0.35 + 3 * (L.recentPrize(S) + L.weeklyFixedIncome(S).total));
  L.inDebtChapter = (S) => !!L.eco(S).debt;
  L.loanQuote = (S, id, amount, weeks) => {
    const r = L.loanRate(S, id), pay = annuity(amount, r, weeks), total = pay * weeks;
    return { rate: r, pay, total, cost: total - amount, weeks };
  };
  L.loanMax = (S, id) => {
    const Ld = LENDERS[id], lim = Math.max(0, L.creditLimit(S) - L.debtTotal(S));
    return Math.max(0, Math.min(Ld.max(S), lim));
  };
  L.loanWhy = (S, id, amount, weeks) => {
    const Ld = LENDERS[id]; if (!Ld) return 'Unknown lender';
    if (S.fame < Ld.fame) return `Needs ${Ld.fame} fame`;
    if (!Ld.terms.includes(weeks)) return 'Pick one of the offered terms';
    if (!(amount >= 50)) return 'Borrow at least 50 gold';
    const E = L.eco(S);
    if (E.loans.some((l) => l.lender === id)) return 'Repay your current loan from them first';
    if (E.loans.length >= 3) return 'Three loans is the most anyone will carry';
    // a destitute ludus can always ask the temple for a small loan, even in a debt chapter: nobody is left without a way back
    const alms = id === 'temple' && S.gold < 50 && amount <= 100;
    if (!alms) {
      if (E.debt) return 'Your creditors are watching: clear the overdue payments first';
      if (amount > L.loanMax(S, id)) return `Their limit for you is ${L.loanMax(S, id)} gold`;
    }
    return '';
  };
  L.loanTake = (S, id, amount, weeks) => {
    const why = L.loanWhy(S, id, amount, weeks); if (why) return why;
    const E = L.eco(S), q = L.loanQuote(S, id, amount, weeks);
    E.loans.push({ id: 'ln' + S.week + id, lender: id, principal: amount, bal: amount, rate: q.rate, left: weeks, pay: q.pay, missed: 0, wk: S.week });
    S.gold += amount; E.cur.borrowed = (E.cur.borrowed || 0) + amount; stat(S, 'loans'); L.forumAdd(S, `${LENDERS[id].n} lends ${amount} gold.`); return '';
  };
  /** pay extra (or all) of a loan now */
  L.loanRepay = (S, loanId, amount) => {
    const E = L.eco(S), l = E.loans.find((x) => x.id === loanId); if (!l) return 'No such loan';
    const n = Math.min(Math.round(amount), Math.ceil(l.bal), S.gold); if (n <= 0) return 'Nothing to pay';
    S.gold -= n; l.bal = Math.max(0, l.bal - n); E.cur.loanPaid = (E.cur.loanPaid || 0) + n;
    if (l.bal < 1) { E.loans = E.loans.filter((x) => x !== l); L.forumAdd(S, `${LENDERS[l.lender].n} is repaid in full.`); stat(S, 'repaid'); } else { l.pay = Math.min(l.pay, Math.ceil(l.bal * (1 + l.rate))); l.missed = 0; }
    if (!E.loans.some((x) => x.missed > 0)) E.debt = null;
    return '';
  };
  L.rollCost = (S, l) => Math.round(l.bal * l.rate + l.bal * 0.03);
  /** roll a loan over: four more weeks and a smaller installment, for a week of interest and a 3% fee, paid now */
  L.loanRoll = (S, loanId) => {
    const E = L.eco(S), l = E.loans.find((x) => x.id === loanId); if (!l) return 'No such loan';
    if (l.rolled >= 2) return 'They will not extend this loan again';
    const c = L.rollCost(S, l); if (S.gold < c) return `Needs ${c} gold`;
    S.gold -= c; E.cur.interest = (E.cur.interest || 0) + c; l.left += 4; l.rolled = (l.rolled || 0) + 1; l.pay = annuity(Math.ceil(l.bal), l.rate, l.left); return '';
  };
  const lenderVisit = (S, rep, l) => {
    const Ld = LENDERS[l.lender], E = L.eco(S);
    if (l.missed === 1) {
      if (Ld.harsh === 0) { S.fame = Math.max(0, S.fame - 3); note(S, rep, `${Ld.n}: a priest names your debt from the steps. -3 fame.`); }
      else { S.glads.forEach((g) => { g.mo = clamp(g.mo - 6, 0, 100); }); note(S, rep, `${Ld.n} sends a collector to the barracks. Morale drops.`); }
    } else if (l.missed === 2 && Ld.harsh === 0) {
      S.fame = Math.max(0, S.fame - 6); note(S, rep, `${Ld.n}: the priests read your name at the altar. -6 fame. They take no property.`);
    } else if (l.missed === 2) {
      const spare = S.items.slice().sort((a, b) => L.sellVal(b) - L.sellVal(a))[0];
      if (spare) {
        S.items = S.items.filter((x) => x !== spare); const v = Math.round(L.sellVal(spare) * (Ld.harsh === 2 ? 0.8 : 1)); l.bal = Math.max(0, l.bal - v);
        note(S, rep, `${Ld.n} seizes your ${spare.name} against the debt (worth ${v} gold of it).`); stat(S, 'seized');
        if (l.bal < 1) E.loans = E.loans.filter((x) => x !== l);
      } else { S.fame = Math.max(0, S.fame - 6); note(S, rep, `${Ld.n} finds nothing to seize and spreads word of it. -6 fame.`); }
    } else if (l.missed >= 3 && !E.debt) {
      E.debt = { from: S.week, by: l.lender }; stat(S, 'chapters');
      note(S, rep, `DEBT CHAPTER. Your creditors circle: a quarter of every purse goes to them until you pay what is overdue, and no new loans are offered.`);
      L.forumAdd(S, 'Creditors are calling at the ludus gate.');
    }
  };
  const loanWeek = (S, rep, E) => {
    let paid = 0, interest = 0;
    E.loans.slice().forEach((l) => {
      const int = Math.round(l.bal * l.rate); l.bal += int; interest += int;
      const due = Math.min(Math.ceil(l.bal), l.left <= 1 ? Math.ceil(l.bal) : l.pay), got = pay(S, due);
      l.bal = Math.max(0, l.bal - got); paid += got;
      if (got < due) {
        const short = due - got, fee = Math.round(short * (0.05 + 0.04 * LENDERS[l.lender].harsh)); l.bal += short * 0 + fee; l.missed++; l.left = Math.max(l.left, 1) + 1; l.pay = annuity(Math.ceil(l.bal), l.rate, Math.max(2, l.left));
        interest += fee; note(S, rep, `You could not pay ${LENDERS[l.lender].n} (${short} short, +${fee} late fee).`); stat(S, 'missed'); lenderVisit(S, rep, l);
      } else { l.missed = 0; l.left--; }
      if (l.bal < 1) { E.loans = E.loans.filter((x) => x !== l); note(S, rep, `${LENDERS[l.lender].n} is repaid in full.`); stat(S, 'repaid'); }
    });
    if (E.debt) {
      if (!E.loans.some((x) => x.missed > 0)) { E.debt = null; note(S, rep, 'Your creditors are quiet again. The debt chapter is closed.'); }
      else { S.fame = Math.max(0, S.fame - 2); E.cur.debtFame = 2; }
    }
    E.cur.loanPaid = (E.cur.loanPaid || 0) + paid; E.cur.interest = (E.cur.interest || 0) + interest;
  };

  // =====================================================================  4. STAFF
  const ROLES = {
    doctore: { n: 'Doctore', b: 'palaestra', ico: 'sword', d: 'Drills the whole roster: training gains rise.', per: 'Training gains +8% per level' },
    physician: { n: 'Physician', b: 'infirmary', ico: 'heart', d: 'Binds wounds: injuries heal a week sooner every few weeks.', per: 'An extra healed week every 5 - level weeks' },
    cook: { n: 'Cook', b: 'kitchen', ico: 'market', d: 'Keeps a good table: the menu costs less and everyone eats better.', per: 'Menu costs 10% less and +2 energy a week per level' },
    armourer: { n: 'Armourer', b: 'forge', ico: 'hammer', d: 'Knows every rivet: forge work is cheaper.', per: 'Upgrades and reforges cost 5% less per level' },
    spy: { n: 'Spymaster', b: 'scout', ico: 'scroll', d: 'Pays the right informers: more scouting, safer back alleys, auction rivals revealed.', per: 'Scouting +1 at level 2, alley risk -5 points per level' },
  };
  const QUIRKS = {
    doctore: [{ id: 'taskmaster', n: 'Taskmaster', d: 'Training +4% more', fx: { train: 0.04 } }, { id: 'kindly', n: 'Kindly', d: 'Everyone gains +1 morale a week', fx: { mo: 1 } }, { id: 'thrifty', n: 'Thrifty', d: 'Asks 20% less wage', fx: { wage: -0.2 } }],
    physician: [{ id: 'gentle', n: 'Gentle hands', d: 'Everyone gains +1 morale a week', fx: { mo: 1 } }, { id: 'quick', n: 'Quick stitcher', d: 'Heals a week sooner more often', fx: { heal: 1 } }, { id: 'thrifty', n: 'Thrifty', d: 'Asks 20% less wage', fx: { wage: -0.2 } }],
    cook: [{ id: 'feaster', n: 'Feaster', d: 'Everyone gains +1 morale a week', fx: { mo: 1 } }, { id: 'haggler', n: 'Haggler', d: 'Menu costs 6% less', fx: { food: 0.06 } }, { id: 'thrifty', n: 'Thrifty', d: 'Asks 20% less wage', fx: { wage: -0.2 } }],
    armourer: [{ id: 'exact', n: 'Exacting', d: 'Forge work 4% cheaper', fx: { upg: 0.04 } }, { id: 'salvager', n: 'Salvager', d: 'Spare gear sells for 5% more', fx: { sell: 0.05 } }, { id: 'thrifty', n: 'Thrifty', d: 'Asks 20% less wage', fx: { wage: -0.2 } }],
    spy: [{ id: 'gossip', n: 'Gossip', d: 'Alley risk 4 points lower', fx: { risk: 0.04 } }, { id: 'nose', n: 'Good nose', d: 'Sees rival bids a little closer', fx: { see: 1 } }, { id: 'thrifty', n: 'Thrifty', d: 'Asks 20% less wage', fx: { wage: -0.2 } }],
  };
  L.STAFF_ROLES = ROLES; L.STAFF_QUIRKS = QUIRKS;
  const staffWage = (st) => Math.max(8, Math.round((4 + 4 * st.lvl) * (1 + (st.fx.wage || 0))));
  const quirkFx = (role, id) => ((QUIRKS[role] || []).find((q) => q.id === id) || { fx: {} }).fx;
  L.staffOf = (S) => { const E = L.eco(S); return Object.keys(ROLES).filter((r) => isObj(E.staff[r])).map((r) => Object.assign({ role: r }, E.staff[r])); };
  L.staffEff = (S, role) => { const st = L.eco(S).staff[role]; if (!isObj(st)) return 0; const b = L.bfx(S, ROLES[role].b).l; return Math.min(st.lvl || 1, b); };
  L.staffWage = (S) => L.staffOf(S).reduce((a, st) => a + (st.wage || 0), 0);
  /** summed effect of every working staffer (level is capped by the building they work in) */
  L.staffFx = (S) => {
    const o = { train: 0, en: 0, mo: 0, heal: 0, healLvl: 0, food: 0, upg: 0, sell: 0, risk: 0, see: 0, scout: 0 };
    if (EC.off || !isObj(S.eco)) return o;
    const E = S.eco;
    Object.keys(ROLES).forEach((r) => {
      const st = E.staff && E.staff[r]; if (!isObj(st) || st.unpaid >= 2) return; const e = L.staffEff(S, r); if (!e) return; const q = quirkFx(r, st.quirk);
      if (r === 'doctore') o.train += 0.08 * e + (q.train || 0);
      if (r === 'physician') { o.healLvl = e + (q.heal || 0); }
      if (r === 'cook') { o.food += 0.1 * e + (q.food || 0); o.en += 2 * e; }
      if (r === 'armourer') { o.upg += 0.05 * e + (q.upg || 0); o.sell += q.sell || 0; }
      if (r === 'spy') { o.risk += 0.05 * e + (q.risk || 0); if (e >= 2) o.scout = 1; o.see += q.see || 0; }
      o.mo += q.mo || 0;
    });
    return o;
  };
  L.staffPool = (S) => {
    const per = Math.floor((S.week - 1) / 2), r = rg(S, 'pool' + per), m = ml(S), out = [];
    Object.keys(ROLES).forEach((role, i) => {
      if (r() < 0.78 || i === per % 5) {   // most roles have a candidate each fortnight; one is always on offer
        const lvl = 1 + (r() < 0.38 + 0.1 * m ? 1 : 0) + (r() < 0.1 + 0.1 * m ? 1 : 0), q = pickR(QUIRKS[role], r), name = pickR(D.FIRST, r) + ' ' + pickR(['the Elder', 'of Capua', 'the Greek', 'Longbeard', 'the Quiet', 'from Ostia', 'the Lame'], r);
        const st = { id: role + per, role, name, lvl, quirk: q.id, fx: q.fx };
        st.wage = staffWage(st); st.fee = st.wage * 4; out.push(st);
      }
    });
    return out.filter((c) => !isObj(L.eco(S).staff[c.role]) || L.eco(S).staff[c.role].id !== c.id);
  };
  L.hireWhy = (S, c) => {
    if (L.bfx(S, ROLES[c.role].b).l < 1) return `Build a ${D.BUILD[ROLES[c.role].b].n} first`;
    if (isObj(L.eco(S).staff[c.role])) return `You already have a ${ROLES[c.role].n}`;
    if (S.gold < c.fee) return `Needs ${c.fee} gold (four weeks' wage)`;
    return '';
  };
  L.hireStaff = (S, c) => {
    const why = L.hireWhy(S, c); if (why) return why;
    S.gold -= c.fee; L.eco(S).staff[c.role] = { id: c.id, name: c.name, lvl: c.lvl, quirk: c.quirk, fx: c.fx, wage: c.wage, since: S.week, unpaid: 0 }; stat(S, 'hired'); return '';
  };
  L.fireStaff = (S, role) => { const E = L.eco(S), st = E.staff[role]; if (!isObj(st)) return 'Nobody there'; const sev = st.wage; if (S.gold < sev) return `Severance is ${sev} gold`; S.gold -= sev; delete E.staff[role]; return ''; };
  L.staffUpgrade = (S, role) => { const st = L.eco(S).staff[role]; if (!isObj(st)) return 'Nobody there'; if (st.lvl >= 3) return 'At the top of the craft'; const c = 90 * st.lvl; if (S.gold < c) return `Needs ${c} gold`; S.gold -= c; st.lvl++; st.wage = staffWage(st); return ''; };

  // =====================================================================  2. AUCTION, CARAVAN, BACK ALLEY
  const SEASON_AUC = [
    { n: 'Spring', note: 'Fresh young talent comes to market.', price: 1, q: 0.1, lvl: 0 },
    { n: 'Summer', note: 'Games season: buyers are flush and prices run high.', price: 1.12, q: 0, lvl: 0 },
    { n: 'Autumn', note: 'Campaign veterans are sold off: higher levels.', price: 1.04, q: 0, lvl: 1 },
    { n: 'Winter', note: 'Cold, quiet and cheap.', price: 0.88, q: -0.04, lvl: 0 },
  ];
  const lotValue = (g) => 70 + L.stars(g) * 45 + g.lvl * 38;
  /** this week's auction: the same for everyone with the same seed. Quality and price follow the season and the festival. */
  L.auction = (S) => {
    const wk = S.week, r = rg(S, 'auc' + wk), SA = SEASON_AUC[quarter(wk)], fest = L.fest(S, wk), m = ml(S), E = L.eco(S);
    if (E.auc.wk !== wk) E.auc = { wk, res: {}, bid: {} };
    const festMul = fest === 'saturn' ? 0.8 : fest === 'mars' ? 1.05 : 1, rivals = L.ludiInit(S).list;
    const n = 3 + (fest ? 1 : 0), lots = [];
    L.withRandom(rg(S, 'aucgen' + wk), () => {
      for (let i = 0; i < n; i++) {
        const champ = i === 3 && fest === 'jupiter', boost = fest === 'mars' && i === 3;
        const lvl = Math.max(1, 1 + Math.floor(m * 3.2) + Math.floor(r() * 3) + SA.lvl + (champ ? 3 : 0) + (boost ? 1 : 0));
        const g = L.makeGlad({ r, lvl, q: clamp(0.4 + r() * 0.5 + SA.q + (champ ? 0.3 : 0), 0, 1), id: 'a' + wk + '_' + i, style: boost ? pickR(['murmillo', 'hoplomachus', 'dimachaerus'], r) : undefined, randRune: lvl >= 6 });
        g.act = 'rest'; L.assignStory(g);
        const value = Math.round(lotValue(g) * 1.12 * SA.price * festMul * (champ ? 1.4 : 1)), reserve = Math.round(value * 0.72);
        const interested = rivals.filter((l) => !l.ally && r() < (l.pers === 'greedy' ? 0.62 : 0.5));
        const bids = interested.slice(0, 2).map((l) => ({ id: l.id, name: l.name, pers: l.pers, ceil: Math.round(value * (0.74 + r() * 0.5) * (l.pers === 'greedy' ? 0.92 : l.pers === 'brutal' && ['dimachaerus', 'murmillo'].includes(g.style) ? 1.1 : 1)) }));
        lots.push({ id: wk + ':' + i, g, value, reserve, bids, feature: champ || boost });
      }
    });
    return { wk, quarter: SA.n, note: SA.note, fest, lots, res: E.auc.res };
  };
  L.auctionSees = (S) => (S.eco && (S.eco.fav.auc === S.week) ? 2 : L.staffFx(S).see ? 1 : 0) + (L.eco(S).staff.spy && L.staffEff(S, 'spy') >= 1 ? 1 : 0);   // 0 nothing, 1 count and range, 2+ exact ceilings
  /** the price you would pay winning with this max bid: just above the best rival, never above your bid */
  L.auctionPrice = (S, lot, bid) => {
    const top = lot.bids.reduce((a, b) => Math.max(a, b.ceil), 0), disc = (S.eco && S.eco.fav.auc === S.week) ? 0.9 : 1;
    return Math.round(Math.min(bid, Math.max(lot.reserve, top > 0 ? top * 1.05 : 0)) * disc);
  };
  L.auctionWhy = (S, lot, bid) => {
    const A = L.auction(S); if (A.res[lot.id]) return 'This lot is closed';
    if (L.inDebtChapter(S)) return 'Your creditors would seize the purchase: clear your debts first';
    if (bid < lot.reserve) return `The reserve is ${lot.reserve} gold`;
    if (S.glads.length >= L.rosterCap(S)) return 'Barracks full';
    if (S.gold < bid) return 'Not enough gold for that bid';
    return '';
  };
  L.auctionBid = (S, lotId, bid) => {
    const A = L.auction(S), lot = A.lots.find((x) => x.id === lotId); if (!lot) return { err: 'No such lot' };
    const why = L.auctionWhy(S, lot, bid); if (why) return { err: why };
    const top = lot.bids.slice().sort((a, b) => b.ceil - a.ceil)[0];
    if (top && top.ceil >= bid) {
      A.res[lot.id] = { won: false, by: top.name }; L.eco(S).auc.res = A.res; stat(S, 'aucLost');
      const lu = L.ludiOf(S, top.id); if (lu) lu.rel = clamp(lu.rel + 1, -100, 100);
      L.forumAdd(S, `${top.name} outbid you for ${lot.g.name}.`); return { won: false, by: top.name, top: top.ceil };
    }
    const price = L.auctionPrice(S, lot, bid); S.gold -= price;
    const g = JSON.parse(JSON.stringify(lot.g)); g.id = S.nextId++; L.apprentice(S, g); S.glads.push(g);
    A.res[lot.id] = { won: true, price, id: g.id }; L.eco(S).auc.res = A.res; stat(S, 'aucWon'); L.eco(S).cur.auction = (L.eco(S).cur.auction || 0) + price;
    lot.bids.forEach((b) => { const lu = L.ludiOf(S, b.id); if (lu) lu.rel = clamp(lu.rel - 2, -100, 100); });
    L.forumAdd(S, `You won ${g.name} at auction for ${price} gold.`);
    return { won: true, price, g };
  };

  // ---- the caravan: items with price swings, trade goods, pelts
  const GOODS = {
    grain: { n: 'Grain', p: 22, sw: [0.95, 1.05, 0.8, 1.25] },
    oil: { n: 'Olive oil', p: 36, sw: [1.1, 0.9, 0.85, 1.2] },
    wine: { n: 'Falernian wine', p: 52, sw: [1.0, 1.2, 0.82, 0.98] },
    silk: { n: 'Silk', p: 96, sw: [1.15, 0.86, 1.05, 1.0] },
  };
  L.GOODS = GOODS;
  L.cargoCap = (S) => 6 + 4 * L.bfx(S, 'market').l;
  L.cargoUnits = (S) => Object.keys(GOODS).reduce((a, k) => a + ((L.eco(S).cargo[k] || {}).n || 0), 0);
  L.caravanHere = (S) => rr(S, 'car' + S.week) < 0.68 || L.fest(S, S.week) === 'saturn';
  /** unit price of a trade good this week: the season swing, a seeded wobble, and the town you are in */
  L.goodPrice = (S, id) => {
    const G2 = GOODS[id], t = L.townNow(S), w = 0.9 + 0.2 * rr(S, 'good' + id + S.week);
    const tm = t && t.goods && t.goods[id] ? t.goods[id] : 1;
    return Math.max(4, Math.round(G2.p * G2.sw[quarter(S.week)] * w * tm));
  };
  L.caravan = (S) => {
    const wk = S.week, here = L.caravanHere(S); if (!here) return { here: false, items: [], wk };
    const r = rg(S, 'caravan' + wk), items = [], m = ml(S);
    L.withRandom(rg(S, 'cargen' + wk), () => {
      for (let i = 0; i < 5; i++) {
        const rar = i === 0 && m >= 1 ? 3 : i === 1 ? 2 : undefined, it = L.genItem(r, { league: Math.min(3, m + (i === 0 ? 1 : 0)), ilvl: 3 + m * 5 + Math.floor(wk / 6) + (i === 0 ? 2 : 0), rar, luck: 0.05 });
        const swing = Math.round((0.72 + r() * 0.66) * 100) / 100, base = L.buyVal(S, it);
        items.push({ it, swing, price: Math.max(1, Math.round(base * swing * (0.95 + 0.05 * quarter(wk) / 3))) });
      }
    });
    return { here: true, wk, items, peltMul: Math.round((0.85 + 0.5 * rr(S, 'pelt' + wk) + (quarter(wk) === 3 ? 0.1 : 0)) * 100) / 100 };
  };
  L.caravanBuy = (S, i) => {
    const C = L.caravan(S), E = L.eco(S); if (!C.here) return 'The caravan has moved on';
    const row = C.items[i]; if (!row) return 'Sold'; if ((E.car || {}).wk === S.week && (E.car.sold || []).includes(i)) return 'Sold';
    if (S.gold < row.price) return 'Not enough gold';
    S.gold -= row.price; L.addItem(S, row.it); E.car = E.car && E.car.wk === S.week ? E.car : { wk: S.week, sold: [] }; E.car.sold.push(i); E.cur.caravan = (E.cur.caravan || 0) + row.price; stat(S, 'caravanBuys'); return '';
  };
  L.caravanSold = (S, i) => { const c = L.eco(S).car; return !!(c && c.wk === S.week && (c.sold || []).includes(i)); };
  L.goodBuy = (S, id, n) => {
    if (!L.caravanHere(S)) return 'The caravan has moved on';
    const p = Math.round(L.goodPrice(S, id) * 1.05), E = L.eco(S); n = Math.max(1, n | 0);
    if (L.cargoUnits(S) + n > L.cargoCap(S)) return `Your store holds ${L.cargoCap(S)} crates (Market level adds room)`;
    if (S.gold < p * n) return 'Not enough gold';
    S.gold -= p * n; const c = E.cargo[id] = E.cargo[id] || { n: 0, cost: 0 }; c.cost += p * n; c.n += n; E.cur.trade = (E.cur.trade || 0) - p * n; return '';
  };
  L.goodSell = (S, id, n) => {
    if (!L.caravanHere(S)) return 'The caravan has moved on';
    const E = L.eco(S), c = E.cargo[id]; if (!c || c.n < 1) return 'You hold none'; n = Math.min(Math.max(1, n | 0), c.n);
    const p = Math.round(L.goodPrice(S, id) * 0.95), basis = c.cost / c.n; S.gold += p * n; c.cost -= basis * n; c.n -= n; if (c.n < 1) delete E.cargo[id];
    E.cur.trade = (E.cur.trade || 0) + p * n; stat(S, 'tradeProfit', Math.round(p * n - basis * n)); return '';
  };
  L.peltSell = (S, kind) => {
    const C = L.caravan(S); if (!C.here) return { err: 'The caravan has moved on' };
    const V = L.venatio(S), n = V.pelts[kind] || 0; if (!n) return { err: 'No pelts' };
    const g = Math.round(n * L.peltValue(S, kind) * C.peltMul); V.pelts[kind] = 0; S.gold += g; L.eco(S).cur.trade = (L.eco(S).cur.trade || 0) + g; return { gold: g, n };
  };

  // ---- the back alley: stolen goods at half price, with the odds written on the sign
  L.alleyHere = (S) => rr(S, 'alley' + S.week) < 0.6;
  L.suspicion = (S) => L.eco(S).sus;
  L.susLabel = (s) => (s < 20 ? 'Calm' : s < 45 ? 'Watched' : s < 70 ? 'Suspected' : 'Hunted');
  /** the chance the Senate learns of a purchase: base by rarity, up with suspicion, down with the Senate's favour, the spy, a bribed clerk */
  L.alleyRisk = (S, it) => clamp(0.16 + 0.05 * it.rar + 0.004 * L.suspicion(S) - 0.03 * tierOf(S, 'sen') - L.staffFx(S).risk, 0.04, 0.8);
  L.alley = (S) => {
    if (!L.alleyHere(S)) return { here: false, items: [] };
    const wk = S.week, r = rg(S, 'alleyg' + wk), m = ml(S), items = [], E = L.eco(S);
    L.withRandom(rg(S, 'alleygen' + wk), () => {
      for (let i = 0; i < 3; i++) {
        const it = L.genItem(r, { league: Math.min(3, m + 1), ilvl: 4 + m * 5 + Math.floor(wk / 6), rar: Math.min(4, 2 + (i === 2 ? 1 : 0) + (m >= 2 && i === 0 ? 1 : 0)) });
        items.push({ it, price: Math.max(1, Math.round(L.buyVal(S, it) * 0.5)), risk: L.alleyRisk(S, it), i });
      }
    });
    const gone = E.alley && E.alley.wk === wk ? E.alley.gone : [];
    return { here: true, wk, items: items.filter((x) => !gone.includes(x.i)) };
  };
  L.alleyBuy = (S, i) => {
    const A = L.alley(S), row = A.items.find((x) => x.i === i), E = L.eco(S); if (!row) return { err: 'Gone' };
    if (S.gold < row.price) return { err: 'Not enough gold' };
    S.gold -= row.price; E.alley = E.alley && E.alley.wk === S.week ? E.alley : { wk: S.week, gone: [] }; E.alley.gone.push(i);
    const caught = rr(S, 'caught' + S.week + row.it.id) < row.risk;
    if (caught) {
      const fine = Math.round(row.price * 0.3), got = pay(S, fine); E.sus = clamp(E.sus + 18, 0, 100); S.fame = Math.max(0, S.fame - 5); L.facGain(S, 'sen', -6); stat(S, 'caught');
      L.forumAdd(S, 'An informer names you at the Senate: stolen goods.'); return { caught: true, fine: got, item: row.it, risk: row.risk };
    }
    L.addItem(S, row.it); E.sus = clamp(E.sus + 6 + (row.it.rar >= 3 ? 4 : 0), 0, 100); stat(S, 'alleyBuys'); E.cur.alley = (E.cur.alley || 0) + row.price;
    return { caught: false, item: row.it, risk: row.risk };
  };

  // =====================================================================  3. BETTING AND FAVORS
  L.betCaps = (S) => ({ one: Math.min(Math.round(S.gold * 0.25), 30 + 40 * (ml(S) + 1)), week: 60 + 80 * (ml(S) + 1), count: 3 });
  L.vig = (S) => Math.max(0.04, 0.11 - 0.015 * tierOf(S, 'mer'));
  const payMult = (S, p) => Math.round(clamp((1 - L.vig(S)) / clamp(p, 0.08, 0.92), 1.1, 8) * 100) / 100;
  /** this week's marquee bouts between other schools' fighters. The book half-trusts the public view; a good scout can still see more. */
  const oddsCache = new Map();
  L.board = (S) => {
    const wk = S.week, m = ml(S), r = rg(S, 'board' + wk), riv = L.rivals(S, m), bouts = [];
    L.withRandom(rg(S, 'boardgen' + wk), () => {
      const idx = riv.map((_, i) => i).sort(() => r() - 0.5);
      for (let i = 0; i < 3; i++) {
        const lvl = D.LEAGUES[m].lvl + Math.floor(r() * 4) + Math.floor(wk / 12) * 2, a = L.mkOpp(S, riv[idx[i * 2]], lvl, 1, r, m, false), b = L.mkOpp(S, riv[idx[i * 2 + 1]], lvl + Math.round(r() * 2 - 1), 1, r, m, false);
        L.uniqueNames([a], [b]); a.id = 'b' + wk + i + 'a'; b.id = 'b' + wk + i + 'b';
        const p = bookP(S, a, b, wk + ':' + i);
        bouts.push({ id: wk + ':' + i, a, b, p, ma: payMult(S, p), mb: payMult(S, 1 - p) });
      }
    });
    return bouts;
  };
  /** what the fight is really worth (simulated, cached per bout): the bookmaker's own scouts and yours both read this */
  const trueP = (S, a, b, id) => { const key = S.seed + '|' + id; if (oddsCache.has(key)) return oddsCache.get(key); const v = L.odds(null, [a], [b], 'bal', 16); if (oddsCache.size > 80) oddsCache.clear(); oddsCache.set(key, v); return v; };
  /** the book prices a bout half on public knowledge (level, style) and half on its own scouts: the vig comes on top */
  const bookP = (S, a, b, id) => clamp(0.5 * L.publicOdds([a], [b]) + 0.5 * trueP(S, a, b, id), 0.08, 0.92);
  /** what your scouts say the real chance is (needs scouting level 2) */
  L.boardTruth = (S, bout) => (L.scoutLevel(S) < 2 ? null : trueP(S, bout.a, bout.b, bout.id));
  const betOpts = (S, E) => ({ n: E.bets.length, staked: E.bets.reduce((a, b) => a + b.stake, 0) });
  L.betWhy = (S, stake, o) => {
    const E = L.eco(S), c = L.betCaps(S), u = betOpts(S, E);
    if (!(stake >= 5)) return 'Stake at least 5 gold'; if (u.n >= c.count) return `${c.count} bets a week is the limit`;
    if (stake > c.one) return `One bet may not top ${c.one} gold (a quarter of your purse)`; if (u.staked + stake > c.week) return `${c.week} gold of bets in a week is the limit`;
    if (S.gold < stake) return 'Not enough gold'; if (o && E.bets.some((b) => b.ref === o.ref && b.side === o.side)) return 'You already bet on that';
    return '';
  };
  /** bet on a marquee bout: side 'a' or 'b' */
  L.betBout = (S, boutId, side, stake) => {
    const bout = L.board(S).find((x) => x.id === boutId); if (!bout) return 'No such bout';
    const why = L.betWhy(S, stake, { ref: boutId, side }); if (why) return why;
    const E = L.eco(S); S.gold -= stake; E.bets.push({ kind: 'bout', ref: boutId, side, stake, mult: side === 'a' ? bout.ma : bout.mb, name: (side === 'a' ? bout.a : bout.b).name, vs: (side === 'a' ? bout.b : bout.a).name, wk: S.week });
    L.facGain(S, 'mer', 1); stat(S, 'bets'); return '';
  };
  /** your own entries this week that you may bet against: single duels and team clashes */
  L.againstOptions = (S) => Object.keys(S.entries).filter((k) => k.split(':')[0] === String(S.week)).map((k) => ({ key: k, ev: L.eventByKey(S, k), en: S.entries[k] })).filter((x) => x.ev && (x.ev.kind === 'duel' || x.ev.kind === 'team')).map((x) => {
    const mine = x.en.ids.map((id) => S.glads.find((g) => g.id === id)).filter(Boolean), p = L.publicOdds(x.ev.opps, mine);
    return { key: x.key, ev: x.ev, mine, p, mult: payMult(S, p) };
  });
  /** the temple and the crowd dislike a trainer who bets against his own man */
  L.betAgainst = (S, key, stake) => {
    const opt = L.againstOptions(S).find((x) => x.key === key); if (!opt) return 'Enter the fight first';
    const why = L.betWhy(S, stake, { ref: key, side: 'x' }); if (why) return why;
    const E = L.eco(S); S.gold -= stake;
    E.bets.push({ kind: 'against', ref: key, side: 'x', stake, mult: opt.mult, name: opt.ev.opps.map((o) => o.name).join(' & '), vs: opt.mine.map((g) => g.name).join(' & '), wk: S.week });
    L.facGain(S, 'ple', -5); L.facGain(S, 'mer', 1); try { L.sponsorRel(S, 'temple', -6); } catch (e) { /* no patron record */ }
    stat(S, 'betsAgainst'); return '';
  };
  const settleBets = (S, E, rep) => {
    const wk = S.week; let net = 0;
    E.bets.forEach((b) => {
      let won = null, text = '';
      if (b.kind === 'bout') {
        const bout = L.board(S).find((x) => x.id === b.ref);
        if (!bout) { S.gold += b.stake; return; }
        const F = L.withRandom(rg(S, 'bout' + b.ref), () => L.quick(L.mkUnits([bout.a], 'A', { noperf: true }), L.mkUnits([bout.b], 'B', { noperf: true })));
        won = (F.winner === 'A') === (b.side === 'a'); text = `${bout.a.name} v ${bout.b.name}`;
      } else {
        const r = E.res[b.ref]; if (r == null) { S.gold += b.stake; E.betLog.push({ wk, text: `Refunded: the fight was not fought`, net: 0 }); return; }
        won = r === 0; text = `Against ${b.vs}`;
      }
      if (won) {
        const w = Math.round(b.stake * b.mult); S.gold += w; net += w - b.stake; L.facGain(S, 'mer', 2); stat(S, 'betsWon');
        note(S, rep, `Bet won on ${b.name}: +${w - b.stake} gold.`);
        if (b.kind === 'against' && rr(S, 'leak' + b.ref + wk) < 0.35) { S.fame = Math.max(0, S.fame - 10); L.facGain(S, 'ple', -4); note(S, rep, `The crowd smells a fix. -10 fame.`); }
      } else { net -= b.stake; note(S, rep, `Bet lost on ${b.name}: -${b.stake} gold.`); }
      E.betLog.push({ wk, text, net: won ? Math.round(b.stake * b.mult) - b.stake : -b.stake });
    });
    E.bets = []; E.betLog = E.betLog.slice(-12); E.res = {}; E.cur.bets = net;
  };

  // ---- political favors
  const FAVORS = {
    clerk: { n: 'Grease the governor\'s clerk', base: 70, risk: 0.12, cd: 8, d: 'Tribute drops 60% for 6 weeks.', ico: 'coin', gain: 'Tribute -60% for 6 weeks' },
    senator: { n: 'Dine a senator', base: 110, risk: 0.08, cd: 4, d: 'A quiet dinner and a quiet word.', ico: 'scroll', gain: 'Senate standing +10' },
    editor: { n: 'Bribe the games editor', base: 90, risk: 0.15, cd: 6, d: 'Entry fees are halved for 3 weeks.', ico: 'arena', gain: 'Entry fees -50% for 3 weeks' },
    auctioneer: { n: 'Slip the auctioneer a purse', base: 50, risk: 0.18, cd: 2, d: 'This week you see every rival ceiling and pay 10% less.', ico: 'market', gain: 'See all rival bids, -10% price, this week' },
    temple: { n: 'Gift to the temple', base: 60, risk: 0, cd: 3, d: 'An honest offering. The plebs approve.', ico: 'heart', gain: 'The Plebs +8, temple patron +6' },
    magistrate: { n: 'Quiet the moneylender', base: 150, risk: 0.1, cd: 10, d: 'A magistrate reminds your creditors of the law: the debt chapter closes and missed payments are forgiven.', ico: 'shield', gain: 'Clears a debt chapter and missed payments' },
    toll: { n: 'Bribe the road wardens', base: 40, risk: 0.25, cd: 6, d: 'Your next journey on the circuit costs half.', ico: 'hammer', gain: 'Next trip costs 50% less' },
  };
  L.FAVORS = FAVORS; L.FAVOR_IDS = Object.keys(FAVORS);
  L.favorCost = (S, id) => Math.round(FAVORS[id].base * (1 + 0.5 * ml(S)));
  L.favorRisk = (S, id) => FAVORS[id].risk ? clamp(FAVORS[id].risk + 0.003 * L.suspicion(S) - 0.03 * tierOf(S, 'sen') - L.staffFx(S).risk * 0.5, 0.03, 0.7) : 0;
  L.favorWhy = (S, id) => {
    const E = L.eco(S), F = FAVORS[id]; if (!F) return 'Unknown favor';
    if ((E.fav['cd_' + id] || 0) > S.week) return `Again in ${E.fav['cd_' + id] - S.week} week${E.fav['cd_' + id] - S.week > 1 ? 's' : ''}`;
    if (S.gold < L.favorCost(S, id)) return `Needs ${L.favorCost(S, id)} gold`;
    if (id === 'clerk' && L.tributeInfo(S).base < 1) return 'You pay no tribute yet';
    if (id === 'magistrate' && !E.debt && !E.loans.some((l) => l.missed > 0)) return 'You are not in arrears';
    if (id === 'toll' && E.fav.toll) return 'Already arranged';
    if (id === 'auctioneer' && E.fav.auc === S.week) return 'Already done this week';
    return '';
  };
  L.favorDo = (S, id) => {
    const why = L.favorWhy(S, id); if (why) return { err: why };
    const E = L.eco(S), F = FAVORS[id], cost = L.favorCost(S, id), risk = L.favorRisk(S, id); S.gold -= cost; E.cur.favors = (E.cur.favors || 0) + cost; E.fav['cd_' + id] = S.week + F.cd; stat(S, 'favors');
    if (risk && rr(S, 'fav' + id + S.week) < risk) {
      E.sus = clamp(E.sus + 15, 0, 100); S.fame = Math.max(0, S.fame - 8); L.facGain(S, 'sen', -8); const fine = pay(S, cost);
      L.forumAdd(S, 'A bribe is exposed at the forum.'); return { caught: true, msg: `Caught. The money is gone, a fine of ${fine} follows, the Senate frowns and you lose 8 fame.`, risk };
    }
    let msg = F.gain + '.';
    if (id === 'clerk') E.fav.clerk = S.week + 6;
    else if (id === 'senator') L.facGain(S, 'sen', 10);
    else if (id === 'editor') E.fav.editor = S.week + 3;
    else if (id === 'auctioneer') E.fav.auc = S.week;
    else if (id === 'temple') { L.facGain(S, 'ple', 8); try { L.sponsorRel(S, 'temple', 6); } catch (e) { /* no record */ } }
    else if (id === 'magistrate') { E.debt = null; E.loans.forEach((l) => { l.missed = 0; }); }
    else if (id === 'toll') E.fav.toll = 1;
    return { caught: false, msg, risk };
  };
  /** Senate audit: when suspicion runs high the Senate looks into the books */
  const auditWeek = (S, rep, E) => {
    if (E.sus >= 50 && rr(S, 'audit' + S.week) < (E.sus - 45) / 110) {
      const fine = pay(S, Math.min(S.gold * 0.2, 40 + E.sus * 3)); S.fame = Math.max(0, S.fame - 6); L.facGain(S, 'sen', -5); E.sus = Math.round(E.sus * 0.5); stat(S, 'audits');
      note(S, rep, `A Senate auditor goes through your books. Fine ${fine} gold, -6 fame.`); E.cur.fines = (E.cur.fines || 0) + fine;
    }
    E.sus = clamp(E.sus - 3, 0, 100);
  };

  // =====================================================================  5. THE CIRCUIT
  const TOWNS = {
    ostia: { id: 'ostia', n: 'Ostia', fame: 0, x: 0.37, y: 0.28, weeks: 1, gold: 30, hosts: [0], purse: 1.18, fameMul: 1.04, theme: 'provincial', d: 'A harbour town with a small sand ring and loud sailors.', goods: { grain: 0.9, oil: 1.05 } },
    pompeii: { id: 'pompeii', n: 'Pompeii', fame: 60, x: 0.52, y: 0.47, weeks: 1, gold: 45, hosts: [0, 1], purse: 1.2, fameMul: 1.06, theme: 'provincial', d: 'A rich seaside town under a quiet mountain. Wine flows.', goods: { wine: 0.88, silk: 1.06 } },
    capua: { id: 'capua', n: 'Capua', fame: 220, x: 0.46, y: 0.37, weeks: 1, gold: 80, hosts: [1, 2], purse: 1.28, fameMul: 1.12, theme: 'capua', d: 'The old cradle of the sword. Every schoolmaster in Italy watches.', goods: { grain: 1.1, oil: 0.92 } },
    alexandria: { id: 'alexandria', n: 'Alexandria', fame: 600, x: 0.86, y: 0.82, weeks: 2, gold: 170, hosts: [2], purse: 1.35, fameMul: 1.15, theme: 'alexandria', d: 'The great harbour of the south. Silk, scholars and sharp bettors.', goods: { silk: 0.8, grain: 0.85, oil: 1.2 } },
    carthage: { id: 'carthage', n: 'Carthage', fame: 1100, x: 0.28, y: 0.8, weeks: 2, gold: 200, hosts: [2, 3], purse: 1.4, fameMul: 1.2, theme: 'carthage', d: 'A reborn city with a vast amphitheatre and a long memory.', goods: { oil: 0.8, wine: 1.15, silk: 1.1 } },
    rome: { id: 'rome', n: 'Rome', fame: 1800, x: 0.4, y: 0.15, weeks: 3, gold: 280, hosts: [3], purse: 1.5, fameMul: 1.25, theme: 'imperial', d: 'The Colosseum. The Emperor. There is nothing above this.', goods: { grain: 1.2, wine: 1.1, silk: 1.05, oil: 1.1 } },
  };
  L.TOWNS = TOWNS; L.TOWN_IDS = Object.keys(TOWNS);
  /** where you are in a given week: null = at home, 'road' = travelling, or the town object */
  L.townFor = (S, week) => {
    const hist = isObj(S.eco) && Array.isArray(S.eco.hist) ? S.eco.hist : []; let cur = null;
    for (let i = hist.length - 1; i >= 0; i--) { const h = hist[i]; if (h.from <= week) { cur = h; break; } }
    if (!cur) return null; if (week < cur.arrive) return 'road'; return cur.town === 'home' ? null : TOWNS[cur.town] || null;
  };
  L.townNow = (S) => { const t = L.townFor(S, S.week); return t && t !== 'road' ? t : null; };
  L.onRoad = (S) => L.townFor(S, S.week) === 'road';
  L.tripCost = (S, id) => {
    const T = id === 'home' ? { gold: 20, weeks: 1 } : TOWNS[id]; return { gold: Math.round(T.gold * ((isObj(S.eco) && S.eco.fav && S.eco.fav.toll) ? 0.5 : 1)), weeks: T.weeks };
  };
  L.tripWhy = (S, id) => {
    if (id !== 'home' && !TOWNS[id]) return 'Unknown town'; const cur = L.townFor(S, S.week + 1);
    if (id === 'home' ? !cur : cur && cur !== 'road' && cur.id === id) return id === 'home' ? 'You are home' : 'You are already there';
    if (cur === 'road') return 'Wait until you arrive';
    if (id !== 'home' && S.fame < TOWNS[id].fame) return `Needs ${TOWNS[id].fame} fame`;
    if (!S.glads.length) return 'You need fighters to travel'; const c = L.tripCost(S, id); if (S.gold < c.gold) return `Needs ${c.gold} gold`;
    return '';
  };
  /** leave next week. Entries in the weeks that change are refunded. */
  L.travel = (S, id) => {
    const why = L.tripWhy(S, id); if (why) return why;
    const E = L.eco(S), c = L.tripCost(S, id), from = S.week + 1; S.gold -= c.gold; if (E.fav.toll) delete E.fav.toll;
    Object.keys(S.entries).forEach((k) => { if (parseInt(k.split(':')[0], 10) >= from) L.withdraw(S, k); });
    E.hist.push({ town: id, from, arrive: from + c.weeks }); E.hist = E.hist.slice(-20); E.cur.travel = (E.cur.travel || 0) + c.gold; stat(S, 'trips');
    L.forumAdd(S, id === 'home' ? 'The ludus heads home.' : `The ludus sets out for ${TOWNS[id].n}.`); return '';
  };
  L.townRenown = (S, id) => (L.eco(S).ren[id] || 0);
  const ev0 = L.events;
  L.events = (S, week, league) => {
    const out = ev0(S, week, league);
    if (EC.off || !isObj(S.eco) || !Array.isArray(S.eco.hist) || !S.eco.hist.length) return out;
    const t = L.townFor(S, week); if (!t) return out;
    if (t === 'road') return [];
    if (!t.hosts.includes(league)) return out;
    const ren = 1 + Math.min(0.1, 0.02 * Math.floor((S.eco.ren && S.eco.ren[t.id] || 0) / 3));
    out.forEach((ev) => { ev.purse = Math.round(ev.purse * t.purse * ren); ev.fee = Math.round(ev.fee * t.purse); ev.fame = Math.round(ev.fame * t.fameMul); ev.theme = t.theme; ev.town = t.id; ev.where = t.n; });
    if (week % 2 === 1) {
      const Lg = D.LEAGUES[league], season = Math.ceil(week / 12), r = L.mulberry(L.hash(S.seed + '|town|' + week + '|' + league)), riv = L.rivals(S, league), sm = 1 + 0.2 * (season - 1);
      const lvl = Lg.lvl + D.DIFF[2].l + (season - 1) * 2 + Math.floor(((week - 1) % 12) / 4);
      const rv = riv[Math.floor(r() * riv.length)];
      const opp = L.withRandom(r, () => L.mkOpp(S, rv, lvl, D.DIFF[2].p, r, league, true));
      const purse = Math.round(Lg.purse * 2.4 * sm * t.purse * ren);
      out.push({ key: `${week}:${league}:x`, kind: 'duel', week, league, diff: 2, title: `${t.n} Showpiece`, size: 1, opps: [opp], purse, fame: Math.round(Lg.fameWin * 1.7 * t.fameMul), fee: Math.round(purse * 0.12), theme: t.theme, town: t.id, where: t.n, feature: true });
    }
    return out;
  };

  // =====================================================================  WRAPPERS ON THE SIM
  const train0 = L.weekTrain;
  L.weekTrain = (S) => {
    if (EC.off) return train0(S);
    const fx = L.staffFx(S), rep = train0(S);
    if (isObj(S.eco)) {
      const E = L.eco(S);
      if (fx.train > 0) rep.lines.forEach((ln) => { if (ln.gain && ln.stat) { const g = S.glads.find((x) => x.id === ln.id); if (g) { const add = ln.gain * fx.train; g.st[ln.stat] += add; ln.gain += add; ln.txt += ` (+${add.toFixed(1)} drill)`; } } });
      if (fx.mo || fx.en) S.glads.forEach((g) => { g.mo = clamp(g.mo + fx.mo, 0, 100); g.en = clamp(g.en + fx.en, 0, 100); });
      const rebate = fx.food > 0 && rep.menuCost ? Math.round(rep.menuCost * fx.food / (1 - fx.food)) : 0;
      if (rebate) { S.gold += rebate; }
      E.cur.food = Math.max(0, (rep.menuCost || 0) - rebate); E.cur.work = rep.work || 0;
    }
    return rep;
  };
  const heal0 = L.healBonus;
  L.healBonus = (S) => { const b = heal0(S); if (EC.off || !isObj(S.eco)) return b; const e = L.staffFx(S).healLvl; return b + (e > 0 && S.week % Math.max(2, 5 - Math.round(e)) === 0 ? 1 : 0); };
  const upc0 = L.upCost;   // upCost takes no S: the discount lives in upgradeItem
  const upg0 = L.upgradeItem;
  L.upgradeItem = (S, it) => {
    const d = EC.off ? 0 : L.staffFx(S).upg; if (!d) return upg0(S, it);
    if (it.up >= L.maxUp(S)) return upg0(S, it); const c = upc0(it), cut = Math.round(c * d);
    if (S.gold < c - cut) return 'Not enough gold'; S.gold -= c - cut; it.up++; return '';
  };
  const sell0 = L.sellItem;
  L.sellItem = (S, it) => { const d = EC.off ? 0 : L.staffFx(S).sell; if (!d) return sell0(S, it); const v = L.sellVal(it); sell0(S, it); S.gold += Math.round(v * d); };
  const scout0 = L.scoutLevel;
  L.scoutLevel = (S) => { const b = scout0(S); return EC.off || !isObj(S.eco) ? b : Math.min(3, b + L.staffFx(S).scout); };
  const enter0 = L.enter;
  L.enter = (S, ev, ids, stance, opts) => {
    if (!EC.off && isObj(S.eco) && S.eco.fav && S.eco.fav.editor >= S.week && ev.fee > 0) { const half = Object.assign({}, ev, { fee: Math.round(ev.fee * 0.5) }); return enter0(S, half, ids, stance, opts); }
    return enter0(S, ev, ids, stance, opts);
  };
  const settle0 = L.settle;
  L.settle = (S, ev, glads, res) => {
    if (EC.off) return settle0(S, ev, glads, res);
    const g0 = S.gold, rep = settle0(S, ev, glads, res), won = !!(res.win || res.place === 1);
    if (isObj(S.eco)) {
      const E = L.eco(S); E.res[ev.key] = won ? 1 : 0;
      if (ev.town && won) E.ren[ev.town] = (E.ren[ev.town] || 0) + 1;
      let gain = S.gold - g0;
      if (E.debt && gain > 0) { const cut = Math.round(gain * 0.25), l = E.loans.slice().sort((a, b) => b.bal - a.bal)[0]; if (l && cut > 0) { S.gold -= cut; l.bal = Math.max(0, l.bal - cut); gain -= cut; E.cur.garnish = (E.cur.garnish || 0) + cut; rep.notes.push(`Creditors take ${cut} gold of the purse.`); if (l.bal < 1) { E.loans = E.loans.filter((x) => x !== l); } } }
      E.cur.prize = (E.cur.prize || 0) + Math.max(0, gain);
    }
    return rep;
  };
  const fin0 = L.weekFinish;
  L.weekFinish = (S) => {
    if (EC.off) return fin0(S);
    const E = L.eco(S), wk = S.week, g0 = S.gold, lodge = L.lodging(S);
    const rep0 = { notes: [] };
    if (E.bets.length) settleBets(S, E, rep0);
    const rep = fin0(S);
    rep.notes.push(...rep0.notes);
    const c = E.cur;
    c.wages = rep.upkeep || 0; c.income = (rep.income || 0); c.goals = 0;
    // fixed charges after the sim has paid its own: building upkeep, staff, tribute (with arrears), lodging, loans
    let b = 0; const owed = L.buildingUpkeep(S); b = pay(S, owed); c.building = b;
    let st = 0; Object.keys(E.staff).forEach((r) => { const s = E.staff[r]; if (!isObj(s)) return; const p = pay(S, s.wage); st += p; if (p < s.wage) { s.unpaid = (s.unpaid || 0) + 1; if (s.unpaid >= 3) { rep.notes.push(`${s.name} the ${ROLES[r].n} leaves: three weeks unpaid.`); delete E.staff[r]; } else rep.notes.push(`${s.name} the ${ROLES[r].n} was not paid in full and sulks.`); } else s.unpaid = 0; });
    c.staff = st;
    const T = L.tributeInfo(S).amount + E.arrears, tp = pay(S, T); c.tribute = tp; E.arrears = T - tp;
    if (E.arrears > 0) { L.facGain(S, 'sen', -2); rep.notes.push(`The governor's collector is owed ${E.arrears} gold. The Senate notices.`); if (E.arrears > 4 * Math.max(10, L.tributeInfo(S).amount)) { S.fame = Math.max(0, S.fame - 5); E.arrears = Math.round(E.arrears * 0.5); rep.notes.push('A formal complaint: -5 fame, and half of the arrears are forgiven.'); } }
    else if (T > 0) rep.notes.push(`Tribute to the governor: ${tp} gold.`);
    c.lodging = pay(S, lodge);
    loanWeek(S, rep, E);
    auditWeek(S, rep, E);
    c.wk = wk; c.net = S.gold - g0; c.gold = S.gold;
    const row = {}; for (const k in c) if (fin(c[k])) row[k] = Math.round(c[k]);
    row.wk = wk; row.net = Math.round(S.gold - g0); row.gold = Math.round(S.gold); row.food = row.food || 0;
    E.ledger.push(row); E.ledger = E.ledger.slice(-12); E.cur = {};
    E.res = {}; if (E.auc && E.auc.wk !== S.week) E.auc = {};
    if (S.gold < 0) S.gold = 0;
    return rep;
  };
  const mig0 = L.migrate;
  L.migrate = (S) => { const N = mig0(S); if (isObj(N.eco)) L.eco(N); return N; };
  const san0 = L.sanitize;
  if (san0) L.sanitize = (S) => { const f = san0(S); if (S.eco !== undefined && !isObj(S.eco)) { delete S.eco; f.push('eco was not an object'); } else if (isObj(S.eco)) { L.eco(S); S.eco.loans = S.eco.loans.filter((l) => isObj(l) && LENDERS[l.lender] && fin(l.bal) && fin(l.pay) && fin(l.left) && fin(l.rate)); S.eco.hist = S.eco.hist.filter((h) => isObj(h) && fin(h.from) && fin(h.arrive) && (h.town === 'home' || TOWNS[h.town])); for (const r of Object.keys(S.eco.staff)) if (!ROLES[r] || !isObj(S.eco.staff[r]) || !fin(S.eco.staff[r].lvl) || !fin(S.eco.staff[r].wage)) delete S.eco.staff[r]; } return f; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
