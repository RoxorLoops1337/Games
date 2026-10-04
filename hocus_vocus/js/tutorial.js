// Echowake: the first-run hints (owner: story and endings engineer). One IIFE that registers UI.tutorial. DESIGN 5.8 (UI.bus and tutorial hooks).
// It ONLY listens to UI.bus ('screen', 'overlay', 'combat:*', 'map:*') and draws hint bubbles into #tips (UI.layers.tips), pointing at the stable
// anchors the screens mark with data-tut (UI.anchorEl). It never mutates another screen and never takes or blocks input: the bubble and its spotlight
// ring are pointer-transparent except for two small buttons ("Got it", "Hide hints"), and every hint shows once.
//
// HOW A HINT HAPPENS
//   RULES map a bus event (and an optional test of the payload and the run) to a hint id. A hint that is enabled, not yet seen (META.tutorial('tut_<id>'))
//   and in scope (the screens it makes sense on) joins a FIFO queue; only ONE bubble is ever visible, the next waits for it to close plus a short gap, so
//   hints never stack. Showing a hint sets its flag at once (META.setTutorial), so a reload never repeats it. A bubble closes when the player taps
//   "Got it", when the action it teaches happens (completeOn: the bubble ticks and fades), after its time to live, or when the screen changes. While an
//   overlay is open the bubble is hidden (it comes back after), because overlays sit under #tips. Entries whose screen is gone are dropped from the queue.
//   Off switches: the "Hints" setting (DATA.SETTINGS.hints, in the settings screen), "Hide hints" on any bubble, and ?notutorial=1.
//
// THE CATALOG (HINTS): map (paint, ink, walk, tiles, goal, brush, relics), combat (energy, hand, intent, endturn, block, swap, status, pick, boss), and
// the pages between fights (reward, camp, shop, event, gems). Each has {title, text, anchor (a data-tut name, a CSS selector, or a list tried in order),
// at (a fallback stage point when the anchor is missing), side, scope (screen names), completeOn (bus events), ttl (ms)}.
//
// API (UI.tutorial, for the settings screen and the tests)
//   enabled() -> bool          fire(id, force?) -> bool (queue a hint; force ignores the seen flag)       current() -> {id, el} | null     queue() -> [ids]
//   dismiss(why?)              closes the visible bubble       reset()   clears every tut_ flag and the queue (a "replay hints" button)       seen(id) -> bool
//   flag(id) -> 'tut_<id>'     HINTS (catalog)   RULES   counts {paints, walks}   shown (ids in the order they were shown)   idle() -> true when nothing is up or queued
// TIME. Delays, gaps and the time to live run on the frame clock (UI.after); under window.__HEADLESS they collapse to the next microtask, and a bubble is
// never auto-dismissed there (suites close it themselves), so a suite can read exactly what is on screen.
(() => {
  'use strict';
  const mk = UI.el;
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  const isFn = (f) => typeof f === 'function';
  const headless = () => !!window.__HEADLESS;
  const clamp = U.clamp;
  const W = 1280, H = 720;
  const FLAG = (id) => 'tut_' + id;
  const GAP_MS = 700;

  // ==================================================================================================================
  // the hints: friendly, brief, in the game's voice
  // ==================================================================================================================
  const HINTS = {
    // ---- the map
    paint: { title: 'Unmute the Soundlands', anchor: ['hex', 'ink'], side: 'bottom', scope: ['map'], completeOn: ['map:paint'], ttl: 20000,
      text: 'The Soundlands are on mute. Tap a hex beside the live patch to spend 1 Vox and hear what hides there.' },
    ink: { title: 'Vox is your budget', anchor: ['ink'], side: 'bottom', scope: ['map'], ttl: 14000,
      text: 'Each new hex costs 1 Vox. Tea stalls, victories and a green room\'s Warm Up refill it, so unmute with purpose.' },
    walk: { title: 'Now roll', anchor: ['hex'], at: { x: 640, y: 360 }, side: 'top', scope: ['map'], completeOn: ['map:walk'], ttl: 20000,
      text: 'Live hexes can be walked on. Tap one to head there. You stop at anything worth hearing: a fight, a merch stall, a green room, a detour.' },
    tiles: { title: 'Read the map signs', anchor: ['hex'], at: { x: 640, y: 360 }, side: 'top', scope: ['map'], ttl: 18000,
      text: 'Every sign is a promise: fights, rivals, merch stalls, green rooms, studios, gift boxes, tea stalls and detours each wear their own. Fog hides the rest, but the headliner always shows.' },
    goal: { title: 'The road to the headliner', at: { x: 640, y: 130 }, side: 'bottom', scope: ['map'], ttl: 18000,
      text: 'The headliner of each act waits on the far right of the map. About sixteen hexes will get you there, and every extra hex is a choice. Fights along the way refill your Vox.' },
    brush: { title: 'A Spell unmutes for free', anchor: ['brushes'], at: { x: 1000, y: 80 }, side: 'bottom', scope: ['map'], completeOn: ['map:brush'], ttl: 18000,
      text: 'One-use Spells unmute whole shapes of fog at no Vox cost. Save the long ones for the road to the headliner.' },
    relics: { title: 'Charms', anchor: ['relics'], at: { x: 120, y: 660 }, side: 'top', scope: ['map'], ttl: 14000,
      text: 'Charms bend the rules for the rest of the tour. Tap here any time to read what yours do.' },
    // ---- combat
    energy: { title: 'Breath', anchor: ['energy'], at: { x: 70, y: 650 }, side: 'top', scope: ['combat'], ttl: 14000,
      text: 'You get 3 Breath each turn, and a card\'s cost is the number in its corner orb. Whatever you do not spend is gone when the turn ends.' },
    hand: { title: 'Play a card', after: 'energy', anchor: ['hand'], at: { x: 611, y: 620 }, side: 'top', scope: ['combat'], completeOn: ['combat:play'], ttl: 24000,
      text: 'Tap a card to lift it, then tap it again, or drag it upward, to play it. Attacks also ask you to tap an enemy.' },
    intent: { title: 'Read the intents', anchor: ['intent'], at: { x: 900, y: 200 }, side: 'bottom', scope: ['combat'], ttl: 18000,
      text: 'The bubble above each enemy shows its next move: the icon is what it does and the number is how hard. Plan around it.' },
    endturn: { title: 'End your turn', anchor: ['endturn'], at: { x: 1180, y: 650 }, side: 'top', scope: ['combat'], completeOn: ['combat:endturn'], ttl: 24000,
      text: 'Out of Breath, or happy with your hand? End the turn. The enemies act, your hand is discarded and you draw fresh cards.' },
    block: { title: 'Block', at: { x: 470, y: 330 }, side: 'left', scope: ['combat'], ttl: 14000,
      text: 'Block soaks up damage, then melts away at the start of your next turn. When something big is coming, Block first.' },
    swap: { title: 'Lead and backing', anchor: ['swap'], at: { x: 200, y: 200 }, side: 'right', scope: ['combat'], completeOn: ['combat:swap'], ttl: 18000,
      text: 'The lead hero takes most of the blows, and cards change with the spot. One swap per turn is free, so use it.' },
    status: { title: 'Statuses', anchor: ['.status'], at: { x: 200, y: 200 }, side: 'bottom', scope: ['combat'], ttl: 16000,
      text: 'Those little discs are statuses. Buffs help, debuffs hurt, and the number is the strength or the turns left. Hover or hold one for the details.' },
    pick: { title: 'Choose cards', at: { x: 640, y: 120 }, side: 'bottom', scope: ['combat'], ttl: 14000,
      text: 'Some cards ask you to choose. Tap the cards you want, then confirm.' },
    boss: { title: 'A headliner', anchor: ['enemy'], at: { x: 1000, y: 160 }, side: 'left', scope: ['combat'], ttl: 20000,
      text: 'Headliners change shape as they weaken, and the music tells you when. Watch their intents, keep Block up, and do not spend everything in the first turns.' },
    // ---- the pages between fights
    reward: { title: 'The goodie bag', anchor: ['deck'], at: { x: 640, y: 120 }, side: 'bottom', scope: ['reward'], ttl: 18000,
      text: 'Take one card for your deck, or skip them all. A lean deck draws its best cards more often, so skipping is a real choice.' },
    camp: { title: 'A green room', at: { x: 640, y: 120 }, side: 'bottom', scope: ['camp'], ttl: 18000,
      text: 'Rest to heal, Rehearse a card, Set gems, or Warm Up for Vox and a Spell. You only get so many, so pick what the tour needs.' },
    shop: { title: 'Jordan\'s merch stall', at: { x: 640, y: 120 }, side: 'bottom', scope: ['shop'], ttl: 18000,
      text: 'Cards, gems, charms and a Spell are for sale. Paying Jordan to declutter a weak card is often the best buy on the stall.' },
    event: { title: 'A detour', at: { x: 640, y: 120 }, side: 'bottom', scope: ['event'], ttl: 18000,
      text: 'A detour is a choice, not a test. There is usually a safe option, a gamble and a price. Pick your risk.' },
    gems: { title: 'Gems', anchor: ['.c-sock', 'deck'], at: { x: 640, y: 120 }, side: 'bottom', scope: ['map', 'reward', 'camp', 'forge', 'shop', 'gemcache'], ttl: 20000,
      text: 'Gems set into card sockets of their own colour, and a rainbow socket takes any. Set them at green rooms, studios and merch stalls. A new gem replaces the old one for good.' },
  };

  // ==================================================================================================================
  // the rules: which bus event raises which hint. when(payload, ctx) narrows it; delay is in ms on the frame clock.
  // ==================================================================================================================
  const run = () => UI.run || null;
  const hasBrushes = () => { const R = run(); return !!(R && Array.isArray(R.brushes) && R.brushes.length); };
  const hasRelics = () => { const R = run(); return !!(R && Array.isArray(R.relics) && R.relics.length); };
  const hasGems = () => { const R = run(); return !!(R && Array.isArray(R.gems) && R.gems.length); };
  const isBoss = (e) => !!(e && e.params && e.params.node && e.params.node.tier === 'boss');
  // the swap hint only teaches a move the player can make: not while a hero is down (only one is standing), the heroes are bound, or the fight is already decided (L9)
  const swapUsable = () => {
    if (S.over) return false;
    const el = UI.anchorEl('swap');
    if (!el) return true;                                    // no button to judge (a suite, or a screen without one): do not hide the hint
    return safe(() => !el.hidden && !el.classList.contains('is-disabled') && el.getAttribute('aria-disabled') !== 'true', true);
  };
  const RULES = [
    { on: 'screen', hint: 'paint', when: (e) => e.name === 'map', delay: 900 },
    { on: 'screen', hint: 'brush', when: (e) => e.name === 'map' && hasBrushes(), delay: 1600 },
    { on: 'screen', hint: 'relics', when: (e) => e.name === 'map' && hasRelics(), delay: 1600 },
    { on: 'map:paint', hint: 'ink', delay: 500 },
    { on: 'map:paint', hint: 'walk', delay: 500 },
    { on: 'map:paint', hint: 'goal', when: (e, c) => c.paints >= 3, delay: 400 },
    { on: 'map:paint', hint: 'brush', when: () => hasBrushes(), delay: 600 },
    { on: 'map:walk', hint: 'tiles', delay: 600 },
    { on: 'screen', hint: 'boss', when: (e) => e.name === 'combat' && isBoss(e), delay: 1500 },
    { on: 'screen', hint: 'energy', when: (e) => e.name === 'combat', delay: 1300 },
    { on: 'combat:turn', hint: 'hand', when: (e) => e && e.turn === 1 && e.phase === 'player', delay: 500 },
    { on: 'combat:play', hint: 'intent', delay: 700 },
    { on: 'combat:play', hint: 'endturn', delay: 700 },
    { on: 'combat:turn', hint: 'block', when: (e) => e && e.turn >= 2 && e.phase === 'player', delay: 900 },
    { on: 'combat:turn', hint: 'swap', when: (e) => e && e.turn >= 2 && e.phase === 'player' && swapUsable(), delay: 900 },
    { on: 'combat:turn', hint: 'status', when: () => !!UI.anchorEl('.status'), delay: 700 },
    { on: 'combat:pick', hint: 'pick', delay: 300 },
    { on: 'screen', hint: 'reward', when: (e) => e.name === 'reward', delay: 1200 },
    { on: 'screen', hint: 'camp', when: (e) => e.name === 'camp', delay: 1200 },
    { on: 'screen', hint: 'shop', when: (e) => e.name === 'shop', delay: 1200 },
    { on: 'screen', hint: 'event', when: (e) => e.name === 'event', delay: 1200 },
    { on: 'screen', hint: 'gems', when: (e) => e.name === 'gemcache' || e.name === 'forge' || (hasGems() && ['map', 'reward', 'camp', 'shop'].indexOf(e.name) >= 0), delay: 1400 },
  ];

  // ==================================================================================================================
  // state
  // ==================================================================================================================
  const S = { cur: null, queue: [], shown: [], gapOn: false, counts: { paints: 0, walks: 0 }, pumpTimer: 0, overlays: 0, wired: false, off: null, urlOff: null, over: false };

  function urlOff() {
    if (S.urlOff === null) S.urlOff = safe(() => new URLSearchParams(window.location.search || '').get('notutorial') === '1', false);
    return S.urlOff;
  }
  function enabled() {
    if (urlOff()) return false;
    return safe(() => UI.getSetting('hints'), true) !== false;
  }
  const seen = (id) => safe(() => META.tutorial(FLAG(id)), false) === true;
  const mark = (id) => safe(() => META.setTutorial(FLAG(id), true));
  const later = (ms, fn) => { const run = () => { try { fn(); } catch (e) { console.error('[tutorial] ' + e.message); } }; if (headless()) Promise.resolve().then(run); else UI.after(ms, run); };
  const scopeOk = (def) => !def.scope || def.scope.indexOf(UI.currentName) >= 0;

  // ==================================================================================================================
  // geometry: the anchor's rectangle in stage px, the bubble's placement and tail (the same idea as UI's tooltips)
  // ==================================================================================================================
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    const a = UI.toStage(r.left, r.top), b = UI.toStage(r.right, r.bottom);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }
  // An anchor that covers most of the stage is a container, not a target: a ring round it frames the whole screen and a tail aimed at its centre
  // points at nothing (the combat hand was once such a box, finding 38). Such an anchor is skipped, so the hint's `at` point (or the next anchor) is used.
  const FULL_STAGE = 0.6;
  function findAnchor(def) {
    const list = def.anchor || [];
    for (let i = 0; i < list.length; i++) {
      const el = safe(() => UI.anchorEl(list[i]), null);
      if (!el) continue;
      const r = safe(() => el.getBoundingClientRect(), null);
      if (!r || !(r.width > 0 || r.height > 0)) continue;
      const q = rectOf(el);
      if ((q.x1 - q.x0) * (q.y1 - q.y0) > FULL_STAGE * W * H) continue;
      return el;
    }
    return null;
  }
  function place(h) {
    const node = h.el, def = h.def;
    const el = findAnchor(def);
    let rect = null;
    if (el) rect = rectOf(el);
    else if (def.at) rect = { x0: def.at.x, y0: def.at.y, x1: def.at.x, y1: def.at.y };
    else rect = { x0: W / 2, y0: 120, x1: W / 2, y1: 120 };
    h.anchored = !!el;
    const w = node.offsetWidth || 330, hh = node.offsetHeight || 150, gap = 18;
    const fits = { top: rect.y0 - hh - gap >= 6, bottom: rect.y1 + hh + gap <= H - 6, left: rect.x0 - w - gap >= 6, right: rect.x1 + w + gap <= W - 6 };
    let side = def.side || 'bottom';
    if (!fits[side]) {
      const order = { top: ['bottom', 'right', 'left'], bottom: ['top', 'right', 'left'], left: ['right', 'top', 'bottom'], right: ['left', 'top', 'bottom'] }[side] || ['bottom'];
      side = order.find((o) => fits[o]) || side;
    }
    const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
    let x, y, tail;
    if (side === 'top' || side === 'bottom') {
      x = clamp(cx - w / 2, 8, Math.max(8, W - w - 8)); y = side === 'top' ? rect.y0 - hh - gap : rect.y1 + gap;
      y = clamp(y, 8, Math.max(8, H - hh - 8)); tail = clamp(cx - x, 26, Math.max(26, w - 26));
    } else {
      y = clamp(cy - hh / 2, 8, Math.max(8, H - hh - 8)); x = side === 'left' ? rect.x0 - w - gap : rect.x1 + gap;
      x = clamp(x, 8, Math.max(8, W - w - 8)); tail = clamp(cy - y, 26, Math.max(26, hh - 26));
    }
    node.classList.remove('tut-top', 'tut-bottom', 'tut-left', 'tut-right');
    node.classList.add('tut-' + side);
    node.style.left = Math.round(x) + 'px'; node.style.top = Math.round(y) + 'px';
    node.style.setProperty('--tail', Math.round(tail) + 'px');
    if (h.ring) {
      h.ring.hidden = !el;
      if (el) {
        const pad = 8;
        h.ring.style.left = Math.round(rect.x0 - pad) + 'px'; h.ring.style.top = Math.round(rect.y0 - pad) + 'px';
        h.ring.style.width = Math.round(rect.x1 - rect.x0 + pad * 2) + 'px'; h.ring.style.height = Math.round(rect.y1 - rect.y0 + pad * 2) + 'px';
      }
    }
  }

  // ==================================================================================================================
  // the bubble
  // ==================================================================================================================
  function build(id, def) {
    const ok = UI.btn('Got it', { kind: 'primary', size: 'sm', onclick: () => dismiss('ok') });
    ok.classList.add('tut-ok');
    const off = mk('button', { type: 'button', class: 'tut-off', text: 'Hide hints', onclick: () => {
      safe(() => UI.setSetting('hints', false));
      safe(() => UI.toast('Hints are off. You can turn them back on in Settings.', 'info'));
      dismiss('off');
    } });
    const node = mk('div', { class: 'tut', role: 'note', 'aria-label': def.title + '. ' + def.text, dataset: { hint: id } },
      mk('div', { class: 'tut-in' },
        mk('span', { class: 'tut-seal', 'aria-hidden': 'true' }, UI.hanko('TIP', { size: 'sm' })),
        mk('div', { class: 'tut-main' },
          mk('b', { class: 'tut-title', text: def.title }),
          mk('p', { class: 'tut-text', text: def.text }),
          mk('div', { class: 'tut-foot' }, ok, off))),
      mk('i', { class: 'tut-tail', 'aria-hidden': 'true' }));
    const ring = mk('div', { class: 'tut-ring', 'aria-hidden': 'true' }, mk('i', { class: 'r-a' }), mk('i', { class: 'r-b' }), mk('i', { class: 'r-c' }), mk('i', { class: 'r-d' }));
    return { node, ring };
  }

  function show(id, force) {
    const def = HINTS[id];
    if (!def || S.cur) return false;
    const parts = build(id, def);
    const h = { id, def, el: parts.node, ring: parts.ring, closing: false, anchored: false, born: 0 };
    UI.layers.tips.appendChild(parts.ring);
    UI.layers.tips.appendChild(parts.node);
    S.cur = h;
    S.shown.push(id);
    if (!force || !seen(id)) mark(id);
    place(h);
    parts.node.classList.toggle('hold', UI.overlay.count() > 0);
    parts.ring.classList.toggle('hold', UI.overlay.count() > 0);
    safe(() => UI.announce(def.title + '. ' + def.text));
    safe(() => { if (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.sfx)) AUDIO.sfx('reveal_landmark'); });
    if (!headless()) {
      // the frame-clock upkeep: re-aim at a moving anchor, and expire after the time to live. UI.after dies with the screen, which is what we want.
      const tick = () => { if (S.cur !== h || h.closing) return; place(h); UI.after(250, tick); };
      UI.after(250, tick);
      UI.after(def.ttl || 16000, () => { if (S.cur === h) dismiss('ttl'); });
      // leaving the screen disposes UI tweens, which resolves their promise: a leave detector (UI has no leave hook for outsiders)
      const probe = { v: 0 };
      UI.tween(probe, { v: 1 }, 3.6e6, 'linear').then(() => { if (S.cur === h && !h.closing) dismiss('leave'); });
    }
    return true;
  }

  function dismiss(why) {
    const h = S.cur;
    if (!h || h.closing) return false;
    h.closing = true;
    h.why = why || 'ok';
    const finish = () => {
      safe(() => h.el.remove()); safe(() => h.ring.remove());
      if (S.cur === h) S.cur = null;
      S.gapOn = true;
      later(GAP_MS, () => { S.gapOn = false; pump(); });
    };
    if (why === 'done' && !headless()) {
      h.el.classList.add('done'); h.ring.classList.add('out');
      UI.after(520, finish);
      // if the screen changes during the farewell, the screen event below clears it
    } else if (!headless() && (why === 'ok' || why === 'ttl' || why === 'off')) {
      h.el.classList.add('out'); h.ring.classList.add('out');
      UI.after(220, finish);
    } else finish();
    return true;
  }

  // ==================================================================================================================
  // the queue
  // ==================================================================================================================
  function enqueue(id, force) {
    const def = HINTS[id];
    if (!def) return false;
    if (!enabled() && !force) return false;
    if (!force && seen(id)) return false;
    if (S.cur && S.cur.id === id) return false;
    if (S.queue.some((q) => q.id === id)) return false;
    S.queue.push({ id, force: !!force });
    return true;
  }
  // the order hints are written in the catalog is their priority; a hint with `after` waits for that one to have been shown first
  const PRIO = {};
  Object.keys(HINTS).forEach((id, i) => { PRIO[id] = i; });
  function pump() {
    if (S.cur || S.gapOn) return;
    S.queue = S.queue.filter((q) => { const d = HINTS[q.id]; return d && (q.force || (!seen(q.id) && enabled() && scopeOk(d) && !(S.over && d.scope && d.scope.indexOf('combat') >= 0))); });
    if (!S.queue.length) return;
    S.queue.sort((a, b) => PRIO[a.id] - PRIO[b.id]);
    let pick = S.queue[0], guard = 0;
    while (guard++ < 4) {
      const pre = HINTS[pick.id].after;
      if (!pre || seen(pre) || !HINTS[pre] || !scopeOk(HINTS[pre])) break;
      pick = { id: pre, force: false };
    }
    S.queue = S.queue.filter((q) => q.id !== pick.id);
    show(pick.id, pick.force);
  }
  function fire(id, force) {
    const ok = enqueue(id, force);
    if (ok) later(0, pump);
    return ok;
  }

  // ==================================================================================================================
  // the bus
  // ==================================================================================================================
  function applyRules(evt, payload) {
    RULES.forEach((r) => {
      const on = Array.isArray(r.on) ? r.on : [r.on];
      if (on.indexOf(evt) < 0) return;
      if (!enabled() || seen(r.hint)) return;
      const def = HINTS[r.hint];
      // the delay lets the screen finish its own entrance before a bubble appears; the condition is tested again then (a status chip may only
      // exist by now), and a hint that lost its screen meanwhile is dropped
      later(r.delay || 0, () => {
        if (!def || !scopeOk(def)) return;
        if (r.when && !safe(() => r.when(payload, S.counts), false)) return;
        // pump one beat later, so every rule the same event raised is queued before the priority order picks
        if (enqueue(r.hint)) later(0, pump);
      });
    });
  }
  // the player already did what a hint teaches: close it with a tick if it is up, and never raise it later
  function completeIf(evt) {
    const h = S.cur;
    if (h && !h.closing && h.def.completeOn && h.def.completeOn.indexOf(evt) >= 0) dismiss('done');
    Object.keys(HINTS).forEach((id) => {
      const d = HINTS[id];
      if (d.completeOn && d.completeOn.indexOf(evt) >= 0 && !seen(id) && (!S.cur || S.cur.id !== id)) mark(id);
    });
  }

  function onEvent(evt) {
    return (payload) => {
      if (evt === 'map:paint') S.counts.paints++;
      if (evt === 'map:walk') S.counts.walks++;
      // rules first: what this event teaches next must already be waiting when the finished bubble's gap ends (headless collapses both to microtasks)
      applyRules(evt, payload);
      completeIf(evt);
    };
  }
  // the fight is decided (win or lose): no combat hint may start over the victory or defeat beat, and one that is up closes (L9)
  function onCombatEnd() {
    S.over = true;
    const h = S.cur;
    if (h && !h.closing && h.def.scope && h.def.scope.indexOf('combat') >= 0) dismiss('end');
    S.queue = S.queue.filter((q) => q.force || !(HINTS[q.id].scope && HINTS[q.id].scope.indexOf('combat') >= 0));
  }
  function onScreen(e) {
    // a screen change clears a bubble that belongs to another screen (or one that was mid-farewell: its timer died with the old screen), and
    // drops queue entries that no longer fit
    S.gapOn = false;
    S.over = false;
    const h = S.cur;
    if (h && (h.closing || !scopeOk(h.def))) { h.closing = true; safe(() => h.el.remove()); safe(() => h.ring.remove()); S.cur = null; }
    S.queue = S.queue.filter((q) => q.force || scopeOk(HINTS[q.id]));
    applyRules('screen', e);
    pump();
  }
  function onOverlay() {
    const hold = UI.overlay.count() > 0;
    if (S.cur) { S.cur.el.classList.toggle('hold', hold); S.cur.ring.classList.toggle('hold', hold); }
  }

  function wire() {
    if (S.wired) return;
    S.wired = true;
    UI.bus.on('screen', onScreen);
    UI.bus.on('overlay', onOverlay);
    UI.bus.on('combat:end', onCombatEnd);
    ['map:paint', 'map:brush', 'map:walk', 'combat:turn', 'combat:play', 'combat:endturn', 'combat:swap', 'combat:pick'].forEach((evt) => UI.bus.on(evt, onEvent(evt)));
  }

  function reset() {
    dismiss('reset');
    S.queue.length = 0; S.counts.paints = 0; S.counts.walks = 0; S.gapOn = false;
    if (S.cur) { safe(() => S.cur.el.remove()); safe(() => S.cur.ring.remove()); S.cur = null; }
    Object.keys(HINTS).forEach((id) => safe(() => META.setTutorial(FLAG(id), false)));
  }

  UI.tutorial = {
    HINTS, RULES, counts: S.counts, shown: S.shown,
    enabled, fire, dismiss, reset, seen, flag: FLAG,
    show: (id) => { if (S.cur) dismiss('replace'); return show(id, true); },
    current: () => (S.cur ? { id: S.cur.id, el: S.cur.el, ring: S.cur.ring, anchored: S.cur.anchored, closing: S.cur.closing } : null),
    queue: () => S.queue.map((q) => q.id),
    idle: () => !S.cur && !S.queue.length,
  };
  wire();
})();
