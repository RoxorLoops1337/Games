# Graftwork

"Cut what you love. Stitch what you need." A roguelike deckbuilder in which you never add cards. After each fight you pick one of your own cards and sew one graft onto it. Every graft is a boon with a price. Play it at `https://games-71g.pages.dev/graftwork/`.

Plain ES modules on one 1280x720 canvas, no build step. Every run is a Ward run: the hospital you build room by room is the map. Cards, icons and the interface are drawn procedurally and audio is synthesized with WebAudio; the Ward's rooms and characters are generated WebP art under `assets/`.

## Run it locally
```
python3 -m http.server 8123          # from the repo root
# open http://localhost:8123/graftwork/
```
`window.__gw.app` and `window.__gw.flow` are exposed for scripting.

## Test it
```
node tests/graftwork_data.test.mjs   # content gate, run after every data edit
node tests/run_graftwork.mjs         # all 71 suites, 4 workers, a few minutes (npm run test:graftwork)
node tests/run_graftwork.mjs --times # same, plus a per-suite timing table
```
Never run other games' suites for a Graftwork change. Balance and audio tools are in `tools/graftwork_*.mjs`.

## Design pillars
- **Graft = boon + price.** Nothing is free. Each graft has a Weight (1 to 3) and a local price (cost up, exhaust, self damage, jam, junk, slower draw, lost max HP). Offers come in three tiers: safe, greedy, weird.
- **Budget / Strain / Tithe.** The deck has a Budget (6 plus relics, Forge Expand, or skipping a graft). Weight over Budget is Strain, and each Strain point Tithes a Bare card (fights at -25%). The UI shows who will be tithed before you commit. Strain with no Bare card left is Backfire, which jams grafted cards in your opening hand.
- **Overload.** A third graft on one card weighs +1, multiplies its numbers by 1.5, and risks a 25% Shatter on first play each combat (the card resolves, then is destroyed for the run).
- **Temper.** At the Forge the hammer fuses a card's patches into the card for good. Boons and prices stay, slots empty, the card stops being an Overload, each fused graft weighs 1 less, and the card is no longer Bare.
- **The Thread.** Chain cards of one school to extend the Line, then cut it to cash the school's payout. Caps keep it honest: 3 paying cuts per turn, Line length 5.

Contributors and agents: start with `CLAUDE.md` (module map, schemas, hooks, tests, balance tools, edit protocol) and `design/README.md`.
