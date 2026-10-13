# Hearthvale: gameplay systems (simulation contract)

Everything here lives in `shared/data.js` (static numbers), `shared/sim.js` (rules), `shared/bots.js` (neighbour villages).
The sim is pure JS and deterministic. This file is the contract for the UI and art agents: command payloads, error
strings, snapshot paths, events, balance, art ids. Tests: `npm run test:hearthvale`.

Conventions: `cmd({op, ...})` goes through `command(W, pid, c)` and returns `{ok:true, ...}` or `{ok:false, err}`. Over the
wire a failed command arrives as `{t:'nack', err, op}`. Times in the snapshot are WORLD seconds (`snap.t`) unless a name ends in `Ms`.
All JSON keys named below are exact. New tuple elements were only appended.

## 0. Host clock (needed by the daily reward only)

`setNow(W, ms)` is exported from `sim.js`. `Host.step()` already calls it each tick (server and Durable Object). The SOLO LINK
(`js/net.js`) must call `S.setNow(W, Date.now())` before every `S.tick` (and once after loading a save), or the daily reward
stays unavailable (`you.daily.clock === false`). The sim never reads `Date`. `deserialize` clears `W.now`.

## 1. New goods

`GOODS` order is append-only. New ids (sell price in coins, emoji): egg 3 🥚, milk 4 🥛, wool 5 🧶, apple 3 🍎, fish 4 🐟,
cheese 9 🧀, jam 10 🍯, cloth 12 🧵, pie 16 🥧. `CRAFTED` lists goods that count for the Great Tree sell bonus.
Storage cap logic is unchanged (`you.cap` per good). `you.res` always has every good (old saves are migrated with 0).

## 2. Buildings (ids and sizes are the ART CONTRACT)

| id | name | w x h | village lvl | tech | notes |
|---|---|---|---|---|---|
| coop | Chicken Coop | 2 x 2 | 3 | husbandry | holds 4/6/8 chickens (building lvl 1/2/3) |
| barn | Barn | 3 x 2 | 5 | husbandry | holds 3/5/7 cows + sheep |
| dairy | Dairy | 2 x 2 | 5 | - | craft cheese (milk 2, 10 s) |
| orchard | Orchard | 3 x 3 | 4 | - | field like farm, apples; stages empty/grow/ripe; grow 45 s |
| dock | Fishing Dock | 3 x 2 | 6 | angling | villager fishes repeatedly |
| pantry | Pantry | 2 x 2 | 6 | preserving | craft jam (apple 3, 9 s), pie (apple 2 + flour 1 + egg 1, 14 s) |
| weavery | Weavery | 2 x 2 | 7 | weaving | craft cloth (wool 2, 10 s) |

Decorations (`decor` = charm points, all cost mostly coins, build time 2-6 s, they follow the normal place/upgrade rules):

| id | name | w x h | lvl | charm | cost |
|---|---|---|---|---|---|
| scarecrow | Scarecrow | 1x1 | 1 | 1 | 15 coins, 2 wood |
| bench | Garden Bench | 2x1 | 2 | 2 | 25 coins |
| birdbath | Bird Bath | 1x1 | 3 | 2 | 30 coins, 2 stone |
| flowercart | Flower Cart | 2x1 | 3 | 3 | 45 coins |
| picnic | Picnic Blanket | 2x2 | 4 | 4 | 50 coins |
| pumpkins | Pumpkin Patch | 2x2 | 4 | 3 | 40 coins |
| swing | Garden Swing | 2x2 | 5 | 4 | 60 coins, 6 wood, 2 planks |
| beeskep | Bee Skep | 1x1 | 5 | 2 | 35 coins, 3 wood |
| hammock | Hammock | 2x1 | 6 | 3 | 70 coins, 4 wood |

Existing ids and rules are untouched (flowers 1, lantern 1, fountain 3, banner 2 charm). `BUILDINGS[id]` fields the UI can use:
`animals` (kinds a pen holds), `capacity` (per building level), `fishing`, `crop`, `grow`, `decor`, `craft`, `tech`.
Place errors (unchanged set): `unknown building`, `bad pos`, `level N needed`, `research <Tech name>`, `limit reached`,
`village is full`, `blocked`, `not enough resources`. During a festival decor costs half (`placeCost(W, def)` is exported; the server charges it).

