# Clawspire 2.0: trailer generator

Everything that makes the two cuts of the Clawspire 2.0 trailer (25.0 s @ 60 fps,
h264 + AAC): the main vertical cut `clawspire/trailer_vertical.mp4` (1080x1920) +
`trailer_vertical_poster.jpg`, and the 16:9 cut `clawspire/trailer.mp4` (1920x1080) +
`trailer_poster.jpg`.
The picture is real gameplay: 60 fps captures of the game (1080x1920, the 540x960
stage at DPR 2), cut, time-remapped and composited by an HTML renderer in which
every frame is a pure function of time. The soundtrack is synthesized from
scratch with numpy + scipy. Picture and sound read one cue sheet, so an edit
re-renders deterministically and stays in sync.

The engine is the one from `tools/nrfh_trailer` (sub-frame motion blur, the
WebGL2 lens, closed-form particles, kinetic type), extended with a footage
layer, 3D phones and a neon set.

## Storyboard of the 16:9 cut (144 BPM: 60 beats = 15 bars = 25.0 s; a beat is 25 frames)

| beat | time | shot | what happens |
|---|---|---|---|
| 0 | 0.00 | open | black, INSERT COIN; a gold coin drops into a neon slot (b1, flash) |
| 1 | 0.42 | open | macro on the title claw diving for the star at 2.2x, slowing into the grab on b3 (hit-stop, sparks, ring), then a 2.6x yank up into the drop |
| 4 | 1.67 | title | DROP: the title phone flies in over the neon arcade (grid floor, city, bokeh, rays) as the logo sheen sweeps; two more phones (Claw-o-ween title, LAMP FEVER) from the sides on b5; b6 push; b6.5 to b7.5 zoom-through into the screen |
| 7.5 | 3.13 | title | full frame on the real logo; b8 the **2.0** numeral slams in (shockwave, god rays, gold flare); b10 **THE BIG UPDATE**; b11.5 glitch out |
| 12 | 5.00 | perfect | perfect_grab full frame riding the claw down at 1.5x, ramping into 0.18x on the PERFECT cue (b14): flash, gold ring, stars, **PERFECT** callout on the claw; b15.5 2.2x yank home |
| 16 | 6.67 | resolve | **SEE EVERY HIT** beside the tilted phone; the resolve row's five card hits are re-timed onto 8ths (b17 to b19) with a hit counter (x1..x5) and a **YOUR HITS** callout bracketing the row |
| 20 | 8.33 | cabinet | whip to **THE CABINET IS ALIVE**; three phones land the cabinet events on their beats: surge b21.5 (lightning), coins b22.25 (a coin burst), capsule b23 (ring + stars), each with a label chip; b23.5 zoom-through |
| 24 | 10.00 | fever | punch into the game's own LAMP FEVER! banner on b24: beat strobes, beacon rays, confetti, **JACKPOT LAMP** callout; b26 drop down to the pile, **PRIZES RAIN** |
| 28 | 11.67 | build | **BUILD ANYTHING** with the combo relic pick (+ **COMBO RELICS** callout), **CABINET TECH** b29.5, **THE COMPACTOR** b30.5, shop glitch flash b31.5; phones whip in from alternating sides |
| 32 | 13.33 | wall | eight phones, one per claw type, slam onto a concave arc on 8ths from the centre out; **8 CLAW TYPES** on b34; b35.6 push through |
| 36 | 15.00 | capsule | breakdown: the capsule taps up uncommon (b36.5), rare (b37), legendary (b37.5); the burst lands on b38 (flash, god rays, flare, gold stars), then 0.35x slow motion on the golden capsule; **LEGENDARY** callout on the game's title; b40 **CAPSULE FEVER** |
| 41 | 17.08 | minis | **COLLECT MINIS** beside the Prize Vault |
| 43.5 | 18.13 | bats | a swarm of bats wipes the frame into Claw-o-ween |
| 44 | 18.33 | halloween | orange dusk, moon, pumpkins; the Claw-o-ween title phone; dripping **CLAW- / O-WEEN** |
| 47 | 19.58 | hfight | the Halloween fight full frame, **COSTUMED FOES** |
| 49 | 20.42 | depths | glitch flash: **NEON DEPTHS** |
| 50 | 20.83 | nl | the Dutch flash: **NU OOK IN HET NEDERLANDS** over the tricolour; b51.6 whip |
| 52 | 21.67 | coop | host and guest phones face each other, an arc of light between them on every 8th: **ONLINE CO-OP**, then **PLAY TOGETHER**; b55 tape stop to black |
| 56 | 23.33 | logo | **CLAWSPIRE** slams over the moon and bats, the **2.0** badge, **PLAY FREE IN YOUR BROWSER**, `games-71g.pages.dev/clawspire`; dead still from 24.0 s |

