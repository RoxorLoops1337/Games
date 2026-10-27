# A05: Twist Mechanics (locked rules)

Author: A05, Twist Mechanics Designer. All numbers are first-pass tuning values. All text is final wording unless marked TUNE.

## 0. Verdict summary

| Twist | Verdict | Tier | One-line pitch |
|---|---|---|---|
| NINE LIVES | LOCK, rewritten | CORE | Dying costs a permanent life, not the card. Lives are the run's real currency of risk. |
| KNOCK IT OFF | LOCK, tightened | CORE | Push enemies down a floor for delay and Shatter damage. |
| NAP | LOCK, made a toggle | CORE | Cats can sleep instead of fighting and wake up as a pounce. |
| 3AM ZOOMIES (Night Clock) | LOCK, simplified | CORE | Every 3rd turn is a burst turn with free random hits and a hangover. |
| BOXES | LOCK, one box per floor | CLAN | Sit in it. Hidden for a turn, small bonus, but hidden cats do not block. |
| CUDDLE PILE | LOCK, needs slot row | CLAN | Neighbouring cats buff each other. Lose the middle cat and it falls apart. |
| CATNIP SURGE | LOCK, global meter | CLAN | Fill a meter, burst for two turns, then crash into a forced nap. |

Rejected or parked here: none rejected. YARN, HAIRBALLS and PURR are other agents' jobs. Where my rules touch them I say so in section 9.

## 1. Shared vocabulary (glossary a coder can implement as keyword flags)

Assumptions I rely on (flagged in Open Questions): each floor has a row of 5 cat slots, left to right. Combat order each round: your cats strike (unless Napping), then enemies act (attack the cat in front, or climb a floor if the floor has no blocker). Cats may carry tags `Kitten` (small) and `Large`.

| Keyword | Exact meaning |
|---|---|
| Lives | A per-card run-long counter on every Cat card, 1 to 9. Shown as paw pips. |
| Lose a Life | Lives -1 and the cat is removed from the board. See 2.2. |
| Spend a Life X | Voluntary cost. Lives -1 and the cat STAYS on the board. Cannot be paid with a cat's last life. |
| Cornered | Automatic state when a cat has exactly 1 Life left (and max Lives is 2 or more): +2 Attack, red glow. |
| Landing | When this cat loses a Life it returns to your HAND instead of the discard pile, and costs 1 less (min 0) the next time it is played this battle. |
| Last Gasp | Trigger on the board position where the cat lost a Life. |
| Knock N | Push the target enemy down N floors. See 3. |
| Shatter | Damage type from falling or breaking. Ignores Armor and Thick Fur type reductions. Cannot be Weakened. |
| Box / Boxed / Hidden | See 4. |
| Nap / Napping / Rested N / Wake / Pounce | See 5. |
| Pile / Pile size P | See 6. |
| Nip (meter) / Surge / Crash | See 7. |
| Night phase | Dusk, Prowl, or 3AM. See 8. |
| Zoom / Frazzled | See 8. |

## 2. NINE LIVES

### 2.1 Core rules
1. Every Cat card has `lives` (current) and `maxLives`. Cards in the deck keep these values for the whole run. Spells and Treats have no lives.
2. Default maxLives by cat type: Kitten tag 2, standard Cat 3, Large tag 4, Rare Cat 3 (rarity buys power, not lives), Champion 9.
3. Hard cap 9 for any cat. Lives never go above maxLives except through an upgrade that raises maxLives.
4. Battle HP is separate and refills every fight. Lives are the only per-cat damage that persists between fights.
5. A cat on the board at the end of a won battle keeps its lives. A cat that never died costs nothing.

### 2.2 Death resolution (exact order)
1. A cat's Health reaches 0. It is removed from its slot and the row closes up only if the slot rule in section 6 says so (it does not; the slot stays empty).
2. If `lives >= 2`: `lives -= 1`. Fire `onLifeLost` (Last Gasp effects run at the old slot). The card goes to the DISCARD pile, or the HAND if it has Landing. Pip animation plays.
3. If `lives == 1` (the last one): fire `onLastLifeLost`. If the player has Spare Lives (2.4) a prompt appears: "Spend a Spare Life? The cat returns to your discard pile with 1 Life." Default button is Yes. If No or no Spare Lives: the card is removed from the deck for the run and replaced by an Empty Collar (below). Last Gasp still fires.
4. Cats removed by Exhaust, Sacrifice or "Banish" effects do NOT lose lives. Only damage-based death does, plus "Lose a Life" effects.
5. Enemy trait `Costly`: if this enemy's attack kills a cat, the cat loses 2 lives instead of 1 (if it has 2 or fewer, it is lost). Used sparingly on elites and bosses.

