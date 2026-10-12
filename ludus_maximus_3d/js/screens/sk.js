// Shared kit for the Arena / Building / More screens: scoped CSS (ax- prefix), sheet shell, cards, pills, tabs,
// fighter picker, trophy and report dialogs. Built on ui_kit.js. No em dashes in copy.
import * as U from '../ui_kit.js';
import { styleBadge, chip, itemCard } from '../uihelpers.js';

export const D = new Proxy({}, { get: (_, k) => globalThis.LM_D[k] }), L = () => globalThis.LM;
export const h = U.h;
export { U, styleBadge, chip, itemCard };
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

const CSS = `
.lx-sheet.ax-sheet{background:radial-gradient(120% 50% at 50% -8%,rgba(242,193,78,.18),transparent 62%),linear-gradient(180deg,#322b50 0%,#1d1830 100%);border:2px solid var(--lx-bronze);color:var(--lx-text)}
.lx-sheet.ax-sheet::after{display:none}
.lx-sheet.ax-sheet.lx-keyed::before{background-image:var(--lx-key);opacity:.9}
.ax-sheet .lx-title{color:var(--lx-gold);text-shadow:0 2px 0 rgba(0,0,0,.55);font-size:var(--lx-fs-l)}
.ax-sheet .lx-sheet-scroll{padding:6px 2px 10px;scrollbar-width:thin;scrollbar-color:rgba(242,193,78,.5) transparent}
@media (min-width:700px){.lx-sheet.ax-sheet.ax-wide{max-width:820px}.lx-sheet.ax-sheet.ax-mid{max-width:660px}}
.ax{display:flex;flex-direction:column;gap:12px;min-width:0;font-size:var(--lx-fs-m);line-height:1.4;overflow-wrap:anywhere}
.ax *{min-width:0;box-sizing:border-box}
.ax p{margin:0}
.ax-tabs{display:flex;gap:4px;padding:4px;border-radius:10px;background:rgba(10,6,24,.5);box-shadow:inset 0 0 0 1px rgba(242,193,78,.25)}
.ax-tab{flex:1;min-height:44px;padding:6px 8px;border:0;border-radius:7px;background:transparent;color:var(--lx-travertine);font:700 var(--lx-fs-s)/1.1 var(--lx-serif);letter-spacing:.08em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s,color .15s}
.ax-tab:hover{background:rgba(242,193,78,.12)}
.ax-tab.on{background:linear-gradient(180deg,#ffe08a,#f2c14e 50%,#c98e24);color:#2a1a08;box-shadow:0 2px 0 #7a5222,inset 0 1px 0 rgba(255,255,255,.6)}
.ax-tab:focus-visible,.ax-chipbtn:focus-visible,.ax-pick:focus-visible,.ax-tap:focus-visible{outline:3px solid #fff;outline-offset:2px}
.ax-scroll{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px;scroll-snap-type:x proximity;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ax-scroll::-webkit-scrollbar{display:none}
.ax-chipbtn{flex:none;scroll-snap-align:start;min-height:44px;padding:6px 14px;border-radius:999px;border:1.5px solid rgba(242,193,78,.45);background:rgba(10,6,24,.45);color:var(--lx-travertine);font:700 var(--lx-fs-s)/1.15 var(--lx-sans);display:inline-flex;align-items:center;gap:6px;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.ax-chipbtn.on{background:linear-gradient(180deg,#ffe08a,#f2c14e);color:#2a1a08;border-color:#7a5222}
.ax-chipbtn.lock{opacity:.6}
.ax-chipbtn small{font-weight:600;opacity:.8}
.ax-h{display:flex;align-items:center;gap:10px;margin:6px 0 0;font:700 var(--lx-fs-s)/1.2 var(--lx-serif);letter-spacing:.14em;text-transform:uppercase;color:var(--lx-gold)}
.ax-h::before,.ax-h::after{content:'';flex:1;height:2px;background:linear-gradient(90deg,transparent,rgba(242,193,78,.6),transparent)}
.ax-h span{max-width:80%;text-align:center}
.ax-card{position:relative;border-radius:10px;padding:12px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));box-shadow:inset 0 0 0 1px rgba(242,193,78,.28),0 4px 12px rgba(5,3,14,.35);display:flex;flex-direction:column;gap:8px}
.ax-card.parch{background:radial-gradient(120% 90% at 50% 30%,#f6ecd0,#e3d2a8);color:var(--lx-text-d);box-shadow:inset 0 0 0 2px #9c7a42,0 4px 12px rgba(5,3,14,.35)}
.ax-card.gold{box-shadow:inset 0 0 0 1.5px var(--lx-gold),0 0 18px rgba(242,193,78,.18),0 4px 12px rgba(5,3,14,.35)}
.ax-card.purple{background:linear-gradient(180deg,rgba(122,63,168,.32),rgba(90,31,94,.18));box-shadow:inset 0 0 0 1.5px rgba(190,140,240,.6),0 4px 12px rgba(5,3,14,.35)}
.ax-card.red{background:linear-gradient(180deg,rgba(194,57,47,.28),rgba(125,33,25,.16));box-shadow:inset 0 0 0 1.5px rgba(224,100,79,.6),0 4px 12px rgba(5,3,14,.35)}
.ax-card.green{background:linear-gradient(180deg,rgba(91,122,58,.3),rgba(60,90,40,.14));box-shadow:inset 0 0 0 1.5px rgba(140,190,90,.55),0 4px 12px rgba(5,3,14,.35)}
.ax-card.dim{opacity:.62}
.ax-row{display:flex;align-items:center;gap:10px;min-width:0}
.ax-wrap{flex-wrap:wrap}
.ax-grow{flex:1;min-width:0}
.ax-gap4{gap:4px}
.ax-col{display:flex;flex-direction:column;gap:6px;min-width:0}
.ax-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}
.ax-grid.s{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px}
.ax-name{font:700 var(--lx-fs-l)/1.2 var(--lx-serif);letter-spacing:.04em;color:var(--lx-gold);text-shadow:0 1px 0 rgba(0,0,0,.5)}
.parch .ax-name{color:#5a1f5e;text-shadow:none}
.ax-sub{font-size:var(--lx-fs-s);opacity:.82;line-height:1.35}
.ax-b{font-weight:800}
.ax-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font:700 var(--lx-fs-s)/1.3 var(--lx-sans);background:rgba(10,6,24,.55);box-shadow:inset 0 0 0 1px rgba(242,193,78,.4);color:var(--lx-travertine);white-space:nowrap;font-variant-numeric:tabular-nums}
.ax-pill.gold{background:rgba(242,193,78,.18);color:var(--lx-gold)}
.ax-pill.good{background:rgba(63,154,106,.28);box-shadow:inset 0 0 0 1px rgba(100,200,140,.6);color:#bff0d2}
.ax-pill.bad{background:rgba(194,57,47,.3);box-shadow:inset 0 0 0 1px rgba(240,120,100,.6);color:#ffd3c9}
.ax-pill.warn{background:rgba(201,142,36,.28);box-shadow:inset 0 0 0 1px rgba(242,193,78,.6);color:#ffe3a0}
.ax-pill.vio{background:rgba(122,63,168,.34);box-shadow:inset 0 0 0 1px rgba(190,140,240,.6);color:#e6d0ff}
.ax-pill.blue{background:rgba(74,143,208,.28);box-shadow:inset 0 0 0 1px rgba(130,190,240,.6);color:#cfe6ff}
.parch .ax-pill{background:rgba(255,255,255,.55);color:#33243a;box-shadow:inset 0 0 0 1px rgba(122,82,34,.4)}
.ax-pill[tabindex]{cursor:help}
.ax-evh{display:flex;align-items:center;gap:10px;margin:-12px -12px 0;padding:10px 12px;border-radius:10px 10px 0 0;background:linear-gradient(90deg,var(--k,#7a5222),rgba(29,24,48,.2) 85%);box-shadow:inset 0 -1px 0 rgba(242,193,78,.3)}
.ax-medal{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#ffe08a,#b8803a 70%);color:#2a1a08;box-shadow:0 2px 0 #4a2f12,inset 0 0 0 2px rgba(255,255,255,.35)}
.ax-medal.big{width:56px;height:56px}
.ax-medal.dark{background:radial-gradient(circle at 35% 30%,#5a3b1c,#1d1830 80%);color:var(--lx-gold);box-shadow:0 0 0 2px var(--lx-gold)}
.ax-evt{font:700 var(--lx-fs-l)/1.15 var(--lx-serif);letter-spacing:.05em;color:#fff4d8;text-shadow:0 2px 0 rgba(0,0,0,.5)}
.ax-opp{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:999px;background:rgba(10,6,24,.5);box-shadow:inset 0 0 0 1px rgba(242,193,78,.25);cursor:pointer;min-height:44px;border:0;color:inherit;font:inherit;text-align:left;touch-action:manipulation}
.ax-opp:hover{box-shadow:inset 0 0 0 1.5px var(--lx-gold)}
.ax-opp.big{border-radius:12px;padding:8px 12px 8px 8px;flex:1}
.ax-opp .ax-oname{font:700 var(--lx-fs-s)/1.2 var(--lx-sans);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:132px}
.ax-opp.big .ax-oname{font-size:var(--lx-fs-m);max-width:none}
.ax-opp small{display:block;font-size:11px;opacity:.8;font-weight:600}
.ax-fog{filter:grayscale(.8) brightness(.8)}
.ax-pick{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;min-height:64px;background:rgba(10,6,24,.4);box-shadow:inset 0 0 0 1px rgba(242,193,78,.22);cursor:pointer;touch-action:manipulation;border:0;color:inherit;font:inherit;text-align:left;width:100%}
.ax-pick:hover:not([aria-disabled=true]){box-shadow:inset 0 0 0 1.5px rgba(242,193,78,.7)}
.ax-pick.sel{background:linear-gradient(90deg,rgba(242,193,78,.28),rgba(242,193,78,.08));box-shadow:inset 0 0 0 2px var(--lx-gold)}
.ax-pick[aria-disabled=true]{opacity:.5;cursor:not-allowed}
.ax-check{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 2px rgba(242,193,78,.5);color:transparent}
.sel .ax-check{background:var(--lx-gold);color:#2a1a08;box-shadow:none}
.ax-odds{flex:none;text-align:center;min-width:54px;font:800 var(--lx-fs-l)/1 var(--lx-serif);color:var(--lx-gold)}
.ax-odds small{display:block;font:600 11px/1.2 var(--lx-sans);opacity:.75;margin-top:3px}
.ax-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch}
.ax-actions>.lx-btn{flex:1 1 130px}
.ax-kv{display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:3px 0;border-bottom:1px dashed rgba(242,193,78,.18)}
.ax-kv:last-child{border-bottom:0}
.ax-kv b{font-variant-numeric:tabular-nums;text-align:right}
.ax-bar{height:10px;border-radius:5px;background:#140f22;box-shadow:inset 0 1px 3px #000,0 0 0 1px rgba(242,193,78,.4);overflow:hidden}
.ax-bar i{display:block;height:100%;width:var(--w,0%);background:linear-gradient(180deg,rgba(255,255,255,.4),transparent 50%,rgba(0,0,0,.25)),var(--c,var(--lx-xp));transition:width .4s var(--lx-ease-out)}
.ax-banner{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:10px;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.5);background:linear-gradient(100deg,var(--k),rgba(29,24,48,.55));box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35),0 0 20px -4px var(--k)}
.ax-empty{text-align:center;padding:20px 12px;opacity:.85;display:flex;flex-direction:column;align-items:center;gap:8px}
.ax-switch{flex:none;position:relative;width:56px;height:32px;border-radius:16px;border:0;background:#140f22;box-shadow:inset 0 1px 3px #000,0 0 0 2px rgba(242,193,78,.45);cursor:pointer;transition:background .2s;touch-action:manipulation}
.ax-switch::after{content:'';position:absolute;top:4px;left:4px;width:24px;height:24px;border-radius:50%;background:linear-gradient(180deg,#e8dcc0,#b79a64);transition:transform .2s var(--lx-ease-out);box-shadow:0 2px 4px rgba(0,0,0,.5)}
.ax-switch[aria-checked=true]{background:linear-gradient(180deg,#c98e24,#f2c14e)}
.ax-switch[aria-checked=true]::after{transform:translateX(24px)}
.ax-tap{min-height:44px}
.ax-range{width:100%;height:44px;accent-color:#f2c14e;background:transparent;cursor:pointer}
.ax-switchrow{display:flex;align-items:center;gap:12px;min-height:48px}
.ax-ta{width:100%;min-height:120px;resize:vertical;border-radius:8px;border:2px solid var(--lx-bronze);background:#140f22;color:var(--lx-travertine);font:12px/1.35 ui-monospace,Consolas,monospace;padding:8px;user-select:text;-webkit-user-select:text}
.ax-lvl{display:flex;gap:4px}
.ax-lvl i{width:18px;height:8px;border-radius:2px;background:#140f22;box-shadow:inset 0 0 0 1px rgba(242,193,78,.45)}
.ax-lvl i.on{background:linear-gradient(180deg,#ffe08a,#c98e24);box-shadow:0 0 6px rgba(242,193,78,.6)}
.ax-lvl i.cap{background:repeating-linear-gradient(45deg,#3b2711 0 3px,#140f22 3px 6px)}
.ax-plan{display:grid;grid-template-columns:auto 1fr auto;gap:8px 10px;align-items:center;padding:6px 8px;border-radius:8px;background:rgba(10,6,24,.35)}
.ax-plan.now{background:linear-gradient(90deg,rgba(242,193,78,.28),rgba(242,193,78,.06));box-shadow:inset 0 0 0 1.5px var(--lx-gold)}
.ax-plan.lockd{opacity:.55}
.ax-plan .n{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:800 13px/1 var(--lx-serif);background:radial-gradient(circle at 35% 30%,#d8a35c,#7a5222);color:#fff2d6}
.ax-hint{font-size:var(--lx-fs-s);padding:8px 10px;border-radius:8px;background:rgba(242,193,78,.1);box-shadow:inset 0 0 0 1px rgba(242,193,78,.3)}
.ax-troph{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:10px;text-align:center;background:rgba(10,6,24,.4);box-shadow:inset 0 0 0 1px rgba(242,193,78,.25);border:0;color:inherit;font:inherit;cursor:pointer;min-height:44px;touch-action:manipulation}
.ax-troph.got{background:linear-gradient(180deg,rgba(242,193,78,.25),rgba(242,193,78,.06));box-shadow:inset 0 0 0 1.5px var(--lx-gold)}
.ax-troph:not(.got){opacity:.55}
.ax-troph span{font:700 12px/1.2 var(--lx-sans)}
.ax-big{font:900 clamp(26px,8vw,34px)/1.1 var(--lx-serif);letter-spacing:.12em;text-align:center;text-transform:uppercase}
.ax-big.win{color:#9a6a10}.ax-big.lose{color:#7a2f30}
body.lx-large-text{--lx-fs-s:14px;--lx-fs-m:16px;--lx-fs-l:20px}
body.lx-reduce-motion *,body.lx-reduce-motion *::before,body.lx-reduce-motion *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
`;

