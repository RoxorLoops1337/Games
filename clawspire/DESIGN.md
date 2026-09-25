# CLAWSPIRE -- design bible & module contracts

> A claw machine roguelike. Every fight is a grab. Read this whole file before
> writing a line: every module is built by a different person in parallel, and
> the contracts below are the only thing keeping the pieces fitting.

## The pitch

You are a **Crawler**: an adventurer who strapped a cursed arcade claw machine
("the Rig") to their back and walked into the Clawspire, a tower of haunted
arcades run by the **Prize Master**, who turns adventurers into prizes.

- **Your deck is a bin of physical objects.** Swords, shields, potions, bombs,
  rocks. They sit in a glass cabinet with real physics.
- **Your turn is a handful of claw drops.** Steer the claw, let go, it drops,
  the prongs close, it lifts, swings to the chute and opens. Whatever lands in
  the chute is *played* (a sword deals damage, a shield blocks, a potion
  heals). What slips out lands back in the pile. A bad grab is a wasted grab.
- **Roguelike structure:** Slay the Spire style fights with intents and status
  effects, Roguebook style hex maps you reveal with ink and brushes, Monster
  Train style upgrades on items, relics that bend the rules, three acts, three
  characters, meta unlocks.
- **Upgrade the claw itself:** more grabs per turn, a wider claw, stronger
  grip, a third prong, rubber tips, a magnet.

Tone: chunky cartoon vector art (thick outlines, big shapes, readable at phone
size), neon arcade meets damp dungeon. Palette: deep purple ink `#12091f`,
hot pink `#ff2e88`, arcade cyan `#2ee6d6`, prize gold `#ffc94d`, slime lime
`#a6ff5e`, blood `#ff5a4a`. Light humour in copy, never mean.

## Ground rules for every module

- **One folder:** `clawspire/`. `index.html` + `js/*.js`. **No external assets,
  no libraries, no fetch.** All art is drawn on canvas with code, all audio is
  WebAudio synthesis. Nothing from the network.
- **Classic scripts, shared global scope.** `index.html` loads, in this exact
  order: `js/util.js`, `js/art.js`, `js/physics.js`, `js/data.js`, `js/combat.js`,
  `js/map.js`, `js/audio.js`, `js/render.js`, `js/game.js`. Each file declares
  ONE top-level `const` namespace (`U`, `ART`, `PHYS`, `DATA`, `COMBAT`, `MAP`,
  `AUDIO`, `RENDER`, `GAME`) and may use every namespace loaded before it.
  `ART` (optional PNG overrides from `art/`, see `ART_PROMPTS.md`) reads the
  later namespaces lazily; the drawn art is always the fallback.
  Nothing else at top level (no stray top-level `let x` that could collide;
  keep helpers inside the namespace or an IIFE).
- **Headless first.** Every module except `render.js` and `audio.js` must run
  under Node with no DOM at all (the test loader stubs `window`, `document`,
  `localStorage`, `requestAnimationFrame`, `setTimeout`, `performance`).
  `render.js` and `audio.js` must *load* headless (no top-level DOM/AudioContext
  access; touch them lazily inside functions) and must survive being called
  with the no-op canvas context the loader provides.
- **Determinism.** No `Math.random` anywhere except `U.rng()` seeded streams.
  Physics is deterministic for a given input sequence (fixed step).
- **Coordinates:** logical stage is **540 × 960 portrait** (see layout). The
  physics world runs in cabinet-local pixels (origin = cabinet interior
  top-left, x right, y down).
- **Mobile:** touch first, min 44px targets, no hover-only affordances, no
  `alert`. Desktop gets keyboard (← → to steer, Space/Enter to drop, E to end
  turn) as a bonus.
- **Tests** live in `tests/clawspire_*.test.mjs`, use
  `tests/clawspire_lib.mjs` (`boot()` returns `window.CS`, the namespace
  object game.js exposes). Test files print `name: N passed, M failed` and
  exit 1 on failure (use `harness()` from `tests/no_room_for_heroes_lib.mjs`
  or your own equivalent). Never create throwaway harnesses outside `tests/`.
- **Style:** vanilla ES2020, 2-space indent, no semicolon-less style games,
  small functions, a comment above each function that isn't obvious. Comments
  explain *why*. No em dashes anywhere (code, copy, docs). Use `--` or a
  comma instead.

## Stage layout (540 × 960, portrait, scaled to fit any screen)

```
y   0.. 70   top bar: HP / block / gold / act·floor, relic strip      (DOM)
y  70..340   arena: up to 3 enemies spread over x 90..450, feet on the
             floor line y 300, intents above heads (clamped under the top
             bar), hp bar + statuses under the feet. Enemies are scaled to
             fit: act 1 normals ~120px tall, elites ~150, bosses ~170
             (game.js ENEMY_FIT / enemyPos)                             (canvas)
y 338..382   player row: statuses, "grabs left" pips, turn banner
             (the banner is centred on y ~360, between arena and cabinet) (DOM)
y 380..830   the RIG: cabinet frame 30px, interior 480 × 390 at (30,410)
             chute = right-most 64px column of the interior, divider wall
             from the floor up to 60% of interior height; floor wedges
             130 wide x 90 tall on both sides make a bowl (CAB.slopeW/H)  (canvas)
             coach marks (tutorial) sit over the cabinet at y 540, never
             over the arena
y 830..960   control bar: END TURN, play-tray (items being played), hint (DOM)
```

Map, title, rewards, shop, event, rest, game over are full-screen DOM
overlays (`.screen`), the map itself is drawn on the canvas under a DOM header.

## Module contracts

### `js/util.js` -- `U` (already written, do not edit)

`U.rng(seed)` → function returning [0,1); `.int(a,b)`, `.pick(arr)`,
`.shuffle(arr)`, `.chance(p)`. `U.clamp`, `U.lerp`, `U.ease.*`, `U.uid()`,
`U.hashStr(s)`, `U.deepCopy`.

