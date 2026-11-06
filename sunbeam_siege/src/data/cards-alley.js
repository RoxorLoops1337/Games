/*
 * SUNBEAM SIEGE, Alley Tabbies clan card set (B01)
 * 42 non-champion cards: 20 Cat units, 14 spells, 8 toys/rooms. Ids prefixed alley_.
 * Rarity: 18 common, 16 uncommon, 8 rare. Champions are written by another agent.
 *
 * Schema follows A03 section 9 (stats key is `power`; card text says "Attack" per RULES.md).
 * Statuses per A04 (claws, frenzy, hiss, fluff, marked). Pounce N is the on-deploy keyword.
 *
 * NEEDS (for the engine agent, nothing here is silently invented):
 *  1. Keyword `ragebait: N`. Pests on this floor must target this Cat while it is awake.
 *     Each time it takes damage, it gains N Claws. (RULES.md lists Rage-bait but no doc defines it.)
 *  2. Triggers: `onPounceKill` (a Pounce attack of this Cat killed its target; also usable inside
 *     a `passive` to mean "any of your Cats"), and `onCatAttack` (toys: a Cat on this floor attacks,
 *     triggerSource = that Cat).
 *  3. Counters for AmountExpr: `selfClaws` (Claws stacks on the source Cat), `maxClaws` (highest
 *     Claws among your Cats), `livesMissing` (max lives minus current lives of the source Cat),
 *     `lastSpent` (Lives spent by the previous effect in the same array).
 *  4. Effect `pounce`: { type:"pounce", amount:N, target:"chosenCat" } makes that Cat attack once now
 *     at the front pest on its floor for Attack + N. Counts as a Pounce for onPounceKill.
 *  5. Effect `lives` extended: { type:"lives", amount:-1, spend:true } is a voluntary Spend a Life.
 *     It never takes the last life (fizzles on a Cat with 1 life). `spend:"allButOne"` spends down to 1.
 *     The spent life is tracked for `lastSpent` and Cornered applies at 1 life.
 *  6. Check `targetDied` (the previous damage effect killed its target).
 *  7. Target `randomCatOnFloor` (alias of random pick among allCatsOnFloor).
 *  8. Effect flag `oncePerTurn:true` on any effect inside a trigger or passive.
 *  9. `grantKeyword` with keyword `pounce` stays for the fight on that Cat instance only.
 * 10. (verification pass) Void the Warranty uses the op `spendAllButOne` and Cheap Shot / Domino Hit rely on the
 *     wrapped check `targetDied`, both in src/engine/ops-alley.js. Grindstone limits per Cat with limit.keyed.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

(function () {
  function cat(o) {
    return Object.assign({
      type: 'unit', clan: 'alley', targeting: 'floor', keywords: {}, unlock: 'start'
    }, o, {
      stats: { power: o.power, health: o.health, lives: o.lives, size: o.size || 1 }
    }, { power: undefined, health: undefined, lives: undefined, size: undefined });
  }
  function clean(c) {
    ['power', 'health', 'lives', 'size'].forEach(function (k) { delete c[k]; });
    return c;
  }
  function unit(o) { return clean(cat(o)); }
  function spell(o) {
    return Object.assign({ type: 'spell', clan: 'alley', keywords: {}, unlock: 'start' }, o);
  }
  function toy(o) {
    return Object.assign({ type: 'toy', clan: 'alley', targeting: 'floor', keywords: {}, unlock: 'start' }, o);
  }
  var P = function (stat, n, tgt) { return { type: 'applyStatus', status: stat, amount: n, target: tgt || 'self' }; };

  SB.data.cardsAlley = [

    /* ======================= CAT UNITS (20) ======================= */

    /* ---- Commons (8) ---- */
    unit({
      id: 'alley_bin_diver', name: 'Bin Diver', rarity: 'common', cost: 1,
      power: 1, health: 3, lives: 3,
      keywords: { pounce: 1 },
      text: 'Pounce 1. Deploy: gain 1 Claws.',
      flavor: 'Found a sandwich. Kept the grudge.',
      effects: { onPlay: [P('claws', 1)] },
      upgrade: { effects: { onPlay: [P('claws', 2)] }, text: 'Pounce 1. Deploy: gain 2 Claws.' },
      art: { sprite: 'cat_scrappy', palette: 'orange', hint: 'grey-orange tabby, banana peel on head, torn ear' },
      tags: ['claws', 'pounce']
    }),
    unit({
      id: 'alley_gutter_kitten', name: 'Gutter Kitten', rarity: 'common', cost: 0,
      power: 1, health: 2, lives: 2,
      keywords: { pounce: 2, fleeting: true },
      text: 'Fleeting. Pounce 2. If the Pounce kills, gain 1 Zoomies (once per turn).',
      flavor: 'Arrived at speed. Took the credit. Left.',
      effects: { onPounceKill: [{ type: 'zoomies', amount: 1, target: 'player', oncePerTurn: true }] },
      upgrade: { stats: { health: 3 }, keywords: { pounce: 3 }, text: 'Fleeting. Pounce 3. If the Pounce kills, gain 1 Zoomies (once per turn).' },
      art: { sprite: 'kitten_blur', palette: 'orange', hint: 'tiny orange kitten, motion lines, one sock' },
      tags: ['pounce', 'refund']
    }),
    unit({
      id: 'alley_fence_walker', name: 'Fence Walker', rarity: 'common', cost: 1,
      power: 1, health: 3, lives: 3,
      text: 'Deploy: gain Frenzy 1.',
      flavor: 'Balances on the fence to look down on both gardens.',
      effects: { onPlay: [P('frenzy', 1)] },
      upgrade: { effects: { onPlay: [P('frenzy', 2)] }, text: 'Deploy: gain Frenzy 2.' },
      art: { sprite: 'cat_scrappy', palette: 'grey', hint: 'lanky grey tom mid-tightrope, tail as pole' },
      tags: ['frenzy']
    }),
    unit({
      id: 'alley_tin_can_tom', name: 'Tin Can Tom', rarity: 'common', cost: 2,
      power: 2, health: 6, lives: 3,
      keywords: { ragebait: 1 },
      text: 'Rage-bait 1. (Pests here must hit this Cat. Each hit taken gives 1 Claws.)',
      flavor: 'Wears a tin can on one paw as a statement.',
      upgrade: { stats: { health: 8 }, keywords: { ragebait: 2 }, text: 'Rage-bait 2. (Pests here must hit this Cat. Each hit taken gives 2 Claws.)' },
      art: { sprite: 'cat_tabby', palette: 'orange', hint: 'chunky orange tabby, tin can stuck on paw, smug' },
      tags: ['ragebait', 'claws']
    }),
    unit({
      id: 'alley_back_door_bandit', name: 'Back Door Bandit', rarity: 'common', cost: 2,
      power: 2, health: 5, lives: 3,
      text: 'Whenever this kills an enemy, gain 1 Claws.',
      flavor: 'Takes only what was unattended. Everything was unattended.',
      effects: { onKill: [P('claws', 1)] },
      upgrade: { effects: { onKill: [P('claws', 2)] }, text: 'Whenever this kills an enemy, gain 2 Claws.' },
      art: { sprite: 'cat_tabby', palette: 'black_red', hint: 'black cat with white mask patch, stolen fish tail hanging out' },
      tags: ['claws']
    }),
    unit({
      id: 'alley_sidewalk_sprinter', name: 'Sidewalk Sprinter', rarity: 'common', cost: 1,
      power: 2, health: 2, lives: 2,
      keywords: { pounce: 1 },
      text: 'Pounce 1.',
      flavor: 'Fast, loud, and legally a kitten.',
      upgrade: { stats: { health: 4 }, text: 'Pounce 1.' },
      art: { sprite: 'cat_scrappy', palette: 'orange', hint: 'skinny orange cat, speed lines, sneakers made of dust' },
      tags: ['pounce']
    }),
    unit({
      id: 'alley_scrap_heap_sal', name: 'Scrap Heap Sal', rarity: 'common', cost: 1,
      power: 1, health: 4, lives: 3,
      text: 'Deploy: Spend a Life. Gain 3 Claws.',
      flavor: 'Has nine lives and a plan to use them quickly.',
      effects: { onPlay: [{ type: 'lives', amount: -1, spend: true, target: 'self' }, P('claws', 3)] },
      upgrade: { effects: { onPlay: [{ type: 'lives', amount: -1, spend: true, target: 'self' }, P('claws', 4)] }, text: 'Deploy: Spend a Life. Gain 4 Claws.' },
      art: { sprite: 'cat_scrappy', palette: 'grey', hint: 'patchy grey cat sitting on a pile of scrap, eye patch' },
      tags: ['lives', 'claws']
    }),
    unit({
      id: 'alley_ledge_lurker', name: 'Ledge Lurker', rarity: 'common', cost: 2,
      power: 2, health: 4, lives: 3,
      keywords: { pounce: 2 },
      text: 'Pounce 2.',
      flavor: 'Was on the shelf. Is now on your face. Do not ask.',
      upgrade: { stats: { power: 3 }, keywords: { pounce: 3 }, text: 'Pounce 3.' },
      art: { sprite: 'cat_tabby', palette: 'brown', hint: 'brown tabby crouched on a window ledge, wide pupils' },
      tags: ['pounce']
    }),

    /* ---- Uncommons (8) ---- */
    unit({
      id: 'alley_whetstone_whiskers', name: 'Whetstone Whiskers', rarity: 'uncommon', cost: 2,
      power: 1, health: 6, lives: 3,
      text: 'Whenever this kills an enemy, gain 2 Claws.',
      flavor: 'Sharpens on everything. Mostly your furniture.',
      effects: { onKill: [P('claws', 2)] },
      upgrade: { effects: { onKill: [P('claws', 3)] }, text: 'Whenever this kills an enemy, gain 3 Claws.' },
      art: { sprite: 'cat_tabby', palette: 'orange', hint: 'orange cat with a literal whetstone collar, sparks from paws' },
      tags: ['claws']
    }),
    unit({
      id: 'alley_ragebait_ronnie', name: 'Ragebait Ronnie', rarity: 'uncommon', cost: 2,
      power: 1, health: 7, lives: 3,
      keywords: { ragebait: 1 },
      text: 'Rage-bait 1. Whenever this takes damage, other Cats here gain 1 Claws.',
      flavor: 'Posts a take. Steps back. Lets the team arrive.',
      effects: { onDamaged: [P('claws', 1, 'otherCatsOnFloor')] },
      upgrade: { stats: { health: 9 }, effects: { onDamaged: [P('claws', 2, 'otherCatsOnFloor')] }, text: 'Rage-bait 1. Whenever this takes damage, other Cats here gain 2 Claws.' },
      art: { sprite: 'cat_tabby', palette: 'orange', hint: 'orange tom holding a tiny megaphone, grinning' },
      tags: ['ragebait', 'claws']
    }),
    unit({
      id: 'alley_ambush_artie', name: 'Ambush Artie', rarity: 'uncommon', cost: 2,
      power: 2, health: 5, lives: 3,
      keywords: { pounce: 1 },
      text: 'Pounce 1. Whenever you deploy another Cat, it gains Pounce 1 this fight.',
      flavor: 'Teaches the younger ones to jump out of things. Insurance not included.',
      effects: { onCatDeployed: [{ type: 'grantKeyword', keyword: 'pounce', amount: 1, target: 'triggerSource' }] },
      upgrade: { stats: { power: 3 }, text: 'Pounce 1. Whenever you deploy another Cat, it gains Pounce 1 this fight.' },
      art: { sprite: 'cat_tabby', palette: 'black_red', hint: 'black cat peeking out of a bin lid, ready to launch' },
      tags: ['pounce', 'chain']
    }),
    unit({
      id: 'alley_frenzy_fred', name: 'Frenzy Fred', rarity: 'uncommon', cost: 2,
      power: 1, health: 5, lives: 3,
      text: 'Start of your turn: gain Frenzy 2.',
      flavor: 'Calm for exactly one second, every morning.',
      effects: { onTurnStart: [P('frenzy', 2)] },
      upgrade: { effects: { onTurnStart: [P('frenzy', 3)] }, text: 'Start of your turn: gain Frenzy 3.' },
      art: { sprite: 'cat_scrappy', palette: 'orange', hint: 'orange blur with spiral eyes and four visible paws' },
      tags: ['frenzy']
    }),
    unit({
      id: 'alley_cornered_connie', name: 'Cornered Connie', rarity: 'uncommon', cost: 2,
      power: 1, health: 6, lives: 3,
      text: 'Deploy: Spend a Life. +2 Attack for each Life this Cat is missing.',
      flavor: 'Fights best with her back to a wall. Builds walls.',
      effects: { onPlay: [{ type: 'lives', amount: -1, spend: true, target: 'self' }] },
      aura: [{ stat: 'power', amount: { base: 0, per: 'livesMissing', mult: 2 }, target: 'self' }],
      upgrade: { aura: [{ stat: 'power', amount: { base: 0, per: 'livesMissing', mult: 3 }, target: 'self' }], text: 'Deploy: Spend a Life. +3 Attack for each Life this Cat is missing.' },
      art: { sprite: 'cat_tabby', palette: 'grey', hint: 'grey cat against brick wall, one ear notched, bristled' },
      tags: ['lives', 'cornered']
    }),
    unit({
      id: 'alley_last_gasp_gus', name: 'Last Gasp Gus', rarity: 'uncommon', cost: 2,
      power: 1, health: 5, lives: 3,
      keywords: { reborn: true },
      text: 'Reborn. Death: deal 2 damage plus this Cat\'s Claws to all enemies on this floor.',
      flavor: 'Goes out loud. Comes back louder.',
      effects: { onDeath: [{ type: 'damage', kind: 'hit', amount: { base: 2, per: 'selfClaws', mult: 1 }, target: 'allEnemiesOnFloor' }] },
      upgrade: { effects: { onDeath: [{ type: 'damage', kind: 'hit', amount: { base: 4, per: 'selfClaws', mult: 1 }, target: 'allEnemiesOnFloor' }] }, text: 'Reborn. Death: deal 4 damage plus this Cat\'s Claws to all enemies on this floor.' },
      art: { sprite: 'cat_ember', palette: 'black_red', hint: 'singed black tom with a small halo of soot' },
      tags: ['reborn', 'claws', 'lives']
    }),
    unit({
      id: 'alley_smash_and_grab_gladys', name: 'Smash and Grab Gladys', rarity: 'uncommon', cost: 1,
      power: 1, health: 4, lives: 3,
      keywords: { pounce: 1 },
      text: 'Pounce 1. If the Pounce kills, draw 1 card.',
      flavor: 'In and out. Mostly out, with a bin bag.',
      effects: { onPounceKill: [{ type: 'draw', amount: 1, target: 'player' }] },
      upgrade: { stats: { power: 2 }, text: 'Pounce 1. If the Pounce kills, draw 1 card.' },
      art: { sprite: 'cat_scrappy', palette: 'brown', hint: 'brown cat with a stripey sack over shoulder' },
      tags: ['pounce', 'refund']
    }),
    unit({
      id: 'alley_sharpening_sally', name: 'Sharpening Sally', rarity: 'uncommon', cost: 2,
      power: 2, health: 5, lives: 3,
      text: 'Whenever this attacks, gain 1 Claws.',
      flavor: 'Every swing is also a lesson, and she is both teacher and student.',
      effects: { onAttack: [P('claws', 1)] },
      upgrade: { stats: { power: 3 }, text: 'Whenever this attacks, gain 1 Claws.' },
      art: { sprite: 'cat_tabby', palette: 'orange', hint: 'orange cat mid-scratch on a post, wood chips flying' },
      tags: ['claws']
    }),

    /* ---- Rares (4) ---- */
    unit({
      id: 'alley_old_scratch', name: 'Old Scratch', rarity: 'rare', cost: 3,
      power: 3, health: 9, lives: 4, size: 2,
      text: 'Large. Deploy: gain 2 Claws. Whenever this attacks, double its Claws.',
      flavor: 'Thirty years in the alley. Zero retirement plans.',
      effects: { onPlay: [P('claws', 2)], onAttack: [{ type: 'applyStatus', status: 'claws', amount: { base: 0, per: 'selfClaws', mult: 1 }, target: 'self' }] },
      upgrade: { stats: { health: 12 }, effects: { onPlay: [P('claws', 3)], onAttack: [{ type: 'applyStatus', status: 'claws', amount: { base: 0, per: 'selfClaws', mult: 1 }, target: 'self' }] }, text: 'Large. Deploy: gain 3 Claws. Whenever this attacks, double its Claws.' },
      art: { sprite: 'cat_champion_orange', palette: 'black_red', hint: 'huge scarred black tom, torn ears, six claw scratches on flank' },
      tags: ['claws', 'snowball', 'large']
    }),
    unit({
      id: 'alley_hurricane_hank', name: 'Hurricane Hank', rarity: 'rare', cost: 3,
      power: 3, health: 8, lives: 3,
      text: 'Start of your turn: every Cat on this floor gains Frenzy 1.',
      flavor: 'Calls it a team-building exercise. Nobody agreed.',
      effects: { onTurnStart: [P('frenzy', 1, 'allCatsOnFloor')] },
      upgrade: { effects: { onTurnStart: [P('frenzy', 2, 'allCatsOnFloor')] }, text: 'Start of your turn: every Cat on this floor gains Frenzy 2.' },
      art: { sprite: 'cat_scrappy', palette: 'orange', hint: 'orange cat spinning in a dust tornado, grin' },
      tags: ['frenzy']
    }),
    unit({
      id: 'alley_queen_of_the_zoomies', name: 'Queen of the Zoomies', rarity: 'rare', cost: 2,
      power: 3, health: 4, lives: 3,
      keywords: { pounce: 2 },
      text: 'Pounce 2. Deploy: this fight, whenever a Cat kills with Pounce, gain 1 Zoomies and draw 1 (once per turn).',
      flavor: 'Crowned herself at 3 AM. The crown is a bottle cap.',
      effects: { onPlay: [{ type: 'passive', trigger: 'onPounceKill', effects: [{ type: 'zoomies', amount: 1, target: 'player', oncePerTurn: true }, { type: 'draw', amount: 1, target: 'player', oncePerTurn: true }] }] },
      upgrade: { stats: { health: 6 }, text: 'Pounce 2. Deploy: this fight, whenever a Cat kills with Pounce, gain 1 Zoomies and draw 1 (once per turn).' },
      art: { sprite: 'cat_tabby', palette: 'orange', hint: 'sleek orange queen with a bottle cap crown, mid-leap' },
      tags: ['pounce', 'refund', 'chain']
    }),
    unit({
      id: 'alley_barnaby_bad_idea', name: 'Barnaby the Bad Idea', rarity: 'rare', cost: 3,
      power: 3, health: 10, lives: 4, size: 2,
      text: 'Large. End of your turn: if this has 2+ Lives, Spend a Life and gain 3 Claws.',
      flavor: 'Every plan he has ends with the words "it will probably be fine".',
      effects: { onTurnEnd: [{ type: 'applyStatus', status: 'claws', amount: 3, target: 'self', if: [{ check: 'selfLives', op: '>=', value: 2 }] }, { type: 'lives', amount: -1, spend: true, target: 'self', if: [{ check: 'selfLives', op: '>=', value: 2 }] }] },
      upgrade: { effects: { onTurnEnd: [{ type: 'applyStatus', status: 'claws', amount: 4, target: 'self', if: [{ check: 'selfLives', op: '>=', value: 2 }] }, { type: 'lives', amount: -1, spend: true, target: 'self', if: [{ check: 'selfLives', op: '>=', value: 2 }] }] }, text: 'Large. End of your turn: if this has 2+ Lives, Spend a Life and gain 4 Claws.' },
      art: { sprite: 'cat_champion_orange', palette: 'brown', hint: 'enormous ginger tom, bandaged paw, lit firework in mouth' },
      tags: ['lives', 'claws', 'large', 'cornered']
    }),

    /* ======================= SPELLS (14) ======================= */

    /* ---- Commons (6) ---- */
    spell({
      id: 'alley_sharpen', name: 'Sharpen', rarity: 'common', cost: 1, targeting: 'cat',
      text: 'A Cat gains 2 Claws.',
      flavor: 'The sofa did not consent. The sofa did not need to.',
      effects: { onPlay: [P('claws', 2, 'chosenCat')] },
      upgrade: { effects: { onPlay: [P('claws', 3, 'chosenCat')] }, text: 'A Cat gains 3 Claws.' },
      tags: ['claws']
    }),
    spell({
      id: 'alley_cheap_shot', name: 'Cheap Shot', rarity: 'common', cost: 0, targeting: 'enemy',
      text: 'Deal 2 damage. If it kills, draw 1 card.',
      flavor: 'Technically a fair fight, if you squint and lie.',
      effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 2, target: 'chosenEnemy' }, { type: 'draw', amount: 1, target: 'player', if: [{ check: 'targetDied', op: '==', value: true }] }] },
      upgrade: { effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 3, target: 'chosenEnemy' }, { type: 'draw', amount: 1, target: 'player', if: [{ check: 'targetDied', op: '==', value: true }] }] }, text: 'Deal 3 damage. If it kills, draw 1 card.' },
      tags: ['refund']
    }),
    spell({
      id: 'alley_bin_raid', name: 'Bin Raid', rarity: 'common', cost: 1, targeting: 'none',
      text: 'Draw 2 cards, then discard 1.',
      flavor: 'Mostly eggshells. One good half sandwich.',
      effects: { onPlay: [{ type: 'draw', amount: 2, target: 'player' }, { type: 'discard', amount: 1, mode: 'choose' }] },
      upgrade: { effects: { onPlay: [{ type: 'draw', amount: 3, target: 'player' }, { type: 'discard', amount: 1, mode: 'choose' }] }, text: 'Draw 3 cards, then discard 1.' },
      tags: ['draw']
    }),
    spell({
      id: 'alley_tail_yank', name: 'Tail Yank', rarity: 'common', cost: 1, targeting: 'enemy',
      text: 'Deal 3 damage. Knock 1.',
      flavor: 'Not a fair move. Not a rare one either.',
      effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 3, target: 'chosenEnemy' }, { type: 'knock', amount: 1, target: 'chosenEnemy' }] },
      upgrade: { effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 5, target: 'chosenEnemy' }, { type: 'knock', amount: 1, target: 'chosenEnemy' }] }, text: 'Deal 5 damage. Knock 1.' },
      tags: ['knock']
    }),
    spell({
      id: 'alley_hiss_fit', name: 'Hiss Fit', rarity: 'common', cost: 1, targeting: 'floor',
      text: 'Deal 2 damage to all enemies on a floor and give them Hiss 1.',
      flavor: 'Wide mouth, flat ears, zero chill.',
      effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 2, target: 'allEnemiesOnFloor' }, { type: 'applyStatus', status: 'hiss', amount: 1, target: 'allEnemiesOnFloor' }] },
      upgrade: { effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 3, target: 'allEnemiesOnFloor' }, { type: 'applyStatus', status: 'hiss', amount: 2, target: 'allEnemiesOnFloor' }] }, text: 'Deal 3 damage to all enemies on a floor and give them Hiss 2.' },
      tags: ['hiss']
    }),
    spell({
      id: 'alley_spite_spurt', name: 'Spite Spurt', rarity: 'common', cost: 0, targeting: 'cat',
      keywords: { exhaust: true },
      text: 'Spend a Life from a Cat. It gains 3 Claws. Exhaust.',
      flavor: 'Nobody has ever won an argument with this attitude, but they keep trying.',
      effects: { onPlay: [{ type: 'lives', amount: -1, spend: true, target: 'chosenCat' }, P('claws', 3, 'chosenCat')] },
      upgrade: { effects: { onPlay: [{ type: 'lives', amount: -1, spend: true, target: 'chosenCat' }, P('claws', 4, 'chosenCat')] }, text: 'Spend a Life from a Cat. It gains 4 Claws. Exhaust.' },
      tags: ['lives', 'claws']
    }),

    /* ---- Uncommons (5) ---- */
    spell({
      id: 'alley_pounce_again', name: 'Pounce Again', rarity: 'uncommon', cost: 1, targeting: 'cat',
      text: 'A Cat Pounces now: it attacks the front enemy on its floor for Attack + 2.',
      flavor: 'It said it was done. It was lying.',
      effects: { onPlay: [{ type: 'pounce', amount: 2, target: 'chosenCat' }] },
      upgrade: { cost: 0, text: 'A Cat Pounces now: it attacks the front enemy on its floor for Attack + 2.' },
      tags: ['pounce', 'chain']
    }),
    spell({
      id: 'alley_midnight_sprint', name: 'Midnight Sprint', rarity: 'uncommon', cost: 1, targeting: 'cat',
      text: 'A Cat gains Frenzy 3.',
      flavor: 'No reason. Never a reason.',
      effects: { onPlay: [P('frenzy', 3, 'chosenCat')] },
      upgrade: { effects: { onPlay: [P('frenzy', 4, 'chosenCat')] }, text: 'A Cat gains Frenzy 4.' },
      tags: ['frenzy']
    }),
    spell({
      id: 'alley_dirty_fighting', name: 'Dirty Fighting', rarity: 'uncommon', cost: 1, targeting: 'enemy',
      text: 'Deal 3 damage plus the highest Claws among your Cats.',
      flavor: 'Rule one: there are no rules. Rule two: see rule one.',
      effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: { base: 3, per: 'maxClaws', mult: 1 }, target: 'chosenEnemy' }] },
      upgrade: { effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: { base: 5, per: 'maxClaws', mult: 1 }, target: 'chosenEnemy' }] }, text: 'Deal 5 damage plus the highest Claws among your Cats.' },
      tags: ['claws']
    }),
    spell({
      id: 'alley_brawl', name: 'Alley Brawl', rarity: 'uncommon', cost: 1, targeting: 'floor',
      text: 'Every Cat on a floor takes 2 damage and gains 2 Claws.',
      flavor: 'It started with a look. It always starts with a look.',
      effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 2, target: 'allCatsOnFloor' }, P('claws', 2, 'allCatsOnFloor')] },
      upgrade: { effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 2, target: 'allCatsOnFloor' }, P('claws', 3, 'allCatsOnFloor')] }, text: 'Every Cat on a floor takes 2 damage and gains 3 Claws.' },
      tags: ['claws', 'ragebait']
    }),
    spell({
      id: 'alley_collective_bad_idea', name: 'Collective Bad Idea', rarity: 'uncommon', cost: 1, targeting: 'none',
      keywords: { exhaust: true },
      text: 'Spend a Life from every Cat. Each gains 2 Claws and Frenzy 1. Exhaust.',
      flavor: 'Unanimous, which should have been the warning.',
      effects: { onPlay: [{ type: 'lives', amount: -1, spend: true, target: 'allCats' }, P('claws', 2, 'allCats'), P('frenzy', 1, 'allCats')] },
      upgrade: { effects: { onPlay: [{ type: 'lives', amount: -1, spend: true, target: 'allCats' }, P('claws', 3, 'allCats'), P('frenzy', 2, 'allCats')] }, text: 'Spend a Life from every Cat. Each gains 3 Claws and Frenzy 2. Exhaust.' },
      tags: ['lives', 'claws', 'frenzy']
    }),

    /* ---- Rares (3) ---- */
    spell({
      id: 'alley_bin_night_riot', name: 'Bin Night Riot', rarity: 'rare', cost: 3, targeting: 'none',
      keywords: { exhaust: true },
      text: 'Every Cat gains Frenzy 2 and 2 Claws. Draw 2. Exhaust.',
      flavor: 'Tuesday. Every Tuesday. The bins are out and the gloves are off.',
      effects: { onPlay: [P('frenzy', 2, 'allCats'), P('claws', 2, 'allCats'), { type: 'draw', amount: 2, target: 'player' }] },
      upgrade: { cost: 2, text: 'Every Cat gains Frenzy 2 and 2 Claws. Draw 2. Exhaust.' },
      tags: ['frenzy', 'claws']
    }),
    spell({
      id: 'alley_domino_hit', name: 'Domino Hit', rarity: 'rare', cost: 1, targeting: 'enemy',
      keywords: { exhaust: true },
      text: 'Deal 6 damage. If it kills, gain 2 Zoomies and add a Domino Hit to your hand. Exhaust.',
      flavor: 'One thing leads to another. Usually the vase.',
      effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 6, target: 'chosenEnemy' }, { type: 'zoomies', amount: 2, target: 'player', if: [{ check: 'targetDied', op: '==', value: true }] }, { type: 'createCard', card: 'alley_domino_hit', amount: 1, to: 'hand', if: [{ check: 'targetDied', op: '==', value: true }] }] },
      upgrade: { effects: { onPlay: [{ type: 'damage', kind: 'hit', amount: 9, target: 'chosenEnemy' }, { type: 'zoomies', amount: 2, target: 'player', if: [{ check: 'targetDied', op: '==', value: true }] }, { type: 'createCard', card: 'alley_domino_hit', amount: 1, to: 'hand', if: [{ check: 'targetDied', op: '==', value: true }] }] }, text: 'Deal 9 damage. If it kills, gain 2 Zoomies and add a Domino Hit to your hand. Exhaust.' },
      tags: ['refund', 'chain']
    }),
    spell({
      id: 'alley_void_the_warranty', name: 'Void the Warranty', rarity: 'rare', cost: 2, targeting: 'cat',
      keywords: { exhaust: true },
      text: 'Spend all but 1 Life from a Cat. Per Life spent: 4 damage to a random enemy, 1 Claws. Exhaust.',
      flavor: 'Spent the lot. Kept the receipt. Will not be returning it.',
      effects: { onPlay: [{ type: 'spendAllButOne', target: 'chosenCat' }, { type: 'damage', kind: 'hit', amount: 4, target: 'randomEnemy', times: { base: 0, per: 'lastSpent', mult: 1 } }, { type: 'applyStatus', status: 'claws', amount: { base: 0, per: 'lastSpent', mult: 1 }, target: 'chosenCat' }] },
      upgrade: { effects: { onPlay: [{ type: 'spendAllButOne', target: 'chosenCat' }, { type: 'damage', kind: 'hit', amount: 5, target: 'randomEnemy', times: { base: 0, per: 'lastSpent', mult: 1 } }, { type: 'applyStatus', status: 'claws', amount: { base: 0, per: 'lastSpent', mult: 2 }, target: 'chosenCat' }] }, text: 'Spend all but 1 Life from a Cat. Per Life spent: 5 damage to a random enemy, 2 Claws. Exhaust.' },
      tags: ['lives', 'claws', 'cornered']
    }),

    /* ======================= TOYS AND ROOMS (8) ======================= */

    /* ---- Commons (4) ---- */
    toy({
      id: 'alley_shredded_armchair', name: 'Shredded Armchair', rarity: 'common', cost: 1,
      text: 'End of your turn: a random Cat here gains 1 Claws.',
      flavor: 'Retired from furniture. Promoted to infrastructure.',
      effects: { onTurnEnd: [P('claws', 1, 'randomCatOnFloor')] },
      upgrade: { effects: { onTurnEnd: [P('claws', 2, 'randomCatOnFloor')] }, text: 'End of your turn: a random Cat here gains 2 Claws.' },
      tags: ['claws', 'room']
    }),
    toy({
      id: 'alley_dented_bin_lid', name: 'Dented Bin Lid', rarity: 'common', cost: 1,
      text: 'Cats deployed here gain Pounce 1 this fight.',
      flavor: 'Not a shield. Not a drum. A launch pad, if you commit.',
      effects: { onCatDeployed: [{ type: 'grantKeyword', keyword: 'pounce', amount: 1, target: 'triggerSource' }] },
      upgrade: { cost: 0, text: 'Cats deployed here gain Pounce 1 this fight.' },
      tags: ['pounce', 'room']
    }),
    toy({
      id: 'alley_welcome_mat', name: 'Hostile Welcome Mat', rarity: 'common', cost: 1,
      text: 'Whenever an enemy enters this floor, it takes 2 damage.',
      flavor: 'Reads "WELCOME". Smells of other people\'s dinner.',
      effects: { onEnemyEnter: [{ type: 'damage', kind: 'hit', amount: 2, target: 'triggerSource' }] },
      upgrade: { effects: { onEnemyEnter: [{ type: 'damage', kind: 'hit', amount: 4, target: 'triggerSource' }] }, text: 'Whenever an enemy enters this floor, it takes 4 damage.' },
      tags: ['room', 'tempo']
    }),
    toy({
      id: 'alley_gutter_gym', name: 'Gutter Gym', rarity: 'common', cost: 2,
      text: 'Cats here have +1 Attack. Cats deployed here gain 1 Claws.',
      flavor: 'A drainpipe, two bricks, and a lot of grunting.',
      aura: [{ stat: 'power', amount: 1, target: 'allCatsOnFloor' }],
      effects: { onCatDeployed: [P('claws', 1, 'triggerSource')] },
      upgrade: { effects: { onCatDeployed: [P('claws', 2, 'triggerSource')] }, text: 'Cats here have +1 Attack. Cats deployed here gain 2 Claws.' },
      tags: ['claws', 'room']
    }),

    /* ---- Uncommons (3) ---- */
    toy({
      id: 'alley_grindstone', name: 'Grindstone', rarity: 'uncommon', cost: 2,
      text: 'Whenever a Cat here attacks, it gains 1 Claws (once per Cat per turn).',
      flavor: 'Found behind the chip shop. Still warm, somehow.',
      effects: { onCatAttack: [{ type: 'applyStatus', status: 'claws', amount: 1, target: 'triggerSource', limit: { per: 'turn', n: 1, keyed: true } }] },
      upgrade: { cost: 1, text: 'Whenever a Cat here attacks, it gains 1 Claws (once per Cat per turn).' },
      tags: ['claws', 'room', 'frenzy']
    }),
    toy({
      id: 'alley_back_alley_ring', name: 'Back Alley Ring', rarity: 'uncommon', cost: 2,
      text: 'Start of your turn: every Cat here gains Frenzy 1.',
      flavor: 'Four bin bags, a rope, and a bell nobody can find.',
      effects: { onTurnStart: [P('frenzy', 1, 'allCatsOnFloor')] },
      upgrade: { effects: { onTurnStart: [P('frenzy', 2, 'allCatsOnFloor')] }, text: 'Start of your turn: every Cat here gains Frenzy 2.' },
      tags: ['frenzy', 'room']
    }),
    toy({
      id: 'alley_springy_sofa', name: 'Springy Sofa', rarity: 'uncommon', cost: 1,
      text: 'Cats deployed here gain Pounce 2 this fight.',
      flavor: 'The springs went in 2019. The enthusiasm did not.',
      effects: { onCatDeployed: [{ type: 'grantKeyword', keyword: 'pounce', amount: 2, target: 'triggerSource' }] },
      upgrade: { effects: { onCatDeployed: [{ type: 'grantKeyword', keyword: 'pounce', amount: 3, target: 'triggerSource' }] }, text: 'Cats deployed here gain Pounce 3 this fight.' },
      tags: ['pounce', 'chain', 'room']
    }),

    /* ---- Rare (1) ---- */
    toy({
      id: 'alley_gutter_throne', name: 'The Gutter Throne', rarity: 'rare', cost: 3,
      text: 'Cats here have +2 Attack. End of your turn: a random Cat here Spends a Life, then all Cats here gain 2 Claws.',
      flavor: 'A milk crate. Whoever sits on it believes in it.',
      aura: [{ stat: 'power', amount: 2, target: 'allCatsOnFloor' }],
      effects: { onTurnEnd: [{ type: 'lives', amount: -1, spend: true, target: 'randomCatOnFloor' }, P('claws', 2, 'allCatsOnFloor')] },
      upgrade: { effects: { onTurnEnd: [{ type: 'lives', amount: -1, spend: true, target: 'randomCatOnFloor' }, P('claws', 3, 'allCatsOnFloor')] }, text: 'Cats here have +2 Attack. End of your turn: a random Cat here Spends a Life, then all Cats here gain 3 Claws.' },
      tags: ['lives', 'claws', 'room', 'cornered']
    })
  ];
})();