Empty Collar (token card, goes to the deck permanently): Cost 0, Exhaust. "Gain 1 Energy." Flavor: "It fits. The cat does not say goodbye. It never does." It cannot be upgraded. It can be removed at the Scratching Post shop like any card. This exists so a doomed cat is never a free deck thin.

### 2.3 Champion
The Champion has 9 Lives. When its last life goes, it takes "The Long Nap": it is out of your deck until the start of the next Act, when it returns with 3 Lives. It is never destroyed. This keeps a bad fight from ending a run while still hurting.

### 2.4 Shared pool: the Spare Lives Jar (decision: yes, but small and optional)
There is NO shared pool that cats draw from by default. Per-cat lives are the main system. On top sits one run-long counter called the Spare Lives Jar (0 to 9, starts at 0). It is the "traded and boosted" resource the brief wants.
- Gain Jar lives from: relics, events (the Fishmonger, the Crying Kitten), boss rewards (1 each), a Rest Nook option (2.6).
- Spend: only on the last-life prompt above, or at certain events ("Trade 2 Spare Lives for a rare card").
- A Spare Life keeps the dying cat alive with 1 Life, not full.
- Jar is shown as a milk jug icon with a number at top of the map and battle HUD.

### 2.5 Lives and the "stronger or weaker" rule
- Weaker: none by default. Lives only matter when spent. Fewer lives means closer to losing the card.
- Stronger: Cornered (+2 Attack at exactly 1 life). This makes a hurt veteran a threat and tempts you to leave it be.

### 2.6 Sources and sinks of lives (for shop, rest and event agents)
| Where | Effect | Cost |
|---|---|---|
| Start of each Act | Every cat gains +1 Life (capped at max) | free |
| Rest Nook, option "Lick Wounds" | +1 Life to up to 3 cats | the Nook choice |
| Rest Nook, option "Deep Sleep" | +2 Lives to one cat, or +1 Spare Life | the Nook choice |
| Shop: Tuna Tin | +1 Life to one cat | 70 gold TUNE |
| Shop: Whole Salmon | +1 Life to all cats | 160 gold TUNE |
| Scratching Post upgrade "Plush" | +1 maxLives and +1 Lives | the upgrade choice |
| Card effects | "Spend a Life", "Gain a Life" | card cost |
| Enemy trait Costly, event "Dog Park" | lose lives | risk |

### 2.7 UI needs
- Card face: a row of paw pips at the bottom edge. Filled = remaining, hollow = missing. Up to 5 pips drawn as pips; 6 to 9 collapse to a single paw plus a number ("7").
- Unit on board: small pip row just above the Health number. On life loss: one pip pops off, the cat does a mid-air flip and a paw print floats to the discard icon. Cornered units get a pulsing red outline and a tiny "!" badge.
- Deck viewer: shows `lives/maxLives` on every cat, sorted with a "Most hurt" filter. Scarred cats get a small bandage sprite.
- Last-life prompt: modal with the cat, "Spend a Spare Life" and "Let it go" buttons.
- Map screen: the Spare Lives Jar, and a "Cats at 1 Life" counter that opens the deck viewer filtered.
- Accessibility: pips are shapes (paw outline vs filled), never colour only.

### 2.8 Sample cards and relics (6)
| Name | Type | Cost | Text | Flavor |
|---|---|---|---|---|
| Alley Gambler | Cat 3/3, Lives 3 | 1 | Last Gasp: deal 4 damage to the enemy in front of this slot. | "Always bets on landing. Always has." |
| Land on Feet | Spell | 1 | Give a cat Landing this battle. Draw 1. | "Physics is a suggestion." |
| Borrowed Time | Spell | 0 | Spend 1 Life of a cat on the board. Draw 2, gain 1 Energy. Exhaust. | "The cat will pay you back. Eventually." |
| Bramble the Reckless | Cat 6/5, Lives 2 (Rare) | 4 | Each time Bramble loses a Life, he permanently gains +1 Attack for the run. | "Has never once looked first." |
| Tuna Tin of Plenty | Relic | n/a | Start with 2 Spare Lives in the Jar. Whenever you gain a Spare Life, heal 3 Sunbeam Warmth. | "Do not ask what is in it." |
| Cracked Bell | Relic | n/a | Whenever a cat loses a Life, gain 1 Energy next turn (max 2 per turn). | "It rings when something goes wrong. Which is often." |

### 2.9 Anti-synergy and risk
- Lives never refill fast. A deck of 3-life cats can lose about 25 lives in a run if you play recklessly; sources above give about 12 back. Net cost is real.
- Cornered pushes you to keep a weak cat in play, where it is one hit from deletion.
- Landing returns a cat to hand but still spends the life, so it is tempo, not safety.
- Costly enemies and Hairball-type debuffs can hit lives directly.

