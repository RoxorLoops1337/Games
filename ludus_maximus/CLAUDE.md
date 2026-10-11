# Ludus Maximus (gladiator school manager)

Static game, no build step: `data.js` (tables) -> `sim.js` (economy/gladiators/items, tested) -> `arena.js` (real-time 2D combat engine, tested) -> `art.js` (SVG) -> `ui.js` (tabs/modals) -> `fight.js` (arena renderer: DOM sprites + canvas FX, shake/hit-stop/slow-mo, ultimate buttons) -> `play.js` (week flow, prep, augment picks, results, Pit). Play: https://games-71g.pages.dev/ludus_maximus/
- Save key `ludus_maximus_v1` (never rename). Tests: `npm run test:ludus` (sim only, no DOM).
- Combat: fights are simulated (movement, range, attack speed, windups); skills auto-cast, the player taps ULTIMATES. Build layers: gear affixes, 1 keystone + 2 minor runes, masteries (lvl 5/10/15/20), augments (pre-fight pick, Silver/Gold/Prismatic), relics (ludus-wide). Style matchups are a small +10%/-8% only; stances are build presets, NOT counters (user dislikes counter mechanics). Stays 2D on purpose (phone perf, bold flat art).
- Core ideas: 5-style pentagon (each beats 2), scouting fog by Scout Tower level, building adjacency synergy, gear merge/sets/affixes, weekly plan, tournaments with carry-over HP, team clashes with style synergies, mercy recruits rivals, legends + laurel ascension.
- Fixtures are deterministic from `S.seed + week + league` (opponents are regenerated, not stored).
