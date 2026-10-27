# B13: Relics

File: `src/data/relics.js`, `SB.data.relics`, 97 relics. Self-check passed (parses, ids unique, no dashes, flavor under 90).

## Counts
| Rarity | Count | Notes |
|---|---|---|
| starter | 8 | 2 heirlooms per clan (A07 said 1, lead brief says 2: run picks one or gets both, call it) |
| common | 26 | |
| uncommon | 28 | |
| rare | 20 + Spare Whisker | Spare Whisker is the only revive |
| boss | 8 | each has a real drawback |
| shop | 6 | Gerald only |

Tags: 20 `synergy` (5 per clan, each bends toward a loop), 12 `rule` (change a core rule through `mods`), 11 `stack` (counter based, grow per fight or event). All 14 A06 upgrade hooks are adopted (renamed `relic_*`). A05 and A04 sample relics adopted: Cracked Bell, Glass of Water, Next Day Delivery, Sun Patch Cushion, Do Not Disturb Sign, Family Portrait, Catnip Plant Pot, Night Owl Goggles, Dawn Chorus, Cardboard Fort, Nip Bag, Dizzy Mousetrap, Bath Survivor's Towel. Tuna Tin of Plenty was dropped because Spare Lives Jar is CUT (replaced by Emergency Tuna Tin, which heals Warmth).

## The 6 most run-warping relics
1. **Stopped Clock** (boss, moon). Witching Hour every 2nd round. Doubles the +2 Zoomies and Zoom rhythm, but Night Visitors are 50 percent bigger. Turns Moon into a tempo deck. Check that 2 consecutive Frazzled rounds do not lock cats out.
2. **Spare Bedroom Key** (rare). +1 room slot per floor, so 3 rooms. Every Box, Toy and Room engine gets 50 percent more space. Likely the strongest neutral rare, so watch its pick rate.
3. **Group Photo Frame** (rare, hearth). Piles ignore gaps, so any 3+ cats on a floor are a Pile and heal. Removes the positioning puzzle on purpose; Heap of 4 becomes trivial. Pair with Pile Permit and Purr Box for a heal wall.
4. **Hole in the Fence** (rare, alley). First Pounce cat each turn refunds 1 Zoomies. With cost 1 Pounce cats this is an infinite chain limited only by hand. Zoomies cap 10 and hand size bound it.
5. **Hairball Hoard** (rare, mischief stack). Every played Hairball adds a counter (cap 20), and each play deals Shatter at half the Hoard. Espresso Saucer (2 Hairballs a fight) feeds it. Late fights it is a nuke that ignores Fluff.
6. **Cornered Collar** (rare, moon). Cornered at 2 lives, +3 Attack. Plus Paw Print in Flour, Ledger of Lives and Silver Bell make losing lives a resource. Makes the champion (9 lives) rarely cornered; best on 3-life commons. Enemy "finish them" AI will chase these cats.

Honourable mention: Weighted Blanket (boss, hearth) swaps all Attack for a fortress of Rested stacks; Stretch attacks then carry the fight.

## Standout combos
- Wake engine: Sun Patch Cushion (Rested cap 6) + Insomnia Mask (Nap on play) + The Good Cushion.
- Thin deck upgrades: Tally Stick + Practice Mat + Biscuit Blanket + Adoption Papers.
- Lives economy: Silver Bell + Cracked Bell + Paw Print in Flour + Ledger of Lives.
- Surge loop: Nip Jar Lid + Catnip Plant Pot + Catnip Stain + Dusty Mouse Toy.

## NEEDS (engine, also at top of the data file)
- Effect types: `counter`, `shade`, `fish`, `addCard`, `consumeRelic`, `setWarmth`, `preventWake`, `cleanse`, `clearFloorEnemies`, `shopDiscountFirst`, `zoomies` with `nextTurn:true`.
- Hooks not in A02/A05: `onFightEnd`, `onActStart`, `onPickup` (via `pickup` array), `onShopEnter`, `onLoss`, `onStatusApplied`, `onReborn`.
- Targets: `fullestFloor`, `allCatsOnFloor` with `floor:N`, `triggerSourceKiller`, `champion`, `firstToyInHand`.
- Conditions: `counter`, `selfAsleep`, `cardTag`, `cardKeyword:<id>`, `cardCost`, `cardId`, `cardType`, `warmth`, `fightType`, `round`, `isWitchingHour`, `nappingCats`, `pileSize`, `statusId`, `counterMod8`, `targetHasStatus:<id>`.
- Mods: about 40 keys documented at the top of the data file (stack by summing across relics).
- Limits (`limit.per` turn, battle, act, run) tracked on the relic instance. Counters persist with the run save.

## Unresolved
- Heirloom count: 2 per clan means the run needs a rule (pick 1, or start with both). Both are weak enough to start together.
- Spare Whisker vs the A07 Last Life: Last Life is not default, only this relic. Remove the Last Life pip from the Warmth bar unless owned.
- Fractional `mult` in AmountExpr (0.1, 0.34, 0.5) floors; engine must apply that rule.
- Cornered Collar and Stopped Clock need a playtest for lock-ins.
