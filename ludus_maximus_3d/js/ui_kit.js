// Ludus Maximus 3D UI reference helpers. Pure DOM + inline SVG, no deps. Pair with ui_ref.css.
// Everything returns an HTMLElement (with small control methods attached as properties).
const SVGNS = 'http://www.w3.org/2000/svg';
export const reduced = () => (typeof document !== 'undefined' && document.body && document.body.classList.contains('lx-reduce-motion')) || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

export function h(tag, cls, kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of [].concat(kids ?? [])) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

// ---------- icons (24x24 viewBox, stroke = currentColor, fill via classes) ----------
const P = {
  // ultimates (ids match core/data.js D.ULTS)
  pulverize: '<path d="M4 20h16M7 20l2-6h6l2 6M12 3v8M8 7l4 4 4-4"/><path d="M3 16l3-1M21 16l-3-1" />',
  hookshot: '<path d="M4 20c4 0 4-6 8-6s4 4 6-1"/><path d="M18 13l3-3-3-1M18 13l-1-4" /><circle cx="4" cy="20" r="1.5"/>',
  bladedance: '<path d="M4 20L16 4M16 4l3 3M20 20L8 4M8 4L5 7"/><path d="M12 12l1 1"/>',
  skewer: '<path d="M3 21L19 5"/><path d="M19 5l-1 5M19 5l-5 1M16 8l5-5"/><path d="M5 17l2 2"/>',
  tornado: '<path d="M5 5h14M7 9h10M9 13h6M11 17h2"/><path d="M12 21v0"/>',
  unbreakable: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M12 8v6M9 11h6"/>',
  bloodrage: '<path d="M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 2 3 0z"/><path d="M12 13c1 1.5 2 2 2 3.5a2 2 0 0 1-4 0c0-1 1-1.5 2-3.5z"/>',
  meteor: '<circle cx="15" cy="15" r="4"/><path d="M12 12L3 3M11 15L4 10M15 11L10 4"/>',
  duststorm: '<path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  // ui
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  fame: '<path d="M12 21c-5-2-7-6-7-11M12 21c5-2 7-6 7-11M12 21V8"/><path d="M7 8c0-2 1-3 2-3 0 2-1 3-2 3zM17 8c0-2-1-3-2-3 0 2 1 3 2 3zM12 8c-1-1-1-3 0-4 1 1 1 3 0 4z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart: '<path d="M12 20S4 15 4 9.5A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 8 1.5C20 15 12 20 12 20z"/>',
  sword: '<path d="M5 19L17 7l3-3 0 3-3 3L7 21zM4 20l2 2M13 11l3 3"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
  ludus: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
  arena: '<ellipse cx="12" cy="12" rx="9" ry="6"/><path d="M5 9v6M9 7v10M15 7v10M19 9v6"/>',
  roster: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6M16 6a3 3 0 0 1 0 6M18 20c0-3-1.5-4.500-3-5.500"/>',
  market: '<path d="M4 9l2-5h12l2 5M4 9h16v3a3 3 0 0 1-5 2 3 3 0 0 1-6 0 3 3 0 0 1-5-2zM6 15v5h12v-5"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1H9v11a2 2 0 0 1-4 0V6a2 2 0 0 1 2-2zM9 10h8M9 14h6"/>',
  skull: '<path d="M5 11a7 7 0 0 1 14 0c0 2-1 3-2 4v3H7v-3c-1-1-2-2-2-4zM9.500 11h.01M14.500 11h.01M10 18v-2M14 18v-2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  hammer: '<path d="M14 4l6 6-2 2-1-1-3 3-4-4 3-3-1-1z"/><path d="M11 11L4 18l2 2 7-7"/>', // MOVE
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="1.500"/><path d="M8.500 11V8a3.500 3.500 0 0 1 7 0v3"/>',
};
export const ICON_NAMES = Object.keys(P);
export function icon(name, size = 24, cls = '') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('class', 'lx-ico ' + cls); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || P.star; return s;
}