### `js/physics.js` -- `PHYS`

A small 2D rigid body engine (circles + convex polygons, sequential impulses,
friction, restitution, revolute joints with limits + motor) plus the claw rig
and cabinet built on it. Units: pixels, seconds. Gravity default `{x:0,y:1400}`.

```js
PHYS.box(w, h)                      // -> convex CCW verts centred on origin
PHYS.body({
  type: 'dynamic'|'static'|'kinematic',
  shape: {kind:'circle', r} | {kind:'poly', verts:[{x,y},...]},  // local, convex, CCW
  x, y, angle, density=1, friction=0.5, restitution=0.1,
  group='item'|'wall'|'claw'|'sensor'|string, mask?: string[] (groups it collides with; default all),
  sensor=false, data={}
}) -> b   // b.x b.y b.a b.vx b.vy b.av b.m b.invM b.I b.invI b.shape b.type b.data b.aabb()
PHYS.world({gravity, w, h}) -> W
  W.add(bodyOrJoint) W.remove(bodyOrJoint) W.bodies W.joints
  W.step(dt)              // fixed internal step 1/240 s, up to 12 substeps per call; clamps dt
  W.contactsOf(b) -> [{other, nx, ny, px, py, depth}]   // contacts from the last step
  W.queryAABB(x0,y0,x1,y1) -> bodies
  W.setGravity(x, y)
PHYS.revolute(bodyA, bodyB, {x, y} /*world anchor*/, {lower, upper, enableLimit, motorSpeed, maxTorque, enableMotor}) -> J
  J.setMotor(speed, maxTorque) J.setLimits(lower, upper) J.angle()

PHYS.cabinet(W, {w: 480, h: 390, chuteW: 64, dividerH: 0.6, wallThick: 40, slopeW: 0, slopeH: 0}) -> C
  // builds static floor/walls/ceiling, chute divider (right side), returns
  // slopeW/slopeH > 0 adds two static floor wedges (a bowl so the pile heaps
  // in the middle): left from (0, h-slopeH) down to (slopeW, h); right from
  // (chuteX-8-slopeW, h) up to (chuteX-8, h-slopeH). The renderer draws them
  // from the same cfg (RENDER.cabinetBack cfg.slopeW/slopeH).
  C.inChute(body) -> bool         // body's centre is inside the chute column below the divider top
  C.bounds = {w, h, chuteX /* left edge of the chute column */, chuteW, dividerTop, floorY, slopeW, slopeH}
  C.bodies

PHYS.clawRig(W, {
  cabinet: C,
  homeX,            // where the claw parks (interior px), default cabinet.w*0.5
  chuteX,           // x above the chute column centre; the carry target
  railY: 26,        // carriage height in interior px
  prongs: 2|3,      // 3 = extra middle prong (draws & grabs better)
  width: 1,         // palm scale (1 = 96px between open prong tips, 64px palm)
  grip: 1,          // motor torque scale (0.6 weak .. 2 crushing)
  speed: 1,         // carriage travel scale (1 = 260 px/s), drop 520 px/s, lift 300 px/s
  rubber: 0,        // 0/1: prong tip friction 0.55 -> 1.1
  magnet: 0,        // 0/1: attraction force toward the palm for bodies with data.tags 'metal' within 80px while dropping/closing
  rand: U.rng(1),   // used only for cable sway jitter
}) -> R
  R.phase  // 'idle'|'moving'|'dropping'|'closing'|'lifting'|'carrying'|'releasing'|'returning'
  R.x, R.y          // palm centre (interior px)
  R.targetX         // where the carriage is heading while idle/moving
  R.setTarget(x)    // only honoured in 'idle'/'moving'
  R.drop()          // only honoured in 'idle'/'moving'; returns false otherwise
  R.update(dt) -> events[]   // drive kinematics + motors; call BEFORE W.step(dt) each frame
                             // events: 'drop' 'touch' 'close' 'lift' 'carry' 'release' 'home' 'slip' 'shed'
                             // 'slip' = a grip lock broke while lifting/carrying (the item falls back)
                             // 'shed' = the cradle was full at the lift; the extras stayed in the pile (once per lift)
  R.held() -> bodies currently pinched between prongs (contact with >=2 prongs, or 1 prong + palm), plus locked ones
  R.locked() -> bodies the grip lock is carrying right now (use this for the "holding" hint and the item glow)
  R.open()          // force prongs open (also used at 'releasing')
  R.setConfig({width, grip, speed, prongs, rubber, magnet})  // rebuilds prongs if needed
  R.bodies          // {carriage, palm, prongs:[...], tips:[...]} for the renderer (see below)
  R.geo             // {piv, len, lenU, lenT, beta, len3, open, closed, reach, palmW} for the current width
  R.cradle(b?)      // with a body: true when its centre is inside the cradle; without: the 4-corner polygon (debug drawing)
  R.cradleCap()     // items the cradle carries: 2, +1 with prongs 3, +1 at width >= 1.36
  R.cableTop        // {x, y} where the cable leaves the rail (for drawing)
  R.sway            // current pendulum angle (rad) for drawing the cable
```

Rig anatomy (what `R.bodies` holds and how the renderer reads it):
- Each side prong is TWO bodies: an upper rod `prongs[0..1]` (hinge at the
  palm, tip at local +y) and a hooked tip segment `tips[0..1]` welded at
  the knee and bent inward by `RIG.hookAngle` (0.55 rad). `tips[i]` pairs with
  `prongs[i]`. RENDER.claw draws both from `shape.verts` rotated by `b.a`
  at `(b.x, b.y)` as one finger: a shared ink outline, a rivet at the knee,
  a rubber pad (cfg.rubber) or a chrome highlight at the very tip.
