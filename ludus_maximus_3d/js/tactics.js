// Tactics: the player's in-fight orders and the fight readability overlay (Ludus Maximus 3D, owned by the fight view team).
//   - Orders: Press / Hold / Fall back / Guard per fighter, Swap targets for partners, Call a Rally. Rules live in core/arena.js (LM.command, LM.CMD);
//     every order goes through FightView.command -> tap() so it is recorded by sim step and replays exactly.
//   - HUD: a dock with cooldown rings and hotkeys 1 to 6 (desktop), an Orders button and a radial wheel (long press on the arena, phones), ally chips to pick
//     who a stance applies to, tap an enemy to focus it, Tab cycles the selected ally, F cycles the focus target. Time slows to 25% while the wheel is open.
//   - Readability overlay (one 2D canvas, zero WebGL draw calls): team rings (solid allies, dashed foes: not colour only), focus brackets and chevron,
//     who-targets-whom link lines (option), ground telegraphs for foe ultimates and fire jets, off-screen fighter arrows, danger vignette at low hp.
import * as THREE from 'three';

const D = () => globalThis.LM_D, L = () => globalThis.LM;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ALLY = '83,214,160', FOE = '224,82,74', GOLD = '242,193,78';
const KEYS = ['press', 'hold', 'retreat', 'guard', 'swap', 'rally'];
const ICON = {
  press: '<path d="M5 6l7 6-7 6M12 6l7 6-7 6"/>', hold: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 12h6"/>', retreat: '<path d="M19 6l-7 6 7 6M12 6l-7 6 7 6"/>',
  guard: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>', swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>', rally: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
  orders: '<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
};
const svg = (k, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const CIRC = 2 * Math.PI * 20;

const CSS = `
.tac-cv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.tac-danger{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 50%,rgba(120,0,0,0) 46%,rgba(176,22,22,.62) 100%)}
.tac-dock{position:absolute;left:max(10px,var(--lx-sal,0px));bottom:calc(var(--lx-sab,0px) + 10px);display:flex;flex-direction:column;gap:6px;pointer-events:none;z-index:6;max-width:calc(100% - 20px)}
.tac-row{display:flex;gap:6px;align-items:flex-end;pointer-events:none}
.tac-chips{display:flex;gap:5px;pointer-events:auto;flex-wrap:wrap}
.tac-chip{font:800 11px/1 var(--lx-sans,system-ui);letter-spacing:.04em;min-height:30px;padding:4px 9px;border-radius:999px;border:2px solid rgba(184,128,58,.9);background:rgba(29,24,48,.78);color:#f3e6c8;max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;touch-action:manipulation;cursor:pointer}
.tac-chip[aria-pressed=true]{background:linear-gradient(180deg,#f2c14e,#c9922e);color:#2a1a30;border-color:#7a5222}
.tac-chip[data-down="1"]{opacity:.4}
.tac-chip small{font-weight:700;opacity:.8;margin-left:5px;text-transform:uppercase;font-size:9px}
.tac-btn{position:relative;pointer-events:auto;width:50px;height:58px;padding:0;border:0;background:none;color:#f3e6c8;touch-action:manipulation;cursor:pointer;font:inherit}
.tac-btn svg.tac-r{position:absolute;left:0;top:0;width:50px;height:50px;transform:rotate(-90deg)}
.tac-btn .tac-disc{position:absolute;left:4px;top:4px;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%,#4a3f6a,#241d3a);box-shadow:inset 0 0 0 2px rgba(184,128,58,.95),0 2px 0 rgba(0,0,0,.45)}
.tac-btn .tac-k{position:absolute;left:-1px;top:-1px;min-width:16px;height:16px;border-radius:5px;background:#1d1830;border:1.5px solid #b8803a;font:800 10px/13px var(--lx-sans,system-ui);text-align:center;color:#f2c14e}
.tac-btn .tac-n{position:absolute;left:-6px;right:-6px;bottom:0;text-align:center;font:800 9.5px/1 var(--lx-sans,system-ui);letter-spacing:.03em;text-shadow:0 1px 2px #000,0 0 3px #000;white-space:nowrap}
.tac-btn .tac-s{position:absolute;left:4px;top:4px;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:900 15px/1 var(--lx-sans,system-ui);color:#fff;text-shadow:0 1px 3px #000;pointer-events:none}
.tac-btn[data-st=cd] .tac-disc,.tac-btn[data-st=na] .tac-disc{filter:grayscale(.7) brightness(.7)}
.tac-btn[data-st=na]{opacity:.55}
.tac-btn[data-st=on] .tac-disc{background:radial-gradient(circle at 50% 35%,var(--c),#241d3a 95%);box-shadow:inset 0 0 0 2px #f2c14e,0 0 12px var(--c)}
.tac-btn[data-st=ready] .tac-disc{box-shadow:inset 0 0 0 2px #f2c14e,0 2px 0 rgba(0,0,0,.45)}
.tac-btn:active .tac-disc{transform:translateY(2px)}
.tac-btn:focus-visible{outline:3px solid #f2c14e;outline-offset:2px;border-radius:12px}
.tac-pop{animation:tac-pop .5s ease-out}
@keyframes tac-pop{0%{transform:scale(1)}30%{transform:scale(1.18)}100%{transform:scale(1)}}
.tac-orders{position:absolute;left:max(10px,var(--lx-sal,0px));bottom:calc(var(--lx-sab,0px) + 10px);pointer-events:auto;z-index:6;width:56px;height:62px;border:0;background:none;padding:0;color:#f3e6c8;touch-action:manipulation}
.tac-tip{position:absolute;left:0;bottom:72px;z-index:7;max-width:min(300px,calc(100vw - 24px));pointer-events:none;padding:8px 10px;border-radius:10px;background:rgba(29,24,48,.94);border:2px solid #b8803a;color:#f3e6c8;font:600 12px/1.35 var(--lx-sans,system-ui);display:none}
.tac-tip b{display:block;font:800 12px/1.2 var(--lx-sans,system-ui);letter-spacing:.06em;text-transform:uppercase;color:#f2c14e;margin-bottom:3px}
.tac-tip i{font-style:normal;display:block}.tac-tip i.g{color:#8fe3b4}.tac-tip i.c{color:#ff9d8f}
.tac-wscrim{position:absolute;inset:0;z-index:12;pointer-events:none;background:radial-gradient(circle at var(--wx) var(--wy),rgba(20,14,30,.0) 0,rgba(20,14,30,.55) 70%);animation:tac-fade .18s ease-out}
.tac-wscrim[data-tap="1"]{pointer-events:auto}
@keyframes tac-fade{from{opacity:0}to{opacity:1}}
.tac-wheel{position:absolute;z-index:13;width:0;height:0;pointer-events:none}
.tac-wb{position:absolute;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;border:0;padding:0;pointer-events:auto;touch-action:none;color:#f3e6c8;background:radial-gradient(circle at 50% 30%,#54487a,#241d3a);box-shadow:inset 0 0 0 3px #b8803a,0 3px 0 rgba(0,0,0,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:800 9.5px/1 var(--lx-sans,system-ui);letter-spacing:.03em;animation:tac-wpop .22s cubic-bezier(.3,1.5,.5,1) both}
@keyframes tac-wpop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
.tac-wb[data-hot="1"]{background:radial-gradient(circle at 50% 30%,var(--c),#241d3a 95%);box-shadow:inset 0 0 0 3px #f2c14e,0 0 18px var(--c);transform:scale(1.14)}
.tac-wb[data-st=cd],.tac-wb[data-st=na]{filter:grayscale(.75) brightness(.7)}
.tac-wb svg.tac-r{position:absolute;left:-1px;top:-1px;width:64px;height:64px;transform:rotate(-90deg);pointer-events:none}
.tac-wb .tac-k{position:absolute;right:2px;top:0;font:800 9px/1 var(--lx-sans,system-ui);color:#f2c14e}
.tac-wc{position:absolute;left:0;top:0;width:min(250px,calc(100vw - 28px));box-sizing:border-box;padding:7px 10px;border-radius:10px;background:rgba(29,24,48,.88);border:2px solid rgba(184,128,58,.9);text-align:center;pointer-events:none;color:#f3e6c8;font:600 12px/1.35 var(--lx-sans,system-ui)}
.tac-wc b{display:block;font:800 13px/1.2 var(--lx-serif,Georgia,serif);letter-spacing:.1em;text-transform:uppercase;color:#f2c14e}
.tac-wc i{font-style:normal;display:block}.tac-wc i.g{color:#9af0c0}.tac-wc i.c{color:#ffaa9c}
.tac-hint{position:absolute;left:50%;top:calc(var(--lx-sat,0px) + 96px);transform:translateX(-50%);z-index:5;pointer-events:none;padding:4px 10px;border-radius:999px;background:rgba(29,24,48,.7);color:#f3e6c8;font:700 11px/1.2 var(--lx-sans,system-ui);letter-spacing:.04em;opacity:0;transition:opacity .4s;white-space:nowrap}
.fv-focus{box-shadow:0 0 0 2px #f2c14e,0 0 10px rgba(242,193,78,.6)!important;border-radius:8px}
@media (max-height:480px){.tac-btn{width:44px;height:52px}.tac-btn svg.tac-r{width:44px;height:44px}.tac-btn .tac-disc,.tac-btn .tac-s{width:36px;height:36px}.tac-btn .tac-n{display:none}.tac-btn{height:46px}}
@media (prefers-reduced-motion:reduce){.tac-wb,.tac-wscrim,.tac-pop{animation:none}}
`;

export function createTactics(fv) {
  if (!document.getElementById('tac-css')) { const st = document.createElement('style'); st.id = 'tac-css'; st.textContent = CSS; document.head.append(st); }
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const host = fv.hud;
  const cv = el('canvas', 'tac-cv'); cv.setAttribute('aria-hidden', 'true'); const g = cv.getContext('2d');
  const danger = el('div', 'tac-danger');
  host.prepend(danger, cv);
  const dock = el('div', 'tac-dock'), chips = el('div', 'tac-chips'), row = el('div', 'tac-row'), tip = el('div', 'tac-tip'), orders = el('button', 'tac-orders');
  dock.append(chips, row); host.append(dock, orders, tip);
  orders.type = 'button'; orders.setAttribute('aria-label', 'Orders'); orders.title = 'Orders (long press the arena)';
  const hint = el('div', 'tac-hint'); host.append(hint);
  const T = { sel: null, w: 0, h: 0, dpr: 1, btns: {}, wheel: null, links: true, teles: [], atk: new Map(), key: '', hintDone: false, F: null, active: false, wb: [] };
  const V = new THREE.Vector3(), V2 = new THREE.Vector3();

  // ------------------------------------------------------------------ dock buttons
  const CMD = () => (L() && L().CMD) || {};
  function mkRing(c) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 44 44'); s.setAttribute('class', 'tac-r');
    s.innerHTML = '<circle cx="22" cy="22" r="20" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="4"/><circle class="cd" cx="22" cy="22" r="20" fill="none" stroke="' + c + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + CIRC.toFixed(2) + '" stroke-dashoffset="0"/>';
    return s;
  }
  const cmdText = (k) => { const C = CMD()[k] || {}; return { n: C.n || k, gain: C.gain || '', cost: C.cost || '', c: C.c || '#f2c14e' }; };
  function buildDock() {
    row.innerHTML = ''; chips.innerHTML = ''; T.btns = {};
    KEYS.forEach((k, i) => {
      const C = cmdText(k), b = el('button', 'tac-btn'); b.type = 'button'; b.dataset.cmd = k; b.style.setProperty('--c', C.c);
      b.setAttribute('aria-label', `${C.n} (key ${i + 1}). Gain: ${C.gain}. Cost: ${C.cost}.`);
      const ring = mkRing(C.c), disc = el('span', 'tac-disc'); disc.innerHTML = svg(k, 22);
      b.append(ring, disc, el('span', 'tac-k', String(i + 1)), el('span', 'tac-n', C.n), el('span', 'tac-s'));
      b.onclick = () => { T.run(k); };
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showTip(k, b); }); b.addEventListener('pointerleave', hideTip); b.addEventListener('focus', () => showTip(k, b)); b.addEventListener('blur', hideTip);
      let lp = 0; b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') lp = setTimeout(() => { showTip(k, b); lp = -1; }, 420); }); const clr = () => { if (lp > 0) clearTimeout(lp); }; b.addEventListener('pointerup', () => { clr(); setTimeout(hideTip, 1800); }); b.addEventListener('pointercancel', clr);
      b.addEventListener('click', (e) => { if (lp === -1) { e.stopImmediatePropagation(); lp = 0; } }, true);
      row.append(b); T.btns[k] = { b, ring: ring.querySelector('.cd'), s: b.querySelector('.tac-s'), key: '' };
    });
  }
  function showTip(k, anchor) {
    const C = cmdText(k); tip.innerHTML = ''; const t = el('b', '', C.n), g1 = el('i', 'g', '+ ' + C.gain), c1 = el('i', 'c', '- ' + C.cost); tip.append(t, g1, c1); tip.style.display = 'block';
    const r = anchor.getBoundingClientRect(), hr = host.getBoundingClientRect(); tip.style.left = clamp(r.left - hr.left, 6, Math.max(6, hr.width - 310)) + 'px'; tip.style.bottom = (hr.bottom - r.top + 6) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }
  buildDock();
  orders.innerHTML = '<span class="tac-disc" style="position:absolute;left:3px;top:3px;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%,#4a3f6a,#241d3a);box-shadow:inset 0 0 0 2px #f2c14e,0 2px 0 rgba(0,0,0,.45)">' + svg('orders', 26) + '</span><span class="tac-n" style="position:absolute;left:-4px;right:-4px;bottom:0;text-align:center;font:800 10px/1 var(--lx-sans,system-ui);text-shadow:0 1px 2px #000">Orders</span>';
  orders.onclick = () => { if (T.wheel) closeWheel(); else openWheel(host.clientWidth / 2, host.clientHeight * 0.52, { tap: true }); };

  const phone = () => host.clientWidth < 700 || host.clientHeight < 520;
  function layout() { const ph = phone(); dock.style.display = !T.active || ph ? 'none' : ''; orders.style.display = !T.active || !ph ? 'none' : ''; }

  // ------------------------------------------------------------------ state helpers
  const allies = () => (T.F ? T.F.units.filter((u) => u.side === 'A' && !u.down && !u.beast) : []);
  const foes = () => (T.F ? T.F.units.filter((u) => u.side === 'B' && !u.down) : []);
  const selUnit = () => { const F = T.F; if (!F) return null; let u = F.units.find((x) => x.id === T.sel && !x.down); if (!u) { u = allies()[0] || null; T.sel = u ? u.id : null; } return u; };
  const stateOf = (k) => { // {st:'ready|cd|on|na', frac:0..1 remaining, secs}
    const F = T.F, C = CMD()[k]; if (!F || !C) return { st: 'na', frac: 0, secs: 0 };
    if (C.stance) { const u = selUnit(); if (!u) return { st: 'na', frac: 0, secs: 0 }; const on = L().stanceOf(u) === k; if (on) { const s = u.s[k === 'guard' ? 'gstance' : k]; return { st: 'on', frac: s ? clamp(s.t / C.dur, 0, 1) : 0, secs: s ? s.t : 0, on: true }; } const cd = u.cmdCd || 0; return cd > 0 ? { st: 'cd', frac: clamp(cd / C.cd, 0, 1), secs: cd } : { st: 'ready', frac: 0, secs: 0 }; }
    const cd = (F.cmd && F.cmd[k]) || 0;
    if (k === 'swap' && (allies().length < 2 || foes().length < 2)) return { st: 'na', frac: 0, secs: 0 };
    return cd > 0 ? { st: 'cd', frac: clamp(cd / C.cd, 0, 1), secs: cd } : { st: 'ready', frac: 0, secs: 0 };
  };
  function paintBtn(o, st) {
    const key = st.st + ':' + Math.round(st.frac * 120) + ':' + Math.ceil(st.secs); if (o.key === key) return; o.key = key;
    o.b.dataset.st = st.st; o.ring.setAttribute('stroke-dashoffset', (CIRC * (st.st === 'on' ? 1 - st.frac : st.st === 'cd' ? st.frac : 0)).toFixed(1));
    o.ring.setAttribute('stroke', st.st === 'on' ? '#f2c14e' : st.st === 'cd' ? '#8a8aa0' : st.st === 'na' ? '#555' : '#f2c14e');
    if (o.s) o.s.textContent = st.st === 'cd' || st.st === 'on' ? String(Math.ceil(st.secs)) : '';
  }
  function chipsRefresh() {
    const al = T.F ? T.F.units.filter((u) => u.side === 'A' && !u.beast) : []; const key = al.map((u) => u.id + (u.down ? 'd' : '') + (L().stanceOf(u) || '') + (T.sel === u.id ? 's' : '')).join('|');
    if (key === T.key) return; T.key = key; chips.innerHTML = '';
    if (al.length < 2) return;
    al.forEach((u) => { const b = el('button', 'tac-chip'); b.type = 'button'; b.setAttribute('aria-pressed', T.sel === u.id ? 'true' : 'false'); b.dataset.down = u.down ? '1' : '0'; b.textContent = u.name; const st = L().stanceOf(u); if (st) b.append(el('small', '', CMD()[st].n)); b.setAttribute('aria-label', 'Give orders to ' + u.name); b.onclick = () => { if (!u.down) { T.sel = u.id; fv.audio.sfx('uiTap', { gain: 0.4 }); T.key = ''; } }; chips.append(b); });
  }

  // ------------------------------------------------------------------ running an order
  T.run = (k) => {
    const F = T.F; if (!F || fv.replaying || !fv.canOrder()) return false; const C = CMD()[k]; if (!C) return false;
    let r; if (C.stance) { const u = selUnit(); if (!u) return false; const on = L().stanceOf(u) === k; r = fv.command('stance', u.id, on ? 'none' : k); } else r = fv.command(k, 'A');
    const o = T.btns[k]; if (o && r === true) { o.b.classList.remove('tac-pop'); void o.b.offsetWidth; o.b.classList.add('tac-pop'); }
    return r;
  };
  T.hotkey = (n) => { const k = KEYS[n - 1]; if (!k) return false; if (T.wheel) closeWheel(); return T.run(k); };
  T.selectUnit = (id) => { const u = T.F && T.F.units.find((x) => x.id === id && !x.down && x.side === 'A'); if (!u || !T.active || u.id === T.sel) return; T.sel = u.id; T.key = ''; fv.audio.sfx('uiTap', { gain: 0.4 }); };
  T.cycleSel = () => { const al = allies(); if (al.length < 2) return; const i = al.findIndex((u) => u.id === T.sel); T.sel = al[(i + 1) % al.length].id; T.key = ''; fv.audio.sfx('uiTap', { gain: 0.4 }); };
  T.cycleFocus = () => { const f = foes(); if (!f.length) return; const cur = T.F.foc.A, i = f.findIndex((u) => u.id === cur); fv.focusUnit(f[(i + 1) % f.length].id, true); };

  // ------------------------------------------------------------------ radial wheel
  function closeWheel() { if (!T.wheel) return; T.wheel.scrim.remove(); T.wheel.root.remove(); T.wheel = null; fv.tacSlow = 1; }
  function openWheel(px, py, o = {}) {
    if (T.wheel || !T.active || !fv.canOrder()) return null; const hw = host.clientWidth, hh = host.clientHeight, mini = Math.min(hw, hh), R = clamp(mini * 0.27, 62, 98), pad = R + 40;
    const cx = clamp(px, pad, hw - pad), cy = clamp(py, pad + 40, hh - pad - 20);
    const scrim = el('div', 'tac-wscrim'); scrim.style.setProperty('--wx', cx + 'px'); scrim.style.setProperty('--wy', cy + 'px'); if (o.tap) scrim.dataset.tap = '1';
    const root = el('div', 'tac-wheel'); root.style.left = cx + 'px'; root.style.top = cy + 'px';
    const card = el('div', 'tac-wc'); root.append(card); const above = cy - R - 40 > 120; card.style.transform = above ? 'translate(-50%,-100%)' : 'translate(-50%,0)'; card.style.top = (above ? -(R + 44) : R + 44) + 'px';
    const u0 = o.unit ? T.F.units.find((x) => x.id === o.unit && !x.down) : null; if (u0) T.sel = u0.id; T.key = '';
    const W = { root, scrim, cx, cy, R, hot: -1, items: [], card, fromPress: !o.tap, hx: px, hy: py };
    KEYS.forEach((k, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 3, C = cmdText(k), b = el('button', 'tac-wb'); b.type = 'button'; b.style.left = Math.cos(a) * R + 'px'; b.style.top = Math.sin(a) * R + 'px'; b.style.setProperty('--c', C.c); b.style.animationDelay = i * 14 + 'ms';
      b.setAttribute('aria-label', `${C.n}. Gain: ${C.gain}. Cost: ${C.cost}.`);
      b.append(mkRing(C.c), el('span', '', ''), el('span', 'tac-k', String(i + 1)), el('span', '', C.n)); b.children[1].innerHTML = svg(k, 22);
      b.onclick = (e) => { e.stopPropagation(); T.run(k); closeWheel(); };
      b.addEventListener('pointerenter', () => hot(i)); W.items.push({ b, ring: b.querySelector('.cd'), key: '' }); root.append(b);
    });
    scrim.addEventListener('pointerdown', () => closeWheel());
    host.append(scrim, root); T.wheel = W; fv.tacSlow = 0.25; fv.audio.sfx('uiTap', { gain: 0.5 }); wheelCard(-1); refreshWheel(); return W;
  }
  function wheelCard(i) {
    const W = T.wheel; if (!W) return; const u = selUnit(); W.card.innerHTML = '';
    if (i < 0) { W.card.append(el('b', '', u ? u.name : 'Orders'), el('i', '', 'Drag to an order and release'), el('i', '', 'Time slows while you decide')); return; }
    const k = KEYS[i], C = cmdText(k), C0 = CMD()[k] || {}; W.card.append(el('b', '', C.n + (C0.stance && u ? ' - ' + u.name : '')), el('i', 'g', '+ ' + C.gain), el('i', 'c', '- ' + C.cost));
  }
  function hot(i) { const W = T.wheel; if (!W || W.hot === i) return; W.hot = i; W.items.forEach((o, j) => { o.b.dataset.hot = j === i ? '1' : '0'; }); wheelCard(i); if (i >= 0) fv.audio.sfx('uiTap', { gain: 0.25, pitch: 1.3 }); }
  function refreshWheel() { const W = T.wheel; if (!W) return; KEYS.forEach((k, i) => { const o = W.items[i], st = stateOf(k), key = st.st + ':' + Math.round(st.frac * 100) + ':' + Math.ceil(st.secs); if (o.key === key) return; o.key = key; o.b.dataset.st = st.st; o.ring.setAttribute('stroke-dashoffset', (CIRC * (st.st === 'on' ? 1 - st.frac : st.st === 'cd' ? st.frac : 0)).toFixed(1)); o.ring.setAttribute('stroke', st.st === 'cd' ? '#8a8aa0' : '#f2c14e'); }); }
  /** hover from a captured pointer (hold, drag, release) */
  function wheelMove(x, y) { const W = T.wheel; if (!W) return; const r = host.getBoundingClientRect(), dx = x - r.left - W.cx, dy = y - r.top - W.cy, d = Math.hypot(dx, dy); if (d < 30) { hot(-1); return; } let a = Math.atan2(dy, dx) + Math.PI / 2; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); hot(Math.round(a / (Math.PI / 3)) % 6); }
  function wheelRelease() { const W = T.wheel; if (!W) return false; if (W.hot >= 0) { const k = KEYS[W.hot]; T.run(k); closeWheel(); return true; } W.scrim.dataset.tap = '1'; return false; }

  // ------------------------------------------------------------------ canvas input: tap an enemy (focus), tap an ally (select), long press (wheel)
  const dom = fv.renderer.domElement; let press = null;
  const screenOf = (x, y, z, out) => { V.set(x, y, z).project(fv.camera); out.x = (V.x * 0.5 + 0.5) * T.w; out.y = (-V.y * 0.5 + 0.5) * T.h; out.z = V.z; return V.z < 1; };
  function pickUnit(cx, cy) {
    const r = dom.getBoundingClientRect(), x = cx - r.left, y = cy - r.top; let best = null, bd = 1e9; const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
    for (const f of fv.fm.values()) { const u = f.u; if (u.down) continue; const X = f.rx ?? u.x, Z = f.ry ?? u.y; if (!screenOf(X, 0.1, Z, a) || !screenOf(X, (f.rig.nameH || 2) * 0.9, Z, b)) continue;
      const hgt = Math.max(30, Math.abs(a.y - b.y)), ex = Math.max(34, hgt * 0.34), vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1, t = clamp(((x - a.x) * vx + (y - a.y) * vy) / l2, 0, 1), px = a.x + vx * t, py = a.y + vy * t, d = Math.hypot(x - px, y - py);
      if (d < ex && d < bd) { bd = d; best = u; } }
    return best;
  }
  dom.addEventListener('contextmenu', (e) => { if (T.active) e.preventDefault(); });
  dom.addEventListener('pointerdown', (e) => {
    if (!T.active || fv.replaying || !fv.canOrder() || e.button > 0 || T.wheel) return;
    const p = press = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), moved: false, open: false, timer: 0 };
    try { dom.setPointerCapture(e.pointerId); } catch (er) { /* capture is optional */ }
    p.timer = setTimeout(() => { if (press !== p || p.moved) return; const u = pickUnit(p.x, p.y); const r = host.getBoundingClientRect(); p.open = !!openWheel(p.x - r.left, p.y - r.top, { unit: u && u.side === 'A' ? u.id : null }); if (p.open) { try { navigator.vibrate && navigator.vibrate(12); } catch (er) { /* no haptics */ } } }, 420);
  });
  dom.addEventListener('pointermove', (e) => { const p = press; if (!p || e.pointerId !== p.id) return; if (p.open) { wheelMove(e.clientX, e.clientY); return; } if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 9) { p.moved = true; clearTimeout(p.timer); } });
  const end = (e, cancel) => {
    const p = press; if (!p || e.pointerId !== p.id) return; press = null; clearTimeout(p.timer); try { dom.releasePointerCapture(e.pointerId); } catch (er) { /* released */ }
    if (p.open) { if (cancel) closeWheel(); else wheelRelease(); return; }
    if (cancel || p.moved || !T.active || fv.replaying || performance.now() - p.t > 600) return;
    const u = pickUnit(e.clientX, e.clientY); if (!u) return;
    if (u.side === 'B') fv.focusUnit(u.id); else if (!u.beast) { T.sel = u.id; T.key = ''; fv.audio.sfx('uiTap', { gain: 0.5 }); fv.banner(u.name + ': orders', 'info'); }
  };
  dom.addEventListener('pointerup', (e) => end(e, false)); dom.addEventListener('pointercancel', (e) => end(e, true));

  // ------------------------------------------------------------------ overlay drawing
  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1, dpr = Math.min(window.devicePixelRatio || 1, fv.tier === 'low' ? 1.25 : 2); if (w === T.w && h === T.h && dpr === T.dpr) return;
    T.w = w; T.h = h; T.dpr = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); layout();
  }
  const P3 = { x: 0, y: 0, z: 0 };
  function ringPath(x, z, r, a0 = 0, a1 = Math.PI * 2, n = 26) { // projected ground circle (arc) as a canvas path; returns false when behind the camera
    g.beginPath(); let started = false;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; if (!screenOf(x + Math.cos(a) * r, 0.04, z + Math.sin(a) * r, P3)) return false; if (!started) { g.moveTo(P3.x, P3.y); started = true; } else g.lineTo(P3.x, P3.y); }
    return true;
  }
  const camDist = (x, z) => Math.hypot(fv.camera.position.x - x, fv.camera.position.y, fv.camera.position.z - z);
  function stroke(col, alpha, w, dash) { g.setLineDash(dash || []); g.lineWidth = w + 2.5; g.strokeStyle = 'rgba(20,12,24,' + (alpha * 0.45).toFixed(3) + ')'; g.stroke(); g.lineWidth = w; g.strokeStyle = 'rgba(' + col + ',' + alpha.toFixed(3) + ')'; g.stroke(); g.setLineDash([]); }
  function pos(f) { return { x: f.rx ?? f.u.x, z: f.ry ?? f.u.y }; }
  function drawFrame(F, t) {
    g.setTransform(T.dpr, 0, 0, T.dpr, 0, 0); g.clearRect(0, 0, T.w, T.h); g.lineCap = 'round'; g.lineJoin = 'round';
    const showAll = fv.phase === 'fight' || (fv.phase === 'outro' && fv.replaying); if (!showAll || fv.silent) return;
    const w = T.w, h = T.h, foc = F.foc.A, cam = fv.camera; const sel = T.active ? selUnit() : null;
    // telegraphs first (under everything)
    for (let i = T.teles.length - 1; i >= 0; i--) {
      const q = T.teles[i], p = (F.t - q.t0) / q.dur; if (p > 1.15 || p < -0.05) { if (p > 1.15 || F.t < q.t0 - 0.2) T.teles.splice(i, 1); continue; }
      const pp = clamp(p, 0, 1), pulse = 0.55 + 0.45 * Math.sin(t * 14), col = q.own ? '242,193,78' : '255,96,40', a = (0.5 + 0.4 * pulse) * (p > 1 ? 1 - (p - 1) / 0.15 : 1);
      if (q.line) { const ca = Math.cos(q.ang), sa = Math.sin(q.ang), hw = q.r, L2 = q.line, c = [[0, -hw], [L2, -hw], [L2, hw], [0, hw]].map(([ax, ay]) => [q.x + ca * ax - sa * ay, q.y + sa * ax + ca * ay]); g.beginPath(); let ok = true; c.forEach(([X, Z], k) => { if (!screenOf(X, 0.04, Z, P3)) ok = false; else if (k) g.lineTo(P3.x, P3.y); else g.moveTo(P3.x, P3.y); }); if (!ok) continue; g.closePath(); g.fillStyle = 'rgba(' + col + ',' + (0.1 + 0.28 * pp).toFixed(3) + ')'; g.fill(); stroke(col, a, 2.5, [9, 6]); }
      else if (ringPath(q.x, q.y, q.r)) { g.fillStyle = 'rgba(' + col + ',' + (0.1 + 0.3 * pp).toFixed(3) + ')'; g.fill(); stroke(col, a, 2.8, [8, 6]); ringPath(q.x, q.y, q.r * pp); stroke(col, a * 0.8, 2); }
      // anyone of ours standing in it gets a warning mark above the head
      for (const u of F.units) { if (u.down || u.side !== 'A') continue; const inside = q.line ? (() => { const dx = u.x - q.x, dy = u.y - q.y, ca = Math.cos(q.ang), sa = Math.sin(q.ang), lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca; return lx > -0.5 && lx < q.line + 0.5 && Math.abs(ly) < q.r + 0.4; })() : Math.hypot(u.x - q.x, u.y - q.y) < q.r + 0.4; if (!inside) continue; const f = fv.fm.get(u.id), pq = pos(f); if (screenOf(pq.x, (f.rig.nameH || 2) + 0.9, pq.z, P3)) { g.fillStyle = 'rgba(255,200,40,' + (0.7 + 0.3 * pulse).toFixed(2) + ')'; g.strokeStyle = 'rgba(30,10,10,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(P3.x, P3.y - 15); g.lineTo(P3.x + 13, P3.y + 9); g.lineTo(P3.x - 13, P3.y + 9); g.closePath(); g.stroke(); g.fill(); g.fillStyle = '#2a1008'; g.font = '900 13px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('!', P3.x, P3.y + 7); } }
    }
    // rings
    for (const f of fv.fm.values()) {
      const u = f.u; if (u.down) continue; const pq = pos(f), ally = u.side === 'A', col = ally ? ALLY : FOE, d = camDist(pq.x, pq.z), ws = clamp(15 / d, 0.6, 1.5), r = 0.62 * (u.sz || 1) * (f.rig.beastR ? clamp(f.rig.beastR / 0.6, 1, 2.2) : 1) + 0.22;
      if (ringPath(pq.x, pq.z, r)) stroke(col, 0.8, 2.6 * ws, ally ? null : [7, 5]);
      if (sel && u === sel && ally) { if (ringPath(pq.x, pq.z, r + 0.2)) stroke(GOLD, 0.95, 2.6 * ws); }
    }
    // links: who targets whom (option). A faint dashed line to the current target, a bright one for a swing in the last 0.5 s
    if (T.links) {
      for (const f of fv.fm.values()) {
        const u = f.u; if (u.down || !u.tgt) continue; const tf = fv.fm.get(u.tgt); if (!tf || tf.u.down) continue; const a = pos(f), b = pos(tf), col = u.side === 'A' ? ALLY : FOE;
        if (!screenOf(a.x, 0.05, a.z, P3)) continue; const x0 = P3.x, y0 = P3.y; if (!screenOf(b.x, 0.05, b.z, P3)) continue; const x1 = P3.x, y1 = P3.y; const hit = T.atk.get(u.id), age = hit && hit.dst === u.tgt ? t - hit.t : 9, hot = age < 0.5;
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, k = Math.min(1, 24 / len), sx = x0 + dx * k, sy = y0 + dy * k, ex = x1 - dx * k, ey = y1 - dy * k;
        if (len < 30) continue; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); stroke(col, hot ? 0.8 * (1 - age / 0.5) + 0.15 : 0.17, hot ? 2.2 : 1.4, hot ? null : [3, 6]);
        const ang = Math.atan2(dy, dx); g.fillStyle = 'rgba(' + col + ',' + (hot ? 0.9 : 0.28) + ')'; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(ang - 0.45) * 8, ey - Math.sin(ang - 0.45) * 8); g.lineTo(ex - Math.cos(ang + 0.45) * 8, ey - Math.sin(ang + 0.45) * 8); g.closePath(); g.fill();
      }
    }
    // focus target: rotating brackets on the sand and a chevron over the head
    const fu = foc && F.units.find((x) => x.id === foc && !x.down), swp = [];
    for (const u of F.units) if (!u.down && u.side === 'A' && u.swap) swp.push(u.swap.id);
    const marks = new Set(swp); if (fu) marks.add(fu.id);
    for (const id of marks) {
      const f = fv.fm.get(id); if (!f || f.u.down) continue; const pq = pos(f), d = camDist(pq.x, pq.z), ws = clamp(15 / d, 0.6, 1.5), r = 0.62 * (f.u.sz || 1) + 0.55, spin = t * 1.6, isFoc = fu && fu.id === id;
      for (let k = 0; k < 4; k++) { const a0 = spin + k * Math.PI / 2; if (ringPath(pq.x, pq.z, r, a0, a0 + 0.55, 8)) stroke(isFoc ? GOLD : '255,226,150', 0.95, 3.2 * ws); }
      if (screenOf(pq.x, (f.rig.nameH || 2.05) + 0.75, pq.z, P3)) { const bob = Math.sin(t * 6) * 3, s = 9 * clamp(15 / d, 0.8, 1.3); g.fillStyle = 'rgba(' + (isFoc ? GOLD : '255,226,150') + ',.98)'; g.strokeStyle = 'rgba(30,16,8,.9)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(P3.x, P3.y + bob); g.lineTo(P3.x + s, P3.y - s * 1.3 + bob); g.lineTo(P3.x - s, P3.y - s * 1.3 + bob); g.closePath(); g.stroke(); g.fill(); }
    }
    // off-screen arrows
    for (const f of fv.fm.values()) {
      const u = f.u; if (u.down) continue; const pq = pos(f); V.set(pq.x, 1.1, pq.z).project(cam); const behind = V.z > 1, sx = (V.x * 0.5 + 0.5) * w, sy = (-V.y * 0.5 + 0.5) * h;
      if (!behind && sx > 6 && sx < w - 6 && sy > 6 && sy < h - 6) continue;
      let dx = sx - w / 2, dy = sy - h / 2; if (behind) { dx = -dx; dy = -dy; } if (Math.abs(dx) + Math.abs(dy) < 1e-3) { dx = 0; dy = 1; }
      const mx = w / 2 - 28, my = h / 2 - 28, k = Math.min(mx / Math.max(1e-3, Math.abs(dx)), (my - 36) / Math.max(1e-3, Math.abs(dy))), x = w / 2 + dx * k, y = clamp(h / 2 + dy * k, 64, h - 120), ang = Math.atan2(dy, dx), col = u.side === 'A' ? ALLY : FOE;
      g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = 'rgba(' + col + ',.95)'; g.strokeStyle = 'rgba(20,12,24,.85)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(17, 0); g.lineTo(-3, -11); g.lineTo(-3, 11); g.closePath(); g.stroke(); g.fill(); g.restore();
      g.fillStyle = 'rgba(20,12,24,.85)'; g.beginPath(); g.arc(x - Math.cos(ang) * 14, y - Math.sin(ang) * 14, 11, 0, 7); g.fill(); g.fillStyle = 'rgb(' + col + ')'; g.font = '800 12px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(u.name || '?').charAt(0).toUpperCase(), x - Math.cos(ang) * 14, y - Math.sin(ang) * 14 + 1); g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - Math.cos(ang) * 14 - 11, y - Math.sin(ang) * 14 + 13, 22, 4); g.fillStyle = 'rgb(' + col + ')'; g.fillRect(x - Math.cos(ang) * 14 - 11, y - Math.sin(ang) * 14 + 13, 22 * clamp(u.hp / u.maxhp, 0, 1), 4);
    }
  }
  function updateDanger(F, t) {
    let lo = 1; for (const u of F.units) if (u.side === 'A' && !u.down && !u.beast) lo = Math.min(lo, u.hp / u.maxhp); const live = fv.phase === 'fight' && !F.done, v = live && lo < 0.34 ? (0.34 - lo) / 0.34 : 0;
    const o = v * (fv.feel && fv.feel.state && fv.feel.state.reducedMotion ? 0.6 : 0.55 + 0.25 * Math.sin(t * (3 + v * 3))); const s = (Math.round(o * 40) / 40).toFixed(3); if (T.dOp !== s) { T.dOp = s; danger.style.opacity = s; }
  }

  // ------------------------------------------------------------------ lifecycle
  T.start = (F, replaying) => {
    T.F = F; T.active = !replaying; T.teles.length = 0; T.atk.clear(); T.sel = null; T.key = ''; T.dOp = ''; closeWheel(); fv.tacSlow = 1; hideTip();
    const p = fv.readPrefs(); T.links = p.links !== false; buildDock(); resize(); layout();
    hint.style.opacity = 0; T.hintDone = false;
  };
  T.stop = () => { T.active = false; T.F = null; closeWheel(); layout(); g.clearRect(0, 0, T.w, T.h); danger.style.opacity = 0; hideTip(); };
  T.setLinks = (v) => { T.links = !!v; };
  T.resize = resize;
  T.avoidEls = () => (T.active ? [phone() ? orders : dock] : []);
  T.timeK = () => (T.wheel ? 0.25 : 1);
  T.onEvent = (e, F) => {
    if (e.k === 'atk' && e.src) T.atk.set(e.src, { dst: e.dst, t: fv.t });
    else if (e.k === 'tele') T.teles.push({ x: e.x, y: e.y, r: e.r, t0: F.t, dur: e.t || 1, line: e.len || 0, ang: e.ang || 0, own: !!(e.src && e.src[0] === 'A'), ult: e.ult });
    else if (e.k === 'down') { const u = F.units.find((x) => x.id === e.dst); if (u && u.id === T.sel) { T.sel = null; T.key = ''; } }
  };
  T.frame = (realDt, F, t) => {
    T.F = F; if (T.w !== host.clientWidth || T.h !== host.clientHeight) resize();
    drawFrame(F, t); updateDanger(F, t);
    if (!T.active) return;
    const fight = fv.phase === 'fight' && !F.done; if (dock.style.visibility !== (fight ? 'visible' : 'hidden')) { dock.style.visibility = orders.style.visibility = fight ? 'visible' : 'hidden'; if (!fight) closeWheel(); }
    if (!fight) return;
    if (!T.hintDone && fv.phaseT > 1.2) { T.hintDone = true; hint.textContent = phone() ? 'Tap an enemy to focus. Hold the arena for orders.' : 'Orders: keys 1 to 6. Click an enemy to focus. Tab picks a fighter.'; hint.style.opacity = 1; setTimeout(() => { hint.style.opacity = 0; }, 5200); }
    selUnit(); chipsRefresh();
    if (!phone() || T.wheel) { for (const k of KEYS) paintBtn(T.btns[k], stateOf(k)); }
    if (T.wheel) refreshWheel();
  };
  T.dispose = () => { closeWheel(); cv.remove(); danger.remove(); dock.remove(); orders.remove(); tip.remove(); hint.remove(); };
  window.addEventListener('resize', () => { T.resize(); layout(); });
  T.closeWheel = closeWheel; T.wheelOpen = () => !!T.wheel;
  layout();
  return T;
}