// Greek key strip as inline SVG data URI (used by CSS var --lx-key too); also as element for custom use.
export function laurel(cls = '') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 120 24'); s.setAttribute('class', 'lx-laurel ' + cls); s.setAttribute('aria-hidden', 'true');
  let leaves = '';
  for (let i = 0; i < 6; i++) {
    const x = 50 - i * 8, y = 18 - i * 1.5, r = -30 - i * 4;
    leaves += `<ellipse cx="${x}" cy="${y}" rx="6" ry="2.6" transform="rotate(${r} ${x} ${y})"/>`;
    const x2 = 70 + i * 8;
    leaves += `<ellipse cx="${x2}" cy="${y}" rx="6" ry="2.6" transform="rotate(${180 - r} ${x2} ${y})"/>`;
  }
  s.innerHTML = `<g fill="currentColor">${leaves}</g><circle cx="60" cy="19" r="2.500" fill="currentColor"/>`;
  return s;
}

// ---------- panel ----------
// variant: 'marble' | 'bronze' | 'parchment' | 'dark'. key: greek-key border strip.
export function panel({ title, variant = 'bronze', key = true, kids, cls = '' } = {}) {
  const el = h('section', `lx-panel lx-${variant} ${key ? 'lx-keyed' : ''} ${cls}`);
  if (title) {
    const t = h('header', 'lx-panel-head', [h('span', 'lx-rule'), h('h3', 'lx-title lx-engrave', title), h('span', 'lx-rule')]);
    el.append(t);
  }
  const body = h('div', 'lx-panel-body', kids);
  el.append(body); el.body = body; return el;
}

// ---------- button ----------
// variant: 'gold' (primary) | 'bronze' | 'ghost' | 'danger'. Press feel in CSS; haptic if available.
export function button({ label, icon: ic, variant = 'bronze', onClick, disabled = false, block = false, sub } = {}) {
  const b = h('button', `lx-btn lx-btn-${variant} ${block ? 'lx-block' : ''}`);
  b.type = 'button'; b.disabled = disabled;
  if (ic) b.append(icon(ic, 20));
  const t = h('span', 'lx-btn-label', label); b.append(t);
  if (sub) { b.append(h('small', 'lx-btn-sub', sub)); b.classList.add('lx-has-sub'); }
  b.addEventListener('click', (e) => { try { navigator.vibrate?.(8); } catch (_) {} onClick?.(e); });
  return b;
}
export function iconButton(name, label, onClick) {
  const b = h('button', 'lx-btn lx-btn-bronze lx-iconbtn'); b.type = 'button'; b.setAttribute('aria-label', label);
  b.append(icon(name, 22)); b.addEventListener('click', onClick || (() => {})); return b;
}

// ---------- bar (hp / stamina / xp) with segment ticks and damage ghost ----------
// kind: 'hp' | 'stam' | 'xp' | 'foe'. segments: tick every N units (e.g. 25 -> ticks per 25 hp).
export function bar({ value = 1, max = 1, kind = 'hp', segments = 0, label = '', height = 14, cls = '', name = '' } = {}) {
  const el = h('div', `lx-bar lx-bar-${kind} ${cls}`);
  el.style.setProperty('--lx-bar-h', height + 'px');
  const ghost = h('i', 'lx-bar-ghost'), fill = h('i', 'lx-bar-fill'), ticks = h('i', 'lx-bar-ticks'), txt = h('span', 'lx-bar-txt');
  el.append(ghost, fill, ticks, txt);
  let last = value, gT = 0;
  el.set = (v, m = max) => {
    max = m; const f = Math.max(0, Math.min(1, v / max));
    fill.style.transform = `scaleX(${f})`;
    if (v < last) { // damage: ghost holds then drains
      clearTimeout(gT); ghost.style.transitionDuration = '0s';
      gT = setTimeout(() => { ghost.style.transitionDuration = ''; ghost.style.transform = `scaleX(${f})`; }, reduced() ? 0 : 380);
      el.classList.remove('lx-hit'); void el.offsetWidth; el.classList.add('lx-hit');
    } else { ghost.style.transitionDuration = '0s'; ghost.style.transform = `scaleX(${f})`; }
    last = v; txt.textContent = label === 'num' ? `${Math.ceil(v)} / ${Math.ceil(max)}` : label;
    el.setAttribute('aria-valuenow', Math.round(v));
  };
  if (segments) { el.style.setProperty('--lx-seg', (100 * segments / max) + '%'); el.classList.add('lx-seg'); }
  el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', Math.round(max)); el.setAttribute('aria-label', name || { hp: 'Health', stam: 'Stamina', xp: 'Experience' }[kind] || 'Progress'); el.set(value, max);
  ghost.style.transitionDuration = '0s'; return el;
}

