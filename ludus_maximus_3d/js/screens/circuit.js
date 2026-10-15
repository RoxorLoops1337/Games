// The Circuit: a simple SVG map of the province. Towns unlock with fame. Travelling costs gold and weeks on the road (no fights), then the town's
// arena changes which events you are offered (higher purses, a weekly Showpiece duel, its own arena look). Rules: core/economy.js (LM.TOWNS, LM.travel, LM.townFor).
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, medal, pill, goldPill, famePill, actions, confirmDialog } from './sk.js';

const NS = 'http://www.w3.org/2000/svg';
const CSS = `
.cr-map{width:100%;height:auto;max-height:48vh;display:block;border-radius:10px;background:#16304a;box-shadow:inset 0 0 0 2px rgba(242,193,78,.45)}
.cr-town{cursor:pointer}
.cr-town:focus-visible .cr-ring{stroke:#fff;stroke-width:3}
.cr-town text{font:800 11px var(--lx-sans);fill:#fff;paint-order:stroke;stroke:#10202e;stroke-width:3px;pointer-events:none}
.cr-town.lock text{fill:#b6b0c4}
.cr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
`;
const st = { sel: null };
const THEME_NAME = { provincial: 'Provincial arena', capua: 'Capua ludus arena', alexandria: 'Alexandrian harbour arena', carthage: 'Carthaginian amphitheatre', imperial: 'The Imperial Colosseum' };
const svg = (tag, a, kids) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); (kids || []).forEach((c) => e.append(c)); return e; };

export function open(ctx, arg) {
  if (!document.getElementById('cr-css')) { const s = document.createElement('style'); s.id = 'cr-css'; s.textContent = CSS; document.head.append(s); }
  arg = arg || {};
  const scr = openScreen(ctx, { title: 'The Circuit', wide: true });
  const draw = () => scr.render((root) => body(ctx, root, draw));
  draw(); return scr;
}

function where(S, lm) {
  const hist = lm.eco(S).hist, cur = hist[hist.length - 1];
  if (!cur) return { txt: 'Your ludus is at home.', road: false, id: 'home' };
  const t = lm.townFor(S, S.week);
  if (t === 'road') return { txt: `On the road to ${cur.town === 'home' ? 'home' : lm.TOWNS[cur.town].n}, arriving in week ${cur.arrive}. No fights are offered until then.`, road: true, id: 'road' };
  if (!t) { const next = lm.townFor(S, S.week + 1); return { txt: next === 'road' ? 'Leaving next week.' : 'Your ludus is at home.', road: false, id: 'home' }; }
  return { txt: `Your ludus is hosted in ${t.n}.`, road: false, id: t.id };
}

