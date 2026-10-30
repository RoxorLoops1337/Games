# SUNBEAM SIEGE: Nine Lives to Hold the House
## LOCKED RULES (lead rulings). This file overrides any conflicting line in A01 to A08.

Source docs (read the ones relevant to your job for detail): A01 vision, A02 combat rules, A03 cards and economy (schema and effect DSL), A04 statuses, A05 twist mechanics, A06 upgrade system, A07 run structure, A08 art and UI. Where this file is silent, the most specific doc wins: combat = A02, statuses = A04, twists = A05, cards schema = A03, upgrades = A06, run = A07, art = A08, tone = A01.

## 1. Identity
- Title: SUNBEAM SIEGE, subtitle "Nine Lives to Hold the House". Code namespace `SB`. Currency: Fish.
- Tone: warm, dry, funny, never cringe. No em dashes or en dashes in any text or code comments.

## 2. Clans (4, ids fixed)
- `alley` Alley Tabbies: aggressive scrappers. Keywords: Claws, Pounce, Frenzy, Rage-bait. Color: ember orange.
- `hearth` Hearthpaws: cozy support. Keywords: Purr, Nap/Rested, Cuddle Pile, Fluff, heal. Color: warm gold/cream.
- `moon` Moonwhiskers: mystic spirit cats. Keywords: Nine Lives (spend, gain, bank lives), Reborn, Witching Hour synergy, Marked. Color: indigo/violet.
- `mischief` Mischief: chaos. Keywords: Knock It Off, Boxes, Yarn, Nip meter (Catnip Surge), Hairballs. Color: teal/magenta.
- Plus `neutral` (any clan), `pest` (enemy side), `curse` (junk cards). Run = main clan + side clan. 2 champions per clan at launch (8 total).
- A08 palette remap: alley=prowl, hearth=hearth, moon=nap palette (indigo), mischief=chaos/cardboard/yarn blend.

## 3. Board
- 3 floors: 1 Cellar, 2 Parlor, 3 Attic. Above Attic: the Sunbeam.
- Cats are placed Front, Middle or Back of a floor (the UI asks when the floor already has cats; engine `playCard(uid, {floor, pos})`).
- Per floor: 4 cat slots (cat Size 1; rare Large cats Size 2), 5 pest Size capacity (Small 1, Medium 2, Large 3, Boss 5), 2 room slots (Toys, Boxes, Rooms). Position 0 is front; units compact when one leaves.
- Sunbeam Warmth: start 40, max 40, +5 max after each boss (so 45 then 50). Persists between fights. Shade (Sunbeam armor) resets each battle. A one-time "Last Life" revive is NOT default: it is a rare relic (Spare Whisker).

