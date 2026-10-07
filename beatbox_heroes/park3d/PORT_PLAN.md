# PORT_PLAN: Beatbox Heroes to Park3D (whole game in low-poly 3D)

Status: plan for the specialist team. Read PLAN.md, FLAT_PLAN.md, MINI_PLAN.md, PALETTE_AND_BUDGETS.md first. No em dashes anywhere. One owner per file (section 5).
Facts this plan is built on (verified in the repo): the real game is classic scripts (index.html) with a 360x640 2D canvas `#cv`, a DOM layer `#ui` authored in 270x480 units and
scaled by `#stage`, scenes in `E.scenes` driven by `E.go(name,args)`, rules in `Core.apply`. The 3D side is one esbuild IIFE (`park3d.bundle.js`, 1.3 MB, 396 KB gz) that today builds
ONE world per `Park3D.init` (park, flat, rhythm, run, tuner), with its own renderer, lighting, post, DOM overlay (`ui3d.js`). `characters.js` already accepts the game's look object.

## 0. Decisions in one screen
1. One persistent WebGL canvas `#gl` (host) UNDER the DOM. One renderer, one RAF (the E loop calls `host.tick`), one shadow map and one post chain reused by every world.
2. 3D scenes are SIBLINGS of the 2D scenes: `E.scenes3d[name]` beside `E.scenes[name]`. `E.go` picks the 3D sibling when 3D is on and one exists, else the 2D scene. So every milestone is playable (mixed mode) and the 2D game stays as the live fallback.
3. 3D place/minigame adapters REUSE the 2D logic by prototype delegation (`Object.create(E.scenes.place)`): sheets, menus, ACTIONS, shop, results keep running unchanged. Core, saves, audio, mic are not touched.
4. Worlds are lazy ESM chunks (esbuild splitting): core chunk ~400 KB gz, each world <= 80 KB gz. If WebGL or the chunk fails, the game continues in 2D and remembers it.
5. Two DOM layers: `#hud3` (real CSS px, 44 px targets, ui3d look) for chrome; legacy `#ui` (270x480 units) re-skinned by CSS under `body.r3` for sheets, dialogs, creator, shop, dev.
6. Game clock drives light: `Core.nightness(ch.minutes)` -> `lighting.setTimeOfDay(n)`; rain on `ch.day % 5 === 0` (same rule as street.draw today).
7. Default stays 2D until M4. 3D is opt-in (`?r=3d`, Settings GRAPHICS) in M1 to M3, `auto` from M4.

## 1. Inventory: every scene, screen and overlay, and what it becomes
Legend: ADAPT = new `E.scenes3d` sibling reusing the 2D logic; NEW = new 3D world; DOM = stays DOM, restyled; KEEP = unchanged.
| 2D today (file) | 3D target | Notes |
|---|---|---|
| `boot` (screens.js) pre-paints 5 world_a/b scenes | DOM splash `#boot3` + bundle download bar; no Pix painting in 3D mode | Warm-up `renderer.compile` hidden behind the splash |
| `title` (screens.js): key art, logo drop, cast dancing, rain, TAP TO START, CONTINUE/NEW/SETTINGS/SOUND | NEW world `title`: neon alley stage, Tay beatbox, Foxy dance, BeeAmGee idle, rain, neon logo sign, slow dolly, light pulse on `E.beat()` | Buttons stay DOM (restyled). Hero = newest save look, else `Chars.random` equivalent |
| `slots` (screens.js): 3 cards, delete modal | ADAPT: same title world, camera pushed in, cards DOM with 3D busts (M5) | Logic reused as is |
| `creator` (creator.js) new + wardrobe modes, 10 tabs, pose tap, sparkles, dice | NEW world `creator`: turntable, ring lights, per-tab camera (face/torso/feet), drag to spin, pinch zoom | Tabs/tiles stay DOM. Thumbs 2D at M1, 3D thumbs M5 |
| `intro` (screens.js): 6 painted plates + 7 text lines, VHS, SKIP, logo card | ADAPT + NEW `intro` cutscene shots (office doorway set, then reuse street, flat, park, hood) | Text box DOM. Cut candidate (section 8) |
| `street` (places.js): 1080 px side scroller, 5 doors, tutorial dialog, goal arrow, nav buttons, MAP, weather, steam | NEW world `street` (Neon Row), 5 door spots + map spot, goal beacon, nav dock, lock icons on closed doors | Entering = `G.enterPlace(id)` unchanged |
| `place` id=home (flat) | existing `flat` world wired | spots booth, couch, bed, desk, kitchen, wardrobe, door. Foxy schedule from `Core.hourOf` |
| `place` id=park | existing `park` world wired | spots busk, bench, run, flyers, gate. BeeAmGee on bench |
| `place` id=shop + `G.openShop` try-on | NEW world `shop` + mirror try-on stage | `S.shop.look` mirrored to the 3D player live |
| `place` id=studio (Sound Lab) | NEW world `lab` | spots mic, mixer, door. Jukebox lives in mixer sheet |
| `place` id=bar: stage sheet, juice counter, 3 regulars, mingle | NEW world `bar` with stage, crowd, Rohzel, 3 regular seats | programme chalkboard from `Core.barProgramme` |
| `map` (places.js hoodmap) | NEW world `hood`: tabletop miniature of Neon Row + park, tilt-shift, pins | Card sheet logic reused |
| `rhythm` perform (busk, open mic, showcase, karaoke), practice/train | existing `mg_rhythm` + `venue` option | busk=park stage, bar, showcase, booth |
| `rhythm` battle: VS splash, style picker, 3 rounds, opponent turn, 5 judge reveal, verdict | `mg_rhythm` battle + NEW `arena` venue (ring, 5 judges, VS wall) | Votes must come from `Core.apply` (section 2.11) |
| `run` | existing `mg_run` | Back to place on quit |
| `tuner` | existing `mg_tuner` | Must share `BBH.Audio` context and `E.settings` |
| `seq` Beat Maker, `studio` Recorder | ADAPT: DOM tools over the `lab` world, camera on the desk, hero taps pads | 2D logic reused, only bg changes |
| Overlays: morning card, help, menu, stats, achievements, settings, dev menu, cast gallery, songs, crew, coaching, result card, battle picker/verdict, dialog, modal, banner, toast | DOM, re-skinned (section 4). Dialog gets 3D camera focus on the speaker | Dev menu: theme only, no redesign |
| HUD (`E.makeHud`), goal strip, nav dock, MAP/MENU/LEAVE buttons | `hud3d.js` real-px replacement, same `.update(ch)` contract | |
| Effects: `E.rain`, `E.vhs`, scanlines, vignette, `E.burst`, shake, flash, fade | 3D weather, bloom/vignette in post, DOM fade/flash overlay, screen-space burst via 2D overlay canvas `#fx` | scanlines and VHS only in intro flashback |
| Audio: `E.music(id)` per scene, drums, groove | KEEP. Adapters call the same ids. `E.beat()` feeds light pulse | |