- Geometry at width 1 (`RIG`): hinges `pivot` 26 px either side of the palm
  centre, palm 64 wide, prong `prongLen` 53 (42% of it the bent tip,
  `hookFrac`), `openSpan` 96 px between the open tips, `closedGap` 2 px
  between the closed inner corners. The two hooks meet under the load, so a
  closed claw is a basket (the cradle), not a pinch; a closed empty claw
  never self-intersects.
- With `prongs: 3`, `prongs[2]` is a GHOST body (`b.ghost === true`, never
  added to the world, `mask: []`): the rig poses it every update from the
  side prongs' mean closedness. It is drawn first (behind) as a shorter
  straight prong with no hook. Its share of the hold is modelled by the
  torque bonus (`RIG.pinch3`), the lock capacity (`RIG.lock3`) and one extra
  cradle slot, because a physical off-axis third finger shoved items out in
  every geometry tried.
- The dig: while dropping, the first prong or tip contact does not stop the
  drop. The claw keeps sinking `RIG.dig` (30) px past that first touch so the
  hooks slide down around the target instead of closing in mid-air above a
  neighbour; the drop ends early only when the palm itself lands or the
  closed tips would reach the floor (`RIG.floorClear`). The palm can end
  below the pile top.
- The settle: 'closing' ends `RIG.settleT` (0.15 s) after the prongs have
  been quiet for `RIG.quietT` (0.15 s), or after `RIG.closeMax` (0.7 s) plus
  the settle when wedged. The claw visibly clenches before it lifts.
- The cradle lock: when 'closing' ends, every dynamic non-claw body whose
  centre lies inside the cradle (the polygon left hinge -> left tip -> right
  tip -> right hinge, expanded outward by `RIG.cradleMargin` 8 px), plus any
  body pinched by two prongs or a prong and the palm, is tied to the palm
  with a stiff, force-capped spring (`engageLocks`). Bodies merely touched
  from outside are not. Bodies that arrive during the first `RIG.lockWindow`
  (0.6 s) of the lift lock too, while there is room. The prongs stop
  colliding with what they hold and freeze at their closed pose; the motor
  drops to `RIG.lockHoldMul` (0.12) of its torque so it cannot squeeze the
  load out. The lock's capacity is the grip: `RIG.lockForce` (5.5e6) x grip
  x grippiness, x `RIG.lockRubber` (1.45) with rubber tips, x `RIG.lock3`
  (1.3) with a third prong (x `RIG.lockPalmOnly` 0.8 only for a one-prong
  pinch outside the cradle). A filtered load (`RIG.lockTau` 0.25 s) above
  the capacity (with the +-12% jitter), or a sag past `RIG.lockBreakDist`
  (16 px), breaks the lock: the rig emits 'slip' and the item falls through
  the claw (it keeps passing through the prongs until the grab ends, so the
  frozen prongs need not open). `RIG.lockGrace` (0.12 s) after engaging
  nothing breaks. The lift eases out at the top (a dead stop was a 13 g jerk
  that shook heavy items loose).
  Item-mass ladder: base grip 1 holds items up to about mass 2800 through a
  lift and carry (the anvil, 2720, rides; the tower shield, 4320, does not);
  rubber x1.45 -> ~4000, third prong x1.3 -> ~3600, both ~5200; each grip
  upgrade is +0.35. The tower shield needs grip ~1.55, or grip 1.1 + rubber.
- Capacity N: the cradle carries at most `R.cradleCap()` items: 2 at base,
  +1 with the third prong, +1 at width >= 1.36 (Wider Palm x2). Members ride
  in order of how central they sit under the palm (the aimed item is
  central); the extras beyond N stay in the pile as the claw rises and the
  rig emits one 'shed' (not a slip). The prongs ignore the walls while the
  claw is up (carrying, releasing, returning) so a wide claw can open over
  the chute without wedging against the cabinet side.
- Item-centred release: while carrying, the carriage target is the chute
  centre minus the mean lock offset of the held items (`carryX`), so items
  gripped off-centre still drop inside the 64 px column; the carriage may
  tuck `RIG.carryTuck` (6 px) past the wall clearance and never presses a
  held item into the wall. Release opens the prongs slowly
  (`RIG.releaseSpeed`, `RIG.releaseTorque`) so the load falls straight down;
  two items side by side both land in the column, and the divider's sloped
  lip tips a straggler in.

Feel requirements (these are the game):
- Prongs close with a torque *limit*, not a fixed angle: a fat item stops
  them early and is held by pinch + friction; a thin one they close past.
- Held items can slip: during 'lifting' and 'carrying' the carriage
  acceleration shakes the palm (pendulum sway) and the motor torque jitters
  +-12% (rand); marginal holds fail, good holds don't. With `grip:2` almost
  nothing slips; with `grip:0.6` heavy items usually slip. Ordinary items
  at grip 1 almost never slip; junk does.
- Items must never tunnel out of the cabinet (cap speeds at 2400 px/s, thick
  walls, substeps).
- A pile of 30 items settles to rest (max speed < 2 px/s) within 3 seconds
  and does not jitter or explode. Provide `W.energy()` (sum ½mv²) for tests.
- `closing` ends 0.15 s (the settle) after prong angular velocity has been ~0
  for 0.15 s, or 0.15 s after the 0.7 s cap.
- After 'release' over the chute, the rig returns home and opens; the game
  decides delivery with `C.inChute()`.
- Kinematic palm follows the carriage with a pendulum: `sway` is a damped
  spring driven by carriage acceleration. Drawing uses it; physics uses the
  resulting palm position too (so items feel the swing).

