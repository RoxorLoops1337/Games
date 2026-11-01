# SUNBEAM SIEGE (Monster Train style cat deck builder)
Plain HTML/CSS/JS, classic scripts on window.SB, no build step, must work from file://.
Read NOTES.md (how to play), design/RULES.md (locked rules) and design/API.md (module contract) before changing anything.
Run all tests before and after edits: for t in tests/*.js; do node $t; done
New engine ops go in src/engine/ops-*.js (auto-loaded, see design/C1-engine-notes.md).
Combat never uses Math.random (seeded RNG only). Data lives in src/data, engine in src/engine, UI in src/ui, art in src/gfx.
Browser QA scripts are in demo/ (serve with python3 -m http.server 8123, Playwright needed).
Writing rule: never use em dashes or en dashes in code, UI strings or docs.
Balance: tests/balance-sim.js (bot). Rank 0 field win rate target 25 to 40 percent, each clan and champion 15 to 50 percent.
