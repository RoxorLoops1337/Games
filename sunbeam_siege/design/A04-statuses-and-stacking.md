# A04: Statuses and Stacking (canonical)

Scope: 19 in-fight statuses, floor-level stacks, stack interactions, 12 combos. Everything here resets at fight end unless it says "Run".
Naming rule: status names are Title Case in UI, ids are lower_snake in data (claws, purr, fluff, hiss, yarn, catnip, crash, rested, hairball, wet, scared, dizzy, rage, frenzy, shatter, marked, hidden, bristle, cozy).

## 1. Core rules (read first)

### 1.1 Round phases and tick points
One round = one player turn plus the pest response. Phases in strict order:
1. DAWN: draw 5, refill Zoomies (energy) to 3, resolve "start of turn" effects. Rested pays out here.
2. PLAY: player plays cards freely. Unit/status gains apply instantly.
3. POUNCE: player ends turn. On each floor, cats attack left to right. Hidden is revealed after the cat attacks.
4. PROWL: surviving pests on each floor attack left to right (cats first in line, then the Sunbeam if on Attic). Hiss, Scared, Dizzy, Rage resolve here.
5. CLIMB: every pest that is not Yarned moves up one floor. Pests on the Attic that survived PROWL have already hit the Sunbeam, so they loop back to Cellar only if the encounter says so (default: they stay and hit again each PROWL).
6. DUSK: all duration and decay ticks happen here, in this fixed order: Wet, Dizzy, Scared, Yarn, Hiss, Marked, Hidden, Crash, Purr (heal), Rage, Cozy recount. Then discard hand.

Zoomies Turn (every 3rd round): the Night Clock rules come from the Night Clock designer. For statuses: Frenzy and Catnip gain +1 on a Zoomies Turn DAWN, Rested does not pay out (cats are awake).

### 1.2 Stack kinds (three only)
- I = Intensity. Number is the strength. Does not tick down on its own. Adding stacks adds numbers.
- D = Duration. Number is turns left. Effect is fixed, not scaled by the number. Ticks down 1 at DUSK. Adding stacks adds turns. At 0 the status ends.
- ID = Decaying intensity. Number is strength and it loses 1 at DUSK (or the amount stated). Best of both, so it caps lower.

UI: stack number sits bottom right of the icon. I = white number, D = number inside a small clock ring, ID = white number with a down tick mark. Icon tint: buff green outline, debuff red outline, neutral amber outline.

### 1.3 Damage order (single source of truth)
1. Base damage of the attack.
2. Add flat bonuses: Claws, card bonuses (additive, order irrelevant).
3. Percent bonuses and penalties added together as one percent: Marked +50%, Wet pest +0% (see Wet), Rage none, Frenzy none, Dizzy none. Hiss is flat, not percent (step 5).
4. Round down, minimum 0.
5. Attacker Hiss: subtract Hiss stacks, minimum 0 (only matters for pest attackers; cats cannot gain Hiss, only apply it).
6. Defender Fluff absorbs first, 1 stack per 1 damage.
7. Remaining damage hits Health (cat/pest) or Warmth (Sunbeam).
8. Bristle and Shatter triggers fire after damage is final.

### 1.4 Caps and limits
- Global cap on any stack: 99 unless the row says lower. Hard cap on displayed digits: 2.
- A status with 0 stacks is removed at once.
- "Cleanse" (card keyword) removes all debuffs from a cat. "Purge" removes all buffs from a pest. Neither touches Marked on a pest or Cozy.
- Multi-hit attacks: Hiss and Fluff apply per hit. Claws apply per hit. Marked percent applies per hit.
- Immunities: bosses are immune to Yarn root (they take Yarn as slow, see Yarn) and Scared. Elites immune to Dizzy stacks above 3. Nothing is immune to Marked, ever (hunting needs targets).

## 2. The 19 statuses

Format: Icon | Kind | Tick | Max | Gain | Remove | Who. Flavor is one line.

### CAT BUFFS

