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

- **The trial plinth** — a lit stone column in the middle of a trial room,
  visible from the doorway, so the reason to accept the terms is a thing you can
  see. The light goes out whichever way the trial ends. *(batch 11)*
- **Split the between-floors screen** — three tabs (Boons, Coin, Stairs) under a
  pinned party-and-purse header. Eight things on one scroll was too many; each
  tab now fits a phone. *(batch 11)*
- **The body stays** — a helm on its side, a planted blade and a stain that
  settles in, left on the square for the rest of the floor. *(batch 11)*

- **Bolted doors look bolted** — an iron bar across the whole leaf, bracketed and
  still red about it, instead of drawing like any other shut door. *(batch 12)*
- **An opened chest reads as opened** — lid tipped back over an empty inside, no
  lock boss and no glint; a shut one keeps both. *(batch 12)*
- **More things that lie** — the pattern generalised past chests. A tomb that was
  never sealed (a mummy), and armour on a rack that steps down off it (a chaos
  warrior). What comes out is whatever that furniture would hide. *(batch 12)*

- **The plinth holds the thing it pays** — a particular relic, chosen when the
  room is built, drawn on the plinth with its own silhouette and named in the
  terms before you agree to anything. Never one you already carry. *(batch 13)*
- **A fourth tab for the Book** — the run you are on above the runs that are
  finished, so choosing a stair happens next to how far this has got before.
  *(batch 13)*
- **Streak on the HUD** — a counter beside the Fate pill from two kills up,
  reading `6/8` so the next banner is something you can see coming. *(batch 13)*

- **Everything you can search reads as searched** — the seven other searchable
  pieces get the chest's treatment: a dark emptied hole punched through the
  body and the leavings on the floor at their feet. *(batch 14)*
- **A disarmed trap looks disarmed** — it kept the live pulsing warning, which
  was a lie. It goes grey, crossed out, and stops moving; stillness is the
  signal, because everything dangerous on this board pulses. *(batch 14)*
- **A safety net under the old render paths** — the paint recorder now covers
  the torch falloff and the death fade, which had no test that would notice
  them breaking. *(batch 14)*

- **The Marked One** — a third trial. One thing in the room wears the mark and
  has to die first; anything else falling before it breaks the terms. A fight
  you have to aim rather than one you have to win. *(batch 15)*
- **A vault stands its relic on a plinth too** — a locked room now shows what
  the key is for through the doorway, and pays exactly that. Never the same
  relic the floor's trial is offering. *(batch 15)*
- **The Bonesetter** — 420 gold gives every hero back one maximum Body Point the
  blood price took, and heals it. You keep the boon; you bought the point back,
  not an undo. He only appears when the stone is holding something. *(batch 15)*

---

## Next up

1. **A room you have never opened should look different from one you cleared.**
   The board says a lot about where you *have* been — opened chests, ransacked
   shelves, disarmed traps, bodies. It cannot say where you have not.
2. **Bodies the Warlock can use.** A hero's remains sit there doing nothing. A
   necromancer raising one, or a hero taking back a fallen friend's weapon,
   would make the mark on the square matter.
3. **Sell a boon to the pedlar.** Gold for one you never use. The stake gambles
   one away; this would let you choose to, and the Bonesetter has just made the
   pedlar the place where regret gets undone.

## Backlog, roughly in order of value

### Gamble
- **Gambler's Coffin** room feature: roll a die, skull = treasure, black shield =
  something climbs out. Repeatable, stakes rise each pull.
- **Force the door.** Forcing works on chests; a locked or stuck door should ask
  the same question, with noise instead of a needle as the cost.
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
- **The relic silhouettes are small at board zoom.** They read, but only just.
  A gentle scale-up while the room is on screen would earn its keep.
- **The streak pill could show what the next banner is called.** It says `6/8`;
  saying `6/8 · BUTCHERY` would make the thing you are climbing toward concrete.

### New ideas the batch turned up
- **Everything dangerous pulses; nothing safe does.** That fell out of the
  disarmed trap and is worth making a rule. The lying furniture is the one
  thing that breaks it deliberately, which is exactly why it works.
- **Tests that walk should derive their path from the room.** A batch-12 test
  assumed a fixed room width and flaked once in twelve runs. Anything driving
  `heroWalk` wants the same treatment.
- **A liar that gets a second chance.** Every liar springs once and is then an
  ordinary monster. One that could sink back into being furniture if it lost
  sight of you would be genuinely unsettling.
- **The paint recorder.** The suite can now assert what colours a frame reached
  for, which is what finally made art changes testable. Worth using on the older
  render paths — the fog, the light falloff, the death fade — which have never
  had a test that would notice them breaking.
