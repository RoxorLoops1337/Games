'use strict';
// ===================== WORLD DATA: Crews & Turf (see WORLD_DESIGN.md sections 2-5, 10) =====================
// Globals defined here: CREWS, STANDING_NAMES, VENUES, EDGES, NPCS, REQUEST_TYPES, RUMORS, FAVOUR_STYLE, CREW_GRAFT,
// plus ENEMIES entries for every NPC (and an `_a2` act-2 variant of each), crew ARGS templates, Favour cards in BC/NC
// (`favour_<npcId>`) and five Bonded crew grafts in GRAFTS. Pure data + tiny helpers: the logic lives in world.js.

// ---------------------------------------------------------------- crews
const CREWS = {
  loop_rats: {
    id: 'loop_rats', name: 'The Loop Rats', short: 'Loop Rats', name2: 'The Loop Rats (Feedback Mix)',
    color: '#6cc22e', colorDark: '#3f7d17', colorLight: '#c9f09e', rivals: ['gloss'], friends: ['scrap_kings'],
    sound: 'street beatbox & loopers', icon: 'mouth', motto: 'If it\'s worth saying, it\'s worth saying again.',
    blurb: 'A rowdy family of beatboxers, loop-pedal buskers and their pet rats. Loud, loyal, and allergic to silence. They fight in repeats: once a Loop Rat gets going, the beat only gets heavier.'
  },
  gloss: {
    id: 'gloss', name: 'The Gloss Suits', short: 'Gloss', name2: 'The Gloss Suits (Platinum Edition)',
    color: '#f4b6e0', colorDark: '#b4689a', colorLight: '#fde6f4', rivals: ['loop_rats'], friends: ['bass_cartel'],
    sound: 'smooth label execs', icon: 'coin', motto: 'Sign here, darling. And here. And here.',
    blurb: 'Pearl-pink label execs with chrome smiles and contracts longer than a prog-rock album. They would rather out-talk you than out-punch you, and they have the Resolve (and the lawyers) to do it.'
  },
  bass_cartel: {
    id: 'bass_cartel', name: 'The Bass Cartel', short: 'Bass Cartel', name2: 'The Bass Cartel (Sub-Zero)',
    color: '#7a45b0', colorDark: '#4a2470', colorLight: '#d6bdf0', rivals: ['static_choir'], friends: ['gloss'],
    sound: 'subwoofer gangsters', icon: 'quake', motto: 'Feel it in your chest.',
    blurb: 'Purple hoodies, speaker chains and a sound system you can see from space. The Cartel hits hard, stacks Strength and parks behind walls of Block until the drop.'
  },
  static_choir: {
    id: 'static_choir', name: 'The Static Choir', short: 'Static Choir', name2: 'The Static Choir (White Noise)',
    color: '#3fd8e8', colorDark: '#1f8a96', colorLight: '#c4f4f9', rivals: ['bass_cartel'], friends: [],
    sound: 'hush-cult of the white noise', icon: 'eye', motto: 'Shhhhhhhhhh.',
    blurb: 'A grey-cyan robed choir that believes every song should end in a perfect hush. They whisper, mute and unsettle: expect Weak, Vulnerable and a head full of Doubt.'
  },
  scrap_kings: {
    id: 'scrap_kings', name: 'The Scrap Kings', short: 'Scrap Kings', name2: 'The Scrap Kings (Overdrive)',
    color: '#ff8a2a', colorDark: '#b8541a', colorLight: '#ffd6ad', rivals: [], friends: ['loop_rats'],
    sound: 'junkyard rig-builders', icon: 'gear', motto: 'If it\'s broke, we\'ll make it louder.',
    blurb: 'Orange-overalled tinkerers who build amps out of washing machines and drones out of toasters. They plate up, patch up and send the machines in first.'
  }
};
const CREW_IDS = Object.keys(CREWS);
const STANDING_NAMES = { '-3': 'Hostile', '-2': 'Enemy', '-1': 'Wary', '0': 'Neutral', '1': 'Friendly', '2': 'Friend', '3': 'Bonded' };

