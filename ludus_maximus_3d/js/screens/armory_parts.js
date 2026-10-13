// Shared building blocks for the Armory and Market screens: scoped CSS, item tiles, stat tables, comparison lists, celebration burst.
// Only presentation lives here. All rules come from the sim (globalThis.LM) and data (globalThis.LM_D).
import { U, h, fmt, SLOT_ICON, STAT_LAB, RAR_KEY, styleBadge } from '../uihelpers.js';

export { U, h, fmt, SLOT_ICON, STAT_LAB, RAR_KEY };
export const D = () => globalThis.LM_D;
export const L = () => globalThis.LM;

const CSS = `
.am-root{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0;gap:10px;color:#3a2a18;font-family:var(--lx-sans);overflow-wrap:break-word}
.am-root *{min-width:0}
.am-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.am-top .am-sp{flex:1}
.am-gold{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:linear-gradient(180deg,#3b2a55,#1d1830);color:#f2c14e;font:800 15px/20px var(--lx-sans);box-shadow:inset 0 0 0 1px rgba(242,193,78,.5);min-height:36px;font-variant-numeric:tabular-nums}
.am-top .am-cap{flex:1 1 80px}
.am-cap{flex:none;display:flex;flex-direction:column;gap:3px;font:700 11px/14px var(--lx-sans);color:#6a5238;letter-spacing:.04em;text-transform:uppercase}
.am-cap.full{color:#a8372b}
.am-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px}
.am-tab{min-height:48px;border-radius:6px;border:2px solid #b79a64;background:rgba(255,250,235,.65);font:700 11px/13px var(--lx-serif);text-transform:uppercase;letter-spacing:.05em;color:#5a4222;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;padding:4px 2px;touch-action:manipulation}
.am-tab:focus-visible,.am-tile:focus-visible,.am-chipbtn:focus-visible,.am-row:focus-visible,.am-slot:focus-visible,.am-mini:focus-visible,.am-tip:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.am-tab.on{background:linear-gradient(180deg,#d8a35c,#8a5a26);color:#fff2d6;border-color:#4a2f12;text-shadow:0 1px 0 rgba(0,0,0,.45);box-shadow:0 2px 0 #4a2f12}
@media(min-width:700px){.am-tab{flex-direction:row;gap:8px;font-size:12px}}
.am-content{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:2px 2px 10px;-webkit-overflow-scrolling:touch;position:relative}
.am-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.am-chipbtn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:44px;min-height:44px;padding:0 10px;border-radius:999px;border:2px solid #b79a64;background:rgba(255,250,235,.7);color:#5a4222;font:700 12px/14px var(--lx-sans);cursor:pointer;touch-action:manipulation}
.am-chipbtn.on{background:#2a2540;color:#f2c14e;border-color:#f2c14e}
.am-chipbtn b{font-variant-numeric:tabular-nums}
.am-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:8px}
.am-tile{--rc:#b9b2a3;position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 5px 7px;min-height:122px;border-radius:9px;border:2px solid var(--rc);background:linear-gradient(180deg,rgba(255,252,242,.92),rgba(232,218,184,.85));cursor:pointer;text-align:center;font-family:inherit;color:#3a2a18;touch-action:manipulation;transition:transform .12s,box-shadow .12s}
.am-tile:hover{transform:translateY(-2px);box-shadow:0 5px 12px rgba(40,25,10,.28)}
.am-tile.sel{box-shadow:0 0 0 3px #f2c14e,0 6px 14px rgba(40,25,10,.35);background:linear-gradient(180deg,#fff3c9,#f0d98f)}
.am-tile.dim{opacity:.42;filter:grayscale(.6)}
.am-tile .am-nm{font:800 12px/15px var(--lx-sans);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;width:100%}
.am-tile .am-ms{font:600 11px/14px var(--lx-sans);color:#6a5238;font-variant-numeric:tabular-nums}
.am-tile .am-up{position:absolute;top:4px;right:4px;background:#2a2540;color:#f2c14e;font:800 10px/14px var(--lx-sans);padding:0 5px;border-radius:999px;box-shadow:0 0 0 1px #f2c14e}
.am-tile .am-arrow{position:absolute;top:4px;left:4px;color:#2f7a3a;font:900 12px/14px var(--lx-sans);background:#e6f5d9;border-radius:999px;padding:0 5px;box-shadow:0 0 0 1px #2f7a3a}
.am-tile .am-setdot{position:absolute;bottom:5px;right:5px;width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 1.5px #fff}
.am-tile .am-price{display:inline-flex;align-items:center;gap:3px;font:800 12px/16px var(--lx-sans);color:#7a5222;font-variant-numeric:tabular-nums;margin-top:auto}
.am-tile .am-price.no{color:#a8372b}
.am-card{border-radius:10px;border:1px solid rgba(122,82,34,.4);background:rgba(255,252,242,.72);padding:10px 12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}
.am-card.gold{border:2px solid #b8803a;background:linear-gradient(160deg,#fff4cf,#f0d98f 70%,#e0c070);box-shadow:0 0 0 2px rgba(242,193,78,.4),0 6px 16px rgba(80,50,10,.3)}
.am-card.dark{background:linear-gradient(180deg,#3b2a55,#1d1830);color:#f6ead0;border:1px solid rgba(242,193,78,.5)}
.am-card.warn{background:#fbe4dc;border-color:#b5372b;color:#7d2119}
.am-card.good{background:#e6f5d9;border-color:#2f7a3a;color:#1f5a28}
.am-h{font:800 12px/16px var(--lx-serif);letter-spacing:.14em;text-transform:uppercase;color:#7a2f30;margin:14px 0 6px;padding-bottom:2px;border-bottom:1px solid rgba(122,47,48,.3);display:flex;align-items:center;gap:8px}
.am-h .am-sp{flex:1}
.am-h:first-child{margin-top:2px}
.am-p{margin:4px 0;font:500 13px/18px var(--lx-sans);color:#4a3550}
.am-small{font:600 12px/16px var(--lx-sans);color:#6a5238}
.am-head{display:flex;gap:12px;align-items:center}
.am-head .am-hi{flex:1;min-width:0}
.am-name{font:800 16px/21px var(--lx-sans);color:#2a1a30}
.am-card.dark .am-name{color:#f2c14e}
.am-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}
.am-pill{display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;font:700 11px/18px var(--lx-sans);background:#6a5238;color:#fff;letter-spacing:.03em}
.am-pill.ghost{background:rgba(90,66,34,.14);color:#4a3550}
.am-tip{border-bottom:1px dotted #7a5222;cursor:help}
.am-stats{display:grid;grid-template-columns:auto auto auto;justify-content:start;gap:2px 14px;align-items:baseline;font:600 14px/22px var(--lx-sans);font-variant-numeric:tabular-nums}
.am-stats .k{color:#6a5238;font:800 11px/22px var(--lx-sans);letter-spacing:.08em}
.am-stats .v{text-align:right;font-weight:800;color:#2a1a30}
.am-stats .d{text-align:right;min-width:44px;font-weight:800}
.am-stats .d.pos{color:#2f7a3a}.am-stats .d.neg{color:#a8372b}.am-stats .d.zero{color:#9a8a70}
.am-stats .nv{color:#2f7a3a;font-weight:900}
.am-aff{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid rgba(122,82,34,.2)}
.am-aff:first-child{border-top:0}
.am-aff b{font:800 13px/18px var(--lx-sans);color:#2a1a30}
.am-aff .pips{letter-spacing:2px;color:#b8803a;font-size:11px}
.am-aff.new{background:rgba(242,193,78,.28);border-radius:6px;padding:6px}
.am-row{display:flex;gap:10px;align-items:center;padding:8px 10px;margin:6px 0;border-radius:10px;border:1px solid rgba(122,82,34,.35);background:rgba(255,252,242,.7);min-height:56px;width:100%;text-align:left;font-family:inherit;color:inherit}
button.am-row{cursor:pointer;touch-action:manipulation}
button.am-row:hover{background:#fff6d8}
.am-row .am-mid{flex:1;min-width:0}
.am-row .am-t{font:800 14px/18px var(--lx-sans);color:#2a1a30;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.am-row .am-s{font:600 12px/16px var(--lx-sans);color:#6a5238}
.am-tag{flex:none;display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font:800 11px/16px var(--lx-sans);white-space:nowrap}
.am-tag.pos{background:#d6f0c4;color:#1f5a28}.am-tag.neg{background:#f3d2c9;color:#7d2119}.am-tag.new{background:#ffe9a8;color:#6a4a00}.am-tag.neu{background:#e4dccb;color:#5a4222}
.am-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.am-btns .lx-btn{flex:1 1 130px}
.am-bulk{flex:1 1 150px;display:flex;flex-direction:column;gap:4px;align-items:stretch;text-align:center}
.am-bulk .lx-btn{flex:none;width:100%}
.am-off{filter:grayscale(.85) brightness(.78)!important;cursor:not-allowed}
.am-back{align-self:flex-start;margin-bottom:8px}
.am-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:3px;border-radius:8px;background:rgba(90,66,34,.16);margin-bottom:10px}
.am-seg button{min-height:44px;border:0;border-radius:6px;background:transparent;font:800 11px/13px var(--lx-serif);letter-spacing:.06em;text-transform:uppercase;color:#5a4222;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center;gap:5px}
.am-seg button.on{background:#2a2540;color:#f2c14e;box-shadow:0 2px 0 #1d1830}
.am-seg button:focus-visible{outline:3px solid #5a1f5e;outline-offset:1px}
.am-strip{display:flex;gap:8px;overflow-x:auto;padding:8px 6px 12px;margin:0 -6px 6px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
.am-strip .am-tile{flex:0 0 94px;scroll-snap-align:start;min-height:108px}
.am-pips{display:flex;gap:4px;flex-wrap:wrap;margin:8px 0}
.am-pips i{width:22px;height:8px;border-radius:3px;background:rgba(90,66,34,.25);box-shadow:inset 0 1px 1px rgba(0,0,0,.25)}
.am-pips i.on{background:linear-gradient(180deg,#ffe08a,#c98e24);box-shadow:0 0 6px rgba(242,193,78,.7)}
.am-pips i.nx{background:repeating-linear-gradient(45deg,#f2c14e 0 4px,#c98e24 4px 8px);animation:am-blink 1s infinite alternate}
@keyframes am-blink{to{opacity:.35}}
.am-ba{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}
.am-ba .am-stats{justify-content:center}
.am-ba .arr{font:900 22px/1 var(--lx-sans);color:#b8803a}
.am-ba .col{text-align:center}
.am-ba .lab{font:800 10px/14px var(--lx-sans);letter-spacing:.14em;text-transform:uppercase;color:#6a5238}
.am-cost{display:inline-flex;align-items:center;gap:5px;font:800 15px/20px var(--lx-sans);color:#7a5222;font-variant-numeric:tabular-nums}
.am-cost.no{color:#a8372b}
.am-merge{display:grid;grid-template-columns:repeat(3,1fr) auto 1fr;gap:6px;align-items:center;margin-bottom:8px}
.am-slot{position:relative;aspect-ratio:1/1;max-height:92px;border-radius:10px;border:2px dashed #b79a64;background:rgba(255,250,235,.5);display:grid;place-items:center;color:#9a8a70;font:900 24px/1 var(--lx-sans);cursor:pointer;padding:0;touch-action:manipulation;overflow:hidden}
.am-slot.fill{border-style:solid;border-color:var(--rc,#b9b2a3);background:linear-gradient(180deg,#fff8e0,#ecd9a8);color:inherit}
.am-slot .x{position:absolute;top:2px;right:2px;font:900 11px/14px var(--lx-sans);background:#2a2540;color:#f2c14e;border-radius:999px;width:18px;height:18px;display:grid;place-items:center}
.am-merge .eq{font:900 20px/1 var(--lx-sans);color:#b8803a}
.am-result{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:10px 0;position:relative}
.am-result .am-kicker{font:900 13px/16px var(--lx-serif);letter-spacing:.3em;text-transform:uppercase;color:#7a2f30}
.am-result .am-big{font:900 24px/28px var(--lx-serif);letter-spacing:.06em;text-transform:uppercase;color:#2a1a30;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.am-flare{position:absolute;left:50%;top:78px;width:260px;height:260px;margin:-130px 0 0 -130px;border-radius:50%;pointer-events:none;background:conic-gradient(from 0deg,transparent 0.0%,color-mix(in srgb,var(--bc,#f2c14e) 60%,transparent) 4.0%,transparent 8.0%,transparent 16.7%,color-mix(in srgb,var(--bc,#f2c14e) 60%,transparent) 20.7%,transparent 24.7%,transparent 33.3%,color-mix(in srgb,var(--bc,#f2c14e) 60%,transparent) 37.3%,transparent 41.3%,transparent 50.0%,color-mix(in srgb,var(--bc,#f2c14e) 60%,transparent) 54.0%,transparent 58.0%,transparent 66.7%,color-mix(in srgb,var(--bc,#f2c14e) 60%,transparent) 70.7%,transparent 74.7%,transparent 83.3%,color-mix(in srgb,var(--bc,#f2c14e) 60%,transparent) 87.3%,transparent 91.3%,transparent 100%);-webkit-mask:radial-gradient(circle,#000 20%,transparent 68%);mask:radial-gradient(circle,#000 20%,transparent 68%);animation:am-spin 9s linear infinite,am-fade .6s ease-out both}
@keyframes am-spin{to{transform:rotate(360deg)}}
@keyframes am-fade{from{opacity:0;scale:.4}to{opacity:1;scale:1}}
.am-burst{position:absolute;inset:0;pointer-events:none;z-index:4;display:grid;place-items:center;overflow:visible}
.am-burst .am-ring{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:4px solid var(--bc);box-shadow:0 0 18px var(--bc);animation:am-ring .9s ease-out forwards}
@keyframes am-ring{from{transform:scale(.3);opacity:1}to{transform:scale(6);opacity:0}}
.am-burst .am-sp2{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px;border-radius:50%;background:var(--bc);box-shadow:0 0 8px var(--bc);animation:am-spark 1s ease-out forwards}
@keyframes am-spark{from{transform:rotate(var(--a)) translateY(0) scale(1);opacity:1}to{transform:rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(.2);opacity:0}}
.am-burst .am-bt{position:relative;font:900 20px/24px var(--lx-serif);letter-spacing:.12em;text-transform:uppercase;color:#fff8e0;text-shadow:0 2px 0 #5a1f5e,0 0 14px var(--bc);animation:am-rise 1.2s ease-out forwards}
@keyframes am-rise{0%{transform:translateY(14px) scale(.7);opacity:0}25%{transform:translateY(0) scale(1.1);opacity:1}100%{transform:translateY(-26px) scale(1);opacity:0}}
.am-pop{animation:am-pop .45s var(--lx-ease)}
@keyframes am-pop{from{transform:scale(.88)}to{transform:scale(1)}}
.am-relic{--rc:#f2c14e}
.am-badge{flex:none;display:grid;place-items:center;border-radius:50%;color:#fff;box-shadow:inset 0 0 0 2px rgba(255,255,255,.55),0 2px 4px rgba(0,0,0,.35)}
.am-slots{display:flex;gap:8px;margin:8px 0 2px}
.am-slots i{flex:1;max-width:72px;height:44px;border-radius:8px;border:2px dashed #b79a64;display:grid;place-items:center;color:#9a8a70}
.am-slots i.on{border:2px solid #b8803a;background:linear-gradient(180deg,#fff4cf,#f0d98f);color:#fff}
.am-lock{opacity:.55}
.am-empty{text-align:center;padding:26px 12px;color:#6a5238;font:600 14px/20px var(--lx-sans)}
.am-empty .lx-ico{color:#b79a64;margin-bottom:6px}
.am-sets summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font:800 12px/16px var(--lx-serif);letter-spacing:.14em;text-transform:uppercase;color:#7a2f30}
.am-hero{display:flex;gap:12px;align-items:center}
.am-hero .lx-btn{flex:none}
.am-hero .am-hi{flex:1}
.am-ribbon{position:absolute;top:-10px;left:12px;background:linear-gradient(180deg,#7a2f9e,#5a1f5e);color:#ffe08a;font:900 10px/16px var(--lx-serif);letter-spacing:.2em;text-transform:uppercase;padding:2px 12px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,.4)}
@media(prefers-reduced-motion:reduce){.am-flare,.am-burst .am-ring,.am-burst .am-sp2,.am-pips i.nx,.am-pop{animation:none}.am-burst .am-bt{animation:am-fadeonly 1s forwards}}
@keyframes am-fadeonly{0%{opacity:1}100%{opacity:0}}
`;

