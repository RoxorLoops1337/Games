// Finance: the weekly ledger and a four week projection, moneylenders, hired staff, the bookmaker and political favors.
// Rules live in core/economy.js (LM.weeklyBill, LM.projection, LM.loan*, LM.staff*, LM.board, LM.bet*, LM.favor*); this file is presentation and flow.
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, goldPill, tabs, chipRow, meter, empty, actions, styleBadge, confirmDialog } from './sk.js';

const CSS = `
.fn-bill{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:baseline;font-size:var(--lx-fs-s)}
.fn-bill b{font-variant-numeric:tabular-nums;text-align:right}
.fn-bill .tot{border-top:2px solid rgba(242,193,78,.5);padding-top:4px;margin-top:2px;font-weight:800;color:var(--lx-gold)}
.fn-bill .neg,.fn-neg{color:#ffb4a6}.fn-bill .pos,.fn-pos{color:#bff0d2}.fn-bill .hd{font-weight:800;color:var(--lx-gold);letter-spacing:.06em;text-transform:uppercase;font-size:11px;margin-top:4px}
.fn-stmt{display:grid;grid-template-columns:44px 1fr 62px 62px;gap:4px 8px;align-items:center;font-size:var(--lx-fs-s);font-variant-numeric:tabular-nums}
.fn-stmt .hd{font-weight:800;opacity:.7;text-transform:uppercase;letter-spacing:.06em;font-size:11px}
.fn-stmt .r{text-align:right}
.fn-bar{height:10px;border-radius:5px;background:rgba(10,6,24,.5);position:relative;overflow:hidden}
.fn-bar i{position:absolute;top:0;bottom:0;border-radius:5px}
.fn-bar i.p{left:50%;background:linear-gradient(180deg,#8ee0aa,#3f9a6a)}.fn-bar i.n{right:50%;background:linear-gradient(180deg,#f08a78,#c2392f)}
.fn-spark{width:100%;height:84px;display:block}
.fn-chips{display:flex;gap:6px;flex-wrap:wrap}
.fn-chip{min-height:44px;min-width:44px;padding:4px 12px;border-radius:999px;border:1.5px solid rgba(242,193,78,.5);background:rgba(10,6,24,.45);color:var(--lx-travertine);font:700 var(--lx-fs-s)/1.1 var(--lx-sans);cursor:pointer}
.fn-chip.on{background:linear-gradient(180deg,#ffe08a,#f2c14e);color:#2a1a08;border-color:#7a5222}
.fn-chip:focus-visible{outline:3px solid #fff;outline-offset:2px}
.fn-odds{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}
.fn-side{display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center;min-width:0}
.fn-vs{font:800 var(--lx-fs-s)/1 var(--lx-serif);opacity:.7}
.fn-warn{border-left:4px solid #e0644f;padding:6px 10px;background:rgba(194,57,47,.18);border-radius:6px;font-size:var(--lx-fs-s)}
.fn-sus{height:12px;border-radius:6px;background:linear-gradient(90deg,#3f9a6a 0 20%,#c98e24 20% 45%,#d2682b 45% 70%,#c2392f 70%);position:relative;box-shadow:0 0 0 1px rgba(242,193,78,.4)}
.fn-sus i{position:absolute;top:-4px;width:6px;height:20px;border-radius:3px;background:#fff;box-shadow:0 0 0 2px #1d1830;margin-left:-3px}
`;
let cssOn = false;
const css = () => { if (cssOn && document.getElementById('fn-css')) return; cssOn = true; if (!document.getElementById('fn-css')) { const s = document.createElement('style'); s.id = 'fn-css'; s.textContent = CSS; document.head.append(s); } };

const st = { tab: 'ledger', lender: 'temple', amt: 0, weeks: 0, stake: 25, role: null };
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + fmt(Math.abs(n));

