// Patrons: five sponsors with personalities, contracts with demands, payouts, penalties, renewals and story beats.
// Sim in core/ext.js (LM.sponsor*). Opened with ctx.open('sponsors') or embedded as a World tab via render(). patronFlow() runs after each week.
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, goldPill, famePill, empty, actions, meter } from './sk.js';
import { injectDepCss } from './wounds_ui.js';

const SVGNS = 'http://www.w3.org/2000/svg';
// Portraits as icons: one hand-drawn glyph per patron (48 x 48), tinted with the patron colour on a medal.
const GLYPH = {
  wine: '<path d="M19 6h10v5c0 3 6 5 6 12v14c0 4-4 6-11 6s-11-2-11-6V23c0-7 6-9 6-12z" fill="currentColor"/><path d="M15 20c-5 0-7 4-6 8s4 5 7 4M33 20c5 0 7 4 6 8s-4 5-7 4" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round"/><path d="M17 26q7 4 14 0" stroke="#00000066" stroke-width="2" fill="none"/>',
  senator: '<circle cx="24" cy="15" r="7.500" fill="currentColor"/><path d="M8 44c1-11 7-17 16-17s15 6 16 17z" fill="currentColor"/><path d="M19 28l5 16 5-16" stroke="#7a3fa8" stroke-width="4" fill="none"/><path d="M13 12q-4 6 0 12M35 12q4 6 0 12M15 8q-2 2-3 5M33 8q2 2 3 5" stroke="currentColor" stroke-width="2.400" fill="none" stroke-linecap="round"/>',
  temple: '<path d="M4 18L24 6l20 12z" fill="currentColor"/><rect x="8" y="21" width="5" height="18" fill="currentColor"/><rect x="17.500" y="21" width="5" height="18" fill="currentColor"/><rect x="26.500" y="21" width="5" height="18" fill="currentColor"/><rect x="35" y="21" width="5" height="18" fill="currentColor"/><rect x="4" y="40" width="40" height="4" rx="1" fill="currentColor"/>',
  smith: '<path d="M6 17h26c4 0 6 2 8 5l4 1v5l-8 1c-1 3-3 5-6 5v7H20v-7c-4 0-6-3-6-6H6z" fill="currentColor"/><path d="M33 4l7 7M30 7l7 7" stroke="currentColor" stroke-width="3.400" stroke-linecap="round"/><path d="M40 4l-12 12" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".5"/>',
  veil: '<path d="M24 5c-9 0-14 7-14 16 0 6 2 10 5 13l-3 10h24l-3-10c3-3 5-7 5-13 0-9-5-16-14-16z" fill="currentColor"/><path d="M13 27q11 8 22 0v6q-11 8-22 0z" fill="#00000055"/><path d="M17 21q3-3 6 0M25 21q3-3 6 0" stroke="#00000099" stroke-width="2.400" fill="none" stroke-linecap="round"/>',
};
export function glyph(sid, size = 28) {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true'); s.innerHTML = GLYPH[sid] || GLYPH.wine; return s;
}
export function patronMedal(sid, small) {
  const P = D.SPONSORS[sid], m = h('div', 'dp-medal' + (small ? ' sm' : ''), glyph(sid, small ? 24 : 34)); m.style.setProperty('--k', P.col); m.setAttribute('role', 'img'); m.setAttribute('aria-label', P.n); return m;
}
const demandLine = (d) => {
  const t = { wins: `Win ${d.n} fights`, appear: `Appear in ${d.n} fights`, style: `${d.n} wins by a ${d.style ? D.STYLES[d.style].n : ''}`, spare: `Spare ${d.n} beaten foe${d.n > 1 ? 's' : ''}`, winrate: `Win ${d.pct}% of your fights (at least ${d.min})`, nodeath: 'Nobody dies' }[d.k];
  return t;
};
const PEN = { fame: 'a public embarrassment: lose fame', sen: 'the Senate frowns: standing drops', rel: 'the shame: morale drops', gold: 'part of the bonus is clawed back', ludi: 'a rival sneers: fame lost' };

