// Accessibility batch 11 (agent 18). DOM only, no game rules, no save changes.
//  - the upgrade card lock works from the keyboard: with a card focused, L keeps it through a Refresh (and L again lets go). It is
//    spoken, and every card that can be locked says so in its name.
//  - a new sticker (the prize card that flies into the Stats tab after a run) is spoken with what it is for, since the card itself
//    is a short lived picture.
//  - the result screen (stage clear and game over) gets a full summary as its description, the star row is one picture with a
//    name, and every reward row is read with its FINAL number (the on screen number counts up).
import { announce } from './access.js';
import { lockState } from './cards_b10.js';
import { STICKERS } from './sticker_b9.js';

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

// ---- card lock
export const LOCK_HINT = 'Press L to keep this card when you refresh.';
export function lockSpeech(i, name, on) {
  return on ? 'Kept option ' + (i + 1) + ': ' + name + '. Refresh keeps it and deals new cards around it.' : 'Option ' + (i + 1) + ' is no longer kept.';
}
// pure: the card the L key acts on, from a list of { lockable } flags and the focused index (-1 when no card has focus)
export const lockTarget = (flags, focused) => (focused >= 0 && flags[focused] ? focused : -1);

export function initCardLock() {
  if (typeof document === 'undefined') return;
  const wrap = document.getElementById('cards'); if (!wrap) return;
  const mark = () => {
    for (const c of wrap.querySelectorAll('.card.pick')) {
      const lb = c.querySelector('.lockb'), a = c.getAttribute('aria-label') || '';
      if (lb && !a.includes(LOCK_HINT)) c.setAttribute('aria-label', a + ' ' + LOCK_HINT);
      if (lb) c.setAttribute('aria-keyshortcuts', 'L');
    }
  };
  new MutationObserver(mark).observe(wrap, { childList: true }); mark();
  addEventListener('keydown', e => {
    if ((e.key !== 'l' && e.key !== 'L') || e.ctrlKey || e.metaKey || e.altKey) return;
    const cards = [...wrap.querySelectorAll('.card.pick')], at = cards.indexOf(document.activeElement);
    const i = lockTarget(cards.map(c => !!c.querySelector('.lockb')), at); if (i < 0) return;
    const lb = cards[i].querySelector('.lockb'); e.preventDefault(); e.stopPropagation();
    lb.click();   // the same path as a tap on the padlock
    const nm = (cards[i].querySelector('.nt') || {}).textContent || 'card';
    announce(lockSpeech(i, clean(nm), lockState.i === i));
  }, true);
}

// ---- sticker prize
export function stickerSpeech(def, more) {
  if (!def) return '';
  return 'New sticker: ' + def.name + (more > 0 ? ', and ' + more + ' more' : '') + '. ' + clean(def.hint) + ' Find it in the sticker book on the Stats tab.';
}
export function initStickerSr(defs = STICKERS) {
  if (typeof document === 'undefined') return;
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || !n.classList.contains('sp10')) continue;
      const nm = clean((n.querySelector('.sp10t b') || {}).textContent), more = +((/\+(\d+) more/.exec(n.textContent) || [])[1] || 0);
      const d = defs.find(s => s.name === nm); if (!d) continue;
      n.removeAttribute('role'); n.setAttribute('aria-hidden', 'true');   // the live region below says it once
      announce(stickerSpeech(d, more));
    }
  }).observe(document.body, { childList: true });
}

// ---- result summary
// pure: one sentence for the whole result screen. rows are the reward lines (already with final numbers)
export function resultSummary({ title, sub, stars, rows, ribbon, goal }) {
  const out = [clean(title) + '.'];
  if (clean(ribbon)) out.push(clean(ribbon).toLowerCase().replace(/^./, c => c.toUpperCase()) + '.');
  if (clean(sub)) out.push(clean(sub).replace(/\.?$/, '.'));
  if (stars >= 0) out.push(stars + ' of 3 stars.');
  if (rows && rows.length) out.push('Rewards: ' + rows.map(clean).join(', ') + '.');
  if (clean(goal)) out.push('Next goal: ' + clean(goal).replace(/\.?$/, '.'));
  return out.join(' ');
}
// the text of one reward row with every counting number at its final value
export function rowText(row) {
  const f = row.querySelectorAll('.f10');
  if (f.length) return [...f].map(e => { const c = e.querySelector('[data-to]'); return (c ? c.dataset.to : '') + ' ' + clean(e.title).replace(/ fragment$/i, '') + ' fragment'; }).join(', ');
  const c = row.cloneNode(true);
  for (const s of c.querySelectorAll('[data-to]')) s.textContent = s.dataset.to;
  for (const s of c.querySelectorAll('img,svg,i')) s.remove();
  return clean(c.textContent).replace(/^\+\s*/, '');
}
export function readResult(doc = document) {
  const t = id => clean((doc.getElementById(id) || {}).textContent);
  const stars = doc.getElementById('rStars'), n = stars && stars.children.length ? stars.querySelectorAll('span:not(.off)').length : -1;
  const rows = [...doc.querySelectorAll('#rList .r')].map(rowText).filter(Boolean);
  return { title: t('rTitle'), sub: t('rSub'), stars: n, rows, ribbon: t('rRibbon'), goal: t('rGoal') };
}
export function paintResult(doc = document) {
  const res = doc.getElementById('result'); if (!res) return '';
  const d = readResult(doc), text = resultSummary(d);
  let sum = doc.getElementById('a11yResSum'); if (!sum) { sum = doc.createElement('div'); sum.id = 'a11yResSum'; sum.className = 'sr'; doc.body.appendChild(sum); }
  sum.textContent = text; res.setAttribute('aria-describedby', 'a11yResSum');
  const st = doc.getElementById('rStars');
  if (st && d.stars >= 0) { st.setAttribute('role', 'img'); st.setAttribute('aria-label', d.stars + ' of 3 stars'); for (const s of st.children) s.setAttribute('aria-hidden', 'true'); }
  const list = doc.getElementById('rList'); if (list) { list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Rewards'); }
  [...doc.querySelectorAll('#rList .r')].forEach(r => { const x = rowText(r); if (x) { r.setAttribute('role', 'img'); r.setAttribute('aria-label', x); } });
  return text;
}
export function initResultSr() {
  if (typeof document === 'undefined') return;
  const res = document.getElementById('result'); if (!res) return;
  let was = false;
  new MutationObserver(() => { const on = res.classList.contains('on'); if (on && !was) paintResult(); was = on; }).observe(res, { attributes: true, attributeFilter: ['class'] });
}

export function initA11yB11() { try { initCardLock(); initStickerSr(); initResultSr(); } catch (e) { /* never block the game */ } }
