# HOCUS VOCUS: enemies and Headliners (agent C)

Status: ENEMIES rev 1. Covers all 51 enemy ids (3 Acts x 10 Creatures, 3 Rivals, 3 Sidekicks, 1 Headliner). Every name, title, lore line,
move name, bark (`say`), phase line, roster role and tag below is the exact string to paste. The bible (`HV_BIBLE.md`) wins over this file;
the three Headliners' names, titles, roster roles and phase lines, Mic Squeal, Botling and Lip-Sync Clone are copied from it verbatim.

How to read it: section 1 is the rules every string here was checked against, sections 2 to 4 are the three Acts (roster, barks, roles
and tags, art direction, rig map), section 5 is the Headliners' story beats and form art, section 6 is the art rules shared by all 51,
section 7 is the execution checklist (files and tests that change), section 8 is the glossary additions.

What never changes (bible H1, H2): every enemy id, move id, `fx`, `ai`, `hp`, `start`, `hooks`, `immune`, `art.id`, `size`, `tier`,
`chapter`, every encounter group id and weight, and the number of moves that carry a `say`. Only `name`, `title`, `moves.*.name`,
`moves.*.say`, `phases[].say`, `lore`, `tags` (display only: nothing in combat, run or the bot reads them) and the art change, so the
balance bot's per-run records stay byte-identical.

## 0. Decisions at a glance

