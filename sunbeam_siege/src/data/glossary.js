/*
 * SUNBEAM SIEGE glossary.js (agent B22): the CANONICAL GLOSSARY and the CANONICAL RULE CONSTANTS.
 *
 * Exports (classic script, no modules):
 *   SB.data.glossary       array of entries
 *   SB.data.glossaryIndex  lookup object, lowercased name / ref / alias -> entry (built at load)
 *   SB.data.glossaryIcons  array of icon ids used here, with an `a08` flag (true = already named in A08 section 8.5)
 *   SB.data.rules          flat object of every number in RULES.md and the docs
 *
 * Entry shape:
 *   id       'gl_<ref>' unique across the game
 *   ref      the engine id (status id, keyword key, trait name). Look up by ref with SB.data.glossaryIndex[ref]
 *   name     display name, Title Case
 *   category keyword | status | trait | tag | twist | intent | resource | upgrade
 *   icon     icon id for Pawprint.icon (see SB.data.glossaryIcons)
 *   tooltip  one line, under 90 chars, plain language
 *   text     long text, under 300 chars, the exact rule
 *   aside    a funny one-liner for the codex
 *   aliases  old or alternate names from A02 to A06 that must resolve to this entry
 *   Statuses also carry: kind ('I' intensity, 'D' duration, 'ID' decaying intensity), max, side, tone (buff|debuff|neutral).
 *
 * RULES.md wins every conflict. B22-glossary.md lists each resolution and the open engine questions.
 * Phase name map (A04 names to RULES names): DAWN = Draw, POUNCE = Cat Attacks, PROWL = Pest Attacks,
 * CLIMB = Pest Advance, DUSK = Dusk tick. There is no separate Dawn phase.
 *
 * NEEDS: none. Every term here is either in the docs or has a flagged resolution in B22-glossary.md.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

SB.data.glossary = [];
(function () {
  var L = SB.data.glossary;
  function G(ref, name, category, icon, tooltip, text, aside, extra) {
    var e = { id: 'gl_' + ref, ref: ref, name: name, category: category, icon: icon,
              tooltip: tooltip, text: text, aside: aside, aliases: [] };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k]; } }
    L.push(e);
  }

  /* ---------------------------------------------------------------- STATUSES */
  G('claws', 'Claws', 'status', 'claw',
    '+1 damage per stack on every hit this cat makes.',
    'Intensity. Each stack adds 1 flat damage to every hit, before percent bonuses. Lasts the whole battle. Halved (round down) when the cat becomes Wet. Max 30. Cats only. Pests use Rage instead.',
    'Not a weapon. A hobby that got out of hand.',
    { kind: 'I', max: 30, side: ['cat'], tone: 'buff' });

  G('fluff', 'Fluff', 'status', 'cloud',
    'Armor. Soaks 1 damage per stack before Health. Lasts the whole fight.',
    'Intensity. Absorbs 1 damage per stack after Hiss and before Health. Does not decay during a battle and is cleared when it ends. Shatter ignores it. Wet blocks new Fluff. Max 50. Pests may hold it (called Armor or Hide in UI only if needed).',
    'Every cat is 40 percent fur and 60 percent opinion.',
    { kind: 'I', max: 50, side: ['cat', 'pest'], tone: 'buff', aliases: ['armor', 'hide', 'thick fur'] });

  G('purr', 'Purr', 'status', 'purr-heart',
    'Floor warmth. Heals cats on the floor at Dusk, fades 1 per round.',
    'Intensity on a floor, max 40, decays 1 per round. At Dusk each cat there heals, and the floor earns bonuses at 5, 10, 20, 30 and 40. Purr N on a unit adds N Purr to its floor at End Turn. Purr never restores Lives.',
    'A small engine of contentment. Do not look under the hood.',
    { kind: 'ID', max: 40, side: ['floor'], tone: 'buff' });

  G('rested', 'Rested', 'status', 'closed-eye',
    'Built by napping. Spent on waking for a big Stretch attack.',
    'Intensity, max 4 (relics raise to 6). A napping cat gains 1 each Dusk. On waking it Stretches for +3 damage per stack (cap +18). Damage while asleep removes it. Wet cats cannot gain it.',
    'Sixteen hours a day, and the other eight are for planning.',
    { kind: 'I', max: 4, side: ['cat'], tone: 'buff' });

  G('hidden', 'Hidden', 'status', 'peek-box',
    'Cannot be targeted and does not block. Ends when it attacks or is hurt.',
    'State, no timer. Pests cannot target a Hidden cat and it does not count as a blocker for the Hold rule, so an all Hidden floor lets pests climb. It ends when the cat attacks or takes damage. Area effects still hit. Tracker pests ignore it.',
    'If it fits, I sits. If I sits, you cannot see me. Science.',
    { kind: 'D', max: 1, side: ['cat'], tone: 'neutral' });

  G('bristle', 'Bristle', 'status', 'spiky-tail',
    'Hurts melee attackers by this many points after Fluff is gone.',
    'Intensity, max 15. When this unit loses Health to a melee attack, the attacker takes Bristle damage, ignoring Fluff. Bristle cannot trigger Bristle. Dizzy and Hairball damage do not trigger it. Wet removes it.',
    'A threat display. The threat is mostly dignity.',
    { kind: 'I', max: 15, side: ['cat', 'pest'], tone: 'buff', aliases: ['thorns'] });

  G('frenzy', 'Frenzy', 'status', 'spark-eye',
    'Attacks Frenzy+1 times per round, hurting itself on the extras.',
    'Decaying intensity, max 5. The cat attacks Frenzy+1 times at random valid targets on its floor and takes 1 damage per extra hit. Each hit adds Claws. Doubles at the start of a Witching Hour round. Loses 1 at Dusk. Dizzy removes it.',
    '3 AM. Why is it always 3 AM?',
    { kind: 'ID', max: 5, side: ['cat'], tone: 'buff' });

  G('rage', 'Rage', 'status', 'angry-brow',
    'Pest only. +1 damage per stack. At 5 or more it grows its own Fluff.',
    'Intensity, max 20. Adds 1 flat damage per stack to pest attacks. At 5 or more the pest gains Fluff equal to its Rage at the start of each round. Gains 1 if it attacked nothing. Floor Purr of 10 or more strips 1 per Dusk. Hiss 3 or more blocks gains.',
    'Dogs are not angry. They are enthusiastic in a way that hurts.',
    { kind: 'I', max: 20, side: ['pest'], tone: 'buff' });

  G('wet', 'Wet', 'status', 'frown-drop',
    'Halves Claws, blocks Fluff and Bristle gain, no Rested or Hidden.',
    'Duration, max 6, loses 1 per Dusk. On a cat: Claws halved when applied, no new Fluff, Bristle removed, cannot gain Rested or Hidden. On a pest: counts as Light and takes +50 percent Shatter. Dried by Heat Lamp or Lick Fur.',
    'Cats are 70 percent water and 100 percent against it.',
    { kind: 'D', max: 6, side: ['cat', 'pest', 'floor'], tone: 'debuff' });

  G('scared', 'Scared', 'status', 'ghost-fur',
    'Cat cannot attack. Pest skips its action and retreats a floor.',
    'Duration, max 3, loses 1 per Dusk. A Scared cat cannot attack. A Scared pest skips its action and moves down one floor instead of climbing, even if Yarned, and takes Shatter. Bosses are immune. Hiss 2 or more on a pest gives Scared 1 once per round.',
    'It was a cucumber. It was ALWAYS a cucumber.',
    { kind: 'D', max: 3, side: ['cat', 'pest'], tone: 'debuff' });

  G('dizzy', 'Dizzy', 'status', 'swirl',
    'Takes damage each Dusk and may bite its neighbours.',
    'Decaying intensity. At Dusk the holder takes damage equal to its stacks, then loses 1. Each stack gives a 25 percent chance (max 75) that its attack hits a random neighbour instead. Max 20 on pests, 5 on cats. Elites ignore stacks above 3. Knock landings give 1.',
    'The room is moving. The room has no right.',
    { kind: 'ID', max: 20, side: ['pest', 'cat'], tone: 'debuff', aliases: ['dazed'] });

  G('frazzled', 'Frazzled', 'status', 'static-hair',
    '-2 Attack next round (never below 1).',
    'Duration. The unit has -2 Attack for one round, minimum 1. Cats that Zoomed in a Witching Hour become Frazzled next round. Some pests (spiders) apply it with webs. Boxed and napping cats skip it.',
    'The zoomies were free. The invoice arrives in the morning.',
    { kind: 'D', max: 2, side: ['cat'], tone: 'debuff' });

  G('hiss', 'Hiss', 'status', 'fang-mouth',
    'Pest only. Its attacks deal this much less damage.',
    'Decaying intensity, max 10, loses 1 per Dusk. Subtracts flat damage from that pest\'s attacks after percent bonuses and before Fluff, minimum 0. At 2 or more the pest gets Scared 1 (once per round). At 3 or more it cannot gain Rage.',
    'A warning. The warning was loud.',
    { kind: 'ID', max: 10, side: ['pest'], tone: 'buff', aliases: ['hissed'] });

  G('yarn', 'Yarn', 'status', 'yarn-ball',
    'Pest skips its action and its climb this round, then loses 1 Yarn.',
    'Duration, max 4. A Yarned pest skips its attack and its climb, then Yarn drops by 1 at Dusk. Bosses take half the Yarn duration (round up). Hard cap 4. Summoned pests arrive with Yarn 1.',
    'Entirely unnecessary. Absolutely effective.',
    { kind: 'D', max: 4, side: ['pest'], tone: 'debuff', aliases: ['tangled', 'tangle'] });

  G('marked', 'Marked', 'status', 'crosshair',
    'Pest takes +50% damage from cats. Kills pay out.',
    'Intensity, max 5, counts as a single +50 percent no matter the stacks (cards may scale per stack). A cat that kills a Marked pest gains 1 Claws, and the first such kill each round refunds 1 Zoomies. Only death removes it. Nothing is immune.',
    'It does not know it has been chosen. That is the fun part.',
    { kind: 'I', max: 5, side: ['pest'], tone: 'debuff' });

  G('hairball', 'Hairball', 'status', 'tumbleweed',
    'Pest takes this much damage at Dusk, then keeps half.',
    'Intensity, max 15. At Dusk the pest takes Hairball damage, then loses half (round down). At 5 or more it is Gagging and cannot gain Rage. A Wet pest spreads half to neighbours. The Hairball card (cost 0, exhaust) applies 3. Max 6 Hairballs in hand.',
    'Delivered, as always, at 4 AM, to the exact center of the rug.',
    { kind: 'I', max: 15, side: ['pest', 'cat'], tone: 'debuff' });

  G('leashed', 'Leashed', 'status', 'leash',
    'Pest. While a Dog Walker is on the board, Knock does nothing to it.',
    'Pest status. Knock effects on a Leashed pest fail while a Dog Walker is on the board. Removed when the walker dies. Used by the dog roster.',
    'Not a restraint. A strongly worded suggestion.',
    { kind: 'I', max: 1, side: ['pest'], tone: 'buff' });

  G('groomed_ruined', 'Groomed Ruined', 'status', 'bad-hair',
    'Pest. Cannot gain Fluff for the rest of the fight.',
    'Pest status set once per fight when the Poodle drops below half Health. It blocks that pest from gaining Fluff. Does not wear off.',
    'Appointment cancelled. Dignity forfeited.',
    { kind: 'I', max: 1, side: ['pest'], tone: 'debuff' });

  G('puddle', 'Puddle', 'status', 'puddle',
    'Floor. Cats here gain Wet each Dusk. Pests here are Wet.',
    'Floor status. At Dusk every cat on the floor gains Wet 1. Pests on it count as Wet. It dries 1 per Dusk, or at once under a Heat Lamp. A floor holds up to 2 floor statuses.',
    'Nobody knows where it came from. Everybody knows who was near it.',
    { kind: 'D', max: 3, side: ['floor'], tone: 'debuff' });

  G('heat_lamp', 'Heat Lamp', 'status', 'lamp',
    'Floor. Dries Wet 2 per Dusk. Naps here give +1 Rested.',
    'Floor status, Attic by default (the Sunbeam patch). Dries Wet by 2 per Dusk and removes Puddle. A cat that naps on this floor gains 1 extra Rested.',
    'Technically a hazard. Practically a throne.',
    { kind: 'I', max: 1, side: ['floor'], tone: 'buff', aliases: ['sunbeam patch'] });

  /* ---------------------------------------------------------------- CARD KEYWORDS */
  G('exhaust', 'Exhaust', 'keyword', 'ash-card',
    'Leaves the deck for this fight once played.',
    'When played, goes to the Exhaust pile instead of discard. A unit with Exhaust goes there when it dies (it still spends a life if it has them). Exhaust never costs lives. Cannot combine with Reborn. All cards return after the fight.',
    'Gone for the night. Back by breakfast.',
    {});

  G('fleeting', 'Fleeting', 'keyword', 'wisp',
    'Exhausted if still in hand at End Turn.',
    'If this card is still in your hand at End Turn it is exhausted. Playing it normally sends it to discard. Cannot combine with Retain or Innate.',
    'Use it or lose it. Cats understand this about chairs.',
    {});

  G('retain', 'Retain', 'keyword', 'pin',
    'Stays in hand at End Turn.',
    'Not discarded at End Turn. Cost reductions on it persist. Retained cards still count toward the hand limit of 10. Cannot combine with Fleeting.',
    'Held onto, like a grudge.',
    { aliases: ['keep'] });

  G('innate', 'Innate', 'keyword', 'star',
    'Starts in your opening hand.',
    'Starts each fight in your opening hand. It counts toward the first 5 cards drawn. If there are more Innate cards than 5, all of them are drawn up to the hand limit.',
    'Showed up early. Is insufferable about it.',
    {});

  G('unplayable', 'Unplayable', 'keyword', 'lock',
    'Cannot be played. Still clogs your hand.',
    'Cannot be played. It can still be discarded, exhausted or retained by effects, and it draws normally. Curses carry this.',
    'The cat declined to be involved.',
    {});

  G('reborn', 'Reborn', 'keyword', 'phoenix-paw',
    'When this cat spends a life and dies, it returns to your hand.',
    'When this unit dies with lives remaining it returns to your hand instead of the discard pile (discard if the hand is full). It still spends the life. Cannot combine with Exhaust.',
    'Landed on its feet. Again. It is getting smug.',
    { aliases: ['landing'] });

  G('pounce', 'Pounce', 'keyword', 'leap',
    'On deploy, attacks once now for Power + N at the front pest.',
    'Pounce N, units only. When deployed, before any pest acts, it attacks once at the front pest on its floor for Power + N. Nothing happens if the floor has no pest. Pounce is only this keyword. A napping cat\'s wake attack is a Stretch.',
    'Arrives mid-sentence. Leaves everyone else mid-sentence.',
    {});

  G('knock', 'Knock', 'keyword', 'down-arrow',
    'Pushes a pest down N floors. It takes Shatter and loses its climb.',
    'Knock N moves a pest down N floors (see Knock It Off). It takes 2 Shatter per floor fallen, other pests on the landing floor take 2, it loses its climb this round and gains Dizzy 1. A pest moves once per round. A full landing floor makes the push fail.',
    'Maintains eye contact throughout.',
    {});

  G('knead', 'Knead', 'keyword', 'kneading-paws',
    'Gains a permanent bonus every time its trigger happens.',
    'Knead N: each time the card does what its text says (default: when played), it permanently gains +N to Attack, Health or value. Max 12 per card, 20 for Champions. Gold numbers show the gains. Halved when the card is transformed.',
    'Biscuits are being made. There is no flour.',
    {});

  G('rage_bait', 'Rage-bait', 'keyword', 'bait-fish',
    'Awake pests on this floor must target this cat. It gains Claws when hurt.',
    'Rage-bait N, Alley units. While awake, pests on this floor must target this cat. Each time it takes damage it gains N Claws. Ignored by Sneaky pests hitting the Sunbeam. Hidden removes it.',
    'Started it. Will finish it. Will bring snacks.',
    { aliases: ['ragebait'] });

  G('ambush', 'Ambush', 'keyword', 'ambush-eye',
    'First hit of the fight deals double damage.',
    'Ambush: this unit\'s first hit each fight deals double damage (counted as a percent bonus). It is separate from being Hidden. Some upgrades let it reset on a kill.',
    'Patience is just violence on a delay.',
    {});

  G('decoy', 'Decoy', 'keyword', 'target-paw',
    'Pests that pick a target on this floor must pick a Decoy.',
    'If any cat on a floor has Decoy, front, random, weakest and strongest picks by pests are limited to Decoy cats. Pick "all" ignores it. Replaces the older term Taunt.',
    'Volunteered. Nobody asked it to.',
    { aliases: ['taunt'] });

  G('cleanse', 'Cleanse', 'keyword', 'sparkle',
    'Removes all debuffs from a cat.',
    'Cleanse removes every debuff from a cat. It does not remove Marked. It also pulls attached parasites off the cat. Purge is the pest version: it removes buffs from a pest.',
    'A bath, but with consent.',
    {});

  G('purge', 'Purge', 'keyword', 'broom',
    'Removes all buffs from a pest.',
    'Purge removes every buff from a pest (Rage, Fluff, Bristle and so on). It does not remove Marked.',
    'Rude, efficient, and fully deserved.',
    {});

  G('echo', 'Echo', 'keyword', 'echo-rings',
    'The first play each fight is repeated for free.',
    'Echo N: the first time each fight this card is played, it is played again for free. Granted by Scratching Post upgrades.',
    'Say it twice. Louder the second time.',
    {});

  G('multistrike', 'Multistrike', 'keyword', 'double-claw',
    'This cat strikes N times per attack phase.',
    'Multistrike N: the cat attacks N times in Cat Attacks. Each hit picks its target again and resolves fully, including deaths, before the next. Hiss, Fluff and Claws apply per hit.',
    'Why scratch once when you can hold a grudge twice.',
    {});

  /* ---------------------------------------------------------------- TWISTS AND RULE TERMS */
  G('nine_lives', 'Nine Lives', 'twist', 'nine-pips',
    'Cats spend a life to die. Lives last the whole run.',
    'Every cat card keeps its Lives for the run: Kitten 2, standard 3, Large 4, Champion 9, hard cap 9. A cat that dies in combat spends 1 life and goes to discard (hand with Reborn). On its last life it is lost and an Empty Collar takes its place.',
    'Nine lives. Eleven opinions about each one.',
    { aliases: ['lives', 'life'] });

  G('spend_a_life', 'Spend a Life', 'twist', 'paw-minus',
    'A voluntary cost: pay 1 life, the cat stays on the board.',
    'Lives minus 1, the cat stays in play. Cannot be paid with a cat\'s last life. Exhaust and sacrifice never cost lives. Only damage deaths and "lose a life" effects do.',
    'Buying a favor with a debt it did not agree to.',
    {});

  G('cornered', 'Cornered', 'twist', 'red-eyes',
    'A cat on its last life gets +2 Attack.',
    'Automatic. A cat with exactly 1 life left (and a max of 2 or more) gets +2 Attack and a red glow. It is also one death from being lost for the run.',
    'Cornered cats are not afraid. They are paperwork.',
    {});

  G('last_gasp', 'Last Gasp', 'twist', 'dying-star',
    'Triggers when this cat spends a life.',
    'A trigger that fires on the board slot where a cat spent a life, before the card moves. It fires for lives spent by damage or "lose a life", and also on the last life. It does not fire for Exhaust.',
    'A dramatic exit. Always a dramatic exit.',
    {});

  G('empty_collar', 'Empty Collar', 'twist', 'collar',
    'What is left when a cat\'s last life goes.',
    'A 0 cost token card that gains 1 Zoomies and exhausts. It replaces a lost cat in the deck for the run. It cannot be upgraded and can be removed like any card.',
    'It fits. The cat does not say goodbye. It never does.',
    {});

  G('long_nap', 'The Long Nap', 'twist', 'moon-z',
    'A Champion at 0 lives sits out until the next Act.',
    'Champions are never deleted. At 0 lives the Champion leaves the deck until the next Act begins, then returns with 3 lives.',
    'Resting. Not retired. Do not use that word.',
    {});

  G('knock_it_off', 'Knock It Off', 'twist', 'falling-vase',
    'Push pests down floors for delay and Shatter damage.',
    'Knock N pushes a pest N floors down. 2 Shatter per floor fallen, 2 to every pest it lands among, no climb this round, Dizzy 1 on landing. From the Cellar: 3 Shatter and out the cat flap to the Garden queue. Light falls 1 further, Heavy 1 less, Anchored stays. Once per pest per round.',
    'Not an accident. Never an accident.',
    {});

  G('shatter', 'Shatter', 'twist', 'broken-vase',
    'Falling damage. Ignores Fluff.',
    'A damage type from falls and breakage. It ignores Fluff and cannot be weakened. Wet pests take +50 percent. Slippery pests take double.',
    'Aunt Marge\'s vase. Priceless. Now free.',
    {});

  G('cat_flap', 'Cat Flap', 'twist', 'flap-door',
    'Knocked out of the Cellar, a pest returns at the next Spawn.',
    'A pest Knocked from the Cellar takes 3 Shatter. If it survives it goes to the front of the Garden queue and re-enters at the next Spawn, before waves.',
    'A one-way door that swings both ways, somehow.',
    {});

  G('nap', 'Nap', 'twist', 'z-toggle',
    'Toggle a cat to sleep. It heals and stores Rested for later.',
    'Toggle on any cat except the turn it is played. A napping cat does not attack. At Dusk it heals 2 and gains Rested 1 (max 4). Waking it unleashes a Stretch. Damage while asleep is a Rude Awakening. It still blocks and can be hit.',
    'Productivity is a human invention.',
    { aliases: ['napping'] });

  G('stretch', 'Stretch', 'twist', 'stretch-cat',
    'The wake-up attack: +3 damage per Rested stack, up to +18.',
    'When a napping cat wakes it attacks with +3 damage per Rested stack (cap +18). It then spends the Rested and gains +1 Attack for the battle per 2 stacks spent. Not called Pounce.',
    'Worth the wait. Lethal for the rat.',
    {});

  G('rude_awakening', 'Rude Awakening', 'twist', 'alarm-bang',
    'Hurt while asleep: lose Rested, gain +2 Attack this turn.',
    'If a napping cat takes damage it wakes up and loses its Rested. It gains +2 Attack for that turn. A Do Not Disturb sign relic can prevent it once per battle.',
    'Whoever did this is about to learn something.',
    {});

  G('witching_hour', 'Witching Hour', 'twist', 'clock-moon',
    'Every 3rd round. More Zoomies and cards, free hits, then a hangover.',
    'Rounds 3, 6, 9 and so on, announced a round early, never twice in a row. +2 Zoomies (5), +1 draw (6). Awake, non Boxed cats Zoom and are Frazzled next round. Night Visitors spawn at its end. Off in tutorial fights.',
    'It is 3 AM. The cat has decided. You may only observe.',
    { aliases: ['night clock', '3am', 'zoomies turn'] });

  G('zoom', 'Zoom', 'twist', 'streak',
    'A free half damage hit on a random pest, on any floor.',
    'In a Witching Hour round, every awake, non Boxed cat Zooms once: a free hit for half its Attack (round up) on a random pest on any floor, using the battle RNG. Napping and Boxed cats do not Zoom.',
    'Runs into a wall. Takes credit.',
    {});

  G('night_visitors', 'Night Visitors', 'twist', 'moon-wave',
    'A small extra wave that arrives at the end of a Witching Hour.',
    'A wave worth about 25 percent of a normal wave\'s threat, spawned in the Spawn phase of a Witching Hour round. Drawn from pests flagged as Night Visitors.',
    'Nobody invited them. They brought snacks anyway.',
    { aliases: ['night visitor'] });

  G('box', 'Box', 'twist', 'box',
    'A room item. A cat inside is Hidden and gains +1 Power.',
    'A Box uses one of a floor\'s 2 room slots (max 2 Boxes per floor). It holds 1 cat (Big Box 2). Large cats do not fit. A boxed cat gets +1 Power and is Hidden until it attacks or takes damage. Boxes wear down and become a Flat Pack card.',
    'If it fits, I sits.',
    { aliases: ['boxes', 'boxed', 'cardboard box'] });

  G('flat_pack', 'Flat Pack', 'twist', 'flat-box',
    'What a worn out Box becomes. Play it to make a new Box.',
    'When a Box loses its last durability it is Flattened: its cats pop out and a Flat Pack card (cost 1, exhaust, place a Cardboard Box on a floor) goes to discard.',
    'Assembly required. Cat optional.',
    {});

  G('cuddle_pile', 'Cuddle Pile', 'twist', 'cat-pile',
    '2 or more cats side by side. Each gets Snug.',
    'A Pile is 2 or more cats in consecutive slots on one floor. Each gets +floor(P/2) Attack where P is the Pile size. A Pile of 3 or more heals each member 1 per round. Napping and Boxed cats count. Killing a middle cat splits it.',
    'Nobody knows where one cat ends. Nobody has checked.',
    { aliases: ['pile', 'cozy'] });

  G('snug', 'Snug', 'twist', 'warm-heart',
    'The bonus a cat gets while in a Pile.',
    'The Pile bonus on each member, recomputed live: Attack bonus, plus healing at Pile 3. A cat that Zoomed in a Witching Hour loses Snug for a round.',
    'Warm bodies. Mixed loyalties.',
    {});

  G('heap', 'Heap', 'twist', 'big-pile',
    'A Pile of 4. Members also gain +2 Fluff each round.',
    'A Pile of 4 cats (a full floor) is a Heap. Besides the Pile bonuses, each member gains 2 Fluff every round.',
    'A pile, but with a mortgage.',
    {});

  G('nip', 'Nip', 'resource', 'leaf',
    'Battle meter 0 to 10. At 10 it triggers a Surge.',
    'Catnip meter, 0 to 10, empty at battle start. At 10 it Surges automatically, excess carries into the effect (max 5), meter resets. Nip gained during Surge or Crash is lost.',
    'Not a drug. A lifestyle. Be gentle, it will not remember.',
    { aliases: ['catnip', 'nip meter'] });

  G('surge', 'Catnip Surge', 'twist', 'leaf-burst',
    'Rest of this turn and all next turn: more Zoomies, bigger cats.',
    'At Nip 10: +2 Zoomies now and +2 next turn, cats get +2 Attack plus any excess Nip, total Zoomies this turn cap at 10. Then Crash follows.',
    'Technically a very productive evening.',
    { aliases: ['surge'] });

  G('crash', 'Crash', 'twist', 'flat-cat',
    'After a Surge: -1 Zoomies, -1 draw, and every cat falls asleep.',
    'Lasts 1 to 2 turns (1 + floor(excess/3)). Each Crash turn: -1 Zoomies and -1 draw. On the first Crash turn all awake cats are forced to Nap and gain Rested. Nip gained is lost.',
    'Remember, kids: the floor is the cure.',
    {});

  G('hold_rule', 'Hold Rule', 'twist', 'wall-paws',
    'Old rule, no longer in force: every pest now climbs one floor each round, cats or no cats.',
    'Pests strike first, then your cats, then every surviving pest climbs one floor. A pest on the Attic with no cat there hits the Sunbeam. (Classic Hold Rule: only floors with no cats let pests climb.)',
    'The most structurally sound thing a cat has ever done.',
    { aliases: ['hold'] });

  G('climb', 'Climb', 'twist', 'up-arrow',
    'Pests move up a floor in Pest Advance if the Hold rule lets them.',
    'In Pest Advance (floors top down) a pest moves up a floor if the Hold rule allows, it is not Yarned or Dizzy from a Knock, and the floor above has room for its Size.',
    'Stairs are for people with plans.',
    {});

  G('garden_queue', 'Garden Queue', 'twist', 'garden-gate',
    'Where pests wait when a floor is full. Retried every Spawn.',
    'Pests that cannot fit are queued per floor (first in, first out) and retried at each Spawn. Queued pests count as alive for the win check but cannot be targeted.',
    'The line is long. They are hissing politely.',
    {});

  G('impatience', 'Impatience', 'twist', 'tick-clock',
    'From round 16 every pest gains +1 Attack each round.',
    'Anti-stall. From round 16, every pest gains +1 Attack at each Spawn phase (or from the encounter\'s own round). There is no round cap.',
    'Even rats can only wait so long.',
    {});

  G('dusk', 'Dusk', 'twist', 'sunset',
    'End of round. Status timers tick here.',
    'The last step of a round, after Spawn. Status ticks resolve in a fixed order: Wet, Dizzy, Scared, Frazzled, Yarn, Hiss, Hairball, Purr, Rested, Rage.',
    'The golden hour. Mice hate it.',
    { aliases: ['dusk tick'] });

  G('sunbeam_hit', 'Sunbeam Hit', 'twist', 'sun-ray',
    'Pests that reach the Attic with no cats burn Warmth.',
    'Only Attic pests hit the Sunbeam, and only when the Attic has no cats (Hidden cats do not count). Sneaky pests hit it even when cats are present. Damage hits Shade first, then Warmth. The pest stays and hits every round.',
    'The warm patch. The reason for everything.',
    { aliases: ['sunbeam hit'] });

  /* ---------------------------------------------------------------- TRAITS AND TAGS */
  G('Climber', 'Climber', 'trait', 'wall-climb',
    'Ignores the Hold rule. Attacks first, then climbs.',
    'Climbs every round if the floor above has room, even with cats on its floor. It still attacks first in Pest Attacks, then climbs in Pest Advance.',
    'Gravity is a suggestion. A rude one.',
    {});

  G('Sneaky', 'Sneaky', 'trait', 'sneak-feet',
    'Hits the Sunbeam from the Attic even with cats present.',
    'A Sneaky pest on the Attic hits the Sunbeam directly even if cats stand there, in addition to its normal attack.',
    'Walks past the guards like it pays rent.',
    {});

  G('Slippery', 'Slippery', 'trait', 'soap',
    'Takes double Shatter and is not made Dizzy by Knock.',
    'Slippery pests take double Shatter and are not made Dizzy by Knock landings. Pushed normally.',
    'Has never held a grudge. Cannot hold anything.',
    {});

  G('Spectral', 'Spectral', 'trait', 'ghost',
    'Halves cat damage outside a Witching Hour. Shatter ignores it.',
    'Cat attacks deal half damage (minimum 1) except during a Witching Hour round. Shatter ignores this.',
    'Only visible when it is rude.',
    {});

  G('Tracker', 'Tracker', 'trait', 'nose',
    'Attacks ignore Hidden. Can flatten Boxes.',
    'A Tracker pest treats Hidden cats as present when picking targets and blockers. Some Trackers also damage Boxes.',
    'Finds the box. Always finds the box.',
    {});

  G('Glider', 'Glider', 'trait', 'wings',
    'A Climber that can rise 2 floors in Pest Advance.',
    'A Glider climbs up to 2 floors per Pest Advance if there is Room. Counts as a Climber.',
    'Not flying. Falling with ambition.',
    {});

  G('Untargetable', 'Untargetable', 'trait', 'dot-glow',
    'Immune to damage and ignored by target picks.',
    'Cannot be targeted or damaged. Still counts for the win check unless the encounter says otherwise. Used by the Red Dot.',
    'You cannot catch it. You will try anyway.',
    {});

  G('Parasite', 'Parasite', 'trait', 'tick-bug',
    'Latches onto a cat and bites each round until removed.',
    'A parasite leaves the floor and attaches to a cat, dealing its damage each Pest Attacks. It is not targetable by cat attacks, counts as alive for the win check, and is removed by Cleanse, a Scratch, or specific counters.',
    'The rudest houseguest. Brings its own cat.',
    {});

  G('Light', 'Light', 'tag', 'feather',
    'Knocked 1 floor further.',
    'A Light pest falls 1 extra floor when Knocked. Wet pests count as Light.',
    'Tragically aerodynamic.',
    {});

  G('Heavy', 'Heavy', 'tag', 'anvil',
    'Knocked 1 floor less (minimum 0).',
    'A Heavy pest falls 1 fewer floor when Knocked. It still takes Shatter for floors fallen, at least 1 if it was pushed. Bosses are Heavy or Anchored.',
    'Big boned and proud.',
    {});

  G('Anchored', 'Anchored', 'tag', 'anchor',
    'Cannot be Knocked, and takes no Shatter.',
    'An Anchored pest does not move when Knocked and takes no Shatter. All bosses are Heavy or Anchored.',
    'Immovable object. The cat is the unstoppable force.',
    {});

  G('Costly', 'Costly', 'tag', 'bloody-paw',
    'A cat it kills loses 2 lives instead of 1.',
    'If this pest\'s attack kills a cat, the cat loses 2 lives instead of 1 (if it has 2 or fewer, it is lost). Used sparingly on elites and bosses.',
    'Takes more than it is owed.',
    {});

  G('Nocturnal', 'Nocturnal', 'tag', 'owl-eye',
    '+2 Attack during a Witching Hour round.',
    'A Nocturnal pest gains +2 Attack during Witching Hour rounds. Many Night Visitors have it.',
    'Wakes up when you want to sleep.',
    {});

  G('Large', 'Large', 'tag', 'big-cat',
    'Cat tag. Takes 2 slots, 4 lives, does not fit a Box.',
    'A Large cat has Size 2 (two of the floor\'s 4 slots), 4 lives by default, and does not fit in a Box.',
    'Not fat. Fluffy-boned.',
    {});

  G('Kitten', 'Kitten', 'tag', 'small-cat',
    'Cat tag. Starts with 2 lives. Grows over the run.',
    'A Kitten has 2 lives. Kitten chain cards gain Growth when played and can evolve to Cat and Legend.',
    'Small, loud, and legally a cat.',
    {});

  G('Fragile', 'Fragile', 'tag', 'cracked-pot',
    'Toy tag. Any cat can knock it off once per turn.',
    'A Fragile toy can be knocked off by any cat on its floor once per turn, as a free action. It is destroyed and deals its Shatter to the front pest on the floor below.',
    'Priceless, until it is not.',
    {});

  G('Boss', 'Boss', 'tag', 'crown',
    'Size 5. Fills a whole floor. Heavy or Anchored.',
    'Pest Size: Small 1, Medium 2, Large 3, Boss 5 (a full floor). Bosses halve Yarn, are immune to Scared, and are Heavy or Anchored.',
    'It has been a long night. The rat has been wearing a crown.',
    {});

  /* ---------------------------------------------------------------- INTENT ICONS */
  G('intent_attack', 'Attack Intent', 'intent', 'claw',
    'This pest will hit a cat for the shown damage.',
    'Claw icon with a number: final damage per hit after current bonuses, with xN for hits. The cat that will be hit gets a red outline.',
    'It telegraphs. How polite.',
    {});

  G('intent_multi', 'Multi Attack Intent', 'intent', 'triple-claw',
    'Several hits. Shows hits x damage.',
    'Shows 3x4 style text: number of hits and damage each. Each hit picks its target again.',
    'Enthusiasm, measured in claws.',
    {});

  G('intent_climb', 'Climb Intent', 'intent', 'stairs',
    'No cat to fight. This pest will climb.',
    'Stairs or up arrow. The pest has no legal target and will climb in Pest Advance if the Hold rule allows.',
    'Heading upstairs. Nothing good will come of it.',
    { aliases: ['stairs'] });

  G('intent_defend', 'Defend Intent', 'intent', 'shield',
    'This pest will gain Fluff.',
    'Shield icon with a number: Fluff the pest will gain on its action.',
    'A pest putting on a jumper.',
    { aliases: ['shield'] });

  G('intent_buff', 'Buff Intent', 'intent', 'chevron-up',
    'This pest will strengthen itself or allies.',
    'Up chevrons: the pest will buff itself or allies (Rage, Fluff, Bristle and so on). Hover shows the exact effect.',
    'Gearing up. Ominous.',
    {});

  G('intent_debuff', 'Debuff Intent', 'intent', 'drip-skull',
    'This pest will weaken your cats.',
    'Broken heart or dripping skull: the pest will apply a debuff to cats (Scared, Wet, Dizzy, Frazzled). Hover shows which.',
    'It has opinions about your cats. Negative ones.',
    {});

  G('intent_summon', 'Summon Intent', 'intent', 'plus-ring',
    'This pest will call in more pests.',
    'Plus in a circle with a count. Summoned pests arrive at the back of the pest list with Yarn 1.',
    'Reinforcements. The rat has friends.',
    {});

  G('intent_sleep', 'Skipping Intent', 'intent', 'zzz',
    'This pest does nothing this round (Yarn or Dizzy).',
    'Zzz icon with the stacks. The pest will skip its action and climb. Shown for Yarn.',
    'Napping. Respect it.',
    { aliases: ['zzz'] });

  G('intent_sunbeam', 'Sunbeam Intent', 'intent', 'flame',
    'This pest will hit the Sunbeam for the shown damage.',
    'Sunbeam icon with final damage, flame border on the bubble. The roof flashes a warning strip. Shade absorbs first.',
    'This is the one that matters.',
    {});

  G('intent_unknown', 'Hidden Intent', 'intent', 'question',
    'Unknown. The pest\'s plan is hidden.',
    'An eye with a question mark. Some bosses and silent pests hide their first intent until revealed.',
    'It knows something you do not.',
    { aliases: ['eye'] });

  G('intent_special', 'Special Intent', 'intent', 'hook',
    'Steal, snatch or latch on. Hover to see which.',
    'Used by actions that are not damage: attach (parasite), snatch (exile a draw card), steal (Fluff or Fish). Hover shows the exact effect.',
    'Pockets are involved.',
    { aliases: ['attach', 'snatch', 'steal'] });

  /* ---------------------------------------------------------------- RESOURCES */
  G('zoomies', 'Zoomies', 'resource', 'bolt',
    'Energy. 3 per turn, no carryover, never above 10.',
    'Set to 3 at the start of each round (not added). Unspent Zoomies vanish at End Turn. Hard cap 10 at any time. Witching Hour sets 5. Surge adds 2. Crash subtracts 1.',
    'Use them now. They are not coming back.',
    { aliases: ['energy'] });

  G('fish', 'Fish', 'resource', 'fish',
    'Money. Spend it at the shop, Post and events.',
    'Run currency. Start with 60. Fish above 120 spoils at the start of Act 2 and Act 3 (15 percent of the excess, rounded up). Earned from fights, bosses, skipping drafts and Postcards.',
    'Currency of cats, raccoons and bad decisions.',
    { aliases: ['gold'] });

  G('warmth', 'Warmth', 'resource', 'sun-heart',
    'The Sunbeam\'s health. Zero means the house falls.',
    'Start 40, max 40, +5 max after each boss (45, then 50). Persists between fights. At 0 the run ends. Heals above the max are lost. Events never take it below 1.',
    'A warm patch of floor. Worth dying for.',
    { aliases: ['sunbeam health'] });

  G('shade', 'Shade', 'resource', 'umbrella',
    'The Sunbeam\'s armor. Resets each battle.',
    'Absorbs pest damage to the Sunbeam before Warmth. Starts at 0 each battle, persists through it, cleared when it ends.',
    'Curtains, but offensive.',
    {});

  G('lives_pips', 'Lives', 'resource', 'paw',
    'How many times this cat can die before it is lost.',
    'Per card, run long, shown as paw pips. 2 for Kittens, 3 standard, 4 Large, 9 Champion, hard cap 9. Restored by Act start (+1), Nap Nook, shop items, upgrades and relics.',
    'Counted obsessively. Spent casually.',
    { aliases: ['pips'] });

  G('whisker_xp', 'Whisker XP', 'resource', 'whisker',
    'Meta currency for unlocks after a run.',
    'Nights survived x 10 + elites x 5 + bosses x 20 + 50 for a win + Mischief Rank x 10.',
    'Earned the slow way, by being very stubborn.',
    {});

  G('mischief_rank', 'Mischief Rank', 'resource', 'bolt',
    'Difficulty ladder from 0 to 10.',
    'Each rank adds a modifier on top of the lower ranks. Highest unlocked rank is the default.',
    'Because the cat insists.',
    {});

  /* ---------------------------------------------------------------- UPGRADE TERMS (A06) */
  G('scratch', 'Scratch', 'upgrade', 'gouge',
    'A card upgrade picked at a Scratching Post.',
    'Fills one Scratch Slot. Tiers 1, 2, 3 cost 40, 75, 120 Fish. The Post material gates tier by act: Cardboard T1, Sisal T2, Cedar T3. Two free Post nodes per act, plus paid Post Stalls in shops.',
    'The sofa has been informed.',
    { aliases: ['upgrade'] });

  G('scratch_slot', 'Scratch Slot', 'upgrade', 'gouge-slot',
    'How many Scratches a card can hold.',
    'Common and Uncommon 1, Rare 2, evolution cards 1, 2, 3 by stage, Champions 2 plus 3 tier nodes. Max 3 for non Champions. Whittle (120 Fish, once per card) adds 1.',
    'Notches. Many notches.',
    { aliases: ['slot'] });

  G('fork', 'Fork', 'upgrade', 'fork-arrow',
    'A named branch upgrade that changes what a card does.',
    'Key cards offer 2 or 3 Forks. Taking one uses 1 Scratch Slot, costs 90 Fish at a Post, renames the card and swaps its text.',
    'A choice with a consequence. Very feline.',
    { aliases: ['fork upgrade'] });

  G('mastery', 'Mastery', 'upgrade', 'paw-stamp',
    'Plays unlock bonuses on the card.',
    'Ranks at 3, 7 and 12 plays (4, 9, 15 for Champions), max 3 counted plays per card per fight. Rank 1 and 2 give small stats, rank 3 a named bonus.',
    'Practice makes purrfect. We will not apologise.',
    {});

  G('champion_tier', 'Champion Tier', 'upgrade', 'crown',
    'The Champion\'s 3 big upgrades, one at Night 2, 5 and 8.',
    'Each tier is a pick of 1 from 3 paths (A06). Tiers unlock at Nights 2, 5 and 8. Missed tiers cost 60, 100, 150 Fish at a Post.',
    'The collar gets bigger every time.',
    { aliases: ['champion tiers'] });

  G('evolution', 'Evolution', 'upgrade', 'grow-arrow',
    'Kitten to Cat to Legend over the run.',
    'Chain cards gain Growth for each fight they are played in. At 3 Growth a free Growth Spurt turns a Kitten into a Cat. Legend needs a card quest and a Legend Ceremony (90 Fish, Act 2 or later).',
    'They grow up so fast. Within the week.',
    { aliases: ['growth', 'growth spurt'] });

  G('adopt_out', 'Adopt Out', 'upgrade', 'heart-house',
    'Remove a card from the deck.',
    'Removes a non Champion card. Shop removal costs 75 Fish, +25 each time. Each adopted card sends Postcards (+2 Fish after fights, max 12 per fight). Minimum deck size 8.',
    'They will be loved. The sofa has been warned.',
    { aliases: ['remove', 'shoo'] });

  G('box_swap', 'Box Swap', 'upgrade', 'swap-box',
    'Transform a card into a random card of the same rarity.',
    'Pick from 3 random cards of the same rarity from your two clans. Mastery resets, Knead halves. Costs 40 Fish at the shop.',
    'It is a box. It is now also a different cat.',
    {});

  G('litter', 'Litter', 'upgrade', 'twin-cat',
    'Duplicate a card.',
    'Copies a card with its Scratches and Knead. Costs 80 Fish, +40 per earlier Litter. Max 2 copies of a Rare, 3 of others. Not for Champions.',
    'Congratulations, it is two.',
    { aliases: ['duplicate'] });

  G('collar_charm', 'Collar Charm', 'upgrade', 'bell',
    'A permanent enhancer worn by one card.',
    'Clan reward. Drag onto a card in the deck viewer. One charm per card, a second replaces the first. Costs 90 Fish in shops.',
    'Jingles at the worst possible moment.',
    { aliases: ['charm'] });

  /* build lookup */
  var idx = SB.data.glossaryIndex = {};
  function put(k, e) { k = String(k).toLowerCase(); if (!idx[k]) idx[k] = e; }
  L.forEach(function (e) {
    put(e.ref, e); put(e.name, e); put(e.id, e);
    (e.aliases || []).forEach(function (a) { put(a, e); });
  });
})();