function offerCard(ctx, o, draw) {
  const S = ctx.S, lm = L(), P = D.SPONSORS[o.sid], why = lm.sponsorWhy(S, o);
  const c = card([], 'gold');
  c.append(row([patronMedal(o.sid), col([h('div', 'ax-name', P.n), h('div', 'ax-sub', `${P.who} · ${P.role}`), h('div', 'ax-row ax-wrap ax-gap4', [o.ren ? pill('Renewal', { tone: 'good', ico: 'check' }) : pill('New offer', { tone: 'gold', ico: 'star' }), pill(`Lapses in ${Math.max(0, o.exp - S.week + 1)} week${o.exp - S.week ? 's' : ''}`, { tone: 'warn' })])], 'ax-grow')]));
  c.append(note(P.pers), h('div', 'ax-sub', `Perk while it lasts: ${P.perk}`));
  const t = h('div', 'dp-terms');
  o.terms.forEach((x) => {
    const bold = x.v === 'bold', box = h('div', 'dp-term', [h('h5', '', bold ? 'Bold terms' : 'Steady terms'), h('div', 'ax-row ax-wrap ax-gap4', [pill(`${x.weeks} weeks`, { tone: 'blue' }), pill(`${x.pay} / week`, { ico: 'coin', tone: 'gold' }), pill(`+${x.bonus} if kept`, { ico: 'star', tone: 'good' })])]);
    x.dem.forEach((d) => box.append(h('div', 'ax-row', [U.icon('check', 14), h('span', 'ax-sub', demandLine(d))])));
    box.append(h('div', 'ax-sub', `If you fail: ${PEN[P.pen]}${P.pen === 'gold' ? ` (up to ${x.pen} gold)` : ''}; the patron leaves for a while.`));
    box.append(U.button({ label: bold ? 'Sign the bold terms' : 'Sign the steady terms', icon: 'scroll', variant: bold ? 'gold' : 'bronze', block: true, disabled: !!why, onClick: () => { const e = lm.sponsorAccept(S, o.id, x.v); if (e) { ctx.sfx('uiError'); return U.toast(e, { kind: 'bad' }); } ctx.save(); ctx.refresh(); ctx.sfx('levelUp'); U.toast(`${P.n} signs your ludus`, { kind: 'good', ico: 'star' }); draw(); } }));
    t.append(box);
  });
  c.append(t); if (why) c.append(note(why));
  c.append(actions([U.button({ label: 'Decline politely', icon: 'close', variant: 'ghost', onClick: () => { lm.sponsorDecline(S, o.id); ctx.save(); ctx.sfx('uiTap'); draw(); } })]));
  return c;
}
function activeCard(ctx, c0, draw) {
  const S = ctx.S, lm = L(), P = D.SPONSORS[c0.sid];
  const c = card([row([patronMedal(c0.sid), col([h('div', 'ax-name', P.n), h('div', 'ax-sub', `${P.who} · ${c0.v === 'bold' ? 'Bold' : 'Steady'} terms`), meter(c0.weeks - c0.left, c0.weeks, 'var(--lx-gold)')], 'ax-grow'), col([pill(`${c0.left} week${c0.left > 1 ? 's' : ''} left`, { tone: 'blue' }), pill(`${c0.pay} / week`, { ico: 'coin', tone: 'gold' })])])]);
  const dems = h('div', 'dp-dem');
  c0.dem.forEach((d) => {
    const r = lm.sponsorDemand(S, c0, d), st = r.failed ? 'no' : r.ok ? 'ok' : 'wait';
    dems.append(h('span', st, U.icon(r.failed ? 'close' : 'check', 14)), h('span', 'ax-sub', `${r.text}${d.k === 'nodeath' ? (r.failed ? ': broken' : ': kept so far') : `: ${r.got}${r.unit || ''} of ${r.need}${r.unit || ''}`}`));
    if (d.k !== 'nodeath') { const b = meter(r.got, Math.max(1, r.need), r.ok ? '#5b9a4a' : 'var(--lx-gold)'); dems.append(h('span'), b); }
  });
  c.append(dems, h('div', 'ax-sub', `Kept in full: +${c0.bonus} gold. Earned so far: ${c0.earned}. Perk: ${P.perk}`), h('div', 'ax-sub', `Fail it and: ${PEN[P.pen]}${P.pen === 'gold' ? ` (up to ${c0.pen} gold)` : ''}.`));
  return c;
}