Tests (`tests/clawspire_physics.test.mjs`, yours): stacking settles; no
escapes over 60s of shaking; strong grip lifts a 30px circle from a flat
floor 9/10 drops; weak grip drops a heavy 50px box most of the time; sword
(44x10 box) delivers >= 17/20 at grip 1 and slick junk slips; two r=12 balls
side by side both lock and deliver >= 7/10; three balls -> 2 carried at
base, 3 with the third prong; a 3-prong rig lifts more often than 2-prong on
the same seed; the closed claw does not self-intersect; determinism (same
inputs => same positions).

#### Slippery items (grip lock hazard)

Slips are rare for ordinary items. `grippiness` scales the lock's break
force and gives a locked item a per-second slip hazard
`RIG.slipRate` (0.25) x (1 - grippiness) during the jerky part of the ride
(the lift and the first half second of carriage travel; a quarter of that
once cruising). Grip upgrades, rubber tips (x1.45) and the third prong
(x1.3) all divide the hazard. `data.grip` on a body overrides the table.

| item | grippiness | hazard at grip 1 |
| --- | --- | --- |
| balls, boxes, most shapes | 1 | none |
| long thin (local aspect >= 4: sword, wand, chain) | 0.85 (`gripThin`) | 0.04/s, about 1 in 20 |
| tiny discs / marbles (circle r < 10, `gripDiscR`) | 0.75 (`gripDisc`) | 0.06/s |
| glass, ice, or friction < 0.2 | x0.8 (`gripSlick`) | 0.05/s |
| junk (tags 'junk': rock, slag, ice block) | hazard grippiness x0.6 (`gripJunk`), capacity unchanged | rock 0.10/s, ice block 0.15/s, about 1 in 4 |

A slip emits `'slip'`; the item falls through the claw and cannot re-lock
during that grab; if nothing is left held the prongs twitch open for 0.3 s
so the fall reads. A lone sword at grip 1 is delivered about 19 times in 20;
a rock about 3 in 4; the anvil rides at grip 1.

### `js/data.js` -- `DATA`

Pure content. Objects and small pure functions only, no DOM, no state.

```js
DATA.ITEMS[id] = {
  id, name, rarity: 'c'|'u'|'r'|'l'|'junk', cost /*shop gold*/, tags: ['metal','weapon','glass','potion','heavy','light','junk','magic','food','tool'],
  shape: {kind:'circle', r} | {kind:'box', w, h} | {kind:'poly', verts:[{x,y}]},   // physics AND art size, px
  density: 1, friction: 0.5, restitution: 0.1,
  color: '#hex', color2: '#hex', art: 'sword'|'shield'|'potion'|'bomb'|'rock'|... , // render key (see render)
  target: 'enemy'|'all'|'self'|'random'|'none',    // default 'enemy'
  fx: [ {k, v, ...} ],                              // in order; see effect kinds
  plus: { name?: 'Rusty Sword+', fx: [...] },       // upgraded version (Monster Train style), same shape
  text: 'Deal 6 damage.'                            // hand-written, {v} allowed to be substituted by DATA.itemText
  exhaust?: true                                    // removed for the rest of the fight when played
  char?: 'knight'|'alchemist'|'rogue'               // character pool restriction (optional)
}
```
Effect kinds (combat implements exactly these; do not invent others):
`dmg {v, n=1}` (n hits), `block {v}`, `heal {v}`, `status {s, v, to:'enemy'|'self'|'all'}`,
`grab {v}` (+grabs this turn), `gold {v}`, `ink {v}`, `maxhp {v}`, `shake` (shake own bin),
`junk {id, n, to:'self'}` (add junk items to own bin for this fight), `purge {n}` (remove n junk from own bin for the fight),
`copy` (duplicate a random non-junk bin item for this fight), `dmgPer {v, per:'block'|'junk'|'metal'|'grabsUsed'}`,
`cleanse` (remove player debuffs), `lifesteal {v}`, `random {v, min, max}` (dmg between), `poisonAll`
Ordering: `fx` runs in list order. `v` may be negative for self damage.

Item roster: **at least 48 items**: ~18 common, 14 uncommon, 10 rare, 4 legendary, 3 junk
(`rock`, `slag`, `iceblock`). Shapes vary deliberately: long thin (swords, staffs) are
hard to hold, balls (bombs, orbs) easy, flat discs (shields, coins) slip, heavy (anvil,
hammer) need grip. Each item has `art` from a fixed list the renderer draws: 
`sword, dagger, axe, hammer, anvil, shield, buckler, potion, flask, bomb, torch, iceshard,
snowball, coin, gem, rock, slag, iceblock, apple, bread, book, scroll, orb, ring, key, chain,
horn, whetstone, feather, skull, star, boot, bone, bottle, heart, lantern, wand, mask, egg, dice`.
Sizes: between 20 and 60 px on the long axis. Density: light 0.5, normal 1, heavy 2.4.

```js
DATA.STATUS[id] = { id, name, icon /*1-2 chars, may be emoji*/, color, kind:'buff'|'debuff', stack:'count'|'turns', text }
```
Required statuses: `block` (handled as a field, not a status), `str` (strength, +v dmg per hit),
`weak` (deal 25% less, turns), `vuln` (take 50% more, turns), `poison` (take v at start of its turn, -1),
`burn` (take v at end of its turn, then -1; player burn ticks at end of player turn),
`chill` (count; at 3 -> freeze, resets), `freeze` (turns; a frozen enemy skips its action; a frozen
player loses 1 grab that turn), `regen` (heal v at turn start, -1), `thorns` (attackers take v),
`dodge` (next v attacks miss), `bleed` (take v when acting, -1), `stun` (skip next action), `grease`
(player only: bin is slippery this turn), `fog` (player: cabinet glass fogged), `shield_up`
(enemy: block persists), `enrage` (str +v every turn), `armor` (flat dmg reduction).

