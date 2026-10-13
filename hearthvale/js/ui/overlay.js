// Modal cards drawn over everything: confirm / ask-for-text dialogs and the generic celebration card shell.
import { icon } from '../icons.js';
import { S, $, esc } from './state.js';
import { ui, reduced, BOUNCE } from './fx.js';

let host = null;
const stack = [];
export function overlayHost() { return host || (host = $('#over')); }

/** show a modal card; returns { el, close } */
export function modal(html, o = {}) {
  const h = overlayHost(); const wrap = document.createElement('div'); wrap.className = 'ov ' + (o.cls || ''); wrap.innerHTML = `<div class="ov-bg"></div><div class="ov-card">${html}</div>`;
  h.appendChild(wrap); const card = wrap.querySelector('.ov-card'); stack.push(wrap);
  let closed = false;
  const api = { el: wrap, card, close(out) {
    if (closed) return; closed = true; const i = stack.indexOf(wrap); if (i >= 0) stack.splice(i, 1);
    const done = () => { wrap.remove(); if (o.onClose) o.onClose(out); };
    if (reduced()) { done(); return; }
    wrap.classList.add('out'); try { card.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.85) translateY(20px)', opacity: 0 }], { duration: 200, easing: 'ease-in' }); } catch { /* ignore */ } setTimeout(done, 200);
  } };
  if (!reduced()) { try { card.animate([{ transform: 'scale(.6) translateY(40px)', opacity: 0 }, { transform: 'scale(1.04)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: BOUNCE }); } catch { /* ignore */ } }
  if (o.dismiss !== false) wrap.querySelector('.ov-bg').addEventListener('click', () => api.close(undefined));
  return api;
}
export const hasModal = () => { for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].isConnected) stack.splice(i, 1); return stack.length > 0; };

S.api.confirm = ({ title, text, ok = 'Yes', no = 'Not now', danger = false, icon: ic = danger ? 'trash' : 'info' }) => new Promise((res) => {
  const m = modal(`<div class="ov-ic">${icon(ic, 44)}</div><h3>${esc(title)}</h3><p>${esc(text || '')}</p><div class="row ctr"><button class="b b-cream" data-r="0" data-snd="back">${esc(no)}</button><button class="b ${danger ? 'b-red' : 'b-green'}" data-r="1" data-snd="confirm">${esc(ok)}</button></div>`, { cls: 'ask', onClose: (v) => res(!!v) });
  m.card.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) m.close(b.dataset.r === '1'); });
});
S.api.ask = ({ title, value = '', ok = 'Save', max = 16, ph = '' }) => new Promise((res) => {
  const m = modal(`<h3>${esc(title)}</h3><input id="askIn" maxlength="${max}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off"><div class="row ctr" style="margin-top:12px"><button class="b b-cream" data-r="0" data-snd="back">Cancel</button><button class="b b-green" data-r="1" data-snd="confirm">${esc(ok)}</button></div>`, { cls: 'ask', onClose: (v) => res(v === true ? $('#askIn') && $('#askIn').value : null) });
  const inp = m.card.querySelector('input'); setTimeout(() => { try { inp.focus(); inp.select(); } catch { /* ignore */ } }, 300);
  const done = () => { const v = inp.value.trim(); m.el.dataset.val = v; res(v || null); m.close(null); };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(); if (e.key === 'Escape') m.close(null); });
  m.card.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; if (b.dataset.r === '1') done(); else m.close(null); });
});
