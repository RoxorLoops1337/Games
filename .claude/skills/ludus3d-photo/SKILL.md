---
name: ludus3d-photo
description: Ludus Maximus 3D only. Photo mode (js/photo.js): hub HUD camera button and fight outro button, free camera, lens, time of day, edge focus, filters, and the Roman share card PNG (toBlob / navigator.share). Hooks in game.js, capture rules, prefs, test recipe, pitfalls.
---

# Photo mode (js/photo.js)

`createPhoto(game)` is built at the end of `Game.buildHud` (tagged `PHOTO` in game.js, 3 tiny edits: import, buildHud line, `photo.frame(dt,t)` at the end of `frame`). It adds a round camera button (`.lx-photo-fab`) to the hub HUD bottom-left corner and a second one (`.lx-photo-fab-fight`) inside `fightView.hud`, visible only while `fightView.phase === 'outro'`.

## What it does
- `open('hub'|'fight')`: closes modals, hides `game.hud` and `fightView.hud`, disables `hub.orbit.enabled` (hub stops moving the camera) and closes the hub label card. Camera state is read from the live camera; input is a capture-phase listener on the GL canvas that `stopImmediatePropagation`s so the hub/fight handlers never see it.
- Controls: one finger / left drag = look, two-finger pinch = dolly, two-finger drag or right/shift drag = pan, wheel = dolly, WASD + Q/E fly, Esc closes. Camera is clamped (hub +-150 m, above terrain; arena +-42 m). Sliders: Lens (FOV 20..90), Time (hub only, `hub.setHour`, 5..22 incl. night; restored with `setHour(null)` on close if touched), Focus (CSS vignette + `backdrop-filter` edge blur live; same effect in the export). Filters: Natural, Golden, Noir, Vivid (CSS filter live on the canvas; `ctx.filter` in the export with a per-pixel fallback for Safari). "Controls" hides the panel.
- Fight outro: `frame()` clamps `fightView.outroT` to 1.0 while photo mode is open so the results hand-off waits for the player. Closing lets the outro finish.
- `shoot()`: `capture()` calls `post.render()` and `drawImage(glCanvas)` in the SAME task (the renderer has no preserveDrawingBuffer, a later read returns black), `develop()` applies filter, edge blur, vignette (long side capped 2048), `compose()` draws the card (gradient plate, gold double frame, meander band, "LUDUS MAXIMUS", caption by time of day or "In the arena", photo, parchment footer with ludus name, season and week, fame in a laurel wreath, "LUDUS MAXIMUS 3D"). Small captures are scaled up so the card is about 1000 px wide. The result dialog offers Share card (navigator.share with a PNG File when `canShare`, else a download), Save photo (plain developed frame), Retake. Data comes from `game.S` (`name`, `season`, `week`, `fame`).

## Prefs
Reduced motion (OS, `lx-reduce-motion` body class or the `rm` pref): no shutter flash, no panel transition. Gore: photo mode never touches gore; what the fight scene renders under the Gore pref (Off/Low/Full, reduced motion = off) is what the photo contains.

## Test recipe
`?new=1&rich=1&notut=1&tier=low&empty=1&manual=1`, add plots/glads to `game.S`, `game.refresh()`, `__LM3D.advance(2)`, click `.lx-photo-fab`, drag the canvas, `.lx-photo-shutter`, then `.lx-photo-gold` (download). `game.photo.state.lastCard` is the card canvas, `state.shootMs` the cost (about 2 s on software GL, mostly the post pass and JPEG preview). Verified at 390x800 touch and 1100x650.

## Pitfalls
1. `#ui > *` has pointer-events auto, hence the explicit `#ui > .lx-photo { pointer-events:none }` rules; keep them if you restyle.
2. The card uses system serif fonts only (no network fonts); `ctx.letterSpacing` is avoided on purpose (Safari), text is spaced by hand.
3. Capture resolution = drawing buffer (tier dpr cap x dynamic scale). Low tier phones give about 390x800 and the card upscales it; a high-res capture would need a temporary `post.setSize` bump.
4. The fight camera is overwritten after `fightView.frame`, so anything that reads the camera in the same frame sees the photo camera.
