# Ludus Maximus 3D: independent review

Reviewer stance: skeptical, built nothing. Captured with software GL (SwiftShader), `?nowarm=1&manual=1`, 1100x650 desktop and 390x800 touch. Screenshots are under `/tmp/claude-0/review/` (contact sheets `m_d1/2/3.png`, `mf1/2/3.png`, `mh1/2.png`, `mo1.png`, `mpz.png`, `bot/mb1.png`, `bot/mb2.png`, `mheat.png`). Console: zero page errors or console errors across every run. Document-level horizontal overflow: none at either size (only mid-word button wraps, see defects).

Not captured (be honest about coverage): tournament bracket tablet, a real ultimate close-up (Q fired but cooldown was still running in the demo), 800x390 landscape, low/medium tiers, a real kill-cam finisher on desktop (seen only on phone). Treat those as unreviewed, not as passing.

Evidence caveat: shots taken before any `advance()` in manual mode show an unrendered navy canvas. That is a harness artifact and is NOT counted as a defect.

## 1. Scorecard (0 placeholder, 1 basic, 2 premium stylized, 3 showcase)

| Category | Score | Justification |
| --- | --- | --- |
| Art direction | 2.5 | Golden-hour Rome identity is consistent from title through hub, arena and UI (gilt serif, meander borders, parchment and Tyrian purple). Weakened by the dark-navy versus parchment panel split and pink-washed fighters. |
| Hero / gladiator | 2.0 | Five readable silhouettes, good gear (scutum, griffin helm, plumes), animation reads. But skin and armor blow out to pink-white under rim and bloom, and blood on bodies reads as leopard camouflage. |
| Enemies / beasts | 1.5 | Lion is a faceted blob with a cone mane, elephant is unreadable at phone camera distance, beast VS splash shows empty navy placeholder portraits. Below the premium floor. |
| Rewards / interactables | 2.0 | Trophy, augment, loot, bet and mercy flows have authored medallions and states. Market and armory are empty-state screens in a new game, so item presentation was not demonstrable. |
| World / environment | 2.5 | Hub terrace with city and aqueduct skyline, torches, rain, dusk and tiered colosseum with torches and arches are layered and dense. Crowd is stick figures up close. New-game hub is mostly empty plots. |
| Materials / textures | 2.0 | Brick, tile and sand are good. Character materials are flat and over-lit. Blood decals are spiky star shapes at large scale. |
| Lighting / render | 2.5 | God rays, warm key, violet shadows, convincing dusk and rain. Night on phone is near black and heat haze wrecks the phone hub. Fighters are over-exposed. |
| VFX / motion | 2.0 | Event-driven hit sparks, dust, shockwaves, stars, finisher text. Dust puffs become opaque white cotton in team fights; blood saturation hides the floor by mid-fight. |
| UI / HUD | 2.0 | Cohesive Roman kit, good tap targets and information density on phone. Too many clipped or overlapping spots (see defects), and 650px-high desktop sheets are cramped. |
| Performance evidence | 2.0 | Hub 51 calls and 327k tris, title 61 calls and 378k tris, fight scenes inside budget. No frame data on real GPU, spikes only measured in SwiftShader. |

Average 2.1. Not premium: the average is under 2.3 and Enemies/beasts is below 2. Highest-leverage path to premium is fixing beasts and the fighter exposure, not adding features.

## 2. Top 25 defects, ranked

Format: repro, screenshot, owner area, fix. Base URL is `http://localhost:8211/ludus_maximus_3d/index.html`.