export function open(ctx, arg) {
  css(); arg = arg || {}; if (arg.tab) st.tab = arg.tab;
  const scr = openScreen(ctx, { title: 'Finance', wide: true });
  const draw = () => scr.render((root) => {
    const S = ctx.S, lm = L();
    root.append(card([row([medal('coin', 'dark big'), col([h('div', 'ax-name', 'The strongbox'), h('div', 'ax-row ax-wrap ax-gap4', [goldPill(S.gold), pill(`Week ${S.week}`, {}), lm.eco(S).debt ? pill('Debt chapter', { tone: 'bad' }) : null, lm.debtTotal(S) > 0 ? pill(`Owe ${fmt(lm.debtTotal(S))}`, { tone: 'warn', ico: 'scroll' }) : null])], 'ax-grow')])]));
    root.append(tabs([{ id: 'ledger', label: 'Ledger', icon: 'scroll' }, { id: 'loans', label: 'Loans', icon: 'coin' }, { id: 'staff', label: 'Staff', icon: 'roster' }, { id: 'wagers', label: 'Wagers', icon: 'star' }], st.tab, (id) => { st.tab = id; ctx.sfx('uiTap'); scr.scroller.scrollTop = 0; draw(); }));
    if (st.tab === 'ledger') ledgerTab(ctx, root); else if (st.tab === 'loans') loansTab(ctx, root, draw); else if (st.tab === 'staff') staffTab(ctx, root, draw); else wagersTab(ctx, root, draw);
  });
  draw(); return scr;
}

const done = (ctx, msg, kind = 'good', sfx = 'coin') => { ctx.save(); ctx.refresh(); ctx.sfx(sfx); U.toast(msg, { kind, ico: 'coin' }); };
const fail = (ctx, msg) => { ctx.sfx('uiError'); U.toast(msg, { kind: 'bad' }); };

