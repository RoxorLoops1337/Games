# Cell Serpent

A Cell Survivor - Shoot Defense style game, with RoxorLoops & Jasmin as the cell.

How the real game works (from store listings and community guides) and how this clone maps to it:

| Cell Survivor | Cell Serpent |
|---|---|
| Vertical, one-handed. A segmented virus crawls down the screen; destroy its segments before it reaches the bottom. | A virus rides a winding lane down to the membrane (`LINE_Y`). A segment that reaches it leaks and hurts. |
| Each chapter is a different named virus boss, with segment HP and a head weak spot. | `virusName(n)`, five skins, a boss every 5th chapter. Cutting a middle segment splits the virus in two. |
| The cell spawns at the bottom or in the centre, depending on the stage. | `spawnMode(n)`: odd chapters bottom, even chapters centre. You move only inside the spawn zone. |
| Always-on Capsule, plus skills picked 1 of 3 at level-ups and from chests. | Capsule (music notes) plus nine skills, each Lv 1 to 5, and six passives. |
| Skills: Sterile Swab (targets the head), Spinning Daggers, Medical Tower, Snot Dragon, Acupuncture, Massage Stick, Disinfectant Bubble, Satellite Storm (% HP), Abyssal Maw (execute). | All nine in `sim.js` (`WEAPONS`). The first four are free, the rest are unlocked with coins. |
| Chests at 25%, 50% and 100% of stage progress. | Chests drop at 25% and 50% of the virus HP and one more on clear. |
| Coins upgrade Attack, Crit and Cooldown permanently. | Same three stats in the shop, plus Vitality, Fortune and Second Wind. |

Files: `sim.js` (pure simulation), `art_draw.js` (all art, drawn in code in the Hocus Vocus chibi
candy style), `render.js`, `audio.js`, `main.js` (input, screens, save), `assets/` (the duo PNGs).
Tests: `npm run test:serpent`.
