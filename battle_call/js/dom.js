// Battle Call: tiny DOM toolkit. A morphing renderer (so a live update from the server never throws away a
// focused input, a scroll position or a running animation), inline icons, toasts and confetti.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------ morph */
const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-k') : null);

export function morph(parent, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  patchChildren(parent, t.content);
}

function patchChildren(a, b) {
  const aKids = [...a.childNodes], bKids = [...b.childNodes];
  const keyed = new Map(), loose = [];
  for (const n of aKids) { const k = keyOf(n); if (k) keyed.set(k, n); else loose.push(n); }
  let li = 0;
  const used = new Set(), next = [];
  for (const bn of bKids) {
    const k = keyOf(bn);
    let m = null;
    if (k) { m = keyed.get(k); if (m && (m.nodeName !== bn.nodeName || used.has(m))) m = null; }
    else if (li < loose.length) {
      const c = loose[li];
      if (c.nodeType === bn.nodeType && c.nodeName === bn.nodeName) { m = c; li++; } else li++;
    }
    if (m) { used.add(m); patchNode(m, bn); next.push(m); } else next.push(bn);
  }
  for (const n of aKids) if (!used.has(n)) n.remove();
  next.forEach((n, i) => { if (a.childNodes[i] !== n) a.insertBefore(n, a.childNodes[i] || null); });
}

function patchNode(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  const tag = a.nodeName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    // Form fields are uncontrolled: what the person typed is theirs. We only write a value when the template's own
    // value changed since the last render (e.g. a search box that mirrors state, or a setting pushed by the server).
    const isBox = tag === 'INPUT' && (a.type === 'checkbox' || a.type === 'radio');
    const tv = isBox ? b.hasAttribute('checked') : tag === 'TEXTAREA' ? b.textContent : b.getAttribute('value') ?? '';
    if (a._tv === undefined) a._tv = tv;
    else if (a._tv !== tv) {
      a._tv = tv;
      if (isBox) a.checked = tv;
      else if (a.value !== tv) a.value = tv;
    }
    return;
  }
  if (a.hasAttribute('data-static')) return;
  patchChildren(a, b);
}

