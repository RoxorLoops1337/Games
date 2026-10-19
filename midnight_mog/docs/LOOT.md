# Midnight Mog loot

Source of truth: `js/data/crates.js` (the tables) and `js/sim/loot.js` (the roll). Every number below is read from those files or measured by running them (seed 7 and 99, 200k pulls per crate). If this doc and the code disagree, the code wins and this doc is stale.

## 1. The ethics rule

1. No real money. Crates are paid only with in-game fish, yarn or gems. Gems are earned (boss first clears, daily), never bought. There is no gem to fish exchange.
2. Odds are visible. The crate screen prints `oddsTable(crateId, profile)`, and `openCrate` rolls on `rarityProbs()`, the same function. One source of truth, no second copy.
3. No hidden luck. The only things that move a probability are listed in the table: the pity counters (shown as "pulls to guaranteed"), the `crate_luck` meta perk (shown as a luck line), and the x10 guarantee slot (shown). Not spending, not streaks, not time of day, not "player is about to quit".
4. The result is rolled first. `openCrate` returns the final `drops` before any animation. Tells and fake-outs are cosmetic metadata computed after the result is final from separate rng draws; they cannot change an outcome.
5. A near-miss is honest. A fake-out may tease the next rarity's colour and then settle on the true one. The final colour the UI shows is always the real rarity, and the odds table is never bent to create near misses.
6. Uniform within a pool. Inside a rarity and kind every item has the same chance. No dupe protection, no hidden bias to new items.
7. Dupes never feel dead. Every duplicate pays yarn and/or stars.

## 2. The five crates

Prices from `economy.crateCost` (price creeps +1.5% per open this Nine Lives, capped x3). Ids are the economy ids, names are display only.

| id | Name | Price | x10 guarantee |
|---|---|---|---|
| `alley_crate` | Cardboard Box | 400 fish | at least 1 rare+ |
| `neon_crate` | Tuna Tin | 3000 fish | at least 1 rare+ |
| `rooftop_crate` | Neon Chest | 2500 yarn | at least 1 epic+ |
| `midnight_crate` | Velvet Vault | 60 gems | at least 1 epic+ |
| `mythic_crate` | Mythic Reliquary | 300 gems | at least 1 legend+ |

### 2.1 Rarity weights (percent, per pull, perk level 0, no pity boost)

| Crate | common | rare | epic | legend | mythic |
|---|---|---|---|---|---|
| Cardboard Box | 78 | 19 | 2.85 | 0.15 | 0 |
| Tuna Tin | 62 | 29 | 8 | 1 | 0 |
| Neon Chest | 45 | 38 | 14.5 | 2.3 | 0.2 |
| Velvet Vault | 20 | 45 | 28 | 6 | 1 |
| Mythic Reliquary | 0 | 38 | 44 | 15 | 3 |

Effective rates including pity (measured over 200k pulls, percent):

| Crate | common | rare | epic | legend | mythic |
|---|---|---|---|---|---|
| Cardboard Box | 76.36 | 18.60 | 4.90 | 0.14 | 0 |
| Tuna Tin | 59.98 | 28.12 | 10.39 | 1.51 | 0 |
| Neon Chest | 43.74 | 37.04 | 16.06 | 2.74 | 0.43 |
| Velvet Vault | 19.41 | 43.59 | 29.19 | 6.56 | 1.24 |
| Mythic Reliquary | 0 | 37.11 | 43.63 | 14.94 | 4.33 |

Pity is a floor, not a trick: it lifts the rates a little (Cardboard epic 2.85 to 4.9 because 1 in 40 pulls is forced).

### 2.2 Content mix (given the rarity)

| Rarity | cat | card | relic | yarn | gems |
|---|---|---|---|---|---|
| common | 22% | 38% | 5% | 30% | 5% |
| rare | 28% | 36% | 12% | 18% | 6% |
| epic | 34% | 30% | 22% | 6% | 8% |
| legend | 42% | 24% | 28% | 0 | 6% |
| mythic | 46% | 20% | 34% | 0 | 0 |

Fish and yarn crates (first three) never drop gems: the gem share is folded into yarn (common 35%, rare 24%, epic 14%, legend 6%). Only Velvet Vault and Mythic Reliquary drop gems, in small amounts. Pool sizes per rarity (cats / cards / relics): common 12/14/6, rare 9/12/10, epic 6/7/6, legend 3/2/3, mythic 2/1/2. Card drops are spells, traps and builds; a new cat also grants its `call_<cat>` summon card, so a cat is always playable.

