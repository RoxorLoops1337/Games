// Batch 12 (agent r): progressive disclosure for the hub tabs and sheets. One reusable collapsible section:
// a 44 px button header (title, small note, a "new" dot when something inside is claimable or new, a chevron) over a body.
// Collapsed bodies are display:none and inert, so they are not tappable, focusable or counted as visible.
// State per section is remembered in its own localStorage key; junk or a blocked store falls back to the defaults.
const KEY = 'cell_serpent_fold_b12r';
const known = new Set();   // every section id seen this session (the test hook opens them all)
let mem = null, forceAll = false;

export function loadState(store) {
  try {
    const raw = (store || globalThis.localStorage).getItem(KEY), v = JSON.parse(raw);
    const out = {}; if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v)) if (v[k] === 0 || v[k] === 1) out[String(k).slice(0, 48)] = v[k];
    return out;
  } catch (e) { return {}; }
}
function state() { return mem || (mem = loadState()); }
function saveState() { try { globalThis.localStorage.setItem(KEY, JSON.stringify(mem || {})); } catch (e) { /* private mode: fine */ } }
export function isOpen(id, def) { if (forceAll) return true; const v = state()[id]; return v === 1 ? true : v === 0 ? false : !!def; }
export function setOpen(id, open) { state()[id] = open ? 1 : 0; saveState(); }
export function resetMemory() { mem = null; }   // tests: forget the in-memory copy and read the store again

