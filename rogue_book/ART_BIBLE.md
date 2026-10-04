# ECHOWAKE: art, UI and audio bible

The look is the game's identity. It must read as **one confident, unique anime art style**, not
"canvas shapes". Everything is code (canvas paths, gradients, DOM/CSS), so the style has to be
achieved through discipline: a shared toolkit (`ART.tk`), a strict palette, and honest visual
iteration with screenshots. Read `DESIGN.md` first for contracts: every signature, id meaning, unit and coordinate
convention lives in `DESIGN.md` 5.6 (ART), 5.8 (UI) and 5.9 (SCENE). This file says how things should LOOK.

## 1. Style in one line: "Sumi-Shonen"

Line-art anime in a world that lost its sound: cel-shaded shonen figures, screen tone and gold leaf against a grey, hushed land that blooms back into colour wherever sound returns. The inked line stays: tapered outlines, hard-edged two-tone shading, halftone screen-tone in the shadows, gold-leaf
sparkle, manga speed lines and impact frames, vivid character colours against a deep indigo night. Sound is the visual currency: when something good happens it rings, ripples and glows; where the Hush wins things go grey, soft and still.

### The rules (all art modules obey these; deviations need a reason)

1. **Line.** Variable-width tapered outline (thick in the middle of a stroke, tapered at both
   ends, pressure wobble), drawn in deep indigo `#140f2e` (never pure black). Outer silhouette
   line ~3.2 px at s=1 for characters, inner detail lines ~1.4 px. Use `ART.tk.inkPath` or
   `inkStroke` for every outline so the whole game shares one hand.
2. **Shading.** Base colour + ONE hard-edged shadow shape (`U.color.shadow(base)`: darker and
   pulled toward indigo) + ONE rim light on the lit edge (cyan, pink or gold depending on the
   scene) + optional halftone dot pattern clipped inside the deepest shadow. No soft airbrush
   gradients on characters, except tiny glows for magic and eyes. Backgrounds may use smooth
   atmosphere gradients and mist layers.
3. **Highlights.** Curved white "anime gloss" band on hair, small specular dots on eyes, lips, metal,
   gems. Sparkle (4-point star, `ART.tk.sparkle`) for magic and rare things.
4. **Eyes** are the soul: large vertical ellipses, dark top-lid line with a wing flick, gradient iris
   (dark top, light bottom, hero colour), a big catchlight plus a small one and a tiny star, thin
   lower lash, expressive brows. Blush hatch marks when embarrassed or pleased. Blink every 3 to 5 s.
5. **Hair** is drawn as 6 to 10 layered locks (bezier ribbons) with per-lock sway phases so hair
   and ribbons move on their own. Every hero has a silhouette-defining hair shape and an accessory.
6. **Proportions.** In-battle sprites are "heroic chibi": about 3 heads tall (head roughly 36% of
   height), big expressive head, small hands, oversized signature weapon. Bust portraits are full
   anime proportion. Enemies are yokai and folk creatures: bold readable silhouettes at 120 px.
7. **Palette discipline.** Every asset uses: the indigo night base, up to three hero/creature hues, one
   accent glow colour, warm paper whites `#f3e6c8`, and gold `#f5c96a`. Saturation is high but never
   neon-on-neon. Night scenes are indigo and violet with warm lantern accents.
8. **Texture.** A subtle washi grain overlay (`ART.tk.paperGrain` is the helper name) and static grain on hushed things. Gold-leaf flecks (`kirakira`) drift in backgrounds. Nothing is perfectly clean.
9. **Composition.** Manga energy: diagonal cuts, speed lines behind attackers, hard vignettes, impact
   frames (a white or black flash with radial lines) on kills and crits, onomatopoeia bursts
   (`ZAN!` `DON!` `KIN!` `PIKA!` `BAN!` `WAAN!`) in skewed heavy letters with a thick outline.
10. **Life.** Nothing is static. Idle breathing (1 to 2% squash), hair and cloth sway, blink, glow
    pulses, drifting petals or fireflies or embers, parallax layers, flickering lanterns.

### Palette tokens (CSS custom properties in `base.css`, mirrored in `ART.tk.pal`)

```
--ink:#140f2e   --night:#0d0b1e   --indigo:#1a1340   --violet:#3b2a7a   --dusk:#5b3fa8
--paper:#f3e6c8 --paper2:#e6d3a3  --sumi:#241a3a    --gold:#f5c96a     --gold2:#ffe9a8
--vermilion:#e8383d  --sakura:#ff7eb6  --sakura2:#ffc2dc  --jade:#3fd6b0  --azure:#5fb4ff
--cyan:#5ff5ff  --amber:#ff9a2e  --bloodmoon:#b0245c  --ash:#8a86a8  --white:#fff8f0
```