**1. CLAWS** | Icon: three scratch lines in an orange arc | Kind: I
- Effect: each stack adds +1 damage to every attack that cat makes (per hit).
- Tick: none. Persists whole fight.
- Max 30.
- Gain: Sharpen cards (+1 to +3), Scratching Post room, killing a Marked pest (+1 to the killer), Frenzy trigger, Catnip peak.
- Remove: Wet halves it (round down) the moment Wet is applied, once per Wet application. A cat that dies and spends a life returns with Claws halved. Nothing else.
- Who: cats only. Sunbeam and floors cannot hold it. Pests get Rage instead.
- Flavor: "Not a weapon. A hobby that got out of hand."

**2. PURR** | Icon: wavy sound lines inside a heart | Kind: I (floor-wide aura counted separately, see 3.1)
- Effect: at DUSK, the cat heals Purr stacks of Health, then the stack is not consumed. Purr also adds to the floor Purr Aura (3.1).
- Tick: heal at DUSK (after Crash, before Rage, per the order in 1.1).
- Max 12 on a cat, aura cap 40.
- Gain: Purr cards (+1 to +4), being petted by a Treat room (+1 per DUSK), Rested payout (+2), Cozy bonus.
- Remove: Scared removes all Purr from that cat. Wet halves it. A stunned or dead cat loses it.
- Who: cats, Sunbeam (see Sunbeam rules 3.4). Not pests.
- Flavor: "A small engine of contentment. Do not look under the hood."

**3. FLUFF** | Icon: a round cloud with two ear tips | Kind: I
- Effect: absorbs 1 damage per stack, taken before Health (step 6).
- Tick: halves (round down) at DAWN of the next round. Fluff is the only I status that decays, so it is flagged "fades by half". This stops infinite armor stacks.
- Max 50.
- Gain: Fluff cards (+3 to +10), Cozy (+1 per cat in pile at DAWN), Bristle cards.
- Remove: absorbs damage, Wet blocks all new Fluff gain on that cat, Shatter-on-self effects.
- Who: cats, Sunbeam (a "Warmth Ward", absorbs before Warmth), pests (rare, dogs and Vacuum have "Fluff" listed as Armor).
- Flavor: "Every cat is 40 percent fur and 60 percent opinion."

**4. RESTED** | Icon: closed eye with a Z | Kind: I
- Effect: at DAWN, pay out then clear. Each stack gives +1 Claws (permanent for the fight) and +1 Purr to that cat, to a max of 3 Claws per payout.
- Gain: a cat that did not attack during POUNCE (nothing to hit, or told to nap by a Nap card, or Sleeping Bag room) gains 1 Rested at DUSK. Nap cards give 2 to 3. A cat that Naps 2 rounds in a row gets +1 bonus Rested (the "Deep Sleep" rule, Naps stack).
- Max 6.
- Remove: cleared on payout. Scared or hit by any damage removes 1 (cat is woken up).
- Who: cats only.
- Flavor: "Sixteen hours a day, and the other eight are for planning."

**5. HIDDEN** | Icon: cardboard box with two eyes peeking | Kind: D
- Effect: pests cannot choose this cat as a target (pests skip to the next cat on the floor; if all cats on the floor are Hidden they attack the Sunbeam only if on Attic, else lose the action). The first attack by a Hidden cat deals +2 damage (Ambush). Ambush is lost when Hidden ends.
- Tick: -1 at DUSK. Normally 1.
- Max 2.
- Gain: placed in a Box on the floor (2.2 Box rules), Sneak cards, relic Cardboard Fort.
- Remove: ends when the cat attacks (after Ambush resolves), or at 0.
- Who: cats only.
- Flavor: "If it fits, I sits. If I sits, you cannot see me. Science."

**6. BRISTLE** | Icon: hair-raised tail, spiky | Kind: I
- Effect: when this cat takes damage from a melee pest attack (after Fluff), deal Bristle damage back to the attacker. Does not trigger on poison-like (Dizzy) or Hairball damage.
- Tick: none.
- Max 15.
- Gain: Puff Up cards (+2 to +4), Bath survivor relic.
- Remove: Wet removes all Bristle (a wet tail is a sad tail).
- Who: cats and pests (spiked enemies like the Hedgehog).
- Flavor: "A threat display. The threat is mostly dignity."