### 2.10 Failure cases to watch
1. Life farming: a deck of Last Gasp cats that deliberately die to chain value. Counter: death effects trigger only on lives lost, lives are scarce, and Act start refill is +1 only.
2. Feel-bad spiral: a lost starter cat in Act 1 hurts. Counter: Empty Collar softens, Spare Lives Jar is gifted early (Tuna Tin relic in the first event pool).
3. UI overload with 30 cats at 3 pips each. Counter: pips shown on the board only for cats in play and in the deck viewer, not in hand unless hovered or at 1 life.

## 3. KNOCK IT OFF

### 3.1 Rules
1. `Knock N` on a cat's Strike or a spell: choose a target enemy (for Strike, the enemy it attacks). It moves down N floors, stopping at the Cellar.
2. The enemy takes 2 Shatter per floor actually fallen. It lands in the next free slot at the end of the row on that floor, and is Dazed: it cannot use its special ability this turn (it can still attack).
3. Knocked on the Cellar (cannot fall): no move, takes 3 Shatter ("thud"), and is not Dazed.
4. If the landing floor has other enemies, each of them takes 2 Shatter ("pile-up").
5. Enemy size tag `Light`: knocked N+1 floors. `Heavy`: knocked N-1 floors (min 0, Shatter still dealt for floors fallen, 1 minimum). `Anchored`: cannot move, takes no Shatter. All bosses are Heavy or Anchored.
6. Grip rule (anti-loop): an enemy can be moved by Knock at most once per full round (your turn plus enemy phase). A second Knock the same round does 1 Shatter per intended floor and no move.
7. A knocked enemy loses its climb this turn only if it had not acted yet. Intents are recomputed and displayed after the knock.
8. Shatter on Treats: a Treat with the tag `Fragile` can be knocked off by any cat on its floor, once per turn, as a free action. It is destroyed and deals its listed Shatter to the front enemy on the floor below (or the Cellar front enemy if on the Cellar).

### 3.2 UI needs
- Cards and unit strikes show a down-arrow icon with N.
- On targeting, a ghost enemy appears on the destination floor with the predicted Shatter number in orange.
- Falling animation: shake, drop, dust puff, orange "Shatter 4" popup. Fragile Treats get a wobble animation as a hint.
- Enemy intent icon updates instantly after a knock.
- Heavy and Light shown as a weight icon on enemy tooltips.

### 3.3 Sample cards and relics (6)
| Name | Type | Cost | Text | Flavor |
|---|---|---|---|---|
| Shelf Gremlin | Cat 2/2, Lives 3 | 1 | Strike: Knock 1. | "Maintains eye contact while doing it." |
| Tip the Glass | Spell | 1 | Knock target enemy 1. If it lands among other enemies, deal 4 Shatter to each of them. | "Not an accident. Never an accident." |
| Wobbly Vase | Treat, Fragile | 1 | At end of your turn, if an enemy is on this floor, the Vase falls: 5 Shatter to every enemy on the floor below. Destroyed. | "Aunt Marge's. Priceless. Now free." |
| Gravity Tabby | Cat 3/5, Lives 3 (Rare) | 3 | Enemies Knocked into this floor take +3 Shatter. Each time one is, this cat gains +1 Attack this battle. | "Waits at the bottom of every fall." |
| Table Edge | Spell | 2 | Knock all enemies on a floor 1 (Light ones 2). | "Everything on it was moving anyway." |
| Glass of Water | Relic | n/a | The first enemy Knocked each battle takes double Shatter. | "Placed at the exact edge. On purpose." |

### 3.4 Anti-synergy and risk
- Knock is low damage per card. It buys a turn, not a kill.
- Knocking packs enemies together. Pests with swarm bonuses (rats: +1 Attack per other rat on the floor) get stronger when stacked at the Cellar. Pair Knock with AoE or lose.
- Knocking an enemy past your own cats means it no longer fights the floor you built. Dazed only hides specials.
- Stalling with Knock is capped by Grip rule and by card cost each turn.
- Heavy and Anchored enemies blunt Knock decks in boss fights; keep a few Shatter-only options (Fragile Treats).

### 3.5 Failure cases
1. Infinite stall (knock the top enemy every turn, forever). Counter: Grip rule, mandatory Night Visitors at 3AM, and the Dazed gain being tiny. Playtest: a pure Knock deck should win slowly, not never.
2. Readability: players cannot predict where an enemy lands. Counter: ghost preview before confirming.
3. Shatter ignoring Armor can trivialise armoured elites. Counter: elites are Heavy (Shatter minimum, floors reduced).

## 4. BOXES

