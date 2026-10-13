// Shared helpers + scoped CSS for the management screens owned by the roster/profile/recruit UI (prefix lm-). No em dashes.
import * as U from '../ui_kit.js';
import { styleBadge, fmt } from '../uihelpers.js';

export const h = U.h;
export { U, fmt };
export const D = () => globalThis.LM_D;
export const L = () => globalThis.LM;

/** portrait call site: ctx.portrait(g,size) when the game provides 3D portraits, else the style badge */
export function portrait(ctx, g, size = 56) {
  const f = ctx.portrait || ((gl, s) => styleBadge(gl.style, s));
  const el = f(g, size); el.classList.add('lm-portrait'); return el;
}

export const ACT_SHORT = { str: 'STR', agi: 'AGI', end: 'END', skl: 'SKL', wil: 'HRT', rest: 'Rest', spar: 'Spar', work: 'Jobs', spy: 'Spy' };
export function actDesc(a) {
  const d = D();
  if (a.t === 'train') return `Train ${d.SN[a.s]}. Costs energy, grows the stat every week.`;
  return ({ rest: 'Rest. Recovers a lot of energy and some morale.', spar: 'Spar. Earns XP and Skill, builds bonds, costs energy.', work: 'Odd jobs. Earns gold, costs energy and morale.', spy: 'Spy on rival ludi. Scouting +1 level for 2 weeks.' })[a.t];
}

export function chip(text, kind = 'bronze', title) {
  const e = h('span', `lm-chip lm-chip-${kind}`, text); if (title) U.tooltip(e, title); return e;
}
export function sec(title, right) {
  const e = h('div', 'lm-sec', [h('span', 'lm-sec-t', title), h('span', 'lm-sec-rule')]);
  if (right) e.append(right); return e;
}
/** talent pips (1..3) */
export function pips(n, max = 3) {
  const e = h('span', 'lm-pips'); e.setAttribute('role', 'img'); e.setAttribute('aria-label', `Talent ${n} of ${max}`);
  for (let i = 0; i < max; i++) e.append(h('i', i < n ? 'on' : ''));
  U.tooltip(e, 'Talent: how fast this stat grows with training and levels. Three pips is a natural.', { title: 'Talent' });
  return e;
}
export function bigBtn(opts) { const b = U.button(opts); return b; }
export function empty(text) { return h('div', 'lm-empty', text); }
export function note(text) { return h('p', 'lm-note', text); }

/** per-stat colored tag, used on recruit cards */
export function statTag(g, s) {
  const d = D(), e = h('div', 'lm-stag');
  e.style.setProperty('--sc', d.SC[s]);
  e.append(h('span', 'lm-stag-n', d.SA[s]), h('b', 'lm-num', String(Math.floor(g.st[s]))), pips(g.tal[s]));
  e.setAttribute('aria-label', `${d.SN[s]} ${Math.floor(g.st[s])}, talent ${g.tal[s]} of 3`);
  return e;
}

/** simple confirm dialog through ctx.ask: resolves true/false */
export async function confirm(ctx, { title, text, label = 'Confirm', variant = 'danger', body }) {
  const b = h('div', '', [body || null, text ? h('p', 'lm-note', text) : null]);
  const v = await ctx.ask({ title, body: b, actions: [{ label, value: 'yes', variant }, { label: 'Cancel', value: 'no', variant: 'ghost' }], dismiss: 'no' });
  return v === 'yes';
}

/** text input dialog (rename) */
export async function promptText(ctx, { title, value = '', label = 'Save', max = 16 }) {
  const inp = h('input', 'lm-input'); inp.value = value; inp.maxLength = max; inp.setAttribute('aria-label', title);
  const wrap = h('div', '', [inp]);
  setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { /* detached */ } }, 120);
  const v = await ctx.ask({ title, body: wrap, actions: [{ label, value: 'ok', variant: 'gold' }, { label: 'Cancel', value: 'no', variant: 'ghost' }], dismiss: 'no' });
  return v === 'ok' ? inp.value.trim() : null;
}

/** remove tooltips orphaned by an in-place re-render (their target vanished while hovered) */
export function clearTips() { document.querySelectorAll('.lx-tip').forEach((e) => e.remove()); }

/** replace the title text of a sheet created by ctx.sheet */
export function setTitle(m, text) { const t = m.el.querySelector('.lx-title'); if (t) t.textContent = text; }
/** give a sheet a wider desktop layout */
export function wide(m, px, cls = '') { const oc = m.close; m.close = () => { clearTips(); oc.call(m); }; const s = m.el.querySelector('.lx-sheet'); if (s) { s.style.setProperty('--lm-w', px + 'px'); s.classList.add('lm-wide', ...(cls ? [cls] : [])); } return m; }