Card palettes (`art.c` values) map to hue families: `rose sakura-pink`, `crimson vermilion`, `amber orange`, `gold yellow`,
`jade green`, `teal cyan-green`, `azure blue`, `indigo deep blue`, `violet purple`, `ink near-black with white line`, `moon silver-white`, `ash grey-lilac`.

## 2. Heroes (the design targets)

Each hero has a nominal sprite height of 250 px at s=1, origin at the feet centre, faces RIGHT, and these poses:
`idle attack cast hurt block down cheer walk` (`DATA.LISTS.poses`). Attack = lunge and swing (weapon arc), cast = raise a hand
and glow, hurt = recoil with squint and flash, block = brace, down = kneeling or fallen, cheer = victory pose, walk = 4-frame bob used on the map token.
All poses are procedural (offsets, rotations, limb angles, weapon angles driven by a pose blend, `pt` for one-shots and `t` for loops, see `DESIGN.md` 5.6), no sprite sheets.

- **Hanae, the Blossom Blade.** Late teens, bright, composed. Long sakura-pink hair in a high ponytail with a white ribbon, side-swept bangs, one ahoge, a flower hairpin. Rose-magenta eyes. White and pink short haori over a rose obi, short black hakama skirt, dark-red arm guards, tabi and geta boots. A katana with a flower-shaped tsuba, petals trailing every cut. Palette: `#ff7eb6 #fff4f8 #b0245c` plus gold.
- **Kuro, the Songweaver.** Early twenties, calm and teasing with a straight face, the harmony under the melody. Indigo-black messy hair with a long side lock and cyan-tinted tips, round glasses with a glint. Violet eyes. Long dark indigo coat with a waveform hem and a high collar, cyan note glyphs glowing on the backs of his hands, an oversized lacquered shakuhachi carried like a staff (finger holes glowing cyan), glowing sound rings and pearls that hang in the air and that he weaves into shapes, and a cord with a small bronze flute charm (a miniature shakuhachi, never a bell: small bells belong to Suzu). Palette: `#7a6bff #5ff5ff #1a1740`.
- **Suzu, the Moon Miko.** Seventeen, gentle with iron will. Very long silver-white hair with a blue tint, hime-cut bangs, red mizuhiki ribbons, a crescent-moon kanzashi. Pale silver-blue eyes with a soft glow. White kosode, vermilion hakama, detached sleeves, a gohei wand with paper streamers, a small rin bell at her belt, ofuda talismans (paper seals) orbiting her, a faint crescent halo. Palette: `#a9c4ff #e8424f #4a5c9c` plus white.
- **Raiga, the Thunder Monk.** Mid twenties, broad, cheerful and stoic. Spiky orange-gold hair with lightning-shaped bangs, a hachimaki headband with tails. Amber eyes. Sleeveless open monk robes, juzu prayer beads, tan skin, wrapped fists that crackle with electricity, a big sash, bare feet in sandals. Palette: `#ff9a2e #ffe45e #5a2a0a` plus electric blue.

Bust portraits (`ART.hero.portrait`, expressions `neutral smile angry hurt determined`) are the full-detail versions for hero select, dialogue, deck badges and card frames. Medallions are cropped faces for badges.

## 3. Enemies

Yokai and folk creatures drawn with the same line, shading and glow rules. Each enemy has a distinct **emissive accent** (glowing eyes, markings, a lantern) so intent reads at a glance.
Size classes and nominal heights at s=1: `s` 110, `m` 170, `l` 250, `xl` 340 px (`LISTS.sizeHeight`). Enemies face LEFT toward the heroes. Poses: `idle attack hurt block buff die telegraph` (`LISTS.enemyPoses`). `telegraph` is the wind-up shown while the intent is a big attack.
Elites get extra ornament, a coloured aura and a slightly larger size (x1.08, drawn by `ART.enemy.draw` from the tier); bosses are layered assemblies with parallax pieces (tails, arms, masks) that animate independently and change look per phase (`opts.phase`, 0 = opening form).
The creatures of each verse are the FIXED ROSTER in `CONTENT_SPEC.md` 4.1 (id, name, tier, size, role): `art_enemies_N.js` draws exactly the ids of verse N and registers each with `ART.enemy.register`. Minions are small `s` creatures that read as "summoned": simpler, paler, one accent colour.

