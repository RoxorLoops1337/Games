# Playtest and review records (dated)

Four reads of the game made before the cleanup, merged into one file in its docs pass. They are records, not specs: each says what was seen then and what was fixed. Screens called "map" are the retired Classic node map (every run is a Ward run now; the Ward playtest is `WARD_PLAYTEST.md`). Items marked NOT FIXED were not re-checked against the current game.

Contents: First hour (Q2), Second hour (R2), Late game (S1), Art review (Q1).

## Graftwork first hour (Q2, new-player pass)

Method: mouse only, default hero (Marrow), Playwright at 1280x720. Screenshots in /tmp/claude-0/shots/q2/. Notes in /tmp/claude-0/q2/notes.md.
Coverage honestly: title, hero select, map, fight 1 (about 4 turns), reward, one graft, map again, one event. The shop could not be reached (forced route showed a blank screen, 18_shop.png) and fights 2 to 4 were not played, so shop, Strain-first-hit and death findings come from reading the tip texts and code, not from play.

### Ranked problems

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

## Graftwork second hour (R2, new-player pass)

Method: Playwright chromium at 1280x720, real mouse clicks on every screen. Marrow, random seeds. Screens reached by real play: title, hero select, map, fights 1 to 3, reward, graft table, shop (card, relic, potion bought), forge (Temper), deck view under Strain, an elite, a boss and the defeat screen. Shortcuts used and why: shop, forge, elite and boss were entered with `run.phase` + `RUN.startFight/makeShop` + `flow.route()` (a cheated deck of 55 Weight vs Budget 6 to see Strain, Tithe, Backfire, Overload, Shatter). Screenshots: /tmp/claude-0/shots/r2/ (not in the repo). Strip in the forge and the shop remove screen were opened but not walked to the end.

Honest scope note: the cheated deck is absurdly strong (it killed the Act 1 boss in 2 turns), so no balance claims come from it.

### Ranked problems (worst first)

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

### What worked (keep)
The deck view under Strain is excellent (Strain 12, exact Tithed names, "Budget 18/6", TITHED stamps). The graft table's AFTER panel and the Overload preview read clearly. The defeat screen's advice line and "New on the record" credit give a reason to go again. Shatter, Overload damage numbers and the Temper "weighs 1 less" line were all clear.

### Fix log (files touched)
- ui/combat.js: Backfire row in the Strain box (box height grows to 3 rows only when Backfire > 0).
- ui/shop.js: LEAVE hover tip removed.
- ui/forge.js: singular/plural counts, full-HP Rest detail.
- ui/title.js: tagline and goal line y.
Tests: `node tests/run_graftwork.mjs` 44/44 pass.

## Late game read (Acts 2 and 3), session S1