// ------------------------------------------------------------------ ledger
function ledgerTab(ctx, root) {
  const S = ctx.S, lm = L(), E = lm.eco(S), b = lm.weeklyBill(S), fi = lm.weeklyFixedIncome(S), prize = lm.recentPrize(S), ti = lm.tributeInfo(S);
  root.append(sec('This week at the week end'));
  const lines = [['Fighters\' keep', b.wages, 'The upkeep of every gladiator on the roster.'], ['Food', b.food, 'The menu you set in the kitchen.'], ['Staff wages', b.staff], ['Building upkeep', b.building, 'Only grand buildings (level 3 and up) cost money to keep standing.'], ['Governor\'s tribute', b.tribute], ['Lodging on the road', b.lodging], ['Loan installments', b.loans]].filter((x) => x[1] > 0 || x[0] === 'Fighters\' keep');
  const bill = h('div', 'fn-bill');
  bill.append(h('span', '', 'Market, patrons and the Senate'), h('b', 'pos', '+' + fmt(fi.total)));
  if (prize) bill.append(h('span', '', 'Prizes (your four week average)'), h('b', 'pos', '+' + fmt(prize)));
  lines.forEach(([k, v]) => bill.append(h('span', '', k), h('b', 'neg', '-' + fmt(v))));
  const net = fi.total + prize - b.total;
  bill.append(h('span', 'tot', 'Expected net'), h('b', 'tot', sgn(net)));
  root.append(card([bill, note(S.fame < 200 ? 'The governor does not know your name yet. Tribute starts at 200 fame and grows with it.' : `Tribute is ${fmt(ti.base)} gold before reductions${ti.cuts.length ? ': ' + ti.cuts.join(', ') : ''}. Win Senate standing or grease the clerk (Wagers tab) to ease it.`), E.arrears ? h('div', 'fn-warn', `Tribute arrears: ${fmt(E.arrears)} gold. The Senate notices.`) : null]));
  // last week's statement
  const L8 = E.ledger.slice(-8);
  if (!L8.length) { root.append(sec('Statements')); root.append(card([empty('scroll', 'No statements yet', 'Advance the week and the first statement is written here: every coin in and out, by source.')])); }
  else {
    const last = L8[L8.length - 1];
    root.append(sec(`Statement of week ${last.wk}`));
    const inc = [['Prizes', last.prize], ['Weekly income and goals', last.income], ['Odd jobs', last.work], ['Trade and caravan sales', Math.max(0, last.trade || 0)], ['Loans taken', last.borrowed], ['Bets won (net)', Math.max(0, last.bets || 0)]].filter((x) => x[1] > 0);
    const out = [['Fighters\' keep', last.wages], ['Food', last.food], ['Staff', last.staff], ['Buildings', last.building], ['Tribute', last.tribute], ['Lodging', last.lodging], ['Loan payments', last.loanPaid], ['Interest and fees', last.interest], ['Favors and bribes', last.favors], ['Auction', last.auction], ['Caravan and alley', (last.caravan || 0) + (last.alley || 0)], ['Travel', last.travel], ['Fines', last.fines], ['Bets lost (net)', Math.max(0, -(last.bets || 0))], ['Creditors\' share', last.garnish]].filter((x) => x[1] > 0);
    const bl = h('div', 'fn-bill'); bl.append(h('span', 'hd', 'Income'), h('span', '')); inc.forEach(([k, v]) => bl.append(h('span', '', k), h('b', 'pos', '+' + fmt(v)))); bl.append(h('span', 'hd', 'Expenses'), h('span', '')); out.forEach(([k, v]) => bl.append(h('span', '', k), h('b', 'neg', '-' + fmt(v))));
    bl.append(h('span', 'tot', 'Net change'), h('b', 'tot', sgn(last.net))); root.append(card([bl, note('Some lines overlap by design (a purse and an auction cut are counted where the coin changed hands). The strongbox figure is exact.')]));
    root.append(sec('The last weeks'));
    const mx = Math.max(40, ...L8.map((r) => Math.abs(r.net))), g = h('div', 'fn-stmt');
    g.append(h('span', 'hd', 'Week'), h('span', 'hd', 'Net'), h('span', 'hd r', 'Change'), h('span', 'hd r', 'Gold'));
    L8.slice().reverse().forEach((r) => { const bar = h('div', 'fn-bar'), w = Math.min(50, (Math.abs(r.net) / mx) * 50); bar.append(h('i', r.net >= 0 ? 'p' : 'n')); bar.firstChild.style.width = w + '%'; g.append(h('span', '', 'W' + r.wk), bar, h('span', 'r ' + (r.net >= 0 ? '' : ''), sgn(r.net)), h('span', 'r', fmt(r.gold))); });
    root.append(card([g]));
  }
  // projection
  root.append(sec('The next four weeks'));
  const P = lm.projection(S, 4), worst = Math.min(...P.map((p) => p.gold));
  root.append(card([spark(P, S.gold), h('div', 'fn-stmt', [h('span', 'hd', 'Week'), h('span', 'hd', 'In / out'), h('span', 'hd r', 'Net'), h('span', 'hd r', 'Gold'), ...P.flatMap((p) => [h('span', '', 'W' + p.wk), h('span', '', `+${fmt(p.income)} / -${fmt(p.expense)}`), h('span', 'r', sgn(p.net)), h('span', 'r', fmt(p.gold))])]),
    note(prize ? `Assumes your recent prize average of ${fmt(prize)} a week. Prizes are not promised: a bad week can be much worse.` : 'No prize history yet, so this assumes you win nothing. Anything you win is a bonus.'),
    worst < 40 ? h('div', 'fn-warn', worst < 0 ? 'On this track the strongbox runs dry. Skip a purchase, take a cheap loan or enter more fights.' : 'The strongbox gets thin. Keep a reserve for the installments.') : null]));
}
function spark(P, now) {
  const NS = 'http://www.w3.org/2000/svg', W = 300, H = 84, vals = [now].concat(P.map((p) => p.gold)), lo = Math.min(0, ...vals), hi = Math.max(1, ...vals), y = (v) => 8 + (H - 20) * (1 - (v - lo) / (hi - lo || 1)), x = (i) => 10 + (i * (W - 20)) / (vals.length - 1);
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('class', 'fn-spark'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Projected gold over four weeks');
  const zero = document.createElementNS(NS, 'line'); zero.setAttribute('x1', 6); zero.setAttribute('x2', W - 6); zero.setAttribute('y1', y(0)); zero.setAttribute('y2', y(0)); zero.setAttribute('stroke', 'rgba(242,193,78,.4)'); zero.setAttribute('stroke-dasharray', '4 4'); s.append(zero);
  const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#f2c14e'); pl.setAttribute('stroke-width', 3); pl.setAttribute('stroke-linejoin', 'round'); s.append(pl);
  vals.forEach((v, i) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v)); c.setAttribute('r', 4); c.setAttribute('fill', v < 0 ? '#c2392f' : '#ffe08a'); s.append(c); });
  return s;
}

