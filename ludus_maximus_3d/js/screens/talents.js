// FIGHTERS: Talents sheet. Three branches of two tiers per style (choices, never counters), one point per level, respec for gold, weapon mastery that grows by use,
// the signature upgrade each branch ends in, and the worn renown title. Core in core/fighters.js (LM.fTree, fTalent, fRespec, fMastery, fTitles).
import { h, U, D, L, fmt, injectCss, addCss, clearTips, chip, sec, wide, note, confirm } from './ui_common.js';

const CSS = `
.tl-pts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tl-pts b{font:900 22px/1 var(--lx-sans);color:#7a2f30}
.tl-br{display:grid;gap:8px;grid-template-columns:1fr}
@media(min-width:760px){.tl-br{grid-template-columns:repeat(3,minmax(0,1fr));align-items:start}}
.tl-bt{font:800 13px var(--lx-serif);letter-spacing:.1em;text-transform:uppercase;color:#7a2f30;margin:2px 0 6px}
.tl-node{display:grid;gap:5px;min-width:0}
.tl-node.locked{opacity:.62}
.tl-node.cap{border-color:#c98e24}
.tl-rk{display:inline-flex;gap:4px}
.tl-rk i{width:12px;height:12px;border-radius:3px;transform:rotate(45deg);background:rgba(0,0,0,.18);box-shadow:inset 0 1px 1px rgba(0,0,0,.4)}
.tl-rk i.on{background:radial-gradient(circle at 35% 30%,#ffe08a,#c98e24);box-shadow:0 0 4px rgba(242,193,78,.8),inset 0 0 0 1px #7a5222}
.tl-mast{display:grid;gap:6px}
.tl-perks{display:grid;gap:3px;font:600 12px/16px var(--lx-sans);color:#5a4560}
.tl-perks .on{color:#2a1a30;font-weight:800}
.tl-ttl{display:flex;flex-wrap:wrap;gap:6px}
.tl-ttl button{min-height:44px;cursor:pointer;font-family:inherit;border:0;background:none;padding:0}
.tl-ttl button[aria-pressed=true] .lm-chip{box-shadow:0 0 0 3px #f2c14e}
`;

