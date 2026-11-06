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
