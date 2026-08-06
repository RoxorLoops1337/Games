# EMBERKIN

A creature collector crossed with a deck-builder. Walk the Hollowbrook valley,
meet 19 kin, catch them, raise them — and fight with a hand of cards. Your kin
brings the attacks; your deck makes them land harder. Every win offers another
card.

Play: https://games-71g.pages.dev/emberkin/

## Shape of the thing

- `index.html` — the whole game: markup, CSS, one inline `<script>`. Canvas
  (256×208, integer-scaled) draws the world and battles; every panel — dialogue,
  menus, HP bars, dex, party, bag — is DOM, so text stays crisp at any zoom.
- `art/*.json` — one file per creature, 40×40 character grids plus a palette.
- `art/tiles/*.json` — 16×16 terrain tiles. `art/actors/*.json` — 16×22 walk
  frames and NPCs. `art/cards/*.json` — 20×20 card faces, one per card plus one
  per element, generated from `tools/spritegrid/cardicons.mjs`.
- `art/BRIEF.md` — the style bible the art was drawn against. `art/ROSTER.md` —
  the dex and its concepts.

The script is sectioned; each marker is a real boundary:

| § | what lives there |
|---|---|
| 1 | helpers, the `G` state object, save/load |
| 2 | types, the effectiveness chart, moves by element, the dex, items, stat maths |
| 2b | cards, rarities, growth rules, chests |
| 3 | maps as char grids, warps, NPCs, encounter tables |
| 4 | sprite rasterising and the missing-art fallbacks |
| 5 | overworld movement, encounters, world rendering |
| 6 | the card battle — deck, hand, energy, turns — and the battle scene |
| 7 | dialogue, menus, screens, battle playback |
| 8 | the square-wave sequencer |
| 9 | boot, input, frame loop, the `window.EK` test export |

## Art pipeline

Art is data, and the data is authored with a see-it loop:

```bash
node tools/spritegrid/render.mjs emberkin/art/cindercub.json --out /tmp/art --scale 8
node tools/spritegrid/render.mjs emberkin/art/*.json --out /tmp/art --sheet all.png
```

`render.mjs` validates the grid and writes a PNG you can actually look at
(zero dependencies — it encodes the PNG itself). When the JSON changes, stamp
it back into the game:

```bash
node tools/spritegrid/embed.mjs          # write the ART:BEGIN…ART:END block
node tools/spritegrid/embed.mjs --check  # CI: fail if index.html is stale
```

Never hand-edit the generated block in `index.html` — edit the JSON and re-embed.

Terrain is generated the same way, from `tools/spritegrid/tiles.mjs`:

```bash
node tools/spritegrid/tiles.mjs --sheet /tmp/tiles.png   # each tile drawn 3x3, so seams show
node tools/spritegrid/embed.mjs
```

The first set of tiles was per-pixel noise — every pixel picked at random from
a five-tone ramp — which is the textbook way to make a floor look like
television static, and it is what the valley looked like. What replaced it
follows what pixel artists actually teach:

- **Texture is clusters, not pixels.** A few shapes two or three pixels across,
  repeated with an uneven distribution. Never draw individual blades of grass;
  never let one cluster touch another edge-on. Corner to corner is fine, and is
  what stops a field looking like a grid.
- **Clusters cross the seam.** A shape that runs off the right edge and back on
  the left is what hides the fact that this is one tile repeated. The contact
  sheet draws every tile 3×3 for exactly this reason: a tile that only looks
  good alone is not a tile.
- **Backgrounds hold less contrast than characters.** The ground shares its hues
  with the creatures standing on it but keeps its values close together, so the
  creature is what your eye lands on.
- **Shadows cool and desaturate, highlights warm.** Every ramp shifts hue as well
  as value — a green's shadow leans blue, its highlight leans yellow. Three or
  four tones is plenty; more turns texture back into blur.

Saturation across the whole set is deliberately lower than looks right in
isolation, because the valley has to sit under a violet UI without the two
looking like different pictures.

Card faces are the exception to "one file per sprite": they live together in
`tools/spritegrid/cardicons.mjs` because they share a construction and want to
be compared side by side while you draw them.

```bash
node tools/spritegrid/cardicons.mjs --sheet /tmp/icons.png   # draw them, then look
node tools/spritegrid/embed.mjs                              # stamp them in
```

Four rules keep a mixed hand looking like one set, all learned from a first
pass where every icon came out looking like a pendant:

- the silhouette has to read filled solid black — if it needs the shading to be
  legible, it is the wrong shape
- fill the frame; a 10px shape floating in 20px reads as a trinket
- outline the outside only. A ring of dark tone *inside* the shape punches a
  hole and turns a flame into a locket
- light from the upper left, always

One tone for the whole roster, too. A set of sprites reads as a set when they
share the colour they are drawn against; fourteen of the nineteen kin already
used the same near-black violet and the other five each had their own, which is
enough to make those five look like they wandered in from a different game.
`tools/spritegrid/outline.mjs` finds the colour each sprite actually uses along
its *silhouette* — not its darkest entry, which on a dark creature is a body
tone — and moves that one entry onto the shared one, touching nothing else.

```bash
node tools/spritegrid/outline.mjs           # report
node tools/spritegrid/outline.mjs --write   # fix the strays
```

The art suite enforces the mechanical half: 20×20, the shared outline colour,
no orphan pixels, a silhouette that is actually outlined, and a fill somewhere
between floating and bursting out of the frame.

### Panels

A panel is a lit object, not a rounded rectangle, and three things do the work
without costing a pixel of canvas: a top-light gradient so the surface has a
direction, a hairline *inside* the border so the frame reads as two materials
rather than one stroke, and a shadow with warm violet in it rather than flat
black — which is what stops the UI looking like it was cut from a different
picture than the valley behind it.

An HP bar is a track with something in it, not a coloured div: a recessed
channel, a fill lit along its top edge, and a bright cap at the head of the fill
so the eye finds where it ends at a glance.

Interiors are floorboards rather than a dirt track laid indoors, with a rug set
back from the door. The rug is one object, so it is a *seamless* weave and
`drawEdges` puts the gold hem around wherever it happens to stop — the first
version gave every rug tile its own frame and read as six coasters.

### The first choice

Rowan hands you one of three kin, and for seven passes that was a three-line
menu — the first decision in the game, made in the same widget as "Sound: on".
It is a screen now, laid out the way the reward screen is, because that is the
shape this game uses for *pick one of these and live with it*: three cards, each
with a portrait lit in its own element, its dex line, and what it is strong into
and soft against read straight off the type chart rather than written by hand.

There is no way out of it but choosing. `closeScreen` refuses, and B does
nothing — the same rule the reward screen follows.

### The screens

Party, dex, bag, shop, box, deck and chests were the last plain lists in the
game: a grid of equal panels with all the text in them. A row of equal cards has
no hierarchy — nothing on it says which one you are looking at, so every card
has to carry every fact and none of them can be big.

**The kin page** is two columns. The roster is a compact list on the left; the
one you have picked opens on the right with a framed portrait, a stat block and
its moves. Every stat gets a bar as well as a number, measured against the
roster's own ceiling, because a bar answers "is this one fast?" before you have
read the number. A move is a little card with its element down the left edge and
a PP track under it that turns red near empty.

`statBlock()` is pure and exported, so the suite checks the page without a
browser — including the two ways a bar can lie: a save whose xp sits below its
own level's floor must not print a negative, and one with absurd xp must not run
past the end of the track.

**The bag and the shop** are one renderer, priced or counted. Items are shelved
by what they are for — Orbs, Salves, In a fight — because you go looking for "an
orb", not for "the fourth row", and shelving is stable however the keys arrive
so the cursor never jumps under you. Every item wears the same 20×20 glyph the
cards use, generated in `cardicons.mjs` alongside them: an orb in the bag and an
orb on a card are the same object rather than a name and a picture of one. The
orbs' shading comes off the sphere's own normal — a linear ramp across a circle
bands into stripes, which is what the first pass at them looked like.

**The chest shop** was the one screen the other passes left behind, and reading
the whole game back is what turned it up: every chest carried a full-strength
coloured border, so all four glowed at once and the one the cursor was on was
invisible. The tint belongs to the chest now and the gold ring belongs to the
cursor, and only one thing at a time gets it. The four percentages became a
single segmented **odds bar** — you are choosing between distributions, and a
distribution is a shape.

**The dex** has three states you can tell apart across the room: caught is the
creature, lit, in a gold frame; seen is a silhouette *lifted* off the panel
rather than painted in the outline tone, which is darker than the panel and made
"seen" and "never met" look identical; never met is an empty hatched slot with a
`?` and its number. A creature you have not met does not leak its silhouette.

### The title screen

The first thing anyone sees, so it is a painting rather than a placeholder.
`drawTitleArt(t)` runs per frame off the same clock as the game: a dusk sky
falling from near-black violet to a warm horizon, a sun set off-centre so the
kin standing in front of it are not eclipsing it, three ridges each darker and
taller than the one behind, a treeline, and mist pooling where the trees meet
the near ground — the cheapest way to tell the eye those are two different
distances. Three of the roster stand on it and rotate every 2.4 seconds, each
with a cast shadow and its own bob. The near ground is deliberately lighter than
the ridge in front of it so the creatures keep their feet instead of dissolving
into a black band.

It takes an optional context, which is how the headless suite drives it without
a canvas element.

## Controls

| | keyboard | touch |
|---|---|---|
| walk | arrows / WASD | the joystick — put a thumb down anywhere in the left zone and it appears there |
| talk, confirm | Z · Enter · Space | the **Talk** button, or tap the text box |
| menu, back | X · Esc | the **Menu** button |
| aim a card | ← → | tap it |
| take a card after a win | ← → then Z | tap it, or **Skip** |
| name a kin | ← → to Rename, Z, then type; Enter when done | tap the field |
| play the aimed card | ↑ · Z · Enter | tap it again, or drag it up |
| play a card outright | its number, 1-5 | — |
| end the turn | E | the **End turn** button |
| fullscreen | — | ⛶, top right, or Fullscreen in the field menu |
| mute | M | Sound, in the field menu |

The two touch buttons relabel themselves for what they do right now — Talk /
Menu in the world, Play / Menu in a fight, Next while someone is talking.

The aim moves itself onto a card you can afford whenever the hand changes under
you — dealing a hand, or spending the card you were on — but never when you
walked it somewhere yourself, since looking at a card you cannot pay for yet is
a fair thing to want to do.

A card takes one click with a mouse, because hovering already aimed it, and two
taps with a finger — aim, then confirm — so a fat-fingered tap never spends
energy by accident. Dragging is the third way: lift a card past a third of the
hand's height, it lights gold and says **▲ PLAY**, and letting go plays it. Menus,
lists and every screen take a plain tap, and the long ones (deck, dex, box) scroll
under a finger. The line above the hand spells out whichever card you are aiming
at, since the card itself is too small to hold its own rules text. Playing a card
resolves instantly and you keep your turn; only what happens *to* you plays back a
line at a time.

### Fitting the screen

`layoutFor(vw, vh, touch)` is a pure function — viewport in, layout out — and
everything else follows from what it returns:

| mode | when | what it looks like |
|------|------|--------------------|
| `none` | mouse | integer-scaled, centred, no on-screen controls |
| `side` | landscape touch with ≥96px to spare either side | game at full screen height, joystick in the left gutter, buttons in the right |
| `below` | portrait touch with ≥190px underneath | game at full width up top, controls in the band below |
| `overlay` | neither margin is big enough | controls sit on the game's corners |

