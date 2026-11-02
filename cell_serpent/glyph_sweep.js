// Round 9 (agent 19): one drawn glyph set for the hub's leftover emoji. The currencies (energy bolt, Beats coin,
// Sparkle star) and the small status symbols (lock, clock, shield, chest, gift, trophy, spin wheel, ticket) were
// system emoji that look different on every phone. Each becomes a flat inline SVG with the same dark outline as the
// baked icons. A MutationObserver swaps new emoji as screens redraw, before the next paint, and only looks at what
// changed (cheap enough for the count-up numbers). Markup only: headless safe.
import { GEAR_GLYPHS, GEAR_EMOJI } from './glyph_gear.js';
const O = 'stroke="#3a1d0c" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"';
const sv = b => `<svg class="gs9" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${b}</svg>`;
const wedge = (c, i, pts) => `<path d="M12 12L${pts[i]}A8.5 8.5 0 0 1 ${pts[(i + 1) % 6]}z" fill="${c}"/>`;
const WP = ['12 3.5', '19.4 7.75', '19.4 16.25', '12 20.5', '4.6 16.25', '4.6 7.75'];

export const GLYPHS = {
  bolt: sv(`<path d="M13.8 2L5 13.4h5.6L9.4 22l9.4-12h-5.6z" fill="#ffd84d" ${O}/><path d="M12.6 5.2l-4.1 6" stroke="#fff8c4" stroke-width="1.4" stroke-linecap="round" fill="none"/>`),
  coin: sv(`<circle cx="12" cy="12" r="9.2" fill="#ffc83d" ${O}/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#b87a08" stroke-width="1.8"/><path d="M7 7.4a7 7 0 0 1 4-2" stroke="#fff7b8" stroke-width="1.5" stroke-linecap="round" fill="none"/>`),
  sparkle: sv(`<path d="M12 2.5l2.6 6.9 6.9 2.6-6.9 2.6L12 21.5l-2.6-6.9L2.5 12l6.9-2.6z" fill="#ff8ad0" ${O}/><path d="M12 6.2l1.1 3.4-1.6.6z" fill="#fff" opacity=".7"/>`),
  star: sv(`<path d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.4 6.7-6-3.4-6 3.4 1.4-6.7-5-4.6 6.7-.8z" fill="#ffd84d" ${O}/><path d="M12 6l1.4 3.2-1.9.2z" fill="#fff" opacity=".7"/>`),
  lock: sv(`<path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#3a1d0c" stroke-width="4" stroke-linecap="round"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#b9c2d8" stroke-width="2" stroke-linecap="round"/><rect x="4.8" y="10.5" width="14.4" height="10.5" rx="3" fill="#ffb347" ${O}/><circle cx="12" cy="15" r="1.7" fill="#3a1d0c"/><path d="M12 15.4v2.6" stroke="#3a1d0c" stroke-width="1.8" stroke-linecap="round"/>`),
  trophy: sv(`<path d="M7 5H3.6C3.6 9 5 11 8 11.6M17 5h3.4C20.4 9 19 11 16 11.6" fill="none" stroke="#3a1d0c" stroke-width="3.4" stroke-linecap="round"/><path d="M7 5H3.6C3.6 9 5 11 8 11.6M17 5h3.4C20.4 9 19 11 16 11.6" fill="none" stroke="#ffd84d" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 3h11v6a5.5 5.5 0 0 1-11 0z" fill="#ffd84d" ${O}/><rect x="10.4" y="14" width="3.2" height="4" fill="#f0a818" ${O}/><rect x="6.8" y="18" width="10.4" height="3.6" rx="1.4" fill="#ff8ab8" ${O}/>`),
  note: sv(`<path d="M9 5l11-2.2v12.6M9 5v12.6" fill="none" ${O} stroke-width="3.2"/><path d="M9 5l11-2.2v12.6M9 5v12.6" fill="none" stroke="#7ae8f8" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="6.6" cy="17.8" rx="3.6" ry="2.9" fill="#7ae8f8" ${O}/><ellipse cx="17.6" cy="15.6" rx="3.6" ry="2.9" fill="#7ae8f8" ${O}/>`),
  gift: sv(`<rect x="3.5" y="10" width="17" height="11" rx="2" fill="#ff6d9a" ${O}/><rect x="2.5" y="7" width="19" height="4.6" rx="1.6" fill="#ff8db0" ${O}/><path d="M10.4 7h3.2v14h-3.2z" fill="#ffe14a" ${O}/><path d="M12 7C9 7 7 5.6 7.6 4.2 8.6 2.6 11.6 4.4 12 7c.4-2.6 3.4-4.4 4.4-2.8.6 1.4-1.4 2.8-4.4 2.8z" fill="#ffe14a" ${O}/>`),
  box: sv(`<path d="M3 8l9-4.5L21 8v10l-9 4.5L3 18z" fill="#c8843a" ${O}/><path d="M3 8l9 4.5L21 8M12 12.5v10" fill="none" ${O}/><path d="M7.6 5.8l9 4.6v3.2l-3 1.5" fill="none" stroke="#ffd84d" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>`),
  wheel: sv(`<circle cx="12" cy="12" r="10" fill="#fff" ${O}/>${['#ff5cb8', '#ffd84d', '#4fd8f0', '#8a5cf0', '#7ad060', '#ff8a4a'].map((c, i) => wedge(c, i, WP)).join('')}<circle cx="12" cy="12" r="2.4" fill="#ffd84d" ${O}/><path d="M12 .9l-2.4 3.6h4.8z" fill="#ff3d5a" ${O}/>`),
  ticket: sv(`<g transform="rotate(-14 12 12)"><path d="M2.5 6.5h19v4a1.8 1.8 0 0 0 0 3.6v4h-19v-4a1.8 1.8 0 0 0 0-3.6z" fill="#ffd84d" ${O}/><path d="M8.6 8v8" stroke="#a8730a" stroke-width="1.4" stroke-dasharray="1.6 2" fill="none"/><path d="M15.2 9.4l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#c42a68"/></g>`),
  clock: sv(`<circle cx="12" cy="13" r="8.6" fill="#7ae8f8" ${O}/><path d="M12 8v5.4l3.4 2" fill="none" stroke="#3a1d0c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="9.6" y="1.8" width="4.8" height="2.6" rx="1.1" fill="#7ae8f8" ${O}/>`),
  shield: sv(`<path d="M12 2.4l8 3v6c0 5-3.5 8.6-8 10.2-4.5-1.6-8-5.2-8-10.2v-6z" fill="#5aa8ff" ${O}/><path d="M12 5.2l5.2 1.9v4.2c0 3.2-1.8 5.6-5.2 7z" fill="#fff" opacity=".28"/><path d="M8.4 11.6l2.6 2.6 4.6-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  egg: sv(`<path d="M12 2.5c-4.2 0-7 5.6-7 10a7 7 0 0 0 14 0c0-4.4-2.8-10-7-10z" fill="#fff3d6" ${O}/><path d="M5.2 13.6l2.8-1.8 2.4 1.8 2.4-2 2.4 2 2.8-1.6" fill="none" stroke="#ffb347" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  mic: sv(`<rect x="8.2" y="2.5" width="7.6" height="12" rx="3.8" fill="#c9cfe0" ${O}/><path d="M5.6 11.5a6.4 6.4 0 0 0 12.8 0M12 18v3.4M8.6 21.4h6.8" fill="none" ${O} stroke-width="1.8"/><path d="M10 6.2h4M10 9h4" stroke="#3a1d0c" stroke-width="1.2" opacity=".5"/>`),
};

Object.assign(GLYPHS, GEAR_GLYPHS);

// emoji (as they appear in the game's strings) -> glyph name
export const EMOJI_GLYPH = {
  '⚡': 'bolt', '🪙': 'coin', '🟡': 'coin', '✨': 'sparkle', '🌟': 'star', '🔒': 'lock', '🏆': 'trophy', '🎵': 'note',
  '🎁': 'gift', '📦': 'box', '🎡': 'wheel', '🎫': 'ticket', '⏱': 'clock', '🛡': 'shield', '🥚': 'egg', '🎤': 'mic',
};
Object.assign(EMOJI_GLYPH, GEAR_EMOJI);
const RE = new RegExp('(' + Object.keys(EMOJI_GLYPH).join('|') + ')\\uFE0F?', 'gu');
const QUICK = /[⚡🪙🟡✨🌟🔒🏆🎵🎁📦🎡🎫⏱🛡🥚🎤🔨📣💍🪘🧣🦺🎙🧤⏰🧼🥛🧋🫙🏅🎖🎀📖🔥⭐]/u;

// pure: split a string into text and glyph pieces ({t} or {g}); no emoji gives one text piece
export function splitGlyphs(str) {
  const out = []; let last = 0, m; RE.lastIndex = 0;
  while ((m = RE.exec(str))) { if (m.index > last) out.push({ t: str.slice(last, m.index) }); out.push({ g: EMOJI_GLYPH[m[1]] }); last = m.index + m[0].length; }
  if (last < str.length) out.push({ t: str.slice(last) });
  return out;
}

function swapText(node) {
  const v = node.nodeValue;
  if (!v || !QUICK.test(v)) return 0;
  const p = node.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|TITLE)$/.test(p.nodeName)) return 0;
  const parts = splitGlyphs(v); if (!parts.some(x => x.g)) return 0;
  const frag = document.createDocumentFragment(); let n = 0;
  for (const x of parts) {
    if (x.t !== undefined) { frag.appendChild(document.createTextNode(x.t)); continue; }
    const s = document.createElement('span'); s.className = 'gs9w'; s.dataset.g = x.g; s.setAttribute('aria-hidden', 'true'); s.innerHTML = GLYPHS[x.g];
    frag.appendChild(s); n++;
  }
  p.replaceChild(frag, node); return n;
}

// swap every emoji under root (an element or text node); returns how many were replaced
export function sweepGlyphs(root = document.body) {
  if (!root) return 0;
  if (root.nodeType === 3) return swapText(root);
  if (root.nodeType !== 1 || root.nodeName === 'CANVAS' || root.classList.contains('gs9w')) return 0;
  const w = document.createTreeWalker(root, 4), list = []; let n;
  while ((n = w.nextNode())) if (QUICK.test(n.nodeValue)) list.push(n);
  let c = 0; for (const t of list) c += swapText(t);
  return c;
}

export function watchGlyphs(root = document.body) {
  if (!root || root.dataset.gs9) return;
  root.dataset.gs9 = '1'; sweepGlyphs(root);
  if (typeof MutationObserver !== 'function') return;
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') { sweepGlyphs(m.target); continue; }
      for (const a of m.addedNodes) sweepGlyphs(a);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
