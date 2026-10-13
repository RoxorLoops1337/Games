# Roadmap (35 improvements, worked in this order)

Rules for every item: one PR each (draft, `npm run typecheck`, `npm test`, `npm run build:pages`, look at it in the headless browser
when it is visual: `/tmp` scripts drive `npm run dev` with playwright and `/opt/pw-browsers/chromium-1194`), squash-merge, tick the box
here in the same PR, bump PROTOCOL on wire changes. Never rename storage keys. Keep each item small enough for one session turn;
split big ones into slices (rules, art, polish).

## Phase 1: quick wins that touch every session (small)
- [ ] S16 Chest "in use" indicator (who has it open)
- [ ] S17 Hotbar auto-refill of a pinned stack
- [ ] S18 Recent recipes row in Crafting
- [ ] S21 Item comparison tooltips (Shift) with green/red deltas
- [ ] S28 Quick-sell undo window
- [ ] S30 Give item to a nearby friend (no full trade window)
- [ ] S27 Auto-sort backpack setting
- [ ] S29 Trade history (last few trades)
- [ ] S25 Mailbox flag visible from afar
- [ ] S26 Chest labels in the factory view / minimap

## Phase 2: rhythm and economy (medium + small)
- [ ] M6 Welcome-back digest
- [ ] M7 Living market prices + Hot Item of the day
- [ ] S33 Weather-aware hints
- [ ] S22 Rainbow's end
- [ ] S32 Seasonal special nights
- [ ] S24 Harvest chain chimes
- [ ] S23 Roof rain
- [ ] S19 Craft-to-chest toggle
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
