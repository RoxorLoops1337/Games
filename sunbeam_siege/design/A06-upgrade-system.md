# A06: In-Run Upgrade Systems ("Claws Out, Cards Up")

Agent A06, Progression Systems Designer. Scope: everything that makes a card stronger, different, fewer or more numerous DURING a run. Meta unlocks are out of scope. Keyword names (Pounce, Purr, Rested, Knock, Box, Cuddle, Hairball, Armor, Ambush, Taunt) are provisional and must be mapped to the final glossary by the keyword agent. Mechanics tied to undecided twists are marked [TWIST].

## 1. Design intent: the "I am getting stronger" loop

Pillar 3 says stacking everywhere. This file delivers it with six layers, each on a different clock, so something is always visibly growing:

| Layer | Clock | Who controls it | Visible as |
|---|---|---|---|
| Scratches (upgrades) | Per Post visit, ~2 per act | Player choice, Fish gold | Claw gouges on card edge |
| Forks (branch upgrades) | Per Post visit, key cards only | Player choice | Card art swaps to Branch A/B/C |
| Champion Tiers | 3 per run | Player choice | Champion portrait gains collar, scars, aura |
| Mastery | Per play, across fights | Play pattern | Paw pips under card art, gold flash |
| Kneading | Per play or per fight, by card text | Card design | Gold "k" numbers on the card |
| Evolution | Per fight survived | Drafting early | Card transforms Kitten, Cat, Legend |

Rules that guarantee the feeling:
1. **Three ticks per fight.** A typical fight should produce at least three visible growth events (a Mastery pip, a Knead tick, a Growth counter). The end-of-fight screen shows a **Growth Report**: a short list of every card that changed, with before and after numbers and a purr sound per line.
2. **Early seeds, late harvests.** Kittens, Knead cards and low-rank Mastery are strongest when picked in Act 1. A card drafted on Night 1 that is played every fight should be roughly 2.2x its printed power by Night 9.
3. **Nothing resets between fights.** Scratches, Mastery, Kneading, Growth are all per card instance and saved in the run state.
4. **Choice over luck.** Every upgrade offer shows the exact result before commit (a ghost preview card with changed numbers in green).
5. **Hold a different identity.** Forks and Champion paths change what a card DOES, not only how big it is, so the player feels they are building, not only inflating.

Target card power curve (index, printed card = 100) for a card played often and upgraded by a competent player:

| Night | 1 | 3 | 5 | 7 | 9 |
|---|---|---|---|---|---|
| Typical power | 100 | 135 | 165 | 195 | 220 |

Enemy scaling (owned by the balance agent) should sit at roughly 85% of this curve so that attention to growth is rewarded but neglect is survivable on low Mischief Ranks.

## 2. Card instance model and upgrade slots

Every card in the deck is an **instance**, not just an id. Save shape (plain JS object):

```js
{
  uid: "c_0412",          // unique per run
  cardId: "claw_swipe",   // printed card
  form: 0,                // evolution stage 0,1,2 (chain cards only)
  slots: 1,               // max scratches (base from rarity, plus bonuses)
  scratches: ["up_sharp_claws"],   // applied generic upgrade ids, in order
  fork: null,             // fork id or null (occupies one slot)
  knead: { attack: 0, health: 0, value: 0 },  // permanent flat gains
  plays: 7,               // lifetime plays this run (capped 3 counted per fight)
  masteryRank: 1,         // 0..3
  growth: 0,              // fights survived while played (chain cards)
  champTier: 0, champPath: null,   // champions only
  origin: "draft"         // draft | shop | event | litter | boxswap
}
```

**Upgrade slots** (called "Scratch Slots", drawn as vertical gouge marks on the left of the card):

| Card type | Base slots |
|---|---|
| Common | 1 |
| Uncommon | 1 |
| Rare | 2 |
| Evolution chain card | 1 at Kitten, 2 at Cat, 3 at Legend |
| Champion | 2 generic slots, plus 3 Tier nodes (separate, see section 7) |
| Status/Curse | 0 |

- A Fork consumes 1 slot.
- Extra slots come from relics, events and the **Whittle** Post service (+1 slot to a chosen card, 120 Fish, once per card, hard cap 3 slots for non-champions).
- **Overscratch:** if all slots are full, a new scratch may replace an existing one for +50% price. The replaced scratch is destroyed. Forks can be replaced only by another fork.
- Fits: each upgrade lists `fits` (unit, spell, treat, any). Keywords the card already has block redundant keyword grants (no duplicate Pounce).

