# HOCUS VOCUS: art, UI and audio bible

The look is the game's identity. It must read as **one confident, unique chibi candy style**, not "canvas shapes". Everything is code
(canvas paths, gradients, DOM and CSS), so the style has to be achieved through discipline: a shared toolkit (`ART.tk`), the owners'
chibi cast kit (`ART.rj`), a strict palette, and honest visual iteration with screenshots. Read `DESIGN.md` first for contracts: every
signature, id meaning, unit and coordinate convention lives in `DESIGN.md` 5.6 (ART), 5.7 (AUDIO), 5.8 (UI) and 5.9 (SCENE). This file
says how things should LOOK and SOUND. The owners' own chibi cards are the style authority, and `plan/HV_ART_AUDIO.md` goes deeper on
every picture and every sound.

## 1. Style in one line: "chibi candy"

Round, bouncy chibi figures with a warm brown outline, big flat-cel eyes and saturated candy colours on a deep indigo night, in a world
the Gloss has put on mute. Where the Gloss wins, things go opalescent, airbrushed, symmetrical and still; where a real voice comes
back, colour, sparkles and sound rings come back with it. Sound is the visual currency: when something good happens it rings,
sparkles and glows. The Gloss is never dark and never scary. It is too clean.

### The rules (all art modules obey these; deviations need a reason)

1. **Line.** An even outline of almost constant width with a slight taper. Heroes and crew wear the kit's warm brown `#2d170f`
   (`RJ.LINE`: main 2.0, mid 1.6, fine 1.15 at figure scale). Creatures scale the width by size class (`s` 2.0, `m` 2.4, `l` 2.8, `xl`
   3.2) and wear a line colour that tells the Acts apart: deep navy `#22264a` in Acts I and II, cool slate `#5a5f7a` in Act III, which
   reads too clean. Never pure black. The cast and the foe kit draw their own outline (`ART.rj`, `ART.rj.foe`); `ART.tk.inkPath` is
   the toolkit's tapered line for the older helpers.
2. **Shading.** Base colour + ONE warm hard cel shadow (`RJ.shade`, darker and pulled toward the warm brown) + one thin highlight on
   the lit side. No halftone screen-tone, no variable-width tapered stroke, no grain on characters or creatures. Light comes from the upper
   right of the screen, and a flipped figure keeps it there. Backgrounds may use soft gradients, glows, mist and bokeh.
3. **Highlights.** One curved gloss band on hair, small specular dots on eyes, mics, gems and chrome. A sparkle (a 4-point star,
   `ART.tk.sparkle`) marks magic and rare things.
4. **Eyes** are the soul: big flat-cel eyes with a big catchlight and a small one, thin brows, small blush hatch marks when pleased
   or embarrassed, a blink every 3 to 5 s. Even a grumpy creature stays cute.
5. **Shapes.** Round bouncy shapes, stubby limbs, big heads, and one silhouette that is unmistakable per character (a mohawk running
   into a mullet, a high ponytail with a scrunchie, headphones, an orange bass). Hair and cloth sway on their own.
6. **Proportions.** Heroes are chibi: a head about 118 px tall on a figure about 262 px tall to the top of the skull (nominal sprite
   height 250 px at scale 1). Busts are the same figures cropped at the shoulders. Creatures have bold readable silhouettes at 120 px.
7. **Palette discipline.** Saturated candy colours on the deep indigo night, up to three hues per asset, one accent glow, warm cream
   `#fff8ec` for light things. The Gloss is the only thing that is pastel, smooth and symmetrical.
8. **Surface.** Clean flat fills. No paper grain and no flecks of leaf. A sticker gets a die-cut cream rim; the Gloss gets a diagonal
   highlight sweep like a phone screen catching the light.
9. **Composition.** Bouncy, with comic punch: speed lines and impact frames (a pink and green duotone flash) on big hits, and hit
   words in chunky rounded letters (cream fill, thick warm outline): `LA!` `BOOM!` `SIZZ!` `TING!` `WOMP!` `PKAH!` `NANANA!` `TA-DA!`.
10. **Life.** Nothing is static. Idle breathing (1 to 2% squash), hair and cloth sway, blinks, glow pulses, drifting petals, swaying
    bunting, twinkling fairy lights, bobbing letters, parallax layers.