/* Icon registry. a08 = already named in A08 section 8.5. Others need a bitmap in js/art/icons.js. */
SB.data.glossaryIcons = (function () {
  var a08 = ['heart', 'sword', 'shield', 'paw', 'claw', 'flame', 'crescent', 'box', 'spiral', 'bolt', 'fish', 'crown', 'skull', 'up-arrow', 'down-arrow', 'question', 'plus'];
  var seen = {}, out = [];
  SB.data.glossary.forEach(function (e) {
    if (seen[e.icon]) return;
    seen[e.icon] = true;
    out.push({ id: e.icon, a08: a08.indexOf(e.icon) >= 0 });
  });
  return out;
})();

/* ================================================================ RULE CONSTANTS
 * Flat object. Keys are snake_case. Arrays are ordered tables (act 1,2,3 or tier 1,2,3).
 * RULES.md wins over every doc. "REC" in a comment marks a recommended value for an open question (B22-glossary.md).
 */
SB.data.rules = {
  /* turn flow: pests strike first and every pest climbs a floor each round. Set both false for the classic Hold Rule flow. */
  pestsFirst: true,
  pestsAlwaysClimb: true,
  pestHpMult: 0.5, /* pests only get one round per floor now, so they are softer */
  /* identity */
  game_title: 'SUNBEAM SIEGE',
  game_subtitle: 'Nine Lives to Hold the House',
  currency: 'Fish',

  /* board */
  floors: 3,
  cat_slots_per_floor: 4,
  pest_capacity_per_floor: 5,
  room_slots_per_floor: 2,
  cat_size_default: 1,
  cat_size_large: 2,
  pest_size_small: 1,
  pest_size_medium: 2,
  pest_size_large: 3,
  pest_size_boss: 5,
  boxes_max_per_floor: 2,
  status_slots_per_floor: 2,

  /* sunbeam */
  warmth_start: 40,
  warmth_max: 40,
  warmth_max_gain_per_boss: 5,
  warmth_max_after_boss: [45, 50],
  shade_start: 0,
  last_life_default: false,
  sunbeam_purr_divisor: 10,
  sunbeam_purr_heal_cap: 3,
  boss_heal_pct: 40,
  warmth_floor_for_events: 1,

  /* turn and economy of cards */
  zoomies_per_turn: 3,
  zoomies_cap: 10,
  draw_per_turn: 5,
  hand_limit: 10,
  hairballs_in_hand_max: 6,
  deck_start_size: 11,
  deck_start_champion: 1,
  deck_start_main_basics: 4,
  deck_start_swat: 2,
  deck_start_catnap: 2,
  deck_start_cardboard_box: 1,
  deck_start_side_basics: 1,
  deck_min: 8,
  deck_target_min: 24,
  deck_target_max: 32,
  deck_warning_size: 40,
  champions_per_clan: 2,
  champions_total: 8,
  clans_playable: 4,

  /* damage order is fixed: flat bonuses, percent (round down), Hiss, Fluff, Health */
  damage_order: ['flat', 'percent', 'hiss', 'fluff', 'health'],
  shatter_ignores_fluff: true,
  stack_global_cap: 99,
  marked_percent: 50,
  ambush_multiplier: 2,

  /* round and tick order */
  round_phases: ['draw', 'play', 'end_turn', 'cat_attacks', 'pest_attacks', 'pest_advance', 'spawn', 'dusk'],
  dusk_tick_order: ['wet', 'dizzy', 'scared', 'frazzled', 'yarn', 'hiss', 'hairball', 'purr', 'rested', 'rage'],
  trigger_priority: ['relics', 'rooms_by_floor', 'cats', 'pests'],
  impatience_round: 16,
  impatience_attack_per_round: 1,
  unopposed_rounds_to_sunbeam: 3,

  /* nine lives */
  lives_kitten: 2,
  lives_standard: 3,
  lives_large: 4,
  lives_champion: 9,
  lives_cap: 9,
  lives_act_start_gain: 1,
  lives_empty_collar_zoomies: 1,
  lives_cornered_at: 1,
  lives_cornered_attack: 2,
  lives_costly_loss: 2,
  champion_long_nap_return_lives: 3,
  tuna_tin_lives: 1,
  tuna_tin_price: 70,
  whole_salmon_lives: 1,
  whole_salmon_price: 160,
  lick_wounds_lives: 1,
  lick_wounds_max_cats: 3,
  deep_sleep_lives: 2,

  /* witching hour */
  witching_interval: 3,
  witching_zoomies_bonus: 2,
  witching_zoomies_total: 5,
  witching_draw_bonus: 1,
  witching_draw_total: 6,
  witching_announce_rounds_early: 1,
  witching_max_consecutive: 1,
  zoom_damage_divisor: 2,
  zoom_rounding: 'up',
  zoom_frazzled_attack: -2,
  frazzled_attack_min: 1,
  night_visitor_threat_pct: 25,
  nocturnal_attack_bonus: 2,

  /* nap */
  nap_heal_per_round: 2,
  rested_gain_per_round: 1,
  rested_max: 4,
  rested_max_relic: 6,
  stretch_damage_per_rested: 3,
  stretch_damage_cap: 18,
  wake_attack_stacks_per_point: 2,
  rude_awakening_attack: 2,

  /* knock */
  knock_shatter_per_floor: 2,
  knock_shatter_landing_others: 2,
  knock_shatter_cellar: 3,
  knock_light_extra_floors: 1,
  knock_heavy_fewer_floors: 1,
  knock_moves_per_pest_per_round: 1,
  knock_landing_dizzy: 1,
  knock_grip_shatter_per_floor: 1,
  slippery_shatter_multiplier: 2,
  wet_pest_shatter_percent: 50,
  bosses_knock_weight: 'heavy_or_anchored',

  /* boxes */
  box_fits: 1,
  big_box_fits: 2,
  box_power_bonus: 1,
  box_durability_cardboard: 3,
  box_durability_shoebox: 2,
  box_durability_laundry_basket: 4,
  box_durability_paper_bag: 2,
  box_cost_cardboard: 1,
  flat_pack_cost: 1,

  /* cuddle pile */
  pile_min_size: 2,
  pile_attack_divisor: 2,
  pile_heal_min_size: 3,
  pile_heal_amount: 1,
  heap_size: 4,
  heap_fluff_per_round: 2,

  /* nip and surge */
  nip_max: 10,
  nip_excess_cap: 5,
  surge_zoomies_now: 2,
  surge_zoomies_next_turn: 2,
  surge_attack_bonus: 2,
  surge_zoomies_turn_cap: 10,
  crash_turns_base: 1,
  crash_excess_divisor: 3,
  crash_zoomies_penalty: 1,
  crash_draw_penalty: 1,
  crash_forced_nap: true,

  /* status values */
  purr_decay_per_round: 1,
  purr_thresholds: [5, 10, 20, 30, 40],
  purr_cap: 40,
  purr_heal_divisor: 2, /* REC: each cat heals ceil(P / 2) at Dusk before threshold extras */
  purr_threshold_5_extra_heal: 1,
  purr_threshold_10_rage_strip: 1,
  purr_threshold_20_fluff: 1,
  purr_threshold_30_zoomies_refund: 1,
  purr_threshold_40_extra_heal: 3,
  claws_max: 30,
  fluff_max: 50,
  bristle_max: 15,
  frenzy_max: 5,
  frenzy_self_damage_per_extra_hit: 1,
  rage_max: 20,
  rage_fluff_threshold: 5,
  wet_max: 6,
  scared_max: 3,
  dizzy_max_pest: 20,
  dizzy_max_cat: 5,
  dizzy_misdirect_percent_per_stack: 25,
  dizzy_misdirect_percent_cap: 75,
  dizzy_elite_stack_cap: 3,
  hiss_max: 10,
  hiss_scared_threshold: 2,
  hiss_rage_block_threshold: 3,
  yarn_max: 4,
  yarn_boss_duration_divisor: 2,
  yarn_summoned_pest_start: 1,
  marked_max: 5,
  hairball_max: 15,
  hairball_gagging_threshold: 5,
  hairball_dusk_keep_divisor: 2,
  hairball_card_stacks: 3,
  hairball_card_cost: 0,

  /* run structure (A07) */
  acts: 3,
  nights: 9,
  map_rows: 8,
  map_cols: 5,
  map_paths: 4,
  nights_row_a: 3,
  nights_row_b: 6,
  boss_row: 8,
  champion_upgrade_nights: [2, 5, 8],
  boss_count_per_act_pool: 2,
  waves_prowl: 3,
  waves_night: 4,
  waves_elite: 4,
  waves_boss: 5,
  threat_prowl: [12, 20, 30],
  threat_night: [20, 32, 46],
  threat_elite: [28, 42, 60],
  threat_boss: [45, 70, 100],
  threat_soft_open: 8,
  wave_threat_shares_3: [30, 40, 30],
  hp_scale_per_night: 0.08,
  target_run_minutes: 45,

  /* free row weights, act 1, 2, 3 */
  free_row_weight_battle: [38, 34, 30],
  free_row_weight_mystery: [20, 20, 20],
  free_row_weight_event: [14, 14, 14],
  free_row_weight_shop: [8, 8, 8],
  free_row_weight_post: [8, 8, 8],
  free_row_weight_nook: [6, 8, 10],
  free_row_weight_elite: [6, 8, 10],
  row_six_elite_chance: 0.35,

  /* rewards (A03 governs odds, pity, prices) */
  reward_card_choices: 3,
  reward_card_choices_with_relic: 4,
  odds_act1: [62, 32, 6],
  odds_act2: [54, 36, 10],
  odds_act3: [48, 38, 14],
  odds_elite: [40, 40, 20],
  odds_boss: [0, 0, 100],
  boss_rare_choices: 3,
  rare_pity_step: 1,
  rare_pity_cap: 20,
  clan_split_main_side_neutral: [60, 30, 10],
  fish_prowl: [12, 16, 20],
  fish_night: [20, 26, 32],
  fish_elite: [30, 38, 46],
  fish_boss: [70, 90, 0],
  fish_variance: 2,
  fish_start: 60,
  fish_skip_draft: 6,
  fish_fridge_threshold: 120,
  fish_fridge_rate: 0.15,
  fish_fridge_acts: [2, 3],
  clean_night_fish: 8,
  clean_night_heal: 3,
  dawn_rest_heal: 4,
  relic_rarity_common_uncommon_rare: [55, 33, 12],
  relic_rarity_act3: [45, 38, 17],

  /* shop (A03 prices, A07 relic and service prices) */
  shop_cards: 5,
  shop_cards_main: 2,
  shop_cards_side: 1,
  shop_cards_neutral: 1,
  shop_cards_sale: 1,
  shop_sale_percent: 50,
  shop_rarity_weights: [55, 35, 10],
  shop_price_common: [45, 55],
  shop_price_uncommon: [75, 90],
  shop_price_rare: [140, 170],
  shop_relics: 2,
  shop_price_relic_common: 110,
  shop_price_relic_uncommon: 160,
  shop_price_relic_rare: 230,
  shop_price_charm: 90,
  shop_relic_discount_chance: 0.30,
  shop_relic_discount_percent: 20,
  shop_remove_price: 75,
  shop_remove_increment: 25,
  shop_warm_milk_price: 40,
  shop_warm_milk_heal: 10,
  shop_reroll_price: 20,
  shop_reroll_increment: 10,
  shop_sell_common: 15,
  shop_sell_other: 25,
  shop_variance_percent: 10,

  /* nook, treasure */
  nook_curl_up_pct: 30,
  nook_knead_max_warmth: 3,
  nook_knead_heal: 8,
  treasure_sit_heal_pct: 20,
  treasure_sit_fish: 15,
  treasure_relic_odds_act1: [70, 30, 0],
  treasure_relic_odds_act2: [45, 40, 15],
  treasure_relic_odds_act3: [30, 45, 25],

  /* upgrades (A06 detail, RULES prices) */
  post_free_nodes_per_act: 2,
  scratch_price_by_tier: [40, 75, 120],
  scratch_max_tier_by_act: [1, 2, 3],
  scratch_offers_by_act: [3, 3, 4],
  scratch_slots_common: 1,
  scratch_slots_uncommon: 1,
  scratch_slots_rare: 2,
  scratch_slots_cap: 3,
  scratch_champion_generic_slots: 2,
  scratch_overscratch_price_percent: 150,
  post_reroll_price: 15,
  post_reroll_increment: 15,
  post_reroll_max: 3,
  fork_price: 90,
  whittle_price: 120,
  post_knead_price: 15,
  post_knead_max_per_card: 2,
  champion_tier_count: 3,
  champion_tier_price: [60, 100, 150],
  champion_paths: 3,
  champion_options_per_tier: 3,
  legend_ceremony_price: 90,
  mastery_thresholds: [3, 7, 12],
  mastery_thresholds_champion: [4, 9, 15],
  mastery_plays_counted_per_fight: 3,
  knead_cap: 12,
  knead_cap_champion: 20,
  growth_per_stage: 3,
  growth_target_multiplier_by_night9: 2.2,
  growth_report_min_events: 3,
  box_swap_price: 40,
  box_swap_choices: 3,
  box_swap_choices_with_permit: 4,
  litter_price: 80,
  litter_increment: 40,
  litter_max_copies_rare: 2,
  litter_max_copies_other: 3,
  adopt_out_free_per_act: 1,
  postcard_fish_per_card: 2,
  postcard_cap_per_fight: 12,
  adopt_scratch_refund: 10,

  /* meta */
  mischief_max: 10,
  whisker_xp_per_night: 10,
  whisker_xp_per_elite: 5,
  whisker_xp_per_boss: 20,
  whisker_xp_victory: 50,
  whisker_xp_per_rank: 10,

  /* library targets */
  library_target_cards: 230,
  library_basics: 12,
  library_neutral: 36,
  library_per_clan: 42,
  library_curses_tokens_min: 12,

  /* determinism */
  rng: 'mulberry32',
  rng_seed_inputs: ['runSeed', 'nodeId']
};
