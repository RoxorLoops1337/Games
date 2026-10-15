// Hocus Vocus: the tutorial (owner: story and endings engineer). One IIFE that registers UI.tutorial. DESIGN 5.8 (UI.bus and tutorial hooks).
// It ONLY listens to UI.bus ('screen', 'overlay', 'combat:*', 'map:*') and draws bubbles into #tips (UI.layers.tips), pointing at the stable
// anchors the screens mark with data-tut (UI.anchorEl). It never mutates another screen and never takes or blocks input: a bubble and its spotlight
// ring are pointer-transparent except for their two buttons (Next or Got it, and Skip tutorial or Stop explaining).
//
// THREE KINDS OF BUBBLE, one queue, ONE bubble on screen at a time
//   1. Guided steps (CHAINS). The first map and the first fight are a walkthrough: map = you, paint, walk, fight ("This is you", "Unmute a hex",
//      "Walk there", "A fight!"); combat = hand, blockcard, energy, intent, endturn (attack cards, block cards, Breath, the enemy's intent, End turn).
//      Each step spotlights the real element, says "Step N of M", and has Next (Got it on the last) and Skip tutorial. A step also ends when the
//      player does what it teaches (completeOn: the bubble ticks and fades), and the chain moves on. A step's flag is stored when it CLOSES, so a
//      screen change in the middle (a walk into a fight, a reload) brings the same step back the next time that screen opens: the walkthrough
//      survives screen changes. A step whose moment has not come yet (the fight step needs a fight on the map) waits without blocking anything.
//   2. Hints (the rest of HINTS): one short bubble the first time something happens (a reward screen, a Spell in the tray, a status chip...).
//      Their flag is stored the moment they show, so a reload never repeats them.
//   3. Explainers: the first time the player meets ANY status, keyword, gem, Charm, Spell or map sign, a bigger card shows its icon, its name and
//      "What it does" in one or two plain sentences, with Next or Got it and Stop explaining. They are built from the data (DATA.statuses,
//      DATA.keywords, DATA.gems, DATA.relics, DATA.brushes, DATA.tiles), so a status or keyword added later gets an explainer with no change here.
//      Their ids are 'x_<kind>_<key>' and their flags 'tut_x_<kind>_<key>'; 'tut_x_off' is Stop explaining.
//   Priority: guided steps, then hints in catalog order, then explainers in the order they were met. Explainers wait while a walkthrough step is up
//   or queued on that screen. In a fight nothing new opens while the fight is animating, a card is lifted or dragged, or the fight is over (busy());
//   a bubble that is already up fades to a ghost (class dim) while that lasts. While an overlay is open the bubble is hidden (class hold).
//
// OFF SWITCHES. The Tutorial setting (DATA.SETTINGS.hints, "Tutorial: On / Off" in Settings) turns everything off. Skip tutorial on a step or a hint
//   marks every guided step and hint as seen (explainers go on); Stop explaining on an explainer stops explainers only. ?notutorial=1 disables it all.
//   Replay tutorial in Settings calls reset(): every tut_ flag is cleared and the walkthrough starts again on the next map and fight.
//
// HINT FIELDS: {title, text, anchor (data-tut names or CSS selectors, tried in order), at (a fallback stage point), side, dock, scope (screen names),
//   completeOn (bus events), ttl (ms), after (a hint that must have shown first), chain + step (set from CHAINS), ready() (a chain step's moment has
//   come), teaches (explainer ids it makes redundant: marked seen when it shows)}.
//
// API (UI.tutorial, for the settings screen and the tests)
//   enabled() -> bool       explaining() -> bool (enabled and not stopped)       fire(id, force?) -> bool       show(id) (force one now)
//   current() -> {id, el, ring, anchored, closing, kind} | null       queue() -> [ids]       dismiss(why?)       next() (what Next does)
//   skip() (what Skip tutorial does)       stopExplaining()       reset()       seen(id) -> bool       flag(id) -> 'tut_<id>'
//   explain(kind, key, force?) -> bool       explainDef(id) -> def | null       scan() (look for new things on the current screen now)
//   HINTS   RULES   CHAINS   counts {paints, walks}   shown (ids in the order they were shown)   idle() -> true when nothing is up or queued
// TIME. Delays, gaps and the time to live run on the frame clock (UI.after); under window.__HEADLESS they collapse to the next microtask, a bubble is
// never auto-dismissed there and busy() is false (suites close bubbles themselves), so a suite can read exactly what is on screen.
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
  const STEP_TTL = 90000;
  const GAME_SCREENS = ['map', 'combat', 'reward', 'shop', 'event', 'camp', 'forge', 'chest', 'gemcache'];

  // ==================================================================================================================
  // the catalog: short, direct, at most one joke each. Guided steps first (their order is the walkthrough), then the hints.
  // ==================================================================================================================
  const HINTS = {
    // ---- the first map, step by step
    you: { title: 'This is you', anchor: ['party'], at: { x: 640, y: 360 }, side: 'bottom', scope: ['map'], ttl: STEP_TTL,
      text: 'Meet your two heroes. The Soundlands are on mute, and you are the volume knob.' },
    paint: { title: 'Unmute a hex', anchor: ['hex', 'ink'], side: 'bottom', scope: ['map'], completeOn: ['map:paint'], ttl: STEP_TTL, teaches: ['x_keyword_ink'],
      text: 'Tap a hex next to you to unmute it. It costs 1 Vox.' },
    walk: { title: 'Walk there', anchor: ['hex'], at: { x: 640, y: 360 }, side: 'top', scope: ['map'], completeOn: ['map:walk'], ttl: STEP_TTL,
      ready: () => S.counts.paints > 0,                       // "that live hex" is the one just unmuted: after Next without unmuting, it waits for the first unmute
      text: 'Now tap that live hex to walk there. Your heroes love a stroll.' },
    fight: { title: 'A fight!', anchor: ['fight', 'hex'], at: { x: 640, y: 360 }, side: 'top', scope: ['map'], completeOn: ['map:walk'], ttl: STEP_TTL, teaches: ['x_tile_enemy'],
      ready: () => fightOnMap(),
      text: 'That icon is a fight. Walk onto it to battle a creature of the Gloss. Go!' },
    // ---- the first fight, step by step
    hand: { title: 'Attack cards', anchor: ['.cm-hand .card.t-attack', 'hand'], at: { x: 611, y: 620 }, side: 'top', scope: ['combat'], completeOn: ['combat:play'], ttl: STEP_TTL,
      text: 'Attack cards hit enemies. Drag one up, or tap it twice, to play it.' },
    blockcard: { title: 'Block cards', anchor: ['.cm-hand .card[data-ops~="block"]', '.cm-hand .card.t-skill', 'hand'], at: { x: 611, y: 620 }, side: 'top', scope: ['combat'], ttl: STEP_TTL, teaches: ['x_keyword_block'],
      text: 'Block stops damage until your next turn. Big hit coming? Block first.' },
    energy: { title: 'Breath', anchor: ['energy'], at: { x: 70, y: 650 }, side: 'top', dock: { x: 420, bottom: 520 }, scope: ['combat'], ttl: STEP_TTL,
      text: 'Each card costs Breath, the number in its corner. You get 3 every turn.' },
    intent: { title: 'Enemy intent', anchor: ['intent'], at: { x: 900, y: 200 }, side: 'bottom', scope: ['combat'], ttl: STEP_TTL,
      text: 'This bubble shows what the enemy will do next. Rude of it to tell you, really.' },
    endturn: { title: 'End turn', anchor: ['endturn'], at: { x: 1180, y: 650 }, side: 'top', scope: ['combat'], completeOn: ['combat:endturn'], ttl: STEP_TTL,
      text: 'Done? End your turn. The enemy acts, then you draw 5 fresh cards.' },
    // ---- hints on the map
    ink: { title: 'Vox is your budget', anchor: ['ink'], side: 'bottom', scope: ['map'], ttl: 14000,
      text: 'Vox refills at tea stalls, after wins and in green rooms. Spend it with purpose.' },
    tiles: { title: 'Read the map signs', anchor: ['hex'], at: { x: 640, y: 360 }, side: 'top', scope: ['map'], ttl: 16000,
      text: 'Every icon is a promise: fights, stalls, green rooms, gifts. Fog hides the rest.' },
    goal: { title: 'The headliner', at: { x: 640, y: 130 }, side: 'bottom', scope: ['map'], ttl: 16000,
      text: 'The headliner waits on the far right of the map. Beat it to clear the act.' },
    brush: { title: 'Spells', anchor: ['brushes'], at: { x: 1000, y: 80 }, side: 'bottom', scope: ['map'], completeOn: ['map:brush'], ttl: 16000,
      text: 'A Spell unmutes a whole shape for free. Tap it here, then tap the map.' },
    relics: { title: 'Charms', anchor: ['relics'], at: { x: 120, y: 660 }, side: 'top', scope: ['map'], ttl: 14000,
      text: 'Charms bend the rules all tour long. Tap here to read what yours do.' },
    // ---- hints in a fight
    swap: { title: 'Lead and backing', anchor: ['swap'], at: { x: 200, y: 200 }, side: 'right', scope: ['combat'], completeOn: ['combat:swap'], ttl: 16000,
      text: 'The lead hero takes the hits. Swap spots here, once per turn for free.' },
    status: { title: 'Statuses', anchor: ['.status'], at: { x: 200, y: 200 }, side: 'bottom', scope: ['combat'], ttl: 14000,
      text: 'Those discs are statuses. Hover or hold one to see what it does.' },
    pick: { title: 'Choose cards', at: { x: 640, y: 120 }, side: 'bottom', scope: ['combat'], ttl: 14000,
      text: 'This card wants a choice. Tap the cards you want, then confirm.' },
    boss: { title: 'A headliner', anchor: ['enemy'], at: { x: 1000, y: 160 }, side: 'left', scope: ['combat'], ttl: 18000,
      text: 'Headliners change shape as they weaken. Keep Block up and read the bubble.' },
    // ---- hints on the pages between fights
    reward: { title: 'The goodie bag', anchor: ['deck'], at: { x: 640, y: 120 }, side: 'bottom', scope: ['reward'], ttl: 16000,
      text: 'Take one card, or skip. A lean deck draws its best cards more often.' },
    camp: { title: 'A green room', at: { x: 640, y: 120 }, side: 'bottom', scope: ['camp'], ttl: 16000,
      text: 'Pick one: rest to heal, rehearse a card, set gems or warm up for Vox.' },
    shop: { title: 'Jordan\'s merch stall', at: { x: 640, y: 120 }, side: 'bottom', scope: ['shop'], ttl: 16000,
      text: 'Cards, gems, Charms and Spells. Paying to remove a weak card is a bargain.' },
    event: { title: 'A detour', at: { x: 640, y: 120 }, side: 'bottom', scope: ['event'], ttl: 16000,
      text: 'A choice, not a test. Usually one safe pick, one gamble and one price.' },
    gems: { title: 'Gems', anchor: ['.c-sock', 'deck'], at: { x: 640, y: 120 }, side: 'bottom', scope: ['map', 'reward', 'camp', 'forge', 'shop', 'gemcache'], ttl: 18000,
      text: 'Set a gem into a card slot of its colour. Rainbow slots take any gem.' },
  };
  const CHAINS = { map: ['you', 'paint', 'walk', 'fight'], combat: ['hand', 'blockcard', 'energy', 'intent', 'endturn'] };
  // a veteran (the old hints of these steps were seen) skips the steps that are new to this walkthrough
  const VETERAN = { map: { was: 'paint', skip: ['you', 'fight'] }, combat: { was: 'energy', skip: ['blockcard'] } };
  Object.keys(CHAINS).forEach((c) => CHAINS[c].forEach((id, i) => { HINTS[id].chain = c; HINTS[id].step = i; }));

  // ==================================================================================================================
  // explainers: built from the data, so new statuses, keywords, gems and Charms explain themselves
  // ==================================================================================================================
  const XKINDS = ['status', 'keyword', 'gem', 'relic', 'spell', 'tile'];
  const XSRC = { status: () => DATA.statuses, keyword: () => DATA.keywords, gem: () => DATA.gems, relic: () => DATA.relics, spell: () => DATA.brushes, tile: () => DATA.tiles };
  const XICON = { status: 'status', gem: 'gem', relic: 'relic', spell: 'brush', tile: 'tile' };
  const XLABEL = { status: 'New status', keyword: 'New keyword', gem: 'New gem', relic: 'New Charm', spell: 'New Spell', tile: 'New map sign' };
  // things the walkthrough already teaches, or that are not worth a card
  const XSKIP = { keyword: ['block'], tile: ['start', 'empty'] };
  // what a map sign does when you step on it (the data names them; this says what happens). A tile without a line here uses its data text alone.
  const TILE_DO = {
    enemy: 'Step on it to fight. A win pays gold, Vox and a card.', elite: 'A tough fight. Win it for a Charm.', boss: 'Beat it to clear the act.',
    chest: 'Step on it for a free gift.', shop: 'Spend gold on cards, gems, Charms and Spells.', camp: 'Heal up, or make a card better.',
    event: 'A little story with a choice in it.', well: 'Step on it to refill your Vox.', brush: 'Learn a free Spell here.', gemcache: 'Take one free gem.',
    forge: 'Make a card better, or set gems.', block: 'Walk around it.',
  };
  const xId = (kind, key) => 'x_' + kind + '_' + key;
  function xParse(id) {
    const m = /^x_([a-z]+)_(.+)$/.exec(String(id || ''));
    if (!m || XKINDS.indexOf(m[1]) < 0) return null;
    return { kind: m[1], key: m[2] };
  }
  const xExists = (kind, key) => !!safe(() => XSRC[kind]()[key], null);
  // at most two sentences: the explainer is a glance, the full rules live in the tooltips
  function twoSentences(s) {
    const parts = String(s || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/);
    return parts.slice(0, 2).join(' ');
  }
  const colourWord = (c) => (DATA.COLOUR_NAME && DATA.COLOUR_NAME[c]) || String(c);
  const XMEMO = {};                                           // id -> {sel, n}: where it was met and the number it showed
  function explainDef(id) {
    const p = xParse(id);
    if (!p || !xExists(p.kind, p.key)) return null;
    const d = XSRC[p.kind]()[p.key];
    const memo = XMEMO[id] || {};
    let name = d.name || p.key, text = '', sub = '', tone = '';
    if (p.kind === 'status' || p.kind === 'keyword') {
      const info = safe(() => UI.tip.info(p.key, memo.n), null);
      text = (info && info.text) || d.text || '';
      if (memo.n === undefined || memo.n === null) text = text.replace(/\bN\b/g, 'that many');
      if (p.kind === 'status') { tone = d.kind === 'debuff' ? 'bad' : 'good'; sub = d.kind === 'debuff' ? 'Hurts whoever has it' : d.kind === 'resource' ? 'A hero\'s own power' : 'Helps whoever has it'; }
      else sub = 'Found on cards';
    } else if (p.kind === 'gem') {
      const g = safe(() => DATA.gemText(p.key), '') || d.text || '';
      text = (g ? 'On a card it gives: ' + g.replace(/\.$/, '') + '. ' : '') + 'It fits ' + colourWord(d.color) + ' slots and rainbow slots.';
      sub = colourWord(d.color) + ' gem';
      sub = sub[0].toUpperCase() + sub.slice(1);
    } else if (p.kind === 'relic') {
      text = safe(() => DATA.relicText(p.key), '') || d.text || '';
      sub = 'Works for the rest of the tour';
    } else if (p.kind === 'spell') {
      text = d.text || '';
      sub = 'Single use, free of Vox';
    } else if (p.kind === 'tile') {
      text = (d.text || '') + (TILE_DO[p.key] ? ' ' + TILE_DO[p.key] : '');
      sub = 'On the map';
    }
    return {
      title: name, text: twoSentences(text), label: XLABEL[p.kind], sub, tone, kind: p.kind, key: p.key, explain: true,
      anchor: memo.sel ? [memo.sel] : [], at: { x: 640, y: 96 }, side: p.kind === 'status' || p.kind === 'keyword' ? 'top' : 'bottom', scope: memo.force || !memo.scr ? null : [memo.scr], ttl: 30000,
    };
  }
  const defOf = (id) => HINTS[id] || explainDef(id);

  // ==================================================================================================================
  // the rules: which bus event raises which hint (or starts which walkthrough). when(payload, ctx) narrows it; delay is in ms on the frame clock.
  // ==================================================================================================================
  const run = () => UI.run || null;
  const hasBrushes = () => { const R = run(); return !!(R && Array.isArray(R.brushes) && R.brushes.length); };
  const hasRelics = () => { const R = run(); return !!(R && Array.isArray(R.relics) && R.relics.length); };
  const hasGems = () => { const R = run(); return !!(R && Array.isArray(R.gems) && R.gems.length); };
  const isBoss = (e) => !!(e && e.params && e.params.node && e.params.node.tier === 'boss');
  // a fight the party can walk to: a revealed Face-Off or Rival that is not done yet
  function fightOnMap() {
    const R = run();
    const tiles = R && R.map && R.map.tiles;
    if (!tiles) return false;
    return Object.keys(tiles).some((k) => { const t = tiles[k]; return t && t.painted && !t.done && (t.type === 'enemy' || t.type === 'elite'); });
  }
  // the swap hint only teaches a move the player can make: not while a hero is down (only one is standing), the heroes are bound, or the fight is already decided (L9)
  const swapUsable = () => {
    if (S.over) return false;
    const el = UI.anchorEl('swap');
    if (!el) return true;                                    // no button to judge (a suite, or a screen without one): do not hide the hint
    return safe(() => !el.hidden && !el.classList.contains('is-disabled') && el.getAttribute('aria-disabled') !== 'true', true);
  };
  const RULES = [
    { on: 'screen', chain: 'map', when: (e) => e.name === 'map', delay: 900 },
    { on: 'screen', hint: 'brush', when: (e) => e.name === 'map' && hasBrushes(), delay: 1600 },
    { on: 'screen', hint: 'relics', when: (e) => e.name === 'map' && hasRelics(), delay: 1600 },
    { on: 'map:paint', hint: 'ink', delay: 500 },
    { on: 'map:paint', hint: 'goal', when: (e, c) => c.paints >= 3, delay: 400 },
    { on: 'map:paint', hint: 'brush', when: () => hasBrushes(), delay: 600 },
    { on: 'map:walk', hint: 'tiles', delay: 600 },
    { on: 'screen', hint: 'boss', when: (e) => e.name === 'combat' && isBoss(e), delay: 1500 },
    { on: 'combat:turn', chain: 'combat', when: (e) => !!e && e.phase === 'player', delay: 400 },
    { on: 'combat:turn', hint: 'swap', when: (e) => e && e.turn >= 2 && e.phase === 'player' && swapUsable(), delay: 900 },
    { on: 'combat:turn', hint: 'status', when: () => !!UI.anchorEl('.status'), delay: 700 },
    { on: 'combat:pick', hint: 'pick', delay: 300 },
    { on: 'screen', hint: 'reward', when: (e) => e.name === 'reward', delay: 1200 },
    { on: 'screen', hint: 'camp', when: (e) => e.name === 'camp', delay: 1200 },
    { on: 'screen', hint: 'shop', when: (e) => e.name === 'shop', delay: 1200 },
    { on: 'screen', hint: 'event', when: (e) => e.name === 'event', delay: 1200 },
    { on: 'screen', hint: 'gems', when: (e) => e.name === 'gemcache' || e.name === 'forge' || (hasGems() && ['map', 'reward', 'camp', 'shop'].indexOf(e.name) >= 0), delay: 1400 },
  ];
  // when to look for new things to explain (after the screen's own hints have had their turn)
  const SCAN_ON = { screen: 1700, 'combat:turn': 900, 'combat:play': 900, 'map:paint': 700, 'map:walk': 700, 'map:brush': 700 };

  // ==================================================================================================================
  // state
  // ==================================================================================================================
  const S = { cur: null, queue: [], shown: [], gapOn: false, counts: { paints: 0, walks: 0 }, wired: false, urlOff: null, over: false, waiting: {}, xSeq: 0, retry: false };

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
  const explaining = () => enabled() && !seen('x_off');
  const later = (ms, fn) => { const go = () => { try { fn(); } catch (e) { console.error('[tutorial] ' + e.message); } }; if (headless()) Promise.resolve().then(go); else UI.after(ms, go); };
  const scopeOk = (def) => !!def && (!def.scope || def.scope.indexOf(UI.currentName) >= 0);
  const isStep = (def) => !!(def && def.chain);
  const markOnClose = (def) => isStep(def) || !!(def && def.explain);

  // In a fight, nothing new opens while the fight animates, a card is lifted or dragged, or the fight is decided: a bubble must never land on a
  // drag or an enemy turn. Headless suites have no animation, so nothing is ever busy there.
  function busy() {
    if (headless() || UI.currentName !== 'combat') return false;
    const root = safe(() => UI.layers.screens.querySelector('.cm'), null);
    if (!root) return false;
    if (root.classList.contains('busy-fight') || root.classList.contains('dragging-card') || root.classList.contains('ended')) return true;
    return !!safe(() => root.querySelector('.cm-hand.has-sel'), null);
  }

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
    const w = node.offsetWidth || (def.explain ? 420 : 340), hh = node.offsetHeight || (def.explain ? 210 : 150), gap = 18;
    // every screen keeps its top bar (gold, the menu button) in the first 56 stage px, --hit tall on a phone: a bubble never parks over it
    const top = safe(() => (UI.layers.tips.closest('#stage.compact') ? 92 : 62), 62);
    const fits = { top: rect.y0 - hh - gap >= top, bottom: rect.y1 + hh + gap <= H - 6, left: rect.x0 - w - gap >= 6, right: rect.x1 + w + gap <= W - 6 };
    let side = def.side || 'bottom';
    if (!fits[side]) {
      const order = { top: ['bottom', 'right', 'left'], bottom: ['top', 'right', 'left'], left: ['right', 'top', 'bottom'], right: ['left', 'top', 'bottom'] }[side] || ['bottom'];
      side = order.find((o) => fits[o]) || side;
    }
    const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
    let x, y, tail;
    if (def.dock) {
      // a card parked on the sea between the heroes and the enemies (the Breath tip: above the orb it covered the heroes' legs); it has no tail, the spotlight ring still marks the orb
      x = clamp(def.dock.x, 8, Math.max(8, W - w - 8)); y = clamp(def.dock.bottom - hh, top, Math.max(top, H - hh - 8)); tail = 40; side = 'dock';
    } else if (side === 'top' || side === 'bottom') {
      x = clamp(cx - w / 2, 8, Math.max(8, W - w - 8)); y = side === 'top' ? rect.y0 - hh - gap : rect.y1 + gap;
      y = clamp(y, top, Math.max(top, H - hh - 8)); tail = clamp(cx - x, 26, Math.max(26, w - 26));
    } else {
      y = clamp(cy - hh / 2, top, Math.max(top, H - hh - 8)); x = side === 'left' ? rect.x0 - w - gap : rect.x1 + gap;
      x = clamp(x, 8, Math.max(8, W - w - 8)); tail = clamp(cy - y, 26, Math.max(26, hh - 26));
    }
    if (!el && !def.dock) side = 'free';                        // pointing at a stage spot, not at a thing: no tail
    node.classList.remove('tut-top', 'tut-bottom', 'tut-left', 'tut-right', 'tut-dock', 'tut-free');
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
  const moreExplainers = () => S.queue.some((q) => !!xParse(q.id));
  // an explainer on screen says Next while more are waiting, Got it on the last one
  const refreshOk = () => { const h = S.cur; if (h && !h.closing && h.def.explain && h.ok) safe(() => h.ok.rbSet({ label: okLabel(h.id, h.def) })); };
  function okLabel(id, def) {
    if (def.explain) return moreExplainers() ? 'Next' : 'Got it';
    if (isStep(def)) return def.step < CHAINS[def.chain].length - 1 ? 'Next' : 'Got it';
    return 'Got it';
  }
  function build(id, def) {
    const ok = UI.btn(okLabel(id, def), { kind: 'primary', size: 'sm', onclick: () => next() });
    ok.classList.add('tut-ok');
    const off = mk('button', { type: 'button', class: 'tut-off', text: def.explain ? 'Stop explaining' : 'Skip tutorial', onclick: () => { if (def.explain) stopExplaining(); else skip(); } });
    const tail = mk('i', { class: 'tut-tail', 'aria-hidden': 'true' });
    const label = def.title + '. ' + def.text;
    let node;
    if (def.explain) {
      const ico = XICON[def.kind] ? safe(() => UI.icon(XICON[def.kind], def.key, 52, {}), null) : null;
      const badge = mk('span', { class: 'tut-xico' + (def.tone ? ' tone-' + def.tone : ''), 'aria-hidden': 'true' }, ico || mk('b', { class: 'tut-xlet', text: String(def.title || '?').charAt(0).toUpperCase() }));
      node = mk('div', { class: 'tut tut-x', role: 'dialog', 'aria-label': def.label + ': ' + label, dataset: { hint: id } },
        mk('div', { class: 'tut-in' },
          mk('div', { class: 'tut-main' },
            mk('span', { class: 'tut-kicker', text: def.label }),
            mk('div', { class: 'tut-xhead' }, badge, mk('div', { class: 'tut-xname' }, mk('b', { class: 'tut-title', text: def.title }), def.sub ? mk('span', { class: 'tut-xsub' + (def.tone ? ' tone-' + def.tone : ''), text: def.sub }) : null)),
            mk('span', { class: 'tut-what', text: 'What it does' }),
            mk('p', { class: 'tut-text', text: def.text }),
            mk('div', { class: 'tut-foot' }, ok, off))),
        tail);
    } else {
      const stepTxt = isStep(def) ? 'Step ' + (def.step + 1) + ' of ' + CHAINS[def.chain].length : '';
      node = mk('div', { class: 'tut' + (isStep(def) ? ' tut-step' : ''), role: 'note', 'aria-label': (stepTxt ? stepTxt + '. ' : '') + label, dataset: { hint: id } },
        mk('div', { class: 'tut-in' },
          mk('span', { class: 'tut-seal', 'aria-hidden': 'true' }, UI.hanko(isStep(def) ? String(def.step + 1) : 'TIP', { size: 'sm' })),
          mk('div', { class: 'tut-main' },
            stepTxt ? mk('span', { class: 'tut-kicker', text: stepTxt }) : null,
            mk('b', { class: 'tut-title', text: def.title }),
            mk('p', { class: 'tut-text', text: def.text }),
            mk('div', { class: 'tut-foot' }, ok, off))),
        tail);
    }
    const ring = mk('div', { class: 'tut-ring', 'aria-hidden': 'true' }, mk('i', { class: 'r-a' }), mk('i', { class: 'r-b' }), mk('i', { class: 'r-c' }), mk('i', { class: 'r-d' }));
    return { node, ring, ok };
  }

  function show(id, force) {
    const def = defOf(id);
    if (!def || S.cur) return false;
    const parts = build(id, def);
    const h = { id, def, el: parts.node, ring: parts.ring, ok: parts.ok, closing: false, anchored: false };
    UI.layers.tips.appendChild(parts.ring);
    UI.layers.tips.appendChild(parts.node);
    S.cur = h;
    S.shown.push(id);
    // a hint is stored the moment it shows; a guided step or an explainer when it closes (so a screen change brings it back)
    if (!markOnClose(def) && (!force || !seen(id))) mark(id);
    (def.teaches || []).forEach((t) => { if (!seen(t)) mark(t); });
    place(h);
    const hold = UI.overlay.count() > 0;
    parts.node.classList.toggle('hold', hold);
    parts.ring.classList.toggle('hold', hold);
    safe(() => UI.announce((def.label ? def.label + ': ' : '') + def.title + '. ' + def.text));
    safe(() => { if (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.sfx)) AUDIO.sfx('reveal_landmark'); });
    if (!headless()) {
      // see-through: while the pointer is over the bubble, other than over its two buttons, it fades to a ghost and the player can read and aim at
      // whatever is underneath
      const see = (e) => {
        if (S.cur !== h || h.closing) { window.removeEventListener('pointermove', see); return; }
        const r = parts.node.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        const onBtn = !!(e.target && e.target.closest && e.target.closest('.tut-ok, .tut-off'));
        parts.node.classList.toggle('see', over && !onBtn);
      };
      window.addEventListener('pointermove', see);
      // the frame-clock upkeep: re-aim at a moving anchor, fade while the fight is busy, and expire after the time to live. UI.after dies with the
      // screen, which is what we want.
      const tick = () => {
        if (S.cur !== h || h.closing) return;
        place(h);
        const b = busy();
        parts.node.classList.toggle('dim', b); parts.ring.classList.toggle('dim', b);
        if (h.ok && def.explain) safe(() => h.ok.rbSet({ label: okLabel(id, def) }));
        UI.after(250, tick);
      };
      UI.after(250, tick);
      UI.after(def.ttl || 16000, () => { if (S.cur === h) dismiss('ttl'); });
      // leaving the screen disposes UI tweens, which resolves their promise: a leave detector (UI has no leave hook for outsiders)
      const probe = { v: 0 };
      UI.tween(probe, { v: 1 }, 3.6e6, 'linear').then(() => { if (S.cur === h && !h.closing) dismiss('leave'); });
    }
    return true;
  }

  // why: ok (Next / Got it), done (the player did it), ttl, off (Skip tutorial), xoff (Stop explaining), leave, end, reset, replace
  const ADVANCES = ['ok', 'done', 'ttl'];
  function dismiss(why) {
    const h = S.cur;
    if (!h || h.closing) return false;
    h.closing = true;
    h.why = why || 'ok';
    if (markOnClose(h.def) && (ADVANCES.indexOf(h.why) >= 0 || h.why === 'xoff')) mark(h.id);
    const finish = () => {
      safe(() => h.el.remove()); safe(() => h.ring.remove());
      if (S.cur === h) S.cur = null;
      if (isStep(h.def) && ADVANCES.indexOf(h.why) >= 0) advance(h.def.chain);
      S.gapOn = true;
      // Next on an explainer goes straight on to the next one: the player asked for it
      later(h.def.explain && h.why === 'ok' ? 120 : GAP_MS, () => { S.gapOn = false; pump(); });
    };
    if (why === 'done' && !headless()) {
      h.el.classList.add('done'); h.ring.classList.add('out');
      UI.after(520, finish);
      // if the screen changes during the farewell, the screen event below clears it
    } else if (!headless() && (why === 'ok' || why === 'ttl' || why === 'off' || why === 'xoff')) {
      h.el.classList.add('out'); h.ring.classList.add('out');
      UI.after(220, finish);
    } else finish();
    return true;
  }
  const next = () => dismiss('ok');

  // Skip tutorial: every guided step and hint is marked as seen; explainers go on (they have their own Stop explaining)
  function skip() {
    Object.keys(HINTS).forEach((id) => { if (!seen(id)) mark(id); });
    S.queue = S.queue.filter((q) => !HINTS[q.id]);
    S.waiting = {};
    safe(() => UI.toast('Tutorial skipped. Replay it any time from Settings.', 'info'));
    dismiss('off');
  }
  function stopExplaining() {
    mark('x_off');
    S.queue = S.queue.filter((q) => !xParse(q.id));
    safe(() => UI.toast('No more explainers. Turn them back on with Replay tutorial in Settings.', 'info'));
    dismiss('xoff');
  }

  // ==================================================================================================================
  // the walkthroughs
  // ==================================================================================================================
  const nextStepOf = (chain) => CHAINS[chain].find((id) => !seen(id)) || null;
  function offerStep(chain) {
    const id = nextStepOf(chain);
    delete S.waiting[chain];
    if (!id) return false;
    const def = HINTS[id];
    if (!scopeOk(def)) return false;
    if (def.ready && !safe(() => def.ready(), false)) { S.waiting[chain] = id; return false; }
    return enqueue(id);
  }
  function startChain(chain) {
    if (!enabled()) return;
    const v = VETERAN[chain];
    if (v && seen(v.was)) v.skip.forEach((id) => { if (!seen(id)) mark(id); });
    // already running (a step is up or queued): nothing to do
    if ((S.cur && S.cur.def.chain === chain) || S.queue.some((q) => HINTS[q.id] && HINTS[q.id].chain === chain)) return;
    if (offerStep(chain)) later(0, pump);
  }
  function advance(chain) {
    if (!enabled()) return;
    if (offerStep(chain)) later(0, pump);
  }
  // a step that waits for its moment (a fight on the map) is offered again whenever something happens
  function recheckWaiting() {
    Object.keys(S.waiting).forEach((chain) => { if (offerStep(chain)) later(0, pump); });
  }
  const chainBusy = () => (S.cur && isStep(S.cur.def)) || S.queue.some((q) => isStep(HINTS[q.id]) && scopeOk(HINTS[q.id]));
  // A walkthrough on this screen that still has steps to show (and is not waiting for its moment) goes first: hints and explainers of this screen
  // wait for it (a boss fight that is also the first fight teaches the turn before the boss).
  const chainHolds = () => chainBusy() || Object.keys(CHAINS).some((c) => {
    const id = nextStepOf(c);
    return !!id && !S.waiting[c] && scopeOk(HINTS[id]);
  });

  // ==================================================================================================================
  // explainers: what is new on this screen?
  // ==================================================================================================================
  function explain(kind, key, force, sel, n) {
    if (XKINDS.indexOf(kind) < 0 || !xExists(kind, key)) return false;
    if ((XSKIP[kind] || []).indexOf(key) >= 0 && !force) return false;
    const id = xId(kind, key);
    if (!force && (!explaining() || seen(id))) return false;
    if ((S.cur && S.cur.id === id) || S.queue.some((q) => q.id === id)) return false;
    XMEMO[id] = { sel: sel || (XMEMO[id] && XMEMO[id].sel) || null, n, scr: UI.currentName, force: !!force };
    S.queue.push({ id, force: !!force, seq: ++S.xSeq });
    refreshOk();
    later(0, pump);
    return true;
  }
  const attr = (v) => String(v).replace(/[^a-z0-9_-]/gi, '');
  function scan() {
    if (!explaining() || GAME_SCREENS.indexOf(UI.currentName) < 0) return;
    const root = UI.layers.screens;
    if (!root) return;
    // statuses on the stage (hero panels, enemies)
    safe(() => root.querySelectorAll('.status[data-s]').forEach((el) => {
      const s = el.dataset.s;
      if (!DATA.statuses[s]) return;
      const nEl = el.querySelector('.n'), n = nEl && nEl.textContent !== '' ? Number(nEl.textContent) : undefined;
      explain('status', s, false, '#screens .status[data-s="' + attr(s) + '"]', Number.isFinite(n) ? n : undefined);
    }));
    // keywords on the cards in view: the underlined words, and keywords the card carries without a word in its text
    safe(() => root.querySelectorAll('.card .kw[data-kw]').forEach((el) => {
      const info = safe(() => UI.tip.info(el.dataset.kw), null);
      if (!info) return;
      explain(info.status ? 'status' : 'keyword', info.key, false, '#screens .kw[data-kw="' + attr(el.dataset.kw) + '"]');
    }));
    safe(() => root.querySelectorAll('.card').forEach((el) => {
      const kw = (el.rbResolved && el.rbResolved.kw) || [];
      kw.forEach((k) => { if (DATA.keywords[k]) explain('keyword', k, false, '#screens .card[data-id="' + attr(el.dataset.id) + '"]'); });
    }));
    const R = run();
    if (!R) return;
    if (UI.currentName !== 'combat') {
      (R.relics || []).forEach((id) => explain('relic', id, false, '#screens .relic[data-id="' + attr(id) + '"]'));
      (R.gems || []).forEach((id) => explain('gem', id, false, '#screens .gem[data-id="' + attr(id) + '"]'));
      (R.brushes || []).forEach((id) => explain('spell', id, false, '[data-tut="brushes"]'));
    }
    if (UI.currentName === 'map' && R.map && R.map.tiles) {
      const tiles = R.map.tiles;
      Object.keys(tiles).forEach((k) => { const t = tiles[k]; if (t && t.painted && t.type) explain('tile', t.type, false, null); });
    }
  }

  // ==================================================================================================================
  // the queue
  // ==================================================================================================================
  function enqueue(id, force) {
    const def = defOf(id);
    if (!def) return false;
    if (!enabled() && !force) return false;
    if (!force && seen(id)) return false;
    if (S.cur && S.cur.id === id) return false;
    if (S.queue.some((q) => q.id === id)) return false;
    S.queue.push({ id, force: !!force, seq: ++S.xSeq });
    return true;
  }
  // priority: guided steps and hints in catalog order, then explainers in the order they were met; a hint with `after` waits for that one first
  const PRIO = {};
  Object.keys(HINTS).forEach((id, i) => { PRIO[id] = i; });
  const prio = (q) => (PRIO[q.id] !== undefined ? PRIO[q.id] : 1000 + q.seq);
  function keep(q) {
    const d = defOf(q.id);
    if (!d) return false;
    if (q.force) return true;
    if (seen(q.id) || !enabled() || !scopeOk(d)) return false;
    if (d.explain && !explaining()) return false;
    if (S.over && d.scope && d.scope.indexOf('combat') >= 0 && UI.currentName === 'combat') return false;
    return true;
  }
  function pump() {
    if (S.cur || S.gapOn) return;
    S.queue = S.queue.filter(keep);
    if (!S.queue.length) return;
    if (busy()) {
      // try again shortly on the frame clock (never headless: busy() is false there)
      if (!S.retry) { S.retry = true; UI.after(400, () => { S.retry = false; pump(); }); }
      return;
    }
    S.queue.sort((a, b) => prio(a) - prio(b));
    const hold = chainHolds();
    let pick = S.queue.find((q) => q.force || isStep(HINTS[q.id]) || !hold), guard = 0;
    if (!pick) return;
    while (guard++ < 4) {
      const pre = HINTS[pick.id] && HINTS[pick.id].after;
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
      if (!enabled() || (r.hint && seen(r.hint))) return;
      const def = r.hint ? HINTS[r.hint] : HINTS[CHAINS[r.chain][0]];
      // the delay lets the screen finish its own entrance before a bubble appears; the condition is tested again then (a status chip may only
      // exist by now), and a hint that lost its screen meanwhile is dropped
      later(r.delay || 0, () => {
        if (!def || !scopeOk(def)) return;
        if (r.when && !safe(() => r.when(payload, S.counts), false)) return;
        if (r.chain) { startChain(r.chain); return; }
        // pump one beat later, so every rule the same event raised is queued before the priority order picks
        if (enqueue(r.hint)) later(0, pump);
      });
    });
    if (SCAN_ON[evt] !== undefined && explaining()) later(SCAN_ON[evt], scan);
  }
  // the player already did what a hint teaches: close it with a tick if it is up, and never raise it later
  // A walkthrough step the player got ahead of is done too, but only when every earlier step is seen or on screen, never by the same action that
  // finishes the step on screen (the walk that ends "Walk there" is not the walk into a fight), and a step with a moment (ready) only once it has come.
  function completeIf(evt) {
    const h = S.cur && !S.cur.closing ? S.cur : null;
    const curDone = !!(h && h.def.completeOn && h.def.completeOn.indexOf(evt) >= 0);
    const done = Object.keys(HINTS).filter((id) => {
      const d = HINTS[id];
      if (!d.completeOn || d.completeOn.indexOf(evt) < 0 || seen(id) || (h && h.id === id)) return false;
      if (!d.chain) return true;
      if (curDone && h.def.chain === d.chain) return false;
      if (!CHAINS[d.chain].slice(0, d.step).every((p) => seen(p) || (h && h.id === p))) return false;
      return !d.ready || !!safe(() => d.ready(), false);
    });
    done.forEach(mark);
    if (curDone) dismiss('done');
  }

  function onEvent(evt) {
    return (payload) => {
      if (evt === 'map:paint') S.counts.paints++;
      if (evt === 'map:walk') S.counts.walks++;
      // rules first: what this event teaches next must already be waiting when the finished bubble's gap ends (headless collapses both to microtasks)
      applyRules(evt, payload);
      completeIf(evt);
      later(0, recheckWaiting);
    };
  }
  // the fight is decided (win or lose): no combat bubble may start over the victory or defeat beat, and one that is up closes (L9). A walkthrough
  // step that closes this way is not stored, so it comes back in the next fight.
  function onCombatEnd() {
    S.over = true;
    const h = S.cur;
    if (h && !h.closing && h.def.scope && h.def.scope.indexOf('combat') >= 0) dismiss('end');
    S.queue = S.queue.filter((q) => { const d = defOf(q.id); return q.force || !(d && d.scope && d.scope.indexOf('combat') >= 0); });
  }
  function onScreen(e) {
    // a screen change clears a bubble that belongs to another screen (or one that was mid-farewell: its timer died with the old screen), and
    // drops queue entries that no longer fit
    S.gapOn = false;
    S.over = false;
    const name = e && e.name;
    // walking into a fight means the map walkthrough's walk and fight steps are done
    if (name === 'combat') ['walk', 'fight'].forEach((id) => { if (!seen(id) && seen('paint')) mark(id); });
    const h = S.cur;
    if (h && (h.closing || !scopeOk(h.def))) {
      const finished = h.closing && isStep(h.def) && ADVANCES.indexOf(h.why) >= 0;
      h.closing = true; safe(() => h.el.remove()); safe(() => h.ring.remove()); S.cur = null;
      if (finished) advance(h.def.chain);
    }
    S.queue = S.queue.filter((q) => q.force || scopeOk(defOf(q.id)));
    applyRules('screen', e);
    pump();
  }
  function onOverlay(e) {
    const hold = UI.overlay.count() > 0;
    if (S.cur) { S.cur.el.classList.toggle('hold', hold); S.cur.ring.classList.toggle('hold', hold); }
    // a closed overlay (a Charm picked, a card taken) may have brought something new; the queue may also have waited for it
    if (!hold && e && e.open === false) { if (explaining()) later(300, scan); later(0, pump); }
  }

  function wire() {
    if (S.wired) return;
    S.wired = true;
    UI.bus.on('screen', onScreen);
    UI.bus.on('overlay', onOverlay);
    UI.bus.on('combat:end', onCombatEnd);
    ['map:paint', 'map:brush', 'map:walk', 'combat:turn', 'combat:play', 'combat:endturn', 'combat:swap', 'combat:pick'].forEach((evt) => UI.bus.on(evt, onEvent(evt)));
  }

  // Replay tutorial: every tut_ flag goes (steps, hints, explainers and Stop explaining), so the walkthrough starts again on the next map and fight
  function reset() {
    dismiss('reset');
    S.queue.length = 0; S.counts.paints = 0; S.counts.walks = 0; S.gapOn = false; S.waiting = {};
    if (S.cur) { safe(() => S.cur.el.remove()); safe(() => S.cur.ring.remove()); S.cur = null; }
    const flags = safe(() => Object.keys(META.profile.tutorial || {}), null);
    if (flags) flags.filter((k) => /^tut_/.test(k)).forEach((k) => safe(() => META.setTutorial(k, false)));
    else Object.keys(HINTS).concat(['x_off']).forEach((id) => safe(() => META.setTutorial(FLAG(id), false)));
  }

  UI.tutorial = {
    HINTS, RULES, CHAINS, counts: S.counts, shown: S.shown,
    enabled, explaining, fire, dismiss, next, skip, stopExplaining, reset, seen, flag: FLAG, scan, explainDef,
    explain: (kind, key, force) => explain(kind, key, !!force),
    show: (id) => { if (S.cur) dismiss('replace'); return show(id, true); },
    current: () => (S.cur ? { id: S.cur.id, el: S.cur.el, ring: S.cur.ring, anchored: S.cur.anchored, closing: S.cur.closing, kind: S.cur.def.explain ? 'explain' : isStep(S.cur.def) ? 'step' : 'hint' } : null),
    queue: () => S.queue.map((q) => q.id),
    waiting: () => Object.assign({}, S.waiting),
    idle: () => !S.cur && !S.queue.length,
  };
  wire();
})();
