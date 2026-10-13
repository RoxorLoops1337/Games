// Building screen: build menu for an empty plot, level table / synergy / upgrade for a built plot, buy land for locked rows.
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, goldPill, famePill, empty, actions } from './sk.js';
import { legendsSheet } from './legacy.js';

const ICON = { barracks: 'roster', palaestra: 'sword', kitchen: 'heart', bath: 'duststorm', infirmary: 'unbreakable', forge: 'gear', market: 'market', scout: 'scroll', sparring: 'bladedance', stands: 'arena', shrine: 'fame', hall: 'star' };
const FLAVOR = {
  barracks: 'Narrow cots and iron-barred doors. More beds mean a bigger family of fighters.',
  palaestra: 'The sand yard where every dawn begins with sweat. Better equipment makes every drill count.',
  kitchen: 'Barley, beans and figs. Gladiators were called barley men, and a good cook keeps them strong.',
  bath: 'Hot water, cold plunge, and a masseur with strong thumbs. Tired fighters rest here.',
  infirmary: 'A physician, clean linen and bitter herbs. Wounds close faster and fewer fighters fall badly.',
  forge: 'Hammers ring from sunrise. The smith turns spare iron into sharper edges.',
  market: 'Stalls leaning on your wall sell to the crowds. Coin flows in every week.',
  scout: 'A tower above the walls. Lookouts watch rival schools and bring back whispers.',
  sparring: 'A roped ring for friendly bouts. Fighters learn each other and grow bonds.',
  stands: 'Wooden benches on the yard. Paying neighbours make every prize richer.',
  shrine: 'A small altar to Fortuna. Offerings tilt the dice towards better loot and quiet fame.',
  hall: 'Statues of retired champions. Their stories inspire the whole school.',
};
const PARTNER_TIP = 'A building next to its partner gets +10% effect per partner (if it benefits from synergy). Partners must touch edges, not corners.';

export function open(ctx, arg) {
  const S = ctx.S, lm = L(); arg = arg || {};
  let cur = arg.type === 'plot' ? arg.i : arg.plot != null ? arg.plot : -1; if (cur == null) cur = -1;
  const scr = openScreen(ctx, { title: 'Your Ludus', mid: true });
  const changed = () => { ctx.save(); ctx.refresh(); };
  const draw = () => scr.render((root) => {
    root.append(miniMap(ctx, cur, (i) => { cur = i; ctx.sfx('uiTap'); scr.scroller.scrollTop = 0; draw(); }));
    if (cur < 0 || cur >= 16) return overview(ctx, root);
    if (cur >= S.rows * lm.COLS) return landView(ctx, root, cur, () => { changed(); draw(); });
    const p = S.plots[cur];
    if (!p) return buildMenu(ctx, root, cur, () => { changed(); draw(); });
    return detail(ctx, root, cur, () => { changed(); draw(); }, (i) => { cur = i; draw(); });
  }, false);
  draw(); return scr;
}

