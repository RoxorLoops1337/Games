// Stage map polish, batch 13 (agent f): the ALL STAGES sheet gets a sticky preview card. Tapping a stage selects it
// in the sheet and shows who waits there (face, name, twists, cells, HP, your power against the recommended one);
// GO (or a second tap on the same stage) jumps to it. Pure helpers first, then one small DOM function.

// how your power stands against the stage: ok / close / risky, with the label the card shows
export function powerTag(mine, rec) {
  const m = Math.max(0, mine | 0), r = Math.max(1, rec | 0), ratio = m / r;
  if (ratio >= 1) return { id: 'ok', label: 'READY', gap: 0 };
  if (ratio >= 0.75) return { id: 'close', label: 'CLOSE', gap: r - m };
  return { id: 'risky', label: 'RISKY', gap: r - m };
}
const kHP = h => (h >= 1000 ? (h / 1000).toFixed(1) + 'k' : String(h));
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// the preview card body (no canvas: the face is painted after). c = { n, info, stars, best, mine, rec, locked, done, next }
export function previewHTML(c) {
  const i = c.info, tag = powerTag(c.mine, c.rec);
  const badges = (i.boss ? '<i class="pvb boss">BOSS</i>' : '') + (i.kind === 'ring' ? '<i class="pvb">CIRCLE</i>' : '') + (i.kind === 'double' ? '<i class="pvb">DOUBLE</i>' : '');
  const state = c.done ? `Cleared ${[1, 2, 3].map(q => (q <= c.stars ? '<u>★</u>' : '★')).join('')}` : c.next ? 'Next to clear' : 'Not cleared yet';
  return `<canvas class="pvface" width="96" height="96" aria-hidden="true"></canvas>` +
    `<div class="pvtxt"><small>STAGE ${c.n} ${badges}</small><b>${esc(i.name)}</b>` +
    `<span class="pvm">Cells ${i.length} · HP ${kHP(i.hp)}${c.best ? ' · Best ' + c.best + '%' : ''}</span>` +
    `<span class="pvs">${state}${c.done || c.next ? ` <em class="pvt ${tag.id}">${tag.label}${tag.gap ? ' +' + tag.gap + ' PWR' : ''}</em>` : ''}</span></div>` +
    `<button type="button" class="pvgo" aria-label="Go to stage ${c.n}">GO</button>`;
}

// paints a small static face (cheap: only when the previewed stage changes)
export function paintFace(cv, kit, info) {
  if (!cv || !kit || !kit.drawHead) return;
  const c = cv.getContext('2d'), S = cv.width, sp = kit.SPECIES && kit.SPECIES[info.skin];
  c.clearRect(0, 0, S, S);
  if (sp) { const gl = c.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.5); gl.addColorStop(0, sp.lite + 'aa'); gl.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gl; c.fillRect(0, 0, S, S); }
  try { kit.drawHead(c, S / 2, S / 2, 30 * (info.boss ? 1.12 : 1), Math.PI / 2, { skin: info.skin, boss: info.boss, t: 0, look: [0, 0.8] }); } catch (e) { /* cosmetic */ }
}

// wires the sheet: c = the openOverview options plus { info(n), mine(), rec(n), kit() }. Returns true when it took over the taps.
export function wirePreview(sh, c, close) {
  if (!c.info || !c.mine || !c.rec) return false;
  const body = sh.querySelector('.ovbody'), s = c.save(), bar = document.createElement('div');
  bar.className = 'ovpv'; bar.setAttribute('aria-live', 'polite'); sh.appendChild(bar);
  const cleared = s.cleared || 0;
  let cur = 0;
  const show = n => {
    cur = n; for (const b of body.querySelectorAll('.ovc.sel')) b.classList.remove('sel');
    const cell = body.querySelector('.ovc[data-n="' + n + '"]'); if (cell) cell.classList.add('sel');
    bar.innerHTML = previewHTML({ n, info: c.info(n), stars: (s.stars || {})[n] || 0, best: (s.prog || {})[n] || 0, mine: c.mine(), rec: c.rec(n), done: n <= cleared, next: n === cleared + 1 });
    paintFace(bar.querySelector('.pvface'), c.kit && c.kit(), c.info(n));
    bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop');
  };
  bar.addEventListener('click', e => { if (e.target.closest('.pvgo') && cur) { c.audio.play('click'); close(); c.pick(cur); } });
  body.addEventListener('click', e => {
    const b = e.target.closest('.ovc'); if (!b || b.disabled) return;
    const n = +b.dataset.n;
    if (n === cur) { c.audio.play('click'); close(); c.pick(n); return; }
    c.audio.play('click'); show(n);
  });
  show(c.sel());
  return true;
}