Effective card calculation order (engine must do exactly this):
1. Printed card, then Evolution form stats.
2. Fork replaces or modifies named effects.
3. Scratches in applied order: all `addStat` first, then `mulStat` (round up).
4. Mastery rank gains (flat).
5. Kneading gains (flat).
6. Relic global modifiers.
7. In-fight temporary buffs.
Cost can never go below 0. Cost 0 is reachable only through a tier 3 effect or a card's own text.

## 3. The Scratching Post (upgrade stations)

Three places the player upgrades cards. All are the same UI: pick a card from the deck grid, see offers, preview, confirm.

### 3.1 Post node on the map (free)
- Map node icon: a sisal post with a cat silhouette. Each act guarantees 2 Post nodes on the map (6 per run), but they sit on different branches so the player cannot take all of them.
- The Post material scales by act, which gates scratch tier:

| Act | Post | Max scratch tier | Offers shown |
|---|---|---|---|
| 1 | Cardboard Post | 2 | 3 |
| 2 | Sisal Post | 3 | 3 |
| 3 | Cedar Post | 3 | 4 |

- Visiting a Post node: choose ONE card, see 3 (or 4) offered scratches for that card, pick ONE, applied free. A Fork, if the card has forks, always takes one of the offer slots (so offers = 1 fork choice screen plus 2 generic, or 3 generic if no forks).
- Reroll the offers for 15 Fish (cost +15 each reroll, max 3 rerolls per visit).
- Choosing a different card after seeing offers is allowed until confirm.
- The Post node also offers the services in section 3.3 at listed prices.

### 3.2 Post Stall in shops (paid)
- Every shop has a Post Stall selling 4 specific scratches (not tied to a card), each at its `costFish`, plus 1 Fork card-tag voucher (90 Fish) that lets the player pick any forkable card in the deck.
- Stall stock is generated at shop creation, tier capped by act as above, and weighted toward the keywords of the player's two clans.
- Each shop discount relic applies here (see section 12).

### 3.3 Post services (Fish prices)

| Service | Price | Notes |
|---|---|---|
| Scratch (from catalog) | 40 / 75 / 120 by tier | Tier 1 / 2 / 3 |
| Fork | 90 | Key cards only, see section 5 |
| Whittle (+1 slot) | 120 | Once per card |
| Knead (Post) | 15 | +1 to attack, health or value, max +2 per card from Post |
| Reroll offers | 15, +15 each | Node Post only |
| Champion Tier | 60 / 100 / 150 | See section 7 |
| Legend Ceremony | 90 | See section 8 |

Economy assumption (for the balance agent): ~35 Fish per battle, ~60 per elite, ~120 per boss, so ~900 Fish per run plus events. A typical run will take 6 free Post scratches, buy 3 to 5 more, take 3 Champion Tiers, and reach 2 to 4 Mastery ranks and one Evolution. That is about 14 discrete upgrades per run, plus passive growth.

## 4. Upgrade catalog schema

One entry per upgrade in `data/upgrades.js` as `window.UPGRADES = [ ... ]`.

```js
{
  id: "up_sharp_claws",     // snake_case, prefix up_
  name: "Sharp Claws",
  tier: 1,                  // 1, 2, 3 (gates by Post material)
  rarity: "common",         // common | uncommon | rare (offer weight 10 / 5 / 2)
  fits: ["unit"],           // unit | spell | treat | any
  costFish: 40,             // base shop price, 40/75/120 by tier, +-10 for strong or weak
  slots: 1,                 // slots consumed, always 1 for generic scratches
  group: null,              // exclusivity group, only one scratch per group per card
  requires: null,           // e.g. { minCost: 3 } or { hasKeyword: "pounce" }
  effects: [ { op: "addStat", stat: "attack", value: 2 } ],
  text: "+2 Attack.",       // display line, rendered on the card in green
  flavor: "Honed on the good sofa."
}
```

Allowed `op` values (the effect engine implements exactly these):

