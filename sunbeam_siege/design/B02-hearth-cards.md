# B02: Hearthpaws card set

File: src/data/cards-hearth.js, SB.data.cardsHearth. 42 cards: 20 Cat units, 14 spells, 8 toys. 18 common, 16 uncommon, 8 rare. All ids prefixed hearth_. Every card has an upgrade patch and a loop tag where relevant (`loop:<name>` in `tags`).

Not in this file: the hearth basic unit (starting deck) and the 2 champions.

## Intent
Hearth does nothing on purpose and is paid for it. Early game it survives (Fluff, Purr, heals). Mid game it stacks Rested and Purr. Late game sustain converts into damage (Stretch, Mother Rumble, Sir Floofington) and into Sunbeam Warmth, so a long fight favors Hearth instead of punishing it.

## The 4 best loops

### 1. The Eternal Nap (Sunbeam spa)
Pieces: Old Mortimer, Asleep (rare), Window Hammock, Nap Economy (rare), Warm Lap, Sunny Spot, Hibernation (rare), Sleep Talker, Naptime.
Run: Mortimer naps on deploy and cannot be woken by damage (deepsleep, Rested max 6). Each Dusk he turns his Rested into floor Purr. Hammock gives every cat on the floor the same protection plus Rested 1 extra per Nap. Nap Economy turns every Nap into 2 Purr plus 1 Sunbeam Warmth. Hibernation puts the whole board to sleep and heals 2 Warmth per sleeper. Sleep Talker draws a card each turn while asleep, so the player never stops having plays while refusing to attack.
Payoff: the Attic sleeps, the Sunbeam heals several points a round, and the front floor holds on Fluff and Purr heals. Wins by outlasting. Impatience (round 16) is the natural counter, plus pests that Wake or hit the Sunbeam directly (Sneaky). Cap on the exploit: Rested 6 max, Purr decays 1 a round, Sunbeam Purr heal capped at 3 a round (A04).

### 2. Heap Fortress
Pieces: Big Mama Marmalade (rare, Large, counts as 2 for Pile), Family Portrait, Cushion Matron, Cuddle Captain, Hearth Rug (rare), Group Hug, Heated Blanket, Sir Floofington (rare), Wool Blanket, Fluff Up.
Run: four cats form a Heap (RULES: +2 Fluff each round, heals, +2 Power). Portrait and Big Mama let a smaller board still count as a Heap. Matron, Rug and Blanket stack extra Fluff and heals on top. Fluff persists to end of battle, so Floofington grows by 1 Power per 3 Fluff and becomes the hardest hitter in the house. Group Hug dumps 8 Fluff on each member in one play.
Counter: Splash and Bath pests, anything that kills the middle cat. The keystone is deliberately fragile.

### 3. Purr Furnace (Purr aura that scales damage)
Pieces: Mother Rumble (rare), Fireplace (rare), Sunny Cushion, Idle Engine, Warm Belly, Stoke the Radiator, Purr Crescendo, Warm Lap.
Run: Purr decays 1 a round, so the deck needs sources worth 6 or more a turn (Cushion 3, Fireplace 3, Idle Engine 4 with a full floor, Belly 5 on deploy). Mother Rumble gives every cat on the floor +1 Power per 5 Purr. At 20 Purr (A04 tier) the floor also gains Fluff each Dawn, at 30 it refunds Zoomies, and the Fireplace heals the Sunbeam. Crescendo doubles the pile for the burst turn.
Counter: Vacuum eats Purr, Scared strips it.

### 4. Alarm Chain (Stretch burst)
Pieces: Alarm Clock, Snooze Tabby, Dough Paws, Pillow Bruiser, Naptime, Lullaby, Sleepy Calico.
Run: Naptime plus Lullaby stack Rested to 4 across a floor. Alarm Clock (1 mana, 0 upgraded) wakes the whole floor at once for 3 per Rested in Stretch damage each. Snooze Tabby falls asleep again after its Stretch with Rested 1, Dough Paws grows on every Nap, Pillow Bruiser banks Fluff on wake. This is the burst-win loop that lets Hearth kill things, on a two-round rhythm (sleep, then wake).
Counter: a fast pest wave arriving while everyone sleeps (Night Visitors), Rude Awakening if the front line is hit.

## Standout two-card combos
- Warm Lap + any Nap enabler: Purr equal to total Rested, instantly.
- Group Hug + Family Portrait: Pile of 3 acts as 4, so Hug gives 8 Fluff each.
- Snooze Tabby + Alarm Clock: wakes, Stretches, sleeps again. Repeats every other turn.
- Mother Rumble + Idle Engine: 4 cats equals 4 Purr a turn, plus 2 from Rumble, plus the damage aura.

## Balance notes
- Power is low across the set (0 to 3). Damage comes from Stretch (+3 per Rested, cap 18) and from auras. Only one pure damage spell exists (Cozy Swat).
- Hearth has only 2 draw sources (Second Breakfast, Sleep Talker) and no Zoomies refunds outside Purr 30. This is intended friction, but may need a neutral support or the side clan.
- Sunbeam healing is capped by A04 (3 Warmth a round from Purr) but Sunny Spot, Nap Economy, Hibernation, Fireplace heal Warmth directly. If Eternal Nap is too safe, cut the Fireplace Warmth line first.

## NEEDS (engine, also at top of the data file)
1. Triggers onWake (after Stretch) and onDusk.
2. Effect `wake` (Alarm Clock).
3. Nap on deploy ignores the "not on the turn played" rule (Sleepy Calico, Old Mortimer).
4. Counters: adjacentCats, pileSize, restedOnSelf, restedOnFloor, nappingCats, fluffOnSelf.
5. AmountExpr fields `div` and `cap`.
6. Checks: selfNapping, pileSize.
7. Aura `if`, aura stat `pileSize` (thisFloor), aura stat `keyword:deepsleep`.
8. Keyword deepsleep: Rested max 6, never Rudely Awakened.
9. Passive from a spell: `thisFloor` on onNap resolves to the triggering cat's floor.

## Unresolved
- Heap rules differ: A04 says pile of 5, RULES locks Heap at 4 (floor has 4 cat slots). Cards follow RULES.
- Hearth basic unit and champions are owned elsewhere.