### 4.1 Rules
1. Each floor has exactly ONE Box slot. A Box is a Treat card played on a floor. Playing a second Box on that floor replaces the first (the old Box is Flattened, its cats pop out).
2. A Box has `fits` (number of cats, 1 normal, 2 for Big Boxes), `durability`, and a passive `sitBonus`.
3. To put a cat in a Box: when playing a cat card, drop it on the Box icon (phone: after choosing the floor, a prompt "Sit in the Box?"). It cannot be moved into a Box later except by card effects. Two cats are never forced into a Box.
4. A Boxed cat:
   - gets the Box's `sitBonus`.
   - is Hidden for the rest of this turn and the whole enemy phase, ending at the start of your next turn.
5. Hidden: it cannot be targeted by enemy attacks or single-target effects. Enemies treat the cat as absent for blocking, so if every cat on a floor is Hidden, enemies climb as if the floor were empty. Area effects still hit. Hidden cats still strike on their turn (they pop out, hit, and hop back).
6. Boxes lose 1 durability at the end of each enemy phase in which at least one enemy was on that floor. At 0 the Box is Flattened: its cats are unboxed, no damage, and a Flat Pack card (Cost 1, Exhaust, "Place a Cardboard Box on a floor") is added to your discard.
7. The cat dying inside a Box: normal death rules, the Box survives with durability intact.
8. `Large` cats do not fit. If played into a Box, the Box is Flattened immediately and the cat gets nothing. ("It does not fit. It sits anyway.")
9. A cat in a Box does not Zoom (see 8) and is not affected by the Frazzled debuff.
10. Cats leaving a Box (by card, or when it is Flattened) trigger `onUnbox` effects.

### 4.2 Box types (reference)
| Box | Cost | Fits | Durability | sitBonus |
|---|---|---|---|---|
| Cardboard Box | 1 | 1 | 3 | +1 Attack |
| Shoebox | 0 | 1 (Kitten only) | 2 | +2 max Health |
| Laundry Basket | 2 | 2 | 4 | +1 Attack each, and the two cats count as adjacent |
| Paper Bag | 1 | 1 | 2 | Hidden lasts 2 rounds instead of 1; -1 Attack |
| Tape Square | 0, Exhaust | 1 (any, even Large) | unlimited | +1 Attack. No Hidden. Only cleaned away by Cleaner enemies. |

### 4.3 UI needs
- Each floor shows a dotted box outline on the right edge when no Box is present; a drop target glows when a cat is dragged.
- A Boxed cat is drawn peeking over the box rim with a ghost outline. Hidden shows as a translucent tint plus a small eye-slash icon.
- Durability is shown as 1 to 4 tape strips on the box. Flattened animation: the box folds flat and slides to discard.
- Enemy intents that would have targeted a Hidden cat show a "?" arrow to the next target.

### 4.4 Sample cards and relics (6)
| Name | Type | Cost | Text | Flavor |
|---|---|---|---|---|
| Cardboard Box | Treat (Box) | 1 | Place on a floor. See 4.2. | "Very serious structure." |
| Shoebox | Treat (Box) | 0 | Kitten only. +2 max Health. Draw 1 when a Kitten sits in it. | "Fits one kitten and unlimited ego." |
| Laundry Basket | Treat (Box) | 2 | Big Box (2 cats). Bonus as 4.2. | "Still warm. That is the whole point." |
| Tape Square | Treat (Box) | 0 | Exhaust. As 4.2. | "A square drawn in tape. The cat has decided." |
| Pop-Up Pounce | Cat 3/3, Lives 3 (Rare) | 2 | When this leaves a Box or its Box is Flattened, deal 8 damage to the front enemy on this floor. | "Appears from nowhere. Looks surprised too." |
| Next Day Delivery | Relic | n/a | The first Box you play each battle costs 0 and draws 1 card. | "Arrived early. Nobody ordered it." |

### 4.5 Anti-synergy and risk
- Hidden cats do not block. A fully Hidden floor lets enemies pass. You must have an unboxed blocker or accept the leak.
- Box slots are scarce (3 total). Replacing a Box flattens the old one.
- Large cats and Cleaner enemies (Vacuum, Mop) punish Box decks. Vacuum: "Flattens all Boxes on its floor."
- Boxed cats do not Zoom. At 3AM you lose that free hit.
- Durability makes permanent camping impossible.

### 4.6 Failure cases
1. Nap plus Box lock: all cats Boxed, Napping, Hidden, enemies walk past. Counter: Hidden does not stop Sunbeam burn, and Night Visitors keep coming. Test: ensure the Sunbeam still dies to the turtle.
2. Tutorial confusion about "why did the rat go past?". Counter: a clear "Not blocking" tag on Hidden cats.
3. Box UI drag on phone. Counter: tap flow with a prompt, no drag required.