| op | Params | Meaning |
|---|---|---|
| addStat | stat: attack, health, cost, value, charges; value: int | Flat change. `value` is the card's primary effect number |
| mulStat | stat, factor | Multiply, round up |
| grantKeyword | keyword, n (optional) | Add keyword, or raise its n |
| addTrigger | when: onPlay, onDeath, onKill, turnStart, turnEnd, onHit, fightStart; do: [effects] | New triggered effect |
| setFlag | flag: retain, innate, noExhaust, freeFirst | Boolean property |
| addLives | n | [TWIST: Nine Lives] more life pips |
| addSlot | n | More scratch slots (relics and events only) |

`group` values used by the 30 samples: `g_cost`, `g_retain`, `g_lives`, `g_multi`. Two scratches in the same group cannot coexist on a card.

Fork entries live on the card definition (section 5). Champion nodes live on the champion definition (section 7). Both reuse the same `effects` ops.

## 5. Branching upgrades (Forks) for key cards

Cards flagged `forkable: true` (roughly 1 in 5 cards, plus every rare) have 2 or 3 named Fork versions. A Fork is chosen once per card and takes 1 slot.

```js
forkable: true,
forks: [ { id: "claw_swipe_rake", name: "Rake", cost: 90, text: "...", effects: [ ... ] }, ... ]
```

When a Fork is chosen, the card's name gets a subtitle ("Claw Swipe: Rake"), the art frame changes color, and the preview shows the replaced text struck through. Three samples:

**Claw Swipe** (Common spell, cost 1, "Deal 6 damage to the front enemy on a floor.")
- **Rake** (Fork A): "Deal 4 damage to EVERY enemy on a floor." Flavor: "Sofa 1, curtains 0."
- **Hamstring** (Fork B): "Deal 8 damage to the front enemy. Apply Hobble 2 (it climbs 1 floor slower next turn)."
- **Swipe and Scoot** (Fork C): "Deal 5 damage to the front enemy. Draw 1 card." Flavor: "Hit and run is a lifestyle."

**Hairball Cough** (Uncommon spell, cost 1, "Create a Hairball in the target floor. It deals 3 damage to the first enemy that enters.")
- **Projectile** (A): "Deal 7 damage to the front enemy immediately. No Hairball."
- **Minefield** (B): "Create 2 Hairballs on the target floor. Each deals 3 damage."
- **Heirloom** (C): "Create a Hairball that deals 3 damage and is NOT consumed. It stays and hits again each turn for 1." Flavor: "Family tradition."

**Loaf Stance** (Common treat, cost 1, "Attach to a floor. Cats there that skip acting become Rested.")
- **Meatloaf** (A): "Rested cats on this floor also gain Armor 3."
- **Bread Loaf** (B): "Rested bonus doubles but only for the first cat to become Rested each turn."
- **Cat Loaf Cake** (C): "Cost 0. Exhaust. Every cat on this floor is Rested at the start of next turn." Flavor: "Happy birthday, now be still."

## 6. The 30 sample generic upgrades

`rarity` and `group` shown only when not default (common, none). Costs in Fish. Ops are in compact form `op stat value`.

### Tier 1 (cost 40)

| id | Name | Fits | Fish | Effects | Text |
|---|---|---|---|---|---|
| up_sharp_claws | Sharp Claws | unit | 40 | addStat attack +2 | +2 Attack. |
| up_thick_fur | Thick Fur | unit | 40 | addStat health +6 | +6 Health. |
| up_louder_hiss | Louder Hiss | spell | 40 | addStat value +3 | +3 to the spell's main number. |
| up_warm_spot | Warm Spot | treat | 40 | addStat charges +2 | Lasts 2 more turns. |
| up_cheap_thrills | Cheap Thrills | any | 40 | addStat cost -1; requires minCost 3; group g_cost | Costs 1 less. Only on cards costing 3 or more. |
| up_hungry_hunter | Hungry Hunter | unit | 40 | addTrigger onKill: +1 Attack this fight | Each kill gives +1 Attack for the fight. |
| up_gentle_purr | Gentle Purr | unit | 40 | grantKeyword purr 2 | Purr 2. |
| up_keen_nose | Keen Nose | spell | 40 | addTrigger onPlay: draw 1 | Draw 1 card. |
| up_padded_paws | Padded Paws | any | 45 | setFlag retain; group g_retain | Retain. |
| up_groomed | Groomed | unit | 40 | grantKeyword armor 3 | Starts each fight with Armor 3. |
| up_whisker_twitch | Whisker Twitch | unit | 45 | grantKeyword pounce | Pounce (strikes first when it arrives). |
| up_hairball_habit | Hairball Habit | unit | 40 | addTrigger turnEnd: create Hairball on this floor, once per fight | Coughs up 1 Hairball at the end of its first turn each fight. |

