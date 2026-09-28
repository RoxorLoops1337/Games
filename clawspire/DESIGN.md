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
and the monsters pass (see Enemies): `gulp {n, like?}`, `bomb {v, fuse}`, `corrode {n}`, `jam {v}`, `eggs {n, hatch, turns}`,
and the bestiary (see Enemies, round 4): `tickle {v}`, `glue {v}`, `ceiling {v}`, `plow`, `vanish {n}`, `bury {n}`, `wheel`.
Optional enemy fields: `enrage: {name, text, str?, pattern?} | false` (phase two), `digest` (turns), `noAffix`, `rival` (its own claw, the bestiary),
`taunt` (the versus card's line) and `sig: {id, name, sign, shout, text, first, every, ...}` (a boss signature, see Bosses).
At least **26 enemies**: act 1 six normal + 2 elites + 1 boss; act 2 the same; act 3 the same; plus
the final boss `prizemaster`. Art keys: `rat, slime, bat, gremlin, mimic, spider, goblin, hoard,
imp, clockwork, golem, furnace, magnet, ironjaw, wraith, yeti, frostmage, icemimic, prizemaster,
mushroom, knight, wisp, crab, drone, tinker, cultist, raccoon, goat, magpie`, and the bestiary's `tickler, jelly,
barker, magbat, mole, dozer, ghost, collector`.

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
(daggers, coins, dodge; fast claw, gold), `gambler` (Lucky Lou: dice, chips, the Luck meter; see
"Lucky Lou and the synergy pass"). Optional: `luck` (the meter is his gift), `vsLine` (the versus card line).

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
(`items` / `insts` / `part` / `dir` / `stage` / `name` / `text` / `v` by kind), and the bestiary (see Enemies):
`{t:'binTickle', idx, turns}`, `{t:'binGlue', idx, turns}`, `{t:'binCeiling', idx, turns, insts}`, `{t:'binPlow', idx, dir}`,
`{t:'binVanish', idx, insts}`, `{t:'binBury', idx, inst}`, `{t:'binUnbury', idx, insts}`, `{t:'binWheel', idx, w, who, label}`,
`{t:'binRival', idx, inst}`.
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
| luck | 🍀 Luck | self Luck, per luck, random (dice) | Rabbit's Foot (the meter for anyone), High Roller, One-Armed Bandit (r), Golden Dice (l) | Poker Chip, Lucky Clover, Pity Timer, Lucky Cat, Wheel of Fortune |

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
(`F.digested`: gone for this fight only; the run's bin is never touched).
Digestion never takes the player below `DIGEST_FLOOR` (4) real (non-junk)
items in the bin and the used pile: that item is coughed back up instead
(`binReturn` why `burst`), so a gulper can never eat a fight into a stalemate. An
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

### The bestiary (round 4): enemies that play with the machine

Eight enemies whose tricks change how the claw works for a turn, each
telegraphed three ways: the intent bubble (its own icon), the intent text,
and the cabinet's warning sign ("TICKLE NEXT TURN" on the player's turn
before, then the state while it lasts: TICKLISH CLAW, STICKY PILE, MAGNETIC
LID, DIG UP THE MOUNDS, INVISIBLE ITEMS; a boss sign always wins the frame).
COMBAT decides and emits a bin event (combat.js BESTIARY block); the game
stages it in the cabinet (game.js BESTIARY block, state in `FS.best`, never
saved); the art, the tricks' looks and the intent icons live in render.js
(BESTIARY block, `RENDER.best`); the sounds in audio.js.

| enemy | act, tier | trick (move kind) | in the cabinet | the counter |
| --- | --- | --- | --- | --- |
| Tickle Monster `tickler` | 1 normal | `tickle {v: 1}` | feathers poke at the claw; while it drops, closes, lifts and carries it wiggles (`BST_K.tickleA` 7 px at 7.5 Hz, real velocity, so the cargo can slip) | fewer drops, round things |
| Jelly Cube `jelly` | 1 normal | `glue {v: 1}` | once the pile settles on your turn, touching items are glued in pairs (two per item, goo strands drawn between them); the goo only pulls, snaps past 22 px of stretch; the claw lifts clumps (junk too) | aim for clumps, or for a loner |
| Carnival Barker `barker` | 1 elite | `wheel` | a prize wheel spins over the cabinet (the enemy turn waits), lands on the rolled wedge, pays it, then hangs as a small sign on the frame | kill it before the house edge adds up |
| Magnet Bat `magbat` | 2 normal | `ceiling {v: 1}` | the lid turns into a magnet: every metal item floats up to a hang line under it (a damped spring, spread along the lid, field lines), grabbable mid-air (a dropping claw with one between its prongs stops and closes on it; lifted, it has gravity again); the lid lets go when the turn ends | grab the metal while it hangs |
| Cinder Mole `mole` | 2 normal | `bury {n: 1}` | the item leaves the bin into `F.buried` and a dirt mound with its tip poking out appears on the floor (a pulsing DIG ring); a claw that comes down over it near the floor digs it up (`COMBAT.bestUnbury`) and it pops up into the closing claw; the Mole's death gives every buried item back (`binUnbury`) | drop on the mound |
| The Bulldozer `dozer` | 2 elite | `plow` | a steel blade sweeps the bin from the chute side to the far wall (a moving wall: nothing passes it), then backs off; the pile ends up far from the chute | long carries: grip and speed |
| Peekaboo Ghost `ghost` | 3 normal | `vanish {n: 3}` | three random real items turn invisible: a faint ghost, a dashed outline, a "?" and a crawling glint; the claw's touch finds one (it fades back in, FOUND IT!) | brush the pile |
| The Claw Collector `collector` | 3 elite | `rival: true` | after every action its own gold claw rides a trolley under the lid to the rarest item, drops, clamps, lifts it out through the lid, and the item goes into its case (the belly rules: `digest: 99` keeps it, a hiccup or its death gives it back); enraged it goes twice. On your turn the claw waits in its corner with a red reticle on its next prize (`COMBAT.bestRivalPick`, pure, so the telegraph is the truth) | grab the marked item first, hit it hard |

Rules that keep it fair: bury and the rival claw never take the player below
`BEST_FLOOR` (4) real items; the tricks that last "a turn" end when the
player ends it (`bestTurnEnd`); the wheel's house edge weighs its own wedges
x1.3 (x2.6 enraged, about 57% / 72% of spins); every trick is deterministic
by the fight seed (the physics hook keeps its own rng).

**Enemy life** (every enemy, render.js). Each draw sets `LIFE` from t, the
enemy's x and `st.seed` (the game passes its slot, so twins never sync) and
clears it after: a breath about the feet (bosses slow and deep), a blink
every 2.6-4.3 s (some double blink; `eye()` draws a shut lid), a fidget every
5-7.5 s of 0.9 s in its own style (`RENDER.best.FIDGET`: the rat sniffs,
slimes jiggle, the goblin twirls its wrench a full turn, bats loop the loop,
mimics snap, spiders tap, the ghost plays peekaboo, the mole ducks into its
hole, the dozer revs, the barker tips its hat...), none while frozen, dead,
striking or flinching; hit reactions are unchanged. Low hp (`st.hpk`, from
the game): sweat drops under 40%, cracks under 25%, dizzy stars under 15%,
and a tired slump. All of it is a pure function of the draw's inputs (the
intro redraws frames and pins it).

**Map decor** (lit land only, drawn by `RENDER.hex` under the pickup, from
the tile's seed; about 5 hexes in 11 get a prop, smaller among trees; the
sea, mountains and the dark never do): act 1 dropped tickets, neon puddles
that pulse and ripple, a lost token; act 2 half-sunk gears turning, steam
vents puffing; act 3 snow drifts, icicles on an ice ledge dripping, twinkling
glints, and an aurora on the sky edge of the map (`RENDER.best.sky`, three
slow ribbons of added light over the top of the map area).

Sounds: `giggle, gooSplat, magLift, dig, boo, dozer, rivalClaw` (the wheel
uses the arcade's `wheelSpin`, `wheelTick`, `arcWin`, `arcLose`).
`GAME.best` = `{K, event, turnEnd, glue, hook, dig, state}`; COMBAT adds
`BEST_KINDS, BEST_WHEEL, BEST_FLOOR, bestUnbury, bestRivalPick, bestRide`.
Tests: combat (every trick's event, the ceiling takes only metal, bury /
dig / death with every item accounted for and the floor, the wheel's order,
edge and determinism, the rival's pick, order, case, floor and seconds, 16
clean turns each), data (acts, tiers, encounters, taunts), game (a tickled
claw wiggles, glue pairs pull and dry up, metal hangs and is grabbed
mid-air, the plow moves the pile, a touch finds a ghosted item, a claw digs
a mound up, the wheel lands on its wedge while the turn waits, the rival
claw lifts its prize out, six real turns each), render (life for every
key: blinks, fidgets, determinism, no leak, low hp; every trick's look;
decor per biome, never dark or sea; the aurora), audio (every voice).

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

## Lucky Lou and the synergy pass (round 3)

A fourth crawler whose mechanic turns a bad grab into a plan, plus content
that ties the round 1 and 2 systems (materials, hungry monsters, tickets and
capsules, claw types) into builds. Balance stays loose; new numbers sit in
the band of the old ones.

### Lucky Lou, The Gambler (`DATA.CHARACTERS.gambler`)

70 hp, 110 gold, 3 grabs, a slightly loose claw (width 1, grip 0.9, speed
1.1), unlock `act2` (a profile that already met a crawler's rule with another
crawler of the same rule gets him at once: `unlocked()` in game.js). His
bin (19): 5 Bone Dice (2-8), 5 Poker Chips (4 Block), Scratch Card,
Fortune Cookie, Crisp Apple, 3 Lucky Clovers, 3 Pocket Dice. Starter relic
**Snake Eyes**: the first grab each turn that brings up nothing rolls two
dice (the fight rng): a random enemy takes the total; doubles give the grab
back. Portrait (render.js `portrait`): green dealer's visor with a card in
the band, a wink, a pencil moustache, a gold tooth, a red bow tie. Every
crawler now has a `vsLine` (`DATA.CHARACTERS[id].vsLine`, Lou: "Double or
nothing, pal.") typed in a speech bubble under their name on the versus card
(`RENDER.vsCard`, `st.charLine` overrides). Tilt, the Prizedex, stickers and
the daily rotation read `CHARACTERS` generically, so he joins all of them.

**The Luck meter** (combat.js `LUCK = {max 10, miss 2, near 1, per 2, jackpot 1.5}`).
Luck is a player status (`luck`, 🍀, count, never decays, capped at 10 by
`COMBAT.status`). `F.luckK` is 1 for the gambler (`CHARACTERS[id].luck`), 1 for
any crawler holding the Rabbit's Foot (`rules.luck`), 2 for Lou with it.
- An empty grab gives `miss x luckK` Luck (BAD BEAT); a near miss (the game's
  SO CLOSE, `COMBAT.nearMiss(F)`) gives `near x luckK`.
- A grab that delivers 2+ items **cashes out** every point: `per` damage per
  Luck to ALL enemies (+`rules.cashAmp`, High Roller), x1.5 on a jackpot (3+
  items), no attacker (relic damage rules). Event `{t:'luck', k:'cash', v, dmg,
  jackpot}`, then `onCashOut(F, luck, items)`. `F.stats.cash` keeps the best.
- While Luck is held, dice (every `random` fx, never a combo's) roll twice and
  keep the best (LUCKY ROLL). `dmgPer {per:'luck'}` reads it without spending.
- `combosFor(defs, ctx)`: COMBAT passes `{luck, streak}` so a recipe can read
  the grab's state (Lucky Seven).
- The game draws the meter on the cabinet's left frame (`RENDER.luckMeter`,
  game.js CONTENT block `luckDraw`): ten clover lamps, a LUCK plate, a pop on
  each gain (a rising chime), a gold chase and CASH OUT! on the plate and the
  marquee at a cash out (`luckFx`: coins, stars from the lamps, shake).

### New content

Items (16, `R3_ITEMS` in the data suite): Lou's Bone Dice, Poker Chip (starters),
Scratch Card, Fortune Cookie (c), Double or Nothing, Lucky Horseshoe, Marked Deck
(u), One-Armed Bandit (4 + 3 per Luck), Roulette Wheel (1-36) (r), Golden Dice (l:
two rolls of 4-14 to ALL, 2 Luck); shared: **Poison Pill** (c, bait), **Hot
Potato** (u, bait, hot), Crystal Dice (u, glass: cracks for +50%), Floating
Token (u, magic metal coin: floats, magnets pull it), Firecracker (c, a real bomb:
its fuse lights), Lucky Clover (small filler, 1 Luck). New art keys: `chip, card,
horseshoe, clover, slot, potato, pill, cookie`.

Item fields COMBAT reads: `lure` (score bonus when a gulper picks its meal, so
bait goes first), `eaten {dmg, status: {s: v}}` (per plus: a swallowed Poison
Pill / Hot Potato hurts the eater instead of feeding it: BLEGH), `hot` (Burn to
the player at each turn end while it sits in the bin, not frozen: HOT POTATO!).

Relics (15 + the starter): Luck: Pity Timer (c, a whiff: +1 Luck), Dealer's Visor
(c, start with 3), Lucky Ticket (c, cash outs give Block and tickets), Lucky Cat
(u, cash outs give gold), Wheel of Fortune (r, spins each turn: Block, zap ALL,
Luck or a grab), Rabbit's Foot (r, `rules.luck`), High Roller (r, `rules.cashAmp`).
Tickets and capsules: Ticket Roll (c, +2 tickets a combo), Gacha Charm (u,
`loot.capUp` 0.2 per capsule step, `DATA.rollCapsule(rng, src, {up})`, and 2
tickets a jackpot). Monsters: Heartburn (u, every meal gives the eater 4 Burn and
2 Poison). Materials: Broken Mirror (c, crack or shatter: +1 Luck), Blasting Cap
(u, a bomb in the bin: 3 Burn to ALL and 5 Block; a lit fuse 2 Block). Claws:
Lodestone (u, 2+ metal in a grab: 3 Block each; Magnet Crane from 1, plus a zap),
Sand Pail (u, 3+ items: 3 damage each to a random enemy; the Scoop from 2), Big
Catch (u, the first delivery each turn +4 to the target; the Harpoon 8).
Relics read the claw from `F.clawType` (`run.clawType`) and the crawler from `F.char`.

New hooks (`DATA.RELIC_HOOKS`): `onCashOut(F, luck, items)`, `onEat(F, e, inst,
def)` (every meal: bombs, drinks, snacks, held items, bait), `onMaterial(F, kind,
inst, def)` with kind `crack | shatter | fuse | blast`, fired by the game through
`COMBAT.material(F, kind, inst)` from `crack`, `shatterInBin`, `lightFuse` and
`explode`; a shatter in the bin is also a shatter (`onShatter`, `stats.shattered`).
New rules: `luck`, `cashAmp`. `COMBAT.tickets(F, v)` banks relic tickets on
`F.stats.tix`; the payout adds a "Ticket relics" line (`DATA.payout({relicTix})`).

The Luck archetype (`luck`, 🍀 Luck, #3ddc84): self Luck, `per: 'luck'` and every
`random` fx (old dice join it). Bridges: Floating Token (luck + greed), Broken
Mirror (glass + luck), Lucky Cat (luck + greed), Hot Potato (burn + feast).

### Combos (10 new; `secret: true` hides a recipe)

| tier | combo | recipe | effect |
| --- | --- | --- | --- |
| 1 | Double Dice | 2 dice | 4 to a random enemy, 2 Luck |
| 1 | Poker Night | a card + a chip | 4 Block, 1 Luck |
| 1 | Hot Lunch | food + a Pyro item | heal 3, 2 Burn |
| 2 | Two Pair | two different pairs | 8 to ALL, 2 Luck |
| 2 | Bad Medicine | Poison Pill + another potion | 4 Poison, 2 Weak to ALL |
| 3 secret | Full House | 3 of one + 2 of another (replaces Three of a Kind, Two Pair) | 16 to ALL, 4 Luck, 10 gold |
| 3 secret | Royal Flush | a card, a chip, a die and a coin | 20 to ALL, 5 Luck, 15 gold |
| 3 secret | Dead Man's Hand | a skull, a bone and a card | 3 Vulnerable, 6 x3 |
| 3 secret | Midas Touch | 3 different coins (the Hoard's coins count) | 14 to ALL, 20 gold |
| 3 secret | Lucky Seven | 2+ items while holding exactly 7 Luck (`ctx`) | 7 x7 at random, 7 gold |

A secret combo in the Prizedex (game.js `dexCard` / `dexArt`) is a "?" disc with
"??? SECRET" until it fires once; its hint is "Recipe: ???". Once found it shows
its name, examples and recipe like any other.

Stickers: Big Payout (cash out 10 Luck), Secret Menu (fire a secret combo), The
House Loses (win with Lou).

### Dynamic fight music (audio.js)

`AUDIO.musicState({hype, tense})` (the game calls it every frame from
`juiceTick`; only a change acts): the fight, elite and boss tunes carry two
extra layers on their own gains under the mode's layer, crossfaded with
`setTargetAtTime` (time constant 0.45 s) and scheduled through a 2.5 s tail
after they switch off. **Hype** (a streak of 3+ or the cabinet party lights):
shaker 16ths, claps on 2 and 4, offbeat kicks, a tom fill closing each phrase.
**Tense** (under 30% hp, or an elite / boss in phase two): a low filtered saw
drone with a slow wobble, a heartbeat kick, a high tremolo minor second. Layer
tunes come from their own seed (`clawspire:layers:<mode>`), so the base songs
are unchanged. `AUDIO.victory()` (the last kill) fades the fight out under a
major-key arpeggio and chord in the fight's key. All on the music bus: the music
toggle and volume apply; before init everything is remembered and no-ops.
`AUDIO.layers`, `_layerSong(mode)`, `_liveLayers()` are for tests.

Tests: data (Lou, the pools, the new content and the Luck archetype, hooks
with a recording COMBAT, the combos and secrets, Lucky Seven's ctx, the Gacha
Charm odds, the payout line, the stickers), combat (the meter and its owners,
whiffs and cash outs, the jackpot x1.5, High Roller, the cap, near misses,
Snake Eyes and the Pity Timer, dice advantage, the Bandit, bait, the Hot Potato,
materials and tickets, Lucky Seven and Midas in a fight, a 30 turn fuzz with
every new relic on four claws), render (every new art key, Lou's portrait, the
meter in every state, the versus line), audio (headless safety, the layer
tunes, switching and crossfades, the victory sting, the music toggle), game
(his card and unlock, a real fight with every claw type and the meter drawn,
near misses and materials reaching COMBAT, the music layers and the sting,
secrets hidden in the Prizedex, relic tickets on the payout).

## Arcade (the map comes alive, round 3)

The dead arcade wakes up: mini-game cabinets worth a detour, monsters that
prowl the lit hexes, and events staged as little scenes. Balance is loose on
purpose. Map rules live in `map.js` (the ARCADE block), the flow in `game.js`
(the ARCADE block, reached through one-line hooks), the look in `render.js`
(the ARCADE block, `arc*`), the sounds in `audio.js`, the frame in
`index.html` (`#scr-arcade`, the ARCADE CSS block).

**Cabinets (map).** Three new tile types, `plinko`, `wheel`, `slots`
(`MAP.ARC_GAMES`, `MAP.isArcade`), 2 or 3 per map, each game at most once.
`placeArcade(M)` runs inside `generate` after the road is carved, on its own
rng drawn from `M.seed`, so every seed's terrain, content and road are
unchanged. A cabinet takes an empty land hex at least `ARC_ROAD_GAP` (2) off
the road, `ARC_GAP` (5) from the others, 3 from the start, 2 from the boss,
never on a tower's doorstep (small maps relax the gaps in steps). Cabinets
are landmarks (their silhouette shows in the dark, `LANDMARKS`). Content:
`{seed, diff, game, tokens}`: plinko 1-3 tokens, the wheel 1-2 spins, the
slots 1-2 free pulls. Old maps have none and load as ever.

**The session.** Entering a cabinet opens screen `arcade` (sd `{arcade: {q,
r}}`). Its state is `tile.content.arc` = `{g, tokens, used, res, pend, caps,
mult, rot}` (plus `items`, `strips`, `stops` for the slots), saved with the
map. A play spends its token and rolls its outcome the moment it starts
(`pend`, saved); the animation plays it; the landing pays it and clears
`pend` in the same beat and saves. A reload mid-play replays the same
outcome; a reload after the landing pays nothing. Capsules won go to
`arc.caps` and are cracked through the usual ritual (`showCapsule` with
`then: {k: 'arcade', q, r}`, which comes back to the machine). Leave: a play
in flight lands and pays first, unopened capsules go to the bank, and the
tile is `done` once its plays are spent (plays left keep it open). A tap on
the machine, Space or the big button plays; a tap mid-play hurries it
(plinko fast-forwards then skips, the wheel skips, the reels slam shut), a
tap in the celebration moves on. After `ARC.fastAfter` (6) plays on the
profile (`meta.arc.plays`) everything runs faster.

- **PLINKO** (`PLK`, `PLK_SLOTS`). A 9-row peg board (half pegs on the walls
  kick a hugging token back in), nine slots: 8 gold and 3 tickets on the
  edges, a capsule a step in, 2 bulbs, and the narrow JACKPOT in the middle
  (`PLK.jpW` 34 px: a rare capsule, 30 gold, 10 tickets). The token sways
  above the board; a tap drops it where you tapped. `plkSim(x, seed)`
  simulates the whole drop at once (1/240 s steps, seeded jitter at each
  peg, a stuck guard), the screen plays the recorded path back: pegs light
  and ding up the scale, a drumroll and slow motion when it rolls toward the
  jackpot over the last rows, "One slot off the JACKPOT!" beside it. Over
  2000 drops aimed at the middle: 9% jackpot, 13-19% capsule.
- **The PRIZE WHEEL** (`WHEEL`, `WH`). Twelve weighted wedges: gold 15/30,
  tickets 5/8, +10 HP, a rare CAPSULE, CURSE (junk in the bin, and any double
  is lost), x2 SPIN (double or nothing: a free respin and the next prize x2,
  stacking to x8), JACKPOT (a rare capsule, legendary when doubled, 60 gold,
  15 tickets). `wheelRoll` picks the wedge and where the flapper rests; a
  plain wedge beside the jackpot or the capsule stops right at their shared
  peg (the near miss). `whTarget` gives the rotation, the spin eases out
  (quartic, 4.6 s) so the clicker (a flapper flicked by every peg, a tick
  each) slows with suspense.
- **LUCKY SLOTS** (`REEL`, `SLOT_ODDS`). Three reels of cherries, bells,
  bulbs, a lucky 7 and three items from your own bin. The first pull is free
  (the tile's pulls), then `ARC.slotCost` (3) tickets. Drag the lever down
  (or tap). `slotRoll` rolls the category first (7s 3%, items 9%, cherries
  8%, bells 8%, bulbs 6%, a cherry pair 13%) then stops that show it; 40% of
  losses are near misses (two of a big symbol, the third one step off the
  line). Reels stop one by one with thunks; two alike and one to go and the
  last reel spins on while the lights race (the tease). Pays: 777 JACKPOT (a
  rare capsule, 40 gold, 12 tickets), three of an item upgrades a copy of it
  in the bin (another plus copy when all are plus), cherries 25 gold, bells 10
  tickets, bulbs 3, a cherry pair 8 gold. Wins pour a coin waterfall from the
  tray; a paytable sits under the machine.

Wins celebrate by tier (the DOM sign `#arcMsg`, chasing cabinet bulbs, coins
and tickets flying to the HUD counters, confetti, rings); the jackpot adds a
flash, confetti from both corners, chromatic rings, slow motion and the
fanfare. Gold scales x(1 + 0.35 per act after the first).

**Roaming monsters** (`M.roam = [{id, q, r, awake, enc}]`). 3 / 4 / 5 per
act (`ROAM_N`), on empty mainland hexes at least `ROAM_START` (5) from the
start and `ROAM_BOSS` (3) from the boss, `ROAM_GAP` (4) apart, asleep, each
with a normal encounter by its column. After every step of a walk
(`walkStep`): stepping onto a monster starts its fight; else `roamStep`
wakes the sleepers whose hex is lit and within `ROAM_SIGHT` (4) (a "!" and a
hold that turn: the telegraph), and every awake one steps one hex toward you
(fewest hops over the hexes it may walk: lit land, not the start or the
boss, empty, cleared, or a fight / gem / bulb box / tool / event it prowls
over; never a landmark). The first to reach you jumps you (AMBUSH!, through
the announcer); when your hex is busy (content resolving) it waits. The
fight is normal with a Monster bounty capsule on top; a monster beaten on a
tile with content lets that tile resolve right after. Monsters never block
a path (walking onto one is a fight). The map draws them on lit hexes: zZ
asleep, a pulsing red rim awake with a chevron, a dotted trail and a dashed
rim on the hex it steps to next (`roamPlan`), a hop when it moves. Saves
from before carry no monsters.

**Event scenes.** `showEvent` stages the event: a marquee title, a canvas
vignette (`RENDER.arcScene`: the act's backroom with a flickering neon word,
a prop per event, the subject in a spotlight, drifting motes; an
`art/events/<id>.png` still replaces it), the text on a card, and big
choices with outcome chips (`arcFxChips`: -6 HP, RANDOM ITEM ?, FIGHT ...,
a ROLL chip when the outcome is random). Choosing resolves the fx as before
(pickers and fights included), then the outcome view: a die tumbles across
the scene when the choice was random, then the lines (HP, gold, bulbs,
tools, relics, items added, upgraded, removed; the difference of the run
before and after) stamp in with sounds, Continue goes to the map. The
outcome is saved on the event (`ed.out`): a reload shows it, never pays it
again. A fight choice goes straight to its fight; headless (the suites) it
resolves straight to the map as before (`GAME.arc.force` opts in).

**Sounds.** `plinkDrop, peg, wheelSpin, wheelTick, lever, reelSpin,
reelStop, drumroll, arcWin, arcJackpot, arcLose, arcIn, diceRoll, diceLand,
roamWake, roamStep, ambush`.

**Save fields.** Map: tile types `plinko | wheel | slots` with
`content.arc` (the session), `M.roam`. Run sd: `{arcade: {q, r}}`,
`event.out`, a capsule's `then: {k: 'arcade', q, r}`, the roam fight's `then:
{roam, ambush, enter}`. Meta: `arc {plays, jackpots}`. No key was renamed.

`GAME.arc` exposes the tables and dials, `show, act, skip, leave, hurry,
pointer, session, plkSim, plkPegs, plkPays, plkEdges, wheelRoll, wheelPays,
whTarget, slotRoll, slotEval, slotPays, fxChips, roamStep, roamFight, state,
ev, msg, info, force`. `MAP` adds `ARC_GAMES, isArcade, placeArcade,
roamAt, roamOk, roamDist, roamNext, roamStep, roamPlan, roamRemove` and the
dials. `RENDER` adds `arcIcon, arcCabinet, arcPlinko, arcWheel, arcSlots,
arcSym, arcRoamer, arcScene, arcDice`. Tests: map (placement over seeds,
off the road, landmarks, reachable, deterministic; monsters placed, wake,
telegraph, step, ambush, hold, dark and start and landmark rules, a world
fuzz, the boss always reachable, save round trip, old saves), game (every
cabinet from its tile, plinko determinism and odds, pay once across
reloads, the wheel's double / curse / jackpot and ticks, slots odds, near
misses, ticket pulls and refusals, item upgrades, jackpot reloads, Leave,
monster fights, bounties, ambushes, the tile under a monster, event chips,
dice and reveal and its reload, old saves), render (icons distinct, every
machine state, symbols, monsters, every event vignette, dice), audio (every
arcade voice).

## Polish and QA (round 3)

Spectacle must never turn into clutter, and nothing may cost a frame it
does not need. Owner of this section: the QA pass.

### The announcer (game.js ANNOUNCER, `GAME.ann`)

One lane for the big centre-screen announcements: the `#banner` kinds (turn
banners, FIGHT / ELITE / BOSS, JACKPOT, phase two names, FINAL PHASE,
VICTORY) and the `#combo` banner. Only one is on screen at a time.
`banner(str, kind, secs, cls)` and `queueCombo(ev)` keep their old look and
call `announce({key, cls, dur, show, hide})`:

| class | priority | max wait | who |
| --- | --- | --- | --- |
| `turn` | 10 | 0.5 s | TURN n, YOUR TURN, ENEMY TURN, TURN OVER (one key: the newer replaces) |
| `fight` | 20 | 1.2 s | FIGHT / ELITE / BOSS at the start of a fight, AMBUSH! (shares the turn key: the newer replaces) |
| `combo` | 50 | 3 s | named grab combos, one after another in firing order |
| `jackpot` | 55 | 1 s | JACKPOT (three in one grab) |
| `rage` | 70 | 2.5 s | an elite or boss's phase two name |
| `final` | 80 | 3 s | the Prize Master's FINAL PHASE |
| `victory` | 90 | 4 s | VICTORY |

- A bigger class interrupts a smaller one: the live one gets a quick exit
  (`ANN.EXIT` 0.14 s: `#banner.quick` fades in 0.1 s, `#combo.out` runs cOut in
  0.12 s) and the bigger one follows. An interrupted announcement that had
  shown for less than half its time comes back afterwards if it is still
  fresh (a combo shows its words again without re-firing its rings, flash
  and sting); a turn banner never comes back.
- An equal or smaller one waits, bigger first then oldest, and is dropped
  once it has waited longer than its max wait (a YOUR TURN behind a VICTORY
  sweep is simply never shown). At most `ANN.QMAX` (8) wait.
- The same key again merges: the live one is re-shown with the new words
  (TURN OVER -> ENEMY TURN), a waiting one takes the new payload.
- Every end goes through the quick exit, so the live banner and one stepping
  out never overlap (`GAME.ann.visible()` is at most 1, the tests pin it).
- While a full-stage card is up (the versus card, a boss finale's title
  card) the lane holds: the live one steps out and the queue waits (and ages).
- A tap in the fight cuts the live banner short (after 0.3 s on screen).
- While a banner is up it is a keep-out zone for the floating labels
  (`fx.zone('ann')`): LUCKY CLAW!, KABOOM!, RED HOT! and the badges flow
  around it instead of under it. Those stay spatial labels (they belong to
  the place in the cabinet or the arena where they happen), managed by the
  label layout, not by the announcer.
- Leaving the fight, and every `startFight`, clears the lane.
- Old names still read: `S.comboQ` (the waiting combos), `S.comboT`,
  `S.bannerT`, `S.bannerStr`, `S.lastCombo`.

The corner lane is the sticker slap and the discovery toast (`metaToast`,
one at a time, top right / top left, dex sightings merge into one toast). It
now also waits while a full-stage card owns the screen.

`GAME.ann = {ANN, announce, banner, combo, tap, clear, visible, blocked, cur,
queue, log, exiting}`.

### Performance

Measured with `Emulation.setCPUThrottlingRate 4` in headless Chromium at a
390 x 844 phone viewport, DPR 2 (canvas scale 1.44). The container has no
GPU: canvas raster runs on the main thread in software, so the throttle
slows raster too and the absolute numbers are far worse than a phone's (a
phone rasters the canvas on its GPU). The relative changes are what count.

- Item sprites (`RENDER.item`): an item's art is static, so each (def, plus,
  frozen, device scale in quarter steps) is drawn once on a tight offscreen
  canvas and blitted after (one `drawImage` instead of a dozen clipped
  paths). Glow and alpha stay live. Headless / no transform / a flat-colour
  pass / a full cache (700): the live path, so the art suites still test the
  art. 24 items: 5.3-6.4 ms -> 3.2-3.9 ms per frame (1x).
