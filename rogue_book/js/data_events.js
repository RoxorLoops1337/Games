// Inkwoven -- data_events.js: the Fables (event tiles). 48 events: 12 per chapter (`chapters:[n]`) plus 12 for any chapter.
// Data only (DESIGN 4.9, CONTENT_SPEC 6): one IIFE that registers into DATA.events. No functions, no clock, no unseeded randomness,
// no em or en dashes. Everything here is validated by DATA.validate('events') and DATA.audit('events'), and
// tests/rogue_book_narrative.test.mjs replays every outcome through the real RUN.applyOps when RUN is present.
//
// HOUSE RULES FOR THIS FILE
//   * Every event has at least one SAFE choice: no `cost`, and no `hurt`, `addCurse`, `fight`, negative gold or negative max HP
//     in any of its outcomes (the audit checks this). Gambles have several weighted outcomes, costs carry a display `cost`
//     and the outcome carries the matching negative op (`cost` is display text only, the engine never deducts it).
//   * Fights use `enemies:[ids]` from the fixed roster and only enemies of the event's own chapter (any-chapter events have
//     no fights, because their difficulty could not follow the chapter). Fight choices say so in their label.
//   * Relics are referenced only by the fixed ids brass_lantern, fox_mask, silver_bell, jade_key (CONTENT_SPEC 2), everything
//     else by `rarity`. Curses only by the fixed curse_* ids. No card, gem or relic id outside those.
//   * Choices gated by `req.hero` are hidden when that hero is not in the party, so every event keeps two visible choices
//     that need nothing. `req.chapter` and `req.relic` choices are shown disabled (the engine says why).
//   * `once:true` marks the events with lasting story or deck consequences (flags, relics, card changes, curses).
//
// FLAG PATHS
//   fox_spared  set by `fox_in_the_snare` (ch1, free the kit). Unlocks `fox_returns` (ch2, w 6) and a choice in `kappa_toll`
//               and `lantern_ferry`. The fox has one tail in chapter 1, two in chapter 2 and three in chapter 3.
//   fox_bond    set by any choice of `fox_returns`. Unlocks `fox_at_the_gate` (ch3, w 6), the fox's last gift.
//   silver_bell `peddler_silver_bell` has a choice that needs the relic (a rare relic as thanks).
//   fox_mask    `mask_market` (ch2) has a choice that needs the relic. jade_key opens `jade_door`. brass_lantern wakes
//               `brass_lantern_secret`.
//   Hero moments (`when.hero`, w 3): hanae_mirror_pool (ch1), kuro_footnote (ch2), suzu_cracked_binding (ch3), raiga_storm_laugh (any).
//
// STAKES (balance pass 1). The bot measured ten fables where one free option beat every other (a free gem, a free removal, a free
//   relic, a free upgrade). Each now makes that option cost something real: HP (strange_seed, fox_in_the_snare, fox_returns,
//   hanae_mirror_pool, silk_threads), gold (hungry_ghost, censor_office, hermit_brush_seller), a risk of a curse (pawn_shop,
//   missing_page) or a card plus HP (kill_your_darlings), and the dull options (leave it, talk, step around) stay free and safe.
//   lantern_ferry's free option was cut down to match. The bot's own expected values (tools/rogue_book/bot/policies.mjs) now sit
//   within a few points of each other for most of these, and which one wins depends on HP and gold.
// Tone: dry, warm, the odd shiver. Magnitudes follow the economy (ECONOMY.price, camp restPct 0.35): a 25 gold cost buys about
// 5 gold of comfort plus a real perk, a gamble is roughly fair, a curse buys about 40 to 60 gold of value.
(() => {
  // ------------------------------------------------------------------ chapter 1: the Whispering Bamboo Grove
  DATA.add('events', {
    fox_in_the_snare: {
      title: 'A Fox in the Snare', art: { scene: 'ch1' }, chapters: [1], once: true, w: 3,
      text: "A white fox kit is tangled in a hunter's snare, one ink-dipped tail thrashing. It has stopped struggling and started glaring, which is either a very good sign or a very bad one.",
      choices: [
        { label: 'Loosen the snare', cost: 'Hurts the front hero',
          out: [
            { w: 4, text: 'The kit nips you twice out of pure principle, then shoots free, stops, bows once like a tiny courtier, and vanishes into the bamboo. Where it stood, one ink pawprint is drying into a neat little note in the margin of your map.', ops: [{ op: 'hurt', n: 4, who: 'front' }, { op: 'flag', k: 'fox_spared' }, { op: 'ink', n: 1 }] },
            { w: 1, text: 'The snare is tighter than it looked, and the kit is in no mood for gratitude. It bites to the bone and is gone into the bamboo before you can say anything gentle. You are left with a throbbing hand and an empty snare.', ops: [{ op: 'hurt', n: 6, who: 'front' }] },
          ] },
        { label: 'Sell it to the hunter', cost: 'A curse: Regret',
          out: [
            { w: 3, text: 'The hunter counts out the coins with great cheer. The kit watches you all the way to the horizon and does not blink once. The gold is heavy in a way that has nothing to do with weight.', ops: [{ op: 'gold', n: 80 }, { op: 'addCurse', id: 'curse_regret' }] },
            { w: 1, text: 'The hunter pays in leaves. They turn back into leaves before you reach the bend. The regret, sadly, is genuine.', ops: [{ op: 'addCurse', id: 'curse_regret' }] },
          ] },
        { label: 'Leave it. Not your fable.',
          out: [{ w: 1, text: 'You walk on. Behind you, something small and white says a very rude word. You pretend not to speak fox.' }] },
      ],
    },

    kappa_toll: {
      title: 'The Kappa Wants a Toll', art: { scene: 'ch1' }, chapters: [1],
      text: "A kappa sits on a mossy bridge, water dish gleaming. 'Toll,' he says. 'Twenty gold, or a cucumber, or a very good reason.' He is small, damp, and completely serious about it.",
      choices: [
        { label: 'Pay the twenty gold', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: "He counts each coin twice and bows. 'A pleasure,' he says, and means it. He also presses a cucumber into your hand and refuses to explain. It is the crunchiest thing you have ever eaten.", ops: [{ op: 'gold', n: -20 }, { op: 'heal', n: 6 }] }] },
        { label: 'Bow. Very, very deeply.', cost: 'He may not bow back',
          out: [
            { w: 3, text: 'By the ancient rules, he must bow back. He does. The dish tips, the water pours out, and so does all his fight. He waves you through, mortified, and pays you fifteen gold never to mention it.', ops: [{ op: 'gold', n: 15 }] },
            { w: 2, text: "He bows back so smoothly that not one drop spills. 'Ah,' he says, straightening. 'Someone raised you properly. Regrettable.' The next part is less polite.", ops: [{ op: 'fight', enemies: ['kappa'] }] },
          ] },
        { label: 'Mention the fox you helped', req: { flag: 'fox_spared' },
          out: [{ w: 1, text: "His eyes go round. 'You freed the kit? She is my cousin's student!' The toll is waived, the bridge is swept, and a cucumber arrives with a small bow and a very large thank you.", ops: [{ op: 'heal', n: 8 }, { op: 'ink', n: 1 }] }] },
        { label: 'Take the long way round',
          out: [{ w: 1, text: 'It costs an hour and most of your patience, and the kappa watches you go with the calm of a professional. But you come out downstream, dry, unbilled, and a little smug.', ops: [{ op: 'heal', n: 3 }] }] },
      ],
    },

    tanuki_tea_house: {
      title: 'Tea, Allegedly', art: { scene: 'shop' }, chapters: [1],
      text: 'A tanuki in a tiny apron runs a tea stall between two bamboo stalks. The sign says TEA (REAL). The tanuki says the sign is not lying, which is somehow worse.',
      choices: [
        { label: 'Pay for a proper pot', cost: '25 gold', req: { gold: 25 },
          out: [{ w: 1, text: 'The tea is astonishingly good. The tanuki charges extra for the astonishment, and you find you cannot be angry. The warmth goes all the way to your toes and stays there.', ops: [{ op: 'gold', n: -25 }, { op: 'heal', n: 12 }, { op: 'ink', n: 1 }] }] },
        { label: 'Pay with a leaf', cost: 'Maybe 25 gold',
          out: [
            { w: 1, text: "He sniffs the leaf. Tastes it. Squints. 'Maple. Late autumn. A fine vintage.' And he accepts it! The tea is free, and you have just witnessed a very rare tanuki defeat.", ops: [{ op: 'heal', n: 12 }] },
            { w: 1, text: 'The leaf turns back into a leaf the instant it touches his paw. You look at him. He looks at you. Then, with great dignity, he mistakes your purse for his.', ops: [{ op: 'gold', n: -25 }] },
          ] },
        { label: 'Let Kuro read the menu', req: { hero: 'kuro' },
          out: [{ w: 1, text: "'Refills free,' says Kuro, tapping the menu. 'Clause nine. Very small print.' The tanuki weeps openly. You drink four cups and are, for a while, unstoppable.", ops: [{ op: 'heal', n: 14 }] }] },
        { label: 'Admire the teapots',
          out: [{ w: 1, text: 'The teapots are marvels: dragons, cranes, one shaped exactly like the tanuki. He is pleased you noticed. You both stand there in a small, warm, unprofitable moment.', ops: [{ op: 'heal', n: 4 }] }] },
      ],
    },

    hanae_mirror_pool: {
      title: "Hanae's Reflection", art: { scene: 'ch1' }, chapters: [1], once: true, w: 3, when: { hero: 'hanae' },
      text: 'A still pool shows Hanae her reflection. It has better posture and a slightly smug ponytail, and it draws first. Hanae, very calmly, decides to take this personally.',
      choices: [
        { label: 'Let her duel it', cost: 'Hanae will be hurt',
          out: [
            { w: 3, text: "Three exchanges. The reflection's ponytail comes off cleanly in the third, though not before it scores twice. Hanae sheathes her blade, unbothered and bleeding a little, and the pool gives up something it had been hiding.", ops: [{ op: 'hurt', n: 9, who: 'hanae' }, { op: 'upgradeCard', filter: { hero: 'hanae' } }] },
            { w: 2, text: "The reflection takes the third exchange, and Hanae, to her own surprise, laughs. 'Again,' she says, bleeding a little, thrilled. It is the best she has felt all week.", ops: [{ op: 'hurt', n: 8, who: 'hanae' }, { op: 'maxHp', n: 3, who: 'hanae' }] },
          ] },
        { label: 'Bow and walk on',
          out: [{ w: 1, text: 'Hanae bows to the pool. The reflection bows back, half a second late. She lets it have that one.', ops: [{ op: 'ink', n: 2 }] }] },
      ],
    },

    mushroom_ring: {
      title: 'The Mushroom Ring', art: { scene: 'ch1' }, chapters: [1],
      text: "Mushroom folk dance in a ring of tiny caps and beckon you closer. The ring smells of rain, wet earth, and a rumour you cannot quite place. One of them is holding out a cap.",
      choices: [
        { label: 'Dance with them', cost: 'A card changes, spores sting',
          out: [
            { w: 3, text: 'Nine dances and one very long turn. Somewhere in there, a card in your deck rearranges itself, politely, into something else.', ops: [{ op: 'transformCard' }, { op: 'heal', n: 4 }] },
            { w: 1, text: 'A spore goes up your nose and the dance turns out to be a good deal longer than you remember. Everyone wakes up aching and covered in glitter.', ops: [{ op: 'hurt', n: 4 }] },
          ] },
        { label: 'Eat the offered cap', cost: 'Could go either way',
          out: [
            { w: 2, text: 'It tastes like sunshine and a slightly sad memory. Something in you stretches an inch, and you spend a happy hour feeling tall.', ops: [{ op: 'maxHp', n: 2 }] },
            { w: 1, text: 'It tastes like a lie told by a kind person. Your vision goes stripey for an hour, and you see more clearly than you have in days.', ops: [{ op: 'hurt', n: 6, who: 'lowest' }, { op: 'ink', n: 2 }] },
          ] },
        { label: 'Decline politely',
          out: [{ w: 1, text: 'They shrug in unison and resume dancing. It is somewhat undignified how badly you want to stay. The wanting, oddly, is restful, and you leave a little lighter.', ops: [{ op: 'heal', n: 5 }] }] },
      ],
    },

    jizo_row: {
      title: 'The Seventh Jizo', art: { scene: 'event' }, chapters: [1], once: true,
      text: 'Seven moss-capped jizo line the path, each wearing a faded red bib. Six are smiling. The seventh frowns at nothing, and has been left a whole bowl of rice.',
      choices: [
        { label: 'Leave an offering', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: 'The frowning jizo does not smile, exactly. But its frown loosens by about a degree, which for a jizo is a parade. You feel a little sturdier all over.', ops: [{ op: 'gold', n: -20 }, { op: 'maxHp', n: 3 }] }] },
        { label: 'Take the rice', cost: 'Maybe a curse: Doubt',
          out: [
            { w: 2, text: 'Nobody stops you. The rice is warm and the best you have had in days. On the way out you feel seven stone stares, and not one of them is kind.', ops: [{ op: 'heal', n: 12 }, { op: 'addCurse', id: 'curse_doubt' }] },
            { w: 1, text: 'Nobody stops you, and nobody minds. The seventh jizo even seems to relax. You are almost disappointed.', ops: [{ op: 'heal', n: 12 }] },
          ] },
        { label: 'Tie on a fresh bib',
          out: [{ w: 1, text: 'You retie a red bib, straighten a moss cap, and say thank you to no one in particular. The six smiling ones smile a little more.', ops: [{ op: 'heal', n: 6 }] }] },
      ],
    },

    tengu_dice: {
      title: "The Tengu's Dice", art: { scene: 'event' }, chapters: [1],
      text: "A crow tengu sits on a stump with three dice and an enormous hat. 'Even or odd,' he offers. 'Fifty gold a throw, and I only cheat a little.' The dice look extremely well-loved.",
      choices: [
        { label: 'Bet fifty gold on even', cost: 'Up to 50 gold', req: { gold: 50 },
          out: [
            { w: 1, text: 'Even! The tengu is not sad. He was, he explains, cheating in your favour, to see what you would do with it. You count the coins twice.', ops: [{ op: 'gold', n: 50 }] },
            { w: 1, text: 'Odd. On closer inspection the dice have no even faces at all. The tengu tips his hat with enormous sincerity.', ops: [{ op: 'gold', n: -50 }] },
          ] },
        { label: 'Ask Kuro about the dice', req: { hero: 'kuro' },
          out: [{ w: 1, text: "'Loaded toward odd,' murmurs Kuro. 'Left die, two throws in three.' You bet odd. The tengu's hat trembles with respect.", ops: [{ op: 'gold', n: 40 }] }] },
        { label: 'Let Hanae challenge him to a real duel', req: { hero: 'hanae' },
          out: [{ w: 1, text: 'He laughs, then stops laughing. The duel lasts nine seconds, and Hanae is barely out of breath. He hands her his second-best hat, a little dented, with a jewel pinned in the band.', ops: [{ op: 'addGem', color: 'red' }] }] },
        { label: 'Watch him play a round',
          out: [{ w: 1, text: 'He wins, loses, wins, and hums the whole time. You learn two things: the dice are loaded, and the loading is beautiful.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    stone_lantern_story: {
      title: 'The Lantern Wants a Story', art: { scene: 'ch1' }, chapters: [1],
      text: 'An old stone lantern, unlit for a century, says it will shine if someone tells it a story. It would like a good one. It has already heard most of the others.',
      choices: [
        { label: 'Tell it a story',
          out: [
            { w: 3, text: "You tell of a fox, a bridge, and a very serious cucumber. It glows a proud pale gold. 'Acceptable,' it says, and light spills down the path ahead.", ops: [{ op: 'paint', n: 2 }] },
            { w: 1, text: 'It has heard that one. But it is generous, and pretends it has not. The light is dim, but real.', ops: [{ op: 'paint', n: 1 }] },
          ] },
        { label: 'Let Kuro recite one from the margins', req: { hero: 'kuro' },
          out: [{ w: 1, text: 'He recites the one nobody remembers writing. The lantern weeps warm wax, and the road ahead lights itself for a long way.', ops: [{ op: 'paint', n: 3 }, { op: 'ink', n: 1 }] }] },
        { label: 'Light it yourself', cost: '1 Ink',
          out: [{ w: 1, text: 'Cheating, and the lantern knows it. But a lit lantern is a lit lantern, and it sulks for only a moment before shining on your behalf.', ops: [{ op: 'ink', n: -1 }, { op: 'paint', n: 3 }] }] },
      ],
    },

    oni_cub_sumo: {
      title: 'The Oni Cub Wants a Match', art: { scene: 'ch1' }, chapters: [1],
      text: 'An oni cub in a very small loincloth slaps the ground and points at you. He wants a match. The whole grove has gone quiet to watch. He is enormously, dangerously sincere.',
      choices: [
        { label: 'Accept the match (fight)',
          out: [{ w: 1, text: 'He bows, which is your first sign that you are dealing with a professional. Then he charges.', ops: [{ op: 'fight', enemies: ['oni_cub'], win: [{ op: 'maxHp', n: 2 }] }] }] },
        { label: 'Let Raiga step into the ring', req: { hero: 'raiga' },
          out: [{ w: 1, text: 'Raiga folds into a sumo crouch so perfect the cub forgets to blink. They grapple for one long, dignified minute. Raiga lets him win at the last second. The cub goes home glowing, and leaves his best pebble behind. It is, on inspection, a gem.', ops: [{ op: 'addGem', color: 'red' }] }] },
        { label: 'Slip him a rice ball', cost: '10 gold', req: { gold: 10 },
          out: [
            { w: 3, text: 'He accepts it as a sign of respect and eats it as a sign of hunger. You are friends now. He teaches you a stance, and you use it for the next hour, incorrectly.', ops: [{ op: 'gold', n: -10 }, { op: 'ink', n: 1 }] },
            { w: 1, text: 'He eats it in one bite, wipes his mouth, and remembers what he wanted in the first place. On a full stomach, he is even more sincere.', ops: [{ op: 'gold', n: -10 }, { op: 'fight', enemies: ['oni_cub'], win: [{ op: 'maxHp', n: 2 }] }] },
          ] },
        { label: 'Slip away quietly',
          out: [{ w: 1, text: 'You tiptoe around the ring. The cub does not notice until you are gone, then stomps so hard that birds fall out of three separate trees.' }] },
      ],
    },

    hermit_brush_seller: {
      title: "The Hermit's Brushes", art: { scene: 'shop' }, chapters: [1],
      text: "A hermit in a bamboo hut sells brushes of every size, all of them slightly damp. 'They are single use,' she says, 'like most good ideas.' She looks at your deck with interest.",
      choices: [
        { label: 'Buy a Wave Sweep', cost: '60 gold', req: { gold: 60 },
          out: [{ w: 1, text: "She wraps it in a leaf and does not let go until you promise to use it properly. 'Five hexes,' she says. 'Enough to change your mind about a whole afternoon.'", ops: [{ op: 'gold', n: -60 }, { op: 'addBrush', id: 'wave' }] }] },
        { label: 'Trade a card for a brush', cost: 'Lose a card, 70 gold', req: { gold: 70 },
          out: [
            { w: 3, text: "She takes the card, sniffs it, nods, and hands you a brush from behind her ear. 'Fair,' she says, pocketing your coins. 'Cards are lighter than brushes. Both weigh on you, and I charge for the lifting.'", ops: [{ op: 'gold', n: -70 }, { op: 'removeCard' }, { op: 'addBrush', id: 'random' }] },
            { w: 1, text: "She takes the card, reads it, and goes very quiet. 'Where did you get this?' she asks, and does not wait for an answer. She hands you the good brush from the back of the hut, and still takes the coins.", ops: [{ op: 'gold', n: -70 }, { op: 'removeCard' }, { op: 'addBrush', id: 'wave' }] },
          ] },
        { label: 'Just talk',
          out: [{ w: 1, text: 'She tells you about the grove when it was young: greener, louder, with far fewer opinions. You leave with hot tea and a firm sense of direction.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    paper_kodama_pilgrim: {
      title: 'The Paper Kodama', art: { scene: 'ch1' }, chapters: [1],
      text: 'A paper kodama shuffles along the road with a torn page clutched to its chest. It is hollow, folded, and very determined. When it sees you it stops, and holds out the page with both hands.',
      choices: [
        { label: 'Read the torn page', cost: 'It may smudge your deck',
          out: [
            { w: 3, text: 'It is a spell, or the start of one, in a hand older than the grove. The kodama watches, hugely pleased. You take one good idea away with you.', ops: [{ op: 'cardReward', n: 3 }] },
            { w: 1, text: 'The page is half Blank. A word slides off it, in through your eyes and out the back of your head. Nothing hurts, but something is quietly missing.', ops: [{ op: 'addCurse', id: 'curse_smudge' }] },
          ] },
        { label: 'Ask it to fold you a copy', cost: '40 gold', req: { gold: 40 },
          out: [{ w: 1, text: 'It folds a duplicate of one of your cards with tiny, terrifying precision. The copy is still warm. The kodama bows, and then, slowly, with great dignity, unfolds a little at the edges.', ops: [{ op: 'gold', n: -40 }, { op: 'duplicateCard' }] }] },
        { label: 'Pat its head',
          out: [{ w: 1, text: 'It vibrates with quiet joy. Then it presses the page into your hand anyway, and shuffles off down the road, much lighter.', ops: [{ op: 'heal', n: 5 }] }] },
      ],
    },

    missing_page: {
      title: 'A Door of Nothing', art: { scene: 'defeat' }, chapters: [1],
      text: 'In the middle of the grove hangs a rectangle of nothing, perfectly white, the size of a door. The bamboo leans away from it. Something is missing here, and you can feel it like a lost tooth.',
      choices: [
        { label: 'Step around it',
          out: [{ w: 1, text: 'You give it a wide berth. It pretends not to watch you go, which is worse than watching. As you pass, the bamboo rustles what might be a thank you.', ops: [{ op: 'heal', n: 3 }] }] },
        { label: 'Reach in', cost: 'Something may change',
          out: [
            { w: 1, text: 'Your hand comes back holding a coin with no face on it, and then another, and another. They spend fine.', ops: [{ op: 'gold', n: 55 }] },
            { w: 1, text: 'Your hand comes back a little paler, and your memory of breakfast is gone. A small mercy: so is the dread.', ops: [{ op: 'hurt', n: 4 }, { op: 'ink', n: 2 }] },
            { w: 1, text: 'Your hand comes back holding a brush that is not yours, and is still warm.', ops: [{ op: 'addBrush', id: 'random' }] },
          ] },
        { label: 'Paint over it', cost: '2 Ink, maybe a curse',
          out: [
            { w: 3, text: 'You paint bamboo across the doorway, stalk by careful stalk. The white shivers, holds, and thickens into green. The whole grove breathes out.', ops: [{ op: 'ink', n: -2 }, { op: 'maxHp', n: 2 }, { op: 'heal', n: 6 }] },
            { w: 1, text: 'You paint bamboo across the doorway, stalk by careful stalk, but the white drinks the green and spits something back: a smear that lands, somehow, in your deck.', ops: [{ op: 'ink', n: -2 }, { op: 'heal', n: 6 }, { op: 'addCurse', id: 'curse_smudge' }] },
          ] },
      ],
    },
  });

  // ------------------------------------------------------------------ chapter 2: the Sunken Lantern City
  DATA.add('events', {
    fox_returns: {
      title: 'The Fox on the Bridge', art: { scene: 'ch2' }, chapters: [2], once: true, w: 6, when: { flag: 'fox_spared' },
      text: 'A white fox with two tails, one dipped in ink, waits on a mossy bridge post. She looks exactly like a kit you once untangled, only taller, and she is holding a small carved mask in her mouth.',
      choices: [
        { label: 'Accept the mask', cost: 'Hurts the front hero',
          out: [{ w: 1, text: 'She sets it at your feet, bows, and nudges it toward you with her nose, the way you would return a lost glove. It smells of bamboo, and of something like a promise. It settles on your face a shade too snugly, and its first act is to bite.', ops: [{ op: 'addRelic', id: 'fox_mask' }, { op: 'flag', k: 'fox_bond' }, { op: 'hurt', n: 4, who: 'front' }] }] },
        { label: 'Follow her across the rooftops',
          out: [{ w: 1, text: 'She runs. You run. The tiles are wet, and the city rearranges itself politely around the fox. Five hexes open ahead of you like a sentence someone finally finished.', ops: [{ op: 'paint', n: 5 }, { op: 'flag', k: 'fox_bond' }] }] },
        { label: 'Ask her about Kuzunoha',
          out: [{ w: 1, text: "'She was my mother's mother's teacher,' says the fox, in the plain way of foxes. 'She is not angry. She is only very tired of forgetting.' She curls up near you until you feel better.", ops: [{ op: 'heal', pct: 0.1 }, { op: 'ink', n: 2 }, { op: 'flag', k: 'fox_bond' }] }] },
        { label: 'Scratch her behind the ears',
          out: [
            { w: 3, text: 'She leans into it, eyes shut, both tails thumping. Something in the whole party unclenches. She leaves a scrap of ink on your sleeve, which is how foxes say thank you.', ops: [{ op: 'heal', pct: 0.25 }, { op: 'ink', n: 1 }, { op: 'flag', k: 'fox_bond' }] },
            { w: 1, text: 'Foxes are not, it turns out, cats. She nips you once, thoroughly, and then forgives you with great ceremony.', ops: [{ op: 'hurt', n: 3, who: 'front' }, { op: 'ink', n: 2 }, { op: 'flag', k: 'fox_bond' }] },
          ] },
      ],
    },

    lantern_ferry: {
      title: 'The Lantern Ferry', art: { scene: 'ch2' }, chapters: [2],
      text: 'The ferryman is a paper lantern on a pole, steering a boat of folded newsprint. Fare is thirty gold, he says. Or one story. Or, if you are honest, one thing you are afraid of.',
      choices: [
        { label: 'Pay the fare', cost: '30 gold', req: { gold: 30 },
          out: [{ w: 1, text: 'He poles you through a wide glowing arc of canals, humming. When you step off, the map ahead has been quietly redrawn in your favour, and then some.', ops: [{ op: 'gold', n: -30 }, { op: 'paint', n: 6 }] }] },
        { label: 'Swim it', cost: 'Cold water',
          out: [
            { w: 2, text: 'The water is cold enough to reconsider several life choices. But faster.', ops: [{ op: 'hurt', n: 4 }, { op: 'paint', n: 5 }] },
            { w: 1, text: 'Something in the canal takes your purse and your dignity, in that order.', ops: [{ op: 'hurt', n: 4 }, { op: 'gold', n: -20 }] },
          ] },
        { label: 'Say the fox sent you', req: { flag: 'fox_spared' },
          out: [{ w: 1, text: "The flame in the lantern jumps. 'Any friend of the fox rides free,' he says, and rows you the long way round, past the good lamps, just for the view.", ops: [{ op: 'paint', n: 3 }, { op: 'heal', n: 4 }] }] },
        { label: 'Tell him your fear',
          out: [{ w: 1, text: "He listens with the flame of a very small candle. 'Ah,' he says. 'That one is common. Almost everyone is afraid of that one.' Somehow, this helps, a little.", ops: [{ op: 'heal', n: 4 }, { op: 'paint', n: 1 }] }] },
      ],
    },

    endless_supper: {
      title: 'The Endless Supper', art: { scene: 'ch2' }, chapters: [2],
      text: "A long table under paper lanterns, laid for supper. The guests are pale and polite and will not stop chewing. 'Sit,' says a voice from everywhere. 'Every guest stays for supper.'",
      choices: [
        { label: 'Sit and eat', cost: 'May leave a curse: Burden',
          out: [
            { w: 3, text: 'The rice is warm, the tea is hot, the company silent. You leave full, mended, and only slightly haunted.', ops: [{ op: 'heal', pct: 0.3 }] },
            { w: 1, text: 'You look up. The table is longer than when you sat. The guests are wearing your faces, one by one. You rise very slowly, very politely, and leave a good deal behind.', ops: [{ op: 'heal', pct: 0.15 }, { op: 'addCurse', id: 'curse_burden' }] },
          ] },
        { label: 'Slip into the kitchen (risky)',
          out: [
            { w: 2, text: 'Nobody in the kitchen notices you. The rice cakes are still warm, the till is unattended, and your conscience is only a little dented.', ops: [{ op: 'heal', n: 8 }, { op: 'gold', n: 25 }] },
            { w: 1, text: 'The cook is a spider in a tiny apron, and she is not pleased.', ops: [{ op: 'fight', enemies: ['silk_weaver'] }] },
          ] },
        { label: 'Decline politely',
          out: [{ w: 1, text: 'You bow and explain about a prior engagement. The table sighs, all at once. One chopstick rolls after you like a tiny reproach. Later you find a coin in your sleeve, for reasons you decline to investigate.', ops: [{ op: 'gold', n: 15 }] }] },
      ],
    },

    puppet_theatre: {
      title: 'The Puppet Theatre', art: { scene: 'ch2' }, chapters: [2],
      text: 'A tiny theatre, curtains parted. Paper puppets act out a familiar scene: two heroes, a bridge, a fox. The puppet heroes have your faces. Someone is pulling the strings, and they are late with the ending.',
      choices: [
        { label: 'Step onto the stage', cost: 'A card is recast',
          out: [{ w: 1, text: 'The puppeteer squints, decides you are miscast, and hands you a different role. You play it beautifully. By the curtain, a card in your deck is a different card.', ops: [{ op: 'transformCard' }, { op: 'heal', n: 4 }] }] },
        { label: 'Cut the strings (risky)',
          out: [
            { w: 3, text: 'Every puppet falls. Then, one by one, they stand up on their own, blinking. Nobody is more surprised than the puppets. They leave you a small glittering parting gift.', ops: [{ op: 'addGem', tier: 2 }] },
            { w: 1, text: 'Every puppet falls. Then a very tall figure stands up out of the dark, hands long gone, strings still working. He does not thank you.', ops: [{ op: 'fight', enemies: ['puppet_master'], tier: 'elite' }] },
          ] },
        { label: 'Watch until the end',
          out: [{ w: 1, text: 'The puppet heroes win, bow, and are quietly unstrung. The audience is only you, and you clap anyway, softly, out of respect.', ops: [{ op: 'ink', n: 1 }, { op: 'heal', n: 5 }] }] },
      ],
    },

    koi_wishing_pond: {
      title: 'The Wishing Pond', art: { scene: 'ch2' }, chapters: [2],
      text: 'A koi pond glows faintly beneath a sign: WISHES, 10 GOLD. Under it, in different handwriting: ALSO WE ARE JUDGING YOU. A very old carp watches you with real attention.',
      choices: [
        { label: 'Make a wish', cost: '10 gold', req: { gold: 10 },
          out: [
            { w: 2, text: 'The koi considers the wish and finds it acceptable. One of your cards feels a little sharper.', ops: [{ op: 'gold', n: -10 }, { op: 'upgradeCard', random: true }] },
            { w: 2, text: 'The koi considers the wish, blinks slowly, and something small and bright rises to the surface.', ops: [{ op: 'gold', n: -10 }, { op: 'addGem', tier: 1 }] },
            { w: 1, text: "The koi considers the wish, sighs, and returns your coin a little insulted. 'Try harder,' says its whole face." },
          ] },
        { label: 'Fish out the coins', cost: 'A curse: Hex',
          out: [{ w: 1, text: 'There are forty gold in the shallows. Every koi turns to look at you, one by one, and you count faster.', ops: [{ op: 'gold', n: 40 }, { op: 'addCurse', id: 'curse_hex' }] }] },
        { label: 'Make an honest wish, no coin',
          out: [{ w: 1, text: 'It is not a large wish. It is a real one. The koi accepts this, oddly, as payment in full.', ops: [{ op: 'heal', n: 6 }] }] },
      ],
    },

    pawn_shop: {
      title: 'The Pawnshop of Objects', art: { scene: 'shop' }, chapters: [2],
      text: "A pawnshop where every object is awake and none of them enjoy it. An umbrella whispers 'take me,' a teapot mutters 'don't,' and the abacus keeps score of everything.",
      choices: [
        { label: 'Sell a card', cost: 'Maybe a curse',
          out: [
            { w: 1, text: 'The clerk, a shamisen, tunes your card, finds it in key, and pays. Somewhere in the shop, something that used to be a drum sighs with envy.', ops: [{ op: 'removeCard' }, { op: 'gold', n: 35 }] },
            { w: 1, text: 'The shamisen plays your card once, winces, and hands it back with a bow and a bill for handling. Then, with great ceremony, it presents you with something it could not sell either, and the abacus clicks in satisfaction. You leave with no coin and one more regret than you came with.', ops: [{ op: 'addCurse', id: 'curse_regret' }] },
          ] },
        { label: 'Buy a mystery object', cost: '60 gold', req: { gold: 60 },
          out: [
            { w: 2, text: 'It is an heirloom and very nearly a cat. Whatever it is, it likes you.', ops: [{ op: 'gold', n: -60 }, { op: 'addRelic', rarity: 'uncommon' }] },
            { w: 1, text: 'It is a small warm thing wrapped in cloth, humming a tune you almost know. It has opinions, a great deal of luck, and, you suspect, a past.', ops: [{ op: 'gold', n: -60 }, { op: 'addRelic', rarity: 'rare' }] },
            { w: 1, text: 'It is a cursed doll, and it has been waiting, patiently, for a paying customer.', ops: [{ op: 'gold', n: -60 }, { op: 'addCurse', id: 'curse_hex' }] },
          ] },
        { label: 'Talk to the teapot',
          out: [{ w: 1, text: 'The teapot tells you, in confidence, which of the others is lying. It is the umbrella. It is always the umbrella.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    flooded_archive: {
      title: 'The Flooded Archive', art: { scene: 'paper' }, chapters: [2], once: true,
      text: 'A flooded archive, shelves knee-deep in black water. Books float open, their pages bleeding letters like tea. One volume on the top shelf is still dry, and humming.',
      choices: [
        { label: 'Wade in for the dry book', cost: 'The water bites',
          out: [
            { w: 3, text: 'You wade, you climb, you take it down. It is a spell in an older hand, and it is very happy to be read again.', ops: [{ op: 'cardReward', n: 3, rarity: 'uncommon' }] },
            { w: 1, text: 'You wade. The water is deeper than it looked, and colder, and something drifts past that is not a book. You get the volume anyway.', ops: [{ op: 'hurt', n: 6 }, { op: 'cardReward', n: 3, rarity: 'uncommon' }] },
          ] },
        { label: 'Let Kuro read the spines', req: { hero: 'kuro' },
          out: [{ w: 1, text: "Kuro reads the spines from the doorway, one finger raised. 'Third shelf, fourth from the left. Do not touch the fifth.' He is right. The fifth was a mimic.", ops: [{ op: 'cardReward', n: 3, rarity: 'uncommon' }] }] },
        { label: 'Wring out a wet page',
          out: [{ w: 1, text: "You wring a page into a bucket. Half a sentence survives: 'the bravest thing about her was that she was afraid.' You keep it.", ops: [{ op: 'ink', n: 2 }] }] },
      ],
    },

    kuro_footnote: {
      title: "Kuro's Footnote", art: { scene: 'paper' }, chapters: [2], once: true, w: 3, when: { hero: 'kuro' },
      text: 'Kuro stops at a torn poster and goes very still. Beside his name, in a hand he knows better than his own, someone has scribbled a note. He has not read it. Not yet.',
      choices: [
        { label: 'Let him read it',
          out: [{ w: 1, text: "'K.,' it says. 'Keep? Cut?' And below, pressed so hard the paper tore: KEEP. Kuro folds the poster carefully and says nothing for several hexes. He is grinning by the third.", ops: [{ op: 'maxHp', n: 4, who: 'kuro' }, { op: 'heal', n: 10, who: 'kuro' }] }] },
        { label: 'Ask him to read it aloud',
          out: [
            { w: 2, text: 'He does the voice. It is an excellent voice, low and tired and fond. By the second line the whole party is grinning, and by the last, laughing.', ops: [{ op: 'heal', n: 10 }, { op: 'ink', n: 1 }] },
            { w: 1, text: "He gets as far as the second line and stops. 'Sorry,' he says, very quietly. 'Give me a minute.' You give him several. The whole party is a little sturdier for having watched.", ops: [{ op: 'maxHp', n: 2 }] },
          ] },
        { label: 'Write a note under it', cost: '1 Ink',
          out: [{ w: 1, text: 'You add, in your best hand: AGREED. Kuro pretends to be annoyed for nearly four seconds.', ops: [{ op: 'ink', n: -1 }, { op: 'maxHp', n: 2 }] }] },
      ],
    },

    sentry_bridge: {
      title: 'The Sentry Who Was Never Relieved', art: { scene: 'ch2' }, chapters: [2],
      text: "A drowned soldier guards the last bridge, spear upright, water streaming from his armour. 'Halt,' he says. 'Password.' Nobody has given him one in three hundred years.",
      choices: [
        { label: 'Say, "You are relieved, soldier."',
          out: [{ w: 1, text: "He stares. Then his shoulders drop three hundred years at once. 'About time,' he says, and salutes, and the water finally stops running off him. He leaves you his purse.", ops: [{ op: 'gold', n: 30 }] }] },
        { label: 'Guess a password', cost: 'It may hurt',
          out: [
            { w: 1, text: "'Correct,' he says, which surprises everyone, himself included. 'Pass.' Two hexes of bridge unroll ahead like a scroll.", ops: [{ op: 'paint', n: 2 }] },
            { w: 1, text: "'Incorrect.' The spear does not hurt much. The dignity does.", ops: [{ op: 'hurt', n: 7, who: 'front' }] },
          ] },
        { label: 'Duel him for the bridge (fight)',
          out: [{ w: 1, text: 'He does not so much draw his blade as remember drawing it.', ops: [{ op: 'fight', enemies: ['drowned_samurai'] }] }] },
        { label: 'Let Hanae offer a duel of honour', req: { hero: 'hanae' },
          out: [{ w: 1, text: "One exchange, perfectly formal. He lowers his blade and thanks her for the first good fight in three hundred years. As a keepsake he presses the sword's old jewel into her palm, and then, at last, sits down.", ops: [{ op: 'addGem', color: 'red', tier: 2 }] }] },
      ],
    },

    mask_market: {
      title: 'The Night Market of Masks', art: { scene: 'shop' }, chapters: [2],
      text: "A night market of masks: fox, oni, plain white. Every vendor wears a face that is not theirs. 'Try one,' they say, in a chorus that has clearly been rehearsed. 'It never comes off wrong.'",
      choices: [
        { label: 'Try a plain white mask', cost: 'It may not come off right',
          out: [
            { w: 1, text: 'You put it on. For one hex, nobody notices you at all. It is glorious. It comes off cleanly, and the road ahead is somehow shorter.', ops: [{ op: 'paint', n: 3 }] },
            { w: 1, text: 'It comes off a moment too late. Your reflection, in a puddle, rejoins you a beat behind.', ops: [{ op: 'addCurse', id: 'curse_doubt' }] },
          ] },
        { label: 'Show your fox mask', req: { relic: 'fox_mask' },
          out: [{ w: 1, text: "The vendors hush. 'One of the kitsune's own,' whispers the eldest, and bows so low his face slides off. Everyone pretends this did not happen. A gift is pressed into your hands.", ops: [{ op: 'addRelic', rarity: 'uncommon' }] }] },
        { label: 'Buy nothing',
          out: [{ w: 1, text: 'You walk the entire market and buy nothing, and the vendors tip their false faces at you as though you had passed a test.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    silk_threads: {
      title: 'Threads Across the Alley', art: { scene: 'ch2' }, chapters: [2],
      text: 'Silk threads hang across the alley, each tied to something: a lantern, a shoe, a wedding ring. They tremble all together, as though something far away has just noticed you.',
      choices: [
        { label: 'Cut a thread', cost: 'Something will notice',
          out: [
            { w: 2, text: 'Snip. Somewhere a lantern falls into a canal, and somewhere else a great many tiny spiders hurry to complain. A purse comes loose from the wreckage.', ops: [{ op: 'gold', n: 80 }] },
            { w: 1, text: 'Snip. Every thread hums at once. Something has just been told, and it is coming down the alley.', ops: [{ op: 'fight', enemies: ['silk_weaver', 'spiderling'] }] },
          ] },
        { label: 'Untie the wedding ring', cost: 'Hurts the front hero',
          out: [{ w: 1, text: 'It takes a long time and one apology, and the threads cinch tight around your wrists before they let go. The ring falls into your palm, warm as skin, and somewhere a very small thread sighs out.', ops: [{ op: 'hurt', n: 6, who: 'front' }, { op: 'addGem', color: 'gold' }] }] },
        { label: 'Follow one thread',
          out: [{ w: 1, text: 'It leads to a shuttered house, a lit window, a woman softly laughing in the dark. You turn back. It is the first sensible thing you have done all day.', ops: [{ op: 'paint', n: 2 }] }] },
      ],
    },

    rokurokubi_gossip: {
      title: 'A Word from the Tea House', art: { scene: 'shop' }, chapters: [2],
      text: "A lady sits in a tea house window, very still and very far away. Her neck extends, politely, across the room to whisper in your ear. 'I know a shortcut,' she says. 'Nobody uses it twice.'",
      choices: [
        { label: 'Buy the shortcut', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: 'She whispers. Your map does the rest. It is, in fact, a very good shortcut, and now you know why nobody uses it twice.', ops: [{ op: 'gold', n: -20 }, { op: 'paint', n: 4 }] }] },
        { label: 'Ask for medicinal tea', req: { hpBelow: 0.6 },
          out: [{ w: 1, text: 'She pours from a great height, and it lands in the cups exactly. It is the best thing that has happened to your knees in a week.', ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Trade gossip',
          out: [
            { w: 2, text: 'You tell her about the fox. She tells you about the butler. You both leave better informed and a little ashamed.', ops: [{ op: 'ink', n: 2 }] },
            { w: 1, text: 'She trades you something better: where the Blank is thin, and where the canal doubles back on itself. You mark it on your map in your own small handwriting.', ops: [{ op: 'paint', n: 2 }] },
          ] },
      ],
    },
  });

  // ------------------------------------------------------------------ chapter 3: the Crimson Sky Citadel
  DATA.add('events', {
    fox_at_the_gate: {
      title: 'Three Tails at the Gate', art: { scene: 'ch3' }, chapters: [3], once: true, w: 6, when: { flag: 'fox_bond' },
      text: 'Three white tails, one dipped in ink, curl around a broken gargoyle. The fox has grown. She writes something on the gate stone with one paw: a door, and beneath it a smaller word, HURRY.',
      choices: [
        { label: 'Step through her door',
          out: [{ w: 1, text: 'The stone gives the way water gives, and behind it is a corridor that was not there before. Six hexes of it. She waves one tail as you go, the way you would wave off a child on the first day of school.', ops: [{ op: 'paint', n: 6 }] }] },
        { label: 'Let her mend you',
          out: [{ w: 1, text: 'She writes better on each of you, in a cramped, careful hand, and it holds. The ache goes out of your bones as if it had never been written in.', ops: [{ op: 'heal', pct: 0.35 }, { op: 'maxHp', n: 3 }] }] },
        { label: 'Take her pawprint',
          out: [{ w: 1, text: "She presses a paw to the flat of your hand. The ink dries into a stone the colour of the last light in the grove. 'For luck,' she says, which, for a fox, is practically a speech.", ops: [{ op: 'addGem', tier: 3 }] }] },
        { label: 'Ask her for something bigger',
          out: [
            { w: 1, text: "She thinks very hard, writes one word on the gate, and steps back. The word is RELIC. Something small and brass drops out of the stone, still warm, looking faintly surprised.", ops: [{ op: 'addRelic', rarity: 'rare' }] },
            { w: 2, text: 'She thinks very hard, writes something long, smudges the ending, and looks deeply embarrassed. A good deal of ink runs down the wall onto your boots. You collect what you can.', ops: [{ op: 'ink', n: 3 }] },
          ] },
      ],
    },

    kill_your_darlings: {
      title: 'Notes in Red Pen', art: { scene: 'paper' }, chapters: [3],
      text: "The corridor walls are covered in neat red-pen comments. Show, don't tell. Cut for length. Too many adjectives. Beside a sketch of your party, in capitals: NEEDS WORK.",
      choices: [
        { label: 'Kill your darlings', cost: 'Lose a card and 8 HP',
          out: [{ w: 1, text: 'A card fades from the deck like a word struck out, and the red pen, thorough, strikes at you as well. The comments rustle approvingly. Someone leaves fifteen gold at your feet, as if for good homework.', ops: [{ op: 'removeCard' }, { op: 'gold', n: 15 }, { op: 'hurt', n: 8, who: 'front' }] }] },
        { label: 'Show, do not tell', cost: 'Hurts the front hero',
          out: [{ w: 1, text: 'You act it out instead, loudly. It is brave, and it stings, and the card you were thinking of is better for it.', ops: [{ op: 'hurt', n: 8, who: 'front' }, { op: 'upgradeCard' }] }] },
        { label: 'Write a comment of your own',
          out: [
            { w: 2, text: 'You write THIS IS FINE in the margin, in your best hand. The wall recoils in one satisfying rustle, and a little of its ink runs down and pools in your favour.', ops: [{ op: 'ink', n: 2 }] },
            { w: 1, text: 'You write ACTUALLY, NO. The comments argue back, all at once, in tiny capitals. Then they run out of room, fall silent, and drop something into your pocket to make you stop.', ops: [{ op: 'gold', n: 25 }] },
          ] },
      ],
    },

    unfinished_sentence: {
      title: 'The Unfinished Sentence', art: { scene: 'paper' }, chapters: [3], once: true,
      text: "On a ruined wall a sentence stops mid-word: 'And then the hero, who had never once been afraid, s'. There is a pen on the floor, still warm. The rest of the wall is bare.",
      choices: [
        { label: 'Finish it bravely', cost: 'Hurts the front hero',
          out: [{ w: 1, text: "'...stood up.' The pen glows red-gold. Hot ink runs down your arm and into your deck, and a card comes out better.", ops: [{ op: 'hurt', n: 6, who: 'front' }, { op: 'upgradeCard' }] }] },
        { label: 'Finish it kindly',
          out: [{ w: 1, text: "'...sat down beside the one who was.' The room grows warm. The bars on the windows relax a little, as though they too had been waiting for this.", ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Finish it cleverly',
          out: [
            { w: 2, text: "'...read ahead.' A drawer you had not noticed slides open, and inside are a few pages nobody thought to cut.", ops: [{ op: 'cardReward', n: 3 }] },
            { w: 1, text: "'...read ahead.' A drawer slides open, and beneath the ordinary pages lies one written in a very good hand indeed.", ops: [{ op: 'cardReward', n: 3, rarity: 'rare' }] },
          ] },
        { label: 'Leave it unfinished',
          out: [{ w: 1, text: 'Some sentences are better left open. You leave the pen where it lay. The Blank, respecting this, gives you a wide berth and a little ink.', ops: [{ op: 'ink', n: 2 }] }] },
      ],
    },

    void_tear: {
      title: 'A Tear in the Sky', art: { scene: 'defeat' }, chapters: [3],
      text: "A tear in the sky, white and perfectly silent. Words drift toward it and vanish: 'the', 'and', half of 'mercy'. The wind smells of nothing. Nothing, it turns out, has a very specific smell.",
      choices: [
        { label: 'Step through', cost: 'Deck clutter',
          out: [
            { w: 2, text: 'The world is one long white breath. You come out the far side with your map overshot by a good eight hexes, and something small and blank tucked into your deck.', ops: [{ op: 'paint', n: 8 }, { op: 'addCurse', id: 'curse_smudge' }] },
            { w: 1, text: 'The white lasts longer than you thought. You come out with less map and more smudge.', ops: [{ op: 'paint', n: 4 }, { op: 'addCurse', id: 'curse_smudge', n: 2 }] },
          ] },
        { label: 'Feed it something you regret',
          out: [{ w: 1, text: 'You hold up whatever regret you have been carrying. The tear takes it gently, the way a cat takes a fish, and gives back a little ink out of politeness.', ops: [{ op: 'removeCard', filter: { type: 'curse' } }, { op: 'ink', n: 2 }] }] },
        { label: 'Back away slowly',
          out: [{ w: 1, text: 'Wise. The tear watches you go. It has all the time in the world, and none of yours.' }] },
      ],
    },

    lightning_rod: {
      title: 'The Lightning Rod', art: { scene: 'ch3' }, chapters: [3],
      text: 'A brass lightning rod stands at the cliff edge, humming. The storm bends toward it like a cat toward a lap. It is either an invitation or a very bad idea. Probably both.',
      choices: [
        { label: 'Take the hit', cost: 'Storm damage',
          out: [
            { w: 2, text: 'The storm goes through you and out the far side, every nerve a struck bell. Terrible, wonderful, and somehow sturdier.', ops: [{ op: 'hurt', pct: 0.08 }, { op: 'maxHp', n: 4 }] },
            { w: 1, text: 'The storm has other plans. When your ears stop ringing you notice it has taken your eyebrows and, more worryingly, your enthusiasm.', ops: [{ op: 'hurt', n: 12 }] },
          ] },
        { label: 'Let Raiga hold it', req: { hero: 'raiga' },
          out: [{ w: 1, text: 'Raiga takes the rod in both hands and laughs, and the storm and Raiga, old friends, trade three or four jokes through the brass. He gives back more than he takes.', ops: [{ op: 'maxHp', n: 5, who: 'raiga' }, { op: 'heal', pct: 0.5, who: 'raiga' }] }] },
        { label: 'Bottle some lightning', cost: 'A little damage',
          out: [{ w: 1, text: 'You catch a spark in an empty vial and it crackles the whole way home. When you look, the vial holds a gem.', ops: [{ op: 'hurt', n: 4, who: 'random' }, { op: 'addGem', color: 'red', tier: 2 }] }] },
        { label: 'Ground the rod',
          out: [{ w: 1, text: 'You ground it. The storm sulks, then sighs and lets the matter drop. A little static sparks off your fingertips and settles as ink.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    censor_office: {
      title: 'The Office of Revisions', art: { scene: 'shop' }, chapters: [3],
      text: "A tidy desk in a storm. A clerk with a black bar where his eyes should be stamps a form, reads it, stamps it again. 'Request for revision?' he says. 'Take a number. Or a stamp. Nobody is sure.'",
      choices: [
        { label: 'File Form 27-B (Request to Be Forgotten)', cost: 'Lose a card, 60 gold', req: { gold: 60 },
          out: [{ w: 1, text: "The clerk stamps it three times. A card leaves your deck with the faintest sigh, as if being politely cropped out of a group portrait. 'Approved,' he says, and looks almost pleased. 'There is a filing fee.'", ops: [{ op: 'gold', n: -60 }, { op: 'removeCard' }] }] },
        { label: 'Argue with the clerk (risky)',
          out: [
            { w: 1, text: 'He hears your whole argument, stamps it APPROVED, and slides it back. It is the worst thing that has ever happened to you. It comes with a small refund.', ops: [{ op: 'gold', n: 20 }] },
            { w: 2, text: 'He stamps you, at length. The stamp is heavier than expected, and so is its owner: a knight in a black-barred helm. It seems he was never a clerk at all.', ops: [{ op: 'fight', enemies: ['redaction_knight'], win: [{ op: 'gold', n: 30 }] }] },
          ] },
        { label: 'Leave quietly',
          out: [{ w: 1, text: 'Nobody notices you go. In this building, that is the highest compliment.' }] },
      ],
    },

    library_cat: {
      title: 'The Cat on the Manuscript', art: { scene: 'camp' }, chapters: [3],
      text: 'In the ruins of a great library, a very fat cat sits on the last manuscript, washing one paw. The Blank has eaten the shelves around it. It has not eaten the cat. It has clearly not tried.',
      choices: [
        { label: 'Pet the cat',
          out: [{ w: 1, text: 'It allows this, closes its eyes, and warmth comes off it like a stove. Nothing is erased within three feet. You stay a while, and nobody is in a hurry.', ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Share your rations', cost: '10 gold', req: { gold: 10 },
          out: [{ w: 1, text: 'It eats, or half eats, or thoughtfully considers eating. In gratitude it stands, stretches, and leaves you a brush it had been sitting on. You did not notice the brush.', ops: [{ op: 'gold', n: -10 }, { op: 'addBrush', id: 'random' }] }] },
        { label: 'Move the cat (risky)',
          out: [
            { w: 2, text: 'It moves like water, with contempt. Under it lie a few clean pages, still crisp from never being read.', ops: [{ op: 'cardReward', n: 3 }] },
            { w: 1, text: 'It moves, but not before it bites you, precisely, in the fleshy part of the thumb. Under it, a few clean pages.', ops: [{ op: 'hurt', n: 5, who: 'front' }, { op: 'cardReward', n: 3 }] },
          ] },
      ],
    },

    weeping_eraser: {
      title: 'The Wraith That Cannot Stop', art: { scene: 'ch3' }, chapters: [3], once: true,
      text: 'An eraser wraith kneels in a ring of white dust, weeping. Everything it touches vanishes, so it has tried very hard to touch nothing. It has, by now, run out of nothing.',
      choices: [
        { label: 'Sit with it',
          out: [
            { w: 1, text: 'You sit near it, not touching. It cries a little more, then a little less. At last it gives you the one sentence it could not bring itself to rub out.', ops: [{ op: 'addRelic', rarity: 'uncommon' }] },
            { w: 1, text: 'You sit near it, not touching. It cries a little more, then a little less, and leaves you something small it had been keeping for someone.', ops: [{ op: 'addRelic', rarity: 'common' }] },
          ] },
        { label: 'Let Suzu sing to it', req: { hero: 'suzu' },
          out: [{ w: 1, text: 'Suzu sings a very old lullaby, one hand palm up in the dust. The wraith goes quiet, then still, then almost light. It leaves you what it kept, and a great deal of peace.', ops: [{ op: 'addRelic', rarity: 'uncommon' }, { op: 'heal', pct: 0.2 }] }] },
        { label: 'Take what it is holding (fight)',
          out: [{ w: 1, text: 'It lets go. Then, all at once, it does not.', ops: [{ op: 'fight', enemies: ['eraser_wraith'], win: [{ op: 'gold', n: 30 }] }] }] },
      ],
    },

    suzu_cracked_binding: {
      title: "Suzu Hears the Binding", art: { scene: 'event' }, chapters: [3], once: true, w: 3, when: { hero: 'suzu' },
      text: "Suzu stops, one hand held against the air, listening. Deep under the stone, the book's spine is creaking, thread by thread. 'It is the binding,' she says quietly. 'It is coming loose. I think I can hold it.'",
      choices: [
        { label: 'Let Suzu hold it',
          out: [
            { w: 3, text: 'She kneels, palms flat on the floor, and hums. The creaking slows. It costs her something, and she smiles anyway, a little thinner than before. The floor stays put, and so does everything on it.', ops: [{ op: 'heal', pct: 0.2 }, { op: 'ink', n: 2 }] },
            { w: 1, text: 'She kneels, palms flat on the floor, and hums, and the whole floor hums back. For one long breath the entire Citadel is in tune. When it ends, everyone feels mended, and a little taller.', ops: [{ op: 'heal', pct: 0.3 }, { op: 'ink', n: 2 }, { op: 'maxHp', n: 2 }] },
          ] },
        { label: 'Help her pull the threads tight', cost: 'Rope burn for both',
          out: [{ w: 1, text: 'It is rough work, all splinters and thread. Both your hands are raw by the end, and the book feels, from the inside, very slightly more like a book.', ops: [{ op: 'hurt', n: 5 }, { op: 'maxHp', n: 4 }] }] },
        { label: 'Leave it to the Author',
          out: [{ w: 1, text: 'The floor creaks in a way that is very much like a sigh. Suzu looks back once, and you all keep walking, a little faster.' }] },
      ],
    },

    komainu_riddle: {
      title: 'The Two Gates', art: { scene: 'ch3' }, chapters: [3],
      text: "Two stone komainu flank a gate, one mouth open, one shut. 'One of us always lies,' says one. 'The other lies about something else,' says the other. 'Choose a gate,' they add, unhelpfully.",
      choices: [
        { label: 'Try the left gate', cost: 'A coin flip',
          out: [
            { w: 1, text: 'It opens on a little room of forgotten coin. The komainu look embarrassed.', ops: [{ op: 'gold', n: 55 }] },
            { w: 1, text: 'It opens onto a very long fall and a very short landing.', ops: [{ op: 'hurt', n: 8, who: 'front' }] },
          ] },
        { label: 'Try the right gate', cost: 'A coin flip',
          out: [
            { w: 1, text: 'It opens on a shelf holding one small bright thing, put aside for someone who guessed right.', ops: [{ op: 'addGem', tier: 2 }] },
            { w: 1, text: 'It is a wall. It was always a wall. The komainu apologise, both at once, and neither means it.', ops: [{ op: 'hurt', n: 5 }] },
          ] },
        { label: 'Let Kuro ask one question', req: { hero: 'kuro' },
          out: [{ w: 1, text: "Kuro asks one question, three words long. Both komainu go silent. 'Ah,' says the open one. 'Rude,' says the shut one. They step aside.", ops: [{ op: 'addRelic', rarity: 'common' }, { op: 'paint', n: 3 }] }] },
        { label: 'Climb the wall',
          out: [{ w: 1, text: 'It takes an hour and both of your fingernails, and the komainu watch with quiet disgust. But a wall has no opinions about you.', ops: [{ op: 'paint', n: 1 }] }] },
      ],
    },

    paper_boat_prayers: {
      title: 'A Sea of Paper Boats', art: { scene: 'ch3' }, chapters: [3],
      text: 'Thousands of paper boats drift through the storm clouds, each carrying a candle and a single word, every candle out. Somebody folded them all by hand, in one night. They are waiting.',
      choices: [
        { label: 'Light one', cost: '1 Ink',
          out: [{ w: 1, text: 'The flame catches. The word on the boat is HOME, and something in the party remembers the shape of it. The light travels a long way before it goes.', ops: [{ op: 'ink', n: -1 }, { op: 'heal', pct: 0.2 }, { op: 'maxHp', n: 2 }] }] },
        { label: 'Read the words',
          out: [{ w: 1, text: 'Hope. Sorry. Later. Please. Mine. Wait. Home. Whoever wrote them meant every one.', ops: [{ op: 'ink', pct: 0.2 }] }] },
        { label: 'Take a boat for the road',
          out: [
            { w: 2, text: 'You fold one inside your coat. It weighs nothing and warms one hip. Later, on the road, it unfolds a little, into a brush.', ops: [{ op: 'addBrush', id: 'random' }] },
            { w: 1, text: 'You fold one inside your coat. It weighs nothing and warms one hip. Later, on the road, you find the candle has lit itself, and turned to a gem.', ops: [{ op: 'addGem', tier: 1 }] },
          ] },
      ],
    },

    waiting_room: {
      title: 'Please Wait To Be Edited', art: { scene: 'boss3' }, chapters: [3],
      text: 'A pristine waiting room with a ticket dispenser and a single chair. The sign says PLEASE WAIT TO BE EDITED. The chair is warm. Your ticket says you are number one.',
      choices: [
        { label: 'Take a ticket', cost: 'It may leave a mark',
          out: [
            { w: 1, text: 'The clock strikes. Nothing happens. The Editor, you gather, is running behind. You keep the ticket. It is the only proof anyone was here.', ops: [{ op: 'ink', n: 2 }] },
            { w: 1, text: 'A small red X appears on the back of your hand, then fades. It is the first note. You have the sense there will be more.', ops: [{ op: 'addCurse', id: 'curse_doubt' }] },
          ] },
        { label: 'Bribe the receptionist', cost: '40 gold', req: { gold: 40 },
          out: [{ w: 1, text: 'The receptionist, a stamp with a face, accepts the coins, swaps your ticket for one marked LATER, and lets a door open where a wall was.', ops: [{ op: 'gold', n: -40 }, { op: 'paint', n: 5 }] }] },
        { label: 'Sit in the chair',
          out: [{ w: 1, text: 'It is the most comfortable chair you have ever sat in, and you are absolutely certain you must not stay in it. That certainty gets you to your feet, stronger for the effort.', ops: [{ op: 'heal', pct: 0.15 }] }] },
      ],
    },
  });

  // ------------------------------------------------------------------ any chapter (no fights: the chapter scales the enemies, these events cannot)
  DATA.add('events', {
    peddler_silver_bell: {
      title: 'The Peddler and the Bell', art: { scene: 'shop' }, once: true,
      text: "A peddler with a pack taller than he is lays out his wares: three jars, a brass lamp, and an empty string knotted for a bell. He does not sell so much as suggest. 'Everything is for sale,' he says.",
      choices: [
        { label: 'Buy the mystery bundle', cost: '80 gold', req: { gold: 80 },
          out: [
            { w: 1, text: 'A small heavy bundle, very well tied. Inside is a curio that hums whenever you look away.', ops: [{ op: 'gold', n: -80 }, { op: 'addRelic', rarity: 'common' }] },
            { w: 1, text: "Inside is a gem, a good one, wrapped in a note that says 'sorry about the rest.'", ops: [{ op: 'gold', n: -80 }, { op: 'addGem', tier: 2 }] },
            { w: 1, text: 'Inside is a card someone clearly loved. The handwriting on it is lovely.', ops: [{ op: 'gold', n: -80 }, { op: 'addCard', pool: 'party', rarity: 'uncommon' }] },
          ] },
        { label: 'Buy the brass lamp', cost: '60 gold', req: { gold: 60 },
          out: [{ w: 1, text: 'He hands it over as though it were an ordinary lamp. It flickers, once, as though to say it is not.', ops: [{ op: 'gold', n: -60 }, { op: 'addRelic', id: 'brass_lantern' }] }] },
        { label: 'Ring your silver bell', req: { relic: 'silver_bell' },
          out: [{ w: 1, text: "The peddler freezes at the sound. Slowly he lifts the empty string from his blanket, and it fits. 'That bell belonged to someone I miss,' he says. Then he turns out his whole pack for you, and for a long moment says nothing else.", ops: [{ op: 'addRelic', rarity: 'rare' }] }] },
        { label: 'Just talk',
          out: [{ w: 1, text: 'He talks about the road, the weather, and a woman two bridges back who, he swears, sold him the same lamp twice. You leave better informed and slightly poorer in time.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    jade_door: {
      title: 'The Jade Door', art: { scene: 'treasure' }, once: true, w: 6, when: { relic: 'jade_key' },
      text: 'A jade-green door stands alone in the middle of the road, with no wall around it and a lock the exact shape of your key. It hums when you come near, like a cat that has recognised its owner.',
      choices: [
        { label: 'Open it',
          out: [
            { w: 3, text: 'The door opens on a small, well-lit room and a chest that has been waiting a long time for someone to bother.', ops: [{ op: 'addRelic', rarity: 'rare' }] },
            { w: 2, text: 'Behind it, a library the size of a closet, and one book with your party on the cover.', ops: [{ op: 'cardReward', n: 3, rarity: 'rare' }, { op: 'addGem', tier: 3 }] },
            { w: 1, text: "Behind it, quite simply, a great deal of gold, and a note: 'Well done.'", ops: [{ op: 'gold', n: 150 }] },
          ] },
        { label: 'Knock first',
          out: [{ w: 1, text: 'Manners cost nothing. Somewhere behind the door, someone very old approves. The lock does not open, but a bench appears beside it, and you are given a moment to rest.', ops: [{ op: 'heal', pct: 0.2 }, { op: 'ink', n: 2 }] }] },
      ],
    },

    brass_lantern_secret: {
      title: 'The Lantern Leans', art: { scene: 'event' }, w: 3, when: { relic: 'brass_lantern' },
      text: 'Your brass lantern flickers, then leans, unmistakably, toward an ordinary-looking stretch of wall. It has never leaned before. It has the air of a lantern that has been waiting for you to ask.',
      choices: [
        { label: 'Follow the lantern',
          out: [
            { w: 2, text: 'Behind the wall: a gap, then a path, then a shortcut known only to lanterns.', ops: [{ op: 'paint', n: 3 }] },
            { w: 1, text: "Behind the wall: a dusty alcove and a small heap of somebody's savings.", ops: [{ op: 'gold', n: 45 }] },
            { w: 1, text: 'Behind the wall: a gem lying in the dust, as if it had been dropped for you.', ops: [{ op: 'addGem', tier: 1 }] },
          ] },
        { label: 'Ask it nicely',
          out: [{ w: 1, text: 'The lantern glows a little warmer, as if pleased to be asked. The whole party feels, briefly, looked after.', ops: [{ op: 'heal', n: 8 }] }] },
      ],
    },

    wandering_storyteller: {
      title: 'The Storyteller', art: { scene: 'camp' },
      text: "A storyteller sits under a paper umbrella and pats the mat beside her. 'A tale for a coin,' she says, 'or a coin for a tale. I am flexible about the direction.'",
      choices: [
        { label: 'Pay for a story', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: 'It is about a hero who did something clever at exactly the right moment. It is a small story. It is also, unmistakably, about a card in your deck, and that card is sharper for it.', ops: [{ op: 'gold', n: -20 }, { op: 'upgradeCard' }] }] },
        { label: 'Let Kuro correct her citations', req: { hero: 'kuro' },
          out: [{ w: 1, text: 'She is delighted. Nobody has corrected her in years. She opens the good tea.', ops: [{ op: 'heal', n: 10 }] }] },
        { label: 'Ask how it all ends', req: { chapter: 3 },
          out: [{ w: 1, text: "'Ah,' she says. 'Nobody knows. But I have heard the last page is blank, and I have heard it is not the bad kind.' She smiles as if she has told you nothing at all.", ops: [{ op: 'ink', n: 2 }, { op: 'heal', pct: 0.1 }] }] },
        { label: 'Tell her a story',
          out: [
            { w: 2, text: "You tell her about a fox and a kappa. She writes it down. 'That will do,' she says, and hands you a few coins for it.", ops: [{ op: 'gold', n: 25 }] },
            { w: 1, text: "She listens all the way through and says, 'The ending needs work.' She is right, and you both know it. She pays you in advice.", ops: [{ op: 'ink', n: 1 }] },
          ] },
      ],
    },

    hungry_ghost: {
      title: 'The Hungry Ghost', art: { scene: 'event' },
      text: 'A hungry ghost sits at the crossroads beside an empty bowl. It does not beg. It only sits there being empty, and somehow that is worse.',
      choices: [
        { label: 'Fill the bowl', cost: '45 gold', req: { gold: 45 },
          out: [{ w: 1, text: "The ghost eats without hurry, nods once, and points down the left road with its whole arm. 'That way,' it says. 'That is the good way.' The road opens ahead like a held door.", ops: [{ op: 'gold', n: -45 }, { op: 'paint', n: 4 }, { op: 'ink', n: 1 }] }] },
        { label: 'Share your rations', cost: 'Both heroes go hungry',
          out: [
            { w: 3, text: 'You divide your rations. The ghost eats its share, then, after a pause, pushes half of it back. It seems to remember what rations are for. Your stomachs, less forgiving, remember too.', ops: [{ op: 'hurt', n: 5, who: 'both' }, { op: 'paint', n: 3 }, { op: 'ink', n: 1 }] },
            { w: 1, text: 'You divide your rations. The ghost, it turns out, was a magnificent cook in life. It sets its empty bowl down, and the empty bowl fills, and everyone eats far better than they gave.', ops: [{ op: 'heal', n: 6 }, { op: 'paint', n: 3 }] },
          ] },
        { label: 'Walk on',
          out: [{ w: 1, text: 'It does not follow. It does not need to. It will be at the next crossroads, patient and empty.' }] },
      ],
    },

    strange_seed: {
      title: 'A Seed in the Light', art: { scene: 'event' },
      text: 'A single seed sits on a stone in a beam of light. It is the wrong colour for any plant, and faintly warm, as though someone held it a moment ago and was called away.',
      choices: [
        { label: 'Plant it', cost: 'It might bite',
          out: [
            { w: 3, text: 'By dusk, a tree. By midnight, fruit. It tastes like the happiest thing you ever ate.', ops: [{ op: 'maxHp', n: 5 }] },
            { w: 1, text: 'By dusk, a tree that is not, on reflection, a tree. It lets you leave, but not without a few scratches.', ops: [{ op: 'hurt', n: 6 }, { op: 'addBrush', id: 'blot' }] },
            { w: 1, text: 'By dusk, a flower that sneezes pollen. Everyone is awake for three days.', ops: [{ op: 'hurt', n: 3 }, { op: 'ink', n: 2 }] },
          ] },
        { label: 'Keep it in your pocket', cost: 'Hurts the front hero',
          out: [
            { w: 3, text: 'It warms your pocket, then your hand, then rather more than that. After a mile it hardens into something clear and bright: a gem, quietly pleased with itself, and a blister to match.', ops: [{ op: 'hurt', n: 4, who: 'front' }, { op: 'addGem', tier: 1 }] },
            { w: 1, text: 'It flares in your pocket like a coal. You drop it, swear, and pick it up again, because it has set into something brilliant and you are not made of stone yourself.', ops: [{ op: 'hurt', n: 8, who: 'front' }, { op: 'addGem', tier: 3 }] },
          ] },
        { label: 'Leave it in the light',
          out: [{ w: 1, text: 'You leave it in the sun. Some things want to be left alone in the light, and you can feel the whole place approve. Warmth follows you for a mile.', ops: [{ op: 'heal', n: 4 }] }] },
      ],
    },

    two_doors: {
      title: 'The Honest Door and the Kind One', art: { scene: 'event' },
      text: 'Two doors stand side by side on the road, both wearing name tags. The left one says I WILL TELL YOU THE TRUTH. The right one says YOU LOOK WONDERFUL. Neither has a wall attached.',
      choices: [
        { label: 'The honest door',
          out: [{ w: 1, text: "'Your deck is bloated,' says the door, 'and your best card is not the one you think.' It is rude and correct. Something in your hand sharpens.", ops: [{ op: 'upgradeCard', random: true }] }] },
        { label: 'The kind door',
          out: [{ w: 1, text: "'Wonderful!' says the door. 'Truly stunning!' You feel fantastic, for no good reason, for the next several hexes.", ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Try the small door at the back',
          out: [
            { w: 1, text: 'It is a very small door with no name tag, and it opens on a tiny room with a single shelf. On the shelf, a curio, waiting with what looks like patience.', ops: [{ op: 'addRelic', rarity: 'common' }] },
            { w: 1, text: 'It is a broom cupboard. The broom does not take kindly to visitors.', ops: [{ op: 'hurt', n: 4 }] },
          ] },
        { label: 'Neither',
          out: [{ w: 1, text: 'You walk between the doors. Both are offended. The road, on the other hand, looks distinctly relieved.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    weary_travellers: {
      title: 'Three Travellers and a Pot', art: { scene: 'camp' },
      text: 'Three travellers share a small fire and a smaller pot of soup. They wave you over without asking who you are, which, in a book, is either great trust or great foreshadowing.',
      choices: [
        { label: 'Take the first watch', req: { hpPct: 0.5 },
          out: [{ w: 1, text: 'You keep watch while they sleep. Nothing happens. It is the best night you have had in a long while, and in the morning someone has left you a full bowl.', ops: [{ op: 'heal', pct: 0.1 }, { op: 'maxHp', n: 2 }] }] },
        { label: 'Trade for a brush', cost: '25 gold', req: { gold: 25 },
          out: [{ w: 1, text: "One of them has a spare brush wrapped in an old scarf. 'Bought it from a hermit,' he says. 'Never had the nerve.'", ops: [{ op: 'gold', n: -25 }, { op: 'addBrush', id: 'random' }] }] },
        { label: 'Share the fire',
          out: [
            { w: 3, text: 'They tell you every route they have taken. All of them were harder than this one, and they are very pleased to say so.', ops: [{ op: 'heal', pct: 0.2 }, { op: 'paint', n: 1 }] },
            { w: 1, text: 'One of them, it turns out, is a magnificent cook, and another has a very good map, and the third only ever says the word yes. You leave full, oriented, and agreed with.', ops: [{ op: 'heal', pct: 0.3 }, { op: 'paint', n: 2 }] },
          ] },
      ],
    },

    blank_patch: {
      title: 'The Patch of White', art: { scene: 'defeat' },
      text: 'A patch of the road has gone white. Not snow: nothing. A butterfly flutters into it and does not come out. The edge of it is advancing, slowly, like a very patient tide.',
      choices: [
        { label: 'Paint it back', cost: '2 Ink',
          out: [
            { w: 3, text: 'You paint a wobbly stretch of road across the white. It holds, thin as a wish. On the far side the road remembers whom it belongs to.', ops: [{ op: 'ink', n: -2 }, { op: 'maxHp', n: 3 }] },
            { w: 1, text: 'You paint a wobbly stretch of road across the white, and it takes, all at once, like a held breath let go. Where the patch stood, something small and bright is left behind.', ops: [{ op: 'ink', n: -2 }, { op: 'maxHp', n: 3 }, { op: 'addGem', tier: 1 }] },
          ] },
        { label: 'Let Suzu seal the edge', req: { hero: 'suzu' },
          out: [{ w: 1, text: 'Suzu presses a talisman to the edge. The Blank pauses, considers, and turns aside. She says nothing. She looks tired, and very, very good at this.', ops: [{ op: 'ink', n: 3 }, { op: 'heal', pct: 0.1 }] }] },
        { label: 'Throw in a cursed page',
          out: [{ w: 1, text: 'The Blank eats it without chewing. Even it looks a little unwell afterward.', ops: [{ op: 'removeCard', filter: { type: 'curse' } }] }] },
        { label: 'Step around it',
          out: [{ w: 1, text: 'You step around it, keeping to the green. The white does not follow. It only waits, which is the Blank\'s whole personality.', ops: [{ op: 'heal', n: 3 }] }] },
      ],
    },

    scribes_bargain: {
      title: 'The Scribe of Small Fates', art: { scene: 'paper' },
      text: "A tiny scribe, inked to the elbows, offers to edit your fate for a small fee. 'One line,' he says. 'Anything you like. No refunds, no repeats, and not the ending.'",
      choices: [
        { label: 'A line for the body', cost: '25 gold', req: { gold: 25 },
          out: [{ w: 1, text: "He writes: 'and they were very sturdy.' The ink dries on your ribs and tingles. Tomorrow you will be surprised how little a tree branch hurts.", ops: [{ op: 'gold', n: -25 }, { op: 'maxHp', n: 3 }] }] },
        { label: 'A line for the purse', cost: 'It may backfire',
          out: [
            { w: 2, text: "He writes: 'and they found a lot of gold.' Fate reads the line, says 'that is not how this works,' but a little of it leaks through.", ops: [{ op: 'gold', n: 30 }] },
            { w: 1, text: 'He writes it in the wrong ink. The gold, on reflection, was not yours.', ops: [{ op: 'gold', pct: -0.2 }] },
          ] },
        { label: 'Strike out a line', cost: 'Lose a card',
          out: [{ w: 1, text: 'He strikes it out with a small silver knife, and it is gone before you can miss it. He charges nothing. He looks nearly fond of you.', ops: [{ op: 'removeCard' }] }] },
        { label: 'Decline the pen',
          out: [{ w: 1, text: "You decline. The scribe nods and blows on his fingers. 'Wise,' he says. 'Everyone wants a good ending. It does not work like that.'", ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    raiga_storm_laugh: {
      title: "Raiga's Laugh", art: { scene: 'event' }, once: true, w: 3, when: { hero: 'raiga' },
      text: 'Raiga throws back his head and laughs for no reason at all, and everything within earshot laughs with him. The Blank, which had been creeping toward the path, stops. It seems, for a moment, to be listening.',
      choices: [
        { label: 'Laugh with him',
          out: [{ w: 1, text: 'It is contagious, in the good way. When it is over the air is clean and everyone is sore from grinning.', ops: [{ op: 'heal', pct: 0.2 }, { op: 'ink', n: 2 }] }] },
        { label: 'Ask what is so funny',
          out: [{ w: 1, text: "'Nothing!' says Raiga. 'That is what is funny about it!' Somehow, it lands. He claps you on the back so hard you feel sturdier.", ops: [{ op: 'maxHp', n: 2 }] }] },
        { label: 'Dare him to laugh louder', cost: 'Thunder may answer',
          out: [
            { w: 2, text: 'He does. The thunder answers, and for once it applauds. Every lantern, leaf and loose stone stands a little straighter, and so do you.', ops: [{ op: 'maxHp', n: 3 }] },
            { w: 1, text: 'He does. The thunder answers, and for once it means it. Everybody is deafened for a full minute and delighted for a good deal longer.', ops: [{ op: 'hurt', n: 5 }, { op: 'ink', n: 2 }] },
          ] },
        { label: 'Bottle the echo',
          out: [{ w: 1, text: 'You catch the last of the laugh in a jar and carry it carefully. By nightfall it has set, warm and bright, into a gem.', ops: [{ op: 'addGem', color: 'gold', tier: 1 }] }] },
      ],
    },

    paper_crane_folder: {
      title: 'A Thousand Paper Cranes', art: { scene: 'event' },
      text: 'An old woman folds paper cranes, and her fingers never seem to hurry. A thousand lie at her feet. She has, she says, nearly finished. She has been nearly finished for a very long time.',
      choices: [
        { label: 'Ask for a wish',
          out: [
            { w: 1, text: 'A crane leaves her hand, circles you three times, and returns with the answer: you are sturdier than you were.', ops: [{ op: 'maxHp', n: 4 }] },
            { w: 1, text: 'A crane leaves her hand, circles you three times, and returns with the answer: the road opens.', ops: [{ op: 'paint', n: 5 }] },
            { w: 1, text: 'A crane leaves her hand, circles you three times, and returns with the answer: something small and bright.', ops: [{ op: 'addGem', tier: 2 }] },
          ] },
        { label: 'Help her fold',
          out: [{ w: 1, text: "Your crane is lopsided. She sets it at the very top with great ceremony. 'That one will do the most good,' she says, and you feel that it might.", ops: [{ op: 'heal', n: 6 }, { op: 'ink', n: 2 }] }] },
      ],
    },
  });
})();
