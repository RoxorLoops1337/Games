# Encore Island 3D view (medium-poly)

One game, two renderers. The simulation (`encore_island/js/*`, state `S`) is the single source of truth. The 3D view is a second way to
DRAW it: it reads `S` every frame and shows it with three.js. The 2D canvas stays on top as a transparent HUD (menus, buttons, labels).
The player picks 2D or 3D (title screen and More menu); the choice is saved. Nothing in the simulation knows which view is on.

```
index.html ── classic scripts (sim, UI, 2D renderer) ──┐
           ── js/view.js (classic: mode switch, bridge) ┤  S, HUB, geoOf ... are plain globals
           ── import('./view3d/engine.js') on demand    ┘  (lazy, only when 3D is chosen)
view3d/ (ES modules, three r170 from ../encore_island_3d/vendor via an importmap)
  kit.js        shared look + builders (READ IT FIRST)       engine.js   renderer, post, quality, camera, loop (lead)
  bake.js       folds a mesh hierarchy into a few SkinnedMeshes   sync.js / overlay.js  entity pools, HUD labels (lead)
  plate3d.js    the upgrade circle (lead)                    lab.js / gamelab.js / lab_*.html   preview harness
  env3d.js      sky, water, islands, decor, paving          hub3d.js    home-island buildings and hub plates
  lands3d.js    per-land plates, towers, den, portal, pads   heroes3d.js hero, companion, fans, NPC
  foes_a/b/c.js the 24 creatures + 3 bosses                   loot3d.js   items, chest, shots, particles, fx
```

## Units, axes, facing
* World unit = 50 px: `X = x * W`, `Z = y * W`, `W = 0.02` (kit.js). Y is up. The 2D `y` axis (down the screen) is world +Z.
* The camera sits on the +Z side looking toward -Z at roughly 55 degrees pitch, FIXED yaw, so screen-down is +Z and screen-right is +X (the joystick works unchanged).
* Models face +Z (toward the camera) at yaw 0. To face a heading (dx, dz): `yaw = Math.atan2(dx, dz)`. Characters stand on y = 0. Rotation is applied by the ENGINE on `actor.group`; actors never rotate their own root.
* Walkable ground is the plane y = 0. Paving, plates and decals may rise at most 0.06 above it (use polygonOffset on flat decals). Relief (hills, cliffs, props) only OUTSIDE walkable areas.
* The Backstage room lives at world x about -400 (2D x = -20000): same scene, far away. Hide nothing for it; the engine switches mood and camera.

## Module contract
Every module is an ES module exporting `init(V)` which returns `{ update(dt, t, focus), ...api }`. `focus = { x, z }` is the hero in world units.
`V` (see `lab.js` for a working copy): `THREE, kit, scene, world` (static content group), `dyn` (per-frame content group), `camera, renderer, rig` (light rig), `LOOK` (live uniforms; `LOOK.beat.value` pulses on each beat), `Q`/`quality` (`detail` 0 low / 1 medium / 2 high, `tier`), `blobs` (shared BlobShadows: call `blobs.add(x, z, r, a)` for entities each frame, the engine calls begin/end), `labels` (HUD text at world points), `mods` (the other modules, filled as they init), `heightAt(x,z)`.

Game state is read through free identifiers (they are classic-script globals in the browser, bridged automatically in headless tests): `S`, `S.player`, `S.comp`, `S.enemies`, `S.dead`, `S.items`, `S.pop` (fans), `S.lands[k-1]`, `S.shots`, `S.eshots`, `S.fx`, `S.parts`, `S.fly`, `S.floats`, `HUB`, `STAGE`, `SELL`, `VAULT`, `FORGE`, `TRAY`, `FUP`, `MONU`, `WAYPAD`, `HATCH`, `TERRACE`, `UPG_POS`, `GEM_POS`, `UPG`, `GEMU`, `geoOf(k)`, `radiusAt`, `biomeOf(k)`, `BIOMES`, `landPlateDefs`, `unlockSpot(k)`, `foeArtName(k, boss)`, `SKINS`, `METALS`, `beatNow()`, `encoreOn()` ... Read the game files; do not copy their logic, DRAW what the state says. Never write to `S` from a 3D module. Access globals only inside functions (never at module top level), so modules can be imported headless.

