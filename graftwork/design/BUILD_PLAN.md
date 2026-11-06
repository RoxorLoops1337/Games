# GRAFTWORK ROUND 4 BUILD PLAN (read this first, then your spec)

OWNER BRIEF: "Best possible graphics (unique art style, AAA effects), ground-breaking animations, juice that makes hits/wins/losses feel real and the game addictive, mechanics that move smooth and are player friendly. Card dragging, readability, tooltips for all effects: perfect. Fullscreen button on the start menu AND in the in-game pause menu. HUDs clean, nothing overlapping, cards playable and readable. Enemies do a bit more damage in CLEVER ways (poison, fragile, fun abilities) and the game needs a NEW MECHANIC that makes choices and deck combinations matter more."

SPECS (all in graftwork/design/): ART_BIBLE.md (The Anatomical Plate), THREAD.md (new core rule), ENEMY_DEPTH.md (statuses, kits, tuning), UX_SPEC.md (drag, HUD grid, pause, fullscreen), JUICE.md (animation language, hit tiers, sequences). Post FX prototype: /tmp/claude-0/-home-user-Games/2d970048-5ad2-5fe3-9283-45242a3d6a9d/scratchpad/post.js (+ index.html, run.cjs): WebGL2 chain texImage2D -> threshold -> dual-filter downsample x4 -> tent upsample -> composite (shockwave warp, chromatic aberration, bloom, lift/gain/gamma/sat grade, soft shoulder, vignette, grain, flash). Learned: flip uv.y; bloom threshold >= 0.88; the shockwave bends UI text, so exclude UI with mask rects; headless needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.

## ALREADY WIRED BY THE LEAD (do not redo)
engine/combat.js calls: seamInit/seamStep/seamEnd/seamTurnStart (engine/seam.js, stub), afflInst/afflCost/afflStartTurn/afflEndTurn (engine/afflictions.js, stub), `{per:'knots'}` value source, statuses may define a `blockBroken(A, owner, n, {amount, src})` hook, Rejection doubles prices in playCard, Infection adds Strain via `strainInfo(run, deck, extraBudget, extraStrain)` and `refreshStrain(c)` (emits `{t:'strain'}`). data/statuses_aff.js has the 12 new statuses as a SKELETON (ids, names and tooltips final). data/index.js already imports cards_thread.js, grafts_thread.js, relics_thread.js, statuses_thread.js, enemies_new1/2/3.js (empty arrays to fill). ui/post.js, ui/seam_ui.js, ui/tooltips.js, art/attacks.js are STUBS with documented signatures. core.js calls `app.afterFrame(app)` after drawing. main.js already calls installPost(app).

## EVENT CONTRACT (engine -> UI, in c.ev)
New: seamExtend {len, school, card}, seamCut {paid, school, len, card}, seamSlack {card}, seamFray {card}, seamPay {school, stitches, kind, amount}, strain {strain}. Existing events unchanged.

## GLOBAL RULES
- No em dashes anywhere. Reduced motion (meta.settings.reducedMotion) and screen shake (meta.settings.screenShake) must be honoured by every new effect (see ui/fx.js FX_OPTS). Text scale 100/125/150 is app.textScale.
- RESERVED ZONES: top-right x 1128..1272, y 0..56 is owned by the global Pause (1136,9,44,38) and Fullscreen (1188,9,44,38) buttons on every in-run screen and the title; no other widget may use it.
- Performance: 60 fps desktop; budgets in the tech memo (2D 4 ms, lights 0.5, particles 1, post 1). No per-frame array allocation in hot paths, no per-particle shadowBlur, no ctx.filter in the frame loop (Safari lacks it).
- Tests: only the Graftwork suites matter (`node tests/run_graftwork.mjs`, auto-discovers tests/graftwork_*.test.mjs). Never run other games' tests. Keep it green and under ~90 s total. Add a test for your module. New test files named tests/graftwork_<area>.test.mjs.
- Looking: Playwright is installed (`const {chromium}=require('playwright')`, pass args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] when WebGL matters); serve the repo with `python3 -m http.server <YOUR PORT>` from /home/user/Games; window.__gw.app / window.__gw.flow exist. READ screenshots with the Read tool. Screenshots go in the scratchpad dir, never the repo.
- Do NOT commit or push; the lead commits. Do not run `git` mutating commands. Final reply: under 150 words via SubagentHandback.
- You have limited tool turns (about 20): batch commands, write whole new files in one go, test once, screenshot once or twice, then report. Report what is DONE and what is LEFT honestly.

## SHARED-FILE PROTOCOL for ui/combat.js (1250 lines, several agents edit different regions)
NEVER rewrite or re-create the whole file. Make targeted replacements anchored on unique text (python str.replace with an assert, or the Edit tool), re-reading the exact region immediately before editing; keep each edit small. Only touch the functions your assignment names. If your change needs another region, do the minimal call-site edit and say so in your report. The same applies to ui/core.js, art/enemies.js, art/cards.js and data/enemies_*.js when more than one agent is listed for them.

## OWNERSHIP (one row per builder; only edit your files)
E1 Thread engine: engine/seam.js, engine/resonance.js, engine/cards.js (add `schoolsOf` only), data/statuses_thread.js, tests/graftwork_seam.test.mjs
E2 Afflictions engine: engine/afflictions.js, data/statuses_aff.js, tests/graftwork_afflictions.test.mjs
E3 Thread content: data/cards_thread.js, data/grafts_thread.js, data/relics_thread.js, data/heroes.js (Thread passives only)
E4/E5/E6 Enemy depth Act 1 / 2 / 3: data/enemies_1.js / _2 / _3.js (upgrades, bosses and elites) + data/enemies_new1/2/3.js + data/statuses_e1/e2/e3.js
U1 Post FX: ui/post.js (+ ui/post_shaders.js), tests/graftwork_post.test.mjs
U2 Lights and particles: ui/lights.js, ui/fx.js, tests/graftwork_fx.test.mjs
U3 Pause menu and fullscreen: ui/pause.js, ui/fullscreen.js, ui/title.js, ui/settings.js, main.js
U4 Layout registry and non-combat screens: ui/layout_registry.js, ui/map.js, graft.js, graft_parts.js, shop.js, forge.js, event.js, reward.js, deckview.js, codex.js, end.js, tests/graftwork_ui_layout.test.mjs
U5 Combat hand, drag, aim: ui/combat.js (hand, input, drag, aim, preview regions: layoutHand, drawHand, updateInput, dropDrag, clickAt, tryPlay, selectCard, drawAimArrow, drawPlayZone, drawCardInfo), ui/combat_layout.js, tests/graftwork_ui_combat.test.mjs
U6 Combat HUD and tooltips: ui/combat_hud.js, ui/tooltips.js, and the HUD regions of ui/combat.js (drawTopBar, drawHudBottom, drawEnemyHud, drawHeroAndHud, pileStack)
U7 Thread UI: ui/seam_ui.js (+ the rail rect in combat_layout.js and the calls into seam_ui from combat.js draw()/handle())
U8 Core chrome: ui/core.js, ui/chrome.js
A1 Card art: art/cards.js
A2 Enemy renderer: art/enemies.js (rim light, shadows, rig hook consuming art/attacks.js)
A3 Attack rigs: art/attacks.js
A4 Heroes and backgrounds: art/heroes.js, art/backgrounds.js
A5 Icons: art/icons.js
J1 Juice director: ui/juice.js plus the event-handler and ending regions of ui/combat.js (handle, onDmg, onKill, onStatus, onPlay, startEnding, updateEnding, finalize, vignette)
J2 Audio: ui/audio.js, tests/graftwork_audio.test.mjs
