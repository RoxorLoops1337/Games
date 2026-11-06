# THE WARD: the hospital you build instead of a map

Owner's idea, restated: the run's map becomes a hospital you build yourself, room by room, in the
spirit of Theme Hospital (building), Dungeon of the Endless (power) and Monster Train / Griftlands
(a layer of choices that is a game of its own). Fights, elites, events, shops and the forge stop
being fixed nodes on a path. They are ROOMS you build, which SPAWN their contents on timers, and
which only trigger when your hero WALKS THROUGH them. The combat game (cards, grafts, the Thread)
is unchanged: the Ward decides what you fight, when, in what order and with what bonuses.

Goal of the layer: every day asks a real question. "Do I build a second ward to farm cards, or a
generator so my workshop stays lit? Do I walk through the full fight room now (5 monsters, big
reward) or let it fester? Do I go to the event at midday when it pays gold, or at night when the
elite next door is a level 2?"

## 1. Structure of a run

- 3 acts = 3 floors of the hospital (Ward, Market Wing, Theatre). Each floor is a fresh building
  site; resources carry over at 50 percent, the building deck carries over in full.
- Each floor lasts a fixed number of DAYS (act 1: 6, act 2: 7, act 3: 7). On the last day the act
  boss arrives in the Operating Theatre (a fixed room placed at floor start, far from the Entrance).
  At NIGHT of the last day you are pulled into the Theatre and must fight the boss. You may also walk
  into the Theatre earlier, from day (last - 2), and fight the boss early for a bonus (a free
  building card and 30 gold), because it is not fully scrubbed in yet (boss HP x0.9).
- Act 3 ends with the boss, then the Grafter as now.

## 2. A day has 4 phases

| phase | what happens | world modifier |
|---|---|---|
| MORNING | build stage: draw a hand of 5 building cards, spend resources, play cards, toggle power, then end the morning | rooms tick their timers at the START of morning (spawns appear) |
| MIDDAY | one WALK | events lean to gold and healing outcomes; fights give +10 percent gold |
| EVENING | one WALK | "dinner": +1 card drawn on the first turn of every fight this phase |
| NIGHT | one WALK | monsters +1 Strength, elites +2 Strength and drop +1 relic choice; events lean to strange and risky outcomes; fights give +25 percent gold |

A WALK: choose any room reachable from where the hero stands, within MOVE 4 rooms. The path is the
shortest path through rooms (ties broken toward empty rooms); the player can tap an alternative
path if one of equal length exists. Every room on the path that holds spawned content TRIGGERS in
order (the fight, the elite, the event...). The walk stops early if the hero dies. Walking to the
room you stand in is allowed and triggers it again if it re-spawned (a "wait" option: stay put,
heal 3).

Rooms only connect through doors to orthogonally adjacent rooms. Corridors are rooms too (cheap,
never spawn anything), so layout is a real puzzle: put the event room behind two fight rooms and
you must fight to reach it; put a corridor beside it and you skip the fights but pay wood.

## 3. Rooms (data/ward.js)

The floor is a 9 x 6 grid. The Entrance (hero start) and the Theatre (boss) are pre-placed; a few
cells are walls/rubble that a card can clear. A room may be built on an empty cell orthogonally
adjacent to an existing room.

| room | build cost | power | spawns | cap | notes |
|---|---|---|---|---|---|
| Corridor | 1 wood | 0 | nothing | | cheap connector |
| Ward (fight) | 2 wood 1 stone | 1 | 1 monster every 2 days | 5 | walking in fights all present monsters (3 at once max on the board, the rest arrive as reinforcements when one dies); reward scales with the count |
| Isolation (elite) | 3 stone 1 gold-leaf | 1 | 1 elite every 3 days | 1 | an elite left 3 more days becomes LEVEL 2 (+30 percent HP, +2 Strength, +1 relic choice) |
| Chapel (event) | 2 wood 2 stone | 1 | 1 event every 4 days | 1 | phase changes the event's outcomes (see 2) |
| Dispensary (shop) | 3 wood 2 stone | 1 | restocks every 3 days | | the shop screen |
| Workshop (forge) | 2 stone 2 gold-leaf | 1 | recharges every 3 days | | the forge screen |
| Sawmill | 1 stone | 1 | +2 wood each morning | | resource |
| Quarry | 2 wood | 1 | +2 stone each morning | | resource |
| Counting House | 2 wood 2 stone | 1 | +15 gold each morning | | resource |
| Generator | 3 stone | 0 | +2 POWER capacity | | Dungeon of the Endless style |
| Linen Room (rest) | 2 wood | 1 | recharges every 2 days | | heal 25 percent when walked into while charged |