New techs (Study, scrolls / seconds): husbandry 14/40 (coop, barn), angling 12/34 (dock), preserving 18/46 (pantry), weaving 22/52 (weavery).

## 3. Animals

Animals live in `coop` (chicken) and `barn` (cow, sheep). Data: `ANIMALS` in data.js.

| kind | home | product | seconds per product (one animal) | price coins | price goods |
|---|---|---|---|---|---|
| chicken | coop | egg | 80 | 25 | wheat 12 |
| cow | barn | milk | 110 | 90 | planks 6, wheat 15 |
| sheep | barn | wool | 130 | 70 | planks 4, wheat 12 |

Rules: each animal adds production progress; when a product is ready the building needs feed: 1 wheat from village storage
feeds 2 products (`b.feed`). No wheat: the animal waits with its product ready (building `hungry: true`), production resumes
by itself when wheat appears. The ready stock (all products together) is capped at 8 (`STOCK_CAP`); at 8 animals pause (not hungry).

Commands:
- `{op:'buyAnimal', id:<building id>, kind:'chicken'|'cow'|'sheep', with:'coins'|'goods'}` (`with` optional, default coins).
  Errors: `no such building` (id missing or not a pen), `not built yet`, `unknown animal`, `wrong home`, `no room`, `not enough resources`.
  Result `{ok:true, count}`. Event `{t:'animal', pid, id, kind}`. Demolishing a pen refunds 50% of the animals' coin price.
- Collect: the normal task command `{op:'assign', k:'bld', id:<pen id>, vid?}`. The villager walks over, works 3 s (herding skill),
  moves ALL ready stock into storage honoring the cap (what does not fit stays in the pen, popup "Storage full" if nothing fits) and goes idle.
  With no stock the task ends at once. Tool shown: `basket`.
- Orchard: `{op:'assign', k:'bld', id:<orchard id>}` like a farm: tend (4 s) then it grows 45 s (twice as fast in rain), ripe, harvest 4 s gives 5 + 2 per building lvl (+1 with Sharp Tools) apples. Tool `basket`.
- Dock: `{op:'assign', k:'bld', id:<dock id>}`: one fish per 6 s of work, 1 to 3 fish each, no depletion, repeats until recalled or storage is full. Tool `cane`.

Snapshot:
- public building tuple `b[5]` (stage string): `'ready'` when a pen has stock >= 1 (show the happy sign), otherwise `'busy'`/`''` as before. Orchard uses `empty|grow|ripe` and `b[6]` crop 0..1 like farms.
- private `you.buildings[i]` of a pen gets: `an:{chicken:n}` or `{cow:n,sheep:n}`, `stock:{egg:n}`, `hungry:bool`, `room:<capacity now>`, `feed:<products pre-paid>`.

## 4. Villager skills

Skills (index = position in `SKILLS`): woodcutting 0, mining 1, farming 2, building 3, cooking 4, studying 5, fishing 6, herding 7.
Levels 1..5 at work-seconds `SKILL_XP = [0,200,700,1800,4000]` (1 xp per second of real work with that skill). Each level above 1 adds
8% work speed (`SKILL_BONUS`): level 5 = +32%. Which skill is used: trees and wood field = woodcutting; stone, clay = mining; wheat field, farm, orchard = farming;
constructing and upgrading, sawmill/kiln/weavery crafting = building; food recipes (soup, flour, bread, cheese, jam, pie) = cooking;
Study (scrolls, research) = studying; dock = fishing; collecting = herding. Skills speed up work, building, crafting and research.

- `{op:'renameVillager', vid:<villager id>, name:<string>}` trims, strips control chars and `<>`, max 12 chars. Errors: `no such villager`, `bad name`. Result `{ok:true, name}`.
- Snapshot private `you.villagers[i]`: `skills:[8 levels]`, `skx:[8 work-second totals]`, `skill:<0 none, else skill index + 1 being used now>`.
- Snapshot public villager tuple `players[].v[i]` = `[id, x, z, state, hat, face, name, tool, skill]`; `skill` (appended, index 8) as above. Tool strings now also include `basket` (collect, orchard) and `cane` (dock); both exist in `art/characters.js`.
- Event `{t:'skill', pid, vid, skill:'woodcutting', level}` on a level up (plus a popup).

