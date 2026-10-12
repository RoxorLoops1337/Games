# Ludus Maximus 3D roadmap

Team (agents with file ownership): Character (gladiator.js, gear.js) · Environment (env_arena.js, env_ludus.js, post.js, materials.js) · VFX/Feel (fx.js, feel.js) · Audio (audio.js) · UI/Cinematics (ui/, css/, director.js) · Lead (main.js, flow.js, fightview.js, tests, integration).
Skills written by the team live in `.claude/skills/ludus3d-*`.

## Phase 0: foundation (done)
- [x] Fork sim core (data/sim/arena) with own save key, tests (`npm run test:ludus3d`)
- [x] Art bible, build + check-changed registration, draft PR

## Phase 1: research + reference modules (agents, running)
- [ ] Character rig + animation skill
- [ ] Environment + lighting + post skill
- [ ] VFX + game feel skill
- [ ] Procedural audio skill
- [ ] UI kit + fight cinematography skill

## Phase 2: vertical slice (one 1v1 fight in a gorgeous arena)
- [ ] main.js renderer, quality governor, test hooks (window.__LM3D)
- [ ] gladiators x5 styles in the arena, driven by core/arena.js
- [ ] fight camera director, FX bindings, audio bindings, HUD
- [ ] screenshots reviewed against scorecard

## Phase 3: the ludus hub (3D buildings, orbit camera, ambient life)
## Phase 4: full management loop (recruit, plan week, entries, prep, results, tournaments, level-up picks)
## Phase 5: depth (armory/forge, market, runes, relics, augments, visitors, rivals, sponsors, festivals, seasons)
## Phase 6: polish (title cinematic, ceremonies, photo mode, accessibility, perf tiers, mobile pass)
