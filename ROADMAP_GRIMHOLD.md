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
- **Carried curses** — six marks that follow you down the stair until a shrine or
  320 gold lifts them, plus the pact: take one on purpose, get a boon. *(batch 4)*
- **Lessons** — kills are credited to the hero who made them, and buy a pick at
  3/7/12/18/25: weapon hand, guard, vigour, fleet. Two of each, maximum. *(batch 4)*
- **The Warlock's attention** — a meter in the HUD that fills with turns spent,
  coin taken and rooms rummaged. At 14/28/44 he sends something, bolts a door
  behind you, then marks your healthiest hero and sends a champion. *(batch 4)*
- **Four new monsters** — Cave Troll (knits itself back together unless the wound
  was fire), Wraith (steel goes straight through), Skeleton Archer (shoots and
  keeps its distance), Cultist (screams and wakes its whole room, and makes
  anything beside it braver). *(batch 5)*
- **The Book** — the last ten descents: depth, party, boons, curses, and what
  finally did it, by name. *(batch 5)*
- **Relics** — eight of them, found in vaults rather than drafted, two slots, so
  a third means putting one down. *(batch 6)*
- **Curses that pay** — every mark now takes something and gives something back,
  so keeping one is a decision rather than a punishment. *(batch 6)*
- **Trial rooms** — from depth 4, a door that states its terms before you open
  it: hold the room five turns, or clear it without a hero bleeding. Declining
  costs nothing. Answering pays two Fate and a relic. *(batch 7)*
- **What you are carrying** — a READ chip on the run line opens the whole
  inventory: this floor's modifiers, every boon, curse and relic, with the text
  you were shown when you took it. *(batch 7)*
- **Kill-streak flourish** — three, five, eight and twelve kills without a hero
  taking a wound escalate the banner, the shake and the hit-stop; eight pays a
  Fate. One wound and you are back to nothing. *(batch 7)*
- **Boss intros** — the door swings, the camera punches, and the thing at the
  back of the hall gets its name and one line said out loud, once. *(batch 8)*
- **Forced chests** — every chest asks whether you want it open or open now.
  Easing it gives the room's own card; forcing pays double, and two times in
  five the lock was a needle or the chest was a **Mimic**. *(batch 8)*
- **The Warlock's Wager** — throw the whole boon hand back for Fate. One, then
  two, then three, and nothing is protected: what you turned down can return.
  *(batch 8)*

- **Stake a boon** — put one you already hold on a single die. Skull and he pays
  another on top, white shield and nothing moves, black shield and it is his.
  Once a stair. *(batch 9)*
- **Blood price boons** — a fourth offer beside the three, stronger than
  anything in the pool, paid for out of the party's maximum Body Points. Four of
  them, from the second stair down, and never one that would kill you. *(batch 9)*
- **Better death** — a fall stops the world for half a second, throws the camera
  onto the body, turns every living hero to look, names them and what did it,
  and leaves a ✝ on the run line and a line in the panel. *(batch 9)*

- **Boss last words** — a second card on his last Body Point, so the fight has a
  shape: the room says his name, you take him apart, the room says one thing
  more. *(batch 10)*
- **Mimics that lie better** — from the third floor down, one chest was never a
  chest. Step within arm's reach and it takes the first bite; spend an action on
  Find Traps and it only stands up. *(batch 10)*
- **A trial you can fail loudly** — breaking one slams and bolts every door of
  that room and jumps the Warlock's attention by eight. A shoulder and a Body
  Point opens a bolt; no key fits it. The terms say so before you accept. *(batch 10)*

---

## Next up

1. **The trial plinth.** A trial room should have something visibly on a plinth
   in the middle of it, so the reward is a thing you can see from the doorway
   rather than a line of text afterwards.
2. **Split the between-floors screen.** It now carries three boons, a blood
   price, a wager, a stake bar, the pedlar and the stairs. It scrolls, which is
   survivable, but the gambles and the shopping want separating before a ninth
   thing lands on it.
3. **The body stays.** A fallen hero's marker should remain on the square for
   the rest of the floor. The fall has a beat now; it should also leave a mark.

## Backlog, roughly in order of value

### Gamble
- **Gambler's Coffin** room feature: roll a die, skull = treasure, black shield =
  something climbs out. Repeatable, stakes rise each pull.
- **Force the door.** Forcing works on chests; a locked or stuck door should ask
  the same question, with noise instead of a needle as the cost.
- **Sell a boon to the pedlar.** Gold for a boon you never use. The stake gambles
  one away; this would let you choose to.

### Roguelike depth
- **Vault variants.** A vault that is trapped, or one whose key is held by a
  champion that flees.
- **More monsters.** Giant rat swarm, hellhound (breath down a line), spider
  (webs a square you must spend a turn cutting free of), a chained thing that
  cannot leave its room but hits like the end of the world.
- **Floor themes** beyond modifiers: a flooded floor (movement costs double in
  water), a collapsing floor (squares fall in over time), a lightless floor where
  only carried torches matter.

### Feel
- **Streak on the HUD** — the banner fires and is gone. A small counter beside
  the Fate pill would let you feel the run you are on before it breaks.
- **Bolted doors should look bolted.** A trial-bolted door draws like any other
  shut door. It wants a visible bar across it, or the cost is a surprise twice.

### New ideas the batch turned up
- **Trial variants.** A third kind: leave the room without opening a chest, or
  kill the marked one first. Two kinds is thin for something this visible.
- **A blood price you can buy back.** The toll is permanent. A shrine or the
  pedlar offering to return one maximum Body Point at a steep price would make
  taking one on a bad floor less of a one-way door.
- **A chest that has been opened should say so on the board.** With mimics on
  the floor, telling a searched chest from an unsearched one at a glance is
  suddenly load-bearing, and right now it is a subtle darkening.
- **More things that lie.** The mimic proves the pattern. A tomb that is not a
  tomb, or a suit of armour on a rack that steps off it, would make the
  furniture itself part of the threat model rather than scenery.
