# A02 Combat Rules: The Rulebook for One Battle

Author: A02, Combat Systems Designer. Scope: everything that happens between "battle starts" and "battle ends". Deck and card economy details beyond what combat needs belong to other agents. All numbers here are defaults; encounter and card data may override them where a field says so. Every number is an integer. Division always rounds down.

## 1. Quick facts

| Thing | Value |
|---|---|
| Floors | 3: floor 1 Cellar, floor 2 Parlor, floor 3 Attic. Sunbeam sits above floor 3 |
| Cat Room per floor | 5 (each cat has Size, default 1, Big cats 2) |
| Pest Room per floor | 6 (each pest has Size, default 1, Brutes 2) |
| Room upgrade slots per floor | 2 (Toys, Treats, Boxes) |
| Sunbeam Warmth | start 40, max 40, persists between battles in a run |
| Sunbeam Shade (armor) | 0 at battle start, persists through the battle, cleared at battle end |
| Zoomies (energy) | 3 per turn, no carry over |
| Hand | draw 5 per turn, hand max 10, unplayed cards discarded at End Turn (except Keep) |
| Night Clock | Round 3, 6, 9... are Zoomies Turns (section 13) |
| Cats act | before pests, every round |
| Pests spawn | at the end of a round, in the Cellar by default, and act first on the next round |

Terms: "Cat" is a player unit. "Pest" is an enemy unit. "Unit" is either. "Front" is position 0. "Back" is the highest position.

## 2. The board

Each floor is a horizontal row. Cats stand on the left half, pests on the right half, facing each other across the middle. Position 0 on each side is the slot nearest the middle (the front). Positions count outward: cats 0 at the middle, then 1, 2, 3, 4 toward the left edge. Pests mirror that toward the right edge. The stairs sit at the far right of every floor. Pests arrive and climb at the back (far right).

- Each side of a floor is an ordered list, with no gaps. When a unit leaves, everyone behind it shifts forward one position at once (compaction), immediately after removal.
- A floor's cat list may hold units whose Size sum is at most 5. A floor's pest list may hold Size sum at most 6.
- Room upgrades are attached to the floor, not to a unit, in 2 slots (A, B). They are never targeted by attacks.
- The Sunbeam is not a floor. It has Warmth and Shade only. It cannot hold units.
- Adjacent means neighbors in the same side's list (position p and p+1). Used by Cuddle Pile. Recomputed after every board change, never stored.
- UI note: phone portrait stacks floors vertically with the Attic on top, cats on the left, pests on the right. 5 and 6 slots fit at 44px tokens on a 360px screen.

## 3. Turn structure

A battle is a Setup followed by Rounds numbered 1, 2, 3... Each Round has seven named phases, in this order. The engine exposes `phase` as one of the strings below.

### Setup (once, before Round 1)
1. Shuffle the battle deck with the battle RNG. The Champion is not in the deck.
2. Apply relic `onBattleStart` hooks (tie-break order, section 4).
3. Player places the Champion on any floor at any legal position (default floor 1, back). Champion Size must fit.
4. Spawn Wave 1 (round field 1) into the board (section 8). Intents are chosen and shown.
5. Round counter R = 0. Begin Round 1.

### Phase 1: DRAW
1. R = R + 1. Show the Night Clock.
2. Cat statuses with "start of turn" timing tick (section 5).
3. Gain Zoomies = 3 (Zoomies Turn: 5). Existing Zoomies are replaced, not added, unless a card says otherwise.
4. Fire `onTurnStart` triggers.
5. Draw 5 cards (Zoomies Turn: 7). If the draw pile is empty, shuffle the discard pile into it (battle RNG) and continue. If both are empty, stop drawing. Hand max 10: extra drawn cards are discarded and fire `onDiscard`.