11. **Text in art.** Text drawn by art code is limited to the logo `HOCUS VOCUS`, the hit words above, `APPLAUSE`, `SKIP`,
    `FLAWLESS!`, the Notification Imp's number, `ON AIR` on the Studio stamp, `ALL AREAS` and `CREW` on two Charm icons, the three
    Scrollopolis graffiti words (`first!`, `mid`, `who asked`), and the handle `@roxorloopsandjasmin` with the score digits on the
    share card. Nothing else.
12. **Content.** No animal products drawn or named: no leather, fur, wool, felt, silk, feathers as a material, pearl, coral, ivory, bone,
    horn or shell as a material (the goat suit is cosy fabric, curtains are just curtains). Animal-like characters are fine (Kraki,
    gulls, the goat suit, Botlings). Food is plant-based and never labelled as such. No real people, no platform logos or interface
    copies (hearts, thumbs, red dots and play triangles are generic).

### Shared visual vocabulary (use everywhere so the game reads as one world)

| Motif | Shape | Colours | Used by |
|---|---|---|---|
| Sparkle | a 4-point star with a smaller one beside it | cream `#fff8ec`, gold `#ffd84d`, or the hero colour | magic, rare things, Spells, the logo wand |
| Sound rings | 2 or 3 concentric arcs, alpha falling outward (`tk.soundRings`) | hero colour or cream | live hexes, the reveal, RoxorLoops's beats, speakers |
| Note glyphs | eighth, beamed pair, quarter (`tk.note`) | cream, gold, or the 7-step hue ramp | the reveal, title drift, card grounds, Jasmin's runs |
| Cherry petals | a five-petal blossom and loose petals (`tk.petal`) | `#ff7eb6`, `#ffc2dc`, cream centre | Jasmin, the logo O, Act I, the Bloom resource |
| The Gloss | an opalescent film with a diagonal highlight sweep, airbrushed soft edges, the one shared Gloss smile (a small closed-mouth curve) | `#f4f1fb`, `#e6d9ff`, `#d9fff4`, `#ffe3f1`, chrome `#c9cbd6` | muted hexes, the wrapped title mic, Act I Gloss patches, Act III everything, the defeat scene |
| Stage | a round stage with a cream lip, spotlights with dust motes, curtains with gathered folds, fairy lights, bunting | curtain `#c8264f` and `#8f1838`, light `#fff4d6` | title, victory, defeat, Merch Stall, Green Room, Headliner scenes |
| Sticker | a die-cut cream rim (2 to 3 px) and a soft drop shadow round any drawn object | cream `#fff8ec`, shadow `rgba(20,10,40,.35)` | map tile stamps, card hero art, Stickers, Charm plates |
| RJ monogram | one chunky rounded stroke: the stem of an R, its bowl, and the bowl's tail running down into the hook of a J | cream on a disc split diagonally pink and green | favicon, card back, share card, boot splash, the Merch Stall flag |

### Palette tokens (CSS custom properties in `base.css`, mirrored in `ART.tk.pal`)

```
--hv-pink:#ff7eb6  --hv-pink-d:#c93f78  --hv-pink-l:#ffc9de   --hv-green:#3fcf6a  --hv-green-d:#1f7a3a  --hv-lime:#c6ff3d
--hv-violet:#a77bff  --hv-orange:#ff9a2e  --hv-teal:#2ec4b6   --hv-cream:#fff4e6  --hv-line:#2d170f
--gloss:#f4f1fb  --gloss-lilac:#e6d9ff  --gloss-mint:#d9fff4  --gloss-blush:#ffe3f1   --vox: an inline SVG of the Vox orb

the earlier tokens, all kept (ids; ART.tk.pal is test-pinned):
--ink:#140f2e   --night:#0d0b1e   --indigo:#1a1340   --violet:#3b2a7a   --dusk:#5b3fa8
--paper:#f3e6c8 --paper2:#e6d3a3  --sumi:#241a3a    --gold:#f5c96a     --gold2:#ffe9a8
--vermilion:#e8383d  --sakura:#ff7eb6  --sakura2:#ffc2dc  --jade:#3fd6b0  --azure:#5fb4ff
--cyan:#5ff5ff  --amber:#ff9a2e  --bloodmoon:#b0245c  --ash:#8a86a8  --white:#fff8f0
```

The hero colours are Jasmin pink, RoxorLoops green, RawClaw violet, Andy orange and Jordan teal. The UI uses the candy tokens on the
deep indigo night (`--night`, `--indigo`); the older tokens stay defined for the code that still reads them but no longer decide
how a panel or a button looks.

