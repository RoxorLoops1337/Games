// Hall of Legends, laurel perks and founding a new ludus. Used by the Arena (Glory) and More screens.
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, empty, actions, styleBadge, confirmDialog } from './sk.js';

export function legendsSheet(ctx) {
  const S = ctx.S, lm = L(), slots = Math.round(lm.bfx(S, 'hall').v), list = S.legends || [];
  const scr = openScreen(ctx, { title: 'Hall of Legends', mid: true });
  scr.render((root) => {
    root.append(U.button({ label: `Memorial wall (${(S.fallen || []).length} fallen)`, icon: 'fame', variant: 'bronze', block: true, onClick: () => ctx.open('world', { tab: 'memorial' }) }));
    root.append(note(`${list.length} legend${list.length === 1 ? '' : 's'} and ${slots} statue slot${slots === 1 ? '' : 's'}. Each active legend gives +1.5% training to everyone and +3% to their best stat. Upgrade the Hall for more slots.`));
    if (!list.length) { root.append(empty('fame', 'No legends yet', 'Retire a level 8+ gladiator from their profile to carve their statue.')); return; }
    list.forEach((l, i) => {
      const on = i < slots;
      root.append(card([row([styleBadge(l.style, 52), col([h('div', 'ax-name', `${l.name}${l.nick ? ' ' + l.nick : ''}`), h('div', 'ax-sub', `Level ${l.lvl} · ${l.w}W ${l.l}L · best ${D.SN[l.best]}${l.title ? ' · ' + l.title : ''}${l.wk ? ' · retired week ' + l.wk : ''}`)], 'ax-grow'),
        pill(on ? 'Active' : 'No slot', { tone: on ? 'good' : 'warn', tip: on ? 'This statue grants its bonus.' : 'Build or upgrade the Hall of Legends to add statue slots.' })])], on ? 'gold' : 'dim'));
    });
  });
  return scr;
}

export function perksSheet(ctx, onChange) {
  const S = ctx.S, lm = L();
  const scr = openScreen(ctx, { title: 'Laurel perks', mid: true });
  const draw = () => scr.render((root) => {
    root.append(card([row([medal('fame', 'dark big'), col([h('div', 'ax-name', `${S.laurels} laurels`), note('Perks last across all your ludi. Each level costs one more laurel than the last.')], 'ax-grow')])], 'gold'));
    D.PERKS.forEach((p) => {
      const lv = (S.perks || {})[p.id] || 0, cost = lm.perkCost(S, p), maxed = lv >= p.max, can = !maxed && S.laurels >= cost;
      root.append(card([row([col([h('div', 'ax-name', p.n), note(`${p.d} per level`), h('div', 'ax-lvl', Array.from({ length: p.max }, (_, i) => h('i', i < lv ? 'on' : '')))], 'ax-grow'),
        U.button({ label: maxed ? 'Max' : String(cost), icon: maxed ? undefined : 'fame', variant: can ? 'gold' : 'ghost', disabled: !can, onClick: () => {
          const e = lm.buyPerk(S, p.id); if (e) { ctx.sfx('uiError'); return U.toast(e, { kind: 'bad' }); }
          ctx.save(); ctx.refresh(); ctx.sfx('uiConfirm'); U.toast(`${p.n} level ${lv + 1}`, { kind: 'good', ico: 'check' }); onChange && onChange(); draw();
        } })])]));
    });
  });
  draw(); return scr;
}

export async function ascendFlow(ctx) {
  const S = ctx.S, lm = L();
  if (!lm.canAscend(S)) return U.toast('Reach 1800 fame or win the Imperial Games first.', { kind: 'bad' });
  const ok = await confirmDialog(ctx, { title: 'Found a new ludus?', text: `You earn ${lm.laurelsFor(S)} laurels and keep your perks, legends and trophies. Everything else resets: gold, fame, fighters, buildings and gear. Your best fighters return as ghost rivals.`, yes: 'Found a new ludus', no: 'Not yet', danger: true });
  if (!ok) return false;
  const N = lm.ascend(S); N.opts = S.opts; N.lastBackup = S.lastBackup;
  const g = lm.makeGlad({ id: N.nextId++, lvl: 1, q: 0.7 }); g.act = 'str'; lm.assignStory(g); N.glads.push(g);
  ctx.game.S = N; ctx.save(); ctx.closeAll(); ctx.refresh(); ctx.sfx('levelUp'); U.toast('A new ludus rises!', { kind: 'good', ico: 'fame' });
  return true;
}