// ---------------------------------------------------------------- venues (1280x560 map pane below the HUD)
const VENUES = {
  home_studio: { id: 'home_studio', name: 'Home Studio', district: 'neutral', type: 'studio', x: 640, y: 300, bg: 'camp', rest: true, blurb: 'Your bedroom-studio-slash-crash-pad. Egg-box walls, one good mic, Jordan\'s tote bags everywhere. Rest, rework your set, and swap your Favours here.' },
  busker_alley: { id: 'busker_alley', name: 'Busker Alley', district: 'loop_rats', type: 'lair', x: 150, y: 300, bg: 'alley', blurb: 'A brick canyon of open guitar cases and looping pedals. Mama Loop holds court on an upturned crate; Stomp taps out the door policy.' },
  tape_market: { id: 'tape_market', name: 'Tape Market', district: 'loop_rats', type: 'market', x: 250, y: 140, bg: 'market', blurb: 'Stalls of second-hand pedals, hissy cassettes and suspiciously tame rats. Dotty Dub will sell you anything with a footswitch.' },
  crosswalk: { id: 'crosswalk', name: 'The Crosswalk', district: 'loop_rats', type: 'street', x: 270, y: 470, bg: 'alley', blurb: 'The busiest zebra crossing in the Quarter, and the Loop Rats\' favourite stage. Every beep of the lights is a beat.' },
  label_tower: { id: 'label_tower', name: 'Label Tower', district: 'gloss', type: 'lair', x: 640, y: 70, bg: 'market', blurb: 'A pearl-pink skyscraper with a revolving door that charges royalties. Mr. Mute guards the lift; Madame Sheen owns the view.' },
  velvet_lounge: { id: 'velvet_lounge', name: 'Velvet Lounge', district: 'gloss', type: 'street', x: 470, y: 170, bg: 'night', blurb: 'Plush booths, tiny drinks, enormous egos. Talent scouts circle the room like very polite sharks.' },
  contract_kiosk: { id: 'contract_kiosk', name: 'Contract Kiosk', district: 'gloss', type: 'market', x: 830, y: 150, bg: 'market', blurb: 'A glossy booth selling "opportunities". Sleek Sol has a pen for every occasion and a clause for every pen.' },
  sub_basement: { id: 'sub_basement', name: 'Sub Basement', district: 'bass_cartel', type: 'lair', x: 1130, y: 300, bg: 'foundry', blurb: 'A concrete bunker where the bass is so deep the puddles ripple. Drop is always about to. Big Sub never stands up.' },
  club_woofer: { id: 'club_woofer', name: 'Club Woofer', district: 'bass_cartel', type: 'street', x: 1000, y: 160, bg: 'night', blurb: 'The queue goes round the block and the walls breathe. Kick and Snare work the door in perfect time.' },
  speaker_depot: { id: 'speaker_depot', name: 'Speaker Depot', district: 'bass_cartel', type: 'market', x: 1010, y: 460, bg: 'foundry', blurb: 'Stacks of speaker cones taller than a bus. Woofer Wanda tests every one personally, at full volume.' },
  hush_chapel: { id: 'hush_chapel', name: 'Hush Chapel', district: 'static_choir', type: 'lair', x: 640, y: 510, bg: 'night', blurb: 'A candle-lit chapel full of old TVs showing static. Nobody speaks above a whisper. Nobody wants to find out what happens if you do.' },
  echo_cellar: { id: 'echo_cellar', name: 'Echo Cellar', district: 'static_choir', type: 'den', x: 470, y: 460, bg: 'night', blurb: 'A vaulted cellar where every word comes back three times, slightly sadder. Brother Reverb runs it like a very echoey youth club.' },
  choir_steps: { id: 'choir_steps', name: 'Choir Steps', district: 'static_choir', type: 'street', x: 800, y: 470, bg: 'night', blurb: 'Wide stone steps where robed acolytes hum one endless note. Tourists find it soothing. Tourists are wrong.' },
  scrapyard: { id: 'scrapyard', name: 'The Scrapyard', district: 'scrap_kings', type: 'lair', x: 440, y: 310, bg: 'foundry', blurb: 'A mountain of dead amps with a throne of tape reels on top. Jack Hammer runs the gate; King Cassette runs everything else.' },
  rust_bridge: { id: 'rust_bridge', name: 'Rust Bridge', district: 'scrap_kings', type: 'street', x: 850, y: 300, bg: 'alley', blurb: 'An iron bridge strung with fairy lights and jump leads. Weld and Sparks are always fixing it. It is always slightly on fire.' },
  junk_cafe: { id: 'junk_cafe', name: 'Junk Cafe', district: 'scrap_kings', type: 'rest', x: 640, y: 420, bg: 'camp', rest: true, blurb: 'Coffee brewed in a car radiator, served by a robot arm. Cog Carla sells parts out the back. Best sofa in the Quarter.' },
  the_stage: { id: 'the_stage', name: 'The Stage', district: 'neutral', type: 'stage', x: 640, y: 190, bg: 'night', blurb: 'The big one. Headliner Night happens here: every crew turns up, and the crowd decides who owns the Quarter.' }
};
const VENUE_IDS = Object.keys(VENUES);
const EDGES = [
  ['home_studio', 'scrapyard'], ['home_studio', 'rust_bridge'], ['home_studio', 'junk_cafe'], ['home_studio', 'the_stage'],
  ['busker_alley', 'tape_market'], ['busker_alley', 'crosswalk'], ['busker_alley', 'scrapyard'],
  ['tape_market', 'velvet_lounge'], ['crosswalk', 'echo_cellar'],
  ['label_tower', 'velvet_lounge'], ['label_tower', 'contract_kiosk'], ['label_tower', 'the_stage'],
  ['velvet_lounge', 'junk_cafe'], ['contract_kiosk', 'club_woofer'],
  ['club_woofer', 'sub_basement'], ['club_woofer', 'rust_bridge'],
  ['sub_basement', 'speaker_depot'], ['speaker_depot', 'choir_steps'],
  ['choir_steps', 'hush_chapel'], ['choir_steps', 'rust_bridge'],
  ['hush_chapel', 'echo_cellar'], ['echo_cellar', 'junk_cafe'], ['scrapyard', 'junk_cafe']
];