**7. COZY** | Icon: stacked yellow cushions | Kind: I
- Effect: Cozy is a floor-derived status shown on each cat in a pile. Equal to Pile Size minus 1 for that cat (see 3.2). Each stack gives +1 Fluff at DAWN and +10 percent Purr heal (added into the Purr total).
- Tick: recounted at DUSK from the current layout.
- Max 4 (pile size 5).
- Gain/remove: automatic. Never put on directly by cards, but cards can say "counts as +1 Pile Size".
- Who: cats only.
- Flavor: "Warm bodies. Mixed loyalties."

**8. FRENZY** | Icon: a spiral eye with sparks | Kind: ID
- Effect: the cat attacks (Frenzy + 1) times per POUNCE against random valid targets on its floor, but also takes 1 Health damage each time it attacks beyond the first. Each extra hit still adds Claws.
- Tick: -1 at DUSK. Doubles its initial stack on a Zoomies Turn.
- Max 5.
- Gain: Zoomies cards, Catnip peak (spillover), killing 2 or more pests in one POUNCE.
- Remove: ticks off. Dizzy on the cat removes it.
- Who: cats only (the pest equivalent is Rage).
- Flavor: "3 AM. Why is it always 3 AM?"

**9. CATNIP** | Icon: green leaf with a halo | Kind: I
- Effect: a burst resource. At 4 or more Catnip, the cat enters "Peak": its attacks deal +100 percent damage (counts in step 3 percent), and it ignores Scared and Dizzy. Peak lasts as long as Catnip stays at 4+. Each stack held beyond 4 adds +1 Claws.
- Tick: -2 at DUSK. When it drops to 0 from Peak, Crash is applied (status 10).
- Max 10.
- Gain: Catnip cards (+3 to +6), Nip Bag relic (+1 every DAWN).
- Remove: ticks off, Cleanse removes (and still triggers Crash).
- Who: cats only.
- Flavor: "Not a drug. A lifestyle. Be gentle, it will not remember."

**10. CRASH** | Icon: cat flat on its back, spiral eyes | Kind: D
- Effect: cards that target this cat cost +1 Zoomies (min 1 extra per round, max +1), and its attacks deal -2 damage (flat, step 2). Cannot gain Catnip while Crashed.
- Tick: -1 at DUSK. Initial 2 (3 if Catnip hit 8 or more).
- Max 4.
- Gain: automatic after Catnip ends. A Rested cat converts Crash into Purr instead of suffering (see combos).
- Remove: ticks off. Rested payout cancels 1 Crash per Rested spent.
- Who: cats only.
- Flavor: "Remember, kids: the floor is the cure."

### PEST BUFFS

**11. RAGE** | Icon: red angry eyebrow with steam | Kind: I
- Effect: +1 damage per stack to pest attacks (flat, step 2). At 5 or more Rage, pest gains Fluff equal to its Rage at DAWN.
- Tick: +1 at the pest's PROWL if it attacked nothing (frustration). Otherwise none.
- Max 20.
- Gain: pest card text, being Scared, hit by Hiss on a Dog, a Mouse killed adjacent (+1 to all Dogs).
- Remove: Purr aura on the pest's floor of 10+ removes 1 per DUSK (calming). Death. Wet removes half.
- Who: pests only.
- Flavor: "Dogs are not angry. They are enthusiastic in a way that hurts."

### CAT DEBUFFS

**12. WET** | Icon: blue drop with a frown | Kind: D
- Effect on cat: no new Fluff or Bristle gain, Claws halved on application, Purr halved on application, and the cat cannot become Rested or Hidden. Cat attacks are not weakened otherwise.
- Effect on pest (from cat water cards, rare): Slippery. Knock Off pushes 2 floors instead of 1. Shatter on it +50 percent. Yarn on it lasts +1 turn. Rage on it is halved.
- Tick: -1 at DUSK. Attic floor in Sunbeam dries 2 per DUSK instead of 1.
- Max 6.
- Gain: Spray Bottle, Bath Tub, Rain (Cellar leak event), the Puddle hazard room.
- Remove: ticks off, Lick Fur card (removes all), Cleanse, Sunbeam Attic drying bonus.
- Who: cats, pests, floors (see 3.3 Puddle).
- Flavor: "Cats are 70 percent water and 100 percent against it."