- **Verse I, the Whispering Bamboo Grove:** forest spirits and folk monsters, warm golden dusk, hollow kodama with their echo eaten out. Boss: **Kuzunoha, the Nine-Voiced Fox**, a huge white fox whose nine tails each end in a small brass bell wrapped in violet hush smoke, glowing violet eyes, a floating mask. Second form (`phase` 1): all nine tails fan out and the mask splits.
- **Verse II, the Sunken Lantern City:** haunted canal town at night, lantern light on black water. Boss: **Jorogumo, the Silk Courtesan**, an elegant spider-woman in a layered kimono with silk threads and lantern eyes. Second form (`phase` 1): the kimono tears open on a spider's body.
- **Verse III, the Thunderless Citadel:** a fortress in a storm above crimson clouds where lightning falls without thunder, bells are wrapped in grey felt, strings are cut and the Hush is eating the notes. Its servants are built from sound-absorbing stuff of the old world: grey quilted felt, cotton wadding, layered futon quilting, wrapped grey cloth gags and cord bindings, grey ash and frost flecks (never static, studio foam or black bars). Boss: **The Conductor, Keeper of the Last Note**, three phases (`opts.phase` 0, 1, 2): a tall pale figure in a felt-grey formal haori with a thin red lacquered baton (0, the Conductor), the same figure swollen into a giant wrapped in quilted grey felt with padded dampers for arms (1, the Damper), the Hush itself, a colossal grey face in a hole in the sky with its mouth open making no sound and the faint silhouette of a yamabiko inside (2).

## 4. Cards

`ART.card.draw(ctx, cardIdOrInst, w, h)` draws the illustration window at (0,0) (roughly 170 x 116 at `hand` size, which is a 190 x 266 card; scales to any). Composition: a gradient sky or wash in the card's palette, halftone dots, speed lines, the **motif** (`art.m`, every id in `LISTS.motifs`, currently 59) large and dynamic, and if `art.hero` is true the owning hero's silhouette in an action pose cut into the scene. Every card art must be recognisable at 120 px wide and must not repeat a neighbour: vary composition by hashing the card id (mirror, scale, motif offset, secondary motifs, palette accent).

The **card frame** is DOM/CSS (`UI.card`, sizes in `DESIGN.md` 5.8, all 5:7): lacquered body with a hero-coloured header band, a round **cost orb** (top-left, glowing, animates on change), a type glyph, the illustration window with gold-leaf bevel, **gem sockets** (small cut-outs, lit when filled, display only: each carries its colour-independent glyph), a rules text area with underlined keywords, set like notation, rarity ornament (common: plain line, uncommon: silver leaf, rare: gold leaf with a slow shimmer sweep), a tiny hero medallion. Upgraded cards get a `+`, a warm golden glow and sparkle corners. Curses look hushed: grey, muffled and black-violet, with a rest squiggle where the art should sing.

## 5. Icons (`ART.icon.draw(ctx, kind, id, x, y, size, opts)`)

Chunky, readable at 24 px, same line and cel rules, centred on `(x, y)`. What `id` means for each `kind` is defined in `DESIGN.md` 5.6.
- `status`: all 20 statuses in `DATA.statuses`, buffs on warm/blue discs, debuffs on red-violet, resources on hero-coloured discs.
- `relic`: every id of `LISTS.relicIcons` (currently 58), with `art.c` palette and a subtle gold leaf rim. The ids shared with `LISTS.motifs` reuse `ART.card.motif`.
- `gem`: cut (`round oval square drop star`) by `tier` (1 to 3: more facets, more glint, tier 3 has an orbiting sparkle) and colour (`red blue green gold`). Colour is never the only signal: every gem, socket and prism carries an engraved glyph (red sword, blue shield, green leaf, gold star, prism ring).
- `tile`: map tile icons as stamp glyphs (a vermilion hanko circle behind a dark line drawing) for all `LISTS.tiles`: Downbeat (hyoshigi), Temple Bell, Songbird, Tuning Forge, Dead Silence.
- `intent`: enemy intent icons for `LISTS.intents`, bold inked style, with room for a number.
- `stat`: gold (koban coin), the Echo stat (a ping: a solid dot, one ring and a broken outer ring), hp (a heart with a stroke through it), energy (a glowing tama orb), the Song stat (beamed notes on a plaque), inkstone (Chimes: a furin wind chime), block (a shield). Song plaques carry stroke-only badge glyphs. `motif`: any `LISTS.motifs` id as a standalone icon.
- `type`: card type glyphs (attack: crossed blade, skill: fan, power: lotus, curse: skull seal, status: a torn rest mark). `row`: front and back glyphs.

