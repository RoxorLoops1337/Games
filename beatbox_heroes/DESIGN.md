# Beatbox Heroes: design and module contracts

A portrait 16-bit neon-noir life-sim about a young beatboxer. Vanilla JS, no framework, no build step
(the folder is copied to `dist/` as-is). Logical screen **270 x 480** (9:16), scaled by an integer factor
with `image-rendering: pixelated`. Everything is painted into software pixel buffers (`Pix`, see `pix.js`),
so art runs identically in the browser and in node tests and can be written to PNG for review.

Never use the em dash character in any text, code comment, or document. Use commas, colons or plain hyphens.

## Files and owners

| file | what | notes |
|---|---|---|
| `pix.js` | `BBH.Pix`, colours, `BBH.PAL`, `BBH.ramp`, `BBH.rng` | done, shared, do not edit |
| `font.js` | `BBH.Font` 5x7 pixel capitals for in-scene text | done, shared, do not edit |
| `catalog.js` | `BBH.CATALOG` all cosmetics + unlock rules | done, shared, do not edit |
| `chars.js` (+ optional `chars_*.js`) | `BBH.Chars` paper-doll character renderer | agent: chars |
| `world_a.js` | `BBH.World` part A: title, logo, street, park, intro plates | agent: world A |
| `world_b.js` | `BBH.World` part B: interiors, stage, creator, icons, fx sprites | agent: world B |
| `audio.js` | `BBH.Audio` synth, drums, music | agent: audio |
| `core.js`, `game.js`, `index.html` | rules, scenes, UI | the lead |

Modules are UMD-style IIFEs: `const BBH = root.BBH || (root.BBH = {})`, and at the top
`if (typeof require !== 'undefined' && !BBH.Pix) require('./pix.js');` so they load in node and in the page.
In the page they are plain `<script>` tags in this order: pix, font, catalog, chars, world_a, world_b, audio, core, game.
No `import`/`export`, no external network assets. Tests live in `tests/beatbox_heroes_<name>.test.mjs` and use
`tests/beatbox_heroes_lib.mjs` (`ok/eq/near/between/done/load`). Each suite ends with `done()`.

## Style bible (all art)

* 16-bit neon-noir. Indigo/violet shadows, warm amber window light, hot pink/cyan/lime neon. Use `BBH.PAL` and
  `BBH.ramp(color)` (5 steps: deep, shade, base, light, hi, with noir hue shifting: shadows cool, lights warm).
* NEVER pure black outlines. Use coloured/selective outlines (`Pix#outline(fn)`: darken the neighbour colour,
  toward `PAL.ink`).
* Light comes from the upper left, except neon which glows outward. Banded shading (3 to 5 tones), no gradients
  except dithering (checkerboard / Bayer 2x2 dither is welcome for skies, fog, glow falloff).
* Neon: a bright core colour, a 1px lighter core line, and 2 to 4 px of dithered halo around it (additive `Pix#add`).
* Wet streets: a faded, vertically flipped copy of lit things under them, broken up by horizontal ripple lines.
* Storybook composition: every scene is a small illustration with ONE focal light, a readable silhouette,
  hand-placed clutter (cables, posters, litter, plants, steam, graffiti). Make it feel lived in.
* Pixel-perfect: no sub-pixel placement, no scaling inside a buffer, no anti-aliasing.

## Shared look object (see `catalog.js` `DEFAULT_LOOK`)

```
look = { name, body:'boy'|'girl'|'neutral', skin:'#hex',
  hair:{style, color, tip|null}, eyes:{style,color}, brows, facial, marks:[ids],
  top:{id,color,color2}, bottom:{id,color}, shoes:{id,color},
  hat:{id,color}, glasses:{id,color},
  acc:{neck:{id,color}, ears:{id,color}, back:{id,color}, hand:{id,color}, wrist:{id,color}} }
```
`skin`, `hair.color`, `hair.tip`, clothing colours may be ANY '#rrggbb' (free picker), not only catalog colours.

## BBH.Chars (chars.js)

Sprite size **W=44, H=64**, front facing, feet on the bottom row, horizontally centred at x=22 (so it
mirrors cleanly). Transparent background, 1px coloured outline included (so keep ~1px padding).

