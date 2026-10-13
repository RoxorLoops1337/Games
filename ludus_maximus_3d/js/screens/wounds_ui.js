// Shared bits for wounds, scars and patrons: body-part icons, scar badges, picker badges, and the .lx-dep scoped stylesheet.
// Standalone on purpose (imports only the UI kit), so sk.js, profile.js and roster.js can import it without cycles. No em dashes.
import * as U from '../ui_kit.js';

const h = U.h, SVGNS = 'http://www.w3.org/2000/svg';
const D = () => globalThis.LM_D, L = () => globalThis.LM;

export const DEP_CSS = `
.lx-dep .dp-body{flex:none;display:block}
.lx-dep .dp-w{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(10,6,24,.4);box-shadow:inset 0 0 0 1px rgba(224,100,79,.45)}
.lx-dep .dp-w.weak{box-shadow:inset 0 0 0 1px rgba(242,193,78,.4)}
.lx-dep .dp-plans{grid-column:1/3;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,128px),1fr));gap:6px}
.lx-dep .dp-plans .lx-btn{min-height:50px;padding:6px 8px;font-size:12px}
.lx-dep .dp-sub{font-size:11.5px;opacity:.82;line-height:1.3}
.lx-dep .dp-rest{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.lx-dep .dp-scar{display:inline-flex;align-items:center;gap:5px;padding:3px 9px 3px 5px;border-radius:999px;font:700 var(--lx-fs-s)/1.3 var(--lx-sans);background:rgba(122,63,168,.3);box-shadow:inset 0 0 0 1px rgba(190,140,240,.55);color:#e6d0ff;cursor:help}
.lx-dep .dp-medal{flex:none;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,var(--k),#1d1830 92%);box-shadow:0 0 0 2px var(--lx-gold),inset 0 0 0 3px rgba(0,0,0,.35);color:#fff4d8}
.lx-dep .dp-medal.sm{width:40px;height:40px}
.lx-dep .dp-terms{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px}
.lx-dep .dp-term{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:10px;background:rgba(10,6,24,.4);box-shadow:inset 0 0 0 1px rgba(242,193,78,.3)}
.lx-dep .dp-term h5{margin:0;font:800 var(--lx-fs-s)/1.2 var(--lx-serif);letter-spacing:.14em;text-transform:uppercase;color:var(--lx-gold)}
.lx-dep .dp-dem{display:grid;grid-template-columns:20px 1fr;gap:2px 8px;align-items:center}
.lx-dep .dp-dem .ok{color:#8fe3b0}.lx-dep .dp-dem .no{color:#ff9d8f}.lx-dep .dp-dem .wait{opacity:.5}
.lx-dep .dp-dem .ax-bar{grid-column:2;height:7px}
.lx-dep .dp-log{display:grid;gap:4px;padding:9px 10px;border-radius:10px;background:rgba(10,6,24,.4);box-shadow:inset 0 0 0 1px rgba(242,193,78,.2)}
.lx-dep .dp-log .t{font:800 var(--lx-fs-s)/1.2 var(--lx-serif);letter-spacing:.06em;color:var(--lx-gold)}
.lx-dep .dp-log .r{font-size:var(--lx-fs-s);line-height:1.35}
.lx-dep .dp-log .c{font-size:11.5px;opacity:.7;font-style:italic}
.lx-dep .dp-fx{display:flex;gap:5px;flex-wrap:wrap}
.lx-dep .dp-thread{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(10,6,24,.4);box-shadow:inset 0 0 0 1px rgba(242,193,78,.3)}
.lx-dep .dp-chk{opacity:.5}.lx-dep .dp-chk b{opacity:1}
.lx-dep .dp-tagrow{display:flex;gap:6px;flex-wrap:wrap}
`;
export function injectDepCss() {
  if (document.getElementById('dp-css')) return;
  const s = document.createElement('style'); s.id = 'dp-css'; s.textContent = DEP_CSS; document.head.append(s);
}
const el = (tag, attrs, inner) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (inner) e.innerHTML = inner; return e; };