Resources: WOOD, STONE, GOLD (the existing run gold) and POWER. Power is not spent: it is a
capacity (start 6). Every powered room uses its power while it is ON. The player can switch a room
OFF in the morning: its timers pause and it uses no power, and walking THROUGH an off room costs 3
HP (dark corridor, you stumble) unless it is a corridor. A floor starts with: Entrance, Theatre, 1
Ward, 1 Chapel, 1 Sawmill pre-built and 4 wood, 3 stone, 6 power capacity.

Resources also come from fights (each monster fought: +1 wood or +1 stone, elites +2 of each),
from events, and from relics.

## 4. The building deck

A second, small deck (start 10 cards) used only in the morning. Draw 5, discard the rest at the end
of the morning, reshuffle when empty (like the combat deck). Card kinds:

- ROOM cards: build that room on a legal cell (the card names the room; cost is on the card).
- UPGRADE cards: Reinforced Beds (a Ward spawns every day instead of every 2), Sterile Field (a
  Chapel's event gains a second choice), Overtime (a resource room produces double tomorrow),
  Iron Doors (walking through this room never triggers it), Night Shift (this room's night
  modifier is doubled, for rewards and danger alike), Scrub In (an Isolation elite is stuck at
  level 1).
- EFFECT cards (one day or until used): Morning Rounds (+1 MOVE today), Rations (+1 card draw in
  every fight today), Lamp Oil (no off-room penalty today), Triage (heal 8), Requisition (+3 wood
  or +3 stone), Bribe the Porter (skip the next trigger on your walk), Double Shift (a chosen
  spawner ticks once now), Demolish (remove a room, refund half).

Starter building deck (10): Corridor x2, Ward x1, Sawmill x1, Quarry x1, Chapel x1, Dispensary x1,
Generator x1, Morning Rounds x1, Requisition x1.

Gaining and losing building cards: elites offer a building card choice (pick 1 of 3), bosses offer
a rare building card, the Dispensary sells them and removes one for 50 gold, some events give them.

## 5. Interactions with the existing game

- Fights, elites, events, shop, forge, rewards, graft offers and the boss reuse the existing
  engine calls (startFight, startEvent, makeShop, forge) unchanged; the Ward only decides which and
  when, and passes phase modifiers (enemy Strength, first-turn draw, reward gold multiplier).
- Graft offers after fights are unchanged (the core of the game stays the grafting).
- A Ward room's monster count sets the encounter: 1 to 2 present = a normal small fight, 3 to 5 =
  a large fight drawn from the act's pool with reinforcements, reward gold +30 percent per extra
  monster and a better card reward at 4+.
- Relics and statuses can key on phases ("+1 Strength at midday", "draw 1 extra at night",
  "rooms you walk through at evening heal 2"). Add a handful (data/relics_ward.js).
- Unlocks: building cards and room types are unlockable content like cards (data/unlocks.js),
  with a starting set that is complete (all room types above, half the upgrade/effect cards).
- Difficulty: the floor's day limit is the pressure. A player who never fights arrives weak at the
  boss; a player who lets wards fill up to 5 takes huge fights. Random play must still lose.

## 6. Screen (ui/ward.js), Anatomical Plate style

The floor plan is an architect's blueprint engraved on vellum: hatched walls, room icons as
engraved plates, a brass day clock with four segments (sun, high sun, lamp, moon), resource gauges
(wood, stone, gold, power as lit/unlit bulbs). Each room shows its spawned contents as small
figures or tokens with a count and a timer ring (days until next spawn). Morning: the building hand
fans along the bottom; drag a room card onto a glowing legal cell; tap a room to toggle power.
Walk phases: tap a destination; the path draws as a red thread through the rooms with the trigger
icons in order and a summary ("2 fights, 1 event, you arrive at the Chapel"); confirm to walk; the
hero token walks room to room and each trigger opens its screen, then returns to the Ward.

## 7. Build order

1. Engine (engine/ward.js, data/ward.js): state, grid, legality, build/upgrade/effect, power,
   timers, phases, walks and trigger sequences, boss day, rewards; run.mode 'ward' using the
   existing fight/event/shop/forge screens; serialize; sim policy; tests. Classic map stays as a
   mode until the Ward is finished.
2. UI (ui/ward.js and the flow): the blueprint screen, morning hand, path preview, walk animation.
3. Content and balance: upgrade/effect cards, ward relics, building card rewards, unlocks, phase
   tuning so the difficulty targets in DIFFICULTY.md hold in Ward mode.
4. Make the Ward the default mode.

## 8. Engine as built (step 1 done: engine/ward.js, data/ward.js, tools/graftwork_ward_sim.mjs, tests/graftwork_ward.test.mjs)

API (pure, seeded by run.rng, state on `run.ward`, saved with the run):
- `RUN.newRun({ mode: 'ward' })` sets `run.mode = 'ward'` (classic runs carry NO mode field, so their saves stay byte identical; `RUN.runMode(run)` reads it). `RUN.startAct` calls `wardInit(run, act)` in ward mode. `run.phase === 'ward'` means the Ward screen; `run.ward.phase` is morning | midday | evening | night.
- `run.ward = { act, day, dayLimit, phase, w, h, grid[y][x] (null | 'rubble' | roomId), rooms{ id: {type, x, y, on, level, timers:{spawn}, contents, upgrades, overtime?} }, hero:{room}, res:{wood, stone}, power:{base, cap, used}, deck:{draw, hand, discard} (cards {uid, id}), effects:[{id, n, until:'day'|'used'}], walk:{path, i, dest, wait, forced} | null, log, bossDone, why }`. Gold is the run's gold.
- Morning: `canBuild(run, uid, x, y)`, `canPlayBuild(run, uid, target)` -> `{ok, why}` with why in phase nocard cost bounds occupied rubble adjacent target type already hero cut fixed timer power; `playBuildCard(run, uid, target)` (target `{x,y}` for room cards and Demolish on rubble, a room id for upgrades, Double Shift and Demolish, 'wood'|'stone' for Requisition); `togglePower(run, roomId)`; `endMorning(run)`. Helpers: `buildCells`, `wardPower`, `neighbors`, `roomAt`, `buildDeckList`.
- Walks: `pathTo(run, roomId, alt)` -> `{ok, why, path (rooms after the start; [here] for a wait), triggers [{room, kind, detail, bribed?}], cost, offPenalty, alts [{path, triggers, offPenalty}], move, wait?, forced?}`; why in phase morning target far unreachable boss. `startWalk(run, roomId, alt)` returns the first trigger's pending (run.phase is now combat / event / shop / forge), `null` when the walk ended with nothing to open (the phase already advanced), or `false` when illegal (`run.ward.why`). `afterTrigger(run)` continues the walk; `RUN.advance` (after reward, graft, shop, forge) and `RUN.afterEvent` call it in ward mode, so the existing screens need no change.
- Rewards: elite and boss rewards carry `rw.buildChoice` (ids); `takeBuildChoice(run, idOrNull)`. `rw.ward = {wood, stone, count, goldMul}`, early boss `rw.wardBonus = {gold, card}`. A night elite (and a Level 2 elite) turns `rw.relic` into `rw.relicChoices`.
- Dispensary: `makeShop` adds `shop.builds [{id, price, sold}]`, `shop.buildRemovePrice`; `RUN.shopBuy(run, 'build', i)` and `RUN.shopBuy(run, 'buildRemove', 0, cardUid)` (once per visit).
- Combat hook (engine/combat.js, inert in classic): `run.pending.mods = {enemyStr, firstTurnDraw, handAdd, hpMul, goldMul}` and `run.pending.reinforce = [enemyIds]`. newCombat applies Strength and the HP multiplier to every enemy, adds `handAdd` to the hand size and `firstTurnDraw` to turn 1; when a non-minion dies the next reinforcement spawns (event `{t:'reinforce', e, id, left}`). goldMul is applied in the reward, not in combat.
- Unlocks: kind `build` (`build:b_*`), start set = every room card plus b_overtime b_iron_doors b_reinforced_beds b_morning_rounds b_requisition b_triage b_lamp_oil.

Choices and changes from sections 1 to 6 (all numbers live in data/ward.js):
- Ward spawns 1 monster EVERY day (doc: every 2) and Reinforced Beds makes it 2 a day; Isolation every 2 days (doc: 3). At the doc's numbers the strong bot met about 5.5 one-monster fights and 1.2 elites per act and won 47 percent; now 9 to 12 fights and 1 to 2.4 elites per act.
- Starter building deck is 12: Corridor, Workshop, Ward, Isolation, Sawmill, Quarry, Chapel, Dispensary, Generator, Linen Room, Morning Rounds, Requisition (one Corridor became a Workshop; Isolation and Linen Room added) so elites, forge and rest do not hinge on a reward.
- Gold-leaf costs are run gold: Isolation 3 stone + 20 gold, Workshop 2 stone + 40 gold.
- Encounters: up to 3 monsters on the board, the rest are real reinforcements (combat hook). Gold: 1 monster 75 percent, 2 monsters 100 percent, +30 percent per monster beyond 2; 4+ monsters queue one more graft pick (there are no card rewards in Graftwork). Each monster +1 wood or stone, an elite +2 of each.
- Dark (off) rooms: contents sleep (they do not trigger) and crossing costs 3 HP (never below 1); corridors, Entrance and Theatre never go dark. Iron Doors still trigger when the room is the walk's destination. Waiting (walking to your own room) heals 3 and triggers the room if it holds something.
- Sterile Field: the Chapel holds 2 events and you sit through both (doc: "a second choice"). Rations: +1 card drawn every turn of every fight today. Bribe the Porter costs 20 gold and never skips the boss. Night Shift doubles night Strength and the night gold bonus in that room.
- Events: the Chapel draws from the act pool (as classic); midday weights events whose text mentions heal or gold x3, night weights random, relic, max HP, Overload, 50% x3.
- Boss: the Theatre triggers when walked through or into from day (last - 2); before that it is safe to cross. Early boss: HP x0.9, +30 gold, a free uncommon or rare building card. The boss ignores night Strength. On the last night every walk but the Theatre is refused and the Theatre is entered from anywhere. After the boss reward the next floor starts (heal 50 percent as classic); after the Act 3 boss the Grafter fight starts at once.
- Floor: Entrance in column 0, Theatre in column 8; pre-built rooms in the left half; 3 to 5 rubble (4 to 6 in Acts 2 and 3) never next to the Entrance and never sealing the Theatre off. A room card needs an empty cell next to a room other than the Theatre. Demolish never removes the Entrance, Theatre, the hero's room or a room that would cut another off.
- A new floor's first morning already ticks timers and produces, so pre-built rooms open with a monster, an event and +2 wood.

Sim (tools/graftwork_ward_sim.mjs, strong = heuristic builder and walker on POLICIES.strong fights; random = random builds, walks and fights; N = 30 per hero):

| A0 | win | died act 1/2/3 | Act 1 fights / monsters / elites | Act 2 | Act 3 |
|---|---|---|---|---|---|
| random (all heroes) | 0/90 | 90/0/0 | | | |
| strong marrow | 27% | 0/12/10 | 9.4 / 9.4 / 1.0 | 10.7 / 12.2 / 2.4 | 9.4 / 11.6 / 2.4 |
| strong wick | 43% | 1/8/8 | 8.7 / 8.8 / 1.6 | 10.2 / 11.1 / 2.0 | 11.2 / 12.8 / 1.8 |
| strong odile | 33% | 1/8/11 | 9.1 / 9.2 / 1.1 | 11.6 / 13.1 / 2.0 | 9.5 / 11.4 / 1.6 |

A5 strong: marrow 13%, wick 20%, odile 13% (classic A5 target 8 to 18). Every act has 2 events, 1 to 2 shops and 1 to 2 forges. The bot almost never takes the early boss.
