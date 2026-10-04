// Echowake: the combat screen (owner: combat screen engineer). DESIGN 5.8 (card interaction, HUD zones), 5.9 (the presentation pipeline) and
// ART_BIBLE 8 (HUD look). This header is the contract of record for js/screen_combat.js; the look lives in css/combat.css (every rule is .cm / .cm-*).
//
// ENTRY   UI.screens.combat, params {node, R}. GAME passes both (R defaults to UI.run, node to R.node; `debug` is set by GAME.debug.open). enter builds
//   COMBAT.create(RUN.combatInit(R, node)), the DOM inside `root`, mounts SCENE, waits a beat for the ink transition, then drains C.start(). The screen
//   is entered through the ink bloom (`transition: 'ink'`, which prints a tip). Music: combat<chapter>, elite, boss<chapter>, and `final` when the
//   Editor enters its last phase; AUDIO.intensity(clamp(fallen share + 0.25 per boss phase)) after every batch, reset to 0 at leave.
//
// THE PIPELINE (5.9). Every C action (play, swap, endTurn, resolvePick) returns events; they go into ONE FIFO and are drained one by one:
//   applyEvent(vm, evt) (pure, uses only what the event carries) -> the affected DOM -> await SCENE.play(evt) (its gate). While draining nothing reads
//   C.hand, C.heroes or C.enemies; C is used only for canPlay, needsTarget, legalTargets, preview, intent, canSwap. When the FIFO empties the vm is rebuilt
//   from C (hard resync: every panel, the hand, piles, energy, intents, previews, SCENE.setViewState) and input unlocks. The vm before the resync is
//   compared with the engine (`drift`, a test hook): the suite proves applyEvent equals the engine over whole fights. pick_needed (always the last event
//   of its batch) opens the picker: from:'hand' = hand select mode with a Confirm plaque (Skip when optional), other piles = overlay cardPick; then
//   C.resolvePick and the drain continues (a refused answer asks again: a required pick cannot be dodged). A tap or click anywhere while draining
//   fast-forwards (SCENE.flush and SCENE.play gates skipped for the rest of that drain), a watchdog frees a SCENE beat stuck for 6 s of frames,
//   unmount mid-drain is safe (UI.live checks after every await, leave resolves every waiter), and a throwing SCENE never bricks the fight.
//
// WHAT THE SCREEN DRAWS (DOM): top bar (relic strip with tooltips, gold and ink counters, turn label, speed toggle, menu), two hero panels (medallion,
//   HP bar with an ink-splash lag, Block chip, up to 6 status chips then +N, FRONT/BACK tag with the row bonus, danger vignette), the Swap seal (FREE or its
//   cost, Bind lock), enemy overlays placed once per frame from SCENE.anchor (HP bar 14 px under the feet, Block chip, status chips, intent bubble with
//   the icon, C.intent number (NxM for multi-hits), applied statuses, summons, cards added, gold stolen, targeted heroes, a tooltip that explains the whole
//   move, a Stunned bubble and stars, a focusable hit area with the enemy's aria-label), the hand fan (hover lift, rise on select with the big
//   UI.tip.card preview, drag), per-enemy damage previews from C.preview (gold "KO" when lethal), the energy orb, draw and discard piles (tap for the
//   deck viewer), Exhausted and Powers chips, the End Turn plaque (glows when nothing is playable, off during the enemy phase), turn banners, the pick
//   prompt and the victory and defeat cards. Canvas actors, VFX, damage numbers, target rings, the aim arrow, barks and all combat SFX are SCENE's.
//   Ownership choices made with SCENE: the screen draws the turn banners (SCENE only does with mount({banners:true})); a boss reveal is SCENE.banner(name,
//   'BOSS') (a champion or a page without SCENE gets a DOM plate); an enemy `say` is left to SCENE.shout when SCENE has it, else a DOM bubble.
//   Without SCENE.mount and SCENE.play (missing or broken file) a small built-in stage keeps the fight playable (fallbackScene).
//
// INPUT. Tap a card: select (it rises to y 420, the preview opens, SCENE.setTargetable lights the legal targets, every target shows its C.preview number).
//   No-target card: a second tap plays. Targeting card: tap an enemy; a second tap on the card puts it back, except that with exactly one legal target
//   a MOUSE (or keyboard click) plays on the first click (hover already showed the card), while a finger or pen only lifts it on the first tap (the rules
//   text of a card at rest is below a phone's bottom edge) and plays on a second tap on the card, a tap on the enemy, or a drag released above y 430.
//   Drag: more than 8 px starts it; no-target cards play when released above y 430, targeting cards aim (SCENE.aim) and play on the enemy they
//   are released on, anything else returns. Tap empty stage or Esc deselects. Illegal plays: a toast with the reason ("Not enough Energy", "<Hero> is
//   down", "<Hero> is stunned"...), ui_error and a shake, engine untouched. Keys: 1..9 and 0 select, Left and Right walk cards then targets, Enter plays,
//   E ends the turn, S swaps, D and G open the piles, Z toggles animation speed, Esc puts a card back (else UI opens the pause menu). Tab walks heroes,
//   enemies (line order), hand, piles, End Turn. A live region line is written per drained batch.
//
// THE END. win: bus combat:end {win}, VICTORY card, 1.4 s beat, RUN.combatDone(R, C), then GAME.enterNode(R.node) (the reward node). lose:
//   RUN.combatDone (merges the stats, R.done), bus combat:end {lose} (GAME records the run at once), DEFEAT card, 1 s beat, GAME.enterNode({kind:'defeat'}).
//   The menu button is disabled during the beat so a save can never capture a won fight as a fresh one.
//
// ALIGNMENT (every overlay must line up with the art under it and with its neighbours; each has ONE source of truth, and the suite checks them):
//   * the bottom docks (orb, both piles, End Turn) share the line DOCK_CY, which build() hands to combat.css as --dock-cy;
//   * under an enemy: the HP bar's centre and the status row's top are UNDER[desktop|compact], chosen so the count digits end above the resting hand;
//     the fan rests at HAND.restY, or HAND.restYCompact on a phone; the tutorial's `hand` anchor (.cm-handbox) is derived from slotFor;
//   * HP bar widths come from barWidths(): living neighbours never touch (an xl boss beside a lane 3 minion gives way), BAR_W_COMPACT is a little wider
//     for the bigger Block chip and numbers of a phone; the relic strip has RELIC_SLOTS places, the +N chip takes the last;
//   * the top right buttons are --hit tall on a phone: hudBox() says where they are, an intent bubble that reaches them is placed below them.
//   * the Swap seal hangs on the right edge of the hero panels, its centre --sx (26 px) past it, so its dashed ring starts beyond the 294 px where a panel's text column ends: the
//     row bonus ("+2 dmg", up to two lines at Larger text), the tag and the status chips of either panel are never under it, at any text size.
//
// BUS (UI.bus): combat:turn {turn, phase} on every turn_start, combat:select {uid}, combat:play {uid, target}, combat:endturn, combat:swap, combat:pick
//   {pending}, combat:end {result}. Tutorial anchors (data-tut): hand (a box around the fan at rest, .cm-handbox), energy, endturn, swap, intent (each bubble), enemy (each hit area), relics, deck (draw pile).
//
// DEBUG (main.js conventions): screen.debug() -> {C, vm, state, fire(evt), play(handIndex, targetIndex), endTurn(), swap(), setHp(who, hp),
//   setStatus(who, s, n), setEnergy(n), pick(uids), feed(events), win()}; screen.debugSetup({hand:[cardIds], statuses:{unitId:{s:n}}, turn}) applies once
//   the opening drain is done. screen._t exports the pure parts for tests: snapshot applyEvent settle digest describe pickBark rowBrief reasonText
//   slotFor counts, plus state() (the live per-fight state). In debug runs the intro pause is skipped and the first drain fast-forwards.
(() => {
  'use strict';

  // ==================================================================================================================
  // constants: the fixed HUD zones of DESIGN 5.8 (stage px) and the small dials of this screen
  // ==================================================================================================================
  const W = 1280, H = 720;
  // the fan lives in the free strip between the docks (draw pile ends x 224, discard pile starts x 998), and a card on the edge of the fan is turned 5.5
// degrees about a point below the screen, which swings its top corner and its flank (at pile height) about 24 px outward (`swing`): so the unturned box is x 252..970
  // restYCompact: on the compact stage (a phone) the status discs under the enemies are 24 px and their counts hang 5 px lower, which does not fit in the 46 px
  // between the ground and a hand resting at 566; the fan rests 10 px lower there (see UNDER)
  const HAND = { x0: 252, x1: 970, restY: 566, restYCompact: 576, cw: 190, ch: 266, hoverTop: 468, raiseTop: 420, maxSpread: 150, swing: 24 };
  // The bottom docks (energy orb, draw and discard piles, End Turn plaque) share ONE centre line. combat.css positions each dock from it
  // (top: calc(var(--dock-cy) - half its height)) and build() sets --dock-cy from this number, so the docks cannot drift apart; PILE is where card flights start and end.
  const DOCK_CY = 654;
  const PILE = { draw: { x: 186, y: DOCK_CY - 5 }, discard: { x: 1044, y: DOCK_CY - 5 }, exhaust: { x: 1044, y: 590 }, orb: { x: 70, y: DOCK_CY } };
  const LANE_X = [560, 705, 850, 995, 1120];    // SCENE.LAYOUT enemy lanes (DESIGN 5.9); the fallback stage and the status row caps need them
  const PLAY_ZONE_Y = 430;                       // a no-target card dragged above this line is played (DESIGN 5.8)
  const DRAG_PX = 8;                             // pointer travel that turns a press into a drag
  // Enemy HP bars, centred on the lane. The compact stage has bigger Block chips and numbers (18 px), so its small and medium bars are a little wider: with Block
  // the chip takes 49 px of the bar and the HP text (58 px at 18 px) must still fit in what is left (finding 21). Two living neighbours never touch: barWidths().
  const BAR_W = { s: 104, m: 120, l: 140, xl: 212 };
  const BAR_W_COMPACT = { s: 122, m: 126, l: 140, xl: 212 };
  const BAR_CLEAR = 4;                           // the least air between two neighbouring bars
  // What hangs under an enemy, in px below its feet line: the HP bar's centre and the top of the status row. The count digits hang a little under the
  // discs (dig), and they must end above the resting hand: feet 520 + row + d + dig <= restY (the suite checks it for both stages, finding 20).
  const UNDER = { desk: { bar: 10, row: 21 }, compact: { bar: 11, row: 24 } };
  const BARK_GAP_MS = 6000, BARK_CHANCE = 0.35;
  // A status row is centred on its enemy and a neighbouring lane is only 145 px away (lanes 3 and 4: 125 px), so the row, not the chip count, is what
  // must fit. A desktop row may hold five chips, or four and a +N (131 px); the compact stage has bigger discs (24 px) and a bigger +N chip (38 px), so
  // four chips or three and a +N (122 px); the last lane is only 125 px from its neighbour, so it gets one chip less (106 px and 94 px). The +N chip says
  // how many are hidden and a tap on the foe lists them all.
  // The relic strip has RELIC_SLOTS places (x 12 to 334, 40 px icons 7 px apart, ending 26 px before the gold counter at 360): a bigger purse shows
  // RELIC_SLOTS - 1 treasures and the +N chip in the last place, so the chip can never reach the counters (finding 18).
  const HERO_CHIPS = 6, RELIC_SLOTS = 7, ENEMY_CHIPS = { desk: 5, compact: 4 };
  const ROW_CHIP = { desk: { d: 21, more: 31, gap: 4, dig: 3.5 }, compact: { d: 24, more: 38, gap: 4, dig: 5.4 } };   // mirrors combat.css (.en-st .status --d, .cm-more with a one digit count, .cm-st gap, the .n count's overhang)
  const LANE_GAP = [145, 145, 145, 125];                                                          // distance from lane k to lane k+1 (LANE_X)
  const WATCHDOG_S = 6;                          // a SCENE beat that has not resolved after this many seconds is force-finished
  const FALLBACK_GATES = { hit: 120, heal: 60, draw: 40, swap: 380, enemy_act: 260, summon: 400, death: 420, enemy_phase: 900, hero_down: 500, hero_revive: 500, turn_start: 500, end: 700 };
  const REASONS = {
    energy: 'Not enough Breath', unplayable: 'That card cannot be played', pending: 'Finish your choice first', phase: 'Wait for your turn',
    target: 'Choose a target', notInHand: 'That card is not in your hand',
  };
  const PICK_VERB = { discard: 'discard', exhaust: 'fade', retain: 'keep', upgrade: 'upgrade', copy: 'copy', toHand: 'take into your hand', toDrawTop: 'put on top of your draw pile' };
  const INTENT_LABEL = { attack: 'Attack', multi: 'Flurry', heavy: 'Big hit', defend: 'Guard', buff: 'Hype up', debuff: 'Jinx', summon: 'Summon', heal: 'Heal', special: 'Special', flee: 'Flee', none: 'Idle' };
  const TIER_NAME = { minion: 'Sidekick', normal: 'Creature', elite: 'Rival', boss: 'Headliner' };
  const KIND_ORDER = { buff: 0, resource: 1, debuff: 2 };

  // ==================================================================================================================
  // small helpers
  // ==================================================================================================================
  const mk = (tag, props, ...kids) => U.el(tag, props, ...kids);
  const clamp = U.clamp;
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  const isFn = (o, k) => !!o && typeof o[k] === 'function';
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const headless = () => !!window.__HEADLESS;
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : 0);
  const px = (n) => Math.round(n * 100) / 100 + 'px';
  const cap = U.cap;
  const warned = {};
  const warnOnce = (key, msg, e) => { if (warned[key]) return; warned[key] = true; console.warn('[combat] ' + msg + (e ? ': ' + (e.message || e) : '')); };
  const sfx = (id) => { if (typeof AUDIO !== 'undefined' && isFn(AUDIO, 'sfx')) safe(() => AUDIO.sfx(id)); };
  const heroName = (id) => (DATA.heroes[id] ? DATA.heroes[id].name : String(id));
  const cardDef = (id) => DATA.cards[id] || null;
  const cp = (c) => { const o = { uid: c.uid, id: c.id, up: c.up ? 1 : 0, gems: (c.gems || []).slice() }; if (c.tmp) o.tmp = true; return o; };
  const clone = (o) => (o === undefined || o === null ? o : JSON.parse(JSON.stringify(o)));

  // ==================================================================================================================
  // the view model (DESIGN 5.9 step 1 and 2). snapshot(C) builds it from the final engine state; applyEvent(vm, evt) advances it by
  // ONE event using only what the event carries. Both are pure and exported for the suite as UI.screens.combat._t.
  //   vm = { heroes:[unit], enemies:[unit], energy, maxEnergy, hand:[inst], draw:[inst], discard:[inst], exhaust:[inst], powers:[inst],
  //          inPlay:inst+{to}|null, handN, drawN, discardN, exhaustN, powersN, turn, phase, result, pending, retained:{uid:true}, gold, ink }
  //   unit = { kind, id, def, name, hp, maxHp, block, st:{}, down, fled, tier, size, lane, phase, row, intent }
  // The draw pile is a multiset here (the engine never tells the order); piles are exact per event, so a pile overlay opened in the
  // middle of the enemy phase shows what the picture shows.
  // ==================================================================================================================
  function unitVM(u) {
    return {
      kind: u.kind, id: u.id, def: u.def || u.id, name: u.name, hp: u.hp, maxHp: u.maxHp, block: u.block || 0, st: Object.assign({}, u.st || {}),
      down: !!u.down, fled: !!u.fled, tier: u.tier || null, size: u.size || null, lane: u.lane === undefined ? null : u.lane, phase: u.phase || 0,
      row: u.row || null, intent: u.intent ? clone(u.intent) : null,
    };
  }

  function counts(vm) {
    vm.handN = vm.hand.length; vm.drawN = vm.draw.length;
    vm.discardN = vm.discard.length + (vm.inPlay && vm.inPlay.to === 'discard' ? 1 : 0);
    vm.exhaustN = vm.exhaust.length;
    vm.powersN = vm.powers.length + (vm.inPlay && vm.inPlay.to === 'power' ? 1 : 0);
    return vm;
  }

  function snapshot(C) {
    const vm = {
      heroes: C.heroes.map(unitVM), enemies: C.enemies.map(unitVM), energy: C.energy, maxEnergy: C.maxEnergy,
      hand: C.hand.map(cp), draw: C.draw.map(cp), discard: C.discard.map(cp), exhaust: C.exhaust.map(cp), powers: C.powers.map(cp),
      inPlay: C.inPlay ? Object.assign(cp(C.inPlay), { to: 'discard' }) : null,
      turn: C.turn, phase: C.phase, result: C.result, pending: C.pending ? clone(C.pending) : null, retained: {}, gold: 0, ink: 0,
    };
    C.hand.forEach((c) => { if (c.keep) vm.retained[c.uid] = true; });
    return counts(vm);
  }

  const unitOf = (vm, ref) => (ref ? (ref.kind === 'hero' ? vm.heroes : vm.enemies).find((u) => u.id === ref.id) || null : null);
  const heroOf = (vm, id) => vm.heroes.find((h) => h.id === id) || null;
  const enemyOf = (vm, id) => vm.enemies.find((e) => e.id === id) || null;
  const PILES = ['hand', 'draw', 'discard', 'exhaust', 'powers'];

  // take a card out of whichever zone holds it (a card the vm has never seen, like a fresh temp card, is simply not found)
  function pull(vm, uid) {
    for (let k = 0; k < PILES.length; k++) {
      const list = vm[PILES[k]];
      const i = list.findIndex((c) => c.uid === uid);
      if (i >= 0) return list.splice(i, 1)[0];
    }
    if (vm.inPlay && vm.inPlay.uid === uid) { const c = vm.inPlay; vm.inPlay = null; return c; }
    return null;
  }

  function applyEvent(vm, e) {
    switch (e.type) {
      case 'turn_start':
        vm.phase = e.who;
        if (e.who === 'player') { vm.turn = e.turn; vm.energy = e.energy; vm.maxEnergy = e.maxEnergy; vm.retained = {}; }
        break;
      case 'draw':
        e.cards.forEach((c) => { pull(vm, c.uid); vm.hand.push(cp(c)); });
        break;
      case 'shuffle':
        vm.draw = vm.draw.concat(vm.discard); vm.discard = [];
        break;
      case 'discard':
        e.cards.forEach((c) => { pull(vm, c.uid); vm.discard.push(cp(c)); });
        break;
      case 'exhaust':
        pull(vm, e.card.uid); vm.exhaust.push(cp(e.card));
        break;
      case 'add_card':
        e.cards.forEach((c) => { pull(vm, c.uid); (vm[e.to] || vm.discard).push(cp(c)); });
        break;
      case 'card_move': {
        pull(vm, e.card.uid);
        if (e.to === 'draw') vm.draw.unshift(cp(e.card)); else (vm[e.to] || vm.discard).push(cp(e.card));
        break;
      }
      case 'card_upgrade':
        PILES.forEach((k) => vm[k].forEach((c) => { if (c.uid === e.card.uid) { c.up = 1; c.gems = (e.card.gems || c.gems).slice(); } }));
        if (vm.inPlay && vm.inPlay.uid === e.card.uid) vm.inPlay.up = 1;
        break;
      case 'retain':
        e.cards.forEach((c) => { vm.retained[c.uid] = true; });
        break;
      case 'energy':
        vm.energy = e.value;
        break;
      case 'play': {
        const c = pull(vm, e.card.uid) || cp(e.card);
        vm.inPlay = Object.assign(cp(c), { to: e.to });
        break;
      }
      case 'hit': {
        const u = unitOf(vm, e.dst);
        if (u) { u.hp = e.hp; u.block = e.block; }
        break;
      }
      case 'thorns': {
        const u = unitOf(vm, e.dst);
        if (u) u.hp = e.hp;
        break;
      }
      case 'block': {
        const u = unitOf(vm, e.dst);
        if (u) u.block = e.block;
        break;
      }
      case 'block_lost': {
        const u = unitOf(vm, e.dst);
        if (u) u.block = Math.max(0, u.block - e.amount);
        break;
      }
      case 'heal': case 'hurt': {
        const u = unitOf(vm, e.dst);
        if (u) u.hp = e.hp;
        break;
      }
      case 'status': {
        const u = unitOf(vm, e.dst);
        if (u) { if (e.value) u.st[e.s] = e.value; else delete u.st[e.s]; }
        break;
      }
      case 'swap':
        vm.heroes.forEach((h) => { if (h.id === e.front) h.row = 'front'; else if (h.id === e.back) h.row = 'back'; });
        break;
      case 'intent': {
        const u = enemyOf(vm, e.enemy);
        if (u) u.intent = clone(e.intent);
        break;
      }
      case 'summon':
        if (!enemyOf(vm, e.enemy.id)) vm.enemies.push(unitVM(e.enemy));
        break;
      case 'enemy_phase': {
        const u = enemyOf(vm, e.enemy);
        if (u) u.phase = e.index;
        break;
      }
      case 'death': {
        const u = unitOf(vm, e.unit);
        if (u) { u.down = true; u.hp = 0; }
        break;
      }
      case 'flee': {
        const u = unitOf(vm, e.unit);
        if (u) { u.down = true; u.fled = true; }
        break;
      }
      case 'hero_down': {
        const h = heroOf(vm, e.hero);
        if (h) { h.down = true; h.hp = 0; h.block = 0; h.st = {}; }
        break;
      }
      case 'hero_revive': {
        const h = heroOf(vm, e.hero);
        if (h) { h.down = false; h.hp = e.hp; }
        break;
      }
      case 'max_hp': {
        const h = heroOf(vm, e.hero);
        if (h) { h.maxHp = Math.max(1, h.maxHp + e.n); h.hp = e.n > 0 ? Math.min(h.maxHp, h.hp + e.n) : Math.min(h.hp, h.maxHp); }
        break;
      }
      case 'pick_needed':
        vm.pending = clone(e.pending);
        break;
      case 'gold': vm.gold += e.n; break;
      case 'ink': vm.ink += e.n; break;
      case 'end':
        vm.result = e.result; vm.phase = 'over'; vm.pending = null;
        vm.heroes.forEach((h) => { h.block = 0; h.st = {}; });
        break;
      default: break;                            // combat_start turn_end dodge immune skip enemy_act relic: pictures only
    }
    return counts(vm);
  }

  // the card that was in play lands in its pile once the action's events are all applied (the engine emits no event for a plain discard)
  function settle(vm) {
    if (vm.inPlay) {
      const c = vm.inPlay; vm.inPlay = null;
      const bare = cp(c);
      if (c.to === 'discard') vm.discard.push(bare); else if (c.to === 'power') vm.powers.push(bare);
    }
    return counts(vm);
  }

  // order-free fingerprint of a vm, used to prove the event-by-event vm equals the engine at the end of a batch
  function digest(vm) {
    const ids = (l) => l.map((c) => c.uid + ':' + c.id + ':' + c.up).sort().join(',');
    const unit = (u) => [u.id, u.hp, u.maxHp, u.block, u.down ? 1 : 0, u.row || '', u.phase || 0, Object.keys(u.st).sort().map((k) => k + '=' + u.st[k]).join('|')].join('/');
    return [
      vm.heroes.map(unit).join(';'), vm.enemies.map(unit).join(';'), vm.energy + '/' + vm.maxEnergy,
      ids(vm.hand), ids(vm.draw), ids(vm.discard), ids(vm.exhaust), ids(vm.powers), vm.inPlay ? vm.inPlay.uid : '-', vm.turn, vm.result || '-',
    ].join('#');
  }

  // ------------------------------------------------------------------------------------------------------------------
  // texts: card ctx, row bonus, bark choice, screen reader lines. All pure.
  // ------------------------------------------------------------------------------------------------------------------
  // compact row bonus for the panel tag ("+2 dmg", "Feedback 2"); the tooltip carries DATA.rowText in full. Status words come from DATA.
  function rowBrief(heroId, row, relics) {
    const f = DATA.rowFor(heroId, row, relics);
    const out = [];
    if (f.dmgAdd) out.push((f.dmgAdd > 0 ? '+' : '') + f.dmgAdd + ' dmg');
    if (f.blockAdd) out.push((f.blockAdd > 0 ? '+' : '') + f.blockAdd + ' Block');
    if (f.startBlock) out.push(f.startBlock + ' Block/turn');
    if (f.thorns) out.push(statusLabel('thorns') + ' ' + f.thorns);
    if (f.regen) out.push(statusLabel('regen') + ' ' + f.regen);
    if (f.drawAdd) out.push('+' + f.drawAdd + ' draw');
    return out.join(', ') || 'no bonus';
  }

  // barks (DESIGN 5.9 item 9): at most one per 6 s, 35% per eligible event, drawn with U.rng(U.hash(seed, 'bark', eventIndex))
  function pickBark(seed, evIndex, key, heroId, nowT, lastT) {
    const lore = DATA.lore && DATA.lore['barks_' + heroId];
    const lines = lore && lore.lines && lore.lines[key];
    if (!lines || !lines.length) return null;
    if (lastT !== null && lastT !== undefined && nowT - lastT < BARK_GAP_MS) return null;
    const r = U.rng(U.hash(seed, 'bark', evIndex));
    if (!(r() < BARK_CHANCE)) return null;
    return { hero: heroId, key, text: lines[r.int(0, lines.length - 1)] };
  }

  function statusLabel(id) { return DATA.statuses[id] ? DATA.statuses[id].name : String(id); }

  // one line per event that matters to a listener; a batch joins them ("Kappa uses Mud Slap. Kappa hits Hanae for 5.")
  function describe(vm, e) {
    const nm = (ref) => { const u = unitOf(vm, ref); return u ? u.name : ref && ref.id ? ref.id : 'Someone'; };
    switch (e.type) {
      case 'turn_start': return e.who === 'player' ? 'Turn ' + e.turn + '. Your move.' : 'Enemy turn.';
      case 'play': return heroName(e.hero) + ' plays ' + ((cardDef(e.card.id) && cardDef(e.card.id).name) || e.card.id) + (e.card.up ? ' plus' : '') + '.';
      case 'enemy_act': return (enemyOf(vm, e.enemy) ? enemyOf(vm, e.enemy).name : 'An enemy') + ' uses ' + e.name + '.';
      case 'skip': return nm(e.unit) + ' is starstruck and loses its action.';
      case 'hit': {
        if (e.amount <= 0 && e.blocked <= 0) return '';
        const who = e.src ? nm(e.src) : 'Something';
        return who + ' hits ' + nm(e.dst) + ' for ' + e.amount + (e.blocked ? ', ' + e.blocked + ' blocked' : '') + (e.killed ? ', a finishing blow' : '') + '.';
      }
      case 'dodge': return nm(e.dst) + ' dodges.';
      case 'death': return nm(e.unit) + ' is defeated.';
      case 'flee': return nm(e.unit) + ' flees.';
      case 'hero_down': return heroName(e.hero) + ' is voiceless.';
      case 'hero_revive': return heroName(e.hero) + ' finds their voice again with ' + e.hp + ' HP.';
      case 'heal': return e.amount > 0 ? nm(e.dst) + ' heals ' + e.amount + '.' : '';
      case 'swap': return heroName(e.front) + ' takes the lead, ' + heroName(e.back) + ' moves to backing.';
      case 'summon': return e.enemy.name + ' joins the fight.';
      case 'enemy_phase': return (enemyOf(vm, e.enemy) ? enemyOf(vm, e.enemy).name : 'The enemy') + ' changes form.';
      case 'status': {
        const u = unitOf(vm, e.dst);
        if (!u || e.delta <= 0 || u.kind !== 'hero' || !DATA.isDebuff(e.s)) return '';
        return u.name + ' gains ' + statusLabel(e.s) + ' ' + e.value + '.';
      }
      case 'pick_needed': return 'Choose cards.';
      case 'end': return e.result === 'win' ? 'Victory.' : 'Defeat.';
      default: return '';
    }
  }

  // the C.canPlay reason as a sentence ("<Hero> is down", "<Hero> is stunned"); ctx.hero names the owner of the card
  function reasonText(reason, heroId) {
    if (reason === 'down') return heroName(heroId) + ' is voiceless';
    if (reason === 'stunned') return heroName(heroId) + ' is starstruck';
    return REASONS[reason] || 'You cannot do that now';
  }

  // ==================================================================================================================
  // FALLBACK STAGE. SCENE (js/scene.js) is written by another engineer against DESIGN 5.9. If it is missing or broken this small
  // stand-in keeps the fight playable and readable: it draws the chapter backdrop, the heroes and enemies at the LAYOUT positions in
  // their poses, damage numbers, target rings, the aim arrow and barks, and it keeps the same beat gates as the contract so the drain
  // loop behaves identically. It is deliberately plain: real VFX are SCENE's job. It only talks to ART through documented calls.
  // ==================================================================================================================
  function fallbackScene() {
    const L = { ground: 520, front: { x: 330, y: 520, s: 1 }, back: { x: 170, y: 508, s: 0.94 }, lanes: LANE_X.slice() };
    const st = { on: false, t: 0, speed: 1, chapter: 1, boss: false, heroes: {}, en: {}, hover: null, targets: [], aim: null, bark: null, banner: null, shake: null, flash: null, nums: [], timers: [], view: {} };
    const maxDur = (ms) => Math.max(0, ms);

    function gate(e) {
      switch (e.type) {
        case 'hit': return e.killed ? 200 : 120;
        case 'heal': case 'draw': case 'swap': case 'enemy_act': case 'summon': case 'death': case 'enemy_phase': case 'hero_down': case 'hero_revive': case 'turn_start': case 'end':
          return FALLBACK_GATES[e.type] || 0;
        default: return 0;
      }
    }
    function pose(u, name) { if (u) { u.pose = name; u.t0 = st.t; } }
    function heroPos(u) { return u.row === 'front' ? L.front : L.back; }
    function num(x, y, text, kind) { st.nums.push({ x, y, text: String(text), kind, t0: st.t }); if (st.nums.length > 40) st.nums.shift(); }

    const api = {
      fallback: true, LAYOUT: L, MAX_PARTICLES: 500,
      mount(o) {
        st.on = true; st.t = 0; st.chapter = (o && o.chapter) || 1; st.boss = !!(o && o.boss);
        st.heroes = {}; st.en = {}; st.nums = []; st.timers = []; st.view = {};
        const C = o && o.C;
        if (C) {
          C.heroes.forEach((h) => { st.heroes[h.id] = { id: h.id, row: h.row, down: h.down, x: (h.row === 'front' ? L.front : L.back).x, pose: 'idle', t0: 0 }; });
          C.enemies.forEach((u) => { st.en[u.id] = { id: u.id, def: u.def, lane: u.lane, hp: u.hp, maxHp: u.maxHp, down: u.down, phase: u.phase, tier: u.tier, pose: 'idle', t0: 0 }; });
        }
      },
      unmount() { api.flush(); st.on = false; st.timers = []; },
      update(dt) {
        st.t += dt;
        const k = dt * 1000 * st.speed;
        const due = [];
        st.timers.forEach((tm) => { tm.left -= k; if (tm.left <= 0) due.push(tm); });
        if (due.length) { st.timers = st.timers.filter((tm) => due.indexOf(tm) < 0); due.forEach((tm) => tm.res()); }
        Object.keys(st.heroes).forEach((id) => { const h = st.heroes[id]; const tx = heroPos(h).x; h.x += (tx - h.x) * Math.min(1, dt * 9); });
        if (st.bark && st.t > st.bark.until) st.bark = null;
        if (st.banner && st.t > st.banner.until) st.banner = null;
      },
      play(e) {
        if (!st.on) return Promise.resolve();
        const hu = (ref) => (ref && ref.kind === 'hero' ? st.heroes[ref.id] : null);
        const eu = (ref) => (ref && ref.kind === 'enemy' ? st.en[ref.id] : null);
        switch (e.type) {
          case 'play': { const h = st.heroes[e.hero]; pose(h, DATA.cards[e.card.id] && (DATA.cards[e.card.id].fx || []).some((o) => o.op === 'dmg') ? 'attack' : 'cast'); break; }
          case 'enemy_act': pose(st.en[e.enemy], 'attack'); break;
          case 'hit': {
            const a = api.anchor(e.dst.kind, e.dst.id);
            const d = hu(e.dst) || eu(e.dst);
            if (d) { if (e.amount > 0) pose(d, 'hurt'); if (d.maxHp !== undefined) d.hp = e.hp; }
            if (a) num(a.head.x, a.head.y - 10, e.amount > 0 ? e.amount : e.blocked > 0 ? 'Block' : '0', e.crit ? 'crit' : 'dmg');
            if (e.amount >= 12) api.shake(6, 200);
            break;
          }
          case 'block': { const a = api.anchor(e.dst.kind, e.dst.id); if (a) num(a.head.x, a.head.y, '+' + e.amount, 'block'); pose(hu(e.dst) || eu(e.dst), 'block'); break; }
          case 'heal': { const a = api.anchor(e.dst.kind, e.dst.id); if (a && e.amount > 0) num(a.head.x, a.head.y, '+' + e.amount, 'heal'); break; }
          case 'swap': Object.keys(st.heroes).forEach((id) => { st.heroes[id].row = id === e.front ? 'front' : 'back'; }); break;
          case 'death': { const u = eu(e.unit); if (u) { u.down = true; pose(u, 'die'); } break; }
          case 'flee': { const u = eu(e.unit); if (u) u.down = true; break; }
          case 'summon': st.en[e.enemy.id] = { id: e.enemy.id, def: e.enemy.def, lane: e.enemy.lane, hp: e.enemy.hp, maxHp: e.enemy.maxHp, down: false, phase: 0, tier: e.enemy.tier, pose: 'idle', t0: st.t }; break;
          case 'enemy_phase': { const u = st.en[e.enemy]; if (u) u.phase = e.index; api.flash('#ffffff', 160); break; }
          case 'hero_down': { const h = st.heroes[e.hero]; if (h) { h.down = true; pose(h, 'down'); } break; }
          case 'hero_revive': { const h = st.heroes[e.hero]; if (h) { h.down = false; pose(h, 'idle'); } break; }
          case 'end': if (e.result === 'win') Object.keys(st.heroes).forEach((id) => { if (!st.heroes[id].down) pose(st.heroes[id], 'cheer'); }); break;
          default: break;
        }
        const ms = maxDur(gate(e));
        if (ms <= 0 || headless()) return Promise.resolve();
        return new Promise((res) => { st.timers.push({ left: ms, res }); });
      },
      flush() { const t = st.timers; st.timers = []; t.forEach((tm) => tm.res()); st.nums = []; },
      speed(k) { st.speed = k > 0 ? k : 1; },
      setViewState(id, v) { st.view[id] = v; const u = st.en[id]; if (u && v) { u.hp = v.hp; } },
      setHover(kind, id) { st.hover = kind && id ? { kind, id } : null; },
      setTargetable(ids) { st.targets = (ids || []).slice(); },
      aim(from, to, id) { st.aim = from ? { from, to, id: id || null } : null; },
      bark(heroId, text) { st.bark = { hero: heroId, text: String(text), until: st.t + 1.8 }; },
      banner(text, kind) { st.banner = { text: String(text), kind, until: st.t + 1.4, from: st.t }; },
      shake(mag, ms) { st.shake = { mag, until: st.t + ms / 1000, from: st.t }; },
      flash(color, ms) { st.flash = { color, until: st.t + ms / 1000, from: st.t }; },
      hitstop() {},
      anchor(kind, id) {
        if (kind === 'hero') {
          const h = st.heroes[id];
          if (!h) return null;
          const pos = heroPos(h);
          const b = safe(() => ART.hero.bounds(id), null) || { w: 120, h: 250, head: { x: 0, y: -232 }, feet: { x: 0, y: 0 } };
          const w = b.w * pos.s, hh = b.h * pos.s, x = pos.x - w / 2;
          return { x, y: pos.y - hh, w, h: hh, top: { x: pos.x, y: pos.y - hh }, feet: { x: pos.x, y: pos.y }, head: { x: pos.x + (b.head ? b.head.x : 0) * pos.s, y: pos.y + (b.head ? b.head.y : -hh) * pos.s } };
        }
        const u = st.en[id];
        if (!u || u.lane === undefined || u.lane === null) return null;
        const fx = L.lanes[clamp(u.lane, 0, 4)];
        const d = DATA.enemies[u.def];
        const b = safe(() => ART.enemy.bounds(u.def), null) || { w: 120, h: (d && DATA.LISTS.sizeHeight[d.size]) || 170, head: { x: 0, y: -160 }, feet: { x: 0, y: 0 } };
        const w = b.w, hh = b.h;
        return { x: fx - w / 2, y: L.ground - hh, w, h: hh, top: { x: fx, y: L.ground - hh }, feet: { x: fx, y: L.ground }, head: { x: fx + (b.head ? b.head.x : 0), y: L.ground + (b.head ? b.head.y : -hh) } };
      },
      hitTest(x, y) {
        const ids = Object.keys(st.en).filter((id) => !st.en[id].down).sort((a, b) => st.en[b].lane - st.en[a].lane);
        for (let i = 0; i < ids.length; i++) {
          const a = api.anchor('enemy', ids[i]);
          if (!a) continue;
          const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
          if ((x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) || (Math.abs(x - cx) <= 48 && Math.abs(y - cy) <= 48)) return { kind: 'enemy', id: ids[i] };
        }
        const hs = Object.keys(st.heroes).filter((id) => !st.heroes[id].down);
        for (let i = 0; i < hs.length; i++) {
          const a = api.anchor('hero', hs[i]);
          if (a && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return { kind: 'hero', id: hs[i] };
        }
        return null;
      },
      draw(ctx, t) {
        const chapter = clamp(st.chapter || 1, 1, 3);
        const sceneId = (st.boss ? 'boss' : 'ch') + chapter;
        ctx.save();
        if (st.shake && st.t < st.shake.until) { const k = (st.shake.until - st.t) * 6; ctx.translate(Math.sin(st.t * 90) * st.shake.mag * k, Math.cos(st.t * 77) * st.shake.mag * k * 0.6); }
        let drawn = false;
        if (typeof ART !== 'undefined' && ART.scene && isFn(ART.scene, 'draw')) { try { ART.scene.draw(ctx, sceneId, W, H, t, {}); drawn = true; } catch (e) { warnOnce('scene', 'ART.scene.draw threw', e); } }
        if (!drawn) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1d5a'); g.addColorStop(1, '#0d0b1e'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(245,201,106,0.18)'; ctx.fillRect(0, L.ground, W, H - L.ground); }
        // rings under targetable feet
        st.targets.forEach((id) => {
          const a = api.anchor('enemy', id);
          if (!a) return;
          const hot = st.hover && st.hover.id === id;
          ctx.save(); ctx.strokeStyle = hot ? '#ffe9a8' : 'rgba(245,201,106,0.7)'; ctx.lineWidth = hot ? 4 : 2.5; ctx.beginPath();
          ctx.ellipse(a.feet.x, a.feet.y + 4, Math.max(40, a.w * 0.36) + (hot ? 8 : 0), 13 + (hot ? 2 : 0), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        });
        Object.keys(st.en).map((id) => st.en[id]).sort((a, b) => a.lane - b.lane).forEach((u) => {
          if (u.down && (st.t - u.t0) > 0.9) return;
          const a = api.anchor('enemy', u.id);
          if (!a) return;
          const pt = st.t - u.t0;
          const ms = isFn(ART.enemy, 'poseMs') ? safe(() => ART.enemy.poseMs(u.pose), 0) : 0;
          const pn = ms && pt * 1000 > ms && u.pose !== 'die' && u.pose !== 'telegraph' ? 'idle' : u.pose;
          safe(() => ART.enemy.draw(ctx, u.def, { x: a.feet.x, y: a.feet.y, s: 1, pose: pn, t, pt: pn === u.pose ? pt : 0, hpPct: u.maxHp ? u.hp / u.maxHp : 1, phase: u.phase || 0, alpha: u.down ? Math.max(0, 1 - pt / 0.8) : 1 }));
        });
        Object.keys(st.heroes).map((id) => st.heroes[id]).sort((a, b) => (a.row === 'front' ? 1 : 0) - (b.row === 'front' ? 1 : 0)).forEach((h) => {
          const pos = heroPos(h);
          const pt = st.t - h.t0;
          const ms = isFn(ART.hero, 'poseMs') ? safe(() => ART.hero.poseMs(h.pose), 0) : 0;
          const pn = ms && pt * 1000 > ms && h.pose !== 'down' && h.pose !== 'cheer' ? 'idle' : h.pose;
          safe(() => ART.hero.draw(ctx, h.id, { x: h.x, y: pos.y, s: pos.s, pose: pn, t, pt: pn === h.pose ? pt : 0 }));
        });
        ctx.restore();
        // damage numbers
        st.nums = st.nums.filter((n) => st.t - n.t0 < 1);
        st.nums.forEach((n) => {
          const p = (st.t - n.t0), y = n.y - 60 * p;
          ctx.save(); ctx.globalAlpha = clamp(1.4 - p * 1.2, 0, 1); ctx.textAlign = 'center'; ctx.font = '900 ' + (n.kind === 'crit' ? 40 : 30) + 'px "Trebuchet MS", system-ui, sans-serif';
          ctx.lineWidth = 6; ctx.strokeStyle = '#140f2e'; ctx.fillStyle = n.kind === 'heal' ? '#8dffc2' : n.kind === 'block' ? '#9fd6ff' : n.kind === 'crit' ? '#ffe45e' : '#fff8f0';
          ctx.strokeText(n.text, n.x, y); ctx.fillText(n.text, n.x, y); ctx.restore();
        });
        // aim arrow
        if (st.aim) {
          const a = st.aim;
          ctx.save(); ctx.strokeStyle = a.id ? '#ff8f80' : '#ffe9a8'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 6; ctx.setLineDash([14, 9]); ctx.lineCap = 'round';
          const mx = (a.from.x + a.to.x) / 2, my = Math.min(a.from.y, a.to.y) - 90;
          ctx.beginPath(); ctx.moveTo(a.from.x, a.from.y); ctx.quadraticCurveTo(mx, my, a.to.x, a.to.y); ctx.stroke(); ctx.setLineDash([]);
          const ang = Math.atan2(a.to.y - my, a.to.x - mx);
          ctx.beginPath(); ctx.moveTo(a.to.x, a.to.y); ctx.lineTo(a.to.x - 26 * Math.cos(ang - 0.45), a.to.y - 26 * Math.sin(ang - 0.45)); ctx.lineTo(a.to.x - 26 * Math.cos(ang + 0.45), a.to.y - 26 * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill(); ctx.restore();
        }
        if (st.bark) {
          const a = api.anchor('hero', st.bark.hero);
          if (a) {
            ctx.save(); ctx.font = '700 17px Georgia, serif'; const w = Math.min(300, ctx.measureText(st.bark.text).width + 28);
            const bx = clamp(a.top.x - w / 2, 8, W - w - 8), by = a.top.y - 46;
            ctx.fillStyle = '#fff6e0'; ctx.strokeStyle = '#140f2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.rect(bx, by, w, 38); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#140f2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st.bark.text.slice(0, 40), bx + w / 2, by + 20); ctx.restore();
          }
        }
        if (st.banner) {
          const p = clamp((st.t - st.banner.from) / 1.4, 0, 1), al = Math.sin(Math.PI * p);
          ctx.save(); ctx.globalAlpha = clamp(al * 1.6, 0, 1); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 64px Georgia, serif'; ctx.lineWidth = 9; ctx.strokeStyle = '#140f2e'; ctx.fillStyle = '#ffe9a8';
          ctx.strokeText(st.banner.text, W / 2, 250); ctx.fillText(st.banner.text, W / 2, 250); ctx.restore();
        }
        if (st.flash && st.t < st.flash.until) { ctx.save(); ctx.globalAlpha = clamp((st.flash.until - st.t) / ((st.flash.until - st.flash.from) || 1), 0, 1) * 0.5; ctx.fillStyle = st.flash.color; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      },
    };
    return api;
  }

  const realScene = () => (typeof SCENE !== 'undefined' && SCENE && isFn(SCENE, 'mount') && isFn(SCENE, 'play') ? SCENE : null);

  // ==================================================================================================================
  // per-fight state. S is null whenever the screen is not mounted; every async continuation checks S.live() first.
  // ==================================================================================================================
  let S = null;

  const tut = (el, name) => { el.setAttribute('data-tut', name); return el; };
  const ico = (kind, id, size, opts, cls) => UI.icon(kind, id, size, opts || {}, cls);
  const svg = (inner, vb, size) => '<svg viewBox="' + (vb || '0 0 32 32') + '" width="' + size + '" height="' + size + '" aria-hidden="true">' + inner + '</svg>';
  const GLYPH = {
    swap: svg('<path d="M5 12h18l-5-6M27 20H9l5 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 32 32', 28),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/>', '0 0 24 24', 16),
    speed: svg('<path d="M5 6l9 10-9 10zM17 6l9 10-9 10z" fill="currentColor"/>', '0 0 32 32', 18),
  };

  // restart a CSS animation class on an element (UI.pulse and UI.shake cover only two of them)
  function flare(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    UI.after(ms || 500, () => el.classList.remove(cls));
  }

  // ==================================================================================================================
  // bars, block chips, status rows
  // ==================================================================================================================
  function makeBar(cls) {
    const lag = mk('i', { class: 'lag' }), fill = mk('i', { class: 'fill' }), txt = mk('em', { class: 'txt' });
    const el = mk('div', { class: 'cm-bar ' + (cls || ''), role: 'progressbar', 'aria-valuemin': '0' }, lag, fill, txt);
    return { el, lag, fill, txt, pct: undefined, hp: undefined };
  }

  // the fill jumps, the ink-splash lag trails behind on damage (CSS delay) and follows at once on healing
  function setBar(b, hp, max, animate) {
    const pct = max > 0 ? clamp((hp / max) * 100, 0, 100) : 0;
    const prev = b.pct;
    const healing = prev === undefined || pct >= prev || !animate || UI.opt.reduceMotion;
    if (healing) b.lag.classList.add('snap');
    b.fill.style.width = pct + '%';
    b.lag.style.width = pct + '%';
    if (healing) { void b.lag.offsetWidth; b.lag.classList.remove('snap'); }
    else if (prev !== undefined && pct < prev) flare(b.el, 'hit', 420);
    b.pct = pct;
    if (b.hp !== hp) b.txt.textContent = hp + '/' + max;
    b.hp = hp;
    b.el.setAttribute('aria-valuenow', String(hp)); b.el.setAttribute('aria-valuemax', String(max));
    b.el.classList.toggle('low', hp > 0 && max > 0 && hp / max < 0.3);
  }

  function makeBlock() {
    const n = mk('b', { class: 'n' });
    const el = mk('span', { class: 'cm-blk', role: 'img', hidden: true }, ico('stat', 'block', 22, {}, 'blk-ico'), n);
    return { el, n, v: 0 };
  }
  function setBlock(b, v, animate) {
    v = Math.max(0, v | 0);
    if (v === b.v) return;
    const up = v > b.v;
    b.v = v;
    b.n.textContent = String(v);
    b.el.hidden = v <= 0;
    b.el.setAttribute('aria-label', 'Block ' + v);
    if (animate) flare(b.el, up ? 'gain' : 'lose', 460);
  }

  const kindRank = (s) => KIND_ORDER[DATA.statuses[s] ? DATA.statuses[s].kind : 'buff'] || 0;
  const statusList = (st) => Object.keys(st).filter((k) => DATA.statuses[k] && st[k]).sort((a, b) => kindRank(a) - kindRank(b) || (DATA.statuses[a].name < DATA.statuses[b].name ? -1 : 1));

  function makeStatusRow(size, cls) {
    return { el: mk('div', { class: 'cm-st ' + (cls || ''), role: 'list' }), chips: {}, more: null, size, hidden: [], st: {} };
  }
  function moreTip(row) {
    const body = mk('div', { class: 'tk' }, mk('div', { class: 'tk-head' }, mk('b', { class: 'tk-name', text: 'More effects' })));
    row.hidden.forEach((k) => body.appendChild(mk('p', { class: 'tk-text', text: statusLabel(k) + ' ' + row.st[k] + ': ' + DATA.statuses[k].text })));
    return body;
  }
  const isCompact = () => !!(S && S.ui && safe(() => S.ui.root.closest('#stage.compact'), null));
  // how many chips an enemy's row may show: all of them up to the cap, else cap - 1 and a +N chip
  const enemyChips = (u, compact) => (compact ? ENEMY_CHIPS.compact : ENEMY_CHIPS.desk) - (u && u.lane >= 4 ? 1 : 0);
  // the widest a row can get with that cap (k chips and a +N chip, or a full row), in css px: the suite checks it against LANE_GAP
  function widestRow(cap, compact) {
    const m = ROW_CHIP[compact ? 'compact' : 'desk'];
    const full = cap * m.d + (cap - 1) * m.gap, more = (cap - 1) * m.d + m.more + (cap - 1) * m.gap;
    return Math.max(full, more);
  }
  function setStatuses(row, st, max, animate) {
    row.st = st;
    const all = statusList(st);
    const shown = all.length > max ? all.slice(0, max - 1) : all;
    row.hidden = all.slice(shown.length);
    Object.keys(row.chips).forEach((k) => { if (shown.indexOf(k) < 0) { row.chips[k].el.remove(); delete row.chips[k]; } });
    shown.forEach((k, i) => {
      let c = row.chips[k];
      const n = st[k];
      if (!c) {
        c = row.chips[k] = { el: UI.status(k, n, { size: row.size, focusable: false, side: 'bottom' }), n };
        c.el.setAttribute('role', 'listitem');
        if (animate) c.el.classList.add('fresh');
        UI.after(420, () => c.el.classList.remove('fresh'));
      } else if (c.n !== n) {
        c.el.rbSet(n); c.n = n;
        if (animate) UI.pulse(c.el);
      }
      if (row.el.children[i] !== c.el) row.el.insertBefore(c.el, row.el.children[i] || null);
    });
    if (row.hidden.length) {
      if (!row.more) {
        row.more = mk('span', { class: 'cm-more', role: 'listitem', tabindex: '-1' });
        UI.tip.attach(row.more, () => moreTip(row), { side: 'bottom' });
      }
      row.more.textContent = '+' + row.hidden.length;
      row.more.setAttribute('aria-label', row.hidden.length + ' more effects');
      row.el.appendChild(row.more);
    } else if (row.more) { row.more.remove(); row.more = null; }
    row.el.hidden = all.length === 0;
  }

  // ==================================================================================================================
  // hero panels (x 12..300, y 64..250), the swap seal between them
  // ==================================================================================================================
  function heroTip(id) {
    const def = DATA.heroes[id];
    const u = heroOf(S.vm, id);
    const body = mk('div', { class: 'tk' }, mk('div', { class: 'tk-head' }, mk('b', { class: 'tk-name', text: def.name }), mk('span', { class: 'tk-kind k-keyword', text: def.title })));
    if (u) body.appendChild(mk('p', { class: 'tk-text', text: u.down ? 'Voiceless. Their cards clog your hand until the fight is won.' : 'HP ' + u.hp + '/' + u.maxHp + (u.block ? ', Block ' + u.block : '') }));
    ['front', 'back'].forEach((row) => body.appendChild(mk('p', { class: 'tk-text' + (u && u.row === row ? ' now' : ''), text: DATA.rowText(id, row) })));
    (def.passives || []).forEach((p) => body.appendChild(mk('p', { class: 'tk-text', text: p.name + ': ' + safe(() => DATA.hookText(p), '') })));
    if (u) statusList(u.st).forEach((k) => body.appendChild(mk('p', { class: 'tk-text', text: statusLabel(k) + ' ' + u.st[k] + ': ' + DATA.statuses[k].text })));
    return body;
  }

  function buildHero(u, i) {
    const def = DATA.heroes[u.id];
    const bar = makeBar('hero-bar'), blk = makeBlock(), st = makeStatusRow('sm', 'hero-st');
    const tagRow = mk('i', { class: 'ct-row', text: 'LEAD' }), tagBonus = mk('em', { class: 'ct-bonus' });
    const pv = mk('span', { class: 'cm-hpv', hidden: true });
    const el = mk('div', { class: 'cm-hero h-' + u.id, tabindex: '0', role: 'group', 'data-hero': u.id },
      mk('span', { class: 'ch-medal' }, UI.medallion(u.id, 62)),
      mk('div', { class: 'ch-main' },
        mk('div', { class: 'ch-l1' }, mk('b', { class: 'ch-name', text: def.name }), mk('span', { class: 'ch-tag' }, tagRow, tagBonus)),
        mk('div', { class: 'ch-l2' }, bar.el, blk.el),
        st.el),
      pv, mk('span', { class: 'ch-fallen', 'aria-hidden': 'true', text: 'VOICELESS' }));
    UI.vars(el, { '--hc': def.color, '--hc2': def.dark, '--i': i });      // --i places the panel (css: 64 + i * (--hh + 2)), so a phone can make them taller
    UI.tip.attach(el, () => (S ? heroTip(u.id) : null), { side: 'right' });       // S is null once the screen is left, but a long press can still land on a badge that has not been removed yet
    return { id: u.id, el, bar, blk, st, tagRow, tagBonus, pv, row: null, down: null };
  }

  function renderHero(u, animate) {
    const p = S.hp[u.id];
    if (!p) return;
    setBar(p.bar, u.hp, u.maxHp, animate);
    setBlock(p.blk, u.block, animate);
    setStatuses(p.st, u.st, HERO_CHIPS, animate);
    p.el.classList.toggle('down', u.down);
    p.el.classList.toggle('front', u.row === 'front');
    p.el.classList.toggle('back', u.row === 'back');
    if (p.row !== u.row) {
      p.row = u.row;
      p.tagRow.textContent = u.row === 'front' ? 'LEAD' : 'BACKING';
      p.tagBonus.textContent = rowBrief(u.id, u.row, S.C.relics);
      if (animate) flare(p.el.querySelector('.ch-tag'), 'pulse', 500);
    }
    if (p.down !== u.down) {
      p.down = u.down;
      if (u.down && animate) flare(p.el, 'shatter', 700);
    }
    const stTxt = statusList(u.st).map((k) => statusLabel(k) + ' ' + u.st[k]).join(', ');
    p.el.setAttribute('aria-label', DATA.heroes[u.id].name + ', ' + (u.row === 'front' ? 'the lead' : 'backing') + ', ' + (u.down ? 'voiceless' : u.hp + ' of ' + u.maxHp + ' health') + (u.block ? ', Block ' + u.block : '') + (stTxt ? '. ' + stTxt : ''));
  }

  function buildSwap() {
    const cost = mk('em', { class: 'sw-cost', text: 'FREE' });
    const el = mk('button', { type: 'button', class: 'cm-swap', 'aria-label': 'Swap spots', 'data-sfx': 'swap' },
      mk('span', { class: 'sw-ring', 'aria-hidden': 'true' }), mk('span', { class: 'sw-glyph', html: GLYPH.swap }),
      mk('span', { class: 'sw-lock', html: GLYPH.lock, 'aria-hidden': 'true' }), cost, mk('kbd', { class: 'btn-key', text: 'S', 'aria-hidden': 'true' }));
    tut(el, 'swap');
    el.addEventListener('click', () => swapClicked());
    UI.tip.attach(el, () => {
      const cs = S && S.C ? S.C.canSwap() : null;
      const t = DATA.keywords.swap;
      return UI.el('div', { class: 'tk' }, UI.el('div', { class: 'tk-head' }, UI.el('b', { class: 'tk-name', text: 'Swap spots' })), UI.el('p', { class: 'tk-text', text: t.text }),
        cs && !cs.ok && cs.reason === 'bind' ? UI.el('p', { class: 'tk-text', text: 'Tangled: neither hero can swap while a hero is Tangled.' }) : null);
    }, { side: 'right' });
    return { el, cost };
  }

  // one look at C.canSwap() after each drained batch
  function renderSwap() {
    const s = S.ui.swap, C = S.C;
    const cs = C.canSwap();
    const busy = S.draining || S.ended || S.picking;
    const free = cs.cost === 0;
    s.cost.textContent = free ? 'FREE' : cs.cost + ' Breath';
    s.el.classList.toggle('free', free && cs.ok);
    s.el.classList.toggle('bound', cs.reason === 'bind');
    let reason = '';
    if (cs.reason === 'bind') reason = 'Tangled: the heroes cannot swap spots';
    else if (cs.reason === 'solo') reason = 'Only one hero is standing';
    else if (cs.reason === 'energy') reason = 'Not enough Breath to swap';
    else if (cs.reason === 'phase') reason = 'Wait for your turn';
    else if (cs.reason === 'pending') reason = 'Finish your choice first';
    // "disabled" is for a reason the player can read (Bind, one hero standing, no Energy, not your turn, a pending pick): UI.setDisabled, which the
    // tutorial also reads to decide whether a swap hint teaches a move that exists. A beat that is merely animating dims the seal (class busy) and a tap
    // on it fast-forwards (swapClicked), but it is not a refusal, so a hint raised at the start of the turn is not dropped while the cards are still dealt.
    UI.setDisabled(s.el, !cs.ok, reason || 'Wait a moment');
    s.el.classList.toggle('busy', busy && cs.ok);
    s.el.setAttribute('aria-label', 'Swap spots, ' + (free ? 'free' : 'costs ' + cs.cost + ' Breath') + (cs.reason === 'bind' ? ', tangled' : ''));
    s.el.hidden = C.heroes.length < 2;
  }

  // ==================================================================================================================
  // enemy overlays: intent bubble above the head, HP bar under the feet, status row, a focusable hit area over the body
  // ==================================================================================================================
  const INTENT_ICON = { attack: 'attack', multi: 'multi', heavy: 'heavy', defend: 'defend', buff: 'buff', debuff: 'debuff', summon: 'summon', heal: 'heal', special: 'special', flee: 'flee', none: 'none' };

  function intentNumber(it) {
    if (!it || it.stunned) return '';
    if (it.dmg !== null && it.dmg !== undefined && (it.kind === 'attack' || it.kind === 'multi' || it.kind === 'heavy' || it.kind === 'special' || it.hits > 0)) return it.hits > 1 ? it.dmg + 'x' + it.hits : String(it.dmg);
    if (it.kind === 'defend' && it.block) return String(it.block);
    if (it.kind === 'heal' && it.heal) return String(it.heal);
    return '';
  }

  function targetNames(it) {
    if (!it || it.tgt === null || it.tgt === undefined || it.dmg === null) return '';
    if (it.tgt === 'random') return 'a random hero';
    return it.tgt.map(heroName).join(' and ');
  }

  function intentTip(u) {
    const it = u.intent;
    const d = DATA.enemies[u.def] || {};
    const head = mk('div', { class: 'tk-head' }, mk('b', { class: 'tk-name', text: u.name }), mk('span', { class: 'tk-kind k-keyword', text: TIER_NAME[u.tier || 'normal'] || cap(u.tier || 'normal') }));
    const body = mk('div', { class: 'tk' }, head);
    if (!it) { body.appendChild(mk('p', { class: 'tk-text', text: 'It is not planning anything yet.' })); return body; }
    if (it.stunned) {
      body.appendChild(mk('p', { class: 'tk-text', text: 'Starstruck: it loses its next action.' }));
      return body;
    }
    body.appendChild(mk('p', { class: 'tk-text tk-move', text: (it.name || 'Move') + ' (' + (INTENT_LABEL[it.kind] || cap(it.kind)) + ')' }));
    const txt = safe(() => DATA.intentText(it), it.text || '');
    if (txt) body.appendChild(mk('p', { class: 'tk-text', text: txt + (txt.slice(-1) === '.' ? '' : '.') }));
    if (it.taunted) body.appendChild(mk('p', { class: 'tk-text', text: 'A Spotlight is pulling this attack.' }));
    (it.statuses || []).forEach((s) => { if (DATA.statuses[s.s]) body.appendChild(mk('p', { class: 'tk-text', text: statusLabel(s.s) + ': ' + DATA.statuses[s.s].text })); });
    if (d.lore && u.tier !== 'minion') body.appendChild(mk('p', { class: 'tk-text tk-lore', text: d.lore }));
    return body;
  }

  // The HP bar width of every living enemy. A bar is centred on its lane, a neighbour's is LANE_X[b] - LANE_X[a] away, so two bars may add up to at most
  // 2 * (that distance - BAR_CLEAR). Where the sizes do not fit (an xl boss beside a summoned minion in lane 3: 212 + 104 wide, 125 apart; two large foes in lanes 3
  // and 4) the WIDER bar gives way first, down to the narrower one's width, and then both equally. One pass from left to right is enough: shrinking never
  // makes a pair that already fits overlap. Pure, exported for the suite as _t.barWidths.
  function barWidths(units, compact) {
    const base = compact ? BAR_W_COMPACT : BAR_W;
    const live = units.filter((u) => u && !u.down && !u.fled && isNum(u.lane)).sort((a, b) => a.lane - b.lane);
    const w = {};
    live.forEach((u) => { w[u.id] = base[u.size] || base.m; });
    for (let i = 0; i + 1 < live.length; i++) {
      const a = live[i], b = live[i + 1];
      const over = w[a.id] + w[b.id] - 2 * (LANE_X[b.lane] - LANE_X[a.lane] - BAR_CLEAR);
      if (over <= 0) continue;
      const hi = w[a.id] >= w[b.id] ? a : b, lo = hi === a ? b : a;
      const first = Math.min(over, w[hi.id] - w[lo.id]);
      w[hi.id] -= first;
      if (over > first) { w[a.id] -= (over - first) / 2; w[b.id] -= (over - first) / 2; }
    }
    return w;
  }

  function buildEnemy(u) {
    const size = u.size || 'm';
    const bar = makeBar('en-bar tier-' + u.tier), blk = makeBlock(), st = makeStatusRow('xs', 'en-st');
    const wrap = mk('div', { class: 'cm-ebarwrap sz-' + size, style: { width: (BAR_W[size] || BAR_W.m) + 'px' } }, bar.el, blk.el);
    const bubble = mk('div', { class: 'cm-int', role: 'img', hidden: true });
    tut(bubble, 'intent');
    const stars = mk('i', { class: 'cm-stun', 'aria-hidden': 'true', hidden: true });
    const pv = mk('div', { class: 'cm-pv', hidden: true, 'aria-hidden': 'true' });
    const say = mk('div', { class: 'cm-say', hidden: true, role: 'status' });
    const hit = mk('button', { type: 'button', class: 'hit cm-ehit', 'data-sfx': 'none' });
    tut(hit, 'enemy');
    const el = mk('div', { class: 'cm-en tier-' + u.tier + ' sz-' + size, 'data-enemy': u.id }, bubble, stars, wrap, st.el, pv, say, hit);
    const en = { id: u.id, el, bubble, stars, wrap, bar, blk, st, pv, say, hit, isig: '', pos: {}, bh: 46 };
    hit.addEventListener('click', () => enemyClicked(u.id));
    hit.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; setHover(u.id); });
    hit.addEventListener('pointerleave', () => setHover(null));
    // the explanation opens ABOVE the intent bubble (never on top of it): a custom hover, because UI.tip.attach anchors on the element it is given
    const showTip = () => {
      if (!S || S.sel || S.drag || S.picking || S.draining) return;
      const cur = enemyOf(S.vm, u.id);
      if (!cur || cur.down) return;
      UI.tip.showFor(bubble.hidden ? hit : bubble, intentTip(cur), { side: 'top' });
      S.enemyTip = u.id;
    };
    const hideTip = () => { if (S && S.enemyTip === u.id) { S.enemyTip = null; S.enemyTipToken = (S.enemyTipToken || 0) + 1; UI.tip.hide(); } };
    hit.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen' || !S) return;
      const my = S.enemyTipToken = (S.enemyTipToken || 0) + 1;
      UI.after(260, () => { if (S && S.enemyTipToken === my) showTip(); });
    });
    hit.addEventListener('pointerleave', () => { if (S) S.enemyTipToken = (S.enemyTipToken || 0) + 1; hideTip(); });
    hit.addEventListener('focus', () => { if (S && S.sel && S.sel.targets.indexOf(u.id) >= 0) setHover(u.id); else if (safe(() => hit.matches(':focus-visible'), false)) showTip(); });
    hit.addEventListener('blur', hideTip);
    UI.tip.attach(bubble, () => { const cur = S ? enemyOf(S.vm, u.id) : null; return cur && !cur.down ? intentTip(cur) : null; }, { side: 'top' });
    return en;
  }

  // the bubble: kind icon and number, then the extras (statuses it applies, summons, cards it adds, gold it steals) and who it targets
  function renderIntent(en, u) {
    const it = u.intent;
    const b = en.bubble;
    const off = u.down || !it;
    b.hidden = !!off;
    if (off) { en.isig = ''; return; }
    const stunned = !!it.stunned || (u.st.stun || 0) > 0;
    const sig = JSON.stringify([it.kind, it.dmg, it.hits, it.tgt, it.block, it.heal, it.statuses, it.summons, it.adds, it.steals, it.swap, it.flee, it.name, stunned]);
    if (sig === en.isig) return;
    en.isig = sig;
    b.textContent = '';
    b.className = 'cm-int k-' + (stunned ? 'stun' : it.kind) + (stunned ? ' stunned' : '') + (it.kind === 'heavy' ? ' heavy' : '');
    const num = stunned ? '' : intentNumber(it);
    const main = mk('div', { class: 'ib-main' }, ico(stunned ? 'status' : 'intent', stunned ? 'stun' : (INTENT_ICON[it.kind] || 'special'), 34, {}, 'ib-ico'));
    if (stunned) main.appendChild(mk('b', { class: 'ib-num ib-word', text: 'WOW' }));
    else if (num) main.appendChild(mk('b', { class: 'ib-num' + (it.hits > 1 ? ' multi' : ''), text: num }));
    else main.appendChild(mk('b', { class: 'ib-num ib-word', text: INTENT_LABEL[it.kind] || '' }));
    b.appendChild(main);
    if (!stunned) {
      const extras = mk('div', { class: 'ib-x' });
      (it.statuses || []).forEach((s) => {
        if (!DATA.statuses[s.s]) return;
        const c = UI.status(s.s, s.n, { size: 'xs', focusable: false, tip: false, class: 'ib-st to-' + (s.to === 'self' || s.to === 'allEnemies' || s.to === 'otherEnemy' || s.to === 'lowestEnemy' ? 'self' : 'hero') });
        extras.appendChild(c);
      });
      (it.summons || []).forEach((s) => extras.appendChild(mk('span', { class: 'ib-chip' }, ico('intent', 'summon', 22, {}), mk('b', { text: '+' + (s.n || 1) }))));
      if (it.heal && it.kind !== 'heal') extras.appendChild(mk('span', { class: 'ib-chip' }, ico('intent', 'heal', 22, {}), mk('b', { text: String(it.heal) })));
      if (it.block && it.kind !== 'defend') extras.appendChild(mk('span', { class: 'ib-chip' }, ico('stat', 'block', 22, {}), mk('b', { text: String(it.block) })));
      const addN = (it.adds || []).reduce((s, a) => s + (a.n || 0), 0);
      if (addN) extras.appendChild(mk('span', { class: 'ib-chip ib-junk', 'aria-label': 'adds ' + addN + ' cards' }, mk('i', { class: 'ib-card' }), mk('b', { text: '+' + addN })));
      if (it.steals) extras.appendChild(mk('span', { class: 'ib-chip' }, ico('stat', 'gold', 22, {}), mk('b', { text: String(it.steals) })));
      if (extras.children.length) b.appendChild(extras);
      if (Array.isArray(it.tgt) && it.tgt.length && it.dmg !== null) {
        const tg = mk('div', { class: 'ib-tgt', 'aria-hidden': 'true' });
        it.tgt.forEach((id) => tg.appendChild(UI.medallion(id, 20)));
        b.appendChild(tg);
      } else if (it.tgt === 'random' && it.dmg !== null) b.appendChild(mk('div', { class: 'ib-tgt ib-rand', 'aria-hidden': 'true', text: '?' }));
    }
    b.setAttribute('aria-label', (u.name) + ' intends: ' + (stunned ? 'starstruck' : safe(() => DATA.intentText(it), it.text || it.name || '')));
    en.bh = 0;                                   // measured again on the next placement
  }

  function renderEnemy(u, animate) {
    const en = S.en[u.id];
    if (!en) return;
    setBar(en.bar, u.hp, u.maxHp, animate);
    setBlock(en.blk, u.block, animate);
    en.wrap.classList.toggle('has-blk', u.block > 0);            // the HP text then centres on the part of the bar the Block chip leaves free
    setStatuses(en.st, u.st, enemyChips(u, isCompact()), animate);
    en.el.classList.toggle('dead', u.down);
    en.el.classList.toggle('stunned', (u.st.stun || 0) > 0);
    en.stars.hidden = (u.st.stun || 0) <= 0 || u.down;
    en.hit.disabled = !!u.down;
    en.hit.tabIndex = u.down ? -1 : 0;
    const stTxt = statusList(u.st).map((k) => statusLabel(k) + ' ' + u.st[k]).join(', ');
    en.hit.setAttribute('aria-label', u.name + ', ' + u.hp + ' of ' + u.maxHp + ' health' + (u.block ? ', Block ' + u.block : '') + (stTxt ? '. ' + stTxt : '') + (u.intent && !u.down ? '. Intends: ' + (u.intent.stunned ? 'starstruck' : safe(() => DATA.intentText(u.intent), u.intent.text || '')) : ''));
    renderIntent(en, u);
  }

  // The top right buttons (speed, then menu) are max(72, --hit) and max(56, --hit) wide and at most as tall: --hit is 44 SCREEN px, so on a phone they are 80 to 90
  // stage px square and hang below the 56 px bar. Returns where they start (left) and where the lowest ends plus 6 (bottom), in stage px.
  function hudBox() {
    const hit = Math.max(44, 44 / (UI.scale || 1));
    return { left: W - 12 - Math.max(56, hit) - 12 - Math.max(72, hit), bottom: Math.max(56, hit) + 6 };
  }

  // anchors are read once per frame after SCENE.update (DESIGN 5.9); only changed values touch the DOM
  function placeEnemies() {
    const sc = S.sc;
    const compact = isCompact();
    if (S.compactSeen !== compact) {                  // the window crossed the 0.75 scale line: the chips changed size, so the caps change too
      const first = S.compactSeen === undefined;
      S.compactSeen = compact;
      if (!first) {
        S.vm.enemies.forEach((u) => { const en = S.en[u.id]; if (en) setStatuses(en.st, u.st, enemyChips(u, compact), false); });
        layoutHand();                                  // the fan rests lower on the compact stage (HAND.restYCompact)
      }
    }
    const bw = barWidths(S.vm.enemies, compact), under = compact ? UNDER.compact : UNDER.desk, hud = hudBox();
    S.vm.enemies.forEach((u) => {
      const en = S.en[u.id];
      if (!en) return;
      if (bw[u.id] && en.barW !== bw[u.id]) { en.barW = bw[u.id]; en.wrap.style.width = px(bw[u.id]); }
      const a = safe(() => sc.anchor('enemy', u.id), null);
      if (!a || !isNum(a.x)) return;
      const key = [a.x, a.y, a.w, a.h, a.top.x, a.top.y, a.feet.x, a.feet.y, hud.bottom, compact ? 1 : 0].map((v) => Math.round(v)).join(',');
      if (en.pos.key === key && en.bh) return;
      en.pos.key = key;
      if (!en.bh) { en.bh = en.bubble.hidden ? 46 : clamp(en.bubble.offsetHeight || 46, 30, 160); en.bubW = en.bubble.hidden ? 0 : (en.bubble.offsetWidth || 0); }
      // a bubble that reaches the speed or menu button (a boss in lane 4 on a phone, where the buttons are --hit tall) goes below them: it is drawn later and would take their taps
      const reach = a.top.x + en.bubW / 2 > hud.left;
      const by = Math.max((reach ? hud.bottom : 62) + en.bh, a.top.y - 6);
      en.bubble.style.left = px(a.top.x); en.bubble.style.top = px(by);
      en.stars.style.left = px(a.top.x); en.stars.style.top = px(a.top.y + 18);
      en.wrap.style.left = px(a.feet.x); en.wrap.style.top = px(a.feet.y + under.bar);
      en.st.el.style.left = px(a.feet.x); en.st.el.style.top = px(a.feet.y + under.row);
      en.pv.style.left = px(a.head.x); en.pv.style.top = px(Math.max(70, a.top.y + 28));
      const w = Math.max(a.w, 96), h = Math.max(a.h, 96);
      en.hit.style.left = px(a.x + a.w / 2 - w / 2); en.hit.style.top = px(a.y + a.h / 2 - h / 2);
      en.hit.style.width = px(w); en.hit.style.height = px(h);
    });
  }

  // ==================================================================================================================
  // the hand: cards fan along the bottom, lift on hover, rise when selected, follow a drag. Each card lives in a `.hc` wrapper that
  // owns the transform (so UI.card keeps its own hover lift inside), keyed by card uid. Layout is a pure function of the vm hand.
  // ==================================================================================================================
  const frontOf = (vm) => vm.heroes.find((h) => h.row === 'front' && !h.down) || vm.heroes.find((h) => !h.down) || vm.heroes[0];
  function cardUnit(inst) {
    const d = cardDef(inst.id);
    const h = d && DATA.heroes[d.hero] ? heroOf(S.vm, d.hero) : null;
    return h || frontOf(S.vm);
  }

  const restYFor = (compact) => (compact ? HAND.restYCompact : HAND.restY);
  const restY = () => restYFor(isCompact());
  function slotFor(i, n, compact) {
    const span = HAND.x1 - HAND.x0 - HAND.cw;
    const step = n <= 1 ? 0 : Math.min(HAND.maxSpread, span / (n - 1));
    const left0 = HAND.x0 + (span - step * (n - 1)) / 2;
    const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
    return { x: left0 + step * i, y: restYFor(compact) + t * t * 18, rot: t * 5.5, step };
  }
  const xf = (x, y, rot, sc) => 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (rot ? ' rotate(' + rot.toFixed(2) + 'deg)' : '') + (sc && sc !== 1 ? ' scale(' + sc + ')' : '');
  const pileXf = (p, sc) => xf(p.x - HAND.cw / 2, p.y - HAND.ch / 2, 0, sc);

  function layoutHand() {
    if (!S) return;
    const list = S.vm.hand, n = list.length, compact = isCompact();
    const selUid = S.sel ? S.sel.uid : null;
    const hoverUid = S.hoverUid;
    const raised = (uid) => uid !== null && uid !== undefined && (uid === selUid || (S.picking && S.picking.chosen.indexOf(uid) >= 0));
    let refIdx = list.findIndex((c) => raised(c.uid));
    if (refIdx < 0 && hoverUid !== null && hoverUid !== undefined) refIdx = list.findIndex((c) => c.uid === hoverUid);
    list.forEach((c, i) => {
      const e = S.cards.get(c.uid);
      if (!e) return;
      const w = e.wrap;
      if (w.classList.contains('dragging') || w.classList.contains('played') || w.classList.contains('leaving')) return;
      const s = slotFor(i, n, compact);
      let x = s.x, y = s.y, rot = s.rot, z = 10 + i;
      if (raised(c.uid)) { y = HAND.raiseTop + (S.picking ? 26 : 0); rot = 0; z = 80; }
      else if (c.uid === hoverUid && !S.drag) { y = HAND.hoverTop; rot = 0; z = 60; }
      if (refIdx >= 0 && i !== refIdx && s.step < HAND.cw) {
        const d = Math.abs(i - refIdx);
        const spread = clamp(HAND.cw - s.step, 0, 70) * 0.55;
        x += (i < refIdx ? -1 : 1) * spread * (d === 1 ? 1 : d === 2 ? 0.5 : 0.2);
      }
      w.style.transform = xf(x, y, rot);
      w.style.zIndex = String(z);
      e.slot = { x, y, i };
      w.classList.toggle('up', y < restYFor(compact) - 20);
    });
    placeHandBox();
  }

  // The tutorial's `hand` anchor is the fan AT REST: from the first card's left edge to the last card's right edge, from the top of the resting cards
  // to the stage edge. It is a box of its own because the .cm-hand container is the whole stage (the cards are positioned inside it), and a ring and a
  // tail aimed at that pointed at empty sky (finding 38). It sits beside the container, not inside it: syncHand indexes the container's children.
  function handBounds(n, compact) {
    const y0 = restYFor(compact);
    if (n < 1) return { x0: HAND.x0, x1: HAND.x1, y0, y1: H };
    const swing = n > 1 ? HAND.swing : 0;           // the turned outer cards reach this far past their unturned box
    return { x0: slotFor(0, n, compact).x - swing, x1: slotFor(n - 1, n, compact).x + HAND.cw + swing, y0, y1: H };
  }
  function placeHandBox() {
    const box = S && S.ui && S.ui.handBox;
    if (!box) return;
    const b = handBounds(S.vm.hand.length, isCompact()), st = box.style;
    st.left = px(b.x0); st.top = px(b.y0); st.width = px(b.x1 - b.x0); st.height = px(b.y1 - b.y0);
  }

  function createCard(inst, o) {
    o = o || {};
    const el = UI.card(inst, { size: 'hand', unit: cardUnit(inst), C: S.ctxC, playable: false, disabled: false, showGems: true });
    const wrap = mk('div', { class: 'hc' }, el);
    const entry = { uid: inst.uid, inst: cp(inst), wrap, el, ok: false, reason: null, need: false, noClick: false };
    if (o.from) {
      wrap.classList.add('fresh');
      wrap.style.transform = pileXf(o.from, 0.3);
      wrap.style.transitionDelay = (o.delay || 0) + 'ms';
    }
    bindCard(entry);
    S.ui.hand.appendChild(wrap);
    S.cards.set(inst.uid, entry);
    if (o.from) {
      void wrap.offsetWidth;
      wrap.classList.remove('fresh');
      UI.after(700, () => { wrap.style.transitionDelay = ''; });
    }
    return entry;
  }

  function evalCard(inst) {
    const C = S.C;
    const need = C.needsTarget(inst.uid);
    const t = need ? C.legalTargets(inst.uid)[0] : undefined;
    const r = C.canPlay(inst.uid, t);
    return { ok: r.ok, reason: r.ok ? null : r.reason, need };
  }

  function refreshCards() {
    S.vm.hand.forEach((inst) => {
      const e = S.cards.get(inst.uid);
      if (!e) return;
      const ev = S.picking ? { ok: S.picking.cand.has(inst.uid), reason: 'pending', need: false } : evalCard(inst);
      e.inst = cp(inst); e.ok = ev.ok; e.reason = ev.reason; e.need = ev.need;
      e.el.rbUpdate({ unit: cardUnit(inst), C: S.ctxC, inst: cp(inst), refresh: true, playable: ev.ok, disabled: !ev.ok, selected: (S.sel && S.sel.uid === inst.uid) || (S.picking && S.picking.chosen.indexOf(inst.uid) >= 0) });
      e.wrap.classList.toggle('retained', !!S.vm.retained[inst.uid]);
      e.wrap.classList.toggle('needs-target', ev.need);
    });
  }

  // make S.cards equal the vm hand (used at resync; the event-by-event path animates instead)
  function syncHand() {
    const want = new Set(S.vm.hand.map((c) => c.uid));
    S.cards.forEach((e, uid) => { if (!want.has(uid)) { e.wrap.remove(); S.cards.delete(uid); } });
    S.vm.hand.forEach((inst) => { if (!S.cards.has(inst.uid)) createCard(inst); });
    const kids = Array.from(S.ui.hand.children).filter((k) => !k.classList.contains('leaving') && !k.classList.contains('played'));
    S.vm.hand.forEach((inst, i) => { const e = S.cards.get(inst.uid); if (kids[i] !== e.wrap) { S.ui.hand.insertBefore(e.wrap, kids[i] || null); kids.splice(i, 0, e.wrap); } });
    refreshCards();
    layoutHand();
  }

  function flyOut(entry, how, delay) {
    const w = entry.wrap;
    S.cards.delete(entry.uid);
    if (S.sel && S.sel.uid === entry.uid) S.sel = null;
    w.classList.add('leaving', how === 'exhaust' ? 'burn' : 'toss');
    w.style.zIndex = '2';
    w.style.transitionDelay = (delay || 0) + 'ms';
    w.style.transform = how === 'exhaust' ? xf(entry.slot ? entry.slot.x : 600, (entry.slot ? entry.slot.y : restY()) - 60, 0, 1.15) : pileXf(PILE.discard, 0.3);
    UI.after(how === 'exhaust' ? 760 : 520, () => w.remove());
  }

  // the played card glides to the middle, waits a beat, then goes where the engine says (discard, exhaust, power)
  function flyPlayed(entry, to) {
    const w = entry.wrap;
    S.cards.delete(entry.uid);
    w.classList.add('played');
    w.style.zIndex = '150';
    w.style.transitionDelay = '0ms';
    w.style.transform = xf((W - HAND.cw) / 2, 232, 0, 1.12);          // the middle of the stage, not of the fan
    UI.after(520, () => {
      w.classList.add('leaving', to === 'exhaust' ? 'burn' : to === 'power' ? 'rise' : 'toss');
      w.style.transform = to === 'exhaust' ? xf(545, 170, 0, 1.3) : to === 'power' ? xf(40, 300, 0, 0.4) : pileXf(PILE.discard, 0.3);
    });
    UI.after(1250, () => w.remove());
  }

  // ==================================================================================================================
  // piles, orb, End Turn plaque, turn label
  // ==================================================================================================================
  function buildPile(kind, x, label, key) {
    const num = mk('b', { class: 'p-n', text: '0' });
    const back = () => UI.cardBack('mini');
    const stack = mk('span', { class: 'p-stack', 'aria-hidden': 'true' }, back(), back(), back());
    const el = mk('button', { type: 'button', class: 'cm-pile ' + kind, 'aria-label': label, 'data-sfx': 'ui_open', style: { left: px(x) } },          // the top comes from the dock line (combat.css)
      stack, num, mk('span', { class: 'p-label', text: label }), mk('kbd', { class: 'btn-key', text: key, 'aria-hidden': 'true' }));
    el.addEventListener('click', () => openPile(kind));
    return { el, num, n: 0, label };
  }
  function setCount(p, n, animate) {
    if (p.n === n) return;
    p.n = n;
    p.num.textContent = String(n);
    p.el.classList.toggle('empty', n === 0);
    p.el.setAttribute('aria-label', p.label + ' pile, ' + n + (n === 1 ? ' card' : ' cards'));
    if (animate) flare(p.el, 'bump', 320);
  }
  function renderPiles(animate) {
    const vm = S.vm, u = S.ui;
    setCount(u.draw, vm.drawN, animate);
    setCount(u.disc, vm.discardN, animate);
    if (u.exh.n !== vm.exhaustN) { u.exh.n = vm.exhaustN; u.exh.num.textContent = String(vm.exhaustN); u.exh.el.hidden = vm.exhaustN === 0; u.exh.el.setAttribute('aria-label', 'Faded, ' + vm.exhaustN + ' cards'); if (animate) flare(u.exh.el, 'bump', 320); }
    if (u.pow.n !== vm.powersN) { u.pow.n = vm.powersN; u.pow.num.textContent = String(vm.powersN); u.pow.el.hidden = vm.powersN === 0; u.pow.el.setAttribute('aria-label', 'Active powers, ' + vm.powersN); if (animate) flare(u.pow.el, 'bump', 320); }
  }

  function buildOrb() {
    const n = mk('b', { class: 'o-n', text: '0' }), max = mk('span', { class: 'o-max', text: '/3' });
    const el = mk('div', { class: 'cm-orb', role: 'img', tabindex: '0', 'aria-label': 'Breath', style: { left: px(PILE.orb.x - 44) } }, mk('i', { class: 'o-glow', 'aria-hidden': 'true' }), mk('i', { class: 'o-ring', 'aria-hidden': 'true' }), n, max);
    tut(el, 'energy');
    UI.tip.attach(el, () => UI.tip.kw('Breath') || mk('div', { class: 'tk' }, mk('div', { class: 'tk-head' }, mk('b', { class: 'tk-name', text: 'Breath' })), mk('p', { class: 'tk-text', text: 'Spend Breath to play cards. It refills every turn and never carries over.' })), { side: 'top' });
    return { el, n, max, v: null };
  }
  function renderEnergy(animate) {
    const vm = S.vm, o = S.ui.orb;
    if (o.v !== vm.energy) {
      const up = o.v !== null && vm.energy > o.v;
      const spend = o.v !== null && vm.energy < o.v;
      o.n.textContent = String(vm.energy);
      if (animate && up) flare(o.el, 'gain', 560); else if (animate && spend) flare(o.el, 'spend', 460);
      o.v = vm.energy;
    }
    o.max.textContent = '/' + vm.maxEnergy;
    o.el.classList.toggle('empty', vm.energy <= 0);
    o.el.setAttribute('aria-label', 'Breath ' + vm.energy + ' of ' + vm.maxEnergy);
  }

  function buildEnd() {
    const el = mk('button', { type: 'button', class: 'cm-end', 'data-sfx': 'turn_end', 'aria-label': 'End turn' },
      mk('span', { class: 'ce-ink', 'aria-hidden': 'true' }), mk('b', { class: 'ce-l1', text: 'END' }), mk('b', { class: 'ce-l2', text: 'TURN' }), mk('kbd', { class: 'btn-key', text: 'E', 'aria-hidden': 'true' }), mk('i', { class: 'btn-shine', 'aria-hidden': 'true' }));
    tut(el, 'endturn');
    el.addEventListener('click', () => endTurnClicked());
    return el;
  }
  function renderEnd() {
    const C = S.C, el = S.ui.end;
    const mine = C.phase === 'player' && !S.draining && !S.picking && !S.ended && !S.intro;
    const nothingLeft = mine && S.vm.hand.every((c) => { const e = S.cards.get(c.uid); return !e || !e.ok; });
    UI.setDisabled(el, !mine, S.picking ? 'Finish your choice first' : 'Wait for your turn');
    el.classList.toggle('ready', !!nothingLeft);
    el.classList.toggle('waiting', !mine && (S.vm.phase === 'enemy' || !!S.turnEnding));
    el.setAttribute('aria-label', mine ? 'End turn' + (nothingLeft ? ', nothing else can be played' : '') : 'End turn, not available now');
  }

  function renderTurn() {
    const vm = S.vm, t = S.ui.turn;
    t.n.textContent = 'Turn ' + Math.max(1, vm.turn);
    const p = vm.phase === 'enemy' ? 'Enemy turn' : vm.phase === 'over' ? (vm.result === 'win' ? 'Victory' : 'Defeat') : vm.phase === 'setup' ? 'The fight begins' : 'Your turn';
    t.p.textContent = p;
    t.el.classList.toggle('enemy', vm.phase === 'enemy');
    t.el.classList.toggle('over', vm.phase === 'over');
  }

  // a brush-stroke plaque that sweeps through the middle: YOUR TURN, ENEMY TURN
  function banner(text, cls, ms) {
    const b = S.ui.banner;
    b.textContent = '';
    b.appendChild(mk('span', { class: 'cb-swash', 'aria-hidden': 'true' }));
    b.appendChild(mk('b', { class: 'cb-text', text }));
    b.className = 'cm-banner ' + (cls || '');
    void b.offsetWidth;
    b.classList.add('show');
    const my = ++S.bannerSeq;
    UI.after(ms || 900, () => { if (S && S.bannerSeq === my) b.classList.remove('show'); });
  }

  // ==================================================================================================================
  // previews: the raised card's big picture, per-enemy damage numbers from C.preview, and Block or heal on the acting hero
  // ==================================================================================================================
  function hidePreview() {
    if (!S) return;
    S.pvToken = (S.pvToken || 0) + 1;
    if (S.pvShown) { S.pvShown = false; UI.tip.hide(); }
  }
  function showPreview(entry, quiet) {
    if (!S || !entry) return;
    const token = S.pvToken = (S.pvToken || 0) + 1;
    const go = () => {
      if (!S || S.pvToken !== token || S.drag || S.picking) return;
      const inst = entry.inst;
      const w = safe(() => UI.tip.card(inst, { unit: cardUnit(inst), C: S.ctxC, x: 322, y: 60, size: 'reward' }), null);
      S.pvShown = !!w;
      if (w && quiet) { const col = w.querySelector('.tip-kwcol'); if (col) col.remove(); }
    };
    if (headless()) go(); else UI.after(quiet ? 0 : 110, go);
  }

  function clearPreviews() {
    if (!S) return;
    S.vm.enemies.forEach((u) => { const en = S.en[u.id]; if (en) { en.pv.hidden = true; en.pv.className = 'cm-pv'; } });
    Object.keys(S.hp).forEach((id) => { S.hp[id].pv.hidden = true; });
  }
  function renderPreviews() {
    clearPreviews();
    const s = S.sel;
    if (!s || S.draining || S.picking) return;
    const C = S.C;
    S.vm.enemies.forEach((u) => {
      const en = S.en[u.id];
      if (!en || u.down) return;
      if (s.need && s.targets.indexOf(u.id) < 0) return;
      const pv = safe(() => C.preview(s.uid, u.id), null);
      if (!pv || pv.dmg === null || pv.dmg === undefined) return;
      const total = pv.dmg * Math.max(1, pv.hits);
      en.pv.textContent = pv.hits > 1 ? pv.dmg + 'x' + pv.hits : String(pv.dmg);
      en.pv.className = 'cm-pv' + (total >= u.hp + u.block ? ' lethal' : '') + (u.block > 0 ? ' blocked' : '');
      en.pv.setAttribute('data-total', String(total));
      en.pv.hidden = false;
    });
    const def = cardDef(S.sel.entry.inst.id);
    const owner = def && DATA.heroes[def.hero] ? def.hero : (frontOf(S.vm) || {}).id;
    const pv0 = safe(() => C.preview(s.uid, s.targets[0]), null);
    const hp = S.hp[owner];
    if (pv0 && hp) {
      const bits = [];
      if (pv0.block > 0) bits.push('+' + pv0.block + ' Block');
      if (pv0.heal > 0) bits.push('+' + pv0.heal + ' HP');
      hp.pv.textContent = bits.join('  ');
      hp.pv.hidden = bits.length === 0;
    }
  }

  // ==================================================================================================================
  // selection, playing, feedback
  // ==================================================================================================================
  function setHover(id) {
    if (!S) return;
    if (S.hoverEnemy === id) return;
    S.hoverEnemy = id;
    safe(() => S.sc.setHover(id ? 'enemy' : null, id || null));
    Object.keys(S.en).forEach((k) => S.en[k].el.classList.toggle('hover', k === id));
  }

  function select(entry, info) {
    if (S.sel && S.sel.uid !== entry.uid) unmarkSel();
    S.sel = { uid: entry.uid, entry, need: !!info.need, targets: info.targets || [], ti: 0 };
    entry.el.rbUpdate({ selected: true });
    S.ui.hand.classList.add('has-sel');
    layoutHand();
    safe(() => S.sc.setTargetable(S.sel.targets));
    S.ui.root.classList.toggle('targeting', S.sel.need);
    showPreview(entry, S.sel.need);
    renderPreviews();
    UI.bus.emit('combat:select', { uid: entry.uid });
  }
  function unmarkSel() {
    if (!S.sel) return;
    const e = S.cards.get(S.sel.uid);
    if (e) e.el.rbUpdate({ selected: false });
  }
  function deselect(quiet) {
    if (!S || !S.sel) return false;
    unmarkSel();
    S.sel = null;
    S.kb = null;
    S.ui.hand.classList.remove('has-sel');
    S.ui.root.classList.remove('targeting');
    safe(() => S.sc.setTargetable([]));
    safe(() => S.sc.aim(null));
    setHover(null);
    hidePreview();
    clearPreviews();
    layoutHand();
    if (!quiet) sfx('ui_back');
    return true;
  }

  const canAct = () => !!S && !S.draining && !S.ended && !S.picking && !S.intro && S.C.phase === 'player' && !S.C.pending;

  // a click on a dimmed card already gets ui_error and a shake from UI's delegate on #stage; other routes (keys, drags) do it here
  function illegal(entry, reason, byClick) {
    const d = entry ? cardDef(entry.inst.id) : null;
    UI.toast(reasonText(reason, d && d.hero), 'warn');
    const delegated = !!(byClick && entry && entry.el.getAttribute('aria-disabled') === 'true');
    if (!delegated) { sfx('ui_error'); if (entry) UI.shake(entry.el); }
    if (reason === 'energy') flare(S.ui.orb.el, 'deny', 420);
  }

  function doPlay(uid, targetId) {
    if (!canAct()) return false;
    const r = S.C.canPlay(uid, targetId);
    if (!r.ok) { illegal(S.cards.get(uid), r.reason); return false; }
    deselect(true);
    UI.bus.emit('combat:play', { uid, target: targetId || null });
    enqueue(S.C.play(uid, targetId));
    return true;
  }

  // a finger or a pen cannot hover, and the rules text of a card at rest sits below the bottom edge of a phone: the first tap must only LIFT the
  // card (so it can be read), and playing is a deliberate second act. A mouse has hover for reading, so with exactly one legal target its first
  // click plays (DESIGN 5.8). `via` is the pointer type behind the tap: touch, pen, mouse, or 'key' (a keyboard click, mouse-like).
  const fingerLike = (via) => via === 'touch' || via === 'pen';

  function cardTap(entry, via) {
    if (!canAct()) return;
    const uid = entry.uid;
    const ev = evalCard(entry.inst);
    const targets = ev.need ? S.C.legalTargets(uid) : [];
    const check = S.C.canPlay(uid, targets[0]);
    if (!check.ok) { illegal(entry, check.reason, true); return; }
    if (S.sel && S.sel.uid === uid) {
      if (!ev.need) { doPlay(uid); return; }
      if (fingerLike(via) && targets.length === 1) { doPlay(uid, targets[0]); return; }   // the lifted card, tapped again: it has only one place to go
      deselect();                                  // a second tap on a targeting card with a choice of targets puts it back
      return;
    }
    select(entry, { need: ev.need, targets });
    if (ev.need && targets.length === 1 && !fingerLike(via)) doPlay(uid, targets[0]);
  }

  function enemyClicked(id) {
    if (!S) return;
    if (S.draining && !S.picking) { fastForward(); return; }
    if (S.picking || S.ended) return;
    const u = enemyOf(S.vm, id);
    if (!u || u.down) return;
    if (S.sel) {
      if (S.sel.need && S.sel.targets.indexOf(id) >= 0) { doPlay(S.sel.uid, id); return; }
      if (S.sel.need) { UI.toast('That enemy cannot be targeted', 'warn'); sfx('ui_error'); return; }
      deselect();
      return;
    }
    inspect(id);
  }

  // tap an enemy with nothing selected: its tooltip for a few seconds (touch has no hover)
  function inspect(id) {
    const en = S.en[id], u = enemyOf(S.vm, id);
    if (!en || !u) return;
    const node = intentTip(u);
    // the status chips under the bar are about 11 px on a phone and a long press away: a tap names what is on the foe right here
    const st = statusList(u.st || {});
    if (st.length) {
      node.appendChild(mk('p', { class: 'tk-text tk-move', text: 'Right now' }));
      st.slice(0, 6).forEach((k) => node.appendChild(mk('p', { class: 'tk-text', text: statusLabel(k) + ' ' + u.st[k] + ': ' + DATA.statuses[k].text })));
      if (st.length > 6) node.appendChild(mk('p', { class: 'tk-text', text: '...and ' + (st.length - 6) + ' more.' }));
    }
    UI.tip.showFor(en.bubble.hidden ? en.hit : en.bubble, node, { side: 'top' });
    S.inspectToken = (S.inspectToken || 0) + 1;
    const my = S.inspectToken;
    UI.after(3200, () => { if (S && S.inspectToken === my) UI.tip.hide(); });
  }

  function endTurnClicked() {
    if (!S) return;
    if (S.draining && !S.picking) { fastForward(); return; }
    if (!canAct()) return;
    deselect(true);
    hidePreview();
    UI.bus.emit('combat:endturn');
    S.turnEnding = true;
    enqueue(S.C.endTurn());
  }

  function swapClicked() {
    if (!S) return;
    if (S.draining && !S.picking) { fastForward(); return; }
    const cs = S.C.canSwap();
    if (!cs.ok || !canAct()) {
      const msg = cs.reason === 'bind' ? 'Tangled: the heroes cannot swap spots' : cs.reason === 'solo' ? 'Only one hero is standing' : cs.reason === 'energy' ? 'Not enough Breath to swap' : REASONS[cs.reason] || 'You cannot swap now';
      UI.toast(msg, 'warn');
      return;
    }
    deselect(true);
    UI.bus.emit('combat:swap');
    enqueue(S.C.swap());
  }

  function fastForward() {
    if (!S || !S.draining) return;
    S.ff = true;
    safe(() => S.sc.flush());
    if (S.gate) S.gate.fin();
    if (S.waiter) S.waiter();
  }

  // ==================================================================================================================
  // pointer handling on cards: tap (click), hover, drag to play or to aim (DESIGN 5.8)
  // ==================================================================================================================
  function enemyAt(p) {
    const h = safe(() => S.sc.hitTest(p.x, p.y), null);
    if (h && h.kind === 'enemy') return h.id;
    let best = null;
    S.vm.enemies.forEach((u) => {
      if (u.down) return;
      const a = safe(() => S.sc.anchor('enemy', u.id), null);
      if (a && p.x >= a.x - 8 && p.x <= a.x + a.w + 8 && p.y >= a.y - 8 && p.y <= a.y + a.h + 8) best = u.id;
    });
    return best;
  }

  function bindCard(entry) {
    const el = entry.el;
    el.addEventListener('pointerdown', (e) => onCardDown(e, entry));
    el.addEventListener('pointermove', (e) => onCardMove(e, entry));
    el.addEventListener('pointerup', (e) => onCardUp(e, entry));
    el.addEventListener('pointercancel', (e) => onCardCancel(e, entry));
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; onCardEnter(entry); });
    el.addEventListener('pointerleave', () => onCardLeave(entry));
    el.addEventListener('focus', () => { if (S && !S.picking && !S.drag) onCardEnter(entry, true); });
    el.addEventListener('blur', () => onCardLeave(entry));
    el.addEventListener('click', (e) => onCardClick(e, entry));
  }

  function onCardEnter(entry, focus) {
    if (!S || S.drag || S.draining) return;
    S.hoverUid = entry.uid;
    layoutHand();
    if (!S.sel && !S.picking) showPreview(entry, false);
    if (focus) return;
  }
  function onCardLeave(entry) {
    if (!S || S.hoverUid !== entry.uid) return;
    S.hoverUid = null;
    layoutHand();
    if (!S.sel && !S.picking) hidePreview();
  }

  function onCardDown(e, entry) {
    if (!S) return;
    S.ptrType = e.pointerType;                       // the click that follows the release does not always carry it (cardTap needs it)
    if (S.draining && !S.picking) { fastForward(); return; }
    if (!canAct()) return;
    S.press = { entry, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, type: e.pointerType };
    safe(() => entry.el.setPointerCapture(e.pointerId));
    hidePreview();
  }

  function startDrag(entry, e) {
    const ev = evalCard(entry.inst);
    const targets = ev.need ? S.C.legalTargets(entry.uid) : [];
    const check = S.C.canPlay(entry.uid, targets[0]);
    if (!check.ok) { S.press = null; return; }      // the click that follows the release explains why (cardTap)
    if (!S.sel || S.sel.uid !== entry.uid) select(entry, { need: ev.need, targets });
    hidePreview();
    const p = UI.toStage(e.clientX, e.clientY);
    const slot = entry.slot || { x: HAND.x0, y: restY() };
    // a finger dragging the only targeting card toward its lone foe may let go anywhere above the play line: "drag it upward" plays it
    const flick = ev.need && targets.length === 1 && fingerLike(S.press && S.press.type) ? targets[0] : null;
    S.drag = { uid: entry.uid, entry, mode: ev.need ? 'aim' : 'move', dx: p.x - slot.x, dy: p.y - slot.y, over: null, flick };
    if (S.drag.mode === 'move') { entry.wrap.classList.add('dragging'); S.ui.playzone.classList.add('show'); }
    if (flick) S.ui.playzone.classList.add('show');
    S.ui.root.classList.add('dragging-card');
  }

  function onCardMove(e, entry) {
    if (!S) return;
    const pr = S.press;
    if (!pr || pr.entry !== entry) return;
    const scale = UI.scale || 1;
    if (!pr.moved) {
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) / scale <= DRAG_PX) return;
      pr.moved = true;
      startDrag(entry, e);
      if (!S.drag) return;
    }
    const d = S.drag;
    if (!d) return;
    const p = UI.toStage(e.clientX, e.clientY);
    if (d.mode === 'move') {
      entry.wrap.style.transform = xf(p.x - d.dx, p.y - d.dy, 0, 1.04);
      S.ui.playzone.classList.toggle('hot', p.y < PLAY_ZONE_Y);
    } else {
      const id = enemyAt(p);
      let legal = id && S.sel && S.sel.targets.indexOf(id) >= 0 ? id : null;
      if (d.flick) {
        S.ui.playzone.classList.toggle('hot', p.y < PLAY_ZONE_Y);
        if (!legal && p.y < PLAY_ZONE_Y) legal = d.flick;
      }
      d.over = legal;
      setHover(legal);
      const s = entry.slot || { x: HAND.x0, y: HAND.raiseTop };
      safe(() => S.sc.aim({ x: s.x + HAND.cw / 2, y: HAND.raiseTop + 20 }, { x: p.x, y: p.y }, legal));
    }
  }

  function endDragVisuals(d) {
    if (d.entry) d.entry.wrap.classList.remove('dragging');
    S.ui.playzone.classList.remove('show', 'hot');
    S.ui.root.classList.remove('dragging-card');
    safe(() => S.sc.aim(null));
    setHover(null);
  }

  function onCardUp(e, entry) {
    if (!S) return;
    const pr = S.press;
    if (!pr || pr.entry !== entry) return;
    S.press = null;
    safe(() => entry.el.releasePointerCapture(pr.id));
    const d = S.drag;
    if (!d) return;
    S.drag = null;
    entry.noClick = true;
    setTimeout(() => { entry.noClick = false; }, 80);
    const p = UI.toStage(e.clientX, e.clientY);
    endDragVisuals(d);
    if (d.mode === 'aim') {
      const id = enemyAt(p);
      if (id && S.sel && S.sel.targets.indexOf(id) >= 0) doPlay(d.uid, id);
      else if (d.flick && p.y < PLAY_ZONE_Y) doPlay(d.uid, d.flick);
      else deselect();
    } else if (p.y < PLAY_ZONE_Y) doPlay(d.uid);
    else deselect();
  }

  function onCardCancel(e, entry) {
    if (!S || !S.press || S.press.entry !== entry) return;
    S.press = null;
    const d = S.drag;
    if (d) { S.drag = null; endDragVisuals(d); deselect(true); }
  }

  function onCardClick(e, entry) {
    if (!S) return;
    if (entry.noClick) { entry.noClick = false; return; }
    if (S.ended) return;
    if (S.draining && !S.picking) { fastForward(); return; }
    if (S.picking) { pickToggle(entry); return; }
    cardTap(entry, e.detail === 0 ? 'key' : (e.pointerType || S.ptrType));
  }

  // ==================================================================================================================
  // the presentation pipeline (DESIGN 5.9): every C action returns events, they go into ONE FIFO and are drained one by one:
  // applyEvent (vm) -> targeted DOM -> await SCENE.play. While draining nothing reads C.hand, C.heroes or C.enemies (C is already
  // final). When the FIFO empties the vm is rebuilt from C (hard resync), intents are asked again and input unlocks.
  // ==================================================================================================================
  function enqueue(events) {
    if (!S) return;
    const list = events || [];
    if (!list.length) { if (!S.draining) resync(false); return; }
    const batch = { left: list.length, lines: [] };
    list.forEach((e) => S.fifo.push({ e, batch }));
    if (!S.draining) startDrain();
  }

  function startDrain() {
    const me = S;
    me.draining = true;
    me.ff = !!me.ffNext;                                    // debug and screenshot runs fast-forward their opening drain
    me.ffNext = false;
    me.hoverUid = null;
    hidePreview();
    me.ui.root.classList.add('busy-fight');
    renderEnd(); renderSwap();
    drainLoop(me).catch((err) => {
      console.error('[combat] the drain failed: ' + (err && err.message) + (err && err.stack ? '\n' + err.stack : ''));
      if (S === me) { me.fifo.length = 0; me.draining = false; safe(() => finishDrain(me)); }
    });
  }

  async function drainLoop(me) {
    while (S === me && me.live()) {
      const item = me.fifo.shift();
      if (!item) break;
      await step(me, item);
    }
    if (S !== me || !me.live()) return;
    finishDrain(me);
  }

  async function step(me, item) {
    const e = item.e;
    const idx = me.evIndex++;
    applyEvent(me.vm, e);
    // a DOM slip must never stall the drain: warn once per event type, and the hard resync at the end repairs the picture
    try { reactDom(e); } catch (x) { warnOnce('react:' + e.type, 'the DOM update for ' + e.type + ' threw', x); }
    try { barkFor(e, idx); } catch (x) { warnOnce('bark', 'a bark threw', x); }
    const line = safe(() => describe(me.vm, e), '');
    if (line) item.batch.lines.push(line);
    item.batch.left -= 1;
    if (item.batch.left === 0 && item.batch.lines.length) UI.announce(item.batch.lines.slice(0, 10).join(' '));
    if (e.type === 'pick_needed') { await pickFlow(me); return; }
    await beat(e);
  }

  // SCENE.play(evt) resolves at its gate. A fast-forward tap flushes the beat; a watchdog in update() frees a beat that never resolves.
  function beat(e) {
    const sc = S.sc;
    let p = null;
    try { p = sc.play(e); } catch (x) { warnOnce('play', 'SCENE.play threw', x); }
    if (S.ff) safe(() => sc.flush());
    if (!p || typeof p.then !== 'function') return Promise.resolve();
    const me = S;
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (done) return; done = true; if (me.gate && me.gate.fin === fin) me.gate = null; resolve(); };
      me.gate = { fin, age: 0 };
      p.then(fin, fin);
    });
  }

  function finishDrain(me) {
    const C = me.C;
    const mine = settle(me.vm);
    const fresh = snapshot(C);
    const a = digest(mine), b = digest(fresh);
    me.drift = a === b ? null : { vm: a, engine: b };
    if (me.drift) {
      const pa = a.split('#'), pb = b.split('#');
      const i = pa.findIndex((x, k) => x !== pb[k]);
      warnOnce('drift', 'the view model drifted from the engine (the hard resync fixed it) in part ' + i + ': vm ' + String(pa[i]).slice(0, 220) + ' | engine ' + String(pb[i]).slice(0, 220));
    }
    me.draining = false;
    me.ff = false;
    me.turnEnding = false;
    me.ui.root.classList.remove('busy-fight');
    resync(true);
    const ready = me.readyRes; me.readyRes = null;
    if (ready) ready();
    if (C.result && !me.ended) beginEnd(me, C.result);
    else if (me.wantPile) { const k = me.wantPile; me.wantPile = null; openPile(k); }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // hard resync: rebuild the vm from C and refresh every part of the picture
  // ------------------------------------------------------------------------------------------------------------------
  function ensureEnemy(u) {
    let en = S.en[u.id];
    if (en) return en;
    en = S.en[u.id] = buildEnemy(u);
    // DOM order follows the line (lane ascending) so Tab walks the enemies left to right
    const kids = Array.from(S.ui.enemies.children);
    const at = kids.find((k) => { const o = enemyOf(S.vm, k.getAttribute('data-enemy')); return o && o.lane > u.lane; });
    S.ui.enemies.insertBefore(en.el, at || null);
    return en;
  }

  function resync(afterDrain) {
    if (!S) return;
    const C = S.C;
    S.vm = snapshot(C);
    S.vm.enemies.forEach((u) => { ensureEnemy(u); if (!u.down && C.phase !== 'setup') { const it = safe(() => C.intent(u.id), null); if (it) u.intent = it; } else u.intent = null; });
    S.vm.heroes.forEach((u) => renderHero(u, false));
    S.vm.enemies.forEach((u) => renderEnemy(u, false));
    syncHand();
    renderPiles(false);
    renderEnergy(false);
    renderTurn();
    renderSwap();
    renderEnd();
    S.ui.enemies.classList.toggle('acting', S.vm.phase === 'enemy');
    S.ui.danger.classList.toggle('on', S.vm.heroes.some((h) => !h.down && h.hp / h.maxHp < 0.3) && !S.ended);
    S.vm.heroes.concat(S.vm.enemies).forEach((u) => safe(() => S.sc.setViewState(u.id, { hp: u.hp, block: u.block })));
    if (S.sel) {
      if (!S.cards.has(S.sel.uid) || !S.vm.hand.some((c) => c.uid === S.sel.uid)) deselect(true);
      else { S.sel.targets = S.sel.need ? C.legalTargets(S.sel.uid) : []; safe(() => S.sc.setTargetable(S.sel.targets)); renderPreviews(); }
    }
    S.ui.hand.classList.toggle('has-sel', !!S.sel);
    updateIntensity();
    void afterDrain;
  }

  function updateIntensity() {
    if (typeof AUDIO === 'undefined' || !isFn(AUDIO, 'intensity')) return;
    const vm = S.vm;
    const live = vm.enemies.filter((u) => !u.down).length;
    const phases = vm.enemies.filter((u) => u.tier === 'boss').reduce((s, u) => s + (u.phase || 0), 0);
    const n = clamp(clamp(1 - live / Math.max(1, S.startEnemies), 0, 1) + 0.25 * phases, 0, 1);   // summons cannot pull it below the fallen share
    if (Math.abs(n - S.intensity) > 1e-6) { S.intensity = n; safe(() => AUDIO.intensity(n)); }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // what one event does to the DOM (the vm was already advanced)
  // ------------------------------------------------------------------------------------------------------------------
  function unitRender(ref, animate) {
    if (!ref) return;
    const u = unitOf(S.vm, ref);
    if (!u) return;
    if (u.kind === 'hero') renderHero(u, animate); else { ensureEnemy(u); renderEnemy(u, animate); }
  }

  function sayLine(id, text) {
    const en = S.en[id];
    if (!en || !text) return;
    const a = safe(() => S.sc.anchor('enemy', id), null);
    en.say.textContent = text;
    if (a) { en.say.style.left = px(clamp(a.top.x, 90, W - 90)); en.say.style.top = px(Math.max(70, a.top.y - 4)); }
    en.say.hidden = false;
    flare(en.say, 'show', 2400);
    UI.after(2400, () => { en.say.hidden = true; });
  }

  function reactDom(e) {
    const vm = S.vm;
    switch (e.type) {
      case 'turn_start':
        renderTurn();
        UI.bus.emit('combat:turn', { turn: e.turn, phase: e.who });
        if (e.who === 'player') {
          S.turnEnding = false;
          S.ui.enemies.classList.remove('acting');
          renderEnergy(true);
          banner('YOUR TURN', 'mine', 900);
        } else {
          S.ui.enemies.classList.add('acting');
          banner('ENEMY TURN', 'foe', 900);
        }
        renderEnd();
        break;
      case 'draw':
        e.cards.forEach((c, i) => { if (!S.cards.has(c.uid)) createCard(c, { from: PILE.draw, delay: i * 55 }); });
        layoutHand(); renderPiles(true);
        break;
      case 'shuffle': renderPiles(true); flare(S.ui.draw.el, 'shuffle', 600); break;
      case 'discard':
        e.cards.forEach((c, i) => { const en = S.cards.get(c.uid); if (en) flyOut(en, 'toss', i * 40); });
        layoutHand(); renderPiles(true);
        break;
      case 'exhaust': { const en = S.cards.get(e.card.uid); if (en) flyOut(en, 'exhaust', 0); layoutHand(); renderPiles(true); break; }
      case 'add_card':
        if (e.to === 'hand') e.cards.forEach((c, i) => { if (!S.cards.has(c.uid)) createCard(c, { from: { x: 640, y: 330 }, delay: i * 60 }); });
        layoutHand(); renderPiles(true);
        break;
      case 'card_move': {
        if (e.to === 'hand' && !S.cards.has(e.card.uid)) createCard(e.card, { from: PILE[e.from] || PILE.draw });
        else if (e.from === 'hand') { const en = S.cards.get(e.card.uid); if (en) flyOut(en, 'toss', 0); }
        layoutHand(); renderPiles(true);
        break;
      }
      case 'card_upgrade': {
        const en = S.cards.get(e.card.uid);
        if (en) { const inst = vm.hand.find((c) => c.uid === e.card.uid) || e.card; en.inst = cp(inst); en.el.rbUpdate({ inst: cp(inst), refresh: true }); flare(en.wrap, 'upgraded', 900); }
        break;
      }
      case 'retain':
        e.cards.forEach((c) => { const en = S.cards.get(c.uid); if (en) en.wrap.classList.add('retained'); });
        break;
      case 'energy': renderEnergy(true); break;
      case 'play': {
        const en = S.cards.get(e.card.uid);
        if (en) flyPlayed(en, e.to);
        layoutHand(); renderPiles(true);
        break;
      }
      case 'hit': case 'thorns': case 'block': case 'block_lost': case 'heal': case 'hurt': case 'status':
        unitRender(e.dst, true);
        if (e.type === 'hit' && e.dst.kind === 'hero' && e.amount > 0) { const p = S.hp[e.dst.id]; if (p) flare(p.el, 'ouch', 420); }
        break;
      case 'max_hp': { const h = heroOf(vm, e.hero); if (h) renderHero(h, true); break; }
      case 'swap':
        vm.heroes.forEach((h) => renderHero(h, true));
        renderSwap();
        break;
      case 'intent': { const u = enemyOf(vm, e.enemy); if (u) { ensureEnemy(u); renderEnemy(u, false); } break; }
      case 'summon': { const u = enemyOf(vm, e.enemy.id); if (u) { const en = ensureEnemy(u); renderEnemy(u, false); flare(en.el, 'arrive', 700); } break; }
      case 'enemy_act': {
        const en = S.en[e.enemy];
        if (en) flare(en.bubble, 'act', 320);
        if (e.say && !isFn(S.sc, 'shout')) sayLine(e.enemy, e.say);      // SCENE.play shouts a move's `say` itself when it can
        break;
      }
      case 'enemy_phase': {
        const u = enemyOf(vm, e.enemy);
        if (u) { renderEnemy(u, true); flare(S.en[u.id].el, 'phase', 900); }
        if (e.say && !isFn(S.sc, 'shout')) sayLine(e.enemy, e.say);
        if (u && u.def === 'boss_editor' && e.index >= 2 && typeof AUDIO !== 'undefined' && isFn(AUDIO, 'music')) safe(() => AUDIO.music('final'));
        updateIntensity();
        break;
      }
      case 'death': case 'flee': unitRender(e.unit, true); updateIntensity(); break;
      case 'hero_down': { const h = heroOf(vm, e.hero); if (h) renderHero(h, true); S.ui.danger.classList.toggle('on', vm.heroes.some((x) => !x.down && x.hp / x.maxHp < 0.3)); break; }
      case 'hero_revive': { const h = heroOf(vm, e.hero); if (h) renderHero(h, true); break; }
      case 'gold': S.gain.gold += e.n; if (S.ui.gold) S.ui.gold.rbSet(Math.max(0, S.R.gold + S.gain.gold), { animate: true }); break;
      case 'ink': S.gain.ink += e.n; if (S.ui.ink) S.ui.ink.rbSet(clamp(S.R.ink + S.gain.ink, 0, S.R.inkMax || 99), { animate: true, max: S.R.inkMax }); break;
      case 'relic': { const r = S.ui.relicEls[e.id]; if (r) flare(r, 'flash', 800); break; }
      case 'end': renderTurn(); break;
      default: break;
    }
  }

  // barks (DESIGN 5.9 item 9): key by event, then pickBark decides (6 s gap, 35%, seeded by the event index)
  function barkFor(e, idx) {
    const vm = S.vm;
    let key = null, hero = null;
    switch (e.type) {
      case 'combat_start': key = 'start'; hero = (frontOf(vm) || {}).id; break;
      case 'hit':
        if (e.dst.kind === 'hero') { const u = heroOf(vm, e.dst.id); if (u && e.amount >= 0.25 * u.maxHp) { key = 'hurt'; hero = u.id; } }
        else if (e.killed && e.src && e.src.kind === 'hero') S.lastKill = { enemy: e.dst.id, hero: e.src.id };
        break;
      case 'death':
        if (S.lastKill && S.lastKill.enemy === e.unit.id) { key = 'kill'; hero = S.lastKill.hero; S.lastKill = null; }
        break;
      case 'hero_down': key = 'down'; hero = e.hero; break;
      case 'swap': if (!e.forced) { key = 'swap'; hero = e.front; } break;
      case 'end': if (e.result === 'win') { key = 'win'; hero = (frontOf(vm) || {}).id; } break;
      default: break;
    }
    if (!key || !hero) return;
    const t = UI.time * 1000;
    const b = pickBark(S.C.seed, idx, key, hero, t, S.lastBark);
    if (!b) return;
    S.lastBark = t;
    S.barks.push(b);
    safe(() => S.sc.bark(b.hero, b.text));
  }

  // ==================================================================================================================
  // picks (DESIGN 5.9 step 4): hand picks are a mode of the hand with a Confirm plaque, other piles use the cardPick overlay
  // ==================================================================================================================
  const pickWord = (p) => PICK_VERB[p.then] || 'choose';
  const pickTitle = (p) => (p.optional ? 'Choose up to ' + p.n : 'Choose ' + p.n) + ' card' + (p.n === 1 ? '' : 's') + ' to ' + pickWord(p);

  function openPick(me, p) {
    return p.from === 'hand' ? handPick(p) : overlayPick(p);
  }

  async function pickFlow(me) {
    for (;;) {
      const p = me.C.pending;
      if (!p || S !== me || !me.live()) return;
      UI.bus.emit('combat:pick', { pending: clone(p) });
      const uids = await openPick(me, p);
      if (S !== me || !me.live()) return;
      const before = me.C.pending;
      const ev = me.C.resolvePick(uids || []);
      if (ev.length) { enqueue(ev); return; }
      if (me.C.pending === before) continue;          // refused (wrong count): ask again, a pick cannot be dodged
      return;                                          // an optional pick answered with nothing
    }
  }

  function handPick(p) {
    return new Promise((resolve) => {
      deselect(true);
      S.picking = { mode: 'hand', p, cand: new Set(p.uids), chosen: [], resolve };
      showPrompt();
      refreshCards(); layoutHand(); renderEnd(); renderSwap();
    });
  }

  function showPrompt() {
    const pk = S.picking, pr = S.ui.prompt;
    pr.text.textContent = pickTitle(pk.p);
    pr.el.hidden = false;
    pr.el.classList.remove('leaving');
    flare(pr.el, 'show', 400);
    updatePrompt();
    UI.announce(pickTitle(pk.p) + '. Press Enter to confirm.');
  }
  function updatePrompt() {
    const pk = S.picking, pr = S.ui.prompt;
    if (!pk || pk.mode !== 'hand') return;
    const n = pk.p.n, k = pk.chosen.length;
    const ok = pk.p.optional ? k <= n : k === n;
    pr.count.textContent = k + ' / ' + (pk.p.optional ? 'up to ' + n : n);
    pr.ok.rbSet({ label: pk.p.optional && k === 0 ? 'Skip' : 'Confirm', disabled: !ok, reason: 'Choose ' + n + ' card' + (n === 1 ? '' : 's') });
  }
  function hidePrompt() { S.ui.prompt.el.hidden = true; }

  function pickToggle(entry) {
    const pk = S.picking;
    if (!pk || pk.mode !== 'hand') return;
    if (!pk.cand.has(entry.uid)) { UI.toast('That card cannot be chosen', 'warn'); return; }
    const i = pk.chosen.indexOf(entry.uid);
    if (i >= 0) pk.chosen.splice(i, 1);
    else {
      if (pk.p.n === 1) pk.chosen.length = 0;
      if (pk.chosen.length >= pk.p.n) { UI.toast('Choose only ' + pk.p.n, 'warn'); return; }
      pk.chosen.push(entry.uid);
    }
    refreshCards(); layoutHand(); updatePrompt();
  }
  function pickConfirm() {
    const pk = S && S.picking;
    if (!pk || pk.mode !== 'hand') return;
    const n = pk.p.n, k = pk.chosen.length;
    if (pk.p.optional ? k > n : k !== n) { UI.toast('Choose ' + n + ' card' + (n === 1 ? '' : 's'), 'warn'); return; }
    S.picking = null;
    hidePrompt();
    refreshCards(); layoutHand();
    pk.resolve(pk.chosen.slice());
  }

  function overlayPick(p) {
    S.picking = { mode: 'overlay', p, cand: new Set(p.uids), chosen: [], resolve: null };
    renderEnd(); renderSwap();
    const pile = S.vm[p.from] || [];
    const cards = p.uids.map((uid) => pile.find((c) => c.uid === uid)).filter(Boolean).map(cp);
    const from = { draw: 'your draw pile', discard: 'your discard pile', exhaust: 'the faded pile' }[p.from] || 'the pile';
    const title = pickTitle(p) + (p.from === 'draw' && p.top ? ' (top ' + p.top + ' of ' + from + ')' : '');
    return UI.overlay.open('cardPick', { title, cards, n: p.n, optional: !!p.optional, confirm: cap(pickWord(p)) }).then((res) => {
      if (S) S.picking = null;
      return res;
    });
  }

  // ==================================================================================================================
  // piles as overlays, sorted so the draw order stays hidden
  // ==================================================================================================================
  function openPile(kind) {
    if (!S || S.ended) return;
    if (S.picking && S.picking.mode === 'overlay') return;
    hidePreview();
    const vm = S.vm;
    const src = { draw: ['Draw pile', vm.draw], discard: ['Discard pile', vm.discard.concat(vm.inPlay && vm.inPlay.to === 'discard' ? [vm.inPlay] : [])], exhaust: ['Faded', vm.exhaust], powers: ['Powers in play', vm.powers.concat(vm.inPlay && vm.inPlay.to === 'power' ? [vm.inPlay] : [])] }[kind];
    if (!src) return;
    const heroRank = (c) => { const d = cardDef(c.id); const i = d ? DATA.LISTS.heroIds.indexOf(d.hero) : -1; return i < 0 ? 9 : vm.heroes.findIndex((h) => h.id === d.hero) < 0 ? 8 : vm.heroes.findIndex((h) => h.id === d.hero); };
    const typeRank = (c) => { const d = cardDef(c.id); return d ? ['attack', 'skill', 'power', 'curse', 'status'].indexOf(d.type) : 9; };
    const cards = src[1].map(cp).sort((a, b) => heroRank(a) - heroRank(b) || typeRank(a) - typeRank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.uid - b.uid));
    UI.overlay.open('deck', { mode: 'view', cards, title: src[0] + ' (' + cards.length + ')' });
  }

  // ==================================================================================================================
  // the end of the fight (DESIGN 5.10 conventions): win = victory beat, RUN.combatDone, then GAME routes to the reward node;
  // lose = combatDone merges the stats, combat:end lets GAME record the run, a defeat beat, then GAME.enterNode({kind:'defeat'})
  // ==================================================================================================================
  function wait(me, ms) {
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (done) return; done = true; if (me.waiter === fin) me.waiter = null; resolve(); };
      me.waiter = fin;
      UI.after(ms / (UI.opt.speed || 1), fin);
    });
  }

  function endCard(text, cls) {
    const c = S.ui.endcard;
    c.textContent = '';
    c.appendChild(mk('span', { class: 'ec-swash', 'aria-hidden': 'true' }));
    c.appendChild(mk('b', { class: 'ec-text', text }));
    c.className = 'cm-endcard ' + cls;
    void c.offsetWidth;
    c.classList.add('show');
  }

  async function beginEnd(me, result) {
    if (me.ended) return;
    me.ended = result;
    deselect(true);
    hidePreview(); clearPreviews();
    me.ui.menu.disabled = true;
    me.ui.root.classList.add('ended', 'ended-' + result);
    renderEnd(); renderSwap(); renderTurn();
    if (result === 'win') {
      UI.bus.emit('combat:end', { result: 'win' });
      sfx('victory');
      endCard('VICTORY', 'win');
      UI.announce('Victory. The fight is won.');
      await wait(me, 1400);
      if (S !== me || !me.live()) return;
      const R = me.R;
      const rw = safe(() => RUN.combatDone(R, me.C), null);
      if (rw === null && !(R.node && R.node.kind === 'reward')) console.error('[combat] RUN.combatDone gave no rewards');
      if (R.node && R.node.kind === 'reward') GAME.enterNode(R.node); else GAME.nodeDone();
    } else {
      safe(() => RUN.combatDone(me.R, me.C));
      UI.bus.emit('combat:end', { result: 'lose' });
      sfx('defeat');
      endCard('DEFEAT', 'lose');
      UI.announce('Defeat. Both heroes have lost their voices.');
      await wait(me, 1000);
      if (S !== me || !me.live()) return;
      GAME.enterNode({ kind: 'defeat' });
    }
  }

  // ==================================================================================================================
  // keyboard: 1..9 and 0 pick a card, Left and Right walk the cards and then the targets, Enter plays, E ends the turn, S swaps,
  // D and G open the piles, Z toggles the animation speed, Esc puts a card back (else the pause menu, by UI)
  // ==================================================================================================================
  function kbSelect(i) {
    if (S.picking && S.picking.mode === 'hand') {
      const c = S.vm.hand[i], en = c && S.cards.get(c.uid);
      if (en) { pickToggle(en); en.el.focus(); }
      return;
    }
    if (!canAct()) return;
    const c = S.vm.hand[i];
    const en = c && S.cards.get(c.uid);
    if (!en) return;
    const ev = evalCard(en.inst);
    const targets = ev.need ? S.C.legalTargets(en.uid) : [];
    const check = S.C.canPlay(en.uid, targets[0]);
    if (!check.ok) { illegal(en, check.reason, false); return; }
    select(en, { need: ev.need, targets });
    S.kb = { mode: ev.need && targets.length > 1 ? 'targets' : 'cards' };
    if (ev.need) { S.sel.ti = 0; kbTarget(0); }
    safe(() => en.el.focus());
  }

  function kbTarget(step) {
    const s = S.sel;
    if (!s || !s.need || !s.targets.length) return;
    s.ti = (s.ti + step + s.targets.length) % s.targets.length;
    const id = s.targets[s.ti];
    setHover(id);
    const en = S.en[id];
    if (en) safe(() => en.hit.focus());
    UI.announce(enemyOf(S.vm, id).name + ', ' + enemyOf(S.vm, id).hp + ' health');
  }

  function kbMoveCard(step) {
    const n = S.vm.hand.length;
    if (!n) return;
    let i = S.sel ? S.vm.hand.findIndex((c) => c.uid === S.sel.uid) : (step > 0 ? -1 : n);
    i = clamp(i + step, 0, n - 1);
    kbSelect(i);
  }

  function onKey(e) {
    if (!S) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    if (S.ended) { if (k === 'Escape') return true; return false; }
    const active = document.activeElement;
    const onPlain = !active || active === document.body || (active.closest && (active.closest('.cm-hand') || active.closest('.cm-en')));
    if (/^[0-9]$/.test(k)) { e.preventDefault(); kbSelect(k === '0' ? 9 : Number(k) - 1); return true; }
    switch (k) {
      case 'ArrowLeft': case 'ArrowRight': {
        if (!onPlain && !S.sel) return false;
        e.preventDefault();
        const step = k === 'ArrowLeft' ? -1 : 1;
        if (S.sel && S.kb && S.kb.mode === 'targets') kbTarget(step); else if (canAct()) kbMoveCard(step);
        return true;
      }
      case 'Enter': {
        if (S.picking && S.picking.mode === 'hand') { e.preventDefault(); pickConfirm(); return true; }
        if (!S.sel || !canAct()) return false;
        if (active && active.closest && active.closest('[data-tut="endturn"], [data-tut="swap"], .cm-pile, .cm-speed')) return false;
        e.preventDefault();
        doPlay(S.sel.uid, S.sel.need ? S.sel.targets[S.sel.ti] : undefined);
        return true;
      }
      case 'e': case 'E': e.preventDefault(); endTurnClicked(); return true;
      case 's': case 'S': e.preventDefault(); swapClicked(); return true;
      case 'd': case 'D': e.preventDefault(); openPile('draw'); return true;
      case 'g': case 'G': e.preventDefault(); openPile('discard'); return true;
      case 'z': case 'Z': e.preventDefault(); UI.cycleSpeed(); renderSpeed(); return true;
      case 'Escape':
        if (S.picking) return true;                    // a pick cannot be dodged; the overlay handles its own Esc
        if (S.sel) { deselect(); return true; }
        return false;
      default: return false;
    }
  }

  function renderSpeed() {
    if (!S) return;
    const sp = UI.opt.speed || 1;
    S.ui.speed.lab.textContent = 'x' + sp;
    S.ui.speed.el.classList.toggle('fast', sp > 1);
  }

  // ==================================================================================================================
  // building the screen: fixed HUD zones of DESIGN 5.8, everything absolutely placed in stage px
  // ==================================================================================================================
  function build(root) {
    const R = S.R;
    const u = S.ui = { root, relicEls: {} };
    root.classList.add('cm');
    root.style.setProperty('--dock-cy', DOCK_CY + 'px');

    // ---- top bar (y 0..56): relic strip left, gold and ink, the turn label in the centre, speed and menu on the right
    const top = mk('div', { class: 'cm-top' });
    u.relics = tut(mk('div', { class: 'cm-relics', role: 'list', 'aria-label': 'Charms' }), 'relics');
    const ids = (R.relics || []).filter((id) => DATA.relics[id]);
    const shown = ids.length > RELIC_SLOTS ? RELIC_SLOTS - 1 : ids.length;
    ids.slice(0, shown).forEach((id) => {
      const el = UI.relic(id, { size: 'sm', onclick: () => UI.overlay.open('relics', {}), side: 'bottom' });
      el.setAttribute('role', 'listitem');
      u.relicEls[id] = el;
      u.relics.appendChild(el);
    });
    if (ids.length > shown) u.relics.appendChild(mk('button', { type: 'button', class: 'cm-relic-more', 'aria-label': (ids.length - shown) + ' more charms', onclick: () => UI.overlay.open('relics', {}), text: '+' + (ids.length - shown) }));
    u.gold = UI.stat('gold', R.gold, { size: 'sm', focusable: false });
    u.ink = UI.stat('ink', R.ink, { size: 'sm', max: R.inkMax, focusable: false });
    const tn = mk('b', { class: 'ct-n' }), tp = mk('span', { class: 'ct-p' });
    u.turn = { el: mk('div', { class: 'cm-turn', role: 'status', 'aria-live': 'off' }, mk('i', { class: 'ct-swash', 'aria-hidden': 'true' }), tn, tp), n: tn, p: tp };
    const sl = mk('b', { class: 'sp-l' });
    const sp = mk('button', { type: 'button', class: 'cm-speed', 'aria-label': 'Animation speed', 'data-sfx': 'ui_toggle' }, mk('span', { class: 'sp-g', html: GLYPH.speed }), sl, mk('kbd', { class: 'btn-key', text: 'Z', 'aria-hidden': 'true' }));
    sp.addEventListener('click', () => { UI.cycleSpeed(); renderSpeed(); });
    u.speed = { el: sp, lab: sl };
    u.menu = UI.menuButton();
    top.appendChild(u.relics);
    top.appendChild(mk('div', { class: 'cm-stats' }, u.gold, u.ink));
    top.appendChild(u.turn.el);
    top.appendChild(sp);
    top.appendChild(u.menu);
    u.danger = mk('i', { class: 'cm-danger', 'aria-hidden': 'true' });
    root.appendChild(u.danger);
    root.appendChild(top);

    // ---- hero panels and the swap seal between them
    u.heroes = mk('div', { class: 'cm-heroes', role: 'group', 'aria-label': 'Heroes' });
    S.vm.heroes.forEach((h, i) => { const p = S.hp[h.id] = buildHero(h, i); u.heroes.appendChild(p.el); });
    u.swap = buildSwap();
    u.heroes.appendChild(u.swap.el);
    root.appendChild(u.heroes);

    // ---- enemy overlays, the hand, the play line
    u.enemies = mk('div', { class: 'cm-enemies', role: 'group', 'aria-label': 'Enemies' });
    root.appendChild(u.enemies);
    u.playzone = mk('div', { class: 'cm-playzone', 'aria-hidden': 'true' }, mk('span', { text: 'Release to play' }));
    root.appendChild(u.playzone);
    u.hand = mk('div', { class: 'cm-hand', role: 'group', 'aria-label': 'Your hand' });
    root.appendChild(u.hand);
    u.handBox = tut(mk('div', { class: 'cm-handbox', 'aria-hidden': 'true' }), 'hand');
    root.appendChild(u.handBox);
    placeHandBox();

    // ---- docks: energy orb and draw pile bottom left, exhaust, discard and End Turn bottom right
    u.orb = buildOrb();
    u.draw = buildPile('draw', 130, 'Draw', 'D');
    tut(u.draw.el, 'deck');
    u.disc = buildPile('discard', 1000, 'Discard', 'G');
    const chip = (cls, label, x, y, kind) => {
      const num = mk('b', { class: 'cc-n', text: '0' });
      const el = mk('button', { type: 'button', class: 'cm-chip ' + cls, hidden: true, 'data-sfx': 'ui_open', style: { left: px(x), top: px(y) } }, mk('span', { class: 'cc-l', text: label }), num);
      el.addEventListener('click', () => openPile(kind));
      return { el, num, n: -1 };
    };
    // the pile chips ride in the free strip of the top bar (between the turn banner and the speed button): under the enemies sit their status rows, which the
    // old spot (y 552) covered for the foes in lanes 3 and 4, and there is no room for a 40 px chip between those rows and the piles
    u.pow = chip('pow', 'Powers', 748, 6, 'powers');
    u.exh = chip('exh', 'Faded', 888, 6, 'exhaust');
    u.end = buildEnd();
    [u.orb.el, u.draw.el, u.pow.el, u.disc.el, u.exh.el, u.end].forEach((el) => root.appendChild(el));

    // ---- transient layers: banner, pick prompt, boss reveal, victory and defeat card
    u.banner = mk('div', { class: 'cm-banner', 'aria-hidden': 'true' });
    const ptext = mk('b', { class: 'cp-text' }), pcount = mk('span', { class: 'cp-count' });
    const pok = UI.btn('Confirm', { kind: 'primary', size: 'lg', key: 'Enter', onclick: () => pickConfirm() });
    u.prompt = { el: mk('div', { class: 'cm-prompt', hidden: true, role: 'group', 'aria-label': 'Choose cards' }, ptext, pcount, pok), text: ptext, count: pcount, ok: pok };
    u.reveal = mk('div', { class: 'cm-reveal', hidden: true, 'aria-hidden': 'true' });
    u.endcard = mk('div', { class: 'cm-endcard', 'aria-hidden': 'true' });
    [u.banner, u.prompt.el, u.reveal, u.endcard].forEach((el) => root.appendChild(el));
  }

  // The boss reveal is SCENE's own banner (name, title, impact frame, the boss rising to its buff pose): the screen asks for it and waits for it.
  // Without the real SCENE, and for champions (SCENE has no banner for them), a DOM plate does the same job. Returns how long to wait, in ms.
  function showReveal(me) {
    const C = me.C;
    const boss = C.enemies.find((e) => e.tier === 'boss') || C.enemies.find((e) => e.tier === 'elite') || C.enemies[0];
    const d = boss ? DATA.enemies[boss.def] : null;
    UI.announce((C.tier === 'boss' ? 'Headliner: ' : 'Rival: ') + (boss ? boss.name : '') + (d && d.title ? ', ' + d.title : ''));
    sfx(C.tier === 'boss' ? 'boss_intro' : 'phase_change');
    if (C.tier === 'boss' && me.realScene) { safe(() => me.sc.banner(boss ? boss.name : 'HEADLINER', 'BOSS')); return 2600; }
    const r = me.ui.reveal;
    r.textContent = '';
    r.className = 'cm-reveal ' + (C.tier === 'boss' ? 'boss' : 'elite');
    r.appendChild(mk('span', { class: 'cr-tag', text: C.tier === 'boss' ? 'HEADLINER' : 'RIVAL' }));
    r.appendChild(mk('b', { class: 'cr-name', text: boss ? boss.name : 'A foe' }));
    if (d && d.title) r.appendChild(mk('span', { class: 'cr-title', text: d.title }));
    r.appendChild(mk('i', { class: 'cr-brush', 'aria-hidden': 'true' }));
    r.hidden = false;
    void r.offsetWidth;
    r.classList.add('show');
    return C.tier === 'boss' ? 2000 : 1000;
  }
  function hideReveal(me) {
    const r = me.ui.reveal;
    r.classList.remove('show');
    r.classList.add('out');
    UI.after(500, () => { r.hidden = true; });
  }

  async function runIntro(me) {
    const C = me.C, debug = !!(me.params && me.params.debug);
    if (!debug) await wait(me, 420);                       // let the ink transition settle before the first beat
    if (S !== me || !me.live()) return;
    if (C.tier === 'boss' || C.tier === 'elite') {
      const ms = showReveal(me);
      await wait(me, debug ? 250 : ms);
      if (S !== me || !me.live()) return;
      hideReveal(me);
    }
    me.intro = false;
    if (debug) me.ffNext = true;                           // screenshot and debug runs reach the steady state at once
    enqueue(C.start());
  }

  // ==================================================================================================================
  // debug hooks (GAME.debug.combat and debugSetup, main.js conventions) and the pure functions the suite drives
  // ==================================================================================================================
  function unitByName(C, who) {
    if (typeof who === 'number') return C.heroes[who] || C.enemies[who - C.heroes.length] || null;
    return C.unit(who) || C.enemies.find((e) => e.def === who && !e.down) || null;
  }

  function debugApi() {
    const me = S;
    if (!me) return null;
    const C = me.C;
    const fresh = () => { if (S === me) resync(false); };
    return {
      C, get vm() { return me.vm; }, get state() { return me; },
      fire(evt) { return me.sc.play(evt); },
      play(handIndex, targetIndex) {
        const c = C.hand[handIndex];
        if (!c) return false;
        const t = C.needsTarget(c.uid) ? C.legalTargets(c.uid)[targetIndex || 0] : undefined;
        return doPlay(c.uid, t);
      },
      endTurn() { endTurnClicked(); },
      swap() { swapClicked(); },
      setHp(who, hp) { const u = unitByName(C, who); if (!u) return; u.hp = clamp(hp, 0, u.maxHp); if (u.hp <= 0) { u.down = true; u.hp = 0; } fresh(); },
      setStatus(who, s, n) { const u = unitByName(C, who); if (!u) return; if (n) u.st[s] = n; else delete u.st[s]; fresh(); },
      setEnergy(n) { C.energy = Math.max(0, n | 0); fresh(); },
      feed(events) { enqueue(events); },                    // push synthetic engine events through the whole pipeline (gold, ink, relic, max_hp...)
      pick(uids) {
        if (!me.picking) return false;
        if (me.picking.mode === 'hand') { me.picking.chosen = uids.slice(); pickConfirm(); } else UI.overlay.close(uids);
        return true;
      },
      win() {
        const evs = [];
        C.enemies.forEach((e) => { if (!e.down) { e.hp = 0; e.down = true; evs.push({ type: 'death', unit: { kind: 'enemy', id: e.id }, tier: e.tier }); } });
        C.result = 'win'; C.phase = 'over';
        evs.push({ type: 'end', result: 'win' });
        enqueue(evs);
        return Promise.resolve();
      },
    };
  }

  function debugSetup(dbg) {
    const me = S;
    if (!me || !dbg) return;
    const apply = () => {
      if (S !== me) return;
      const C = me.C;
      if (dbg.hand && dbg.hand.length) {
        const old = C.hand.splice(0, C.hand.length);
        old.forEach((c) => C.discard.push(c));
        dbg.hand.forEach((id, i) => {
          const d = DATA.cards[id];
          if (d) C.hand.push({ uid: 5000 + i, id, up: 0, gems: (d.slots || []).map(() => null), tmp: true });
        });
      }
      if (dbg.statuses) Object.keys(dbg.statuses).forEach((who) => { const u = unitByName(C, who); if (u) Object.keys(dbg.statuses[who]).forEach((s) => { if (dbg.statuses[who][s]) u.st[s] = dbg.statuses[who][s]; else delete u.st[s]; }); });
      if (isNum(dbg.turn) && dbg.turn > 0) C.turn = dbg.turn;
      resync(false);
    };
    me.ready.then(apply);
  }

  // ==================================================================================================================
  // canvas taps (enemies and empty space) and the screen definition
  // ==================================================================================================================
  function canvasTap(p) {
    if (!S || S.ended || S.picking) return;
    if (S.draining) return;
    const h = safe(() => S.sc.hitTest(p.x, p.y), null);
    if (h && h.kind === 'enemy') { enemyClicked(h.id); return; }
    if (S.sel) deselect();
    else UI.tip.hide();
  }

  const def = {
    transition: 'ink',
    music(params) {
      const node = params && params.node;
      const R = (params && params.R) || UI.run;
      const ch = clamp((R && R.chapter) || (node && node.chapter) || 1, 1, 3);
      if (node && node.tier === 'boss') return 'boss' + ch;
      if (node && node.tier === 'elite') return 'elite';
      return 'combat' + ch;
    },

    enter(params, root) {
      const R = (params && params.R) || UI.run;
      const node = (params && params.node) || (R && R.node);
      if (!R || !node) throw new Error('the combat screen needs a run and a combat node');
      const C = COMBAT.create(RUN.combatInit(R, node));
      const real = realScene();
      S = {
        root, R, node, C, params: params || {}, sc: real || fallbackScene(), realScene: !!real, live: UI.live(), vm: snapshot(C),
        fifo: [], draining: false, ff: false, ended: null, intro: true, cards: new Map(), hp: {}, en: {}, ui: null,
        sel: null, kb: null, drag: null, press: null, picking: null, hoverUid: null, hoverEnemy: null, pvToken: 0, pvShown: false,
        evIndex: 0, lastBark: null, lastKill: null, barks: [], gain: { gold: 0, ink: 0 }, startEnemies: C.enemies.length, intensity: -1, bannerSeq: 0,
        gate: null, waiter: null, ctxC: { relics: C.relics }, drift: null, readyRes: null, ready: null, wantPile: null, inspectToken: 0,
      };
      const me = S;
      me.ready = new Promise((res) => { me.readyRes = res; });
      build(root);
      me.compactSeen = isCompact();                       // so a resize before the first frame still re-lays the hand and the chip caps
      safe(() => me.sc.mount({ C, chapter: C.chapter, boss: C.tier === 'boss' }));
      if (!me.realScene) me.ui.root.classList.add('fallback-scene');
      resync(false);
      renderSpeed();
      UI.canvasOn('pointerdown', () => { if (S && S.draining && !S.picking) fastForward(); });
      UI.canvasOn('pointerup', (e, p) => canvasTap(p));
      UI.canvasOn('pointermove', (e, p) => {
        if (!S || S.drag || S.draining) return;
        const h = safe(() => S.sc.hitTest(p.x, p.y), null);
        setHover(h && h.kind === 'enemy' ? h.id : null);
      });
      root.addEventListener('pointerdown', (e) => { if (S && S.draining && !S.picking && !(e.target.closest && e.target.closest('.menu-btn, .cm-speed'))) fastForward(); }, true);
      runIntro(me);
    },

    leave() {
      const me = S;
      if (!me) return;
      S = null;
      safe(() => me.sc.flush());
      safe(() => me.sc.unmount());
      if (me.gate) me.gate.fin();
      if (me.waiter) me.waiter();
      if (me.picking && me.picking.resolve) me.picking.resolve([]);
      me.fifo.length = 0;
      me.cards.clear();
      if (typeof AUDIO !== 'undefined' && isFn(AUDIO, 'intensity')) safe(() => AUDIO.intensity(0));
    },

    update(dt) {
      const me = S;
      if (!me) return;
      safe(() => me.sc.update(dt));
      placeEnemies();
      if (me.gate) {
        me.gate.age += dt;
        if (me.gate.age > WATCHDOG_S) { warnOnce('gate', 'a SCENE beat did not resolve in ' + WATCHDOG_S + ' s; forcing it'); safe(() => me.sc.flush()); me.gate.fin(); }
      }
    },

    draw(ctx, t) {
      const me = S;
      if (!me) return;
      try { me.sc.draw(ctx, t); } catch (e) {
        warnOnce('scenedraw', 'SCENE.draw threw', e);
        ctx.fillStyle = '#1a1340'; ctx.fillRect(0, 0, W, H);
      }
    },

    onKey,
    debug: debugApi,                                        // GAME.debug.combat() calls it with this = the screen
    debugSetup,
  };

  // pure pieces, exported for tests/hocus_vocus_screen_combat.test.mjs
  def._t = { snapshot, applyEvent, settle, digest, describe, pickBark, rowBrief, reasonText, slotFor, counts, enemyChips, widestRow, barWidths, handBounds, LANE_GAP, LANE_X, BAR_W, BAR_W_COMPACT, BAR_CLEAR, UNDER, ROW_CHIP, DOCK_CY, RELIC_SLOTS, state: () => S, HAND, PILE };

  UI.screens.combat = def;
})();
