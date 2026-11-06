/* B17 STORY AND LORE for SUNBEAM SIEGE: Nine Lives to Hold the House
 *
 * One object, SB.data.story, holding the whole narrative. Prose is short on purpose.
 * Voice: a dry house butler narrating a very small war. Warm underneath. No em or en dashes.
 * Exclamation marks: only in the victory ending.
 *
 * SPOILER NOTE: the Human (called "Staff" before the reveal) is seeded as a joke in act 1 and 2
 * and only named plainly in the Dawn phase and the victory ending. Codex entries about Staff
 * stay vague until `win_run` or `boss_defeated:story_boss_alarm_clock`.
 *
 * NEEDS (for engine, UI and other agents):
 *  1. Enemy ids must match `enemyId` in story.bosses: pest_rat_king, pest_garden_hose,
 *     pest_vacuum_mk9, pest_spray_bottle, pest_vet_carrier, pest_red_dot, pest_alarm_clock.
 *     pest_alarm_clock is the 7th boss: it is the Dawn phase (25% HP) of whichever Night 9 boss
 *     the run drew (Vet Carrier or Red Dot). It can be a phase of that enemy; story only needs
 *     a boss portrait and a name for the Dawn cutscene.
 *  2. Champion `cardId` values are best guesses. Marmalade and Duchess Pudding come from A03
 *     samples; the other six are invented here. Cards agent: reuse these names or send me yours.
 *  3. Codex unlock triggers (string tags, engine fires `SB.story.unlock(tag)` or equivalent):
 *       run_start, battle_won, elite_won, first_nap, first_knock, first_box, first_hairball,
 *       first_purr, first_cuddle_pile, first_nip_surge, first_life_spent, last_life_spent,
 *       first_witching_hour, meet_gerald, buy_from_gerald, meet_elder_cat, champion_upgrade,
 *       act_reached:2, act_reached:3, sunbeam_below_10, boss_defeated:<story boss id>,
 *       win_run, lose_run, win_with:<clanId>
 *  4. UI: cutscene panels use `art` as a hint string for the procedural illustrator, not a path.
 *  5. UI: `defeat` messages are picked with the run RNG stream 'story' (not battle RNG).
 *  6. Event agent: Elder Cat may appear as a recurring event NPC, lines in story.elderCat.events.
 *
 * Shape summary:
 *   meta, world, clans[4], champions[8], elderCat, gerald, bosses[7], finalTwist, opening[7],
 *   interstitials[6], victory, defeat[30], tips[40], codex[30], plus helpers at the bottom.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

SB.data.story = {

  meta: {
    title: "SUNBEAM SIEGE",
    subtitle: "Nine Lives to Hold the House",
    tagline: "Hold the house. Keep the light. Knock things off shelves.",
    footer: "Some cats nap. Some cats defend.",
    houseName: "Number Nine, Larkspur Lane"
  },

  /* ------------------------------------------------------------------ WORLD */
  world: {
    house: {
      name: "Number Nine, Larkspur Lane",
      blurb: "Three floors, one cat flap, and a staircase that creaks on purpose.",
      floors: [
        { id: "cellar", name: "The Cellar", note: "Damp, dark, and full of opinions about mice." },
        { id: "parlor", name: "The Parlor", note: "Good rugs. Better chairs. A radiator with a following." },
        { id: "attic",  name: "The Attic", note: "Dust, trunks, and the only window that matters." }
      ],
      outside: ["The Garden", "The Roof"]
    },
    sunbeam: {
      name: "The Sunbeam",
      blurb: "Each morning a bar of gold light crosses the attic floor and settles on the cushion. Everyone in the house is warmer for it. That is the whole magic. It is enough.",
      rules: "While the Sunbeam holds, the clowder is warm, fed and a little smug. If it goes out, the cushion goes cold, and a cold house is just a building.",
      mystery: "The blind at the attic window is always found open at dawn. Nobody has asked who opens it. Asking would be rude."
    },
    pests: {
      name: "The Pests",
      blurb: "Mice, rats, dogs, and the kind of household object that should not have opinions.",
      why: "Everything cold comes to the warm place. The Sunbeam is the only warm place on Larkspur Lane. The Pests are not evil. They are freezing, and rude about it.",
      whyShort: "The Pests come for the warmth. So did the cats, once."
    },
    nineNights: "Every winter the cold peaks for nine nights. The old rule says a clowder must hold the house until the ninth dawn. Nobody remembers who made the rule. It has worked every time so far.",
    staff: "The household also contains Staff. Staff open tins. Staff are asleep upstairs. Staff are not part of the war.",
    currency: "Fish. Gerald accepts Fish. Gerald also accepts things that look like Fish."
  },

  /* ------------------------------------------------------------------ CLANS */
  clans: [
    {
      id: "alley",
      name: "Alley Tabbies",
      motto: "Hit first. Apologise never.",
      color: "ember orange",
      origin: "Born behind the bins on Fenwick Street. They arrived at Number Nine by following a smell and have refused to leave on principle.",
      bio: "The scrappers. They think the best defense is a loud offense, and the second best defense is also a loud offense.",
      likes: "Fences, fights, the front slot on any floor.",
      dislikes: "Naps before dinner, the word 'strategy', anyone who says 'calm down'.",
      rivalries: {
        hearth:   "Think the Hearthpaws are lovely and also useless. Have said so. Have been sat on for it.",
        moon:     "Find the Moonwhiskers spooky. Stand slightly behind each other when one walks in.",
        mischief: "Admire the chaos. Resent that it works without effort. Share a bin lid when no one is looking."
      },
      quirk: "Rage-bait: they will insult an enemy until it attacks the wrong cat."
    },
    {
      id: "hearth",
      name: "Hearthpaws",
      motto: "The best defender is the one who is already warm.",
      color: "warm gold and cream",
      origin: "Hand-raised on the best cushion in the house. They have not moved since, but the cushion has been very well maintained.",
      bio: "The cozy ones. They heal, purr, and make a pile that nothing wants to disturb. Do not mistake this for weakness. A well-rested cat is a terrifying cat.",
      likes: "Radiators, laps, a sunbeam in the correct position, the smell of toast.",
      dislikes: "Hurry, loud noises, being asked to stand up.",
      rivalries: {
        alley:    "Think the Tabbies need a lie down. Offer one every ten minutes. Always declined, always meant.",
        moon:     "Adore the Moonwhiskers. Mild concern that they do not sleep at night. Mild concern that they do.",
        mischief: "Have lost four vases and nine patience points to the Mischief. Forgive them instantly. Resent that."
      },
      quirk: "Nap: they get stronger by doing nothing, which the Tabbies call cheating."
    },
    {
      id: "moon",
      name: "Moonwhiskers",
      motto: "We have been here before. We will be again.",
      color: "indigo and pale silver",
      origin: "Nobody knows where they came from. They say they have always been in the attic. The attic says nothing, which is suspicious.",
      bio: "The spirit cats. Death is not an ending to them, it is a currency. They spend lives like others spend Fish, and look slightly smug about the exchange rate.",
      likes: "3 a.m., open windows, staring at corners until the corner gives in.",
      dislikes: "Being asked how many lives are left, being asked 'are you ok', mornings.",
      rivalries: {
        alley:    "Consider the Tabbies 'short-lived in spirit'. Say this kindly. It lands badly.",
        hearth:   "Quietly fond of the Hearthpaws. Sit near them for the warmth and deny it.",
        mischief: "Suspect the Mischief are also supernatural. Cannot prove it. Cannot stop watching."
      },
      quirk: "Nine Lives: they bank, spend and return lives, and can tell you the exact price of each."
    },
    {
      id: "mischief",
      name: "The Mischief",
      motto: "It was already on the edge.",
      color: "teal and magenta, with cardboard",
      origin: "A group noun that became a clan after nobody could stop them. Founded the day a cat looked at a glass, looked at a human, and looked at the glass again.",
      bio: "Chaos agents. They knock, they box, they tangle. They do not fight the pests so much as rearrange the house until the pests are somewhere else.",
      likes: "Shelves, boxes too small, anything that rolls, anything that falls, the 4 a.m. sprint.",
      dislikes: "Rules, tidiness, eye contact during a hairball.",
      rivalries: {
        alley:    "Love the Tabbies as an audience. Wish they would blink more.",
        hearth:   "Love the Hearthpaws as a safe landing. Have never once said thank you. Are working on it.",
        moon:     "Think the Moonwhiskers are secretly Mischief with better lighting. Will not drop it."
      },
      quirk: "Knock It Off: if it is on a shelf, it is a plan."
    }
  ],

  /* -------------------------------------------------------------- CHAMPIONS */
  champions: [
    {
      id: "story_champ_marmalade", cardId: "marmalade", clan: "alley",
      name: "Marmalade, Keeper of Nine",
      hook: "Has been to the vet eight times and won every argument.",
      backstory: "Marmalade is the reason the Alley Tabbies have a reputation. She once saw a carrier, walked straight in, and left with the carrier. The vet still sends cards. She is not here for glory. She is here because the Cellar has her chair.",
      motive: "Settle the score. Specifically with one carrier.",
      quote: "I have met worse. Most of them were in a bag.",
      art: "stout ginger tabby, torn left ear, tiny medal on a frayed collar, squinting"
    },
    {
      id: "story_champ_dolores", cardId: "alley_dolores_docks", clan: "alley",
      name: "Dolores of the Docks",
      hook: "Sailed in a fish crate and has refused to discuss the crossing.",
      backstory: "Dolores came to Larkspur Lane by way of a fishing boat, a customs office, and a very patient lorry driver. She has seen weather. She has seen a gull the size of a dog. Nothing in the Garden impresses her. She holds the Cellar with a stare that has been rated 'structural'.",
      motive: "Prove the house is worth more than the boat.",
      quote: "Wet is a mood. I got over it in a harbor.",
      art: "wiry grey tabby, black stripes like rope, ship's-cat scarf, one raised eyebrow"
    },
    {
      id: "story_champ_duchess", cardId: "duchess_pudding", clan: "hearth",
      name: "Duchess Pudding",
      hook: "Has never hurried and has never been late.",
      backstory: "A cream Persian raised in a hat shop. She moved into the best chair in the Parlor on her first afternoon and has treated every night since as a long, formal tea. Her lap holds three cats at once. This is not a feat. This is a Tuesday.",
      motive: "Keep everyone warm. Keep the good chair. Both are non-negotiable.",
      quote: "We shall be calm about this. Then we shall be rested about this.",
      art: "fluffy cream Persian, jeweled collar, half-lidded eyes, tiny cushion under paws"
    },
    {
      id: "story_champ_crumpet", cardId: "hearth_brother_crumpet", clan: "hearth",
      name: "Brother Crumpet",
      hook: "Sat on a tax audit once. The audit ended.",
      backstory: "Brother Crumpet kept the kitchen at a monastery bakery, where the oven was warm and the vows were optional. He took a vow of stillness and has never broken it. He believes every battle is won by whoever is most comfortable at the end. He has not been proven wrong.",
      motive: "Teach the house that rest is a weapon.",
      quote: "I do not run. I simply arrive later, and better rested.",
      art: "round buff tabby in a tiny brown hood, flour on paws, serene smile"
    },
    {
      id: "story_champ_sable", cardId: "moon_sable_vesper", clan: "moon",
      name: "Sable Vesper",
      hook: "Has died twice. Considers it a scheduling issue.",
      backstory: "Sable was the Lamplighter of the attic, the cat who sat on the window ledge and made sure the dusk came in properly. She has crossed over twice and returned both times, mildly annoyed at the paperwork. She spends her lives carefully. She knows exactly how many are left. She will not tell you.",
      motive: "Hold the line until dawn. Then ask someone about the paperwork.",
      quote: "Death was fine. The waiting room was dull.",
      art: "slim black cat, silver whisker tips, faint crescent glow behind head, long shadow"
    },
    {
      id: "story_champ_moth", cardId: "moon_grandmother_moth", clan: "moon",
      name: "Grandmother Moth",
      hook: "Older than the wallpaper. The wallpaper is nervous.",
      backstory: "Nobody knows how old Grandmother Moth is. The Moonwhiskers say she was in the attic when the attic was built. She speaks in half sentences and finishes them days later. Her gift is the ninth life, a thing she calls 'the one you keep for company'.",
      motive: "Make sure the youngest ones see the morning. After that, she will see.",
      quote: "I told you this would happen. I did not tell you when. Rude of me.",
      art: "frail grey-silver cat, enormous pale eyes, a pale moth sitting on one ear, faint star freckles"
    },
    {
      id: "story_champ_pickle", cardId: "mischief_pickle", clan: "mischief",
      name: "Pickle, Agent of Chaos",
      hook: "Has knocked over everything except the thing she was aiming at.",
      backstory: "Pickle was the smallest in a litter of seven and has spent every day since making up for it. She is a master of the Long Fall, the Short Cut, and the Accidental-On-Purpose. She does not plan. She improvises, with eye contact. The Mischief call her a genius. Her mother calls her 'that one'.",
      motive: "Be remembered. Preferably with a crash.",
      quote: "I did not break it. It was always going to do that.",
      art: "tiny tuxedo kitten-cat, oversized ears, a ball of magenta yarn on one paw, gleaming eyes"
    },
    {
      id: "story_champ_zephyr", cardId: "mischief_zephyr", clan: "mischief",
      name: "Zephyr von Shelf",
      hook: "Technically a noble. Practically a hazard.",
      backstory: "Zephyr was bred for show and ejected from three. He once walked across a dinner table and dismantled the centerpiece one stem at a time, making eye contact with the host throughout. He keeps a monocle he cannot see through. He keeps it anyway. Style is not optional.",
      motive: "Find a shelf worthy of his talents.",
      quote: "I do not knock things off. I simply withdraw their support.",
      art: "lean silver Siamese, painted monocle, cardboard top hat, tail like a question mark"
    }
  ],

  /* -------------------------------------------------------------- ELDER CAT */
  elderCat: {
    id: "story_elder_cat",
    name: "The Elder Cat",
    realName: "Pewter",
    bio: "The oldest cat in the house and the one who remembers the Nine Nights. Wears spectacles, which do nothing, and a cardigan, which does. Teaches the new clowder the rules, mostly by sighing.",
    secret: "She is on her ninth life. She has held this house for more winters than she will say. She also knows who opens the blind.",
    art: "tiny ancient grey cat, round spectacles, knitted cardigan, cushion like a throne",
    tutorial: [
      "Come in. Sit. No, not there. That is mine.",
      "That is the Sunbeam. Everything warm in this house comes from it. Guard it.",
      "Three floors. The Pests climb. You hold them off. It is not complicated, only tiring.",
      "Each of your cats has nine lives. Not nine, of course. Fewer, most of them. Spend them with care.",
      "The pests strike first. Put your best cat at the front and let them climb into trouble.",
      "Your Zoomies are your energy. They refill every turn. I would envy this, if I were young.",
      "When you are tired, nap. It is a tactic. Some of us have been using it for years.",
      "That is all. The rest you will learn by being surprised. Off you go."
    ],
    greetings: [
      "Ah. You came back. I had put you down as optimistic.",
      "Sit. Not on the cushion. The cushion is a long story.",
      "You look tired. Good. It means you have been doing it right."
    ],
    events: [
      { id: "elder_tea", text: "She offers you a saucer of warm milk and a theory. The theory is wrong. The milk is excellent.", ending: "Warm milk, mostly." },
      { id: "elder_stories", text: "'In my day the Pests were bigger, the nights were colder, and we had to walk uphill. On the stairs. Both ways.'", ending: "Take the story." },
      { id: "elder_lesson", text: "She shows you a trick with a paw and a doorframe. It is not useful. It is deeply satisfying.", ending: "Take the lesson." }
    ],
    lines: {
      act1_end: "The first Rat King falls and everyone is very pleased. Do not be. That was the small one.",
      act2_end: "You are halfway to dawn. I am proud. I will say it once. There. Done.",
      act3_end: "One more. Then breakfast. I mean the dawn. I mean breakfast."
    },
    farewell: [
      "I did say it would be warm.",
      "You held it. I was not worried. I was a little worried.",
      "The blind is open. It always is. Go and look."
    ]
  },

  /* ----------------------------------------------------------------- GERALD */
  gerald: {
    id: "story_gerald",
    name: "Gerald",
    species: "Raccoon, in a coat",
    selfDescription: "A tall cat.",
    bio: "Gerald runs the Back Alley Bazaar out of a wheelie bin and a leather trench coat. He insists he is a tall cat. He is a raccoon. Everyone has agreed not to say it, because he pays well and the coat is excellent.",
    art: "raccoon in a belted trench coat, fedora too large, ringed tail poking out, suspicious grin",
    greetings: {
      act1: ["A raccoon has set up a stall. He insists this is legal.", "Gerald: 'Fish only. Do not ask where the stock came from. I am a cat.'", "Gerald: 'Welcome. I am a tall, regular cat. I sell things. Normal things.'"],
      act2: ["Gerald: 'You made it past the rats. I knew you would. I had a bet. I lost it, but I knew.'", "Gerald: 'New stock. Do not look at the sink. I am a cat.'", "Gerald: 'The coat is new. The cat is the same.'"],
      act3: ["Gerald: 'The roof is a bad place to run a shop. Excellent for rumors, though.'", "Gerald: 'Do not worry about the noise. That is just the sky.'", "Gerald: 'Last stall before dawn. I have lowered nothing. But I feel for you.'"]
    },
    onBuy: [
      "Gerald: 'Pleasure. Do not look at it too closely.'",
      "Gerald: 'A fine choice. For a cat.'",
      "Gerald: 'Sold. No refunds. Also no receipts. Also no questions.'",
      "Gerald: 'It fell off a shelf. A shelf you will respect.'"
    ],
    onSell: [
      "I will take that off your paws.",
      "Gerald: 'Interesting. I will find a home for it. Possibly my own.'",
      "Gerald: 'A fair price. For me.'"
    ],
    onBroke: [
      "Gerald: 'I accept Fish, favors, and eye contact. You have none of them.'",
      "Gerald: 'Come back when you are less poor.'",
      "Gerald: 'I would give you credit. I would also give you a lecture. Neither is free.'"
    ],
    onRich: [
      "Gerald: 'Ah, that is a lot of Fish. Where did you keep them? Never mind. Do not tell me.'",
      "Gerald: 'I see money. I see a customer. I see a friend. I see money.'"
    ],
    onLeave: [
      "Gerald: 'Mind the step. Mind the second step. Do not mind the third, it bites.'",
      "Gerald: 'Come again. Or do not. I will be here either way, being a cat.'"
    ],
    secret: "Gerald lives in the roof gutter and has seen the dawn over Larkspur Lane more times than any cat. He has never told anyone what opens the blind. He has a guess. He will leave you a gift at the end, and a note: 'I was a raccoon the whole time. Sorry.'",
    finalGift: {
      name: "A Slightly Used Cat Door Key",
      text: "A note: 'I was a raccoon the whole time. Sorry. Keep the key. The door was never locked.'"
    }
  },

  /* ----------------------------------------------------------------- BOSSES */
  bosses: [
    {
      id: "story_boss_rat_king", enemyId: "pest_rat_king", act: 1, night: 3,
      name: "The Rat King",
      title: "Sovereign of the Cellar, Defender of Cheese",
      motive: "The Rat King does not want to take the house. He wants a seat at the warm place. His crown is a bottle cap. His court is eleven mice and a very old sock.",
      truth: "He has never been invited to anything. A rodent, thrilled to finally have a throne, even a damp one.",
      intro: "A bottle cap, worn proudly. Behind it, forty mice in a trench coat. The coat is not Gerald's. Gerald is upset about it.",
      phase: ["The court rallies. The sock is deployed.", "The king abdicates, then un-abdicates."],
      defeat: "The Rat King bows deeply. Somehow it is the cats who feel awkward.",
      epilogue: "He is seen on the Garden wall at dawn, still wearing the cap. Someone has left him a crust. Nobody knows who.",
      art: "tall rat in a bottle-cap crown and tattered velvet cape, flanked by mice in a stack",
      banter: {
        alley:    "Alley: 'Crown's a bottle cap. Respect the hustle, but no.'",
        hearth:   "Hearth: 'He looks cold, poor dear. Hit him gently. Then give him a blanket.'",
        moon:     "Moon: 'A king with no kingdom. We have seen that before. It ended in biscuits.'",
        mischief: "Mischief: 'That cap is on a very high shelf. Metaphorically. And also literally.'"
      }
    },
    {
      id: "story_boss_garden_hose", enemyId: "pest_garden_hose", act: 1, night: 3,
      name: "The Garden Hose",
      title: "Serpent of the Lawn",
      motive: "The Hose is tired of being stepped on, coiled, and yanked. It has spent a lifetime being used and never asked what it thinks. It thinks a lot. Mostly about water.",
      truth: "It is not angry at cats. It is angry at being left outside in the rain. A cat would sympathise, if it did not always involve water.",
      intro: "It slides over the wall in long, wet loops. It hisses, and the hiss is quite literally a leak.",
      phase: ["It winds around the Garden and pushes the line forward.", "It sprays. Everyone files a complaint."],
      defeat: "It lies on the lawn, finally coiled by its own choice. It looks almost peaceful. A little damp.",
      epilogue: "The Hose is found coiled neatly by the tap. It leaks only slightly. This is respect.",
      art: "long green garden hose with a brass nozzle head, wet shine, coiled like a cobra",
      banter: {
        alley:    "Alley: 'It's a hose. I have bitten worse. Not many. A few.'",
        hearth:   "Hearth: 'Water. In October. Someone should be ashamed.'",
        moon:     "Moon: 'It remembers the rain. All rain. All at once. We pity it.'",
        mischief: "Mischief: 'Do not step on the tail. Step on the tail. No, wait. Yes. Do it.'"
      }
    },
    {
      id: "story_boss_vacuum", enemyId: "pest_vacuum_mk9", act: 2, night: 6,
      name: "The Vacuum Mk IX",
      title: "The Great Cleaner",
      motive: "The Vacuum wants to be useful. It has been told its entire life that its job is to tidy, and it intends to do so, whether or not there is a mess. It finds the cats extremely untidy. It has opinions about fur.",
      truth: "It is lonely. It lives in a cupboard and is only taken out when something is wrong. It would like, once, to be invited because something is right.",
      intro: "A hum. A rattle. A hose that points at you with great sincerity. 'WARRANTY VOID IF LICKED,' says the sticker.",
      phase: ["It inhales the hand. Cards are, regrettably, sucked.", "It inhales your units. The ones that hold on are noted."],
      defeat: "The Vacuum winds down with a sad little whirr. A single sock rolls out. It is, in a sense, a gift.",
      epilogue: "It is plugged in by the stairs and allowed to hum. It does so, softly, all night.",
      art: "tall bagged upright vacuum cleaner, battered silver and purple, hose raised like an arm, one headlight eye",
      banter: {
        alley:    "Alley: 'Big noise. Big mouth. Same as my cousin Dave.'",
        hearth:   "Hearth: 'Do not look at it. Look at me. Keep looking at me.'",
        moon:     "Moon: 'It does not hate us. It does not know we exist. We find this restful.'",
        mischief: "Mischief: 'Ooh, a tube. Who wants to go in the tube?'"
      }
    },
    {
      id: "story_boss_spray_bottle", enemyId: "pest_spray_bottle", act: 2, night: 6,
      name: "The Spray Bottle Duelist",
      title: "Master of the Mist, Fencer of Fine Droplets",
      motive: "The Duelist believes it is a gentleman. It has trained for years in the art of the single, perfect squirt. It has strict rules about honor, and the rules are mostly about not being licked.",
      truth: "It wants a worthy rival. It has been spraying cats for years and none have ever fought back with style. It is bored. It is deadly. It is thrilled to see you.",
      intro: "It steps out from behind the sofa with a click. A tiny bow. A mist hangs in the air. 'En garde,' it says, in a voice like a faucet.",
      phase: ["It fires a volley. Everyone is Soaked. Everyone has views.", "It challenges your champion by name."],
      defeat: "It lowers the nozzle and salutes. 'A worthy foe,' it says. 'A truly unreasonable one.'",
      epilogue: "It hangs on a hook by the kitchen door, polished and gleaming. It still says good morning.",
      art: "white plastic spray bottle in a tiny red cape, rapier-nozzle, plume of mist like a hat feather",
      banter: {
        alley:    "Alley: 'One squirt. One. I have a lifetime of grudges.'",
        hearth:   "Hearth: 'I will be in the dry room. Tell me when it is over.'",
        moon:     "Moon: 'It strikes at what it cannot see. We admire this. We also move.'",
        mischief: "Mischief: 'Hold my tail. Distract it. I have an idea. It is a bad idea.'"
      }
    },
    {
      id: "story_boss_vet_carrier", enemyId: "pest_vet_carrier", act: 3, night: 9,
      name: "The Vet Carrier",
      title: "The Door Is Open. This Is How It Begins.",
      motive: "The Carrier has one job and does it with dread-inspiring purpose. It carries cats away. It does not know why. It has never been told. It has only ever been taken out when someone is about to be sad.",
      truth: "It would like to carry a cat somewhere nice. Once. A picnic, perhaps. A sunny windowsill. Any trip that ended in a nap and not a needle.",
      intro: "A clasp. A click. A door that opens exactly as wide as a cat. 'Please step inside,' it says, 'it will only take a moment.' It has said this before.",
      asFinal: "On the last night, the Carrier stands in the doorway of the attic, door open, heavy with history. Every cat remembers the last time.",
      phase: ["It traps a cat each turn. They stay trapped until the door is broken.", "It begins to rattle. Even the Carrier is nervous."],
      defeat: "The door falls off with a clatter. For the first time, the Carrier is just a box. A good one, actually. Roomy.",
      epilogue: "Pickle is found asleep in it the next day. The Carrier says nothing. It has never been happier.",
      art: "grey plastic pet carrier with a wire door, one latch broken, wearing a sad paper bow",
      banter: {
        alley:    "Alley: 'Not going in. Not going. I said no. Marmalade, tell it.'",
        hearth:   "Hearth: 'It is only a box. A box with history. A box with a lot of history.'",
        moon:     "Moon: 'We have been inside it before. We have also come out. Hmph.'",
        mischief: "Mischief: 'It is a box. It is a BOX. Do you know what I do with boxes.'"
      }
    },
    {
      id: "story_boss_red_dot", enemyId: "pest_red_dot", act: 3, night: 9,
      name: "The Red Dot",
      title: "The One That Cannot Be Caught",
      motive: "The Dot is a pure thought. It does not want to win or lose. It wants to be chased. It has never been caught. It has never wanted to be. If it were caught, the chase would end, and then what would it be?",
      truth: "It is the game. Every cat knows this. Every cat plays anyway. The Dot is the most honest thing in the house.",
      intro: "A small red glow on the wall. It twitches. Every cat in the room turns at the same instant, ears forward, shaking.",
      asFinal: "On the last night, the Dot is everywhere and nowhere. The clowder is trying very hard not to look. The clowder looks.",
      phase: ["It teleports. Wherever you are looking, it is not.", "It slows. It is being nice. It is not being nice."],
      defeat: "The cat pounces. The Dot goes out. There is a long, quiet moment. Then, from somewhere above, a click.",
      epilogue: "Nobody ever catches it. It is back the next day. This is the whole point.",
      art: "glowing red dot on a dark wall, trailing soft sparks, tiny cat shadows leaping at it",
      banter: {
        alley:    "Alley: 'Got you. No. Got you. No. This is fine. I am calm.'",
        hearth:   "Hearth: 'I will not be looking at it. I am looking at a wall. A very nice wall.'",
        moon:     "Moon: 'It is a light. It is not a light. It is a promise. Do not chase promises.' *chases it*",
        mischief: "Mischief: 'Yes. YES. This. I will give everything. I will give the shelf.'"
      }
    },
    {
      id: "story_boss_alarm_clock", enemyId: "pest_alarm_clock", act: 3, night: 9, dawn: true,
      name: "The Alarm Clock",
      title: "6:00 AM, Sharp",
      motive: "It has one purpose: to ring at dawn. It rings. It is very good at it. Nothing in the house, no Pest, no cat, no wall, can stop it. Because it does not fight the cats. It wakes the house.",
      truth: "The Alarm Clock is the end of the night. It is the door opening. It is breakfast. It is the Human. It is the thing the cats were holding on for. It is not an enemy at all. It is the finish line, wearing a bad mood.",
      intro: "At 25 percent health, the final boss stops. The room goes still. On the nightstand upstairs, a small black clock clicks to 5:59.",
      phase: ["The clock begins to ring. All Pests get +1 move. Everyone gets very loud.", "Upstairs, a creak. Then another. Footsteps."],
      defeat: "A hand, large and slow, finds the clock and silences it. A pause. A very long yawn.",
      epilogue: "The blind goes up. The Sunbeam enters. Gold on the cushion. A voice says: 'Alright, alright. Who wants breakfast.'",
      art: "old-fashioned twin-bell alarm clock, red hands at six, bells jangling, a faint golden light behind it",
      banter: {
        alley:    "Alley: 'Is that a clock? I can take a clock. Why is it so loud?'",
        hearth:   "Hearth: 'Oh. Oh, I know what that means. Oh, everyone, sit up. Look nice.'",
        moon:     "Moon: 'We have been told about this. Dawn. Nobody believed it.'",
        mischief: "Mischief: 'It is ringing. It is on a shelf. I will not knock it off. I will not. I will.'"
      }
    }
  ],

  /* ------------------------------------------------------------ FINAL TWIST */
  finalTwist: {
    name: "The Dawn Phase",
    setup: [
      "The Night 9 boss falls to 25 percent. The Pests freeze. The house is quiet.",
      "From upstairs, a sound the clowder has never heard in the dark: a tiny, regular tick.",
      "The Alarm Clock rings. All Pests gain +1 move. They are not attacking. They are running.",
      "Elder Cat, softly: 'Oh. It is that time already.'"
    ],
    reveal: [
      "The Pests were not attacking the Sunbeam. They were running toward the one warm thing they could see.",
      "The Sunbeam is not magic. It is a window. The blind opens at dawn because someone upstairs opens it.",
      "The Human upstairs is called Staff. Staff has been listening to the war all night, through the floor, in bed.",
      "Staff thought it was a lot of noise. Staff also thought it was lovely. Staff has been leaving the blind open for nine years."
    ],
    laugh: [
      "Elder Cat: 'You did not think the cushion moved on its own?'",
      "Elder Cat: 'I never said it was a god. I said it was warm. You all assumed.'",
      "Marmalade: 'Nine years. I have been defending a lamp.' Elder Cat: 'A window. Show some respect.'",
      "Gerald, from the gutter: 'I told them it was a person. Nobody asks the raccoon.'"
    ],
    heart: [
      "Every Pest was also somebody's chore. Every boss was also an object in a cupboard. Every one was left out in the cold until someone needed it.",
      "The siege was never against them. It was for the morning.",
      "At the end, the clowder does not win. It is simply, finally, let in.",
      "Staff comes downstairs in slippers and opens a tin. Every cat, every Pest, every household object is somehow, briefly, fed."
    ],
    lastLine: "The Sunbeam holds. Everyone has opinions about it."
  },

  /* ---------------------------------------------------------- OPENING CUTSCENE */
  opening: [
    {
      id: "open_1",
      text: "Number Nine, Larkspur Lane. A house with three floors, one cat flap, and a very good chair.",
      art: "night street, a narrow terraced house with a lit attic window, snow on the roof, a cat silhouette on the sill"
    },
    {
      id: "open_2",
      text: "Every morning a bar of gold light crosses the attic and settles on a cushion. Everything in the house is warmer for it.",
      art: "interior attic, a single shaft of sunlight on a faded cushion, dust motes glowing, cats asleep around it"
    },
    {
      id: "open_3",
      text: "The cats call it the Sunbeam. They treat it with religious seriousness. Nobody has asked how it gets here.",
      art: "close-up of the cushion and light, a small shrine of toy mice around it, one tiny paw reaching toward the warmth"
    },
    {
      id: "open_4",
      text: "Then winter. A long, hard one. Nine nights of cold so deep that everything with a heartbeat goes looking for the warm place.",
      art: "frozen garden, frost on the glass, a swarm of small shadows moving along the wall toward the house"
    },
    {
      id: "open_5",
      text: "Mice, rats, dogs. Then things that should not have opinions: hoses, sprays, a vacuum cleaner with a plan.",
      art: "a lineup of silhouettes at the garden gate: mice, a big dog, a hose, a vacuum, a spray bottle in a cape"
    },
    {
      id: "open_6",
      text: "The Elder Cat adjusts her spectacles. 'Nine nights,' she says. 'Hold the house. Keep the light. And please, nothing on the good rug.'",
      art: "elderly grey cat in a cardigan and round spectacles, on a throne-like cushion, clowder gathered below her"
    },
    {
      id: "open_7",
      text: "Somewhere in the Cellar, a cat looks at a glass on a shelf. Somewhere, a plan begins. It is a bad plan. It is going to work.",
      art: "dark cellar, a single tabby on a barrel, staring at a glass on a high shelf, one paw out, magenta glow"
    }
  ],

  /* -------------------------------------------------------- ACT INTERSTITIALS */
  interstitials: [
    {
      id: "act1_intro", act: 1, kind: "intro",
      title: "Act One: The Cellar and the Garden",
      speaker: "Narrator",
      text: [
        "The Cellar is damp, small, and full of mice with big ideas.",
        "The Garden is worse. It has weather and a dog.",
        "Hold the first three nights. Learn the rules. Do not trust the sock."
      ],
      art: "cellar stairs with a lit lantern, wine racks, cobwebs, a frosted garden gate beyond the door"
    },
    {
      id: "act1_outro", act: 1, kind: "outro",
      title: "Night Three Holds",
      speaker: "Elder Cat",
      text: [
        "The first boss is down. The Garden is quiet.",
        "I am pleased. Do not tell anyone. I have a reputation.",
        "The Parlor is next. It is nicer. It is also much, much worse."
      ],
      art: "dawn light on a frosted lawn, a bottle cap crown lying in the grass, tired cats walking inside"
    },
    {
      id: "act2_intro", act: 2, kind: "intro",
      title: "Act Two: The Parlor",
      speaker: "Narrator",
      text: [
        "Good rugs. Better chairs. A radiator with a following.",
        "The Pests here have wires and warranties.",
        "They also have a very firm opinion about fur."
      ],
      art: "lamp-lit parlor, wallpaper with faded roses, a vacuum cupboard slightly ajar, a sofa in shadow"
    },
    {
      id: "act2_outro", act: 2, kind: "outro",
      title: "Night Six Holds",
      speaker: "Gerald",
      text: [
        "'You did it. The mop is retiring. The bottle is hanging up its cape.'",
        "'I would offer a discount, but the coat has needs.'",
        "'The Attic is next. I have never been up there. Cats go up. Cats come down quieter.'"
      ],
      art: "parlor at dawn, a spray bottle on its side, a vacuum asleep on the rug, Gerald waving from the cat flap"
    },
    {
      id: "act3_intro", act: 3, kind: "intro",
      title: "Act Three: The Attic and the Roof",
      speaker: "Narrator",
      text: [
        "Dust, trunks, and the only window that matters.",
        "Above it, the Roof. Above that, the sky. Above that, something with a very bright idea.",
        "Three nights left. Then dawn."
      ],
      art: "attic beams, old trunks, a round window with the blind drawn, rooftop tiles and moon beyond"
    },
    {
      id: "act3_outro", act: 3, kind: "outro",
      title: "The Ninth Night Ends",
      speaker: "Elder Cat",
      text: [
        "It is nearly time. Listen.",
        "Something upstairs is ticking.",
        "I think you should sit down. Someone is coming."
      ],
      art: "attic at the end of night, the blind faintly lit from behind, every cat facing the stairs"
    }
  ],

  /* ----------------------------------------------------------------- VICTORY */
  victory: {
    title: "The Sunbeam Holds",
    banner: "The Sunbeam holds. Everyone has opinions about it.",
    panels: [
      {
        id: "win_1",
        text: "The alarm stops. Footsteps on the stairs. The whole house holds its breath, which is difficult for a house.",
        art: "dark staircase, a faint slipper-shaped shadow, cats looking up in a row"
      },
      {
        id: "win_2",
        text: "The attic door opens. A tall, rumpled figure in a dressing gown looks down at the clowder. 'You lot have been loud,' says Staff.",
        art: "rumpled human silhouette in doorway, hair on end, mug in hand, a stunned crowd of cats and pests looking up"
      },
      {
        id: "win_3",
        text: "Staff crosses the room and pulls the blind. The Sunbeam arrives, gold and slow, and settles on the cushion.",
        art: "attic window, blind rising, golden light spilling across the cushion and a ring of cats"
      },
      {
        id: "win_4",
        text: "'Right,' says Staff. 'Breakfast.' Every cat, every Pest, and one raccoon on the gutter agree this is the best idea yet.",
        art: "kitchen, a human opening a tin, cats in a pile, a mouse sitting politely next to a tabby, a raccoon at the window"
      },
      {
        id: "win_5",
        text: "Elder Cat takes the cushion. She has earned it. She curls her tail around her nose and says nothing for the first time in nine winters.",
        art: "elder cat asleep on the sunlit cushion, spectacles slightly crooked, content"
      }
    ],
    epilogues: {
      alley:    "The Tabbies insist they won it themselves. Nobody argues. Everyone is eating.",
      hearth:   "The Hearthpaws are asleep in a pile on the warm spot. They did not need to be told it was over.",
      moon:     "The Moonwhiskers count what they spent. It was all of it. They would do it again.",
      mischief: "The Mischief have rearranged the kitchen. There is a glass on the very edge. Staff has noticed. Staff is waiting."
    },
    credits: [
      "SUNBEAM SIEGE",
      "Nine Lives to Hold the House",
      "The Sunbeam would like to thank the cushion."
    ],
    after: "Next year is the same winter. The Pests will come back. They always do. Bring Fish."
  },

  /* ----------------------------------------------------------------- DEFEAT */
  defeat: [
    "The Sunbeam has gone out. Somewhere, a cushion is cold.",
    "The Cushion Is Cold. A raccoon sends his regards.",
    "The Pests have the house. They are already rearranging it. Badly.",
    "The Sunbeam shrinks to a dot, then to a thought, then to a draft.",
    "It was a good effort. The cats are lying down. They call this 'regrouping'.",
    "The warm spot is empty. The cats have gone upstairs to sulk. Quietly.",
    "That is nine lives, spent mostly on one bad idea. A classic.",
    "The Elder Cat sighs. It is a long, practiced sigh. You have earned it.",
    "The mice have taken the cushion. They look worried. They should be.",
    "No one is hurt. Everyone is annoyed. The cheese is gone.",
    "The Sunbeam flickers, coughs, and hands in its notice.",
    "Gerald tips his hat. 'Better luck next night. I will hold your stock.'",
    "The house is cold, the cats are cold, the Pests are somehow still cold. Great job, everyone.",
    "The Vacuum has taken the credit and the rug. Fair on one count.",
    "Out cold. Not you. The Sunbeam. You will be fine. Probably.",
    "Dawn arrived, found nobody home, and went away again.",
    "A Hearthpaw lies in the dust, humming. It is a nice hum. It is not helping.",
    "The Tabbies are blaming the Mischief. The Mischief are blaming gravity. Gravity has no comment.",
    "Even the Elder Cat looks a little bit surprised. Then she looks a lot unsurprised.",
    "Eight lives spent, one wasted, none regretted. Mostly.",
    "The Sunbeam has left. It said it would write.",
    "It is dark. It is cold. It is, in a technical sense, a nap.",
    "The house is silent. A single shelf creaks. Somebody is going to be very proud of this.",
    "You held the line. The line did not hold you back. That is the problem.",
    "The Pests are holding a meeting about what to do now. It is going to be a long meeting.",
    "A ruined plan, a cold cushion, and one cat still trying to knock something over. Committed.",
    "The cats did their best. The best is not always warm.",
    "You have been defeated by a hose. Nobody will mention it. Everybody will know.",
    "The clowder regroups under the sofa. The sofa makes a small sound of concern.",
    "Tomorrow is another night. Tonight is, unfortunately, this one."
  ],

  /* ------------------------------------------------------------ LOADING TIPS */
  tips: [
    "Cats strike before Pests. Always. This is the entire plan.",
    "A cat on its last life gets +2 Attack. It is called Cornered. It is not a choice anyone makes happily.",
    "Napping cats do not attack, but they heal, and they wake up angrier.",
    "Fluff is armor. It lasts the whole fight. Be generous with it.",
    "The Witching Hour is announced a round early. Panic is optional but encouraged.",
    "A Pest climbs only if its floor has no cats. Keep a cat on every floor.",
    "Boxes hide cats. Hidden cats cannot be targeted. They also do not block, so mind the stairs.",
    "Knock It Off pushes a Pest down. Landing hurts. The Pests below also take notice.",
    "A Pile of three or more cats heals each member. Piles are friendly.",
    "Yarn makes a Pest skip its action. Bosses only take half. Bosses are rude about it.",
    "Gerald buys cards for Fish. Do not ask where they go.",
    "The Scratching Post upgrades one card. The cat is not consulted.",
    "Hairballs fill the hand. Six is the limit. Seven is a lesson.",
    "A Catnip Surge is excellent. The Crash is the price. Plan for the nap.",
    "Your Champion is never deleted. Even at 0 lives, it sits out the act and returns. It just needs a minute.",
    "Lives can be restored at Nap Nooks, by shopping, or by generally being loved.",
    "At the start of each act, every cat gains a life. A small gift from the Sunbeam.",
    "The Sunbeam gains +5 Warmth after each boss. It is a modest bonus. It is also the only one.",
    "Impatience rises from round 16. Pests get +1 Attack each round. They have no patience either.",
    "A Zoom is a free half-damage hit on Witching Hour. Do not ask how.",
    "Cardboard Box is a Room item. Max two Boxes per floor. Gerald sells extras.",
    "Large cats do not fit in Boxes. They fit in your heart, which is not a Box.",
    "If a Pest reaches the Attic with no cats, it hits the Sunbeam in three rounds. Tidy up.",
    "Sneaky Pests hit the Sunbeam even with cats present. Do not take it personally.",
    "Zoomies refill each turn. They do not carry over. Spend them.",
    "The hand limit is ten. A hand of ten is a hand of regrets.",
    "Fish above 120 spoils at the start of Acts 2 and 3. Gerald's cousin collects the rest.",
    "Skipping a card reward gives 6 Fish. 'Not now, I am napping.' A solid philosophy.",
    "Kneading makes cards grow. Cap is 12 per card, 20 for champions. Please stop at 12.",
    "A Champion can be upgraded three ways. All of them are dramatic.",
    "Pick a main clan and a side clan. They like each other more than they say.",
    "The Elder Cat offers advice. It is mostly good. Some of it is about knitting.",
    "Mastery unlocks after 3, 7, and 12 plays. A card respects consistency.",
    "Moonwhiskers spend lives like Fish. Fish do not mind. Lives do.",
    "Hearthpaws win by doing less. The Tabbies take this personally.",
    "The Mischief do not fight Pests. They relocate them.",
    "Every Pest is just trying to get warm. You are still allowed to hit them.",
    "If the Sunbeam hits zero, the Cushion Is Cold. This is a metaphor. It is also a cushion.",
    "Finding the warm spot...",
    "Some cats nap. Some cats defend. All cats judge."
  ],

  /* ------------------------------------------------------------------ CODEX */
  codex: [
    {
      id: "lore_house", title: "Number Nine, Larkspur Lane", category: "World", unlock: "run_start",
      text: "Three floors, one cat flap, and a staircase that creaks on purpose. The house has been held by a clowder for as long as anyone can say, which is not long, because cats are bad with dates."
    },
    {
      id: "lore_sunbeam", title: "The Sunbeam", category: "World", unlock: "run_start",
      text: "A bar of light that crosses the attic each morning and lands on the cushion. It warms the house. It is not magic, strictly. It is simply very reliable, which in a cold house is the same thing."
    },
    {
      id: "lore_clowder", title: "The Clowder", category: "World", unlock: "run_start",
      text: "A group of cats. Technically a clowder, a glaring, a pounce, or a destruction, depending on who is asked. This one answers to 'clowder' and 'dinner'."
    },
    {
      id: "lore_pests", title: "Why the Pests Come", category: "World", unlock: "battle_won",
      text: "Everything cold goes to the warm place. The Sunbeam is the only warm place on Larkspur Lane. The Pests are not villains. They are freezing, and tactless about it."
    },
    {
      id: "lore_alley", title: "The Alley Tabbies", category: "Clans", unlock: "win_with:alley",
      text: "Founded behind the bins on Fenwick Street. They believe in hitting first and explaining later. Most explanations are 'he looked at me'."
    },
    {
      id: "lore_hearth", title: "The Hearthpaws", category: "Clans", unlock: "win_with:hearth",
      text: "Raised on the best cushion in the house. They have not moved since. The cushion is maintained by a rota of three. A fourth is on a waiting list."
    },
    {
      id: "lore_moon", title: "The Moonwhiskers", category: "Clans", unlock: "win_with:moon",
      text: "They say they came from the attic. The attic denies it. They count lives like coins and look at the ceiling a lot. Nobody knows why. Nobody asks."
    },
    {
      id: "lore_mischief", title: "The Mischief", category: "Clans", unlock: "win_with:mischief",
      text: "A collective noun that became a clan. They found a glass on the edge of a table and the rest is a very long story involving a vase, an insurance claim, and a spaniel."
    },
    {
      id: "lore_nine_lives", title: "Nine Lives", category: "Lore", unlock: "first_life_spent",
      text: "Every cat has several lives and a firm belief it has more. When one is spent the cat goes for a lie down and returns, a little thinner on the soul. Moonwhiskers consider this a business model."
    },
    {
      id: "lore_nap", title: "The Nap", category: "Lore", unlock: "first_nap",
      text: "Not a rest. A tactic. A napping cat gains Rested, heals, and wakes with a Stretch that has been described as 'a surprise to everyone, including the cat'. Do not wake one early. It is rude. It is also fun."
    },
    {
      id: "lore_knock", title: "Knock It Off", category: "Lore", unlock: "first_knock",
      text: "A cat looks at an object. A cat looks at you. A cat knocks the object. This is not malice. It is physics, applied by a professional."
    },
    {
      id: "lore_boxes", title: "The Box Principle", category: "Lore", unlock: "first_box",
      text: "If it fits, it sits. If it does not fit, it sits anyway. A boxed cat is hidden, quietly stronger, and extremely pleased with itself. Dogs, being tall, find them anyway."
    },
    {
      id: "lore_hairballs", title: "The Hairball", category: "Lore", unlock: "first_hairball",
      text: "Not an accident. A statement. It is cough-sourced, ethically made, and somehow always produced on the nicest rug. Moonwhiskers consider it a form of poetry."
    },
    {
      id: "lore_purr", title: "Purr and the Pile", category: "Lore", unlock: "first_cuddle_pile",
      text: "Purr is warmth made audible. A Pile of cats is warmth made structural. Together they heal wounds, repair morale, and make anything within five feet fall quietly asleep."
    },
    {
      id: "lore_nip", title: "Catnip", category: "Lore", unlock: "first_nip_surge",
      text: "Gerald stocks it. Gerald denies stocking it. The effect is a short burst of glory followed by a long burst of regret. Repeat users describe it as 'worth it' and 'where are my keys'."
    },
    {
      id: "lore_witching", title: "The Witching Hour", category: "Lore", unlock: "first_witching_hour",
      text: "Every third round, around three in the morning, every cat in the house gets an idea. All of them at once. It is announced a round early so that nobody can say they were not warned."
    },
    {
      id: "lore_fish", title: "Fish", category: "World", unlock: "meet_gerald",
      text: "The currency of the clowder. It is real fish. It is slightly warm. Nobody has ever asked how it keeps. Gerald says 'regulations'. This is not a regulation."
    },
    {
      id: "lore_gerald", title: "Gerald", category: "People", unlock: "buy_from_gerald",
      text: "Runs the Back Alley Bazaar out of a wheelie bin. Wears a trench coat. Insists he is a tall cat. Is a raccoon. Everyone has agreed not to bring it up, because the stock is excellent."
    },
    {
      id: "lore_elder", title: "The Elder Cat", category: "People", unlock: "meet_elder_cat",
      text: "The oldest cat in the house. Her name is Pewter and she has asked that you not use it. She remembers the Nine Nights, mostly, and sighs about the rest."
    },
    {
      id: "lore_champions", title: "Champions", category: "People", unlock: "champion_upgrade",
      text: "Each clan has a few cats who do not retire. Their lives are numerous, their habits are specific, and their upgrades are dramatic. They do not die. They go for a very long lie down."
    },
    {
      id: "lore_garden", title: "The Garden", category: "World", unlock: "boss_defeated:story_boss_rat_king",
      text: "A walled patch of lawn with a cold tap, a damp bench, and a gate that has been left unlatched for as long as anyone remembers. It is, officially, the Pest entrance. Unofficially, also."
    },
    {
      id: "lore_rat_king", title: "The Rat King", category: "Bosses", unlock: "boss_defeated:story_boss_rat_king",
      text: "He wears a bottle cap, commands eleven mice and a sock, and has never been invited to anything. The cats do not hate him. They are just very busy at the moment."
    },
    {
      id: "lore_hose", title: "The Garden Hose", category: "Bosses", unlock: "boss_defeated:story_boss_garden_hose",
      text: "Long, green, and permanently annoyed. It has been stepped on for years and thinks about it constantly. Any cat who has sat in a rain barrel is sympathetic. Briefly."
    },
    {
      id: "lore_vacuum", title: "The Vacuum Mk IX", category: "Bosses", unlock: "boss_defeated:story_boss_vacuum",
      text: "Lives in the cupboard. Comes out when something is wrong. It has never been called when something is right. It hums to itself. The hum is quite sad."
    },
    {
      id: "lore_spray", title: "The Spray Bottle Duelist", category: "Bosses", unlock: "boss_defeated:story_boss_spray_bottle",
      text: "A gentleman of the mist. Fond of capes, dignity, and a clean duel. It has been squirting cats for years and not one has fought back with any style. This is its dream."
    },
    {
      id: "lore_carrier", title: "The Vet Carrier", category: "Bosses", unlock: "boss_defeated:story_boss_vet_carrier",
      text: "Grey. Plastic. Heavy with history. Every cat in the house has been inside it, and none of them will discuss it. It would like to take someone somewhere nice, just once."
    },
    {
      id: "lore_dot", title: "The Red Dot", category: "Bosses", unlock: "boss_defeated:story_boss_red_dot",
      text: "Cannot be caught. Has never been caught. The mice have started a pool. The cats know this is a trick. They chase it anyway. That is the whole point of a cat."
    },
    {
      id: "lore_blind", title: "Who Opens the Blind?", category: "Secrets", unlock: "win_run",
      text: "Every dawn the blind is open. The cats never asked. Elder Cat knew. Gerald guessed. The answer is Staff, who has opened it for nine years and has never mentioned it once."
    },
    {
      id: "lore_staff", title: "Staff", category: "Secrets", unlock: "boss_defeated:story_boss_alarm_clock",
      text: "Large, warm, and mostly asleep. Staff opens tins, fills bowls, and says 'who's a good boy' to every cat, regardless. The cats let this slide. Staff has been the Sunbeam the whole time."
    },
    {
      id: "lore_dawn", title: "Dawn", category: "Secrets", unlock: "win_run",
      text: "The end of the Ninth Night. The alarm rings, the Pests stop, the blind rises, the light comes. It is breakfast, technically. It is also the only victory that ever mattered."
    }
  ]
};

