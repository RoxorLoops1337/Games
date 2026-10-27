# SUNBEAM SIEGE: module contract (lead-authored, binding for all build agents)

All code is classic scripts attached to `window.SB`. No modules, no build step, must run from file://.
Never use em dashes. Combat never calls Math.random (use the seeded battle RNG).

## Folder and load order (index.html loads in this order)
1. `src/data/*.js` (all data files, plus glossary.js and the SB.data.rules constants)
2. `src/engine/util.js` (rng mulberry32, deepClone, helpers), `src/engine/registry.js` (effect ops, triggers, statuses, keywords registries), `src/engine/battle.js`, `src/engine/battle-ai.js` (pest intents), `src/engine/run.js`, `src/engine/rewards.js`, `src/engine/map.js`, `src/engine/profile.js` (wraps SB.data.meta helpers)
3. `src/gfx/*.js` (pawprint, pestprint, icons, fx), `src/audio.js`
4. `src/ui/*.js` (one file per screen, plus `ui-core.js` first), `src/main.js`
Ownership: engine agents own `src/engine/*`; UI agents own `src/ui/*`, `index.html`, `src/main.js`, `src/styles/*.css`. Do not edit files you do not own. If you need a change elsewhere, write it in your report.

## Content lookup (engine owns, UI uses)
`SB.content`: built at load by `src/engine/content.js` from all `SB.data.*` arrays.
- `SB.content.card(id)`, `SB.content.cards()`, `.pest(id)`, `.relic(id)`, `.event(id)`, `.champion(id)`, `.upgrade(id)`, `.enemyIdsByAct(act)`, `.encounter(id)`
- Handles id aliases (A03 bare ids like `swat` map to `neutral_swat`, `hairball` to `curse_hairball`, `lap` clan to `hearth`).
- `SB.content.validate()` returns `{errors:[], warnings:[]}` including every unknown effect op, trigger, status, keyword, target, check and counter found in data. Must be callable in node via a stub window.

## Card instances (the deck)
`{ uid, id, scratches:[upgradeIds], fork, knead, plays, masteryRank, growth:{power,health}, lives, maxLives, champion:{tiers:[...picked option ids]} }` per A06 section on the instance model. `SB.cardInst.make(id)`, `SB.cardInst.effective(inst)` returns the computed display card (cost, power, health, text, keywords, lives).

## Battle API (SB.battle, owned by engine agent C1)
```
const B = SB.battle.create(run, encounter, opts) // opts: {seed, tutorial, noWitching, onEvent}
B.state          // plain JSON-safe snapshot, updated in place; UI reads it
B.on(fn)         // fn(evt) for every animation event, in order
B.canPlay(uid)   // {ok, reason, targets:[{floor, pos}|{pestUid}], needsTarget:'floor'|'pest'|'cat'|'none'}
B.playCard(uid, target)  // {ok, reason}
B.toggleNap(catUid)      // {ok, reason}
B.endTurn()              // runs the rest of the round to the next player turn or the end
B.surrender()
B.result()               // null until over, then {outcome:'win'|'lose', growth:[...], stats:{...}, loot:{...}}
B.serialize() / SB.battle.restore(run, snapshot)
```
`B.state` shape:
```
{ round, phase, turn:'player'|'resolving'|'over', zoomies, nip:{meter,surge,crash}, bank,
  hand:[{uid,card}], drawCount, discardCount, exhaustCount, discard:[uid...], 
  floors:[ // index 0 = Cellar, 1 = Parlor, 2 = Attic
    { cats:[CatUnit], pests:[PestUnit], rooms:[RoomItem], statuses:{purr:..}, capacity:{cats:4,pestSize:5,rooms:2} } ],
  garden:[PestUnit], // queue outside
  sunbeam:{warmth, max, shade}, clock:{round, nextWitching, isWitching},
  intents:[{pestUid, icon, text, dmg, floors}], incoming:[floor0,floor1,floor2,sunbeam] // incoming damage badges
  log:[string] }
CatUnit = {uid, cardUid, id, name, power, health, maxHealth, lives, maxLives, statuses:{}, napping, hidden, boxed, floor, pos, art}
PestUnit = {uid, id, name, hp, maxHp, fluff, size, statuses:{}, intent, floor, pos, traits, tags, art}
```
Animation events (`B.on`): `{type:'draw'|'play'|'deploy'|'attack'|'damage'|'heal'|'death'|'lifeSpent'|'spawn'|'move'|'knock'|'status'|'phase'|'witching'|'surge'|'crash'|'nap'|'wake'|'zoom'|'sunbeamHit'|'intent'|'win'|'lose'|'toast', ...}` each carrying enough ids and numbers for fx.js and audio (`from`, `to`, `amount`, `uid`, `floor`, `pos`, `kind`). The UI plays them back sequentially with timing; the engine does not wait on the UI (B.endTurn resolves instantly and returns the full event list; UI replays them from the queue while locking input).