## 2. Integration architecture
### 2.1 DOM and canvas layers (z order, bottom to top)
`#gl` (WebGL, host) < `#cv` (2D, only in 2D scenes) < `#fx` (transparent 2D overlay, bursts/confetti, 3D mode only) < `#hud3` (real px) < `#stage > #ui` (legacy units) < `#fade`/`#flash` (DOM) < `#fatal`.
* `#gl` box: width `min(vw, vh*9/16)`, height `vh`, centred (tall phones get full height, desktop gets a phone column). Camera framing already uses horizontal width (controls `hWidth`), so any aspect works.
* `#gl` is NOT inside the scaled `#stage` (controls.js projects with `getBoundingClientRect`/`clientWidth`; transform scaling would desync them). `renderer.setSize(w,h,false)`, CSS size in real px.
* `#stage` keeps its integer-ish scale logic from `engine.js resize()`; in 3D mode it gets `background:transparent;pointer-events:none`, children keep `pointer-events:auto` (existing rule `#ui > *`). Taps on empty UI area fall through to `#gl`.
* `body.r3` class is toggled per scene by `R3.show(is3d)`; all 3D re-skin CSS is scoped to it so 2D scenes look exactly as today.
* While any veil/modal/dialog is open `E.uiBlock` counter > 0 and `controls.setEnabled(false)`; sheets (non-veil) leave world taps live but a tap on another spot closes the sheet (same as 2D `walkTo -> closeSheet`).
### 2.2 Host and worlds (`park3d/host.js`, `park3d/worlds.js`, owner PLAT)
```
createHost(canvas, { embedded:true, quality, onLost }) -> host
host.load(worldId, args) -> Promise<world>     // unload previous, build, warm (renderer.compile), resolve
host.unload()  host.tick(dt)  host.pause(b)  host.resize(w,h)  host.setQuality('low'|'med'|'high')  host.stats()  host.world
WORLDS = { title, creator, street, park, flat, shop, lab, bar, hood, office, arena?, rhythm, run, tuner }   // each: () => import('./world_x.js')
world = { id, ctx, scene, camera, terrain, lighting, spots, controls, player, npcs[], events,
          setTime(n), setWeather('clear'|'rain'), setClock({hour,day}), setLook(look), setBeat(b), focus(target,opts), release(),
          walkToSpot(id,{run}), done(spotId), setSpotState(id,{locked,reason,goal,badge}), dispose() }
```
* Existing `main.js init` is split: build steps move to `host.load`; `Park3D.init(canvas,opts)` stays as a thin shim over the host (not embedded) so `park3d.html`, `flat3d.html`, `minigames3d.html`, `shot3d.mjs` and the 2 existing 3D suites keep passing unchanged.
* A world module default-exports `create(ctx, args) -> { terrain (existing contract), flora?, npcSpecs, profile:'out'|'in'|'club'|'studio'|'stage', camera?, update?, dispose }`. `terrain` keeps the current contract (`group, bounds, blocked, heightAt, anchors, spotDefs, camera, lights, windows, interior`). `spots.js` generalises to `terrain.spotDefs` for outdoor worlds too (park DEFS become the fallback list).
* P1 DELIVERED (PLAT): `host.js`, `worlds.js` (registry + `world_park.js`, `world_flat.js`, `world_mini.js`, `world_stub.js` for title, creator, street, shop, lab, bar, hood, office, arena), `kit.disposeTree`, `Park3D.createHost`, `world3d.html?world=<id>&t=&weather=&q=`, `shot3d.mjs --world <id>`, `host.leakReport()` and `tests/beatbox_heroes_r3mem.test.mjs`. A world owner replaces the stub by pointing its id in `worlds.js` at its own module (`create(ctx, args)`); interior-family profiles must set `terrain.interior`, `windows`, `lights`. The host releases everything a world builds on unload (scene via `disposeTree`, `lighting.dispose()`, window/document/canvas listeners and DOM nodes added during build), so world code needs no dispose beyond its own timers and external resources. Flag shared resources with `userData.persist = true`.
* Shared across worlds (created once by host, never rebuilt): renderer, shadow map, `createPost` chain, palette atlas, character shared materials (`sharedMats()`), icon and fx atlases. `buildLighting(ctx, terrain, shared)` receives `ctx.shared = { post, shadowMap }`.
* Disposal: `kit.disposeTree(obj)` (geometries, materials, textures, CanvasTextures, render targets owned by the world), `renderer.renderLists.dispose()`, characters via `.dispose()`. Gate: after 10 load/unload cycles `renderer.info.memory.geometries/textures` return to baseline +-5%.
* Policy: ONE resident world. If M2 measurements show a mid phone needs > 700 ms to rebuild the street, add a single "warm street" slot (kept while inside a building, dropped on memory warning or when going to a non-adjacent world). Show a spinner chip only after 250 ms.
### 2.3 Scene hand-over (`r3/r3_core.js`, owner PLAT; engine.js hook lines owner PLAT)
```
E.scenes3d = {}                       // registered by r3/scenes_*.js
E.pickScene(name) = (R3.on && E.scenes3d[name]) || E.scenes[name]
E.go: in sw(): leave old; R3.show(def.is3d); clearUI; def.enter(args)       // 3D enter is async: await R3.load(worldId,...), then E.fadeTo(0)
E.start tick: if (R3.active) { skip 2D draw; R3.tick(dt) } else draw as today   // one RAF
E.fadeTo / E.flash / E.shake: when R3.active drive #fade, #flash and camera shake instead of the 2D ctx
E.hooks = { dialogLine, sheetOpen, sheetClose, uiBlock }                       // tiny additions in engine.js
E.burst/E.spawn: when R3.active draw on #fx (2D overlay) or call world.vfx.burst3D(x,y)
```
* 3D sibling skeleton: `{ is3d:true, world:'street', enter(a){...}, leave(){...}, update(dt){logic only}, ...delegated 2D methods }`. `leave()` unsubscribes events, closes sheets, `host.unload()` unless the next scene is 3D (host reuses renderer anyway).
* `G.goPlace/G.resume/G.enterPlace/G.leavePlace/G.finishActivity/G.showMorning` are untouched; they call `E.go` which now resolves to 3D siblings. `G.pendingMorning` still shows the DOM morning card before the home world fades in.
### 2.4 Input
* `#gl` pointer events go to `controls.js` (tap to move with A*, joystick, WASD, pinch). `E.unlockAudio()` is called from the first `pointerdown` on `#gl` (the old `cv` listener only fires in 2D). Keyboard: controls.js owns WASD/arrows in world scenes; rhythm owns D F J K; `E.scene.key` is not used by 3D siblings.
* `window.__PARK_AUTODONE = false` in-game: the bridge, not the demo timer, emits `spotDone` (section 2.5). `ui3d.js createUI(..., { embed:true })` builds only the context prompt button, joystick visual and nothing from the debug top bar/minimap (minimap optional per world).
* Sheets cover the lower ~45% of the screen: `controls.setViewInset({bottom:px})` shifts the camera target so the player stays visible (called by `E.hooks.sheetOpen/Close`).
### 2.5 Spots, doors, NPC taps -> the real actions (`r3/spotmap.js`, owner GAME)
Spot activation = `ctx.events 'spot' {id, scene}` after the cinematic starts. The bridge maps it to the SAME handlers the 2D hotspots use (places.js exposes `G.places = { ACTIONS, SPOT_FOR, TIPS, CLERK, variantFor, startPerform, startBattle, startTraining, jobRow }`, a 10 line export added by GAME):
```
street: park|home|shop|studio|bar -> G.enterPlace(id)  (toast + error sfx + spotDone when Core.canEnter fails)   map -> E.go('map')
home:   booth couch bed desk kitchen wardrobe -> ACTIONS.home[id](S)    door -> S.leave2()
park:   busk -> ACTIONS.park.spot   bench -> ACTIONS.park.bench   gate -> S.leave2()
        run -> energy check then E.go('run',{back:{scene:'place',args:{id:'park'}}})   flyers -> S.sheet('ODD JOB', [G.places.jobRow(S,'flyers')])
shop:   racks hats mirror counter -> ACTIONS.shop[id]   door -> leave2
studio: mic mixer -> ACTIONS.studio[id]    bar: stage counter -> ACTIONS.bar[id]
npc events: foxy -> E.dialog tip   beeamgee -> ACTIONS.park.bench   rohzel -> ACTIONS.bar.counter   clerk -> ACTIONS.shop.counter   regular0..2 -> S.mingleMenu(id)
```
* `spotDone`: the bridge wraps `S.closeSheet`, dialog `onDone`, modal close and every `E.go` away. `S.sheetEl` removal -> `world.done(spotId)`. A spot whose sheet auto-closes into another scene never needs `done` (world unloads).
* Gating visuals: `world.setSpotState(id,{locked:true,reason})` from `Core.canEnter` each minute tick and on `G.setChar` (closed shop at 09:00, bar on Monday, lab before day 2). Goal beacon: `G.goalDoor()` result -> `setSpotState(id,{goal:true})` (replaces the bobbing arrow).
* `ACTIONS` need `S` with `sheet,row,closeSheet,eatMenu,id,look,sc?`. The 3D place sibling provides all of these by delegation; `npcs()`/`regulars()` read `this.sc.spots`, so the sibling sets `this.sc = { spots: world.anchorsAs2D }` (no places.js change beyond the export).
### 2.6 Look object -> characters.js
* `G.ch.look` is already the shape `characters.js normLook` expects. Adapters call `createCharacter(ctx, G.ch.look)` and `player.setLook(G.ch.look)` on `G.setChar` (hash compared, cheap rebuild ~2 ms), never `Chars.fix` (2D).
* NPC looks come from `Core.NPCS[id].look` at runtime: `createNPC(ctx, id, { look })` (CHAR adds the `look` option; `NPC_LOOKS` stays only as fallback) so the 3D cast cannot drift from core.js. Clerk look = `G.places.CLERK`. Opponents/finals = `Core.OPPONENTS[i].look`, `Core.FINALS`.
* Gaps CHAR must close (checked by the parity test in section 6): every id in `CATALOG.GROUPS` (hairStyle 27, top 20, bottom 12, shoes 9, hat 20, glasses 15, acc 25, eyes 8, brows, facial, marks) draws without throwing; unknown id falls back to 'none'. New clips: `point`, `battle`, `sad`, `finisher`, `hit`, `walkside` (alias walk), `hold` (cards/box prop). New `setMood('neutral'|'happy'|'sad'|'angry'|'shout')` for dialog portraits and VS splash. Triangle budget stays <= 3500 per character, <= 12 live characters, crowds are instanced (<= 600 tris each, no skeleton).
### 2.7 Time of day, weather, clock
* `R3.syncChar(ch)` runs from `G.setChar` (wrapped by r3_core, throttled to 1 Hz and on place change): `world.setTime(Core.nightness(ch.minutes))`, `world.setClock({hour: Core.hourOf(ch.minutes), day: ch.day})`, `world.setWeather(ch.day % 5 === 0 ? 'rain' : 'clear')`, `world.setLook(ch.look)`.
* Mapping uses the existing numeric lighting scale (0 day, 0.5 golden hour, 1 night). Core 18:30 is nightness 0.5, so golden hour lands at dusk automatically. Lighting blends smoothly, dev-menu time jumps animate instead of popping.
* Interiors use the interior keyframes (windows show the same sky). `world.setClock` drives schedules: Foxy on couch or kitchen (same rule as `npcs()`: visible if hr < 11 or hr > 17, sits after 21), bar always night, park closes at 20 only for entering (existing `Core.canEnter`).
* Music beat: each frame `world.setBeat(E.beat())` pulses neon, stage lights, crowd sway. No audio code changes.
### 2.8 Saves, Core, audio, mic (hard rules)
* Not touched: `core.js`, `catalog.js`, `audio.js`, `mic.js`, `samples.js`, all `bbh:slot*`, `bbh:settings`, `bbh:dev` keys and IndexedDB samples. Adapters only call public APIs (`Core.apply`, `G.do`, `G.doHold`, `G.showResult`, `G.finishActivity`).
* New storage only under ONE new key `bbh:r3` = `{ mode:'auto'|'3d'|'2d', q:'low'|'med'|'high'|null, fail:null|{reason,t}, bootMs }`. Guarded read/write with try/catch like `E.store`.
* Mic/audio: the 3D mini games must use `BBH.Audio.ctx`, `BBH.Mic.open/listen/close`, `E.settings.offset|mic|voice|muted|sfx` exactly like rhythm.js/minigames.js (tuner today has an `ownCtx` fallback: in-game it must be unused). Audio unlock and mute follow `E.applyAudioSettings`.
* Visibility: `E.paused` also calls `host.pause(true)`; `visibilitychange` triggers `G.flush` as today.
### 2.9 Phones: memory, performance, tiers
* Budgets (per world): outdoor <= 150k tris and <= 120 calls, interiors <= 100k and <= 70, arena/venue <= 120k and <= 90, characters <= 3.5k each, <= 12 live, textures <= 40 MB, one 1024 shadow map (512 on low), DPR cap 2 / 1.5 / 1.25. Host enforces in `host.stats()`; tests assert them.
* Tiers: `low | med | high` already exist. Auto pick at first boot from `deviceMemory`, `hardwareConcurrency`, DPR, GPU string (software renderers rejected unless `?r=3d`), then a 3 s median-frame probe on the title (> 24 ms steps down once). Persist `bbh:r3.q`. Never step up mid-session. `low` = 30 fps cap, no bloom, blob shadows, 40% crowd, no weather splashes. `E.settings.reduce` disables camera shake and bloom pulse.
* Frame rule: no per-frame allocations in `update`; one `renderer.info` sample per second; adaptive DPR step 0.25 when 20 frames > 28 ms.
* Context loss: `webglcontextlost` -> DOM overlay "Graphics hiccup", host waits 2 s for `webglcontextrestored` and rebuilds the world; second loss in 60 s or a failed rebuild -> `R3.demote('lost')`: live switch to the 2D sibling of the current scene (`E.go(E.sceneName, args, {nofade:true})` with 3D off) and persist `fail`.
### 2.10 Loading and fallback (`r3/boot3d.js`, `build.js`)
* `index.html` still loads the classic game scripts (Core, E, G, audio) and adds `r3/*.js` adapters (small, classic). `world_a/world_b/chars*` stay loaded until M5; M5 makes `world_a/b` lazy (2D only) and keeps `chars*` for portraits/thumbs until replaced.
* `G.boot` -> `R3.boot()`: decide mode (`?r=`, `bbh:r3`, capability probe: webgl2, MAX_TEXTURE_SIZE >= 4096, not software). 3D: show `#boot3` DOM splash, `import()` the core chunk (URL stamped by build.js: `window.BBH_R3 = 'r3/entry.js?v=HASH'`), 12 s timeout, then `host.load('title')`. Any failure -> 2D boot exactly as today and `bbh:r3.fail` set (next boot goes straight to 2D; Settings GRAPHICS: AUTO / 3D / CLASSIC resets it).
* Build: new esbuild target `format:'esm', splitting:true, outdir dist/beatbox_heroes/r3/, chunkNames '[name]-[hash]'`, entry `park3d/entry.js`. The IIFE `park3d.bundle.js` stays for the three dev pages until M5, then dev pages move to the ESM entry. `tools/beatbox_heroes/build_park3d.mjs` gains `--esm`.
* Prefetch: after the title is interactive, `requestIdleCallback` injects `modulepreload` for `creator` and `street` (skipped when `navigator.connection.saveData`).
### 2.11 Contract additions the existing 3D modules must grow (owners in section 5)
* controls.js: `walkToSpot(id,{run})`, `setViewInset({top,bottom})`, `setEnabled(b)`, `focus({x,y,z}|npcId,{dist,pitch,yaw,ms})`, `release()`, `orbit` mode (title/creator: drag spin, pinch, tab presets), long-corridor follow for the street (`camera.hWidth 9`), emits `tap`, `npc`, `spot`.
* spots.js: `setSpotState(id,{locked,reason,goal,badge})` (lock glyph, dim ring, beacon), outdoor `terrain.spotDefs`, ring radius per def, `door` kind (walk through = activate).
* lighting.js: `setWeather`, `setBeat`, `setProfile`, `setStageTheme('pink'|'cyan'|'lime'|'gold')`, shared post, `dispose()` complete, interior keyframes reused by shop, lab, bar (bar/lab get club/studio profiles).
* mg_rhythm.js: `opts.offsetMs` (E.settings.offset), `opts.venue` ('busk'|'bar'|'showcase'|'arena'|'booth'), `opts.theme`, `opts.resolveBattle(payload) -> {votes,win,out}` (bridge runs `G.doHold({t:'battle',...})` and returns the real verdict; the internal `Core.resolveBattle` call stays only for the standalone page), `result.perfectLane`, `rounds[{q,style}]`, `oppStyles`, and a `setRewards(rw)` call so its result card shows cash/fans/xp from the real action. mg_run/mg_tuner: same `offsetMs`, shared audio, `quit` event.
Event names (ctx.events): existing `spot, spotDone, npc, time, tap, stick, timeofday, minigame, minigameQuit`; new `worldReady {id}`, `door {id}`, `focus {id}`, `quality {q}`, `contextlost`.

