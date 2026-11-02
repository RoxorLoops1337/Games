// Round 9 (agent 19): toasts get a tone. A small drawn badge (check, cross, bang, dot) and a coloured edge say at a
// glance whether it was good news, a no, a nudge or plain info; a thin bar drains while it is up, and a toast that
// arrives while another is showing gives a little pop instead of silently swapping text. Markup and classes only.
export const TONES = ['good', 'deny', 'warn', 'info'];

// pure: which tone a message has
export function toastTone(msg) {
  const m = String(msg || '');
  if (/^(Not enough|Nothing to claim|That code does not)/.test(m)) return 'deny';
  if (/^(Out of Voice|Something glitched|Tap again|Press again|Hold to|Low quality|Select and copy)/.test(m)) return 'warn';
  if (/(claimed|hatched|reward|Sticker|chest|\+\d|copied|loaded|unlocked|saved)/i.test(m)) return 'good';
  return 'info';
}

// dress the toast element for this message (call after its text is set, before it gets .on)
export function dressToast(el, msg) {
  if (!el) return 'info';
  const tone = toastTone(msg), was = el.classList.contains('on');
  for (const t of TONES) el.classList.toggle('tn-' + t, t === tone);
  el.dataset.tone = tone;
  // restart the draining bar, and pop when we replace a toast that is still showing
  el.classList.remove('tk', 'tpop');
  void el.offsetWidth;
  el.classList.add('tk'); if (was) el.classList.add('tpop');
  return tone;
}
