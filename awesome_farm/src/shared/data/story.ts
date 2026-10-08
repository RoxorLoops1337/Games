// The words between the chapters, and the words of Fortune: story cards, messages in bottles, fortune-cookie lines
// and Madame Fortuna's patter. Pure data (no Phaser, no DOM), read by the client.
//
// When a chapter is claimed the player sees its `outro` pages, then the next chapter's `intro` pages, so an outro and
// the intro after it are written to flow together. The very first intro is the welcome. After the last chapter the
// EPILOGUE plays. A page is a few short sentences from one voice: a giver id (data/sidequests.ts) or 'narrator'.
//
// The thread running through it all: the islands were once joined by a chain of lanterns, lit each dusk by the
// Lanternkeepers. The lights went out long ago. The Old Heart is where the first lantern burned.

interface StoryPage { speaker: string; text: string }        // speaker: a giver id from GIVERS, or 'narrator'
interface ChapterStory { intro: StoryPage[]; outro: StoryPage[] }

const n = (text: string): StoryPage => ({ speaker: 'narrator', text });
const say = (speaker: string, text: string): StoryPage => ({ speaker, text });

/** Keyed by chapter id (CHAPTERS in data/quests.ts). */
export const STORY: Record<string, ChapterStory> = {
    roots: {
        intro: [
            n('A small island, a flint pick and one very green morning. Nobody remembers how you got here. The sea is not telling.'),
            n('There are trees to chop, stones to crack and a head full of plans. Somewhere out in the blue, other farmers are doing the very same thing.'),
            say('marta', 'Welcome, dear! I pinned this note to the nearest tree. The soil here is kind, so start with some wood and a workbench. The rest will follow.'),
        ],
        outro: [
            n('Planks, a workbench and a chest full of hope. It already looks like somebody lives here.'),
        ],
    },
    rest: {
        intro: [
            n('The sun slides into the sea and the shadows grow long. Something small and green wobbles out of the grass, and it does not look friendly.'),
            say('watcher', 'Night is coming. Light a fire and stay close to it. I will be watching from the dark, and so will they.'),
        ],
        outro: [
            say('watcher', 'You saw the sun again. Most do. The fire helped, but the staying was all you.'),
            n('A campfire, a garden bed and a little more land. It is not just a place any more. It is home.'),
        ],
    },
    metal: {
        intro: [
            say('ferro', 'Is that a campfire I smell? Lovely. Now stop poking things with sticks. Stone, fire and patience: that is how you get metal.'),
        ],
        outro: [
            say('ferro', 'Iron bars! Look at them, shiny as new coins. I am not crying. It is the coal smoke.'),
            n('With metal in your pockets the island feels smaller. Past the water, a thin line of smoke is rising from somewhere new. Somebody else is out there.'),
        ],
    },
    reach: {
        intro: [
            say('odo', 'Psst, friend. The sea is full of islands, and the islands are full of customers. Buy some land, put up a stall, and I will be along.'),
        ],
        outro: [
            n('Plot by plot the water gets thinner. Ahead you can make out another farm, and somebody waving a very small hat.'),
            say('brine', 'Now that is reaching out. I have sailed this sea longer than your farm has been a rumour. There used to be lights on the water, you know. Never mind, never mind.'),
        ],
    },
    night: {
        intro: [
            say('watcher', 'The nights are getting bolder, and so should you. Take a sword. Be kind to your lights: they are the only thing the dark respects.'),
        ],
        outro: [
            n('Two lanterns glow beside your door. Funny how a little light makes the whole night feel like it is on your side.'),
            say('watcher', 'Lanterns. Hm. They used to mean a great deal more than that.'),
        ],
    },
    wild: {
        intro: [
            say('pip', 'Shh, look. There, in the grass. Not everything out here wants to bite. Most of it just wants a friend with snacks.'),
        ],
        outro: [
            say('pip', 'Look at them look at you! Some friendships do not need words.'),
            n('The den is warm and the creatures are hard at work. For the first time, the island feels like it is looking after you, too.'),
        ],
    },
    gears: {
        intro: [
            say('ferro', 'Why carry things yourself when a belt can do it? Drills, belts and a bit of wind. Do not look at me like that. It is easier than it sounds.'),
        ],
        outro: [
            say('ferro', 'It hums! The whole farm hums! I always knew you had it in you. Mostly because I was too lazy to do it myself.'),
            n('Belts carry, drills dig and the wind pays the bill. In the quiet between the whirrs, something deep under the ground hums a note of its own.'),
        ],
    },
    altar: {
        intro: [
            say('watcher', 'Do you feel that? Under the island, in the stones. The guardians are waking up. First comes something soft, large and very bouncy.'),
        ],
        outro: [
            n('The Slime King wobbles, sighs and melts into a shining puddle. He looks almost relieved.'),
            say('watcher', 'He kept the first door for a very long time. Four guardians remain. Do not hurry.'),
        ],
    },
    deeper: {
        intro: [
            n('Beyond the meadows the land turns to stone, then sand, then snow. Steel and crystal are out there, and so is some very stern company.'),
            say('odo', 'Deeper means richer, friend. Steel, crystal, sharp swords. I will stock whatever you can survive to carry home.'),
        ],
        outro: [
            say('odo', 'Twenty plots! You are practically a landlord. Do not forget to pay the sea its rent.'),
        ],
    },
    work: {
        intro: [
            n('Your farm mostly runs itself now. Belts hum, creatures work and the furnaces glow all night. Time for something grander: a wonder, tall enough to see from the sea.'),
            say('ferro', 'A Golden Windmill. Do you know how many gears that takes? Neither do I. I stopped counting at three hundred.'),
        ],
        outro: [
            n('The Golden Windmill turns slowly in the evening light. Its long shadow reaches across the water, and for a moment the sea shines back.'),
            say('ferro', 'Odd thing. In the foundations I found a scrap of glass, thick as my thumb and warm as toast. Nobody makes glass like that any more.'),
        ],
    },
    corners: {
        intro: [
            say('watcher', 'The other guardians are awake: the Stone Colossus, the Bog Witch, the Dune Pharaoh, the Frost Giant. Each keeps a corner. Each is lonelier than they look.'),
        ],
        outro: [
            say('pip', 'A rare one! You know it chose you, do you not? They always do the choosing.'),
            n('The corners of the world are quiet. The wind smells different now, like a door that has been opened a crack.'),
        ],
    },
    rift: {
        intro: [
            say('brine', 'New islands at the edge of the sea, and they were not there yesterday. I have seen this once before. Pack warm, and a spare sandwich.'),
            n('A dock, a few friends and a plan. The rift islands glitter on the horizon like a handful of dropped coins.'),
        ],
        outro: [
            say('brine', 'You cleared a rift and came back with all your toes. In my day I would have called that a legend. Now I call it Tuesday.'),
            n('From the dock you can see the very middle of the map: one lonely plot, glowing faintly, where every island seems to point.'),
        ],
    },
    heart: {
        intro: [
            n('Every island leads to the centre. Something there has been waiting a very long time. It is not angry. It is only very, very old.'),
            say('watcher', 'Go gently, and go together. The Heart remembers everything, even who lit the very first light.'),
        ],
        outro: [
            n('The Old Heart gives one last slow beat, and the whole island hums with it. Where it sat there is a small round hollow, as warm as a hand.'),
            say('watcher', 'It was not an enemy. It was a keeper. It kept something safe for longer than anyone remembers, and I think it was waiting for you.'),
            n('Down at the pier, a boat bumps the planks. Somebody is unloading something very large and very round.'),
        ],
    },
    stranger: {
        intro: [
            say('fortuna', 'Ah, the pier! The best place to meet a farmer who is about to win something. I am Madame Fortuna, reader of luck and spinner of wheels.'),
            say('fortuna', 'Build me a frame, darling, and I will show you what luck looks like. The first spin of the day is free. I am not a monster.'),
        ],
        outro: [
            say('fortuna', 'Look at that, you are lucky! Or good at counting. In my trade that is the same thing.'),
            n('Crates rattle in your pockets and the wheel clicks round and round. Now and then a tree glints at you like it has a secret. Fortune has moved in.'),
        ],
    },
    xmarks: {
        intro: [
            say('finn', 'Is that a Fortune Wheel? Brilliant! I am Finn Digsby, and I dig things up. Mounds in the ground, bottles in the sea, and every one of them points the same way.'),
            say('odo', 'Friend, a map! One coin, no refunds. Fair warning: it is a bit too accurate. It has your farm on it, and a tiny lantern drawn on every island.'),
        ],
        outro: [
            say('finn', 'Five holes dug, two bottles read and one very shiny thing. And every letter says the same: the lights, the lanterns, the old keepers.'),
            say('brine', 'The lanterns. So I did not dream it. A chain of lights, island to island, burning all night. I saw the last one go out when I was small.'),
        ],
    },
    lantern: {
        intro: [
            say('fortuna', 'Darling, a confession. The wheel was never about luck. Luck is only what a lantern looks like from far away.'),
            say('fortuna', 'Every spin turned a little light inside it. Bring me Lantern Shards, a pinch of gold and one very good pearl, and I will show you how a keeper does it.'),
        ],
        outro: [
            n('Fortune\'s Lantern flickers once, twice, and then holds. A small gold flame, steady as a heartbeat. For the first time in a very long age, a light is burning.'),
            say('watcher', 'The Heart kept the first flame safe until somebody kind came to light the rest. I have waited so long to see this. Look out across the water.'),
        ],
    },
};