export function open(ctx, g, onChange) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D(), owned = S.glads.includes(g);
  lm.fEnsure(S, g);
  const body = h('div', 'lm-sheetbody');
  const m = wide(ctx.sheet({ title: `Talents: ${g.name}`, body, actions: [U.button({ label: 'Done', variant: 'gold', block: true, onClick: () => m.close() })], onClose: () => onChange && onChange() }), 880);
  const mods = (per) => lm.fighters.modLine(per);

  function pointsCard() {
    const free = lm.fFree(g), spent = lm.fSpent(g), cost = lm.fRespecCost(g);
    const c = h('div', 'lm-card' + (free ? ' lm-gold' : ''));
    const row = h('div', 'tl-pts', [h('b', 'lm-num', String(free)), h('div', 'lm-grow', [h('div', 'lm-name', free === 1 ? 'talent point to spend' : 'talent points to spend'), h('div', 'lm-sub', `${spent} spent. One point per level up to level 11, then one at level 15 and 20 (12 in all). Picks are not counters: every branch is a different way to win.`)])]);
    c.append(row);
    if (owned && spent) { const b = U.button({ label: `Respec ${cost}g`, variant: 'bronze', disabled: S.gold < cost, onClick: async () => { if (!(await confirm(ctx, { title: 'Reset all talents?', text: `Costs ${cost} gold. Every point comes back.`, label: 'Respec', variant: 'gold' }))) return; const e = lm.fRespec(S, g); if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; } ctx.sfx('coin'); ctx.save(); ctx.refresh(); render(); } }); b.style.marginTop = '8px'; c.append(b); }
    return c;
  }
  function node(b, n) {
    const r = lm.fRank(g, n.id), why = lm.fTalentWhy(S, g, n.id), maxed = r >= n.max, locked = n.need && lm.fRank(g, n.need) < 2;
    const c = h('div', 'lm-card tl-node' + (locked ? ' locked' : '') + (n.t === 2 ? ' cap' : ''));
    const rk = h('span', 'tl-rk'); for (let i = 0; i < n.max; i++) rk.append(h('i', i < r ? 'on' : '')); rk.setAttribute('role', 'img'); rk.setAttribute('aria-label', `Rank ${r} of ${n.max}`);
    c.append(h('div', 'lm-row', [h('div', 'lm-grow', [h('div', 'lm-name', n.n), h('div', 'lm-sub', `Tier ${n.t === 1 ? 'I' : 'II'}: ${mods(n.per)} per rank`)]), rk]));
    if (n.cap) c.append(h('div', 'lm-sub', [h('b', '', 'Signature at full rank: '), `${n.cap.n}. ${n.cap.d}.`]), maxed ? chip('Signature learned', 'gold') : '');
    if (locked) c.append(h('div', 'lm-sub', `Needs two ranks of ${lm.fNode(g.style, n.need).n}.`));
    if (owned) {
      const btn = U.button({ label: maxed ? 'Full' : 'Rank up', icon: maxed ? 'check' : 'star', variant: maxed ? 'ghost' : 'gold', disabled: !!why, onClick: () => { const e = lm.fTalent(S, g, n.id); if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; } ctx.sfx('levelUp'); ctx.save(); ctx.refresh(); render(); } });
      btn.setAttribute('aria-label', `${n.n}: ${maxed ? 'full' : why || 'rank up'}`); c.append(btn);
    }
    return c;
  }
  function trees() {
    const wrap = h('div', 'tl-br');
    lm.fTree(g.style).forEach((b) => { const col = h('div', '', [h('div', 'tl-bt', b.n)]); b.nodes.forEach((n) => { const nn = node(b, n); nn.style.marginBottom = '8px'; col.append(nn); }); wrap.append(col); });
    return wrap;
  }
  function mastery() {
    const M = lm.fMastery(g), W = lm.fWEAPONS[M.w], c = h('div', 'lm-card tl-mast');
    c.append(h('div', 'lm-row lm-wrap', [h('b', 'lm-name', W.n), chip(M.n, M.tier >= 3 ? 'gold' : 'bronze'), h('span', 'lm-sub lm-num', `${M.v} use${M.v === 1 ? '' : 's'}`)]));
    c.append(U.bar({ value: M.next ? M.v : 1, max: M.next || 1, kind: 'xp', height: 9, label: M.next ? `${M.v}/${M.next} to the next tier` : 'Master' }));
    const pl = h('div', 'tl-perks'); W.perks.forEach((p, i) => { const t = lm.fMTIER[i + 1], on = M.tier >= i + 1; pl.append(h('div', on ? 'on' : '', `${on ? '✓ ' : ''}${p}: ${t.n} at ${t.at} uses (${mods(t.m)})`)); });
    c.append(pl, h('div', 'lm-sub', 'Mastery grows with every fight (a win counts double) and stays with the weapon if you retrain to another style that uses it.'));
    return c;
  }
  function titles() {
    const box = h('div'); const all = lm.fTITLES, c = h('div', 'lm-card');
    const worn = lm.fTitleDef(g.rn);
    c.append(h('div', 'lm-sub', worn ? `Worn on the nameplate: ${worn.n}. Each title adds ${Math.round(worn.fame * 100)}% fame from fights.` : 'No title worn. Earn names from your deeds; the worn one shows on the nameplate and adds a little fame.'));
    const row = h('div', 'tl-ttl'); row.style.marginTop = '6px';
    all.forEach((t) => {
      const has = (g.tt || []).includes(t.id), b = h('button', '', chip(has ? t.n : t.n + '?', has ? 'gold' : 'grey', has ? `${t.d}. +${Math.round(t.fame * 100)}% fame.` : `Not earned: ${t.d}.`)); b.type = 'button'; b.setAttribute('aria-pressed', g.rn === t.id); b.disabled = !has || !owned;
      b.addEventListener('click', () => { lm.fSetTitle(g, g.rn === t.id ? '' : t.id); ctx.sfx('uiTap'); ctx.save(); ctx.refresh(); render(); }); row.append(b);
    });
    c.append(row); box.append(c); return box;
  }
  function render() {
    const sc = body.parentElement ? body.parentElement.scrollTop : 0;
    clearTips(); body.replaceChildren(pointsCard(), sec('Talent trees', h('span', 'lm-sub', d.STYLES[g.style].n)), trees(), sec('Weapon mastery'), mastery(), sec('Renown titles'), titles());
    if (body.parentElement) body.parentElement.scrollTop = sc;
  }
  render();
  return m;
}
