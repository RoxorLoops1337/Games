# Awesome Farm: Folder layout

Part of the Awesome Farm notes; the essentials are in [../CLAUDE.md](../CLAUDE.md).

## Folder layout

```
awesome_farm/
├── CLAUDE.md, DESIGN.md, README.md
├── palette.gpl              GENERATED from src/shared/palette.ts (for tools/comfyui)
├── server/main.ts           dedicated server: http (game + /status) + ws (/ws) + saves
├── server/tsconfig.json     type-checks server + shared WITHOUT DOM types
├── scripts/                 build-server.mjs (packaging), build-single.mjs (one-file solo build), make-accounts.ts (name + secret word for existing farmers), palette-gpl.mjs, balance*.ts
├── tests/                   one `<system>.test.ts` per system (node:test). The special ones: content + art (every item has an icon and a source), touch (phones: chips, long press, wording),
│                            bot (+ botlib, bot.late): a scripted player plays the first 13 chapters with real commands (grind skipped late); tutorial: the starting steps walked in order by that player; fuzz + safety: hostile input never
│                            corrupts the world; netsync + server.e2e + server.hardening + reconnect: a real server over WebSockets (`netlib.ts` finds a free port); perf: a big busy world stays inside its step and bandwidth budget; dev: the developer menu (locks, key, every op)
├── proto3d.html, proto3d-models.html   DEV ONLY (npm run dev): the low-poly 3D prototype (its own HUD and solo world) and its model
│                            library, recovered from the prototype's built pages into src/client3d (not in the production build, not linked from the game)
└── src/
    ├── main.ts              boots the client; dev harness in DEV only (src/dev/harness.ts)
    ├── shared/              ← runs in the browser AND the server: no Phaser, no DOM, no localStorage
    │   ├── config.ts        world geometry, NET rates, ALL tuning dials (TUNING)
    │   ├── geom.ts          distances (`dist`, `distToRect`, `distToBuilding`) and the farmer's body offsets (`feetTile`, `hitPoint`)
    │   ├── fmt.ts           `clock(secs)` m:ss and `hhmm(hour)`: the one place time is written
    │   ├── palette.ts       the 25-colour palette: single source of truth
    │   ├── actions.ts       every juice-rule action (sim emits them, client FX table covers them)
    │   ├── blueprint.ts, placement.ts   copying a layout; why a piece will not fit (`placeWhy`, mirrors `tryBuild`)
    │   ├── cave.ts, daylight.ts, season.ts, rng.ts   the caves' map, the sun, the four seasons, the seeded dice
    │   ├── weather.ts       rain / fog as a pure function of seed, day and time
    │   ├── world.ts         land, occupancy, floors, veins, prices, purchasable plots
    │   ├── data/            items, recipes, buildings, nodes, biomes, skills, stats, mobs, creatures, quests, sidequests, guide, rift, hints, tutorial (the 16 starting steps), tips (progression tips), layouts (starter layouts), howto (automation one-liners)
    │   ├── sim/             THE rules. types.ts (state/Cmd/SimEvent), sim.ts (core: entities, caches, the step), commands (the Cmd check and dispatch, the farmer's own commands: move, swing, dash, look, respawn, summon), clock (day, night, dusk, seasons), health (hurt, down, revive, the fall), social (chat, emotes, pings), then one module per system:
    │   │                    economy, gather, machines, factory, power, status (what a factory building is doing, in words), mobs, combat, boss (patterns are a `SCRIPTS` table), death (the price of a fall), dread (the Dread Reaches), mines (the caves under the world; cave.ts makes them), creatures (+ jobs: posts and commands, with jobs-site / jobs-carry / jobs-field / jobs-sort / jobs-station behind it; petlib: chest helpers),
    │   │                    quests, hotbar, listed (what the menus list), shop (trader + waystones), rift (expeditions), fishing, pool (crafting reaches into chests), dev (the secret developer menu's ops), worldgen, stats (derived stats, inventory)
    │   └── net/             protocol.ts (wire format), host.ts (SimHost: peers, area of interest, saves)
    ├── client3d/            ← the low-poly three.js view (no Phaser; ONLY reached through the dynamic import in client/world/view3d-bridge.ts):
    │                        view3d.ts: the in-game 3D view (implements the bridge's View3D: terrain, sea, entities, farmers, sky, weather, fx,
    │                        the ghost, the target ring, picking); render.ts: renderer, post chain and the sky's hour (shared with the prototype);
    │                        coverage.ts: every kind of every family the 3D view must model (read from the data); quality.ts, batch.ts, budget.ts:
    │                        the 3D quality levels, instancing, culling by the view, the shadow fit and the ledger that frees the GPU;
    │                        models/ is the procedural model library (kit.ts: the flat-shaded builder; one module per family of buildings, nodes,
    │                        monsters, creatures, drops, the farmer); entities, terrain, sky, weather, fx, ambient are the view's layers;
    │                        mood.ts drives the world's light and air (caves.ts, seasons.ts, glow.ts, atmos.ts, riftgates.ts; tests/world3d.test.ts);
│                        contact.ts, impacts.ts, wet.ts: contact shadows, event rings and dust, the ground wet with rain (tests/art3d.test.ts);
    │                        main, hud, net, showcase, gallery, proto3d are the dev-only prototype pages (their own HUD and solo world, never in the game);
    │                        tests/client3d.test.ts builds every model headless and stages the showcase, tests/view3d.test.ts guards the 2D/3D choice,
    │                        tests/perf3d.test.ts the quality setting, instancing, the ledger and the shadow fit
    └── client/              ← Phaser
        ├── main.ts          game config + scene list (Boot → Title → Game + Hud)
        ├── profile.ts, settings.ts   the device's identity and the player's settings (localStorage)
        ├── input/           keyboard layouts (layout.ts), fullscreen and touch detection (screenMode.ts)
        ├── net/connection.ts  LocalConnection (solo SimHost) | WsConnection (server)
        ├── art/             painted sprites (storybook.ts: nature + crops; storybook-*.ts: ground, chars, build, decor, sites, house, critters, mobs, cave, luck, worn, logo) + grid art (icons, factory, badges); painter lib paint.ts, grid lib pixels.ts, registry sprites.ts
        ├── juice/           fx.ts (the juice-rule table), sfx.ts (one-shots), music.ts (quiet generative music), slowmo (the Perfect dash's beat)
        ├── world/           the world view, one module per concern, each taking the scene and a narrow host interface: view3d-bridge (THE seam to the 3D view:
        │                    the View3D interface, the pointer bridge Pointer2D/Pointer3D, the lazy loader), tiles, veins, farmers (you and the others), placing (ghost, drag lines, touch aim, one-off rule),
        │                    interact (what the keys act on: scanNear, targets, revive, dismantle), hands (hotbar, pods), ambience (hearths, roofs, caves, dread, waves), buildviews (a building's sprites),
        │                    views/occupancy/prodhist (entity views, tile occupancy, production history), combat (monster/projectile views, telegraphs), critters (creature views),
        │                    factoryview (status badges, tooltips, Factory view, machines as they run, wires, placement overlay), fishing, blueprints, costatus, titan, sea
        ├── ui/              the UI kit: kit (scale, text, buttons; re-exports the rest), tooltip, parts (tabs, pager, lists, slots, search, chips, slider), win (the window skeleton), toasts, px/grid/tips;
        │                    menukit (the skeleton of the big meta screens), slots (zones, bottomRect, stickZone, the live obstacle rects), hudlayer (the HUD's own drawing), minimap, party (party list, dusk pill),
        │                    plates (land price tags), touchcontrols (stick, thumb cluster, pinch), prompt (the interaction prompt's words, pure), bossbar, chat, night (light map + weather),
        │                    crew/workercard/jobpost pieces (creature workers on machine and craft windows), factoryui/factorylabels (status blocks, Factory-view captions), listtools (sort, chips), preview (tiny floor plans),
        │                    bake (frames baked to a texture), theme (UI colours), gestures/devgesture/devunlock (long press, the secret menu), rift, fishing,
        │                    companion (companion card + quest tracker), tutorial (coach card, world pointer, HUD rings and the tip cards), hints, screens/* (one file per menu)
        └── scenes/          Boot, Title (solo / join), Game (world view + input), Hud (overlay + screen manager)
```
