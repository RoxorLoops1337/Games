# HOCUS VOCUS: content specification

Targets, guardrails and voice for every content file. Schemas, the effect DSL and the closed vocabularies are in
`DESIGN.md` and `js/data.js` (`DATA.LISTS`). This file says how much, how strong, and how it should feel.
Content is data only: no functions, no unseeded random call, no em or en dashes. The words the player reads are in the 1.1 table of
`DESIGN.md` and in `plan/HV_BIBLE.md` section 4; the ids below never change.

`DATA.add(kind, defs)` takes an object keyed by id, `{hanae_slash: {...}}` (an array throws), except `tips`, which takes an array of strings.
Check yourself with `DATA.validate('<registry>', {hero:'kuro'})` or `{chapter:2}` (zero errors) and `DATA.audit('<kind>', {hero|chapter})`
(no `audit` lines; `guide` lines are soft numbers the balance wave tunes). The integration wave runs `DATA.validate(undefined, {strict:true})`.

## 1. Voice

A cheerful tour narrator who loves these people, knows a lot about music and never takes the Gloss too seriously. Silly, warm and
heartfelt, both at once: a joke every few lines and a lump in the throat at the end of each Act. Plain words, short sentences, British
spelling, second person in the UI, third person in lore. Concrete sounds over abstract magic: "a kick drum thumps" before "power
surges". Good things ring, hum, sparkle and sing along; the Gloss is described as polite, glossy and wrong, never as evil, and it can
only compliment ("Flawless!", "So clean!"). Names are playful music and magic words ("Petal Note", "Soft Shield", "Boots and Cats"),
1 to 3 words. Flavour lines and lore read like a friend telling the story of the tour. Who's Who lore is 1 to 2 sentences and kind
about the creature. Never crude, never mean, nobody dies (creatures fall quiet or are won over, heroes lose their voice and get it
back), and no real names beyond the handles (`plan/HV_BIBLE.md` section 6 is the checklist).
Player-facing numbers come from the ops, never typed into text by hand (card text is generated, a `text` field on a card is an error).

## 2. Fixed ids other modules depend on

- Starter cards: `hanae_slash hanae_parry hanae_petal_step`, `kuro_ink_bolt kuro_ink_ward kuro_first_stroke`,
  `suzu_ofuda suzu_barrier suzu_moon_prayer`, `raiga_jab raiga_brace raiga_static_fist` (5-card starters are
  defined in `DATA.heroes`: two copies of the strike, two of the defence, one signature). In the player's words: Jasmin's Petal Note,
  Soft Shield and Take the Lead; RoxorLoops's Kick Drum, Hi-Hat Guard and Drop the Beat; RawClaw's Synth Zap, Reverb Wall and Warm Pad;
  Andy's Slap Bass, Amp Stack and Thunder Thumb.
- Enemy ids: the whole roster in section 4.1 (ids, names, tiers, sizes and Acts are law). Boss ids: `boss_kuzunoha` (ch1), `boss_jorogumo` (ch2), `boss_editor` (ch3).
- Stickers (achievements): `ch1_clear`, `ch2_clear` (unlock RawClaw and Andy), plus `ch3_clear` (the first win).
- Charms (relics) that Detours may reference (`data_relics.js` MUST define them): `brass_lantern` (common, the Tour Poster), `fox_mask`
  (uncommon, the Goat Mask), `silver_bell` (uncommon, the Triangle), `jade_key` (rare, the Backstage Pass).
  Detours may reference NO other relic, gem or card id: use `rarity`, `color`, `tier`, `pool` and the fixed curse ids below instead.
- Curse cards (`hero:'curse'`, defined in `data_cards_shared.js`): `curse_regret` (unplayable; in hand at end of turn: hurt 2 to the lead hero), `curse_smudge` (unplayable, pure clutter),
  `curse_doubt` (unplayable; when drawn: Muffled 1 on the lead hero), `curse_burden` (unplayable, Opener), `curse_hex` (unplayable; in hand at end of turn: Exposed 1 on both heroes),
  `curse_decay` (unplayable; in hand at end of turn: hurt 1 to both). Their player names are Cringe Replay, Pitchy, Stage Fright, Excess Baggage, Hot Take and Screen Time.