## 3. New worlds to build (metres, +z toward camera, same contract as flat3d)
All: golden-hour palette from PALETTE_AND_BUDGETS.md, vertex-colour flat shading via `kit.js`, baked AO, canvas-painted signs, lights through `terrain.lights/windows/emissive`. Each world ships `spotDefs`, `anchors.start`, `npcSpecs`, a screenshot set (day, dusk, night, rain) and a budget line in its header comment.
| World (file prefix, owner) | Layout and spots | Art notes |
|---|---|---|
| `street` Neon Row (`street*.js`, W-STREET) 70 x 22 m, walk corridor z -3..8, builds on `buildSkyline/buildStreet` from flora_sky | doors in x order as 2D: park gate -29 (iron arch, trees glow beyond), home -15 (stoop, buzzer 4B), shop 0 (striped awning, rack outside, OPEN sign), studio +13 (REC lamp, foam window), bar +27 (neon, bouncer, light spill). Extra spots: `map` (bus stop map board, x 6). Props: juice cart, lamps every 8 m, parked cars, cat on wall, steam vents (2D steam x213), puddles, graffiti, pigeons | Closed door = dark window, lock billboard, red sign. Rain splashes and puddle reflection cards. Goal door gets a vertical light beam. Tutorial: Foxy appears at the home stoop for the first-run dialog |
| `shop` Thrift Shop (`shop*.js`, INT-A) 10 x 8 dollhouse cutaway | spots: hats (hat wall, 20 pegs), racks (tops/bottoms), mirror (shades case + full mirror + 2 m try-on platform with ring light), counter (register, Clerk with CLERK look), door. Neon OPEN in window | Mismatched thrift charm, Hawaiian shirts, boombox, price tags. Mirror camera preset for try-on; live `setLook` from `S.shop.look` |
| `lab` Sound Lab (`lab*.js`, INT-A) 9 x 7, control room + glass booth | spots: mic (booth with pop filter, REC lamp when training), mixer (desk with VU meters bouncing on `setBeat`, jukebox corner, MPC pads), door. Seq/Recorder camera presets over the desk | Foam panels, rack gear, ON AIR sign, cable spaghetti, couch. Profile 'studio' (cool pads light, warm practicals) |
| `bar` The Bar (`bar*.js`, INT-B) 12 x 10 | stage right-back (5 x 2.5 m, curtain, LED strip, mic stand, speakers), counter left (6 stools, Rohzel, green juice machine), 3 regular seat anchors `regular0..2`, spots: stage, counter, door. Crowd 8 to 24 instanced spectators by programme | Chalkboard texture with tonight's programme and day name; banner for battle night; disco ball; neon beer sign. Profile 'club', always night, lights pulse on beat |
| `arena` battle venue (`venue_arena*.js`, INT-B) used by mg_rhythm `venue:'arena'` | two podiums (you, opponent from `Core.OPPONENTS[i].look`), 5 judge desks (Tek, Mel, Origi, Showtime, Wildcard characters with score cards), LED wall for VS splash, crowd ring | `stage` colour theme from `opp.style % 4`. Judge looks are NEW cast entries (CHAR). VS splash = camera whip, extruded canvas text, `setMood('angry')` |
| `venue` other rhythm venues (`venue_*.js`, INT-B) | `bar` stage (open mic, karaoke), `showcase` (bigger, gold, pyro, 30 crowd), `booth` (practice: dim room, ghost beat lines) ; `busk` stays in mg_rhythm_world | Highway geometry unchanged, only stage dressing and camera rig differ |
| `title` alley stage (`w_title*.js`, SHELL) | brick alley, string lights, hanging neon logo sign (canvas texture, bloom), pallet stage with Tay (beatbox), Foxy (dance), BeeAmGee (sit on crate), rain, steam, puddles with neon reflection cards | <= 60k tris. Slots reuse it with a closer camera. Time fixed dusk/night, ignores Core time |
| `creator` stage (`w_creator*.js`, SHELL) | 3 m turntable, 3 ring lights that change colour with the active tab, cyc backdrop, floating notes, sparkles on `changed()`. Presets: body, head, torso, legs, feet, full | Used for new game AND wardrobe (home). Lighting independent of Core time |
| `intro` shots (`w_intro*.js`, `cutscene.js`, SHELL) | director: `play([{world,time,weather,cam:{from,to,ms},actors:[{id|look,pos,clip}],props,text}])`. Beat 1 NEW `office` doorway set (glass door, plant, cardboard box prop, pink slip), 2 street in rain dolly, 3 flat door 4B and rent notice, 4 flat with Foxy, 5 flat booth night beatbox, 6 park with BeeAmGee, 7 hood fly-over. End card with logo | Reuses existing worlds; only the office set and 3 props are new |
| `hood` map (`w_hood*.js`, W-STREET) | tabletop miniature of Neon Row + park + flat footprint, tilt-shift, 5 pins with lock/OPEN, YOU ARE HERE marker; tap pin -> existing card sheet (`E.scenes.map.showCard`) | Built from LOD copies of street facades (instanced). Day/night follows Core time |
Other ideas found in the 2D game and kept: bar mingle seats (regulars), karaoke screen (text on bar LED wall), morning card background (home window sunrise behind DOM), result card confetti (3D confetti from mg_rhythm fx).

