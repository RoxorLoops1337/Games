# THE WARD playtest (Z4)

Method: real Playwright chromium, real mouse input on desktop 1280x720 and CDP touch on a landscape phone (1000x462, dpr 2). New Run from the
title with the Ward switch, Marrow, hp and gold raised by cheat, fights shortened by cheat (the combat bot was too slow to play every fight).
Played day 1 to day 3 of floor 1 on the pre-dice walk, then re-tested the new dice routes, save and resume, and the phone. NOT reached: the Act 1
boss, floor 2, Daily, Classic from the switch and Pause/abandon (not tested in the browser; the test suites for those pass). Screenshots are
in /tmp/claude-0/shots/z4/ (not in the repo).

## Ranked findings (15)

1. BUG, fixed. Rooms built in the morning vanish after the first fight (owner report). `MEM.stamps`, `MEM.pops` and `MEM.bulbs` store the screen clock
   `S.t` of the build, but the clock restarts at 0 every time the Ward screen is re-entered (after a fight, reward, graft, event). The plate draws
   with `clamp((S.t - stamp) / 0.4, 0, 1)`: a negative age gives scale 1.35 and alpha 0, so the room stays invisible until the new clock passes the
   old stamp (10 to 30 seconds). Fix: ward.js `enter` clears the three maps. Test: graftwork_ui_ward "re-entering the Ward after a fight drops stale
   build stamps". Shot: a12_evening.png (Dispensary and second Sawmill missing, state still intact).
2. BUG, fixed. Touch: dragging a plan from the hand to the grid never dropped. core.js turns a vertical touch move past 14 px into a scroll gesture and
   suppresses the release unless the screen sets `app.touchPan = false`; the Ward never did. Fix: `app.touchPan = !!S.plans` in the Ward update.
   Test: "touch plan drags are not scrolls". Shots: m6_after_tdrag.png (broken), m8_after_tdrag.png (fixed).
3. BUG, fixed. Title Continue line of a Ward run read "Marrow, Act 1, Floor 0" (m7_title_continue.png). Now "Day 2 of 6". Test: "the title Continue
   line of a Ward run reads the day".
4. Phone: the walk legend clipped "Chapel event" to "Chapel..." at stage scale 0.64 (m2_ward_first.png, m4_midday.png). Fixed with short labels under
   scale 0.8 (m8_route1.png).
5. Design change delivered with this pass: dice routes (roll, plan a route step by step, Go). See WARD.md section 9. Walk phases before it were
   clear (hover thread, "1 fight (1 monster), 1 event, arrive at the Chapel", p1_1_preview_fight-event.png) but a click walked at once, with no
   confirm on desktop.
6. Clarity, open: "End Morning" with affordable plans left in hand silently discards them ("5 plans unplayed" is the only hint). A one-line "unplayed
   plans are discarded" in the sub label would help (b2_day1_start, a05_dropped).
7. Clarity, open: a room built with no spare power is built dark and its cost is already paid; the toast explains it after the fact ("The Linen Room is
   built dark", b2_built.png). Better: dim the plan's bulb when `power.used + plan power > cap` before the drop.
8. Clarity, open: a one-monster Ward fight pays "Gold x0.83" in the reward header (p2_first_reward.png). Reads as a penalty; say "1 monster pays 75 percent,
   midday +10 percent".
9. Ugly, open: the hero token sits on the room label ("ENTRA...", "CHA...") in the hero's room (a03_ward_first.png).
10. Ugly, open: hovering a room stacks two tooltips over the left panel and covers TODAY and the day log (a07_hover_chapel.png).
11. Slow, open: an empty evening and night (nothing worth walking to) still needs Wait here twice; about 12 clicks for a quiet day (build 5, End Morning,
    three walks). Consider "Wait out the rest of the day".
12. Truncation, open (hero select, not the Ward): "Pays for power in his own..." on the phone (m1_select.png).
13. Event screen does not say which phase or room the event came from, though the Chapel changes outcomes by phase (a10_event3.png).
14. Info: dark rooms stay dark after a Generator is built until the player toggles them (power 8 of 8 with two dark rooms, a04 morning 2); correct but
    surprising. The right panel could name the dark rooms when power is free.
15. Info: the sim's strong bot wins less with dice (below); a fresh player will see about 1.5 fewer fights a day.

Not found: soft locks. The last night always forces the Theatre; an empty hand always allows End Morning; Wait here is always legal; a route of one step
is always possible from the Entrance. Resume: Continue from the title restored the Ward in the morning of day 2 on desktop and phone.

## Sim (tools/graftwork_ward_sim.mjs, strong policy, A0, N=40 per hero)

| walker | marrow | wick | odile | fights per act (A1 / A2 / A3) |
|---|---|---|---|---|
| old (shortest path within MOVE 4, `GW_OLDWALK=1`) | 25% | 13% | 40% | 8 to 9 / 9 to 11 / 10 to 11 |
| dice routes, days 6 / 7 / 7 | 3% | 13% | 23% | 7 to 8 / 8 / 8 to 10 |
| dice routes, days 7 / 8 / 8 (N=60) | 17% | 18% | 20% | not printed |

Random policy: 0 wins in every run. Elites per act stay 1.3 to 2.5, so the 2 to 3 target holds only in acts 2 and 3. The data was NOT retuned (the day counts are
asserted by other tests and Z3 is editing data/ward.js): the cheapest lever is one more day a floor (7 / 8 / 8), then waitHeal and the wood and stone per monster.
Act 2 is where most dice runs die.
