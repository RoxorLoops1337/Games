Character Studio (`/character_creator/`): a chibi character creator in the Hocus Vocus art style. Plain scripts, no build.
- It loads the game's art kit from `../hocus_vocus/js/` (util.js, art.js, art_cast_kit.js) with a stub `DATA` global; it never loads game data.
- A character is one plain object (`cc_data.js`: DEFAULT, CAT catalogs, RANGE sliders). Option ids are saved in share links and files: append only, never rename.
- Parts: `cc_hair.js`, `cc_face.js`, `cc_outfit.js`, `cc_acc.js` draw into an `ART.rj.rig` spec built by `cc_figure.js`. UI in `cc_app.js`, exports in `cc_export.js`.
- No animal products (bible rule 12): no leather, fur, wool, silk, feathers, pearl as materials.
- Test: `npm run test:creator` (headless Chromium; every option of every catalog is drawn).