```
Chars.W = 44; Chars.H = 64;
Chars.POSES = { idle:{frames:2,fps:2}, walk:{frames:4,fps:8}, beatbox:{frames:4,fps:9}, dance:{frames:4,fps:8},
                cheer:{frames:2,fps:5}, sad:{frames:2,fps:2}, sit:{frames:2,fps:2}, point:{frames:2,fps:3},
                battle:{frames:2,fps:4}, finisher:{frames:4,fps:10}, hit:{frames:2,fps:6} }
Chars.render(look, pose, tMs, opts?) -> Pix   // frame = floor(tMs/1000*fps) % frames; opts:{frame, flip, noHat, noBack}
Chars.anchors(look, pose, frame) -> { mouth:{x,y}, head:{x,y}, handL:{x,y}, handR:{x,y}, feet:{x,y} }  // sprite coords
Chars.portrait(look, mood?, opts?) -> Pix     // 56x56 head+shoulders bust; mood: 'neutral'|'happy'|'sad'|'angry'|'shout'
Chars.thumb(group, id, look) -> Pix           // 28x28 tile showing look with ONE item swapped (group = catalog GROUPS key
                                             // 'hat','glasses','top','bottom','shoes','hairStyle','acc' (id like 'chain'),
                                             // 'facial','brows','eyeStyle','marks'); crops to the relevant body area
Chars.fix(look) -> look                       // fills every missing field from DEFAULT_LOOK, validates ids, clones
Chars.random(rng, isUnlocked?) -> look        // a nice random look; isUnlocked(group,id) filters choices
```
Renders are cached internally (by look hash + pose + frame; cap the cache at ~400 entries).
Three bodies: boy (broader shoulders/neck), girl (narrower shoulders, softer hips, slight waist),
neutral (in between). Poses must read clearly at 1x: beatbox = hand+mic at mouth, cheeks puffed, mouth open;
dance = arms up and swaying with a hop; walk = alternating legs and arm swing; sit = seated (knees forward).
Eyes blink occasionally in idle (frame based is fine). Every catalog id in every group must draw and look good.
Hats sit correctly over every hair style (hair is clipped/lowered under hats; ponytails and buns poke out where it makes sense).
Skin shading uses `BBH.ramp(look.skin)`; very light and very dark skin must both look good (check ramps are readable at both ends).

## BBH.World (world_a.js + world_b.js; both assign into `BBH.World`)

A "scene" is built once and cached: `World.scene(id, variant?) -> scene`.
```
scene = { id, variant, w, h,
  layers:[{ pix, speed }],     // back to front, speed = parallax factor 0..1 (1 = moves with the camera). Single-screen scenes have 1 layer, speed 1
  fg: Pix|null,                // foreground occluders (drawn over characters), same size as the scene, mostly transparent
  floorY: number,              // y where characters' feet stand by default
  spots:{ name:{x,y} },        // named feet positions
  hotspots:[{ id, label, x, y, w, h }],   // tappable rectangles in scene coordinates
  lights:[{ x, y, r, color, a, flicker, kind }],  // kind: 'window'|'lamp'|'neon'|'screen'|'fire'. The game draws additive glow + flicker each frame
  anim:[{ kind, x, y, ... }]   // optional hints: 'steam','cat','crowd','neon_flicker' ...
}
```
Scenes (ids and variants; all single screen 270x480 unless stated):
* `title` (no variant): key art. A neon city street at dusk, rain-slick road, the skyline, big sky area at the top
  (the logo is composited by the game), room at the bottom for menu buttons.
* `street` (variants `day`,`dusk`,`night`): **810 x 480**, 3 parallax layers (far skyline speed .25, mid buildings .6, near street 1.0).
  `floorY` ~ 412. Doors (hotspots, id = destination) in x order: `park` x~70, `home` x~225, `shop` x~395, `studio` x~560, `bar` x~725
  (hotspot ~48 wide, y covering the door). Signs carry the names (use `BBH.Font` / neon signs). Night: lit windows, neon, lamp cones, puddle reflections.
* `park` (variants `day`,`dusk`,`night`): trees, bench, graffiti wall, fountain or lamp; spots: stand, busk (a spotlight patch), bench, beeamgee. Hotspots: `spot`, `bench`, `gate`.
* `home` (variants `day`,`night`): lived-in apartment cutaway: bed, desk with monitor/keyboard, kitchenette, wardrobe, posters, plant, string lights.
  Hotspots: `bed`, `desk`, `kitchen`, `wardrobe`, `door`. Spots: stand, bed, desk, kitchen, wardrobe, foxy.
