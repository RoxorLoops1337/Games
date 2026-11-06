# Art review (Q1): the game against "The Anatomical Plate"

Method: Playwright chromium at 1280x720, quality high, every screen booted through `window.__gw` (title, hero select, map acts 1 to 3, combat in each act with 1 and 3 enemies, bosses, elite, reward, graft, shop, forge, event, deck, codex, wardrobe, victory, death). Shots live in `/tmp/claude-0/shots/q1/` (suffix `_a` before, `_b` and `_c` after the fixes). Scores are 1 to 10.

## Scores

| axis | before | after | note |
|---|---|---|---|
| Cohesion of style | 6 | 7 | Cards, enemies, hero and the title lettering are properly engraved. Backgrounds, bars, intent pills and panel fills read as flat web UI or painted scenery next to them. |
| Colour discipline | 5 | 7 | Act 1 was a saturated green, Act 2 a rainbow of book spines, Act 3 hot magenta and violet. Spot colour was everywhere, so nothing was spot. Practicals (lamps, glow, school glyphs) now carry the colour. |
| Lighting (one key lamp, rim) | 7 | 7 | Enemy and hero rim, floor shadows and lamp wash are consistent. Shafts in backgrounds still do not follow the pendulum phase of the card lighting exactly. Unchanged. |
| Typographic hierarchy | 8 | 8 | Engraved serif names, small caps labels and plain rules text are clear. Weakest points: the italic subtitle on the reward and end screens, and 11px grey labels on the map. |
| Iconography consistency | 6 | 6 | Card motifs and statuses are one family. Forge option icons, reward icons, the intent glyphs and the school glyphs in the map legend are three different drawing languages (flat fills, thin outline, hatched). Not touched this round. |
| Depth and atmosphere | 7 | 8 | Hatch veil in the corners and floor, desaturated walls make the lit enemies read in front of them. Fog and shafts already good. |
| Polish (alignment, borders) | 7 | 8 | Frames now share one language (brass, rivets, hatch). The first-run tip box still overlaps the map's Relics header and the combat HUD. |

## The 10 weakest or most off-style elements

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

## Changes (all cached or baked, no new per-frame cost)

- `art/backgrounds.js`: `atlasGrade()` at the end of `paintBack` (baked into the back layer, or run only while parallax moves), `hatchVeil()` cached layer drawn inside the baked front layer at alpha .2.
- `ui/combat_hud.js`: `drawBar` engraved shading with one cached 6px tile per context (null in headless, so tests are unaffected); `drawIntentBubble` frame. Layout rects unchanged.
- `ui/chrome.js`: `bakePanel` hatch on shadow edges (only panels at least 80x60).
- `ui/reward.js`, `ui/forge.js`: transparent `app.panel` overlay for hatch, inset shadow and rivets; reward screen dim 0.55 to 0.4.
- Reduced motion and quality tiers: all changes are static, so they apply at every tier and do not animate.

`node tests/run_graftwork.mjs`: 43/43 passed (one earlier run showed 42/43 under load and passed clean on both reruns).
