# A03: Cards and Economy (Nine Lives: Defend the Sunbeam)

Scope: card types, anatomy, keywords, Zoomies, draw and shuffle, rarity, JSON schema, effect DSL, 25 example cards. Combat phase order, enemy rules and floor capacity belong to other agents. Where I need a number from them I state my assumption and flag it.

## 1. Locked numbers (quick table)

| Rule | Value |
|---|---|
| Base Zoomies per turn | 3 (no carryover, unspent Zoomies are lost) |
| Max Zoomies at any time | 10 |
| Cards drawn per turn | 5 |
| Hand limit | 10 (extra draws are discarded and fire onDiscard) |
| Starting deck | 11 cards (see 7) |
| Minimum deck size | 8 (removal blocked below this) |
| Target deck at end of run | 24 to 32. Over 40 shows a "Lots of cats" warning in the UI, no penalty |
| Zoomies Turn | every 3rd turn of a fight (turns 3, 6, 9...): +2 Zoomies, draw +1 |
| Catnip meter | 0 to 6, Surge costs no Zoomies (see 5) |
| Floor capacity (ASSUMED) | 4 Cat slots and 2 Toy slots per floor. Owned by the floors agent |
| Seeded RNG | one RNG stream per combat: seed = hash(runSeed, nightIndex, "deck"). Shuffles and random targets all use it |

## 2. Card types

| Type | Id | Where it goes | Lifecycle |
|---|---|---|---|
| Cat unit | `unit` | Placed on a chosen floor, takes 1 Cat slot (`size`) | Fights each round. Dies, spends a Life, returns to a pile (see 4) |
| Spell | `spell` | Instant effect, then discard (or exhaust) | Resolves, leaves. A spell with a `passive` effect leaves a trigger on the board for the rest of the fight |
| Toy | `toy` | Attached to a chosen floor, takes 1 Toy slot | Stays until the fight ends. Cannot be killed. Enemy "Knock Over" abilities may remove one (enemy agent decides) |
| Champion | `champion` | Like a unit. Exactly 1 per run, starts in the opening hand (Innate) | Has run-long Lives (9). 3 upgrade slots, 2 choices each (see 3.3) |
| Curse / junk | `curse` | Unplayable or weak cards | `junk:"deck"` stays in the deck until removed. `junk:"fight"` is created mid-fight and vanishes at combat end |

Boxes are placed by Toy cards (effect `box`). A Box holds exactly 1 Cat. A Cat deployed to a floor with an empty Box moves in automatically (player may decline by dragging to the floor edge on desktop, tapping "Skip Box" on phone). A boxed Cat has Hidden until the end of the next enemy phase, and gets +1 Power while it stays in the Box.

## 3. Card anatomy

### 3.1 Fields shown on the card face
- Top left: **Cost** in a paw circle (number, "X", or a lock icon for Unplayable).
- Top: **Name**. Under it: type line, e.g. "Cat, Alley" or "Toy, Lap".
- Art box: procedural sprite, tinted by clan palette.
- Unit/Champion only: **Power** (claw icon, bottom left), **Health** (heart, bottom right), **Lives** (row of 1 to 9 small paw pips under the art, filled = remaining).
- Text box: keyword names in bold, each tappable for a tooltip. Rules text stays under 90 characters where possible.
- Rarity gem at the bottom: Basic white, Common cream, Uncommon teal, Rare gold, Legendary violet, Curse sick green, Token grey.
- Flavor line in italics (hidden on phone portrait, shown in the card inspector).
- Upgraded cards show a "+" after the name and gold text for changed numbers.

### 3.2 Stat budget (for card designers)
Points = Power x 2 + Health. A Common unit at cost C should land near **5 + 4C** points before keywords. Uncommon +2, Rare +4. Each keyword costs points: Pounce 1 = 2, Reborn = 5, Purr 1 = 3, Hidden = 3, Fleeting = refund 4, Retain = 1. Examples: cost 1 = 9 points (2/5 or 3/3), cost 2 = 13 (3/7), cost 3 = 17 (4/9).
Spell budget: 1 Zoomies is about 4 damage to one enemy, or 2 damage to a whole floor, or 5 Health of healing, or 1 Knock floor plus 2 damage.

### 3.3 Champion upgrades
A Champion has 3 upgrade slots. Slot 1 unlocks at Night 3, slot 2 at Night 6, slot 3 at Night 9 (or earlier from a Scratching Post at a Rest Nook, where one upgrade per visit may go to the Champion instead of a card). Each slot offers 2 options, `a` or `b`. Picking is permanent for the run. Patches use the upgrade patch rules in 8.4.

## 4. Lives (Nine Lives rules, LOCKED version)
- Every `unit` has `stats.lives` (Commons 1 to 2, Uncommons 2 to 3, Rares 3 to 4). Lives are **per fight** for ordinary Cats: they refill at combat end.
- When a Cat dies: it spends 1 Life. If Lives remain, the card goes to the **discard pile** with its remaining Lives shown, and is redeployed at normal cost with full Health. If it hits 0 Lives it is **Exhausted for the rest of the fight** (returns to the deck next fight).
- **Champion Lives are run-long.** Start 9. Each death spends 1, never refilled except by Rest Nook "Long Nap" (+3), certain relics and events. A Champion at 0 Lives is **Retired**: removed from the deck for the rest of the run (the run continues). Open question 3.
- Effects can gain or lose Lives (`lives` effect). Max Lives = printed value + 3.
- `Reborn` changes only the destination: dead Cat goes to **hand** instead of discard (still spends the Life).