- Status cards creatures add to your piles (`hero:'status'`, same file): `status_blot` (unplayable, One Take), `status_tangle` (cost 1, Fade: remove Tangled from both heroes, `tgt:'both'`, because either hero can be the Tangled one; named Untangle), `status_scorch` (unplayable, One Take;
  in hand at end of turn: hurt 2 to the lead hero), `status_redacted` (unplayable), `status_static` (cost 0, Fade: hurt 2 self, draw 1), `status_wilt` (unplayable; when drawn: lose 1 Breath via `energy` n -1).
  Curse and status cards are acted by the FRONT hero (`self` in their ops is the lead hero). Debuffs in their `hand.*` ops need an explicit `tgt`.
- Curses and status cards use `rarity:'token'`, `type:'curse'` or `'status'`, need no `up` and no `art.c`, and still need `art` (`void`, `web`, `skull`, `sigil`, `ink_splash`, `fire` fit).
- Lore ids (the Tour Diary): `intro`, `ch1_intro`, `ch2_intro`, `ch3_intro`, `ch1_clear`, `ch2_clear`, `victory`, `defeat`, `hero_<id>` x4 and `barks_<id>` x4 (section 6).

## 3. Cards (per hero: `data_cards_<hero>.js`)

Per hero, exactly the starters above plus: **14 commons, 12 uncommons, 8 rares** (all non-token, all with `up`), plus tokens only if your cards `add` them (ids `<hero>_tok_<name>`).
Mix: at least 30% attacks and 30% skills; at least 4 powers (uncommon and rare); at least one `X` cost card; at least 3 cards using `cond` on `row`;
at least 4 cards that touch the ally hero (`tgt:'ally'` / `'both'`, or `per` with `who:'ally'`); at least 2 `pick` cards; at least 5 cards with keywords.
Three archetypes per hero, each with at least 4 cards that clearly push it, and some that bridge two:

| hero | archetypes | resource | best spot |
|---|---|---|---|
| Jasmin | **Bloom burst** (stack Bloom, spend with `consume`), **Vocal runs** (multi-hit plus Volume), **Soft counter** (Block into damage, Shimmy) | `bloom` | lead |
| RoxorLoops | **Stuck in your head** (Earworm and Sizzle engines), **Big drops** (spend Groove, area hits), **Remix** (draw, Hold, Breath, pick and Fade tricks) | `sumi` | backing |
| RawClaw | **Wall of sound** (Block, heal, spending Reverb, `revive`), **Feedback and Spotlight** (retaliation), **Filters** (Muffled, Exposed and Starstruck control) | `ward` | backing (lead for Feedback) |
| Andy | **Thunder** (multi-hit and area low-end hits from Rumble), **Feedback** (Feedback and damage when hit), **Slap** (Starstruck, Sizzle, big single hits) | `charge` | lead |

Power guidance at 3 Breath and starter-deck quality (numbers are base, upgraded is roughly +30 to 40%, or adds value such as a keyword or a cheaper cost):
1-cost attack 6 to 9 damage; 2-cost attack 11 to 16 (or 7 to all); 3-cost attack 20 to 28 (or 12 to all); 0-cost attack 3 to 5; 1-cost skill 5 to 8 Block;
2-cost 10 to 15 Block; draw 1 is worth about a 0-cost card; +1 Breath costs a real drawback or a stiff cost; Earworm 3 to 5 for 1 Breath, Muffled or Exposed 1 to 2 for 0 to 1 Breath.
Rares should change how you play, not just hit harder. Uncommons carry the archetype pieces. Commons are solid, readable building blocks. Powers are built from `hook` and persistent `status` ops (idioms below).

