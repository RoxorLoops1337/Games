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
  effects, hex maps sunk in darkness that you light with bulbs and tools, Monster
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
  `js/map.js`, `js/audio.js`, `js/render.js`, `js/intro.js`, `js/game.js`. Each
  file declares ONE top-level `const` namespace (`U`, `ART`, `PHYS`, `DATA`,
  `COMBAT`, `MAP`, `AUDIO`, `RENDER`, `INTRO`, `GAME`) and may use every
  namespace loaded before it.
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
  type: 'classic',  // the claw type: classic | tri | scoop | hand | magnet | hook (see "Claw types")
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
  kw?: ['poison', ...]                              // extra archetype chips (most are derived, see Builds and synergies)
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
`cleanse` (remove player debuffs), `lifesteal {v}`, `random {v, min, max}` (dmg between), `poisonAll`,
`blockPer {v, per}`, `pay {v}` (spend run gold; broke stops the rest), `again` (replay the previous item),
`copy {tag?}`. `per` (dmgPer / blockPer, `DATA.PER_KINDS`): `block, junk, metal, grabsUsed, poison, burn,
small, streak, gold` (see Builds and synergies).
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
(enemy: block persists), `enrage` (str +v every turn), `armor` (flat dmg reduction), `streak` (player: the
grab streak, a display counter COMBAT sets, see Builds and synergies).

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
`freezeItem` (encase a random bin item in an ice block for the fight), `summon {id}`, `tilt` (gravity tilt for a turn), `charge {v}` (big telegraphed attack next turn), `escape`,
and the monsters pass (see Enemies): `gulp {n, like?}`, `bomb {v, fuse}`, `corrode {n}`, `jam {v}`, `eggs {n, hatch, turns}`.
Optional enemy fields: `enrage: {name, text, str?, pattern?} | false` (phase two), `digest` (turns), `noAffix`,
`taunt` (the versus card's line) and `sig: {id, name, sign, shout, text, first, every, ...}` (a boss signature, see Bosses).
At least **26 enemies**: act 1 six normal + 2 elites + 1 boss; act 2 the same; act 3 the same; plus
the final boss `prizemaster`. Art keys: `rat, slime, bat, gremlin, mimic, spider, goblin, hoard,
imp, clockwork, golem, furnace, magnet, ironjaw, wraith, yeti, frostmage, icemimic, prizemaster,
mushroom, knight, wisp, crab, drone, tinker, cultist, raccoon, goat, magpie`.

```js
DATA.ENCOUNTERS[act] = { normal: [[ids...], ...], elite: [[ids]], boss: [[ids]] }   // >=6 normal, 2 elite, 1 boss per act
DATA.RELICS[id] = { id, name, icon, rarity:'c'|'u'|'r'|'boss'|'event', text,
  mods?: { grabs, width, grip, speed, prongs, rubber, magnet, maxhp, gold, ink, startBlock, startStr },
  hooks?: { onFightStart(F), onTurnStart(F), onTurnEnd(F), onPlay(F, inst, def), onGrab(F, n /*delivered count*/), onDmgDealt(F, e, amt), onKill(F, e), onHurt(F, amt),
            onStatus(F, unit, s, v), onBlock(F, amt), onHeal(F, amt), onJunk(F, n, insts), onCombo(F, combo, defs), onJackpot(F, n), onShatter(F, inst, def), onGold(F, amt) } // return nothing; mutate F via COMBAT helpers
  rules?: { poisonKeep, blockKeep, shatter, glassBreak, amp: {tag: n}, comboTwice, echo },   // DATA.RELIC_RULES, rare build payoffs
  kw: ['poison', ...],   // archetype chips (DATA.ARCHETYPES ids, may be empty)
  proc?: 'SHORT LABEL'   // the text of the automatic proc event
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
DATA.TOOLS[id] = { id, name, icon, text, kind: 'line'|'ring'|'patch' }   // flare, lantern, kite; MAP does the geometry by kind. DATA.BRUSHES === DATA.TOOLS (old name)
DATA.TERMS = { ink: 'bulb', inkPlural: 'bulbs', brush: 'tool', brushPlural: 'tools' }   // the player-facing words; fx kinds and run fields keep 'ink' / 'brush'
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
DATA.rewardItems(rng, act, char, n=3, run?) -> [ids]   // no duplicates, rarity weighted by act; run -> build pull
DATA.pickRelic(rng, pool, run?) -> id    // rng.pick(pool), plus the build pull when a run is given
DATA.keywords(def, max=3) -> [{id, label, icon, color}]   DATA.kwIds(def)   DATA.ARCHETYPES   DATA.investment(run)
DATA.COMBOS   DATA.combosFor(defs) -> [combo]   DATA.COMBO_MAX   DATA.BUILD_PULL
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
COMBAT.grabDone(F, n) -> events   // streak, grab combos, onJackpot, onGrab; clears F.grab
COMBAT.rulesOf(relicIds) -> {rules, src}   COMBAT.gold(F)   COMBAT.gainGold(F, v)   COMBAT.gainMaxHp(F, v)
COMBAT.addTemp(F, id, n)   COMBAT.copy(F, tag?)   COMBAT.comboFx(F, combo)   COMBAT.emit(F, ev)
// F also carries: grab {insts, defs}, streak, rules, ruleSrc, gold0, combos {id: n}, stats.combos / shattered / spent
```
Event objects (renderer/game consume these; keep this list exact):
`{t:'dmg', who:'p'|'e', idx, amt, blocked, crit?}`, `{t:'block', who, idx, amt}`, `{t:'heal', who, idx, amt}`,
`{t:'status', who, idx, s, v}`, `{t:'die', idx}`, `{t:'summon', idx}`, `{t:'intent', idx}`,
`{t:'play', inst, def, target}`, `{t:'refill', items}`, `{t:'binShake'}`, `{t:'binGrease', turns}`,
`{t:'binFog', turns}`, `{t:'binJunk', items:[inst]}`, `{t:'binSteal', inst}`, `{t:'binFreeze', inst}`,
`{t:'binTilt', dir:-1|1}`, `{t:'binPurge', insts}`, `{t:'binCopy', inst}`, `{t:'turn', n}`, `{t:'over', result}`,
`{t:'text', who, idx, str}` (floating text like "MISS", "FROZEN"), `{t:'grab', v}`,
`{t:'proc', src, id, name, icon, color, text, who:'player'|'enemy', idx}`, `{t:'combo', id, name, text, color, n, tier}`
(see Builds and synergies), and the monsters pass (see Enemies): `{t:'binEat', inst, idx, kind}`,
`{t:'binReturn', insts, idx, why:'hiccup'|'burst'}`, `{t:'binDigest', inst, idx, k:'digest'|'boom'|'drink'|'snack'|'escape'}`,
`{t:'binBomb', inst, idx}`, `{t:'binBoom', inst}`, `{t:'binEggs', items, idx}`, `{t:'binHatch', inst}`,
`{t:'binRust', inst, idx}`, `{t:'binJam', idx}`, `{t:'enrage', idx, name, text}`, and the boss signatures (see Bosses):
`{t:'boss', k:'spill'|'lean'|'heat'|'sear'|'cool'|'ice'|'thaw'|'rig'|'final', idx, ...}`
(`items` / `insts` / `part` / `dir` / `stage` / `name` / `text` / `v` by kind).
COMBAT also has `sigNext(e)`, `sigInfo(e)`, `crackIce(F, heavy)`, `breakIce(F)`, `unrig(F)`.

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

A hex world sunk in darkness. The Clawspire is a dead arcade: the fog is the dark, and the
player lights it. Axial coordinates `(q, r)`, pointy-top hexes, `cols × rows` rectangle
(offset rows), **16 × 22 by default (352 tiles)**. The generator is landscape: start at the
left middle, boss at the right middle, difficulty by column. The game draws it as a
**portrait climb** with `orient: 'v'`: a pure display transform `(x, y) -> (y, -x)` that
puts the start at the bottom middle and the boss at the top middle and turns every hex
flat-top. Icons, labels, the bulb pill and the axis chevrons stay upright; only positions
transform. Hexes are a fixed `MAP.HEX = 46` px, so the world is about 1540 × 1310 stage px
(`MAP.bounds`) and never fits the 540 × 768 map area: the map screen is a camera (see GAME).
All tiles dark except the road (below), the start's ring (its vision) and the boss tile.

**Words.** The field names kept their old spelling to limit churn: `M.ink` / `run.ink` is
the **bulbs**, `M.brushes` / `run.brushes` the **tools**, `tile.revealed` means lit, the fx
kind `ink` gives bulbs and `brush` a tool, `ECONOMY.startInk` is the bulbs per act. Every
player-facing word comes from `DATA.TERMS` (`{ ink: 'bulb', inkPlural: 'bulbs', brush: 'tool',
brushPlural: 'tools' }`): the HUD stat is BULBS (a marquee bulb drawn by `RENDER.bulb`), a
tile that gives them is "a box of bulbs", the rescue toast says a bulb flickers on, events say
bulbs. No copy in DATA says ink (the data suite greps for it).

**Terrain.** Every tile carries `terrain` (`'land' | 'shallow' | 'sea'`), `ground` (the
tileset: `grass, forest, dirt, sand, hill, mountain` on land, `shallow` / `sea` on water),
`elev` (0..1: height on land by rank, squared so hills are the upper fifth; depth on water),
`coast` (land touching water) and `biome` (per act: 1 `cellar` a mossy overgrown arcade,
natural greens and browns under a purple tint; 2 `foundry` ash grass, cinder forest, lava for
sea, obsidian mountains; 3 `vault` snow grass, pine forest, ice water, white peaks; same
rules, different look). Generation is seeded from the layout rng: two octaves of value noise,
sea level at the water percentile (`MAP.WATER = 0.28`, the finished map lands at 20-40%
water, ~30% on average), two majority-smoothing passes, the start and boss with their
neighbours forced to land, a guaranteed land route start -> boss (cheapest walk that hugs
land, raised where it crosses water), then islands trimmed or carved to the wanted count
(2-4 on the 16 × 22 world, 1 on 10 × 7, none under 60 tiles, which stay dry) and one ford per
island: the shortest sea crossing to the mainland becomes `shallow`. Then the height is
re-spread by rank, the **mountains** are read off the top of it (`MOUNTAIN_ELEV = 0.86`,
`MOUNTAIN_TARGET = 0.06`, `MOUNTAIN_MAX = 0.08` of the land; mainland only, never protected
ground, never beside a ford, only where the mainland stays in one piece without them), and the
ground is assigned: `hill` at `HILL_ELEV = 0.62`, `sand` on coast under `SAND_ELEV = 0.03`,
the flat rest `forest` / `dirt` / `grass` by rank of a second noise (`FOREST_SHARE = 0.3`,
`DIRT_SHARE = 0.15`). Over 100 world seeds the land is about 37% grass, 20% forest, 10%
dirt, 10% sand, 16% hill, 5.5% mountain. `M.islands`, `M.water` and `M.seed` record the
result; `MAP.islandsOf(M)` lists the island tile keys, largest first. `generate({water: 0})`
gives a flat all-land map (no hills, no mountains; the legacy geometry tests use it).

- Sea holds no content, is never walked and can never be lit by hand; it *can* be seen
  (rings and views light it) and then draws as water instead of dark. Lit sea is not charted:
  `revealedCount` and `progress()` leave it out.
- A mountain is land nobody walks (`isMountain`, `isLand` is false for it): no content, no
  road, `revealCost` and `moveCost` are `Infinity`, `pathToReveal` / `walkPath` go around it,
  flares stop at it. Rings, kites, lanterns and views light it (it is seen). Every content tile
  stays reachable around the mountains (the tests prove it).
- A ford (`shallow`) costs `MAP.SHALLOW_COST = 2` bulbs to light by hand and 2 to wade
  (`revealCost` / `moveCost`); `canReveal`, `canMove`, `reachable`, `revealable` all check the
  bulbs. Land is 1 to light, free to walk. `pathToReveal` is a bucket Dijkstra over those
  costs; `pathCost(M, path)` is what "light the way" spends and what `revealPath` charges.
- Islands get the best content first: a treasure, an elite, half the time a shop (spread rules
  are relaxed there). At most one tower stands on an island. Every land hex is reachable from
  the start through land and fords.

**Light.** Five ways the dark goes:
- *A bulb.* Tapping a dark hex next to the lit area lights it for `revealCost` (1, a ford 2).
  Tapping a far one previews the cheapest chain there (`pathToReveal`, from every foothold:
  lit tiles, the boss only once visited) with its bulb cost; a second tap lights the whole way
  (`revealPath`) and the crawler walks it.
- *Vision.* Entering a hex lights the ring around it for free: `VISION.low = 1` ring on lowland,
  `VISION.hill = 2` on a hill (`elev >= HILL_ELEV`); the start counts as lowland. `MAP.move`
  applies it (`vision(M, q, r)`, `visionRadius(tile)`), so walking reveals as you go and the
  road's surroundings open up as it is walked. Sea and mountains in the ring are seen too.
- *Tools* (`useTool(M, id, q, r, dir)`, no bulbs, one copy spent; `toolCells` for the preview,
  `canTool`): a **flare** fires from the player's hex in one of the six directions
  (`dirTo(M, from, q, r)` picks the nearest by angle to a tapped hex) and lights up to
  `FLARE_RANGE = 5` hexes in a straight line, stopping at the edge, a mountain or open water
  (neither lit); a ford is lit and stops it too. A **lantern** hangs on any lit hex and lights
  its ring of six plus `LANTERN_OUTER = 0.5` of the second ring's land, picked by a hash of
  `M.seed` and the cells (deterministic per map). A **kite** flies over any dark non-sea hex
  within `KITE_RANGE = 6` of the player and lights it and its ring. Tools come from tool tiles
  (a random tool), events, tower bonuses and sometimes a beaten elite
  (`ECONOMY.eliteToolChance`). Ids `flare, lantern, kite` (`TOOL_IDS`, `DATA.TOOLS`, alias
  `DATA.BRUSHES`); old brush ids (`line3, splash, drip, comb`) load as a lantern
  (`normalizeTool`, `OLD_BRUSHES`). The old names `brush / canBrush / brushCells / brushIds`
  alias the tool functions.
- *The view from a tower* (`towerView(M, q, r)`): a taken tower lights everything within
  `TOWER_VIEW = 4` (land, sea, all): 45-61 hexes.
- *The road* is lit from the first moment.

**The road.** The player can always reach the boss without spending a bulb: at generate
the guaranteed land route from the start to the boss becomes a lit road (`tile.road`,
`tile.revealed`, `M.road = [[q, r], ...]` in walking order from the start to the boss,
`MAP.isRoad(tile)`). It is carved after the content is placed (`carveRoad`): a land-only
Dijkstra over the mainland with a seeded wobble per tile and a toll on elites, never over a
mountain and never through a tower or its doorstep (those are barred; only when that walls the
boss in are they merely dear), routed start -> rest -> shop -> boss where the rest and the shop
are the pairing among the three of each with the least detour that the road really passes both
of and stays under the ceiling with (else the rest alone, else the shop alone). Bends are then
added into the widest column gap, first one side of the axis then the other, reaching further
each round, until the road runs `MAP.ROAD_MEANDER = [1.15, 1.6]` times the straight hex
distance; a bend that changes nothing or makes it too long is dropped, and the stop whose loss
helps most is dropped while the stops push it past the range. The road never repeats a tile,
never crosses water and never passes through the boss. Its tiles keep whatever content they
rolled (fights, events, a shop...): walking the road is still a run, and bulbs are for what
lies off it. The road is drawn as a worn ochre track between its hexes over the ground and the
pickups (`RENDER.mapRoad`, a little translucent), under the player marker; `progress()` counts
it as charted, and it survives the save round trip; a save from before the road loads with
`M.road = []` and plays as before (the bulb rescue is the last resort there).

**Click to travel.** Tapping any lit hex the player can reach through lit hexes starts an
auto-walk (`GAME.startWalk`, `S.walk = { path, i, t, from, done }`): the first step is taken at
once (a tap on a neighbour is the old one-step move), the rest every `GAME.WALK_STEP = 0.28` s,
the crawler easing between hex centres (`GAME.walkXY`, drawn by `RENDER.crawler`, the portrait
riding along), the camera following, a step sfx per hex. Each step calls `MAP.move` (which
applies the vision) then `enterTile`; a step onto anything that resolves (any type but
empty/start that is not `done`, or a ford) ends the walk there and drops the rest of the path;
a ford on the way is paid when stepped on (2 bulbs) and one the player cannot pay stops the
walk in front of it with a toast; a tap during the walk stops it at the current hex. The path
comes from `MAP.walkPath(M, q, r)`: Dijkstra over lit walkable tiles, never through the boss,
cheapest by bulbs first (a ford is `SHALLOW_COST`), then by steps, then skirting content that
still resolves (a walk to a far rest does not blunder into a fight), then keeping to the road.
Lighting the way (second tap) also walks it, stopping at the first thing that resolves. The
walk is never saved; `toMap()` clears it.

**Landmarks.** Dark tiles of type shop, rest, forge, elite, treasure, boss and tower are
`known` from the start: the dark shows their icon as a dim silhouette with a dashed rim, so
the player can see what is worth lighting. Fights, gems, boxes of bulbs, events, tools and
empties stay a faint `?`. Dark fords show a `2`. Known tiles are still not walkable until lit.

**Lookout towers.** 3 per map (`DIST.tower` capped at `MAXS.tower = 3`, min 2), placed
before the other content by a greedy farthest-first search (`placeTowers`) over empty land on
high ground (`elev >= TOWER_ELEV = 0.5`), pairwise at least `TOWER_GAP = 6` apart and 6 from the
start and the boss, each maximising the hexes its radius-`TOWER_VIEW` view would light that no
earlier tower's view (nor the start's ring, nor the boss) lights, and adding at least
`TOWER_VIEW_MIN = 30` of them, so each tower covers a region of its own; at most one on an
island; a tower and its ring must leave the mainland joined start to boss without pushing the
shortest land walk past the road's ceiling (the road never touches a tower). Maps too small
for the rules relax them in steps (the end gap to 4, then a gap of 3 and 15 hexes, then any
land that is not adjacent). Over 100 world seeds: 3 towers on every map, 54 island towers in
all, own views 35-61 hexes (median 56), the three views together cover about 170 of the 328
dark hexes, one seed in a hundred needs the second pass (a tower 5 from the boss). Entering a
tower starts an elite-tier fight (the act's `tower` encounter pool when DATA has one, else its
`elite` pool); winning lights the view (`towerView`), pays a relic through the treasure screen
plus a bonus rolled at generate (`content.tower.bonus`): `{k:'ink', n:2}` (2 bulbs,
`ECONOMY.towerInk`), `{k:'brush', id}` (a tool), `{k:'claw', u: upgradeId}` or
`{k:'gold', n:60}`.

