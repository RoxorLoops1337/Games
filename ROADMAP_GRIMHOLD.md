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

- **Rooms nobody has opened** — a pill counting them, and a cold pale outline on
  the doors onto them. An invitation, not a warning: slow and blue, where the
  warnings on this board are hot and fast. *(batch 16)*
- **What a fallen friend was holding** — stand on a body and it asks. Their
  weapon if it beats yours, their potions either way, for the action you were
  going to spend swinging. *(batch 16)*
- **The pedlar buys** — 190 gold for a boon you never use. Not the ones you paid
  for in blood; those are between you and the stone. *(batch 16)*

- **The Warlock wants the bodies too** — while a caster lives, the nearest body
  it can see starts to stir, and two turns later gets up wearing your friend's
  name. Kill the caster or go back and lay them to rest; both stop it, and the
  rites cost the same action the blade did. *(batch 17)*
- **A liar that gets a second chance** — a sprung liar nobody is looking at, that
  nobody has managed to wound, sinks back into being furniture on whatever
  square it is standing on. Hurt it once and it has lost the trick. *(batch 17)*

- **The Gambler's Coffin** — a tomb somebody has been using as a bank. One die a
  pull: a skull pays and the pot climbs, a white shield moves nothing and the
  pot climbs anyway, a black shield lets out whatever has been fed on it — and
  what comes out gets worse the longer you have been at it. *(batch 18)*
- **The pedlar has his own shop** — he lifts curses, buys back blood and buys
  boons, and that had been accreting a row at a time inside the Coin tab. One
  door now, and behind it what he sells and what he buys. *(batch 18)*

- **Three more things in the dark** — a Cave Spider that spends no blood and
  takes your whole next turn instead, a Hellhound that breathes down a straight
  line and catches everybody standing in it, and the Chained, which cannot take
  a step and hits for six. *(batch 19)*
- **Force the door** — a locked door now asks the same question a chest does.
  Wait for whoever is carrying the key, or put a shoulder through it for your
  action: it opens now, the room wakes up, and the Warlock hears six. *(batch 19)*

- **The flooded floor** — the first *theme*, drawn on its own roll so it never
  eats a modifier slot. The corridors take water; wading costs two squares
  instead of one, and buys the quiet: a door eased open from the water does not
  wake the room behind it. Putting a shoulder through one still does. *(batch 20)*
- **Vault variants** — a lock is no longer always the same problem. One in three
  vaults pins its key to a named champion who will not stand and fight until you
  have cornered it; one in three is wired to the hall, and says so before it
  opens. *(batch 20)*

---

## Next up

1. **A second theme.** `THEMES` is a table with one entry in it. A collapsing
   floor whose squares fall in over time would prove the shape holds — and
   unlike the water, it would put a clock on the whole floor.
2. **A carried body.** The dead are already a resource both sides want: the
   party takes the blade, the Warlock takes the body. Let a hero pick a fallen
   friend up and carry them — slower, hands full — and pay to have them back on
   the between-floors screen.
3. **The water should matter to more than your feet.** Fire ought to gutter in
   it, a shock ought to travel through it, and something ought to live in it.
   One of those three, not all of them.

## Backlog, roughly in order of value

### Roguelike depth
- *(vault variants promoted to Next up, batch 19)*

### Feel
- **The relic silhouettes are small at board zoom.** They read, but only just.
  A gentle scale-up while the room is on screen would earn its keep.
- **The streak pill could show what the next banner is called.** It says `6/8`;
  saying `6/8 · BUTCHERY` would make the thing you are climbing toward concrete.

### New ideas the batch turned up
- **Every gamble now costs an action except the coffin's later pulls.** That is
  deliberate — press-your-luck needs to run without a turn between pulls — but
  it means the coffin is the strongest thing on a floor if you find it early.
  Worth watching whether it wants a cap.
- **The between-floors screen is a hub now, not a list.** Boons, Coin, Stairs,
  Book, and Coin is itself a door to a shop. That is the right shape; the title
  screen and the run's own menu have not caught up with it.
- **A wired-up ticker needs a turn-loop test.** Both new tickers passed their
  own tests with the `endZargonTurn` call deleted, because the tests called them
  directly. Anything hung off the turn loop wants one test that drives
  `endZargonTurn` and watches the effect — the same gap `drawBody` had.
- **The dead are becoming a resource both sides want.** The party takes the
  blade; the Warlock takes the body. A third claim — a hero who could be
  carried out and revived between floors, at a price — would close the triangle.
- **A liar that hides is a horror mechanic without a horror payoff.** It sinks
  back silently. A footprint, a moved chest, something that says *it was not
  there before* would be worth more than the hiding itself.
- **Everything dangerous pulses; nothing safe does.** That fell out of the
  disarmed trap and is worth making a rule. The lying furniture is the one
  thing that breaks it deliberately, which is exactly why it works.
- **A walking test must assert that it arrived.** The batch-12 walk test has
  now flaked twice: first on room width, then on a trap handing the walk off to
  `springTrap` mid-stride. It clears the room's traps and checks the hero's
  square before asserting anything else. Every test driving `heroWalk` wants
  both — a path derived from the room, and proof the hero got there.
- **The paint recorder is now the way art gets tested.** Four batches have used
  it. Anything drawn conditionally should be asserted through it rather than
  through "draw() did not throw", which passes either way.
- **A status marker written in the wrong branch is invisible, not broken.** The
  webbing drew inside `drawActorTag`'s `kind === 'monster'` arm, so heroes — the
  only things a spider webs — never wore it. Nothing threw and no test failed;
  the browser screenshot caught it. Status art belongs above the kind split.
- **Webbing is the first status that costs a whole turn with no roll and no
  save.** It is meant to hurt, but it stacks with the freeze family without ever
  asking. Worth checking a hero cannot be webbed out of two turns running.
- **The Chained's `move: 0` is the whole mechanism.** There is no pen and no
  guard; any future affix or effect that grants movement would quietly unchain
  it. If movement ever becomes grantable, that is the thing to check.
- **A revert-check that will not bite is telling you the code is dead.** Five
  times now — `!f.plinth`, the force-door wake loop, the Chained's room pen, and
  in batch 20 both a cornered-runner pre-check the fall-through already handled
  and a `!m.runner` guard on fields a runner never reads. The honest fix was
  deleting the guard, not writing a test that cannot fail.
- **The board is no longer uniform-cost, and that is a load-bearing change.**
  `walkField` is a shortest-path search now, not a flood fill, because a square
  reached late by a dry route has to beat the wet one that got there first.
  Anything new that changes what a square costs goes through `stepCost` — and
  wants a test that the *cheaper* route wins, not merely that some route exists.
- **Status art drawn in the wrong pass is invisible, not broken — again.** The
  wading ripple was painted in `drawWater`, under the movement field and under
  the actor. Same failure as batch 19's webbing, same fix: it belongs in
  `drawActorTag`, above everything. Two batches running, the browser caught it
  and the suite did not. A paint test proves a colour was reached for, never
  that anything can see it.
- **A test that accepts either outcome tests neither.** The first runner tests
  passed a bearer that ran *and* a bearer that stood and swung, so deleting the
  fleeing entirely left them green. If a mechanic has two legal outcomes, build
  the scene that forces one of them and assert that one.
- **The flooded floor is quiet, and the game has other quiet.** Wading, the
  Elf's step, an unopened room — nothing yet says how they combine. Whatever
  goes in next that muffles you should check what is already muffling you.