export function reduced() {
  try { if (document.documentElement.classList.contains('rm')) return true; return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
let uid = 0;

// the section element. nodes: elements moved into the body. dot: boolean or a function (re-read by refreshDots).
export function makeFold({ id, title, def = false, note = '', dot = false, nodes = [], cls = '' }) {
  known.add(id);
  const n = ++uid, open = isOpen(id, def);
  const f = document.createElement('section'); f.className = 'fold' + (open ? ' open' : '') + (cls ? ' ' + cls : ''); f.dataset.fold = id;
  f.innerHTML = `<button type="button" class="fold-h" id="fh-${n}" aria-expanded="${open}" aria-controls="fb-${n}"><span class="fold-t">${esc(title)}</span><span class="fold-n"></span><i class="fold-dot" aria-hidden="true"></i><span class="fold-c" aria-hidden="true"></span></button><div class="fold-b" id="fb-${n}" role="group" aria-labelledby="fh-${n}"></div>`;
  const b = f.querySelector('.fold-b'), h = f.querySelector('.fold-h');
  for (const x of nodes) b.appendChild(x);
  if (!open) { b.hidden = true; b.setAttribute('inert', ''); }
  setNote(f, note);
  f.__dot = dot; h.dataset.title = title;
  h.addEventListener('click', () => toggle(f));   // a real button: Enter and Space click it natively
  paintDot(f);
  return f;
}
export function setNote(f, note) { const e = f.querySelector(':scope > .fold-h .fold-n'); if (e) e.textContent = note || ''; }
function paintDot(f) {
  const d = typeof f.__dot === 'function' ? !!f.__dot(f) : !!f.__dot, h = f.querySelector(':scope > .fold-h');
  f.classList.toggle('has-dot', d);
  if (h) h.setAttribute('aria-label', h.dataset.title + (f.querySelector(':scope > .fold-h .fold-n').textContent ? ', ' + f.querySelector(':scope > .fold-h .fold-n').textContent : '') + (d ? ', something new inside' : ''));
}
export function refreshDots(root = document) { for (const f of root.querySelectorAll('.fold')) paintDot(f); }

export function toggle(f, force, animate = true) {
  const b = f.querySelector(':scope > .fold-b'), h = f.querySelector(':scope > .fold-h');
  const open = force === undefined ? !f.classList.contains('open') : !!force;
  if (open === f.classList.contains('open') && force !== undefined) return open;
  f.classList.toggle('open', open); h.setAttribute('aria-expanded', String(open));
  if (f.dataset.fold && !forceAll) setOpen(f.dataset.fold, open);
  if (open) b.removeAttribute('inert'); else b.setAttribute('inert', '');
  clearTimeout(f.__t);
  const reset = () => { b.style.height = ''; b.style.overflow = ''; b.style.transition = ''; };
  if (!animate || reduced()) { reset(); b.hidden = !open; return open; }
  if (open) {
    b.hidden = false; const to = b.scrollHeight;
    b.style.overflow = 'hidden'; b.style.height = '0px'; void b.offsetHeight;
    b.style.transition = 'height .2s ease'; b.style.height = to + 'px';
    f.__t = setTimeout(reset, 240);
  } else {
    b.style.overflow = 'hidden'; b.style.height = b.scrollHeight + 'px'; void b.offsetHeight;
    b.style.transition = 'height .18s ease'; b.style.height = '0px';
    f.__t = setTimeout(() => { reset(); if (!f.classList.contains('open')) b.hidden = true; }, 220);
  }
  return open;
}

// move the given sibling nodes into a new section placed where the first one was (idempotent: skips nodes already folded)
export function wrapFold(nodes, opts) {
  nodes = nodes.filter(Boolean); if (!nodes.length || nodes[0].closest('.fold-b')) return null;
  const f = makeFold({ ...opts, nodes: [] }), at = nodes[0];
  at.parentNode.insertBefore(f, at);
  const b = f.querySelector(':scope > .fold-b'); for (const x of nodes) b.appendChild(x);
  paintDot(f); return f;
}

// ---- flat groups (the settings sheet): the heading keeps its place and the rows after it hide, so the settings search still works
export function bindGroup(head, rows, { id, def = false }) {
  if (!head || head.dataset.fg) return null;
  known.add(id); head.dataset.fg = id;
  const n = ++uid, open0 = isOpen(id, def);
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fold-h fold-g'; btn.id = 'fh-' + n;
  const label = head.textContent.trim(); head.textContent = '';
  btn.innerHTML = `<span class="fold-t">${esc(label)}</span><span class="fold-c" aria-hidden="true"></span>`; head.appendChild(btn);
  const ids = []; for (const r of rows) { if (!r.id) r.id = 'fg-' + n + '-' + ids.length; ids.push(r.id); }
  btn.setAttribute('aria-controls', ids.join(' '));
  const paint = open => { btn.setAttribute('aria-expanded', String(open)); head.classList.toggle('open', open); for (const r of rows) { r.classList.toggle('fg-shut', !open); if (open) r.removeAttribute('inert'); else r.setAttribute('inert', ''); } };
  paint(open0);
  btn.addEventListener('click', () => { const o = btn.getAttribute('aria-expanded') !== 'true'; if (!forceAll) setOpen(id, o); paint(o); });
  return btn;
}

// ---- tab layouts: which parts of each hub tab sit behind a header (called at the end of each tab render)
const q = (root, s) => (root ? root.querySelector(s) : null), qa = (root, s) => (root ? [...root.querySelectorAll(s)] : []);
const sibsAfter = (el, stop) => { const out = []; for (let x = el.nextElementSibling; x && !stop(x); x = x.nextElementSibling) out.push(x); return out; };
const isSec = x => x.classList.contains('sec');
const cnt = nodes => nodes.filter(x => x.classList.contains('tile') || x.classList.contains('kcard')).length;

const TAB = {
  Stats(root) {
    const list = q(root, '#statList');
    const rec = q(list, '.recbox'); if (rec) { const sc = q(rec, '.sec'); if (sc) sc.hidden = true; wrapFold([rec], { id: 'stats.bests', title: 'Personal bests' }); }
    const run = q(list, '.runbox'); if (run) { const sc = q(run, '.sec'); if (sc) sc.hidden = true; wrapFold([run], { id: 'stats.gigs', title: 'Recent gigs' }); }
    const bk = q(list, '.stkbook'); if (bk) {
      const sc = q(bk, '.sec'), m = sc && /(\d+\/\d+)/.exec(sc.textContent); if (sc) sc.hidden = true;
      wrapFold([bk], { id: 'stats.stickers', title: 'Sticker book', note: m ? m[1] : '', dot: () => !!bk.querySelector('.stk.new, .stkprize:not(.got)') });
    }
  },
  Skills(root) {
    const pr = q(root, '#presetRow'), rs = q(root, '#recStrip');
    if (pr) wrapFold([pr, rs], { id: 'skills.builds', title: 'Builds and picks' });
    const list = q(root, '#skillList'), no = qa(list, '.sec').find(s => /Not Owned/i.test(s.textContent));
    if (no) { const tiles = sibsAfter(no, isSec), n = cnt(tiles); no.hidden = true; wrapFold([no, ...tiles], { id: 'skills.locked', title: 'Not owned yet', note: String(n), dot: f => !!f.querySelector('.tile.ready') }); }
  },
  Pets(root) {
    const pc = q(root, '#petList .pcoll'); if (pc) wrapFold([pc], { id: 'pets.book', title: 'Collection book', note: (/(\d+ \/ \d+)/.exec(pc.textContent) || [])[1] || '' });
  },
  Gear(root) {
    const ss = q(root, '#gearBody .setstrip'); if (ss) wrapFold([ss], { id: 'gear.sets', title: 'Set bonuses' });
  },
  Shop(root) {
    const list = q(root, '#boxList'); if (!list) return;
    const secs = qa(list, ':scope > .sec'), done = new Set();
    for (const s of secs) {
      const name = s.textContent.trim().replace(/\s+/g, ' ');
      if (/Today/i.test(name)) continue;
      const body = sibsAfter(s, isSec); s.hidden = true;
      const free = f => !![...f.querySelectorAll('button')].find(b => !b.disabled && /^\s*FREE\s*$/.test(b.textContent));
      wrapFold([s, ...body], { id: 'shop.' + name.toLowerCase().replace(/[^a-z]+/g, '-'), title: name, note: String(cnt(body)), dot: free });
      done.add(s);
    }
  },
  Battle(root) {
    const side = q(root, '#battleSide'); if (side) wrapFold([side], { id: 'battle.more', title: 'More', dot: () => !!side.querySelector('.alert') });
    const pig = q(root, '#pigBox'), box = pig && pig.parentElement; if (box && box.classList.contains('stagebox')) wrapFold([box], { id: 'battle.parade', title: 'Parade and events', dot: () => !!box.querySelector('.tile.ready, .tile .go:not(:disabled)') });
  },
};

export function foldTab(tab, root) {
  try { const r = root || document.getElementById('tab' + tab); if (TAB[tab]) TAB[tab](r); refreshDots(r); } catch (e) { /* cosmetic: never break a tab */ }
}

// settings: the heading buttons. SOUND AND FEEL stays open, the rest wait behind a tap. The search box forces everything open.
export function foldSettings(root) {
  try {
    if (!root || root.dataset.foldB12r) return; root.dataset.foldB12r = '1';
    const kids = [...root.children], heads = kids.filter(e => e.classList.contains('setgrp'));
    const vol = kids.find(e => e.id === 'volRow' || (e.classList.contains('volrow') && e.querySelector('#volRange')));
    if (vol && heads[1]) heads[1].before(vol);   // Volume belongs with the sound rows
    const all = [...root.children], end = all.findIndex(e => e.id === 'setClose');
    const groups = [['set.sound', true], ['set.access', false], ['set.controls', false]];
    heads.forEach((h, i) => {
      const from = all.indexOf(h), next = heads[i + 1] ? all.indexOf(heads[i + 1]) : all.findIndex(e => e.classList.contains('sgrp') && /Save data/i.test(e.textContent));
      const g = groups[i] || ['set.g' + i, false]; bindGroup(h, all.slice(from + 1, next < 0 ? end : next), { id: g[0], def: g[1] });
    });
    const sd = all.find(e => e.classList.contains('sgrp') && /Save data/i.test(e.textContent));
    if (sd) { sd.classList.add('setgrp', 'fold-sd'); bindGroup(sd, all.slice(all.indexOf(sd) + 1, end), { id: 'set.data', def: false }); }
    const inp = root.querySelector('#setFind11'); if (inp) inp.addEventListener('input', () => { const on = !!inp.value.trim(); root.classList.toggle('fold-searching', on); for (const r of root.querySelectorAll('.fg-shut')) { if (on) r.removeAttribute('inert'); else r.setAttribute('inert', ''); } });
  } catch (e) { /* cosmetic */ }
}

// test and QA hook: open (or close) every section, now and for sections built later
export function openAll(on = true) {
  forceAll = !!on;
  for (const f of document.querySelectorAll('.fold')) toggle(f, forceAll ? true : isOpen(f.dataset.fold, false), false);
  for (const h of document.querySelectorAll('[data-fg]')) { const b = h.querySelector('.fold-g'); if (b && (b.getAttribute('aria-expanded') === 'true') !== forceAll) b.click(); }
  return known.size;
}
export const hook = { isOpen: (id, d) => isOpen(id, d), open: id => { setOpen(id, true); const f = document.querySelector(`.fold[data-fold="${id}"]`); if (f) toggle(f, true, false); }, openAll, ids: () => [...known] };
