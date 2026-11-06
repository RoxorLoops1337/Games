# B18 Tutorial: the Elder Cat's four fights

File: `src/data/tutorial.js`, loads as `SB.data.tutorial` (one object). Verified with a stub-window load plus a throwaway simulator that plays every scripted fight to a win (all ids unique, 72 coach steps, 30 tips, 0 failures).

## Intent
A guided first run of 4 short fights, skippable at any time (A01 "no tutorial wall"). Each fight is fully scripted: fixed starting board, exact waves, fixed hand each round, exact plays, so it always plays out identically. The Elder Cat (A08, spectacles) speaks in a warm, dry voice; no exclamation marks except on a win line.

Teaching order follows A05 (Lives, Knock, Nap, Clock) with the task's grouping:
1. **The Cellar Door** (3 rounds): Sunbeam and Warmth, floors, intents, playing a unit by drag, Swat, Zoomies, End Turn, cats strike first, Lives pips (A05 "Night 1 shows Lives only").
2. **Things That Fall** (3 rounds): Knock It Off, Shatter, pile-up damage, Climber, landing Dazed, Cellar cat flap.
3. **The Art of Doing Nothing** (4 rounds): Z toggle, no nap on the turn played, Rested pips, Catnap card, Stretch on waking, Rude Awakening (told, never suffered).
4. **The Witching Hour** (5 rounds): a scripted life loss (Hall Kitten 2 to 1), Cornered, Empty Collar warning, moon dial announced a round early, Zoom, Frazzled, Night Visitors, Heavy.

## Content defined here
- Cards (`neutral_tut_*`, tutorialOnly): Biscuit (champion 14 hp, 4 atk, 9 lives), Hall Tabby, Hall Kitten, Sofa Loaf, and private copies of Swat, Catnap, Knock It Off. Private copies mean other agents' balance changes cannot break the script.
- Enemies, full schema: `pest_tutorial_mouse` (4 hp, Nibble 2), `pest_tutorial_rat` (8 hp, Bite 3 then Gnaw 4), `pest_tutorial_pup` (10 hp, Medium, Climber, Chomp 3 then Big Chomp 4), `pest_tutorial_vacuum` (16 hp, Large, Heavy, Nudge 3 front then Suck 3 all).
- `flow`: fight 1, 60 Fish, map guide, fight 2, fork map (Shop or Nap Nook), fight 3, fight 4, graduation.
- `mapGuide`, `mapGuide2`, `shopGuide`, `nookGuide`: mini guides with the same step format. The shop gives 60 Fish, shows a 45 card, a 75 card the player cannot afford, and Shoo at 50, stock described by rule (no ids).
- `tips`: 30 rules (15 statuses, 8 node types, 7 keywords, traits and rules). Delivery: 1 per round, 2 per fight, once per profile, never during a scripted step, also copied into the Handbook.

## Gating and safe-fail
Each step lists `gate.allow` (exact inputs). Everything else is blocked with a wiggle and a nudge line; Zoomies are never consumed by a blocked input. Scripted hands plus gating make drift impossible. Safe-fail layers: Warmth floor 10, lives floor 1, stall rescue when `round > maxRounds` (cat flap sweep), round-start rewind instead of a defeat screen, and a skip offer after 2 rewinds. In the scripted line nothing ever touches Warmth: it ends every fight at 40.

## Interpretations the engine must match (so the script plays out)
- Zoomies 3, hand 5; Witching Hour (round 3 of fight 4) gives 5 Zoomies and a 6 card hand; Zoom is ceil(Attack / 2). Only one pest is alive at that Zoom, so no RNG is drawn.
- Knock from floor f to f-1: 2 Shatter on the faller, 2 on each pest already on the landing floor, faller gets Dazed 1 (skips its next action and climb). Cellar Knock: 3 Shatter, to the front of the garden queue, returns at next Spawn with Dazed 1 (A02 section 13, since RULES says Dizzy is A02 "Dazed").
- Cornered (+2 Attack at exactly 1 life) applies to the Kitten but is not shown on Biscuit; champions are never Cornered in the script.
- A cat preplaced in setup may Nap on round 1; the Loaf is placed in round 1 and naps in round 2.
- Stretch in fight 3: Loaf 2 Attack, 3 Rested, +9. The "+1 Attack per 2 Rested spent" may or may not count on the same strike (11 or 12). Both kill the 6 hp pup; the coach text avoids the exact number.
- Fight 4 round 5 ends on the second Swat: the win check fires mid-phase, no End Turn needed.

## NEEDS (engine and UI)
Scripted draws (`fight.scripted`, per-round `hand`), per-fight `rules` flags, non-elite window spawns on floors 2 and 3, `SB.tutorial.allows(input)` gating, `data-tut` attributes for every key in `targets`, phase end hooks for steps, tip engine kinds listed in `tipKinds`, loader merge of `cards` and `enemies`. Full list in the file header.

## Unresolved
- A07 says the Keyword Primer is a tutorial guard card in the real starter deck; this tutorial teaches no clan keywords, so the primer teaches its own keyword on first draw via a tip (add a tip kind `keyword` entry per clan if wanted).
- Tutorial Tabby/Loaf art uses A03 sprite names (`cat_scrappy`, `cat_loaf`); the art agent should map or replace them.
- The 4 handbook entry ids (`hb_floors_cards`, `hb_knock`, `hb_nap`, `hb_witching_lives`) need a Handbook screen owner.
