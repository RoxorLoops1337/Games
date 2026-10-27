/*
 * SUNBEAM SIEGE, B18 Tutorial data.
 * Classic script, no modules. Loads as SB.data.tutorial (one object, not an array, see B18-tutorial.md).
 *
 * What lives here:
 *   cards     4 cat cards and 3 spell cards used only by the tutorial (ids neutral_tut_*), A03 schema.
 *   enemies   4 tutorial pests (pest_tutorial_*), A02 section 17 shape plus flavor and art.
 *   fights    4 scripted fights: exact waves, fixed hands, exact plays, coach steps, expected end states.
 *   flow      the guided first run: fight, map, fight, shop, fight, nook, fight.
 *   mapGuide, shopGuide, nookGuide   the mini guides.
 *   safeFail  the rules that make losing impossible.
 *   tips      30 in-run contextual tip rules.
 *   targets   the registry of data-tut highlight keys the UI must expose.
 *
 * NEEDS (for the engine and UI agents, nothing here is silently invented):
 *   1. Loader: merge SB.data.tutorial.cards into the card registry and SB.data.tutorial.enemies into the
 *      pest registry. All have tutorialOnly:true, so they never appear in rewards, shops or the Collection.
 *   2. Scripted draws: when fight.scripted is true, the Draw phase sets the hand to rounds[n].hand in order
 *      (instead of shuffling) and the pile refills from fight.fillerDraw if a card effect draws extra.
 *   3. Scripted rules flags per fight: rules.nightClock, rules.dazedKnock (a Knocked or flapped pest gets
 *      Dazed 1 as in A02 section 13: skips its next action and climb, then clears; no Dizzy misfire roll),
 *      rules.noRandomMisfire, rules.impatience:false.
 *   4. Pest spawn with floor 2 or 3 for non-elite pests ("through the window"), see waves.
 *   5. Gating: the UI asks SB.tutorial.allows(input) before acting. Input shapes are listed under gate.
 *   6. Unit refs: cats and pests carry the ref given in setup, plays and spawns (B, T1, rat1 ...).
 *   7. Tip engine: tips[].when kinds are listed at the bottom of the file under tipKinds.
 *   8. Action kind 'attack' with pick:'all' (Vacuum Suck) is already in A02 section 6.
 *   9. Hand-pointer targets: UI exposes data-tut attributes listed in targets.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

SB.data.tutorial = (function () {
  'use strict';

  // ---------------------------------------------------------------------------------------------
  // Small helpers (used only to build the table below)
  // ---------------------------------------------------------------------------------------------
  function step(id, o) {
    return Object.assign({
      id: id,
      when: { on: 'afterStep' },          // trigger, see triggerKinds
      target: null,                       // key into targets, or null for a centered bubble
      text: '',
      pose: 'talk',                       // Elder Cat pose: talk, point, smile, shrug, wince
      dim: true,                          // dim layer with spotlight cutout
      gate: { allow: ['next'] },          // what the player may do while this step is up
      advance: 'tap'                      // 'tap' (Next button) or { await: playId }
    }, o);
  }
  function play(id, step_, o) {
    return Object.assign({ id: id, step: step_ }, o);
  }

  // ---------------------------------------------------------------------------------------------
  // CARDS (tutorial-only copies, so a balance change elsewhere can never break the script)
  // ---------------------------------------------------------------------------------------------
  var cards = [
    { id: 'neutral_tut_biscuit', name: 'Biscuit', type: 'champion', clan: 'neutral', rarity: 'legendary', cost: 0,
      targeting: 'floor', stats: { power: 4, health: 14, lives: 9, size: 1 }, keywords: {},
      text: 'Your Champion. Starts on the Cellar.',
      flavor: 'Has opinions about the stairs and a plan for the stairs.',
      art: { sprite: 'cat_tabby', palette: 'orange', accessory: 'none' }, tutorialOnly: true },
    { id: 'neutral_tut_tabby', name: 'Hall Tabby', type: 'unit', clan: 'neutral', rarity: 'basic', cost: 1,
      targeting: 'floor', stats: { power: 3, health: 5, lives: 3, size: 1 }, keywords: {},
      text: 'A plain, reliable cat.',
      flavor: 'Patrols the hallway. The hallway has not asked.',
      art: { sprite: 'cat_scrappy', palette: 'grey' }, tutorialOnly: true },
    { id: 'neutral_tut_kitten', name: 'Hall Kitten', type: 'unit', clan: 'neutral', rarity: 'basic', cost: 1,
      targeting: 'floor', stats: { power: 2, health: 3, lives: 2, size: 1 }, keywords: {},
      text: 'Kitten: only 2 Lives.',
      flavor: 'Brave in the way that people are brave on a very short ladder.',
      art: { sprite: 'cat_kitten', palette: 'cream' }, tutorialOnly: true },
    { id: 'neutral_tut_loaf', name: 'Sofa Loaf', type: 'unit', clan: 'neutral', rarity: 'basic', cost: 1,
      targeting: 'floor', stats: { power: 2, health: 7, lives: 3, size: 1 }, keywords: {},
      text: 'Good at Napping. Better at it than at anything else.',
      flavor: 'Four paws, zero visible.',
      art: { sprite: 'cat_loaf', palette: 'cream' }, tutorialOnly: true },
    { id: 'neutral_tut_swat', name: 'Swat', type: 'spell', clan: 'neutral', rarity: 'basic', cost: 1,
      targeting: 'enemy', keywords: {}, text: 'Deal 4 damage.',
      flavor: 'A lesson, delivered at speed.',
      effects: { onPlay: [{ type: 'damage', amount: 4, kind: 'hit', target: 'chosenEnemy' }] },
      tutorialOnly: true },
    { id: 'neutral_tut_catnap', name: 'Catnap', type: 'spell', clan: 'neutral', rarity: 'basic', cost: 1,
      targeting: 'cat', keywords: {}, text: 'A cat Naps, heals 3 and gains 1 extra Rested.',
      flavor: 'Productivity is a human invention.',
      effects: { onPlay: [
        { type: 'nap', target: 'chosenCat' },
        { type: 'heal', amount: 3, target: 'chosenCat' },
        { type: 'applyStatus', status: 'rested', amount: 1, target: 'chosenCat' }] },
      tutorialOnly: true },
    { id: 'neutral_tut_knock', name: 'Knock It Off', type: 'spell', clan: 'neutral', rarity: 'basic', cost: 1,
      targeting: 'enemy', keywords: {}, text: 'Knock 1: push a pest down 1 floor. Shatter 2 per floor fallen.',
      flavor: 'Eye contact was maintained throughout.',
      effects: { onPlay: [{ type: 'knock', amount: 1, target: 'chosenEnemy' }] },
      tutorialOnly: true }
  ];

  // ---------------------------------------------------------------------------------------------
  // ENEMIES (four pests, full schema: A02 section 17 plus flavor and art)
  // Sizes: Small 1, Medium 2, Large 3. Floors hold 5 pest Size.
  // ---------------------------------------------------------------------------------------------
  var enemies = [
    { id: 'pest_tutorial_mouse', name: 'Pantry Raider', hp: 4, size: 1, traits: [], tags: ['pest', 'mouse', 'tutorial'],
      pattern: { type: 'cycle', actions: [
        { kind: 'attack', dmg: 2, hits: 1, floors: 'own', pick: 'front', label: 'Nibble' }] },
      flavor: 'Is mostly here for the cheese. Has been told this is not a cheese house.',
      art: { species: 'mouse', colors: 'grey with pink ears', accessory: 'a single crumb held like a trophy' },
      tutorialOnly: true },
    { id: 'pest_tutorial_rat', name: 'Alley Rat', hp: 8, size: 1, traits: [], tags: ['pest', 'rat', 'tutorial'],
      pattern: { type: 'cycle', actions: [
        { kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front', label: 'Bite' },
        { kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front', label: 'Gnaw' }] },
      flavor: 'Believes in the bin. Has made it a personality.',
      art: { species: 'rat', colors: 'brown with a bald tail', accessory: 'torn ear, bottle cap monocle' },
      tutorialOnly: true },
    { id: 'pest_tutorial_pup', name: 'Pup, Enthusiastic', hp: 10, size: 2, traits: ['Climber'], tags: ['pest', 'dog', 'tutorial'],
      pattern: { type: 'cycle', actions: [
        { kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front', label: 'Chomp' },
        { kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front', label: 'Big Chomp' }] },
      flavor: 'Fetching things is a personality. Returning them is not.',
      art: { species: 'puppy', colors: 'golden with a white blaze', accessory: 'one slipper, held with great pride' },
      tutorialOnly: true },
    { id: 'pest_tutorial_vacuum', name: 'Hall Closet Vacuum', hp: 16, size: 3, traits: ['Heavy'], tags: ['pest', 'horror', 'tutorial'],
      pattern: { type: 'cycle', actions: [
        { kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front', label: 'Nudge' },
        { kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'all', label: 'Suck' }] },
      flavor: 'It does not hate you. It does not know you exist. That is worse.',
      art: { species: 'upright vacuum cleaner', colors: 'faded red with a grey hose', accessory: 'frayed cord tail, one headlight eye' },
      tutorialOnly: true }
  ];

  // ---------------------------------------------------------------------------------------------
  // UI target registry. The UI puts data-tut="<key>" on these elements (patterns use :ref).
  // ---------------------------------------------------------------------------------------------
  var targets = {
    sunbeam: 'The Sunbeam panel and Warmth bar',
    warmth: 'The numeric Warmth readout',
    floors: 'All three floors as one block',
    'floor:1': 'Cellar row', 'floor:2': 'Parlor row', 'floor:3': 'Attic row',
    'cat:<ref>': 'A cat unit token on the board',
    'pest:<ref>': 'A pest unit token on the board',
    'intent:<ref>': 'The intent bubble above that pest',
    'lives:<ref>': 'The Lives pips above that cat',
    'rested:<ref>': 'The Rested moon pips on that cat',
    'napToggle:<ref>': 'The Z button on that cat',
    'status:<ref>:<id>': 'A status icon on that unit',
    'card:<cardId>': 'The first copy of that card in hand',
    hand: 'The whole hand tray',
    zoomies: 'The Zoomies orb cluster',
    endTurn: 'The End Turn button',
    nightClock: 'The Witching Hour moon dial in the top bar',
    gardenQueue: 'The garden spawn queue strip',
    drawPile: 'Draw pile', discardPile: 'Discard pile',
    mapLegend: 'Map legend chip row', 'mapNode:<id>': 'A node on the tutorial map', mapPath: 'Dotted path lines',
    shopCards: 'Shop card row', shopRemove: 'Shoo (remove a card) tile', shopFish: 'Fish counter',
    shopLeave: 'Leave button', shopGerald: 'Gerald portrait',
    nookOptions: 'Nap Nook option row', deckButton: 'Deck button in the top bar',
    topbarNight: 'Night x of 9 label', relicStrip: 'Relic strip', settingsCog: 'Settings cog'
  };

  // ---------------------------------------------------------------------------------------------
  // FIGHT 1: "A Tabby, a Mouse and the Rest of the House"
  // Teaches: Sunbeam, floors, intents, playing cards, Zoomies, End Turn, cats-strike-first, Lives pips.
  // ---------------------------------------------------------------------------------------------
  var fight1 = {
    id: 'tut_1_cellar', order: 1, title: 'The Cellar Door', scripted: true,
    teaches: ['sunbeam', 'floors', 'intents', 'playing cards', 'zoomies', 'end turn', 'cats strike first', 'lives'],
    rules: { nightClock: false, dazedKnock: true, noRandomMisfire: true, impatience: false },
    warmth: 40, maxRounds: 5,
    setup: {
      cats: [{ ref: 'B', card: 'neutral_tut_biscuit', floor: 1, pos: 0 }]
    },
    fillerDraw: ['neutral_tut_swat'],
    waves: [
      { round: 1, spawns: [{ ref: 'mouse1', id: 'pest_tutorial_mouse', floor: 1, at: 'back' }] },
      { round: 2, spawns: [{ ref: 'rat1', id: 'pest_tutorial_rat', floor: 1, at: 'back' },
                           { ref: 'mouse2', id: 'pest_tutorial_mouse', floor: 3, at: 'back' }] }
    ],
    rounds: [
      { n: 1,
        expect: { warmth: 40, cats: ['B:14:L9', 'T1:5:L3', 'T2:5:L3'], pests: ['rat1:8@1', 'mouse2:4@3'] },
        hand: ['neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_tabby'],
        plays: [
          play('f1_p1', 'f1_play_a', { kind: 'place', card: 'neutral_tut_tabby', ref: 'T1', floor: 1, pos: 'back' }),
          play('f1_p2', 'f1_play_b', { kind: 'place', card: 'neutral_tut_tabby', ref: 'T2', floor: 2, pos: 'back' }),
          play('f1_p3', 'f1_end1', { kind: 'endTurn' })
        ] },
      { n: 2,
        expect: { warmth: 40, cats: ['B:11:L9', 'T1:5:L3', 'T2:5:L3'], pests: ['rat1:1@1'] },
        hand: ['neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_swat', 'neutral_tut_tabby'],
        plays: [
          play('f1_p4', 'f1_swat', { kind: 'spell', card: 'neutral_tut_swat', target: 'mouse2' }),
          play('f1_p5', 'f1_end2', { kind: 'endTurn' })
        ] },
      { n: 3,
        expect: { win: true },
        hand: ['neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_tabby'],
        plays: [
          play('f1_p6', 'f1_finish', { kind: 'endTurn' })
        ] }
    ],
    steps: [
      step('f1_hello', { when: { on: 'fightStart' }, pose: 'smile', target: null,
        text: 'Ah, there you are. Sit. Not there, that is my spot. Here, next to the Sunbeam. Tonight we hold the house, and I will point at things.' }),
      step('f1_sunbeam', { when: { on: 'afterStep', step: 'f1_hello' }, target: 'sunbeam', pose: 'point',
        text: 'That is the Sunbeam. Warm, lovely, and the whole point. Its Warmth is 40. If it reaches zero the house goes cold, and I get very quiet.' }),
      step('f1_floors', { when: { on: 'afterStep', step: 'f1_sunbeam' }, target: 'floors', pose: 'point',
        text: 'Three floors: Cellar, Parlor, Attic. Pests come in at the bottom. Your cats stand where you put them. Put them well, or at least visibly.' }),
      step('f1_biscuit', { when: { on: 'afterStep', step: 'f1_floors' }, target: 'cat:B', pose: 'smile',
        text: 'This is Biscuit, your Champion. Four claws, fourteen health, and nine lives, which is the full set and slightly showing off.' }),
      step('f1_intent', { when: { on: 'afterStep', step: 'f1_biscuit' }, target: 'intent:mouse1', pose: 'point',
        text: 'A mouse. The bubble over its head says Nibble, 2. That is exactly what it will do on its turn, and who it will do it to. Pests are honest like that. It is their only virtue.' }),
      step('f1_hand', { when: { on: 'afterStep', step: 'f1_intent' }, target: 'hand', pose: 'talk',
        text: 'Those are your cards. Each costs Zoomies, shown here. You get 3 a turn, and what you do not spend is gone at End Turn. Nothing carries over. It is a very modern house.' }),
      step('f1_zoom', { when: { on: 'afterStep', step: 'f1_hand' }, target: 'zoomies', pose: 'point',
        text: 'Three Zoomies. Spend them. A Hall Tabby costs one.' }),
      step('f1_play_a', { when: { on: 'afterStep', step: 'f1_zoom' }, target: 'card:neutral_tut_tabby', pose: 'point',
        gate: { allow: [{ input: 'placeCard', card: 'neutral_tut_tabby', floor: 1 }] }, advance: { await: 'f1_p1' },
        text: 'Drag the Hall Tabby onto the Cellar. On a phone, tap the card, then tap the floor.' }),
      step('f1_wall', { when: { on: 'afterPlay', play: 'f1_p1' }, target: 'floor:1', pose: 'talk',
        text: 'Cats on a floor fight the pests on that floor, front cat first. As far as a pest is concerned, a cat is a wall.' }),
      step('f1_play_b', { when: { on: 'afterStep', step: 'f1_wall' }, target: 'floor:2', pose: 'point',
        gate: { allow: [{ input: 'placeCard', card: 'neutral_tut_tabby', floor: 2 }] }, advance: { await: 'f1_p2' },
        text: 'Another one, on the Parlor. Nothing is up there yet. A cat in the right place before the trouble is called planning. A cat in the wrong place is called a nap.' }),
      step('f1_end1', { when: { on: 'afterPlay', play: 'f1_p2' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f1_p3' },
        text: 'Now End Turn. Your cats strike first, floor by floor, front to back. Then the pests get their turn, if any are left. It is the one fair rule in the house.' }),
      step('f1_strike', { when: { on: 'phaseEnd', phase: 'cat_attacks', round: 1 }, target: 'cat:B', pose: 'smile', dim: false,
        text: 'Biscuit got there first. The mouse never reached its turn. This is most of the strategy, really.' }),

      step('f1_attic', { when: { on: 'roundStart', round: 2 }, target: 'pest:mouse2', pose: 'wince',
        text: 'Another mouse, and this one came in through the Attic window. No cat up there, so it will go straight for the Sunbeam. That is the part we dislike.' }),
      step('f1_swat', { when: { on: 'afterStep', step: 'f1_attic' }, target: 'card:neutral_tut_swat', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_swat', target: 'mouse2' }] }, advance: { await: 'f1_p4' },
        text: 'Swat deals 4 damage to a pest you choose. Tap Swat, then tap the mouse. A mouse has 4 health. Arithmetic is on your side.' }),
      step('f1_spare', { when: { on: 'afterPlay', play: 'f1_p4' }, target: 'zoomies', pose: 'shrug',
        text: 'Two Zoomies left. You may spend them or lose them. Tonight we will lose them, with dignity.' }),
      step('f1_rat', { when: { on: 'afterStep', step: 'f1_spare' }, target: 'intent:rat1', pose: 'point',
        text: 'The rat on the Cellar will Bite for 3. Biscuit and the Tabby can deal with it, though perhaps not all at once. Let them.' }),
      step('f1_end2', { when: { on: 'afterStep', step: 'f1_rat' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f1_p5' }, text: 'End Turn.' }),
      step('f1_bite', { when: { on: 'phaseEnd', phase: 'pest_attacks', round: 2 }, target: 'cat:B', pose: 'talk', dim: false,
        text: 'Biscuit took a bite. Health refills after every fight, so nobody minds. Lives are different. Lives do not refill.' }),

      step('f1_lives', { when: { on: 'roundStart', round: 3 }, target: 'lives:B', pose: 'point',
        text: 'These little paws are Lives. Biscuit has nine, the Tabbies have three. When a cat runs out of health it spends one life and goes back to your discard pile. When the last life goes, the card is gone. Keep count. I do.' }),
      step('f1_finish', { when: { on: 'afterStep', step: 'f1_lives' }, target: 'endTurn', pose: 'smile',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f1_p6' },
        text: 'The rat has 1 health left and Biscuit has four claws. You may End Turn. Or admire the rat. I have seen worse plans.' }),
      step('f1_win', { when: { on: 'fightWon' }, pose: 'smile',
        text: 'That is the whole fight. Cards, floors, End Turn. Everything else is decoration. The Sunbeam holds.' })
    ]
  };

  // ---------------------------------------------------------------------------------------------
  // FIGHT 2: "Knock It Off"
  // Teaches: Knock, Shatter, landing damage on neighbours, Dazed on landing, Climber, cat flap.
  // ---------------------------------------------------------------------------------------------
  var fight2 = {
    id: 'tut_2_knock', order: 2, title: 'Things That Fall', scripted: true,
    teaches: ['knock it off', 'shatter', 'pile-up damage', 'climber', 'cat flap', 'dizzy'],
    rules: { nightClock: false, dazedKnock: true, noRandomMisfire: true, impatience: false },
    warmth: 40, maxRounds: 5,
    setup: {
      cats: [
        { ref: 'B', card: 'neutral_tut_biscuit', floor: 1, pos: 0 },
        { ref: 'T1', card: 'neutral_tut_tabby', floor: 1, pos: 1 },
        { ref: 'T2', card: 'neutral_tut_tabby', floor: 2, pos: 0 }
      ]
    },
    fillerDraw: ['neutral_tut_swat'],
    waves: [
      { round: 1, spawns: [
        { ref: 'rat1', id: 'pest_tutorial_rat', floor: 1, at: 'back' },
        { ref: 'mouse1', id: 'pest_tutorial_mouse', floor: 1, at: 'back' },
        { ref: 'pup1', id: 'pest_tutorial_pup', floor: 2, at: 'back' }] }
    ],
    rounds: [
      { n: 1,
        expect: { warmth: 40, cats: ['B:9:L9', 'T1:5:L3', 'T2:5:L3'], pests: ['mouse1:2@1', 'pup1:7@1'] },
        hand: ['neutral_tut_knock', 'neutral_tut_knock', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_tabby'],
        plays: [
          play('f2_p1', 'f2_knock1', { kind: 'spell', card: 'neutral_tut_knock', target: 'pup1' }),
          play('f2_p2', 'f2_end1', { kind: 'endTurn' })
        ] },
      { n: 2,
        expect: { warmth: 40, cats: ['B:9:L9', 'T1:5:L3', 'T2:5:L3'], pests: ['pup1:3@1'] },
        hand: ['neutral_tut_knock', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_tabby'],
        plays: [
          play('f2_p3', 'f2_knock2', { kind: 'spell', card: 'neutral_tut_knock', target: 'pup1' }),
          play('f2_p4', 'f2_end2', { kind: 'endTurn' })
        ] },
      { n: 3,
        expect: { win: true },
        hand: ['neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_tabby'],
        plays: [
          play('f2_p5', 'f2_swat', { kind: 'spell', card: 'neutral_tut_swat', target: 'pup1' }),
          play('f2_p6', 'f2_end3', { kind: 'endTurn' })
        ] }
    ],
    steps: [
      step('f2_hello', { when: { on: 'fightStart' }, pose: 'smile',
        text: 'Tonight somebody is going to fall off something. It is more satisfying than it sounds.' }),
      step('f2_pup', { when: { on: 'afterStep', step: 'f2_hello' }, target: 'pest:pup1', pose: 'point',
        text: 'A pup, on the Parlor. Pups are Climbers. A Climber ignores the rule that cats are walls, and heads for the Attic and the Sunbeam regardless. Enthusiasm, you see.' }),
      step('f2_card', { when: { on: 'afterStep', step: 'f2_pup' }, target: 'card:neutral_tut_knock', pose: 'point',
        text: 'Knock It Off. Cost 1. It pushes a pest down a floor. The pest takes 2 Shatter damage per floor it falls, which ignores Fluff, and whatever it lands on takes 2 as well.' }),
      step('f2_knock1', { when: { on: 'afterStep', step: 'f2_card' }, target: 'pest:pup1', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_knock', target: 'pup1' }] }, advance: { await: 'f2_p1' },
        text: 'Tap Knock It Off, then the pup. Go on. It is a card, not a character judgement.' }),
      step('f2_after', { when: { on: 'afterPlay', play: 'f2_p1' }, target: 'floor:1', pose: 'smile',
        text: 'Down it goes. The pup took 2, the rat took 2, the mouse took 2. The pup also lands Dizzy, so it loses its next turn and its climb. Gravity does the work. You supervise.' }),
      step('f2_end1', { when: { on: 'afterStep', step: 'f2_after' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f2_p2' }, text: 'End Turn.' }),
      step('f2_cats', { when: { on: 'phaseEnd', phase: 'cat_attacks', round: 1 }, target: 'floor:1', pose: 'smile', dim: false,
        text: 'Biscuit and the Tabby finished the rat. Nobody was surprised, least of all the rat.' }),

      step('f2_cellar', { when: { on: 'roundStart', round: 2 }, target: 'pest:pup1', pose: 'point',
        text: 'The pup is on the Cellar now, and the Cellar has nowhere lower to go. Knock a pest from the Cellar and it takes 3 Shatter and leaves through the cat flap. It comes back at the next Spawn.' }),
      step('f2_knock2', { when: { on: 'afterStep', step: 'f2_cellar' }, target: 'pest:pup1', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_knock', target: 'pup1' }] }, advance: { await: 'f2_p3' },
        text: 'Knock It Off, on the pup again.' }),
      step('f2_flap', { when: { on: 'afterPlay', play: 'f2_p3' }, target: 'gardenQueue', pose: 'shrug',
        text: 'Out through the cat flap, and into the garden queue. Knocking buys time and chips health. It does not retire anyone. A pest also moves by Knock only once a round, so no juggling.' }),
      step('f2_end2', { when: { on: 'afterStep', step: 'f2_flap' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f2_p4' }, text: 'End Turn.' }),

      step('f2_back', { when: { on: 'roundStart', round: 3 }, target: 'pest:pup1', pose: 'wince',
        text: 'And here it is again, with 3 health and a dazed expression. Swat, then let Biscuit finish. Some problems solve themselves if you are patient.' }),
      step('f2_swat', { when: { on: 'afterStep', step: 'f2_back' }, target: 'card:neutral_tut_swat', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_swat', target: 'pup1' }] }, advance: { await: 'f2_p5' },
        text: 'Swat the pup.' }),
      step('f2_end3', { when: { on: 'afterPlay', play: 'f2_p5' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f2_p6' }, text: 'End Turn.' }),
      step('f2_win', { when: { on: 'fightWon' }, pose: 'smile',
        text: 'Knock is a little damage, a lost turn and a tidier floor, all for one Zoomies. Remember that when you find a card that Knocks twice. The Sunbeam holds.' })
    ]
  };

  // ---------------------------------------------------------------------------------------------
  // FIGHT 3: "The Art of Doing Nothing"
  // Teaches: Nap toggle (Z), no nap on the turn played, Rested, Catnap card, Stretch on waking, Rude Awakening.
  // ---------------------------------------------------------------------------------------------
  var fight3 = {
    id: 'tut_3_nap', order: 3, title: 'The Art of Doing Nothing', scripted: true,
    teaches: ['nap', 'rested', 'stretch', 'catnap', 'rude awakening'],
    rules: { nightClock: false, dazedKnock: true, noRandomMisfire: true, impatience: false },
    warmth: 40, maxRounds: 6,
    setup: {
      cats: [{ ref: 'B', card: 'neutral_tut_biscuit', floor: 1, pos: 0 }]
    },
    fillerDraw: ['neutral_tut_swat'],
    waves: [
      { round: 1, spawns: [{ ref: 'mouse1', id: 'pest_tutorial_mouse', floor: 1, at: 'back' }] },
      { round: 2, spawns: [{ ref: 'mouse2', id: 'pest_tutorial_mouse', floor: 1, at: 'back' }] },
      { round: 3, spawns: [{ ref: 'pup1', id: 'pest_tutorial_pup', floor: 1, at: 'back' }] }
    ],
    rounds: [
      { n: 1,
        expect: { warmth: 40, cats: ['B:14:L9', 'L1:7:L3'], pests: ['mouse2:4@1'] },
        hand: ['neutral_tut_loaf', 'neutral_tut_catnap', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_catnap'],
        plays: [
          play('f3_p1', 'f3_loaf', { kind: 'place', card: 'neutral_tut_loaf', ref: 'L1', floor: 2, pos: 'back' }),
          play('f3_p2', 'f3_end1', { kind: 'endTurn' })
        ] },
      { n: 2,
        expect: { warmth: 40, cats: ['B:14:L9', 'L1:7:L3'], pests: ['pup1:10@1'] },
        hand: ['neutral_tut_catnap', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_catnap', 'neutral_tut_swat'],
        plays: [
          play('f3_p3', 'f3_toggle', { kind: 'toggleNap', unit: 'L1', to: 'napping' }),
          play('f3_p4', 'f3_end2', { kind: 'endTurn' })
        ] },
      { n: 3,
        expect: { warmth: 40, cats: ['B:11:L9', 'L1:7:L3'], pests: ['pup1:6@2'] },
        hand: ['neutral_tut_catnap', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_catnap', 'neutral_tut_swat'],
        plays: [
          play('f3_p5', 'f3_catnap', { kind: 'spell', card: 'neutral_tut_catnap', target: 'L1' }),
          play('f3_p6', 'f3_end3', { kind: 'endTurn' })
        ] },
      { n: 4,
        expect: { win: true },
        hand: ['neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_catnap', 'neutral_tut_tabby'],
        plays: [
          play('f3_p7', 'f3_wake', { kind: 'toggleNap', unit: 'L1', to: 'awake' }),
          play('f3_p8', 'f3_end4', { kind: 'endTurn' })
        ] }
    ],
    steps: [
      step('f3_hello', { when: { on: 'fightStart' }, pose: 'smile',
        text: 'Tonight, a lesson in doing nothing. It is harder than it looks and it is most of what I do all day.' }),
      step('f3_loaf', { when: { on: 'afterStep', step: 'f3_hello' }, target: 'card:neutral_tut_loaf', pose: 'point',
        gate: { allow: [{ input: 'placeCard', card: 'neutral_tut_loaf', floor: 2 }] }, advance: { await: 'f3_p1' },
        text: 'Sofa Loaf. Slow, round, structurally unimpressive. Put her on the Parlor. Nothing is up there, which is how she likes it.' }),
      step('f3_end1', { when: { on: 'afterPlay', play: 'f3_p1' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f3_p2' },
        text: 'End Turn. Biscuit will see to the mouse. Cats cannot Nap on the turn they arrive. Too excited. She will settle.' }),

      step('f3_toggle', { when: { on: 'roundStart', round: 2 }, target: 'napToggle:L1', pose: 'point',
        gate: { allow: [{ input: 'toggleNap', unit: 'L1', to: 'napping' }] }, advance: { await: 'f3_p3' },
        text: 'She has settled. Tap the Z on the Loaf. It is free. A napping cat does not attack, heals 2 each round, and gains Rested at Dusk.' }),
      step('f3_end2', { when: { on: 'afterPlay', play: 'f3_p3' }, target: 'endTurn', pose: 'smile',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f3_p4' }, text: 'End Turn. Biscuit does the work. The Loaf does the rest, which is nothing.' }),
      step('f3_pips', { when: { on: 'phaseEnd', phase: 'dusk', round: 2 }, target: 'rested:L1', pose: 'point', dim: false,
        text: 'One moon pip. That is Rested. Every pip is worth 3 extra damage when she wakes, and she can hold 4.' }),

      step('f3_pup', { when: { on: 'roundStart', round: 3 }, target: 'pest:pup1', pose: 'point',
        text: 'A pup is coming. Do not wake her yet. It has to climb to her first, and it will, being a Climber. Let it come.' }),
      step('f3_catnap', { when: { on: 'afterStep', step: 'f3_pup' }, target: 'card:neutral_tut_catnap', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_catnap', target: 'L1' }] }, advance: { await: 'f3_p5' },
        text: 'Catnap does the Z\'s job plus a heal of 3 and one extra Rested. It costs a Zoomies, and the Z is free, but she is already asleep and this is the cheapest moment to add more sleep. Play it on the Loaf.' }),
      step('f3_end3', { when: { on: 'afterPlay', play: 'f3_p5' }, target: 'endTurn', pose: 'shrug',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f3_p6' },
        text: 'End Turn. If the pup bit her while she slept, she would wake cross and lose all her Rested. Rude Awakening, it is called. We will not let that happen.' }),

      step('f3_cometh', { when: { on: 'roundStart', round: 4 }, target: 'pest:pup1', pose: 'wince',
        text: 'The pup is on the Parlor, and the Loaf is on 3 Rested. It would bite her this turn. It will not, because cats strike first.' }),
      step('f3_wake', { when: { on: 'afterStep', step: 'f3_cometh' }, target: 'napToggle:L1', pose: 'point',
        gate: { allow: [{ input: 'toggleNap', unit: 'L1', to: 'awake' }] }, advance: { await: 'f3_p7' },
        text: 'Wake her. Tap the Z again. On her next strike she Stretches: her Attack plus 3 for every Rested. With three Rested, that is a good nine on top. She also keeps a little extra Attack for the whole fight.' }),
      step('f3_end4', { when: { on: 'afterPlay', play: 'f3_p7' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f3_p8' }, text: 'End Turn, and watch.' }),
      step('f3_stretch', { when: { on: 'phaseEnd', phase: 'cat_attacks', round: 4 }, target: 'cat:L1', pose: 'smile', dim: false,
        text: 'That was rather more than a pup with six health needed. Overkill is lost. I am told it was worth it.' }),
      step('f3_win', { when: { on: 'fightWon' }, pose: 'smile',
        text: 'The best defender is sometimes the one that did nothing for three turns. The Sunbeam holds.' })
    ]
  };

  // ---------------------------------------------------------------------------------------------
  // FIGHT 4: "The Witching Hour"
  // Teaches: Nine Lives (spend, Cornered, last life), Witching Hour (clock, Zoom, Frazzled, Night Visitors).
  // ---------------------------------------------------------------------------------------------
  var fight4 = {
    id: 'tut_4_witching', order: 4, title: 'The Witching Hour', scripted: true,
    teaches: ['nine lives', 'cornered', 'witching hour', 'zoom', 'frazzled', 'night visitors', 'heavy'],
    rules: { nightClock: true, dazedKnock: true, noRandomMisfire: true, impatience: false },
    warmth: 40, maxRounds: 7,
    setup: {
      cats: [{ ref: 'B', card: 'neutral_tut_biscuit', floor: 1, pos: 0 }]
    },
    fillerDraw: ['neutral_tut_swat'],
    waves: [
      { round: 1, spawns: [{ ref: 'rat1', id: 'pest_tutorial_rat', floor: 1, at: 'back' }] },
      { round: 2, spawns: [{ ref: 'mouse1', id: 'pest_tutorial_mouse', floor: 1, at: 'back' }] },
      { round: 3, spawns: [{ ref: 'mouse2', id: 'pest_tutorial_mouse', floor: 1, at: 'back' }] },
      { round: 4, spawns: [{ ref: 'vac1', id: 'pest_tutorial_vacuum', floor: 1, at: 'back' }] }
    ],
    nightVisitors: [
      // Spawn at the end of Witching Hour round 3, arrive for round 4 behind the normal wave.
      { afterRound: 3, spawns: [{ ref: 'mouse3', id: 'pest_tutorial_mouse', floor: 1, at: 'back' }] }
    ],
    rounds: [
      { n: 1,
        expect: { warmth: 40, cats: ['B:14:L9'], pests: ['rat1:2@1', 'mouse1:4@1'], lifeEvents: ['K1:1'] },
        hand: ['neutral_tut_kitten', 'neutral_tut_tabby', 'neutral_tut_swat', 'neutral_tut_catnap', 'neutral_tut_catnap'],
        plays: [
          play('f4_p1', 'f4_kitten', { kind: 'place', card: 'neutral_tut_kitten', ref: 'K1', floor: 1, pos: 'front' }),
          play('f4_p2', 'f4_end1', { kind: 'endTurn' })
        ] },
      { n: 2,
        expect: { warmth: 40, cats: ['B:14:L9', 'K1:3:L1'], pests: ['mouse2:4@1'] },
        hand: ['neutral_tut_kitten', 'neutral_tut_tabby', 'neutral_tut_swat', 'neutral_tut_catnap', 'neutral_tut_tabby'],
        plays: [
          play('f4_p3', 'f4_replay', { kind: 'place', card: 'neutral_tut_kitten', ref: 'K1', floor: 1, pos: 'back' }),
          play('f4_p4', 'f4_end2', { kind: 'endTurn' })
        ] },
      { n: 3, witching: true,
        expect: { warmth: 40, cats: ['B:14:L9', 'K1:3:L1', 'T1:5:L3', 'T2:5:L3'], pests: ['vac1:16@1', 'mouse3:4@1'] },
        hand: ['neutral_tut_tabby', 'neutral_tut_tabby', 'neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_catnap', 'neutral_tut_tabby'],
        plays: [
          play('f4_p5', 'f4_spend', { kind: 'place', card: 'neutral_tut_tabby', ref: 'T1', floor: 1, pos: 'back' }),
          play('f4_p6', 'f4_spend2', { kind: 'place', card: 'neutral_tut_tabby', ref: 'T2', floor: 1, pos: 'back' }),
          play('f4_p7', 'f4_end3', { kind: 'endTurn' })
        ] },
      { n: 4,
        expect: { warmth: 40, cats: ['B:9:L9', 'K1:3:L1', 'T1:5:L3', 'T2:5:L3'], pests: ['vac1:6@1', 'mouse3:4@1'] },
        hand: ['neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_catnap', 'neutral_tut_tabby'],
        plays: [
          play('f4_p8', 'f4_swat1', { kind: 'spell', card: 'neutral_tut_swat', target: 'vac1' }),
          play('f4_p9', 'f4_end4', { kind: 'endTurn' })
        ] },
      { n: 5,
        expect: { win: true },
        hand: ['neutral_tut_swat', 'neutral_tut_swat', 'neutral_tut_tabby', 'neutral_tut_catnap', 'neutral_tut_tabby'],
        plays: [
          play('f4_p10', 'f4_swat2', { kind: 'spell', card: 'neutral_tut_swat', target: 'vac1' }),
          play('f4_p11', 'f4_swat3', { kind: 'spell', card: 'neutral_tut_swat', target: 'mouse3' })
        ] }
    ],
    steps: [
      step('f4_hello', { when: { on: 'fightStart' }, pose: 'smile',
        text: 'Last one tonight. Two things: what nine lives actually cost, and what happens to a house at the Witching Hour.' }),
      step('f4_kitten', { when: { on: 'afterStep', step: 'f4_hello' }, target: 'card:neutral_tut_kitten', pose: 'point',
        gate: { allow: [{ input: 'placeCard', card: 'neutral_tut_kitten', floor: 1, pos: 'front' }] }, advance: { await: 'f4_p1' },
        text: 'A Hall Kitten. Three health, two lives. Put her on the Cellar, in front of Biscuit. I know. I am being instructive, not kind.' }),
      step('f4_end1', { when: { on: 'afterPlay', play: 'f4_p1' }, target: 'endTurn', pose: 'wince',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f4_p2' },
        text: 'The rat will Bite for 3 and the front cat is the one it bites. She has 3 health. I have done this arithmetic before. End Turn.' }),
      step('f4_life', { when: { on: 'phaseEnd', phase: 'pest_attacks', round: 1 }, target: 'lives:K1', pose: 'talk', dim: true,
        text: 'She spent a life. One left, and back to the discard pile she goes, to be drawn again. A cat on exactly one life is Cornered and gains +2 Attack. Nobody fights like a cat with one life and a point to make. If the last life goes, the card is lost and an Empty Collar takes its place. Biscuit has eight to spare.' }),

      step('f4_clock', { when: { on: 'roundStart', round: 2 }, target: 'nightClock', pose: 'point',
        text: 'The moon dial. It says Witching Hour next round. Every third round the house gets strange, and it is announced a round ahead, as manners require.' }),
      step('f4_replay', { when: { on: 'afterStep', step: 'f4_clock' }, target: 'card:neutral_tut_kitten', pose: 'point',
        gate: { allow: [{ input: 'placeCard', card: 'neutral_tut_kitten', floor: 1, pos: 'back' }] }, advance: { await: 'f4_p3' },
        text: 'There she is again. Play her on the Cellar, at the back this time. Cornered kittens hit like Biscuit, and survive longer at the back.' }),
      step('f4_end2', { when: { on: 'afterPlay', play: 'f4_p3' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f4_p4' }, text: 'End Turn.' }),

      step('f4_witching', { when: { on: 'roundStart', round: 3 }, target: 'nightClock', pose: 'wince',
        text: 'The Witching Hour. You get 5 Zoomies and 6 cards. Every awake cat Zooms: a free hit, half damage, on a random pest. Then they are Frazzled next round, minus 2 Attack. Cats that did not Zoom are fine.' }),
      step('f4_zoomed', { when: { on: 'afterStep', step: 'f4_witching' }, target: 'floor:1', pose: 'smile',
        text: 'The mouse is still here. Every awake cat Zooms at End Turn, and that includes any cat you put down this turn. Free hits all round. A little rude, but generous.' }),
      step('f4_spend', { when: { on: 'afterStep', step: 'f4_zoomed' }, target: 'card:neutral_tut_tabby', pose: 'point',
        gate: { allow: [{ input: 'placeCard', card: 'neutral_tut_tabby', floor: 1 }] }, advance: { await: 'f4_p5' },
        text: 'Five Zoomies and one small mouse. Play a Tabby on the Cellar. She will Zoom with the others, and pay for it next round.' }),
      step('f4_spend2', { when: { on: 'afterPlay', play: 'f4_p5' }, target: 'card:neutral_tut_tabby', pose: 'point',
        gate: { allow: [{ input: 'placeCard', card: 'neutral_tut_tabby', floor: 1 }] }, advance: { await: 'f4_p6' },
        text: 'And another. The rest of the Zoomies will vanish at End Turn. Please do not look at them.' }),
      step('f4_end3', { when: { on: 'afterPlay', play: 'f4_p6' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f4_p7' }, text: 'End Turn.' }),
      step('f4_visitors', { when: { on: 'phaseEnd', phase: 'spawn', round: 3 }, target: 'gardenQueue', pose: 'wince',
        text: 'Night Visitors: a small extra wave at the end of the Witching Hour. Tonight, a mouse. And a vacuum, which I did not arrange and do not approve of.' }),

      step('f4_frazzled', { when: { on: 'roundStart', round: 4 }, target: 'status:B:frazzled', pose: 'point',
        text: 'Frazzled. Everyone who Zoomed hits 2 less this round: Biscuit, the Kitten and both Tabbies. That is the price of a free hit.' }),
      step('f4_vacuum', { when: { on: 'afterStep', step: 'f4_frazzled' }, target: 'pest:vac1', pose: 'wince',
        text: 'That is a vacuum. Large, Heavy, loud. Heavy means Knock moves it a floor less. Its first move is a Nudge on the front cat, and then it Sucks the whole floor. We will not let it get that far.' }),
      step('f4_swat1', { when: { on: 'afterStep', step: 'f4_vacuum' }, target: 'card:neutral_tut_swat', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_swat', target: 'vac1' }] }, advance: { await: 'f4_p8' },
        text: 'Swat the vacuum. It will not mind. It has no feelings, only a cord.' }),
      step('f4_end4', { when: { on: 'afterPlay', play: 'f4_p8' }, target: 'endTurn', pose: 'point',
        gate: { allow: [{ input: 'endTurn' }] }, advance: { await: 'f4_p9' }, text: 'End Turn.' }),
      step('f4_nudge', { when: { on: 'phaseEnd', phase: 'pest_attacks', round: 4 }, target: 'cat:B', pose: 'shrug', dim: false,
        text: 'One Nudge and a Nibble on Biscuit. Fine. He has fourteen health and no complaints on file.' }),

      step('f4_finish', { when: { on: 'roundStart', round: 5 }, target: 'pest:vac1', pose: 'point',
        text: 'Six health left on the vacuum, and the mouse behind it. One Swat on each, and the cats will see to the rest. After this, you know everything I know that is useful.' }),
      step('f4_swat2', { when: { on: 'afterStep', step: 'f4_finish' }, target: 'card:neutral_tut_swat', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_swat', target: 'vac1' }] }, advance: { await: 'f4_p10' },
        text: 'Swat the vacuum.' }),
      step('f4_swat3', { when: { on: 'afterPlay', play: 'f4_p10' }, target: 'card:neutral_tut_swat', pose: 'point',
        gate: { allow: [{ input: 'playCard', card: 'neutral_tut_swat', target: 'mouse3' }] }, advance: { await: 'f4_p11' },
        text: 'And the mouse.' }),
      step('f4_win', { when: { on: 'fightWon' }, pose: 'smile',
        text: 'Floors and cards, Knock, Nap, the Witching Hour and Nine Lives. That is the lot. The rest of the house is yours. The Sunbeam holds.' })
    ]
  };

  // ---------------------------------------------------------------------------------------------
  // THE GUIDED RUN: fight, map, fight, shop, fight, nook, fight, graduation.
  // ---------------------------------------------------------------------------------------------
  var flow = [
    { id: 'tf_1', type: 'fight', fight: 'tut_1_cellar', next: ['tf_2'] },
    { id: 'tf_2', type: 'rewardLite', fish: 60, text: 'Sixty Fish, found behind the radiator. Keep them. We are going shopping.', next: ['tf_3'] },
    { id: 'tf_3', type: 'map', guide: 'mapGuide', next: ['tf_4'] },
    { id: 'tf_4', type: 'fight', fight: 'tut_2_knock', next: ['tf_5'] },
    { id: 'tf_5', type: 'map', guide: 'mapGuide2', next: ['tf_6', 'tf_6b'] },
    { id: 'tf_6', type: 'shop', guide: 'shopGuide', next: ['tf_7'] },
    { id: 'tf_6b', type: 'nook', guide: 'nookGuide', next: ['tf_7'] },
    { id: 'tf_7', type: 'fight', fight: 'tut_3_nap', next: ['tf_8'] },
    { id: 'tf_8', type: 'fight', fight: 'tut_4_witching', next: ['tf_9'] },
    { id: 'tf_9', type: 'graduation', next: [] }
  ];

  // ---------------------------------------------------------------------------------------------
  // MAP LEARNING: two tiny maps. Only the tutorial's own scripted nodes exist.
  // Gating: only reachable nodes accept taps. The confirm sheet "Go here?" is the real one.
  // ---------------------------------------------------------------------------------------------
  var mapGuide = {
    id: 'mapGuide', title: 'Reading the House',
    map: { rows: 1, nodes: [{ id: 'm1', type: 'battle', row: 1, col: 2, next: [] }], current: null },
    steps: [
      step('map_hello', { when: { on: 'mapShown' }, target: 'mapPath', pose: 'smile',
        text: 'This is the map. Bottom is tonight, top is the boss. You can only walk along the dotted lines, one row at a time. Cats in general dislike being told where to go, so this is a first.' }),
      step('map_node', { when: { on: 'afterStep', step: 'map_hello' }, target: 'mapNode:m1', pose: 'point',
        gate: { allow: [{ input: 'tapNode', node: 'm1' }] }, advance: { await: 'enterNode' },
        text: 'The crossed claws mean a Battle. The node that pulses is the one you can reach. Tap it, then confirm. It will ask "Go here?" because it is polite.' }),
      step('map_legend', { when: { on: 'afterStep', step: 'map_node' }, target: 'mapLegend', pose: 'point', dim: false,
        text: 'The legend explains every icon. Long-press any node for a sentence of detail. Shops, Posts and Nooks are never on the first row, and Elites are never on the second.' })
    ]
  };
  var mapGuide2 = {
    id: 'mapGuide2', title: 'A Choice, Finally',
    map: { rows: 1, nodes: [
      { id: 'm2a', type: 'shop', row: 1, col: 1, next: [] },
      { id: 'm2b', type: 'nook', row: 1, col: 3, next: [] }], current: null },
    steps: [
      step('map2_hello', { when: { on: 'mapShown' }, target: 'mapPath', pose: 'smile',
        text: 'A fork. Two paths, one of which is a shop and the other a nap. In a real run the map is wider and the nodes are more worrying.' }),
      step('map2_pick', { when: { on: 'afterStep', step: 'map2_hello' }, target: 'mapNode:m2a', pose: 'point',
        gate: { allow: [{ input: 'tapNode', node: 'm2a' }, { input: 'tapNode', node: 'm2b' }] }, advance: { await: 'enterNode' },
        text: 'The raccoon is a Shop. The cushion is a Nap Nook, where you rest or knead something. Both are free of charge tonight and both lead to the same fight. I recommend the raccoon. He insists on it.' }),
      step('map2_plan', { when: { on: 'afterStep', step: 'map2_pick' }, target: 'topbarNight', pose: 'talk', dim: false,
        text: 'A tip for later: a path with four fights in it is a path with four chances to be wrong. Count your Fish before you commit.' })
    ]
  };

  // ---------------------------------------------------------------------------------------------
  // SHOP LEARNING: Gerald, 60 Fish, one card to buy, one service to see, then Leave.
  // Stock is described by rule (no ids): the engine picks the first common neutral card alphabetically.
  // ---------------------------------------------------------------------------------------------
  var shopGuide = {
    id: 'shopGuide', title: 'Gerald\'s Back Alley Bazaar',
    fish: 60,
    stock: [
      { kind: 'card', clan: 'neutral', rarity: 'common', pick: 'firstAlphabetical', price: 45 },
      { kind: 'card', clan: 'neutral', rarity: 'uncommon', pick: 'firstAlphabetical', price: 75 },
      { kind: 'service', id: 'shoo', price: 50, label: 'Shoo (remove a card)' }
    ],
    steps: [
      step('shop_hello', { when: { on: 'shopShown' }, target: 'shopGerald', pose: 'smile',
        text: 'That is Gerald. He is a raccoon in a trench coat who insists he is a tall cat. You will not correct him. Nobody does.' }),
      step('shop_fish', { when: { on: 'afterStep', step: 'shop_hello' }, target: 'shopFish', pose: 'point',
        text: 'These are your Fish. Sixty. Prices that you can afford are written in white. Prices you cannot are in red, and so is the feeling.' }),
      step('shop_cards', { when: { on: 'afterStep', step: 'shop_fish' }, target: 'shopCards', pose: 'point',
        gate: { allow: [{ input: 'buy', slot: 0 }, { input: 'inspect' }] }, advance: { await: 'buy' },
        text: 'A card for 45. Tap it to read it, then Buy. The other one costs 75, which is more than you have, so it is simply educational. A deck wants 24 to 32 cards. Quality, not quantity, but quantity is how you find quality.' }),
      step('shop_remove', { when: { on: 'afterStep', step: 'shop_cards' }, target: 'shopRemove', pose: 'shrug',
        gate: { allow: [{ input: 'inspect' }, { input: 'next' }] },
        text: 'Shoo removes a card from your deck. It costs 50 the first time and 25 more each time after. A thin deck is a sharp deck, but I will not make you do it tonight.' }),
      step('shop_leave', { when: { on: 'afterStep', step: 'shop_remove' }, target: 'shopLeave', pose: 'point',
        gate: { allow: [{ input: 'leave' }] }, advance: { await: 'leave' },
        text: 'Leave when you are done. Gerald will pretend not to mind. Also, he buys cards back for a few Fish. He says it is taking them off your paws.' })
    ]
  };

  var nookGuide = {
    id: 'nookGuide', title: 'The Nap Nook',
    steps: [
      step('nook_hello', { when: { on: 'nookShown' }, target: 'nookOptions', pose: 'smile',
        gate: { allow: [{ input: 'pickOption' }] }, advance: { await: 'pickOption' },
        text: 'The Nap Nook. Pick one: Curl Up heals the Sunbeam, Knead gives it a little more Warmth for good, Groom removes a card. All of them are better than a fight. Choose whichever you like. I will be here, not moving.' })
    ]
  };

  // ---------------------------------------------------------------------------------------------
  // SAFE-FAIL: the player can never lose, never be stuck, and never be punished for tutorial play.
  // ---------------------------------------------------------------------------------------------
  var safeFail = {
    summary: 'Four layers: a clamped Sunbeam, protected lives, a gate that blocks off-script input, and a rewind with a skip as the last resort.',
    layers: [
      { id: 'sf_gate', rule: 'Gating: only the input in the active step gate.allow is accepted. Everything else is blocked, the blocked control wiggles, and the Elder Cat repeats a short nudge line. Scripted hands and draws make every fight deterministic, so the script cannot drift.' },
      { id: 'sf_warmth', rule: 'Warmth floor: in tutorial fights Sunbeam Warmth cannot drop below 10. A hit that would go lower is reduced to land on 10 and the Elder Cat says warmthSave once per fight.', warmthFloor: 10 },
      { id: 'sf_lives', rule: 'Lives floor: a tutorial cat that would spend its last life instead stays at 1 life and the card is not lost. The only scripted life loss is the Kitten going 2 to 1 in fight 4.', livesFloor: 1 },
      { id: 'sf_stall', rule: 'Stall rescue: if a fight passes maxRounds (set per fight) the Elder Cat shoos the remaining pests out the cat flap and the fight is won. No retry.', trigger: 'round > fight.maxRounds' },
      { id: 'sf_rewind', rule: 'Rewind: if the engine would show a defeat in a tutorial fight, instead restore the checkpoint taken at the start of the current round and say rewind. Unlimited.', checkpoint: 'roundStart' },
      { id: 'sf_skip', rule: 'After 2 rewinds in one fight, or on the Skip button at any time, offer "Skip this lesson": the fight is marked won and the matching Cat Handbook entry unlocks.', rewindsBeforeSkipOffer: 2 }
    ],
    lines: {
      blocked: ['Not yet. I am getting to it.', 'Patience. The Sunbeam is not going anywhere. Hopefully.', 'Almost. That is a different button.'],
      warmthSave: 'That would have hurt. Fortunately I was standing in the way. Do not make a habit of it.',
      rewind: 'Let us take that again. Nobody saw. I was looking at the wall.',
      stallRescue: 'Right, that is quite enough. Out, all of you. The cat flap is that way.',
      skipOffer: 'We can skip this one. I will tell you the rest over tea.'
    }
  };

  // ---------------------------------------------------------------------------------------------
  // IN-RUN CONTEXTUAL TIPS: 30 rules. First time you see a status, a keyword, a node type.
  // Delivery: one small card with the Elder Cat, never during a scripted tutorial step, max 1 per round,
  // max 2 per fight, queued if more would fire. A tip fires once per profile (not per run). It is also
  // written into the Cat Handbook so it can be read again.
  // ---------------------------------------------------------------------------------------------
  var tips = [
    // ---- statuses (15) ----
    { id: 'tip_fluff', when: { kind: 'status', id: 'fluff', event: 'firstSeen' }, target: 'status:<ref>:fluff',
      title: 'Fluff', text: 'Fluff is armor. It soaks damage before health does, and it lasts until the fight ends. Cats are mostly fur and partly opinion.' },
    { id: 'tip_purr', when: { kind: 'status', id: 'purr', event: 'firstSeen' }, target: 'status:<ref>:purr',
      title: 'Purr', text: 'Purr heals the cats on its floor at Dusk, and bigger piles of it unlock auras. It fades by one each round. All good things do.' },
    { id: 'tip_claws', when: { kind: 'status', id: 'claws', event: 'firstSeen' }, target: 'status:<ref>:claws',
      title: 'Claws', text: 'Each Claw adds 1 damage to every hit that cat makes, for the whole fight. Getting Wet halves them, which is rude.' },
    { id: 'tip_hidden', when: { kind: 'status', id: 'hidden', event: 'firstSeen' }, target: 'status:<ref>:hidden',
      title: 'Hidden', text: 'A Hidden cat cannot be targeted, and it does not block either. A floor of hiding cats is an open staircase. Hide with intent.' },
    { id: 'tip_frenzy', when: { kind: 'status', id: 'frenzy', event: 'firstSeen' }, target: 'status:<ref>:frenzy',
      title: 'Frenzy', text: 'A Frenzied cat attacks extra times against random targets, and tires itself doing it. Impressive, brief, and not always aimed.' },
    { id: 'tip_catnip', when: { kind: 'status', id: 'catnip', event: 'firstSeen' }, target: 'status:<ref>:catnip',
      title: 'Catnip', text: 'Catnip builds toward a Surge: more Zoomies and stronger cats for a turn and a half. Then comes the Crash. Plan the Crash first.' },
    { id: 'tip_crash', when: { kind: 'status', id: 'crash', event: 'firstSeen' }, target: 'status:<ref>:crash',
      title: 'Crash', text: 'Crash is the bill for a Surge. Fewer Zoomies, fewer cards, and cats that nap whether they planned to or not. The floor is the cure.' },
    { id: 'tip_rage', when: { kind: 'status', id: 'rage', event: 'firstSeen' }, target: 'status:<ref>:rage',
      title: 'Rage', text: 'Rage makes a pest hit harder, one point per stack. Enthusiasm is the usual cause. A calm floor with plenty of Purr cools it down.' },
    { id: 'tip_wet', when: { kind: 'status', id: 'wet', event: 'firstSeen' }, target: 'status:<ref>:wet',
      title: 'Wet', text: 'A wet cat cannot gain new Fluff, loses half its Claws and Purr, and will not Rest. Dry it off. A sunny Attic helps.' },
    { id: 'tip_scared', when: { kind: 'status', id: 'scared', event: 'firstSeen' }, target: 'status:<ref>:scared',
      title: 'Scared', text: 'A Scared cat cannot attack and loses its Purr. A Scared pest skips its turn and retreats a floor. Cucumbers are involved more often than you would think.' },
    { id: 'tip_yarn', when: { kind: 'status', id: 'yarn', event: 'firstSeen' }, target: 'status:<ref>:yarn',
      title: 'Yarn', text: 'A pest with Yarn cannot climb. It can still bite whatever is in front of it. Bosses only get half the length.' },
    { id: 'tip_marked', when: { kind: 'status', id: 'marked', event: 'firstSeen' }, target: 'status:<ref>:marked',
      title: 'Marked', text: 'A Marked pest takes 50 percent more damage from every cat, and killing it can return a Zoomies. It cannot be unmarked. It has been chosen.' },
    { id: 'tip_hiss', when: { kind: 'status', id: 'hiss', event: 'firstSeen' }, target: 'status:<ref>:hiss',
      title: 'Hiss', text: 'Hiss takes damage off every attack that pest makes, per stack, and fades each Dusk. A good Hiss is a warning with numbers.' },
    { id: 'tip_dizzy', when: { kind: 'status', id: 'dizzy', event: 'firstSeen' }, target: 'status:<ref>:dizzy',
      title: 'Dizzy', text: 'Dizzy hurts a little at Dusk, and a Dizzy pest may swing at its neighbor by mistake. Knocking a pest off a shelf is the usual cause.' },
    { id: 'tip_hairball', when: { kind: 'status', id: 'hairball', event: 'firstSeen' }, target: 'status:<ref>:hairball',
      title: 'Hairball', text: 'A Hairball on a pest hurts it at Dusk and then fades by half. A Hairball in your hand is a card, and you may hold six. Please do not hold six.' },

    // ---- node types (8) ----
    { id: 'tip_node_event', when: { kind: 'node', id: 'event', event: 'firstEntered' }, target: null,
      title: 'Events', text: 'Events are small stories with a choice at the end. The cost is shown before you commit. An event will never take your Warmth below 1. It is not that sort of house.' },
    { id: 'tip_node_post', when: { kind: 'node', id: 'post', event: 'firstEntered' }, target: null,
      title: 'Scratching Post', text: 'Pick one card to upgrade. You can see before and after. Champion upgrades come from the Night rewards, not here. The post is for everybody else.' },
    { id: 'tip_node_nook', when: { kind: 'node', id: 'nook', event: 'firstEntered' }, target: 'nookOptions',
      title: 'Nap Nook', text: 'Pick one: Curl Up to heal, Knead for a little permanent Warmth, or Groom to remove a card. The pre-boss row is the best time to rest.' },
    { id: 'tip_node_treasure', when: { kind: 'node', id: 'treasure', event: 'firstEntered' }, target: null,
      title: 'Treasure', text: 'A cardboard box. Open it for a relic, or sit in it for Warmth and Fish. Yes, sitting counts as a strategy. No, it is not a bad one.' },
    { id: 'tip_node_mystery', when: { kind: 'node', id: 'mystery', event: 'firstEntered' }, target: null,
      title: 'Mystery', text: 'Mystery resolves the moment you arrive. It might be a fight, a shop or a story. It is never boring, which is a different thing from being kind.' },
    { id: 'tip_node_elite', when: { kind: 'node', id: 'elite', event: 'firstEntered' }, target: null,
      title: 'Elite', text: 'Elites are harder and always drop a relic. Check your Warmth and your lives before you step in. Courage is good. Courage plus a full tank is better.' },
    { id: 'tip_node_night', when: { kind: 'node', id: 'night_battle', event: 'firstEntered' }, target: 'nightClock',
      title: 'Night Battle', text: 'Night battles carry a Night Omen, a rule for the whole fight, shown before it begins. The Witching Hour is on, so mind the moon dial.' },
    { id: 'tip_node_boss', when: { kind: 'node', id: 'boss', event: 'firstEntered' }, target: null,
      title: 'Boss', text: 'A boss. It is Heavy or Anchored, so Knock barely moves it, and it has a pattern you can learn. The Sunbeam gets 5 more Warmth if you win. This is encouraging.' },

    // ---- keywords, traits and rules (7) ----
    { id: 'tip_pounce', when: { kind: 'keyword', id: 'pounce', event: 'firstSeenOnCard' }, target: 'card:<id>',
      title: 'Pounce', text: 'Pounce N means the cat attacks once the moment it arrives, for Power plus N, on the front pest of its floor. Nothing there, nothing happens.' },
    { id: 'tip_reborn', when: { kind: 'keyword', id: 'reborn', event: 'firstSeenOnCard' }, target: 'card:<id>',
      title: 'Reborn', text: 'A cat with Reborn returns to your hand when it dies, instead of the discard pile. It still spends a life. Reborn is not free. Nothing in this house is.' },
    { id: 'tip_exhaust', when: { kind: 'keyword', id: 'exhaust', event: 'firstSeenOnCard' }, target: 'card:<id>',
      title: 'Exhaust', text: 'An Exhausted card leaves the fight for good once played, and comes back in your next one. Not a loss, only a rest. Exhausted lives are not spent lives.' },
    { id: 'tip_climber', when: { kind: 'trait', id: 'Climber', event: 'firstSeenOnPest' }, target: 'pest:<ref>',
      title: 'Climber', text: 'Climbers ignore the rule that cats are walls and head up the stairs every round if there is room. Knock them, tangle them, or kill them quickly.' },
    { id: 'tip_heavy', when: { kind: 'trait', id: 'Heavy', event: 'firstSeenOnPest' }, target: 'pest:<ref>',
      title: 'Heavy', text: 'Heavy pests fall one floor less when Knocked. Bosses are Heavy or Anchored, and Anchored ones do not move at all. Respect the furniture.' },
    { id: 'tip_cuddle', when: { kind: 'rule', id: 'cuddle_pile', event: 'firstFormed' }, target: 'floor:<n>',
      title: 'Cuddle Pile', text: 'Two or more cats in neighboring slots form a Pile and each gets a damage bonus. Three or more also heal. Killing a middle cat splits the Pile. Seat them like family.' },
    { id: 'tip_lastlife', when: { kind: 'rule', id: 'last_life', event: 'firstOnLastLife' }, target: 'lives:<ref>',
      title: 'Last Life', text: 'That cat is on its last life. If it falls, the card is replaced by an Empty Collar. Cornered gives it +2 Attack. Keep it behind a wall, or let it make a point.' }
  ];

  var tipKinds = {
    status: 'fires the first time a unit anywhere on the board gets this status id',
    node: 'fires when the player confirms entry to this node type for the first time',
    keyword: 'fires the first time a card with this keyword is shown in hand, reward or shop',
    trait: 'fires the first time a pest with this trait appears on the board',
    rule: 'fires on a named engine event: cuddle_pile firstFormed, last_life firstOnLastLife'
  };
  var tipDelivery = {
    maxPerRound: 1, maxPerFight: 2, queueOverflow: true, onceKey: 'profile.tipsSeen',
    suppress: ['scriptedTutorialStep', 'witchingHourAnnouncement', 'bannerOnScreen'],
    settingsToggle: 'tips.enabled', handbookCopy: true, skipTutorialBehaviour: 'tips still fire in the first real run'
  };

  // ---------------------------------------------------------------------------------------------
  // Public table
  // ---------------------------------------------------------------------------------------------
  return {
    version: 1,
    mentor: { id: 'elder_cat', name: 'The Elder Cat', genome: 'fixed', accessory: 'spectacles',
      voice: 'warm, dry, never in a hurry, at most one exclamation mark on a screen and only on a win' },
    cards: cards,
    enemies: enemies,
    targets: targets,
    fights: [fight1, fight2, fight3, fight4],
    flow: flow,
    mapGuide: mapGuide,
    mapGuide2: mapGuide2,
    shopGuide: shopGuide,
    nookGuide: nookGuide,
    safeFail: safeFail,
    gating: {
      inputs: {
        next: 'Press the Next button on the bubble',
        placeCard: '{ input, card, floor, pos? } drag or tap-tap a unit card to a floor',
        playCard: '{ input, card, target } cast a spell on a pest or cat ref',
        toggleNap: '{ input, unit, to } the Z button on a cat',
        endTurn: '{ input } the End Turn button',
        tapNode: '{ input, node } a map node', buy: '{ input, slot }', leave: '{ input }',
        pickOption: '{ input } any Nap Nook option', inspect: '{ input } long-press or tap to read'
      },
      always: ['openSettings', 'readCardDetail', 'openPileViewer'],
      neverBlocked: ['pause', 'skipTutorial'],
      blockedFeedback: 'wiggle the control, play safeFail.lines.blocked, do not consume Zoomies'
    },
    skip: {
      button: 'Skip lesson (bottom of the Elder Cat bubble). Always visible, never nagging.',
      wholeTutorial: 'Settings, Tutorial, "I know this". Unlocks all 4 Handbook entries and goes to Run Setup.',
      replay: 'Settings, Tutorial, "Replay the lessons". Replays any single fight.',
      handbook: ['hb_floors_cards', 'hb_knock', 'hb_nap', 'hb_witching_lives']
    },
    triggerKinds: {
      fightStart: 'once, after Setup',
      roundStart: '{ round } after the Draw phase and any scripted Zoom',
      afterStep: '{ step } when that step has completed',
      afterPlay: '{ play } right after that scripted play resolves and its trigger queue drains',
      phaseEnd: '{ phase, round } phase names: cat_attacks, pest_attacks, spawn, dusk',
      fightWon: 'after the win check',
      mapShown: 'map screen visible', shopShown: 'shop screen visible', nookShown: 'nook screen visible'
    },
    tips: tips,
    tipKinds: tipKinds,
    tipDelivery: tipDelivery
  };
})();