**Tileset and pickups (RENDER).** `terrainHex` paints the ground per `ground` and biome
(`BIOME_PAL[biome]`: a base and a deco colour per ground, water, coast, foam, a tint and an
accent): grass with tufts and the odd flower, forest with two or three trees (round canopies
in the cellar, dead spikes with an ember in the foundry, snow-lined pines in the vault), dirt
with pebbles and cracks, sand with ripples and a shell, hills with contour arcs and hatching, a
mountain as two peaks with a lit face and a cap, a ford with stepping stones, sea with drifting
ripples (lava with a hot core, an ice floe in the vault), every land hex with the biome's
accent (moss, ash flecks, snow specks) so every ground draws differently in every biome
(`groundOf(tile)` reads a ground off old tiles). `terrainFill(biome, terrain, elev, ground)`
gives the base colour. Activities are drawn by `hex` as pickups: the icon on top of the ground
with a small shadow (fight, elite, treasure, gem, a box of bulbs, a tool lantern, event, shop,
rest, forge, tower, boss); once `tile.done` (resolved, taken, cleared, used) the icon is gone
and only the terrain remains (no check mark, no plate); the boss icon stays until beaten. Dark
tiles are darkness (`RENDER.DARK` deep purple, 0.92 alpha, 0.76 next to the light) with the
landmark silhouettes; lit hexes next to the dark get a warm glow rim drawn after every hex
(`RENDER.lightRim(ctx, x, y, size, mask, flat, t)`, GAME computes the mask of edges facing
dark per frame). Draw order in `GAME.drawMap`: ground, coast, darkness and pickups, glow rims,
the road, the axis, the crawler and portrait, the previews.

**Previews.** Tapping a dark hex that does not touch the lit area previews the cheapest chain
to it (Dijkstra from every lit tile, the road included, never through the boss, the sea or a
mountain, fords count double) with its bulb cost in a pill under the target (a bulb icon, pink
when short; `RENDER.mapPath(ctx, pts, size, { cost, ink, label, unit, color, t })`); tapping it
again lights the whole way and the crawler walks it, or a toast says how many bulbs are
missing. An armed flare previews its line (`S.preview = { tool, dir, cells }`, an orange line
and wash, the six possible lines marked with a gold dashed rim); a tap the same way fires it,
a tap another way re-aims it. An armed lantern marks every lit hex, a kite every dark hex in
range. Tapping anywhere else clears the preview. Dark hexes next to the light keep the one-tap
reveal. The start-to-boss axis is drawn as a faint dotted line with chevrons that shows through
the dark; the current hex has a breathing gold rim, walkable hexes a thick pulsing cyan rim.

**Bulb economy (world size).** `DATA.ECONOMY` stays the source: `startInk` 10 per act, boxes
of bulbs give 2 and sit at 10% of the land (`DIST.ink`), a won normal fight drops 1 bulb half
the time, elites 2, towers 2 (`towerInk`) plus the view, elites hand over a tool
`eliteToolChance` of the time. `MAP.INK_PER_ACT_HINT = 24` is the bulbs a sensible route
through one act should find; the balance pass reasons from it. The bulb rescue (GAME
`inkRescue`) is the last resort: with the road lit it never fires for a player who can walk to
the boss without wading; otherwise (an island with a spent ford, an old save) it pays the
shortfall for the cheapest useful step, so a player stranded with a lit or dark ford gets the
2 it needs.

