# B22 Glossary and Rule Constants

Files: `src/data/glossary.js` gives `SB.data.glossary` (110 entries: 20 status, 16 keyword, 28 twist, 8 resource, 8 trait, 9 tag, 11 intent, 10 upgrade), `SB.data.glossaryIndex` (lowercase name, ref or alias to entry), `SB.data.glossaryIcons` (107 icon ids, `a08:true` for the 11 already named in A08 s8.5, the rest need bitmaps) and `SB.data.rules` (310 flat constants).
Lookup: `SB.data.glossaryIndex['purr']`, `['witching hour']`, `['dazed']` all work. Entry ids are `gl_<ref>`. Engine ids (status ids, trait names) live in `ref`.
Constants rule: engine reads `SB.data.rules.*` and never hard codes. Values marked REC in the file are recommendations for the open items below.

## Resolutions made (RULES.md wins)
1. Names: Zoomies Turn, Night Clock, 3AM, Dusk/Prowl clock phases become Witching Hour (aliases kept). Phase names: DAWN=Draw, POUNCE=Cat Attacks, PROWL=Pest Attacks, CLIMB=Pest Advance, DUSK=Dusk tick.
2. Witching Hour: 5 Zoomies, draw 6 (A02 said 7), Zoom is a free half damage hit (A02 Scramble and A03 random first deploy both cut). Frazzled -2 (A05).
3. Board: 4 cat slots, 5 pest capacity, 2 room slots, boss Size 5 (A02 5/6, A04/A05 5 slots, A08 4+room all overridden).
4. Warmth: 40 start and max, +5 per boss (A07 50/60 and A02 Last Life cut; Last Life only via the Spare Whisker relic). Spare Lives Jar cut.
5. Fluff: persists all battle. A04 halving, A03 clear at turn start, Warmth Ward and Clutter all cut. Sunbeam armor is Shade (A02).
6. Lives: run long (A02 and A03 per fight cut). Max 9. Last life gives Empty Collar. Champion sits out via The Long Nap and returns with 3 (A03 Retired cut). Landing (A05) is an alias of Reborn; its cost reduction is dropped.
7. Cozy (A04 status) cut. Cuddle Pile uses A05 Snug: +floor(P/2) Attack, heal at 3+, Heap at 4 (A04 said 5). Pile of 4 is a full floor.
8. Nap: A05 toggle model. A04 Rested payout (Claws, Purr, Dizzy and Crash cleanse) and A03 Rested (+2 per stack) cut. Rested max 4 (relic 6).
9. Purr: floor status that decays 1 per round, thresholds per A04 (5, 10, 20, 30, 40), cap 40. A04 per-cat Purr stacks, A03 +1 Power per 3 Purr and non-decay cut. Purr N on a unit adds N to its floor.
10. Nip: A05 meter 0 to 10 with auto Surge. A04 Catnip Peak status, A04 Crash status (cost +1, -2 damage) and A03 meter 0 to 6 manual Surge cut. `catnip` kept as alias of Nip.
11. Knock: A05 numbers (2 Shatter per floor, 3 from Cellar, once per round, Light/Heavy/Anchored). A04 Shatter 3 + Clutter and A02 flat card Shatter cut. Dizzy name wins over Dazed. Hairball card is 0 cost, applies 3 Hairball (A04), not A03 deal 4.
12. Yarn: pest skips action and climb, then -1 (RULES). A03 Tangled and A04 root-only wording are aliases and cut. A04 tangle bonus and Knock-onto-Yarned bonus cut.
13. Hidden: no timer, ends on attack or damage, does not block (RULES, A05). A04 Hidden duration and +2 Ambush cut. Ambush is now a keyword: first hit each fight doubles (A06). Box gives +1 Power (RULES).
14. Thorns (A02) and Bristle (A04) merged: Bristle (alias thorns). Decoy (A02) and Taunt (A06) merged: Decoy. Keep (A02) is Retain. Armor (A06) and Hide (A02) are Fluff.
15. Cut statuses: Spooked, Dull, Itch, Frozen (A02), Drowsy (A05), Cozy, Catnip, Crash (A04). Marked kept, its 2+ stack Claws bonus dropped as redundant with the kill bonus.
16. Economy: shop prices, reward odds, pity (+1, cap 20), clan split 60/30/10 and shop layout follow A03. Relic and service prices follow A07. Removal is 75 +25 (A06 and A07 said 50 +25). Scratch tier is gated 1/2/3 by act (A06 said 2/3/3). Champion tiers land at Nights 2, 5, 8 (A03 slots at 3, 6, 9 cut). Starting deck 11 (A07 said 12 + champion).
17. Fish above 120 spoils at the start of Acts 2 and 3 (Fridge Rule, kept). Mischief 4 (A07 Max Warmth 45) and Mischief 10 (no Last Life) are now ambiguous, see item 11.