### Phase 2: PLAY
The player may do any of the following, in any order, any number of times, until they press End Turn:
- Play a card by paying its cost. Resolution is immediate and complete (all effects, then all queued triggers) before the next input.
- Use a Champion or room ability if it has one (cost and limit stated on the ability).
- Rearrange nothing. Cats cannot be moved by the player once placed (only by card effects).
Pests do not act in this phase. Intents are visible and recomputed after every change.

### Phase 3: END TURN
1. Fire `onTurnEnd` triggers (cats, rooms, relics, tie-break order).
2. Discard the whole hand except cards with Keep. Cards with Exhaust that were played are already in the exhaust pile.
3. Unspent Zoomies vanish.
4. Phase locks: no more player input until the next Phase 2.

### Phase 4: CAT ATTACKS
Floors resolve in order 1, 2, 3. Within a floor, cats resolve front to back (position 0 first). Each cat with Attack greater than 0 performs its attack spec (section 11) if a legal target exists. A cat that made no attack because it had no legal target fires `onIdle` once at the end of this phase. Cats with Attack 0 never fire `onIdle`.
- Removal is immediate: if an attack kills a pest, it leaves the board and the pests behind it compact at once, so later cats see the new front.
- After the last floor, cat statuses with "end of cat phase" timing tick.

### Phase 5: PEST ATTACKS
1. Upkeep: every pest in floor order 1 to 3, front to back, takes its damage-over-time (Itch, section 5) and loses a stack. Dead pests are removed before anyone acts.
2. Floors resolve 1, 2, 3. Within a floor, pests resolve front to back. Each pest performs its current intent (section 9). Attacks need a legal target; if none exist the pest does nothing and its pattern index does not advance (it will show the Stairs intent).
3. After a pest acts, its next intent is chosen immediately, so the new intent is visible during the next Play phase.
4. A pest that was Dazed skips its action instead, loses one Dazed stack, and does not advance its pattern.

### Phase 6: PEST ADVANCE
Floors resolve from the top down: 3 (nothing to climb to), then 2, then 1. Within a floor, pests resolve front to back. A pest climbs from floor f to f+1 if all hold:
- f is 1 or 2.
- It is not Dazed or Frozen (section 5).
- Climb condition: floor f has no cats, or the pest has the Climber trait.
- The destination floor f+1 has pest Room for its Size at that moment.
Climbing pests are appended to the back of the destination pest list, keeping their relative order. Because floors resolve top down, a floor that fully emptied upward has room for the pests behind it. If room is missing the pest stays, intent unchanged.