The controls are `position:fixed` children of `<body>`, not of the stage, so
in `side` and `below` they never cover a pixel of the game. Panel text is sized
in `em` off one font-size on the stage, so the whole UI scales with it. Because
the function is pure, the suite checks every phone and tablet viewport without a
browser.

### Light over the valley

A flat field of tiles is a texture; a lit one is a place. `worldLight()` lays
down two passes over the finished map — a warm wash across the top falling to a
cool violet at the bottom, so the ground has a direction to it, and a soft
vignette that darkens the corners and pulls the eye to the middle where the
player is. Both are in the game's own gold and violet, which is what stops the
world and the panels around it looking like two different pictures.

Every map is graded to its own weather. The tileset is shared, so without this
the shore and the deep wood are the same picture with different props: the same
grass, the same dirt, the same light. `GRADE` gives each map a top wash, a
bottom wash, how hard the corners close in, and — the one that does the heavy
lifting — a `hue`.

The hue pass is painted in the canvas `'color'` blend mode. A wash laid over
grass can only darken or lighten it; it can never make it stop being
grass-green, which is why the first attempt at this had four maps that all read
the same. Blending a colour keeps every value exactly where it was and moves
only the hue and the saturation, which is what a colour grade actually is.
Keep the alphas low — around `.15` — or the grade stops being light and starts
being paint: at `.26` Stillmere's warm sand turned grey and the player's orange
coat went with it.

    route_one     gold, barely graded — the light the others are read against
    emberwood     canopy: warm above, deep green shade below, corners closing in
    stillmere     open water, cool and flat, almost no vignette so it reads wide
    crown_hollow  high, thin and cold, a bruise-coloured sky pressing down

`drawEdges()` handles everything that happens where one kind of ground stops
and another starts. A tileset can only ever draw the *middle* of things, and the
edges are where a map either reads as a place or as a spreadsheet with colours
in it. Rather than author a transition tile for every pair — dozens of tiles,
and still a corner missing — this pass looks at each cell's neighbours after the
field is down and draws the joins: a bright shoreline where water meets land
with the bank darkening into it, a lit ridge along the top of a roof, an eave
that overhangs the wall below it, a base course where a wall meets the ground,
and the shadow the whole building throws on the ground beside it.

Foam comes in dashes, not a frame. An unbroken bright line on all four sides of
a pond is what makes it read as a swimming pool; the run is broken by a hash of
the tile's map position, so the same tile always breaks the same way and no two
neighbours break alike. Hollowbrook's pond has a sand shore around it for the
same reason — a body of water that meets grass at a hard right angle is a
rectangle, not a pond.

`castShadow()` puts a soft ellipse under everyone standing on the map. Without
one, every actor looks pasted on top of the ground rather than standing in it —
the cheapest single thing that makes a tile field read as a place.

A town where nobody moves is a diorama. Everyone breathes — a one-pixel bob, on
a phase seeded off the tile they stand on, so a street does not pulse in unison
— and everyone turns to look at you when you come within two tiles. The NPC art
faces the viewer, so a mirror is the only honest turn available: left and right
are real, and up and down keep them facing forward rather than lying about the
sprite. Standing next to somebody also quickens their bob, which is the whole of
"they noticed you".

The bob is rounded to whole pixels. At this scale a sprite landing between them
shimmers, and the suite asserts that no actor is ever drawn at a fractional
offset.

### Nothing outdoors is a rectangle

The maps are char grids, so the temptation is to type rectangles: a 2×2 square
of trees, a straight shoreline, a block of tall grass. All four routes started
that way and all four read as a spreadsheet with colours in it. The rule now is
the same one the tiles follow — clusters, not blocks:

- copses are irregular and no two are the same shape
- the shoreline steps in and out; the beach is never the same width twice
- tall grass has ragged edges rather than square ones
- every screenful carries scatter — a rock cluster, a flower clump, a ledge

The suite enforces the shape rather than the taste: for each tile kind, the set
of distinct row-signatures it makes has to be larger than one. A region whose
every row is the same run *is* a rectangle, whatever it is made of.

### Weather

The grade says what colour a place is; `weather()` says what is moving in the
air there. It belongs to the **map, not to a clock** — Stillmere is always wet,
Emberwood is always misty — so a place feels like itself every time you walk
into it rather than depending on when you happened to arrive.

| map | weather |
|---|---|
| Hollowbrook, Route One | warm dust rising in the light — a nice day, not an event |
| Emberwood | banks of mist drifting at three speeds, pooling on the ground |
| Stillmere | slanted rain at three depths, and rings on the water it lands in |
| Crown Hollow | a gale: long pale streaks crossing fast, nothing up here to stop it |

All of it is procedural off fixed seeds — nothing is stored between frames and
nothing pops when the camera moves. It draws over the grade, because weather is
between you and the valley rather than part of it.

Wind is separate and per-map, `[rate, pixels]`. It crosses a field as a
travelling wave so the blades ripple in sequence instead of shivering all at
once, and **only the top of the tile moves** — the roots stay put, which is the
difference between grass bending and grass sliding.

### Nothing cuts

Everything in the game used to change on a single frame, which reads as a
slideshow rather than a place.

A door goes **through** black. The map used to change on the frame you stepped
on the warp and then fade up, which is a cut with a stain on it: you see the new
room before the old one has gone. Now the screen closes first, the map changes
behind the curtain, and it opens again — same total time, and nothing moves
while the curtain is down.

A screen arrives rather than appearing: it slides up from under its own bottom
edge. The reward screen is the one that *lands*, scaling down onto the page,
because it is the only screen you actually chose to open.

### Sound

There is no sample in the game; everything is the same square-wave synth the
music runs on.

A footstep says what you are walking on — grass brushes, tall grass swishes, a
path knocks, sand is soft and short, boards ring — and alternates between two
pitches so a walk has a gait rather than a metronome. Opening a menu and
confirming in one are deliberately *different* sounds: if they are the same, the
ear stops using either. A door is a low knock with a fall under it, and an
evolution opens on a swell rather than a chime, because something is coming
rather than something having arrived.

## How a battle works

Each turn you are dealt five cards and three energy. The deck has two halves
shuffled together: the active kin's own moves, which are the only cards that
deal damage, and your support cards, which sharpen them. Switch kin and its move
cards leave with it. Spend energy on whatever you like, then end the turn and
take the foe's telegraphed hit.

**One swing a turn.** Three energy and moves costing one or two meant the best
line was to attack twice and never touch the deck, which is the exact opposite
of "the kin brings the attacks, the deck makes them land harder" — and it is why
a fight used to be over in a turn and a half. `b.swungTurn` is set by the first
kin card played and cleared in `startPlayerTurn`. A card that cannot be played
has to *look* unplayable, so `playableNow(b, c)` is the single predicate behind
the `dead` class, the "▲ play" footer, the End-turn nag and `aimPlayable` — a
key that silently does nothing is worse than a key that is greyed out.

`playCard(i)`, `endTurn()` and `doAction()` each resolve immediately and return
a list of log entries carrying HP/status snapshots. State is consistent the
moment they return; the UI plays the list back at reading speed. That is why
the tests drive real battles without touching the renderer, and why the HP bars
can lag the text without ever disagreeing with it.

Two invariants are worth stating because breaking either one deadlocks or
corrupts a run, and both did:

- **Every path out of the foe's turn ends in `startPlayerTurn`.** A foe can die
  on its own turn — burn or snare finishing it, thorns answering the hit it
  landed — and `afterFoe` has to send the next one in *and* hand the turn back.
- **`FOE_HP_MUL` never leaves the battle.** `toughen` is undone by `untoughen`
  when you catch a foe, and the max-HP a card grants is booked per kin in
  `b.maxAdds` so a switch cannot hand the bill to somebody else.
- **Drawing a message and advancing it agree on which message that is.** Both go
  through `shownDialogue()`. They used to disagree: an unread `battleSay` line
  still pending when the fight ended meant every press was applied to an
  invisible message whose `hold` nothing was ticking any more, and the run was
  over — no button did anything again. Message holds age in `step` and nowhere
  else, so a message can never be left holding a timer that never runs down.
- **Playback treats an impossible HP bar as settled.** The next log line waits
  for the bars to catch up; a bar that never arrives used to wait for ever.
- **Recoil and drain are paid on what came off, not on what was rolled.**
  Hitting a foe with 3 HP left for 300 recoiled as though it had dealt 300, so a
  heavy move could kill its own user finishing something already beaten.

And `frame()` catches. An exception used to escape, stop the
`requestAnimationFrame` chain, and freeze the page on its last drawn frame with
the buttons still labelled for a state the game had already left. A bug should
cost a frame, not the save.

### The arena

`drawArena()` is the place a fight happens in. It used to be two flat gradient
bands and four ellipses, which is a diagram of an arena rather than one. Depth
in a 256-pixel-wide picture is layers: three rolling ridges, each one further
back lighter, flatter and closer to the sky colour, standing against a low sun
on the horizon behind the foe. The foe's element tints the whole stack rather
than replacing it, so a fight against a Tide kin happens somewhere cold and one
against an Ember kin does not — but both are recognisably the same valley.

The stands each get a rim of light on top, a dark bed under, and a cast shadow
offset away from that sun; the creatures throw their own shadow onto them, which
is what stops them hovering.

A hit has a fast half and a slow half. The bars are the slow truth — they slide,
and they are still sliding when the next line of text arrives. The fast truth is
`drawPops()`: the number that just came off the bar leaves the target, out
quickly and then coasting, because a number rising at a constant speed reads as
a balloon and one that decelerates reads as impact. Red off yours, gold off the
foe's, green with a `+` when someone heals.

`entryFx()` is the single place a log entry turns into picture, so playback and
instant resolution behave identically. It also drives the lunge: whoever threw
the swing leans into it, seven pixels out and back, integer offsets only. Burn,
roots and recoil are all logged as `hit` too, but nobody threw those, so they
flash and shake without anyone leaning — which is exactly the distinction the
`atk` field on the entry exists to make.

Four motions carry a swing, all measured along the line between the two of them
and all in whole pixels, because a sprite that lands between them at this scale
shimmers:

| | when | what |
|---|---|---|
| **wind-up** | the `use` line, one line before the hit | the thrower pulls back four pixels |
| **lunge** | the `hit` line | out seven fast, back slower |
| **recoil** | the `hit` line | the one who took it is shoved six and returns |
| **burst** | a crit only | a ring punching outward, four spokes on the diagonals |

The wind-up is the whole reason a swing reads as a swing. Announcing a move and
landing it are two separate log lines, and that gap is exactly long enough to
pull back in, so the lunge arrives as a release instead of a twitch. The hit
cancels the wind-up, so the two never fight over the same sprite.

The crit burst uses the diagonals rather than the axes: a cross reads as a plus
sign, a saltire reads as an impact. Its number comes in oversized and settles,
and it carries a `!`. Before this the log said "A critical hit!" and the picture
said nothing, so the biggest number in the fight arrived looking like every
other number.

The field itself is textured now, by the same rule as the terrain tiles —
clusters, not pixels, thinning toward the horizon and thickening in the
foreground, on fixed seeds so the grass does not crawl between frames. A bank
darkens the very bottom, so the picture has a floor and not just a backdrop.