**13. SCARED** | Icon: white fur standing up, ghost-face | Kind: D
- Effect on cat: cannot attack and loses all Purr. Cannot move to another floor. Immune to Wet application (too frozen to flinch).
- Effect on pest: skips its PROWL action and moves DOWN one floor instead of climbing at CLIMB (not stopped by Yarn). It takes Shatter on arrival (see Shatter).
- Tick: -1 at DUSK. Initial usually 1.
- Max 3 (bosses immune).
- Gain: Hiss cards at 2+ Hiss on a pest triggers Scared 1 (once per round per pest), Vacuum Cleaner and Cucumber pests on cats, Loud Noise events.
- Remove: ticks off. Catnip Peak ignores it. Cleanse on cats. Brave cards.
- Who: cats and pests.
- Flavor: "It was a cucumber. It was ALWAYS a cucumber."

**14. DIZZY** | Icon: spiral swirl above a head | Kind: ID
- Effect: poison-like. At DUSK, deals damage equal to stacks to the holder, then loses 1. Additionally, a Dizzy pest has a 25 percent chance per stack (max 75) to attack a random adjacent pest instead of a cat during PROWL. A Dizzy cat has the same chance to attack a random floor target (any side).
- Tick: damage at DUSK before decay (order in 1.1).
- Max 20 on pests, 5 on cats.
- Gain: Hairball hit, Spin Chair card, Whirl cards, Dizzy Mousetrap relic.
- Remove: decays, Cleanse, Rested payout (removes 2).
- Who: pests mostly, cats (rarely).
- Flavor: "The room is moving. The room has no right."

### PEST DEBUFFS

**15. HISS** | Icon: open mouth, three fangs | Kind: ID
- Effect: a pest's attacks deal Hiss less damage (flat, step 5, min 0). A pest with 3 or more Hiss cannot buff itself with Rage.
- Tick: -1 at DUSK.
- Max 10.
- Gain: Hiss cards (+1 to +4), Standoff room (+1 on any pest entering the floor).
- Remove: decays, Purge, boss mechanic "Roar".
- Who: pests only.
- Flavor: "A warning. The warning was loud."

**16. YARN** | Icon: ball of red yarn with a trailing thread | Kind: D
- Effect: the pest cannot climb at CLIMB (rooted). It still attacks if cats are on its floor. A Yarned pest takes +1 damage from any attack for each other Yarned pest on the same floor ("tangle").
- Tick: -1 at DUSK.
- Max 4. Bosses take only half duration (round up) and still climb at 50 percent speed (climb every other round).
- Gain: Yarn cards (+1 to +3), Yarn Ball relic (first pest each fight), Knock Off onto a Yarned pest below (adds +1 to both).
- Remove: ticks off, attacked by a Scratch-keyword card removes 1 Yarn but deals +2 damage. Fire/cheek hazard removes all.
- Who: pests only (cats can be "tangled" only by the rare Vet Carrier pest as Yarn-lite, treated as Scared).
- Flavor: "Entirely unnecessary. Absolutely effective."

**17. MARKED** | Icon: red crosshair on a paw print | Kind: I (binary with count)
- Effect: Marked pest takes +50 percent damage from all cats (step 3). If it has 2+ Marked, the first attack on it each round also grants the attacker +1 Claws. Killing a Marked pest returns 1 Zoomies (once per round).
- Tick: none. Counts as 1 effect for percent regardless of stacks, the stacks are for card scaling (cards that say "per Marked").
- Max 5.
- Gain: Stalk cards, a Hunt Mouse reward, being first to enter an empty floor ("fresh prey") +1.
- Remove: death only. Cannot be removed by anything, including Purge.
- Who: pests only.
- Flavor: "It does not know it has been chosen. That is the fun part."

**18. SHATTER** | Icon: broken blue vase | Kind: I (event counter, not displayed on cats)
- Effect: an extra-damage flag. When a pest is Knocked Off (pushed down a floor) it takes Shatter damage equal to 3 + (number of items cats have Knocked this fight, the Clutter count, max +6). If it lands on a pest, that pest takes half of it (round down) as collision.
- Tick: none.
- Max: Clutter count 9 (so Shatter max 3 + 6 = 9).
- Gain: Shatter is a trigger, not a stack on the pest. UI shows a red crack tooltip on pests with the damage the next Knock Off would deal.
- Remove: Knock Off resolves, or the pest is Wet (Wet raises it, not removes).
- Who: pests (trigger target), floors (Clutter count lives on the floor, 3.5).
- Flavor: "Not an accident if it was a vase."