/** Shown after the very last chapter. */
export const EPILOGUE: StoryPage[] = [
    n('Far out at sea, a tiny spark answers. Then another, and another, island after island, a string of lights drawing itself across the dark.'),
    say('brine', 'There they are, every one. I told them I was not dreaming. Somebody fetch me a chair. I am going to cry like a fool.'),
    say('fortuna', 'Do not tell the wheel, but luck had nothing to do with it. You kept digging, kept spinning, kept lighting. That is just called hope, darlings.'),
    n('The islands are linked again, and your farm hums under a sky full of lanterns. The story goes on, but this chapter is done. Go and grow something wonderful.'),
];

/** Messages in bottles: letters, riddles and warnings from the old Lanternkeepers and from sailors. One is read at random. */
export const BOTTLES: string[] = [
    'To whoever finds this: the lanterns were my whole life. Fourteen islands, fourteen flames, and I climbed every one at dusk. My knees remember. Please tell me somebody still lights them.',
    'Day 40 at sea. Out of biscuits, out of rope, out of patience. The gulls have started giving me advice, and it is bad advice. If you read this, please send a sandwich.',
    'Riddle: the more you take from me, the bigger I get. What am I? (A hole. Dig where the ground looks lumpy and you will find several.)',
    'The first lantern stood at the centre of everything. We called it the Heart, because it never stopped. If you ever walk that far, go gently, and bring good friends.',
    'Digger\'s tip: the lumpy mounds that sprout overnight are shy, not dangerous. Two good swings of a pick and they open up like flowers. Wear boots. Hold your hat.',
    'Dear Mildred, I buried the pearls where the old sign leans. I will not say more in case a gull reads this. Yours, Bartholomew. P.S. The sign fell over. Look anyway.',
    'Sailor\'s rule: a tree that shines like a coin is either lucky or lying. Hit it anyway, it costs nothing. Rocks too. Especially rocks.',
    'From the last keeper of the eastern chain: lantern glass is not glass. It is a kept promise, cooled. Pieces break off when a flame goes out. Collect them. They want to go home.',
    'Message in a bottle, size small. Contents: one message, one cork and one very tiny spider. The spider says hello. It would like to go back on land now.',
    'Three paces from the crooked rock, then seven toward the sunrise, then dig. That is all the map says. It does not say which crooked rock. Bring snacks.',
    'They say a fortune teller travels these seas with a wheel as wide as a barn door. They also say she cheats. She does not. She simply knows where the luck is hiding.',
    'To whoever reads this: you were meant to. Not by me, I am only a bottle with opinions. By the sea. It brings the right things to the right shores. Keep fishing.',
    'The Night Watcher does not sleep, and that is not a joke. If you see a light in a window at the worst hour of the night, wave. He likes it. He will not wave back.',
    'One flame for every island, and the first at the centre of them all. When the last one died, the keepers sat on the beach and sang until morning. A sad song, and a very beautiful one.',
    'I found a chest. I lost the key. I found the key. I lost the chest. If you are reading this, the sea is playing tricks again. Check your pockets.',
    'A crate floats better than a ship. Remember that when the ship sinks. Also remember that a crate makes a wonderful hat. I have worn mine for nine days.',
    'When the sea goes quiet at dusk, that is the old chain remembering. Light one candle, any candle, and the water will hold the glow for a moment. Be patient. It is shy.',
    'To every keeper still alive: do not be afraid of the Heart. It is not asleep, it is waiting. Whoever comes for it, be kind. It has been alone a very long time.',
];

