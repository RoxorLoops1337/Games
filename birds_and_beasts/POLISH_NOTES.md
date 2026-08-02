# POLISH NOTES — The Birds & The Beasts

Running critique log for the polish loop. Two critics play the build, grade it and
issue demands; build agents work through them; the critics re-grade from scratch.
Whatever survives becomes the next round's brief.

## THE GAME, in one paragraph

A **Monster Train-shaped autobattler** about breeding monsters, in a **9:16
portrait** frame.

The barn is **three floors and a nest on top**. NEST (two beasts in to breed,
pick a ritual, optionally take a hazard) → **THE TOWER** (post beasts on floors,
two per floor, paid from a Feed budget; open the door and a **wave** walks in at
the bottom; every wave they climb one floor unless something of yours is
standing on it; whatever climbs off the top eats an egg, and the eggs are your
health) → CLUTCH (keep one chick, sell the rest) → CULL (the barn holds 10).

You never act during a wave. Between waves you get the tower back and fresh
Feed to reinforce. A round is 2–4 waves; the named foe walks in with the last
one. The run ends when the nest is empty.

Hard rules the loop must never break: one self-contained file, exactly one
`<script>`, no external resources, no renamed element ids, no change to the
`window.BB` surface, and **no balance or rules changes** — `statPower`,
`deriveCost`'s sqrt curve, `ENEMY_BASE`/`ENEMY_GROWTH`/`GRUNT_FRAC`,
`TRAMPLE_CAP`, `LINE_SLOTS`, `LINE_BASE`/`LINE_GROW`, `MAX_DECK`,
`breed`/`geneRoll`, rituals, hazards and trait effects are simulation-tuned.
**Breakpoints are `@container app (...)`, never `@media`** — `#app` is the
container, and a viewport query will not fire correctly inside it.

---

## Score history

| round | design | feel | note |
|---|---|---|---|
| 1 | 4 → 6 | 3 → 6 | the original card fight |
| 2 | — | — | stalled after the UI pass |
| 3 | 5 → 6 | 4 → 6 | the flat autobattler |
| 4 | — | — | **rebuilt again as a tower with waves — the critics have not seen it** |

The 6/6 plateau in round 3 was called out at the time. The game has since been
rebuilt around floors and waves, so the next round starts from a fresh baseline:
tell the critics to grade what is in front of them and ignore the history.

# OPEN ITEMS

The round-3 demands below were written against the FLAT two-line battle and most
of the combat ones no longer apply — the field, the forecast bar, the two facing
lines and the trample are all gone. What still stands:

- [ ] **Winning does not visibly pay.** The heal, the +2 ceiling and the Slop are
      still applied silently off-screen. This was the feel critic's top demand
      and it survived the rewrite untouched.
- [ ] **The empty right half of every floor.** Each floor reserves space for
      invaders; with none there it reads as dead space rather than as room.
- [ ] **Nothing shows the climb.** A wave moving up a floor is the whole tension
      of the design and it currently just re-renders.
- [ ] **No forecast.** You cannot tell whether the beast you are posting will
      hold its floor.
- [ ] **The title screen still describes a game with lines, not floors**, and
      shows no creatures.
- [ ] Stop centring cards in a giant empty frame on Nest/Cull/Book.
- [ ] The resemblance labels collide with body copy on the clutch screen.
- [ ] Make KEEP IT feel like a verdict, not a Next button.