// ------------------------------------------------------------------ loans
function loansTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), E = lm.eco(S), LD = lm.LENDERS;
  const lim = lm.creditLimit(S), owe = lm.debtTotal(S);
  if (E.debt) root.append(card([h('b', '', 'DEBT CHAPTER'), note(`Since week ${E.debt.from}: a quarter of every purse goes to your creditors, you lose 2 fame a week and no new loans are offered (the temple still gives small alms below 50 gold). Pay what is overdue, or ask a magistrate (Wagers tab) to quiet them.`)], 'red'));
  root.append(card([row([col([h('div', 'ax-name', 'Credit'), note('What lenders will let you owe grows with your fame and your income.')], 'ax-grow'), pill(`${fmt(owe)} / ${fmt(lim)}`, { tone: owe > lim * 0.8 ? 'bad' : 'gold', tip: 'Total debt against your credit limit', tipTitle: 'Credit' })]), meter(owe, Math.max(1, lim), owe > lim * 0.8 ? 'var(--lx-hp)' : 'var(--lx-gold)', 'Debt against limit')]));
  if (E.loans.length) {
    root.append(sec('Your loans'));
    E.loans.forEach((l) => {
      const Ld = LD[l.lender], roll = lm.rollCost(S, l), c = card([row([medal('scroll', 'dark'), col([h('div', 'ax-name', Ld.n), h('div', 'ax-row ax-wrap ax-gap4', [pill(`Owe ${fmt(l.bal)}`, { tone: 'warn' }), pill(`${fmt(l.pay)} a week`, {}), pill(`${l.left} week${l.left === 1 ? '' : 's'} left`, {}), pill(`${(l.rate * 100).toFixed(1)}% a week`, { tone: 'vio', tip: 'Interest is added to the balance every week.' }), l.missed ? pill(`Missed ${l.missed}`, { tone: 'bad' }) : null])], 'ax-grow')])], l.missed ? 'red' : '');
      c.append(actions([
        U.button({ label: 'Pay 50', icon: 'coin', variant: 'bronze', disabled: S.gold < 1, onClick: () => { const e = lm.loanRepay(S, l.id, 50); e ? fail(ctx, e) : done(ctx, 'Paid 50 gold'); draw(); } }),
        U.button({ label: `Repay all ${fmt(Math.ceil(l.bal))}`, icon: 'check', variant: 'gold', disabled: S.gold < Math.ceil(l.bal), onClick: () => { const e = lm.loanRepay(S, l.id, l.bal); e ? fail(ctx, e) : done(ctx, `${Ld.n} is repaid`); draw(); } }),
        U.button({ label: `Roll over (${fmt(roll)})`, icon: 'scroll', variant: 'ghost', disabled: S.gold < roll || (l.rolled || 0) >= 2, onClick: () => { const e = lm.loanRoll(S, l.id); e ? fail(ctx, e) : done(ctx, 'Four more weeks, a smaller installment'); draw(); } })]));
      c.append(note('Rolling over adds four weeks and lowers the installment for a week of interest and a 3% fee, up to twice.')); root.append(c);
    });
  }
  root.append(sec('Borrow'));
  root.append(chipRow(lm.LENDER_IDS.map((id) => ({ id, label: LD[id].n.replace('Guild of ', '').replace('Temple ', 'Temple '), sub: (lm.loanRate(S, id) * 100).toFixed(1) + '%', lock: S.fame < LD[id].fame })), st.lender, (id) => { st.lender = id; st.amt = 0; st.weeks = 0; ctx.sfx('uiTap'); draw(); }));
  const id = st.lender, Ld = LD[id], mx = lm.loanMax(S, id), alms = id === 'temple' && S.gold < 50;
  const top = Math.max(mx, alms ? 100 : 0);
  const amts = [...new Set([0.25, 0.5, 0.75, 1].map((f) => Math.max(50, Math.round((top * f) / 10) * 10)))].filter((v) => v <= Math.max(50, top));
  if (!st.amt || st.amt > Math.max(50, top)) st.amt = amts[Math.min(1, amts.length - 1)] || 50; if (!Ld.terms.includes(st.weeks)) st.weeks = Ld.terms[Ld.terms.length > 1 ? 1 : 0];
  const q = lm.loanQuote(S, id, st.amt, st.weeks), why = lm.loanWhy(S, id, st.amt, st.weeks);
  const harsh = ['A missed payment costs you standing in the temple, never your property. A second one costs more standing.', 'A missed payment sends a collector to the barracks (morale drops). A second one and the best spare item in your armory is seized against the debt.', 'Missed payments carry heavy fees. His men seize your best spare item at a discount and a third miss starts a debt chapter.'][Ld.harsh];
  root.append(card([row([col([h('div', 'ax-name', Ld.n), note(Ld.d)], 'ax-grow')]), hint(`${Ld.who}. Their limit for you is ${fmt(mx)} gold.`),
    h('div', 'ax-sub', 'How much'), chips(amts.map((v) => ({ v, label: fmt(v) })), st.amt, (v) => { st.amt = v; draw(); }),
    h('div', 'ax-sub', 'Over how many weeks'), chips(Ld.terms.map((v) => ({ v, label: v + ' weeks' })), st.weeks, (v) => { st.weeks = v; draw(); }),
    h('div', 'fn-bill', [h('span', '', 'Weekly payment'), h('b', '', fmt(q.pay)), h('span', '', 'Total repaid'), h('b', '', fmt(q.total)), h('span', 'tot', 'The loan costs you'), h('b', 'tot neg', fmt(q.cost))]),
    h('div', 'fn-warn', 'If you miss payments: ' + harsh),
    U.button({ label: why ? why : `Borrow ${fmt(st.amt)} gold`, icon: 'coin', variant: 'gold', block: true, disabled: !!why, onClick: () => { const e = lm.loanTake(S, id, st.amt, st.weeks); e ? fail(ctx, e) : done(ctx, `Borrowed ${fmt(st.amt)} gold from ${Ld.n}`); draw(); } })]));
}
function chips(items, cur, on) {
  const el = h('div', 'fn-chips'); items.forEach((it) => { const b = h('button', 'fn-chip' + (it.v === cur ? ' on' : ''), it.label); b.type = 'button'; b.setAttribute('aria-pressed', it.v === cur ? 'true' : 'false'); b.onclick = () => on(it.v); el.append(b); }); return el;
}