### Tier 2 (cost 75)

| id | Name | Fits | Fish | Effects | Text |
|---|---|---|---|---|---|
| up_light_paws | Light Paws | any | 75 | addStat cost -1 (min 1); group g_cost | Costs 1 less (not below 1). |
| up_patient_predator | Patient Predator | unit | 75 | grantKeyword ambush | Ambush: its first hit each fight deals double. |
| up_deep_purr | Deep Purr | unit | 75 | grantKeyword purr 3 | Purr 3, stacks with existing Purr. |
| up_cuddle_magnet | Cuddle Magnet | unit | 80 | addTrigger turnStart: +1 Attack this turn per adjacent cat | +1 Attack per adjacent cat each turn. |
| up_kneader | Kneader | unit | 80 | grantKeyword knead 1 | Knead 1: +1 Attack permanently each time it is played. |
| up_double_swat | Double Swat | unit | 85 | grantKeyword multistrike 2; group g_multi | Strikes twice. |
| up_knock_knock | Knock Knock | unit | 75 | addTrigger onHit: push target down 1 floor, once per turn | First hit each turn knocks the enemy down a floor. [TWIST: Knock It Off] |
| up_reusable | Reusable | any | 70 | setFlag noExhaust | Removes Exhaust. Only offered on Exhaust cards. |
| up_sprint | Sprint | any | 70 | addTrigger onPlay: +1 Zoomies next turn | Gain 1 extra Zoomies next turn. |
| up_second_helping | Second Helping | spell | 80 | grantKeyword echo 1 | Echo: the first time each fight it is played, play it again free. |
| up_nap_ready | Nap Ready | unit | 70 | addTrigger turnStart if Rested: heal 4, +2 Attack | When Rested, heal 4 and gain +2 Attack that turn. |
| up_bigger_box | Bigger Box | any | 75 | addTrigger onPlay: if in Box, +4 value | +4 effect if this lands in a Box. [TWIST: Boxes] |

### Tier 3 (cost 120)

| id | Name | Fits | Fish | Effects | Text |
|---|---|---|---|---|---|
| up_weightless | Weightless | any | 120 | addStat cost -1 (may reach 0); group g_cost | Costs 1 less, can reach 0. |
| up_apex_predator | Apex Predator | unit | 120 | addStat attack +4; grantKeyword pounce | +4 Attack and Pounce. |
| up_legend_of_the_alley | Legend of the Alley | unit | 130 | mulStat attack x1.5; mulStat health x1.5 | +50% Attack and Health. |
| up_lucky_life | Lucky Life | unit | 120 | addLives +2; group g_lives | +2 lives. [TWIST: Nine Lives] If rejected, becomes: when this dies, return it to hand at 1 Zoomies cost, once per fight. |
| up_echo_meow | Echo Meow | spell | 120 | addTrigger onPlay: play again free, once per fight | The first play each fight is duplicated. |
| up_nine_tail_whip | Nine Tail Whip | unit | 110 | addTrigger onHit: deal 3 to every other enemy on the floor | Each hit splashes 3 to all other enemies on the floor. |

Design notes: tier 3 is rare in the offer pool (weights 3 for rarity common, 1 for rare) and appears only from Act 2 onward. Cost reducers are in one exclusivity group so no card is made free by stacking.

## 7. Champions: 3 paths, 3 tiers

Every run starts with one Champion. Champions never leave the deck (cannot be Adopted Out, Transformed or Litter-copied).

### 7.1 Rules
- Champion Tier nodes are separate from the 2 generic Scratch Slots. A Champion can hold 2 generic scratches AND 3 tier nodes.
- **Tier I:** choose ONE of the three paths (A, B, C). **Tiers II and III:** must continue the same path. The relic **Wanderlust Collar** allows taking Tier II or III from another path once.
- Unlock timing: the map has a **Champion Perch** node (cat tree icon) once per act, free, giving Tier I in Act 1, II in Act 2, III in Act 3. Missed tiers can be bought at any Post for 60 / 100 / 150 Fish. A Champion cannot be above Tier = act number + 1 unless a relic says so (so Tier III is reachable at the start of Act 2 only by buying it).
- Each tier shows its numbers fully on the champion card, with the previous tiers collapsed into one line each so the card stays readable on phones. Champion portrait gains visible cosmetics per tier (collar, bell, scar, glow).
- Mastery and Kneading also apply to Champions (they are cards). Their Mastery thresholds are 4 / 9 / 15 plays and give +2 Attack, +6 Health, then a path-specific bonus.

