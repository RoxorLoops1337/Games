# Awesome Farm: Testing in a browser and developer tools

Part of the Awesome Farm notes; the essentials are in [../CLAUDE.md](../CLAUDE.md).

## Verifying in a browser

**Verifying in a browser** (the Claude pane is often hidden, which stops
`requestAnimationFrame`): in `npm run dev`, `src/dev/harness.ts` gives you `__step(frames)`,
`__key('e')` and `__errs`. Once in a world, `__farm` gives you `scene`, `conn` and `me`,
plus `sim` (the in-browser world, solo only). Network messages arrive on the event loop, so
step in real time (`await` ~16 ms between `__step(1)` calls) when a server is involved.
- **Two players in one browser:** open the second tab with `?profile=2` (a separate
  identity and solo save).
- **World size and old saves:** `GRID` (plots per side) in `shared/config.ts` is the map size; `STATE_VERSION` marks the
  save format. When either changes the shape of a save, add a step to `sim/migrate.ts` (v4 → v5 grew 17 → 35 plots and
  shifted every coordinate) so running worlds are carried forward; `tests/migrate.test.ts` shows how to hand-build an
  old save. The host (`server/main.ts`) and the solo build both load through `new Sim(state)`, which migrates.
- **Saves stay small:** land nobody owns carries no ore veins (`Plot.veins` is dropped when a world loads and made from the seed + plot index by `ensureVeins` in `sim/worldgen.ts` when a plot is bought or a home is claimed); with them a new world's JSON is ~170 KB instead of 1.2 MB, which matters for the phone's localStorage and the 20-second autosave. Anything new and bulky that is static (or can be rebuilt from the seed) should stay out of `WorldState` too.
- **Tiles heal themselves:** `TileLayer.heal` (started once a second by `Ambience` in `world/ambience.ts`; `healStep` then checks one row per frame) compares the tiles in view with the world and repairs any that a missed or interrupted redraw left wrong, so land is never drawn as sea.
- **Night difficulty:** by threat level (`mobs.groupLevel` / `threatAt`), never by `sim.s.day`.
- **Keyboard layouts:** `src/client/input/layout.ts` tracks the movement keys and the fishing key (W A S D Q) by
  `event.code` (position), so AZERTY plays as ZQSD. Everything else is character-based (I, C, K… are the same
  caps on every layout) except digits, read through `keyOf(ev)` so 1–8 work unshifted on AZERTY. Hint text
  uses `keyLabel('KeyQ')` / `moveKeys()`, never a literal "Q" or "WASD". Test: `tests/keyboard.test.ts`; in the
  harness fire `new KeyboardEvent('keydown', { code: 'KeyW', key: 'z' })`.
- **Dev keys:** `__key('h')` (any letter, arrows, `/`) fires a hotkey. DOM inputs (the search boxes) are not in `__shot`: use a page screenshot for those.
- **Test controls:** tests, tools and the dev harness (`__farm.give/xp/unlockAll/night`) send the developer menu's ops, `{ t: 'devdo', op: 'item' | 'coins' | 'xp' | 'skills' | 'clock' | … }` (`DEV_OPS` in `sim/dev.ts`),
  which work in dev solo and on a server started with `--cheats` (never on a real server).
- **Use your own background tab:** the owner may be playing in the visible one.

## Developer menu (secret: for testing, never mentioned in the game)

A tester's screen for levelling up, giving items, spawning monsters, bosses, creatures and nodes, setting the time or day, starting a night event, freeing land and teleporting. It works in solo (every build, including `npm run build:single`) and on a server that has a developer key.
- **Opening it:** tap the farmer's portrait (top left) 7 times within 4 seconds, or press Ctrl+Shift+D. Solo unlocks at once. Online it asks for the key (`window.prompt`), sends it, and opens the screen when the server confirms; once unlocked it opens without asking again until you leave. Nothing in the menus or the guide points to it. Code: `ui/devunlock.ts` (the gestures, one line in `scenes/Hud.ts`; the tap counting is `ui/devgesture.ts`, tested) and `ui/screens/devtools.ts` (the screen, registered as `dev`).
- **The rules** are in `shared/sim/dev.ts`: `Cmd { t: 'devdo'; op; … }` runs one op from the `OPS` table, and only for a farmer in `sim.devs` (runtime only: never saved or sent, cleared when the connection ends or is replaced) or when `sim.cheats` is on. Numbers go through `int()` (finite, clamped), words through `has()` (an own key of a data table); `Sim.command` has already refused inherited names (`hostile()`). Every op says what it did (an fx plus a float or toast), and a new op has to be added to `DEV_OPS` and `OPS`. God mode and the speed boost are the buffs `devgod` / `devspeed`, stripped on leave and on load. The screen echoes the answers on its status line (toasts wait under a window). `tests/dev.test.ts` covers every op, the locks and the real server.
- **The key:** `Cmd { t: 'dev'; key }` is answered by `SimHost` (`net/host.ts`), not the sim. The server takes `--dev-key <secret>` or `AWESOME_FARM_DEV_KEY`; with neither, the menu can never be unlocked there. The host keeps only a salted `hashKey` of it, compares in constant time, locks an address (or farmer) for 5 minutes after 4 wrong keys (a reconnect does not reset it) and everybody for 10 after 20 in 10 minutes, and never logs, sends or saves the key. The farmer's own record carries `dev: true` once unlocked (`flush()` adds it to the own view only). Solo is `new SimHost(…, { devOpen: true })`. The hosting scripts add `--dev-key` from `dev-key.txt` when that file exists.
- On a `--cheats` server (and in vite dev solo) every op works without an unlock, and the gesture opens the menu without a key.

## The Defense Lab (`?lab=defense`: towers, walls and waves, solo only)

`play/?lab=defense` (or the dev server's `/?lab=defense`) skips the title screen into a test arena: `shared/sim/lab.ts` builds a world of its own
(seed `DEFENSE-LAB`, cheats on: `sim.lab`, `sim.cheats`), a flat island of six plots (no ore, nothing grows back) open to the sea on the east,
the farmer in an 11 x 11 yard (stone north, wood west, brick south, Fortified east with the doorway), an Archer Tower, a Ballista and a Tesla Coil
(a wind turbine and a pole feed it) inside, spike traps outside the doorway, a nest isle four plots east, every skill, the story and medals done,
`LAB_KIT` in the backpack and god mode on. The clock is held at noon or midnight (`lab.step`: no night spawns, no dawn, no weather).
- **Never saved, never the real farm:** `client/lab.ts` reads the switch; with it the profile slot is `lab` (`profile.ts`: every per-farmer key
  gets `:lab`), `LocalConnection('defense')` builds the lab instead of reading `awesome_farm_solo_v1` and has no `onSave`, and the hints, tips,
  welcome card and tutorial neither show nor write.
- **The panel** (`ui/labpanel.ts`, in the left column where the quest tracker would be; the corner button folds it): monster, count, direction
  and level, Send wave, Night, God, Mend, Clear, Speed, Reset, and a readout (alive, killed by towers, by you, wall damage, broken pieces;
  `lab.readout`, from `defense.tally`). Every button is a `devdo` op: `labWave` (`id` monster or `mixed`, `n`, `lv`, `who` = n / e / s / w / sea:
  raiders with `rd` on the yard, 14 tiles out, the sea wave 18 out in the water), `labNight`, `labMend` (mends and puts back broken arena
  pieces), `labClear`, `labSpeed` (`sim.timeScale`, read by `SimHost.update`), `labReset`, plus the menu's own `god`. They refuse outside a lab
  world and are locked like every op. Test: `tests/lab.test.ts`.