export function injectCss() {
  if (document.getElementById('ax-css')) return;
  const s = document.createElement('style'); s.id = 'ax-css'; s.textContent = CSS; document.head.append(s);
}

// ------------------------------------------------------------------ shell
/** open a sheet whose body can be rebuilt in place. Returns {m, root, render(fn), close}. */
export function openScreen(ctx, { title, wide = false, mid = false, onClose } = {}) {
  injectCss();
  const root = h('div', 'ax'); let api;
  const m = ctx.sheet({ title, body: root, onClose: () => { onClose && onClose(); } });
  const sheet = m.el.querySelector('.lx-sheet'); sheet.classList.add('ax-sheet'); if (wide) sheet.classList.add('ax-wide'); if (mid) sheet.classList.add('ax-mid');
  const scroller = m.el.querySelector('.lx-sheet-scroll');
  api = {
    m, root, sheet, scroller, close: () => m.close(),
    render(fn, keep = true) {
      const top = keep ? scroller.scrollTop : 0; root.replaceChildren(); fn(root); scroller.scrollTop = top;
    },
    get alive() { return root.isConnected; },
  };
  return api;
}

// ------------------------------------------------------------------ primitives
export function sec(text) { return h('div', 'ax-h', h('span', '', text)); }
export function card(kids, cls = '') { return h('div', 'ax-card ' + cls, kids); }
export function row(kids, cls = '') { return h('div', 'ax-row ' + cls, kids); }
export function col(kids, cls = '') { return h('div', 'ax-col ' + cls, kids); }
export function note(text, cls = '') { return h('p', 'ax-sub ' + cls, text); }
export function hint(text) { return h('div', 'ax-hint', text); }
export function kv(k, v) { return h('div', 'ax-kv', [h('span', '', k), h('b', '', v)]); }
export function medal(ico, cls = '') { return h('div', 'ax-medal ' + cls, U.icon(ico, cls.includes('big') ? 30 : 22)); }