Card palettes (`art.c` values) map to hue families: `rose` bubblegum pink, `crimson` tomato red, `amber` orange, `gold` sunshine
yellow, `jade` mint green, `teal` sea teal, `azure` sky blue, `indigo` deep blue, `violet` lilac purple, `ink` near-black navy with a
cream line, `moon` cream-white, `ash` pale lilac-grey. The ids are fixed; only the look changed.

## 2. The cast (the design targets)

Each hero has a nominal sprite height of 250 px at s=1, origin at the feet centre, faces RIGHT, and these engine poses:
`idle attack cast hurt block down cheer walk` (`DATA.LISTS.poses`). They are the chibi kit's pose tables (`idle sing attack hurt cheer`
plus `windup strike block down walk` per figure), blended by the timelines in `art_cast.js` with the same lengths and key moments as
before. Attack = a windup and a strike (the mic, the pad or the bass thrust at the creature, with sparkles, petals, a wave along the
ground or a violet pad flash), cast = a sung phrase with notes in the hero colour, hurt = a recoil with a sweat drop and dizzy
sparkles, block = bracing with sound rings in the hero colour, down = **lost their voice for a moment**: sitting on the stage floor
with eyes closed and a small grey "..." bubble, never hurt or fallen, cheer = the victory pose, walk = a bouncy step cycle used on the
map token. All poses are procedural (offsets, rotations and limb angles driven by a pose blend, `pt` for one-shots and `t` for loops,
see `DESIGN.md` 5.6), no sprite sheets. Nobody holds a sword, a staff or a flute.

- **Jasmin, the Blossom Voice** (`hanae`, lead, attack). Warm, gentle, quietly confident, a little dreamy. A high brown ponytail with a
  pink scrunchie that never moves, a pink clip, a gold hoop earring, a heart necklace, a pink dress, cherry petals drifting from every
  note, a black mic with a pink band. She never belts: her runs land like falling petals. Palette: `#ff7eb6 #fff4f8 #b0245c`.
- **RoxorLoops, the Beatbox Wizard** (`kuro`, backing, support). Playful, cheeky, the duo's hype man. A mohawk on top running into a
  mullet at the back, shaved sides, a black tee with a big smiley face, green pants, lime shoes, hands cupped round a green mic, sound
  rings (kick, snare and hi-hat shapes) popping out of it. A loop station may sit at his feet in a pose or two: a minor prop. Palette:
  `#3fcf6a #c6ff3d #0f3a1e`.
- **RawClaw, the Sound Alchemist** (`suzu`, backing, unlocked by clearing Act I). Laid-back, nerdy about sound, generous. Violet
  headphones round his neck, a light grey jacket over a navy hoodie, a violet pad sampler on a strap that lights up when he plays,
  violet waves and filter curves floating round him. Palette: `#a77bff #e9ddff #3b2470`.
- **Andy, the Thunder Bass** (`raiga`, lead, unlocked by clearing Act II). Big-hearted, chill, unflappable. A relaxed figure with an
  orange bass guitar slung low, a loop pedal at his feet, orange sound waves rolling along the ground like waves on a lake, the famous
  bass face when the groove hits. Palette: `#ff9a2e #ffe45e #5a2a0a`.
- **Jordan** (not a hero, `ART.cast`). Teal, round glasses, a tablet and stylus, a tote bag of his own designs. He stands behind the
  Merch Stall and reacts to what you buy. Palette: `#2ec4b6 #e6fffb #0d4f4a`.
- **Outfits** (presentation only, unlocked by Stickers, chosen per viewer): the Unicorn Onesie for Jasmin, the Monster Onesie for
  RoxorLoops and the Goat Suit for RawClaw (cosy cream fabric with small curled horns, floppy ears and headphones over them). Same
  anchors and hit boxes as the stage clothes; a missing outfit falls back to stage clothes. Andy has none yet.

Bust portraits (`ART.hero.portrait`, expressions `neutral smile angry hurt determined`) are the same figures cropped at the shoulders on
a stage spotlight in the hero colour, for hero select, dialogue, deck badges and card frames: `angry` is a pout or a determined frown,
never scary. Medallions are cropped faces for badges, readable at a radius of 9 px.

## 3. Creatures

