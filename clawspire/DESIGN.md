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
  grip, a third prong, rubber tips, a magnet. Claw upgrades are rare: only a
  boss (the spare parts screen after acts 1 and 2) or a tower bonus grants one.

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
             from the floor up to 45% of interior height (a carried item
             clears it); flat floor, no wedges (CAB.slopeW/H are 0); the
             chute has no floor, prizes fall through onto a hidden tray  (canvas)
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

Claw Crawl's engine, ported (the sibling game in `claw_crawl/index.html`;
the feel is the spec). Bodies are compounds of circles: a ball, a capsule
chain or a rounded blob. They collide with each other, with static capsule
walls and with the kinematic claw (a hub circle plus two prongs of three
capsule segments). Sequential impulses (`PH.it` 10 per substep) with Coulomb
friction, restitution only on hard hits (approach > `PH.bounceV` 90 px/s),
bias-limited penetration recovery (`PH.beta` 0.24, capped at `PH.maxBias`
200 px/s and at `PH.clawBias` 110 px/s against the claw, so the claw can
never fling anything), sleeping bodies (`PH.sleepV` 14 px/s, `PH.sleepW`
0.35 rad/s for `PH.sleepT` 0.45 s, never while the claw is busy) that wake on
a hit (`PH.wakeV` 70 px/s or `PH.wakePen` 2.5 px), when a body under them is
removed, on a gravity change and when the claw touches them, and hard
floor / wall / lid clamps after every substep so nothing ever leaves the
cabinet. Fixed 1/240 s substeps (4 per 60 Hz frame, at most 12 per
`W.step`). Units: pixels, seconds. Gravity is Claw Crawl's 1150 px/s^2
(`game.js` GRAVITY; a tilt is +-510 sideways). No `Math.random`: the rig
takes a seeded `rand`.

