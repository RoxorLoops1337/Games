# INKWOVEN -- design bible and module contracts

> A rogue storybook. Two heroes, one living book, a deck of gem-socketed cards.
> Read this whole file, then `ART_BIBLE.md` and `CONTENT_SPEC.md`, before writing a line.
> Many modules are built in parallel by different people. The contracts here are the
> only thing keeping the pieces fitting. When a contract is unclear, pick the simplest
> reading, write it into your module's header comment, and keep going.
> Machine-readable twin of this file: `js/data.js` (closed lists, economy, roster, validator). If the two
> ever disagree, `js/data.js` wins and this file is the bug: report it.

**This game is written from scratch.** Do not open, read, copy or imitate any other
game folder in this repository. The only things outside `rogue_book/` you may read are
`CLAUDE.md`, `build.js`, `package.json`, and the tests and tools that belong to this
game (`tests/rogue_book_*`, `tools/rogue_book/*`).

## 1. The pitch

The Living Book is a storybook that writes itself. Its Author has vanished and a spreading
blankness, the **Blank**, is erasing the tale one page at a time. You lead **two heroes**,
characters written into the book, across its pages to the last one and rewrite the ending.

The game is a deckbuilding roguelike in three parts:

1. **The map is a page of blank paper.** A hex map hidden in fog. You spend **Ink** to paint a hex next
   to the painted area and reveal it (fight, treasure, shop, camp, fable...), or use one-use **Brushes**
   that paint whole shapes for free. Walk only on painted hexes. Reach the chapter boss on the far side.
   The boss is about 16 paints from the start ring, so a rush is possible and every extra hex is a choice.
2. **Combat is two heroes against a line of enemies.** One shared deck, but every card belongs
   to one hero. Heroes stand in a **front row** and a **back row**. The front hero eats most
   attacks. Cards and heroes change with the row they stand in, and swapping rows is a tactical
   move. Enemies telegraph intents. 3 Energy, draw 5, play cards, end turn.
3. **Cards have gem slots.** Socket colour-matched **gems** into cards to change how they play.
   Camps, forges and shops let you shape the deck. **Relics** (called Treasures in the UI) bend
   the rules.

Three chapters, each ending in a boss, the last in three phases. Four heroes (two unlocked at
the start), a Library of meta unlocks, achievements, a bestiary, ten Ink Trials of difficulty,
a Daily Tale seeded by the date.

Tone: shonen adventure meets storybook melancholy. Warm, dramatic, a little funny. Never mean.

## 2. Ground rules for every module

- **One folder:** `rogue_book/`. `index.html`, `css/*.css`, `js/*.js`. **No external assets,
  no libraries, no fetch, no network.** All art is drawn on canvas with code, all audio is WebAudio
  synthesis. Fonts are system stacks (see ART_BIBLE).
- **Classic scripts, shared global scope.** `index.html` lists every script in load order (section 3).
  Each file declares AT MOST ONE top-level `const` namespace (`U`, `DATA`, `ART`, `AUDIO`, `COMBAT`, `MAP`,
  `RUN`, `META`, `UI`, `SCENE`, `GAME`) and may use every namespace loaded before it. Content and extension
  files (`data_*.js`, `art_*.js`, `screen_*.js`, `tutorial.js`) declare NO top-level names: they are one IIFE
  that registers into an existing namespace. No other top-level `let/const/var/function/class`. The single
  backward reference is allowed at call time, never at load time: `screen_*.js` and `tutorial.js` may call
  `GAME.nodeDone`, `GAME.toTitle` and `GAME.enterNode`; use `UI.bus` for everything else.
- **Headless first.** Everything except pure drawing must run under Node with no DOM: the test loader
  (`tests/rogue_book_lib.mjs`, contract in section 7) stubs the browser. Drawing code must survive the no-op
  canvas context. No top-level DOM, AudioContext or clock access; touch them lazily inside functions. Read the
  page URL through `window.location` (a bare `location` is a hygiene error, and a ReferenceError headless);
  `document`, `localStorage`, `navigator`, `performance` and `matchMedia` are globals in the browser and in the test
  loader alike, so plain use inside a function is fine.
- **Determinism and the clock.** No `Math.random` anywhere (the test loader makes it throw). Use `U.rng(seed)`
  streams and derive seeds with `U.hash(seed, 'ch2', 'map')`. `U.rng(0)` and `U.rng(1)` are different
  streams. Time-based animation reads a passed-in `t`. Logic modules (`data`, `combat`, `map`, `run`, `meta`)
  never read a clock: callers pass `now` or `date`. Only `GAME` (main.js) may call `Date.now()` or
  `new Date()`, and only `GAME.newRun` may turn the clock into a run seed:
  `(Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0`. UI and art cosmetics may read `performance.now()`.
- **Units and conventions.** Stage pixels; angles in radians; every parameter named `ms` is milliseconds;
  `dt` given to `update()` is SECONDS clamped to 0.05; `t` given to any `ART.*.draw` other than `ART.fx` is
  ABSOLUTE SECONDS since boot (float) and drives loops (breathing, sway, blink, flicker); `ART.fx` is the only
  place `t` means progress 0..1. Heroes face RIGHT, enemies face LEFT; `flip:true` mirrors about the origin.
- **Coordinates:** the logical stage is **1280 x 720**, landscape, scaled by CSS to fit any window
  (letterboxed, section 5.8). All UI and art coordinates are stage pixels.
- **Touch first, mouse and keyboard as a bonus.** Hit targets are at least 44 CSS px on the SCREEN
  (section 5.8). No hover-only affordances (hover adds detail, never gates function). Pointer events, never
  separate mouse and touch code paths. No `alert`, no `confirm`, no `prompt`.
- **Tests** live in `tests/rogue_book_<module>.test.mjs`, use `boot()` from `tests/rogue_book_lib.mjs` and
  `harness()`. Every suite passes `only` listing exactly the layers it needs (presentation suites:
  `["util","data*","art*","audio","ui"]`; screen suites add `"scene"`, `"screen_x"` and `"main"`); `boot()` with
  no argument is reserved for the integration and autoplay suites. Suites print `name: N passed, M failed` and
  exit 1 on failure. `npm run test:rogue_book` runs them all. Never create throwaway harnesses outside
  `tests/` (scratch experiments go in your scratchpad, not the repo).
- **Style:** vanilla ES2020, 2-space indent, semicolons, small functions, a header comment that
  is the contract of record for the file, and comments that explain *why*. **No em dashes and no
  en dashes anywhere** (code, copy, docs, tests). Use `--`, a comma, or a colon. The hygiene suite fails on them.
- **Ownership:** each file has exactly one owner (section 9). Never edit a file you do not own.
  If you need a change elsewhere, work around it or record it in your final report.
- **Performance:** 60 fps target on a mid laptop, budget in section 5.8. Cache sprites in offscreen canvases
  (`ART.sprite`), never rebuild gradients or Path2D per frame when the inputs did not change, and let
  `requestAnimationFrame` idle when the tab is hidden.
- **Graceful failure:** a bad frame must never brick the game. `UI.go` catches a screen that throws, logs it
  and offers Back to Title (section 5.8); boot failures show a message (section 5.10).

## 3. Files, namespaces and load order

```
js/util.js            U         shared helpers                                   (done)
js/data.js            DATA      registries, closed lists, statuses, heroes, validator   (done)
js/data_text.js       (DATA+)   text generation: cardHtml, gemText, ...
js/data_cards_hanae.js  data_cards_kuro.js  data_cards_suzu.js  data_cards_raiga.js  data_cards_shared.js
js/data_enemies_1.js  data_enemies_2.js  data_enemies_3.js
js/data_relics.js  data_gems.js  data_events.js  data_meta.js
js/art.js             ART       toolkit + style helpers + sprite cache + working placeholders for EVERY ART member
js/art_heroes.js  art_enemies_1.js  art_enemies_2.js  art_enemies_3.js  art_cards.js
js/art_icons.js  art_scenes.js  art_map.js  art_fx.js
js/audio.js           AUDIO     WebAudio SFX + procedural music
js/combat.js          COMBAT    combat engine (pure logic, event log)
js/map.js             MAP       hex map generation and rules (pure)
js/run.js             RUN       run state, rewards, shop, camp, events, relics, save shape
js/meta.js            META      profile, settings, unlocks, achievements, save/load
js/ui.js              UI        stage, screen manager, DOM components, tooltips, input
js/scene.js           SCENE     canvas combat scene: actors, VFX, numbers, camera shake
js/screen_menu.js     title, heroSelect, library (tabs), settings, howto
js/screen_map.js      map
js/screen_combat.js   combat
js/screen_node.js     reward, shop, event, camp, forge, chest, gemcache, deck overlay
js/screen_end.js      story, chapterClear, gameOver, victory
js/tutorial.js        first-run guided hints (subscribes to UI.bus only)
js/main.js            GAME      boot, run flow, routing, debug hooks
css/base.css  menu.css  map.css  combat.css  node.css  end.css
gallery.html          art sheet viewer (script list is a prefix of index.html's)
```

Data flows one way: `DATA` (definitions) -> `COMBAT`/`MAP` (rules) -> `RUN` (state that spans a
run) -> `META` (state that spans runs) -> `UI` and screens -> `GAME`. Logic modules never touch
the DOM. `ART` and `AUDIO` are leaf helpers the UI calls; logic never calls them, and `audio.js` never
references `META` (it loads before it).

## 4. Core rules

### 4.1 Heroes, rows, energy

- The party is **two distinct heroes** (unit ids equal hero ids). `C.heroes` is in party order and never
  re-sorts; each hero unit has a `row` property (`'front'` or `'back'`), and `C.front()` / `C.back()` return the
  units. `RUN.frontIdx` is the party index that leads between fights (the first hero starts in front) and is
  written back at combat end from whoever holds the front row.
