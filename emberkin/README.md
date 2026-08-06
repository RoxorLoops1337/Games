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

## How a battle works

Each turn you are dealt five cards and three energy. The deck has two halves
shuffled together: the active kin's own moves, which are the only cards that
deal damage, and your support cards, which sharpen them. Switch kin and its move
cards leave with it. Spend energy on whatever you like, then end the turn and
take the foe's telegraphed hit.

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

### Cards

**The kin brings the attacks. The deck makes them land harder.** Nothing in your
own deck damages the foe by itself — a support card that did would make the kin
an accessory to the deck, and it is meant to be the other way round. Every point
of damage in the game comes out of a move the active kin knows.

A card has one growable number, `v`, and `vt` says what that number is:

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
move plus the support you stack onto it. Foes carry `FOE_HP_MUL` times their
normal HP — only a little over 1, now that the deck sharpens attacks instead of
adding its own.

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
