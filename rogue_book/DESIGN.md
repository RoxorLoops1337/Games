# INKWOVEN -- design bible and module contracts

> A rogue storybook. Two heroes, one living book, a deck of gem-socketed cards.
> Read this whole file, then `ART_BIBLE.md` and `CONTENT_SPEC.md`, before writing a line.
> Many modules are built in parallel by different people. The contracts here are the
> only thing keeping the pieces fitting. When a contract is unclear, pick the simplest
> reading, write it into your module's header comment, and keep going.

**This game is written from scratch.** Do not open, read, copy or imitate any other
game folder in this repository. The only things outside `rogue_book/` you may read are
`CLAUDE.md`, `build.js`, `package.json`, and the tests and tools that belong to this
game (`tests/rogue_book_*`, `tools/rogue_book/*`).

## 1. The pitch

The Living Book is a storybook that writes itself. Its Author has vanished and a spreading
blankness, the **Blank**, is erasing the tale one page at a time. You lead **two heroes**,
characters written into the book, across its pages to the last one and rewrite the ending.

The game is a deckbuilding roguelike in three parts:

1. **The map is a page of blank paper.** A hex map hidden in fog. You spend **Ink** to paint
   a hex next to the painted area and reveal it (fight, treasure, shop, camp, fable...), or
   use one-use **Brushes** that paint whole shapes for free. Walk only on painted hexes. Reach
   the chapter boss on the far side. Reveal more for more loot, or rush.
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
- **Classic scripts, shared global scope.** `index.html` lists every script in load order (see
  section 3). Each file declares AT MOST ONE top-level `const` namespace (`U`, `DATA`, `ART`,
  `AUDIO`, `COMBAT`, `MAP`, `RUN`, `META`, `UI`, `SCENE`, `GAME`) and may use every namespace
  loaded before it. Content and extension files (`data_*.js`, `art_*.js`, `screen_*.js`, `tutorial.js`)
  declare NO top-level names: they are one IIFE that registers into an existing namespace.
  No other top-level `let/const/var/function`.
- **Headless first.** Everything except pure drawing must run under Node with no DOM: the test
  loader (`tests/rogue_book_lib.mjs`) stubs `window`, `document`, `localStorage`, timers and a
  no-op canvas context. Drawing code must survive that no-op context. No top-level DOM or
  AudioContext access; touch them lazily inside functions.
- **Determinism.** No `Math.random` anywhere. Use `U.rng(seed)` streams. Derive seeds with
  `U.hash(seed, 'ch2', 'map')`. Time-based animation may read a passed-in `t`, never `Date.now()`
  inside logic (UI cosmetics may use `performance.now()`).
- **Coordinates:** the logical stage is **1280 x 720**, landscape, scaled by CSS to fit any window
  (letterboxed). All UI and art coordinates are stage pixels.
- **Touch first, mouse and keyboard as a bonus.** Hit targets at least 44 stage px. No hover-only
  affordances (hover adds detail, never gates function). Pointer events, never separate mouse and
  touch code paths. No `alert`, no `confirm`, no `prompt`.
- **Tests** live in `tests/rogue_book_<module>.test.mjs`, use `boot()` from `tests/rogue_book_lib.mjs`
  and `harness()`. Suites print `name: N passed, M failed` and exit 1 on failure. `npm run test:rogue_book`
  runs them all. Never create throwaway harnesses outside `tests/` (scratch experiments go in your
  scratchpad, not the repo).
- **Style:** vanilla ES2020, 2-space indent, semicolons, small functions, a header comment that
  is the contract of record for the file, and comments that explain *why*. **No em dashes and no
  en dashes anywhere** (code, copy, docs, tests). Use `--`, a comma, or a colon. The hygiene suite fails on them.
- **Ownership:** each file has exactly one owner (section 9). Never edit a file you do not own (section 9).
  If you need a change elsewhere, work around it or record it in your final report.
- **Performance:** 60 fps target on a mid laptop. Cache sprites in offscreen canvases (`ART.sprite`),
  never rebuild gradients or Path2D per frame when the inputs did not change, keep particles under 500,
  and let `requestAnimationFrame` idle when the tab is hidden.
- **Graceful failure:** a bad frame must never brick the game. `UI.go` catches a screen that throws,
  logs it, and offers Back to Title.

## 3. Files, namespaces and load order

```
js/util.js            U         shared helpers                                   (done)
js/data.js            DATA      registries, closed lists, statuses, heroes...   (done)
js/data_text.js       (DATA+)   text generation: cardHtml, gemText, ...
js/data_cards_hanae.js  data_cards_kuro.js  data_cards_suzu.js  data_cards_raiga.js  data_cards_shared.js
js/data_enemies_1.js  data_enemies_2.js  data_enemies_3.js
js/data_relics.js  data_gems.js  data_events.js  data_meta.js
js/art.js             ART       toolkit + style helpers + sprite cache
js/art_heroes.js  art_enemies_1.js  art_enemies_2.js  art_enemies_3.js  art_cards.js
js/art_icons.js  art_scenes.js  art_map.js  art_fx.js
js/audio.js           AUDIO     WebAudio SFX + procedural music
js/combat.js          COMBAT    combat engine (pure logic, event log)
js/map.js             MAP       hex map generation and rules (pure)
js/run.js             RUN       run state, rewards, shop, camp, events, relics, save shape
js/meta.js            META      profile, settings, unlocks, achievements, save/load
js/ui.js              UI        stage, screen manager, DOM components, tooltips, input
js/scene.js           SCENE     canvas combat scene: actors, VFX, numbers, camera shake
js/screen_menu.js     title, heroSelect, library, bestiary, settings, howto
js/screen_map.js      map
js/screen_combat.js   combat
js/screen_node.js     reward, shop, event, camp, forge, chest, gemcache, deck overlay
js/screen_end.js      chapterClear, gameOver, victory
js/tutorial.js        first-run guided hints
js/main.js            GAME      boot, run flow, routing, debug hooks
css/base.css  menu.css  map.css  combat.css  node.css  end.css
gallery.html          art sheet viewer (done)
```

Data flows one way: `DATA` (definitions) -> `COMBAT`/`MAP` (rules) -> `RUN` (state that spans a
run) -> `META` (state that spans runs) -> `UI` and screens -> `GAME`. Logic modules never touch
the DOM. `ART` and `AUDIO` are leaf helpers the UI calls; logic never calls them.

## 4. Core rules

### 4.1 Heroes, rows, energy

- The party is two heroes. Row order is `[front, back]`. `RUN.frontIdx` remembers who leads
  between fights (the first hero starts in front).
