# Graftwork design docs

Index. Code rules and schemas live in `../CLAUDE.md`; this folder holds intent.

| doc | read it when |
|---|---|
| THREAD.md | touching engine/seam.js, school payouts, the Line rail (ui/seam_ui.js) or Thread onboarding |
| ENEMY_DEPTH.md | adding an enemy, an affliction (poison, Brittle, Rejection, Infection, Numb) or tuning damage per act |
| ART_MODULAR.md | the modular art system: parts + manifest + templates, inventory, rig animation; ART_SHOPPING_LIST.md is its generation list |
| ART_BIBLE.md | drawing anything: the Anatomical Plate look, palette, silhouettes, school glyph shapes |
| UX_SPEC.md | combat input (drag, play line y=420, targets), HUD grid, pause, fullscreen, phone rules, layout registry |
| JUICE.md | hit tiers, camera shake, hit-stop, multi-hit counter, card choreography, timing budgets (tests/graftwork_motion) |
| BUILD_PLAN.md | historical: which agent owned which file in round 4. Ownership rules in CLAUDE.md supersede it |

Where the code for each doc lives: THREAD -> engine/seam.js + ui/seam_ui.js; ENEMY_DEPTH -> engine/afflictions.js + data/statuses_aff.js; UX_SPEC -> ui/combat.js, ui/combat_hud.js, ui/combat_layout.js, ui/layout_registry.js; JUICE -> ui/juice.js, ui/fx.js, ui/post.js, art/attacks.js; ART_BIBLE -> art/*.js.