Entering is a walk-on rather than a slide. Sliding in at a constant speed is a
teleport with extra frames; what sells arrival is deceleration plus weight going
down on every step, so the offset eases out, the body bobs while it is still
covering ground, and dust kicks up behind. All three fall to nothing exactly
when the entry finishes.

### The battle HUD

Everything on the bar around the fight is an object rather than a printed
number, because a number is something you read and an object is something you
see:

- **Energy** is a row of gems that go dark as you spend them. "2/3" tells you
  the same thing but only after you have parsed it.
- **The piles** are stacks of cards — three overlapping backs with the top one
  lit, so a pile reads front to back — in the draw pile's blue and the used
  pile's violet, with the count beside them.
- **A status** is a chip in its own colour, pulsing gently, rather than three
  grey letters. It is a state you are in, so it should be the loudest thing on
  the panel; a burn ticking away ought to be visible from the corner of your
  eye.

### Is it any good to play?

Eight passes went into how the game looks and none into whether it is any good
to play, and "is it boring" is not a thing you can answer by reading the source.
So there is a tool that plays it — the real game, loaded headless, a fresh save,
the real encounter tables, all the way from Rowan's study to Crown Hollow:

```bash
node tools/emberkin/playthrough.mjs --runs 60          # a party of four, switching
node tools/emberkin/playthrough.mjs --runs 60 --solo   # one kin, no switching
```

**Its manual is [`tools/emberkin/README.md`](../tools/emberkin/README.md), and it
is worth reading before you believe a number it prints.** That doc says what
every printed line means, what each is divided by, which lines are comparable
between the two modes and which are emphatically not — and it carries the ledger
of all thirty-nine mistakes this probe has made, because the next one is far more
likely to be a variation on those than something new. Twenty-six passes on this
game produced about ten changes to the game and thirty-nine fixes to the tool.

The two modes are two different games, not a hard and an easy one. With a party
you switch into every matchup and switching is close to a hard counter — it costs
a turn and buys the whole fight — so a party number that looks too good usually
is. Judge a change against both, and if it only moves one, say which.

#### What a run accumulates, and the two economies nobody was measuring

Might was found by suspecting it. Everything else a run carries is now read
deliberately and printed, because the per-fight tables are structurally blind to
anything that persists: card growth, money, gems, bag, deck, might. Two of those
turned out to be zero at Crown Hollow in every run ever measured.

**The probe was never collecting the win.** The real game hands over gems on
every win and a trainer's prize on top of a duel; the probe drives combat
directly and skipped both. A run started with 500 shards, spent them at the first
restock and was **broke for the remaining hundred-odd fights** — so every salve,
orb and walk-back number this project has reported was measured on a player with
no income. With the win paying:

| | before | after |
| --- | --- | --- |
| solo salves a fight | .086 | **.287** |
| solo turns per fight | 3.60 ±0.19 | **4.08 ±0.25** |
| solo over in one turn | 13% ±2 | **8% ±2** |
| solo lost or ran | .239 ±.028 | .256 ±.034 |

The fights got *longer*, not safer: a player who can afford salves survives
instead of fleeing. Solo is back over four turns with one fight in twelve ending
in a single turn, which is the best that metric has read.

**Gems buy chests, and the probe walked past every one** with 237 in its pocket
at Crown Hollow — the whole second half of the card economy, never measured. It
buys the best chest it can afford on a town visit now.

What is bounded, at Crown Hollow, per run:

| | reaches | bound |
| --- | --- | --- |
| might | +109 ±15 | capped at 150 |
| card growth in deck | +178 ±21 of a possible 562 | each card 4× its own value; the sum is not bounded, and does not need to be |
| money | 1093-2027 | earned faster than the shop can absorb — **no sink** |
| gems | 39 ±5 | spent on chests |
| deck | 12 of 12 | `DECK_MAX` |

Money is the one still unbounded and piling up. It is partly the probe's fault —
it stocks to five orbs and four salves and stops — but a player capped at what
they want to carry has the same problem: past the first hour, shards stop being a
decision.

#### The drift was mostly noise, and the chip that would have fixed it costs too much

Pass 33 left one number going the wrong way: solo never-in-doubt 34% to 39%. The
diagnosis was sound — the foe spends a turn gathering, and a turn it does not
threaten is a turn you are safe in — so the fix was a chip: a gathering wild kin
still swings, softly, through the normal damage path so shields, guard, thorns
and the knockout all behave, with the chip on the telegraph so the line does not
lie about the turn.

It works, in solo, and it is not worth it:

| solo, 60 runs | no chip | chip .25 | chip .45 |
| --- | --- | --- | --- |
| no kin in doubt | 39% ±3 | 35% ±3 | **30% ±4** |
| over in one turn | 3% ±1 | 7% ±1 | 10% ±2 |
| wipes | .104 ±.015 | .126 ±.020 | .163 ±.027 |

30% never-in-doubt is the best that number has ever read. But party fights are the
short ones, and a chip ends them sooner: **party over-in-one goes from 4% ±1 to
24% ±3 at a chip of .25**, giving back almost the entire reason the plan was worth
having. Four points of solo never-in-doubt for twenty of party over-in-one is a
bad exchange. `PLAN_CHIP` is in the game and set to 0 — the machinery stays, the
dial is off, and the numbers for turning it up are written next to it.

**And then the premise turned out to be mostly noise.** Two 60-run samples of the
identical shipped build:

| solo, same build, twice | lost or ran | no kin in doubt | over in one |
| --- | --- | --- | --- |
| first sample | .273 ±.039 | 39% ±3 | 3% ±1 |
| second sample | .223 ±.037 | 36% ±3 | 5% ±1 |

36% against the 34% it drifted from is not a drift. The whole premise of this
pass was one sample, and the number it was chasing moved half as far as the
sampling error. Pass 33's headline should be read as **solo lost-or-ran .22-.27
and never-in-doubt 36-39%**, not the single figures it reported.

#### The deck still does not matter, even now fights have a shape

The strongest available test of "the fights were the problem": re-run the ban
spread now that a fight has a beat to build for. Against a baseline of .223 ±.037
lost-or-ran and 36% ±3:

| solo, 60 runs | lost or ran | no kin in doubt | wipes |
| --- | --- | --- | --- |
| baseline | .223 ±.037 | 36% ±3 | .103 ±.018 |
| without Whetstone | .171 ±.023 | 40% ±3 | .084 ±.012 |
| without Ward Stance | .206 ±.029 | 37% ±3 | .094 ±.015 |
| without Second Wind | .204 ±.025 | 37% ±3 | .098 ±.013 |

Everything overlaps. **Giving fights a shape did not make the deck matter** — and
Whetstone, the one card that carried an 8-point never-in-doubt gap in pass 30, no
longer carries one either. If anything the beat washes the deck out further: the
fight's structure now comes from the foe, and the answer to it is the same
whatever you are holding.

That is worth saying plainly after four passes of looking for a load-bearing
card. The deck is not where this game's decisions live, and no amount of card
design has moved that. What did move a headline — twice, and by a lot — was
changing what the *foe* does.

#### A wild kin gets a rhythm, and one-turn fights collapse

Pass 32 ended on "the flatness is in the fights, not the cards". So this reads
the fight from the foe's side, and the asymmetry is the whole answer: a trainer
brings a plan — a loop of beats, turn one sets up and turn three pays off — and a
wild kin brought only itself.

Not *quite* nothing. Wild kin have cornering, added in pass 18, and it had never
been counted. Measured: **1.25 telegraphed beats per wild fight, and 23% of wild
fights never get one at all.** But cornering fires off the foe's own HP falling,
so it is reactive — it arrives late, it arrives because you were winning, and
there is nothing to build a turn around in advance.

So a wild kin gets a rhythm too: **swing, gather, swing.** Same machinery as the
trainers, at 0.8 of their numbers (`WILD_PLAN_MUL`), announced a turn ahead. The
beat costs the foe its attack, so a plan is *less* total damage — it just arrives
in one lump you were told about.

| 60 runs a side | solo before | solo after | party before | party after |
| --- | --- | --- | --- | --- |
| **over in one turn** | 14% ±2 | **3% ±1** | 28% ±3 | **4% ±1** |
| lost or ran | .317 ±.041 | .273 ±.039 | .036 ±.005 | .054 ±.007 |
| no kin in doubt | 34% ±3 | 39% ±3 | 11% ±1 | 10% ±1 |
| wipes | .129 ±.016 | .104 ±.015 | .025 ±.004 | .019 ±.004 |
| turns per fight | 3.72 ±0.20 | 4.04 ±0.29 | 3.05 ±0.16 | 3.31 ±0.12 |

**Fights decided in a single turn have essentially stopped happening** — from a
quarter of all party fights to one in twenty-five. That is the complaint passes 11
to 14 spent four passes on, and none of those passes moved it, because all four
were tuning damage. It was never a damage problem. It was that nothing on the
foe's side took a turn to do anything.

What it costs: party is meaningfully more dangerous (.036 to .054, outside its
interval), which at .036 it could afford. Solo never-in-doubt drifts 34% to 39%,
which is the wrong way and is the one number to watch next.

The multiplier matters and was measured, not guessed. At a trainer's full numbers
solo lost-or-ran went to **.389** — the lump kills a kin where two taps could be
healed through. At 0.6 it went to **.223**, safer than no plan at all, because the
foe spends a turn and the payoff is too small. 0.8 lands on the baseline.

#### A new kind of card is not load-bearing either

Pass 31 ended on "a fix is not a bigger number, it is a card that does something
nothing else does". So the set got one. **Second Wind** clears `swungTurn`: your
kin may move twice this turn. Every other card in the deck is a number on a
swing, a shield or a heal — this is the only one that changes a rule, and it adds
no number at all.

It is playable, it is drawn constantly (2,280 draws over sixty runs), and it is
worth nothing measurable:

| solo, 60 runs each | with Second Wind | banned |
| --- | --- | --- |
| lost or ran | .317 ±.041 | .267 ±.028 |
| no kin in doubt | 34% ±3 | 35% ±3 |
| wipes | .129 ±.016 | .105 ±.015 |
| turns per fight | 3.72 ±0.20 | 3.75 ±0.24 |
| over in one turn | 14% ±2 | 12% ±2 |

Every line overlaps. Take the only rule-bending card in the game out of the game
and nothing moves. **So it is not that the cards are all the same shape — a
genuinely different shape does not help either.**

Which is the answer to the question pass 31 posed, and it points somewhere else:
**the flatness is in the fights, not the cards.** A three-turn fight against a
wild kin does not have enough structure for any card to be pivotal in. There is
no phase to set up for, no window to hit, nothing that a second swing this
particular turn rescues. Until a fight has shape, the deck cannot have shape
either, and the next pass belongs to encounter design rather than the card list.

Second Wind is kept. Not because it worked — it did not — but because it costs
nothing measurable, and it is the one card that would have something to bite on
if fights ever get the structure they lack.

#### Four policy fixes to make one card playable

Worth recording, because most of the pass went here. The probe's turn is *swing
once, then spend what is left*, and a card that bends the one-swing rule read 1-3
plays in 200-300 draws through four separate attempts:

1. Nothing took the second swing, because the loop swung once by construction.
2. The support pass spent the budget before the card's own condition was met, so
   it was never affordable when it became wanted.
3. Reserving the turn did not help, because the swing takes the *best* move and
   ate the reserve.
4. Capping the first swing to a cheap move starved it entirely — no swing at all,
   4.60 turns a fight.