## 4. UI restyle plan (DOM must match the 3D look)
* Visual language = ui3d.js: rounded glass panels `rgba(23,16,43,.62)` + blur, chunky gold gradient buttons with `0 5px 0` bottom edge, cream text `#fff6e8`, cyan focus ring, 44 px minimum targets, 16 px gutters, safe-area insets. Pixel fonts (Press Start 2P, Silkscreen) are dropped in 3D mode for a rounded display font + system UI font (decision D3, OFL font vendored in `fonts/`, fallback Trebuchet MS).
* `#hud3` (real px, `hud3d.js`): top bar (day+clock chip, cash, fans, level ring with xp arc, three need meters energy/food/mood as small rings that turn red < 20), goal chip (`G.goal`), MENU and MAP icon buttons, bottom nav dock with 5 place buttons (tap = walk and run to door via `walkToSpot`), contextual prompt button from ui3d (`.p3-go`). Same contract as `E.makeHud`: `el.update(ch)`, secret dev door = 3 taps on the clock chip, `E.hudEl` assigned.
* `r3/theme3d.css` under `body.r3` re-skins `.panel, .sheet, .btn(.gold/.pink/.cyan/.green/.red/.dis), .tab, .tile, .sw, .bar, .chip, .toast, .h1, .h2, .t, .ts, .tp, input[type=text|range|color]` so ALL existing sheets, dialog, modal, shop, creator panels, stats, settings, dev menu change look with zero logic edits. Min touch height 40 px effective (CSS `min-height` scaled by `--S`, `E.S` exposed as CSS var `--S`), text >= 12 px effective. Sheets become rounded bottom sheets with a grab bar, max height 52 vh.
* Icons: `E.iconEl/E.icon` in 3D mode return inline SVG from `r3/icons3d.js` (energy, food, mood, coin, fans, level, mus, tech, ori, show, lock, check, cross, heart, star, note, mic, hat, glasses, shirt, pants, shoe, sleep, eat, train, busk, battle, shop, home, park, bar, studio, gear, sound, mute, back, left, right, trophy, clock, sun, moon, dice, shuffle, camera, palette, wand). Same names, so no call-site edits. Spot glyphs already exist in spots.js (shared).
* Toast/banner/dialog/modal: `r3/ui_kit3d.js` overrides `E.toast`, `E.banner` (confetti via `#fx`), `E.dialog` (portrait bust, name tag, typewriter kept, calls `E.hooks.dialogLine` so the world focuses the speaker, plays `talk`, `setMood`), `E.modal`. Dialog and results use the 3D bust (`portrait3d`) from M5, `Chars.portrait` before.
* Creator: tile thumbs from `Chars.thumb` until M5, then `thumbs3d.js` renders each item once on the shared renderer into a cached canvas (lazy per visible tab, 64 px). Pose buttons become icon chips; per-tab camera preset on tab change.
* Morning card, help, menu, stats, achievements: same DOM, new skin, optional blurred world behind (backdrop-filter on veil). Results card: grade letter with glow, reward chips, CONTINUE. Dev menu: theme only.
* Accessibility: `E.settings.reduce` kills shake/pulse; rhythm lanes keep shape glyphs (colour-blind safe); `navigator.vibrate(10)` on hits when available; all prompts have text, not colour only.