**19. HAIRBALL** | Icon: a damp grey tumbleweed | Kind: I
- Effect: a pest with Hairball takes Hairball stacks as damage at DUSK, the hairball then half-stays (loses half, round down). A pest with 5+ Hairball is "Gagging" and cannot Rage. Hairballs are also created as 0-cost curse-like cards for the player: "Hairball" card, exhaust, applies 3 Hairball stacks.
- Tick: damage at DUSK, then halved (round down).
- Max 15.
- Gain: Cough Up cards, coughed after a cat has eaten Treats (Treat room trigger), Crash converts into 1 Hairball per Crash stack at the pest nearest.
- Remove: halves each DUSK, Cleanse on cats if a cat has swallowed one (rare), Wet on the pest makes it spread (see combos).
- Who: pests (and cats via the curse "Hairball on the Rug" event, as Dizzy-lite).
- Flavor: "Delivered, as always, at 4 AM, to the exact center of the rug."

## 3. Floor-level and Sunbeam stacking

### 3.1 Purr Aura (floor stack)
- Each floor has a Purr Aura value = sum of Purr stacks of cats on that floor, capped 40.
- Thresholds (checked at DUSK after healing):
  - 5: all cats on the floor heal +1 extra.
  - 10: pests on the floor lose 1 Rage per DUSK (see Rage).
  - 20: cats on the floor gain +1 Fluff per DAWN.
  - 30: the first pest killed on this floor each round returns 1 Zoomies.
  - 40: "Full Motor": the floor's cats are immune to Scared and heal +3 extra. Maximum payout, no further effect.
- The UI shows a thin warm-yellow bar along the floor edge, with notch marks at 5, 10, 20, 30, 40.
- Aura persists only while cats with Purr are on the floor. If cats leave, aura recomputes at the next DUSK.

### 3.2 Pile Size (Cuddle Pile)
- A pile is a run of adjacent cats on the same floor with no gaps. Pile Size = length of the largest run.
- Cozy for each cat in a pile of size S = S minus 1 (max 4).
- At pile size 3 or more the pile also shares Fluff gain: when one cat gains Fluff from a card, each other pile cat gains half (round down).
- At pile size 5 the "Heap" forms: all pile cats count as Hidden to pests that did not climb this round (hard to find in the heap), and Purr heals the pile as a pool (damaged cats first).
- Floor capacity is 5 cats. Leaving the pile (moving to another floor) removes Cozy at once.
- Pile bonuses recount at DUSK.

### 3.3 Floor statuses
Floors can hold up to 2 floor statuses at once.
- **Puddle** (Wet floor): at DUSK all cats on the floor gain 1 Wet. Dries by 1 per DUSK, removed by a Heat Lamp room. Pests on a Puddle floor are Slippery (Wet effect on pest) for the duration.
- **Clutter** (Knocked items): each Knock Off adds 1 Clutter (max 9) to the floor. Clutter raises Shatter damage (+1 each, to max +6). Clutter cleared when the floor is "Tidied" by an event only (so cats feel guilty).
- **Box** (room): holds 1 cat. A cat placed in a Box gains Hidden 1 and +1 Fluff per DAWN. Box counts as 1 Pile Size neighbor for Cozy (a Box cat is adjacent to both neighbors).
- **Heat Lamp / Sunbeam patch**: Attic only by default. Dries Wet by 2 per DUSK and gives +1 Rested per Nap.
- Floor statuses show as a small band at the bottom of the floor, 24px tall.

### 3.4 Sunbeam rules
- The Sunbeam can hold: Fluff (Warmth Ward), Purr (heals Warmth), Wet (rain through the window, reduces Warmth Ward gains).
- Warmth Ward absorbs before Warmth. Fades by half at DAWN like cat Fluff.
- Sunbeam Purr: equals the Attic aura / 10 rounded down, heals Warmth that many points at DUSK (max 3 per round). It cannot heal above Warmth max.
- The Sunbeam is never Scared, Marked, Dizzy or Hidden.

## 4. Stack interactions (general rules)