None of those were the card. **The card's real problem was arithmetic**: a turn is
three energy and kin moves cost one or two, so swing + card + swing at one energy
is exactly three in the best case and impossible in every other. Free, it works.
A policy is a model of the rules, and a card that changes the rules invalidates
the model — four times over, the measurement was of the plumbing.

#### The deck substitutes: a stronger card is not a more important one

Pass 30's template said a card needs to compound on more than one axis. Grit was
the clean test — measured worth nothing, and already carrying the run-long axis
(`might` is saved with the save) — so it got exactly one more: `grow: 1`, each
play permanently bigger, to the usual ceiling of four times base.

It made the card bigger and it did not make the run need it.

| solo, 60 runs each | Grit as it was | Grit with growth |
| --- | --- | --- |
| baseline turns per fight | 3.67 ±0.15 | 3.49 ±0.15 |
| turns with Grit banned | 4.05 ±0.24 | 3.90 ±0.21 |
| **the gap — what Grit is worth** | **+0.38** | **+0.41** |
| permanent might it contributes | +19 | +34 |
| played, of fights it could be paid for | 89% | 98% |

The card nearly doubled its contribution and gained nine points of play rate. The
gap between having it and not having it did not move. What did move was the whole
baseline, 0.18 turns shorter — a cost with nothing bought. **Reverted.**

The reason is the finding: **the deck substitutes.** Make one card stronger and
whatever it displaces does the same job, so the run never comes to depend on it.
That is a harder flatness than "the cards are weak" — these cards are
*interchangeable*, and buffing one of them cannot change that. It also explains
pass 29 in hindsight: a 75%-epic deck and a 66%-rare deck play the same because
each is a different draw from one pool of near-equivalent cards.

Which reframes what a fix would have to be. Not a bigger number on a card — a
card that does something no other card does, so that nothing can stand in for it.
Whetstone is the only one in the set that passes that test today, and it passes
it by covering three axes at once rather than by being large.

#### A correction to pass 30

Pass 30 said "take Ward Stance, War Cry or Grit out of the game entirely and
every line stays inside its interval". That was checked against the danger line,
never-in-doubt and wipes — not against every line. **Grit moved turns per fight
even then**, 3.67 ±0.15 to 4.05 ±0.24, which is outside by a hair. Ward Stance
and War Cry hold up; Grit did not, and the sentence claimed more than it had
looked at.

#### How flat, exactly: one card in four is worth measuring

Pass 29 deduced the flatness from two build policies tying. `--ban <id>` and
`--force <id>` measure it directly: play the run with a card struck out of the
offers and the starting deck, or with three copies pinned in that nothing may
swap out. Sixty solo runs each.

| | lost or ran | no kin in doubt | wipes |
| --- | --- | --- | --- |
| **baseline** | .268 ±.031 | 35% ±3 | .117 ±.015 |
| without Ward Stance | .251 ±.026 | 35% ±3 | .105 ±.014 |
| without War Cry | .274 ±.030 | 37% ±3 | .115 ±.014 |
| without Grit | .270 ±.037 | 37% ±3 | .112 ±.017 |
| **without Whetstone** | .223 ±.031 | **43% ±4** | .093 ±.012 |
| **with 3× Whetstone** | **.326 ±.028** | **26% ±3** | .149 ±.013 |

**Three of the four cards are worth nothing measurable.** Take Ward Stance, War
Cry or Grit out of the game entirely and every line stays inside its interval.
That is the flatness proven rather than inferred, and it is a stronger statement
than the policy tie, because it is one card at a time against a fixed baseline.

**Whetstone is the exception, and it is a big one.** Banning it takes
no-kin-in-doubt from 35% to 43% — intervals nowhere near each other — and pinning
three copies takes it to 26%. That is a **17-point span on the oldest metric in
the project, from one card.** Its danger line spans .223 to .326 across the same
two runs.

A caveat that has to be said: `--force` pins three copies and therefore costs
three deck slots, so it conflates a card's strength with the price of carrying
it. Ward Stance forced is *worse* than baseline (.318) for exactly that reason.
`--ban` is the clean half of the measurement; force is the confirmation.

#### What "a card that matters" would have to be

Whetstone is +3 to every attack for the rest of the battle, one energy, and it
compounds three ways at once: **combo** adds 3 more when it follows another card,
**grow** raises it permanently on every play toward a ceiling of five times base,
and `atk` applies to every swing rather than the next one. It ends a run in the
deck of nearly every build, drawn in most fights and played in 88% of the ones it
could be paid for.

That is the size a card has to be here. Below it, a card can be removed from the
game without any headline noticing. So "make the good cards better" is not the
lever it sounds like — the useful version is **make more cards compound**, on the
Whetstone pattern: something that pays every swing, grows across the run, and
rewards being played in sequence. One axis of those three is not enough; Grit
grows and is worth nothing measurable, Ward Stance draws and is worth nothing
measurable.

**No card was changed.** Whetstone is already pulling the direction the design
wants — its presence makes fights sharper, and removing it makes them longer and
safer, which is the boring end. Changing the one card that works to prove a point
about the twenty-odd that do not would be the wrong move.

#### The card set is flat: two very different decks, the same run

This has now been answered three times and the third answer is the one with
evidence behind it.

Pass 27 compared the best and worst thirds of sixty runs, found identical decks,
and said the deck cannot matter — from a probe that always took the rarest card,
so the decks were identical by construction. Pass 28 gave it a `value` policy,
saw solo lost-or-ran fall from .246 to .162, and said the deck decides
everything. Pass 29 found that `staticScore` and `worth()` scored neither `combo`
nor `kill`, and that `worth()` docked combo cards 5% for carrying an upside it
never counted. With those scored, sixty runs a side:

| solo | build rarity | build value |
| --- | --- | --- |
| lost or ran | .256 ±.035 | .261 ±.022 |
| wipes | .107 ±.015 | .121 ±.011 |
| no kin in doubt | 37% ±4 | 38% ±3 |
| turns per fight | 3.59 ±0.19 | 3.77 ±0.16 |
| deck rarity mix | epic 75%, rare 19% | **rare 66%, epic 29%** |
| the three cards it holds most of | 6.6 / 12 | **9.4 / 12** |

Party is the same story: .036 ±.005 against .041 ±.006, with an 83%-epic deck
against a 69%-rare one.

**Two decks that could not look more different produce the same run.** One is
three-quarters epic and spread across nine card types; the other is two-thirds
rare and half of it is three cards. Every outcome line sits inside the other's
interval. That is a much stronger version of pass 27's claim than pass 27 could
make, because it is a between-policy comparison rather than a within-policy one.

The reading is not "the deck does not matter" as a compliment. It is that **the
card set is flat** — the good cards are not good enough, or the bad ones not bad
enough, for a build to be worth having. If deckbuilding is meant to be half the
game, that is the thing to fix, and it is a card-power question rather than a
reward-screen question.

It also dissolves the worry pass 28 left behind. "A well-built deck takes solo
no-kin-in-doubt to 51%" was the same artefact: the value deck now reads 38% ±3
against the rarity deck's 37% ±4.

#### Rarity is not the wrong axis after all

Pass 28 ranked the cards by value per energy and found four epics below five
rares, and concluded the reward screen steers players wrong. Three of those four
were the scorer: Berserk 13 → **28**, Reaper 16 → **32**, Bulwark 15 → **24**
once combo and kill are counted. Berserk is a 6-value card that puts 11 on the
board; Reaper grows +4 every time it finishes something.

Only **Ward Stance** stayed at 15, and it is the one epic carrying no keyword at
all — which is the same finding pass 24 reached from the other direction, and it
has already had its change. **No card was touched this pass.** The ledger's own
advice is *read `worth()` before reading the card*, and following it first
prevented four card changes that would each have been wrong.

#### How pass 28 read it, before the scorer was fixed

Pass 27 split sixty runs by the danger line, found the best and worst thirds
holding identical decks, and concluded the deck cannot be what makes a run good.
That conclusion was drawn from a probe that always takes the rarest card on
offer, which converges by construction. `--build` gives it other policies, and
the answer reverses.

Solo, sixty runs each:

| | build rarity | **build value** |
| --- | --- | --- |
| lost or ran | .246 ±.027 | **.162 ±.023** |
| wipes | .111 ±.013 | **.073 ±.011** |
| turns per fight | 3.97 ±0.19 | 4.37 ±0.29 |
| no kin in doubt | 39% ±3 | **51% ±3** |
| deck rarity mix | epic 73%, rare 21% | **rare 60%, epic 34%** |
| the three cards it holds most of | 6.6 / 12 | 8.9 / 12 |

Party, same:

| | rarity | value | grow |
| --- | --- | --- | --- |
| lost or ran | .038 ±.005 | .036 ±.008 | **.052 ±.008** |
| wipes | .028 ±.005 | .028 ±.007 | **.042 ±.008** |
| turns per fight | 3.02 ±0.14 | **3.42 ±0.24** | 3.01 ±0.18 |
| rarity mix | epic 84% | rare 59% | rare 72% |

**The deck decides the run.** A value-greedy player loses a third fewer solo runs
than a rarity-greedy one, and builds a visibly different deck to do it — 60% rare
where the rarity player is 73% epic, and concentrated harder (8.9 of 12 in three
card types against 6.6). Building for permanence keywords is worse than either.

Which makes the second finding the uncomfortable one: **rarity is anti-correlated
with usefulness here, and rarity is the axis the reward screen presents.** Ranked
by what a card does per point of energy, four epics — Berserk 13, Ward Stance 15,
Bulwark 15, Reaper 16 — sit below five rares: Grit 36, Heartroot 29, Thornmail
22, Surge 22, Ironhide 18. A player reading the reward screen the way the game
sorts it is being steered into the worse half of its own card set.

That is not fixed here. Demoting the four epics would make them *more* common,
which is backwards for weak cards, and buffing four cards at once is exactly the
move that went wrong with Ward Stance and Twin Strike. It is a card-at-a-time
job, and `--build value` is now the instrument to check each one against.

One thing to watch when it is done: the value deck takes solo no-kin-in-doubt to
**51%**. A well-built deck currently makes half of all solo fights safe, which is
the oldest complaint in the project reappearing from the other end.

#### Money is not a hole, and it is not a decision either

The report showed 1093-2995 shards unspent at Crown Hollow and called it a
currency with no sink. The sink was there; the shopping list was not. The shop
sells seven things and the probe bought the two cheapest — five bloom orbs and
four salves — and stopped, which is a self-imposed poverty rather than an
economy. Buying prism and gleam orbs and carrying ten salves when rich absorbs
nearly all of it, 1165 → 530 in party and 1854 → 363 in solo.

And it changes nothing: lost-or-ran .038 ±.005 → .045 ±.010, solo .246 ±.027 →
.244 ±.032, every other line inside its interval. **Past the floor of "never out
of orbs, never out of salves", money buys nothing measurable.** Shards are a
tutorial-era currency — they matter for the first hour and then stop being a
decision. That is a fair thing for a shop currency to be, and it is worth saying
out loud rather than leaving the number looking like a bug.

#### Is the reward system building a deck, or a pile?

By Crown Hollow the deck is always full, always 12 of 12, **77% epic, 2% common**,
and **half of it is three card types** (6.8 of 12). The reward system does
upgrade — commons are gone by the end — but it converges.

How much does the deck decide a run? Split sixty runs by the danger line and
compare the thirds at each end:

| | best third | worst third |
| --- | --- | --- |
| lost or ran (party) | .011 ±.004 | **.085 ±.020** |
| might | +111 ±27 | +97 ±27 |
| card growth | +174 ±40 | +161 ±34 |
| top three cards | 6.6 / 12 | 6.8 / 12 |
| rarity mix | epic 73%, rare 21% | epic 78%, rare 16% |

**The outcome differs eightfold and the deck does not differ at all.** Every deck
statistic overlaps; in solo the *worse* third even carries slightly more card
growth. Whatever separates a good run from a bad one, it is not the cards.

That is partly the probe: its swap rule keeps the highest rarity, which is
deterministic, so of course it converges. But that is the honest finding rather
than an excuse — **when rarity is the only axis the reward screen offers, a
rarity-greedy player ends every run with the same pile**, and a deck that is the
same every run cannot be the thing that makes a run good. If the deck is meant to
be a build, the offer needs an axis other than "which of these is rarer".

#### Might had no ceiling, and short fights are not a damage problem

Card growth is capped at four times a card's own value, and the note beside
`growCap` says why: *a card that grows forever eventually plays the game for
you*. `G.might` is the pile those plays add up to — added to every attack from
every kin, saved with the run — and it had no ceiling at all. Once the probe
started playing the might cards, it measured **+499 damage on every attack by
Crown Hollow, against a wild kin's 174 HP.** The back half of a run was one-shots.
It is capped at 150 now, which is the same principle applied to the total rather
than to each card.

The interesting part is what capping it does *not* do. Party fights had fallen to
2.96 turns and the obvious suspicion was that damage had run away. It has not:

| | uncapped | cap 150 | cap 40 |
| --- | --- | --- | --- |
| party turns | 2.96 ±0.16 | 3.09 ±0.19 | 3.10 ±0.17 |
| party over in one | 28% ±3 | 27% ±4 | 31% ±3 |
| party lost or ran | .036 ±.006 | .047 ±.011 | .056 ±.012 |
| solo turns | 3.64 ±0.20 | 3.60 ±0.19 | 3.60 ±0.15 |
| solo lost or ran | .222 ±.025 | .239 ±.028 | **.348 ±.039** |
| might at the end | +499 | +111 | +34 |

Cutting the biggest damage source in the game by more than 90% moved the length
of a fight by a tenth of a turn. What it moved was the danger — solo lost-or-ran
went from .222 to .348, a third of all fights. **Short fights here are not a
damage problem, and you cannot buy turns by taking damage away; you only buy
losses.** A correctly-played deck is simply faster, and that is fine.

So 150 is the cap that bounds the tail and changes nothing else: every headline
sits inside the uncapped interval, and the one-shot endgame is gone.

#### Are the one-cost damage cards underpriced?

They are what Twin Strike loses to — Fang Hone 100%, Blooded Edge 96%, Whetstone
93% when payable, all at one energy. Per energy they are not out of line:
Whetstone grown is +15 an attack for the battle, about +45 over three turns;
Blooded Edge grown is +56 on one attack with half of it back as healing; Twin
Strike is an extra swing a turn, +80-100 over a fight, for two. Forty to fifty
points an energy, all of them.

The asymmetry is not price, it is **timing**. Twin Strike pays over the turns
that remain; Blooded Edge pays now. In a game whose fights last three turns,
immediate beats deferred, and that is the same fact as the paragraph above rather
than a second problem. Slowing the one-costs down to rescue Twin Strike would
slow the whole game, and the cap-40 row shows what that buys: lost runs, not
longer fights. Left alone.

#### The two-cost slot is fine; the might cards were mispriced

The premise that a two-cost is structurally squeezed came from reading
played/drawn, which slopes with price on its own. Once you divide by the fights
a card could actually be paid for, price stops predicting play at all — the
median `when payable` runs 100% at cost 0, 69-75% at cost 1, **76-78% at cost 2**
and 88-89% at cost 3. Cost-1 cards span 18% to 100%. The buckets overlap almost
completely.

What predicts play is not price but **permanence**. Every card at the top of
every bucket has grow, chain, retain or combo; the ones at the bottom have none.
A one-shot has to beat cards that keep paying.

Which is how the real finding turned up. `G.might` is saved with the run and
added to every attack from every kin for the rest of it — eighty-odd fights — and
the probe was pricing it over the current fight's runway, capped at four turns.
Temper read 31%, Grit 44%, and six passes of reading the might cards went through
that price. Scored as the permanent it is, **Temper is 96%, Grit 90%, War Cry
100%** — Temper is now the second-best two-cost in the deck, not the second
worst. Nothing about the cards changed.

Playing them correctly makes the player stronger, so the run numbers moved with
it: solo lost-or-ran .311 → .247, party turns 3.50 → 3.08. That is a re-baseline,
not a regression — the old numbers described a player throwing away permanent
damage every run.

Twin Strike is the one card left at the bottom that is genuinely the card. It
buys an extra swing a turn for the rest of the fight, scored at 32-48 points on a
real turn, where a good one-energy card scores 28-57: two energy for what one
buys elsewhere. **The obvious fix overshoots.** At cost 1 it went to 77-84% and
took the game with it — party fights down to 2.86 turns, solo no-kin-in-doubt
back up from 37% to 42%, Bulwark down to 55%, Ward Stance to 13%. An extra swing
scales with the kin's damage, which grows all run, so halving the price makes it
the best card in the deck at every level. Left at two. If it gets fixed it is by
asking whether Whetstone, Blooded Edge and Fang Hone are the ones priced wrong.

#### What a drawn card is worth

The scorer pays a flat 3 points for a drawn card, which decides whether a draw
effect is an effect or a decoration. Measured: the average non-kin card in hand
is worth **25.5 points** (party) or 21.7 (solo) — but a drawn card only cashes in
on a turn that ended with energy to spare, and **only 15-18% of turns end
card-poor. The rest end out of energy, where an extra card buys nothing.**

25.5 × 15% = **3.8**. Solo: 21.7 × 18% = **3.9**. So three is right, a shade low,
and nowhere near enough to explain Ward Stance. The constant stays at 3: the
gap is smaller than the precision this measurement has, and `worth()` feeds the
average it would be tuned against, so chasing the fixed point would be tuning
noise.

The 85% is the more interesting half. **Energy, not cards, is what this game runs
out of** — which is why a card's price is so much of its identity, and why draw
effects are worth so much less here than they look.

#### Ward Stance, Bulwark, and what a two-cost has to buy

Two energy in a three-energy turn is a hard price: it buys one card where one
energy buys two, so a two-cost has to beat the *pair* it displaces. The ones that
do have something a pair cannot give — Bulwark grows permanently and retains,
Soulfang chains and scales off kills. Ward Stance had neither, and against
Bulwark at the same rarity and the same price it was smaller on every axis:
15 shield to 18, guard 3 to 4, no grow, no retain. One drawn card was the whole
difference between them.

The probe read it exactly that way — played in **20%** of the fights it could be
paid for, against Bulwark's 79% and Soulfang's 96%, the bottom of its own cost
bucket. It now draws **two**, which is the axis the two cards actually differ on:
Bulwark is the wall you invest in, Ward Stance is the smaller wall that refills
your hand. That took it to 35% and left the run untouched — solo 36% ±3
no-kin-in-doubt against 37% ±3 before, party 12% ±2 against 12% ±2.

Chain was tried first and is the wrong lever. This deck is full of 0-cost cards,
so a chain discount is live almost every turn: Ward Stance became a 1-energy
13-shield card, beat Ironhide, pushed Bulwark from 79% to 70%, and bought enough
safety that solo no-kin-in-doubt went from 37% to 44%. A card fix that moves the
difficulty of the whole game is not a card fix.

35% is still the lowest of the shield family. The probe's scorer values a drawn
card at three points, so two cards is six against fifteen shield, and whether a
person rates a full hand higher than that is a fair question this tool cannot
answer. Tuning the scorer until the card looks good would be answering it the
wrong way round.

#### What the probe decides, that a player would decide differently

Twice now a decision buried in this file has been quietly manufacturing the
answer, and both times several passes of game tuning happened against it before
anyone noticed — cheapest-first card play made every two-energy card look dead,
and healing before every duel made every trainer look unloseable. So here is the
list, kept honest on purpose. **A probe decision is a hypothesis about players.
When a number will not move, suspect this table before the game.**

| the probe | a player | biases | done |
| --- | --- | --- | --- |
| took the first starter every run | picks one of three | **everything** — the whole matchup cross-tab was measured with Ember's resistances baked in, part of why Dorn's Stone wall read as an eight-turn slog | rotates now |
| never drank a salve | carries a bag | **the wipe rate**, the number three passes steered by: every wipe was one a player had an item to prevent | drinks once a fight, when the telegraph says the next hit kills *and* the salve stops it |
| healed before every trainer | arrives having walked the route | trainer difficulty, wholly | fought as met; `--rested` keeps the old column |
| played cards cheapest-first | learns to sequence | every card's played/drawn rate | scores by value now |
| reads never-in-doubt off an absolute floor | asks "was that fight anything?" | conflates a dangerous fight with an already-hurt party | **cost of a fight** reports beside it |
| carries exactly four kin | carries one to six | the party/solo split — but that split is the stated axis, not a hidden one | left, on purpose |
| grinds to a fixed level per leg | moves on when it feels ready | the level-gap column, and every bucket downstream of it | left; documented |
| fights each trainer after grinding that leg | fights them on the way past | trainers are always met at the top of a leg, i.e. at their easiest | left; documented |
| never fled | runs when the next hit kills | **pushed wipes up** by counting losses nobody would have stood still for | flees now — and read `lost or ran`, not `wipes` |
| took a random card from the reward offer | takes the best one | depressed played/drawn across the whole pool — the instrument the deck work in passes 9, 10 and 12 was steered by | takes the best now |
| restocks only on a heal trip | shops when passing through | catch rate, salve supply | left; documented |
| counted a card as drawn every turn it sat in hand | draws it once | **the whole played/drawn table**: a Retain card sits in hand all fight, so it was counted four times against the one time it can be played — the bottom of the table was Dewdrop, Hunker, Bulwark and Ward Stance, i.e. every card with Retain on it | counted once per card now |
| never skips the reserved swing | takes a turn off to land something big | only Kinbond, the one 3-cost without Chain — Titanheart and Overkill are payable often and played 90% and 84% when they are | corrected: the row used to claim no 3-cost was ever affordable, which was never true. Letting it skip the swing was tried and was worse than the gap (kin play rates 62–98% → 24–42%) |
| skipped the reward card after a trainer win | takes it — the real win path offers one on both branches | **the whole legendary tier**: `REWARD_ODDS.wild` has legendary at 0, so a trainer win is the only place in a normal run one can come from | takes it now |
| rotates the starter, so 60 runs is 20 each | plays one | **any per-starter claim** — across three samples of builds that never touched Ember, Cindercub's lost-or-ran read .237, .358 and .438 at ±.08 | `--starter <name>` runs all sixty on one |

**Two traps in reading the numbers, both found by falling into them.**

*Fractions of a party are not comparable across party sizes.* `partyHp()` is a
mean, so the very same swing reads as a quarter as much damage to a party of four
as to one kin alone. "Party fights cost 7% and solo fights cost 25%" looked like a
three-fold difficulty gap and was a denominator: **0.21 ±0.03 kin-bars against
0.19 ±0.03**, the same number twice. The report prints both.

