/* SUNBEAM SIEGE: hand-built encounters (agent C5)
 *
 * Exports
 *   SB.data.encounters     { act1, act2, act3, events, tutorial }
 *       act1/act2/act3:  { budgets, prowl[14], night[10], elite[4], boss[], visitors{} }
 *       events:          { enc_evt_*: encounter }   (the seven ids events.js references)
 *       tutorial:        {}  (scripted fights live in SB.data.tutorial.fights)
 *   SB.data.encounterRules  selection weights, no repeat rules, difficulty curve, hpScale, Night Visitor band,
 *                           plus pure helpers: index(), pick(ctx), bind(enc, night, opts), expandWave(wave),
 *                           nodeNight(act,row), visitorBand(act,type), visitorPackFor(...)
 *
 * ENCOUNTER SHAPE
 *   { id, name, act, type:'prowl'|'night'|'elite'|'boss', tier, rows (prowl) | nightSlot (night), budget, threat,
 *     waves:[{round, spawns:[{id, floor, at, count, mod?}]}], turns:[min,max], family, archetype, pressure[],
 *     question, counterplay[], visitors (table id), omenBan[], intro, rules{nightClock,impatienceRound,...},
 *     rewardKey, elite?, bossId?, winIf?, event? }
 *   - Wave rule is A02 section 8: a wave with round N is on the board at the start of round N and is spawned in the
 *     Spawn phase of round N minus 1. Wave 1 is always round 1 (Setup). `count` expands to that many entries in
 *     list order. `at` is 'back' (default) or 'front'. `floor` is 1 unless a window spawn is intended.
 *   - `threat` is the sum of count x pest threat over every wave, at hpScale 1 (hpScale does not change threat).
 *     It does not include dynamic summons (Dog Walker leash, Court Rats, Hose Coils) or Night Visitors. Those are
 *     priced into each pest's own threat number by the enemy agents.
 *   - Night Visitors are separate: see visitors tables below and encounterRules.visitors.
 *   - The `threat` numbers are written by tests/encounter-test.js style math and are re-checked by that test.
 *
 * NEEDS (for the engine agent, nothing here is silently invented):
 *   1. Spawn entry field `count` (expand to repeated entries) and optional `mod` {name, skin, hpMult, fluff}
 *      (Roomba Mk II lead unit, re-skinned crows for the pigeon flock, coat-wearing raccoons).
 *   2. Encounter fields `rules`, `winIf`, `onWinRemainingPests`, `onWinReturnSwallowed`, `onWinFreeTrapped`
 *      are copied from enemies-bosses.js and use its winIf shapes.
 *   3. Window spawns (floor 2 or 3) for non elite pests: used only by enc_evt_chandelier_spiders (tutorial.js
 *      already asks for the same thing).
 *   4. Night Visitor spawns read encounter.visitors (a table id) and SB.data.encounterRules.visitorPackFor().
 *   5. SB.content.pest(id) must resolve boss add ids (pest_add_*) as well as regular pests.
 *   6. Act exemption: enc_evt_pigeon_flock uses Garden Crows and Magpie Pilferers (acts 1 and 2) in Act 3 as
 *      "pigeons" through `actExempt`. No pigeon pest exists yet.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

SB.data.encounters = (function () {
  'use strict';

  /* ---------------------------------------------------------------- builders */
  function sp(id, count, o) {
    var e = { id: id.indexOf('pest_') === 0 ? id : 'pest_' + id, floor: 1, at: 'back', count: count || 1 };
    if (o) for (var k in o) e[k] = o[k];
    return e;
  }
  function wv(round) { return { round: round, spawns: Array.prototype.slice.call(arguments, 1) }; }

  var BUDGET = {
    1: { soft: 8, prowl: 12, night: 20, elite: 28, boss: 45 },
    2: { prowl: 20, night: 32, elite: 42, boss: 70 },
    3: { prowl: 30, night: 46, elite: 60, boss: 100 }
  };
  var ROWS = {
    1: { soft: [1], light: [1, 2, 4, 5], standard: [2, 4, 5], hard: [4, 5] },
    2: { light: [1, 2, 4, 5], standard: [1, 2, 4, 5], hard: [4, 5] },
    3: { light: [1, 2, 4, 5], standard: [1, 2, 4, 5], hard: [4, 5] }
  };
  var TURNS = { prowl: [4, 5], night: [6, 6], elite: [6, 6], boss: [8, 8] };
  var RULES = { nightClock: true, impatienceRound: 16 };

  function base(type, act, id, threat, o) {
    var e = {
      id: id, name: '', act: act, type: type, tier: o.tier || type,
      budget: o.budget || (o.tier === 'soft' ? BUDGET[1].soft : BUDGET[act][type]),
      threat: threat, waves: [], turns: TURNS[type].slice(), family: '', archetype: '', pressure: [],
      question: '', counterplay: [], visitors: null, omenBan: [], intro: '',
      rules: { nightClock: RULES.nightClock, impatienceRound: RULES.impatienceRound }, rewardKey: type
    };
    for (var k in o) e[k] = o[k];
    return e;
  }
  // Prowl: tier soft|light|standard|hard decides the map rows it may appear on.
  function PR(act, id, threat, o) {
    var e = base('prowl', act, id, threat, o);
    e.rows = ROWS[act][o.tier].slice();
    e.mystery = o.tier !== 'soft';
    if (!e.visitors) e.visitors = 'a' + act + '_general';
    return e;
  }
  // Night: nightSlot A (first big night of the act), B (second), any.
  function NI(act, id, threat, o) {
    var e = base('night', act, id, threat, o);
    e.tier = o.nightSlot; e.nightSlot = o.nightSlot;
    if (!e.visitors) e.visitors = 'a' + act + '_general';
    return e;
  }
  function EL(act, id, threat, o) {
    var e = base('elite', act, id, threat, o);
    e.tier = 'elite'; e.rewardKey = 'elite';
    if (!e.visitors) e.visitors = 'a' + act + '_general';
    return e;
  }

  /* ---------------------------------------------------------------- Night Visitor tables
   * A pack is what spawns (floor 1, back) at the end of a Witching Hour. Pack threat must sit inside
   * encounterRules.visitorBand(act, type), which is about 25 percent of one normal wave of that encounter type.
   * Rowdy Hour omen: +50 percent. Eternal Night (Great Bath): doubled. Stopped Clock relic: +50 percent.
   */
  function pk(id, threat, w, name, spawns) { return { id: id, name: name, threat: threat, w: w, spawns: spawns }; }
  var VISITORS = {
    1: {
      a1_general: [
        pk('nv1_ghost', 1, 6, 'A Ghost Mouse', [sp('ghost_mouse')]),
        pk('nv1_ghost_pair', 2, 4, 'Two Ghost Mice', [sp('ghost_mouse', 2)]),
        pk('nv1_ghost_trio', 3, 2, 'Three Ghost Mice', [sp('ghost_mouse', 3)]),
        pk('nv1_nightcap', 3, 3, 'Nightcap Mouse', [sp('nightcap_mouse')]),
        pk('nv1_hamster', 4, 1, 'Midnight Hamster', [sp('midnight_hamster')])
      ],
      a1_nap: [
        pk('nv1n_ghost', 1, 3, 'A Ghost Mouse', [sp('ghost_mouse')]),
        pk('nv1n_ghost_pair', 2, 4, 'Two Ghost Mice', [sp('ghost_mouse', 2)]),
        pk('nv1n_nightcap', 3, 5, 'Nightcap Mouse', [sp('nightcap_mouse')]),
        pk('nv1n_hamster', 4, 3, 'Midnight Hamster', [sp('midnight_hamster')])
      ],
      a1_climb: [
        pk('nv1c_ghost', 1, 4, 'A Ghost Mouse', [sp('ghost_mouse')]),
        pk('nv1c_ghost_pair', 2, 4, 'Two Ghost Mice', [sp('ghost_mouse', 2)]),
        pk('nv1c_fleas', 3, 3, 'Night Fleas', [sp('flea', 3)]),
        pk('nv1c_hornets', 4, 2, 'Night Hornets', [sp('hornet', 2)])
      ]
    },
    2: {
      a2_general: [
        pk('nv2_ghost_pair', 2, 4, 'Two Ghost Mice', [sp('ghost_mouse', 2)]),
        pk('nv2_ghost_trio', 3, 3, 'Three Ghost Mice', [sp('ghost_mouse', 3)]),
        pk('nv2_spider', 3, 4, 'Cellar Spider', [sp('spider')]),
        pk('nv2_possum', 4, 3, 'Possum Playing Dead', [sp('possum')]),
        pk('nv2_spider_ghost', 4, 2, 'Spider and Ghost', [sp('spider'), sp('ghost_mouse')]),
        pk('nv2_owl', 5, 2, 'Owl, Silent', [sp('owl')])
      ],
      a2_wild: [
        pk('nv2w_ghost_pair', 2, 3, 'Two Ghost Mice', [sp('ghost_mouse', 2)]),
        pk('nv2w_spider', 3, 4, 'Cellar Spider', [sp('spider')]),
        pk('nv2w_possum', 4, 4, 'Possum Playing Dead', [sp('possum')]),
        pk('nv2w_owl', 5, 3, 'Owl, Silent', [sp('owl')])
      ],
      a2_nap: [
        pk('nv2n_ghost_pair', 2, 3, 'Two Ghost Mice', [sp('ghost_mouse', 2)]),
        pk('nv2n_nightcap', 3, 5, 'Nightcap Mouse', [sp('nightcap_mouse')]),
        pk('nv2n_nightcap_ghost', 4, 3, 'Nightcap and Ghost', [sp('nightcap_mouse'), sp('ghost_mouse')]),
        pk('nv2n_possum', 4, 3, 'Possum Playing Dead', [sp('possum')])
      ]
    },
    3: {
      a3_general: [
        pk('nv3_ghost_trio', 3, 3, 'Three Ghost Mice', [sp('ghost_mouse', 3)]),
        pk('nv3_spider', 3, 3, 'Attic Spider', [sp('spider')]),
        pk('nv3_spider_ghost', 4, 3, 'Spider and Ghost', [sp('spider'), sp('ghost_mouse')]),
        pk('nv3_possum', 4, 3, 'Possum Playing Dead', [sp('possum')]),
        pk('nv3_owl', 5, 3, 'Owl, Silent', [sp('owl')]),
        pk('nv3_owl_ghost', 6, 2, 'Owl and Ghost Mouse', [sp('owl'), sp('ghost_mouse')])
      ],
      a3_clock: [
        pk('nv3k_alarm', 4, 5, 'Alarm Clock, Early', [sp('alarm_clock')]),
        pk('nv3k_alarm_ghost', 5, 3, 'Alarm Clock and Ghost', [sp('alarm_clock'), sp('ghost_mouse')]),
        pk('nv3k_owl', 5, 3, 'Owl, Silent', [sp('owl')]),
        pk('nv3k_possum_alarm', 8, 1, 'Possum and Alarm Clock', [sp('possum'), sp('alarm_clock')])
      ],
      a3_web: [
        pk('nv3w_ghost_trio', 3, 3, 'Three Ghost Mice', [sp('ghost_mouse', 3)]),
        pk('nv3w_spider', 3, 4, 'Attic Spider', [sp('spider')]),
        pk('nv3w_spider_tick', 6, 3, 'Spider and Tick', [sp('spider'), sp('tick')]),
        pk('nv3w_spider_pair', 6, 2, 'Two Attic Spiders', [sp('spider', 2)])
      ]
    }
  };

  /* ================================================================ ACT 1 */
  var act1 = {
    budgets: BUDGET[1],
    visitors: VISITORS[1],
    prowl: [
      PR(1, 'enc_a1_p_pantry_raid', 8, { name: 'Pantry Raid', tier: 'soft', family: 'mice', archetype: 'swarm', pressure: [],
        intro: 'Small mice, big opinions about your biscuits.',
        question: 'Can you make room for three bodies and one thimble?',
        counterplay: ['Any damage kills a Field Mouse, so spend cheap cards on the swarm.', 'Thimble Mouse armor teaches that Fluff on pests is real.'],
        waves: [wv(1, sp('field_mouse', 3)), wv(2, sp('alley_rat')), wv(3, sp('thimble_mouse'), sp('gerbil_goon'))] }),
      PR(1, 'enc_a1_p_small_time_crooks', 8, { name: 'Small Time Crooks', tier: 'soft', family: 'gerbils', archetype: 'swarm', pressure: [],
        intro: 'A gerbil syndicate, scaled down to fit the cellar.',
        question: 'Do you notice the Goons get stronger in company?',
        counterplay: ['Goons gain Attack per other Gerbil, so thin them before they stack.', 'Sweep and multi hit shine here.'],
        waves: [wv(1, sp('gerbil_goon', 2), sp('field_mouse')), wv(2, sp('gerbil_goon', 2), sp('field_mouse')), wv(3, sp('alley_rat'))] }),
      PR(1, 'enc_a1_p_snack_thief', 8, { name: 'Snack Thief', tier: 'soft', family: 'mice', archetype: 'thieves', pressure: [],
        intro: 'Somebody has been at the kibble. Several somebodies.',
        question: 'Will you kill the Pantry Mouse before it bolts with your Fish?',
        counterplay: ['Pantry Mouse steals on its second action, so kill it inside two rounds.', 'The Chipmunk is a racer: keep an eye on the Attic.'],
        waves: [wv(1, sp('field_mouse', 2)), wv(2, sp('pantry_mouse'), sp('field_mouse')), wv(3, sp('stripe_chipmunk'), sp('field_mouse'))] }),
      PR(1, 'enc_a1_p_rat_pack', 12, { name: 'Rat Pack', tier: 'standard', family: 'rats', archetype: 'swarm', pressure: ['knock'],
        intro: 'They travel in a pack and they bill as a pack.',
        question: 'Can you kill rats without letting them stack their bonus?',
        counterplay: ['Alley Rats gain Attack per other Rat, so AoE beats single target.', 'Knocking one rat down only moves it away from the damage.', 'Kill the Piper Rat before it hands out Rage.'],
        waves: [wv(1, sp('alley_rat', 2)), wv(2, sp('alley_rat', 2)), wv(4, sp('piper_rat'), sp('field_mouse'))] }),
      PR(1, 'enc_a1_p_garden_raid', 12, { name: 'Garden Raid', tier: 'standard', family: 'garden', archetype: 'climbers', pressure: ['hidden'],
        intro: 'Squirrels do not respect the Hold rule. Squirrels respect nuts.',
        question: 'Is anything of yours standing in the Attic?',
        counterplay: ['Squirrels climb past cats, so put a cat in the Attic early.', 'The Chipmunk pings the Sunbeam from the Attic, Shade covers it.'],
        waves: [wv(1, sp('field_mouse', 2), sp('garden_squirrel')), wv(2, sp('garden_squirrel'), sp('stripe_chipmunk')), wv(4, sp('alley_rat'))] }),
      PR(1, 'enc_a1_p_thimble_armada', 11, { name: 'Thimble Armada', tier: 'light', family: 'mice', archetype: 'armor', pressure: ['bigHit'],
        intro: 'Little hats, little shields, big attitude.',
        question: 'Do you have anything that is not one huge hit?',
        counterplay: ['Thimble Mice start with 4 Fluff and re-armor. Shatter, Pierce and multi hit beat them.', 'One big hit wastes overkill on a 3 HP mouse.'],
        waves: [wv(1, sp('thimble_mouse', 2)), wv(2, sp('thimble_mouse', 2)), wv(3, sp('field_mouse', 3))] }),
      PR(1, 'enc_a1_p_puppy_class', 13, { name: 'Puppy Class', tier: 'hard', family: 'dogs', archetype: 'dog_pack', pressure: ['pile'],
        intro: 'Nobody told the puppies it is a quiet cellar.',
        question: 'Can you stop the Rage chain before it starts?',
        counterplay: ['The Yappy Pup feeds Rage to the other dogs, so kill it first. The Terrier is a Climber that ignores Scared.', 'Hiss on a dog stops Rage gain and a Pile has to survive the Corgi shove.'],
        waves: [wv(1, sp('yap_pup'), sp('field_mouse')), wv(2, sp('scrap_terrier'), sp('corgi_herder')), wv(4, sp('pug_snort'), sp('gerbil_goon'))] }),
      PR(1, 'enc_a1_p_murder_in_the_garden', 12, { name: 'Murder in the Garden', tier: 'standard', family: 'birds', archetype: 'climbers', pressure: ['hidden'],
        intro: 'A murder of crows, plus one magpie with opinions.',
        question: 'Do you sweep, or do you chase them one at a time?',
        counterplay: ['Each Crow hits harder per other Crow, so kill them together.', 'Magpie steals Fluff, so do not live on one big wall.'],
        visitors: 'a1_climb',
        waves: [wv(1, sp('crow', 2)), wv(2, sp('crow', 2), sp('magpie')), wv(4, sp('hornet'))] }),
      PR(1, 'enc_a1_p_light_sleepers', 12, { name: 'Light Sleepers', tier: 'standard', family: 'mice', archetype: 'nap_punish', pressure: ['nap'],
        intro: 'They heard you getting comfortable.',
        question: 'Will you nap where the Vole can reach you?',
        counterplay: ['Alarm Vole hits a napping cat for Rude Awakening damage.', 'Box or Hide your sleepers, or only nap behind a wall.', 'Nightcap Mouse strips Rested, so time the Stretch.'],
        visitors: 'a1_nap',
        waves: [wv(1, sp('alarm_vole'), sp('field_mouse')), wv(2, sp('nightcap_mouse'), sp('alley_rat')), wv(4, sp('alarm_vole'))] }),
      PR(1, 'enc_a1_p_prickly_welcome', 12, { name: 'Prickly Welcome', tier: 'standard', family: 'garden', archetype: 'heavy_wall', pressure: ['knock'],
        intro: 'Everything in this garden has a way of saying no.',
        question: 'What do you do when Knock It Off does nothing?',
        counterplay: ['Hedgehog and Goose are Heavy and shrug off Knock.', 'Shatter, Hairball and Yarn work where pushing does not.', 'Bristle punishes melee, so use ranged or Spell damage on the Hedgehog.'],
        waves: [wv(1, sp('snake'), sp('field_mouse')), wv(2, sp('hedgehog'), sp('flea')), wv(4, sp('goose'))] }),
      PR(1, 'enc_a1_p_flea_circus', 11, { name: 'Flea Circus', tier: 'light', family: 'parasites', archetype: 'parasites', pressure: ['fluff'],
        intro: 'The act is small. The itching is not.',
        question: 'Can you deal with enemies that are on you, not in front of you?',
        counterplay: ['Fleas latch on and bite through Fluff. Tap the host and pay Zoomies, or use Purr aura 10.', 'Fleas count for the win check, so they cannot be ignored.'],
        visitors: 'a1_climb',
        waves: [wv(1, sp('flea', 3)), wv(2, sp('flea', 3), sp('hornet')), wv(4, sp('hornet'), sp('gerbil_goon'))] }),
      PR(1, 'enc_a1_p_sticky_paws', 12, { name: 'Sticky Paws', tier: 'standard', family: 'thieves', archetype: 'thieves', pressure: ['fluff'],
        intro: 'Gerald says he has never seen these people before.',
        question: 'Who gets killed first, the Mouse or the Magpie?',
        counterplay: ['Pantry Mouse steals Fish, Magpie steals Fluff. Prioritise by what you value this fight.', 'Tunnel Vole skips the Hold rule: keep one cat on every floor you can.'],
        waves: [wv(1, sp('pantry_mouse'), sp('magpie')), wv(2, sp('pantry_mouse'), sp('magpie'), sp('field_mouse')), wv(4, sp('tunnel_vole'))] }),
      PR(1, 'enc_a1_p_salad_days', 13, { name: 'Salad Days', tier: 'hard', family: 'household', archetype: 'scare', pressure: ['pile'],
        intro: 'The cucumber is not ready to talk about it.',
        question: 'Can you keep your cats attacking while everything is going bump?',
        counterplay: ['Cucumber ambushes on its second action and Scares the floor.', 'Knock It Off pops a Balloon for free.', 'Tinfoil Slippery means double Shatter.'],
        waves: [wv(1, sp('cucumber'), sp('gerbil_goon')), wv(2, sp('balloon'), sp('tinfoil')), wv(4, sp('cucumber'))] }),
      PR(1, 'enc_a1_p_manicure', 12, { name: 'Manicure', tier: 'standard', family: 'household', archetype: 'countdown', pressure: ['claws'],
        intro: 'The clippers are out. Everyone remember their nails.',
        question: 'Do you kill the clippers before the countdown, or play around it?',
        counterplay: ['Nail Clippers strip all Claws when the timer ends. Kill it or Yarn it.', 'Closed Door is a wall: leave it for last and let the others die first.'],
        waves: [wv(1, sp('nail_clippers'), sp('field_mouse')), wv(2, sp('closed_door')), wv(4, sp('nail_clippers'))] })
    ],
    night: [
      NI(1, 'enc_a1_n_gerbil_syndicate', 20, { name: 'The Gerbil Syndicate', nightSlot: 'A', family: 'gerbils', archetype: 'summoner', pressure: ['pile'],
        intro: 'The Don has a nice suit and a tiny hat.',
        question: 'Do you kill the Don early, or let the Goons come and kill them in a row?',
        counterplay: ['Gerbil Don summons two Goons per Whistle, cap 4. Kill him and the gang is Dazed.', 'Piper Rat gives Rage to everyone, kill it first.', 'Alarm Vole punishes sleepers, so keep Nappers boxed.'],
        waves: [wv(1, sp('gerbil_goon', 2), sp('field_mouse', 2)), wv(2, sp('gerbil_don'), sp('gerbil_goon')), wv(4, sp('alarm_vole'), sp('gerbil_goon', 2)), wv(5, sp('piper_rat'), sp('tunnel_vole'))] }),
      NI(1, 'enc_a1_n_midnight_wheel', 21, { name: 'The Midnight Wheel', nightSlot: 'B', family: 'rodents', archetype: 'nap_punish', pressure: ['nap'],
        intro: 'The wheel never stops. Neither does the hamster.',
        question: 'Can you stop the Hamster snowball before the Witching Hour?',
        counterplay: ['Midnight Hamster gains Rage each Wheel Spin and +2 Attack in a Witching Hour.', 'Yarn, Purr aura 10 and fast kills answer it.', 'Nightcap Whisper strips Rested, so Nap on odd rounds only.'],
        visitors: 'a1_nap', omenBan: ['quiet_house'],
        waves: [wv(1, sp('midnight_hamster'), sp('field_mouse', 2)), wv(2, sp('nightcap_mouse'), sp('alley_rat')), wv(4, sp('midnight_hamster'), sp('gerbil_goon')), wv(5, sp('nightcap_mouse'), sp('thimble_mouse'))] }),
      NI(1, 'enc_a1_n_below_the_boiler', 22, { name: 'Below the Boiler', nightSlot: 'B', family: 'rats', archetype: 'heavy_wall', pressure: ['knock'],
        intro: 'The big one has a name. It is mostly Thump.',
        question: 'Will you kill the Brute or the rats it is leading?',
        counterplay: ['Basement Brute is Heavy and cannot be Knocked, and its death gives other Rats Rage.', 'Clear the small rats before the Brute dies, or take the Rage on a Fluff wall.', 'Alley Rats stack with each other, so sweep.'],
        waves: [wv(1, sp('alley_rat', 2), sp('field_mouse')), wv(2, sp('brute_rat')), wv(4, sp('alley_rat', 2), sp('piper_rat')), wv(5, sp('alley_rat'), sp('thimble_mouse'))] }),
      NI(1, 'enc_a1_n_hornet_hollow', 20, { name: 'Hornet Hollow', nightSlot: 'A', family: 'wild', archetype: 'climbers', pressure: ['hidden'],
        intro: 'Flying things that do not understand walls.',
        question: 'Is the Attic ready for visitors?',
        counterplay: ['Hornets, Crows and Squirrels all ignore the Hold rule. Put cats on the Attic first.', 'Kill one hornet and the other speeds up, so Sweep both in one step.', 'Chipmunk is Sneaky and pings the Sunbeam, Shade matters.'],
        visitors: 'a1_climb',
        waves: [wv(1, sp('hornet', 2), sp('crow')), wv(2, sp('crow', 2), sp('stripe_chipmunk')), wv(4, sp('garden_squirrel', 2)), wv(5, sp('hornet'))] }),
      NI(1, 'enc_a1_n_kennel_club', 20, { name: 'Kennel Club', nightSlot: 'A', family: 'dogs', archetype: 'dog_pack', pressure: ['pile'],
        intro: 'Open day at the kennel. Please do not feed the Retriever.',
        question: 'Can you break the Rage chain and survive the Fetch?',
        counterplay: ['Yappy Pups feed Rage to every other dog. Hiss on the first dog stops the engine.', 'Retriever drags your weakest cat down a floor. Keep the weak cat boxed or in the Cellar.', 'Purr aura 10 strips a Rage each Dusk.'],
        waves: [wv(1, sp('yap_pup'), sp('scrap_terrier')), wv(2, sp('scrap_terrier'), sp('corgi_herder')), wv(4, sp('retriever_fetch')), wv(5, sp('dachshund_dash'))] }),
      NI(1, 'enc_a1_n_slumber_party', 21, { name: 'Slumber Party', nightSlot: 'B', family: 'rodents', archetype: 'nap_punish', pressure: ['nap', 'hidden'],
        intro: 'You are all invited to sleep. They are not going to be gentle.',
        question: 'Where does your Nap plan sit when something wants to wake it?',
        counterplay: ['Alarm Vole punishes a napping cat; Box or Hide the sleeper.', 'Nightcap Mouse strips Rested without damage, so Nap right after it dies.', 'Hamster Ball breaks your Pile, so do not rely on one.'],
        visitors: 'a1_nap', omenBan: ['quiet_house'],
        waves: [wv(1, sp('alarm_vole'), sp('nightcap_mouse')), wv(2, sp('hamster_ball'), sp('alley_rat')), wv(4, sp('alarm_vole'), sp('nightcap_mouse')), wv(5, sp('nightcap_mouse'), sp('field_mouse'))] }),
      NI(1, 'enc_a1_n_household_tick_tock', 20, { name: 'Tick Tock Household', nightSlot: 'A', family: 'household', archetype: 'countdown', pressure: ['claws'],
        intro: 'Small objects with timers. One of them is a cucumber.',
        question: 'Which fuse do you deal with first?',
        counterplay: ['Balloon and Nail Clippers count down, so Yarn buys a round and Knock deflates the Balloon.', 'Closed Door is a wall, pay out its Zoomies by killing it last.', 'Tinfoil is Slippery, Shatter it.'],
        waves: [wv(1, sp('nail_clippers'), sp('field_mouse', 2)), wv(2, sp('balloon'), sp('tinfoil')), wv(4, sp('closed_door')), wv(5, sp('cucumber'), sp('field_mouse'))] }),
      NI(1, 'enc_a1_n_thieves_guild', 20, { name: 'Thieves Guild', nightSlot: 'any', family: 'thieves', archetype: 'thieves', pressure: ['fluff'],
        intro: 'Everyone here has taken something of yours.',
        question: 'What are you willing to lose to keep the rest?',
        counterplay: ['Pantry Mouse takes Fish, Magpie takes Fluff, Raccoon takes a draw card.', 'Kill the Raccoon before its next Rummage and the card comes home.', 'Two Chipmunks are Sneaky racers, keep Shade up.'],
        visitors: 'a1_climb',
        waves: [wv(1, sp('pantry_mouse'), sp('magpie'), sp('field_mouse')), wv(2, sp('raccoon'), sp('stripe_chipmunk')), wv(4, sp('pantry_mouse'), sp('magpie')), wv(5, sp('tunnel_vole'), sp('stripe_chipmunk'))] }),
      NI(1, 'enc_a1_n_garden_party', 22, { name: 'Garden Party', nightSlot: 'B', family: 'garden', archetype: 'heavy_wall', pressure: ['knock', 'claws'],
        intro: 'Guests are encouraged to arrive on foot and leave on someone else\'s.',
        question: 'What kills a line of enemies that refuse to move?',
        counterplay: ['Goose, Hedgehog and Retriever shrug off Knock. Use Shatter, Hairball or Yarn.', 'Goose Honk Scares and then grows, so kill it before the second Honk.', 'Hedgehog Bristle punishes melee.'],
        waves: [wv(1, sp('goose'), sp('snake')), wv(2, sp('hedgehog'), sp('crow', 2)), wv(4, sp('retriever_fetch')), wv(5, sp('hedgehog'))] }),
      NI(1, 'enc_a1_n_toy_soldiers', 20, { name: 'Toy Soldiers', nightSlot: 'any', family: 'mice', archetype: 'armor', pressure: ['bigHit', 'knock'],
        intro: 'A tank, a platoon, a pilot who will land softly.',
        question: 'Can you chew through armor while the Tank charges?',
        counterplay: ['Tank Commander Mouse is Heavy, ignores Knock, and gains Fluff every Rev. Burst it down between Revs.', 'Thimble Mice armor up, so multi hit and Pierce.', 'The pilot Field Mouse leaps out on the Tank\'s death.'],
        waves: [wv(1, sp('thimble_mouse', 2), sp('field_mouse')), wv(2, sp('toy_tank_mouse', 1, { at: 'front' })), wv(4, sp('thimble_mouse', 2), sp('stripe_chipmunk')), wv(5, sp('pantry_mouse'))] })
    ],
    elite: [
      EL(1, 'enc_a1_e_duchess_of_drains', 28, { name: 'The Duchess Receives', elite: 'pest_elite_duchess_of_drains', family: 'rats', archetype: 'summoner', pressure: ['sweep'],
        intro: 'Her Grace is at home to callers. Callers are not at home to her.',
        question: 'Can you split the court from the Duchess?',
        counterplay: ['She takes 20 percent less damage per courtier (max 60). Kill the court or Knock her away from it.', 'AoE and Sweep clear Court Rats between Decrees.'],
        waves: [wv(1, sp('alley_rat', 2), sp('field_mouse')), wv(2, sp('elite_duchess_of_drains')), wv(4, sp('alley_rat'), sp('gerbil_goon', 2)), wv(5, sp('piper_rat'), sp('field_mouse', 2))] }),
      EL(1, 'enc_a1_e_lawn_gnome_sergeant', 30, { name: 'Gnome on Parade', elite: 'pest_elite_lawn_gnome_sergeant', family: 'garden', archetype: 'armor', pressure: ['bigHit'],
        intro: 'No hit over five. He has a speech about it.',
        question: 'Do you have a deck of many small hits?',
        counterplay: ['Stoic: no single hit over 5. Multi hit, Claws, Dizzy, Hairball and Shatter all get around it.', 'Single big spells are wasted. Squirrels and Crows are soft targets for them.'],
        waves: [wv(1, sp('elite_lawn_gnome_sergeant'), sp('field_mouse', 2)), wv(2, sp('garden_squirrel'), sp('crow')), wv(4, sp('crow', 2)), wv(5, sp('hornet'), sp('stripe_chipmunk'))] }),
      EL(1, 'enc_a1_e_magpie_the_fence', 28, { name: 'The Fence', elite: 'pest_elite_magpie_fence', family: 'thieves', archetype: 'thieves', pressure: ['box', 'fluff'],
        intro: 'Everything in the Attic fell off a truck. This one fell off yours.',
        question: 'Who guards the Attic while the cellar is busy?',
        counterplay: ['The Fence spawns on the Attic, steals Room items and pecks the Sunbeam. Put cats and Shade up there.', 'Kill it for the stolen items back and 20 Fish.'],
        visitors: 'a1_climb',
        waves: [wv(1, sp('pantry_mouse', 2), sp('magpie')), wv(2, sp('elite_magpie_fence', 1, { floor: 3 })), wv(4, sp('magpie'), sp('stripe_chipmunk', 2)), wv(5, sp('pantry_mouse'), sp('magpie'))] }),
      EL(1, 'enc_a1_e_duke_good_boy', 29, { name: 'Duke, A Good Boy', elite: 'pest_elite_duke_good_boy', family: 'dogs', archetype: 'dog_pack', pressure: ['pile'],
        intro: 'Duke has been waiting at the door since eleven this morning.',
        question: 'Can you kill him before Rage turns him into a wall?',
        counterplay: ['Rage grows every round and Hide appears at Rage 5. Burst him early.', 'Hiss, Yarn and Fluff all answer him.', 'The Yappy Pup feeds Rage to other dogs, so clear it first.'],
        waves: [wv(1, sp('yap_pup'), sp('scrap_terrier')), wv(2, sp('elite_duke_good_boy')), wv(4, sp('corgi_herder'), sp('yap_pup')), wv(5, sp('scrap_terrier'))] })
    ],
    boss: []
  };

  /* ================================================================ ACT 2 */
  var act2 = {
    budgets: BUDGET[2],
    visitors: VISITORS[2],
    prowl: [
      PR(2, 'enc_a2_p_glider_raid', 20, { name: 'Glider Raid', tier: 'standard', family: 'garden', archetype: 'climbers', pressure: ['hidden'],
        intro: 'Squirrels, but they have discovered air.',
        question: 'Can you hold the Attic against enemies who skip two floors?',
        counterplay: ['Glider Squirrels climb two floors per advance. Keep a cat in the Attic from round one.', 'Chipmunk is Sneaky, Shade soaks it.'],
        visitors: 'a2_wild',
        waves: [wv(1, sp('flying_squirrel'), sp('crow')), wv(2, sp('garden_squirrel'), sp('stripe_chipmunk'), sp('magpie')), wv(4, sp('flying_squirrel'), sp('hornet'), sp('gerbil_goon'))] }),
      PR(2, 'enc_a2_p_pack_rat_plunder', 20, { name: 'Pack Rat Plunder', tier: 'standard', family: 'rats', archetype: 'box_breakers', pressure: ['box'],
        intro: 'If it fits, they take it. They also take the box.',
        question: 'What happens to your Box when a Pack Rat arrives?',
        counterplay: ['Pack Rat destroys a Room item and gains Fluff. Kill it before it Raids, or run without Boxes.', 'Rat pack bonus: sweep, do not single target.'],
        waves: [wv(1, sp('alley_rat', 2), sp('pack_rat')), wv(2, sp('pack_rat'), sp('piper_rat')), wv(4, sp('alley_rat'), sp('tunnel_vole'))] }),
      PR(2, 'enc_a2_p_lint_trap', 22, { name: 'Lint Trap', tier: 'hard', family: 'cleaners', archetype: 'cleaners', pressure: ['fluff', 'pile'],
        intro: 'The house has finally gotten around to you.',
        question: 'What is left of your plan when Fluff and Purr get wiped?',
        counterplay: ['Lint Roller strips all Fluff and wears it. Do not stack Fluff before it dies.', 'Robot Vacuum wipes Purr and flattens a Box. Kill it fast or avoid dependence.', 'Cone of Shame breaks Piles.'],
        waves: [wv(1, sp('lint_roller'), sp('tinfoil')), wv(2, sp('robot_vacuum'), sp('cone_of_shame')), wv(4, sp('lint_roller'), sp('stripe_chipmunk'))] }),
      PR(2, 'enc_a2_p_spritz_squad', 20, { name: 'Spritz Squad', tier: 'standard', family: 'household', archetype: 'wet', pressure: ['claws', 'pile'],
        intro: 'Bad cat. Bad. Cat.',
        question: 'Are your cats ready to be Wet?',
        counterplay: ['Wet halves Claws and Purr and blocks Fluff. Cleanse or a Heat Lamp clears it.', 'Spray Bottle is Sneaky and hits the front cat on every floor.', 'Cucumber Scares the floor, Piles of 3 help.'],
        waves: [wv(1, sp('spray_bottle'), sp('cucumber')), wv(2, sp('spray_bottle'), sp('tinfoil')), wv(4, sp('cucumber'), sp('gerbil_goon'))] }),
      PR(2, 'enc_a2_p_beagle_choir', 20, { name: 'Beagle Choir', tier: 'standard', family: 'dogs', archetype: 'dog_pack', pressure: ['pile'],
        intro: 'Four-part harmony, none of the parts are in tune.',
        question: 'Can you silence the Beagles before everyone is in Rage?',
        counterplay: ['Beagle Bay gives Rage to every dog on the board. Kill them first.', 'Guard Dog adds Hide and Rage to its floor, Pierce and burst.', 'Hiss 3 blocks Rage gain.'],
        waves: [wv(1, sp('yap_pup', 2), sp('beagle_bayer')), wv(2, sp('guard_dog')), wv(4, sp('beagle_bayer'), sp('yap_pup'))] }),
      PR(2, 'enc_a2_p_bark_park', 22, { name: 'Bark Park', tier: 'hard', family: 'dogs', archetype: 'yowl', pressure: ['pile', 'fluff'],
        intro: 'Leash laws are more of a suggestion.',
        question: 'Can you take a Yowl on every floor and still swing?',
        counterplay: ['Husky Yowl Scares a random cat on each floor. Purr aura 40 makes cats immune.', 'Retriever drags the weakest cat down, Beagle Bay feeds Rage.'],
        waves: [wv(1, sp('scrap_terrier'), sp('corgi_herder')), wv(2, sp('husky_howler')), wv(4, sp('retriever_fetch'), sp('beagle_bayer'))] }),
      PR(2, 'enc_a2_p_hot_dog_stand', 20, { name: 'Hot Dog Stand', tier: 'standard', family: 'dogs', archetype: 'shovers', pressure: ['box', 'knock'],
        intro: 'Long, low, and more present than you wanted.',
        question: 'Can you stay on your floor when the dogs reach over it?',
        counterplay: ['Dachshund hits two floors at once. The Bulldog is Heavy and dents Boxes.', 'Shatter, Yarn and Hiss, not Knock, for the Bulldog.'],
        waves: [wv(1, sp('dachshund_dash'), sp('pug_snort')), wv(2, sp('bulldog_bruiser')), wv(4, sp('dachshund_dash'), sp('yap_pup'))] }),
      PR(2, 'enc_a2_p_night_shift', 20, { name: 'Night Shift', tier: 'standard', family: 'rodents', archetype: 'nap_punish', pressure: ['nap'],
        intro: 'They work nights. You nap nights. This is a conflict.',
        question: 'Can you nap at all with the whole shift watching?',
        counterplay: ['Alarm Vole, Hamster and Possum all punish Nappers. Box or Hide the sleeper.', 'Possum plays dead and Scares, which strips Purr.'],
        visitors: 'a2_nap', omenBan: ['quiet_house'],
        waves: [wv(1, sp('alarm_vole'), sp('nightcap_mouse')), wv(2, sp('midnight_hamster'), sp('nightcap_mouse')), wv(4, sp('alarm_vole'), sp('possum'))] }),
      PR(2, 'enc_a2_p_parasite_picnic', 19, { name: 'Parasite Picnic', tier: 'light', family: 'parasites', archetype: 'parasites', pressure: ['fluff', 'lives'],
        intro: 'The tick brought sandwiches. The sandwiches are you.',
        question: 'How much Zoomies do you want to spend on itching?',
        counterplay: ['Ticks swell and make Scratch cost 2 Zoomies. Cleanse and Purr aura 10 help.', 'A host that loses a life frees the parasite, so do not let it.', 'Hornets and Spiders climb past the Hold rule.'],
        visitors: 'a2_wild',
        waves: [wv(1, sp('flea', 3), sp('tick')), wv(2, sp('tick', 2), sp('hornet')), wv(4, sp('spider'), sp('flea', 2))] }),
      PR(2, 'enc_a2_p_grooming_day', 20, { name: 'Grooming Day', tier: 'standard', family: 'household', archetype: 'armor', pressure: ['fluff', 'hidden'],
        intro: 'Appointments only. Walk-ins will be dried.',
        question: 'Can you crack a Poodle that has Hide 10?',
        counterplay: ['Poodle strips Fluff and Hide 10 hurts. Wet removes all Hide.', 'Hair Dryer ignores Hidden and Yarn. Cone of Shame breaks Piles.', 'Lint Roller makes Fluff walls pointless.'],
        waves: [wv(1, sp('poodle_attitude'), sp('cone_of_shame')), wv(2, sp('lint_roller'), sp('cone_of_shame')), wv(4, sp('hair_dryer'))] }),
      PR(2, 'enc_a2_p_henhouse', 20, { name: 'Fox in the Henhouse', tier: 'standard', family: 'wild', archetype: 'thieves', pressure: ['lives'],
        intro: 'The fox is polite. The crows are not.',
        question: 'Which of your cats is on 3 HP?',
        counterplay: ['Fox Snap hits for 7 when a cat is at 3 HP or less, cheap bodies and Boxes avoid it.', 'Crows bite harder in a pack, Raccoon Rummage takes a draw card.'],
        visitors: 'a2_wild',
        waves: [wv(1, sp('fox'), sp('crow', 2)), wv(2, sp('raccoon'), sp('magpie')), wv(4, sp('fox'), sp('crow'))] }),
      PR(2, 'enc_a2_p_vet_visit', 21, { name: 'Vet Visit', tier: 'hard', family: 'household', archetype: 'hostage', pressure: ['pile', 'lives'],
        intro: 'It is only a check up. It is never only a check up.',
        question: 'Will you free the cat in the crate before the scale hears about it?',
        counterplay: ['Carrier Crate traps your weakest non-Large cat. Killing it frees the cat.', 'Vet Scale punishes crowds with damage per cat on the floor.', 'Cone of Shame breaks Piles.'],
        waves: [wv(1, sp('carrier_crate'), sp('cone_of_shame')), wv(2, sp('vet_scale'), sp('cone_of_shame')), wv(4, sp('hornet'), sp('stripe_chipmunk'))] }),
      PR(2, 'enc_a2_p_slam_door', 20, { name: 'Slam Door', tier: 'standard', family: 'household', archetype: 'heavy_wall', pressure: ['pile', 'knock'],
        intro: 'Doors that slam, wheels that roll, nobody will say sorry.',
        question: 'Can you win a fight against walls?',
        counterplay: ['Closed Door is Anchored and pays Zoomies and a draw when it opens. Plan the opening.', 'Hamster Ball shoves your front cat to the back and breaks Piles.'],
        waves: [wv(1, sp('closed_door'), sp('gerbil_goon')), wv(2, sp('hamster_ball', 2), sp('field_mouse')), wv(4, sp('closed_door'), sp('alley_rat'))] }),
      PR(2, 'enc_a2_p_dead_weight', 20, { name: 'Dead Weight', tier: 'light', family: 'rodents', archetype: 'heavy_wall', pressure: ['knock', 'bigHit'],
        intro: 'Nothing here is moving, and nothing here is leaving.',
        question: 'What is your answer to Heavy?',
        counterplay: ['Tank Mouse and Bulldog are Heavy: Shatter, Hiss and Yarn work, Knock does not.', 'Thimble Mice make single big hits wasteful.'],
        waves: [wv(1, sp('hedgehog'), sp('thimble_mouse'), sp('gerbil_goon')), wv(2, sp('toy_tank_mouse')), wv(4, sp('bulldog_bruiser'))] })
    ],
    night: [
      NI(2, 'enc_a2_n_deep_clean', 31, { name: 'Deep Clean', nightSlot: 'A', family: 'cleaners', archetype: 'cleaners', pressure: ['fluff', 'pile', 'box'],
        intro: 'Spring cleaning came early, and it brought a vacuum.',
        question: 'What does your deck look like without Purr, Fluff or a Box?',
        counterplay: ['Mop halves Purr and clears Hairballs. Vacuum flattens a Box and wipes Purr.', 'Lint Roller makes Fluff walls pointless, so use damage and Lives instead.', 'Heat Lamp and Cleanse remove Wet.'],
        waves: [wv(1, sp('mop'), sp('lint_roller')), wv(2, sp('robot_vacuum'), sp('cone_of_shame')), wv(4, sp('lint_roller'), sp('cone_of_shame')), wv(5, sp('robot_vacuum'))] }),
      NI(2, 'enc_a2_n_spray_and_pray', 33, { name: 'Spray and Pray', nightSlot: 'B', family: 'household', archetype: 'wet', pressure: ['claws', 'pile'],
        intro: 'Every squirt is personal.',
        question: 'Can you keep cats dry long enough to hit anything?',
        counterplay: ['Spray Bottle Spritz hits the front cat of every floor. Wet 3 becomes Scared.', 'Cleanse and Heat Lamp matter. Mop Slop splashes a Pile.', 'Tinfoil is Slippery, Shatter doubles.'],
        waves: [wv(1, sp('spray_bottle'), sp('cucumber')), wv(2, sp('mop'), sp('tinfoil')), wv(4, sp('spray_bottle'), sp('cucumber')), wv(5, sp('spray_bottle'), sp('balloon'), sp('gerbil_goon'))] }),
      NI(2, 'enc_a2_n_dog_walkers_day', 35, { name: 'The Dog Walker\'s Day', nightSlot: 'B', family: 'dogs', archetype: 'summoner', pressure: ['pile', 'knock'],
        intro: 'Seven dogs on one lead is not a plan. It is a statement.',
        question: 'Do you kill the Walker, or the dogs he brings?',
        counterplay: ['Leashed dogs cannot be Knocked; killing the Walker gives them Rage 3 and Climber.', 'Kill him early if you cannot hold the floor, late if you can.', 'Guard Dog adds Hide and Rage on its floor.'],
        waves: [wv(1, sp('beagle_bayer'), sp('yap_pup'), sp('scrap_terrier')), wv(2, sp('dog_walker')), wv(4, sp('guard_dog'), sp('corgi_herder')), wv(5, sp('bloodhound_sniffer'))] }),
      NI(2, 'enc_a2_n_yowl_and_bay', 32, { name: 'Yowl and Bay', nightSlot: 'A', family: 'dogs', archetype: 'yowl', pressure: ['pile', 'fluff'],
        intro: 'This is how the neighbours learned your name.',
        question: 'Can you keep up the damage under a double Yowl?',
        counterplay: ['Husky Yowl Scares a random cat on every floor; Scared 2 costs exactly one attack phase.', 'Beagle Bay spreads Rage to every dog. Hiss on a Beagle denies it.', 'Purr aura 40 gives immunity to Scared.'],
        waves: [wv(1, sp('yap_pup', 2), sp('beagle_bayer')), wv(2, sp('husky_howler'), sp('scrap_terrier')), wv(4, sp('beagle_bayer'), sp('corgi_herder')), wv(5, sp('husky_howler'))] }),
      NI(2, 'enc_a2_n_tomcat_turf', 33, { name: 'Tomcat Turf', nightSlot: 'B', family: 'wild', archetype: 'mirror', pressure: ['bigHit', 'lives'],
        intro: 'Somebody has been copying your best cat. Somebody is angry about it.',
        question: 'What if your strongest cat is your biggest problem?',
        counterplay: ['Tomcat copies the Attack and spec of your strongest cat, plus 1. Spread power across several cats.', 'Tomcat is Costly: a cat it kills loses 2 lives. Knock or Yarn the Tomcat away from your best cat.', 'Fox Snaps cats at 3 HP.'],
        visitors: 'a2_wild',
        waves: [wv(1, sp('fox'), sp('crow', 2)), wv(2, sp('tomcat'), sp('magpie')), wv(4, sp('fox'), sp('raccoon')), wv(5, sp('tomcat'), sp('hornet'), sp('flea'))] }),
      NI(2, 'enc_a2_n_sleepover_disaster', 32, { name: 'Sleepover Disaster', nightSlot: 'B', family: 'rodents', archetype: 'nap_punish', pressure: ['nap', 'hidden', 'lives'],
        intro: 'You will be tired. They are counting on it.',
        question: 'Can you win a night fight without your Nap engine?',
        counterplay: ['Alarm Vole, Nightcap, Possum and Owl all punish sleepers. Time Naps after they die.', 'Owl is Costly and silent on its first move; Hide or Box your best cat.', 'Midnight Hamster Rage plus Witching Hour is the real clock.'],
        visitors: 'a2_nap', omenBan: ['quiet_house'],
        waves: [wv(1, sp('alarm_vole'), sp('nightcap_mouse')), wv(2, sp('midnight_hamster'), sp('possum')), wv(4, sp('alarm_vole'), sp('nightcap_mouse'), sp('spider')), wv(5, sp('owl'), sp('midnight_hamster'))] }),
      NI(2, 'enc_a2_n_skybridge', 32, { name: 'Skybridge', nightSlot: 'A', family: 'wild', archetype: 'climbers', pressure: ['hidden'],
        intro: 'Nothing here walks upstairs.',
        question: 'How many floors can you hold at once?',
        counterplay: ['Gliders, Spiders and Hornets all skip the Hold rule. Spread cats so the Attic is never empty.', 'Spider Web Frazzles your strongest cat; kill it on arrival.', 'Sweep for the hornet pairs.'],
        visitors: 'a2_wild',
        waves: [wv(1, sp('flying_squirrel'), sp('hornet', 2)), wv(2, sp('spider'), sp('crow', 2)), wv(4, sp('flying_squirrel', 2)), wv(5, sp('spider'), sp('hornet'), sp('stripe_chipmunk'), sp('crow'))] }),
      NI(2, 'enc_a2_n_box_breakers', 32, { name: 'Box Breakers', nightSlot: 'any', family: 'mixed', archetype: 'box_breakers', pressure: ['box', 'hidden'],
        intro: 'If it is cardboard, it is wrong.',
        question: 'What happens to a Hidden cat when the enemy can smell it?',
        counterplay: ['Bulldog and Pack Rat break Boxes. Bloodhound ignores Hidden and flattens a Box.', 'Poodle strips Fluff. Pierce and Shatter keep working when walls do not.', 'Leave your Box plan for the Attic and keep the front line on guts.'],
        waves: [wv(1, sp('pack_rat'), sp('pug_snort')), wv(2, sp('bulldog_bruiser')), wv(4, sp('bloodhound_sniffer'), sp('pack_rat')), wv(5, sp('poodle_attitude'), sp('beagle_bayer'))] }),
      NI(2, 'enc_a2_n_waiting_room', 31, { name: 'The Waiting Room', nightSlot: 'A', family: 'household', archetype: 'hostage', pressure: ['pile', 'lives'],
        intro: 'Please take a number. Your number is eleven.',
        question: 'Can you free hostages without losing the fight?',
        counterplay: ['Carrier Crate traps the weakest non-Large cat. Kill it to free the cat.', 'Vet Scale hits harder for every cat on a floor. Spread your cats.', 'Cone of Shame breaks Piles.'],
        visitors: 'a2_wild',
        waves: [wv(1, sp('carrier_crate'), sp('cone_of_shame')), wv(2, sp('vet_scale'), sp('flea', 2)), wv(4, sp('carrier_crate'), sp('hornet')), wv(5, sp('cone_of_shame'), sp('hornet'), sp('stripe_chipmunk'))] }),
      NI(2, 'enc_a2_n_the_wall', 32, { name: 'The Wall', nightSlot: 'any', family: 'mixed', archetype: 'heavy_wall', pressure: ['knock', 'bigHit'],
        intro: 'Nothing here is going anywhere, so make yourself comfortable.',
        question: 'How do you win a fight where nobody can be moved?',
        counterplay: ['Bulldogs, Brute, Hedgehog and Goose are Heavy; Closed Door is Anchored. Shatter, Hiss, Yarn.', 'Bristle punishes melee, so use spells on the Hedgehog.', 'Impatience arrives at round 16. You have time but not that much.'],
        omenBan: ['full_moon'],
        waves: [wv(1, sp('hedgehog'), sp('goose')), wv(2, sp('bulldog_bruiser'), sp('closed_door')), wv(4, sp('brute_rat')), wv(5, sp('bulldog_bruiser'))] })
    ],
    elite: [
      EL(2, 'enc_a2_e_count_cucumber', 41, { name: 'Count Cucumber Dines', elite: 'pest_elite_count_cucumber', family: 'household', archetype: 'scare', pressure: ['lives', 'pile'],
        intro: 'He is very, very cool about this.',
        question: 'Can you keep your strongest cat in the fight?',
        counterplay: ['The Count Scares your strongest cat and gains Hide per Scared cat.', 'Cleanse and Purr aura 40 stop it; cheap bodies spread the threat.', 'Burst him in the round after Cold Slice.'],
        waves: [wv(1, sp('cucumber'), sp('tinfoil'), sp('gerbil_goon')), wv(2, sp('elite_count_cucumber')), wv(4, sp('cucumber'), sp('balloon')), wv(5, sp('tinfoil'), sp('cone_of_shame'))] }),
      EL(2, 'enc_a2_e_mop_and_bucket', 42, { name: 'Mop and Bucket Brigade', elite: 'pest_elite_mop_and_bucket', family: 'cleaners', archetype: 'wet', pressure: ['claws', 'pile'],
        intro: 'They have a bucket. They are not afraid to use it.',
        question: 'Do you have a plan for a floor that is water?',
        counterplay: ['Wet 2 on three cats, floods floors. Heat Lamp, Cleanse and non-Claws builds.', 'It slips in its own Puddle: Knock it into the lower floor.', 'Spray Bottle adds more Wet, kill it first.'],
        waves: [wv(1, sp('spray_bottle'), sp('gerbil_goon')), wv(2, sp('elite_mop_and_bucket')), wv(4, sp('lint_roller'), sp('cone_of_shame')), wv(5, sp('spray_bottle'))] }),
      EL(2, 'enc_a2_e_static_duster', 42, { name: 'Static Cling', elite: 'pest_elite_static_duster', family: 'cleaners', archetype: 'cleaners', pressure: ['fluff'],
        intro: 'Everything sticks to him. Mostly your Fluff.',
        question: 'Can you win a fight where your Fluff is his Fluff?',
        counterplay: ['Static Duster strips Fluff from three cats and wears it. Do not live on Fluff.', 'Pierce, Shatter and fast kills work. Vacuum wipes Purr too.', 'Poodle strips Fluff, so kill it early.'],
        waves: [wv(1, sp('poodle_attitude'), sp('lint_roller')), wv(2, sp('elite_static_duster')), wv(4, sp('robot_vacuum')), wv(5, sp('cone_of_shame'), sp('hornet'))] }),
      EL(2, 'enc_a2_e_wheelie_bin_warden', 43, { name: 'Bin Day', elite: 'pest_elite_wheelie_bin_warden', family: 'wild', archetype: 'box_breakers', pressure: ['box', 'hidden'],
        intro: 'Collection is on Thursday. It is always Thursday now.',
        question: 'What is your plan if Boxes and Hidden both fail?',
        counterplay: ['Warden is Heavy, flattens Boxes, ignores Hidden and hits double against Hidden cats.', 'Pierce and Attic burst; Boxes are a liability here.', 'Raccoons keep stealing draw cards, so kill them early.'],
        waves: [wv(1, sp('raccoon'), sp('crow', 2)), wv(2, sp('elite_wheelie_bin_warden')), wv(4, sp('raccoon'), sp('magpie')), wv(5, sp('pack_rat'), sp('flea'))] })
    ],
    boss: []
  };

  /* ================================================================ ACT 3 */
  var act3 = {
    budgets: BUDGET[3],
    visitors: VISITORS[3],
    prowl: [
      PR(3, 'enc_a3_p_storm_front', 30, { name: 'Storm Front', tier: 'standard', family: 'weather', archetype: 'weather', pressure: ['pile', 'lives'],
        intro: 'The sky has a lot to say, and so do the neighbours.',
        question: 'Can you ride out Scared on every floor?',
        counterplay: ['Thunderstorm, Fireworks and Balloons all Scare every floor. Piles of 3 are immune to the Storm.', 'Knock pops a Balloon; Wet stops a Fireworks fuse.', 'Alarm Clock punishes Nappers.'],
        waves: [wv(1, sp('balloon'), sp('hornet', 2)), wv(2, sp('thunderstorm'), sp('ghost_mouse')), wv(4, sp('fireworks'), sp('balloon'), sp('alarm_clock'))] }),
      PR(3, 'enc_a3_p_alphas_walk', 32, { name: 'Alpha\'s Walk', tier: 'hard', family: 'dogs', archetype: 'yowl', pressure: ['pile', 'fluff'],
        intro: 'The Alpha is out for a stroll. Everyone has a stake in it.',
        question: 'Can you survive the Rally Howl on every floor?',
        counterplay: ['Pack Alpha Rally Howl Scares the front cat on all three floors, one action in three.', 'Alpha grows when dogs die. Kill small dogs after the Alpha, not before.', 'Purr aura 40 gives immunity.'],
        waves: [wv(1, sp('scrap_terrier', 2), sp('corgi_herder')), wv(2, sp('pack_alpha')), wv(4, sp('beagle_bayer', 2), sp('corgi_herder'))] }),
      PR(3, 'enc_a3_p_wolf_at_the_flap', 30, { name: 'Wolf at the Flap', tier: 'standard', family: 'dogs', archetype: 'climbers', pressure: ['hidden', 'lives'],
        intro: 'The flap is meant for cats. The wolf has not read the sign.',
        question: 'Who protects the Sunbeam from something that can bypass your cats?',
        counterplay: ['Wolf is Climber and Sneaky: it hits the Sunbeam even if cats stand in the way. Shade and kill priority.', 'Its HP is lowish on purpose, so focus it.', 'Nocturnal: +2 Attack at Witching Hour.'],
        waves: [wv(1, sp('scrap_terrier', 2)), wv(2, sp('wolf_prowler'), sp('corgi_herder')), wv(4, sp('wolf_prowler'), sp('scrap_terrier'))] }),
      PR(3, 'enc_a3_p_tide_pool', 31, { name: 'Tide Pool', tier: 'standard', family: 'household', archetype: 'wet', pressure: ['claws', 'pile'],
        intro: 'It began as a drip. It is now a position.',
        question: 'Can you keep dry cats while the water rises?',
        counterplay: ['Bath Tide Overflows Puddles two floors; Splash hits whole Piles.', 'Heat Lamp and Cleanse are worth playing around. Mop and Spray Bottle add more Wet.', 'Kill the Tide before the Overflow round.'],
        waves: [wv(1, sp('mop'), sp('spray_bottle')), wv(2, sp('bath_tide')), wv(4, sp('mop'), sp('lint_roller'), sp('cone_of_shame'))] }),
      PR(3, 'enc_a3_p_husky_choir', 32, { name: 'Husky Choir', tier: 'hard', family: 'dogs', archetype: 'yowl', pressure: ['pile', 'fluff'],
        intro: 'Opera, but with more teeth.',
        question: 'How many Yowls can your front line absorb?',
        counterplay: ['Husky Yowl is one action in three, and Beagle Bay feeds the Rage.', 'Burst the Husky between Yowls; Hiss on a Beagle stops the chain.', 'Purr aura 40 gives immunity to Scared.'],
        waves: [wv(1, sp('corgi_herder', 2), sp('beagle_bayer')), wv(2, sp('husky_howler'), sp('beagle_bayer')), wv(4, sp('husky_howler'), sp('beagle_bayer'))] }),
      PR(3, 'enc_a3_p_dot_duty', 27, { name: 'Dot Duty', tier: 'light', family: 'household', archetype: 'puzzle', pressure: ['hidden'],
        intro: 'You cannot catch it. You will try anyway.',
        question: 'Do you chase the dot or the things around it?',
        counterplay: ['The Laser Dot cannot be damaged: Hidden cats attacking drain it by 4, chasing drains Stamina. It times out after 8 rounds.', 'Spend your damage on everything else; do not waste cards on the Dot.'],
        waves: [wv(1, sp('laser_dot'), sp('hornet', 2)), wv(2, sp('possum'), sp('flea', 3)), wv(4, sp('tomcat'), sp('hornet'), sp('ghost_mouse'))] }),
      PR(3, 'enc_a3_p_clock_tower', 30, { name: 'Clock Tower', tier: 'standard', family: 'household', archetype: 'nap_punish', pressure: ['nap'],
        intro: 'The hour is whatever the owl says it is.',
        question: 'When is it safe to sleep?',
        counterplay: ['Alarm Clock Ring wakes Nappers. Hits snooze it, so kill or Yarn it before the ring.', 'Owl is silent on its first move and Costly. Possum plays dead and Scares.', 'Nocturnal pests are +2 at Witching Hour.'],
        visitors: 'a3_clock', omenBan: ['quiet_house'],
        waves: [wv(1, sp('alarm_clock'), sp('tick'), sp('ghost_mouse')), wv(2, sp('owl'), sp('alarm_clock'), sp('ghost_mouse', 2)), wv(4, sp('alarm_clock'), sp('possum'), sp('spider'))] }),
      PR(3, 'enc_a3_p_admission', 29, { name: 'Admission', tier: 'light', family: 'household', archetype: 'hostage', pressure: ['pile', 'lives'],
        intro: 'The nurse will see you now. Both of you.',
        question: 'Can you rescue a hostage and still hold the line?',
        counterplay: ['Carrier Crate traps the weakest non-Large cat; killing the crate frees it.', 'Vet Scale hits per cat on its floor. Cone of Shame breaks Piles.', 'Ticks and Fleas keep Zoomies tight.'],
        waves: [wv(1, sp('carrier_crate'), sp('cone_of_shame')), wv(2, sp('vet_scale'), sp('tick')), wv(4, sp('carrier_crate'), sp('cone_of_shame'), sp('hornet'), sp('flea'))] }),
      PR(3, 'enc_a3_p_spider_season', 28, { name: 'Spider Season', tier: 'light', family: 'parasites', archetype: 'parasites', pressure: ['fluff', 'lives'],
        intro: 'Every corner you turn has one more corner in it.',
        question: 'Can you keep Zoomies when everything is trying to stick to your cats?',
        counterplay: ['Spiders Spin Web to Frazzle your strongest cat. Ticks swell and make Scratch costly.', 'Cleanse and Purr aura 10 for Fleas.', 'Spiders and Hornets climb past the Hold rule.'],
        visitors: 'a3_web',
        waves: [wv(1, sp('flea', 3), sp('tick', 2)), wv(2, sp('spider', 2), sp('hornet')), wv(4, sp('spider'), sp('tick', 2), sp('hornet'))] }),
      PR(3, 'enc_a3_p_robot_army', 33, { name: 'Robot Army', tier: 'hard', family: 'cleaners', archetype: 'cleaners', pressure: ['fluff', 'pile', 'box'],
        intro: 'They have a docking station and a grudge.',
        question: 'Can you win when nothing in your build survives the cleaning?',
        counterplay: ['Vacuum is Heavy and wipes Purr and Boxes; Mop and Lint Roller wipe Purr and Fluff.', 'Hair Dryer ignores Hidden. Kill the Vacuums first.', 'Cone of Shame breaks Piles.'],
        waves: [wv(1, sp('lint_roller'), sp('mop')), wv(2, sp('robot_vacuum'), sp('hair_dryer')), wv(4, sp('robot_vacuum'), sp('lint_roller'), sp('cone_of_shame'))] }),
      PR(3, 'enc_a3_p_swan_lake', 30, { name: 'Swan Lake', tier: 'standard', family: 'wild', archetype: 'heavy_wall', pressure: ['pile', 'knock'],
        intro: 'It is a ballet. It is an aggressive ballet.',
        question: 'What does your plan do against a floor-wide Wing Buffet?',
        counterplay: ['Swan is Heavy, 4 Fluff, and Wing Buffet hits the whole floor. Spread your cats.', 'Hedgehog is a Knock sink: Shatter, not melee.', 'Fox Snaps cats at 3 HP.'],
        waves: [wv(1, sp('swan'), sp('hornet', 2)), wv(2, sp('raccoon'), sp('hedgehog'), sp('ghost_mouse')), wv(4, sp('swan'), sp('fox'))] }),
      PR(3, 'enc_a3_p_firework_show', 30, { name: 'Firework Show', tier: 'standard', family: 'household', archetype: 'countdown', pressure: ['claws', 'fluff'],
        intro: 'Sparklers are for hands. You have paws.',
        question: 'Can you kill the fuses before they burn?',
        counterplay: ['Fireworks counts down and bombs the Sunbeam; killing it on a crowded floor hurts its neighbours. Wet stops the fuse.', 'Balloon pops when Knocked. Alarm Clock wakes Nappers.', 'Yarn pauses all countdowns.'],
        waves: [wv(1, sp('fireworks'), sp('balloon')), wv(2, sp('balloon'), sp('alarm_clock'), sp('tinfoil')), wv(4, sp('fireworks'), sp('hornet'), sp('cone_of_shame'))] }),
      PR(3, 'enc_a3_p_turf_war', 30, { name: 'Turf War', tier: 'standard', family: 'wild', archetype: 'mirror', pressure: ['bigHit', 'lives'],
        intro: 'Two tomcats, one rooftop, no sharing.',
        question: 'What if you do not have one big cat?',
        counterplay: ['Each Tomcat copies your strongest cat plus 1 and is Costly. Spread power.', 'Fox Snaps cats at 3 HP, Owl is silent on its first move.', 'Knock or Yarn the Tomcat off your best cat.'],
        waves: [wv(1, sp('fox'), sp('raccoon')), wv(2, sp('tomcat'), sp('fox')), wv(4, sp('tomcat'), sp('owl'), sp('ghost_mouse'))] }),
      PR(3, 'enc_a3_p_pack_hunt', 33, { name: 'Pack Hunt', tier: 'hard', family: 'dogs', archetype: 'dog_pack', pressure: ['box', 'hidden', 'fluff'],
        intro: 'They are coordinated, and it is the worst thing about them.',
        question: 'Which of your defenses does the pack not have an answer for?',
        counterplay: ['Bloodhound ignores Hidden and flattens a Box. Poodle strips Fluff. Guard Dog hands out Hide and Rage.', 'Bulldog is Heavy; Shatter and Yarn.', 'Hiss and Run: Hiss denies Rage and Scares.'],
        waves: [wv(1, sp('corgi_herder'), sp('scrap_terrier'), sp('beagle_bayer')), wv(2, sp('guard_dog'), sp('bloodhound_sniffer')), wv(4, sp('poodle_attitude'), sp('bulldog_bruiser'))] })
    ],
    night: [
      NI(3, 'enc_a3_n_wolves_at_the_flap', 46, { name: 'Wolves at the Flap', nightSlot: 'A', family: 'dogs', archetype: 'climbers', pressure: ['hidden', 'lives'],
        intro: 'The family dog is looking at the cat flap and does not know why.',
        question: 'Can you defend the Sunbeam from things that bypass Hold and cats?',
        counterplay: ['Wolf is Climber and Sneaky; it hits the Sunbeam even while cats block. Shade and burst.', 'Pack Alpha Rally Howl scares the front cat on every floor.', 'Wolf is Nocturnal: +2 Attack at Witching Hour.'],
        waves: [wv(1, sp('scrap_terrier', 2), sp('corgi_herder')), wv(2, sp('wolf_prowler'), sp('scrap_terrier')), wv(4, sp('wolf_prowler'), sp('beagle_bayer')), wv(5, sp('pack_alpha'))] }),
      NI(3, 'enc_a3_n_weather_warning', 47, { name: 'Weather Warning', nightSlot: 'B', family: 'weather', archetype: 'weather', pressure: ['pile', 'lives', 'nap'],
        intro: 'Barometer says no. The cats say worse.',
        question: 'Can you keep fighting while the storm Scares and Wets the house?',
        counterplay: ['Two Thunderstorms and a Fireworks keep Scared up on every floor. Piles of 3 are immune to the Storm.', 'Knock pops Balloons; Wet cats stop a Fireworks fuse for the pest.', 'Drizzle makes Wet, so Cleanse or a Heat Lamp.'],
        omenBan: ['thunder'],
        waves: [wv(1, sp('balloon', 2), sp('hornet')), wv(2, sp('thunderstorm'), sp('alarm_clock')), wv(4, sp('fireworks'), sp('balloon'), sp('alarm_clock')), wv(5, sp('thunderstorm'), sp('lint_roller'))] }),
      NI(3, 'enc_a3_n_total_sanitation', 44, { name: 'Total Sanitation', nightSlot: 'A', family: 'cleaners', archetype: 'cleaners', pressure: ['fluff', 'pile', 'box'],
        intro: 'Zero germs. Zero cats. Zero chill.',
        question: 'Do you have a plan for Purr, Fluff and a Box all disappearing at once?',
        counterplay: ['Robot Vacuums are Heavy; Mops and Lint Rollers wipe Purr and Fluff. Hair Dryer ignores Hidden and Yarn.', 'Heat Lamp and Cleanse cover Wet. Burst the Vacuums down.', 'Wipe is thorough, so rely on Lives and damage.'],
        waves: [wv(1, sp('mop'), sp('lint_roller', 2)), wv(2, sp('robot_vacuum'), sp('hair_dryer')), wv(4, sp('robot_vacuum'), sp('spray_bottle')), wv(5, sp('mop'), sp('lint_roller'))] }),
      NI(3, 'enc_a3_n_great_dane_gala', 45, { name: 'Great Dane Gala', nightSlot: 'A', family: 'dogs', archetype: 'heavy_wall', pressure: ['box', 'knock', 'fluff'],
        intro: 'Seated, he is taller than the table.',
        question: 'How do you move a mountain with a cat?',
        counterplay: ['Great Dane is Heavy, shoves cats and sits on Boxes. Shatter, Hiss and Yarn, not Knock.', 'Husky Yowl and Beagle Bay give the support. Kill the Beagles first.', 'Guard Dog gives Hide on its floor.'],
        waves: [wv(1, sp('scrap_terrier', 2), sp('beagle_bayer')), wv(2, sp('great_dane')), wv(4, sp('husky_howler'), sp('beagle_bayer')), wv(5, sp('husky_howler'), sp('guard_dog'))] }),
      NI(3, 'enc_a3_n_reveille', 47, { name: 'Reveille', nightSlot: 'B', family: 'nocturnal', archetype: 'nap_punish', pressure: ['nap', 'hidden', 'lives'],
        intro: 'Wake up. Wake up. It is later than you think.',
        question: 'What do you do when everything wants you awake?',
        counterplay: ['Alarm Clocks Ring and wake Nappers; hit them to snooze. Owl is Costly and silent on its first move.', 'Wolf is Nocturnal: +2 Attack at Witching Hour.', 'Time the Stretch on odd rounds and bring burst.'],
        visitors: 'a3_clock', omenBan: ['quiet_house'],
        waves: [wv(1, sp('alarm_clock', 2), sp('ghost_mouse', 2)), wv(2, sp('owl'), sp('possum')), wv(4, sp('alarm_clock'), sp('spider'), sp('tick')), wv(5, sp('wolf_prowler'), sp('owl'), sp('alarm_clock'))] }),
      NI(3, 'enc_a3_n_specialist_referral', 48, { name: 'Specialist Referral', nightSlot: 'B', family: 'household', archetype: 'hostage', pressure: ['pile', 'lives'],
        intro: 'Your regular vet has referred you. The specialist has a waiting list. Not for you.',
        question: 'Can you free enough cats to win?',
        counterplay: ['Carrier Crates trap the weakest non-Large cats. Kill the crates to free them.', 'Vet Scale punishes crowds. Cone of Shame breaks Piles.', 'Ticks and Hornets keep the pressure on while you rescue.'],
        waves: [wv(1, sp('carrier_crate'), sp('cone_of_shame'), sp('tick')), wv(2, sp('vet_scale'), sp('carrier_crate')), wv(4, sp('vet_scale'), sp('cone_of_shame', 2)), wv(5, sp('carrier_crate'), sp('cone_of_shame'), sp('tick'), sp('hornet'))] }),
      NI(3, 'enc_a3_n_rooftop_rivals', 46, { name: 'Rooftop Rivals', nightSlot: 'B', family: 'wild', archetype: 'mirror', pressure: ['bigHit', 'lives'],
        intro: 'Every roof has a landlord. Tonight, several.',
        question: 'Can you keep your strongest cat alive against a mirror?',
        counterplay: ['Tomcat mirrors your strongest cat plus 1; Owl is silent and Costly, Swan Wing Buffets the floor.', 'Spread your power, Knock or Yarn the Tomcats.', 'Wolf is Sneaky and Nocturnal: Shade and kill priority.'],
        waves: [wv(1, sp('fox'), sp('raccoon'), sp('ghost_mouse')), wv(2, sp('tomcat'), sp('owl')), wv(4, sp('swan'), sp('fox')), wv(5, sp('tomcat'), sp('wolf_prowler'))] }),
      NI(3, 'enc_a3_n_bath_time', 46, { name: 'Bath Time', nightSlot: 'any', family: 'household', archetype: 'wet', pressure: ['claws', 'pile', 'box'],
        intro: 'There is only one rule: do not look at the tub.',
        question: 'What is your plan for two rising tides?',
        counterplay: ['Bath Tide Water rises each action and Overflow Puddles two floors. Splash hits whole Piles.', 'Kill each Tide before its Overflow or have Cleanse and Heat Lamp ready.', 'Mop and Spray Bottle add Wet, kill them first.'],
        waves: [wv(1, sp('spray_bottle'), sp('mop')), wv(2, sp('bath_tide'), sp('tinfoil')), wv(4, sp('spray_bottle'), sp('lint_roller'), sp('cone_of_shame')), wv(5, sp('bath_tide'), sp('cone_of_shame'))] }),
      NI(3, 'enc_a3_n_laser_light_show', 46, { name: 'Laser Light Show', nightSlot: 'any', family: 'household', archetype: 'puzzle', pressure: ['hidden', 'lives'],
        intro: 'The pointer has been waiting all day for this.',
        question: 'Can you spend your damage on the right things?',
        counterplay: ['Laser Dots cannot be damaged. A Hidden cat attacking drains one by 4, chasing drains Stamina.', 'Tomcat, Owl and Fox are the real damage, so spend your hits on them.', 'The Dot has an 8 round bored timeout.'],
        waves: [wv(1, sp('laser_dot'), sp('tomcat')), wv(2, sp('owl'), sp('hornet', 2), sp('ghost_mouse')), wv(4, sp('laser_dot'), sp('fox'), sp('tick')), wv(5, sp('tomcat'), sp('spider'))] }),
      NI(3, 'enc_a3_n_evening_constitutional', 45, { name: 'The Evening Constitutional', nightSlot: 'A', family: 'dogs', archetype: 'summoner', pressure: ['pile', 'box', 'hidden', 'fluff'],
        intro: 'The Walker takes the long way. Everyone gets dragged along.',
        question: 'Can you hold the floor against a Walker and a few friends?',
        counterplay: ['Dog Walker leashes three dogs onto a floor; leashed dogs cannot be Knocked.', 'Kill him late if you hold the floor; early if you cannot.', 'Bloodhound ignores Hidden, Poodle strips Fluff, Bulldog is Heavy.'],
        waves: [wv(1, sp('corgi_herder'), sp('scrap_terrier'), sp('beagle_bayer')), wv(2, sp('dog_walker')), wv(4, sp('poodle_attitude'), sp('bloodhound_sniffer')), wv(5, sp('bulldog_bruiser'), sp('guard_dog'))] })
    ],
    elite: [
      EL(3, 'enc_a3_e_snooze_alarm', 59, { name: 'Snooze Button', elite: 'pest_elite_snooze_alarm', family: 'household', archetype: 'nap_punish', pressure: ['nap'],
        intro: 'Five more minutes. Forever.',
        question: 'When do you let your cats sleep?',
        counterplay: ['Snooze Alarm Rings every second round and wakes Nappers. Stretch on odd rounds.', 'Burst before round 6, its Hide 8 is tough but finite.', 'Owl and Possum are Nocturnal, Alarm Clock wakes Nappers.'],
        visitors: 'a3_clock', omenBan: ['quiet_house'],
        waves: [wv(1, sp('alarm_clock'), sp('ghost_mouse', 2), sp('tick')), wv(2, sp('elite_snooze_alarm')), wv(4, sp('owl'), sp('possum'), sp('hornet')), wv(5, sp('spider'), sp('alarm_clock'), sp('hornet'))] }),
      EL(3, 'enc_a3_e_thunderhead', 60, { name: 'Thunderhead', elite: 'pest_elite_thunderhead', family: 'weather', archetype: 'weather', pressure: ['bigHit', 'lives'],
        intro: 'The sky has opinions about your best cat.',
        question: 'Who takes the Bolt?',
        counterplay: ['Bolt hits the highest Attack cat, ignores Fluff, Hidden and Decoy.', 'Spread power, bait with a cheap strong cat, and let Nine Lives soak it.', 'Cleanse removes the Drizzle Wet.'],
        waves: [wv(1, sp('balloon', 2), sp('hornet', 2)), wv(2, sp('elite_thunderhead')), wv(4, sp('fireworks'), sp('tinfoil')), wv(5, sp('thunderstorm'))] }),
      EL(3, 'enc_a3_e_grand_finale_crate', 60, { name: 'Grand Finale', elite: 'pest_elite_grand_finale_crate', family: 'household', archetype: 'countdown', pressure: ['fluff'],
        intro: 'We start with a bang. It is also how we end.',
        question: 'Can you kill the crate before the fuse is out?',
        counterplay: ['Grand Finale Crate has a 3 round fuse: 14 to every cat and 10 to the Sunbeam.', 'Burst it, stockpile Fluff, Wet adds a round, Yarn pauses the fuse.', 'Fireworks and Balloons add more fuses.'],
        waves: [wv(1, sp('fireworks'), sp('balloon', 2)), wv(2, sp('elite_grand_finale_crate')), wv(4, sp('balloon'), sp('alarm_clock'), sp('hornet', 2)), wv(5, sp('fireworks'), sp('ghost_mouse'))] }),
      EL(3, 'enc_a3_e_cone_warden', 59, { name: 'Cone of Shame', elite: 'pest_elite_cone_warden', family: 'household', archetype: 'hostage', pressure: ['lives', 'pile'],
        intro: 'We do not speak of what you did. We do put a cone on it.',
        question: 'Who is your most important cat, and will they be allowed to attack?',
        counterplay: ['Cones the most-Lives cat: no attack, no Nap, no Pile. Cleanse or Spend a Life to remove it.', 'Cheap bodies spread the risk; kill the Warden first.', 'More Cones and Crates keep the pressure on.'],
        waves: [wv(1, sp('cone_of_shame', 2), sp('tick')), wv(2, sp('elite_cone_warden')), wv(4, sp('carrier_crate'), sp('cone_of_shame'), sp('hornet')), wv(5, sp('vet_scale'), sp('tick'), sp('flea'))] })
    ],
    boss: []
  };

  /* ================================================================ BOSSES (waves copied from enemies-bosses.js, checked by the test) */
  function BO(act, id, bossId, threat, o) {
    var e = base('boss', act, id, threat, o);
    e.tier = 'boss'; e.bossId = bossId; e.rewardKey = 'boss';
    e.rules = { nightClock: true, impatienceRound: o.impatienceRound || 16 };
    e.winIf = o.winIf || { type: 'bossDead' };
    e.onWinRemainingPests = 'vanish';
    e.visitors = o.visitors || ('a' + act + '_general');
    e.nightVisitorMult = o.nightVisitorMult || 1;
    return e;
  }
  act1.boss = [
    BO(1, 'boss_rat_king', 'pest_boss_rat_king', 49, { name: 'The Rat King', family: 'rats', archetype: 'summoner', pressure: ['sweep', 'pile'],
      intro: 'It has been a long night. The rat has been wearing a crown.',
      question: 'Can you control how many rats die in a round?',
      counterplay: ['Tribute heals him 5 per pest death (max 10 a round). Cap the kills, burst in the window after Decrees.', 'Court Rats arrive on the Parlor and Attic, not his floor. Cats there are the real test.', 'Yarn on rats is excellent: they do not die, he does not heal.'],
      waves: [wv(1, sp('boss_rat_king')), wv(4, sp('add_court_rat', 1, { floor: 2 }), sp('add_court_rat', 1, { floor: 3 }))] }),
    BO(1, 'boss_garden_hose', 'pest_boss_garden_hose', 53, { name: 'The Garden Hose', family: 'garden', archetype: 'wet', pressure: ['pile', 'box'],
      intro: 'Serpent of the lawn. Bad day to have a Pile.',
      question: 'Can you cut Pressure before it Blasts?',
      counterplay: ['At Pressure 4 it Blasts: cats shoved to the back, Wet 2, Boxes washed away. Each Coil you kill takes 2 Pressure.', 'Cleanse and Heat Lamp clear the Wet.', 'Piles and Boxes are the victims, keep a plan B.'],
      waves: [wv(1, sp('boss_garden_hose'), sp('add_hose_coil', 1, { floor: 2 })), wv(5, sp('add_hose_coil', 1, { floor: 3 }))] })
  ];
  act2.boss = [
    BO(2, 'boss_vacuum_mk9', 'pest_boss_vacuum_mk9', 74, { name: 'The Vacuum Mk IX', family: 'cleaners', archetype: 'cleaners', pressure: ['fluff', 'box', 'pile'],
      intro: 'Warranty void if licked.',
      question: 'Can you play around an Inhale and then punish the Jam?',
      counterplay: ['Inhale sucks 2 to 3 cards from your draw pile into the Dustbag. Favor Keep and cheap cards.', 'At bag 10 it Jams: Dazed and Spooked. Spend your burst then.', 'Swallow eats the front cat (lives untouched) and returns it on death. P3 Overheat burns it 4 a round.'],
      waves: [wv(1, sp('boss_vacuum_mk9')), wv(4, sp('add_dust_bunny', 1, { floor: 2 }), sp('add_dust_bunny', 1, { floor: 3 }))],
      onWinReturnSwallowed: true }),
    BO(2, 'boss_spray_duelist', 'pest_boss_spray_duelist', 73, { name: 'The Spray Bottle Duelist', family: 'household', archetype: 'wet', pressure: ['claws', 'pile'],
      intro: 'Pistols at dawn. Actually, squirts. Pick your cat.',
      question: 'Do you know when to poke and when to unload?',
      counterplay: ['Parry turns the first hit back as Wet 2 on you. Lead with a 1 damage poke, then unload.', 'Mist is the damage turn. Wet 3 becomes Scared, so Cleanse or Heat Lamp.', 'P2 adds Cucumber Seconds, P3 Single Stream targets your strongest cat.'],
      waves: [wv(1, sp('boss_spray_duelist', 1, { floor: 2 })), wv(4, sp('add_cucumber_second'))] })
  ];
  act3.boss = [
    BO(3, 'boss_vet_carrier', 'pest_boss_vet_carrier', 104, { name: 'The Vet Carrier', family: 'household', archetype: 'hostage', pressure: ['lives', 'hidden', 'nap'],
      intro: 'You cannot say you were not warned. The postcard did arrive.',
      question: 'Can you keep trapped cats from spending a life?',
      counterplay: ['Traps a cat each turn into a Latch (HP 12, Hide 4) with a 3 round Appointment; the timer ends a life.', 'Hidden cats cannot be traded, so Boxes are an answer here.', 'Break Latches with multi hit and keep fodder cats as bait.'],
      waves: [wv(1, sp('boss_vet_carrier', 1, { floor: 3 })), wv(4, sp('add_nurse_pest'))], onWinFreeTrapped: true, nightNineDawn: true }),
    BO(3, 'boss_red_dot', 'pest_boss_red_dot', 100, { name: 'The Red Dot', family: 'household', archetype: 'puzzle', pressure: ['hidden', 'bigHit'],
      intro: 'You cannot catch it. You will try anyway.',
      question: 'Can you hit something you cannot target?',
      counterplay: ['Untargetable by attacks and spells. AoE and floor effects, Zoom hits, Dizzy, Hairball and Yarn Pin all reach it.', 'Each teleport adds Heat, at 4 it Overheats and takes +50 percent.', 'It burns the Sunbeam for 4 to 7 a round, so Shade matters.'],
      waves: [wv(1, sp('boss_red_dot', 1, { floor: 3 }))], nightNineDawn: true }),
    BO(3, 'boss_great_bath', 'pest_boss_great_bath', 119, { name: 'The Great Bath', family: 'household', archetype: 'wet', pressure: ['box', 'pile', 'lives'],
      intro: 'The last drain gurgles. The towel is still warm.',
      question: 'Can you hold the house until the Dawn?',
      counterplay: ['Water rises 1 a round; at 4 it Overflows for 6 and washes Boxes away. Kill the Plug to drop 3 Water and 12 HP.', 'P2 Bubble Bath summons Reruns of the bosses you beat. P3 Dawn: win by killing it or surviving 5 Dawn rounds.', 'The Final Flush on Dawn round 3 is cancelled by Dazed.'],
      impatienceRound: 18, nightVisitorMult: 2, rewardKey: 'boss',
      winIf: { type: 'any', conds: [{ type: 'bossDead' }, { type: 'dawnRounds', atLeast: 5 }] },
      waves: [wv(1, sp('boss_great_bath', 1, { floor: 3 }), sp('add_plug_chain', 1, { floor: 2 })), wv(4, sp('add_rubber_duck', 1, { floor: 1 }), sp('add_rubber_duck', 1, { floor: 2 }))],
      finalBoss: true, selection: 'Replaces the Act 3 pick at map generation if Mischief Rank >= 5, otherwise 1 in 3 (B12 / bossRules).' })
  ];

  /* ================================================================ EVENT ENCOUNTERS */
  function EV(id, type, act, threat, o) {
    var e = base(type, act, id, threat, o);
    e.event = true; e.tier = 'event';
    e.rewardKey = 'event'; e.visitors = o.visitors || ('a' + act + '_general');
    return e;
  }
  var events = {};
  function addEv(e) { events[e.id] = e; }
  addEv(EV('enc_evt_rat_toll', 'prowl', 1, 12, { name: 'The Toll Rats', source: 'evt_rat_toll', family: 'rats', archetype: 'swarm', pressure: ['knock'],
    intro: 'Please wait. Your call is important to the whistle.',
    question: 'Can you take down a rat pack that has paid for the right?',
    counterplay: ['Alley Rats stack their Attack, so sweep.', 'Piper Rat hands out Rage, kill it first.'],
    rows: [], waves: [wv(1, sp('piper_rat'), sp('alley_rat')), wv(2, sp('alley_rat', 2)), wv(3, sp('alley_rat'), sp('field_mouse'))] }));
  addEv(EV('enc_evt_dust_bunnies', 'prowl', 2, 20, { name: 'Confederation of Dust Bunnies', source: 'evt_dust_bunnies', family: 'dust', archetype: 'swarm', pressure: ['sweep'],
    intro: 'They have a flag. They do not have an argument.',
    question: 'Can you sweep a Climber swarm before it reaches the Attic?',
    counterplay: ['Dust Bunnies are Climbers: Sweep and AoE, keep a cat on the Attic.', 'Eight HP each, so multi hit is better than one big hit.'],
    rows: [], waves: [wv(1, sp('add_dust_bunny', 3)), wv(2, sp('add_dust_bunny', 4)), wv(3, sp('add_dust_bunny', 3))] }));
  addEv(EV('enc_evt_roomba_revenge', 'prowl', 2, 21, { name: 'The Roomba\'s Revenge', source: 'evt_roomba_return_foe', family: 'cleaners', archetype: 'cleaners', pressure: ['box', 'fluff'],
    intro: 'It backs up, turns, and raises its voice to a mechanical hum.',
    question: 'Can you take down a vacuum that has brought friends?',
    counterplay: ['Robot Vacuum is Heavy and flattens Boxes; kill it fast.', 'Lint Roller and Mop strip Fluff and Purr.'],
    rows: [], waves: [wv(1, sp('robot_vacuum'), sp('add_dust_bunny')), wv(2, sp('lint_roller'), sp('add_dust_bunny', 2)), wv(4, sp('mop'))] }));
  addEv(EV('enc_evt_gerald_cousins', 'prowl', 2, 20, { name: 'Gerald\'s Cousins', source: 'evt_gerald_tab', family: 'wild', archetype: 'thieves', pressure: ['fluff'],
    intro: 'There are a lot of cousins. They all know about the tab.',
    question: 'Can you survive raccoons who each take a card?',
    counterplay: ['Each Raccoon Rummage exiles your top card; killing it returns it.', 'Kill the Raccoons before their second action.'],
    rows: [], waves: [wv(1, sp('raccoon', 2, { mod: { name: 'Cousin Raccoon', skin: 'coat' } })), wv(2, sp('raccoon', 1, { mod: { name: 'Cousin Raccoon', skin: 'coat' } }), sp('pantry_mouse')), wv(4, sp('raccoon', 1, { mod: { name: 'Cousin Raccoon', skin: 'coat' } }), sp('magpie'))] }));
  addEv(EV('enc_evt_roomba_mk2', 'elite', 3, 57, { name: 'The Roomba Mk II', source: 'evt_roomba_return', elite: null, eliteProxy: 'pest_robot_vacuum', family: 'cleaners', archetype: 'cleaners', pressure: ['box', 'fluff', 'pile'],
    intro: 'It beeps once. It is an old argument, and neither of you remembers why.',
    question: 'Can you take out an upgraded vacuum and its dust-brothers?',
    counterplay: ['The Mk II lead is a Robot Vacuum with extra HP and Fluff. Vacuums are Heavy and ignore Knock.', 'Wipes Purr, flattens Boxes; Mop and Lint Roller clear Fluff.', 'Burst the vacuums between Inhales; Hair Dryer ignores Hidden.'],
    waves: [
      wv(1, sp('robot_vacuum', 1, { mod: { name: 'Roomba Mk II', hpMult: 1.5, fluff: 4 } }), sp('lint_roller', 2)),
      wv(2, sp('robot_vacuum'), sp('mop'), sp('cone_of_shame')),
      wv(4, sp('robot_vacuum'), sp('hair_dryer'), sp('lint_roller')),
      wv(5, sp('robot_vacuum'), sp('spray_bottle'), sp('cone_of_shame'))] }));
  addEv(EV('enc_evt_chandelier_spiders', 'prowl', 3, 28, { name: 'The Chandelier', source: 'evt_chandelier_spiders', family: 'parasites', archetype: 'climbers', pressure: ['hidden'],
    intro: 'A moment of your time. He means all of it.',
    question: 'Who is watching the Attic when spiders drop in?',
    counterplay: ['The second wave drops from the chandelier straight into the Attic. Keep a cat there.', 'Spiders Spin Web to Frazzle your strongest cat. Kill them on arrival.', 'Ticks make Scratch cost 2 Zoomies.'],
    visitors: 'a3_web',
    rows: [], waves: [wv(1, sp('spider', 2), sp('hornet')), wv(2, sp('spider', 1, { floor: 3 }), sp('tick', 2), sp('hornet')), wv(4, sp('spider', 2), sp('tick'))] }));
  addEv(EV('enc_evt_pigeon_flock', 'prowl', 3, 29, { name: 'The Pigeon Flock', source: 'evt_pigeon_reveal', family: 'birds', archetype: 'climbers', pressure: ['hidden'],
    intro: 'The flock arrives. It had been hovering.',
    question: 'Can you sweep a flock that bites harder in a pack?',
    counterplay: ['Pigeons (Crows in the data) hit harder for each other bird. Sweep them together.', 'Owl is silent on its first move and Costly. Magpies strip Fluff.'],
    actExempt: ['pest_crow', 'pest_magpie'], visitors: 'a3_general',
    rows: [], waves: [
      wv(1, sp('crow', 3, { mod: { name: 'Pigeon', skin: 'pigeon' } }), sp('hornet')),
      wv(2, sp('magpie', 2, { mod: { name: 'Pigeon', skin: 'pigeon' } }), sp('crow', 2, { mod: { name: 'Pigeon', skin: 'pigeon' } }), sp('hornet')),
      wv(4, sp('owl'), sp('crow', 2, { mod: { name: 'Pigeon', skin: 'pigeon' } }), sp('magpie', 1, { mod: { name: 'Pigeon', skin: 'pigeon' } }))] }));

  return { act1: act1, act2: act2, act3: act3, events: events, tutorial: {} };
})();