// ---------- stat bar row (training stats) ----------
export function statRow({ name, value, max = 100, bonus = 0, kind = 'xp' }) {
  const r = h('div', 'lx-stat');
  const b = bar({ value, max, kind, height: 8 });
  r.append(h('span', 'lx-stat-n', name), b, h('b', 'lx-stat-v lx-num', bonus ? `${value}+${bonus}` : value));
  r.set = (v) => { b.set(v, max); r.querySelector('.lx-stat-v').textContent = v; }; return r;
}

// ---------- stars + rarity ----------
export function stars(n, max = 5) {
  const el = h('span', 'lx-stars'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${n} of ${max} stars`);
  for (let i = 0; i < max; i++) { const s = icon('star', 16, i < n ? 'on' : 'off'); el.append(s); }
  return el;
}
export const RARITY = ['common', 'fine', 'rare', 'epic', 'legendary'];
export function rarityFrame(rarity = 'common', child, size = 56) {
  const f = h('div', `lx-frame lx-r-${rarity}`, h('div', 'lx-frame-in', child));
  f.style.setProperty('--lx-fs', size + 'px'); f.setAttribute('data-rarity', rarity); return f;
}

// ---------- nameplate (projected 3D -> 2D) ----------
// layer: a position:absolute; inset:0; pointer-events:none container over the canvas.
// plate.track(worldVec3, camera, w, h): works with any THREE.Vector3 (needs .clone().project(camera)); hides when behind camera / off-screen.
export function nameplate({ name, level = 1, hp = 1, maxHp = 1, team = 'ally', rank = 0 } = {}) {
  const el = h('div', `lx-plate lx-team-${team}`);
  const hb = bar({ value: hp, max: maxHp, kind: team === 'foe' ? 'foe' : 'hp', segments: Math.max(1, maxHp / 4), height: 8, name: team === 'foe' ? 'Enemy health' : 'Health' });
  const tm = h('span', 'lx-plate-team', icon(team === 'foe' ? 'skull' : 'shield', 12)); tm.setAttribute('aria-hidden', 'true'); // QA: side is a shape and a dashed edge, not only a colour
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', `${name}, level ${level}, ${team === 'foe' ? 'enemy' : 'your fighter'}`);
  el.append(h('div', 'lx-plate-top', [tm, h('span', 'lx-lvl lx-num', level), h('span', 'lx-plate-name', name)]), hb);
  if (rank) el.append(stars(rank, 5));
  el.hp = hb;
  el.place = (x, y, vis = true) => { el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`; el.style.visibility = vis ? '' : 'hidden'; };
  el.track = (v3, camera, w, hh, lift = 0) => {
    const p = v3.clone(); p.y += lift; p.project(camera);
    const vis = p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15;
    el.place((p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * hh, vis);
    el.style.setProperty('--lx-s', Math.max(0.7, Math.min(1.1, 1.15 - p.z * 0.6)).toFixed(2)); // slight depth scale
  };
  return el;
}

// ---------- modal (bottom sheet on phones, centered dialog on desktop) ----------
// QA: one document keydown handler drives the TOP modal only: Escape closes just that one, Tab is trapped inside it, and arrow keys
// move focus spatially between its buttons (grids, tab rows, nav). Every dialog is labelled by its title.
const modalStack = []; let modalUid = 0, kbOn = false;
const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const shown = (e) => { if (!e.isConnected || e.closest('[hidden], [inert]')) return false; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
export function focusables(root) { return [...root.querySelectorAll(FOCUSABLE)].filter(shown); }
/** move focus from `cur` to the nearest focusable in a direction ('left'|'right'|'up'|'down'); returns the element or null */
export function spatialFocus(root, cur, dir) {
  const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2; let best = null, bs = Infinity;
  for (const e of focusables(root)) {
    if (e === cur || cur.contains(e) || e.contains(cur)) continue;
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - cx, dy = y - cy;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy, across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along < 4) continue; const sc = along + across * 2.5; if (sc < bs) { bs = sc; best = e; }
  }
  if (best) best.focus({ preventScroll: false });
  return best;
}
function onModalKey(e) {
  const top = modalStack[modalStack.length - 1]; if (e.defaultPrevented) return;
  if (!top) { // no dialog: arrow keys still walk the HUD buttons (top bar, advance button, bottom nav)
    const dir0 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key], a0 = document.activeElement, hud = a0 && a0.closest && a0.closest('.lx-hud');
    if (dir0 && hud && !e.altKey && !e.ctrlKey && !e.metaKey && spatialFocus(hud, a0, dir0)) e.preventDefault();
    return;
  }
  const el = top.el;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (top.closable === false) { top.sheet.classList.remove('lx-nudge'); void top.sheet.offsetWidth; top.sheet.classList.add('lx-nudge'); return; } top.close(); return; }
  if (e.key === 'Tab') {
    const f = focusables(el); if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!el.contains(a)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    return;
  }
  const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
  if (dir && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const a = document.activeElement; if (!a || !el.contains(a)) return;
    if (/^(textarea|select)$/i.test(a.tagName) || (a.tagName === 'INPUT' && a.type !== 'button' && a.type !== 'checkbox')) return; // text and sliders keep their own arrows
    if (spatialFocus(el, a, dir)) e.preventDefault();
  }
}
// opts: closable (default true; false hides the X and ignores Escape / scrim taps, the sheet says why via `why`), cls (extra sheet classes),
// dock 'low' (result dialogs: docked to the bottom, light dim, a 'See the finish' peek button collapses it so the scene shows).
export function modal({ title, body, actions = [], onClose, host = document.body, closable = true, why = '', cls = '', dock = '', peekLabel = 'See the finish' } = {}) {
  const scrim = h('div', 'lx-scrim' + (dock ? ' lx-dock-' + dock : '')); const sheet = panel({ title, variant: 'marble', cls: 'lx-sheet' + (cls ? ' ' + cls : '') });
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.tabIndex = -1;
  const tt = sheet.querySelector('.lx-title'); if (tt) { tt.id = 'lx-mt-' + (++modalUid); sheet.setAttribute('aria-labelledby', tt.id); } else sheet.setAttribute('aria-label', 'Dialog');
  const grab = h('i', 'lx-grab'); grab.setAttribute('aria-hidden', 'true'); sheet.prepend(grab);
  sheet.body.append(h('div', 'lx-sheet-scroll', body));
  if (actions.length) sheet.body.append(h('div', 'lx-actions', actions));
  const x = iconButton('close', 'Close', () => api.close()); x.classList.add('lx-sheet-x'); if (closable) sheet.append(x);
  if (!closable && why) sheet.body.insertBefore(h('p', 'lx-why', why), sheet.body.firstChild);
  let peeked = false, pk = null;
  if (dock) { // docked result dialogs: the scene (finisher, winner pose) stays visible; one tap folds the sheet down to its title bar
    pk = h('button', 'lx-peek'); pk.type = 'button'; pk.setAttribute('aria-expanded', 'true'); pk.append(icon('arena', 16), h('span', '', peekLabel));
    pk.addEventListener('click', () => { peeked = !peeked; scrim.classList.toggle('lx-peeked', peeked); pk.setAttribute('aria-expanded', String(!peeked)); pk.lastChild.textContent = peeked ? 'Back to results' : peekLabel; });
    sheet.append(pk);
  }
  scrim.append(sheet); host.append(scrim);
  const prevFocus = document.activeElement; let closed = false;
  const strips = [];
  const api = { el: scrim, closable, sheet,
    /** toast shown INSIDE this sheet (between the body and the action row): it can never cover the title or the text */
    strip(msg, { kind = 'info', ms = 2600, ico } = {}) {
      const t = h('div', `lx-toast lx-toast-${kind} lx-toast-strip`, [ico ? icon(ico, 18) : null, h('span', '', msg)]); t.setAttribute('role', 'status');
      const act = sheet.body.querySelector(':scope > .lx-actions'); sheet.body.insertBefore(t, act || null);
      while (sheet.body.querySelectorAll(':scope > .lx-toast-strip').length > 2) sheet.body.querySelector(':scope > .lx-toast-strip').remove();
      const rec = { t, msg, kind, ico, end: performance.now() + ms };
      rec.timer = setTimeout(() => { t.classList.add('lx-out'); setTimeout(() => { t.remove(); const i = strips.indexOf(rec); if (i >= 0) strips.splice(i, 1); }, reduced() ? 0 : 260); }, ms); strips.push(rec); return t;
    },
    close() {
    if (closed) return; closed = true; const i = modalStack.indexOf(api); if (i >= 0) modalStack.splice(i, 1);
    document.body.classList.toggle('lx-modal-open', modalStack.length > 0);
    for (const r of strips.splice(0)) { clearTimeout(r.timer); const left = r.end - performance.now(); if (left > 400) toast(r.msg, { kind: r.kind, ico: r.ico, ms: left }); } // a toast raised just before the sheet closed ("X joined your ludus") still gets seen
    scrim.classList.add('lx-out'); setTimeout(() => scrim.remove(), reduced() ? 0 : 220);
    const nextTop = modalStack[modalStack.length - 1]; if (nextTop) { if (!nextTop.el.contains(document.activeElement)) (focusables(nextTop.el)[0] || nextTop.el).focus?.({ preventScroll: true }); } else prevFocus?.focus?.({ preventScroll: true });
    onClose?.();
  } };
  modalStack.push(api); document.body.classList.add('lx-modal-open'); try { document.dispatchEvent(new CustomEvent('lx-modal-open')); } catch (e) { /* old engine */ }
  if (!kbOn) { kbOn = true; document.addEventListener('keydown', onModalKey, true); }
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim && closable && !dock) api.close(); });
  requestAnimationFrame(() => { scrim.classList.add('lx-in'); if (!scrim.contains(document.activeElement)) (sheet.querySelector('.lx-btn-gold') || x).focus?.({ preventScroll: true }); });
  return api;
}