// ---------------------------------------------------------------- the cast
const NPCS = {};
function defNpc(id, crew, role, venue, name, title, o) {
  NPCS[id] = Object.assign({ id, name, crew, role, title, venue, rj: 'npc_' + id, enemy: id, shop: false, nightOnly: false }, o);
}
// --- Loop Rats
defNpc('loop_mama', 'loop_rats', 'boss', 'busker_alley', 'Mama Loop', 'Elder Busker Queen', {
  blurb: 'Has been looping the same four bars since before the Quarter had streetlights. Somehow they still slap. Her loop-pedal backpack has more cables than a festival.',
  greet: ['Mmm-hm. MM-hm. Sit down, baby, the loop\'s still going.', 'You\'ve got a face like a B-side. Let Mama fix that.', 'Every street has a rhythm. Mine has a family.'],
  barks: ['Again! From the top!', 'Round and round, sugar.', 'The loop ALWAYS comes back.', 'Kids! Bring the rats!']
});
defNpc('loop_stomp', 'loop_rats', 'enforcer', 'busker_alley', 'Stomp', 'Spring-Heeled Bouncer', {
  blurb: 'A tap-dancing bruiser in spring-heeled boots. Taps once for "welcome", twice for "leave", and you do not want to hear three.',
  greet: ['Tap. Tap-tap. That means "hi".', 'Alley\'s full. Unless Mama says it ain\'t.'],
  barks: ['Tappity-TAP!', 'Feel the floor, friend!', 'Double time!', 'One more for the loop!']
});
defNpc('loop_echo', 'loop_rats', 'grunt', 'crosswalk', 'Echo', 'Megaphone Kid', {
  blurb: 'A kid with headphones bigger than their head and a megaphone held together with stickers. Repeats your last word. Loudly. Forever.',
  greet: ['HEY! ...hey! ...hey!', 'You lost? LOST? LOST?', 'Wanna hear my new loop? LOOP? LOOP?'],
  barks: ['AGAIN! AGAIN!', 'Louder! LOUDER!', 'Say that again! AGAIN!', 'Hehehe, heh, heh.']
});
defNpc('loop_tape', 'loop_rats', 'grunt', 'crosswalk', 'Tape Worm', 'Cassette Hoarder', {
  blurb: 'Wrapped in a scarf made entirely of unspooled cassette tape. Has every bootleg ever recorded. Will not lend you any of them.',
  greet: ['Shh, I\'m recording. ...Okay, I\'m always recording.', 'Got a B-side for me? No? Then what\'re you for?'],
  barks: ['Rewind that!', 'Spooled ya!', 'Side B, baby!', 'I\'ve got this on tape.']
});
defNpc('loop_dotty', 'loop_rats', 'merchant', 'tape_market', 'Dotty Dub', 'Pedal Merchant', {
  shop: true,
  blurb: 'Goggles up, tool belt jangling, a pedal for every mood. Dotty can make a kazoo sound like a cathedral and charge you like it is one.',
  greet: ['Welcome to Dotty\'s! Everything clicks, nothing refunds.', 'Fresh pedals, warm tapes, rats not for sale. Mostly.', 'Need a delay? I\'ve got delays. Need a delay? I\'ve got delays.'],
  barks: ['Click it! Stomp it! Pay for it!', 'That\'s a vintage fuzz, sweetie.', 'Dub it up!']
});
// --- Gloss Suits
defNpc('gloss_sheen', 'gloss', 'boss', 'label_tower', 'Madame Sheen', 'Label Matriarch', {
  blurb: 'Pearl bob, chrome sunglasses, a pink coat that costs more than your street. She has signed every star in the Quarter and owns half their songs.',
  greet: ['Darling. You\'re late. You\'re always late. It\'s charming, for now.', 'I\'ve read your file. It\'s short. Let\'s make it longer.'],
  barks: ['Everyone has a price, darling.', 'Let\'s talk percentages.', 'My lawyers will be in touch.', 'Shine or be shined upon.']
});
defNpc('gloss_mute', 'gloss', 'enforcer', 'label_tower', 'Mr. Mute', 'Head of Quiet Compliance', {
  blurb: 'Very tall, very suited, mouth sealed behind a permanent chrome smile. Communicates entirely in raised eyebrows and invoices.',
  greet: ['...', '(He slides you a business card. It just says "No.")'],
  barks: ['...', '(adjusts cufflinks menacingly)', '(points at the fine print)', '(the smile widens)']
});
defNpc('gloss_tune', 'gloss', 'grunt', 'velvet_lounge', 'Agent Autotune', 'Pitch-Perfect Talent Scout', {
  blurb: 'Slick quiff, earpiece, a smirk tuned to exactly 440Hz. Can make anything sound like a hit, including threats.',
  greet: ['Babe! Love the energy. Hate the look. We\'ll fix it in post.', 'You\'ve got star quality. Unfortunately it\'s a very small star.'],
  barks: ['We\'ll fix it in post!', 'Love it, babe, change everything.', 'Pitch correction incoming!', 'That\'s a hit, sign here.']
});
defNpc('gloss_ivy', 'gloss', 'grunt', 'velvet_lounge', 'Intern Ivy', 'Unpaid Intern (Year 4)', {
  blurb: 'Nervous, caffeinated, buried under a clipboard and eleven lanyards. Knows where every body is filed. Alphabetically.',
  greet: ['Oh! Hi! Are you on the list? Please be on the list.', 'I\'m not supposed to talk to talent. Or anyone. Hi.'],
  barks: ['That\'s against policy! Probably!', 'I\'ll tell Madame Sheen! ...Please don\'t make me.', 'Form 7B! You need form 7B!', 'Sorry! Sorry! (not sorry)']
});
defNpc('gloss_sol', 'gloss', 'fixer', 'contract_kiosk', 'Sleek Sol', 'Contract Salesman', {
  shop: true,
  blurb: 'Pearl cufflinks, a smile like a closing deal. Sol sells opportunities, exposure and, if you squint, actual cards.',
  greet: ['Friend! Have I got an opportunity for you.', 'Sign nothing, buy something, everyone wins.', 'Today only: everything is today only.'],
  barks: ['Read the fine print? Nobody does.', 'That\'s a limited offer!', 'Let\'s circle back to me winning.']
});
// --- Bass Cartel
defNpc('cartel_sub', 'bass_cartel', 'boss', 'sub_basement', 'Big Sub', 'The Low End Himself', {
  blurb: 'Enormous, unhurried, wearing a necklace of speaker cones. When Big Sub laughs, car alarms go off three streets away.',
  greet: ['Mmmmmm. You feel that? That\'s me, saying hello.', 'Sit. The sofa vibrates. That\'s normal.'],
  barks: ['Feel it in your CHEST.', 'Lower. LOWER.', 'Wait for the drop...', 'BOOOOM.']
});
defNpc('cartel_drop', 'bass_cartel', 'enforcer', 'sub_basement', 'Drop', 'Always About To...', {
  blurb: 'Hood up, finger on an invisible fader, permanently ten seconds from the drop. When it finally comes, so do you. Down.',
  greet: ['Not yet. Not yet. ...not yet.', 'You\'re standing on the drop zone.'],
  barks: ['Here it comes...', 'Waaaait for it...', 'DROP!', 'Build-up, build-up, build-up...']
});
defNpc('cartel_kick', 'bass_cartel', 'grunt', 'club_woofer', 'Kick', 'Twin on the One', {
  blurb: 'One half of the door twins. Wears a kick-drum belt buckle and hits on the one. Every time. Without fail.',
  greet: ['ONE. That\'s my count. What\'s yours?', 'Queue\'s that way. The other way is me.'],
  barks: ['ON THE ONE!', 'Boom. Boom. Boom.', 'Four on the floor, you on the floor!']
});
defNpc('cartel_snare', 'bass_cartel', 'grunt', 'club_woofer', 'Snare', 'Twin on the Two and Four', {
  nightOnly: true,
  blurb: 'The other twin, snare drum for a hat, only clocks in after dark. Fast hands, faster mouth, never misses the backbeat.',
  greet: ['Two and four, baby, two and four.', 'Kick\'s the muscle. I\'m the crack.'],
  barks: ['CRACK!', 'Backbeat\'s on you!', 'Rimshot!', 'Two! And! Four!']
});
defNpc('cartel_wanda', 'bass_cartel', 'merchant', 'speaker_depot', 'Woofer Wanda', 'Speaker Stall Legend', {
  shop: true,
  blurb: 'Cone-speaker earrings, ear defenders as a fashion statement. Wanda tests every speaker at full blast and haggles at full volume too.',
  greet: ['WHAT? OH, A CUSTOMER! WELCOME!', 'EVERYTHING HERE GOES TO ELEVEN! SOME GO TO TWELVE!'],
  barks: ['TURN IT UP!', 'THAT\'S A BARGAIN AT THIS VOLUME!', 'FEEL THAT BASS?!']
});
// --- Static Choir
defNpc('choir_hush', 'static_choir', 'boss', 'hush_chapel', 'The Hush', 'Voice of No Voice', {
  blurb: 'A tall hooded figure whose face is a window of grey static. The Hush has never spoken. Everyone has heard it anyway.',
  greet: ['(the static flickers into something like a smile)', '...shhhhhhhh...'],
  barks: ['shhhhhhhhh', '(the static grows LOUDER, somehow quieter)', '...no more songs...', '(silence, but heavy)']
});
defNpc('choir_crackle', 'static_choir', 'enforcer', 'hush_chapel', 'Cantor Crackle', 'Keeper of the Static', {
  blurb: 'A robe that sparks with static every time he moves. Leads the choir in its one long note and zaps anyone who sings a second one.',
  greet: ['Hssss. A new voice. How... unfortunate.', 'Lower your volume. Lower your eyes.'],
  barks: ['Hsssssst!', 'Bzzzt. Be still.', 'The static hears you.', 'One note. Only one.']
});
defNpc('choir_fuzz', 'static_choir', 'grunt', 'choir_steps', 'Choirboy Fuzz', 'Fuzzy Little Acolyte', {
  blurb: 'Fuzzy-haired kid in a robe three sizes too big. Takes the vow of silence very seriously, except when giggling.',
  greet: ['Shh! ...hehe. Shh!', 'I\'m not allowed to talk to you. ...What\'s your name?'],
  barks: ['Shhh! Shhhh!', 'Bzzzz!', 'Hehe, gotcha.', 'Brother Crackle says no!']
});
defNpc('choir_whisper', 'static_choir', 'grunt', 'choir_steps', 'Sister Whisper', 'Librarian of Silence', {
  nightOnly: true,
  blurb: 'A veil, a finger to her lips and a stare that unplugs amps. Comes out at night to shush the streets one by one.',
  greet: ['(finger to lips)', 'Speak softly. Or better, not at all.'],
  barks: ['shh.', '...hush now...', 'Quiet, little noise.', 'You\'re far too loud.']
});
defNpc('choir_reverb', 'static_choir', 'fixer', 'echo_cellar', 'Brother Reverb', 'The Echo That Laughs', {
  blurb: 'Round, kind and impossible to say goodbye to: his laugh echoes for minutes. The friendliest member of a very unfriendly choir.',
  greet: ['Ho ho ho... ho... ho... Welcome, welcome, welcome!', 'Pull up a candle! Ho... ho...'],
  barks: ['Ho ho ho... ho...', 'Gently now... now... now...', 'Bless your noise... noise...']
});
// --- Scrap Kings
defNpc('scrap_cassette', 'scrap_kings', 'boss', 'scrapyard', 'King Cassette', 'Monarch of the Mixtape Heap', {
  blurb: 'Wears a crown made of tape reels and royal overalls patched with gig flyers. Rules the scrapyard from a throne of dead amps.',
  greet: ['Kneel! ...Nah, just kidding, mind the oil. Welcome to my kingdom.', 'Everything here was rubbish once. Including me!'],
  barks: ['By royal decree, LOUDER!', 'Fire up the drones!', 'Long live the remix!', 'Crank it to the crown!']
});
defNpc('scrap_hammer', 'scrap_kings', 'enforcer', 'scrapyard', 'Jack Hammer', 'Yard Foreman', {
  blurb: 'Broad as a fridge, goggles up, sledgehammer over one shoulder. Hammers out dents, deals and the occasional visitor.',
  greet: ['Hard hats past this point. You got a hard head? Good.', 'Yard\'s open. Hands where I can see \'em.'],
  barks: ['CLANG!', 'Measure twice, smash once!', 'Ratchet up!', 'Built to last, you ain\'t!']
});
defNpc('scrap_weld', 'scrap_kings', 'grunt', 'rust_bridge', 'Weld', 'Mask-Down Welder', {
  blurb: 'Never lifts the mask. Nobody knows what Weld looks like. Fixes the bridge with one hand and waves hello with a blowtorch.',
  greet: ['(the blowtorch waves hello)', 'Mmf. Bridge is fine. Bridge is always fine.'],
  barks: ['Pssssshhhh!', 'Hold still, I\'ll patch you.', 'Sparks flying!', 'Hot hot HOT.']
});
defNpc('scrap_sparks', 'scrap_kings', 'grunt', 'rust_bridge', 'Sparks', 'Live-Wire Mechanic', {
  blurb: 'Wiry, grinning, wires braided into her hair. Builds drones out of toasters, which explains why they smell of breakfast.',
  greet: ['Oh! Wanna see my new drone? It only explodes sometimes!', 'Hold this wire. No, the OTHER wire.'],
  barks: ['Go go gadget toaster!', 'Bzzt! Oops.', 'Drones, assemble!', 'Short circuit, long fun!']
});
defNpc('scrap_carla', 'scrap_kings', 'merchant', 'junk_cafe', 'Cog Carla', 'Parts Dealer', {
  shop: true,
  blurb: 'Runs the parts counter at the Junk Cafe with a mechanical arm that pours coffee and pockets change. Fair prices, unfair arm-wrestling.',
  greet: ['Coffee\'s free. Parts aren\'t. Arm-wrestling is a fiver.', 'Bring me junk, I\'ll bring you jams.'],
  barks: ['Every bolt has a price!', 'Torque you later!', 'Grease is the word.']
});
// --- neutral
NPCS.jordan = {
  id: 'jordan', name: 'Jordan', crew: 'neutral', role: 'merchant', title: 'Merch Designer', venue: 'home_studio', rj: 'jordan', enemy: null,
  shop: false, nightOnly: false,
  blurb: 'Your merch designer and the only person in the Quarter who answers texts. Jordan prints totes, tees and "Favours": friendly faces who owe you one.',
  greet: ['Totes amazing to see you. Get it? TOTES.', 'New designs on the line. Also: you look tired.', 'Who are we befriending today?'],
  barks: ['Merch is love, merch is life.', 'Fresh off the press!', 'That colourway slaps.']
};
const NPC_IDS = Object.keys(NPCS);

