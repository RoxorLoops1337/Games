# China landing page and stage screen (RoxorLoops & Jasmin)

- `/china/`: bilingual landing page for China (WeChat friendly). `/china/stage/`: full-screen stage backdrop with a QR card, plus `stage/stage-offline.html` (the same page with every image inlined, for venues without internet; rebuild it whenever `stage/index.html` or `stage/art/` changes).
- China rules: every file is local. No Google, YouTube, Facebook or other hosts that are blocked in China. Never use em dashes in any text.

## Chibis: always the owners' cartoons from their Google Drive
The owners asked that every chibi comes from their Drive files, not from the Hocus Vocus chibi kit (`tools/hocus_vocus/rj_art`) and not from the old 3D chibis on their website:
- `R&J Cartoon - RoxorLoops.png`, `R&J Cartoon - Jasmin.png`, `R&J Cartoon - Both.png` (Drive, the "R&J Cartoon" files)
- Stickers in the same folder: `R&J Sticker - Mid Shot.png`, `R&J Sticker - Name.png`, `R&J Sticker - Card.png`, `R&J Sticker - Card Cute.png`, `R&J Sticker - Microphone.png`

In this folder they are `img/d-roxor.webp`, `img/d-jasmin.webp`, `img/d-both.webp`, the peekers `img/g-roxor.webp` and `img/h-jasmin.webp` (full-body, Jasmin NOT flipped: the owners checked the right-side peeker and want her the original way round): they swing in from the side edges, Roxor left and Jasmin right, pivoting on their feet just off-screen and leaning about 25 degrees into the page (pivot on the feet, just past the edge) so the head, shoulders and mic come in and nothing is ever cut so only the head and shoulders come past the screen edge, so no cut edge ever shows. The scroll rider and logo-tap rain use the chest busts `img/f-bust-*.webp`. Also `stage/art/d-roxor.webp`, `stage/art/d-jasmin.webp`.

## Logo
The newest logo has a heart on Jasmin's i ("R&J text logo.png" in Drive). `stage/art/logo-sticker.webp` is that logo with its white sticker outline, cut out of the designer's "R&J - Stage Background" sheet.

## Images are cached for a day
`_headers` caches `/china/img/*` and `/china/fonts/*` for a day. When an image changes, give it a NEW file name so phones pick it up at once.