- Base **3 Energy** (`mods.energy`), draw **5** (`mods.hand`, plus the living heroes' row `drawAdd`), max hand 10
  (`ECONOMY.maxHand`). Unspent Energy never carries over.
- Each hero has HP that persists across fights. Heroes are healed at camps, by some events, and partially at
  the end of each chapter.
- **Rows.** `DATA.heroes[id].rows.front` and `.back` list bonuses (`LISTS.rowFields`) applied while the hero
  stands in that row, plus any relic `rows` (`DATA.rowFor`): `dmgAdd` / `blockAdd` (added to each `dmg` / `block`
  op the hero's own cards produce), `startBlock` (raw Block at the start of each player turn), `regen`, `thorns`,
  `drawAdd` (extra cards drawn at turn start).
- **Row statuses.** `thorns` and `regen` from a row are real statuses. Each hero unit keeps `rowSt = {thorns, regen}`,
  what its current row granted. They are re-applied at the start of every player phase and IMMEDIATELY after any
  swap: subtract the old `rowSt` from `st` (floor 0), add `rows[row].thorns` and `rows[row].regen`, record the new
  `rowSt`. So Suzu stepping to the front mid-turn has Thorns 2 for that enemy phase and loses them when she steps back.
- **Swap.** One free swap per player turn (`mods.freeSwaps`, relics add more). Further swaps cost
  `ECONOMY.swapCost` (1) Energy. `C.swap()` exchanges the two rows. While either hero has `bind`, neither can
  swap: that blocks the free and paid swap, the card `swap` op and the enemy `swap` op. A forced swap (below)
  ignores Bind. `onSwap` hooks fire for the free swap, the paid swap and the card `swap` op, never for forced swaps.
  The card `swap` op does not use up the free swap.
- **Downed heroes.** A hero at 0 HP is *downed*: cannot be targeted, ticks nothing, their cards are dead
  (`canPlay` reason `down`) but stay in the deck and clog the hand, and the survivor is forced to the front row
  (`swap` event with `forced:true`). If both are downed the combat is lost. When a combat is won, downed heroes
  revive with `mods.reviveFrac` of max HP (at least 1). The `revive` op stands a downed hero up in the back row.

### 4.2 The round, damage, block and statuses

Definitions: `unit.block` (number), `unit.st[statusId]` (number). Attacks are `dmg` ops. A **round** is one
player phase plus one enemy phase. Win and lose are checked after every hit and every tick; combat ends at once
(no further enemy actions).

**The round, in order**

1. **Player phase start** (turn N; turn 1 runs at the end of `C.start()`):
   a. every living hero's Block clears;
   b. Energy is set to `maxEnergy` (`mods.energy`);
   c. row statuses are re-applied for both living heroes;
   d. per living hero in party order: `plating` (raw Block), row `startBlock` plus `mods.startBlock` (raw Block),
      `ritual` (gain Might), `regen` (heal, then falls by 1), `poison` (hits, ignores Block, may down the hero, then
      falls by 1). If both heroes are down after this the combat is lost;
   e. `turnStart` hooks and hero passives run (order: hero passives, relics, card hooks, each in registration
      order), so their `energy`, `draw` and `block` ops stick;
   f. draw `mods.hand` plus the living heroes' `drawAdd` cards (turn 1: `innate` cards enter the hand first, then
      draw until the hand holds that many; the hand never exceeds `ECONOMY.maxHand`, drawing into a full hand stops
      and leaves the pile alone). When the draw pile is empty the discard pile is shuffled into it (`shuffle` event,
      `onShuffle` hooks); if both are empty drawing stops. Each drawn card runs its `hand.drawn` ops as it lands.
2. **Player phase.** The player plays cards and swaps.
3. **`C.endTurn()`:** in this order: `hand.turnEnd` ops of cards in hand (hand order), `turnEnd` hooks, ethereal
   cards in hand are exhausted, retained cards stay, everything else is discarded. Then the enemy phase.
4. **Enemy phase:** the heroes' `damageTaken` and `hitsTaken` counters (4.4) reset; every enemy's Block clears; then per living enemy in line order (ascending `lane`, 5.2):
   `plating`, `ritual`, `regen` (heal, then falls by 1), `poison` (ignores Block, then falls by 1). Then each living
   enemy in line order acts: a stunned enemy skips and loses 1 `stun` (`skip` event); otherwise its move runs.
   Enemies summoned during the phase do not act until the next one.
5. **End of round:** `burn` deals its stacks to every living unit (ignores Block) and then halves (floor); every
   `dur` status on every unit decrements by 1 (removed at 0), except statuses marked fresh (below); fresh flags clear.
   Enemy `stun` is not decremented here (it is consumed when the enemy skips).
6. New intents are rolled (each enemy's own turn counter advances) and turn N+1 begins.

**For one hit of a `dmg` op** (`attacker` is the acting unit, or null for hook damage, which is unattributed):

```
raw   = n                                          // the V of the op, evaluated once (4.4)
if attacker: raw += attacker.rowDmgAdd             // heroes only: DATA.rowFor(hero, row)
             raw += attacker.st.might              // may be negative
if attacker is an enemy: raw = floor(raw * mods.enemyDmg)      // trial factor, before Weak
if attacker and target.st.mark > 0: raw += 3; target.st.mark -= 1   // consumed even if the hit is then dodged
if attacker and attacker.st.weak > 0: raw = floor(raw * 0.75)
if target.st.vulnerable > 0: raw = floor(raw * 1.5)
raw   = max(0, raw)                                // crit = (Vulnerable applied) or (Mark consumed): presentation only
if target.st.dodge > 0: dodge -= 1; emit 'dodge'; STOP     // no Block, no Thorns, no onDamaged, no lifesteal
absorbed = op.pierce ? 0 : min(target.block, raw); target.block -= absorbed; hpLoss = raw - absorbed; target.hp -= hpLoss
if target is a hero: fire onDamaged hooks for that hero once per hit, even when fully blocked
if attacker and target.st.thorns > 0: after the hit the attacker loses `thorns` HP directly (no modifiers, ignores
   Block), also when the hit was fully blocked
if op.lifesteal: heal attacker for hpLoss
```

Hook damage has no attacker: no Might, no row `dmgAdd`, no Weak, no Mark, and it never triggers Thorns;
Vulnerable, Dodge and Block apply. Only `dmg` ops trigger Thorns, never poison, burn, `hurt` or thorns itself.
Poison and burn ticks and the `hurt` op do NOT fire `onDamaged`. Poison and burn may down a hero; the `hurt` op
cannot take a hero below 1 HP unless `lethal:true`. Trial `mods.enemyDmg` is a factor (4.7). Enemy `dmg` ops
use the same formula with the enemy as attacker. The `element` of a hit is the op's `el`, else derived from the
source card's `art.m` (`fire`, `flame_orb` -> fire; `ice` -> ice; the lightning family -> lightning; the ink
family -> ink; anything else -> slash), and `slash` for enemy and hook damage.

**Block gain** (only `block` ops): `gain = floor((n + unit.st.bulwark + rowBlockAdd) * (unit.st.frail > 0 ? 0.75 : 1))`,
min 0, where `rowBlockAdd` applies to heroes' own cards. `plating` and row/mod `startBlock` are raw. Hero Block is
removed at the start of that hero's player turn (step 1a, before any gain); enemy Block at the start of the enemy phase.

**Status ids** are the closed list in `DATA.statuses` (`might bulwark regen thorns dodge taunt ritual plating bloom
sumi ward charge vulnerable weak frail poison burn stun bind mark`). `stack:'int'` statuses are intensities,
`stack:'dur'` statuses are durations in rounds. Resource statuses (`bloom sumi ward charge`) are inert numbers that
cards, passives and relics read and spend. Combat statuses are cleared when combat ends.

**Duration semantics.** A `dur` status decrements once per round at step 5, EXCEPT a `dur` status applied to a HERO
while `C.phase` is `'enemy'` (by an enemy op): it is marked fresh (`unit.fresh[s] = true`) and skips the step 5
decrement of the round it was applied in. So Weak 1, Frail 1, Stun 1 and Bind 1 from an enemy last through the
hero's next player phase, and Vulnerable 1 lasts through the next enemy phase. Statuses applied during the player
phase (including by `hand.*` ops) follow the plain rule: `weak 2` on an enemy weakens its next 2 actions. A hero with
`stun > 0` at the start of their player phase cannot play cards that turn. An enemy ignores every status listed in
its `def.immune`, and every boss is always immune to `stun`; an ignored status changes nothing and emits an `immune`
event (Poison, Burn, Vulnerable and the rest do work on bosses). An elite that was stunned ignores Stun for the next
2 rounds (same `immune` event). `bind` does nothing to an enemy.
`taunt`: enemy attacks whose target is `back`, `random` or `lowest` hit the taunting hero instead (if that hero is
alive); `front` and `both` are unaffected.

### 4.3 Cards

A **card definition** (`DATA.cards[id]`):

```js
{
  id: 'hanae_slash', name: 'Petal Slash',
  hero: 'hanae',                 // hero id, or 'curse' / 'status' for junk cards
  type: 'attack',                // attack | skill | power | curse | status
  rarity: 'starter',             // starter | common | uncommon | rare | token
  cost: 1,                       // 0..5, or 'X' (pays all remaining Energy; ops read {per:'X'}); unplayable curses and status cards omit it
  fx: [ { op: 'dmg', n: 6, tgt: 'enemy' } ],
  up: { fx: [ { op: 'dmg', n: 9, tgt: 'enemy' } ] },   // upgrade: may replace fx, cost (number or 'X') and/or kw wholesale
  kw: [],                        // exhaust retain innate ethereal unplayable
  slots: ['red'],                // 0..3 gem slots; colours red blue green gold, or 'any' (prism)
  art: { m: 'slash', c: 'rose', hero: true },   // motif and palette from DATA.LISTS.motifs / palettes; hero pose composited when art.hero
  flavor: 'Optional one-line quote.',
  hand: { turnEnd: [ops], drawn: [ops] },       // curses and status cards: ops run if in hand at end of turn / when drawn
  locked: true,                  // meta unlock (Library); starters and commons are never locked
}
```

- Card text is generated from `fx` by `DATA.cardHtml`; a `text` field is a validator error. `flavor` is optional.
- **Deck instance** (`RUN.deck[]`, combat piles): `{uid, id, up: 0|1, gems: [gemId|null, ...]}`, the `gems` array is as
  long as the resolved slots. `DATA.resolveCard(inst)` merges upgrade and gem mods and is the single source of truth
  for name, cost, kw, slots, fx and text. COMBAT and UI both call it. Combat piles hold copies, never the RUN deck
  objects; temp cards carry `tmp:true` and RUN ignores them.
- **Types.** `attack` and `skill` go to the discard pile after play; a `power` goes to `C.powers` (a separate zone: no
  `exhaust` event, never fires `onExhaust`, cannot be fetched by a pick) and its `fx` normally contain `hook` ops
  and persistent `status` ops; `curse` and `status` are junk (usually `unplayable`, sometimes harmful `hand` triggers).
- **Keywords.** `exhaust` removes after play; `retain` stays in hand at end of turn; `innate` is in the opening hand;
  `ethereal` is exhausted if still in hand at end of turn; `unplayable` cannot be played.
- **Targeting mode** is derived: a card needs a chosen enemy iff any reachable op (through `cond`, `repeat`, `hook`
  and gem `fx`) has a resolved `tgt` of `enemy` (an omitted `dmg` tgt counts), or contains a V with `who:'target'` or
  `'enemy'`, or a `cond` `targetStatus`. `pick` never targets.
- **Upgrades:** one level. `up` replaces `fx` wholesale if given, may change `cost`, and `up.kw` REPLACES the base `kw`
  array (write `['exhaust','retain']` to keep exhaust and add retain, `[]` to remove all). Displayed name gets `+`.
  Every playable non-token card defines `up`.

**Playing a card.** `C.play(uid, targetId)`:

1. `C.canPlay` must be ok, else return `[]` and change nothing.
2. Move the card from `C.hand` into `C.inPlay` (one slot). `handSize`, `discardPile` and `exhaustPile` counts exclude it.
3. `X` = all remaining Energy if the card costs X, else the cost. Spend it; emit `play` and `energy`. Upgrade and gem cost
   deltas never apply to X cards; X = 0 is legal and simply makes every X-scaled count 0.
4. Flatten `fx` into an op queue (`cond` and `repeat` expand when reached). Ops run in order and each reads live state:
   Block, statuses and rows changed by earlier ops of the same card are visible, so block then `dmg n:{per:'block'}`
   works, and a `swap` op then a `dmg` op gets the new row's `dmgAdd`. A `pick` pauses the queue: `C.pending` is set,
   `pick_needed` is emitted and `C.resolvePick` resumes the queue, so the ops after a pick run after the choice.
5. When the queue empties: power -> `C.powers`; `exhaust` keyword -> exhaust pile; else discard. Then `onPlay` hooks
   fire, then `cardsPlayed` / `attacksPlayed` / `skillsPlayed` increment (`per:` reads see the value BEFORE this card).
6. Conservation: `hand + draw + discard + exhaust + powers + (inPlay ? 1 : 0) = deck + added - removed` at every call
   boundary.

**Pick.** `pick.n` means exactly `min(n, candidates)` unless `optional:true` (any number 0..n). `top:N` limits `from:'draw'`
to the top N cards. Candidates are the cards in `from` matching `filter`. If candidates <= n and the pick is not
optional the engine auto-resolves with no pending. The legal (from -> then) pairs are `LISTS.pickPairs`. `then:'copy'` adds a
temp copy of each picked card to the hand; `upgrade` lasts until combat ends; `retain` marks the card retained this turn.
`add`, `copy` and `toHand` into a full hand (10) send the card to the discard pile with a `discard` event reason
`overflow`. Default `add.to`: hero cards to the hand, curse and status cards to the discard pile.

### 4.4 The effect DSL (closed)

An effect list is an array of op objects executed in order. Unknown ops, unknown fields and targets outside an op's
vocabulary are validator errors (`js/data.js` `OPSPEC`).

**Value expressions** `V` are a number or `{base?, per, mul?, s?, who?, cap?, min?, upTo?}`. A V is evaluated ONCE when its op
starts executing (not per hit, not per target), reading live state; `repeat` re-evaluates `n` and its inner ops every
iteration; a `who:'target'` or `'enemy'` counter inside a `tgt:'all'`, `random`, `lowest` or `others` op is evaluated per
resolved victim. `value = floor(clamp(base + mul * min(count(per), upTo), min, cap))` with `base` 0, `mul` 1, `upTo` and
`cap` unbounded. The op then clamps: `dmg`, `block`, `heal`, `hurt`, `draw`, `hits` and `repeat` counts to >= 0, while
`energy` and `status` `n` may be negative. `who` applies only to `status block hp missingHp debuffs`.

| `per` | counts |
|---|---|
| `X` | the Energy paid (legal only on a card whose cost is `'X'`) |
| `handSize` `drawPile` `discardPile` `exhaustPile` | cards in that zone (`handSize` excludes the card being played) |
| `cardsPlayed` `attacksPlayed` `skillsPlayed` | played this turn, before this card |
| `energy` | remaining Energy |
| `block` `hp` `missingHp` | of `who` (default the acting hero) |
| `status` | stacks of `s` on `who` (`self` default, `ally`, or `target` / `enemy`, which both mean the enemy the op is aimed at: the chosen enemy, or each victim of an `all`, `random`, `lowest` or `others` op) |
| `debuffs` | distinct debuff statuses on `who` (default `target`) |
| `enemies` `kills` `turn` | living enemies; kills this combat; the combat turn |
| `gems` | gems socketed on the card (in a hook: on the triggering card) |
| `front` | 1 if the acting hero is in the front row |
| `damageTaken` | HP the acting hero has lost since the start of the last enemy phase: the hits it just took plus anything lost since, so a card played in the player phase reads the damage of the enemy phase before it (the counter resets when step 4 begins, and is 0 on turn 1). Not `C.stats.damageTaken`, which is the whole fight |
| `hitsTaken` | enemy hits that removed HP from the acting hero over that same window |
| `targetBlock` | Block of the chosen enemy |
| `picked` | cards resolved by the most recent `pick` of this card |

In enemy contexts only `LISTS.perEnemy` is legal (`turn enemies status hp missingHp block debuffs handSize drawPile
discardPile`), `who:'self'` is the acting enemy, `who:'target'` is the hero being hit (the front hero when the op has no
hero target), and `turn` is that enemy's own turn count (1 on the turn of its first intent).

**Actor and target resolution.**

| context | acting hero (`self`, row conds, `dmgAdd`, Might, `who:self`) |
|---|---|
| hero card or gem `fx` | the card's owner (`def.hero`) |
| curse or status card, and their `hand.*` ops | the FRONT hero |
| owned hook: a hero passive, a `hook` op, a relic with `hero` | the owner; it fires only for events whose acting or damaged hero is the owner (unless `filter.hero:'any'`) and never while the owner is downed |
| party hook: every other relic hook | the triggering hero for `onPlay onDamaged onKill onSwap onHeroDown onExhaust`, else the FRONT hero; it fires for either hero unless `filter.hero` names one |

- **Default `tgt` when omitted:** `dmg` -> `enemy`; `block`, `heal`, `hurt`, `maxHp` -> `self`; `status` -> `enemy` for a debuff
  (any `DATA.isDebuff` id: `vulnerable weak frail poison burn stun bind mark`; `bind` does nothing to an enemy), otherwise `self`; `removeStatus`: `debuffs` or a
  debuff id -> `self`, `buffs` or a buff id -> `enemy`, resource ids -> `self`. In `hand.*` ops a debuff needs an explicit `tgt`.
  In hook ops the enemy target `enemy` means: `onPlay` the card's chosen target (random if none), `onDamaged` the attacker,
  `onKill` and everything else a random living enemy (never the dead unit).
- **Hero targets:** `self` = the acting hero, `ally` = the other hero, `both` = every living hero, `front` / `back` = by current
  row. Ops aimed at a downed hero are skipped; with one hero alive `ally` is skipped and `front` / `back` both mean the survivor.
- **Enemy targets (card and hook ops):** `enemy` = chosen at play; `all` = every living; `random` = one living enemy, re-rolled
  every hit and every execution of `status` / `heal` / `removeStatus`; `lowest` = lowest current HP; `others` = every living
  enemy except the chosen one (needs a chosen enemy; for `random` and `lowest` it means all the rest). Ties go to the lowest
  lane. If the chosen enemy died earlier in the same card an `enemy` tgt re-targets as `random`.
- **Enemy-op targets:** hero side `front back both random lowest` (`lowest` = lowest current HP hero, ties: front first, `random`
  drawn per hit with `C.rng`); enemy side `self allEnemies otherEnemy` (a random living enemy other than self) `lowestEnemy`
  (lowest current HP, may be self).

**Card ops** (`LISTS.cardOps`):

| op | fields | meaning |
|---|---|---|
| `dmg` | `n:V, hits?:V(1), tgt='enemy', pierce?, lifesteal?, consume?, el?` | attack hits (4.2). `el` is one of `LISTS.elements` (presentation) |
| `block` | `n:V, tgt='self', consume?` | gain Block on hero(es) |
| `heal` | `n:V, tgt='self', consume?` | heal hero(es); cannot revive, cannot overheal |
| `hurt` | `n:V, tgt='self', lethal?, consume?` | lose HP directly (ignores Block, never below 1 unless `lethal:true`) |
| `status` | `s, n:V, tgt, consume?` | apply stacks. A negative `n` removes stacks: at 0 the key is deleted, only `might` may stay negative |
| `removeStatus` | `s:id or 'debuffs' or 'buffs', n?:V, tgt` | cleanse or dispel every status of that kind, or at most `n` stacks of one id. Resource statuses are only removed by id |
| `draw` | `n:V, consume?` | draw cards (reshuffle rules in 4.2 step 1f) |
| `energy` | `n:V, consume?` | gain Energy (a negative `n` floors the pool at 0) |
| `pick` | `from, n:V, then, top?, filter?:{type,hero}, random?, optional?` | the player (or RNG if `random`) picks cards from a pile; `then` applies (4.3 Pick). Engine sets `C.pending`, UI calls `C.resolvePick(uids)` |
| `add` | `card:id, n?:V(1), to?, up?` | create temp cards in your piles (`LISTS.addTo`) |
| `swap` | none | swap rows (does not use the free swap; blocked by Bind) |
| `cond` | `if:C, then:[ops], else?:[ops]` | conditional |
| `repeat` | `n:V, do:[ops]` | run the ops n times (X-cost cards: `n:{per:'X'}`) |
| `gold`, `ink`, `maxHp` | `n:V` (maxHp also `tgt`) | run-level rewards mid-combat (gold pouch, ink drop, permanent max HP) |
| `revive` | `n:V` or `pct` (fraction of max HP) | a downed hero stands up in the back row with that HP (at least 1). No-op if nobody is downed. In a hook on `onHeroDown` it revives the triggering hero; otherwise the first downed hero. Emits `hero_revive` |
| `hook` | `on, fx:[hook ops], filter?, limit?, once?, every?` | registers a combat hook owned by the acting hero until combat ends. `once:true` removes it after it fires once. Playing the card twice registers two hooks. Not allowed inside hook ops |

**Spending resources.** `consume` is legal on every op with an `n` (`dmg block heal hurt status draw energy`): `consume?: statusId | 'block' |
{s: statusId|'block', upTo?: V}`. `n` is evaluated first, then the stacks are removed from the acting hero (`'block'` removes all their
Block; omitted `upTo` means all stacks). Partial spending is `V.upTo` to cap what is counted plus `consume.upTo` to cap what is removed.

**Conditions** `C` (`LISTS.cond`), all keys must hold: `row:'front'|'back'` (acting hero's row), `status:{s, who?, gte?, lte?}`,
`hpPct:{who?, lt?, gt?}` (fractions 0..1), `handEmpty:true`, `cardsPlayed:{gte?,lte?}`, `attacksPlayed:{...}`, `turn:{gte?,lte?}`,
`lastKill:true` (any target of the immediately preceding `dmg` op of this card died from it), `targetStatus:{s, gte?, lte?}`,
`allyDown:true`, `block:{gte?,lte?}` (acting hero), `energy:{...}` (remaining), `handSize:{...}`, `enemies:{gte?,lte?}`.
Enemy `cond` uses `LISTS.condEnemy` (`status hpPct block turn enemies`; `who` is `self` or `target`).

**Hook ops** (`LISTS.hookOps`, used by relics, hero passives and `hook` ops) are the card ops minus `pick`, `repeat`, `swap` and `hook`.

**Hook rules.**

1. Owner, actor and targets: see the resolution table above. Hook fields are `on, fx, filter?, limit?, once?, every?`.
2. `filter` keys (`LISTS.hookFilter`): `type` (card type), `hero` (a hero id or `'any'`), `cost:{gte,lte}`, `kw`, `tier`
   (`minion|normal|elite|boss`: matches the dead enemy on `onKill` and the fight tier on `onFightWon`), `gems:{gte}` (gems socketed
   on the triggering card, `onPlay` and `onExhaust`). Values may be a string or an array (any of). A filter key that is meaningless for
   the hook is a validator error.
3. `limit:N`: at most N times per player turn (the following enemy phase counts as the same turn). `once:true`: once per combat.
   `every:N` (N >= 2): fires on every Nth trigger (counter per combat); `once` and `every` cannot be combined. For run hooks `limit` is
   per chapter, `once` per run and `every` counts per run.
4. **Triggers.** `combatStart` after the opening shuffle and before the first intents; `turnStart` / `turnEnd` per 4.2;
   `onPlay` after the card resolves; `onDamaged` once per enemy attack hit on a hero, even when fully blocked, never for a dodged
   hit, poison, burn, `hurt` or thorns; `onKill` for every enemy death except `flee`, by cards, hooks, poison, burn or thorns (poison and
   burn kills credit the front hero, thorns kills credit the thorns' owner); `onSwap` per 4.1; `onHeroDown` before the lose check, so a
   hook may `revive`; `onShuffle` on every reshuffle; `onExhaust` for the `exhaust` keyword, a pick with `then:'exhaust'` and ethereal
   exhaustion, never for powers; `combatEnd` on a win only, before revive.

### 4.5 Enemies

```js
{
  id, name, title?, chapter: 1|2|3, tier: 'minion'|'normal'|'elite'|'boss', size: 's'|'m'|'l'|'xl',
  hp: [min, max],                              // whole numbers, rolled per fight with C.rng, then scaled by the trial factor (rounded, min 1)
  moves: { slash: { name: 'Claw Rake', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }], say?: 'bark text' }, ... },
  ai: {                                        // exactly ONE of seq / weighted
    open: ['howl'],                            // optional: used first, in order, once
    seq: ['slash', 'slash', 'guard'],          // cycles
    weighted: [['slash', 3], ['guard', 1]], noRepeat: 2,   // alternative to seq: never the same move more than 2 times in a row
    rules: [ { if: {hpLt: 0.5}, do: 'rage', once: true }, { if: {turnEvery: [3, 2]}, do: 'slam' } ]  // checked after open, in order
  },
  start: [enemy ops],                          // applied at combat start (statuses like thorns)
  phases: [ { at: 0.5, say: 'text', fx: [enemy ops], ai: { ... } } ],   // sorted by descending `at`
  hooks: [ { on: 'onDeath', fx: [enemy ops], filter?, limit?, once? } ],
  immune: ['stun'], art: { id: 'kappa' }, lore: 'One or two sentences for the bestiary.', tags: ['spirit']
}
```

- **Fixed roster.** Ids, names, tiers, sizes and chapters are law and listed in `CONTENT_SPEC.md` 4 (machine copy `DATA.ROSTER`). Authors
  keep freedom over stats, moves, AI and lore. `art.id` equals the enemy id. Boss ids: `boss_kuzunoha` (ch1), `boss_jorogumo` (ch2),
  `boss_editor` (ch3). Nominal heights: `LISTS.sizeHeight` (`s` 110, `m` 170, `l` 250, `xl` 340 px at scale 1).
- **Intent `kind`** (`LISTS.intents`) selects the icon and must be honest: `attack` (single hit), `multi` (several hits), `heavy` (one big
  telegraphed hit), `defend` (a `block` op), `buff`, `debuff`, `summon` (a `summon` op), `heal` (a `heal` op), `special`, `flee` (a `flee` op),
  `none`. The author picks the most threatening part: attack, multi or heavy over debuff or summon; a move that deals damage and adds junk
  cards is an attack. A move that only adds junk cards or steals uses `debuff`.
- **Enemy ops** (`LISTS.enemyOps`): `dmg {n, hits?, tgt: front|back|both|random|lowest (default front), pierce?, lifesteal?, el?}`; `block {n, tgt: self|allEnemies|otherEnemy|lowestEnemy}`
  and `heal` (same target list, default `self`); `status {s, n, tgt}` (hero tgt to debuff, enemy tgt to buff; default: debuffs -> `front`,
  buffs -> `self`); `removeStatus {s, n?, tgt}` (`debuffs` and debuff ids default to `self`, `buffs` and buff or resource ids default to
  `front`; `buffs` and `debuffs` remove every status of that kind on the target, resource statuses only by id); `add {card, n?, to?: draw|discard, top?}`
  (adds a `curse` or `status` card to the player's pile, `to` default `discard`; into `draw` it lands at a random position unless `top:true`);
  `summon {enemy, n?:1..4}` (the enemy must be a `minion` tier id; appends to the line while fewer than 5 enemies live, otherwise does nothing); `swap` (forces a hero row swap, blocked
  by Bind); `cond {if, then, else?}`; `stealGold {n}` (takes min(n, run gold not yet stolen), stored on the thief as `u.loot`; killing the thief
  returns it as a positive `gold` event, fleeing loses it); `flee` (the enemy leaves after this move: no kill credit, no Ink, `down:true` and
  `fled:true`, carried gold is lost; the fight is won when no enemy remains). Numbers are plain numbers or V objects limited to `perEnemy`.
- **Enemy hooks** (`LISTS.enemyHooks`), the enemy is the actor and `limit` is per round: `onDeath` (runs as it dies, `summon` allowed and the cap
  applies), `onHurt` (it lost HP from a card or hook, not from a status tick), `onAllyDeath` (another enemy died), `onHeroPlay` (`filter.type` is a card type).
- **AI resolution**, each time an intent is rolled: (1) if `open` has unused entries take the next (rules do not pre-empt the opener); (2) else the
  first rule whose `if` holds (all keys hold; a `once` rule that already fired is skipped forever); (3) else the next `seq` entry (the cursor wraps) or a
  `weighted` pick with `C.rng`, where `noRepeat:N` forbids a move that was already chosen N times in a row. Moves chosen by `open` or a rule do not
  advance the `seq` cursor. Targets resolve when the move executes, not when the intent is rolled. `u.ai = {openIdx, seqIdx, fired, recent}` is engine state.
- **AI conditions** (`LISTS.aiCond`): `turnEvery:[period, offset]` (period >= 2, offset < period) is true when `(turn - 1) % period === offset`, so `[3, 2]` is turns 3, 6, 9; `turnGte:n`;
  `hpLt` / `hpGt` (fractions of max HP); `alone` (no other enemy alive); `minions:{lt:n}` (fewer than n living units of tier `minion`, from any source);
  `heroStatus:{s, gte?}` (any living hero has `s`, default gte 1); `heroDown`; `allyHpLt` (any other living enemy below the fraction);
  `heroHpLt` (any living hero below the fraction). `turn` is the enemy's OWN turn count: 1 on the turn of its first intent, +1 each round, so a
  minion summoned on combat turn 4 starts its cycle fresh.
- **Phases.** Checked right after any HP loss on the enemy, in descending `at` if one blow crosses several. Each entry whose `hp/maxHp` fell below `at`
  and has not fired: emit `enemy_phase {enemy, index, at, say}`, run its `fx` at once (enemy is the actor), and if `ai` is given it REPLACES the whole ai
  object (cursors reset, its `open` plays first, base `rules` must be repeated to survive) and the enemy re-rolls its intent immediately. `index` = the number
  of entries fired so far (1..n); the unit's `phase` field holds it, and it is passed to `ART.enemy.draw` as `opts.phase` (0 = opening form). A boss with
  "three phases" has TWO `phases` entries.
- **Summons.** New units are appended to `C.enemies`, take the highest free lane, run their `start` ops, roll HP with `C.rng`, get an intent at once (events
  `summon` then `intent`) and do not act until the next enemy phase. `C.enemies` never shrinks; dead or fled units keep their slot (`down:true`).
  Unit ids are `def + '#' + n` with a per-def counter that never reuses numbers and are opaque strings (UI never uses them in CSS selectors).
- A stunned enemy's intent is `{kind:'none', text:'Stunned', stunned:true}`.
- **Encounters** (`DATA.addEncounters(ch, {normal, elite, boss})`): `{id, enemies:[ids], w:weight, min: lowest tile.diff 0..1}`; group ids are `ch<N>_<name>` and
  globally unique; 1 to 3 enemies in chapter 1, 1 to 4 later; a normal group has at least one normal enemy, an elite group exactly one elite (minions may pair
  with either). The boss is a single enemy id. A group is eligible when `min <= tile.diff` and is chosen by `w` with the tile's map rng.
- HP and damage guidance and the numbers per chapter are in `CONTENT_SPEC.md` 4 (machine copy `DATA.GUIDE`).

### 4.6 Gems

`DATA.gems[id]`: `{id, name, color:'red|blue|green|gold', tier:1..3, mod:{...}, art:{cut:'round|oval|square|drop|star'}, text? (auto), locked?}`.
A slot accepts a gem of its own colour, a prism (`any`) slot accepts any. Socketing happens in overlay `deck {mode:'socket'}`, opened from three places: a camp (the Cut Gems action), a forge (which offers
one upgrade OR gem cutting, 4.9) and a shop (a Cut Gems button beside the stock, free); replacing a gem
destroys the old one (there is no unsocket). Gems live in `RUN.gems[]` (unsocketed ids) and in `deck[i].gems[]`. Gem effects are applied by `DATA.resolveCard`;
gem text comes from `DATA.gemText(id)`.

**Gem `mod`** keys (`LISTS.gemModKeys`): `dmg +N` and `block +N` and `heal +N` add N to EVERY matching op of the card (per hit; ops inside `cond` and `repeat` and ops
appended by other gems included); `hits +N` adds N to the first top-level `dmg` op (a single strike counts as hits 1); `cost` is a signed delta (write `cost:-1`),
tier 3 only, ignored on X and 0 cost cards, minimum 0; `draw N`, `energy N`, `status {s,n,tgt}`, `poison N` and `fx [ops]` are APPENDED at the end of the card's fx in
slot order (`poison N` appends a poison status op on the card's enemy target and does nothing if the card has none); `kw [..]` adds keywords, `kwRemove [..]` removes
them; `cond:'front'|'back'` makes the whole gem work only while the owner stands in that row. A gem that cannot apply is shown grey with no effect. Because flat mods
only change ops that exist, slot colours must be useful for the card (CONTENT_SPEC 3).

### 4.7 Relics ("Treasures") and mods

`DATA.relics[id]`: `{id, name, rarity:'common|uncommon|rare|boss|shop', text, mods?, rows?, hooks?:[{on, fx, filter?, limit?, once?, every?}], art:{m:relicIcon, c:palette}, hero?:heroId, locked?}`.
`text` is required and hand-written (plain, one sentence, at most 90 characters). `hooks[].on` is a combat hook (`LISTS.combatHooks`) whose `fx` are hook ops, or a run hook
(`LISTS.runHooks`) whose `fx` are run ops (4.9, `fight` excluded). `rows:{front:{...}, back:{...}}` uses `LISTS.rowFields` keys and is added to every hero's own row bonuses
while owned. A relic with `hero` is owned by that hero (owned-hook rules, 4.4) and only drops when that hero is in the party. A relic needs `mods`, `hooks` or `rows`.

**Run hooks** (`LISTS.runHooks`; their `fx` are run ops, `fight` excluded, and `RUN.hook` returns any `pending` choices): `onPickup` (when the relic is gained, from any source), `onChapterStart` (after the chapter's map is generated), `onRest` (after a camp
Rest), `onPaint` (after each hex painted, by Ink, a brush or a chain), `onFightWon` (after a fight is won, before its rewards are rolled; `filter.tier` matches the fight tier), `onShopEnter` (when a shop opens).

**Mods (relics and Ink Trials).** A relic's `mods` may only use `LISTS.mods`, an Ink Trial's `mods` only `LISTS.trialMods` (they overlap on `goldMul priceMul healMul startInk wellInk cardChoices`). Every key is an ADDITIVE DELTA, summed across all owned relics and all accumulated trial levels.
`RUN.mods(R)` returns the final flat object (`DATA.modsFor(R.relics, R.mods)`, folded by `DATA.foldMods`); `R.mods` holds the summed trial deltas (`DATA.trialDeltas(trial)`) fixed at `newRun`, relic deltas are summed at read time and never cached.
`LISTS.modKind` and `LISTS.trialModKind` say which keys are counts and which are fractions.

- **Count keys** (`int`): `final = base + sum`, clamped. `energy` (3, min 1), `hand` (5: cards drawn per turn; the hand still caps at 10), `startBlock` (0: raw Block every living hero
  gains at each player turn start, added to the row value), `inkMax` (14, min 6), `startInk` (10, min 1, never above `inkMax`), `wellInk` (4, min 1: Ink per well),
  `cardChoices` (3, min 1), `freeSwaps` (1, min 0), `campActions` (1: how many different camp actions one visit allows, max 3), `rareBoost` (0: percentage points moved from
  common to rare in card reward weights), `startGold` (60), `curses` (0: N curses added to the deck at run start from the six `curse_*` cards, seeded).
- **Fraction keys** (`frac`): a single mod entry is a non-zero number and a fraction stays within -0.9..2; `final factor = max(0.1, 1 + sum)`. `goldMul priceMul healMul enemyHp eliteHp bossHp enemyDmg`. Relic authors write `goldMul: 0.25` for x1.25 and
  `healMul: -0.25` for x0.75. `enemyHp` applies to normal and minion enemies. Rounding: HP round, damage floor per hit (4.2), gold and prices round.
- `reviveFrac` (trial only) is a delta on `ECONOMY.reviveFrac` clamped to 0.05..1.
- `healMul` scales run-level healing only: camp Rest, run `heal` ops and chapter-end healing. It never touches in-combat `heal` ops, regen, lifesteal or revive.
- `goldMul` scales combat and chest gold only (never event `gold` ops, thief loot or costs); `priceMul` scales every shop price (cards, gems, relics, brush, card removal) and nothing else.
- COMBAT gets `mods` verbatim from `RUN.mods(R)` and reads only `energy hand startBlock freeSwaps enemyHp eliteHp bossHp enemyDmg`. COMBAT never reads `DATA.relics[id].mods`;
  `relics:[ids]` are for hooks only.

### 4.8 Map, Ink and Brushes

- **Layout.** Pointy-top axial hexes `(q, r)`, key `'q,r'`, odd-r offset: `column = q + floor(r / 2)`, and a tile exists iff `0 <= column < cols` and `0 <= r < rows`. The map is
  `ECONOMY.map.cols x rows` (21 x 13) with holes (`block` tiles: Unwritten Void), the start in column `startCol` (1) on the left and the boss in column `bossCol` (19) on the right.
  `MAP.DIRS` order (dir index 0..5): E `[1,0]`, NE `[1,-1]`, NW `[0,-1]`, W `[-1,0]`, SW `[-1,1]`, SE `[0,1]`.
- **Hex geometry** (`MAP.toPixel`, `MAP.corners`, `MAP.fromPixel`, `MAP.bounds`, `ART.map.*`, screen_map): `size` is the centre-to-corner radius (46 at zoom 1), width
  `sqrt(3) * size`, row pitch `1.5 * size`, odd rows shifted right by half a width, `toPixel` returns the hex CENTRE and `toPixel(0,0) = (0,0)`. The world is bigger than the screen so the
  map has a camera (pan by drag, zoom by wheel and pinch, follow the party).
- **Camera and HUD.** The lacquer HUD (party, Ink, chapter banner, gold, menu button, the Deck, Legend, Fit, Zoom in and Zoom out buttons, the brush tray, the hex info chip, the treasure strip and, while a
  brush is armed, the brush mode bar) lies over the page, so the camera works with the stage the HUD leaves free. The map screen measures the real rectangle of each piece in stage px at rest (the
  slide-in of the entrance and a hover lift are measured out, a piece's ancestors included, so the first fit is the settled one), so the compact phone layout, the text size and the number of
  brushes and treasures are accounted for; it measures again whenever one moves (a resize, a text size, a brush or a treasure gained, a brush armed or put away, a few times a second at most), and stands a
  fixed fallback table in for a piece it cannot measure (a headless page). From the rectangles, each grown by 6 px: the **free box** is the largest box of the page window that no piece intrudes on (each
  piece counts against the window side it hangs from); the **fit** is the largest zoom at which no hex of the page (the Void, the fog and the boss ring included) touches a piece or leaves the window, with
  its placement, found by a search over zoom and offset that runs when the HUD changes and never per frame. The fit is the camera of the Fit button and of the opening swoop, and its zoom is `zMin`, the
  minimum zoom: wheel, pinch and Zoom out stop there and the camera then sits on the fit (and counts as the fit view whether it was following the party or not: one press of Fit returns to the party), so
  the whole page is always shown with nothing under the HUD (on a 1280x720 stage about 82 percent of the zoom the page used to fit at, 0.49 against 0.60). A camera on the fit glides to a fit that moved,
  whichever way it moved. The **pan range** is the box the edges of the padded page (80 world px of margin) may travel to: the free box, so at every zoom above `zMin` any tile can be dragged onto ground the
  HUD leaves free and the page cannot be lost off screen (a page smaller than the box roams inside it). The page edge may also rest inside the box by the gap the fit itself has at its sides (a page narrower
  than the free box has one); that slack fades out between 1.6 and 2 times `zMin` (the default zoom has none) and only ever widens the range, and it is what keeps a wheel zoom about a pointer over the
  page anchored (the point under the pointer stays fixed) when it starts on the fit. Follow, the keyboard cursor, a fresh tile and the zoom buttons all use the middle of the free box, not the middle of the window, so
  the party and its neighbours are never under a piece. The info chip and the brush mode bar have a fixed size (the chip: a name line, two lines of text, two of action; the bar: two lines of text; longer text
  is cut) so the footprint does not change with the hex under the pointer or what the bar says, and the primary hints come in shorter versions for the Larger text size and for a phone so they always fit. The
  bar hangs from the top in the slot of the chapter banner (which fades while it is up), clear of the tray, the chip and the page's start hexes; arming or putting away a brush solves the fit again, and it
  costs the page next to nothing because the bar sits where the banner already was.
- **Painting.** Every tile starts hidden. `start` and every tile within `ECONOMY.map.startRing` (2) of it are painted (all `empty`, start itself `start`). Tiles of `LISTS.landmarks` are
  `known` from the start: fog shows a dim silhouette of their icon. Painting an unpainted, non-block hex adjacent to a painted hex costs `ECONOMY.paintCost` (1) Ink and reveals it and its content.
  Painting a far hex previews the cheapest chain (`MAP.pathToPaint`) with its total cost, and `RUN.paint` on it paints the whole chain, all or nothing.
- **Ink** lives in `RUN` (`R.ink`, `R.inkMax`; chapter 1 starts at `mods.startInk` and later chapters at `max(R.ink, mods.startInk)`, always capped at `mods.inkMax`; `R.inkMax` follows `mods.inkMax` and is recomputed whenever the relic set changes). Sources: ink wells (`mods.wellInk`), kills (`ECONOMY.killInk`: +1 normal, +2 elite),
  camp Meditate (`ECONOMY.campInk`), events, relics. **Mercy rule:** `RUN.checkStranded` grants exactly `paintCost` Ink when the party is stranded (`R.ink < paintCost`, no brushes, and no unresolved
  painted non-block tile reachable from `M.pos`).
- **Brushes** (`DATA.brushes`): free, one use each, kept in `R.brushes[]`. Geometry (`MAP.brushCells(M, id, q, r, dir)` returns only cells that would newly paint; each cell must exist, be hidden and not
  Void, and other cells are skipped without stopping the brush): `line` (`stroke` 3, `wave` 5): `(q,r)` is a PAINTED hex and the cells are `(q,r) + k * DIRS[dir]` for `k = 1..len`; `fan`: `(q,r)` painted, the neighbours in
  directions `dir-1`, `dir`, `dir+1` (mod 6); `blob` (`splash`): `(q,r)` is a hidden hex adjacent to the painted area, the cells are it and its 6 neighbours; `ring` (`halo`): `(q,r)` painted, its 6 neighbours;
  `dot` (`blot`): `(q,r)` hidden with `MAP.dist(M.pos, (q,r)) <= 4` (adjacency to painted is not required). `MAP.canBrush(M, id, q, r, dir)` is ok iff the origin rule holds and at least one cell is new.
  Brush-painted hexes never paint blocks.
- **Walking.** Click any painted hex reachable through painted, non-block hexes to walk there one step at a time. Walking stops at the first tile with unresolved content. Stepping onto unresolved
  content triggers it (`RUN.step`).
- **Solvability guarantee.** `MAP.solve(M).minInk` counts the hexes to paint from the edge of the start ring to the boss, boss hex included, so its floor is `bossCol - startCol - startRing = 16`. From a fresh
  map it lies in `ECONOMY.map.solve.min..max` (16..22; tests read the constants), and at least `map.wells.count` (3) Ink wells lie within `map.wells.within` (3) hexes of the cheapest routes. Budget check
  (asserted by the data tests): `startInk + 3 * wellInk = 22 >= solve.max`, so even the worst legal map is solvable on wells alone before a single kill; kills, brushes and Meditate are surplus. Balance owners tune
  `startInk`, `wellInk` and `killInk`, never the geometry. Trials that lower `startInk` rely on kills and wells. **Rows:** the start and boss may sit in any rows, but a hex step
  moves half a column per row, so a start and boss `dr` rows apart cost `16 + dr/2` paints (16 at `dr = 0`, exactly 22 at `dr = 12`, and `16 + floor` or `16 + ceil` of `dr/2` for odd `dr`, depending on which row is odd) before any Void detour. MAP therefore keeps `|dr| <= 6`, carves Void so the
  cheapest route stays inside `solve.min..max` with detours counted, and re-rolls with `U.hash(seed, 'retry', k)` (k = 1, 2, ...) when a candidate map falls outside, so `MAP.generate({chapter, seed})` stays a pure function of its arguments.
- **Tile types** (`LISTS.tiles`): `start empty block enemy elite boss chest shop camp event well brush gemcache forge`. `ECONOMY.dist` gives target fractions of the non-block hexes; the final count of a
  type is `clamp(round(fraction * nonBlock), countMin, countMax)` (`DATA.tileCount`). `tile.diff = clamp(MAP.dist(start, tile) / MAP.dist(start, boss), 0, 1)` rounded to 2 decimals, and scales encounter
  picks. `tile.done` means resolved (its icon fades to the ground).

### 4.9 Rewards, shops, camps, events

- **Combat rewards** (`RUN.combatDone`): gold (`ECONOMY.gold[tier]` x `mods.goldMul`), Ink from kills, a card reward of `mods.cardChoices` cards, skippable; an elite also offers one relic (rarity by `ECONOMY.relicWeights.elite`, take it or leave it); bosses give a rare
  card, a relic choice of 3 (boss-rarity relics, falling back to rare) and end the chapter. Some elites (seeded, half) and fable fights also drop a brush.
- **Card offers.** Each offer picks a hero uniformly among the two party heroes, then a rarity by `ECONOMY.rarity[tier]`, without duplicates. The rare weight is `base.rare + min(rareOffset,
  ECONOMY.rareOffsetCap) + mods.rareBoost` percentage points taken from common; `rareOffset` rises by 1 after each normal or elite reward that offered no rare and resets to 0 when a rare is taken.
- **Shop** (`ECONOMY.shop`): 5 cards (a mix of both heroes, one on sale at `saleFrac`), 2 gems, 3 relics (`r0` is a `shop` rarity relic while one is unowned, the
  other two roll `ECONOMY.relicWeights.shop`; `shop` and `boss` relics drop nowhere else), 1 brush, card removal (price `remove + removeStep * R.removals`), and a free Cut Gems button (4.6). Prices come from `ECONOMY.price`
  times `mods.priceMul`. The stock is built once on entering the tile from `content.shop.seed` and persisted in `R.node`: `{items:[{key, kind:'card'|'gem'|'relic'|'brush', id, price,
  sale:bool, sold:bool}], removePrice}` where `key` is the kind letter plus the index within its kind (`c0`..`c4`, `g0`..`g1`, `r0`..`r2`, `b0`). Sold-out items stay visible but disabled.
- **Camp**: pick up to `mods.campActions` (1) different actions: **Rest** (heal both heroes `camp.restPct` of max HP, `healMul` applies), **Sharpen** (upgrade one card), **Cut Gems** (any number of
  socket or replace operations in that visit; it counts as an action once the first gem is socketed or the player leaves), **Meditate** (`ECONOMY.campInk` Ink and 1 random brush).
- **Forge** tile: two buttons, Upgrade one card (once) and Cut Gems (any number of socket or replace operations); the tile is done when the player leaves after using either. **Gem cache**: choose 1 of 3 gems. **Chest**: gold plus either a relic offer or a gem choice (MAP rolls the relic rarity from `ECONOMY.relicWeights.chest`). **Brush rack** and **Well** are instant (`RUN.step` applies them).
- **Events** (`DATA.events`): `{id, title, text, art:{scene}, once?, chapters?, when?, w?, choices:[{label, req?, cost?, out:[{w, text, ops}]}]}` with 2 to 4 choices, each choice with weighted outcomes using run ops.
  `chapters` omitted means any chapter; `when:{flag?, relic?, hero?}` (all must hold or the event never rolls); `w` is the weight (default 1); `once:true` events never repeat in a run.
  `cost` is display text only: the engine never deducts it, so the outcome carries the negative op and the choice usually a matching `req`. A choice failing `req` is shown disabled with the reason,
  except a failed `req.hero`, which hides it.
- **Dead-end choices lock.** A choice is locked, with a stated reason, when EVERY outcome holds an op that can only do nothing right now (`removeCard`, `upgradeCard`, `transformCard` or `duplicateCard` with no candidate card, or a fixed-id `addRelic` the player already owns), so a paid choice never takes the price and gives nothing. Ops after an `addCard`, `addCurse` or `cardReward` are not judged, gambles with a live outcome stay open, and if every choice would lock none does. A fixed-id `addRelic` that is still reached for an owned relic gives a same-rarity relic the player lacks, else a gold refund worth 40% of the shop price, and its log text says so (`Already owned.` only when neither is possible).
- **Choosing an event for a Fable tile:** from the events allowed in this chapter whose `when` holds and (if `once`) not yet seen, weighted by `w`, preferring events not yet seen this run; if none
  qualifies pick any repeatable event; if there is none the tile resolves as +1 Ink with a one-line toast.
- **Run ops** (events and run hooks, `LISTS.runOps`; the same table is in the `js/data.js` header). Unknown fields are validator errors. `who` (heal, hurt, maxHp): `both` (default), `front`,
  `lowest`, `random`, or a hero id of the party.

| op | fields | meaning |
|---|---|---|
| `gold` | `n` or `pct` | n may be negative (a cost, floors at 0); pct is a fraction of current gold, floored |
| `ink` | `n` or `pct` | result clamped to 0..inkMax; pct is a fraction of inkMax |
| `heal` `hurt` | `n` or `pct`, `who?` | pct is a fraction of that hero's max HP; `heal` is scaled by `healMul`; `hurt` never kills |
| `maxHp` | `n`, `who?` | raises max and current HP by n; negative n lowers max, never below 1 |
| `addCard` | `card` or `pool`, `rarity?`, `n?`, `up?` | `pool` is `'party'` or a hero id: a random unlocked non-token card of that rarity |
| `removeCard` `upgradeCard` `transformCard` `duplicateCard` | `n?=1`, `random?`, `filter?:{type,hero}` | default: the player picks in the deck overlay (returned as a `pending` entry); `random:true` uses the RNG. Transform yields a random card of the same hero and rarity |
| `addRelic` | `id` or `rarity` | rarity draws an unowned, unlocked relic |
| `addGem` | `id` or `color?`, `tier?` | a random gem matching the filters goes to `R.gems` |
| `addBrush` | `id` | a brush id or `'random'` |
| `addCurse` | `id?`, `n?=1` | a `curse_*` id, omitted = seeded random |
| `fight` | `enc` or `enemies:[ids]`, `tier?`, `rewards?=true`, `win?:[run ops]` | the LAST op of its outcome: it starts after the earlier ops applied. `tier` (`normal` or `elite`) picks the reward table, `rewards:false` gives none, `win` ops (no nested fight) are stored on the Node (`node.onWin`) and applied by `RUN.combatDone`. The combat Node replaces `R.node` on the same tile (`RUN.eventChoose` returns it as `fight`), so `finishNode` marks the event tile done after the reward |
| `flag` | `k`, `v?=1` | `R.flags[k] = v` |
| `paint` | `n` | paints n hexes for free along the cheapest chain toward the boss |
| `cardReward` | `rarity?`, `hero?`, `n?=3` | a skippable card pick like a combat reward |

  Bounds the validator enforces: `n` on the card ops and `addCurse` and `cardReward` is 1..5, `paint` `n` is 1..12, `fight.enemies` lists 1 to 4 ids, `gold` and `ink` take a whole `n` (negative is a cost) or a non-zero `pct` in -1..1 (`heal` and `hurt` need a positive `n` or a `pct` in (0,1]), `maxHp` a non-zero whole `n`.
  `choice.req` keys (all must hold): `gold:N` (has at least N), `hpPct:F` (every living hero at or above fraction F of max HP), `hpBelow:F` (some living hero below F), `relic:id`, `flag:k` (truthy),
  `hero:id` (in the party), `chapter:n`. Ops that need a UI choice return `pending` entries from `RUN.applyOps`; `RUN.resolvePending` answers them.
- **Chapter end**: after a boss, `ECONOMY.chapterEnd`: +8 max HP each, then heal 30% of max HP (`healMul` applies), then the next chapter's map. Ink is topped up to `mods.startInk` if it is lower (4.8).

### 4.10 Difficulty, Trials, Daily Tale, score, stats, meta

- **Ink Trials** 0 to 10 (`DATA.trials`): a level's `mods` (`LISTS.trialMods`) are that level's own INCREMENT and playing trial N sums levels 1..N (`DATA.trialDeltas`). Level 0 is the base game.
  Trial N+1 unlocks when trial N is won. `trialBest` = the highest trial level WON (0 if only trial 0 was won); `META.trialMax()` = `wins > 0 ? min(10, trialBest + 1) : 0`; an achievement
  `trialBest gte N` means trial N was won.
- **Daily Tale**: seed = the local date as `YYYYMMDD` (`U.dateKey`), heroes from `RUN.dailyHeroes(seed)` (two distinct ids from all four, ignoring hero locks, drawn with `U.rng(U.hash(seed, 'daily', 'heroes'))`),
  trial 0, and every locked card, relic and gem counts as unlocked so everyone plays the same tale. It reads and writes the profile only for `dailyRuns` and Inkstones at half rate.
- **Score** (`RUN.score`): `max(0, 100 * chaptersCleared + 60 * bossKills + 15 * elites + floor(gold / 10) + 2 * sum(maxHp) + 2 * upgradedCards + 3 * filledGemSlots - 5 * curseCards - floor(turns / 2))`
  (constants in `ECONOMY.score`). Shown on the end screens and stored in run history.
- **Inkstones** are the meta currency: `META.recordRun` pays `floor((4 * chaptersCleared + (win ? 15 : 0) + 3 * trial + floor(score / 60)) * (daily ? 0.5 : 1) * (abandon ? 0.5 : 1))`, floored once at the end
  (`ECONOMY.inkstones`). They are spent in the **Library** on entries derived from every def with `locked:true` (cards, relics, gems; prices `ECONOMY.library`), plus achievement rewards. Heroes 3 and 4
  unlock through achievements `ch1_clear` and `ch2_clear` (see `DATA.heroes`). Locked content is filtered out of every reward pool, shop, chest, event and gem cache until unlocked (`R.unlocked`).
- **Stat counters** (`LISTS.statKeys`; `LISTS.statMax` keys merge with max, all others add). COMBAT reports per fight in `C.stats`: `turns cardsPlayed attacksPlayed damageDealt` (enemy HP removed) `damageTaken` (hero HP lost to
  hits and thorns) `blockGained maxHit` (largest raw single hit) `maxTurnDamage` (most `damageDealt` in one player phase) `swaps heroDowns revives poisonKills burnKills thornKills multiHitTurns` (player turns where
  one `dmg` op landed 3 or more hits) `zeroCostTurns` (player turns with 3 or more cost-0 cards played), plus `kills:[{def, tier, by:'card'|'poison'|'burn'|'thorns'|'hook'}]`. RUN merges into `R.stats`: `kills`
  += `kills.length`, `elites` += count of tier elite, `bossKills` and `boss<chapter>Kills` += 1 on a boss win, `flawlessBosses` += 1 when a boss fight took 0 `damageTaken`, `mercy` += 1 per mercy grant, every other
  numeric key adds (max keys use max). Run-level keys: `hexesPainted brushesUsed wellsDrunk chestsOpened shopsVisited goldEarned goldSpent purchases campRests upgrades gemsSocketed relicsFound eventsSeen`.
  `META.recordRun` merges `R.stats` into the profile and adds `runs`, `wins` or `deaths`, `winsHanae` and so on for both party heroes on a win, `smallDeckWins` when won with a deck of 15 cards or fewer, `maxDeck` (deck size
  at the end), `curseCards` (curses in the deck at the end), `dailyRuns`, and `trialBest`.
- **Achievements**: `{id, name, text, stat:{k, gte}, reward?:{inkstones:n}}`. `ch1_clear` is `boss1Kills gte 1`, `ch2_clear` `boss2Kills gte 1`, `ch3_clear` `boss3Kills gte 1`.

## 5. Module contracts

The header comment of each module is its contract of record and must list every public function with its signature. Wave-2 modules read the real code.
The shapes below are what other modules may already rely on.

### 5.1 `DATA` (`data.js`, `data_text.js`)

Registries: `DATA.cards heroes gems relics enemies events achievements trials tips lore encounters brushes tiles statuses keywords ECONOMY SETTINGS LISTS ROSTER FIXED QUOTA GUIDE`.
`DATA.add(kind, defs)` takes an object keyed by id (`{hanae_slash: {...}}`; an array throws), except `tips`, which takes a string or an array of strings. `DATA.addEncounters`.
`DATA.validate(only?, opt?)`: lenient by default (references to content other files may not have written yet are skipped); `DATA.validate(only, {strict:true})` checks every cross-file reference and
that all fixed content exists; `opt.hero` and `opt.chapter` scope the card and enemy checks; the starter-card check runs for a hero when `opt.strict` or `opt.hero` names it. `DATA.audit(kind?, opt?)` returns the
quota breaks (`audit ...`) and numeric guideline breaks (`guide ...`). Lookups and pure helpers (all in `data.js`): `hero card cardsBy rewardPool(heroId, rarity, unlocked) relicPool(rarity, unlocked, heroIds)
gemPool({tier,color}, unlocked) enemyIds groupById eligibleGroups isStatus isDebuff isBuff isUnlocked walkOps foldMods trialDeltas modsFor rowFor tileCount cleanSetting`. `unlocked` is
`{card:[ids], relic:[ids], gem:[ids]}`, the locked defs the player owns; undefined means everything.

`data_text.js` (owner: the combat engineer) adds, all pure and DOM-free:

```
DATA.resolveCard(inst | id, ctx?)  -> { inst, def, id, name, cost, costX:bool, type, rarity, kw:[], slots:[colour], gems:[gemId|null], fx:[ops], hero, up:bool, playableType:'attack'|'skill'|'power'|null, art }
DATA.cardHtml(inst | id, ctx?)     -> HTML string for the rules text. Keywords wrapped as <span class="kw" data-kw="block">Block</span> (data-kw is a key of DATA.keywords OR DATA.statuses,
                                     UI.tip.kw resolves both); numbers as <span class="num">6</span> with class "up" when higher than the base card value or "down" when lower (compares to the
                                     un-gemmed, un-boosted card, or to base when ctx has live modifiers). ctx = { unit (acting hero unit, for live Might/row numbers), C (combat) } optional.
DATA.cardPlain(inst | id, ctx?)    -> the same text without markup, for tests and aria labels
DATA.opsText(ops, ctx?)            -> plain text for an op list (relic hooks, events). A `hook` op reads "Whenever you play a Skill, gain 1 Sumi.", "At the start of your turn, ...", "Next turn: ..."
                                     The move, start, phase and hook fx arrays of registered ENEMIES are recognised by identity and read from the enemy's side ("Deal 5 damage and
                                     apply 1 Vulnerable to the front hero."); ctx.enemy forces the enemy side for any other list.
DATA.moveText(move)                -> the bestiary sentence for one enemy move (opsText of its fx with the enemy side forced)
DATA.hookText(hook, ctx?)          -> one sentence for a hook {on, fx, filter?, limit?, once?, every?}. A hook inside a CARD says "you" for its own hero and "either hero" when filter.hero is
                                     'any'; a relic or passive keeps the plain "you".
DATA.gemText(gemId | def)          -> plain text, e.g. "+2 damage"
DATA.relicText(id)                 -> relic.text
DATA.statusText(id, n)             -> "Poison 4: At the start of its turn..." with the stack inserted
DATA.intentText(intent)            -> e.g. "Deals 7 x2 to the front hero". Parts are grouped by target into one sentence: "Deals 6 to the front hero and applies 1 Weak and 1 Frail to both
                                     heroes", "Gives all enemies 8 Block", "Heals the enemy with the lowest HP for 12" (C.intent carries who gets each effect: statuses[].to, blockTo, healTo)
DATA.rowText(heroId, row)          -> e.g. "Front: +2 damage on attacks"
DATA.targetMode(inst | id)         -> 'enemy' | 'none'
DATA.cardOps(resolved)             -> flat op list
```

### 5.2 `COMBAT` (`combat.js`)

```
COMBAT.create({ heroes:[{id,hp,maxHp}], frontIdx, deck:[inst], enemies:[enemyId], tier:'normal'|'elite'|'boss', chapter, seed, mods, relics:[ids], gold }) -> C
```

`mods` is `RUN.mods(R)` verbatim (4.7); `gold` is the run gold for `stealGold`; `tier` is the fight's reward tier, echoed as `C.tier` (HP scaling reads each unit's own tier: minion and normal use `enemyHp`, elite `eliteHp`, boss `bossHp`). `C` is a plain object plus methods. All action methods return an **array of events** (also appended to `C.events`). State is always the
final state after the returned events; events carry snapshot values so the UI can animate step by step (5.9).

```
C.turn, C.phase ('player'|'enemy'|'over'), C.energy, C.maxEnergy, C.result (null|'win'|'lose')
C.heroes[2]  units in party order: { kind:'hero', id, name, hp, maxHp, block, st:{}, fresh:{}, rowSt:{thorns,regen}, down, row:'front'|'back' }      C.front() C.back()
C.enemies[]  units: { kind:'enemy', id:'kappa#1' (opaque), def:'kappa', name, hp, maxHp, block, st:{}, fresh:{}, down (dead or fled), fled, tier, size, lane:0..4, phase, turn, intent, loot }
C.hand / C.draw / C.discard / C.exhaust / C.powers : arrays of deck instances     C.inPlay : the card being played, or null
C.pending : null | { kind:'pick', opId:'2.0.1' (path of the op in fx), from, n (resolved), then, filter, top, optional, uids:[candidate uids] }
C.stats : per 4.10          C.rng (consumed only by create, shuffles, weighted AI rolls at intent time, random targets at execution and pick random)          C.events

C.start() -> events                    // enemy HP rolled, enemy `start` ops, shuffled draw pile, combatStart hooks, first intents, then turn 1 (4.2 step 1)
C.canPlay(uid, targetId?) -> { ok, reason }        // reasons: 'phase' 'pending' 'notInHand' 'down' 'stunned' 'unplayable' 'energy' 'target'
C.needsTarget(uid) -> bool
C.legalTargets(uid) -> [unit id]
C.play(uid, targetId?) -> events       // 4.3 Playing a card
C.canSwap() -> { ok, cost, reason }    // reasons: 'phase' 'pending' 'bind' 'solo' 'energy'
C.swap() -> events
C.endTurn() -> events                  // 4.2 steps 3 to 6: discards, enemy phase, next turn start (or combat end)
C.resolvePick(uids[]) -> events        // answers C.pending: unique candidates, count == min(n, candidates) (or <= n when optional or random)
C.preview(uid, targetId?) -> { dmg: perHit|null, hits, block, heal }   // adjusted numbers for the live card text
C.intent(enemyUnit) -> { move, name, kind, dmg (per hit or null), hits, tgt:[hero ids it would hit right now, taunt applied]|'random', block?, blockTo?, heal?, healTo?, statuses:[{s, n, to:'front'|'back'|'both'|'random'|'lowest'|'self'|'allEnemies'|'otherEnemy'|'lowestEnemy'}], adds:[{card,n,to}], summons:[{enemy,n}], text, stunned? }
C.summary() -> { result, heroes:[{id,hp,maxHp,down}], maxHpGain:{heroId:n}, stats, kills, ink, gold }
```

`C.summary().ink` is only the sum of `ink` ops; `gold` = `gold` ops plus thief loot returned minus loot never returned. `RUN.combatDone` adds kill Ink from `stats.kills` and `ECONOMY.killInk`, applies HP (downed heroes revive at `mods.reviveFrac`),
max HP gains and `frontIdx`. `canPlay`, `legalTargets`, `preview` and `intent` are pure: they never consume `C.rng`.

**Lanes.** `lane` is assigned by COMBAT so headless tests and presentation agree: the initial n enemies take lanes `5 - n .. 4` in `C.enemies` order (a boss stands alone in lane 4); each summon takes the highest free lane (a lane with no living unit,
so the lane of a dead or fled unit is free again, which is what lets a summoner keep summoning); a living unit never changes lane, and `lane` is unique among living units.
"Line order" is ascending lane: enemies act, tick and break ties in line order.

**Events** (all carry `type`; unit refs are `{kind, id}`; every event that carries a card carries a COPY `{uid,id,up,gems}` taken at emit time, never the live object; `piles = {hand, draw, discard, exhaust}` counts AFTER the event):

```
combat_start {}
turn_start {who:'player'|'enemy', turn, energy, maxEnergy}          turn_end {who}
draw {cards:[inst], reshuffled:bool, piles}      shuffle {piles}
discard {cards:[inst], reason:'endTurn'|'overflow'|'pick'|'op', piles}     exhaust {card:inst, reason:'play'|'ethereal'|'pick'|'op', piles}
add_card {cards:[inst], to, piles}       card_move {card:inst, from, to, piles}       card_upgrade {card:inst}       retain {cards:[inst]}
energy {value, delta}
play {card:inst, hero:id, target:unitId|null, cost, x?:number, to:'discard'|'exhaust'|'power'}
hit {src:ref|null, dst:ref, amount (hp lost), blocked (Block absorbed, a number), raw, crit:bool, hits, index, pierce, element, hp, block (Block left), killed:bool, group}
dodge {dst:ref, group}       thorns {src:ref (owner of the thorns), dst:ref (the attacker), amount, hp}
block {dst:ref, amount, block, group}       block_lost {dst:ref, amount, cause:'hit'|'turn'|'consume'}
heal {dst:ref, amount, hp, group}           hurt {dst:ref, amount, hp, cause:'poison'|'burn'|'op'|'curse'}
status {dst:ref, s, delta, value, group}    immune {dst:ref, s}
swap {front:heroId, back:heroId, cost, forced:bool}
intent {enemy:unitId, intent}     enemy_act {enemy:unitId, move, name, kind, say?:string}     skip {unit:ref, reason:'stun'}
summon {enemy:unitSnapshot}       enemy_phase {enemy:unitId, index, at, say}     death {unit:ref, tier}       flee {unit:ref}
hero_down {hero:id}               hero_revive {hero:id, hp}                      pick_needed {pending}
relic {id}                        gold {n}                                       ink {n}                      max_hp {hero, n}
end {result:'win'|'lose'}
```

`group` is one int per executed op (shared by every hit, block, heal, status and dodge event that op produced); the presentation uses it to play AoE in parallel.
`block_lost` says Block vanished without being spent on a hit's own absorption: `cause:'hit'` is emitted right after a `hit` that took the unit's last Block (`amount` = what it absorbed, SCENE plays `block_break`),
`'turn'` when Block clears at the start of its owner's phase (only when it was above 0), `'consume'` for `consume:'block'`. `enemy_act.say` is the move's `say` bark text. `relic {id}` says a relic hook just ran (flash its
icon); `gold {n}`, `ink {n}` and `max_hp {hero, n}` echo run-level ops applied mid-combat (the screen updates its counters from them); `end` is always the last event of a combat. `pick_needed` is always the LAST event of its array.
`intent` events are sent only when an intent is rolled or re-rolled by a phase; after every drained batch the UI calls `C.intent(e)` again for each living enemy, because swaps, Block, Taunt and statuses change the
displayed numbers. `C.phase` is never the name of an event (the boss event is `enemy_phase`).

Rules the engine must satisfy: exhaustive `DATA.cards` playability (a randomised suite plays every card in every hero and row and state without throwing); determinism given `seed`; `C.play` on an illegal action returns `[]`
and changes nothing; the enemy phase never runs after `over`; conservation (4.3); a combat test for each of: enemy Weak 1 lowers the hero's first attack next turn by 25 percent, enemy Stun 1 makes that hero's cards
unplayable for exactly one turn, enemy Bind 1 blocks exactly one swap, a `turnStart` energy hook survives the energy reset, `status_wilt` drawn at turn start costs Energy.

### 5.3 `MAP` (`map.js`)

```
MAP.generate({ chapter, seed }) -> M
M = { v:1, chapter, seed, cols, rows, tiles:{ 'q,r': T }, start:{q,r}, boss:{q,r}, pos:{q,r} }
T = { q, r, type, painted, known, done, diff, content:{...} }
```

`content` per type: `enemy/elite: {enc: groupId}`, `chest: {gold, relic: rarity|null, gems:bool}` (exactly one of relic and gems), `brush: {id}`, `well: {ink}`, `event: {id?}` (id chosen by RUN if absent), `shop: {seed}`,
`gemcache: {}`, `forge: {}`, `camp: {}`, `boss: {}`.

```
MAP.key(q,r)  MAP.parse(key)  MAP.DIRS (6 [dq,dr], order in 4.8)  MAP.neighbors(M,q,r) -> [[q,r]] (existing tiles)  MAP.dist(aq,ar,bq,br)
MAP.canPaint(M,q,r) -> { ok, reason? }            // hidden, not block, adjacent to a painted tile
MAP.paint(M,q,r) -> tile                          // marks painted (no Ink accounting: RUN owns Ink)
MAP.pathToPaint(M,q,r) -> { path:[[q,r]...], cost }   // cheapest chain of unpainted non-block hexes from the painted area to (q,r); cost = its length; null if impossible
MAP.canBrush(M, brushId, q, r, dir) -> { ok, reason }   MAP.brushCells(M, brushId, q, r, dir) -> [[q,r]] ([] when not ok)   MAP.applyBrush(M, brushId, q, r, dir) -> [tiles]
MAP.canMove(M,q,r) -> bool  MAP.move(M,q,r) -> tile  MAP.walkPath(M,q,r) -> [[q,r]...]|null   // painted, non-block, adjacent to pos for canMove
MAP.solve(M) -> { ok, minInk }                    // minimum paints to connect the painted start area to the boss (4.8)
MAP.progress(M) -> { painted, total, pct }
MAP.toPixel(q,r,size) -> {x,y} (hex centre)   MAP.fromPixel(x,y,size) -> {q,r}   MAP.corners(x,y,size) -> [{x,y}x6]   MAP.bounds(M,size) -> {x0,y0,x1,y1}
MAP.serialize(M) / MAP.deserialize(o)
```

Tests: 300 seeds x 3 chapters generate valid maps (tile counts from `DATA.tileCount`, start in column 1, boss in column 19, start and boss reachable, `solve.minInk` in `ECONOMY.map.solve.min..max`, no landmark
unreachable, at least 3 wells within 3 hexes of the cheapest route), round-trip serialise, brush geometry for every brush in every direction, pixel to hex round trip.

### 5.4 `RUN` (`run.js`)

Owns everything that lives for one run. `RUN.newRun({heroes:[id,id], trial, seed, daily, unlocked, nonce}) -> R`. `nonce` (optional) is hashed into `R.id` only, never into any RNG stream: GAME passes a clock plus counter so every started tale has its own id (the paid-runs ledger in 5.5 depends on it), tests and the bot pass none and keep deterministic ids. `unlocked` is `{card,relic,gem}` (the locked defs the player owns); RUN stores it as `R.unlocked` (saved) and every pool draw
(card rewards, shop, chests, events, gem caches) skips a def that is `locked` and not in it. RUN never calls META. Key shape:

```
R = { v:1, id, seed, trial, daily, mods (trial deltas only), unlocked, heroes:[{id,hp,maxHp}], frontIdx, deck:[inst], gems:[gemId], relics:[id], brushes:[id],
      gold, ink, inkMax, chapter, map:M, node:null|Node, stats:{...}, flags:{...}, rareOffset, removals, seen:{events:[],...}, log:[], done:bool, victory:bool }
```

**Randomness.** R stores no RNG state. Every roll builds `U.rng(U.hash(R.seed, kind, R.chapter, q, r, extra))` with `kind` in `'map'` (as `U.hash(R.seed, 'ch' + n, 'map')`), `'combat'`, `'reward'`, `'chest'`, `'gemcache'`,
`'event'` (extra = choice index), `'shop'` (MAP's `content.shop.seed`), `'mercy'`, `'trialCurses'`, so reloading mid-event replays the same outcome. Only `GAME.newRun` may read the clock to make a seed (section 2).

Public API (each returns plain data and never touches the DOM; the module header is the contract of record):

```
RUN.newRun(opts)  RUN.dailyHeroes(seed) -> [idA, idB]  RUN.startChapter(R, n)  RUN.mods(R) -> final flat mods (DATA.modsFor(R.relics, R.mods))
RUN.paint(R,q,r) -> {ok, tiles, reason}     RUN.useBrush(R, brushId, q, r, dir) -> {ok, tiles, reason}    RUN.paintPreview(R,q,r) -> {path, cost, affordable}
RUN.step(R,q,r) -> Node|Instant|null        // move onto a painted adjacent tile; returns what happens there. Instant = {kind:'well'|'brush', gained|id, done:true} (already applied, tile done)
Node = { kind:'combat'|'reward'|'shop'|'event'|'camp'|'forge'|'chest'|'gemcache', tile:{q,r}, tier?, enc?, enemies?, stock?, event?, loot?, offers?, rewards?, source?, onWin?, ... }
RUN.combatInit(R, node) -> opts for COMBAT.create      RUN.combatDone(R, C) -> Rewards       // applies hp, revives, kills, stats; turns R.node into {kind:'reward', rewards, source, tile}
Rewards = { gold, ink, cards:[cardId...] (offers, may be empty), relics:[relicId] (offers), gems:[gemId], brush:id|null, maxHp:0, boss:bool, tier, source }   // rolled once inside combatDone, never re-rolled. `gold` and `ink` are already added to R (the screen only displays them, so a reload cannot lose or double them); the rest are offers that RUN.claim resolves
RUN.claim(R, rewards, choice)  // choice = { card: id|null(skip), relic: id|null, gem: id|null, takeBrush: bool }
RUN.take(R, node, choice) -> {ok}    // chest {relic:bool, gem:id|null} (its gold is granted on take), gemcache {gem:id}
RUN.shopBuy(R, stock, key) -> {ok, reason}   RUN.shopRemove(R, stock, uid) -> {ok}
RUN.eventChoose(R, eventDef, i) -> { text, applied:[...], fight?:Node, pending?:[...] }
RUN.applyOps(R, ops, ctx) -> {log:[...], pending:[{id, op, n, pick, filter}]}     RUN.resolvePending(R, id, choice) -> {ok, log}   // choice = uids for card ops, a card id for cardReward, null to skip an optional op
RUN.hook(R, name, ctx) -> {log, pending}
RUN.campAction(R, 'rest'|'sharpen'|'gems'|'meditate', arg) -> {ok,...}
RUN.addCard(R,id,opts) RUN.removeCard(R,uid) RUN.upgradeCard(R,uid) RUN.socket(R,uid,slot,gemId)      // replacing a gem in a slot is the only way to lose one
RUN.checkStranded(R) -> bool     // 4.8 mercy rule; called at the end of step, paint, useBrush, finishNode and claim
RUN.finishNode(R) -> {chapterEnded}   // marks R.node's tile done, clears R.node, calls checkStranded. Screens never touch tile.done
RUN.chapterEnd(R) -> { next:2|3|'victory', healed:[...], maxHp:8 }   // after the chapter 3 boss: next 'victory', no heal and no max HP (recordRun follows)
RUN.score(R)  RUN.summary(R) -> {score, victory, chapter, trial, daily, seed, heroes:[{id,hp,maxHp}], deckSize, relics:[ids], gold, stats}
RUN.serialize(R)  RUN.deserialize(o) -> R|null   // null when o.v differs; drops deck entries whose id is no longer in DATA.cards; calls U.resetUid(1 + max uid in deck)
```

**Node lifecycle and saves.** `R.node` holds exactly one pending node: a Node (a shop's stock is built once from the tile seed), or a `{kind:'reward', ...}` created by `combatDone`. `GAME` calls `META.saveRun` after every
`RUN.step` (node entry, or an instant well or brush rack that `step` already applied and marked done), after `combatDone` and after `finishNode`; `GAME.nodeDone()` calls `RUN.finishNode` then `META.saveRun`. A reload
mid-node therefore restarts that node from its entry state with the deck, HP, gold and Ink from before it, and because every roll is seeded (above) the same shop, chest and event outcomes come back, so a reload never re-rolls a
gamble and never keeps a purchase. Combat is not resumable: Continue re-enters a saved `combat` node with the same seed and deck. The title's Continue shows "Chapter 2, Ink 5, Hanae and Kuro".

### 5.5 `META` (`meta.js`)

Profile in `localStorage['rb_profile_v1']`, current run in `['rb_run_v1']`, settings inside the profile. Never rename these keys. Profile shape:
`{v:1, inkstones, stats:{statKey:n}, ach:{id:timestamp}, unlocked:{card:[],relic:[],gem:[],hero:[]}, seen:{enemyId:n}, kills:{enemyId:n}, story:{loreId:true}, history:[...max 20], settings:{...}, tutorial:{flag:true}, daily:{last:YYYYMMDD}}`.
`META.load` wraps `localStorage` in try/catch (private mode falls back to memory) and, on corrupt JSON, keeps the raw string under `'rb_profile_v1_bad'` and starts fresh. `META.save()` and `META.saveRun()` return false when storage throws (the memory copy is then what the session reads back, so Continue never rolls back). **Several tabs**: every profile write first pulls what another tab stored since this page last looked and merges it three ways against the snapshot this page last synced (counters keep the other tab's total plus this page's own change, bests keep the larger, lists and flag maps keep both sides' additions and honour removals, settings take this page's value only for a key it changed, history merges by run id); `META.reset` (Erase) writes straight through. `profile.paid` lists run ids already paid out (newest first, max 100, survives an Erase): `saveRun` never writes a paid run back, `loadRun`, `hasRun` and `runInfo` drop it, and `recordRun` pays a run id once. GAME calls `META.refresh()` on the window `storage` event and when the tab becomes visible.

```
META.profile (live)  META.load()  META.save()  META.reset()
META.get(k) META.set(k,v)   // settings, domains and defaults in DATA.SETTINGS (DATA.cleanSetting): musicVol sfxVol shake reduceMotion textScale fastAnim damageNumbers colorblind quality hints
META.saveRun(R) -> bool   META.loadRun() -> R|null   META.clearRun(id?) (with an id another run's save is left alone)  META.hasRun()  META.runPaid(id) -> bool  META.refresh() -> profile
META.track(stat, n=1) META.stat(k) -> number      // stat keys are DATA.LISTS.statKeys; DATA.LISTS.statMax keys merge with max; achievements read them
META.check(R?) -> [newlyUnlockedAchievementIds]   // evaluates achievements against profile.stats plus R.stats (non-destructive); GAME calls it at every chapterClear so Suzu and Raiga unlock mid-run. A second argument `now` (GAME passes Date.now(); logic never reads the clock) is the timestamp stored in `ach[id]`
META.bus (U.bus): 'achievement' {id}, 'unlock' {kind,id}
META.isUnlocked(kind, id) -> bool                 // kind: 'hero'|'card'|'relic'|'gem'|'trial'; defs without locked:true are always unlocked
META.unlockedSet() -> {card:[],relic:[],gem:[]}   // what GAME passes to RUN.newRun
META.libraryList() -> [{kind,id,cost,unlocked,affordable}]   META.buy(kind,id) -> {ok,reason}
META.inkstones  META.recordRun(R, outcome:'win'|'lose'|'abandon', now) -> { inkstones, newAchievements, newTrial, heroesUnlocked }   // calls check again after merging
META.seen(enemyId) (GAME calls it once per enemy id when a fight node is entered; saves at once; daily runs record kills too) META.bestiary() -> [{id,seen,kills}]   META.history -> last 20 runs [{score,heroes,chapter,outcome,trial,daily,ts}]
META.loreSeen(id) META.markLore(id) META.storyList() -> [{id,seen}]   // every lore id EXCEPT barks_* (those are in-combat lines, not stories), seen or not, for the Library Story tab
META.trialMax() -> highest selectable trial    META.dailySeed(date) -> YYYYMMDD int (U.dateKey; the caller passes the Date)    META.tutorial(flag) / META.setTutorial(flag)
```

### 5.6 `ART` (all `art*.js`) -- see ART_BIBLE.md for style

`art.js` creates EVERY namespace and function listed in this section as a working placeholder (a labelled coloured rect or circle, never throws, safe with the no-op context), so `ui.js`, `scene.js` and every
screen can be built and tested before the real art lands. Real art files REPLACE members by plain assignment (`ART.icon.draw = ...`), never by wrapping. All `ART.*` draw functions must never throw for unknown ids.

```
ART.tk         toolkit (art.js): palette (ART.tk.pal), inkStroke, inkPath, cel fill helpers, halftone, sparkle, eye, hair ribbons, paperGrain, opt {reduceMotion, quality}
ART.res        backing-store multiplier (= UI.px)      ART.has(kind, id) -> bool (true only for real, non-placeholder art)      ART.sheet(name, fn) registers a gallery sheet into the registry ART.sheets (a plain object {name: fn}, or a Map; gallery.html reads it, sets ART.res and calls ART.sprite.clear(), so art.js keeps those as plain members) and throws on a duplicate name
ART.sprite(key, w, h, drawFn) -> canvas    // memoised offscreen canvas of (w*ART.res, h*ART.res) with the context pre-scaled: drawFn paints in w x h, callers ctx.drawImage(spr, x, y, w, h); LRU cap 400; ART.sprite.clear()
ART.hero.draw(ctx, heroId, {x, y, s, pose, t, pt, flip, alpha, glow})   // origin at feet centre, nominal height 250 * s
ART.hero.portrait(ctx, heroId, {x, y, w, h, expr, t})   // bust; x,y = top-left; composed for 3:4, other ratios scale to cover and crop keeping the face; expr in LISTS.expressions
ART.hero.medallion(ctx, heroId, x, y, r)                 // round face icon, x,y = centre
ART.hero.bounds(heroId) -> {w, h, head:{x,y}, hand:{x,y}, feet:{x,y}, weapon:{x,y}}   ART.hero.poseMs(pose) -> natural length in ms
ART.enemy.register(id, { draw(ctx, o), bounds:{w,h,head:{x,y},body:{x,y},feet:{x,y}} })   // art_enemies_N.js call this once per id of chapter N (the 3 files are disjoint by DATA.enemies[id].chapter)
ART.enemy.draw(ctx, enemyId, {x, y, s, pose, t, pt, flip, hpPct, phase, alpha, glow})
ART.enemy.bounds(enemyId) -> same shape as register      ART.enemy.poseMs(pose)
ART.card.draw(ctx, cardIdOrInst, w, h, t?)      // paints at (0,0) of the current transform, cached per id + up + size
ART.card.motif(ctx, motifId, x, y, size, palette, t)   // exported and reused by art_icons for the ids LISTS.motifs and LISTS.relicIcons share
ART.icon.draw(ctx, kind, id, x, y, size, opts)  // (x,y) = CENTRE, size = box edge in px
ART.scene.draw(ctx, sceneId, w, h, t, opts)     // paints at (0,0); LISTS.scenes; opts {particles, parallaxX};  ART.scene.logo(ctx, x, y, w, t)
ART.map.hex(ctx, kind, x, y, size, opts)        // (x,y) = centre; kind in LISTS.mapKinds
ART.map.paintBloom(ctx, x, y, size, p)          // p = 0..1        ART.map.token(ctx, heroIds, x, y, t, moving)   // t = seconds
ART.fx.NAME(ctx, o, t)                          // see below
```

**Time and pose progress.** `ART.hero.draw` and `ART.enemy.draw` take `t` (absolute seconds, drives loops) and `pt` (seconds since the current pose began, 0 for idle). One-shot poses (`attack cast hurt block buff die telegraph
down cheer`) derive their swing, recoil and dissolve from `pt` and HOLD their end pose for any larger `pt`; loops derive from `t`. `poseMs(pose)` returns the natural length (attack 420, cast 500, hurt 260, block 300, buff 400,
die 700, down 500, cheer 800; `telegraph` 0 = holds until the next pose; `idle` and `walk` are loops and return 0) so SCENE waits the right time. Elite ornament, the elite scale factor (x1.08, already included in `ART.enemy.bounds`) and nominal height come from `DATA.enemies[id].tier` and `.size` inside ART; the `s` option is a pure extra multiplier (default 1) and SCENE never
scales by tier. `phase` = `unit.phase` (0 at the start of the fight).

**Enemy registration.** `draw(ctx, o)` receives `o = {s, pose, t, pt, hpPct, phase, glow}` with the context ALREADY translated to the feet centre and scaled, so it always paints around (0,0), y negative up, facing left. `ART.enemy.draw`
(in `art.js`) does: lookup, `ctx.save`, translate, scale by `s` (and `-1` on x when flipped), ground shadow ellipse, tier aura and ornament, `entry.draw`, restore. An unknown id draws a labelled placeholder.

**Bounds** are offsets from the feet-centre origin at s=1, y negative is up, NOT mirrored by `flip` (callers mirror x).

**`ART.icon` ids by kind.** `status` = a `DATA.statuses` id; `relic` = a RELIC id (`art.m` and `art.c` are looked up in `DATA.relics[id]`); `gem` = a GEM id (colour, tier and cut from `DATA.gems[id]`) or
`'slot:red|blue|green|gold|any'` for an empty socket; `tile` = a `LISTS.tiles` id (`opts.done` fades it); `intent` = a `LISTS.intents` id (`opts.n` draws the number); `stat` = a `LISTS.statIcons` id; `brush` = a `DATA.brushes`
id; `type` = a card type; `row` = `front` or `back`; `motif` = a `LISTS.motifs` id. `opts = { n?, t? (seconds), dim?, glow?, on? (lit or filled), done?, color? }`. Gems, sockets and the prism ALWAYS carry a colour-independent
engraved glyph (red sword, blue shield, green leaf, gold star, prism ring) so colour-matching works without colour vision; a distinct cut per colour is not required, the glyph is.

**`ART.map.hex`** kinds: `fog known ground block painted edge path hover target`; `opts = { tile:LISTS.tiles id (wash colour and stamp), seed:int (wobble variant, pass U.hash(q,r)), done:bool, t:seconds }`; cached by kind, tile,
done, `seed % 8` and size. Hex geometry is defined in 4.8.

**`ART.fx.NAME(ctx, o, t)`** is ONE signature for every effect. `t` is progress 0..1; SCENE owns timing in ms (`ART.fx.ms[NAME]`). Each is a pure function of `(o, t)`: no internal state, no `Math.random`; particles derive from `o.seed`
and `t`, so any `t` can be drawn in any order (the gallery relies on this). `o = { x, y, x2?, y2?, s?:1, color?, color2?, dir?:1|-1, ang?, seed?:int, text?, kind?, w?, h? }`, unknown keys ignored; `(x,y)` is the origin in stage px
(impact point, caster centre or line start), `(x2,y2)` the end point for `chain`, `lightning`, `thrust`, `brushDrag`, `s` a size multiplier, `seed = U.hash(eventIndex)`. `ART.fx.names` is exactly `LISTS.fx` (24 names:
`slash cross thrust burst ring inkSplash petals lightning chain flame frost poison shield heal buff debuff sparkle speedLines impactFrame sfxText vignette chromatic brushDrag numberPop`). `ART.fx.ms` are defaults art_fx may retune:

```
slash 260  cross 340  thrust 240  burst 300  ring 420  inkSplash 700  petals 1100  lightning 380  chain 420  flame 700  frost 600  poison 800  shield 500  heal 800
buff 700  debuff 700  sparkle 600  speedLines 280  impactFrame 140  sfxText 520  vignette 400  chromatic 220  brushDrag 450  numberPop 900
```

Full-screen effects (`impactFrame`, `vignette`, `chromatic`, and `speedLines` when `o.w` and `o.h` are given) ignore x,y and cover `o.w x o.h` (default 1280 x 720). `numberPop` `o = {text, kind:'dmg'|'crit'|'heal'|'block'|'poison', s}`;
`sfxText` `o = {text:'ZAN!', ang, s}`; `shield` `o = {w, h}` is the area to cover; `chain` and `lightning` need `x2,y2`; `impactFrame` uses `globalCompositeOperation 'difference'` (never `getImageData`); `chromatic` redraws
`ctx.canvas` onto itself with offsets and channel masks. Each effect is registered as a gallery sheet `fx` (a grid: every name at t = 0, .25, .5, .75, 1).

**Test** (`tests/rogue_book_art.test.mjs`, the Wave 2 exit gate): `ART.has` is true for every `LISTS.motifs` id (kind `motif`), every `LISTS.relicIcons` id, every `DATA.statuses` id, every `LISTS.tiles` id, every `LISTS.intents` id,
every `DATA.enemies` id and every `DATA.gems` id, and `ART.fx.names` equals `LISTS.fx`. Each art file registers its own gallery sheets with `ART.sheet(NAME, (canvas, params) => void)`.

### 5.7 `AUDIO` (`audio.js`)

```
AUDIO.init()                       // call on first user gesture; safe to call repeatedly; no-op headless. Constructs the AudioContext lazily in a try/catch: if it throws AUDIO.ready stays false and every call is a silent no-op
AUDIO.sfx(id, opts?)               // id in DATA.LISTS.sfx; opts {vol, pitch, pan, delay}. Dropped before init
AUDIO.music(trackId|null, opts?)   // id in DATA.LISTS.music; crossfades; null stops. Before init the request is remembered and starts inside init()
AUDIO.setVolume('music'|'sfx', 0..1)   AUDIO.duck(ms)   AUDIO.suspend() / AUDIO.resume()   AUDIO.current -> track id   AUDIO.ready -> bool
AUDIO.intensity(n)                 // 0..1; screen_combat calls it with 1 - living/starting enemies, plus 0.25 per boss phase entered
```

`audio.js` never references `META`: `UI.applySettings()` is the only bridge. The suite `tests/rogue_book_audio.test.mjs` calls `AUDIO.sfx(id)` for every id in `LISTS.sfx` and `AUDIO.music(id)` for every id in `LISTS.music`,
then pumps the loader's timers, and asserts no throw.

### 5.8 `UI` (`ui.js`)

**Stage, scaling and layers.** `UI.W=1280 UI.H=720`. `UI.resize()` runs on `resize`, `orientationchange` and `visualViewport` resize: `vw, vh` = the visual viewport size, `UI.scale = min(vw/1280, vh/720)`, `#stage` is 1280x720 with
`transform: translate(x,y) scale(UI.scale)` and origin 0 0 (never set `will-change` on it). Backing store: `UI.px = clamp(UI.scale * devicePixelRatio, 1, 2)`; `#view` and `#over` have width `round(1280*UI.px)` and height
`round(720*UI.px)` and every frame does `ctx.setTransform(UI.px,0,0,UI.px,0,0)` so all drawing keeps stage coordinates; DOM icon canvases made by UI helpers use the same `UI.px`; `ART.res = UI.px` and when it changes UI calls
`ART.sprite.clear()`. Never use `getImageData` or `putImageData` on a per-frame path.

`index.html` stacks (`z` in brackets): `#view` canvas [0] world painted by the current `screen.draw`; `#screens` [10]; `#overlays` [20]; `#over` canvas [30] transitions, impact frames and full-screen flashes; `#tips` [40] tooltips and
tutorial hints; `#toasts` [50]. `UI.layers = {view, screens, overlays, over, tips, toasts}`. `base.css`: `#screens,#overlays,#tips,#toasts,#over{position:absolute;inset:0;pointer-events:none}`
`button,.card,.hit,[role=button],input,.panel{pointer-events:auto}` `#stage{touch-action:none;user-select:none;-webkit-tap-highlight-color:transparent}`. `#view` receives pointer events: screens use `UI.canvasOn(type, fn)`
(auto-removed at leave) and read stage coordinates from `UI.toStage(clientX, clientY)`.

**Hit targets and small screens.** Hit targets are 44 CSS px on the SCREEN: `base.css` sets `--scale` and `--hit: max(44px, calc(44px / var(--scale)))` and every interactive element has `min-width` and `min-height` `var(--hit)`
(the drawn art may be smaller, the hit area is padded or uses `::after`). Below `UI.scale` 0.75 UI adds class `compact` to `#stage`: screens may drop secondary chrome but never shrink `--hit`. **Portrait:** there is NO portrait layout.
While `innerHeight > innerWidth * 1.1` and `UI.scale < 0.6`, UI creates and shows `#rotate` ("Turn your device sideways", animated book), stops `UI.frame` and calls `AUDIO.suspend()`; it tries `screen.orientation.lock('landscape')`
after the first fullscreen tap. The viewport meta must not disable page zoom.

**Frame loop.** `UI.frame(now)` is called by the single rAF loop in GAME: `dt = clamp((now - last) / 1000, 0, 0.05)`; `t += dt`; tweens; `cur.update(dt, t)`; `ctx.setTransform(UI.px,0,0,UI.px,0,0)`; clear to `#0d0b1e`;
`cur.draw(ctx, t)`; transitions draw on `#over`. The loop stops while `document.hidden` and resets `last` on `visibilitychange` (no dt spike). Budget per 16.6 ms frame: scene layers 2 ms, hero and enemy draws 4 ms, `ART.fx` 3 ms,
DOM updates 2 ms; particles are capped at 500 (`SCENE.MAX_PARTICLES`); `?perf=1` shows a frame-time overlay.

**Screens and overlays.**

```
Screen: { enter(params, root), leave(), update?(dt,t), draw?(ctx,t), onKey?(e), music?, animated?:true }
UI.screens = {}          // registered by screen files: UI.screens.map = { ... }
UI.go(name, params, {transition}) -> Promise   UI.current   UI.epoch   UI.live() -> () => bool   UI.after(ms, fn)   UI.canvasOn(type, fn)
UI.overlays = {}         // UI.overlays.NAME = { open(params, root, close) }: UI creates root <div class="overlay o-NAME"> in #overlays, the overlay builds inside it and calls close(result) to resolve the promise; UI removes root
UI.overlay.open(name, params) -> Promise<result>   UI.overlay.close(result?)
UI.modal({title, body, buttons:[{label, kind, cb}], dismiss}) -> close fn         UI.toast(text, kind)
UI.menuButton() -> el    // the pause button every screen except title and the menu screens includes at top-right, 56 px
```

`root` is a fresh `<div class="screen s-NAME">` that UI appends to `#screens`; the screen builds ONLY inside `root`. `UI.go` removes `root` after `leave()` even if `leave` threw or is missing. Anything registered through UI helpers while a
screen is current (`UI.onKey`, `UI.canvasOn`, `UI.tween`, `UI.after`) is disposed automatically at `leave`. `UI.epoch` increments on every `UI.go`; async code does `const live = UI.live();` and returns when `live()` is false.
`UI.go` is serialised: calls during a transition queue FIFO; a repeat of the same target within 400 ms is dropped; `#stage` gets class `busy` (pointer-events none) during transitions. It resolves after `enter()` (and any promise it
returned) settled and the transition ended, then calls `AUDIO.music` with `screen.music`. `screen.music` is a track id, or `(params) => id` (combat: `elite ? 'elite' : 'combat' + chapter`; boss: `'boss' + chapter`, `'final'` for `boss_editor`
in its last phase); `undefined` keeps whatever plays (library, howto, settings); `null` stops.

Overlays form a STACK. `UI.overlay.open` ALWAYS returns `Promise<result>` (confirm -> boolean, cardPick -> `[uid]`, deck pick -> `uid|null`); `UI.overlay.close(result?)` closes the top. Esc or the back key closes the top overlay first,
then reaches `screen.onKey`. `UI.modal(opts)` is sugar over overlay `'modal'` and returns the close fn. `UI.onKey(fn, {overlay?}) -> off`: handlers get the key only when no overlay is open unless registered with `overlay:true`.
`UI.tween(obj, {prop: target}, ms, ease = 'outQuad', onUpdate?) -> Promise` animates NUMERIC properties of a plain object (for DOM use CSS classes or `el.animate`).
**Failure path:** if `enter`, `update` or `draw` throws, UI stops calling that hook, pushes `{screen, message, stack}` onto `window.__errors`, `console.error`s, and shows `UI.modal` "Something tore the page" with Back to Title and
Copy details. `tools/rogue_book/shot.mjs` reads `window.__errors`. When `window.__HEADLESS` is true, `UI.tween`, `UI.transition` and `UI.after` resolve or run on the next microtask, so a suite can await a whole combat.

**Components.**

```
UI.card(inst | id, {size:'mini'|'deck'|'hand'|'reward'|'big', unit, C, selected, disabled, onclick, showGems}) -> el
UI.cardBack(size) -> el      UI.relic(id, {size, onclick}) -> el     UI.gem(id, {size}) -> el     UI.status(id, n, {size}) -> el     UI.heroBadge(heroId, {size, hp, maxHp}) -> el
UI.stat(kind, value, {size}) -> el      // kind in LISTS.statIcons: 'gold' 'ink' 'hp' 'energy' 'brush' 'inkstone' 'block'
UI.tip.attach(el, () => html|node|null)  UI.tip.hide()      UI.tip.card(inst) UI.tip.kw(word)
UI.transition(kind, midFn) -> Promise    // 'page' (page turn), 'ink' (ink bloom wipe), 'fade'
UI.floatText(x, y, text, kind)    UI.pulse(el)    UI.shake(el)      // DOM screens only; combat numbers belong to SCENE
UI.toStage(clientX, clientY) -> {x,y}    UI.announce(text)    UI.applySettings()    UI.anchorEl(selector) -> el|null    UI.init()    UI.frame(now)    UI.bus = U.bus()
```

`UI.card` sizes (stage px, all 5:7): `mini` 72x100 (name and cost orb only), `deck` 168x235, `hand` 190x266, `reward` 240x336, `big` 300x420 (`LISTS.cardSizes`). `base.css` defines `--cw` per size class and everything inside scales
with `--cw`; screens choose a size name and never a pixel size. Sockets, rarity ornament and the hero medallion are DISPLAY ONLY on every size; socketing happens in overlay `deck {mode:'socket'}` through 56 px slot buttons under
the big card.

**Combat card interaction** (pointer events only; hand cards have `touch-action:none`, every other card `pan-y` so a swipe that starts on a card still scrolls a list of cards). Tap a card: select (it rises so its top edge is at y 420, big preview above the hand via `UI.tip.card`, `SCENE.setTargetable(C.legalTargets(uid))`). A no-target card plays on a
second tap or when dragged above y=430. A target card plays when an enemy is tapped; with a mouse or keyboard, if `legalTargets` has exactly one entry the first click plays. On touch or pen the first tap on a target card only lifts it (the rules text sits below the stage edge in the resting hand, so a touch player must be able to read before committing); it then plays on a second tap on the card, a tap on the foe, or a drag released above y=430 (single target only). Tap empty space or Esc deselects. Drag: `pointerdown` then more than 8 px starts a drag
(`setPointerCapture`, the hand re-fans); targeting cards call `SCENE.aim(cardCentre, pointer, hoveredId)` and releasing on a legal target plays, elsewhere returns. Illegal (`canPlay.ok` false): `UI.shake(card)`, a toast per reason
(energy "Not enough Energy", down "<Hero> is down", stunned, unplayable, pending, phase) and sfx `ui_error`. `SCENE.hitTest` hits `max(actor bounds, a 96x96 box at the body centre)`. `UI.tip.attach` opens on `pointerenter` for
mouse and on a 400 ms long press for touch; the tip closes on `pointerup` or the next tap. A long press that showed a tip swallows the click that ends it (`UI.tip.swallowClick(el, ms)`, one shot, capture phase, cancelled by the next `pointerdown`), so lifting a finger after reading a shop ware never buys it.

**Combat HUD zones** (stage px): top bar y 0..56 (relic strip left, turn label centre, menu button x 1212..1268, 56 px like `UI.menuButton()`); hero panels x 12..300, y 64..250 (two 92 px panels: name, HP, Block, up to 6 status chips, row tag, Swap button >= 56 px);
bottom-left dock x 12..270, y 588..712 (energy orb r44 at (70,650), draw pile x 130..250); hand x 252..970, y 566..720 at rest (a raised card's top is y 420); bottom-right dock x 1000..1268, y 588..712 (discard pile x 1000..1090,
End Turn plaque x 1100..1268, y 610..704).

**Settings.** Domains and defaults are `DATA.SETTINGS`. `UI.opt = { reduceMotion (resolved boolean: UI.init resolves null through matchMedia), shake, textScale, speed, damageNumbers, colorblind, quality }` is rebuilt by
`UI.applySettings()`, which also sets `--ts` on `#stage`, classes `reduce-motion`, `colorblind`, `low` on `<body>`, `ART.tk.opt = {reduceMotion, quality}`, `SCENE.speed`, `AUDIO.setVolume('music'|'sfx', v)`. Presentation code reads
`UI.opt` or `ART.tk.opt`, never `META.get` in a hot path. `quality:'auto'` drops to low when the 2 s average frame time exceeds 24 ms. `reduceMotion` means: no camera shake, no flashes or impact frames (a 60 ms tint instead),
parallax 0, particles x0.3, transitions become 150 ms fades, idle breathing amplitude x0.3, no button breathing, no card shimmer. `UI.init` installs a one-shot `pointerdown` and `keydown` listener that calls `AUDIO.init()` then
`AUDIO.resume()`, and `visibilitychange` calls `AUDIO.suspend` and `AUDIO.resume`.

**UI.bus and tutorial hooks.** `UI.bus = U.bus()` exists from ui.js. Events (`LISTS.busEvents`): `'screen'` `{name, params}` after every enter; `'overlay'` `{name, open}`; screen_combat emits `'combat:turn'` `{turn, phase}`, `'combat:select'`
`{uid}`, `'combat:play'` `{uid, target}`, `'combat:endturn'`, `'combat:swap'`, `'combat:pick'` `{pending}`, `'combat:end'` `{result}`; screen_map emits `'map:paint'` `{q,r,cost}`, `'map:brush'` `{id}`, `'map:walk'` `{q,r}`. Screen owners
must emit these. `tutorial.js` is one IIFE that only subscribes (`UI.bus.on`) and renders hint bubbles into `#tips` pointing at `UI.anchorEl(selector)`; it never mutates other screens and never gates input. Screens mark stable anchors with
`data-tut="hand|energy|endturn|swap|intent|enemy|ink|hex|brushes|deck|relics"` (`LISTS.tutAnchors`). Each hint has a `META.tutorial` flag and shows once; the settings toggle "Hints" and `?notutorial=1` disable it. The `tutorial`
suite drives the whole guided run beat by beat through the bus. Public API: `UI.tutorial = {enabled(), fire(id, force?), current() -> {id, el}|null, queue() -> [ids], dismiss(why?), reset(),
seen(id), flag(id) -> 'tut_<id>', idle(), HINTS, RULES, shown, counts}`. The map's `hex` anchor is an invisible box: it marks the first hex of the cheapest chain toward the boss (the `paint`
hint), moves to the hex that was just painted after a paint or a brush (the `walk` hint) and goes back to the chain once a walk starts.

**Accessibility.** Keyboard: every interactive element is a real `<button>` or has `tabindex=0` and `role=button`, with a 3 px gold focus ring; Tab and arrows move focus, Enter or Space activate, Esc = back or close top overlay or pause.
Combat: `1`..`9` and `0` select a hand card, Left and Right move between cards and then cycle targets, Enter plays, `E` ends the turn, `S` swaps, `D` and `G` open the draw and discard piles, `Z` toggles fast animation. Map: arrows pan (Shift pans three times
faster), plus and minus zoom, `F` fits the whole page (again: follows the party), `Q E A D Z C` move a hex cursor (NW NE W E SW SE), Enter or Space paints or walks to the
cursor hex like a tap, Esc cancels a chain preview or a brush, `B` opens the brush tray and `1` to `9` pick a brush. Screen reader: every `UI.card` has `aria-label` = `DATA.cardPlain(inst)` plus cost and type; status, intent and relic elements use `statusText`, `intentText`,
`relicText`; a visually hidden `aria-live=polite` `#sr` region (declared in index.html, written with `UI.announce(text)`) receives one line per drained combat batch ("Kappa attacks Hanae for 7"). `textScale`: text uses `calc(var(--fs) * var(--ts))`; fixed-size parts must not clip at ts 1.3 (card
rules text auto-shrinks to 0.8 then scrolls; buttons grow in width, not height); every screen is screenshotted once at ts 1.3. `colorblind` also draws gem and slot glyphs at 1.4x and adds a pattern fill to rarity (common solid, uncommon dots,
rare stripes) and to buff, debuff and resource status discs.

### 5.9 `SCENE` (`scene.js`)

The canvas combat stage. Owner of all actor drawing and VFX in combat.

```
SCENE.mount({ C, chapter, boss, layout?:{...} })  SCENE.unmount()      SCENE.LAYOUT
SCENE.update(dt)  SCENE.draw(ctx, t)
SCENE.play(evt) -> Promise            // animate one engine event; resolves at its GATE (below); tails keep animating
SCENE.anchor(kind, id) -> { x, y, w, h, top:{x,y}, feet:{x,y}, head:{x,y} }   // stage coordinates for DOM overlays, at REST
SCENE.hitTest(x, y) -> { kind:'enemy'|'hero', id } | null                        // stage coordinates
SCENE.setHover(kind, id)  SCENE.setTargetable([ids])                            // rings on the ground under the feet
SCENE.aim(fromXY|null, toXY, targetId|null)   SCENE.bark(heroId, text)   SCENE.banner(text, kind)   // 'YOUR TURN', 'ENEMY TURN', 'BOSS'
SCENE.shake(mag, ms)  SCENE.flash(color, ms)  SCENE.hitstop(ms)   SCENE.speed(k)   SCENE.flush()   SCENE.setViewState(id, {hp, block})   SCENE.MAX_PARTICLES
```

**Layout** (exported as `SCENE.LAYOUT`, stage px). Ground (feet) y = 520. The front hero stands at x=330, y=520, s=1; the back hero at x=170, y=508, s=0.94 (a swap hops both along an arc in 380 ms and exchanges the values).
Enemy lanes are FIXED for the whole fight: x = `[560, 705, 850, 995, 1120]` for lanes 0..4 (lane 4 nearest the right edge; an `xl` boss at x=1120 spans about 970..1270); lanes are assigned by COMBAT (5.2), a unit never changes lane, and when a unit dies its lane stays
empty (nothing shifts) until a summon takes it. Size `l` and `xl` actors may overlap neighbouring lanes; draw order is lane 0 first. `SCENE.anchor` returns at REST (no bob, lunge, hop or shake): `{x, y, w, h}` = the actor bounds rect with x,y
top-left (from `ART.*.bounds` scaled), `top = {x: centre, y: y}`, `head`, and `feet` on the ground line. Intent bubbles sit centred on `top.x` with their bottom at `top.y - 6`, clamped to y >= 62; enemy HP bars sit centred at `feet.y + 14`.
DOM overlays are repositioned once per frame after `SCENE.update`.

**Combat presentation pipeline** (`screen_combat.js` owns it, `scene.js` implements SCENE).

1. screen_combat keeps a VIEW MODEL `vm = {heroes:[{id,hp,maxHp,block,st,down,row}], enemies:[{...same, intent}], energy, maxEnergy, hand:[inst], drawN, discardN, exhaustN, turn}`, built from `C` at mount.
2. Every `C` action (play, swap, endTurn, resolvePick) returns an events array; the screen appends it to ONE FIFO and drains it: for each event `applyEvent(vm, evt)` (pure; uses only what the event carries: `hit.hp/block`, `block.block`,
   `status.value`, `energy.value`, the card copies and `piles`) then updates only the affected DOM, then `await SCENE.play(evt)`. While draining the screen NEVER reads `C.hand`, `C.heroes` or `C.enemies` (C is already final). C is used only
   for `canPlay`, `needsTarget`, `legalTargets`, `preview` and `intent`.
3. When the FIFO empties: `vm = snapshot(C)`, re-render all DOM (hard resync), refresh intents, unlock input.
4. `pick_needed` is the LAST event of its array. The screen drains to it, opens the picker (`from:'hand'` = hand select mode with a Confirm button; other piles = overlay `cardPick` with `n` and `optional`), then `C.resolvePick(uids)` and keeps draining.
5. `SCENE.play(evt)` resolves at the GATE (when the next event may start); tails keep animating. Gates in ms, divided by `SCENE.speed`: `hit` 70 for a non-final hit of the same dst and group, 120 final, 200 when `killed`, 0 when the previous event has
   the same group and a different dst (AoE plays in parallel); `play` 0, `block` 0, `heal` 60, `status` 0, `draw` 40, `discard` 0, `exhaust` 0, `energy` 0, `swap` 380, `enemy_act` 260, `summon` 400, `death` 420, `enemy_phase` 900, `hero_down` 500,
   `hero_revive` 500, `turn_start` 500, `end` 700; unlisted 0. `SCENE.speed(k)` sets the fastAnim factor (1, 1.6, 2.5). `SCENE.flush()` finishes every running beat instantly (tap-to-skip, and called by leave). After `SCENE.unmount()`,
   `play()` and pending promises resolve immediately and never reject. When `window.__HEADLESS` is true every `play()` resolves on the next microtask.
6. **Ownership.** SCENE = actors, VFX, damage, heal and block numbers (`ART.fx.numberPop`), banners, shake, target rings, aim arrow, barks and ALL combat SFX. The screen_combat DOM = HP bars, block shields, intent bubbles, status rows, hand,
   piles, energy and buttons. `SCENE.setViewState` is called only at mount and on resync.
7. **SFX map** (in `SCENE.play`): `play` -> `card_play_attack|skill|power` by card type; `hit` -> `hit_crit` if crit, else `hit_multi` if hits > 1, else `hit_heavy` if amount >= 15, else `hit_light`; a blocked hit with amount 0 -> `block_hit`;
   `block_lost` with `cause:'hit'` -> `block_break`; `block` -> `block_gain`; `heal` -> `heal`; `status` with delta > 0 -> `stun` for Stun, else `buff` or `debuff` by `DATA.statuses[s].kind` (resource counts as buff); `dodge` -> `dodge`; `thorns` -> `thorn`; `swap` -> `swap`;
   `draw` -> `card_draw`; `shuffle` -> `shuffle`; `discard` -> `card_discard`; `exhaust` -> `card_exhaust`; `energy` with delta > 0 -> `energy_gain`; `turn_start` -> `turn_start` or `enemy_turn`; `death` -> `enemy_die` (`boss_die` for tier boss);
   `hero_down`, `hero_revive`; `enemy_phase` -> `phase_change`; `summon` -> `debuff`. Every `hit` that removes HP also plays its element layer at 60% volume (fire -> `flame`, ice -> `ice`, lightning -> `zap`, poison -> `poison_tick`, slash, ink and holy -> `slash`), and a hit on a hero of amount >= 15 also plays `thud`. UI (not SCENE) plays `ui_*`, `card_hover` and `card_pick`; the map, shop and node screens play their own `paint`, `well`, `buy` style ids.
8. **Poses** (SCENE picks them; poses last `ART.*.poseMs`): enemies idle, `telegraph` while their current intent kind is `heavy` (set on each `intent` event), `attack` on `enemy_act`, `hurt` on a hit that removed HP, `block` on Block gained, `buff` on a status gained by itself,
   `die` on `death`; heroes idle, `attack` when the played card has a `dmg` op and `cast` for any other card, `hurt`, `block` on Block gained, `down` on `hero_down`, `cheer` on a winning `end`; `walk` is the map token only.
9. **Barks.** `barks_<id>` lore: `SCENE.bark(heroId, text)` draws a manga bubble for 1.8 s. screen_combat picks the key: `start` (`combat_start`), `hurt` (a hit on a hero with amount >= 25% of max HP), `kill` (a `death` right after a `hit` with `killed:true` whose `src` is that hero),
   `down` (`hero_down`), `win` (`end`, for the survivor), `swap` (`swap`, for the hero moving forward). At most one bark per 6 s, 35% chance per eligible event, drawn with `U.rng(U.hash(C.seed, 'bark', eventIndex))`.

### 5.10 `GAME` (`main.js`)

```
GAME.boot()  GAME.state = { R, pendingChapter, lastCombat, ended, ... }  GAME.params (the parsed URL params and the opts a ?goto screen receives)
GAME.newRun({heroes, trial, seed, daily})  GAME.continueRun()  GAME.abandon()  GAME.toTitle()  GAME.save() -> bool  GAME.defeat()  GAME.victory()
GAME.enterNode(node)       // routes a RUN node to its screen; Instants {kind:'well'|'brush'} only toast and save (a fable tile with no eligible event arrives as a well with its own `toast`)
GAME.nodeDone()            // called by a screen when finished: RUN.finishNode, META.saveRun, chapter flow, back to the map
GAME.debug = { ... }       // below
```

`GAME.continueRun()` routes a save with `R.chapterCleared` and no node to the chapter flow (chapter clear page for chapters 1 and 2, victory for chapter 3). `GAME.newRun` over a saved tale records the old one as an abandon (half Inkstones, stats, bestiary kills, a history row, a toast). `GAME.defeat()` and `GAME.victory()` end the run once (META.recordRun, META.clearRun, then the gameOver or victory screen; a second call is a no-op). A lost fight records the run at once when the combat
screen emits `combat:end {result:'lose'}` and routes to gameOver after 1.6 s unless the screen already did. Try Again on the game over page calls `GAME.newRun` with the same heroes and trial; with `?seed=N` in the URL
that is the same seed again (a fixed seed is a fixed tale), without it a fresh clock seed.

**Boot order** (`GAME.boot`): 1 `META.load()`; 2 `UI.init()`; 3 `UI.applySettings()`; 4 parse URL params from `window.location.search`; 5 GAME subscribes to `META.bus` `'achievement'` and `'unlock'` -> `UI.toast(text, 'achievement')` plus
`AUDIO.sfx` (only GAME subscribes); 6 start the single rAF loop; 7 `UI.go(goto || 'title')`; 8 `window.__booted = true`, add class `out` to `#boot` and remove it after 400 ms. `main.js` ends with `if (!window.__NO_AUTOBOOT) GAME.boot();`
(the test loader sets `__NO_AUTOBOOT` unless `boot({autoboot:true})`). `index.html` carries an inline watchdog that shows the load error and a Try again button if the game has not booted after 6 s.
`GAME` builds `unlocked` with `META.unlockedSet()` for `RUN.newRun`, calls `META.check(R)` at every chapterClear, and shows the story: `intro` once ever (`META.tutorial('intro')`), `chN_intro` at `RUN.startChapter`, `chN_clear` inside `chapterClear`,
`victory` and `defeat` inside those screens, `hero_<id>` on heroSelect and in the Library.

**`GAME.debug`** ALWAYS exists (a dev tool); `?debug=1` only mirrors `window.GAME`, `window.RUN`, `window.COMBAT` and friends for the console.

```
GAME.debug.open(screen, opts)   // jump to any screen with a synthetic run
GAME.debug.quickRun(opts) -> R  // build a run and go to the map
GAME.debug.win() lose() setGold(n) addRelic(id) skipChapter()
GAME.debug.freeze(on)           // stops the rAF loop
GAME.debug.tick(ms, step=16)    // advances UI.frame (and SCENE gates) with a virtual clock in fixed steps and renders, so `GAME.debug.open('combat', {...}); GAME.debug.tick(1200)` replaces --wait and every run is identical
GAME.debug.combat() -> {C, vm}  // plus .fire(evt) plays one synthetic engine event through SCENE, .play(handIndex, targetIndex) .endTurn() .swap() .setHp(who, hp) .setStatus(who, s, n) .setEnergy(n) .feed(events) .pick(uids) .win()
```

`debug.win()` is a synthetic win: it marks the foes dead on the engine and feeds `death` and `end` events, but unlike a real last blow it leaves the heroes' Block and statuses on the engine, while the
`end` event clears them in the screen's view model, so the combat screen's drift check (`[combat] the view model drifted from the engine`, a console warning) fires after it when a hero holds a status.
That warning is a debug artefact; a fight won by playing cards must never raise it. Suites that must be warning-free leave each foe at 1 HP with `setHp` and win by hand.

`open(screen, opts)` accepts (unknown keys ignored): common `heroes, seed, trial, gold, deck (card ids), relics, ink`; `combat {enemies, tier, chapter, hp:[a,b], hand:[cardIds], statuses:{unitId:{s:n}}, turn}`; `reward {source, gold, cards:[ids], relics:[ids],
gems:[ids], brush}`; `shop|camp|forge|chest|gemcache {seed}`; `event {id}`; `map {chapter, painted:0..1, ink}`; `story {id}`; `chapterClear {chapter}`; `gameOver|victory {summary}`.

URL params handled by `GAME.boot` (they work without `?debug=1`): `?goto=combat&enemies=kappa,tanuki_bandit&heroes=hanae,kuro&chapter=1` opens a screen directly (used by screenshot tooling); `?seed=N` fixes the run seed;
`?freeze=1&ticks=1200` freezes and ticks after `?goto`; `?notutorial=1`; `?perf=1`.

### 5.11 Screens

**Geometry rule (alignment).** Wherever painted art and the DOM laid over it must agree (the gem cache plinths, the reward stage axis, the shop posts and planks, the hero select row, the combat docks), ONE constant table feeds both the painter and the CSS (the page writes it into custom properties), so the overlay cannot drift off the scenery. The tables are documented in the headers of `js/screen_node.js` (CACHE, RW, SHOP), `js/screen_menu.js` (HC, PARTY_CX, SLOT_DX, STAGE_BOX) and `js/screen_combat.js`. A change to a painted position is a change to its table, and the screen suites assert that the DOM centres equal the painted ones.

Each screen file registers `UI.screens.<name>` and any overlays in `UI.overlays`. Beyond this document the map screen exposes `UI.screens.map.mapDebug {state(), cam(), screenOf(q, r), hexAt(x, y), hud(measure?), clamp(x, y, z)}`,
a window onto the live visit (camera, where a hex is on the stage, which hex is under a stage point, the HUD footprint `{rects, free, box, slack, fit}` of 4.8 and where the clamp lets the camera be) for suites and the screenshot and autoplay tools. It only reads, with one exception: `hud(true)` measures the HUD again first, and when the HUD moved that re-fits, which can move the camera exactly as the next frame would have; the menu screens expose
`state()` (title, heroSelect, library, settings, howto) and return null once left. Screens build DOM inside `root` on `enter`. They never route on their own: they call `GAME.nodeDone()` or `UI.go(...)` for menu navigation.
Screen names and params (closed, `LISTS.screens`): `title`, `heroSelect`, `library {tab?}` (tabs `LISTS.libraryTabs`: Unlocks, Achievements, Story, Bestiary, History), `settings`, `howto`, `story {id, then?:{name, params}}`, `map`, `combat {node}`,
`reward {rewards, source}`, `shop {node}`, `event {node}`, `camp {node}`, `forge {node}`, `chest {node}`, `gemcache {node}`, `chapterClear {chapter}` (chapters 1 and 2 only), `gameOver {summary}`, `victory {summary}`.
Overlays (`LISTS.overlays`): `deck {mode:'view'|'pick'|'upgrade'|'remove'|'socket', cards?:[inst] (defaults to RUN.deck; the pile buttons pass their own), title?, filter?}` -> `Promise<uid|null>`; `pause`; `settings`; `relics {}`; `legend {}`;
`cardPick {title, cards:[inst], n:1, optional:false, confirm:'Choose'}` -> `Promise<[uid]>`; `confirm {title, body, yes, no, danger}` -> `Promise<boolean>`; `modal`.

**Display surfaces** (one owner each). The `story` screen (a storybook page, typewriter 30 characters per second, tap or Enter completes the text then continues, Skip button; owned by screen_end.js) shows the `lore` texts `intro` and
`chN_intro` and replays any seen entry from the Library (`then` returns to the library). `chN_clear`, `victory` and `defeat` are shown inline by `chapterClear`, `victory` and `gameOver`. Every lore text shown marks `META.markLore(id)`, which is what the Library Story tab lists. `DATA.tips` are shown on the ink transition into a fight
and on gameOver, chapterClear and pause. The Library (screen_menu.js) has tabs: Unlocks; Achievements (name, text, progress = `META.stat(k) / gte`, reward); Story (`META.storyList()`: every lore entry except `barks_*`, unseen ones as "???"); Bestiary (unseen enemies as a black
silhouette with "???", seen ones with lore and kill count); History (`META.history` rows). The pause overlay (Esc, or `UI.menuButton()`) offers Resume, Deck, Treasures, Settings, How to play, Abandon run (confirm) and Save and quit.

**Empty states** (never a blank panel): a reward with no card offers shows only Continue; Sharpen and the forge with nothing upgradable show a disabled button "Nothing left to sharpen"; the shop shows a sold-out badge; a deck filter with no match
says so; locked library and bestiary rows are shown, not hidden. **Saves:** when `META.save()` or `META.saveRun()` returns false GAME shows one persistent toast "Progress cannot be saved in this browser" and continues.

## 6. Flow

```
title -> heroSelect (pick 2 heroes, Ink Trial, seed / Daily) -> GAME.newRun -> story(intro, first time) -> story(ch1_intro) -> map(ch1)
map: paint, use brush, walk -> RUN.step -> Node -> GAME.enterNode -> combat | shop | event | camp | forge | chest | gemcache (instant: well, brush)
combat win -> RUN.combatDone -> reward -> map ;  boss win -> reward -> chapterClear -> story(chN_intro) -> map(next chapter)   (chapters 1 and 2) ;  chapter 3 boss win -> reward -> victory
combat lose -> gameOver ;  every finished node -> META.saveRun ;  title shows Continue when META.hasRun()
```

## 7. Verification (every owner, before reporting done)

1. `node tests/rogue_book_<yours>.test.mjs` green and meaningful (real assertions, not "does not throw").
2. `node tests/rogue_book_hygiene.test.mjs` green (no dashes, no `Math.random`, scripts parse, one namespace per file and no top-level names in extension files, the gallery script list is a prefix of index.html's, layering, forbidden
   APIs, the clock, closed-list ids, page wiring: the header of that suite lists every rule). `node tests/rogue_book_all.mjs --strict` is the integration gate: it also demands every file, every fixed id, `DATA.validate(undefined, {strict:true})` and a clean `DATA.audit()`.
3. Content owners: `DATA.validate("cards", {hero:"kuro"})`, `DATA.validate("enemies", {chapter:2})`, `DATA.validate("relics")` and so on return zero errors and `DATA.audit("cards", {hero:"kuro"})` reports no `audit` lines for your hero or chapter
   (run them through `boot({only:['data*']})`). The integration wave runs `DATA.validate(undefined, {strict:true})` and every `DATA.audit()`.
4. Drawing owners: render your sheets with `node tools/rogue_book/shot.mjs --url "rogue_book/gallery.html?sheet=NAME&w=1600&h=900" --out <scratchpad>/x.png` (the PNG is exactly w x h; animated sheets: add `&frames=6&t0=0&t1=1`; a throwaway
   experiment: `--js "ART.sheet('tmp', function(c,p){...}); __render('tmp',{t:0.5})"`). Sheets draw in logical px from `params.w` and `params.h` and never resize the canvas. Exit code 1 means a script error or a sheet exception. LOOK at the PNG with
   the Read tool and iterate at least three times. Compare your work against `ART_BIBLE.md` honestly: if it looks generic, redo it.
5. UI owners: drive your screen with `GAME.debug.open(...)` and `GAME.debug.tick(...)` through `tools/rogue_book/shot.mjs` (steps support `mouse`, `tap`, `drag` in stage coordinates), look at the screenshots at 1280x720 and 844x390 (landscape phone),
   check the rotate panel at 390x844, and fix what is ugly. Screen owners also emit their `UI.bus` events, mark their `data-tut` anchors and give every interactive element a real button or `role=button` (5.8), and each screen gets one screenshot at `textScale` 1.3.
6. Report: what you built, public API additions, deviations from this document (there should be almost none), known gaps.
7. Integration suites (not per module): `tests/rogue_book_game.test.mjs` plays complete runs for several hero pairs, every fable and every choice, every shelf of the shop and the menus through REAL pointer, drag and key events on the
   headless DOM (the UI-driven player in `tests/rogue_book_player.mjs`), on the virtual clock, and demands a page with no console error or warning, no `window.__errors` and no canvas issue (`RB_GAME_ONLY=pause,save` runs a part).
   `tests/rogue_book_browser.test.mjs` is a short guided flow in REAL headless Chromium (playwright-core) with real mouse, touch and keys, plus a blank-canvas check; it is skipped with a clear message when no browser is installed
   (`RB_BROWSER=1` turns that into a failure). A fight a suite must win without warnings is won by hand (see `GAME.debug.win` in 5.10).

**Test loader contract** (`tests/rogue_book_lib.mjs`, owned by the tooling integrator; the header comment of that file is the record of every option and helper). What game code and suites may rely on: `boot({only, ...})`
evaluates each script in ONE shared `vm` context, one file at a time, so a syntax error or top-level throw in a teammate's file never breaks a suite that did not ask for it: a broken file the suite named by exact name (or any file when
`only` is omitted) makes `boot` throw a `BootError` with file and line (`continue:true` lists it in `api._errors` instead), while a broken file that was only matched by a glob or pulled in as a dependency is skipped and listed in `api._warnings`;
`only` names are validated (a misspelt name throws), `util` and `data` are always added and each module pulls in the layers below it; `Math.random` throws; touching the DOM, storage or AudioContext while scripts load throws ("touch it lazily");
`window.__HEADLESS` is true unless `realtime` is set and `window.__NO_AUTOBOOT` is true unless `autoboot` is set; the document is built from `index.html`'s own markup, so `#wrap > #stage > #view #screens #overlays #over #tips #toasts`
exist exactly when the page declares them; time is a virtual clock the suite moves (`_flush`, `_raf`, `_tick`); `_listeners(type)` counts window and document listeners for leak checks.

## 8. Definition of "done" for the whole game

It boots, the full flow plays start to finish for all four heroes across three chapters with no console errors, every card/enemy/relic/gem/event is reachable and works, saves and resumes, works on touch, sounds and looks like nothing else on the
site, and `npm run check` is green.

## 9. File ownership

Your task prompt names the files you own. You may create test files `tests/rogue_book_<yourmodule>.test.mjs` and scratch files in your scratchpad only.
Ownership by wave:

| wave | files |
|---|---|
| 0 (done by the lead) | `util.js data.js index.html gallery.html DESIGN.md ART_BIBLE.md CONTENT_SPEC.md`, `tests/rogue_book_lib.mjs rogue_book_all.mjs rogue_book_hygiene.test.mjs rogue_book_data.test.mjs rogue_book_lib.test.mjs` (the last one is the loader's own regression suite), `tools/rogue_book/shot.mjs` |
| 1 logic | `data_text.js combat.js` (one engineer); `map.js`; `run.js meta.js`; `data_cards_hanae.js`; `data_cards_kuro.js`; `data_cards_suzu.js`; `data_cards_raiga.js`; `data_enemies_1.js`; `data_enemies_2.js`; `data_enemies_3.js`; `data_relics.js data_gems.js data_cards_shared.js`; `data_events.js data_meta.js` |
| 1 presentation | `art.js art_heroes.js` (art director); `audio.js`; `ui.js main.js css/base.css` |
| 2 art | `art_enemies_1.js`; `art_enemies_2.js`; `art_enemies_3.js`; `art_cards.js`; `art_icons.js`; `art_scenes.js art_map.js`; `art_fx.js` |
| 2 screens | `scene.js`; `screen_combat.js css/combat.css`; `screen_map.js css/map.css`; `screen_menu.js css/menu.css`; `screen_node.js css/node.css`; `screen_end.js css/end.css tutorial.js` |
| 3 to 4 | integration, balance and polish agents get explicit file lists in their prompts |