// ---------------------------------------------------------------- argument templates per crew (negotiation)
Object.assign(ARGS, {
  loop_hook: { name: 'Earworm', kind: 'pressure', n: 2, resolve: 5, icon: 'mouth', desc: 'A catchy hook. Pressures you for 2 each turn, and they love to stack them.' },
  gloss_fineprint: { name: 'Fine Print', kind: 'fort', n: 3, resolve: 9, icon: 'cards', desc: 'Gives their core 3 Composure each turn. Read it. Nobody reads it.' },
  gloss_sweetener: { name: 'Sweetener', kind: 'mend', n: 3, resolve: 7, icon: 'coin', desc: 'A juicy counter-offer. Restores 3 of their core Resolve each turn.' },
  cartel_drop: { name: 'Bass Drop', kind: 'pressure', n: 5, resolve: 8, icon: 'quake', desc: 'Rattles your ribcage. Pressures you for 5 each turn.' },
  choir_hush: { name: 'The Hush', kind: 'doubt', n: 1, resolve: 7, icon: 'eye', desc: 'Adds 1 Doubt to your deck each turn. Shhhh.' },
  choir_static: { name: 'Static', kind: 'pressure', n: 2, resolve: 6, icon: 'smoke', desc: 'A low hiss under everything. Pressures you for 2 each turn.' },
  scrap_rig: { name: 'Jury Rig', kind: 'fort', n: 4, resolve: 9, icon: 'gear', desc: 'Bolts on armour. Gives their core 4 Composure each turn.' },
  scrap_patch: { name: 'Patch Job', kind: 'mend', n: 2, resolve: 6, icon: 'anvil', desc: 'Duct tape and optimism. Restores 2 of their core Resolve each turn.' }
});