## The vertical cut (main): `shots_v.js`, `?fmt=v`, `cues.json`, `audio.py`

Re-cut after the owner's review for absorbable pacing: fewer topics, each a hold
shot with one short headline that stays up at least 0.35 s per word + 0.6 s,
separated by fast punch shots. The captures are natively 1080x1920, so the game is
shown whole: full bleed with at most an ~8 percent push (HUD, resolve row, cabinet
and enemies always in frame) or inside a fully visible phone. Words stay in the
platform safe zone (not in the top 12 percent or bottom 20 percent, 6 percent side
margins; `VS` in `shots_v.js`). Shots carry `vert: true`; `main.js` keeps only the
list for the current format. The 16:9 cut keeps its own frozen clock and score
(`cues_169.json` + `audio_169.py`; its shots live in `shots_open/grab/build/end.js`).

| beat | time | pace | shot |
|---|---|---|---|
| 0 | 0.00 | fast | INSERT COIN, a coin drops in (b1), the title claw dives and grabs the star (b3) |
| 4 | 1.67 | hold | the title phone flies in, zoom-through (b5), **2.0** slams under the real logo (b6), **THE BIG UPDATE** to 4.17 s |
| 10 | 4.17 | hold (4.6 s) | the resolve row uncut: prizes land, GO! (b11), five cards hit on b12.5 / 14.25 / 16 / 17.75 / 19.5 with a x1..x5 counter; **SEE EVERY HIT** + "Every hit, one by one"; the music breathes (half time, filtered) b13.5 to b17.5, then builds |
| 21 | 8.75 | hold (3.3 s) | **THE CABINET IS ALIVE**: POWER SURGE lands (b21.5), COIN SHOWER (b24), then **LAMP FEVER** full screen (b26 to b29) |
| 29 | 12.08 | hold + fast | **BUILD YOUR WAY**: the combo relic pick (Weapon Rack taken on b31), then the 8 claw types land into a 4x2 grid on 8ths, **8 CLAW TYPES** |
| 35.5 | 14.79 | fast + hold | the capsule taps up (b36, 36.5, 37), LEGENDARY burst (b37.5) into slow motion, **CAPSULE FEVER** |
| 41.5 | 17.29 | fast | bats wipe into **CLAW-O-WEEN** (b42): moon, pumpkins, the Claw-o-ween title |
| 45.5 | 18.96 | fast | **NEON DEPTHS** punch: the Drowned Jukebox at high tide |
| 48.5 | 20.21 | hold | **PLAY TOGETHER** + ONLINE CO-OP: host and guest phones side by side; tape stop b52.25 |
| 53 | 22.08 | hold | CLAWSPIRE 2.0 over the moon and bats, PLAY FREE IN YOUR BROWSER (b53.75), `games-71g.pages.dev/clawspire` (b54, held 2.5 s), dead still from 24.0 s |

## Files

- `trailer.html`: the renderer page. `#play` (or no hash) loops it live; `#render`
  waits for `window.frameJpeg(t)`. Query: `?fmt=v` vertical cut, `?scale=0.25` previews,
  `?cacheMB=2200` footage cache budget.
- `engine.js` (clock, easing, fonts, assets, design space vs canvas scale), `post.js`
  (the WebGL2 lens from nrfh_trailer plus sharpen, straight RGB split and tint),
  `fx.js` (particles, candy type, slams, staggers, UI callouts, counters, lens flare,
  lightning, bats, moon, pumpkins), `footage.js` (capture loader, LRU frame cache,
  time remaps, full-frame crops), `stage.js` (the neon arcade set, the phone, the
  strip-sliced 3D projection), `main.js` (timeline + frame driver), `shots_*.js`
  (the storyboard).
- `cues.json`: the vertical cut's clock (beats), read by `audio.py`; `cues_169.json` + `audio_169.py`: the 16:9 cut's frozen clock and score.
- `synth.py` + `audio.py`: the soundtrack (F minor, 144 BPM): four-on-the-floor kit,
  side-chained supersaw pads and plucks, sub bass, the game's square lead, risers,
  impacts, and SFX on the game's moments; slow-motion and under-water filters, a
  glitch stutter and a tape stop; mastered to -14 LUFS integrated, -1.5 dBTP
  (BS.1770 meter and a true-peak lookahead limiter in `synth.py`).
- `render.mjs`: steps frames through headless Chromium (playwright-core), serving the
  repo, the captures (`/__footage/`) and the placeholder stills (`/__scratch/`).
- `fonts/`: Boldonse (display), Erica One (the logo), Outfit (UI), Big Shoulders
  (labels), all SIL OFL (licences alongside).

## Footage

