// Round 8 (agent 19): a small button state helper. flashDone swaps a button's label for a green check and the word
// you give it, locks it for a moment (so a double tap cannot do it twice) and then restores the old content.
// setBusy puts a spinner in the button while something runs. Both keep the width steady so nothing jumps.
const timers = new WeakMap();
const CHECK = '<svg class="bs8" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M4.5 12.8l5 5L19.5 6.8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg> ';

export function flashDone(btn, word = 'DONE', ms = 1600) {
  if (!btn) return false;
  if (timers.has(btn)) return false;
  const html = btn.innerHTML, w = btn.offsetWidth;
  if (w) btn.style.minWidth = w + 'px';
  btn.classList.add('done8'); btn.setAttribute('aria-live', 'polite'); btn.innerHTML = CHECK + word;
  timers.set(btn, setTimeout(() => { timers.delete(btn); btn.classList.remove('done8'); btn.innerHTML = html; btn.style.minWidth = ''; btn.removeAttribute('aria-live'); }, ms));
  return true;
}

export function setBusy(btn, on) {
  if (!btn) return;
  btn.classList.toggle('busy8', !!on); btn.disabled = !!on;
  if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
}
