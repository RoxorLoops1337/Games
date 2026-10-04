# HOCUS VOCUS: Charms, gems, Stickers, Encores, tiles, Spells, keywords, statuses, and the Tour Bus, settings and How to Play copy (agent D1)

Status: WORLD DATA rev 1. Covers every id of `DATA.relics` (66), `DATA.gems` (24), `DATA.achievements` (32), `DATA.trials` (10),
`DATA.tiles` (14), `DATA.brushes` (6), `DATA.keywords` (16) and `DATA.statuses` (20), plus the Tour Bus (meta hub) screen, the
settings form and the eight How to Play pages in `js/screen_menu.js`. Every quoted string below is the exact string to paste.
The bible (`HV_BIBLE.md`) wins over this file: the Sticker, Encore, tile, Spell, keyword and status tables (sections 4 to 9) are
copied from bible 4.2 to 4.7 verbatim; this file adds the Charms, the gems, the screen copy and the notes the bible did not fix.

How to read it: section 1 is the decisions and the rules every string was checked against, section 2 the Charms, section 3 the gems,
sections 4 to 9 the copied glossary registries (with their extra columns), sections 10 to 12 the screen copy, section 13 the
execution checklist and the test changes, section 14 the glossary additions and the flags for the bible owner.

What never changes (bible H1, H2): every id, `rarity`, `hero`, `locked`, `mods`, `rows`, `hooks`, every gem `color`, `tier`, `mod`,
`locked` and `art.cut`, every relic `art.m` and `art.c` id, every achievement `stat` and `reward`, every trial `level` and `mods`, every
brush `kind` and `len`, every status `kind` and `stack`. Only `name`, `text` and art change, so the balance bot's per-run records stay
byte-identical.

## 1. Decisions at a glance