Silly, readable creatures of the Soundlands, drawn with the same line, shading and glow rules, from the shared foe kit (`ART.rj.foe`)
and one helper set per Act. Each creature has a distinct **emissive accent** (glowing screen eyes, a ring light, a bulb) so its intent
reads at a glance. Size classes and nominal heights at s=1: `s` 110, `m` 170, `l` 250, `xl` 340 px (`LISTS.sizeHeight`). Creatures face
LEFT toward the heroes. Poses: `idle attack hurt block buff die telegraph` (`LISTS.enemyPoses`). `telegraph` is the wind-up shown while
the intent is a big attack. The `die` pose is the win-over: the Gloss flakes off as sparkles, the creature takes one happy hop in its
real colours, pops into the Act's confetti, and nothing of the body is drawn after that.
Rivals get extra ornament, a coloured aura and a slightly larger size (x1.08, drawn by `ART.enemy.draw` from the tier); Headliners are
layered assemblies with parallax pieces (mics, arms, masks, cables) that animate independently and change look per phase (`opts.phase`,
0 = opening form). The creatures of each Act are the FIXED ROSTER in `CONTENT_SPEC.md` 4.1 (id, name, tier, size, role):
`art_enemies_N.js` draws exactly the ids of Act N and registers each with `ART.enemy.register`. Sidekicks are small `s` creatures that
read as "summoned": simpler, one accent colour.

- **Act I, Blossom Bay:** a sunny harbour town in candy colours (tomato red, mint, lemon, sky blue), bunting, cherry trees, boats with
  fairy lights, a tiny stage at the end of every pier. Its creatures are everyday things that caught a little Gloss: foghorns, a
  karaoke machine, a coin crab, accordions, chillies, melons, a jukebox. Each carries exactly one airbrushed Gloss patch that flakes
  off when it is won over. Line colour navy. Headliner: **Kraki, the Karaoke Kraken**, a huge friendly pink and teal kraken with eight
  stolen mics. Phase 0 (masked): seated low in the water, eight arms in a loose fan, a glossy smiling mask. Phase 1 (`phase` 1,
  unmasked): the mask halves drift apart with warm light between, and the arms spin into a peacock wheel of gold mics with three
  turning sound rings.
- **Act II, Scrollopolis:** a neon city built like a stack of giant phones at 2 am, scrolling streets, notification balloons, silly
  comment graffiti, a web of glowing cables across the sky (the Feed), and a huge moon nobody looks at. Its creatures are the feed as a
  zoo: every one has a little screen and looks down, and when it is won over it looks up at the moon. Line colour navy, lit by screen
  blue, cyan and heart pink. Headliner: **Scrollspinner, Queen of the Feed**. Phase 0 is the Avatar (a glittering gown, a filtered
  face in a ring-light halo, a selfie phone); phase 1 is the Spinner (the gown split on a spider body, eight phone-screen eyes, the web
  of cables). The gown is glitter and bells, never silk.
- **Act III, The Perfect Stage:** a colossal arena floating above a sea of phone lights in opal white and pastel chrome, mirror floors,
  perfect symmetry, ring lights, an APPLAUSE sign, confetti that falls in a grid, identical mannequin fans and three empty judges'
  chairs (always generic). Its creatures are the Polished: chrome, mirrors, sequins, perfectly symmetric until they are hurt. Line
  colour slate. Headliner: **Flawless, Star of the Perfect Stage**, three forms (`opts.phase` 0, 1, 2): Flawless, a slender pastel
  chrome idol with a mirror mic and the Gloss smile (0); the Filter, a head folded into a ring-light lens with selfie-stick arms
  and the words `FLAWLESS!` across the chest band (1); and the Gloss itself, a smooth mirror face filling the sky, showing the two
  heroes as pastel silhouettes (2). While the Filter is up both heroes wear a light pastel wash. When Flawless is won over the mirror
  crazes into soft sparkles and a tiny shy lens sings one crooked note.

## 4. Cards

