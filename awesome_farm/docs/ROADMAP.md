# Roadmap (35 improvements, worked in this order)

Rules for every item: one PR each (draft, `npm run typecheck`, `npm test`, `npm run build:pages`, look at it in the headless browser
when it is visual: `/tmp` scripts drive `npm run dev` with playwright and `/opt/pw-browsers/chromium-1194`), squash-merge, tick the box
here in the same PR, bump PROTOCOL on wire changes. Never rename storage keys. Keep each item small enough for one session turn;
split big ones into slices (rules, art, polish).

## Phase 1: quick wins that touch every session (small)
- [x] S16 Chest "in use" indicator (who has it open)
- [x] S17 Hotbar auto-refill of a pinned stack (food, potions and seeds)
- [x] S18 Recent recipes tab in Crafting
- [x] S21 Item comparison tooltips with green/red deltas (always on when a different piece is worn)
- [x] S28 Quick-sell undo window (10 s, Undo sale button at the market)
- [x] S30 Give item to a nearby friend (Give mode in the backpack)
- [x] S27 Auto-sort backpack (already true: the list is always sorted by your saved order, which is remembered per window)
- [x] S29 Trade history (last five trades, shown in the trade window)
- [x] S25 Mailbox flag visible from afar (already built: the flag goes up on every mailbox when post waits, in 2D and 3D)
- [x] S26 Chest labels in the factory view (already built: a labelled chest wears its icon in the world, which the Factory view keeps lit; the minimap stays free of item icons by design)

## Phase 2: rhythm and economy (medium + small)
- [x] M6 Welcome-back digest (toasts on return after 5 min or a new day: days passed, what needs you, who is here)
- [x] M7 Living market prices + Hot Item of the day (1% a unit down to 60%, fades 30% a morning, hot item +50%)
- [x] S33 Weather-aware hints (rain already existed; added Blood Moon and winter heads-ups)
- [x] S22 Rainbow's end (pot of gold + crate on an owned island when the day's rain clears, announced with a ping)
- [x] S32 Seasonal special nights (summer fireflies, autumn Harvest Moon, winter Aurora crystals)
- [x] S24 Harvest chain chimes (your own pickups and harvests climb a pentatonic ladder)
- [x] S23 Roof rain (rain streaks fade and the rain sound muffles under a roof)
- [x] S19 Craft-to-chest toggle (a To chest switch in Crafting)
- [x] S20 Hotbar drag reorder (drag a slot onto another swaps; pinning an item that sits elsewhere already swaps)

## Phase 3: new systems (medium)
- [x] M8 Fish pond (Fish Pond building: a fish and bait in, two fish out; art, 3D model, wiki, how-to)
- [x] M9 Orchard and apiary (oaks drop apples, Beehive turns berries into honey, Honey Apple Tart at the Kitchen)
- [x] M14 Elite affixes (swift, armored, volatile, mending; tinted, named on the kill)
- [x] M10 Creature signature moves (every 4th companion strike, one move per element)
- [x] M11 Day and night shifts for workers (Day/Night button on the creature card: day, night or round the clock; PROTOCOL 43)
- [x] M12 Cosy room score (a furnished walled-in room gives the Cosy buff; score = furniture + variety)
- [ ] M12b Dye vat (split off M12)
- [x] M13 Museum of odd things (Museum Case: E donates one of each trophy, fish and gem; prizes at 5, 10, 20, 30 and all)
- [x] S31 Pet nicknames on plates (a companion wears its name over its head, so photo mode shows who is who)

## Phase 4: polish and health (small + medium)
- [x] M15 Accessibility pass 1 (the Shake switch now also turns off lightning flashes, slow motion and buzzing, and says so)
- [x] M15b Shape marks (a Settings switch: notches on monster health bars and chest gauges so colour is never the only clue; larger text shipped with S35; phone leftovers still to do)
- [x] S35 Settings polish (Larger text switch, settings rows tidied; shown in the headless browser)
- [x] S34 Playbot short run as a health check (already built: tests/playbot.test.ts plays the first 3 days inside npm test)

## Phase 5: the big five (each in slices)
- [x] B5 Shared farm tools: coffer, request board, blueprint book
  - [x] B5a Farm Coffer (anyone pays in, take back only your own, tops up land purchases; PROTOCOL 44)
  - [x] B5b Request board (post "plank 50", reward held up front, others fill it for the coins; PROTOCOL 45)
  - [x] B5c Shared blueprint book (Blueprint Shelf: share your newest blueprint, others copy it into their book; PROTOCOL 46)
- [ ] B4 Factory v2: modules, chest gauge, harvester arm + sprinkler
  - [x] B4a Chest fill gauge (a little bar at the foot of every chest with something in it: green, gold, red)
  - [x] B4b Speed Module (assembler recipe; slot one into a machine for +25% speed with the Module button; PROTOCOL 47)
  - [x] B4e Efficiency Module (assembler recipe; fuel lasts 25% longer and 10% of batches come out doubled; the Module button slots a Speed Module first, else an Efficiency one; no protocol change)
  - [x] B4c Harvester Arm (harvests ripe beds within 2 tiles into a chest within 3, no power, no protocol change)
  - [x] B4d Sprinkler (beds within 3 tiles grow 30% faster, no power, no protocol change)
- [ ] B1 Cottages: the folk move in
  - [x] B1a Cottage building: a villager (name + trade) moves in at dawn, one trade gift a day with E, bigger gifts once a friend; no protocol change
  - [ ] B1b Villagers walk about (a folk entity with art), name plates
  - [ ] B1c Friendship hearts and requests
- [ ] B2 Festival eve + the Lantern Chain
  - [x] B2a Festival eve (last day of each season): E on lanterns, longest chain of 4+ pays everyone at dawn; no protocol change
  - [x] B2b Festival look: lanterns lit for the festival burn bigger and golder at night, in 2D and 3D (bunting and a festival song still to do)
  - [ ] B2c Festival stalls and games
- [ ] B3 The Long Dusk (new game plus)
  - [x] B3a Dusk Beacon (sleeps until every boss has fallen; lit: wild monsters 8 levels tougher and 1.5x loot; all server-side, no protocol change)
  - [x] B3b Dusk Crown (a boss that falls in the Long Dusk also drops a Dusk Crown trophy to everyone who fought; it joins the museum set; dusk-only bosses still to do)
  - [x] B3c Dusk indicator (the season label on the HUD reads "Spring · Long Dusk" in violet while it is on; the tick now carries it; PROTOCOL 48)