// ---------- file download (save export, share) ----------
export function download(filename, text, type = 'application/json') {
  try { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return true; }
  catch (e) { return false; }
}

// ---------- toast ----------
let toastHost;
export function toast(msg, { kind = 'info', ms = 2600, ico, host = document.body } = {}) {
  // layering rule: toasts sit above the HUD and below every modal. While a modal is open the toast moves INTO its sheet (a strip above the buttons), so it never covers a title.
  const top = modalStack[modalStack.length - 1]; if (top && top.strip && host === document.body && top.el.isConnected) return top.strip(msg, { kind, ms, ico });
  if (!toastHost || !toastHost.isConnected) { toastHost = h('div', 'lx-toasts'); toastHost.setAttribute('role', 'status'); toastHost.setAttribute('aria-live', 'polite'); host.append(toastHost); }
  const t = h('div', `lx-toast lx-toast-${kind}`, [ico ? icon(ico, 20) : null, h('span', '', msg)]);
  toastHost.append(t); while (toastHost.children.length > 3) toastHost.firstChild.remove();
  setTimeout(() => { t.classList.add('lx-out'); setTimeout(() => t.remove(), reduced() ? 0 : 260); }, ms); return t;
}

// ---------- count-up (gold, fame) ----------
export function countUp(el, to, { dur = 900, from, fmt = (n) => Math.round(n).toLocaleString('en-US') } = {}) {
  from = from ?? (parseFloat(String(el.dataset.v ?? el.textContent).replace(/[^\d.-]/g, '')) || 0);
  el.dataset.v = to; cancelAnimationFrame(el._cu);
  if (reduced() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) el._cu = requestAnimationFrame(step); };
  el._cu = requestAnimationFrame(step);
  el.classList.remove('lx-bump'); void el.offsetWidth; el.classList.add('lx-bump');
}
// Counter chip: icon + fixed-width number. chip.add(n) counts up.
export function counter({ ico = 'coin', value = 0, kind = 'gold', label } = {}) {
  const c = h('div', `lx-counter lx-c-${kind}`); const n = h('b', 'lx-num', value.toLocaleString('en-US'));
  c.append(icon(ico, 20), n); if (label) c.setAttribute('aria-label', label);
  c.set = (v, o) => countUp(n, v, o); c.value = () => +n.dataset.v || value; return c;
}

