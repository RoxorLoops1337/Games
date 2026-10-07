# Minigames in low-poly 3D

Same engine, kit, palette and characters as the park and flat (read PLAN.md, RESEARCH.md, PALETTE_AND_BUDGETS.md, kit.js, palette.js, characters.js, lighting.js, fx_post.js, FLAT_PLAN.md).
Page: `beatbox_heroes/minigames3d.html?game=rhythm|run|tuner&t=day|dusk|night&q=low|med|high`. It loads the REAL game scripts (pix, font, catalog, audio, mic, samples, core) so the 3D games use
the true rules and sound: `window.BBH.Core` (makeChart, scoring, STAT logic), `BBH.Audio` (drums, groove engine), `BBH.Mic` (mic open, onsets, pitch). Read the 2D versions in
`beatbox_heroes/rhythm.js` and `beatbox_heroes/minigames.js` for the exact rules, timing windows, difficulty and results, and mirror them. Do not edit those 2D files.

## Contract (mg_index.js, main.js `initMini` already wired, do not edit them)
`createX(ctx, opts) -> { group, update(dt,t), render?(), resize?(w,h,dpr), setLook?(look), start?(o), dispose?() }`
* `ctx` = { THREE, kit, PAL, scene, camera, renderer, events, rng, quality, canvas, sceneName }. `opts` has `time`, `hud` (a DOM div over the canvas for buttons, score, results), `look`, plus game params (`difficulty`, `seed`, `battle`).
* The game owns its camera, lights (it may call `buildLighting(ctx, fakeTerrain)` from lighting.js for sky/shadows/post, or set its own lights and use fx_post.js `createPost`), characters (`createCharacter`/`createNPC`) and DOM HUD. `render()` is optional; without it main calls `renderer.render`.
* Finish with `ctx.events.emit('minigame', { game:'rhythm', result:{ score, grade, hits, ... same fields as the 2D result } })`; Back button emits `minigameQuit`.
* Touch first (portrait 9:16, big thumb targets), keyboard second (D F J K and arrows). Quality tiers as in the park. Budget: <= 80k tris, <= 60 draw calls, one shadow map.
* Test hooks on `window.__park.game`: `start(o)`, `state()`, `press(lane)`, `tick(seconds)` (headless GL is slow; make simulation time injectable), `result()`.
## Ownership
| role | files |
|---|---|
| Rhythm Artist (busking stage rhythm game) | `mg_rhythm.js`, `mg_rhythm_*.js` |
| Run Artist (park jog tracker) | `mg_run.js`, `mg_run_*.js` |
| Tuner Artist (pitch tuner / ear training) | `mg_tuner.js`, `mg_tuner_*.js` |
| Lead (Claude) | everything else (main.js, mg_index.js, pages, tests, tools) |
You may IMPORT other files from park3d/ but never edit them; ask the lead through your final report if a shared file needs a change. No git. No em dashes.
