# Graftwork design docs

Code rules and schemas live in `../CLAUDE.md`; this folder holds intent, specs and records. One line per file.

| file | what it is |
|---|---|
| THREAD.md | the Thread, the core combat rule (school chains cashed by cutting): engine/seam.js, ui/seam_ui.js |
| ENEMY_DEPTH.md | afflictions (poison, Brittle, Rejection, Infection, Numb...) and enemy kits per act: engine/afflictions.js, data/statuses_aff.js |
| WARD.md | the Ward (the hospital you build, the only game mode): rules, rooms, dice routes, balance passes, isometric view (section 12), combat art (12b), battle frames (12c), the room kit (13), room sizes and Expand (14) |
| WARD_PLAYTEST.md | the Ward playtest record (Z4): ranked findings and what was fixed |
| UNLOCKS.md | content unlock model and pacing targets: data/unlocks.js, engine/unlock.js |
| DIFFICULTY.md | the owner's difficulty rule, the skill tiers and their targets (tools/graftwork_tiers.mjs, the `difficulty` suite) |
| CARD_AUDIT.md | deck-building quality per hero: each card forced into the starter deck, what was re-themed (tools/graftwork_cardsweep.mjs) |
| UX_SPEC.md | combat input (drag, play line), readability, HUD grid, pause, fullscreen, phone rules, layout registry |
| JUICE.md | animation language, hit tiers, card choreography, timing budgets (`motion` suite), the creative director's juice rules |
| ART_BIBLE.md | the Anatomical Plate look: palette, line, silhouettes, school glyph shapes, UI chrome |
| ART_MODULAR.md | the modular art system: parts, manifest schema, card template slots, what is built (painted UI parts), character rigs (section 7) |
| ART_SHOPPING_LIST.md | the generation list of the modular parts (ids are manifest ids); the ART_SYNC.md it names lives on the art branch, not on main |
| ANIMATOR_GUIDE.md | rules for judging and fixing the puppet walk and garments; rigs (section 6) |
| PERF.md | how performance is measured (tools/graftwork_profile.mjs), the two perf rounds and the cleanup's fixes |
| PERF_BASELINE.json | profile dump before the phone and perf work (commit 05a40134), quoted by PERF.md |
| PERF_R2_AFTER.json | profile dump after perf round 2, with the A/B runs, quoted by PERF.md |
| PLAYTESTS.md | dated records of four earlier reads (first hour, second hour, late game, art review) from the Classic map era |
| CLEANUP_PLAN.md | the cleanup and optimisation (PRs #2715 to #2727): a summary with the final numbers, then the Results of every phase |