```js
MAP.generate({act, rng, cols: 16, rows: 22, ink, brushes, water: 0.28, islands}) -> M    // cols clamps to >= 9, rows to >= 3; ink = bulbs, brushes = tools
M = { act, biome, cols, rows, seed, tiles: { 'q,r': { q, r, type, terrain, ground, elev, coast, biome, revealed, visited, known, road, done?, content } },
      start: {q,r}, boss: {q,r}, pos: {q,r}, ink, brushes: [toolIds], revealedCount, islands, water, road: [[q,r], ...] }
tile.type: 'empty'|'fight'|'elite'|'treasure'|'gem'|'ink' (a box of bulbs)|'brush' (a tool)|'event'|'shop'|'rest'|'boss'|'start'|'forge' (item upgrade)|'tower'
tile.ground: 'grass'|'forest'|'dirt'|'sand'|'hill'|'mountain'|'shallow'|'sea'   (MAP.GROUNDS)
tile.content: { enc?: [ids], gold?, ink?, brush?: toolId, event?, tower?: { bonus }, ... } rolled at generate ({} on water and mountains)
Distribution per act (share of the placeable land): fight 28%, empty 16%, gem 10%, ink 10% (min 4), event 8%, treasure 4% (min 2), brush 4% (min 2), shop 4% (min 3), rest 5% (min 3), forge 3% (min 2), elite 3% (min 2, never adjacent to start or boss), tower 3.5% (min 2, max 3). Elites/fights get harder with distance from start (content.diff = 0..1 by column).
MAP.HEX = 46  MAP.WATER = 0.28  MAP.SHALLOW_COST = 2  MAP.INK_PER_ACT_HINT = 24  MAP.TERRAINS  MAP.GROUNDS  MAP.BIOMES {1:'cellar',2:'foundry',3:'vault'}  MAP.DIRS
MAP.HILL_ELEV = 0.62  MAP.TOWER_ELEV = 0.5  MAP.SAND_ELEV = 0.03  MAP.MOUNTAIN_ELEV = 0.86  MAP.MOUNTAIN_MAX = 0.08  MAP.VISION {low:1, hill:2}
MAP.TOWER_VIEW = 4  MAP.TOWER_GAP = 6  MAP.TOWER_VIEW_MIN = 30  MAP.TOOL_IDS  MAP.FALLBACK_TOOLS  MAP.OLD_BRUSHES  MAP.FLARE_RANGE = 5  MAP.KITE_RANGE = 6  MAP.LANTERN_OUTER = 0.5
MAP.key(q, r) MAP.neighbors(M, q, r) -> [[q,r]] (in-bounds only)   MAP.hexDist(aq, ar, bq, br)   MAP.disc(M, q, r, radius) -> [[q,r]] within radius
MAP.isLand(t) / isWater(t) / isMountain(t)   MAP.isLandmark(tile) -> bool     // shop, rest, forge, elite, treasure, boss, tower
MAP.isRoad(tile) -> bool         // on the lit start-to-boss road   MAP.ROAD_MEANDER = [1.15, 1.6]  MAP.ROAD_TOLL {elite, tower}
MAP.biomeOf(act) -> biome        MAP.islandsOf(M) -> [[tileKeys], ...] largest first
MAP.revealCost(tile) -> 1 | 2 | Infinity   MAP.moveCost(tile) -> 0 | 2 | Infinity   MAP.pathCost(M, path) -> bulbs
MAP.canReveal(M, q, r) -> bool   // dark, in bounds, lightable by hand, adjacent to a lit tile, bulbs >= revealCost
MAP.reveal(M, q, r) -> tile|null // spends revealCost
MAP.pathToReveal(M, q, r) -> [[q,r], ...]  // cheapest dark chain from the lit area to (q,r), in lighting order, ending on it; never through the boss, sea or a mountain; [] when lit, adjacent to the light, unlightable or unreachable
MAP.revealPath(M, path) -> tiles[]|null    // lights the whole path for pathCost bulbs; null (nothing spent) when short or the chain is broken
MAP.visionRadius(tile) -> 1 | 2   MAP.vision(M, q, r) -> tiles[]   MAP.lightArea(M, q, r, radius) -> tiles[]   MAP.towerView(M, q, r) -> tiles[]   // the tiles that were dark
MAP.toolIds() -> ids   MAP.normalizeTool(id)   MAP.toolKind(id) -> 'line'|'ring'|'patch'|null   MAP.dirTo(M, from, q, r) -> 0..5 | -1
MAP.flareCells(M, dir, from?) / lanternCells(M, q, r) / kiteCells(M, q, r) -> [[q,r]]   MAP.toolCells(M, id, q, r, dir?) -> [[q,r]] ([] when unusable there)
MAP.canTool(M, id, q, r, dir?) -> bool   MAP.useTool(M, id, q, r, dir?) -> tiles[]|null   // lights the cells, spends one copy (old ids count)
MAP.brush / canBrush / brushCells / brushIds  // the old names, aliases of useTool / canTool / toolCells / toolIds
MAP.size(M, w, h, orient='h', max?) -> {size, ox, oy}  // fit with a MAP.FIT_MARGIN px margin; 'v' fits the transposed extents; max caps the hex size
MAP.bounds(M, size, orient) -> {w, h, ox, oy}          // the world box at a fixed hex size: hex (q,r) at toPixel + (ox, oy) lies in 0..w x 0..h
MAP.canMove(M, q, r) -> bool     // lit, walkable, adjacent to pos, bulbs >= moveCost
MAP.move(M, q, r) -> tile        // sets pos, marks visited, spends moveCost, applies the vision
MAP.walkCost(M, from, to, {any, land, ink}) -> bulbs | -1   // least bulbs to walk there (fords 2 each); any ignores the dark, land allows land only
MAP.walkPath(M, q, r) -> [[q,r], ...] | null   // click-to-travel steps after pos, ending on (q, r): lit walkable tiles only, never through the boss, cheapest by bulbs, then steps, then skirting unvisited content, then the road; null for pos, dark, sea, a mountain, cut off
MAP.pathExists(M, from, to, opts) -> bool   // walkCost >= 0, and <= opts.ink when given
MAP.toPixel(q, r, size, orient='h') -> {x, y}   // pointy-top axial to pixel, (0,0) at (size, size); 'v' transposes to (y, -x)
MAP.fromPixel(x, y, size, orient='h') -> {q, r}  // with cube rounding; inverse for either orientation
MAP.hexCorners(x, y, size, orient='h') -> [{x,y} x6]  // pointy-top, or flat-top (turned 30 degrees) for 'v'
MAP.progress(M) -> {revealed, total, pct}   // charted hexes: total and revealed leave out the sea; the road counts
MAP.serialize(M) / MAP.deserialize(o)       // old saves: no terrain -> flat land, no ground -> read off height and coast, no road -> M.road = [], brush ids -> lantern, no seed -> 0
```
Tests (`tests/clawspire_map.test.mjs`): generation counts/minimums for 200 seeds (10 × 7 with terrain)
and 100 seeds of the 16 × 22 world (water 20-40%, 2-4 islands with a treasure and an elite, a mainland
tower, at most one island tower, fords, bulb boxes at 10% of the land, mountains 3-8%), the ground types
(every tile typed, water grounds match, hills at HILL_ELEV, sand on low coast, mountains bare, impassable,
unlightable by hand, off the islands, under MOUNTAIN_MAX, every content tile reachable around them), the
towers (three on the world, pairwise >= TOWER_GAP, on high ground, each view >= TOWER_VIEW_MIN hexes of its
own, never touched by the road), the road (lit, all land, start to boss, no tile twice, meander 1.15..1.6 on
the world, past a rest and a shop or a justified miss, boss walkable for 0 bulbs at generate, save round
trip, old saves without one), walkPath (lit only, cheapest by bulbs, exact hex distance when all is lit,
skirting unvisited content, road preferred), the tools (the flare's line in every direction and its stops at
a mountain, sea, a ford and the edge; the lantern's ring and seeded half ring, land only; the kite's range and
patch, sea seen not charted; refusals; the old brush names and ids), vision on move (one ring on lowland, two
on a hill, the start as lowland, sea seen), the tower view (exactly the radius 4 disc), land route start ->
boss, water empty and unknown, coast flags, every land hex reachable through fords, landmarks known exactly
on their types, reveal/wade costs on fords, pathToReveal cheapest by bulbs (checked against an independent
Dijkstra) and never over the sea or a mountain, revealPath spends exactly pathCost, bounds(), move rules,
pixel<->hex round trip, serialize round trip with terrain, ground and seed, old-save defaults and tool mapping.

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
RENDER.mapPath(ctx, pts, size, {cost, ink, label, unit, color, t})   // light-the-way preview line, bulb cost pill (a bulb icon), label; color and no cost for a flare
RENDER.terrainHex / terrainFill(biome, terrain, elev, ground) / groundOf(tile) / lightRim(ctx, x, y, size, mask, flat, t) / bulb(ctx, x, y, r, t, on)   // the tileset, the glow rim, the marquee bulb
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

### `js/intro.js` -- `INTRO` (the 10 second cinematic)

The intro is drawn with the game's own art on the game canvas and is a pure
function of time, so the same frame can be played in the browser or captured
one by one for the video (`clawspire/intro.mp4`, poster `intro_poster.jpg`,
1080 x 1920, 60 fps, H.264 + AAC, 10.0 s; a `intro.webm` copy when it was cheap).

```js
INTRO.prepare() -> P            // once: runs the physics scatter (24 items, a real claw drop with an outward burst on the
                                // touch, recorded per 1/240 s substep), generates the act 1 world map (seed 48) with
                                // per-tile reveal times along the road, seeds the particles. Cached.
INTRO.draw(ctx, t, w, h, opts)  // the frame at t seconds on a w x h logical stage (540 x 960 scaled); opts {tap, hint}
INTRO.play({ctx, px, headless, onDone}) -> bool   // requestAnimationFrame against performance.now, not the game loop;
                                // starts AUDIO.intro() when the audio is unlocked; holds the hero frame with TAP TO PLAY
                                // for 4 s; headless (no ctx / no rAF) it calls onDone at once and returns false
INTRO.skip() -> bool            // ends the run and calls onDone (any tap or key while GAME.screen === 'intro')
INTRO.active, INTRO.time, INTRO.DUR (10), INTRO.SHOTS, INTRO.CUTS, INTRO.LETTERS, INTRO.TAGLINE
```

Shots: 0-1 the drop (a dying marquee bulb, the rail chases on with a bass hit,
the claw slams in with streaks and shake), 1-3 the scatter (the pile bursts at
x0.32 slow motion behind a glass reflection wipe, the claw closes on the
shield and the sword and races up), 3-5.5 the fight (four cuts with whip
transitions: the lunge with speed lines, the sword hit with a "12", the
BURN / POISON / FREEZE stamps and the goblin freezing solid, pink then cyan
flashes with a "7"), 5.5-7.5 the climb (the camera racing up the road, ink
splashes painting hexes open, landing on the boss skull), 7.5-10 the name
(the letters slam in 0.08 s apart in chrome over a pink under-glow, the claw
rises behind and opens, the tagline types, a fanfare hit at 9.6 s). Camera
pushes, whips and shakes are ctx transforms; letterbox bars over the montage;
light grain and vignette; the hits get a pink / cyan chromatic split through
an offscreen silhouette. `RENDER.fx` is not used (its rng is stateful): every
particle is seeded at prepare and positioned from t.

Audio: `AUDIO.intro(t0?, {force, level})` schedules the whole 10 s stinger on
the AudioContext clock through its own bus (bass hit, motor whir, the
slow-motion clatter, hit / hitBig, status blips, a riser through the climb, a
chord stab plus 18 steps of the fight tune under the logo, the fanfare at
9.6 s) and returns `{t0, end, stop()}`; deterministic (its rng is reseeded).
`AUDIO.renderIntroWav(seconds) -> Promise<ArrayBuffer>` runs the same schedule
on an `OfflineAudioContext` (44.1 kHz stereo) and encodes a 16-bit WAV.

Game hooks (`game.js`): the first launch plays it (`S.meta.introSeen`, saved
after `onDone`), the title has an INTRO button (`GAME.playIntro`), the screen
`'intro'` hides the overlays, `draw()` leaves the canvas to the intro, a
pointer down or a key skips, `?intro=render` disables the autoplay for the
capture script. Tests: `tests/clawspire_intro.test.mjs` (+ blocks in the
audio and game suites).

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
preview + light far, walk to lit, fords at 2 bulbs, an armed tool uses the tap); two fingers pinch-zoom about their midpoint;
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

## Builds and synergies

The owners asked for cooler combos: items and relics that click together, and
many different builds. The design goal is **distinct, discoverable builds that
snowball and that change what you aim the claw at**, with bridges between them
so hybrids are strong too.

### Design principles

- **Every archetype changes the aim.** A poison run fishes for flasks, a junk
  run grabs the rocks it used to avoid, a swarm run scoops marble clusters, a
  jackpot run takes the safe single grab to keep its streak alive, a greed run
  keeps its gold instead of spending it.
- **Commons start a build, rares define it.** A common or uncommon relic nudges
  (a little Block, a chip of damage); each archetype has at least one rare or
  legendary payoff that bends a rule (poison stops wearing off, Block stops
  fading, combos fire twice).
- **Grab combos are for everyone.** Named recipes fire when one grab delivers
  the right set, whatever the build. Relics amplify specific combos.
- **Bridges.** Most new cards carry two archetypes (a food that burns, a glass
  shield, a metal ring with thorns), and the hooks read each other: Bottle
  Deposit turns shatters into gold, Money Bags turns gold into damage.
- **Readable.** Every relic trigger emits a `proc` event with a short label,
  every combo a `combo` event with its name and one line of text, and every
  item and relic card can show its archetype chips (`DATA.keywords`).

### Archetypes (`DATA.ARCHETYPES`, `DATA.keywords(def)`)

`DATA.ARCHETYPES[id] = { label, icon, color, blurb }`. `DATA.keywords(def, max = 3)`
returns up to `max` chips `{ id, label, icon, color }` for an item or relic def
(pass `Infinity` for all). Items derive them from tags and fx (below), plus an
optional explicit `def.kw`; relics list theirs in `kw`. `DATA.kwIds(def)` is the
uncapped id list.

