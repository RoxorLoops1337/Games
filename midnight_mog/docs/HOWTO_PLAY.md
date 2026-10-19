# How to play Midnight Mog

Cats defend a neon rooftop city from pigeons, rats, gators and, eventually, vacuum cleaners. You fight short battles, spend what you win on a deck of cats and spells, grow a town that earns while you are away, and open crates that keep the loop interesting. Nothing costs real money. Crates are paid in fish, yarn and gems you earn.

Open `/midnight_mog/` in any recent browser. It works on a phone held upright (390 px wide) and on a desktop (the layout widens to a centred column).

## The first 90 seconds (the tutorial)
A brand new game starts with Sergeant Mittens and a spotlight. He teaches, in order:
1. **Place a cat.** Tap a cat card, then tap a rooftop tile. Dragging works too.
2. **Cast a spell.** Tap Zoomies, then tap it again (a spell with no target needs a second tap, or drag it up into the field).
3. **Merge two cats.** Two equal cats on neighbouring tiles fuse into one stronger cat, up to +3 merges in a single battle.
4. **Win the fight.** The tutorial turns AUTO on for this one battle so a first win is certain. Tap the AUTO button to take over.
5. **Collect the town.** Buildings make fish and yarn while you fight. Collect All banks it.
6. **Open the first crate.** You get a free key. The tutorial seed is chosen so the first crate gives a new cat of rare or better. Every later roll uses the normal odds shown on the crate screen.
7. **Hand-off.** You land on the hub, where the big PLAY button is always the next move.

Skip is always in the speech bubble (it asks first). Close the game mid-tutorial and it resumes at the same step. Old saves from before the tutorial existed never see it. The step is stored as `stats.tut_step` in the save (99 means finished).

## The loop
**Battle** (about 60 to 90 seconds): five lanes, eight tiles per lane. Enemies enter from the right and walk toward your base on the left. You have a hand of five cards and cyan energy that refills by itself (3 at the start, 0.5 per second, cap 10).
- Cat cards place a cat on a free tile. Archers and mages reach flying enemies, brawlers and tanks do not, so bring both.
- Spell cards act at once. Trap cards wait on a tile. Build cards give the battle a rule (a barricade, a healing garden, a bigger base).
- The redraw button throws the hand away for 1 energy. AUTO plays the best card every 0.4 seconds. Speed goes 1x, 2x, 3x.
- Winning pays fish and yarn, advances the stage, and the first clear of a stage also pays gems. Every tenth stage is a boss with phases.

**Deck**: 12 slots (a Barracks adds more). Level up cards and cats with yarn. Stars come from duplicate cats in crates. Relics are passive charms with a soft-capped income bonus.

**Town**: place buildings on plots, then collect. A building stops producing once it holds four hours of output, and collecting a building that is 90 percent full or more pays a 10 percent bonus. Neighbours boost each other (adjacency). The first collect of each day pays a 20 minute tip and extends your night streak, which adds up to 35 percent to every collect.

**Crates**: five tiers (Cardboard Box for 400 fish up to the gem crates). Odds and the pity counters are on the crate screen, and the odds table is the same table the game rolls on. Keys from the Crate Workshop and stage wins open crates for free.

**Quests, map, bestiary, Nine Lives** live under More. Quests are daily and weekly goals plus achievements and set bonuses. Nine Lives resets your run for shards that permanently raise income and damage, and cleared stages below 60 percent of your old best become 20 second echo clears.

## The hub and the next best thing
The landing screen shows the next stage with its district art, what winning pays, your night streak and your best stage. Under PLAY, **Next up** always names something worth doing, ranked in this order: finished quests to claim, a free crate key, buildings that are full, an affordable cat upgrade, an affordable building upgrade, a crate you can pay for, Nine Lives when it is ready, and finally the battle itself. The bottom bar carries badges for the same things: claimable quests on More, a full or nearly full town on Town, keys or an affordable crate on Crates, an affordable cat level on Deck.

## Being away
Close the tab whenever you like. Next launch, the welcome-back panel pays the offline earnings: the first 2 hours at 35 percent efficiency, later hours at half of that, capped at 8 hours (the Nap Dome and meta perks raise the cap up to 24 hours and efficiency up to 60 percent, 40 hours and 80 percent with the dome). Offline pay never includes gems. Changing the device clock cannot create or destroy offline income.

## Saving
Progress saves itself: the moment anything changes, every 10 seconds, when the tab is hidden and when you leave. The save lives in this browser (`localStorage`, key `midnight_mog_save_v1`, with a rolling backup). If the main save is ever damaged the game restores the backup and tells you, and keeps a copy of the damaged file under `midnight_mog_save_v1_damaged`. Starting a new game keeps the old save under `midnight_mog_save_v1_prev`. Settings has export and import (a file or a text code), so you can move a save to another device. If something throws, a Whoops panel replaces the screen with Try again, Back to the hub, Export save and Reload. Your save is never touched by it.

## Controls
| | Touch | Mouse | Keyboard |
|---|---|---|---|
| Select a card | tap | click | 1 to 9 |
| Place or cast | tap a tile, or drag the card | click, or drag | arrows move the cursor, Enter plays |
| Pause | pause button | pause button | P or Esc |
| Auto play | AUTO button | AUTO button | A |
| Speed | speed button | speed button | F |
| Redraw | redraw button | redraw button | C |
| Menus | tap | click | Tab and arrows move the focus ring, Enter taps |

## Accessibility
Settings has volume and mute, three quality levels, reduce motion (Auto follows the system setting), and text size (Normal, Large, Huge). Toasts, dialogs and battle events are announced to screen readers through a hidden live region.

## Tips
- Spend yarn on the cat you play most. A level is cheap early and the cost curve is steep later.
- Keep one cheap archer in every lane you expect flyers in. Zoomies and Neon Flash are strong, cheap spells.
- Merge early. A +2 cat is worth much more than two +0 cats and frees a tile.
- Collect the town before you start a long session. Buildings are full after four hours.
- Do not skip the daily tip: one collect a day keeps the streak alive.
