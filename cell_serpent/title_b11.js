// Round 11 title (agent 12).
//  - keyboard and screen reader path for the two other title secrets: "Logo wave" (the 5 quick logo taps) and
//    "Boots" / "Cats" (the duet call and answer). Presses are untimed and the live region says how far you are.
//  - the logo answers the tune: every poked snake note bounces a word of the logo (alternating), so the title feels musical.
// Cosmetic only: no save changes, no new storage keys.
import { LOGO_TAPS, DUET } from './title_b9.js';
import { secretsFound, secretLabel, SECRET_IDS } from './title_b10.js';
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// what the screen reader hears
export const logoSay = step => (step >= LOGO_TAPS ? 'Logo wave!' : `Logo tap ${step} of ${LOGO_TAPS}`);
export const duetSay = (res, step, side) => {
  const nm = side === 'L' ? 'Boots' : 'Cats';
  if (res === 'done') return 'Boots and Cats! Duet found.';
  if (res === 'miss') return `${nm}. Start again with Boots.`;
  return `${nm}. Next: ${DUET[step] === 'L' ? 'Boots' : 'Cats'}.`;
};
export const foundSay = id => `${id === 'logo' ? 'Logo wave' : id === 'duet' ? 'Duet' : 'Tune'} secret found. `;
// which word of the logo bounces for note i (alternating, so a run of notes ripples across it)
export const wordFor = (i, n) => (n > 0 ? ((i % n) + n) % n : 0);

export function setupTitle11(title) {
  if (!title || title._t11) return null;
  title._t11 = true;
  const keep = title.querySelector('.row'), logo = title.querySelector('.logo'), hero = title.querySelector('.stage12 .hero');
  const g = document.createElement('div'); g.className = 'kb11'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Title secrets');
  const mk = (txt, label) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); g.appendChild(b); return b; };
  const bl = mk('Logo wave', 'Logo wave. Press five times to make the logo dance.'), bb = mk('Boots', 'Boots. Press Boots, then Cats, twice, to make the duet sing.'), bc = mk('Cats', 'Cats. The answer to Boots.');
  const live = document.createElement('div'); live.className = 'kbl10'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  title.insertBefore(g, keep); title.insertBefore(live, keep);
  let logoN = 0, duetK = 0;
  const say = t => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };
  const fire = (el, fx) => {   // a synthetic pointerdown through the real handler, flagged untimed
    if (!el) return; const r = el.getBoundingClientRect(); el._kb = true;
    try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + fx * r.width, clientY: r.top + r.height * 0.5 })); } finally { el._kb = false; }
  };
  bl.addEventListener('click', () => {
    logoN++; fire(logo, 0.5);
    if (logoN >= LOGO_TAPS) logoN = 0; else say(logoSay(logoN));
  });
  const duetPress = side => {
    fire(hero, side === 'L' ? 0.25 : 0.75);
    let res = 'ok';
    if (side === DUET[duetK]) { duetK++; if (duetK === DUET.length) { duetK = 0; res = 'done'; } } else { duetK = side === DUET[0] ? 1 : 0; res = duetK ? 'ok' : 'miss'; }
    if (res !== 'done') say(duetSay(res, duetK, side));
  };
  bb.addEventListener('click', () => duetPress('L'));
  bc.addEventListener('click', () => duetPress('R'));
  title.addEventListener('secretfound', e => { const id = e.detail && e.detail.id; if (id === 'logo') logoN = 0; if (id === 'duet') duetK = 0; if (id) say(foundSay(id) + secretLabel(secretsFound().length)); });
  // the logo bounces with the snake tune
  title.addEventListener('snakepoke', e => {
    if (!e.detail || !e.detail.hit || reduced() || !logo || !logo.querySelectorAll) return;
    const sp = logo.querySelectorAll('span'); if (!sp.length) return;
    const w = sp[wordFor(e.detail.i | 0, sp.length)];
    if (w && w.animate) w.animate([{ translate: '0 0', scale: '1' }, { translate: '0 -9px', scale: '1.07', offset: 0.35 }, { translate: '0 0', scale: '1' }], { duration: 360, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  });
  return { group: g, live, SECRET_IDS };
}
