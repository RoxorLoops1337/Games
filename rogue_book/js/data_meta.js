// Echowake: data_meta.js: achievements, Tempo Trials, tips and the lore (story pages, hero pages and combat barks).
// Data only (DESIGN 4.10, CONTENT_SPEC 6): one IIFE that registers into DATA.achievements, DATA.trials, DATA.tips and DATA.lore.
// No functions, no clock, no unseeded randomness, no em or en dashes. Checked by DATA.validate and DATA.audit('meta') and by
// tests/rogue_book_narrative.test.mjs.
//
// ACHIEVEMENTS (32). {id, name, text, stat:{k, gte}, reward:{inkstones}} (pays Chimes). `k` is a DATA.LISTS.statKeys id that COMBAT, RUN or META
//   really write (the narrative suite greps for it). Fixed ids: ch1_clear (boss1Kills, unlocks Suzu), ch2_clear (boss2Kills, unlocks
//   Raiga), ch3_clear (boss3Kills, the first win). Rewards run 3 to 60 Chimes against Hall of Echoes prices of 40 to 140.
//   Thresholds are profile-lifetime totals except the max keys (maxHit, maxTurnDamage, trialBest), which are bests.
//
// TEMPO TRIALS (10). Each level's `mods` are its OWN increment; playing trial N sums levels 1..N (DATA.trialDeltas). Every mod only
//   makes the game harder, and each level has a distinct headline so the climb reads as a staircase, not a slope:
//     1 purse   2 hides   3 healing   4 Echo   5 damage   6 bells and revives   7 prices   8 a curse   9 elites and bosses   10 the Red Baton
//   Damage is floored per hit, so enemyDmg steps are large enough to move real hits (+15% turns a 7 into an 8). Echo stays fair:
//   at trial 10 a verse starts with 9 Echo and each bell gives 3, and kills, Songs, Meditate and the mercy rule fill the rest.
//
// TIPS (30, at most 110 characters). Mechanics only, no hand-typed numbers that tuning could change.
//
// LORE. Story pages {id, title <= 40, text <= 700}: intro, ch1_intro, ch2_intro, ch3_intro, ch1_clear, ch2_clear, victory, defeat,
//   hero_<id> x4. Plain paragraphs of prose with no line breaks (the story screen types them out). Barks: barks_<hero> with 5 lines
//   for each of start, hurt, kill, down, win, swap, at most 64 characters each. `down` is spoken by the hero who fell, `win` by the
//   survivor, `swap` by the hero stepping to the front, `hurt` by the hero who took the big hit, `kill` by the hero who struck the blow.
//
// THE SPINE (why the land is the way it is; the pages below say it a little at a time)
//   The Singer sang the land with four voices: nerve (Hanae, the beat), curiosity (Kuro, the harmony), tenderness (Suzu, the
//   melody) and laughter (Raiga, the boom). The Singer's fifth voice, doubt, became the Conductor, who wanted the last note to be
//   perfect. Doubt made the Singer hold a breath just before the last note, and that held silence grew into the Hush, a yokai in the
//   shape of a yamabiko, the mountain echo that stopped answering calls and started swallowing them. The Conductor conducts the Hush
//   from the citadel, cutting off every note that is not perfect and feeding it to the Hush; in the last fight the Hush itself pours
//   out of him. He is a part of the Singer, never the Singer. Each boss is a keeper who held on too tightly: Kuzunoha held the SOUNDS (singing over the
//   grove until she sang walls), Jorogumo held the PEOPLE (keeping the festival guests at one silent supper so the Hush could not
//   eat them), the Conductor holds the ENDING. The heroes win by letting the song move. The ending: the Conductor is not destroyed
//   but joined, the last line is sung together and left open on purpose, the Hush lets go like a held breath, and the land asks to
//   be sung again. The Singer is whoever sings along.
(() => {
  // ------------------------------------------------------------------ achievements
  DATA.add('achievements', {
    ch1_clear: { name: 'Out of the Grove', text: 'Defeat Kuzunoha, the Nine-Voiced Fox, and end the first verse.', stat: { k: 'boss1Kills', gte: 1 }, reward: { inkstones: 10 } },
    ch2_clear: { name: 'Lanterns Out', text: 'Defeat Jorogumo, the Silk Courtesan, and let the guests go home.', stat: { k: 'boss2Kills', gte: 1 }, reward: { inkstones: 15 } },
    ch3_clear: { name: 'The Last Note', text: 'Defeat the Conductor and sing the ending.', stat: { k: 'boss3Kills', gte: 1 }, reward: { inkstones: 30 } },

    first_draft: { name: 'First Rehearsal', text: 'Finish your first run, win or lose. Every journey starts somewhere.', stat: { k: 'runs', gte: 1 }, reward: { inkstones: 3 } },
    regular_reader: { name: 'Regular Listener', text: 'Finish 10 runs. The land is starting to recognise your voice.', stat: { k: 'runs', gte: 10 }, reward: { inkstones: 8 } },
    happy_endings: { name: 'Happy Endings', text: 'Win 5 runs. Some journeys are worth taking more than once.', stat: { k: 'wins', gte: 5 }, reward: { inkstones: 20 } },

    petal_and_steel: { name: 'Petal and Steel', text: 'Win 3 runs with Hanae in the party.', stat: { k: 'winsHanae', gte: 3 }, reward: { inkstones: 15 } },
    ink_and_insight: { name: 'Flute and Insight', text: 'Win 3 runs with Kuro in the party.', stat: { k: 'winsKuro', gte: 3 }, reward: { inkstones: 15 } },
    moonlit_vigil: { name: 'Moonlit Vigil', text: 'Win 3 runs with Suzu in the party.', stat: { k: 'winsSuzu', gte: 3 }, reward: { inkstones: 15 } },
    thunder_and_laughter: { name: 'Thunder and Laughter', text: 'Win 3 runs with Raiga in the party.', stat: { k: 'winsRaiga', gte: 3 }, reward: { inkstones: 15 } },

    cartographer: { name: 'Cartographer of Echoes', text: 'Wake 500 hexes across all your runs.', stat: { k: 'hexesPainted', gte: 500 }, reward: { inkstones: 10 } },
    brush_collector: { name: 'Song Collector', text: 'Sing 25 Songs on the map.', stat: { k: 'brushesUsed', gte: 25 }, reward: { inkstones: 10 } },
    treasure_hunter: { name: 'Treasure Hunter', text: 'Open 25 chests.', stat: { k: 'chestsOpened', gte: 25 }, reward: { inkstones: 10 } },
    curio_cabinet: { name: 'Curio Cabinet', text: 'Find 50 treasures across your runs.', stat: { k: 'relicsFound', gte: 50 }, reward: { inkstones: 12 } },
    fable_fan: { name: 'Fable Fan', text: 'Hear 60 fables. Some of them were even true.', stat: { k: 'eventsSeen', gte: 60 }, reward: { inkstones: 10 } },

    big_spender: { name: 'Big Spender', text: 'Spend 3000 gold in shops. The peddlers send their regards.', stat: { k: 'goldSpent', gte: 3000 }, reward: { inkstones: 10 } },
    jewellers_eye: { name: "Jeweller's Eye", text: 'Socket 40 gems into your cards.', stat: { k: 'gemsSocketed', gte: 40 }, reward: { inkstones: 10 } },

    pest_control: { name: 'Pest Control', text: 'Defeat 500 creatures of the land.', stat: { k: 'kills', gte: 500 }, reward: { inkstones: 12 } },
    champion_hunter: { name: 'Champion Hunter', text: 'Defeat 40 elite enemies.', stat: { k: 'elites', gte: 40 }, reward: { inkstones: 12 } },
    not_a_scratch: { name: 'Not a Scratch', text: 'Defeat a boss without taking a single point of damage.', stat: { k: 'flawlessBosses', gte: 1 }, reward: { inkstones: 25 } },
    wall_breaker: { name: 'Wall Breaker', text: 'Land a single hit for 50 or more damage.', stat: { k: 'maxHit', gte: 50 }, reward: { inkstones: 10 } },
    one_big_sentence: { name: 'One Big Crescendo', text: 'Deal 100 damage in a single turn.', stat: { k: 'maxTurnDamage', gte: 100 }, reward: { inkstones: 12 } },
    free_verse: { name: 'Free Verse', text: 'Play 3 or more free cards in one turn, on 10 different turns.', stat: { k: 'zeroCostTurns', gte: 10 }, reward: { inkstones: 8 } },
    slow_burn: { name: 'Slow Burn', text: 'Finish off 30 enemies with Poison. Patience is a weapon.', stat: { k: 'poisonKills', gte: 30 }, reward: { inkstones: 8 } },

    minimalist_author: { name: 'Minimalist Composer', text: 'Win a run with 15 cards or fewer. Every note earns its place.', stat: { k: 'smallDeckWins', gte: 1 }, reward: { inkstones: 20 } },

    charity_case: { name: 'Charity Case', text: "Be rescued by the land's mercy 3 times. It happens to the best of us.", stat: { k: 'mercy', gte: 3 }, reward: { inkstones: 5 } },
    face_in_the_petals: { name: 'Face in the Petals', text: 'Have a hero knocked down 30 times. Getting back up counts too.', stat: { k: 'heroDowns', gte: 30 }, reward: { inkstones: 5 } },
    musical_chairs: { name: 'Musical Chairs', text: 'Swap rows 300 times. Nobody is sitting down.', stat: { k: 'swaps', gte: 300 }, reward: { inkstones: 8 } },

    daily_reader: { name: 'A Jam a Day', text: 'Play 5 Daily Jams.', stat: { k: 'dailyRuns', gte: 5 }, reward: { inkstones: 10 } },

    inkling: { name: 'First Beat', text: 'Win a run on Tempo Trial 1.', stat: { k: 'trialBest', gte: 1 }, reward: { inkstones: 10 } },
    ink_adept: { name: 'Tempo Adept', text: 'Win a run on Tempo Trial 5.', stat: { k: 'trialBest', gte: 5 }, reward: { inkstones: 25 } },
    master_of_ink: { name: 'Master of Tempo', text: 'Win a run on Tempo Trial 10. The Red Baton bows.', stat: { k: 'trialBest', gte: 10 }, reward: { inkstones: 60 } },
  });

  // ------------------------------------------------------------------ Tempo Trials
  DATA.add('trials', {
    trial_1: { level: 1, name: 'Lean Purse', text: 'Enemies and chests drop 10% less gold.', mods: { goldMul: -0.10 } },
    trial_2: { level: 2, name: 'Tough Hides', text: 'Regular enemies and minions have 10% more HP.', mods: { enemyHp: 0.10 } },
    trial_3: { level: 3, name: 'Slow Mending', text: 'Camp rests, healing fables and verse healing restore 15% less.', mods: { healMul: -0.15 } },
    trial_4: { level: 4, name: 'Faint Echo', text: 'Every verse begins with 1 less Echo.', mods: { startInk: -1 } },
    trial_5: { level: 5, name: 'Sharp Claws', text: 'Enemies deal 15% more damage.', mods: { enemyDmg: 0.15 } },
    trial_6: { level: 6, name: 'Cracked Bells', text: 'Temple bells give 1 less Echo, and fallen heroes rise with 15% HP, not 25%.', mods: { wellInk: -1, reviveFrac: -0.10 } },
    trial_7: { level: 7, name: 'Dear Peddlers', text: 'Shops charge 15% more, and you start with 20 less gold.', mods: { priceMul: 0.15, startGold: -20 } },
    trial_8: { level: 8, name: 'Burdened Start', text: 'Begin the run with a curse in your deck.', mods: { curses: 1 } },
    trial_9: { level: 9, name: 'Proud Champions', text: 'Elites have 20% more HP, and bosses have 15% more.', mods: { eliteHp: 0.20, bossHp: 0.15 } },
    trial_10: { level: 10, name: 'The Red Baton', text: 'Enemies hit 10% harder, and card rewards offer one card fewer.', mods: { cardChoices: -1, enemyDmg: 0.10 } },
  });

  // ------------------------------------------------------------------ tips
  DATA.add('tips', [
    'Waking a hex costs Echo. Temple bells, kills and Meditate at camp all give it back.',
    'Songs wake whole shapes for free. Save the long ones for when the boss is far away.',
    'You can only walk on woken hexes, but you can wake far ahead: the game finds the cheapest chain for you.',
    'The front hero takes most of the attacks. The back hero is safer, but some cards only shine up front.',
    'One row swap per turn is free. Every extra swap costs Energy, so plan the second one.',
    'A downed hero is not gone. Their cards clog your hand until the fight is won and they stand up again.',
    'If both heroes fall, the journey ends. Keep the front hero healthy and the back hero alive.',
    'Block wears off at the start of your next turn. Spend it or lose it.',
    'Enemy intents show what they will do next. Read them before you play your first card.',
    'Vulnerable makes an enemy take much more damage. Apply it first, then swing.',
    'Weak trims an enemy\'s next attacks. Against a boss with a big hit coming, it is a small shield.',
    'Poison ignores Block. It is slow, but nothing can defend against it, which makes it wonderful against armour.',
    'Bind stops both heroes from swapping. Keep a plan that works without a swap.',
    'Gems only fit slots of their own colour. A prism slot takes any colour.',
    'Red gems sharpen attacks, blue bolster Block and healing, green bend the rules, gold do a bit of everything.',
    'Replacing a socketed gem destroys the old one. Be sure before you cut.',
    'Camps offer Rest, Sharpen, Cut Gems or Meditate, one per visit. Forges do Sharpen or Cut Gems.',
    'A power that says "either hero" counts your ally\'s cards too. One that says "you" counts only its own hero.',
    'Shops sell card removal. A leaner deck draws your best cards more often.',
    'Curse cards are dead weight in your hand. A shop can remove them, and a few fables will take them away.',
    'A fable is a choice, not a test. There is usually a safe option, a gamble, and a price. Pick your risk.',
    'In a fable, good manners are sometimes a weapon. Try bowing to a kappa.',
    'A treasure can change how you play. Read its text twice before you build around it.',
    'Stranded with no Echo and no path? The land takes pity and gives you enough for one hex.',
    'Most kills refill a little Echo, and elites more. Minions give none. Fighting is how you cross the land.',
    'An X cost card spends all your remaining Energy. Play it last, when you know how much you have.',
    'Retain keeps a card in hand at the end of a turn. Hold your finisher until you can afford it.',
    'Exhaust removes a card for the rest of the fight. Powerful, but count how many you can spare.',
    'Every hero hides a resource: Bloom, Breath, Ward or Charge. Learn which cards build it and which spend it.',
    'Tempo Trials make the journey harder. Win one to unlock the next. The Daily Jam gives everyone the same seed.',
  ]);

  // ------------------------------------------------------------------ lore: story pages
  DATA.add('lore', {
    intro: {
      title: 'Once, a Song',
      text: 'Once there was a land that sang itself. Its Singer had loved it so long and so well that one day the song simply kept going without a voice. Then, on an ordinary night, just before the last note, a small doubt whispered that it might come out wrong, and the Singer held a breath and did not let it go. The held silence grew. It took the shape of a yamabiko, the mountain echo that once answered every call, and it began to swallow the calls instead: the Hush, unhurried and polite, eating the song one sound at a time. But a song that sings itself is never quite silent. Somewhere inside it, two voices woke, heard each other, and agreed that the song was not going to end on a rest.',
    },
    ch1_intro: {
      title: 'The Whispering Bamboo Grove',
      text: "The first verse smells of rain and warm cedar. The Whispering Bamboo Grove glows in golden dusk, every stalk murmuring the tune it is afraid to forget. Kodama answer every call, one beat late. A kappa guards a bridge with terrible manners. And somewhere in the middle, a white fox with nine ringing tails is singing the grove back, note by note, louder than the Hush can swallow. Nobody asked her to. Nobody thanked her, either. 'She means well,' the bamboo whispers. 'That is the trouble. She sings so loud she has stopped listening.' The land lies grey and still. Take a breath. Find the beat. Wake a way.",
    },
    ch1_clear: {
      title: 'The Fox Lowers Her Voice',
      text: "Kuzunoha's nine tails drooped one by one, like bells with the ringing gone out of them. The song ran out of her, and the wildness with it, and she sat down in the bamboo, very small for a fox the size of a house. 'I was only trying to keep it,' she said. 'Every time the Hush ate a note, I sang two more. I never noticed I had stopped singing songs and started singing walls.' The grove went quiet, and then, quite suddenly, it was full of birdsong. The verse ended by itself. Far behind it, a shrine bell rang once, and a girl with silver hair looked up. Her verse had just been allowed to begin.",
    },
    ch2_intro: {
      title: 'The Sunken Lantern City',
      text: 'The second verse is played in lantern light on black water. The Sunken Lantern City drifts under a sky like a folded kimono, every canal lined with paper lamps and every lamp watching. Once this was a festival town, and the festival never stopped: now the drums are slack and the flutes are full of water. Karakuri dolls dance to music nobody can hear. A tea house serves guests who never leave, and in the tallest window a lady in a very fine kimono is spinning silk. She is the keeper of the city. She holds it together, thread by thread. She holds everything together. Look how tightly she holds.',
    },
    ch2_clear: {
      title: 'The Threads Come Loose',
      text: "When the last silk thread snapped, the city did not fall. It exhaled. Jorogumo sat among the wreck of her kimono, fingers still tying knots in nothing. 'The Hush was going to eat them,' she said. 'The guests, the lamps, the music, all of them. So I kept them. I kept them here.' Nobody answered, because everyone knew the answer, and it was not unkind: keeping a song is not the same as letting it be sung. One by one the lanterns went out, and the guests rose from the table at last and walked home humming. Lightning flickered over the next verse, and no thunder followed. Somewhere ahead, a broad man laughed at the silent storm, cracked his knuckles, and started walking toward it.",
    },
    ch3_intro: {
      title: 'The Thunderless Citadel',
      text: 'The last verse is not sung at all. It is conducted. The Thunderless Citadel hangs above a sea of storm cloud, its bells wrapped in grey felt, its halls lined with instruments whose strings have been cut. Lightning strikes in neat, careful lines, and no thunder follows. Through the window slits the sky is coming apart in grey holes, and every hole is a note that was cut off before it could ring. At the very top waits the Keeper of the Last Note, who has been rehearsing a single chord with a red baton for a very long time so that nothing in it will ever have to change. Every hex you woke was leading here.',
    },
    victory: {
      title: 'The Final Chorus',
      text: "The Conductor lowered his red baton, and his face came apart like a held breath let go. 'It had to be perfect,' he whispered, in the Singer's own tired voice. 'A wrong note can never be unsung, so I never let one come.' The Singer had not vanished. The Singer had only stopped believing the last note could be good enough. The heroes did not shout. They stood beside him, breathed in, and sang the last line together, and left it open at the end on purpose. The Hush let go like a sigh. In the bamboo, a small white fox yipped along. Then the whole land rang its first note and asked, very politely, to be sung again.",
    },
    defeat: {
      title: 'A Rest in the Music',
      text: 'The echoes thinned. The bamboo, the lanterns, the storm, all of it went grey and soft, and the heroes heard their own voices fade to nothing. It did not hurt. That was the worst part. The Hush is polite that way. But a song that sings itself does not stay silent for long, and a rest is not the end of the music. The beat comes back around. The colour seeps in, the first bell rings, and two voices open their eyes a little hoarse and a little wiser, with a very clear memory of where the fox likes to hide. Once more from the top. Try a different road. The song is patient. It has all the notes in the world.',
    },

    // ---------------------------------------------------------------- lore: the four heroes
    hero_hanae: {
      title: 'Hanae, the Blossom Blade',
      text: "The Singer sang Hanae on the very first bar, on a day the Singer felt brave. She was meant to be the hero: the one who steps forward first, so the rest of the song has somewhere to stand. She has a very good ponytail, an even better blade, and a reputation for never missing her cue. Every cut she makes rings like a struck bell and leaves petals, because the Singer once sang 'like a blossom' and never took it back. She will tell you she is afraid of nothing. She will say it a little fast. The truth is that she was sung to win, and nobody ever sang what happens if she does not, so she has decided never to find out.",
    },
    hero_kuro: {
      title: 'Kuro, the Songweaver',
      text: 'Kuro began as a harmony. The Singer needed someone to carry the tune where the melody could not reach, so a quiet second line was hummed under the first, glasses and all, and then, because the Singer was kind, given a personality. It got out of hand. He is the only one who knows he lives in a song, and he listens to the last bar first, which he says is sensible and everyone else says is cheating. His flute plays spells because it is the flute that played him. He teases to stay warm. He counts the rests for exits. Deep down he suspects a harmony is the first thing a conductor cuts, and he would like everyone to please stop humming that out loud.',
    },
    hero_suzu: {
      title: 'Suzu, the Moon Miko',
      text: 'The Singer sang Suzu late at night, on the evenings when the song would not come. She is the shrine at the edge of the map, the bell left ringing for whoever is lost. She keeps the song in tune: every slack string, every note gone sour, she feels in her hair, and she mends what she can without making a fuss. She is seventeen and steadier than a mountain. She waits at the edge of the verse until it is safe to enter, and then enters anyway, because it is never quite safe. The Singer sang her to make a promise to the listener: however wrong the song goes, someone gentle is still humming the melody.',
    },
    hero_raiga: {
      title: 'Raiga, the Thunder Monk',
      text: "Raiga was sung in a thunderstorm by a Singer who was laughing too hard to hold the note. He was meant to be the comic relief. He declined. He takes every blow with a grin and returns it louder, and his thunder is not lightning at all but a laugh, the Singer's own, caught in the song and never let go. He weighs about as much as a temple bell and carries his sorrows a good deal more lightly. He calls everyone friend, means it, and it is somehow always a relief. Ask him about endings and he will tell you they are only the last chorus everyone has agreed to enjoy. Then he will laugh, and the Hush will stop to listen.",
    },

    // ---------------------------------------------------------------- lore: combat barks (5 lines per key, at most 64 characters each)
    barks_hanae: {
      lines: {
        start: ['Try to keep up.', 'Shall we? I have an appointment with excellence.', 'This will take a minute. Two, out of courtesy.', 'Stand back. I am about to be brilliant.', 'Let us not make a scene. Fine. A small one.'],
        hurt: ['Is that all? ...Ow. Is that all?', 'I will remember that. Loudly.', 'A lucky hit. Do not get used to it.', 'Bold. Rude, but bold.', 'My ponytail is fine. My pride, however...'],
        kill: ['Next.', 'Petals. Always petals.', 'Was that supposed to be difficult?', 'Consider that a firm rejection.', 'One more for the collection.'],
        down: ['I am simply lying down. Strategically.', 'Nobody. Saw. That.', 'Tell my ponytail it was a good run.', 'I meant to do that. Mostly.', 'Not... my best angle.'],
        win: ['Flawless. Well. Mostly flawless.', 'And that is how it is done.', 'You may applaud. Quietly. I am tired.', 'Another verse, another win.', 'Easy. I would gloat, but it is unbecoming.'],
        swap: ['My turn to stand in front.', 'Step aside. I will handle this.', 'Finally. The good spot.', 'Front row suits me.', 'Hero coming through. Everyone move.'],
      },
    },
    barks_kuro: {
      lines: {
        start: ['Verse, chorus, and a great deal of flute.', 'Let us hear how this scene plays.', 'I listened ahead. It goes fine. For most of us.', 'Please keep clear of the high notes.', 'Ah, the crescendo. My favourite.'],
        hurt: ['Ow. That was a very sour note.', 'That was a very unfair key change.', 'Rude. I was in the middle of a bar.', 'I would like to file a complaint with the Singer.', 'Hm. A harsh review from the cheap seats.'],
        kill: ['Fine. That is the musical word for the end.', 'Cut from the score.', 'Rest. Several bars of it.', 'Tuned out. You are welcome.', 'Now that is a final cadence.'],
        down: ['Cut to a verse... I am not in.', 'Tell them it was a very good last note.', 'Play on. I will catch the next bar.', 'Mark me as a rest. For now.', 'Well. That is a key change.'],
        win: ['Curtain. Applause, if you please.', 'A satisfying performance. This one qualified.', 'End of the verse. I will hum the reprise.', 'Well played, if I say so myself.', 'See? Last bar first. Always works.'],
        swap: ['Front row? Terrible seats for listening.', 'Pardon me, borrowing the spotlight.', 'I get the solo? How thrilling.', 'The front. Fascinating. Echoes everywhere.', 'Trade places. The tempo demands it.'],
      },
    },
    barks_suzu: {
      lines: {
        start: ['Stay close. I have you.', 'Breathe. We will be all right.', 'The moon is with us. Shall we?', 'Gently now. Together.', 'Whatever comes, we will meet it kindly.'],
        hurt: ['I am all right. Truly.', 'That stung. Keep going, I am fine.', 'It is only a bruise. Do not stop.', 'I will not fall. Not yet.', 'Steady... steady. I am still here.'],
        kill: ['Rest now. You have been through enough.', 'I am sorry. Sleep well.', 'Go in peace, little one.', 'It is over. Go back to the song.', 'Be still. The song has room for you elsewhere.'],
        down: ['Forgive me. I need a moment.', 'Hold the thread for me.', 'Keep going. I will catch up.', 'The moon is very bright tonight.', 'Do not worry. I am only resting.'],
        win: ['We made it. All of us.', 'Thank you, all of you.', 'It is quiet now. That is a good sign.', 'The moon shines a little kinder tonight.', 'Rest. We have earned it.'],
        swap: ['I will stand in front. It is all right.', 'Let me carry this one.', 'I will keep watch. Go and rest.', 'Behind me. I will take it.', 'Someone has to stand in the light.'],
      },
    },
    barks_raiga: {
      lines: {
        start: ['HA! A fine day for it!', 'Let the thunder speak, friend!', 'Stand behind me! Or beside! Either!', 'Ah, a storm! My oldest friend!', 'Well met! Who wants to make some noise?'],
        hurt: ['HA! Good one! Do it again!', 'Ouch! Friend, that was rude!', 'Nothing! It is nothing! ...It is a little something.', 'You hit like an old friend!', 'I have had worse from a puddle!'],
        kill: ['THUNDER!', 'Sleep well, friend!', 'A good fight! Truly!', 'Thank you for the exercise!', 'BOOM! And that is that!'],
        down: ['Ha... ha... I will be back.', 'Carry on, friend. I am listening.', 'Fine, fine. Just resting my thunder.', 'Nap time. Apparently.', 'Tell the storm I will call later.'],
        win: ['HAHA! Wonderful! Again!', 'That is how the thunder rolls!', 'Friend, that was magnificent!', 'Now THAT was a fight!', 'Everyone all right? Wonderful!'],
        swap: ['Now it is my turn! Come!', 'Step behind me, friend!', 'I will take the front! Somebody must!', 'Let the storm come to me!', 'Put me in, friend! I am ready!'],
      },
    },
  });
})();