Method: real Chromium, real mouse clicks through the combat screen (hover, click card, click enemy, End Turn), Marrow with a strong-bot deck and 260 HP so fights run long enough to read. Fights seen: Act 2 normals (Needle Nanny + Brine Surgeon, Scissor Nurse + Tax Collector + Ferric Warden), elites (Appraiser, Pickled King), boss (Broker); Act 3 normals (Applause + Understudy's Shadow + Usher, Mask Chorus + Gilded Cherub + Critic), elites (Gold Leaf Golem, Diva), boss (Impresario), final (Grafter). Fights were played to turn 3 or 4 each with a hover tour of intents and statuses, not to the kill. Screenshots are in /tmp/claude-0/shots/s1/ (not in the repo). Not seen: Mimic, Insulated, Hoist, Ensemble, Claim, Late Fee first hit; Thirst and Leaf Armor tooltips only partly (hover positions missed).

What works: intent tooltips are strong (they print base, strength, weak and the final number, for example "Base 20, +2 Strength, x0.75 Weak = 16"), status tooltips state stacking and effect, the Diva Aria tip explains its own condition.

### Ranked findings

1. Intent plate does not show that its number is conditional. The Diva plate reads 37 but the move grows by 3 per card past the 5th and per Applause; only the hover says so. FIXED: a gold "+" pip on the plate for any move with a tip or note. Shots: a3e2_tour_int0, a3e2_t03_a.
2. Intent plate showed only two effect icons, so Appraiser (attack, block, debuff) hid its debuff. FIXED: up to three icons, dropping from the right when the plate is narrow. Shots: a2e1_t03_a, a2n2_t01_a.
3. Multi-enemy plates all show a bare sword for different moves (Snip, Levy, Allergy all 14 in a2n2_t01_a). The move name sits above, but the icon does not distinguish them. Open: needs per-move icon art.
4. The boss and elite intro banner covers the enemy name, move and intent plate on turn 1, and the first screenshot after the fight starts shows it (fix1_t01_a, fix2_t01_a). A new player cannot read the first telegraph for about two seconds. Open: dim only the lower band, or shorten.
5. Floating combat text lands on the intent plate and move name ("BROKEN" and "+10 Block" over the Appraiser's Levy, a2e1_hover_122). Open: anchor enemy float text to the body centre, not the plate.
6. Hero status row is one row of about 20 px icons under the HP bar; with five statuses (a3n2_t03_a) the numbers are tiny and the effect of each (card cost up, Charge) is only on hover. Open: needs a taller hero plate in combat_layout.
7. Card costs inflated by a player status (a3n2_t03_a shows 2, 3, 2, 2, 3 on a 1-cost hand) with no label on the cards. The cause is only in the hero status tooltip. Open: tint the cost orb and name the cause in the card tip.
8. Pickled King Lid Crush shows 29 with Brined 14 and Thirst as plain icons; the plate does not say what feeds the number (a2e2_t03_a). Open: give the move a tip like Aria has.
9. The Grafter "Your Bone Saw" tip says only "Hits you for 14" (a3f_tour_int0). It should say it copies your most played card. Open (data text, enemies_3.js).
10. Tooltip panels cover the hand and the Thread rail while hovering statuses (a3n1_tour_st0, a2n1_tour_hero), so the cards you are planning with are hidden at the moment you read the status. Open.
11. Aria style spikes are large (36 plus 12) against a real 70 to 90 HP player; the plate is honest but there is no "this would kill you" warning colour. Open: tint the number red when intent damage is at least current HP plus Block.
12. Card text repeats a line ("Apply 2 Bleed. Apply 3 Bleed." on Clean Incision, a2e1_hover_122); merge same-status lines. Open (text.js).
13. Enemy statuses wrap to a second row of bad statuses under the HP bar; with 8 statuses on a 4-enemy fight the rows sit close to the Thread rail (a3n2_t03_a). Fits, but no room to grow.
14. Status name is never on the icon, only a glyph and number; Leaf Armor, Interest, Late Fee and Brined need a hover each (a3e1_tour_stx1, a2b_tour_st0). Open: colour-coded glyphs exist; add name labels on the elite or boss only.
15. Tutorial tip ("Energy pays for cards") reappears in Act 2 on a fresh meta; harmless in a real run but it sat over the first telegraph in a2n1_t02_a. Open.

### Fixed in this pass
Findings 1 and 2, both in ui/combat_hud.js (drawEnemyPlate badge, drawIntentBubble kinds). `node tests/run_graftwork.mjs`: 46/46 passed. Findings 3 to 15 were not fixed in this session (time budget), the list is ordered by priority for the next pass.

### Fixed in pass S3 (findings 3 to 15)
3 intent icons per move effect (engine/intent_icons.js: attack, multi + xN, sweep, heavy, Block, debuff, poison, buff, heal, summon, junk, special; up to 3). 4 intro plate 1.3 s (elite 1.1 s), gone before the queue releases. 5 enemy floats clamp below the intent plate (fyE). 6 hero status row 28 px (min 26) in a 64 px plate. 7 red up-arrow badge on the cost orb when cost is above printed. 8 Lid Crush and the Grafter mirror have tips. 9 hero tips use HERO_TIP_BAND (above the hero), the hero '+N' list opens upward. 10 lethal chip and red pulse (engine lethalIncoming). 11 card text merges same-effect lines and says "again" / "more" for repeated branch sentences (engine/text.js). 12 status names under icons for 3 or fewer statuses on one row. 13 tutorial bubbles take `avoid` rects (enemy name, move, intent). 14 enemy status icons shrink to 22 before collapsing. Tests: graftwork_intents, graftwork_ui_combat_layout.

### T1 visual verification
Method: Playwright chromium at 1280x720 and 844x390, real boot via window.__gw, fights forced onto chosen enemies and moves, real mouse clicks for card plays where the fan allowed it. Shots in /tmp/claude-0/shots/t1/ (not in the repo).

Seen and fine:
1. Gold "+" pip: shown on Diva Aria, Resident Mimic and Gold Leaf Golem Gilt Slam once the intro is over, at both sizes. At 844x390 it is about 12 px and touches the plate corner but reads.
2. Intent icons over 14 enemies (Scissor Nurse, Pill Swarm, Bedpan Slime, Orderly, Gold Leaf Golem, Coin Mite, Auction House, Impresario, Fever Moth, Bidder, Cleaver, Mask Chorus, Usher, Applause, Heckler, Critic): single sword, sword with xN (multi), red-ringed heavy sword (Gilt Slam 33), crescent sweep, shield (Block), purple skull (debuff), green drop (poison), green arrow (buff), green plus (heal), purple summon, paper (junk) are all distinguishable at 1280x720. At 844x390 the icons are about 16 px: colour and the xN text carry it, single versus multi swords need the number. A third icon is dropped on narrow plates (Heckler loses junk).
3. Lethal chip and HP pulse: the "Lethal: N incoming" chip sits above the HP bar, covers neither the HP numbers nor the Thread rail nor the status row, at both sizes. Playing Block lowers N live, and it clears when Block covers the turn. Hero status row with 3 statuses just touches the Budget plate edge at 844x390 (no overlap).
4. Cost badge: red orb with an up arrow on the cost orb of a card under Leaden (Cut shows 2); Heavy Hands uses the same path.
5. Floats: BROKEN and "+10 Block" land below the intent plate on a boss, the hero side shows BROKEN 8 when Block is chewed; the turn damage counter ("DAMAGE n") stays by the hero until the turn ends, that is by design.
6. Matron: Claim status icon on her and a "Claim +1" float show at spawn. Other boss situations (Late Fee fray, Mimicry, Insulated Burn return, Hoist jam belt, Ensemble) have statuses, tips and events in code (seamFray float "Frayed", statuses with desc, Claim tip) but I could not reproduce them reliably in a rendered frame this pass: the harness plays cards through real clicks only when the fan lets the click land (Kindle clicks missed in the Defibrillator test) and forced plays through the engine bypass the UI event queue. Treat items 6 (Late Fee, Mimic, Insulated, Hoist, Ensemble) as NOT visually verified; next pass should script them from a clean hand of 3 to 5 cards.

Fixed (engine/text.js): a per-source value with multiplier 1 printed no number ("Gain 3 Block, plus Block per card in hand"); it now says "plus 1 Block per card in hand" (and "1 card" for draws). A conditional line starting in lowercase ("the Line holds 2 or more schools: ...") is capitalised. Reviewed 14 random grafted cards: "Deal 12 damage again." after a Pay line and "Gain 2 more Charge." read acceptably.

## Art review (Q1): the game against "The Anatomical Plate"

Method: Playwright chromium at 1280x720, quality high, every screen booted through `window.__gw` (title, hero select, map acts 1 to 3, combat in each act with 1 and 3 enemies, bosses, elite, reward, graft, shop, forge, event, deck, codex, wardrobe, victory, death). Shots live in `/tmp/claude-0/shots/q1/` (suffix `_a` before, `_b` and `_c` after the fixes). Scores are 1 to 10.

### Scores

| axis | before | after | note |
|---|---|---|---|
| Cohesion of style | 6 | 7 | Cards, enemies, hero and the title lettering are properly engraved. Backgrounds, bars, intent pills and panel fills read as flat web UI or painted scenery next to them. |
| Colour discipline | 5 | 7 | Act 1 was a saturated green, Act 2 a rainbow of book spines, Act 3 hot magenta and violet. Spot colour was everywhere, so nothing was spot. Practicals (lamps, glow, school glyphs) now carry the colour. |
| Lighting (one key lamp, rim) | 7 | 7 | Enemy and hero rim, floor shadows and lamp wash are consistent. Shafts in backgrounds still do not follow the pendulum phase of the card lighting exactly. Unchanged. |
| Typographic hierarchy | 8 | 8 | Engraved serif names, small caps labels and plain rules text are clear. Weakest points: the italic subtitle on the reward and end screens, and 11px grey labels on the map. |
| Iconography consistency | 6 | 6 | Card motifs and statuses are one family. Forge option icons, reward icons, the intent glyphs and the school glyphs in the map legend are three different drawing languages (flat fills, thin outline, hatched). Not touched this round. |
| Depth and atmosphere | 7 | 8 | Hatch veil in the corners and floor, desaturated walls make the lit enemies read in front of them. Fog and shafts already good. |
| Polish (alignment, borders) | 7 | 8 | Frames now share one language (brass, rivets, hatch). The first-run tip box still overlaps the map's Relics header and the combat HUD. |

### The 10 weakest or most off-style elements

1. Combat backgrounds in all three acts, saturated painted flats (`04c1x1_a`, `04c2x3_a`, `04c3x3_a`). FIXED: atlas grade (desaturate 40 percent, sepia multiply) baked into the back layer.
2. No engraving on the room: no hatching anywhere in the scenery (`04c2x1_a`, `03map1_a`). FIXED: cached 45 degree hatch veil, heavier toward corners.
3. Enemy and hero HP bars: web capsule with a white gloss stripe (`04c1x1_a`, `05boss3_a`). FIXED: ink hatch on the shadow half, 1px lit edge, meniscus tick, double rule.
4. Intent bubbles: rounded dark pills (`04c2x3_a`). FIXED: squarer engraved tag, spot colour rule, sepia inner line, four rivets.
5. Panels (deck, codex, wardrobe, end screen, map side panels): dark flat fill with only a brass edge (`11deck_a`, `12codex_a`, `13wardrobe_a`, `14victory_a`). FIXED: baked 45 degree hatch on the bottom and right shadow side of every panel.
6. Reward rows: a flat brown box on an almost black screen, 55 percent black overlay (`06reward_a`). FIXED: chrome overlay (hatch, inset shadow, rivets), overlay eased to 40 percent so the ward background reads.
7. Forge option cards: flat gradient cards with dashed inner border (`09forge_a`). FIXED: same chrome overlay.
8. Act 3 background: crimson and violet washes with gold arch drowned the enemies (`04c3x3_a`, `05boss3_a`). FIXED by items 1 and 2.
9. Forge, reward, event and map icons are flat vector fills without the 1px hatch and highlight (`09forge_b`, `06reward_b`, `10event_a`). NOT fixed (needs per-icon redraws).
10. Codex and deck empty states: dashed black slots and "?" glyphs, no vellum anywhere outside the cards and the map sheet (`12codex_a`). NOT fixed. Also: first-run tip boxes overlap HUD (`03map1_a`, `04c1x1_a`), and the event illustration frame is a flat violet wash (`10event_a`).

### Changes (all cached or baked, no new per-frame cost)

- `art/backgrounds.js`: `atlasGrade()` at the end of `paintBack` (baked into the back layer, or run only while parallax moves), `hatchVeil()` cached layer drawn inside the baked front layer at alpha .2.
- `ui/combat_hud.js`: `drawBar` engraved shading with one cached 6px tile per context (null in headless, so tests are unaffected); `drawIntentBubble` frame. Layout rects unchanged.
- `ui/chrome.js`: `bakePanel` hatch on shadow edges (only panels at least 80x60).
- `ui/reward.js`, `ui/forge.js`: transparent `app.panel` overlay for hatch, inset shadow and rivets; reward screen dim 0.55 to 0.4.
- Reduced motion and quality tiers: all changes are static, so they apply at every tier and do not animate.

`node tests/run_graftwork.mjs`: 43/43 passed (one earlier run showed 42/43 under load and passed clean on both reruns).

