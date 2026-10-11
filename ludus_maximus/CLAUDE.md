# Ludus Maximus (gladiator school manager)

Static game, no build step: `data.js` (tables) -> `sim.js` (pure logic, tested) -> `art.js` (SVG) -> `ui.js` (tabs/modals) -> `play.js` (week flow, fight screen). Play: https://games-71g.pages.dev/ludus_maximus/
- Save key `ludus_maximus_v1` (never rename). Tests: `npm run test:ludus` (sim only, no DOM).
- Core ideas: 5-style pentagon (each beats 2), scouting fog by Scout Tower level, building adjacency synergy, gear merge/sets/affixes, weekly plan, tournaments with carry-over HP, team clashes with style synergies, mercy recruits rivals, legends + laurel ascension.
- Fixtures are deterministic from `S.seed + week + league` (opponents are regenerated, not stored).
