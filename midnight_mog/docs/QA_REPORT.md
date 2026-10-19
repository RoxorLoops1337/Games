# Midnight Mog QA report

Browser QA, performance and accessibility pass on the integrated game (js/main.js), played for real in headless Chromium 141 (Playwright, software rasteriser, 4 vCPU, no GPU). Viewports: 390x800 touch, 800x390 touch, 1280x800 mouse. The repeatable part is `tests/midnight_mog_browser.test.mjs` (skips with exit 0 and a message when Playwright or Chromium is missing; about 2.5 minutes when it runs).

## 1. Bugs found and fixed

| # | Found by | Bug | Fix |
|---|---|---|---|
| 1 | seeded monkey, 390 and 1280 | Deck detail crashed (`Cannot read properties of undefined (reading 'level')`, screens_deck.js) when a summon card was owned before its cat (crate drops). The error boundary caught it, but the player saw the WHOOPS panel. | Guard for the missing cat: the second button shows NO CAT and "find it in crates". Regression check is in the browser test. |
| 2 | read of Settings code | Text size setting did nothing (`ui.textScale` was never read). | `render/text.js` has `setTextScale`; text of 18 px and under grows (large x1.10, huge x1.20 effective). |
| 3 | read of Settings code | Quality setting did nothing (`ui.quality` never reached `fx.quality`). | Battle screen maps low, medium, high to fx quality 0, 1, 2 (high stays adaptive); main.js also caps render scale (low 0.75, medium 0.9). |
| 4 | screenshots | Enemy abilities showed their raw id (`toxic_load_ability`) as a floating label. | fx.js skips labels that end in `_ability`. |
| 5 | contrast audit | 228 of 1540 body texts under 4.5:1 (inactive tab labels 3.8, muted text 3.4, disabled button labels 2.0). | New palette tokens `violetText` and `slateText` used for text only; disabled button labels are bone on slate (5.3). |
| 6 | tap audit | Many controls drawn 32 to 40 px tall (tabs, filters, sort, quality, mute, hub MAP, suggestion buttons, town chips, plots in landscape, currency strips). | `ui.button`, `ui.tabs`, `ui.toggle`, currency strips, town chips and plots register a 44 px hit region centred on the drawn control (drawing unchanged). |
| 7 | console audit | Chrome warning "AudioContext was not allowed to start" on the first touch. | main.js unlocks audio on `pointerup` for touch (pointerdown only for mouse). |

## 2. Console and page errors

Zero console errors and zero page errors across: tutorial (all 11 steps), battle wins, pause, quit, deck builder, roster, map, town build, upgrade and collect, every crate (x1 and x10, full ceremony and skip), quests claim all, bestiary, relics, settings (all toggles, export file, copy code, import file, paste code), Nine Lives burn, reload persistence (profile identical after reload), offline welcome-back (lastSeen set 6 h back: "6h 00m, 6.2K fish, 132 yarn", collected into the profile). Chrome's own `getImageData` readback warning appears only under the contrast audit instrumentation.

## 3. Seeded monkey playtest

Seeded PRNG; each action is 58% tap on a random live region, 16% tap at a random point, 14% random drag, 5% drag from a region, 5% key (Tab, Enter, Escape, arrows, 1 to 5, p, a, f, c), 2% long press, 40 to 200 ms apart. Stuck means no tappable (non blocker) region on the top layer for 5 s. Crash panel, console errors, page errors and page hangs are counted.

| Run | Viewport | Seed | Start | Seconds | Actions | Errors | Crashes | Stuck | Longest gap with nothing tappable |
|---|---|---|---|---|---|---|---|---|---|
| wave 1 (before fix 1) | 390x800 | 1337 | fresh | 300 | 871 | 2 | 1 (deck, bug 1) | 0 | 0 ms |
| wave 1 | 800x390 | 7331 | fresh | 300 | 854 | 0 | 0 | 0 | 1681 ms |
| wave 1 (before fix 1) | 1280x800 | 4242 | fresh | 300 | 844 | 1 | 1 (deck, bug 1) | 0 | 1920 ms |
| wave 2 | 390x800 | 2024 | rich | 300 | 858 | 0 | 0 | 0 | 1018 ms |
| wave 2 | 800x390 | 2025 | rich | 300 | 927 | 0 | 0 | 0 | 1648 ms |
| wave 2 | 1280x800 | 2026 | rich | 300 | 872 | 0 | 0 | 0 | 0 ms |
| wave 3 (final code) | 390x800 | 11 | fresh | 301 | 896 | 0 | 0 | 0 | 1436 ms |
| wave 3 (final code) | 800x390 | 12 | fresh | 301 | 932 | 0 | 0 | 0 | 1782 ms |
| wave 3 (final code) | 1280x800 | 13 | fresh | 300 | 1062 | 0 | 0 | 0 | 1486 ms |
| wave 3 (final code) | 390x800 | 21 | rich | 300 | 888 | 0 | 0 | 0 | 1315 ms |
| wave 3 (final code) | 800x390 | 22 | rich | 301 | 889 | 0 | 0 | 0 | 1329 ms |
| wave 3 (final code) | 1280x800 | 23 | rich | 300 | 851 | 0 | 0 | 0 | 0 ms |

The error boundary recovered both wave 1 crashes (TRY AGAIN worked, the save was untouched).

## 4. Frame time, 150 live units (hand built late stage field, all buffed so nothing dies)

Software rasteriser, so fill rate is the limit: the same field takes 16 ms at 195x400 CSS px and 56 ms at 1280x800. JS time per frame (sim step and draw recording) is 5 to 8 ms at 1x CPU.

