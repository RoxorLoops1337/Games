// Round 8 title and onboarding (agent 12):
//  - a hidden tune along the title snake: tap its body cells in the right order and a sticker is yours (shown on the title, tap it to hear the tune again)
//  - the "first return visit" hand: a bouncing pointer over PLAY for a player who came back before clearing stage 3
// Flags live in their own localStorage key so the save format never changes.
const KEY = 'cell_serpent_tune13';
export const TUNE = [3, 2, 1, 3, 2, 1];   // body cell indices, in order (pentatonic: G E D G E D)
export const TUNE_GAP = 1800;             // ms allowed between two taps
const rd = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
const wr = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } };
export const hasSticker = rd;
// the faint numbered hint: after this many wrong taps on the snake (in total, kept in its own key) the cells
// that make up the tune show 1..6 for a few seconds; it never shows once the sticker is won
export const HINT_MISSES = 10, HINT_MS = 7000;
const KEY_MISS = 'cell_serpent_tune13m';
export const missCount = () => { try { return Math.max(0, parseInt(localStorage.getItem(KEY_MISS), 10) || 0); } catch (e) { return 0; } };
const setMiss = n => { try { localStorage.setItem(KEY_MISS, String(n)); } catch (e) { /* ignore */ } };
// which numbers (1..n) go on body cell i: a cell can carry two (3 is the 1st and the 4th note)
export function hintLabels(i, tune = TUNE) { const out = []; tune.forEach((c, k) => { if (c === i) out.push(k + 1); }); return out.join('\u00b7'); }
// pure: does a miss bring the hint up? (returns the new total and whether to show)
export function nextMiss(n, won) { if (won) return { n, show: false }; n++; return n >= HINT_MISSES ? { n: 0, show: true } : { n, show: false }; }
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// a pure tracker: feed it cell numbers and times, it says how far along the tune the player is
export function makeTune(tune = TUNE, gap = TUNE_GAP) {
  let k = 0, last = -1e9;
  return {
    get step() { return k; },
    tap(i, now) {
      if (now - last > gap) k = 0;
      last = now;
      if (i === tune[k]) { k++; if (k === tune.length) { k = 0; return 'done'; } return 'ok'; }
      k = i === tune[0] ? 1 : 0;
      return k ? 'ok' : 'miss';
    },
    reset() { k = 0; },
  };
}

// the first return visit: they have played, but stage 3 is still ahead (the harsh one)
export const wantsHand = save => !!save && save.runs > 0 && (save.cleared || 0) < 3 && (save.runs || 0) <= 8;

const STICKER_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#ffd84d" stroke="#fff" stroke-width="3.5"/><circle cx="24" cy="24" r="16.5" fill="none" stroke="#c98a00" stroke-width="1.4" stroke-dasharray="2.5 3"/><path d="M21 14v14.2a4.2 3.4 0 1 0 2.6 3.1V19.5l8-2v8.2a4.2 3.4 0 1 0 2.6 3.1V13.2z" fill="#4a0f3a"/></svg>';

export function setupTune(title, audio, onDone) {
  if (!title || title._tune13) return null;
  title._tune13 = true;
  const cv = title.querySelector('.snake5'), tr = makeTune();
  const prog = document.createElement('div'); prog.className = 'tune13'; prog.setAttribute('aria-hidden', 'true');
  prog.innerHTML = TUNE.map(() => '<i></i>').join(''); const keep = title.querySelector('.row'); title.insertBefore(prog, keep);   // before the last child: the title's auto margins stay as they were
  const stk = document.createElement('button'); stk.className = 'stk13'; stk.type = 'button'; stk.setAttribute('aria-label', 'Sticker: play the snake tune'); stk.innerHTML = STICKER_SVG; stk.hidden = !rd(); title.insertBefore(stk, keep);
  const dots = prog.children;
  // numbered hint chips, one per distinct body cell of the tune, glued to the snake while it shows
  const cells = [...new Set(TUNE)], chips = cells.map(c => { const e = document.createElement('i'); e.className = 'hn13'; e.textContent = hintLabels(c); e.setAttribute('aria-hidden', 'true'); return e; });
  const hintBox = document.createElement('div'); hintBox.className = 'hint13'; hintBox.setAttribute('aria-hidden', 'true'); chips.forEach(e => hintBox.appendChild(e)); title.insertBefore(hintBox, keep);
  let hintOn = 0, hintRaf = 0;
  const place = () => {
    if (!cv || !cv._cell) return;
    const r = cv.getBoundingClientRect(), tr1 = title.getBoundingClientRect();
    cells.forEach((c, j) => { const p = cv._cell(c); chips[j].style.left = (r.left - tr1.left + p.x) + 'px'; chips[j].style.top = (r.top - tr1.top + p.y - 30) + 'px'; chips[j].style.opacity = p.x > 8 && p.x < p.W - 8 ? '' : '0'; });
  };
  const showHint = () => {
    cancelAnimationFrame(hintRaf); hintOn = performance.now(); hintBox.classList.add('show');
    const loop = () => { place(); if (performance.now() - hintOn < HINT_MS) hintRaf = requestAnimationFrame(loop); else hintBox.classList.remove('show'); };
    loop();
  };
  title._tuneHint = showHint;
  const paint = n => { for (let j = 0; j < dots.length; j++) dots[j].classList.toggle('on', j < n); prog.classList.toggle('show', n > 0); };
  let hide = 0;
  const glyph = (x, y, ch, cls) => {
    const s = document.createElement('span'); s.className = 'tn13 ' + (cls || ''); s.textContent = ch; s.style.left = x + 'px'; s.style.top = y + 'px'; title.insertBefore(s, keep); setTimeout(() => s.remove(), 900);
  };
  const play = () => {
    TUNE.forEach((c, j) => setTimeout(() => { try { audio.play('snakesqueak', { i: c }); } catch (e) { /* ignore */ } stk.classList.remove('bop'); void stk.offsetWidth; stk.classList.add('bop'); }, j * 260));
  };
  title.addEventListener('snakepoke', e => {
    const d = e.detail; if (!d || !d.hit || !cv) return;
    const r = cv.getBoundingClientRect(), tr0 = title.getBoundingClientRect(), x = r.left - tr0.left + d.x, y = r.top - tr0.top + d.y;
    const res = tr.tap(d.i, performance.now());
    if (res === 'miss' && !rd()) { const m = nextMiss(missCount(), false); setMiss(m.n); if (m.show) showHint(); }
    paint(tr.step);
    clearTimeout(hide); hide = setTimeout(() => paint(0), TUNE_GAP + 400);
    if (res === 'ok') glyph(x, y - 16, ['♪', '♫'][tr.step % 2]);
    if (res === 'done') {
      paint(TUNE.length); setTimeout(() => paint(0), 1400);
      const first = !rd(); wr(); hintBox.classList.remove('show'); cancelAnimationFrame(hintRaf);
      try { audio.play('levelup'); } catch (er) { /* ignore */ }
      if (!reduced()) for (let j = 0; j < 9; j++) glyph(x + (j - 4) * 14, y - 10, ['♪', '♫', '★', '♡'][j % 4], 'big d' + (j % 3));
      stk.hidden = false; stk.classList.remove('land'); void stk.offsetWidth; stk.classList.add('land');
      if (first && onDone) onDone();
    }
  });
  stk.addEventListener('click', () => { audio.play('click'); play(); });
  return { play };
}