## 5. NAP

### 5.1 Rules
1. Each cat on the board has a state: Awake (default), Napping. Toggle with the Z button on the unit, free, any time during your turn before End Turn. Toggling also works from a card text ("Lullaby").
2. A Napping cat does not strike (and does not Zoom). It still occupies its slot, blocks and can be attacked.
3. At the end of the enemy phase, each Napping cat gains Rested +1 (max 4, relics can raise to 6) and heals 2 Health.
4. Waking: when you toggle a Napping cat to Awake on your turn, it triggers Wake effects and, on its next strike, it POUNCES: damage +3 per Rested stack (a cat with Rested 3 hits for Attack +9). Rested is then spent. Also at wake, it gains +1 Attack this battle per 2 Rested stacks spent (rounded down).
5. Rude Awakening: if a Napping cat takes damage and survives, it wakes involuntarily and LOSES Rested. It gains Grumpy: +2 Attack this turn.
6. Cats cannot Nap on the turn they were played (summoning sickness for sleepiness). They can be put to Nap next turn.
7. Napping cats keep their Pile membership, and a Box makes them Hidden (good synergy).
8. A cat that is Napping at the start of a 3AM turn does NOT Zoom, and gains +1 extra Rested ("Dream").
9. Max Pounce bonus capped at +18. Rested stacks over 4 only exist via relics.

### 5.2 UI needs
- A Z button on each unit (phone: tap the unit, bottom sheet with Strike/Nap). Napping cats show closed-eyes sprite with floating "z" particles.
- Rested stacks shown as small moon pips above the Health bar (up to 6).
- A preview line when a Nap cat is about to Pounce: "Pounce +9".
- Rude Awakening shows a "!" bubble and the cat hisses.

### 5.3 Sample cards and relics (6)
| Name | Type | Cost | Text | Flavor |
|---|---|---|---|---|
| Sleepy Bruiser | Cat 2/6, Lives 3 | 2 | Starts each battle with Rested 1 when it first Naps. Wake: gain 2 Armor TUNE. | "Excellent at doing nothing, in a large size." |
| Lullaby | Spell | 1 | Target cat Naps and gains Rested 2. Heal it 3. | "A song only the cat is allowed to critique." |
| Alarm Clock | Spell | 1 | Wake all Napping cats on a floor. They Pounce immediately (each gets a bonus strike). | "Set for the worst possible moment." |
| Dream Hunter | Cat 1/4, Lives 3 (Rare) | 2 | While Napping, at end of your turn draw 1 card per 2 Rested stacks. | "Catching things in its sleep. Mostly rats." |
| Sun Patch Cushion | Relic | n/a | Max Rested +2 (cap 6). Napping cats heal 1 more. | "Always the right temperature. Always taken." |
| Do Not Disturb Sign | Relic | n/a | The first time each battle a Napping cat is damaged, it does not wake. | "Written in a language only enemies read." |

### 5.4 Anti-synergy and risk
- Napping cats deal no damage and can be woken by hits; frontline Nap is risky.
- Napping conflicts with 3AM (no free Zoom) and with Catnip Surge (Surge wants awake cats).
- Pounce is delayed damage; against fast waves you may be too late.
- Raw damage parity: 3 Naps then Pounce equals about the same damage as 4 normal strikes, but is delayed. The extras are healing, attack growth and burst timing.

### 5.5 Failure cases
1. Everyone naps and the whole board is passive, a degenerate stall. Counter: Night Visitors and Sunbeam burn, cap at +18.
2. Pounce one-shots bosses on turn 3. Counter: boss Heavy tag and a 25 TUNE damage cap per hit on bosses (open question).
3. Players forget to toggle off Nap. Counter: End Turn button warns "2 cats are still napping" once per battle.

## 6. CUDDLE PILE

### 6.1 Rules
1. Each floor has a row of 5 slots. When a cat is played, the player picks a slot (drag between cats; phone: tap the "+" gap). Empty slots stay empty when a cat dies.
2. A Pile is a run of 2 or more cats in consecutive slots on the same floor. Pile size P = number of cats in that run. Breaks in the row (empty slot) split it.
3. Every cat in a Pile gets Snug bonus, recalculated live:
   - Attack +floor(P / 2). (P=2: +1, P=3: +1, P=4: +2, P=5: +2)
   - If P is 3 or more: at end of your turn, each cat heals 1 ("Body Heat").
4. Napping cats count toward P. Boxed cats count if adjacent. Hidden does not stop membership.
5. During a 3AM turn, a cat that Zoomed is NOT Snug until the next turn (it ran off). Napping cats stay.
6. Swap: once per turn, you may swap two adjacent cats on a floor for free.
7. Kittens count as full cats. Enemy "Splash" attacks hit all cats in a Pile.