`ART.card.draw(ctx, cardIdOrInst, w, h)` draws the illustration window at (0,0) (roughly 170 x 116 at `hand` size, which is a 190 x 266
card; scales to any). Composition: a ground, a secondary stamp, the chibi hero as a sticker when `art.hero` is true, the **motif**
(`art.m`, every id in `LISTS.motifs`, currently 59) large and bouncy, and a foreground. The six grounds are a stage at golden hour, a
pastel gig-poster wash with a ring of sparkles, comic focus rays, the owners' duo-card split (a hard diagonal between two tones), a
starry night with a big moon and a spotlight circle on a stage floor; patterns are polka dots, a checker stage floor and a field of tiny
stars; scenery is bunting, gulls, a fairy-light string and a far stage arch. Every card art must be recognisable at 120 px wide and
must not repeat a neighbour: vary composition by hashing the card id (mirror, scale, motif offset, secondary motifs, palette accent).
Curses look like a grumpy grey-violet jinx (the colour drained, a pastel Gloss smear, a small frowny sticker), never torn and never a
skull; status cards look like cards buffed too smooth by the Gloss.

The **card frame** is DOM/CSS (`UI.card`, sizes in `DESIGN.md` 5.8, all 5:7): a deep indigo body with a header band in the hero colour,
a round **cost orb** (top-left, a puff of Breath in a sky-blue orb, animates on change), a type glyph, the illustration window with a
cream bevel, **gem sockets** (small rounded cut-outs, lit when filled, display only: each carries its colour-independent glyph), a
rules text area with underlined keywords, rarity (common: plain; uncommon: a lilac sparkle edge; rare: a gold edge with a slow sparkle
sweep) and a tiny hero medallion. Upgraded cards get a `+`, a warm glow and sparkle corners.

## 5. Icons (`ART.icon.draw(ctx, kind, id, x, y, size, opts)`)

Chunky, readable at 24 px, same line and cel rules (a chunky sticker look: even outline, flat fills, one highlight, a cream die-cut rim
where an icon sits on a plate), centred on `(x, y)`. What `id` means for each `kind` is defined in `DESIGN.md` 5.6.
- `status`: all 20 statuses in `DATA.statuses`, buffs on warm or blue discs, debuffs on red-violet, resources on hero-coloured discs
  (Bloom pink, Groove green, Reverb violet, Rumble orange). Each glyph says what it is: a volume knob, a mic with a cushion over its
  grille, a mug with a heart in its steam, a note-worm curling round an ear.
- `relic`: every id of `LISTS.relicIcons` (currently 58, for the 66 Charms), with `art.c` palette and a cream rim. The ids shared with
  `LISTS.motifs` reuse `ART.card.motif`.
- `gem`: cut (`round oval square drop star`) by `tier` (1 to 3: more facets, more glint, tier 3 has an orbiting sparkle) and colour
  (`red` is drawn pink, `blue`, `green`, `gold`, and a rainbow ring for `any`). Colour is never the only signal: every gem, socket and
  rainbow slot carries an engraved glyph (ids `sword`, `shield`, `leaf`, `star`, `ring`; the `sword` is drawn as an eighth note).
- `tile`: map tile icons as round stickers with a cream rim for all `LISTS.tiles`: Soundcheck (the tour van and a mic stand), Blur (an
  opalescent blurred-out hole), Face-Off (two crossed mics), Rival (a star with a frown), Headliner (a marquee star with light
  bulbs), Gift Box, Merch Stall, Green Room, Detour (a bent arrow sign), Tea Stall (a steaming cup on a cart), Busker (an open hat),
  Sparkle Booth and Studio (a door with an `ON AIR` light).
- `intent`: creature intent icons for `LISTS.intents`, bold and bouncy, with room for a number.
- `stat`: gold (a coin with a star), the Vox stat (a round voice orb, pink to mint, with a waveform across it), hp (a heart), Breath
  (a puff of breath in a sky-blue orb), the Spell stat (a mic-wand with a star on top), Cheers (two clapping hands) and block (a round
  shield). Spell plaques carry stroke-only badge glyphs. `motif`: any `LISTS.motifs` id as a standalone icon.
- `type`: card type glyphs (attack: two crossed mics, skill: a magic wand, power: a rising star, curse: a frowny sticker, status: a
  pastel Gloss smudge). `row`: the lead glyph (a mic stand in front of a small speaker) and the backing glyph (a speaker in front of
  a small mic stand).

## 6. Scenes (`ART.scene.draw`, `LISTS.scenes`)