### 7.2 Sample Champion 1: Duchess Marmalade (orange tabby, hearth and nap themed)
Base: cost 2, Attack 6, Health 30, Innate, Retain. "Purr 2: at the start of each turn, heal cats on this floor for 2."

**Path A: Lap Warden (healing and growth)**
| Tier | Node | Effect | Flavor |
|---|---|---|---|
| I | Warm Lap | Purr becomes 4. +10 Health. | "Sit. Stay. Be healed." |
| II | Biscuit Maker | After every fight, Duchess permanently gains +1 Health (Kneading). Her Purr also heals the Sunbeam for 1 per turn. | "She is making biscuits on the Sunbeam. Nobody asked." |
| III | Queen of the Cushion | Purr 4 applies to cats on ALL floors. Once per fight, a cat on her floor that would die survives with 1 Health. | "Everyone gets a turn on the throne. She decides who." |

**Path B: Loaf Fortress (tank and Rested)**
| Tier | Node | Effect | Flavor |
|---|---|---|---|
| I | Loaf Mode | +14 Health. When Rested, take 3 less damage and deal +3 damage. | "Legs tucked. Doors closed." |
| II | Immovable Object | Taunt. Whenever Duchess is hit, deal 3 damage back to the attacker. Armor 4 at the start of each fight. | "She will not be moved. Not for you, not for dinner." |
| III | The Sunbeam Is Mine | On the Attic: enemies reaching the Attic deal 4 less Warmth damage. Once per turn Duchess may Nap on demand (become Rested without skipping her attack). Thorns 5. | "A sunbeam is a lease, and she has read the terms." |

**Path C: Zoomie Menace (offense)**
| Tier | Node | Effect | Flavor |
|---|---|---|---|
| I | 3AM Energy | +4 Attack. The first time each turn she attacks, she attacks twice. | "Why? Because. It is 3AM." |
| II | Wall Runner | Her attacks also hit the enemy on the floor above. Each kill gives her +1 Attack for the fight. | "The shortest path between two floors is a wall." |
| III | Furniture Destroyer | Every kill gives +2 Attack for the fight. At 14 or more Attack, her hits push every enemy on the floor down one floor. [TWIST: Knock It Off] | "Nobody asked who needed that vase." |

Tier totals: Path A is the support late-game engine (best with Purr and Kneading), Path B the safest, Path C the fastest kill speed and snowball.

### 7.3 Sample Champion 2: Shadow, Mouser of the Third Stair (black cat, ambush themed)
Base: cost 1, Attack 8, Health 18, Innate. "Ambush: her first hit each fight deals double damage."

**Path A: Pounce Protocol (burst)**
| Tier | Node | Effect | Flavor |
|---|---|---|---|
| I | Coiled Spring | Ambush now deals triple damage. +3 Attack. | "Patience is just violence on a delay." |
| II | Mark the Prey | At the start of each fight, Mark the strongest enemy. Marked enemies take +50% damage from Shadow. | "She chose you before you chose the stairs." |
| III | Perfect Pounce | Ambush resets whenever Shadow kills an enemy, once per turn. Kills draw 1 card. | "One more mouse. Always one more mouse." |

**Path B: Knock It Off (control) [TWIST: Knock It Off, else replace with Hobble effects]**
| Tier | Node | Effect | Flavor |
|---|---|---|---|
| I | Paw on the Edge | Her first hit each turn pushes the enemy down 1 floor. | "Eye contact. Slow push. Gravity does the rest." |
| II | Gravity Believer | Enemies that land on a lower floor take 4 Shatter damage (up from the baseline). Shadow gains +2 Attack per enemy Shattered this fight. | "The floor was not asking for that mug." |
| III | Rearranger of Worlds | Every turn, push the front enemy on each floor down 1 floor. Enemies cannot climb past a floor where Shadow stands unless they have just been pushed twice. | "She pushes. They fall. Nobody grows." |