// ------------------------------------------------------------------ map of plots
function miniMap(ctx, cur, onPick) {
  const S = ctx.S, lm = L(), nb = cur >= 0 ? lm.neighbors(cur) : [];
  const grid = h('div', '');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${lm.COLS},1fr);gap:6px`;
  for (let i = 0; i < 16; i++) {
    if (Math.floor(i / lm.COLS) > S.rows) continue; // show the next locked row only
    const p = S.plots[i], locked = i >= S.rows * lm.COLS, b = h('button', 'ax-pick' + (i === cur ? ' sel' : ''));
    b.type = 'button'; b.style.cssText = 'flex-direction:column;justify-content:center;gap:2px;min-height:52px;padding:4px 4px;text-align:center';
    if (nb.includes(i)) b.style.boxShadow = 'inset 0 0 0 2px rgba(91,122,58,.9)';
    const ic = h('span', '', U.icon(locked ? 'lock' : p ? ICON[p.b] || 'ludus' : 'star', 22));
    if (!p) ic.style.opacity = '.45';
    const lab = h('span', 'ax-sub', locked ? 'Locked' : p ? `${D.BUILD[p.b].n}` : 'Empty'); lab.style.cssText = 'font-size:11px;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    b.append(ic, lab); if (p) b.append(h('small', 'ax-num', 'L' + p.l)); b.style.opacity = locked ? '.6' : '';
    b.setAttribute('aria-label', locked ? `Plot ${i + 1}, locked` : p ? `${D.BUILD[p.b].n}, level ${p.l}` : `Plot ${i + 1}, empty`);
    b.onclick = () => onPick(i); grid.append(b);
  }
  return card([h('div', 'ax-row', [h('div', 'ax-name', 'The grounds'), h('span', 'ax-grow'), cur >= 0 ? pill('Green edge: neighbours', { tone: 'good', tip: PARTNER_TIP, tipTitle: 'Neighbours' }) : null]), grid]);
}

function overview(ctx, root) {
  const S = ctx.S, built = S.plots.filter(Boolean).length;
  root.append(card([row([medal('ludus', 'dark big'), col([h('div', 'ax-name', S.name || 'Your ludus'), note(`${built} building${built === 1 ? '' : 's'} of ${D.BUILD_IDS.length}. Tap a plot above to build or upgrade. Buildings that sit next to their partners work better.`)], 'ax-grow')])]));
}

// ------------------------------------------------------------------ locked row: buy land
function landView(ctx, root, i, done) {
  const S = ctx.S, lm = L(), cost = lm.landCost(S), fame = lm.landFame(S), okFame = S.fame >= fame, okGold = S.gold >= cost;
  root.append(card([row([medal('lock', 'dark big'), col([h('div', 'ax-name', 'Unclaimed land'), note('Buy another row of plots to make room for more buildings and richer neighbourhoods.')], 'ax-grow')]),
    h('div', 'ax-row ax-wrap', [goldPill(cost, 'Price of the next row'), famePill(fame, 'Fame needed to buy'), okFame ? pill('Fame ok', { tone: 'good', ico: 'check' }) : pill(`Need ${fmt(fame - S.fame)} more fame`, { tone: 'bad' })]),
    U.button({ label: 'Buy land', icon: 'coin', variant: okFame && okGold ? 'gold' : 'ghost', block: true, onClick: () => {
      const e = lm.buyLand(S); if (e) { ctx.sfx('uiError'); return U.toast(e, { kind: 'bad' }); }
      ctx.sfx('coin'); ctx.sfx('uiConfirm'); U.toast('New land acquired!', { kind: 'good', ico: 'check' }); done();
    } })], 'gold'));
}

// ------------------------------------------------------------------ empty plot: build menu
function buildMenu(ctx, root, i, done) {
  const S = ctx.S, lm = L(), nbs = lm.neighbors(i);
  root.append(note('Choose a building for this plot. Each type can be built once. Partners next to a plot boost it.'));
  const ids = D.BUILD_IDS.filter((id) => lm.plotOf(S, id) < 0);
  if (!ids.length) { root.append(empty('check', 'Everything is built', 'Upgrade your buildings to make them stronger.')); return; }
  const list = h('div', 'ax-col');
  ids.forEach((id) => {
    const B = D.BUILD[id], cost = lm.buildCost(id, 1), okFame = S.fame >= B.fame, okGold = S.gold >= cost;
    const near = nbs.map((n) => S.plots[n]).filter((p) => p && B.like.includes(p.b));
    const likes = h('div', 'ax-row ax-wrap ax-gap4', [h('span', 'ax-sub', 'Partners'), ...B.like.map((x) => {
      const at = near.some((p) => p.b === x), built = lm.plotOf(S, x) >= 0;
      return pill(D.BUILD[x].n, { tone: at ? 'good' : '', ico: at ? 'check' : undefined, tip: at ? 'Already next to this plot.' : built ? 'Built, but not next to this plot.' : 'Not built yet.', tipTitle: 'Partner' });
    })]);
    const btn = okFame
      ? U.button({ label: `Build ${fmt(cost)}`, icon: 'coin', variant: okGold ? 'gold' : 'ghost', block: true, onClick: () => {
        const e = lm.build(S, i, id); if (e) { ctx.sfx('uiError'); return U.toast(e, { kind: 'bad' }); }
        ctx.sfx('coin'); ctx.sfx('uiConfirm'); U.toast(`${B.n} built!`, { kind: 'good', ico: 'check' }); done();
      } })
      : h('div', 'ax-row', [pill(`Needs ${fmt(B.fame)} fame`, { ico: 'lock', tone: 'bad', tip: `You have ${fmt(S.fame)} fame. Win fights to earn more.` })]);
    list.append(card([row([medal(ICON[id], 'dark'), col([h('div', 'ax-name', B.n), h('div', 'ax-b', B.f(B.v[1], 1)), note(FLAVOR[id])], 'ax-grow')]), likes,
      B.syn && near.length ? pill(`+${near.length * 10}% from neighbours here`, { tone: 'good', tip: PARTNER_TIP }) : null, btn], okFame ? '' : 'dim'));
  });
  root.append(list);
}

// ------------------------------------------------------------------ built plot: detail
function detail(ctx, root, i, done, goto) {
  const S = ctx.S, lm = L(), p = S.plots[i], B = D.BUILD[p.b], fx = lm.bfx(S, p.b), syn = lm.synAt(S, i), cap = lm.levelCap(S);
  const nextV = p.l < 5 ? B.v[p.l + 1] * (1 + 0.1 * (B.syn ? syn : 0)) : 0, cost = p.l < 5 ? lm.buildCost(p.b, p.l + 1) : 0;
  const pips = h('div', 'ax-lvl', [1, 2, 3, 4, 5].map((l) => h('i', l <= p.l ? 'on' : l > cap ? 'cap' : '')));
  root.append(card([row([medal(ICON[p.b], 'big'), col([h('div', 'ax-name', B.n), pips, note(FLAVOR[p.b])], 'ax-grow'), pill(`Level ${p.l}/5`, { tone: 'gold' })]),
    kv('Now', B.f(fx.v, p.l)), p.l < 5 ? kv('Next level', B.f(nextV, p.l + 1)) : note('Maximum level reached.')], 'gold'));

  // synergy
  root.append(sec('Neighbours'));
  const nbs = lm.neighbors(i), nbNames = nbs.map((n) => S.plots[n]).filter(Boolean);
  const partners = h('div', 'ax-row ax-wrap ax-gap4', B.like.map((x) => {
    const near = nbNames.some((q) => q.b === x), built = lm.plotOf(S, x) >= 0;
    const el = pill(D.BUILD[x].n, { tone: near ? 'good' : built ? 'warn' : '', ico: near ? 'check' : undefined, tip: near ? 'Next to this building: bonus active.' : built ? 'Built elsewhere. Moving is not possible, but new rows may help.' : 'Not built yet. Build it on a plot touching this one.', tipTitle: D.BUILD[x].n });
    if (!built) { el.style.cursor = 'pointer'; }
    return el;
  }));
  root.append(card([note(B.syn ? `Likes ${B.like.map((x) => D.BUILD[x].n).join(' and ')} next to it: +10% effect each. Right now ${syn} nearby (+${syn * 10}%).` : `Likes ${B.like.map((x) => D.BUILD[x].n).join(' and ')} nearby. This building has no effect bonus of its own, but its partners boost it when they are the ones that benefit from synergy.`), partners,
    nbNames.length ? note('Touching: ' + nbNames.map((q) => `${D.BUILD[q.b].n} L${q.l}`).join(', ')) : note('No building touches this plot yet.')]));

  // level table
  root.append(sec('What each level gives'));
  const tbl = h('div', 'ax-col ax-gap4');
  for (let l = 1; l <= 5; l++) {
    const v = B.v[l] * (1 + 0.1 * (B.syn ? syn : 0)), now = l === p.l, lockd = l > p.l;
    const status = l < p.l ? pill('Built', { tone: 'good', ico: 'check' }) : now ? pill('Now', { tone: 'gold' }) : l > cap ? pill('Needs more fame', { ico: 'lock', tone: 'bad', tip: 'Your league limits building levels. Win fame to reach the next league.' }) : goldPill(lm.buildCost(p.b, l), 'Upgrade cost');
    const r = h('div', 'ax-plan' + (now ? ' now' : '') + (lockd && l > cap ? ' lockd' : ''), [h('span', 'n', String(l)), h('span', '', B.f(v, l)), status]);
    tbl.append(r);
  }
  root.append(tbl);

  // upgrade
  if (p.l < 5) {
    const blocked = p.l >= cap, short = S.gold < cost;
    const up = U.button({ label: blocked ? `Need more fame for level ${p.l + 1}` : `Upgrade to level ${p.l + 1}`, sub: blocked ? undefined : `${fmt(cost)} gold${short ? ` (need ${fmt(cost - S.gold)} more)` : ''}`, icon: blocked ? 'lock' : 'coin', variant: blocked || short ? 'ghost' : 'gold', block: true, onClick: () => {
      const e = lm.upgrade(S, i); if (e) { ctx.sfx('uiError'); return U.toast(e, { kind: 'bad' }); }
      ctx.sfx('coin'); ctx.sfx('uiConfirm'); U.toast(`${B.n} is now level ${p.l}!`, { kind: 'good', ico: 'check' }); done();
    } });
    root.append(up);
  }

  // specials
  const sp = [];
  if (p.b === 'kitchen') sp.push(U.button({ label: 'Change menu', icon: 'heart', variant: 'bronze', onClick: () => menuSheet(ctx, done) }));
  if (p.b === 'shrine') sp.push(U.button({ label: `Memorial wall (${(S.fallen || []).length})`, icon: 'fame', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'memorial' }) }));
  if (p.b === 'hall') sp.push(U.button({ label: 'View legends', icon: 'star', variant: 'bronze', onClick: () => legendsSheet(ctx) }));
  if (p.b === 'barracks' || p.b === 'palaestra' || p.b === 'sparring' || p.b === 'infirmary' || p.b === 'bath') sp.push(U.button({ label: 'Open roster', icon: 'roster', variant: 'bronze', onClick: () => ctx.open('roster') }));
  if (p.b === 'market') sp.push(U.button({ label: 'Visit market', icon: 'market', variant: 'bronze', onClick: () => ctx.open('market') }));
  if (p.b === 'forge') sp.push(U.button({ label: 'Open armory', icon: 'sword', variant: 'bronze', onClick: () => ctx.open('armory') }));
  if (p.b === 'scout' || p.b === 'stands') sp.push(U.button({ label: 'Open arena', icon: 'arena', variant: 'bronze', onClick: () => ctx.open('arena') }));
  if (sp.length) root.append(actions(sp));
}

function menuSheet(ctx, done) {
  const S = ctx.S, lm = L(), kv0 = D.BUILD.kitchen.v[lm.bfx(S, 'kitchen').l];
  const scr = openScreen(ctx, { title: 'Weekly menu', mid: true });
  const draw = () => scr.render((root) => {
    root.append(note('Plant-based fuel for the whole ludus. Gladiators were once called "hordearii", barley men. Cost is per fighter per week.'));
    D.MENUS.forEach((m) => {
      const ok = kv0 >= m.k, on = S.menu === m.id;
      const b = h('div', 'ax-pick' + (on ? ' sel' : '')); b.tabIndex = 0; b.setAttribute('role', 'button'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (!ok) b.setAttribute('aria-disabled', 'true');
      b.append(h('span', 'ax-check', U.icon('check', 16)), col([h('div', 'ax-b', m.n), note(m.d)], 'ax-grow'), ok ? pill(m.c ? m.c + 'g' : 'Free', { tone: 'gold', ico: m.c ? 'coin' : undefined }) : pill(`Kitchen L${m.k}`, { ico: 'lock', tone: 'bad', tip: 'Upgrade the Kitchen to unlock this menu.' }));
      const act = () => { if (!ok) { ctx.sfx('uiError'); return U.toast('Upgrade the Kitchen first', { kind: 'bad' }); } S.menu = m.id; ctx.save(); ctx.sfx('uiConfirm'); done && done(); draw(); };
      b.onclick = act; b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
      root.append(b);
    });
  });
  draw(); return scr;
}
