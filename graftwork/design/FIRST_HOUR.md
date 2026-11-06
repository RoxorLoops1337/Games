# Graftwork first hour (Q2, new-player pass)

Method: mouse only, default hero (Marrow), Playwright at 1280x720. Screenshots in /tmp/claude-0/shots/q2/. Notes in /tmp/claude-0/q2/notes.md.
Coverage honestly: title, hero select, map, fight 1 (about 4 turns), reward, one graft, map again, one event. The shop could not be reached (forced route showed a blank screen, 18_shop.png) and fights 2 to 4 were not played, so shop, Strain-first-hit and death findings come from reading the tip texts and code, not from play.

## Ranked problems

1. Goal of the game is never stated (01_title, 02_hero, 03_start). Tagline is poetic; first hint is "Floor 0 of 10". FIXED: goal line on the title.
2. Budget / Strain / Tithe are jargon on first sight (04_map, 13_graft). Map shows "BUDGET 0/6, No Strain" with no cue. FIXED: label is now GRAFT BUDGET; budget and strain tip texts define Weight, Strain and Tithe in plain words.
3. Resonance tip sat on top of map nodes (15_after_sew). FIXED: moved to the quiet left panel, same spot as the first map tip.
4. Enemy status icons ("1", "1") are unexplained and one vanished after my first hit, which dealt 0 damage with no message (05b_combat, 08_played, 08b). FIXED in part: the intent tip now says to hover the small status icons. NOT FIXED: no "blocked/negated" feedback on a hit that does 0.
5. Card-play tip (select, then click again or drag) arrives only after energy and intent tips are dismissed, so a player who just clicks a card gets no teaching and cannot tell selection from hover (07_cardsel, 09_after_t1). NOT FIXED: tests/graftwork_ui_combat.test.mjs pins the tip order; reordering means editing that test.
6. Event: after "click to skip" on the typed text, the outcome (-10 HP) appeared and I never saw the choices (16_event, 17_event2). I cannot tell whether one click skipped and chose. NOT FIXED (ui/event.js, outside the allowed files): needs a guard so the skip click cannot also pick.
7. Ascension (title) had no explanation. FIXED: hover tooltip says leave at 0 for a first run.
8. Thread rail text "Share a school with the last card to tie a knot" before any card shows what a school is (06_combat_idle). The school icon on cards is tiny. NOT FIXED.
9. Graft table W1/W2 weight pips and tag colors (SAFE/GREEDY/WEIRD) rely on a hover tooltip to be understood (13_graft, 14_graft_sel). The tooltip covers the other offers. NOT FIXED.
10. "Tithed" and "Strain" headings in the graft table say "Nobody pays" with no hint why that matters yet (13_graft). NOT FIXED.
11. Map legend jargon: "Forge: rest, expand, refine, strip or reforge" (04_map). NOT FIXED.
12. Defeat screen shows the killer but not what to change (ui/end.js, not reached). NOT FIXED.
13. Pause and fullscreen: top-right buttons are visible and consistent, discoverable. Fine, no change. The title has no pause, only Fullscreen: Off in the menu.
14. Hover zoom of a hand card plus "The numbers" tooltip covers the thread rail and neighbours (05b_combat). NOT FIXED.
15. End turn: a clear button plus a confirm when energy is left (10_t3). Good. The confirm bubble sits over the right side but not over cards.
