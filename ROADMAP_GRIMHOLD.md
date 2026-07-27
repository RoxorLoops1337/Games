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
- **Press-your-luck searching** — a room that pays opens a gamble: pull again at
  visibly worsening odds for visibly rising coin, or bank and walk away. *(batch 2)*
- **Monster abilities** — the Chaos Sorcerer finally casts (three bolts, no
  defence, at range); zombies rise once; a mummy's touch dulls your next swing;
  chaos warriors parry the first blow of each turn; gargoyles step over
  furniture; bloodied goblins break off and run. *(batch 2)*
- **Held dice** — a pool you could spend Fate on waits for you instead of
  resolving half a second after it lands. *(batch 2, reported)*
- **Altars** — pray free at 58%, or bleed two Body Points for the greater table
  at 82%. Blessings, and four curses that bite back. *(batch 3)*
- **Double or nothing** — a cleared floor's takings sit unbanked on the
  between-floors screen. One combat die: skull doubles, white shield holds,
  black shield takes the lot. Press as often as you dare. *(batch 3)*
- **Locked vaults** — from depth 3, a room may be sealed and its key carried by
  a champion standing outside it. Three chests inside, and the vault pays
  250-450 a search. *(batch 3)*

---

## Next up

1. **Curses you carry.** The altar's curse table is one-shot; make some of it
   stick. A carried curse is a visible drawback (−1 defend die, doors cost your
   action, monsters wake a room early) that you can pay a shrine or the pedlar to
   lift — or keep, because some of them pay.
2. **Hero progression inside a run.** Kills earn a pick at set thresholds: a
   weapon die, a defend die, a spell slot, a Fate. Gives a long run a shape
   beyond boons.
3. **The Warlock's attention meter.** Fills with turns spent and coin taken; at
   thresholds he intervenes — reinforcements at the stair, a door sealed behind
   you, a curse on the richest hero. Makes greed cost something.

## Backlog, roughly in order of value

### Gamble
- **The Warlock's Wager.** Spend Fate to reroll the *entire draft*.
- **Stake a boon.** Offer to wager a held boon on a die for two of them.
- **Blood price boons.** A second, stronger boon offered beside the three, which
  costs maximum Body Points instead of nothing.
- **Forced chests.** Open carefully (small, safe) or force it (better, may be
  trapped or a mimic).
- **Gambler's Coffin** room feature: roll a die, skull = treasure, black shield =
  something climbs out. Repeatable, stakes rise each pull.

### Roguelike depth
- **Vault variants.** A vault that is trapped, or one whose key is held by a
  champion that flees.
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