### 6.2 UI needs
- Pile cats are drawn touching, with a warm yellow glow link between them and a small number badge "P3".
- Snug bonus shown on the cat as a tiny heart number. Hovering shows P and bonuses.
- Empty slots shown as faint paw-print outlines so the row reads as a row.
- Phone: "+" gap buttons appear between cats while dragging a cat card.

### 6.3 Sample cards and relics (6)
| Name | Type | Cost | Text | Flavor |
|---|---|---|---|---|
| Loaf | Cat 1/4, Lives 3 | 1 | Snug: +1 Attack for each adjacent cat. | "A bread shape that bites." |
| Kneader | Cat 2/3, Lives 3 | 2 | End of your turn: give adjacent cats +1 Health this battle. | "Making biscuits. Nobody asked." |
| Huddle Up | Spell | 1 | Rearrange the cats on a floor freely. Each cat in the resulting Pile heals 2. | "Cold front incoming." |
| Big Mama Tabby | Cat 3/7, Lives 4 (Rare) | 3 | While in a Pile of 3 or more, enemies must attack her first. Pile bonuses on her floor are doubled. | "She has opinions and a lap." |
| Heated Blanket | Treat | 1 | Cats in a Pile of 3 or more on this floor heal 2 at end of your turn. | "Draws the room in like gravity." |
| Family Portrait | Relic | n/a | Piles count as 1 larger than their actual size. | "Everyone is looking in a slightly different direction." |

### 6.4 Anti-synergy and risk
- The middle cat is the keystone. Kill it and the pile splits into two Piles of 2 with a tiny bonus.
- Splash enemies and Bath water punish Piles. Shove effects (the dog) pull cats out of the row.
- Stacking cats on one floor leaves other floors open.
- 3AM Zoomies temporarily scatters the pile.
- Piles need cards that place cats, so hand control matters.

### 6.5 Failure cases
1. Phone placement is fiddly. Counter: auto place rightmost by default, free swap per turn.
2. Single-floor turtle with heal: a 5-cat Pile with Heated Blanket heals 6 per turn and never dies. Counter: Splash and Bath enemies appear by Act 2, and heal only at 3 or more.
3. Slot-gap rules misunderstood. Counter: faint slot outlines.

## 7. CATNIP SURGE

### 7.1 Rules
1. The Nip Meter is a battle-only resource, 0 to 10 (15 internal cap). It starts at 0 each battle (some relics change this).
2. Gain Nip from cards ("Nip X") and cat triggers. The meter shows leaf icons.
3. When the meter reaches 10 or more, SURGE triggers immediately after the card resolves. Excess = meter - 10 (max 5). Meter resets to 0.
4. Surge lasts for the rest of this turn and your entire next turn:
   - Immediately gain +2 Energy, and +2 Energy at the start of next turn.
   - All cats get +2 +excess Attack.
   - Total Energy this turn cannot exceed 10.
5. When Surge ends, Crash begins. Crash lasts `1 + floor(excess / 3)` turns (1 or 2):
   - At the start of each Crash turn: lose 1 Energy and draw 1 fewer card.
   - On the FIRST Crash turn, every Awake cat becomes Drowsy: it is put to Nap automatically (it cannot be woken this turn), and gains +1 Rested at end of the turn.
6. During Surge and Crash, Nip gained is lost (the leaf is gone).
7. Crash can be ended early by the card "Detox Tea" (3.2).

### 7.2 UI needs
- A leaf bar at the left of the energy orb, with a glowing green fill. At 8 or more it vibrates.
- On Surge: green shockwave, particles, and a "SURGE!" banner. All cats get glowing eyes.
- On Crash: grayscale tint, cats yawn and slump, a "Crash 1 of 2" tag on the Energy orb.
- Predictive tooltip: "Nip 9 +1 = SURGE".

### 7.3 Sample cards and relics (6)
| Name | Type | Cost | Text | Flavor |
|---|---|---|---|---|
| Sniff | Spell | 0 | Gain 3 Nip. Exhaust. | "Just a little. For the cat." |
| Fresh Sprig | Spell | 1 | Gain 4 Nip. Draw 1. | "Grown in a pot nobody was allowed to touch." |
| Buzzed Burmese | Cat 2/3, Lives 3 | 1 | At the start of your turn, gain 1 Nip. | "Has a lot to say about the ceiling." |
| Overdose | Spell | 2 | Set Nip to 12 and Surge now. Exhaust. | "A decision with a long tail." |
| Detox Tea | Spell | 1 | End Crash now. Each of your cats takes 2 damage. | "Tastes like regret and chamomile." |
| Catnip Plant Pot | Relic | n/a | Start each battle with 3 Nip. Surge gives +1 more Energy, but Crash lasts 1 turn longer. | "Technically a flowerpot." |