## 5. The Great Project (valley landmark)

State `W.valley.project = {stage, got:{res:n}, contrib:{pid:points}, total:{pid:points}, lb:[[pid,points]...]}`; `stage` = number of finished
stages 0..5 (0 nothing built, 5 complete). Stage k (0 based) is being built; stage names (the 3D model for stage N appears when `stage >= N`):

| stage done | name | needs | perk (valley wide, permanent) | pool reward |
|---|---|---|---|---|
| 1 | Fountain Plinth | wood 400, stone 240, clay 160, planks 60 | gathering yields +10% (nodes, valley fields, farm, orchard, dock) | 300 coins, 5 scrolls, 200 xp |
| 2 | Clock Tower | planks 240, bricks 160, stone 300, flour 60 | +1 housing in every village | 800, 10, 500 |
| 3 | Windmill of Friends | planks 400, bricks 300, bread 100, cheese 40, wool 80 | soup feeds 25% longer | 1800, 20, 1000 |
| 4 | Lighthouse | bricks 600, planks 600, stone 600, fish 160, cloth 60, soup 120 | +1 Valley order slot | 3500, 30, 2000 |
| 5 | Great Tree of Hearthvale | pie 80, jam 100, cheese 100, cloth 120, apple 300, bread 200, scrolls 120, planks 600 | crafted goods sell for +10% (Market) | 7000, 50, 4000 |

(`PROJECT_STAGES` in data.js has name, need, reward, perk text.) A contribution is worth `n x sell price` points.
- `{op:'projectGive', res:<good>, n:<int>}`: gives up to what is still needed (capped by what you hold). Errors: `project complete`, `not needed`, `nothing to give`. Result `{ok:true, n, pts}`.
- On completion every village (also offline ones) gets the pool reward: 20% split evenly + 80% by share of THAT stage's points; popup per player; counters reset for the next stage; lifetime `total` and the leaderboard stay. Event `{t:'project', stage:<new stage number>}` (for celebrations).
- Snapshot `valley.project = {stage, max:5, name, need:{res:n}, got:{res:n}, top:[{id,name,pts}] (lifetime, top 10)}` where `name` is the stage being built ("Complete" at 5). Private `you.project = {pts (this stage), total}`.
- Perks are mirrored on each player as `P.pst` (= stage) so `housingOf`, sell and gather code need no world handle.

## 6. Daily reward and streak

`{op:'daily'}`. Errors: `no clock`, `come back later`. Claim again after 20 h (`DAILY_GAP_MS`). Claim within 44 h of the last one to continue the streak, later it restarts at 1. Streak caps at 7 (day 7 repeats).
Result `{ok:true, streak, reward:{coins,...}, cosmetic:<id|null>}`. Rewards (`DAILY_REWARDS`): d1 30c; d2 40c + 10 wheat; d3 60c + 6 planks; d4 80c + 2 scrolls; d5 100c + 4 bread; d6 130c + 3 scrolls + 2 cheese; d7 200c + 5 scrolls + a cosmetic
(next unowned of `COSMETICS = straw_hat, ribbon, scarf, leaf_crown, golden_boots`, 300 coins when all are owned). Goods honor storage caps. Event `{t:'daily', pid, streak}`.
Snapshot `you.daily = {available, streak (current valid streak, 0 if lapsed or never), nextDay (1..7), nextInMs (0 when available), reward:{...} (what the next claim gives), clock:bool}`; `you.cosmetics:[ids]`.
`nextInMs` is wall clock milliseconds as of the snapshot, so the UI should count down locally. Cosmetics are only owned, not equippable yet (UI/art can add that later).

## 7. Achievements and titles

33 achievements in `ACHIEVEMENTS` (id, cat build/craft/gather/gift/project/animals/charm/level/valley, name, desc, stat, n, reward, optional `title`).
They are checked once per second, unlock once, pay their reward once (honoring caps), keep the unlock time in `P.ach[id]`.
- Snapshot `you.ach = {id: [progress (capped at n), unlocked 0|1]}`; `you.title` = achievement id of the title in use ('' none).
- `{op:'setTitle', id:<achievement id>}` or `id:''` to clear. Errors: `no such title` (unknown or no title), `not unlocked`.
- Public player entry `players[i].title` (the title TEXT, '' if none) and `players[i].charm` (appended).
- Event `{t:'ach', pid, id}`.
- Stats used (all in `you.stats`): buildings, decor, villagers, skill5, charm, level, orders (valley orders helped finish), visitors, trades, streak, project, animals, collected, per-good gathered counts (`wood`, `egg`, `fish`, ...), `c_<good>` crafted, `b_<type>` built, gifted, gave, sold.

