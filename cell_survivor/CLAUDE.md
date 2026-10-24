# Cell Survivor (folder `cell_survivor`, save key `cell_survivor_meta_v1`)

One self-contained `index.html` (simulation + canvas drawing + DOM screens) plus `hv/`.

- **Look**: the RoxorLoops & Jasmin "chibi candy" style of Hocus Vocus (`hocus_vocus/ART_BIBLE.md`): warm brown outline `#2d170f`, flat colour + one hard cel shadow (light from the upper right), cream die-cut rims, big eyes with a catchlight, sparkles and notes, chunky rounded text. All germs, pickups, effects and the stage floor are canvas paths in the `ART` section of the script.
- **The duo** is drawn by the Hocus Vocus cast kit in `hv/` (`util.js`, `shim.js`, `art.js`, `art_cast_kit.js`, `art_cast.js`: copied unchanged from `rustgrift/js/hv/`, do not edit; `shim.js` stands in for Hocus Vocus' `data.js`). The player stands in a soap bubble (the "cell"); the DUET ultimate (old mitosis, key `E`) summons the partner of the chosen costume. Costumes live in `HEROES` (ids must exist in `ART.rj.ids`); the pick is `meta.hero` and is purely cosmetic.
- Figures are re-rendered to an offscreen frame 16 times a second (`heroSprite`) and blitted every frame: the cast kit costs ~3 ms per figure in software raster.
- **Art must stay cosmetic**: never call `rnd()`/`rr()`/`ri()`/`pick()` from a draw function (the seeded stream is the replay contract); use `frnd()`. If the cast kit fails to load the hero falls back to a plain cartoon face, never a crash (the headless suite runs both ways).
- Do not rename the save key, ids of strains/weapons/enemies, or the `CS` hooks the suite uses.
- Check: `npm run test:cells`. Visual check: open the page in Chromium; `window.CS` lets you spawn every germ/boss (`CS.spawnEnemy(kind, x, y)`, `CS.spawnBoss(i)`) and pause with `CS.G.state = 'pause'`.