## 5. Work packages, ownership, milestones
### 5.1 Owners (one owner per file; others request changes through the owner)
| Role | Files |
|---|---|
| PLAT Platform engineer | `park3d/host.js`, `worlds.js`, `entry.js`, `main.js`, `kit.js`, `palette.js`, `r3/r3_core.js`, `r3/boot3d.js`, `r3/quality.js`, `engine.js` (E.pickScene/hooks/fade/fx only), `index.html`, `build.js` (R3 target), `tools/beatbox_heroes/build_park3d.mjs`, `shot3d.mjs`, `park3d.html`, `flat3d.html`, `minigames3d.html`, `PORT_PLAN.md` |
| GAME Game integration | `r3/scenes_world.js` (street, place, map siblings), `r3/scenes_play.js` (rhythm, run, tuner, seq, studio siblings), `r3/spotmap.js`, `places.js`, `rhythm.js`, `minigames.js`, `game.js` (hook/export lines only, each < 30 lines) |
| SHELL Shell and story | `r3/scenes_shell.js` (boot, title, slots, intro, creator siblings), `screens.js`, `creator.js` (extract `bgInit/onLookChanged/onPose`, < 60 lines), `park3d/w_title*.js`, `w_creator*.js`, `w_intro*.js`, `cutscene.js`, `thumbs3d.js`, `portrait3d.js` |
| UI Interface | `r3/hud3d.js`, `r3/ui_kit3d.js`, `r3/theme3d.css`, `r3/icons3d.js`, `park3d/ui3d.js`, `fonts/*` additions, `dev.js` (theme hooks only) |
| CTRL Controls and spots | `park3d/controls.js`, `spots.js` |
| CHAR Characters | `park3d/characters.js`, `char_*.js` (new clips, mood, `look` option for NPC, judges, clerk, crowd) |
| LIGHT Lighting and VFX | `park3d/lighting.js`, `fx_post.js`, `fx_vfx.js`, new `fx_weather.js` |
| ENV-PARK | `terrain*.js`, `flora*.js` (spotDefs for park, run loop marker, flyers corner, dispose) |
| ENV-HOME | `flat*.js` (spotDefs already, schedule hooks, dispose, wardrobe niche) |
| W-STREET | `street*.js`, `w_hood*.js` |
| INT-A | `shop*.js`, `lab*.js` |
| INT-B | `bar*.js`, `venue_*.js` |
| MG-RHYTHM / MG-RUN / MG-TUNER | `mg_rhythm*.js` / `mg_run*.js` / `mg_tuner*.js` (+ `mg_index.js` owned by MG-RHYTHM) |
| QA | `tests/beatbox_heroes_*.test.mjs` (new ones), `package.json` test:heroes list, `tools/beatbox_heroes/frozen.json` |
Frozen for everyone: `core.js`, `catalog.js`, `audio.js`, `mic.js`, `samples.js`, `pix.js`, `font.js`, `chars*.js` (2D), `world_a.js`, `world_b.js`.
### 5.2 Work packages and dependencies
| WP | Owner | What | Needs |
|---|---|---|---|
| P1 | PLAT | host.js + worlds.js registry (stub worlds with ground + `anchors.start`), `Park3D.init` shim, shared post/shadow, disposeTree, leak test hook | none (day 1, unblocks all artists) |
| P2 | PLAT | ESM split build, `r3_core.js`, `E.pickScene/hooks/fade/fx`, `boot3d.js`, fallback + `bbh:r3`, `index.html` wiring, quality probe | P1 |
| P3 | LIGHT | shared post, `setWeather`, `setBeat`, `setProfile`, complete `dispose`, rain interior windows | P1 |
| P4 | CTRL | orbit mode, `focus/release`, `walkToSpot`, `setViewInset`, `setEnabled`, outdoor `spotDefs`, lock/goal/badge states, embed ui | P1 |
| P5 | CHAR | new clips, `setMood`, NPC `look` option, judge + clerk + crowd, catalog parity | P1 |
| P6 | UI | `theme3d.css`, `hud3d.js`, `icons3d.js`, `ui_kit3d.js` | P2 |
| P7 | SHELL | title, slots, creator worlds + siblings, creator.js extraction | P1 to P5 |
| P8 | GAME | `G.places` export, spotmap, place/street/map siblings, `S` delegation | P2, P4 |
| P9 | ENV-HOME, ENV-PARK | wire spots, schedules, dispose, run and flyers markers | P4, P5 |
| P10 | W-STREET | street + hood worlds | P1, P4 (can start on stubs) |
| P11 | INT-A | shop + lab worlds | P1, P3 |
| P12 | INT-B | bar + venues + arena | P1, P3, P5 |
| P13 | MG-* | contract additions (2.11), venues hook-in, shared audio | P12 for arena |
| P14 | SHELL | intro cutscenes + office set | P9, P10 |
| P15 | UI + SHELL | thumbs3d/portrait3d, font, final skin | P6 |
| P16 | QA | suites in section 6, device matrix, perf budgets | all |
### 5.3 Milestones (each one merges to main, `npm run check` green, game playable end to end)
* M1 Foundation + title/slots/creator. WPs P1, P2, P4 (orbit), P5 (catalog parity), P6 (theme skeleton), P7, P16 (r3 browser suite, fallback test). Result: `?r=3d` or Settings GRAPHICS runs boot3 -> 3D title -> 3D slots -> 3D creator/wardrobe; everything after (intro, street, places, games) still 2D via per-scene fallback. 2D remains default. Gate: leak test, budgets, fallback test, creator parity for all catalog ids.
* M2 Home + Park wired to real actions. P3 (time/weather), P4 (spots), P8, P9, P6 (`hud3d`, dialog, sheets), `spotmap`. Result: in 3D mode you can sleep, eat, train (rhythm still 2D), busk (2D rhythm), rest on the bench, talk to Foxy/BeeAmGee, change clothes, leave to the (2D) street. Day/night and rain follow Core. Gate: spot->action test for home and park, morning card flow, mixed mode canvas switching.
* M3 Street + Shop + Lab + Bar + Hood. P10, P11, P12 (bar only, no arena), P8 (street/map). Result: full free-roam loop in 3D: street doors with locks and beacon, shop try-on, lab menus (Beat Maker and Recorder still 2D scenes), bar sheets and mingle, hood map. Gate: all `Core.PLACES` have worlds, door gating test, budgets per world, warm-street decision from measured load times.
* M4 Battles, rhythm, mini games, default flip. P12 (arena, venues), P13, P8 (`scenes_play`), intro cutscenes P14 (may slip to M5). Result: perform, practice, battles (VS splash, picker, judges, verdict), run, tuner, Beat Maker/Recorder over the lab, all in 3D; default `auto` picks 3D on capable devices. Gate: battle verdict equals `Core.apply` output, rewards shown match state, `offsetMs` honoured, 2D fallback test still green.
* M5 Polish, UI, perf, tests. P15 (3D thumbs, busts, final font/icons), lazy-load `world_a/b` in 2D only, tier tuning on real devices, soak, context-loss recovery, docs (README, DESIGN, this plan), remove BETA labels, move dev pages to ESM, delete IIFE bundle if unused. Gate: device matrix section 6, bundle budgets, 10 minute soak >= 30 fps on tier B.