| # | Decision | Choice | Why |
|---|---|---|---|
| C-D1 | Each id keeps its mechanical role | A stun enemy stays a stun enemy, a thief stays a thief, a summoner keeps its Sidekick, a healer keeps healing; every new identity was chosen to explain the existing moves (Thorns is "it squeals back when hit", Plating is Sequins, Ritual is Crescendo, Bind is Tangled) | H2, and the player's lessons per Act stay intact |
| C-D2 | Act I, Blossom Bay | seaside things and Snack Pier produce that caught a little Gloss, plus the bay's own instruments: a foghorn, a coin crab, a pitch-perfect gull, a tuning fork, an accordion, a chilli, peas, a melon, a jukebox, a bandstand | bible 2.3 and the Act I pool in 2.4; the owners' brief (open mic, stage fright, tuning-fork critters, mischievous produce) |
| C-D3 | Act II, Scrollopolis | the feed as a zoo: flamebait, clickbait, filters, adverts, emoji, notifications, the algorithm, autoplay, selfie sticks, chargers, a comment troll and its grumble clouds, a trendsetter, a doomscroll moth | bible pool; satire of the system, never of fans, never a real platform (bible 1.3 rule 5) |
| C-D4 | Act III, the Perfect Stage | the Polished: perfect, symmetrical, pastel chrome performers and props: a tuner drone, a VIP bouncer, a clapperboard knight, a chrome siren, synchro dancers, a streamer dragon, an airbrush wraith, a ring light, a sequin golem, a glitch gremlin, a giant mute button, the applause sign, a mannequin judge | bible pool and the "Human" theme: everything polished, filtered, perfect and lifeless |
| C-D5 | Nobody is destroyed | enemies are "won over": the art's death pose becomes a win-over (the Gloss flakes off, the creature does one happy hop and pops into sparkles); lore never says kill, die, dead or death | bible 1.3 rule 3, H7 |
| C-D6 | Negative commenters | `drowned_general` is the **Comment Troll** (its lore is the bible's sample line, verbatim) and `lantern_wisp` its **Grumble Cloud**; both are grumbling clouds that turn pink and fluffy when won over | owners' brief: grumbling cloud creatures that become harmless when sung kindly at |
| C-D7 | Imperfect is never the villain | no enemy is a "wrong note" or a "sour note": the Echowake `typo_sprite` (Sour Note) becomes the **Pitch Glitch**, a pitch-correction artefact; enemies hunt wobbles, they are never made of them | bible 1.3 rule 6 |
| C-D8 | Flawless's summons | the opener and late summon `blank_page` is the **Lip-Sync Clone** (bible 2.4); the Filter form's `typo_sprite` summon is the Pitch Glitch and the Gloss form's `spark_mote` summon is the Confetti Popper (their ids are shared with other Act III fights) | bible names the clones; the other two are Act III Sidekicks already |
| C-D9 | Tags | tag ids stay (`LISTS.enemyTags`), each enemy is re-tagged honestly to its new identity, and the Who's Who chip shows a display label (7.3): spirit Sprite, beast Critter, folk Showbiz, undead Faded, construct Gadget, insect Bug, avian Bird, aquatic Seaside, void Glossy | the chip printed `cap(tag)`, which would show "Undead" and "Void" |
| C-D10 | Barks | exactly the moves that had a `say` in Echowake get a new one, no more and no fewer; per-Act length limits honoured (Act I 70, Act II 48, Act III 64 characters) | suites `enemies_1/2/3` and boss bark counts |
| C-D11 | Act I setting | the bible's harbour town (Blossom Bay) wins over the brief's "busker market and meadow"; the market lives on as the Snack Pier and its produce | bible is the authority |

## 1. Rules every string here obeys

From the bible (section 6) and the existing suites (`tests/hocus_vocus_enemies_1/2/3`, `content`, `data`, `narrative`):

| Field | Rule |
|---|---|
| `name` | 3 to 28 characters, unique among cards, Charms, gems and enemies; equals the `ROSTER_SRC` name; no reserved name (Spells, statuses, keywords, tiles, Headliners, starters, Untangle, owner-nod cards) |
| boss `title` | equals the `ROSTER_SRC` title |
| `lore` | 60 to 260 characters, 1 or 2 sentences, starts with a capital, ends with `. ! ?`, unique, British spelling |
| move `name` | Act I: 3 to 24 characters; Act II: 1 to 3 words, capitalised; Act III: 3 to 28 characters, at most 5 words, unique across Act III except the one shared Block-piercing move of `eraser_wraith.rub` and `boss_editor.rub` (now **Smooth Over**) |
| `say` | Act I at most 70, Act II at most 48, Act III at most 64 characters, at least 3 |
| phase `say` | 8 to 90 characters; Act III Headliner at least 15 |
| roster role | 31 to 130 characters; a role that says "call" or "calls" names a Sidekick of its own Act |
| all | printable ASCII, no em or en dash, no ` - ` or `--`, a space after `. , ! ? ; :` before a letter, no double spaces, no animal products (H5), no kill, die, dead, death, blood, no Echowake or Inkwoven words (6.2, 6.3: no echo, hush, verse, page, ink, scroll as an object, felt, silk, pearl, coral, ivory), no real names, platforms or shows (H3), no admin (H4) |

Clash watch (the content suite forbids a card, Charm, gem and enemy sharing a display name): `HV_HEROES.md` already names the curses
`curse_doubt` **Stage Fright** and `curse_hex` **Hot Take**, so this plan does not use either as an enemy name (the stage-fright creature is
the **Jitterbug**, the hot-take creature is **Flamebait**, a matchstick, never a speech bubble). Names here a Charm or gem plan might
also want: `Applause Sign`, `Copycat Cutout`, `Confetti Popper`, `Selfie Stick`. Enemy names are reserved here (H16); a later plan that
wants one renames its own thing.

## 2. Act I: Blossom Bay

Act name `Blossom Bay` (bible 2.3). Suggested one-line intro, for any UI that shows one under the Act heading (the narrative plan owns
the `ch1_intro` entry and may override): `Sea salt, cherry blossom, and a bay where somebody has taken all the mics.`

### 2.1 Roster (17 ids)

| id | new name | title | tier | bestiary lore (exact) | what it is (creature, silhouette, materials, palette) | signature move names (move id: name) | phase lines (exact) |
|---|---|---|---|---|---|---|---|
| `kappa` | Fussy Foghorn | (none) | Creature (normal) | `A harbour foghorn the Gloss tuned to one perfect note, and now it will not honk any other. It fights fair and honks hard, right up until it runs out of puff.` | A squat brass foghorn on two stubby legs: the flared bell is its face (a perfect round O of a mouth), a navy sailor cap, mint paint flaking off the brass, little rope-coil arms; one side already gone airbrushed flat by the Gloss. Brass, mint, navy. | `mud_slap` Prim Honk; `river_claw` Brass Bump; `shell_guard` Close the Bell; `refill_dish` Puff Back Up | (none) |
| `tanuki_bandit` | Coin Crab | (none) | Creature (normal) | `A crab who has decided that every open busking hat on the pier belongs to it. Catch it before it scuttles back into the sea and the coins come tumbling out.` | A wide orange crab with eyes on stalks and a smug grin, a stolen busker's cap jammed on sideways, coins spilling from a cloth pouch it hugs in one pincer, six quick sideways legs. Orange, sand, sea teal, coin gold. | `club_thump` Pincer Thump; `snatch_and_grab` Hat Grab; `dash_off` Scuttle Off | (none) |
| `kodama` | Tuning Forkling | (none) | Creature (normal) | `A tuning fork no taller than a teacup, humming the one note it knows. It hears every wobble in the bay, and when it gets lonely it rings for a friend.` | A small silver tuning fork standing on its stem: the two prongs are its ears, a round face sits on the knob between them, stubby feet, vibration lines shimmering off it while it hums. Silver, steel blue, lemon highlights. | `rattle` Ring Out; `branch_poke` Prong Poke; `call_leaf_imp` Ring for a Friend | (none) |
| `karakasa` | Squeezebox | (none) | Creature (normal) | `An old accordion that always wanted to dance and, one windy night, simply started. It hops, it snaps shut, and it will absolutely wheeze on you, for reasons nobody has explained.` | A tomato-red accordion on one stocky leg in a rubber-soled boot: the pleated bellows are its body, a grin of piano keys, two strap arms, gold buttons for eyes; the bellows stretch on the hop and slam shut on the guard. Tomato red, cream, gold. | `tongue_lick` Wheezy Blast; `hop_hop` Polka Hop; `snap_shut` Squeeze Shut | (none) |
| `hitodama` | Hot Chilli | (none) | Creature (normal) | `A chilli from the noodle cart who got so excited about the music that it started to sizzle. It hops towards anyone warm, so please do not be warm near it.` | A glossy red chilli pepper standing on its tip, a curly green stalk like a cowlick, big shiny eyes, tiny hopping feet, a wobbling cartoon heat haze above it. Chilli red, leaf green, flame orange. | `ember_touch` Spicy Hug; `scorch_scatter` Chilli Shower | (none) |
| `oni_cub` | Jitterbug | (none) | Creature (normal) | `A very small bug made of pre-show nerves, with very large knees, and they knock. It grows louder every minute you put off going on, and it has a great many minutes.` | A wobbly lilac jelly-bug of stage fright with knocking knees, two trembling antennae, a too-big bow tie, one sweat drop and a crumpled song sheet clutched in both hands; it swells a little with every stack of Volume. Lilac, blush, mint sweat drop. | `horn_butt` Butterfly Bump; `tantrum` The Jitters | (none) |
| `crow_tengu` | Pitch-Perfect Gull | (none) | Creature (normal) | `A harbour gull the Gloss gave perfect pitch, and it will not stop showing off. It dives at whoever is standing at the back, then shuffles the whole band out of place.` | A sleek white gull with a chrome sheen on its head where the Gloss touched it, a tiny headset mic, its beak open mid-note in a perfectly round O, wings flung wide for the dive. White, slate grey, beak orange, Gloss chrome. | `peck_flurry` Perfect Pecks; `dive_bomb` Swoop Behind; `switcheroo` Shuffle Swoop | (none) |
| `bamboo_sprite` | Pea Pod | (none) | Creature (normal) | `Three peas in a pod who harmonise beautifully and aim terribly. One pod is a small nuisance, and the trouble is that pods never come alone.` | A curved green pod standing on its stalk, split open along the top to show three round pea faces singing in close harmony; they pop peas out like tiny cannons. Leaf green, spring green, white highlights. | `leaf_flurry` Pea Volley; `whet_blades` Load Up | (none) |
| `mushroom_folk` | Jingle Machine | (none) | Creature (normal) | `A seaside vending machine that sings its jingle every time you walk past, and every time you do not. Bump it and it squeals back; leave it and the tune follows you home.` | A lemon-yellow vending machine on stubby legs, a glowing window full of fruit cans and smoothie bottles, a coin-slot mouth, a speaker grille puffing out little floating jingle notes; a layer of bubble wrap appears while its Feedback is up. Lemon, sky blue, cherry red buttons. | `spore_puff` Catchy Jingle; `thicken_cap` Bubble Wrap; `cap_bonk` Can Drop | (none) |
| `bamboo_boar` | Runaway Melon | (none) | Creature (normal) | `A prize watermelon that rolled off the Snack Pier and has been gathering speed and rind ever since. It wobbles at the top of the hill once, thinks about it, and rolls.` | A huge striped watermelon on stubby legs with a determined frown, a blue first-prize rosette pinned on, grass stains; its rind turns glossy and sparkly as Sequins stack, and it tips forward and rolls on the heavy. Deep green, lime stripes, rosette blue. | `shoulder_barge` Melon Bump; `bristle` Toughen Up; `gore` Downhill Roll | (none) |
| `oni_brute` | One-Hit Jukebox | (none) | Rival (elite) | `A hulking old jukebox that played the bay's favourite song every night until the Gloss brought newer, shinier ones. It was famous once, and it is furious that nobody picks its record.` | A big chrome-and-walnut jukebox on short sturdy legs, two arms swinging a mic stand like a club, glowing tube lights in sunset colours, the tone arm as a frowning eyebrow and a coin slot for a nose; below half HP its tubes flash red and its record spins faster. Walnut brown, chrome, sunset orange and pink. | `backhand` Record Slap; `twin_swing` Double A-Side; `club_smash` Greatest Hit; `enraged_bellow` Turn It Up | `You dare skip my big hit?!` |
| `tengu_duelist` | Dance-Off Heron | (none) | Rival (elite) | `A heron who took up tap at ninety and has not lost a dance-off since. He bows before every step, and he does not bow after.` | A tall slate-blue heron in a small top hat and bow tie, wings folded like a tailcoat, very long legs ending in shiny tap shoes, a silver-tipped cane instead of a sword, a pink carnation; he bows on the telegraph and taps on the strike. Slate blue, white, silver, carnation pink. | `lunge` Long-Leg Lunge; `riposte_step` Heel Click; `triple_thrust` Triple Tap; `blade_dance` Showstopper | (none) |
| `moss_guardian` | Old Bandstand | (none) | Rival (elite) | `The harbour's oldest bandstand, so overgrown with bunting and ivy that one day it got up and walked. It was built to keep the bay's music safe, and nobody ever told it to stop.` | A round bottle-green bandstand on four column legs, a striped roof like a hat with a gull weathervane, bunting draped in loops, ivy and blossom vines, fairy lights that brighten as its Sequins grow, kazoos peeking out of the rafters, old speakers that squeal when hit. Bottle green, cream, bunting in tomato, lemon and sky. | `moss_fist` Railing Punch; `mountain_slam` Bandstand Stomp; `shake_leaves` Shake the Rafters; `moss_thicken` More Bunting | (none) |
| `ember_wisp` | Chilli Flake | (none) | Sidekick (minion) | `A flake that jumped off a hot chilli to see the show. It sizzles exactly once, brilliantly, and then goes out with a small polite pop.` | A tiny red flake with two dot eyes and a flicker of cartoon flame on top, bouncing. Chilli red, orange. | `flare` Spice Flare; `fizzle` Fizzle Out | (none) |
| `leaf_imp` | Kazoo Imp | (none) | Sidekick (minion) | `A kazoo with legs and one bad idea. Tuning forks and old bandstands call them, and they always come running.` | A little lemon-yellow plastic kazoo on stick legs, the buzzing end as a mouth, a red cap, forever running in place. Lemon, red. | `leaf_poke` Kazoo Poke | (none) |
| `paper_kodama` | Mic Squeal | (none) | Sidekick (minion) | `A tiny shrieking creature born where Kraki's stolen mics touch the speakers. It carries a little of the Gloss inside, and it spills.` | A little round teal mic grille with bug eyes and a mouth stretched wide in a squeal, a coiled cable tail, jagged pink squeal lines and a pastel Gloss sheen leaking from its grille. Teal, pink, Gloss pastel. | `ink_smudge` High Squeal; `paper_slap` Cable Flick | (none) |
| `boss_kuzunoha` | Kraki | The Karaoke Kraken | Headliner (boss) | `A huge, friendly kraken who has run Blossom Bay's open mic from the harbour for as long as anyone remembers. When the Gloss arrived she grabbed every mic so nobody would be embarrassed, and now she sings every song herself, perfectly.` | A huge round pink-and-teal kraken rising from the harbour beside the end-of-pier stage: big kind eyes behind a glossy smiling mask the Gloss gave her, eight curling arms each holding a microphone on a cable, sparkly sound bubbles drifting round her (full form art in 5.1). Bubblegum pink, sea teal, gold mics, Gloss pastel mask. | `paper_fold` Mic Check; `ink_strike` Mic Slam; `brush_flurry` Tentacle Twirl; `ink_bleed` Drown Them Out; `tail_sweep` Arm Sweep; `great_stroke` Power Anthem; `mask_gaze` Glossy Smile; `ink_needle` Too-High Note; `tails_rise` Eight Mics Up; `nine_tails` Every Voice at Once; `frayed_ink` Hoarse but Louder | `You cracked my mask! Fine. Hear my REAL voices!` |

### 2.2 Barks (every Act I move that has a `say`; at most 70 characters)

| id | move id | move name | say (exact) |
|---|---|---|---|
| `kappa` | `shell_guard` | Close the Bell | `Ahem. Manners first.` |
| `kappa` | `refill_dish` | Puff Back Up | `Hhhaaah. Much better.` |
| `tanuki_bandit` | `snatch_and_grab` | Hat Grab | `Nice hat. Mine now!` |
| `tanuki_bandit` | `dash_off` | Scuttle Off | `Catch me if you can!` |
| `kodama` | `rattle` | Ring Out | `Ting ting ting!` |
| `kodama` | `call_leaf_imp` | Ring for a Friend | `Ting! Anyone out there?` |
| `karakasa` | `tongue_lick` | Wheezy Blast | `Hwheeeee!` |
| `oni_cub` | `tantrum` | The Jitters | `Eep! EEEP!` |
| `crow_tengu` | `dive_bomb` | Swoop Behind | `Behind you!` |
| `crow_tengu` | `switcheroo` | Shuffle Swoop | `Shuffle, shuffle!` |
| `bamboo_boar` | `bristle` | Toughen Up | `Thunk.` |
| `oni_brute` | `club_smash` | Greatest Hit | `NUMBER ONE!` |
| `oni_brute` | `enraged_bellow` | Turn It Up | `EVERYBODY SING MY SONG!` |
| `tengu_duelist` | `lunge` | Long-Leg Lunge | `Mind the back, if you can.` |
| `tengu_duelist` | `blade_dance` | Showstopper | `Now we dance properly.` |
| `moss_guardian` | `shake_leaves` | Shake the Rafters | `Everybody out of the rafters!` |
| `boss_kuzunoha` | `paper_fold` | Mic Check | `Mic check, one, two. Out you come, little squeals!` |
| `boss_kuzunoha` | `ink_strike` | Mic Slam | `Every song is mine to sing!` |
| `boss_kuzunoha` | `brush_flurry` | Tentacle Twirl | `Let me sing it for you!` |
| `boss_kuzunoha` | `ink_bleed` | Drown Them Out | `Nobody else needs a mic!` |
| `boss_kuzunoha` | `tail_sweep` | Arm Sweep | `Louder!` |
| `boss_kuzunoha` | `great_stroke` | Power Anthem | `One big note!` |
| `boss_kuzunoha` | `mask_gaze` | Glossy Smile | `Smile! Nobody gets embarrassed tonight.` |
| `boss_kuzunoha` | `ink_needle` | Too-High Note | `Oh, a wobbly one. Let me sing that for you.` |
| `boss_kuzunoha` | `tails_rise` | Eight Mics Up | `Eight mics... one song.` |
| `boss_kuzunoha` | `nine_tails` | Every Voice at Once | `EIGHT MICS AND ME. ALL TOGETHER!` |
| `boss_kuzunoha` | `frayed_ink` | Hoarse but Louder | `My voice is going. LOUDER, then!` |

Moves with no `say` (unchanged count): `kappa` mud_slap river_claw; `tanuki_bandit` club_thump; `kodama` branch_poke; `karakasa` hop_hop
snap_shut; `hitodama` both; `oni_cub` horn_butt; `crow_tengu` peck_flurry; `bamboo_sprite` both; `mushroom_folk` all three; `bamboo_boar`
shoulder_barge gore; `oni_brute` backhand twin_swing; `tengu_duelist` riposte_step triple_thrust; `moss_guardian` moss_fist mountain_slam
moss_thicken; `ember_wisp`, `leaf_imp`, `paper_kodama` all.

### 2.3 Roster roles (`ROSTER_SRC` and `CONTENT_SPEC.md` 4.1, exact) and tags

| id | size | roster role (exact) | tags (ids, Who's Who label) |
|---|---|---|---|
| `kappa` | m | `Proud harbour foghorn. A honk that leaves the lead Exposed, a bump, then a guard; teaches Exposed and Block.` | aquatic, construct (Seaside, Gadget) |
| `tanuki_bandit` | m | `Coin crab. Grabs gold from your hat, thumps, then scuttles off with it; win it over first to get the gold back.` | beast, aquatic (Critter, Seaside) |
| `kodama` | s | `Tiny tuning fork. Rings at both heroes lightly and calls a Kazoo Imp to its side.` | construct, spirit (Gadget, Sprite) |
| `karakasa` | m | `Hopping accordion. Two quick polka hops, then squeezes shut for Block; its wheeze leaves a hero Wobbly.` | construct, folk (Gadget, Showbiz) |
| `hitodama` | s | `Hopping hot chilli. Hard to hit at first, Sizzles the lead and tips spicy junk cards into your deck.` | spirit (Sprite) |
| `oni_cub` | m | `Small bug of pre-show nerves that gains Volume every turn. Win it over early or it only gets louder.` | insect, spirit (Bug, Sprite) |
| `crow_tengu` | m | `Pitch-perfect gull. Dives on the backing hero, pecks in flurries, and swaps your heroes' spots.` | avian, beast (Bird, Critter) |
| `bamboo_sprite` | s | `Pod of three singing peas that arrive in packs. Three tiny shots at random heroes every turn.` | spirit (Sprite) |
| `mushroom_folk` | m | `Jingle-singing vending machine. Earworms the lead and grows Feedback in bubble wrap.` | construct (Gadget) |
| `bamboo_boar` | l | `Rolling prize melon. Gains Sequins, winds up (telegraph), then one heavy downhill roll.` | beast (Critter) |
| `oni_brute` | l | `Washed-up jukebox. Heavy hits and Muffled, and it sulks into a rage below half HP.` | construct, folk (Gadget, Showbiz) |
| `tengu_duelist` | l | `Tap-dancing heron. Lunges at the backing hero, gains Shimmy, and answers hits with a quick step.` | avian, folk (Bird, Showbiz) |
| `moss_guardian` | l | `Walking harbour bandstand. Sequins and Feedback, slow stomps, calls Kazoo Imps from its rafters.` | construct, aquatic (Gadget, Seaside) |
| `ember_wisp` | s | `Tiny chilli flake. Sizzles a hero once, then fizzles out.` | spirit (Sprite) |
| `leaf_imp` | s | `Fast little kazoo called by tuning forks and bandstands. One weak poke.` | construct (Gadget) |
| `paper_kodama` | s | `Shrieking little mic creature. Clogs your deck with junk cards.` | construct, void (Gadget, Glossy) |
| `boss_kuzunoha` | xl | `Karaoke kraken with eight stolen mics. Mic slams and mic squeals, then every voice at once.` (bible) | aquatic, beast, folk (Seaside, Critter, Showbiz) |

The existing tag assertions in `tests/hocus_vocus_enemies_1.test.mjs` line 110 to 111 (`paper_kodama` void, `hitodama` spirit,
`tanuki_bandit` beast, `kappa` aquatic, `crow_tengu` avian) all still hold with these tags.

### 2.4 ART DIRECTION: Act I, Blossom Bay

Palette: candy harbour colours at golden hour, tomato red `#e8553f`, mint `#8fe3c0`, lemon `#ffd84d`, sky blue `#7cc6ff`, cherry pink
`#ff9fc6`, sea teal `#2bb3b1`, warm light `#ffcf8a`, every creature outlined in a thick deep navy `#22264a` (the owners' chibi cards are the
style authority: big heads, round bodies, stubby limbs, a thick dark outline, flat cel shading with one soft highlight). Shapes are
round and bouncy: bells, pods, balls, boxes with rounded corners; nothing sharp except the Kazoo Imp's poke and the Squeal's lines.
Materials are seaside and street-market: painted brass, walnut and chrome, striped canvas, bunting cloth, glossy produce skins, plastic
kazoos, cardboard fruit crates. Signature visual gag: the Gloss is only starting here, so every Act I creature carries ONE small
**Gloss patch**: a panel of itself gone smooth, airbrushed and pastel with the polite Gloss smile drawn on it (the foghorn's left side,
the gull's chrome head, the jukebox's front glass, Kraki's mask); when the creature is won over, the patch flakes off as sparkles and
the real colour underneath bounces back. How they relate to the stage and mic world: the bay is one long open-air gig (pier stages,
mics on stands, speakers on crates, buskers' open hats), so the creatures are its instruments, its snacks and its seaside furniture
turned performers, and Kraki's stolen mics are the source of the squealing: Mic Squeals carry her teal-and-pink squeal lines, and the
Jingle Machine, the Old Bandstand and the Tuning Forkling all draw little sound rings, notes and vibration lines (art may draw music
notes; DATA strings never carry note symbols).

### 2.5 Rig map: which Echowake rig each Act I creature starts from (`js/art_enemies_1.js` headers)

| id | Echowake rig | keep | replace |
|---|---|---|---|
| `kappa` | KAPPA (squat biped, two-segment arms, glowing dish) | biped body, slap and guard arm swings, the dish refill glow as the "puff back up" ring | head and body become the foghorn bell, cap, rope-coil hands |
| `tanuki_bandit` | TANUKI BANDIT (hat, coin sack, dash) | the coin sack prop and coin spill, the dash-off pose | body becomes a crab with a sideways scuttle; hat becomes a busker's cap |
| `kodama` | KODAMA (small round body, rattling head) | the rattle shake (now a vibration hum), the small size and summon pose | the head becomes the fork knob with two prong ears |
| `karakasa` | KARAKASA (one-legged hopping umbrella, snap shut, long tongue chain) | the one-leg hop and snap-shut guard; the tongue chain becomes the bellows chain | canopy becomes accordion bellows, eye becomes two gold buttons |
| `hitodama` | HITODAMA (six-frame flame flip-book) | the flip-book flame, recoloured, as the heat haze over the stalk | body becomes the chilli on two tiny feet |
| `oni_cub` | ONI CUB (small biped, pulsing anger mark) | the pulse (now a sweat drop) and the tantrum shake | body becomes a lilac jelly-bug with antennae and knocking knees; it scales up a little per Volume |
| `crow_tengu` | CROW TENGU (winged biped, dive, swap) | wings, peck, dive and swap poses | feathered cloak becomes a sleek gull body, add a headset mic and a chrome Gloss patch |
| `bamboo_sprite` | BAMBOO SPRITE (shoot with face, blade in each hand) | the small pack-friendly body and flurry swing | the shoot becomes a pod with three pea faces; blades become pea pops |
| `mushroom_folk` | MUSHROOM FOLK (live spore clouds) | the live puff effect, now jingle-note puffs | body becomes a vending machine box; thorny cap becomes a bubble-wrap layer |
| `bamboo_boar` | BAMBOO BOAR (charger, armour plates, steam) | the charge pose and the plate layers (now rind sparkle as Sequins) | body becomes a round melon; the gore becomes a roll |
| `oni_brute` | ONI BRUTE (big biped, club, phase 1 rage) | the big body, club swings and rage phase | torso becomes a jukebox; the club becomes a mic stand; rage reads as red-flashing tubes |
| `tengu_duelist` | TENGU DUELIST (fencer on tall clogs, bow) | the bow, the lunge and the stepping poses | clogs become tap shoes, sword becomes a cane, add top hat and carnation |
| `moss_guardian` | MOSS GUARDIAN (stone, rope, streamers, ferns) | the slow slam, the streamers (now bunting) and the shake-loose summon | stone body becomes a bandstand roof and columns; ferns become ivy and blossom |
| `ember_wisp` | EMBER WISP (flame flip-book) | all of it, recoloured chilli red | add the flake shape |
| `leaf_imp` | LEAF IMP (lean, running in place) | the run cycle and poke | the leaf becomes a kazoo |
| `paper_kodama` | PAPER KODAMA (hollow doll, mist from eye holes) | the leaking-mist effect, now squeal lines and Gloss sheen | the doll becomes a round mic grille with a cable tail |
| `boss_kuzunoha` | KUZUNOHA (seated statue pose, nine tail chains, floating mask that splits, sound bubbles) | the tail chains as eight arm chains, the floating mask and its phase 1 split, the sound bubbles, the phase 1 wheel | the fox becomes a kraken; every arm ends in a gold mic; see 5.1 |

## 3. Act II: Scrollopolis

Act name `Scrollopolis` (bible 2.3). Suggested one-line intro (the narrative plan owns `ch2_intro`): `It is always 2 am in the city of
screens, and nobody has looked up in years.`

### 3.1 Roster (17 ids)

| id | new name | title | tier | bestiary lore (exact) | what it is (creature, silhouette, materials, palette) | signature move names (move id: name) | phase lines (exact) |
|---|---|---|---|---|---|---|---|
| `chochin` | Flamebait | (none) | Creature (normal) | `A matchstick with a flaming head and an opinion about everything, served piping hot. It lights up every thread it touches, and leaves one last spark on its way out.` | A tall cartoon matchstick hopping on its end, its round head a crackling flame with one raised eyebrow and a smug little mouth, stubby arms, screen-blue light on its underside (never a speech bubble: the `Hot Take` curse card owns that look). Matchwood tan, flame orange, red, screen blue. | `kindle` Pile On; `scorch` Spicy Opinion; `cinders` Flame War | (none) |
| `karakuri_puppet` | Clickbait Goblin | (none) | Creature (normal) | `A wind-up goblin made of thumbnails and big red arrows, with exactly three tricks. The first two are fine, it swears the third will shock you, and it always does.` | A jerky wind-up goblin built from glossy cardboard thumbnails, a big red arrow on its back where a wind-up key would be, a shocked open mouth and circled eyes, a yellow outline glow; it moves in stop-motion ticks. Neon green, arrow red, yellow. | `jab` Teaser Jab; `flurry` Thumbnail Flurry; `smash` Shock Reveal; `overwind` All Caps | (none) |
| `nopperabo` | Filter Fairy | (none) | Creature (normal) | `A tiny fairy with a ring-light halo and no face of its own, which is why it keeps fixing everyone else's. The more filters it puts on you, the harder it pokes.` | A hovering fairy with a perfectly smooth, featureless oval face that shines like a screen, a ring-light halo, wings of clear phone glass and a wand that is a tiny slider. Blush pink, lilac, white glow. | `stare` Beauty Filter; `grasp` Touch Up | (none) |
| `drowned_samurai` | Unskippable Ad | (none) | Creature (normal) | `An advert that was told to keep playing until somebody watched it to the end. Nobody ever has, so it is still playing, very politely, in the middle of the street.` | A tall walking billboard screen on two thin legs with a looping cartoon mascot inside, a greyed-out SKIP button in one corner that never lights up, starburst price stickers making a sparkly frame (its Sequins). Screen blue, sale yellow, red. | `cut` Jingle Jab; `stance` Skip in Five; `iai` Final Offer | (none) |
| `koi_spirit` | Hug Emoji | (none) | Creature (normal) | `A round yellow emoji with its arms out, sent to cheer up anyone in the thread who is losing. It hugs its friends better and splashes everyone else with tiny hearts.` | A bouncy round yellow face with rosy cheeks and two little arms flung wide, leaping in an arc over a swirl of pink hearts. Sunny yellow, heart pink, white. | `splash` Heart Splash; `slap` Thumbs Down; `mend` Big Hug | (none) |
| `tsukumogami` | Notification Imp | (none) | Creature (normal) | `A red-dot imp that lives in the corner of every screen in the city and taps you on the shoulder about nothing. It piles up pings until you cannot see your own hand.` | A round alert-red dot with a white number on its belly that keeps counting up, a little gold bell for a hat, skinny arms and legs, one wide glaring eye. Alert red, white, bell gold. | `discord` Ping Storm; `clatter` Pocket Buzz; `strum` Push Alert; `crescendo` Ninety-Nine Plus | (none) |
| `silk_weaver` | Algo Rhythm | (none) | Creature (normal) | `A clicking little machine that learns what you like and serves you more of it until you cannot move. It means well, and it has never once let anybody go to bed.` | A ticking brass metronome head on eight thin glowing cable legs, a small screen belly showing hearts and thumbs, a pendulum swinging in time, trailing cables that join the Feed. Teal glass, brass, screen blue. | `snare` Keep Watching; `fang` Suggested Post; `hatch` Spawn a Bot | (none) |
| `nure_onna` | Autoplay Snake | (none) | Creature (normal) | `A long snake whose body is an endless feed: the more you look, the longer it gets. It nips whoever stands at the back, and wraps the rest in just one more.` | A long glossy snake made of stacked phone screens, each segment playing a tiny looping video, a play-button head with sleepy spiral eyes. Screen blue, violet, white play triangle. | `fang` Autoplay Bite; `lash` Swipe Lash; `coil` Endless Coil | (none) |
| `rokurokubi` | Selfie Stick | (none) | Creature (normal) | `By day, a quiet phone on a cafe table. By night, a very long selfie stick that reaches right over your shoulder to get the backing hero in the shot.` | A sweet-faced phone in a pink case on top of a long telescoping silver stick that bends like a neck, its base a little cafe stool; a camera flash pops on each hit. Silver, case pink, flash white. | `reach` Over the Shoulder; `lunge` Photobomb; `coil` Fold Away | (none) |
| `ittan_momen` | Phone Charger | (none) | Creature (normal) | `A charging cable that went looking for a phone at 2 am and now wraps around anything warm. It only lets go at one hundred percent.` | A long white charging cable fluttering in the night air like a ribbon, a plug head with two prong eyes, a battery icon on its side that fills as it squeezes. White, screen blue, battery green. | `wrap` Cord Wrap; `squeeze` Fast Charge; `billow` Flap About | (none) |
| `drowned_general` | Comment Troll | (none) | Rival (elite) | `It has never finished a song in its life, but it has a lot to say about yours. Deep down, it just wants a reply.` | A big grumbling storm cloud with a deep frown and stubby arms typing furiously on a glowing keyboard, speech bubbles and thumbs-down icons drifting off it; when it is won over it turns pink and fluffy and drifts off smiling. Slate blue, storm grey, screen cyan, then blush pink. | `muster` Start a Thread; `saber` Who Asked?; `sweep` Reply All; `call` More Replies; `crest` Ratio | `I will NOT be scrolled past!` |
| `puppet_master` | Trendsetter | (none) | Rival (elite) | `A glittering puppeteer who decides what the whole city dances to this week, and next week, and the week after. Its strings run to every phone in town, and it has not had a new idea in years.` | A tall glossy figure in a sparkly jacket on a high stool, a phone for a face showing one perfect smile, glowing strings from every finger to a crowd of Copycat Cutouts and phones. Gold glitter, hot pink, screen blue. | `strings` Start a Trend; `restock` New Challenge; `lash` Hashtag Lash; `tighten` Boost Post; `marionette` Trending Now; `mend` Repost | (none) |
| `umibozu` | Doomscroll Moth | (none) | Rival (elite) | `A giant sleepy moth drawn to the glow of every screen in the city, its wings scrolling and scrolling. It wants nothing but one more swipe, and the quiet comes with it.` | A huge soft lavender moth with heavy-lidded eyes and fluffy antennae, rising from below the frame; its two wings are giant glowing phone screens with posts scrolling up them forever, its body striped like pyjamas. Lavender, midnight blue, screen glow. | `slam` Scroll Wave; `brine` Blue Light; `toll` Screen Glare; `maelstrom` Infinite Scroll | (none) |
| `spiderling` | Botling | (none) | Sidekick (minion) | `A tiny spider-shaped bot no bigger than a coin, which likes everything instantly and without looking. It nips first and never reads the post.` | A coin-sized round bot on eight wire legs, two heart-shaped eyes glowing pink, a short antenna. Silver, lilac, heart pink. | `nip` Auto Like; `skitter` Skitter | (none) |
| `paper_puppet` | Copycat Cutout | (none) | Sidekick (minion) | `Cut out of last week's trend and hung on someone else's strings. It knows exactly one dance, and the strings do the dancing.` | A flat cut-out dancer with cat ears and a phone-shaped head showing the same smile as all the others, dangling on glowing strings. Hot pink, white. | `flail` Copy Dance; `clap` Copy Clap | (none) |
| `lantern_wisp` | Grumble Cloud | (none) | Sidekick (minion) | `A small grey cloud that drifted off a comment thread, muttering at everyone. Sing to it kindly and it rains a tiny rainbow, but until then it agrees with every grump nearby.` | A little grey puff of cloud with a pout, two zigzag lightning eyebrows and a tiny speech bubble over its head; won over, it rains a little rainbow. Storm grey, cyan, rainbow. | `singe` Snarky Reply; `warm` Agree Loudly | (none) |
| `boss_jorogumo` | Scrollspinner | Queen of the Feed | Headliner (boss) | `A glamorous giant spider who spins the endless feed over Scrollopolis, so that nobody in the city is ever lonely or bored. Under her perfect filter she has eight bright screens for eyes, and she has not looked up in years.` | Phase 0, the Avatar: a towering glamorous figure in a glittering gown that flares like a bell, a flawless filtered face lit by a ring-light halo, a phone held up for a selfie, only four slender spider feet peeking out under the hem, the glowing cables of the Feed swaying behind her. Phase 1, the Spinner: the gown splits open on a spider's body, eight bright phone-screen eyes, eight long legs, a great glowing web of cables behind (full form art in 5.2). Midnight violet, glitter gold, ring-light white, screen cyan. | `brood` Hatch Botlings; `hatch` One More Bot; `snare` Keep Scrolling; `embrace` Big Squeeze; `kiss` Air Kiss; `fan` Selfie Flurry; `legs` Eight-Leg Swipe; `spin` Spin the Feed; `web` World Wide Web; `frenzy` Refresh Frenzy | `Enough of this filter. Look at me properly!` |

### 3.2 Barks (every Act II move that has a `say`; at most 48 characters)

| id | move id | move name | say (exact) |
|---|---|---|---|
| `chochin` | `kindle` | Pile On | `Everybody pile on! Louder!` |
| `karakuri_puppet` | `smash` | Shock Reveal | `YOU WILL NOT BELIEVE THIS.` |
| `karakuri_puppet` | `overwind` | All Caps | `MUST. CLICK. NOW.` |
| `drowned_samurai` | `stance` | Skip in Five | `Skip in five... four...` |
| `drowned_samurai` | `iai` | Final Offer | `BUY NOW!` |
| `koi_spirit` | `mend` | Big Hug | `Aww. Sending hugs.` |
| `tsukumogami` | `discord` | Ping Storm | `DING! DING!` |
| `tsukumogami` | `crescendo` | Ninety-Nine Plus | `DING! DING! DING!` |
| `silk_weaver` | `snare` | Keep Watching | `Stay put, dear. One more.` |
| `nure_onna` | `coil` | Endless Coil | `Just one more, dear.` |
| `drowned_general` | `muster` | Start a Thread | `First! Everybody, pile on.` |
| `drowned_general` | `crest` | Ratio | `RATIO.` |
| `puppet_master` | `strings` | Start a Trend | `Everyone, do the dance. Now.` |
| `puppet_master` | `restock` | New Challenge | `One more for the challenge.` |
| `puppet_master` | `marionette` | Trending Now | `Not you. YOU.` |
| `umibozu` | `brine` | Blue Light | `Shhh. Just one more.` |
| `umibozu` | `toll` | Screen Glare | `LOOK AT THIS ONE.` |
| `umibozu` | `maelstrom` | Infinite Scroll | `The scroll never ends.` |
| `boss_jorogumo` | `brood` | Hatch Botlings | `Welcome, little ones. Like everything!` |
| `boss_jorogumo` | `hatch` | One More Bot | `One more for the feed, little one.` |
| `boss_jorogumo` | `snare` | Keep Scrolling | `Stay, sweetie. Nobody leaves the feed.` |
| `boss_jorogumo` | `embrace` | Big Squeeze | `Group hug! Nobody scrolls alone.` |
| `boss_jorogumo` | `legs` | Eight-Leg Swipe | `Swipe. Swipe. SWIPE.` |
| `boss_jorogumo` | `spin` | Spin the Feed | `One post. A thousand. Hold still.` |
| `boss_jorogumo` | `web` | World Wide Web | `Everyone, all at once, forever.` |
| `boss_jorogumo` | `frenzy` | Refresh Frenzy | `Refresh! Refresh! Do not look away!` |

Moves with no `say` (unchanged count): `chochin` scorch cinders; `karakuri_puppet` jab flurry; `nopperabo` both; `drowned_samurai` cut;
`koi_spirit` splash slap; `tsukumogami` clatter strum; `silk_weaver` fang hatch; `nure_onna` fang lash; `rokurokubi`, `ittan_momen` all;
`drowned_general` saber sweep call; `puppet_master` lash tighten mend; `umibozu` slam; `spiderling`, `paper_puppet`, `lantern_wisp` all;
`boss_jorogumo` kiss fan.

### 3.3 Roster roles (exact) and tags

| id | size | roster role (exact) | tags (ids, Who's Who label) |
|---|---|---|---|
| `chochin` | m | `Flaming matchstick. Sizzles the lead, gives every enemy Crescendo, then a flame war on both heroes.` | construct, spirit (Gadget, Sprite) |
| `karakuri_puppet` | m | `Wind-up clickbait goblin with a fixed combo; its third trick leaves the lead Starstruck.` | construct, spirit (Gadget, Sprite) |
| `nopperabo` | m | `Faceless filter fairy. Leaves the lead Muffled and Wobbly, then pokes harder while they stick.` | spirit, void (Sprite, Glossy) |
| `drowned_samurai` | l | `Walking advert. Steady jabs and Sequins from its frame; holds still, then a big final offer.` | construct (Gadget) |
| `koi_spirit` | m | `Huggy emoji. Heals its allies and splashes both heroes with hearts.` | spirit (Sprite) |
| `tsukumogami` | m | `Red-dot imp. Hits and shuffles junk cards into your draw pile, then a big pile of pings.` | spirit, construct (Sprite, Gadget) |
| `silk_weaver` | m | `Clicking algorithm on cable legs. Tangles a hero and calls a Botling.` | construct, insect (Gadget, Bug) |
| `nure_onna` | l | `Endless-feed snake. Bites the backing hero with Earworm and coils the lead hard.` | beast (Critter) |
| `rokurokubi` | m | `Telescoping selfie stick that reaches past the lead to hit the backing hero twice.` | construct (Gadget) |
| `ittan_momen` | m | `Loose charging cable. Wraps a hero Tangled and gains Block and Shimmy.` | construct (Gadget) |
| `drowned_general` | l | `Grumbling comment cloud. Crescendo, calls Grumble Clouds, one heavy ratio below half HP.` | spirit (Sprite) |
| `puppet_master` | l | `Pulls the strings of every trend. Calls Copycat Cutouts, mends them, and leaves the lead Starstruck.` | folk, void (Showbiz, Glossy) |
| `umibozu` | l | `Giant sleepy moth. Slams both heroes harder every turn, Muffled and Wobbly on both, and a Starstruck glare.` | insect (Bug) |
| `spiderling` | s | `Tiny spider-shaped bot that likes everything. Earworms with a quick nip.` | insect, construct (Bug, Gadget) |
| `paper_puppet` | s | `Flimsy cut-out dancer on strings. One weak strike, gone in a hit.` | construct, folk (Gadget, Showbiz) |
| `lantern_wisp` | s | `Small grumbling cloud. Sizzles a hero and backs up its neighbours with Block.` | spirit (Sprite) |
| `boss_jorogumo` | xl | `Glam spider who spins the endless feed. Tangles heroes and hatches botlings, then drops her filter.` (bible) | insect, folk, void (Bug, Showbiz, Glossy) |

`tests/hocus_vocus_enemies_2.test.mjs` asks for at least 8 distinct tag sets in the Act: these give 11.

### 3.4 ART DIRECTION: Act II, Scrollopolis

Palette: always 2 am in blue light. Midnight navy `#141a3a` grounds, screen blue `#3d7bff`, cyan `#3ff0ff`, notification red `#ff3b5c`,
heart pink `#ff6fb5`, neon green `#6dff8a`, and one warm colour kept back for hope: moon cream `#fff2c4`. Shapes are the shapes of the
phone: rounded rectangles, speech bubbles, icons (hearts, thumbs, play triangles, red dots, spinners), long cables; silhouettes are
tall and thin or bubble-round, and the chibi outline stays thick and dark so they read against the neon. Materials: glass screens,
glowing cables, glossy cardboard thumbnails, glitter, brass ticking parts, and pixels. Signature visual gag: every Act II creature
carries a small screen somewhere (a belly, a face, a wing, a frame) that plays a tiny loop (a heart popping, a thumb, a loading
spinner) and lights its face from BELOW in blue; and every one of them looks DOWN. Nobody looks up. When a creature is won over its
screen goes dark, it looks up at the moon for the first time, and it smiles (the Grumble Cloud and the Comment Troll also turn pink and
fluffy and rain a tiny rainbow, the Doomscroll Moth finally flutters towards the moon instead of a screen). How they relate to the
stage and mic world: Scrollopolis is a stage nobody is standing on; everyone is watching one. The Feed's cables are strung across the
sky like stage rigging (Scrollspinner's web), notification bubbles float up like balloons, comment graffiti is sprayed on the walls in
silly words only ("first!", "mid", "who asked"), and the enemies are the things that keep a crowd scrolling instead of singing.
No real platform's icon, logo, colour pairing or interface is ever copied: hearts, thumbs, red dots and play triangles are generic.

### 3.5 Rig map (`js/art_enemies_2.js` headers)

| id | Echowake rig | keep | replace |
|---|---|---|---|
| `chochin` | CHOCHIN LANTERN (floating one-eyed lantern, candle flame, long tongue) | the live flame on top, the bob | the lantern becomes a hopping matchstick with a flame head and an eyebrow; drop the tongue |
| `karakuri_puppet` | KARAKURI PUPPET (wind-up doll, brass key, stop-motion ticks) | the stop-motion tick timing, the key slot | the doll becomes a thumbnail goblin; the key becomes a red arrow |
| `nopperabo` | NOPPERABO (faceless ghost, glowing smooth face that ripples) | the smooth glowing face and its ripple | add a ring-light halo, glass wings and the slider wand; drop the hat |
| `drowned_samurai` | DROWNED SAMURAI (armour plates, stance, iai) | the stance and the telegraphed heavy timing, the plate layers as the sticker frame | the body becomes a billboard on two legs |
| `koi_spirit` | KOI SPIRIT (mid-leap arc over a swirl) | the leap arc and the swirl | the carp becomes the round emoji with open arms; the swirl becomes hearts |
| `tsukumogami` | TSUKUMOGAMI (instrument with skinny legs, one glaring eye, buzzing strings) | the skinny limbs and the one eye | the body becomes a red dot with a number and a bell hat |
| `silk_weaver` | SILK WEAVER (spider body, eight legs) | the eight-leg chains and the hatch pose | the upper figure becomes a metronome head; legs become cables |
| `nure_onna` | NURE-ONNA (long snake tail chain) | the tail chain and the coil | the upper figure becomes a play-button head; tail segments become screens |
| `rokurokubi` | ROKUROKUBI (very long neck chain) | the neck chain reaching over the lead | the neck becomes a telescoping stick; the head becomes a phone |
| `ittan_momen` | ITTAN-MOMEN (ribbon chain with a face on the end) | the ribbon chain flutter and wrap | the cloth becomes a cable; the face becomes a plug head |
| `drowned_general` | DROWNED GENERAL (grand admiral trailing lanterns) | the trailing props (now speech bubbles) and the summon gesture | mostly new: a big cloud body with typing arms |
| `puppet_master` | PUPPET MASTER (gaunt figure on a stool, strings from every finger) | the stool, the live strings and the finger work | the figure becomes a glossy trendsetter with a phone face |
| `umibozu` | UMIBOZU (giant rising from calm water) | the rise from below the frame and the huge scale | new body: a moth with two screen wings |
| `spiderling` | SPIDERLING (coin-sized spider, big eyes) | almost everything | eyes become hearts, add an antenna, legs become wire |
| `paper_puppet` | PAPER PUPPET (folded doll on strings) | the string sway | the doll becomes a cat-eared cut-out dancer with a phone head |
| `lantern_wisp` | LANTERN WISP (pale ghost-fire, big eyes) | the bob and the big eyes | the flame becomes a grey cloud with zigzag eyebrows |
| `boss_jorogumo` | JOROGUMO (phase 0 bell of layered robes with four spider feet, phase 1 spider body, web behind) | the whole two-phase structure, the bell silhouette, the four peeking feet, the phase 1 legs and web | the robes become a glittering gown (no kimono, no silk), the face gets a ring-light halo, the eight eyes become phone screens, the web becomes glowing cables; see 5.2 |

## 4. Act III: The Perfect Stage

Act name `The Perfect Stage` (bible 2.3). Suggested one-line intro (the narrative plan owns `ch3_intro`): `The biggest show in the world,
where every act is perfect and nobody sings.`

### 4.1 Roster (17 ids)

| id | new name | title | tier | bestiary lore (exact) | what it is (creature, silhouette, materials, palette) | signature move names (move id: name) | phase lines (exact) |
|---|---|---|---|---|---|---|---|
| `storm_drone` | Tuner Drone | (none) | Creature (normal) | `A tiny chrome drone that hums one perfectly tuned note and corrects anybody who hums another. It jabs three times because it can count that far, and it has never once tried four.` | A hovering chrome disc with a tuner needle for a face that always swings to dead centre, four little propellers, a mint status light. Chrome, mint, lilac. | `jab` Triple Beep; `arc` Autocorrect; `overclock` Retune | (none) |
| `komainu_guardian` | VIP Bouncer | (none) | Creature (normal) | `One of a pair of bouncers who guarded the rope line of the Perfect Stage. Its partner is gone and the rope is gone, but nobody told the bouncer, and it will not be the one to say so.` | A stocky polished brass rope post come alive on a round plinth, a plum rope looped round it as arms, chrome sunglasses, an earpiece coil; it folds its arms on the guard and leaps on the pounce. Brass, plum, chrome. | `stance` Arms Crossed; `pounce` Big Bounce; `claw` Rope Swat; `roar` VIP Glare | (none) |
| `redaction_knight` | Clapperboard Knight | (none) | Creature (normal) | `A knight in clapperboard armour who stops every song after one line to start it again, properly. Somewhere inside is a knight who used to love the first take best.` | A knight whose helmet is a black-and-white clapperboard that snaps open and shut as a visor, striped armour plates, a megaphone for a shield, pastel chrome trim. Black, white, chrome, lilac. | `cleave` Clapper Cleave; `strike` Take Two; `blackout` That's a Wrap | (none) |
| `void_scribe` | Chrome Siren | (none) | Creature (normal) | `It sings in a voice tuned so perfectly that there is no voice left in it at all. Its favourite hobby is correcting everyone else, starting with their power-ups.` | A floating chrome figure in a long pastel gown whose hem ends in a flat soundwave, a perfectly smooth face with a mirror mic held to it, a halo of little tuning sliders. Lilac, mint chrome, white. | `ink` Smooth Croon; `erase` Pitch Correction; `blot` Robo Wail | (none) |
| `blank_soldier` | Synchro Dancer | (none) | Creature (normal) | `Identical, smiling and dancing in perfect step without a sound: a choreographer's dream. Alone, it is a very quiet mannequin with jazz hands.` | A smooth pastel mannequin dancer with a glossy bob, the fixed Gloss smile, a sequin leotard and jazz hands, moving in perfect sync with every other one on stage. Blush, porcelain white, lilac. | `march` In Formation; `wall` Close Ranks | (none) |
| `sky_serpent` | Streamer Dragon | (none) | Creature (normal) | `A long ribbon of perfect pastel streamers that learned to hold a shape. It curls through the rafters looking for the softest hero at the back of the line, which is rude, and very festive.` | A long coiling dragon made of pastel party streamers in a perfectly repeating pattern, a confetti-cannon head with a big grin, curly ribbon whiskers. Mint, blush, lilac, lemon. | `fang` Confetti Blast; `tailwind` Ribbon Twirl; `lash` Streamer Lash | (none) |
| `eraser_wraith` | Airbrush Wraith | (none) | Creature (normal) | `It drifts across the stage with one soft pastel hand held out, smoothing. Block, wobbles and hard-won stacks go glossy under it, like a photo with all the life airbrushed out.` | A hovering soft-focus figure with blurred edges, one hand an airbrush nozzle puffing pastel mist, a smooth face wearing the Gloss smile. Blush, mist white, lilac. | `smudge` Soft Focus; `rub` Smooth Over; `wipe` Wipe the Wobbles | (none) |
| `thunder_crow` | Ring Light Sentinel | (none) | Creature (normal) | `A ring light that flew too close to the stage lights and came back brighter. It drops like a hammer made of glitter, then flashes the backing hero twice.` | A big white ring light with a tiny pair of stern eyes in its hollow middle, a folding tripod stand for legs that tucks up when it dives, lens flares on every flash. White, chrome, lemon flare. | `peck` Strobe Flash; `dive` Blinding Dive; `perch` Dim Down | (none) |
| `paper_golem` | Sequin Golem | (none) | Creature (normal) | `A giant stitched from a thousand stage costumes, every sequin perfectly in line. It is slow and it is big, and every layer it adds makes the next slam worse for you.` | A huge round golem stitched from stage costumes and covered in perfectly aligned sequins in pastel gradients, a sequinned mask wearing the Gloss smile; sequins flick off when it is hurt and pile back on when it sequins up (its Sequins status, drawn literally). Lilac, silver, blush. | `lumber` Glitter Swing; `fold` Sequin Up; `slam` Sparkle Slam | (none) |
| `margin_imp` | Glitch Gremlin | (none) | Creature (normal) | `A gremlin that lives inside the Perfect Stage's tuning box and snaps every note to the grid. It keeps a very long list of your wobbles and plays it back, slowly.` | A small magenta gremlin drawn in a jittery line that keeps slipping a pixel sideways, big headphone-cup ears, a clipboard of wobbles, little glitch blocks fizzing off its edges. Magenta, lime, chrome. | `call` Glitch Out; `doodle` Robot Voice; `scribble` Glitch Loop | (none) |
| `censor_golem` | Big Mute Button | (none) | Rival (elite) | `Built by the Gloss to keep the Perfect Stage comfortable, it presses itself on anything too loud. Its face is one big button with a crossed-out speaker, and it only knows one word.` | A giant round pastel button on stubby legs, its face a big crossed-out speaker icon, one arm a padded plunger that rises on the quiet turn and presses down on the heavy, a chrome rim and a soft click light. Blush, chrome, grey lilac. | `smack` Button Smash; `censor` Mute All; `raise` Hover Over; `stamp` MUTED | `THIS SONG HAS BEEN MUTED FOR YOUR COMFORT.` |
| `storm_whelp` | Applause Sign | (none) | Rival (elite) | `A huge lit-up APPLAUSE sign that has not been switched off since the Perfect Stage opened. It soaks up every clap in the arena, and it gets a little more excited every time you hit it.` | A big red marquee box on scaffold legs, the word APPLAUSE spelled in light bulbs that brighten with every stack of Rumble, two stubby arms in cartoon white gloves for slow claps. Bulb white, marquee red, pastel chrome. | `gather` Charge the Bulbs; `claws` Slow Clap; `breath` Neon Blaze; `clap` Roaring Applause; `call` Pop the Confetti | `Every bulb on the sign blazes white.` |
| `black_bar_inquisitor` | Mannequin Judge | (none) | Rival (elite) | `A smiling mannequin in a judge's chair who decides the score before the song begins. It has never once been surprised by a singer, and it would very much like to keep it that way.` | A glossy mannequin with a perfect side parting and a pastel suit, seated in a judge's chair on wheels, three score cards fanned in one hand and a big red buzzer on its desk; it never stops smiling. Porcelain white, lilac, buzzer red. Always generic, never a real judge. | `chains` Strings Attached; `gavel` Big Red Buzzer; `hunt` Pick Apart; `gag` Dazzling Smile; `verdict` Final Score | (none) |
| `blank_page` | Lip-Sync Clone | (none) | Sidekick (minion) | `A smiling copy of a pop star, lip-syncing to a track nobody is singing. It strikes a pose, copies your moves, and wobbles anyone who tries to sing near it.` | A tiny glossy idol clone with a mirror mic and the Gloss smile, exactly like the one next to it. Pastel chrome, blush. | `drift` Strike a Pose; `wrap` Copy Your Moves; `cut` Mirror Slap | (none) |
| `spark_mote` | Confetti Popper | (none) | Sidekick (minion) | `A party popper no bigger than a fist. It has exactly one thing to say, and it says it with a bang and a great deal of confetti.` | A little striped party-popper cone with big shiny eyes and a pull string, bursting into perfectly square confetti. Lemon, mint, blush. | `zap` Big Pop | (none) |
| `typo_sprite` | Pitch Glitch | (none) | Sidekick (minion) | `It lives where the pitch correction slips. Where it lands a note goes robotic, a beat snaps to the grid, and somebody's careful turn arrives one Breath short.` | A small square pixel block with a glitchy smile that jitters between two positions, colour fringing on its edges. Magenta, cyan, lime. | `misspell` Robo Hiccup; `poke` Pixel Poke | (none) |
| `boss_editor` | Flawless | Star of the Perfect Stage | Headliner (boss) | `The Gloss's own star: a perfect pop idol who has never sung a wrong note, because it has never sung a real one. Under all that chrome and shine is something small and nervous that only ever wanted to help.` | Three forms (bible 2.4): phase 0 **Flawless**, a perfect pop idol in pastel chrome lip-syncing into a microphone made of mirror; phase 1 **the Filter**, the idol's face folds away into a giant ring-light lens that airbrushes the stage, arms like selfie sticks, the band text `FLAWLESS!`; phase 2 **the Gloss**, a colossal smooth mirror face in the sky that reflects everyone the same, mouth open, no sound (full form art in 5.3). Gloss sheen tokens, chrome, one mirror gradient. | `handout` Places, Please; `margin` One More Clone; `proofread` Just a Tiny Note; `pen` Lip-Sync Flurry; `strike` Perfect Cut; `footnote` Freeze Frame; `clean` Smooth Everything; `swipe` Selfie Arm Swipe; `smudge` Beauty Mode; `rub` Smooth Over; `typos` Glitches Creep In; `gape` Mirror Gaze; `tear` Perfect Copy; `unwrite` Mute the World; `seep` Confetti Falls; `last` The Final Polish | phase 1: `Hmm. A little rough around the edges. Let me smooth that for you.` phase 2: `There. Perfect. Now nobody ever has to sing a wrong note again.` |

Act III shares exactly one move name between two enemies: **Smooth Over** (`eraser_wraith.rub` and `boss_editor.rub`, the same
Block-piercing mechanic: the wraith teaches the Headliner's move). Every other Act III move name is unique.

### 4.2 Barks (every Act III move that has a `say`; at most 64 characters)

| id | move id | move name | say (exact) |
|---|---|---|---|
| `storm_drone` | `overclock` | Retune | `BEEP. BEEP. BEEEEP.` |
| `komainu_guardian` | `stance` | Arms Crossed | `Name?` |
| `komainu_guardian` | `pounce` | Big Bounce | `NOT ON THE LIST.` |
| `komainu_guardian` | `roar` | VIP Glare | `NOPE. NOPE. NOPE.` |
| `redaction_knight` | `blackout` | That's a Wrap | `Quiet on set.` |
| `void_scribe` | `erase` | Pitch Correction | `Let me fix that for you.` |
| `eraser_wraith` | `rub` | Smooth Over | `Smooth. So smooth.` |
| `thunder_crow` | `dive` | Blinding Dive | `SMILE!` |
| `paper_golem` | `slam` | Sparkle Slam | `FWOOSH.` |
| `margin_imp` | `call` | Glitch Out | `Ooh, a new glitch!` |
| `censor_golem` | `censor` | Mute All | `Nothing to hear here.` |
| `censor_golem` | `raise` | Hover Over | `This will only take a moment.` |
| `censor_golem` | `stamp` | MUTED | `MUTED.` |
| `storm_whelp` | `gather` | Charge the Bulbs | `Bzzzzzzzz...` |
| `storm_whelp` | `clap` | Roaring Applause | `APPLAUSE! APPLAUSE!` |
| `black_bar_inquisitor` | `chains` | Strings Attached | `Hold still. The score is not in yet.` |
| `black_bar_inquisitor` | `gag` | Dazzling Smile | `Silence, please. Smile.` |
| `black_bar_inquisitor` | `verdict` | Final Score | `Next!` |
| `spark_mote` | `zap` | Big Pop | `POP!` |
| `typo_sprite` | `misspell` | Robo Hiccup | `Bzt! Oops.` |
| `boss_editor` | `handout` | Places, Please | `Places, everyone. And smile.` |
| `boss_editor` | `margin` | One More Clone | `One more smile for the cameras.` |
| `boss_editor` | `proofread` | Just a Tiny Note | `Lovely! Just one tiny note.` |
| `boss_editor` | `pen` | Lip-Sync Flurry | `Flawless. Flawless. Flawless.` |
| `boss_editor` | `strike` | Perfect Cut | `So clean!` |
| `boss_editor` | `footnote` | Freeze Frame | `Hold that pose. Forever.` |
| `boss_editor` | `clean` | Smooth Everything | `There. Smooth. Love that for you.` |
| `boss_editor` | `rub` | Smooth Over | `There. Not a flaw left.` |
| `boss_editor` | `unwrite` | Mute the World | `Shh. Perfect. Nobody needs to sing.` |
| `boss_editor` | `last` | The Final Polish | `...perfect. And silent.` |

Moves with no `say` (unchanged count): `storm_drone` jab arc; `komainu_guardian` claw; `redaction_knight` cleave strike; `void_scribe` ink
blot; `blank_soldier` both; `sky_serpent` all; `eraser_wraith` smudge wipe; `thunder_crow` peck perch; `paper_golem` lumber fold;
`margin_imp` doodle scribble; `censor_golem` smack; `storm_whelp` claws breath call; `black_bar_inquisitor` gavel hunt; `blank_page` all;
`typo_sprite` poke; `boss_editor` swipe smudge typos gape tear seep.

### 4.3 Roster roles (exact) and tags

| id | size | roster role (exact) | tags (ids, Who's Who label) |
|---|---|---|---|
| `storm_drone` | m | `Hovering pitch drone. Rapid jabs in threes and a correction on both heroes.` | construct, void (Gadget, Glossy) |
| `komainu_guardian` | l | `Brass rope-post bouncer. Sequins and Feedback, then a crushing bounce.` | construct, folk (Gadget, Showbiz) |
| `redaction_knight` | m | `Clapperboard knight. Hits hard and adds junk cards with every retake.` | construct, folk (Gadget, Showbiz) |
| `void_scribe` | m | `Chrome siren. Strips your buffs and adds junk cards.` | void, folk (Glossy, Showbiz) |
| `blank_soldier` | m | `Mannequin dancer in perfect step. Steady hits that grow in a crowd, weak alone.` | void, folk (Glossy, Showbiz) |
| `sky_serpent` | l | `Coiling streamer dragon. Multi-hit confetti blasts at the backing hero.` | beast, void (Critter, Glossy) |
| `eraser_wraith` | m | `Smooths away your Block and your hero resource stacks.` | void, spirit (Glossy, Sprite) |
| `thunder_crow` | m | `Flying ring light. Dives to leave the lead Starstruck and flashes the backing hero.` | construct, avian (Gadget, Bird) |
| `paper_golem` | l | `Sequinned costume giant. Slow, heavy hits and Sequins.` | construct, void (Gadget, Glossy) |
| `margin_imp` | m | `Tuning-box gremlin. Calls Pitch Glitches and adds junk cards that cost you Breath.` | spirit, construct (Sprite, Gadget) |
| `censor_golem` | l | `Giant mute button. Junk cards, Sequins, and one huge press.` | construct, void (Gadget, Glossy) |
| `storm_whelp` | l | `Lit-up applause sign. Roaring applause on both heroes, slow claps, calls Confetti Poppers.` | construct, folk (Gadget, Showbiz) |
| `black_bar_inquisitor` | l | `Talent-show mannequin judge. Starstruck, Tangled, and a finisher against a low hero.` | folk, void (Showbiz, Glossy) |
| `blank_page` | s | `Lip-syncing clone. Gains Block, then leaves a hero Wobbly.` | void, folk (Glossy, Showbiz) |
| `spark_mote` | s | `Tiny party popper. One bang and it bursts.` | construct (Gadget) |
| `typo_sprite` | s | `Glitchy pixel sprite. Adds a junk card that costs you Breath.` | spirit, void (Sprite, Glossy) |
| `boss_editor` | xl | `Perfect pop idol who never sang a real note. Becomes the Filter, then the Gloss itself.` (bible) | void, folk (Glossy, Showbiz) |

### 4.4 ART DIRECTION: Act III, the Perfect Stage

Palette: the Gloss tokens from bible 3.6 (`#f4f1fb`, lilac sheen `#e6d9ff`, mint sheen `#d9fff4`, blush sheen `#ffe3f1`) plus chrome
silver `#c9cbd6` and one mirror gradient; nothing saturated except ONE small accent per creature (the judge's buzzer red `#ff4d6d`, the
sign's warm bulbs, the bouncer's plum rope, the gremlin's magenta), and even the dark outline softens to a cool slate `#5a5f7a` so the
whole Act reads too clean. Shapes: perfect symmetry, circles (ring lights, buttons, popper cones), grids (sequins, confetti that falls
in a grid, the synchro dancers' ranks), mirrors and smooth ovals; every face that has one wears the same **Gloss smile** (a small
closed-mouth curve drawn identically on every creature, one shared helper). Materials: chrome, mirror, sequins, glossy plastic,
pastel streamers, light bulbs, mannequin gloss. Signature visual gag: everything is perfect and identical until it is hit: a hurt
pose cracks a hairline of REAL colour (saturated, warm, a little messy) through the polish for a moment, and the win-over breaks the
symmetry for good: one eyebrow lifts, the Gloss smile goes lopsided and real, and the creature pops into confetti that falls NOT in a
grid. How they relate to the stage and mic world: this is the biggest talent show in the world with the life taken out of it, so the
enemies are the show's own machinery and cast (the tuner, the bouncer, the clapperboard, the ring light, the applause sign, the
mute button, the backing dancers, the clones, the judges) all polished to nothing; the arena floats above a sea of phone lights,
mirror floors double every creature (a cheap reflected copy under each sprite is welcome where the floor shows), and the mannequin
crowd holds up phones in the background. The music under the Act gains swing as it is unmuted (audio plan); the art mirrors that by
letting won-over creatures leave their real colour behind as a small sparkle on the floor.

### 4.5 Rig map (`js/art_enemies_3.js` headers)

| id | Echowake rig | keep | replace |
|---|---|---|---|
| `storm_drone` | STORM DRONE (hovering lamp, toy rotor, lightning) | the hover bob, the rotor, the triple jab timing | the lamp becomes a chrome tuner disc with a needle face; lightning becomes pitch lines |
| `komainu_guardian` | KOMAINU GUARDIAN (stone beast on a plinth, pounce) | the plinth, the braced stance and the pounce arc | the lion-dog becomes a brass rope post with a rope arm and sunglasses |
| `redaction_knight` | REDACTION KNIGHT (plate armour struck with black bars) | the knight body and cleave swings; the bars become clapperboard stripes | the face bar becomes a snapping clapperboard visor |
| `void_scribe` | VOID SCRIBE (hooded floating figure, mask, robe) | the float and the robe hem | the hood and mask become a smooth chrome face with a mirror mic and slider halo |
| `blank_soldier` | BLANK SOLDIER (rectangle body, accordion limbs, marching in step) | the in-step march (now a synchronised dance step) and the rank spacing | the folded body becomes a mannequin dancer |
| `sky_serpent` | SKY SERPENT (coiled dragon-serpent chain) | the coil chain and the back-row strike | the cloud body becomes pastel streamers; the head becomes a confetti cannon |
| `eraser_wraith` | ERASER WRAITH (half rubbed-out cloak, blank oval face) | the soft half-there edge and the pressing hand | the pencil smudge becomes soft focus; the hand becomes an airbrush nozzle |
| `thunder_crow` | THUNDER CROW (dive, perch) | the dive and perch timing | the crow becomes a flying ring light on a tripod |
| `paper_golem` | PAPER GOLEM (faceted giant, plating) | the giant body, the pad-up and slam | the paper facets become sequin panels that flick off when hurt |
| `margin_imp` | MARGIN IMP (doodle imp in a shaky hatched line) | the shaky line idea (now a pixel jitter) and the summon pose | horns become headphone-cup ears; add the clipboard |
| `censor_golem` | CENSOR GOLEM (cabinet body, door-sized stamp arm) | the stamp arm and its raise-then-press timing | the cabinet becomes a round button with a crossed-out speaker face |
| `storm_whelp` | STORM DRAGON WHELP (chubby dragon gathering charge) | the charge glow that grows with each stack and the clap that spends it | new body: a marquee sign on scaffold legs with gloved hands |
| `black_bar_inquisitor` | BLACK-BAR INQUISITOR (tall robe, gavel) | the seated presence and the gavel strike (now the buzzer) | the robe becomes a pastel suit on a mannequin in a judge's chair |
| `blank_page` | BLANK PAGE (small floating sheet) | the small float | new body: a tiny idol clone with a mirror mic |
| `spark_mote` | SPARK MOTE (ball with fins, big eyes, arcs) | the big eyes and the one-shot burst | the ball becomes a striped popper cone; arcs become confetti |
| `typo_sprite` | TYPO SPRITE (keycap with a glowing face) | the small square body and the glitchy face | the keycap becomes a pixel block with colour fringing |
| `boss_editor` | THE CONDUCTOR (one spec, three forms: gaunt figure with baton, hulking giant, colossal face in a hole in the sky) | the three-form structure (prefixes p0 p1 p2, one rig per phase), the phase 0 slender stance, the phase 1 bulk, the phase 2 sky-filling face | the baton becomes a mirror mic, the giant becomes the Filter's ring-light lens and selfie-stick arms, the hole in the sky becomes a smooth mirror face; see 5.3 |

## 5. The Headliners: story beats and form art

Each Headliner is a music lover the Gloss got to first (bible 2.2). Every beat below lines up with the move order of its existing AI
(unchanged), so the story is told by the fight itself. Lyrics are never quoted (H17).

### 5.1 Kraki, the Karaoke Kraken (`boss_kuzunoha`, Act I): she held the MICS

1. Reveal. At the end of the longest pier the little open-air stage has grown to the size of the harbour. Kraki rises out of the water
   beside it: huge, round, pink and teal, eight arms each holding a mic, a glossy smiling mask over her kind face. Banner: `Kraki`,
   sub `The Karaoke Kraken`.
2. Opening (`paper_fold`, Mic Check). She taps a mic against a speaker and two Mic Squeals shriek into life.
3. The set (`ink_strike` Mic Slam, `ink_bleed` Drown Them Out, the telegraphed `great_stroke` Power Anthem, `brush_flurry` Tentacle
   Twirl, `tail_sweep` Arm Sweep). She sings every song herself, perfectly lip-synced to the Gloss's backing track, louder and louder.
   Every fifth turn, Glossy Smile (`mask_gaze`): "nobody gets embarrassed tonight". If a hero wobbles low, she swoops in with a
   Too-High Note (`ink_needle`) to "help".
4. Phase at half HP: the mask cracks. Phase line `You cracked my mask! Fine. Hear my REAL voices!` The mask halves drift apart and
   become Mic Squeals, she is Exposed for two rounds, and her arms fan out into a wheel of eight mics: her second form alternates Eight
   Mics Up (`tails_rise`) with Every Voice at Once (`nine_tails`, eight mics and her own voice: nine hits).
5. Stalling (turn 14, `frayed_ink`): Hoarse but Louder. Her voice is going and she pushes anyway.
6. Won over. The last squeal fades. She takes a breath and sings one song with her real voice; it wobbles and cracks on the high note,
   and the whole bay cheers. She hands the mics back one by one, and even lets the gulls have a go. The `ch1_clear` entry (`Kraki Gives Back the
   Mics`) carries it on, ending on the goat-masked figure on a rooftop who recorded it all.

Form art. Phase 0 (Masked): seated low in the water like a big friendly teapot, arms bundled behind her in a loose fan, the glossy
mask whole, sound bubbles drifting. Phase 1 (Unmasked): the mask split into two drifting halves with warm light between, the eight
arms open into a peacock wheel of mics with three turning sound rings behind, her real colours brighter, eyes shining (not angry:
excited and a little scared). Telegraph lifts the biggest mic arm like a conductor's hand; attack swings it down; block curls every
arm into a dome; buff flares the mics outward; win-over: the mask falls into the water as sparkles, she waves every arm.

### 5.2 Scrollspinner, Queen of the Feed (`boss_jorogumo`, Act II): she held the PEOPLE

1. Reveal. On top of the tallest phone-tower, in a ring-light halo, the most perfect influencer avatar in Scrollopolis. Banner
   `Scrollspinner`, sub `Queen of the Feed`. She starts with Sequins (her glitter).
2. Opening (`brood` Hatch Botlings, then `snare` Keep Scrolling): two Botlings and a cable Tangle on both heroes, with an Untangle card
   on top of the draw pile. The lesson of the Act: the Feed is the setup and her finisher scales with it.
3. The set: Selfie Flurry (`fan`) and Air Kiss (`kiss`, Earworm on the backing hero), Big Squeeze (`embrace`) whenever a hero is still
   Tangled, Keep Scrolling again every fourth turn, One More Bot when the brood is gone.
4. Phase at half HP. Phase line `Enough of this filter. Look at me properly!` She drops the filter: Sequins gone, Volume 2, and the
   real Scrollspinner looks at the duo with eight bright phone-screen eyes. Spin the Feed (Tangled 2 on both), World Wide Web on both
   heroes when they are tangled twice, Eight-Leg Swipe, Air Kiss; below 20 percent, once, Refresh Frenzy.
5. Won over. She says she only wanted nobody to be lonely. The web goes slack, every screen in the city dims, and Scrollopolis looks up
   at the moon for the first time in years. Somebody hums. From under the street a bass line rises (`ch2_clear`, `The City Looks Up`).

Form art. Phase 0 (the Avatar): a towering bell silhouette in a glittering gown, a perfect filtered face with a ring-light halo, a
phone held up in a selfie pose, only four slender spider feet peeking from under the hem, Feed cables swaying behind with small
notification balloons on them. Phase 1 (the Spinner): the gown splits on a spider's body, eight long legs skitter, eight phone-screen
eyes glow (each showing a tiny heart or thumb), hair loose, a great web of glowing cables fills the backdrop. No kimono, no silk, no
pins: glitter, glass and light only. Win-over: the screens in her eyes switch off one by one and her real eyes look up.

### 5.3 Flawless, Star of the Perfect Stage (`boss_editor`, Act III): it holds PERFECTION

The finale is the owners' song "Human" (bible 2.5): never quote it; the game only ever asks "are we losing being human?" in its own
words, and only in the narrative entries.

1. Reveal. The centre of the Perfect Stage: the Applause Sign blazes, the mannequin crowd holds up phones, three judges' chairs stand
   empty. Flawless performs perfectly, lip-syncing into a mirror mic. Banner `Flawless`, sub `Star of the Perfect Stage`.
2. Form 0, Flawless (100 to 66 percent). Places, Please (`handout`, two Lip-Sync Clones). Just a Tiny Note (`proofread`, Exposed on the
   lead and a junk card), Lip-Sync Flurry (`pen`, swap the Exposed hero out), Perfect Cut (`strike`, a junk card on top of the draw).
   Once, below 72 percent, Freeze Frame (`footnote`, Block 16); One More Clone when the clones are gone. Every line is a compliment
   (gag 9): "Lovely!", "So clean!".
3. Phase 1 at 66 percent, the Filter. Phase line `Hmm. A little rough around the edges. Let me smooth that for you.` The idol's face
   folds away into a giant ring-light lens, the arms become selfie sticks, the band text `FLAWLESS!` lights up, the stage is
   airbrushed and the heroes' colours fade a little towards pastel (art only: a 20 percent desaturate on the hero sprites while this
   form lives). Smooth Everything (`clean`, wipes buffs and Bloom, Groove, Reverb, Rumble), Smooth Over (`rub`, pierces Block), Selfie
   Arm Swipe, Beauty Mode (both heroes, buffs gone), Glitches Creep In (Pitch Glitches).
4. Phase 2 at 33 percent, the Gloss. Phase line `There. Perfect. Now nobody ever has to sing a wrong note again.` The force itself fills
   the sky: a colossal smooth mirror face, mouth open, no sound. In its mirror the two heroes appear as perfect, silent versions of
   themselves: no wobble, no late kick, no giggle. It offers this kindly. Junk cards drift into the deck. Mute the World (`unwrite`,
   both heroes, stronger for every living enemy: win the poppers and clones over first), Perfect Copy (`tear`, the heavy), Mirror Gaze
   (`gape`, both), Confetti Falls (Confetti Poppers); once, below 12 percent, The Final Polish.
5. Won over: the `victory` entry (`Human`, bible 2.5 beat 4). The duo choose to stay human and sing; a voice cracks on the high note, a
   kick lands a hair late, and it is the best sound anyone has heard in years. One mannequin blinks, then sings, badly; then everyone
   does. The mirror face shows a real, nervous smile: it was the very first little filter, made to help a nervous singer feel brave.
   It sings one real, wobbly note, and the Gloss softens into ordinary stage shine that makes the lights sparkle.

Form art. Phase 0 (Flawless): a slender pop idol in pastel chrome, perfectly symmetrical, a mirror mic, a ring of backing light, the
Gloss smile; the telegraph is a hair flip, the attack a perfect pose. Phase 1 (the Filter): the head folds back into a huge ring-light
lens with a soft-focus glow, two long selfie-stick arms with phone hands, the body a column of chrome, `FLAWLESS!` across a band on
the chest (the only art text besides APPLAUSE and SKIP). Phase 2 (the Gloss): a sky-filling smooth oval mirror face, eyes and mouth as
calm slits of light, the mirror showing two simplified hero silhouettes in pastel with no motion lines (the "perfect copies"), Gloss
tokens everywhere, no darkness, no menace: too clean. Win-over: the mirror crazes into soft sparkles, and left floating is a tiny shy
round lens with a nervous smile, which wobbles a single note (one music note drawn, crooked) before the curtain.

## 6. Art rules shared by all 51 (for the art agents)

1. Style: the owners' chibi cards are the authority: big heads, round forms, stubby limbs, a thick dark outline (Act III softens it to
   slate), flat cel shading with one highlight, big expressive eyes where a creature has eyes. Faces are cute even when grumpy.
2. Contract unchanged (DESIGN 5.6): one `ART.enemy.register(id, {draw, bounds})` per id, facing left, feet at the origin, the same
   size class and poses (`idle attack hurt block buff die telegraph`), deterministic, cached part sprites. The bounds may change to
   fit the new silhouette; hit boxes follow the bounds.
3. The Gloss is drawn with one shared helper per file (`glossSheen(S, box, strength)`): a pastel highlight sweep like a phone screen
   catching the light, airbrushed edges, the Gloss smile where asked. Strength by Act: I a single patch, II screens and filters, III
   everything.
4. The `die` pose becomes the **win-over**: no torn strips, no soul orb. The Gloss flakes off as sparkles in the Act palette, the
   creature does one small happy hop or wave with its real colours back, then pops into the Act's confetti (I: petals and bunting
   flags, II: hearts and dimming pixels, III: confetti that breaks the grid). Same timing as today so `SCENE` and tests are unaffected.
5. Hit words stay as the bible sets them (`PKAH!` for the `ink` element Kraki and the Act III junk-adders use, `SIZZ!`, `WOMP!`,
   `NANANA!`, `TING!`); enemies never draw text except `APPLAUSE` (Applause Sign), `SKIP` (Unskippable Ad), `FLAWLESS!` (the Filter)
   and the number on the Notification Imp.
6. No animal products in any drawn material (H5): no leather, fur, wool, silk, felt, feathers as a material, pearl, shell as a
   material, bone or horn as a material. Animal-like characters (the crab, the gull, the heron, the moth, the kraken, Botlings) are
   fine; their bodies are just bodies.
7. Gallery sheet titles change with the Act names: `Act I, Blossom Bay`, `Act II, Scrollopolis`, `Act III, the Perfect Stage`, and
   boss sheets `Kraki, both forms`, `Scrollspinner, both forms`, `Flawless, all three forms`.

## 7. Execution checklist (what to patch, and the tests that hard-code Echowake strings)

Data (one commit per Act is fine; the roster test needs data, `ROSTER_SRC` and `CONTENT_SPEC.md` 4.1 to change together):
- `js/data_enemies_1.js`, `js/data_enemies_2.js`, `js/data_enemies_3.js`: per id, `name`, boss `title`, every `moves.*.name`, every
  existing `moves.*.say`, every `phases[].say`, `lore`, `tags`, from sections 2 to 4; rewrite the header comments in the new theme
  (they may keep ids, never `--`).
- `js/data.js` `ROSTER_SRC`: names, roles and boss titles from 2.3, 3.3, 4.3; `CONTENT_SPEC.md` 4.1 tables and the boss titles line to
  match, row for row.
- `js/screen_menu.js` (Who's Who chips, line about 1403): read a display map `TAG_LABEL = { spirit: 'Sprite', beast: 'Critter', folk:
  'Showbiz', undead: 'Faded', construct: 'Gadget', insect: 'Bug', avian: 'Bird', aquatic: 'Seaside', void: 'Glossy' }` instead of
  `cap(tg)`; tag ids stay in `LISTS.enemyTags`.
- `js/art_enemies_1.js`, `_2.js`, `_3.js`: redraw per sections 2.4, 2.5, 3.4, 3.5, 4.4, 4.5, 5 and 6.

Tests that name an Echowake enemy string and must take the new one (ids and mechanics in them stay):
- `tests/hocus_vocus_enemies_1.test.mjs` 96: boss name `Kuzunoha` becomes `Kraki`.
- `tests/hocus_vocus_enemies_2.test.mjs` 128: boss title `The Silk Courtesan` becomes `Queen of the Feed`.
- `tests/hocus_vocus_enemies_3.test.mjs` 200: the one shared move name `Smother` becomes `Smooth Over` (still `eraser_wraith,boss_editor`).
- `tests/hocus_vocus_data.test.mjs` 838: the drowned general's role includes `Lantern Wisp` becomes `Grumble Cloud`.
- `tests/hocus_vocus_scene.test.mjs` 328, 438, 808, 1150 to 1162: `Spiderling` to `Botling`, `Leaf Imp` to `Kazoo Imp`, `Kuzunoha` to `Kraki`.
- `tests/hocus_vocus_screen_combat.test.mjs` 241 to 245, 356, 363, 1070, 1124, 1364: `Kappa` to `Fussy Foghorn`, `Mud Slap` to any
  move name (synthetic), `Kuzunoha` to `Kraki`, `Oni Brute` to `One-Hit Jukebox`, `Leaf Imp` to `Kazoo Imp`, `Crow Tengu` to
  `Pitch-Perfect Gull`.
- `tests/hocus_vocus_screen_end.test.mjs` 275 and `tests/hocus_vocus_screen_menu.test.mjs` 251, 728, 734: `Kuzunoha` to `Kraki`, `Kappa`
  to `Fussy Foghorn`.
- `tests/hocus_vocus_game.test.mjs` 676: `/Kappa/` to `/Fussy Foghorn/`.
- `tests/hocus_vocus_narrative.test.mjs` 514 to 524 (the narrative plan rewrites these with the story entries: `Kraki`,
  `Scrollspinner`, `Flawless` instead of `Kuzunoha`, `Jorogumo`, `Conductor`).
- `tests/hocus_vocus_theme.test.mjs`: replaced by the Hocus Vocus theme-leak suite; every string here passes its 6.2 and 6.3 lists.

Not to touch: encounter group ids (`ch1_kappa_solo` and so on are internal), the `art.id` of every enemy, `immune`, `hooks`, and the
event `fight` ops (the events plan names the enemies in prose by the names above).

## 8. Glossary additions

New player-facing terms this plan adds (the bible has none of them yet; add them to bible 4.1 or keep them here as the source):

| Term | Meaning and use |
|---|---|
| The 51 enemy names in sections 2.1, 3.1, 4.1 | reserved names (H16): no card, Charm, gem, Detour title or Spell may reuse one; the move names are reserved for their enemy |
| Who's Who tag labels: `Sprite`, `Critter`, `Showbiz`, `Faded`, `Gadget`, `Bug`, `Bird`, `Seaside`, `Glossy` | display labels for the tag ids `spirit beast folk undead construct insect avian aquatic void` on the Who's Who chips; `Faded` is kept for the unused `undead` id |
| win over / won over | the verb for defeating an enemy in lore, roles and art notes (bible 1.3 already allows "are won over"); roles use "win it over" where Echowake said "kill it" |
| Gloss patch | art term: the one airbrushed pastel panel each Act I creature carries |
| Gloss smile | art term: the identical small closed-mouth smile on every glossed face (Act III, the clones, Kraki's mask, the Filter Fairy has none) |
| the Avatar / the Spinner | art sheet names for Scrollspinner's phase 0 and phase 1 (the bible names Flawless's forms; Kraki's are Masked and Unmasked) |
| Masked / Unmasked | art sheet names for Kraki's phase 0 and phase 1 |
| Act one-liners | `Sea salt, cherry blossom, and a bay where somebody has taken all the mics.` / `It is always 2 am in the city of screens, and nobody has looked up in years.` / `The biggest show in the world, where every act is perfect and nobody sings.` (suggested; the narrative plan may override) |