Layered parallax with animated atmosphere, drawn once into cached layers where possible and composited with cheap per-frame motion.
- `title`: a round stage under a huge cream moon, red curtains gathered at both sides, a string of fairy lights, and a vintage mic on a
  stand in the middle, Jasmin and RoxorLoops either side of it in their chosen outfits. Before the first win the mic is shrink-wrapped
  in the Gloss (an opalescent film with a highlight sweep); after it the mic is live and glows warm. Blossom Bay's candy houses climb a
  hill at the left, Scrollopolis's phone towers rise at the right, and the Perfect Stage floats far off as a faint ring of light. The
  stacked **HOCUS VOCUS** logo (the O of HOCUS a pink cherry blossom, the O of VOCUS a green mic grille, a mic-wand crossing behind) is
  drawn by `ART.scene.logo(ctx, x, y, w, t, opts?)`.
- `ch1`: Blossom Bay at golden hour, with a couple of house fronts gone opalescent and flat and lip-syncing busker silhouettes. `ch2`:
  Scrollopolis at 2 am, buildings that are giant lit phone screens, comment graffiti, notification balloons, falling heart and thumb
  icons, the Feed across the sky and a huge moon over the rooftops. `ch3`: the Perfect Stage, opal white and pastel chrome with a
  mirror floor, ring lights, mannequin fans and confetti falling in a perfect grid.
- `boss1 boss2 boss3`: the Act scene at its most dramatic: the pier stage grown to the size of the harbour at sunset, the tallest phone
  tower under the moon with the Feed's web behind, and the centre of the Perfect Stage under the blazing APPLAUSE sign.
- `camp` (a cosy backstage Green Room with a kettle, a mirror ringed by bulbs and a door with a star), `shop` (Jordan's Merch Stall from
  the front: a teal canopy, T-shirts, totes, sticker sheets), `event` (a street corner at dusk with a bent arrow signpost: the Detour
  board), `treasure` (a gift box on a small round stage under a spotlight), `victory` (dawn over the open stage, the crowd's silhouettes
  singing, the Gloss softened into ordinary stage shine, confetti that does NOT fall in a grid), `defeat` (an empty stage with the
  curtain half closed, one mic in a spotlight, the Gloss settling like dust and a thin warm line of light under the curtain: never
  broken, never dark), `paper` (a reusable cream gig-poster texture).
- Combat scenes are composed for the actor layout in `DESIGN.md` 5.9: ground line at y=520 of 720 where feet sit, heroes on the left
  third, five creature lanes across the right two thirds.
- **Map art** (`ART.map.*`, hex geometry and kinds in `DESIGN.md` 4.8 and 5.6): muted versus live is the whole read. Muted hexes (`fog`)
  are the Gloss: opalescent, smooth and perfectly still, with a diagonal highlight sweep and a dotted outline; `known` landmarks show a
  faint pastel silhouette under the film (spotted from afar). `painted` (live) hexes are loud candy colour with an even warm outline,
  the tile's sticker and a faint sound ring, and live hexes near the party move a little (bunting sways, a screen flickers, fairy bulbs
  twinkle) while muted ground never does. The reveal is the Gloss film peeling away from a circular wavefront with pink and green
  sparkles riding it, three sound rings escaping and a note rising, never a colour wash. A tour-poster frame (deep indigo enamel, a pink
  to green pinstripe, a row of chasing marquee bulbs) surrounds the map view (the window is at least 1180 x 640).
  `ART.map.paintBloom(ctx, x, y, size, p)` is the reveal animation (`p` 0..1), and `ART.map.token(ctx, heroIds, x, y, t, moving)`
  draws the two chibi hero tokens.

## 7. VFX (`ART.fx.*`, used by `SCENE`)

Every effect is `ART.fx.NAME(ctx, o, t)` with `t` = progress 0 to 1 (signature, options, default durations and the exact list of 24 names
are in `DESIGN.md` 5.6 and `LISTS.fx`; SCENE owns timing). How they should look:
`slash` (a sung arc: a fat ribbon of light with a cream core, two note heads and a petal flung off), `cross`, `thrust` (a beam of sound:
a cone of rings snapping to its end), `burst` (a comic starburst impact with speed lines), `ring` (an expanding sound ring), `inkSplash` (the
beat burst: a green and lime starburst with a waveform rim, three expanding rings and note heads; also the summon and win-over pop),
`petals` (a swirling cherry petal storm), `lightning` (Andy's bass bolt: a thick orange zigzag with a low wave along it), `chain` (a
walking bass line of note heads between two points), `flame` (round cartoon flames), `frost` (a glassy crystal sparkle with a bell
ring), `poison` (little note-worms wriggling up), `shield` (a sound wall: a speaker-grille dot mesh that lights along a ripple), `heal`
(rising hearts, a curl of steam, a warm light column), `buff`/`debuff` (rising equaliser bars and chevrons; falling bars and a pastel
Gloss drip), `sparkle`, `speedLines`, `impactFrame` (a pink and green duotone flash with rays), `sfxText` (the hit words in the logo's
chunky letters, the element colour as a shadow), `vignette`, `chromatic` (an RGB split that now reads as a Gloss glitch), `brushDrag` (a
Spell cast: a mic-wand sparkle trail sweeping across the screen), `numberPop` (chunky rounded damage digits: cream fill, thick warm
outline; red for big, green for heal, blue for block). When a hero attacks with the default `slash` element the effect takes the hero's
colour (pink, green, violet, orange); the word stays the element's.