```js
DATA.ENEMIES[id] = {
  id, name, act: 1|2|3, tier:'normal'|'elite'|'boss', hp:[min,max], art: 'rat'|'slime'|... , size: 1,
  desc, moves: [ { id, name, k, v?, n?, s?, to?, item?, w? /*weight*/ , txt /*intent tooltip*/ } ],
  ai: 'cycle'|'random'|'weighted', pattern?: [moveIdx,...],   // 'cycle' walks pattern (or moves order)
  onDeath?: {k:'summon', id} | {k:'junk', id, n} | {k:'heal', v}
}
```
Move kinds (combat implements): `attack {v, n}`, `block {v}`, `buff {s, v}` (self), `debuff {s, v}`
(player), `heal {v}`, `shake`, `grease`, `fog`, `junk {item, n}`, `steal` (remove a random non-junk item from the bin until end of fight),
`freezeItem` (encase a random bin item in an ice block for the fight), `summon {id}`, `tilt` (gravity tilt for a turn), `charge {v}` (big telegraphed attack next turn), `escape`.
At least **26 enemies**: act 1 six normal + 2 elites + 1 boss; act 2 the same; act 3 the same; plus
the final boss `prizemaster`. Art keys: `rat, slime, bat, gremlin, mimic, spider, goblin, hoard,
imp, clockwork, golem, furnace, magnet, ironjaw, wraith, yeti, frostmage, icemimic, prizemaster,
mushroom, knight, wisp, crab, drone, tinker, cultist`.

```js
DATA.ENCOUNTERS[act] = { normal: [[ids...], ...], elite: [[ids]], boss: [[ids]] }   // >=6 normal, 2 elite, 1 boss per act
DATA.RELICS[id] = { id, name, icon, rarity:'c'|'u'|'r'|'boss'|'event', text,
  mods?: { grabs, width, grip, speed, prongs, rubber, magnet, maxhp, gold, ink, startBlock, startStr },
  hooks?: { onFightStart(F), onTurnStart(F), onTurnEnd(F), onPlay(F, inst, def), onGrab(F, n /*delivered count*/), onDmgDealt(F, e, amt), onKill(F, e), onHurt(F, amt) } // return nothing; mutate F via COMBAT helpers
}
```
At least **28 relics**. Hooks are functions in data.js (this is fine).

```js
DATA.EVENTS[id] = { id, title, text, art?: string, choices: [ { txt, sub?: 'cost/benefit line', fx: [ {k:'hp', v}, {k:'maxhp', v}, {k:'gold', v}, {k:'ink', v}, {k:'brush', id}, {k:'item', id|'random'|'rare'}, {k:'relic', id|'random'}, {k:'remove'} /*player picks an item to remove*/, {k:'upgrade'} /*player picks an item to upgrade*/, {k:'claw', u: upgradeId}, {k:'fight', enc: [ids], elite?: true}, {k:'junk', id, n} ], cond?: (run) => bool } ] }
```
At least **14 events**. All choices must resolve in `game.js` with the kinds above.

```js
DATA.CLAW_UPGRADES[id] = { id, name, icon, text, max /*times applicable*/, cost /*shop*/, apply(claw) } 
// claw config object: { grabs:3, width:1, grip:1, speed:1, prongs:2, rubber:0, magnet:0 }
```
Required: `grabs` (+1, max 2), `width` (+0.18, max 3), `grip` (+0.35, max 3), `speed` (+0.3, max 2),
`prongs` (2→3, max 1), `rubber` (max 1), `magnet` (max 1).

```js
DATA.BRUSHES[id] = { id, name, icon, text, cells: (q, r) => [[q,r],...] /*axial cells revealed around a target*/ }
```
`line3` (3 in a row toward the boss), `splash` (target + 6 neighbours), `drip` (target + 2 random-ish neighbours, deterministic by (q,r)), `comb` (5 vertical column).

```js
DATA.CHARACTERS[id] = { id, name, title, blurb, hp, gold, bin: [itemIds...] /*12-14*/, claw: {...}, relic: relicId, unlock: 'start'|'act2'|'win', color }
```
`knight` (swords & shields, sturdy), `alchemist` (potions, bombs, poison; 4 grabs, small claw), `rogue`
(daggers, coins, dodge; fast claw, gold).

```js
DATA.ACTS[1..3] = { name, sub, palette: {bg, wall, accent}, floors: 1 }
DATA.itemText(def, plus) -> string   // final rules text ({v} substituted)
DATA.pool(rarity, char?, tags?) -> [ids]
DATA.rollRarity(rng, weights?) -> 'c'|'u'|'r'|'l'
DATA.rewardItems(rng, act, char, n=3) -> [ids]   // no duplicates, rarity weighted by act
```

### `js/combat.js` -- `COMBAT`

Turn engine. Pure state + events; no DOM, no physics. The game applies bin
events to the cabinet.