## 6. Test strategy
* Must stay green untouched: `core, chars, world_a, world_b, audio, mic, browser (2D game, runs with ?r=2d forced), minigames (2D logic), park3d, minigames3d`. Rule: the 2D path is frozen behaviour; r3 code is additive (`E.scenes3d`), so those suites need no edits. Core tests are unaffected because no frozen file changes. QA adds `tools/beatbox_heroes/frozen.json` (sha256 of the frozen files) and a tiny suite that fails if one changes without the lead updating the hash.
* New headless-Chromium suites (same skip rules as the existing ones, swiftshader, `BBH_BROWSER=1` to require), all build a private bundle in a temp dir like `park3d.test.mjs`:
  1. `beatbox_heroes_r3boot.test.mjs`: `index.html?r=3d&q=low` boots, `BBH.R3.status==='ready'`, title world loaded, GL canvas not blank (`?preserve=1` + sample pixels), no console errors, `#gl` receives taps and unlocks audio.
  2. `beatbox_heroes_r3flow.test.mjs`: drives the real game through DOM clicks and `world.walkToSpot`: title -> new game -> creator (every tab) -> intro skip -> street -> each door -> each place -> sheets open with expected titles -> leave. Asserts `E.sceneName`, `R3.world.id`, `G.ch.place`, toasts for closed doors (Monday bar, shop before day 3).
  3. `beatbox_heroes_r3spots.test.mjs`: for every world and every `spotDef` id, teleport + `world.activate(id)`, expect the mapped real action (sheet title, `E.go` target, or `G.enterPlace`), and that `spotDone` re-enables controls when the sheet closes.
  4. `beatbox_heroes_r3mem.test.mjs`: load/unload every world 10 times, assert geometries/textures/programs back to baseline +-5%, tris and calls within section 2.9 budgets, per-world load time logged (assert < 8 s swiftshader).
  5. `beatbox_heroes_r3fallback.test.mjs`: (a) WebGL disabled (`--disable-gpu --disable-webgl`) boots the 2D game and sets `bbh:r3.fail`; (b) chunk request aborted via `page.route` -> 2D within 15 s; (c) `WEBGL_lose_context` twice -> live demotion to the 2D sibling of the current scene with state intact (`G.ch` unchanged).
  6. `beatbox_heroes_r3games.test.mjs`: perform/practice/battle through the adapters with `bot()` hooks and `tick(sec)`; verdict votes equal the held `battleResult`; cash/fans/xp after CONTINUE equal `Core.apply` expectations; abort returns to the same place world.
  7. `beatbox_heroes_look3d.test.mjs` (node, esbuild-bundled characters.js): every catalog id builds without throwing, tri budget, unknown ids degrade to none, `NPCS`/`OPPONENTS` looks all build.