**Slots.** Colour must be useful for the card's ops because flat gem mods only change ops that exist: `red` (the pink gems) only on cards with a `dmg` op, `blue` only on cards with `block`, `heal` or a hero-targeted `status`, `green` and `gold` on anything.
Starters and commons have exactly 1 slot, uncommons 1 to 2, rares 2 (`any`, the rainbow slot, on at most 4 rares). Per hero across its 37 cards: at least 10 cards with a `red` slot, 10 `blue`, 8 `green`, 8 `gold`, and a `gold` slot on every power.
`locked:true` on at most 4 uncommons and 4 rares per hero, never on starters or commons. Every card has `art` (`m` from `LISTS.motifs`, `c` from `LISTS.palettes`, both required on non-tokens,
`hero:true` if the hero's pose belongs in the illustration; use it on about half of the attacks, and on at least 30 percent of them, which the audit checks). No two cards of a hero share the same `art.m` plus `art.c` pair.
Ids are `<hero>_<snake_name>`, tokens `<hero>_tok_<name>`. Add a one-line `flavor` to every rare and to a third of the others. Rules text (generated) stays under 110 characters.
Card names are playful music and magic words, 1 to 3 words, unique among all 160 cards, with no hero prefix; the owners' two song nods are the cards named Arabic Impro and Calling of the Moon.

### 3.1 Writing common effects (idioms)

The DSL is closed (`DESIGN.md` 4.4). These are the standard ways to say the things authors keep asking for:

```js
// next turn: gain 2 Breath
{ op: 'hook', on: 'turnStart', once: true, fx: [{ op: 'energy', n: 2 }] }
// this turn only: +3 Volume (a negative status n removes stacks)
[{ op: 'status', s: 'might', n: 3, tgt: 'self' }, { op: 'hook', on: 'turnEnd', once: true, fx: [{ op: 'status', s: 'might', n: -3, tgt: 'self' }] }]
// whenever you play a Skill, gain 1 Groove (a power)
{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }
// whenever a card is faded, gain 3 Block; at the start of your turn gain 1 Feedback
{ op: 'hook', on: 'onExhaust', fx: [{ op: 'block', n: 3, tgt: 'self' }] }    { op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'thorns', n: 1, tgt: 'self' }] }
// spend up to 4 Bloom, 4 damage each
{ op: 'dmg', n: { per: 'status', s: 'bloom', mul: 4, upTo: 4 }, consume: { s: 'bloom', upTo: 4 } }
// spend exactly 3 Groove or fizzle
{ op: 'cond', if: { status: { s: 'sumi', gte: 3 } }, then: [{ op: 'removeStatus', s: 'sumi', n: 3, tgt: 'self' }, { op: 'dmg', n: 10, tgt: 'all' }] }
// Block into damage, then lose the Block
{ op: 'dmg', n: { per: 'block' }, consume: 'block' }
// splash: 6 to the target, 3 to every other creature;  damage per debuff on the target
[{ op: 'dmg', n: 6, tgt: 'enemy' }, { op: 'dmg', n: 3, tgt: 'others' }]      { op: 'dmg', n: { per: 'debuffs', mul: 4 }, tgt: 'enemy' }
// Block equal to the ally's Block;  heal the ally for its missing HP;  bring a voiceless ally back
{ op: 'block', n: { per: 'block', who: 'ally' }, tgt: 'self' }    { op: 'heal', n: { per: 'missingHp', who: 'ally' }, tgt: 'ally' }    { op: 'revive', n: 10 }
// Charm: a second wind (a voiceless hero stands up once);  every third unmuted hex refunds 1 Vox;  a gem-aware block;  Rival fights pay gold;  the lead hero hits harder
{ on: 'onHeroDown', once: true, fx: [{ op: 'revive', pct: 0.25 }] }        { on: 'onPaint', every: 3, fx: [{ op: 'ink', n: 1 }] }
{ on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'block', n: 1, tgt: 'self' }] }
{ on: 'onFightWon', filter: { tier: 'elite' }, fx: [{ op: 'gold', n: 20 }] }        rows: { front: { dmgAdd: 1 } }
// creature: an exploding Sidekick; a dispel; a thief that runs
hooks: [{ on: 'onDeath', fx: [{ op: 'dmg', n: 4, tgt: 'front' }] }]     { op: 'removeStatus', s: 'buffs', tgt: 'front' }     [{ op: 'stealGold', n: 20 }, { op: 'flee' }]
```

### 3.2 Not expressible: do not design these

Play a card again or replay it, cost changes other than a gem's `cost`, targeting the highest-HP creature, triggering Earworm early or making it permanent, per-creature filters on area effects (only creatures with status X),
hooks on Shimmy, discard or draw, temporary Breath costs, and anything that reads the ally's spot (use `cond` `row` on yourself: if you are in the backing spot, the ally is in the lead). The lead may add vocabulary later; never invent a private field.

## 4. Enemies (`data_enemies_<chapter>.js`)

### 4.1 The fixed roster

**Ids, names, tiers, sizes and Acts are law.** `data_enemies_N.js` defines exactly its Act's ids and `art_enemies_N.js` draws exactly them (`art.id` equals the id). Adding or renaming an id needs the lead to edit this list
(and `DATA.ROSTER` in `js/data.js`) first; the validator rejects any other id. Per Act: 10 normals (the player says Creatures), 3 elites (Rivals), 3 minions (Sidekicks), and the boss (the Headliner). Authors keep freedom over stats, moves, AI and lore. The role is the design intent; the
creature's moves should show it. Encounter group ids are `ch<N>_<name>` (for example `ch1_kappa_pair`) and globally unique; Detours reference creatures by id in `fight {enemies:[...]}`, never by group id.

**Act 1, Blossom Bay**

| id | name | tier | size | role |
|---|---|---|---|---|
| `kappa` | Fussy Foghorn | normal | m | Proud harbour foghorn. A honk that leaves the lead Exposed, a bump, then a guard; teaches Exposed and Block. |
| `tanuki_bandit` | Coin Crab | normal | m | Coin crab. Grabs gold from your hat, thumps, then scuttles off with it; win it over first to get the gold back. |
| `kodama` | Tuning Forkling | normal | s | Tiny tuning fork. Rings at both heroes lightly and calls a Kazoo Imp to its side. |
| `karakasa` | Squeezebox | normal | m | Hopping accordion. Two quick polka hops, then squeezes shut for Block; its wheeze leaves a hero Wobbly. |
| `hitodama` | Hot Chilli | normal | s | Hopping hot chilli. Hard to hit at first, Sizzles the lead and tips spicy junk cards into your deck. |
| `oni_cub` | Jitterbug | normal | m | Small bug of pre-show nerves that gains Volume every turn. Win it over early or it only gets louder. |
| `crow_tengu` | Pitch-Perfect Gull | normal | m | Pitch-perfect gull. Dives on the backing hero, pecks in flurries, and swaps your heroes' spots. |
| `bamboo_sprite` | Pea Pod | normal | s | Pod of three singing peas that arrive in packs. Three tiny shots at random heroes every turn. |
| `mushroom_folk` | Jingle Machine | normal | m | Jingle-singing vending machine. Earworms the lead and grows Feedback in bubble wrap. |
| `bamboo_boar` | Runaway Melon | normal | l | Rolling prize melon. Gains Sequins, winds up (telegraph), then one heavy downhill roll. |
| `oni_brute` | One-Hit Jukebox | elite | l | Washed-up jukebox. Heavy hits and Muffled, and it sulks into a rage below half HP. |
| `tengu_duelist` | Dance-Off Heron | elite | l | Tap-dancing heron. Lunges at the backing hero, gains Shimmy, and answers hits with a quick step. |
| `moss_guardian` | Old Bandstand | elite | l | Walking harbour bandstand. Sequins and Feedback, slow stomps, calls Kazoo Imps from its rafters. |
| `ember_wisp` | Chilli Flake | minion | s | Tiny chilli flake. Sizzles a hero once, then fizzles out. |
| `leaf_imp` | Kazoo Imp | minion | s | Fast little kazoo called by tuning forks and bandstands. One weak poke. |
| `paper_kodama` | Mic Squeal | minion | s | Shrieking little mic creature. Clogs your deck with junk cards. |
| `boss_kuzunoha` | Kraki | boss | xl | Karaoke kraken with eight stolen mics. Mic slams and mic squeals, then every voice at once. |

**Act 2, Scrollopolis**

| id | name | tier | size | role |
|---|---|---|---|---|
| `chochin` | Flamebait | normal | m | Flaming matchstick. Sizzles the lead, gives every enemy Crescendo, then a flame war on both heroes. |
| `karakuri_puppet` | Clickbait Goblin | normal | m | Wind-up clickbait goblin with a fixed combo; its third trick leaves the lead Starstruck. |
| `nopperabo` | Filter Fairy | normal | m | Faceless filter fairy. Leaves the lead Muffled and Wobbly, then pokes harder while they stick. |
| `drowned_samurai` | Unskippable Ad | normal | l | Walking advert. Steady jabs and Sequins from its frame; holds still, then a big final offer. |
| `koi_spirit` | Hug Emoji | normal | m | Huggy emoji. Heals its allies and splashes both heroes with hearts. |
| `tsukumogami` | Notification Imp | normal | m | Red-dot imp. Hits and shuffles junk cards into your draw pile, then a big pile of pings. |
| `silk_weaver` | Algo Rhythm | normal | m | Clicking algorithm on cable legs. Tangles a hero and calls a Botling. |
| `nure_onna` | Autoplay Snake | normal | l | Endless-feed snake. Bites the backing hero with Earworm and coils the lead hard. |
| `rokurokubi` | Selfie Stick | normal | m | Telescoping selfie stick that reaches past the lead to hit the backing hero twice. |
| `ittan_momen` | Phone Charger | normal | m | Loose charging cable. Wraps a hero Tangled and gains Block and Shimmy. |
| `drowned_general` | Comment Troll | elite | l | Grumbling comment cloud. Crescendo, calls Grumble Clouds, one heavy ratio below half HP. |
| `puppet_master` | Trendsetter | elite | l | Pulls the strings of every trend. Calls Copycat Cutouts, mends them, and leaves the lead Starstruck. |
| `umibozu` | Doomscroll Moth | elite | l | Giant sleepy moth. Slams both heroes harder every turn, Muffled and Wobbly on both, and a Starstruck glare. |
| `spiderling` | Botling | minion | s | Tiny spider-shaped bot that likes everything. Earworms with a quick nip. |
| `paper_puppet` | Copycat Cutout | minion | s | Flimsy cut-out dancer on strings. One weak strike, gone in a hit. |
| `lantern_wisp` | Grumble Cloud | minion | s | Small grumbling cloud. Sizzles a hero and backs up its neighbours with Block. |
| `boss_jorogumo` | Scrollspinner | boss | xl | Glam spider who spins the endless feed. Tangles heroes and hatches botlings, then drops her filter. |

**Act 3, The Perfect Stage**

| id | name | tier | size | role |
|---|---|---|---|---|
| `storm_drone` | Tuner Drone | normal | m | Hovering pitch drone. Rapid jabs in threes and a correction on both heroes. |
| `komainu_guardian` | VIP Bouncer | normal | l | Brass rope-post bouncer. Sequins and Feedback, then a crushing bounce. |
| `redaction_knight` | Clapperboard Knight | normal | m | Clapperboard knight. Hits hard and adds junk cards with every retake. |
| `void_scribe` | Chrome Siren | normal | m | Chrome siren. Strips your buffs and adds junk cards. |
| `blank_soldier` | Synchro Dancer | normal | m | Mannequin dancer in perfect step. Steady hits that grow in a crowd, weak alone. |
| `sky_serpent` | Streamer Dragon | normal | l | Coiling streamer dragon. Multi-hit confetti blasts at the backing hero. |
| `eraser_wraith` | Airbrush Wraith | normal | m | Smooths away your Block and your hero resource stacks. |
| `thunder_crow` | Ring Light Sentinel | normal | m | Flying ring light. Dives to leave the lead Starstruck and flashes the backing hero. |
| `paper_golem` | Sequin Golem | normal | l | Sequinned costume giant. Slow, heavy hits and Sequins. |
| `margin_imp` | Glitch Gremlin | normal | m | Tuning-box gremlin. Calls Pitch Glitches and adds junk cards that cost you Breath. |
| `censor_golem` | Big Mute Button | elite | l | Giant mute button. Junk cards, Sequins, and one huge press. |
| `storm_whelp` | Applause Sign | elite | l | Lit-up applause sign. Roaring applause on both heroes, slow claps, calls Confetti Poppers. |
| `black_bar_inquisitor` | Mannequin Judge | elite | l | Talent-show mannequin judge. Starstruck, Tangled, and a finisher against a low hero. |
| `blank_page` | Lip-Sync Clone | minion | s | Lip-syncing clone. Gains Block, then leaves a hero Wobbly. |
| `spark_mote` | Confetti Popper | minion | s | Tiny party popper. One bang and it bursts. |
| `typo_sprite` | Pitch Glitch | minion | s | Glitchy pixel sprite. Adds a junk card that costs you Breath. |
| `boss_editor` | Flawless | boss | xl | Perfect pop idol who never sang a real note. Becomes the Filter, then the Gloss itself. |


Headliner titles (the `title` field): Kraki, The Karaoke Kraken; Scrollspinner, Queen of the Feed; Flawless, Star of the Perfect Stage.

### 4.2 Numbers at Encore 0 (starting guidance the balance wave tunes)

Per hit, before Volume and Exposed. HP is the rolled range `[min, max]` of the creature's `hp`. "Heavy" is a telegraphed hit. The Headliner round total is the sum of one action's hits (last-phase maximum in brackets).
The machine copy is `DATA.GUIDE`; `DATA.audit('enemies')` prints `guide` lines when a def leaves these ranges.

| ch | minion HP | minion hit | normal HP | normal hit | heavy hit | elite HP | elite hit | boss HP | boss hit | boss heavy | boss round |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6 to 14 | 2 to 5 | 16 to 38 | 4 to 9 | 12 to 14 | 55 to 85 | 8 to 14 | 170 to 200 | 9 to 13 | 16 to 20 | 24 (30) |
| 2 | 10 to 22 | 3 to 7 | 28 to 58 | 7 to 14 | 16 to 20 | 85 to 125 | 12 to 18 | 240 to 280 | 12 to 16 | 20 to 26 | 30 (36) |
| 3 | 14 to 30 | 4 to 9 | 42 to 80 | 10 to 18 | 22 to 26 | 120 to 165 | 15 to 22 | 420 to 480 | 15 to 22 | 26 to 34 | 40 (46) |

The Act 3 Headliner HP is the total across its 3 phases.

Magnitudes for Act 1 / 2 / 3: Feedback 2 to 4 / 3 to 6 / 4 to 8. Sequins 3 to 5 / 4 to 7 / 6 to 10. Crescendo 1 / 1 to 2 / 1 to 3 (Headliners may exceed). Creature Block move 5 to 8 / 8 to 14 / 12 to 20.
Creature heal move 6 to 10 / 10 to 16 / 14 to 24. On heroes: Muffled, Exposed and Wobbly 1 to 2 (3 only on Headliners); Earworm 2 to 4 / 3 to 6 / 4 to 8; Sizzle 3 to 6; Tangled 1 to 2 (Act 2 on); Starstruck 1 (Act 2 Rivals and Headliner, Act 3).
On heroes, Muffled, Exposed, Wobbly, Tangled and Starstruck with n = 1 act for exactly one hero turn (n = 2 for two). Earworm and Sizzle are unaffected.

**Group budget:** the sum of every member's average per-round damage before Block must stay within Act 1 normal 8 to 16, Rival 14 to 22; Act 2 normal 14 to 26, Rival 22 to 32; Act 3 normal 20 to 34, Rival 30 to 42.
So a group of 4 uses hits at the low end. Sidekicks never count toward the budget. A summoner may have at most 2 living summons at once (use `minions:{lt:2}` in its rules). Sidekicks are size `s`.

### 4.3 Mechanics and structure

Each Act defines encounter pools with `DATA.addEncounters(ch, {normal, elite, boss})`: at least 12 normal groups (1 to 3 creatures in Act 1, up to 4 in Acts 2 and 3), `min` values spread from 0 to 0.8 so early tiles
get easy groups (at least 3 groups at `min` <= 0.1 and 2 at >= 0.6), exactly 3 elite groups (one Rival each, Sidekicks allowed to pair), and the Headliner id.

Mechanic coverage per Act (the audit checks it): at least 2 creatures that strike the backing spot or all heroes, at least 2 that debuff heroes (Muffled, Exposed, Wobbly, Earworm, Tangled, Starstruck), at least 1 summoner (`summon` may only name a `minion` tier id from the roster), at least 1 with Feedback or Sequins,
at least 2 multi-hitters, at least 1 that adds junk cards (`add` of the status cards in section 2), and Rivals each with one signature mechanic and at least one `rules` entry or phase. Act 1 teaches the basics with readable telegraphed
patterns. Act 2 adds Tangled, Starstruck, summons and backing-spot pressure. Act 3 stacks mechanics and uses the status cards heavily.

Headliners use `open`, `rules` and `phases` (with `say` lines and stat swings), summon Sidekicks, and have a memorable signature move. `phases` holds the TRANSITIONS: the Act 1 and 2 Headliners have 1 entry (two forms), `boss_editor` (Flawless) has 2 entries
(at 0.66 and 0.33: three phases, whose art is `opts.phase` 0, 1, 2). A phase's `ai` replaces the whole ai, so repeat any `rules` you want to keep. AI `turnEvery:[3, 2]` is turns 3, 6, 9 of the creature's own turn count, and `open` always plays
before `rules`. Every creature has `lore` (1 to 2 sentences, at most 260 characters, kind about it) and `tags` (from `LISTS.enemyTags`: `spirit beast folk undead construct insect avian aquatic void`). Move `kind` is the most threatening part of the move and
must be honest (the validator checks the ops behind an icon). Moves that add junk cards and deal no damage use kind `debuff`.

## 5. Charms and gems

**Charms** (relics, `data_relics.js`): exactly **66**: common 22, uncommon 22, rare 12, boss 6, shop 4 (hero-specific Charms count within these: exactly 3 per hero, using `hero`).
Things a touring musician would keep close (a lucky plectrum, a sticker sheet, a travel mug, a mic-wand keyring, a ring light that was set free), never animal products, and no Charm name ends in "Charm".
Cover: static `mods` (every key of `LISTS.mods`: `energy`, `hand`, `startBlock`, `inkMax`, `startInk`, `wellInk`, `cardChoices`, `freeSwaps`, `campActions`, `rareBoost`, `goldMul`, `priceMul`, `healMul`), combat hooks (every hook of `LISTS.combatHooks` except `combatEnd`:
turn start and end, on play with a `filter`, on damaged, on kill, on swap, on hero down, on shuffle, on Fade, combat start), run hooks (every one of `LISTS.runHooks`: `onPickup`, `onChapterStart`, `onRest`, `onPaint`, `onFightWon`, `onShopEnter`),
spot and swap synergies (`rows`, at least 2 Charms), Vox and Spell Charms (they matter on the map: `every`, `wellInk`, `startInk`), and gem Charms (`filter.gems`, at least 2, using hooks and `gold`, `ink` and `draw`).
Mods are additive deltas (`DESIGN.md` 4.7): write `goldMul: 0.25` for +25% and `healMul: -0.25` for -25%. Headliner Charms may give `energy: 1` or `hand: 1` with a real drawback (a curse in the deck via `onPickup addCurse`, `inkMax: -2` or `healMul: -0.25`).
Text is one sentence, at most 90 characters, plain. `locked:true` on at most 30%. `art.m` from `LISTS.relicIcons`, spread over at least 40 different icons.

**Gems** (`data_gems.js`): **24**, six per colour with tiers 1, 1, 2, 2, 3, 3. Pink (`red`, offence): damage, extra hits, lifesteal-like effects via `fx`, conditional lead-spot power. Blue (defence): Block, Feedback, healing, Shimmy.
Green (utility): draw, cost reduction (`cost` -1 at tier 3 only), `retain`, Breath, `pick` free effects via `fx`. Gold (wild): status seeds, gold and Vox on play, backing-spot or lead-spot conditionals, resource gain (`bloom sumi ward charge`).
Names are a musical or magic word and a plant or mineral stone ("Forte Rose Quartz", "Talkback Lapis", "Sustain Peridot", "Tip Jar Citrine"), never pearl or coral. `locked:true` on some tier 2 and 3 (at least 4 gems, never tier 1). Gem `fx` cannot use `per: 'X'`.

## 6. Detours, meta content, tips, lore

**Detours** (events, `data_events.js`): at least **40**: 10 per Act (`chapters:[n]`) plus 10 with `chapters` omitted (any Act); the shipped game has 12 and 12. Set `once:true` only on Detours with lasting consequences (a flag, a Charm, a card change, a curse), on at most 60 percent of them;
the rest are repeatable. Each Detour has `id`, `title` (at most 40 characters), `text` (60 to 220 chars), `art:{scene}` (a `LISTS.scenes` id), `choices` (2 to 4: `{label, req?, cost? (display string), out:[{w, text, ops}]}`), optional `when` and `w`.
Every Detour has at least one safe choice (no `cost`, no `hurt`, `addCurse` or `fight`, no negative gold or max HP), plus a gamble and often a cost. `cost` is display only, so the outcome carries the negative op (`gold n:-30` paired with `req.gold`).
A Detour is a little scene on the road, a choice and a joke. Mix in: fights (`fight` op: `enemies` from the roster, never a group id), curses (`addCurse` with the fixed curse ids), gem, Spell and Vox gifts, card transformation and removal, max HP trades, a few that need a Charm (`req.relic`) or a flag set by
an earlier Detour, a merchant with a strange deal, a hero moment (flavoured differently by who is in the party is optional, `req.hero`). Required: a merchant-style Detour with a choice gated by `req.relic:'silver_bell'`, and a follow-up Detour gated
by `when:{flag:'fox_spared'}` with another Detour's outcome setting that flag, so the flag path is exercised. Outcome `text` is required and fun. Detours reference Charms only by the fixed ids in section 2, otherwise by `rarity`.

**Stickers** (achievements, `data_meta.js`): **32**, each `{id, name, text, stat:{k, gte}, reward?:{inkstones:n}}`, `k` from `DATA.LISTS.statKeys` (definitions in `DESIGN.md` 4.10). Include the fixed ids in section 2, hero mastery (`winsHanae` ...), milestone tours,
unmuting (`hexesPainted`), collecting (`relicsFound`), flawless Headliners, small deck wins, Encore clears (`trialBest gte N` means Encore N was won), and a few silly ones. Jordan designs every one.

**Encores** (`DATA.add('trials', ...)`): levels 1 to 10 (level 0 is implicit, "No encore"), `{id:'trial_1', level, name, text, mods}` from `LISTS.trialMods`. Each level's `mods` are its own increment and level N sums 1..N (`DESIGN.md` 4.7 for units), escalating: creature HP and
damage, less Vox, thinner gold, weaker healing, fewer revives, curses in the starting deck, dearer Merch Stalls, and a last Encore that is punishing but fair.

**Tips** (`DATA.add('tips', [strings])`): 30 short loading and hint lines, each at most 110 characters, from Jordan or the narrator.

**Tour Diary** (lore, `DATA.add('lore', ...)`): `{id, title (at most 40 characters), text (at most 700 characters, one entry, told in a breath)}` for `intro`, `ch1_intro`, `ch2_intro`, `ch3_intro`, `ch1_clear`, `ch2_clear`, `victory`, `defeat`, `hero_<id>` x4, and
`barks_<id>` x4 as `{id:'barks_hanae', lines:{start:[5 strings], hurt:[5], kill:[5], down:[5], win:[5], swap:[5]}}` (each line at most 64 characters, in each hero's voice: Jasmin soft and kind, RoxorLoops quick and cheeky,
RawClaw calm and studio-wise, Andy relaxed and warm with bass puns). The shared entries never name a hero, the Gloss is named across them, and nothing quotes a lyric of any real song.

## 7. Balance targets (the Wave 3 bot measures these)

An automated player (`tools/hocus_vocus/bot.mjs`: it plays affordable cards by a fixed value heuristic and a rollout search, keeps the lead hero healthy and drafts by archetype) at Encore 0:
Act 1 cleared in 85 to 97% of tours, Act 2 in 60 to 80%, the full game in 15 to 35%. Each Encore level lowers the full-clear rate by about 3 points. No hero pair below 8% or above 45% full clears.
Median tour length 45 to 90 minutes of human play (about 24 to 30 fights across 3 Acts). No card, Charm or gem shows up in more than 2.5x the average pick-win share.