```js
COMBAT.newFight(run, enemyIds, rng) -> F
F = {
  seed, turn: 1, phase: 'player'|'enemy'|'over',
  player: { hp, maxHp, block, status: {id: n}, grabs, grabsMax, grabsUsed },
  enemies: [ { uid, id, def, hp, maxHp, block, status: {}, intent: move, moveIdx, alive: true, charged } ],
  bin: [inst...], used: [inst...], exhausted: [inst...], stolen: [inst...],  // inst = {uid, id, plus, frozen, junk}
  target: 0,           // index of the targeted enemy
  events: [],          // append-only log of this turn for the renderer (game drains it)
  relics: [ids], claw: {...run.claw}, log: []
}
COMBAT.startTurn(F)               // block reset (unless shield_up), grabs = grabsMax (+relic mods), regen/poison ticks, refill bin from used if bin.length < 3 (emit {t:'refill', items}), freeze costs a grab
COMBAT.useGrab(F)                 // a drop was made: grabs -= 1, grabsUsed += 1 (returns false if none left)
COMBAT.play(F, inst, targetIdx?) -> events   // resolve an item's fx; moves inst bin->used (or exhausted)
COMBAT.endTurn(F) -> events       // player burn ticks; enemies act in order (intents), statuses tick; then startTurn for next turn unless over
COMBAT.status(F, who, id, v)      // add stacks; who is F.player or an enemy
COMBAT.damage(F, src, tgt, v, {pierce?}) -> dealt   // applies str/weak/vuln/armor/block/thorns/dodge, emits events
COMBAT.heal(F, who, v)
COMBAT.pickIntent(F, e)           // sets e.intent per ai
COMBAT.isOver(F) -> null|'win'|'lose'
COMBAT.addJunk(F, id, n) COMBAT.removeJunk(F, n) COMBAT.stealItem(F) COMBAT.freezeItem(F)
COMBAT.previewDamage(F, def, plus) -> number   // for tooltips/tray
COMBAT.intentText(e) -> string                 // "Attacks for 7", "Blocks 5", "Shakes the bin"
```
Event objects (renderer/game consume these; keep this list exact):
`{t:'dmg', who:'p'|'e', idx, amt, blocked, crit?}`, `{t:'block', who, idx, amt}`, `{t:'heal', who, idx, amt}`,
`{t:'status', who, idx, s, v}`, `{t:'die', idx}`, `{t:'summon', idx}`, `{t:'intent', idx}`,
`{t:'play', inst, def, target}`, `{t:'refill', items}`, `{t:'binShake'}`, `{t:'binGrease', turns}`,
`{t:'binFog', turns}`, `{t:'binJunk', items:[inst]}`, `{t:'binSteal', inst}`, `{t:'binFreeze', inst}`,
`{t:'binTilt', dir:-1|1}`, `{t:'binPurge', insts}`, `{t:'binCopy', inst}`, `{t:'turn', n}`, `{t:'over', result}`,
`{t:'text', who, idx, str}` (floating text like "MISS", "FROZEN"), `{t:'grab', v}`.

Damage formula: `base + str` per hit, ×0.75 if weak, ×1.5 if vuln on target, −armor, then block
absorbs. Player burn: `v` dmg at end of player turn then −1. Enemy poison/burn tick at the start
of that enemy's action. Freeze/stun: enemy skips its action, status −1. Chill 3 → freeze 1 (enemy) /
lose a grab (player). Bleed: v dmg when the unit acts, −1. Relic hooks called at the named points.
Enemy `charge` sets `charged` and next turn's attack does v.

Tests (`tests/clawspire_combat.test.mjs`, yours, use tiny inline item/enemy fixtures via
`DATA` if present or a stub): damage math (str/weak/vuln/block/armor/thorns/dodge), every status
ticks and decays as specified, freeze skips, chill→freeze, refill when the bin runs low,
exhaust, win/lose detection, intents cycle, every `DATA.ENEMIES` move kind and every
`DATA.ITEMS` fx kind resolves without throwing, a 200-turn fuzz with random plays never
NaNs hp.

### `js/map.js` -- `MAP`

Roguebook style hex map. Axial coordinates `(q, r)`, pointy-top hexes, `cols × rows`
rectangle (offset rows), 10 × 7 by default (70 tiles). The generator is landscape: start at
the left middle, boss at the right middle, difficulty by column. The game draws it as a
**portrait climb** with `orient: 'v'`: a pure display transform `(x, y) -> (y, -x)` that
puts the start at the bottom middle and the boss at the top middle, rows across the screen
(so the side towers sit on the left and right edges) and turns every hex flat-top. Icons,
labels, the ink pill and the axis chevrons stay upright; only positions transform. In the
540 × 788 map area this gives 41.8 px hexes (`GAME` caps at 44). All tiles hidden except the
start's neighbours; the boss tile is always visible.

**Landmarks.** Hidden tiles of type shop, rest, forge, elite, treasure, boss and tower are
`known` from the start: the fog shows their icon as a dim ink sketch with a dashed rim, so
the player can see what is worth spending ink on. Fights, gems, ink pots, events, brushes
and empties stay a plain `?`. Known tiles are still not walkable until revealed.

**Side towers.** 2 per act (3 on some maps), on the top or bottom row, offset columns
3..cols-3, never next to another special tile or another tower. Off the start-boss axis,
so reaching one costs extra ink: that is the strategic choice. Entering a tower starts an
elite-tier fight (the act's `tower` encounter pool when DATA has one, else its `elite`
pool); winning pays a relic through the treasure screen plus a bonus rolled at generate
(`content.tower.bonus`): `{k:'ink', n:2}`, `{k:'brush', id}`, `{k:'claw', u: upgradeId}`
or `{k:'gold', n:60}`.

**Path paint.** Tapping a hidden hex that does not touch the lit area previews the shortest
hidden path to it (BFS from every lit tile, never through the boss) with its ink cost on the
tile; tapping it again paints the whole path for one ink per tile, or a toast says how much
ink is missing. Tapping anywhere else clears the preview. Hidden hexes next to the light
keep the one-tap reveal. The start-to-boss axis is drawn as a faint dotted line with
chevrons that shows through the fog; the current hex has a breathing gold rim, walkable
hexes a thick pulsing cyan rim.

