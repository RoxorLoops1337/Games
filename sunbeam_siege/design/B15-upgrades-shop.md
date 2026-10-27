# B15: Upgrade Catalog, Forks, Evolutions and Gerald's Shop

File: `src/data/upgrades.js`. Exposes `SB.data.upgrades` (85), `upgradeGroups`, `upgradeFits(cardDef, up)`, `forks` (29 sets, 87 options), `evolutions` (6 chains), `shop`.

## Intent
Every scratch should say what it does in one line and feel like a choice. Tier 1 is flat numbers and small hooks, tier 2 grants keywords or triggers tied to clan mechanics, tier 3 is build-defining (flags, doubles, lives).

## Catalog (A06 schema)
- 30 A06 originals kept with ids intact, plus 55 new: T1 30, T2 32, T3 23.
- `fits`: unit, spell, toy, any (A06 "treat" is toy). `requires`: minCost, hasKeyword, lacksKeyword, hasTag, clanOrTag.
- `upgradeFits(card, up)` is a pure helper the engine may use or replace.
- Exclusivity groups: g_cost, g_retain, g_lives, g_multi, g_innate, g_pounce, g_fluff, g_purr, g_knock, g_nip, g_boxbonus, g_mastery, g_echo, g_hpmult, g_rested. One scratch per group per card.
- Terms follow RULES.md: Fluff (not Armor), Yarn (not Tangled), Dizzy, Claws, Nip.

## Forks
29 card families, 2 or 3 options each, 90 Fish, patches in A03 9.4 form. Card ids are guesses: `swat`, `catnap`, `cardboard_box`, A03 examples (`alley_scrapper`, `cinder_tom`, ...), A06 samples, and invented moon ids. The engine maps each set by `card`, then `aliases`, then `match` (type, clan, tags). Moon and A03 old-clan ids (lap, shadow, yarn) have aliases or need remapping to hearth, mischief.

## Evolutions
Biscuit, Dumpling (hearth), Pip (alley), Wisp (moon), Gus, Yarn Ball (mischief). Lives 2, 3, 4 per stage. Gus and Dumpling legends are Large (size 2, 4 lives). Quests are counters (`kneadTotal`, `ambushKills`, `rebornCount`, `wonInBox`, `turnsInPile3`, `yarnCardsInFight`).

## Shop (Gerald)
Stock per A07 (5 cards, 2 relics, 1 charm) plus Post Stall (4 scratches, fork voucher), 3 consumables (Tuna Tin 55, Whole Salmon 150, others), services with escalating prices. Shoo uses RULES.md (75 +25 each), overriding A07 (50). 20 banter lines, greetings by act, reactions to buy, sell, haggle, poor, rich. Sale rules: one half-price card, relic 20 percent off at 30 percent, bulk discount, haggle (10 Fish, 45 percent, fails raise price). Black market: 10, 20, 25 percent by act, 8 items 180 to 340 Fish (Spare Whisker, Forbidden Tuna, Used Collar, Sealed Box).

## Standout combos
Shatter Ready plus one Knock booster (Knock Plus or Dropkick) turns Knock decks into floor-fall engines; the Knock group blocks stacking two boosters. Double Duty on Heated Cushion toy. Cosmic Cat on any Witching deck.

## Unresolved (see NEEDS in file header)
New ops/flags/targets for the engine; relic ids in black market are guesses (`relic_spare_whisker`, `relic_gilded_whisker`); balance of Hungry Hunter style triggers with the 2.2x target; Shoo vs A06 free first Adopt Out.