## 6. Scenes (`ART.scene.draw`, `LISTS.scenes`)

Layered parallax with animated atmosphere, drawn once into cached layers where possible and composited with cheap per-frame motion.
- `title`: a bronze temple bell in a wooden belfry bound in grey Hush threads (free and ringing clear once the player has won), under a huge moon, bamboo silhouettes, grey ash and frost creeping in at the corners, rising note glyphs, sakura petals and fireflies. A big tapered **ECHOWAKE** logo that pulses with sound rings is drawn by `ART.scene.logo(ctx, x, y, w, t)`.
- `ch1`: bamboo grove at golden dusk, god rays, mist layers, a far torii, drifting leaves. `ch2`: night canal city, hanging lanterns and their reflections, rooftops, red arched bridges, drifting paper charms. `ch3`: storm citadel above crimson clouds, lightning that falls in silence, drifting felt, grey holes in the sky where notes were cut off.
- `boss1 boss2 boss3`: the verse scene pushed darker and more dramatic with a hard vignette and a colour shift.
- `camp` (fire under a giant sakura at night, sparks), `shop` (a lantern-lit peddler stall), `event` (a kamishibai street-theatre box on a fogbound shrine path), `treasure` (a glowing chest in a dark hall), `victory` (dawn, petals, warm light, the freed bell ringing), `defeat` (the land drained grey, the bell whole but re-wrapped in grey threads, never cracked), `paper` (a reusable cool silk texture with fibre).
- Combat scenes are composed for the actor layout in `DESIGN.md` 5.9: ground line at y=520 of 720 where feet sit, heroes on the left third, five enemy lanes across the right two thirds.
- **Map art** (`ART.map.*`, hex geometry and kinds in `DESIGN.md` 4.8 and 5.6): hushed versus awake is the whole read. Hidden hexes (`fog`) are cool grey, perfectly still, with a faint baked ash grain and stitched dotted edges; `known` landmarks show a dim silhouette (heard from afar). `painted` (woken) hexes are colourful, with wobbly inked outlines, the tile's stamp icon and sound rings, and woken hexes near the party move a little (bamboo bends, water ripples, lanterns flicker) while fog never does. The reveal is a circular sound wavefront with rings escaping and a note rising, never a colour wash. A lacquered wooden frame with a kumiko band surrounds the map view (the window is at least 1180 x 640). `ART.map.paintBloom(ctx, x, y, size, p)` is the reveal animation (the sound wavefront from the hex, `p` 0..1), and `ART.map.token(ctx, heroIds, x, y, t, moving)` draws the two chibi hero tokens.

## 7. VFX (`ART.fx.*`, used by `SCENE`)

Every effect is `ART.fx.NAME(ctx, o, t)` with `t` = progress 0 to 1 (signature, options, default durations and the exact list of 24 names are in `DESIGN.md` 5.6 and `LISTS.fx`; SCENE owns timing). How they should look:
`slash` (tapered crescent arc), `cross`, `thrust`, `burst` (radial impact with speed lines), `ring` (expanding shock ring), `inkSplash` (a sound burst: waveform rim, spikes, three expanding rings and note heads), `petals`, `lightning` (branching bolt), `chain` (between two points), `flame`, `frost`, `poison` (bubbling), `shield` (hex-ripple barrier), `heal` (rising light motes), `buff`/`debuff` auras (upward or downward glyph streams), `sparkle`, `speedLines`, `impactFrame` (invert flash with radial burst), `sfxText` (onomatopoeia), `vignette`, `chromatic` (RGB split pass), `brushDrag` (a sine sound sweep drawn across the screen), `numberPop` (damage digits in comic style: white fill, thick indigo outline, red for big, green for heal, blue for block).

## 8. UI look (DOM and CSS)

