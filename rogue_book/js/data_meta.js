// Inkwoven -- data_meta.js: achievements, Ink Trials, tips and the lore (story pages, hero pages and combat barks).
// Data only (DESIGN 4.10, CONTENT_SPEC 6): one IIFE that registers into DATA.achievements, DATA.trials, DATA.tips and DATA.lore.
// No functions, no clock, no unseeded randomness, no em or en dashes. Checked by DATA.validate and DATA.audit('meta') and by
// tests/rogue_book_narrative.test.mjs.
//
// ACHIEVEMENTS (32). {id, name, text, stat:{k, gte}, reward:{inkstones}}. `k` is a DATA.LISTS.statKeys id that COMBAT, RUN or META
//   really write (the narrative suite greps for it). Fixed ids: ch1_clear (boss1Kills, unlocks Suzu), ch2_clear (boss2Kills, unlocks
//   Raiga), ch3_clear (boss3Kills, the first win). Rewards run 3 to 60 Inkstones against Library prices of 40 to 140.
//   Thresholds are profile-lifetime totals except the max keys (maxHit, maxTurnDamage, trialBest), which are bests.
//
// INK TRIALS (10). Each level's `mods` are its OWN increment; playing trial N sums levels 1..N (DATA.trialDeltas). Every mod only
//   makes the game harder, and each level has a distinct headline so the climb reads as a staircase, not a slope:
//     1 purse   2 hides   3 healing   4 Ink   5 damage   6 wells and revives   7 prices   8 a curse   9 elites and bosses   10 the Red Pen
//   Damage is floored per hit, so enemyDmg steps are large enough to move real hits (+15% turns a 7 into an 8). Ink stays fair:
//   at trial 10 a chapter starts with 9 Ink and each well gives 3, and kills, brushes, Meditate and the mercy rule fill the rest.
//
// TIPS (30, at most 110 characters). Mechanics only, no hand-typed numbers that tuning could change.
//
// LORE. Story pages {id, title <= 40, text <= 700}: intro, ch1_intro, ch2_intro, ch3_intro, ch1_clear, ch2_clear, victory, defeat,
//   hero_<id> x4. Plain paragraphs of prose with no line breaks (the story screen types them out). Barks: barks_<hero> with 5 lines
//   for each of start, hurt, kill, down, win, swap, at most 64 characters each. `down` is spoken by the hero who fell, `win` by the
//   survivor, `swap` by the hero stepping to the front, `hurt` by the hero who took the big hit, `kill` by the hero who struck the blow.
//
// THE SPINE (why the book is the way it is; the pages below say it a little at a time)
//   The Author wrote the book with four voices: nerve (Hanae), curiosity (Kuro), tenderness (Suzu) and laughter (Raiga). The Author's
//   fifth voice, doubt, became the Editor, who wanted the last page to be perfect and struck out anything that was not. The Blank is
//   what is left where the Editor has crossed something out. Each boss is a keeper who held on too tightly: Kuzunoha held the WORDS
//   (writing until she wrote walls), Jorogumo held the PEOPLE (binding them to keep them safe), the Editor holds the ENDING.
//   The heroes win by letting the story move. The ending: the Editor is not destroyed but joined, the last line is written together
//   and left open on purpose, and the book asks to be read again. The Author is whoever turns the page.
(() => {
  // ------------------------------------------------------------------ achievements
  DATA.add('achievements', {
    ch1_clear: { name: 'Out of the Grove', text: 'Defeat Kuzunoha, the Nine-Tail Ink Fox, and turn the first page.', stat: { k: 'boss1Kills', gte: 1 }, reward: { inkstones: 10 } },
    ch2_clear: { name: 'Lanterns Out', text: 'Defeat Jorogumo, the Silk Courtesan, and let the guests go home.', stat: { k: 'boss2Kills', gte: 1 }, reward: { inkstones: 15 } },
    ch3_clear: { name: 'The Last Page', text: 'Defeat the Editor and rewrite the ending.', stat: { k: 'boss3Kills', gte: 1 }, reward: { inkstones: 30 } },

    first_draft: { name: 'First Draft', text: 'Finish your first run, win or lose. Every book starts somewhere.', stat: { k: 'runs', gte: 1 }, reward: { inkstones: 3 } },
    regular_reader: { name: 'Regular Reader', text: 'Finish 10 runs. The book is starting to recognise you.', stat: { k: 'runs', gte: 10 }, reward: { inkstones: 8 } },
    happy_endings: { name: 'Happy Endings', text: 'Win 5 runs. Some tales are worth telling more than once.', stat: { k: 'wins', gte: 5 }, reward: { inkstones: 20 } },

    petal_and_steel: { name: 'Petal and Steel', text: 'Win 3 runs with Hanae in the party.', stat: { k: 'winsHanae', gte: 3 }, reward: { inkstones: 15 } },
    ink_and_insight: { name: 'Ink and Insight', text: 'Win 3 runs with Kuro in the party.', stat: { k: 'winsKuro', gte: 3 }, reward: { inkstones: 15 } },
    moonlit_vigil: { name: 'Moonlit Vigil', text: 'Win 3 runs with Suzu in the party.', stat: { k: 'winsSuzu', gte: 3 }, reward: { inkstones: 15 } },
    thunder_and_laughter: { name: 'Thunder and Laughter', text: 'Win 3 runs with Raiga in the party.', stat: { k: 'winsRaiga', gte: 3 }, reward: { inkstones: 15 } },

    cartographer: { name: 'Cartographer of Ink', text: 'Paint 500 hexes across all your runs.', stat: { k: 'hexesPainted', gte: 500 }, reward: { inkstones: 10 } },
    brush_collector: { name: 'Brush Collector', text: 'Use 25 one-use brushes.', stat: { k: 'brushesUsed', gte: 25 }, reward: { inkstones: 10 } },
    treasure_hunter: { name: 'Treasure Hunter', text: 'Open 25 chests.', stat: { k: 'chestsOpened', gte: 25 }, reward: { inkstones: 10 } },
    curio_cabinet: { name: 'Curio Cabinet', text: 'Find 50 treasures across your runs.', stat: { k: 'relicsFound', gte: 50 }, reward: { inkstones: 12 } },
    fable_fan: { name: 'Fable Fan', text: 'Read 60 fables. Some of them were even true.', stat: { k: 'eventsSeen', gte: 60 }, reward: { inkstones: 10 } },

    big_spender: { name: 'Big Spender', text: 'Spend 3000 gold in shops. The peddlers send their regards.', stat: { k: 'goldSpent', gte: 3000 }, reward: { inkstones: 10 } },
    jewellers_eye: { name: "Jeweller's Eye", text: 'Socket 40 gems into your cards.', stat: { k: 'gemsSocketed', gte: 40 }, reward: { inkstones: 10 } },

    pest_control: { name: 'Pest Control', text: 'Defeat 500 creatures of the tale.', stat: { k: 'kills', gte: 500 }, reward: { inkstones: 12 } },
    champion_hunter: { name: 'Champion Hunter', text: 'Defeat 40 elite enemies.', stat: { k: 'elites', gte: 40 }, reward: { inkstones: 12 } },
    not_a_scratch: { name: 'Not a Scratch', text: 'Defeat a boss without taking a single point of damage.', stat: { k: 'flawlessBosses', gte: 1 }, reward: { inkstones: 25 } },
    wall_breaker: { name: 'Wall Breaker', text: 'Land a single hit for 50 or more damage.', stat: { k: 'maxHit', gte: 50 }, reward: { inkstones: 10 } },
    one_big_sentence: { name: 'One Big Sentence', text: 'Deal 100 damage in a single turn.', stat: { k: 'maxTurnDamage', gte: 100 }, reward: { inkstones: 12 } },
    free_verse: { name: 'Free Verse', text: 'Play 3 or more free cards in one turn, on 10 different turns.', stat: { k: 'zeroCostTurns', gte: 10 }, reward: { inkstones: 8 } },
    slow_burn: { name: 'Slow Burn', text: 'Finish off 30 enemies with Poison. Patience is a weapon.', stat: { k: 'poisonKills', gte: 30 }, reward: { inkstones: 8 } },

    minimalist_author: { name: 'Minimalist Author', text: 'Win a run with 15 cards or fewer. Every word earns its place.', stat: { k: 'smallDeckWins', gte: 1 }, reward: { inkstones: 20 } },

    charity_case: { name: 'Charity Case', text: "Be rescued by the book's mercy 3 times. It happens to the best of us.", stat: { k: 'mercy', gte: 3 }, reward: { inkstones: 5 } },
    face_in_the_petals: { name: 'Face in the Petals', text: 'Have a hero knocked down 30 times. Getting back up counts too.', stat: { k: 'heroDowns', gte: 30 }, reward: { inkstones: 5 } },
    musical_chairs: { name: 'Musical Chairs', text: 'Swap rows 300 times. Nobody is sitting down.', stat: { k: 'swaps', gte: 300 }, reward: { inkstones: 8 } },

    daily_reader: { name: 'A Tale a Day', text: 'Play 5 Daily Tales.', stat: { k: 'dailyRuns', gte: 5 }, reward: { inkstones: 10 } },

    inkling: { name: 'Inkling', text: 'Win a run on Ink Trial 1.', stat: { k: 'trialBest', gte: 1 }, reward: { inkstones: 10 } },
    ink_adept: { name: 'Ink Adept', text: 'Win a run on Ink Trial 5.', stat: { k: 'trialBest', gte: 5 }, reward: { inkstones: 25 } },
    master_of_ink: { name: 'Master of the Ink', text: 'Win a run on Ink Trial 10. The Red Pen bows.', stat: { k: 'trialBest', gte: 10 }, reward: { inkstones: 60 } },
  });

  // ------------------------------------------------------------------ Ink Trials
  DATA.add('trials', {
    trial_1: { level: 1, name: 'Lean Purse', text: 'Enemies and chests drop 10% less gold.', mods: { goldMul: -0.10 } },
    trial_2: { level: 2, name: 'Tough Hides', text: 'Regular enemies and minions have 10% more HP.', mods: { enemyHp: 0.10 } },
    trial_3: { level: 3, name: 'Slow Mending', text: 'Camp rests, healing fables and chapter healing restore 15% less.', mods: { healMul: -0.15 } },
    trial_4: { level: 4, name: 'Thin Ink', text: 'Every chapter begins with 1 less Ink.', mods: { startInk: -1 } },
    trial_5: { level: 5, name: 'Sharp Claws', text: 'Enemies deal 15% more damage.', mods: { enemyDmg: 0.15 } },
    trial_6: { level: 6, name: 'Shallow Wells', text: 'Ink wells give 1 less Ink, and fallen heroes rise with 15% HP, not 25%.', mods: { wellInk: -1, reviveFrac: -0.10 } },
    trial_7: { level: 7, name: 'Dear Peddlers', text: 'Shops charge 15% more, and you start with 20 less gold.', mods: { priceMul: 0.15, startGold: -20 } },
    trial_8: { level: 8, name: 'Burdened Start', text: 'Begin the run with a curse in your deck.', mods: { curses: 1 } },
    trial_9: { level: 9, name: 'Proud Champions', text: 'Elites have 20% more HP, and bosses have 15% more.', mods: { eliteHp: 0.20, bossHp: 0.15 } },
    trial_10: { level: 10, name: 'The Red Pen', text: 'Enemies hit 10% harder, and card rewards offer one card fewer.', mods: { cardChoices: -1, enemyDmg: 0.10 } },
  });

  // ------------------------------------------------------------------ tips
  DATA.add('tips', [
    'Painting a hex costs Ink. Wells, kills and Meditate at camp all give it back.',
    'Brushes paint whole shapes for free. Save the long ones for when the boss is far away.',
    'You can only walk on painted hexes, but you can paint far ahead: the game finds the cheapest chain for you.',
    'The front hero takes most of the attacks. The back hero is safer, but some cards only shine up front.',
    'One row swap per turn is free. Every extra swap costs Energy, so plan the second one.',
    'A downed hero is not gone. Their cards clog your hand until the fight is won and they stand up again.',
    'If both heroes fall, the tale ends. Keep the front hero healthy and the back hero alive.',
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
    'Stranded with no Ink and no path? The book takes pity and gives you enough for one hex.',
    'Most kills refill a little Ink, and elites more. Minions give none. Fighting is how you cross the page.',
    'An X cost card spends all your remaining Energy. Play it last, when you know how much you have.',
    'Retain keeps a card in hand at the end of a turn. Hold your finisher until you can afford it.',
    'Exhaust removes a card for the rest of the fight. Powerful, but count how many you can spare.',
    'Every hero hides a resource: Bloom, Sumi, Ward or Charge. Learn which cards build it and which spend it.',
    'Ink Trials make the tale harder. Win one to unlock the next. The Daily Tale gives everyone the same seed.',
  ]);

  // ------------------------------------------------------------------ lore: story pages
  DATA.add('lore', {
    intro: {
      title: 'Once, a Book',
      text: 'Once there was a book that wrote itself. Its Author had loved it so long and so well that one day the ink simply kept going without a hand. Then, on an ordinary night, the Author put down the pen and did not come back. Nobody knows why. The lamp was still lit. The last sentence was still wet. Slowly the margins went quiet, then white, then nothing at all: the Blank, unhurried and polite, erasing the tale one page at a time. But a book that writes itself is never quite empty. Somewhere inside it, two characters woke, looked at each other, and agreed that the ending was not going to be a blank page.',
    },
    ch1_intro: {
      title: 'The Whispering Bamboo Grove',
      text: "The first page smells of rain and warm paper. The Whispering Bamboo Grove glows in golden dusk, every stalk murmuring the words it is afraid to forget. Kodama rattle in the branches. A kappa guards a bridge with terrible manners. And somewhere in the middle, a white fox with nine brush-tipped tails is writing the grove over, stroke by stroke, faster than the Blank can rub it out. Nobody asked her to. Nobody thanked her, either. 'She means well,' the bamboo whispers. 'That is the trouble. She writes so hard she has stopped reading.' The map lies blank. Ink up, brush ready. Paint a way.",
    },
    ch1_clear: {
      title: 'The Fox Puts Down Her Brush',
      text: "Kuzunoha's nine tails drooped one by one, like wet brushes. The ink ran out of her, and the wildness with it, and she sat down in the bamboo, very small for a fox the size of a house. 'I was only trying to keep it,' she said. 'Every time the Blank took a word, I wrote two more. I never noticed I had stopped writing words and started writing walls.' The grove went quiet, and then, quite suddenly, it was full of birdsong. The page turned by itself. Far behind it, a shrine bell rang once, and a girl with silver hair looked up. Her chapter had just been allowed to begin.",
    },
    ch2_intro: {
      title: 'The Sunken Lantern City',
      text: 'The second chapter is written in lantern light on black water. The Sunken Lantern City drifts under a sky like a folded kimono, every canal lined with paper lamps and every lamp watching. Karakuri dolls perform for no one. Drowned soldiers guard bridges that lead nowhere. A tea house serves guests who never leave, and in the tallest window a lady in a very fine kimono is spinning silk. She is the keeper of the city. She holds it together, thread by thread. She holds everything together. Look how tightly she holds. The lanterns lean closer, and every one of them is smiling.',
    },
    ch2_clear: {
      title: 'The Threads Come Loose',
      text: "When the last silk thread snapped, the city did not fall. It exhaled. Jorogumo sat among the wreck of her kimono, fingers still tying knots in nothing. 'They were going to be erased,' she said. 'The guests, the lamps, all of them. So I kept them. I kept them here.' Nobody answered, because everyone knew the answer, and it was not unkind: keeping is not the same as letting live. One by one the lanterns went out, and the guests rose from the table at last and walked home. Thunder rolled in from the next page. Somewhere ahead, a broad man laughed at the storm, cracked his knuckles, and started walking toward it.",
    },
    ch3_intro: {
      title: 'The Crimson Sky Citadel',
      text: 'The last chapter is not written in ink. It is written in red pen. The Crimson Sky Citadel hangs above a sea of storm cloud, its walls stamped and restamped, its corridors lined with black bars where names used to be. Lightning strikes in neat, careful lines. Through the window slits the sky is coming apart in white tears, and every tear is a word that did not survive an edit. At the very top waits the Keeper of the Last Page, who has been polishing a single sentence for a very long time so that nothing in it will ever have to change. Every hex you painted was leading here.',
    },
    victory: {
      title: 'The Ending, Rewritten',
      text: "The Editor lowered his red pen, and his face came apart like a page of old notes. 'It had to be perfect,' he whispered, in the Author's own tired voice. 'An ending that hurts cannot be taken back, so I never let one come.' The Author had not vanished. The Author had only stopped believing the last page could be good enough. The heroes did not shout. They set their hands beside his on the same pen and wrote the last line together, and left it open at the end on purpose. The Blank drew back like a tide. In the margin, a small white fox waved. Then the book turned itself to page one, smudged and beloved and entirely alive, and asked, very politely, to be read again.",
    },
    defeat: {
      title: 'The Page Goes White',
      text: 'The ink thinned. The bamboo, the lanterns, the storm, all of it went pale and soft, and the heroes watched their own hands turn the colour of paper. It did not hurt. That was the worst part. The Blank is polite that way. But a book that writes itself does not stay blank for long, and a story that fades is not a story that has ended. The page turns back. The margins darken, the lamp relights, and two characters open their eyes a little smudged and a little wiser, with a very clear memory of where the fox likes to hide. Once more from the top. Try a different road. The book is patient. It has all the pages in the world.',
    },

    // ---------------------------------------------------------------- lore: the four heroes
    hero_hanae: {
      title: 'Hanae, the Blossom Blade',
      text: "The Author wrote Hanae on the very first page, on a day the Author felt brave. She was meant to be the hero: the one who steps forward first, so the rest of the story has somewhere to stand. She has a very good ponytail, an even better blade, and a reputation for never being late. Every cut she makes leaves petals, because the Author once wrote 'like a blossom' and never crossed it out. She will tell you she is afraid of nothing. She will say it a little fast. The truth is that she was written to win, and nobody ever wrote what happens if she does not, so she has decided never to find out.",
    },
    hero_kuro: {
      title: 'Kuro, the Inkweaver',
      text: 'Kuro began as a footnote. The Author needed someone to explain things to the reader, so a scholar was pencilled into the margin, glasses and all, and then, because the Author was kind, given a personality. It got out of hand. He is the only one who knows he lives in a book, and he reads the last page first, which he says is sensible and everyone else says is cheating. His brush writes spells because it is the brush that wrote him. He teases to stay warm. He counts the margins for exits. Deep down he suspects a footnote is the first thing an editor cuts, and he would like everyone to please stop saying that out loud.',
    },
    hero_suzu: {
      title: 'Suzu, the Moon Miko',
      text: 'The Author wrote Suzu late at night, on the evenings when the story would not come. She is the shrine at the edge of the map, the lantern left burning for whoever is lost. She keeps the tale from fraying: every stitch of the binding, every loose thread, she feels in her hair, and she mends what she can without making a fuss. She is seventeen and steadier than a mountain. She waits at the edge of the page until it is safe to enter, and then enters anyway, because it is never quite safe. The Author wrote her to make a promise to the reader: however wrong the story goes, someone gentle is holding the other end of the thread.',
    },
    hero_raiga: {
      title: 'Raiga, the Thunder Monk',
      text: 'Raiga was written in a thunderstorm by an Author who was laughing too hard to hold the pen steady. He was meant to be the comic relief. He declined. He takes every blow with a grin and returns it louder, and his thunder is not lightning at all but a laugh, the Author\'s own, caught between the pages and never let go. He weighs about as much as a temple bell and carries his sorrows a good deal more lightly. He calls everyone friend, means it, and it is somehow always a relief. Ask him about endings and he will tell you they are only the last chapter everyone has agreed to enjoy. Then he will laugh, and the Blank will stop to listen.',
    },

    // ---------------------------------------------------------------- lore: combat barks (5 lines per key, at most 64 characters each)
    barks_hanae: {
      lines: {
        start: ['Try to keep up.', 'Shall we? I have an appointment with excellence.', 'This will take a minute. Two, out of courtesy.', 'Stand back. I am about to be brilliant.', 'Let us not make a scene. Fine. A small one.'],
        hurt: ['Is that all? ...Ow. Is that all?', 'I will remember that. Loudly.', 'A lucky hit. Do not get used to it.', 'Bold. Rude, but bold.', 'My ponytail is fine. My pride, however...'],
        kill: ['Next.', 'Petals. Always petals.', 'Was that supposed to be difficult?', 'Consider that a firm rejection.', 'One more for the collection.'],
        down: ['I am simply lying down. Strategically.', 'Nobody. Saw. That.', 'Tell my ponytail it was a good run.', 'I meant to do that. Mostly.', 'Not... my best angle.'],
        win: ['Flawless. Well. Mostly flawless.', 'And that is how it is done.', 'You may applaud. Quietly. I am tired.', 'Another page, another win.', 'Easy. I would gloat, but it is unbecoming.'],
        swap: ['My turn to stand in front.', 'Step aside. I will handle this.', 'Finally. The good spot.', 'Front row suits me.', 'Hero coming through. Everyone move.'],
      },
    },
    barks_kuro: {
      lines: {
        start: ['Chapter, verse, and a great deal of ink.', 'Let us see how this scene reads.', 'I have read ahead. It goes fine. For most of us.', 'Please stand clear of the margins.', 'Ah, the rising action. My favourite.'],
        hurt: ['Ow. Noted, and underlined.', 'That was a very unfair footnote.', 'Rude. I was in the middle of a sentence.', 'I would like to file a complaint with the Author.', 'Hm. An adverse review.'],
        kill: ['And so it ends. Sorry. Spoilers.', 'Marked, corrected, and struck through.', 'Revised for clarity.', 'Edited. You are welcome.', 'Now that is a final draft.'],
        down: ['Cut to a scene... I am not in.', 'Tell them it was a very good last line.', 'Turn the page. I will catch up.', 'Footnote me. Later.', 'Well. That is a plot twist.'],
        win: ['Curtain. Applause, if you please.', 'A satisfying scene. This one qualified.', 'End of chapter. I will take notes.', 'Well written, if I say so myself.', 'See? Last page first. Always works.'],
        swap: ['Front row? Terrible seats for reading.', 'Pardon me, borrowing the spotlight.', 'I get to be brave? How novel.', 'The front. Fascinating. Ink everywhere.', 'Trade places. The plot demands it.'],
      },
    },
    barks_suzu: {
      lines: {
        start: ['Stay close. I have you.', 'Breathe. We will be all right.', 'The moon is with us. Shall we?', 'Gently now. Together.', 'Whatever comes, we will meet it kindly.'],
        hurt: ['I am all right. Truly.', 'That stung. Keep going, I am fine.', 'It is only a bruise. Do not stop.', 'I will not fall. Not yet.', 'Steady... steady. I am still here.'],
        kill: ['Rest now. You have been through enough.', 'I am sorry. Sleep well.', 'Go in peace, little one.', 'It is over. Go back to the page.', 'Be still. The story has room for you elsewhere.'],
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