```js
PHYS.box(w, h)                      // -> {kind:'box', w, h} shape descriptor (maps to a capsule)
PHYS.partSpec(shape)                // -> {kind:'ball'|'cap'|'blob', r, len, ax} the parts a shape becomes
PHYS.body({
  type: 'dynamic'|'static',
  shape: {kind:'circle', r} | {kind:'box', w, h} | {kind:'poly', verts} | {kind:'ball'|'cap'|'blob', ...},
  x, y, angle, density=1, friction=0.5, restitution=0.12, group='item', data={}
}) -> b   // b.x b.y b.a b.vx b.vy b.av b.m b.invM b.I b.invI b.parts b.px b.py b.br b.sl (asleep)
          // b.held (touched by the claw a moment ago) b.shape (the descriptor, kept) b.aabb()
PHYS.world({gravity, w, h}) -> W
  W.add(b) W.remove(b) W.bodies W.segs (walls) W.csegs (claw) W.contacts
  W.step(dt)              // fixed 1/240 substeps, at most 12 per call; pre hooks (the rig plans), physics, post hooks (the rig moves)
  W.setGravity(x, y)      // wakes everything
  W.wakeAll() W.energy() W.queryAABB(x0,y0,x1,y1)
  W.contactsOf(b) -> [{other, nx, ny, px, py, depth, claw}]   // other is a body or a segment ({wall} / {own})
  W.addHook(fn) W.removeHook(fn) W.addPost(fn) W.removePost(fn)   // fn(h, W) per substep

PHYS.cabinet(W, {w: 480, h: 390, chuteW: 64, dividerH: 0.45}) -> C
  // capsule walls: left, right, floor (none under the chute: prizes fall
  // through it onto a hidden tray RIG.tray 44 px below the floor), the chute
  // divider on the RIGHT (down to the tray, so there is no pocket under the
  // floor), the lid (RIG.lid, -64). Also sets W.clampBox (x 5..w-5, the
  // floor RIG.floorSink 3 px above the surface so the thinnest items still
  // touch it, the tray, the lid RIG.clampTop -50).
  C.inChute(body) -> bool         // centre inside the chute column below the divider top
  C.bounds = {w, h, chuteX, chuteW, dividerTop, floorY, trayY, slopeW: 0, slopeH: 0}
  C.segs

PHYS.clawRig(W, {
  cabinet: C,
  homeX,            // where the claw parks, default half the bin width
  chuteX,           // carry target: the chute column centre
  railY: 26,        // the rail; the hub parks RIG.hubDrop (14) below it
  prongs: 2|3,      // 3 = +0.1 grip_cc, x1.08 size, and a drawn-only ghost finger
  width: 1,         // size = RIG.base (0.74) * width
  grip: 1,          // Clawspire grip (0.75 .. 2+); see the mapping below
  speed: 1,         // carriage and carry travel scale (330 px/s at 1)
  rubber: 0,        // +0.15 grip_cc (Claw Crawl's gloves)
  magnet: 0,        // pulls 'metal' items within 110 px of the hub while dropping / closing
  grease: 0,        // -0.3 grip_cc (Claw Crawl's greaseOn), set by the game for the grease status
  rand: U.rng(1),   // loosen and jolt
}) -> R
  R.phase  // 'idle'|'moving'|'dropping'|'closing'|'lifting'|'carrying'|'releasing'|'returning'
  R.x, R.y          // hub centre (interior px)
  R.targetX         // the aim point; 'returning' is the travel back to it after a release
  R.setTarget(x)    // only honoured while idle / moving (clamped to the bin)
  R.drop()          // only honoured while idle / moving; the drop starts once the carriage has arrived
  R.update(dt) -> events[]   // call BEFORE W.step(dt); returns the events of the substeps run so far
                             // 'drop' 'touch' 'close' 'lift' 'carry' 'release' 'home' 'slip' ('shed' is never emitted)
  R.held() -> bodies the claw is touching (b.held > 0) while busy, [] when idle
  R.locked() -> the cargo (what was held above the hub when the lift started and has not slipped); for the glow and the hint
  R.cradle(b?)      // legacy alias: cradle(b) -> b is cargo; cradle() -> the cargo
  R.open()          // force the prongs open: a busy claw goes to 'releasing' then 'returning'
  R.setConfig({width, grip, speed, prongs, rubber, magnet, grease})
  R.bodies          // {hub: {x, y, r}, prongs: [[p0..p3], [p0..p3]], ghost: [p0..p3] | null} cabinet points for RENDER.claw
  R.geo             // {s, grip, hubR, reach, span, halt, mu} for the current config
  R.cfg R.ctl       // ctl is the raw claw state (tests and the watchdog test pin it)
  R.cableTop        // {x, y} where the cable leaves the rail (the top end sways, the hub does not)
  R.sway            // visual cable sway (rad)
  R.calm()          // idle and parked on the target
  R.destroy()       // removes the claw segments and hooks
```

The claw (Claw Crawl's numbers, `RIG`):
- Anatomy: hub circle r 13 x size; two prongs hinged at (+-7, 7) x size,
  each the polyline `PRONG` [0,0] [14,28] [9,48] [1,57] x size as three
  capsule segments of radius 4.5 x size, rotated outward by phi (`PHI_OPEN`
  0.62 .. `PHI_CLOSED` -0.1). The tips curl inward, so a closed claw is a
  basket. The claw is kinematic: items feel its velocity through the
  contacts, the bias cap keeps its shove gentle.
- Mapping from Clawspire's claw config: size = 0.74 x width (x1.08 with the
  third prong); grip_cc = clamp(0.35 + 0.3 x (grip - 0.75), 0.15, 1) + 0.15
  rubber + 0.1 third prong - 0.3 grease, clamped 0.05..1. So the alchemist
  (0.75) is 0.35 like Claw Crawl's frog, the rogue (1.0) 0.425, the knight
  (1.3) 0.515 like the raccoon, and each Stronger Motor (+0.35) adds 0.105.
  Claw-item friction is `0.6 + 0.8 x grip_cc` (times a slickness factor from
  the item's own friction: ice is still slippery); `halt` = 1.5 + 3 x grip_cc.
- State machine (per substep, `plan` then `move`): idle (travel to the
  target at 330 x speed px/s) -> drop (250 px/s, until the hub or a prong
  lands on something (`touch`) or the hub reaches the floor limit) -> close
  (prongs sweep at 2.6 rad/s; a prong that has been blocked for 0.08 s has
  closed on something, per-prong halt detection: penetration beyond
  `halt + 7 x open^2` against the closing sweep; done when both are blocked
  or closed after 0.18 s, or at 0.8 s) -> lift (175 px/s; the loosen
  `(1 - grip_cc) x 0.12 x (0.7 + rand x 0.6)` rad spread over the first 0.4 s;
  the cargo is every body touched a moment ago above hub y + 70 x size) ->
  carry (a jolt of 0.05 rad with probability `(1 - grip_cc) x 0.25` at the
  top, then travel to the chute at 330 x speed px/s, 0.2 s pause) -> open
  (3.2 rad/s for 0.35 s, then hold until nothing touches the prongs, at most
  1.2 s more) -> return (travel back to the aim point) -> idle ('home').
- Slips: a cargo item below hub y + 95 x size, falling faster than 60 px/s
  and not over the chute has slipped ('slip'). Claw Crawl scoops: a dense
  pile gives multi-item cargo and about one slip per grab for the knight,
  exactly like Claw Crawl's own piles (raccoon: 2.4 items/drop, 1.8
  slips/drop, 95 % of drops deliver).