1. **Beasts look like placeholders and the beast VS splash has empty portrait slots.** Repro: `?nowarm=1&manual=1&demo=1&hunt=elephant` at 390x800, t=4 (and `hunt=lion`, t=25). Shot: `h2_p_4.png`, `h1_d_25.png`, `mh1.png`. The enemy portrait and the third ally slot are empty navy arches. Lion is faceted, pink-tinted, with a cone mane; elephant is a grey blob with a red box. Owner: `js/beast.js`, `js/beast_fx.js`, VS splash in `js/director.js`/`js/ui_kit.js`. Fix: render a real beast bust into the splash (reuse portrait.js), hide unused empty slots, add fur shells or card layers, head and jaw detail, and a proper tint-free albedo.
2. **Fighters are over-exposed and pink-washed during play.** Repro: `?demo=1&a=murmillo&b=thraex`, t=6 and 12. Shot: `mf1.png`, `f1_d_12.png`. Skin, greaves and tunics converge to one pink-white, so teams and styles stop separating. Owner: `js/gladiator.js` materials, rim light in `js/env_arena.js`, bloom threshold in `js/post.js`. Fix: lower rim intensity and emissive bleed, raise albedo saturation, tone-map check with a gray card, give each team a clear trim color.
3. **Blood on bodies renders as leopard camouflage spots.** Repro: any fight outro, `bot/d_13.png`, `mo1.png` (t=40 to 60). Brown blotches over the winner's chest and arms look like a skin shader bug, not blood. Owner: `js/rig.js` blood shader, `js/gore.js`. Fix: smooth gradient wipes and drips, darker wet specular, cap blotch contrast.
4. **Arena floor is saturated with blood within 20 seconds and splat shapes are spiky stars.** Repro: `?demo=1&a=murmillo&b=thraex`, t=20; phone t=10. Shot: `f1_d_20.png`, `f1_p_10.png`. Large decals have radial spikes that read as stickers; sand base disappears so later hits cannot be seen. Owner: `js/gore.js`, decal canvas in `js/fx.js`. Fix: soften splat masks (noise-eroded blobs), scale decals by hit size, fade older decals toward dried brown, cap total coverage.
5. **Heat haze weather destroys hub legibility on phone.** Repro: `?new=1&notut=1&nowarm=1&manual=1` at 390x800 on a heat-weather week, open any screen. Shot: `nav_p_arena.png`, `nav_p_market.png`, `mp1.png`. Whole ludus melts into vertical streaks; strong on desktop edges too (`mheat.png`). Owner: heat haze in `js/post.js`, `heatTarget` in `js/hub.js`. Fix: cap the distortion amplitude near 10 percent of current, scale by screen height, disable under sheets and on low tier.
6. **Phone night hub is nearly black.** Repro: hub, `__LM3D.game.hub.setWeather('night');setHour(22)` at 390x800. Shot: `hubp_hub_night.png`. Buildings and plot outlines are unreadable; torches are the only cue. Owner: `presetFor` in `js/hub.js`. Fix: raise hemi fill and moonlight, ensure luminance contrast stays above 60.
7. **Mandatory first-run recruit sheet shows a close button that does nothing, and Escape is dead.** Repro: `?new=1&notut=1&nowarm=1&manual=1`, press Escape or click X with zero fighters. Shot: `heatp_heat.png`. Owner: `js/screens/recruit.js`, `js/game.js` `open('recruit',{first:true})`. Fix: hide X when `first`, or let it close and show a persistent "Hire your first fighter" hub CTA.
8. **Recruit sheet hides the Hire buttons at 1100x650.** Repro: `?new=1&rich=1&notut=1` desktop. Shot: `new_d_1.png`, `new_d_2.png`. Cards clip mid-row; the primary Hire button sits below the fold behind the "New faces" footer with no scroll cue. Owner: `js/screens/recruit.js`, `css/ui.css`. Fix: compact card at short heights, put Hire at the top right of each card, add scroll fade.
9. **Pre-fight toast and tutorial dialog cover the dialog title.** Repro: bot flow, `bot/d_09.png`, `bot/d_end.png`: the toast "The crowd loves it. +3 fame." sits over the sheet header and the Trophy dialog has a yellow dot on "FIRST BLOOD". Confetti draws over dialog text ("BRIBE THEIR PHYSICIAN"). Owner: `js/ui_kit.js` toast z-order and anchor, `js/ceremonies.js`. Fix: anchor toasts below the safe area and above nothing modal, put confetti behind the scrim, delay toasts while a modal is open.
10. **Pre-fight sheet clips the Dirty Tricks text.** Repro: bot flow, `bot/d_01.png`, `bot/d_14.png`: "Rival has 12% less max HP" is sliced by the stance row at 650px. Owner: `js/screens/modes.js`/`fightsetup.js`. Fix: make the sheet body scroll with a visible fade, or collapse Dirty Tricks.
11. **Duplicate names in a matchup: "Valeria vs Valeria".** Repro: bot flow week 1, `bot/d_08.png`. Owner: opponent generator in `core/` (name pick) and `js/fightsetup.js`. Fix: reject opponent names that match any fighter on either side.
12. **Result dialog repeats itself: "DUEL WON / VICTORY" and "DEFEAT / DEFEAT".** Shot: `bot/d_06.png`, `bot/d_13.png`. Owner: `js/flow.js` results builder. Fix: use the dialog title for the context (Easy Duel, Hard Duel) and the banner for the result.
13. **Results dialog covers the finisher.** Shot: `bot/d_06.png`. The dim plus a centered 500px card hides the winner pose. The outro itself is good. Owner: `js/flow.js`, `js/photo.js` fab. Fix: dock the card to the side or bottom on desktop, auto-hide after a few seconds with a "Review" button.
14. **Victory banner is overlapped by the winner's sword and shield.** Repro: demo, t=40. Shot: `mo1.png` top right. Title depth sits behind the 3D model. Owner: `js/fightview.js` outro, `js/director.js`. Fix: move the title up or let the director frame the winner lower.
15. **Phone fight camera is a near top-down tangle.** Repro: `?demo=1&a=thraex&b=retiarius` at 390x800, t=10 and 20; elephant t=14 and 30. Shot: `f1_p_10.png`, `mh2.png`. Two or three fighters overlap in a single blob, name plates overlap, and the beast silhouette is invisible. Owner: `js/director.js` portrait framing. Fix: lower pitch on narrow aspect and fit by bounding spread, push plates apart.
16. **Buttons break words mid-word.** Repro: More > Ludus at 1100x650: "CALEND AR", "BARRAC KS", "MEMORI AL", "INFIRMA RY". Also augment cards: "REGENERATIO N". Shot: `m_d1.png`, `bot/d_02.png`. Owner: `js/screens/more.js` and button CSS. Fix: allow two-row grid or smaller tracking and `overflow-wrap: normal`, shorten labels.
17. **Crowd is stick figures up close.** Shot: `f1_d_12.png`, `f1_d_6.png`. Spectators are boxes with thin arms; flat across tiers. Owner: `js/env_arena.js`. Fix: add head and torso variation, color-grade by tier, drive cheer with silhouettes of arms and flags.
18. **Establishing shot opens on an empty arena with microscopic fighters.** Repro: demo, t=2 desktop. Shot: `f1_d_2.png`, `f3_d_4.png`. Half a second of nothing to read; HUD counters already show. Owner: `js/director.js` intro. Fix: start closer on the gate and fighters, shorten.
19. **Pause menu has a pencil icon on Resume and jargon "Target links"; HUD stays live behind it.** Repro: demo, press P. Shot: `mpz.png` top left. Owner: `js/fightview.js` pause modal. Fix: play icon, rename to "Aim lines" with a one-line hint, dim the HUD.
20. **Photo mode caption collides with live combat text.** Repro: demo, click the camera fab. Shot: `mpz.png` bottom right ("ARENA" over "SHIELD BASH!"). Owner: `js/photo.js`. Fix: pause damage numbers and callouts when photo mode begins.
21. **Dust puffs are opaque white cotton in team fights.** Repro: `&team=3`, t=12. Shot: `f3_d_12.png`. They bury all three fighters. Owner: `js/fx.js`. Fix: lower alpha, soft-particle depth fade, shorter life.
22. **Modal sheets are too short at 650px height.** Roster, Market, World all show 2 to 3 rows. The nav bar peeks out under sheets as faint clutter. Shot: `nav_d_roster.png`, `m_d1.png`, `m_d3.png`. Owner: `css/ui.css` sheet max-height. Fix: use the full viewport minus the HUD, hide the nav while a sheet is open.
23. **Bottom nav on desktop is a narrow 520px strip tucked on the screen edge with labels near the bottom.** Shot: `hubd_hub_day.png`. Owner: `js/game.js` nav, `css/ui.css`. Fix: center it with a safe-area inset and a higher label baseline.
24. **Inconsistent panel skins: parchment (Roster, Market, Armory, results) versus dark purple (Arena, More, World).** Shot: `nav_d_arena.png` versus `nav_d_roster.png`. No rule a first-time user can learn. Owner: `css/ui.css`, screens. Fix: pick one for management and one for the arena, document it in the bible.
25. **Empty states waste a new player's first minutes.** Market "not built", Armory "No spare items", Bestiary "???", Chronicle "Nothing yet" all show a blank panel with no next step button. Shot: `m_d1.png`, `m_d3.png`. Owner: `js/screens/market.js`, `armory.js`, `venatio.js`, `world.js`. Fix: each empty state gets a single primary action (Build Market, Start training, etc).

