// Equip picker for one gear slot: current item, spare items with stat deltas, equip / unequip through LM.equip / LM.unequip.
import { h, U, D, L, injectCss, addCss, clearTips, chip, sec, wide, empty, note } from './ui_common.js';
import { itemCard } from '../uihelpers.js';

const CSS = `
.eq-item{position:relative;margin:0 0 10px}
.eq-item .fv-item{margin:0!important;cursor:pointer;min-height:64px}
.eq-item .fv-item:hover{background:rgba(242,193,78,.25)!important}
.eq-item .fv-item:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.eq-deltas{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.eq-d{display:inline-flex;gap:3px;padding:1px 7px;border-radius:6px;font:800 11px/16px var(--lx-sans);background:rgba(0,0,0,.08);color:#4a3550}
.eq-d.up{background:rgba(63,154,106,.22);color:#1f6a40} .eq-d.dn{background:rgba(194,57,47,.18);color:#9d2a20}
.eq-cur{border-color:#c98e24}
`;
const KEYS = [['hp', 'HP', 1], ['atk', 'ATK', 1], ['def', 'DEF', 1], ['spd', 'SPD', 1], ['crit', 'CRIT%', 100], ['eva', 'EVA%', 100]];

/** stat deltas of g if `it` replaced the item in its slot */
export function deltas(g, it, slot) {
  const lm = L(), base = lm.derive(g, { noperf: true });
  const gear = Object.assign({}, g.gear); if (it) gear[slot] = it; else delete gear[slot];
  const nx = lm.derive(Object.assign({}, g, { gear }), { noperf: true });
  return KEYS.map(([k, lab, mul]) => ({ k, lab, v: Math.round((nx[k] - base[k]) * mul * 10) / 10 })).filter((x) => Math.abs(x.v) >= 0.1);
}
function deltaEl(list) {
  const e = h('div', 'eq-deltas');
  if (!list.length) e.append(h('span', 'eq-d', 'No stat change'));
  list.forEach((x) => e.append(h('span', 'eq-d ' + (x.v > 0 ? 'up' : 'dn'), `${x.v > 0 ? '+' : ''}${Number.isInteger(x.v) ? x.v : x.v.toFixed(1)} ${x.lab}`)));
  return e;
}

export function open(ctx, g, slot, onChange) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D();
  const body = h('div', 'lm-sheetbody');
  const m = wide(ctx.sheet({ title: d.SLOT_NAME[slot], body }), 560);
  const done = () => { ctx.save(); ctx.refresh(); onChange && onChange(); };
  function render() {
    clearTips(); body.replaceChildren(note(`${g.name}: choose a ${d.SLOT_NAME[slot].toLowerCase()}. Green numbers are gains, red are losses compared with what is worn now.`));
    const cur = g.gear[slot];
    if (cur) {
      body.append(sec('Equipped'));
      const w = h('div', 'eq-item', [itemCard(cur, {})]);
      w.append(U.button({ label: 'Remove', variant: 'bronze', block: true, onClick: () => { const e = lm.unequip(S, g, slot); if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; } ctx.sfx('uiTap'); done(); m.close(); } }));
      body.append(w);
    }
    const list = S.items.filter((i) => i.slot === slot).sort((a, b) => lm.itemScore(b) - lm.itemScore(a));
    body.append(sec(`In the armory (${list.length})`));
    if (!list.length) body.append(empty('No spare items for this slot. Win loot in the arena or buy gear at the market.'));
    list.forEach((it, idx) => {
      const better = !cur || lm.itemScore(it) > lm.itemScore(cur);
      const tag = cur ? chip(better ? 'Better' : 'Worse', better ? 'green' : 'grey') : (idx === 0 ? chip('Best', 'gold') : null);
      const card = itemCard(it, { tag, onClick: () => { lm.equip(S, g, it); ctx.sfx('uiConfirm'); done(); m.close(); } });
      card.setAttribute('aria-label', `Equip ${it.name}`);
      card.querySelector('.fv-item-info').append(deltaEl(deltas(g, it, slot)));
      body.append(h('div', 'eq-item', [card]));
    });
  }
  render();
  return m;
}
