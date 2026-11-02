// Round 10 title polish (agent 12). Small, cosmetic, no save changes (own localStorage key for the extra secrets).
//  - a secrets counter chip on the title (appears after the first secret): "found 1 of 3"; the Stats sticker book
//    gets a "Secret Keeper" sticker for all three
//  - a keyboard and screen reader path for the title tune: a focusable button, each Enter pokes the next note
//  - idle polish: every few quiet seconds the logo letters hop in a wave
import { TUNE, hasSticker } from './title_b8.js';
const KEY = 'cell_serpent_sec13';
export const SECRET_IDS = ['tune', 'logo', 'duet'];
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const rdSet = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return new Set(Array.isArray(a) ? a.filter(x => SECRET_IDS.includes(x)) : []); } catch (e) { return new Set(); } };
const wrSet = s => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch (e) { /* ignore */ } };
// the secrets found so far (the tune lives in its own old key and is read, never moved)
export function secretsFound() { const s = rdSet(); if (hasSticker()) s.add('tune'); return SECRET_IDS.filter(id => s.has(id)); }
export function markSecret(id) { if (!SECRET_IDS.includes(id)) return false; const s = rdSet(); if (s.has(id)) return false; s.add(id); wrSet(s); return true; }
export const allSecrets = () => secretsFound().length === SECRET_IDS.length;
export const secretLabel = n => (n >= SECRET_IDS.length ? 'All secrets found' : `Secrets found: ${n} of ${SECRET_IDS.length}`);

// keyboard path: which body cell the next press pokes, and what the screen reader hears
export const keyCell = step => TUNE[((step % TUNE.length) + TUNE.length) % TUNE.length];
export const keySay = step => (step >= TUNE.length ? 'Tune finished' : `Note ${step + 1} of ${TUNE.length}`);

export function setupTitle10(title, audio) {
  if (!title || title._t10) return null;
  title._t10 = true;
  const keep = title.querySelector('.row'), cv = title.querySelector('.snake5');
  // ---- counter chip
  const chip = document.createElement('div'); chip.className = 'sec10'; chip.setAttribute('role', 'status');
  const paintChip = pop => {
    const n = secretsFound().length; chip.hidden = n === 0;
    chip.setAttribute('aria-label', secretLabel(n));
    chip.innerHTML = '<i aria-hidden="true">✦</i><b aria-hidden="true">' + n + '/' + SECRET_IDS.length + '</b>';
    chip.classList.toggle('all', n === SECRET_IDS.length);
    if (pop && !reduced()) { chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
  };
  title.insertBefore(chip, keep); paintChip(false);
  title.addEventListener('secretfound', e => { if (e.detail && markSecret(e.detail.id)) paintChip(true); else paintChip(false); });
  title.addEventListener('snakepoke', () => setTimeout(() => paintChip(false), 60));   // the tune sticker is written by the tune tracker
  // ---- keyboard path
  const kb = document.createElement('button'); kb.type = 'button'; kb.className = 'kb10'; kb.textContent = 'Snake tune';
  kb.setAttribute('aria-label', 'Snake tune. Press Enter to poke the next note of the hidden tune.');
  const live = document.createElement('div'); live.className = 'kbl10'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  title.insertBefore(kb, keep); title.insertBefore(live, keep);
  let step = 0, idleT = 0;
  kb.addEventListener('click', () => {
    const i = keyCell(step), p = cv && cv._cell ? cv._cell(i) : { x: 100, y: 60 };
    title.dispatchEvent(new CustomEvent('snakepoke', { detail: { hit: true, kb: true, x: Math.max(8, Math.min(p.W ? p.W - 8 : 300, p.x)), y: p.y, i } }));
    step++; live.textContent = keySay(step - 1);
    if (step >= TUNE.length) { step = 0; setTimeout(() => { live.textContent = hasSticker() ? 'Tune finished. Sticker found.' : 'Tune finished'; }, 400); }
  });
  // ---- idle polish: after a quiet spell the logo letters hop in a wave
  const logo = title.querySelector('.logo');
  const hop = () => {
    if (reduced() || document.hidden || !title.getClientRects().length || !logo || !logo.querySelectorAll) return;
    if (performance.now() - idleT < 6000) return;
    [...logo.querySelectorAll('span')].forEach((sp, j) => sp.animate && sp.animate([{ translate: '0 0' }, { translate: '0 -7px', offset: 0.45 }, { translate: '0 0' }], { duration: 620, delay: j * 160, easing: 'cubic-bezier(.3,1.5,.5,1)' }));
  };
  const touch = () => { idleT = performance.now(); };
  touch(); title.addEventListener('pointerdown', touch); title.addEventListener('keydown', touch);
  const timer = setInterval(hop, 7000);
  return { chip, kb, paintChip, stop() { clearInterval(timer); } };
}