| # | Decision | Choice | Why |
|---|---|---|---|
| D1-1 | What a Charm is | something a touring musician would treasure: a stage, studio, merch or voice object, or a snack from the road (bible 7.4) | the Charms read as the crew's own kit, not as relics from a temple |
| D1-2 | Charm rules text | each `text` is rewritten in the glossary words with every number, status, resource, trigger and target the data uses (the treasure suite's machine summary); one sentence, at most 90 characters, no colon or semicolon inside | the treasure suite checks the sentence against the data; mechanics untouched |
| D1-3 | Charm flavour | one new line per Charm (at most 80 characters, ends with `.`, `!` or `?`), shown under the rules text in the Charm tooltip, the reward plaque and the Tour Bus tile. It is a new optional DATA field `flavor` on the relic (same spelling as the cards' `flavor`), display only: no logic, bot or save reads it | the owners asked for a flavour line per Charm; the cards already carry `flavor` |
| D1-4 | Rarity words | common `Common`, uncommon `Uncommon`, rare `Rare`, boss `Headliner`, shop `Merch` (Tour Bus subtitle `Rare charm for Jasmin`, `Headliner charm`, `Merch charm`) | boss Charms come from a Headliner's offer, shop Charms only from Jordan's stall |
| D1-5 | Boss Charms | six glamorous trades from the big stages, each with a real upside and a cost (two of them are Gloss temptations: Pitch Fixer and Glowing Phone) | a Headliner's gift is shiny and costs you something; the Gloss is tempting, never evil |
| D1-6 | Hero Charms | the three Charms of each hero are pieces of that hero's look or rig (Jasmin's scrunchie, necklace, hoop; RoxorLoops's shoes, tee, green mic; RawClaw's spare headphones, sampler pad, spring reverb; Andy's strings, subwoofer, bass cabinet) | the owners' visual briefs become loot |
| D1-7 | Owner nods in Charms | The Viral Clip (`branching_bookmark`, binding), a loop gadget (`sands_of_patience`, no hero's prop), five snacks from the road, three skin nods (Cosy Onesie, Unicorn Headband, Goat Mask), the cherry blossom badge (the owners' logo) and Jordan's merch (Tote Bag, Sticker Sheet, Crew Lanyard, Mystery Pin) | owners' brief; bible 2.7 and 2.9 |
| D1-8 | Song titles | no Charm, gem or Sticker beyond the bible's `Still Human` carries a song title ("Arabic Impro", "Calling of the Moon" and "Human" stay placed exactly once each, H17) | bible H17 wins over the brief's "may appear as Charms and Stickers" |
| D1-9 | Skins | Charms only nod to the outfits; they never unlock or equip one. The three outfits unlock from the Stickers `petal_and_steel`, `ink_and_insight`, `moonlit_vigil` (bible 7.1), listed in the Sticker table's last column | skins are presentation only and read at render time |
| D1-10 | Gems | `<musical or magic word> <stone>`, pink stones for the `red` family (rose quartz, spinel, tourmaline, rhodonite, kunzite, morganite), only mineral stones and amber (a tree resin); never pearl or coral | bible 7.4, H5 |
| D1-11 | Icons | every `art.m` and `art.c` id stays; the icon looks below tell the art plan what each Charm's icon must show (a per-relic redraw, since `LISTS.relicIcons` motifs are shared with card art) | H1; a Charm called Triangle cannot keep a wolf fang icon |

Rules every string here obeys (bible section 6 and the suites `treasure`, `content`, `narrative`): printable ASCII; no em or en dash, no
` - ` or `--`; British spelling; no kill, die, dead, death, blood; no animal product as a name, food or material (H5: no honey, pearl,
shell, feather, fang, skull, leather, wool, silk, felt); food appears and is never called vegan, plant-based, healthy or anything like it
(H6); no admin (H4); no real names, shows, platforms or venues (H3); no Echowake or Inkwoven word (6.2, 6.3); no reserved name reused
(H16: Spells, statuses, keywords, tiles, Headliners, passives, starters, Stickers, Encores, Untangle, Mic Squeal, Botling, the 160 card
names of `HV_HEROES.md`, the 51 enemy names of `HV_ENEMIES.md`). Relic names 4 to 28 characters, gem names 8 to 28 characters, all
unique across cards, Charms, gems and enemies (content suite).

## 2. Charms (`js/data_relics.js`, 66 ids: common 22, uncommon 22, rare 12, boss 6, shop 4)

Columns: the rules `text` is exact (it replaces the Echowake `text`), the flavour is exact (new `flavor` field, D1-3), the icon look
is a brief for the art plan, the last column marks the owners' nods.

### 2.1 Common (22)

| id (stays) | Echowake name | **new name** | rules text (exact) | flavour (exact) | icon look | nod |
|---|---|---|---|---|---|---|
| `brass_lantern` | Brass Lantern | **Tour Poster** | `At the start of each act, unmute 2 hexes for free towards the headliner.` | `Jordan drew the whole route on it, with the headliner's name in glitter.` | a rolled poster, half open, a star and a dotted route on it | Jordan |
| `paper_umbrella` | Oil-Paper Umbrella | **Pop Filter** | `Each hero gains 1 Block at the start of every turn.` | `It stops the p-pops before they reach the mic, and a few other things too.` | a round mesh disc on a bendy gooseneck clip | |
| `fortune_coin` | Fortune Coin | **Busking Hat** | `Combat and gift box gold is 25% higher.` | `Upside down on the cobbles, it always comes back heavier than it went.` | an upturned straw boater with three gold coins inside | |
| `steaming_teacup` | Steaming Teacup | **Travel Mug** | `Healing outside combat is 25% stronger.` | `Ginger and lemon for the throat, and a sticker from every stop.` | a lidded travel mug covered in little stickers, a curl of steam | snack |
| `rice_ball` | Rice Ball | **Warm Oat Bar** | `After each fight, both heroes heal 2 HP, and the one with less HP heals 2 more.` | `Fresh from the Snack Pier. Break it in two and give away the bigger half.` | a golden oat bar snapped in two, a wisp of warmth | snack |
| `wooden_comb` | Wooden Comb | **Mixtape** | `Whenever you reshuffle your draw pile, both heroes gain 5 Block.` | `When side A ends, side B starts. Nobody remembers which side is which.` | a cassette with a hand-written label and two spinning reels | |
| `pilgrim_compass` | Pilgrim's Compass | **Pitch Pipe** | `Every 5th hex you unmute refunds 1 Vox.` | `One little toot every few streets, to remember where the note lives.` | a round chrome pitch pipe with a ring of little holes | |
| `bounty_scroll` | Bounty Scroll | **Battle Trophy** | `Winning a Rival fight pays 20 extra gold.` | `A beatbox battle trophy, gold plastic and very proud of itself.` | a small gold cup topped with a mic | |
| `ink_jar` | Bottled Echo | **Jar of Giggles** | `Start each act with 2 more Vox.` | `Every giggle mid-song, saved for later. Open one at the start of each act.` | a corked jar of bouncing pink and green sparkles | gag: imperfect is the hero word |
| `inkstone_weight` | Heavy Singing Bowl | **Giant Water Bottle** | `Your Vox pool can hold 2 more, and taking this gives both heroes 3 max HP.` | `Two whole litres. Jordan stuck nine HYDRATE stickers on it, just in case.` | a tall bottle with a flip straw and a column of stickers | Jordan |
| `heart_charm` | Heartwood Charm | **Cosy Onesie** | `When you take this, both heroes gain 5 max HP.` | `Green, with a big smiley on the belly. Somebody always packs a spare.` | a folded green onesie, a black smiley on the front | skin: Monster Onesie |
| `wolf_fang` | Wolf Fang | **Foam Finger** | `Whenever you defeat an enemy, that hero gains 3 Block.` | `A giant foam hand that points at whoever just won the crowd over.` | a big lime foam hand pointing up, a little star | |
| `sturdy_shell` | Tortoise Shell | **Gig Bag** | `Whenever a hero is hit, they gain 3 Block (twice a turn).` | `Padded, battered, and somehow still holding its zip together.` | a padded soft case with a patched corner and a zip | |
| `ember_charm` | Ember Charm | **Spark Fountain** | `At the start of combat, apply 3 Sizzle to all enemies.` | `Cold sparks on the first beat, and suddenly everyone else is sweating.` | a little stage cone spraying a fan of gold sparks | |
| `paper_crane` | Paper Crane | **Trumpet Mute** | `At the start of combat, apply 1 Muffled to all enemies.` | `Pop it into the bell and even the loudest trumpet says please.` | a cone-shaped brass mute with a cork band | |
| `green_bamboo` | Green Bamboo | **Smoke Machine** | `On the first turn of each fight, both heroes gain 6 Block.` | `One big puff on the first beat, and nobody can see where the band went.` | a small box with a nozzle puffing a soft cloud | |
| `flute_of_changing_tunes` | Flute of Changing Tunes | **Wireless Mic** | `Whenever you swap spots, draw 1 card (once per turn).` | `No cable, no tangles, and a great deal more running about.` | a handheld mic with a tiny aerial and motion lines | |
| `burnt_offering` | Burnt Offering | **Glow Stick** | `Whenever a card fades, its hero gains 3 Block.` | `Crack it as a song fades out, and the glow lasts a little longer.` | a bent glow stick in pink, glowing softly | |
| `pressed_petal` | Pressed Petal | **Pink Scrunchie** | `At the start of your turn, Jasmin gains 1 Bloom.` | `It has never once moved, whatever happens. It smells of cherry blossom.` | a pink scrunchie with a blossom tucked in it | Jasmin's look |
| `vial_of_spare_ink` | Spare Mouthpiece | **Lime Shoes** | `RoxorLoops starts each combat with 3 Groove.` | `Bright enough to see from the cheap seats. The groove starts in the feet.` | a pair of lime trainers, one mid-tap | RoxorLoops's look |
| `mizuhiki_cord` | Mizuhiki Cord | **Spare Headphones** | `At the start of your turn, RawClaw gives his ally 3 Block.` | `He always carries a second pair, for whoever is standing next to him.` | violet over-ear headphones looped on a hook | RawClaw's kit |
| `juzu_beads` | Juzu Beads | **Heavy Strings** | `Whenever Andy is hit, deal 3 damage to the attacker (twice a turn).` | `Thick, round and very low. Thump them and the floor thumps back.` | a coiled set of four bass strings in an orange packet | Andy's kit, gag 7 |

### 2.2 Uncommon (22)

| id (stays) | Echowake name | **new name** | rules text (exact) | flavour (exact) | icon look | nod |
|---|---|---|---|---|---|---|
| `fox_mask` | Fox Mask | **Goat Mask** | `Every 2nd time you swap spots, the new lead hero gains 1 Shimmy (once per turn).` | `Found on a rooftop studio. Its owner insists it is not a costume.` | a cream goat mask with curled ears and a beard tassel | skin: Goat Suit, gag 6 |
| `silver_bell` | Silver Bell | **Triangle** | `The first time a hero is hit each fight, both heroes gain 6 Block.` | `Ting. One ting, and the whole band stands up a little straighter.` | a silver triangle with its beater and a ring of ting lines | |
| `well_kasa` | Bell-Ringer's Kasa | **Tour Kettle** | `Tea stalls give 1 more Vox.` | `Packed between the amp and the snacks. Every tea stall fills it up.` | a round kettle with a sticker on it, steam curling | |
| `loaded_dice` | Loaded Dice | **Lucky Plectrum** | `Rare cards appear 8 percentage points more often in card rewards.` | `Found under a sofa backstage. Rare things have kept happening ever since.` | a gold plectrum with a four-leaf sparkle | |
| `sable_brush` | Songbird Whistle | **Mic-Wand Keyring** | `At the start of each act, learn a random Spell.` | `A tiny mic with a star on top. Give it a wave and a new trick falls out.` | a key ring with a little mic-wand, a star and sparkles | |
| `plum_pendant` | Plum Blossom Pendant | **Blossom Badge** | `Every 3rd hex you unmute refunds 1 Vox.` | `The duo's own cherry blossom badge. A petal drifts back every few streets.` | a round pin badge with a pink five-petal blossom | the owners' logo |
| `shrine_box` | Offering Box | **Fruit Bowl** | `When you rest at a green room, gain 2 Vox.` | `Grapes, clementines and one very brave banana, waiting backstage.` | a bowl of grapes, two clementines and a banana | snack |
| `whetstone` | Honing Stone | **Practice Pad** | `When you take this, upgrade 3 random cards in your deck.` | `Hours of quiet tap tap tap in the van. It all comes out on stage.` | a round drum practice pad with two crossed sticks | |
| `koi_pouch` | Koi Pouch | **Tote Bag** | `When you take this, gain a random tier 2 gem.` | `It has a picture of a tote bag on it. Something sparkly is inside.` | a teal tote bag printed with a tiny tote bag, a gem peeking out | Jordan, gag 5 |
| `facet_lens` | Facet Lens | **Rhinestone Mic** | `The first time each turn you play a card with a gem, gain 3 gold and 3 Block.` | `Every gem catches the stage lights, and the coins come flying in.` | a mic studded with coloured stones, coins bouncing off | |
| `jewelers_loupe` | Jeweler's Loupe | **Glitter Glasses** | `The first time each turn you play a card with a gem, draw 1 card.` | `Heart-shaped and very sparkly. Anything shiny looks twice as good.` | heart-shaped sunglasses with glittery frames | |
| `war_banner` | War Banner | **Stage Light** | `The lead hero deals 1 more damage with every hit.` | `Whoever stands in it sings a little bolder.` | a stage can light throwing a warm cone downward | |
| `dancer_geta` | Dancer's Geta | **Roller Skates** | `You get 1 more free swap each turn.` | `Nobody admits to packing them, and everybody borrows them.` | one pastel roller skate with spinning wheels | |
| `remembrance_candle` | Remembrance Candle | **Fairy Lights** | `If the lead hero has no Block at the end of your turn, they gain 6 Block.` | `Wound round the mic stand. They twinkle on when it gets dark out front.` | a mic stand wrapped in a string of warm bulbs | |
| `battle_drum` | Battle Drum | **Floor Tom** | `Whenever you play a card that costs 2 or more, draw 1 card (once per turn).` | `The biggest drum in the kit. Hit it hard and something good falls out.` | a deep floor tom on three legs, a stick mid-hit | |
| `hungry_skull` | Hungry Skull | **Bag of Grapes** | `Whenever you defeat a Creature or Rival, that hero heals 2 HP.` | `One grape for every crowd you win over. It is a very big bag.` | a paper bag spilling a bunch of purple grapes | snack |
| `longbow_of_reach` | Longbow of Reach | **Megaphone** | `Your first 2 Attacks each turn deal 3 more damage when played from the backing spot.` | `From the back of the stage it reaches all the way to the front.` | a white and orange megaphone with three sound arcs | |
| `wintry_bell` | Wintry Bell | **Instant Camera** | `At the start of combat, apply 1 Exposed to all enemies.` | `Flash! Everyone in the photo looks a little surprised, and very exposed.` | a chunky instant camera with a photo sliding out, a flash star | |
| `spring_tsuba` | Spring Tsuba | **Heart Necklace** | `Whenever Jasmin defeats an enemy, she gains 2 Bloom and 3 Block.` | `A little gold heart that glows warm whenever she wins somebody over.` | a fine chain with a small gold heart, a pink glow | Jasmin's look |
| `scholars_spectacles` | Pocket Metronome | **Smiley Tee** | `Every 2nd Skill RoxorLoops plays, he draws 1 card and gains 1 Groove.` | `Black, with a big orange smiley that grins a bit wider on every beat.` | a folded black tee with a big orange smiley | RoxorLoops's look |
| `crescent_kanzashi` | Crescent Kanzashi | **Sampler Pad** | `At turn start, if RawClaw has 3 or more Reverb, both heroes cleanse debuffs and heal 2 HP.` | `Tap the blue pad and everything sounds clean again. Not glossy, clean.` | a square drum pad with nine pads, one lit blue | RawClaw's kit |
| `thunder_wheel` | Thunder Wheel | **Subwoofer** | `Every 3rd Attack Andy plays, he gains 2 Rumble and deals 4 damage to all enemies.` | `Every third note, the cups on the table start to ripple.` | a boxy speaker with one huge cone and orange ripples | Andy's kit, gag 7 |

### 2.3 Rare (12)

| id (stays) | Echowake name | **new name** | rules text (exact) | flavour (exact) | icon look | nod |
|---|---|---|---|---|---|---|
| `jade_key` | Jade Key | **Backstage Pass** | `At each green room you may take 1 more action, and a rest also heals both heroes 4 HP.` | `All areas. Stay as long as you like, and do have a sit down.` | a laminated pass on a teal lanyard, a big ALL AREAS star | |
| `branching_bookmark` | Harmony Ribbon | **The Viral Clip** | `Card rewards offer 1 more card.` | `Somebody always has it on their phone. Since then, the offers pour in.` | a phone showing a play button, little hearts floating up (no numbers, no logo) | THE VIRAL CLIP (bible 2.9, binding) |
| `phoenix_feather` | Phoenix Feather | **Spare Mic** | `The first time a hero loses their voice each fight, bring them back with 25% HP.` | `Lost your voice? Here, take this one. Jordan put a sticker on it.` | a second mic with a heart sticker, a small sparkle | Jordan |
| `prism_crown` | Prism Crown | **Unicorn Headband** | `Whenever you play a card with 2 or more gems, gain 1 Breath (once per turn).` | `A rainbow mane and a gold sparkle on top. Gems feel right at home.` | a pastel headband with a rainbow mane and a little gold cone on top | skin: Unicorn Onesie |
| `mirror_of_two_faces` | Mirror of Two Faces | **Twin Mic Stand** | `Whenever you swap spots, gain 1 Breath (once per turn).` | `Two mics on one stand. Whoever steps up takes a lovely big breath.` | one stand with a pink mic and a green mic on a Y bar | the duo |
| `formation_scroll` | Marching Cadence | **Stage Markers** | `Lead hero starts turns with 3 Block, and the backing hero gains 1 extra Block from cards.` | `Little crosses of tape on the floor. Everyone knows exactly where to stand.` | two crosses of coloured tape, one pink, one green | |
| `dragon_pearl` | Dragon Pearl | **Gold Record** | `Whenever you defeat a Rival, both heroes gain 2 max HP.` | `Framed on the wall of the van. It shines a bit brighter after every rival.` | a gold disc in a frame with a little star label | |
| `sands_of_patience` | Sands of Patience | **Three-Bar Loop** | `Every 3rd turn, gain 1 Breath and draw 1 card.` | `Three bars, round and round. Somehow it always lands on the one.` | a small pedal with one big footswitch and a three-dot loop ring | a loop gadget, no hero's prop |
| `hundred_petal_fan` | Hundred Petal Fan | **Hoop Earring** | `Whenever Jasmin plays a 0-cost Attack, draw 1 card and gain 1 Bloom (twice a turn).` | `One gold hoop. It sways on every little note, and the little notes add up.` | a single gold hoop swinging, two petals in its arc | Jasmin's look |
| `nightlong_inkwell` | Nightlong Dirge | **Green Mic** | `At the end of your turn, RoxorLoops applies 2 Earworm to all enemies.` | `Cupped in both hands, it leaves a beat stuck in every head in the room.` | a round green mic in two cupped hands, sound rings popping out | RoxorLoops's look |
| `lotus_sanctuary` | Lotus Sanctuary | **Spring Reverb** | `RawClaw gains 1 more Reverb a turn and at 4 spends it for Muffled on all, 3 Block on both.` | `Give it a shake and it goes boing. Leave it alone and it fills the room.` | a long violet tank with a coiled spring inside, wavy lines | RawClaw's kit |
| `stormtiger_sash` | Stormtiger Sash | **Bass Cabinet** | `Andy gains 1 Rumble when hit, and at 8 Rumble he spends it for 10 damage to all enemies.` | `Eight speakers and one very calm man. You feel it before you hear it.` | a tall cabinet of eight speaker cones, orange rumble lines on the floor | Andy's kit, gag 7 |

### 2.4 Headliner (boss, 6): each one is a trade

| id (stays) | Echowake name | **new name** | rules text (exact) | flavour (exact) | icon look | nod |
|---|---|---|---|---|---|---|
| `tyrants_crown` | Tyrant's Crown | **Pitch Fixer** | `Gain 1 Breath each turn, but taking this adds 3 Curses to your deck.` | `Flawless! So clean! Every note perfect, and a little bit of you missing.` | an opalescent pastel box with one perfect sine wave on its screen | the Gloss, gag 9 |
| `book_of_falling_leaves` | Song of Falling Leaves | **Glowing Phone** | `Draw 1 more card each turn, but healing outside combat is 40% weaker.` | `Just one more swipe. And one more. Who needs a lie-down anyway?` | a phone glowing blue, a feed of little cards sliding up | Scrollopolis |
| `blood_moon_vow` | Blood Moon Vow | **Stage Pyro** | `Gain 1 Breath each turn, but both heroes lose 2 HP at the start of your turn.` | `Big flames on every chorus. Very exciting, and just a little bit toasty.` | two stage flame jets in orange and gold | |
| `toll_bridge` | Toll Bridge | **Golden Ticket** | `Taking this gives a tier 3 gem and 2 more cards per reward, but stall prices rise 25%.` | `Everything is on offer now, and everything costs a little more.` | a shiny gold ticket stub with a star punched through | |
| `ironclad_tsuba` | Ironclad Tsuba | **Flight Case** | `Heroes gain 2 Block a turn and start fights with 3 Feedback, but you draw 1 fewer card.` | `Heavy, dented and covered in stickers. Hit it and it squeals right back.` | a black flight case with silver corners and sticker patches | |
| `bottomless_gourd` | Bottomless Gourd | **Extra Spicy Noodles** | `Both heroes start each fight with 3 Volume, but also with 2 Exposed.` | `Too hot to taste and too good to stop. You sing louder, and you sweat.` | a steaming red noodle bowl with chopsticks and three little flames | snack, gag 10 |

### 2.5 Merch (shop, 4): sold only at Jordan's Merch Stall

| id (stays) | Echowake name | **new name** | rules text (exact) | flavour (exact) | icon look | nod |
|---|---|---|---|---|---|---|
| `fox_haggler_token` | Fox Haggler's Token | **Crew Lanyard** | `All merch stall prices are 20% lower.` | `Jordan's own design. Flash it at any stall for the crew price.` | a teal lanyard with a CREW card and a tiny star | Jordan |
| `merchants_seal` | Merchant's Seal | **Sticker Sheet** | `After every fight, gain 8 gold.` | `Hand them out after the show. Somehow the coins come back the other way.` | a sheet of stickers (blossom, smiley, goat, star), one peeling | Jordan |
| `apothecary_jar` | Apothecary Jar | **Post-Show Smoothie** | `At the end of each fight you win, both heroes heal 3 HP.` | `Mango, banana and ginger, blended on the back of a bike by the pier.` | a tall orange smoothie with a stripy straw | snack |
| `pearl_satchel` | Pearl Diver's Satchel | **Mystery Pin** | `When you enter a merch stall, gain a random tier 1 gem.` | `Jordan slips one into every bag. Nobody knows which until it sparkles.` | a little paper envelope with a question mark and a sparkle | Jordan |

### 2.6 The nods, counted

- The viral clip: `branching_bookmark` **The Viral Clip** (binding, bible 2.9). No numbers, no show, no judges, no channel.
- A loop gadget, no hero's prop: `sands_of_patience` **Three-Bar Loop**. Gag 4 ("just for emergencies") stays with RoxorLoops's Loop
  Station card and his hero entry; Andy's loop pedal is his own. One Charm, no hero named.
- Snacks from the road (never remarked on, H6): `steaming_teacup` Travel Mug, `rice_ball` Warm Oat Bar, `shrine_box` Fruit Bowl,
  `hungry_skull` Bag of Grapes, `bottomless_gourd` Extra Spicy Noodles (gag 10), `apothecary_jar` Post-Show Smoothie.
- Skin nods (they never unlock or equip an outfit): `heart_charm` Cosy Onesie (RoxorLoops's Monster Onesie), `prism_crown` Unicorn
  Headband (Jasmin's Unicorn Onesie), `fox_mask` Goat Mask (RawClaw's Goat Suit). Their flavour never names a hero, so a Goat Mask can
  drop before RawClaw joins (it is the same teaser as the `ch1_clear` entry's goat on a rooftop).
- Hero looks and kits: 12 hero Charms (D1-6). Each names only its own hero in its rules text (the suite requires it) and never another.
- Jordan's merch: Tour Poster, Giant Water Bottle, Tote Bag, Spare Mic, Crew Lanyard, Sticker Sheet, Mystery Pin.
- The Gloss: Pitch Fixer (it compliments, gag 9), Glowing Phone (Scrollopolis), Sampler Pad ("Not glossy, clean").

## 3. Gems (`js/data_gems.js`, 24 ids)

Display colour words (bible 4.1): `red` shows as **Pink**, then Blue, Green, Gold. Gem rules text is generated by `DATA.gemText` from
`mod`, so only the names change, plus the one hand-written text of `heartflame_topaz` (bible 4.3). The `art.cut` stays; the look is
the glint the art plan may paint inside the cut. Longest name: `Deep Breath Tourmaline` (22 characters, one more than Echowake's
longest): re-measure the gem plaque and the Sparkle Booth tile on a phone.

| id (stays) | colour (display) | tier | cut (stays) | Echowake name | **new name** | one-line look | what it does (unchanged, for reference) |
|---|---|---|---|---|---|---|---|
| `ember_ruby` | Pink | 1 | round | Ember Ruby | **Forte Rose Quartz** | milky pink rose quartz with a small bright crescendo hairpin glinting inside | +2 damage per hit |
| `vanguard_garnet` | Pink | 1 | square | Vanguard Garnet | **Leading Note Spinel** | hot pink spinel with an arrow-shaped glint pointing forward | Lead: +3 damage |
| `twinfang_spinel` | Pink | 2 | oval | Twinfang Spinel | **Trill Tourmaline** | pink tourmaline with two quick sparkles side by side | +1 hit |
| `bloodmoon_carnelian` | Pink | 2 | drop | Bloodmoon Carnelian | **Callback Rhodonite** | rosy rhodonite with dark veins curling round and coming back | 4 damage that heals you as much |
| `sunfall_ruby` | Pink | 3 | star | Sunfall Ruby | **Fortissimo Kunzite** | lilac pink kunzite with rings of light spreading out to the edges | also 6 damage to all enemies |
| `kirin_jasper` | Pink | 3 | drop | Kirin Jasper | **Showstopper Morganite** | peachy pink morganite with a tiny starburst at its heart | Lead: +1 hit and +3 damage |
| `tidewatch_sapphire` | Blue | 1 | round | Tidewatch Sapphire | **Lullaby Sapphire** | calm deep blue with a soft crescent glint | +3 Block, +2 healing |
| `thornwake_lapis` | Blue | 1 | oval | Thornwake Lapis | **Talkback Lapis** | lapis blue with gold flecks that crackle like a squeal of feedback | gain 2 Feedback |
| `mirrorlake_aquamarine` | Blue | 2 | square | Mirrorlake Aquamarine | **Two Step Aquamarine** | pale sea-glass aquamarine with two little footprint glints | +2 Block, gain 1 Shimmy |
| `springwell_tanzanite` | Blue | 2 | drop | Springwell Tanzanite | **Harmony Tanzanite** | violet blue tanzanite with two overlapping glints | heal both heroes 2 |
| `ironbark_sapphire` | Blue | 3 | star | Ironbark Sapphire | **Monitor Sapphire** | inky blue sapphire with a speaker-cone ring inside | +3 Block, gain 4 Feedback |
| `sanctum_iolite` | Blue | 3 | drop | Sanctum Iolite | **Unison Iolite** | violet blue iolite that shows a second colour from the other side | both heroes gain 6 Block |
| `quickthought_emerald` | Green | 1 | round | Quickthought Emerald | **Sight Read Emerald** | bright emerald with a tiny row of glints like notes on a line | draw 1 card |
| `keepsake_peridot` | Green | 1 | oval | Keepsake Peridot | **Sustain Peridot** | lime peridot with one long soft glint held across it | Hold |
| `evergreen_jade` | Green | 2 | square | Evergreen Jade | **Evergreen Jade** (kept on purpose) | deep jade with a leaf-shaped glint that never dims | draw 1, the card no longer fades |
| `scholars_malachite` | Green | 2 | drop | Scholar's Malachite | **Rewind Malachite** | banded malachite whose rings curl back like a rewound tape | put a card from the discard pile into your hand |
| `featherlight_emerald` | Green | 3 | star | Featherlight Emerald | **Falsetto Emerald** | pale, airy emerald that seems to float a little above the slot | costs 1 less |
| `wellspring_tourmaline` | Green | 3 | drop | Wellspring Tourmaline | **Deep Breath Tourmaline** | green tourmaline with bubbles of light rising inside | gain 1 Breath |
| `sunwake_topaz` | Gold | 1 | round | Sunwake Topaz | **Turn It Up Topaz** | golden topaz with a tiny volume-dial glint | gain 1 Volume |
| `coinluck_citrine` | Gold | 1 | oval | Coinluck Citrine | **Tip Jar Citrine** | warm lemon citrine with a coin-shaped glint | gain 4 gold |
| `inkwell_amber` | Gold | 2 | square | Ringing Amber | **Afterglow Amber** | warm amber that keeps glowing after the light has moved on | gain 1 Vox, 2 gold and 3 Warm Tea |
| `heartflame_topaz` | Gold | 2 | drop | Heartflame Topaz | **Heartstrings Topaz** | rich golden topaz with a small heart glint | text (exact, bible 4.3): `If you hold Bloom, Groove, Reverb or Rumble, gain 2 more of it.` |
| `solstice_citrine` | Gold | 3 | star | Solstice Citrine | **Key Change Citrine** | bright citrine whose glint steps up a level as it turns | gain 1 Crescendo and 2 Volume |
| `dusklight_amber` | Gold | 3 | drop | Dusklight Amber | **Backbeat Amber** | dusky amber with a soft pulse on every second beat | Backing: draw 2, gain 1 Shimmy |

Why `Evergreen Jade` stays: an "evergreen" is a song that never gets old, and this gem stops a card from fading. It holds no
Echowake or Inkwoven word. Every other gem name is new. Amber is a tree resin, not an animal product (bible 7.4 lists it).

## 4. Stickers (achievements, 32 ids; name and text copied from bible 4.7; `stat` and `reward` unchanged)

The Cheers column is the unchanged `reward.inkstones`. The last column is what the Sticker also unlocks (heroes by the existing engine
rule; outfits by bible 7.1, read at render time, nothing stored).

| id (stays) | Echowake name | **new name** | text (exact) | Cheers | also unlocks |
|---|---|---|---|---|---|
| `ch1_clear` | Out of the Grove | **Mics Returned** | `Defeat Kraki, the Karaoke Kraken, and finish the first act.` | 10 | hero `suzu`: `RawClaw joins the tour!` |
| `ch2_clear` | Lanterns Out | **Heads Up** | `Defeat Scrollspinner, Queen of the Feed, and let the city look up.` | 15 | hero `raiga`: `Andy joins the tour!` |
| `ch3_clear` | The Last Note | **Still Human** | `Defeat Flawless and sing the last song together.` | 30 | (the "Human" nod, bible 2.9) |
| `first_draft` | First Rehearsal | **First Gig** | `Finish your first tour, win or lose. Every tour starts somewhere.` | 3 | |
| `regular_reader` | Regular Listener | **Regular on the Road** | `Finish 10 tours. The Soundlands are starting to recognise your voice.` | 8 | |
| `happy_endings` | Happy Endings | **Crowd Pleaser** | `Win 5 tours. Some tours are worth taking more than once.` | 20 | |
| `petal_and_steel` | Petal and Steel | **In Full Bloom** | `Win 3 tours with Jasmin in the party.` | 15 | outfit `Unicorn Onesie` (Jasmin) |
| `ink_and_insight` | Flute and Insight | **Party at the Back** | `Win 3 tours with RoxorLoops in the party.` | 15 | outfit `Monster Onesie` (RoxorLoops) |
| `moonlit_vigil` | Moonlit Vigil | **Not a Costume** | `Win 3 tours with RawClaw in the party.` | 15 | outfit `Goat Suit` (RawClaw) |
| `thunder_and_laughter` | Thunder and Laughter | **Just Andy** | `Win 3 tours with Andy in the party.` | 15 | (no outfit yet) |
| `cartographer` | Cartographer of Echoes | **Volume Up** | `Unmute 500 hexes across all your tours.` | 10 | |
| `brush_collector` | Song Collector | **Spellcaster** | `Cast 25 Spells on the map.` | 10 | |
| `treasure_hunter` | Treasure Hunter | **Unboxing** | `Open 25 gift boxes.` | 10 | |
| `curio_cabinet` | Curio Cabinet | **Charm Bracelet** | `Find 50 charms across your tours.` | 12 | |
| `fable_fan` | Fable Fan | **Scenic Route** | `Take 60 detours. Some of them were even shortcuts.` | 10 | |
| `big_spender` | Big Spender | **Merch Legend** | `Spend 3000 gold at merch stalls. Jordan sends his regards.` | 10 | |
| `jewellers_eye` | Jeweller's Eye | **Bedazzled** | `Socket 40 gems into your cards.` | 10 | |
| `pest_control` | Pest Control | **Crowd Control** | `Defeat 500 creatures of the Soundlands.` | 12 | |
| `champion_hunter` | Champion Hunter | **Rivalry** | `Defeat 40 rivals.` | 12 | |
| `not_a_scratch` | Not a Scratch | **Not a Wobble** | `Defeat a headliner without taking a single point of damage.` | 25 | |
| `wall_breaker` | Wall Breaker | **Mic Drop** | `Land a single hit for 50 or more damage. Please do not actually drop the mic.` | 10 | |
| `one_big_sentence` | One Big Crescendo | **Big Finish** | `Deal 100 damage in a single turn.` | 12 | |
| `free_verse` | Free Verse | **Freestyle** | `Play 3 or more free cards in one turn, on 10 different turns.` | 8 | |
| `slow_burn` | Slow Burn | **Stuck in Your Head** | `Finish off 30 enemies with Earworm. Patience is a weapon.` | 8 | |
| `minimalist_author` | Minimalist Composer | **Less Is More** | `Win a tour with 15 cards or fewer. Every note earns its place.` | 20 | |
| `charity_case` | Charity Case | **Kindness of Strangers** | `Be helped by a passer-by 3 times. It happens to the best of us.` | 5 | |
| `face_in_the_petals` | Face in the Petals | **Voice Crack** | `Have a hero lose their voice 30 times. Getting back up counts too.` | 5 | |
| `musical_chairs` | Musical Chairs | **Switch It Up** | `Swap spots 300 times. Nobody is sitting down.` | 8 | |
| `daily_reader` | A Jam a Day | **Duet a Day** | `Play 5 Daily Duets.` | 10 | |
| `inkling` | First Beat | **First Encore** | `Win a tour on Encore 1.` | 10 | |
| `ink_adept` | Tempo Adept | **Crowd Favourite** | `Win a tour on Encore 5.` | 25 | |
| `master_of_ink` | Master of Tempo | **Standing Ovation** | `Win a tour on Encore 10. Even the Gloss claps along.` | 60 | |

Sticker earned toast (bible 4.1): `Sticker earned: ` + name. New outfit card on the end screen (bible 7.1): `New outfit: ` + outfit name.

## 5. Encores (difficulty, 10 trial ids; copied from bible 4.6; `level` and `mods` unchanged)

| id (stays) | level | Echowake name | **new name** | text (exact) |
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

`trial_7` (section 14.2): bible 6.3 bans the token "edition"; `Limited Edition` is a merch phrase, now an allowed survivor in bible 6.4,
and the theme-leak suite allowlists it with that reason.

## 6. Map tiles (14 ids; name and text copied from bible 4.4; look from its stamp art column)

UI reads tile names from `DATA.tiles` (the forge screen title is `'The ' + DATA.tiles.forge.name`, "The Studio").

| id (stays) | Echowake name | **new name** | text (exact) | one-line look (map stamp) |
|---|---|---|---|---|
| `start` | Downbeat | **Soundcheck** | `Where the tour begins.` | the little tour van with a mic stand beside it |
| `empty` | Path | **Path** | `Open ground.` | plain live ground: cobbles, bunting shadows or screen tiles by Act |
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

## 7. Spells (the 6 `DATA.brushes` ids, the map shapes; copied from bible 4.5; `kind` and `len` unchanged)

Spell names are reserved (H16): no Charm, gem, card or enemy uses them.

| id (stays) | shape | Echowake name | **new name** | text (exact) | cast sound (audio plan) |
|---|---|---|---|---|---|
| `stroke` | line 3 | Drum Line | **Boots and Cats** | `Unmute 3 hexes in a straight line, starting next to any live hex.` | the classic beatbox "boots and cats" pattern |
| `wave` | line 5 | Ripple | **Vocal Run** | `Unmute 5 hexes in a straight line, starting next to any live hex.` | a five-note sung run upward |
| `fan` | fan | Shout | **Air Horn** | `Unmute a wedge of 3 hexes next to a live hex.` | a beatboxed air horn |
| `splash` | blob | Beat Drop | **Abracadabass** | `Unmute a hex next to the live ground and the 6 hexes around it.` | "abraca" sung, then a throat-bass drop |
| `halo` | ring | Chorus | **Surround Sound** | `Unmute all 6 hexes around any live hex.` | a stacked "ooh" chord panning in a circle |
| `blot` | dot | Hum | **Hocus Focus** | `Unmute any one hex within 4 of the party.` | a single bright "ting" and a whispered "ta-da" |

## 8. Keywords (16 ids; copied from bible 4.2)

| id (stays) | Echowake name | **new name** | reminder text (exact) |
|---|---|---|---|
| `block` | Block | **Block** | `Absorbs damage this turn. Wears off at the start of the owner's next turn.` |
| `exhaust` | Exhaust | **Fade** | `Fades out of the fight after it is played. It returns next combat.` |
| `retain` | Retain | **Hold** | `Stays in your hand at the end of the turn.` |
| `innate` | Innate | **Opener** | `Always in your opening hand.` |
| `ethereal` | Ethereal | **One Take** | `Fades if it is still in your hand at the end of the turn.` |
| `unplayable` | Unplayable | **Unplayable** | `Cannot be played.` |
| `front` | Front row | **Lead** | `The lead hero takes most enemy attacks. A card line starting Lead: only works while its hero stands here.` |
| `back` | Back row | **Backing** | `The backing hero is safe from most enemy attacks. A card line starting Backing: only works while its hero stands here.` |
| `swap` | Swap | **Swap** | `Trade spots. One swap per turn is free, more cost 1 Breath.` |
| `ink` | Echo | **Vox** | `Spend Vox on the map to unmute a hex and reveal it.` |
| `brush` | Song | **Spell** | `A one-use Spell that unmutes a shape of hexes for free.` |
| `gem` | Gem | **Gem** | `Socket gems into card slots. A slot only accepts its own colour, rainbow slots accept any.` |
| `slot` | Gem slot | **Gem slot** | `Colour-matched socket. Gems change how the card plays.` |
| `prism` | Prism slot | **Rainbow slot** | `A rainbow slot accepts a gem of any colour.` |
| `xcost` | X cost | **X cost** | `Spends all your remaining Breath. The card reads X as the Breath spent.` |
| `down` | Downed | **Voiceless** | `A hero at 0 HP loses their voice: their cards clog your hand and they cannot be targeted. If both heroes lose their voice, the tour ends.` |

## 9. Statuses (20 ids; copied from bible 4.3; `kind`, `stack` and `hero` unchanged)

| id (stays) | kind | Echowake name | **new name** | reminder text (exact) |
|---|---|---|---|---|
| `might` | buff | Might | **Volume** | `Attacks deal +N damage per hit.` |
| `bulwark` | buff | Bulwark | **Soundproof** | `Gain +N extra Block whenever you gain Block from a card.` |
| `regen` | buff | Regen | **Warm Tea** | `At the start of its turn, heal N, then Warm Tea falls by 1.` |
| `thorns` | buff | Thorns | **Feedback** | `Whenever it is hit by an attack, the attacker takes N damage.` |
| `dodge` | buff | Dodge | **Shimmy** | `Shimmies out of the next N attack hits completely.` |
| `taunt` | buff | Taunt | **Spotlight** | `Enemy attacks that would strike the backing hero, or a random or lowest hero, hit this hero instead.` |
| `ritual` | buff | Ritual | **Crescendo** | `At the start of its turn, gain N Volume.` |
| `plating` | buff | Plating | **Sequins** | `At the start of its turn, gain N Block.` |
| `bloom` | resource (`hanae`) | Bloom | **Bloom** | `Jasmin's blossoms. Built by her sung attacks, spent by her finishers.` |
| `sumi` | resource (`kuro`) | Breath | **Groove** | `RoxorLoops's groove. Built layer by layer with his skills, dropped in his big beats.` |
| `ward` | resource (`suzu`) | Ward | **Reverb** | `RawClaw's reverb. It builds every turn, and he spends it to wrap the band in sound.` |
| `charge` | resource (`raiga`) | Charge | **Rumble** | `Andy's low end. Built by taking hits and striking, released as thunder from below.` |
| `vulnerable` | debuff | Vulnerable | **Exposed** | `Takes 50% more attack damage.` |
| `weak` | debuff | Weak | **Muffled** | `Deals 25% less attack damage.` |
| `frail` | debuff | Frail | **Wobbly** | `Gains 25% less Block from cards.` |
| `poison` | debuff | Poison | **Earworm** | `At the start of its turn, lose N HP (ignores Block), then Earworm falls by 1.` |
| `burn` | debuff | Burn | **Sizzle** | `At the end of the round, take N damage (ignores Block), then Sizzle halves.` |
| `stun` | debuff | Stun | **Starstruck** | `Skips its next action. A starstruck hero cannot play cards on their next turn.` |
| `bind` | debuff | Bind | **Tangled** | `While either hero is Tangled, neither hero can swap spots.` |
| `mark` | debuff | Mark | **Tag** | `The next N attack hits against it deal +3 damage each (one stack per hit).` |

## 10. The Tour Bus (meta hub, `js/screen_menu.js` library screen, ids and classes `library`, `mn-lib*` unchanged)

Bible 5.5 fixed the banner, the tabs and the main empty states; this table completes every player-facing string of the screen. Keys
1 to 6 and L; the tab `follow` is appended last (HV_STORY 5.3 owns its contents).

### 10.1 Frame and tabs

| Where (code) | Echowake | **Hocus Vocus (exact)** |
|---|---|---|
| banner `banner(...)` | `The Hall of Echoes` | `The Tour Bus` |
| title plaque (bible 5.1) | `Hall` | `Tour Bus` |
| currency box `aria-label` | `Chimes` | `Cheers` |
| `LIB_TABS` labels (ids stay) | `Unlocks`, `Achievements`, `Ballads`, `Bestiary`, `History` | `Unlocks`, `Stickers`, `Diary`, `Who's Who`, `Past Tours`, `Follow the duo` (new id `follow`, key 6) |
| `TIER_NAME` | `Minion`, `Creature`, `Champion`, `Keeper` | `Sidekick`, `Creature`, `Rival`, `Headliner` |
| `KIND_NAME` | `Card`, `Treasure`, `Gem` | `Card`, `Charm`, `Gem` |
| back button | `Back` | `Back` |

### 10.2 Unlocks tab

| Where | Echowake | **Hocus Vocus (exact)** |
|---|---|---|
| kind filter label and options | `Show`: `All`, `Cards`, `Treasures`, `Gems` | `Show`: `All`, `Cards`, `Charms`, `Gems` |
| hero filter group `aria-label` | `Filter by hero` | `Filter by hero` |
| hero chip (any) text and label | `Any hero` / `Every hero` | `Any hero` / `Every hero` |
| sort chip | `Affordable first` | `Affordable first` |
| empty filter | `Nothing in the Hall matches those filters.` + `Show everything` | `Nothing on the bus matches those filters.` + `Show everything` |
| nothing left | `The shelves are bare. Nothing is waiting to be unlocked yet.` | same (bible 5.5) |
| stamp | `UNLOCKED` | `UNLOCKED` |
| Charm tile subtitle | rarity + ` treasure` + (hero ? ` of ` + name) | rarity word (D1-4) + ` charm` + (hero ? ` for ` + name), e.g. `Rare charm for Jasmin`, `Headliner charm`, `Merch charm` |
| gem tile subtitle | `Tier N red gem` | `Tier N pink gem` (colour display name: pink, blue, green, gold) |
| section counts | `N of M unlocked` | `N of M unlocked` |
| unlock button | `Unlock` | `Unlock` |
| tile `aria-label` | `Unlocked.` / `Costs N Chimes. You can afford it.` / `Costs N Chimes.` | `Unlocked.` / `Costs N Cheers. You can afford it.` / `Costs N Cheers.` |
| disabled reason and toast | `You need N more Chimes` | `You need N more Cheers` |
| toasts | `You already own that` / `That cannot be unlocked` | `You already own that` / `That cannot be unlocked` |

### 10.3 Stickers tab

| Where | Echowake | **Hocus Vocus (exact)** |
|---|---|---|
| summary | `N of M done, N Chimes earned` | `N of M done, N Cheers earned` |
| sort label and options | `Sort`: `In order`, `Closest`, `Done first` | same |
| progress | `Done` + date / `N / M` | same |
| seal label | `Done` | `Done` |
| reward `aria-label` | `Reward N Chimes` | `Reward N Cheers` |
| empty | `No achievements yet.` | `No stickers yet.` |
| card art note | a seal or a star | Jordan's sticker look: a die-cut sticker with a white border and a tiny peel at one corner (art plan) |

### 10.4 Diary tab (lore `story`)

| Where | Echowake | **Hocus Vocus (exact)** |
|---|---|---|
| heading | `Setlist` | `Tour Diary` |
| sub line | `N of M ballads heard. Ballads you have not heard yet stay silent.` | `N of M entries read. Entries you have not reached yet stay sealed.` |
| `STORY_GROUPS` and the rest group | `The Verses`, `The Endings`, `The Voices`, `Stray Ballads` | `The Acts`, `The Endings`, `The Crew`, `Loose Entries` |
| row state | `Hear again` / `Unheard` | `Read again` / `Sealed` |
| row `aria-label` | `Ballad N: <title>. Hear again.` / `Ballad N: not heard yet.` | `Entry N: <title>. Read again.` / `Entry N: not reached yet.` |
| hidden title | `???` | `???` |
| locked toast | `You have not heard this ballad yet. Play on to find it.` | `You have not reached this entry yet. Keep touring to find it.` |
| empty | `No ballads yet.` | `No entries yet.` |

### 10.5 Who's Who tab (`bestiary`)

| Where | Echowake | **Hocus Vocus (exact)** |
|---|---|---|
| section heading | `Verse N: <title>` + `N of M met` | `Act N: <title>` + `N of M met` (title from `chN_intro`: Blossom Bay, Scrollopolis, The Perfect Stage) |
| tile `aria-label` | `<name>, <tier>. Defeated N times.` / `Unknown creature, not met yet.` | `<name>, <tier>. Won over N times.` / `Unknown creature, not met yet.` |
| unseen label | `Not yet met` | `Not yet met` |
| detail chips | tier + `Verse N` | tier + `Act N` |
| unknown detail | `A shape in the silence. Meet this creature in a fight and its echo will be kept here.` | `A shape behind the Gloss. Meet this creature in a fight and its photo goes on the wall.` |
| stats | `HP at Trial 0`, `defeated`, `met` | `HP with no encore`, `defeated`, `met` |
| moves heading | `Moves` | `Moves` |
| no notes | `Nothing recorded yet.` | `Nothing on the wall yet.` |
| empty | `The bestiary is blank. Meet a creature in a fight to record it here.` | `Nobody in the Who's Who yet. Meet a creature in a fight to add it here.` |
| tag chips | `cap(tag)` | the display labels of `HV_ENEMIES.md` 8 (`Sprite`, `Critter`, `Showbiz`, `Faded`, `Gadget`, `Bug`, `Bird`, `Seaside`, `Glossy`) |

### 10.6 Past Tours tab (`history`)

| Where | Echowake | **Hocus Vocus (exact)** |
|---|---|---|
| empty | `No journeys yet` + `Finish a journey, win or lose, and it will be remembered here: the heroes, the score, how far you got.` | `No tours yet` + `Finish a tour, win or lose, and it will be remembered here: the heroes, the score, how far you got.` |
| summary labels | `journeys begun`, `sung to the end`, `best score`, `in the list` | `tours started`, `sung to the end`, `best score`, `in the list` |
| outcome | `Victory`, `Abandoned`, `Fallen` | `Victory`, `Abandoned`, `Curtain fell` |
| act column | `Verse N` | `Act N` |
| difficulty stamp | hanko `T` + N, label `Tempo Trial N` | hanko `E` + N, label `Encore N` |
| daily stamp | hanko `D`, label `Daily Jam` | hanko `D`, label `Daily Duet` |
| Cheers line | `+N Chimes` | `+N Cheers` |
| undated | `Long ago` | `Long ago` |
| row `aria-label` | outcome + ` with ` + heroes + `, score N, Verse N` (+ `, Tempo Trial N`) (+ `, Daily Jam`) | outcome + ` with ` + heroes + `, score N, Act N` (+ `, Encore N`) (+ `, Daily Duet`) |

Art notes for the Tour Bus (art plan, ids unchanged): the backdrop is the inside of the van (fairy lights, the sticker wall, a little
snack shelf with fruit, Jordan's poster); its tint `#7a6bff` (Kuro's old violet) becomes Jordan's teal `#2ec4b6`; the tab
motifs `key`, `star`, `bell`, `mask`, `lantern` keep their ids and are drawn as a key, a sticker star, a diary, an instant photo and a road
sign; the Act III sky id `crimson` keeps its id and paints the opal and pastel chrome of the Perfect Stage.

## 11. Settings (`settingsForm` in `js/screen_menu.js`; setting keys and `DATA.SETTINGS` unchanged)

| Where | Echowake | **Hocus Vocus (exact)** |
|---|---|---|
| panel title, done button | `Settings`, `Done` | `Settings`, `Done` |
| group headings | `Sound`, `Motion`, `Help`, `Display`, `Screen and data` | `Sound`, `Motion`, `Help`, `Display`, `Screen and data`, and a new last group `About` (bible 7.2) |
| Sound rows | `Music` (slider `Music volume`), `Effects` (slider `Effects volume`) | same |
| Motion rows | `Reduce motion` (`Auto`, `On`, `Off`; note `Following your device: reduced motion is on` / `full motion`), `Screen shake` (`Off` or N%), `Animation speed` (`Normal`, `Fast`, `Faster`), `Damage numbers` | same |
| shake hint | `Try it: the row shakes as you drag` | `Try it: this line shakes as you drag` |
| Help row | `Hints`, hint `Short tips during your first journey` | `Hints`, hint `Short tips during your first tour` |
| Display rows | `Text size` (`Normal`, `Large`, `Larger`), `Colour-blind aids` (hint `Patterns, and bigger glyphs on gems`), `Quality` (`Auto`, `High`, `Low`; hint `Auto lowers effects if the game slows down`) | same |
| text size sample | `The fox sang the grove awake, note by note.` | `A soft note, a late kick, and the whole street starts to sing along.` |
| Screen and data rows | `Full screen` (`Full screen` / `Leave full screen` / `Not available here`), `Defaults` (`Restore defaults`, toast `Settings restored`), `Saved data` | same |
| clear button and hint | `Clear saved data`, `Erases unlocks, history and your saved journey. Asks twice.` | `Clear saved data`, `Erases unlocks, stickers, past tours and your saved tour. Asks twice.` |
| overlay data hint | `Leave the journey from the title screen to clear it` | `Leave the tour from the title screen to clear it` |
| confirm 1 | `Erase all progress?` / `Unlocks, achievements, history, the bestiary and your saved journey will be erased. Your settings stay.` / `Continue` / `Keep everything` | `Erase all progress?` / `Unlocks, stickers, past tours, the Who's Who and your saved tour will be erased. Your settings stay.` / `Continue` / `Keep everything` |
| confirm 2 | `Really erase every echo?` / `This cannot be undone. Every Chime and every verse you have heard will be gone.` / `Erase everything` / `Cancel` | `Really clear out the whole van?` / `This cannot be undone. All your Cheers and every diary entry you have read will be gone.` / `Erase everything` / `Cancel` |
| done toast | `All is quiet again` | `Back to the very first soundcheck` |
| About group (new) | none | heading `About`; row `Follow the duo` with the link buttons `Website`, `YouTube`, `Facebook`, `TikTok`, `Instagram` (each only when its `DATA.LINKS` URL is set), `Share`, `Support the duo`; line `Made for RoxorLoops and Jasmin. Find them as @roxorloopsandjasmin.` (bible 7.2, exact) |

The About row reads `DATA.LINKS` (bible 7.2) and fetches nothing; with every URL empty it shows only `Share` and the line.

## 12. How to Play (the 8 `HOWTO` pages; ids stay; title, kicker and the 3 rules lines exact)

Titles use title case like Echowake's; no page title is a pun (tutorial tone, bible 5.6). Page ids `book map rows cards intents gems
places after` are ids and stay. Each page's `tip` field is a regex that finds its matching tip in `DATA.tips`; the tips owner must keep
one tip that matches each new regex below (suggested wording in brackets).

| # | id (stays) | **title** | **kicker** | rules (3 lines, exact) | `tip` regex (and the tip it expects) |
|---|---|---|---|---|---|
| 1 | `book` | `A World on Mute` | `Two heroes, three acts, one Gloss to sing through.` | `You lead two heroes across the Soundlands, where real voices are magic. The Gloss has smoothed them all into silence.` / `Play three acts. Each ends with a headliner, and the last one is the Gloss's own star.` / `Every tour is a new one: a different map, different cards, different charms. Win or lose, you earn Cheers to unlock more.` | `/both heroes lose their voice/` (`If both heroes lose their voice, the tour ends. ...`) |
| 2 | `map` | `Unmute the Soundlands` | `The Soundlands are on mute. Your Vox turns them back on.` | `Spend 1 Vox to unmute a hex next to live ground. It reveals what waits there: a fight, a merch stall, a green room, a detour.` / `Tap any live hex to walk there. Stepping onto a fight or a detour starts it.` / `Vox comes back from tea stalls, wins and green rooms. One-use Spells unmute whole shapes for free.` | `/^Unmuting a hex costs Vox/` |
| 3 | `rows` | `Two Heroes, Two Spots` | `Who takes the lead matters.` | `The lead hero takes most attacks. The backing hero is safe from most of them.` / `Each hero has a favourite spot and a bonus there. Check it on the hero card.` / `You get one free swap per turn, more cost 1 Breath. If one hero loses their voice, the other steps up.` | `/lead hero takes most/` |
| 4 | `cards` | `Breath and Cards` | `Three Breath, five cards, one enemy turn.` | `Every card belongs to one hero. Play cards with Breath: you have 3 each turn.` / `Attacks hurt, skills defend or set things up. Block soaks damage until your next turn.` / `End your turn and unplayed cards are discarded while the enemies act. Then you draw 5 more.` | `/Block wears off/` (unchanged) |
| 5 | `intents` | `Read the Intents` | `Every enemy shows what it is about to do.` | `The bubble over an enemy tells you what it will do next: hit, block, jinx, summon.` / `Statuses stack. Exposed takes more damage, Muffled deals less, Earworm ignores Block.` / `Hover or press and hold any icon or underlined word to read what it means.` | `/Enemy intents show/` (unchanged) |
| 6 | `gems` | `Gems in Slots` | `Set a gem, change the card.` | `Cards have 0 to 3 slots. A slot takes a gem of its own colour, and a rainbow slot takes any.` / `Gems add damage, Block, extra hits, cards, Breath and more. The card text changes to match.` / `Set gems at green rooms, studios and merch stalls. Replacing a gem loses the old one, so choose well.` | `/Gems only fit slots/` (unchanged) |
| 7 | `places` | `Green Rooms, Stalls and Detours` | `The map is full of small choices.` | `Green rooms let you rest, rehearse a card, set gems or warm up. Jordan's merch stalls sell cards, gems and charms, and declutter your deck.` / `Detours are choices with a safe way, a gamble and often a price. Charms bend the rules for the whole tour.` / `Rivals guard charms, the studio upgrades a card, and a sparkle booth lets you pick one gem.` | `/A detour is a choice/` |
| 8 | `after` | `After the Tour` | `Every tour leaves something behind.` | `You earn Cheers after every tour. Spend them on the Tour Bus on new cards, charms and gems.` / `Win a tour to open Encores, stackable challenges. The Daily Duet is the same seed for everyone.` / `Keys, if you play with a keyboard, are listed below. Everything also works by touch.` | (none) |

Page pieces that are not the table:
- Gem demo labels (`buildGems`): `Empty slot`, `Gem socketed` (unchanged).
- Tiles page (`buildTiles`): reads `DATA.tiles` names and texts (section 6); nothing hard-coded.
- After page cards (`buildAfter`, bible 5.5): `Cheers` / `Earned after every tour. Spend them on the Tour Bus.`; `Encores` / `Win a tour to
  unlock the next encore. Each one stacks a new rule.`; `Daily Duet` / `Today's seed is N. ` (only when a seed exists) + `Same heroes and
  map for everyone, once a day.`; the seals `aria-label` `Encores 0 to 10; you have opened up to N`; the seal letters stay `0`, `I`
  to `X`.
- Keys legend (`KEYS`): `E` `End turn`; `S` `Swap spots`; `1 to 9` `Pick a card`; `Enter` `Play it`; `Z` `Fast mode`; `D / G` `Draw /
  discard pile`; `Arrows` `Move the map`; `B` `Spell tray`.
- Frame: banner `How to Play`; nav `aria-label` `How to play pages`; dots `Page N: <title>`; page counter `N / 8`; buttons `Next` and
  `Done`; page `aria-label` `How to play, page N of 8: <title>` (the word "page" is the allowed pagination survivor, bible 6.4).

## 13. Execution checklist (what to patch, and the tests that hard-code Echowake strings)

Data (one commit is fine; all of it is display only):
- `js/data_relics.js`: per id `name`, `text` and the new `flavor` (section 2); rewrite the header comment in the new words (it may keep
  ids, never `--`). `art.m` and `art.c` stay.
- `js/data.js` relic validator: accept the optional `flavor` string (printable ASCII, at most 80 characters, ends with `.`, `!` or `?`);
  the relic tooltip, reward plaque and Tour Bus tile print it in italics under the rules text when present (UI plan).
- `js/data_gems.js`: per id `name`; `heartflame_topaz.text` per bible 4.3; header comment in the new words.
- `js/data_meta.js`: achievements, trials (sections 4 and 5); tips and lore belong to the narrative plan.
- `js/data.js`: tiles, brushes, keywords, statuses (sections 6 to 9).
- `js/screen_menu.js`: sections 10, 11, 12, plus `TIER_NAME`, `KIND_NAME`, `LIB_TABS` labels, a `RARITY_NAME` map
  `{ common: 'Common', uncommon: 'Uncommon', rare: 'Rare', boss: 'Headliner', shop: 'Merch' }` for the Charm tile subtitle, and a gem
  colour display map `{ red: 'pink', blue: 'blue', green: 'green', gold: 'gold' }`.
- `js/art_icons.js` (art plan): one icon per Charm from the icon looks in section 2, keyed by relic id over the shared motif (the motif
  ids stay because card art shares them); a missing Charm drawing falls back to its motif.

Tests that read the old words and must take the new ones (ids and mechanics in them stay):
- `tests/hocus_vocus_treasure.test.mjs` block 3, the machine summary dictionaries:
  `OPWORD` `ink: /\bvox\b/i`, `paint: /unmute/i`, `addBrush: /spell/i`, `energy: /breath/i`, `revive: /bring (them|that hero) back|revive/i`;
  `MODWORD` `energy: [/breath/i]`, `inkMax: [/vox/i]`, `startInk: [/vox/i]`, `wellInk: [/tea stall/i, /vox/i]`, `campActions: [/green room/i]`;
  `ROWWORD` `regen: /warm tea/i`, `thorns: /feedback/i`;
  `TRIG` `onChapterStart: /\bact\b/i`, `onPaint: /unmute/i`, `onShopEnter: /stall/i`, `onExhaust: /fade/i`, `onHeroDown: /loses? (their|a) voice/i`;
  `TGTWORD` `front: /\blead\b/i`; `TIERWORD` `elite: /rival/i`, `boss: /headliner/i`, `normal: /creature/i`, `minion: /sidekick/i`;
  the row word and the cond row word read a map `{ front: /\blead\b/i, back: /backing/i }` instead of `new RegExp(row)`;
  the `random song` check message becomes `random spell` (the regex `/random/` stays). Every rules text in section 2 was written
  against these dictionaries with the bible's status and hero names (section 15).
- Same suite, pinned `DATA.hookText` samples: `'Every 5th time you wake a hex, gain 1 Echo.'` becomes `'Every 5th time you unmute a hex, gain
  1 Vox.'` (the text plan's generator words, bible 4.9); the `rice_ball` sample is unchanged.
- `tests/hocus_vocus_narrative.test.mjs` "each trial text quotes its own numbers": `startInk` `' less Vox'`, `wellInk` `'stalls give ' + N
  + ' less Vox'`, `eliteHp` `'Rivals have ' + pct + '% more HP'`, `bossHp` `'headliners have ' + pct + '% more'`; the other quotes
  already match the bible texts.
- `tests/hocus_vocus_screen_menu.test.mjs`: any assertion on `The Hall of Echoes`, `Ballads`, `Setlist`, `Tempo Trial`, `Chimes`, the How
  to Play titles or the `KEYS` labels takes the strings in sections 10 to 12.
- The Hocus Vocus theme-leak suite: every string in this file passes bible 6.2 and 6.3, except `Limited Edition` (14.2).

## 14. Glossary additions and flags

### 14.1 Glossary additions (terms this plan needed that the bible did not fix)

| Term | Use | Where |
|---|---|---|
| The 66 Charm names of section 2 | reserved (H16): no card, gem, enemy, Detour title or Spell may reuse one | relic `name` |
| The 24 gem names of section 3 | reserved the same way | gem `name` |
| Charm rarity words `Common`, `Uncommon`, `Rare`, `Headliner`, `Merch` | the Charm subtitle (`Rare charm for Jasmin`, `Headliner charm`, `Merch charm`); "charm" is lowercase in that subtitle, like `Tier 2 pink gem` | Tour Bus tiles, reward plaques |
| Charm `flavor` | the new optional flavour line on a relic (display only) | data, tooltip, plaques |
| Pink stones for the `red` family | rose quartz, spinel, tourmaline, rhodonite, kunzite, morganite | gem names |
| `Read again` / `Sealed` | Diary row states | Tour Bus |
| `tours started`, `sung to the end` | Past Tours summary labels | Tour Bus |
| `Won over N times.` | Who's Who tile label (bible 1.3 rule 3: enemies are won over) | Tour Bus |
| `Nothing on the wall yet.` | Who's Who detail with no notes | Tour Bus |
| `About` | the new last settings group (bible 7.2 links) | settings |
| `Back to the very first soundcheck` | toast after clearing saved data | settings |
| "the crew price" | flavour words only, never a mechanic name | Crew Lanyard |

### 14.2 Flags for the bible owner and the other plans (not this plan's ids)

1. `trial_7` **Limited Edition** contains "edition", which bible 6.3 bans. Resolved: bible 6.4 lists it as an allowed survivor with
   the reason "a merch print run, not an Inkwoven book word", and the theme-leak suite allowlists it. Fallback name if the owner prefers
   a rename: **Sold Separately** (text unchanged).
2. The gem `Harmony Tanzanite` and the card `Imperfect Harmony` share a word, not a name; fine under the suite (it compares whole
   names), listed only so nobody "fixes" it.

## 15. Cross-checks done for this file

- Every id of `inventory.md` sections relics (66), gems (24), achievements (32), trials (10), tiles (14), brushes (6), keywords (16) and
  statuses (20) appears exactly once in its table above.
- Charm rules texts: one sentence each, 12 to 90 characters, capital first, period last, no `.`, `!`, `?`, `;` or `:` inside, no
  double spaces; each carries every number, status, resource, trigger, target and tier of its data against the dictionaries in section
  13, and each hero Charm names its own hero (`Jasmin`, `RoxorLoops`, `RawClaw`, `Andy`).
- Charm flavours: at most 80 characters, ASCII, end with `.`, `!` or `?`, no dash, no hero named except by its own hero's kit context
  ("he", "she"), no real name, platform, show, judge or number of views, no admin word, no animal product, no lyric.
- Names: 66 Charm names and 24 gem names, all different from each other and from the 160 card names and 51 enemy names of the
  sibling plans, from every Spell, status, keyword, tile, Sticker, Encore, Headliner, passive and starter; relic names 4 to 28
  characters (longest `Extra Spicy Noodles`, 19), gem names 8 to 28 (longest `Deep Breath Tourmaline`, 22).
- Bible tables (sections 4 to 9) copied verbatim; the only additions are the Cheers and unlock columns, the tile look and the Spell sound
  columns, which restate bible 4.4, 4.5 and 7.1.