| Setup | Before | After |
|---|---|---|
| 390x800, 1x CPU | 24.7 fps, frame avg 40.5 ms, p50 33.4, p95 50.1 | 53.4 fps, avg 18.7, p50 16.7, p95 33.3 (render scale settled at 0.61) |
| 800x390, 1x CPU | 43.8 fps, avg 22.8, p50 16.7, p95 33.4 | 56.0 fps, avg 17.9, p50 16.7, p95 33.3 (scale 0.78) |
| 1280x800, 1x CPU | 17.7 fps, avg 56.4, p50 50.1, p95 83.3 | 39.8 fps, avg 25.1, p50 16.8, p95 33.4 (scale 0.50, the floor) |
| 390x800, 4x CPU throttle | 6.7 fps, avg 150, p50 150, p95 250 | 12.4 fps, avg 80.7, p50 83.3, p95 100.1 (JS alone 31.6 ms) |

What changed (measured one step at a time at 390x800 1x, frame work in ms):
1. Crowd level of detail (60 or more units): no faction rings, drips or neon lights on enemies; no auras, sparkles, mouths or role rings on cats; 3 of 9 tails for the nine tailed cat. 40.5 to 35.5.
2. Calm cats (idle or walking) in a crowd are repainted into their own bitmap at 10 Hz and blitted every frame at the smooth position. 35.5 to 32.5. Attack, cast, hit and shielded cats stay live. Below 60 units nothing changes.
3. Enemy sprites blit only their opaque box (computed once per baked sprite). 32.5 to 29.7.
4. Dynamic resolution: when the battle averages over 23.5 ms for two half second windows the backing store shrinks by x0.78 per step (floor 0.5); CSS stretches it, layout and input do not change; kept for the session. 29.7 to the table above.

Honest status: an average of 60 fps is not reached under the 4x CPU throttle (12 fps; JS alone is 31 ms there, so it is also CPU bound) and not at 1280x800 in software rasterisation (40 fps at half resolution). On this box it is reached only at 800x390 (56) and nearly at 390x800 (53). A real GPU has far more fill rate than SwiftShader, so phones should do better, but that is not measured here. Static screens are heavy in software too: roster 24 ms, deck 17 ms per frame (every frame repaints all tiles; a cache would fix it).

## 5. Accessibility

- Keyboard only (1280x800): Enter on the title, Tab to Continue (1 Tab), Tab to PLAY (6 Tabs), Enter starts the battle; keys 1, 2, arrows, Enter, a, f, p, Escape play 5 summons and pause; Tab to Quit and its confirm; Tab to the CRATES tab (17 Tabs), Tab to OPEN x1 (14 Tabs), Enter until the summary (4 presses; 1 under reduced motion), Tab to DONE. All completed without a pointer.
- aria-live: a `role=status aria-live=polite` region exists. Announced in that run: crate names while browsing, Previous and Next crate, ODDS, OPEN x1, the best drop ("Bell Kitten"), OPEN AGAIN, DONE, "Paused", "Resumed", auto and speed changes, base low.
- Reduced motion (`prefers-reduced-motion: reduce`): `ui.reduceMotion` true, transitions become 0.24 s fades, the crate ceremony reaches the summary after 1 press instead of 4 (suite: reduced 3.9 s against 14.4 s worst case), tickers snap, no screen shake.
- Contrast, computed from real pixels (median background under every fillText on 13 screens at 390x800, text alpha mixed in, WCAG relative luminance): 1540 body texts under 18 px. Before: 228 below 4.5:1 (worst: inactive tabs 3.79, muted text 3.41, disabled labels 2.05). After: 8 below, all the `BUY` and `8 tokens` shadow pass on Nine Lives (an ink shadow drawn under a bone label, not a visible label). Minimum elsewhere 5.04.
- Tap targets: after hit growth no interactive region is under 44 px on any screen except scroll clipped partial items (a tile cut by the viewport edge).

## 6. Still weak

- The frame rate targets are not met in this environment (section 4).
- Landscape 800x390: the battle field is a small centred box with wide empty sides; hub and crate screens are cramped (pity panel touches the crate row); town plots are drawn 38 px (hit region is 44).
- Text size huge: a few labels collide ("FIRST CLEAR +25", "no guarantee" next to LEGEND).
- Toasts sit on the page header and hide the title for about 2 seconds on deck and settings.
- Floating text collides on merges ("MERGE +1" over a small label).
- Keyboard order puts the nav bar last (14 to 17 Tabs to reach a tab).
- The browser smoke test takes about 2.5 minutes in software rendering.

## 7. Edits to files I do not own (smallest possible, each re-read before editing)

- js/ui/shell.js: `ui.regionList()` (QA accessor), `renderScale` and its use in `resize`, 44 px hit growth in button, tabs, toggle and currency strip, disabled button label colour.
- js/main.js: audio unlock on pointerup, dynamic resolution (`adaptRender`, `applyRenderScale`, `game.renderScale`).
- js/ui/screens_battle.js: quality mapping, crowd LOD flag, `cachedCat`.
- js/ui/screens_deck.js: missing cat guard. js/ui/screens_meta.js: `setTextScale` call. js/ui/screens_town.js: chip and plot hit regions. Text colour tokens in screens_town.js, screens_crate.js, screens_meta.js, screens_deck.js, hud.js.
- js/render/text.js: text scale. js/render/catart.js and enemyart.js: `o.lod`, sprite opaque box. js/render/fx.js: ability label guard. js/palette.js: `violetText`, `slateText` (appended).