## 5. Zoomies (energy)
- Turn start: set Zoomies to **3** (not add). Modifiers apply after: relics +1, Crash -2, Zoomies Turn +2.
- **Growth:** (a) Zoomies Turn every 3rd turn. (b) Relics and champion upgrades give permanent +1 base Zoomies. (c) A card may `zoomies` refund mid-turn. Total can never exceed 10. Floor is 1 on turn start (Crash cannot take you under 1).
- **Zoomies Turn (the 3am rule):** turns 3, 6, 9... give +2 Zoomies, draw +1 card, but the **first Cat card you deploy that turn lands on a random floor** and costs 1 less. UI shows a "3AM" banner and a moon icon on turn 3 in the clock.
- **Catnip surge:** Cards with `catnip` effects fill the Catnip meter (cap 6). Free action, once per turn, needs Catnip >= 3: **Surge** = gain Zoomies equal to Catnip, all your Cats get +1 Power until end of turn, meter resets to 0. At the start of your next turn you get **Crash**: -2 Zoomies (min 1 total) and draw 1 fewer card. Crash is removed after that turn. The meter cannot gain while Crashed. Catnip empties at combat end.
- **X cost:** spends all remaining Zoomies, X = amount spent. Zoomies Turn refunds do not apply to X cards.
- Cost modifiers: `reduceCost` is either `"turn"` (until end of turn) or `"played"` (until the card is played). Cost cannot go below 0.

## 6. Piles, drawing, shuffling
- Piles: Draw, Hand, Discard, Exhaust. Board (units and toys) is outside the piles.
- **Combat start:** Draw pile = whole deck shuffled. Innate cards are moved to the top. Draw 5 (Innate cards count in the 5 first; if more Innate cards than 5, draw all of them, up to hand limit).
- **Turn start:** draw 5 (+1 on Zoomies Turn). **Turn end:** discard the whole hand except Retain cards, then Fleeting cards still in hand are exhausted, Curse "end of turn" text resolves in hand order (left to right).
- **Empty draw pile:** shuffle the Discard pile into a new Draw pile (not Exhaust), continue drawing. If both are empty, stop drawing (no damage). Fires `onShuffle` once per shuffle.
- Fight-created cards (`createCard`) enter where the effect says (`hand`, `draw` at a random position, `draw_top`, `discard`). They get the flag `fightOnly` if their def has `junk:"fight"` or `rarity:"token"`, and are removed from all piles when the fight ends.
- At combat end all cards (including Exhausted) return to the deck, except fight-only cards.