// ------------------------------------------------------------------ staff
function staffTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), E = lm.eco(S), R = lm.STAFF_ROLES, Q = lm.STAFF_QUIRKS;
  root.append(card([note('Each trade needs its building (a Palaestra for a Doctore, an Infirmary for a Physician, and so on). A staffer works at the level of the building at most. They draw wages every week and leave after three weeks unpaid. The pool of candidates changes every two weeks.')]));
  const pay = lm.staffWage(S); root.append(card([row([col([h('div', 'ax-b', 'Payroll'), h('div', 'ax-sub', 'Paid every week end')], 'ax-grow'), goldPill(pay, 'Staff wages per week')])]));
  root.append(sec('On the payroll'));
  const mine = lm.staffOf(S);
  if (!mine.length) root.append(card([empty('roster', 'Nobody hired yet', 'A good Doctore lifts every fighter\'s training. Hire from the candidates below once the matching building stands.')]));
  mine.forEach((s) => {
    const r = R[s.role], eff = lm.staffEff(S, s.role), q = (Q[s.role] || []).find((x) => x.id === s.quirk) || { n: s.quirk, d: '' };
    root.append(card([row([medal(r.ico, 'dark'), col([h('div', 'ax-name', `${s.name}`), h('div', 'ax-sub', `${r.n}, level ${s.lvl}`), h('div', 'ax-row ax-wrap ax-gap4', [pill(q.n, { tone: 'vio', tip: q.d, tipTitle: 'Quirk' }), pill(`${s.wage} a week`, { ico: 'coin', tone: 'gold' }), pill(eff < s.lvl ? `Works at level ${eff} (building)` : `Working at level ${eff}`, { tone: eff < s.lvl ? 'warn' : 'good' }), s.unpaid ? pill('Unpaid!', { tone: 'bad' }) : null])], 'ax-grow')]), note(`${r.d} ${r.per}. Quirk: ${q.d}.`),
      actions([U.button({ label: s.lvl >= 3 ? 'Master' : `Train (${90 * s.lvl})`, icon: 'star', variant: 'bronze', disabled: s.lvl >= 3 || S.gold < 90 * s.lvl, onClick: () => { const e = lm.staffUpgrade(S, s.role); e ? fail(ctx, e) : done(ctx, `${s.name} reaches level ${s.lvl + 1}`); draw(); } }),
        U.button({ label: `Dismiss (${s.wage})`, variant: 'ghost', onClick: async () => { if (await confirmDialog(ctx, { title: 'Dismiss ' + s.name + '?', text: `Severance is one week of wages (${s.wage} gold).`, yes: 'Dismiss', danger: true })) { const e = lm.fireStaff(S, s.role); e ? fail(ctx, e) : done(ctx, `${s.name} leaves`, 'info', 'uiTap'); draw(); } } })])]));
  });
  root.append(sec('Candidates this fortnight'));
  const pool = lm.staffPool(S);
  if (!pool.length) root.append(card([note('Nobody new is looking for work. Check again in two weeks.')]));
  pool.forEach((c) => {
    const r = R[c.role], why = lm.hireWhy(S, c), q = (Q[c.role] || []).find((x) => x.id === c.quirk);
    root.append(card([row([medal(r.ico), col([h('div', 'ax-name', c.name), h('div', 'ax-sub', `${r.n}, level ${c.lvl}`), h('div', 'ax-row ax-wrap ax-gap4', [pill(q.n, { tone: 'vio', tip: q.d, tipTitle: 'Quirk' }), pill(`${c.wage} a week`, { ico: 'coin', tone: 'gold' }), pill(`Fee ${c.fee}`, { tone: S.gold < c.fee ? 'bad' : '' })])], 'ax-grow')]), note(`${r.per}. Quirk: ${q.d}.`),
      U.button({ label: why || `Hire (${c.fee} gold)`, icon: 'check', variant: 'gold', block: true, disabled: !!why, onClick: () => { const e = lm.hireStaff(S, c); e ? fail(ctx, e) : done(ctx, `${c.name} joins as ${r.n}`); draw(); } })], why ? 'dim' : ''));
  });
}