| id | chip | reads from | payoff (rare / legendary) | key pieces |
| --- | --- | --- | --- | --- |
| poison | ☠ Poison | poison fx, poisonAll, dmgPer poison | Festering Jar (poison never wears off) | Venom Gland, Contagion, Plague Orb, Rot Catalyst, Venom Dart |
| burn | 🔥 Pyro | burn fx on foes, dmgPer burn | Powder Keg (10+ Burn explodes) | Flint Striker, Bellows, Firebomb, Inferno Scroll, Ghost Pepper |
| frost | ❄ Frost | chill / freeze on foes | Permafrost Core (SHATTER: +50% on Frozen) | Snow Globe, Cold Snap, Ice Pick, Blizzard Orb, Frozen Heart |
| fortress | 🛡 Fortress | Block 4+, blockPer, dmgPer block, Thorns, Bulwark | Castle Walls (Block never fades), Aegis (l) | Battering Ram, Thorn Mail, Thorn Ring, Glass Shield |
| brawler | 💪 Brawler | Strength, multi-hit | Gym Membership (+1 on every Strength gain) | Protein Bar, Trophy Rack, Sweatband, Flail, Rage Potion |
| metal | 🧲 Magnet | metal tag, dmgPer metal | Dynamo (metal in the cabinet zaps each turn), Family Anvil (l) | Fridge Magnet, Horseshoe, Tuning Fork, Magnetite, Iron Nut |
| junk | ♻ Scrap | junk fx, purge, per junk | Junkyard King (grab out junk: +1 Strength), Junk Cannon (r) | Recycling Bin, Dumpster Lid, Scrap Shield, Pet Rock |
| jackpot | 🎰 Jackpot | extra grabs, per grabsUsed / streak | Encore Machine (combos fire twice) | Jackpot Bell, Prize Counter, Winning Streak, Arcade Token |
| swarm | 🎱 Swarm | small tag, bags, per small | Pocket Dimension (small items +2 / +1) | Marble Pouch, Beehive, Gumball Jar, Bucket of Bolts |
| glass | 💎 Glass | glass tag | Glass Cannon (glass doubles, always shatters) | Sharp Shards, Bottle Deposit, Crystal Shard, Glass Shield |
| feast | 🍗 Feast | food, heal, lifesteal, max HP | Feast Table (food: +1 Max HP, 3 a fight) | Blood Bag, Bat Wing, Vampire Dentures, Blood Orange, Vampire Fang |
| greed | 🪙 Greed | gold fx, pay, per gold | Money Bags (gold gained hits ALL), Pay to Win (r) | Piggy Bank, Golden Ticket, Bribe, Golden Idol |
| echo | ✨ Echo | magic tag, copy, again | Echo Chamber (every 3rd magic item resolves twice), Deja Vu (r) | Wizard Hat, Crystal Focus, Arcane Tome |

Every archetype has at least 4 items and 3 relics carrying its keyword (the data
suite pins it). Bridges worth knowing: Ghost Pepper (burn + feast), Frozen Heart
(frost + fortress), Glass Shield (glass + fortress), Thorn Ring (fortress +
metal), Bottle Deposit (glass + greed), Sweatband (brawler + fortress), Junkyard
King (junk + brawler), Tuning Fork (metal + jackpot), iceblocks (junk that
shatters, so glass relics love act 3).

### Grab combos (`DATA.COMBOS`, `DATA.combosFor(defs)`)

The game already calls `COMBAT.useGrab` before a drop, `COMBAT.play` for every
delivered item and `COMBAT.grabDone(F, n)` when the grab settles. COMBAT keeps
the grab buffer itself: `useGrab` opens `F.grab = { insts, defs }`, `play`
appends (frozen items that only thawed do not count), `grabDone` evaluates the
recipes on the buffer, then fires `onJackpot` (3+ items) and `onGrab`, then
clears it. No game.js change.

A recipe is `{ id, name, text, color, tier: 1..3, family, sup?, once?, target, fx, match(defs), example, miss }`:
`match` is a pure function over the delivered item defs; `fx` runs like an item
played by the player (Strength counts, targets `target`); `family` keeps only
the highest tier of a family; `sup` lists recipes a bigger one replaces;
`once: 'turn'` fires at most once a turn (the ones that give grabs). At most
`DATA.COMBO_MAX` (3) recipes fire per grab, biggest tier first. `example` and
`miss` are item id lists the tests (and the help page) use.

| tier | combo | recipe | effect |
| --- | --- | --- | --- |
| 1 | Crossed Blades | 2 different weapons | strike once more for 4 |
| 1 | Shield Wall | 2 different Block items (4+) | +4 Block |
| 1 | Heavy Hitters | 2 heavy items | 6 damage |
| 1 | Steam Burst | a Pyro item + a Frost item | 4 damage to ALL |
| 1 | Toxic Fumes | a Poison item + a Pyro item | 2 Poison to ALL |
| 1 | Frostbite | a Poison item + a Frost item | 1 Chill and 1 Poison to ALL |
| 1 | Molotov | a glass item + a Pyro item | 2 Burn to ALL |
| 1 | Picnic | 2 food | heal 3 |
| 1 | Pocket Change | 2 small | 3 damage to a random enemy |
| 1 | Resonance | 2 magic | copy a random bin item |
| 1 | Sharp Edges | a glass item + a weapon | 4 damage |
| 1 | Scrap Shot | junk + a weapon | 8 damage |
| 1 | Pay Day | 2 Greed items | +6 gold |
| 2 | Magnetized | 3 metal | 5 damage to ALL, +5 Block |
| 2 | Handful | 3 small | +1 grab (once a turn) |
| 2 | Banquet | 3 food | heal 6, 2 Regen |
| 2 | Chandelier Crash | 3 glass | 8 damage to ALL |
| 2 | Landslide | 2 junk | 10 damage to ALL |
| 2 | Hat Trick | any 3 items | 4 damage to ALL |
| 3 | Armory | 3 weapons | strike 4 more times for 4 |
| 3 | Iron Curtain | 3 Block items | +12 Block, 2 Thorns |
| 3 | Elemental Storm | Pyro + Frost + Poison items | 8 to ALL, 3 Poison, 3 Burn, 1 Chill to ALL |
| 3 | Three of a Kind | 3 of the same item | 10 to ALL, +5 gold |
| 3 | Mega Jackpot | 4+ items | 12 to ALL, +1 grab (once a turn) |

Two-role recipes need two different delivered items (Liquid Fire alone is not
a Molotov). Tier 1 is deliberately small: combos are free for every build, so
they are a reward for a good grab, not a stat line. The two pair recipes a
starting bin would hit every turn (Sword + Sword, Shield + Shield) ask for
*different* items instead, which also makes variety something to aim for;
Three of a Kind is the prize for identical ones. Balance bot (starting bins,
act 1 normals): knight 4.9 -> 4.5 turns, alchemist 5.2 -> 4.7, rogue
6.9 -> 6.2; combos fire on about 15% of grabs. With `COMBO_MAX` 0 the bot
reproduces the pre-combo numbers exactly.

### Streaks

`F.streak` counts consecutive grabs that delivered at least one item (across
turns, reset by an empty grab). It shows as the player status `streak` (🎯, a
display counter COMBAT sets directly, it never decays and never emits status
events), feeds `dmgPer {per:'streak'}` (Arcade Token) and Winning Streak.

### New relic hooks

On top of the eight originals (`DATA.RELIC_HOOKS`):
`onStatus(F, unit, s, v)` a status gained v stacks (any unit; freeze from chill
included), `onBlock(F, amt)` the player gained Block, `onHeal(F, amt)` the player
healed, `onJunk(F, n, insts)` junk was added to the bin, `onCombo(F, combo, defs)`
a grab combo fired, `onJackpot(F, n)` one grab delivered 3+ items,
`onShatter(F, inst, def)` a glass item exhausted (iceblocks included),
`onGold(F, amt)` gold was gained in the fight. A hook never re-enters itself,
so an onStatus relic adding poison does not trigger itself again.

### Relic rules (`DATA.RELIC_RULES`)

Build-defining rares bend engine rules through a data field `rules` that
COMBAT merges into `F.rules` at `newFight` (numbers add, `amp` merges per tag):
`poisonKeep` (enemy Poison does not decay), `blockKeep` (player Block does not
fade), `shatter` (+x damage on Frozen enemies), `glassBreak` (glass items double
their numbers and always shatter), `amp {tag: n}` (items with the tag get +n
damage / Block / healing and +ceil(n/2) status stacks), `comboTwice` (combos
resolve twice), `echo` (every nth magic item resolves twice). `F.ruleSrc[rule]`
names the relic so the proc event can credit it.

### New fx and counters

`blockPer {v, per}` (Block per count), `pay {v}` (spend v gold of the run's gold,
`COMBAT.gold(F)` = run gold at fight start + gains; broke = BROKE and the rest
of the item fizzles), `again` (resolve the previous item played this fight
again, never another `again` item), `copy {tag?}` (copy a random bin item,
optionally of a tag). `dmgPer` / `blockPer` count `block, junk, metal,
grabsUsed` plus `poison` and `burn` (the target's stacks), `small` (small items in
the cabinet), `streak` and `gold` (per 10 gold carried).

### Events (the juice agent renders these)

- `{ t: 'proc', src: 'relic'|'item'|'combo', id, name, icon, color, text, who: 'player'|'enemy', idx }`:
  a relic or item synergy triggered. COMBAT emits one automatically in front of
  the events of any relic hook call that did something visible, labelled with the
  relic's `proc` text (or its name); hooks with a dynamic label (`SPREAD 4`,
  `KABOOM 12`) emit their own. Rules emit them where they bite (`FESTER`,
  `SHATTER`, `WALLS HOLD`, `ECHO`, `ENCORE`). Items emit `src:'item'` for
  `SHATTER` and `AGAIN`.
- `{ t: 'combo', id, name, text, color, n, tier }`: a named grab combo fired
  (before its effects resolve).

### Build pull (reward bias)

`DATA.investment(run) -> {archetype: score}` counts keywords over the bin
(starters weigh 0.5) and the relics (3 each). `DATA.rewardItems(rng, act, char, n, run?)`
and `DATA.pickRelic(rng, pool, run?)`: when `run` is given, `DATA.BUILD_PULL`
(25%) of the time one slot is redrawn from an archetype the run already invests
in (score 3+, weighted by score), same rarity. Without `run` both behave exactly
as before (same rng draws).

## Balance targets (v1)

`DATA.DIFFICULTY = { hp, dmg, ramp }` multiplies every enemy's hit points and
every attack/charge value on top of the bands below (combat.js makeEnemy). It
is the one dial to turn when the claw's yield changes. It ships at hp 2.0,
dmg 1.8; the owner tunes it by hand from there.

`ramp = { every, hp, dmg, max }` is the hidden escalation: `run.fights` counts
every fight started (normal, elite, boss). After every `every` fights (3) the
enemies of the next fight gain +hp/+dmg per step (12%/12%), up to `max` (8)
steps, so a run that fights everything meets act 3 at roughly double strength
while a run that picks its fights does not. The player never sees the counter.
`F.fights` carries it into the fight.

Enemies with teeth: crab (2 Thorns), tin knight (3), brass golem (2 + armor),
ironjaw (4) and glass wraith (3) punish weapon spam; every act has at least one
poisoner (spider, spore cap, spiderling; oil slick fumes; rime cap, cultist
blight) and the tinker gnome flicks burn.


- Character HP 70 (knight 80, alchemist 60, rogue 65). Act 1 normal enemies 12-30 hp,
  hit for 4-8. Act 2 ×1.7, act 3 ×2.6. Elites ×2.2 hp of a normal; bosses 90/170/280 hp.
- A turn is 3 grabs; a good grab lands 1 item, a great one 2. Average item ≈ 6 dmg or 5 block.
  A typical act 1 fight lasts 4-6 turns. Whole run ≈ 25-35 minutes.
- Gold: 10-25 per fight, items 40-120, relics 120-220, remove 60. Claw upgrade costs (50-160) are kept in data but nothing sells them: shops stock items, a relic, remove and sell; rest stops heal 30% or upgrade an item; the act transition after a boss (acts 1 and 2) shows "The Prize Master's spare parts" (1 of 3 unmaxed claw upgrades) before the boss relic; towers keep their claw bonus.
- Bulbs: 10 at run start, +2 from bulb boxes, +2 from towers, +2 from elites (fights 50%). Vision lights rings for free, towers light radius 4. ~35% of the map is revealed in a
  normal run; revealing more = more fights = more loot but more risk.

## Juice (game feel layer)

Everything here is presentation: nothing touches COMBAT state, saves or the
physics outcome, and every piece degrades to a no-op headless. The settings'
**Shake off** is the reduced-motion switch (`RENDER.fx.reduced`, plus
`html.calm` for the CSS): shake to a fifth, no camera roll or kick, preset
bursts at a third, flashes capped at 0.12, slow motion gentler and shorter,
the heavy CSS loops (card deal, relic rays, low hp pulse, transitions) cut.
`prefers-reduced-motion` also disables the CSS loops.

**Systems (render.js `RENDER.fx`, fixed pools, no per-frame allocation).**
- Particles: 400 live max (the oldest recycles), kinds dot, square, spark
  (velocity streak, additive), star, coin (spinning), confetti, bubble, plus,
  smoke (glow sprite puff), shard, ember (additive), snow. Additive kinds draw
  in one composite switch. `fx.emit(preset, x, y, {n, col, power, dir})`
  presets: hit, crit, sparks, dust, smoke, poof, coins, confetti, poison,
  burn, frost, shock, blood, heal, block, shatter, death, glint, trailDot.