## 4. Turn structure (A02 names are canonical)
Setup (once), then per round: Draw, Play, End Turn, Cat Attacks (floors 1 to 3, front to back), Pest Attacks, Pest Advance (floors top down), Spawn, then Dusk tick (status ticks per A04 tick order). PESTS ATTACK FIRST (changed from cats first): the order is End Turn, Pest Attacks, Cat Attacks, Pest Advance. Rules flags `pestsFirst` and `pestsAlwaysClimb` in SB.data.rules (set both false for the classic order and Hold Rule; the legacy test suites do). One FIFO trigger queue; simultaneous triggers: relics, rooms by floor, cats, pests. Damage applies simultaneously, then deaths are removed together. Damage order: flat bonuses, percent multipliers (rounded down), Hiss, Fluff, then HP. Overkill is lost.
- Zoomies (energy): 3 per turn, set not added, no carryover, hard cap 10. Draw 5. Hand limit 10 (max 6 Hairballs in hand). Starting deck 11 cards: Champion, 4 main-clan basics, 2 Swat, 2 Catnap, 1 Cardboard Box, 1 side-clan basic. Min deck 8, target 24 to 32.
- Fluff = armor. It persists until end of battle (A04's halving rule is cut). Pests can have Fluff too, called Armor on pests in UI text only if needed.
- Climb: every surviving pest climbs one floor each round after the fighting (`pestsAlwaysClimb`), whether or not cats stand in the way. The old Hold Rule (a pest climbs only if its floor has no cats, or it has the Climber trait) applies only with the flag off. Pests get `pestHpMult` 0.5 so one round per floor is enough to matter (tutorial excluded). An unopposed pest on arrival hits the Sunbeam 3 rounds after it appears. On the Attic with no cats, pests hit the Sunbeam every round. Sneaky pests hit the Sunbeam even with cats present.
- Anti-stall: Impatience gives pests +1 Attack per round from round 16.
- Determinism: one mulberry32 battle RNG seeded from runSeed + nodeId; combat never calls Math.random.

## 5. Nine Lives (core, run-long)
- Lives are stored on each Cat card instance for the whole run. Defaults: Kitten 2, standard 3, Large 4, Champion 9. Hard cap 9.
- Cat dies in combat: spend 1 life, card goes to discard (or to hand with Reborn). On the last life, the card is lost and replaced in the deck by a 0-cost "Empty Collar" (gain 1 Zoomies, exhaust). Exhaust and sacrifice do not cost lives.
- Cornered: a cat on exactly 1 life gets +2 Attack. "Spend a Life" is a voluntary cost that keeps the cat on the board.
- Champions are never deleted: at 0 lives a champion sits out until the next Act, returning with 3 lives.
- Lives restored: +1 life to every cat at each Act start, Nap Nook options, shop items (Tuna Tin +1 one cat, Whole Salmon +1 all), upgrades (Plush), cards, relics. Spare Lives Jar is CUT.
- Moon clan is the Nine Lives clan; other clans interact through the generic rules only.

## 6. Core twists
- Nap (core): toggle on each cat, not on the turn it is played. A napping cat does not attack, heals 2 per round, gains Rested +1 (max 4). On waking, it makes a Stretch attack (not called Pounce) for +3 per Rested stack (cap +18) and gains +1 Attack for the battle per 2 stacks spent. Damage while asleep is a Rude Awakening: lose Rested, +2 Attack that turn. (Pounce N is only the on-deploy keyword: attack once for Power+N at the front pest on that floor.)
- Knock It Off (core): Knock N pushes a pest down N floors. It loses its climb turn, takes 2 Shatter per floor fallen, and other pests on the landing floor take 2 each. Knocked from the Cellar: 3 Shatter and it exits through the cat flap to the front of the Garden queue, re-entering at next Spawn. Light pests fall 1 floor further, Heavy 1 less, Anchored do not move. Bosses are Heavy or Anchored. A pest can be moved by Knock only once per round. A push into a full floor fails. Landing grants Dizzy 1 (A04 name; A02 "Dazed" is Dizzy).
- Witching Hour (core, formerly Night Clock/3AM): every 3rd round (3, 6, 9, ...), announced a round early on the clock UI. Effect: +2 Zoomies (5 total), +1 draw (6 cards), every awake, non-Boxed cat Zooms (free half-damage hit on a random pest on any floor) and is Frazzled (-2 Attack) next round. Night Visitors (a wave at about 25 percent of a normal wave threat) spawn at its end. Cannot occur twice in a row. Flag `rules.nightClock`, per encounter, off in tutorial fights.
- Boxes (mischief-flavored, any clan can find a Cardboard Box): a Box is a Room item using one of the 2 room slots; it holds 1 cat (Big Box holds 2), Large cats do not fit. A boxed cat gets +1 Power and is Hidden until it attacks or takes damage. Hidden cats cannot be targeted and do not block (so an all-Hidden floor lets pests climb). Boxes have durability and become a Flat Pack card when flattened. Max 2 Boxes per floor.
- Cuddle Pile (hearth-flavored): a Pile is 2 or more cats in consecutive slots on a floor. Each cat gets +floor(P/2) Attack. Pile of 3 or more heals each member 1 per round. Pile of 4 is called a Heap and also gives each member +2 Fluff each round. Killing a middle cat splits the Pile. A cat that Zoomed loses Snug for a round.
- Nip / Catnip Surge (mischief-flavored): battle-only Nip meter 0 to 10. At 10 it auto-Surges for the rest of this turn and all next turn: +2 Zoomies now and +2 next turn, cats get +2 Attack plus any excess Nip. Total Zoomies this turn cap at 10. Then Crash for 1 to 2 turns: -1 Zoomies, -1 draw, and on the first Crash turn all cats are forced to Nap and gain Rested. Nip gained during Surge or Crash is lost.
- Purr (hearth): floor status, decays 1 per round, thresholds per A04 (5, 10, 20, 30, 40 aura tiers), heals cats on the floor at Dusk.
- Yarn: status on pests. Yarn 1 or more means the pest skips its action and its climb this round, then Yarn drops by 1. Bosses take half Yarn duration. (A03 "Tangled N" = Yarn N.)
- Hairball: card/status per A04; a curse card in deck and a status; max 6 in hand.

## 7. Upgrades and growth (A06 governs detail)
- Scratching Post: 2 free Post nodes per act plus paid Post Stall in shops. Material gates tier by act: Cardboard (T1), Sisal (T2), Cedar (T3). Scratch prices 40, 75, 120 Fish.
- Champions: 3 tiers unlocking at Nights 2, 5 and 8, each tier a pick of 1 from 3 (A06 trees of 3 paths x 3 tiers). Champion upgrade options must be dramatic and fun.
- Mastery: 3, 7, 12 plays (max 3 plays counted per card per fight). Kneading: Knead N keyword, cap 12 per card (20 champions). Evolution: kitten to cat to legend chains. Adopt Out (remove), Box Swap (transform), Litter (duplicate).
- Goal: a card should reach about 2.2x printed power by Night 9, and each fight shows a Growth Report with at least 3 visible growth events.

## 8. Run structure (A07 governs detail)
- 3 acts, 9 nights, 5 columns x 8 rows per act. Act 1 The Cellar and Garden, Act 2 The Parlor, Act 3 The Attic and Roof. Combat floors are always Cellar, Parlor, Attic.
- Node types: Battle (Prowl and Night), Elite, Shop (Gerald the raccoon), Event, Scratching Post, Nap Nook, Treasure (Cardboard Box), Mystery, Boss.
- Bosses (2 per act, one chosen per run): Act 1 Rat King, Garden Hose; Act 2 Vacuum Mk IX, Spray Bottle Duelist; Act 3 Vet Carrier, Red Dot. Night 9 boss has a Dawn phase.
- Reward odds, shop prices, pity: per A03. Fish economy: Fridge Rule (A07). Mischief Rank 0 to 10 ladder and Night Omens (A07).
- Prices in Fish. Card removal 75 +25 each time.

## 9. Data file conventions (all content agents)
- Output real files to /home/claude/nine-lives/src/data/ as classic scripts (no modules, no imports):
```
window.SB = window.SB || {}; SB.data = SB.data || {};
SB.data.<name> = [ { ... }, ... ];
```
- Card objects follow the A03 schema and effect DSL exactly. If you need a new effect type, status or keyword, do not invent silently: list it in a comment block at the top of your file under `NEEDS:` so the engine agent can add it. Prefer existing ones.
- Every object needs a stable lowercase `id` (snake_case), unique across the game, prefixed per file: cards `<clan>_`, enemies `pest_`, relics `relic_`, events `evt_`.
- Include `name`, `flavor` (dry and funny, under 90 chars), and `art` hints (a short descriptor for the sprite generator: species, colors, accessory) where the schema allows.
- Also write a short design note to /home/claude/nine-lives/design/<your code>-<topic>.md (under 80 lines): intent, standout combos, anything unresolved.
- Cat names and puns are encouraged. Do not use real trademarked characters. Do not reproduce song lyrics or copyrighted text.
- Self-check before finishing: run `node -e` to load your file with a stub `window` and confirm it parses and every id is unique. Fix errors.

## 10. Lead rulings on engine questions (from B22, accepted as recommended; design/B22-glossary.md has detail)
Constants live in `SB.data.rules` (src/data/glossary.js). The engine reads numbers from there, never hardcodes them. `SB.data.glossaryIndex` resolves aliases (Dazed=Dizzy, Tangled=Yarn, Thorns=Bristle, Taunt=Decoy, Armor/Hide=Fluff, Retain=Keep, Landing=Reborn).
1. Floor Purr heals each cat ceil(P/2), then threshold extras, then Purr drops 1.
2. A second Knock on the same pest in one round: no move, 1 Shatter per intended floor.
3. A Scared pest retreat: treat as Knock 1 without Dizzy, nothing from the Cellar.
4. Dizzy keeps A04 damage and misdirect behavior. Summoned pests arrive with Yarn 1. Data using Dazed or Tangled is resolved by alias.
5. Zoom hits: round up, uniform random target, no boss weighting (Red Dot is the one boss Zoom can reach).
6. A floor with only Hidden cats counts as empty for the Hold rule and for Sunbeam hits.
7. Wet pests count as Light and take +50 percent Shatter. Slippery stays a separate trait.
8. Cornered needs max lives of 2 or more.
9. Frenzy doubles at a Witching Hour. Its self damage ignores Fluff.
10. Rage-bait: forces pests on the floor to hit that cat; Hidden ends the forcing; Sneaky Sunbeam hits are unaffected. Each hit taken gives N Claws.
11. Mischief ladder after cuts: rank 4 is Max Warmth minus 5; rank 10 removes Spare Whisker drops and doubles Night omens.
12. Nap Nook offers five options, pick one: Curl Up, Lick Wounds, Deep Sleep, Knead, Groom.
13. Adopt Out: first one per act is free, then 75 +25 each.
14. A missed Champion tier can be bought at any Post for 60, 100, 150 once its Night has passed.
15. A 7th Hairball goes to discard instead of hand.
16. Great Bath is a third Act 3 boss pick: always at Mischief Rank 5 or higher, otherwise 1 in 3 (per enemies-bosses.js `selection`).