// ------------------------------------------------------------------ wagers: the bookmaker, the Senate's eye, favors
function wagersTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), E = lm.eco(S), caps = lm.betCaps(S), sus = lm.suspicion(S);
  root.append(card([row([col([h('div', 'ax-name', 'The Senate\'s eye'), note('Stolen goods and exposed bribes raise suspicion. It fades 3 points a week. High suspicion invites an audit: a fine, lost fame and lost Senate standing.')], 'ax-grow'), pill(lm.susLabel(sus), { tone: sus >= 45 ? 'bad' : sus >= 20 ? 'warn' : 'good' })]), (() => { const b = h('div', 'fn-sus'); const i = h('i'); i.style.left = sus + '%'; b.append(i); b.setAttribute('role', 'img'); b.setAttribute('aria-label', `Suspicion ${sus} of 100, ${lm.susLabel(sus)}`); return b; })(), h('div', 'ax-sub', `Suspicion ${Math.round(sus)} / 100`)]));
  root.append(sec('The bookmaker'));
  const used = E.bets.reduce((a, b) => a + b.stake, 0), left = Math.max(0, caps.week - used), cap = Math.min(caps.one, left);
  root.append(card([note(`The bookmaker keeps a ${Math.round(lm.vig(S) * 100)}% margin (Merchants standing narrows it). Bets settle when the week ends. Limits: ${fmt(caps.one)} a bet, ${fmt(caps.week)} a week, ${caps.count} bets. Staked this week: ${fmt(used)}.`),
    h('div', 'ax-sub', 'Stake'), chips([10, 25, 50, 100, 200].filter((v) => v <= Math.max(10, caps.one)).map((v) => ({ v, label: String(v) })), st.stake, (v) => { st.stake = v; draw(); })]));
  const board = lm.board(S);
  board.forEach((b) => {
    const truth = lm.boardTruth(S, b), mine = (side) => E.bets.find((x) => x.ref === b.id && x.side === side);
    const side = (g, p, m, s) => col([styleBadge(g.style, 34), h('div', 'ax-b', g.name), h('div', 'ax-sub', `${D.STYLES[g.style].n}, level ${g.lvl}`), pill(`${Math.round(p * 100)}%  pays x${m.toFixed(2)}`, { tone: 'gold' }),
      U.button({ label: mine(s) ? `Staked ${mine(s).stake}` : `Back (${st.stake})`, variant: 'gold', disabled: !!mine(s) || !!lm.betWhy(S, st.stake, { ref: b.id, side: s }), onClick: () => { const e = lm.betBout(S, b.id, s, st.stake); e ? fail(ctx, e) : done(ctx, `${st.stake} gold on ${g.name}`); draw(); } })], 'fn-side');
    const why = lm.betWhy(S, st.stake, { ref: b.id, side: 'a' });
    root.append(card([h('div', 'fn-odds', [side(b.a, b.p, b.ma, 'a'), h('span', 'fn-vs', 'VS'), side(b.b, 1 - b.p, b.mb, 'b')]), truth != null ? note(`Your scouts reckon ${Math.round(truth * 100)}% for ${b.a.name}. The public price knows only level and style.`) : note('Public odds know only level and style. A Scout Tower at level 2 shows what the fighters can really do.'), why && !mine('a') && !mine('b') ? note(why) : null]));
  });
  if (E.bets.length) root.append(card([h('b', '', 'Your slip'), ...E.bets.map((b) => h('div', 'ax-kv', [h('span', '', `${b.kind === 'against' ? 'Against your man: ' : ''}${b.name}`), h('b', '', `${fmt(b.stake)} to win ${fmt(Math.round(b.stake * b.mult))}`)]))]));
  // against your own man
  root.append(sec('Against your own fighter'));
  const ag = lm.againstOptions(S);
  if (!ag.length) root.append(card([note('Enter a duel or a team clash for this week and you may bet against your own side here. Be warned: the temple and the plebs do not forgive it.')]));
  ag.forEach((o) => {
    const mine = E.bets.find((x) => x.ref === o.key), why = lm.betWhy(S, st.stake, { ref: o.key, side: 'x' });
    root.append(card([h('div', 'ax-b', `${o.mine.map((g) => g.name).join(' & ')} v ${o.ev.opps.map((g) => g.name).join(' & ')}`), pill(`The other side wins ${Math.round(o.p * 100)}%, pays x${o.mult.toFixed(2)}`, { tone: 'gold' }),
      h('div', 'fn-warn', 'Placing this costs the Plebs 5 standing and the temple patron 6. If it pays, the crowd smells a fix 35% of the time (-10 fame, more lost standing). The Merchants like it.'),
      U.button({ label: mine ? `Staked ${mine.stake}` : why || `Bet ${st.stake} against`, variant: 'danger', disabled: !!mine || !!why, onClick: async () => { if (await confirmDialog(ctx, { title: 'Bet against your own?', text: 'The temple and the plebs will remember. Are you sure?', yes: 'Place the bet', danger: true })) { const e = lm.betAgainst(S, o.key, st.stake); e ? fail(ctx, e) : done(ctx, 'The bet is placed. Quietly.', 'info'); draw(); } } })]));
  });
  if (E.betLog.length) root.append(card([h('b', '', 'Recent results'), ...E.betLog.slice(-4).reverse().map((b) => h('div', 'ax-kv', [h('span', '', `W${b.wk} ${b.text}`), h('b', b.net >= 0 ? 'fn-pos' : 'fn-neg', sgn(b.net))]))]));
  // favors
  root.append(sec('Favors and bribes'));
  root.append(note('Every favor states its price, its risk and its reward. Caught, you lose the money, pay a fine, lose 8 fame and Senate standing, and suspicion rises by 15.'));
  const grid = h('div', 'ax-grid');
  lm.FAVOR_IDS.forEach((id) => {
    const F = lm.FAVORS[id], cost = lm.favorCost(S, id), risk = lm.favorRisk(S, id), why = lm.favorWhy(S, id);
    grid.append(card([row([medal(F.ico), col([h('div', 'ax-b', F.n), h('div', 'ax-sub', F.d)], 'ax-grow')]), h('div', 'ax-row ax-wrap ax-gap4', [goldPill(cost, 'Price'), pill(risk ? `Risk ${Math.round(risk * 100)}%` : 'No risk', { tone: risk >= 0.2 ? 'bad' : risk ? 'warn' : 'good', tip: 'Base risk plus suspicion, less Senate standing and your spy.', tipTitle: 'Risk of being caught' }), pill(F.gain, { tone: 'vio' })]),
      U.button({ label: why || 'Do it', variant: risk ? 'bronze' : 'gold', block: true, disabled: !!why, onClick: async () => { if (risk >= 0.15 && !(await confirmDialog(ctx, { title: F.n, text: `${Math.round(risk * 100)}% chance of being caught. Price ${cost} gold, paid either way.`, yes: 'Do it', danger: true }))) return; const r = lm.favorDo(S, id); if (r.err) fail(ctx, r.err); else done(ctx, r.msg, r.caught ? 'bad' : 'good', r.caught ? 'uiError' : 'coin'); draw(); } })], why && !/^Again|^Needs/.test(why) ? 'dim' : ''));
  });
  root.append(grid);
}