// ---------------------------------------------------------------- crew kits (enemy flavour per crew)
const CREW_KIT = {
  loop_rats: { coreMul: 1, talkMoves: [3, 3, 5], args: ['loop_hook', 'loop_hook', 'threat'], minion: 'loop_ratling', scaleMul: 1 },
  gloss: { coreMul: 1.3, talkMoves: [4, 3, 4], args: ['gloss_fineprint', 'gloss_sweetener', 'excuse'], minion: 'gloss_lawyer', scaleMul: 1 },
  bass_cartel: { coreMul: 1.1, talkMoves: [6, 4, 8], args: ['cartel_drop', 'wall'], minion: 'cartel_woofer', scaleMul: 1.04 },
  static_choir: { coreMul: 1, talkMoves: [3, 5, 4], args: ['choir_hush', 'choir_static', 'excuse'], minion: 'choir_novice', scaleMul: 1 },
  scrap_kings: { coreMul: 1.1, talkMoves: [4, 4, 6], args: ['scrap_rig', 'scrap_patch', 'threat'], minion: 'scrap_drone', scaleMul: 1 }
};
const ROLE_KIT = {
  grunt: { core: 22, talkMul: 1, max: 2, gold: 14, scale: 1 },
  merchant: { core: 26, talkMul: 1, max: 2, gold: 18, scale: 1 },
  fixer: { core: 26, talkMul: 1, max: 2, gold: 18, scale: 1 },
  enforcer: { core: 40, talkMul: 1.25, max: 3, gold: 40, scale: 1.14 },
  boss: { core: 60, talkMul: 1.5, max: 3, gold: 90, scale: 1.26 }
};
// crew minions (procedural figures, no talking): pets / summons / ambush padding
Object.assign(ENEMIES, {
  loop_ratling: { name: 'Loop Rat', hp: [9, 12], spec: { kind: 'beast', coat: '#8a9a68', accent: '#6cc22e', scale: .55, seed: 161 }, moves: [A(3, 2), A(5), BUF('str', 1)], mode: 'rand', gold: 3, minion: 1 },
  gloss_lawyer: { name: 'Gloss Lawyer', hp: [22, 26], spec: { kind: 'human', skin: '#e8c19a', coat: '#f4b6e0', accent: '#b4689a', hat: 'hair', hatCol: '#3a2a20', weapon: 'cane', face: 'grin', build: .95, seed: 162 }, moves: [BLK(7), DEB('weak', 1, 5), A(7)], mode: 'cycle', gold: 10, minion: 1 },
  cartel_woofer: { name: 'Walking Woofer', hp: [24, 28], spec: { kind: 'bot', coat: '#7a45b0', eye: '#d6bdf0', seed: 163, scale: .9 }, moves: [A(9), BLK(8), A(6)], mode: 'cycle', gold: 10, minion: 1 },
  choir_novice: { name: 'Hooded Novice', hp: [18, 22], spec: { kind: 'human', skin: '#d6b896', coat: '#8fa3a8', accent: '#3fd8e8', hat: 'hood', hatCol: '#5d6e74', weapon: 'cane', face: 'sad', build: .9, seed: 164 }, moves: [DEB('weak', 1, 3), A(6), DEB('vuln', 1, 3)], mode: 'cycle', gold: 8, minion: 1 },
  scrap_drone: { name: 'Toaster Drone', hp: [14, 18], spec: { kind: 'bot', coat: '#ff8a2a', eye: '#ffd6ad', seed: 165, scale: .7 }, moves: [A(5), BLK(6), A(4, 2)], mode: 'cycle', gold: 6, minion: 1 }
});