**Path C: Box Collector (stealth and Boxes) [TWIST: Boxes]**
| Tier | Node | Effect | Flavor |
|---|---|---|---|
| I | Cardboard Lover | At the start of each fight, create a Box on Shadow's floor. In a Box she is hidden. +2 Attack. | "If it fits, she sits. If it does not fit, she sits anyway." |
| II | Box Within a Box | Boxes on her floor give +3 Attack to cats inside them. When a Box is destroyed, she creates a new one on any floor. | "Nested. Like Russian dolls but disappointed." |
| III | Pandora's Box | Once per turn, when she leaves a Box, she deals 10 damage to every enemy on the floor. The Box then reforms next turn. | "She was never in the box. The box was in her." |

## 8. Evolution: kitten to cat to legend

Evolution chain cards are three linked card definitions (`evolvesTo` pointers) that share a deck instance. They are drafted as Kittens (cheap, weak) and grow over the run.

**Growth rule:** An evolution-chain card gains +1 Growth for each fight in which it was played at least once (cap 3 per stage). When Growth is 3, the card glows and the next Post visit or Rest Nook offers **Growth Spurt** (free): Kitten becomes Cat, with a short animation (small cat stretches).

**Legend rule:** Cat to Legend needs (a) a card-specific **Legend Quest** shown on the Cat card, such as "Win a fight with this on the Attic", and (b) the **Legend Ceremony** at a Post for 90 Fish. Only possible from the Sisal Post onward (Act 2).

**On evolve:** keeps all scratches, Fork, Kneading numbers, Mastery rank. Plays progress and Growth reset to 0. Gains +1 slot (1, then 2, then 3 total). [TWIST: Nine Lives] gains +1 life per stage.

| Chain | Stage | Cost | Atk/HP | Effects |
|---|---|---|---|---|
| Biscuit (Knead chain) | Biscuit Kitten | 1 | 2/6 | Knead 1: +1 Attack on play. |
| | Biscuit Cat | 2 | 4/12 | Knead 2. Purr 1. Quest: kneaded +6 total. |
| | Biscuit the Great | 2 | 7/20 | Knead 3. Purr 2. Whenever any Knead triggers, heal the Sunbeam 1. |
| Pip (Hunter chain) | Pip | 1 | 3/4 | Pounce. |
| | Pippin the Mouser | 2 | 6/8 | Pounce, Ambush. Quest: kill 6 enemies with Ambush. |
| | Pip, Terror of the Pantry | 2 | 10/12 | Pounce, Ambush twice per fight. Kills draw 1. |
| Yarn (Treat chain) | Yarn Ball | 1 | treat | Attached enemies lose 1 floor of climb. |
| | Tangled Skein | 1 | treat | Chains two cards: playing a second Yarn card this turn costs 1 less. Quest: play 4 Yarn cards in one fight. |
| | The Whole Sweater | 2 | treat | All enemies on this floor are Tangled for 2 turns and take 3 damage when they break free. |

Kittens are intentionally bad on their own and the player pays in tempo for the payoff. They also work as great targets for Kneading and Mastery before they evolve.

## 9. Mastery: use it and it grows

Every card instance has a hidden play counter. Counted plays per card per fight are capped at 3 (stops cost-0 cycle farming). Thresholds are per card type, listed on the card definition; defaults below.

| Rank | Default plays | Unit gain | Spell gain | Treat gain |
|---|---|---|---|---|
| 1 | 3 | +1 Attack | +1 value | +1 charge |
| 2 | 7 | +3 Health | +1 value | +1 value |
| 3 | 12 | Card's named Mastery Bonus | Card's named Mastery Bonus | Card's named Mastery Bonus |

```js
mastery: { thresholds: [3, 7, 12], gains: [ {stat:"attack",value:1}, {stat:"health",value:3}, {named:"mastery_claw_swipe"} ] }
```

Sample named Rank 3 bonuses:
- **Claw Swipe: Seasoned Swiper.** Costs 0 the first time it is played each turn.
- **Hairball Cough: Practiced Hacker.** Hairballs created by it deal +2 damage.
- **Loaf Stance: Loaf Master.** Also works on adjacent floors.
- **Duchess Marmalade (Champion):** thresholds 4 / 9 / 15 as in section 7.1.

UI: three paw pips under the art fill as plays accumulate; rank up produces a gold paw stamp and a "MASTERED" ribbon. Mastery persists across all fights in the run, and survives scratches, forks and evolution. It resets (rank to 0) on Transform, but a Litter copy keeps ranks and resets only progress (see section 11).

