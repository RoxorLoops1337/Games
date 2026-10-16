// FIGHTERS: customization sheet (face, hair style and colour, beard, tattoo, armour dye, crest colour), saved on the fighter as g.look and rendered by gladiator.js / gear.js /
// portrait.js. The first look is free, later changes cost 10 gold. In fights the team tint still recolours tunic and plume so the two sides stay readable.
import { h, U, L, injectCss, addCss, clearTips, chip, sec, wide, note, portrait } from './ui_common.js';

const CSS = `
.cz-top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center}
.cz-pv{position:relative;flex:none;border-radius:12px;overflow:hidden;box-shadow:0 0 0 3px #b8803a,0 4px 10px rgba(60,40,10,.4);background:#2a2540;width:132px;height:156px}
.cz-pv canvas{display:block;width:100%;height:100%}
.cz-grp{display:flex;flex-wrap:wrap;gap:6px}
.cz-opt{min-width:44px;min-height:44px;padding:4px 10px;border-radius:10px;border:2px solid rgba(122,82,34,.5);background:linear-gradient(180deg,#fff7e0,#f1e2bd);color:#2a1a30;font:800 12px var(--lx-sans);cursor:pointer;font-family:inherit}
.cz-opt[aria-pressed=true]{border-color:#c98e24;box-shadow:0 0 0 3px #f2c14e;background:linear-gradient(180deg,#ffe9a8,#f6cd62)}
.cz-opt:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.cz-sw{width:44px;height:44px;padding:0;position:relative}
.cz-sw i{position:absolute;inset:5px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
`;

export function open(ctx, g, onChange) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), F = lm.fighters, owned = S.glads.includes(g);
  const draft = lm.fLook(g);
  const body = h('div', 'lm-sheetbody');
  let pv = null, applyBtn = null;
  const m = wide(ctx.sheet({ title: `Look: ${g.name}`, body, actions: [applyBtn = U.button({ label: 'Apply', icon: 'check', variant: 'gold', block: true, onClick: apply }), U.button({ label: 'Close', variant: 'ghost', block: true, onClick: () => m.close() })], onClose: () => onChange && onChange() }), 640);
  const cost = () => lm.fLookCost(g, draft);
  function refreshApply() { const c = cost(); applyBtn.querySelector ? null : null; const lab = !owned ? 'Not yours' : c ? `Apply for ${c}g` : (g.look && JSON.stringify(lm.fLook(g)) === JSON.stringify(draft) ? 'No change' : 'Apply (free)'); const t = applyBtn.querySelector('.lx-btn-label') || applyBtn; t.textContent = lab; applyBtn.disabled = !owned || (S.gold < c) || (g.look ? JSON.stringify(lm.fLook(g)) === JSON.stringify(draft) : !Object.values(draft).some((v) => v != null)); }
  function apply() {
    const e = lm.fLookApply(S, g, draft); if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; }
    ctx.sfx('uiConfirm'); ctx.save(); ctx.refresh(); ctx.toast(`${g.name} has a new look.`, { kind: 'good', ico: 'check' }); lm.fLog(S, g, null, 'Visited the barber and the tattooist.'); render();
  }
  function preview() {
    const tmp = Object.assign({}, g, { look: Object.assign({}, draft) });
    const el = portrait(ctx, tmp, 132); if (!pv) { pv = h('div', 'cz-pv'); }
    pv.replaceChildren(el); return pv;
  }
  function group(label, items, key, mk) {
    const wrap = h('div', 'cz-grp'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
    items.forEach((it, i) => { const v = mk(it, i), b = h('button', 'cz-opt' + (v.sw ? ' cz-sw' : ''), v.sw ? h('i') : v.label); b.type = 'button'; if (v.sw) b.firstChild.style.setProperty('--c', v.sw); b.setAttribute('aria-label', `${label}: ${v.name}`); b.setAttribute('aria-pressed', draft[key] === v.val);
      b.addEventListener('click', () => { draft[key] = draft[key] === v.val && v.toggle ? null : v.val; ctx.sfx('uiTap', { gain: 0.5 }); render(); }); if (v.tip) U.tooltip(b, v.tip, { title: v.name }); wrap.append(b); });
    return wrap;
  }
  function render() {
    const sc = body.parentElement ? body.parentElement.scrollTop : 0; clearTips();
    const top = h('div', 'cz-top', [preview(), h('div', '', [h('div', 'lm-name', g.name), h('div', 'lm-sub', 'Face, hair, tattoo and colours. The first look is free; each later change costs 10 gold.'), h('div', 'lm-chips', [chip(cost() ? '10 gold' : 'Free', cost() ? 'gold' : 'green')]), (() => { const r = U.button({ label: 'Back to natural', variant: 'ghost', onClick: () => { for (const k in draft) draft[k] = null; render(); } }); r.style.marginTop = '6px'; return r; })()])]);
    body.replaceChildren(top,
      sec('Face'), group('Face', F.FACES, 'face', (n, i) => ({ label: n, name: n, val: i, toggle: 1 })),
      sec('Hair'), group('Hair style', F.HAIR_STYLES, 'hair', (x) => ({ label: x[1], name: x[1], val: x[0], toggle: 1 })),
      group('Hair colour', F.HAIR_COLS, 'hairCol', (x) => ({ sw: x[1], name: x[0], val: x[1], toggle: 1 })),
      sec('Beard'), group('Beard', F.BEARDS, 'beard', (n, i) => ({ label: n, name: n, val: i, toggle: 1 })),
      sec('Tattoo'), group('Tattoo', F.TATS, 'tat', (x) => ({ label: x[1], name: x[1], val: x[0] === 'none' ? null : x[0], tip: x[2] })),
      sec('Armour dye'), group('Armour dye', F.DYES, 'dye', (x) => ({ sw: x[1], name: x[0], val: x[1], toggle: 1 })),
      sec('Crest colour'), group('Crest colour', F.CRESTS, 'crest', (x) => ({ sw: x[1], name: x[0], val: x[1], toggle: 1 })),
      note('Tattoos, hair, faces, tunic dye and crest show in portraits, the barracks and the hub. In a fight the two sides are recoloured blue and red so you can always tell them apart.'));
    refreshApply();
    if (body.parentElement) body.parentElement.scrollTop = sc;
  }
  render();
  return m;
}