| Rule | Interaction | Result |
| --- | --- | --- |
| R1 | Wet + Claws | Claws halved on Wet application, once per application. Re-applying while Wet does not halve again. |
| R2 | Wet + Purr | Halved on application. Purr aura recomputes. |
| R3 | Wet + Fluff | New Fluff gain blocked while Wet. Existing Fluff stays. |
| R4 | Scared + Purr | Scared removes all Purr from that cat. |
| R5 | Scared + pest | Pest retreats one floor and takes Shatter. |
| R6 | Catnip + Crash | Catnip drop to 0 triggers Crash. Rested cancels 1 Crash per Rested spent. |
| R7 | Rested + Dizzy | Rested payout removes 2 Dizzy. |
| R8 | Hiss + Scared | Hiss 2+ on a pest gives Scared 1 once per round. |
| R9 | Hiss + Rage | Hiss 3+ blocks Rage gain. |
| R10 | Marked + any | +50 percent damage, binary, does not stack past 1 application in step 3. |
| R11 | Yarn + Yarn | Tangle: +1 damage per other Yarned pest on the floor. |
| R12 | Yarn + Knock Off | Pushed pest adds 1 Yarn to the pest it lands on. |
| R13 | Hidden + Marked | Ambush +2 becomes +4, and Marked +50 percent applies, so Hidden strikes on Marked prey are the biggest first hit. |
| R14 | Frenzy + Dizzy | Dizzy removes Frenzy. Dizzy pests hit by Frenzy cats take extra Dizzy damage. |
| R15 | Hairball + Wet | A Wet pest with Hairball spreads half of its Hairball to adjacent pests at DUSK. |
| R16 | Cozy + Fluff | Cozy adds Fluff at DAWN. Fluff halving happens at the SAME DAWN before Cozy (halve first, then add). |
| R17 | Purr Aura 10 + Rage | Pests on that floor lose 1 Rage per DUSK. |
| R18 | Shatter + Wet pest | +50 percent Shatter and 2 floor push. |
| R19 | Bristle + Wet | Wet removes Bristle. |
| R20 | Dizzy + Bristle | Dizzy damage does not trigger Bristle. |

Stack precedence (when two things happen at DUSK): Wet, Dizzy, Scared, Yarn, Hiss, Marked, Hidden, Crash, Purr heal, Rage, Cozy recount.

## 5. The 12 synergy combos

Each combo is deliberately discoverable: 2 or 3 cards plus a rule, no more than 3 steps.

