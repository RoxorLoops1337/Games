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

## 9. Content and balance pass (Z3)

Content (all data, hooks in engine/ward.js; numbers in data/ward.js WARD_TUNE):
- 48 building cards (was 25): 19 room cards, 9 upgrades, 20 effects. New rooms: Pharmacy (a potion every 3 days, 15 gold if the belt is full), Library (25 percent a morning to upgrade a random card), Morgue (+1 stone per monster fought), Kitchen (dinner draws 2, not 1), Boiler (no power, +1 capacity per two lit Wards), Laundry (washes a junk card out every 2 days), Isolation Ward II (Level 2 elite every 3 days, uses 2 power), Scaffold (a free Corridor). Pharmacy, Library and Laundry are "auto" rooms (`auto` in ROOMS): they work every morning while lit, no walking. New upgrades: Double Doors (walking through costs no MOVE), Soundproofing (no night modifiers in the room), Fire Door (Ward holds 3, double wood and stone). New effects: Floodlights, Overtime Pay (5 gold per powered room, max 50), Night Nurse (heal 3 per room on the night walk), Quarantine (clear a room, no spawns for 2 days), Fumigate (kill a Ward's monsters, no rewards), Skeleton Crew (+2 power today), Fresh Linens, Shift Change (every timer ticks), Open Ledger (draw 2), and the dice cards Loaded Dice (permanent +2 sides, `w.dieUp`), Lucky Roll (one reroll today, effect `reroll`) and Weighted Die (+1 to every roll today, effect `dieBonus`). The dice cards only record state; the walk die in engine/ward.js reads it.
- Start set (data/unlocks.js START.build): the 11 original rooms, Scaffold, Laundry, Overtime, Iron Doors, Reinforced Beds, Double Doors, Morning Rounds, Requisition, Triage, Lamp Oil, Overtime Pay, Open Ledger, Fresh Linens. The other 21 are earned. TARGET_TOTAL 900 became 906 so the rounded costs still total at least 28 runs of the cap.
- Offers have a shape (`OFFER_SLOTS`): elite = common or uncommon, uncommon, uncommon or rare; boss = rare, rare or uncommon, uncommon; Dispensary = common or uncommon, uncommon or common, uncommon or rare (+1 slot per Dispatch Ledger).
- 17 Ward relics (data/relics_ward.js, `ward: true`, never rolled in classic runs): Noon Ration, High Sun Tonic, Moon Lamp, Dinner Gong (boss), Supper Bell, Night Ledger, Spare Fuse, Extra Cot, Master Key (boss), Stockpile Deed, Dawn Whistle, Walking Shoes, Hard Hat, Dispatch Ledger (shop), and the dice relics Noon Dial, Lucky Coin, Bone Dice (boss; perks `dieMidday`, `rerollDay`, `dieSides`). Combat ones read the phase from `c.wardMods.phase`; the rest are perks read by engine/ward.js (`eveningHeal nightGold powerCap wardCap firstFree startRes handPlus move noDark shopBuild`). Five commons are in the start relic set.
- Events: an event may carry `phase: 'midday' | 'evening' | 'night'` (or an array); `eventWeight` gives 3x in those phases and 0.5x elsewhere. Untagged events keep the old text lean. 17 older events are tagged (`EVENT_PHASE` in data/events.js) and 10 new Ward-only events (`ward: true`, ids `e_w_*`) pay differently at midday, evening and night. The pending event carries `phase`.
- Balance changes: waitHeal 3 to 5, Linen Room heal 25 to 30 percent, early boss HP x0.9 to x0.85, gold 30 to 60 and one more graft pick.

Sim (tools/graftwork_ward_sim.mjs, strong bot, A0, N=100 per hero; GW_UNLOCK=start|all, GW_TUNE='{"tune":{...}}' patches numbers in memory; policies strong careful sloppy random passive fill):

| pool | marrow | wick | odile |
|---|---|---|---|
| start | 36% | 42% | 39% |
| all | 20% | 20% | 30% |

random 0/300; sloppy 0/60; passive (never builds, hides) about 5 percent at N=20; fill (lets Wards fill to 5) dies in Act 1 almost always. Per act the strong bot meets 8 to 11 normal fights and 1.5 to 3 elites. The "all" pool is 10 to 20 points below "start" for reasons not found (dropping the Ward relics, events or cards one kind at a time did not close it, noise at N=100 is about 4 points). Unlock pacing (tools/graftwork_unlocks.mjs 200 30, GW_MODE=ward uses Ward runs): classic strong 41 and careful 55 runs (unchanged from before this pass), Ward strong 42 and careful 49.

PENDING: the walk is being changed to a die (D4, upgradeable). The win rates above are for the fixed MOVE 4 walk. The final balance sweep, the early boss tuning (the bot never takes the early boss, even with a corridor road; it needs a bot rule and a bonus check on the new walk) and the all-pool gap must be redone once the dice walk lands.

## 9. Dice routes (replaces "pick a destination within MOVE 4")

Each walk phase (midday, evening, night) starts with a ROLL of the walk die (a D4 to begin). The roll N is the longest route of that
phase. Then the player PLANS A ROUTE: click an orthogonally adjacent room next to the hero (each click appends one step, up to N, you may
stop earlier), never the same room twice (the room you stand in counts as entered), click the last step again (or Undo step) to take it
back, press Go. The hero walks the route and EVERY room entered activates one by one, in order (fight, elite, event, shop, forge, rest;
corridors and empty rooms just pass), each opening its screen, until the route ends or the hero dies. Dark rooms still cost HP, Wait here
still heals (and uses the phase), the last night still forces the Theatre (no route, no roll), and the Theatre may end a route when the
boss is open (day last-2 onward): entering it triggers the boss, so a route never continues past it.

State and API (engine/ward.js, all on run.ward): `roll {key 'day:phase', base, sides, bonus, n, lucky}`, `route [roomId]`, `dieUp` (extra sides,
Loaded Dice). `rollWalk(run)` is called by endMorning and advancePhase (and lazily by `rollOf` for older saves); sides = 4 + dieUp + relic
`dieSides`; bonus = Morning Rounds (effect `move`) + Weighted Die (`dieBonus`) + Noon Dial (relic `dieMidday`, midday only); Lucky Roll
(effect `reroll`) or the Lucky Coin (once a day) allow `rerollWalk`. `routeWhy(run, rid)` -> null | phase morning boss full visited
theatre unreachable target; `extendRoute`, `undoRoute`, `clearRoute`, `legalSteps`, `routeInfo(run, route?)` (path, triggers, offPenalty,
left), `startRoute(run)` (walks `route` through `afterTrigger`, same return as startWalk). `pathTo` and `startWalk` are kept (the shortest
path within MOVE) for the forced boss walk, Wait here, the sim's old walker (`GW_OLDWALK=1`) and the legacy tests.

UI (ui/ward.js): an engraved die in the walk strip tumbles when rolled (instant with reduced motion) and keeps the result; the right
panel reads "Route: 2 of 3 steps" with the numbered triggers; buttons: Go (G), Undo step (or Lucky Roll when the route is empty), Wait here.
Hover shows the next step as a ghost on the thread; an illegal room explains why in the chip (no door, already in the route, roll spent).

Balance (tools/graftwork_ward_sim.mjs plans routes of up to the roll; N=40, A0): see design/WARD_PLAYTEST.md for the table. Average roll 2.5
against the old fixed 4 means about 1.5 fewer fights per act; the knobs are the days per floor, ward spawn rates, waitHeal and resource per monster.

## 10. Balance pass on the dice walk (Z3)

Why the dice walk lost wins: an average roll of 2.5 rooms visits fewer rooms than MOVE 4, so a floor gives fewer graft picks and the strong bot reached Act 2 and 3 with a thinner deck (A0 17 to 20 percent). Levers tried at N=50 to 60 per hero (strong bot, A0): morning heal 6 or 10 (no effect: HP is not what kills the bot), waitHeal 8, Ward cap 4, board size 2, softer night and Level 2 elites (all within noise), longer floors alone (more Act 1 deaths). What worked was more graft picks and a longer floor together.

Shipped numbers (data/ward.js): FLOOR days 8 / 8 / 8 (was 6 / 7 / 7), `bigFight` 2 (a Ward fight of 2 or more monsters queues one more graft pick, was 4), `bossIdle` (the boss gets +1 Strength per 2 fights below 6 fought on the floor, so hiding loses), `morningHeal` 0 (hook kept, unused). The Ward test asserts the day counts.

| A0, strong bot, N=60 per hero | marrow | wick | odile |
|---|---|---|---|
| start pool | 33% | 30% | 37% |
| all pool | 18% | 20% | 18% |
| start pool, A5 (N=40) | 15% | 25% | 25% |

random 0/120, sloppy 0/120, passive 1/180 (odile). Per act the strong bot fights 9 to 11 normal fights and about 2 elites in Act 1 to 3. The all pool is still 12 to 18 points below the start pool (same as before the dice; no single content kind explains it, N=120 ablations are noise at about 4 points). Spread is 7 points in the start pool and 2 in the all pool. The early boss is still never taken by the bot (needs a route-planning rule, a bot issue); its bonus was left at HP x0.85, 60 gold, one more graft pick.

Unlock pacing (GW_MODE=ward, 200 players, 30 runs per hero pool): UP per boss 4.5 to 4.8, per elite 0.8 to 0.9, Act 3 reached 6 to 7, and Ward trigger rooms now count as floors (stats.floors). Ward strong median 40 runs to unlock all, careful 47; classic strong 39, careful 52. The "sloppy" unlock tier is the classic never-graft bot and is not meaningful in Ward mode.

## 11. Closing the all-pool gap and the early boss (Z3)

Finding: the all pool was 12 to 18 points below the start pool because of the BOT, not the content. Ablation (start pool plus one kind of locked content, strong bot, A0, N=100 per hero): locked cards 34/35/37, potions 28/32/39, events 29/37/42, building cards 42/48/48 (no harm at all), relics 24/25/36, safe grafts 29/24/35, greedy grafts 29/33/27, weird grafts 15/22/28. The 36 locked weird grafts carry a custom hook, which the classic strong pick (`graftScore` in tools/graftwork_sim.mjs) cannot value, so it adds a flat rarity credit of 2 / 3.5 / 5 points. That credit overpays weird grafts whose price (jams, junk, hand clogging) is bigger than the hook's boon, so the bot kept sewing them onto its best cards. No weird graft stood out as net negative on its own (per-graft win rates in the deck at N=450 per hero lie between 23 and 64 percent, within the survivorship noise), so no graft numbers were changed.

Fix (bot, tools/graftwork_ward_sim.mjs): `wardPickGraft` is the strong pick with the weird credit halved (`GW_WEIRD_K`, default 0.5; 1 is the old behaviour, 0 removes it) and an empty per-graft table `GRAFT_ADJ` for future corrections. `GW_OLDPICK=1` restores the classic pick. New env `GW_UNLOCK=start+card,graft:weird,relic:rare` runs the start pool plus every locked item of those kinds (a kind may be narrowed by tier, school, hero or rarity) for ablations.

Early boss (bot): it never took the early boss because the Theatre was never connected: the map is 9 wide, the Theatre sits on the far edge, the bot built about 3 Corridors and left 10 to 30 wood unspent. Rules now: (1) a Corridor (or Scaffold) is worth 6.5 while no chain of rooms links the hero to the Theatre (`theatreLinked`), (2) producer rooms are placed with a pull toward the Theatre (`GW_ROAD`, 0.6 per cell), (3) once the boss is open (last 2 days) and HP is at least 65 percent (`GW_EARLY_HP`), a route that enters the Theatre scores +30 and routes ending closer to it get up to +10, (4) `GW_EARLY=0` switches all of it off. Result: the early boss is fought on 40 to 50 percent of floors (was under 3 percent) and no tuning of its bonus (HP x0.85, 60 gold, one card, one graft) was needed.

Numbers (strong bot, A0, N=150 per hero):

| pool | marrow | wick | odile |
|---|---|---|---|
| all | 33% | 31% | 32% |
| start | 30% | 41% | 45% |

All-pool spread 2 points, inside the 25 to 40 target. The start pool rose (bot picks weird grafts better, early boss pays more); it is not a target. Other policies (N=60): random 0/180, sloppy 0/180, passive 1/180, careful 30 / 23 / 33 percent. Unlock pacing (GW_MODE=ward, 200 players, 30 runs): strong median 39 runs, careful 46 (targets 33 to 40 and 45 to 55).

## Z5 UX notes (see WARD_PLAYTEST.md)

- End Morning warns once when playable plans would be discarded. A room that would be built dark needs the same drop twice (cost is paid either way).
- "Rest day" (key R) waits here for every walk left today; it stops at a trigger, the morning or the boss night. Dark-built rooms relight when a Generator
  (or freed power) allows, newest first. Room hover shows one tooltip under TODAY. The event screen heading names the room and hour.

## 12. Isometric view and art pipeline

The Ward map is an isometric cutaway hospital (ui/ward_iso.js drawn by ui/ward.js). The rules, the engine and every control are unchanged.

Projection and camera. The 9 x 6 grid is projected to a 2:1 diamond grid in world space (a cell is TW 92 x TH 48, the manifest tile ratio is 2 : 1.053). A camera frames the map panel (284,64 712x484): it fits the built rooms (a far Theatre is left out, an arrow chip at the panel edge points to it), the hero and, in the morning, the buildable cells, with eased pan and zoom (snapped with reduced motion), up to zoom 2.4 so a cluster of 8 to 10 rooms is drawn 150 to 220 px wide. Mouse wheel, pinch (a second finger), drag-pan and the + / - / C buttons make the camera manual (a drag that moves past a few px is a pan, never a tap or a drop); Recenter (button or key C) returns to the fit. Cells far from the cluster fade to a faint grid. Logical pixels never change with the stage scale. `cellCenter(x, y)` is the SCREEN middle of a floor, so it follows the camera; picking, the ghost, the focus ring and the room card all use the same transform.

Picking. `ISO.pick(w, mx, my)`: the cell whose diamond holds the point (exact), else the wall volume of a room (a diamond lifted by 34 px; this only matters on the back row and the left edge, because walls over a rear floor resolve to that floor, which keeps every cell reachable). Hover lifts a room 6 px and draws it on top of its neighbours (as do the selected room and the hero's room). Each room registers `ward-room-<id>` (layer `world`) for tooltips and the layout sweep. The keyboard focus ring is a diamond on the cell.

Draw order. Ground (cached plinth and flagstones; plots for buildable cells in the morning; rubble heaps; the glowing placement diamonds while a card is dragged), rooms back to front by x + y, the ghost of the room being dragged, then every actor sorted by screen y (so nobody hides behind a wall), then the time-of-day light, then the thread and the trigger seals. The thread is a glowing stitched line on the floors with the step number on each cell; the trigger seals float above their rooms.

Rooms. A room sprite is aligned by `floorCx / floorCy` and scaled so `floorW` is exactly the cell width. Overlap: rooms draw strictly back to front; the focus rooms (hover, selected, the hero's) are drawn last; any front neighbour that would cover a focus room or a room with monsters is drawn with lowered walls (the top of the sprite above the back wall is cropped, keep ratio 0.5 to 0.62, and alpha 0.55 when it covers a focus room), and in a dense floor (9 or more rooms) every room is lowered to 0.85. Actors are drawn after all rooms, so they are always visible. A room that was just built drops in with a squash and a dust puff. A dark (unpowered) room is drawn from a cold, darkened copy of the sprite (made once in an offscreen canvas, never a second image) with a snuffed lantern and a smoke thread, and what sleeps inside is not shown. The spawn timer is a candle on the front left edge: the wax grows toward the next spawn, a red flame and `!` when the room is full, the days left beside it. Upgrades are gilt pips on the front right edge.

Actors. Monsters of a room stand in it, one figure each up to 5 (the cap); each walks to spots near its home with the two step frames and a bob, stands, blinks and sways, and a new arrival pops in with a dust puff; the hero leaves footstep dust; the Theatre rumbles when the boss is open; lit rooms have drifting dust motes. Hovering a room opens a room card (name, spawn timer bar, power, contents) beside it, kept inside the panel. elites are larger, carry an L1 or L2 tag and use the `<id>_l2` figure when the manifest has one (a pulsing aura otherwise). Events, shops, forges and linen rooms show a floating token. The hero stands on its room (a gold ring on the floor) and walks cell to cell along the route with the two step frames, a bob, a squash, a shadow, and turns toward where it goes. Reduced motion: no wander, bob, squash, flicker, motes or frame swap.

Time of day. A multiply tint over the map (cool morning, plain midday, amber evening, deep blue night) blends across a phase change; lit rooms add a warm lamp pool in the evening and at night (the lit windows), the night adds moonlight from the top right, and dust motes or fireflies drift (not with reduced motion).

Performance. The static ground is cached to an offscreen canvas; the dark copies, the enemy and hero fallbacks and the glow sprite are made once. Measured in Chromium with software rendering: the map draw is about 1.5 ms for 21 rooms and 100 monsters; the rest of the frame is the existing HUD and post. No per-frame allocation except the sort of the actor list.

### The art pipeline

- Files: `graftwork/assets/ward/` (`manifest.json`, `rooms/`, `actors/`, `icons/`, `cards/`), WebP with alpha, `@1x` on phones (stage scale under 0.8) and `@2x` on desktop. Generated by the art pipeline (tools/graftwork_art_build.py); never edited by hand. The manifest is the contract: `tile`, `rooms{id: file1x, file2x, w, h, floorCx, floorCy, floorW, floorH}`, `actors{id: file1x, file2x, w, h, anchorX, anchorY, kind, scale, walk1x, walk2x}`, `icons{wood, stone, gold, power, morning, midday, evening, night}`, `cards{art id}` and `cardsById{b_x: {room} | {card}}`.
- ui/assets.js loads the manifest once when the Ward opens (a lazy cache, `Image` elements, nothing in node or when `fetch` is missing), preloads rooms and actors, and answers `room / actor / icon / card / cardArt` with a drawable or null while loading. A small "Stitching rooms" bar shows while images are on their way. Any failed file means "draw the fallback"; nothing throws.
- Actor ids: the hero id (`marrow`), the enemy id (`bedpan_slime`; `<id>_l2` for a Level 2 elite) and `npc_*`. An enemy the set does not paint yet borrows a figure of its kind (hash of its id) so a room is never empty; with no manifest at all, `drawEnemy` and `drawHero` are rendered once into offscreen canvases.
- Icons and cards: ui/ward_kit.js draws the resource icons, the power bulb (the `power` icon, dimmed when off), the day-phase medallions and the building-card illustrations from the manifest, each with its engraved procedural fallback.
- Tests: tests/graftwork_ui_ward.test.mjs (iso picking, click by iso position, depth order, actors, hero walk, loader, sprite alignment, fallback, reduced motion, light, call budget) plus the layout sweeps; tests/graftwork_art_assets.test.mjs guards the files.


## 12b. Combat art (ui/combat_art.js)

Battles draw the same painted actors as the Ward map, so both screens read as one style.

- Figures. `spriteOf(id)` returns the actor for a hero id or enemy id when the manifest has it and its image is decoded; otherwise the procedural `drawHero` / `drawEnemy` is drawn. The art faces down-right: the hero stands left as drawn, enemies stand right and are flipped horizontally to face the hero. Lanes are sized from each figure's own opaque box (`bbox` in the manifest, via `L.enemySlots(defs, spriteBox)`); a lone normal stands about 180 px tall, an elite or boss about 200 (the intent plate ends at y 156, the floor line is y 356).
- Resolution. Actors are 256 px at @2x, which is soft above about 230 px tall. `tools/graftwork_art_build.py --combat` adds a 512 px `actors/<id>@3x.webp` (manifest `file3x`) and `bbox` from the raw; battles load it lazily (own cache in combat_art.js, the 2x file shows while it decodes) and draw the figures at the sizes above, so they stay crisp on desktop. The boss and the elite are NOT drawn larger than the lane allows; they get presence from composition (aura, floor sigil, motes, wider body) instead. Higher-res raws (1920 px for every actor, a true 512 px painted pass for the Matron) would let combat go bigger.
- Grounding. Every combatant gets one contact shadow (a wide soft pool plus a dark core) on its floor line (hero y 458, enemies y 356), painted or procedural. Idle is a breath scaled from the feet; the sprite never bobs vertically.
- Animation. Enemy attacks reuse the rig timings of art/attacks.js (tell = wind-up pulling away, act = lunge, hold = contact, rec = recoil, with the telegraph glow). Casts rise and glow. Hits flash white, shake, squash and are knocked back (kick), then spring home. Block shows a steel plate in front of the figure that flashes when gained or struck. Death squashes flat, then sinks and fades on the floor with its shadow. The hero has an anticipation, a strike and a recoil, and topples backwards when it dies. Statuses wash the silhouette (poison, burn, vulnerable, weak, bleed...) with bubbles or flames; elites get a gold aura and ring, bosses a crimson aura, double ring and rising motes. Reduced motion removes breath, shake, motes and flicker.
- Fallback. Enemies without a sprite keep the procedural figure, drawn with the same shadow and a colour grade (`GRADE`, a canvas filter: slight sepia, less saturation, a touch more contrast) so they clash less.
- Backdrop. `drawBackdrop` bakes once (per act, encounter kind and scale) a room from the modular kit (`assets/ward_kit/`): a wall texture with trim, wall pieces, a perspective floor (texture strips scaled by depth), baseboard and shading. Normal fights are wooden wards, elites stone walls with banners, bosses stone with banners and a door; the act tints it (cold green, amber, wine). Flickering lamp cones are drawn per frame. Missing kit images mean the old `drawBackground` is drawn, then the kit room fades in. The kit images are loaded by file name (the kit manifest may be empty).
- Tests: tests/graftwork_ui_combat_art.test.mjs (fake manifest and images injected; the headless default has no assets).

### Enemies still without a sprite (feed to the art pipeline)

These ids have no entry in `assets/ward/manifest.json` `actors` and are drawn procedurally (graded) in battle and on the map. Raw naming: `actor_<id>.png` (1920 px, transparent, down-right facing) plus `actor_<id>_b.png` for the map walk frame.

- Act 1 summons: `slime_bit`, `candy_volunteer`
- Act 2 normal: `jarhead`, `haggler`, `coin_mite`, `lantern_fish`, `rust_hound`, `scale_merchant`, `cleaver`, `mold_bloom`, `twin_barrels`, `ledgerman`, `wax_sealer`, `pickled_thing`, `bidder`, `needle_nanny`, `brine_surgeon`, `scissor_nurse`, `ferric_warden`, `tax_collector`
- Act 2 elite: `the_appraiser`, `auction_house`, `pickled_king`; boss: `the_broker`
- Act 3 normal: `usher`, `mask_chorus`, `gilded_cherub`, `puppet`, `spotlight`, `prompter`, `velvet_curtain`, `applause`, `understudy`, `critic`, `heckler`, `stage_manager`, `understudys_shadow`, `locksmith`
- Act 3 elite: `the_diva`, `stagehands`, `gold_leaf_golem`; bosses: `the_impresario`, `the_grafter`

## 12c. Actor animation frames (optional, per actor)

Painted actors can carry extra frames. None are required: every actor without them (or with some missing) keeps the standing frame, the `_b` step frame and the procedural pose, and each missing piece degrades on its own.

Naming of the raws (not in the repo): `actor_<id>_walk1..walk4.png` (a cycle: all four or none), `actor_<id>_atk1..atk3.png` (anticipation, strike, recovery; monsters may have only `_atk2`), `actor_<id>_hit.png`, `actor_<id>_die.png`. 1920 or 2048 px RGBA, the SAME canvas, scale, costume and feet position as `actor_<id>.png`, isometric facing down-right. walk1 = first foot planted (contact), walk2 = passing, walk3 = other foot planted, walk4 = passing.

Build: `python3 tools/graftwork_art_build.py --frames [--combat] [--out=DIR] [RAW_DIR]` (patches the manifest in place, touches nothing else). Each frame gets the standing frame's crop and scale, then is aligned by FEET (contact point measured from alpha the way `contactOf` in ward_iso.js does: lowest opaque row, centre of the bottom 12 percent band) onto the standing contact. A frame whose size is off by more than 35 percent only warns, a figure that falls off the 1024 canvas warns (the figure is 900 px of 1024, so a long lunge clips), an incomplete walk is skipped. Files `actors/<id>_<frame>@1x|@2x.webp` (+ `@3x` 512 px for atk/hit/die with `--combat`; walk frames never get one). Manifest: `actors[id].frames = { walk: [stem x4], atk: [stem...], hit: stem, die: stem, hi3x: bool }`, a stem being the file name without size tag (`marrow_walk1`); absent groups are omitted, nothing else in the entry changes. The pass reports the folder size against the 12 MB budget.

Renderer: `ui/assets.js` (`frames(id)`, `frame(id, stem, app)` answers `{img, def}` with the STANDING def, `walkReady`, pure `walkIndex`, `pickAtkFrame`). A frame is drawn on the standing frame's feet point, so it never slides.
- Map (ward_iso.js `drawActor`, `frameStemFor`): while the gait says the figure is moving (`rec.cycle`) and every walk frame has decoded, the frame is `walkIndex(stride, 4)`: the stride is the existing distance-based phase (0.5 x figure height per step), walk1 lands on every even plant, walk3 on every odd one. Idle is the standing frame; reduced motion and a not-yet-decoded cycle use the old `_b` swap. `rec.pose = 'hit' | 'die'` shows those frames (nothing sets it yet: the map has no hit or death moment).
- Battle (combat_art.js): hero attack `u` 0..0.28 atk1, to 0.46 atk2, then atk3 (recovery); enemy rig phases tell atk1, act and hold atk2, rec atk3. Missing atk frames fall back (strike to atk3 then atk1; with only atk2 the strike is held for the first third of the recovery, the wind-up is the procedural pull back). `hit` shows during the flinch (not over an attack); a death starts with `hit` and switches to `die` where the procedural collapse ends (hero 0.3, enemy 0.34), where the squash, topple and rotation stop (the frame is already lying down) and only the sink and fade remain. While a frame is shown the procedural squash and lean are cut to 30 percent and the lunge travel stays. `frames.hi3x` makes combat use the 512 px files.
- Tests: tests/graftwork_anim_frames.test.mjs (synthetic manifests and images), the frames checks in tests/graftwork_art_assets.test.mjs (manifest validity and the build pass on rasters made on the fly).

## 13. Modular kit renderer (data/ward_kit.js, ui/ward_kit_iso.js)

The painted dioramas (section 12) stay, but a room type that has a RECIPE is now drawn from kit pieces (assets/ward_kit/manifest.json, the lab page `lab/rooms.html` is the same renderer in a sandbox). No recipe, or a recipe whose floor or wall is missing from the manifest, means the painted sprite exactly as before, so art arrives progressively and modular and painted rooms mix on one floor. ui/assets.js loads the kit manifest next to the Ward one (`assets.kitReady / kitImg / kitSettled`, @1x on phones and @2x on desktop, a no-op in node, a bad or missing kit manifest just leaves everything painted). Rooms switch to the kit only once EVERY kit image has loaded or failed (`kitSettled`), so a room never flips from painted to modular piece by piece.

Recipes. `RECIPES[rm_id]` is a list of variants, best first: `{ floor, wall, pieces: [{id, wall: 'L'|'R', s}], props: [{id, u, v, flip}], need?: [prop ids] }`. A room is a 4 x 4 grid of sub-tiles (23 x 12 world px); `u` runs along the right-down edge (the L wall stands on the u = 0 edge), `v` along the left-down edge (the R wall stands on the v = 0 edge); a prop covers its manifest footprint [cols along u, rows along v] from (u, v), flip swaps them; `s` is the position 0 to 1 along a wall. `resolveRecipe(type, kit)` picks the first variant whose floor and wall exist and whose `need` props exist, skips every prop or piece that is missing, drops a prop that would overlap another or leave the grid or block a lane, and returns the occupancy grid, the free sub-tiles (where monsters may wander) and the hero's stand tile. House rules (tested for every recipe against the current kit, against everything delivered, and against the manifest on disk): the lane cells (0,1) (3,1) (1,0) (1,3) stay free because a door leads out there (rows or columns 1 to 2 of a wall), and every free sub-tile is reachable from every other.

Rooms and the kit as delivered. The kit now has 8 floors (wood stone tile darkstone carpet brick slab stage), 7 walls (wood stone tile brick plaster velvet slab), 12 wall pieces (window door banner sconce archdoor clock pipes curtain chalkboard stainedglass vent notice) and 24 props (sawbench planks toolrack bed stool crate bucket shelf rocks generator bedside_table iv_stand screen gurney wheelchair lamp plant reception_desk waiting_bench coat_stand altar pew candle_stand lectern). Every room type has a recipe that works today, so no room stays painted: entrance, corridor, ward, isolation, isolation II, chapel, dispensary, pharmacy, workshop, sawmill, quarry, counting, generator, boiler, laundry, linen, morgue, kitchen, library and theatre. Each one owns its floor and wall pair or its prop mix (a test fails if two rooms look alike): tile floors for the clinic rooms, darkstone for the cellars, slab for the morgue, stage and velvet for the theatre, a carpet for the study rooms. Composition rules (tested): tall wide props (shelf, toolrack, bookcase, locker_wall, linen_shelf, pickaxe_rack, hanging_pots) stay in the back half of the room (u + v <= 3) and never stand in front of a window; no window in the morgue, the cells, the boiler, the chapel (stained glass instead), the theatre, the quarry, the generator or the entrance; at most 2 of the 4 centre tiles are occupied; the door of a room is the plain `door`, or the recipe's `door` (the entrance and the theatre use `archdoor`). Scale: the `sw` table in tools/graftwork_kit_build.py sets each prop's on-screen width; a test checks every prop fits its footprint, a 2 x 1 prop is about a bed wide (28 to 34 units) and the slim tall ones (lamp, iv_stand, coat_stand) are at least 24 units tall.

Planned props (batch 4). Each room lists a PLANNED variant first, gated by `need` (the signature props of that room), then the variant built from today's art, which needs nothing. When the art lands: add the ids to the manifest, remove them from `PLANNED` (the test says when), check the footprint matches (the manifest wins; a larger one just drops the prop that no longer fits), done; the room upgrades by itself. Footprints the planned variants were laid out for (cols x rows):
- boiler: boiler_tank 2x1, coal_pile 2x1, valve_wheel 1x1; generator: cable_coil 1x1, fuse_box 1x1
- counting: counting_desk 2x1, coin_chest 1x1, abacus 1x1; pharmacy: pharmacy_counter 2x1, pill_jars 1x1
- isolation: padded_cot 2x1, restraint_chair 1x1; kitchen: stove 2x1, prep_table 2x1, cauldron 1x1, hanging_pots 1x1
- laundry: wash_tub 1x1, mangle 2x1, drying_rack 2x1; library: bookcase 2x1, reading_desk 2x1, globe 1x1, library_ladder 1x1
- linen: linen_shelf 1x1, linen_cart 1x1; morgue: slab_table 2x1, locker_wall 2x1, sheet_body 2x1
- theatre: operating_table 2x1, footlights 2x1, instrument_tray 1x1, throne 1x1 (until the table exists the theatre uses a gurney, lamps and an IV stand)
- workshop: workbench 2x1, anvil 1x1, tool_chest 1x1; quarry: pickaxe_rack 1x1, ore_cart 2x1, work_lamp 1x1
`PLANNED` in data/ward_kit.js lists them (its floors, walls and pieces are empty: all delivered); a test fails if a recipe names an id that is neither in the manifest nor planned. The lab page (lab/rooms.html) builds its rooms from the same recipes: the Room types scene shows every room alone or with its neighbours, the Hospital scene is a varied floor of fourteen, and Build a room starts from any recipe and offers every prop, wall piece, floor and wall theme of the manifest.

Static layer. The floor is a diamond filled with a seamless texture through an affine pattern (mip chains so it never aliases when the camera zooms out), the two back walls are slabs with the wall texture, a light gradient and a coping strip, wall pieces are sheared onto the wall plane, open front edges get a plinth slab, props get soft shadows. All of it is cached per room to an offscreen canvas, keyed by recipe, wall heights, doors, slabs, the unpowered tint and a zoom bucket (0.5 to 4); a steady camera repaints nothing. The unpowered look is a multiply tint baked into the layer, a darkened copy of each prop, no lamp glow and a snuffed lantern; what sleeps inside is not shown.

Shared walls and doors. The wall between two connected rooms belongs to the room in FRONT: the L wall of (x, y) borders (x - 1, y), the R wall borders (x, y - 1), so each shared edge is drawn once. A door opens in it exactly where engine/ward.js `neighbors` connects the two rooms (`wallPlan` in data/ward_kit.js is the single place that turns connections into doors; the engine stays the source of truth). Wall pieces that would sit in a doorway are skipped.

Wall modes. Full (everything tall), Low (15 px), Cutaway (walls shared with a room behind are low, outer walls tall). The default follows the density of the floor (the far Theatre does not count): Full for one room, Cutaway for 2 to 5, Low from 6. The W key and the W button beside + - C cycle auto, full, low, cutaway. Heights ease (snap with reduced motion). The painted lowering rules still apply: front neighbours of a focus room (hover, selected, the hero's) or of a room with monsters are cut down to Low in every mode but Low.

Depth and walking. Props and the actors that stand in a modular room are one pass sorted by the world y of their feet, drawn right after the room's static layer, so a monster or the hero passes behind and in front of a bench; painted rooms keep the old actor pass after all rooms. Monsters wander only the FREE sub-tiles: a path on the 4 x 4 grid (4-neighbour, so a step never cuts a prop corner), eased in and out, turning through a swing. The hero rests on the free tile nearest the middle and walks stand to stand on the global sub-tile grid (`pathOnGrid`: between rooms only through rows or columns 1 to 2, i.e. the doors), around the furniture. Picking: a tall modular wall takes the click, a low one does not; floors always resolve to their own cell. Everything else of section 12 (hover lift and outline, build drop-in, spawn candle, upgrade pips, elite aura, room card, layout ids `ward-room-<id>`, time of day tint and lamp glow from sconces and windows, dust, the thread) is unchanged. Animated prop overlays (generator spark, saw glint, flames) are small and stop with reduced motion.

Grounding (all actors, painted rooms too). Sprites are anchored by their MEASURED contact point (the lowest opaque row and the centre of the foot band, read once from the alpha; the manifest anchor is the fallback), with a soft flattened contact shadow (alpha about .5, 2:1 ellipse sized from the foot width) that stays on the floor and only shrinks and fades a little with hop height. At rest nothing moves vertically: a slow breathing scale (+-2%) and a small weight shift about the feet. A walk is a step cycle tied to DISTANCE (one stride = 0.42 x the figure height, the two walk frames swap at each plant, `rec.stride` is the phase), with a tiny hop between plants, a squash on the plant, a lean into the heading, dust on the plant, and a horizontal flip by travel direction (the art faces down-right) that swings through a narrow body on a turn. Figures without walk frames (`walk1x` missing, the hero for now) use the same procedural walk; when walk frames land they are picked up at once. Reduced motion: none of it, the figure just stands.

Tests: tests/graftwork_ui_ward_kit.test.mjs (recipes, degradation, loader, shared walls and doors, depth, free tiles, wall modes, fallback, picking, power, cache, perf, reduced motion, grounding) with the manifest copy tests/graftwork_kit_fixture.json as the "current kit".

Painted fallback, low walls. Each painted room also has a lowered-wall painting `rm_<id>_low` (19 of 20 shipped; `rm_boiler_low` was rejected for magenta spill in its steam, so the boiler keeps the tall painting and the old crop), built by `python3 tools/graftwork_art_build.py --low <raw dir>` (rm_<id>_low.png, 2048 px; each file's floor diamond is MEASURED, the manifest entry carries its own floorCx/floorCy/floorW/floorH and `low: true`; the renderer scales each sprite by its own diamond; rejects are skipped and reported). Choice per room in `ward_iso.js`: kit recipe first; else the LOW painting in wall mode Low, in Cutaway for a room with a room behind it ((x-1,y), (x,y-1), (x-1,y-1)), for a front neighbour of a focus room or a room with monsters, and on a dense floor unless the mode is Full; the TALL painting for a lone room, the hero room's back side, Full mode and any room without a low painting (the old crop and fade rules apply only then). The two cross-fade when the choice changes; dark tint, hover lift, picking and the final actor pass are unchanged. Tall vs low by eye: low is clearly better in every dense layout (no cropped walls, every room legible, no 0.55 fade over the focus room).

Walk pacing. `PACE` in ui/ward.js: normal 0.62 s per room with a 0.35 s beat where the walk stops at a room that fires (the engine already decided; the animation only holds), Fast walk (`meta.settings.fastWalk`, button F or key F beside + - C W, default off) 0.38 s and 0.15 s, reduced motion 0.12 s and no beat; a wait never pauses. Speed is constant between rooms (ease only out of the first and into the last step). A stride is 0.5 x the figure height (about 4 plants a second at the normal pace). The hero on the move is drawn in the final actor pass so a wall of a room in front never hides him; at rest he sorts with the props.