Rules for modules
1. **Budget** (whole scene, worst frame): desktop <= 300 draw calls and <= 750k triangles, mobile <= 150 calls and <= 300k. Shadow maps <= 2048. So: merge static geometry with `kit.Builder` (one mesh per material), instance repeats (`InstancedMesh` / `kit.InstPool`), share geometry and materials, no per-frame allocation (reuse temp vectors), no `new` in `update`.
2. **Medium poly**: smooth shading, rounded forms and bevels, real detail up close (windows, trim, studs, leaves), but segment counts come from `kit.seg(n)` / `kit.icoDetail(n)` so the quality tier scales them. Faceted flat shading is allowed as a deliberate accent (rocks, crystals, cliffs).
3. **Look**: candy pastel palette (kit `C`), ink `0x2d170f` outlines on characters (the 2D game's inked look), warm sun from the upper left, cool fill, soft shadows, emissive parts glow through bloom (use `kit.glow(r,g,b)` with values above 1). Everything must read at phone size. Cute, juicy, alive: things bob, sway and pulse on `LOOK.beat`.
4. **Actors** (hero, fans, foes, NPCs) are hierarchical rigs: Groups for joints, meshes for parts, animated in `update(dt, t, st)`. After building, the ENGINE calls `bakeActor(actor)` (bake.js) to fold the rig into ~3 to 13 draw calls. Rules for baked rigs: animate node position / rotation / scale; hide parts with `node.visible = false` (supported) ; do not rely on runtime material colour changes or geometry swaps (drive the hurt flash through `ctx.setHurt` / `emissiveIntensity` on the part material, which is forwarded); billboards, particles and light cones parented to an actor must set `userData.noBake = true`. Aim for <= 120 meshes per actor and <= 4k triangles after boost (hero-class 8k).
5. **Shadows**: only the hero, the companion, big props and buildings cast real shadows (`mesh.castShadow`). Everything small and numerous uses `V.blobs`. Keep `castShadow` off for glows and decals.
6. **Headless**: no module may touch `document`/`window` at import time. Use `kit.canvasTex` (returns an empty texture without a DOM) so `tests/encore_island_view3d.test.mjs` can import every module under Node and run `init` + `update` against a stubbed `V`.
7. **Never throw** at runtime: missing data, unknown art names or kinds fall back to something generic. Wrap per-entity work if unsure.
8. Dispose what you build per land or per entity (`kit.disposeTree`), the engine rebuilds lands on prestige/load.

## Actor contract (heroes3d.js, foes_*.js)
```
makeHero(art)  art in jasmin | roxor | rawclaw | andy | jasmin_unicorn | roxor_monster | rawclaw_goat | jordan   (SKINS in data.js, fans use the same six; jordan is the SELL stall keeper)
makeFoe(artName, { boss, elite, gold })   artName from FOE_ART / BOSS_ART in data.js (24 creatures + 3 bosses, 'chochin', 'kappa', 'boss_jorogumo' ...)
-> actor = { group, update(dt, t, st), height /* world units, for hp bars */, radius, attack(), die(), isDead(), dispose?() }
st (every frame) = { speed 0..1, atk bool, cast bool, cheer bool, hurt 0..1, singing bool, die 0..1 /* death progress, 0 alive */, elite bool, gold bool, slow bool, glow bool, dash bool, carry: [] /* hero companion loot stack: entries {k, bar, crown} */ }
```
Foe size: the 2D radius `e.r` (px) times W is the collision radius; actors are modelled at a nominal radius (~0.55 for a normal foe, ~1.6 for a boss) and the engine scales `group` to `e.r * W / actor.radius`.

## Lab and screenshots (use them, LOOK at every picture)
* `lab.js`: standalone preview stage (`lab_chars.html`, `lab_kit.html`, `lab_bake.html` are examples). Params: `az el d tx ty tz fov w h detail shadows ground live=0`.
* `lab_game.html?m=./env3d.js,./hub3d.js&lands=3&fans=6&enemies=4`: loads the REAL game scripts, then runs the listed modules' `init(V)` / `update` against live state.
* `node tools/3d_shot.mjs "<url>" out.png --secs 1.5 --w 1000 --h 700` renders with software GL and prints draw calls / triangles. Always use `live=0` URLs for deterministic shots, and read the PNG back.
* Serve the repo root: `python3 -m http.server 8790` from /home/user/Games (probably already running; use another port if not).
* Software GL is slow: keep shots small (<= 1100 px) and avoid many parallel Chromium instances.

## Ownership
Each module file belongs to ONE author. Do not edit files you do not own; if you need something from kit.js / bake.js / plate3d.js / the engine, say so in your final report (or add it to your own file). `encore_island_3d/js/characters.js` (the slice's rigs and the `CK` helper bundle, `STYLE` switch) is owned by the heroes author; foe authors import `CK` from it and must not edit it.