## Run API (SB.run, owned by engine agent C2)
```
SB.run.newRun({seed, clan, side, championId, gift, rank, tutorial}) -> run
run = { seed, rng:{map,reward,shop,event,misc}, clan, side, deck:[CardInst], relics:[{id,counter}], fish, warmth, maxWarmth,
        act, night, map:{rows,nodes,edges}, pos:nodeId|null, flags:{}, stats:{}, rank, omens:[], log:[] }
SB.run.availableNodes(run) -> [nodeId]
SB.run.enterNode(run, nodeId) -> {type:'battle'|'elite'|'boss'|'shop'|'event'|'post'|'nook'|'treasure'|'mystery', payload}
SB.run.encounterFor(run, node) -> encounter def (waves, enemy ids with hpScale)
SB.run.finishBattle(run, result) -> rewards screen payload {fish, cardChoices:[ids], relicChoices?, clanReward?, growthReport, heal}
SB.run.pickCard(run, cardId|null) / pickRelic / skip
SB.shop.open(run) -> {stock:[], services:[], banter} ; SB.shop.buy(run, item) ; SB.shop.remove(run, uid)
SB.event.pick(run, eventId?) -> event ; SB.event.choose(run, event, idx) -> {text, fightEncounter?, effectsApplied}
SB.post.options(run, uid) / SB.post.scratch(run, uid, upgradeId) / SB.post.fork(...)
SB.nook.options(run) / SB.nook.choose(run, option)
SB.run.championUpgrade(run, tier, optionId)
SB.run.save(run) / SB.run.load() / SB.run.summary(run, outcome)  // localStorage key nl_run_v1, try/catch
```
## Profile (SB.profile): thin wrapper over SB.data.meta helpers (load, save, recordRun, syncUnlocks, isUnlocked(kind,id), cosmetics).

## UI contract (owned by UI agents)
`SB.ui.go(name, params)`; screens register in `SB.ui.screens[name] = {mount(root, params), unmount()}`.
Screen names: `title`, `settings`, `collection`, `story` (cutscene), `newrun` (clan, side, champion, gift, rank), `map`, `battle`, `reward`, `shop`, `event`, `post`, `nook`, `treasure`, `summary`, `tutorial` (drives scripted fights via SB.data.tutorial), `gameover`.
`SB.ui.card(cardInstOrDef, opts)` returns a DOM element for a card (shared renderer, in ui-core.js). `SB.ui.tooltip(glossaryId)`, `SB.ui.toast(msg)`, `SB.ui.modal(el)`.
The battle screen is the heart: house cutaway, 3 floors, drag or tap card then tap floor or target, intent icons, incoming damage badges, Nap toggle on cats, deck/discard viewers, relic bar, end turn button, Witching Hour clock, Nip meter, Banked Lives chip, keyboard shortcuts. Responsive: desktop and phone portrait.
Art: cats via `SB.gfx.pawprint.drawCat`, pests via `SB.gfx.pestprint.drawPest`, icons via `SB.gfx.icons`, particles via `SB.gfx.fx`, sound via `SB.audio`.

## Rulings added to RULES.md (lead, binding)
- Heirlooms: each clan has 2 heirloom relics; the run starts with ONE of the clan's two, chosen at run start.
- Champion upgrade path rule: `treeRule:"free"` for all champions (any option at any tier). 12 final-form bonuses unlock by taking the same path A, B or C at all three tiers.
- Gerald's removal desk can remove curses as well as normal cards (75 Fish, +25 each time).
- Oswin Cash Out damage cap 150 total per use; Tuppence House Remembers cap 40 per hit.
- Thirteenth Chime may break "no Witching Hour twice in a row" (explicit exception).
- Alarm Clock (pest_alarm_clock) is both a regular Act 3 household enemy and the Night 9 Dawn phase entity per story; the boss agent defines the Dawn phase entry separately as `pest_alarm_clock_dawn`.
- Starter basics for clans without one (hearth, mischief, moon): engine agent writes `src/data/cards-starters.js` with `hearth_basic_kitten`, `mischief_basic_kitten`, `moon_basic_kitten`, `alley_basic_kitten` (2 lives... see RULES), 1 cost, simple stats, to fill the 4 main-clan basics and 1 side-clan basic starter slots.
- Gerald, Elder Cat (Pewter), Staff (never shown) are the recurring NPCs.
