# Dungeon Pusher — attract reel generator

Everything that made `dungeon_pusher/intro.mp4` (20 s, 720×1260 @ 30 fps, h264 + AAC).
The reel is deterministic: every frame is a pure function of time, so re-rendering
after an edit reproduces everything else exactly.

## Pipeline

1. **Gameplay footage** — `clips.mjs` (and `reclip_room.mjs` for the crawl)
   capture MOVING gameplay: an init script replaces `requestAnimationFrame`
   with a queue, so the live game only advances when `__tick(ts)` is called —
   the loop reads dt off the timestamp, so stepping ts by 1000/30 runs the
   whole sim at exactly the video's 30fps while Playwright screenshots every
   step. Five clips × 66 frames land in `clips/<name>_NN.jpg`: the crawl
   (arrow-key walks, modals auto-closed), the pour (real `drop()` calls), the
   TILT, the wheel's feed → needle → spin arc (`wheelPress()` at the right
   frames), and the boss lair. `capture.mjs` / `capture2.mjs` are the older
   still-shot pass, kept for the poster hunts.
2. **Choreography** — `intro.html` is the renderer: a 720×1260 canvas exposing
   `renderFrame(t)`, all deterministic in `t`. It loads the clips, `marquee.png`
   (copy from `dungeon_pusher/art/cab/`), `font.js` (GRIMCUT — copy from
   `dungeon_pusher/`), and `mon/` (the monster-card attack frames + a floor tile,
   copied from `art/monsters/boss/{goblin,stormknight,inferno_brute}/attack/` and
   `art/floor_marmer.png`) from its own directory. Open with `#play` for a live
   loop. The scene draws to an offscreen canvas; a camera + post pipeline (a
   `KICKS` table drives zoom-blur, chromatic split, glitch bands, roll kicks,
   shakes, invert and colour flashes; letterbox rides the montage) composites it.
   Storyboard: camera falls WITH the coin onto a marble ledge (0–1.8) → coin
   storm + GOLD/GLORY/GRAVITY (→4.6) → monster triptych HORDES/CHAMPIONS/
   NIGHTMARES from the boss paintings (→6.4) → five whip-cut footage cuts
   (→12.7) → vortex collapses into a Wheel of Fortune that spins up and swallows
   the frame (→14.95) → white → giant coin flips into the marquee slam (15.05–
   15.3) → tagline → INSERT COIN and fade (→20).
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
