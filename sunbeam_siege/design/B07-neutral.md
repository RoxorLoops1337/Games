# B07: Neutral, Curse and Token Cards

File: `src/data/cards-neutral.js` exposes `SB.data.cardsNeutral` (54 objects, all ids unique, load-checked in a stub context).

| Group | Count | Prefix | Notes |
|---|---|---|---|
| Basics | 5 | neutral_ | Swat, Catnap, Cardboard Box, House Cat, Window Watcher |
| Neutral cards | 30 | neutral_ | 12 common, 11 uncommon, 7 rare. 15 units, 11 spells, 4 toys |
| Curses and junk | 9 | curse_ | 1 fight-only (Hairball), 8 deck curses |
| Tokens | 10 | token_ | All fight-only, Lives 1 for cats |

## Intent
- Neutral cards are the glue. Every one of them touches a keyword from a clan that is not its owner, so a run's side clan or an off-clan pick still has a reason to exist. Examples: Knick-Knack Kitten and Shove give any deck a taste of Knock, Tangle Kitten and Yarn Ball give a taste of Yarn, Delivery Cat feeds Boxes, Dozing Tom and Catnap feed Nap, Kind Stranger and Lucky Penny dip into Nine Lives.
- Neutral power is deliberately a half step below clan cards at the same cost. They are utility, not engines. The exceptions are the rares (The Drifter, All-Nighter, Group Photo) which are "good in anything" rather than "great in one thing".
- Basics are plain on purpose so that clan basics read as the interesting ones. Window Watcher is the only basic with a rider (Fluff 2).

## Standout combos
1. Delivery Cat + Flat Pack loop: Delivery Cat adds a Flat Pack, Flat Pack places a Box, Box gives +1 Power and Hidden. Cheap box setup for any clan.
2. Pantry Raider + Lucky Calico: both reward dying. Raider draws on death, Calico comes back to hand cheaper each time (cost floors at 0).
3. Matriarch of the Block + Welcome Mat: every deployed cat gets Fluff 2 + 2 (or 8 upgraded). Great for Large cats like Chonk.
4. Shelf Sitter + Shove + Knock-Off Tabby style cards: Knock each turn stalls a floor. Grip rule (once per pest per round) keeps it from looping forever.
5. Spring Cleaning on Dead Mouse Gift: the gift is a curse that drops a Hairball, so you can cure the chain at the root.
6. Sunny Windowsill + Sun Chaser: Warmth sustain deck for players who want to outlast the clock.
7. All-Nighter before a Witching Hour turn: Zoomies cap is 10, so it is safe, and it eats the Crash only on the following turn.

## Curse design
Each curse has a different pain point so the junk pile feels like a zoo, not one big tax:
| Curse | Pain | Fight outlet |
|---|---|---|
| Hairball | Playable, 2 Zoomies for 4 damage (fight only) | Play it |
| Vet Appointment | -1 Zoomies next turn | Exhaust effects |
| Bath Time | -1 Power on a random cat | Exhaust effects |
| Cucumber | Scares a random cat (no attack, loses Purr) | Exhaust effects |
| Wet Sock | Playable, Wet 2 on a cat, draws 1 | Play it |
| Itchy Collar | Retained, drips -1 Power each turn it sits in hand | Spring Cleaning |
| Dead Mouse Gift | Adds a Hairball to hand (a gift in a gift) | Play the Hairball |
| Eviction Notice | Lose 2 Warmth | Exhaust effects |
| Static Shock | 2 damage to a random cat | Exhaust effects |

Permanent removal paths (field `cure` on each card): Vet event (free Flush), Gerald's desk (75 Fish, +25 each time per RULES), or the new card Spring Cleaning. Fight-only Hairball needs no cure. A06 says Adopt Out cannot take curses, so shop removal here means the card removal desk in RULES section 8, which should be allowed to take curses. See open items.

## Token map (who uses what)
- token_empty_collar: Nine Lives engine (last life lost). token_flat_pack: Boxes (flattened box, Delivery Cat).
- token_yarn_ball: any Yarn payoff. token_stray_kitten: generic summons.
- token_lap_kitten (hearth), token_spirit_cat and token_spare_charm (moon), token_scrap_kitten (alley), token_catnip_mouse (mischief), token_tuna_treat (hearth heal).
- Tokens carry the `token` rarity so the engine removes them at fight end. They are not offered as rewards.

## Unresolved / NEEDS (also in the file header)
1. New effect types: `removeCard` (Spring Cleaning) and `cleanse` (Lick Fur).
2. Informational fields `removal` and `cure` on curse cards must pass the loader. If the validator is strict, move them to a side table.
3. Alias map for A03 sample ids (swat, catnap, cardboard_box, hairball) to the prefixed ids. Starting deck code must use neutral_swat, neutral_catnap, neutral_cardboard_box.
4. Neutral Catnap uses `nap` on a chosen cat, but RULES say a cat cannot Nap on the turn it is played. Engine needs to refuse the target or fizzle that effect.
5. Box durability is not on cards. The `box` effect needs a default Cardboard Box (durability 3).
6. Lucky Calico text says "costs 1 less to play again". If A02 Landing (cost -1 once) is used instead, replace the onDeath effect and keep Reborn.
7. Warmth effects: Sun Chaser, Sunny Windowsill and Eviction Notice use `warmth` with target `player`. Confirm cap at current max Warmth.
8. Tokens with `exhaust` on a unit: confirm a dying token cat goes to exhaust and never spends a life (Lives 1 means it simply dies per A02).
9. Balance pass needed: Shelf Sitter (Knock every turn at 2 cost) and Group Photo (fluff, heal and Power for the whole board) are the most likely to be too strong.