```js
MAP.generate({act, rng, cols: 10, rows: 7}) -> M    // cols clamps to >= 9, rows to >= 3
M = { act, cols, rows, tiles: { 'q,r': { q, r, type, revealed, visited, known, content } }, start: {q,r}, boss: {q,r}, pos: {q,r}, ink, brushes: [ids], revealedCount }
tile.type: 'empty'|'fight'|'elite'|'treasure'|'gem'|'ink'|'brush'|'event'|'shop'|'rest'|'boss'|'start'|'forge' (item upgrade)|'tower'
tile.content: { enc?: [ids], gold?, ink?, brush?, event?, tower?: { bonus }, ... } rolled at generate
Distribution per act (approx over 68 placeable tiles): fight 28%, empty 18%, gem 10%, ink 8% (min 4), event 8%, treasure 4% (min 2), brush 4% (min 2), shop 4% (min 3), rest 5% (min 3), forge 3% (min 2), elite 3% (min 2, never adjacent to start or boss), tower 3.5% (min 2, max 3). Elites/fights get harder with distance from start (content.diff = 0..1 by column).
MAP.key(q, r) MAP.neighbors(q, r) -> [[q,r]] (in-bounds only, needs M) -> MAP.neighbors(M, q, r)
MAP.isLandmark(tile) -> bool     // shop, rest, forge, elite, treasure, boss, tower
MAP.canReveal(M, q, r) -> bool   // hidden, in bounds, adjacent to a revealed tile, ink >= 1
MAP.reveal(M, q, r) -> tile|null // spends 1 ink
MAP.pathToReveal(M, q, r) -> [[q,r], ...]  // shortest hidden path from the lit area to (q,r), in reveal order, ending on it; never through the boss; [] when revealed, adjacent to the light, the boss or unreachable
MAP.revealPath(M, path) -> tiles[]|null    // reveals the whole path for path.length ink; null (nothing spent) when short on ink or the chain is broken
MAP.size(M, w, h, orient='h', max?) -> {size, ox, oy}  // fit with a MAP.FIT_MARGIN px margin; 'v' fits the transposed extents; max caps the hex size
MAP.brush(M, brushId, q, r) -> tiles[]  // reveals the brush cells (no ink cost, consumes the brush), target must be a hidden tile adjacent to revealed area
MAP.canMove(M, q, r) -> bool     // revealed and adjacent to pos
MAP.move(M, q, r) -> tile        // sets pos, marks visited
MAP.toPixel(q, r, size, orient='h') -> {x, y}   // pointy-top axial to pixel, (0,0) at (size, size); 'v' transposes to (y, -x)
MAP.fromPixel(x, y, size, orient='h') -> {q, r}  // with cube rounding; inverse for either orientation
MAP.hexCorners(x, y, size, orient='h') -> [{x,y} x6]  // pointy-top, or flat-top (turned 30 degrees) for 'v'
MAP.pathExists(M, from, to) through revealed tiles -> bool
MAP.progress(M) -> {revealed, total, pct}
MAP.serialize(M) / MAP.deserialize(o)
```
Tests (`tests/clawspire_map.test.mjs`, yours): generation counts/minimums for 200 seeds (10 × 7), boss reachable
(there is always a hidden-or-revealed path), start neighbours revealed, landmarks known exactly on their types,
towers 2-3 off-axis and not adjacent to specials, reveal spends ink and respects adjacency, pathToReveal shortest
and boss-avoiding, revealPath spends exactly path.length ink and refuses when short, brushes reveal the right
cells, move rules, pixel<->hex round trip, serialize round trip with known/tower.

### `js/audio.js` -- `AUDIO`

WebAudio, lazy. `AUDIO.init()` on first user gesture (safe to call repeatedly),
`AUDIO.sfx(name, opts)` names: `clawMove, clawDrop, clawTouch, clawClose, clawLift, clawRelease, itemLand,
itemSlip, chute, jackpot, hit, hitBig, block, heal, poison, burn, freeze, shake, enemyDie, playerHurt, win,
lose, click, buy, reveal, brush, step, coin, upgrade, turn, boss`. `AUDIO.music(mode)` modes: `off, title, map,
fight, elite, boss, win`, a tiny generative chiptune sequencer (bass + lead + hat) per mode, crossfades.
`AUDIO.setVolume(sfx, music)`, `AUDIO.muted` toggle with localStorage key `clawspire_audio`.
Must load headless (no AudioContext at top level) and every function must no-op safely before init.

### `js/render.js` -- `RENDER`

All canvas art. Each function draws at (x, y) with the given scale/angle and
restores ctx state. Nothing here mutates game state. Time `t` in seconds for idle
animation.

```js
RENDER.item(ctx, def, x, y, angle, scale=1, opts={plus, frozen, glow, alpha})  // art matches def.shape bounds exactly
RENDER.enemy(ctx, def, x, y, scale, t, st={hurt:0..1, attack:0..1, dead:0..1, frozen, poisoned, burning})
RENDER.cabinet(ctx, x, y, cfg, st={fog:0..1, grease:0..1, tilt, act, t})      // frame, glass, floor, chute column, divider, neon sign
RENDER.claw(ctx, rig, x, y, cfg)   // draws carriage on the rail, cable with sway, palm, prongs from rig.bodies
RENDER.bodyDebug(ctx, W)           // outlines, only for the debug flag
RENDER.hex(ctx, x, y, size, tile, st={reachable, current, hover, path, target, orient, t})  // map tiles incl. icons for each type; tile.known draws the landmark sketch in the fog; orient 'v' = flat-top hex
RENDER.mapBg(ctx, w, h, act, t)
RENDER.mapAxis(ctx, x0, y0, x1, y1, size, hiddenCentres, t, flat)  // dotted start-boss axis with chevrons toward (x1, y1), clipped to the hidden hexes
RENDER.mapPath(ctx, pts, size, {cost, ink, label, t})        // ink path preview line, cost pill, landmark label
RENDER.hpBar(ctx, x, y, w, h, hp, max, block)
RENDER.statusPips(ctx, x, y, status /*{id:n}*/, size)  // uses DATA.STATUS icon+color
RENDER.intent(ctx, x, y, enemy, t)   // icon bubble above an enemy: sword+number, shield, skull, etc.
RENDER.portrait(ctx, charId, x, y, size, t)   // for title / top bar
RENDER.relicIcon(ctx, def, x, y, size)
RENDER.bg(ctx, w, h, act, t)          // arena backdrop per act (parallax layers)
RENDER.title(ctx, w, h, t)            // title screen art: a giant claw over the tower, neon logo
FX (part of RENDER): RENDER.fx.burst(x, y, color, n, opts), RENDER.fx.text(x, y, str, color, opts), RENDER.fx.shake(amt),
  RENDER.fx.flash(color), RENDER.fx.trail(x,y,color), RENDER.fx.update(dt), RENDER.fx.draw(ctx), RENDER.fx.offset() -> {x,y}
```
Every enemy art key and every item art key listed in the data section must be drawn
distinctly (a test iterates all defs through `RENDER.item` / `RENDER.enemy` with the no-op ctx).
Items must read at 24px. Enemies: idle bob/breathe from `t`, a lunge on `attack`, a white flash +
squash on `hurt`, a fall/fade on `dead`. Bosses are 1.6× and have an aura.