/** a small human silhouette with the hurt part lit. part: gash ribs arm knee head eye (or 'none'). */
export function bodyIcon(part, size = 34, tone = '#e0644f') {
  const s = el('svg', { viewBox: '0 0 32 44', width: size, height: Math.round(size * 1.375), class: 'dp-body', 'aria-hidden': 'true' });
  const base = 'fill="currentColor" opacity=".38"', hot = `fill="${tone}"`;
  const lit = (p) => (part === p ? hot : base);
  s.innerHTML = `<circle cx="16" cy="7" r="5" ${lit('head')}/><rect x="10" y="13" width="12" height="14" rx="3" ${lit('ribs')}/>`
    + `<rect x="4.500" y="13.500" width="4.500" height="15" rx="2.200" ${base}/><rect x="23" y="13.500" width="4.500" height="15" rx="2.200" ${lit('arm')}/>`
    + `<rect x="10.500" y="27" width="5" height="16" rx="2.200" ${lit('knee')}/><rect x="16.500" y="27" width="5" height="16" rx="2.200" ${base}/>`
    + (part === 'eye' ? `<circle cx="18.200" cy="6.400" r="2" fill="#fff4d8"/><circle cx="18.200" cy="6.400" r="1" ${hot}/>` : '')
    + (part === 'gash' ? `<path d="M11.500 15.500 L21 25" stroke="${tone}" stroke-width="2.400" stroke-linecap="round"/>` : '')
    + (part === 'knee' ? `<circle cx="13" cy="33" r="2.600" fill="#fff4d8"/>` : '');
  return s;
}
export function scarGlyph(id, size = 16) {
  const s = el('svg', { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': 'true' });
  const S = D().SCARS[id] || {}, w = (S.look || {}).where;
  s.innerHTML = w === 'eye' ? '<circle cx="8" cy="8" r="4.500" fill="none" stroke="currentColor" stroke-width="1.600"/><path d="M3 13 L13 3" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>'
    : w === 'face' ? '<path d="M3 12 L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 5 L6 7 M9 10 L10 12" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>'
      : '<path d="M3 4 Q8 8 13 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M5 8 L7 6 M8 11 L10 9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>';
  return s;
}
function pill(text, tone, tip, title) {
  const p = h('span', 'ax-pill ' + (tone || ''), [h('span', '', text)]);
  if (tip) { p.tabIndex = 0; U.tooltip(p, tip, { title }); } return p;
}
export function scarChip(id) {
  const S = D().SCARS[id]; if (!S) return h('span');
  const c = h('span', 'dp-scar', [scarGlyph(id, 16), h('span', '', S.n)]); c.tabIndex = 0;
  U.tooltip(c, `${S.d} ${L().modText(S.mods).join(', ')}${S.fame ? `, +${Math.round(S.fame * 100)}% fame from fights` : ''}.`, { title: S.n }); return c;
}
export const woundName = (wd) => (D().WOUNDS[wd.part] || {}).n || 'Wound';
/** 'Broken arm' or 'Broken arm +1' for chips on cards */
export function woundLabel(g) {
  const L0 = L(); const wd = L0.woundOf ? L0.woundOf(g) : null; if (!wd) return 'Injured';
  return woundName(wd) + (g.wounds.length > 1 ? ` +${g.wounds.length - 1}` : '');
}
/** pills for the fighter picker and roster: wounds, lingering weakness, scars. Returns an array of nodes (may be empty). */
export function woundBadges(g) {
  const out = [], LM = L(), d = D(); if (!LM || !LM.bodyMods) return out;
  (g.wounds || []).slice().sort((a, b) => b.w - a.w).slice(0, 2).forEach((wd) => {
    const P = d.WOUNDS[wd.part]; if (!P) return;
    out.push(pill(`${P.n} ${wd.w}w`, 'bad', `${P.d} After it closes: ${LM.modText(P.weak).join(', ') || 'no lasting penalty'} for a week or two${wd.w0 >= 4 ? ' (long wounds weaken for two)' : ''}.`, P.n));
  });
  if (g.weak && g.weak.w > 0 && g.inj <= 0) out.push(pill(`Weak ${g.weak.w}w: ${LM.modText(g.weak.mods).slice(0, 2).join(', ')}`, 'warn', `Still recovering from a wound. Stats are reduced for ${g.weak.w} more week${g.weak.w > 1 ? 's' : ''}.`, 'Convalescence'));
  const sc = g.scars || [];
  if (sc.length) out.push(pill(`${sc.length} scar${sc.length > 1 ? 's' : ''}`, 'vio', sc.map((id) => `${d.SCARS[id].n}: ${LM.modText(d.SCARS[id].mods).join(', ')}`).join('. '), 'Scars'));
  return out;
}
