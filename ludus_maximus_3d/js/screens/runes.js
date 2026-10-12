// Rune picker: one keystone and up to two minors, through LM.setKeystone / LM.toggleMinor.
import { h, U, D, L, injectCss, addCss, chip, sec, wide, note } from './ui_common.js';

const CSS = `
.rn-opt{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;margin:0 0 8px;min-height:56px;cursor:pointer;font-family:inherit;color:inherit;border-left:6px solid var(--rc,#b8803a)}
.rn-opt[aria-pressed=true]{background:linear-gradient(180deg,rgba(255,240,190,.9),rgba(255,226,150,.6));border-color:#c98e24;box-shadow:0 0 0 2px #f2c14e,0 2px 8px rgba(60,40,10,.25)}
.rn-opt:disabled{opacity:.5;cursor:not-allowed}
.rn-opt:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.rn-mark{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,var(--rc,#b8803a),#1d1830);color:#fff;border:2px solid #f2c14e}
.rn-mark.off{filter:grayscale(.8);border-color:#8a8a94}
`;
export function open(ctx, g, onChange) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D();
  const body = h('div', 'lm-sheetbody');
  const m = wide(ctx.sheet({ title: `Runes: ${g.name}`, body, actions: [U.button({ label: 'Done', variant: 'gold', block: true, onClick: () => m.close() })], onClose: () => onChange && onChange() }), 600);
  function opt(kind, id, def, sel, onPick) {
    const own = lm.runeOwned(S, kind, id);
    const b = h('button', 'lm-card rn-opt'); b.type = 'button'; b.disabled = !own; b.setAttribute('aria-pressed', sel);
    b.style.setProperty('--rc', def.c || '#b8803a');
    b.append(h('span', 'rn-mark' + (own ? '' : ' off'), U.icon(own ? (sel ? 'check' : 'star') : 'lock', 16)), h('div', 'lm-grow', [h('div', 'lm-name', def.n), h('div', 'lm-sub', def.d), own ? null : h('div', 'lm-sub', 'Locked. Win tournaments, bosses and Pit floors to unlock.')]));
    b.addEventListener('click', () => { onPick(); ctx.sfx('uiTap'); ctx.save(); render(); });
    return b;
  }
  function render() {
    const sc = body.parentElement ? body.parentElement.scrollTop : 0;
    body.replaceChildren(note('Pick one keystone and two minors. Unlock more by winning tournaments, bosses and Pit floors.'));
    body.append(sec('Keystone'));
    Object.keys(d.KEYSTONES).forEach((k) => body.append(opt('k', k, d.KEYSTONES[k], g.rune.k === k, () => lm.setKeystone(S, g, k))));
    body.append(sec(`Minors ${g.rune.m.length}/2`));
    Object.keys(d.MINORS).forEach((k) => body.append(opt('m', k, d.MINORS[k], g.rune.m.includes(k), () => lm.toggleMinor(S, g, k))));
    if (body.parentElement) body.parentElement.scrollTop = sc;
  }
  render();
  return m;
}
