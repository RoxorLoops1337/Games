# BEATBORNE

**Your board is the band.** A rhythm roguelike where every unit you place is an
instrument, its counter is its rhythm, and the music you hear is the state of
your board. Nothing is sequenced ahead of time. The fight composes itself, and
a fight going well sounds like it.

Play: https://games-71g.pages.dev/beatborne/

Landscape, built for a phone held sideways. One file: `index.html` carries the
markup, the CSS, the art, the synth and the whole game. No assets of any kind,
and the render suite enforces that.

---

## The one idea

A unit has a **counter**. It drops by one on every beat, and at zero the unit
fires: its ability, its swing, and its **voice**. That is all. Everything else
in the game is a consequence:

- A counter of 1 is a hi-hat. A counter of 4 is a bass drum. **Your board is a
  drum pattern you can see.**
- **The front column runs double.** Column 0, nearest the middle, ticks twice a
  beat, so a counter-2 unit up front plays quarter notes and the same unit at
  the back plays halves. Forward is faster and louder, and gets hit first.
- Moving a unit already on the board is free, so that trade is a question you
  answer every beat rather than once when you played the card.
- The other side plays too, in a darker register: a sub under everything, a saw
  with teeth, a bell one semitone out of the key. **You can hear a board going
  wrong.**

## The rest of the rules

| | |
|---|---|
| **The board** | two rows, three columns a side. Column 0 is the front. |
| **Energy** | one a beat, up to nine. No turns; the beat is the pacing. |
| **Timing** | land a card on the beat for **PERFECT** (arrives one beat from firing, +12 crowd), inside 195ms for **GOOD** (one beat off its counter, +6), else **LATE** (-10 crowd). The windows are in milliseconds, so act three at 138 BPM is genuinely tighter than act one at 100. |
| **The crowd** | perfects, kills and some units fill it. At 100% the room goes off: for four beats every ally ticks three times as fast and hits for half again. That is the **DROP**, and it is where sets are won. |
| **The set** | your health, and it does not heal between stages. A foe that reaches column 0 with a clear lane swings at it. |
| **Targeting** | yours reach across lanes so your damage is never wasted; **theirs do not**. Leave a lane open and you bleed the moment it opens. |
| **The count-in** | the room is already playing when a stage starts, but nothing on the board ticks until your first card lands. You come in on the beat. |
| **A run** | three acts, four stages and a boss each. A card or a charm after every stage, a merch table between them, 15 more set health when an act ends. |
| **The score** | stages cleared, act reached, perfects, drops and the set you had left, doubled if you finish. Kept locally as a personal best. |

## The crew

Twenty of them, and each is a unit and an instrument in the same object. That
is not a convenience, it is the design: you cannot tune one without hearing the
other, which keeps the balance honest. A card that is too fast is also too busy.

`ROX` beatboxes, `JAS` sings, and `THE DUO` is both of them on one card.

## Layout of the source

Twelve numbered sections, each a real boundary.

| § | what lives there |
|---|---|
| 1 | constants, helpers, the seeded RNG, the `G` state object, save/load |
| 2 | the synth: eleven voices, the transport, the beat clock |
| 3 | content: crew, foes, bosses, charms, acts |
| 4 | the deck: draw, hand, discard |
| 5 | art: the palette helpers, the face pass, eighteen recipes |
| 6 | the board: slots, lanes, who is in front of whom |
| 7 | the sim: one beat, in a fixed and visible order |
| 8 | the run: waves, rewards, the shop, effects |
| 9 | render: one `layout()` both the renderer and the hit tests read |
| 10 | input: drag or tap-tap, judged on the same clock as the beat |
| 11 | screens, all DOM so the text stays crisp |
| 12 | boot, the frame loop, the pilot, and the `window.BB` test export |

**One clock.** `beatNow()` is derived from `AudioContext.currentTime`, not from
`performance.now`, because the two drift and the player's taps are judged
against the same beat the sounds land on. One clock, or the game lies.

**One layout.** `layout()` is read by the renderer and by every hit test. When
the board moved during the build, the taps followed it for free.

## Tests

    npm run test:beatborne          # both suites
    node tests/beatborne.test.mjs        # rules, content, balance
    node tests/beatborne_render.test.mjs # drawing, layout, reach