## 8. UI look (DOM and CSS)

- Base: the deep indigo night. Dark panels are indigo stage panels with rounded 16 px corners and a thin pink to green top stripe; light
  panels are cream gig-poster cards (`--hv-cream`) with soft printed edges.
- Buttons are candy pills: primary = pink (`--hv-pink`) with a cream inner rim, a warm outline, a 3 px drop "sticker" shadow and a soft
  shine; secondary = green; ghost = a cream outline only. Pressed = a 3 px sink. All have the `ui_click` sound and a hover lift.
- Badges (`UI.hanko` is the function name) are round stickers in the Act or hero colour with a cream rim. Dividers are fine lines.
  Tooltips are speech bubbles with a small tail pointing at the source.
- Type: a rounded heavy display stack for titles and card names (`--font-display`: "Arial Rounded MT Bold", "Nunito", "Quicksand",
  "Varela Round", "Trebuchet MS", system-ui, sans-serif, weight 800 to 900), a clean system sans for body and UI (`--font-ui`: "Segoe UI",
  "Helvetica Neue", system-ui, sans-serif) and a heavy rounded sans for numbers (`--font-num`: "Trebuchet MS","Segoe UI",system-ui,sans-serif,
  weight 900, with text stroke). No web font is ever loaded. Text sizes scale with the `textScale` setting.
- HUD (map): top-left the two hero badges (medallion, HP bar, name), top-right gold, Vox (an equaliser row of Vox orbs), the Spell tray
  (chips), menu and deck buttons, the Act title as a banner, the Charm strip along the bottom-left.
- HUD (combat): the zones and coordinates are fixed in `DESIGN.md` 5.8 (top bar with the Charm strip and menu button, hero panels top-left
  with HP, Block, up to 6 status chips, spot label and Swap button, creature HP bars and intent bubbles positioned via `SCENE.anchor`,
  the hand fanned along the bottom, the Breath orb and draw pile bottom-left, the discard pile and the big End Turn button bottom-right).
  Every HUD piece that a tutorial points at carries a `data-tut` anchor.
- Calm screens (title, Tour Bus, settings, the end screens) carry the **Follow the duo** panel: link pills with a small pink or green dot
  (a text pill, never a platform logo), Share, and Support when the owners have set a URL. Never in a fight, on the map or in a Detour.
- Cards, gems and rarity read without colour alone: a keyboard focus ring in 3 px lime with a soft dark outer edge, colour-independent
  gem glyphs, and with `colorblind` a pattern fill on rarity and status discs (`DESIGN.md` 5.8). Text never clips at `textScale` 1.3.
- Motion budget: screens fade, or close and open like stage curtains, or sparkle-swirl between each other (`UI.transition`), cards ease
  with `outBack`, numbers count up, panels slide 12 px and fade, buttons breathe when they are the obvious next action. `reduceMotion` is
  defined once, in `DESIGN.md` 5.8 (no shake, no flashes, parallax 0, particles x0.3, 150 ms fades).

## 9. Audio (`AUDIO`)

