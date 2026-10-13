# Blockmates

Original 2D block sandbox for up to 16 players. Read [README.md](README.md) for the layout and hosting. The game page lives at
`https://games-71g.pages.dev/blockmates/` and is served as-is (no build): edit the files and commit.

Rules for this folder:
- **Append only**: block ids (< 256) and item ids (>= 256) in `shared/data.js` are stored in saves. Never reorder or delete.
- `shared/` and `server/world.js` must stay free of DOM and Node APIs (they run in the browser for solo play and in a Worker).
- One simulation, three hosts: `server/node.js`, `server/cf/worker.js` and `client/net.js` (LoopNet) all drive `World`.
- No art files: everything is painted in `client/art.js`; new block => painter there, new item => `paintItem`.
- Never copy code or art from the commercial game this genre grew from. Names, art and mobs here are original.
- Tests: `npm run test:blockmates` (headless, includes 16 players). Browser check: start `node blockmates/server/node.js`
  and open http://localhost:8787/ (playwright chromium at /opt/pw-browsers works); `window.__bm` is the Game instance.