/** two grids of activity buttons (5 training stats, then rest/spar/jobs/spy). onPick(act) */
export function activityGrid(g, onPick) {
  const d = D();
  const mk = (a) => {
    const b = h('button', 'lm-act', ACT_SHORT[a.id]); b.type = 'button';
    b.setAttribute('aria-pressed', g.act === a.id); b.setAttribute('aria-label', a.n + (g.act === a.id ? ' (selected)' : ''));
    if (a.t === 'train') b.style.setProperty('--sc', d.SC[a.s]);
    b.disabled = g.inj > 0; U.tooltip(b, actDesc(a), { title: a.n });
    b.addEventListener('click', () => onPick(a)); return b;
  };
  const gridEl = h('div', 'lm-act-w', [h('div', 'lm-act-g g5', d.ACTS.filter((a) => a.t === 'train').map(mk)), h('div', 'lm-act-g g4', d.ACTS.filter((a) => a.t !== 'train').map(mk))]);
  gridEl.dataset.tut = 'plan-grid'; return gridEl;
}

const CSS = `
.lm-act-w{display:grid;gap:6px}
.lm-act-g{display:grid;gap:6px}
.lm-act-g.g5{grid-template-columns:repeat(5,minmax(0,1fr))}
.lm-act-g.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.lm-act{position:relative;min-height:44px;padding:6px 2px 8px;border-radius:8px;cursor:pointer;touch-action:manipulation;font:800 12px/1.1 var(--lx-serif);letter-spacing:.05em;text-transform:uppercase;color:#4a3550;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(235,220,185,.7));border:1.5px solid rgba(122,82,34,.5);box-shadow:0 2px 0 rgba(122,82,34,.55);transition:transform .08s,box-shadow .08s;overflow:hidden;text-overflow:ellipsis}
.lm-act::after{content:'';position:absolute;left:8px;right:8px;bottom:3px;height:3px;border-radius:2px;background:var(--sc,transparent)}
.lm-act:active:not(:disabled){transform:translateY(2px);box-shadow:0 0 0 rgba(0,0,0,0)}
.lm-act[aria-pressed=true]{background:linear-gradient(180deg,#ffe08a,#e0a82e);color:#3b2711;border-color:#8a5a14;box-shadow:0 2px 0 #7a5222,0 0 10px rgba(242,193,78,.6)}
.lm-act:disabled{opacity:.5;cursor:not-allowed}
.lm-act:focus-visible{outline:3px solid #5a1f5e;outline-offset:1px}
.lm-actd{font:600 12px/17px var(--lx-sans);color:#5a4560;overflow-wrap:break-word;min-height:17px}


.lm-wide{max-width:var(--lm-w,560px)}
.lm-sheetbody{color:#3a2a18;font-size:var(--lx-fs-m);min-width:0}
.lm-sheetbody *{box-sizing:border-box}
.lm-num{font-variant-numeric:tabular-nums lining-nums}
.lm-sec{display:flex;align-items:center;gap:10px;margin:16px 0 8px;color:#7a2f30}
.lm-sec-t{font:800 12px/16px var(--lx-serif);letter-spacing:.16em;text-transform:uppercase;white-space:nowrap}
.lm-sec-rule{flex:1;height:2px;background:linear-gradient(90deg,rgba(122,47,48,.55),transparent);min-width:12px}
.lm-note{margin:6px 0;font:500 13px/18px var(--lx-sans);color:#5a4560;overflow-wrap:break-word}
.lm-empty{padding:16px;text-align:center;color:#6a5a4a;font:600 14px/20px var(--lx-sans);border:1.5px dashed rgba(122,82,34,.45);border-radius:10px;overflow-wrap:break-word}
.lm-card{position:relative;min-width:0;padding:10px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.62),rgba(255,247,226,.4));border:1px solid rgba(122,82,34,.38);box-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 2px 6px rgba(60,40,10,.14)}
.lm-card.lm-gold{border-color:#c98e24;background:linear-gradient(180deg,rgba(255,240,190,.8),rgba(255,226,150,.45))}
.lm-card.lm-warn{border-color:#b5372b;background:linear-gradient(180deg,rgba(255,225,215,.85),rgba(255,205,190,.5))}
.lm-card.lm-dim{opacity:.8}
.lm-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.lm-row{display:flex;align-items:center;gap:10px;min-width:0}
.lm-wrap{flex-wrap:wrap}
.lm-grow{flex:1;min-width:0}
.lm-name{font:800 16px/20px var(--lx-sans);color:#2a1a30;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-name small{font:600 13px var(--lx-sans);color:#7a5222}
.lm-sub{font:600 12px/16px var(--lx-sans);color:#5a4560;overflow-wrap:break-word}
.lm-h1{font:800 20px/24px var(--lx-serif);letter-spacing:.04em;color:#2a1a30;overflow-wrap:break-word;min-width:0}
.lm-chip{display:inline-flex;align-items:center;gap:4px;min-height:22px;padding:2px 9px;border-radius:999px;font:800 11px/16px var(--lx-sans);letter-spacing:.04em;white-space:nowrap;color:#fff;background:#8a5a26;border:1px solid rgba(0,0,0,.25);box-shadow:inset 0 1px 0 rgba(255,255,255,.3)}
.lm-chip-bronze{background:linear-gradient(180deg,#c99650,#8a5a26)}
.lm-chip-gold{background:linear-gradient(180deg,#ffe08a,#d9a02e);color:#3b2711}
.lm-chip-red{background:linear-gradient(180deg,#e0644f,#9d2a20)}
.lm-chip-green{background:linear-gradient(180deg,#5fae6e,#2f7a3f)}
.lm-chip-blue{background:linear-gradient(180deg,#5b9ae0,#2f64a8)}
.lm-chip-purple{background:linear-gradient(180deg,#9a6ad0,#5a1f5e)}
.lm-chip-grey{background:linear-gradient(180deg,#8a8a94,#5c6068)}
.lm-chip-pulse{animation:lm-pulse 1.6s ease-in-out infinite}
@keyframes lm-pulse{50%{box-shadow:0 0 0 3px rgba(242,193,78,.55)}}
.lm-chips{display:flex;flex-wrap:wrap;gap:5px;align-items:center;min-width:0}
.lm-pips{display:inline-flex;gap:3px;vertical-align:middle}
.lm-pips i{width:8px;height:8px;border-radius:50%;background:rgba(0,0,0,.18);box-shadow:inset 0 1px 1px rgba(0,0,0,.4)}
.lm-pips i.on{background:radial-gradient(circle at 35% 30%,#ffe08a,#c98e24);box-shadow:0 0 4px rgba(242,193,78,.8),inset 0 0 0 1px #7a5222}
.lm-meter{display:grid;grid-template-columns:44px 1fr 30px;gap:6px;align-items:center;font:700 11px/14px var(--lx-sans);color:#5a4560;letter-spacing:.04em;text-transform:uppercase}
.lm-meter b{text-align:right;color:#2a1a30;font-weight:800}
.lm-input{width:100%;min-height:46px;padding:8px 12px;font:700 16px var(--lx-sans);border-radius:8px;border:2px solid #b8803a;background:#fff8e6;color:#2a1a30}
.lm-input:focus-visible{outline:3px solid #5a1f5e;outline-offset:1px}
.lm-portrait{flex:none}
.lm-btnrow{display:flex;flex-wrap:wrap;gap:8px}
.lm-btnrow .lx-btn{flex:1 1 130px}
.lm-btn-sm{min-height:44px;padding:6px 12px;font-size:12px}
/* segmented tabs */
.lm-tabs{position:sticky;top:-4px;z-index:3;display:flex;gap:4px;padding:4px;margin:12px 0 4px;border-radius:10px;background:linear-gradient(180deg,#5a3b1c,#34220f);box-shadow:0 3px 8px rgba(40,24,6,.35),inset 0 0 0 1px rgba(242,193,78,.4)}
.lm-tab{flex:1 1 0;min-width:0;min-height:44px;padding:4px 2px;border:0;border-radius:7px;background:transparent;color:#d9bd8a;font:800 11.5px/1.1 var(--lx-serif);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative}
.lm-tab span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-tab.on{background:linear-gradient(180deg,#ffe08a,#d9a02e);color:#3b2711;box-shadow:0 2px 0 #7a5222}
.lm-tab:focus-visible{outline:3px solid #fff;outline-offset:1px}
.lm-tab i{position:absolute;top:3px;right:6px;width:9px;height:9px;border-radius:50%;background:#e0644f;box-shadow:0 0 0 2px #34220f}
@media(min-width:900px){.lm-tab{font-size:13px}}
`;
export function injectCss() {
  if (document.getElementById('lm-screens-css')) return;
  const s = document.createElement('style'); s.id = 'lm-screens-css'; s.textContent = CSS + (globalThis.__LM_CSS_EXTRA || ''); document.head.append(s);
}
/** register extra css from a screen module */
export function addCss(css) {
  injectCss();
  const id = 'lm-css-' + css.length + '-' + css.charCodeAt(5);
  if (document.getElementById(id)) return;
  const s = document.createElement('style'); s.id = id; s.textContent = css; document.head.append(s);
}