Yarn drop amounts (fixed, per rarity: common / rare / epic / legend / mythic): Cardboard 10/35/130/450/1600, Tuna Tin 14/49/182/630/2240, Neon Chest 12/42/156/540/1920, Velvet Vault 20/70/260/900/3200, Reliquary 24/84/312/1080/3840. Gem drop amounts: Velvet Vault 1/2/4/8/15, Reliquary 2/4/8/16/30.

### 2.3 Golden flash

Every pull has a 2% chance (flat, independent of rarity, printed in the table) to flash Golden. Golden never changes the rarity; it doubles the value: currency drops pay x2, a dupe pays x2 yarn and gives one extra dupe, a new cat starts with an extra dupe (star 1), a new card arrives with 2 copies, a new relic also pays its dupe yarn. Gold is reserved for rarity and best loot in the palette; the flash uses it.

## 3. Pity

Counters are per crate and per tier: pulls since the last drop of that tier or better. They live in `profile.pity` as `<crate>` (epic), `<crate>@legend`, `<crate>@mythic`. Pull number n since the last hit:

- n <= soft: base chance of "tier or better".
- soft < n < hard: `q = base + (1 - base) * (n - soft) / (hard - soft)` (linear ramp to 100%).
- n >= hard: 100%.

Tiers are made consistent (`q_epic >= q_legend >= q_mythic`) and the probability of each rarity is the difference of neighbours; the rest is split between common and rare by their weights. A dash means the crate cannot drop that tier or has no pity for it.

| Crate | epic soft / hard | legend soft / hard | mythic soft / hard |
|---|---|---|---|
| Cardboard Box | 25 / 40 | - | - |
| Tuna Tin | 12 / 20 | 100 / 150 | - |
| Neon Chest | 9 / 15 | 60 / 90 | 300 / 400 |
| Velvet Vault | 5 / 8 | 28 / 40 | 150 / 200 |
| Mythic Reliquary | 3 / 5 | 12 / 20 | 35 / 50 |

Expected pulls to the first drop of the tier or better (`expectedPulls`, analytic, matches the measured mean gap within 1%), and the longest dry streak seen in 200k pulls:

| Crate | epic | legend | mythic |
|---|---|---|---|
| Cardboard Box | 19.8 (max 37) | 667 (no pity, max 3372) | never drops |
| Tuna Tin | 8.4 (max 20) | 66.4 (max 124) | never drops |
| Neon Chest | 5.2 (max 15) | 32.6 (max 80) | 232 (max 334) |
| Velvet Vault | 2.7 (max 8) | 12.9 (max 38) | 79.7 (max 174) |
| Mythic Reliquary | 1.6 (max 5) | 5.3 (max 19) | 23.3 (max 48) |

Cardboard legend at 0.15% has no pity on purpose: it is the "lottery ticket" of the cheapest crate, and legends are what the better crates are for.

## 4. Duplicates

Every duplicate progresses something. A drop is "new" when the id is not owned (`isNew: true`, show the NEW flag), otherwise:

| Kind | Dupe result |
|---|---|
| cat | `cats[id].dupes += 1`; stars follow total dupes: 1, 3, 6, 10, 16, 24, 34, 46 dupes give star 1 to 8; plus `DUPE_YARN[rarity]` yarn |
| card | `cards[id].count += 1`; plus half of `DUPE_YARN[rarity]` yarn |
| relic | relics are unique: `DUPE_YARN[rarity]` yarn |
| yarn, gems | the amount is the drop itself |

`DUPE_YARN` (economy): common 12, rare 45, epic 170, legend 650, mythic 2500. `drop.dupeValue` is the yarn credited for the dupe (0 for a new item), `drop.starsGained` the stars a cat gained.

Dismantle guard (`economy.TARGETS.crateReturnMax` 0.9): `expectedReturn(crateId)` assumes EVERY drop is a duplicate and includes golden. Worst case yarn per pull: Cardboard 18.8 (price 400), Tuna Tin 35.5 (3000), Neon Chest 57.4 (2500 yarn, 2.3%), Velvet Vault 114.6 yarn plus 0.19 gems (60 gems), Reliquary 228.9 yarn plus 0.53 gems (300 gems). All far under 90% of the price, so buying crates to dismantle is a heavy net loss.

## 5. The x10 button