// ---------------------------------------------------------------- NPC enemies (battle moves are crew-distinct)
const NPC_MOVES = {
  // Loop Rats: repeats, stacking Strength, rat pets
  loop_mama: { hp: [92, 100], moves: [SUM('loop_ratling'), A(5, 2), BUF('str', 2), A(5, 3), SUM('loop_ratling'), A(6, 3), A(14)] },
  loop_stomp: { hp: [60, 66], moves: [A(4, 2), BUF('str', 2), A(4, 3), SUM('loop_ratling'), A(4, 3), BLK(8)] },
  loop_echo: { hp: [28, 32], moves: [A(3, 2), A(3, 2), BUF('str', 1), A(3, 3)] },
  loop_tape: { hp: [30, 34], moves: [BUF('str', 1), A(5), BUF('str', 1), A(4, 2)] },
  loop_dotty: { hp: [30, 34], moves: [A(4, 2), BUF('str', 1), A(4, 2), BLK(6)] },
  // Gloss: Block, Weak, slow grind
  gloss_sheen: { hp: [90, 98], moves: [DEB('weak', 2, 8), BLK(16), A(15), HEALM(10), A(7, 2), BUF('str', 2), A(18)] },
  gloss_mute: { hp: [62, 68], moves: [BLK(12), DEB('weak', 2, 8), A(12), BLK(10), A(6, 2)] },
  gloss_tune: { hp: [30, 34], moves: [DEB('weak', 1, 6), BLK(8), A(8)] },
  gloss_ivy: { hp: [26, 30], moves: [BLK(7), A(6), DEB('weak', 1, 4)] },
  gloss_sol: { hp: [30, 34], moves: [BLK(7), A(7), DEB('weak', 1, 4)] },
  // Bass Cartel: big hits, Strength, Block
  cartel_sub: { hp: [96, 104], moves: [BUF('str', 2), A(15), BLK(16), A(8, 3), A(24)] },
  cartel_drop: { hp: [62, 68], moves: [BLK(10), BUF('str', 2), A(17), A(7, 2)] },
  cartel_kick: { hp: [32, 36], moves: [A(10), BLK(6), A(11)] },
  cartel_snare: { hp: [28, 32], moves: [A(3, 3), BUF('str', 1), A(9)] },
  cartel_wanda: { hp: [32, 36], moves: [A(9), BLK(8), BUF('str', 1)] },
  // Static Choir: Weak / Vulnerable debuffs
  choir_hush: { hp: [90, 98], moves: [DEB('weak', 2, 0), DEB('vuln', 2, 9), A(12), A(5, 3), HEALM(12), DEB('weak', 2, 10), A(20)] },
  choir_crackle: { hp: [58, 64], moves: [DEB('vuln', 2, 6), A(10), DEB('weak', 2, 6), A(4, 3), BLK(10)] },
  choir_fuzz: { hp: [26, 30], moves: [DEB('vuln', 2, 4), A(6), DEB('weak', 1, 5)] },
  choir_whisper: { hp: [28, 32], moves: [DEB('weak', 2, 0), A(8), DEB('vuln', 1, 6)] },
  choir_reverb: { hp: [32, 36], moves: [A(6), DEB('vuln', 1, 4), HEALM(6)] },
  // Scrap Kings: plating/block/heal + drones
  scrap_cassette: { hp: [92, 100], moves: [SUM('scrap_drone'), BUF('plating', 3), BLK(14), A(14), HEALM(12), A(8, 2), A(20)] },
  scrap_hammer: { hp: [62, 68], moves: [BUF('plating', 2), BLK(10), A(14), SUM('scrap_drone'), HEALM(8), A(7, 2)] },
  scrap_weld: { hp: [30, 34], moves: [BLK(8), A(7), HEALM(6)] },
  scrap_sparks: { hp: [26, 30], moves: [SUM('scrap_drone'), A(6), BLK(6)] },
  scrap_carla: { hp: [32, 36], moves: [BLK(8), A(8), HEALM(5)] }
};
const NPC_SCALE = { loop_mama: 1.24, gloss_sheen: 1.22, cartel_sub: 1.3, choir_hush: 1.28, scrap_cassette: 1.24, loop_echo: .92, gloss_ivy: .94, choir_fuzz: .9 };
(function buildNpcEnemies() {
  for (const id in NPC_MOVES) {
    const n = NPCS[id], m = NPC_MOVES[id], kit = CREW_KIT[n.crew], rk = ROLE_KIT[n.role], cr = CREWS[n.crew];
    ENEMIES[id] = {
      name: n.name, hp: m.hp, npc: id, crew: n.crew, role: n.role,
      spec: { kind: 'rj', rj: n.rj, scale: NPC_SCALE[id] || rk.scale * kit.scaleMul, coat: cr.color, accent: cr.colorDark, seed: id.length * 7 },
      moves: m.moves, mode: 'cycle', gold: rk.gold,
      elite: n.role === 'enforcer' ? 1 : 0, boss: n.role === 'boss' ? 1 : 0,
      talk: {
        core: Math.round(rk.core * kit.coreMul), name: n.name, moves: kit.talkMoves.map(v => Math.round(v * rk.talkMul)),
        max: rk.max, args: kit.args.slice(), barks: n.barks.slice()
      }
    };
  }
  // act 2 variants: same people, crews escalate (+40% HP & damage). Talk pressure/arguments are already scaled by NegotiationScene.
  const M = 1.4, sc = v => Math.round(v * M);
  for (const id of Object.keys(ENEMIES)) {
    const d = ENEMIES[id]; if (!(d.npc || d.minion)) continue;
    const e = Object.assign({}, d, { act2: 1, base: id, hp: [sc(d.hp[0]), sc(d.hp[1])], gold: Math.round(d.gold * 1.3) });
    e.moves = d.moves.map(mv => {
      const q = Object.assign({}, mv);
      if (q.t === 'atk' || q.t === 'blk' || q.t === 'heal') q.n = sc(q.n);
      if (q.t === 'deb' && q.dmg) q.dmg = sc(q.dmg);
      if (q.t === 'sum') q.id = q.id + '_a2';
      return q;
    });
    if (d.talk) e.talk = Object.assign({}, d.talk, { core: sc(d.talk.core) });
    ENEMIES[id + '_a2'] = e;
  }
})();