- Base **3 Energy**, draw **5**, max hand 10. Relics and gems may modify (`DATA.LISTS.mods`).
- Each hero has HP that persists across fights. Heroes are healed at camps, by some events, and
  partially at the end of each chapter.
- **Rows.** `DATA.heroes[id].rows.front` and `.back` list bonuses (`LISTS.rowFields`) applied while the
  hero stands in that row: `dmgAdd`/`blockAdd` (added to each `dmg`/`block` op the hero's cards
  produce), `startBlock` (Block gained at the start of each player turn), `regen`, `thorns` (granted as
  statuses at the start of each turn while in that row, not stacking beyond the value: set, not add),
  `drawAdd` (extra draw at turn start).
- **Swap.** One free swap per player turn (`ECONOMY.freeSwaps`, relics add more). Further swaps cost
  1 Energy. `C.swap()` exchanges the two rows. A hero with `bind` cannot swap (neither hero can
  while either is bound). Swap emits an event and fires `onSwap` hooks.
- **Downed heroes.** A hero at 0 HP is *downed*: cannot be targeted, their cards are dead (playable = false,
  reason `down`) but stay in the deck and clog the hand, and the survivor is forced to the front row.
  If both are downed the combat is lost. When a combat is won, downed heroes revive with
  `ECONOMY.reviveFrac` of max HP (trial mods can change it). A `hero_revive` effect (relics) is a
  combat event too.

### 4.2 Damage, block and statuses (exact formulas)

Definitions: `unit.block` (number), `unit.st[statusId]` (number). Attacks are `dmg` ops.

For one **hit** of a `dmg` op from `attacker` to `target`:

```
raw   = n                                      // value expression already evaluated, includes 'per' scaling
raw  += attacker.rowDmgAdd                     // heroes only: DATA.heroes[..].rows[row].dmgAdd
raw  += attacker.st.might
raw  += 3 if target.st.mark > 0 (and consume 1 mark)
raw   = floor(raw * (attacker.st.weak > 0 ? 0.75 : 1))
raw   = floor(raw * (target.st.vulnerable > 0 ? 1.5 : 1))
raw   = max(0, raw)
if target.st.dodge > 0: raw = 0, dodge -= 1, emit 'dodge'
absorbed = op.pierce ? 0 : min(target.block, raw);  target.block -= absorbed;  hpLoss = raw - absorbed
target.hp -= hpLoss
if target.st.thorns > 0 and attacker: attacker takes thorns damage directly (no modifiers, ignores block)
if op.lifesteal: heal attacker for hpLoss
```

Trial mods `enemyDmg` multiply enemy damage after `might` (before weak). Enemy `dmg` ops use the same
formula with the enemy as attacker.

**Block gain:** `gain = floor((n + unit.st.bulwark + rowBlockAdd) * (unit.st.frail > 0 ? 0.75 : 1))`, min 0.
Hero Block is removed at the start of that hero's player turn (before `startBlock` and `plating`).
Enemy Block is removed at the start of the enemy phase (before their `plating`).

**Status timing**, in order, per round (a round is one player phase plus one enemy phase):

1. Player phase start (turn N): hero Block clears, then `startBlock` from row, `plating`, `regen` heals then -1,
   `poison` on heroes hits (ignores block) then -1, row `thorns`/`regen` refresh, `turnStart` hooks and hero passives, draw, energy.
2. Player plays cards, swaps. `endTurn`: `turnEnd` hooks, retained cards stay, ethereal cards in hand are exhausted,
   the rest are discarded, cards with `hand.turnEnd` ops run them first.
3. Enemy phase start: enemy Block clears, then `plating`, `regen`, `ritual` (gain Might), `poison` (ignores block) then -1.
   Then each living enemy in order acts (a stunned enemy skips and loses 1 `stun`).
4. End of round: `burn` deals its stacks to every unit (ignores block) then halves (floor); every `dur` status on
   every unit decrements by 1 (removed at 0); `stun` on enemies was already consumed.
5. New enemy intents are rolled, turn N+1 begins.

Duration semantics: `weak 2` applied to an enemy during your turn weakens its next 2 actions.
Bosses are immune to `stun` (their def `immune` may add more). Elites gain 2 rounds of stun immunity after
being stunned (engine detail, keep it small).

Status ids are the closed list in `DATA.statuses` (`might bulwark regen thorns dodge taunt ritual plating
bloom sumi ward charge vulnerable weak frail poison burn stun bind mark`). Resource statuses (`bloom sumi ward charge`)
are inert numbers that cards, passives and relics read and spend. Combat statuses are cleared when combat ends.

`taunt`: enemy attacks whose target vocabulary is `back`, `random` or `lowest` hit the taunting hero instead
(if the taunter is alive and not downed).

### 4.3 Cards

A **card definition** (`DATA.cards[id]`):

```js
{
  id: 'hanae_slash', name: 'Petal Slash',
  hero: 'hanae',                 // hero id, or 'curse' / 'status' for junk cards
  type: 'attack',                // attack | skill | power | curse | status
  rarity: 'starter',             // starter | common | uncommon | rare | token
  cost: 1,                       // 0..5, or 'X' (spend all remaining Energy; ops read {per:'X'})
  fx: [ { op: 'dmg', n: 6, tgt: 'enemy' } ],
  up: { fx: [ { op: 'dmg', n: 9, tgt: 'enemy' } ] },   // upgrade override: fx and/or cost and/or kw
  kw: [],                        // exhaust retain innate ethereal unplayable
  slots: ['red'],                // 0..3 gem slots; colours red blue green gold, or 'any' (prism)
  art: { m: 'slash', c: 'rose' },// motif and palette from DATA.LISTS.motifs / palettes; hero pose auto-composited when art.hero is true
  flavor: 'Optional one-line quote.',
  hand: { turnEnd: [ops] },      // curses only: ops run if the card is in hand at end of turn ('drawn' runs on draw)
  locked: true,                  // meta unlock (Library); commons and starters are never locked
}
```

- Card text is generated from `fx` by `DATA.cardHtml` (do not hand-write rules text). `flavor` is optional.
- **Deck instance** (`RUN.deck[]`, combat piles): `{uid, id, up: 0|1, gems: [gemId|null, ...]}`, the `gems` array
  is as long as the resolved slots. `DATA.resolveCard(inst)` merges upgrade and gem mods and is the single
  source of truth for name, cost, kw, slots, fx, and text. COMBAT and UI both call it.
- Types: `attack` and `skill` go to the discard pile after play; `power` goes to the exhaust pile after play (its effect
  is a status or hook that persists for the combat); `curse` and `status` are junk (usually `unplayable`, sometimes
  harmful `hand` triggers).