`openCrate(profile, id, rng, {count: 10})` costs the ten sequential single prices (creep included, no discount, so the price is honest). If none of the first nine pulls reached the crate's guarantee rarity, the tenth is rolled only among that rarity or better (pity still applies and still resets). The conditional probabilities of that slot are printed (`multi.slotProbs`, percent):

| Crate | rare | epic | legend | mythic |
|---|---|---|---|---|
| Cardboard Box | 86.36 | 12.95 | 0.68 | 0 |
| Tuna Tin | 76.32 | 21.05 | 2.63 | 0 |
| Neon Chest | - | 85.29 | 13.53 | 1.18 |
| Velvet Vault | - | 80 | 17.14 | 2.86 |
| Mythic Reliquary | - | - | 83.33 | 16.67 |

(Probabilities are shown at perk level 0 and counters 0; the live table recomputes them for the player.)

## 6. Luck perk

`economy.META.crate_luck` (tokens, max level 5) multiplies the weight of every non-common rarity by `1 + 0.05 * level` before the row is renormalised. It is displayed in the table as the luck line and in the "now" column.

## 7. Reveal beats (animation metadata)

Every drop carries `reveal = {tell, fakeOut, beats[], ms}`; the result carries `reveal = {order, finale, totalMs}`.

- `tell` (0 to 1) is the anticipation strength: `tellBase(crate) + 0.17 * rarityIndex + noise(+-0.1)`. Higher rarity is statistically stronger but noisy, so a strong tell is a hint, not a promise.
- `beats` is a list of `{kind, at (ms), power?, color?}` with kinds `shake, rumble, crack, pulse, fakeout, flash, burst, reveal`. A `crack` with `hint: 'true'` leaks the real rarity colour. A `crack` with `hint: 'tease'` leaks the NEXT rarity colour, followed by a `fakeout` beat `{from, to}` that fades to the true colour. Fake-outs only happen below mythic, with chance 12% (Cardboard) up to 20% (Reliquary).
- `order` is the suggested reveal order for x10: ascending rarity, ties in draw order; `finale` is the index of the best drop, to be held for last.
- Colours are rarity ids (resolve with `palette.RARITY`) or `'gold'`. The crate `art` and `reveal` timing live on the crate data entry.

## 8. Profile contract

`openCrate` never mutates its input and returns a deep copy. It pays the price (`profile.cur`), advances `stats.crateOpens` (price creep, reset by Nine Lives in progression) and `stats.cratesTotal`, updates `pity`, `cats`, `cards`, `relics`, and returns `{profile, drops, pityHit, reveal, spent, count}`. If the player cannot pay it returns an unchanged copy with `drops: []` and `error: 'cant_afford'`. `{free: true}` skips payment (boss crates, tests). `pityHit` is `null` or `{tier, pull, hard: true}` when a hard guarantee delivered the tier; `drop.pity` is `'hard'` or `'soft'` for pulls helped by the pity ramp.

## 9. Monte Carlo targets (for the test engineer)

Because pity changes the probability pull by pull, compare against the exact per-pull sums, not the printed base row:

1. Rarity rates: over N = 200k pulls on a fresh profile with `{free: true}`, before each pull read `oddsTable(id, profile).rarity[i].now`. For each rarity, `expected = sum(now)` and `variance = sum(now * (1 - now))`; the observed count must be within 3 sigma of `expected`. (Measured z at seed 99: all between -1.7 and 2.1.)
2. Content mix: given the rarity, the kind frequencies must be within 3 sigma of `oddsTable(...).content[rarity]` (binomial, using the number of pulls of that rarity).
3. Golden rate within 3 sigma of 0.02.
4. Pity bounds: no dry streak longer than `hard` for any crate with pity, and the measured mean gap within 3% of `expectedPulls`.
5. Hard pity: with counter set to `hard - 1`, the next pull is that tier or better, always (try 1000 seeds).
6. x10: over 3000 seeds, a ten-pull never lacks the guarantee rarity (0 misses measured for Cardboard and Reliquary).
7. Purity: input profile deep-equal before and after; same seed gives identical drops; `cant_afford` leaves currencies untouched.
8. Money-free: `expectedReturn(id).yarn` below 0.9 times the price for each crate, and no fish or yarn crate has gem weight.
9. Dupes: every non-currency drop on an owned item pays `dupeValue > 0` and a cat dupe raises `dupes` by 1 (2 if golden).
