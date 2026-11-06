# B05: Champions of the Alley and Hearth clans

File: src/data/champions-ah.js (SB.data.championsAH, plus SB.data.championsAHTokens).
Tiers unlock at Nights 2, 5, 8. Each tier is a pick of 1 from 3 (paths A, B, C). Options are additive and
self contained, so any mix is legal (treeRule "free"). Picking the same path at all three tiers unlocks that
path's Final Form bonus. Set treeRule to "lock" to get A06's path lock. Engine needs are in the NEEDS block
at the top of the data file.

## Alley

### Shadow, Mouser of the Third Stair (adapted from A06, black cat, cost 1, 8/18)
"I was never here." Innate, Pounce 1, Ambush (first hit doubled), so she opens most fights with a 18 damage strike.
- A Pounce Protocol, final fantasy "Apex Mouser": an assassin who triples her first hit, Marks the biggest pest
  every turn (Marked feeds the whole team and gives killers Claws), re-arms Ambush on every kill and draws a card.
  Final form sweeps her Pounce across the whole floor. Plays like a sniper that keeps reloading.
- B Knock It Off, "Gravity Tabby Supreme": the controller. Every turn she shoves the front pest on every floor,
  Knocks hit for extra Shatter, she grows from every fall, and her Knocked pests land Dizzy. Plays like a
  waterfall machine; pests spend the night climbing the same stairs.
- C Box Collector, "Mistress of the Warehouse": hides in a Box, buffs boxed cats, and bursts out for 10 to all pests
  on her floor once per turn (15 in final form, Boxes never wear out). Plays like a trap that resets itself.

### Mad Maxine, Queen of the Bin Lids (original, cost 2, 4/24)
"You and what sofa?" Innate Decoy who gains Claws each time she is hit. Strong alone, better with company.
- A Bin Lid Bulwark, "Queen of the Bin": tank that scales. Fluff, thorns equal to Claws, then Fluff equal to Claws
  each turn. Final form hits every pest on the floor whenever she is hit. Plays like a snowball with a lid.
- B Frenzy Fury, "Whirling Dustbin": glass cannon blender. Attacks twice, then three or four times, kills feed Frenzy
  and Claws, and she stops paying Health for it. Final form spreads extra hits across all floors.
- C Gang Boss, "The Whole Gang": wide board. Summons Alley Recruits, recruits another on each kill, buffs the crew,
  and eats the death of her friends for Claws. Final form fills the floor and refills on every Witching Hour.

## Hearth

### Duchess Marmalade (A06 tree, rewritten as additive options, cost 2, 6/30)
"Sit. Stay. Be healed." Innate, Retain, Purr 2, heals the floor when she Naps.
- A Lap Warden, "Sunbeam Sovereign": grows after every fight, heals the Sunbeam, then heals all cats on every floor,
  with one free save per fight. Final form turns overheal into Fluff. Plays like a whole support deck in one card.
- B Loaf Fortress, "Loaf Fortress Unbreakable": Decoy, Bristle, Fluff 6 plus 8 per Nap, Naps without skipping attack.
  Wakes as a bomb: Stretch deals her Fluff to the floor. Final form doubles Fluff gain. A wall that explodes politely.
- C Zoomie Menace, "Witching Hour Duchess": two hits per turn, wall running hits on the floor above, Knock at 14 Claws.
  Final form Zooms twice at the Witching Hour and is never Frazzled. The cozy cat that cannot be left alone at 3AM.

### Brother Crumpet, Abbot of the Warm Oven (original, cost 2, 3/22, unlock after clearing Act 1 with Hearth)
"There is always room on the loaf." Counts as 2 cats for Pile, adjacent cats +1 Power and heal 1 per turn.
- A Heap Master, "Abbot of the Heap": wide Pile engine. Fluff and Purr while the Pile holds 3, Heap at 3 cats,
  Pile bonus doubled in final form. Plays like a mountain of cats that cannot be moved.
- B Master Baker, "Michelin Cat": tall Knead engine. Gets +1 Power and +2 Health every turn, a Fresh Biscuit every
  turn (two with the Starter), doubled Knead. Final form opens every fight with 3 Biscuits that also heal the Sunbeam.
- C Sleeper Agent, "Dreaming Abbot": Nap team burst. Cats Nap on arrival, Rested comes in extra, one Wake wakes
  everyone, and the whole floor Stretches together. Final form: arriving cats have Rested 2, Stretch +1 per stack.

## Standout combos and hybrids
- Shadow A+B: Marked prey gets Knocked into Shatter while she keeps Ambush ready. Maxine A+B: Frenzy hits trigger
  her Claws-based thorns only when hit, so pair with Decoy Fluff; a deliberate tradeoff.
- Duchess B + Crumpet C (not both champions in one run, but the same cards): Nap cats plus Fluff bomb.
- Crumpet B Biscuits heal cats, so Duchess-style Purr is not needed to keep a Frenzy Maxine alive.

## Open items for the lead
1. treeRule free versus lock. Free gives hybrids and clearer pick-1-of-3 each night, lock follows A06 literally.
2. Maxine's Gang Boss and Shadow's Pandora's Box both fight for cat slots on a 4 slot floor; summons fail silently when full.
3. Final Forms are an extra reward for loyalty. If the balance agent finds them too strong, remove the final form ops
   and keep the names as cosmetic upgrades.
4. Per A07 one champion per clan starts unlocked: Shadow (alley) and Duchess (hearth). Maxine unlocks on clearing Act 1 with Alley, Crumpet on clearing Act 1 with Hearth. Change in unlock fields if needed.
5. Validator in A03 12 expects a/b slots at nights 3, 6, 9; update to options[3] at nights 2, 5, 8.