// ---------- cooldown ring ultimate button ----------
// size ~72 phone (>=64 tap), 84 desktop. set(frac): 0 = ready, 1 = just cast. Auto-ready pulse.
export function cooldownRing({ ult = 'meteor', color = '#e8742a', size = 72, hotkey = '', onCast } = {}) {
  const b = h('button', 'lx-ult lx-ready'); b.type = 'button'; b.setAttribute('aria-label', 'Ultimate ' + ult);
  b.style.setProperty('--lx-us', size + 'px'); b.style.setProperty('--lx-uc', color);
  const R = 44, C = 2 * Math.PI * R;
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'lx-ult-ring');
  svg.innerHTML = `<circle class="lx-ult-track" cx="50" cy="50" r="${R}"/><circle class="lx-ult-prog" cx="50" cy="50" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 50 50)"/>`;
  const core = h('span', 'lx-ult-core', icon(ult, Math.round(size * 0.44)));
  const secs = h('span', 'lx-ult-sec lx-num'); b.append(svg, core, secs);
  if (hotkey) b.append(h('kbd', 'lx-ult-key', hotkey));
  const prog = svg.querySelector('.lx-ult-prog'); let was = 0;
  b.set = (frac, remainingSec) => {
    frac = Math.max(0, Math.min(1, frac)); prog.style.strokeDashoffset = String(C * frac);
    const ready = frac <= 0; b.classList.toggle('lx-ready', ready); b.disabled = !ready; b.setAttribute('aria-disabled', String(!ready));
    const left = Math.ceil(remainingSec ?? frac * 10);
    secs.textContent = ready ? 'GO' : left; // QA: readiness is shown as text and a pattern, never by colour alone
    b.setAttribute('aria-label', ready ? `Ultimate ${ult}, ready` : `Ultimate ${ult}, ready in ${left} seconds`);
    if (ready && was > 0) { b.classList.remove('lx-flash'); void b.offsetWidth; b.classList.add('lx-flash'); }
    was = frac;
  };
  b.addEventListener('click', () => { if (!b.disabled) { b.classList.remove('lx-cast'); void b.offsetWidth; b.classList.add('lx-cast'); onCast?.(ult); } });
  b.set(0); return b;
}