/** pill with optional icon, tone (gold|good|bad|warn|vio|blue) and tooltip */
export function pill(text, { ico, tone = '', tip, tipTitle } = {}) {
  const p = h('span', 'ax-pill ' + tone, [ico ? U.icon(ico, 14) : null, h('span', '', text)]);
  if (tip) { p.tabIndex = 0; U.tooltip(p, tip, { title: tipTitle }); }
  return p;
}
export const goldPill = (n, tip = 'Gold') => pill(fmt(n), { ico: 'coin', tone: 'gold', tip });
export const famePill = (n, tip = 'Fame raises your league and unlocks buildings') => pill(fmt(n), { ico: 'fame', tone: 'vio', tip, tipTitle: 'Fame' });

export function tabs(items, active, onSelect) {
  const el = h('div', 'ax-tabs'); el.setAttribute('role', 'tablist');
  items.forEach((it) => {
    const b = h('button', 'ax-tab' + (it.id === active ? ' on' : ''), [it.icon ? U.icon(it.icon, 18) : null, h('span', '', it.label)]); b.type = 'button';
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', it.id === active ? 'true' : 'false'); b.onclick = () => onSelect(it.id);
    el.append(b);
  });
  return el;
}

export function chipRow(items, active, onSelect) {
  const el = h('div', 'ax-scroll'); el.setAttribute('role', 'tablist');
  items.forEach((it) => {
    const b = h('button', 'ax-chipbtn' + (it.id === active ? ' on' : '') + (it.lock ? ' lock' : ''), [it.lock ? U.icon('lock', 14) : null, h('span', '', it.label), it.sub ? h('small', '', it.sub) : null]); b.type = 'button';
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', it.id === active ? 'true' : 'false'); if (it.tip) U.tooltip(b, it.tip, { title: it.label });
    b.onclick = () => onSelect(it.id); el.append(b);
  });
  return el;
}

