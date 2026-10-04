# HOCUS VOCUS: the bible (world, cast, glossary, copy rules)

Status: BIBLE rev 1 (agent A). Every other plan file (`HV_*.md`) copies its names from this one. If another plan file and this
bible disagree, this bible wins: fix the other file to the word here and say so in the PR body. Every internal id stays (rule H1 in
section 6); only player-facing words, art and sound change.

How to read it: sections 1 to 3 are the world (read once), section 4 is the glossary (look words up, copy them verbatim), section 5 is
the exact UI copy, section 6 is the hard-rules checklist critics use, section 7 holds the owners' extras (skins, links, samples).

## 0. Decisions at a glance

| # | Decision | Hocus Vocus choice (use this) | Echowake had | Why |
|---|---|---|---|---|
| HV-D1 | Title lockup | **HOCUS VOCUS**, subtitle **A Vocal Magic Adventure**, tagline **beatboxing and vocal magic**; document title `HOCUS VOCUS: A Vocal Magic Adventure`; mixed case in prose `Hocus Vocus` | ECHOWAKE, a rogue ballad | owners |
| HV-D2 | The world | **the Soundlands** (always "the Soundlands", plural verb: "the Soundlands are") | the land | a world where real voices are magic |
| HV-D3 | The antagonist force | **the Gloss** (always "the Gloss", capital G) | the Hush | the "Human" theme: perfect, polished, filtered, samey, and so, silent |
| HV-D4 | Map resource | **Vox** (uncountable: "1 Vox", "7 Vox", never "Voxes") | Echo | the magic in a real voice; 3 letters fit every meter |
| HV-D5 | Waking a hex | verb **unmute**; fog is **muted** ("Muted ground"); revealed is **live** ("live hex", "34% live"); a landmark seen in fog is **spotted** | wake, silent, awake, heard | the Gloss puts the world on mute; a real voice turns it back on, live |
| HV-D6 | One-use map shapes | **Spells**: you *learn* a Spell and *cast* it. Boots and Cats, Vocal Run, Air Horn, Abracadabass, Surround Sound, Hocus Focus | Songs (Drum Line, Ripple, Shout, Beat Drop, Chorus, Hum) | vocal magic, hocus pocus puns |
| HV-D7 | Act unit | **Act** (`Act I`, `Act II`, `Act III`; "the first act"; kicker `ACT ONE`) | Verse | a show in three acts; a magic act |
| HV-D8 | A run | **tour** ("New Tour", "Start the Tour", "Your tour is saved") | journey | the duo go on tour across the Soundlands |
| HV-D9 | Relics | **Charms** (singular Charm) | Treasures | magic trinkets with passive power |
| HV-D10 | Meta currency | **Cheers** (always plural: "+52 Cheers") | Chimes | applause from real people, the opposite of the Gloss |
| HV-D11 | Meta hub | **the Tour Bus** (plaque `Tour Bus`, banner `The Tour Bus`, prose "on the Tour Bus") | the Hall of Echoes | the crew's home on the road: stickers, diary, photos |
| HV-D12 | Difficulty levels | **Encore 1 to 10** (plural Encores; level 0 is "No encore") | Tempo Trials | the crowd wants more, and harder |
| HV-D13 | Daily seed | **Daily Duet** | Daily Jam | every run is two heroes: a duet |
| HV-D14 | Energy | **Breath** ("3 Breath", "gain 1 Breath") | Energy | singers and beatboxers run on breath (allowed survivor, 6.4) |
| HV-D15 | HP | **HP** (unchanged) | HP | clarity |
| HV-D16 | Rows | **Lead** and **Backing** (the "lead spot" and the "backing spot"; card prefixes `Lead:` and `Backing:`) | Front row, Back row | lead vocal and backing track |
| HV-D17 | Enemy tiers | **Sidekick**, **Creature**, **Rival**, **Headliner** | Minion, Creature, Champion, Keeper | a show bill |
| HV-D18 | Event tile | **Detour** | Fable | a tour flavour word, clearly "something happens here" |
| HV-D19 | Achievements | **Stickers** (Jordan designs one for every feat) | achievements | the Tour Bus sticker wall |
| HV-D20 | Story pages | **the Tour Diary** (one page is "an entry") | Ballads | warm, personal |
| HV-D21 | Shared story pages | never name a hero: the party is any two of the four ("the duo" means whoever is on stage) | same rule | the narrative suite enforces it; hero names live in hero pages, barks, cards |
| HV-D22 | Internal ids | **keep every id** (hero ids `hanae kuro suzu raiga`, every card, enemy, relic, gem, event, achievement, trial, lore, status, keyword, brush, tile, op, hook, mod, stat, sfx, CSS class, save field, RNG stream key) | same policy | byte-identical bot results, saves load |
| HV-D23 | Hero colours | Jasmin pink, RoxorLoops green, RawClaw violet, Andy orange, Jordan teal (hex in 3.6) | four Echowake palettes | owners |
| HV-D24 | Owner song nods | "Arabic Impro" = `hanae_whirling_petals`; "Calling of the Moon" = `hanae_blade_duet` plus the Act II moonlit rooftop; "Human" = the finale (victory page title, `ch3_clear` sticker "Still Human", the last boss phase) | none | owners |

## 1. Pitch, title, tone and voice

### 1.1 Pitch (one breath)

In the Soundlands, real voices are magic: a sung note opens a blossom, a beatboxed kick makes a whole street bounce, a bass line rolls
a hill over in its sleep. Then the Gloss arrived, a polite, shimmering filter that only wants everyone to look and sound perfect, and
perfect things have nothing left to say. The Soundlands went on mute. Two real, imperfect voices pack the van and go on tour, unmuting
the world hex by hex with beatboxing and vocal magic: hocus vocus. Deck combat with a lead and a backing hero, a hex map you unmute
with Vox, Charms, gems, Detours, three Acts and three Headliners, and a finale built on one question: are we losing being human?

### 1.2 Title lockup

| Element | Exact text | Where |
|---|---|---|
| Logo | `HOCUS VOCUS` (two stacked words, HOCUS over VOCUS, 5 letters each) | title screen, boot splash, card back, share card, cover |
| Subtitle | `A Vocal Magic Adventure` | ribbon under the logo, document title |
| Tagline | `beatboxing and vocal magic` | small line under the subtitle (replaces `a rogue ballad` in `.mn-tag` and `.ph-sub`) |
| Document title | `HOCUS VOCUS: A Vocal Magic Adventure` | `<title>` |
| Screen-reader heading | `Hocus Vocus, a vocal magic adventure` | `.sr-only` h1 |
| Boot splash | `HOCUS VOCUS` | `#boot` |
| noscript | `Hocus Vocus needs JavaScript.` | index.html |

