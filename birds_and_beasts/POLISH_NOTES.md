# POLISH NOTES — The Birds & The Beasts

Running critique log for the polish loop. Two critics play the build, grade it and
issue demands; the build agents work through them; the critics re-grade. Whatever
survives a round lands here as **OPEN ITEMS** and becomes the next round's brief.

**Do not treat this file as gospel about the code** — it is a snapshot of what two
reviewers wanted at one moment. Read the game first, then this.

Hard rules the loop must never break (they are also in the workflow brief):
one self-contained file, exactly one `<script>` block, no external resources, no
renamed element ids, no change to the `window.BB` surface, and **no change to
balance or rules** — the FOES table, `breed`/`geneRoll`, `deriveCost`, `power`,
`MAX_PEN`, `MAX_DECK`, `SPILL`, `feedFor`, rituals, hazards and trait effects are
tuned by simulation. Looks and feel only.

---

## Round 1 — 2026-08-01

| | before | after |
|---|---|---|
| visual design | 4/10 | **6/10** |
| game feel | 3/10 | **6/10** |

Landed this round: the arena got a floor and a horizon; the pen out-sizes the hand;
the Wild screen is centred (it was pinned top-left — a shipped CSS bug); cards have
thickness and a sunken art well; a real type scale; the loss screen is red instead of
lime; SVG iconography replaced the mismatched emoji stat icons; the turn resolves as a
*sequence* with beasts that lunge, flinch and fall; card play has press/travel/land
beats; the clutch cracks one egg at a time; the sound layer was rebuilt on layered
tones and noise bursts; resemblance threads show which parent gave the chick each gene;
the PRODIGY threshold was fixed (it fired roughly half the time and meant nothing).

Fixed by hand after the pass, from QA's report: siblings in one clutch could share a
name (you were choosing between two cards both called Fenmaw); the NEW gene badge
landed on the generation chip; and KEEP IT could fall below the fold on the busiest
mobile clutch (the hatch footer is sticky now).

---

# OPEN ITEMS

## ⚠️ THE GAME CHANGED — re-read it before trusting anything below

It is an **autobattler** now, and a **9:16 portrait** one. What used to be a
turn-by-turn card fight is gone:

- **Prep, then hands off.** The field screen opens in PREP: you scout the enemy
  line, tap beasts out of the barn into an ordered line of up to 4, and spend a
  Feed *budget* (Feed is no longer a per-turn drip). Then you send them in and
  the whole match resolves in one synchronous call — what you watch is a replay
  of a transcript, so skipping it can never change the result.
- **The opposition is a team of real beasts**, drawn by the same painter from
  the same visual genes as yours. The named foe leads it. The single enemy
  health bar, the move list (atk/sweep/def/curse) and the emoji foe are all gone
  — which retires the "kill the emoji foes" demand from the last round.
- **Order is the decision.** The front of your line takes every blow. Bulwark
  shoulders forward, Elusive hangs back.
- **Losing a match no longer ends the run.** The survivors trample you for what
  they have left, capped at a third of your ceiling, and the round continues —
  your nested pair still breeds. The run ends when your health does.
- **The frame is a 9:16 column** (`#app`), and it is a CSS **container**. All
  breakpoints are `@container app (...)`, not `@media` — a viewport query will
  not fire correctly any more.

Balance is freshly simulated: breeding your best wins 40% of bot runs against 3%
for hoarding it, and matches run about 4 exchanges.

### What the last critique still wants, and still applies

- [ ] **Widen the gene vocabulary** — bred beasts still share one blob
      silhouette, so the gene system is invisible on the Cull screen. This is
      now MORE important, not less: both sides of the field are drawn beasts, so
      sameness reads as a bug.
- [ ] **The title screen shows zero creatures.**
- [ ] **Stop centring cards in a giant empty frame** on Nest/Cull/Book.
- [ ] **Turn down the trait slab** — it shouts over the animal.
- [ ] **The resemblance labels collide with body copy** on the clutch screen.
- [ ] **Make KEEP IT feel like a verdict, not a Next button.**

### New, from building the autobattler (verified by screenshot)

- [ ] **The battle replay has no climax.** Deaths get a burst and a sound, but
      the *last* kill — the one that wins the match — is not marked at all.
- [ ] **Nothing announces the result.** The match just stops and the label
      changes to "the field is yours". There is no win/loss card, no reward
      beat, no trample number made to hurt.
- [ ] **The empty middle of the field is dead space.** Two lines face each other
      across ~200px of nothing. It wants a floor, a horizon, dust, something.
- [ ] **Prep gives no forecast.** You can scout their line and read your own,
      but nothing tells you how the exchange is likely to go. An autobattler
      lives on that read.
- [ ] **The re-order controls are three tiny buttons under each beast.** Drag,
      or at least a bigger target.
- [ ] The ritual chips and the pips row overflow the frame edge on Nest.
- [ ] The barn grid clips at the bottom of the Nest panel.