Captures live outside the repo (default
`$SCRATCH/clawtrailer/footage/<scene_id>/f_00000.jpg` + `meta.json`
`{frames, fps, cues: {name: frame}}`; override with `CLAW_FOOTAGE=`). A scene is
used as soon as its `meta.json` exists; until then the shot falls back to
placeholder stills listed in `footage.js` (`PLACEHOLDERS`). Shots address a scene
by *source time* and anchor on the capture's own cue names (with fallbacks), so
a re-capture re-times itself: `cue(id, ['PERFECT', 'perfect'], fallback)`.

Time remaps are plain functions of shot time: `anchor` (a cue plays at a beat),
`rampTo` (integrated speed keys, so 1.5x -> 0.18x -> 2.2x lands the cue exactly on
its beat), and piecewise maps that put several cues on the grid (the resolve row's
hits, the capsule taps). Between captured frames the draw blends f_n and f_n+1.
Frames decode off-thread (`createImageBitmap`) into an LRU (2.2 GB by default); a
paint that touched a frame not yet decoded loads it and repaints, so a written
frame never has a hole.

Scene ids: title_neon, perfect_grab, resolve_row, cabinet_event_surge,
cabinet_event_coins, cabinet_event_capsule, lamp_fever, combo_pick, crawlers_tech,
compactor, shop_market, claw_<classic|tri|scoop|hand|magnet|hook|vacuum|twin>,
capsule_legend, vault_minis, halloween_title, halloween_fight, depths,
nl_row (the 16:9 cut's Dutch flash), coop_online_host, coop_online_guest. (Also captured, unused: capsule_tease, shop_market, nl_title.)

## Re-cut

    node tools/clawspire_trailer/render.mjs sheet 0 24.75 0.25 sheet   # contact sheet
    CLAW_SCALE=0.25 node tools/clawspire_trailer/render.mjs sheet 0 24.75 0.25 sheet   # fast
    node tools/clawspire_trailer/render.mjs spot 6.0 14.3              # single frames
    CLAW_FMT=v CLAW_SCALE=0.3 node tools/clawspire_trailer/render.mjs sheet 0 24 1 sheet_1fps   # the vertical cut

Low-res preview film (about 4 minutes):

    CLAW_SCALE=0.25 CLAW_FRAMES=prev node tools/clawspire_trailer/render.mjs frames 0 1500 2
    ffmpeg -framerate 30 -start_number 0 -i trailer_out/clawspire/prev/f_%04d.jpg ...

(the preview frames are numbered by master frame, so use the glob or a concat
list; see the commands in the hand-off notes).

## Final render

    node tools/clawspire_trailer/render.mjs frames 0 1500 1           # 1500 frames -> trailer_out/clawspire/frames/
    python3 tools/clawspire_trailer/audio_169.py trailer_out/clawspire/trailer.wav     # the 16:9 score
    python3 tools/clawspire_trailer/audio.py trailer_out/clawspire_v/trailer.wav      # the vertical score

`CLAW_RESUME=1` skips frames already written (a restart continues). One worker:
SwiftShader already uses every core.

Encode with the ffmpeg from `pip install imageio-ffmpeg`. Grain makes
constant-quality encodes large, so the print is two-pass at a fixed bitrate with a
light denoise (25 s at 7000k video + 192k audio is about 22.5 MB, under Cloudflare
Pages' 25 MB file limit):

    O=trailer_out/clawspire; F=$O/frames/f_%04d.jpg; A=$O/trailer.wav; DN="hqdn3d=1.2:1.2:3:3"
    ffmpeg -y -framerate 60 -i $F -vf $DN -c:v libx264 -preset slow -b:v 7000k -maxrate 10000k \
      -bufsize 14000k -pix_fmt yuv420p -profile:v high -level 4.2 -pass 1 -passlogfile $O/x264 -an -f null /dev/null
    ffmpeg -y -framerate 60 -i $F -i $A -vf $DN -c:v libx264 -preset slow -b:v 7000k -maxrate 10000k \
      -bufsize 14000k -pix_fmt yuv420p -profile:v high -level 4.2 -pass 2 -passlogfile $O/x264 \
      -movflags +faststart -c:a aac -b:a 192k -shortest -map_metadata -1 clawspire/trailer.mp4
    ffmpeg -y -ss 24.5 -i clawspire/trailer.mp4 -frames:v 1 -q:v 2 clawspire/trailer_poster.jpg

The vertical cut renders with `CLAW_FMT=v` into `trailer_out/clawspire_v/` and encodes
the same way (same flags and bitrate, output `clawspire/trailer_vertical.mp4`, poster from
24.5 s to `clawspire/trailer_vertical_poster.jpg`):

    CLAW_FMT=v node tools/clawspire_trailer/render.mjs frames 0 1500 1
    O=trailer_out/clawspire_v   # then the two ffmpeg passes above, ending in clawspire/trailer_vertical.mp4