- Keywords: `exhaust` removes after play; `retain` stays in hand at end of turn; `innate` is in the opening hand; `ethereal`
  is exhausted if still in hand at end of turn; `unplayable` cannot be played.
- Targeting mode is derived: a card needs a chosen enemy iff any op (including inside `cond`/`repeat`) has `tgt:'enemy'`
  (`pick` never targets). `tgt` defaults: `dmg` -> `'enemy'`, `block`/`heal`/`status` on hero -> `'self'` unless it
  says otherwise (a status with an enemy-only meaning like `vulnerable` defaults to `'enemy'`).
- **Upgrades:** one level. `up` overrides `fx` wholesale if given, and may change `cost` and `kw`. Displayed name gets `+`.
  Every playable non-token card must define `up`.
- **Playing a card**: hero acts as the card's owner. If that hero is downed or stunned the card is dead. The engine spends
  Energy, resolves ops in order, then moves the card (discard, exhaust, or powers), then fires `onPlay` hooks.

### 4.4 The effect DSL (closed)

An effect list is an array of op objects executed in order. **Value expressions** `V` are a number or
`{base?, per, mul?, s?, who?, cap?, min?}` meaning `clamp(base + mul * count(per), min, cap)`, `mul` default 1,
`base` default 0. `per` is one of `DATA.LISTS.per`:

`X` (the X paid), `handSize` (cards left in hand after this card left it), `drawPile`, `discardPile`, `exhaustPile`,
`cardsPlayed` / `attacksPlayed` / `skillsPlayed` (this turn, before this card), `energy` (remaining), `block` (acting hero's Block),
`missingHp` (acting hero), `hp` (acting hero), `status` (needs `s`, and `who`: `self` default, `ally`, `target`, `enemy`(the chosen
enemy, alias of target)), `enemies` (living), `kills` (this combat), `turn`, `gems` (gems socketed on this card), `front` (1 if acting hero is in front).

**Card ops** (`LISTS.cardOps`). `tgt` for enemy targets: `enemy` (the chosen one, requires targeting), `all`,
`random` (re-rolled per hit), `lowest` (lowest HP). For hero targets: `self`, `ally`, `both`, `front`, `back`.

| op | fields | meaning |
|---|---|---|
| `dmg` | `n:V, hits?:V(1), tgt='enemy', pierce?, lifesteal?, consume?:statusId` | attack hits; `consume` removes that status from the acting hero after `n` is computed |
| `block` | `n:V, tgt='self'` | gain Block on hero(es) |
| `heal` | `n:V, tgt='self'` | heal hero(es) (cannot revive) |
| `status` | `s, n:V, tgt` | apply status stacks. `tgt` defaults: debuffs (`vulnerable weak frail poison burn stun mark`) -> `enemy`, everything else -> `self`. `bind` on enemies is a no-op. |
| `removeStatus` | `s:id or 'debuffs' or 'buffs', tgt` | cleanse. On heroes `debuffs` removes all debuffs; on enemies `buffs` removes all buffs |
| `draw` | `n:V` | draw cards (reshuffles discard into draw when empty, emits `shuffle`) |
| `energy` | `n:V` | gain Energy |
| `pick` | `from:'hand'/'draw'/'discard'/'exhaust', n:V, then:'discard'/'exhaust'/'retain'/'upgrade'/'toHand'/'toDrawTop'/'copy', top?:n, filter?:{type,hero}, random?, optional?` | the player (or RNG if `random`) picks cards from a pile and the `then` action applies. Engine sets `C.pending`, UI calls `C.resolvePick(uids)` |
| `add` | `card:id, n?:V(1), to?:'hand'/'draw'/'discard'/'exhaust'(default 'hand' for cards, 'discard' otherwise), up?` | create temp cards in your piles |
| `swap` | none | swap rows for free (does not use the free swap) |
| `hurt` | `n:V, tgt='self'` | lose HP directly (ignores Block, cannot kill a hero below 1 unless `lethal:true`) |
| `cond` | `if:C, then:[ops], else?:[ops]` | conditional |
| `repeat` | `n:V, do:[ops]` | run the ops n times (X-cost cards: `n:{per:'X'}`) |
| `gold`, `ink`, `maxHp` | `n:V` | run-level rewards mid-combat (gold pouch, ink drop, permanent max HP for the acting hero) |

**Conditions** `C` (`LISTS.cond`), all keys must hold: `row:'front'|'back'` (acting hero's row), `status:{s, who?, gte?, lte?}`,
`hpPct:{who?, lt?, gt?}` (fractions 0..1), `handEmpty:true`, `cardsPlayed:{gte?,lte?}`, `attacksPlayed:{...}`, `turn:{gte?,lte?}`,
`lastKill:true` (the previous `dmg` op of this card killed), `targetStatus:{s, gte?}`, `allyDown:true`, `block:{gte?,lte?}` (acting hero),
`energy:{...}` (remaining), `handSize:{...}`, `enemies:{gte?,lte?}`.

**Hook ops** (relics, hero passives, gem-less triggers) use the same ops minus `pick`, `repeat`, `swap`. For hooks `tgt:'self'`
means: passive -> the owning hero; relic -> the front hero (or the triggering hero for `onDamaged`, `onPlay`, `onKill`, `onSwap`,
`onHeroDown`). Enemy tgt vocab inside hooks: `all` `random` `lowest` `enemy` (`enemy` = the triggering enemy for `onKill`, else a random one).

**Enemy ops** (`LISTS.enemyOps`): `dmg` (`tgt` from `front|back|both|random|lowest` = HEROES), `block` (`tgt`: `self|allEnemies|otherEnemy|lowestEnemy`,
default self), `heal` (same enemy tgt), `status` (hero tgt to debuff heroes, or enemy tgt to buff, default: debuffs -> `front`, buffs -> `self`),
`removeStatus`, `add` (adds a card from the `curse`/`status` hero to the player's `draw`/`discard`, `to` default `discard`), `summon`
(`enemy:id, n?:1`; cap 5 living enemies total), `swap` (forces a hero row swap), `cond` (condition keys from `LISTS.cond` plus `hpPct` with `who:'self'`),
`stealGold` (`n`: steals run gold, returned when the thief dies). Numbers for enemies are plain numbers (no `per` needed except `status`).

**Relic/gem `mods`** are flat numbers from `LISTS.mods`. **Gem `mod`** keys (`LISTS.gemModKeys`): `dmg +N` to every `dmg` op, `block +N`, `heal +N`,
`hits +N` (to the first multi-hit-capable `dmg` op), `cost -N` (min 0), `draw N` (adds a draw op), `energy N` (adds an energy op), `poison N`
(adds poison to the first enemy target), `status {s,n,tgt}` (adds a status op), `fx [ops]` (appended ops), `kw [..]` (adds keywords),
`kwRemove [..]`, `cond:'front'|'back'` (the gem only works while the hero stands in that row).

### 4.5 Enemies

```js
{
  id, name, chapter: 1|2|3, tier: 'minion'|'normal'|'elite'|'boss', size: 's'|'m'|'l'|'xl',
  hp: [min, max],                              // rolled per fight with the combat rng, then scaled by trial mods
  moves: { slash: { name: 'Claw Rake', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] }, ... },
  ai: {                                        // pick ONE of seq / weighted
    open: ['howl'],                            // optional: used first, in order, once
    seq: ['slash', 'slash', 'guard'],          // cycles
    weighted: [['slash', 3], ['guard', 1]], noRepeat: 2,   // alternative to seq
    rules: [ { if: {hpLt: 0.5}, do: 'rage', once: true }, { if: {turnEvery: [3, 0]}, do: 'slam' } ]  // checked first, in order
  },
  start: [ops],                                // applied at combat start (statuses like thorns)
  phases: [ { at: 0.5, say: 'text', fx: [ops], ai: { seq: [...] } } ],   // when hp fraction first drops below `at`
  immune: ['stun'], art: { id: 'kappa' }, lore: 'One or two sentences for the bestiary.', tags: ['spirit']
}
```

- Intent `kind` (`LISTS.intents`) selects the icon: `attack` (single hit), `multi` (several hits), `heavy` (one big hit), `defend`, `buff`, `debuff`, `summon`, `heal`, `special`, `flee`, `none`.
- AI rules: `turnEvery:[period, offset]` is true when `(turn - 1) % period === offset`. `once:true` fires only the first time its condition holds.
  `turnGte`, `hpLt`, `hpGt` (fractions), `alone` (no other enemy alive), `minions:{lt}`, `heroStatus:{s}`, `heroDown`.
  The first matching rule wins, otherwise `open`, otherwise `seq`/`weighted`.
- Encounters (`DATA.addEncounters(ch, {normal, elite, boss})`): `{id, enemies:[ids], w:weight, min: lowest tile.diff 0..1}`. The boss is a single enemy id.
  Boss ids are fixed: `boss_kuzunoha` (ch1), `boss_jorogumo` (ch2), `boss_editor` (ch3).
- HP guidance and damage guidance are in `CONTENT_SPEC.md`.

### 4.6 Gems

`DATA.gems[id]`: `{id, name, color:'red|blue|green|gold', tier:1..3, mod:{...}, art:{cut:'round|oval|square|drop|star'}, text? (auto), locked?}`.
A slot accepts a gem of its own colour, a prism (`any`) slot accepts any. Socketing at a camp (Cut Gems), a forge, or the gem
purse in a shop; replacing a gem destroys the old one. Gems live in `RUN.gems[]` (unsocketed ids) and in `deck[i].gems[]`.
Gem effects are applied by `DATA.resolveCard`. Gem text comes from `DATA.gemText(id)`.

### 4.7 Relics ("Treasures")

`DATA.relics[id]`: `{id, name, rarity:'common|uncommon|rare|boss|shop', text, mods?:{...}, hooks?:[{on, fx, filter?, limit?, once?}], art:{m:relicIcon, c:palette}, hero?:heroId, locked?}`.
`text` is required and hand-written (short, plain). `hooks[].on` is a combat hook (`LISTS.combatHooks`) whose `fx` are hook ops, or a run hook
(`LISTS.runHooks`) whose `fx` are run ops. `filter` keys: `type` (card type), `hero`, `cost:{gte,lte}`, `kw`. `limit:N` is per turn, `once:true` per combat.
A relic with `hero` only drops when that hero is in the party.

### 4.8 Map, Ink and Brushes

- Pointy-top axial hexes `(q, r)`, key `'q,r'`. The generated map is a hex-rectangle `ECONOMY.map.cols x rows` (21 x 13, offset rows), with
  holes (`block` tiles: Unwritten Void), start on the left, boss on the right. Hex size 46 px at zoom 1, the world is bigger than the screen so the
  map has a camera (pan by drag, zoom by wheel/pinch, follow the party).
- **Painting.** Every tile starts hidden. `start` and a ring of `ECONOMY.map.startRing` around it are painted. Tiles of `LISTS.landmarks` are
  `known` from the start: fog shows a dim silhouette of their icon. Painting an unpainted, non-block hex adjacent to a painted hex costs
  `ECONOMY.paintCost` (1) Ink and reveals it and its content. Painting a far hex previews the cheapest chain (`MAP.pathToPaint`) with its total cost.
- **Ink** lives in `RUN` (`R.ink`, `R.inkMax`, default 8 at chapter start, cap 12). Sources: ink wells (+3), kills (+1 normal, +2 elite), camp Meditate (+4),
  events, relics. If the party is stranded (0 Ink, no brush, nothing paintable is free) RUN's mercy rule grants exactly enough Ink for the cheapest useful paint.
- **Brushes** (`DATA.brushes`): free, one use each, kept in `R.brushes[]`. `stroke` and `wave` (line of 3 or 5 hexes from a chosen painted hex in one of 6
  directions), `fan` (wedge of 3), `splash` (a target hex plus its 6 neighbours), `halo` (the 6 around a painted hex), `blot` (any 1 hex within 4 of the party).
  Brush-painted hexes never paint blocks. `MAP.brushCells(M, id, q, r, dir)` gives the preview.
- **Walking.** Click any painted hex reachable through painted, non-block hexes to walk there one step at a time. Walking stops at the first tile with
  unresolved content. Stepping onto unresolved content triggers it (`RUN.step`).
- **Solvability guarantee.** From a fresh map, the minimum Ink needed to paint a route from the start ring to the boss is between 6 and 12
  (`MAP.solve(M).minInk`), and at least 3 wells lie within 3 hexes of the cheapest routes so a sensible player is never starved.
- Tile types (`LISTS.tiles`): `start empty block enemy elite boss chest shop camp event well brush gemcache forge`. Distribution targets in `ECONOMY.dist`.
  `tile.diff` in 0..1 rises with distance from the start and scales encounter picks. `tile.done` means resolved (its icon fades to the ground).

### 4.9 Rewards, shops, camps, events

- **Combat rewards** (`RUN.combatDone`): gold (`ECONOMY.gold[tier]` x `goldMul`), ink from kills, a card reward of `cardChoices` (3) cards
  split across both heroes using `ECONOMY.rarity[tier]` with a rare-offset pity, skippable; elites also give a relic; bosses give a rare card, a relic choice
  of 3 (boss relics and others), and end the chapter. Some elites and fable fights also drop a brush.
- **Shop** (`ECONOMY.shop`): 5 cards (a mix of both heroes, one on sale), 2 gems, 3 relics, 1 brush, card removal (price rises with each use).
  Prices in `ECONOMY.price`, scaled by `priceMul`. Sold-out items stay visible but disabled.
- **Camp**: pick ONE: **Rest** (heal both heroes `camp.restPct` of max HP, `healMul` applies), **Sharpen** (upgrade one card), **Cut Gems** (socket or replace gems), **Meditate** (+4 Ink and +1
  random brush). Some relics add a second action.
- **Forge** tile: upgrade one card (one use). **Gem cache**: choose 1 of 3 gems. **Chest**: gold plus a relic or a gem choice. **Brush rack**: take a brush. **Well**: +Ink.
- **Events** (`DATA.events`): text with 2-4 choices, each choice has weighted outcomes (`out:[{w, text, ops}]`) using run ops (`LISTS.runOps`):
  `gold ink heal hurt maxHp addCard removeCard upgradeCard transformCard duplicateCard addRelic addGem addBrush addCurse fight flag paint cardReward`.
  Choices may have `req` (`{gold:N}`, `{hpPct:N}`, `{relic:id}`, `{flag:k}`) and `cost` shown on the button. `once:true` events never repeat in a run. `chapters:[1,2]` limits where they appear.
- **Chapter end**: after a boss, `ECONOMY.chapterEnd`: heal 30% of max HP, +8 max HP each, then the next chapter's map. Ink refills to at least the chapter start amount.

### 4.10 Difficulty, Trials, Daily Tale, score, meta

- **Ink Trials** 0 to 10 (`DATA.trials`): each level's `mods` (`LISTS.trialMods`) accumulate (level 5 includes levels 1..5). Level 0 is the base game.
  Trial N+1 unlocks when trial N is cleared (final boss beaten).
- **Daily Tale**: seed = the local date as `YYYYMMDD`, heroes chosen by the seed, trial 0, does not consume or grant unlocks except Inkstones at half rate.
- **Score** (`RUN.score`): a sum of chapters cleared, bosses, elites, gold, max hp, deck synergy proxies, minus turns taken. Shown on the end screens and stored in run history.
- **Inkstones** are the meta currency, earned per run (`META.recordRun`) and spent in the **Library** on entries derived from every def with `locked:true`
  (cards, relics, gems), plus achievement rewards. Heroes 3 and 4 unlock through achievements `ch1_clear` and `ch2_clear` (see `DATA.heroes`).
- Locked content is filtered out of every reward pool, shop, and event until unlocked.

## 5. Module contracts

The header comment of each module is its contract of record and must list every public function with its signature. Wave-2 modules read the real code.
The shapes below are what other modules may already rely on.

### 5.1 `DATA` (`data.js`, `data_text.js`)

Registries: `DATA.cards heroes gems relics enemies events achievements trials tips lore encounters brushes tiles statuses keywords ECONOMY LISTS`.
`DATA.add(kind, defs)`, `DATA.addEncounters(ch, pools)`, `DATA.validate(only?)`, lookups `card hero cardsBy rewardPool enemyIds isStatus`.

`data_text.js` (owner: the combat engineer) adds, all pure and DOM-free:

```
DATA.resolveCard(inst | id, ctx?)  -> { inst, def, id, name, cost, costX:bool, type, rarity, kw:[], slots:[colour], gems:[gemId|null], fx:[ops], hero, up:bool, playableType, art }
DATA.cardHtml(inst | id, ctx?)     -> HTML string for the rules text. Keywords wrapped as <span class="kw" data-kw="block">Block</span>; numbers as <span class="num">6</span>
                                     with class "up" when higher than the base card value or "down" when lower (compares to the un-gemmed, un-boosted card, or to base when ctx has live modifiers).
                                     ctx = { unit (acting hero unit, for live Might/row numbers), C (combat) } optional.
DATA.cardPlain(inst | id, ctx?)    -> the same text without markup, for tests and aria labels
DATA.opsText(ops, ctx?)            -> plain text for an op list (used by relic hooks and events)
DATA.gemText(gemId | def)          -> plain text, e.g. "+2 damage"
DATA.relicText(id)                 -> relic.text
DATA.statusText(id, n)             -> "Poison 4: At the start of its turn..." with the stack inserted
DATA.intentText(intent)            -> e.g. "Deals 7 x2 to the front hero"
DATA.rowText(heroId, row)          -> e.g. "Front: +2 damage on attacks"
DATA.targetMode(inst | id)         -> 'enemy' | 'none'
DATA.cardOps(resolved)             -> flat op list
```

### 5.2 `COMBAT` (`combat.js`)

```
COMBAT.create({ heroes:[{id,hp,maxHp}], frontIdx?:0, deck:[inst], enemies:[enemyId], tier, chapter, seed, mods:{...}, relics:[ids] }) -> C
```

`C` is a plain object plus methods. All action methods return an **array of events** (also appended to `C.events`). State is always the final state after
the returned events; events carry snapshot values so the UI can animate step by step.

```
C.turn, C.phase ('player'|'enemy'|'over'), C.energy, C.maxEnergy, C.result (null|'win'|'lose')
C.heroes[2]  units: { kind:'hero', id, name, hp, maxHp, block, st:{}, down, row:'front'|'back' }
C.enemies[]  units: { kind:'enemy', id:'kappa#1' (unique), def:'kappa', name, hp, maxHp, block, st:{}, down (dead), tier, size, intent }
C.hand / C.draw / C.discard / C.exhaust : arrays of deck instances
C.pending : null | { kind:'pick', opId, from, n, then, filter, optional, uids:[candidates] }
C.stats : { turns, cardsPlayed, damageDealt, damageTaken, kills:[{def,tier}], ... }
C.rng, C.events

C.start() -> events                    // combat start hooks, opening shuffle and draw, first intents
C.canPlay(uid, targetId?) -> { ok, reason }        // reasons: 'phase' 'energy' 'target' 'down' 'stunned' 'unplayable' 'pending'
C.needsTarget(uid) -> bool
C.legalTargets(uid) -> [unit id]
C.play(uid, targetId?) -> events
C.canSwap() -> { ok, cost, reason }
C.swap() -> events
C.endTurn() -> events                  // full end of round: discards, enemy phase, next turn start (or combat end)
C.resolvePick(uids[]) -> events        // answers C.pending
C.preview(uid, targetId?) -> { dmg: perHit|null, hits, block, heal }   // adjusted numbers for the live card text
C.intent(enemyUnit) -> { move, name, kind, dmg (per hit or null), hits, tgt, block?, statuses:[{s,n,to}], text }
C.summary() -> { result, heroes:[{id,hp,maxHp,down}], stats, kills, ink, gold (stolen returned) }
```

**Events** (all carry `type`; unit refs are `{kind, id}`):

```
combat_start {}                            turn_start {who:'player'|'enemy', turn}          turn_end {who}
draw {cards:[inst], reshuffled:bool}       shuffle {}                                        discard {cards:[inst], reason}
exhaust {card:inst}                        add_card {cards:[inst], to}                       energy {value, delta}
play {card:inst, hero:id, target:unitId|null, cost}
hit {src:ref, dst:ref, amount (hp lost), blocked, raw, crit:bool, hits, index, pierce, element?:string, hp, block, lethal}
dodge {dst:ref}                            thorns {src:ref, dst:ref, amount, hp}
block {dst:ref, amount, block}             block_lost {dst:ref, amount}
heal {dst:ref, amount, hp}                 hurt {dst:ref, amount, hp}                        status {dst:ref, s, delta, value}
swap {front:heroId, back:heroId, cost}     intent {enemy:unitId, intent}                     enemy_act {enemy:unitId, move, name, kind}
summon {enemy:unit}                        phase {enemy:unitId, at, say}                     death {unit:ref, tier}
hero_down {hero:id}                        hero_revive {hero:id, hp}                         pick_needed {pending}
relic {id}                                 gold {n}                                          ink {n}                                          max_hp {hero, n}
end {result:'win'|'lose'}
```

Rules the engine must satisfy: exhaustive `DATA.cards` playability (a randomised suite plays every card in every hero/row/state without throwing);
determinism given `seed`; `C.play` on an illegal action returns `[]` and changes nothing; the enemy phase never runs after `over`; conservation
(hand + draw + discard + exhaust always equal deck size plus added minus removed cards).

### 5.3 `MAP` (`map.js`)

```
MAP.generate({ chapter, seed, difficulty? }) -> M
M = { v:1, chapter, seed, cols, rows, tiles:{ 'q,r': T }, start:{q,r}, boss:{q,r}, pos:{q,r} }
T = { q, r, type, painted, known, done, diff, content:{...} }
```

`content` per type: `enemy/elite: {enc: groupId}`, `chest: {gold, relic: rarity|null, gems:bool}`, `brush: {id}`, `well: {ink}`, `event: {id?}` (id chosen by RUN if absent), `shop: {seed}`,
`gemcache: {}`, `forge: {}`, `camp: {}`, `boss: {}`.

```
MAP.key(q,r)  MAP.parse(key)  MAP.DIRS (6 [dq,dr])  MAP.neighbors(M,q,r) -> [[q,r]] (existing tiles)  MAP.dist(aq,ar,bq,br)
MAP.canPaint(M,q,r) -> { ok, reason? }            // hidden, not block, adjacent to a painted tile
MAP.paint(M,q,r) -> tile                          // marks painted (no Ink accounting: RUN owns Ink)
MAP.pathToPaint(M,q,r) -> { path:[[q,r]...], cost }   // cheapest chain of unpainted non-block hexes from the painted area to (q,r); cost = its length; null if impossible
MAP.brushCells(M, brushId, q, r, dir) -> [[q,r]]  // preview, only hexes that would newly paint
MAP.applyBrush(M, brushId, q, r, dir) -> [tiles]
MAP.canMove(M,q,r) -> bool  MAP.move(M,q,r) -> tile  MAP.walkPath(M,q,r) -> [[q,r]...]|null   // painted, non-block, adjacent to pos for canMove
MAP.solve(M) -> { ok, minInk }                    // minimum paints to connect the painted start area to the boss
MAP.progress(M) -> { painted, total, pct }
MAP.toPixel(q,r,size) -> {x,y}   MAP.fromPixel(x,y,size) -> {q,r}   MAP.corners(x,y,size) -> [{x,y}x6]   MAP.bounds(M,size) -> {x0,y0,x1,y1}
MAP.serialize(M) / MAP.deserialize(o)
```

Tests: 300 seeds x 3 chapters generate valid maps (counts and minimums from `ECONOMY.dist/distMin/distMax`, start/boss reachable, `solve.minInk` in 6..12,
no landmark unreachable, wells near the route), round-trip serialise, brush geometry for every brush in every direction, pixel to hex round trip.

### 5.4 `RUN` (`run.js`)

Owns everything that lives for one run. `RUN.newRun({heroes:[id,id], trial, seed, daily}) -> R`. Key shape:

```
R = { v:1, id, seed, trial, daily, mods, heroes:[{id,hp,maxHp}], frontIdx, deck:[inst], gems:[gemId], relics:[id], brushes:[id],
      gold, ink, inkMax, chapter, map:M, node:null|Node, stats:{...}, flags:{...}, rareOffset, removals, seen:{events:[],...}, log:[], done:bool, victory:bool }
```

Public API (each returns plain data and never touches the DOM; the module header is the contract of record):

```
RUN.newRun(opts)  RUN.startChapter(R, n)  RUN.mods(R)
RUN.paint(R,q,r) -> {ok, tiles, reason}     RUN.useBrush(R, brushId, q, r, dir) -> {ok, tiles, reason}    RUN.paintPreview(R,q,r) -> {path, cost, affordable}
RUN.step(R,q,r) -> Node|null                 // move onto a painted adjacent tile; returns what happens there
Node = { kind:'combat'|'shop'|'event'|'camp'|'forge'|'chest'|'gemcache'|'well'|'brush'|'chapterEnd', tile:{q,r}, tier?, enc?, stock?, event?, loot?, offers?, ... }
RUN.combatInit(R, node) -> opts for COMBAT.create        RUN.combatDone(R, C) -> Rewards       // applies hp, revives, kills, marks tile done, saves stats
Rewards = { gold, ink, cards:[cardId...] (offers, may be empty), relics:[relicId] (offers), gems:[gemId], brush:id|null, maxHp:0, boss:bool }
RUN.claim(R, rewards, choice)  // choice = { card: id|null(skip), relic: id|null, gem: id|null, takeBrush: bool }
RUN.shopBuy(R, stock, itemId) -> {ok, reason}   RUN.shopRemove(R, stock, uid) -> {ok}
RUN.eventChoose(R, eventDef, i) -> { text, applied:[...], fight?:Node, pending?:[...] }
RUN.campAction(R, 'rest'|'sharpen'|'gems'|'meditate', arg) -> {ok,...}
RUN.addCard(R,id,opts) RUN.removeCard(R,uid) RUN.upgradeCard(R,uid) RUN.socket(R,uid,slot,gemId) RUN.unsocket(R,uid,slot)
RUN.applyOps(R, ops, ctx) -> {log:[...], pending:[...]}      RUN.hook(R, name, ctx)
RUN.chapterEnd(R) -> { next:2|3|'victory', healed:[...], maxHp:8 }
RUN.score(R)  RUN.summary(R)  RUN.serialize(R)  RUN.deserialize(o)
```

### 5.5 `META` (`meta.js`)

Profile in `localStorage['rb_profile_v1']`, current run in `['rb_run_v1']`, settings inside the profile. Never rename these keys.

```
META.profile (live)  META.load()  META.save()  META.reset()
META.get(k) META.set(k,v)   // settings: musicVol sfxVol shake reduceMotion textScale fastAnim damageNumbers colorblind
META.saveRun(R) META.loadRun() -> R|null META.clearRun() META.hasRun()
META.track(stat, n=1) META.stat(k) -> number      // stat keys are listed in data_meta.js; achievements read them
META.check() -> [newlyUnlockedAchievementIds]     META.bus (U.bus): 'achievement' {id}, 'unlock' {kind,id}
META.isUnlocked(kind, id) -> bool                 // kind: 'hero'|'card'|'relic'|'gem'|'trial'; defs without locked:true are always unlocked
META.libraryList() -> [{kind,id,cost,unlocked,affordable}]   META.buy(kind,id) -> {ok,reason}
META.inkstones  META.recordRun(R, outcome:'win'|'lose'|'abandon') -> { inkstones, newAchievements, newTrial, heroesUnlocked }
META.seen(enemyId) META.bestiary() -> [{id,seen,kills}]   META.history -> last 20 runs [{score,heroes,chapter,outcome,trial,daily,ts}]
META.trialMax() -> highest selectable trial       META.dailySeed() -> YYYYMMDD int     META.tutorial(flag) / META.setTutorial(flag)
```

### 5.6 `ART` (all `art*.js`) -- see ART_BIBLE.md for style

```
ART.tk         toolkit (art.js): palette, inkStroke, cel fill helpers, halftone, sparkle, eye, hair ribbons, paper grain, sprite cache
ART.sprite(key, w, h, drawFn) -> canvas   // memoised offscreen canvas; drawFn(ctx, w, h)
ART.hero.draw(ctx, heroId, {x, y, s, pose, t, flip, alpha, glow})   // origin at feet centre, nominal height 250 * s
ART.hero.portrait(ctx, heroId, {x, y, w, h, expr, t})              // bust, drawn into the rect
ART.hero.medallion(ctx, heroId, x, y, r)                            // round face icon
ART.hero.bounds(heroId) -> {w, h, head:{x,y}, hand:{x,y}, feet:{x,y}}   // nominal, at s=1
ART.enemy.draw(ctx, enemyId, {x, y, s, pose, t, flip, hpPct, phase, alpha, glow})   // origin at feet centre; enemies face LEFT (toward heroes) unless flip
ART.enemy.bounds(enemyId) -> {w, h, head, body, feet}
ART.card.draw(ctx, cardIdOrInst, w, h, t?)      // illustration window (cached per id+size)
ART.icon.draw(ctx, kind, id, x, y, size, opts)  // kind: 'status' 'relic' 'gem' 'tile' 'intent' 'stat' 'brush' 'type' 'row'
ART.scene.draw(ctx, sceneId, w, h, t, opts)     // LISTS.scenes; opts {particles, parallaxX}
ART.map.hex(ctx, kind, x, y, size, opts)        // kind: 'fog' 'ground' 'block' 'painted' 'edge' etc, see art_map.js header
ART.fx.*                                        // VFX draw helpers used by SCENE: slash burst ring lightning inkSplash petals sparkle speedLines impact flash...
ART.sheets.NAME = (canvas, params) => void      // each art file registers its own gallery sheets
```

All `ART.*` draw functions must be safe to call with the headless no-op context and must never throw for unknown ids (draw a labelled placeholder instead).

### 5.7 `AUDIO` (`audio.js`)

```
AUDIO.init()                       // call on first user gesture; safe to call repeatedly; no-op headless
AUDIO.sfx(id, opts?)               // id in DATA.LISTS.sfx; opts {vol, pitch, pan, delay}
AUDIO.music(trackId|null, opts?)   // id in DATA.LISTS.music; crossfades; null stops
AUDIO.setVolume('music'|'sfx', 0..1)   AUDIO.duck(ms)   AUDIO.suspend() / AUDIO.resume()   AUDIO.current -> track id
AUDIO.ready -> bool
```

### 5.8 `UI` (`ui.js`)

```
UI.W=1280 UI.H=720 UI.scale  UI.stage UI.canvas UI.ctx  UI.layers {screens, overlays, toasts}
UI.init()  UI.toStage(clientX, clientY) -> {x,y}   UI.applySettings()
UI.screens = {}          // registered by screen files: UI.screens.map = { enter(params), leave(), update(dt,t), draw(ctx,t), onKey(e), music }
UI.go(name, params, {transition}) -> Promise   UI.current
UI.overlays = {}         // { open(params) -> Promise|void, close() }: deck, pause, settings, relics, legend, cardPick, confirm
UI.overlay.open(name, params)  UI.overlay.close()
UI.modal({title, body, buttons:[{label, kind, cb}], dismiss}) -> close fn         UI.toast(text, kind)
UI.btn(label, cb, {kind:'pri'|'sec'|'ghost', icon, sfx, disabled}) -> el
UI.card(inst | id, {size:'hand'|'reward'|'deck'|'mini'|'big', unit, C, selected, disabled, onclick, showGems}) -> el
UI.relic(id, {size, onclick}) -> el     UI.gem(id, {size}) -> el     UI.status(id, n, {size}) -> el     UI.heroBadge(heroId, {size, hp, maxHp}) -> el
UI.stat(kind, value, {size}) -> el      // kind: 'gold' 'ink' 'hp' 'energy' 'brush' 'inkstone'
UI.tip.attach(el, () => html|node|null)  UI.tip.hide()      UI.tip.card(inst) UI.tip.kw(word)
UI.transition(kind, midFn) -> Promise    // 'page' (page turn), 'ink' (ink bloom wipe), 'fade'
UI.tween(target, props, ms, easing) -> Promise    UI.floatText(x, y, text, kind)    UI.pulse(el)    UI.shake(el)
UI.onKey(fn) -> off      UI.frame(now) called by GAME each rAF
```

### 5.9 `SCENE` (`scene.js`)

The canvas combat stage. Owner of all actor drawing and VFX in combat.

```
SCENE.mount({ C, chapter, boss, layout?:{...} })  SCENE.unmount()
SCENE.update(dt)  SCENE.draw(ctx, t)
SCENE.play(evt) -> Promise            // animate one engine event (attack lunge, slash VFX, hit flash, number pop, block shield, death dissolve...); resolves when the beat is done
SCENE.anchor(kind, id) -> { x, y, w, h, top:{x,y}, feet:{x,y}, head:{x,y} }   // stage coordinates for DOM overlays
SCENE.hitTest(x, y) -> { kind:'enemy'|'hero', id } | null
SCENE.setHover(kind, id)  SCENE.setTargetable([ids])  SCENE.setIntentsVisible(bool)
SCENE.shake(mag, ms)  SCENE.flash(color, ms)  SCENE.hitstop(ms)  SCENE.banner(text, kind)   // 'YOUR TURN', 'ENEMY TURN', 'BOSS'
SCENE.setViewState(id, {hp, block})   // the DOM layer shows numbers; the scene mirrors HP for death/hurt poses
```

### 5.10 `GAME` (`main.js`)

```
GAME.boot()  GAME.state = { R:null }
GAME.newRun({heroes, trial, seed, daily})  GAME.continueRun()  GAME.abandon()  GAME.toTitle()
GAME.enterNode(node)       // routes a RUN node to its screen
GAME.nodeDone()            // called by a screen when finished: saves the run, applies chapter flow, returns to the map
GAME.debug = {
  open(screen, opts),      // jump to any screen with a synthetic run. opts: heroes, chapter, enemies, tier, trial, gold, deck, relics, seed, ...
  quickRun(opts) -> R,     // build a run and go to the map
  win(), lose(), setGold(n), addRelic(id), skipChapter()
}
```

URL params handled by `GAME.boot`: `?debug=1` exposes `window.GAME`, `window.RUN`... for QA; `?goto=combat&enemies=kappa,tanuki&heroes=hanae,kuro&chapter=1` opens
a screen directly (used by screenshot tooling); `?seed=N` fixes the run seed.

### 5.11 Screens

Each screen file registers `UI.screens.<name>` and any overlays in `UI.overlays`. A screen is `{ enter(params), leave(), update?(dt,t), draw?(ctx,t), onKey?(e), music? }`.
Screens build DOM under `UI.layers.screens` on `enter` and remove it on `leave`. They never route on their own: they call `GAME.nodeDone()` or `UI.go(...)` for menu navigation.
Screen names and params (closed): `title`, `heroSelect`, `library`, `bestiary`, `settings`, `howto`, `map`, `combat {node}`, `reward {rewards, source}`, `shop {node}`,
`event {node}`, `camp {node}`, `forge {node}`, `chest {node}`, `gemcache {node}`, `chapterClear {chapter}`, `gameOver {summary}`, `victory {summary}`.
Overlays: `deck {mode:'view'|'pick'|'upgrade'|'remove'|'socket', filter, onPick}`, `pause`, `settings`, `relics`, `legend`, `cardPick {title, cards, onPick}`, `confirm`.

## 6. Flow

```
title -> heroSelect (pick 2 heroes, Ink Trial, seed / Daily) -> GAME.newRun -> map(ch1)
map: paint, use brush, walk -> RUN.step -> Node -> GAME.enterNode -> combat | shop | event | camp | forge | chest | gemcache (instant: well, brush)
combat win -> RUN.combatDone -> reward -> map ;  boss win -> reward -> chapterClear -> map(next chapter) or victory
combat lose -> gameOver ;  every finished node -> META.saveRun ;  title shows Continue when META.hasRun()
```

## 7. Verification (every owner, before reporting done)

1. `node tests/rogue_book_<yours>.test.mjs` green and meaningful (real assertions, not "does not throw").
2. `node tests/rogue_book_hygiene.test.mjs` green (no dashes, no `Math.random`, scripts parse).
3. Content owners: `DATA.validate('<registry>')` returns zero errors (run it through `boot({only:['data*']})`).
4. Drawing owners: render your sheets with `node tools/rogue_book/shot.mjs --url "rogue_book/gallery.html?sheet=NAME&w=1600&h=900" --out <scratchpad>/x.png`, LOOK at the PNG with the Read tool, and iterate at least three times. Compare your work against `ART_BIBLE.md` honestly: if it looks generic, redo it.
5. UI owners: drive your screen with `GAME.debug.open(...)` through `tools/rogue_book/shot.mjs`, look at the screenshots at 1280x720 and 390x844 (mobile), and fix what is ugly.
6. Report: what you built, public API additions, deviations from this document (there should be almost none), known gaps.

## 8. Definition of "done" for the whole game

It boots, the full flow plays start to finish for all four heroes across three chapters with no console errors, every card/enemy/relic/gem/event
is reachable and works, saves and resumes, works on touch, sounds and looks like nothing else on the site, and `npm run check` is green.

## 9. File ownership

Your task prompt names the files you own. You may create test files `tests/rogue_book_<yourmodule>.test.mjs` and scratch files in your scratchpad only.
Ownership by wave:

| wave | files |
|---|---|
| 0 (done by the lead) | `util.js data.js index.html gallery.html DESIGN.md ART_BIBLE.md CONTENT_SPEC.md`, `tests/rogue_book_lib.mjs rogue_book_all.mjs rogue_book_hygiene.test.mjs`, `tools/rogue_book/shot.mjs` |
| 1 logic | `data_text.js combat.js` (one engineer); `map.js`; `run.js meta.js`; `data_cards_hanae.js`; `data_cards_kuro.js`; `data_cards_suzu.js`; `data_cards_raiga.js`; `data_enemies_1.js`; `data_enemies_2.js`; `data_enemies_3.js`; `data_relics.js data_gems.js data_cards_shared.js`; `data_events.js data_meta.js` |
| 1 presentation | `art.js art_heroes.js` (art director); `audio.js`; `ui.js main.js css/base.css` |
| 2 art | `art_enemies_1.js`; `art_enemies_2.js`; `art_enemies_3.js`; `art_cards.js`; `art_icons.js`; `art_scenes.js art_map.js`; `art_fx.js` |
| 2 screens | `scene.js`; `screen_combat.js css/combat.css`; `screen_map.js css/map.css`; `screen_menu.js css/menu.css`; `screen_node.js css/node.css`; `screen_end.js css/end.css tutorial.js` |
| 3 to 4 | integration, balance and polish agents get explicit file lists in their prompts |