// ---------------------------------------------------------------- Favour cards (battle + talk) per crew style
const FAVOUR_STYLE = {
  loop_rats: { act: 'loop', n: 4, h: 2, arg: { kind: 'inf', n: 2 }, icon: 'mouth', bt: (nm, v) => `Favour: ${nm} jumps in behind you for 3 turns, hitting a random enemy for ${v.n} ${v.h} times each turn. Exhaust.`, tt: (nm, v) => `Favour: ${nm} hypes the room. Argument: Deal ${v.n} Influence each turn for 3 turns.` },
  gloss: { act: 'shield', blk: 7, weak: 1, arg: { kind: 'comp', n: 5 }, icon: 'coin', bt: (nm, v) => `Favour: ${nm} jumps in for 3 turns: you gain ${v.blk} Block and a random enemy gets ${v.weak} Weak each turn. Exhaust.`, tt: (nm, v) => `Favour: ${nm} reads the fine print for you. Argument: Gain ${v.n} Composure each turn for 3 turns.` },
  bass_cartel: { act: 'hit', n: 10, arg: { kind: 'inf', n: 4 }, icon: 'quake', bt: (nm, v) => `Favour: ${nm} jumps in for 3 turns and drops a ${v.n} damage hit on a random enemy each turn. Exhaust.`, tt: (nm, v) => `Favour: ${nm} leans on the table. Argument: Deal ${v.n} Influence each turn for 3 turns.` },
  static_choir: { act: 'hex', weak: 1, vuln: 1, n: 3, arg: { kind: 'hush', n: 4 }, icon: 'eye', bt: (nm, v) => `Favour: ${nm} hums for 3 turns: deal ${v.n} damage to ALL enemies and apply ${v.weak} Weak and ${v.vuln} Vulnerable to ALL. Exhaust.`, tt: (nm, v) => `Favour: ${nm} shushes them. Argument: their pressure is ${v.n} weaker each turn for 3 turns.` },
  scrap_kings: { act: 'patch', blk: 5, heal: 4, arg: { kind: 'comp', n: 4 }, icon: 'gear', bt: (nm, v) => `Favour: ${nm} jumps in for 3 turns: you gain ${v.blk} Block and heal ${v.heal} HP each turn. Exhaust.`, tt: (nm, v) => `Favour: ${nm} bolts armour onto your argument. Argument: Gain ${v.n} Composure each turn for 3 turns.` },
  neutral: { act: 'patch', blk: 3, heal: 5, arg: { kind: 'draw', n: 1 }, icon: 'heart', bt: (nm, v) => `Favour: ${nm} hands you a tote of snacks for 3 turns: gain ${v.blk} Block and heal ${v.heal} HP each turn. Exhaust.`, tt: (nm, v) => `Favour: ${nm} cheers from the back. Argument: Draw ${v.n} extra card each turn for 3 turns.` }
};
function favourStats(npcId) {
  const n = NPCS[npcId], st = FAVOUR_STYLE[n.crew] || FAVOUR_STYLE.neutral, k = n.role === 'boss' ? 1.5 : n.role === 'enforcer' ? 1.25 : 1;
  const v = {}; for (const key of ['n', 'blk', 'heal']) if (st[key] != null) v[key] = Math.round(st[key] * k);
  v.h = st.h || 1; v.weak = (st.weak || 0) + (n.role === 'boss' ? 1 : 0); v.vuln = (st.vuln || 0) + (n.role === 'boss' ? 1 : 0);
  if (st.act === 'hex') v.n = Math.round(st.n * k);
  const arg = Object.assign({}, st.arg); arg.n = arg.kind === 'draw' ? arg.n : Math.round(arg.n * k);
  return { act: st.act, v, arg, icon: st.icon, style: st };
}
const FAVOUR_NPCS = NPC_IDS.filter(id => ['boss', 'enforcer', 'merchant', 'fixer'].includes(NPCS[id].role));
(function buildFavourCards() {
  for (const id of FAVOUR_NPCS) {
    const n = NPCS[id], f = favourStats(id), nm = n.name;
    BC['favour_' + id] = {
      id: 'favour_' + id, name: nm, cost: 2, rarity: 'special', cls: 'favour', art: f.icon, kind: 'b', type: 'skl', upg: {},
      special: 'ally', ally: id, exhaust: 1, tg: 'self', favour: 1, crew: n.crew, text: f.style.bt(nm, f.v)
    };
    // talk twin needs its own id: cd() resolves BC before NC, so a shared id would always read the battle card
    NC['favour_' + id + '_t'] = {
      id: 'favour_' + id + '_t', name: nm, cost: 1, rarity: 'special', cls: 'favour', art: f.icon, kind: 'n', type: 'n', upg: {},
      tg: 'self', favour: 1, ally: id, crew: n.crew,
      arg: { name: nm.split(' ').slice(-1)[0], kind: f.arg.kind, n: f.arg.n, turns: 3, life: 3, icon: f.icon, favour: id }, text: f.style.tt(nm, f.arg)
    };
  }
})();

