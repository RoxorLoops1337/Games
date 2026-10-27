# B17 Story and Lore: outline

File: `src/data/story.js` exposes `SB.data.story` (one object, plus helpers `byId`, `banterFor`, `pickDefeat`, `pickTip`, `codexFor`, `interstitial`).

## Premise
Number Nine, Larkspur Lane. A clowder holds three floors against nine nights of cold-driven Pests. The Sunbeam crosses the attic each morning and warms the house. The cats treat it with religious seriousness and never ask how it gets there.

## Why the Pests come
Everything cold goes to the warm place. The Pests are not evil, they are freezing and tactless. Each boss is a household object that wants something small (a seat, to be useful, a worthy rival, a nice trip, to be chased).

## Cast
- Elder Cat (real name Pewter): tutorial mentor, spectacles, cardigan, on her ninth life. Knows who opens the blind.
- Gerald: raccoon in a trench coat, insists he is a tall cat. Lives in the roof gutter. Has a guess about the blind. Leaves a final gift (Cat Door Key).
- Four clans, each with motto, origin, quirk and a rivalry line toward each other clan.
- Eight champions (2 per clan) with hook, backstory, motive, quote and art hint: Marmalade, Dolores of the Docks, Duchess Pudding, Brother Crumpet, Sable Vesper, Grandmother Moth, Pickle, Zephyr von Shelf.

## Seven bosses (motive in one line)
1. Rat King (A1): wants a seat at the warm place. Crown is a bottle cap.
2. Garden Hose (A1): tired of being stepped on and left in the rain.
3. Vacuum Mk IX (A2): wants to be useful, lonely in the cupboard.
4. Spray Bottle Duelist (A2): wants a worthy rival with style.
5. Vet Carrier (A3, Night 9 option): wants to carry a cat somewhere nice, once.
6. Red Dot (A3, Night 9 option): wants to be chased, never caught.
7. The Alarm Clock, 6:00 AM (Dawn phase of whichever Night 9 boss): the twist.

## The twist (lands at Dawn phase, 25 percent HP)
The Pests freeze, a tick sounds upstairs, the alarm rings. The Sunbeam is a window. The blind is opened by Staff, the Human upstairs, who has listened to the war through the floor for nine years and loved it. The alarm is not a final enemy, it is the finish line in a bad mood. The siege was always for the morning. Staff comes down, opens a tin, and feeds everyone, Pests included.
- Funny: Marmalade "I have been defending a lamp", Elder Cat "A window. Show some respect", Gerald "Nobody asks the raccoon".
- Heart: every Pest was somebody's chore left out in the cold. The clowder does not win, it is let in.
- Seeding: world.staff line, "blind is always found open" in Sunbeam lore, Gerald's secret, Elder Cat's last lines.

## Content counts
Opening cutscene 7 panels. Interstitials 6 cards (intro and outro per act). Banter 28 lines (4 clans x 7 bosses, on each boss). Victory 5 panels plus per-clan epilogues. Defeat messages 30. Loading tips 40. Codex 30 entries with unlock tags.

## Hooks for other agents
- Enemy ids expected: pest_rat_king, pest_garden_hose, pest_vacuum_mk9, pest_spray_bottle, pest_vet_carrier, pest_red_dot, pest_alarm_clock.
- Champion cardIds beyond marmalade and duchess_pudding are guesses (see NEEDS in file header).
- Codex unlock tags are listed in the file header; engine must fire them.
- Elder Cat event lines exist if the event agent wants a recurring NPC (A08 open question 5).

## Unresolved
- A03 samples put Duchess Pudding in clan `lap`; RULES say `hearth`. Story uses `hearth`.
- Whether the Alarm Clock is its own enemy entry or a phase of the Night 9 boss.
- Victory is the only place exclamation marks could go; currently none used, keeps A01 rule safe.