## 8. Charm and visitors

Charm (`you.charm`, public `players[].charm`) = per built building: decor value + (level-1) x ceil(decor/2); non-decor buildings add (level-1); the Hall adds 2 per upgrade. Recomputed every second.
- XP bonus: +1% per 10 charm, capped at +25% (`you.xpBonus` = that plus 0.25 during a festival, as a fraction). Applies to every xp gain.
- Visitors (not for neighbour bots): needs charm >= 10. One arrives every `max(150, 330 - charm)` seconds after the last one left or was served, waits 150 s (`VISITOR_STAY`).
  Wants `n` of one good the village has made before (wood/clay/stone/wheat always), at 1.5x sell price (`price` is the total). Total value is roughly 20-45 coins before the premium.
- Snapshot `you.visitor = null | {who:<index into VISITOR_NAMES>, want:<good>, n, price:<coins>, expiresIn:<s>}`.
- `{op:'visitorServe'}`: errors `no visitor`, `need <n> <good>`. Pays price, 30% chance of a tip (5 + 20% of price) in `tip`; result `{ok:true, paid, tip}`. Gives xp. Events `{t:'visitor', pid, state:'arrive'|'leave'|'served'}`.

## 9. World events (derived from world time W.t, valley wide)

Schedule constants in data.js: `FESTIVAL = {first:420, every:600, len:90, ...}`, `MERCHANT = {first:200, every:480, len:180}`. The k-th window starts at `first + k x every`.
Snapshot: `valley.event = null | {kind:'festival', until}`, `valley.merchant = null | {until, stock, offers:[...]}`, `valley.rain` (0|1, current weather), `valley.next = {festival, merchant}` (world time of the next start).
- Festival: +25% xp for everyone (`FESTIVAL.xp`), decorations cost 50% (`decorOff`), 2 extra Valley orders flagged `fest:true` worth 1.5x (they do not take a regular slot and vanish 15 s after they are done; unfinished ones stay). "Lit streets" is for the client: show lights while `valley.event`. Events `{t:'festival', state:'start', until}` and `{state:'end'}`.
- Merchant: 3 offers, stock per offer = clamp(2 + ceil(villages/2), 3, 10) SHARED by the whole valley (first come first served). Offer shape `{give:{res,n}, get:{res,n}, stock, max}`; `get.res` may be `coins`, `scrolls` or a good. Offer 0: common goods for coins (1.5x value). Offer 1: goods for scrolls (value / 7). Offer 2: common goods for 1-2 rare goods (cheese, jam, cloth, pie, wool, apple) at 1.2x value.
  `{op:'merchantTrade', i:0|1|2}`. Errors: `no merchant`, `no such offer` (i must be an integer in range), `sold out`, `need <n> <good>`, `storage full`. Events `{t:'merchant', state:'arrive'|'leave', until}` and `{t:'trade', pid, i}`.
- Rain: `weatherAt(t)` exported from sim.js, identical to the formula in `js/scene.js` (`k=floor(t/240); h=sin(k*12.9898+4.1414)*43758.5453; frac(h) < 0.26`). Rain doubles growth of farms and orchards. A test pins both formulas together.

## 10. Valley orders (extended)

Orders may now ask for egg/apple (valley lvl 4), milk/wool/fish (5), cheese/jam (6), cloth/pie (7). An untouched order older than 30 minutes is swapped for a fresh one (`o.at` = world time created). Finishing an order bumps `stats.orders` for each contributor. Order slots: `ordersFor(level, bonus)`, +1 with the Lighthouse.

## 11. Quests (chapter 2)