### `js/game.js` -- `GAME` (+ `index.html`)

Glue: screens, run state, save/load, main loop, input, physics sync, rewards,
shop, events, rest, map flow, meta unlocks. Exposes `window.CS = { U, PHYS, DATA, COMBAT, MAP, AUDIO, RENDER, GAME }`.

```js
GAME.run    // current run R: { seed, char, act, hp, maxHp, gold, ink, brushes, bin:[inst], relics:[ids], claw:{...}, map: M, floor, kills, turns, grabs, jackpots, history }
GAME.fight  // current F or null
GAME.rig, GAME.world, GAME.cabinet   // live physics while fighting
GAME.screen // 'title'|'chars'|'map'|'fight'|'reward'|'shop'|'event'|'rest'|'forge'|'treasure'|'gameover'|'win'|'help'|'collection'
GAME.newRun(charId, seed?) GAME.toMap() GAME.enterTile(tile) GAME.startFight(enemyIds, tier) GAME.endFight(result)
GAME.dropClaw() GAME.steer(x) GAME.endTurn() GAME.playDelivered(bodies)
GAME.save() GAME.load() GAME.meta (unlocks, bests, stats; key 'clawspire_meta'), run key 'clawspire_run'
GAME.update(dt) GAME.draw() GAME.loop()
GAME.headless   // true when no canvas ctx; update() then skips drawing but still steps physics
```
Physics sync: each `inst` in `F.bin` has one body (`body.data.inst`). On `refill`, bodies are
respawned above the pile in a shower. Delivered = bodies for which `cabinet.inChute()` holds
for 0.25 s after a `release`; they are removed, `COMBAT.play` runs for each (jackpot if ≥2:
bonus sfx + banner), then when the rig is `home` and no held bodies remain the grab is done.
Grab flow: pointer down/drag on the cabinet steers (`rig.setTarget`), pointer up drops
(`COMBAT.useGrab` then `rig.drop()`); keyboard ← → Space. `END TURN` disabled while the rig is
busy. Auto end turn when grabs hit 0 and the rig is home (with a 0.6 s pause and a banner).
Enemy turn plays out with 0.45 s beats between events so the player can read it.

Flow: title → character select (locked ones show the unlock rule) → map (act 1) → tiles →
boss → next act (new map, +heal 30%) → after act 3 boss: win screen (stats, unlock) → title.
Death → game over with stats and "what killed you". Save on every screen change; a saved run
offers CONTINUE on the title. Help screen explains the rig, statuses and the map.
Tutorial: first fight of a fresh profile shows 3 short coach-marks (steer, release, chute).
Settings: sound toggle, music toggle, reduced shake, debug outlines (`?debug=1`).

Tests (`tests/clawspire_game.test.mjs`, written by the integrator): full headless run through
`window.CS`: new run → move on map → fight → drive the rig by calling `GAME.steer/dropClaw`
and stepping `GAME.update(1/60)` until the grab finishes → items played → end turn → win →
rewards → shop → boss → act 2 → save/load round trip → game over path.

## Balance targets (v1)

`DATA.DIFFICULTY = { hp, dmg }` multiplies every enemy's hit points and every
attack/charge value on top of the bands below (combat.js makeEnemy). It is the
one dial to turn when the claw's yield changes. It ships at hp 3.0, dmg 1.7,
where the perfect-aim bot loses about 6 runs in 10 (knight 38%, alchemist 75%,
rogue 13% wins over 8 runs each); the owner tunes it by hand from there.


- Character HP 70 (knight 80, alchemist 60, rogue 65). Act 1 normal enemies 12-30 hp,
  hit for 4-8. Act 2 ×1.7, act 3 ×2.6. Elites ×2.2 hp of a normal; bosses 90/170/280 hp.
- A turn is 3 grabs; a good grab lands 1 item, a great one 2. Average item ≈ 6 dmg or 5 block.
  A typical act 1 fight lasts 4-6 turns. Whole run ≈ 25-35 minutes.
- Gold: 10-25 per fight, items 40-120, relics 120-220, claw upgrades 50-160 (Extra Token 160, the rest 50-110), remove 60.
- Ink: 5 per act start, +1-2 from ink tiles, +1 from elites. ~35% of the map is revealed in a
  normal run; revealing more = more fights = more loot but more risk.

## Quality bar (Game of the Year, mobile)

- Every action has feedback: sound + motion + number. Screen shake on big hits (respect the
  reduced-shake setting). Floating numbers. Hit flash. Item glow in the chute. Jackpot banner.
- Nothing ever soft-locks: every screen has a way forward, every promise (a button, a hint)
  is true. Grabs cannot get stuck: a rig phase has a max duration and auto-advances.
- Text is readable at 360px wide: minimum 12px logical at scale 1, real sentences, no walls.
- 60 fps on a mid phone: physics ≤ 40 bodies, no per-frame allocations in hot loops, canvas
  cleared once, no shadowBlur in loops (draw glows as radial gradients cached once).
