// Cell Serpent, batch 12 (agent p): the DOM side of the progressive hub. apply() hides what is still locked (html classes
// lk-<id> that the 35-p-unlock CSS block understands), lays the tab bar out with only the open tabs (plus ONE grey teaser for
// the next one), pops a tab in when it arrives, and runs the hint queue: one friendly card at a time, tap to dismiss, shown once.
import {
  TABS, UNLOCKS, TAB_UNLOCK, isUnlocked, isLegacy, visibleTabs, nextLockedTab, pendingHints, inTabHint, markSeen, isSeen, tabLayout, unlockAllOn,
} from './unlock_b12p.js';

const SEL_TAB = tab => `.tabs button[data-tab="${tab}"]`;
// where a Battle element hint points (data-uk is set on the side chips by hub2.renderSide)
const SEL_EL = {
  sign: '#battleSide .sidebtn[data-uk="sign"]', fund: '#battleSide .sidebtn[data-uk="fund"]', swap: '#battleSide .sidebtn[data-uk="swap"]',
  event: '#battleSide .sidebtn[data-uk="event"]', wheel: '#battleSide .sidebtn[data-uk="wheel"]', backstage: '#battleSide .sidebtn[data-uk="backstage"]',
  trophies: '#battleSide .sidebtn[data-uk="trophies"]', gigs: '#tabBattle .gl-box .gl-head', hard: '#diffRow .seg', quests: '#qOpen', season: '#qSeason',
  stickers: '#tabStats .stkbook .sec',
};
// the first useful button inside a new tab
const SEL_IN = {
  Skills: ['#skillList .tile'], Stats: ['#statList .sc button:not([disabled])', '#statList .sc button'],
  Pets: ['#petList .eggstage:not([disabled])', '#petList .tile'], Shop: ['#boxList .tile button:not([disabled])', '#boxList .featban button'], Gear: ['#gearBody .kcard'],
};
const visible = el => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; for (let a = el; a && a !== document.body; a = a.parentElement) { if (a.hidden) return false; const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };

export function createUnlockUI(c) {
  const doc = document, root = doc.documentElement, order = c.order;   // order: the live array of open tabs (bindHubSwipe and tabDir read it)
  let prev = null, card = null, cardFor = null, teaser = null, pumpT = 0, scrollBound = false;

  // ---- the tab bar
  function layoutTabs(save) {
    const nav = doc.querySelector('.tabs'); if (!nav) return;
    const vis = visibleTabs(save), tz = nextLockedTab(save);
    const fresh = [];
    for (const b of nav.querySelectorAll('button[data-tab]')) {
      const open = vis.includes(b.dataset.tab);
      b.hidden = !open;
      if (open && prev && !prev.includes(b.dataset.tab)) fresh.push(b);
      const id = TAB_UNLOCK[b.dataset.tab], nw = open && !isLegacy(save) && !unlockAllOn() && id && id !== 'battle' && !isSeen(save, 'vis_' + id);
      let badge = b.querySelector('.newb');
      if (nw && !badge) { badge = doc.createElement('i'); badge.className = 'newb'; badge.textContent = 'NEW'; b.appendChild(badge); }
      else if (!nw && badge) badge.remove();
    }
    order.length = 0; for (const t of vis) order.push(t);
    // one grey teaser for the very next tab: tapping it says what to clear
    if (!teaser) { teaser = doc.createElement('button'); teaser.type = 'button'; teaser.className = 'lockt'; teaser.onclick = () => { if (c.audio) c.audio.play('deny'); c.toast('Clear stage ' + teaser.dataset.need + ' to open ' + teaser.dataset.label); }; }
    if (tz) {
      teaser.dataset.need = String(tz.need); teaser.dataset.label = tz.label;
      teaser.innerHTML = `<b aria-hidden="true">\u{1F512}</b><span>Stage ${tz.need}</span>`;
      teaser.setAttribute('aria-label', `${tz.label}, locked. Clear stage ${tz.need} to open it`);
      if (teaser.parentNode !== nav) nav.appendChild(teaser); else if (nav.lastElementChild !== teaser) nav.appendChild(teaser);
      teaser.hidden = false;
    } else if (teaser.parentNode) teaser.remove();
    const n = vis.length + (tz ? 1 : 0), L = tabLayout(n, nav.clientWidth || innerWidth);
    nav.style.setProperty('--n', String(n)); nav.classList.toggle('few', L.few);
    if (L.few) nav.style.setProperty('--fw', L.w + 'px'); else nav.style.removeProperty('--fw');
    for (const b of fresh) { b.classList.remove('arrive'); void b.offsetWidth; b.classList.add('arrive'); if (c.audio) c.audio.play('levelup'); setTimeout(() => b.classList.remove('arrive'), 1400); }
    prev = vis.slice();
  }

  // ---- hide what is still locked
  function classes(save) {
    for (const u of UNLOCKS) { if (u.step === 0) continue; root.classList.toggle('lk-' + u.id, !isUnlocked(u.id, save)); }
    const pb = doc.getElementById('pigBox'), pbox = pb && pb.parentElement;
    if (pbox) pbox.hidden = !(isUnlocked('event', save) || isUnlocked('pig', save) || isUnlocked('invasion', save));
    const gl = doc.querySelector('#tabBattle .gl-box'); if (gl) gl.hidden = !isUnlocked('gigs', save);
    const side = doc.getElementById('battleSide'); if (side) side.hidden = !side.children.length;
  }

  // ---- the hint card
  function dropCard() { if (card) { card.remove(); card = null; cardFor = null; const hb = doc.getElementById('hub'); if (hb) { hb.classList.remove('ukh-tab'); hb.style.removeProperty('--ukh'); } } }
  function place() {
    if (!card || !cardFor) return;
    const t = cardFor.target(); if (!visible(t)) { card.classList.add('off'); return; }
    const hubBody = doc.querySelector('.hubbody'), hr = hubBody ? hubBody.getBoundingClientRect() : null, r = t.getBoundingClientRect();
    if (cardFor.kind !== 'tab' && hr && (r.bottom < hr.top + 8 || r.top > hr.bottom - 8)) { card.classList.add('off'); return; }
    card.classList.remove('off');
    const w = Math.min(300, innerWidth - 24); card.style.width = w + 'px';
    const cx = r.left + r.width / 2, left = Math.max(12, Math.min(innerWidth - w - 12, cx - w / 2));
    card.style.left = left + 'px'; card.style.setProperty('--ax', Math.max(18, Math.min(w - 18, cx - left)) + 'px');
    const ch = card.offsetHeight || 54;
    const nav = doc.querySelector('.tabs'), navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
    if (cardFor.kind === 'tab') { card.classList.add('up'); card.classList.remove('down'); card.style.top = (r.top - ch - 12) + 'px'; }
    else if (r.bottom + ch + 16 < navTop - 6) { card.classList.add('down'); card.classList.remove('up'); card.style.top = (r.bottom + 12) + 'px'; }
    else { card.classList.add('up'); card.classList.remove('down'); card.style.top = Math.max(8, r.top - ch - 12) + 'px'; }
  }
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16);
  function show(h) {
    dropCard();
    const key = h.key, tab = h.kind === 'new' && TAB_UNLOCK[h.tab] === h.id;
    const target = () => (tab ? doc.querySelector(SEL_TAB(h.tab)) : h.kind === 'in' ? firstIn(h.tab) : doc.querySelector(SEL_EL[h.el] || '#none'));
    const kind = tab ? 'tab' : 'el';
    card = doc.createElement('button'); card.type = 'button'; card.className = 'ukh'; card.dataset.key = key;
    card.setAttribute('aria-label', h.text + '. Tap to dismiss');
    card.innerHTML = `<span class="ukh-t"></span><i class="ukh-a" aria-hidden="true"></i>`; card.firstChild.textContent = h.text;
    card.onclick = () => dismiss(h);
    doc.body.appendChild(card); cardFor = { key, kind, target, h };
    const hb = doc.getElementById('hub'); if (kind === 'tab' && hb) { hb.classList.add('ukh-tab'); hb.style.setProperty('--ukh', '66px'); }
    if (kind === 'el') { const t = target(); if (t && t.scrollIntoView && !visible(t)) { /* hidden by a scroll: place() hides the card */ } }
    raf(() => { place(); card && card.classList.add('in'); });
    if (c.audio) c.audio.play('tabping');
    if (!scrollBound) { scrollBound = true; addEventListener('resize', () => place()); doc.addEventListener('scroll', () => raf(place), true); }
  }
  function firstIn(tab) { for (const s of SEL_IN[tab] || []) { const e = doc.querySelector(s); if (e && visible(e)) return e; } return null; }
  function dismiss(h) {
    const save = c.save(); if (markSeen(save, h.key)) c.persist();
    if (h.kind === 'new' && TAB_UNLOCK[h.tab] === h.id) { /* the tab hint also counts as the tab being noticed */ }
    if (c.audio) c.audio.play('click');
    dropCard(); clearTimeout(pumpT); pumpT = setTimeout(pump, 420);
  }

  // ---- the queue: one card at a time, never while a panel or the run is on screen
  function pump() {
    const save = c.save();
    if (unlockAllOn() || isLegacy(save) || c.mode() !== 'hub' || c.shown() !== 'hub') { if (card && (c.mode() !== 'hub' || c.shown() !== 'hub')) dropCard(); return; }
    const hub = doc.getElementById('hub'); if (!hub || hub.classList.contains('hub-skel')) return;
    const tab = c.tab();
    // visiting a tab clears its NEW badge and counts as having seen the tab hint
    const tid = TAB_UNLOCK[tab];
    if (tid && tid !== 'battle' && isUnlocked(tid, save)) {
      let ch = false; if (markSeen(save, 'vis_' + tid)) ch = true; if (markSeen(save, 'h_' + tid)) ch = true;
      if (ch) { c.persist(); const b = doc.querySelector(SEL_TAB(tab) + ' .newb'); if (b) b.remove(); if (cardFor && cardFor.h.id === tid && cardFor.kind === 'tab') dropCard(); }
    }
    if (card) { place(); return; }
    const inn = inTabHint(save, tab);
    if (inn && firstIn(tab)) return show(inn);
    for (const h of pendingHints(save)) {
      if (TAB_UNLOCK[h.tab] === h.id) { if (visible(doc.querySelector(SEL_TAB(h.tab))) && tab !== h.tab) return show(h); continue; }
      if (h.tab === tab && visible(doc.querySelector(SEL_EL[h.el] || '#none'))) return show(h);
    }
  }
  const later = () => { clearTimeout(pumpT); pumpT = setTimeout(pump, 650); };

  return {
    apply(save) { classes(save); layoutTabs(save); later(); },
    pump, dropCard, current: () => (cardFor ? cardFor.key : ''), pendingNow: () => pendingHints(c.save()), teaserEl: () => teaser,
  };
}

// the Goals panel is one long page: keep out the sections that are not open yet (weekly challenge, mastery, collection book)
export function trimGoalsPanel(body, save) {
  if (!body || isLegacy(save) || unlockAllOn()) return;
  const rules = [[/^Weekly Challenge/i, 'badges'], [/^Mastery/i, 'records_gold'], [/^Collection Book/i, 'book']];
  const kids = [...body.children];
  let drop = false;
  for (const el of kids) {
    if (el.classList && el.classList.contains('sec')) {
      const t = (el.textContent || '').trim(), r = rules.find(x => x[0].test(t));
      drop = !!(r && !isUnlocked(r[1], save));
    }
    if (drop) el.remove();
  }
}
