// First-run guided tutorial: spotlight ring around the real DOM element + a kit-style tooltip card.
// State lives inside the save object (S.flags.tut), never in a new localStorage key. Skippable at every step, honours ?notut=1.
// The current step is DERIVED from state every tick (first step whose met() is false), so playing out of order never breaks it.
//   const tut = createTutorial(game);  tut.maybeStart();  tut.skip();  tut.restart();  tut.state()
// No em dashes. Styles: .lx-tut* in css/ui.css.
import * as U from './ui_kit.js';

const h = U.h;
const QS = new URLSearchParams(location.search);

// ---------------------------------------------------------------- DOM probes (screens belong to other teams, so we look at the DOM)
const live = (sel, root = document) => [...root.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
const scrims = () => [...document.querySelectorAll('.lx-scrim:not(.lx-out)')];
const titleOf = (s) => ((s && s.querySelector('.lx-panel-head .lx-title')) || { textContent: '' }).textContent.trim();
const topScrim = () => { const a = scrims(); return a[a.length - 1] || null; };
// sheets and dialogs carry data-tut-sheet=<key> (set centrally in Game.sheet / Game.ask), buttons carry data-tut=<key>: no text lookups
const sheetBy = (key) => scrims().find((s) => s.dataset.tutSheet === key) || null;
const tutEl = (root, key) => live(`[data-tut="${key}"]`, root || document)[0] || null;

export function createTutorial(game) {
  let root, card, ring, dim, raf = 0, curId = null, running = false, lastTarget = null, wasHidden = true, shownId = null, shownAt = 0;

  const S = () => game.S;
  const T = () => { const s = S(); if (!s) return null; s.flags = s.flags || {}; return s.flags.tut && typeof s.flags.tut === 'object' ? s.flags.tut : null; };
  const mark = (k) => { const t = T(); if (t && !t[k]) { t[k] = 1; game.save(); } };
  const resultsOpen = () => { const t = topScrim(); return !!t && t.dataset.tutSheet === 'results'; };
  const fightOver = () => resultsOpen() || (game.scene === 'fight' && game.fightView && game.fightView.phase === 'outro');

  // ---------------------------------------------------------------- steps
  // target(): Element | null. met(t): step finished. when(): optional gate (return false to stay silent). pos: card placement hint.
  const STEPS = [
    { id: 'welcome', title: 'Welcome, Lanista', text: 'You run a gladiator school. Hire a fighter, train them each week, then send them to the arena for gold and glory. I will show you the way.', manual: 'Show me', block: true,
      met: (t) => !!t.welcome, when: () => game.scene === 'hub',
      avoid: () => { const s = sheetBy('recruit'); return s ? (live('.rc-card', s)[0] || tutEl(s, 'hire')) : null; } }, // the card must never sit on the first recruit card
    { id: 'hire', title: 'Hire your first fighter', text: 'Three citizens wait at the gate. Compare their stats and talent pips, then tap Hire on the one you like.',
      target: () => { const s = sheetBy('recruit'); return s ? tutEl(s, 'hire') : (game._recruitLater ? game.advBtn : null); }, // the sheet was closed on purpose: point at the hub button that reopens it
      met: (t) => S().glads.length > 0, when: () => game.scene === 'hub', rescue: () => { if (!S().glads.length && !scrims().length && !game._recruitLater) game.open('recruit', { first: true }); } }, // never fight a player who closed the sheet
    { id: 'roster', title: 'Open the Roster', text: 'Your fighters live here. Tap Roster to see their health, energy and what they will do this week.', hubOnly: true,
      target: () => tutEl(null, 'nav-roster'), met: (t) => !!t.rosterOpened || !!t.trained },
    { id: 'train', title: 'Plan their week', text: 'Each week a fighter follows a plan. Tap a stat to train it, or let Auto-plan choose for you. Tired fighters should rest.', manual: 'Got it', pos: 'below',
      target: () => { const s = sheetBy('roster'); if (!s) return null; return tutEl(s, 'auto-plan') || tutEl(s, 'plan-grid'); },
      met: (t) => !!t.trained || (!!t.rosterOpened && !sheetBy('roster')), when: () => !!sheetBy('roster') },
    { id: 'arena', title: 'Visit the Arena', text: 'Fights pay gold, fame and loot. Open the Arena to see the events on offer this week.', hubOnly: true,
      target: () => tutEl(null, 'nav-arena'), met: (t) => !!t.arenaOpened || entries() > 0 },
    { id: 'enter', title: 'Enter a duel', text: 'Pick an event you can win and tap Enter, then choose your fighter. A duel is a safe first test: the crowd decides their fate.', pos: 'above',
      target: () => { const s = sheetBy('arena'); if (!s || topScrim() !== s) return null; return live('[data-tut="enter"][data-tut-kind="duel"]', s)[0] || tutEl(s, 'enter'); },
      met: (t) => entries() > 0 || (!!t.arenaOpened && !scrims().length), when: () => !!sheetBy('arena') },
    { id: 'advance', title: 'Advance the week', text: 'Time to move on. Fighters train, then every fight you entered begins. Tap Advance week.', hubOnly: true,
      target: () => tutEl(null, 'advance') || game.advBtn, met: (t) => !!t.advanced },
    { id: 'fight', title: 'Read the fight', text: 'The crowd rewards a bold hand. When Crowd\'s Favor glows, tap it for a surge of strength. Tap a ready ultimate ring, or leave Auto ult on. Tap an enemy to focus it; hold the arena (or press 1 to 6) for orders like Press, Hold and Guard, each with a cost.' /* TACTICS: orders */, manual: 'Got it', pos: 'top', passive: true,
      target: () => { const fv = game.fightView, vis = (e) => e && e.isConnected && e.getBoundingClientRect().width > 4 ? e : null; return vis(fv && fv.favorBtn) || (fv && fv.ultBar && vis(fv.ultBar.firstElementChild)) || null; },
      met: (t) => !!t.fightSeen || fightOver() || (!!t.advanced && !game.busy), when: () => game.scene === 'fight' && game.fightView && game.fightView.phase === 'fight' },
    { id: 'results', title: 'The spoils', text: 'Gold, fame, experience and sometimes loot. Winning a duel lets you show mercy for fame, or showboat for gold. Hurt fighters need rest.', manual: 'Got it', pos: 'top', passive: true,
      met: (t) => !!t.resSeen || (!!t.advanced && !game.busy), when: () => resultsOpen() },
    { id: 'week', title: 'The loop is yours', text: 'That is the whole cycle: plan, enter, advance. More holds the Calendar, the rival ludi, the barracks and the memorial wall: the Pit and other risky fights can cost a fighter their life. Tap Advance week whenever you are ready. Ave!', manual: 'Begin', hubOnly: true, last: true,
      target: () => tutEl(null, 'advance') || game.advBtn, met: (t) => !!t.done2, when: () => !game.busy && game.scene === 'hub' },
  ];
  function entries() { const e = S() && S().entries; return e ? Object.keys(e).length : 0; }

  // ---------------------------------------------------------------- overlay
  function build() {
    root = h('div', 'lx-tut'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Tutorial');
    dim = h('div', 'lx-tut-dim'); ring = h('div', 'lx-tut-ring'); ring.append(h('i'));
    card = U.panel({ variant: 'parchment', cls: 'lx-tut-card' });
    root.append(dim, ring, card); document.body.append(root); // body, not #ui: modals live on body and #ui is a lower stacking context
  }

  function showStep(st, t) {
    const idx = STEPS.indexOf(st);
    if (curId !== st.id) { curId = st.id; lastTarget = null; fillCard(st, idx); }
    st.rescue && st.rescue();
    let tg = st.target ? st.target() : null;
    // hub-level steps must not point at things hidden under a modal or a running week
    const covered = st.hubOnly && (scrims().length > 0 || game.busy || game.scene !== 'hub');
    if (covered || (st.target && !tg && !st.passive && st.id !== 'hire')) return hide();
    if (st.when && !st.when()) return hide();
    if (!root.isConnected) document.body.append(root);
    if (shownId !== st.id) { shownId = st.id; shownAt = performance.now(); card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); try { game.audio.sfx('uiTap', { gain: 0.5 }); } catch (e) { /* locked */ } }
    if (st.passive && performance.now() - shownAt > 16000) return advance(st);
    root.classList.add('on'); root.classList.toggle('block', !!st.block && !tg); wasHidden = false;
    if (tg !== lastTarget) { lastTarget = tg; if (tg && tg.scrollIntoView) { try { tg.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } } }
    placeRing(tg); placeCard(st, tg);
  }
  function hide() { if (!wasHidden) { root.classList.remove('on'); wasHidden = true; } }

  function fillCard(st, idx) {
    const body = card.body; body.replaceChildren(); card.querySelector('.lx-tut-caret') && card.querySelector('.lx-tut-caret').remove();
    const dots = h('div', 'lx-tut-dots', STEPS.map((s, i) => h('i', i === idx ? 'on' : i < idx ? 'done' : '')));
    const skip = U.button({ label: 'Skip tutorial', variant: 'ghost', onClick: () => finish(true) }); skip.classList.add('lx-tut-skip');
    const acts = h('div', 'lx-tut-acts', [skip]);
    if (st.manual) acts.append(U.button({ label: st.manual, variant: 'gold', icon: st.last ? 'star' : 'check', onClick: () => advance(st) }));
    body.append(h('div', 'lx-tut-top', [dots, h('span', 'lx-tut-n lx-num', `${idx + 1}/${STEPS.length}`)]), h('div', 'lx-tut-title lx-engrave', st.title), h('div', 'lx-tut-text', st.text), acts);
    card.append(h('i', 'lx-tut-caret'));
    card.dataset.step = st.id;
  }
  function advance(st) {
    const t = T(); if (!t) return;
    const flag = { welcome: 'welcome', train: 'trained', fight: 'fightSeen', results: 'resSeen', week: 'done2' }[st.id]; if (flag) t[flag] = 1;
    game.save(); curId = null; shownId = null;
  }

  function placeRing(tg) {
    if (!tg) { ring.style.opacity = 0; ring.style.transform = 'translate(-9999px,0)'; return; }
    const r = tg.getBoundingClientRect(), pad = 7;
    const br = parseFloat(getComputedStyle(tg).borderTopLeftRadius) || 8, s = ring.style;
    s.opacity = 1; s.width = `${r.width + pad * 2}px`; s.height = `${r.height + pad * 2}px`; s.transform = `translate(${(r.left - pad).toFixed(1)}px,${(r.top - pad).toFixed(1)}px)`; s.borderRadius = `${Math.min(r.height / 2 + pad, br + pad)}px`;
  }
  function placeCard(st, tg) {
    const W = innerWidth, Hh = innerHeight, cw = Math.min(W - 24, 360), gap = 16, sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lx-sat')) || 0;
    card.style.width = cw + 'px'; card.classList.remove('lx-tut-compact'); let ch = card.offsetHeight || 190;
    let x, y, caretX = null, caretUp = false;
    if (!tg || st.pos === 'top') { x = st.pos === 'top' && W > 760 ? 16 : (W - cw) / 2; y = st.pos === 'top' ? 64 + sat : (Hh - ch) / 2; }
    if (tg) {
      const r = tg.getBoundingClientRect(), cx = r.left + r.width / 2;
      if (st.pos !== 'top') x = Math.max(12, Math.min(W - cw - 12, cx - cw / 2));
      const spaceBelow = Hh - r.bottom, spaceAbove = r.top, below = st.pos === 'below' ? spaceBelow > ch + gap : st.pos === 'above' ? !(spaceAbove > ch + gap) : spaceBelow > spaceAbove;
      if (st.pos !== 'top') { y = below ? r.bottom + gap + 4 : r.top - ch - gap - 4; caretUp = below; caretX = Math.max(22, Math.min(cw - 22, cx - x)); }
      y = Math.max(8, Math.min(Hh - ch - 8, y));
    }
    // the card must never cover the thing it points at (or, for a card with no target, the element in st.avoid): look for a free spot, else shrink
    const av = tg || (st.avoid && st.avoid()); const ar = av ? av.getBoundingClientRect() : null;
    if (ar && ar.width > 4) {
      const hit = (cx0, cy0, w, hh) => cx0 < ar.right + 6 && cx0 + w > ar.left - 6 && cy0 < ar.bottom + 6 && cy0 + hh > ar.top - 6;
      if (hit(x, y, cw, ch)) {
        const cx0 = Math.max(12, Math.min(W - cw - 12, ar.left + ar.width / 2 - cw / 2)), top = 8 + sat, bot = Hh - ch - 8;
        const cands = [[(W - cw) / 2, top, 'top'], [(W - cw) / 2, bot, 'bottom'], [cx0, ar.top - ch - gap, 'above'], [cx0, ar.bottom + gap, 'below'], [12, (Hh - ch) / 2, 'left'], [W - cw - 12, (Hh - ch) / 2, 'right']];
        let best = cands.find(([cx1, cy1]) => cy1 >= 8 && cy1 + ch <= Hh - 8 && !hit(cx1, cy1, cw, ch));
        if (!best) { // compact card (no dots, short text) in the biggest free band
          card.classList.add('lx-tut-compact'); ch = card.offsetHeight || 120;
          const fit = [[(W - cw) / 2, top, 'top'], [(W - cw) / 2, Hh - ch - 8, 'bottom']]; best = fit.find(([cx1, cy1]) => !hit(cx1, cy1, cw, ch)) || (ar.top - top > Hh - ar.bottom ? fit[0] : fit[1]);
        }
        x = best[0]; y = best[1]; if (tg) { caretUp = best[2] === 'below' || best[2] === 'bottom'; caretX = best[2] === 'above' || best[2] === 'below' ? Math.max(22, Math.min(cw - 22, ar.left + ar.width / 2 - x)) : null; }
      }
    }
    card.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
    const c = card.querySelector('.lx-tut-caret');
    if (c) { c.style.display = caretX == null ? 'none' : ''; if (caretX != null) { c.style.left = caretX + 'px'; c.classList.toggle('up', caretUp); } }
  }

  // ---------------------------------------------------------------- engine
  function tick() {
    raf = requestAnimationFrame(tick);
    const t = T(); if (!t || t.done) return stop();
    // passive observers: record what the player has done
    if (sheetBy('roster')) { if (!t.rosterOpened) mark('rosterOpened'); }
    if (sheetBy('arena')) { if (!t.arenaOpened) mark('arenaOpened'); }
    if (game.busy && !t.advanced) mark('advanced');
    if (game.scene === 'fight' && t.advanced && !t.fightSeen && curId === 'fight' && game.fightView && game.fightView.phase === 'outro') mark('fightSeen');
    const st = STEPS.find((s) => !s.met(t));
    if (!st) return finish(false);
    // a step ahead of the player's state: pending steps (fight/results) wait silently
    showStep(st, t);
  }
  function start() { if (running) return; running = true; if (!root) build(); raf = requestAnimationFrame(tick); }
  function stop() { running = false; cancelAnimationFrame(raf); if (root) { root.classList.remove('on'); setTimeout(() => root && !running && root.remove(), 400); } curId = null; }
  function finish(skipped) {
    const t = T(); if (t) { t.done = 1; t.skipped = !!skipped; game.save(); }
    stop();
    if (skipped) U.toast('Tutorial skipped. You can replay it from More, Help.', { kind: 'info', ico: 'scroll' });
    else { try { game.audio.sfx('levelUp'); } catch (e) { /* locked */ } U.toast('Tutorial complete. Ave, Lanista!', { kind: 'good', ico: 'star' }); }
  }

  const api = {
    get active() { return running; },
    state: () => (T() ? Object.assign({}, T(), { step: curId }) : null),
    /** call whenever the hub scene is entered: starts a fresh tutorial only on a brand new ludus */
    maybeStart() {
      if ((QS.get('notut') && QS.get('notut') !== '0') || running) return; /* ?notut=0 means tutorial on */ const s = S(); if (!s) return; s.flags = s.flags || {};
      if (s.flags.tut === undefined) {
        const fresh = s.week <= 1 && !(s.stats && s.stats.fights) && !s.flags.tutor && !(s.legends && s.legends.length);
        s.flags.tut = fresh ? { v: 1 } : { v: 1, done: 1, auto: 1 }; game.save();
      }
      if (T() && !T().done) start();
    },
    skip() { if (running) finish(true); },
    /** a brand new ludus: always a fresh tutorial (called from Game.newGame, also over a non-empty save). Starts on the next hub entry. */
    reset() { const s = S(); if (!s) return; s.flags = s.flags || {}; s.flags.tut = { v: 1 }; curId = null; shownId = null; lastTarget = null; if (running) stop(); },
    /** TEST HOOK: mark every step before `id` as done so the overlay lands on it (hire and enter depend on real state: a fighter, an entry). Returns the derived step id. */
    fastForward(id) {
      const s = S(); if (!s) return null; s.flags = s.flags || {}; const t = s.flags.tut = s.flags.tut && typeof s.flags.tut === 'object' ? s.flags.tut : { v: 1 }; delete t.done; delete t.skipped;
      const order = ['welcome', 'hire', 'roster', 'train', 'arena', 'enter', 'advance', 'fight', 'results', 'week'], k = order.indexOf(id), flags = { welcome: 'welcome', roster: 'rosterOpened', train: 'trained', arena: 'arenaOpened', advance: 'advanced', fight: 'fightSeen', results: 'resSeen', week: 'done2' };
      for (const key of Object.values(flags)) delete t[key];
      order.slice(0, Math.max(0, k)).forEach((x) => { const f = { welcome: 'welcome', roster: 'rosterOpened', train: 'trained', arena: 'arenaOpened', enter: null, advance: 'advanced', fight: 'fightSeen', results: 'resSeen' }[x]; if (f) t[f] = 1; });
      if (k >= 0 && k <= order.indexOf('advance') && order.slice(0, k).includes('arena')) t.arenaOpened = 1;
      game.save(); curId = null; shownId = null; if (!running) start();
      const st = STEPS.find((x) => !x.met(t)); return st ? st.id : null;
    },
    steps: () => STEPS.map((x) => x.id),
    /** replay from the start (e.g. a button in More, Help) */
    restart() { const s = S(); if (!s) return; s.flags = s.flags || {}; s.flags.tut = { v: 1 }; game.save(); if (running) stop(); running = false; curId = null; shownId = null; lastTarget = null; start(); },
  };
  return api;
}