// ---------------------------------------------------------------- Bonded crew grafts (one per crew, granted once)
const CREW_GRAFT = { loop_rats: 'loop_pedal', gloss: 'gold_clause', bass_cartel: 'sub_chain', static_choir: 'hush_veil', scrap_kings: 'tin_crown' };
Object.assign(GRAFTS, {
  loop_pedal: { name: 'Mama\'s Loop Pedal', icon: 'mouth', desc: 'Start battles with 1 Strength. Every 3rd turn, gain 1 more.', cost: 999, crew: 'loop_rats' },
  gold_clause: { name: 'Gold Clause', icon: 'coin', desc: '+30% shil from rewards. Start negotiations with 6 Composure.', cost: 999, crew: 'gloss' },
  sub_chain: { name: 'Speaker Chain', icon: 'quake', desc: 'Start battles with 8 Block. Gain 2 Block at the start of every turn.', cost: 999, crew: 'bass_cartel' },
  hush_veil: { name: 'Hush Veil', icon: 'eye', desc: 'At the start of each battle, apply 1 Weak and 1 Vulnerable to ALL enemies.', cost: 999, crew: 'static_choir' },
  tin_crown: { name: 'Tin Crown', icon: 'crown', desc: 'Start battles with 2 Plating. Heal 4 HP after each battle.', cost: 999, crew: 'scrap_kings' }
});

// ---------------------------------------------------------------- requests
function _vn(id) { return (VENUES[id] && VENUES[id].name) || id; }
function _nn(id) { return (NPCS[id] && NPCS[id].name) || id; }
const REQUEST_TYPES = {
  silence: { id: 'silence', label: 'Silence', icon: 'mouth', describe: r => `${_nn(r.target)} has been mouthing off at ${_vn(r.venue)}. Beat them or talk them down, your call. Due Day ${r.deadline}.` },
  deliver: { id: 'deliver', label: 'Delivery', icon: 'chest', describe: r => `Carry a mystery parcel (it hums) from ${_nn(r.giver)} to ${_vn(r.venue)}. Don't open it. Due Day ${r.deadline}.` },
  favour: { id: 'favour', label: 'Spot Me', icon: 'coin', describe: r => `${_nn(r.giver)} is a little short this week. Hand over ${r.cost} shil and they\'ll owe you big. Due Day ${r.deadline}.` },
  turf: { id: 'turf', label: 'Turf Grab', icon: 'crown', describe: r => `Beat (or talk down) the Enforcer of ${_vn(r.venue)} so it flips to ${CREWS[r.crew] ? CREWS[r.crew].short : 'your friends'}. Due Day ${r.deadline}.` },
  scout: { id: 'scout', label: 'Scouting', icon: 'eye', describe: r => `Go and listen at ${_vn(r.venues[0])} and ${_vn(r.venues[1])}, then report back with the gossip. Due Day ${r.deadline}.` }
};
const REQUEST_FLAVOUR = {
  loop_rats: ['"Do this and you\'re family. Family gets the good snacks."', '"Mama says it\'s important. Mama\'s always right."'],
  gloss: ['"Consider it an internship. A paid one, even. Gasp."', '"Discretion, darling. It\'s in the contract you didn\'t read."'],
  bass_cartel: ['"Do it quiet. Then do it LOUD."', '"Big Sub remembers who shows up."'],
  static_choir: ['"Gently, child. Gently... gently..."', '"The Hush notices helpful silence."'],
  scrap_kings: ['"Fix this and we\'ll fix you something shiny."', '"King\'s orders! ...King\'s polite request!"'],
  neutral: ['"You\'d be helping the merch table, which is basically helping art."']
};

// ---------------------------------------------------------------- Street Buzz
const RUMORS = {
  turfFlip: [
    '{crew} painted {venue} in their colours overnight. Fresh tags everywhere.',
    'Overnight turf war! {crew} now run {venue}.',
    'Word is {crew} just bought out {venue}. With cash, or with fists? Both.',
    '{venue} has a new sound system and a new owner: {crew}.'
  ],
  standingUp: [
    '{crew} are saying nice things about you. Suspiciously nice.',
    'Your name came up at a {crew} jam. In a GOOD way.',
    '{npc} has been telling everyone you\'re alright.',
    '{crew} raised a glass to you last night. Mostly lemonade.'
  ],
  standingDown: [
    '{crew} are keeping a list. You\'re on it.',
    '{npc} has been sketching your face on a dartboard.',
    'Heard {crew} are sore about you. Watch the side streets.',
    '{crew} put your poster up. Not the nice kind of poster.'
  ],
  bounty: [
    '{npc} is out hunting you tonight. {crew} want an apology. In bruises.',
    'Bounty posters with your face just went up all over {crew} turf.'
  ],
  idle: [
    'Rumour: someone saw Big Sub stand up. Nobody believes it.',
    'The Static Choir held a silent disco. Nobody could tell if it started.',
    'Dotty Dub swears a rat ate a delay pedal and now it echoes.',
    'Madame Sheen bought a new pair of sunglasses. For her other sunglasses.',
    'King Cassette declared Tuesday a national holiday. It\'s Thursday.',
    'Echo has been repeating the weather forecast. The weather is repeating too.',
    'Jordan\'s new tote design sold out in four minutes. Two of those were Jordan.',
    'Someone keeps looping a pigeon sample at the Crosswalk. It\'s actually a banger.',
    'Rust Bridge caught fire again. Weld says "it\'s fine". It\'s fine.',
    'The Headliner Night poster went up. Every crew tore off a corner.'
  ],
  act2: [
    'Act two. The crews remixed themselves overnight: louder, meaner, shinier.',
    'Headliner Night made you famous. Everyone wants a piece of you now.'
  ],
  contested: ['{venue} is up for grabs. Banners everywhere, nobody in charge.']
};

// ---------------------------------------------------------------- small data helpers
function crewName(id, act) { const c = CREWS[id]; if (!c) return id === 'none' ? 'Nobody' : id === 'contested' ? 'Contested' : 'Neutral'; return act === 2 ? c.name2 : c.name; }
function crewOf(npcId) { return NPCS[npcId] ? NPCS[npcId].crew : 'neutral'; }
function crewMember(crew, role) { return NPC_IDS.filter(id => NPCS[id].crew === crew && (!role || NPCS[id].role === role)); }