* `shop` (`day`,`night`): thrift shop: clothes racks, hat wall, shades display, mirror, counter. Hotspots `hats`,`racks`,`counter`,`mirror`,`door`. Spots: stand, clerk.
* `studio` (`day`,`night`): small recording room: foam panels, mic on a stand with pop filter, mixer, monitors. Hotspots `mic`,`mixer`,`door`. Spots: stand.
* `bar` (`night`): neon bar interior with a small stage, counter, stools, crowd silhouettes. Hotspots `stage`,`counter`,`door`. Spots: stand, rohzel, stage.
* `stage` (variants `pink`,`cyan`,`lime`,`gold`): battle/rhythm arena backdrop: spotlights, speakers, crowd silhouettes at the bottom, a lit platform. Spots: player, opponent, judge1, judge2, judge3. Calm enough that falling notes read on top of it (game dims it).
* `creator` (no variant): the character-creator stage: a spotlit round platform in a neon room (turntable feel), room for a 4x scaled hero in the centre. Spots: hero.
* `intro1` ... `intro6` (no variant): 270x270 story plates (see World A prompt for the beats).

Other World API:
```
World.logo() -> Pix            // "BEATBOX HEROES" title logo, ~230 wide: chunky 16-bit letters, neon outline, drop shadow, gold/cyan/pink; looks AMAZING
World.neon(text, color, scale?) -> Pix   // neon sign text with halo
World.icon(name) -> Pix        // 12x12 HUD icons: energy food mood cash fans level mus tech ori show lock check cross heart star note mic hat glasses shirt pants shoe sleep eat train busk battle shop home park bar studio gear sound mute back left right coin trophy clock sun moon dice shuffle camera palette wand
World.fx(name) -> Pix | Pix[]  // particle sprites: note, note2, star, heart, spark, ring (frames 3 sizes), coin, confetti(4 colours), puff, drop
```

## BBH.Audio (audio.js)

Web Audio only, everything synthesised, no files. One shared AudioContext created lazily on first user gesture.
Must be testable in node: `Audio.create(ctxFactory)` builds an instance with an injected (fake) context; `BBH.Audio` is
`Audio.create(() => new AudioContext())` made lazily on first call.
```
A.unlock()                     // resume/create the context (call from a user gesture), safe to call repeatedly
A.setMuted(b), A.setVolume({music, sfx}) // 0..1, persisted by the caller not by audio.js
A.now() -> seconds on the audio clock
A.sfx(name, opts?)  names: click, back, confirm, error, coin, buy, unlock, levelup, achievement, hit_perfect, hit_good, miss, combo, win, lose, equip, swoosh, sleep, eat, step, door, crowd_cheer, crowd_boo, applause, sparkle, whoosh, record, countdown, go
A.drum(lane, opts?)  lane 0..3 = B(kick) T(hat/tss) K(snare/k) Pf(pff/clap); opts:{vel 0..1, when (audio time), pitch}  // beatbox flavoured, punchy, short
A.music.play(id, opts?)  ids: title, creator, street, home, park, shop, bar, studio, battle, victory, defeat, intro; opts:{fade}
A.music.stop(fade?), A.music.current(), A.music.beat() -> float beat position (for visual pulse), A.music.bpm()
A.groove.start({bpm, style:0..3, bars}) -> { t0, spb }   // backing loop for the rhythm game: kick/bass/hat + chords, t0 audio time of beat 0
                                                         // (the game places notes at t0 + k*spb/2). A.groove.stop(), A.groove.setIntensity(0..1)
A.log -> array of what was scheduled (only when created with {log:true}, for tests)
```
Music styles: title = dark synthwave arpeggio with a heartbeat kick; creator = relaxed lo-fi; street = moody night-walk groove;
home = warm lo-fi; park = airy acoustic-ish pluck; shop = quirky jazzy; bar = smoky funk; studio = clean pads; battle = driving breakbeat;
victory/defeat = short stings; intro = slow melancholic piano-ish. Music must LOOP seamlessly (schedule ahead with a 25 ms timer + 180 ms lookahead).
Master bus: compressor/limiter so stacked sounds never clip. Respect mute. Never throw if the context is suspended or missing.