`tests/beatborne_lib.mjs` evaluates the inline script against a stubbed DOM and
hands back `window.BB`, which is the game's own export. If a test cannot reach
something, widen `BB` -- never reach into the file another way.

The render suite drives the real draw path at five device shapes with a context
that reports back, and fails on the three things that actually go wrong in a
canvas game: **a NaN coordinate** (draws nothing, silently), **a recipe that
paints nothing at all**, and **anything you have to touch that is off the stage
or under 40px**.

## The two tools

    node tools/beatborne/probe.mjs [seeds] [perfect|good|late] [start|loaded] [value|cheap]
    node tools/beatborne/probe.mjs 1 perfect start value score    # print the score
    node tools/beatborne/shots.mjs [outdir] [w] [h]

The **probe** runs a pilot over every stage of every act and over whole runs. It
asserts nothing; it exists so a balance claim can name a number somebody else
can reproduce. The **shot walk** boots the real game in Chromium, walks every
screen and writes a PNG of each. It asserts nothing either -- it exists so
somebody can look at the thing and say it is ugly, which is the only test that
catches ugly. It also reports console and page errors, which is the one thing
the headless suites genuinely cannot see.

`score` mode prints what the board actually plays, bucketed into sixteenths.
It is the only check on the game's whole premise that does not need ears:

    K kick  S snare  h hat  B bass  L lead  p pad  R rox  J jas   (g/u/b = theirs)
    |JRh .   .   .   |RhhK .   J   .   |RhhKS .   uu  .   |JRhhKS .   .   .   |
    |RhhKSu .   J   .   |RhhKS .   u   .   |JRhhKS hhK .   S   |RhhKS JhhK R   S  |

Read left to right: the board fills, the pattern thickens, and in the last two
bars the DROP lands and the front column starts playing the AND of every beat.

---

# The design record

Everything below came out of the probe or the shot walk, and every entry states
a number. The dead ends are the valuable half.

### RULE -- read the ladder against the deck it would actually be played with

The probe's per-stage table measures every stage from full health with whatever
deck you hand it, and the honest reading is: **tune act one against the starting
deck and act three against a drafted one.** Nobody reaches act three on ten
cards, and nobody plays act one on eighteen. `loaded` mode carries the ten
starting cards plus eight picks and three charms, which is roughly what a run
that got that far is holding.

### FINDING -- the pilot was not a floor, it was a broken player

The pilot played the cheapest card it could afford. That looked conservative
and was not: it dumped five cost-1 cards a bar and **never once played a rare it
had drafted**, so a deck that grew to 18 cards fought every fight with the same
ten it started with. Spending down instead of up moved the full-run win rate
from **0% to 21%** with nothing else changed. `--play cheap` keeps the old
behaviour, labelled as what it is.

### FINDING -- the difficulty was a threshold, not a curve

Both sides used to reach across lanes for a target, so the set only ever took
damage when the **entire** board was empty. Below that line the pilot finished
acts one and two on 40/40 without a scratch; above it, it died in eight beats.
Making enemy targeting lane-bound (yours still reach across) turned a step
function into a slope: act two now costs a starting-deck pilot about 6 set per
stage instead of zero.

### FINDING -- a wave of three on a full board used to spawn one foe and bin two

`nextWaveMaybe` popped slots off a list and `break` on the first miss. With
three-foe waves and six enemy slots this fired constantly, which meant **the
late stages were quietly easier than the early ones**. Foes queue in `pending`
now and walk on from the back as room appears -- which is also where they should
have entered all along: the back column gives you a beat of warning, and it
makes the advance visible instead of decorative.

### FINDING -- six seconds is not long enough to learn a game

Booted the real thing, placed one card, and lost act one stage one in **six
beats**. The probe never saw it, because the pilot fills the board on beat zero
and a human spends the first bar reading the screen. Every fix that bought more
time (more set health, weaker foes) made the rest of the game worse, so the
fight waits instead: **the clock runs during the count-in and the board does
not.** Idle survival at act one stage one went 5.8s → 10 beats, and the fix
costs a competent player nothing.

### FINDING -- the column a foe stood in used to change only its own tick rate

A foe with a clear lane swung at the set from wherever it stood, which made the
walk-forward rule decoration. Only column 0 reaches the set now, so a wave
landing at the back gives you the two beats it takes them to cross, and a
blocker holding column 0 is holding the lane rather than merely standing in it.

