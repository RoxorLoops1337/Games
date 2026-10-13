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
- [ ] S20 Hotbar drag reorder / swap with a backpack row

## Phase 3: new systems (medium)
- [ ] M8 Fish pond
- [ ] M9 Orchard and apiary
- [ ] M14 Elite affixes
- [ ] M10 Creature signature moves
- [ ] M11 Day and night shifts for workers
- [ ] M12 Cosy room score + dye vat
- [ ] M13 Museum of odd things
- [ ] S31 Pet nicknames in chat/plates, pet in photo mode

## Phase 4: polish and health (small + medium)
- [ ] M15 Accessibility and phone pack
- [ ] S35 Settings polish
- [ ] S34 Playbot short run as a health check

## Phase 5: the big five (each in slices)
- [ ] B5 Shared farm tools: coffer, request board, blueprint book
- [ ] B4 Factory v2: modules, chest gauge, harvester arm + sprinkler
- [ ] B1 Cottages: the folk move in
- [ ] B2 Festival eve + the Lantern Chain
- [ ] B3 The Long Dusk (new game plus)