/* ==================================================================== RULES */
SB.data.encounterRules = (function () {
  'use strict';
  var E = SB.data.encounters;

  var HP_SCALE_PER_NIGHT = 0.08;
  var rules = {
    version: 1,

    /* ---- A07 threat budgets (section 10) and tolerance bands ---- */
    budgets: {
      1: { soft: 8, prowl: 12, night: 20, elite: 28, boss: 45 },
      2: { prowl: 20, night: 32, elite: 42, boss: 70 },
      3: { prowl: 30, night: 46, elite: 60, boss: 100 }
    },
    // Ratio windows against budget. Totals are integers, so min = ceil(budget*lo), max = floor(budget*hi).
    bands: {
      soft: [0.875, 1.125],
      prowl: [0.90, 1.12],
      night: [0.90, 1.12],
      elite: [0.90, 1.12],
      boss: [1.00, 1.25]
    },
    tierWindows: {
      light: [0.90, 1.00], standard: [0.97, 1.08], hard: [1.05, 1.12],
      A: [0.90, 1.04], B: [0.98, 1.12], any: [0.98, 1.04]
    },
    waveShares: {
      prowl: [0.30, 0.40, 0.30], night: [0.20, 0.30, 0.30, 0.20], elite: [0.25, 0.35, 0.20, 0.20],
      allowed: { prowl: [0.08, 0.58], night: [0.08, 0.58], elite: [0.08, 0.65] }
    },
    turns: { prowl: [4, 5], night: [6, 6], elite: [6, 6], boss: [8, 8] },
    waveCounts: { prowl: 3, night: 4, elite: 4 },
    capacity: { pestRoomPerFloor: 5 },
    regularSpawnFloor: 1,
    impatienceRound: 16,

    /* ---- hpScale (A07 section 10): 1 + 0.05 * (night - 1), night 1 to 9 ---- */
    hpScalePerNight: HP_SCALE_PER_NIGHT,
    hpScale: function (night) {
      var n = Math.max(1, Math.min(9, night | 0));
      return Math.round((1 + HP_SCALE_PER_NIGHT * (n - 1)) * 100) / 100;
    },

    /* Night number a node belongs to. Rows 1 to 3 are the act's Night A, rows 4 to 6 Night B, rows 7 to 8 boss night. */
    nodeNight: function (act, row) {
      var b = (act - 1) * 3;
      if (row <= 3) return b + 1;
      if (row <= 6) return b + 2;
      return b + 3;
    },

    /* ---- Night Visitors (RULES section 6, A05 section 8) ---- */
    visitors: {
      shareOfWave: 0.25,
      lo: 0.75, hi: 1.75,
      escalation: { fromWitching: 3, hiPlus: 1 },
      spawnFloor: 1, spawnAt: 'back',
      multipliers: { rowdyHour: 1.5, stoppedClock: 1.5, eternalNight: 2 }
    },
    /* Normal wave threat for visitor sizing: budget divided by wave count (boss uses the 5 wave convention). */
    visitorShare: function (act, type) {
      var wc = rules.waveCounts[type] || 5;
      var budget = rules.budgets[act][type];
      return rules.visitors.shareOfWave * budget / wc;
    },
    visitorBand: function (act, type, witchingIndex) {
      var s = rules.visitorShare(act, type);
      var lo = Math.max(1, Math.floor(rules.visitors.lo * s));
      var hi = Math.ceil(rules.visitors.hi * s);
      if (witchingIndex && witchingIndex >= rules.visitors.escalation.fromWitching) hi += rules.visitors.escalation.hiPlus;
      return [lo, hi];
    },
    /* Pure picker: returns a pack from the encounter's table inside the band. rng() in [0,1). mult applies to the band. */
    visitorPackFor: function (enc, witchingIndex, rng, mult) {
      var act = enc.act, type = enc.type === 'boss' ? 'elite' : enc.type;
      var tables = E['act' + act].visitors;
      var table = tables[enc.visitors] || tables[Object.keys(tables)[0]];
      var band = rules.visitorBand(act, type, witchingIndex);
      var m = (mult || 1) * (enc.nightVisitorMult || 1);
      var lo = band[0], hi = Math.ceil(band[1] * m);
      var ok = table.filter(function (p) { return p.threat >= lo && p.threat <= hi; });
      if (!ok.length) ok = table.slice().sort(function (a, b) { return a.threat - b.threat; }).slice(0, 1);
      var tot = ok.reduce(function (s, p) { return s + p.w; }, 0), r = rng() * tot;
      for (var i = 0; i < ok.length; i++) { r -= ok[i].w; if (r < 0) return ok[i]; }
      return ok[ok.length - 1];
    },

    /* ---- Selection weights ---- */
    selection: {
      // Tier weights by map row group. Row groups: r1, r2, r45 (rows 4 and 5), mystery.
      prowlTierWeights: {
        1: { r1: { soft: 100 }, r2: { light: 45, standard: 45, hard: 10 }, r45: { light: 15, standard: 55, hard: 30 }, mystery: { light: 30, standard: 55, hard: 15 } },
        2: { r1: { light: 45, standard: 50, hard: 5 }, r2: { light: 35, standard: 50, hard: 15 }, r45: { light: 15, standard: 50, hard: 35 }, mystery: { light: 35, standard: 50, hard: 15 } },
        3: { r1: { light: 45, standard: 50, hard: 5 }, r2: { light: 35, standard: 50, hard: 15 }, r45: { light: 15, standard: 50, hard: 35 }, mystery: { light: 35, standard: 50, hard: 15 } }
      },
      nightSlotWeights: { A: { A: 100, any: 60, B: 0 }, B: { B: 100, any: 60, A: 0 } },
      eliteWeight: 100,
      noRepeat: 'run',                 // an encounter id is never offered twice in one run (A07 says at least once per act)
      archetypeCooldown: { last: 0.35, secondLast: 0.7 },
      familyCooldown: { last: 0.5 },
      sameRowArchetype: 0.25,          // another node in the same map row already holds this archetype
      buildPressure: { perTag: 0.1, tagCap: 3, maxBonus: 0.5 },
      fallbackOrder: ['relaxRows', 'relaxSlot', 'relaxUsed']
    },
    rowGroup: function (row, mystery) { return mystery ? 'mystery' : row === 1 ? 'r1' : row === 2 ? 'r2' : 'r45'; },

    /* ---- Mischief Rank hooks (A07 section 12) applied by bind() ---- */
    rankMods: {
      2: 'prowl wave 1 gains one extra copy of its cheapest enemy',
      3: 'elites gain one extra affix (engine)',
      10: 'all Night omens apply double (engine)'
    },
    omens: ['full_moon', 'thunder', 'cold_floor', 'quiet_house', 'draft', 'hunters_moon'],

    /* ---- Difficulty curve targets ---- */
    curve: {
      // Unhealed Warmth loss as a fraction of the act's max Warmth (A07 targets 28, 38, 48 of 50, RULES maxes 40, 45, 50).
      actLossPctOfMax: [0.56, 0.76, 0.96],
      maxWarmth: [40, 45, 50],
      // Relative weight of one fight of each type in the loss budget (prowl = 1).
      typeWeight: { prowl: 1, night: 1.8, elite: 2.6 },
      // Expected fights per path before the boss (A07 section 4 expectations).
      expectedFights: { prowl: 2.4, night: 1.65, elite: 0.47 },
      bossLossPctOfMax: [0.35, 0.44, 0.50],
      warmthAtBossStartPct: [0.62, 0.55, 0.50]
    },
    expectedLoss: function (act, type) {
      var c = rules.curve, a = act - 1;
      var maxW = c.maxWarmth[a], total = c.actLossPctOfMax[a] * maxW;
      var units = 0, k;
      for (k in c.expectedFights) units += c.expectedFights[k] * c.typeWeight[k];
      if (type === 'boss') return Math.round(c.bossLossPctOfMax[a] * maxW * 10) / 10;
      return Math.round(total / units * c.typeWeight[type] * 10) / 10;
    },
    /* Effective threat of an encounter at a given night: threat times hpScale (HP is what scales). */
    effectiveThreat: function (enc, night) { return Math.round(enc.threat * rules.hpScale(night) * 10) / 10; },

    /* ---- Helpers ---- */
    expandWave: function (wave) {
      var out = [];
      wave.spawns.forEach(function (s) {
        for (var i = 0; i < (s.count || 1); i++) {
          var e = { id: s.id, floor: s.floor || 1, at: s.at || 'back' };
          if (s.mod) e.mod = s.mod;
          out.push(e);
        }
      });
      return { round: wave.round, spawns: out };
    },
    _index: null,
    index: function () {
      if (rules._index) return rules._index;
      var m = {};
      ['act1', 'act2', 'act3'].forEach(function (a) {
        ['prowl', 'night', 'elite', 'boss'].forEach(function (t) { E[a][t].forEach(function (e) { m[e.id] = e; }); });
      });
      for (var k in E.events) m[k] = E.events[k];
      rules._index = m;
      return m;
    },
    list: function (act, type) { return E['act' + act][type] || []; },

    /* pick(ctx) returns an encounter or null.
     * ctx: { act, kind:'prowl'|'night'|'elite', row, nightSlot:'A'|'B', mystery, used:[ids], rowPicked:[ids],
     *        recent:[{archetype,family}] (most recent first), deckTags:{nap,box,pile,knock,fluff,claws,hidden,lives,bigHit,sweep}, rng }
     */
    pick: function (ctx) {
      var S = rules.selection, idx = rules.index();
      var used = {}; (ctx.used || []).forEach(function (id) { used[id] = true; });
      var rowPicked = (ctx.rowPicked || []).map(function (id) { return idx[id]; }).filter(Boolean);
      var recent = ctx.recent || [], tags = ctx.deckTags || {};
      var all = rules.list(ctx.act, ctx.kind);
      var rg = rules.rowGroup(ctx.row, ctx.mystery);

      function baseWeight(e, relaxRows, relaxSlot) {
        if (ctx.kind === 'prowl') {
          if (ctx.mystery && !e.mystery) return 0;
          if (!relaxRows && !ctx.mystery && e.rows.indexOf(ctx.row) < 0) return 0;
          var tw = S.prowlTierWeights[ctx.act][rg];
          var w = tw[e.tier];
          if (!w && relaxRows) w = 5;
          return w || 0;
        }
        if (ctx.kind === 'night') {
          var sw = S.nightSlotWeights[ctx.nightSlot || 'A'][e.nightSlot];
          if (!sw && relaxSlot) sw = 10;
          return sw || 0;
        }
        return S.eliteWeight;
      }
      function weigh(relaxRows, relaxSlot, relaxUsed) {
        return all.map(function (e) {
          if (used[e.id] && !relaxUsed) return { e: e, w: 0 };
          var w = baseWeight(e, relaxRows, relaxSlot);
          if (w <= 0) return { e: e, w: 0 };
          if (recent[0]) {
            if (recent[0].archetype === e.archetype) w *= S.archetypeCooldown.last;
            if (recent[0].family === e.family) w *= S.familyCooldown.last;
          }
          if (recent[1] && recent[1].archetype === e.archetype) w *= S.archetypeCooldown.secondLast;
          if (rowPicked.some(function (r) { return r.archetype === e.archetype; })) w *= S.sameRowArchetype;
          var bonus = 0;
          (e.pressure || []).forEach(function (t) { bonus += S.buildPressure.perTag * Math.min(tags[t] || 0, S.buildPressure.tagCap); });
          w *= 1 + Math.min(S.buildPressure.maxBonus, bonus);
          return { e: e, w: w };
        });
      }
      var attempts = [[false, false, false], [true, false, false], [true, true, false], [true, true, true]];
      for (var a = 0; a < attempts.length; a++) {
        var ws = weigh(attempts[a][0], attempts[a][1], attempts[a][2]);
        var tot = ws.reduce(function (s, x) { return s + x.w; }, 0);
        if (tot <= 0) continue;
        var r = ctx.rng() * tot;
        for (var i = 0; i < ws.length; i++) { r -= ws[i].w; if (r < 0 && ws[i].w > 0) return ws[i].e; }
        for (var j = ws.length - 1; j >= 0; j--) if (ws[j].w > 0) return ws[j].e;
      }
      return null;
    },

    /* Bind an encounter to a night: returns a plain clone with hpScale, expanded waves and optional rank changes.
     * opts: { rank, lookupPest(id) -> {threat}, omen } */
    bind: function (enc, night, opts) {
      opts = opts || {};
      var out = JSON.parse(JSON.stringify(enc));
      out.night = night;
      out.hpScale = rules.hpScale(night);
      out.waves = out.waves.map(rules.expandWave);
      if (opts.omen) out.omen = opts.omen;
      if ((opts.rank | 0) >= 2 && out.type === 'prowl' && opts.lookupPest && out.waves.length) {
        var w1 = out.waves[0], best = null;
        w1.spawns.forEach(function (s) {
          var p = opts.lookupPest(s.id);
          if (p && (!best || p.threat < best.t)) best = { s: s, t: p.threat };
        });
        if (best) w1.spawns.push({ id: best.s.id, floor: 1, at: 'back', rankExtra: true });
      }
      return out;
    }
  };
  return rules;
})();