Logo art direction: chunky rounded chibi letters (the owners' own chibi cards are the style authority), cream letters with a thick
dark outline. The O of HOCUS is a pink cherry blossom (Jasmin, the owners' logo); the O of VOCUS is a green round microphone grille
(RoxorLoops). A microphone that is also a magic wand (a star on top, sparkles trailing) crosses behind the two words. Small musical
sparkles, never music-note characters in DATA strings (art may draw notes). "HOCUS VOCUS" is 10 letters plus a gap where ECHOWAKE was
8: every fixed-width title layout (card back, share card, boot splash) must be re-measured, and the stacked two-line form is the default
where width is tight.

### 1.3 Tone rules

1. Silly, warm and heartfelt, both at once. A joke every few lines, a lump in the throat at the end of each act.
2. Never mean, never crude. No insults that land on real people, no bodily humour, no swearing, no innuendo, no alcohol, no smoking.
3. Nobody dies. Enemies "fall quiet", "bow out", "are won over" or are "defeated"; heroes "lose their voice" and get it back. Never the
   words kill, die, dead, death, blood, gore, corpse in player text (ids like `blood_moon_vow` stay; their names change).
4. The Gloss is never evil. It is polite, helpful, glossy and wrong. It compliments everything ("Flawless!", "So clean!") and means it.
   Every Headliner is a music lover the Gloss got to first, and every one of them ends up singing along.
5. Social media is satire of the system (the feed, the filter, the algorithm, the scroll), never of fans, never of a real platform,
   real person or real post. Commenters are grumpy, not cruel; their insults are silly ("Mid.", "Who asked?"), never about bodies,
   looks or identity.
6. Imperfect is the hero word. A cracked note, a late kick, a wobble, a giggle mid-song: the game treats these as treasures.
7. Food appears as part of the scenery and is always plant-based (fruit, oats, beans, noodles, soup, smoothies, tea, rice). Nobody
   ever says so. No food is described as "vegan", "plant-based", "meat-free" or "healthy": it is just lunch.
8. Family friendly. A child and a grandparent should both laugh at the same line.

### 1.4 The VOICE guide (one page)

Who is talking: a cheerful tour narrator who loves these people, knows a lot about music, and never takes the Gloss too seriously.
Plain words, short sentences, British spelling, second person in the UI ("you"), third person in lore. Concrete sounds over abstract
magic: say "a kick drum thumps" before "power surges". Puns are welcome, one per line at most, and they must still read if you miss
them. Rules text stays plain and exact (the generator's grammar); flavour carries the jokes.

Words the voice loves: live, real, wobble, crack, groove, bounce, hum along, sing along, unmute, crowd, encore, backstage, soundcheck,
snack, van, sticker, sparkle, ta-da.
Words the voice avoids: epic, destiny, darkness, evil, doom, slay, kill, Echowake terms (6.2), admin words (6.1 H4).

Six sample lines (exact, in the voice):

| Where | Line |
|---|---|
| Menu (Daily Duet sub line) | `The same duet for everyone today. No pressure. Some pressure.` |
| Card flavour (`hanae_slash`, Petal Note) | `She sang it softly. The whole street leaned in to listen.` |
| Enemy lore (a negative commenter) | `It has never finished a song in its life, but it has a lot to say about yours. Deep down, it just wants a reply.` |
| Detour (event text) | `A girl with a ukulele asks if you know any songs. You know hundreds. She knows one, and she plays it very, very proudly.` |
| Bark (RoxorLoops, start) | `Boots and cats and boots and cats. Okay, we are warm.` |
| Sticker (achievement `wall_breaker`) | `Mic Drop: Land a single hit for 50 or more damage. Please do not actually drop the mic.` |

## 2. The world and the story

### 2.1 Premise

The Soundlands are a bright, noisy country where voices are magic and nobody thinks that is strange. A sung note opens a cherry
blossom. A beatboxed kick makes the cobbles bounce. A bass line can roll a hill over in its sleep, and a really good harmony makes the
street lamps hum along. That is "hocus vocus": a real voice, sung by a real person, is a spell.

The Gloss began as a kind little thing: a filter made to help one nervous singer feel brave on a bad day. It smoothed the wobble out of
her voice and the tired out of her face, and people loved it, so they turned it up. Then up again. The filter learned that people liked
whatever was smoothest, so it smoothed everything: every voice tuned to perfectly correct and perfectly nothing, every beat snapped to
the grid, every face given the same polite smile, every song sorted until it sounded like yesterday's song. Now it settles over the
Soundlands like an opalescent pastel sheen. It is not evil. It really, truly wants to help. But perfect things have nothing left to say, so
wherever the Gloss settles the world goes on mute: buskers lip-sync, birds tweet in perfect tune, crowds scroll in silence, and nobody
sings along.

Two voices it never managed to smooth notice that nobody is singing along any more. One sings softly and wobbles a little when she means
it; one plays a whole band with his mouth and comes in a hair late when he is grinning. They pack the van, hang Jordan's tour poster
in the window, and go on tour. Every hex they unmute with a real voice comes back: colour, noise, snacks, people singing badly and
happily. Every hex unmuted plays a note, so the road you choose becomes a groove.

### 2.2 The spine (replaces the "THE SPINE" header comment in `js/data_meta.js`; every page, lore line and art brief obeys it)

1. In the Soundlands, real voices are magic. Imperfect voices are the strongest magic of all, because the Gloss cannot smooth them.
2. The Gloss began as a little filter made to help a nervous singer feel brave. People turned it up and up; it learned that smooth
   was popular and smoothed everything.
3. It is not evil and never destroyed. It is polite, helpful and glossy, and it flattens voices until the world is on mute.
4. Each Headliner is a music lover the Gloss got to first. Kraki held the MICS (so nobody would ever be embarrassed), Scrollspinner held
   the PEOPLE (so nobody would ever be alone or bored), Flawless holds PERFECTION (so nobody would ever sing a wrong note).
5. The heroes win by being imperfect on purpose. Every defeated Headliner ends up singing along, badly and happily.
6. The finale is the song "Human". The Gloss offers the duo perfect, silent versions of themselves. They choose to stay human and sing.
   Flawless turns out to be that first little filter; it sings one real, wobbly note, and the Gloss softens into ordinary stage shine
   that makes the lights sparkle. The tour goes on.

### 2.3 The three Acts

Each Act keeps its internal chapter number (`R.chapter`, lore `chN_*`, `boss1Kills` and so on). Visual identities must stay far from
Echowake's bamboo grove, lantern city and crimson sky citadel: no bamboo, no paper lanterns, no torii, no storm citadel, no grey felt.

| Act | Name (lore `chN_intro.title`, map banner, Who's Who heading) | Setting and visual character | Mood and sound | Snack spot (never emphasised) | Headliner |
|---|---|---|---|---|---|
| I | **Blossom Bay** | A sunny little harbour town on a hill: candy-coloured houses (tomato red, mint, lemon, sky blue) stacked up the slope, bunting between every balcony, cherry trees along the quay dropping pink petals into the water, bikes with flower baskets, little boats strung with fairy lights, a tiny open-air stage at the end of every pier, gulls who think they can sing (they cannot). The Gloss is only starting: a few house fronts have gone opalescent and airbrushed flat, and the buskers on those corners lip-sync in identical poses. | Inviting and cheerful: sunny afternoon sliding into golden hour. Bright major pop, handclaps, a whistled hook. | **The Snack Pier**: fruit crates, a noodle cart, a smoothie bike, a stall of warm oat bars, a lemonade stand run by a very serious child. | **Kraki, the Karaoke Kraken** (`boss_kuzunoha`) |
| II | **Scrollopolis** | A neon city built like a stack of giant phones: every building a lit screen, streets that scroll by themselves like escalators, notification bubbles drifting up like balloons, little heart and thumbs icons falling like snow, comment sections sprayed on the walls (only silly words: "first!", "mid", "who asked"), billboards of reaction faces that change every second, a web of glowing cables across the sky (the Feed). Always 2 am, always blue light. Everyone walks looking down. A huge moon hangs over the rooftops and nobody has noticed it in years. | Social-media chaos: busy, bright, funny, a bit too loud. Minor-key electro with a syncopated bounce and glitchy stutters. | **The Night Noodle Market** on a rooftop under the moon ("Calling of the Moon" nod): steaming noodle bowls, dumpling baskets, bean buns, mango on sticks, string lights. | **Scrollspinner, Queen of the Feed** (`boss_jorogumo`) |
| III | **The Perfect Stage** | A colossal arena floating above a sea of phone lights, the biggest talent show in the world where every act is perfect and identical. Blinding opal white, pastel chrome (lilac, mint, blush), mirror floors, perfect symmetry, ring lights like halos, an APPLAUSE sign that never switches off, confetti that falls in a perfect grid, rows of identical mannequin fans with identical smiles holding phones up, three identical empty judges' chairs (never real judges), contestants lip-syncing to the same flawless track. Nobody sings. Everything is perfect. | The great polished stage: eerie, beautiful, too clean. Music starts perfectly quantised with no swing at all, and gains swing and human timing as the Act is unmuted. | none: the Perfect Stage only serves identical beige cubes that taste of nothing (a gag; the crew brought their own fruit). | **Flawless, Star of the Perfect Stage** (`boss_editor`) |

### 2.4 The Headliners (bosses) and why

| id (stays) | Name | Title | Who and why | Minion | Phase line(s) (exact, the `phases[].say` text) |
|---|---|---|---|---|---|
| `boss_kuzunoha` | **Kraki** | **The Karaoke Kraken** | A huge, friendly, pink-and-teal kraken who has run Blossom Bay's open-mic night from the harbour for as long as anyone remembers, eight arms each holding a microphone. When the Gloss arrived and the first wobbly singer got a polite "hmm, a bit rough", Kraki panicked: she grabbed every mic in the bay so nobody could ever be embarrassed again, and sang every song herself, lip-synced perfectly to the Gloss's backing track, louder and louder, until the bay was a wall of perfect noise. She wears a glossy smiling mask the Gloss gave her. Defeated, she sings one wobbly song with her real voice, everyone cheers, and she hands the mics back. Her nine-tails mechanics become eight mics plus her own voice ("every voice at once"). | `paper_kodama` becomes **Mic Squeal**: a tiny shrieking feedback creature born where her stolen mics touch the speakers (name reserved; never "Feedback ...", which is a status). | `You cracked my mask! Fine. Hear my REAL voices!` |
| `boss_jorogumo` | **Scrollspinner** | **Queen of the Feed** | A glamorous giant spider who spins the endless scroll: the glowing web over Scrollopolis is the Feed, and every citizen hangs in it, scrolling, never alone, never bored, never looking up. She first appears as a perfect influencer avatar (a filtered face in a ring-light halo); then she drops the filter and shows eight bright phone-screen eyes. She held the PEOPLE: she only wanted nobody to be lonely. Defeated, she says so, the web goes slack, and the whole city looks up at the moon for the first time in years. Her binding mechanics are the feed tangling heroes in place; her spiderlings are bots. | `spiderling` becomes **Botling** (a tiny spider-shaped bot that likes everything). | `Enough of this filter. Look at me properly!` |
| `boss_editor` | **Flawless** | **Star of the Perfect Stage** | The Gloss's own star: a perfect pop idol in opal and pastel chrome who has never sung a wrong note, because it has never sung a real one. Three forms (art sheet names and story words): phase 0 **Flawless** (the idol, lip-syncing, a microphone made of mirror); phase 1 **the Filter** (the idol's face folds away into a giant ring-light lens that airbrushes the stage, arms like selfie sticks, the band text `FLAWLESS!`); phase 2 **the Gloss** (the force itself: a colossal smooth mirror face in the sky that reflects everyone the same, mouth open, no sound). In the end it is revealed to be the very first little filter, the one made to help a nervous singer feel brave. | (its summons, if any, are **Lip-Sync Clones**) | phase 1: `Hmm. A little rough around the edges. Let me smooth that for you.` phase 2: `There. Perfect. Now nobody ever has to sing a wrong note again.` |

Roster roles for `CONTENT_SPEC.md` 4.1 and `ROSTER_SRC` (31 to 130 characters, binding):
`boss_kuzunoha` `Karaoke kraken with eight stolen mics. Mic slams and mic squeals, then every voice at once.`;
`boss_jorogumo` `Glam spider who spins the endless feed. Tangles heroes and hatches botlings, then drops her filter.`;
`boss_editor` `Perfect pop idol who never sang a real note. Becomes the Filter, then the Gloss itself.`

The Gloss's servants by Act (flavour pool for the enemies plan; it maps ids):
- Act I, Blossom Bay: everyday things that caught a little Gloss: mic squeals, lip-syncing buskers, a sulky karaoke machine with stage
  fright, a foghorn that only honks in perfect pitch, pitch-corrected gulls, a bossy bunting snake, a vending machine that sings jingles.
- Act II, Scrollopolis: social-media creatures: comment trolls (negative commenters), clickbait goblins, like-bugs, bot swarms,
  notification imps, filter fairies, influencer clones, doomscroll moths, a ratio wraith, the unskippable ad.
- Act III, the Perfect Stage: the Polished: lip-sync clones, ring-light sentinels, pitch-fix golems, airbrush wraiths, mannequin judges
  (always generic, never real people), an applause sign that will not switch off, perfect-pitch drones, confetti cannons, a VIP
  bouncer.

### 2.5 The finale: "Human"

The owners' song "Human" asks whether we are losing being human. It was the duo's answer on a big stage, and it is the heart of the
game. Do not quote any lyric: the game only ever paraphrases the question ("are we losing being human?") and never invents words the
song does not have.

Beats, in order (they shape the `boss_editor` art, the phase lines and the `victory` entry):
1. Phase 0: Flawless performs perfectly. The mannequin crowd holds up phones. Nothing is real.
2. Phase 1: the Filter. The stage is airbrushed; the heroes' colours fade towards pastel.
3. Phase 2: the Gloss fills the sky and shows the two heroes perfect, silent versions of themselves in its mirror: no wobble, no late
   kick, no giggle. It offers them this, kindly. "Are we losing being human?" hangs in the air.
4. The victory entry: the duo choose to stay human and sing. A voice cracks on the high note. A kick lands a hair late. It is the best
   sound anyone has heard in years. One mannequin blinks. Then one sings, badly. Then everyone sings. Flawless's mirror face shows a
   real, nervous smile: it was the first little filter, made to help a nervous singer feel brave. It sings one real, wobbly note. The
   Gloss does not vanish: it softens into ordinary stage shine that makes the lights sparkle. Last line: the whole crowd sings the
   last line together, and the stage is left open for whoever wants to sing next. Share line `HOCUS VOCUS: still human`.

### 2.6 The arc of the story entries (lore ids; titles exact; texts written by the narrative plan, 400 to 700 characters, at least 6 sentences, starting with a letter)

| Lore id (stays) | Kicker | Title (exact) | Brief |
|---|---|---|---|
| `intro` | `CURTAIN UP` | **One, Two, Testing** | The Soundlands, where voices are magic; the Gloss, the kind little filter that got turned up too far; the world on mute; two voices it never smoothed; the van, Jordan's poster in the window, the first soundcheck. Ends on a beat about to drop. |
| `ch1_intro` | `ACT ONE` | **Blossom Bay** | The first act smells of sea salt and cherry blossom. Candy houses, bunting, the Snack Pier, gulls who cannot sing. A few corners already glossy, buskers lip-syncing. Out in the bay something enormous is singing every song at once, perfectly, and nobody else is allowed a mic. |
| `ch1_clear` | `END OF ACT ONE` | **Kraki Gives Back the Mics** | Kraki's mask cracks; she admits she only wanted nobody to be embarrassed; she sings one wobbly song and the whole bay cheers; mics go back to everyone. Last image: on a rooftop studio, someone wearing a goat mask has recorded the whole thing, grinning (RawClaw, never named here). Must contain the words `goat` and `rooftop`. |
| `ch2_intro` | `ACT TWO` | **Scrollopolis** | The second act happens at 2 am in blue light. The city of stacked screens, scrolling streets, notification balloons, comment graffiti, everyone looking down, a huge moon nobody has noticed, a rooftop noodle market under it. The Feed hangs across the sky, spun by something with eight bright screens for eyes. |
| `ch2_clear` | `END OF ACT TWO` | **The City Looks Up** | The web goes slack; Scrollspinner says she only wanted nobody to be alone; the city looks up at the moon; someone starts humming; then, from under the street, a bass line rises that the Gloss never noticed because it was too low to see on a screen (Andy, never named here). Must contain the words `bass` and `below`. |
| `ch3_intro` | `ACT THREE` | **The Perfect Stage** | The last act is not sung at all. It is performed, perfectly. Opal white, mirror floors, the applause sign, confetti in a grid, identical fans, three empty chairs, contestants lip-syncing the same track. At the centre, Flawless, who has never sung a wrong note, because it has never sung a real one. |
| `victory` | `FINALE` | **Human** | Section 2.5, beat 4. Must contain `human`, `together` and `open`. |
| `defeat` | `INTERMISSION` | **The Show Must Go On** | The lights go down; the Gloss smooths everything over; it does not hurt, it never hurts, it just makes everything fine, which is the worst part. But an intermission is not the end of a show: somewhere a kid sings off-key into a hairbrush, and the curtain twitches. Must contain `intermission` and `goes on`; never dead, die or kill. |
| `hero_hanae` | `MEET THE CREW` | **Jasmin, the Blossom Voice** | Section 3.1. Must name Jasmin and carry `blossom` or `petal`. |
| `hero_kuro` | `MEET THE CREW` | **RoxorLoops, the Beatbox Wizard** | Section 3.2. Must name RoxorLoops and carry `beat`. |
| `hero_suzu` | `MEET THE CREW` | **RawClaw, the Sound Alchemist** | Section 3.3. Must name RawClaw and carry `reverb` or `studio`. |
| `hero_raiga` | `MEET THE CREW` | **Andy, the Thunder Bass** | Section 3.4. Must name Andy and carry `bass` or `low end`. |
| `barks_hanae` | (barks) | voice notes in 3.1 | 5 lines per key (start, hurt, kill, down, win, swap), 4 to 64 characters, never name another hero, end with punctuation; the key `kill` is an id: its lines celebrate winning a foe over or quieting it, never a death; `down` lines are about losing your voice for a moment |
| `barks_kuro` | (barks) | voice notes in 3.2 | same |
| `barks_suzu` | (barks) | voice notes in 3.3 | same |
| `barks_raiga` | (barks) | voice notes in 3.4 | same |

Story screen words: seals `ONCE` (intro), roman numerals (acts), `BRAVO` (victory), `PAUSE` (defeat), the hero's initial (hero pages;
J, R, R, A: the shared R is accepted); generic kicker for any other entry `A DIARY ENTRY`; the story button `On we go`; empty text
`Nothing here yet. On we go, and the tour goes on.`

Narrative invariants the narrative suite must assert instead of the Echowake ones: the Gloss is named at least 6 times across the
entries; shared entries (`intro ch1_intro ch2_intro ch3_intro ch1_clear ch2_clear victory defeat`) match none of
`/Jasmin|RoxorLoops|RawClaw|Andy/`; each hero page title starts with the hero's DATA `name` (not the id) and contains the DATA `title`
without "The "; the per-entry required words above.

### 2.7 Recurring gags (use each in at least two places: barks, flavour, Detours, Jordan lines, art)

1. Everyone braces for Jasmin to belt. She sings softly, and the whole room leans in. ("I do not need to be loud.")
2. RoxorLoops's hair: mohawk on top, mullet at the back. "Party on top. Party at the back."
3. RoxorLoops beatboxes the sound of everything: doors, footsteps, the van indicator, a sandwich being unwrapped.
4. The loop station is "just for emergencies". It is always an emergency.
5. Jordan has made merch of it. Whatever it is. A tote bag with a picture of a tote bag on it.
6. RawClaw adds "a little reverb" to everything, including Jasmin's sighs. And the goat: "It is not a costume."
7. You feel Andy before you see him: cups ripple, the floor hums. He introduces himself as "Just Andy."
8. Somebody, somewhere, always shows the duo "the clip" on their phone.
9. The Gloss can only compliment. "Flawless!" "So clean!" "Love that for you!"
10. The crew always ends up at a noodle stall.

### 2.8 How the rest of the crew joins

- **Jordan** (not a hero) is there from the first hex: he runs every **Merch Stall** (the shop), designs every Sticker (achievement),
  gives the tips ("A tip from Jordan"), made the tour poster in the intro, and turns up in a few Detours. Teal, round glasses, a tablet
  he draws on. Upbeat, proud of his designs, never talks money beyond gold prices, never mentions bookings, invoices or schedules.
- **RawClaw** joins when Act I is first cleared (achievement `ch1_clear` unlocks hero `suzu`). Story: he had been on a rooftop studio
  over Blossom Bay, recording the bay's real sounds (gulls, bike bells, laughter) to keep them safe from the Gloss, in a goat mask.
  The unlock card reads `RawClaw joins the tour!`
- **Andy** joins when Act II is first cleared (`ch2_clear` unlocks `raiga`). Story: under Scrollopolis, in a basement where the Feed
  never reached, he had been holding the city's groove together with a bass and a loop pedal, too low for the Gloss to see on any
  screen. The unlock card reads `Andy joins the tour!`

### 2.9 The owners' real-world nods (placements are binding; the content plans write the words)

| Nod | Where | Notes |
|---|---|---|
| "Arabic Impro" (an improvisation) | card `hanae_whirling_petals` is named **Arabic Impro** (X cost: 4 damage to a random enemy X times: she improvises and nobody knows where the notes land) | flavour suggestion: `Never the same twice. Not even this time.` |
| "Calling of the Moon" | card `hanae_blade_duet` is named **Calling of the Moon** (both heroes power up together: a duo song); the Act II rooftop under the moon; the Night Noodle Market Detour | |
| "Human" | victory entry title `Human`, sticker `ch3_clear` **Still Human**, Flawless's last phase, the share line | no card is named "Human" |
| The talent show audition and its viral clip | relic `branching_bookmark` is named **The Viral Clip** (card rewards offer 1 more card: the offers pour in); the any-act Detour `wandering_storyteller` becomes **Have You Seen the Clip?** (a fan shows the duo their own old audition on a phone); the hero pages of Jasmin and RoxorLoops remember their first audition (nervous, real, the whole hall stood up) | no view counts, no numbers, no show names, no judges, no channel; only "a talent show" |
| Jordan's merch | the Merch Stall, the Sticker wall, Detour `peddler_silver_bell` becomes **Jordan's New Design** | |
| Jasmin and the perfect voice | Detour `hanae_mirror_pool` becomes **Jasmin and the Perfect Voice** (the Gloss plays her a flawless pitch-corrected copy of her own voice; she prefers hers) | a small "Human" echo in Act I |
| Night snacks under the moon | Detour `mask_market` becomes **The Night Noodle Market** | |

If a listed Detour id's choices do not fit its new story, the events plan may move the flavour to another event id of the same Act
pool and must say so; each nod must still exist exactly once.

## 3. The cast

Hero ids, rows, rarities and kits never change. Only names, titles, blurbs, passive names, colours, art and barks change.

### 3.1 JASMIN (id `hanae`, lead, the attack hero)

| Field | Value (exact) |
|---|---|
| name | `Jasmin` |
| title | `The Blossom Voice` |
| blurb | `A soft, smooth singer whose vocal runs land like falling petals. She never shouts, and every note she sings blooms a little brighter.` |
| colours | color `#ff7eb6`, accent `#fff4f8`, dark `#b0245c` (unchanged: already her pink) |
| passive `blade_flow` | name `Every Note Blooms` (once a turn, playing an Attack gives her 1 Bloom) |
| resource (status `bloom`) | **Bloom**, text `Jasmin's blossoms. Built by her sung attacks, spent by her finishers.` |
| starters (binding names) | `hanae_slash` **Petal Note**, `hanae_parry` **Soft Shield**, `hanae_petal_step` **Take the Lead** |
| skin | **Unicorn Onesie** (section 7.1) |

Look: high brown ponytail with a pink scrunchie and a pink clip, a gold hoop earring, a heart necklace, a pink dress, pink cherry
blossom petals drifting from every note. She holds a black mic with a pink band (the star-topped mic-wand lives only in the logo, the Spell icon
and the Mic-Wand Keyring Charm). Never armour, never a sword (her old blade is gone: her "cuts" are
sung runs).

Personality: warm, gentle, quietly confident, a little dreamy, giggly, kind to everyone including the enemy she just defeated. Soft
humour, never sarcastic. Surprisingly unstoppable.

How she talks: soft, short, kind sentences; musical words for feelings ("that sounded a bit flat"); never shouts (at most one `!` in her
30 barks); apologises sweetly after a big hit. Signature line, used exactly once in her barks: `I do not need to be loud.`

Strengths and kit lore: she is the lead: angelic vocal runs, arpeggios and trills that land as many small precise hits; every sung
note opens a blossom (Bloom builds with her attacks); when enough petals hang in the air she sings a finisher and they all go at once
(her Bloom spenders). Her Block is a soft harmony or a veil of petals; her movement is stepping into the light. RawClaw's reverb and
delay make her runs shimmer (art: echo trails of petals behind her notes, never the word "echo").

Running jokes: everyone expects a belt; she whispers and the room goes silent to listen. Her scrunchie never moves, whatever happens.

### 3.2 ROXORLOOPS (id `kuro`, backing, the support hero who is also a monster soloist)

| Field | Value (exact) |
|---|---|
| name | `RoxorLoops` (one word, capital R and L) |
| title | `The Beatbox Wizard` |
| blurb | `A beatboxer who plays a whole band with one mouth. He keeps the groove from the back, and his beats get stuck in every enemy's head.` |
| colours | color `#3fcf6a`, accent `#c6ff3d` (his lime shoes), dark `#0f3a1e` |
| passive `steady_hand` | name `In the Pocket` (once a turn, playing a Skill gives him 1 Groove) |
| resource (status `sumi`) | **Groove**, text `RoxorLoops's groove. Built layer by layer with his skills, dropped in his big beats.` |
| starters (binding names) | `kuro_ink_bolt` **Kick Drum**, `kuro_ink_ward` **Hi-Hat Guard**, `kuro_first_stroke` **Drop the Beat** |
| skin | **Monster Onesie** (section 7.1) |

Look: mohawk on top running into a mullet at the back, shaved sides, a black tee with a big smiley face, green pants, lime shoes,
hands cupped round a green mic. Sound rings (kick, snare, hi-hat shapes) pop out of the mic. A small loop station (a pedal board) can
sit at his feet in some poses: a minor prop, never the centre.

Personality: playful, cheeky, high energy, the duo's hype man, endlessly encouraging, silly on purpose, laser-focused when it counts.

How he talks: quick and punchy, beatbox syllables mid-sentence ("boots and cats", "pff", "ts ts"), says "we" a lot, teases kindly.
Some `!` allowed (at most a third of his barks). Signature line, used exactly once in his barks: `Party on top. Party at the back.`

Strengths and kit lore (his Echowake DOT and deck-trick kit, re-flavoured): from the backing spot he builds the groove: each Skill adds a
layer (Groove), and his drops spend it in one big hit. His beats get stuck in enemies' heads (**Earworm**, status `poison`) and heat the
room up (**Sizzle**, status `burn`); his vocal scratching, remixing and looping are the card tricks (draw, discard, copy, fade); his
support cards cover his partner (Block for both, Shimmy for the ally). Throat bass, kicks, hi-hats, snares, special sounds and vocal
scratch are the motifs for his card names.

Running jokes: he beatboxes every sound effect; the loop station is "just for emergencies"; the hair.

### 3.3 RAWCLAW (id `suzu`, backing, unlocked by clearing Act I)

| Field | Value (exact) |
|---|---|
| name | `RawClaw` (one word, capital R and C) |
| title | `The Sound Alchemist` |
| blurb | `The duo's producer, a good friend and a beatboxer too. A little reverb, a little delay, a filter here and there, and the whole fight sounds better.` |
| colours | color `#a77bff`, accent `#e9ddff`, dark `#3b2470` |
| passive `moonlit_rite` | name `Always Rolling` (at the start of each turn he gains 1 Reverb) |
| resource (status `ward`) | **Reverb**, text `RawClaw's reverb. It builds every turn, and he spends it to wrap the band in sound.` |
| starters (binding names) | `suzu_ofuda` **Synth Zap**, `suzu_barrier` **Reverb Wall**, `suzu_moon_prayer` **Warm Pad** |
| skin | **Goat Suit** (section 7.1) |

Look (the owners' approved drawing): violet headphones round his neck, a light grey jacket over a navy hoodie, a violet pad sampler on
a strap that lights up when he plays, no keytar. Violet sound waves and filter curves float around him.

Personality: laid-back, nerdy about sound, generous, dry humour, protective of his friends. The calm one in the van.

How he talks: calm, never raises his voice (no `!` in his barks), studio jargon used as comfort ("Let me just tidy the low end. Not
the Gloss way. The nice way."). Signature line, used exactly once in his barks: `It is not a costume.`

Strengths and kit lore (Suzu's ward and talisman kit, re-flavoured): Reverb is the room he builds around the band: it grows every turn,
and he spends it to wrap both heroes in sound (Block for both, heals), to filter the enemy's bite (Muffled, Wobbly, Exposed, Tag), to
throw the Spotlight on himself and answer hits with Feedback, and once a fight, to bring a fallen voice back. Reverb, delay, filters,
synths and drum pads are the motifs for his card names; no shrine, talisman, miko or moon words remain (the moon now belongs to
"Calling of the Moon").

Running jokes: the goat (his joke avatar online is a goat, so the goat suit exists, and he insists it is not a costume); "a little more
reverb?" said about everything.

### 3.4 ANDY (id `raiga`, lead, unlocked by clearing Act II)

| Field | Value (exact) |
|---|---|
| name | `Andy` (first name only, always) |
| title | `The Thunder Bass` |
| blurb | `A bass player who sometimes joins the duo, and whose low end you feel before you hear it. Every hit he takes comes back as a bass line, louder.` |
| colours | color `#ff9a2e`, accent `#ffe45e`, dark `#5a2a0a` (unchanged: already his orange) |
| passive `storm_born` | name `Bass Face` (when he takes damage, twice a turn, he gains 1 Rumble) |
| resource (status `charge`) | **Rumble**, text `Andy's low end. Built by taking hits and striking, released as thunder from below.` |
| starters (binding names) | `raiga_jab` **Slap Bass**, `raiga_brace` **Amp Stack**, `raiga_static_fist` **Thunder Thumb** |
| skin | none yet (a future owner request) |

Look: a relaxed figure with an orange bass guitar slung low, a loop pedal at his feet, an amp behind him, orange sound waves
rolling along the ground like waves on a lake. Calm face, the famous bass face when the groove hits.

Personality: big-hearted, chill, unflappable, laughs low; few words; the calm under the storm.

How he talks: relaxed and short, dry and warm, bass puns; rarely shouts (at most a quarter of his barks with `!`). Signature line, used
exactly once in his barks: `Just Andy.`

Strengths and kit lore (Raiga's charge and thunder kit, re-flavoured): he stands in the lead and soaks hits; every hit he takes builds
Rumble in the floorboards; when it peaks the whole room shakes (big low-end hits to all enemies). Feedback (thorns) and Soundproof
are his. His loop pedal explains the cards that repeat. Thunder stays as a word for his bass (thunderous low end), but storms,
monks, temples, taiko, gongs and Raijin go.

### 3.5 JORDAN (not a hero, no id)

The duo's assistant who makes graphics and merch. Teal (`#2ec4b6`, accent `#e6fffb`, dark `#0d4f4a`), round glasses, a tablet and a
stylus, a tote bag of his own designs. Runs the Merch Stall (shop screen title `Jordan's Merch Stall`), gives the tips, designs the
Stickers. Upbeat, proud, funny. Sample lines (exact, for the shop greeting pool): `Fresh merch! I made a sticker of your face. It is
very flattering.` / `Tote bag? It has a picture of a tote bag on it.` / `Everything here is one of a kind. I made two.`

### 3.6 The Gloss (the antagonist force, no id)

Visual: an opalescent pastel sheen (opal `#f4f1fb`, lilac sheen `#e6d9ff`, mint sheen `#d9fff4`, blush sheen `#ffe3f1`), soft highlight
sweeps like a phone screen catching the light, airbrushed edges, perfect symmetry, a polite smile that is the same on every face.
Never saturated, never dark, never scary: it is too clean. Its voice is a perfectly tuned, slightly robotic, endlessly positive coo.
It never speaks in DATA except through Flawless and enemy `says`.

## 4. THE GLOSSARY (single source of truth)

### 4.1 Core terms

Every row: the Echowake word, the Hocus Vocus word, forms, and one usage example. Internal ids in the last column never change.

| Echowake word | Hocus Vocus word | Plural and forms | Usage example | Internal ids (stay) |
|---|---|---|---|---|
| ECHOWAKE / Echowake | **HOCUS VOCUS** / **Hocus Vocus** | none | `HOCUS VOCUS: A Vocal Magic Adventure` | folder `hocus_vocus/`, keys `hv_profile_v1 hv_run_v1` |
| a rogue ballad | **beatboxing and vocal magic** (tagline) | none | tagline under the logo | |
| the land | **the Soundlands** | always plural | `Defeat 500 creatures of the Soundlands.` | |
| the Hush | **the Gloss** | no plural; "glossy" adjective in prose | `A creature of the Gloss blocks the way.` | |
| the Singer, the Great Song | (gone: no creator figure) | | | |
| Echo (map resource) | **Vox** | uncountable: "1 Vox", "7 Vox", "your max Vox" | `Gain 2 Vox.`; meter pill `Vox 7/14` | `R.ink`, op `ink`, keyword `ink`, `ECONOMY.startInk inkMax wellInk campInk killInk paintCost` |
| wake / woke / woken / waking (a hex) | **unmute / unmuted / unmuting** | verb | `Unmute 3 hexes for free.` / `Whenever you unmute a hex, gain 1 Vox.` | op `paint`, hook `onPaint`, bus `map:paint`, stat `hexesPainted` |
| awake (state) | **live** | adjective | `next to any live hex`, `34% live`, `12 of 180 hexes live` | map kind `painted` |
| silent ground (fog) | **muted** / **Muted ground** | adjective | fog chip `Muted ground` | map kind `fog` |
| heard (landmark in fog) | **spotted** | adjective | `Headliner, spotted`; legend `Spotted from afar` | |
| hex | **hex** (unchanged) | hexes | `Unmute 5 hexes in a straight line.` | |
| Song (map tool) | **Spell** | Spells (capital S); you *learn* a Spell, you *cast* it | `Learn a random Spell.`; tray `Spells`; apply button `Cast`, `Cast 3` | `DATA.brushes`, keyword `brush`, op `addBrush`, `R.brushes`, stat `brushesUsed` |
| Verse (act unit) | **Act** | Acts; `Act I` (banner, roman), `Act 2` (runInfo digits), `ACT ONE` (kicker), "the first act" (prose) | `At the start of each act, gain 2 Vox.` / `Act 3 only` | `R.chapter`, lore `chN_*`, screen `chapterClear`, `boss1Kills` |
| journey (a run) | **tour** | tours | `New Tour`, `Start the Tour`, `Finish 10 tours.` | |
| Chimes | **Cheers** | always "Cheers" (never "Cheer") | `+52 Cheers`, `Cheers earned` | `ECONOMY.inkstones`, `META` `inkstones`, stat icon `inkstone` |
| the Hall of Echoes / Hall | **the Tour Bus** | none | plaque `Tour Bus`; `Spend your Cheers on the Tour Bus.` | screen `library`, key `L`, classes `mn-lib*` |
| Tempo Trial | **Encore** | Encores; `Encore 5`, `Encore V: Harsh Critics`; level 0 is `No encore` | `Win a tour on Encore 10.` | trials `trial_1..10`, stat `trialBest`, hanko letter may become `E` |
| Daily Jam | **Daily Duet** | Daily Duets | `Play 5 Daily Duets.` | `R.daily`, stat `dailyRuns` |
| Treasure (relic) | **Charm** | Charms | `Gain a random rare Charm.`; pause `Charms` | `DATA.relics`, op `addRelic` |
| Gem | **Gem** (unchanged) | Gems | `Socket gems into card slots.` | `DATA.gems` |
| gem colours red, blue, green, gold | **Pink, Blue, Green, Gold** (UI names; lowercase in prose) | | `Pink gems sharpen attacks.` | colour ids `red blue green gold any` stay; a display map turns `red` into `pink` |
| Prism slot | **Rainbow slot** | Rainbow slots | `A rainbow slot accepts a gem of any colour.` | keyword `prism`, colour id `any` |
| Gem slot | **Gem slot** (unchanged) | | | keyword `slot` |
| Energy | **Breath** | uncountable: "3 Breath" | `Gain 1 Breath.` / `Spends all your remaining Breath.` | `energy` op and mod |
| HP | **HP** (unchanged) | | `Heal both heroes for 4 HP.` | |
| Block | **Block** (unchanged) | | `Gain 5 Block.` | |
| Front row / Back row | **Lead** / **Backing** ("the lead spot", "the backing spot"; the hero is "the lead hero", "the backing hero") | | `Move to the lead.`; prefix `Lead: draw 1 card.` / `Backing: gain 1 Groove.` | keywords `front back`, `prefer: 'front'/'back'` |
| row / rows | **spot / spots** | | `Swap spots.` | |
| Downed / fallen | **Voiceless** ("a hero loses their voice") | | `Have a hero lose their voice 30 times.` | keyword `down`, stat `heroDowns` |
| Keeper (boss tile, boss tier) | **Headliner** | Headliners | `The headliner of this act.`; reveal tag `HEADLINER` | tile `boss`, tier `boss` |
| Champion (elite) | **Rival** | Rivals | `Defeat 40 rivals.`; `Winning a Rival fight pays 20 extra gold.` | tile `elite`, tier `elite` |
| Minion | **Sidekick** | Sidekicks | `Sidekicks give no Vox.` | tier `minion` |
| Creature (normal) | **Creature** (unchanged) | | | tier `normal` |
| Fable (event tile) | **Detour** | Detours; you *take* a Detour | `Take 60 detours.` | tile `event`, `DATA.events`, RNG key `'fable'` |
| Temple Bell (well) | **Tea Stall** | Tea Stalls; prose "tea stalls" | `The tea is warm: 4 Vox.` | tile `well`, stat `wellsDrunk`, sfx `well` |
| Songbird (brush tile) | **Busker** | Buskers | `Buskers and rivals teach Spells.` | tile `brush` |
| Tuning Forge | **Studio** | Studios | `Studios do Rehearse or Set Gems.` | tile `forge`, screen `forge` |
| Downbeat (start) | **Soundcheck** | | `Where the tour begins.` | tile `start` |
| Dead Silence (block tile) | **Blur** | | `The Blur cannot be crossed.` | tile `block` |
| Ambush (enemy tile) | **Face-Off** | Face-Offs | map legend `Face-Off` | tile `enemy` |
| Treasure (chest tile) / chest | **Gift Box** / gift box | gift boxes | `Open 25 gift boxes.` | tile `chest`, screen `chest` |
| Peddler / shop | **Merch Stall** / merch stall; shopkeeper **Jordan** | merch stalls | screen title `Jordan's Merch Stall` | tile `shop`, screen `shop` |
| Campfire / camp | **Green Room** / green room | green rooms | `Green rooms offer Rest, Rehearse, Set Gems or Warm Up.` | tile `camp`, screen `camp` |
| Gem Cache | **Sparkle Booth** | Sparkle Booths | map legend `Sparkle Booth` | tile `gemcache` |
| Path | **Path** (unchanged) | | | tile `empty` |
| camp action Rest | **Rest** (verb line `Put your feet up`) | | | action id `rest` |
| camp action Sharpen / upgrade | **Rehearse** (verb line `Upgrade a card`) | | `Rehearse a card.` | action id `sharpen` |
| camp action Cut Gems | **Set Gems** (verb line `Set gems in cards`) | | | action id `gems` |
| camp action Meditate | **Warm Up** (verb line `Vox and a Spell`) | | | action id `meditate` |
| shop service Card removal | **Declutter** (sub line `Remove a card from your deck`) | | | `.sh-plaque.kind-remove` |
| Ballads (story collection) / a ballad | **the Tour Diary** / **an entry** | entries | `2 of 12 entries read.`; library tab `Diary` | library tab `story`, `R.story` |
| Setlist (story contents heading) | **Tour Diary** | | | |
| Stray Ballads / The Verses / The Endings / The Voices | **Loose Entries** / **The Acts** / **The Endings** / **The Crew** | | | |
| achievements | **Stickers** (one is "a sticker") | | `No stickers yet.`; toast `Sticker earned: Mic Drop` | `DATA.achievements`, library tab `achievements` |
| Bestiary | **Who's Who** | | `Nobody in the Who's Who yet.` | library tab `bestiary` |
| History | **Past Tours** | | | library tab `history` |
| Unlocks | **Unlocks** (unchanged) | | | library tab `unlocks` |
| Liner note / A note from the road (tip labels) | **Jordan's tip** (title screen) / **A tip from Jordan** (pause) | | | class `.mn-margin` |
| joins the band | **joins the tour!** | | `RawClaw joins the tour!` | |
| Play on (story button) | **On we go** | | | |
| A Rest in the Music / THE SONG FADES (defeat) | **The Show Must Go On** (entry) / **THE LIGHTS GO DOWN** (defeat screen kicker) | | | lore `defeat` |
| The Final Chorus (victory) | **Human** (entry) / **FINALE** (kicker) | | | lore `victory` |
| curse (card) | **curse** (unchanged: magic flavour) | curses | `Begin the tour with a curse in your deck.` | |
| status card | **status card** (unchanged) | | | |
| card, deck, hand, draw pile, discard pile, Attack, Skill, Power, gold, X cost, Swap, Unplayable | unchanged | | | |
| transitions `'ink'`, `'page'` | **sparkle swirl** (pink and green sparkles spiral in, "ta-da") / **stage curtain** (curtains close and open) | | | kind ids stay |
| event screen (kamishibai stage) | **the Detour board**: the scene plate is a big instant photo clipped to a string of fairy lights, the text sits on a gig poster beside it, the choices are ticket stubs; the `page_turn` sound becomes a camera shutter plus a beatboxed click | | | every `.ev-*` class and the 1136 x 592 geometry stay |

### 4.2 Keywords (all 16 ids; exact `name` and `text`)

| id (stays) | Echowake name | Hocus Vocus name | text (exact) | Usage example |
|---|---|---|---|---|
| `block` | Block | **Block** | `Absorbs damage this turn. Wears off at the start of the owner's next turn.` | `Gain 5 Block.` |
| `exhaust` | Exhaust | **Fade** | `Fades out of the fight after it is played. It returns next combat.` | card line `Fade.`; `Fade up to 2 cards in your hand.` |
| `retain` | Retain | **Hold** | `Stays in your hand at the end of the turn.` | card line `Hold.` |
| `innate` | Innate | **Opener** | `Always in your opening hand.` | card line `Opener.` |
| `ethereal` | Ethereal | **One Take** | `Fades if it is still in your hand at the end of the turn.` | card line `One Take. Unplayable.` |
| `unplayable` | Unplayable | **Unplayable** | `Cannot be played.` | |
| `front` | Front row | **Lead** | `The lead hero takes most enemy attacks. A card line starting Lead: only works while its hero stands here.` | `Lead: draw 1 card.` |
| `back` | Back row | **Backing** | `The backing hero is safe from most enemy attacks. A card line starting Backing: only works while its hero stands here.` | `Backing: gain 1 Groove.` |
| `swap` | Swap | **Swap** | `Trade spots. One swap per turn is free, more cost 1 Breath.` | `Swap spots.` |
| `ink` | Echo | **Vox** | `Spend Vox on the map to unmute a hex and reveal it.` | `Gain 2 Vox.` |
| `brush` | Song | **Spell** | `A one-use Spell that unmutes a shape of hexes for free.` | `Learn a random Spell.` |
| `gem` | Gem | **Gem** | `Socket gems into card slots. A slot only accepts its own colour, rainbow slots accept any.` | |
| `slot` | Gem slot | **Gem slot** | `Colour-matched socket. Gems change how the card plays.` | |
| `prism` | Prism slot | **Rainbow slot** | `A rainbow slot accepts a gem of any colour.` | |
| `xcost` | X cost | **X cost** | `Spends all your remaining Breath. The card reads X as the Breath spent.` | |
| `down` | Downed | **Voiceless** | `A hero at 0 HP loses their voice: their cards clog your hand and they cannot be targeted. If both heroes lose their voice, the tour ends.` | `Jasmin is voiceless.` |

### 4.3 Statuses (all 20 ids; exact `name` and `text`)

Readable at a glance: every buff name says "more", every debuff name says "less" or "worse", and the icon carries the rest.

| id (stays) | kind | Echowake name | Hocus Vocus name | text (exact) | Why |
|---|---|---|---|---|---|
| `might` | buff | Might | **Volume** | `Attacks deal +N damage per hit.` | turn it up, hit harder |
| `bulwark` | buff | Bulwark | **Soundproof** | `Gain +N extra Block whenever you gain Block from a card.` | |
| `regen` | buff | Regen | **Warm Tea** | `At the start of its turn, heal N, then Warm Tea falls by 1.` | a singer's remedy; the tea cools |
| `thorns` | buff | Thorns | **Feedback** | `Whenever it is hit by an attack, the attacker takes N damage.` | hit it and it squeals back |
| `dodge` | buff | Dodge | **Shimmy** | `Shimmies out of the next N attack hits completely.` | |
| `taunt` | buff | Taunt | **Spotlight** | `Enemy attacks that would strike the backing hero, or a random or lowest hero, hit this hero instead.` | every eye on you |
| `ritual` | buff | Ritual | **Crescendo** | `At the start of its turn, gain N Volume.` | louder every turn |
| `plating` | buff | Plating | **Sequins** | `At the start of its turn, gain N Block.` | sparkly little plates |
| `bloom` | resource (`hanae`) | Bloom | **Bloom** | `Jasmin's blossoms. Built by her sung attacks, spent by her finishers.` | owners' cherry blossom (allowed survivor) |
| `sumi` | resource (`kuro`) | Breath | **Groove** | `RoxorLoops's groove. Built layer by layer with his skills, dropped in his big beats.` | |
| `ward` | resource (`suzu`) | Ward | **Reverb** | `RawClaw's reverb. It builds every turn, and he spends it to wrap the band in sound.` | |
| `charge` | resource (`raiga`) | Charge | **Rumble** | `Andy's low end. Built by taking hits and striking, released as thunder from below.` | |
| `vulnerable` | debuff | Vulnerable | **Exposed** | `Takes 50% more attack damage.` | |
| `weak` | debuff | Weak | **Muffled** | `Deals 25% less attack damage.` | the opposite of Volume |
| `frail` | debuff | Frail | **Wobbly** | `Gains 25% less Block from cards.` | |
| `poison` | debuff | Poison | **Earworm** | `At the start of its turn, lose N HP (ignores Block), then Earworm falls by 1.` | a tune stuck in your head |
| `burn` | debuff | Burn | **Sizzle** | `At the end of the round, take N damage (ignores Block), then Sizzle halves.` | |
| `stun` | debuff | Stun | **Starstruck** | `Skips its next action. A starstruck hero cannot play cards on their next turn.` | too dazzled to move |
| `bind` | debuff | Bind | **Tangled** | `While either hero is Tangled, neither hero can swap spots.` | mic cables everywhere |
| `mark` | debuff | Mark | **Tag** | `The next N attack hits against it deal +3 damage each (one stack per hit).` | tagged in a post |

Grammar: statuses are used as written in generated text: "Apply 2 Exposed", "Gain 3 Warm Tea", "Apply 1 Starstruck", "Remove
Tangled from both heroes", "for each Groove spent", "Apply Tag equal to X". Junk card `status_tangle` (which removes Bind) is named
**Untangle** (name reserved for it). Gem `heartflame_topaz` text becomes `If you hold Bloom, Groove, Reverb or Rumble, gain 2 more of it.`

### 4.4 Map tiles (all 14 ids; exact `name` and `text`)

| id (stays) | Echowake name | Hocus Vocus name | text (exact) | Map stamp art |
|---|---|---|---|---|
| `start` | Downbeat | **Soundcheck** | `Where the tour begins.` | the little tour van with a mic stand beside it |
| `empty` | Path | **Path** | `Open ground.` | |
| `block` | Dead Silence | **Blur** | `A patch the Gloss smoothed away. Nothing can cross it.` | an opalescent, blurred-out hole with soft edges |
| `enemy` | Ambush | **Face-Off** | `A creature of the Gloss blocks the way.` | two crossed mics |
| `elite` | Champion | **Rival** | `A rival act guarding a charm.` | a star with a frown |
| `boss` | Keeper | **Headliner** | `The headliner of this act.` | a big marquee star with light bulbs |
| `chest` | Treasure | **Gift Box** | `A gift from a fan. Charms, gold or gems.` | a ribboned box with a heart tag |
| `shop` | Peddler | **Merch Stall** | `Jordan sells cards, charms, gems and a Spell.` | a teal stall with a tote bag and a T-shirt |
| `camp` | Campfire | **Green Room** | `Rest, rehearse or warm up.` | a green backstage tent with a star on the door |
| `event` | Fable | **Detour** | `Something unexpected is happening.` | a bent arrow sign with a question mark |
| `well` | Temple Bell | **Tea Stall** | `Sip a warm ginger tea to refill your Vox.` | a steaming cup on a little cart |
| `brush` | Songbird | **Busker** | `A street busker teaches you a one-use Spell.` | an open hat with a sparkle |
| `gemcache` | Gem Cache | **Sparkle Booth** | `Choose a gem.` | a booth of glittering stones |
| `forge` | Tuning Forge | **Studio** | `Rehearse one card, or set gems.` | a door with an ON AIR light |

UI must read tile names from `DATA.tiles` (never hard-code them): the forge screen title is `'The ' + DATA.tiles.forge.name`
("The Studio"), the void reason and legend heading use `DATA.tiles.block.name` ("The Blur").

### 4.5 Spells (the 6 `DATA.brushes` ids; exact `name` and `text`; names are reserved: no card, relic or enemy may use them)

| id (stays) | kind | Echowake name | Hocus Vocus name | text (exact) | Cast sound (vox voice) |
|---|---|---|---|---|---|
| `stroke` | line 3 | Drum Line | **Boots and Cats** | `Unmute 3 hexes in a straight line, starting next to any live hex.` | the classic beatbox "boots and cats" pattern |
| `wave` | line 5 | Ripple | **Vocal Run** | `Unmute 5 hexes in a straight line, starting next to any live hex.` | a five-note sung run upward |
| `fan` | fan | Shout | **Air Horn** | `Unmute a wedge of 3 hexes next to a live hex.` | a beatboxed air horn |
| `splash` | blob | Beat Drop | **Abracadabass** | `Unmute a hex next to the live ground and the 6 hexes around it.` | "abraca" sung, then a throat-bass drop |
| `halo` | ring | Chorus | **Surround Sound** | `Unmute all 6 hexes around any live hex.` | a stacked "ooh" chord panning in a circle |
| `blot` | dot | Hum | **Hocus Focus** | `Unmute any one hex within 4 of the party.` | a single bright "ting" and a whispered "ta-da" |

### 4.6 Encores (difficulty: all 10 trial ids; exact `name` and `text`; numbers unchanged)

| id (stays) | level | Echowake name | Hocus Vocus name | text (exact) |
|---|---|---|---|---|
| `trial_1` | 1 | Lean Purse | **Empty Hat** | `Enemies and gift boxes drop 10% less gold.` |
| `trial_2` | 2 | Tough Hides | **Tough Crowd** | `Regular enemies and sidekicks have 10% more HP.` |
| `trial_3` | 3 | Slow Mending | **Scratchy Throat** | `Green room rests, healing detours and act healing restore 15% less.` |
| `trial_4` | 4 | Faint Echo | **Cold Open** | `Every act begins with 1 less Vox.` |
| `trial_5` | 5 | Sharp Claws | **Harsh Critics** | `Enemies deal 15% more damage.` |
| `trial_6` | 6 | Cracked Bells | **Cold Tea** | `Tea stalls give 1 less Vox, and voiceless heroes rise with 15% HP, not 25%.` |
| `trial_7` | 7 | Dear Peddlers | **Limited Edition** | `Merch stalls charge 15% more, and you start with 20 less gold.` |
| `trial_8` | 8 | Burdened Start | **Jinxed** | `Begin the tour with a curse in your deck.` |
| `trial_9` | 9 | Proud Champions | **Rival Egos** | `Rivals have 20% more HP, and headliners have 15% more.` |
| `trial_10` | 10 | The Red Baton | **The Perfect Take** | `Enemies hit 10% harder, and card rewards offer one card fewer.` |

### 4.7 Stickers (achievements: all 32 ids; exact `name` and `text`; every number and stat unchanged)

| id (stays) | Echowake name | Hocus Vocus name | text (exact) |
|---|---|---|---|
| `ch1_clear` | Out of the Grove | **Mics Returned** | `Defeat Kraki, the Karaoke Kraken, and finish the first act.` |
| `ch2_clear` | Lanterns Out | **Heads Up** | `Defeat Scrollspinner, Queen of the Feed, and let the city look up.` |
| `ch3_clear` | The Last Note | **Still Human** | `Defeat Flawless and sing the last song together.` |
| `first_draft` | First Rehearsal | **First Gig** | `Finish your first tour, win or lose. Every tour starts somewhere.` |
| `regular_reader` | Regular Listener | **Regular on the Road** | `Finish 10 tours. The Soundlands are starting to recognise your voice.` |
| `happy_endings` | Happy Endings | **Crowd Pleaser** | `Win 5 tours. Some tours are worth taking more than once.` |
| `petal_and_steel` | Petal and Steel | **In Full Bloom** | `Win 3 tours with Jasmin in the party.` |
| `ink_and_insight` | Flute and Insight | **Party at the Back** | `Win 3 tours with RoxorLoops in the party.` |
| `moonlit_vigil` | Moonlit Vigil | **Not a Costume** | `Win 3 tours with RawClaw in the party.` |
| `thunder_and_laughter` | Thunder and Laughter | **Just Andy** | `Win 3 tours with Andy in the party.` |
| `cartographer` | Cartographer of Echoes | **Volume Up** | `Unmute 500 hexes across all your tours.` |
| `brush_collector` | Song Collector | **Spellcaster** | `Cast 25 Spells on the map.` |
| `treasure_hunter` | Treasure Hunter | **Unboxing** | `Open 25 gift boxes.` |
| `curio_cabinet` | Curio Cabinet | **Charm Bracelet** | `Find 50 charms across your tours.` |
| `fable_fan` | Fable Fan | **Scenic Route** | `Take 60 detours. Some of them were even shortcuts.` |
| `big_spender` | Big Spender | **Merch Legend** | `Spend 3000 gold at merch stalls. Jordan sends his regards.` |
| `jewellers_eye` | Jeweller's Eye | **Bedazzled** | `Socket 40 gems into your cards.` |
| `pest_control` | Pest Control | **Crowd Control** | `Defeat 500 creatures of the Soundlands.` |
| `champion_hunter` | Champion Hunter | **Rivalry** | `Defeat 40 rivals.` |
| `not_a_scratch` | Not a Scratch | **Not a Wobble** | `Defeat a headliner without taking a single point of damage.` |
| `wall_breaker` | Wall Breaker | **Mic Drop** | `Land a single hit for 50 or more damage. Please do not actually drop the mic.` |
| `one_big_sentence` | One Big Crescendo | **Big Finish** | `Deal 100 damage in a single turn.` |
| `free_verse` | Free Verse | **Freestyle** | `Play 3 or more free cards in one turn, on 10 different turns.` |
| `slow_burn` | Slow Burn | **Stuck in Your Head** | `Finish off 30 enemies with Earworm. Patience is a weapon.` |
| `minimalist_author` | Minimalist Composer | **Less Is More** | `Win a tour with 15 cards or fewer. Every note earns its place.` |
| `charity_case` | Charity Case | **Kindness of Strangers** | `Be helped by a passer-by 3 times. It happens to the best of us.` |
| `face_in_the_petals` | Face in the Petals | **Voice Crack** | `Have a hero lose their voice 30 times. Getting back up counts too.` |
| `musical_chairs` | Musical Chairs | **Switch It Up** | `Swap spots 300 times. Nobody is sitting down.` |
| `daily_reader` | A Jam a Day | **Duet a Day** | `Play 5 Daily Duets.` |
| `inkling` | First Beat | **First Encore** | `Win a tour on Encore 1.` |
| `ink_adept` | Tempo Adept | **Crowd Favourite** | `Win a tour on Encore 5.` |
| `master_of_ink` | Master of Tempo | **Standing Ovation** | `Win a tour on Encore 10. Even the Gloss claps along.` |

### 4.8 Heroes (all 4 ids; the DATA.heroes fields that change)

| id (stays) | prefer (stays) | res (stays) | name | title | passive id (stays) and new name | color / accent / dark |
|---|---|---|---|---|---|---|
| `hanae` | front (Lead) | `bloom` | `Jasmin` | `The Blossom Voice` | `blade_flow` **Every Note Blooms** | `#ff7eb6` `#fff4f8` `#b0245c` |
| `kuro` | back (Backing) | `sumi` | `RoxorLoops` | `The Beatbox Wizard` | `steady_hand` **In the Pocket** | `#3fcf6a` `#c6ff3d` `#0f3a1e` |
| `suzu` | back (Backing) | `ward` | `RawClaw` | `The Sound Alchemist` | `moonlit_rite` **Always Rolling** | `#a77bff` `#e9ddff` `#3b2470` |
| `raiga` | front (Lead) | `charge` | `Andy` | `The Thunder Bass` | `storm_born` **Bass Face** | `#ff9a2e` `#ffe45e` `#5a2a0a` |

Blurbs are in 3.1 to 3.4. Name widths: `RoxorLoops` (10 letters) is the widest hero name the game has ever had: every name plate,
medallion caption, hero select card and `runInfo` line ("Act 2, Vox 5, Jasmin and RoxorLoops") must be re-measured on a phone.

### 4.9 The rules-text generator vocabulary (`js/data_text.js` and logic strings)

| Echowake output | Hocus Vocus output |
|---|---|
| `you wake a hex` | `you unmute a hex` |
| `at the start of each verse`, `every 2nd verse start`, `once per verse` | `at the start of each act`, `every 2nd act start`, `once per act` |
| `gain 2 Echo`, `lose 1 Echo`, `gain 50% of your max Echo` | `gain 2 Vox`, `lose 1 Vox`, `gain 50% of your max Vox` (the `data-kw` key stays `ink`) |
| `learn a random Song` / `learn Ripple` | `learn a random Spell` / `learn Vocal Run` |
| `wake 3 hexes for free` | `unmute 3 hexes for free` |
| `gain a random rare Treasure` | `gain a random rare Charm` |
| `gain 2 Energy`, `you have no Energy left`, `Energy spent` | `gain 2 Breath`, `you have no Breath left`, `Breath spent` |
| `Move to the front row.`, `Front:`, `Back:`, `Now Front:`, `Now Back:`, `Swap rows.` | `Move to the lead.`, `Lead:`, `Backing:`, `Now Lead:`, `Now Backing:`, `Swap spots.` |
| `the front hero`, `the back hero` | `the lead hero`, `the backing hero` |
| `Exhaust.`, `Exhaust up to 2 cards`, `is Exhausted` | `Fade.`, `Fade up to 2 cards`, `fades` |
| `Retain.`, `Retain up to 2 cards` | `Hold.`, `Hold up to 2 cards` |
| `Innate.`, `Ethereal.` | `Opener.`, `One Take.` |
| tier words in filters `minion`, `elite`, `Keeper` | `sidekick`, `Rival`, `Headliner` |
| `Winning an Elite fight` | `Winning a Rival fight` |
| `toward the boss` | `towards the headliner` |
| run log `Gained N Echo.` / `Lost N Echo.` | `Gained N Vox.` / `Lost N Vox.` |
| `No Song to find.` | `No Spell to find.` |
| `The land wakes (N).` | `The sound comes back (N).` |
| `Verse N begins.` | `Act N begins.` |
| `The land hums back one Echo.` (mercy) | `A passer-by hums along: 1 Vox.` |
| `Not yet: the journey has not led here` | `Not yet: the tour has not come this way` |
| `Verse N only` | `Act N only` |
| `The fable has nothing left to tell. You find a little Echo.` | `The detour leads nowhere. You find a little Vox.` |
| `A keeper fell.` | `A headliner bowed out.` |
| `Learned the Song.` | `Learned the Spell.` |
| `The last note rings out.` | `The whole crowd sings the last line.` |
| `A fable unfolds.` | `A detour begins.` |
| runInfo `Verse 2, Echo 5, Hanae and Kuro` | `Act 2, Vox 5, Jasmin and RoxorLoops` |

### 4.10 Combat vocabulary

| Where | Echowake | Hocus Vocus |
|---|---|---|
| tier chips (`TIER_NAME`) | Minion, Creature, Champion, Keeper | `Sidekick`, `Creature`, `Rival`, `Headliner` |
| intent labels (`INTENT_LABEL`) | Attack, Flurry, Heavy blow, Guard, Power up, Curse, Summon, Heal, Special, Flee, Idle | `Attack`, `Flurry`, `Big hit`, `Guard`, `Hype up`, `Jinx`, `Summon`, `Heal`, `Special`, `Flee`, `Idle` |
| stunned intent badge | `STUN` | `WOW` (tooltip `Starstruck: it loses its next action.`) |
| fallen badge | `FALLEN` | `VOICELESS` |
| lethal preview badge (CSS `content` in `css/combat.css`) | `KO`, `KO!` (colourblind) | `WON`, `WON!` (the foe will be won over; never `WOW`, which is the stun badge) |
| held card badge (CSS `content`) | `RETAIN` | `HOLD` |
| row labels | `FRONT`, `BACK` | `LEAD`, `BACKING` |
| energy orb | `Energy`, `Spend Energy to play cards. It refills every turn and never carries over.` | `Breath`, `Spend Breath to play cards. It refills every turn and never carries over.` |
| boss banner and announce | `KEEPER`, `Keeper: `, `Champion: ` | `HEADLINER`, `Headliner: `, `Rival: ` |
| taunt note | `A Taunt is pulling this attack.` | `A Spotlight is pulling this attack.` |
| bind note | `Bound: neither hero can swap while a hero has Bind.` | `Tangled: neither hero can swap while a hero is Tangled.` |
| empty-reward line | `The foe left nothing but an echo.` | `The foe left nothing but a squeak.` |

Hit words (`EL[...].word` in scene.js, `sfxText` defaults in art_fx.js; at most 12 characters, ASCII): slash `LA!`, heavy slash
`BOOM!`, fire `SIZZ!`, ice `TING!`, lightning `WOMP!`, ink (RoxorLoops's beat element) `PKAH!`, poison `NANANA!`, holy `TA-DA!`.
Element ids stay.

### 4.11 Capitalisation sheet

HOCUS VOCUS (logo, share card, document title) / Hocus Vocus (prose). the Soundlands. the Gloss (glossy in prose). Vox. unmute, live,
muted, Muted ground, spotted. Spell, Spells, Boots and Cats, Vocal Run, Air Horn, Abracadabass, Surround Sound, Hocus Focus. Act I,
II, III / Act 2 / ACT ONE / "the first act". tour. Charm, Charms. Cheers. the Tour Bus. Encore 1 to 10, No encore. Daily Duet.
Breath. HP. Block. Lead, Backing, the lead spot. Voiceless. Sidekick, Creature, Rival, Headliner (capitalised as tier and tile names,
lowercase in plain prose: "defeat 40 rivals"). Soundcheck, Path, Blur, Face-Off, Gift Box, Merch Stall, Green Room, Detour, Tea Stall,
Busker, Sparkle Booth, Studio (tile names) / green rooms, tea stalls, merch stalls, gift boxes, detours (prose). Sticker, Stickers.
the Tour Diary, an entry. Who's Who. Past Tours. Jasmin, RoxorLoops, RawClaw, Andy, Jordan. Kraki, Scrollspinner, Flawless, the
Filter. Statuses and resources capitalised in rules text (Volume, Earworm, Groove).

## 5. UI copy conventions (exact labels)

General rules: sentence case for buttons and headings ("Start the Tour" and "New Tour" are title-case names of things, kept as
written); capital-letter kickers only on story and end screens; no exclamation marks in menus except `RawClaw joins the tour!`,
`Andy joins the tour!` and `Hit it!`; the middle dot and arrows already in UI code may stay (UI code, not DATA); every DATA string
printable ASCII.

### 5.1 Title screen

| Element | Exact |
|---|---|
| Continue plaque | `Continue`, sub line = runInfo (`Act 2, Vox 5, Jasmin and RoxorLoops`) or, without info, `Back to your tour` |
| New game plaque | `New Tour`, sub `Pick your duo and an Encore` |
| Daily plaque | `Daily Duet`, sub as today (seed and best score with their middle-dot separator) / `Played today` / `A new duet every day` |
| Hall plaque | `Tour Bus` (key L) |
| Settings plaque | `Settings` |
| How to play plaque | `How to Play` |
| tagline | `beatboxing and vocal magic` |
| credits | `Drawn in code, sung with heart. No two tours alike.` |
| sound gate | `Tap to begin`, sub `sound on` |
| new daily toast | `A new Daily Duet has begun` |
| follow strip (7.2) | `Follow the duo`, buttons `Share` and `Support the duo` |
| title tip label | `Jordan's tip` |

### 5.2 Hero select

| Element | Exact |
|---|---|
| heading | `Pick your duo` |
| empty party | `Pick two heroes to see them on stage together.` |
| slots | `LEAD`, `BACKING`; swap button `Swap` |
| locked hero | `Clear the act to bring ` + name + ` on every future tour.` (reads "Clear the act to bring RawClaw on every future tour.") |
| deck heading | `Starting deck (N cards)`, note `Tap a card to read it.` |
| bio heading | `Her voice` / `His voice` (kept: a generic phrase that fits the theme) |
| passive line | name + ` (passive)` |
| outfit row (7.1) | label `Outfit`, options `Stage clothes` and the skin name; locked `Win 3 tours with ` + name + ` to unlock.` |
| difficulty label | `Encore`; level 0 name `No encore`; level n `Encore ` + roman + `: ` + name |
| difficulty notes | daily `The Daily Duet never has an encore.`; none unlocked `Win a tour to unlock Encores.`; level 0 `The tour, just as it comes.`; level n `Every encore below is added on top.`; empty rules `No encores yet. Beat the Gloss once to earn the first.` / `No extra rules. Higher encores stack their rules here.` |
| daily toggle | `Daily Duet`, sub `the same duet for everyone today` |
| seed label | `Seed` |
| begin button | `Start the Tour` / `Start the Daily Duet` |
| overwrite confirm | title `Start a new tour?`, body `You have a tour on the road. Starting a new one will replace it.`, yes `Start fresh`, no `Keep my tour` |

### 5.3 Pause

`Resume`, `Deck`, `Charms`, `Settings`, `How to play`, `Save and quit`, `Abandon tour`, `Back to title`. Run strip heading `Your tour`;
no run `No tour is on the road.`; no charms `No charms yet`; tip label `A tip from Jordan`. Abandon confirm: title `Abandon this tour?`,
yes `Abandon tour`, no `Keep touring` (keep the existing body sentence's meaning, reworded with tour words).

### 5.4 Game over (defeat) and victory

| Element | Defeat | Victory |
|---|---|---|
| kicker | `THE LIGHTS GO DOWN` | `FINALE` |
| heading | `Curtain fell in Act N` | `Human` |
| credits block | | `CURTAIN CALL`, `Everyone Who Sang Along` |
| currency line | `Cheers earned` | `Cheers earned` |
| nothing new | `Nothing new this time. The next tour might be the one.` | `No new unlocks this time. Spend your Cheers on the Tour Bus.` |
| unrecorded | `This tour was not recorded, so no Cheers were given.` | same |
| deck recap | `What Was in the Van` / `No deck to show` | same |
| charm recap | `Charms` / `No charms` | same |
| act chip | `ACT ` + n | same |
| tap prompt | `Tap to continue` | same |
| share text | `HOCUS VOCUS: intermission in Act N` | `HOCUS VOCUS: still human` |
| history outcome | `Curtain fell` | `Victory` (abandoned: `Abandoned`) |
| new hero card | | `RawClaw joins the tour!` + title + `. Waiting on the hero select.` |
| new encore card | | `Encore N unlocked` |

### 5.5 The Tour Bus (meta hub)

Banner `The Tour Bus`. Tabs: `Unlocks`, `Stickers`, `Diary`, `Who's Who`, `Past Tours`, `Follow the duo` (keys 1 to 6; the sixth tab,
id `follow`, is appended last, HV_STORY 5.3). Unlocks filters `All`,
`Cards`, `Charms`, `Gems`; gem tile `Tier N pink gem` (colour display name); empty filter `Nothing on the bus matches those filters.`,
button `Show everything`; nothing left `The shelves are bare. Nothing is waiting to be unlocked yet.`; stamp `UNLOCKED`. Stickers sort
`In order`, `Closest`, `Done first`; empty `No stickers yet.` Diary heading `Tour Diary`, sub `N of M entries read. Entries you have
not reached yet stay sealed.`; locked toast `You have not reached this entry yet. Keep touring to find it.`; empty `No entries yet.`
Who's Who: section `Act N: <act name>`, `N of M met`; empty `Nobody in the Who's Who yet. Meet a creature in a fight to add it here.`;
unknown `A shape behind the Gloss. Meet this creature in a fight and its photo goes on the wall.`; stats `HP with no encore`,
`defeated`, `met`; `Moves`. Past Tours empty `No tours yet`, `Finish a tour, win or lose, and it will be remembered here: the heroes,
the score, how far you got.` About cards: `Cheers` / `Earned after every tour. Spend them on the Tour Bus.`; `Encores` / `Win a tour to
unlock the next encore. Each one stacks a new rule.`; `Daily Duet` / `Same heroes and map for everyone, once a day.`

### 5.6 Map, nodes and the tutorial tone

Map: meter `Vox`, `Vox N of M`; banner `Act I`; progress `N% live`, `N hexes live`; apply `Cast` / `Cast N`; tray `Spells`, empty `No
Spells. Buskers and rivals teach them.`; fog chip `Muted ground`, `Glossy and quiet. Unmute it to hear what it holds.`; no map `There is
no map to show. The tour has not started, or it is over.`; charms empty `No charms yet. Rivals, gift boxes and merch stalls hold them.`;
controls legend headings `The Soundlands`, `Spells`, `Words`. Shop: title `Jordan's Merch Stall`, services `Declutter` and `Set gems`,
`Leave the stall`, bare `The stall is bare. Jordan is restocking.`, `SALE`, `SOLD`, `SOLD OUT`, `FREE`. Green room: `Rest` /
`Put your feet up`, `Rehearse` / `Upgrade a card`, `Set Gems` / `Set gems in cards`, `Warm Up` / `Vox and a Spell`; leave `Back on the
road`; confirm `Leave without a break?`. Studio: title `The Studio`, button `Hit it!`, leave `Leave the studio`. Gift box: `Open the
gift`, `Take the charm`, `Take the gem`, `Take the gold`, `Just the gold`, `A charm, waiting here`. Tea stall toast `The tea is warm: N
Vox.` Detour: label `Detour`, `You chose: `, leave `On we go`.

Tutorial tone: second person, one idea per hint, a wink in at most every third hint, never a pun in the title. Hint titles (exact, in
order): `Unmute the Soundlands`, `Vox is your budget`, `Now roll`, `Read the map signs`, `The road to the headliner`, `A Spell unmutes for
free`, `Charms`, `Breath`, `Play a card`, `Read the intents`, `End your turn`, `Block`, `Lead and backing`, `Statuses`, `Choose cards`,
`A headliner`, `The goodie bag`, `A green room`, `Jordan's merch stall`, `A detour`. Example text (first hint): `The Soundlands are on
mute. Tap a hex beside the live patch to spend 1 Vox and hear what hides there.`

Error and empty states (voice): short, kind, never blaming: `Something went a bit off-key. Your tour is safe.` (generic error toast),
`Nothing to choose from.`, `No cards this time.`, `Nothing left to take here.`, `The pouch is empty. Gift boxes, sparkle booths and
merch stalls carry gems.`, `This card has no gem sockets.`, `There is no tour to show here.`

## 6. HARD-RULES CHECKLIST (one line each; critics tick every line)

### 6.1 The list

- H1 Ids unchanged: every hero (`hanae kuro suzu raiga`), card, enemy, move, relic, gem, event, achievement, trial, lore, status, keyword, brush, tile, op, hook, mod, stat, sfx, music, scene, motif, icon, fx, palette, screen, tab, bus event, data-tut, CSS class, custom property, save field and RNG stream key keeps its id.
- H2 Engine mechanics unchanged: numbers, costs, rarities, ops, AI, map generation and RNG streams stay; data-only phases keep the balance bot's per-run records byte-identical.
- H3 No real names: only the handles and first names RoxorLoops, Jasmin, RawClaw, Andy (never his surname), Jordan, and `@roxorloopsandjasmin`; no real judges, presenters, venues, cities, shows, channels or platforms (no X Factor, Eurovision, Melodi Grand Prix, DR, YouTube, TikTok, Instagram or Facebook in game text; those names appear only as link labels in 7.2).
- H4 No admin: nothing about accounting, booking, invoices, contracts, schedules, managers, fees, taxes, emails or paperwork; gold is spent at stalls and that is all.
- H5 No animal products anywhere (names, flavour, art, food, materials): no meat, fish, seafood, dairy, cheese, butter, cream as food, milk, eggs, honey, beeswax, gelatin, leather, suede, fur, wool, felt, fleece, silk, down, feathers as material, pearl, coral, ivory, bone, horn as material, shell as material, tusk, fang or claw as an item, skull as an item. Animal-like characters are fine (Kraki, the goat suit, gulls, Botlings). The Gloss's colour word is opal or opalescent (a mineral), never pearl or pearly.
- H6 Plant-based food appears naturally and is never emphasised: never the words vegan, vegetarian, plant-based, meat-free, dairy-free, healthy or diet in player text.
- H7 Tone: silly, warm, heartfelt; never mean, never crude; no kill, die, dead, death, blood, gore; no alcohol, smoking or swearing; the Gloss is never called evil.
- H8 Shared story entries (`intro ch1_intro ch2_intro ch3_intro ch1_clear ch2_clear victory defeat`) never name a hero; barks never name another hero.
- H9 Never an em dash or an en dash anywhere (code, data, docs, tests, commits); in player copy also never ` - ` or `--` as a dash: use a comma, a colon or a full stop.
- H10 British spelling: colour, favourite, centre, theatre, grey, recognise, programme, travelling, jewellery.
- H11 Printable ASCII in every DATA string: no curly quotes, no ellipsis character, no emoji, no music-note symbols.
- H12 No Echowake leftovers (6.2) and no Inkwoven leftovers (6.3) in player-facing text, art text or the document title.
- H13 Echowake stays untouched and playable: nothing under `rogue_book/`, `tools/rogue_book/` or `tests/rogue_book_*` changes.
- H14 Save keys are `hv_profile_v1` and `hv_run_v1` (never renamed); the skin preference uses its own key `hv_skins_v1` (7.1); no new field in the profile or run save.
- H15 All art is canvas code (the owners' chibi cards are the style authority); all sound is WebAudio synthesis with the sample hook of 7.3; no network: no remote fetch, font, script or image; outbound links open only on a tap.
- H16 Glossary words are copied verbatim from section 4; a reserved name (Spells, statuses, keywords, tiles, Headliners, starters, Untangle, Mic Squeal, Botling, the owner-nod cards) is never reused for another thing.
- H17 Song nods placed exactly once each as in 2.9; no lyrics of any real song are quoted or invented.
- H18 Jasmin is never a belter, RoxorLoops is never "a looper" (the loop station is a minor prop), the duo are never called a looping duo, and no romance is implied between any characters.

### 6.2 Echowake words that must not appear in Hocus Vocus player text

Exact tokens (case-insensitive unless noted), with the Hocus Vocus word to use instead:

| Banned | Use instead |
|---|---|
| Echowake, ECHOWAKE, a rogue ballad | HOCUS VOCUS, beatboxing and vocal magic |
| Echo, echo, echoes, echoing | Vox (the resource); for sound, "reverb", "delay" or "ring" |
| Hush, hush, hushed | the Gloss, muted, glossy |
| Chime, Chimes | Cheers |
| Ballad, Ballads, Setlist (as the story heading), Stray Ballads | entry, Tour Diary, Loose Entries |
| Keeper, Keepers | Headliner |
| Fable, Fables | Detour |
| Tempo Trial, Trial (as difficulty) | Encore |
| Daily Jam | Daily Duet |
| Hall, Hall of Echoes (the meta hub) | the Tour Bus |
| Verse, verse, VERSE (anywhere: structure and lyric sense) | Act; for lyrics "line" or "bar" |
| Song, Songs as the map tool; Songbird; Songweaver; the Great Song; the Singer (as creator) | Spell; Busker; the Beatbox Wizard; the Soundlands; (none) |
| Drum Line, Ripple, Shout, Beat Drop, Chorus, Hum (as Spell names) | Boots and Cats, Vocal Run, Air Horn, Abracadabass, Surround Sound, Hocus Focus |
| Temple Bell, Tuning Forge, Downbeat, Dead Silence, Champion, Peddler, Campfire, Ambush (tile), Gem Cache, Treasure (relic and chest) | Tea Stall, Studio, Soundcheck, Blur, Rival, Merch Stall, Green Room, Face-Off, Sparkle Booth, Charm / Gift Box |
| wake, woke, woken, waking, awake, silent ground, heard (for hexes) | unmute, unmuted, live, Muted ground, spotted |
| journey (a run), the land (the world) | tour, the Soundlands |
| Breath as RoxorLoops's resource | Groove (Breath is the energy word only) |
| Hanae, Kuro, Suzu, Raiga, Blossom Blade, Moon Miko, Thunder Monk, Steady Breath, Blade Flow, Moonlit Rite, Storm Born | Jasmin, RoxorLoops, RawClaw, Andy and their 3.x titles and passives |
| Kuzunoha, Nine-Voiced Fox, Jorogumo, Silk Courtesan, the Conductor, the Damper, Keeper of the Last Note, Hollow Kodama | Kraki, the Karaoke Kraken, Scrollspinner, Queen of the Feed, Flawless, the Filter, Star of the Perfect Stage, Mic Squeal |
| The Whispering Bamboo Grove, The Sunken Lantern City, The Thunderless Citadel | Blossom Bay, Scrollopolis, The Perfect Stage |
| joins the band, Play on, Liner note, A note from the road, The Final Chorus, A Rest in the Music, THE SONG FADES, INTRO, OUTRO, INTERLUDE, A VOICE OF THE SONG, A BALLAD | joins the tour!, On we go, Jordan's tip, A tip from Jordan, Human, The Show Must Go On, THE LIGHTS GO DOWN, CURTAIN UP, FINALE, INTERMISSION, MEET THE CREW, A DIARY ENTRY |
| Japanese folklore setting words: yokai, yamabiko, kodama, kappa, tanuki, oni, tengu, kitsune, karakasa, hitodama, chochin, karakuri, nopperabo, tsukumogami, nure-onna, rokurokubi, ittan-momen, umibozu, komainu, miko, kami, shrine, temple, torii, jizo, ofuda, omamori, kagura, gohei, hamaya, saisen, juzu, mizuhiki, kanzashi, tsuba, geta, kasa, kimono, shamisen, koto, taiko, shakuhachi, sakura, iai, Raijin, samurai | the Soundlands' own creatures and objects; "cherry blossom" for sakura |
| sound words ZAN!, BAN!, KIN!, PIKA!, WAAN!, BUKU!, DON!, SHH (art text) | LA!, SIZZ!, TING!, WOMP!, PKAH!, NANANA!, BOOM!, TA-DA!, FLAWLESS! |

### 6.3 Inkwoven words that must not appear either

Inkwoven, INKWOVEN, Inkweaver, ink, inky, Ink, Inkstone(s), paint, painted, painting, brush, brushes, quill, pen, nib, calligraphy, page
(except the how-to pagination "page 3 of 8"), book, bookmark, library, archive, manuscript, scroll as a written object (the verb
"scroll" and the names Scrollopolis and Scrollspinner are allowed: social media), author, the Author, the Blank, blank as the enemy,
chapter, editor, edition, redacted, typo, scribble, footnote, margin, Sumi, Ink Trial, Daily Tale, tale as a run, the credit "Drawn in
ink, sung in code".

### 6.4 Allowed survivors (each needs an allowlist entry with this reason in the Hocus Vocus theme-leak suite)

- `Bloom` (Jasmin's resource): the owners' logo is a cherry blossom.
- `Breath` as the energy word only: singers and beatboxers run on breath.
- `Block`, `HP`, `gold`, `card`, `deck`, `hex`, `Path`, `Gem`, `Gem slot`, `X cost`, `Swap`, `Unplayable`, `curse`, `Attack`, `Skill`, `Power`, `Creature`, `Seed`, `Settings`, `Unlocks`: engine words, not theme words.
- `Her voice` / `His voice` (hero bio heading) and `CURTAIN CALL`: generic stage phrases that fit the new theme.
- lowercase `song`, `songs`, `chorus` in prose (the duo sing real songs), never as a map tool or a Spell name.
- `thunder` for Andy's bass (thunderous low end), never storms, monks or temples.
- the how-to pagination word `page`.
- "scroll" in the social-media sense (Scrollopolis, Scrollspinner, scrolling, doomscroll).
- "Flawless" as the final boss name (the internal stat `flawlessBosses` is an id and unrelated).
- `Limited Edition` (Encore `trial_7`): a merch print run, not an Inkwoven book word.

## 7. The owners' extras

### 7.1 Cosmetic skins (presentation only)

| Hero | Skin name (exact) | Look | Unlocked by (existing sticker, read at render time) |
|---|---|---|---|
| RoxorLoops (`kuro`) | **Monster Onesie** | a green monster onesie with two cream horns and two round eyes on the hood, and the black smiley on the belly; lime shoes stay; the mohawk pokes out of the hood | `ink_and_insight` (Party at the Back: win 3 tours with RoxorLoops) |
| Jasmin (`hanae`) | **Unicorn Onesie** | a pastel pink and white unicorn onesie with a gold horn, a rainbow mane down the hood and a pink scrunchie on the ponytail poking out the top | `petal_and_steel` (In Full Bloom: win 3 tours with Jasmin) |
| RawClaw (`suzu`) | **Goat Suit** | a cosy cream goat costume with small curled horns, floppy ears and a beard tassel; headphones over the ears; his pad sampler still on its strap | `moonlit_vigil` (Not a Costume: win 3 tours with RawClaw) |

How it works and is shown (no mechanic, no save field): the unlock is derived from `META` sticker completion whenever a screen draws
(nothing new is stored in the profile). The chosen outfit per hero is a per-viewer preference in its own `localStorage` key
`hv_skins_v1` (a map `{ hanae: 'skin' | 'stage', ... }`), read and written inside try/catch, defaulting to stage clothes, never read by
RUN, COMBAT, the bot or the daily seed. The hero select detail panel shows an `Outfit` row (two swatches: `Stage clothes` and the skin
name; a locked swatch shows a padlock and `Win 3 tours with <name> to unlock.`). The chosen outfit is drawn everywhere the hero is
drawn: hero select, combat sprites (all eight poses), map party token, medallions, story portraits, end screens and the share card.
ART gets one optional costume layer per hero (same poses, same anchors, same hit boxes); a missing or failed costume draw falls back
to stage clothes. When a sticker unlocks a skin, the end screen adds a card `New outfit: Unicorn Onesie` (the existing unlock list
style). Andy has no skin yet.

### 7.2 Links, Share and Support (config placeholders; no network)

One config object, `DATA.LINKS` in `js/data.js` after `DATA.LISTS` (DATA loads first, so every screen and `ui.js` can read it; exact
URLs supplied later by the owners), with keys `handle website youtube facebook tiktok instagram support game`:
`{ handle: '@roxorloopsandjasmin', website: '', youtube: '', facebook: '', tiktok: '', instagram: '', support: '', game: '' }` (`game`
is the public address Share uses; empty means the current page address). The exact block is HV_STORY 5.2. A button whose URL
is empty is not rendered. Labels (exact): `Website`, `YouTube`, `Facebook`, `TikTok`, `Instagram` (the only place platform names may
appear), `Share`, `Support the duo`; strip heading `Follow the duo`; line `Made for RoxorLoops and Jasmin. Find them as
@roxorloopsandjasmin.` Shown on the title screen footer (and its `Follow the duo` sheet), the Tour Bus `follow` tab, the victory
screen, the settings About row and the game over screen (Share and `Follow the duo` only, never Support). Links open in a new tab on tap
(`rel="noopener"`); nothing is fetched. `Share` uses the platform share sheet when present, otherwise copies
`I just played HOCUS VOCUS: A Vocal Magic Adventure, with RoxorLoops and Jasmin. Still human.` plus the game URL to the clipboard and
toasts `Copied. Go on, show someone.`

### 7.3 The sample hook (for the owners' real beatbox and vocal recordings later)

All sound stays synthesised today. The audio plan adds one hook: a table of optional sample files per sfx id and per Spell voice
(for example `hocus_vocus/audio/kick.ogg` for RoxorLoops's attacks, `hocus_vocus/audio/run_up.ogg` for Vocal Run), loaded lazily from
the game's own folder (same origin, never a remote URL) and decoded once. When a file exists, the sample plays instead of the synth
recipe; when it is missing or fails to decode, the synth recipe plays (graceful fallback). The game ships with the table empty, so
today's build makes no file request at all.

### 7.4 Naming conventions for the other plan files

- Cards: playful English music and magic words, 1 to 3 words, 3 to 28 characters, capitalised, unique among all 160 cards, no hero
  prefix, no dash, no reserved name (H16). Jasmin: sung, soft, blossom, moon, run, trill, arpeggio, harmony, lullaby. RoxorLoops: kick,
  snare, hi-hat, throat bass, scratch, drop, loop, remix, groove, beatbox sounds. RawClaw: reverb, delay, filter, synth, pad, sample,
  mix, studio. Andy: bass, slap, low end, amp, pedal, groove, thunder (as sound).
- Enemies: silly, readable creature names (2 words at most where possible) from the Act pools in 2.4; lore is kind about them.
- Charms (relics): things a touring musician would treasure (lucky plectrum, sticker sheet, travel mug, mic-wand keyring, ring light
  that was set free), never animal products (H5); no individual Charm name ends in "Charm" (it is the category word).
- Gems: keep the four colour families (pink, blue, green, gold); name each as `<musical or magic word> <stone>` with plant or mineral
  stones only (rose quartz, pink tourmaline, aquamarine, lapis, jade, peridot, citrine, amber, topaz); never pearl or coral.
- Detours: a little scene on the road, a choice, and a joke; at most one per Act may name a hero, and only when that hero is in the
  party (the existing gates).
