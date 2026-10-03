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
  order: `js/util.js`, `js/art.js`, `js/i18n.js`, `js/lang_nl.js` (round 13, see
  "Localization"), `js/physics.js`, `js/data.js`, `js/combat.js`,
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
`{t:'binRival', idx, inst}`, and the enemy families (see "Enemy families (round 9)"): `{t:'fam', k, fam, idx, ...}`
(k `cres | soloReady | solo | cancel | fumble | restock | cans | change | payout | scramble | hum | shatter | angry`).
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
tile.type: 'empty'|'fight'|'elite'|'treasure'|'gem'|'ink' (a box of bulbs)|'brush' (a tool)|'event'|'shop'|'rest'|'boss'|'start'|'forge' (item upgrade)|'tower'   (later rounds add the cabinets, 'petshop' and, round 14, 'trader': MAP.trdPlace, see "The Trading Post and pet evolution")
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
Settings: sound toggle, music toggle, reduced shake, debug outlines (`?debug=1`); since round 6 the
Settings panel holds them all (see "Accessibility, camera and music (round 6)").

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

## Accessibility, camera and music (round 6)

Everyone should be able to play it, and the world map should feel like a
place you travel through. Presentation only: no rule, no balance and no
save key changed. The flow lives in `game.js` (the ACCESS block, reached
through one-line hooks), the looks in `render.js` (the ACCESS block,
`RENDER.acc`), the tunes in `audio.js` (per-act music), the CSS in
`index.html` (`<style id="acc-css">`).

### The Settings panel

One place for every option (the old title toggles for Shake and Buzz moved
in; Sound and Music stay on the title as quick toggles too). A bottom sheet
over any screen (`#accSet`, built by `accPanel` / `accBuild`): the title's
**Settings** button, a gear on the map head's hint row, and a gear at the
left of the fight's control bar (`#accPause`, it **pauses** the fight:
`update()` skips everything but the toast while it is open). A tap on the
dimmed game around it, **Done**, or Escape closes it. Its buttons register
with `GAME.choose` while it is open and hand the screen's back on close; a
toggle row reads On / Off and keeps a full label (`Buzz off`) for choose.
At the top a live sample strip (`accPreview`) draws the damage / heal /
block numbers, three status chips, the four rarity rims, the map's danger
and pickup marks and two prizes in the current palette, text size and
outline, so every change previews at once (the game behind it too).

| section | setting (`meta.settings`) | default |
| --- | --- | --- |
| Sound | `volMaster`, `volMusic`, `volSfx` sliders 0..1 (`AUDIO.setMaster`, `setVolume`: 100% is the old level); Sound, Music toggles (`clawspire_audio`, as before) | 1, 1, 1 |
| Motion and feel | `shake` (Shake off is reduced motion, as before), `haptics` (Buzz), `noFlash` (reduced flashing) | true, true, false |
| Vision | `cb` colours: `off`, `deutan`, `protan`, `tritan`; `text` size: `n`, `l` (x1.15), `xl` (x1.3); `hc` item outlines | off, n, false |
| Controls | `hand` one-handed: `off`, `left`, `right`; `slowClaw` assist | off, false |
| Tips | Reset tips (the FEEL block's `feelTipsReset`) | |

`accFix` defaults and repairs every field (a junk value becomes its default,
an old profile keeps what it had), `accApply` pushes them to the renderer
(`RENDER.acc.set`), the audio, `fx().reduced` and `<html>` classes (`cb-*`,
`txt-l` / `txt-xl`, `noflash`, `hand-left` / `hand-right`, `hc`). It runs at
boot (`loadMeta`) and on every change (`accSet(k, v)` saves at once).

### Accessibility

- **Colour-blind palettes** (`RENDER.acc`, `ACC_ROLE`, `ACC_PAL`). The game's
  canonical signal hexes map to a role (damage red, the lime of heal /
  poison / buffs, the cyan of block / uncommon, the pink of crits / debuffs /
  legendary, gold, burn, block blue) and each mode gives every role a colour
  it can tell apart: orange / blue / pale ice / violet / yellow for the
  red-green modes (protan brighter), red / green / silver / purple for
  tritan. `accC(c)` maps a colour (anything else passes through); it is
  applied in `fx.text / num / badge / ring` (every floating number and
  label), the status chips, the intent bubbles, `RARITY_COL` and the item
  rim light (the item sprites re-key through `POL.v`), and the DOM through
  CSS variables (`--acc-dmg` ...: the HP stat, card rarity words and rims,
  tray chips, the player's status chips). Off restores the table exactly.
- **Colour is never the only cue.** Numbers carry their sign (a minus for
  damage, a plus for healing, "block" in words). Every status has its own
  icon (the render suite pins 21 distinct); in a colour-blind mode a buff
  chip is a round pill with an up triangle and a debuff chip an angular pill
  with a down triangle (canvas `accChip` / `accMark`; the DOM chips get a
  dashed rim and a triangle). On the map a hex that starts a fight (fight,
  elite, boss, tower) wears a warning triangle with a bang, a pickup
  (treasure, gem, bulbs, tool, shop, rest, forge, pet shop) a round plus.
  Rarity also has its words on every card and a star on a legendary.
- **Text size** (normal / large x1.15 / extra large x1.3). The canvas labels
  scale in `fx.text` (numbers, badges, banners' floating words). The DOM:
  every full-screen body (character select, reward, shop, event, rest,
  forge, treasure, parts, bin, game over, win, help, Prizedex, stickers,
  tips, the prize counter), the title menu and the Settings sheet scale as a
  whole with CSS `zoom` and reflow in a box 1/k as wide, so the layout holds
  at the 540 stage and therefore at 360 px (the Playwright audit found no box
  past the stage at either size); the HUD's words (stats at half the step,
  so the 54 px boxes hold), the hint, toasts, the popover, the turn banner,
  the map head's hint, tool chips, tray chips, tip cards and status chips
  grow by k.
- **Reduced flashing** (independent of Shake off): `fx.flash` is capped at
  0.08 and the red edge pulse at 0.4, a boss finale's whiteout becomes a
  soft 0.22 wash (`accWhite`), the intro's full-frame flashes cap at 0.12,
  the cabinet's party chase and the arcade machines' strobing bulbs run at a
  fifth of their rate (`RENDER.acc.strobe(t)`), and the CSS drops the
  brightness spikes and strobes (the JACKPOT glow, the arcade's jackpot sign,
  the attract bulbs and INSERT COIN, the CRT power-on and LOOP slam, the
  payout TOTAL, capsule upgrades, slot wins).
- **High-contrast outlines**: every item in the cabinet is drawn with
  `opts.hc`: its silhouette as a light halo and then a thick dark rim behind
  the art, cached as its own item sprite (key + 1000).
- **One-handed mode**: END TURN grows (180 x 60) and moves to the chosen
  thumb (the control row reverses for the left hand, the pause gear goes to
  the other side); on the map a column of three round thumb buttons (gear,
  Bin, recentre) sits low on that side (`#accThumb`, shown while the map is
  up, `S.accThumbOn`).
- **Slow claw assist**: the claw's carriage and carry speed x`ACC_SLOW`
  (0.55), applied to a live claw at once and to every claw built after. A
  run played with it is tagged (`run.assist.slowClaw`, optional; old saves
  have none) and the run summary lists "Assist: Slow claw". No score change.

### Map camera juice

All of it goes through `clampCam` (the zoom stays in 0.6..1.4 and the view
centre on the map), a drag or a pinch takes the camera back at once, a snap
(`lookAt`) cancels it and restores the zoom, leaving the map mid-swoop (a
walk into a fight) restores the zoom, and reduced motion (Shake off or the
OS setting) keeps the old instant behaviour. `ACC_CAM` holds the dials.
- **Swoop**: a walk of 3+ steps (`accSwoop` from `startWalk`) follows the
  crawler's eased position (not the hex it steps to) with a lead toward the
  destination (35% of the way, at most 170 px) and a slight zoom out (x0.86
  eased in over 0.4 s) that eases back in over 0.55 s on arrival; then the
  last bit eases as ever (`S.camTo`).
- **Hop**: the crawler, its portrait and its pet hop hex to hex: lifted on a
  sine (0.3 hex), stretched in the air, squashed at take-off and landing.
- **Zoom punch**: lighting a hex by hand, a light-the-way chain or a tool
  (`S.bloomSrc`) punches the map 6% toward it over 0.42 s. It is a draw
  transform about a point pinned inside the map area, so it only ever shows
  less of the map.
- **Tower pan**: a taken tower pans the camera to the tower (0.85 s, zooming
  out to x0.8), holds 1.3 s while its view blooms (the blooms, the chimes and
  the beam wait for the camera) and pans back to the crawler (0.75 s).
- **Fight iris**: entering a fight from the map closes an iris on the tile
  (`#wipe.irisz`, CSS vars `--ix / --iy`) while a snapshot of the last map
  frame zooms into it on the canvas (0.3 s, wall clock; the fight's player
  row, control bar and combo banner stay hidden meanwhile, `#stage.accIrisOn`),
  then the fight's iris opens from the middle.

### Per-act music (audio.js)

`AUDIO.setAct(a)` (the game calls it before every mode change, `accMusicAct`:
the run's act on run screens, 0 on the title) picks the act's variant of the
map, fight, elite and boss tunes (`ACT_CFG[act][mode]` over `CFG[mode]`,
`ACT_CFG[act].all` over every mode of the act); 0 (the title, the tests)
plays the base tunes, bit for bit the old ones. Act 1, the cellar arcade:
**synthpop** (112 bpm dorian, a bouncing octave bass, four on the floor, a
filtered 16th arpeggio). Act 2, the foundry: an **industrial furnace groove**
(96 bpm phrygian, a sawtooth pedal bass, anvil clanks on the offbeats and a
steam hiss closing each phrase). Act 3, the vault: an **icy music box** (84
bpm lydian lullaby on struck tines with an octave overtone, bell sparkles a
twelfth up, no drums). The fights keep their tempo, key and the round 3 hype
/ tense layers (composed per variant, `_layerSong(mode, act)`) and borrow the
act's timbre (the arpeggio, the clanks, the bells). A new act crossfades the
live tune into its variant (`ACT_XFADE` 1.6 s); screen changes crossfade as
before (1 s). The music toggle, the volumes and the master volume apply as
ever; before init everything is remembered. New voices: `arp, clank, steam,
bell`. Test hooks: `_songFor(mode, act)`, `_actOf`, `_liveActs`.

`GAME.acc` = `{DEF, CB, TXT, TXT_K, HAND, CLS, SLOW, VOL, CAM, fix, apply, set,
get, classes, open, close, build, preview, key, clawK, musicAct, swoop,
towerPan, punchK, hop, camStep, irisDraw, calm, stats, white, mapPunch,
crawlerWorld, isOpen, cam, punch, iris, cls}`; `RENDER.acc` = `{set, state,
col, strobe, shape, mark, chip, tileKind, MODES, TEXT, ROLE, PAL, RAR0,
textK, noFlash, hc, mode}`.

Tests: render (every signal colour changes per mode and the roles stay
apart, the rarity table recolours and comes back exactly, the numbers take
the palette and keep their signs, intents and chips draw clean in every
mode, 21 distinct status icons, buff and debuff chips differ in outline and
mark, the map's danger and pickup marks only in a colour-blind mode, text
scale 1.15 / 1.3 on labels and numbers, the flash cap, the strobe rate, the
outline sprite), audio (three act map themes with their own tempo, mode and
voices, fight / elite / boss variants with fitting layers, the base tunes
unchanged, determinism, the act crossfade with a fake AudioContext, layers
on a variant, the victory sting, master volume, music off), game (defaults,
junk repair and old profiles, every setting saved and applied at boot, the
panel from the title, the map and a paused fight, live preview, reset tips,
Escape, the thumb zone and the page classes, the slow claw on a live and a
new claw and in the run summary, every option on in a fight, the whiteout
cap, the text size rules cover every full-screen body and fit the stage, a
swoop fuzz over 12 seeds and 5 walks each (zoom 0.6..1.4, a snap mid-swoop)
with every frame inside the clamp, the zoom restored, a hop, a drag
cancelling, reduced motion, a short walk, a walk into a fight, the punch's
size and pivot, the tower pan over 6 seeds with the delayed blooms and beam,
the fight iris on the tile and reduced motion, the act handed to the audio on
the map, in fights and on the title).

## Sets, boons and the Compactor (round 6)

Late runs carry 80 to 100 items and 20 to 36 relics (the round 5 snapshot).
This round gives that pile a shape: relics that belong together, a first
choice that bends the run from the start, and a machine that turns three
items into one better one. Data in `data.js` (the SETS block, plus The
Hungry Pack's three relics in `RELIC_LIST`), the fight side in `combat.js`
(the SETS block), the flow and the UI in `game.js` (the SETS block, reached
through one-line hooks), the art in `render.js` (the SETS block), the CSS in
`index.html` (`<style id="sets-css">`), the sounds in `audio.js`.

### Relic sets (`DATA.SETS`, `SET_IDS`, `SET_FX`)

Ten sets of three pool relics; every relic sits in one set at most. Owning 2
pieces turns on the set's small bonus, all 3 the big build-defining one as
well. A bonus is a relic-shaped def in `DATA.SET_FX` (`'set:<id>:2'`,
`'set:<id>:3'`) with the same fields a relic has (`hooks`, `rules`, `mods`,
`loot`, `pet`). `DATA.setFxIds(run)` lists the live ones; `COMBAT.newFight`
puts them on `F.sets` (F.relics keeps the real relics only), adds their mods
and rules to the relics' and runs their hooks right after the relics' hooks
(`relicDef` resolves both). Their proc events carry the bonus id, so the HUD
pops the set's badge. Nothing is saved: a set is read off `run.relics`.

| set | pieces | 2 pieces | 3 pieces |
| --- | --- | --- | --- |
| 🧪 Poisoner's Kit | Venom Gland, Contagion, Festering Jar | Toxic Touch: an enemy gaining Poison gains 1 more | Plague Doctor: at your turn end every poisoned enemy takes its Poison (it ticks twice) |
| 🔥 Pyromaniac | Flint Striker, Bellows, Powder Keg | Kindling: an enemy gaining Burn gains 1 more | Wildfire: every enemy gains 2 Burn at your turn start; a burning death spreads its Burn |
| 🧊 Cold Storage | Snow Globe, Cold Snap, Permafrost Core | Ice Box: a freeze gives 5 Block | Flash Freeze: the first freeze each turn deals 8 to it and 2 Chill to every other enemy |
| 🛡 Iron Fortress | Kettle Helm, Battering Ram, Castle Walls | Reinforced: 6 more Block at the bell (`mods.startBlock`) | Siege Engine: gaining 5+ Block at once hits ALL for 3 |
| 🔩 Junkyard Dogs | Dumpster Lid, Recycling Bin, Junkyard King | Scrap Armor: junk grabbed out gives 3 more Block | Wrecking Crew: 2 Rocks in the bin at the bell; junk grabbed out hits the target for 8 |
| 🎲 High Rollers | Dealer's Visor, Lucky Cat, High Roller | Hot Hand: 1 more Luck every turn start | House Money: a cash out hands back half the Luck it spent |
| 🕹 The Arcade Owner | Prize Counter, Ticket Roll, Gacha Charm | Frequent Player: every jackpot and combo prints a ticket and gives 2 Block | Owner's Cut: a jackpot gives 1 grab (once a turn); capsules upgrade 25% more often (`loot.capUp`) |
| 🏺 Glassworks | Bottle Deposit, Sharp Shards, Glass Cannon | Tempered: a shatter cuts a random enemy for 3 | Glassblower: a shatter gives 1 Strength and copies a glass item into the bin (once a turn) |
| 🐾 The Hungry Pack | Chew Toy, Treat Jar, Dog Whistle (new) | Pack Tactics: every pet trick hits a random enemy for 3 | Top Dog: one more trick a turn, tricks 50% stronger (`pet {uses, pow}`) |
| 🎪 Midnight Circus | Crystal Focus, Wizard Hat, Echo Chamber | Sleight of Hand: magic items +2 (`rules.amp.magic`) | Grand Illusion: every 2nd magic item echoes (`rules.echo -1` on the Chamber's 3); a second magic copy at the bell |

**The Hungry Pack's relics** (the pets get a build): Chew Toy (c, 3 Block at
the bell, +2 pet xp per won fight, `pet.xp`), Treat Jar (u, every trick heals
2 and blocks 2), Dog Whistle (r, one more trick a turn, `pet.uses`, and every
trick hits the target for 3). A new hook, `onPet(F, petId)`, fires on every
trick: the game calls `COMBAT.petTrick(F, id)` from `petEffect` and queues
the events. `setPetStat(k)` sums `pet.{xp, uses, pow}` over the relics and
the live bonuses; the pet code reads it for its uses a turn and its power.

**The pull.** `DATA.pickRelic(rng, pool, run)`: after the build pull, when
the pool holds a missing piece of a set the run owns 1 or 2 of, `SET_PULL`
(30%) of the time the pick is one of those (`DATA.setWant`). A run with no
set started draws exactly as before (no extra rng draw).

**The look.** The relic strip (`setBarLink`, after the strip is built):
every set with 2+ pieces moves its members together to the front of the
strip (complete sets first) inside a frame in the set's colour, joined by a
chain line (it runs while the set is complete), led by a badge (the set's
icon and `n/3`); the badge is the HUD target for the bonus procs, and a tap
on it or on any piece opens the set popover (the pieces with ticks, both
bonuses, the live ones lit). A lone piece gets a corner pip in its colour.
Relic cards (the treasure reveal, the shop, a capsule's prize, the boon
cards) carry a tag like "2/3 Poisoner's Kit" (the count once you take it:
`DATA.setTagOf`), with COMPLETES THE SET! when it would. The second piece
queues SET BONUS and the third SET COMPLETE! through the announcer (class
`set`: 45, under a combo; 75 complete, over one): a card over the stage with
the three medallions snapping into a chain, the set's name in chrome, the
bonus in words; rings, and for a full set confetti, sparks, a flash and a
shake; sounds `setPiece`, `setDone`. The queue waits out fights, capsules,
the treasure reveal, the boon draft and the bin picker, so it plays on the
screen you land on. `meta.sets {id: completions}` feeds the Prizedex.

**The Prizedex's Sets tab** (after the four DATA tabs; `DATA.DEX_TABS` is
unchanged, so the completion bar and its counts are too): "n of 10 sets
completed", a card per set with its three medallions (silhouettes until
seen) chained, its name and both bonuses once any piece has been seen
("???" before), and COMPLETED xN.

### The boon draft (`DATA.BOONS`, `boonOffer`)

Right after character select the machine offers a deal (screen `boon`): a
giant cabinet in a spotlight (`RENDER.boonBack`: LET'S DEAL on its marquee,
chasing bulbs, a claw swaying behind the glass and two eyes that follow the
cards, smile at a deal and scowl at a walk-away; at Tilt 5+ it goes red,
cracks its glass and reads NO REFUNDS) deals three face-down cards out of
its chute. They flip one by one (0.55 / 0.9 / 1.25 s; a tap flips one
early), then a tap takes one; Walk away takes nothing. One card per slot,
rolled by `DATA.boonOffer(seed, tilt, ctx)` from `hash(run.seed + ':boon')`
and the run's Tilt, with the relics named on the card (the pools of relics
not owned):

| slot | boons (Tilt range) |
| --- | --- |
| gift | Pocket Change (+100 gold), Mystery Capsule (an uncommon or better, cracked at once), Warm-Up Tokens (+2 grabs every turn of the first fight: `run.boon.grabs`, the `boon:grabs` effect, spent when that fight ends), Pet Pal (a named pet at Lv 2), Prize Master's Favor (a rare relic, Tilt 0-2 only) |
| boost | Starter Set (a common or uncommon set piece), Spring Cleaning (remove 3 items, you pick), Polish (upgrade 3 random items), Bright Idea (5 bulbs and a lantern) |
| trade | Blood Pact (-10 Max HP: a rare, 0-4), Heavy Pockets (2 Rocks for good: an uncommon and 50 gold, 0-6), Loan Shark (all your gold: a boss relic, 3+), Glass Jaw (-15 Max HP: two rares, 5+), Devil's Bargain (-20% Max HP and a Slag: a boss relic and a rare, 8+) |

From Tilt 3 the trade slot leans (half the time) to the spiciest deal the
Tilt allows. The pick is applied and saved at once (`run.boon = {offers,
pick, done, grabs?, cap?, trim?}`): a reload before it shows the same three
cards, after it goes on (a capsule not yet cracked reopens as the same
capsule, Spring Cleaning resumes its picker); a second pick is refused.
Sounds `boonDeal`, `boonFlip`, `boonPick`. Headless (the suites, the
balance bot) a new run goes straight to the map as before; `GAME.boon.force`
opts in. A save from before this round has no `run.boon` and plays on.

### The Compactor (`DATA.CMP`, `cmpRule`, `cmpRoll`)

Three items in, one out (screen `compactor`, `sd.compactor = {from, shop?,
pick: [uids], res}`). In every shop a slot under the prize counter (30 gold
x the Tilt's Price Hike, once a shop: `shop.cmpUsed`; registered after Leave
and before the prize counter, so the shop's indices hold), and at every rest
stop a third choice, Compact (free, instead of resting).

Rules (`DATA.cmpRule`, pure): three of the same item (not all upgraded
already) make its plus copy; anything else makes an item one rarity above
the **middle** rarity of the three (junk < common < uncommon < rare <
legendary, capped at legendary), so it takes two of a rarity to climb and
junk never buys a legendary. `DATA.cmpRoll(rng, insts, char)` draws from the
crawler's reward pool at that rarity (never an input, never junk, a starter,
a bag or a filler; a dry pool steps down), weighted toward items sharing the
keywords most of the inputs share. The bin never drops below `BIN_FLOOR`.

The screen: the press drawn on the canvas behind a transparent window
(`RENDER.cmpScene`: a steel frame, a hydraulic ram, a hazard-striped plate,
the bed; the picked items sit in the chamber, READY when there are three),
three slots, the rule line ("Out comes an uncommon item sharing ☠ Poison,
🧲 Magnet"), CRUSH and the bin grouped by item. CRUSH pays, rolls, swaps the
items and saves in one beat (`cd.res`), then the press plays it (`CMPK`):
the items drop in (clonks), the ram comes down (hiss), SLAM at 0.95 s (the
crunch, a big shake, a flash, sparks and smoke), the plate grinds with
sparks, lifts off a glowing striped bale, which pops into the new item
floating in rays of its rarity colour, and COMPACTED! stamps in with the
item card. A tap on the press hurries it (the slam still lands). A reload
shows the result, never a second crush. Sounds `cmpFeed`, `cmpPress`,
`cmpCrunch`, `cmpPop`.

**Save fields.** Run: `boon` (above), `cmpN` (crushes). Shop: `cmpUsed`.
Screens `boon` and `compactor` (sd). Meta: `sets {id: n}` (`setMetaFix`
repairs junk). No key was renamed; old saves and profiles load unchanged.

`GAME.sets = {barLink, tagOn, onGain, fanfare, popHtml, petStat, metaFix,
fxFor, queue, log}`, `GAME.boon = {BOON, start, show, pick, flip, apply, next,
ctx, force, state}`, `GAME.cmp = {K, show, pick, unpick, crush, hurry, leave,
rule, price, state}`; `COMBAT.petTrick`, `COMBAT.setFxOf`; `RENDER.boonBack`,
`cmpScene`, `sets.cmpPlate`. `run.noSets` opts a run out of the set bonuses
(the build tests that pin one relic's own numbers). Tests: data (ten sets,
one set per relic, the bonus defs, counts and live ids at 2 and 3 and never
1, the card tag, `setWant` and the pull's rate, hooks with and without a
recording COMBAT, the boon table, offers deterministic by seed and Tilt, the
Tilt's trades, relic pools, the Compactor's rarity ladder, keywords and
determinism), combat (every set's 2 and 3 bonus against a control fight,
F.sets, the pet trick hook, the warm-up grabs, a 30 turn fuzz holding all 30
pieces), game (the chained strip, badges and popovers, the fanfare through
the announcer and its wait, meta.sets saved and repaired, the card tags, the
Sets tab, the boon screen and its reloads, every boon's effect, the capsule
and Spring Cleaning across reloads, the Compactor at the rest and in the
shop with its price, refusals and reloads before and after a crush, the
press animation and the hurry, the pet relics in a real fight), render (the
machine at every Tilt and pick, the press in every phase, determinism),
audio (every new voice, throttles).

## Secret act (round 6): golden keys, the Back Room, The Machine

A hidden fourth act for players who look closely. Nothing here is required
to win, nothing is announced up front, and a run that never finds a key plays
exactly as before.

### Golden keys (one per act)

- Every act map hides one golden key. Which source each act uses is a seeded
  permutation of the three kinds (`DATA.secKinds(seed)`), so a run sees each
  kind once:
  - **roam**: the roaming monster farthest from the start carries it (a faint
    glint on its token). Killing it drops the key with a `GOLDEN KEY!`
    banner (announcer class `secret`, priority 85).
  - **arcade**: a jackpot tier (3 and up) on a slot, plinko or wheel
    cabinet, or a perfect whack-a-mole score. If the map has no arcade
    cabinet it falls back to dark.
  - **dark**: an empty land hex off the road, not under a roamer, as far from
    the road as possible (dark tiles preferred). The glint is drawn only when
    the tile is lit (visited or next to the path), so you find it by
    exploring corners. Stepping on it grants the key.
- `MAP.secKeys(M, kind)` places it (`M.sec = {kind, want, got, q, r | id}`),
  `MAP.secKeyAt` answers a hex lookup. A key flies to the map head chip
  (`secOver`), plays `keyGet` and saves.
- The map head shows a compact key chip (a small key glyph and `n/3`, 32 px
  tall) on the hint row, only once this run holds a key (so new players are
  not told there is a secret, and row 1 keeps "Act N" or "Loop N" whole at
  360 px); it pulses at 3/3 and its popover gives a hint. In the Back Room the
  map head reads "Act 4" and the map plate names the room.

### The door and the Back Room

- With 3 keys when the Prize Master falls, the finale does not go straight
  to the win: `secNextAct` shows the door screen (`scr-secret`, key `door`).
  The keys fly into three keyholes, the neon sign flickers, the door splits
  open. ENTER leads in, WALK AWAY takes the normal win. Fewer than 3 keys:
  no door, no hint.
- `MAP.secRoom` builds the Back Room: 6x3 hexes in the `machine` biome
  (circuit boards on the catwalk, gears, coin hoppers, cables and flickering
  service lights in the void), a 6 to 7 tile road: elite, secret shop,
  elite, maybe treasure, rest, then The Machine. No roamers. Entering heals
  30% (`SECRET.heal`), reframes the camera and switches music to `backroom`.
- Back Room elites come from the late pools and carry 3 affixes from the
  strongest pool (vampiric, hasty, armored, spiky, regen, explosive).
- The secret shop stocks 5 legendary items at 150 to 230 gold plus a relic at
  200 (`DATA.secShopStock`).

### SECRET BOSS: The Machine

- `ENEMIES.machine` (secret, noAffix, 330 hp, excluded from the endless mix).
  It is the Rig itself: bulb eyes in the marquee, a coin-slot mouth that
  chomps when it attacks, and its HP bar is a row of 24 marquee bulbs going
  dark (the normal bar is hidden, the number sits under the feet).
- Signature every turn (`sig.id = 'machine'`), cycling a per-phase list:
  - **tilt**: the rig tilts (gravity x1.8 sideways for the turn).
  - **junk flood**: 5 / 6 / 8 junk items (rock, slag, ice block) dumped in.
  - **claw hijack**: the Machine takes the claw and drops 1 (2 in the final
    phase) of your items back into the pile.
  - **gravity flip**: zero g; loose items float to the ceiling (reuses the
    bestiary ceiling hang) and fall when the turn ends.
  - **electrified rail**: each drop through the rail zaps you 3 / 4 / 6 unless
    a metal item grounds it.
  - **chute shutter**: a slatted shutter closes the chute; only heavy items
    dent it open (2 hits), light items bounce.
- Three phases: normal (tilt, flood, claw), OVERCLOCKED at enrage (grav,
  rail, shutter, red beams, exhaust vents), MELTDOWN at a quarter hp (all six,
  sparks, strobing bulbs). The cabinet glass cracks progressively with hp in
  MELTDOWN, and the rig glass cracks with it.
- Death: a long power-down (`SEC.pdDur` 6.6 s, not skippable for the first
  1.4 s): the alarm and zero g stop, floating items drop, bulbs die one by
  one, lines `SYSTEM FAILURE`, `POWERING DOWN...`, `GOODNIGHT, CONTESTANT.`,
  a CRT collapse to a line and a dot.
- Then the TRUE ENDING screen (`scr-secret`, key `ending`): dawn over the
  dead Clawspire, the crawler walks out along a path, a five-line epilogue,
  a credit roll ("RoxorLoops & Jasmin", thanks for playing), CONTINUE. Then
  the normal win flow: title "THE MACHINE POWERS DOWN", +5000 score line,
  stickers, and the endless offer. In the Back Room the HUD's act stat reads
  "4" with a key (`4 🔑`, a gold rim, class `secret`), like the map head's "Act 4"
  (round 7; it read `Back Rm` before).

### Save fields (all optional, defaults on load)

- `run.sec = {keys, kinds, door: '' | 'open' | 'skip', room, beat, ended, done}`
  via `DATA.secFix` (a missing or broken object becomes a fresh one).
- `M.sec` on the map (key placement), `M.room = true` on the Back Room map.
- `meta.sec = {keys, rooms, ends}` lifetime counters (`secMetaFix`).
- A save taken during the Machine's outro stores screen `secret` with the
  `ending` screen, so a reload lands on the true ending, not the fight.
- Old saves (no `sec` anywhere) load unchanged and simply have 0 keys.

### Stickers and Prizedex

- Keymaster (3 keys in a run), The Back Room (enter it), True Ending
  (power down The Machine).
- The Machine has a Prizedex card tagged SECRET BOSS that shows `?` and a
  hint until it has been met.

### Code map

- data.js: SECRET block (constants, `secKinds`, `secFix`, `secKeyN`,
  `ENEMIES.machine`, `secShopStock`), three ACH_LIST stickers, a score line.
- combat.js: SECRET block (`secSig`, `secTurnEnd`, `secDrop`, `secGround`,
  `secShutHit`, `secFight` affixes, `secInfo`, `secPhase`) plus one-line hooks
  in sigInfo, bossSig, bossTurnEnd, bossFinal and newFight.
- map.js: SECRET block (`secKeys`, `secKeyAt`, `secRoom`).
- render.js: SECRET block exported as `RENDER.sec` (key, glint, terrain,
  map background, arena, `EA.machine`, face, cab overlays, door, ending).
- audio.js: keyGet, doorOpen, secZap, secShutter, secClang, secGrav,
  secFlood, glassCrack, secVoice, secHum, powerDown, creditsChime; music
  modes `backroom` and `machine` (layered).
- game.js: SECRET block (state, keys, door, room, shop, fight events,
  power-down, outro, drawing) exported as `GAME.sec`, one-line hooks in the
  map, fight, shop, save/load, win and Prizedex code.
- index.html: `#secret-css` and `#scr-secret`.

### Tests

- map: a key per map for each kind on many seeds, the dark key off the road
  and lit only when near, the Back Room map (size, road 5 to 8 tiles, elites,
  shop, boss, biome, no roamers).
- combat: the Machine definition, phases and MELTDOWN, every signature event
  and its clear, Back Room elite affixes, a 40-turn fuzz.
- render: every Machine look (phases, cracks, power-down, door, ending,
  terrain) draws and differs.
- game: keys three ways and the counter, the door only with 3 keys and the
  walk away, the room, every fight event, phases to power-down to ending to
  win to endless, save and reload at every step, and old saves and the
  Prizedex.

## Evolutions and pet synergies (round 7)

Vampire Survivors' best trick in a claw machine: an item you have upgraded
and the right relic turn into a legend. Plus a bonus trick for every pet
that fits a build, and four combos around them. Data in `data.js` (the
EVOLVE block), the fight side in `combat.js` (the EVOLVE block), the flow in
`game.js` (the EVOLVE block, reached through one-line hooks), the art in
`render.js` (the EVOLVE block, `RENDER.evo`), the CSS in `index.html`
(`<style id="evo-css">`), the sounds `evoRise`, `evoBurst`, `petSyn`.

### Item evolutions (`DATA.EVOLUTIONS`, `EVOLVED`, `EVO_FX`)

A recipe is **base item + relic**. The base item must be upgraded (plus); the
run must hold the relic. Then the item evolves when it is **delivered in a
fight**, or on the spot **at a rest** (an Evolve choice, only when something
is ready) or **a forge** (EVOLVE cards next to the upgrades; and an upgrade
there that completes a recipe evolves at once). An evolved item is a new item
for good: no plus (it cannot be upgraded again), a unique drawing, and an
**aura**: a relic-shaped def (`EVO_FX['evo:<id>']`, hooks and rules like a
relic) that runs in every fight while the item is in the run's bin.

| evolved item | base item + | relic | when played | aura (while in your bin) |
| --- | --- | --- | --- | --- |
| Excalibur Claw | Rusty Sword (knight starter) | Trophy Rack | 18 damage, +1 Strength | King's Oath: every kill gives 5 Block |
| Plague Needle | Venom Dart | Festering Jar | 4 damage, 7 Poison, then every enemy takes its Poison | Epidemic: an enemy gaining Poison gives every other enemy 1 |
| Nuke Pop | Cherry Bomb | Powder Keg | 10 and 5 Burn to ALL (a real bomb: its fuse lights) | Chain Reaction: a burning enemy's death hits the rest for 8 |
| Prism Lance | Glass Bead | Glass Cannon | 3 beams of 6 at random; not glass, so it never shatters | Refraction: a shatter hits ALL for 5 |
| Loaded Fate | Bone Dice (Lou's starter) | High Roller | 8-14 twice, 2 Luck | House Edge: cash outs +1 per Luck (`rules.cashAmp`) |
| Absolute Zero | Frost Pearl | Permafrost Core | 4 damage, 2 Chill to ALL, Freeze the target | Deep Cold: SHATTER +25% (`rules.shatter`) |
| Tower Aegis | Pot Lid | Castle Walls | 15 Block, 2 Thorns | Battlements: turn end, a quarter of your Block (max 15) to ALL |
| Scrap Titan | Scrap Shield | Junkyard King | 6 Block, 3 Block and 3 damage per junk | Scrap Heap: a Rock at the bell; junk grabbed out hits ALL for 5 |
| Black Death Vial | Toxic Vial (alchemist starter) | Contagion | 3 and 5 Poison to ALL | Miasma: turn end, every poisoned enemy +1 Poison |
| Midas Coin | Lucky Coin | Money Bags | 8 damage, 8 gold | Golden Touch: gold gained gives as much Block (max 10) |
| Swarm Queen | Prize Marble | Pocket Dimension | stings 4 random enemies for 3 (small: +2 each with the Dimension) | The Hive: small items played hit a random enemy for 2 |
| Echo Grimoire | Arcane Tome | Echo Chamber | 9 damage, copies 2 magic items | Reverb: magic echoes one play sooner (`rules.echo -1`: every 2nd) |
| Streak Stiletto | Shiv (rogue starter) | Winning Streak | 6 +3 per streak | Momentum: at a streak of 5+, every grab that brings something up hits a random enemy for 3 |
| Phoenix Torch | Torch | Bellows | 7 and 6 Burn to ALL | Rebirth: a burning enemy's death heals 4 |

Every crawler's starting bin has a base item (Rusty Sword, Toxic Vial, Shiv,
Bone Dice), so the first evolution is one forge visit and one relic away.

**The item table trick.** The evolved defs are attached to `DATA.ITEMS` as
**non-enumerable** properties: `ITEMS[id]` finds them everywhere (COMBAT, the
renderer, combos, the bin, a save), but `Object.keys(ITEMS)`, `for..in` and
`ITEM_IDS` never list them, so reward pools, shops, capsules, the
Compactor's pool, the item Prizedex and every "all items" test stay exactly
as before. `DATA.EVOLVED` lists them. Base ids are never renamed; evolved ids
are new (`excalibur_claw` ...).

`DATA.evoOf(itemId)` (the recipe of a base id), `evoReady(inst, relics|run)`
(plus, not a fight copy or junk, the relic held), `evoAuraIds(run)` (one aura
per evolved id in the run's bin), `evoMetaFix(o)`, `evoProc(F, id, text)`.

**COMBAT.** `newFight` puts the auras on `F.evos` (their hooks run after the
relics and set bonuses through `setHookIds`, their rules merge into
`F.rules`, `relicDef` resolves `evo:*` so the automatic procs name the aura)
and the pet along on `F.petId`. `COMBAT.evoCheck(F, inst)` -> recipe | null;
`COMBAT.evolve(F, inst, recipe?)` turns the fight instance (the evolved id, no
plus), adds its aura and merges its rules at once, records `F.evolved`.

**The ceremony (game.js).** `deliver` asks `evoDeliver`: the run's copy of
the instance must be plus (a Golden Prize's fight-only plus never counts),
then COMBAT evolves it, the run's bin copy follows, the book is updated and
the run is **saved at once**. The throw waits: the fight holds its breath
(`updateFight` returns while `FS.evo` is set: no physics, no queue, no
plays), and `RENDER.evo.ceremony` plays over the stage (2.6 s; 1.8 s after
five evolutions on the profile; 1.5 s in reduced motion): the stage dims, a
light pillar rises from the chute, the old item spins up out of it
accelerating while shards spiral in (EVOLVING...), then at 52% a white flash,
rings, shards, confetti, the `evoBurst` fanfare and the new form bursts in
big over turning rays, EVOLVED! and its name slam in in chrome, and its aura
sits on a plate under it. Then the evolved item is thrown from where it
hovers and plays. A tap before the burst jumps to it; a tap 0.3 s into the
reveal ends it. Two in one grab queue (`FS.evoQ`). At a rest or a forge the
same ceremony plays on an overlay (`S.evoUi`, `.evoOver`, a canvas of its
own over any screen) that waits on the reveal until a tap.

**Save and reload.** The run's bin already holds the evolved item when the
ceremony starts, so a save mid ceremony reloads into the same fight from its
opening bell with the evolved item and its aura, no ceremony, nothing counted
twice. Run: `evoN` (optional count). Meta: `evo {seen: {id: 1}, made, syn,
new: {id: 1}}` (`evoMetaFix` repairs junk; an old profile starts empty). No
key was renamed.

**Hints and the Prizedex.** Once a recipe has been seen (evolved once), every
card of its base item says **Evolves with: <relic>** (gold with "(ready!)" or
"(upgrade it)" while the run holds the relic). An evolved card wears a gold
EVOLVED badge (in place of the rarity word), its aura in words and a glow.
The Prizedex's **Evolve** tab (after Sets; `DATA.DEX_TABS` is unchanged, so
the completion bar is too): "n of 14 evolutions found", a card per recipe:
base item + relic -> evolved item, silhouettes until found (the base item and
relic show once seen elsewhere, the hint names the base), NEW! once.

**Art.** `RENDER.evo.ART[id]`: 14 drawings (a claw-guarded sword with a rune
line, a syringe dart, a trefoil cherry bomb, a rainbow crystal lance, a gold
die with an eye, a snowflake orb, a castle tower shield, a scrap robot head, a
skull-corked flask, a crowned coin, a bee-striped marble with a crown, an
eye grimoire with echo rings, a stiletto with speed streaks, a phoenix
torch), each with a gold up-chevron. `itemArt` picks them before the POLISH
silhouettes, so they live in the item sprite; an evolved item never borrows
its art key's shared PNG (only `art/items/id/<id>.png`, see ART_PROMPTS).
In the cabinet `evoAura` adds a pulsing glow and slow turning rays behind it
and two motes in front (through `itemFx`).

### Pet synergies (`DATA.PET_SYN`, `petSynOn(pet, run)`)

Each pet gets a bonus with a build. `on(run)` reads the run only; the game
adds the extra to the pet's own trick and fires `COMBAT.evoPet(F, pet, k, o)`:
a `{t:'proc', src:'pet', id:'pet:<pet>'}` badge, then the effect.

| pet | switched on by | synergy |
| --- | --- | --- |
| Hamster | a Swarm relic | Marble Run: each shove, 2 damage to a random enemy per small item in the bin (max 5) |
| Parrot | an Echo relic | Mimic: the item it carries is copied into the bin for the fight (3 a fight) |
| Cat | a Pyro item in the bin | Fire Cat: it bats Pyro items first; a batted Pyro item gives ALL 2 Burn |
| Octopus | the Tri-Claw | Two Arms: it holds the two lowest prizes on a lift (a second weld) |
| Firefly | a Frost relic | Frost Light: the spotlit item, played against a Frozen enemy, resolves twice |
| Magnet Mouse | the Magnet Crane | Double Pull: a second metal item is pulled to the claw |
| Trash Raccoon | Junkyard King | King's Feast: every junk it eats gives 1 Strength and 3 Block |
| Golden Goose | 2 High Rollers pieces | Golden Clutch: two golden eggs at once and 1 Luck |

While it is on, the pet's name tag wears a round badge with the synergy's
icon (`RENDER.evo.petBadge`, pulsing harder right after it fires), and a tap
on the pet adds its synergy line (ON, or what it needs).

### Combos (4 new)

| tier | combo | recipe | effect |
| --- | --- | --- | --- |
| 2 | Legend Rising | an evolved item and two more | 10 to ALL, 6 Block |
| 3 secret | Twin Legends | two different evolved items | 25 to ALL, 2 Strength (same family: it replaces Legend Rising) |
| 2 | Fetch! | a bone and a ball with any pet along (`ctx.pet`) | 6 x2, 4 Block |
| 2 | Nest Egg | an egg and a coin with the Golden Goose along | 12 gold, 8 to ALL |

`COMBAT.grabDone` passes `pet: F.petId` in the combo ctx; a recipe's `ctx`
fixture says which pet its example needs.

### Stickers

It Evolved! (evolve an item) and Best Buds (set off a pet synergy), read off
`meta.evo.made` / `meta.evo.syn`.

### Hooks and API

game.js: `loadMeta` (evoMetaFix), `itemCard` (evoCardTag), `openBin` (`o.can`,
and the upgrade picker skips evolved items), `showRest` (evoRestChoice, the
sharpen evolves), `showForge` (evoForgeCards, the upgrade evolves, evolved
items are not offered), the event `upgrade` fx, `showCollection` (the tab),
`deliver`, `updateFight`, `pointer`, `update` (evoTickAll), `draw` (evoDraw),
and the pet's `petStart` (evoPetPick), `petEffect` (evoPetEffect),
`petHoldStart` / `petHoldEnd` (the second arm), `petDeliver`, `petDraw` (the
badge), `petTap`. `GAME.evo = {EVO, meta, metaFix, seen, deliver, now, skip,
end, ready, cardTag, syn, fire, tapLine, uiTap, uiClose, draw, fs, queue, ui}`.
combat.js: `relicDef`, `setHookIds`, `newFight` (evoFight), `play` (evoSpot),
`grabDone` (ctx.pet); `COMBAT.evoCheck / evolve / evoPet`. render.js:
`itemArt`, `item` (no shared PNG), `itemFx` (evoAura); `RENDER.evo = {ART, K,
artFn, aura, ceremony, petBadge, chevron, wrap}`.

Tests: data (14 recipes, one per base item, pool relics, the defs hidden from
every pool and the item Prizedex, shapes, fx, texts, auras on known hooks and
rules, evoReady only with the right item + plus + relic, auras per run,
meta repair, auras with and without a recording COMBAT, the synergy table and
its switches, the combos, the stickers), combat (only the right recipe
evolves and only once, every recipe with and without its relic, every aura's
effect in a fight, rules merged mid fight, every `evoPet` kind and its proc,
Frost Light only on a Frozen target, the four combos in a fight, a 30 turn
fuzz with all 14), game (a real delivery: the ceremony, the frozen fight, the
run's bin, the book and the sticker, tap skip and end, the throw and the
18 damage, the auto end; the wrong relic, a golden prize's plus and no relic
never evolve; two in one grab queue; a save mid ceremony reloads the fight
with the evolved item and no second ceremony; hints before and after
discovery, the badge, the forge upgrade and EVOLVE card, the rest choice and
its picker, evolved items never offered for upgrade; the Evolve tab, NEW!,
old and junk profiles, old run saves; every pet synergy switching on and
firing in a real fight), render (every evolved drawing distinct from the
others and from its base, the aura layers, the ceremony at every beat, reduced,
null safe, the badge), audio (the three voices).

## Seasonal events (round 7)

A reason to come back every few weeks: date-bound events that dress the
whole machine up, bring their own content into every run, and pay out in
their own currency for cosmetics you keep forever. The first is
**Claw-o-ween** (1 October to 3 November); **Winter Wonderclaw** (10
December to 6 January) is the skeleton that proves the system with a
second season (completed in round 12: see "Winter Wonderclaw (round 12)"). Data in `data.js` (the SEASON block), the flow in `game.js`
(the SEASON block, reached through one-line hooks), the looks in
`render.js` (the SEASON block, `RENDER.sea`), the tunes and sounds in
`audio.js` (the SEASON block), the frame in `index.html`
(`<style id="season-css">`, `#scr-sea`).

### Which season is on

- `DATA.SEASONS[id] = {id, name, icon, from: [month, day], to: [month, day],
  col, col2, cur {id, name, icon}, blurb, counter, items, relics, costumes
  {base: costumedId}, elite, tile, cosmetics, hats}`; both ends inclusive; a
  span may wrap the new year (winter). `DATA.seasonAt(date)` (pure: a Date, a
  timestamp or 'YYYY-MM-DD', never the clock) -> the def or null.
  `seasonWindow(id, date)` -> `{start, end}` (end exclusive: the midnight
  after the last day; a January day belongs to the span that began in
  December; after a span, next year's), `seasonLeft(id, date)` -> ms left
  (0 out of season).
- The game's live season (`seaNow`): `?season=<id>` (or `?season=off`),
  else the profile's preview pick, else `seasonAt(today)`. Headless (the
  suites, the bots) "today" is never the wall clock: only a date the tests
  set (`GAME.season.setDate`) turns a season on, so every other suite is
  deterministic whatever the real date is.
- **Event preview** (for the owner): tap the title logo five times (a hidden
  zone over it) and a picker offers By the calendar, each season and No event;
  the pick is saved on the profile (`meta.sea.preview`).
- **A run keeps its season.** `newRun` stores `run.season` (the season it
  starts in) and every seasonal rule reads that, so a run started on Halloween
  stays spooky to its end and an old save (no field) never turns seasonal.

### The title, the map, the arena, the cabinet (the looks)

Every draw takes the season id; with none nothing is drawn, so the base art
is exactly as before. **Claw-o-ween:** a violet-to-orange dusk over the
title, a full moon, bats circling the claw, cobwebs and a spider in the
corners, jack-o'-lanterns on the tower's tiers and the ground, rolling fog,
a dripping CLAW-O-WEEN over the logo; a ribbon at the top of the title
names the event with its countdown ("ends in 13d 09h", ticking; "EVENT
PREVIEW" when forced) and the wallet. The map gets drifting fog, bats with
a violet glow, a violet edge and a lit jack-o'-lantern on about one lit
empty hex in six (picked by the tile's hash). The arena gets a moon and
bats over the fight, the cabinet cobwebs in three interior corners, a
dangling spider, two jack-o'-lanterns on the marquee and orange / purple
chasing bulbs (unless an equipped skin, the party lights or the alarm own
the bulbs). **Winter:** snow falling over the title, map and arena, snow
caps on the tower and the frame, icicles under the rail and the logo's
banner, a frost vignette, red and green bulbs, snowmen on the map.

### Claw-o-ween content (only in a Claw-o-ween run)

The seasonal items, relics, enemies and cosmetics are reachable as
`ITEMS[id]` / `RELICS[id]` / `ENEMIES[id]` / `COSMETICS[id]` through
**non-enumerable** properties (like the evolved items): every lookup finds
them, while `Object.keys` / `for..in` / `ITEM_IDS` never list them, so the
year-round pools, shops, capsules, the Prizedex, the balance averages and
the Vault shelves are exactly as before. The game brings them in while the
run's season is on.

- **Items (7)**, one reward screen in three swaps its last slot for one:
  Candy Corn (a small filler: heal 1, Block 1, and every one landed is a
  candy), Candy Corn Bag (three of them), Pumpkin Bomb (u, a real bomb: its
  fuse lights; 5 to ALL and 2 Burn), Cursed Lollipop (u, 9 and 3 Poison, but
  you get 1 Weak), Haunted Teddy (r, magic and light: it floats; 7 Block and 2
  Weak to ALL), Witch Broom (u, 5 and 3 Block, then it sweeps the pile toward
  the chute: every item low in the bin slides right), Skull Candle (r, 4 Burn
  and 1 Vulnerable to ALL). Each has its own drawing (`RENDER.sea.SIL`, on the
  polish pass's silhouettes, non-enumerable too).
- **Relics (4)** join the relic pools by rarity: Candy Bucket (c, a kill heals
  2; +2 candy a won fight), Jack-o'-Lantern (u, 1 Burn to ALL each turn),
  Witch's Brew (u, every potion also poisons a random enemy for 2), Ghost
  Sheet (r, 1 Dodge at the bell; 3 Block whenever you are hit).
- **Costumes.** In a Claw-o-ween run a monster with a costume wears it
  `SEA_K.costumeP` (55%) of the time (seeded by the run, the act, the fight
  count and the ids; a reloaded fight keeps its saved ids): Count Ratula (the
  rat as a vampire: a cape and collar; it drains 5 hp and hides in the cape for
  a Dodge), Sheet Slime (the slime under a bedsheet with eye holes: it starts
  with a Dodge, so your first hit goes through it; BOO! is Weak), Goblin Witch
  (a pointed hat and a broom: it hexes you Vulnerable and tosses a Slag into
  your bin). Every other monster turns up in a party hat (witch, pumpkin,
  horns; winter: a Santa hat) `hatP` (30%) of the time, on the fight's copy of
  its def (never saved, never the data). Each costumed monster beaten pays 2
  more candy.
- **The Pumpkin King** (act 1 elite, `look: 'pumpking'`, his own drawing: a
  crowned jack-o'-lantern lit from inside on a ribbed pumpkin body, vine arms,
  a leaf collar): Vine Lash 9, Seed Spit 3 x3, Harvest Moon +2 Strength, Squash
  (18 next turn) and a lit pumpkin lobbed into your bin; phase two JACK'S FURY.
  He takes an act 1 elite fight `kingP` (45%) of the time (never a tower
  keeper), drops 12 more candy and one of the season's relics you lack.
- **Trick-or-treat doors** (tile type `treat`): 3 per map (4 on the 16 x 22
  world), on empty land at least 3 from the start and 2 from the boss, apart,
  never under a roaming monster or the golden key, known from the start (a
  silhouette in the dark), seeded by the map. The door screen (screen `sea`,
  sd `{sea: {q, r}}`): a haunted house at night under the moon, a porch of
  jack-o'-lanterns, door 13. Knock: the outcome is rolled
  (`DATA.seaTreatRoll(rng, act, {relics, items})`) and saved on the tile
  (`content.sea.out`) at once; three knocks shake the door, it creaks open,
  light pours out and the reveal pays it (once: `content.sea.paid`, the tile is
  done). Treats (70%) always carry 8 to 14 candy plus candy (6 more), gold, a
  prize capsule (banked, cracked on Continue), a seasonal item or relic
  floating out of the candy bowl; tricks (30%) are a ghost bursting out
  (TRICK!: a costumed fight from the act's normal pool, started by Fight!,
  once) or a green cackle (CURSED!: a Slag joins the bin for good). A tap
  hurries it; Leave before knocking keeps the door for later. A reload before
  the reveal replays the same outcome; after it shows the result; never paid
  twice.

### Candy and the Candy Counter

- The season's currency (`cur`: candy for Claw-o-ween, snowflakes for winter)
  banks straight into the profile wallet (`meta.sea.wallet[cur]`, `earned`),
  with the run's tally on `run.sea.cur`: a won fight `DATA.seaEarn(tier,
  costumes, king)` (normal 3, elite 8, boss 15, +2 a costume, +12 the Pumpkin
  King) plus the Candy Bucket's 2, a door's treat, a Candy Corn landed. The map
  head shows a chip with the wallet (a tap explains). Out of season nothing
  drops.
- **The counter** is a tab in the Prize Vault while the season is on (Candy
  Counter / Snowflake Stand; the wallet pill shows the currency there). It
  sells the season's cosmetics (`DATA.seaCosmetics(id)`, `price` in the
  currency): **Claw-o-ween** Haunted Mansion (a cabinet: rotten boards,
  jack-o'-lanterns and a vine on the frame, a full moon, bats and tombstones
  behind the pile), Pumpkin Spice (claw paint: orange and black, a candle glow),
  a Witch Hat for each crawler (60 each), Bat Trail (bats flap up out of every
  step); **winter** Frosted Cabinet (snow on the roof, icicles, a snowy panel)
  and Hollyberry paint. Tickets never buy them (`vaultHow` is 'event',
  `vaultPrice` 0); they are never in a Vault Capsule. A buy takes the price,
  owns and equips it at once (the party lights, SPOOKY! on the marquee).
- **Owned forever.** Bought event cosmetics are in `meta.vault.owned` like any
  prize; after the event the counter tab is gone, but they sit on their normal
  shelves (after the year-round ones), equip and draw as ever. The cosmetic
  looks reuse the Vault's renderer (skin fields, paint fields; the new
  patterns `sea_pumpkins`, `sea_moon`, `sea_icicles`, `sea_snow`, the `witch`
  hat, the `bats` trail are one-line hooks into it).

### Music and sounds

`AUDIO.setSeason(id)` (the game calls it with every music change: the live
season on the title screens, the run's own in a run) swaps the title and map
tunes for the season's (`SEA_CFG`: Claw-o-ween a spooky organ swing in
harmonic minor, a walking bass, an organ pad and a bell tolling every four
bars; winter a sleigh bell jingle in major with chimes), crossfading a live
one; fights keep their tunes and layers; no season is the base and act tunes
bit for bit. Sounds: `knock, creak, treat, boo, cackle, candy`.

### Sticker, save fields, code map

- One sticker (the board's cap is shared with the round's other work): Trick or
  Treat! (knock on 5 doors during Claw-o-ween, with a progress bar).
- Meta `sea` (`seaMetaFix` / `DATA.seaFix` repair junk; old profiles get an
  empty record): `preview` ('' | 'off' | id), `wallet`, `earned`, `spent`
  ({currency: n}), `knocks`, `king`, `runs` {season: n}, `seen`. Run: `season`
  (null or an id; missing on old saves = none), `sea` {cur, knocks, costumes,
  king}. A door tile: `type: 'treat'`, `content.sea` {seed, out, paid, lines,
  fought}. Screen `sea`. No key was renamed.
- `GAME.season = {DOOR, now, run, setDate, readUrl, previewing, preview, pick,
  logoTap, meta, fix, give, wallet, newMap, enemies, dress, fightEnd, event,
  sweep, rewardItems, relicAdd, show, knock, hurry, leave, cont, pay, trickEnc,
  shelf, buy, countdown, fmt, musicId, door, log, date, url}`; `DATA` adds
  `SEASONS, SEASON_IDS, SEA_K, SEA_ITEMS, SEA_RELICS, SEA_ENEMIES,
  SEA_COSMETIC_IDS, seasonAt, seasonWindow, seasonLeft, seaFix, seaEarn,
  seaTreatRoll, seaCosmetics, seaCostumeOf`; `RENDER.sea = {SIL, prop,
  pumpkin, bat, web, moon, snow, fog, title, map, sky, cab, costume, hat,
  treat, door, coin, framePat, panelPat, trailMark}`; `AUDIO` adds `setSeason,
  season, SEA_CFG, SEA_NAMES, _seaSong`.

Tests: data (seasonAt on every edge and across the new year, a Date, a
timestamp, junk; the countdown and the spans; the content looked up but never
listed or pooled year-round, over 200 reward rolls; the items' fx, shapes and
texts; the relics' hooks; the costumes against their base; the Pumpkin King;
no seasonal monster in the encounters; the cosmetics off every shelf and
capsule, priced in candy, a witch hat per crawler; the wallet repair; the
currency per fight; the doors' odds and payouts; the sticker), game (no
season headless without a date; dates, `?season=`, `?season=off`, the preview
and its reload; doors per map and seed, none out of season or on an old save;
a run keeps its season; costumes, the King, hats, trick fights, never out of
season, a reloaded fight keeps its ids; the door: Leave, knock, reload mid
knock, paid once, the result after a reload; every outcome; candy per fight,
per costume, the King's relic, Candy Corn, the broom's sweep, rewards and relic
pools in and out of season; the counter: tickets refused, too little candy,
bought and equipped, never twice, gone after the event, still owned on its
shelves and across a reload, a real fight in the mansion; the title banner,
its countdown, the music id, winter's snowflakes; old saves and junk
profiles), render (every overlay in both seasons at several times, nothing
without a season, the bulbs stepping aside for a skin, every costume and the
King in every state, the hats, the versus card, the door at every beat and
outcome, the tile, the currency, the items' own drawings, the event cosmetics'
thumbnails, cabinets, hats on every crawler, the bat trail), audio (the six
sounds, the four seasonal tunes against the base ones, determinism, the
crossfade, fights untouched).

## QA sweep 2 and polish (round 7)

Presentation only: no rule, no balance number and no save field changed. The
flow lives in `game.js` (the QA block before the loop, reached through
one-line hooks), the pure numbers in `combat.js` (the QA block), the looks in
`render.js` (`intent`'s `qa` argument, `cmpScene`'s `s`, the title logo fit),
the CSS in `index.html` (`<style id="qa-css">`, plus small edits to the
Compactor and the true ending CSS).

### Elite readability: telegraphs that say the real number

The round 5 snapshot blamed act 2 elites for most deaths (Ironjaw's Gape: 46
charged, x1.8 difficulty, +3 Strength once enraged, x1.5 on a Vulnerable
player: 129 against an 80 hp knight). The numbers stay; the telegraph tells
the truth now.
- `COMBAT.qaIntent(F, e)` (pure) -> `{k, hit, n, jab, total, next, skip,
  charged}`: the per-hit value exactly as `api.damage` will compute it
  (`calcHit` with the enemy's Strength plus its Enrage, which lands before it
  acts, minus a held weapon due to be digested; its Weak; the player's
  Vulnerable and Armor), the hits, a Hasty jab, the total; a charge's `next`
  is the unleash a turn ahead (one more Enrage, a 1-stack Vulnerable or Weak
  gone by then); `skip` for a frozen or stunned enemy or one its own Poison
  and Burn finish first.
- `COMBAT.qaThreat(F)` (pure) -> `{raw, burn, poison, bomb, dodged, blocked,
  net, loss, hp, left, lethal, per}`: the whole enemy phase if the turn ended
  now, in the engine's order: the player's Burn (a Hot Potato adds to it,
  through Block), the hits in acting order (Dodge eats whole hits, Block soaks
  the rest, a Vulnerable debuff lands for the enemies after it, Hasty repeats
  a debuff), lit bombs on their last turn, then the player's own Poison as the
  next turn starts. `net` is uncapped (so a lethal preview can say how much
  Block would save you), `loss` is what the engine takes. The combat suite
  proves it against the engine: every real enemy, 8 turns, two seeds: exact on
  every turn (a Greedy gulp's lent Strength, a boss trick and the wheel are
  left out by design).
- The intent bubble (`RENDER.intent(..., qa)`) shows the real hit; a multi-hit
  shows its total big with "25x2" under it (a Hasty jab as "+12x2"); a charge
  shows the warning and next turn's exact unleash ("! 129"). A big hit (a
  charge, an unleash, or a total of `QA_BIG` 30% of max hp) turns the bubble red
  and gets a pulsing danger ring around the enemy (behind its body; one static
  ring under reduced motion).
- A charge hangs the cabinet warning sign a turn ahead with the number
  ("GAPE NEXT TURN: 129"), then "GAPE: 129 INCOMING" on the unleash turn; a
  boss or bestiary sign always wins the frame.
- On your turn the HP stat shows a striped ghost of what the phase would take
  (the bar grows to 6 px), and a compact block at the arena's left edge (no
  enemy stands there; a label keep-out zone) reads INCOMING -n with "n blocked",
  ALL BLOCKED, or LETHAL! -n with "need n Block" (pulsing red, the HP stat's rim
  red). Hidden during the enemy turn, the versus card and the outro.
- A tap on an enemy adds "Hits you for n (hit xn)" or "Next turn: n" to its
  popover.

### Safe spots for the corner lane and the toast

The discovery toast used to cover the Compactor's sign, the Prize Vault's
"Unlocked" toast the win screen's Endless button. On every screen but the fight
and the map (which keep their own lanes), `qaCornerPlace` and `qaToastPlace`
measure the screen (`qaKeys`: buttons, headings, text by the box of its letters,
canvases, `.qaKeep` areas, the other lane's item, and `QA_SIGNS` for signs drawn
on the canvas: the Compactor's crossbeam at the press's live size) and take the
first candidate spot that covers nothing: the corner item tries the top strip
right then left (titles sit left), under it, then the bottom; the toast its old
y 400, the bottom, the top and four more. Else the least covered (a button or a
sign weighs 10, a heading 3, other text 1), full size first, then compact. A
sticker whose every spot would cover a button or a sign waits hidden with its
clock paused, `QA_HOLD` 4 s at most. Re-measured every 0.4 s and on a screen
change. `GAME.qa.measure` / `size` feed rects headless.

### The Compactor on a phone

The press is drawn at 0.8 (`cmpScene` `st.s`, `cmpPressK`) while you pick and
eases to full size for the crush; the bin grid scrolls in the middle under
"Your bin: tap an item to feed it (n/3)"; a dock in the thumb zone holds the
three chosen items (68 px slots), the rule line and CRUSH / Back. The result:
COMPACTED!, a recipe row (three in, an arrow, the new item), the card centred,
Continue in the dock. Button registration order is unchanged.

### Other polish

- The true ending's epilogue sits on a soft dark blurred panel, the credits on
  a soft gradient (no blur, the walk-out stays visible) that fades in with the
  roll; every line has a dark outline shadow, "RoxorLoops & Jasmin" too.
- The Back Room's HUD act stat reads "4 🔑" with a gold rim (was "Back Rm").
- The title logo is measured and fitted to the stage with a 14 px margin, its
  glow stroke included (at 92 px bold it ran past both edges; the C and E were
  cut at 360 and 390 px, Halloween too).
- The data suite's sticker cap is 60 (room for the round 7 stickers) and
  sticker names must be unique.

### The sweep (scratchpad `r7/bot.mjs`, `r7/tour.mjs`, `r7/perf.mjs`)

24 bot runs (4 crawlers x 6 claws, Tilt 0-10, 8 mutator mixes, every pet, boon
drafts, keys granted for the Back Room, reloads every 400 ticks; runs 16 and 0
reached the Back Room, 16 fought The Machine) plus Endless-only runs, and a
scripted tour (the vault's buy, equip and capsule; a boon; a set's fanfare and
a pet in a fight; all six map cabinets; the Compactor with reloads before and
after a crush; three keys, the door, the Back Room, The Machine to OVERCLOCKED
and MELTDOWN, the power down, the ending, the win, Endless to Loop 1; a reload
at each step). No page or console error, no stall, no NaN in the DOM, no button
overlap or off-stage button, no double banner. Found and fixed: the corner lane
and the toast over buttons and signs (above; the Compactor's dock was empty
while the press ran, so the toast settled where Continue then appeared: the
dock is `.qaKeep` now), and block-level text measured full width. By design:
a mid-fight reload restarts the fight from its seed; the rest's upgrade
picker reloads to the rest; the magnet claw on a crawler with no metal makes
very long fights for a random bot.

Perf (4x CPU throttle, 390 x 844 DPR 2, software raster, mean frame ms, HEAD
(round 6) -> round 7 working tree): fight idle 90 -> 79, grabbing 100 -> 95,
JACKPOT + tier 3 combo + labels 232 -> 198, boss finale 269 -> 228, map pan 139
-> 129, The Machine's MELTDOWN 283 -> 224, Blackout + a pet + two full sets
166 -> 140, an elite with the telegraph up 131 -> 125. No regression; the
profiles are native raster ("(program)"), no JS function over 1%.

`GAME.qa` = `{QA, BIG, HOLD, W, SIGNS, signs, tick, spot, cands, keys, corner,
toast, signOf, hud, bubble, cmpPressK, threat, by, sign, measure, size,
refresh}`. Tests: combat (every telegraph number against the engine, the
charge a turn ahead, Dodge, Block, Burn, Poison, bombs, lethal, purity, the
real-enemy sweep), game (the Gape's bubble, ring and sign, the pill and the
ghost in every state, a multi-hit's total and the popover, the safe-spot
picker, the Compactor's toast and the win screen's vault toast, the sticker
hold, the toast clear of the corner item, the Compactor's layout, the Back
Room HUD), render (the bubble's numbers in every mode, the logo fits), data
(the sticker cap and unique names).

## Run history, the death recap and photo mode (round 8)

A run used to vanish at the game over. Now every run leaves a card, a death
explains itself, and any moment can be framed and saved. Pure data in
`data.js` (the HISTORY block), the flow in `game.js` (the HISTORY block,
reached through one-line hooks), the art in `render.js` (the HISTORY block,
`RENDER.his`), the frame in `index.html` (`#scr-history`, `<style
id="his-css">`). No new sound names (`click, whoosh, vaultShare`).

### Run history

- **What is recorded.** Every finished run: a win (`showWin`, at once, so a
  win left on the Endless offer counts), a loss (`showGameOver`), an Endless
  end (the same record as its win, updated in place: result `endless`, the
  loop, the new score) and an abandoned run (`newRun` while a run with at
  least one fight is in progress or saved: result `quit`; a run left before
  its first fight leaves no card, a finished one is never recorded twice:
  `run.hisDone`). A new run gets its own id (`run.hid`; the daily shares its
  seed with everyone, so the seed will not do; an old save falls back to
  seed + crawler).
- **The record** (`DATA.hisRecFix` repairs one, short keys, about 400 bytes):
  `id`, `d` (epoch seconds), `c` crawler, `cl` claw, `o` outfit, `tl` Tilt,
  `mu` mutators, `se` season, `dl` daily key, `m` mode, `s` score (the run's
  best on record or `runScore`), `r` win | loss | endless | quit, `a` act, `lp`
  loop, `tu` turns, `kl` kills, `f` fights, `bs` bosses, `bh` biggest hit, `bc`
  best combo `{n, t}`, `jp` jackpots, `ev` evolutions, `st` sets completed, `b`
  the final bin (the 8 rarest, one of each, `'id'` or `'id+'`), `rl` relics (16
  at most), `mp` the act's map (`DATA.hisMapPack`: 2 bits a hex, 0 dark, 1
  water, 2 lit, 3 walked, three hexes to a character of a URL-safe base64, so
  a 16 x 22 map is 118 characters, plus the crawler, boss and start as cell
  indices), and for a death `k` the killer, `kk` how (hit, burn, poison, bomb,
  self), `ke` its enemy id, `km` the move, `kh` the hit, `lt` the last turns
  `[[hp lost, blocked, Block held]]`.
- **The profile** (`meta.his`, `DATA.hisFix` repairs it; an old or junk
  profile gets an empty one): `runs` (the last `HIS.CAP` 50, oldest first),
  `hof` (the Hall of Fame: the best `HIS.HOF` 10 by score of every run ever
  recorded, a tie to the older run, full copies so a famous run outlives the
  50), `by {crawler: [runs, wins]}` (lifetime, from the first record on; a
  run counts once, a win once) and `n` (runs on record). `DATA.hisPush(h,
  rec)` adds or updates (`quit` never overwrites a finished run) and returns
  `{rec, fresh, hof}`; a fresh record in the Hall of Fame puts a gold "Hall of
  Fame #n" tag on the game over or win screen. 60 records are under 42 KB.
- **The screen** (`history`, the title's History button with the run count,
  registered last so the menu keeps its `GAME.choose` indices; never saves the
  run). Back and a title; a summary line; the lifetime charts (one canvas,
  `RENDER.his.chart`: the score per run as a line with a dot per run in its
  result's colour, a star on the best, the average dashed; wins by crawler as
  bars with their portraits; the crawler filter narrows the line); Recent or
  Hall of Fame; filter chips by crawler (with a portrait) and by result (All,
  Wins (Endless too), Losses, Endless, Quit, `DATA.hisFilter`); the run cards
  (the crawler in the run's outfit, name and date, where it ended, Tilt,
  kills, turns, how it ended, DAILY / ENDLESS and mutator tags, the result as
  a tilted rubber stamp, the score; a rank badge in the Hall of Fame).
- **A run in full** (a tap on a card): the header (`his.hero`: the portrait,
  the score, the date, the stamp, the Tilt), the claw, season and mutator
  tags, the numbers as the run end's highlight tiles, how it ended (the
  killer's portrait and the kill line, then the last turns), the final bin in
  a little glass case (`his.bin`) with the names in rarity colours, the relics
  (a tap explains), the act's map (`his.map`: the fog, the water, the lit
  hexes, the walked road warm with gold dots, the start, the boss skull, the
  crawler where it ended), then **Share run card** (the Prize Vault's share
  card drawn from the record: its own outfit, date and score; share sheet with
  the PNG, else a download) and All runs. Escape goes back.

### The death recap

A fight keeps a log of its enemy turns (`HISR`, the run's own): `hisTurnEnd`
(before `COMBAT.endTurn`) snapshots your hp, Block and grabs left, the
`COMBAT.qaThreat` preview (lethal or not) and every enemy's telegraph from
`COMBAT.qaIntent` (the move, its real hit, a charge); `hisEvent` (the top of
`applyEvent`) books every hit on you to its source in the engine's order:
your Burn first, then the acting enemy (`FS.actor`), then lit bombs, then
your Poison as your turn starts; a hit outside the enemy phase is your own
bin. The game over (and an Endless end) opens with the recap panel over the
screen: WHAT GOT YOU, the killer's portrait (`his.foe`), "Killed by Ironjaw
with Gape for 129" (`DATA.hisKillLine`; an unleash is named by its charge,
the number is the hit's full strength), the last five turns (`his.timeline`:
hp lost in red over Block's soak in cyan, the Block held as a dashed tick, a
skull on the last) and one or two tips (`DATA.hisTips`, the most useful first:
the charge ("Ironjaw's Gape hits for 129 on the turn after opening wide.
Stack Block or kill it first."), unused grabs, a LETHAL preview and the
Block it needed, Burn or Poison, a bomb, a flurry of hits, turns in a row with
no Block, a hit over 40% of max hp, bosses and elites, else the INCOMING
pill). A tap (after 0.5 s, so a tap meant for the fight does not skip it),
Space, Enter or Escape goes on to the game over as before; it is not a
`GAME.choose` button, the screen keeps its choices. A death outside a fight
recaps just the killer.

### Photo mode

- **In.** A camera button next to the pause gear on the fight's control row
  (`#hisCam`) and the last button of the map head. It freezes the game:
  `update()` returns at once (`hisPhotoPaused`, after the Settings panel's
  pause), so no physics, no timers, no clock; the HUD and every DOM layer hide
  (`#stage.hisPhotoOn`), the keys and the pointer belong to the camera. Leaving
  (the X, Escape) hands the screen's buttons back and the game resumes on the
  very same frame.
- **The camera.** The frozen scene is painted once into a buffer through
  `draw()` itself (`hisPhotoCam` applies the pan and zoom while it paints) and
  again only when the camera moves. One finger pans, two pinch, the wheel
  zooms about the cursor, the arrows pan, + and - zoom, Reset; the zoom is
  1..3 and the view stays on the stage. With the controls up the photo sits in
  a viewfinder between the top bar and the bottom sheet (corner brackets, a
  record dot, `his.viewfinder`); a tap on the picture hides the controls and
  the photo eases to full screen.
- **Filters** (`his.photo`): none, CRT (a phosphor tint, scanlines, a rolling
  band, the tube's glass and round corners), Neon (bloom from a small copy
  added back, pushed colour, pink and cyan edges), Sepia (the scene's own light
  in sepia, a warm wash, a vignette, film grain and scratches), Pixel (a fifth
  of the resolution, nearest neighbour, a faint grid). **Frames**: none,
  Marquee (the cabinet frame with the CLAWSPIRE plate and chasing bulbs),
  Polaroid (paper, tape and a caption: the crawler, the act or loop, the
  date), Stickers (a candy stripe and die-cut stickers). **Stamp**: the
  crawler's portrait in their outfit in the corner with the name.
  Reduced flashing: the bulbs, the band and the grain hold still, the bloom
  and the shutter flash are soft.
- **Save PNG** paints the scene again at 2x (1080 x 1920) into its own buffer,
  composes the photo and hands it to the share sheet with the file, else a
  download ("Photo saved!"). Headless the canvases are stubs and nothing
  throws.

`GAME.his` = `{K, PHO, show, find, build, runEnd, quit, metaFix, idOf, verb,
recapData, recapShow, recapDismiss, share, saveCanvas, turnEnd, event, photo:
{open, close, set, pan, zoom, reset, save, export, pointer, wheel, can, draw,
compose, state, last}, meta, ui, recap, log, last, card, saved}`; `DATA` adds
`HIS, hisRecFix, hisFix, hisPush, hisRank, hisFilter, hisChart, hisMapPack,
hisMapCells, hisKillLine, hisTips, hisWon`; `RENDER.his = {STAMP, FILTERS,
FRAMES, stamp, chart, bin, map, timeline, foe, hero, photo, photoRect,
sticker, viewfinder, fmt}`. Save fields: meta `his` (above); run `hid`,
`hisDone` (optional; old saves have neither). No key was renamed.

Tests: data (records repaired and small, junk, the cap of 50 over 70 runs, the
Hall of Fame across all of them and ties, one record per run and quit never
overwriting, lifetime counts, the filters, the charts, the map packed and back,
the kill line and the tips for sample deaths), render (the four stamps, charts
full, single and empty, the bin, the map in every biome and none, the
timeline, the killer for many enemies, the header, every filter with every
frame distinct, the stamp, reduced flashing holding still, the viewfinder,
every frame's picture box), game (a loss, a win and its Endless end in place,
an abandoned run live and from a save, none before a fight; 60 runs to 50 and
10, small, saved and reloaded; the screen, its tabs and filters, a run in
full and Share, the title button last, Escape; old and junk profiles; a real
death to Ironjaw's Gape with its kill line, the charge and grabs tips and the
turns; an event death; photo mode mid grab: nothing moves through updates,
drags, the wheel, keys, every filter and frame and the save, then the grab
finishes; the 1080 x 1920 PNG headless; the map's camera untouched, the
controls as `GAME.choose` buttons, gone with its screen, never on the title).
Screenshots: scratchpad `r8/his_shots.mjs` (`r8_his_*.png`).

## Mama Mech and two new claws (round 8)

A fifth crawler who builds her own weapon out of the prizes, and two claws
that grab in ways the others cannot. Everything sits in `CR8` blocks: data
(`data.js`: her items after the Lucky Lou block, the relics, `CLAWS.vacuum`
and `CLAWS.twin`, her outfits, two evolutions, two stickers and `DATA.CR8`),
the turret rules (`combat.js`, the CR8 block: `COMBAT.TUR`, `turretParts`,
`turretFire`, `turretOf`), the rigs (`physics.js`: `CLAW_TYPES.vacuum/twin`,
their poses and the rig's vacuum and twin helpers), the art (`render.js`,
`RENDER.cr8`), the sounds (`audio.js`) and the flow (`game.js`, `GAME.cr8`),
all reached through one-line hooks. Ids are new; nothing was renamed, old
saves load unchanged (no `clawType`: the classic claw; no `char: engineer`:
nothing changes).

### Mama Mech, The Engineer

- **The kit.** `CHARACTERS.engineer`: 75 hp, 95 gold, 3 grabs, grip 1.1,
  speed 0.95, starter relic **Socket Set**, unlocked like Mira and Lou by
  reaching act 2 with anyone. 19 item bin: 5 Hex Bolts, 4 Tin Plates, a
  Pipe Wrench, a Spring Coil, an Oil Can (all new, all metal), plus an apple,
  3 iron nuts and 3 bouncy balls. Versus line: "Hold still. Measuring you."
  Tilt, the daily rotation, pets, sets and every claw type work for her the
  way they do for everyone (nothing crawler-specific in those systems).
- **Her items** (`char: 'engineer'`, drawn silhouettes in `RENDER.cr8.SIL`,
  optional PNGs in ART_PROMPTS.md): hex_bolt, tin_plate (starters),
  pipe_wrench (2 parts), spring_coil, oil_can (commons), rivet_gun, toolbox
  (3 parts), tesla_coil, mech_arm and mech_core (legendary, 6 parts). An
  item's `part` field says how many turret parts it is worth; any other
  metal item is one.
- **The gift: a scrap turret** on the cabinet's top right corner
  (`turret: true`). Every metal item she plays bolts parts on; parts climb
  the levels at `TUR.need = [0, 2, 4, 7, 11, 16]` (Bare Mount, Pea Shooter,
  Bolt Gun, Rivet Cannon, Gatling, Mega Mech). At the end of each player
  turn, before the enemies act, it fires `TUR.shots[lv] = [0,1,2,2,3,4]`
  shots of `TUR.dmg[lv] = [0,3,3,5,5,6]` at the target; at Lv 5 the last
  shot hits ALL. Parts past 16 are OVERCLOCK shots, fired on the spot.
  Turret damage has no attacker (no Strength, no Thorns), like a relic's.
  The Socket Set starts every fight at Lv 1 (2 parts) with 3 Block and turns
  junk into scrap parts.
- **Relics.** Blueprints (rare, `rules.turret`): any crawler builds the
  turret; Mama starts with 3 more parts. Armor-Piercing Rounds (uncommon,
  `tur: {amp: 2}`): +2 a shot; without a turret, a grab with 2+ metal items
  zaps for 3. Grease Gun (common): 2 Block per turret level at the end of
  the turn; without one, 2 per metal item delivered that turn (max 6).
- **Evolutions.** Hex Bolt + Dynamo = Thunder Bolt (Live Wire: a free part
  every turn, or a 3 zap with no turret); Tin Plate + Blueprints = Mech
  Plating (Armor Up: 2 Block per level at the end of the turn, 4 without).
- **Vault.** Two outfits: Welding Mask (uncommon) and Hard Hat (rare, with a
  headlamp), plus her Claw-o-ween Witch Hat. **Stickers** (two more on the
  board, still inside its cap of 60): Fully Armed (turret Lv 5 in a fight) and Clean Sweep (three
  prizes up the Vacuum Nozzle in one grab).
- **On screen.** `GAME.cr8`: the turret drawn at `CR8T` (scale 1.7) with a
  parts meter, a dome that grows each level, a barrel that swings to the
  target and recoils, bolts that streak to the enemy (the Lv 5 shot bursts
  on everyone), `+N PARTS` flying up from the chute, `TURRET LV n: NAME` on
  a level-up, MEGA MECH! on the marquee. Turret events get short beats so a
  Gatling volley does not drag. The player row pads right (`#playerRow.cr8Tur`)
  and the label zones keep off the turret.

### The Vacuum Nozzle (`clawType: 'vacuum'`)

- **How it grabs.** A flared nozzle on a clear wand, a canister above it and
  a ribbed hose to the carriage. It drops until it hovers just over the pile
  (it never plows in), then sucks: bodies within `suckR` are pulled toward
  the mouth, weaker the heavier they are (heavy-tagged things x0.3, anything
  wider than the bore x0.35). A prize that reaches the mouth, fits the
  bore, is not heavy and is light enough flies up the wand into the
  canister (visibly, shrinking into a swirling slot; `b.tube`, no
  collisions). Three fit (a Wider Palm and the Third Prong add one each).
  Full: it stops sucking and lifts.
- **Clogs.** A big thing yanked into the mouth at full suction jams it: it
  hangs welded to the nozzle, nothing else goes up, the rig travels 30%
  slower and a red CLOG light blinks. It is let go at the chute (or tears
  off); then the suction comes back.
- **Upgrades.** Wider Palm: a bigger bore, more reach, one more slot. Third
  Prong: a second intake (25% more reach, one more slot). Grip: a stronger
  motor (more pull, heavier things). Claw paint recolours the hose and nozzle.
- **Sounds and juice.** A whoosh on the drop and the suck, a slurp per prize
  (SLURP xN), FULL!, CLOGGED! with smoke and a sad claw, the blow at the
  chute (one prize every 0.07 s).
- **Numbers** (40 single grabs from a fresh bin, items per grab): knight
  1.9, alchemist 1.6, rogue 1.5 (her daggers clog it about half the time),
  Lou 2.8, Mama 2.8; the classic claw is 2.5 / 1.7 / 2.4 / 2.8 / 2.6.

### The Twin Claws (`clawType: 'twin'`)

- **How it grabs.** Two small claws (0.72 size, a little less grip) on one
  crossbar, each on its own cable. At the drop each head slides to a prize:
  the prize nearest the aim is the main one; a small one goes to the head on
  its side and the other head picks the nearest prize on its own side; a
  big one is hugged by both heads. The bar comes down until one head lands;
  the other keeps reeling out on its own cable until it lands too (a head
  landing on a pile it merely shoves, or pushing something too big into the
  floor, also counts). Then both close; each head holds its own prize, and
  they slide together a little on the way to the chute.
- **Upgrades.** Wider Palm: bigger heads further apart. Third Prong:
  grippier fingertips. Claw paint recolours the bar.
- **Juice.** A servo whirr on the drop, a double clack with a pink and a
  cyan ring on the close; the heads have a pink and a cyan LED eye.
- **Numbers** (as above): knight 1.5, alchemist 1.1 (her big flasks are
  not its thing), rogue 1.6, Lou 2.4, Mama 1.8. Weaker per head, great with
  pairs of small things.

### Tests and screenshots

physics (the vacuum lifts small light things and not heavy ones, clogs on
a big light thing and lets it go, holds three; the twins grab two prizes
separately, reel out independently to a raised prize; upgrades, auto-steer,
a rebuild empties the hose, determinism), data (her block, relics, outfits,
stickers, evolutions, both claws), combat (the Socket Set turret, Blueprints
for anyone and +3 for Mama, parts and `part` counts, volleys through
`endTurn`, the Lv 5 ALL shot and overclock, AP rounds and the Grease Gun
with and without a turret, the evolutions, a 40 turn fuzz), render (her
face, every hat, six distinct turret levels plus firing, level-up and mood,
the canister at every fill, clog and suction, the twin heads open, closed
and apart, all her items distinct), audio (every new sound), game (her card
and unlock, a new run, her Tilt; a real fight with every claw type where
the turret builds, fires on the frame and is drawn; real vacuum and twin
grabs in the game with their sounds and Clean Sweep; save/load with both
claws and an old save as the classic claw). Screenshots: scratchpad
`r8/shots.mjs` (`r8_cr_*.png`).

## Stories, the rival and alternate bosses (round 8)

Events used to be one screen and gone. Now some of them are stories that
come back, a rival keeps score across runs, and each act's boss has an
understudy. Data in `data.js` (the STORY block: `STO`, `STORIES`, `GARY`,
`STO_ENEMIES`), the rules in `combat.js` (the STORY block: the three boss
signatures, the ally, the sabotage, Gary's gear), the flow in `game.js` (the
STORY block, reached through one-line hooks), the art in `render.js` (the
STORY block, `RENDER.sto`), the frame in `index.html` (`#scr-rival`, `<style
id="sto-css">`). All of it is off headless unless `GAME.sto.force` is set,
so the bots, the balance sims and the older suites play exactly as before.

### Branching stories

- **Where they come from.** An event tile rolls `STO.p` (0.5): a hit opens a
  story not yet seen this run that is allowed in this act (`stoPick`), a miss
  is the old one-screen event. A story that is waiting to come back (a
  `later` callback, see below) takes the next event tile first.
- **Nine stories**, 2 to 4 beats each: The Caged Crab, Three-Card Monte, The
  Coin Seed, The Nervous Intern, Dance-Off, The Warm Egg, The Photo Booth,
  The Runaway Vending Machine, The Magpie Oracle. A beat is a text, a
  vignette and choices. A choice can pay (`fx`), go to another beat (`go`),
  set or add story state (`set`, `add`: the dance-off's score, the oracle's
  questions left), need something (`cond`: gold, HP, the state), or roll the
  dice (`roll {p, win, lose}`). Beat text can read the state (`{score}`).
  `stoChoose` resolves a choice from the story, the beat, the state and a
  seeded rng, and returns what to pay and where to go, so the suites test
  every branch without a DOM.
- **The screen** is the event screen with a STORY and PART tag (IT CAME
  BACK for a callback), the drawn vignette (or `art/events/<story id>.png`)
  and big choices with outcome chips. A roll throws the die first, then
  stamps THE DICE SAY YES or NO before the outcome lines.
- **Callbacks** (`run.sto.calls`, due from the next act on: `stoDue`):
  `ally` (the crab you freed pinches the biggest enemy at the start of an
  elite or boss fight: 6 + 3 per act, x2, times how kindly you treated it,
  and gives you 5 Block; the photo booth ghost Weakens them and gives you a
  Dodge), `hunt` (cheat at Monte and the Card Shark, Lefty's big brother,
  roams the next act's road as an awake elite: `sto_shark`), `later` (the
  coin seed you planted is a tree next act, the one you swallowed comes out
  of your belly; the egg hatches), `boss` (help the intern and this act's
  boss starts sabotaged: 12% HP off plus Weak and Vulnerable) and `shop`
  (Vendy, the vending machine you saved, runs a later shop and leaves you a
  free item there, once: `shop.stoGift`). Each callback pays once
  (`stoPay`, `meta.sto.pays`) and is capped at `STO.maxCalls`.
- **Save-safe at every beat.** A beat saves as `sd.event = {id, sto: 1,
  beat, n, cb, out}`; the result is paid and saved in the same step as the
  outcome, so a reload shows the outcome and never pays twice.

### The rival: Grabby Gary

- **Who.** A smug teen claw champion. Most profiles meet him (`STO.garyP`,
  0.85 of new profiles; an old profile rolls once). He has a special map tile
  (`rival`, placed beside the road a quarter to three fifths of the way up,
  never on it) in each act: act 1 he meets you and challenges you, act 2 a
  claw-off, act 3 a claw-off, or the showdown if you beat him twice this run.
- **The claw-off.** A shared bin (`garyPile`: 5 common, 3 uncommon, 2 rare,
  1 legendary, 2 rocks), three drops each, turns
  alternate. The prize values are tagged on the glass (junk 0, common 1,
  uncommon 2, rare 4, legendary 7). Gary's claw is the real rig driven by
  `rig.autoSteer`: he aims at the best prize he can see with a wobble that
  shrinks as his gear grows (`GARY.aim`) and grips harder (`GARY.grip`). A
  scoreboard, a turn stamp, his taunts in a bubble and the chute credits
  each drop. Win: 30 gold + 15 per act after the first, 6 tickets, an elite
  capsule and the best thing you grabbed; a tie: half the gold, 2 tickets;
  lose: 10 gold, 2 tickets. Every finished drop saves
  (`content.gary.live`), the result pays once (`paid`).
- **Memory across runs** (`meta.gary {met, offs, wins, losses, ties, duels,
  beat}`). His lines change with the record (`GARY_LINES`: first, ahead,
  behind, even, rematch, duel, win, lose, tie). His gear goes up as you beat
  him (`garyGear`: Rookie Cap, Pro Shades, Gold Chain, Champion Jacket,
  Turbo Claw), drawn on him and sharpening his aim.
- **The showdown** (act 3, two claw-off wins this run): an elite fight
  against Gary with the existing rival claw (`def.rival`, it grabs your
  rarest item each turn), +6% HP per gear piece and Strength from the
  jacket on. Beating him counts `meta.gary.beat` and the Rival Crusher
  sticker.

### Alternate bosses

Each act's boss has a 50% (`STO.altP`) understudy, decided once per act and
saved (`run.sto.alt`), so the map and a reload agree. Each has a VS card
title and taunt, a finale epitaph, a Prizedex entry and a signature:

- **The Plushie Queen** (act 1, for The Hoard): Plush Parade drops 3 plush
  into your bin; each plush in the bin soaks 1 off every hit on her (at most
  6). Grab them out to open her up.
- **The Conveyor King** (act 2, for The Smelter): Belt Drive turns the bin
  floor into a conveyor running away from the chute for a turn (the floor
  and slope segments get a surface speed, 70), and ships crates in on it.
- **The Arctic Arcade** (act 3, for Glacius): Ice Block freezes one of your
  items (two enraged) into a growing ice block in the bin (6 sizes). Deliver
  the block and it smashes: the items come back and she takes 5 per item; her
  death thaws it. The Prize Master still comes after her.

The new bosses are ordinary enemies with ordinary `sig`s, so Endless can
borrow their signatures; the secret act and Endless never swap bosses.

### Stickers, sounds, save fields

- Stickers: Rival Crusher (beat Gary's showdown), Full Circle (a callback
  paid off). Sounds: `stoPage, stoCallback, garyTaunt, clawOffBell,
  plushSqueak, beltRun, iceGrow, crabSnip, hunted`.
- Save: `run.sto {st, seen, done, cur, calls, alt, pays, gary {on, w, l,
  met, duel}, huntNote}`, the `rival` tile's `content.gary {seed, kind,
  said, met, live, res, paid, duel}`, the roamer `sto_shark`,
  `shop.stoGift`, `meta.gary`, `meta.sto {done, pays}`, the `rival` screen
  (`sd.rival {q, r}`). `stoRunFix` / `stoMetaFix` / `DATA.stoFix` repair
  old and junk saves; an old save loads with Gary rolled and no stories in
  flight.
- Tests: data (the stories' structure, every choice resolving, rolls, state,
  due and repair; Gary's data, taunts, pile and prizes; the new enemies,
  junk and stickers), combat (the plush soak and cap, the belt, the ice block
  growing and smashing, a 24-turn fuzz on the five new enemies, the ally and
  sabotage), render (the looks, the gear levels, the junk silhouettes, the
  vignettes, the tile, the board, the bubble, the belt, the glaze, the ally),
  audio (the nine voices), game (off headless; tile placement; an old save;
  beats, rolls, outcomes and reloads; every callback; a claw-off with a
  reload mid-way and paid once; memory, gear and the showdown; every
  alternate boss's VS card, signature and finale). Screenshots: scratchpad
  `r8_sto_shots.mjs` (`r8_sto_*.png`).

## Enemy families (round 9)

Monsters that come as a family fight better together, and the fight shows
it. Three families, one per act, three members each; a family is a set of
ordinary normal enemies with `fam` (the family id) and `look` (their own
drawing), so affixes, Tilt, Endless scaling, the telegraph and the bestiary
all apply as ever. Data in `data.js` (the FAMILY block: `DATA.FAM`,
`FAM_IDS`, `FAM_KINDS`, `FAM_ENEMIES`, `famOf`, `famsIn`), the rules in
`combat.js` (the FAMILY block), the staging in `game.js` (the FAMILY block,
`GAME.fam`), the art in `render.js` (the FAMILY block, `RENDER.fam`), the
sounds in `audio.js`. A fight without a family is bit for bit the same (no
rng is drawn, `F.fam` is null).

| family | act | members | the bond |
| --- | --- | --- | --- |
| **The Band** | 1 | Buster Beats (drummer), Low-Note Lenny (bass), Mic Drop Mimi (singer) | every member that takes its action adds 1 **Crescendo** (the drummer 2; a frozen or stunned one adds nothing); at 8, as the enemy phase ends, every member's intent turns into a **SOLO** (its pattern resumes after it). Knock one out on your turn while the SOLO is telegraphed and the rest **lose the beat** (`fumble`, no action, the meter empties); a member lost otherwise drops the meter by 3 |
| **The Vending Gang** | 2 | Pop Top, Snackatron, The Change Machine | `restock {v}` heals the most dented member (another one first) and gives it half as much Block; `cans {n}` lobs n Empty Cans (junk `fam_can`, grab one out for 1 HP) into your bin; `change {v}` takes up to v of your gold and gives every member 1 Armor per 4 gold (capped as ever); the Change Machine banks it and **pays it all back** when it breaks |
| **The Snow Globe Choir** | 3 | Soprano Globe, Penguin Alto, Snowman Baritone | the globes share one pattern and **hum** on the same step (the choir is put back in step after every enemy phase, so a frozen globe rejoins); the first hum of a phase **scrambles the pile** (the Prize Master's shuffle plus a shake); **shatter one globe and the rest get angry**: 3 Strength each (at once on your turn, as the phase ends during theirs) |

**Harmony.** A SOLO (`{k:'attack', fam:'solo'}`, each member's value in
`FAM.band.solo`, scaled like any attack) and a hum (`{fam:'chorus'}`) hit
for `v x (1 + 0.25 x the other members in it)`. Who is in it is read the
way the telegraph reads it (alive, the same family move, not frozen or
stunned, not about to fall to its own Poison and Burn) and snapshotted as
the enemy phase starts (`famPhaseStart`), so nothing in flight changes a
hit: the preview stays exact. `COMBAT.qaIntent` adds `fam` and `band` (the
members in it) and uses the harmony hit; `qaThreat` is unchanged in shape and
exact over every family encounter (the combat suite drives 4 seeds x 12
turns of every one of the nine encounters with random freezes, Vulnerable,
Block, a kill mid-fight and Poison). Anything that would change a hit mid
phase waits for the phase to end (the choir's anger) or only acts on your
turn (a cancelled SOLO).

**Encounters.** Each act's normal list ends with two duos and the whole
family (the lists run easy to hard, so the map puts them in the later
columns). HP sits in the act bands (act 1 15-24, act 2 36-50, act 3 44-58
per member); act 1 hits stay within 12.

**On screen (`GAME.fam`, `RENDER.fam`).** The FIGHT banner says the
family's name (THE BAND) and a marquee plate drops over the arena (FAMILY
FIGHT, the name, the tag line: THEY PLAY BETTER TOGETHER, THEY RESTOCK EACH
OTHER, THEY SING AS ONE) for 2.6 s. A **bond line** runs through the
members' chests behind them (the Band's pulses on the beat and carries
notes, the gang's carries cans, the choir's frost; red once angry). The
Band's **Crescendo** is a music staff over them (clear of the INCOMING
pill's slot, a label keep-out zone): a note pops in per beat played, the
staff turns gold and reads SOLO! when full. The Band bounce on **one shared
beat** (116 bpm: the drummer's sticks alternate, the bass nods, the singer
sways), so the three move together. A SOLO's bubble shows a note instead of
a sword, a hum's a snowflake, both with a rim pulsing on the beat and an
`x3` chip for the members in it; restock (a can and a plus), cans (two
tumbling cans), change (a spinning coin) and lost the beat (a struck-out
note) have their own icons. The SOLO: spotlights on the members, notes
bursting from each, SOLO!, a shake, a pink flash (reduced flashing caps
it). Cans arc from Pop Top's mouth into the bin and land as bodies; a
restock can flies between machines; your coins fly from the gold counter
into the Change Machine and back out at the payout. The choir's globes
wobble together while the pile scrambles; a shattered globe bursts glass;
angry globes glow red with flurries whipping round and steam puffs. The
family events keep short beats (`FAM_BEAT`: a meter tick 0.14 s, a SOLO
0.8 s). Sounds: `famIntro` (a count-in, a vending jingle, a choir chord),
`famBeat` (a tom and a note climbing with the meter), `famReady`,
`famSolo`, `famCancel` (a record scratch), `famRestock`, `famCan`,
`famChange`, `famPayout`, `famHum`, `famShatter`, `famAngry`.

`GAME.fam = {BEAT, PLATE, STAFF, title, start, event, tick, staffBox,
beatOf, back, front, shakeX, fs}`; `COMBAT.FAM_KINDS, famHit, famIn,
famState, famOf`; `RENDER.fam = {BPM, COL, COL2, ICON, beat, note, globe,
snow, bond, staff, spot, burst, angry, plate, intentIcon, intentRide, glyph,
KEYS}`. Fight-only state (`F.fam`, `FS.fam`, `e.bank`, `e.famAngry`); no
save field. Tests: data (the table, members, looks, encounters, the can,
the choir's shared step), combat (the Crescendo and the SOLO, the pattern
resuming, a frozen drummer, a duo, the cancel and the drop, restock / cans /
change / the payout / broke, the hum and its scramble, the resync, anger on
your turn and at the phase end, the exact preview sweep, a 30 turn fuzz),
render (nine distinct drawings over their fallbacks, the shared beat, every
intent icon, bonds, the staff, the plate, the spot, empty layers paint
nothing), game (the banner and plate, the staff box, beats, a real SOLO
landing exactly as telegraphed, cans as bodies, change and payout, the
scramble and the wobble, anger drawn, no family state elsewhere), audio
(every voice). Screenshots: scratchpad `r9_fam_shots.mjs` (`r9_fam_*.png`).

## Holo cards (round 9)

Item and relic cards shine like foil trading cards (Balatro's holo). Every
item card (`itemCard`: the reward, the shop, the forge, the bin), the shop's
relic, the treasure reveal, a capsule's prize card and a found item or relic
in the Prizedex get the holo layers (`holoOn(card, rarity, {quiet})`): a
rainbow foil under the words (a band plus a fine holo grain, `screen`
blended), a glare over them, and on a legendary six sparkles that twinkle.
Common cards have no foil, uncommon a faint cyan one, rare a rainbow one,
legendary (and boss relics) a stronger one whose hue turns. Every card tilts
toward the pointer or finger (up to 7-12 degrees by rarity) with the foil
and glare under it and its shadow falling away, or wobbles gently on its own
phase with the foil sweeping slowly; on a phone the device tilt steers an
idle card's foil. Hover scales a card up, a press down.

`RENDER.holo.look(rarity, st, out)` is the pure function of it all (st {t,
ph, on, px, py, gx, gy, reduced, noFlash} -> {rx, ry, deg, ax, ay, hx, hy,
foil, glare, hue, spark, twinkle, sx, sy}); `holoTick` copies it onto the
live cards' CSS about 30 times a second: the tilt as the independent CSS
`rotate` (so the deal-in animation's `transform` is untouched), `--hx/--hy`,
`--foil`, `--glare`, `--hue`, `--sx/--sy`; the CSS (`<style id="holo-css">`)
paints. Quiet cards (the Prizedex grid, the bin, the Compactor) only move
while a pointer is on them. Reduced motion (Shake off, `prefers-reduced-motion`):
no tilt, no wobble, the foil at rest. Reduced flashing: a dimmer foil and
glare, still sparkles. Headless: the classes and `card._holo` only. No
button was added or moved; `GAME.holo = {HOLO, on, tick, apply, rar, live}`.
Tests: render (every rarity and junk input finite and in range, foil by
rarity, the pointer, the idle sweep, reduced motion and flashing,
determinism), game (the reward's three cards and their layers, sparkles on
the legendary only, the look on the CSS, the pointer, reduced motion and
flashing, the shop, the treasure and the capsule card).

## Shop reroll (round 9)

A slot-machine lever under the shop's shelf: **REROLL THE SHELF**, 10 gold,
10 more for every pull in that shop (Price Hike applies). A pull pays, rolls
a fresh shelf of five from its own seeded stream (`shop.rrSeed`, the pull
count: the same pull always gives the same shelf) and saves in the same beat
(`shop.rrN`, the new items), so a reload never charges twice and shows the
new shelf even mid-spin. Then the shelf spins like reels: every card's
picture turns into a reel of prizes scrolling past a gold payline, its words
hidden, and the reels stop one by one left to right (0.6 s, then every 0.3 s)
with a thunk (`reelStop`, rising), the card bouncing back in, a gold
sparkle burst and the `rrShine` chime on a rare or legendary. A spinning card
is not for sale: a tap on it (or a second pull) brings every reel home at
once. The prize counter has the same lever, **REROLL THE CASE**, for tickets
(4, +4 a pull; `shop.ctrN`) over its six prizes. The shop's lever registers
just before the Compactor (the Compactor and the Prize counter stay the last
two entries), the counter's after Back to the shop, so every old
`GAME.choose` index holds. `S.rr` is the animation (never saved); a shop
from an older save has no pull count and starts at the first price.
`GAME.rr = {RR, cost, shelf, pull, hurry, tick, busy, pool, land, state}`.
Tests (game): the button order, the price and its rise, the seeded shelf,
reel by reel, no sale mid-spin and the hurry, the animation completing on
its own, too poor, pay once across a reload mid-spin, an old shop, the
counter's pull for tickets with its reload.

## Lore and the weekly challenge (round 9)

The Clawspire gets a memory and a reason to come back on Monday. Voice:
short, funny, a little melancholy. Everything here lives in `LORE` blocks
(data.js, map.js, render.js, audio.js, game.js, the `lore-css` style) and
reaches the game through one-line hooks.

**The Codex** (screen `codex`; the title's Codex button just before History,
and a Codex door at the end of the Prizedex, so every old `GAME.choose`
index holds). Eight chapters, 42 pages of 60 to 120 words: The Spire, The
Prizemaster, The Floors, The Crawlers, The Bosses, Bestiary, Gary, and The
Machine, which stays a shut `???` card until the Machine has been met. Each
page has an unlock rule read from the profile (runs, fights, grabs, acts
reached, wins with a crawler, kills of an enemy, sightings, capsules, arcade
plays, golden keys, Back Room visits, Gary's record, Tilt, Endless loops);
two pages are spoilers whose hints stay vague (`LORE_SPOIL`). The book shows
a progress bar per chapter and a NEW badge; a chapter lists found pages with
their first sentence and dark ones with how to earn them (a counter when the
goal is a number); a page has a big animated vignette drawn in code
(`RENDER.lore.vignette`, one scene per page: the enemy or crawler, the tower,
the rig, the floor with its locals, the Machine), its words, and Prev/Next
through the chapter's found pages. Reading a page clears NEW. Kills per enemy
are counted from the fight's `die` events (`meta.lore.kills`); new pages are
checked every half second off the fight and share the corner lane as one
toast with a thumbnail. 25 pages earn the **Lorekeeper** sticker. A profile
from before the Codex gets what it already earned silently, marked NEW.

**Landmarks.** Towers, cabinets and the pet shop have lines, and every world
map gets three new landmarks on empty land off the road (`MAP.lorePlace`,
its own stream from the map seed, never on the start, the boss, the golden
key's hex or a roamer, spaced apart): a **jukebox**, **lost tickets**, and
the **old high score board**. A tap on one in sight shows a speech bubble
(the tap still walks), stepping on one does too, and a walk that ends on the
board opens it: your Hall of Fame runs (initials from the crawler and run)
among the regulars (P.M, GRY, DAD, ZZZ, CPU and friends; ties go to the
house). An old map gets the same three on first use.

**Act intros.** The first time a run enters a map (`a1`..`a3`, an Endless
loop `L<n>`, the Back Room `room`) a title card plays: the act, its name, two
typed lines, the biome's sting (`loreSting`). 2.8 s the first time, 1.3 s on
every later one (`meta.lore.intros`); a tap after a quarter second or Space,
Enter or Escape skips it, and the map takes no input under it. `run.lore.intro`
remembers the map, so Continue never replays it (an old save is marked on load).

**The weekly challenge** (screen `weekly`; the title card sits beside the
Daily run and counts down). The key is the ISO week of a local date
(`2026-W40`; 2027-01-01 is `2026-W53`). Each week draws a theme (14, a
seeded order per cycle, never the same twice in a row) with its lead mutator
and one or two more, a fixed crawler and claw, Tilt 0 and a seed everyone
shares. Medal targets are bronze 1200, silver 2600, gold 5500, platinum 8000
times the mutators' score multiplier. The run's final score is the week's
best if higher; the best medal is kept (`meta.wk = {best, medal, runs}`, the
newest 156 weeks). The end panel shows the score, the medal (a new one pops)
and the next target; the weekly screen has the banner, rules, targets, your
best, Play, and the medal cabinet. Gold earns the **Podium Finish** sticker.
Nothing reads the clock under test: `GAME.wk.setDate` injects the date
(headless default 2026-03-02).

Headless, the popups (toasts, bubbles, the board, the intro card) stay off
unless `GAME.lore.force`; the counting and saving still run.
`GAME.lore = {show, back, check, marks, tap, enter, board, intro, mapKey, ...}`,
`GAME.wk = {setDate, key, def, left, show, start, runEnd, endPanel, meta}`.
Tests: data (the book's shape, words, dashes, rules, hints, fixes, snippets,
the board, intros, ISO weeks and their edges, 120 weekly defs, medals and the
cabinet, the stickers), map (landmarks over 100 seeds), render (every
vignette distinct, locked and moving, marks, bubbles, board, intro cards,
medals, the banner), game (profiles, kills and unlocks, the Codex walk,
landmarks through the real tap path, intros, the weekly start to medal to
reload).

## Load, labels, QA sweep 3 and memory (round 9)

Presentation and plumbing only: no rule, balance number or save field
changed. Owner: the QA pass. Code sits in `q9*` helpers (render.js next to
what they touch, game.js in the LABELS / TITLE / MEMORY blocks after the QA
block), `index.html` (`#boot-css`, `#csBoot`, `#csBootJs`).

### Startup and load

Measured in headless Chromium at 390 x 844 DPR 2, 4x CPU throttle, served
gzipped (as Cloudflare does) under DevTools' slow 4G (562 ms, 180 KB/s),
median of three cold loads (scratchpad `r9/load.mjs`).
- **A loader** (`#csBoot`): a CLAWSPIRE marquee with twelve bulbs, painted by
  the HTML itself while the scripts download. Bulbs light by the bytes of the
  scripts that have landed (resource timing, weighted by each file's rough
  gzip size, plus a slow creep between landings) and it fades one frame after
  `GAME.boot` has drawn. A script that fails, or a page still loading after
  30 s, offers Reload. Its script has an `id`, so the suites never run it.
  First paint 6.1 s -> 0.8 s (the page used to be blank until every script
  had landed).
- **The art manifest and the PNG probes** start after the first frame
  (`q9ArtLater`), not inside `boot`. Without a manifest (dev servers) the
  hundreds of probe requests used to hold DOMContentLoaded to 2.6 s.
- **The title** draws its 36 falling prizes from cached sprites
  (`q9TitleSpr`, one per art key and device scale; a slot machine's text
  among them was the top cost) and the five-pass logo from one cached sprite
  (`q9Logo`); the logo's fit is measured once per stage width instead of
  setting `ctx.font` every frame. Unthrottled network, 4x CPU: the first
  frame finished 1.44 s -> 0.40 s after navigation; the title's frame 134 ->
  51 ms (attract) and 88 -> 58 ms (menu).
- Still network bound: first frame at ~5.7 s on slow 4G for 797 KB gz (6.2 s
  for this round's 879 KB). Not done (a build change): a whitespace-and-syntax
  minify of `js/` in `dist` only would cut the scripts ~31% gz (about 1.3 s
  on slow 4G), and `_headers` with hashed script URLs would save the warm
  load's revalidation round trips (~1 s).

### Crowded labels (the layout manager, extended)

- **Damage numbers join the layout** (`p.nlay`; `o.free` opts out). They go
  first, oldest first, keep their physics flight and are only nudged (up,
  down or a step or two sideways, `sideSpot`) as far as needed to clear the
  zones and the older numbers, at most `LAYOUT.numMax` (80) px, then 1.6x
  that, else they stay; never hidden. Labels are laid after them (so they
  flow around the numbers) and got the same sideways candidates. `fx.draw`
  paints the labels first and the numbers last, on top.
- **Soft zones** (`fx.zone(id, x0, y0, x1, y1, true)`): kept clear while there
  is room within `LAYOUT.far` (110) px, else ignored, so nothing is thrown far
  from what it belongs to. A zone set again moves in place (no allocation).
- **The arena reserves its space** (`q9LabelZones`, every frame of a fight,
  soft): each enemy's intent bubble (`q9b*`), its elite / boss chip right of
  the hp bar (`q9c*`), its hp bar and status chips (`q9h*`), a story ally
  while it runs across (`q9ally`), the wall sign the backdrop drew
  (`q9sign`, recorded by `RENDER.bg`); the cabinet's warning sign
  (`q9bsign`, recorded by `bossSign`) is hard.
- **The INCOMING pill owns a slot** at the arena's left edge (`Q9_SLOT`, x
  4..110 from y 72, its hard `qa` zone as tall as the pill really is): no
  enemy stands there, the wall sign now draws right of it
  (`Q9A.slotX`), and while the fight's corner lane shows a discovery toast
  there the pill steps down under it (`q9PillTop`).
- Stress tests: render (five numbers and a label on one spot, soft zones,
  layout off) and game (a boss and a trio with the crab ally, relic procs
  on both sides, a combo, four numbers with a crit, a status and the
  telegraph: 150 frames, no overlap, nothing in a hard zone).
  `fx.rects()` returns both sets from one pass, `fx.numRects()` the numbers.

### QA sweep 3

24 bot runs (scratchpad `r9/bot.mjs`: five crawlers x eight claws, Tilt
0-10, mutators, pets, `?season=halloween` and `?season=winter`, stories and
Grabby Gary on, alternate bosses forced on half, evolution recipes primed on
half, 191 reloads) plus a scripted tour (`r9/tour.mjs`: an evolution
delivered and a reload mid ceremony, a forge; both seasons' title, map, door
(reload mid knock, paid once) and fights; all nine stories down three branches
with a reload at every beat; a claw-off with a reload after every drop, paid
once; the three alternate bosses with a reload and their finales; Mama's
turret with all eight claws; the vacuum and the twins with all five crawlers;
photo mode through every filter and frame and Save; a death, its recap, the
history list and a run in full). No page or console error. Fixed: the run
cards said "1 turns" / "1 kills" (`q9n`); the title's subtitle ran under the
first button (below). By design: a claw-off has no buttons mid play (the
glass is the control), a reload during the map's fight iris lands in that
fight, a run card is gone from the save after the game over.

### The title

The menu grew until its first button covered "a claw machine roguelike" at
360 x 780 and 390 x 844. `q9TitleFit` measures the menu (every 0.2 s on the
title and when it is built) and `q9TitleLayout` (pure) lifts the logo block
(the word, the subtitle, a season's banner over it) above the first button,
never below the stage's middle and never under the season ribbon; the
renderer reads `RENDER.q9.title.ly`. A menu that still cannot fit (a large
text size with every button on) gets a max height and scrolls. Buttons and
their indices are untouched.

### Memory

A 20-fight session with the map and screens between (`r9/mem.mjs`, heap
after a forced GC, DOM counters): DOM nodes and canvases plateau in a steady
run; the JS heap grows ~0.15 MB a fight, almost all of it compiled code. The
leak was the glow sprite cache: one canvas per colour and whole-pixel radius,
295 canvases and 17 MB after 16 fights and still climbing. Radii past 24 now
share a sprite per 10% step, none is built past radius 128 (drawn larger),
and past 1.6 M pixels (6 MB) the cache starts over (`glowKey`, `GLOW_BUDGET`).
The test-hook logs without a cap (tips, season, stories) keep their newest
400 (`q9Trim`).

`GAME.q9 = {SLOT, L, zones, pillTop, enemyPos, intentY, artLater, n, trim,
LOG, TITLE, T, titleLayout, titleFit}`; `RENDER.q9 = {arena, titleSprites,
logo, title, glowStats}`; `RENDER.fx.rects / numRects`.

## Mix and juice pass 2 (round 10)

Nine rounds added about 215 sounds, a dozen music variants and a lot of
motion. This pass makes them sit together. Presentation only: no rule,
balance number or save field changed. Code: audio.js (the MIX block at the
end, plus one-line changes in `build`, `sfx`, `duck`, `newLayer`,
`withContext`), render.js (the trauma budget in `RENDER.fx`), game.js (the MIX
block before `state()`, one-line hooks in `setScreen`, `update` and the hit
stop), index.html (`<style id="mix-css">`, last in the head).

### The mix (audio.js)

- **Loudness tiers.** Every sfx sits in one of six tiers (`AUDIO.mix.TIER`,
  unknown names are `mid`): `tick` (counter ticks, rattles: -38), `ui` (clicks,
  footsteps, blooms: -32), `soft` (the claw's own clatter, landings, pets: -28),
  `mid` (hits, blocks, statuses, pickups: -24), `big` (crushing hits, crits,
  bombs, combos, the versus slam, the boss sting: -19.5), `huge` (jackpot, boss
  down, the evolution burst, capsule burst, win, victory, set complete, arcade
  jackpot, power down: -15.5). The number is K-weighted loudness (a +4 dB shelf
  at 1.5 kHz, a 38 Hz high pass) of the loudest 100 ms window, dB, pre-bus.
  `MIX_TRIM` is the dB per voice (on top of the old `LEVEL`) that lands it on
  its target +-`MIX_WIN` (2.5), measured by rendering every voice on an
  `OfflineAudioContext` in Chromium (scratchpad `r10/loud.mjs`); trims are held
  to -14..+12 dB. Opts still scale inside a voice (a legendary capsule over a
  common one, a tier 3 combo over a tier 1).
- **Before / after** (pre-bus, dB; the spread inside every tier went from
  10-23 dB to under 0.5 dB, and nothing clips before the bus any more):

| tier | target | voices | before: range (median) | after: range (median) | loudest peak before -> after |
| --- | --- | --- | --- | --- | --- |
| tick | -38 | 6 | -47.8 .. -37.7 (-42.4) | -38.2 .. -37.8 (-37.9) | -19.0 -> -19.2 dBFS |
| ui | -32 | 19 | -40.6 .. -27.6 (-32.1) | -32.2 .. -31.8 (-32.1) | -12.7 -> -15.8 |
| soft | -28 | 67 | -38.7 .. -16.8 (-30.3) | -28.2 .. -27.8 (-28.0) | -6.4 -> -8.7 |
| mid | -24 | 87 | -33.0 .. -15.0 (-26.1) | -24.2 .. -23.8 (-24.0) | 0.0 -> -1.9 |
| big | -19.5 | 23 | -29.6 .. -7.0 (-23.1) | -19.7 .. -19.3 (-19.5) | +4.4 -> -4.9 |
| huge | -15.5 | 11 | -20.3 .. -13.4 (-17.7) | -15.7 .. -15.3 (-15.5) | -0.2 -> -1.7 |

  The worst offenders: `boom` -7.0 -> -19.5 (a bomb in the bin was louder than
  the jackpot), `vsSlam` -9.1, `crit` -11.0, `hitBig` -11.9 (all big now);
  `stingBoss` -27.7 and `lose` -27.6 were buried (both big now), `diceRoll`
  -47.8 and `wheelSpin` -40.6 were inaudible, `petHonk` -38.7. Through the real
  buses and the limiter the tiers hold within a dB or two (`r10/loud_afterbus`).
  Round 10's own new voices (Ms. Bubbles' `rosBlow`, `rosPop`, `rosCombo`,
  `rosQuake`, the pets' `rosSlide`, `rosSweep`) are calibrated the same way; a
  voice added later without a trim plays as `mid` at its own level, and the
  audio suite fails it only if it would be jarring (over its tier's ceiling).
- **Voice caps per tier** (`MIX_CAP`: tick 3, ui 4, soft 8, mid 10, big 6, huge
  3). The capped tiers add up to under the global 32, so a flood of one kind
  never starves another, and the global cap never stops a sting.
- **Ducking.** The tick, ui, soft and mid voices ride their own gain
  (`S.minorG`) into the sfx bus. A `huge` voice (`mixSting`) ducks them to 0.5
  for up to 1.1 s and the music to 0.35 for up to 2.5 s, then both ramp back in
  0.5 s. Ducks merge (`mixRamp`): the deeper depth and the later end win, so a
  big hit right after a jackpot never cuts the jackpot's duck short (it used
  to restart it). A duck asked for from inside a hit-sized voice (`hitBig`,
  `crit`, a combo, the relic reveal) is a short shallow dip (0.6 for at most
  0.4 s) instead of a hole in the music; `AUDIO.duck()` from the game keeps its
  shape. `AUDIO.mix.duckAt(t)` reads the curve the AudioParams follow.
- **No machine gun.** The repeated sounds (`MIX_VARY`: footsteps, steps, hits,
  blocks, landings, clanks, thuds, bonks, pegs, ticks, clicks, reel stops...)
  get a seeded pitch spread (+-4.5%, +-2% for the ticks) and level spread
  (+-1.5 dB, +-1 dB) on top of the old 1.5% detune, never within a third of
  the spread of the last one. `AUDIO.mix.seed(n)` reseeds it; `mix.last` is the
  last spread.
- **The limiter.** A brick wall (`MIX_LIM`: -2 dB, ratio 20, 2 ms attack) after
  the master gain; the glue compressor stays where it was.
- **Music under the sfx.** Every tune and act variant was measured the same way
  (`MIX_MUS`, dB per `accSongKey`: the act maps, the fights, the seasonal title
  and map tunes); each now sits about -33 dB integrated as heard and under
  -28.5 dB in its loudest 400 ms, 5 dB or more under a hit and 9 under a big
  one. The hype and tense layers ride inside their tune's level. Before: the
  act 3 map ran at -29.8 / -24.0 (hotter than a hit), the fights at -30.6.
- **Offline rendering** (`AUDIO.mix.offline(ac, o)`): one voice (`o.sfx`,
  `o.opts`, `o.raw` without the trim) or a stretch of a tune (`o.music`,
  `o.act`, `o.season`, `o.layers`) on any context, straight to its destination
  or through the real buses (`o.bus`); the live graph, its ducks and voices are
  untouched. Chrome's compressors start clamped, so a bus render starts half a
  second in.

### Juice pass 2

A Playwright tour of every screen (scratchpad `r10/tour.mjs`: 36 steps, an
audit of entry motion, press feedback, button styles, fonts and whether a
button is covered, two shots each, `r10_mix_*.png`) found these dead moments,
all fixed:

1. Eighteen screens cut straight in under the wipe (character select, rest,
   forge, event, help, tips, the Prizedex, stickers, history, Codex, weekly,
   shop, prize counter, spare parts, bin, treasure, Compactor, the rush menu):
   their content now rises in block by block (`.mixIn`, `MIX_SCR`).
2. Long lists appeared all at once (the sticker board, the Prizedex grid, the
   history runs, the Codex chapters and pages, tips, the help's status list,
   the run stats, the highlights, sets, evolutions, the Compactor's bin): they
   deal in one by one.
3. A Prizedex tab, a history filter or a Codex page snapped its new list in:
   it re-deals (`.mixRe`), without replaying the screen's entrance.
4. The map head popped in: it drops.
5. The top bar, the player row and the control bar snapped back when a fight
   or the map came up from the menus: they slide in (`.mixHud`).
6. The run stats and highlights on the game over and the win, and the history
   scores, snapped: they count up from zero with ticks rising in pitch (the
   game over waits for its recap to be put away).
7. Stickers, the vault's tabs, switches and wallet, the Compactor's slots, the
   boon cards, the mutator header, the HUD relics, capsule and tool chips and
   the rush menu's items had no press state: they press in (the `scale`
   property, so tilted stickers and holo cards keep their transforms) and glow
   on hover.
8. END TURN and other buttons snapped from disabled to enabled: they fade.
9. Toasts only faded: they pop.
10. The title's way in sat still: Continue / New run breathe.
11. A volley of crits (a Gatling turret, a finale's ten blasts, a combo on a
    crit) stacked camera shake into a long wobble: the trauma budget.
12. The same volley stuttered the physics with back-to-back hit stops: the hit
    stop budget.
13. Footsteps, pegs, ticks and landings played the same note like a machine
    gun: the spread.
14. Chests, capsules and boss downs fought the pile and the pets for the ear:
    the stings duck the minor sfx.
15. A bomb in the bin was louder than the jackpot, and the boss sting was
    buried: the tiers.
16. The act 3 map music sat over the hit sounds: the tune levels.
17. The shop's Leave and the prize counter's Back were loud pink primaries
    while every other way out is a ghost button: ghost now.
18. On help, the Prizedex, the sticker board and tips the only way out sat at
    the bottom of a long scroll (the Prizedex's under 150 cards): it stays on
    screen (`.mixStick`, sticky; the Codex and the history keep theirs top
    left). No button moved in the registration order.

**The trauma budget** (`RENDER.fx`, `fx.TB`: cap 1, refill 0.8 a second,
floor 0.25, ceiling 0.85, kicks 12 px): every shake draws on the budget; a
shake it cannot cover keeps only the floor of the rest, trauma never passes the
ceiling (at most 11.6 px of shake), kicks add up to 12 px. One big hit still
lands in full; a 3 s volley of 30 hits adds under 60% of what it asked for.
`fx.budget()`, `fx.clear()` refills it. **The hit stop budget** (game.js
`MIX_HS`: 0.3 s, refilling 0.3 s a second): a hit stop spends frozen time;
when it is out the physics runs on, so crits for two seconds freeze the pile
for about 0.45 s in all.

**Entrances never hold input.** The classes are zero specificity (`:where`),
so every screen's own entrance or loop wins; they animate `translate`,
`scale`, `opacity` and `filter` only (never `transform`, never
`pointer-events`) and come off after 0.8 s (`MIX_IN`); the buttons are
registered and live at once. Reduced motion (Shake off, or the OS setting)
skips them; the breathing and the toast pop stop under `.calm` and
`prefers-reduced-motion`. Headless (the suites) the timers run and no number
is touched. The tour's check: after every entrance the centre of every button
is the button (only the game over's recap covers its buttons, by design).

**Consistency.** Fonts: one family everywhere (Trebuchet; the reboot's BIOS log
is Courier on purpose). Buttons: every tappable element is a `.btn` variant
or has its own press state; a way out is a ghost button, except the lone
Back of a long list screen, which is a sticky primary. Headings: 30 px, 26 px
beside a top-left Back (the Codex, the history, the weekly, the rush menu),
the event's gold and the counter's neon on purpose.

`AUDIO.mix = {TIERS, TARGET, WIN, CAP, TIER, TRIM, VARY, DUCK, LIM, MUS, MINOR,
STING, tier, level, musK, offline, seed, last, duckAt, voices, limiter}`;
`RENDER.fx.budget / TB`; `GAME.mix = {HS, IN, SCR, HUD, COUNT, hsTick,
hsSpend, screen, tick, countStart, calm, ui, hs}`.

Tests: audio (a small offline WebAudio in plain JS renders every voice: each
calibrated one inside its tier, nothing uncalibrated over its tier's ceiling,
no clipping pre-bus, the tier medians on target and in order, the owner's
named sounds in their tiers and a margin apart, opts still scaling; the music
and its layers, the act maps and the seasonal tunes under a hit; a sting's
duck on the music and the minor sfx and its release, a big hit's shallow dip,
ducks merging, every sting ducking, the game's own duck; voice caps per tier;
the spread seeded, bounded, never repeating a pitch; the limiter and an offline
render leaving the live graph alone; the Node renderer lands within 0.1 dB of
Chromium on the median voice and 2.5 dB at worst, its squares are not
band-limited), render (the trauma budget: one hit in full, the ceiling, a
volley held, the floor, the refill, junk amounts, kicks, reduced motion,
clear), game (the hit stop budget through real frames; entrances, list
re-deals and the HUD slide on and off for every screen with input live at
once, reduced motion, the CSS never touching pointer-events or transform;
press states for every tappable class and every registered button; the
count-ups landing exactly).

## Boss Rush and the ghost race (round 10)

Two modes for the player who has seen it all: every boss back to back
against the clock, and a race against your own best climb of the day. Data
in `data.js` (the RUSH block: `RUSH`, `rushOrder`, `rushKit`,
`rushDraftKinds`, `rushScore`, `rushFmt`, `rushFix`, `rushRecord`,
`rushBoard`, `GHO`, `ghoCp` ... `ghoSeries`), the flow in `game.js` (the
RUSH and GHOST blocks after LORE, `GAME.rush`, `GAME.gho`), the art in
`render.js` (the RUSH block: `RENDER.rush`, `RENDER.gho`), the frame in
`index.html` (`#scr-rushmenu`, `#scr-rush`, `<style id="rush-css">`), all
reached through one-line hooks. No new sound names (`vsSlam, whoosh,
stingBoss, stamp, fanfare, win, lose`).

### The Boss Rush

- **The door.** The title's Boss Rush card sits beside the Prize Vault (one
  row, so the menu is no taller; registered after the weekly card and before
  History, which stays last). It shows the best clear, or "Win a run to open
  it" with a padlock: the rush opens after the first win. The rush menu
  (screen `rushmenu`, never saves a run) has the banner (BOSS RUSH over the
  whole lineup, the bosses beaten in a rush in colour, the rest silhouettes,
  The Machine a `?` until met), the rules, a crawler pick (remembered as
  `meta.rush.pick`), the crawler's kit, Start (disabled while locked) and the
  board: your best clear per crawler, fastest first, then the most bosses.
- **The lineup** (`DATA.rushOrder(seed, {machine})`): the three act bosses
  and their understudies (the Hoard, the Plushie Queen, the Smelter, the
  Conveyor King, Glacius, the Arctic Arcade) shuffled by the run's seed,
  then the Prize Master, then The Machine once it has been met (seen in a
  fight or powered down). Each fight is seeded by its index, so a reload
  replays the same fight from its bell.
- **The run.** A rush is a run with `run.rush` (Tilt 0, no mutators, not a
  daily or a weekly, no map fights, no boon, no history card: `hisDone:
  'rush'`). The crawler's starting bin and relic plus its kit
  (`DATA.RUSH.KIT`: four items, two relics that pay per fight or per hit,
  never per kill, a claw part and +15 max HP; a crawler without a kit gets
  its own best cards and two spare relics).
- **A boss in a rush** plays its own arena, music and act (`run.act` is the
  boss's act), with the act's share of its hit points and hits
  (`RUSH.HPK`, `RUSH.DMGK`, on the fight's copy of the def; the data is
  never touched; the telegraph stays exact), and nobody steps out of it
  (Glacius and the Arctic Arcade lose their Prize Master summon; the Prize
  Master comes on its own). The hidden escalation counts one step per boss
  (`RAMP`). The versus card reads BOSS 3 OF 7 (the Prize Master keeps FINAL
  BOSS, The Machine SECRET BOSS). A win breathes 10% of max hp back
  (`BREATHER`).
- **NEXT CHALLENGER** (screen `rush`, sd `{rush: {k: 'next'}}`): the stage
  darkens, the hazard band slides in, FIRST / NEXT / FINAL CHALLENGER slams
  from 3x (`vsSlam`, a shake), the boss slides in as a black silhouette with
  a `?`, a white flash reveals it (`stingBoss`), its name slams in chrome
  (`stamp`), the gallery pops up: one frame per boss, the beaten ones in
  colour under a KO stamp, the next one pulsing gold, the rest silhouettes
  with a `?`. A plate on top shows BOSS n OF m and the clock. A tap skips
  to the end (faster for a veteran, reduced motion shows it all at once);
  FIGHT! (Space, Enter) or Give up. The corner lane keeps off the plate and
  the label (`QA_SIGNS.rush`).
- **The clock** (`FS.rushT`) runs while you fight: never under the versus
  card, an evolution ceremony or the outro, never while the Settings panel
  or photo mode pause the game. It is booked on the win (`run.rush.t`, the
  split in `splits`), so a reload mid fight restarts that fight's clock with
  the fight. The HUD swaps the bulbs and tickets for a TIME stat, the act
  stat reads Boss 3/7 and the badge RUSH.
- **The draft** (sd `{rush: {k: 'draft'}}`): THE SMELTER DOWN!, the split
  and the total, the gallery with the new KO slamming in, then 1 of 3 cards
  (`DATA.rushDraftKinds`: three of item, relic, heal, claw part; a heal for
  sure under half hp, no claw part once the claw is maxed): an item of the
  crawler's pool at act 3 odds (upgraded 35% of the time), an uncommon or
  rare relic (with its set tag), a heal of 35% max hp, a claw part. Rolled
  once and saved with the run (`run.rush.draft`); a pick pays and saves in
  the same beat.
- **The result** (sd `{rush: {k: 'end'}}`): RUSH CLEARED! or RUSH OVER (who
  got you, at which boss), the gallery (LOST on the one that beat you), the
  final time (NEW BEST! and the old one) and the score (`DATA.rushScore`:
  1000 a boss, 5000 for the clear, 25 per hp left, 20 per second under par,
  `PAR` 100 s a boss), the lines, the splits with the hp after each, the
  board, the stickers, Rush again and Back to title. The run save goes. A
  fall comes here too (never the game over), and Give up does.

### The ghost race

- **Checkpoints.** A daily run (and a weekly) keeps `run.gho = {k 'd' |
  'w', key, cps, t, lead, passed, passN, done, passQ}`. Every fight won
  books a checkpoint (`DATA.ghoCp`: nine whole numbers, about 40 bytes: the
  fights won, the stage (the act, 4 the Back Room, 4 + the loop in
  Endless), the fight's hex, hp, gold, the live score (the daily's own, the
  weekly's run score), turns, seconds played).
- **The ghost** is the best attempt of that same day (week): `meta.gho = {d,
  w, passes}`, one record each, replaced when an attempt scores more
  (`ghoRunEnd` from `metaRunEnd`). A new day's key starts a fresh race.
- **On the map** the ghost stands where it stood after as many fights as
  you have won (`ghoSpot`; the start before the first fight, a step aside
  when it shares your hex): a translucent crawler with a sheet for legs, a
  GHOST tag, gliding from its last spot to its new one; once its climb had
  ended, a grey GHOST OUT where it fell (on the same map only). The delta
  chip at the bottom of the map (`#ghoChip`, between the plate and the
  compass) reads "+120 vs ghost" in lime, "-45" in red, "±0" level, or NEW
  on the day's first climb; it pops when it changes, and a tap explains.
- **GHOST PASSED!** The checkpoint that takes the lead from behind or level
  (`ghoPassed`) queues the moment; landing on the map (after the wipe) it
  slams in chrome with speed lines while the ghost is left behind, fading
  (a fanfare, confetti, a buzz). The first pass counts on the profile and
  earns the sticker.
- **The end panel** (game over, win) shows GHOST RACE with the verdict (you
  beat your ghost by N, your ghost holds by N, or you are the ghost now), a
  race chart (`RENDER.gho.chart`: your score per fight solid pink against
  the ghost's dashed cyan, the lead shaded), the two climbs side by side
  (score, fights won, where each reached, turns, time) and whether a new
  ghost was saved. Once the attempt is over the ghost is hidden (a daily won
  into Endless no longer races itself).

### Stickers, save fields, API

- Stickers (the board is at its cap of 60): **Rush Hour** (clear the Boss
  Rush) and **Photo Finish** (overtake your own ghost).
- Meta: `rush {runs, clears, score, best {crawler: {t, n, s, at}}, beat
  {boss: n}, pick}` (`DATA.rushFix`), `gho {d, w, passes}` (`DATA.ghoFix`).
  Run: `rush {v, order, i, t, splits, hp, beat, draft, done, won, score,
  lines, rec, killer, dead, kit, br}`, `gho` (above). Screens `rush` (saved,
  sd `{rush: {k}}`) and `rushmenu` (never saves). Old and junk profiles and
  saves load (empty records, no race, no rush).
- `GAME.rush = {K, start, menu, show, fight, pick, giveUp, end, skip, of,
  meta, metaFix, open, met, idx, lineup, clock, tick, hud, titleBtn, force,
  ui, log, live, clockEl}`, `GAME.gho = {K, of, ghost, meta, metaFix, score,
  stage, spot, fightEnd, runEnd, endPanel, chip, tap, tick, draw, chipEl,
  pass, log}`; `RENDER.rush = {T, back, boss, gallery, challenger,
  banner}`, `RENDER.gho = {PASS, marker, sheet, chart, pass}`.
- Balance (scratchpad `r10/rushsim.mjs`, the balance suite's average-grab
  model through whole rushes, 60 each): clears knight 68%, alchemist 88%,
  rogue 18%, Lucky Lou 37%, Mama Mech 98% (the model's rogue is its weakest
  everywhere, and it never grabs the Plushie Queen's plush out), 4.5 to 6
  turns a boss; The Machine at the end is a real wall (about half fall
  there). Ms. Bubbles (round 10's sixth crawler) gets the Golden Duck and a
  Strength relic in her kit because her starter bin is soft; the model
  cannot see her bubbles (prizes that never slip), so it rates her far
  lower than a hand will. Every crawler needs a line in `RUSH.KIT` (the
  data suite checks the roster); an unknown one falls back to its own best
  cards. Balance is loose on purpose.
- Tests: data (the lineup over 60 seeds, the Machine only when met, the
  kits, the draft kinds, the score, the clock, the bests and the board, the
  checkpoints, records, the delta, the pass, the series, the stickers),
  render (the slam at every beat and for every boss, reduced motion, the
  gallery in every state and the KO stamp, the banner, the stage; the ghost
  for every crawler, sad, bobbing, no leak; the chart; GHOST PASSED! at
  every beat), game (the title card and its lock, the menu, the kit and the
  pick; a whole rush with rush hit points, the card, the clock, splits,
  every kind of card paid, the result, the bests, the sticker, Rush again;
  save and reload at every step paid once; The Machine only once met, a
  fall, giving up; the ghost race by day and by week, the chip, the spot,
  the pass, the end panel, a new ghost, a worse attempt, a reload, old
  profiles). Screenshots: scratchpad `r10/mode_shots.mjs` (`r10_mode_*.png`).

## Ms. Bubbles, the mutator pack and three pets (round 10)

A sixth crawler whose gift plays with the claw itself, six mutators that
change the machine, and three more pets. Everything sits in `ROS` blocks:
data (`data.js`: her items after Mama Mech's, her relics, the character,
outfits, evolutions, the mutators in `MUT_LIST`, the pets in `PETS` and
`PET_SYN`, and the ROS block with `rosMutMerge`, two stickers and `DATA.ROS`),
the rules (`combat.js`, the ROS block), the physics helpers (`physics.js`:
`rosFloat`, `rosBounce`, `rosFlood`), the art (`render.js`, `RENDER.ros`), the
sounds (`audio.js`) and the flow (`game.js`, `GAME.ros`), all reached through
one-line hooks. Ids are new, nothing was renamed, no save field was added
(bubbles, water and glue are fight-only state in `FS.ros`, rebuilt from the
fight seed), and a fight with none of it is bit for bit the old one.

### Ms. Bubbles, The Foam Chemist (`CHARACTERS.bubbler`)

- **The kit.** 68 hp, 100 gold, 3 grabs, a slippery grip (0.85), speed 1.05,
  unlocked like the Rogue by winning a run (`unlock: 'win'`). Starter relic
  **Bubble Wand** (2 Block at the bell, one more bubble on turn 1, 2 Block for
  every bubble popped in the chute). 19 item bin: 5 Rubber Ducks (4 damage,
  light: they float), 4 Soap Bars (5 Block, friction 0.12: they squirt out of
  a lazy grip), a Bubble Pipe, a Sponge, a Scrub Brush, an apple, 3 glass
  beads and 3 peppermints. Versus line: "Hold your breath, sweetie." Her own
  pool: Bubble Pipe, Sponge, Scrub Brush (c), Bath Bomb, Foam Cannon, Loofah
  (u), Bubble Bath (r), Golden Duck (l). An item's `soap` field blows that
  many bubbles when it is played (for anyone who holds it).
- **The gift: bubbles.** Every player turn she blows `ROS.gift` (2) bubbles
  (`COMBAT.rosBlowN`: the gift, `rules.bubbles` and the relics' `bub.n`, plus
  `bub.first` on turn 1). Once the pile settles (0.7 s into the turn, the claw
  free, nothing flying) the game blows them one every 0.32 s around the prize
  it picks from its own rng stream (the most buried, far from the chute; 30%
  of the time a double bubble around two touching prizes). A world pre-hook
  floats each bubbled prize up to a band under the rail (`PHYS.rosFloat`: a
  damped spring in zero g), where the bubbles drift together into a foam
  cluster and bob.
- **The catch.** A dropping claw that reaches a floating bubble stops there
  and closes on it (a mid-air catch, like the magnetic lid's; the twin heads
  stop together). On the lift every bubble the claw touched (or that sits in
  its reach) is welded under the hub (a velocity weld fed the hub's motion,
  like the octopus's; it slips in between the fingers while it is drawn in,
  two or more hang side by side), so a bubbled prize never slips, whatever
  the claw type: the magnet, the hook and the hand carry non-metal bubbles
  too, the vacuum holds one under its mouth and sucks small ones up the hose.
  At the release the bubble pops over the chute and its prize drops straight
  through the opening fingers to the chute's middle.
- **The pay.** At the grab's end the bubbles whose prize was delivered go to
  `COMBAT.rosPop(F, n, 'chute')`: each pays the relics' `bub.block` Block and
  `bub.dmg` to a random enemy; two or more in one grab is a **BUBBLE COMBO**:
  `n x combo` (4, +3 per bubble with the Squeaky Toy) damage to ALL, no
  attacker, the banner (announcer class `bubble`, 53), bubbles, a ring, FOAM
  PARTY! on the marquee. What still floats when the turn ends bursts in the
  bin (`rosPop(F, n, 'bin')`: `bub.bin` Block each, the Suds Armor aura);
  bubbles not yet blown are lost.
- **Relics.** Foam Machine (r, `rules.bubbles`): any crawler blows a bubble
  a turn, Ms. Bubbles one more. Soap Dish (c, `bub.block` 2; no bubbles: the
  first delivery each turn gives 2 Block). Squeaky Toy (u, `bub.combo` 3; no
  bubbles: a grab of 2+ items zaps ALL for 2).
- **Evolutions.** Rubber Duck + Foam Machine = Captain Quack (8, 1 Weak, two
  bubbles; Duck Patrol: 3 to a random enemy per pop). Soap Bar + Soap Dish =
  Bubble Shield (12 Block and a bubble; Suds Armor: 3 Block per bin burst).
  The auras carry `bub` (set in the ROS block) and a no-bubbles hook.
- **Vault.** Shower Cap (c, frilly with ducks) and Snorkel Mask (r, outfit kind
  `shades`, style `snorkel`), plus her Claw-o-ween Witch Hat. **Stickers**
  (the board is at 60 with the round's others): Foam Party (three bubbles in
  one grab) and Squeaky Clean (win as her). A Codex page (`cr_bubbler`), the
  history initials BUB / SUD / FOM, the daily and weekly rotations (both read
  `CHARACTERS`).
- **On screen.** A soap-film bubble around each prize (a radial film, a
  sliding rainbow sheen, a window glint; it grows in, glows when held and
  bursts in a ring of droplets), BUBBLE CATCH!, POP!, SPLASH, and a gauge on
  the cabinet's right post: floating bubbles full, bubbles to come dashed, the
  pops under it. Sounds `rosBlow`, `rosPop`, `rosCombo`.

### The mutator pack (`MUT_LIST`, `rosMutMerge`)

Six more mutators on the panel (20), in the daily, weekly and Endless pools
(`mutPick` reads `MUT_IDS`). New fx keys, merged by `rosMutMerge` inside
`mutMods` (neutral for none):

| mutator | x | fx | where |
| --- | --- | --- | --- |
| Moon Bounce | 1.15 | `bounce` 0.72 | every body's restitution floor and a 28 px/s bounce threshold (`PHYS.rosBounce` from `spawnBody`) |
| Tiny Claw, Big Prizes | 1.1 | `clawK` 0.7, `dmgOut` 1.5 | `F.claw.width` (COMBAT's `rosFight`), the player's hits |
| Earthquake | 1.2 | `tremor` 2 | two quakes a turn at seeded times 1.6 to 7.5 s in, each after a 0.8 s RUMBLE sign: the pile jumps, even mid grab |
| Mirror Machine | 1.25 | `mirror` | the pointer and the arrow keys steer backwards (`rosMirX`, `rosMirK`); `GAME.steer` stays literal for bots and tests; a backwards MIRROR plate and a finger-to-claw arrow mark it |
| Sticky Fingers | 1.05 | `sticky` 0.35 | on the lift the catch is glued to the claw (goo strands, no slips); at the release each glued prize stays stuck 35% of the time and rides home (STUCK!, PLOP) |
| Rising Water | 1.2 | `flood` 1 | `PHYS.rosFlood`: the bin (not the chute) fills to 12% of its height and 8% more each turn, up to 42%; under the waterline a body gets buoyancy by its density (water 0.95: ducks float, anvils sink) and drag |

### Three new pets (`PETS`, `PET_SYN`)

| pet | trick | synergy |
| --- | --- | --- |
| Penguin (`slide`) | leaps to the floor and belly-slides from the far wall to the divider, shoving every low prize it passes toward the chute (SLIDE xN) | Snowball Fight (a Frost item in the bin): 1 Chill to ALL, 2 after three shoves |
| Mole Rat (`dig`) | tunnels under the bottom prize and pops it up on top of the pile right under the claw's aim; digs up a Cinder Mole's mound first | Gold Digger (a Greed relic): 2 + level gold |
| Robot Vacuum (`sweep`) | drives the floor sucking up junk and small prizes (1, 2 from Lv 3, 3 at Lv 5) and dumps them down the chute one at a time: each is delivered on its own (never a DOUBLE) | Turbo Suction (the Vacuum Nozzle): 2 more and 3 Block a sweep |

They are turn pets with the usual uses, levels, looks, reactions, badge and
tap line; the PETS block reaches them through `rosPetPick`, `rosPetSpot`,
`rosPetStart`, `rosPetDo`, `rosPetEffect` and `rosPetFinish`, their
synergies through `COMBAT.rosPetSyn` (a proc, then chill / gold / block). The
pet shop offers them (`PET_IDS`, 11; the album spaces to fit).

### Code map and tests

`COMBAT`: `ROS`, `rosBlowN`, `rosPop`, `rosBlown`, `rosPetSyn`, `rosOf`
(`newFight` runs `rosFight`, `play` runs `rosPlay`). `PHYS`: `rosFloat`,
`rosBounce`, `rosFlood`. `RENDER.ros`: `bubble, water, goo, mirrorSign,
mirrorFinger, quakeSign, meter, portrait, hat, snorkel, SIL, pets`.
`GAME.ros`: `K, fs, state, floating, blow, bubbleOf, mirX, quake, turnEnd,
tick, draw, event`. Tests: physics (a float settles on its spot, Moon Bounce,
water floats light and sinks heavy and drains), data (her kit and pools, the
daily and weekly deal her in, relics, outfits, stickers, evolutions, the
mutator merge and pools, the pets and their switches), combat (bubbles per
turn and owner, pops, combos, auras, soap for anyone, Tiny Claw, the pet
synergies, a 30 turn fuzz), render (her face, outfits, items, evolutions,
every bubble state, water, goo, signs, the gauge, the pets in every pose),
game (her card and unlock, real grabs with all eight claws catching and
popping bubbles, bin bursts, soap, determinism, save and reload, every
mutator in the cabinet and gone after, every pet trick and synergy in a real
fight). Screenshots: scratchpad `r10/shots.mjs` (`r10_ros_*.png`).

## Duo: pass and play (round 11)

Two players, one phone. The title's DUO button (it shares the NEW RUN row,
registered after History so every older `GAME.choose` index holds) opens
screen `duo`: CO-OP BOSS or VERSUS CLAW-OFF, a setup, a coin toss, and a
PASS THE PHONE hand-off between every turn. Data in `data.js` (the DUO block:
`DUO`, `duoName`, `duoKey`, `duoColor`, `duoCard`, `duoTaunt`, `duoPlayers`,
`duoPile`, `duoDropScore`, `duoDeck`, `duoDrawCards`, `duoRoundWin`,
`duoMatch`, `duoStarter`, `duoToss`, `duoBosses`, `duoFix`, `duoRecord`,
`duoBoard`), the flow in `game.js` (the DUO block after ROS, `GAME.duo`), the
art in `render.js` (the DUO block, `RENDER.duo`), the sounds in `audio.js`
(the DUO block), the frame in `index.html` (`#scr-duo`, `<style id="duo-css">`,
the HUD's `#duoBar`), all reached through one-line hooks.

### The setup, the toss, the hand-off

- **Setup** (both modes): per player a name (an input, at most 10 letters;
  empty is P1 / P2; `duoName` strips control characters and the long dash), a
  colour from six (`DUO.COLORS`: the HUD accent, the name, the claw's team
  paint; the two never match, picking the other's swaps them), a crawler (only
  unlocked ones), a claw type (every one) and a claw paint (the team colour, or
  any paint the profile owns in the Prize Vault: each player shows their own
  look; outfits come with the crawler as ever). Versus picks 3, 4 or 5 drops
  each per round; co-op picks a boss the profile has beaten (the Codex's kills
  or the rush's) or Random (any of the seven). The last setup is remembered
  (`meta.duo.last`).
- **The coin toss** (`duoToss(seed)`: who starts and an odd or even number of
  half turns, so the coin really lands on that face): the coin spins up and
  falls between the two crawlers, the winner gets the spotlight and NAME
  STARTS!. A tap catches it early.
- **PASS THE PHONE TO <name>** (`RENDER.duo.handoff`): the card turns over from
  the last player's colour to the next one's, a spotlight finds their crawler,
  a label (the round and drop, or the boss and its hp) and a 3 s countdown ring
  (`DUO.HANDOFF`, a beep a second); then READY? pulses and the big "I'm NAME.
  Go!" button lights up. Meanwhile the one still holding the phone can send a
  canned taunt (versus: Nyah, Spoon, Wah wah, Air horn, Boots and cats, Mic
  drop) or a cheer (co-op: Let's go, Sing, Boots, Hug); each has its own voice
  (`AUDIO.sfx('duoTaunt', {v})`: a kazoo, a boing, the sad trombone, an air
  horn, a beatbox, a mic drop, a sung line, a cheer) and shows in a bubble from
  the sender's corner of the card. Pause goes to the duo menu (Resume there).

### CO-OP BOSS

- Each seat is a run of its own (`duoSeatRun`: the crawler's hp, bin and
  starter relic, its Boss Rush kit `DATA.rushKit`, its claw type) and a COMBAT
  fight of its own; the two fights share one enemy list. The boss has its
  Boss Rush share of hit points and hits (`rushHpK`, `rushDmgK`) times
  `DUO.COOP.hpK` (1.8) for two crawlers, and nobody steps out of it.
- Turns go seat about: the toss winner grabs, ends the turn, the boss acts on
  that seat (COMBAT's own enemy phase), then the phone passes (the
  `finishEnemyTurn` hook, after a PASS THE PHONE! beat) and the other seat's
  fight comes back in through `startFight(ids, 'boss', {seed, duoF})` (no
  versus card after the first). So the boss hits whoever just went, and its
  telegraph always shows whom: a "target NAME" pill beside its intent. A boss
  with an even move cycle steps it on once more after every full round
  (`duoCycShift`), so both seats meet every move. One Golden Prize per seat per
  fight (a fresh pick every turn would upgrade the whole bin).
- A seat that falls is DOWN (the other fights on alone, turn after turn, no
  more hand-offs); both down is KNOCKED OUT; the boss down is TEAM WIN! (the
  finale, the victory beat, then the podium). Never the run's rewards, stickers
  of a run end, gold or the reward screen (the `endFight` and `finishOutro`
  hooks take over).
- The HUD: the gold, bulbs, tickets and act stats step aside for `#duoBar`,
  both players side by side (name, hp or DOWN), the one grabbing lit in their
  colour; the cabinet gets a rim in that colour, the marquee their name, the
  claw their paint, the banner NAME'S TURN.

### VERSUS CLAW-OFF

- Grabby Gary's model: a cabinet of its own, one shared pile per round
  (`duoPile(rng, round, drops)`: 5 common, 4 uncommon, 2 rare, 1 legendary, 2
  rocks, one more common and uncommon per drop each above 3; one common or
  uncommon is the golden prize), the values on the glass (junk 0, c 1, u 2, r
  4, l 7, golden x2). Drops go turn about with each player's own crawler claw
  and claw type (their paint on it), 3 to 5 each; the round ends when they are
  all dropped or no prize worth a point is left.
- **Scoring** (`duoDropScore`): every prize's value, DOUBLE (+1) for two in one
  drop, JACKPOT (+3) for three or more, and every named grab combo the drop
  makes (the fight's own recipes, `combosFor`) for 1 per tier. The drop's lines
  show on a sheet and float over the machine.
- **Sabotage cards** (`DUO.CARDS`, a deck of two of each shuffled per round,
  two in hand to start, one drawn after each of your drops, at most three):
  after your drop you may play one on your rival's next drop, or keep them.
  Shake Up (the pile jumps before they drop), Butter Fingers (a greasy claw),
  Fog Machine (the glass fogs and the tags vanish), Tilt! (the bin leans while
  they drop), Mirror Mirror (steering runs backwards), Tiny Claw (x0.72), Too
  Much Coffee (the claw at x1.9). The card slams onto the glass as their drop
  starts (`duoSabo`) and its tag sits on the cabinet's top.
- **Best of three** (`duoMatch`): first to two rounds; a tied round counts for
  nobody; after five rounds the most rounds, then the most points, else a
  draw. The loser of a round starts the next (`duoStarter`). The board
  (`RENDER.duo.board`) shows both names, the scores, rounds won as stars, drops
  left, and the spotlight on whoever drops (the crawlers stand either side, the
  dropper lit).
- **The podium** (`RENDER.duo.podium`): the winner on the tall step with a
  crown under a spotlight, the other a step down; a draw side by side; a co-op
  team side by side, crowned or knocked dizzy. Taunts for the winner, the
  record per name, Rematch (the same two, a fresh toss), New duo, Title.

### Save, meta, API

- The duel is `S.duo` and saves under `clawspire_duo` at every step (`save()`
  hands over to `duoSave` while a duel is on or the duo screen is up): the
  solo run's save (`clawspire_run`) is never read, written or removed by a
  duel, and a run in memory from before is set aside and handed back
  (`S.duoStash`). Resume (the title button says "resume", the duo menu has
  Resume duel): a claw-off at its next drop with the pile less what was won
  (every drop saved: scores, taken prizes, hands, the deck, a pending card), a
  co-op fight from its boss's bell (like a solo fight), the podium as it was. A
  result is booked once (`paid`).
- Meta `duo` (`duoFix` repairs old and junk profiles; `loadMeta` copies it
  through `duoMetaFix`): `games, vs, coop, coopWins, names {key: {n, w, l, t,
  cg, cw}}` (wins, losses, draws, team games and team wins per name, case and
  spaces ignored), `last {p, drops, boss, mode}`. No key was renamed; no
  sticker was added (the board stays at 60).
- Sounds: `duoFlip, duoCoin (opts.land), duoCount (opts.n), duoReady, duoSabo,
  duoCrowd, duoTaunt (opts.v)`.
- `GAME.duo = {C, KEY, menu, setup, set, start, begin, toss, afterToss, hand,
  ready, taunt, drop, card, keep, next, rematch, leave, park, done, resume,
  saved, meta, metaFix, titleBtn, hud, seatRun, paint, bosses, dropEnd,
  pointer, key, tick, draw, aim, state, v, live, t, setupState, log, seed}`;
  `RENDER.duo = {T, E, spot, tag, target, card, handoff, coin, board, podium}`.
- Tests: data (the tables, names and players, the pile over 30 seeds and three
  drop counts, the score, the deck and hands, best of three, the starter, the
  toss's fairness and landing, the bosses, the record and junk repair), render
  (the hand-off at every beat and in every colour, reduced motion, the toss,
  the board, every card, the podium in every result, no draw falls over),
  audio (every voice, every taunt voice), game (the title button and its
  index, the menu, the setup's rules, the toss and the countdown, a whole
  claw-off with every sabotage card's effect, a reload after every drop, co-op
  turn order and the shared boss hitting only the seat that went, a seat
  down, the team win and the knock out booked once, the even cycle, the solo
  save untouched, old and junk profiles). Screenshots: scratchpad
  `r11duo/shots.mjs` (`r11_duo_*.png`).

## Claw School and the Practice Cabinet (round 11)

A way in for new players and a gym for old ones: a sandbox cabinet with no
enemies, and a school of bite-size claw challenges that pays stars. Pure
tables and rules in `data.js` (the SCHOOL block: `SCH`, `SCH_LESSONS`,
`SCH_CH`, `SCH_IDS`, `schEval` ...), the flow in `game.js` (the SCHOOL block,
`GAME.sch`), the art in `render.js` (the SCHOOL block, `RENDER.sch`), the
sounds in `audio.js` (`schBell`, `schStar`, `schPass`, `schFail`,
`schChalk`, calibrated into their mix tiers), the frame in `index.html`
(`#scr-school`, `<style id="sch-css">`), all reached through one-line hooks.
Nothing here touches a run: the screen `school` is on `setScreen`'s no-save
list, the cabinet is a session of its own (`SCHX.G`: a physics world, the
rig and the pile, like the claw-off's), and there is no F, no FS, no
enemies, no rewards. What the school keeps lives on the profile.

### The Practice Cabinet

- **The way in.** The school hub's big Practice Cabinet card, and a
  **Practice this claw** button on the claw picker's panel on character select
  (a plain tap, so the crawler cards keep their `GAME.choose` indices; Back
  returns to the picker).
- **The screen.** The classroom wall, an LED scoreboard on top (DELIVERED,
  THIS GRAB, BEST GRAB, GRABS, each flashing when it changes), a drawer with
  five tabs, the cabinet in its usual place (the equipped skin and marquee),
  and Slow-mo and Pet trick under it. Drag on the glass, let go to drop, the
  arrows and Space as ever; Reset pile starts the pile and the readout over.
- **The drawer.** *Claw*: all eight claw types, any time, and every paint you
  own. *Items*: a chip for every prize, the ones the profile has found
  (`meta.seen.items`) in colour, the rest dark and locked with a `?` (a tap
  says to meet it in a run); a tap drops it in over the claw's aim (30 prizes
  at most, `SCH.PILE_MAX`). *Pile*: the presets (`SCH.PILES`): Starter bin (the
  crawler's), Junk heap, All glass, All bombs, Balls only, and an empty bin.
  *Mutators*: the fifteen that bend the machine (`SCH.MUTS`: gravity, glass,
  bomb party, magnet storm, tiny and giant, slippery, blackout, conveyor,
  wobbly legs, moon bounce, tiny claw, earthquake, mirror, rising water), up
  to three, a clash swaps; the fight-only ones stay off; the session is
  rebuilt around the same prizes where they lie. *Pet*: any of the eleven or
  none.
- **The pet** sits on the cabinet's bottom left corner and, on Pet trick, hops
  in and does a quick version of its trick: the hamster and the penguin
  shove, the parrot and the mole rat bring the most buried prize up under the
  claw, the cat bats one at the chute, the mouse pulls metal under the aim,
  the raccoon eats junk, the firefly spotlights a prize, the robot vacuum
  sweeps two small ones down the chute (FREE PRIZES), the octopus holds the
  next lift, the goose lays an egg on a 3-prize grab.
- **The cabinet** keeps the materials' feel: glass cracks and shatters on
  hard landings, a bomb landing hard lights an 8 second fuse (`SCH.FUSE`) and
  blows, heavy things thud and the pile hops, a prize the claw never touched
  that grab is a FREE PRIZE, a double and a jackpot light the marquee. Slow-mo
  runs the physics at 0.4.
- **Saved** on the profile (`meta.school.pr`): the claw, the paint, the
  mutators, the pet, slow motion and the preset, so it opens the way you left
  it.

### Claw School

- **Five lessons, 26 challenges** (`SCH_LESSONS`), each a fixed scripted pile
  (the same every time: its seed is the challenge id), a claw, maybe a
  mutator, a goal on a chalkboard, a drop limit, a clock or a lit fuse:

| lesson | challenges |
| --- | --- |
| 1 Basics | First Grab (any prize), That One (the glowing apple among rocks), Double Up (2 in a grab), Jackpot! (3 in a grab), Beat the Clock (4 in 30 s) |
| 2 Materials | Handle With Care (the crystal ball, no cracks), Heavy Metal (the tower shield), Soap Opera (2 soap bars), Bouncy Castle (3 bouncy balls), Hot Potato (a lit bomb out before it blows) |
| 3 Claw Types | Magnet Class (the Magnet Crane: 3 metal, nothing else), Scoop Troop (the Scoop: 5 marbles), Harpoon Hero (the Harpoon: spear the lit bomb from under the rocks), Big Hand (the Glove: the anvil), Suck It Up (the Vacuum: 3 in a grab), Tri Hard (the Tri-Claw: 3 round things in a grab) |
| 4 Tricks | Buried Treasure (the golden duck under the pile), Free Prize (a prize the claw never touched), One Shot (one drop, 2 in it), Picky Eater (the gem, and a rock fails it), Twin Trouble (the Twin Claws: 2 in a grab) |
| 5 Mastery | Glass Jackpot (2 glass in a grab, no cracks), Lights Out (Blackout: the golden duck), Moon Walk (Low Gravity: 4 in 40 s), Mirror Mirror (Mirror Machine: 3 prizes), Clean Sweep (empty the bin in 6 drops) |

- **Goals** (`win`): `total` (n prizes, optionally matching `of`: an id, a
  tag, a trait: glass or round), `grab` (n in one grab), `target` (the glowing
  prizes: a dashed ring and a bobbing arrow), `free` (FREE PRIZES), `all` (the
  bin empty). **Failures**: `never` (a forbidden prize delivered: a rock, a
  non-metal thing), `noCrack` (any crack), a lit target bomb blowing, the last
  drop spent, the clock out. `DATA.schEval(ch, st)` is the judge (pure): a
  failure outranks a win in the same beat; the drop and time limits wait for
  a grab in flight (a buzzer beater counts); a win waits for its grab to end
  so every prize in it counts for the stars. The clock and the fuses start
  when the claw first moves.
- **Stars** (`DATA.schStars`): by drops (fewest), by time (fastest) or, for a
  one-drop challenge, by the best grab's prizes; 1 star for any clear. The
  board lists the three rules; the result card (PERFECT! / CLEARED! / TRY
  AGAIN with the reason) pops the stars in one by one with `schStar` rising,
  then Next, Retry and Lessons.
- **Tickets.** Every star pays `SCH.TIX` (6) vault tickets the first time it
  is earned (`DATA.schPay`): a better clear pays only its new stars, a worse
  one keeps the best. Banked into the Prize Vault's wallet at once
  (`meta.vault.tix`, `earned`) and counted on `meta.school.tix`.
- **Unlocks.** A lesson opens at its star count (`SCH.NEED` 0, 6, 14, 24, 34
  of 78); inside a lesson a challenge opens once the one before it has a star.
- **The report card** (view `report`): a lined paper card with a row per
  lesson (its stars as a bar, `n/m`, a grade stamp: A+ at every star, A 85%,
  B 70%, C 50%, D), the total big, and the **diploma** under it: a faint
  preview with the stars still to go, then at 78 of 78 a gold-sealed diploma
  in the crawler's name signed by Professor Pincher (the school's mascot: a
  classic claw in a mortarboard). The last star graduates you once
  (`meta.school.dip`): **the Valedictorian marquee** (`mq_valedictorian`,
  gold VALEDICTORIAN letters over a wave of bulbs) lands in the Prize Vault,
  NEW, on the marquee shelf; the report card puts it up. It is a
  non-enumerable cosmetic like the event ones (`vaultHow` 'school', never
  sold, never in a capsule), so the Vault's shelves, counts and capsules are
  as before.
- **The title.** A 🎓 School button in the small row (before History, which
  stays last; the menu gets no new row; its star count on a badge), and for a
  fresh profile (under 3 runs, no star yet) a pulsing "New here? Try Claw
  School" line under New run (a plain tap, not a `GAME.choose` entry). It
  fits at 360 and 390 px (Playwright: no overlap, nothing off stage).

### Save fields, API, tests

- Meta `school` (`DATA.schFix`, `schMetaFix` from `loadMeta`; an old or junk
  profile gets an empty record): `stars {id: 0..3}`, `best {id: {drops, t,
  items}}`, `tix`, `dip`, `seen`, `plays`, `pr {claw, paint, muts, pet, slow,
  pile}`. The run save is never written by the school. No key was renamed; no
  sticker was added (the board stays at 60).
- `GAME.sch = {K, X, show, back, practice, start, retry, reset, next, setClaw,
  setPaint, spawn, pile, pileIds, toggleMut, setPet, setSlow, trick, steer,
  drop, tick, step, deliver, finish, judge, grad, bank, crack, boom, meta,
  metaFix, total, paints, items, seen, titleBtn, titleTip, practiceBtn, shelf,
  draw, pointer, key, dom, G, view, log}`; `DATA` adds `SCH, SCH_LESSONS,
  SCH_CH, SCH_IDS, schMatch, schEval, schStars, schStarText, schPay, schTotal,
  schLessonStars, schOpen, schChOpen, schGrade, schFix`; `RENDER.sch = {C, E,
  chalk, wrap, board, cap, prof, star, stars, score, target, room, result,
  stamp, report, diploma}`.
- Tests: data (the lessons, every challenge well formed, every goal and
  failure judged, the limits waiting for a grab, stars by drops, time and
  items, the pay once, totals, unlocks, grades, the repair, the marquee found
  but never listed), render (the board and its wrap, the professor's moods,
  stars, the scoreboard, the target, the classroom, every result card and the
  pop-in, grades, the report card, the diploma locked and earned), game (old
  and junk profiles, the title button and the tip, the practice cabinet never
  touching the run or its save through every control, a real grab and the
  readout, claws, paints, found prizes and the cap, mutators, every pet's
  trick, every challenge cleared by a scripted grab with 3 stars, every
  failure, the pay once, unlocks and Next, the diploma and its marquee across
  a reload, Practice this claw, keys, the pointer and Escape).
- Feasibility (scratchpad `r11/bot.mjs`: a perfect-aim bot, 10 tries each
  with a jittered aim): every challenge clears (Magnet Class 80%, Tri Hard
  70%, Free Prize 50%, Twin Trouble 80%, Clean Sweep 70%, the rest 90-100%),
  so the 3-star thresholds are where a steady hand has to work. Screenshots:
  scratchpad `r11/shots.mjs` (`r11_sch_*.png`).

## Legends (round 12): legendary relics, ten more evolutions, animated cabinets

Twelve relics of a new rarity, `'l'` (legendary), each a build of its own with
a catch, reaching into the systems the later rounds added; ten more item +
relic evolutions for the crawlers that had few; and the rarer Prize Vault
cabinets come alive. Everything sits in `LEG` blocks: data (`data.js`, the LEG
block before `return`: `LEG_K`, the relics pushed onto `RELIC_LIST`, the
evolutions through `legEvoAdd`, the skins pushed onto `COSMETIC_LIST`,
exported as `DATA.LEG = {K, RELICS, EVOS, SKINS, goldNow}`), the rules
(`combat.js`, the LEG block: `legFight`, `legDmgOut`, `legAfterPlay`,
`COMBAT.legShot / legGolden / legPeek / legOf`), the flow and the looks in a
fight (`game.js`, the LEG block, `GAME.leg`), the art (`render.js`, the LEG
block, `RENDER.leg`), all reached through one-line hooks. Ids are new; no id
was renamed; no save field was added (a legendary is an ordinary relic id on
`run.relics`, an evolved item an ordinary id in `run.bin`).

**Where they come from (and never).** Only three places, so they stay rare:
the act boss's relic (after acts 1 and 2 and every Endless loop) is a
legendary `LEG_K.bossP` (25%) of the time, drawn from its own seeded stream
(`legBossRelic`: the run's nonce and every other stream stay put); a
legendary capsule's relic prize may be one (`LOOT.RELIC_RAR.l` adds `'l'`,
`capCtx` passes the unowned ones); the Back Room's service counter keeps one
back for `LEG_K.price` (250) gold (`legSecRelic`, a boss relic once every
legendary is owned). `DATA.relicPool()` / the game's `relicPool(null)` leave
them out, so no reward, shop, event, rush draft or boon ever lists one.

**The relics.** A relic's `leg` object is merged into `F.leg` by `newFight`
(numbers add; `F.leg` is null without one, so every other fight is bit for bit
the old one). Hooks are ordinary relic hooks plus one new name, `onBubble(F,
where 'chute' | 'bin', n)` (fired by `COMBAT.rosPop` after the pops paid).

| relic | the build | the catch | where |
| --- | --- | --- | --- |
| 🏆 The Golden Claw | every 5th grab is GOLDEN: the claw wears gold paint and sparkles, grips +0.7 (`legGrabStart` / `legGrabEnd`), and a golden grab of 2+ prizes deals 4 per prize to ALL and gives 2 Block per prize | every grab grips 0.15 looser (`mods.grip`) | `leg.golden`, `COMBAT.legGolden`, pips on the bottom frame |
| ♾ Infinite Coin Slot | every 3rd prize delivered in a turn gives a grab (2 a turn at most) | -12 Max HP | a SLOT chip with its count |
| 🧐 Prize Master's Monocle | every enemy's move two turns ahead (a THEN chip over its bubble, `COMBAT.legPeek`: a charge's unleash, a cycling enemy's next step, `?` for a random one); the first enemy hit each turn while winding up an attack takes 6 more (EXPOSED) | the claw 15% slower | `leg.peek` |
| 🕳 Black Hole Bin | a Rock at the bell; junk grabbed out falls in for good this fight (`legGo 'void'`: slag and cans no longer cycle back) and hits the target for 8, +2 per 3 swallowed | a turn with nothing for it, the hole eats a random item of your used pile for the fight | a vortex in the chute's prize slot, junk spiralling in |
| ⚙ Perpetual Motion Machine | the first 2 prizes delivered each turn bounce back into the cabinet after they play (`legGo 'bounce'`, each prize once a fight): grab them again | 1 HP a bounce | BOING: a fresh body flies back over the divider |
| 📣 The Crowd | every combo +1 Hype (10 at most); your hits +10% per Hype (`legDmgOut`) | a combo-less turn halves it; at 0 they boo: 1 Weak | the Hype plate (cheering heads) on the bottom frame |
| 🫧 Crown of Foam | anyone blows 2 bubbles a turn (`rules.bubbles` + `bub.n`; Ms. Bubbles 4); a Bubble Combo gives 1 Strength | a bubble left to burst in the bin stings you for 2 | `onBubble` |
| 🔋 Overclocked Core | anyone builds the turret, Lv 2 at the bell; every metal prize fires one shot on the spot (`COMBAT.legShot`) | no turn-end volley (`leg.noVolley`) | Mama's turret |
| 🌠 Fate Engine | anyone fills the Luck meter (`rules.luck`), whiffs +1 more; at 10 Luck FATE: 25 to ALL and the meter empties | Luck never cashes out (`leg.noCash`) | Lou's meter |
| 🐺 Alpha Collar | one more pet trick a turn, 50% stronger (`pet`), every trick hits ALL for 3; no pet: a stray bites a random enemy for 3 a turn | 1 HP a trick | |
| 💠 Glass Heart | everything in the cabinet is glass (`leg.glass`: the game gives every body the glass trait, `legMat`); a crack hits a random enemy for 4, a shatter ALL for 6 | a second crack shatters a prize for the fight | the materials' cracks |
| 👑 Giant Slayer's Crown | +30% on elites and bosses; one enraging gives 3 Strength | -20% on normal enemies | `leg.slay` |

Every legendary wears the rainbow medallion plus a breathing gold flame
crown (`RENDER.leg.crest`, drawn by `relicIcon` for a `leg` relic of rarity
`l`), keyword chips, a Prizedex card (the relics tab lists them), a proc
label and an `ART_PROMPTS.md` row. The relic reveal, cards and holo foil treat
`'l'` as legendary (`RARITY_NAME`).

**Ten more evolutions** (the round 7 mechanism exactly: `legEvoAdd` builds the
non-enumerable `ITEMS[id]`, `EVOLVED`, `EVOLUTIONS`, `EVO_FX` aura and pushes
onto `EVO_LIST` / `EVO_IDS`; the ceremony, hints and the Evolve tab need
nothing new). Each has its own drawing (`RENDER.evo.ART`) and aura; an aura
may carry `bub` / `tur` numbers.

| evolved item | base + relic | when played | aura |
| --- | --- | --- | --- |
| Calliope Pipe | Bubble Pipe + Squeaky Toy | 5 to ALL, two bubbles | Steam Organ: Bubble Combos +2 per bubble (`bub.combo`); no bubbles, a 2+ grab hits ALL for 2 |
| Kraken Sponge | Sponge + Crown of Foam | heal 6, 6 Block, a bubble | Deep Soak: a bin burst heals 2 (the Crown's sting soothed) |
| Gear Grinder | Pipe Wrench + Overclocked Core | 12, 4 turret parts | Flywheel: a turret shot at every turn start (no turret: a zap for 3) |
| Railgun Coil | Spring Coil + Armor-Piercing Rounds | 5 x3 | Magnetic Rail: turret shots +1 (`tur.amp`) |
| All-In Chip | Poker Chip (Lou's starter) + Fate Engine | 9 Block, 3 Luck | Poker Face: an empty grab gives 2 Block +1 per Luck |
| Showstopper Deck | Marked Deck + The Crowd | +1 grab, 3 Luck, 4 Block | Standing Ovation: combos give 1 Luck (and 1 Hype) |
| Boomerang Blades | Twin Daggers + Perpetual Motion | 5 x3 at random | Return Flight: a bouncing prize hits a random enemy for 3 |
| Vanishing Act | Smoke Bomb + the Monocle | 2 Dodge, 2 Weak and 1 Vulnerable to ALL | Now You See Me: 1 Dodge at the bell, attackers Weakened each turn |
| Master Key | Skeleton Key + The Golden Claw | +1 grab, 6 Block | Open Sesame: a golden grab that lands gives a grab back |
| Singularity | Rubble Bomb + Black Hole Bin | 14 to ALL, 2 Rocks | Accretion: junk grabbed out hits ALL for 3 |

**Animated cabinets.** The cached static back stays as it was (`cabLayer`,
keyed by the skin id, capped at 8 layers), and `RENDER.leg.anim` draws a few
live sprites over it every frame, between the back and the bulbs (so the pile
and the bulbs stay on top): Deep Space (drifting stars, a slow two-glow nebula,
a shooting star every 7 s), Molten Core (lava blobs flowing round the frame,
embers), Haunted House (green wisps, a ghost peeking in from the left edge
every 9 s), Jungle Bash (leaves swaying from the rail, fireflies), Gold Jackpot
(coins tumbling down the side posts, a glint running round), Rainbow Riot (a
hue sweep round the frame). Three new skins (Vault shelf, capsule pool):
**Aquarium** (u, 90 tickets: fish, bubbles, weed), **Neon Tokyo** (r, 180: a
skyline, rain, blinking windows, a scrolling sign) and **Retro CRT** (l,
capsule only: scanlines, a rolling phosphor band, INSERT COIN). The new ones
name their live layer in `look.anim` and their static frame and panel with
`leg_*` patterns (`legFramePat` / `legPanelPat`); the older ones map by id
(`LEG_SKIN_ANIM`). Reduced motion holds one still pose (`LEG_STILL`), reduced
flashing drops the flicker; the classic and the plain skins never move.

Tests: data (the twelve: fields, a catch, pools, the legendary capsule's
share, the hooks through a recording COMBAT; the ten recipes; the skins on the
shelf, sold or capsule-only), combat (F.leg, every legendary's rule and its
catch, the Monocle's peek against the real next pick, the evolutions only
with their pieces and their auras, a 30 turn fuzz holding all of them), render
(each animated skin moves, holds still under reduced motion, draws distinct,
the cache never rebuilds per frame; the crest, the Hype plate, the peek chip,
the vortex, the ten drawings), game (the boss relic's rate and stream, the
Back Room's legendary, a real golden grab, a bounce and the black hole, the
Glass Heart's bodies, every legendary drawn in a real fight, a new
evolution's ceremony, the new skins bought, equipped and in a fight).
Screenshots: scratchpad `r12_leg_shots.mjs` (`r12_leg_*.png`).

## Winter Wonderclaw (round 12)

The winter event (10 December to 6 January, wrapping the new year) brought
up to Claw-o-ween's depth on the round 7 season system: everything rides its
hooks (`run.season`, the non-enumerable content, the currency, the counter,
the preview picker, `?season=winter`) and is invisible out of season. Data in
`data.js` (the WIN block after /SEASON, plus the winter def and one field in
`seaFix`), the flow in `game.js` (the WIN block after /SEASON, one-line hooks
in the SEASON code and `bossEvent`), the looks in `render.js` (the WIN block
after the SEASON block; the SEASON block's winter branches and the VAULT
renderers call in), the tunes and sounds in `audio.js` (the WIN block after
the SEASON sounds, one line in `seaFlavor`, the MIX tables), the frame in
`index.html` (the WIN rules after /SEASON in `season-css`).

### Content (only in a winter run)

- **Items (8, plus a filler and a junk)**, one reward screen in three swaps
  its last slot for one (the SEASON rule): Snowball Sack (c, three Packed
  Snowballs: 2 and 1 Chill, and every one landed is a snowflake), Candy Cane
  (u, 4 twice and heal 1), Hot Cocoa (c, potion: heal 5 and cleanse), Present
  Box (u, 3 Block, then it **unwraps** into a random common item, an uncommon
  one in five, that arcs out of the chute into the bin for the fight; never
  another box), Glass Ornament (u, glass and magic: 5 and 1 Vulnerable to
  ALL, it floats down), Fruitcake (c, heavy as an anvil: heal 3 and 3 Block),
  Jingle Bell (r, magic and light: 2 Weak and 2 Chill to ALL), Yule Log (r, 4
  Burn to ALL and 4 Block). Krampus's junk: a Lump of Coal (heavy, useless).
  Each has its own drawing (`RENDER.sea.win.SIL`, non-enumerable on
  `POL_SIL`).
- **Relics (4)** join the relic pools by rarity: Stocking (c, a food item
  heals 2; +2 snowflakes a won fight), Mistletoe (u, 1 Weak to ALL at the
  bell), Sleigh Bells (u, 1 Chill to a random enemy each turn), Warm Scarf
  (r, a heal also gives that much Block, 12 at most).
- **Costumes** (`costumeP`, the same rule): Red-Nosed Rat (antlers, a
  harness of bells, a glowing nose: Antler Butt 5, Sleigh Dash 2 x3, Nose
  Glow fogs your glass for a turn), Snowman Slime (a top hat with holly, a
  carrot, coal buttons, stick arms: 1 Armor, Snowball 6, Cold Hug 2 Chill,
  Snow Drift an Ice Block into the bin, splits like a slime), Elf Goblin (a
  floppy elf hat with a bell, a scalloped collar, a present in hand: Candy
  Cane Jab 5, Regift a heavy Fruitcake into your bin, Holiday Cheer +1
  Strength, Wind Up 14). Party hats in winter: Santa, elf, antlers.
- **Krampus** (act 1 elite, `look: 'krampus'` on the goat's art, his own
  drawing: a hunched shaggy goat devil, long ribbed horns, burning eyes, a
  lolling tongue, chains with a bell across the chest, a birch switch, a sack
  of coal on his back), 64 to 70 hp, takes an act 1 elite fight `kingP` of the
  time (never a tower keeper). Every move says its number: Birch Switch 4 x3,
  Rattle Chains (Vulnerable 2), Hoof Kick 10, Open the Sack (20 next turn),
  Check the List (+2 Strength), Frost Breath (2 Chill). **Signature: Sack of
  Coal** (the Hoard's `spill` with `item: 'win_coal'`, first on his third
  action, every third after, two lumps, four enraged): the cabinet sign warns
  a turn ahead ("COAL"), NAUGHTY!, and heavy coal arcs from his sack into the
  bin (`winBossEvent`, soot and a ring instead of the Hoard's coins). Phase
  two **NAUGHTY OR NICE** (+2 Strength, a meaner loop). He drops the season
  elite's 12 extra snowflakes and one of the winter relics you lack (the
  SEASON rule; no new relic source).

### The advent calendar (tile type `advent`)

- 3 per map (4 on the 16 x 22 world), placed by the SEASON rule (empty land
  off the start and the boss, apart, known from the start). Entering one opens
  the `sea` screen as an **advent present** (`Dd.adv`): a cosy room at night,
  a snowy window, the advent calendar on the wall (24 numbered doors: the
  ones you opened before stand open with a star, today's glows), a big
  wrapped present on the rug with a numbered gift tag. Unwrap: three ribbon
  tugs (the bow shrinks, the ribbon trails off, TUG!), the lid pops (POP!,
  light pouring out), confetti and snowflakes burst, the gift rises out of
  the box under MERRY CLAWMAS! (BIG PRESENT! every sixth door). A tap hurries
  it; Leave before unwrapping keeps it for later.
- **The calendar** (`meta.sea.adv {y, n}`): the winter's year (a January day
  counts for the December before; a new winter starts it over) and the doors
  opened. A present opens door `n + 1` (at most 24), so the gifts grow door by
  door across runs: bigger if you opened the previous ones.
- **The gift** (`DATA.winAdventRoll(rng, day, act, {items, relics})`, rolled
  and saved on the tile at the first tug with its door number, `content.sea
  {seed, out, day, paid, lines}`; paid once at the reveal, across reloads).
  Modest on purpose (the balance pass: runs were too easy): every door holds
  4 to 7 snowflakes (+1 per 3 doors before it, at most +6; +6 on every sixth
  door), then by weight snowflakes 44 (+4), gold 28 (8 to 14, +1 per 2 doors
  before, +4 an act), a common item 20 (the season's commons or the shared
  pool), a common capsule 5 (never before door 8), a winter relic 3 (never
  before door 16, only one you lack). The result card names the door first.

### Snowflakes and the Snowflake Stand

The currency (`flakes`) banks like candy: a won fight `seaEarn` (3 / 8 / 15,
+2 a costume, +12 Krampus), the Stocking's 2, a Packed Snowball landed, an
advent door. The Snowflake Stand (the Vault's season tab, its own cyan
colours; the wallet pill shows the flakes) sells 12 cosmetics, owned for good
and on their normal shelves after the event: Frosted Cabinet (120) and
Hollyberry (80) from round 7, **Gingerbread House** (120: a gingerbread
frame piped with icing, gumdrops on the rails, candy canes in the top
corners, an icing lattice and a waving gingerbread man on the back panel),
**Peppermint Swirl** (80: red stripes and a mint pinstripe down every prong,
a sugar sparkle at the tips; not the year-round Candy Cane), **MERRY CLAWMAS**
(100: a marquee of red and green letters with snow on top, holly at both
ends, bulbs twinkling at random, `sea_twinkle`), **Snowflake Trail** (90:
six-armed crystal flakes twirl up out of every step; not the old Snowfall),
**Scarf & Earmuffs** for each of the six crawlers (60: a knitted scarf with a
swinging tail, fluffy earmuffs on a band). A buy says MERRY! on the marquee.

### The looks

Title: a cold blue wash and an aurora rippling behind the tower, snow on the
tiers and the ground, a garland of fairy lights swagging under the event
ribbon (red, green and gold, twinkling at random, glows in one additive
pass), a Santa hat on the title claw, the banner with icicles and holly, a
snowman with a top hat on the logo's shoulder and a lit pine on the other,
big soft flakes in front, frost ferns creeping from the corners. Map:
snowfall, a frosty rim with ferns, and on lit empty hexes a snowman, a
cottage with a warm window and chimney smoke, or a snowy pine with lights.
Arena: snow, a garland over the fight, drifts at the floor's edges. Cabinet:
twinkling red, green and gold bulbs (stepping aside for a skin, the party
lights or the alarm), snow on the roof, icicles under the rail, a cold haze
and frost ferns on the glass, holly on the marquee band.

### Music and sounds

The winter title and map tunes carry **the jingle**: a sleigh bell hook in the
old three-three-six rhythm (three on one note, three again, a run of four,
a long one) on the chord's own tones, bars 1 to 4 of each half, answered by
the rest of the tune; it draws nothing from the composer's rng. Fights keep
their tunes. Both still sit under the sfx (title -34.4 / -28.4 dB, map -32.7
/ -30.4, integrated / loudest 400 ms). Sounds, calibrated into the tiers:
`winRibbon` (soft, +6.5), `winPop` (mid, untrimmed), `winGift` (big, +8.5),
`winCoal` (soft, -8.5).

### Save fields, API, tests

- Meta `sea.adv {y, n}` (`winAdvFix`; old profiles get an empty calendar).
  Run `sea.adv` (presents opened this run). An advent tile: `type: 'advent'`,
  `content.sea {seed, out, day, paid, lines}`. No key renamed; no sticker
  (the board stays at 60).
- `GAME.win = {cal, year, nextDay, knock, gift, bossEvent, log}`; `DATA` adds
  `WIN_K, WIN_ITEMS, WIN_RELICS, WIN_ENEMIES, WIN_COSMETIC_IDS, winAdvFix,
  winAdventRoll, winGiftPool`; `RENDER.sea` adds `gift` (the unwrapping),
  `advent` (the tile) and `win` (the parts: `title, map, prop, sky, cab,
  costume, hat, present, garland, twinkle, flake, holly, ferns, snowman,
  cottage, pine, aurora, framePat, panelPat, marquee, trailMark, scarf,
  SIL`); `AUDIO` adds the four sounds.
- Tests: data (the winter edges to the second and across the new year, the
  shared span; the content never listed or pooled year-round over 200
  rewards; the items, relics, costumes and Krampus; the advent gifts over
  4000 rolls: modest, never early, growing door by door; the calendar's
  repair; the stand), game (presents per map and seed, none out of season or
  on an old save, the run keeps its season into January; the costumes,
  Krampus and the winter hats in season only; Krampus's card, coal, phase two,
  snowflakes and relic; the unwrapping: Leave, the tug, a reload mid way,
  paid once, the next door, a new winter; every gift; snowflakes per fight,
  the Stocking, the snowball, the Present Box unwrapping; the stand: tickets
  refused, too few flakes, bought and worn, owned after the event and across
  a reload, a real fight in the Gingerbread House; the title, the music,
  drawing in and out of season, old saves), render (every overlay at several
  times, the lights stepping aside, the twinkle, the props, the costumes,
  the hats, Krampus in every state and on his card, the tile, the unwrapping
  at every beat and gift, junk state, every item's own drawing, every stand
  thumbnail, the cabinet, marquee, scarves, trail and paint), audio (the
  jingle's rhythm on one note, the room it leaves, none on Claw-o-ween,
  fights untouched, determinism; the four sounds in their tiers). Screenshots:
  scratchpad `win_shots.mjs`, `r12_win_*.png`.

## Balance snapshot and QA pass 4 (round 11)

Owner of this section: the balance and QA pass. The snapshot is the game as it stood at the end of
round 10 (before the round 12 balance pass below); it is kept as the BEFORE picture.

### Difficulty snapshot (round 11)

The round 5 bot, extended (scratchpad `r11/bal.mjs`; raw lines `r11/balp_w*.jsonl`, tables
`r11/bal_report_paced.txt`): six crawlers, eight claws, Tilt 0 / 3 / 6 / 10, boons, stories and
Grabby Gary forced on as in a browser, a pet from the pet shop or a boon, sets and evolutions as they
come, arcade cabinets skipped, one elite an act above 60% hp, 9 normal fights an act, the secret
door walked away from. New this round: a human's pace (1.2 s to read a turn, 0.6 s to aim a drop).
The round 5 bot dropped the instant the claw was home, and then the turn pets never act and Ms.
Bubbles blows almost no bubbles (a 488-run batch without the pace, kept in `r11/unpaced/`, is the
proof: pets changed nothing there). 597 runs, 7412 fights, every config its own seed.

| crawler | win | deaths act 1 / 2 / 3 | hp lost / fight, act 1 / 2 / 3 | elites won | bosses won, act 1 · 2 · 3 | turns / fight, normal / elite / boss |
| --- | --- | --- | --- | --- | --- | --- |
| Knight | 5% | 72 / 23 / 4 | 14.4 / 11.1 / 5.5% | 66% | 32/42 · 9/12 · 5/5 | 2.7 / 5.8 / 3.8 |
| Alchemist | 13% | 74 / 13 / 2 | 14.5 / 4.8 / 1.1% | 82% | 29/39 · 16/19 · 13/13 | 3.3 / 5.5 / 5.3 |
| Rogue | 16% | 68 / 14 / 2 | 15.7 / 7.1 / 0.7% | 76% | 32/36 · 18/18 · 16/16 | 2.2 / 4.7 / 4.2 |
| Lucky Lou | 12% | 53 / 28 / 5 | 10.1 / 10.6 / 4.0% | 80% | 45/59 · 17/18 · 12/14 | 2.0 / 4.0 / 3.8 |
| Mama Mech | 3% | 47 / 37 / 9 | 8.6 / 12.2 / 15.3% | 80% | 49/67 · 12/15 · 3/4 | 2.3 / 3.8 / 3.9 |
| Ms. Bubbles | 8% | 68 / 14 / 6 | 12.2 / 6.5 / 3.6% | 64% | 28/41 · 14/14 · 8/8 | 3.5 / 8.5 / 6.6 |
| all (597) | 10% (+-2) | 382 / 129 / 28 | 12.1 / 8.9 / 3.5% | 75% | 215/284 · 86/96 · 57/60 | 2.6 / 5.3 / 4.5 |

| claw | classic | tri | scoop | hand | magnet | hook | vacuum | twin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| win | 28% | 21% | 28% | 0% | 0% | 0% | 2% | 2% |
| act 1 deaths / runs | 11 / 64 | 35 / 86 | 9 / 64 | 82 / 86 | 45 / 63 | 75 / 86 | 49 / 63 | 76 / 85 |
| items per drop (no pace) | 2.25 | 1.85 | 2.82 | 0.85 | 1.95 | 0.88 | 1.63 | 1.51 |

| Tilt | 0 | 3 | 6 | 10 |
| --- | --- | --- | --- | --- |
| win | 17% | 7% | 9% | 3% |
| deaths act 1 / 2 / 3 | 93 / 39 / 8 | 103 / 42 / 11 | 89 / 31 / 7 | 97 / 17 / 2 |
| hp lost per normal / elite / boss fight | 4.7 / 28 / 14% | 6.1 / 39 / 20% | 5.7 / 42 / 16% | 8.3 / 43 / 42% |

- **The killers** (the fight a lost run ended in): Ironjaw 52 (10%), the Plushie Queen 52 (10%), the Brood
  Mother 42, the Carnival Barker 42, the Prize Mimic 41, the Claw Crab 24, spore cap + bat 24, spider +
  rat 22, the Band 18, the Hoard 17. Deaths by tier: elite 42%, normal 43%, boss 15%. Ironjaw is won
  21% of the time (81.7% of max hp lost per fight, 2.5 turns: the Gape), the Plushie Queen 63% (the bot
  never grabs her plush out), every other elite 73 to 85%, act 2 and 3 bosses 87 to 97%.
- **Per act**: hp lost per normal / elite / boss fight act 1 7.6 / 36.8 / 26.4%, act 2 4.0 / 39.9 / 7.7%,
  act 3 -0.2 / 25.8 / 6.2% (act 3 normal fights heal more than they hurt). Turns per fight 2.8 / 6.0 /
  4.5 in act 1, 2.2 / 3.8 / 4.6 in act 2, 2.2 / 4.2 / 4.8 in act 3.
- **The pile** at the start of act 1 / 2 / 3: 19.5 / 40.4 / 66.7 items, 1.6 / 10.8 / 22.2 relics, 92 /
  567 / 923 gold carried; a won run ends with 94 items and 32 relics and 1297 gold unspent.
- **Outliers.** Strongest: Rogue + scoop 55%, Rogue + classic 45%, Lucky Lou + classic 45%, the
  Alchemist + classic or scoop 36%. Weakest: every crawler with the hand, the hook and the magnet (0%),
  the vacuum and the twins (0 to 10%); among the good claws the Knight (9 to 18%) and Mama Mech (0 to
  20%). Mama Mech against Ironjaw is the worst matchup in the game: her bin is all metal, which Ironjaw
  swallows for Armor and Strength (18 of her 93 deaths, 85% of max hp lost per fight).
- **A Tilt level** costs about 2 to 3 points of win rate on average (17% at Tilt 0, 3% at Tilt 10); the
  big step is Tilt 3's Bent Prong (elites +1 affix: elites won 81% -> 72%), and Tilt 10's Rigged makes
  the act 1 boss a killer (act 1 bosses won 75/92 -> 23/45).
- **The new systems in these runs**: a pet by the end in 39% of runs (with a pet at act 2, 30% win;
  without, 6%), a set complete in 15%, an evolution in 2%, a story in 53%, Gary 72 claw-offs (40 won),
  an alternate boss in 29%, three keys never.
- **The pets, measured** (scratchpad `r11/petcheck.mjs`: the same seeded act 1 fights, the knight's
  classic claw, the human pace, 100 fights each, Lv 3): no pet 5.1 turns, 1.63 items per drop, 20% hp lost,
  9 losses; the Octopus 4.1 / 1.83 / 12% / 5, the Mole Rat 4.3 / 1.70 / 15% / 2, the Magnet Mouse
  4.5 / 1.74 / 16% / 5, the Trash Raccoon 4.9 / 1.61 / 17% / 3, the Firefly and the Golden Goose
  neutral (gold), the Parrot 5.9 / 1.47 / 23% / 13 (fixed, below: 5.3 / 1.59 / 20% / 7) and the Penguin
  5.8 / 1.41 / 27% / 18 (its slide heaps the low prizes against the divider; left for the owner).

### Suggestions (round 11; the round 12 pass below acted on the first three)

1. **Enemy damage and hit points** (`DATA.DIFFICULTY`): a skilled hand kills act 1 fights before the
   enemies act twice; raise `hp` and `dmg` together so a normal fight lasts two or three turns.
2. **Loot volume** (`LOOT.WEIGHTS`, `LOOT.PRIZES`, the bonus capsule on every jackpot): a winning run ends
   with 32 relics and 94 items; fewer relics and rare items out of capsules, and fewer capsules.
3. **Ironjaw** (`ENEMIES.ironjaw` Gape 46, Bite 22, hp 136-148): the single deadliest fight at every Tilt
   (79% of the bot's Ironjaw fights end the run, most in 2 or 3 turns); a smaller Gape keeps it the act 2
   wall without the one-shot.
4. **The single-prize claws** (`hand`, `hook`): under one prize per drop against 2.25 for the classic
   claw, and no wins in 172 runs; they need a payoff per prize (for instance a lone delivery plays for
   +50%, the cracked-glass rule) or a fourth grab.
5. **The magnet, the vacuum and the twins** (0 to 2%): the magnet for a non-metal crawler and the twins
   for big items are traps on the picker; a line on the claw card, or a starting relic that fits.
6. **The Penguin** (`ROSK` slide, `rosPetDo`): stop its slide short of the divider (`binWidth() - 90`) so
   the prizes it shoves stay under the claw.
7. **Mama Mech against gulpers** (Ironjaw's Swallow likes metal): let a gulper take one metal item a
   fight from her, or give the Socket Set a bite guard.
8. **Tilt 3** (Bent Prong): the steepest single step; it could move to Tilt 5 and Junk Drawer to Tilt 3.

### QA pass 4 (round 11)

Scripted Playwright runs (scratchpad `r11/qa.mjs`, one Chromium at a time, screenshots `r11_qa_*.png`)
and headless fuzzers:
- **Boss Rush**: all six crawlers (half in god mode, the Machine in the lineup for two), a reload on
  every NEXT CHALLENGER, every draft, turn 2 of every boss fight and under every outro: 151 reloads,
  each one back where it should be with the lineup, splits, time, bin, relics, claw and hp unchanged
  (paid once). Four clears, Lou fell to The Machine, Ms. Bubbles to Glacius's wisps.
- **The ghost race**: four daily and three weekly attempts on one profile with a reload mid race each;
  a ghost replaced only when beaten, passes counted once per attempt, the end panel every time. A daily
  won into Endless (headless): the race ends at the win, no chip or ghost in Endless, the Endless death
  never books it again; an abandoned weekly leaves no ghost.
- **Ms. Bubbles with all eight claws** (two real fights each): bubbles blown, caught and popped with every
  claw (the magnet catches the fewest: 16 of 62).
- **The 20 mutators** one at a time in a real fight, and 10 random clean triples; **the 11 pets** in real
  fights, every trick in the log (the Firefly in a Blackout too).
- **Audio**: all 220 voices through the real graph in Chromium (none refused), every tune on every act and
  season, the stings' ducks (music to 0.30, minor sfx to 0.50, back to 1), and over the sessions about
  90,000 sfx and 500 huge stings: every one ducked, no voice over its tier's cap, no audio error.
- **A fight fuzzer** (`r11/fuzz.mjs`): 162 random fights (crawler, claw, 0 to 3 mutators, a pet, Tilt,
  any encounter, the rush bosses) with invariants on every step (no exception, finite numbers, bodies in
  the cabinet, one body per bin item, no item in two piles, no orphan body at a quiet turn, the rig never
  stuck): clean. Every claw type through a real claw-off with Gary: each finishes in 31 to 41 s and pays
  once.
- **The round 10 screens** at 360 x 780 and 390 x 844, normal and XL text (the rush menu, NEXT
  CHALLENGER, a rush fight, the draft, the result, the ghost chip and its end panel, the weekly): no
  overlap, no button off stage or covered, no bad text.

Found and fixed (regressions in `tests/clawspire_game.test.mjs`, `qa11:` tests):
1. **The Parrot fought the claw.** Its PECK carries a prize in its beak under a velocity weld for the
   whole trick; a player who dropped during it had the prize dragged through the prongs (and the pile
   stirred), about 10% fewer prizes per drop and nearly twice the losses. It now drops its catch on the
   pile the moment the claw goes to work (`petFightTick`); left alone it still carries it all the way.
2. **Give up read "Sir Grabsworth fell to walking away at boss 2 of 7."** It says "gave up" now.
3. **The first challenger said "the clock starts at the bell" twice** (the canvas line and the DOM hint
   under it). The canvas line names the rush's size instead ("7 bosses, back to back").

By design, noted: a turn pet needs a quiet moment (0.9 s into the turn, 0.55 s after a grab) and a
player who drops at once never sees its trick; the claw-off has no buttons mid play; Ms. Bubbles' all
four-damage starting bin stalls against Armor stackers (the Claw Crab's Harden) with a weak claw.

### Load check (round 11)

The round 9 method (scratchpad `r11/load.mjs`: Chromium with a 4x CPU throttle, files served gzipped like
Pages, the median of 3 cold and 3 warm loads), run on round 9, round 10 and the round 12 working tree:

| | round 9 | round 10 | now |
| --- | --- | --- | --- |
| payload, gzipped (index.html + js) | 858 KB | 919 KB | 1027 KB |
| slow 4G, cold: first paint / first frame / load (ms) | 812 / 6173 / 6730 | 840 / 6514 / 7121 | 840 / 7133 / 7803 |
| slow 4G, warm: first frame (ms) | 2361 | 2266 | 2368 |
| no network throttle, cold: first paint / scripts done / first frame (ms) | 248 / 92 / 297 | 220 / 129 / 368 | 244 / 107 / 333 |

The cold first frame on slow 4G is about 1 s later than in round 9 (+16%), and all of it is bytes: +169 KB
gzipped since round 9 (game.js +73, render.js +44, data.js +32, audio.js +9, index.html +6), and at 180 KB/s
that is the whole delta. The boot itself did not grow (unthrottled network: 297 -> 333 ms to the first frame,
scripts done in 107 ms, within noise) and a warm load is flat, so there is no cheap boot fix to make. The
real lever is the bytes: minify `dist/clawspire/js` in `build.js` (the files ship unminified), or load the
modes a first session never opens (Duo, Claw School, Boss Rush, the season) after the first frame.

## Balance pass (round 12, owner request)

Owner of this section: the balance and QA pass. The request: enemies never kill and the loot is overpowered;
a skilled player should lose about 70% of runs, weaker play noticeably more, with the deaths spread over the
three acts, elites and bosses dangerous but readable, far less loot, and a good relic or capsule costing a few
fights' gold.

**Is enemy damage getting through?** Checked first, with an audit mode on the bot (scratchpad
`r11/bal.mjs`, `AUDIT=1`): every enemy action's shown threat (`COMBAT.qaThreat`) against the hp and Block the
player actually lost, through Block and blockKeep, the sets, the pets, the turret, Ms. Bubbles' bubbles, the
auras and the telegraphed charges. Predicted and actual loss matched. There is no immunity bug: the enemies
rarely hit because a good hand ended the fight first (1.2 turns a normal fight, 2.1 an elite, 2.0 a boss).

**The skilled bot** (`PRO=2` in `r11/bal.mjs`, snapshots built by `r11/mktune.py`, batches by `r11/cal.sh`,
tables by `r11/cal_agg.mjs`, raw lines `r11/cal_*.jsonl`): the round 11 bot at a human's pace, plus a perfect
hand (every grab lands where it aims, and the prizes it picks go down the chute: 2 for the classic, the tri,
the twins and the magnet, 3 for the scoop and the vacuum, 1 for the hand and the hook; about 3.4 prizes a
drop), and sensible play: an elite whenever it is at 70% hp or better (up to 2 an act), relics first in the
shop (legendaries included, the Back Room counter too), capsules opened, rests below 60% hp. Six crawlers x
classic / tri / scoop / twins, 2 seeds each, 48 runs a batch; the weaker bot is the round 11 snapshot bot
(`PRO=0`, about 1.9 prizes a drop).

### Before and after

| skilled bot, Tilt 0 (48 runs each) | before | after |
| --- | --- | --- |
| win | 48% | 31% |
| deaths act 1 / 2 / 3 | 0 / 25 / 0 | 12 / 16 / 5 |
| win: Knight / Alchemist / Rogue / Lucky Lou / Mama Mech / Ms. Bubbles | 63 / 50 / 38 / 50 / 63 / 25% | 38 / 38 / 38 / 13 / 25 / 38% |
| win: classic / tri / scoop / twins | 42 / 58 / 75 / 17% | 42 / 25 / 50 / 8% |
| turns a fight, normal / elite / boss | 1.2 / 2.1 / 2.0 | 1.7 / 3.0 / 3.2 |
| hp lost a fight, act 1 / 2 / 3 | 0.6 / 6.9 / -0.3% | 4.0 / 6.2 / 2.1% |
| elites won / bosses won | 89 / 100% | 92 / 91% |
| the killers | Ironjaw 22, the Lodestone 2, Tin Knight 1 | the Plushie Queen 6, Ironjaw 4, the Prize Mimic 3, the Dozer 3, then 2 each: Tin Knight, oil slick + drone, High Cultist, the Collector |

| Tilt (after) | 0 | 3 | 10 |
| --- | --- | --- | --- |
| skilled bot win | 31% | 8% | 4% |
| deaths act 1 / 2 / 3 | 12 / 16 / 5 | 7 / 13 / 2 | 14 / 7 / 2 |

| weaker bot (round 11 pace, no perfect hand) | before (round 11 snapshot, 597 runs) | after (24 runs, Tilt 0) |
| --- | --- | --- |
| win at Tilt 0 | 17% | 8% |
| deaths act 1 / 2 / 3 | 71 / 24 / 5% of losses (all Tilts) | 19 / 2 / 1 |

Before, the skilled bot took no damage outside act 2 and only Ironjaw ever killed it; after, the deaths are
36 / 48 / 15% by act and eight different fights did the killing. Tilt still stacks hard (Tilt 3 at 8%).

| the pile, skilled bot, at the start of act 1 / 2 / 3 | before | after |
| --- | --- | --- |
| gold on arrival | 103 / 648 / 1298 | 103 / 419 / 720 |
| payout gold earned so far | 0 / 889 / 2074 | 0 / 534 / 1225 |
| tickets earned so far | 0 / 479 / 1133 | 1 / 246 / 759 |
| relics | 1.6 / 11.5 / 23.0 | 1.6 / 9.0 / 16.9 |
| bin items (rare or better) | 19 / 41.9 (4.0) / 67.8 (11.5) | 19 / 37.7 (1.2) / 58.3 (5.3) |
| a won run ends with | 33.4 relics, 96 items, 2009 gold unspent | 23.9 relics, 81 items, 1128 gold unspent |

| capsules | before | after |
| --- | --- | --- |
| a run | 43.1 | 21.7 |
| tiers c / u / r / l | 30 / 38 / 26 / 6% | 40 / 33 / 21 / 6% |
| contents | gold 17%, uncommon relic 12, uncommon item 12, tickets 8, common relic 7, common item 7, rare item 6, max hp 6, rare relic 6, tool 6, bulbs 6, claw part 3, legendary item 1, legendary relic 1 | gold 22%, tickets 14, common item 11, common relic 11, uncommon item 9, uncommon relic 9, bulbs 6, tool 5, rare relic 4, max hp 3, rare item 2, claw part 2, legendary relic 1 |

A shop's uncommon relic now costs 208 gold (was 160): about three normal fights and an elite of act 2
payout.

### The dials (old -> new)

| dial | where | old | new |
| --- | --- | --- | --- |
| enemy hp | `data.js` `DIFFICULTY.hp` | 2.0 | 3.1 |
| enemy damage | `DIFFICULTY.dmg` | 1.8 | 2.6 |
| hidden ramp | `DIFFICULTY.ramp` every / hp / dmg / max | 3 / 0.12 / 0.12 / 8 | 4 / 0.10 / 0.10 / 10 |
| elite and boss damage on top (new) | `DIFFICULTY.tierDmg`, read in `combat.js` `makeEnemy` | none | elite 1.5, boss 1.5 |
| Ironjaw | `ENEMIES` ironjaw hp / Bite / Gape / Thorns | 136-148 / 22 / 46 / 4 | 88-98 / 11 / 20 / 2 |
| fight reward rarity, act 1 / 2 / 3 (c / u / r / l) | `RARITY_WEIGHTS` | 70/25/5/0, 55/33/11/1, 40/38/18/4 | 76/22/2/0, 64/29/6.5/0.5, 52/35/11.5/1.5 |
| fight gold (new) | `ECONOMY.goldK`, read in `game.js` `endFight` | 1 | 0.7 |
| shop prices (new) | `ECONOMY.shopK`, read in `game.js` `rollShop` and the reroll shelf | 1 | 1.3 (relics c / u / r 156 / 208 / 286) |
| capsule tiers by source (c / u / r / l) | `LOOT.WEIGHTS` normal / bonus / elite / boss / treasure | 62/28/9/1, 45/37/15/3, 20/46/27/7, 0/20/58/22, 34/40/22/4 | 72/22/5.5/0.5, 60/30/9/1, 36/44/17/3, 0/34/56/10, 46/38/14/2 |
| mid-open upgrade c / u / r | `LOOT.UP` | 0.16 / 0.11 / 0.07 | 0.12 / 0.08 / 0.05 |
| pity (capsules below rare) | `LOOT.PITY` | 5 | 8 |
| common capsule prizes | `LOOT.PRIZES.c` gold / item / tickets / bulbs / tool | 34 / 26 / 20 / 12 / 8 | 36 / 26 / 22 / 10 / 6 |
| uncommon capsule prizes | `LOOT.PRIZES.u` item / gold / tickets / relic / tool / max hp / bulbs | 30 / 16 / 10 / 16 / 12 / 10 / 6 | 30 / 24 / 18 / 6 / 10 / 6 / 6 |
| rare capsule prizes | `LOOT.PRIZES.r` item / gold / relic / tickets / item+ / max hp / claw | 28 / 10 / 34 / 0 / 10 / 10 / 8 | 26 / 24 / 16 / 14 / 8 / 6 / 6 |
| legendary capsule prizes (its relic can be a legendary) | `LOOT.PRIZES.l` relic / item / gold / claw / max hp | 32 / 26 / 0 / 24 / 18 | 24 / 22 / 20 / 18 / 16 |
| an item prize's rarity | `LOOT.ITEM_RAR` | its own tier | its tier or the one below |
| capsule gold c / u / r / l | `LOOT.GOLD` | 12-25 / 30-50 / 70-100 / 120-160 | 8-16 / 15-28 / 30-45 / 50-80 |
| tickets a fight | `LOOT.TICKETS` normal / elite / boss / jackpot / combo / flawless / speedy / overkill | 4 / 8 / 15 / 3 / 1 / 5 / 3 / 1 per 5 up to 4 | 3 / 6 / 12 / 1 / 0 / 3 / 2 / 1 per 6 up to 2 |
| payout bonus gold | `LOOT.BONUS_GOLD` jackpot / combo / flawless / speedy / overkill | 4 / 2 / 8 / 5 / 1 per 3 up to 8 | 1 / 1 / 3 / 2 / 1 per 4 up to 3 |
| bonus capsule on a jackpot or tier 3 combo (new) | `LOOT.BONUS_P`, read in `game.js` `lootReward` | always | 35% |
| DOUBLE REWARD | `LOOT.DOUBLE` | 1/20 | 1/30 |
| prize counter, tickets | `LOOT.PRICE` capsule c/u/r/l, item c/u/r/l, max hp, bulbs, tool | 12/28/55/110, 14/24/40/70, 30, 10, 18 | 30/70/130/260, 24/44/75/130, 45, 16, 28 |
| a boss relic is a legendary | `LEG.K.bossP` | 0.25 | 0.15 |
| (round 13) a Boss Rush boss's hits, on top of `DMGK` | `RUSH.TIERK`, read by `DATA.rushTierK` in `game.js` `rushFightStart` | x1.5 (tierDmg) | 1 / `tierDmg.boss` (x0.667: tierDmg taken back out) |
| (round 13) the Duo co-op boss's hits, on top of `DMGK` | `DUO.COOP.tierK`, read by `rushTierK` in `game.js` `duoCoopScale` | x1.5 (tierDmg) | 1 / `tierDmg.boss` (x0.667) |

Rest healing and the Back Room's 250-gold legendary were left alone. `tierDmg` also reached the Boss Rush and
the Duo co-op boss (their own `DMGK` shares apply on top), which rounds 10 and 11 had tuned without it. Round 13
takes it back out there with two dials of their own: `RUSH.TIERK` and `DUO.COOP.tierK` multiply a boss's hits
(only a tier `tierDmg` lifts, so a normal minion is left alone) and default to `1 / tierDmg.boss`, written from
`DIFFICULTY` in `data.js`, so the rush and the co-op boss hit exactly as rounds 10 and 11 tuned them whatever
`tierDmg` becomes. Set either to 1 to give that mode the round 12 lift. The main run is untouched. Test:
`pol13:` in the game suite (a run's boss x dmg x tierDmg; three rush bosses and a co-op boss at the round 10 / 11
multiplier, their hits within 1 of it).

### What is left for the owner

- **The weaker bot** now dies in act 1 (19 of 22 losses, 8% wins). The balance suite's floor (a starting
  bin beats every normal fight at least sometimes) sits right at the current `DIFFICULTY` (2.8 damage already
  walls the Rogue against the act 1 band), which is why the rest of the push went into `tierDmg`.
- **The twins** (8%) and the tri claw (25%) trail; the scoop (50%) leads. Lucky Lou is the weakest crawler for
  the skilled bot (13%).
- **The Plushie Queen** is now the top killer (6 of 33), mostly for bots that leave her plush in the pile.
- **Tilt 3** takes the skilled bot from 31% to 8%; moving Bent Prong later (suggestion 8 above) would smooth it.
- Tests: the pinned numbers moved with the dials (`DIFFICULTY` pins, the rarity shares, the boss capsule
  share, the shop cap now `150 x shopK`, the forced bonus capsule), and `qa12:` in the game suite checks the
  three new economy dials; the balance suite checks `tierDmg`.

## Polish (round 13): the corner lane off the newer screens' titles

The discovery toast sat on the winter ADVENT CALENDAR title: the round 7 safe spots (`qaKeys`) measure buttons,
headings and a short list of text classes, and the newer screens draw their titles on the canvas or in a div
the measure skips. A sweep of every newer screen at 390 and 360 px with a discovery toast and a sticker forced
on (scratchpad `r13/sweep.mjs`, screenshots `r13_pol_*`) found the same on the Halloween door, the Claw School
hub (CLAW SCHOOL on its chalkboard), a lesson's challenge (its chalkboard), the report card, the practice
cabinet (the sticker on PRACTICE CABINET), the Prize Vault (its neon sign and the wallet) and every arcade
cabinet (the marquee). The Duo screens, the Boss Rush menu and result, the weekly and the Codex were clear.

- **Kept (`.qaKeep`)**: the door screen's title block `.seaTop` and its result card, a challenge's name and
  PRACTICE CABINET on the school's top bar, the vault's wallet.
- **Signs (`QA_SIGNS`, stage px, game.js POLISH round 13 block)**: `sea` the advent calendar with its garland,
  MERRY CLAWMAS! / BIG PRESENT! once it is said, the haunted house's door and TREAT! / TRICK! / CURSED!;
  `school` the hub's and a lesson page's chalkboard, a challenge's chalkboard, the report card's heading;
  `vault` the PRIZE VAULT sign and the counter window (the live preview); `arcade` the marquee, plus the
  slots' 777 sign, the wheel's pointer, and skee-ball's TOTAL, 100 cups and ring values.
- **Extra spots (`POL13_SPOTS`, tried after `qaCands`' eight, so every other screen places as before)**: on
  the door screens the top strip is all title and the bottom all buttons, so the lane sits above the result
  card (y 712); the arcade just under the marquee (skee-ball beside its rings at y 238, the moles under their
  holes at y 766); the vault over its shelf (y 700, on a card's name at worst: text, not a button); the Boss
  Rush challenger between its plate and its band (y 80, compact), where the lane used to wait hidden 4 s.
- By design: the practice cabinet's compact toast still sits on the BEST GRAB / GRABS readout under the top
  bar (its title, tabs and buttons are all measured; the cabinet below is play space), and the Duo setup's
  compact toast on its blurb (the least covered spot of a full screen).
- Tests: `pol13:` in the game suite (both corner items on the advent screen wrapped and unwrapped, the
  haunted house closed and open, the school hub, report card, a challenge, the practice cabinet, the vault,
  the rush challenger and all five cabinets: clear of the title, every sign and every button, shown at once).

## Localization (round 13): English and Nederlands

The owners speak Dutch, so the whole game speaks it too, with a language
switch at the top of the Settings sheet. English stays the source of truth:
the game keeps passing its own English strings around (labels, toasts,
`GAME.choose` labels, `S.hint`, `S.lastToast`, the announcer's keys, the
saves) and only what is shown changes.

### Architecture (`js/i18n.js` -> `I18N`, `js/lang_nl.js`)

- Load order: `util`, `art`, **`i18n`, `lang_nl`, `lang_nl2`** (round 14),
  `physics` ... (`art` must stay right after `util`, the art suite pins it).
  Round 15: the two tables are no longer script tags. `I18N.lazyBoot` writes
  them in right after `i18n.js` while the page parses, only when the saved
  choice (else the browser) is Dutch; a switch in Settings fetches them
  (`I18N.need`, `I18N.FILES`) and `I18N.onLand` (game.js `i18nRefresh`)
  redoes the screen when they land. An English player never downloads them.
  The suites' `scriptFiles()` still puts them after `i18n` (`boot({noLang})`
  leaves them out).
  `tests/clawspire_lib.mjs` lists `i18n` (namespace `I18N`, `lang_nl` and
  `lang_nl2` ride along with it) and passes
  `opts.language` to the stub navigator. `window.CS.I18N` for the console.
  Besides `I18N` the file declares the three short globals the brief asked
  for, `T`, `TP` and `TC` (aliases of `I18N.T / TP / TC`); game.js and
  render.js call `i18nTr` / `i18nT`, their own guarded wrappers, because many
  of their functions use a local `T`.
- **A key is the English string itself** (`'END TURN'`, `'Act {n}'`). The
  Dutch table maps it to Dutch; a key that is not in the table shows its own
  English, so a raw key can never reach the screen.
  - `T(key, vars)`: the key in the current language with `{var}` filled in
    (a var the caller did not pass leaves nothing, never `{var}`);
    `{n|een|twee}` picks a word by the number (`{n} {n|lampje|lampjes}`).
  - `TP(n, one, many, vars)`: the plural helper (`TP(3, '{n} bulb', '{n} bulbs')`).
  - `TC(kind, id, field)`: DATA content (`item`, `relic`, `status`, `enemy`,
    `char`, `combo`, `kw`, `claw`, `pet`, `set`, `boon`, `act`, `mut`, `evo`, and
    `move` as `'enemy.move'`) with the DATA English as the fallback.
  - `I18N.tr(str)`: an English string the game built at run time back through
    the table: an exact key, a content name (every translated DATA field is
    indexed by its English, so "Rusty Sword" anywhere becomes "Roestig
    Zwaard"; "Rusty Sword+" keeps its plus; a name in CAPITALS on the versus
    card works too), then the `{var}` patterns ("Deal {n} damage"). In a
    pattern `{n}`, `{n2}` ... match a number and anything else matches words,
    which are looked up again ("Light the way: {s}" with "3 bulbs"). Glued
    sentences, `a, b` lists of known words, a word plus a number and an icon
    in front are split and redone. English returns its input at once; the
    Dutch results are cached (6000 entries).
  - `I18N.itemText(def, plus, DATA.itemText)`: the Dutch rules template with
    DATA's own numbers (`{v}` tokens are kept in the Dutch), the appended
    " Exhaust." becomes "Eenmalig.".
- **Where it is applied** (one-line hooks, no screen code rewritten):
  game.js `h()` (every DOM text the game builds; the element keeps its English
  in `__i18nSrc`), `toast`, `hint`, the banner (sized by the Dutch words),
  the popover, the tutorial coach marks, the Help page's paragraphs, the act
  title cards (translated before they are typed), `itemText`, the Settings
  preview; render.js `txt()`, `chrome()`, `fx.text` (every floating word),
  `schChalk`, two coin-slot labels. In a browser a `MutationObserver`
  (`I18N.watch`, only while Dutch is on) translates whatever the game sets by
  hand (`textContent`, `innerHTML`, `title` / `aria-label`, index.html's own
  words) and remembers the English so a switch back restores it.
- **The setting**: `meta.settings.lang` = `'en'` | `'nl'`, absent until the
  player picks one. Absent means the browser decides (`navigator.languages[0]`
  or `language`: `nl*` is Dutch, anything else English), so old profiles load
  unchanged; a junk value is dropped. `accApply` calls `i18nApply` (boot and
  every settings change); the Settings sheet's first section "Language / Taal"
  has English / Nederlands, each named in its own language. A switch applies
  live: `I18N.set` sets `<html lang>`, `I18N.dom` redoes the stage in place,
  the sheet, the title and the map head rebuild, the HUD refreshes, the canvas
  follows on the next frame. `GAME.setLang(code)` / `GAME.lang()` for tests.
- **Layout**: the stage is 540 wide and scales, so 360 and 390 px look the
  same. Dutch fixes live in `<style id="i18n-css">` and only apply under
  `html[lang="nl"]`: long compound claw names carry soft hyphens and wrap in
  the claw chips, the claw stat labels size to their words. Long strings were
  shortened where they sit in a fixed box (the Boss Rush card, the chalkboard
  subtitles, the canvas signs keep to about the English length).

### The words (a glossary kept by `lang_nl.js`)

Natural, playful Dutch in the "je" form. claw: grijper, grab: greep / grepen,
bin: bak, chute: goot, cabinet: kast, prong: klauwtje, bulb: lampje, tool:
gereedschap (flare: lichtkogel, lantern: lantaarn, kite: vlieger), hex: vakje,
relic: relikwie, item: voorwerp, junk: rommel, Block: Blok, Exhaust:
Eenmalig, act: akte, loop: ronde, Endless: Eindeloos, the Prize Master: de
Prijzenmeester, Prizedex: Prijzendex, Prize Vault: Prijzenkluis, the
Compactor: de Pers, Claw School: Grijperschool, END TURN: EINDE BEURT, ENEMY
TURN: VIJAND AAN ZET, VICTORY: GEWONNEN. Crawler, Tilt, Boss Rush, Duo,
JACKPOT and the characters' own names stay as they are.

### Coverage

- **Phase 1 (UI chrome), all of it**: title and its cards, character and claw
  select, the HUD, banners and floating words, map head hints and tool toasts,
  fights (intents, the INCOMING pill, the enemy popover, statuses), rewards,
  the payout, shop, prize counter, capsules, the Compactor, rest, forge,
  events, treasure, spare parts, bin, boons, sets, evolutions, pets, the
  arcade mini-games, the Prize Vault, stickers, Prizedex, tips, Help,
  Settings, game over, win, the death recap and its tips, run history and
  photo mode, the Codex screens, daily / weekly / ghost race, the Boss Rush,
  Claw School (every lesson, challenge title, goal and tip, the star rules),
  Duo, Endless and the loop reboot, the secret act, seasonal screens.
- **Phase 2 (content), done**: all 142 items and 108 relics (names and texts),
  all statuses, keyword chips, combos, the 62 enemies (names and
  descriptions), enemy intents, characters (titles, blurbs, unlock text),
  claws (names, texts, jokes, good / bad), claw upgrades, tools, acts and their
  title cards, Tilt levels, mutators, elite affixes, all 20 events, boons,
  pets (species, tricks, quips), relic sets and their bonuses, stickers, vault
  categories and cosmetics, weekly themes, Codex chapter names and blurbs.
- **Phase 3 (round 14, `js/lang_nl2.js`), the rest**: all 43 Codex pages
  (`content.lore`: name, text, hint; a crawler's page keeps the crawler's
  name), the 9 branching stories (titles, every beat, every choice and its
  line; the dance-off's scored beats are ui patterns), Grabby Gary
  (Graaiende Gary, as round 13 named him: every taunt, the `{gear}` line with
  his gear in lower case, his gear, the claw-off quips), the 28 evolved items
  (name and rules in `content.item`, aura in `content.evo`, the proc word, the
  ceremony's "aura: text" line), the 11 pet synergies, both seasons (names,
  blurbs, the Snoepbalie and the Sneeuwvlokkenkraam, candy as snoepje /
  snoepjes and sneeuwvlokje / sneeuwvlokjes, the wallet and counter lines,
  the seasonal items, relics and their procs, the costumed monsters, the
  Pumpkin King (de Pompoenkoning) and Krampus), every enemy move (name and
  its own line, the hidden story, family and seasonal ones too), every
  enrage and boss signature (the Machine's events too), the map's lore
  snippets and landmarks, Duo's cards, taunts and colours, the families'
  bonds, Mama Mech's turret names, the claw part lines, the canvas intro
  (tagline "Elk gevecht is een greep.", TIK OM TE SPELEN) and the pre-boot
  loader.
- **How phase 3 is wired**: `I18N.TC` has two more kinds. `lore` is a Codex
  page by id; `path` is any other DATA words by dotted path with the field
  last (`TC('path', 'STORIES.sto_crab.beats.start', 'text')`,
  `'GARY_LINES.win'` / `'2'`, `'ENEMIES.krampus.sig'` / `'shout'`). Both are
  indexed by their English like every other kind, so the game's own
  `h()` / `txt()` calls find them with no screen code changed. Canvas text
  that is wrapped into lines before it is drawn (Gary's speech bubble, the
  evolution plate, the lore bubbles, Duo's cards) is translated before the
  wrap (render.js), the evolution plate gets one line more in Dutch; the
  Codex list's teaser is the first sentence of the Dutch page. `tr` keeps a
  label's trailing ":" and curly quotes around a known core ("“Koop hem vrij
  (35 goud).”"). An element marked `translate="no"` is left alone (the
  loader's CLAWSPIRE logo). The loader (`#csBootJs`, before any script)
  reads `meta.settings.lang`, else the browser, and swaps its own four
  phrases; the canvas intro runs its words through `I18N.tr` (the tagline is
  translated whole, then typed). The intro.mp4 / intro.webm files are not
  used by the game.
- **Still English**: the character names, Crawler, Tilt, Boss Rush, Duo,
  JACKPOT, the season names Claw-o-ween and Winter Wonderclaw, Duo's "Boots
  and cats" and "Mic drop" (untranslatable jokes), pet names (Hammy,
  Mittens...), the combat log (`F.log`, never shown). The Trading Post and
  pet evolution (round 14, TRD) bring their own Dutch in `lang_nl.js`.

### Adding a language or a line

A new table is `I18N.add(code, { ui: {English: words}, content: {kind: {id:
{field: words}}} })` in its own `js/lang_xx.js` plus the code in
`I18N.LANGS` / `NAMES`. A new English string needs nothing: it shows in
English until a row is added. Tests: `tests/clawspire_i18n.test.mjs`
(T interpolation, plurals, fallback, patterns, the table's keys against the
game's words, content against DATA with the same `{v}` tokens, no em dashes,
browser default, saved override, old and junk profiles, the live switch, every
main screen rendered in Dutch with no raw keys, the canvas words, English
untouched).

## The Trading Post and pet evolution (round 14)

The owner asked for a harder game (round 12) and then for more interesting choices, not more loot. Both
features are **power-neutral by design**: every trade is a swap at an even rate and every evolution costs
something that would otherwise be power. Data in `data.js` (the TRD block before `return`: `TRD`, `PEV`,
`TRD_K`, `PEV_K`, `PEV_FORMS`, `trdRoll`, `trdValue`, `trdFix`, `pevCan`, `pevOn`, `pevFee`, `pevPow`, and
`petFix` keeps `evo`), placement in `map.js` (`trdPlace`, the TRD block after LORE), the flourish in
`combat.js` (`COMBAT.pevTrick`, the TRD block after LEG), the flow in `game.js` (the TRD block after LEG,
`GAME.trd` / `GAME.pev`), the art in `render.js` (the TRD block after LEG, `RENDER.trd`), the frame in
`index.html` (`<style id="trd-css">`, `#scr-trade`), the Dutch in `lang_nl.js` (its own marked
`I18N.add` block at the end). No sound was added (the haggle reuses `coin`, `cardFlip`, `ding`, `stamp`; the
ceremony `evoRise` / `evoBurst`).

### The Trading Post (tile type `trader`)

- **Placement.** One per map, never in the Back Room. `trdNewMap` calls `MAP.trdPlace(M)` at the end of
  `newMap` (after the golden key, the season's doors, Gary and the lore landmarks), on its own rng drawn from
  `M.seed`, so every older roll stays where it was. It takes an empty land hex off the road, 2 to 4 hexes
  from it first (`TRD_ROAD_GAP`..`TRD_ROAD_FAR`, a short detour), `TRD_GAP` (4) from the cabinets, the pet
  shop and the shops, 3 from the start, 2 from the boss, never a tower's doorstep, a monster's, the golden
  key's or a lore landmark's hex; small maps relax the rules in steps. A landmark (`LANDMARKS.trader`,
  known from the start, a peddler's cart under a striped canopy with a coin, `RENDER.trd.icon`). Over 60
  worlds: always placed, 52 of 60 in the 2-4 band, every one 3+ from the shops and cabinets. A map saved
  before the round has none and keeps having none.
- **Rocco** (`RENDER.trd.scene`, `rocco`, `cart`): a raccoon peddler in a straw hat with a cyan feather, a
  patched vest and a bandolier of trinkets, behind a wooden counter (a bell, a brass balance) with his
  wagon behind him (a striped canopy, wares, a lantern, the TRADES sign), string lights over a night alley.
  A tap on him when nothing is going on: a line (`TRD_LINES`).
- **Three trades a visit** (`DATA.trdRoll(rng, ctx)`), rolled on the first entry from the tile's seed and the
  run's (never `rngFor`: the run's nonce and every other stream stay put) and saved on the tile
  (`content.trd = {seed, offers, done, res, n}`). Kinds are dealt by weight without repeats (`TRD_K.W`:
  swap 40, relic 25, service 15, bundle 20); one that cannot be dealt is dropped and the rest is filled with
  more swaps; an item is never named in two trades:
  - **Item swap**: a named item of your bin (never junk or an evolved item) for a different item from your
    crawler's reward pool that **shares a keyword** with it: the same rarity (a plus stays a plus), or a plus
    copy for an item **one rarity up, not upgraded**. Shown face up before you commit.
  - **Relic swap**: one of your relics (common, uncommon or rare; never your crawler's own) for a relic
    **of the same rarity from another archetype**, face down with its archetype chip as the hint, revealed at
    the handshake.
  - **Service**: gold for **lifting a curse** (a junk item of your choice, while there is junk) or **removing
    an item** of your choice, at the shop's removal price with the round 12 dial: `60 x shopK` (78), times
    the Tilt's Price Hike. A picker opens (`openBin`, junk only for a curse).
  - **Mystery bundle**: two named items of one rarity (common or uncommon, never a plus) for one face-down
    item **one rarity above the lower of the two** (`TRD.bundleRar`), never one of the two.
- **The deal** (`GAME.trd.deal(i, {uid})`): checks (the item still in the bin, the relic still held, the
  gold, the bin floor), pays, applies and saves in one beat (`st.done[i]`, `st.res`, `run.trdN`,
  `meta.trd.deals`); a relic that gave lasting Max HP takes it along (`trdLoseRelic`). Then **the haggle**
  (`TRDK`, 2.6 s, x1.6 after 4 deals): your goods slide across the counter to Rocco (the balance tips), he
  studies them through a brass loupe (HMM...), his goods slide back (a face-down card turns over at the
  handshake), your glove meets his paw, **DEAL!** stamps in (confetti, a ring, a shake), then the result
  card and Continue. A tap hurries it (to the handshake, then the end). A reload mid haggle shows the trade
  TRADED, never a second payment. Leave packs the cart up: the tile is done.

### The balance math (every trade about neutral)

Worth is gold at the shelf: an item is its rarity's average shop cost (`TRD_K.VAL`: common 37, uncommon 63,
rare 100, legendary 132, from `DATA.ITEMS`), a plus copy `plusK` 1.6 times that, a relic the shop's relic
price (`TRD_K.RVAL`), a service its price. `plusK` is the Compactor's own exchange rate: three of a kind
make one plus and three of a rarity one of the next, so a plus is worth about a rarity step (plus common 59
~ uncommon 63; plus uncommon 100 ~ rare 100). The card shows both numbers (`⚖ give : get`).

| trade | rule | worth in : out (4000 rolled visits) |
| --- | --- | --- |
| item swap, same rarity | a different item of that rarity sharing a keyword | 1.000 |
| item swap, plus for a step | plus X for X+1 not upgraded (a plus legendary stays a plus legendary) | 1.053 (c 59:63, u 100:100, r 159:132) |
| relic swap | same rarity, another archetype | 1.000 |
| curse lift / removal | 78 gold (60 x shopK) | 1.000 (the shop's own price) |
| mystery bundle | two commons for an uncommon, two uncommons for a rare | 0.838 (c 74:63, u 126:100) |

The bundle keeps a cut on purpose: it also thins the bin by one item, which a shop sells for 60 to 78, and
unlike the Compactor (three in, one out, you pick the inputs, the output leans to their keywords, 30 gold or
a rest) the merchant names the two and the output is a blind draw with no keyword pull. No trade adds an
item, a relic or gold to the run; the service and the bundle shrink the bin, the swaps keep its size.

### Pet evolution

- **Gate.** A pet at `PET_MAX` (Lv 5) can evolve **once** (`DATA.pevCan`; `run.pet.evo = 1`, kept by
  `petFix` only at the top level). The popover says when it is ready.
- **The price** (one of): **a rest** (the rest stop's fourth choice, "Evolve <name>", instead of healing),
  **gold** at the Trading Post (`PEV_K.gold` 80 / 120 / 160 by act, Endless at the act 3 price, x shopK and
  the Price Hike: 104 / 156 / 208, up to a shop's uncommon relic), or **a relic** given up there (any you
  hold but your crawler's own). The Trading Post shows the offer as a card under the trades while the pet
  can evolve.
- **The final form** (`PEV_FORMS`): Turbo Hamster (Stampede: 3 to a random enemy), Captain Parrot (Crow's
  Nest: 3 Block), Sabertooth Cat (Pounce: 4 to a random enemy), Kraken (Ink Cloud: 1 Weak to ALL), Starfly
  (Dazzle: 1 Vulnerable to ALL), Tesla Mouse (Arc Zap: 2 to ALL), Raccoon Baron (Recycling: 4 Block),
  Golden Swan (Grace: heal 2), Emperor Penguin (Blizzard: 1 Chill to ALL), Mole King (Tremor: 2 to ALL),
  Robo Butler (Polish: 3 Block). The trick's strength goes up `PEV_K.pow` (x1.8 -> x2.2 at Lv 5, through
  `petEffect` and the ROS pets' `rosPetDo`), and every trick (the octopus's hold included) ends in the form's
  flourish: `COMBAT.pevTrick(F, petId)` (a pet proc named after the trick, then the effect, `F.pevLog`). At
  two tricks a turn that is about 6 damage or Block a turn: a relic's worth, paid for with a relic, a rest or
  a relic's price.
- **The look** (`RENDER.pet` with `st.evo`): 1.25 times bigger (`PEV_LOOK`), a glow and a turning dashed
  halo, the form's flourish (bolts, a captain's tricorn instead of the crown, a gold crest, ink droplets,
  orbiting stars, or wings and a halo) and the evolution chevron over the head. On the cabinet, the map bed,
  the pet shop and its album.
- **The ceremony**: the item evolution's overlay (`S.evoUi`, `evoTiming`, tap to continue) with the pet drawn
  in it (`E.art`, `EVO_ST.art`, one hook in `RENDER.evo.ceremony`): the old form spins up in the light
  pillar, the new one bursts in, EVOLVED!, its name in chrome and its trick on the plate. It is paid,
  applied and saved before it plays, so a reload never evolves twice.
- **Records.** The album (`meta.pets[id].evo`), the Prizedex's Evolve tab (a "Pet evolutions n/11" grid
  under the item evolutions, silhouettes until evolved), `meta.trd {deals, pev}`, `run.pevN`.

### Save fields, API, tests

- Map: tile type `trader` with `content {seed, diff, game, trd}`. Run: `pet.evo`, `trdN`, `pevN`. Screen
  `trade` (`sd.trade {q, r}`). Meta: `trd {deals, pev}`, `pets[id].evo`. All optional; old saves and profiles
  load unchanged. No key renamed.
- `GAME.trd = {K, WORDS, PATTERNS, show, enter, state, deal, why, hurry, leave, tick, removePrice, newMap,
  loseRelic, draw, poke, ui}`, `GAME.pev = {evolve, fee, relicOk, powUp, on, trick, ceremony, tapLine, look,
  dex}`, `MAP.trdPlace` and the dials, `COMBAT.pevTrick`, `RENDER.trd = {LOOK, scene, rocco, cart, icon,
  token, pevBack, pevFront}`.
- Tests: map (one per world over 60 seeds by the rules, every other tile untouched, deterministic and
  idempotent, the save, small maps, the Back Room, old saves), data (600 rolled visits: every kind by its
  rule, no item in two trades, determinism, the value table against the shelf, the EV bands, the floors,
  `trdFix`; pet forms, gating by level, once, the fee by act and the Price Hike, `petFix`), combat (every
  form's flourish and its proc, a finished fight, a long fuzz), game (the post on every act's map, the
  screen, every kind of trade paid once with its refusals, the Price Hike, a reload before, during and after
  a haggle, Leave, old saves; the rest choice, the gold and relic prices, once only, the ceremony, the save,
  the album and Prizedex, the evolved trick in a real fight), render (every haggle beat, Rocco's poses, the
  goods, the map icon and its silhouette, every final form, the ceremony through `st.art`), i18n (every new
  line and pattern in Dutch, the screens in Dutch with none of the new English left). Screenshots: scratchpad
  `r14_trd_shots.mjs` (`r14_trd_*.png`).

## HUD and title menu polish (round 15)

Owner request: the HUD (the health bar and the rest) looked crowded, and the title had too many
buttons. Both are reorganized; no feature went away, no id changed.

**The top bar** (index.html `#top`, CSS in `<style id="ui15-css">`, still 70 px tall so the arena,
the labels, the toasts and every canvas layout under it keep their places):
- the portrait (56 px, tap: the crawler card) | the vitals column (268 px) | the relic strip.
- the vitals column, row 1: a real hp bar (`#hpStat`, 28 px) with "HP 36/80" inside it. The fill
  (`#hpFill`) drains over the ghost chunk (`#hpGhost`); the incoming-damage stripes (`.qaIn`) ride in
  it. Block is a cyan shield chip (`#blockTxt`, just the number) at the bar's right end: the bar steps
  aside for it (`#hpStat.shielded .hpbar{right:58px}`), so nothing of the bar is ever hidden under it.
  Hit shake, the red flash on the bar, the low-hp pulse, the shield shimmer (now inside the bar),
  the heal / shield glows all still play.
- the vitals column, row 2: compact chips, an icon and a number: gold (a CSS coin), bulbs (a cyan
  bulb, `#inkTxt`), tickets (a pink ticket, `#tixStat`), and the act chip at the row's end ("ACT 1/3";
  Endless "Loop 3" in its gold frame; the rush "BOSS 3/7"). The words stay in the markup (screen
  readers, the i18n table, the round 1 markup test) and a tap on a chip shows its name and what it is
  for. A Tilt / DAILY / WEEKLY / RUSH badge takes the word's place in the act chip. The rush clock
  sits in the row in place of bulbs and tickets. The counters still roll, bump and float "+n".
- the relic strip: 40 px medallions; what does not fit folds into a dashed "+N" chip
  (`uiRelicFit`, a browser only) that opens the whole list (`uiRelicList`: every mutator and relic
  with its name and rules, closes on its X, the chip or a tap elsewhere). A folded relic hands its
  proc flash and ring to the chip (`S.relicEls[id]` points at it).
- the player row: the status chips and the GRABS pill share one height (36 / 38 px) and centre line.
- the control bar: the round Settings and Photo buttons (48 px), the hint (two lines at most), END
  TURN (156 px, 164 in Dutch), evenly spaced.

**The title menu** (`uiTitleTidy`, called at the end of `showTitle`). Every older builder still
makes its own button, so `S.ui.buttons`, their labels, handlers and `GAME.choose` indices are
exactly as before (Continue / New run first, History after Codex and Boss Rush, Duo last); the pass
only moves the elements:
- the big action: CONTINUE when a run is saved (NEW RUN under it, smaller), else NEW RUN (62 px,
  breathing).
- "New here? Try Claw School" under it (a fresh profile only, as before).
- the play row: the Daily run card (today's date, crawler, mutators) and MODES, which opens the
  **Play modes** sheet: Weekly challenge, Boss Rush, Duo.
- five tiles (an icon over a short word): Vault (the Prize Vault, its "new" dot kept), Collection
  (a sheet: Prizedex, Stickers, Codex, History; a badge counts fresh Codex pages and new stickers),
  School (Claw School, its stars badge kept), Options (the Settings panel: sound, music, language,
  text size, colour modes, hands, reduced flashing...), More (a sheet: Help, Tips, Intro, Sound
  on/off, Music on/off).
- the stats line: runs, wins, best Tilt, stickers, Prizedex, as small numbers without boxes.
- the season ribbon, the hidden Event preview (five taps on the logo) and the attract mode are
  untouched.
A sheet is a panel rising from the bottom over a dimmed title (`.uiSheet`, inside `#scr-title`); it
closes on its X, a tap on the dim or Escape. A sheet you left through (Back from the Prizedex, the
Sound toggle, the Intro) opens again, without the rise, when the title comes back; a run coming back
to the title finds it clean. The group buttons are plain taps, not `GAME.choose` entries; a sheet
opened from the keyboard moves the focus into it and back to its button when it closes.

Where every moved button went: Prizedex, Stickers, Codex, History: Collection sheet. Weekly
challenge, Boss Rush, Duo: Play modes sheet. Help, Tips, Intro, Sound, Music: More sheet. Settings:
the Options tile (sound and music are in its panel too). Prize Vault, Claw School: tiles. Daily run:
the play row.

Words: every new line has its Dutch (`js/lang_nl2.js`, the "(round 15) HUD and title menu polish"
block): Modes / Modi, Play modes / Speelmodi, Vault / Kluis, Collection / Collectie, Options /
Opties, More / Meer, and the chip cards. "Instellingen" does not fit a tile, hence the tile's own
word. Minimum text size 12 px logical everywhere in the new chrome.

Tests (`tests/clawspire_game.test.mjs`, "ui15:"): every older title button still registered in its
order, where each one lives (menu or which sheet), the group tiles are plain taps, the sheets open and
close, the Collection badge, Back reopens the sheet you left through (a run does not), CONTINUE and
NEW RUN in the big action, DUO still works from its sheet; the HUD markup keeps every id and the
vitals / resource / relic structure, the act chip reads "1/3", the shield chip shows the Block and
empties without it, the relic fold and list stay off headless. Three older structure checks moved with
the layout (the rush card, DUO and Claw School now asserted in their sheet / tile). Screenshots:
scratchpad `r15ui/shots.mjs` (before_* and after_*, 390 x 844 and 540 x 960, English and Dutch),
`shots2.mjs` (360 px, a fresh profile, extra large text, the rush HUD), `shots3.mjs` (the daily and
Endless act chips).

## Online co-op (round 15)

The owner asked for Duo's CO-OP BOSS to work online. Duo, Co-op Boss now asks
**Same phone** (the round 11 pass and play, unchanged) or **Online**: each
player on their own phone, anywhere, sharing a four letter room code. Versus
stays pass and play this round; the link (`NET`) is generic, so a versus claw-off
(or anything else) can ride it later with message types of its own (round 16 did:
"Online versus (round 16)" below).

### Transport: the shared relay

- No server of our own: Clawspire uses the relay the owner already runs for
  Ironbridge (`ironbridge-relay/worker.js`, a Cloudflare Worker with a Durable
  Object per room, live at `wss://ironbridge-relay.danhieux-senjka.workers.dev`).
  It knows nothing about either game: `POST /new` mints a code, `GET /room/<CODE>`
  is a WebSocket, it gives each side `{k:'hello', side, seed}`, then
  `{k:'peers', n}` and `{k:'start', seed, side}` once both are in, `{k:'peerGone'}`
  when one drops, `{k:'rejoin', role}` when one comes back (`?side=` claims its
  own seat back, `?have=1&tick=N` says it still holds the match), answers
  `"ping"` with `{k:'pong'}` and copies everything else verbatim to the other side.
  Plain WebSockets through Cloudflare: no NAT, STUN or TURN, so it works on the
  strict mobile networks where direct peer links fail. Nothing in
  `ironbridge-relay/` or `ironbridge/` was changed.
- **The namespace.** Codes are shared with Ironbridge, so the first thing each
  side says is `{t:'hi', game:'clawspire', v:1, b, p, ready, g, n}`. A partner
  whose first word is anything else (an Ironbridge command batch) is another
  game: "That code belongs to a different game." Another `v` (the message format,
  `DUO.NET.PROTO`) or another `b` (this build's fingerprint: the bosses' moves, the
  difficulty dials, the item count, `SAVE_VER`) is "Your partner has a different
  game version, both reload."
- **The heartbeat.** `"ping"` every 3 s while the socket is open (the relay copies
  it to the partner and pongs back), in the lobby and through long turns alike:
  the relay lets a newcomer claim a seat that has been silent for 10 s. A partner
  silent 10 s is lost; a relay silent 13 s means our own socket is dead and it is
  reopened. A partner who only went quiet (a phone in a pocket throttles timers)
  is back on its next word, no rejoin needed.
- **Reconnect.** A dropped socket reopens every 2.5 s with `?side=` (our seat) and
  `?have=1&tick=N`; after the relay's `rejoin` both sides say hello again and
  each resends its last turn (a repeat is ignored). After 30 s the game offers
  **Keep fighting alone** or **Quit to title**, and the retries go on quietly (every
  6 s) until one is picked. The seat is also kept in `sessionStorage`
  (`clawspire_net`, this tab only) so a reload claims the same seat.
- **The dev override.** The relay's host is `NET.HOST`; `?relay=host` (plus
  `&relayws=ws` for plain `ws://` and `http://`) or `localStorage.clawspire_relay`
  (`host` or `ws://host:port`, a dev key read in try/catch) point it elsewhere.
- **Load.** `js/net.js` is about 17 KB with its comments and loads after `game.js` (no library):
  nothing opens until the player taps Online.

### The flow

1. **Host a game**: the relay mints a code; the lobby shows it big in four letter
   boxes with **Copy code** and **Share invite** (`navigator.share` with
   `https://games-71g.pages.dev/clawspire/?join=CODE`, else the link to the
   clipboard). **Join a game**: four big letter boxes (typing moves on, a paste
   spreads out, the fourth letter joins). A page opened with `?join=CODE` goes
   straight to joining (read once as the scripts load; the address loses it when
   the online game is left).
2. **The lobby**: both players side by side, each editing only their own look on
   their own phone (name, colour, crawler, claw, paint, from that profile; the
   last one is remembered in `meta.duo.online.me`). The host is seat 0 (the
   relay's side 0) and owns the setup: it picks the boss (beaten ones or Random)
   and keeps the colours apart (the guest's moves when both want the same). Each
   taps **Ready!**; when both are, the host sends `go` (the seed stirred from the
   relay's, the boss, both looks) and the coin goes up on both phones.
3. **Turns**, strictly alternating, so nothing ever conflicts. **YOUR TURN**
   (`RENDER.duo.turn`, the hand-off card face up in your colour, a ring that starts
   it by itself after 5 s) and **Grab!**; the fight is the local co-op seat fight
   (`duoCoopEnter`). The boss answers on your seat (COMBAT's enemy phase), then
   the turn goes over the line at once (`duoTurnPass`) with a "NAME'S TURN" beat
   here, and this phone watches.
4. **Watching** (`duoNetDraw`, `RENDER.duo.watch`): both players up top (hp,
   DOWN), the shared boss with its hp and next move, NAME'S TURN then "NAME is
   grabbing", and **their cabinet** from the stream: their claw (built with
   `PHYS.clawPose` in their claw type and paint), their bin's bodies moving,
   each prize they land flying from the chute to their corner, their combos in
   their colours, hp numbers popping, their colour round the glass. A cheer bar
   (Let's go, Sing, Boots, Hug) sends cheers that play on both phones in the
   sender's bubble (over the fight on the other phone, `duoNetOver`).
5. **Results**: the TEAM WIN / KNOCKED OUT podium on both phones, booked on both
   like local co-op (`meta.duo`, the names' team games and wins) plus
   `meta.duo.online {games, wins}`. **Play again** takes both back to the lobby on
   the same code; **Title** leaves.

### Messages (all JSON, `t` the type, `v` the format; everything checked on arrival)

| t | from | carries |
|---|---|---|
| `hi` | both | game, v, b (build), p (look), ready, g (in a game), n (turns seen) |
| `me` | guest | p, ready (lobby) |
| `lobby` | host | p [both, colours fixed], ready [both], boss |
| `go` | host | seed, boss, pick, p [both] |
| `turn` | active | n (a counter both sides keep), seat, next, res (''/win/ko), turns, foes (the shared enemies), pub (the seat's hp, max, block, statuses), down |
| `cl` | active | the claw (x, y, cable top, open, phase, type, width), hp, the enemies' hp; `b` the bin's bodies [uid, item id, x, y, angle] every 0.25 s; sent 10 times a second only when something moved |
| `fx` | active | k: prize (id, plus) or combo (id) |
| `cheer` | either | id (a DUO.CHEERS id) |
| `away` | either | on (the page is hidden) |
| `bye` | either | leaving |
| `again` | either | back to the lobby |
| `need` / `sync` | returning / staying | a phone that lost the game (a reload) asks; the other sends the table: seed, boss, both looks, whose turn, down, the foes, both seats' public state |

- **Never trust the partner.** `duoNetPlayer` (data.js) repairs a look against
  this game's tables; `duoNetFoesIn` refuses a list unless every entry names a
  real enemy (all or nothing), clamps every number, keeps only plain status
  names, checks belly items and move indexes, and takes this game's own move
  object as the intent (a checked copy only when it names none); a slot whose
  enemy changed (a summon) is made fresh with COMBAT's own maker. A turn for this
  phone's own seat, an old one, or one outside the watch phase changes nothing.
- **The active phone's word stands.** The claw's physics may differ between
  phones, so nothing is simulated twice: the enemies and the seat come over as
  they ended. Each phone owns its own DOWN flag.

### Failures (the game never hangs and always gets back to the title)

- The relay unreachable: "Can't reach the online lobby, check your connection."
  A code nobody hosts (alone in the room 7 s): "No game with that code. Check the
  letters with your friend." A full room: "That game is already full." A code
  that is no code: "A code is four letters (no I or O)."
- The partner leaves the lobby: the host waits for a friend again on the same
  code; a guest whose host left is told and goes back.
- Mid game: "Partner connection lost, reconnecting..." (a card over the watch
  screen with a spinner and the seconds, a toast and an amber `#duoBar` dot on the
  fight screen), then Keep fighting alone (the partner's seat counts as DOWN, the
  local rule: this seat simply goes again) or Quit to title. A partner who left
  (`bye`) or whose page is hidden for 45 s (`away`, "NAME stepped away", with Wait)
  gets the same choice at once. Nothing freezes the other phone for good.
- Leave (with a "Leave the game?" check) sends `bye`. An online duel is never
  saved (`duoSaveState` skips it), never touches the local duel save
  (`clawspire_duo`) or the run save, and never changes the local setup memory.

### Code map, API, tests

- `js/net.js` (`NET`): the transport. `data.js` DUO block: `DUO.NET`,
  `duoNetCode`, `duoNetJoinParam`, `duoNetPlayer`, `duoNetOnline` (`duoFix` keeps
  `online`). `game.js` DUO block, the DUO NET part (`duoNet*`), reached through
  one-line hooks in the round 11 code (the co-op button, `duoBegin` {net},
  `duoAfterToss`, `duoHand`, `duoTurnPass`, `duoCoopBook`, `duoFightTick`,
  `duoOver`, `duoTick`, `duoDraw`, `duoEndDom`, `duoKey`, `duoHud`'s dot) and one in
  `deliver()`. `render.js` DUO block: `RENDER.duo.watch`, `turn`, `lost`, `wfx`.
  `audio.js`: `duoLink` (opts.k: join, turn, lost, back). `index.html`: the
  `duo-css` rules for the code boxes, the lobby and the dot. Dutch in
  `lang_nl2.js` (the DUO NET block).
- `GAME.duo.net = {choose, menu, host, joinDom, join, set, boss, ready, start,
  go, alone, quit, again, cheer, live, send, onTurn, boot, foesOut, foesIn,
  pubOut, pubIn, build, sheet, draw, state, log, bootCode}`.
- `tests/clawspire_net.test.mjs` runs two whole games against the REAL relay
  worker in memory (the stand-ins of `tests/ironbridge_relay.test.mjs`, a queue
  pumped by hand): the codes and `?join=`, a look repaired, the enemies' round
  trip and junk, the lobby, turn alternation with the stream, combos, a prize and
  a cheer, a dropped line and its rejoin, a quiet partner, a hidden page, a seat
  down, the team win on both, play again, 30 s then alone, a reload that syncs
  back in, and every failure message.
- End to end (scratchpad `r15net/`): `relay.mjs` hosts the real worker behind
  `ws` on :8787 and the site on :8080; `e2e.mjs` drives two Chromium pages
  (390x844, one English, one Dutch) through host, join by typing the code, the
  lobby, four real turns with the watch screen, a cut line and its rejoin, a
  team win, play again, a reload through the invite link, a closed page, 30 s,
  Keep fighting alone. Screenshots `r15_net_*.png`.

### Known limits

- A turn cut short by a drop is not replayed: the turn is sent when it ends, so
  if the active phone's page dies mid turn, that turn starts over when it comes
  back (or the other goes on alone).
- The stream is a picture, not a simulation: the watcher's bodies glide between
  samples 4 times a second, so a fast tumble looks smoother than it was.
- The relay's free plan has a daily message budget shared with Ironbridge; a
  co-op match is a few thousand messages (the stream only while someone grabs,
  only when something moved).

## Online versus (round 16)

The owner loves the duo modes, so the VERSUS CLAW-OFF went online too, on the
same link, lobby and code as co-op (round 15 above). Duo, Versus Claw-off now
asks **Same phone** (round 11's pass and play, unchanged) or **Online**, then
Host a game / Join a game exactly like co-op: the four letter boxes, Copy code,
Share invite ("Take me on in a Clawspire claw-off! Room code:"), `?join=CODE`.

### The mode, the lobby, the setup

- **The guest follows the host's mode.** Every hello now carries `m` (`coop` or
  `vs`), and so do the host's `lobby` and `go`: a guest takes whatever the room
  plays, whichever menu it came through (or none: an invite link from the
  title). So a versus guest in a co-op room (or the other way round) never
  gets an error, it simply plays the host's game; the lobby's title says which
  ("Online versus" / "Online co-op").
- The host owns the setup: the seed (the relay's, stirred with the code and
  the game count) and **the drops each per round** (3, 4 or 5, chips in place of
  the boss; the guest sees the number). Each player edits only their own look,
  as in co-op; the colours are kept apart the same way.
- **The protocol went to v2** (`NET.PROTO`, `DUO.NET.PROTO`): the hello's mode
  and the claw-off's messages are new, so a round 15 phone (co-op only) is told
  "Your partner has a different game version, both reload." instead of
  misreading them. The build fingerprint (`duoNetBuild`) also hashes the
  claw-off's rules (`VAL, PILE, PILE_MORE, BONUS, DROPS, CARD_IDS, COPIES, HAND,
  WIN_ROUNDS, MAX_ROUNDS`, the combo count, the cabinet's size): two phones that
  would roll a different pile or score a drop differently are told to reload.

### One pile, two phones

- `go` carries the seed; each phone runs round 11's own `duoBegin('vs')`, the
  toss (`duoToss`), `duoRoundStart` (the deck `duoDeck`, the dealt hands, the
  starter `duoStarter`) and `duoPile`, so both build the identical pile, deck,
  hands and toss from the seed. Turns alternate exactly as on one phone.
- **YOUR TURN** (the co-op card in your colour, "Round 1 · drop 1 of 6" and the
  score, Grab! or 5 s): your drop is the round 11 claw-off on your own phone
  (`duoVsPlay`, `duoVsTick`, `duoVsDropEnd`), your finger on your glass. **The
  active phone's drop stands**: nothing is simulated twice.
- **The table.** Every change of hands goes over as one `vt` message with the
  WHOLE claw-off table (round, drops made, drops each, the scores, the pile
  indexes won, both hands, the deck, a pending card, the finished rounds, the
  last drop's prizes and points) plus a snapshot of the bin's bodies by stable
  pile index `[i, x, y, angle x100]`. Three events:
  - `drop` (after `duoVsDropEnd`; `end: 1` when the round is over): the watcher
    takes the table and the bin, shows "NAME +7" with the score lines (worked
    out HERE from the pile with `duoDropScore`, never taken from the wire) and
    "NAME is picking a sabotage card...", the points pop over their side of the
    board, a JACKPOT and their combos play. With `end` each phone runs its own
    `duoRoundEnd`: the round sheet, or the podium, booked on its own profile.
  - `pass` (the dropper played a card, or kept its hand): the table carries the
    pending card; it is the rival's turn on their phone.
  - `next` (Next round, on either phone): the other phone starts the same round
    from the seed; a phone already there takes nothing (a repeat is a no-op).
  Because each table is complete, a lost message is healed by the next one; a
  bin missing a prize the table says is still there is rebuilt (`duoVsBuild`)
  and then set to the snapshot, so both phones always continue from one pile.
- **Sabotage cards** are round 11's, unchanged (Shake Up, Butter Fingers, Fog
  Machine, Tilt!, Mirror Mirror, Tiny Claw, Too Much Coffee): played on your
  sabotage sheet after your drop, the card rides the `pass` table (`pend {id, on,
  by}`) and bites on the rival's phone when their drop starts (`duoVsPlay`
  applies it there: the shake, the grease, the fog, the lean, the mirrored
  steering, the small claw, the fast claw). The card slams onto BOTH glasses:
  the rival's `vgo` ("my drop starts", round and drop count) makes the card
  player's phone slam it, show its tag and the fog or the lean too.
- **Watching the rival** (`duoVsDraw` with the stream): the board, both
  crawlers, the rival's claw in their type and paint (`PHYS.clawPose`, 10 times
  a second, `vc`), the bin's bodies gliding to the samples (4 times a second,
  by pile index; no physics on the watching phone), each prize they land flying
  from the chute to their side of the board (`fx {k: 'vprize', i}`, a straggler
  after the drop too), "NAME'S DROP" then "NAME PICKS A CARD". Under the glass
  one row: the six taunts as icons (Nyah, Spoon, Wah wah, Air horn, Boots and
  cats, Mic drop; their words in the bubble) and Leave. Taunts ride co-op's
  `cheer` with the claw-off's list and play with their own voices on both
  phones, in the sender's bubble (over the dropper's glass too); on the round
  sheet and the podium as well.

### Messages (v2: new, or new fields; everything checked on arrival)

| t | from | carries |
|---|---|---|
| `hi` | both | + `m` (the room's mode, the host's word counts) |
| `lobby` | host | + `mode`, `drops` |
| `go` | host | + `mode: 'vs'`, `drops` (no boss) |
| `vt` | active | `n` (the counter co-op uses), `ev` (drop, pass, next), `end`, `tb` (the table), `sn` (the bin: `[i, x, y, a]`) |
| `vgo` | active | `r`, `k`: my drop starts (the card slams on the watcher) |
| `vc` | active | the claw (as co-op's `cl`) and every 0.25 s `b`, the bin by pile index |
| `fx` | active | + `k: 'vprize'`, `i` (a pile index) |
| `cheer` | either | the claw-off's taunt ids in versus |
| `sync` | staying | + `mode: 'vs'`, `drops`, `first`, `ph` (where the returning phone comes in), `vw`, `tb`, `sn` |

- **Never trust the partner.** `duoVsNetTableIn` is all or nothing: the round
  and the drop count in range, the drops each within the round's and adding up
  to the count, the pile indexes real (for that round's pile, rolled here) and
  unique, the hands and the deck real cards within their sizes, a pending card
  on one player by the other, the finished rounds' scores as number pairs (the
  winners worked out here), the last drop's prizes among the ones won. A bin
  row needs a real pile index (once), a position clamped to the glass. A table
  from an older round, a repeat, one this phone should not take (it is not
  watching), or a `drop` claiming to be this phone's is ignored.

### Reconnect, reload, forfeit, the record

- A dropped line is co-op's: the heartbeat, 30 s of retries, the seat claimed
  back, the last message sent again on `@back` (the table: a repeat is
  ignored). The dropper plays on through it (a "Reconnecting" pill over its
  board, never a card over its glass); the watcher gets the "Partner connection
  lost" card and then the table that heals it.
- A reload (the invite link again) asks for the game (`need`) and gets `sync`:
  the whole table, the bin and where to come in (its own drop starting over, its
  card choice, watching the other's drop or card choice, or the round sheet).
- **Forfeit instead of alone.** After the 30 s (or at once when the rival left,
  `bye`, or was hidden for 45 s) the sheet offers **Win by forfeit** (instead of
  co-op's Keep fighting alone), Wait (hidden only) and Quit to title. A forfeit
  books the match once for this phone's seat (`duoVsBook`, the podium says
  "NAME wins by forfeit!" and "rounds won, then a forfeit", the points include
  the round cut short) and closes the link. Leave asks first ("Your rival wins
  by forfeit."); the one who leaves books nothing.
- **Booking**: both phones book the result on their own profile the local way
  (`duoRecord`: `meta.duo.vs`, the names' wins and losses) plus
  `meta.duo.online.vsGames` / `vsWins` (`duoNetOnline` repairs them, wins never
  above games; no key renamed). The online menu shows "Online versus: N games,
  N wins"; the podium "Online versus wins: N of N". **Play again** takes both
  back to the versus lobby on the same code (a fresh seed). An online duel is
  never saved (`clawspire_duo` and the run save untouched).

### Code map, API, tests

- `game.js` DUO block: the DUO NET VS part (`duoVsNet*`, after `duoNetClawDraw`),
  reached through one-line hooks in round 11's code (the menu's Versus button,
  `duoVsCredit`, `duoVsDropEnd`, `duoSaboDom`, `duoRoundDom`, `duoVsBook`,
  `duoNextRound`, `duoVsDraw`, the podium's label) and round 15's (`duoNetChoose(mode)`,
  the lobby, `go`, `duoNetBegin` {mode, drops}, `duoNetAfterToss`, `duoNetGo`,
  `duoNetPass`, `duoNetOnFx`, the cheers, `need` / `sync`, `duoNetAlone`, the
  sheets `duoNetSheetEl`, `duoNetTick`, `duoNetDraw`, `duoNetEndDom`). Shared
  helpers: `duoNetClawIn` / `duoNetClawOut` (the stream's claw), `duoNetClawDraw`.
  `data.js` DUO block: `DUO.NET.PROTO` 2, `MODES`, `VS_BODIES`, `duoNetOnline`'s
  `vsGames`, `vsWins`. `net.js`: `PROTO` 2. `index.html` `duo-css`: the watch
  bar (`.duoVsNetBar`). Dutch in `lang_nl2.js` (the DUO NET VS block).
- `GAME.duo.net.vs = {go, drops, forfeit, out, onTable, tableOut, tableIn,
  snapOut, snapIn, onClaw, onGo}`.
- `tests/clawspire_net.test.mjs` (two whole games against the REAL relay worker
  in memory): the online record's repair, the menus (same phone is round 11's
  setup), a versus room hosted, a guest from co-op's menu following it, the
  drops the host's only, the Dutch guest's lobby, one seed, pile, deck and toss;
  a drop streaming (the claw, the bin, a prize flying), the table and the bin
  agreeing after it, a taunt, a sabotage card biting on the rival's phone and
  slamming on both; junk tables, rows and starts refused (nothing changes); the
  line cut mid drop, the drop and the card choice made offline, the table
  healing the watcher on the rejoin; a whole match to the podium on both, booked
  on both once, Play again to the same room; the rival gone 30 s, Win by forfeit
  booked once; a reload mid claw-off syncing back in and playing on. (The
  suite resets the relay's per real second flood cap on every pump: it plays
  minutes of game in one real second.)
- End to end (scratchpad `r16vs/e2e_vs.mjs`, round 15's `r15net/relay.mjs` with
  the real worker): two Chromium pages at 390x844, one English, one Dutch: host
  versus, join through the invite link, the lobby, the toss, real finger drops,
  cards played and slamming on both, a line cut mid drop and healed, a whole
  match to both podiums, Play again, a reload through the invite link synced
  back in, the page closed, 30 s, Win by forfeit. Screenshots `r16_vs_ennl_*.png`.

### Known limits

- A drop cut short by a reload starts over (the table is sent when a drop
  ends), like co-op's turn; the prizes its stream showed falling are back in the
  bin.
- The watcher's bin is a picture of the dropper's: the bodies glide between
  samples, and the end-of-drop snapshot sets them exactly (0.1 px, 0.01 rad), so
  the next dropper starts from a copy, not the same floats.
- The one who leaves (or whose page dies for good) books nothing; only the one
  still there books the forfeit.

## The Neon Depths (round 15)

A fourth biome, for Endless only: the flooded basement under the Clawspire.

- **When**: every third loop from Loop 3 dives (`DATA.depLoop`: 3, 6, 9, ...). The classic
  cycle carries on between dives (`DATA.depAct`: 1 cellar, 2 foundry, D, 3 vault, 1, D, 2,
  3, D, ...), so every act still comes round; `DATA.endlessAct` itself is unchanged. A dive
  plays act 3 underneath (its scaling, its rewards). `run.endless.dep` marks the dive and
  `run.endless.dp` counts them, so an old save at Loop 3 (no flag, a vault map) stays the
  vault. The Drowned Jukebox keeps its own trick (a dive's `E.mix` is null; the rng was
  still drawn, so later streams hold) and no loop boss ever borrows High Tide.
- **The map** (`MAP.generate({biome: 'depths'})`): the vault's own layout for the seed,
  only the biome differs, so every map rule holds. Tiles: flooded floor tiles, glowing
  kelp (forest), a checkerboard through the silt (dirt), sand with starfish, drowned
  arcade cabinets (mountains), pipes (hills), sunken arcade stools (fords), deep water
  with ripples and rising bubbles. Teal fog, bubbles for motes, the Depths' own pools
  on every fight, elite, boss and roamer.
- **The fight**: an underwater arcade (light rays, a row of drowned cabinets, kelp, a
  sunken ARCADE marquee, fish, a jellyfish, a sand floor), pink on High Tide, crackling
  on live water. The cabinet stands in water (`DEP_K.water`, 16 percent of the bin) with
  caustics; it is PHYS.rosFlood's buoyancy, so heavy prizes sink and light ones float.
  There is one water: a Rising Water mutator folds in (the higher mark wins).
- **The monsters** (act 3 pools' strength, then x1.1 hp and hits, `DEP_K.hpK / dmgK`):
  Angler Token (`lure`: an Old Boot and a light over it; the aim creeps toward it and a
  falling claw is pulled; grab the boot and the lure snaps off), Jellyfish Coin
  (`jellies`: floating junk that stings the claw that touches it, once a grab; delivered,
  it stings an enemy), Crab Changer (`pinch`: your best prizes are dragged to the far
  wall; lift one clear to free it; still pinched a turn later, it goes into the shell),
  Volt Eel (`shock`: next turn a prize lifted from under the waterline zaps you on
  delivery), Sunken Mimic, the elite (`decoy`: look-alike chests, one pays gold and Block,
  the rest bite). The boss, **The Drowned Jukebox**, High Tide: for your next turn the
  water swells from 14 to 62 percent of the bin and back with its music (74 and 1.5x
  faster on the B-side). Every trick lands on the player's turn or after the enemy phase,
  so COMBAT.qaIntent / qaThreat stay exact.
- **Music**: act 4 to AUDIO, a muffled dub (72 bpm minor, a walking sub, a one-drop kit,
  a low-passed lead with a tape echo, bubbles). Seven sounds in their MIX tiers.
- **Records**: the reboot card floods (DRAIN PUMP FAILED, THE NEON DEPTHS over rising
  water), `meta.dep` {dives, jukebox, best}, a score line (1500 a Jukebox), the history
  card's NEON DEPTHS tag, the Deep Diver sticker (the board's cap 60 -> 63), seven Codex
  pages. Dutch for every line (the DEP block at the end of `lang_nl2.js`).

## QA pass 5 and polish (round 15)

Owner of this section: the QA and polish pass. Scratchpad `r15/` (`qa15.mjs` the tours and bot runs, `bot_fn.js`,
`scan_fn.js` the text audit, `toast*.mjs`, `trd*.mjs`, `rival.mjs`, `dw.mjs`, `load15.mjs`, `bal15.mjs` / `cal15.sh` /
`agg15.mjs`), screenshots `r15_qa_*.png`, `r15_toast_*.png`, `r15_trd_*.png`. Tests: `q15:` in the game and i18n suites.

### The backlog

- **"March" read "maart".** The Wind-Up Soldier's move and the month shared the ui key. A move now resolves by its
  enemy: `content.move['clockwork.march']` (Opmars) and `['wraith.claw']` (Klauw, not the grijper) in `lang_nl2.js`,
  `I18N.move(enemyId, name)`, and a pattern slot named `{mv}` reads the move table first (the death recap "Killed by
  {s} with {mv} for {n}", the cabinet sign "{mv} NEXT TURN: {n}" and "{mv}: {n} INCOMING"). The date keeps its month
  with its own line, "On until {n} March." Every move of every enemy is checked against the twelve months.
- **The corner toast on DANSDUEL.** An event's title weighed as a heading and the vignette as text, so with the plain
  toast in the bottom strip the least covered spot was the title. The title and a story's STORY / PART tags are
  `.qaKeep`, the vignette's neon word is `QA_SIGNS.event` (measured off the scene canvas, `Q15_EV_SIGN`), and
  `POL13_SPOTS.event` offers spots under the page's last button (`pol13Cands` now passes the measured keys). Measured
  at 390 and 360 in both languages on the dance-off, the vending machine and an event: under the choices every time.
- **The Trading Post in Dutch.** Shorter Dutch rules and "gets" (Rommel weg, Voorwerp weg; every line no longer than
  its English) and a tighter card under `html[lang="nl"]` (`trd-css`). Over 40 rolled visits at 390 x 844 the three
  trades now always fit: they needed up to 554 px of a 515 px panel before (26 of 40 visits scrolled), a Dutch card
  is now shorter than the English one (292 against 321 px for the same three).

### QA pass 5, both languages

Scripted tours in English and in Dutch (Duo versus to the podium with a reload, Duo co-op through its hand-offs, all
26 Claw School challenges, the practice cabinet, the Boss Rush with reloads, the daily ghost race, legendary relics
and the new evolutions in a fight and the Prizedex, the three animated cabinets, the Trading Post: every trade kind
dealt and refused a second time, a reload mid haggle, pet evolution by rest, gold and relic, the pet shop, both
seasons' doors and stands) and bot runs in both languages with 8 live language switches each (in fights, on the map,
in shops, rests, rewards and the post) and 4 reloads. Every step audits the page: page and console errors, stalls,
NaN, raw `{placeholders}` and ids, English words left on a Dutch screen and Dutch on an English one (the DOM and every
word drawn on the canvas), buttons overlapping or off stage, a corner item over a button.

Found and fixed (tests `q15:`):
1. **A Duo claw-off crashed** when a prize rolled into the chute after a drop was booked (`V.cur` gone). It now
   scores for the one who knocked it loose (`duoVsCredit`).
2. **A Gary claw-off could wait for ever**: his aim retried every 0.2 s on a claw still busy from the last drop (the
   bot saw it hold a prize at the top for good). An aim on a busy claw now forces the prongs open after 6 s
   (`Q15_AIM_STUCK`) and skips that drop after 10 s.
3. **An item's rules text kept its old language after a switch** (both ways: the rules are built from DATA's numbers,
   so no pattern reads them back). Every rules text now remembers how it was made (`I18N.itemText` memo) and `tr`
   remakes it in the new language.
4. **An icon in front kept the words English** ("🔥 Let's gooo!": a loose "{s}!" pattern took the whole string). The
   words after an icon are tried first: 552 icon-led lines were English before, none now.
5. **Glued toast lines lost their Dutch** ("Relic: Tuning Fork. +50 gold. Two Rocks in the bin." matched "Relic: {s}"
   whole): sentences that are each known are now translated one by one first.
6. **Canvas words in English**: a pet's quip bubble in fights, the pet shop's labels, a challenge's DROPS / TIME line,
   the GOLD / SLOT chips of the legendaries, and a chalkboard goal (wrapped before it was translated, so its pieces had
   no Dutch); `loreFit` measured the English. Plus the capsule prize cards (gold, bulbs, heart, tickets, capsule).
7. **A switch right after boot waited 3 to 6 s** for the Dutch tables behind the art still loading (locally, HTTP/1):
   the fetch now asks `fetchPriority = 'high'` (about 0.25 s).

By design, noted: Duo's setup keeps its Toss button sticky over the scrolling list (in both languages); a floating
word or a toast already on screen keeps its words for its last second after a switch; the Trading Post's haggle has
no button (a tap hurries it). The language switch never touched the run or its save in the 24 switches checked in one beat (8 runs, 64 switches
in all; the 40 of the first round were read across running frames and are not counted), and every reload came back where
it was (20 mid run in the bot runs, plus the rush, the ghost race and a haggle in each language).

### Balance check (round 15)

The round 12 skilled bot (`PRO=2`, `r11/bal.mjs`) on the round 14 build, plus what a skilled player would do with the
round 14 systems (`r15/bal15.mjs`: a detour to the Trading Post, swaps that the bot's item value rates higher, bundles
of two weak items in a fat bin, removals with gold to spare, one relic swap in three; a pet evolved for gold at the
post or at a rest). Six crawlers x classic / tri / scoop / twins, 8 seeds, Tilt 0: 190 runs (2 hit the 15 minute cap).

| skilled bot, Tilt 0 | round 12 after (48 runs) | round 15 (190 runs) |
| --- | --- | --- |
| win | 31% | 32% |
| deaths act 1 / 2 / 3 (share of losses) | 12 / 16 / 5 (36 / 48 / 15%) | 34 / 65 / 30 (26 / 50 / 23%) |
| win: Knight / Alchemist / Rogue / Lucky Lou / Mama Mech / Ms. Bubbles | 38 / 38 / 38 / 13 / 25 / 38% | 34 / 44 / 55 / 25 / 13 / 19% |
| win: classic / tri / scoop / twins | 42 / 25 / 50 / 8% | 27 / 27 / 61 / 13% |
| gold on arrival, act 1 / 2 / 3 | 103 / 419 / 720 | 104 / 420 / 639 |
| relics at the start of act 1 / 2 / 3 | 1.6 / 9.0 / 16.9 | 1.6 / 8.4 / 16.2 |
| a won run ends with | 23.9 relics, 81 items, 1128 gold | 23.6 relics, 80 items, 796 gold |
| capsules a run | 21.7 | 22.5 |
| the killers | the Plushie Queen 6, Ironjaw 4, the Prize Mimic 3, the Dozer 3 | Ironjaw 18, the Plushie Queen 17, the Collector 13, the Golem 11, the Dozer 9, Tin Knight 8 |

The round 14 systems in these runs: 2.0 trades a run (66% of runs trade: 112 swaps, 120 bundles, 92 removals, 55
relic swaps), a pet evolved in 21% of runs, a legendary relic held at the end in 23% (0.6 in a won run). Runs that
traded win 42% and runs that did not 11%, but that is who reaches the post (a run that dies early in act 1 never
does), not what the trades are worth: the loot per act is flat against round 12 and the only real change is where
the gold goes (a won run ends with 330 gold less, spent at the post). **The legendaries, the evolutions, the Trading
Post and pet evolution did not push the game back toward easy**: the skilled bot wins 32% (the owner's target is a
skilled player losing about 70%), and the deaths now spread wider over the acts (act 3 went from 15 to 23% of the
losses). Left for the owner: the scoop still leads (61%) and the twins trail (13%); Mama Mech (13%) dies in act 2
and 3 (Ironjaw and the Collector); Ironjaw and the Plushie Queen are the top killers again.

### Load (round 15)

The round 11 method (`r15/load15.mjs`: Chromium, 4x CPU throttle, slow 4G, served gzipped, the median of 3 cold and
3 warm loads), on round 12, round 14 (HEAD) and round 14 with the lazy tables:

| | round 12 | round 14 | round 15, English | round 15, Dutch |
| --- | --- | --- | --- | --- |
| bytes on the wire (cold) | 1036 KB | 1183 KB | 1070 KB | 1184 KB |
| cold first frame (ms) | 7148 | 7994 | 7380 | 8030 |
| warm first frame (ms) | 2403 | 3006 | 2023 | 3177 |

The two Dutch tables are 116 KB gzipped (`lang_nl.js` 80, `lang_nl2.js` 36; 323 KB raw, `i18n.js` another 6): most of
the round 14 growth (+147 KB, +846 ms to the first frame). They now load only for a Dutch player (written in while
the page parses, so a Dutch boot is exactly as before) or on a switch (fetched, the screen redone when they land). An
English player saves 113 KB and about 0.6 s cold, 1 s warm.

## The cabinet is alive (round 16)

The owner asked for more that can happen with the claw machine itself: more juice, more cool stuff per grab, addictive
loot. This round makes the Rig a character with moods of its own. Five things, each readable on a phone, none of
them touching a number the incoming-damage preview reads (coins and capsules pay gold and loot, never damage).
Code: game.js (the CAB block before `state()`, reached through one-line hooks in `startFight`, `buildRig`,
`endTurn`, `finishEnemyTurn`, `onRigEvent`, `deliver`, `soClose`, `grabFinished`, `endFight`, `lootReward`,
`loadMeta`, `update`, `drawFight` and `holdHint`), render.js (the CAB block: `RENDER.cab`, plus the claw head's
`strain` mood), audio.js (the CAB block: nine voices in their MIX tiers), the Dutch in the CAB block at the end of
`lang_nl2.js`. Dials: `GAME.cab.K` (`CABK`).

**Cabinet events.** From turn 2 (`evFirst`) a player turn opens with an event `evP` (38%) of the time. After the
turn banner a sign swings down on two chains into the glass (CABINET EVENT on its tag), its icon window spins like a
slot reel with ticking (`cabRoll`), and it slams down (`cabLand`, rays, a ring, the marquee) on one of:

| event | weight | what happens |
| --- | --- | --- |
| POWER SURGE! | 0.36 | the claw grips +0.3 and the carriage runs x1.35 for the turn; lightning crawls along the rail, a SURGE plate on the glass, a zap (`cabSurge`) |
| COIN SHOWER! | 0.40 | 6 coins rain into the bin (never into the open claw: a coin dropped in its column moves aside); a coin in the chute pays 1 gold (`COMBAT.gainGold`, so Money Bags and Golden Touch fire on your own turn), flying to the gold counter; the coins left sink away at the end of the turn |
| CAPSULE DROP! | 0.24 | a prize capsule (tier rolled c 55 / u 30 / r 12 / l 3%) with a face drops into the pile; deliver it and it waits on the reward screen as a real capsule (`makeCapsule('cabinet', {tier})`, "Cabinet prize", it can still upgrade as it cracks); at most 2 cabinet capsules a fight, never in a Boss Rush or The Machine's fight (no reward screen there: coins instead) |

The roll uses its own stream (the fight's seed and the turn number, never `FS.rng`), so the pile's physics are
untouched on a quiet turn and a reload (a fight restarts from its bell) replays the same events on the same turns. A
turn that ends puts the sign away and the surge out.

**The Jackpot Lamp.** A dome and a 12-cell tube on the cabinet's top frame, right of the marquee (the pet's name tag
sits on the left, Mama Mech's turret in the corner). Every delivered prize throws a gold star from the chute into the
lamp (+1; the second prize of a grab +1 more, the third +2, a rare or legendary prize +1, a PERFECT grab +1), and SO
CLOSE now has a consolation: LAMP +1. Each spark lights its cell with a bell blip that climbs with the level
(`cabLamp`); the last cells glow. Full: LAMP FEVER! (`cabFever`, a siren into a fanfare): the dome's beacon sweeps
two light cones across the arena, the dome bursts (its cap flies off, confetti, coins, a gold ring, a flash) and 5
coins and a capsule rain into the bin. One fever at a time; an overflow carries. The level is the run's
(`run.cabLamp`, 0..12), written back only when a fight ends, so a reload mid fight starts from the level the fight
began with (no double fill); a lamp left full goes off after the next fight's bell. The first spark on a profile
shows a toast explaining it (`meta.cab.tip`).

**PERFECT grab.** When the drop comes down dead centre (within 5 px, x the claw's width; the scoop 1.4x) on the
prize the palm meets first (the topmost one under the hub), and the claw comes up with it: slow motion (0.3 for 0.4
s), a white flash, gold and white rings, a star burst, PERFECT! over the claw (PERFECT x2! on a streak), a glassy
chime that climbs with the streak (`cabPerfect`), the marquee, a lamp spark, and the grip holds +0.25 harder for
that lift only. Measured over 30 seeded drops: aimed dead on 70% PERFECT, 3 px off 63%, 6 px off or more about 15%
(only when another prize happened to sit dead centre). Claws: classic, tri, scoop, hand, magnet (the harpoon's barb
and the twin and vacuum claws aim differently).

**The straining lift.** The claw feels its load: the cargo's mass maps to a strain 0..1 (`strainM` 12..40, a Tower
Shield alone is most of it). The claw shakes (up to 1.8 px), white tension arcs quiver beside the hub, the cable
glints taut, steam puffs off the head, it sweats drops, glows hot red past 0.65, its eyes grit (the head's `strain`
mood: > <) and it creaks (`cabCreak`, louder with the load). A load past `heavyK` (0.6) gets HEAVY!, a small shake
and a kick, once a grab. Presentation only: the physics never sees it.

**Prize faces.** Rare and legendary prizes, the Golden Prize and the cabinet's capsules have eyes (legendary pupils
are gold stars). They watch the claw when it is near and glance around when it is not, blink, look scared as it comes
down over them (wide eyes, a wavy mouth, a sweat drop), gasp with an EEK! and a squeak when the claw closes on them
(`cabSqueak`), grin and blush on the ride, go dizzy (spiral eyes) when they slip out, and yell WHEE! when delivered.
A prize frozen in ice keeps a straight face.

**Juice rules.** Shake off (reduced motion): no claw shake, no sign swing or reel scroll, no fever beacon, the
flashes capped, slow motion gentler (the game's `slowmo`), fewer sweat drops. Every canvas word goes through the
language (`i18nTr`), the sign sizes its tag and name to the words shown, text is 12 px or more.

**Where it is off.** The physical parts (the events, the lamp, the rain, the PERFECT grip) are off in Duo and in the
headless suites unless `GAME.cab.force` is set, so every older test's physics are bit for bit what they were; the
faces and the strain are looks only and always on.

**State.** Fight-only in `FS.cab` (the sign, the surge, the cabinet's bodies, the lamp as shown, the fever, the
strain), never saved (a reload replays the seeded fight). Run: `cabLamp` (optional, 0..12; a run from before has
none and starts empty). Meta: `cab` {tip, fevers, perfects, events} (`cabMetaFix` keeps it through `loadMeta`). No
key was renamed.

`GAME.cab` = `{K, EV, IDS, WORDS, PATTERNS, LAMP, COL, force, on, fs, turn, turnEnd, event(id, now), land, lampAdd,
spawn, collect, perfect, face, strainK, gripAdd, speedK, tick, draw, rewardCaps, fightEnd}`; `RENDER.cab` =
`{sign, lamp, coin, icon, surge, face, strain, bolt}`; sounds `cabRoll` (tick), `cabLamp` (ui), `cabCreak`,
`cabSqueak` (soft), `cabLand`, `cabSurge`, `cabRain` (mid), `cabPerfect`, `cabFever` (big).

Tests (`cab:`): physics (a coin and a capsule body are grabbed and carried, skipped by the default aim, the pile
deterministic), game (off headless and in Duo with the old numbers; the events by seed and turn, never turn 1, the
same after a reload, the rate and all three kinds; a reload mid fight keeps the lamp the fight started with; the
surge's grip and speed and their end; the coin shower around the claw, a paid coin, the rest sinking; a delivered
capsule on the reward screen, the cap per fight, none in a rush; the lamp's fills, SO CLOSE, the fever's rain, the
carry, the run's level, a full lamp at the next bell; PERFECT on dead-centre drops with its grip for the lift only;
the strain, HEAVY!, the faces' moods; determinism with everything on; drawing in reduced motion), render (the sign
at every beat for every event, every lamp state, coins, icons, the surge, every face mood, the strain, the gritted
claw), audio (every voice plays after init and no-ops before, the throttles, the tiers as rendered, the load and the
streak scaling), i18n (every word and pattern in Dutch, the reward slot and the hint, the drawn words in a Dutch
fight). Screenshots: scratchpad `r16cab/r16_cab_*_{en,nl}.png`.

## Balance touch-up (round 16)

Owner of this section: the balance pass. The request: the round 15 check (above) found outliers (the scoop won 61%,
the twins 13%, Mama Mech 13%, Ironjaw and the Plushie Queen the top killers); pull them toward the middle and keep
the skilled bot at about 30% overall (the owner's target: a skilled player loses about 70% of runs).

**Method.** The round 15 bot unchanged (`r15/bal15.mjs`: the round 12 skilled bot, `PRO=2`, plus the Trading Post
and pet evolution), copied to scratchpad `r16bal/` and pointed at a snapshot of the build (`r16bal/base`, the round
15 commit; `r16bal/mk.mjs` builds a dial set on top of it, `r16bal/cal15.sh` runs the batch, `r16bal/perclaw.mjs`
and `r16bal/deep.mjs` make the tables). Six crawlers x classic / tri / scoop / twins, 6 seeds, Tilt 0. The bot is
deterministic per seed, so before and after play the same seeds. Before: 143 runs; after: 126 runs (the batch was
stopped at 126 of 144 to close the round).

**Why a new dial.** The claw types had no combat dial in `data.js`: `CLAWS[id].stats` are the picker's pips, and
all the difference is the physics (`PHYS.CLAW_TYPES`, not touched here). The skilled bot's scoop brings up 4.4 prizes
a drop, the classic 3.2, the tri 2.9 and the twins 2.5. So `CLAWS[id].bal = { hp, grabs }` is new: the claw type's
own start on top of the crawler's, read once by `GAME` `newRun` (`clawBalRun`: Max HP and grabs a turn, the grabs
kept 1 to 9). Daily, weekly and Boss Rush runs get it too (they are made by `newRun`); the co-op seats, whose
runs are built by the DUO block, do not.

### Before and after

| skilled bot, Tilt 0 | before (143 runs) | after (126 runs) |
| --- | --- | --- |
| win | 30% | 30% |
| deaths act 1 / 2 / 3 | 24 / 47 / 27 | 16 / 51 / 20 |

| claw type | before: win, prizes a drop, turns a fight | after |
| --- | --- | --- |
| classic | 25%, 3.2, 2.0 | 29%, 3.2, 2.1 |
| tri | 31%, 2.9, 2.2 | 35%, 2.9, 2.2 |
| scoop | 51%, 4.4, 1.6 | 34%, 4.4, 2.0 |
| twins | 14%, 2.6, 2.5 | 22%, 2.5, 2.3 |

| crawler | before | after |
| --- | --- | --- |
| Knight | 29% | 30% |
| Alchemist | 46% | 41% |
| Rogue | 57% | 62% |
| Lucky Lou | 17% | 10% |
| Mama Mech | 13% | 15% (21% in the first after batch, 18% over both: 44 runs) |
| Ms. Bubbles | 21% | 20% |

| the killers | before | after |
| --- | --- | --- |
| a fight lost to (elites and bosses) | the Claw Collector 32%, Ironjaw 22%, the Plushie Queen 19%, the Conveyor King 13%, the Dozer 12% | the Claw Collector 29%, the Conveyor King 24%, Ironjaw 21%, the Plushie Queen 17%, the Dozer 17% |
| hp lost a fight: Ironjaw / the Plushie Queen | 50 / 38% | 45 / 34% |
| deaths | the Plushie Queen 14, the Collector 12, Ironjaw 11, the Dozer 6 (+18 to thorns and poison, mostly Tin Knight and the Golem) | the Plushie Queen 11, Ironjaw 10, the Collector 10, the Conveyor King 8, the Dozer 8 (+11) |

The first after batch (142 runs) tried the twins at +1 grab alone and the scoop at -8 Max HP: the twins stayed at 11%
(their act 1 got easier, they died in act 2 instead) and the scoop at 51% (it rarely loses hp, so Max HP does not
touch it). The final set gives the twins 10 Max HP as well and takes a grab off the scoop.

### The dials (old -> new)

| dial | where | old | new |
| --- | --- | --- | --- |
| the scoop's start (new) | `data.js` `CLAWS.scoop.bal` | none | grabs -1 (2 a turn, the Alchemist 3) |
| the twins' start (new) | `CLAWS.twin.bal` | none | grabs +1, Max HP +10 |
| Mama Mech's Max HP | `CHARACTERS.engineer.hp` | 75 | 84 |
| Ironjaw's hp | `ENEMIES` ironjaw `hp` | 88-98 | 80-90 |
| the Plushie Queen's hp | `ENEMIES` plushqueen `hp` | 100 | 92 |

The enemies' moves were left alone (their numbers are in the move text and its Dutch line).

### What is left for the owner

- **The claw picker does not show the new dial.** A twins run starts with 4 grabs and 10 more Max HP, a scoop run
  with 2 grabs, but the picker still shows only the pips and the matchups; a line for it (and its Dutch words) is
  left for the picker's owner. The real fix for the twins is their physics (their small heads catch least a drop).
- **The twins still trail (22%)** and die in act 2 (19 of 25 losses; the Conveyor King and Ironjaw 4 each).
- **Lucky Lou (10%) and the Rogue (62%)** are now the widest crawler gap; the Rogue was 55 to 57% in every batch.
- **Ironjaw and the Plushie Queen barely moved** per fight (21 and 17% of fights lost); the Claw Collector (29%) and
  the Conveyor King (24%) are as dangerous. Their Bite, Gape and Nap are the next dials.
- Tests: `tests/clawspire_balance.test.mjs` checks the `bal` dials (small, the twins +1 grab, the scoop -1 grab, every
  crawler keeps 2+ grabs with the scoop) and that a new run gets them; the data and game suites pin Mama Mech's 84 hp.

## Capsule fever (round 17)

The owner loves the capsules and asked for more fun, more visual animation and more addictive loot,
while loot must stay rare and never make a run easier (a run should still kill you about 70% of the
time). So this round is feel and collection only: nothing here touches `LOOT.WEIGHTS`, `LOOT.UP`,
`LOOT.PITY`, `LOOT.PRIZES`, `VAULT.CAP_W` or any prize. Code: `data.js` (`DATA.GACHA`, appended after
the DATA module), `game.js` (the GACHA block before `state()`, reached through one-line hooks),
`render.js` (`RENDER.gacha`, appended after the RENDER module), `audio.js` (the GACHA block after
CAB), `index.html` (`<style id="gacha-css">`), `lang_nl2.js` (the GACHA block). `GAME.gacha` is the
test surface.

**The build-up** (both rituals: the run capsule and the Vault Capsule).
- Every crack throws shell chips in the capsule's colour (canvas, `RENDER.gacha.chips`, 80 at most,
  halved in calm mode) and plays `gachaTap`, a glassy note that climbs a scale with each tap.
- One tap left, the capsule is PRIMED: it trembles (`gachaJit`), light leaks out of the cracks as
  beams in its colour (`RENDER.gacha.leak`), sparks drift off it, a hum (`gachaPrime`, buzz
  `g17Prime`).
- The rare tease: a common or uncommon capsule whose look-seed says so (`DATA.GACHA.tease`, 20%,
  stable per capsule, never a rare or legendary) flickers gold 0.35 s after it is primed: gold
  beams, a gold ring, the shell flashing gold for a moment, a shimmer that fizzles (`gachaTease`),
  then it settles back. Looks only: its tier, prize and payout never change.
- The last tap pays at once, as before (a reload from here lands on the card), but the pop waits
  a charge (`GK.pre`: 0.22 / 0.32 / 0.6 / 1.25 s by tier; x0.6 for a veteran, x0.4 calm): the
  capsule shakes harder, the beams grow, a riser (`gachaCharge`, longer and brighter by tier),
  buzz `g17Charge`. A tap during the charge pops it and shows the card; Skip pops at once (no
  charge, no linger).
- The pop: chips burst, the rarity chime ladder (`gachaChime`: two notes for common up to a long
  run for legendary), confetti by tier (uncommon adds streams from both sides, rare a star ring,
  legendary a coin rain), the tier label slams in (`.g17slam`, rare and up).
- A legendary gets its own moment: through the charge the room goes dark around the capsule, gold
  god rays sweep the whole screen and sparks rush in (`RENDER.gacha.legend`); the pop adds the
  `gachaLegend` jingle, buzz `g17Legend`, a bigger shake and the old slow motion; the moment
  lingers 0.9 s before the card (`GK.hold`, rare 0.25 s) and the gold rays stay behind the card.
- Hold to crack: a press that is not on a button auto-taps after 0.3 s, then every 0.19 s, and
  stops at the burst (`gachaBind`, `G17.hold`).

**Open all.** Two or more unopened capsules on the reward screen show an Open all (N) button under
the slots (a DOM tap, never a `GAME.choose` entry, so the cards stay 0..2 and Skip 3); the banked
capsule's ritual shows Open all (N) beside Skip. The capsules drop onto little pedestals (rows of
up to three), then pop one after another (0.32 s apart, 0.2 for a veteran; a tap hurries, Skip pops
the rest): each is paid at its pop (`gachaPayCap`: the prize, its mini, highlights, `meta.loot.caps`,
saved at once), its prize appears in its place (the item or relic art, a coin stack, tickets, its
icon) with its mini beside it, then a label under each and Collect all. The screen saves as
`sd.capsule = {all, caps, rwIdx | bank, then}`: a reload resumes the fan with the paid ones popped,
never paying twice; banked capsules leave `run.caps` when the fan starts and live in the screen's
save until paid.

**Capsule Minis** (`DATA.GACHA`). Twenty four collectible figurines in four series of six (two
common, two uncommon, a rare, a legendary each): Arcade Pals, Spire Snacks, Neon Beasts, Lucky
Charms. Each has its own drawing (`RENDER.gacha.BODY`, a face that blinks, a stand in its rarity).
- A run capsule carries one `CHANCE` of the time by its tier (c 30%, u 45%, r 70%, l 100%); a Vault
  or daily capsule always does. The mini's rarity follows `W` by the capsule's tier (a common
  capsule: c 62, u 28, r 8, l 2). Rolled at the burst from its own stream (meta counters), so the
  capsule's tiers and prizes and the run's rng are untouched (a test runs 14 capsules with the minis
  on and off: the same tiers and prizes). Saved on the capsule (`cap.mini`) and the reward slot.
- The prize card shows it (a figure, Capsule Mini, its name, its series n/6, NEW! with a toy pop
  sound, or a dupe's vault tickets); the reward slot of an opened capsule names it.
- Dupes pay vault tickets (`DUPE` c 3, u 6, r 12, l 30). A finished series pays its rainbow Prize
  Vault cosmetic, capsule-only until now (Arcade Pals the JACKPOT marquee, Spire Snacks Rainbow Road,
  Neon Beasts Rainbow Riot, Lucky Charms Rainbow Chrome), or 150 vault tickets when you own it:
  SERIES COMPLETE! on the card, a march (`gachaSeries`), confetti.
- The Prize Vault has a Minis tab: the four series with their progress bars and prizes, a slot per
  mini (a dark silhouette and ??? until found, x2 for dupes, NEW until picked), the detail strip, and
  the window shows the picked mini turning on a lit turntable beside its series' shelf.

**The daily capsule.** Once a real day (the local date, `DATA.dailyKey`) the Prize Vault's capsule
button becomes FREE DAILY CAPSULE: a free Vault Capsule (the same `vaultRoll` odds and pity, saved
as `vault.pend` with `daily`, so a reload reopens the same one and a second claim is refused) plus a
streak bonus of 5 vault tickets a day in a row (up to 35 at 7 days; a missed day starts over). The
title's Vault tile glows gold with its badge counting it (`vaultTitleBtn`, no new title element);
once claimed a small fire chip with the streak sits on the capsule button. Headless there is no
clock (no daily capsule) unless a test sets `GAME.gacha.now`.

**Reward screen slots.** Rarity lighting on each capsule slot (a shine sweeps it, faster on rare and
legendary, a rainbow rim on legendary), the mini an opened one held, Open all.

**Calm.** Shake off (reduced motion): the charge x0.4, no linger, no tremble, half the chips, slow
rays, no slow motion pulse beyond the old rule, CSS loops off (`.calm`, `prefers-reduced-motion`);
Reduced flashing drops the slam.

**Save.** Meta `gacha {minis {id: n}, news, series, rolls, opened, dupeTix, day, streak, best, days,
bonus}` (`gachaMetaFix` repairs junk; a new key, nothing renamed); `vault.pend.daily`; `cap.mini`;
`sd.capsule.all`.

Tests: data (the table, the mini and chance rates over 20,000 rolls, determinism, the tease rate
and never on rare or legendary, the LOOT and Vault odds unchanged), game (the build-up and its
timings, the legendary moment, a tap in the charge, Skip, calm, the tease never changing the
prize, hold to crack, minis across reloads before and after the burst, capsule rolls the same with
minis on or off, dupes and series prizes, junk saves, Open all from the bank with a reload mid-fan
and from the reward screen with its indices kept, the daily capsule with a stubbed clock: once a
day, a reload mid-open, the streak and its reset, the Minis tab), render (every mini found and as a
silhouette, all distinct, chips, leak, legend, turntable, balanced and NaN free), audio (the nine
voices in their tiers, no clipping at the loud ends), i18n (every word, pattern, mini and series in
Dutch, the screens drawn in Dutch).

## Cabinet Tech and the new crawler (round 17)

The owner asked for cooler combos and many builds, and for more that can happen with the claw machine. Round 16 made
the cabinet a character (events, the Jackpot Lamp and LAMP FEVER, PERFECT grabs, coins); nothing in the relic pool
played with it. This round adds a relic family that builds around those systems, a keyword so the existing synergy
systems see it, three combos, and a seventh crawler whose kit is the cabinet itself.

**Where it lives.** `TECH` blocks: data (`data.js`: her items after Ms. Bubbles', the starter after the Bubble Wand,
the family after the ROS relics, `TECH_K` with the relic helpers, the archetype, the combos, the character, her
outfits and Codex page, and the TECH block after `/ROS` with The Motherboard, two stickers, `techMods`, exported as
`DATA.TECH = {K, RELICS, ITEMS, COMBOS, mods, TIP}`), the rules (`combat.js` TECH block: `techFight`,
`COMBAT.techOn / techCab / techOf`; one line in `newFight`, the grab's `perfect` in the combo ctx and its clearing in
`grabDone`), the cabinet (`game.js` TECH block after `/CAB`, `GAME.tech`), the art (`render.js` TECH block,
`RENDER.tech`), two sounds (`audio.js` TECH block), the Dutch (`lang_nl2.js`, the TECH block at the end). Ids are
new, nothing was renamed, no save field was added (fight state in `FS.tech` and `F.tech`, rebuilt from the seed).

### How the cabinet reaches the relics

- **A new hook, `onCab(F, kind, v, id)`** (`DATA.RELIC_HOOKS`): `kind` is `'event'` (`id`: surge, coins, capsule),
  `'perfect'` (`v`: the PERFECT streak, 1, 2, 3...), `'fever'` (`v`: fevers this fight) or `'double'` (Double
  Feature's second reel, `id`). The game calls `COMBAT.techCab(F, kind, v, id)`, which only acts on the player's own
  turn: everything a Cabinet Tech relic does (damage, Block, healing, a grab) happens on your turn, never on the
  enemy's, so the incoming-damage preview never has to guess. A LAMP FEVER that goes off after END TURN waits in
  `FS.tech.pend` and pays at the start of your next turn (`techTurn` in `finishEnemyTurn`).
- **Cabinet numbers** (`relic.tech`, added up by `DATA.techMods(run.relics, run.char)` once at the bell): `evP` (more
  event chance a turn, capped at 1), `first` (events from turn 1), `perfX` (px more room for a PERFECT), `laser`,
  `lampStart`, `coins` (more a Coin Shower and a fever), `coinGold`, `double`, `perfLamp`, `drain`. The CAB block reads
  them through `techMods()` (all zeros without a live cabinet).
- **CAB hooks (one line each, in the CAB block):** `cabTurn` (the `evFirst` and `evP` lines), `cabEvLand`
  (`techEvLand(E)` at the end), `cabCollect` (a coin's gold `+ techMods().coinGold`), `cabFeverTick` (`techFever(n)`
  at the fever's start, `+ techMods().coins` on the rain), `cabPerfect` (`techPerfect(n, x, y)` after the lamp spark),
  `cabUnderPalm` (the look radius and the PERFECT window `+ techMods().perfX`). **Outside it:** `startFight`
  (`techFightStart`), `deliver` (`techDeliver`), `grabFinished` (`techGrabDone`), `finishEnemyTurn` (`techTurn`),
  `update` (`techTick`), `drawFight` (`techDrawIn`, inside the cabinet's clip), `unlocked` / `unlockRule` (the
  `fever` rule).
- **Quiet cabinet.** The cabinet's physical parts are off in Duo (and headless unless `GAME.cab.force`); there
  `F.tech.on` is false, `techMods()` is zeros and the event relics (the Service Remote, the Service Key) ring every
  2nd turn instead, so Joy Stick's kit still works in a Duo seat.
- **The cabinet's own event** (`{t: 'tech', k, n, id}`) is read at once by the sticker check and never queued, so a
  turn where no relic answers keeps its pace.

### The relics (the Tech chip, 🕹 Tech, `#ff7ad9`)

| relic | rarity | the build | what it does |
| --- | --- | --- | --- |
| 📟 Service Remote | Joy Stick's starter | events | every event that lands: 3 to ALL and 3 Block; a quiet cabinet: every 2nd turn |
| 🔦 Laser Sight | c | PERFECT | a red laser shows the drop (gold with LOCK when it would be PERFECT); the PERFECT window x2 (+5 px); every PERFECT: 3 Block |
| 🔑 Service Key | c | events (fortress) | events +15% a turn and from turn 1; every event: 5 Block (quiet: every 2nd turn) |
| 🪔 Lamp Oil | c | lamp (feast) | the lamp starts every fight 4 cells fuller; every LAMP FEVER heals 3 |
| 🪙 Coin Hopper | c | coins (greed) | Coin Showers and fevers drop 3 more coins; a coin pays 2 gold (Money Bags, Golden Touch and every gold relic hear it) |
| ⏱ Metronome | u | PERFECT | a PERFECT hits a random enemy for 4 per PERFECT in the streak (4, 8, 12, 16 at most) |
| 🌀 Fever Dream | u | lamp | LAMP FEVER: 8 to ALL and 4 Block |
| ⚡ Circuit Breaker | u | events (metal) | a POWER SURGE zaps ALL for 6, a COIN SHOWER gives 6 Block, a CAPSULE DROP heals 5 |
| 🎯 Trick Shot | r | PERFECT (jackpot) | a PERFECT x2 or better gives the grab back, once a turn |
| 🎞 Double Feature | r | events | every event lands twice: the reel spins again for a second, different event (+8% events) |
| 💾 The Motherboard | l | all of it | an event every turn from turn 1, a PERFECT lights 2 more cells, LAMP FEVER deals 15 to ALL; the catch: a grab that brings up nothing drains 3 cells |

The legendary follows the round 12 rule (`leg`, rarity `l`): only the boss relic, a legendary capsule and the Back
Room hand it out. Every relic draws its own glyph inside its rarity medallion (`RENDER.tech.GLYPH`: the remote with a
blinking LED, a scope, a key ring, an oil can dripping into the lamp's dome, a coin funnel, a swinging metronome, a
turning spiral, a breaker box, a bullseye, two film frames, a glowing board), and every answer flashes where the
cabinet did it (a pink ring and a circuit spark at the sign, the claw or the lamp, `techZap`) with a service beep
(`techBeep`, pitched by kind); Double Feature's reel spins up with `techDouble` and DOUBLE FEATURE!.

### The archetypes

- **PERFECT streak** (Laser Sight, Metronome, Trick Shot, Bullseye): aim dead centre and chain it. The laser makes the
  aim readable, the Metronome climbs with the streak, Trick Shot turns a streak into more grabs. Bridges: Jackpot.
- **The lamp** (Lamp Oil, Fever Dream, The Motherboard, Joy Stick's arcade parts): every arcade part lights more
  cells; Lamp Oil starts fights near FEVER (two fevers a fight come easily), Fever Dream turns each into damage and
  Block. Bridges: Feast (Lamp Oil's healing).
- **Events** (Service Remote, Service Key, Circuit Breaker, Double Feature): more events, earlier, twice, each one
  paying in its own way. Bridges: Fortress (the key), Magnet (the breaker).
- **Coins** (Coin Hopper, Coin Mech, Coin-Op): Coin Showers and fevers pour gold, and every gold relic that already
  existed (Money Bags hits ALL for every gain, Golden Touch, Piggy Bank) fires off it. Bridges: Greed.

### Combos (3 new, `DATA.TECH.COMBOS`)

| tier | combo | recipe | effect |
| --- | --- | --- | --- |
| 1 | Coin-Op | a Tech item and a coin (Lucky Penny, Arcade Token, the Coin Mech...) | 5 damage, 3 gold |
| 2 | Short Circuit | a Tech item and two metal items | 6 and 1 Weak to ALL |
| 2 | Bullseye | a PERFECT grab of 2+ items (`ctx.perfect`, COMBAT passes the grab's streak) | 8 damage, 4 Block |

### Joy Stick, The Technician (`CHARACTERS.techie`)

- **The kit.** 70 hp, 100 gold, 3 grabs, width 1, grip 1, quick rails (1.15). Starter relic the Service Remote.
  Unlock `fever`: set off LAMP FEVER with any crawler (`checkUnlocks('fever')` in `techFever`; a profile that has
  already seen a fever, `meta.cab.fevers`, has her at once). The picker says "Set off LAMP FEVER to unlock".
- **Her gift** (`tech: true`): the cabinet works for her. Events come +22% a turn and can land on her first turn
  (the sign waits for the bell's banner), and a PERFECT lights one more lamp cell. Her first fight of a run shows a
  toast saying so (`DATA.TECH.TIP`).
- **Her bin (19):** 5 Arcade Sticks (4, a lamp cell), 5 Arcade Buttons (5 Block, a lamp cell), a Coin Mech, a Neon
  Tube, an apple, 3 Lucky Pennies (Coin-Op with her parts) and 3 bouncy balls. Her pool: Coin Mech, Neon Tube (c),
  Circuit Board, Extension Cord (u), CRT Monitor (r), Golden Joystick (l). An item's `lamp` (1 to 4) lights that many
  more cells when it is delivered (for anyone who holds it) and gives it the Tech chip.
- **Looks.** Her portrait (`RENDER.tech.portrait`): a backwards pink cap with a service LED that blinks pink and cyan,
  a dark bob with a pink streak, a screwdriver behind her ear, a hoodie with a lanyard card, eyes that blink. Outfits:
  Service Headset (u, with a boom mic whose tip blinks), Scanline Visor (r, a scanline that scrolls), plus her
  Claw-o-ween Witch Hat and her winter Scarf & Earmuffs. Crawlers have no hurt or win poses of their own (the
  portrait is one drawing everywhere, animated by `t`); hers idles like the others' outfits do. Versus line: "Hold
  on, rebooting you." Codex page `cr_techie`, history initials JOY / TEK / LMP.
- **Everywhere else.** The daily and weekly rotations, Tilt, pets, sets and every claw type read `CHARACTERS`. Boss
  Rush kit (`RUSH.KIT.techie`): CRT Monitor, Circuit Board, Extension Cord, Neon Tube, Protein Bar and Fever Dream.
  A Duo seat gets her starter and that kit (`duoSeatRun`), in a quiet cabinet.
- **Stickers** (the board at 63 of 63): Perfect Game (five PERFECT grabs in a row) and Tech Support (win as her).

### Balance (the skilled bot)

The round 16 bot (`r16bal/bal15.mjs`, `PRO=2`, Tilt 0, the Trading Post on), copied to scratchpad `r17new/`
and pointed at a snapshot of this round (`r17new/base`). New: the bot sets `GAME.cab.force`, so the cabinet is alive
as in a real game (round 16's balance runs had it off), and it records PERFECTs, events, fevers and the Tech relics
held. It plays Tech relics passively (they need no choices); it does not aim at the cabinet's coins.

| skilled bot, Tilt 0, cabinet on | runs | win |
| --- | --- | --- |
| Joy Stick (4 claws) | 40 | 35% (classic 33%, scoop 78%, tri 22%, twins 22% in her 36 run batch) |
| the six others (4 claws, one seed each) | 22 | 36% |
| all | 62 | 35% |

She dies mostly in acts 2 and 3 (3 / 13 / 10), to the Frost Knight, the Claw Collector, the Tin Knight and Ironjaw,
like the others. Nothing was tuned: she landed in the 20 to 45% band at once. Tech relics the bot ended holding (runs,
win): Trick Shot 13 (54%), Service Key 12 (33%), Double Feature 11 (36%), Metronome, Lamp Oil, Fever Dream 8 each
(50%), Laser Sight 7 (43%), Circuit Breaker 6 (83%), Coin Hopper 5 (60%).

**For the owner.** The bot's "perfect hands" deliver about 3 prizes a drop, so with the cabinet on it lands PERFECT
on 53% of its drops and sets off LAMP FEVER about 200 times a run (5 a fight): the lamp is tuned for a human's 1.5 to 2
prizes a grab, so the bot overrates the lamp's payoffs (Fever Dream, Lamp Oil) and the capsules the fevers rain (about
60 a run). A real player sees a fever about every one or two turns. The balance suite's COMBAT-only model has no
cabinet, so its relic draw leaves the Tech relics out (`deckFor`).

### Tests

data (her kit, pools, rotations, items' lamp counts and chips, the ten relics' rarities and pools, `techMods`, every
hook through a recording COMBAT, the quiet cabinet, the combos' examples, the stickers, the outfits), combat (`F.tech`,
`techCab` on your own turn only, the remote's numbers, Bullseye and the Metronome on a PERFECT and its clearing, the
quiet remote and key, a 20 fight fuzz with every Tech relic), game (the unlock by a knight's fever and for an old
profile, her run and gift, turn 1 events for her and never for the knight, the same cabinet for the same seed, quiet
headless and in Duo, the remote, the breaker and Double Feature in a real fight, PERFECT with her extra cell, the
Metronome and the laser's window, the Coin Hopper's coins and gold, Lamp Oil, an arcade part's cells, Fever Dream and a
fever held over END TURN, The Motherboard's events and drain, real grabs with every Tech relic deterministic and a
reload, a Duo seat's kit and the quiet remote), render (her face, blink, every outfit, eight distinct parts, eleven
distinct medallions, the laser's states), audio (the two voices in their tiers), i18n (every word, pattern, relic,
item, combo, sticker and outfit in Dutch; her fight draws DUBBELE VOORSTELLING! and RAAK). Screenshots: scratchpad
`r17new/shots/r17_tech_*_{en,nl}.png`.

## QA pass 6 (round 17)

Owner of this section: the QA pass. The round 15 and 16 features (the HUD and title sheets, online co-op and versus,
the Neon Depths, the cabinet events / Jackpot Lamp / PERFECT / heavy lift / faces, the claw dials) played like a player
on phones (390 x 844 and 360 x 780), in English and in Dutch, in Chromium with real taps. Scratchpad `r17qa/`: `lib.mjs`
(the page helpers and a layout audit: text spilling out of its box, buttons covered or overlapping, English on a Dutch
screen), `title.mjs` (every title button by a tap, every sheet and back, Escape, the Duo path to both online menus),
`hud.mjs` (the top bar in a fight, Endless with Blackout and Rising Water, a Depths dive and the Jukebox, Boss Rush,
daily, weekly, Duo co-op and versus; gold 99999, Block 999, tickets 9999, 30 relics and the relic list, every chip's
popover, 4 hp with eight statuses), `cab.mjs` (every event mid roll and landed, coins delivered for gold, a delivered
capsule on the reward screen, a fever from a real grab, PERFECT and HEAVY on real drops, calm mode, a save and reload
mid turn with each of surge / coins / capsule / fever / a half lamp, Blackout + Rising Water + the Depths water, the
incoming preview against what the enemy phase really took on every one), `net17.mjs` (online: a code nobody hosts, a
bad code, a full room, the host leaving the lobby, the guest leaving and coming back on the same code, a 24 letter
name, both phones pressing Ready and Play again at once, the watching phone frozen 20 s (a phone in a pocket), the
active phone hidden 20 s, Play again twice, English against Dutch), round 16's `r16vs/e2e_vs.mjs` (Dutch host, English
guest, a whole claw-off with cards, a cut line, a reload, a forfeit), `dep.mjs` (a whole dive by the in-page bot, the
Jukebox, out to Loop 4, both languages). Screenshots `r17qa/r17_*.png` and `r17qa/vs/`.

### Found and fixed (tests `qa17:`)

1. **Escape back from a page opened out of a title sheet closed that sheet again.** The page's Escape (the weekly, the
   Boss Rush menu, the Codex, the History) went to the title, which reopened the sheet, and then the title's own Escape
   listener, running after `onKey` in the same key press, closed it. The listener now acts only on a key press that
   began on the title (`qa17Key` notes the screen first thing in `onKey`; `qa17TitleEsc`). Game suite.
2. **Escape did nothing on the Prizedex, Stickers, Help and Tips pages** (every other page has it): it now presses the
   page's Back (Help from the map goes back to the map); a popover or the Settings panel closes first. Game suite.
3. **In season the title's ribbon landed inside the More sheet.** The round 15 tidy moves any title button it does not
   know into More; the Claw-o-ween / Winter ribbon is one, and inside the sheet it kept its absolute place over the
   sheet's X (the X could not be tapped) and ran off the right edge. It was out of season when round 15 was measured.
   The ribbon now stays where SEASON hangs it, over the sky (`qa17TitleKeep`). Game suite.
4. **The HUD's resource row ran under the relic strip** with big numbers (gold 99999 and 9999 tickets: 24 px) and even
   with normal ones in a weekly run (the WEEKLY badge in the act chip: gold 250, 45 tickets overlapped the first relic).
   The row now squeezes when it outgrows its column: tighter chips (`qa17Tight`), then the act chip without its word and
   a size smaller (`qa17Tight2`); measured only when a number's length, the act text, the badge or the language changes
   (`qa17HudFit`, a browser only; `qa17Fit` is tested with a stand-in row). Game suite.
5. **The Dutch map head said "A..." / "R..."**: "AKTE 1" and "RONDE 12" got 41 px beside the longer Dutch buttons (BAK,
   STOPPEN, "40 lampjes"), on every Dutch map at every width. Under `html[lang="nl"]` the row's gaps, the buttons' side
   padding and the bulb pill are a little tighter: "RONDE 12" fits whole (measured at 360 and 390). Game suite (the rules).
6. **The Jackpot Lamp after a FEVER lit more cells than its level**: sparks still flying when the dome burst were already
   in the carried level and lit again on landing (a fever from a double grab showed 4 cells over a level of 2, so the lamp
   could look full without a fever). The burst now shows the carry less what is still flying (`qa17LampShown`). Game.
7. **Online versus: the two phones' tables disagreed after a late prize** (the net suite's flaky "the table is the same on
   both phones" and "a drop after the reload agrees too", about 1 relay seed in 8, already in round 16's build). A prize
   that rolls into the chute after the drop was booked scores on the dropper's phone (round 15's straggler rule), but the
   table had already gone over and the watcher never heard of it until the card choice. The dropper now sends the table
   again with `ev: 'late'` (`qa17VsLate`); the watcher takes it only while watching that rival's drop, quietly (the
   result card's points, a flash, no second fanfare: `qa17VsLateIn`); a late table from the wrong side is refused. Net
   suite: 52 relay seeds green (seeded `crypto.getRandomValues`, `r17qa/netseed.mjs`), plus the new test, which fails on
   round 16's code.
8. **The co-op watch screen's corner card covered the partner's hp**: a Prizedex discovery or a sticker sat right over the
   second player's card (both cards are canvas, so the corner lane did not know about them). `QA_SIGNS.duo` now hands it
   both cards on the online watch screen; it settles under them. Game suite.
9. **"DOOR ELKAAR" ran out of its pill** on the claw-off (the Shake Up card's tag, and every Duo pill in Dutch):
   `RENDER.duo.tag` measured the English and drew the Dutch. It measures the words it shows. i18n suite.
10. **The claw-off board's round stars poked through the lit frame** (the outer star crossed the frame of the player
   whose drop it is, and a long name ran into them): the stars sit beside the score, inside the frame. Render suite.

Checked and fine: every title button reachable by a tap in both languages and sizes (the sticky Ready! / Toss over a
scrolling list is by design), the sheets' X, the dim and Escape; the online messages (nobody, bad code, full, the host
gone, the guest back on the same code); a frozen or hidden partner for 20 s comes back without a stuck sheet; Play
again twice books three games on both; the Dutch phone stays Dutch against an English host; a whole versus match, its
reload and forfeit; every cabinet event, the coin pay, the capsule on the reward screen (Cabinet prize), the fever's
rain, PERFECT and HEAVY, calm mode (no beacon, no reel scroll, no flash); a reload mid turn with each active starts the
fight from its bell with the lamp the fight began with and the gold unchanged; the incoming preview equalled the hp
the enemy phase took in all 14 checks (coins, a fever, five reloads, Blackout + Rising Water, the Depths, three Jukebox
turns, and coins and a fever again in Dutch); a whole dive in both languages (the in-page bot in god mode, its fights
shortened) reached the Jukebox and Loop 4. No page error or console error in any of it.

Found, not fixed (not this pass's code, or by design):
- **Deaths with no killer.** In the bot's runs 23 of 74 losses (31%) read "Killed by the Clawspire": a run that dies on
  its own turn to thorns (Tin Knight and the Brass Golem against the Rogue's many-hit daggers, 71 hp to 0 in one turn).
  The death recap and the history card should name the thorns' owner; that is COMBAT's and the recap's (`FS.killer` is
  only set by an enemy's hit). For the owner.
- The cabinet event sign passes through a boss plate (HIGH TIDE) for the 0.35 s it takes to swing in or out; it never
  rests on it.
- The new Cabinet Tech relics' rules were English on a Dutch relic list while their Dutch was still being written by
  that pass (Service Remote, seen mid round).

### Balance nudge (round 17)

The round 16 report had the Rogue at 55 to 62% and Lucky Lou at 10% (about 21 runs each). Re-measured with the same
bot (`r16bal/bal15.mjs`, `PRO=2`, Tilt 0, copied to `r17qa/bal/`, `cal17.sh` with a shared queue) on a snapshot of the
round 16 build: the Rogue and Lucky Lou x classic / tri / scoop / twins x 12 seeds (17000 on), 96 runs. The bot is
deterministic per seed; a seed the round 16 build lost replays the same on its own snapshot (checked), so the
difference is the seeds: on 48 runs each the Rogue wins **27%** and Lucky Lou **19%**. The Rogue is not an outlier,
so its dial is left alone; Lou trails, so his Max HP goes up.

| dial | where | old | new |
| --- | --- | --- | --- |
| Lucky Lou's Max HP | `data.js` `CHARACTERS.gambler.hp` | 70 | 78 |

| skilled bot, Tilt 0 | before | after |
| --- | --- | --- |
| Lucky Lou (48 runs, the same seeds) | 19% (9 won; deaths act 1 / 2 / 3: 7 / 25 / 7) | 25% (12 won; 5 / 21 / 8) |
| the Rogue (48 runs) | 27% | 27% (unchanged) |
| all six crawlers (95 runs, 4 seeds each from 18000, Lou at 78) | | 28% overall (Knight 25, Alchemist 31, Rogue 44, Lou 27, Mama Mech 25, Ms. Bubbles 19%; 16 runs each, so a crawler's figure is rough) |

The data suite pins Lou's 78. The balance suite's "every normal is beatable" holds for every crawler (the Rogue's
weakest act 2 normal at 1% in that COMBAT-only model, unchanged here).

## Build and delivery (round 18)

The deployed copy is built, the source is not. `build.js` (`minifyClawspire`, after the copy) works on
`dist/clawspire` only; `clawspire/` stays readable and the tests keep loading it.

- **Minified per file.** Each `js/*.js` goes through esbuild's transform on its own (`minify`, target es2020,
  no legal comments, UTF-8 kept so emoji and Dutch stay readable). They are classic scripts sharing globals; a
  transform without a format never renames top-level names (`const GAME`, `RENDER`, `U` survive), and es2020
  matches the source's syntax, so nothing is lowered and no helper temporaries land in the shared scope. Every
  `<style>` in index.html is minified as CSS (ids kept), the loader's inline script as ES5 (it runs before
  anything else and stays plain ES5).
- **Versioned URLs.** Every `<script src="js/x.js">` in clawspire's pages becomes `js/x.js?v=<sha256, 10 hex>`
  of the built file. The lazy Dutch tables are named inside i18n.js, so the build stamps those strings first
  (`js/lang_nl.js?v=...`), then hashes i18n.js; the build fails loudly if i18n.js stops naming a `lang_*.js`
  file, rather than ship an unversioned table under a year-long cache. The root `_headers` gives
  `/clawspire/js/*` `Cache-Control: public, max-age=31536000, immutable`; index.html keeps the Pages default
  (revalidated each visit), which is what carries the new hashes after a deploy. A warm visit now asks the
  server for index.html and art/manifest.json only.
- **Left out of the deploy** (kept in the repo): intro.mp4, intro.webm, intro_poster.jpg (the intro is drawn
  live by js/intro.js; nothing requests them), DESIGN.md and ART_PROMPTS.md. About 17 MB less per deploy.
- **Loader weights.** The bulbs fill by each script's share of the bytes; the build rewrites `var WT` in the
  dist index.html from the minified files' gzip sizes (one weight per script tag), and the source line carries
  the same numbers for the dev page.

Measured (round 18, local server with gzip, 390x844 mobile emulation; slow 4G = 1.44 Mbps and 150 ms, plus
4x CPU):

| | before | after |
| --- | --- | --- |
| English download (js + index.html, gzip) | 1211 KB | 795 KB |
| everything (with the Dutch tables), raw | 4.38 MB | 2.57 MB |
| dist/clawspire on disk | 21.9 MB | 2.7 MB |
| cold first frame, slow 4G | 7.7 s | 5.4 s |
| cold first frame, Dutch, slow 4G | 8.6 s | 6.1 s |
| warm first frame, slow 4G | 0.90 s (14 revalidations) | 0.73 s (2) |

## Design system and home screens (round 18)

The look is "Arcade after hours": the neon cabinet, calmer. One `<style id="ds-css">` block, directly after the
main `<style>`, holds the tokens and the shared components; every later block styles its screens on them.

**Tokens** (names are final; the older names are aliases so earlier rules and the colour-blind modes keep working):

| Group | Tokens |
|---|---|
| Palette | `--bg #12091f`, `--surface #1c1233`, `--surface-2 #261a44`, `--line #3a2a5e`, `--line-strong #5a3f8f`, `--text #f4eeff`, `--text-2 #b7a9d9`, `--text-3 #8576ab`, `--accent #ff4f9a` (THE primary action), `--info #35e0d2` (selection, progress), `--reward #ffcc55` (money, prizes), `--good #a6ff5e`, `--bad #ff5a4a`, `--rar-c/u/r/l` |
| Type | `--font` (Trebuchet MS, then the system UI faces), `--fs-xs 13` (labels, tags, captions), `--fs-s 15` (body), `--fs-m 19` (card titles, the primary button, section heads), `--fs-l 30` (screen title) |
| Space | `--s1 4`, `--s2 8`, `--s3 12`, `--s4 16`, `--s5 24`; radii `--r-chip 8`, `--r-card 12`, `--r-sheet 18` |
| Aliases | `--ink --panel --panel2 --line2 --dim --dimmer --pink --cyan --gold --lime --blood` point at the tokens |
| Colour-blind | under `html.cb-*` the state and rarity tokens follow the mode's safe set: `--good` = `--acc-heal`, `--bad` = `--acc-dmg`, `--rar-u/r/l` = `--acc-cyan/gold/pink` |

**Rules.** One glowing element per screen (the primary button, or the hero art); everything else flat. Coloured
borders only for state (selected, a rarity stripe, a free capsule waiting); an identity colour (a mode, a tip) is a
slim 4 px left edge at most. No dashed borders except an empty drop slot. Nothing loops on a menu except the
title's attract scene; `.calm` and `prefers-reduced-motion` stop the sheet rise too. Text is 13 px or more.

**Components** (ds-css):
- Buttons: `.btn` is the secondary (surface-2, 1.5 px line-strong, `--fs-s` 900); `.btn.pri` the one primary (filled
  accent, white, `--fs-m`, the screen's one glow); `.btn.go` / `.btn.gold` only tint the border and the words;
  `.btn.ghost` for Back, Leave, Skip, Not now, Cancel (no border at rest, a faint fill, `--text-2`). All 48 px tall,
  44 for `.sm`. A toggle is a secondary with a dot (`.dsTog`, `.accTog`, the title sheet's toggles): lime when on.
- `.card`: surface, 1.5 px line, radius 12, padding 12; rarity is a 3 px top stripe (an inset shadow from `--rar`,
  set by `.rr-c/u/r/l`, so `::before` / `::after` stay free for badges and the holo sheen); `.sel` is an info border;
  `.locked` turns its canvas into a silhouette and its words `--text-3`. `.price` / `.dsPrice` is a gold pill.
- `.sheetWrap` (the dim layer, `.show` opens it) + `.sheet` (bottom anchored, radius 18 on top, a 36 x 4 handle,
  max 78 %) + `.sheetHead` (an `h3` or `.shT` and a ghost x) + `.sheetBody` (scrolls). `dsSheet(parent, title,
  onClose)` in game.js builds one ({wrap, body, open(), close()}); its controls are plain taps, never GAME.choose entries.
- The page frame: `.pageHead` (sticky grid: `.phBack` left, `.phTitle` / `h1` centred, `.phEnd` right),
  `.pageBody` (16 px between sections), `.pageDock` (sticky bottom, one primary and at most one ghost). They pull out
  of the `.screen`'s 16 px padding (a sticky box stops at the scroller's padding, so `top` / `bottom` are -16 px), and
  divide that pull by `--accK` under a text size, because the bodies zoom. Give the `#xBody` `.dsPage` so the dock
  sits at the bottom of a short page. Back is ALWAYS top left; Leave on a run stop is the dock's ghost.
- `.tag` (+ `.gold .cyan .pink .lime`), `.dsPill` (a currency pill for `.phEnd`), `.dsSec` (an xs section label),
  `.choice` (a full-width secondary row: `.c1` in `--fs-m`, `.c2` in `--fs-s`).
- Solid backdrops are opt-in per screen (an id selector in the screen's own block: the tests read the
  `class="screen"` markup, so no class is added there).

**The toast lane.** On every menu page (a screen with a `.pageHead` or a `.pageDock`, or a solid `.ds-opaque` one,
plus the Prize Vault: the home pages, the run stops, the albums, the lobbies, win, game over, loop) the toast and the
corner item (a sticker, a discovery) share one lane at the bottom, just above what the dock shows (its note or its
buttons; the vault's capsule bar). One at a time: while a plain toast floats (2.5 s at most) the corner item waits
hidden with its clock paused; in the shop the toast is the keeper's line, so nothing floats and the card keeps the
lane. The lane climbs a row (20 px) at a time only past buttons, and on such a page a heading, the run score
(`.scoreBox`), the page head and the keeper's speech bubble (`.keepBub`) weigh as buttons, so nothing lands on them.
The prize counter's old top toast lane (over its title) gives way to the bottom lane. The title, the map, the fight
and the intro keep their own placement, and headless the tests' measured rects decide as before (`dsLaneY` is 0).
The sticky `.pageHead` offset (-16 px, the scroller's padding) lives in ds-css for every page; `.m3Head` no longer
repeats it (the Duo page keeps its -14 px).

**What changed per screen (the Arcade front).**
- Title: the round 15 structure stays (the big action, the play row, five tiles, the stats line, the sheets). The big
  action is the filled primary (NEW RUN, or CONTINUE with NEW RUN under it as a secondary) and the screen's one glow;
  the breathing loop is gone. Daily and Modes are two calm cards on one surface (only their words carry gold and
  cyan); the five tiles are one look (no per-tile borders, no vault pulse; a free capsule is a gold rim); the badges
  are small accent dots. The stats line is one quiet line with lower-case words, so it fits in Dutch at 360 px.
- The season ribbon over the sky: a slim strip with no pulse and no glow (the event's logo art is the hero).
- The title sheets are `.sheet`s: full width at the bottom, the handle, a ghost x. The Modes rows are choice rows on
  one surface with the mode's colour as a slim left edge (Weekly cyan, Boss Rush red, Duo pink).
- Settings is a `.sheet` (the handle, SETTINGS, a ghost x; Done stays at the end). Sections are quiet groups under
  a hairline. The Sound on / Music on rows repeated the sliders and the More sheet: they show only while that sound
  is off (still registered, so GAME.choose and the tests keep their labels). The sample strip is plain and sits in
  Vision beside the controls it shows: the three numbers and the status chips, the four rarities by name (sized to
  fit Dutch at extra large), one prize with its rim and the outline.
- Character select: three short steps on one page instead of 3.2 screens: (1) a row of seven portraits, the picked
  crawler's card under it; (2) a row of eight claws, the picked claw's demo cabinet, numbers and matchup tags (the
  joke line is gone from view); (3) one Run options row (Tilt, the mutators, the score multiplier) that opens a sheet
  with the Tilt stepper and the mutator grid; START RUN in the dock. The portraits are still the GAME.choose entries in
  DATA order and a choice still starts that crawler's run; a tap on a portrait only picks it, START starts the
  picked one (a locked crawler's card says how to unlock it and START is off). Back is registered last, shown top left.
- Help: the page frame; five short section cards (the rig, fights, statuses, the map, keys), the statuses as a
  two-column list (the icon and the name never wrap; "Gif", "Brand" stay on one line in Dutch).
- Tips: the page frame; the tips met in full (their colour a slim left edge), the rest folded into one
  "N more to find" row; Reset tips is a ghost under the list.
- Fight HUD: tokens only (the aliases), no layout change.
- Dead CSS removed: `.menu .btn{width:280px}`, `.menu .row*`, `#titleMenu .row*` (and their text-size rules),
  `#titleMenu .dwRow* / .vrRow* / .duoRow*`, `#titleMenu .hisTitleBtn / .loreTitleBtn[data-n]::after`, `.tt-sub`,
  `.footer`, `.shopSec`, `.spacer`, `.statusList .kv`, the old `.uiSheet` frame and its keyframes, `accUp`.

## Run stop screens restyled (round 18)

The climb's stops (reward, spare parts, treasure, capsule, shop, prize counter, arcade and pet shop frame, trading
post, boon, Compactor, bin, event, rest, forge, season door, rival, the back room) sit on the ds-css tokens in one
frame with four family looks. The CSS is one block, `<style id="stops-css">` (after qa17-css); the hooks are in
game.js's M2 block (after HOLO): `m2Stop(name, body)`, `m2Dock(body, els)`, `m2Move`, `m2ShopTidy`, `m2Leave`.

- **The frame.** `m2Stop` puts `.m2Stop` and one family class on the screen and makes the body a full-height page
  (`.dsPage`), so the dock sits at the bottom. The title is one size (`--fs-l`), centred, with a short rule in the
  family colour under it. The way out (Leave, Skip, Cancel, Back to the shop, Continue) or the one action (Take it)
  is moved into a `.pageDock` at the bottom of the body by `m2Dock`. Elements move; their `GAME.choose` entries stay
  exactly where they were registered (order and labels unchanged). The rest stop has no way out by design (pick
  one of the choices); the canvas stops (capsule, arcade, boon, sea, rival, secret, Compactor, trade) already
  keep their buttons in a bottom bar.
- **One card.** Reward, shop, forge, bin, Compactor and trade results share `.card` from ds-css: `--surface`, a
  1.5 px border, the rarity as a 3 px top stripe (the old "common / rare" corner word is hidden, the stripe
  follows the colour-blind modes), art at 64 px, the name at 16 and the text at 13 in a grid, the price as a gold
  pill at the bottom. The rare gold pulse and the legendary sheen are gone (they looped on every grid, the Prizedex
  too); the holo foil stays on rare and legendary cards. Evolved cards keep a still glow.
- **Market stall** (`.m2-market`: shop, prize counter, trading post, arcade and pet shop frame): warm, a 2 px gold
  rule under the scene, gold price pills. The shop (`m2ShopTidy`): the gold pill and one line, ITEMS, the five
  items with the relic as the sixth card of the same grid, the reroll lever as one slim row (REROLL THE SHELF and
  its price pill), then SERVICES: the prize counter and the Compactor as two small tiles with Remove and Sell
  under them, and Leave in the dock. The trade offers are one card style (the kind's colour is its label and the
  top stripe); the in-card Trade buttons are gold secondaries, not three glowing primaries. The pet shop's Adopt
  buttons the same.
- **Cozy corner** (`.m2-cozy`: rest, treasure, spare parts, capsule): an amber wash at the top of the backdrop,
  big amber-tinted choice rows (76 px), the primary in amber. The treasure's relic card sits in the middle of the
  page, its rays and the floating icon still (no loops), Take it in the dock. The capsule keeps its round 17
  behaviour, odds and timings; only the prize card goes to the one card look in its tier (the one glow).
- **Workshop** (`.m2-work`: forge, bin, Compactor): steel cards (a cooler gradient and border), ember orange
  (#ff8a3d) as the only accent: the rule under the forge, the press panel's edge, a picked slot, a card under the
  finger, the CRUSH primary. A disabled CRUSH is a plain grey secondary, not muddy pink.
- **Story card** (`.m2-story`: event, boon, season door, rival, secret): the scene on top, the text on one quiet
  panel, the choice rows; the outcome chips are one line of small text with the numbers in their colour (no
  pills). The event title is a calm plaque. The deal cards of the boon draft use the card look (stripe in the
  boon's colour, no wobble on the back). The season door, Gary and the back room keep their own scene colours;
  their result cards go flat with a stripe.
- **A3.4 (Dutch boon).** The canvas marquee ("LATEN WE DEALEN") and the side words shrink to fit their sign
  (render.js boonBack `fitSz`); "TO WIN" reads "EN WIN" in Dutch (DRUK ... EN WIN), which fits beside the chute;
  "Voorjaarsschoonmaak" carries a soft hyphen so the card title wraps as Voorjaars-schoonmaak; the head is 21 px
  in Dutch.
- **Calm.** No looping animation on the stops: the reward capsule slots keep a still glow in their tier (no pulse,
  no shine sweep), the arcade's ready pulse, the trade's haggling pulse, the IT CAME BACK tag and the back room
  title's big entrance scale are toned down or still.
- **Holo cards at rest.** `holoTick` only touches a card while a finger or the pointer is on it (it is drawn once
  in its rest pose), and never a card on a screen that is not shown (`m2HoloShown`, the card's `.screen` is
  cached). Measured (local, 390x844, mutation observer, 2 s windows): shop 600 card style writes a second before,
  0 after; Prizedex 570 to 0; a fight after the shop and the Prizedex 586 to 0 (6 writes a second left, the HUD).
- **Hidden stops let go.** `m2Leave` (called from setScreen) empties the bodies of the solid stops (reward, parts,
  treasure, rest, shop, counter, forge, bin, event) when the player goes back to the map, a fight or the title;
  every builder rebuilds its body when it shows. Shop, bin, forge and rest, then a fight: 664 DOM nodes and 34
  canvases before, 414 and 10 after; the holo live list 20 to 0.
- **ds-opaque.** The solid stops (the same nine) carry `.ds-opaque` on the screen element (set from JS, the static
  markup stays `class="screen"`): nothing of the main canvas shows under them. Note for the canvas skip: the
  shopkeeper, the campfire and the forge (feelDraw) and the event vignette (arcDraw) paint their own DOM canvases
  from inside draw(), so a skip under `.ds-opaque` must keep those two calls running.

## Albums, lobbies and run end restyled (round 18)

The meta pages sit on the ds-css tokens in three family looks. The CSS is one block, `<style id="m3-css">` (the last
block in the head); the hooks are in game.js's M3 block (after VAULT): `m3Page(name, body, opaque)`,
`m3Head(body, back, title, end)`, `m3Dock(body, els, note)`, `m3Fold(label, open, onToggle, cls)`,
`m3Score(name, body, cta, note)`, `m3Leave(from, to)`. Elements move; every `GAME.choose` entry stays exactly where it
was registered (order and labels unchanged), the ids and the `.screen` + `#xBody` markup too.

- **The page head.** Back is top-left on every page (it was a full-width pink bar at the bottom of the Prizedex and
  the sticker board): `m3Head` moves the registered Back into a sticky `.pageHead`, the title sits left beside it
  (`--fs-l`; a title over 13 characters, every Dutch title and every title under a text size goes to 22 to 24 px and
  may wrap to two lines rather than cut), an extra on the right (the Prizedex's Codex). A sticky head sticks at the
  scroller's padding edge, so `.m3Head` carries `top:-16px` (`-14px` on the duo page) to sit on the glass.
- **The dock.** `m3Dock` moves the one primary (and a ghost at most) into a `.pageDock` at the end of the body, with
  an optional caption over it: Play the weekly, Start the rush, Toss the coin, Back to title, Keep playing (with
  Cash out as the ghost and the Endless note as the caption). The dock fades to `--bg` within 14 px so nothing reads
  through it.
- **Album** (`.m3-album`: Prizedex, stickers, Codex, history, the Prize Vault): paper dark (`--paper` #201538) cards
  in uniform grids, a 1.5 px `--line` border, the rarity as a 3 px top stripe (it follows the colour-blind modes),
  no dashed borders anywhere. Locked is a silhouette: the Prizedex cell shows only the dark shape (the "???" name is
  hidden), a locked sticker shows its own icon darkened on blank paper (it was a "?" in a dashed disc), a locked
  Codex chapter or page is the plain surface in `--text-3`, a vault prize you cannot buy is a dim grey thumb. Tabs
  and filters are one segmented row that scrolls sideways (`.m3Seg`, the crawler filter `.m3Scroll`): the Prizedex
  tabs no longer wrap to two rows, the history's three rows of chips are three slim rows, the vault's seven tabs
  (with the season's and the Minis) fit the width with two-line labels (A3.2: "Minis" was cut off; the daily
  capsule now lives in the bottom button, nowhere near the title). The Prizedex cards lost the holo shine (it stays
  on reward and shop cards). NEW badges are one small pink tag, still.
- **Lobby** (`.m3-lobby`: weekly, Boss Rush, Claw School, Duo and the online pages): a hero banner in the mode's
  colour (`--hero`: weekly ice cyan, rush red, school chalk green, duo pink and teal), one list, the primary in the
  dock. The weekly and rush banners are drawn once (they used to repaint 24 times a second). The duo and online
  modes are one list of choice rows (icon left, name, one line, a colour stripe per mode) under a pink and teal
  hero strip. **Duo setup (A3.5)**: 47 buttons on one page are now one row per player (portrait, Player N, the
  name field) with a summary line (crawler, claw, paint) that opens the colours, crawlers, claws and paint
  (`m3Fold`, closed by default, remembered in `S.m3Duo` across the rebuild a pick does, the scroll position kept),
  the mode's options, and Toss the coin in the dock (it floated over the claw chips). Claw School keeps its
  classroom canvas; its locked lessons are solid, dimmed cards.
- **Scoreboard** (`.m3-score`: game over, win, the loop): the title and its one line, the score as the one big
  number (64 px gold, the screen's one glow; NEW BEST slaps once, no pulse), its tags (best, Tilt, Hall of Fame #n),
  then the news only: the Tilt unlock as a slim strip, the daily, weekly and ghost cards, a crawler unlocked. The
  score's breakdown, the stickers of the run, the highlights, the stats table and Share run card fold into one
  **Run details** row (closed). **A3.3**: a sticker that unlocks a vault prize during the run end no longer toasts
  "Unlocked in the Prize Vault" over the Tilt card (`vaultOnSticker` collects it in `S.m3Vlt` while the win or game
  over is up; it is a line in Run details). The loop's CRT is unchanged.
- **Calm.** Nothing loops on these pages: the vault's capsule glow, the daily pill pulse, the rainbow legendary
  border, the NEW pulses, the endless button pulse, the NEW BEST glow and the hero banners are still. The fold's
  chevron turn is off under `.calm` and reduced motion.
- **Hidden pages let go (B3.11).** `m3Leave` (setScreen, next to `m2Leave`) empties the body of the page left
  behind: Prizedex, stickers, Codex, history, vault, weekly, rush menu, game over, win. Every builder rebuilds its
  body when it shows.
- **ds-opaque.** Solid pages carry `.ds-opaque` on the screen element (set from JS): the Prizedex, stickers, Codex,
  history, weekly, rush menu, game over, win, the loop, and the duo page in its menu, setup and online phases (not
  in its canvas phases). The vault, Claw School and the rush screen paint the canvas under their DOM and stay
  see-through. Note for the canvas skip: the Codex page picture (`loreLive`) and the rush gallery (`rushLive`)
  repaint their own DOM canvases from the update loop, not from draw().
- **Dutch.** One new string, "Run details" (Rundetails), in lang_nl2.js's M3 block. Shot at 390 and 360 px.

## Runtime performance (round 19)

The frame, not the download: what a phone pays per frame on the map, in a fight and under the menus. game.js's draw
dispatcher, the toast lane and the HUD; render.js's glow and badge caches. Nothing in the game's logic, timers, audio
or physics changed (update() runs exactly as before; the headless suites stay deterministic).

- **No scene under a solid page.** `drawCovered()` (just above `draw()`) is the one check: the shown screen
  (`#scr-<S.screen>`) carries `.ds-opaque` and `.show`. m2Stop and m3Page own the class (the nine solid run stops,
  the albums, the weekly and rush menus, game over, win, the loop, the duo page in its menu phases); the vault,
  Claw School, the rush screen and every canvas stop never carry it, so they paint as before. Under a solid page
  draw() paints only the DOM canvases it feeds: the event vignette (`arcDraw`) and the shopkeeper, campfire, forge
  and tip card art (`feelDraw`). The Codex picture (`loreLive`) and the rush gallery (`rushLive`) repaint from the
  update loop and are untouched. The main canvas keeps its last frame, unseen; the first frame back on the map or
  the fight is a full paint. Photo mode (painting its frozen scene into a buffer) never skips.
- **Backing store at 2x at most.** `PX_DPR_MAX = 2` (it was 2.5): the canvas buffer follows the device up to 2
  device px per CSS px. A 3x phone (390 px wide) fills 780 x 1387 instead of 975 x 1733 (-36% pixels). The CSS
  size and `stagePoint` (CSS px / `S.scale`) are untouched: a press and drag in the cabinet set the claw's target
  to exactly the stage x at DPR 1, 2 and 3 (driven in Chromium). At DPR 2 and below nothing changes.
- **Glow sprites.** Radii up to 24 share a sprite per 2 px (the claw's strain glow walked 7 to 16 a frame and built a
  canvas for each); past the 1.6 MP budget the least recently drawn sprites go (`glowTrim`, to 75% of it) instead of
  the whole cache, so a fight's working set is never rebuilt mid-fight. Every caller draws a sprite at its own size,
  so a sprite one step larger is the same soft glow.
- **Gradients.** The relic badge (`polBadge`, redrawn while its shine sweeps) builds its ring and disc gradients
  once per tier and size (`polGrad`, a 48-entry cap; a gradient lives in the coordinates it is filled in, so one
  object serves every relic canvas). The season map's vignette (`SEA_VIG`) is rebuilt only when the map area moves.
  The map and the fight now create no gradient per frame.
- **DOM writes on change only.** `feelCorner` (every tick) re-set the corner item's `hi` / `tight` classes: 55 class
  writes a second on the map, 34 in the shop. `rushHud` re-set `#top.rushOn` and the act text on every HUD refresh
  (6 a second in every fight). Both compare first.
- **Dead code.** `coinsTo` (never called). A scan of every `function` name in clawspire/js against clawspire/ and
  tests/ finds no other name referenced once, and the "export-only" list of round 18's audit is in use (aliases:
  `acc.shape`, `sch.steer`, `NET.host` and the like are called by the suites or by game.js). The one-line local
  `clamp` / `lerp` copies in combat, physics, intro, map and render stay: same body, no shared scope to gain.
- **Left alone: the map's ground layer (B3.6).** The water hexes shimmer with time (`terrainHex` reads `st.t`), so
  a cached ground would freeze them; it would also sit on the camera and zoom path. Not worth the risk.

Measured (local, Chromium without a GPU, 390 x 844 mobile emulation at DPR 3 unless noted; `draw()` timed alone,
"raster" forces the pixels with a 1 px read; frames from a 4 to 10 s rAF probe; this box rasters in software, so
absolute frame times are pessimistic, the ratios hold):

| | before | after |
| --- | --- | --- |
| canvas buffer at DPR 3 | 975 x 1733 | 780 x 1387 |
| map: draw() JS / with raster | 2.7 / 44.6 ms | 2.7 / 32.4 ms |
| fight, 3 enemies: draw() with raster | 23.3 ms | 17.3 ms |
| boss fight (hoard): draw() with raster | 24.5 ms | 17.1 ms |
| shop: draw() JS / with raster | 2.6 / 32.1 ms | 0.2 / 0.2 ms (the keeper only) |
| rest / event: with raster | 31.9 / 31.1 ms | 0.3 / 0.1 ms |
| Prizedex / game over: with raster | 27.2 / 2.5 ms | 0 / 0 ms |
| frames, map idle | 19.9 fps (91 of 103 over 33 ms) | 28.2 fps (31 of 144) |
| frames, shop / Prizedex | 23.5 / 27.1 fps, 4.1 s busy in 4 s | 60 / 60 fps, 1.7 / 0.2 s busy in 4 s |
| frames, fight with drops / boss fight | 26.7 / 28.8 fps | 39.6 / 37.8 fps |
| DOM writes a second: map / shop / fight | 61 / 35 / 7 | 1 / 2 / 1 (toasts sliding) |
| canvases built, first claw drop (30 frames) | 15 to 19 | 9 to 10 (0 on later drops) |
| gradients created per frame, map / fight | 1.5 / 0.7 | 0 / 0 |
| heap after 10 fights / after an 80 s fight | 9.8 / 10.6 MB | 9.7 / 10.2 MB |
| DOM nodes, listeners, canvases across 10 fights | flat (about 415, 1097, 7 to 10) | flat (the same) |

Screens: all 47 screenshots (English and Dutch, DPR 2) match the round 18 set: the solid pages pixel for pixel,
the canvas scenes up to their animation phase and the toasts' timing (a second run of the old build differs from
the first by as much). Tests: `perf (round 19)` in the render suite (a solid shop paints only the keeper's canvas,
a page that is not shown never hides the scene, the buffer at DPR 1, 2 and 3) and the glow cache checks (2 px
buckets, a hot sprite survives a flood of colours).

## Lamp economy check (round 19)

Owner of this section: the balance pass. The worry from round 17: the skilled bot's perfect hands land PERFECT on
about half its drops and set off LAMP FEVER over a hundred times a run, and every fever rained a capsule. Does a
human-like player also get far more loot than round 12 meant (about 22 capsules a run, gold on arrival 103 / 419 /
720, "a couple of fights and an elite" for a good relic)?

**Method.** The round 17 bot (`r17new/bal15.mjs`) copied to scratchpad `r19lamp/bal19.mjs`, pointed at a snapshot of
the committed build (`r19lamp/base`; `base_b` is the same with the dial below), the cabinet on (`GAME.cab.force`),
Tilt 0, the Trading Post on. Batches by `r19lamp/cal19.sh`, tables by `r19lamp/agg19.mjs`, raw lines
`r19lamp/cal_{h0,h1,hoff,s0,s1}_w*.jsonl`. Seven crawlers x classic / tri / scoop / twins, seeds from 19000: 112 runs
for each human-like batch, 28 for the skilled bot and for the cabinet-off control. New in the bot: the cabinet's
capsules counted by source (CAPSULE DROP event or FEVER rain, spawned and delivered), every fever (also the ones that
burst on the enemy's turn), PERFECTs a drop.

**The human-like bot (`HUMAN=1`).** The skilled bot's decisions (which prize to go for, the map, the shop, rests), with
four changes:
- No perfect hands: the claw's own physics decides what comes up and what slips (the skilled bot drops its aimed
  prizes into the chute at the release).
- A finger's aim. The stage is 540 px wide; on a 390 CSS px phone (6.1 inch, about 65 mm across) one stage px is about
  0.12 mm, so the PERFECT window (5 px) is about +/-0.6 mm. A drag-then-lift on a phone misses its mark by about 1.5 mm
  (judging the middle of an odd-shaped prize through the claw, the finger rolling as it lifts), so the drop lands at
  the aimed x + a normal error of SD 13 px (`AIMSD`), plus a release overshoot along the drag (the finger still
  sliding when it lifts: a reaction delay of about 60 +/- 30 ms at 80 px/s, about 5 px), and 10% of drops are gross
  misses, 20 to 45 px off (`PMISS`: a misread pile, a hurried or slipped finger). Measured: 13.3 px mean error.
- It goes for a cabinet capsule lying in the pile when the capsule beats the best prize (`CAPV` 10); the skilled bot
  never aimed at one.
- It takes an act's first elite after two normal fights (the owner's "a couple of fights and an elite"); the skilled
  bot takes one at once when healthy.

**PERFECT is mostly the pile, not the aim.** With that aim the bot lands PERFECT on 34% of its drops, not the 10 to 20%
a decent player would earn by aim alone (P(error within 5 px) at SD 13 is about 30%, times the 70% the claw comes up
with a dead-centre prize: about 21%). The window takes the topmost prize under the hub, whichever it is, and in a full
pile one usually sits within 5 px: a probe run with no aim error landed 53%, one with SD 40 px still 36%. The twins
never PERFECT (not in `perfTypes`), so on the classic, tri and scoop a human gets about 40%. It hardly matters for
the lamp: a PERFECT is one star, a delivery one to three.

### Before and after (the dial: a FEVER rains coins, no capsule)

| human-like bot, cabinet on, Tilt 0 | before (112 runs) | after (112 runs) | cabinet off (28 runs) |
| --- | --- | --- | --- |
| win | 2% | 3% | 0% |
| deaths act 1 / 2 / 3 | 92 / 15 / 3 | 97 / 11 / 1 | 26 / 2 / 0 |
| fights a run | 9.5 | 8.3 | 7.0 |
| prizes a drop / PERFECT of drops | 1.67 / 34% | 1.67 / 34% | 1.52 / - |
| LAMP FEVER a fight / a run | 3.7 / 35.4 | 3.7 / 30.7 | - |
| capsules opened a run (a fight) | 18.9 (1.99) | 7.7 (0.93) | 4.5 (0.63) |
| from rewards and the map | 7.0 (0.74) | 6.2 (0.75) | 4.5 (0.63) |
| from CAPSULE DROP events | 0.6 | 1.5 | - |
| from the FEVER rain (spawned / delivered) | 11.3 (17.6 / 12.6) | 0 | - |
| capsules opened by the start of act 2 / 3 | 28.9 / 62.8 | 14.0 / 29.0 | 12.0 / - |
| gold on arrival, act 1 / 2 / 3 (runs that got there) | 105 / 494 (20) / 960 (5) | 105 / 530 (15) / 1121 (4) | 105 / 427 (2) / - |
| relics at the start of act 1 / 2 / 3 | 1.6 / 9.2 / 19.6 | 1.6 / 9.3 / 16.5 | 1.5 / 8.0 / - |
| capsule tiers c / u / r / l | 43 / 35 / 18 / 4% | 41 / 37 / 19 / 3% | 34 / 42 / 18 / 6% |
| relics from capsules a run (rare or better) | 2.71 (0.49) | 1.90 (0.29) | 1.46 (0.14) |

| skilled bot (`PRO=2`), cabinet on, Tilt 0 | round 12 target | round 16, cabinet off (126 runs) | before (28 runs) | after (28 runs) |
| --- | --- | --- | --- | --- |
| win | 31% | 30% | 32% | 32% |
| deaths act 1 / 2 / 3 | 12 / 16 / 5 (of 48) | 16 / 51 / 20 | 1 / 8 / 10 | 3 / 10 / 6 |
| prizes a drop / PERFECT of drops | 3.4 / - | 3.1 / - | 3.15 / 52% | 3.20 / 54% |
| LAMP FEVER a fight / a run | - | - | 4.3 / 129 | 4.6 / 138 |
| capsules opened a run (a fight) | 21.7 | 22.7 (0.83) | 48.5 (1.61) | 26.3 (0.88) |
| from rewards and the map / events / the FEVER rain | 21.7 / - / - | 22.7 / - / - | 24.7 / 0.7 / 23.1 | 25.1 / 1.2 / 0 |
| capsules opened by the start of act 2 / 3 | | 11.7 / 24.2 | 20.5 / 42.6 | 12.3 / 25.2 |
| gold on arrival, act 1 / 2 / 3 | 103 / 419 / 720 | 103 / 423 / 596 | 105 / 500 / 834 | 105 / 476 / 769 |
| relics at the start of act 1 / 2 / 3 | 1.6 / 9.0 / 16.9 | 1.6 / 8.3 / 16.6 | 1.5 / 8.7 / 16.0 | 1.5 / 8.8 / 16.9 |
| capsule tiers c / u / r / l | 40 / 33 / 21 / 6% | 39 / 35 / 21 / 5% | 43 / 35 / 20 / 3% | 42 / 33 / 20 / 5% |
| a won run ends with | 23.9 relics, 1128 gold | 24.6 relics, 718 gold | 24.0 relics, 69 capsules, 1412 gold | 23.4 relics, 38 capsules, 1396 gold |

(Round 17's skilled numbers on its own build: 56.5 capsules a run, 1.82 a fight, gold 105 / 563 / 1019.)

**What it showed.** Every player sets off FEVER three to five times a fight: a weaker hand brings up fewer prizes a
drop but takes more drops a fight, so the lamp fills about as fast. The fight's cabinet capsule cap (`capMax` 2) was
the only limit, and the FEVER rain filled it almost every fight, for the human-like bot as much as for the skilled
one: 1.25 cabinet capsules a fight on top of 0.74 from the rewards, 2.4 times the round 12 rate, and 29 capsules by
act 2 instead of 12. The win rate was never the problem: the human-like bot wins 2 to 3% and dies in act 1 (the
Prize Mimic, the Plushie Queen, the Carnival Barker), with or without the dial.

**Why this dial.** `capMax` 2 -> 1 would still pay a capsule nearly every fight (fevers come 3 to 5 a fight); fewer
stars per prize or more cells would need about 100 cells to make fevers rare enough, and the tube draws 12. Turning
the rain's capsule off leaves the FEVER show whole (the beacon, the burst, the fanfare, 5 coins, Lamp Oil, Fever
Dream, The Motherboard) and the CAPSULE DROP event as the cabinet's capsule (0.1 to 0.2 a fight, a prize you must
deliver). After it, both bots open about the round 12 count a fight (0.93 and 0.88 against 0.83), the skilled bot 26
a run and 12 by act 2, and its win rate does not move (32%).

| dial | where | old | new |
| --- | --- | --- | --- |
| capsules in a LAMP FEVER's rain | `game.js` `CABK.rainCaps` (`GAME.cab.K`) | 1 | 0 |

### What is left for the owner

- **Gold is still a little above round 12** (skilled: 476 / 769 on arrival at acts 2 / 3 against 419 / 720), the
  cabinet's coins (Coin Showers and 5 a fever, about 15 a fight on offer). The next dial is `rainCoins` (5) or
  `coinN` (6); it was left alone so a single change could be measured.
- **The PERFECT window is loose in a full pile** (34% for a human, 36% even with a 40 px aim error). If PERFECT should
  reward aim, `cabUnderPalm` could ask for the prize the player aimed at, or `perfX` could shrink; both are feel, not
  economy.
- **A human-like hand loses almost every run in act 1** (2 to 3%; the round 12 weaker bot won 8%). The round 12 target
  (a skilled player loses about 70%) holds for the skilled bot (32% wins); how far below that a real phone player
  lands is worth a playtest, since the bot picks its drop spot more crudely than a person does.
- **The cabinet keeps a weaker player alive a little longer** (7.0 fights a run with it off, 8.3 with it on after the
  dial): the coins and the surge help without the capsules.
- Tests: the game suite's lamp test now pins the rain to `rainCaps` (0 capsules) and checks the rain's capsule path
  with the dial at 1 in a fresh fight (one capsule, counted against the fight's cap).

## Title screen art (round 20)

The attract scene behind the title menu was a stack of flat boxes with coloured slots, a big flat claw, a plain
gradient and 36 tiny falling prizes, with the logo sitting across the tower. It is now one calm, illustrated picture
in the round 18 palette (calmer neon, pink accent, gold reward, teal info). Only the canvas art and the logo changed;
the DOM menu, its buttons, labels, ids and order are untouched (`render.js` TITLE block, `title()`).

**Composition (stage 540 x 960, the same at 390 x 844, 360 x 780 and 540 x 960: the stage always fits by width).**
- The logo sits high in the sky: its centre at 150 (178 under a season's ribbon and banner), never lower than the
  round 9 layout allows (`Q9_TL.ly` is still the lowest it may go; a tall menu lifts it higher). `RENDER.q9.title.logoY(h,
  sea)` gives the drawn place; the hidden event preview zone (`#seaLogo`) follows it.
- The hero: the Clawspire, a pyramid of claw machine cabinets (three, two, one) on a glossy floor at y 648, just
  above the menu's first button (677). Each cabinet has a bevelled body lit from the upper left, a lit marquee with an
  emblem (heart, star, little claw) and five bulbs, a glass box with a lamp, a little claw and a pile of glowing plush
  prizes, chrome trim, a diagonal reflection, the control ledge (a stick and a button) and a coin door with a lit
  slot. Each row casts a soft shadow on the roof below. On top: a gold marquee plinth, a chrome spire with two pink
  rings and the star prize, whose glow is the scene's one focal light.
- The claw: chrome, with a friendly visor face (two teal eyes that blink every 4.7 s, brow LEDs) and two chunky hooked
  prongs with pink rubber tips, on a cable from above the logo (it passes behind the logo and the subtitle). It sways a
  little and every 11 s dips, closes on the star, tugs and lets go. `ttGeo` scales the tower and the claw (0.75 to 1)
  so the claw's head always hangs under the subtitle capsule.
- Atmosphere: a violet dusk sky with faint nebulae and stars, five soft light rays fanning down over the tower, a far
  hazy city and a nearer, darker one (stepped roofs, antennas, sparse lit windows, a pink heart and a teal claw neon
  sign at the edges), a horizon haze, a halo behind the tower, a faint perspective grid on the floor, the tower's
  reflection fading into the floor, a pink and gold pool of light under it, and a vignette. Eight soft bokeh lights and
  five floating prizes (heart, potion, gem, coin, clover) drift slowly at the sides. The floor darkens toward the
  bottom, so the menu needs no box: `#titleMenu{background:none}` (it had a dark gradient panel with visible edges).
- The logo: chunky candy lettering: a dark drop shadow and a soft pink halo, an ink outline round an extruded body
  (two magentas), a teal rim light along the lower edge, a pink candy face with a hard white gloss band over the upper
  half and a shine on every letter, two sparkles. A sheen sweeps the letters every 7.5 s (1.4 s long). The subtitle
  ("a claw machine roguelike", translated) sits in a dark capsule with a teal edge and two gold pips. The word still
  fits the stage the round 7 way (`Q9_FIT`), the outer stroke at most `fs * 0.3`.

**Calm.** Shake off (`fx.reduced`, which also sets `html.calm`) or `prefers-reduced-motion`: the claw hangs still at
rest, the prizes and bokeh hold, no sheen, no blink, no glint, the marquees keep a steady glow; only the star's glow
breathes. Colour-blind modes: the scene is decoration (no signal colours); the logo reads by its ink outline and the
white gloss in every mode.

**Seasons.** The season decor follows the new layout (`ttGeoAt`): Claw-o-ween's moon sits in the sky right of the
tower (behind the city), bats circle the spire, jack-o'-lanterns stand on three bare ledges of the tower and on the
floor at both sides, fog rolls along the floor, cobwebs and the spider in the top corners, the dripping banner over the
logo; the dusk tint now fades out at its foot (it ended in a hard line over the city). Winter: the aurora sits behind
the tower, snow caps on the tower's ledges and the floor line, the frost corners, the garland just under the ribbon,
the Santa hat cocked on the claw's head (it follows the sway and the dip, drawn under the subtitle), the banner with
icicles, holly, the snowman and the pine.

**Performance.** Everything still (sky, nebulae, stars, rays, city, floor, grid, reflection, tower, a season's tint
and still decor, vignette) is painted once into one opaque layer at the exact device scale and blitted 1:1
(`ttBack`, `ttBlit`: a pixel-aligned copy costs about a tenth of a scaled one in a software raster, 0.4 against 3.7 ms
for the full screen here); it is rebuilt only on a new layout, device scale or season. The logo and subtitle are a
second such layer (`Q9_LOGO`, keyed by size, place, scale and language); the sheen cuts a slanted band by a mask of
the letters on a scratch canvas, three blits while it runs. The claw head (open and blinking), the prong, the star and
the bokeh are small cached sprites (`ttSpr`, at most 48); the prizes keep the round 9 sprites. The season's still
parts are baked into the layer (`Q9_TL.baked`; the game sets `Q9_TL.sea` around the title draw), so the season
overlays no longer fill a full-screen gradient every frame. No shadowBlur, filter or gradient per frame. Headless (no
real canvas, the tests' stub) the same painters draw live.

Measured (local Chromium, no GPU, 390 x 844 at DPR 3, buffer 780 x 1387; `draw()` with a 1 px readback to force the
raster, median; 4 s rAF probe; `scratchpad/r20title/bench.mjs`):

| title | before | after |
| --- | --- | --- |
| plain: draw() JS / with raster | 0.4 / 6.2 ms | 0.8 / 3.0 ms |
| Claw-o-ween: with raster, frames over 33 ms in 4 s | 14.3 ms, 24 | 7.4 ms, 0 |
| Winter: with raster, frames over 33 ms in 4 s | 15.8 ms, 24 | 7.0 ms, 0 |
| calm: with raster | 6.1 ms | 2.7 ms |
| canvas calls a frame (plain): fill / stroke / drawImage | 59 / 55 / 38 | 1 / 3 / 28 |

Tests: `title art (round 20)` in the render suite (the logo's place and bounds, the claw clears the subtitle for every
logo place and size, the tower stands on the floor above the menu, six ledges, the same frame draws the same, the
scene moves, calm holds still). The round 7 logo fit test and the round 9 layout tests pass unchanged.

## The resolve row (round 21)

The owner, after a playtest: "I cannot clearly see the damage that is going... you can grab some shields and stuff
and then suddenly there's like a lot of damage happening and you have no clue where it comes from." He asked for the
prizes to stack up side by side first, then go "da da da da" one by one, with a speed up button. This round does
exactly that. Only WHEN things show changes; what happens (and in which order) is the same as before.

**What the player sees.**
- A shelf (the resolve row) between the arena and the cabinet: stage x 8..532, y 339..385, over the player row and
  the cabinet's top edge, under the enemies' feet, hp bars and intents. While it is up, the player row's statuses and
  the GRABS pill fade out (`#playerRow.rrOn`), a banner (JACKPOT, TURN OVER) rises over the arena instead of covering
  it, and your own numbers and relic badges (`PLAYER_FX`) pop under the HP stat instead of on the shelf.
- Every prize the chute takes flies (an arc) onto the next slot, left to right in delivery order. A slot shows the
  item's art, a chip of what it will do in this fight (`COMBAT.previewDamage` for the hit, so Strength, Weak,
  Vulnerable, Armor and the relic rules count; Block and healing through the relic rules with `COMBAT.fxNow`; the
  first status as a status pip; `ALL` for an all-enemies item; THAW for a frozen one) and its name. The chip refreshes
  every 0.1 s while it waits (tapping another enemy retargets the rest, as before).
- When the claw is home and holds nothing, the row resolves left to right: the head lifts and glows gold (a rising
  tick), flies to its target (an enemy, the pack for all / random, the HP stat for Block and healing), COMBAT.play
  runs on the landing, the enemy's bar and your Block move with that hit, and the slot pops what it really did (the
  hit before the enemy's Block, the Block, the healing, the status; a grey 0 when it did nothing, like a heal at full
  hp). A relic that joined in on that play rides on the slot ("🐍 Venom Gland", with its number). Then the next one.
  About 0.45 s an item at 1x; played slots shrink so what is still to come keeps the room.
- Then the grab-level effects arrive as labelled chips at the end of the row, one per source, each played on its
  own beat (0.4 s at 1x): named combos ("Combo: Scrap Storm" and its hit), relic procs from onJackpot / onGrab ("🔔
  Jackpot Bell 5 ALL", "🎫 Prize Counter +6"), Luck's cash out (LUCK, CASH OUT or JACKPOT PAYOUT), pet procs, the
  bubbles' pop, a near miss's Luck. A proc the cabinet sets off while the claw is still out (a PERFECT relic, LAMP
  FEVER, a cabinet event) gets its own chip in the row at that moment, already played: every number on screen has a
  source on the shelf.
- The shelf holds 0.9 s after the last chip, then fades (at once when the enemy turn starts).
- **Speed**: a pill in the fight's control row next to the camera, `1x` / `2x` / `4x` (a plain tap, never a
  GAME.choose entry; `#rrSpeed`). It scales the lift, the toss, the fly-in, the beats and the chip beat. Saved as
  `meta.settings.rowSpd` inside `clawspire_meta` (no new key; a new profile has none and plays at 1x).
- **Skip**: a tap on the shelf (or the glass) while it resolves plays the rest at once (a white flash; no toss, no
  beat), the grab chips too. The hint says "tap the row to skip" while a row resolves (not at 4x).
- **Calm** (Shake off, reduced motion): a shorter lift (0.05 s), toss (0.14 s) and fly-in (0.18 s), a lower arc, no
  sway, no pop scale; the row adds no shake anywhere.

**How it works** (game.js RROW block after `/QA17`, `rrRow*`; render.js RROW block after `/TECH`, `RENDER.rrRow`).
- The old pipe is kept: `deliver` still pushes the instance on `FS.playQ`, `throwItem` still makes the throw,
  `playInst` still calls `COMBAT.play` on its landing and queues its events, `grabFinished` still runs the grab hooks
  and `COMBAT.grabDone`. The row adds a gate and a slot: `rrRowPush` (deliver) makes the slot, `rrRowFly`
  (top of throwItem) sends a delivered prize to its slot instead of its target, `rrRowGate` keeps the playQ waiting
  while the grab is in flight until the row's `go` latch (the grab completion test without the playQ / queue part:
  rig idle and home, the release hold over, nothing held), `rrRowHeld` keeps the head waiting until it lifted and was
  tossed (`rrRowToss` calls the old throwItem from the slot, then sets the arc, the target and the duration),
  `rrRowPlayed` (playInst, after enqueue) marks the play's queue entries and fills the slot's numbers and its relics.
  Grab completion still needs an empty playQ and queue, so `grabFinished` (and `grabDone`) can only come after the
  last prize played; `rrRowGrab(q0)` (grabFinished) groups what it queued into chips (a `combo`, a `proc` or a Luck
  `cash` event opens a group; a group with no source and no number rides with the next) and marks each group's first
  and last entry. The queue loop calls `rrRowEv` (a chip lights up, settles; a mid-grab proc's live chip) and
  `rrRowBeat` (the row's beat, scaled by the speed, 0 after a skip; entries without a row mark keep their beat).
- **COMBAT** (two lines): `hook()` stamps `src` (the relic or set id) on every event a relic hook emits (not on the
  proc events, whose `src` stays the kind), so a play's relic numbers are credited to the relic, not the item; and
  `COMBAT.fxNow(F, def, plus)` is the item's effect list as this fight's relic rules scale it.
- **The enemy turn waits**: END TURN needs an empty playQ and queue (as before) and the grab is in flight until the
  last item played; the chips are queue entries. `canSteer` now also waits for an empty playQ, so a stray prize (one
  a shake dropped down the chute outside a grab) resolves before the next drop can start.
- **The watchdog** counts from the row's last step while it resolves (`FS.dropAt` follows `R.prog`), and if a reset
  rig still ends a grab early, `rrRowFlush` plays what is left on the row first, so grabDone never jumps ahead.
- **The fight ends mid row**: as today, the plays after the last kill do nothing (`playInst` returns when the fight
  is over; the unplayed prizes stay in `F.bin` without a body, as before); their slots go grey at once (`void`, 0.02 s each) and
  the grab completes, `grabDone` and `afterAction` run as before and the outro follows.
- **The incoming-damage preview** never shows a number that leaves out a prize still waiting: it is computed only
  with an empty playQ (as it already was only with an empty queue), so it is off while the row waits or resolves and
  comes back exact (it read 21 blocked after a row of shields in the shots).
- **Headless** (the suites): the same code and order; no lift, no fly-in, the old throw time (0.3 s) and the old
  beats, so the old timings hold. `GAME.row.off = true` is the old immediate path (the tests' yardstick).

**What stays at delivery, what waits, and why.** The physics cannot wait: the body leaves the cabinet when it
delivers, so everything the cabinet and the claw do stays at delivery. Only the combat resolution (`COMBAT.play`
and what follows from it) waits.
- At delivery (unchanged): the body removed; `FS.delivered` and the run's count; DOUBLE and JACKPOT (the party
  lights, the marquee, the banner, the sticker counts; their only rules are onJackpot / onGrab, which were always at
  grabDone); the golden prize's fanfare (and its gold); the free prize; the Jackpot Lamp's cells (cabDeliver,
  techDeliver, so LAMP FEVER and its capsule fall when they did); the pet (hearts, XP, the firefly's spotlight gold and
  Frost Light's mark, which must be on the instance before it plays); a popped bubble's prize marked for the bubble
  payout; the boss arena's iced rail, the live rail's ground, a wet prize's zap; a lit bomb's fuse put out, ice
  frozen in the used pile; the online stream's prize fx (`duoNetDeliver`, so the watching phone sees it at once);
  the tutorial's coach step; an **evolution** (COMBAT.evolve changes the instance in place at delivery, the ceremony
  holds the fight, and evoEnd's throw now flies to the row: its slot is made at delivery, so the order holds).
- Waiting on the row: `COMBAT.play` and everything it does (damage, Block, healing, statuses, extra grabs from an
  item, bin events such as junk, copies, purges, a bounce back into the cabinet or the Black Hole, the bodies they
  spawn), the tray chip, the item's sounds and numbers. Bin events from a play spawn their bodies when the play
  happens, after the claw is home, so they can no longer fall into the same grab's chute mid carry (a body the row's
  plays put in the chute while the row resolves is still delivered and joins the end of the row, as the chute is
  watched until the grab completes).
- Mid-grab cabinet procs (PERFECT, LAMP FEVER, a cabinet event, a material's relic, a bomb going off in the bin,
  the live rail, a jelly's sting) keep their physical moment: COMBAT acted then, so they are shown then (with a live
  chip when a relic or a combo did it).

**Same results.** For the same seed and the same deliveries the plays happen in delivery order, then grabDone,
exactly as before (the bin each play sees is the same: the prizes after it are still in it in both paths, and
F.rng is drawn in the same order). The test drives two fights on the same seed, one through the row and one with
`GAME.row.off`, through four grabs of three prizes (with Jackpot Bell, Prize Counter and Venom Gland) and an enemy
turn: the same plays in the same order with grabDone in the same places, the same hp, Block, statuses, piles and stats.
What can differ is the physics around them: a play's bin events now land after the carry instead of during it, and a
cabinet proc that used to land between two plays now lands before both; neither was fixed timing before (a prize's
throw took 0.3 s, so the interleaving always depended on the frame).

**Duo.** Co-op (local and online) and the seat fights use this flow unchanged: the active phone's row resolves
before its END TURN, so the turn it sends (foes, seats) is the one it showed; the watching phone keeps its simple
picture (the prize flying to the partner's corner at delivery). The claw-off (versus) never uses `deliver`.

**Code, API, tests.** game.js RROW block (`RRW` dials, `rrRow*`, `RROW_API` as `GAME.row = {K, on, speed, cycle,
skip, tap, pending, nums, dur, draw, state, off}`) and one-line hooks in `throwItem`, `deliver`, `playInst`,
`grabFinished`, `canSteer`, `updateFight` (the tick, the playQ gate, the queue's beat), `qaThreatTick`, `pointer`,
`drawFight`. render.js RROW block (`rrRowPaint` as `RENDER.rrRow`, `rrRowSlot`, `rrRowIn`, `rrRowChips`,
`rrRowIcon`, `rrRowFit`). combat.js: the `src` stamp in `hook()`, `api.fxNow`. index.html `<style id="rrow-css">`.
Dutch in lang_nl2.js (the RROW block). Tests (game suite, `rrow:`): a real grab fills the row and nothing plays
until the claw is home; delivery order then grabDone with every number equal to the old path; a relic on an item's
slot, the grab chips labelled at the end and played one by one in grabDone's order; the speed pill and its save (no
new key, a reload keeps it, 2x and 4x durations); a tap skips (7 frames instead of 130 for four prizes, the same
result); the enemy turn waits for the whole row; the last enemy dying mid row ends as the old path does; the row
drawn in every state and calm, junk input. The juice and evolution tests now expect the row (one throw at a time,
the evolved item lands on the row first). Net suite: a prize played from the row before the online turn passes, both
phones agree on the boss and both seats. Screenshots (390x844, English and Dutch): scratchpad `r21row/`
(`r21_1_row_filling` to `r21_7_speed_2x`, `shots.mjs`).

**Known limits.** A very big scoop (past about ten prizes) squeezes the slots until they overlap; the names hide
first (under 84 px a slot shows its art and number only). The tray chips in the control bar still show the last two
plays.

## Quality bar (Game of the Year, mobile)

- Every action has feedback: sound + motion + number. Screen shake on big hits (respect the
  reduced-shake setting). Floating numbers. Hit flash. Item glow in the chute. Jackpot banner.
- Nothing ever soft-locks: every screen has a way forward, every promise (a button, a hint)
  is true. Grabs cannot get stuck: a rig phase has a max duration and auto-advances.
- Text is readable at 360px wide: minimum 12px logical at scale 1, real sentences, no walls.
- 60 fps on a mid phone: physics ≤ 40 bodies, no per-frame allocations in hot loops, canvas
  cleared once, no shadowBlur in loops (draw glows as radial gradients cached once).

## Combo relics and a gentler, clearer start (round 21)

The owner playtested: the first fight was a blur of combo damage he never chose, the enemy died at once, nothing
hurt, and he could not tell what his items did. He wants combos to be an exclusive relic power earned later (an
elite), the starting sword and shield weaker, the first fights a real threat, and the Compactor's merge to work a
second time. He tunes by playing, not by bot runs; the numbers below are sensible starting points.

### Audit: automatic extra damage and Block a new player gets in act 1

| source | what it did | round 21 |
| --- | --- | --- |
| named grab combos (`DATA.combosFor`, `COMBAT.grabDone` / `fireCombo`) | up to three bonus moves a grab (a Knight's three swords: Armory 16, Three of a Kind 10 to ALL, Magnetized 5 to ALL) | **relic only** (below) |
| Bubble Combo (`COMBAT.rosPop`, 2+ bubbles popped in one grab) | n x 4 to ALL | **relic only**: a Party combo; Ms. Bubbles starts with the Party Popper |
| combo boosters (Encore Machine `comboTwice`, Tuning Fork, Ticket Roll, The Crowd `onCombo`, Squeaky Toy `bub.combo`) | fed the combos | out of every random pool until the run owns a combo relic (`DATA.crPoolOk`) |
| Jackpot Fever mutator, Frequent Player set bonus, evolved auras with `onCombo` | combos twice / per combo | kept: opt-in content; with no combo relic they simply have nothing to feed |
| DOUBLE / JACKPOT (2 / 3+ items a grab) | tickets, lamp cells, the payout; damage only through relics (`onJackpot`) | kept: no damage of their own |
| Luck and its cash out | Lucky Lou's gift (whiffs fill it, a 2+ grab cashes it) and the Rabbit's Foot | kept: his visible kit (the meter shows) |
| grab streak | read only by `dmgPer streak` items and relics | kept: nothing automatic |
| materials (a lit bomb's blast, cracked glass +50%) | a bomb in the bin blows (3 to ALL in act 1); cracked glass plays +50% then breaks | kept: both are shown on the item as it happens (FUSE LIT, the crack) |
| Golden Prize (40% of fights, one item upgraded for the fight) | +1 level on one item | kept: it shimmers gold and says GOLDEN PRIZE; a +2 item is never lowered by it |
| pet procs, crawler gifts (turret, bubbles, luck, tech), starter relics | per crawler | kept: each is its crawler's or its pet's named, explained kit (the Squire's Gauntlet's 5 Block at the bell included) |
| Cabinet Tech / cabinet events (surge, coin shower, capsule drop, LAMP FEVER, PERFECT) | grip, gold, loot | kept: no damage without a Tech relic the player picked |
| evolutions | an evolved item's aura | kept: earned (a +1 item and its relic) |

### Combos are a relic power (`DATA.CR`, combat.js `crFam` / `crOn`, game.js CR block)

A grab fires no named combo, and no Bubble Combo, unless the run holds a combo relic. Every recipe has a family
(`COMBOS[id].cr`, a test pins that none is left out); a relic's `combo` field names the family it switches on, or
`'all'`. `COMBAT.newFight` reads the families into `F.cr = {all, fam: {family: relic id}}` (a fight without it,
from before round 21, builds it on first use); `grabDone` passes `ctx.on` to `DATA.combosFor`, which drops the
recipes that are off before it picks the best per family and fills the three slots, and `fireCombo` refuses one
that is off. A combo that fires flashes the relic that switched it on (its proc), so the player sees where the power
comes from.

| family | relic (rarity) | recipes |
| --- | --- | --- |
| Steel ⚔ | Weapon Rack (u) | Crossed Blades, Shield Wall, Heavy Hitters, Sharp Edges, Scrap Shot, Magnetized, Landslide, Armory, Iron Curtain |
| Brew ⚗ | Mixing Spoon (u) | Steam Burst, Toxic Fumes, Frostbite, Molotov, Resonance, Chandelier Crash, Elemental Storm, Bad Medicine |
| Feast 🍗 | Picnic Basket (u) | Picnic, Banquet, Hot Lunch |
| Jackpot 🎰 | Magician's Hat (u) | Pocket Change, Pay Day, Handful, Hat Trick, Three of a Kind, Mega Jackpot |
| Casino 🃏 | Dealer's Visor (u) | Double Dice, Poker Night, Two Pair, Full House, Royal Flush, Dead Man's Hand, Midas Touch, Lucky Seven |
| Tech 🕹 | Cheat Code (u) | Coin-Op, Short Circuit, Bullseye |
| Party 🎉 | Party Popper (u) | Fetch!, Nest Egg, Legend Rising, Twin Legends, and the Bubble Combo |
| all | The Strategy Guide (r) | every family |

**Where they come from.** The run's first elite (a tower keeper counts) leaves a pick of three family relics
(`DATA.crOffer`, leaning to the families the bin and relics invest in, never one owned; its own rng stream
`crpick`, so every other reward roll stays put). It shows after the reward (`afterReward` hands over to the
treasure screen with `td.crRw`, the reward, so a reload resumes the pick and then the reward's own way on: a tower's
prize, an event's next step, the map); Skip is allowed. `run.crPick` marks the offer, once a run. After that,
combo relics sit in the random pools at their rarity (in act 2 and up anyway); combo boosters join the pools once a
combo relic is held. Lucky Lou starts with the Dealer's Visor (his dice, chips and cards are the Casino table) and
Ms. Bubbles with the Party Popper (her Bubble Combo); Joy Stick's kit is the cabinet, not Coin-Op, so she starts
with none.

**Old saves.** A run saved mid act with combos firing loads as it was; its combos stop until it holds a combo
relic, and since it has no `crPick` its next elite offers the pick. A fight from before round 21 builds `F.cr` on
first use. No key was renamed.

**Text.** How it works has a Combos section (and the Compactor's ++), the Prizedex's combos tab says combos are a
relic power and every recipe card names its relic ("Combo relic: Weapon Rack."), the combo tip card says "Your combo
relic at work", and the Compactor's shop slot and rest choice mention ++. Relic art: each combo relic draws its own
glyph on the medallion (render.js CR block: crossed swords on a rack, a bubbling cauldron, a picnic basket, a top hat
with stars, a fan of cards under a visor, a cartridge with up up down down, a party popper, a red strategy guide).

### Weaker starters, threatening first fights

The starting items lose about a quarter to a third of their number; their plus copy keeps its old number, so the
first upgrade is a bigger step than before. Pip's shiv and boot stay (his bare bin was already at 1 to 2% against the
crab and the band in the balance suite; a cut made those walls; he unlocks after a win, never a first run's crawler).

| item | was | now (plus) |
| --- | --- | --- |
| Rusty Sword | 7 | 5 (10) |
| Dented Shield | 5 Block | 4 (8) |
| Toxic Vial | 1 + 2 Poison | 1 + 1 Poison (2 + 4) |
| Bubble Flask | 4 Block | 3 (7) |
| Bone Dice | 2 to 8 | 1 to 6 (4 to 10) |
| Poker Chip | 4 Block | 3 (6) |
| Hex Bolt | 4 | 3 (6) |
| Tin Plate | 5 Block | 4 (7) |
| Rubber Duck | 4 | 3 (6) |
| Soap Bar | 5 Block | 4 (7) |
| Arcade Stick | 4 | 3 (6) |
| Arcade Button | 5 Block | 4 (7) |

The Bubble Flask, Old Boot and Poker Chip keep their Fortress chip by name (`kw`), since 3 Block no longer reads as a
Block item by the numbers.

`DATA.DIFFICULTY.act1 = {hp: 1.15, dmg: 1.1, first: {hp: 0.85, dmg: 0.85}}` (combat.js `crAct1Mul`): act 1 normals
fought in act 1 take x1.15 hp and hit x1.1 on top of the dial; never a minion, an elite or a boss, never after the
Endless reboot, and an act 1 normal pulled into a later act reads nothing. The run's very first fight (`F.fights`
0) reads `first`: with no combos and a weaker bin it already lasts several grabs, so its enemies are a little
lighter, and it is the one fight a bare starting bin meets. The Brass Golem (act 2) bites back for 1 Thorn, not 2:
with the lighter starter swords it was the one wall the balance suite found for a Knight deck.

### The Compactor's second merge: plus 2 (`DATA.CMP2`, `cmpRule`)

An instance's `plus` is `false`, `true` (+1) or `2` (+2). Three of the same item come out one level above the
lowest of them: three plain ones the plus copy (as before), three upgraded ones (+1 or +2, not all +2) the plus 2
copy; three +2 copies, or an item with no +2, climb a rarity as before. The +2 numbers are derived, never typed
(`DATA.CMP2.fx`, cached per def): every number that moved from the base to the plus moves on by 3/4 of that step
(at least 1; a cost or a drawback keeps falling but never changes sign), random rolls move both ends, and an item
whose upgrade moved no number gets +1 on its first helpful one (the Philosopher's Stone has none). A Rusty Sword is 5,
10, 14.

Where it shows: `COMBAT` keeps the 2 (`cmp2Plus`: the bin copy, eat, copy, play) and plays `cmp2FxAt`; `itemText`,
`itemName` ("Rusty Sword++", the Dutch "Roestig Zwaard++" through the usual "+" peel), the card's PLUS 2 badge (pink),
the item art (a pink star in front of the gold one and a pink rim; its own sprite cache key), the bin (+1 and +2 are
their own groups; the popover lists the Plus 2 text), the Compactor (its grid tags what three copies make: "x3 = +",
"x3 = ++", or "1/3 for ++"; the rule line "Three upgraded: out comes Rusty Sword++, stronger again."), the shop's
sell price (a +2 sells for double), the run history ("id++"), co-op's belly sync, the cracked glass bonus and the
Golden Prize (which never lowers a +2). The forge and the rests still upgrade plain items only; trading values a +2
like a +1. Saves keep the number as it is.

**Tests.** data (families cover every recipe, one relic each plus The Strategy Guide, `crOn` and `ctx.on`, boosters
and `crPoolOk`, `crOffer` (three, distinct, not owned, leaning to the deck), the starter cuts and their plus numbers,
the act 1 dial, the Golem; plus 2 for every upgradable item with signs kept, the compactor rules), combat (no relic
no combo, a family relic fires exactly its family, The Strategy Guide everything, the relic's proc, the gate on every
real recipe, the Bubble Combo needs the Party Popper; the build tests now carry the relic their combos need; the
Endless loop pins compare against a plain run without the act 1 dial), balance (act 1 normals take x1.15 / x1.1,
the first fight lighter, elites, minions and act 2 untouched; act 1 fights take 2+ turns and deal damage; the model
plays the bare bin at the first fight and holds the first elite's combo relic past mid act 1), game (who starts with
a combo relic, the first elite's pick and its reload, a second elite offers none, an old save's next elite does,
the pools, the Prizedex and help text, a +2 crush, its name, card, bin group, reload, fight number and sell price;
the older elite and tower flows walk through the pick), render (every combo glyph, the +2 marks), i18n (the relics,
procs, patterns and the pick in Dutch). Screenshots: scratchpad `r21rules/r21_{pick,relics,cmp_grid,cmp_pick,cmp_result}_{en,nl}.png`.