export function meter(v, max, color) { const b = h('div', 'ax-bar'); b.style.setProperty('--w', Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100)) + '%'); if (color) b.style.setProperty('--c', color); b.setAttribute('role', 'progressbar'); b.setAttribute('aria-valuenow', Math.round(v)); b.setAttribute('aria-valuemax', Math.round(max)); b.append(h('i')); return b; }

export function toggle(label, sub, on, onChange) {
  const sw = h('button', 'ax-switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.setAttribute('aria-label', label);
  sw.onclick = () => { const v = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', v ? 'true' : 'false'); onChange(v); };
  return h('div', 'ax-switchrow', [h('div', 'ax-grow', [h('div', 'ax-b', label), sub ? h('div', 'ax-sub', sub) : null]), sw]);
}

export function slider(label, value, onInput, onChange) {
  const out = h('b', 'ax-num', Math.round(value * 100) + '%');
  const r = h('input', 'ax-range'); r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round(value * 100); r.setAttribute('aria-label', label);
  r.oninput = () => { out.textContent = r.value + '%'; onInput(+r.value / 100); }; r.onchange = () => onChange && onChange(+r.value / 100);
  return h('div', 'ax-col', [h('div', 'ax-row', [h('span', 'ax-grow ax-b', label), out]), r]);
}

export function empty(ico, text, sub) { return h('div', 'ax-empty', [medal(ico, 'big dark'), h('div', 'ax-b', text), sub ? h('div', 'ax-sub', sub) : null]); }

export function actions(btns) { return h('div', 'ax-actions', btns); }

/** a style badge with a tooltip describing the style and its edge */
export function styleTag(style, size = 40) {
  const S = D.STYLES[style], b = styleBadge(style, size); b.tabIndex = 0; b.setAttribute('role', 'img'); b.setAttribute('aria-label', S.n);
  U.tooltip(b, `${S.role}. ${S.d}`, { title: S.n }); return b;
}

/** small row of opponents shown at fight intros */
export function oppStrip(opps, fogLv = 3) {
  return h('div', 'ax-row ax-wrap', opps.map((o) => h('div', 'ax-opp', [styleBadge(o.style, 36), h('div', '', [h('div', 'ax-oname', o.name), h('small', '', `Lv ${o.lvl} ${D.STYLES[o.style].n}`)])])));
}

// ------------------------------------------------------------------ fighter picker
/**
 * Pick fighters from the roster in a sheet. Resolves with an array of ids, or null when dismissed.
 * o: {title, intro, n (how many), info(g) -> {reason?, badges?: Node[], right?: Node}, footer(sel: glad[]) -> Node|null, confirm(sel) -> {label, disabled?, sub?}}
 */
export function pickFighters(ctx, o) {
  return new Promise((resolve) => {
    const S = ctx.S, n = o.n || 1; let sel = [], done = false;
    const scr = openScreen(ctx, { title: o.title, mid: true, onClose: () => { if (!done) { done = true; resolve(null); } } });
    const finish = (v) => { if (done) return; done = true; resolve(v); scr.close(); };
    const draw = () => scr.render((root) => {
      if (o.intro) root.append(typeof o.intro === 'string' ? note(o.intro) : o.intro);
      if (n > 1) root.append(hint(`Choose ${n} fighters. Selected ${sel.length} of ${n}.`));
      if (!S.glads.length) root.append(empty('roster', 'Your barracks are empty', 'Recruit a gladiator first.'));
      S.glads.forEach((g) => {
        const inf = o.info(g) || {}, bad = !!inf.reason, on = sel.includes(g.id), st = D.STYLES[g.style];
        const b = h('div', 'ax-pick' + (on ? ' sel' : '')); b.tabIndex = 0; b.setAttribute('role', 'button'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (bad) b.setAttribute('aria-disabled', 'true');
        const en = h('div', 'ax-bar'); en.style.setProperty('--w', g.en + '%'); en.style.setProperty('--c', 'var(--lx-stam)'); en.append(h('i')); en.style.height = '6px'; en.title = `Energy ${Math.round(g.en)}`;
        b.append(h('span', 'ax-check', U.icon('check', 16)), styleBadge(g.style, 44),
          h('div', 'ax-grow ax-col ax-gap4', [h('div', 'ax-b', g.name + (g.nick ? ` "${g.nick}"` : '')), h('div', 'ax-sub', `${st.n} · Level ${g.lvl}`), en,
            h('div', 'ax-row ax-wrap ax-gap4', [bad ? pill(inf.reason, { tone: 'bad' }) : null, ...(inf.badges || [])])]), inf.right || null);
        const act = () => {
          if (bad) { ctx.sfx('uiError'); U.toast(inf.reason, { kind: 'bad' }); return; }
          const i = sel.indexOf(g.id);
          if (i >= 0) sel.splice(i, 1); else { if (sel.length >= n) sel.shift(); sel.push(g.id); }
          ctx.sfx('uiTap'); draw();
        };
        b.onclick = act; b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
        root.append(b);
      });
      const gs = sel.map((id) => ctx.gOf(id)).filter(Boolean);
      const ft = o.footer && o.footer(gs); if (ft) root.append(ft);
      const cf = o.confirm ? o.confirm(gs) : { label: 'Confirm' }; const ready = gs.length === n && !cf.disabled;
      root.append(U.button({ label: cf.label, sub: cf.sub, variant: 'gold', block: true, icon: 'check', disabled: !ready, onClick: () => { ctx.sfx('uiConfirm'); finish(sel.slice()); } }));
    });
    draw();
  });
}

// ------------------------------------------------------------------ report dialogs
/** big result header + pills + paragraphs, for ctx.ask bodies */
export function reportBody({ title, tone = 'win', pills = [], lines = [], items = [], kids = [] }) {
  const body = h('div', 'ax-col');
  const big = h('div', 'ax-big ' + tone, title);
  body.append(big, h('div', 'ax-row ax-wrap', pills.filter(Boolean)));
  body.firstChild.nextSibling.style.justifyContent = 'center';
  lines.forEach((l) => body.append(h('p', '', l)));
  items.forEach((it) => body.append(itemCard(it, { tag: 'Loot!' })));
  kids.forEach((k) => body.append(k));
  body.style.cssText = 'color:#33243a;font:500 14px/20px system-ui,sans-serif;overflow-wrap:anywhere';
  return body;
}

export function fightStats(ctx, res) {
  if (!res || !res.F || !res.F.units) return null;
  const us = res.F.units, mx = Math.max(1, ...us.map((u) => u.dmg || 0)), box = h('div', 'ax-col');
  us.filter((u) => u.side === 'A' && u.g && ctx.gOf(u.g.id)).forEach((u) => { try { L().recordLife(ctx.gOf(u.g.id), u); } catch (e) { /* optional */ } });
  us.forEach((u) => {
    const r = h('div', '', [h('b', '', u.name), ` ${Math.round(u.dmg || 0)} dmg · ${Math.round(u.taken || 0)} taken · ${u.crits || 0} crit${u.crits === 1 ? '' : 's'}`]);
    r.style.cssText = `font:600 12px/18px system-ui,sans-serif;color:${u.side === 'A' ? '#2a6a3a' : '#7a2f30'}`;
    box.append(r, U.bar({ value: u.dmg || 0, max: mx, kind: u.side === 'A' ? 'stam' : 'hp', height: 5 }));
  });
  return box;
}

/** the "trophy earned" dialog, same rewards as the weekly flow */
export async function awardTrophies(ctx) {
  const t = L().checkTrophies(ctx.S); if (!t.length) return; ctx.sfx('levelUp'); ctx.save();
  const body = h('div', 'ax-col', t.map((x) => h('div', '', [h('b', '', x.n), h('div', '', x.d), h('div', '', [x.r.gold ? chip('+' + x.r.gold + ' gold', '#b8803a') : '', x.r.fame ? chip('+' + x.r.fame + ' fame', '#7b4fb8') : '', x.r.laurels ? chip('+' + x.r.laurels + ' laurels', '#5b7a3a') : ''])])));
  body.style.cssText = 'font:600 14px/20px system-ui,sans-serif;color:#33243a';
  await ctx.ask({ title: t.length > 1 ? 'Trophies earned!' : 'Trophy earned!', body, actions: [{ label: 'Shiny!', value: 'ok', variant: 'gold' }], dismiss: 'ok' }); ctx.refresh();
}

/** simple confirm dialog (Promise<boolean>) */
export async function confirmDialog(ctx, { title, text, yes = 'Confirm', no = 'Cancel', danger = false }) {
  const body = h('p', '', text); body.style.cssText = 'color:#33243a;font:500 14px/20px system-ui,sans-serif;overflow-wrap:anywhere';
  const v = await ctx.ask({ title, body, actions: [{ label: yes, value: 'y', variant: danger ? 'danger' : 'gold' }, { label: no, value: 'n', variant: 'ghost' }], dismiss: 'n' });
  return v === 'y';
}

export function recoverLabel(hpf) { return `${Math.round(hpf * 100)}% HP`; }