### FINDING -- timing is worth about half the fight

Same stage, same deck, 24 seeds: **PERFECT clears act one stage one in 11 beats,
LATE in 18**, and over full runs the gap is 17% won against 0%. That is the
skill gradient the game is for. It was briefly much worse: PERFECT dropped a
unit at counter 1 while GOOD left it at its full counter, so a counter-4 card
fired **four times sooner** for a 78ms difference in a tap -- 21% against 4% on
full runs, which is a cliff for anybody still learning the window. GOOD takes
one beat off the counter now, and both windows widened (78→95ms, 165→195ms)
because there is no latency calibration screen in this game and 78ms is inside
the output latency of a lot of phones.

### FINDING -- a unit that ticked twice played a 60ms flam, not a subdivision

The front column is the game's central trade and its whole musical payoff: tick
twice, play the beat and the AND of it. It did neither. Multiple fires in one
beat were scheduled at `when + fires * 0.06`, which at 100 BPM is a tenth of the
gap to the next eighth -- a grace note, heard as one thicker hit. They land on
`when + (i / ticks) * SPB()` now, so two ticks are eighths and a DROP's four are
sixteenths. `score` mode exists because nothing else caught this.

### FINDING -- six units on one beat is a wall, not a chord

Everything fired at exactly the same instant. A few milliseconds between the
layers (kick 0, bass 4ms, snare 9ms, pad 18ms) is standard mixing practice and
is the difference between hearing a band and hearing a hit.

### FINDING -- the roster read as equipment, not as a band

Looked at the collection screen at 110 units and every recipe read as an
**object**: a pawn, a donut, two pills. The silhouette rule was doing its job --
all eighteen are tellable apart blacked out at 44 units -- but a game about a
band whose crew have no faces is a game about gear. Eyes cost about eight lines
each. The mic was worse than nothing: drawn handle-up, the only visible part was
the far cap floating beside ROX's head like a speech bubble. It is drawn grille
first at the mouth now, with the handle falling away and a fist on it.

### FINDING -- the card face laid its rule out past its own bottom edge

Three 9px lines starting at `h-14` on a 128px card put the third line off the
card. On a hand card there is no way to read the rest, so a rule cut in half is
a unit the player cannot price. The face is laid out in bands measured off the
card's height, the rule shrinks to fit rather than overflowing, and long words
break instead of running off the edge.

### RULE -- the score stays local

The repo has a working leaderboard function, and it is single-game: it shares
one KV key with No Room For Heroes, so putting Beatborne's runs on it would mix
two games' entries into one board. A personal best in `localStorage` gets most
of the one-more-run hook for none of the risk. A shared board is worth doing
properly, with its own key namespace, or not at all.

### DEAD END -- doubling foe health to lengthen fights

Fights ended in 8 beats, so foe health went up ~2x. Every stage then went to
**0% and the pilot died in 8-18 beats** -- because the real problem was never
foe health. Allies had 3-6 HP against foes swinging for 4, so the board was
empty from beat three and the "fight" was the set being hit directly. Ally
health roughly doubled, energy moved from +1 a bar to +1 a beat, and cards from
one a bar to one every two. The health change alone would not have fixed it.

### DEAD END -- tuning act two upward to give it teeth

Act two stayed at 100% with zero damage taken across three separate difficulty
increases (foe health, wave count, scale). It was not a tuning problem; it was
the threshold above. Once enemy targeting became lane-bound, the same act two
started costing health without a single number changing.

### The numbers, as of the last reading

    node tools/beatborne/probe.mjs 40

    full runs (damage carries, drafts as it goes)
      timing perfect    15% won   cleared 11.7/15   deck 19     drops 25.2
      timing good        5% won   cleared 10.7/15   deck 18.4   drops 15.1
      timing late        5% won    cleared 9.8/15   deck 17.4   drops  5.7

    doing nothing at all
      act 1 stage 1    survives 10 beats   (6.0s before the set is gone)
      act 2 stage 1    survives 9.4 beats  (4.8s)
      act 3 stage 1    survives 7.2 beats  (3.1s)

A sane bot that never moves a unit after placing it and never drafts for synergy
wins about one run in seven. A person who does either should do better, and that
is the room the game is built to leave.