/* ------------------------------------------------------------ icons (24px, stroke) */
const P = {
  loops: '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity=".18"/><circle cx="12" cy="12" r="9"/><path d="M8.2 12c0-1.6 1.2-2.7 2.6-2.7 2.2 0 2.4 5.4 4.6 5.4 1.4 0 2.4-1.100 2.4-2.700M15.800 12c0 1.600-1.200 2.700-2.600 2.700-2.200 0-2.400-5.400-4.600-5.400"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.700-5.800 7.500-5.800s6.700 1.800 7.500 5.800"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4.500c0 3 1.200 4.600 3.700 5M16 6h3.500c0 3-1.200 4.600-3.700 5M12 13v4M8.500 20h7M9.500 17h5"/>',
  bolt: '<path d="M13 2.500 5 13.500h6l-1 8 8-11h-6l1-8z"/>',
  hand: '<path d="M8 12V5.500a1.500 1.500 0 0 1 3 0V11m0-6.500v-1a1.500 1.500 0 0 1 3 0V11m0-5.500a1.500 1.500 0 0 1 3 0V13m0-4.500a1.500 1.500 0 0 1 3 0V15c0 4-2.500 6.500-6 6.500-3 0-4.200-1.600-6-4.500l-2-3.200a1.500 1.500 0 0 1 2.500-1.600L8 14"/>',
  board: '<path d="M4 20V12h4v8M10 20V5h4v15M16 20V9h4v11M3 20h18"/>',
  predict: '<path d="M4 6h10M4 12h7M4 18h5"/><path d="m15 16 2 2 4-5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.500"/><circle cx="9" cy="9" r="1.100" fill="currentColor"/><circle cx="15" cy="15" r="1.100" fill="currentColor"/><circle cx="15" cy="9" r="1.100" fill="currentColor"/><circle cx="9" cy="15" r="1.100" fill="currentColor"/>',
  live: '<circle cx="12" cy="12" r="2.200" fill="currentColor"/><path d="M7.500 7.500a6.400 6.400 0 0 0 0 9M16.500 7.500a6.400 6.400 0 0 1 0 9M4.600 4.600a10.500 10.500 0 0 0 0 14.800M19.400 4.600a10.500 10.500 0 0 1 0 14.800"/>',
  lock: '<rect x="5" y="11" width="14" height="9.500" rx="2.500"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  drag: '<circle cx="9" cy="6" r="1.300" fill="currentColor"/><circle cx="15" cy="6" r="1.300" fill="currentColor"/><circle cx="9" cy="12" r="1.300" fill="currentColor"/><circle cx="15" cy="12" r="1.300" fill="currentColor"/><circle cx="9" cy="18" r="1.300" fill="currentColor"/><circle cx="15" cy="18" r="1.300" fill="currentColor"/>',
  camera: '<path d="M4 8h3l1.500-2.500h7L17 8h3v11H4V8z"/><circle cx="12" cy="13" r="3.500"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.500v2.500H14zM18 14h2v2h-2zM14 18.500h2V20h-2zM17.500 17.500H20V20h-2.500z"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2.500v2.800M12 18.700v2.800M2.500 12h2.800M18.700 12h2.800M5.300 5.300l2 2M16.700 16.700l2 2M18.700 5.300l-2 2M7.300 16.700l-2 2"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.500"/><path d="M16 8V6.500A2.500 2.500 0 0 0 13.500 4h-7A2.500 2.500 0 0 0 4 6.500v7A2.500 2.500 0 0 0 6.500 16H8"/>',
  logout: '<path d="M10 4H6.500A2.500 2.500 0 0 0 4 6.500v11A2.500 2.500 0 0 0 6.500 20H10M15 8l4 4-4 4M19 12H9"/>',
  fire: '<path d="M12 21c4 0 6.500-2.600 6.500-6 0-3-2-4.800-3-7-1.500 1.200-2 2.500-2 4C13 9 12 5.500 9.500 3c.300 3.500-3.500 5.500-3.500 11 0 4 2.500 7 6 7z"/>',
  flag: '<path d="M5 21V4M5 5h13l-2.500 4L18 13H5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21M8.500 21h7"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2.500"/><path d="M8 21h8M12 17v4"/>',
  users: '<circle cx="9" cy="8.500" r="3.200"/><path d="M3 19.500c.6-3.400 3-5 6-5s5.400 1.600 6 5M16 5.500a3.200 3.200 0 0 1 0 6.200M18 14.800c1.800.6 2.800 2.200 3.200 4.700"/>',
  star: '<path d="m12 3 2.700 5.600 6.100.8-4.500 4.200 1.100 6.100L12 16.800 6.600 19.700l1.100-6.100L3.200 9.400l6.100-.8L12 3z"/>',
  undo: '<path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.500M12 7.800v.2"/>',
  download: '<path d="M12 4v11M7.500 11 12 15.500 16.500 11M5 20h14"/>',
  swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
  speaker: '<path d="M4 9.500v5h3.500L12 19V5L7.500 9.500H4zM15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18v-2.500H3zM12 6.500V20M12 6.500C12 4 10.500 3 9 3.500S7.500 6.500 12 6.500zm0 0c0-2.500 1.500-3.500 3-3S16.500 6.500 12 6.500z"/>',
  mega: '<path d="M4 10v4l12 5V5L4 10zM16 9.500a3 3 0 0 1 0 5M6.500 14.500 8 20"/>',
};
export const ic = (name, size = 20, cls = '') =>
  `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

/* ------------------------------------------------------------ toasts */
let toastBox;
export function toast(text, kind = '') {
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.id = 'toasts'; document.body.appendChild(toastBox); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = text;
  toastBox.appendChild(el);
  while (toastBox.children.length > 4) toastBox.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4000);
}

/* ------------------------------------------------------------ confetti */
let fx, fxc, parts = [], raf = 0;
export function confetti({ x = 0.5, y = 0.35, n = 90, colors, power = 1, gold = false } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!fx) {
    fx = document.createElement('canvas'); fx.id = 'fx'; document.body.appendChild(fx); fxc = fx.getContext('2d');
    const size = () => { fx.width = innerWidth * devicePixelRatio; fx.height = innerHeight * devicePixelRatio; };
    size(); addEventListener('resize', size);
  }
  const pal = colors || (gold ? ['#ffcf3d', '#ffe27a', '#ffb02e', '#fff2b8'] : ['#8b5cff', '#ff4fb0', '#ffcf3d', '#29e3a1', '#4ea1ff', '#ff5c5c']);
  const W = fx.width, H = fx.height, dpr = devicePixelRatio;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 9) * power * dpr;
    parts.push({ x: x * W, y: y * H, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6 * dpr, g: 0.22 * dpr, s: (4 + Math.random() * 7) * dpr,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: pal[(Math.random() * pal.length) | 0], life: 90 + Math.random() * 60, w: Math.random() < 0.5 });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  fxc.clearRect(0, 0, fx.width, fx.height);
  parts = parts.filter((p) => p.life > 0 && p.y < fx.height + 40);
  for (const p of parts) {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr; p.life--;
    fxc.save(); fxc.translate(p.x, p.y); fxc.rotate(p.r); fxc.globalAlpha = Math.min(1, p.life / 30); fxc.fillStyle = p.c;
    if (p.w) fxc.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); else { fxc.beginPath(); fxc.arc(0, 0, p.s / 3, 0, 7); fxc.fill(); }
    fxc.restore();
  }
  raf = parts.length ? requestAnimationFrame(tick) : 0;
  if (!raf) fxc.clearRect(0, 0, fx.width, fx.height);
}

/* ------------------------------------------------------------ number ticker */
export function runTickers(root = document) {
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = +el.getAttribute('data-count');
    const from = el._shown === undefined ? to : el._shown;
    if (from === to) { el.textContent = fmtN(to); el._shown = to; continue; }
    el._shown = to;
    const t0 = performance.now(), dur = Math.min(1200, 300 + Math.abs(to - from) * 2);
    cancelAnimationFrame(el._raf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtN(Math.round(from + (to - from) * e));
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
}
export const fmtN = (n) => Math.round(n).toLocaleString('en-US');

export const buzz = (ms = 18) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* */ } };

/** Hash a string to a hue so every beatboxer / player gets a stable colour. */
export const hue = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
