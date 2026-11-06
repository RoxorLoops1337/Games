// Round 11 hub touches (agent 10): a recent runs chart for the Stats tab, bundle and pack presentation for the Shop,
// and the Sparkles flight from the sticker prize up to the top bar. Pure helpers (testable headless) plus small DOM passes;
// hub2.js only calls them. The run log lives in its own localStorage key, the save is untouched.

// ---- recent runs log
export const RUNLOG_KEY = 'cell_serpent_runlog_b11';
export const RUNLOG_MAX = 12;
export function readRuns(store) {
  try {
    const st = store || (typeof localStorage !== 'undefined' ? localStorage : null); if (!st) return [];
    const a = JSON.parse(st.getItem(RUNLOG_KEY) || '[]');
    return Array.isArray(a) ? a.filter(r => r && Number.isFinite(r.s) && r.s >= 1).slice(-RUNLOG_MAX).map(r => ({ s: r.s | 0, w: r.w ? 1 : 0, k: Math.max(0, r.k | 0), t: r.t | 0 })) : [];
  } catch (e) { return []; }
}
// r = the sim result ({ stage, won, kills, ... }); keeps the last RUNLOG_MAX runs
export function logRun(r, store, now = Date.now()) {
  try {
    if (!r || !(r.stage >= 1)) return null;
    const st = store || localStorage, a = readRuns(st);
    a.push({ s: r.stage | 0, w: r.won ? 1 : 0, k: Math.max(0, (r.kills || 0) | 0), t: Math.floor(now / 1000) });
    const out = a.slice(-RUNLOG_MAX); st.setItem(RUNLOG_KEY, JSON.stringify(out)); return out;
  } catch (e) { return null; }
}
export function runStats(runs) {
  const n = runs.length, wins = runs.filter(r => r.w).length, top = runs.reduce((m, r) => Math.max(m, r.s), 0);
  let streak = 0; for (let i = n - 1; i >= 0 && runs[i].w; i--) streak++;
  return { n, wins, top, streak, pct: n ? Math.round(wins / n * 100) : 0 };
}
// bar heights are relative to the deepest stage in the log, with a floor so a stage 1 run is still a visible stub
export const barPct = (s, top) => Math.max(14, Math.round(s / Math.max(1, top) * 100));
export function runLogHTML(runs) {
  if (!runs.length) return '';
  const st = runStats(runs), last = runs[runs.length - 1];
  const bars = runs.map((r, i) => `<i class="rb${r.w ? ' win' : ''}${i === runs.length - 1 ? ' last' : ''}" style="height:${barPct(r.s, st.top)}%" title="Stage ${r.s}${r.w ? ' cleared' : ''}"><u>${r.s}</u></i>`).join('');
  const cap = st.streak > 1 ? `${st.streak} cleared in a row` : last.w ? 'Last gig: cleared!' : `Last gig: stage ${last.s}`;
  return `<div class="sec"><span style="background:#2f8fd0">Recent Gigs</span></div><div class="runlog" role="img" aria-label="Last ${st.n} runs, ${st.wins} cleared"><div class="rlbars">${bars}</div><div class="rlcap"><span><b>${st.wins}/${st.n}</b> cleared</span><span>${cap}</span></div></div>`;
}

