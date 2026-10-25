# Drop the Bass: art direction for the AAA pass

Goal: a game-of-the-year level look from pure canvas code (no image files). Cohesive, stylised, premium, readable on a phone, 60 fps.

## Look
- Stylised 3D-feel illustration: every shape has a lit side and a shaded side (key light from the top left, soft cool rim light from the bottom right),
  ambient occlusion under and between shapes, specular glints on metal and plastic, subsurface warmth on skin and fur, thin dark outline (2 to 3 px) kept but
  varied in weight (thicker on the shadow side) so it reads as ink, not a stroke.
- Materials: brushed metal, painted wood, rubber, speaker cone fabric, glossy plastic, glowing neon tube, felt, vinyl. Give each a consistent recipe
  (base gradient, highlight shape, grain or pattern, edge wear) and reuse it across objects.
- Light and glow: use additive blending (globalCompositeOperation 'lighter' or 'screen') for glows, bloom halos, light shafts, sparks. Colour-graded palettes per
  stage (warm garage, blue street, magenta club, orange sunset festival, violet arena). Subtle vignette, subtle film grain ONLY if cheap, chromatic fringe on
  the Static glitches.
- Depth: soft contact shadows, parallax layers in backdrops, atmospheric haze, depth-of-field blur on far layers (pre-blurred cached layers).
- Motion: squash and stretch, anticipation and follow-through, secondary motion (hair, cables, fur), idle breathing. Everything moves a little, driven by `t`.
- Palette stays inside data_core.js COL plus tints and shades derived from it. Jasmin pink, RoxorLoops green, the Static grey with cyan and magenta glitch.
- Characters stay recognisable (see CLAUDE.md "Art style"), cute but premium: big expressive eyes, clean silhouettes, strong poses.
- Never gory. No em dashes anywhere (code, comments, text).

## Technical rules
- Keep the exported function names and signatures (see CLAUDE.md contract). The facades art_entities.js and art_world.js re-export from the art_* modules.
- Same drawing rules as before: ctx state restored, time `t` passed in, no Math.random or Date in draw code (derive jitter from t and ids), safe in node with a mock ctx
  and without `document` (makeCanvas returns null there).
- Performance budget on a mid phone at 60 fps with ~40 turrets and ~60 enemies on screen: cache static art in offscreen canvases keyed by what changes
  (use setArtScale(n) for resolution), no gradients created per frame for per-frame objects (pre-render a glow sprite and drawImage it), cap per-frame path ops.
- Verify visually: Playwright Chromium (`require('playwright')`, never `playwright install`), serve the repo root with a tiny node http server, screenshot into the
  scratchpad, LOOK at the PNG (Read it), iterate. Compare before and after. Check phone portrait 390x844 and desktop 1280x720.
- Do not touch files you do not own. Do not run git commands that change state (the lead commits). Run `npm run test:dropbass` (or the single relevant tests) before you finish.