`QUESTS` entries with `ch: 2` come after chapter 1 (ids unchanged): q_coop, q_chick, q_egg, q_orch, q_apple, q_decor, q_barn, q_milk, q_dairy, q_cheese, q_dock, q_fish, q_pantry, q_jam, q_visit, q_weav, q_cloth, q_trade, q_charm, q_proj, q_pie, q_lvl10, q_charm2, q_lvl15. The tracker (first undone quest) therefore has content for hours. Quests are checked once per second.

## 12. Neighbour bots

`botStep` now: follows a wish list including all new buildings (decor with no spacing so the plot is not wasted), researches techs in order and keeps a villager on research and crafting jobs,
queues every recipe (including cheese, jam, pie, cloth), buys animals, collects, fishes, sells farm goods at a Market, trades with the merchant (about 30% of visits) and gives a small share of spare goods to the Great Project (less likely at higher stages, so humans matter).
Within one simulated hour the bots own coop, barn, dairy, orchard, dock and join the project (tested). Bots never get visitors or daily rewards.

## 13. Saves and migration

`deserialize` fills: all new goods with 0, `valley.project/event/merchant`, per-player `daily/ach/title/cosmetics/visitor/charm/pst`, villager `skx`, pens' `an/ap/stock/feed`, order `at`, and clears `W.now`. Old saves load unchanged otherwise. No localStorage key or folder was renamed.

## 14. Events list (all pushed on `snap.events`, flushed after each broadcast)

`levelup {pid, level}`, `built {pid, id}`, `order {id}`, `valleylevel {level}`, `quest {pid}`, `gift {from,to,res,n}`, `emote` (old), and new:
`project {stage}`, `ach {pid,id}`, `daily {pid,streak}`, `visitor {pid,state}`, `festival {state,until?}`, `merchant {state,until?}`, `trade {pid,i}`, `animal {pid,id,kind}`, `skill {pid,vid,skill,level}`.
Events are visible to every client; filter by `pid === myId` for personal ones. The event list is capped at 300 between flushes.

## 15. Balance notes (aim: about 10 hours)

- Level curve: `LEVEL_XP` extended to level 20 (7000, 9500, 13000, 18000, 25000 for levels 16 to 20). Measured with five perfect bots, level 12 comes after ~40 min and 15-16 after ~100 min, so a human should reach 20 in roughly 8 to 10 hours. Order rewards are the main xp source and are split between contributors, so more players means slower individual levelling.
- Animal economy (per animal per hour, minus feed): chicken 45 eggs = 135 coins for 22 wheat (payback of the 25 coin price in ~10 min), cow 33 milk = 131 coins, sheep 28 wool = 138 coins. Cheese turns 2 milk (8 coins) into 9 coins, so dairy is mostly for orders, quests and the project, not profit. Pie (16) is the best sink for apples/flour/eggs.
- Stock cap 8 and the 3 s collect task keep animals an attention loop; an unattended pen stalls at 8 without wasting feed.
- Skill: 30 minutes of continuous work for level 4 of one skill (1800 s), ~67 minutes for level 5 (4000 s); a villager rarely masters more than two skills per session.
- Project: stage totals are 860 / 760 / 920 / 2,140 / 1,620 goods worth about 1.2k / 2.1k / 4k / 7k / 10k coins of sell value. Five bots alone finish stage 1 in about an hour and stage 3 around the 2 hour mark, then slow down sharply (bot chance 0.2 / (1 + stage)). Sixteen human villages should finish the whole monument in a few evenings.
- Charm: 25 charm after ~6 cheap decor items, 100 charm is ~1,200 coins of decor plus upgrades, 250 (max xp bonus) is a late-game goal.
- Daily week is worth ~800 coins plus ~13 scrolls: a boost, not a replacement for play.
- Festival: 90 s every 10 min is 15% of the time at +25% xp. Merchant: 3 min every 8 min, stock shared so a busy valley sells out within a minute.

## 16. UI checklist (what the UI agent needs to surface)

Pens (animal counts, stock, hungry badge, buy buttons with coins/goods, collect button = assign), orchard and dock via the normal building sheet, skills in the villager sheet + rename, Great Project panel (needs/got bars, give buttons, leaderboard, perk list, celebration on `project` event), daily claim button with countdown, achievements panel with title picker, visitor card with serve button, festival banner/lights, merchant panel with 3 offers and shared stock, charm number on the village label, titles next to names, chapter 2 quest hints (`HINTS` in main.js has no entries for the new quest ids yet).