/** Fortune-cookie lines for the wheel. */
export const FORTUNES: string[] = [
    'A tree will shine at you today. Be flattered. Then chop it.',
    'You will find a coin today. Possibly your own. Fortune is subtle.',
    'Someone nearby has a crate with your name on it. Bring elbows.',
    'Luck loves a patient farmer. And a tidy one. Mostly the patient one.',
    'Your lucky number is the one you were about to forget.',
    'Big change ahead: a new hat, perhaps. Or a very good turnip.',
    'The wheel has no favourites. It just likes you a little more.',
    'A stranger will offer you a map. Check which way up it is.',
    'You will be asked to bet it all. Bet half. Sleep well.',
    'Great wealth awaits, just after the part where you dig.',
    'The creature at your heels thinks you are very brave. Do not correct it.',
    'Good news comes in threes. This is the first. Do not tell the others.',
    'Your next rock is hiding something. Rocks are like that.',
    'Beware the fourth cookie. Nothing bad will happen. It just is not as good.',
];

/** What Madame Fortuna says on the wheel screen, by moment. One is picked at random each time. */
export const FORTUNA_LINES: { welcome: string[]; spin: string[]; win: string[]; jackpot: string[]; bust: string[]; gambleAsk: string[]; gambleWin: string[]; gambleLose: string[]; broke: string[] } = {
    welcome: [
        'Step right up, darling. The wheel has been waiting for you.',
        'My favourite customer! You are my only customer. Still.',
        'One free spin a day. After that, it is coins and courage.',
        'Fortune favours the bold. Also the well rested. Sit down.',
        'The wheel is warm today. That is a good sign. Or a hot one.',
    ],
    spin: [
        'Round and round she goes...',
        'Hold your breath, darling.',
        'Click, click, click. The wheel is thinking.',
        'Do not watch the wheel. Watch me. It hates being watched.',
        'Where she stops, nobody knows. Least of all me.',
        'Whee! No wait, tense! Tense!',
    ],
    win: [
        'A winner! I did say the wheel liked you.',
        'Not bad, darling. Not bad at all.',
        'Take it, take it, before the wheel changes its mind.',
        'Fortune smiles. Smugly, but she smiles.',
        'That is the sound of luck, darling. Mostly coins.',
    ],
    jackpot: [
        'JACKPOT! Somebody tell the sea!',
        'The wheel has gone quiet. It never does that. Look at you!',
        'I have seen this twice in forty years. Both times I cried.',
        'Lanterns above! That is the big one, darling!',
        'Hold on to your hat. And your shard. Especially your shard.',
    ],
    bust: [
        'Ooh, nothing. Nothing is also a result, darling.',
        'The wheel sulks. It will get over it.',
        'A near miss! Well, a far miss. But still a miss.',
        'Better luck next spin. There is always a next spin.',
        'Not today. Today the wheel has other plans.',
    ],
    gambleAsk: [
        'Double or nothing, darling? Or are you not feeling brave?',
        'Press your luck? I will not judge. Much.',
        'Take the coins, or risk them for twice as many. Your call.',
        'A little gamble? The wheel loves a little gamble.',
        'Half of you wants to stop. The other half is already nodding.',
    ],
    gambleWin: [
        'Doubled! You magnificent gambler!',
        'Twice the coins, twice the grin.',
        'I knew it. I did not know it. But I felt it.',
        'The wheel bows to you. A little.',
        'Oh, lovely! Do it again. No? Wise, wise.',
    ],
    gambleLose: [
        'Oh, darling. The wheel giveth, and the wheel taketh.',
        'Gone! Like a sock in a washing machine.',
        'That is why they call it a gamble. Chin up.',
        'Do not look at me like that. I only run the wheel.',
        'Better luck next time. There is always a next time.',
    ],
    broke: [
        'Out of coins, darling? Come back with pockets. Or tomorrow.',
        'The wheel takes coins, not promises. I tried promises.',
        'Empty pockets. Hm. Go and chop something, then come back.',
        'No coin, no spin. The oldest rule on the pier.',
        'Even luck needs a deposit, darling.',
    ],
};