- The cabinet: the static back (frame, neon tube, back panel, chute) is one
  cached layer per (size, neon, tilt, scale) (`RENDER.perf.cabLayer`), and
  the ~67 chase bulbs are batched (one path for the dark ones, one per lit
  colour, every glow under one additive composite instead of a save /
  composite / restore each). Neutral in software raster, a large cut in draw
  calls and state changes on a GPU.
- The arena backdrop is clipped to the band above the cabinet (it used to
  fill the whole 540 x 960 stage twice under the cabinet and the control bar).
- The chrome titles (the versus card name, BOSS DEFEATED / ELITE DOWN) are
  cached sprites (five passes of big stroked, clipped text per frame before);
  the finale's 14 rays are two fills.
- The map caches its reachable ring and the "n of m hexes lit" line on
  (position, bulbs, lit count) instead of rebuilding a Set and walking every
  tile each frame, and pools the road's points.
- Adaptive quality (`perfTick`, `GAME.perf`): real frame times averaging over
  `PERF.slow` (26 ms) for 0.5 s switch `RENDER.fx.lite` on (half the preset
  particle counts, half the pool); under `PERF.fast` (19 ms) for 2.5 s (x the
  number of times it has switched) lets go. A hitch over 250 ms is ignored.

Numbers (mean frame ms at 4x, HEAD -> this pass, interleaved runs): fight
idle 93-97 -> 85-88; the sustained heavy moment (JACKPOT + a tier 3 combo +
a label storm + party lights + confetti) 110 -> 89; boss idle 90-106 ->
84-97. The boss finale (ten chained blasts: ~400 particles, 36 flyers, the
whiteout, the card) stays around 210 ms at 4x in software raster and is the
case the lite mode exists for. Unthrottled: 52-54 fps in software raster.