/* ------------------------------------------------------------------ HELPERS */
(function () {
  var S = SB.data.story;

  S.byId = function (list, id) {
    var arr = S[list] || [];
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) return arr[i]; }
    return null;
  };

  /* Banter line for a clan reacting to a boss. Accepts story id or enemy id. */
  S.banterFor = function (bossId, clanId) {
    var b = S.byId('bosses', bossId);
    if (!b) {
      for (var i = 0; i < S.bosses.length; i++) { if (S.bosses[i].enemyId === bossId) { b = S.bosses[i]; break; } }
    }
    return b && b.banter ? (b.banter[clanId] || null) : null;
  };

  /* Pick one defeat message with a caller-supplied rng() in [0,1). */
  S.pickDefeat = function (rng) {
    var r = typeof rng === 'function' ? rng() : 0;
    return S.defeat[Math.floor(r * S.defeat.length) % S.defeat.length];
  };

  S.pickTip = function (rng) {
    var r = typeof rng === 'function' ? rng() : 0;
    return S.tips[Math.floor(r * S.tips.length) % S.tips.length];
  };

  /* Codex entries unlocked by a given trigger tag. */
  S.codexFor = function (tag) {
    return S.codex.filter(function (c) { return c.unlock === tag; });
  };

  S.interstitial = function (act, kind) {
    for (var i = 0; i < S.interstitials.length; i++) {
      var c = S.interstitials[i];
      if (c.act === act && c.kind === kind) return c;
    }
    return null;
  };
})();