Mastery vs Kneading: Mastery is passive and rewards using a card. Kneading is an explicit card effect that scales directly.

## 10. Kneading: permanent in-run stacking

Kneading is a keyword, **Knead N**: whenever the card does the trigger written on it (default: when played), it gains a permanent bonus. Shown with gold numbers, for example `Attack 4 (+3k)`.

```js
{ keyword: "knead", n: 1, stat: "attack", trigger: "onPlay", cap: 12 }
```

- Default Knead: onPlay, +N to Attack (units) or value (spells). Variants: "Knead 1 on kill", "Knead on Cuddle", "Knead on Rested".
- Cap: a card can gain at most 12 Knead points in total, shown on the card as a pie of paw prints. Champions have their own limit of 20.
- Post Knead (15 Fish): +1 Attack/Health/value, max +2 per card (anyone can knead; only Knead cards go higher).
- Kneading carries through Evolution as flat numbers. On Transform, Kneading halves (round down).
- Balance note: Knead 1 card played every fight gains ~12 Attack by Night 9. Knead cards should have a low base so this stays bounded.

Sample Knead cards (for the card agents):
| Card | Cost | Stats | Knead |
|---|---|---|---|
| Kneady Kitten | 1 | 2/6 | Knead 1 onPlay (attack) |
| Biscuit Baker | 2 | 3/10 | Knead 1 onPlay (health) and onKill (attack) |
| Muffin Tin | 1 | treat | Knead 1 onPlay (value): "Heal the floor 2 (+1 per kneaded)" |

## 11. Remove, Transform, Duplicate

### 11.1 Adopt Out (card removal)
- Where: shop Adoption Desk, event "A Nice Family Visits", and as a Rest Nook choice (replacing the heal, once per act).
- Price: first Adopt Out per Act is **free**, later ones cost 50 Fish, +25 each time (50, 75, 100 ...).
- Every adopted card sends **Postcards**: +2 Fish after every battle per adopted card (cap 12 per fight). Cards with Scratches refund 10 Fish per scratch immediately.
- Cannot adopt Champions, quest cards, Status/Curse cards (Curses use "Flush" at events instead).
- Strays (starting deck cards tagged `stray`) cost 0 to Adopt Out, always.
- Flavor line on confirm: "They will be loved. The sofa has been warned."