### Feel

- The victory outro fast-forwards for a veteran (`OUTRO_FAST`: 10 fights on
  the profile): 1.0 s instead of 1.5, the ticket stream holds 1.5 s at most
  instead of 2.4, and an elite's finale holds the outro 0.8 s less. The
  versus card, the capsule ritual and the payout tally already had theirs. A
  tap skips all of them, and now the banners too.
- Enemy status chips are centred under the enemy and cut to one row that
  stops short of the neighbour's (`statusPips(..., {maxW, center, rows})`, the
  rest is a "+N" chip); a tap on the enemy lists every status in words. They
  used to run into each other from six statuses on.
- The player's status row scrolls instead of hiding chips under the GRABS
  pill, and packs tighter from six chips on (`#pstatus.many`).
- The versus card fits the crawler's name between the edge and the seam, and
  draws its comeback line over both panels, left of the seam (the enemy's
  panel used to cut "prize!" off, and SIR GRABSWORTH ran into the lightning).
- The map head shows "Act n" (the act's name never fit beside the buttons:
  "ACT 1: T..."; the name is on the map's own plate); its hint is 12 px.

### Bugs found and fixed

- Two big banners at once (the pre-announcer game: JACKPOT or ENEMY TURN in
  the player row while a combo banner filled the arena; the bot's HEAD run
  caught "ENEMY TURN / Hat Trick x3"). The announcer.
- A gulper could digest the whole bin (the bot's Ironjaw fight: 17 of 19
  items digested, the enemy healing on what was left, no way to win).
  `DIGEST_FLOOR`.
- The layout nits above (status chips, the player row, the versus card, the
  map head).

Known and left for the owner: an elite's Armor can stack without a cap (the
bot's Frost Knight reached 34 Armor by turn 110 against a low-damage build;
the player loses rather than locks; fixed in round 4, see "Feel (round 4)":
`COMBAT.ARMOR_MAX`), and the magnet claw on a crawler with
little metal (Lucky Lou) makes very long act 1 fights for a random bot.
- JACKPOT outranks the combos it causes: it holds its 1.4 s and the combos
  chain after it (the old way showed both at once, one over the arena and
  one over the player row).