*Two rules, from five passes of getting this wrong.* **Average the ratios, never
ratio the averages** — `avg(x) / avg(fights)` lets a long run outvote a short
one, which is not what "per fight" means; four lines were doing it. And **if a
quantity divides by the party, it is not comparable between the modes** — those
lines now say so in the report itself and print a party-free twin underneath.
Every line in the report states what it is normalised by. That was meant to be
the end of this class of bug.

*A mean has a party size in it, and this is the third time.* "Never in doubt"
reads the party mean, so with four kin one of them being taken to zero — a fight
that genuinely went wrong — is 25% party damage and sails under the 30% bar.
Party mode had read 37-40% never-in-doubt for four passes and looked immune to
every fix; measured on **the worst-off kin**, which means the same thing whether
you brought one or six, it is **11% ±2**. Nearly nine party fights in ten put a
kin in trouble. Solo reads 39% either way, which is the sanity check. `no kin in
doubt` is the line to compare across modes; `never in doubt` is the line for
whether the *run* was ever at risk.

*The widest interval in the report is not noise.* `turns per fight` sits at
±0.25 across sixty runs and had drifted up three passes running. Split by
starter it is Dewdrip 4.50 ±0.53, Cindercub 3.97 ±0.42, Sproutle 3.87 ±0.25 —
a spread between the three larger than the headline's own interval, because the
report is averaging three different games. More runs cannot narrow that; the
per-starter table is printed instead. Sproutle is the outlier worth knowing
about: fewest free fights (30% against 40/41%) and the most dangerous
(0.338 lost-or-ran against 0.237/0.275).

*Running away is not surviving.* Teaching the probe to flee moved fights out of
the wipe column and into the run column and changed the danger not at all — solo
went from .196 wipes to .063 wipes plus .123 runs. Read **`lost or ran`** when
asking whether a fight can beat you.

**Every rate carries a 95% interval, and you read the interval first.** One
number standing in for thirty runs that disagree is how three passes' worth of
claims about the wipe rate turned out to be noise wearing a decimal point — it
came back anywhere from .155 to .364 on *identical* builds. The report prints
`mean ±half-width` for every per-fight rate, and underneath the wipe line, how
many runs a claim of a given size would actually need from the spread that
sample just showed. At the time of writing that is **~32 runs to call a .05
change in the solo wipe rate, and ~200 for a .02**. If two builds' intervals
overlap, the tool has not told you which is better, and staring at the means will
not change that.

**The policy is the measurement, and cheapest-first was lying.** Every 2-cost card
looked dead — Bulwark played 1% of the times it was drawn, Ward Stance 10% —
and the reason was the ordering, not the cards: with three energy and the swing
reserved out of it, a 2-cost card only got played when two 1-cost cards had not
already eaten the budget. The probe scores cards now (damage added, damage
prevented, health restored, per energy) and buys the best rate it can afford.
Bulwark went to 52%, Ward Stance to 49%, Twin Strike to 58% — and the cards that
*fell* were the ones cheapness had been flattering. Nothing about the cards
changed. If a card looks dead, suspect the policy first.

It reports **per trainer** as well as per run. Trainers are the hand-authored
fights, and averaging them into the wild ones hides exactly the thing a scripted
plan is meant to change; the line for each also counts how many plan beats were
actually telegraphed before the fight ended, because a plan nobody sees is not a
plan. It used to heal the party before every duel, on the grounds that a trainer
measured on the fumes of the last wild kin measures the walk to town instead.
**That was wrong, and it took four passes to notice.** Healing first meant every
trainer was measured against four rested kin — a fight no trainer in the valley
can win, and not a fight anybody actually has. A player arrives having walked the
route; what the party has left when it gets there *is* the fight. `--rested`
keeps the old behaviour, because the difference between the two columns is how
much of a trainer's difficulty is the walk that came before it.

**The policy is the measurement.** The version that played cheapest-first could
not tell a good deck from a big one, because it never set anything up: it played
the Chain card while the discount was still zero. It now plays a turn in two
passes — enablers, then payoffs — around a reserved swing, because a policy that
spends its last energy on a shield and then passes is measuring itself. The
first attempt at that took thirty-seven turns a fight.

Two more warnings from using it. **Runs vary a lot** — identical builds came back
28 and 42 walks-to-heal — so anything under ten runs is noise, and every rate is
reported per fight because absolute counts are dominated by how long a run
happened to take. And **the probe's policy is part of the measurement**: the
first version played whatever was leftmost in the hand, which cannot tell a good
deck from a big one. It plays cheapest-first now, which is both what a person
does and what the Chain and Combo cards are built to reward.

### Cards

**The kin brings the attacks. The deck makes them land harder.** Nothing in your
own deck damages the foe by itself — a support card that did would make the kin
an accessory to the deck, and it is meant to be the other way round. Every point
of damage in the game comes out of a move the active kin knows.

A card has one growable number, `v`, and `vt` says what that number is:

Three keywords make the *order* you play things in matter, which is the part a
pool of "+N to a thing" cards cannot do:

| keyword | what it does | why |
|---|---|---|
| **Retain** | the card stays in your hand at end of turn | a heal you are holding is a decision every turn; a heal you must spend now is a decision once |
| **Combo +n** | worth n more if it is not the first card you played this turn | the cheapest way to make sequencing matter |
| **Chain** | costs 1 less for every card played before it this turn | turns a finisher you could never afford into the reward for setting one up |

They are keywords rather than sentences because a mechanic should be named once
and learned once — and because the spelled-out versions did not fit on the card,
which a screenshot caught immediately.

| `vt` | what the number does |
|------|----------------------|
| `edge` | the **next** attack hits for +v — spend it on the right move |
| `atk` | +v on every attack for the rest of the battle |
| `might` | +v on every attack **for ever**, saved with the run |
| `shield` | soak v damage this round |
| `def` | take v less from every hit for the rest of the battle |
| `heal` / `maxhp` | heal v / +v maximum HP for the battle |
| `draw` / `energy` | draw v / +v energy (every turn, for a power) |

and `fx` carries the riders: `st` puts a status on everything you hit, `hits`
gives your attacks extra swings, `mul` multiplies their damage, `thorns` answers
back, `drain` heals you for a share of what the next attack deals.

Growth is the point:

| field | what it does |
|-------|--------------|
| `grow` | permanent, saved with that copy — the card is stronger forever |
| `bgrow` | grows for this battle only, on every copy in the piles |
| `kill` | permanent, but only when **the attack it sharpened** lands the kill |
| `exhaust` | one use, then out of the deck for the rest of the fight |

Cards are owned as individual copies, because each one grows on its own: two
Whets in the same deck end up different cards. Growth stops at `growCap(id)` —
several times the card's own value — because a card that grows forever
eventually plays the game for you.

**The number on the card is the number on the bar.** `attackBonus()` collects
everything the deck has stacked onto the next swing and `useMove` adds it flat.
Buffs deliberately do *not* go through `effStat` and the level-scaled damage
formula: a card that reads "+4" would be worth about 1 to a level-5 kin and
about 12 to a level-50 one, and then growing it by +1 would stop meaning
anything you can read off the card.

An `edge` survives a miss. Spending two turns setting up a Soulfang and losing
it to a 5% accuracy roll is how you teach someone never to set anything up.

Kin move cards are priced by weight (`moveCost`), so a turn is roughly one real
move plus the support you stack onto it.

A fight is played over a pool of HP that is not the kin's own. Three dials set
its shape, and they pull against each other:

| dial | now | what it buys |
| --- | --- | --- |
| `FOE_HP_MUL` | 4.0 | wild HP. Turns. Raise it and fights get longer *and* more dangerous. |
| `WILD_DMG_MUL` | .70 | how hard a wild kin hits. The damper that stops those extra turns being paid for in walks back to town. |
| `TRAINER_HP_MUL` | 2.2 | trainer HP per kin. Far lower, because a trainer is already a two- or three-kin fight and hits at full strength. |

Giving trainers the wild number was the mistake worth writing down: Wick's
opening fight went to a 70% loss rate and Dorn's two kin became a ten-turn slog.
`toughen(mon, mul)` takes the multiplier now; `startBattle` and `resolveFoeDown`
both pick it off `b.wild`.

### A trainer with a plan

Every hand-authored fight in the game was "two kin, no plan": the foe scored its
moves each turn and never built toward anything, so a trainer played exactly
like a wild kin with more HP.

A plan is a short loop of beats the opposing side works through — a loop rather
than a script, so it survives a fight going long without needing an ending
written for it. `PLANS` holds three:

| beat | what it does |
| --- | --- |
| `sharpen` | banks `b.foeEdge`, added flat to the next foe attack |
| `brace` | banks `b.foeShield`, eaten before their HP is |
| `aim` | sets `b.foePierce`; the next hit goes straight past your shield |

Each is worth `planScale(lvl)` times its base, so a plan keeps up with the
valley. **A beat costs the foe its attack**, which is what makes it a decision on
your side too: the turn it braces is the turn it does not hit you. And every
beat is telegraphed a turn ahead through the intent line that was already there,
so the point is never surprise — it is that you can see the big hit coming and
get to decide what to do about it.

`aim` exists because of what players do about `sharpen`: bank a shield and eat
it. Only the late trainers know it, and it is the answer to that answer.

**A plan has to keep its own promise, and it has to be seen.** Two bugs, both
found by the per-trainer table rather than by reading the code:

- A `sharpen` beat costs the foe its turn to bank an edge, so the beat after it
  has to cash it in — and it did not. `foeChoose` would score a status move
  higher, the edge would sit unspent, and a foe with a debuff to spam banked
  edge after edge while grinding your attack down. Coll's three kin turned a
  five-turn fight into a thirty-turn one that way, and nothing in it was a
  decision. `foeChoose(mustAttack)` now forces an attack out of the foe whenever
  an edge is banked.
- Plans whose first beat was a `swing` were never seen: Pell telegraphed 0.9
  beats a fight and Wick I 1.4, because the fight ended before the plan reached
  the interesting part. Every plan front-loads now, and the early ones are short
  (`['sharpen', 'swing']` rather than three or four beats) so a beat lands inside
  the first two turns. Pell went to 1.6, Wick I to 2.1, Ivo to 2.4. A plan the
  fight is too short to show is not a plan.

The three Wick fights are the arc, and it is asserted as data in
`emberkin_cards` — each plan is longer than the last, each knows a beat the one
before it did not, and nobody gets two setup turns in a row:

| | plan |
| --- | --- |
| Wick I | `swing, sharpen, swing` — one idea, and he does not lead with it |
| Wick II | `sharpen, swing, brace, swing` — he opens with the setup now, and has learned to eat your turn |
| Wick III | `sharpen, swing, aim, swing, brace, swing` — three tools, one of them the answer to how you beat him last time |

Every other trainer carries one too, one idea each, in character: Dorn braces,
Ivo sharpens, Coll does both, Hale opens on the back foot, Mio takes aim. Vespyr
is the one wild fight that gets a plan, passed straight to `startBattle` rather
than through an NPC.

### The chart points the same way, but not as hard

`effect(moveType, defTypes)` reads the chart; `EFF_DMG(e)` says what that entry is
worth on the bar. They are separate on purpose.

The chart says who beats whom, and that is knowledge worth having. What it must
not do is decide the fight before a card is played — and at a straight 2× / 0.5×
it did. Twelve runs with one kin, cross-tabbed by how the matchup read *before*
the first turn:

| your best element into theirs | share | never in doubt | lost |
| --- | --- | --- | --- |
| strong into weak | 16% | 69% | 6% |
| even into even | 33% | 37% | 34% |
| weak into strong | 32% | 7% | **57%** |

A tenfold swing in whether you win, settled in advance, with the level gap
identical in every bucket (0.6–1.8). It was never a level problem.

So `EFF_DMG` softens: 2× lands as 1.6×, 0.5× as 0.65×, a stacked double weakness
as 2.8× rather than 4×. `effect` still returns the chart value, because that is
what the dex shows and what "It's brutally effective!" is about. After it, the
same cross-tab runs 51% / 39% / 21% never-in-doubt and 6% / 25% / 41% lost. The
headline average barely moved — that is the point. An average over a
distribution whose two ends have walked toward each other looks identical to one
that has not moved at all, which is why never-in-doubt is a poor number to steer
by on its own and why the cross-tab is printed underneath it.

Watch for compensations that go stale. `rival1` had been dropped a level because
a type advantage plus one swing a turn made the opening fight unwinnable; with
the chart softened that same drop had a bot winning 98 times in a hundred, so it
came back off. `emberkin.test.mjs` asserts both ends of that fight.

### A cornered wild kin

Two fights in five were never in doubt, and it was not that they were easy — a
wild fight was four identical small hits with no moment in it. `CORNER_AT` (.4)
and `CORNER_EDGE` (14, through `planScale`) gather that damage instead: the first
time a wild kin drops below the line it banks an edge, the intent line says
`— cornered` with the bigger number on it, and the swing after that is the one
that could lose you the fight. You get a full turn between the telegraph and the
hit, which is the whole point.

It is one swing, not a state of being, and only wild kin do it — a trainer's kin
has a plan instead.

**A kin you resist gets three of them, and gets them early.** The cross-tab
named the bucket: 43% of one-kin fights are against something whose element you
resist, and those ran 59% / 59% / 45% never-in-doubt against 29% for the fights
you walk into at a disadvantage. A kin whose every blow bounces off you cannot
threaten you by hitting harder — hitting is the thing the chart has taken away.
So `cornerAt(foe, mine, done)` gives a blunted kin `CORNER_RESIST` = .78, .52 and
.26 instead of one moment at .4. The edge is flat damage, which is the one thing
the chart cannot blunt.

Moving its single moment earlier, without adding the other two, shifted the
bucket by six points and the run average by two — inside the interval, and
therefore not a result. Three moments is the difference between a telegraph and
a fight.

**And it cannot fire if the kin never gets a turn.** Three in ten party fights
ended in one swing — send in the right element, delete something that never acted
— so the only readable thing a wild fight has was exactly the thing those fights
skipped. A healthy wild kin now takes a killing blow and holds on by a point,
once, and corners on the spot. It cannot save one that was already hurt below
`CORNER_AT`, and it cannot happen twice.

The other half of the same problem was the damper. `WILD_DMG_MUL` exists so a
long fight is not paid for in walks back to town, and it had no business fully
compounding with a resistance you already had: a wild kin you resist was hitting
for .65 x .70 of normal, which is where the "nobody can hurt anybody" fights came
from — three quarters of them never in doubt, none of them lost, and the longest
in the game. Through a resistance the damper now applies at half strength.
Dropping it entirely was worse than the disease (wipes .220 to .364 a fight,
which is a walk to town every third fight); half is the corner.

### Switching, and what it costs

A switch used to cost one turn and buy the whole matchup. With a party of four
that made it a reflex rather than a decision — send in the right element, delete
the thing, never lose: 0.006 wipes per fight, and every trainer in the valley
beaten first try. `SWITCH_PUNISH` (11, through `planScale`) is the price of being
caught mid-change: the hit that lands while your kin is still finding its feet
comes in harder. That took party losses from 0.006 a fight to 0.040 — nearly
sevenfold — which is the first time a party has been able to lose at all.

**A kin sent in is still finding its feet.** `SETTLE_MUL` (.6) is the other half:
pricing the switch was not enough, because it still bought the whole matchup
*immediately*. The payoff arrives a turn late now, and over a three-turn fight
that late turn is most of the reason to switch at all — which is what makes it a
decision rather than the obvious opening move.

It did **not** stop the switch being the strongest button on the screen, and
that is the honest state of it. Run the probe with a switch-happy policy instead
of a human one and the rate goes 0.47 to 0.65 switches a fight, fights shorten
from 2.9 turns to 2.4, and wipes fall back to .025. The gap between those two
columns is the size of what is still on the table. The next thing worth attacking
is the on-demand-ness — a party answers any matchup the moment it sees it — not
the price of the answer.

A switch already cost three things, none of which were worth thinking about next
to buying the element outright: the turn, the hand (`b.disc.push(...b.hand)`),
and everything the deck had stacked up (`clearMods`).

### What a trainer gets, and when

Three dials, and the third one is the lesson:

| | | |
| --- | --- | --- |
| `trainerHp(n)` | `TRAINER_HP_MUL / n^.35` | the pool belongs to the trainer, not to each kin |
| `trainerDmg(lvl)` | ramps to `TRAINER_DMG_MUL` (1.35) by level 14 | a trained kin is a better hitter, not a bigger bag of health |
| `planScale(lvl)` | `(1 + lvl/22) * min(1, lvl/12)` | a plan beat is worth what its owner can make of it |

The health share-out came first and was the wrong lever: a flat multiplier meant
a trainer's fight got longer in proportion to their team, so Wick's one kin was
three turns and Dorn's two were eight, with Coll's three the longest fight in the
game and not one of those turns a decision. Sharing the pool out fixed the length
(Dorn 8.1 turns to 4.5) and did nothing at all for the danger — which is what
sent the danger into damage instead.

**The ramp is the part worth remembering.** Wick's first fight is one kin against
one kin at level five with the type advantage his way, and *every* global buff
the trainers have ever been given lands on that fight first. It has been made
unwinnable twice — a bot at 4% and at 8% — and caught both times by the "still a
fight, not a formality" assertion rather than by anyone reading the code. So the
buffs are not there on the first morning: a trainer at level five is a kid who
was handed their first kin the same day you were, and the plans and the damage
both ramp in over the walk north. With every trainer dial at full strength the
opening now runs 68–79% for a greedy bot.

If you add a trainer buff, ramp it, and run `emberkin.test.mjs` before believing
it.

### A trainer plays the same game you do

Trainers could not win, and no constant fixed it, because the problem was never a
number: the player arrives with four kin and rotates freshness in, while a
trainer spent one to three, one at a time, with no way to put any of it back. So
they got the two things you have.

**A bench.** `b.roster` holds a trainer's whole team from the first turn rather
than conjuring the next one as the last one falls. `foeBench()` scores what is on
it the way a person would — what their element does to yours, weighted by how
much of the kin is left — and `foeSwap()` sends it in on the same terms you swap
on: it costs them the turn, the kin arriving swings soft once (`foeSettling`),
everything the old one had banked is lost, and **you** get the `SWITCH_PUNISH`
edge for catching them mid-change. They only reach for it when the kin on the
field is the wrong one, never twice running, and never more times than they have
kin — a three-kin trainer with no limit can stall a fight for ever.

**A bag.** `POTIONS_FOR(team)` potions, each worth `FOE_POTION` (a third of the
bar), reached for below `FOE_POTION_AT`. It costs them the turn, like everything
else either side can do instead of swinging.

The measurable difference is in what a trainer *costs* rather than in who wins:
lowest party HP through a trainer fight went from 75–99% to 26–62%, Hale from 0%
losses to 20%, Coll to 3%. Most trainers still do not beat a four-kin party
outright, and that is worth being straight about — but they are no longer free.

### Elements

Every kin fights with its own element. Nothing learns a `Wild` move — a
Cindercub bites with fire, not with a generic Nip — so each element carries a
full kit: a quick opener, a first-strike, a workhorse, a heavy fang, a piece of
utility and a finisher. `Wild` survives only as the type of `falter`, the move
you are handed when every real one is spent. The suite enforces both halves: no
kin learns outside its own types, and every element has the whole kit.

That means STAB and the type chart are always in play, which is the point — the
chart is the game's main lever and a deck of colourless moves left it idle.

### What a card says it does

A move card shows **the damage it will do to the foe in front of you**, not a
power rating. Power is an internal number nobody can act on: 45 means one thing
at level 5 and another at level 50, and nothing at all against something that
resists it. `moveDamage()` rolls the real formula against the real foe with the
whole deck stack applied, and shows the range:

    Ember Spit    Ember · deal 20-24, may burn      (vs a Verdant foe)
    Ember Spit    Ember · deal 5-6, may burn        (vs a Tide foe)
    Ember Spit    Ember · deal 24-28, may burn      (with an Edge banked)

On the party screen there is nobody to measure against, so `moveDamageNeutral()`
uses a stated yardstick — a same-level target that neither resists the element
nor is weak to it — and the screen says `~15 dmg`. A mirror of the kin itself
would resist its own element and make every move read as feeble.

### What a card looks like

One component — `cardHTML()` — builds the card face for the hand, the deck
shelf and the post-win offer, because a card the player learns to read in a
fight should look the same everywhere they meet it. It is laid out in the order
a card game teaches you to scan one:

| part | where | why there |
|------|-------|-----------|
| cost gem | punched through the top-left frame | the first thing you check, and the only one you check every turn |
| art | a window with a glow behind it in the card's own colour | so a dark glyph still reads on a dark card |
| name | a band on a hairline rule | the split between "what is it" and "what does it do" |
| rules | under the rule | the only part that shrinks in a small hand — the line above the hand carries the full text for whatever you are aiming at |
| rarity | the frame itself, plus a pip at the foot | rarity you can see beats rarity you have to read |

Everything is sized in `em` off one stage font-size, so the same markup is a
thumbnail in the hand and a full card on a screen. Percentage padding is banned
on a card: it resolves against the *row's* width, not the card's, which once
left a 32px content box inside an 82px card.

Epic and legendary carry a slow sheen, because a card you were pleased to draw
should look it. A kin's own move wears gold and its element instead of a
rarity: it belongs to the creature, not to the deck, and should read that way
from across the table.

### The hand is a fan

A hand held in front of you is an arc, not a row. `fanStyle(i, n, selected)`
does the whole thing: the cards overlap, and rotation plus a drop both scale
with distance from the middle, around a `transform-origin` *under* the card
rather than through it. The drop goes as the square of that distance, so the
outer cards sit further round a curve instead of on a straight tilt. A fuller
hand fans tighter.

The card you are aiming at leaves the arc entirely — upright, lifted, a little
larger — because the card you are about to play should be the one card on screen
that is not at an angle. It pivots about **its own base**, not the fan's: with
the fan's pivot it grows from a point below the hand and throws itself up over
the dialogue line. While a card is selected its rarity pip hides, because "▲
play" and the pip both want the foot of the card and the prompt wins.

The function is pure and exported, so the suite checks the shape of the fan
without a browser: angles run in order, the fan is symmetric, every card has a
place in the stack, and the selected one is upright and on top.

What you cannot pay for goes cold — grayscale, darker, slightly transparent —
so the hand is readable at a glance rather than after reading five cost pips.

### Rooms

Three interiors generated from one function, all with the same rug in the
middle, is one room drawn three times. A room is what is in it, so there is
furniture: `shelf`, `counter`, `bed`, `crate`, `pot` and `window`, authored in
`tiles.mjs` alongside the terrain. They are objects rather than texture, so they
follow the sprite rules — a silhouette that reads filled, an outline on the
outside only, light from the upper left — and each sits on its own patch of
floorboard so it drops into an interior without a seam. All of them are solid;
a bed you can walk through is a rug.