### 7.4 Anti-synergy and risk
- The Crash forces a full no-attack turn for most of your board, a real window for enemies.
- Surge competes with Nap and 3AM: all three are burst states, and cannot be stacked cleanly.
- Nip cannot be gained during Surge or Crash, so engines can't chain.
- Detox Tea and Overdose give players risk-reward switches.

### 7.5 Failure cases
1. Surge on a 3AM turn: huge turn plus free Zoom plus a Crash on Dusk. Counter: Energy cap 10, and Crash's forced Nap gives Rested which feeds Pounce (intentional payoff).
2. Perpetual Surge with 0 cost Nip cards. Counter: Nip gain stops during Surge or Crash, Sniff is Exhaust.
3. Crash feels like a fail state. Counter: Rested bonus and the clear "Crash 1 of 2" UI; the forced nap is also a reward.

## 8. THE NIGHT CLOCK / 3AM ZOOMIES

### 8.1 Rules
1. The Night Clock has three phases looping per turn: Dusk (turn 1, 4, 7...), Prowl (2, 5, 8...), 3AM (3, 6, 9...). The clock resets to Dusk at the start of every battle.
2. Dusk and Prowl are normal turns (hooks for relics and enemies: "Nocturnal", "Day Sleepers"). Only 3AM has built-in rules.
3. 3AM turn:
   - Gain +2 Energy this turn only (not banked) and draw 1 extra card.
   - After drawing, every Awake, non-Boxed cat Zooms: a free extra strike on a random enemy anywhere in the house (any floor), dealing ceil(Attack / 2).
   - Cats that Zoomed become Frazzled next turn: -2 Attack (min 1).
   - Napping and Boxed cats skip Zoom and Frazzled.
   - At the end of the 3AM enemy phase, Night Visitors spawn in the Cellar (the wave script's night row; around 25 percent of a normal wave's threat).
   - Enemies with `Nocturnal` have +2 Attack during 3AM.
4. Clock Fatigue: 3AM cannot occur twice in a row, even with Advance cards.
5. Variants: elites can use `Late Shift` (clock starts at Prowl), the final boss uses `Eternal Night` (3AM every 2nd turn, but its Night Visitors are doubled), and Mischief Rank modifiers can start the clock at 3AM.
6. Clock cards:
   - Advance: move the Clock forward 1 phase (Exhaust, cost 1).
   - Delay: hold the clock for 1 turn (Exhaust, cost 1).

### 8.2 UI needs
- Top bar moon dial with three icons (sunset, moon, clock showing 3:00). Active phase glows, and the text "3AM in 2 turns" is always displayed.
- 3AM: screen tints indigo with small stars. "ZOOMIES!" banner for 0.6s. Zooming cats do a streak animation, and a targeting line to the random enemy is shown briefly before the hit.
- Frazzled: cats show swirly eyes and a -2 badge.
- Next night preview: an icon on the intent bar for the Night Visitors.

### 8.3 Sample cards and relics (6)
| Name | Type | Cost | Text | Flavor |
|---|---|---|---|---|
| Night Owl Goggles | Relic | n/a | 3AM gives +1 more Energy. | "Not an owl. Does not care." |
| Insomnia | Spell | 1 | Advance the Night Clock 1 phase. Exhaust. | "Why is it so quiet? It is 2:58." |
| Snooze Button | Spell | 1 | Delay the Night Clock 1 turn. Exhaust. | "Five more minutes. Forever." |
| Midnight Zoomer | Cat 2/2, Lives 3 | 1 | Zooms twice at 3AM. | "Runs into a wall. Takes credit." |
| Tick Tock Tom | Cat 2/5, Lives 3 (Rare) | 2 | At 3AM, all cats on this floor Zoom twice. | "Counts the seconds out loud." |
| Dawn Chorus | Relic | n/a | At the end of a 3AM turn, every Awake cat heals 2 and loses Frazzled. | "The birds have no idea what they started." |

### 8.4 Anti-synergy and risk
- Zoom is random. You cannot target a boss with it.
- Frazzled means the turn after 3AM is weak, and 3AM brings Night Visitors.
- Napping and Boxing skip Zoom (lower burst) but protect you.
- Clock manipulation cards are Exhaust and Clock Fatigue limits them.
- Surge and Piles interfere with Zoom (Pile bonuses scatter).

