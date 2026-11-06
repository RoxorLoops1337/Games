# Graftwork second hour (R2, new-player pass)

Method: Playwright chromium at 1280x720, real mouse clicks on every screen. Marrow, random seeds. Screens reached by real play: title, hero select, map, fights 1 to 3, reward, graft table, shop (card, relic, potion bought), forge (Temper), deck view under Strain, an elite, a boss and the defeat screen. Shortcuts used and why: shop, forge, elite and boss were entered with `run.phase` + `RUN.startFight/makeShop` + `flow.route()` (a cheated deck of 55 Weight vs Budget 6 to see Strain, Tithe, Backfire, Overload, Shatter). Screenshots: /tmp/claude-0/shots/r2/ (not in the repo). Strip in the forge and the shop remove screen were opened but not walked to the end.

Honest scope note: the cheated deck is absurdly strong (it killed the Act 1 boss in 2 turns), so no balance claims come from it.

## Ranked problems (worst first)

1. **Backfire was invisible in combat.** The HUD box showed only "Budget 55/6, Strain 49". Backfire (grafted cards jam, +1 cost) only appeared inside the hover tip, and jammed cards had a belt drawn on them but no word. A new player sees cards cost 2 and does not know why. (20_combat_backfire.png, 23_elite_start.png, 24_elite_turns.png) FIXED: the HUD box now grows a third red row "Backfire N" whenever Backfire is above 0.
2. **Shop LEAVE hover tip opened on top of the "Strip a graft" button** next to it (and stayed wherever the mouse was parked). A useless tip ("Back to the map") covered a real service. (09_shop.png) FIXED: tip removed from LEAVE.
3. **Forge grammar and a dead option.** "1 cards can be tempered", "1 cards carry grafts", "1 cards can give a graft"; Rest at full HP read "HP 82 to 82 (+0)" in green as if it were a good choice. (14_forge.png) FIXED: singular forms, and Rest says "Already at full HP (82)" in neutral colour.
4. **Title: the goal line ran into the top of the menu panel**, the tagline and goal were pressed against "New Run". (01_title.png) FIXED: both lines moved up 8 and 10 px.
5. **Hover tooltips cover the thing you are choosing between.** On the graft table, the Echo Chamber tip covers the other two grafts and the third card (08_graft_sel.png); on a boss turn the boss tip stack covers the enemy health bar (26_boss_start.png); the Ember resonance tip in the deck view covers the bottom card row (19_deck_strain.png). Not fixed: needs per-screen anchors in graft.js, deckview.js and tooltips.js, which others are touching.
6. **Reward row tip repeats the row** ("17 gold / Added to your purse") and lands on the next reward (potion), so the second reward looks greyed out. (05_after_fight1.png) Not fixed: reward.js is being edited by another agent. Suggest dropping tips for the gold row.
7. **Shop graft patches show only name and tier, no Boon or Price**, unlike the graft table; you must hover each one, and potion text is cut off with "..." (09_shop.png). Not fixed: needs layout room, owned by shop art pass.
8. **A "Plays three times" graft on a card that costs HP** (Echo Chamber on Transfuse: lose 3 HP, plays 3 times, plus 3 Ringing junk each combat) is offered with no warning, and the preview shows both lines but not the HP total. (08_graft_sel.png, 15_temper_pick.png) Not fixed: content/design call (an "unsafe pairing" hint in the preview).
9. **Temper preview "after" card looks the same as the before card** except the patch icon disappearing; nothing says "fused". The hover also overlaps the subtitle. (16_temper_hover.png)
10. **The "SECOND FITTING" banner and a full-screen Shatter splash sit on top of the play area** for about a second and the boss tip stays under them (28_shatter.png). The Shatter itself reads well ("Lost for the run").
11. **Jargon load in the first graft screen:** "W1 U" pips, "Tie it", "knots", "Line", "Claim", "Tithe", "Ringing" appear before any is explained; the tip says weight in a tooltip only. (07_graft.png, 26_boss_start.png)
12. **Defeat screen header is cramped:** subtitle, advice line and the red pulse line all sit in the 14px above the panels (30_defeat.png). Advice text itself is good and specific ("Too many grafts: Temper a card...").
13. **Map first tip sits over the left panel's Relics heading** and the hover tip over the first nodes (03_map.png). Minor.
14. **Stale tooltip seen once:** a shop graft tip ("Lead Thread ... 70 gold") stayed drawn in the next combat after cheat-routing out of the shop (20_combat_backfire.png). I could not reproduce it through real clicks, so treat as unconfirmed.
15. **Sew-on card list shows five identical "Cut" cards** with no tag to tell them apart (11_shop_graft_click.png); a count badge or "x5" would shorten it.

## What worked (keep)
The deck view under Strain is excellent (Strain 12, exact Tithed names, "Budget 18/6", TITHED stamps). The graft table's AFTER panel and the Overload preview read clearly. The defeat screen's advice line and "New on the record" credit give a reason to go again. Shatter, Overload damage numbers and the Temper "weighs 1 less" line were all clear.

## Fix log (files touched)
- ui/combat.js: Backfire row in the Strain box (box height grows to 3 rows only when Backfire > 0).
- ui/shop.js: LEAVE hover tip removed.
- ui/forge.js: singular/plural counts, full-HP Rest detail.
- ui/title.js: tagline and goal line y.
Tests: `node tests/run_graftwork.mjs` 44/44 pass.
