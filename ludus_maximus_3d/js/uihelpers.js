// Shared DOM helpers for screens: item cards, stat text, glad badges. Built on ui_kit.js. No em dashes in copy.
import * as U from './ui_kit.js';

const D = () => globalThis.LM_D, L = () => globalThis.LM;
export const h = U.h;
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const RAR_KEY = ['common', 'fine', 'rare', 'epic', 'legendary'];
export const SLOT_ICON = { weapon: 'sword', shield: 'shield', armor: 'roster', helm: 'skull', charm: 'fame' };
export const STAT_LAB = { atk: 'ATK', def: 'DEF', hp: 'HP', spd: 'SPD', crit: 'CRT%', eva: 'EVA%' };

export function fmtSt(it, f) {
  f = f || 1 + 0.08 * (it.up || 0);
  return Object.keys(it.st).map((k) => `${STAT_LAB[k]} ${Math.round(it.st[k] * f * 10) / 10}`).join(' · ');
}

export function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'; }

/** a small colored chip */
export function chip(text, color = '#b8803a', fg = '#fff') {
  const e = h('span', 'fv-chip', text); e.style.cssText = `display:inline-block;padding:2px 8px;border-radius:999px;font:700 11px/16px system-ui,sans-serif;letter-spacing:.03em;background:${color};color:${fg};margin-right:4px;vertical-align:middle`;
  return e;
}

/** item row: rarity frame + name + stats + affixes. opts: {onClick, tag, compact} */
export function itemCard(it, opts = {}) {
  const rar = D().RAR[it.rar];
  const frame = U.rarityFrame(RAR_KEY[it.rar], U.icon(SLOT_ICON[it.slot] || 'star', 26), 46);
  const info = h('div', 'fv-item-info');
  const name = h('div', 'fv-item-name', `${it.name}${it.up ? ' +' + it.up : ''}`);
  const stats = h('div', 'fv-item-stats', fmtSt(it));
  info.append(name, h('div', '', [chip(rar.n, rar.c)]), stats);
  (it.af || []).forEach((x) => { const A = D().AFFIX[x.id]; info.append(h('div', 'fv-item-aff', `${A.n}: ${A.d(x.v)}`)); });
  if (it.set) { const S = D().SETS[it.set]; info.append(h('div', '', [chip(S.n + ' set', S.c)])); }
  const row = h('div', 'fv-item', [frame, info]);
  row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.35);border:1px solid rgba(90,31,94,.25);margin:6px 0;min-width:0';
  info.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere';
  name.style.cssText = 'font:800 14px/18px system-ui,sans-serif;color:#2a1a30';
  stats.style.cssText = 'font:600 12px/16px system-ui,sans-serif;color:#4a3550;margin-top:2px';
  if (opts.tag) row.append(typeof opts.tag === 'string' ? chip(opts.tag, '#2b9348') : opts.tag);
  if (opts.onClick) { row.style.cursor = 'pointer'; row.setAttribute('role', 'button'); row.tabIndex = 0; row.addEventListener('click', opts.onClick); row.addEventListener('keydown', (e) => { if (e.key === 'Enter') opts.onClick(); }); }
  return row;
}

/** round style badge used until 3D portraits exist */
export function styleBadge(style, size = 40) {
  const S = D().STYLES[style]; const e = h('div', 'fv-badge');
  e.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,${S.c},#1d1830);border:2px solid #f2c14e;color:#fff`;
  e.append(U.icon(({ murmillo: 'shield', retiarius: 'hookshot', thraex: 'bladedance', hoplomachus: 'skewer', dimachaerus: 'sword' })[style] || 'sword', Math.round(size * 0.55)));
  return e;
}

/** glad summary line used in lists. g: glad. */
export function gladRow(g, opts = {}) {
  const S = D().STYLES[g.style];
  const left = opts.portrait ? opts.portrait(g, 56) : styleBadge(g.style, 44);
  const name = h('div', 'fv-glad-name', g.name + (g.nick ? ` "${g.nick}"` : ''));
  const sub = h('div', 'fv-glad-sub', `${S.n} · Level ${g.lvl}${g.inj > 0 ? ` · Injured ${g.inj}w` : ''}`);
  const bars = h('div', 'fv-glad-bars');
  bars.append(U.bar({ value: g.en, max: 100, kind: 'stam', height: 6 }), U.bar({ value: g.mo, max: 100, kind: 'xp', height: 6 }));
  bars.style.cssText = 'display:grid;gap:3px;margin-top:4px';
  const mid = h('div', '', [name, sub, bars]); mid.style.cssText = 'flex:1;min-width:0';
  name.style.cssText = 'font:800 15px/18px system-ui,sans-serif;color:#2a1a30;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  sub.style.cssText = 'font:600 12px/16px system-ui,sans-serif;color:#5a4560';
  const row = h('div', 'fv-glad', [left, mid]);
  row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.35);border:1px solid rgba(90,31,94,.25);margin:6px 0;min-width:0';
  if (g.inj > 0) row.style.opacity = '0.78';
  if (opts.right) row.append(opts.right);
  if (opts.onClick) { row.style.cursor = 'pointer'; row.setAttribute('role', 'button'); row.tabIndex = 0; row.addEventListener('click', () => opts.onClick(g)); row.addEventListener('keydown', (e) => { if (e.key === 'Enter') opts.onClick(g); }); }
  return row;
}

export function section(title) { const e = h('div', 'fv-sec', title); e.style.cssText = 'font:800 12px/16px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#7a2f30;margin:14px 0 4px;border-bottom:1px solid rgba(122,47,48,.3);padding-bottom:2px'; return e; }
export function para(text, cls = '') { const e = h('p', cls, text); e.style.cssText = 'margin:6px 0;font:500 14px/20px system-ui,sans-serif;color:#33243a;overflow-wrap:anywhere'; return e; }
export function kv(k, v) { const e = h('div', 'fv-kv', [h('span', '', k), h('b', '', v)]); e.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font:600 14px/22px system-ui,sans-serif;color:#33243a'; return e; }
export function grid(kids, min = 150) { const e = h('div', 'fv-grid', kids); e.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,${min}px),1fr));gap:8px`; return e; }
export { U };