### The playtest bot (scratchpad, not the repo)

A Playwright bot plays whole runs in a real Chromium page through
`window.CS.GAME`: every crawler, every claw type, Tilt 0 / 1 / 3 / 5 / 7 / 10,
half the runs in god mode to reach the later acts. It grabs at random items,
takes rewards and capsules, shops and buys at the prize counter, rests,
takes events, walks the map to landmarks and the boss, and reloads the page
mid-fight and mid-screen now and then. It watches for page and console
errors, no progress for 25 s of game time, NaN / undefined / Infinity in
the DOM and the HUD, overlapping or off-stage buttons, screens with no
enabled button, clipped single-line text, and two big banners at once.

## Endless and mutators (round 4)

Beating the Prize Master is no longer the end of the machine: it reboots
meaner and loops, and a run can bend the machine's own rules. Pure data in
`data.js` (the ENDLESS block), the fight side in `combat.js` (the ENDLESS
block), the flow and the look in `game.js` (the ENDLESS block, reached
through one-line hooks), the CSS in `index.html` (`<style id="endless-css">`,
the `#scr-loop` frame). No new sound names: the reboot and the score use
`whoosh, rumble, tick, vsSlam, coinIn, fanfare, stamp, ding, tiltUp`.

### Endless mode

- **The choice.** The win screen (`showWin`) banks the win as before (wins,
  Tilt unlock, daily score, stickers, `run.winDone`), shows the run score and
  offers **CASH OUT** (always the first `GAME.choose` entry: to the title, the
  run is over) or **KEEP PLAYING: ENDLESS**. While the offer is open the run
  stays saved on screen `win` (`save` keeps it, `load` reopens the win screen
  and counts nothing twice).
- **Loops.** Endless loops the three act biomes and their enemy pools: Loop 1
  is act 4 in act 1's biome, Loop 2 act 5 in act 2's ... (`DATA.endlessAct`),
  one map per loop. `run.act` stays 1..3 (the biome, the encounter pools,
  every act-keyed rule), `run.endless.loop` counts on. `newMap` seeds a loop's
  map with `':loop' + n` after the act (a classic run's seed string is
  unchanged), so every loop is a new map with every map rule intact (the map
  suite proves it over 18 loops).