| # | Name | Steps | Payoff (exact) | Statuses |
| --- | --- | --- | --- | --- |
| 1 | Nap Pounce | 1. Nap two cats in a row (Deep Sleep, 3 Rested). 2. At DAWN, payout gives +3 Claws and +3 Purr. 3. Play a Pounce card on a Marked pest. | A Claws 3 cat with a Marked target: base 6 + 3 Claws = 9, +50 percent = 13 damage on hit one. | Rested, Claws, Marked |
| 2 | Catnip Crash Loop | 1. Play Catnip +6 (Peak, +100 percent). 2. Attack. 3. At DUSK, Catnip drops to 4, still Peak. Next round it hits 2, Crash 2 lands. Rested cancels it. | Loop: Nap card at the right round gives Rested to pay Crash. Net: two rounds of double damage, one of nothing. | Catnip, Crash, Rested |
| 3 | Yarn Bowling | 1. Yarn a pest on Parlor. 2. Knock Off a pest from Attic onto it. 3. Shatter collision. | Lower pest takes half of 3+Clutter, +1 Yarn to both, and tangle gives +1 to each Yarned pest next hit. | Yarn, Shatter |
| 4 | Hairball Splash | 1. Wet a pest (Spray card). 2. Cough Up (Hairball 5). 3. DUSK spread. | Pest takes 5, adjacent pests get 2 each (half, round down), pest is Gagging. | Wet, Hairball |
| 5 | Purr Fortress | 1. Four cats on one floor with Purr 5 each (20 aura). 2. DAWN: +1 Fluff each. 3. Pile Size 4 gives Cozy 3. | Each cat gets +1 aura Fluff plus +3 Cozy Fluff = 4 Fluff per DAWN and heals 5+. Hard to kill. | Purr, Cozy, Fluff |
| 6 | Hiss and Run | 1. Hiss a Dog by 3. 2. The Dog gets Scared 1 (Hiss 2+ rule). 3. It retreats a floor and takes Shatter. | 3 + Clutter damage plus a lost turn, and Hiss 3 blocks Rage. | Hiss, Scared, Shatter |
| 7 | Dizzy Dominoes | 1. Dizzy 4 on a Dog. 2. 75 percent to hit adjacent pest. 3. Dog's Rage grows when hit. | Pests bite each other, Dizzy damages 4 at DUSK and decays. Chaos engine on crowded floors. | Dizzy, Rage |
| 8 | Box Ambush | 1. Place a cat in a Box (Hidden 1). 2. Mark a pest on that floor. 3. POUNCE: Ambush. | Base 5 + 2 Ambush (Hidden) = 7, +50 percent Marked = 10 on hit one, and Marked kill returns 1 Zoomies. | Hidden, Marked |
| 9 | Zoomies Frenzy | 1. Reach Zoomies Turn (every 3rd). 2. Frenzy doubles (2 to 4). 3. 5 attacks for the cat. | A Claws 5 cat attacks 5 times: 5 times (base + 5), cat takes 4 self-damage, but Fluff absorbs it. | Frenzy, Claws, Fluff |
| 10 | Sauna Attic | 1. Put 3 Purr cats in the Attic (aura 15). 2. Heat Lamp dries Wet 2 per DUSK. 3. Sunbeam gets Purr 1 per 10 aura. | Sunbeam heals 1 Warmth per round and Wet never sticks on the top floor. Safe top floor. | Purr, Wet, Sunbeam |
| 11 | Bristle Wall | 1. Puff Up (Bristle 4) on a front cat with Fluff 8. 2. Pests attack. 3. Fluff absorbs, Bristle returns. | Pest takes 4 each attack, cat takes 0 until Fluff breaks. Dog at Hiss 2 deals nearly nothing. | Bristle, Fluff, Hiss |
| 12 | Hunt Chain | 1. Mark 3 pests (Stalk). 2. Kill Marked pest 1: +1 Claws and 1 Zoomies. 3. Chain: each following Marked kill adds +1 Claws. | Zoomies refunded once per round, Claws +1 per Marked kill, a three-kill round gives +3 Claws, +1 Zoomies. | Marked, Claws |

### Combo notes
- All combos use only core rules from sections 1 to 4. No hidden dependencies.
- Combos 5, 10 and 12 are "slow" (3+ rounds to set up), 1, 6 and 8 are "burst". Mix of burst and slow is intentional.
- Cards that enable combos should not be rarer than Uncommon so the player finds at least one combo per run (pillar 1).

## 6. Implementation notes

- Status registry: `STATUSES = { id: { kind:'I'|'D'|'ID', max, side:['cat','pest','floor','sunbeam'], dusk:fn, dawn:fn, onApply:fn, onDamage:fn } }`.
- `addStack(target, id, n)` clamps to max, runs `onApply`, emits `status:changed` for the UI.
- Duration statuses never go below 0. Remove at 0 and emit `status:removed`.
- All DUSK ticks run through one ordered array (see 1.1). Do not iterate over object keys.
- Fluff decay (halve, then Cozy add) runs at DAWN. Use integer division only.
- Never store percent bonuses as floats: use integer percent (50) and apply once at step 4.
- Tooltips: first line "Name N", second line effect text from `desc(n)`, third line the stack kind ("Intensity", "Turns", "Fades"). Keep under 90 chars per line.
- Status icons: 16x16 procedural pixel sprites, outline color by buff/debuff/neutral, number in 6px font.

## Open questions for the lead
1. Fluff halves each DAWN. Is this too punishing compared to Monster Train style persistent armor? Can lock "halve" or "clear".
2. Should Hairball also be a card type (curse) in the player's deck, or only a status? Currently both.
3. Zoomies Turn, Frenzy and Catnip doubling: confirm the Night Clock rules from the other agent so the DAWN rules match.
4. Pest loop back to Cellar after Attic: confirm per encounter or default (currently they stay and hit each PROWL).
5. Do bosses really ignore Yarn rooting, or only half effect? Currently half (climb every other round).
