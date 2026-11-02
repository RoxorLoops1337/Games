// Round 9 title secrets (agent 12). Nothing is explained on screen; players discover them.
//  - tap the logo 5 times quickly: the letters do a wave and the title throws notes
//  - tap the duo: the left half beatboxes "BOOTS", the right half answers "CATS"; boots-cats-boots-cats brings the house down
// Purely cosmetic: no rewards, no save changes.
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
export const LOGO_TAPS = 5, LOGO_WINDOW = 2600;
export const DUET = ['L', 'R', 'L', 'R'], DUET_GAP = 1500;

// pure tracker for "n taps inside a time window"
export function makeBurst(n = LOGO_TAPS, win = LOGO_WINDOW) {
  const ts = [];
  return { tap(now) { ts.push(now); while (ts.length && now - ts[0] > win) ts.shift(); if (ts.length >= n) { ts.length = 0; return true; } return false; } };
}
// pure tracker for the boots-and-cats call and answer. Feed 'L' or 'R'; returns 'ok', 'done' or 'miss'
export function makeDuet(seq = DUET, gap = DUET_GAP) {
  let k = 0, last = -1e9;
  return {
    get step() { return k; },
    tap(side, now) {
      if (now - last > gap) k = 0;
      last = now;
      if (side === seq[k]) { k++; if (k === seq.length) { k = 0; return 'done'; } return 'ok'; }
      k = side === seq[0] ? 1 : 0; return k ? 'ok' : 'miss';
    },
  };
}
export const sideOf = (x, left, width) => (x < left + width / 2 ? 'L' : 'R');

export function setupSecrets(title, audio) {
  if (!title || title._sec9) return null;
  title._sec9 = true;
  const logo = title.querySelector('.logo'), hero = title.querySelector('.stage12 .hero'), burst = makeBurst(), duet = makeDuet();
  const glyph = (x, y, ch, cls, txt) => {
    const s = document.createElement('span'); s.className = 'sc9 ' + (cls || ''); s.textContent = ch; s.style.left = x + 'px'; s.style.top = y + 'px';
    if (txt) s.setAttribute('data-w', txt); title.insertBefore(s, title.querySelector('.row')); setTimeout(() => s.remove(), 1100);
  };
  const at = (el, e) => { const r = title.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const play = (n, o) => { try { audio.play(n, o); } catch (er) { /* ignore */ } };
  if (logo) {
    logo.addEventListener('pointerdown', e => {
      play('snakesqueak', { i: 4 + Math.floor(Math.random() * 6) });
      if (!burst.tap(performance.now())) return;
      play('streakmile', { n: 3 }); title.dispatchEvent(new CustomEvent('secretfound', { detail: { id: 'logo' } }));
      const p = at(logo, e), r = logo.getBoundingClientRect(), tr = title.getBoundingClientRect();
      if (!reduced() && logo.querySelectorAll) [...logo.querySelectorAll('span')].forEach((sp, j) => sp.animate && sp.animate([{ translate: '0 0' }, { translate: '0 -16px', scale: '1.06', offset: 0.4 }, { translate: '0 0' }], { duration: 520, delay: j * 140, easing: 'cubic-bezier(.3,1.6,.5,1)' }));
      if (!reduced()) for (let j = 0; j < 8; j++) glyph(r.left - tr.left + (j + 0.5) * r.width / 8, r.top - tr.top + r.height * 0.7, ['♪', '♫', '✦', '♡'][j % 4], 'big d' + (j % 3));
      void p;
    });
  }
  if (hero) {
    hero.style.touchAction = 'manipulation';
    hero.addEventListener('pointerdown', e => {
      const r = hero.getBoundingClientRect(), side = sideOf(e.clientX, r.left, r.width), p = at(hero, e);
      play(side === 'L' ? 'tutpop' : 'snakesqueak', { i: side === 'L' ? 0 : 9 });
      const res = duet.tap(side, performance.now());
      glyph(p.x, p.y - 20, side === 'L' ? '' : '', 'say', side === 'L' ? 'BOOTS' : 'CATS');
      hero.animate && !reduced() && hero.animate([{ rotate: '0deg' }, { rotate: (side === 'L' ? -2.5 : 2.5) + 'deg', offset: 0.35 }, { rotate: '0deg' }], { duration: 280, easing: 'ease-out' });
      if (res === 'done') {
        play('levelup'); title.dispatchEvent(new CustomEvent('secretfound', { detail: { id: 'duet' } }));
        if (!reduced()) for (let j = 0; j < 10; j++) glyph(p.x + (j - 5) * 16, p.y - 30, ['♪', '♫', '★', '♡', '✦'][j % 5], 'big d' + (j % 3));
        glyph(r.left - title.getBoundingClientRect().left + r.width / 2, p.y - 70, '', 'say big2', 'BOOTS & CATS!');
      }
    });
  }
  return { burst, duet };
}