function body(ctx, root, draw) {
  const S = ctx.S, lm = L(), E = lm.eco(S), w = where(S, lm), TW = lm.TOWNS, ids = lm.TOWN_IDS;
  const up = lm.townFor(S, S.week + 1), upNext = up === 'road' ? 'road' : up ? up.id : 'home';
  root.append(card([row([medal('arena', 'dark big'), col([h('div', 'ax-name', 'The province'), note(w.txt)], 'ax-grow')]), upNext !== w.id && upNext !== 'road' ? pill(`Moving next week: ${upNext === 'home' ? 'home' : TW[upNext].n}`, { tone: 'warn' }) : null,
    note('Towns open as your fame grows. In a host town the arena of your league pays more and offers a weekly Showpiece duel. The road costs a week or more with no fights, and lodging while you are away.')]));
  // map
  const map = svg('svg', { viewBox: '0 0 400 260', class: 'cr-map', role: 'img', 'aria-label': 'Map of the province with six towns' });
  map.append(svg('rect', { width: 400, height: 260, fill: '#16304a' }), svg('path', { d: 'M0 0H400V40Q300 60 200 30 100 10 0 40Z', fill: '#1a3a58' }));
  map.append(svg('path', { d: 'M138 6L170 10 184 38 206 66 226 90 246 124 238 136 214 126 194 138 178 122 164 96 138 72 122 40Z', fill: '#6b8a4a', stroke: '#c9b77a', 'stroke-width': 2 }));
  map.append(svg('path', { d: 'M0 192L60 186 112 202 150 196 200 206 262 210 330 216 400 210V260H0Z', fill: '#b99a5a', stroke: '#e0c27a', 'stroke-width': 2 }));
  map.append(svg('ellipse', { cx: 86, cy: 118, rx: 14, ry: 26, fill: '#6b8a4a', stroke: '#c9b77a', 'stroke-width': 1.5 }), svg('ellipse', { cx: 208, cy: 168, rx: 18, ry: 9, fill: '#6b8a4a', stroke: '#c9b77a', 'stroke-width': 1.5 }));
  const hx = 232, hy = 78; // home
  ids.forEach((id) => { const T = TW[id]; map.append(svg('line', { x1: hx, y1: hy, x2: T.x * 400, y2: T.y * 260, stroke: S.fame >= T.fame ? 'rgba(242,193,78,.55)' : 'rgba(255,255,255,.18)', 'stroke-width': 2, 'stroke-dasharray': '5 5' })); });
  const node = (id, x, y, label, lock, on, here, fn) => {
    const g = svg('g', { class: 'cr-town' + (lock ? ' lock' : ''), tabindex: 0, role: 'button', 'aria-label': `${label}${lock ? ', locked' : ''}${here ? ', you are here' : ''}` });
    g.append(svg('circle', { class: 'cr-ring', cx: x, cy: y, r: here ? 14 : 11, fill: lock ? '#4a4660' : on ? '#f2c14e' : '#c25a2b', stroke: here ? '#fff' : '#1d1830', 'stroke-width': here ? 3 : 2 }), svg('circle', { cx: x, cy: y, r: 22, fill: 'transparent' }));
    if (lock) g.append(svg('path', { d: `M${x - 4} ${y + 3}h8v-5a4 4 0 0 0-8 0z`, fill: '#d0cadf' }));
    const t = svg('text', { x, y: y + 26, 'text-anchor': 'middle' }); t.textContent = label; g.append(t);
    g.addEventListener('click', fn); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }); map.append(g);
  };
  node('home', hx, hy, 'Your ludus', false, st.sel === 'home', w.id === 'home', () => { st.sel = 'home'; ctx.sfx('uiTap'); draw(); });
  ids.forEach((id) => { const T = TW[id]; node(id, T.x * 400, T.y * 260, T.n, S.fame < T.fame, st.sel === id, w.id === id, () => { st.sel = id; ctx.sfx('uiTap'); draw(); }); });
  root.append(map);
  // detail
  const sel = st.sel || (w.id !== 'road' ? w.id : 'home');
  if (sel === 'home') {
    const c = lm.tripCost(S, 'home'), why = lm.tripWhy(S, 'home');
    root.append(card([row([medal('ludus', 'dark'), col([h('div', 'ax-name', 'Your ludus'), note('Home. No bonuses and no lodging, and the ordinary calendar of fights.')], 'ax-grow')]), h('div', 'ax-row ax-wrap ax-gap4', [goldPill(c.gold, 'Cost of the journey'), pill(`${c.weeks} week on the road`, { ico: 'arena' })]),
      U.button({ label: why || 'Travel home', icon: 'ludus', variant: 'gold', block: true, disabled: !!why, onClick: () => go(ctx, 'home', draw) })]));
  } else {
    const T = TW[sel], locked = S.fame < T.fame, c = lm.tripCost(S, sel), why = lm.tripWhy(S, sel), ren = lm.townRenown(S, sel);
    root.append(card([row([medal('arena', locked ? 'dark' : ''), col([h('div', 'ax-name', T.n), note(T.d)], 'ax-grow')]),
      h('div', 'ax-row ax-wrap ax-gap4', [locked ? pill(`Needs ${fmt(T.fame)} fame`, { tone: 'bad', ico: 'lock' }) : pill('Open', { tone: 'good', ico: 'check' }), pill('Hosts ' + T.hosts.map((l) => D.LEAGUES[l].n).join(' and '), { tone: 'blue', ico: 'fame' }), pill(`Purses x${T.purse.toFixed(2)}`, { tone: 'gold', ico: 'coin' }), pill(`Fame x${T.fameMul.toFixed(2)}`, { tone: 'vio', ico: 'fame', tip: 'Prestige: fame won in this arena is multiplied.', tipTitle: 'Prestige' })]),
      note(`Arena: ${THEME_NAME[T.theme]}. A Showpiece duel is announced every other week. Win at least three times here and the purses grow another 2%, up to 10%. Wins here so far: ${ren}.`),
      h('div', 'ax-row ax-wrap ax-gap4', [goldPill(c.gold, 'Cost of the journey'), pill(`${c.weeks} week${c.weeks > 1 ? 's' : ''} on the road`, { ico: 'arena', tone: 'warn' }), pill('Lodging 5 gold per fighter a week', { tone: '' })]),
      T.goods ? note('Trade: ' + Object.keys(T.goods).map((g) => `${lm.GOODS[g].n} ${T.goods[g] < 1 ? 'cheap' : 'dear'}`).join(', ') + '.') : null,
      U.button({ label: why || `Travel to ${T.n}`, icon: 'arena', variant: 'gold', block: true, disabled: !!why, onClick: () => go(ctx, sel, draw) })], locked ? 'dim' : ''));
  }
  if (E.hist.length) root.append(note('Entries you made for the weeks after you set out are refunded when you travel.'));
}

async function go(ctx, id, draw) {
  const S = ctx.S, lm = L(), n = Object.keys(S.entries).filter((k) => parseInt(k.split(':')[0], 10) > S.week).length;
  if (n && !(await confirmDialog(ctx, { title: 'Leave next week?', text: `${n} entr${n === 1 ? 'y' : 'ies'} in later weeks will be withdrawn and refunded.`, yes: 'Set out' }))) return;
  const e = lm.travel(S, id); if (e) { ctx.sfx('uiError'); U.toast(e, { kind: 'bad' }); return; }
  ctx.save(); ctx.refresh(); ctx.sfx('coin'); U.toast(id === 'home' ? 'The ludus heads home' : `The ludus sets out for ${lm.TOWNS[id].n}`, { kind: 'info', ico: 'arena' }); draw();
}