## 7. Starting deck (11 cards)
Champion (1), main clan Basic unit x4 (clan's `basicUnit`), Swat x2, Catnap x2, Cardboard Box x1, side clan Basic unit x1. Total 11. Basic rarity never appears as a reward or in shops.

## 8. Keyword glossary (exact rules)

### 8.1 Card keywords
| Keyword | Rule |
|---|---|
| **Exhaust** | When played, goes to the Exhaust pile instead of discard. On a unit: when it dies it goes to Exhaust instead of discard (it still spends a Life). Cannot combine with Reborn (validator error). |
| **Fleeting** | If this card is still in hand at end of turn it is exhausted. Playing it normally discards it. Cannot combine with Retain. |
| **Retain** | Not discarded at end of turn. Cost reductions on it persist. Retained cards still count toward the hand limit. |
| **Innate** | Starts in your opening hand each fight. Multiple Innate: see 6. |
| **Unplayable** | Cannot be played. Can still be discarded, exhausted, Retained by effects. Draws normally. |
| **Reborn** | When this unit dies with Lives remaining, it returns to your hand (instead of discard). Hand full: goes to discard. |
| **Pounce N** | Unit. On deploy, before any enemy acts, it attacks once, dealing Power + N to the front enemy on its floor. No enemy on the floor: nothing happens. Counts as an attack for `onAttack` triggers. Resolves after `onPlay` and `onCatDeployed` effects. |
| **Purr N** | Unit. At end of your turn, add N Purr to this unit's floor. |
| **Upgrade ("+")** | One upgrade per card, applied at a Scratching Post. Rewrites fields via the patch in 9.4. |

### 8.2 Board and combat terms used by cards
| Term | Rule |
|---|---|
| **Purr (floor status)** | Number on a floor (cap 9). At end of your turn, each Cat on that floor heals Purr (cannot exceed max Health). For every full 3 Purr, Cats there have +1 Power (aura). Purr does not decay. |
| **Rested N** | Cat status. A Cat that Naps gains Rested 1 (cap 5). Its next attack consumes all Rested and deals +2 damage per stack. **Nap** is a free action, once per Cat per round, instead of attacking. A Cat with no enemy to attack on its floor auto-Naps at end of round. |
| **Fluff N** | Shield. Absorbs N damage before Health. Cleared at the start of your turn. |
| **Knock N** | Push target enemy down N floors, stopping at the Cellar. It takes 2 Shatter damage per floor actually moved. An enemy already in the Cellar takes 2 Shatter damage instead. Shatter ignores Fluff. Elites and bosses can be Knocked but move at most 1 floor. |
| **Tangled N** | Enemy status. At the start of its turn it loses 1 Tangled and does nothing (no climb, no attack). Elites and bosses halve incoming Tangled (rounded down, min 1). |
| **Hidden** | Cannot be targeted or attacked by enemies until the end of the next enemy phase. Ends early if the Cat attacks. |
| **Box** | Floor feature. Holds 1 Cat (Hidden and +1 Power while inside). One Box per floor. Leaving the Box (death only) leaves the Box empty. |
| **Catnip / Surge / Crash** | See 5. |
| **Hissed N** | Enemy status. Deals 1 less damage per stack. Loses 1 stack at its turn start. |
| **Lives** | See 4. |

The combat agent may add statuses. Cards in this file only use the terms above.

## 9. JSON schema

### 9.1 Card
```json
{
  "id": "snake_case_unique",
  "name": "Title Case",
  "type": "unit | spell | toy | champion | curse",
  "clan": "alley | lap | shadow | yarn | neutral | curse",
  "rarity": "basic | common | uncommon | rare | legendary | curse | token",
  "cost": 0,
  "targeting": "floor | enemy | cat | none | allFloors",
  "stats": { "power": 0, "health": 0, "lives": 1, "size": 1 },
  "keywords": { "pounce": 1, "exhaust": true },
  "text": "Player facing rules text.",
  "flavor": "Dry one-liner.",
  "effects": { "onPlay": [ /* Effect */ ] },
  "aura": [ { "stat": "power", "amount": 1, "target": "allCatsOnFloor" } ],
  "upgrade": { /* patch, see 9.4 */ },
  "upgradeSlots": [ /* champions only, see 9.5 */ ],
  "art": { "sprite": "cat_tabby", "palette": "orange" },
  "tags": ["purr", "box"],
  "junk": "deck | fight",
  "unlock": "start"
}
```
- `cost`: integer 0 to 5, `"X"`, or `null` (Unplayable).
- `stats` only for `unit` and `champion`. Defaults: `size` 1, `lives` 1.
- `targeting` tells the UI what the player picks. `floor` gives `chosenFloor`, `enemy` gives `chosenEnemy` and its floor, `cat` gives `chosenCat`. Units and toys with `floor` attach to it.
- `aura`: continuous, recalculated, not an effect. `amount` may be an AmountExpr.
- `art.sprite` and `palette` are keys for the procedural renderer.
- `unlock`: `"start"` or `"meta:<id>"`.

### 9.2 Triggers (keys of `effects`)
| Trigger | Fires when | `triggerSource` is |
|---|---|---|
| `onPlay` | the card resolves (units: on deploy) | the card |
| `onCatDeployed` | any Cat is deployed to this floor (toys) or any floor (units, spells via passive) | that Cat |
| `onTurnStart` / `onTurnEnd` | your turn start / end (units and toys on board) | none |
| `onAttack` | this unit attacks | the target enemy |
| `onKill` | this unit kills an enemy | that enemy |
| `onDamaged` | this unit takes damage | attacker |
| `onDeath` | this unit dies (after life spent) | self |
| `onNap` | a Cat on this floor Naps (toys) or this Cat Naps (units) | the Cat |
| `onEnemyEnter` | an enemy enters this floor | that enemy |
| `onCardPlayed` | you play any card (units and toys on board) | the card |
| `onDrawn` | this card is drawn (curses) | none |
| `onTurnEndInHand` | end of your turn while this card is in hand | none |
| `onShuffle`, `onExhaust`, `onDiscard` | pile events for this card | none |

### 9.3 Effect and DSL
```json
{
  "type": "damage",
  "amount": 3,
  "target": "chosenEnemy",
  "times": 1,
  "if": [ { "check": "catsOnFloor", "op": ">=", "value": 2 } ],
  "status": "tangled", "stat": "power", "duration": "turn", "card": "hairball",
  "to": "hand", "keyword": "pounce", "trigger": "onTurnEnd", "effects": []
}
```
Resolution rules:
1. Effects in an array resolve in order. `if` is an AND list checked when that effect resolves. A failed `if` skips only that effect.
2. `target` with no valid object fizzles only that effect.
3. `times` (number or AmountExpr) repeats the whole effect, re-picking random targets each time. Default 1.
4. `amount` is a number or AmountExpr: `{ "base": 0, "per": "<counter>", "mult": 1 }` = base + mult x counter, floored. Counters: `catsOnFloor`, `otherCatsOnFloor`, `enemiesOnFloor`, `purrOnFloor`, `handSize`, `zoomiesLeft`, `catnip`, `exhaustCount`, `lives`, `x`, `cardsPlayedThisTurn`.
5. Negative `amount` on `buff`/`zoomies` is a debuff.

Effect types:
| type | Params | Meaning |
|---|---|---|
| `damage` | amount, `kind`:"hit"/"shatter" | Hit uses Fluff first. Shatter ignores Fluff. |
| `heal` | amount | Restore Health to Cat, or `player` target restores Warmth. |
| `fluff` | amount | Add Fluff. |
| `buff` | stat (power/health), amount, duration (turn/fight/run) | Change stat. Health buff also raises current Health. |
| `applyStatus` | status, amount | rested, tangled, hissed, etc. |
| `floorStatus` | status ("purr"), amount, target floor(s) | Add to a floor counter. |
| `zoomies` | amount | Gain or lose Zoomies this turn. |
| `catnip` | amount | Add to the Catnip meter. |
| `draw` | amount | Draw cards. |
| `discard` | amount, `mode`:"choose"/"random" | Discard from hand. |
| `exhaustCard` | amount, mode, `from`: hand/draw/discard | Exhaust cards. |
| `createCard` | card, amount, to (hand/draw/draw_top/discard) | Create fight-created cards. |
| `summon` | card, target floor | Deploy a token Cat free. |
| `knock` | amount | See 8.2. |
| `move` | amount (floors), `dir`:"up"/"down", target Cat | Move a Cat. |
| `lives` | amount | Gain or lose Lives on the target Cat or card. |
| `nap` | none | Force target Cat to Nap. |
| `box` | none | Place a Box on target floor. |
| `reduceCost` | amount, duration (turn/played), target card(s) | Cheaper. |
| `grantKeyword` | keyword, amount | Give a unit a keyword this fight. |
| `passive` | trigger, effects[] | Register a trigger for the rest of the fight. |
| `warmth` | amount | Gain or lose Sunbeam Warmth directly. |

Targets:
`self`, `triggerSource`, `thisFloor` (the floor of the card on board), `chosenFloor`, `chosenEnemy`, `chosenCat`, `attackTarget`, `frontEnemy` (front enemy on thisFloor or chosenFloor), `frontEnemyOnFloor` (alias), `randomEnemyOnFloor`, `randomEnemy`, `allEnemiesOnFloor`, `allEnemies`, `allCatsOnFloor`, `otherCatsOnFloor`, `adjacentCats` (left and right slot), `randomCat`, `allCats`, `allFloors`, `player`, `hand` (for card effects), `thisCard`.

Conditions: `{ "check": <name>, "op": "== != < <= > >=", "value": n|bool|string }`.
Checks: `catsOnFloor`, `enemiesOnFloor`, `floorIndex` (1 Cellar, 2 Parlor, 3 Attic), `targetFloor`, `hasBox`, `selfInBox`, `purrOnFloor`, `selfLives`, `selfHasStatus:<id>`, `turn`, `isZoomiesTurn`, `handSize`, `catnip`, `cardsPlayedThisTurn`, `targetHpPct`, `targetIsElite`.

### 9.4 Upgrade patch
`upgrade` may contain: `cost`, `stats` (merged key by key), `keywords` (merged, `false` removes), `text`, `effects` (each listed trigger array **replaces** the original trigger array, unlisted triggers stay), `aura` (replaces). Upgrading twice is not allowed. Upgraded display name: name + "+".

### 9.5 Champion upgradeSlots
```json
"upgradeSlots": [
  { "slot": 1, "unlockNight": 3, "a": { "name": "Claws Out", "patch": { } }, "b": { "name": "Thick Coat", "patch": { } } }
]
```
`patch` uses the same rules as 9.4 and stacks in slot order.

## 10. Rarity distribution
Basic never drops. Legendary cards come only from events, boss relics ("Gilded Whisker") and meta unlocks, never from normal rewards.

**Card rewards after fights.** 3 choices (4 with a relic), may skip. Odds per slot (before pity):

| Fight | Common | Uncommon | Rare |
|---|---|---|---|
| Act 1 normal | 62 | 32 | 6 |
| Act 2 normal | 54 | 36 | 10 |
| Act 3 normal | 48 | 38 | 14 |
| Elite (any act) | 40 | 40 | 20 |
| Boss | 0 | 0 | 100 (pick 1 of 3 Rares) |

- **Pity:** Rare odds gain +1 point (taken from Common) for every card reward shown with no Rare. Resets when a Rare is shown. Cap +20.
- **Clan split per slot:** main clan 60, side clan 30, neutral 10. No duplicate ids within one offer. Rolled with the combat RNG.
- **Shop (5 cards):** 2 main, 1 side, 1 neutral, 1 on 50% sale. Rarity weights 55/35/10 with at least 1 Uncommon or better guaranteed. Prices: Common 45 to 55 gold, Uncommon 75 to 90, Rare 140 to 170 (random within range). Remove a card: 75 gold, +25 each time. Curses cost 0 to remove at a Vet event.
- **Library target:** about 230 cards. Basics 12. Neutral 36 (C14 U14 R8). Four clans x 42 (C18 U15 R9). Curses and tokens 12 or more. Cap of 3 copies of any non-Basic card in one offer pool per run is not enforced, but Rares past the 3rd copy are skipped in rewards.

## 11. 25 example cards

### Cat units (9)
```json
{"id":"alley_scrapper","name":"Alley Scrapper","type":"unit","clan":"alley","rarity":"basic","cost":1,"targeting":"floor","stats":{"power":2,"health":4,"lives":2,"size":1},"keywords":{"pounce":1},"text":"Pounce 1.","flavor":"Has opinions about your bin.","upgrade":{"stats":{"power":3,"health":5},"text":"Pounce 1."},"art":{"sprite":"cat_scrappy","palette":"grey"},"unlock":"start"}
{"id":"loaf_of_cat","name":"Loaf of Cat","type":"unit","clan":"lap","rarity":"common","cost":2,"targeting":"floor","stats":{"power":1,"health":7,"lives":3,"size":1},"keywords":{"purr":1},"text":"Purr 1.","flavor":"Four paws, zero visible.","upgrade":{"keywords":{"purr":2},"text":"Purr 2."},"art":{"sprite":"cat_loaf","palette":"cream"},"unlock":"start"}
{"id":"box_goblin","name":"Box Goblin","type":"unit","clan":"shadow","rarity":"common","cost":1,"targeting":"floor","stats":{"power":2,"health":3,"lives":2,"size":1},"keywords":{},"text":"Deploy: if this is in a Box, gain +2 Power for the fight.","flavor":"If it fits, it sits. If it does not fit, it sits anyway.","effects":{"onPlay":[{"type":"buff","stat":"power","amount":2,"duration":"fight","target":"self","if":[{"check":"selfInBox","op":"==","value":true}]}]},"upgrade":{"effects":{"onPlay":[{"type":"buff","stat":"power","amount":3,"duration":"fight","target":"self","if":[{"check":"selfInBox","op":"==","value":true}]}]},"text":"Deploy: if this is in a Box, gain +3 Power for the fight."},"art":{"sprite":"cat_goblin","palette":"brown"},"unlock":"start"}
{"id":"zoomie_kitten","name":"Zoomie Kitten","type":"unit","clan":"alley","rarity":"common","cost":0,"targeting":"floor","stats":{"power":1,"health":1,"lives":1,"size":1},"keywords":{"fleeting":true,"pounce":2},"text":"Fleeting. Pounce 2. Deploy: draw 1 card.","flavor":"Arrived at full speed, from nowhere, for no reason.","effects":{"onPlay":[{"type":"draw","amount":1}]},"upgrade":{"stats":{"health":3},"text":"Fleeting. Pounce 2. Deploy: draw 1 card."},"art":{"sprite":"kitten_blur","palette":"orange"},"unlock":"start"}
{"id":"knock_off_tabby","name":"Knock-Off Tabby","type":"unit","clan":"alley","rarity":"uncommon","cost":2,"targeting":"floor","stats":{"power":3,"health":5,"lives":2,"size":1},"keywords":{},"text":"Whenever this attacks, Knock 1 its target.","flavor":"Maintains eye contact throughout.","effects":{"onAttack":[{"type":"knock","amount":1,"target":"attackTarget"}]},"upgrade":{"effects":{"onAttack":[{"type":"knock","amount":2,"target":"attackTarget"}]},"text":"Whenever this attacks, Knock 2 its target."},"art":{"sprite":"cat_tabby","palette":"orange"},"unlock":"start"}
{"id":"cinder_tom","name":"Cinder Tom","type":"unit","clan":"alley","rarity":"rare","cost":3,"targeting":"floor","stats":{"power":4,"health":5,"lives":3,"size":1},"keywords":{"reborn":true},"text":"Reborn. Death: deal 4 damage to all enemies on this floor.","flavor":"Has used up eight lives and regrets none of them.","effects":{"onDeath":[{"type":"damage","amount":4,"target":"allEnemiesOnFloor"}]},"upgrade":{"effects":{"onDeath":[{"type":"damage","amount":6,"target":"allEnemiesOnFloor"}]},"text":"Reborn. Death: deal 6 damage to all enemies on this floor."},"art":{"sprite":"cat_ember","palette":"black_red"},"unlock":"start"}
{"id":"yarn_spinner","name":"Yarn Spinner","type":"unit","clan":"yarn","rarity":"uncommon","cost":2,"targeting":"floor","stats":{"power":1,"health":5,"lives":2,"size":1},"keywords":{},"text":"Deploy: Tangle 2 the front enemy. End of turn: Tangle 1 a random enemy on this floor.","flavor":"Insists the sofa was always like this.","effects":{"onPlay":[{"type":"applyStatus","status":"tangled","amount":2,"target":"frontEnemy"}],"onTurnEnd":[{"type":"applyStatus","status":"tangled","amount":1,"target":"randomEnemyOnFloor"}]},"upgrade":{"stats":{"health":7},"text":"Deploy: Tangle 2 the front enemy. End of turn: Tangle 1 a random enemy on this floor."},"art":{"sprite":"cat_yarn","palette":"red"},"unlock":"start"}
{"id":"sunbeam_sprawler","name":"Sunbeam Sprawler","type":"unit","clan":"lap","rarity":"rare","cost":3,"targeting":"floor","stats":{"power":2,"health":10,"lives":3,"size":1},"keywords":{},"text":"Whenever this Naps, add 2 Purr to this floor and gain Fluff 3.","flavor":"Moves only to follow the light. Light moves slowly. So does she.","effects":{"onNap":[{"type":"floorStatus","status":"purr","amount":2,"target":"thisFloor"},{"type":"fluff","amount":3,"target":"self"}]},"upgrade":{"effects":{"onNap":[{"type":"floorStatus","status":"purr","amount":3,"target":"thisFloor"},{"type":"fluff","amount":5,"target":"self"}]},"text":"Whenever this Naps, add 3 Purr to this floor and gain Fluff 5."},"art":{"sprite":"cat_sprawl","palette":"cream"},"unlock":"start"}
{"id":"cuddle_puddle","name":"Cuddle Puddle","type":"unit","clan":"lap","rarity":"uncommon","cost":2,"targeting":"floor","stats":{"power":1,"health":4,"lives":2,"size":1},"keywords":{},"text":"+1 Power and +1 Health for each other Cat on this floor.","flavor":"Nobody knows where one cat ends. Nobody has checked.","aura":[{"stat":"power","amount":{"base":0,"per":"otherCatsOnFloor","mult":1},"target":"self"},{"stat":"health","amount":{"base":0,"per":"otherCatsOnFloor","mult":1},"target":"self"}],"upgrade":{"aura":[{"stat":"power","amount":{"base":0,"per":"otherCatsOnFloor","mult":2},"target":"self"},{"stat":"health","amount":{"base":0,"per":"otherCatsOnFloor","mult":1},"target":"self"}],"text":"+2 Power and +1 Health for each other Cat on this floor."},"art":{"sprite":"cat_pile","palette":"mixed"},"unlock":"start"}
```

### Spells (7)
```json
{"id":"swat","name":"Swat","type":"spell","clan":"neutral","rarity":"basic","cost":1,"targeting":"enemy","keywords":{},"text":"Deal 4 damage.","flavor":"A lesson, delivered at speed.","effects":{"onPlay":[{"type":"damage","amount":4,"kind":"hit","target":"chosenEnemy"}]},"upgrade":{"effects":{"onPlay":[{"type":"damage","amount":6,"kind":"hit","target":"chosenEnemy"}]},"text":"Deal 6 damage."},"unlock":"start"}
{"id":"catnap","name":"Catnap","type":"spell","clan":"neutral","rarity":"basic","cost":1,"targeting":"cat","keywords":{},"text":"A Cat Naps, heals 3 and gains Rested 1 extra.","flavor":"Productivity is a human invention.","effects":{"onPlay":[{"type":"nap","target":"chosenCat"},{"type":"heal","amount":3,"target":"chosenCat"},{"type":"applyStatus","status":"rested","amount":1,"target":"chosenCat"}]},"upgrade":{"effects":{"onPlay":[{"type":"nap","target":"chosenCat"},{"type":"heal","amount":6,"target":"chosenCat"},{"type":"applyStatus","status":"rested","amount":1,"target":"chosenCat"}]},"text":"A Cat Naps, heals 6 and gains Rested 1 extra."},"unlock":"start"}
{"id":"off_the_shelf","name":"Off the Shelf","type":"spell","clan":"alley","rarity":"uncommon","cost":1,"targeting":"enemy","keywords":{},"text":"Knock 2. If it ends in the Cellar, deal 4 damage.","flavor":"It was fragile. That was the appeal.","effects":{"onPlay":[{"type":"knock","amount":2,"target":"chosenEnemy"},{"type":"damage","amount":4,"kind":"hit","target":"chosenEnemy","if":[{"check":"targetFloor","op":"==","value":1}]}]},"upgrade":{"effects":{"onPlay":[{"type":"knock","amount":2,"target":"chosenEnemy"},{"type":"damage","amount":7,"kind":"hit","target":"chosenEnemy","if":[{"check":"targetFloor","op":"==","value":1}]}]},"text":"Knock 2. If it ends in the Cellar, deal 7 damage."},"unlock":"start"}
{"id":"catnip_stash","name":"Catnip Stash","type":"spell","clan":"neutral","rarity":"uncommon","cost":0,"targeting":"none","keywords":{"exhaust":true},"text":"Gain 3 Catnip. Exhaust.","flavor":"Kept in a jar. The jar is not a good hiding place.","effects":{"onPlay":[{"type":"catnip","amount":3}]},"upgrade":{"effects":{"onPlay":[{"type":"catnip","amount":4}]},"text":"Gain 4 Catnip. Exhaust."},"unlock":"start"}
{"id":"cough_it_up","name":"Cough It Up","type":"spell","clan":"shadow","rarity":"common","cost":1,"targeting":"enemy","keywords":{},"text":"Deal 3 damage. Add a Hairball to your hand.","flavor":"Always on the good rug.","effects":{"onPlay":[{"type":"damage","amount":3,"kind":"hit","target":"chosenEnemy"},{"type":"createCard","card":"hairball","amount":1,"to":"hand"}]},"upgrade":{"effects":{"onPlay":[{"type":"damage","amount":5,"kind":"hit","target":"chosenEnemy"},{"type":"createCard","card":"hairball","amount":1,"to":"hand"}]},"text":"Deal 5 damage. Add a Hairball to your hand."},"unlock":"start"}
{"id":"midnight_zoomies","name":"3AM Zoomies","type":"spell","clan":"alley","rarity":"rare","cost":"X","targeting":"none","keywords":{"exhaust":true},"text":"Deal 3 damage to a random enemy X times. Exhaust.","flavor":"Nobody asked. Nobody will sleep.","effects":{"onPlay":[{"type":"damage","amount":3,"kind":"hit","target":"randomEnemy","times":{"base":0,"per":"x","mult":1}}]},"upgrade":{"effects":{"onPlay":[{"type":"damage","amount":4,"kind":"hit","target":"randomEnemy","times":{"base":1,"per":"x","mult":1}}]},"text":"Deal 4 damage to a random enemy X+1 times. Exhaust."},"unlock":"start"}
{"id":"kneading_routine","name":"Kneading Routine","type":"spell","clan":"lap","rarity":"rare","cost":2,"targeting":"none","keywords":{"exhaust":true},"text":"For the rest of this fight, at end of your turn add 1 Purr to every floor. Exhaust.","flavor":"Biscuits are being made. There is no flour.","effects":{"onPlay":[{"type":"passive","trigger":"onTurnEnd","effects":[{"type":"floorStatus","status":"purr","amount":1,"target":"allFloors"}]}]},"upgrade":{"cost":1,"text":"For the rest of this fight, at end of your turn add 1 Purr to every floor. Exhaust."},"unlock":"start"}
```

### Toys (4)
```json
{"id":"cardboard_box","name":"Cardboard Box","type":"toy","clan":"neutral","rarity":"basic","cost":1,"targeting":"floor","keywords":{},"text":"Place a Box on a floor. A Box holds 1 Cat.","flavor":"Much better than the expensive bed.","effects":{"onPlay":[{"type":"box","target":"chosenFloor"}]},"upgrade":{"cost":0,"text":"Place a Box on a floor. A Box holds 1 Cat."},"unlock":"start"}
{"id":"laser_dot","name":"Laser Dot","type":"toy","clan":"yarn","rarity":"uncommon","cost":2,"targeting":"floor","keywords":{},"text":"Start of your turn: Tangle 1 the front enemy on this floor.","flavor":"It cannot be caught. This is the point.","effects":{"onTurnStart":[{"type":"applyStatus","status":"tangled","amount":1,"target":"frontEnemy"}]},"upgrade":{"effects":{"onTurnStart":[{"type":"applyStatus","status":"tangled","amount":1,"target":"allEnemiesOnFloor"}]},"text":"Start of your turn: Tangle 1 every enemy on this floor."},"unlock":"start"}
{"id":"scratching_tower","name":"Scratching Tower","type":"toy","clan":"alley","rarity":"uncommon","cost":2,"targeting":"floor","keywords":{},"text":"Cats on this floor have +1 Power. Cats deployed here gain Pounce 1.","flavor":"The sofa has been informed it is retired.","aura":[{"stat":"power","amount":1,"target":"allCatsOnFloor"}],"effects":{"onCatDeployed":[{"type":"grantKeyword","keyword":"pounce","amount":1,"target":"triggerSource"}]},"upgrade":{"aura":[{"stat":"power","amount":2,"target":"allCatsOnFloor"}],"text":"Cats on this floor have +2 Power. Cats deployed here gain Pounce 1."},"unlock":"start"}
{"id":"heated_cushion","name":"Heated Cushion","type":"toy","clan":"lap","rarity":"rare","cost":2,"targeting":"floor","keywords":{},"text":"End of your turn: add 2 Purr to this floor. Whenever a Cat here Naps, it gains Rested 1 extra.","flavor":"Plugged in. Do not ask who is paying for it.","effects":{"onTurnEnd":[{"type":"floorStatus","status":"purr","amount":2,"target":"thisFloor"}],"onNap":[{"type":"applyStatus","status":"rested","amount":1,"target":"triggerSource"}]},"upgrade":{"effects":{"onTurnEnd":[{"type":"floorStatus","status":"purr","amount":3,"target":"thisFloor"}]},"text":"End of your turn: add 3 Purr to this floor. Whenever a Cat here Naps, it gains Rested 1 extra."},"unlock":"start"}
```

### Champions (2)
```json
{"id":"marmalade","name":"Marmalade, Keeper of Nine","type":"champion","clan":"alley","rarity":"legendary","cost":2,"targeting":"floor","stats":{"power":3,"health":12,"lives":9,"size":1},"keywords":{"innate":true,"retain":true},"text":"Innate. Retain. The third card you play each turn draws 1 card.","flavor":"Has been to the vet eight times and won every argument.","effects":{"onCardPlayed":[{"type":"draw","amount":1,"target":"player","if":[{"check":"cardsPlayedThisTurn","op":"==","value":3}]}]},"upgradeSlots":[{"slot":1,"unlockNight":3,"a":{"name":"Claws Out","patch":{"stats":{"power":5},"text":"Innate. Retain. The third card you play each turn draws 1 card."}},"b":{"name":"Thick Coat","patch":{"stats":{"health":18}}}},{"slot":2,"unlockNight":6,"a":{"name":"Quick Paws","patch":{"keywords":{"pounce":2}}},"b":{"name":"Fluffed Up","patch":{"effects":{"onPlay":[{"type":"fluff","amount":6,"target":"self"}]},"text":"Innate. Retain. Deploy: gain Fluff 6. The third card you play each turn draws 1 card."}}},{"slot":3,"unlockNight":9,"a":{"name":"Ninth Life","patch":{"keywords":{"reborn":true},"text":"Innate. Retain. Reborn. The third card you play each turn draws 1 card."}},"b":{"name":"Big Brain","patch":{"effects":{"onCardPlayed":[{"type":"draw","amount":2,"target":"player","if":[{"check":"cardsPlayedThisTurn","op":"==","value":3}]}]},"text":"Innate. Retain. The third card you play each turn draws 2 cards."}}}],"art":{"sprite":"cat_champion_orange","palette":"orange"},"unlock":"start"}
{"id":"duchess_pudding","name":"Duchess Pudding","type":"champion","clan":"lap","rarity":"legendary","cost":2,"targeting":"floor","stats":{"power":2,"health":14,"lives":9,"size":1},"keywords":{"innate":true,"purr":1},"text":"Innate. Purr 1. Whenever this Naps, heal all Cats on this floor for 3.","flavor":"Has never hurried and has never been late.","effects":{"onNap":[{"type":"heal","amount":3,"target":"allCatsOnFloor"}]},"upgradeSlots":[{"slot":1,"unlockNight":3,"a":{"name":"Plush","patch":{"stats":{"health":20}}},"b":{"name":"Deep Purr","patch":{"keywords":{"purr":2},"text":"Innate. Purr 2. Whenever this Naps, heal all Cats on this floor for 3."}}},{"slot":2,"unlockNight":6,"a":{"name":"Royal Nap","patch":{"effects":{"onNap":[{"type":"heal","amount":5,"target":"allCatsOnFloor"}]},"text":"Innate. Purr 1. Whenever this Naps, heal all Cats on this floor for 5."}},"b":{"name":"Court of Cats","patch":{"aura":[{"stat":"power","amount":1,"target":"otherCatsOnFloor"}],"text":"Innate. Purr 1. Other Cats here have +1 Power. Whenever this Naps, heal all Cats on this floor for 3."}}},{"slot":3,"unlockNight":9,"a":{"name":"Dozing Majesty","patch":{"effects":{"onNap":[{"type":"heal","amount":3,"target":"allCatsOnFloor"},{"type":"applyStatus","status":"rested","amount":1,"target":"otherCatsOnFloor"}]},"text":"Innate. Purr 1. Whenever this Naps, heal all Cats here for 3 and give the others Rested 1."}},"b":{"name":"Heirloom","patch":{"stats":{"lives":12}}}}],"art":{"sprite":"cat_champion_persian","palette":"cream"},"unlock":"meta:clear_act1_lap"}
```

### Curses and junk (3)
```json
{"id":"hairball","name":"Hairball","type":"curse","clan":"curse","rarity":"token","cost":2,"targeting":"enemy","keywords":{"exhaust":true},"junk":"fight","text":"Deal 4 damage. Exhaust.","flavor":"A gift. Do not step on it.","effects":{"onPlay":[{"type":"damage","amount":4,"kind":"hit","target":"chosenEnemy"}]}}
{"id":"vet_appointment","name":"Vet Appointment","type":"curse","clan":"curse","rarity":"curse","cost":null,"targeting":"none","keywords":{"unplayable":true},"junk":"deck","text":"Unplayable. When drawn, you start next turn with 1 less Zoomies.","flavor":"There is a carrier involved. Nobody wants to talk about it.","effects":{"onDrawn":[{"type":"applyStatus","status":"crash","amount":1,"target":"player"}]}}
{"id":"bath_time","name":"Bath Time","type":"curse","clan":"curse","rarity":"curse","cost":null,"targeting":"none","keywords":{"unplayable":true},"junk":"deck","text":"Unplayable. When drawn, a random Cat on the board gets -1 Power for the fight.","flavor":"Betrayal, with warm water.","effects":{"onDrawn":[{"type":"buff","stat":"power","amount":-1,"duration":"fight","target":"randomCat"}]}}
```
Note: the `crash` status in `vet_appointment` is the Catnip Crash with amount 1 meaning -1 Zoomies, no draw penalty, no meter lock. The engine treats `crash` amount as Zoomies penalty and only applies the draw penalty and meter lock from a real Surge.

## 12. Validator rules (for the data loader)
- `id` unique and matches `^[a-z0-9_]+$`. `type` and `rarity` from the enums above.
- `unit` and `champion` require `stats`. `spell` and `toy` must not have `stats`.
- Forbidden keyword pairs: Exhaust+Reborn, Fleeting+Retain, Innate+Fleeting, Unplayable+anything except Retain.
- Every `if.check` and effect `type` and `target` must be in the lists in 9.3. Unknown names throw at load.
- Champion: exactly 3 `upgradeSlots`, `unlockNight` 3, 6, 9.
- `cost: "X"` only on spells. `junk` only on `curse`.
- Text must contain no em dashes (loader regex check).

## Open questions for the lead
1. Floor capacity: I assumed 4 Cat slots and 2 Toy slots per floor. Confirm with the floors agent, since Cuddle Puddle and Boxes are tuned to that.
2. Clan ids (alley, lap, shadow, yarn) are placeholders. Replace with the final clan list and rename `basicUnit` per clan.
3. Champion at 0 Lives is Retired for the rest of the run. Is that too harsh, or should it become a "Ghost Cat" with 1 Life?
4. 3AM Zoomies Turn: the first Cat deployed lands on a random floor. Keep this chaos, or change it to a safer bonus (all Cats gain Pounce 1)?
5. Knock deals 2 Shatter per floor, and Tangled makes an enemy skip its whole turn. Both need balance passes once enemy HP and Warmth totals exist.
