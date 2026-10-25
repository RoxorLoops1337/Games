# Drop the Bass: the Crayon Notebook Doodle style (the new default look)

The whole game looks like a kid's crayon and felt-tip drawing on a lined school notebook. Reference: drop_the_bass/proposals/img/style_16_crayon-doodle.jpg
(open it and study it) and its source drop_the_bass/proposals/style_16_crayon-doodle.html. Improve on it: this is the real game, so it must be readable,
consistent and fast. The old polished look stays as the "Classic" style (art_*.js, hud.js): never edit those files.

## How the two styles are wired
style.js holds the active style. The facades art_entities.js, art_world.js and hudx.js dispatch every call to doodle_*.js (doodle) or art_*.js / hud.js (classic).
Each doodle_*.js starts as a re-export of the classic implementation; its owner replaces it with a real doodle implementation (same exported names and
signatures, same option semantics, same anchors as the classic one; read the classic module and CLAUDE.md for the contract). Settings has a Doodle / Classic toggle.

## The kit (doodle_kit.js, already written, do not edit; ask the lead if you need a change)
Pen (seeded wobbly crayon: ln, hatch scribble fill, shp filled outlined shape, dot, eye, blob, spiky, txt hand-made stroke font), geometry helpers (arc, rect, rev,
rs, star, heart), palette C, `sprite(key, w, h, draw, {frames, seed})` which bakes a doodle into 3 "boil" frames (different seeds) and `blit(ctx, sprite, x, y, t, {scale, alpha, phase})`
which replays them at 7 fps so lines boil like hand animation, `paper()` (cached lined notebook paper), makeCanvas, setScale.
RULES: bake everything static into sprites keyed by what changes (type, level, state); never run Pen strokes live for dozens of objects per frame. Per-frame
work is blit plus a few transforms (rotate the head, bob, squash). Budget on a mid phone: 40 turrets + 60 enemies + board + HUD at 60 fps. Use setArtScale(n)
(call kit setScale) for sprite resolution. No Math.random, no Date, safe in node with a mock ctx and without `document`.

## Look
- Paper world: cream notebook paper with blue ruled lines and a red margin, doodled things sitting ON the page. Tape strips, staples, stickers, coffee rings,
  eraser smudges, doodled margins (stars, hearts, spirals), pencil grid. Each stage is a different page or desk surface (garage notebook with oil smudge, street
  with chalk, club with glitter-pen night page, festival with sunset marker wash, arena on a huge poster board).
- Linework: dark ink (#2b2733) wobbly crayon outlines, 3 to 5 px, doubled strokes; fills are scribble hatching in saturated crayon colours with a lighter second
  hatch; no gradients, no glow, no blur. Highlights are white crayon scribbles. Shadows are grey hatching.
- The Static: scribbled grey fuzzballs with huge wobbly googly eyes and spiky outlines, cyan and magenta felt-tip offset lines for the glitch. Bosses are giant
  doodles with crowns and angry brows; keep their tricks readable (gated = padlock doodle, phases = more scribbles).
- Turrets: each is a kid's drawing of the instrument (drum with stick, hi-hat on a stand, speaker with sound-wave arcs, mic with a ruffle, keyboard, horn,
  record, cowbell) on a little scribbled pad; level shows as stars and extra doodled bits (level 7: a crown and rays). Heroes: see CLAUDE.md Art style, drawn like
  a child's portrait of the duo: big heads, wobbly limbs, mohawk and ponytail unmistakable.
- Colours: Jasmin pink #ff5fb0, RoxorLoops lime #9dff3a, crayon set from doodle_kit C. Text: the stroke font (kit txt) for big words, system rounded bold for small UI numbers where legibility needs it.
- Motion: boil (kit), plus squash and stretch, bobbing, wobble; effects are doodled (scribble stars, speed lines, paper confetti, ink splats), never glow.
- Never gory, never an em dash anywhere.

## Process
Read the classic module you replace. Build, then verify visually with Playwright Chromium (require('playwright'), never install; serve the repo root with a tiny node
http server; screenshots to the scratchpad; Read the PNG): your own lab page drop_the_bass/lab/doodle_<area>.html plus the real game at /drop_the_bass/ using
window.__dtb (app.profile.settings.style defaults to 'doodle'; set a profile, start a run, e.g. __dtb.app.startRun({mode:'story',world:'club',encore:0,seed:3}) after setting
profile.tutorial.done = true). Check phone portrait 390x844 and desktop 1280x720. Add a headless test tests/drop_the_bass_doodle_<area>.test.mjs (mock ctx Proxy, every
id and option, ctx save/restore balance, no throw, determinism). Do not touch files you do not own. No git commands (the lead commits). Run `npm run test:dropbass`
before you finish (other agents are editing other files, so a failure in someone else's area is not yours).