### Phase 7: SPAWN
1. Retry the Garden queue (section 8) in FIFO order.
2. Spawn every wave whose `round` equals R + 1 (so the player sees next round's arrivals before they act).
3. Fire `onSpawn` triggers.
4. Check the win condition (section 15). If not won, the next Round begins at Phase 1.

## 4. Resolution order and tie-breaks

All effects use one FIFO trigger queue. A card or action resolves its own effects in printed order, then the queue drains in order, and newly queued triggers go to the end. The queue must be empty before the next input or the next unit acts.

When two or more triggers are queued by the same event, order them by this strict priority:
1. Relics, in the order acquired.
2. Room upgrades: floor 1 slot A, floor 1 slot B, floor 2 A, floor 2 B, floor 3 A, floor 3 B.
3. Cats: floor 1 to 3, then front to back.
4. Pests: floor 1 to 3, then front to back.
5. Final tie (the same unit with two triggers): the order the effects are printed on the card, then keyword order: Rested, Purr, Thorns, Lives.

Simultaneous damage (Sweep, Yowl, Each-floor attacks): every target is damaged first, in tie-break order. Units at 0 HP or less are then marked Dead together and removed together, and their `onDeath` triggers queue in the tie-break order above. A unit marked Dead no longer acts or counts as a target, but still receives damage from the remainder of the same simultaneous effect.

Overkill damage is lost. It never carries to the next unit unless the attack has Pierce Through (data flag `overflow: true`, reserved for rare cards).

## 5. Damage, armor, lives, statuses

Damage on one hit:
1. `raw = base + sum of flat bonuses (Strength style, card bonuses)`.
2. `mult = product of multipliers`. Default sources: attacker Dull (x0.75), target Spooked (x1.5). Multiply once, round down. Minimum result 0.
3. If the target has Armor, `absorbed = min(Armor, damage)`. Armor loses that much. Remaining damage hits HP. Pierce skips this step.
4. Thorns: if the target has Thorns N and the hit came from a melee attack spec, the attacker takes N after the hit, ignoring armor. Thorns cannot trigger Thorns.
5. Fire `onDamaged` if HP lost, `onArmorBroken` if Armor went to 0 this hit.

Armor (displayed as Fluff on cats, Hide on pests) persists until the end of the battle. It does not decay. Healing never exceeds max HP. Shade is Sunbeam armor with the same rules.

Lives (the Nine Lives twist, combat part). A cat's `livesLeft` starts at the card's Lives value. When a cat reaches 0 HP:
- `livesLeft = livesLeft - 1`.
- If `livesLeft` is still 1 or more: the cat leaves the board and its card goes to the discard pile with its current `livesLeft`. Its stats reset to the card's printed stats plus permanent upgrades the next time it is played. Fire `onLifeSpent`.
- If `livesLeft` is now 0: the card is exhausted for the rest of the battle and fires `onFinalDeath`. It returns to the run deck after the battle (the run-long consequence is open question 1).
- Tokens and summoned copies have Lives 1: they simply die.
Pests have no lives. At 0 HP they are removed and fire `onDeath`.

Status timing defaults (other agents may add statuses, but they must declare one of these timings):
| Status | On | Effect | Ticks |
|---|---|---|---|
| Itch N | pest | at Phase 5 upkeep take N damage, ignoring armor, then N = N - 1 | Phase 5 |
| Spooked N | any | takes x1.5 damage | loses 1 at end of its owner's next action |
| Dull N | any | deals x0.75 damage | loses 1 at end of its owner's next action |
| Dazed N | pest | skips its next action and next climb | loses 1 when it skips an action |
| Frozen | pest | cannot climb (still acts) | loses 1 at Phase 6 end |
| Hidden | cat | not selectable by pest target picks (section 6) | removed at the next Phase 4 start |
| Rested N | cat | defined by the Nap agent, grants bonus at Phase 4 | defined there |

## 6. Targeting

Every attack has a target spec: `floors` and `pick`.

Default pest attack: floors "own", pick "front". The pest attacks the cat at position 0 of its own floor.

Pick values and their exact rules (the candidate list is always the legal units on the chosen floors, in floor order then position order):
| pick | Selects |
|---|---|
| front | candidate at position 0 of the floor |
| back | candidate at the highest position of the floor |
| all | every candidate on the floor |
| random | one candidate, chosen with the battle RNG (section 16) |
| weakest | lowest current HP, ties to the front-most |
| strongest | highest Attack, ties to the front-most |

Modifiers on the candidate list, applied before picking:
- Hidden cats are removed from the list, unless that would leave it empty, in which case they are restored. Pick "all" ignores Hidden.
- Decoy: if any cat on the floor has Decoy, front, random, weakest and strongest picks are limited to Decoy cats. Pick "all" ignores Decoy.
- A Dead unit is never a candidate.

Retargeting: a multi-hit attack picks its target again for every hit. If the chosen target died, the next hit picks again from the updated list. If no legal target remains, the remaining hits are lost.

Sunbeam targeting: only pests on floor 3 can hit the Sunbeam, and only if floor 3 has no cat candidates (counting Hidden cats as present). The Sneaky trait lets a floor 3 pest hit the Sunbeam directly even when cats are present, in addition to its normal attack.

Cat targeting: cats target only pests. Pests in the Garden queue are never targetable. Cats may be given range (section 11).

## 7. Empty floors

- No cats on floor f: pests on f cannot attack (unless their spec reaches elsewhere), they show the Stairs intent, and they climb during Phase 6. On floor 3, they attack the Sunbeam instead.
- No pests on floor f: cats there do not attack (they fire `onIdle`), unless their spec has range. Rooms on that floor still work. Cats on an empty-of-pests floor are safe.
- No cats on any floor: pests walk to the Attic and then hit the Sunbeam each round.
- Nothing in the rules makes a cat leave its floor on its own.

## 8. Waves and spawning

An encounter owns a `waves` list. Each wave: `{round, spawns}`. `round` is the Round in which the wave first acts (it is on the board and visible at the start of that round's Draw). Wave 1 always has `round: 1` and is spawned in Setup. A wave with `round: N` is spawned in the Spawn phase of Round N minus 1.

Each entry in `spawns` is `{id, floor, at}`:
- `floor` default 1. Elites and bosses may spawn on 2 or 3 ("through the window").
- `at` is "back" (default) or "front". Entries are placed in list order.
- A spawn that does not fit the pest Room of that floor goes to the Garden queue (FIFO, one queue per floor). It is retried first on each Spawn phase. Queued pests count as alive for the win check but cannot be targeted.
- Spawn does not trigger Phase 5 for that pest early. Spawned pests first act in the next Phase 5. Pests spawned during Setup act in Round 1.
- Spawned pests start with `intentIndex = 0` and their first intent is shown immediately.

Summoned pests (a pest ability that adds pests) use the same placement rules and arrive with Dazed 1 so they do not act on the round they appear.

Impatience (anti-stall): from Round 16, every pest gains +1 Attack at each Phase 7. Encounters that expect long fights may set `impatienceRound`.

## 9. Intents

A pest's intent is the exact action it will take in the next Phase 5. It is chosen at spawn and right after each action.

Patterns (declared in pest data):
- `cycle`: array of actions, taken in order, repeating. Index advances only when an action is taken.
- `weighted`: array of `{w, action}`, chosen with the battle RNG at selection time (so it is fixed before the player acts).
- `conditional`: ordered list of `{if, action}` tested at selection time, first match wins (for example `hpBelowHalf`, `floorHasNoCats`, `roundAtLeast`). The test uses the board at selection time.

Action kinds shown as icons with a number:
| Icon | Meaning | Number shown |
|---|---|---|
| Claw | attack | final damage per hit after current Dull/Spooked/Strength, and `xN` for hits |
| Claw with floor marker | hits cat on the shown pick (front, back, weakest, all) | same |
| Shield | gain Hide | amount |
| Up arrow | buff self or allies | amount |
| Down arrow | debuff cats | amount |
| Egg | summon pests | count |
| Stairs | no legal target, will climb | none |
| Zzz | Dazed or Frozen | stacks |
| Sunbeam | will hit the Sunbeam | final damage |
| Eye with a question mark | hidden intent (some bosses until `peek`) | none |

Display rules: the intent number is recomputed after every board change. The cat that will be hit gets a red outline that moves live. Each floor shows a badge with the total incoming damage to cats on that floor, and the Sunbeam shows a badge with total incoming Sunbeam damage, both assuming no pest dies and counting Armor as not applied (the badge shows armor separately as `-A`). Intent never lies: if the displayed target would change because of a card played, the display updates before the player ends the turn.

## 10. Climbing and the Sunbeam

- Default: a pest holds its floor while any cat (Hidden or not) stands on that floor. This is the Hold rule. Cats are walls.
- Climber trait ignores the Hold rule and climbs every round if room exists. A Climber on a floor with cats still attacks first (Phase 5) and then climbs (Phase 6).
- Pest timeline with no cats: Spawn in the Cellar at the end of Round N. Round N+1 Phase 5: no target, nothing. Round N+1 Phase 6: climbs to the Parlor. Round N+2 Phase 6: climbs to the Attic. Round N+3 Phase 5: hits the Sunbeam. So an unopposed pest reaches the Sunbeam 3 rounds after it appears.
- Pests spawned on the Attic hit the Sunbeam at the first Phase 5 if the Attic has no cats.
- A pest that hits the Sunbeam does not die or leave. It hits every round until killed.

Sunbeam damage: damage hits Shade first (like Armor), then Warmth. `onSunbeamHit` fires with the amount. Sunbeam Thorns (relic or card, default 0): when a pest damages the Sunbeam, that pest takes Thorns damage.

Sunbeam Defense cards and relics: `+N Shade` (added at once, persists), `Sunbeam Warm N` (heal Warmth, capped at 40 unless max-Warmth is raised), and Window Seat (a Room upgrade on floor 3: `+2 Shade at the start of each Phase 1`). Shade resets to 0 at battle end.

## 11. Multi-floor attacks and attack specs

Attack spec (data object): `{hits, floors, pick, dmg, flags}`. Default `{hits:1, floors:"own", pick:"front"}`.

`floors` values:
| Value | Meaning |
|---|---|
| own | the unit's own floor only |
| reach | the nearest floor that has at least one legal target, starting with own, then the floor below, then the floor above (ties go to lower floor). Floors further than 1 away are not reachable |
| each | every floor, resolved bottom to top, with `pick` applied independently on each floor |
| up, down | only the floor above or below |
| [n, m] | a listed set of floor numbers, resolved in ascending order |

Resolution of a multi-target attack: floors in ascending order; within a floor, targets by the pick rule. Each target gets the full damage (no splitting). All damage is applied first, deaths and compaction after (section 4).

Hits are sequential. For `hits > 1`, each hit resolves in full, including death removal, before the next hit picks a target. `each` plus `hits: 2` means hit 1 on every floor, then hit 2 on every floor.

Named patterns used by cards:
- Swipe: default.
- Sweep: `pick:"all"` on own floor.
- Pounce: `floors:"reach"`.
- Yowl: `floors:"each", pick:"all"`.
- Spray: `floors:"each", pick:"front"`.

## 12. Summoning

- Playing a Cat card: the player chooses a floor and a position index from 0 to current count (insert between units, front, or back). On a phone, tap a floor, then tap a gap. A one-tap default places the cat at the back.
- Legal if the floor's cat Room has space for the Size. If not, the card cannot be played (UI greys the floor).
- Effects that summon (tokens, copies): the effect names a floor and a position (default: same floor as the source, back). If the floor is full the summon fails silently, the effect continues, and a "No room" toast appears. Failed summons are not retried.
- A new cat has no Summoning Sickness. It acts in the coming Phase 4, even the turn it was played.
- `onSummon` fires after the cat is placed. Rooms such as a Box act on the unit at this moment.
- Summon never pushes existing units. Only a card with "Shove" can make room by pushing a cat of its choice to the back of the same floor.
- Cats cannot be summoned into the Garden queue or onto the Sunbeam.
- Spells target by their text. A spell that needs a floor lets the player pick one; "random floor" uses the battle RNG over floors 1 to 3.

## 13. Pushing pests down (Knock It Off)

Rule: Knock moves a pest from floor f to floor f - 1.
1. The destination must have pest Room for the Size. If not, the push fails and does nothing (no Shatter damage, no Dazed).
2. The pest is removed from f (compaction) and appended to the back of the floor f - 1 pest list.
3. Shatter: the pushed pest takes the card's Shatter damage (a flat number on the card, default 3). Shatter ignores Hide.
4. The pushed pest gains Dazed 1 (skips its next action and its next climb).
5. `onPush` fires, then `onDamaged` and `onDeath` if applicable.
6. Pushing from floor 1 means "out the cat flap": the pest leaves the board, takes Shatter damage first (if it survives), and goes to the front of the Garden queue for floor 1. It re-enters at the next Phase 7 Spawn, before waves, with Dazed 1. If it dies from Shatter it simply dies.
7. Pests with the Heavy trait (vacuum, bath) ignore pushes entirely. Pests with Slippery take double Shatter and are not Dazed.
8. A multi-target push (for example "push all pests on a floor") resolves front to back, each landing at the back of the lower floor, so their relative order is kept. If the lower floor fills up, the remaining pests do not move.

Pushing up is not supported in the base rules. Pulling a pest up would hurt the player.

## 14. The Night Clock and Zoomies Turns

Module flag `rules.nightClock` (default true). The clock shows R mod 3. When R mod 3 is 0 it is a Zoomies Turn ("3AM"). Cost to implement: three small changes.
- Phase 1: Zoomies = 5 instead of 3, draw 7 instead of 5.
- Phase 4 Scramble: every cat with Attack greater than 0 gets +1 Attack this round and ignores its own `floors` and `pick`: it attacks one pest chosen at random with the battle RNG from all pests on the board (floor order, then position order, count n). If n is 1, no random number is drawn. Cats with `hits > 1` re-pick each hit.
- Phase 5 and 6 are unchanged. Pests are not scrambled.
The clock is displayed in the corner (moon icon with three pips, one lit per round). `onZoomies` fires at the start of Phase 1 for relics. Alternate Zoomies variants (Zoomies cards, Catnip surge) hook `isZoomiesTurn` in the engine; they are defined by other agents.

Other twists, minimal combat hooks:
- Nap: Rested is gained by cats that fired `onIdle`. Nap agent defines the bonus.
- Box (Room upgrade): a cat summoned onto this floor gains Hidden until the next Phase 4 start, once per Box per round.
- Cuddle Pile: uses adjacency (section 2). Bonuses read from the current board each time a stat is displayed or used, never cached.
- Purr: a Purr N cat at Phase 3 heals every cat on its floor for N. Cannot overheal.
- Hairballs, Yarn, Catnip: ordinary triggers on the queue. No special phase.

## 15. Win and loss

- Loss: Warmth is 0 or less at any moment. The battle ends at once, before any queued triggers (except ones already marked "on lose" by relics). Run over unless a revive relic fires.
- Win: all of these are true, checked after every trigger queue drains and again at the end of each phase: every wave in the encounter has been spawned, the Garden queues are empty, and no pest is on the board. The battle ends at once, even in the middle of a phase, even if cats still have attacks left.
- Both at once: loss wins. Example: a pest that reduces Warmth to 0 and dies of Thorns on the same event is a loss.
- After a win: Shade resets to 0; cats' battle state is cleared; Warmth is kept; reward step begins.
- Boss encounters may add a `winIf` rule (for example "boss dead") that replaces the standard win test. Remaining pests then vanish.
- There is no Round cap. Impatience (section 8) is the anti-stall.

## 16. Randomness

One seeded battle RNG, created at Setup from `runSeed + nodeId`. Use mulberry32. Output `r` in [0, 1). Choice among n candidates is `floor(r * n)` into the candidate list in floor order then position order. Draw only when n is 2 or more. Order of consumers in a round: shuffles at the moment they happen, then random picks in the order the effects resolve. A given seed and input sequence must always give the same battle. Never call Math.random in combat.

## 17. Data shapes (reference)

```js
// Pest
{ id:'rat', name:'Alley Rat', hp:8, size:1, traits:[], pattern:{ type:'cycle',
  actions:[ {kind:'attack', dmg:3, hits:1, floors:'own', pick:'front', label:'Bite'},
            {kind:'attack', dmg:5, hits:1, floors:'own', pick:'front', label:'Gnaw'} ] } }
// Cat unit part of a card
{ id:'alley_tabby', hp:5, attack:3, lives:2, size:1, spec:{hits:1, floors:'own', pick:'front'}, keywords:[] }
// Wave
{ round:2, spawns:[ {id:'rat'}, {id:'squirrel'} ] }
// Encounter
{ id:'n1_garden', waves:[...], impatienceRound:16, winIf:null }
// Push effect
{ op:'push', target:{who:'pest', floor:'chosen', pick:'front'}, shatter:3 }
```

Required traits: Climber, Heavy, Slippery, Sneaky. Required unit flags: Decoy, Keep (cards), Exhaust (cards), Hidden (status).

## 18. Worked example: Night 1, three rounds

Example cards (illustrative numbers, not balance):
- Biscuit (Champion cat): HP 14, Attack 4, Lives 3, Size 1.
- Alley Tabby (cost 1): HP 5, Attack 3, Lives 2.
- Loaf (cost 1): HP 7, Attack 0, Lives 2, Decoy.
- Hiss (spell, cost 1): deal 5 damage to one chosen pest.
- Knock It Off (spell, cost 1): push the front pest of a chosen floor, Shatter 3.
- Fluff Up (spell, cost 1): a chosen cat gains 5 Armor.
Example pests: Mouse HP 4, cycle [Nibble 2]. Rat HP 8, cycle [Bite 3, Gnaw 5]. Squirrel HP 6, Climber, cycle [Scratch 3].
Waves: R1 Rat(R1), Mouse(M1), Mouse(M2). R2 Rat(R2), Squirrel(S1). R3 Mouse(M3), Mouse(M4). R4 Mouse(M5), Mouse(M6).
Start: Warmth 40, Shade 0. Zoomies 3 (5 on round 3).

### Setup
Biscuit placed on the Cellar. Wave 1 spawns in the Cellar: pests list [R1 8/8, M1 4/4, M2 4/4]. Intents: R1 Bite 3, M1 Nibble 2, M2 Nibble 2, all on the front cat, Biscuit.

### Round 1 (Clock 1)
- Draw: hand Alley Tabby, Alley Tabby, Loaf, Hiss, Knock It Off. Zoomies 3.
- Play: Alley Tabby to Cellar back (cats: Biscuit, Tabby-A). Loaf to Cellar front (cats: Loaf-A, Biscuit, Tabby-A). Intents now all point at Loaf-A. Hiss on R1: 8 - 5 = 3. Zoomies 0.
- End Turn: Tabby and Knock It Off discarded.
- Cat Attacks, floor 1, front to back: Loaf-A has Attack 0, no attack. Biscuit hits front pest R1: 4 damage, R1 had 3, dies (1 overkill lost). Pests compact: [M1, M2]. Tabby-A hits M1: 3 damage, M1 4 to 1. Floors 2 and 3 empty.
- Pest Attacks: M1 Nibble 2 on Loaf-A: 7 to 5. M2 Nibble 2 on Loaf-A: 5 to 3.
- Pest Advance: floor 1 has cats and no pest is a Climber, nobody climbs.
- Spawn: wave round 2 spawns at the back: Cellar pests [M1 1/4, M2 4/4, R2 8/8, S1 6/6].

### Round 2 (Clock 2)
- Draw: hand Alley Tabby, Alley Tabby, Loaf, Hiss, Knock It Off. Zoomies 3. Intents: M1 2, M2 2, R2 Bite 3, S1 Scratch 3, all on Loaf-A (3 HP, so Loaf-A would die: 10 incoming).
- Play: Loaf to Cellar front (Loaf-B). Cats: Loaf-B 7/7, Loaf-A 3/7, Biscuit, Tabby-A. Alley Tabby to Parlor (Tabby-B). Hiss on M2: 4 HP, dies. Pests compact: [M1 1/4, R2 8/8, S1 6/6]. Zoomies 0.
- Cat Attacks: floor 1: Loaf-B and Loaf-A nothing. Biscuit hits M1 (1 HP), dies. Tabby-A hits R2: 8 to 5. Floor 2: Tabby-B has no pest on floor 2, no attack. Floor 3: empty. At phase end Tabby-B fires `onIdle` (Rested per Nap rules).
- Pest Attacks: R2 (now front) Bite 3 on Loaf-B: 7 to 4. S1 Scratch 3 on Loaf-B: 4 to 1.
- Pest Advance, floors top down: floor 2 and 3 empty. Floor 1: R2 held (cats present). S1 is a Climber, floor 2 has pest Room, so S1 climbs to the Parlor, position 0.
- Spawn: round 3 wave: Cellar pests [R2 5/8, M3 4/4, M4 4/4].

### Round 3 (Clock 3, Zoomies Turn)
- Draw: Zoomies 5, draw 7: Fluff Up, Knock It Off, Loaf, Hiss, Hiss, Alley Tabby, Alley Tabby. Board: Cellar cats [Loaf-B 1/7, Loaf-A 3/7, Biscuit 14/14, Tabby-A 5/5]. Parlor cats [Tabby-B 5/5], Parlor pests [S1 6/6]. Intents: R2 Gnaw 5, M3 Nibble 2, M4 Nibble 2 on Loaf-B (1 HP), S1 Scratch 3 on Tabby-B.
- Play: Knock It Off on the Parlor: S1 is pushed to floor 1, appended to the back: Cellar pests [R2, M3, M4, S1]. Shatter 3: S1 6 to 3, and S1 gains Dazed 1 (its intent shows Zzz). Fluff Up on Loaf-B: Armor 5. Loaf to the Parlor front (Loaf-C). Two Zoomies are left unspent and are lost at End Turn (hand holds Hiss x2, Tabby x2 by choice).
- Cat Attacks, Scramble (+1 Attack, random targets): attackers in order are Biscuit (5), Tabby-A (4), Tabby-B (4). Loaf cats have Attack 0 and do nothing. Pest list in floor order: [R2 5/8, M3 4/4, M4 4/4, S1 3/6].
  - Biscuit: n = 4, r = 0.62, index floor(2.48) = 2, M4 takes 5, dies. List compacts [R2, M3, S1].
  - Tabby-A: n = 3, r = 0.31, index 0, R2 takes 4, 5 to 1.
  - Tabby-B: n = 3, r = 0.40, index 1, M3 takes 4, dies. List [R2 1/8, S1 3/6].
- Pest Attacks: upkeep: no Itch. R2 Gnaw 5 on Loaf-B: Armor 5 absorbs all, Armor 0, HP stays 1. S1 is Dazed: skips, Dazed removed. R2's intent returns to Bite 3.
- Pest Advance: R2 held by cats. S1 skips its climb this round because of the Dazed it used, even though it is a Climber.
- Spawn: round 4 wave: Cellar pests [R2 1/8, S1 3/6, M5 4/4, M6 4/4].
- Result after 3 rounds: Warmth 40, Shade 0, no cat lost a life, 5 pests killed.

### Sunbeam sidebar (not in the run above)
If the Attic had no cats and a Squirrel stood there with Scratch 3, Shade 2: it deals 3. Shade 2 absorbs 2, Shade 0, 1 reaches Warmth: 40 to 39. If instead Shade was 0, Warmth 40 to 37. The Squirrel stays and hits again next round.

## Open questions for the lead

1. Lives persistence: this file treats `livesLeft` as battle-scoped and returns a final-dead card to the deck after the battle. Should lives lost be run-long (restore only at Rest Nooks or by relics)? That makes the twist much more dangerous and needs an economy.
2. Hold rule: pests are stopped by any cat on their floor (Monster Train style). Is that wanted, or should every pest climb every round regardless of cats, with cats only soaking damage?
3. Room sizes: 5 cat and 6 pest slots per floor. Do we want to shrink to 4 and 5 for easier phone layout?
4. Cats acting before pests every round is generous. Keep it and pay for it in pest stats, or let some pests (Sneaky or Ambush) act in Phase 4?
5. Zoomies Scramble is optional and random. Keep it on by default, or ship it as a difficulty or relic variant?