// ---- shop bundles and packs
export const PACK_SNACK = { bit: 'Granola crumbs', bag: 'Trail mix bag', box: 'Pantry box' };
// the Grand Spark Box is ten Spark Boxes in one: how many Sparkles it saves versus ten single ones
export function bundleSaving(BOXES) {
  const one = BOXES.find(b => b.id === 'spark'), big = BOXES.find(b => b.top && b.id !== 'spark');
  if (!one || !big || big.cur !== one.cur) return 0;
  return Math.max(0, one.price * 10 - big.price);
}
// Beats per Sparkle for each priced pack, and which one is the best value
export function packValue(GOLD_PACKS) {
  const rows = GOLD_PACKS.filter(p => p.price > 0).map(p => ({ id: p.id, per: Math.round(p.beats / p.price * 10) / 10 }));
  const best = rows.reduce((m, r) => (!m || r.per > m.per ? r : m), null);
  return { rows, best: best && rows.filter(r => r.per === best.per).length === 1 ? best.id : '' };
}
// one snack pip per treat: a carrot-orange pip for each treat still on the tray, a hollow one for each that was eaten
export function treatPips(deals, bought) {
  const el = document.createElement('span'); el.className = 'tpips'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = deals.map((d, i) => `<i class="${bought && bought[i] ? 'eaten' : ''}"></i>`).join('');
  return el;
}
const rib = (t, cls) => { const i = document.createElement('i'); i.className = 'bunrib' + (cls ? ' ' + cls : ''); i.textContent = t; return i; };
// Finds the tiles by their printed name and pins a ribbon on them.
export function decorateBundles(list, BOXES, GOLD_PACKS) {
  const byName = n => [...list.querySelectorAll('.tile')].find(t => { const e = t.querySelector('.nm'); return e && e.textContent.trim() === n; });
  const sv = bundleSaving(BOXES), big = BOXES.find(b => b.top && b.id !== 'spark');
  const bt = big && byName(big.name);
  if (bt && sv > 0 && !bt.querySelector('.bunrib')) { bt.classList.add('bundle'); bt.appendChild(rib('SAVE ' + sv, 'sv')); const ic = bt.querySelector('.ic'); if (ic) ic.insertAdjacentHTML('beforeend', '<b class="bunx">x10</b>'); }
  const pv = packValue(GOLD_PACKS);
  GOLD_PACKS.forEach((p, i) => {
    const t = byName(p.name); if (!t || t.querySelector('.snk')) return;
    t.classList.add('pack'); if (GOLD_PACKS.length % 2 && i === GOLD_PACKS.length - 1) t.classList.add('one');
    const nm = t.querySelector('.nm'); if (nm && PACK_SNACK[p.id]) nm.insertAdjacentHTML('afterend', `<small class="snk">${PACK_SNACK[p.id]}</small>`);
    if (pv.best === p.id) { t.classList.add('bestval'); t.appendChild(rib('BEST VALUE')); }
  });
}

// ---- Sparkles that fly from a button up to the Sparkles pill in the top bar (sticker prize claim)
export function sparkleFlight(fromEl, calm, onLand, opts = {}) {
  const pill = document.getElementById('hSpark') || document.getElementById('tSpark'), src = opts.src || '';
  if (!fromEl || !pill || calm || typeof fromEl.animate !== 'function') { if (onLand) onLand(); return 0; }
  const a = fromEl.getBoundingClientRect(), b = pill.getBoundingClientRect(); if (!b.width) { if (onLand) onLand(); return 0; }
  const tx = b.left + b.width / 2, ty = b.top + b.height / 2, n = opts.n || 8; let left = n;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'); p.className = 'spflight'; if (src) p.style.backgroundImage = `url(${src})`;
    const sx = a.left + a.width / 2 + (Math.random() - 0.5) * a.width * 0.6, sy = a.top + a.height / 2;
    p.style.left = (sx - 11) + 'px'; p.style.top = (sy - 11) + 'px'; document.body.appendChild(p);
    const dx = tx - sx, dy = ty - sy, side = (Math.random() - 0.5) * 120;
    const an = p.animate([{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { transform: `translate(${side}px,${-30 - Math.random() * 30}px) scale(1.25)`, opacity: 1, offset: 0.3 }, { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: 0.95 }], { duration: 760 + i * 40, delay: i * 60, easing: 'cubic-bezier(.45,0,.75,.55)', fill: 'backwards' });
    an.onfinish = () => { p.remove(); pill.classList.remove('spgot'); void pill.offsetWidth; pill.classList.add('spgot'); setTimeout(() => pill.classList.remove('spgot'), 400); if (!--left && onLand) onLand(); };
  }
  return n;
}
