# Grimhold — the improvement loop

Working document. Each session: pick the top unstarted item(s) from **Next up**,
build them properly (tests + `npm run check` + browser check), ship, then move
the entries to **Done** with a one-line note and promote what should come next.

Keep batches to 2–3 items. A shipped, tested feature beats four half-built ones.

**Rules of the loop**
- Never regress the eleven-quest Quest Book. It is the authored campaign.
- Everything new goes through the headless suite; the browser check is for feel.
- Every mechanic must be legible on a phone in one glance. If it needs a
  paragraph to explain in the HUD, it is the wrong mechanic.
- Prefer *decisions* over *numbers*. A boon that reads "+1 die" is filler; a
  boon that changes how you play a floor is not.

---

## Done

- **Elite monsters with affixes** — champions with visible affixes (Armoured,
  Frenzied, Venomous, Warded, Vampiric, Hulking, Skittering), scaling in
  frequency with depth, worth more coin and Fate. *(batch 1)*
- **Fate dice** — a spendable reroll resource. Reroll any combat roll, once per
  die pool. Earned from elites and bosses. The gamble at the centre of combat. *(batch 1)*
- **Branching descent** — the stair offers two or three floors, each showing its
  modifier, objective and reward before you commit. *(batch 1)*

---

## Next up

1. **Press-your-luck searching.** After a successful search you may search the
   room again. Each extra pull raises the odds of a wandering monster or a trap
   card, and the treasure gets better. Bank or push. Shows the odds explicitly.
2. **Monster abilities.** The `caster` flag on the Chaos Sorcerer is still
   unused. Sorcerers cast (fire bolt / summon / curse), goblins flee at 1 BP and
   alert their room, zombies rise once, mummies curse on hit, chaos warriors
   parry the first blow each turn, gargoyles step over furniture.
3. **Shrines and cursed altars.** A room feature you may use once: pray for a
   random blessing, or bleed a Body Point on the altar for a boon. Both tables
   contain something bad.

## Backlog, roughly in order of value

### Gamble
- **Double or nothing** on the floor's gold at the between-floors screen: one
  combat die, skull doubles the pot, black shield takes it.
- **The Warlock's Wager.** Spend Fate to reroll the *entire draft*.
- **Blood price boons.** A second, stronger boon offered beside the three, which
  costs maximum Body Points instead of nothing.
- **Forced chests.** Open carefully (small, safe) or force it (better, may be
  trapped or a mimic).
- **Gambler's Coffin** room feature: roll a die, skull = treasure, black shield =
  something climbs out. Repeatable, stakes rise each pull.

### Roguelike depth
- **Locked vaults.** A sealed treasure room; the key drops from an elite.
- **Curses.** Persistent drawbacks you accept for a strong reward; removable at a
  shrine or by paying the pedlar.
- **Hero progression inside a run.** Kills earn a small pick at set thresholds —
  a weapon die, a defend die, a spell slot.
- **Relics** with visible slots, distinct from boons: found, not drafted.
- **Trial rooms.** Optional: survive N turns / kill without taking a wound, for a
  guaranteed relic.
- **Warlock's attention meter.** Fills with time spent and coin taken; at
  thresholds he intervenes — reinforcements, a sealed door, a curse on a hero.
- **New monsters.** Giant rat swarm, cave troll (regenerates unless burned),
  wraith (only magic and the Spirit Blade bite), hellhound (breath down a line),
  spider (webs a square), cultist (buffs the room), skeleton archer (ranged).
- **Floor themes** beyond modifiers: a flooded floor (movement costs double in
  water), a collapsing floor (squares fall in over time), a lightless floor where
  only carried torches matter.

### Feel
- **A run history screen** — the last ten runs, depth, party, boons, what killed
  you. Losing should still produce a story.
- **Kill-streak flourish** — consecutive kills without taking damage escalate the
  banner and the music.
- **Boss intros** — a one-line title card when a boss's room opens.
- **Better death** — a hero's fall gets its own beat: slow-mo, the party turns.