- **Scaling** (`DATA.ENDLESS`, `DATA.endlessScale(loop, act)`, read by
  combat's `makeEnemy`, summons too): the pool is first lifted to act 3
  strength (`liftHp` [-, 3.2, 1.6, 1], `liftDmg` [-, 2.6, 1.35, 1]: the
  roster's act 3 / act n averages), then grows x1.25 hp and x1.1 hits per
  loop, compounding, on top of `DATA.DIFFICULTY`, its ramp and Tilt (never
  touched). `endlessFight`: normals carry floor(loop / 2) extra affixes,
  elites and bosses ceil(loop / 2) (at most 3, never Greedy on a gulper);
  bosses start in phase two from Loop 2 (`endlessRage`: the roar, the
  Strength, the pattern and the phase two trick at the bell; the half hp
  transformation never comes again), elites from Loop 4; every loop's boss
  borrows another boss's signature (`DATA.endlessMix`, `run.endless.mix`,
  `e.borrowed`: the Hoard with a Deep Freeze, Glacius with a Coin Avalanche;
  the data is copied, never mutated; a 24 turn fuzz covers every boss with
  every other trick). From Loop 2 each loop adds a random mutator
  (`DATA.mutPick`, never a repeat or a clash).
- **Between loops** (`endlessNext`, from `nextAct` once `run.endless` is set):
  heal 30%, +10 bulbs (Dim Marquee still dims), a new map, then the reboot
  screen, then the spare parts (if any claw part is left) and the boss relic
  as after acts 1 and 2. Relic, item, capsule and ticket rewards go on.
- **The reboot** (screen `loop`, `showLoop(lp)`, sd `{loop}`): the cabinet
  powers on like a CRT (a white line that opens to the full tube with a
  brightness flash, scanlines and a rolling band), a boot log types in (BIOS
  v(3 + loop), the loop's biome, MONSTER FIRMWARE with the hp / hit
  multipliers, the boss patches: phase two from the bell, the borrowed trick,
  the new mutator), LOOP N slams in chrome with a pink / cyan split and a
  glitch, the new mutator's card flips in, CONTINUE. A tap anywhere finishes
  the animation; reduced motion drops the power-on and the glitch; the music
  is off while it reboots. A reload shows the same screen.
- **The HUD.** The act stat becomes the Loop stat (label ENDLESS, "Loop N",
  a gold glow); the versus card says LOOP N BOSS (the Prize Master stays
  FINAL BOSS); the map head says Loop N; the stats list says Loop reached.
- **The end.** Death in Endless (`endlessOver`, from `showGameOver`) is not a
  loss: the win was banked. It records the loops (`meta.endless.best`), the
  Endless score and its best, lists the stickers earned since the reboot, and
  shows GAME OVER, MAN with LOOPS REACHED (DEEPEST YET!). The run save goes as
  for any finished run.

### Run mutators

`DATA.MUTATORS` (14, `MUT_IDS` in panel order), each `{id, name, icon, color,
mult, text, fx, excl?}`; `DATA.mutMods(ids)` merges them (neutral for none),
`mutClean(ids, max)` keeps the known, unique, compatible ones in order,
`mutClash(a, b)`, `mutMult(ids)`, `mutPick(rng, have)`. The effects are data
the engine reads; nothing is hard wired per id:

| mutator | x | fx | where |
| --- | --- | --- | --- |
| Low Gravity | 1.15 | `gs` 0.36, `drag` +0.7 | every body (`mutBody`) |
| Everything Is Glass | 1.25 | `glass` | the body's material is copied with the glass trait: cracks (+50% play), a second crack shatters |
| Bomb Party | 1.1 | `temp` 2 Firecrackers, +1 a turn (max 5) | real bombs in `F.bin` (`mutFightStart`, `mutTurn`) |
| Magnet Storm | 0.9 | `drift` 420 px/s^2 toward the claw's column | a world pre-hook while the claw is idle / aiming / dropping / closing |
| Tiny Items / Giant Items | 1.05 / 1.2 | `scale` 0.7 / 1.35 (they clash) | `PHYS.scaleShape` on the body, the art drawn at the same scale |
| Slippery Floor | 1.1 | `slick` x0.1 | pile and floor friction, never the claw's grip |
| Double Grabs, Half Damage | 1.1 | `grabs` x2, `dmgOut` x0.5 | `F.claw.grabs`; `COMBAT.damage` from the player |
| Hungry Hungry | 1.3 | `affix` greedy | every enemy, summons too (not gulpers) |
| Jackpot Fever | 1.2 | `rules.comboTwice`, `affix` hasty | `F.rules` (combos fire twice), every enemy Hasty |
| Blackout | 1.3 | `dark` | the cabinet goes dark but for a flashlight cone and pool under the claw, the chute keeps a faint green glow |
| Conveyor Belt | 0.95 | `belt` 55 px/s | bodies on the floor ride toward the chute (the pile heaps on the divider); chevrons and rollers drawn on the floor |
| Wobbly Legs | 1.15 | `quake` | the cabinet tilts a random way at the bell and every turn (the `tilt` gravity) |
| Double Trouble | 1.35 | `extra` 1 | one more monster from the act's normal pool in every new normal fight (`FS.start` keeps it for a reload) |

- **Picking.** Character select has a Mutators panel under the claw row
  (`mutPickerRow`, plain taps, the crawler cards keep their `GAME.choose`
  indices): a header with the picked badges and the multiplier (tap to open),
  then 14 chips with their multiplier. Off by default, up to `MUT_MAX` 3, a
  clash swaps (Giant switches Tiny off), a fourth is refused with a toast.
  The pick lives on the profile (`meta.mutPick`) and is copied to `run.muts`
  by `newRun`. The daily run brings its own 1 or 2 (`DATA.dailyMutators(key)`,
  the same for everyone that date), named on the title's daily button.
- **In the run.** Every fight reads `run.muts` fresh (`COMBAT.newFight` sets
  `F.mut`), so nothing outlives the run. The badges lead the relic strip in
  the HUD (a tap explains; a loop's own ones have a solid rim).

### The score

`DATA.runScore(run, won)` -> `{mode, base, tiltM, mutM, mult, total, lines}`:
floors climbed (the act, or 3 + the loop) x400, monsters beaten x25, bosses
down x300 (`run.sc.bosses`), jackpots x40, combos x15 (`run.sc.combos`, from
`F.stats.combos`), Endless loops x1000, the Prize Master +2500 (a win, and
always in Endless); times the Tilt multiplier (+10% a level) and the mutator
multiplier. Modes `classic | daily | endless` (the daily keeps its own
`dailyScore` too). Recorded once per mode per run (`endlessScore`,
`run.scoreRec[mode]`, `run.scoreTop`) before the run-end stickers are listed;
the best per mode is `meta.scores`. The win screen, the game over and the
Endless end show it in a gold box: the number counts up (ticks rising in
pitch), the lines and the multipliers under it, then NEW BEST! slaps on with
the fanfare (or a ding), and "was N" / "best N".

### Stickers

Insert Another Coin (enter Endless), Loop de Loop (Loop 3), Groundhog Claw
(Loop 6 on the profile, with a progress bar), Mad Science (win with 2+
mutators), High Score (25,000 in one run).

### Save fields

Run (all optional, `endlessRunFix` defaults them for older saves): `muts`
[ids], `endless` {loop, mix, since (the sticker count at the reboot), adds
(the loop's mutators), over} or null, `sc` {bosses, combos}, `scoreTop`,
`scoreRec` {mode: result}, `winDone`. Screen `loop` (sd `{loop: {loop, act,
added, mix, then}}`) and `win` (while the offer is open). Meta
(`endlessMetaFix`): `scores` {classic, daily, endless}, `endless` {best,
runs, score}, `mutPick` [ids]. No key was renamed.

`GAME.endless` = `{start, next, showLoop, cont, pick, toggle, picked,
openPicker, mods, runMods, score, offer, tick, draw, scoreUp, loopFx}`.
Tests: data (the mutators, clashes, merges and picks, the daily's by date,
the loop scaling and the borrowed tricks, the score formula, the stickers),
combat (the lift on hp and hits per loop, rage from the bell, the borrowed
trick and a fuzz over every pairing, the mutators' grabs, half hits,
affixes and rules, a plain run untouched), map (18 loop maps with every
rule), game (the win screen's offer and its reload, Cash out, the reboot and
its reload, the loop map, the Loop stat, LOOP N BOSS, the next loop's
mutator, a reload mid fight in Endless, the Endless end and its bests, every
mutator's effect in the cabinet and gone after the run, real grabs with
every mutator, the panel and the pick, the daily's own, the count-up and
NEW BEST, the High Score sticker, old saves and profiles).

## Feel (round 4): onboarding, rooms with character, haptics

The game grew four rounds of systems on top of a three-card coach. This pass
teaches them as the player meets them, gives the quiet rooms a face, puts a
buzz in the hand and moves words off the play areas. Presentation only,
except the Armor cap. The flow lives in `game.js` (the FEEL block, reached
through one-line hooks), the art in `render.js` (the FEEL block, `feel*`),
the frame in `index.html` (`#tipCard`, `#scr-tips`, `<style id="feel-css">`).

**The first fight coach** stays three short cards (steer, drop, the chute;
the third now says three in one grab is the JACKPOT, a double is two, and
that new things get a tip card). The help page says the same.

**Contextual tip cards** (`FEEL_TIPS`, 15): `map` (light the way), `combo`,
`hungry` (a gulper), `bomb` (an enemy's lit bomb), `fuse` (your own bomb's
fuse caught), `crack` (cracked glass), `capsule`, `tickets`, `arcade` (a lit
cabinet), `roam` (a monster on a lit hex), `tower` (a lit tower), `tool`,
`luck` (the meter), `sig` (a boss signature), `affix` (an enemy with
affixes). Each is a title, one or two sentences and a tiny animated picture
drawn with the game's own art (`RENDER.feelTipArt(ctx, id, s, t, {enemy,
item, items, clover})`, the defs picked from what is on screen).
- Triggers: `feelScan` every 0.3 s reads the state (the map's lit tiles, the
  run's tools, tickets and banked capsules, the fight's enemies, affixes,
  signatures, the Luck meter, lit bombs, cracked items: `FS.mst`), and
  `feelEvent` (at the top of `applyEvent`) the events `combo`, `binBomb`,
  `binEat`, `luck`, `boss`. A tip queues once (`feelTipWant`).
- One at a time: the card slides in over the bottom lane (left 8, y 836, 364
  wide: the tray and the hint in a fight, END TURN stays clear), a tap puts
  it away (or it goes after `FEEL_TIP.life` 12 s), the next waits
  `FEEL_TIP.gap` 0.9 s. Only on the fight, map, reward and capsule screens;
  in a fight never while a grab is in flight or the claw is not idle / moving,
  never over the coach, the versus card, a finale card, the enemy turn or the
  outro; on the map never mid-walk.
- Saved as met the moment it shows (`meta.tips[id] = 1`). A card that the
  player leaves for a screen without a lane within `FEEL_TIP.keep` (2 s) goes
  back to the front of the queue, unmet.
- Veterans: a profile from before the tips with 20+ fights starts with the
  pre-round-3 systems met (`FEEL_VETERAN`), so they only meet the new ones.
- **Tips page** (screen `tips`, the title's `Tips` button): a bar "n of 15
  tips met", every met tip in full with its picture, the rest dark "???",
  and `Reset tips` (clears `meta.tips`, they pop up again).
- The enemy popover (a tap on an enemy) now lists its affixes in words, which
  the affix tip points at.

**Rooms with character.** A canvas strip (508 wide, drawn at 2x every frame
by `feelDraw`) at the top of three screens, the flows and button indices
unchanged:
- The shop: **Chester**, a prize chest mimic in a tiny top hat, on the
  counter under a flickering SHOP sign, loot on the shelves, a cash register
  (`RENDER.feelKeeper`, st `{t, mood, moodK, talk, blink, look}`). He idles
  (the lid breathes, blinks, looks around, waves), greets you once per shop
  (`FEEL_QUIPS.hi`), rotates a quip every 7 s, beams on a buy or a sale (the
  lid flies open, smiling eyes, sparkles, the drawer pops, a ding), frowns
  and shakes his head when you are short (clamped lid, knitted brows, a
  groan). The speech bubble is DOM (`.keepBub`); under his line it shows what
  just happened (the shop's toast: "Bought X.", "Not enough gold.").
- The rest stop: a campfire in a stone ring between dead cabinets, flames,
  rising sparks and smoke, the crawler on a log with their Rig on their
  back, warming a hand and toasting a marshmallow (`RENDER.feelCampfire`, st
  `{t, charId, heal}`). Resting: hearts rise, a green glow, a "+N HP" float, a
  chime.
- The forge: a furnace in a brick wall, an anvil with a hot ingot, a hammer
  on a piston arm (`RENDER.feelForge`, st `{t, item, heat, hit, strikes,
  done}`). Upgrading: the item goes on the anvil glowing orange, three blows
  (a clank, a flash, sparks, a buzz and a thud of the strip each), then a
  sparkle and a "+"; a card picked further down scrolls the anvil into view.
- The exit beat (`feelLeave(kind, fn, secs)`): in a page the rest (1.5 s) and
  the forge (1.7 s) play their moment before the map; a tap skips it
  (`feelBeatSkip`), the choices are inert meanwhile. The effect is applied and
  saved first with `sd.done`, so a reload during the beat goes to the map and
  never heals or upgrades twice (`showRest` / `showForge` check `feelDone`).
  Headless (the suites) it goes straight on, as before.

**Haptics** (`feelHaptic(kind)`, the game's `haptic` helper): `navigator.vibrate`
with a pattern per kind (`FEEL_BUZZ`): `clamp` (the prongs close), `deliver`
(each delivery), `jackpot`, `bigHit` (a crushing hit or crit), `hurt` (taking
damage), `capCrack` / `capBurst` (the capsule), `slotWin` (a slots win; other
cabinets `win`), plus the older `tap`, `hit`, `boss`. Guarded (no API: a quiet
no-op), one buzz per kind per 0.08 s, off with the title's `Buzz` toggle
(`meta.settings.haptics`) and off in reduced motion (Shake off, or
`prefers-reduced-motion`). `AUDIO.haptic` is unchanged and unused by the game.

**Toast lanes** (`feelToastLane`, `#toast[data-lane]`). Screens with a
central play area keep toasts off it: the arcade (`arc`: y 826, over the
how-to line under the machine, never over the reels, the peg board or the
wheel), the fight (`bot`: the tray row under the cabinet; `bothi` y 772 while
a tip card holds that lane), the prize counter (`top`), the shop (`keep`: the
keeper says it in his bubble; scrolled past him, the bottom lane). The lane
follows the screen while a toast is up. The corner lane (stickers, discovery
toasts, `feelCorner`, `FEEL_CORNER`) goes compact on the reward, shop and
counter screens too, and on the reward it lifts into the empty right of the
title row (`.hi`, top 6 px), so it no longer covers the payout; it follows a
screen change (a sticker slapped on the map shrinks when the reward opens).

**Fixes.**
- Enemy Armor is capped at `COMBAT.ARMOR_MAX` (8): `COMBAT.status` clamps an
  enemy's gain (a gain at the cap adds nothing, the player is not capped),
  `def.status` seeds and the Armored affix respect it, and a swallowed metal
  item lends only the Armor it really added (so it never takes back more).
- 360 px: the stage scales uniformly, so layout is the 540 one; an audit of
  the reward (a crowded payout with a DOUBLE, two capsules, the three longest
  item names), the shop (scrolled) and the prize counter found no box past
  the edge and no clipped text. What did cover them was the corner lane (a
  full-size sticker over the first payout rows, the shop's gold and the
  counter's case): compact there now, and up in the title row on the reward.
- The arcade's play counts (`meta.arc`) were dropped on every load (the
  veteran speed-up never stuck); `loadMeta` keeps them now.

**Save fields.** Meta: `tips {id: 1}`, `settings.haptics` (both defaulted by
`feelFix`; junk is repaired). Run sd: `rest.done` / `forge.done` during the
exit beat. No key was renamed; old profiles and saves load.

`GAME.feel` exposes `TIPS, TIP, BUZZ, LANE, QUIPS, want, show, dismiss, safe,
scan, reset, showTips, haptic, hapticOn, setHaptics, lane, say, beatSkip, fix`
and the live `cur, queue, log, buzz, keeper, fire, forge, beat`.
Tests: combat (the cap on gains, the player uncapped, the Frozen Knight over
120 turns, Armored at the cap), render (a distinct picture for every tip,
the keeper in every mood, the campfire and its heal, the forge's strike and
sparkle, null states), game (the queue, one at a time, met and saved,
reload, reset; never during a grab, a carry, the coach; unread cards requeue;
every trigger from the map and a fight and the events; haptics patterns, the
toggle and its save, reduced motion both ways, a real clamp and delivery, no
API; the lanes per screen and the keeper's note; the shop's moods, quips and
unchanged buttons; the campfire's beat, its save and a reload in it, no
second heal; the forge's three blows; a tap skip; the Tips page; veterans,
newcomers, junk fields, old rest saves, the arcade counts).

## Prize Vault (round 5): a meta ticket sink, cosmetics, the share card

Tickets had nowhere to go once a run ended. Now every arcade ticket a run
wins also lands in a lifetime wallet, and the title's Prize Vault trades it
for cosmetics that change how the machine, the claw and the crawler look.
Pure looks: nothing here touches a fight. Data in `data.js` (the VAULT
block), the flow in `game.js` (the VAULT block, reached through one-line
hooks), the art in `render.js` (the VAULT block, `RENDER.vault`), the frame
in `index.html` (`#scr-vault`, `<style id="vault-css">`), the sounds
`vaultOpen, vaultBuy, vaultEquip, vaultNew, vaultDupe, vaultShare`.

**Vault tickets.** `addTickets(n)` with n > 0 (payouts, capsules, arcade
wins, relic tickets, anything that pays tickets in a run) also banks
`n x DATA.VAULT.SHARE` (1: all of it) into `meta.vault.tix` and `earned`.
Spending tickets in the run (the prize counter, the slots) never takes any
back. The wallet saves half a second after it changes (and with any other
meta save). The title shows it on a gold-and-pink PRIZE VAULT button under
the daily run, with a pink count of NEW prizes and an unopened capsule.

**Cosmetics (`DATA.COSMETICS`, `COSMETIC_IDS`, `VAULT_CATS`).** Five shelves,
43 prizes, each `{id, cat, name, rarity c|u|r|l, text, look, char?, ach?,
free?}`; `look` is read by the renderer only.

| shelf | what it changes | prizes |
| --- | --- | --- |
| Cabinets (`skin`, 10) | the frame (fill, a frame pattern, trim), the back panel (fill and pattern), the bulbs (lit, glow), the neon | Neon Classic (default), Candy Shop, Retro Wood, Chrome Deluxe, Jungle Bash, Haunted House, Deep Space, Molten Core, Gold Jackpot (the Mega Jackpot sticker), Rainbow Riot (l) |
| Claw paint (`paint`, 10) | the steel of every claw type (the prongs, the hub, the head, the carriage; the magnet's drum, the scoop's shell, the glove), plus an effect: glow, sparkle, frost, stripes, stealth red eyes, rainbow | Factory Chrome (default), Bubblegum, Mint Chip, Copper Pot, Stealth Black, Glow in the Dark, Candy Cane, Solid Gold, Frostbite, Rainbow Chrome (l) |
| Marquees (`marquee`, 7) | the words on the top frame, their style (neon, retro, dot matrix, glitch, fire, gold, rainbow) and the bulb pattern (chase, blink, wave, sparkle, alternate, fast, rainbow) | CLAWSPIRE (default), GRAB IT!, PRIZE ZONE, CL4WSP1RE, HOT CLAW, WINNER! (the Prize Master Down sticker), JACKPOT (l) |
| Outfits (`outfit`, 2 per crawler) | a hat, a cape or shades drawn over the portrait (the HUD, the map token, the versus card, the share card) | Royal Cape, Cool Shades; Wizard Hat, Flower Crown; Pirate Hat, Star Shades; Ten Gallon Hat, High Roller Cape |
| Trails (`trail`, 8) | marks the crawler leaves while walking the map, fading over 2.6 s | Dust (default: the old puffs only), Sparkles, Hearts, Fire Walk, Snowfall, Coin Drop, Confetti (the High Score sticker), Rainbow Road (l) |

Prices (`VAULT.PRICE`): common 40, uncommon 90, rare 180. Legendaries (the
rainbow ones) only come out of a Vault Capsule; sticker prizes only come with
their sticker (`vaultForSticker(achId)`: `achUnlock` grants them, and a
profile that already had the sticker owns them on load). `vaultHow(id)` is
`own | buy | sticker | capsule`, `vaultPrice(id)` 0 when not for sale.

**The Vault Capsule** (`VAULT.CAP_PRICE` 60). `DATA.vaultRoll(rng, owned,
pity)` -> `{id, tier0, ups, tier, dupe, tix, pity, lucky}`: the tier by
`CAP_W` (c 58, u 30, r 10, l 2), a prize you do not own `FRESH` (60%) of the
time when one is left in the tier, then dressed for the ritual (it shows
`UP` 30% per step lower and climbs through `ups`). `PITY` (12): the twelfth
capsule in a row without a legendary is one while any is left to win. A dupe
pays `DUPE` tickets back (12 / 25 / 55 / 150). The game pays and rolls in the
same beat and saves the roll as `meta.vault.pend`, so a reload reopens the
same capsule and never charges twice; the prize is paid at the burst. The
ritual is the run capsule's: drop and bounce on a pedestal, rays, taps crack
it (sparks, rings, shake), an up flashes the new colour (RAINBOW UPGRADE! for
a legendary), the burst pours out confetti and, for a legendary, a rainbow of
rings and slow motion; the prize floats up out of the halves, then a card
with NEW! or "Already yours: +N vault tickets back", Equip it, Again (when
the wallet allows) and Back to the vault. Space / Enter taps.

**The screen** (screen `vault`, never saved, never touches the run save).
The canvas paints the wall (`RENDER.vault.wall`: a pegboard, shelf glows, a
PRIZE VAULT neon sign in chasing bulbs, the counter window) and, behind the
glass (`vault.glass`), a live preview: the claw picker's demo cabinet
grabbing on its own in the previewed skin, marquee and paint (a tap on the
claw switch cycles the claw type), the crawler in the previewed outfit (the
crawler switch cycles them), and a little walker leaving the previewed trail.
The DOM: Back, the wallet (a tap explains it), a detail strip for the picked
prize (rarity, shelf, text, and Buy / Equip / Take off / the sticker it needs
/ capsule only), five tabs with NEW counts, the shelf (a glowing slot per
prize: a thumbnail, `RENDER.vault.thumb`, the name, the price or OWNED / ON /
STICKER / CAPSULE, legendary slots with a rainbow rim), and the Vault Capsule
button with the odds and the pity count. Picking a prize previews it; a buy
throws ticket stubs from the wallet into the window, confetti, a ring, the
cabinet's party lights with YOURS! on its marquee, and puts it on.

**The renderer** (`RENDER.vault`): `equip(eq)` (the game calls it on load and
on every change), `look(cat, id?)`, `thumb(ctx, id, x, y, size, t)`,
`marquee(ctx, look, x, y, size, t, neon)`, `trail(ctx, pts, n, t, id?,
size)`, `withOutfit(ctx, char, x, y, size, t, id)`, `wall`, `glass`,
`share(ctx, st)`, `RB` (24 rainbow hues), `TRAIL_LIFE`. A draw can override
the equipped set: `st.skin` / `st.mqId` on `cabinetBack` (the old `st.marquee`
is still the party text), `cfg.paint` on `claw` (the paint never leaks into
the next claw: `CHROME` is restored), `withOutfit` for a portrait. The skin's
id is part of the cached cabinet layer's key; the rainbow skin's tube and
bulbs run live over it. The alarm (FINAL PHASE) and the party lights win over
a skin's bulbs and a marquee's pattern. With the defaults equipped every draw
is the old one exactly (the render suite pins it).

**The map trail.** While the crawler walks, `vaultTick` samples its eased
position every 0.05 s (world coordinates, 48 marks at most); `drawMap` draws
them under the crawler (`vaultTrailDraw`), each fading over 2.6 s.

**The share card.** A Share run card button on the game over (and Endless
end) and the win screen, registered after the screen's own buttons so
`GAME.choose` indices stay put, shown above the Highlights.
`vaultShareCard(run, won)` draws `RENDER.vault.share` on an offscreen 1080 x
1350 canvas: the logo, VICTORY! / RUN OVER, the crawler in their outfit with
their name, the score (the run's best, `scoreTop`, else `runScore`), the mode
and act or loop, a Tilt badge, tiles for the best combo (with its stars), the
biggest hit and the boss defeated, the mutator chips, a mini cabinet in the
equipped skin, marquee and paint with the run's rarest items and the claw
type, and PLAY FREE with https://games-71g.pages.dev/clawspire/. Share turns
it into a PNG (`toBlob`) and hands it to `navigator.share({files})` when the
device can share files; otherwise (or when the share fails for any reason but
a cancel) it downloads it. Headless the canvas is a stub and nothing throws.

**Save fields.** Meta `vault` (`vaultFix` defaults and repairs every field;
old profiles get an empty wallet and the old look): `tix`, `earned`,
`spent`, `caps`, `pity`, `shares`, `owned {id: 1}` (the defaults always),
`eq {skin, paint, marquee, trail, outfit {char: id}}` (only owned, only the
right shelf and crawler), `news {id: 1}`, `pend` (a paid capsule). No key
was renamed; the run save is untouched.

`GAME.vault` = `{show, leave, select, buy, equip, unequip, bank, fix, capsule,
open, tap, skip, close, preview, draw, shareCard, shareInfo, share,
onSticker, tick, URL, WIN, state, ui, cap, trail, card}`. Tests: data (the
table: counts, two outfits per crawler, defaults, legendaries, prices, the
sticker prizes, no em dashes; the capsule odds over 20,000 rolls, determinism,
the climbing reveal, dupes and their refund, fresh first, the pity), render
(no DATA is the default look; every skin, marquee, paint on every claw type,
outfit on its crawler only, trail and thumbnail draws balanced, without NaN
and distinct; the defaults draw the old art exactly; equip applies; the paint
never leaks; the wall, the glass, the share card for a win and a loss), game
(banking, spends never reduce it, a real payout banks exactly, the title
button and its index, the screen and every prize previewed and drawn, buy /
refusals / equip / outfits / take off, save and load with the renderer
applied at boot, old and junk profiles, the capsule paid once across a reload,
cracked, equipped, dupes refunded, too poor refused, the pity, sticker
prizes, every cosmetic in a real fight and a real grab, the map trail, the
share card and both Share buttons with the old first choices).

## Pets (round 5): companion pets, whack-a-mole, skee-ball

A buddy that lives on the cabinet and plays with the machine, and two more
map cabinets. Pure data in `data.js` (the PETS block), placement in `map.js`
(`placeR5`, called at the end of `placeArcade`), the flow in `game.js` (the
PETS block and the ARCADE R5 block, reached through one-line hooks), the art
in `render.js` (the PETS block, `RENDER.pet*`, `arcMoles`, `arcSkee`), the CSS
in `index.html` (`<style id="pets-css">`), the sounds in `audio.js`.

### Companion pets (`DATA.PETS`, `PET_IDS`)

A run carries one pet (`run.pet = {id, name, xp, lv, seed, fed}`). In a fight
it sits on the cabinet's top frame at the left (`PET_K.perchX/Y`), its name
tag and xp bar on the frame under it (`RENDER.petTag`); the player row pads
its status chips past it (`#playerRow.hasPet`) and the floating labels keep
off it (`fx.zone('pet')`). A tap on it shows its trick in words (`petTap`).

| pet | when | trick (what the game does to the physics) |
| --- | --- | --- |
| Hamster | turn | runs down the wall and along the floor, shoves the free item lowest in the pile and farthest from the chute toward it (vx 380 x power) |
| Parrot | turn | flies to the most buried item, pecks it loose and carries it in its beak (a velocity weld under its feet) up onto the top of the pile, a little toward the chute (further with levels) |
| Cat | turn | pounces on a random item from the top of the pile and bats it on a ballistic arc at the chute; the aim error shrinks with power (+-110 / power px), so it sometimes lands in: a FREE PRIZE, "NICE SHOT, CAT!" |
| Octopus | lift | on a lift with cargo it leaps onto the hub and holds the lowest cargo item with a long arm: a weld draws it under the hub (the carrier's velocity fed forward), so it cannot slip; on the release it lets it drop straight down through the opening prongs |
| Firefly | turn | finds invisible items (the Ghost's vanish; one, two from Lv 3, three at Lv 5), else spotlights the top item nearest the chute: deliver it this turn for `petGlow(lv)` gold; in a Blackout it hovers in the cabinet by the flashlight and the pile shows through its pool of light |
| Magnet Mouse | turn | stands on the floor under the claw's aim and pulls the metal item farthest from it across the floor (any item at half strength when there is no metal) |
| Trash Raccoon | turn | eats one junk item from the bin for the fight (`F.purged`, an item's worth of xp); no junk: it rummages (`PHYS.hop`) |
| Golden Goose | grab | a grab that delivers `petEgg(lv).need` items (3, 2 from Lv 3) lays a golden egg: `COMBAT.gainGold` and `COMBAT.tickets` (the payout's ticket line) |

- **Uses.** Once a turn, twice from Lv 3 (`petUses`). A 'turn' pet acts once the
  pile has settled (nothing faster than 150 px/s, the claw idle or aiming, no
  queue, `PET_K.first` 0.9 s into the turn), its second use `PET_K.second` after
  your first grab has settled. A use with no target is spent with a shrug.
  Any pet action resets `FS.delivered`, so a prize it knocks in never turns the
  last grab into a DOUBLE.
- **Motion.** Every action is legs (`petLeg`: a leap, a run, a flight, homing on
  a target that rolls), a 'do' beat (the effect lands at `fxAt`), then legs
  back to the perch. The goose never leaves the perch; the octopus rides the
  hub until the claw lets go.
- **Determinism.** The pet's picks come from its own rng stream off the fight
  seed (`FS.seed ^ 0x7e7a11`), never the fight's `FS.rng`, so a fight without a
  pet is bit for bit the same as before. `FS.pet.log` records every trick.
- **XP and levels** (`PET_XP` [0, 12, 30, 60, 100], `PET_MAX` 5): one per
  delivered item, `PET_GAIN` fight 2 / elite 4 / boss 6 for a win, a treat 8.
  Power `petPow(lv)` = 1 + 0.2 per level. Looks (`petLook`): a scarf from Lv 2,
  a crown from Lv 4, orbiting sparkles at Lv 5. A level up in a fight is a
  banner through the announcer (class `pet`, priority 52, between combos and
  the jackpot: "MITTENS LV 3!") with confetti, a ring and the tag flashing; in
  the pet shop the machine's sign; elsewhere a toast.
- **Reactions.** Hearts on a delivery, a cheer on a jackpot, a kill and a win,
  scared on a hit to you, a roar (phase two), a boss signature and the versus
  card, a sulk on a slip or an empty grab, focus on a lift, asleep after 14 s of
  nothing, a chomp while eating; its eyes follow the claw and it blinks.
- **The map.** The pet naps on a little bed beside the crawler's portrait
  (`RENDER.petBed`), hops along on a walk, cheers on a level up.

### The pet shop (tile `petshop`)

One per map (`placeR5`: the cabinet rules, leaning toward the start: the
nearest third of its spots), a landmark. It opens on the arcade screen
(`petShopShow`, `S.arc.g === 'petshop'`): three pets in pens
(`DATA.petOffer`, rolled once from the tile's seed, never the pet you have,
saved as `content.pet = {offer, names, adopted, treats}`), each with its name,
kind, card line (`petText`, the level's numbers) and a button: **Adopt
(free)** when you have no pet (the starting choice), **Swap (25 gold)**
(`PET_SHOP.swap`) when you do. One adoption per shop: the door swings open,
the pet leaps out, ADOPTED! / NEW BUDDY!, confetti. Below, your buddy on its
bed with its xp bar, **Treat (12 gold)** for 8 xp (hearts; 3 a shop), and the
album (`meta.pets = {id: {n, lv}}`, "PET ALBUM n/8"). The tile is done once a
pet is adopted there.

### Whack-a-mole and skee-ball (tiles `moles`, `skee`)

One of each per map (`MAP.ARC_R5`, `MAP.isArcade` counts them), by the
cabinet rules; 1-2 plays (rounds / games). They run inside the arcade flow:
`r5Own(C)` dispatches `arcAct / arcBegin / arcHurry / arcSkip / arcSettle /
arcPrizeAt / arcLeave / arcPointer / arcTick / arcDrawMachine / arcInfo` to
the round 5 code. The pay-once model: a play spends its token and is saved
the moment it starts (`A.live`), its outcome is saved the moment it is known
(`A.pend`) and `arcSettle` pays it and clears it on the same beat, so a reload
replays or settles, never pays twice. After `ARC.fastAfter` plays everything
runs faster.

- **WHACK-A-MOLE** (`WAM`, `WAM_TIERS`). A 3 x 3 table of holes under a
  scoreboard (score, a time bar, best or the live combo). Play: a 3-2-1
  countdown (1.2 s when fast), a 14 s round. The pops are seeded
  (`wamSched(A.live.seed)`: the pace quickens and the stays shorten, doubles in
  the second half, a hole never busy twice): moles 10, golden moles 30 (8%, a
  crown and a glow, shorter), bombs (16%) cost 20 and the combo. Tap a hole to
  whack (the mallet swings, BONK, stars, a kick, "+n", "x5 COMBO!"): whacks
  within `chainGap` (1.1 s) chain a combo worth +2 per step (max +20); an empty
  hole breaks it. At TIME! the score is saved (`A.pend`) and after a beat paid
  by tier: MOLE MASTER 480+ (a rare capsule, 30 gold, 12 tickets), MOLE MANIA
  340+ (a capsule, 8 tickets), GREAT 220+ (25 gold, 6 tickets), NICE 110+ (12
  gold, 3 tickets), else 2 tickets (0: nothing). A simulated player over 300
  rounds scores 180 casual, 336 good, 532 sharp (a perfect round ~710).
  A reload mid-round restarts the same round (the token stays spent); Stop or
  Leave mid-round pays the score so far.
- **SKEE-BALL** (`SKEE`). A ring board (10 / 20 / 30 / 40 / 50 concentric, two
  100 cups in the top corners) above a wooden lane with neon rails and a hump.
  Five balls a game: swipe up the lane (a longer, faster swipe goes higher;
  the release point and the sideways flick aim) or tap Roll on the swaying
  aim and pulsing power meter. `skeeSim(aim, pow, seed)` decides at once where
  it lands (power sets the height, aim the side, +-20 px of seeded wobble; too
  hard bounces off the back into the 10) and records the path: the roll up
  the lane (the ball shrinking with the perspective), the hop off the hump,
  the arc, the drop into its ring (lit, the score pops, confetti for a 100).
  Each roll is saved at the swipe (`A.live.roll`), each landed ball on
  `A.live.balls`; after the fifth the total pays a ticket per 10 points (the
  ticket spray), plus 15 gold at 180+, a capsule at 270+, SKEE JACKPOT at 380+
  (a rare capsule and 30 gold). Leave mid-game pays the balls rolled.

**Tips** (FEEL): `pet` (a fight with a pet), `petshop`, `moles`, `skee` (a lit
tile), with their own pictures (`RENDER.feelTipArt`).

**Sounds.** `petChirp` (opts.pitch per species), `petHop, petAct, petCrunch,
petHonk, petLevel, petLove, molePop, bonk, moleBomb, moleCombo, whistle,
skeeRoll, skeeHop, skeeRing, ticketSpray`.

**Save fields.** Run: `pet` (null or `{id, name, xp, lv, seed, fed}`,
`DATA.petFix` repairs it, an unknown id is dropped, a save from before pets
has none). Map: tile types `moles | skee | petshop`; `content.arc` for the
two games carries `live` (the game in progress) and `best`; `content.pet` the
shop's pens. Meta: `pets {id: {n, lv}}` (kept by `loadMeta`). No key was
renamed; old saves and maps load (no new tiles, no pet).

`GAME.pet = {K, MOVE, of, give, gain, fix, fs, start, hold, tick, draw,
mapDraw, event, rig, grab, deliver, tap, shop, adopt, treat, album}`,
`GAME.wam = {WAM, TIERS, sched, perfect, pays, whack, holes, visible, state}`,
`GAME.skee = {SKEE, sim, pays, roll, meter, state}`. `DATA` adds `PETS,
PET_IDS, PET_XP, PET_MAX, PET_GAIN, PET_SHOP, petLevel, petNext, petPow,
petUses, petLook, petEgg, petGlow, petName, petNew, petFix, petOffer,
petText`; `MAP` adds `ARC_R5, PET_TILE, placeR5`; `RENDER` adds `pet, petTag,
petBed, petIcon, arcMoles, arcSkee, pets {COL, KEYS, SCARF, ART, tipArt,
TIPS}`. Tests: data (the table, levels, looks, the offer, names, repairs, card
lines), map (one of each per world over 60 seeds by the cabinet rules, off the
road and the monsters, the shop near the start, deterministic, small maps,
the save round trip and old saves), render (every pet in every pose, mood and
level look, distinct; the tag, the bed, the icons, the hexes; every machine
state; the tip pictures), game (the perch, one use a turn and two from Lv 3,
every trick moving the right thing, the octopus through real lifts,
determinism, xp and the banner, reactions, the tap, save / load / junk / old
saves, the pet shop's adoption, swap, treats and reload, tips, whack-a-mole's
schedule, scoring, combos, bombs, tiers, pay once across reloads, reload
mid-round, leaving mid-round, skee-ball's simulation, rings and cups, the
game paid once, reload mid-roll, swipes, leaving mid-game).

## Polish (round 5): item identity, relic medallions, layout fixes

Presentation only. The art lives in `render.js` (the POLISH blocks next to
`itemArt` and `relicIcon`), the fixes in `game.js` (`pol*` helpers), no save
field and no rule changed.

**Item identity.** 122 items shared 48 art keys, so two flasks differed only
by colour (48 distinct drawings; now 121 of 122). Three layers, all drawn into
the item sprite, so the per-frame cost is unchanged:
- **Silhouettes** (`RENDER.pol.SIL`, 43 items, same physics bounds): the
  starters first (Rusty Sword with notches and rust, Dented Shield, Shiv,
  Cherry Bomb as two cherries on a lit stem, Peppermint, Sour Drop, Lucky
  Coin, Lead Shot, Glass Bead, Frost Pearl), the rares and legendaries
  (Aegis, Dragon Egg, Stolen Gem with its price tag, Elixir heart flask,
  Blizzard Orb snow globe, Crystal Ball on a stand), the bags (a drawstring
  pouch with its marbles / beads / sweets / bolts peeking out), the daggers
  (serrated, twin, a blowgun dart, an ice pick), Pet Rock with googly eyes,
  a gumball machine, a hex nut, a thorn ring, a winged token and more.
- **Decals** from the keywords (`DATA.kwIds`): a skull stamp (poison), flame
  licks (pyro), frost rime on balls plus a snowflake stamp (frost), glass
  glints (glass: glints, not cracks, because cracks already mean "cracked in
  the bin, plays for +50%"), a rune stamp (echo), dice pips (luck), a coin
  stamp (greed); at most two, one on an item under 22 px or a legendary,
  none on junk; a star on every legendary. Art keys that already say it skip
  it (no pips on dice, no coin stamp on coins). `RENDER.pol.DECAL[id]`
  overrides the pick.
- **Rarity rim light**: the item's own silhouette in the rarity colour
  nudged up-left behind the art (uncommon cyan, rare gold, legendary pink
  plus a gold counter-rim).
- The sprite cache key includes the identity layer (`sp.dk`); a change of
  it (or `RENDER.pol.on = false`, the before / after switch) redraws the
  sprite. A PNG override (`art/items/...`) replaces all three layers.

**Relic medallions** (`relicIcon(ctx, def, x, y, size, t)`): the emoji sits
on a dark disc in a metal ring: common bronze, uncommon silver, rare gold
with a sunburst edge, boss (and any legendary) a turning rainbow ring with
twinkles, event jade. A shine sweeps across each every 4.6 s on its own
phase (`RENDER.pol.shine`). The DOM canvases (HUD bar, rewards, the reveal,
the shop, the Prizedex) are drawn once; `polTick` redraws only the live ones
(`RENDER.relicLive`: a legendary, or a sweep in progress) at 30 fps. The HUD
relic slot is 40 px now. A relic PNG still wins (plus its rarity pip).

**Fixes.**
- Turn banners (ENEMY TURN, YOUR TURN, VICTORY, phase names) take the span
  of the player row left of the GRABS pill (`polBannerBox`, 12 px clear of
  it, words shrink to fit, the label keep-out zone follows); the pill no
  longer fades under the banner. END TURN is in the control bar far below.
- A hit on the player pops its number just under the HP stat and floats in
  a soft arc there (`polPlayerNum`, blood with it); it used to spawn on the
  player row and fall into the cabinet as a faded "-49".
- 360 x 780 / 390 x 844 audit of every screen (reward, shop, prize counter,
  the three arcade cabinets, event, stickers, the Prizedex tabs, the vault,
  capsule, win, the endless reboot, game over, title, chars; DOM checks for
  clipped, cut and overlapping text, button overlaps, text under 12 px):
  the map's plate, compass and boss arrow drew through the arcade, shop and
  event overlays (the plate sat under PULL); they draw on the map screen
  only now. Event outcome chips were 11 px (now 12). What remains is by
  design: the sticker slap and NEW BEST! stamp overlap text on purpose, and
  the vault's capsule bar floats over its scrolled grid.

### Difficulty snapshot (round 5)

No tuning; a measurement for the owner. A headless bot (scratchpad
`r5_balance.mjs`, raw lines `r5_bal_raw.jsonl`, tables `r5_bal_report.txt`)
plays whole runs through the real game: it values items by their fx and the
enemy intents, aims at the best top item, lights with bulbs toward known
elites and towers, spends spare tools, takes one elite (or tower) an act
above 60% hp, 9 normal fights an act, then the boss; opens every capsule,
buys rares and relics, rests under 70% hp, skips arcade cabinets and cashes
out at the win. 10 runs per crawler x claw (classic, tri) x Tilt (0, 5),
160 runs, seeds 500-509.

| crawler | win | deaths act 1 / 2 / 3 | hp lost / fight, act 1 / 2 / 3 | elites won | bosses won, act 1 · 2 · 3 | turns / fight, normal / elite / boss |
| --- | --- | --- | --- | --- | --- | --- |
| Knight | 28% (T0 40, T5 15) | 10 / 16 / 3 | 5.0 / 6.5 / 1.8 | 80% | 30/30 · 14/14 · 11/11 | 2.2 / 5.0 / 4.4 |
| Alchemist | 25% (T0 20, T5 30) | 7 / 17 / 6 | 2.7 / 4.7 / 5.5 | 87% | 33/36 · 16/16 · 10/10 | 2.5 / 4.8 / 4.9 |
| Rogue | 25% (T0 30, T5 20) | 11 / 16 / 3 | 5.1 / 6.7 / 3.3 | 80% | 29/30 · 13/13 · 10/11 | 2.0 / 4.8 / 5.4 |
| Lucky Lou | 33% (T0 45, T5 20) | 2 / 18 / 7 | 1.6 / 6.2 / 4.4 | 87% | 38/38 · 20/20 · 13/14 | 1.6 / 3.2 / 4.1 |
| all | 28% | 30 / 67 / 19 | 3.4 / 6.0 / 3.8 (4.9 / 7.6 / 3.5% of max hp) | 84% of 487 | 130/134 · 63/63 · 44/46 | 2.0 / 4.4 / 4.7 |

Reading it: normal fights are short (2 turns) and cheap everywhere; bosses
almost never kill (6 of 116 deaths); **elites are the run killers**: 79 of
116 deaths, Ironjaw alone 27 (act 2), then Lodestone 13, the Carnival Barker
9, the High Cultist, the Brood Mother, the Bulldozer, the Collector. Act 2
holds 58% of the deaths. The claw matters more than the Tilt for this bot:
classic 30-40% wins, tri 10-25%. Tilt 5 costs 10-25 points for the knight,
rogue and Lou (the alchemist's 20 vs 30 is inside the noise: 20 runs per cell
is about +-10 points). Late runs snowball (act 3 normals cost under 4% of max
hp; runs that reach act 3 carry 80-100 items and 23-36 relics, mostly
from capsules and payouts). The bot
walks into elites at 60% hp, so the real elite danger for a careful player is
lower; the ranking (Ironjaw first) is the signal.

## Quality bar (Game of the Year, mobile)

- Every action has feedback: sound + motion + number. Screen shake on big hits (respect the
  reduced-shake setting). Floating numbers. Hit flash. Item glow in the chute. Jackpot banner.
- Nothing ever soft-locks: every screen has a way forward, every promise (a button, a hint)
  is true. Grabs cannot get stuck: a rig phase has a max duration and auto-advances.
- Text is readable at 360px wide: minimum 12px logical at scale 1, real sentences, no walls.
- 60 fps on a mid phone: physics ≤ 40 bodies, no per-frame allocations in hot loops, canvas
  cleared once, no shadowBlur in loops (draw glows as radial gradients cached once).
