// Hocus Vocus: data_events.js: the Detours (event tiles). 48 events: 12 per act (`chapters:[n]`) plus 12 for any act.
// Data only (DESIGN 4.9, CONTENT_SPEC 6): one IIFE that registers into DATA.events. No functions, no clock, no unseeded randomness,
// no em or en dashes. Everything here is validated by DATA.validate('events') and DATA.audit('events'), and
// tests/hocus_vocus_narrative.test.mjs replays every outcome through the real RUN.applyOps when RUN is present.
//
// HOUSE RULES FOR THIS FILE
//   * Every event has at least one SAFE choice: no `cost`, and no `hurt`, `addCurse`, `fight`, negative gold or negative max HP
//     in any of its outcomes (the audit checks this). Gambles have several weighted outcomes, costs carry a display `cost`
//     and the outcome carries the matching negative op (`cost` is display text only, the engine never deducts it).
//   * Fights use `enemies:[ids]` from the fixed roster and only enemies of the event's own chapter (any-chapter events have
//     no fights, because their difficulty could not follow the act). Fight choices say so in their label.
//   * Relics are referenced only by the fixed ids brass_lantern, fox_mask, silver_bell, jade_key (CONTENT_SPEC 2), everything
//     else by `rarity`. Curses only by the fixed curse_* ids. No card, gem or relic id outside those.
//   * Choices gated by `req.hero` are hidden when that hero is not in the party, so every event keeps two visible choices
//     that need nothing. `req.chapter` (an act) and `req.relic` choices are shown disabled (the engine says why).
//   * `once:true` marks the events with lasting story or deck consequences (flags, relics, card changes, curses).
//
// FLAG PATHS
//   fox_spared  set by `fox_in_the_snare` (Act I, untangle the gull chick). Unlocks `fox_returns` (Act II, w 6) and a choice in
//               `kappa_toll` and `lantern_ferry`. The gull grows up: a chick in Act I, a young gull with a stolen goat mask in
//               Act II, a grown gull who sings in Act III.
//   fox_bond    set by any choice of `fox_returns`. Unlocks `fox_at_the_gate` (Act III, w 6), the gull's last gift.
//   silver_bell `peddler_silver_bell` has a choice that needs the relic (the Triangle; a rare Charm as thanks).
//   fox_mask    `mask_market` (ch2) has a choice that needs the relic (the Goat Mask). jade_key (the Backstage Pass) opens
//               `jade_door`. brass_lantern (the Tour Poster) unlocks `brass_lantern_secret`.
//   Hero moments (`when.hero`, w 3): Jasmin and the Perfect Voice (Act I), RoxorLoops and the First Beat (Act II), RawClaw Hears
//   the Mix (Act III), Andy Checks the Floor (any act); ids hanae_mirror_pool, kuro_footnote, suzu_cracked_binding, raiga_storm_laugh.
//
// STAKES (balance pass 1). The bot measured ten detours where one free option beat every other (a free gem, a free removal, a free
//   relic, a free upgrade). Each now makes that option cost something real: HP (strange_seed, fox_in_the_snare, fox_returns,
//   hanae_mirror_pool, silk_threads), gold (hungry_ghost, censor_office, hermit_brush_seller), a risk of a curse (pawn_shop,
//   missing_page) or a card plus HP (kill_your_darlings), and the dull options (leave it, talk, step around) stay free and safe.
//   lantern_ferry's free option was cut down to match. The bot's own expected values (tools/hocus_vocus/bot/policies.mjs) now sit
//   within a few points of each other for most of these, and which one wins depends on HP and gold.
// Tone: silly, warm and heartfelt. Vox is the map resource (op `ink`), Spells are the one-use map tools (op `addBrush`), unmuting
// a hex is op `paint`, and the Gloss is the polish that mutes the world. Ids and ops keep their old names. Magnitudes follow the
// economy (ECONOMY.price, camp restPct 0.35): a 25 gold cost buys about 5 gold of comfort plus a real perk, a gamble is roughly
// fair, a curse buys about 40 to 60 gold of value.
(() => {
  // ------------------------------------------------------------------ Act I: Blossom Bay
  DATA.add('events', {
    fox_in_the_snare: {
      title: 'A Gull in the Bunting', art: { scene: 'ch1' }, chapters: [1], once: true, w: 3,
      text: 'A gull chick is tangled in the bunting above the quay, squawking one flat note. A glossy talent scout is reaching for it with a smile. The chick has stopped flapping and started glaring.',
      choices: [
        { label: 'Untangle the chick', cost: 'Hurts the lead hero',
          out: [
            { w: 4, text: 'The chick pecks you twice out of pure principle, then tumbles free, bows once like a tiny sailor and flaps off over the boats. It squawks one flat little note back at you, and somehow the note follows you down the quay.', ops: [{ op: 'hurt', n: 4, who: 'front' }, { op: 'flag', k: 'fox_spared' }, { op: 'ink', n: 1 }] },
            { w: 1, text: 'The bunting is tighter than it looked, and the chick is in no mood for gratitude. It pecks hard, wriggles loose and is gone over the rooftops before you can say anything gentle. You are left with a sore thumb and a lot of bunting.', ops: [{ op: 'hurt', n: 6, who: 'front' }] },
          ] },
        { label: 'Let the scout take it', cost: 'A curse: Cringe Replay',
          out: [
            { w: 3, text: 'The scout pays you very generously and promises the chick perfect pitch by teatime. It looks back at you all the way down the pier and does not blink once. The gold is heavy in a way that has nothing to do with weight.', ops: [{ op: 'gold', n: 80 }, { op: 'addCurse', id: 'curse_regret' }] },
            { w: 1, text: "The scout pays you in compliments. 'Flawless! So generous!' They are lovely, and they are not gold. The chick is gone, and the cringe, sadly, is genuine.", ops: [{ op: 'addCurse', id: 'curse_regret' }] },
          ] },
        { label: 'Leave it. Not your detour.',
          out: [{ w: 1, text: 'You walk on. Behind you, something small and fluffy squawks a very rude flat note. You pretend not to speak gull.' }] },
      ],
    },

    kappa_toll: {
      title: 'The Foghorn Wants a Toll', art: { scene: 'ch1' }, chapters: [1],
      text: "A brass foghorn on stubby legs blocks the footbridge, cap perfectly straight. 'Toll,' it honks. 'Twenty gold, or a very good reason.' It is small, damp and completely serious about it.",
      choices: [
        { label: 'Pay the twenty gold', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: 'It counts each coin twice and honks a dignified thank you. It also presses a cold cucumber into your hand and refuses to explain. It is the crunchiest thing you have ever eaten.', ops: [{ op: 'gold', n: -20 }, { op: 'heal', n: 6 }] }] },
        { label: 'Bow. Very, very deeply.', cost: 'It may not bow back',
          out: [
            { w: 3, text: 'Harbour manners say it must bow back. It does, and it tips right over, honking all the way down. It waves you across, mortified, and pays you fifteen gold never to mention it.', ops: [{ op: 'gold', n: 15 }] },
            { w: 2, text: "It bows back so smoothly that its cap does not even wobble. 'Ah,' it honks, straightening up. 'Someone raised you properly. Regrettable.' The next part is louder.", ops: [{ op: 'fight', enemies: ['kappa'] }] },
          ] },
        { label: 'Mention the gull you freed', req: { flag: 'fox_spared' },
          out: [{ w: 1, text: "Its bell goes round with surprise. 'You freed the chick? She lives on my lighthouse!' The toll is waived, the bridge is swept, and a cold cucumber arrives with a small honk and a very large thank you.", ops: [{ op: 'heal', n: 8 }, { op: 'ink', n: 1 }] }] },
        { label: 'Take the long way round',
          out: [{ w: 1, text: 'It costs an hour and most of your patience, and the foghorn watches you go with the calm of a professional. But you come out by the fruit stall, dry, unhonked at and a little smug.', ops: [{ op: 'heal', n: 3 }] }] },
      ],
    },

    tanuki_tea_house: {
      title: 'The Very Serious Lemonade Stand', art: { scene: 'shop' }, chapters: [1],
      text: 'A very serious child runs a lemonade stand on the Snack Pier. The sign says LEMONADE (REAL). The child says the sign is not lying, which is somehow worse.',
      choices: [
        { label: 'Buy a proper jug', cost: '25 gold', req: { gold: 25 },
          out: [{ w: 1, text: 'The lemonade is astonishingly good. The child charges extra for the astonishment, and you find you cannot be cross. The fizz goes all the way down to your toes and stays there.', ops: [{ op: 'gold', n: -25 }, { op: 'heal', n: 12 }, { op: 'ink', n: 1 }] }] },
        { label: 'Pay with a sticker', cost: 'Maybe 25 gold',
          out: [
            { w: 1, text: "The child studies the sticker. Sniffs it. Squints. 'Shiny. Limited. A very fine design.' And accepts it! The lemonade is free, and you have just witnessed a very rare business defeat.", ops: [{ op: 'heal', n: 12 }] },
            { w: 1, text: 'The child peels the sticker off, sticks it on your forehead and points at the price board. You look at the child. The child looks at you. You pay, with great dignity.', ops: [{ op: 'gold', n: -25 }] },
          ] },
        { label: 'Let RoxorLoops beatbox a jingle', req: { hero: 'kuro' },
          out: [{ w: 1, text: 'RoxorLoops drops a lemonade jingle, fizz sounds and all. The child tries very hard to stay serious, fails, and declares free refills for life. You drink four cups and are, for a while, unstoppable.', ops: [{ op: 'heal', n: 14 }] }] },
        { label: 'Admire the stand',
          out: [{ w: 1, text: 'The stand is a marvel: a striped awning, a jar of paper straws, a lemon with a drawn-on face. The child is pleased you noticed. You all stand there in a small, warm, unprofitable moment.', ops: [{ op: 'heal', n: 4 }] }] },
      ],
    },

    hanae_mirror_pool: {
      title: 'Jasmin and the Perfect Voice', art: { scene: 'ch1' }, chapters: [1], once: true, w: 3, when: { hero: 'hanae' },
      text: 'A glossy speaker on the quay plays Jasmin a perfect copy of her own voice: no wobble, no breath, every note exact. It sounds lovely and slightly empty. Jasmin, very calmly, decides to answer it.',
      choices: [
        { label: 'Let her sing back to it', cost: 'Jasmin will be hurt',
          out: [
            { w: 3, text: 'The copy sings louder. Jasmin sings softer, and the whole quay leans in to listen. Her throat is scratchy by the end, but the speaker crackles, coughs and plays her real voice back, wobble and all. She learns something new from it.', ops: [{ op: 'hurt', n: 9, who: 'hanae' }, { op: 'upgradeCard', filter: { hero: 'hanae' } }] },
            { w: 2, text: "The copy hits a note she cannot quite reach, and Jasmin, to her own surprise, giggles. 'Again,' she says, a little hoarse and delighted. She has not sounded this strong all week.", ops: [{ op: 'hurt', n: 8, who: 'hanae' }, { op: 'maxHp', n: 3, who: 'hanae' }] },
          ] },
        { label: 'Smile and walk on',
          out: [{ w: 1, text: 'Jasmin smiles at the speaker and walks on, humming. The copy tries to hum along and comes in half a beat late. She lets it have that one.', ops: [{ op: 'ink', n: 2 }] }] },
      ],
    },

    mushroom_ring: {
      title: 'The Flash Mob', art: { scene: 'ch1' }, chapters: [1],
      text: 'A flash mob dances in a perfect ring on the quay, every step in sync. They beckon you in. One of them holds out a fizzy lemon drop that glitters in a way lemon drops usually do not.',
      choices: [
        { label: 'Dance with them', cost: 'A card changes, feet ache',
          out: [
            { w: 3, text: 'Nine dances and one very long spin. Somewhere in there, a card in your deck learns the steps and rearranges itself, politely, into something else.', ops: [{ op: 'transformCard' }, { op: 'heal', n: 4 }] },
            { w: 1, text: 'The routine turns out to be a good deal longer than advertised, and nobody tells you where the ending is. Everyone limps off sore, sweaty and covered in glitter.', ops: [{ op: 'hurt', n: 4 }] },
          ] },
        { label: 'Eat the lemon drop', cost: 'Could go either way',
          out: [
            { w: 2, text: 'It tastes like lemon fizz and a slightly sad memory. Something in you stretches an inch, and you spend a happy hour feeling tall.', ops: [{ op: 'maxHp', n: 2 }] },
            { w: 1, text: 'It tastes like a compliment from a stranger. Whoever is weakest sees sparkles for an hour, and then sees more clearly than in days.', ops: [{ op: 'hurt', n: 6, who: 'lowest' }, { op: 'ink', n: 2 }] },
          ] },
        { label: 'Decline politely',
          out: [{ w: 1, text: 'They shrug in perfect unison and dance on. It is somewhat undignified how badly you want to join. The wanting, oddly, is restful, and you leave a little lighter.', ops: [{ op: 'heal', n: 5 }] }] },
      ],
    },

    jizo_row: {
      title: 'The Seventh Living Statue', art: { scene: 'event' }, chapters: [1], once: true,
      text: 'Seven living statues stand along the quay, sprayed silver and perfectly still. Six are smiling. The seventh frowns at nothing, and someone has left a whole bowl of warm noodles in its hat.',
      choices: [
        { label: 'Drop some gold in the hat', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: 'The frowning statue does not smile, exactly. But its frown loosens by about a degree, which for a living statue is a standing ovation. You feel a little sturdier all over.', ops: [{ op: 'gold', n: -20 }, { op: 'maxHp', n: 3 }] }] },
        { label: 'Eat the noodles', cost: 'Maybe a curse: Stage Fright',
          out: [
            { w: 2, text: 'Nobody stops you. The noodles are warm and the best you have had in days. On the way out you feel seven silver stares on your back, and suddenly you are not sure you know how to stand.', ops: [{ op: 'heal', n: 12 }, { op: 'addCurse', id: 'curse_doubt' }] },
            { w: 1, text: 'Nobody stops you, and nobody minds. The seventh statue even seems to relax. You are almost disappointed.', ops: [{ op: 'heal', n: 12 }] },
          ] },
        { label: 'Straighten its bow tie',
          out: [{ w: 1, text: 'You straighten a silver bow tie, dust off a silver hat and say thank you to nobody in particular. The six smiling statues smile a little more.', ops: [{ op: 'heal', n: 6 }] }] },
      ],
    },

    tengu_dice: {
      title: "The Gull's Dice", art: { scene: 'event' }, chapters: [1],
      text: "A gull in an enormous hat sits on a crate with three dice. 'Even or odd,' he offers. 'Fifty gold a throw, and I only cheat a little.' The dice look extremely well loved.",
      choices: [
        { label: 'Bet fifty gold on even', cost: 'Up to 50 gold', req: { gold: 50 },
          out: [
            { w: 1, text: 'Even! The gull is not sad. He was, he explains, cheating in your favour, to see what you would do with it. You count the fifty gold twice.', ops: [{ op: 'gold', n: 50 }] },
            { w: 1, text: 'Odd. On closer inspection the dice have no even faces at all. The gull tips his enormous hat with enormous sincerity.', ops: [{ op: 'gold', n: -50 }] },
          ] },
        { label: 'Ask RoxorLoops about the dice', req: { hero: 'kuro' },
          out: [{ w: 1, text: "'Listen to them land,' says RoxorLoops, and beatboxes the rattle back. 'Left one. Heavy on odd. Ts.' You bet odd. The gull's hat trembles with respect, and forty gold changes hands.", ops: [{ op: 'gold', n: 40 }] }] },
        { label: 'Let Jasmin challenge him to a sing-off', req: { hero: 'hanae' },
          out: [{ w: 1, text: 'The gull squawks one magnificent, terrible note. Jasmin answers with a soft little run, and the whole pier goes quiet to listen. He hands over his hat badge, a little dented, with a pink gem pinned in it.', ops: [{ op: 'addGem', color: 'red' }] }] },
        { label: 'Watch him play a round',
          out: [{ w: 1, text: 'He wins, loses, wins, and squawks along the whole time. You learn two things: the dice are loaded, and the squawking is, in its way, beautiful.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    stone_lantern_story: {
      title: 'The Lighthouse Wants a Tune', art: { scene: 'ch1' }, chapters: [1],
      text: 'An old lighthouse at the end of the harbour wall has been dark for years. It says it will shine again if someone sings it a song. It would like a good one. It has already heard the gulls.',
      choices: [
        { label: 'Sing it a song',
          out: [
            { w: 3, text: "You sing about a gull, a footbridge and a very serious cucumber. The lamp glows a proud warm gold. 'Acceptable,' it says, and light spills along the path ahead.", ops: [{ op: 'paint', n: 2 }] },
            { w: 1, text: 'It has heard that one. But it is generous, and pretends it has not. The light is dim, but real.', ops: [{ op: 'paint', n: 1 }] },
          ] },
        { label: 'Let RoxorLoops give it a beat', req: { hero: 'kuro' },
          out: [{ w: 1, text: 'He gives it a lighthouse beat, slow and huge, a kick for every turn of the lamp. The lighthouse blinks in time, delighted, and the road ahead lights itself for a long way.', ops: [{ op: 'paint', n: 3 }, { op: 'ink', n: 1 }] }] },
        { label: 'Light it yourself', cost: '1 Vox',
          out: [{ w: 1, text: 'Cheating, and the lighthouse knows it. But a lit lamp is a lit lamp, and it sulks for only a moment before shining on your behalf.', ops: [{ op: 'ink', n: -1 }, { op: 'paint', n: 3 }] }] },
      ],
    },

    oni_cub_sumo: {
      title: 'The Jitterbug Wants a Dance-Off', art: { scene: 'ch1' }, chapters: [1],
      text: 'A small lilac bug with very large knees knocks them together, points at you and stamps. It wants a dance-off. The whole pier has gone quiet to watch. It is enormously, wobblingly sincere.',
      choices: [
        { label: 'Accept the dance-off (fight)',
          out: [{ w: 1, text: 'It bows, which is your first sign that you are dealing with a professional. Then its knees start knocking in tempo, and it charges.', ops: [{ op: 'fight', enemies: ['oni_cub'], win: [{ op: 'maxHp', n: 2 }] }] }] },
        { label: 'Let Andy step onto the floor', req: { hero: 'raiga' },
          out: [{ w: 1, text: "Andy plugs in and plays one slow, warm bass line. The bug's knees stop knocking. They sway together for one long, dignified minute, and Andy lets it win the last step. It leaves its lucky pebble behind. It is, on inspection, a pink gem.", ops: [{ op: 'addGem', color: 'red' }] }] },
        { label: 'Slip it a banana', cost: '10 gold', req: { gold: 10 },
          out: [
            { w: 3, text: 'It accepts the banana as a sign of respect and eats it as a sign of hunger. You are friends now. It teaches you a dance move, and you use it for the next hour, incorrectly.', ops: [{ op: 'gold', n: -10 }, { op: 'ink', n: 1 }] },
            { w: 1, text: 'It eats the banana in one bite, wipes its antennae and remembers what it wanted in the first place. On a full stomach, it is even more sincere.', ops: [{ op: 'gold', n: -10 }, { op: 'fight', enemies: ['oni_cub'], win: [{ op: 'maxHp', n: 2 }] }] },
          ] },
        { label: 'Slip away quietly',
          out: [{ w: 1, text: 'You tiptoe round the edge of the pier. The bug does not notice until you are gone, then stamps so hard that three gulls fall off the railing.' }] },
      ],
    },

    hermit_brush_seller: {
      title: "The Street Magician's Spells", art: { scene: 'shop' }, chapters: [1],
      text: "An old street magician sells Spells from a suitcase on the pier, each one a little out of breath. 'They are single use,' she says, 'like most good ideas.' She looks at your deck with interest.",
      choices: [
        { label: 'Buy a Vocal Run', cost: '60 gold', req: { gold: 60 },
          out: [{ w: 1, text: "She sings it into your cupped hands and does not let go until you promise to sing it properly. 'Five hexes,' she says. 'Enough to change your mind about a whole afternoon.'", ops: [{ op: 'gold', n: -60 }, { op: 'addBrush', id: 'wave' }] }] },
        { label: 'Trade a card for a Spell', cost: 'Lose a card, 70 gold', req: { gold: 70 },
          out: [
            { w: 3, text: 'She takes the card, folds it into a paper bird and lets it fly off over the boats. In its place she pulls a Spell out of your ear, which is rude, and also very impressive.', ops: [{ op: 'gold', n: -70 }, { op: 'removeCard' }, { op: 'addBrush', id: 'random' }] },
            { w: 1, text: "She takes the card and gives you a Vocal Run, the long one. 'It suits you,' she says, as if you had asked. You had not, but she is right, and that is the most annoying part.", ops: [{ op: 'gold', n: -70 }, { op: 'removeCard' }, { op: 'addBrush', id: 'wave' }] },
          ] },
        { label: 'Just talk',
          out: [{ w: 1, text: 'She tells you about the bay before the Gloss, when every corner had a song on it. You leave with nothing to show for it but a warm feeling that, oddly, keeps paying out.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    paper_kodama_pilgrim: {
      title: 'The Lost Voice Note', art: { scene: 'ch1' }, chapters: [1],
      text: 'A little voice note with stubby legs shuffles along the quay, holding one recorded hum in both hands. It has no voice of its own. When it sees you, it stops and holds the hum out to you.',
      choices: [
        { label: 'Play the voice note', cost: 'It may sour your deck',
          out: [
            { w: 3, text: "The hum is somebody's half-finished idea, and it is a good one. It unfolds in your head into three possible tunes. Pick the one you like best.", ops: [{ op: 'cardReward', n: 3 }] },
            { w: 1, text: "The hum is somebody's very first demo, and it is wildly off-key. Somewhere a grumpy voice says 'pitchy', and the word climbs into your deck and sits down.", ops: [{ op: 'addCurse', id: 'curse_smudge' }] },
          ] },
        { label: 'Ask it to record a card', cost: '40 gold', req: { gold: 40 },
          out: [{ w: 1, text: 'It listens to one of your cards with its whole small body, then plays it back, perfectly imperfect. Now you have two. It looks extremely proud and slightly out of breath.', ops: [{ op: 'gold', n: -40 }, { op: 'duplicateCard' }] }] },
        { label: 'Pat its head',
          out: [{ w: 1, text: 'It leans into your hand like a cat into a sunbeam and plays you a tiny happy beep. Somehow that is enough to make the whole morning better.', ops: [{ op: 'heal', n: 5 }] }] },
      ],
    },

    missing_page: {
      title: 'The Airbrushed Corner', art: { scene: 'defeat' }, chapters: [1],
      text: 'One corner of the bay has gone smooth and shiny, like a photo with the life airbrushed out. The bunting leans away from it. Something is missing here, and you can feel it like a skipped beat.',
      choices: [
        { label: 'Step around it',
          out: [{ w: 1, text: 'You give the shiny corner a wide berth. On the far side the bay is loud and ordinary again, and you have never been so glad to hear a gull complain.', ops: [{ op: 'heal', n: 3 }] }] },
        { label: 'Reach in', cost: 'Something may change',
          out: [
            { w: 1, text: "Your hand closes on a busker's hat full of coins the Gloss smoothed away. You pull it back into the noise, and the coins jingle like they missed you.", ops: [{ op: 'gold', n: 55 }] },
            { w: 1, text: 'It is cold in there, perfectly cold. You pull your hand back stinging, but a little stray Vox comes with it, humming.', ops: [{ op: 'hurt', n: 4 }, { op: 'ink', n: 2 }] },
            { w: 1, text: 'Your fingers find a Spell someone dropped, still warm. It was waiting for a voice.', ops: [{ op: 'addBrush', id: 'random' }] },
          ] },
        { label: 'Sing into it', cost: '2 Vox, maybe a curse',
          out: [
            { w: 3, text: 'You sing the corner back, wobble and all. Colour seeps in, a door creaks, a dog barks somewhere. You feel sturdier for having done it.', ops: [{ op: 'ink', n: -2 }, { op: 'maxHp', n: 2 }, { op: 'heal', n: 6 }] },
            { w: 1, text: "The corner comes back, mostly. One note of your song cracks on the way out, somebody passing says 'pitchy', and the word follows you into your deck, smug as anything.", ops: [{ op: 'ink', n: -2 }, { op: 'heal', n: 6 }, { op: 'addCurse', id: 'curse_smudge' }] },
          ] },
      ],
    },
  });

  // ------------------------------------------------------------------ Act II: Scrollopolis
  DATA.add('events', {
    fox_returns: {
      title: 'The Gull Comes Back', art: { scene: 'ch2' }, chapters: [2], once: true, w: 6, when: { flag: 'fox_spared' },
      text: 'A young gull lands on a rooftop aerial above the screens. She looks exactly like a chick you once untangled, only taller, and she is holding a small goat mask in her beak, very clearly stolen.',
      choices: [
        { label: 'Accept the goat mask', cost: 'Hurts the lead hero',
          out: [{ w: 1, text: 'She drops the goat mask into your hand, then pecks your lead hero once, firmly, for luck. The mask smells faintly of a rooftop studio. Put it on, and your feet suddenly want to dance.', ops: [{ op: 'addRelic', id: 'fox_mask' }, { op: 'flag', k: 'fox_bond' }, { op: 'hurt', n: 4, who: 'front' }] }] },
        { label: 'Follow her across the rooftops',
          out: [{ w: 1, text: 'She hops from aerial to aerial and you follow, over satellite dishes and blinking signs. Five hexes of rooftop light up as you go, and she squawks every single one of them flat.', ops: [{ op: 'paint', n: 5 }, { op: 'flag', k: 'fox_bond' }] }] },
        { label: 'Ask her about Kraki',
          out: [{ w: 1, text: 'She tells you, in squawks, that the big kraken in the bay sings with everyone now, badly and happily, and that gulls are allowed on the open mic. You feel a lot better about everything.', ops: [{ op: 'heal', pct: 0.1 }, { op: 'ink', n: 2 }, { op: 'flag', k: 'fox_bond' }] }] },
        { label: 'Scratch her under the chin',
          out: [
            { w: 3, text: 'She leans into it with her eyes shut, and her flat little squawk turns, for one moment, into a note. Everyone feels warmer for it.', ops: [{ op: 'heal', pct: 0.25 }, { op: 'ink', n: 1 }, { op: 'flag', k: 'fox_bond' }] },
            { w: 1, text: 'She allows it for three seconds, then pecks your lead hero to show who is in charge. Then she sits on your shoulder anyway.', ops: [{ op: 'hurt', n: 3, who: 'front' }, { op: 'ink', n: 2 }, { op: 'flag', k: 'fox_bond' }] },
          ] },
      ],
    },

    lantern_ferry: {
      title: 'The Night Bus', art: { scene: 'ch2' }, chapters: [2],
      text: "The night bus glides up, driven by a cheerful screen with a face. 'Fare is thirty gold,' it says. 'Or one song. Or, if you are honest, one thing you are afraid of.'",
      choices: [
        { label: 'Pay the fare', cost: '30 gold', req: { gold: 30 },
          out: [{ w: 1, text: 'The doors hiss open. The bus takes the long, scenic route through the glowing streets, and six hexes light up outside the window as you pass.', ops: [{ op: 'gold', n: -30 }, { op: 'paint', n: 6 }] }] },
        { label: 'Run after it', cost: 'A long, cold chase',
          out: [
            { w: 2, text: 'You run behind it through the rain for five whole stops. It is miserable and cold, but you see everything on the way.', ops: [{ op: 'hurt', n: 4 }, { op: 'paint', n: 5 }] },
            { w: 1, text: 'You run behind it through the rain, and a pocketful of coins bounces out at a corner. You get there soaked and twenty gold lighter.', ops: [{ op: 'hurt', n: 4 }, { op: 'gold', n: -20 }] },
          ] },
        { label: 'Say the gull sent you', req: { flag: 'fox_spared' },
          out: [{ w: 1, text: "The screen's face lights up. 'The harbour gull? Any friend of hers.' It waves you on for free, finds you a seat by the heater and drops you right where you need to be.", ops: [{ op: 'paint', n: 3 }, { op: 'heal', n: 4 }] }] },
        { label: 'Tell it your fear',
          out: [{ w: 1, text: "You tell it you are afraid nobody will sing along. The screen is quiet for a whole stop. 'Me too,' it says, and takes you a little further than it should.", ops: [{ op: 'heal', n: 4 }, { op: 'paint', n: 1 }] }] },
      ],
    },

    endless_supper: {
      title: 'The Table Nobody Eats At', art: { scene: 'ch2' }, chapters: [2],
      text: 'A long table glows on a rooftop, laid with steaming noodles, bean buns and fruit. The guests are polite and perfectly lit. Nobody eats. Every phone is up. The photo is not quite perfect yet.',
      choices: [
        { label: 'Sit and eat', cost: 'Maybe a curse: Excess Baggage',
          out: [
            { w: 3, text: 'You sit down and actually eat. It is delicious. The guests stare, then one by one put their phones down and pick up their chopsticks. Nobody posts anything. It is the best meal of the night.', ops: [{ op: 'heal', pct: 0.3 }] },
            { w: 1, text: 'You eat, and it is lovely, but a guest insists on packing you the leftovers in a suitcase so large you will be carrying it for the rest of the tour. You cannot find a polite way to say no.', ops: [{ op: 'heal', pct: 0.15 }, { op: 'addCurse', id: 'curse_burden' }] },
          ] },
        { label: 'Slip into the kitchen (risky)',
          out: [
            { w: 2, text: 'The cook is so delighted someone wants to eat the food, not photograph it, that she feeds you twice and presses a little gold on you for the road.', ops: [{ op: 'heal', n: 8 }, { op: 'gold', n: 25 }] },
            { w: 1, text: 'The kitchen is run by a clicking little algorithm on cable legs. It has decided you would like more of this. A lot more. Forever.', ops: [{ op: 'fight', enemies: ['silk_weaver'] }] },
          ] },
        { label: 'Decline politely',
          out: [{ w: 1, text: 'You thank them and leave the table as it is. On the way out, a guest you never noticed slips you fifteen gold for being the only one who said hello. You keep it.', ops: [{ op: 'gold', n: 15 }] }] },
      ],
    },

    puppet_theatre: {
      title: 'The Trend Dance', art: { scene: 'ch2' }, chapters: [2],
      text: 'On a giant street screen, a hundred dancers do the same trend dance, glowing strings tied to every wrist. The dancers have your faces. Someone is pulling the strings, and they are bored.',
      choices: [
        { label: 'Join the trend', cost: 'A card is recast',
          out: [{ w: 1, text: 'You learn the dance in seconds, because everyone already knows it. By the last step one of your cards has quietly become a different card, and the crowd says it suits you.', ops: [{ op: 'transformCard' }, { op: 'heal', n: 4 }] }] },
        { label: 'Cut the strings (risky)',
          out: [
            { w: 3, text: 'The strings snap with a twang, and the dancers stop, blink and start dancing however they like. One of them hands you a gem from the stage lights as a thank you.', ops: [{ op: 'addGem', tier: 2 }] },
            { w: 1, text: 'The strings snap, and a glittering figure on a very tall stool turns round with a phone for a face. It does not like it when the trend stops.', ops: [{ op: 'fight', enemies: ['puppet_master'], tier: 'elite' }] },
          ] },
        { label: 'Watch until the end',
          out: [{ w: 1, text: 'You watch the whole dance, and at the very end one dancer does a tiny wrong step on purpose. Nobody else sees it. You do, and it warms you right through.', ops: [{ op: 'ink', n: 1 }, { op: 'heal', n: 5 }] }] },
      ],
    },

    koi_wishing_pond: {
      title: 'The Wishing Fountain', art: { scene: 'ch2' }, chapters: [2],
      text: 'A fountain glows in the plaza under a sign: WISHES, 10 GOLD. Under it, in comment-section capitals: ALSO WE ARE JUDGING YOU. A very old goldfish watches you with real attention.',
      choices: [
        { label: 'Make a wish', cost: '10 gold', req: { gold: 10 },
          out: [
            { w: 2, text: 'The coin sinks, the fountain fizzes, and one of your cards comes out of it sounding better than it went in.', ops: [{ op: 'gold', n: -10 }, { op: 'upgradeCard', random: true }] },
            { w: 2, text: 'The coin sinks, and the fountain politely spits out something nicer: a small, bright gem.', ops: [{ op: 'gold', n: -10 }, { op: 'addGem', tier: 1 }] },
            { w: 1, text: 'The coin sinks. Nothing happens. The goldfish looks at you. It is, very clearly, judging you.' },
          ] },
        { label: 'Scoop out the coins', cost: 'A curse: Hot Take',
          out: [{ w: 1, text: "You scoop out forty gold of other people's wishes. Somebody films it. By the time you reach the corner, your hot take on wishing fountains is everywhere.", ops: [{ op: 'gold', n: 40 }, { op: 'addCurse', id: 'curse_hex' }] }] },
        { label: 'Make an honest wish, no coin',
          out: [{ w: 1, text: 'You wish for nothing in particular, just for everyone to be all right. The goldfish nods. You feel a little lighter.', ops: [{ op: 'heal', n: 6 }] }] },
      ],
    },

    pawn_shop: {
      title: 'Unboxing Alley', art: { scene: 'shop' }, chapters: [2],
      text: "A resale shop where every second-hand thing talks and has opinions. A phone case whispers 'take me', a kettle mutters 'do not', and a ring light keeps rating everything out of ten.",
      choices: [
        { label: 'Sell a card', cost: 'Maybe a curse',
          out: [
            { w: 1, text: 'The till bleeps, the card is gone, and you walk out with a little more gold and a little less to carry. The kettle tuts all the way to the door.', ops: [{ op: 'removeCard' }, { op: 'gold', n: 35 }] },
            { w: 1, text: 'You haggle over one card for ten minutes, loudly and badly, and the ring light films the whole thing. You do not even sell the card. The clip plays on a loop in the shop window, and somewhere in your head it keeps playing.', ops: [{ op: 'addCurse', id: 'curse_regret' }] },
          ] },
        { label: 'Buy a mystery box', cost: '60 gold', req: { gold: 60 },
          out: [
            { w: 2, text: 'You unbox it live for nobody in particular. Inside: a Charm, slightly scuffed, very pleased to meet you.', ops: [{ op: 'gold', n: -60 }, { op: 'addRelic', rarity: 'uncommon' }] },
            { w: 1, text: 'You open the box and the whole shop gasps. It is a rare Charm. The phone case is furious it did not get picked.', ops: [{ op: 'gold', n: -60 }, { op: 'addRelic', rarity: 'rare' }] },
            { w: 1, text: 'The box is empty except for a loud opinion, and the opinion is yours now. It has already been shared.', ops: [{ op: 'gold', n: -60 }, { op: 'addCurse', id: 'curse_hex' }] },
          ] },
        { label: 'Talk to the kettle',
          out: [{ w: 1, text: 'The kettle tells you not to buy anything, not to sell anything, and to drink more water. It is the best advice in the shop.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    flooded_archive: {
      title: 'The Flooded Record Shop', art: { scene: 'paper' }, chapters: [2], once: true,
      text: 'A record shop under the street has flooded, knee-deep in cold rainwater. Crates bob upside down. On the very top shelf one record is still dry, and it is quietly playing to itself.',
      choices: [
        { label: 'Wade in for the dry record', cost: 'The water bites',
          out: [
            { w: 3, text: 'You wade across, lift the dry record down and listen. Three good ideas are hiding in the grooves. Take the one you like.', ops: [{ op: 'cardReward', n: 3, rarity: 'uncommon' }] },
            { w: 1, text: 'Something under the water nips your ankle on the way. You reach the shelf anyway, soaked and sore, and the record offers you three good ideas for your trouble.', ops: [{ op: 'hurt', n: 6 }, { op: 'cardReward', n: 3, rarity: 'uncommon' }] },
          ] },
        { label: 'Let RoxorLoops dig through the crates', req: { hero: 'kuro' },
          out: [{ w: 1, text: "RoxorLoops digs with his ears, not his eyes, tapping each sleeve and beatboxing back what he hears. 'Ooh. Ts. This one.' He finds three ideas worth keeping without getting his shoes wet.", ops: [{ op: 'cardReward', n: 3, rarity: 'uncommon' }] }] },
        { label: 'Dry out a soggy record',
          out: [{ w: 1, text: 'You shake the water out of a soggy record and blow on it. It plays one warbly line, then another, and the whole shop seems to sigh with relief.', ops: [{ op: 'ink', n: 2 }] }] },
      ],
    },

    kuro_footnote: {
      title: 'RoxorLoops and the First Beat', art: { scene: 'paper' }, chapters: [2], once: true, w: 3, when: { hero: 'kuro' },
      text: 'RoxorLoops stops beside a cracked street speaker and goes very still. It is playing a beat he knows better than his own name: his very first one, wobbly and too fast, in a much younger voice.',
      choices: [
        { label: 'Let him listen',
          out: [{ w: 1, text: "He listens to the whole thing, every late kick and every giggle. 'I thought it was terrible,' he says quietly. 'It is not terrible.' RoxorLoops walks on a little taller.", ops: [{ op: 'maxHp', n: 4, who: 'kuro' }, { op: 'heal', n: 10, who: 'kuro' }] }] },
        { label: 'Ask him to beatbox along',
          out: [
            { w: 2, text: 'He joins in on the second bar, the old beat and the new one side by side, and they fit. The street speaker crackles happily. Everyone feels better for hearing it.', ops: [{ op: 'heal', n: 10 }, { op: 'ink', n: 1 }] },
            { w: 1, text: "He starts to join in, then stops and lets the young version finish alone. 'His solo,' he says. You all feel a little stronger for that.", ops: [{ op: 'maxHp', n: 2 }] },
          ] },
        { label: 'Sing a bass line under it', cost: '1 Vox',
          out: [{ w: 1, text: 'You hum a wobbly bass line under the old beat. It is not good. RoxorLoops grins so hard it is basically a laugh, and the whole band stands a little taller.', ops: [{ op: 'ink', n: -1 }, { op: 'maxHp', n: 2 }] }] },
      ],
    },

    sentry_bridge: {
      title: 'The Ad That Will Not Skip', art: { scene: 'ch2' }, chapters: [2],
      text: "An advert on two thin legs blocks the footbridge, playing the same cartoon jingle on a loop. 'Please watch to the end,' it says. Nobody ever has. The SKIP button in its corner has never lit up.",
      choices: [
        { label: 'Watch it all the way to the end',
          out: [{ w: 1, text: 'You watch the whole thing: the jingle, the mascot, the small print, the jingle again. When it ends, the advert bursts into happy tears and hands over the prize from the ad, thirty gold, in a very large novelty bag.', ops: [{ op: 'gold', n: 30 }] }] },
        { label: 'Guess the skip code', cost: 'It may hurt',
          out: [
            { w: 1, text: 'You guess the code on the first go. The SKIP button lights up, the advert steps aside, blinking, and the street beyond lights up too.', ops: [{ op: 'paint', n: 2 }] },
            { w: 1, text: "Wrong code. The advert restarts from the top at full volume, right in your lead hero's face.", ops: [{ op: 'hurt', n: 7, who: 'front' }] },
          ] },
        { label: 'Skip it by force (fight)',
          out: [{ w: 1, text: "You reach for the SKIP button. The advert says 'Final offer!' in a voice that is not polite at all.", ops: [{ op: 'fight', enemies: ['drowned_samurai'] }] }] },
        { label: 'Let Jasmin sing over the jingle', req: { hero: 'hanae' },
          out: [{ w: 1, text: 'Jasmin sings softly over the jingle, and the advert, which has never once been listened to back, goes quiet to hear her. It skips itself, bows and leaves a bright pink gem behind as its thank you.', ops: [{ op: 'addGem', color: 'red', tier: 2 }] }] },
      ],
    },

    mask_market: {
      title: 'The Night Noodle Market', art: { scene: 'shop' }, chapters: [2],
      text: 'A night market on a rooftop under a huge moon: steaming noodles, bean buns, mango on sticks, string lights. Every stall has a free face-filter booth. Nobody has looked up at the moon in years.',
      choices: [
        { label: 'Try the face-filter booth', cost: 'It may not come off right',
          out: [
            { w: 1, text: 'The booth gives you a perfect, glossy face. Every glossy door in the city opens for it, and you slip through three streets nobody else can reach before it wears off.', ops: [{ op: 'paint', n: 3 }] },
            { w: 1, text: 'The filter comes off, but the feeling does not. For the rest of the tour, just before you go on, a small voice asks whether your real face is good enough.', ops: [{ op: 'addCurse', id: 'curse_doubt' }] },
          ] },
        { label: 'Show them your goat mask', req: { relic: 'fox_mask' },
          out: [{ w: 1, text: "The noodle chef sees the goat mask, laughs and points up at the gull nesting on her awning. 'She stole that, you know. Any friend of hers eats free.' You get noodles and a Charm from under the counter.", ops: [{ op: 'addRelic', rarity: 'uncommon' }] }] },
        { label: 'Just have the noodles',
          out: [{ w: 1, text: 'You buy a bowl of noodles and eat it looking up at the moon, the only people in the market doing so. It is very big and very bright, and it hums a little.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    silk_threads: {
      title: 'Cables Across the Alley', art: { scene: 'ch2' }, chapters: [2],
      text: 'Glowing cables of the Feed hang across the alley, each tied to something: a phone, a trainer, a friendship bracelet. They tremble all together, as if something far away has just noticed you.',
      choices: [
        { label: 'Cut a cable', cost: 'Something will notice',
          out: [
            { w: 2, text: 'The cable snaps and goes dark, and everything tied to it drops into your arms, including a heap of coins from a hundred tiny in-app purchases. Nobody comes. You decide that is fine.', ops: [{ op: 'gold', n: 80 }] },
            { w: 1, text: 'The cable snaps. Far off, something clicks. Then something on eight glowing cable legs arrives very fast, with a tiny heart-eyed bot riding on its back.', ops: [{ op: 'fight', enemies: ['silk_weaver', 'spiderling'] }] },
          ] },
        { label: 'Untie the friendship bracelet', cost: 'Hurts the lead hero',
          out: [{ w: 1, text: 'The knot gives, and the cable whips back and stings your lead hero across the knuckles. The bracelet is yours now, and the bead in the middle is a real gold gem. You hope its owner made a new one.', ops: [{ op: 'hurt', n: 6, who: 'front' }, { op: 'addGem', color: 'gold' }] }] },
        { label: 'Follow one cable',
          out: [{ w: 1, text: 'You follow one cable through three alleys and up a fire escape. At the end of it, a kid is asleep with a phone on their chest. You switch it off, and the streets around you light up.', ops: [{ op: 'paint', n: 2 }] }] },
      ],
    },

    rokurokubi_gossip: {
      title: 'The Auntie Who Knows a Shortcut', art: { scene: 'shop' }, chapters: [2],
      text: "An auntie leans out of a high window on a very long phone stand that reaches right across the street. 'I know a shortcut,' she whispers. 'Twenty gold. Nobody uses it twice.'",
      choices: [
        { label: 'Buy the shortcut', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: "She draws you a map on a napkin. It goes through a launderette, two rooftops and somebody's birthday party, and four hexes light up on the way. Nobody at the party minds.", ops: [{ op: 'gold', n: -20 }, { op: 'paint', n: 4 }] }] },
        { label: 'Ask for her ginger tea', req: { hpBelow: 0.6 },
          out: [{ w: 1, text: 'She takes one look at you and lowers a flask of ginger tea on a string. It is very strong and very kind, and it fixes things you did not know were broken.', ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Trade gossip',
          out: [
            { w: 2, text: 'You tell her about the kraken who gave back the mics. She tells you about everyone on her street. Both of you come away humming.', ops: [{ op: 'ink', n: 2 }] },
            { w: 1, text: 'She trades you a rumour about a back alley with no screens at all. It is true, and it is lovely, and the street lights come on as you walk it.', ops: [{ op: 'paint', n: 2 }] },
          ] },
      ],
    },
  });

  // ------------------------------------------------------------------ Act III: the Perfect Stage
  DATA.add('events', {
    fox_at_the_gate: {
      title: 'The Gull Who Could Not Sing', art: { scene: 'ch3' }, chapters: [3], once: true, w: 6, when: { flag: 'fox_bond' },
      text: 'The gull from the harbour, fully grown now, lands on a mirror wall at the edge of the Perfect Stage. She has never sung a note in tune. She sings one now, wobbly and real, and the wall opens.',
      choices: [
        { label: 'Step through her door',
          out: [{ w: 1, text: 'Behind the mirror wall is a service corridor nobody perfect ever uses. It runs right under the stage, and six hexes light up as you hurry through. She squawks HURRY, flatly, all the way.', ops: [{ op: 'paint', n: 6 }] }] },
        { label: 'Let her look after you',
          out: [{ w: 1, text: 'She sits with you both and sings, badly and tenderly, until your voices feel brand new. Nobody has ever been so grateful for a flat note.', ops: [{ op: 'heal', pct: 0.35 }, { op: 'maxHp', n: 3 }] }] },
        { label: 'Take her sea glass',
          out: [{ w: 1, text: 'She drops a piece of sea glass at your feet, the one she has carried since the bay. Held up to the stage lights, it is clearly a gem, and a very fine one.', ops: [{ op: 'addGem', tier: 3 }] }] },
        { label: 'Ask her for something bigger',
          out: [
            { w: 1, text: 'She thinks about it, flies off and comes back with something that was definitely on the Perfect Stage a moment ago. She looks extremely pleased with herself. It is a rare Charm.', ops: [{ op: 'addRelic', rarity: 'rare' }] },
            { w: 2, text: 'She thinks about it, then sings you three wobbly notes, one for each act. You catch every one of them, and they ring in your pocket for a long time.', ops: [{ op: 'ink', n: 3 }] },
          ] },
      ],
    },

    kill_your_darlings: {
      title: 'Notes from the Empty Chairs', art: { scene: 'paper' }, chapters: [3],
      text: 'Three identical empty chairs face a rehearsal stage. From somewhere a polite voice gives notes on a loop. Too wobbly. Too human. Cut the solo. Then, clearly about you: NEEDS POLISH.',
      choices: [
        { label: 'Cut your favourite solo', cost: 'Lose a card and 8 HP',
          out: [{ w: 1, text: "You cut it. The voice says 'Flawless!' and a few coins drop from the ceiling like applause. It stings more than you expected, and your lead hero feels it most.", ops: [{ op: 'removeCard' }, { op: 'gold', n: 15 }, { op: 'hurt', n: 8, who: 'front' }] }] },
        { label: 'Play it anyway. Do not explain.', cost: 'Hurts the lead hero',
          out: [{ w: 1, text: 'You play the solo, every wobble in it, straight at the empty chairs. It costs your lead hero a lot. It comes out better than it has ever sounded.', ops: [{ op: 'hurt', n: 8, who: 'front' }, { op: 'upgradeCard' }] }] },
        { label: 'Give a note of your own',
          out: [
            { w: 2, text: "You lean into the speaker and say: 'Needs more feeling.' There is a long, glossy pause. Then a little Vox drifts out of the speaker, embarrassed.", ops: [{ op: 'ink', n: 2 }] },
            { w: 1, text: 'You give the voice a note so kind and so precise that it goes quiet, then pays you for the advice. A handful of coins rolls out from under the middle chair.', ops: [{ op: 'gold', n: 25 }] },
          ] },
      ],
    },

    unfinished_sentence: {
      title: 'The Unfinished Line', art: { scene: 'paper' }, chapters: [3], once: true,
      text: "In a mirrored practice room, a music box sings one line and stops halfway through a word: 'And then the new kid, who had never once been nervous, s'. A mic lies on the floor, still warm.",
      choices: [
        { label: 'Finish it bravely', cost: 'Hurts the lead hero',
          out: [{ w: 1, text: "'...sang anyway, shaking.' Your lead hero sings it, voice cracking at the top, and the room rings like it has been waiting years for that crack. One of your cards will never sound the same again.", ops: [{ op: 'hurt', n: 6, who: 'front' }, { op: 'upgradeCard' }] }] },
        { label: 'Finish it kindly',
          out: [{ w: 1, text: "'...sat down, and somebody sat down too.' The music box plays the rest of the tune all by itself, softly, and you both feel much better.", ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Finish it cleverly',
          out: [
            { w: 2, text: "'...secretly practised every night.' The music box whirs, impressed, and offers you three new tunes for your trouble.", ops: [{ op: 'cardReward', n: 3 }] },
            { w: 1, text: "'...said: let us make it a duet.' The music box spins so fast it nearly takes off, and offers you three rare tunes.", ops: [{ op: 'cardReward', n: 3, rarity: 'rare' }] },
          ] },
        { label: 'Leave it unfinished',
          out: [{ w: 1, text: 'You leave the line open on purpose. Somebody else can finish it. The room seems to like that, and a little Vox drifts after you.', ops: [{ op: 'ink', n: 2 }] }] },
      ],
    },

    void_tear: {
      title: 'A Rip in the Backdrop', art: { scene: 'defeat' }, chapters: [3],
      text: 'The giant glossy backdrop behind the stage has a rip in it. Behind the rip is nothing at all. Sounds drift towards it and vanish: a cough, a giggle, half a clap.',
      choices: [
        { label: 'Step through', cost: 'Deck clutter',
          out: [
            { w: 2, text: 'You step through the nothing and out the far side, eight hexes along, in no time at all. Something small and grumpy came through with you and climbed into your deck.', ops: [{ op: 'paint', n: 8 }, { op: 'addCurse', id: 'curse_smudge' }] },
            { w: 1, text: 'You get four hexes along before the nothing spits you out, and two grumpy little words come with you.', ops: [{ op: 'paint', n: 4 }, { op: 'addCurse', id: 'curse_smudge', n: 2 }] },
          ] },
        { label: 'Feed it something you regret',
          out: [{ w: 1, text: 'You feed it a curse card. The nothing accepts it without a word, which is the most polite thing it has ever done, and gives you a little Vox back, as if in change.', ops: [{ op: 'removeCard', filter: { type: 'curse' } }, { op: 'ink', n: 2 }] }] },
        { label: 'Back away slowly',
          out: [{ w: 1, text: 'You back away very slowly. The rip does not follow. It does not need to.' }] },
      ],
    },

    lightning_rod: {
      title: 'The Biggest Speaker in the World', art: { scene: 'ch3' }, chapters: [3],
      text: 'A speaker stack taller than a house stands at the edge of the stage, humming. The Gloss has set it to a perfectly painless volume. Something enormous is building up inside it anyway.',
      choices: [
        { label: 'Stand in front of it', cost: 'A big blast',
          out: [
            { w: 2, text: 'The blast flattens your hair and rattles your teeth, and when it passes you feel bigger somehow, as if you have room for more sound.', ops: [{ op: 'hurt', pct: 0.08 }, { op: 'maxHp', n: 4 }] },
            { w: 1, text: 'The blast flattens you. You lie there for a moment, ears ringing, staring up at the lights. Worth it? Unclear.', ops: [{ op: 'hurt', n: 12 }] },
          ] },
        { label: 'Let Andy plug in', req: { hero: 'raiga' },
          out: [{ w: 1, text: "Andy plugs his bass into the stack and plays one low note. The speaker finally makes a real sound, and the whole stage shakes. Andy just nods. 'Nice.' He looks about a foot taller.", ops: [{ op: 'maxHp', n: 5, who: 'raiga' }, { op: 'heal', pct: 0.5, who: 'raiga' }] }] },
        { label: 'Catch a spark', cost: 'A little damage',
          out: [{ w: 1, text: 'A spark jumps off the cable and stings whoever is closest. Where it lands, a bright pink gem is left glowing on the floor.', ops: [{ op: 'hurt', n: 4, who: 'random' }, { op: 'addGem', color: 'red', tier: 2 }] }] },
        { label: 'Turn it down',
          out: [{ w: 1, text: 'You find the volume knob and turn it gently down. The speaker sighs with relief, and a little Vox hums out of it.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    censor_office: {
      title: 'The Makeover Booth', art: { scene: 'shop' }, chapters: [3],
      text: 'A glossy makeover booth promises to trim anything about you that is not perfect. It has a mirror, a pair of very sparkly scissors and a queue of customers who all look exactly the same.',
      choices: [
        { label: 'Get one card trimmed', cost: 'Lose a card, 60 gold', req: { gold: 60 },
          out: [{ w: 1, text: "The stylist snips one card out of your deck with the sparkly scissors and holds it up to the light. 'Gone! So clean!' Your deck feels lighter. The stylist feels nothing at all, beautifully.", ops: [{ op: 'gold', n: -60 }, { op: 'removeCard' }] }] },
        { label: 'Argue with the stylist (risky)',
          out: [
            { w: 1, text: 'You argue that the wobbles are the best part. The stylist has never heard this before, thinks very hard about it and gives you twenty gold to go and think about it somewhere else.', ops: [{ op: 'gold', n: 20 }] },
            { w: 2, text: "Raised voices on set! A knight in clapperboard armour clatters in, snapping his visor. 'Cut! Quiet! Again, properly!'", ops: [{ op: 'fight', enemies: ['redaction_knight'], win: [{ op: 'gold', n: 30 }] }] },
          ] },
        { label: 'Leave quietly',
          out: [{ w: 1, text: 'You leave the queue. Nobody notices, because nobody in it can tell anybody apart.' }] },
      ],
    },

    library_cat: {
      title: 'The Cat on the Grand Piano', art: { scene: 'camp' }, chapters: [3],
      text: 'Backstage, a very round cat sits on the lid of a grand piano, washing one paw. The Gloss has polished everything around it. It has not polished the cat. It has clearly not tried.',
      choices: [
        { label: 'Stroke the cat',
          out: [{ w: 1, text: 'The cat permits it. Then it purrs, a low, wobbly, completely imperfect purr, and it is the most relaxing sound you have heard all week.', ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Share your snacks', cost: '10 gold', req: { gold: 10 },
          out: [{ w: 1, text: 'You buy a little pot of oats from the vending machine and share it. The cat eats exactly half, then taps a key of the piano, and a Spell rolls out from under the lid.', ops: [{ op: 'gold', n: -10 }, { op: 'addBrush', id: 'random' }] }] },
        { label: 'Move the cat (risky)',
          out: [
            { w: 2, text: 'You lift the cat, very carefully, and open the lid. Inside the piano someone has hidden three of their favourite tunes. Take one.', ops: [{ op: 'cardReward', n: 3 }] },
            { w: 1, text: 'The cat objects, firmly, with all four paws, mostly at your lead hero. But under the lid are three hidden tunes, and you get to keep one.', ops: [{ op: 'hurt', n: 5, who: 'front' }, { op: 'cardReward', n: 3 }] },
          ] },
      ],
    },

    weeping_eraser: {
      title: 'The Wraith Who Cannot Stop Smoothing', art: { scene: 'ch3' }, chapters: [3], once: true,
      text: 'An airbrush wraith kneels at the side of the stage, crying without a sound. Everything it touches goes smooth and glossy, so it has tried very hard to touch nothing. It has run out of nothing.',
      choices: [
        { label: 'Sit with it',
          out: [
            { w: 1, text: 'You sit beside it, not touching, and talk about the worst gig you ever played. It laughs, a crackly real laugh, and gives you the one thing it never managed to smooth: a Charm.', ops: [{ op: 'addRelic', rarity: 'uncommon' }] },
            { w: 1, text: 'You sit with it for a while. It does not say much. When you stand, it presses a small Charm into your hand, very carefully, so as not to smooth you.', ops: [{ op: 'addRelic', rarity: 'common' }] },
          ] },
        { label: 'Let RawClaw play it something', req: { hero: 'suzu' },
          out: [{ w: 1, text: "RawClaw sits down with his drum pad and plays it a slow, warm loop with a little reverb on top. 'Nothing to fix,' he says. 'Just listen.' The wraith's edges go soft in a nicer way, and it gives him a Charm.", ops: [{ op: 'addRelic', rarity: 'uncommon' }, { op: 'heal', pct: 0.2 }] }] },
        { label: 'Take what it is holding (fight)',
          out: [{ w: 1, text: 'It holds on tight, and its hand comes up, smoothing.', ops: [{ op: 'fight', enemies: ['eraser_wraith'], win: [{ op: 'gold', n: 30 }] }] }] },
      ],
    },

    suzu_cracked_binding: {
      title: 'RawClaw Hears the Mix', art: { scene: 'event' }, chapters: [3], once: true, w: 3, when: { hero: 'suzu' },
      text: "RawClaw stops, one hand on his headphones. Under the stage the giant mixing desk is humming out of tune, every fader pushed perfectly flat. 'It is coming loose,' he says calmly. 'I can hold it.'",
      choices: [
        { label: 'Let RawClaw hold the mix',
          out: [
            { w: 3, text: "He rests both hands on the faders and nudges them, one by one, back to somewhere human. The stage sighs. 'There,' says RawClaw. 'Not perfect. Better.'", ops: [{ op: 'heal', pct: 0.2 }, { op: 'ink', n: 2 }] },
            { w: 1, text: "He finds the one fader the Gloss forgot and pushes it right up. A wall of warm, messy sound washes over the band. 'A little reverb,' says RawClaw. 'For everyone.'", ops: [{ op: 'heal', pct: 0.3 }, { op: 'ink', n: 2 }, { op: 'maxHp', n: 2 }] },
          ] },
        { label: 'Help him ride the faders', cost: 'Sore fingers for both',
          out: [{ w: 1, text: 'You both grab a fistful of faders and hold on as the desk fights back. Your fingers ache for an hour, but you come out sturdier, and so does the mix.', ops: [{ op: 'hurt', n: 5 }, { op: 'maxHp', n: 4 }] }] },
        { label: 'Leave the mix alone',
          out: [{ w: 1, text: "RawClaw takes his hands off the desk. 'Fair. Not our session.' The hum carries on beneath your feet as you walk away, a little flat." }] },
      ],
    },

    komainu_riddle: {
      title: 'The Two Doormen', art: { scene: 'ch3' }, chapters: [3],
      text: "Two identical doormen in identical sunglasses guard two identical doors. 'One of us always lies,' says one. 'The other lies about something else,' says the other. 'Choose a door,' they add.",
      choices: [
        { label: 'Try the left door', cost: 'A coin flip',
          out: [
            { w: 1, text: 'Behind the left door: a dressing room full of forgotten tips. You leave with your pockets jingling.', ops: [{ op: 'gold', n: 55 }] },
            { w: 1, text: 'Behind the left door: a confetti cannon, aimed at head height. Your lead hero takes the full blast.', ops: [{ op: 'hurt', n: 8, who: 'front' }] },
          ] },
        { label: 'Try the right door', cost: 'A coin flip',
          out: [
            { w: 1, text: 'Behind the right door: a tiny room with one spotlight, and in the spotlight, a gem.', ops: [{ op: 'addGem', tier: 2 }] },
            { w: 1, text: 'Behind the right door: a mop cupboard. You both walk into the same mop at the same time.', ops: [{ op: 'hurt', n: 5 }] },
          ] },
        { label: 'Let RoxorLoops ask one question', req: { hero: 'kuro' },
          out: [{ w: 1, text: "RoxorLoops asks: 'Which door would the other one say has the snacks?' Both doormen think so hard their sunglasses slip. While they think, he finds a Charm and a side corridor.", ops: [{ op: 'addRelic', rarity: 'common' }, { op: 'paint', n: 3 }] }] },
        { label: 'Climb over the wall',
          out: [{ w: 1, text: 'You ignore both doors and climb over the wall. The doormen are deeply offended. The view from the top is quite nice.', ops: [{ op: 'paint', n: 1 }] }] },
      ],
    },

    paper_boat_prayers: {
      title: 'A Sea of Paper Stars', art: { scene: 'ch3' }, chapters: [3],
      text: 'Thousands of folded paper stars drift in the dark under the stage, each with a tiny light inside, every light out. Somebody folded them all by hand, in one night. They are waiting.',
      choices: [
        { label: 'Light one', cost: '1 Vox',
          out: [{ w: 1, text: 'You breathe a little Vox into one star and it glows. Then the one beside it glows, and the next. It is very quiet, and you both feel stronger for being there.', ops: [{ op: 'ink', n: -1 }, { op: 'heal', pct: 0.2 }, { op: 'maxHp', n: 2 }] }] },
        { label: 'Sing to them',
          out: [{ w: 1, text: 'You sing, not well, and the stars flicker on in a wave, humming along. Vox comes back to you on the tide.', ops: [{ op: 'ink', pct: 0.2 }] }] },
        { label: 'Take a star for the road',
          out: [
            { w: 2, text: 'You pull one star out of the dark and unfold it. Someone has folded a Spell inside, very neatly, for whoever needed it.', ops: [{ op: 'addBrush', id: 'random' }] },
            { w: 1, text: 'You pull one star out of the dark. Inside is a small gem and a note that just says: for you. You do not know who it was meant for. You keep it.', ops: [{ op: 'addGem', tier: 1 }] },
          ] },
      ],
    },

    waiting_room: {
      title: 'Please Wait to Be Auditioned', art: { scene: 'boss3' }, chapters: [3],
      text: 'A spotless waiting room with a ticket machine and a single chair. The sign says PLEASE WAIT TO BE AUDITIONED. The chair is still warm. Your ticket says you are number one. It always does.',
      choices: [
        { label: 'Take a ticket', cost: 'It may leave a mark',
          out: [
            { w: 1, text: 'Your number is called at once. You walk into an empty room, sing one wobbly line to nobody and walk out feeling braver than you have in weeks.', ops: [{ op: 'ink', n: 2 }] },
            { w: 1, text: 'Your number is never called. You wait, and wait, and start to wonder whether you were ever any good. The feeling follows you out like a cold draught.', ops: [{ op: 'addCurse', id: 'curse_doubt' }] },
          ] },
        { label: 'Buy the whole queue smoothies', cost: '40 gold', req: { gold: 40 },
          out: [{ w: 1, text: 'Everyone in the queue is so grateful for a mango smoothie that they wave you to the front. A side door opens, and five hexes beyond it light up.', ops: [{ op: 'gold', n: -40 }, { op: 'paint', n: 5 }] }] },
        { label: 'Sit in the warm chair',
          out: [{ w: 1, text: 'You sit. Whoever sat here before you was nervous, and brave, and went in anyway. You can feel it. It helps more than you expect.', ops: [{ op: 'heal', pct: 0.15 }] }] },
      ],
    },
  });

  // ------------------------------------------------------------------ any act (no fights: the act scales the enemies, these events cannot)
  DATA.add('events', {
    peddler_silver_bell: {
      title: "Jordan's New Design", art: { scene: 'shop' }, once: true,
      text: "Jordan has set up a pop-up merch stall by the road, tablet in hand, beaming. 'New design,' he says, and turns the tablet round. It is a tote bag with a picture of a tote bag on it.",
      choices: [
        { label: 'Buy the mystery merch bundle', cost: '80 gold', req: { gold: 80 },
          out: [
            { w: 1, text: 'Inside the bundle: stickers, a badge and one small Charm that Jordan swears he did not put in there.', ops: [{ op: 'gold', n: -80 }, { op: 'addRelic', rarity: 'common' }] },
            { w: 1, text: 'Inside the bundle: a tote bag, a keyring and a gem that Jordan set in a badge himself.', ops: [{ op: 'gold', n: -80 }, { op: 'addGem', tier: 2 }] },
            { w: 1, text: 'Inside the bundle: a poster of your duo and, rolled up inside it, a brand new card for your deck.', ops: [{ op: 'gold', n: -80 }, { op: 'addCard', pool: 'party', rarity: 'uncommon' }] },
          ] },
        { label: 'Buy the tour poster', cost: '60 gold', req: { gold: 60 },
          out: [{ w: 1, text: "Jordan unrolls a tour poster with the whole route drawn on it and the headliner's name in glitter. 'It always shows you the way,' he says. 'I designed it like that. On purpose. Mostly.'", ops: [{ op: 'gold', n: -60 }, { op: 'addRelic', id: 'brass_lantern' }] }] },
        { label: 'Ting your triangle for him', req: { relic: 'silver_bell' },
          out: [{ w: 1, text: "You give your triangle one bright ting, and Jordan goes quiet. 'I made the sticker on that,' he says. 'My very first one. Look, it is wonky.' He insists you take his best Charm and will not hear another word about it.", ops: [{ op: 'addRelic', rarity: 'rare' }] }] },
        { label: 'Ask about the design',
          out: [{ w: 1, text: 'Jordan explains the tote bag for ten minutes, with diagrams. By the end you genuinely want one. The enthusiasm alone is worth a little Vox.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    jade_door: {
      title: 'The Door with a Star on It', art: { scene: 'treasure' }, once: true, w: 6, when: { relic: 'jade_key' },
      text: 'A green dressing-room door stands alone in the middle of the road, a gold star on it and no wall around it. Its sign says ALL AREAS, and so does your Backstage Pass. It hums when you come near.',
      choices: [
        { label: 'Open it',
          out: [
            { w: 3, text: 'Inside is the tidiest dressing room in the Soundlands, and on the mirror, waiting for you, a rare Charm.', ops: [{ op: 'addRelic', rarity: 'rare' }] },
            { w: 2, text: 'Inside: a mirror ringed with lights, three rare tunes taped to it and a big gem on the dressing table.', ops: [{ op: 'cardReward', n: 3, rarity: 'rare' }, { op: 'addGem', tier: 3 }] },
            { w: 1, text: 'Inside is a dressing room full of flowers and a bucket of gold coins with a card that says: you were wonderful.', ops: [{ op: 'gold', n: 150 }] },
          ] },
        { label: 'Knock first',
          out: [{ w: 1, text: "You knock. A voice inside calls 'Five minutes!' You wait five minutes, sitting on the kerb, and it turns out to be exactly the rest you needed.", ops: [{ op: 'heal', pct: 0.2 }, { op: 'ink', n: 2 }] }] },
      ],
    },

    brass_lantern_secret: {
      title: 'The Poster Has a New Dot', art: { scene: 'event' }, w: 3, when: { relic: 'brass_lantern' },
      text: 'Your tour poster has grown a new glitter dot overnight, on an ordinary bit of wall just ahead. Jordan swears he did not draw it. The dot twinkles, as if it has been waiting for you to ask.',
      choices: [
        { label: 'Follow the dot',
          out: [
            { w: 2, text: "It leads you through a gap in the wall and along a lit-up alley that was on nobody's map. Three hexes come alive behind you.", ops: [{ op: 'paint', n: 3 }] },
            { w: 1, text: "It leads you to a loose brick, and behind the brick, a busker's old tin of coins with a note: keep it moving.", ops: [{ op: 'gold', n: 45 }] },
            { w: 1, text: 'It leads you to a crack in the pavement where something sparkles: a little gem, glowing in your colours.', ops: [{ op: 'addGem', tier: 1 }] },
          ] },
        { label: 'Ask the poster nicely',
          out: [{ w: 1, text: 'You ask the poster nicely what it wants. The glitter twinkles a little warmer, and you both feel better for having asked.', ops: [{ op: 'heal', n: 8 }] }] },
      ],
    },

    wandering_storyteller: {
      title: 'Have You Seen the Clip?', art: { scene: 'camp' },
      text: "A fan stops you, phone out, eyes huge. 'Have you seen THE clip?' Two nervous voices at a talent show, a very quiet room, and then everybody standing up. The fan has clearly watched it a lot.",
      choices: [
        { label: 'Buy two smoothies and watch it', cost: '20 gold', req: { gold: 20 },
          out: [{ w: 1, text: 'You buy two smoothies and watch it together, twice. The voices shake, and then they do not. You come away remembering exactly how brave that was, and one of your cards sounds better for it.', ops: [{ op: 'gold', n: -20 }, { op: 'upgradeCard' }] }] },
        { label: 'Let RoxorLoops beatbox the ending', req: { hero: 'kuro' },
          out: [{ w: 1, text: "RoxorLoops beatboxes the whole clip from memory, including the bit where somebody's chair squeaks. The fan cries happy tears. Everyone feels much better.", ops: [{ op: 'heal', n: 10 }] }] },
        { label: 'Ask what happens next', req: { chapter: 3 },
          out: [{ w: 1, text: "The fan looks up at the Perfect Stage, then back at you. 'Nobody knows how it ends yet,' they say. 'Maybe you will be in the next one.' It is the nicest thing anyone has said all tour.", ops: [{ op: 'ink', n: 2 }, { op: 'heal', pct: 0.1 }] }] },
        { label: 'Tell them about your own first gig',
          out: [
            { w: 2, text: "You tell the fan about your own first gig: knocking knees, a voice that nearly went. They drop a handful of coins in your hat. 'For the next nervous person,' they say. You keep it for exactly that.", ops: [{ op: 'gold', n: 25 }] },
            { w: 1, text: 'You tell the fan how scary your own first song was. They nod as if they already knew, and hum the first bar of the clip under their breath as they go.', ops: [{ op: 'ink', n: 1 }] },
          ] },
      ],
    },

    hungry_ghost: {
      title: 'The Empty Busking Hat', art: { scene: 'event' },
      text: 'A busker sits at the crossroads beside an empty hat, so glossy she is nearly see-through. She does not play. She only sits there being quiet, and somehow that is worse than any song.',
      choices: [
        { label: 'Fill her hat', cost: '45 gold', req: { gold: 45 },
          out: [{ w: 1, text: 'The coins clink, and colour comes back into her one shade at a time. She picks up her guitar and plays you down the road, and four hexes light up to the beat.', ops: [{ op: 'gold', n: -45 }, { op: 'paint', n: 4 }, { op: 'ink', n: 1 }] }] },
        { label: 'Share your lunch', cost: 'Both heroes go hungry',
          out: [
            { w: 3, text: 'You give her both of your noodle pots. She eats like she has forgotten how, then plays, and three hexes light up ahead. Your stomachs grumble all afternoon, in harmony.', ops: [{ op: 'hurt', n: 5, who: 'both' }, { op: 'paint', n: 3 }, { op: 'ink', n: 1 }] },
            { w: 1, text: 'You hold out your lunch, and she laughs and pulls out hers: a whole bag of oranges. You share everything, she plays, and three hexes light up ahead.', ops: [{ op: 'heal', n: 6 }, { op: 'paint', n: 3 }] },
          ] },
        { label: 'Walk on',
          out: [{ w: 1, text: 'You walk on. Behind you, the hat stays empty. You hear her start to hum, very softly, as you turn the corner.' }] },
      ],
    },

    strange_seed: {
      title: 'A Seed in the Spotlight', art: { scene: 'event' },
      text: 'A single seed sits on a crate in a little circle of spotlight. It is the wrong colour for any plant, and faintly warm, as though somebody was holding it a moment ago and got called on stage.',
      choices: [
        { label: 'Plant it', cost: 'It might bite',
          out: [
            { w: 3, text: 'It sprouts at once into a tiny cherry tree that hums one note and drops a single blossom on each of you. You both feel sturdier.', ops: [{ op: 'maxHp', n: 5 }] },
            { w: 1, text: 'It sprouts, snaps at your fingers, then shrinks back and offers you a Hocus Focus by way of apology.', ops: [{ op: 'hurt', n: 6 }, { op: 'addBrush', id: 'blot' }] },
            { w: 1, text: 'It sprouts thorns, then thinks better of it and hums instead. The hum is a little Vox.', ops: [{ op: 'hurt', n: 3 }, { op: 'ink', n: 2 }] },
          ] },
        { label: 'Keep it in your pocket', cost: 'Hurts the lead hero',
          out: [
            { w: 3, text: 'It wriggles all day and pinches your lead hero whenever they sit down. By evening it has hardened into a small, smug gem.', ops: [{ op: 'hurt', n: 4, who: 'front' }, { op: 'addGem', tier: 1 }] },
            { w: 1, text: 'It wriggles, pinches and grows heavier all day, and your lead hero walks lopsided. By evening it is a gem, and a very fine one.', ops: [{ op: 'hurt', n: 8, who: 'front' }, { op: 'addGem', tier: 3 }] },
          ] },
        { label: 'Leave it in the light',
          out: [{ w: 1, text: 'You leave it in its spotlight, where it clearly wants to be. As you go, it hums one tiny note after you, like a thank you.', ops: [{ op: 'heal', n: 4 }] }] },
      ],
    },

    two_doors: {
      title: 'Two Mirrors', art: { scene: 'event' },
      text: 'Two mirrors stand side by side on the road, both wearing name tags. The left one says I WILL TELL YOU THE TRUTH. The right one is a filter, and it says YOU LOOK PERFECT. Neither has a wall.',
      choices: [
        { label: 'The honest mirror',
          out: [{ w: 1, text: 'It tells you the truth: that your wobbles are the best bit, and that one of your cards could be braver. You make it braver.', ops: [{ op: 'upgradeCard', random: true }] }] },
        { label: 'The kind filter',
          out: [{ w: 1, text: 'It tells you that you look perfect. You do not, and you know it, but it is so nice to hear that you feel better anyway.', ops: [{ op: 'heal', pct: 0.25 }] }] },
        { label: 'Try the little mirror at the back',
          out: [
            { w: 1, text: 'The little mirror at the back shows you exactly as you are, and then winks. Behind it, someone has left a Charm.', ops: [{ op: 'addRelic', rarity: 'common' }] },
            { w: 1, text: 'The little mirror at the back is not a mirror at all. It is a door, and it opens straight into your nose.', ops: [{ op: 'hurt', n: 4 }] },
          ] },
        { label: 'Neither',
          out: [{ w: 1, text: 'You look in neither and walk on. You already know what you look like: like someone on tour.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    weary_travellers: {
      title: 'Three Roadies and a Pot of Soup', art: { scene: 'camp' },
      text: 'Three roadies share a camping stove and a pot of lentil soup beside their broken-down van. They wave you over without asking who you are, which on tour is either great trust or great foreshadowing.',
      choices: [
        { label: 'Take the first watch', req: { hpPct: 0.5 },
          out: [{ w: 1, text: 'You stay up so they can sleep, listening to the night and the van ticking as it cools. By morning you feel tired, and strangely stronger.', ops: [{ op: 'heal', pct: 0.1 }, { op: 'maxHp', n: 2 }] }] },
        { label: 'Trade for a Spell', cost: '25 gold', req: { gold: 25 },
          out: [{ w: 1, text: 'One roadie, it turns out, used to be a street magician. For a little gold she teaches you a Spell, and the other two applaud with their spoons.', ops: [{ op: 'gold', n: -25 }, { op: 'addBrush', id: 'random' }] }] },
        { label: 'Share the soup',
          out: [
            { w: 3, text: 'The soup is thick and warm and full of beans. Someone starts humming, someone else joins in, and the road ahead glows a little.', ops: [{ op: 'heal', pct: 0.2 }, { op: 'paint', n: 1 }] },
            { w: 1, text: 'The soup is the best you have ever had, and the roadies sing a road song so out of tune it loops right back round to lovely. The road ahead lights up to meet you.', ops: [{ op: 'heal', pct: 0.3 }, { op: 'paint', n: 2 }] },
          ] },
      ],
    },

    blank_patch: {
      title: 'The Glossy Tide', art: { scene: 'defeat' },
      text: 'A patch of the road has gone glossy. Not fog: polish. A cricket hops into it and stops mid-chirp, perfectly still. The shiny edge is creeping forward, slowly, like a very patient tide.',
      choices: [
        { label: 'Sing it back', cost: '2 Vox',
          out: [
            { w: 3, text: 'You sing at the shine, wobble and all, until it cracks and flakes away. The cricket finishes its chirp, a little flat. You feel sturdier.', ops: [{ op: 'ink', n: -2 }, { op: 'maxHp', n: 3 }] },
            { w: 1, text: 'You sing until the shine cracks. Under it the road is rough and real, and in the road is a small gem nobody has seen in years.', ops: [{ op: 'ink', n: -2 }, { op: 'maxHp', n: 3 }, { op: 'addGem', tier: 1 }] },
          ] },
        { label: 'Let RawClaw filter it out', req: { hero: 'suzu' },
          out: [{ w: 1, text: "RawClaw listens, then turns an invisible knob in the air. 'Too much top end,' he says calmly, and rolls it off. The shine goes matte, the cricket chirps, and Vox comes back on the breeze.", ops: [{ op: 'ink', n: 3 }, { op: 'heal', pct: 0.1 }] }] },
        { label: 'Throw in a curse card',
          out: [{ w: 1, text: 'You toss a curse card into the shine. It goes smooth and quiet and is gone, and for once you are glad of the Gloss.', ops: [{ op: 'removeCard', filter: { type: 'curse' } }] }] },
        { label: 'Step around it',
          out: [{ w: 1, text: 'You take the long way round the shiny patch. It does not follow. Not today.', ops: [{ op: 'heal', n: 3 }] }] },
      ],
    },

    scribes_bargain: {
      title: "Jordan's Lucky Tees", art: { scene: 'paper' },
      text: "Jordan is printing T-shirts at the roadside. 'Whatever is on the shirt comes true,' he says. 'Mostly. One slogan each. Not the ending, though. I am saving that one.'",
      choices: [
        { label: 'A slogan for strength', cost: '25 gold', req: { gold: 25 },
          out: [{ w: 1, text: 'Jordan prints STRONG VOICE, BIG HEART across the front. You put it on and, honestly, you do feel stronger.', ops: [{ op: 'gold', n: -25 }, { op: 'maxHp', n: 3 }] }] },
        { label: 'A slogan for luck', cost: 'It may backfire',
          out: [
            { w: 2, text: 'Jordan prints LUCKY TOUR. On the very next corner you find thirty gold in a busking hat, with a note that says: lucky you.', ops: [{ op: 'gold', n: 30 }] },
            { w: 1, text: 'Jordan prints LUCKY TOUR, but the letters smudge into LUCKY TOLL. Several things charge you for it before lunch.', ops: [{ op: 'gold', pct: -0.2 }] },
          ] },
        { label: 'Cross a card off the shirt', cost: 'Lose a card',
          out: [{ w: 1, text: "Jordan prints a shirt with your whole deck on the back and one card crossed out, and that card is simply gone. 'Less is more,' he says proudly, about his own design.", ops: [{ op: 'removeCard' }] }] },
        { label: 'Just take a sticker',
          out: [{ w: 1, text: 'You turn down the T-shirt and take a free sticker instead. Jordan is only a tiny bit heartbroken. The sticker is very good.', ops: [{ op: 'ink', n: 1 }] }] },
      ],
    },

    raiga_storm_laugh: {
      title: 'Andy Checks the Floor', art: { scene: 'event' }, once: true, w: 3, when: { hero: 'raiga' },
      text: 'Andy plays one low note for no reason at all, and everything within earshot hums along: cups, railings, the road. The Gloss, which had been creeping towards the path, stops. It seems to be listening.',
      choices: [
        { label: 'Join in with a hum',
          out: [{ w: 1, text: "You hum along, badly, and Andy nods as if it is the best harmony he has ever heard. 'Nice.' The whole road feels warmer.", ops: [{ op: 'heal', pct: 0.2 }, { op: 'ink', n: 2 }] }] },
        { label: 'Ask what that was',
          out: [{ w: 1, text: "'Just checking the floor works,' says Andy. It does. Somehow you all feel a little more solid standing on it.", ops: [{ op: 'maxHp', n: 2 }] }] },
        { label: 'Dare him to go lower', cost: 'Thunder may answer',
          out: [
            { w: 2, text: 'Andy goes lower. Then lower. The note is so deep you feel it in your knees, and when it stops you are all standing taller.', ops: [{ op: 'maxHp', n: 3 }] },
            { w: 1, text: "Andy goes lower, and the low end answers with a thunderclap of bass that knocks you both off your feet. He helps you up. 'Bit much,' he admits.", ops: [{ op: 'hurt', n: 5 }, { op: 'ink', n: 2 }] },
          ] },
        { label: 'Catch the rumble',
          out: [{ w: 1, text: 'You cup your hands round the last of the rumble before it fades. When you open them, there is a warm gold gem inside, still buzzing.', ops: [{ op: 'addGem', color: 'gold', tier: 1 }] }] },
      ],
    },

    paper_crane_folder: {
      title: 'A Thousand Stickers', art: { scene: 'event' },
      text: "Jordan sits on the kerb cutting out stickers by hand, a heap of hundreds at his feet. 'Make a thousand and you get a wish,' he says. He has been nearly finished for a very long time.",
      choices: [
        { label: 'Ask for a wish',
          out: [
            { w: 1, text: "Jordan sticks the thousandth sticker on your sleeve. 'Wish granted. You are now sturdy.' You are, a bit.", ops: [{ op: 'maxHp', n: 4 }] },
            { w: 1, text: "Jordan sticks the thousandth sticker to a signpost, and five hexes light up down the road. 'Huh,' he says. 'That works.'", ops: [{ op: 'paint', n: 5 }] },
            { w: 1, text: 'The thousandth sticker turns out to be a real gem, which Jordan insists he planned. He did not plan it.', ops: [{ op: 'addGem', tier: 2 }] },
          ] },
        { label: 'Help him cut',
          out: [{ w: 1, text: 'You sit with him and cut stickers until the stars come out, talking about nothing. It is very restful, and the stickers are very good.', ops: [{ op: 'heal', n: 6 }, { op: 'ink', n: 2 }] }] },
      ],
    },
  });
})();
