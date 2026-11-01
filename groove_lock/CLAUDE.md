# Groove Lock

Loop puzzle with RoxorLoops & Jasmin. Plain ES modules, no build. Link: `https://games-71g.pages.dev/groove_lock/`.

- `core.js` pure rules + 0-1 BFS solver (par, hints). `levels.js` data. `audio.js` Web Audio synth + sequencer. `game.js` canvas UI. `rj-cast.js` is the approved Roxor/Jasmin art kit (copy of LoopDoku's).
- Level ids are save keys (`groove_lock_save_v1`): never rename or reorder. Lorry deals were found with the solver; if you change a level, update `PARS` in `tests/groove_lock_core.test.mjs`.
- Tests: `npm run test:groovelock` (core + real Chromium, incl. an offline audio render that checks levels, clipping and balance).
- Known gap: landscape phones are cramped (portrait game).