export function ensureCss() {
  if (document.getElementById('am-css')) return;
  const s = document.createElement('style'); s.id = 'am-css'; s.textContent = CSS; document.head.append(s);
}

/** make the screen sheet stable: fixed height, wider on desktop, body fills the sheet */
export function shapeSheet(m, root) {
  const sheet = m.el.querySelector('.lx-sheet'); if (!sheet) return;
  sheet.style.height = 'min(calc(100vh - 28px), 780px)'; sheet.style.height = 'min(calc(100dvh - 28px), 780px)'; /* the full viewport minus a margin: the old 86% showed two rows at 650px */ sheet.style.maxWidth = 'min(100%,720px)';
  const sc = root.parentNode; if (sc) { sc.style.cssText += ';flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:0'; }
}

export function el(tag, cls, kids, attrs) { const e = h(tag, cls, kids); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

/** small jargon label with a tooltip (focusable so keyboard and touch work) */
export function tip(label, text, title) {
  const e = h('span', 'am-tip', label); e.tabIndex = 0; e.setAttribute('role', 'note'); e.setAttribute('aria-label', `${label}: ${text}`);
  U.tooltip(e, text, { title: title || label }); return e;
}

export function pill(text, color, ghost) { const e = h('span', 'am-pill' + (ghost ? ' ghost' : ''), text); if (color && !ghost) e.style.background = color; return e; }
export function rarPill(it) { const r = D().RAR[it.rar]; const e = pill(r.n, r.c); e.style.color = it.rar === 4 ? '#3a2a00' : it.rar === 3 ? '#fff' : '#10202e'; return e; }

export function goldChip(ctx) {
  const n = h('b', '', ctx.fmt(ctx.S.gold)); n.dataset.v = ctx.S.gold;
  const c = h('span', 'am-gold', [U.icon('coin', 20), n]); c.setAttribute('aria-label', 'Gold');
  c.set = (v) => U.countUp(n, v); return c;
}
export function cost(ctx, amount) { const c = h('span', 'am-cost' + (ctx.S.gold < amount ? ' no' : ''), [U.icon('coin', 16), ctx.fmt(amount)]); return c; }

export function portrait(ctx, g, size) { return (ctx.portrait || ((gg, s) => styleBadge(gg.style, s)))(g, size); }

// ---------- item maths (display only) ----------
export const scaled = (it, up) => { const f = 1 + 0.08 * (up == null ? it.up || 0 : up), o = {}; for (const k in it.st) o[k] = Math.round(it.st[k] * f * 10) / 10; return o; };
export const power = (it) => Math.round(L().itemScore(it));
export function worn(g, it) { return g.gear && g.gear[it.slot]; }
export function gainFor(ctx, it) {
  let best = null; ctx.S.glads.forEach((g) => { const c = worn(g, it); const d = L().itemScore(it) - (c ? L().itemScore(c) : 0); if (!best || d > best.d) best = { g, d: Math.round(d), c }; }); return best;
}

/** one item as a grid tile. opts: {onClick, sel, dim, price, noPrice, special} */
export function tile(ctx, it, o = {}) {
  const rk = RAR_KEY[it.rar], R = D().RAR[it.rar];
  const b = h('button', `am-tile${o.sel ? ' sel' : ''}${o.dim ? ' dim' : ''}`); b.type = 'button'; b.style.setProperty('--rc', R.c);
  b.setAttribute('aria-label', `${it.name}, ${R.n} ${D().SLOT_NAME[it.slot]}${it.up ? ', plus ' + it.up : ''}, power ${power(it)}${o.price != null ? ', price ' + o.price : ''}`);
  b.append(U.rarityFrame(rk, U.icon(SLOT_ICON[it.slot] || 'star', 26), 46));
  if (it.up) b.append(h('span', 'am-up', '+' + it.up));
  if (o.arrow !== false) { const g = ctx.S.glads.length ? gainFor(ctx, it) : null; if (g && g.c && g.d > 0) { const a = h('span', 'am-arrow', '▲'); a.title = `Upgrade for ${g.g.name}`; a.setAttribute('aria-hidden', 'true'); b.append(a); } }
  b.append(h('span', 'am-nm', it.name));
  const main = Object.keys(it.st)[0]; const sc = scaled(it);
  b.append(h('span', 'am-ms', `${STAT_LAB[main]} ${sc[main]}`));
  if (it.set) { const d = h('i', 'am-setdot'); d.style.background = D().SETS[it.set].c; d.title = D().SETS[it.set].n + ' set'; b.append(d); }
  if (o.price != null) { const p = h('span', 'am-price' + (ctx.S.gold < o.price ? ' no' : ''), [U.icon('coin', 14), ctx.fmt(o.price)]); b.append(p); }
  if (o.onClick) b.addEventListener('click', () => o.onClick(it)); else b.disabled = true;
  return b;
}

/** header: big frame, name, chips */
export function itemHead(ctx, it, size = 68) {
  const R = D().RAR[it.rar];
  const chips = h('div', 'am-chips', [rarPill(it), pill(D().SLOT_NAME[it.slot], null, true), pill('ilvl ' + it.ilvl, null, true)]);
  const pw = h('span', 'am-pill ghost', [tip('Power', 'A quick score of the item: stats, affixes and set. Higher is better when comparing two items for the same slot.', 'Power'), document.createTextNode(' ' + power(it))]); chips.append(pw);
  if (it.set) { const S = D().SETS[it.set]; chips.append(pill(S.n + ' set', S.c)); }
  const frame = U.rarityFrame(RAR_KEY[it.rar], U.icon(SLOT_ICON[it.slot] || 'star', Math.round(size * 0.52)), size);
  const info = h('div', 'am-hi', [h('div', 'am-name', `${it.name}${it.up ? ' +' + it.up : ''}`), chips]);
  const e = h('div', 'am-head', [frame, info]); e.style.setProperty('--bc', R.c); return e;
}

/** stat table. ref: optional item or stat map to compare against (deltas). */
export function statTable(it, o = {}) {
  const A = o.stats || scaled(it), B = o.ref || null;
  const keys = Object.keys(A); if (B) Object.keys(B).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
  const t = h('div', 'am-stats');
  keys.forEach((k) => {
    const a = A[k] || 0, bv = B ? (B[k] || 0) : null;
    t.append(h('span', 'k', STAT_LAB[k] || k), h('span', 'v' + (o.hl && o.hl.includes(k) ? ' nv' : ''), String(Math.round(a * 10) / 10)));
    if (B) { const d = Math.round((a - bv) * 10) / 10; t.append(h('span', 'd ' + (d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero'), d > 0 ? '+' + d : d < 0 ? String(d) : '0')); } else t.append(h('span', 'd'));
  });
  return t;
}

export function affixList(it, newIdx) {
  const wrap = h('div');
  if (!it.af.length) return h('div', 'am-small', it.rar < 2 ? 'No affixes. Rare and better items carry special effects.' : 'No affixes.');
  it.af.forEach((x, i) => {
    const A = D().AFFIX[x.id]; const pips = '●'.repeat(x.v) + '○'.repeat(Math.max(0, 3 - x.v));
    const r = h('div', 'am-aff' + (newIdx != null && (newIdx === i || (Array.isArray(newIdx) && newIdx.includes(i))) ? ' new' : ''), [h('div', '', [h('b', '', A.n), h('div', 'am-p', A.d(x.v))]), h('span', 'pips', pips)]);
    r.style.justifyContent = 'space-between'; r.firstChild.style.flex = '1'; wrap.append(r);
  });
  return wrap;
}

export function setBlock(ctx, it) {
  if (!it.set) return null; const S = D().SETS[it.set];
  const have = ctx.S.glads.map((g) => [g, L().setCounts(g)[it.set] || 0]).filter((x) => x[1] > 0);
  const e = h('div', 'am-card', [h('div', '', [pill(S.n + ' set', S.c), document.createTextNode(' ')]), h('div', 'am-p', [h('b', '', '2 pieces: '), S.d2]), h('div', 'am-p', [h('b', '', '4 pieces: '), S.d4]),
    have.length ? h('div', 'am-small', 'Worn: ' + have.map(([g, n]) => `${g.name} ${n}/5`).join(', ')) : h('div', 'am-small', 'Pieces count across the five slots of one fighter.')]);
  e.style.borderColor = S.c; return e;
}

/** comparison rows: one per fighter. o.onEquip(g) adds a tap to equip. */
export function compareList(ctx, it, o = {}) {
  const wrap = h('div');
  if (!ctx.S.glads.length) { wrap.append(h('div', 'am-small', 'Recruit a gladiator to equip gear.')); return wrap; }
  const rows = ctx.S.glads.map((g) => { const c = worn(g, it); return { g, c, d: Math.round(L().itemScore(it) - (c ? L().itemScore(c) : 0)) }; }).sort((a, b) => b.d - a.d);
  rows.forEach(({ g, c, d }) => {
    const tag = !c ? h('span', 'am-tag new', 'Empty slot') : d > 0 ? h('span', 'am-tag pos', '+' + d + ' power') : d < 0 ? h('span', 'am-tag neg', d + ' power') : h('span', 'am-tag neu', 'Same');
    let setHint = '';
    if (it.set) { const n = L().setCounts(g)[it.set] || 0; const after = n - (c && c.set === it.set ? 1 : 0) + 1; setHint = ` · ${D().SETS[it.set].n} ${after}/5`; }
    const mid = h('div', 'am-mid', [h('div', 'am-t', g.name), h('div', 'am-s', (c ? 'Wears ' + c.name + (c.up ? ' +' + c.up : '') : 'Nothing in this slot') + setHint)]);
    const kids = [portrait(ctx, g, 40), mid, tag];
    const row = o.onEquip ? h('button', 'am-row') : h('div', 'am-row'); if (o.onEquip) { row.type = 'button'; row.setAttribute('aria-label', `Equip on ${g.name}`); row.addEventListener('click', () => o.onEquip(g)); }
    kids.forEach((k) => row.append(k)); wrap.append(row);
  });
  return wrap;
}

/** golden burst over a host (host must be position:relative). */
export function burst(host, { color = '#f2c14e', text = '', n = 14 } = {}) {
  if (!host) return; const e = h('div', 'am-burst'); e.style.setProperty('--bc', color);
  e.append(h('i', 'am-ring'));
  for (let i = 0; i < n; i++) { const s = h('i', 'am-sp2'); s.style.setProperty('--a', (i * 360 / n) + 'deg'); s.style.setProperty('--d', (60 + (i % 3) * 30) + 'px'); e.append(s); }
  if (text) e.append(h('b', 'am-bt', text));
  host.append(e); setTimeout(() => e.remove(), 1500);
  try { navigator.vibrate && navigator.vibrate([12, 30, 12]); } catch (_) { /* no haptics */ }
}

/** kit button with a soft-disabled state: stays focusable, explains itself on tap */
export function btn(ctx, { label, sub, icon, variant = 'gold', onClick, off, block }) {
  const b = U.button({ label, sub, icon, variant, block, onClick: () => { if (off) { ctx.sfx('uiError'); ctx.toast(off, { kind: 'bad' }); return; } onClick(); } });
  if (off) { b.classList.add('am-off'); b.setAttribute('aria-disabled', 'true'); } return b;
}

export function emptyState(icon, text) { return h('div', 'am-empty', [U.icon(icon, 40), h('div', '', text)]); }