// ---------- tooltip (hover/focus on desktop, long-press on touch) ----------
export function tooltip(target, text, { title } = {}) {
  let tip, lp, auto;
  const hide = () => { clearTimeout(lp); clearTimeout(auto); if (tip) { tip.remove(); tip = null; } };
  const show = () => {
    hide(); const t = tip = h('div', 'lx-tip', [title ? h('b', '', title) : null, h('span', '', text)]); document.body.append(t);
    const r = target.getBoundingClientRect(), w = t.offsetWidth;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)); const above = r.top > t.offsetHeight + 16;
    t.style.left = x + 'px'; t.style.top = (above ? r.top - t.offsetHeight - 8 : r.bottom + 8) + 'px';
    requestAnimationFrame(() => { if (t.isConnected) t.classList.add('lx-in'); });
    auto = setTimeout(() => { if (tip === t) hide(); }, 6000); // never leave an orphan if the target is removed while hovered
  };
  target.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
  target.addEventListener('pointerleave', hide); target.addEventListener('focus', show); target.addEventListener('blur', hide);
  target.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') lp = setTimeout(show, 380); });
  target.addEventListener('pointerup', () => setTimeout(hide, 1400)); target.addEventListener('pointercancel', hide);
  return target;
}

// ---------- bottom nav ----------
export function nav(items, onSelect, active = 0) {
  const el = h('nav', 'lx-nav'); el.setAttribute('aria-label', 'Main');
  items.forEach((it, i) => {
    const b = h('button', 'lx-nav-i' + (i === active ? ' on' : ''), [icon(it.icon, 24), h('span', '', it.label)]); b.type = 'button';
    if (it.badge) b.append(h('i', 'lx-badge lx-num', it.badge));
    if (i === active) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => { el.querySelectorAll('.on').forEach((n) => { n.classList.remove('on'); n.removeAttribute('aria-current'); }); b.classList.add('on'); b.setAttribute('aria-current', 'page'); onSelect?.(it, i); });
    el.append(b);
  }); return el;
}

