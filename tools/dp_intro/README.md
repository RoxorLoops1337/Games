# Dungeon Pusher — attract reel generator

Everything that made `dungeon_pusher/intro.mp4` (20 s, 720×1260 @ 30 fps, h264 + AAC).
The reel is deterministic: every frame is a pure function of time, so re-rendering
after an edit reproduces everything else exactly.

## Pipeline

1. **Gameplay stills** — `capture.mjs` / `capture2.mjs` drive the real game
   (served locally, controlled through `window.DP`) with Playwright and screenshot
   the beats: the crawl, the pour, the TILT, the wheel's power meter, the boss.
   Shots land next to the scripts as `room.png`, `battle_pour.png`, `tilt.png`,
   `wheel_meter.png`, `boss.png`.
2. **Choreography** — `intro.html` is the renderer: a 720×1260 canvas exposing
   `renderFrame(t)`. It loads the stills, `marquee.png` (copy from
   `dungeon_pusher/art/cab/`) and `font.js` (GRIMCUT — copy from `dungeon_pusher/`)
   from its own directory, all deterministic in `t`. Open with `#play` for a live
   loop. Storyboard: one coin detonates (0–2.3) → coin storm + GOLD/GLORY/GRAVITY
   (2.3–5) → five-cut gameplay montage (5–13) → coin vortex (13–15.2) → marquee
   slam + tagline (15.2–17.4) → INSERT COIN hold and fade (→20).
3. **Frames** — `frames.mjs all` steps 600 frames through Playwright into
   `frames/f_%04d.jpg`.
4. **Soundtrack** — `audio.py` synthesizes the 20 s mix with numpy (+scipy for the
   filters): D-minor groove at 132 BPM, and every hit hard-synced to the timeline
   anchors listed at the top of the file. Those anchors MUST match `intro.html`.
5. **Encode** —

       ffmpeg -framerate 30 -i frames/f_%04d.jpg -i audio.wav \
         -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow \
         -movflags +faststart -c:a aac -b:a 160k -shortest intro.mp4
       ffmpeg -ss 17.0 -i intro.mp4 -frames:v 1 -q:v 2 intro_poster.jpg
       ffmpeg -framerate 30 -i frames/f_%04d.jpg -i audio.wav \
         -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -cpu-used 4 -pix_fmt yuv420p \
         -c:a libopus -b:a 128k -shortest intro.webm

   (the ffmpeg inside `imageio-ffmpeg` works fine. The webm print exists for
   chromium builds that ship without the licensed h264 decoders.)

Serve this directory over plain HTTP for steps 2–3 (canvas taint: same origin
keeps `toDataURL` legal).

The game side is `playIntro()` in `dungeon_pusher/index.html`: a HEAD probe for
`intro.mp4` gates the 🎞️ INTRO title chip, so a missing file means a missing
button, never a broken screen.