## 3. What is genuinely excellent (do not regress)

- Title scene: gilt logotype over the live ludus, sparks, a single strong CTA (`title_d_3.png`). Best-looking surface in the game.
- Hub golden hour, dusk and rain: layered skyline with aqueduct, torches that come on, wet look and rain streaks that read cleanly (`hubd_hub_day/dusk/rain.png`).
- Arena bowl lighting: god rays, torches, arches, violet shadows, wide shots have scale and atmosphere (`f2_d_3.png`).
- Combat reads: hit sparks, crit text, finisher callout, star stuns, ring telegraphs and ultimate rings clarify what just happened.
- Roman UI kit: meander borders, serif display type, consistent button tiers, 44px-plus tap targets on phone, no horizontal overflow (`nav_p_roster.png`, `nav_p_profile.png`).
- Information density and tone of the World screens (calendar, rivals, memorial, barracks): clear writing, good hierarchy.
- 3D portraits on recruit, roster and profile cards.
- Clean console across all captured flows; rendering budgets (51 to 61 calls) leave real headroom.

## 4. Missing features a GOTY contender would have

- Real voice and announcer lines (editor/crowd barks), and a licensed-feeling composed score with stems, not only synthesis.
- Distinct arena themes per league visible in the first fight (north African, Alexandrian, imperial), with weather and time-of-day in the arena.
- Gladiator customization: faces, hair, tattoos, armor dyes, and visible scars in the portraits.
- Player-controlled moment-to-moment combat option (dodge, parry timing, directional attacks), not only orders and auto.
- Tutorial for the fight itself (first-fight overlay explaining health, stamina, ultimates, orders).
- Replay and cinematic highlight camera with scrubbing and saved clips on all platforms.
- Interactive hub life: pick up and talk to NPCs, visit the market stalls, see fighters training in the yards.
- Proper storytelling arc: named campaign rival, narrative cutscenes with dialogue.
- Accessibility parity at launch: colorblind palette previews, subtitle for crowd and announcer, one-handed phone layout.
- Controller support and gamepad glyphs on desktop.
- Visible progression feedback on the hub (building upgrades animated, fame tiers unlocking new districts).
- Localization.
- Multiplayer or ghost-ludus asynchronous rivals.