* Time and weather: browser test sets `G.ch.minutes` via `Core.dev` through `G.dev({k:'time',v})` and asserts `lighting.getState().night` monotonic with `Core.nightness`; `day%5===0` shows rain particles count > 0.
* Existing helpers reused: `shot3d.mjs` (add `--world <id>`), `__park` test hooks, `window.__park.controls.advance(sec)` (headless GL is slow, keep simulation time injectable). Screenshots (day, dusk, night, rain) per world are review artifacts in the scratchpad, not pixel-diff gates.
* Real device matrix (manual before M4 flip and M5): iPhone SE class, current iPhone, mid Android (4 GB), low Android (2 GB). Check cold start, memory (no tab kill after 10 world swaps), 10 minute soak, thermal, audio offset feel in rhythm, mic permission flow, orientation change, backgrounding.

## 7. Risks and decisions for the owner
| # | Item | Recommendation |
|---|---|---|
| D1 | Keep the 2D game as fallback for good? Costs upkeep, protects old devices and context loss | Yes, frozen, covered by the 2D browser suite |
| D2 | Style: noir neon pixel identity vs golden-hour low-poly. Night and bar scenes carry the neon, day carries golden hour | Accept, keep neon palette in night/club profiles and the logo |
| D3 | UI font and skin (pixel fonts out, rounded display font in) | Rounded OFL font, pixel font only in dev menu |
| D4 | Portraits and creator thumbs: stay pixel `Chars` or render in 3D | 3D in M5, pixel until then |
| D5 | Intro: 3D cutscenes (~3 weeks) or keep painted plates | Cheap path first: ship plates as 2D flashback, 3D cutscenes if time |
| D6 | Camera: fixed yaw (today) or player can rotate | Fixed yaw in world, orbit only in creator/title |
| D7 | Default flip timing and desktop layout (phone column) | Flip at M4 on capable devices, desktop shows phone column |
| D8 | One resident world vs warm street cache | Decide with M2 numbers |
| D9 | Download size: 400 KB gz core + chunks on first visit, 2D scripts still ~250 KB gz | Acceptable on 4G; add modulepreload hints; revisit in M5 |
| D10 | Hood map as miniature diorama vs simple 3D map plane | Miniature if W-STREET has slack |
| Risks | iOS memory kill, post chain black frames (ladder exists), `ui3d` coordinates under CSS transform (avoided by keeping `#gl` outside `#stage`), mixed-mode glitches while 2D and 3D scenes alternate (fade covers swaps, `R3.show` pauses GL), mic latency under heavy CPU (offsetMs + 60 fps rhythm), NPC look drift (runtime `look` option), battle result double randomness (resolveBattle hook), catalog gaps in 3D wear (parity test), `controls.js` and `ui3d.js` assume park DEFS (generalise first) |

## 8. What to cut if scope is too big (in this order)
1. Intro 3D cutscenes: keep the 6 painted plates as a 2D scene (mixed mode already supports it).
2. 3D thumbs and busts (M5): keep `Chars.thumb/portrait`.
3. Hood map diorama: keep a flat top-down 3D plane with pins, or the 2D map scene.
4. Slots podiums, rain splashes on `low`, crowd variety, judge characters (use score-card billboards), pyro on showcase.
5. Beat Maker and Recorder over the 3D lab: keep their 2D scenes (they work in mixed mode).
6. Warm-street cache, minimap, `venue` variants beyond arena + bar (reuse bar stage for showcase).
7. Last resort: ship M1 to M3 (hub and all places in 3D) and keep rhythm/battle on the 2D stage with only run/tuner in 3D.