- Text (48): the classic rising text, `fx.num` physics damage numbers (pop
  with an overshoot, fly up, fall with gravity, sized by the number, crits
  bigger with a pink rim and a wobble), `fx.badge(x, y, icon, text, col)`
  icon pills. Rings (40, optional delay), slashes (16: a crescent, or
  `{claw: true}` three straight rakes), flyers (48: an arc to a point with a
  capped streak and an arrival callback, e.g. coins into the gold counter).
- Camera: trauma shake (`fx.shake(amt)` adds amt/20 trauma, offset = trauma^2
  x 16 px of smooth noise plus a small roll, trauma decays 1.4/s), `fx.kick`
  a directional nudge that springs back, `fx.offset()` -> one reused
  `{x, y, r}`. `fx.flash`, `fx.vignette` (an edge pulse) and `fx.hold` (a
  standing edge glow the game sets per frame) draw from one cached sprite.
- Time (game.js): `slowmo(k, secs)` scales the game dt on real time; toasts,
  banners, combos and the outro keep real time. Hit stop (`FS.hitStop`)
  freezes physics only, never while the claw carries.
- Counters (game.js `rollTo`): HP, gold (in a fight `COMBAT.gold(F)`) and bulbs roll toward their value
  with a tick; a rise floats "+n" into the stat and bumps it; the change is
  held while the top bar is hidden so it plays when it shows. Headless snaps.

**Per area.**
- Claw: cable bows on a spring driven by the carriage's acceleration, hub
  squash / stretch on drop, touch, close, lift and release, a dust puff and a
  downward camera kick when the palm meets the pile, metallic sparks + a ring
  where the prongs clamp, speed lines behind a fast hub, trails on carried
  items.
- Items: landing dust by impact x mass (3 a frame max), slip streaks with a
  whoosh, rarity glow (uncommon faint cyan, rare gold, legendary pulsing
  pink), a sweeping glint on rare and legendary items.
- Delivery: each delivered item is thrown from the chute in an arc to its
  target (the target enemy, the pack for all/random, the player row for
  self) and COMBAT.play waits for the landing (`state().queue` counts the
  items in flight); the landing bursts in the item's element. DOUBLE: coin
  fountain, cabinet party lights, marquee. JACKPOT: confetti from both top
  corners, a big coin fountain, a gold ring, rainbow slot-machine chase
  lights and the JACKPOT! marquee (`cabinetBack` st.party / st.marquee).
- Hits: a crushing hit (>= 20% of max hp, or `crit`) gets a gold number,
  CRUSH!, a longer hit stop, the crit sting and a white flash; every hit
  flashes the sprite white, knocks it back, shakes its hp bar, drains a ghost
  chunk (white then pink) after a hold, rings, shakes by damage; weapons slash.
  Blocked damage throws shield chips. Status items and statuses burst in
  their element (poison bubbles, burn embers, frost shards, shock sparks).
- Enemies: `RENDER.enemyAura` draws the standing looks (strength aura,
  thorns ring, shield sheen behind; chill motes, freeze glints, poison
  bubbles, burn embers, bleed drips, stun stars, pulsing V / W marks in front),
  `st.chilled` tints, the status chip that changed bounces (`statusPips` pop
  map). Attacks: the beat before a hit on the player the actor winds up (lean
  back, tremble, red tint, `st.windup`), then snaps forward (`lungeCurve`).
  Intent bubbles bob; a charged intent pulses. Enemies pop in at fight start.
- The player: hp stat has a drain bar with a ghost, shakes on a hit, rings
  on a block, glows on block / heal, shimmers while block holds; a big hit
  rakes three red claw marks across the arena, every hit pulses a red
  vignette; under 30% hp the edge glows with a heartbeat and a lub-dub.
- Death: squash, flash, particles, two rings, coins that fly to the gold
  counter (more for elites and bosses). The last kill: slow motion, a gold
  ring, the victory sting, then the outro: the arena holds 1.5 s with the
  VICTORY sweep and confetti before the reward (a tap skips; a save during it
  is the reward screen, never the fight again). The public `endFight` stays
  immediate.
