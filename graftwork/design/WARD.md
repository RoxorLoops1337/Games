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

Projection and fit. The 9 x 6 grid is projected to a 2:1 diamond grid: a cell is TW 92 x TH 48 logical px (the manifest tile ratio is 2 : 1.053), centred in the old sheet rectangle (284,64 712x484). Logical pixels never change with the stage scale, so desktop (1280x720), the phone stage and the smaller phone scales all show the same picture. `cellCenter(x, y)` is the middle of a floor and still the way tests and scripts click a cell.

Picking. `ISO.pick(w, mx, my)`: the cell whose diamond holds the point (exact), else the wall volume of a room (a diamond lifted by 34 px; this only matters on the back row and the left edge, because walls over a rear floor resolve to that floor, which keeps every cell reachable). Hover lifts a room 6 px and draws it on top of its neighbours (as do the selected room and the hero's room). Each room registers `ward-room-<id>` (layer `world`) for tooltips and the layout sweep. The keyboard focus ring is a diamond on the cell.

Draw order. Ground (cached plinth and flagstones; plots for buildable cells in the morning; rubble heaps; the glowing placement diamonds while a card is dragged), rooms back to front by x + y, the ghost of the room being dragged, then every actor sorted by screen y (so nobody hides behind a wall), then the time-of-day light, then the thread and the trigger seals. The thread is a glowing stitched line on the floors with the step number on each cell; the trigger seals float above their rooms.

Rooms. A room sprite is aligned by `floorCx / floorCy` and scaled so `floorW` is 76 percent of the tile. A room that was just built drops in with a squash and a dust puff. A dark (unpowered) room is drawn from a cold, darkened copy of the sprite (made once in an offscreen canvas, never a second image) with a snuffed lantern and a smoke thread, and what sleeps inside is not shown. The spawn timer is a candle on the front left edge: the wax grows toward the next spawn, a red flame and `!` when the room is full, the days left beside it. Upgrades are gilt pips on the front right edge.

Actors. Monsters of a room stand in it, one figure each up to 5 (the cap), with a small wander, a bob and a facing; elites are larger, carry an L1 or L2 tag and use the `<id>_l2` figure when the manifest has one (a pulsing aura otherwise). Events, shops, forges and linen rooms show a floating token. The hero stands on its room (a gold ring on the floor) and walks cell to cell along the route with the two step frames, a bob, a squash, a shadow, and turns toward where it goes. Reduced motion: no wander, bob, squash, flicker, motes or frame swap.

Time of day. A multiply tint over the map (cool morning, plain midday, amber evening, deep blue night) blends across a phase change; lit rooms add a warm lamp pool in the evening and at night (the lit windows), the night adds moonlight from the top right, and dust motes or fireflies drift (not with reduced motion).

Performance. The static ground is cached to an offscreen canvas; the dark copies, the enemy and hero fallbacks and the glow sprite are made once. Measured in Chromium with software rendering: the map draw is about 1.5 ms for 21 rooms and 100 monsters; the rest of the frame is the existing HUD and post. No per-frame allocation except the sort of the actor list.

### The art pipeline

- Files: `graftwork/assets/ward/` (`manifest.json`, `rooms/`, `actors/`, `icons/`, `cards/`), WebP with alpha, `@1x` on phones (stage scale under 0.8) and `@2x` on desktop. Generated by the art pipeline (tools/graftwork_art_build.py); never edited by hand. The manifest is the contract: `tile`, `rooms{id: file1x, file2x, w, h, floorCx, floorCy, floorW, floorH}`, `actors{id: file1x, file2x, w, h, anchorX, anchorY, kind, scale, walk1x, walk2x}`, `icons{wood, stone, gold, power, morning, midday, evening, night}`, `cards{art id}` and `cardsById{b_x: {room} | {card}}`.
- ui/assets.js loads the manifest once when the Ward opens (a lazy cache, `Image` elements, nothing in node or when `fetch` is missing), preloads rooms and actors, and answers `room / actor / icon / card / cardArt` with a drawable or null while loading. A small "Stitching rooms" bar shows while images are on their way. Any failed file means "draw the fallback"; nothing throws.
- Actor ids: the hero id (`marrow`), the enemy id (`bedpan_slime`; `<id>_l2` for a Level 2 elite) and `npc_*`. An enemy the set does not paint yet borrows a figure of its kind (hash of its id) so a room is never empty; with no manifest at all, `drawEnemy` and `drawHero` are rendered once into offscreen canvases.
- Icons and cards: ui/ward_kit.js draws the resource icons, the power bulb (the `power` icon, dimmed when off), the day-phase medallions and the building-card illustrations from the manifest, each with its engraved procedural fallback.
- Tests: tests/graftwork_ui_ward.test.mjs (iso picking, click by iso position, depth order, actors, hero walk, loader, sprite alignment, fallback, reduced motion, light, call budget) plus the layout sweeps; tests/graftwork_art_assets.test.mjs guards the files.