// ---------- fight overlays ----------
// VS splash: two plates slam in from the sides, VS seal pops, auto dismiss. Returns Promise.
export function vsSplash({ a, b, league = '', host = document.body, ms = 2200 } = {}) {
  const side = (g, cls) => h('div', `lx-vs-side ${cls}`, [h('div', 'lx-vs-name lx-engrave', g.name), h('div', 'lx-vs-sub', g.sub || ''), stars(g.stars ?? 0, 5)]);
  const el = h('div', 'lx-vs', [side(a, 'l'), h('div', 'lx-vs-seal', [h('span', 'lx-vs-v', 'VS')]), side(b, 'r'), league ? h('div', 'lx-vs-league', league) : null]);
  host.append(el);
  return new Promise((res) => setTimeout(() => { el.classList.add('lx-out'); setTimeout(() => { el.remove(); res(); }, reduced() ? 0 : 400); }, reduced() ? Math.min(ms, 1200) : ms));
}
// Combat banner: stacked event lines that slide in at top-center and fade (max 3). kind: 'crit'|'ult'|'kill'|'info'
export function banner(text, kind = 'info', host, ms = 2200) {
  host = host || document.querySelector('.lx-banners') || document.body.appendChild(h('div', 'lx-banners'));
  const e = h('div', `lx-banner lx-b-${kind}`, h('span', '', text)); host.append(e);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => { e.classList.add('lx-out'); setTimeout(() => e.remove(), reduced() ? 0 : 300); }, ms); return e;
}
// Level-up celebration: rays + laurel + big number. Returns the element (auto removes).
export function levelUp({ name, level, host = document.body, ms = 2600 } = {}) {
  const el = h('div', 'lx-lvlup', [h('i', 'lx-rays'), laurel('lx-lvlup-laurel'), h('div', 'lx-lvlup-kicker', 'Level up'),
    h('div', 'lx-lvlup-n lx-num', level), h('div', 'lx-lvlup-name lx-engrave', name)]);
  for (let i = 0; i < 14; i++) { const s = h('i', 'lx-spark'); s.style.setProperty('--a', (i * 360 / 14) + 'deg'); s.style.setProperty('--d', (90 + (i % 3) * 40) + 'px'); el.append(s); }
  host.append(el); setTimeout(() => { el.classList.add('lx-out'); setTimeout(() => el.remove(), 400); }, reduced() ? 1400 : ms); return el;
}

// ---------- label fitter (no mid-word breaks) ----------
// Buttons, tabs, chips and nav labels never break inside a word (CSS: overflow-wrap normal). When a single word is wider than its box the font shrinks in
// half-pixel steps down to 9px, then the tracking tightens; it never breaks. Runs on every sheet that opens, on DOM changes inside sheets and the HUD, on resize.
const FIT_SEL = '.lx-btn-label, .lx-nav-i span, .ax-tab span, .ax-tab, .lm-tab span, .lm-tab, .am-tab span, .am-tab, .lm-act, .ax-chipbtn span, .lx-ttl-tog, .lx-chip, .lm-chip, .lx-btn-sub, .lx-title';
export function fitLabels(root = document) {
  const els = root.querySelectorAll ? root.querySelectorAll(FIT_SEL) : [];
  for (const e of els) {
    if (!e.isConnected || !e.clientWidth) continue;
    const base = e.dataset.fit0 ? +e.dataset.fit0 : 0;
    if (base && e.dataset.fitW === String(e.clientWidth) && e.dataset.fitT === e.textContent) continue; // unchanged since the last fit
    if (base) { e.style.fontSize = ''; e.style.letterSpacing = ''; }
    if (e.scrollWidth <= e.clientWidth + 1) { delete e.dataset.fit0; continue; }
    const f0 = parseFloat(getComputedStyle(e).fontSize) || 14; let f = f0, n = 0;
    while (e.scrollWidth > e.clientWidth + 1 && f > 9 && n++ < 24) { f -= 0.5; e.style.fontSize = f + 'px'; }
    if (e.scrollWidth > e.clientWidth + 1) e.style.letterSpacing = '0';
    e.dataset.fit0 = String(f0); e.dataset.fitW = String(e.clientWidth); e.dataset.fitT = e.textContent;
  }
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  let ft = 0; const run = () => { ft = 0; try { fitLabels(document); } catch (e) { /* layout not ready */ } };
  const kick = () => { if (!ft) ft = setTimeout(run, 40); };
  const start = () => { try { new MutationObserver(kick).observe(document.body, { childList: true, subtree: true, characterData: true }); addEventListener('resize', kick); kick(); } catch (e) { /* ignore */ } };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