### 8.5 Failure cases
1. Insomnia loops to get 3AM every turn. Counter: Clock Fatigue and Exhaust.
2. Zoom RNG feels bad on bosses. Counter: Zoom picks randomly among enemies, bosses are always weighted double.
3. Players forget Frazzled. Counter: clear UI badge and a pre-warning on 3AM.

## 9. Cross-twist interaction matrix (implement exactly)

| A | B | Result |
|---|---|---|
| Nap | 3AM | Napping cats skip Zoom and gain +1 extra Rested. |
| Nap | Box | Boxed napping cat is Hidden and safe from Rude Awakening. |
| Nap | Pile | Napping cats count toward Pile size. |
| Nap | Surge | Crash forces Nap on first Crash turn and grants Rested. |
| Box | 3AM | Boxed cats skip Zoom and Frazzled. |
| Box | Pile | Boxed cats count if adjacent; Laundry Basket makes its 2 cats adjacent. |
| Pile | 3AM | Zoomed cats are not Snug until next turn. |
| Knock | Box | Hidden enemies do not exist, but Knocked enemies can land on a floor whose cats are Hidden; they are not blocked. |
| Knock | 3AM | Night Visitors appear in the Cellar, Knocked enemies stack there. |
| Lives | Box | Cat death in a Box still costs a life. |
| Lives | Cornered | Cornered cats get +2 Attack but are always the target of "finish them" enemy AI. |
| Surge | 3AM | Surge on 3AM allowed; energy cap 10 total this turn. |
| Hairballs/Yarn/Purr (other agents) | n/a | Purr heals do not restore Lives. Yarn Tangle does not stop Knock movement but stops Zoom. Hairballs apply Shatter-type damage to Pests only. |

## 10. Engine hooks (events a coder must emit)

`onLifeLost(cat, floor, slot)`, `onLastLifeLost(cat)`, `onSpareLifeSpent`, `onKnock(enemy, from, to, shatter)`, `onShatter(enemy, amount)`, `onBoxPlaced(floor)`, `onBoxEnter(cat)`, `onBoxFlattened(floor)`, `onUnbox(cat)`, `onNapStart(cat)`, `onNapTick(cat, rested)`, `onWake(cat, rested)`, `onPounce(cat, bonus)`, `onRudeAwakening(cat)`, `onPileChange(floor, size)`, `onNipGain(n)`, `onSurgeStart(excess)`, `onSurgeEnd`, `onCrashStart(turns)`, `onNightPhase(phase)`, `onZoom(cat, target)`, `onFrazzled(cat)`.

## 11. Ranking: core and clan-flavored

Scoring (1 to 5): Simple to explain, Depth, Cat-fantasy, Fits any deck.

| Twist | Simple | Depth | Cat feel | Fits any deck | Total | Tier |
|---|---|---|---|---|---|---|
| NINE LIVES | 4 | 5 | 5 | 5 | 19 | CORE |
| NAP | 5 | 4 | 5 | 5 | 19 | CORE |
| KNOCK IT OFF | 5 | 4 | 5 | 4 | 18 | CORE |
| NIGHT CLOCK | 4 | 4 | 5 | 5 | 18 | CORE |
| CATNIP SURGE | 3 | 4 | 3 | 2 | 12 | CLAN |
| CUDDLE PILE | 3 | 4 | 5 | 2 | 14 | CLAN |
| BOXES | 3 | 4 | 5 | 2 | 14 | CLAN |

Core four: NINE LIVES, NAP, KNOCK IT OFF, NIGHT CLOCK. They need no extra slots or placement rules. Rules apply to every cat and enemy, so every clan gets some hooks.

Clan-flavored (suggested home archetypes; the clan agents decide the names):
- BOXES: the stealth/lurker clan. Hidden, Ambush and Pop-Up payoffs.
- CUDDLE PILE: the support/hearth clan. Pile size, heal and shared buffs.
- CATNIP SURGE: the chaos clan. Burst, risk and the crash.

Core teaching order (tutorial): Night 1 shows Lives only. Night 2 adds Knock. Night 3 adds Nap. Night 4 adds the Night Clock with the first 3AM. Clan mechanics appear only as drafted.

## Open questions for the lead
1. Floor capacity: I assumed 5 slots per floor in a row with a free slot choice. If your layout is a collapsing list, Cuddle Pile needs a different adjacency rule.
2. Combat order: I assumed your cats strike, then enemies act or climb. If enemies and cats attack simultaneously, Hidden and Nap need small edits.
3. Should the Spare Lives Jar exist at all, or should lives stay purely per-cat? I recommend keeping it; it is cheap to cut.
4. Should bosses be hard-capped on Pounce damage (I suggest 25 per hit TUNE)?
5. Which clans own Boxes, Cuddle Pile and Catnip Surge? Needs to match the clan designers.