- Grease is a slippery claw (grip_cc - 0.3), not slippery items. The magnet
  pulls metal toward the hub (420 x h / max(1, d/40) px/s per substep within
  110 px) while dropping and closing.

Items (`game.js` shapeFor -> `partSpec`): circle r -> ball r; box w x h ->
capsule of length max(w,h) and radius min(w,h)/2 (capped at `SHAPE.capRMax`
18, along the long side); polygon -> a capsule of radius <= 12 when it is at
least 1.8 x longer than wide (axe, shard, bottle), else a blob of radius
0.46 x the long axis (four circles). A frozen item is a ball of its long
radius. Mass = sum of pi r^2 x density x 0.01 over the parts (capsule parts
overlap; that is Claw Crawl's mass too). Density, friction and restitution
come from the item def (restitution default 0.12).

Bench (scratchpad bench.sh, 150 fights per row, fresh pile, one random aimed
drop each, base rigs): knight 92 % of grabs deliver (2.2 items/grab, 0.8
slips/grab), alchemist 87 % (1.6 items, 0.1 slips), rogue 83 % (2.1 items,
0.4 slips); at grip x1.7 + rubber: 91 / 83 / 78 %; third prong knight 95 %.
A lone item on the bare floor: ball, shield, flask, tower shield, two
marbles all deliver; a sword lying flat is the knife-edge case (it must be
scissored up between the closed prong and the hub, which works when the
sword is longer than the prong: the rogue's claw yes, a Wider Palm knight
not always), exactly as in Claw Crawl, whose small frog claw never gets it.

Tests (`tests/clawspire_physics.test.mjs`): parts and mass; settle and
sleep (34 items asleep in under 5 s); wake on a hit, a removal, a gravity
change; 60 s of shaking and tilting with nothing outside the glass; the
floor / wall / lid clamps and the chute tray; the phase cycle with its
events; halt detection; deliveries of a ball, shield, sword, flask, tower
shield and two marbles from the floor; strong vs weak grip on a heavy item;
loosen and jolt driven by grip with a seeded rand (never Math.random);
determinism; setConfig; the magnet; grease; no flinging through a pile;
visual-only sway.

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
DATA.EVENTS[id] = { id, title, text, art?: string, choices: [ { txt, sub?: 'cost/benefit line', fx: [ {k:'hp', v}, {k:'maxhp', v}, {k:'gold', v}, {k:'ink', v}, {k:'brush', id}, {k:'item', id|'random'|'rare'}, {k:'relic', id|'random'}, {k:'remove'} /*player picks an item to remove*/, {k:'upgrade'} /*player picks an item to upgrade*/, {k:'claw', u: upgradeId} /*resolver only: no event uses it, claw upgrades come from bosses and towers*/, {k:'fight', enc: [ids], elite?: true}, {k:'junk', id, n} ], cond?: (run) => bool } ] }
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
COMBAT.startTurn(F)               // block reset (unless shield_up), grabs = grabsMax (+relic mods), regen/poison ticks, bin trickle: top the bin up from used (random picks) to DATA.ECONOMY.binFloor (6) plus DATA.ECONOMY.trickle (2) more, never above MAX_CABINET (emit {t:'refill', items}); a dry turn (nothing played) pours the whole used pile back instead; an empty bin mid-turn refills at once; freeze costs a grab
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
ticks and decays as specified, freeze skips, chill→freeze, the turn-start trickle (floor, cap, empty used pile) and the mid-turn refill,
exhaust, win/lose detection, intents cycle, every `DATA.ENEMIES` move kind and every
`DATA.ITEMS` fx kind resolves without throwing, a 200-turn fuzz with random plays never
NaNs hp.

### `js/map.js` -- `MAP`

Roguebook style hex world. Axial coordinates `(q, r)`, pointy-top hexes, `cols × rows`
rectangle (offset rows), **16 × 22 by default (352 tiles)**. The generator is landscape: start
at the left middle, boss at the right middle, difficulty by column. The game draws it as a
**portrait climb** with `orient: 'v'`: a pure display transform `(x, y) -> (y, -x)` that
puts the start at the bottom middle and the boss at the top middle and turns every hex
flat-top. Icons, labels, the ink pill and the axis chevrons stay upright; only positions
transform. Hexes are a fixed `MAP.HEX = 46` px, so the world is about 1540 × 1310 stage px
(`MAP.bounds`) and never fits the 540 × 768 map area: the map screen is a camera (see GAME).
All tiles hidden except the road (below), the start's neighbours and the boss tile.

**Terrain.** Every tile carries `terrain` (`'land' | 'shallow' | 'sea'`), `elev` (0..1: height
on land, depth on water), `coast` (land touching water) and `biome` (per act: 1 `cellar`
damp stone, 2 `foundry` ash with lava pools in place of sea, 3 `vault` ice and open water;
same rules, different look). Generation is seeded from the layout rng: two octaves of value
noise, sea level at the water percentile (`MAP.WATER = 0.28`, the finished map lands at
20-40% water, ~30% on average), two majority-smoothing passes, the start and boss with their
neighbours forced to land, a guaranteed land route start -> boss (cheapest walk that hugs
land, raised where it crosses water), then islands trimmed or carved to the wanted count
(2-4 on the 16 × 22 world, 1 on 10 × 7, none under 60 tiles, which stay dry) and one ford
per island: the shortest sea crossing to the mainland becomes `shallow`. `M.islands` and
`M.water` record the result; `MAP.islandsOf(M)` lists the island tile keys, largest first.
`generate({water: 0})` gives an all-land map (the legacy geometry tests use it).

- Sea holds no content, is never `known`, cannot be revealed, brushed or walked; paths never
  cross it (`pathToReveal`, `walkCost`, brushes skip sea cells).
- A ford (`shallow`) costs `MAP.SHALLOW_COST = 2` ink to reveal and 2 ink to wade
  (`revealCost` / `moveCost`); `canReveal`, `canMove`, `reachable`, `revealable` all check the
  ink. Land is 1 to reveal, free to walk. `pathToReveal` is a bucket Dijkstra over those
  costs; `pathCost(M, path)` is what a painted path spends and what `revealPath` charges.
- Islands get the best content first: all towers but one (one always stays on the mainland),
  a treasure, an elite, half the time a shop. Spread rules are relaxed there. Every land hex
  is reachable from the start through land and fords.

**The road.** The player can always reach the boss without spending a drop of ink: at
generate the guaranteed land route from the start to the boss becomes a lit road (`tile.road`,
`tile.revealed`, `M.road = [[q, r], ...]` in walking order from the start to the boss,
`MAP.isRoad(tile)`). It is carved after the content is placed (`carveRoad`): a land-only
Dijkstra over the mainland with a seeded wobble per tile and a toll on elites and towers, routed
start -> rest -> shop -> boss where the rest and the shop are the mainland ones with the least
detour that the road really passes within one hex of (a stop walled into a corner is skipped for
the next candidate). Bends are then added into the widest column gap, first one side of the axis
then the other, reaching further each round, until the road runs `MAP.ROAD_MEANDER = [1.15, 1.6]`
times the straight hex distance; a bend that changes nothing or makes it too long is dropped, and a
stop is dropped when the stops alone push it past the range. The road never repeats a tile, never
crosses water and never passes through the boss. Its tiles keep whatever content they rolled
(fights, events, a shop...): walking the road is still a run, and ink is for everything off it
(islands, towers, the rests and forges the road does not touch). The road is drawn as a worn
ochre track between its hexes over a lighter plate (`RENDER.mapRoad`, `st.road` in `RENDER.hex`),
`progress()` counts it as charted, and it survives the save round trip; a save from before the
road loads with `M.road = []` and plays as before (the ink rescue is the last resort there).

**Click to travel.** Tapping any lit hex the player can reach through lit hexes starts an
auto-walk (`GAME.startWalk`, `S.walk = { path, i, t, from, done }`): the first step is taken at
once (a tap on a neighbour is the old one-step move), the rest every `GAME.WALK_STEP = 0.28` s,
the crawler easing between hex centres (`GAME.walkXY`, drawn by `RENDER.crawler`, the portrait
riding along), the camera following, a step sfx per hex. Each step calls `MAP.move` then
`enterTile`; a step onto anything that resolves (any type but empty/start that is not `done`, or
a ford) ends the walk there and drops the rest of the path; a ford on the way is paid when stepped
on (2 ink) and one the player cannot pay stops the walk in front of it with a toast; a tap during
the walk stops it at the current hex. The path comes from `MAP.walkPath(M, q, r)`: Dijkstra over
lit non-sea tiles, never through the boss, cheapest by ink first (a ford is `SHALLOW_COST`), then
by steps, then skirting content that still resolves (a walk to a far rest does not blunder into
a fight), then keeping to the road. Painting a hidden path (second tap) also walks it, stopping
at the first thing that resolves. The walk is never saved; `toMap()` clears it.

**Landmarks.** Hidden tiles of type shop, rest, forge, elite, treasure, boss and tower are
`known` from the start: the fog shows their icon as a dim ink sketch with a dashed rim, so
the player can see what is worth spending ink on. Fights, gems, ink pots, events, brushes
and empties stay a faint `?`. Hidden fords show a `2`. Known tiles are still not walkable
until revealed.

**Towers.** 2 per act (3 on most world maps), never next to each other. Island towers first;
the mainland tower sits off the start-boss axis on the top or bottom row (offset columns
3..cols-3) when the land allows it, else anywhere at least two rows off the axis. Entering a
tower starts an elite-tier fight (the act's `tower` encounter pool when DATA has one, else its
`elite` pool); winning pays a relic through the treasure screen plus a bonus rolled at
generate (`content.tower.bonus`): `{k:'ink', n:2}`, `{k:'brush', id}`, `{k:'claw', u: upgradeId}`
or `{k:'gold', n:60}`.

**Path paint.** Tapping a hidden hex that does not touch the lit area previews the cheapest
hidden path to it (Dijkstra from every lit tile, the road included, never through the boss or
the sea, fords count double) with its ink cost on the tile; tapping it again paints the whole
path for that cost and the crawler walks it, or a toast says how much ink is missing. Tapping
anywhere else clears the preview. Hidden hexes next to the light keep the one-tap reveal. The
start-to-boss axis is drawn as a faint dotted line with chevrons that shows through the fog; the
current hex has a breathing gold rim, walkable hexes a thick pulsing cyan rim.

**Ink economy (world size).** `DATA.ECONOMY` stays the source: startInk 10 per act, ink tiles
give 2 and sit at 10% of the land (`DIST.ink`), a won normal fight drops 1 ink half the time,
elites 2, towers 2 (`TOWER_INK`). `MAP.INK_PER_ACT_HINT = 24` is the ink a sensible route
through one act should find; the balance pass reasons from it. The ink rescue (GAME) is the
last resort: with the road lit it never fires for a player who can walk to the boss without
wading; otherwise (an island with a spent ford, an old save) it pays the shortfall for the
cheapest useful step, so a player stranded with a lit or hidden ford gets the 2 it needs.

```js
MAP.generate({act, rng, cols: 16, rows: 22, ink, brushes, water: 0.28, islands}) -> M    // cols clamps to >= 9, rows to >= 3
M = { act, biome, cols, rows, tiles: { 'q,r': { q, r, type, terrain, elev, coast, biome, revealed, visited, known, road, content } },
      start: {q,r}, boss: {q,r}, pos: {q,r}, ink, brushes: [ids], revealedCount, islands, water, road: [[q,r], ...] }
tile.type: 'empty'|'fight'|'elite'|'treasure'|'gem'|'ink'|'brush'|'event'|'shop'|'rest'|'boss'|'start'|'forge' (item upgrade)|'tower'
tile.content: { enc?: [ids], gold?, ink?, brush?, event?, tower?: { bonus }, ... } rolled at generate ({} on water)
Distribution per act (share of the placeable land): fight 28%, empty 16%, gem 10%, ink 10% (min 4), event 8%, treasure 4% (min 2), brush 4% (min 2), shop 4% (min 3), rest 5% (min 3), forge 3% (min 2), elite 3% (min 2, never adjacent to start or boss), tower 3.5% (min 2, max 3). Elites/fights get harder with distance from start (content.diff = 0..1 by column).
MAP.HEX = 46  MAP.WATER = 0.28  MAP.SHALLOW_COST = 2  MAP.INK_PER_ACT_HINT = 24  MAP.TERRAINS  MAP.BIOMES {1:'cellar',2:'foundry',3:'vault'}  MAP.DIRS
MAP.key(q, r) MAP.neighbors(M, q, r) -> [[q,r]] (in-bounds only)
MAP.isLandmark(tile) -> bool     // shop, rest, forge, elite, treasure, boss, tower
MAP.isRoad(tile) -> bool         // on the lit start-to-boss road   MAP.ROAD_MEANDER = [1.15, 1.6]  MAP.ROAD_TOLL {elite, tower}
MAP.biomeOf(act) -> biome        MAP.islandsOf(M) -> [[tileKeys], ...] largest first
MAP.revealCost(tile) -> 1 | 2 | Infinity   MAP.moveCost(tile) -> 0 | 2 | Infinity   MAP.pathCost(M, path) -> ink
MAP.canReveal(M, q, r) -> bool   // hidden, in bounds, not sea, adjacent to a revealed tile, ink >= revealCost
MAP.reveal(M, q, r) -> tile|null // spends revealCost
MAP.pathToReveal(M, q, r) -> [[q,r], ...]  // cheapest hidden path from the lit area to (q,r), in reveal order, ending on it; never through the boss or sea; [] when revealed, adjacent to the light, sea, the boss or unreachable
MAP.revealPath(M, path) -> tiles[]|null    // reveals the whole path for pathCost ink; null (nothing spent) when short on ink or the chain is broken
MAP.size(M, w, h, orient='h', max?) -> {size, ox, oy}  // fit with a MAP.FIT_MARGIN px margin; 'v' fits the transposed extents; max caps the hex size
MAP.bounds(M, size, orient) -> {w, h, ox, oy}          // the world box at a fixed hex size: hex (q,r) at toPixel + (ox, oy) lies in 0..w x 0..h
MAP.brush(M, brushId, q, r) -> tiles[]  // reveals the brush cells (no ink cost, consumes the brush, skips sea), target must be a hidden non-sea tile adjacent to revealed area
MAP.canMove(M, q, r) -> bool     // revealed, not sea, adjacent to pos, ink >= moveCost
MAP.move(M, q, r) -> tile        // sets pos, marks visited, spends moveCost
MAP.walkCost(M, from, to, {any, land, ink}) -> ink | -1   // least ink to walk there (fords 2 each); any ignores the fog, land allows land only
MAP.walkPath(M, q, r) -> [[q,r], ...] | null   // click-to-travel steps after pos, ending on (q, r): lit tiles only, never through the boss, cheapest by ink, then steps, then skirting unvisited content, then the road; null for pos, hidden, sea, cut off
MAP.pathExists(M, from, to, opts) -> bool   // walkCost >= 0, and <= opts.ink when given
MAP.toPixel(q, r, size, orient='h') -> {x, y}   // pointy-top axial to pixel, (0,0) at (size, size); 'v' transposes to (y, -x)
MAP.fromPixel(x, y, size, orient='h') -> {q, r}  // with cube rounding; inverse for either orientation
MAP.hexCorners(x, y, size, orient='h') -> [{x,y} x6]  // pointy-top, or flat-top (turned 30 degrees) for 'v'
MAP.progress(M) -> {revealed, total, pct}   // total leaves out the sea; the road counts as charted
MAP.serialize(M) / MAP.deserialize(o)       // old saves without terrain load as dry land, without a road as M.road = []
```
Tests (`tests/clawspire_map.test.mjs`): generation counts/minimums for 200 seeds (10 × 7 with terrain)
and 100 seeds of the 16 × 22 world (water 20-40%, 2-4 islands with a tower and a treasure, a mainland
tower, fords, ink at 10% of the land), the road (lit, all land, start to boss, no tile twice, meander
1.15..1.6 on the world, past a rest and a shop, boss walkable for 0 ink at generate, save round trip,
old saves without one), walkPath (lit only, cheapest by ink, exact hex distance when all is lit,
skirting unvisited content, road preferred), land route start -> boss, start neighbourhood land, water empty
and unknown, coast flags, every land hex reachable through fords, landmarks known exactly on their
types, reveal/wade costs on fords, pathToReveal cheapest by ink (checked against an independent
Dijkstra) and never over the sea, revealPath spends exactly pathCost, brushes skip the sea, bounds(),
move rules, pixel<->hex round trip, serialize round trip with terrain and old-save defaults.

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
GAME.screen // 'title'|'chars'|'map'|'fight'|'reward'|'shop'|'event'|'rest'|'forge'|'treasure'|'parts'|'gameover'|'win'|'help'|'collection'
GAME.newRun(charId, seed?) GAME.toMap() GAME.enterTile(tile) GAME.startFight(enemyIds, tier) GAME.endFight(result)
GAME.dropClaw() GAME.steer(x) GAME.endTurn() GAME.playDelivered(bodies)
GAME.save() GAME.load() GAME.meta (unlocks, bests, stats; key 'clawspire_meta'), run key 'clawspire_run'
GAME.update(dt) GAME.draw() GAME.loop()
GAME.headless   // true when no canvas ctx; update() then skips drawing but still steps physics
GAME.cam        // map camera {x, y, zoom}: world point under the centre of the 540 x 768 map area (y 172..940), zoom 0.6..1.4; not saved
GAME.hexToStage(q, r) / GAME.stageToHex(x, y)   // through the camera
GAME.lookAt(q, r, ease) GAME.locate() GAME.wheel(x, y, deltaY) GAME.bossArrow() -> {x, y, a, dist} | null
```
Map screen: `S.cam` is a camera over `MAP.bounds`. Pointer down + move past 8 px drags
(pans; the view centre is clamped to the map, so the start on the bottom edge still centres); a lift without a drag taps (reveal adjacent,
preview + paint far, walk to lit, fords at 2 ink); two fingers pinch-zoom about their midpoint;
the mouse wheel zooms about the cursor. Entering the map snaps the camera to the player
(`toMap` on a new or loaded map), a move eases it there, the head's locate button (`◎`)
recentres, and when the boss hex is off screen a pink chevron on the edge of the map area
points at it. Drawing is culled to the hexes in view in two passes (ground, then coast /
fog / icons / states) from a per-map paint cache (`mapPaint`: world position, ground colour,
coast edge mask, hash seed per tile), so a frame allocates nothing per tile.
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
- Gold: 10-25 per fight, items 40-120, relics 120-220, remove 60. Claw upgrade costs (50-160) are kept in data but nothing sells them: shops stock items, a relic, remove and sell; rest stops heal 30% or upgrade an item; the act transition after a boss (acts 1 and 2) shows "The Prize Master's spare parts" (1 of 3 unmaxed claw upgrades) before the boss relic; towers keep their claw bonus.
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