- Base: deep indigo night with a fine grain overlay. Panels are lacquered wood and shoji screens (light panels use `--paper` as a cool silk, with a clean edge), a thin gold-leaf border and a deep shadow. Dark panels are lacquered indigo with a fine gold line.
- Buttons are wooden plaques or lacquer banners: primary = vermilion lacquer with gold trim and a subtle shine sweep on hover; secondary = silk; ghost = line only. Pressed = 3 px sink. All have the `ui_click` sound and a hover lift.
- Badges are hanko seals (vermilion rounded squares with white glyphs). Dividers are fine inked lines. Tooltips are manga speech bubbles with a small tail pointing at the source.
- Type: display serif for titles and card names (`--font-display`: "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Palatino Linotype",Georgia,serif), clean sans for body and UI (`--font-ui`: "Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","Segoe UI",system-ui,sans-serif), heavy rounded sans for numbers (`--font-num`: "Trebuchet MS","Segoe UI",system-ui,sans-serif, weight 900, with text stroke). Text sizes scale with the `textScale` setting.
- HUD (map): top-left the two hero badges (medallion, HP bar, name), top-right gold, Echo (an equalizer-row meter of Echo pings), Song tray (chips), menu and deck buttons, the verse title as a lacquer banner, relic strip along the bottom-left.
- HUD (combat): the zones and coordinates are fixed in `DESIGN.md` 5.8 (top bar with relic strip and menu button, hero panels top-left with HP, Block, up to 6 status chips, row label and Swap button, enemy HP bars and intent bubbles positioned via `SCENE.anchor`, hand fanned along the bottom, energy orb and draw pile bottom-left, discard pile and the big lacquer End Turn plaque bottom-right). Every HUD piece that a tutorial points at carries a `data-tut` anchor.
- Cards, gems and rarity read without colour alone: a keyboard focus ring in 3 px gold, colour-independent gem glyphs, and with `colorblind` a pattern fill on rarity and status discs (`DESIGN.md` 5.8). Text never clips at `textScale` 1.3.
- Motion budget: screens fade, slide like shoji doors or wipe in sound rings between each other (`UI.transition`), cards ease with `outBack`, numbers count up, panels slide 12 px and fade, buttons breathe when they are the obvious next action. `reduceMotion` is defined once, in `DESIGN.md` 5.8 (no shake, no flashes, parallax 0, particles x0.3, 150 ms fades).

## 9. Audio (`AUDIO`)

Synthesised only. Scales: in-sen (`D E F A B`), yo (`D E G A B`), miyako-bushi (`E F A B C`). Voices: **koto/shamisen pluck** (Karplus-Strong or damped triangle plus noise burst), **shakuhachi** (breathy sine plus band-passed noise with vibrato and pitch scoop), **taiko** (sine sweep plus noise slap, low tom), **hyoshigi** wood clacks (short noise bursts), **rin bell** (inharmonic FM), **biwa** thumps, soft **pad** (detuned saw through a low-pass) for atmosphere, a gentle **arpeggio** layer for combat.
- Music is generative but musical: each track is a set of patterns (chord loop, melody generated from the scale by a seeded walk with motif repetition, percussion pattern) sequenced by a lookahead scheduler. Tracks: `title` (slow, grand, shakuhachi over pad, distant taiko), `hero_select` (warm koto), `map1..3` (the land under the Hush: a still bed that gains bass, then arpeggios, then the melody as the map wakes, heard through a low-pass that opens with it; verse III is the deepest hush), `combat1..3` (driving taiko, ostinato, rising layers as enemies fall), `elite` (tense, tritone-ish hits), `boss1..3` and `final` (big, layered, phase-aware through `AUDIO.intensity(n)`), `shop` (playful plucks), `camp` (crackle plus soft lullaby), `event` (mysterious sparse), `reward` (short fanfare loop), `victory`, `defeat` (one-shot stingers that then fall to silence or a soft loop).
- **Echo.** Every woken hex sings one note of a seeded tune in the verse's key (columns carry the tune, rows bend it), a chain or a walk plays a phrase, each Song has a gesture with a sung or spoken layer (Drum Line plucks on taiko and speaks kuchi shoga, Ripple runs up with a soft "oo", Shout cries "hey!" over a strummed triad, Beat Drop is a beatbox kick and sub drop then rises, Chorus stacks six bells and six "ah" voices, Hum is one closed-mouth "mm"), and a half-beat echo answers. Temple bells are tuned to the land (sfx id `well`, re-voiced). Pitch is decoration, never information.
- SFX: every id in `LISTS.sfx`, short, punchy, layered from synth primitives, slightly randomised pitch per play to avoid repetition, a global compressor and limiter so stacking never clips. AUDIO scales music to 0.55 of SFX gain at equal slider values (an internal constant, `MUSIC_SCALE`), and the default sliders are musicVol 0.7 and sfxVol 0.8 (`DATA.SETTINGS`), so by default the music sits about half as loud as the SFX; it ducks under big hits.
- `audio.js` never references `META` (it loads before it): `UI.applySettings()` is the only bridge (`AUDIO.setVolume`). Audio starts on the first pointer or key event; a track requested earlier is remembered and starts then. `AUDIO.intensity(n)` (0..1, from the fraction of enemies fallen plus boss phases) layers the combat and boss tracks up.
