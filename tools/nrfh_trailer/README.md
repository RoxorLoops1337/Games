# No Room For Heroes: trailer generator

Everything that made `no_room_for_heroes/trailer.mp4` (15 s, 1920x1080 @ 60 fps,
h264 + AAC), its `trailer.webm` print (vp9 + opus) and `trailer_poster.jpg`.
Every frame is a pure function of time and every sound is placed from the same
cue sheet, so an edit re-renders deterministically and stays in sync.

## Storyboard (128 BPM: 32 beats = 8 bars = 15.0 s)

| time | shot | what happens |
|---|---|---|
| 0.00 | open | lightning on the painted party (intro_scene07), push in, **THE HEROES** |
| 0.94 | hall | match cut to the real sprites marching in the rain, **ARE COMING** |
| 1.88 | hall | whip-pan over the empty slots to Azzaroth; **YOU ARE / THE FINAL BOSS** slams, letterbox snaps open |
| 3.75 | hall | pull back to the whole corridor, **BUILD YOUR DUNGEON**, four cards fly in and rooms slam on the beats |
| 5.63 | frost / spike / flame / tesla | **CHAIN TRAP COMBOS** x1..x4: FROZEN, SHATTER (hit-stop), IGNITE, OVERLOAD |
| 8.44 | monsters | **RAISE MONSTERS**: ogre, drakeling and slime panels, each ends in gold and a skull |
| 10.78 | champion | the game's **CHAMPION APPROACHES** banner, the Super Knight smashes a room on the downbeat |
| 11.72 | overdrive | the boss charges and fires OVERDRIVE, a nova wipes the raid, **BURY THE HEROES.** |
| 12.66 | stopdown | slow motion on the fallen champion, then four frames of black |
| 13.13 | logo | white flash, logo slam, god rays, **PLAY FREE IN YOUR BROWSER**, still hold from 14.06 |

All the art is the game's own: sprites are sliced with the game's SPRITES /
MON_SPRITES tables, rooms and traps use `rooms/layout.json` and the game's
strike timing, bosses use the measured attack-to-idle alignment, and the boss
close-up uses the unused hi-res `sprites/demon/` Azzaroth frames.

## Files

- `trailer.html`: the renderer page. `#play` (or no hash) loops it live in a browser;
  `#render` waits for `window.frameJpeg(t)` calls.
- `engine.js` (timing, easing, assets, fonts), `post.js` (the WebGL2 lens: sub-frame
  motion blur, bloom pyramid, god rays, zoom blur, chromatic split, shockwaves, heat
  haze, grade, grain, letterbox), `fx.js` (closed-form particles, kinetic type, caption
  tiers), `dungeon.js` (rooms and traps, ported from the game's draw code), `actors.js`
  (heroes, monsters, champion, bosses), `scene.js` (camera, corridor), `main.js`
  (timeline and frame driver), `shots_*.js` (the storyboard).
- `cues.json`: the shared clock. Picture and sound both read it.
- `synth.py` + `audio.py`: the soundtrack, synthesized with numpy + scipy
  (`pip install numpy scipy`).
- `render.mjs`: steps frames through headless Chromium (playwright-core). It serves the
  repo itself, so no separate server is needed.
- `fonts/`: Press Start 2P and Cinzel (SIL OFL), plus alternates.

## Re-cut

    node tools/nrfh_trailer/render.mjs sheet 0 15 0.25        # contact sheet to check the edit
    node tools/nrfh_trailer/render.mjs spot 2.9 7.6            # single frames
    node tools/nrfh_trailer/render.mjs all                     # 900 frames -> trailer_out/frames/
    python3 tools/nrfh_trailer/audio.py trailer_out/trailer.wav

Output goes to `trailer_out/` (git-ignored; override with `NRFH_OUT=`). Encode with the
ffmpeg that ships in `pip install imageio-ffmpeg`:

    ffmpeg -framerate 60 -i trailer_out/frames/f_%04d.jpg -i trailer_out/trailer.wav \
      -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
      -c:a aac -b:a 192k -shortest no_room_for_heroes/trailer.mp4
    ffmpeg -framerate 60 -i trailer_out/frames/f_%04d.jpg -i trailer_out/trailer.wav \
      -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 -cpu-used 2 -pix_fmt yuv420p \
      -c:a libopus -b:a 160k -shortest no_room_for_heroes/trailer.webm
    ffmpeg -ss 14.5 -i no_room_for_heroes/trailer.mp4 -frames:v 1 -q:v 2 no_room_for_heroes/trailer_poster.jpg

Headless Chromium renders WebGL through SwiftShader, so a frame costs about 1.5 s and the
reel takes roughly 25 minutes. Keep one worker: SwiftShader already uses every core.

The game side is `playTrailer()` in `no_room_for_heroes/index.html`: a HEAD probe for
`trailer.mp4` reveals the 🎬 Trailer chip on the title screen, so a missing film means a
missing button, never a broken screen.