Synthesised only, with WebAudio; the single exception is the owners' optional recordings (the sample hook, below), which play instead of
a synthesised sound one file at a time and fall back to it whenever a file is missing. The sound is a vocal and beatbox band.
- **Voices.** RoxorLoops is the beatbox kit: a sine-drop kick with a lip click, lip and "cats" snares, "ts" hats, a throat bass with a
  growl and vocal scratches. Jasmin is `croon`, a soft sung lead that opens from "oo" to "ah", scoops up into each note and blooms into
  vibrato, with her own delay throw. RawClaw is `synth` (saw and square through a swept low-pass, zaps and lasers). Andy is `ebass`, a
  plucked and slapped electric bass. Around them: warm electric-piano `keys`, a bright `glock`, a ukulele, a breathy whistle, hand claps
  and finger snaps, the crowd's `choir`, a soft `pad`, the generic `arp` pluck, `crackle`, and `vox`, the formant voice that speaks the
  beatbox syllables (`boots cats ts pf k bwaa ab ra ca tada hey boom`) and, with `robot` set, is the Gloss's lip-sync.
- **Keys.** Scores use real keys (`major mixolydian dorian minor lydian`): bright major pop for Blossom Bay, a minor electro bounce for
  Scrollopolis, glassy lydian for the Perfect Stage. The melodic reveal sings on the pentatonic subset of the same key (`penta`,
  `pentaMinor`), so an unmuted hex can never clash.
- Music is generative but musical: each track is a set of patterns (chord loop, melody generated from the scale by a seeded walk with
  motif repetition, a beat grid, bass) sequenced by a lookahead scheduler. Tracks: `title` (moonlit and warm, Jasmin's theme over a soft
  beat), `hero_select` (bouncy, ukulele, whistle and Andy's bass riff), `map1..3` (the Acts under the Gloss: a still, muffled bed that gains
  bass, then arpeggios, then the melody as the map is unmuted, heard through a low-pass that opens with it; Act III is the most muffled),
  `combat1..3` (driving beatbox grooves with rising layers as creatures fall), `elite` (a showdown with a big beatbox breakdown),
  `boss1..3` and `final` (big, layered, phase-aware through `AUDIO.intensity(n)`), `shop` (cheeky, ukulele, whistle and finger snaps),
  `camp` (a backstage lullaby with vinyl crackle), `event` (curious and sparse), `reward` (a short fanfare loop), `victory` and `defeat`
  (stingers that settle into a soft loop).
- **The Gloss in sound.** Muted map ground is muffled (a low-pass and a gain floor that open as the Act is unmuted). Act III, the
  Headliner fights of the Perfect Stage and the finale start dead on the grid, with no swing and no human timing, and gain both as the
  Act is unmuted or the fight turns. The finale is the song "Human" (an original tune, never a lyric): the Gloss alone, then
  RoxorLoops, then Jasmin singing, then the whole crowd.
- **Unmuting.** Every unmuted hex sings one note of a seeded tune in the Act's key (columns carry the tune, rows bend it), a chain or a
  walk plays a phrase, each Spell has a gesture with a sung or beatboxed layer (Boots and Cats is the classic beatbox pattern, Vocal Run
  a rising sung run, Air Horn a beatboxed horn over a strummed triad, Abracadabass an "abra-ca" sung over a throat-bass drop, Surround
  Sound six stacked "oo" voices panning round a circle, Hocus Focus one bright "ting"), and a half-beat delay answers. Tea Stalls are
  tuned to the playing track (sfx id `well`). Pitch is decoration, never information.
- SFX: every id in `LISTS.sfx` (73, ids never renamed), short, punchy, layered from synth primitives, slightly randomised pitch per
  play to avoid repetition, a global compressor and limiter so stacking never clips. Six ids have a variant per hero (key
  `id.hero`, for example `card_play_attack.kuro`). AUDIO scales music to 0.55 of SFX gain at equal slider values (an internal constant,
  `MUSIC_SCALE`), and the default sliders are musicVol 0.7 and sfxVol 0.8 (`DATA.SETTINGS`), so by default the music sits about half as
  loud as the SFX; it ducks under big hits. Levels are measured offline with `tools/hocus_vocus/mix.mjs`, never guessed.
- **Your own recordings.** `DATA.SAMPLES` (`js/data_samples.js`, empty today) lists optional files in `audio/` per sound, per Spell, per
  syllable and per stinger; `audio/README.md` is the walkthrough. Nothing is fetched while the list is empty.
- `audio.js` never references `META` (it loads before it): `UI.applySettings()` is the only bridge (`AUDIO.setVolume`). Audio starts on
  the first pointer or key event; a track requested earlier is remembered and starts then. `AUDIO.intensity(n)` (0..1, from the fraction
  of creatures fallen plus Headliner phases) layers the combat and boss tracks up.