export function render(ctx, root, draw) {
  injectDepCss(); root.classList.add('lx-dep'); const S = ctx.S, lm = L(), T = lm.sponsInit(S), slots = lm.sponsorSlots(S);
  root.append(card([row([medal('coin', 'dark big'), col([h('div', 'ax-name', 'Patrons'), note('Rich friends pay your school for a price. Each patron wants something different, pays in a different way and wants the others kept out of it. Keep the terms and they renew on better ones; break them and the penalty stings.')], 'ax-grow')]),
    h('div', 'ax-row ax-wrap', [pill(`${T.active.length} of ${slots} contract${slots > 1 ? 's' : ''}`, { tone: T.active.length >= slots ? 'warn' : 'good', tip: 'A second slot opens in the Colosseum, a third in the Imperial Games.' }), goldPill(S.gold), pill(`${Object.values(T.done).reduce((a, b) => a + b, 0)} kept`, { tone: 'good', ico: 'check' })])], 'gold'));
  root.append(sec(`Offers (${T.offers.length})`));
  if (!T.offers.length) root.append(card([note('No offers waiting. Patrons come to schools with fame and a few wins; events and your reputation draw them. Offers lapse after three weeks.')]));
  T.offers.forEach((o) => root.append(offerCard(ctx, o, draw)));
  root.append(sec(`Contracts (${T.active.length})`));
  if (!T.active.length) root.append(card([note('You have no active contract.')]));
  T.active.forEach((c) => root.append(activeCard(ctx, c, draw)));
  root.append(sec('The five houses'));
  const g = h('div', 'ax-grid');
  D.SPONSOR_IDS.forEach((sid) => {
    const P = D.SPONSORS[sid], rel = T.rel[sid] || 0, done = T.done[sid] || 0, act = lm.sponsorHas(S, sid), offer = T.offers.some((o) => o.sid === sid), cool = (T.cool[sid] || 0) > S.week, locked = S.fame < P.fame;
    g.append(card([row([patronMedal(sid, true), col([h('div', 'ax-b', P.n), h('div', 'ax-sub', P.role)], 'ax-grow'), pill(act ? 'Under contract' : offer ? 'Offer waiting' : locked ? `Fame ${P.fame}` : cool ? 'Cooling off' : 'Watching', { tone: act ? 'gold' : offer ? 'good' : locked ? 'bad' : '' })]), note(P.pers), h('div', 'ax-sub', `Wants: ${P.kinds.map((k) => ({ wins: 'wins', appear: 'appearances', style: 'a style on the sand', spare: 'mercy', winrate: 'a winning record', nodeath: 'no deaths' })[k]).join(' and ')}.`), h('div', 'ax-sub', `Perk: ${P.perk}`), row([h('span', 'ax-sub', 'Goodwill'), meter(rel, 100, '#5b9a4a')]), done ? h('div', 'ax-sub', `${done} contract${done > 1 ? 's' : ''} kept.`) : null], locked ? 'dim' : ''));
  });
  root.append(g);
  if (T.hist.length) { root.append(sec('History')); root.append(card(T.hist.slice().reverse().slice(0, 8).map((x) => h('div', 'ax-row', [patronMedal(x.sid, true), col([h('div', 'ax-sub', `Week ${x.wk}: ${x.n}`)], 'ax-grow'), pill(x.res === 'ok' ? 'Kept' : x.res === 'fail' ? 'Broken' : x.res === 'meh' ? 'Part' : 'Ended', { tone: x.res === 'ok' ? 'good' : x.res === 'fail' ? 'bad' : 'warn' })])))); }
}
export function open(ctx, arg) {
  arg = arg || {}; const scr = openScreen(ctx, { title: 'Patrons', wide: true, onClose: arg.onClose });
  const draw = () => scr.render((root) => render(ctx, root, draw)); draw(); scr.m.el.dataset.tutSheet = 'sponsors'; return scr;
}

/** the story beat dialog (one per contract). The first choice is always safe. */
export async function showBeat(ctx) {
  const lm = L(), S = ctx.S, v = lm.beatView(S); if (!v) return false;
  injectDepCss(); const body = h('div', 'lx-dep'); body.style.cssText = 'display:grid;gap:10px';
  const head = h('div', '', [patronMedal(v.sid, true), h('div', '', [h('b', '', v.P.n), h('div', '', `${v.P.who}`)])]); head.style.cssText = 'display:flex;gap:10px;align-items:center;font:700 13px/18px system-ui,sans-serif;color:#33243a';
  body.append(head, h('p', '', v.text)); body.lastChild.style.cssText = 'font:500 14px/20px system-ui,sans-serif;color:#33243a;margin:0';
  const k = await ctx.ask({ title: v.P.n, body, actions: v.choices.map((c, i) => ({ label: c.l, sub: c.cost ? `Costs ${c.cost} gold` : undefined, value: i, variant: i ? 'bronze' : 'gold' })), dismiss: 0 });
  const r = lm.beatResolve(S, +k); ctx.save(); ctx.refresh();
  if (r) { const out = h('div', '', [h('p', '', r.msg)]); r.fx.forEach((f) => out.append(h('div', '', '• ' + f))); out.style.cssText = 'font:600 14px/20px system-ui,sans-serif;color:#33243a'; await ctx.ask({ title: 'Result', body: out, actions: [{ label: 'Okay', value: 'ok', variant: 'gold' }], dismiss: 'ok' }); }
  return true;
}
/** after the week: story beats first, then a notice for fresh offers (first action: think it over) */
export async function patronFlow(ctx) {
  const lm = L(), S = ctx.S; if (!lm.sponsInit) return; const T = lm.sponsInit(S);
  let n = 0; while (T.beatQ.length && n++ < 3) await showBeat(ctx);
  const fresh = T.offers.filter((o) => !o.seen); fresh.forEach((o) => { o.seen = true; });
  if (fresh.length) {
    const o = fresh[0], P = D.SPONSORS[o.sid];
    const body = h('div', '', [h('p', '', `${P.who} sends a messenger: ${o.ren ? 'they would like to renew on better terms.' : 'they would like to talk about a contract.'}`), h('p', '', P.pers)]); body.style.cssText = 'font:500 14px/20px system-ui,sans-serif;color:#33243a';
    const v = await ctx.ask({ title: o.ren ? 'A patron returns' : 'A patron calls', body, actions: [{ label: 'Think it over', sub: 'The offer waits three weeks', value: 'later', variant: 'bronze' }, { label: 'Read the terms', value: 'read', variant: 'gold', icon: 'scroll' }], dismiss: 'later' });
    if (v === 'read') await new Promise((res) => { open(ctx, { onClose: res }); });
  }
}
