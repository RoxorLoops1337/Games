// Accessibility batch 9 (agent 18): the gig claim rows work from the keyboard and with a screen reader.
// Each row button says which gig it claims, a claim is spoken once, and focus never falls onto the page when the
// pressed button disappears (the pinned claim row hides itself, a claimed row turns off its button). DOM only, no game rules.
import { announce } from './access.js';

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
// the spoken name of a gig button; state is 'ready', 'claimed' or 'wait'
export function goalLabel(state, text, n) {
  text = clean(text); n = clean(n);
  if (state === 'ready') return 'Claim reward: ' + text;
  if (state === 'claimed') return text + ', reward claimed';
  return text + (n ? ', ' + n + ' done' : '') + ', not finished yet';
}
export const claimLine = names => !names.length ? '' : names.length === 1 ? 'Claimed: ' + names[0] : 'Claimed ' + names.length + ' gigs: ' + names.join('; ');

export function nameGoalButtons(root = document) {
  for (const row of root.querySelectorAll('#goalList .gl-row')) {
    const b = row.querySelector('.gl-btn'); if (!b) continue;
    const st = row.classList.contains('ready') ? 'ready' : row.classList.contains('claimed') ? 'claimed' : 'wait';
    const tx = row.querySelector('.gl-tx b'), nn = row.querySelector('.gl-n');
    b.setAttribute('aria-label', goalLabel(st, tx && tx.textContent, nn && nn.textContent));
  }
}
const usable = el => !!el && el.isConnected && el !== document.body && !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0;
// where the keyboard goes when the pressed control is gone: the next open claim, else Claim all, else the start button
export function rescueTarget(doc = document) {
  for (const sel of ['#goalList .gl-btn:not([disabled])', '#claimGigs', '#stGo']) { const el = doc.querySelector(sel); if (usable(el)) return el; }
  return null;
}
export function initClaimA11y() {
  if (typeof document === 'undefined') return;
  const list = document.getElementById('goalList'); if (!list) return;
  new MutationObserver(() => nameGoalButtons()).observe(list, { childList: true }); nameGoalButtons();
  addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('#btClaim,#claimGigs,#goalList .gl-btn'); if (!b || b.disabled) return;
    if (b.id === 'btClaim' && b.dataset.k === 'event') return;
    const rows = b.classList.contains('gl-btn') ? [b.closest('.gl-row')] : [...list.querySelectorAll('.gl-row.ready')];
    const names = rows.filter(Boolean).map(r => clean((r.querySelector('.gl-tx b') || {}).textContent)).filter(Boolean);
    if (names.length) announce(claimLine(names));
    if (e.detail !== 0) return;   // only a keyboard press needs its focus kept
    setTimeout(() => { if (usable(document.activeElement)) return; const t = rescueTarget(); if (t) { try { t.focus({ preventScroll: true }); } catch (err) { /* ignore */ } } }, 160);
  }, true);
}
