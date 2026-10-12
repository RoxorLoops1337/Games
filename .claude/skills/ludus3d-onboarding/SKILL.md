---
name: ludus3d-onboarding
description: Ludus Maximus 3D only. The cinematic title scene (js/title.js), the first-run spotlight tutorial (js/tutorial.js) and the ceremonies (js/ceremonies.js: level up, trophy, season finale, eulogy). Hook points in game.js and flow.js, state fields, selectors the tutorial depends on, test recipes and pitfalls.
---

# Ludus3D onboarding: title, tutorial, ceremonies

Files: `js/title.js`, `js/tutorial.js`, `js/ceremonies.js`; CSS appended to `css/ui.css` under `.lx-ttl*` (title), `.lx-tut*` (tutorial), `.lx-cer-*` (ceremonies). Every hook in game.js and flow.js is tagged `ONBOARDING`, grep for it. No em dashes, no new localStorage keys.

## Title scene
- `Game.boot()` shows the hub (`hub.enter(S || titleState())`), sets `scene='title'`, then `await title.show({hasSave})` which resolves `'continue' | 'new'`. Settings is handled inside the title (own sheet, same prefs key as More). `await title.hide()` fades to black and returns a `lift()` function that fades back in once the hub scene is swapped in.
- `titleState()`: the player's own save when present, else a showcase school (3 rows, 12 buildings, 5 gladiators) so the title never shows an empty yard.
- Camera: no hub hook exists for a dolly, so `title.drive(dt,t)` writes `hub.orbit` (az, pitch, dist, target) every frame while `game.scene==='title'` (game.frame calls it before `hub.update`). It sets `orb.anim=null`, zeroes velocities and `idleT`, so drag input is harmless. FOV is lowered to 32 for a longer lens and restored in `hide()` (hub.overview uses camera.fov). Golden hour: `hub.setHour(17.7)`, released with `setHour(null)`.
- Music: `audio.music.setMode('ludus', {fade:2.5})` plus `setIntensity(.55)`; safe before unlock.
- Logo: carved-gold text is `background-clip:text` gradient plus stacked `drop-shadow` filters (bevel, purple under-shadow). Sizes use `vw` clamps so MAXIMUS fits 390px.

## Tutorial (js/tutorial.js)
- `createTutorial(game)` is created in `Game.init()`; `maybeStart()` runs from `setScene('hub')`. State is `S.flags.tut = {v:1, welcome, rosterOpened, trained, arenaOpened, advanced, fightSeen, resSeen, done2, done, skipped}`. A save that already has fights, week > 1, legends or `flags.tutor` gets `{done:1, auto:1}` so veterans never see it.
- The step is DERIVED each frame: the first entry in `STEPS` whose `met(t)` is false. Playing out of order (opening Arena first) just skips ahead. Each step has `target()` (DOM element or null), `when()` gate, `hubOnly` (hidden while any modal is open or a week runs), `passive` (shown over fights and results without a target), `manual` (button label) and `pos`.
- Steps: welcome, hire, roster, train, arena, enter, advance, fight, results, week.
- The overlay lives on `document.body` (z 80). It must not live in `#ui`: `#ui` is a fixed stacking context that sits under body-level modals (z 50). The spotlight is the ring's `box-shadow: 0 0 0 9999px` so clicks pass through to the real element. Steps without a target use a blocking `.lx-tut-dim`.
- DOM contracts with other screens (if these change, update `STEPS`): nav items are `game.nav.children[i]` (0 ludus, 1 roster, 2 arena); recruit sheet title matches `/fighter|volunteers/i` and its button is `.rc-hire`; Roster sheet title is `Roster` (target: button text `Auto-plan`, else `.lm-act-w`); Arena sheet title is `The Arena` (target: `.lx-btn-gold` with text `Enter`); fight HUD target is `.lx-btn-gold.lx-pulse` (Crowd's Favor) or `.lx-ult`; results are modal titles `Victory`, `Defeat`, `Duel won`.
- API: `game.tutorial.skip()`, `.restart()`, `.state()`, `.active`. `?notut=1` disables it (the bot passes this).
- Auto-advance: passive steps dismiss themselves after 16 s.

## Ceremonies (js/ceremonies.js)
- `levelUp(ctx, g, level)` queued, non-blocking, tap to skip, deduped per gladiator and level (WeakMap), so flow.js can call it from `results` and `pickPends` without doubling.
- `trophy(ctx, list)` Promise (modal with a cup SVG, rays, confetti); returns null on failure and flow.js falls back to the plain dialog.
- `seasonFinale(ctx, fin)` Promise, called at the top of `weekSummary` when `fin.recap` exists; count-up tiles, MVP portrait, rivals, victory music, then music returns to `ludus`.
- `eulogy(ctx, {kind:'retire'|'fallen', legend, body, actions, dismiss})`. Retirement is hooked inside `Game.ask`: a dialog titled `Hall of Legends` is wrapped (the eulogy re-asks with `_cer:true` to avoid recursion), so profile.js did not need editing. `kind:'fallen'` is ready but nothing in the sim kills fighters yet (the Pit's "Fallen" report in screens/modes.js could call it).
- Modals are restyled by tagging the scrim the kit just created (`tag('lx-cer-fin')`): ask() appends it synchronously, so the last `.lx-scrim` is ours. This keeps the bot working (its selector is `.lx-scrim .lx-actions .lx-btn`).
- Confetti is CSS only (`confetti({n, mode:'burst'|'rain'})`), skipped under reduced motion. Audio used: levelUp, crowdCheer, crowdRoar, horn, coin, crowdChant, deathThud, crowdGasp; music modes victory then ludus.

## Verify
- Title: `node tools/ludus3d_shot.mjs "http://localhost:8211/ludus_maximus_3d/index.html?tier=low&manual=1" /tmp/t --w 390 --h 800 --at 3,26` (also 1100x650). `manual=1` stops the rAF loop, so time only moves through `advance()`.
- Tutorial: boot through the title with `localStorage.clear()`, click Begin and Open the gates, then screenshot after each click (needs a few real waits of 400 to 1500 ms after nav clicks because screens are lazy imports). Assert `__LM3D.game.tutorial.state().step`.
- Bot: `node tools/ludus3d_bot.mjs "<url>?new=1&rich=1&tier=low&manual=1&notut=1" --weeks 2`; run once without `notut` to prove the tutorial never blocks the flow.

## Pitfalls found
- `main.js` runs `game.init()` and `boot()` also called it: the hub, FightView and HUD were built twice. `boot()` now guards with `if (!this.hub)`.
- `U.nav` calls `onSelect(item, index)`; game.js used `(i) => onNav(i)`, so the bottom nav never opened anything. Fixed to `(it, i)`.
- Ring and card positions are read from `getBoundingClientRect` every frame (sheets slide in over 300 ms); never cache them.
- A step whose target is not found hides the overlay instead of showing a floating card (except `hire` and `passive` steps).