## Remaining engine affecting ambiguities (15)
1. Floor Purr heal amount per cat at Dusk is undefined once Purr is a decaying floor value. REC: each cat heals ceil(P/2), then threshold extras apply, then Purr drops 1 (`purr_heal_divisor`).
2. Knock grip rule (A05): second Knock the same round. REC: no move, 1 Shatter per intended floor (`knock_grip_shatter_per_floor`).
3. Scared pest retreat (A04) used Clutter Shatter. REC: it counts as Knock 1 without Dizzy: 2 Shatter, no effect from the Cellar (no cat flap).
4. Dizzy vs Dazed. A02 Dazed skipped an action, A04 Dizzy is damage and misdirect. REC: Dizzy is the A04 status; Knock still costs the climb by its own rule; summoned pests arrive with Yarn 1 (`yarn_summoned_pest_start`); dog `Bulldog caps Dazed` becomes caps Dizzy.
5. Zoom: A05 says ceil(Attack/2) and bosses weighted double. REC: round up, uniform random over all pests (no boss weighting) to keep one RNG draw.
6. Hidden floor edge case. A02 restores Hidden cats as targets when all are Hidden and counts them for Sunbeam targeting; RULES says they do not block. REC: an all Hidden floor counts as empty for Hold and Sunbeam hits, pests there do not attack (no target), Tracker ignores all of this.
7. Wet pest (A04: push 2 floors, +50% Shatter) vs Slippery (A02: double Shatter, no Dizzy). REC: Wet pest counts as Light and takes +50% Shatter; Slippery stays a separate trait.
8. Cornered with max 1 life (tokens, Empty Collar). REC: requires maxLives of 2 or more (A05).
9. Frenzy: A04 says both doubles and +1 on a Witching Hour. REC: doubles (combo 9). Self damage ignores Fluff and may spend a life.
10. Rage-bait (alley data) interacts with Hidden and Sneaky. REC: Hidden removes the forcing; Sneaky Sunbeam hits are unaffected.
11. Mischief ladder after cuts. REC: rank 4 is Max Warmth minus 5; rank 10 is no Spare Whisker relic drops and Night omens double; Curl Up 20% at rank 6 stays.
12. Nap Nook options. RULES mentions lives from Nook, A07 lists Curl Up, Knead, Groom, A05 lists Lick Wounds, Deep Sleep. REC: five options, pick 1: Curl Up, Lick Wounds (+1 life, up to 3 cats), Deep Sleep (+2 lives, one cat), Knead, Groom (remove 1 card).
13. Adopt Out price. A06 first per act free then 50; RULES says 75 +25. REC: the first Adopt Out per act is free, then shop removal 75 +25, Strays always 0.
14. Champion tiers purchased early. A06 allowed Tier = act+1 at most. REC: a tier unlocks at Night 2, 5, 8; a missed tier may be bought at any Post at 60/100/150 once its Night has passed.
15. Hairballs in hand cap (6). REC: a 7th Hairball is created in discard instead of hand.