- Events from the synergy layer: `{t:'proc', src, id, name, icon, color,
  text, who, idx}` pops the relic in the HUD bar (by id, a gold flash), flies
  a star from it and raises a badge from the player or the enemy; the same
  relic firing again within 0.7 s stacks on its badge ("x3") and a proc
  only holds the queue 0.04 s, so a relic-heavy grab stays quick;
  `{t:'combo', id, name, text, color, n, tier}` queues a stacked DOM banner
  (#combo, name fitted to the stage, text under it), tier 2 adds sparks and
  shake, tier 3 a white flash, pink / cyan / gold chromatic rings, confetti,
  a longer hit stop and slow motion; several chain one after another.
  Unknown events are ignored. `DATA.keywords(def)` chips (when it is a
  function) show on every item card, relic card, the relic reveal, the shop
  and the tray chip.
- Screens: an iris opens onto every fight, a diagonal neon wipe between the
  map and tile screens, a red bleed into game over; banners slide / skew /
  sweep per kind and replay on every call; buttons squash, glow on hover;
  reward cards deal in with a flip (a paper flick each), tilt on hover, the
  pick flies to the Bin; rare cards pulse, legendary cards carry a rainbow
  sheen; the relic reveal spins rays behind a floating relic that flies to
  the relic bar; shop buys arc coins into the card and slam a SOLD stamp.
- Map: light blooms ripple out from their source (a tap, a tool, a tower):
  each new hex stays dark for 0.075 s per hex of distance, then fades in
  with a gold ring and a rising chime; a taken tower sweeps a beam; the boss
  hex breathes red rings; footsteps kick up dust; pickups vanish in a poof
  with a badge (gem coins fly to the gold counter); ambient motes drift per
  biome (fireflies, embers, snow; 30 on the map, 16 over the arena).
- Audio (procedural, `AUDIO.sfx`): proc, combo (opts.tier 1..3), crit,
  shatter, tick, cardFlip, relic, footstep, bloom, heartbeat, whoosh, stamp,
  victory, all through the sfx bus with the voice cap, throttles and mute.

Tests: render (presets, caps, numbers, flyers and callbacks, trauma, kick,
reduced, auras, the new hooks balanced), game (proc, combo queue, keyword
chips, unknown events, throws, crits and ghosts, low hp, the outro and its
save, blooms, reduced, tap to skip), audio (the new names, combo tiers,
throttles).

## Cabinet materials

Every item in the Rig has a physical personality, derived from its tags (plus
its art and fx for the elements), so a new item behaves right with no extra
data. Presentation first, but some of it is physics and some of it touches
the fight (glass, bombs, ice, the Golden Prize, the Lucky Claw).

**Derivation (`PHYS.materialOf(def)`, pure, cached by id).** Traits:
`metal, glass, heavy, food, magic, light, small` from the tags; `liquid` =
`potion` tag; `fuse` = art `bomb`; `frost` = art `snowball`/`iceblock`, art
`iceshard` (unless magic), a `chill` status fx or a `frost` tag; `fire` =
art `torch`/`slag`, a `burn` status fx or a `fire` tag; `poison` = a
`poison` status or `poisonAll`; `rubber` = a circle that is not metal,
glass, a bomb or ice with restitution >= 0.3 (or light and >= 0.2). The lead
material (`id`, used for the label and sound) is the first of
`bomb, frost, potion, glass, rubber, food, magic, heavy, metal, light`, else
`stuff`. `PHYS.MATERIALS` holds the base profiles.

**Physics (`PHYS.applyMaterial(b, m)`, body fields, all default to the
old behaviour).** `b.gs` gravity scale (magic 0.62, heavy magic 0.8, light
0.92), `b.drag` extra linear damping per second (magic 0.6, light 0.8),
`b.slick` multiplier on wall and item-item friction, never on the claw's
grip (frost 0.3), `b.bounceV` the approach speed restitution starts at
(rubber 35, else `PH.bounceV`) and a restitution floor (rubber 0.62).
`PHYS.blast(W, x, y, r, power, except)` throws every body within r outward
and up (a bomb), `PHYS.hop(W, x, y, r, v, except)` makes bodies near a heavy
landing hop (never one the claw holds), `PHYS.scaleShape(shape, k)` shrinks
a shape (melting ice). All deterministic; the hard clamps keep everything in.

**Reactions (`game.js`, `MAT` dials).** Each frame each body's impact is its
change of velocity less gravity's share (`matBody`); at most 4 reactions a
frame and one per body per 0.12 s. A body is *armed* `MAT.armT` (1.2 s)
after it spawns, so a refill shower never cracks or lights anything.
- metal: sparks where it hit (the direction of the push) and a clank above
  `MAT.sparkV`; the magnet claw draws crackling field lines to metal in reach
  and the tugged items flicker cyan.
- heavy (armed, above `MAT.thudV`): a thud, dust, a downward camera kick and
  shake, neighbours hop (`PHYS.hop`), stacked metal rattles.
- glass (armed, above `MAT.crackV`): CRACK. A cracked item shows crack lines
  and, when played, plays for +50% (half its dmg / block / heal / lifesteal /
  status again, through `COMBAT.damage/heal/status`) and then goes to
  `F.exhausted` for the fight. A second crack in the bin shatters it: gone for
  the fight, leaving `MAT.shardN` glass shard bodies (`FS.debris`, max 12,
  physical fillers with no inst; the chute sweeps them out). Softer landings
  tinkle.
- bomb (a real bomb, not a monster's junk `fusebomb`, which keeps COMBAT's own
  `inst.fuse`): an armed landing above `MAT.fuseV` lights the fuse for
  `MAT.fuseTurns` (2) turns: a sparkling fuse tip, a countdown badge over the
  pile (red and pulsing on the last turn), beeps, a toast. At the start of
  each player turn it burns down; at 0 it goes off in the bin: `PHYS.blast`,
  KABOOM, a flash and a shockwave, and every enemy takes `MAT.blastDmg` (+2
  per act after the first, +2 upgraded, `COMBAT.damage` with no source, fixed).
  The bomb goes to `F.used`. Grabbing it puts the fuse out; ice douses it.
- rubber: squash on landing, a boing, stretched along its flight.
- food: a wobbling squish and crumbs.
- potion: the liquid stays level in the world (the art's bulb is redrawn with
  a tilted surface) and sloshes on a sideways jolt; bubbles, a slosh.
- magic: floats down, hovers a few px above where it rests, three orbiting
  sparkles, a glow pulse, chimes.
- frost: slides, leaves a frost trail on the floor, and melts at each turn
  start (x `MAT.meltK`, never below `MAT.meltMin`; the body is rebuilt
  smaller). A junk ice block melts away for good under `MAT.iceGone`.
- fire and poison: ambient embers and bubbles (one ambient particle a frame,
  round robin over the bin).
- two items knocking together above `MAT.starV`: impact stars and a tiny kick.

Fight-only state lives in `FS.mst[uid]` (`crack`, `melt`, `lit`), never on
COMBAT's insts or in the save; old saves are untouched.

**Cabinet toys.**
- Golden Prize: `MAT.goldenP` of fights, one bin item (its fight copy) is
  upgraded for the fight and shimmers gold (glow, glint, orbiting stars, a
  sparkle trail). Delivering it: GOLDEN PRIZE!, a fanfare, coins, confetti,
  the GOLDEN! marquee; +`MAT.goldenGold` gold if it was upgraded already.
- FREE PRIZE: a delivery the claw never touched this grab (`d.clawG !==
  FS.grabN`: shaken, blasted or knocked in) gets its own label, confetti and
  jingle.
- Lucky Claw: `MAT.luckyAfter` (2) grabs in a row that deliver make the next
  grab grip harder (+`MAT.luckyGrip`, survives a rig rebuild): flaming
  fingertips, star eyes, LUCKY CLAW!. Spent by that grab; a miss resets.
- SO CLOSE: a cargo item that slips within `MAT.closeX` of the divider while
  carrying, or that the claw let go of over the chute but ended up back in the
  bin: the label, a sad trombone, a glum claw. Once per grab.
- The claw's face (`RENDER.clawHead`): a chrome head with a visor and two LED
  eyes over the palm: blinks, looks where it travels, `focus` while dropping,
  `happy` with cargo and on a loaded return (plus a ding and an LED chase on
  the brow and the carriage lamp), `sad` on an empty lift, a slip or a near
  miss, `wow` for a golden prize or a blast, `lucky` star eyes. Parked, the
  whole claw sways on its cable.

**Render.** `RENDER.itemFx(ctx, def, x, y, angle, scale, st, layer)` draws the
material looks around `RENDER.item` (layers `back`: glows, `front`: liquid,
cracks, frost rim and drip, sparkles, the fuse spark, the magnet flicker,
`top`: the fuse countdown, drawn after the whole pile). `RENDER.shard` draws
debris. `RENDER.claw` reads `cfg.juice.{t, idle, mood, blink, look, chase,
lucky, pull, pullN}`. fx presets `crumbs` and `blast`.

**Audio.** `clank, tinkle, crack, thud, boing, squish, slosh, chime` (opts.vel
0..1.4 scales a landing), `fuse, beep, boom, groan, fanfare, ding, lucky`.

**Reduced motion.** Particles go through the presets (a third), shake and
kicks follow `fx.reduced`, the parked sway and rubber stretch are off, the
flash is capped, ambient and fuse sparks thin out.

`GAME.toys` exposes `MAT`, `mstOf`, `bodyOf`, `crack`, `lightFuse`, `explode`,
`fuseTick`, `meltTick`, `matTurn`, `soClose`, `setMood`, `luckAfterGrab` for
tests and screenshot drivers. Tests: physics (derivation, gravity scale,
slide, bounce, blast, hop, scaleShape, determinism), game (materials on the
bodies, armed cracks and shatter into shards, +50% cracked play, fuse
lighting / burning down / blast damage / junk bombs / grab to defuse, melt,
golden prize, free prize, lucky claw, near miss, moods, a real grab),
render (itemFx for every item, state and layer, shards, every mood), audio
(every material voice).

## Loot (capsules, tickets, the payout, the prize counter)

The reward layer is about anticipation and spectacle, not power (balance is
kept loose on purpose). Rolls live in `data.js` (`DATA.LOOT`, pure, seeded);
the flow and the feel live in `game.js` (the loot section); the art is
`RENDER.capsule` / `RENDER.ticket`; the sounds `capDrop, capCrack, capUpgrade,
capBurst, ticket, tally, slam, roulette, double`.

**Prize capsules** (gacha balls). Tiers `c` common grey, `u` uncommon cyan, `r`
rare pink, `l` legendary gold with a rainbow sheen (`LOOT.COLOR`, `LOOT.NAME`).
`DATA.rollCapsule(rng, src, {pity, tier})` -> `{src, tier0, ups, tier, pity}`:
`tier0` is the colour it drops in (weights per source in `LOOT.WEIGHTS`:
normal, bonus, elite, boss, treasure; a counter capsule has a fixed tier),
then each step upgrades with `LOOT.UP` (c 16%, u 11%, r 7%, chaining); `ups`
lists every tier it turns into mid-open. Pity: `run.pity` counts capsules
below rare; at `LOOT.PITY` (5) the next one is lifted to rare through `ups`,
so the guarantee plays as the "it turned pink!" moment (tag LUCKY STREAK).
`DATA.capsulePrize(rng, tier, ctx)` picks what falls out from `LOOT.PRIZES`
(item, plus item, relic, gold, bulbs, tickets, tool, claw part, max hp; an
empty pool falls back to gold); `ctx` carries the live pools (relics not
owned, claw parts not maxed, tools) and `prefer: 'relic'` (treasure).
`DATA.prizeInfo(p)` gives the card's name, text, icon and colour. The prize is
rolled when the capsule is made and saved with it, so a reload never rerolls.

Sources: an elite or a tower keeper drops one, a boss drops one (never
common), a fight with a jackpot (a triple) or a tier 3 combo adds a bonus
one, every treasure tile *is* a capsule (always a relic when one is in stock,
its rarity by tier: c -> common relic ... l -> rare or boss relic; the tile's
gold is paid on entry), and the prize counter sells them.

The ritual (`showCapsule({cap, then, gold?, bank?, rwIdx?})`, screen
`capsule`, a transparent DOM frame over a canvas scene drawn under the fx
layer): the capsule drops onto a pedestal with a bounce, rays spin behind it
(brighter per tier, a counter-spinning rainbow set for legendary), it rattles
now and then while it waits. Each tap (the whole screen, Space, or the
`Crack` entry of `GAME.choose`) shakes it harder, throws sparks and shards,
spreads glowing cracks from the seam and plays a rising snap. From the second
tap each tap reveals one of `ups`: a flash in the new colour, chromatic
rings, confetti, the riser, the title slams in anew with UPGRADE! (JACKPOT
UPGRADE! for legendary). The last tap bursts it: the halves fly apart, light
pours out, confetti from both sides, rings (a rainbow of them and slow motion
for legendary), coins for gold and tickets, the prize is paid and saved at
that instant, then the prize card pops out with Collect (the prize flies to
where it lives). Taps: 3 (plus one per extra up), 2 once the player has opened
`LOOT.FAST_AFTER` (12) capsules (meta `loot.caps`), and the drop is shorter
then too. Skip bursts it at once; a tap during the burst shows the card. A
reload before the burst restarts the ritual with the same capsule; after it
lands on the card, never a second prize.

Capsules from a fight sit on the reward screen as pulsing slots above the
cards (DOM taps, not `GAME.choose` entries, so the cards stay 0..2 and Skip 3);
the ritual returns to the reward screen. Anything unopened when the reward
screen closes goes to the bank (`run.caps`), shown as a pulsing capsule chip
on the map head (`Capsule` entry), opened oldest first, back to the map.

**Arcade tickets.** `run.tickets` (HUD stat `TIX`, id `tixTxt`, rolls like
gold). A jackpot or a combo in a fight spits `LOOT.TICKETS.jackpot` (3) /
one per combo tier from two slots on the marquee at once: they arc up,
flutter, then zip into the ticket counter one by one (tick, bump). The rest
stream out during the victory outro (held up to 2.4 s so it lands; a tap
skips). The stream is visual only: the tickets are paid once, by the reward.

**Payout** (`DATA.payout(st)` -> `{lines, gold, tix}`, Balatro's cash out).
Lines: the base (Victory / Elite down / Boss down: the old gold roll and
4 / 8 / 15 tickets), Jackpot xN (+4 gold, +3 tickets each), Combo (the name,
or Combos xN: +2 gold, +1 ticket per tier), Flawless (no damage taken, +8,
+5), Speedy / One turn KO (won by turn 2, +5, +3), Overkill N (damage past
the last hit point of a kill, from `F.stats.overkill`, N >= 5: +1 gold per 3,
+1 ticket per 5, capped 8 / 4). The lucky DOUBLE REWARD (`LOOT.DOUBLE`, 1 in
20, rolled at the fight's end) doubles both totals. The reward screen shows a
receipt: the rows tick in one by one (a register ding walking up), a
roulette strip flicks past its window and lands on x2 before the double row,
then TOTAL slams in (ka-ching, a shake, a little fountain of coins and
tickets) and only then do the capsule slots and the cards deal in. A tap or
Space finishes it; 0.3 s per row, 0.16 s once the player has seen five
(`meta.loot.payouts`); a reload shows it finished (`rw.payShown`).

**Prize counter** (inside every shop: a neon slot at the top of the shop,
its `Prize counter` entry registered last; screen `counter`). A glass case of
six prizes from `DATA.prizeShelf(rng, act, ctx)`, rolled once per shop and
saved with it: a common, an uncommon and a rare (a legendary one time in
five) capsule at 12 / 28 / 55 (110) tickets, an item by act rarity (14 / 24 /
40 / 70), +4 max hp (30), and 3 bulbs (10) or a tool (18). A buy flies ticket
stubs from the balance into the slot, stamps it WON and pays it; a capsule
opens on the spot and comes back to the counter. Too few tickets: the slot
shakes and says how to get more.

**Run highlights** (game over and win, above the stats): biggest hit (and best
overkill), best combo (with its tier as stars), jackpots (and flawless wins),
capsules opened (and the best tier), tickets won (and double rewards), gold
paid out. `F.stats.bigHit` / `F.stats.overkill` are kept by `COMBAT.damage`.

**Save shape.** Run (all optional, `lootRun` defaults them for older saves):
`tickets` 0, `pity` 0, `caps` [] (banked capsules), `loot` {bigHit, overkill,
capsOpened, tixEarned, flawless, doubles, payGold, bestCombo, bestCap}. A
reward carries `pay` (lines), `tix`, `double`, `caps`, `payShown`, `banked`;
a shop carries `counter` (the shelf). Screens `capsule` (`sd.capsule`) and
`counter` (`sd.counter`) save and reload. Meta: `loot` {caps, payouts}.
Rewards saved before this layer have no `pay` and show the plain gold tag.

Tests: data (tiers deterministic by seed, weights order, the upgrade rate,
the pity lift, boss capsules, every prize valid per tier, empty pools, the
relic preference, the shelf, payout lines and totals, DOUBLE), game (an elite
win's payout, tickets and capsule with the card indices unchanged, the tally,
cracking on the reward screen, banking and the map chip, reload before and
after the burst, treasure capsules, upgrades per tap, the pity timer, the
ticket stream paid once, the counter buy / refusal / reload / capsule, old
saves, highlights), audio (the loot sfx).

## Enemies (the monsters pass: they eat your stuff and get angry)

Inspiration: Slay the Spire (telegraphs, Looter / Mugger, phase two bosses),
Monster Train (elite affixes as badges), Peglin / Luck be a Landlord (the
board itself is the enemy's target). Readability first: every trick is
telegraphed in the intent bubble, and every item that leaves the bin is seen
leaving and is seen coming back.

**Gulp (item-eating).** `gulp {n, like}` swallows up to n bin items into
`e.belly` (max 4; never junk or an iced item). `like` is a tag it prefers,
or `'shiny'` (the rarest, metal first). What it ate matters (combat.js
`mealKind`): a bomb (art `bomb`) goes off inside it for 2x its damage (min 8)
plus its debuffs; a potion or food is drunk / eaten on the spot: its
debuffs land on the eater (BLEGH), its healing heals it double, Strength
potions buff it; those go to the used pile as if played. Held items: a
weapon lends +2 Strength, other metal +1 Armor, glass cuts it for 4 x act
every turn. They come back when the enemy **dies** (all, a burst), when the
player deals **`COMBAT.hiccupAt(e)`** (15% of max hp, min 6) damage to it in
one player turn (one item per threshold, HIC!; the green ring on the belly
bubble is the meter), or are **digested** after `DIGEST` (3) of its turns
(`F.digested`: gone for this fight only; the run's bin is never touched). An
escaping enemy takes its belly with it (`F.stolen`). Returns land in the bin
(the used pile when the cabinet is full). Users: Trash Panda, Hungry Gloop,
Prize Mimic, The Hoard (act 1), Scrap Goat, Ironjaw (act 2), Ice Mimic,
Crystal Magpie (act 3), plus anything Greedy.

**Bin tricks.** `bomb {v, fuse}` drops a Lit Bomb (junk `fusebomb`, inst
`fuse`, `boom`, `by`): grabbed out, it flies back at its thrower for 1.5x;
left alone it burns down at the end of each enemy phase (not the one it
landed in) and blows up in the cabinet for `boom` through Block. `eggs {n,
hatch, turns}` lays Spider Eggs (junk `broodegg`) that hatch into `hatch`
after `turns` rounds when there is room. `corrode {n}` rusts metal items
(`inst.rust`: their numbers are halved for the fight). `jam {v}` gives the
player `jam` (a wrench in the rail: one grab fewer that turn, never the
last). Users: Token Gremlin, Smelter, Crystal Magpie (bombs), Brood Mother
(eggs), Rust Mite (rust), Tinker Gnome and the Prize Master (jam).

**Affixes** (`DATA.AFFIXES`, `DATA.affixRoll(rng, def, act, fights)`, on
their own rng stream so a fight's other rolls stay put): Armored (+1 Armor),
Hasty (every third action twice, an attack's repeat at half size, never
after an unleash; the bubble shows x2), Vampiric (heals half
of the attack damage that gets through), Spiky (+1 Thorns, +2 in act 3), Explosive (a blast
on death that never kills), Regenerating (2% max hp a turn), Greedy (gulps on its first and
every third action; the bubble shows +). Each adds 5% max hp. Odds
(`AFFIX_ODDS`): act 1 elites 1, act 2 elites 1 + 25%, act 3 elites 1 + 50%;
normals 0 / 10% / 20% by act, bosses 0 / 20% / 40%; every hidden
escalation step adds 4% to each chance. Minions never, gulpers never Greedy.
Drawn as a column of badges beside the body and a coloured aura.

**Phase two.** Every elite and boss transforms once at 50% hp: `{t:'enrage'}`
(a banner with its name, a red flash, a roar, slow motion, a size pop into a
red-tinted, 8% bigger body with a flame crown), `+str` (def.enrage.str, else
1 in act 1 and 2 after) and sometimes a new pattern (def.enrage.pattern) from the next
pick on. `enrage: false` opts out.

**Presentation (game.js `monsterEvent`, render.js `belly`, `affixAura`,
`affixBadges`, `binMark`, `wrench`, `rageCrown`).** A swallowed body leaves
the cabinet with a pink ring and arcs (FS.arcs, `RENDER.item` along a
quadratic, the callback on an `fx.fly` flyer so it also lands headless) into
the mouth; the enemy squashes (st.chomp) and taunts (NOM / GULP / MINE! /
CHOMP). The belly bubble wobbles on the back half of the body with the items
tumbling inside, each with its digest clock. Returns stretch the enemy
(st.spit) and arc back into the bin as fresh bodies. Bombs and eggs carry a
countdown chip (a red danger pulse on a bomb's last turn); rust is an orange
cast with speckles; a jam drops a wrench onto the rail. Sounds: `gulp`,
`burp`, `roar` (plus the cabinet's `fuse` / `boom`).

Tests: combat (gulp taste, cap, hiccup, burst, digest, meals, bombs, eggs,
rust, jam, escape, every affix, phase two once, data rolls by act and
escalation, every new user fights 14 turns with every item accounted for),
data (move fields, phase two specs, affixes, act introductions), game (the
events move real bodies and draw with the stub ctx), render (the new art).

## Bosses (the boss arena: spectacle for elites and bosses, round 2)

Every elite and boss fight is an event: a versus card before it, a trick of
its own inside the machine, a finale when it falls. Presentation first, but
the signatures do touch the fight (coins, hot metal, ice, a hijacked drop).
Balance is loose on purpose. State lives in `FS.vs` / `FS.bs` (fight-only,
never saved) and on COMBAT's `F` (`heat`, `ice`, `rigged`, `lean`, `final`,
`inst.hot`), none of it in the run save.

**The versus card (game.js boss arena `vsStart / vsTick / vsSkip / vsEnd`,
`RENDER.vsCard`).** `startFight` of an `elite` / `boss` tier opens it instead
of the ELITE / BOSS banner: the crawler's portrait slides in from the left on
its colour, the enemy from the right on its own, a lightning seam between
them, VS slams from 3x with a white flash and a drum hit (`vsSlam`), the name
slams in chrome, the def's `taunt` types itself, the affix badges pop. The
title is `ELITE`, `TOWER KEEPER` (a tower), `ACT n BOSS` (hazard stripes, a
rumble shake and `rumble`, the `stingBoss` / `stingElite` music sting) or
`FINAL BOSS` (the Prize Master, also when it steps out of Glacius mid fight:
a `summon` of a boss tier plays its own card, after the mid-fight finale).
Timeline `RENDER.VS` in card seconds (`VS_DUR` boss 3.3, elite 2.3); a repeat
(`localStorage` key `clawspire_vs`, `{enemy id: times seen}`) runs it
`VS_FAST` (1.9x); reduced motion drops the slides, the flash and the rumble
and runs 1.3x. Input waits (`canSteer` / `canEndTurn` are false, the event
queue holds its beat, the HUD rows step aside); a tap or a key jumps to the
exit, a second one ends it. The fight exists before the card, so a save
under it reloads into the same seeded fight and one card (quick this time);
it can never start twice.

**Entrances, footfalls, badges.** When the card goes, an elite drops in from
above and bounces (two footfalls), a boss stomps in from the right in three
heavy strides (`enterOff`, a `stomp` each: dust at both feet, a downward
kick, a floor ring). Elites and bosses stomp when they lunge too. A crown
(boss) or a skull (elite) sits right of the hp bar (`RENDER.eliteBadge`).

**Signatures (`def.sig`, combat.js boss signatures).** One trick per boss,
on top of its move like Greedy: due on action `first` (0-based `e.acts`) and
every `every` after (0: once), or on the next action when `e.sigForce`.
`COMBAT.sigNext(e)` is the telegraph a turn ahead: the intent text adds
"then ..." (`sigInfo(e).text`), the bubble gets a pulsing ribbon, and the
cabinet hangs a warning sign on its top frame (`RENDER.bossSign`, "... NEXT
TURN", then the state while it lasts). Each fires `{t:'boss', k, idx, ...}`
(plus a shout) and its state clears as the player's next turn ends
(`bossTurnEnd`: `{k:'cool'}`, `{k:'thaw'}`, the rig comes off).
- **The Hoard, Coin Avalanche** (`spill`, first 1, every 3): 5 Hoard Coins
  (junk `hoardcoin`, temporary, `gold 2`: they clutter the bin but grabbing
  one out pays) arc from its mouth into the bin with the party lights and a
  coin cascade; 7 once enraged. Phase two: `F.lean = -1` (`{k:'lean'}`), the
  whole pile lurches toward it and a standing sideways gravity (`LEAN_G`)
  holds whenever no tilt is on; the back panel leans.
- **The Smelter, Furnace Blast** (`heat`, first 1, every 3): `F.heat`, up to
  4 real metal items turn red hot (`inst.hot`, a glow and shimmer), one Slag
  drips off the rail. Delivering a hot item still plays it, then burns the
  hand for `sig.burn` (2) through Block (`{k:'sear'}`, RED HOT!). The cabinet
  glows: a coal floor, heat haze ribbons, slag drips, hot glass edges.
- **Glacius, Deep Freeze** (`ice`, first 1, every 3, parts `lid` then
  `rail`): the chute lip ices over (a static wall segment across the chute
  mouth sloping into the bin: a prize dropped on it slides back; each
  landing `COMBAT.crackIce(F)` cracks it, the 2nd opens it, a heavy one
  smashes it at once and falls through), or the claw rail does (the carriage
  runs at `RAIL_SLOW` 0.4; a heavy prize delivered smashes it,
  `COMBAT.breakIce`). Waiting a turn thaws it. Snow drifts pile up in the
  corners freeze after freeze.
- **The Prize Master, Rigged!** (`rig`, first 1, never on its own after,
  `rephase` and `final`): once per phase (and again at the final phase) the
  bin is shuffled (every loose body swaps places) and `F.rigged` takes the
  next drop: the claw hangs on pink puppet strings and wanders toward the
  junk farthest from the chute; after `HIJACK_AUTO` (3.4 s) untouched the
  house drops it itself (a grab spent). The player wrestles it by steering
  against the pull (the claw only goes `HIJACK_GRIP` of the way to the
  finger) and releases to drop where the tug of war stands; one drop, then
  `COMBAT.unrig`. At a quarter hp after phase two, `F.final`
  (`{k:'final'}`): +1 Strength, one more rigged drop, a siren, FINAL PHASE,
  and the cabinet's neon and bulbs go red with sweeping siren beams.

**The death finale (`bossDie / finTick`, `RENDER.finale`).** An elite or
boss killed (the `die` event) blows apart instead of just falling: long slow
motion, the body held and flashing while `FIN.booms` blasts chain across it
(boss 10 over 1.1 s, elite 5 over 0.6 s, the last one the biggest), then for
a boss the whiteout, then the title card across the cabinet (BOSS DEFEATED in
chrome with rays and an epitaph, or ELITE DOWN), the `bossDown` fanfare and a
shower of coins into the gold counter and ticket stubs into the ticket
counter. The outro waits for it (`FIN.total`); the VICTORY banner stays down
under the card; a tap still skips to the reward, and a save during it is the
reward screen as before. A boss that dies mid fight (Glacius) gets the
blasts only (`mid`), holding the queue, then the next boss's card.

**Sounds (`AUDIO.sfx`).** `vsSlam, rumble, stomp, coinSpill, sizzle, drip,
freezeOver, iceBreak, hijack, shuffle, alarm, kaboom, bossDown, stingBoss,
stingElite`, through the sfx bus with gaps and ducking.

`GAME.boss` exposes `vsStart, vsSkip, shuffle, enterOff, vs, bs` and the dials
for tests and screenshot drivers. Tests: combat (every boss has a signature
and every elite / boss a taunt, the cadence and the telegraph text, the
avalanche and its gold, the lean, hot metal and the burn through Block, the
lid / rail ice cycle with cracks and smashes, one rig per phase and the final
phase once, a 24 turn clean fuzz per boss), game (the elite and boss cards,
tap to skip, input waits, the quick repeat, the tower keeper, reduced motion,
a save under the card, coins as bodies, the lean, heat and a hot delivery,
the ice wall in the physics and the slow rail, the hijacked drop and the
wrestle, the red lights, the finale and its outro, the elite finale, the tap
skip, Glacius into the FINAL BOSS card, every look drawn), render (the card
at every beat for all ten, the signs, every cabinet look distinct, badges,
the finale, the intent ribbon), audio (every voice, the sting throttle).

## Claw types (the rig variants, round 2)

The Crawler picks a claw at the start of a run (the claw row on character
select, `run.clawType`; a save without one is `'classic'`). Every type is a
variant of the one `PHYS.clawRig` (same phase machine, same events, same
public surface), with its own geometry, grip rules, look and sounds. The
data lives in `DATA.CLAWS[id]` (name, joke, stats for the picker); the
physics dials in `PHYS.CLAW_TYPES[id]`. Claw upgrades still apply to every
type (see the per-type notes below).

### Auto-steer API (for the Prize Master and any other AI driver)

```js
R.autoSteer(x, {drop: true, speed: 1.6}) -> bool
  // Only while idle / moving. Sets the aim (clamped to the bin) and takes
  // the claw away from the player: R.setTarget(x) is ignored while R.auto is
  // set. drop: true commits the drop the moment the carriage arrives (the
  // same as R.drop()). speed multiplies the carriage speed until the grab
  // ends. R.auto = {x, drop, speed} until the claw is home again ('home'
  // event) or R.cancelAuto(). Returns false while busy.
R.cancelAuto()             // hands the claw back (the speed boost ends)
R.auto                     // null, or the AI steer in charge (the renderer tints the carriage lamp red)
R.aimAt(pred) -> x | null  // the x above the best body for a steer: the topmost dynamic body with
                           // pred(body) true (default: any item), null when none matches
```
The game still owns the grab bookkeeping (`COMBAT.useGrab`, `FS.grabInFlight`);
an AI grab is driven exactly like a player grab, only the steer and the drop
come from `autoSteer`.

### The six claws (`PHYS.CLAW_TYPES`, `DATA.CLAWS`)

| type | body | physics | good / bad |
| --- | --- | --- | --- |
| `classic` | two chrome prongs | the old rig, bit for bit (every multiplier 1) | a bit of everything |
| `tri` | three curled prongs, gold rivets, a star plate | size x0.9, cupped `TRI_PRONG`, grip +0.06, claw friction x1.7 on balls (x1.35 blobs), x0.8 on long capsules; the middle prong is drawn only | round things / long things |
| `scoop` | a clamshell bucket (see-through shell, teeth) | `SCOOP_JAW` jaws, halt x3 (it plows), keeps sinking 0.1 s after the touch (`dig`), closes x1.35 faster, rails x0.85; a capsule longer than 38 px tips out over the rim at 0.22 s into the lift with chance 0.8 | handfuls of small things / swords |
| `hand` | a cartoon rubber glove, fingers curl as it closes | fat `FINGER` polylines, grip +0.22, friction x1.45, rails x0.72, drop and lift x0.8; at the lift the heaviest thing it touches is welded to it, everything else drops out | one big heavy thing / handfuls, hurry |
| `magnet` | a red electromagnet drum on the cable, hazard band, coil face | no prongs, a hub disc r 24; a field pulls metal (`fieldR` 118, `fieldF` 2600 px/s^2) while dropping, energising (0.4 s) and the first 0.3 s of the lift; every metal part touching the face sticks (and metal touching stuck metal while energising); non-metal slides off the housing; drops everything on release | metal builds / anything not metal |
| `hook` | a barbed harpoon on a rope | no claw segments at all (the rope passes through the pile); drops x2.1; the first item part the barb (3 px x size, +3 with the third prong) enters is speared and welded; the rope drags it up through the pile | sniping one item fast / heavy things tear off |

Welds (`hand`, `magnet`, `hook`): each stuck body is driven to its spot under
the hub by a capped velocity weld (`weldK`, `weldV`) and keeps its angle; it
tears off (a `slip`) when it lags more than `tear` x size + 6 px, and at the
top of the lift a load heavier than the claw bears (`14 + 40 grip_cc` magnet,
`10 + 36` hook, `18 + 50` hand) may tear off with a seeded roll. The cargo
of a weld claw is what it holds (`R.stuck()`); riders on it are a bonus.

Upgrades on every type: Extra Token and Greased Rails as ever; Wider Palm
scales the whole claw (a bigger magnet, a bigger barb); Stronger Motor, Rubber
Tips and the Third Prong raise grip_cc (the magnet's field strength and what
it bears, the harpoon's tear limit); on the magnet the Third Prong is a second
coil (+25% range) and the Electromagnet upgrade overcharges it (+40% pull); on
the harpoon the Third Prong is a second barb. `DATA.CLAWS[id].ups` says so in
the picker.

Rig additions: `R.type`, `R.stuck()`, `R.field` (0..1, the magnet's live
field), `R.bodies.tip` (the harpoon's barb), `R.setConfig({type})`, and the
auto-steer API above. `PHYS.clawPose(type, {x, y, open, width, cable})` is a
rig-shaped pose for drawing a claw without a world (the picker chips).

### The picker, the run, the save

Character select has a claw row (`clawPickerRow`, one line in `showChars`):
six chips (a still of each claw) and a panel for the picked one with a live
demo cabinet (a tiny world where the claw grabs on its own through
`autoSteer`, on a pile that shows the type off), grip / haul / speed pips,
the matchups and the joke. Chips are plain taps, not `GAME.choose` entries,
so the crawler cards keep their indices. The pick is remembered on the
profile (`meta.clawPick`) and copied to `run.clawType` by `newRun`; a run
without it (an old save) is the classic claw. `GAME.claws` exposes `ids`,
`info`, `type`, `picked`, `pick`, `turnStart`, `celebrate`, `demo`,
`demoStep`, `demoDraw`, `SLOT`, `ANTIC_AFTER`, `zones`.

### Claw juice

- Each player turn (and the opening bell) a coin flies from the gold counter
  into the coin slot on the cabinet's bottom rail (`RENDER.coinSlot`): a clunk
  (`clawCoin`), the slot and its INSERT COIN lamp light up, then the claw
  spins up (`clawSpin`, `J.spin`: two turns about the cable, an x squash, a
  cyan glow) with the LED chase.
- A jackpot: the claw twirls (`J.spin`), starry `wow` eyes, confetti, `clawCheer`.
- Idle antics when the player waits 7 s (then every 5 s): taps the glass twice
  (`J.tap` leans the claw at you, rings on the glass, `clawTap`), looks
  around, yawns (`sleepy` eyes and drifting zZ).
- Per type: the magnet hums on the drop (`magHum`), zaps and sparks on every
  catch (`magZap`), crackling arcs to what it holds (`J.hold`) and to metal it
  pulls (`J.pull`), a hum ring under the face, a power-down on release
  (`magDrop`); the scoop sloshes into the pile (`scoopSlosh`) and throws dust;
  the hand squishes (`handSquish`, sweat drops, `J.squish`); the harpoon fires
  (`hookFire`, a streak), thunks home (`hookThunk`, an impact star at the
  barb) or clanks on the floor; the tri-claw clamps with a gold ring.
- Reduced motion drops the spin and the tap.

### Floating text layout (`RENDER.fx`)

Labels (the classic rising texts and the badges; the physics damage numbers
keep their flight) are laid out every frame, oldest first: each reserves its
rect, and a label that would overlap an older one, a keep-out zone or the
screen edge moves to the nearest free spot above or below and drifts back to
its own path when that frees up. When the screen is full a new label waits
hidden while the oldest one hurries off. The same text in the same colour
within 0.5 s (and 120 px) merges into the live label as "x2", "x3" with a pop;
a label wider than 516 px shrinks to fit; life is at least `0.55 + 0.055 x
length` s (max 2.8), so long lines stay readable. `fx.zone(id, x0, y0, x1,
y1)` / `fx.zone(id)` set keep-out rects; the game sets the cabinet marquee,
the top HUD, the grabs pill and the control bar on the fight screen (the top
HUD on the map) in `setScreen` (`labelZones`). `o.free` opts a label out,
`o.noMerge` stops a merge, `fx.labels()` returns the laid-out rects, and
`fx.layout = false` switches the manager off. `fx.LAYOUT` holds the dials.

Tests: physics (six types, the default is the classic, every type delivers a
lone item, the magnet lifts only metal and does lift metal, the scoop lifts
handfuls and loses swords, the hand holds one thing (the heaviest), the
harpoon spears through the pile with no claw segments, tri vs classic on
balls, upgrades on every type, the auto-steer API, determinism), render
(every type in every state, all distinct, the coin slot, a 40-label stress
test with no overlaps, nothing off screen or in a zone over 90 frames, the
marquee, merges, long labels, lifetimes, opt outs), game (the picker, the
pick saved and loaded, old saves are classic, a real grab delivers with
every type and the magnet delivers only metal, the coin clunk and spin-up,
idle antics, the jackpot twirl, per-type sounds, label zones), data
(`DATA.CLAWS` matches the rigs, copy lengths, no em dashes), audio (every
claw voice).

## Meta (reasons to play one more run)

Meta progression: a ladder to climb (Tilt), a book to fill (the Prizedex),
stickers to earn, a daily seed to beat, and an arcade front door. Enemies get
stronger on purpose; balance is loose. Pure data in `data.js` (the META
block), the fight side in `combat.js` (the TILT block), the flow in `game.js`
(the META block, reached through one-line hooks), the look in `index.html`
(`<style id="meta-css">`), the sounds `coinIn, sticker, discover, tiltUp`.

**Tilt levels** (ascension). `DATA.TILT[0..10]` `{lv, name, text, k, v, color}`,
`DATA.TILT_MAX` 10, `DATA.tiltMods(lv)` -> the cumulative twists `{hp, dmg,
eliteAffix, bulbs, junk: [ids], shop, ramp, rest, caps, bossRage}` (neutral at 0).
Winning a run with a crawler at its highest unlocked level unlocks the next one
for that crawler (`meta.tilt[char]`); the selector then sits on it.

| lv | name | twist | where |
| --- | --- | --- | --- |
| 1 | Loose Coin | enemies +10% hp | combat `tiltScale` (makeEnemy, summons too) |
| 2 | Sticky Joystick | enemies hit +10% (attacks, charges, bombs) | combat `tiltScale` |
| 3 | Bent Prong | every elite gets one more affix (never Greedy on a gulper) | combat `tiltFight` |
| 4 | Dim Marquee | 3 fewer bulbs at the start of each act (never below 1) | game `metaNewRun` / `metaActStart` |
| 5 | Junk Drawer | a rock in the starting bin | game `metaNewRun` |
| 6 | Price Hike | shop items and relics +25% | game `metaShop` (rollShop) |
| 7 | Hot Streak | the hidden escalation steps every 2 fights, not 3 | combat `tiltScale` |
| 8 | Hard Bench | rests heal 20% instead of 30% | game `metaRest` |
| 9 | Cheap Plastic | capsules one tier lower (boss capsules stay >= uncommon; pity and the counter untouched) | game `metaCap` (makeCapsule) |
| 10 | Rigged | bosses start with their phase two Strength (the transformation still comes at half hp) | combat `tiltFight` |

`run.tilt` rides the run save; `COMBAT.newFight` copies it to `F.tiltLv`;
`DATA.DIFFICULTY` is never touched. Character select: a Tilt box above the cards
(a big glowing number, -/+ buttons, the level's name, the list of active twists;
locked until the first win) and a tag per crawler ("Plays Tilt 3 · max 4 · won 3",
gold when capped below the pick). The +/- buttons are not `GAME.choose` entries
(the cards keep index 0..2); tests use `GAME.prog.setTilt(n)`. The HUD shows a
pink `T3` (or a gold `DAILY`) badge on the act stat. The win screen shows the
unlock as a big card.

**Prizedex** (screen `collection`). Four tabs (`DATA.DEX_TABS`: items, relics,
enemies, combos; `DATA.dexEntries()`), `DATA.dexProgress(seen)` -> `{n, total, pct,
per}`. Discovered entries show the art, the name and keyword chips; the rest are
dark silhouettes of the same art (combos show their example items) and "???",
with a hint on tap (rarity, act, the recipe line). A completion bar on top, per
tab counts, "NEW!" badges (and a count dot on the tab) that clear once a tab has
been shown. Sightings (`dexSee`): items when offered (rewards, shops) or added
(junk, bombs, eggs), relics when gained, enemies when a fight starts or one is
summoned, combos when fired. The first sighting in a run slaps a toast top left
("NEW PRIZE DISCOVERED", "NEW MONSTER SPOTTED", "NEW COMBO FOUND"; several at once
share one toast with up to three pictures); a run's own starting bin never toasts.

**Achievement stickers** (screen `stickers`). `DATA.ACHIEVEMENTS` (36, `ACH_IDS`
in board order) `{id, name, icon, color, text, check(c), goal?, val?(c)}`;
`DATA.achCheck(c, have)` -> newly earned ids (a throwing check is skipped). The
game builds `c` and never lets a check mutate anything: `kind` 'tick' (polled
every 0.25 s in a run), 'ev' (a fight event: combo, die, binReturn), 'fight' (a won
fight), 'win' / 'end' (the run end), 'meta' (profile changes, the title); `c.run`,
`c.meta`, `c.f` (tier, grab, streak, dmgTaken, turn, hp, curDef, lucky, free,
enemy), `c.dex`. The observer is `metaEvent(ev)` at the top of `applyEvent`,
`metaFightEnd` in `endFight`, `metaRunEnd` on game over / win, and `metaTick`.
An unlock (`achUnlock`) saves at once, lists the id on `run.achNew` (the run-end
panel shows "Stickers this run") and queues a sticker that slaps onto the top
right corner (a die-cut card, a stamp and a sparkle, confetti and a ring), one at
a time, 2.8 s each, peeling off. The board: a 3-column grid, earned stickers
tilted and coloured, locked ones dashed with their goal text and a progress bar
when they count something.

**Daily run.** `DATA.dailyKey(date)` 'YYYY-MM-DD', `dailySeed(key)` (FNV), `dailyChar(key)`
(any crawler, locked or not), `dailyScore(run, won)` = act x 500 + kills x 20 +
jackpots x 15 + tickets won x 3 + gold (+2500 for a win). The title's gold DAILY
RUN button (date, crawler, today's best) starts `newRun(char, seed)` at Tilt 0 with
`run.daily`; the same seed means the same map and starting bin for everyone.
`meta.daily {key, best, runs, last}`; the run-end panel shows the score and NEW
BEST.

**Title.** An arcade attract mode on the first title of a page load (never
headless): a ring of chasing marquee bulbs, a hi-score line, INSERT COIN blinking
over the tower, a coin slot. A tap or a key drops a coin (`coinIn`), CREDIT 01
lights, the overlay zooms away and the menu slides up. The menu: Continue, New
run, Daily run, Prizedex / Stickers / Help / Intro, the toggles, then a stats row
(runs, wins, best Tilt won, stickers x/y, Prizedex %). Profile stickers catch up
here (`achRun('meta')`) and slap once the menu is up.

**Save fields.** Meta (`clawspire_meta`, `metaFix` defaults every one, junk
included): `tilt {char: lv}`, `tiltSel`, `bestTilt {char: lv}`, `winsBy {char: n}`,
`ach {id: {run, at}}`, `achNew {id: 1}`, `seen.enemies`, `seen.combos` (next to the
old `seen.items` / `seen.relics`), `dexNew {'tab:id': 1}`, `daily`. Run
(`clawspire_run`): `tilt` (missing = 0), `daily` (key or null), `achNew`, `metaEnd`.
No key was renamed.

`GAME.prog` = `{startRun(char, tilt), startDaily(key?), setTilt(n), tiltCap(char),
tiltMax(), dexSee(tab, id, quiet), dexProg(), achUnlock(id), achRun(kind, extra),
runEnd(won), insertCoin(), metaFix, queue, log, current}`; `GAME.showStickers()`.
Tests: data (levels, cumulative twists, achievements and their checks, the
Prizedex tables, the daily seed and score), combat (Tilt 0 neutral, hp, damage,
the elite affix, the faster ramp, boss rage), game (defaults and old saves, the
unlock on a win and its reload, per-crawler caps, every twist in the game, the
HUD badge, the observer and the sticker queue, discoveries and the screen, the
board and the title, the daily).

## Quality bar (Game of the Year, mobile)

- Every action has feedback: sound + motion + number. Screen shake on big hits (respect the
  reduced-shake setting). Floating numbers. Hit flash. Item glow in the chute. Jackpot banner.
- Nothing ever soft-locks: every screen has a way forward, every promise (a button, a hint)
  is true. Grabs cannot get stuck: a rig phase has a max duration and auto-advances.
- Text is readable at 360px wide: minimum 12px logical at scale 1, real sentences, no walls.
- 60 fps on a mid phone: physics ≤ 40 bodies, no per-frame allocations in hot loops, canvas
  cleared once, no shadowBlur in loops (draw glows as radial gradients cached once).