- **Rowan's Study** is walled in books, with a work bench and something green
  where she can reach them without getting up.
- **The Wayhouse** is a ward: beds down both walls, a bench across the back,
  and a window over each row.
- **Hollowbrook Supply** is a counter you talk across, running the width of the
  room with a gap at each till — one in front of Bell, one in front of Vane —
  and the stock stacked against the walls behind them.

A window is a light source, and a light source that lights nothing is a picture
of a window, so `drawEdges` throws a slab of daylight down the floor beneath it,
leaning the way light does when it comes through a wall above you and fading out
over three tiles.

### Catching one

A throw is the thing the genre is named after, so it is the one action in the
game that is allowed to take four seconds. `tryCatch` rolls it the moment the
orb leaves your hand — as everything here resolves immediately — and then
`orbBeats` turns the result into a list of beats the animation plays back:

    throw · suck · fall · (wobble · gap) × shakes · click | burst

so three shakes on screen means the roll really did hold three times, and the
line that follows says which it was ("Three shakes. You had it." reads
differently from "It burst straight back out!"). `orbStep` holds the battle log
while the orb is in the air: the line that says what happened must never arrive
before the orb has stopped moving. The throw begins from *its own* log line, so
you read "you lob a Prism Orb" and then watch it happen, not the reverse.

A catch then stops everything for `G.gotcha` — rays, the new kin, its name, and
a shower that takes its time — and hands you its papers afterwards. Any key
skips the tail of the flourish; nobody should sit through it twice.

### The valley keeps up

The encounter bands used to be absolute: Route One spawned level 3 kin for ever
while you climbed to twelve on them, and the measured share of fights the player
was never in danger of losing sat at 45%. A fight you cannot lose is a cutscene
you press buttons through, and the fix for that is not more foe HP — it is foes
that are still worth fighting.

A wild kin is rolled in its band as before, then brought up to within
`WILD_TRAIL` levels of your best. Never below the band, so somewhere you have no
business being is still dangerous; never above the band *or* your lead,
whichever is higher, so the valley follows you rather than racing you.

And **speed decides who opens**. The player used to move first always, which
with fights running under two turns meant most foes got exactly one action and
half of them never touched you. Something faster than you now lands the first
blow — which is what makes SPD a stat rather than a number on a screen. Wild kin
only: a trainer squares up with you, and the opening rival fight is meant to be
winnable rather than a coin toss on speed.

### A deck you can see through

Twelve cards, not twenty-four. Fights run about two turns and you draw five a
turn, so a twenty-four card deck meant you saw half of it once and your best
card usually stayed in the draw pile.

The half that makes it work is the **swap**: with the deck full, taking a card
opens a screen that asks which one comes out. The old rule dropped the new card
into the collection silently, so the offer stopped being a decision a third of
the way through a run. Chests still make room on their own — they pull three or
four at a time and being asked four times running is a form, not a decision — by
putting out the weakest card, then the least played. Going by play count alone
thrashes: a card you took last fight has been played nought times, so the next
reward throws it straight back out.

Measured over three samples of fourteen runs, against the same probe policy:
fights the player was never in danger of losing fell from 45% to 34%, and the
walking fell about a sixth, with the walks-back-to-heal and wipe rates unmoved.

### The second wind

A measured run walked back to the Wayhouse about five times before Crown Hollow,
every trip down a corridor already cleared. Attrition with no recovery except
the town turns exploring into errands, and the fix is structural rather than a
number: **putting something down gives you back what the fight cost you**, up to
a third of your health.

Proportional, not flat. The first version handed over a flat 18% of max and the
measured share of fights-you-could-not-lose went *up* — a walkover was suddenly
free as well. Now a hard fight pays and a trivial one gives you nothing you did
not already have.

Across three samples of fourteen runs: walks back to heal fell from 0.346 to
0.285 per fight, wipes from 0.303 to 0.283, at a cost of three points on the
never-in-doubt share.

### Winning, and going down

A knockout used to be an alpha change on the next frame: the loser was suddenly
translucent and still standing. It falls now — a slump and a fade over half a
second, eased so it drops fast and settles.

And a win used to be a line of text followed immediately by a card offer, which
is a transaction rather than a victory. `winFlourish()` holds the arena for a
beat first: the light comes up off the ground, gold rises through it, and the
two numbers you actually won are on the canvas. The DOM panels around the fight
hide while it runs, or the word lands behind your own HP bar — which is exactly
what the first version did.

It is skippable, and the frame that skips it **still belongs to the transition**.
Without that, the very press that ended the flourish fell through to the reward
screen it had just opened and took the first card for you.

### Being ambushed

A trainer spotting you was an exclamation mark and a dialogue box with an
ellipsis in it. It is three beats now — `spot`, `walk`, `land`: they see you,
the frame closes in with two bars and a darkening, and they walk over before
anybody speaks. They slide across in *pixels*, so the tile they occupy never
changes and nothing about collision or interaction has to know it is happening.

Nothing you can do about any of it, which is the point of being ambushed.

### Evolving

The other moment the genre is built around, and it used to be two dialogue
boxes with a spinning wheel behind them — which means the whole thing advanced
at the speed you mashed A, and was over before you had read the first line. It
runs on its own clock now, like the catch does:

    hold · build · burst · settle · quiet

The shape changes at the top of `burst`, **under the white-out**, so you never
see the swap: you see what it was, then light, then what it is. `quiet` is the
beat that does the most work and draws nothing at all — a second of the new
creature standing there before anybody says its name.

Going white is done by blitting the creature's own *silhouette* over itself
additively, five times. A flat dark shape stacked on itself climbs to white,
which is the only way to blow a sprite out without authoring a second set of
art for it. The motes fall **inward** while the light builds, because the energy
is arriving rather than leaving — that is the whole difference between evolving
and burning.

The suite asserts the beats play in order, that the species changes *during*
`burst` and never in the open, and that mashing A does not skip it.

### A kin's papers

`openScreen('profile', { mon })` is the same screen whether it comes from a
catch or from picking a kin on the party screen, so **renaming is never a thing
you get one chance at**. The name is a real `<input>` rather than an in-game
letter picker: this game is played on a phone as often as a keyboard, and the
phone already has a very good letter picker in it. While the field has focus the
game's own key handling stands down — otherwise typing "e" would end your turn —
and Enter or Escape hands the keyboard back.

The cursor starts on the way out, not on the name field. Confirm should always
mean "that will do"; renaming is something you go and choose. Starting it on the
field made a screen you could not leave by pressing the one button every player
always has.

`commitNick` trims, squashes runs of spaces, caps at 12 characters, and treats
"named after its own species" as no nickname at all. It runs on the way out as
well as on the button, so a name you typed is never lost by closing the screen.

### A card after every win

Every win — wild, trainer, the legendary — offers three cards and a **No
thanks**, and the deck grows one card at a time out of what you were actually
offered. A harder fight offers from further up the rarity table (`REWARD_ODDS`:
wild → trainer → legendary). The offer never repeats a card inside one draw,
because a choice between two Guards is not a choice.

`rollReward()` only rolls; picking is what commits, so nothing is spent if the
game is interrupted mid-offer. There is nothing behind the offer to go back to,
so **Back means No thanks** rather than being a button that looks live and does
nothing.

### Chests

Rare gems come from winning; Vane in the Hollowbrook shop turns them into
cards. Four tiers, each costing roughly triple the last and shifting its odds up
the rarity table — Silver never drops a legendary, Prism drops one in five.

### Trainers

A trainer gets exactly one ambush. Walk into their line and they call you out;
after that the sight is spent (`seen_<id>` in the flags) whatever the outcome,
and the rematch is there when you walk up and ask for it. Without that rule a
trainer standing on the only road out of town re-challenges you every time you
walk back, and one loss becomes a soft-lock you cannot train your way out of —
the grass is on their far side.

The rival's first team is the same level as your starter. He already holds the
kin that beats yours; two levels on top of that made the opening fight
unwinnable, which the story suite missed for a while because it fought that
battle with a stacked party. It fights it with the level-5 starter now.

## Tests

```bash
npm run test:emberkin     # logic + cards + render + story + art + embed freshness
npm run check             # the whole repo
```

- `tests/emberkin.test.mjs` — data sanity, type maths, damage, capture,
  levelling, evolution, map connectivity, save round-trip, and the card battle
  end to end (hand, energy, piles, switching, shields).
- `tests/emberkin_cards.test.mjs` — the deck-builder itself. Every card in the
  table is played in a controlled fight and the thing it promises is checked, so
  a card cannot be added with a `vt` or an `fx` that nothing reads — and the
  audit proves itself by failing a planted card whose value nothing applies.
  Also: that no card in your deck deals damage, that a support card adds exactly the number it prints
  at level 5 and at level 50, that an edge is spent by the next attack that
  connects and survives a miss, that every win offers three distinct cards and
  harder fights offer better ones, and that growth sticks to
  the copy that earned it, battle growth does not survive the battle, exhaust
  means gone, kill bonuses only fire on kills, growth respects its ceiling,
  chest odds improve with price, and deck size limits hold.
  The logic suite does the same for moves: every `fx` a move can carry — drain,
  recoil, self and foe stat stages, statuses against a target that is not immune
  to them, priority — is exercised against a foe that cannot die mid-measurement.
- `tests/emberkin_render.test.mjs` — draws every map and every battle state
  against a no-op canvas, plays the opening through simulated key presses, and
  checks the touch layout: `layoutFor` across a table of real phone and tablet
  viewports, the joystick's dead zone and dominant axis, and that the drag and
  scroll affordances are still wired up in the markup.
- `tests/emberkin_art.test.mjs` — enforces the mechanical half of the art brief:
  grid size, palette completeness, continuous dark outline, feet on the ground
  line, evolutions bigger than their pre-evolutions, matched walk frames.

`tests/emberkin_lib.mjs` stubs a DOM and evals the inline script with
`__EK_HEADLESS__`, exposing the real functions through `window.EK`. Write new
tests with it rather than re-implementing game logic.

## Balance dials

- Battle: `BASE_ENERGY` 3, `HAND_SIZE` 5, `FOE_HP_MUL` 1.4, `moveCost` by move power.
- Support maths: flat, `attackBonus()` — `mods.atk` + `mods.edge` + `G.might`, × `mods.mul`, over `mods.hits` swings.
- Card reward odds per win: `REWARD_ODDS`, `REWARD_PICKS` 3.
- Card growth ceiling: `growCap` = card value × `capMul` (default 4).
- Chest costs and odds: the `CHESTS` table. Gem payouts: `gemReward`.
- Encounter rate: `enc.rate` per map (0.12–0.14).
- XP curve `xpFor(lvl) = 0.8·lvl³`; XP gain `yield · foeLevel / 7`.
- Stats: `statAt = ⌊base·2·lvl/100⌋ + 5`, HP adds `lvl + 10`.
- Capture: `captureChance()` — HP ratio × species `rate` × orb `mul` × status.
- Crit rate 1/16, crit multiplier 1.5, STAB 1.5, damage roll 0.85–1.0.
- Status chip damage: max/16 per turn (burn, snare). Shock costs the player a
  point of energy; chill costs a card.
- A creature is immune to the status of its own element (`IMMUNE_TO`).
