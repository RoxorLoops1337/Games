// Hocus Vocus: data_meta.js: Stickers (achievements), Encores, tips and the lore (Tour Diary entries, hero entries and combat barks).
// Data only (DESIGN 4.10, CONTENT_SPEC 6): one IIFE that registers into DATA.achievements, DATA.trials, DATA.tips and DATA.lore,
// and sets the frozen presentation table DATA.outfits (see OUTFITS below).
// No functions, no clock, no unseeded randomness, no em or en dashes. Checked by DATA.validate and DATA.audit('meta') and by
// tests/hocus_vocus_narrative.test.mjs.
//
// STICKERS (achievements, 32). {id, name, text, stat:{k, gte}, reward:{inkstones}} (pays Cheers). `k` is a DATA.LISTS.statKeys id
//   that COMBAT, RUN or META really write (the narrative suite greps for it). Fixed ids: ch1_clear (boss1Kills, unlocks RawClaw, id
//   suzu), ch2_clear (boss2Kills, unlocks Andy, id raiga), ch3_clear (boss3Kills, the first win). Rewards run 3 to 60 Cheers against
//   Tour Bus prices of 40 to 140. Thresholds are profile-lifetime totals except the max keys (maxHit, maxTurnDamage, trialBest),
//   which are bests. Jordan designs every Sticker.
//
// ENCORES (DATA.trials, 10). Each level's `mods` are its OWN increment; playing Encore N sums levels 1..N (DATA.trialDeltas). Every
//   mod only makes the game harder, and each level has a distinct headline so the climb reads as a staircase, not a slope:
//     1 gold   2 crowds   3 healing   4 Vox   5 damage   6 tea and comebacks   7 prices   8 a curse   9 rivals and headliners   10 the Perfect Take
//   Damage is floored per hit, so enemyDmg steps are large enough to move real hits (+15% turns a 7 into an 8). Vox stays fair:
//   at Encore 10 an act starts with 9 Vox and each tea stall gives 3, and won fights, Spells, Warm Up and the mercy rule fill the rest.
//
// TIPS (30, at most 110 characters). Mechanics only, no hand-typed numbers that tuning could change. Tip N keeps the place of the
//   old tip N, so the per-screen tip pickers (and the How to Play regexes) keep their meaning.
//
// OUTFITS (DATA.outfits, bible 7.1, HV_ART_AUDIO 2.11). A plain, frozen presentation table {heroId: {name, sticker}}: the costume a
//   hero can wear and the Sticker that unlocks it. Read only by ui.js (the viewer's choice, kept in its own key hv_skins_v1) and the
//   menu and end screens; never by RUN, COMBAT, MAP, META or the bot. Andy (raiga) has no outfit yet.
//
// LORE. Tour Diary entries {id, title <= 40, text <= 700}: intro, ch1_intro, ch2_intro, ch3_intro, ch1_clear, ch2_clear, victory,
//   defeat, hero_<id> x4. Plain paragraphs of prose with no line breaks (the story screen types them out). Shared entries never name
//   a hero. Barks: barks_<hero> with 5 lines for each of start, hurt, kill, down, win, swap, at most 64 characters each. `down` is
//   spoken by the hero who just lost their voice (it comes back), `win` by the survivor, `swap` by the hero stepping up to the lead
//   spot, `hurt` by the hero who took the big hit, `kill` (an id) by the hero who won the foe over or quietened it.
//
// THE SPINE (bible 2.2; every entry, lore line and art brief obeys it)
//   1. In the Soundlands, real voices are magic. Imperfect voices are the strongest magic of all, because the Gloss cannot smooth them.
//   2. The Gloss began as a little filter made to help a nervous singer feel brave. People turned it up and up; it learned that smooth
//      was popular and smoothed everything.
//   3. It is not evil and never destroyed. It is polite, helpful and glossy, and it flattens voices until the world is on mute.
//   4. Each Headliner is a music lover the Gloss got to first. Kraki held the MICS (so nobody would ever be embarrassed), Scrollspinner
//      held the PEOPLE (so nobody would ever be alone or bored), Flawless holds PERFECTION (so nobody would ever sing a wrong note).
//   5. The heroes win by being imperfect on purpose. Every defeated Headliner ends up singing along, badly and happily.
//   6. The finale is the song "Human". The Gloss offers the duo perfect, silent versions of themselves. They choose to stay human and
//      sing. Flawless turns out to be that first little filter; it sings one real, wobbly note, and the Gloss softens into ordinary
//      stage shine that makes the lights sparkle. The tour goes on.
(() => {
  // ------------------------------------------------------------------ Outfits (presentation only: nothing reads it to play)
  DATA.outfits = Object.freeze({
    hanae: Object.freeze({ name: 'Unicorn Onesie', sticker: 'petal_and_steel' }),
    kuro: Object.freeze({ name: 'Monster Onesie', sticker: 'ink_and_insight' }),
    suzu: Object.freeze({ name: 'Goat Suit', sticker: 'moonlit_vigil' }),
  });

  // ------------------------------------------------------------------ Stickers (achievements)
  DATA.add('achievements', {
    ch1_clear: { name: 'Mics Returned', text: 'Defeat Kraki, the Karaoke Kraken, and finish the first act.', stat: { k: 'boss1Kills', gte: 1 }, reward: { inkstones: 10 } },
    ch2_clear: { name: 'Heads Up', text: 'Defeat Scrollspinner, Queen of the Feed, and let the city look up.', stat: { k: 'boss2Kills', gte: 1 }, reward: { inkstones: 15 } },
    ch3_clear: { name: 'Still Human', text: 'Defeat Flawless and sing the last song together.', stat: { k: 'boss3Kills', gte: 1 }, reward: { inkstones: 30 } },

    first_draft: { name: 'First Gig', text: 'Finish your first tour, win or lose. Every tour starts somewhere.', stat: { k: 'runs', gte: 1 }, reward: { inkstones: 3 } },
    regular_reader: { name: 'Regular on the Road', text: 'Finish 10 tours. The Soundlands are starting to recognise your voice.', stat: { k: 'runs', gte: 10 }, reward: { inkstones: 8 } },
    happy_endings: { name: 'Crowd Pleaser', text: 'Win 5 tours. Some tours are worth taking more than once.', stat: { k: 'wins', gte: 5 }, reward: { inkstones: 20 } },

    petal_and_steel: { name: 'In Full Bloom', text: 'Win 3 tours with Jasmin in the party.', stat: { k: 'winsHanae', gte: 3 }, reward: { inkstones: 15 } },
    ink_and_insight: { name: 'Party at the Back', text: 'Win 3 tours with RoxorLoops in the party.', stat: { k: 'winsKuro', gte: 3 }, reward: { inkstones: 15 } },
    moonlit_vigil: { name: 'Not a Costume', text: 'Win 3 tours with RawClaw in the party.', stat: { k: 'winsSuzu', gte: 3 }, reward: { inkstones: 15 } },
    thunder_and_laughter: { name: 'Just Andy', text: 'Win 3 tours with Andy in the party.', stat: { k: 'winsRaiga', gte: 3 }, reward: { inkstones: 15 } },

    cartographer: { name: 'Volume Up', text: 'Unmute 500 hexes across all your tours.', stat: { k: 'hexesPainted', gte: 500 }, reward: { inkstones: 10 } },
    brush_collector: { name: 'Spellcaster', text: 'Cast 25 Spells on the map.', stat: { k: 'brushesUsed', gte: 25 }, reward: { inkstones: 10 } },
    treasure_hunter: { name: 'Unboxing', text: 'Open 25 gift boxes.', stat: { k: 'chestsOpened', gte: 25 }, reward: { inkstones: 10 } },
    curio_cabinet: { name: 'Charm Bracelet', text: 'Find 50 Charms across your tours.', stat: { k: 'relicsFound', gte: 50 }, reward: { inkstones: 12 } },
    fable_fan: { name: 'Scenic Route', text: 'Take 60 detours. Some of them were even shortcuts.', stat: { k: 'eventsSeen', gte: 60 }, reward: { inkstones: 10 } },

    big_spender: { name: 'Merch Legend', text: 'Spend 3000 gold at merch stalls. Jordan sends his regards.', stat: { k: 'goldSpent', gte: 3000 }, reward: { inkstones: 10 } },
    jewellers_eye: { name: 'Bedazzled', text: 'Socket 40 gems into your cards.', stat: { k: 'gemsSocketed', gte: 40 }, reward: { inkstones: 10 } },

    pest_control: { name: 'Crowd Control', text: 'Defeat 500 creatures of the Soundlands.', stat: { k: 'kills', gte: 500 }, reward: { inkstones: 12 } },
    champion_hunter: { name: 'Rivalry', text: 'Defeat 40 rivals.', stat: { k: 'elites', gte: 40 }, reward: { inkstones: 12 } },
    not_a_scratch: { name: 'Not a Wobble', text: 'Defeat a headliner without taking a single point of damage.', stat: { k: 'flawlessBosses', gte: 1 }, reward: { inkstones: 25 } },
    wall_breaker: { name: 'Mic Drop', text: 'Land a single hit for 50 or more damage. Please do not actually drop the mic.', stat: { k: 'maxHit', gte: 50 }, reward: { inkstones: 10 } },
    one_big_sentence: { name: 'Big Finish', text: 'Deal 100 damage in a single turn.', stat: { k: 'maxTurnDamage', gte: 100 }, reward: { inkstones: 12 } },
    free_verse: { name: 'Freestyle', text: 'Play 3 or more free cards in one turn, on 10 different turns.', stat: { k: 'zeroCostTurns', gte: 10 }, reward: { inkstones: 8 } },
    slow_burn: { name: 'Stuck in Your Head', text: 'Finish off 30 enemies with Earworm. Patience is a weapon.', stat: { k: 'poisonKills', gte: 30 }, reward: { inkstones: 8 } },

    minimalist_author: { name: 'Less Is More', text: 'Win a tour with 15 cards or fewer. Every note earns its place.', stat: { k: 'smallDeckWins', gte: 1 }, reward: { inkstones: 20 } },

    charity_case: { name: 'Kindness of Strangers', text: 'Be helped by a passer-by 3 times. It happens to the best of us.', stat: { k: 'mercy', gte: 3 }, reward: { inkstones: 5 } },
    face_in_the_petals: { name: 'Voice Crack', text: 'Have a hero lose their voice 30 times. Getting back up counts too.', stat: { k: 'heroDowns', gte: 30 }, reward: { inkstones: 5 } },
    musical_chairs: { name: 'Switch It Up', text: 'Swap spots 300 times. Nobody is sitting down.', stat: { k: 'swaps', gte: 300 }, reward: { inkstones: 8 } },

    daily_reader: { name: 'Duet a Day', text: 'Play 5 Daily Duets.', stat: { k: 'dailyRuns', gte: 5 }, reward: { inkstones: 10 } },

    inkling: { name: 'First Encore', text: 'Win a tour on Encore 1.', stat: { k: 'trialBest', gte: 1 }, reward: { inkstones: 10 } },
    ink_adept: { name: 'Crowd Favourite', text: 'Win a tour on Encore 5.', stat: { k: 'trialBest', gte: 5 }, reward: { inkstones: 25 } },
    master_of_ink: { name: 'Standing Ovation', text: 'Win a tour on Encore 10. Even the Gloss claps along.', stat: { k: 'trialBest', gte: 10 }, reward: { inkstones: 60 } },
  });

  // ------------------------------------------------------------------ Encores (trials)
  DATA.add('trials', {
    trial_1: { level: 1, name: 'Empty Hat', text: 'Enemies and gift boxes drop 10% less gold.', mods: { goldMul: -0.10 } },
    trial_2: { level: 2, name: 'Tough Crowd', text: 'Regular enemies and sidekicks have 10% more HP.', mods: { enemyHp: 0.10 } },
    trial_3: { level: 3, name: 'Scratchy Throat', text: 'Green room rests, healing detours and act healing restore 15% less.', mods: { healMul: -0.15 } },
    trial_4: { level: 4, name: 'Cold Open', text: 'Every act begins with 1 less Vox.', mods: { startInk: -1 } },
    trial_5: { level: 5, name: 'Harsh Critics', text: 'Enemies deal 15% more damage.', mods: { enemyDmg: 0.15 } },
    trial_6: { level: 6, name: 'Cold Tea', text: 'Tea stalls give 1 less Vox, and voiceless heroes rise with 15% HP, not 25%.', mods: { wellInk: -1, reviveFrac: -0.10 } },
    trial_7: { level: 7, name: 'Limited Edition', text: 'Merch stalls charge 15% more, and you start with 20 less gold.', mods: { priceMul: 0.15, startGold: -20 } },
    trial_8: { level: 8, name: 'Jinxed', text: 'Begin the tour with a curse in your deck.', mods: { curses: 1 } },
    trial_9: { level: 9, name: 'Rival Egos', text: 'Rivals have 20% more HP, and headliners have 15% more.', mods: { eliteHp: 0.20, bossHp: 0.15 } },
    trial_10: { level: 10, name: 'The Perfect Take', text: 'Enemies hit 10% harder, and card rewards offer one card fewer.', mods: { cardChoices: -1, enemyDmg: 0.10 } },
  });

  // ------------------------------------------------------------------ tips
  DATA.add('tips', [
    'Unmuting a hex costs Vox. Tea stalls, won fights and Warm Up in a green room all give it back.',
    'Spells unmute whole shapes for free. Save the long ones for when the headliner is far away.',
    'You can only walk on live hexes, but you can unmute far ahead: the game finds the cheapest chain for you.',
    'The lead hero takes most of the attacks. The backing hero is safer, but some cards only shine in the lead.',
    'One swap per turn is free. Every extra swap costs Breath, so plan the second one.',
    'A voiceless hero is not gone. Their cards clog your hand until the fight is won and their voice comes back.',
    'If both heroes lose their voice, the tour ends. Keep the lead hero topped up and the backing hero safe.',
    'Block wears off at the start of your next turn. Spend it or lose it.',
    'Enemy intents show what they will do next. Read them before you play your first card.',
    'Exposed makes an enemy take much more damage. Apply it first, then swing.',
    "Muffled trims an enemy's attacks. Against a headliner with a big hit coming, it is a small shield.",
    'Earworm ignores Block. It is slow, but nothing can defend against it, so it shines against Sequins.',
    'Tangled stops both heroes from swapping. Keep a plan that works without a swap.',
    'Gems only fit slots of their own colour. A rainbow slot takes any colour.',
    'Pink gems sharpen attacks, blue bolster Block and healing, green bend the rules, gold do a bit of everything.',
    'Setting a new gem in a full slot destroys the old one. Be sure before you swap it out.',
    'Green rooms offer Rest, Rehearse, Set Gems or Warm Up, one per visit. Studios do Rehearse or Set Gems.',
    'A power that says "either hero" counts the other hero\'s cards too. One that says "you" counts only its own.',
    "Jordan's merch stall offers Declutter. A leaner deck draws your best cards more often.",
    'Curse cards are just clutter in your hand. Jordan can declutter them, and a few detours take them away.',
    'A detour is a choice, not a test. There is usually a safe option, a gamble and a price. Pick your risk.',
    'On a detour, good manners are sometimes a secret weapon. Try bowing to a foghorn.',
    'A Charm can change how you play. Read its text twice before you build around it.',
    'Stranded with no Vox and no path? A passer-by hums along and gives you enough for one hex.',
    'Most won fights refill a little Vox, and rivals more. Sidekicks give none. Fighting is how you cross the map.',
    'An X cost card spends all your remaining Breath. Play it last, when you know how much you have.',
    'Hold keeps a card in your hand at the end of a turn. Keep your finisher until you can afford it.',
    'Fade takes a card out for the rest of the fight. Powerful, but count how many you can spare.',
    'Every hero hides a resource: Bloom, Groove, Reverb or Rumble. Learn which cards build it and which spend it.',
    'Encores make the tour harder. Win one to unlock the next. The Daily Duet gives everyone the same seed.',
  ]);

  // ------------------------------------------------------------------ lore: Tour Diary entries
  DATA.add('lore', {
    intro: {
      title: 'One, Two, Testing',
      text: "In the Soundlands, voices are magic: a sung note opens a cherry blossom, a beatboxed kick makes the cobbles bounce, and a bass line can roll a hill over in its sleep. Then came the Gloss, a kind little filter made to help one nervous singer feel brave, until everybody turned it up so far that it smoothed everything flat. Now the world is going on mute: buskers lip-sync, birds tweet in perfect tune, and nobody sings along. But two voices were never smoothed, a little wobbly, a little late and completely real. They pack the van, tape Jordan's tour poster in the window and step up to the mic. One, two, testing: the speakers crackle, somebody breathes in, and the beat is about to drop.",
    },
    ch1_intro: {
      title: 'Blossom Bay',
      text: 'The first act smells of sea salt and cherry blossom, and Blossom Bay climbs its hill in candy-coloured houses with bunting strung between every balcony. Down on the Snack Pier there are noodle carts, smoothie bikes and a lemonade stand run by a very serious child, while gulls who think they can sing circle overhead. The Gloss has only just arrived, but a few corners have already gone shiny and airbrushed flat, and the buskers on them lip-sync in identical poses. Out in the bay something enormous is singing every song at once, perfectly, through eight microphones. Nobody else is allowed a mic, in case anybody gets it wrong. Unmute a way in, and bring your own voice.',
    },
    ch1_clear: {
      title: 'Kraki Gives Back the Mics',
      text: "Kraki's glossy mask cracked right down the middle, and behind it was a big, kind, very embarrassed face. 'I only wanted nobody to be embarrassed,' she said, and eight microphones drooped in eight arms. Then she sang one song with her real voice, wobbly and much too high in the middle, and the whole bay cheered so loudly that the gulls joined in. One by one she handed the mics back, to the buskers, the lemonade child and the old foghorn, and the Gloss slid off the house fronts like rain off a window. The bay came back on, loud and gloriously out of tune. High on a rooftop studio above the harbour, someone in a goat mask stopped recording, grinned and started packing a bag.",
    },
    ch2_intro: {
      title: 'Scrollopolis',
      text: 'The second act happens at two in the morning, in blue light, in a city built like a stack of giant phones. In Scrollopolis the streets move by themselves, notifications drift up like balloons, little hearts fall like snow, and someone has sprayed MID on a wall in very neat capitals. Everyone walks looking down, so nobody has noticed the huge moon over the rooftops, or the noodle market steaming underneath it. Across the sky hangs the Feed, a glowing web of cables spun by something with eight bright screens for eyes. It keeps everyone gently tangled, never alone and never bored, while the Gloss gives every face the same smile. Look up, if you can remember how.',
    },
    ch2_clear: {
      title: 'The City Looks Up',
      text: "The web went slack all at once, and Scrollspinner dropped her filter and sat down among her cables, eight screens dimming. 'I only wanted nobody to be lonely,' she said, and for the first time in years she did not check who had liked it. Across Scrollopolis people lowered their phones and looked up at the moon, which had waited very patiently. Somebody started humming, then somebody else, and the Gloss on the billboards began to peel like old stickers. Then, from far below the street, a bass line rose up through the pavement, so low that no screen had ever seen it. It had been holding the city's groove together all along, and now it was coming up the stairs.",
    },
    ch3_intro: {
      title: 'The Perfect Stage',
      text: "The last act is not sung at all: it is performed, perfectly, on a colossal stage floating above a sea of phone lights. Everything is shiny white and pastel chrome, the floors are mirrors, the confetti falls in a perfect grid, and an APPLAUSE sign glows that never switches off. Rows of identical fans hold up identical phones with identical smiles, and three identical judges' chairs sit empty in the front row. On stage, contestant after contestant lip-syncs the same flawless track, and nobody sings a note. At the centre of it all stands Flawless, the Gloss's own star, who has never sung a wrong note because it has never sung a real one. Every hex you unmuted was leading here.",
    },
    victory: {
      title: 'Human',
      text: 'The Gloss held up a mirror of perfect, silent copies of the heroes and asked, kindly, whether anyone needed to be human any more. They chose to stay human and sing: a voice cracked on the high note, a kick landed a hair late, and it was the best sound in years. One mannequin blinked, then one sang, badly, and then the whole crowd was singing. Flawless smiled a real, nervous smile, for it had been the first little filter all along, made to help a nervous singer feel brave, and it sang one wobbly note of its own. The Gloss softened into ordinary stage shine that makes the lights sparkle. Everyone sang the last line together, and the stage was left open for whoever wants to sing next.',
    },
    defeat: {
      title: 'The Show Must Go On',
      text: 'The lights went down, and the Gloss smoothed everything over, the noise, the colour and the two voices, until it was all perfectly fine. It did not hurt, because the Gloss never hurts, and that was the worst part. But an intermission is not the end of a show. Somewhere in the Soundlands a kid is singing off-key into a hairbrush, loudly and badly and with total confidence, and the curtain twitches. Two voices clear their throats, a little hoarse and a little wiser, with a very good idea of where the spare mics are kept. Have a sip of water, try a different road, and remember that the show goes on.',
    },

    // ---------------------------------------------------------------- lore: the four hero entries
    hero_hanae: {
      title: 'Jasmin, the Blossom Voice',
      text: 'Jasmin sings the way cherry blossom falls: softly, a little at a time, until the whole street is pink. Everyone braces for her to belt, and instead she drops almost to a whisper, and the room leans in. Her vocal runs land like petals, many small bright notes that each find their mark, and with a touch of reverb and delay they shimmer long after she stops. She still remembers her first audition at a talent show beside RoxorLoops, hands shaking, voice wobbling on the first line, and then the whole room standing up. She is warm and dreamy, giggles when she is nervous, and says sorry to every foe she wins over. Her pink scrunchie has never once moved, and nobody knows how.',
    },
    hero_kuro: {
      title: 'RoxorLoops, the Beatbox Wizard',
      text: "RoxorLoops plays a whole band with one mouth: kick, snare, hi-hat, a throat bass you feel in your teeth and a vocal scratch like a record being told off. He beatboxes the sound of everything, even a banana being peeled, and comes in a hair late whenever he is grinning, which is always. From the backing spot he builds the groove layer by layer until his beat is stuck in every enemy's head. He still remembers that first audition beside Jasmin, both of them shaking, and the room going quiet, then standing up. The loop station at his feet is strictly for emergencies, and it is always an emergency. Mohawk on top, mullet at the back: a party at both ends and a big heart in the middle.",
    },
    hero_suzu: {
      title: 'RawClaw, the Sound Alchemist',
      text: "RawClaw is the duo's producer, a good friend and a beatboxer too, though he mostly lets his drum pad do the talking. Before the tour he spent a long season in a rooftop studio above Blossom Bay, recording the bay's real sounds, gulls and bike bells and laughter, to keep them safe from the Gloss. In a fight he builds a room of reverb around the band, wraps both heroes in warm sound and filters the bite out of an enemy. He is the calm one in the van, never raises his voice, and offers a little more reverb on everything, including sighs. His joke face online is a goat, and he owns a goat suit, which he insists is not a costume. Nobody has ever won that argument, and the suit is very cosy.",
    },
    hero_raiga: {
      title: 'Andy, the Thunder Bass',
      text: "You feel Andy before you see him: cups ripple, the floor starts to hum, and somewhere a window rattles politely. He is a bass player who sometimes joins the duo on stage, and he introduces himself, every time, as just Andy. Under Scrollopolis, in a basement the Feed never reached, he kept the city's groove together with a bass and a loop pedal, too low for the Gloss to see on any screen. In a fight he stands in the lead and soaks up the hits, and every one he takes goes into the floorboards as rumble. When it peaks, the low end comes back up as thunder and the whole room shakes. He is big-hearted and unflappable, says very little and makes everything steadier just by standing near it.",
    },

    // ---------------------------------------------------------------- lore: combat barks (5 lines per key, at most 64 characters each)
    barks_hanae: {
      lines: {
        start: ['I do not need to be loud.', 'Okay. Soft and sweet, like we practised.', 'Let us make something pretty.', 'Mic on. Heart on. Here we go.', 'Deep breath in. And... la.'],
        hurt: ['Ow. That was a little flat.', 'Oh. That hit a sour note.', 'I am fine. My scrunchie is fine too.', 'Ouch. Rude, but I forgive you.', 'That wobbled me. Only a bit.'],
        kill: ['Ta-da.', 'Sorry. That was a big one.', 'There. Now we can all hear the song.', 'You were lovely, really. Just a bit loud.', 'Petals for you. Go on, take one.'],
        down: ['Oh. My voice went. Give me a second.', 'Just... a little... croaky.', 'I will be back by the chorus.', 'Lost my voice. Have you seen it?', 'Hold my note for me, please.'],
        win: ['That was lovely. Everyone did so well.', 'See? Soft works.', 'And the room is singing again.', 'Noodles after this? I think noodles.', 'Pretty. Really, really pretty.'],
        swap: ['My turn at the front mic.', 'Excuse me. I have a little solo.', 'Into the light. Gently.', 'Lead vocal, coming through.', 'Front and centre, ponytail first.'],
      },
    },
    barks_kuro: {
      lines: {
        start: ['Boots and cats and boots and cats. Okay, we are warm.', 'Party on top. Party at the back.', 'Ts ts ts. Ready when you are!', 'Pff, ka, pff, ka. We got this.', 'Mic check. One, two. Bmm, bmm.'],
        hurt: ['Pff! Okay, that was a rude snare.', 'Ow. Off beat, mate. Way off beat.', 'Ouch. I will beatbox that sound later.', 'Ka-ow. That is the sound it made.', 'Rude! I was mid-groove.'],
        kill: ['And... drop. Thank you, goodnight.', 'Ts! Out of the mix.', 'You were a good beat. Just not ours.', 'Pff, ka, bye bye!', 'Nice. Now you are nodding along.'],
        down: ['Pff... lost the beat. Back in a bar.', 'Lips... out of buzz. One sec.', 'No voice. Only... ts.', 'Keep the groove going for me!', 'Down, but my foot is still tapping.'],
        win: ['And that is a wrap! Bmm tss.', 'We are so good. We are SO good.', 'Group bounce! Everybody bounce!', 'Boots and cats and victory hats.', 'That one is going in the show.'],
        swap: ['Solo time! Kidding. Mostly.', 'Front mic? Do not mind if I do.', 'Beatbox to the front, please.', 'My turn. Pff, ka, let us go.', 'Up front with the big kick.'],
      },
    },
    barks_suzu: {
      lines: {
        start: ['Let me just tidy the low end. Not the Gloss way. The nice way.', 'Levels look good. Shall we?', 'Headphones on. I have got you both.', 'A little more reverb? A little more reverb.', 'Recording. Just in case this is good.'],
        hurt: ['That clipped a bit. I am fine.', 'Ow. Bit of distortion there.', 'Noted. I will fix that in the mix.', 'It is only a little noise. Keep going.', 'Hm. That one peaked.'],
        kill: ['There. Much better without the noise.', 'Faded out nicely. Go and rest.', 'You sound nicer dry. Take care.', 'That was a clean fade. The kind kind.', 'Rest now. You worked very hard at being loud.'],
        down: ['Signal lost. Back in a moment.', 'Need a minute. Keep it rolling.', 'It is all right. Just a little dropout.', 'Hold the session for me.', 'I will rest my ears for a bit.'],
        win: ['That is a take. Thank you, everyone.', 'It is not a costume.', 'We sound better together. We always do.', 'Lovely. I would not change a thing.', 'Room sounds good again. Real, too.'],
        swap: ['I will take the front. Keep the mix warm.', 'Let me be the wall for a bit.', 'Behind me. I have the levels.', 'Soloing my channel. Look over here.', 'Front of house now. Stay close.'],
      },
    },
    barks_raiga: {
      lines: {
        start: ['Just Andy.', 'Evening. Mind your cups.', 'Right. Low and slow.', 'Feel that? That is me.', 'Let us find the groove.'],
        hurt: ['Hm. That one landed in the low end.', 'Ow. Good hit, that.', 'Fine. I will turn it into a bass line.', 'That just tuned me up a bit.', 'Ha. Tickles.'],
        kill: ['Womp.', 'And down it goes. Low end wins.', 'Nice one. Stay for the next song.', 'Heard that one, did you?', 'Bass face. Sorry. Cannot help it.'],
        down: ['Hm. Lost the low end. Back soon.', 'Just going to lie on the floor. It hums.', 'Bass is resting. So am I.', 'Keep the groove. I will find it again.', 'Mm. Little nap.'],
        win: ['Nice. Good groove, everyone.', 'Feel that? That is the floor saying thanks.', 'Lovely. Noodles?', 'Ha! Told you the bass would hold.', 'Calm as you like. Well played.'],
        swap: ['Up front. Stand behind the bass.', 'Front. Plenty of low end to go round.', 'Step back. Let the thunder do the talking.', 'Right. I will soak this bit up.', 'Up front! Amp is warm.'],
      },
    },
  });
})();