### 11.2 Box Swap (transform)
- Where: shop (40 Fish), events (free, random), and a Rest Nook option.
- Put the card in a box: choose from 3 random cards of the same rarity from the player's two clans (or 4 with the relic **Box Permit**), or 1 random card if free.
- What carries over: scratches that still fit (up to the new card's slots), the Fork is lost (unless the new card has the same fork family).
- What resets: Mastery rank 0 and Kneading halved (round down).
- Cannot transform Champions or evolution-chain cards in a Kitten stage that has more than 1 Growth.
- Flavor: "It is a box. It is now also a different cat."

### 11.3 Litter (duplicate)
- Where: shop service (80 Fish +40 per prior Litter in the run) and events.
- The copy is a new instance with the same scratches, fork and Kneading, and Mastery rank kept, but plays counter reset to 0, origin = "litter".
- Limit: max 2 copies of any Rare, max 3 of any other card (a Litter on a limit card is disabled with tooltip).
- Not allowed on Champions, evolution-chain cards at Legend stage, Curses.
- Flavor: "Congratulations, it is two."

## 12. Relic synergies

Relic effects are data (`relics.js`, owned by the relic agent). The following hooks must exist in the upgrade system so relics can tie in:

| Relic id | Name | Effect | System touched |
|---|---|---|---|
| rl_emery_board | Emery Board | The first scratch at each Post node is applied to TWO cards (choose second). | Post |
| rl_sisal_sweater | Sisal Sweater | Post offers show 1 extra scratch. | Post |
| rl_catnip_whetstone | Catnip Whetstone | Shop Post Stall prices -25%. | Stall |
| rl_tally_stick | Tally Stick | Mastery thresholds are reduced by 1 (min 2). | Mastery |
| rl_practice_mat | Practice Mat | Cards played at least once in a fight count 1 extra play toward Mastery per fight. | Mastery |
| rl_biscuit_blanket | Biscuit Blanket | Knead gains are doubled for the first Knead trigger each fight. | Kneading |
| rl_birth_certificate | Birth Certificate | Kitten Growth thresholds are 2 instead of 3. | Evolution |
| rl_legendary_collar | Legendary Collar | Legend Ceremony costs 0. | Evolution |
| rl_adoption_papers | Adoption Papers | Adopt Out always costs 0, Postcards give 3 Fish. | Adopt Out |
| rl_box_permit | Box Permit | Box Swap shows 4 choices and keeps Mastery. | Transform |
| rl_milk_mirror | Milk Mirror | First Litter each Act is free. | Litter |
| rl_wanderlust_collar | Wanderlust Collar | One Champion tier node may come from another path. | Champion |
| rl_pedigree_papers | Pedigree Papers | Champion starts with Tier I already chosen. | Champion |
| rl_whittle_kit | Whittle Kit | All cards gain +1 Scratch Slot at the start of each Act (max 3). | Slots |

Interactions worth noting (to tell the balance agent):
- Tally Stick + Practice Mat makes Mastery ranks arrive roughly twice as fast, supporting cycling decks.
- Biscuit Blanket + Biscuit chain is intended to be one of the "broken-feeling loops" (pillar 1).
- Adoption Papers plus Postcards creates a thin-deck engine, but Postcards cap prevents runaway Fish.
- Emery Board + Whittle Kit is a deliberate upgrade-overload build; the cap of 3 slots bounds it.

## 13. Pacing and where the feeling comes from

| Phase | New power the player gains | Visible moments |
|---|---|---|
| Night 1 to 3 (Act 1) | 2 free scratches, Champion Tier I, Kitten Growth 1 to 2, first Mastery pips | Champion collar appears, first "MASTERED" stamp at around Night 3, first Growth Report |
| Night 4 to 6 (Act 2) | 2 free scratches plus shop purchases, Champion Tier II, first Evolution, first Fork | Cards visibly change art with Forks, Kitten becomes Cat |
| Night 7 to 9 (Act 3) | 2 free scratches, Champion Tier III, Legend Ceremony, Rank 3 Mastery bonuses | Legend cards, tier 3 scratches, huge Kneading numbers |

Why this creates continuous growth:
1. Decisions come every few minutes (Post, Perch, Stall, Desk), but even between decisions Mastery and Kneading tick in battle, so the deck is never static.
2. The Growth Report converts passive increases into a moment of reward after every fight.
3. Kitten and Knead seeds are best drafted early, so the draft is also an investment decision: take a strong card now or a weak card that becomes great.
4. Late choices (Champion III, Legend, Rank 3) have large visible effects, so the finale of the run feels like arriving.
5. The player can steer: all upgrade sources are choices with previews, so growth feels earned rather than random.

Anti-snowball guardrails: scratch caps (3 slots), Knead cap 12 (champion 20), 3 counted plays per card per fight, cost reducers share one exclusivity group, tier 3 scratches gated to Act 2+, Litter and Adopt Out costs escalate.

## 14. Implementation checklist for coders

1. `data/upgrades.js`: `window.UPGRADES` (schema in section 4), `data/champions.js`: tier nodes per path, `data/evolutions.js`: chain pointers and quests.
2. `engine/upgrade.js`: `canApply(inst, upgradeId)`, `rollPostOffers(rng, postLevel, inst)`, `applyUpgrade(inst, id)`, `previewCard(inst, id)`, `getEffectiveCard(inst)` (order per section 2), `countPlay(inst, fightState)`, `checkMastery(inst)`, `checkGrowth(inst)`.
3. `ui/post.js`: card grid, offer row, ghost preview, reroll button, services list.
4. `ui/growthReport.js`: end-of-fight list.
5. Save: instance objects as in section 2, serialized in the run JSON in try/catch localStorage.
6. Deterministic RNG: use the run seed plus node id for Post offers so a reload cannot reroll them.

## Open questions for the lead
1. Is Nine Lives locked? Several upgrades (Lucky Life, evolution lives) have a fallback; confirm so we can delete the conditional text.
2. How many battles per run (this file assumes about 18)? Mastery thresholds 3 / 7 / 12 and the 3-plays-per-fight cap depend on it.
3. Is Knock It Off and Boxes locked? Champion 2 Paths B and C and some scratches rely on them.
4. Should Champion Tiers also be purchasable early (currently yes at Post prices), or strictly tied to Perch nodes?
5. Are 2 Posts per act plus a shop stall too generous? Cutting to 1 Post per act would raise the importance of every scratch.
