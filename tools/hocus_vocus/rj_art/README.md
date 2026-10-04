# The owners' chibi cast (approved kit)

The drawing kit for the Hocus Vocus heroes, written in canvas code and approved by the owners (the duo, RoxorLoops and Jasmin).
It is the source that phase P3 ports into `hocus_vocus/js/art_cast_kit.js` and `hocus_vocus/js/art_cast.js`.

| File | What it is |
|---|---|
| `kit.js` | the shared chibi rig: `RJ.register`, `RJ.draw`, `RJ.bust`, `RJ.rig(spec)`, the face, hair, hand, mic, pose and effect helpers (its header comment is the manual) |
| `roxor.js` | RoxorLoops (`roxor`) and his monster onesie (`roxor_monster`) |
| `jasmin.js` | Jasmin (`jasmin`) and her unicorn onesie (`jasmin_unicorn`) |
| `crew.js` | RawClaw (`rawclaw`, `rawclaw_goat`), Andy (`andy`) and Jordan (`jordan`) |
| `sheet.js`, `index.html`, `render.mjs` | a contact sheet page and a headless renderer: `node tools/hocus_vocus/rj_art/render.mjs "sheet=mains&w=1600&h=900" out.png` (sheets: all, mains, poses, busts, crew) |

Notes
- The reference images (the owners' own chibi cards and two photos of real people) are NOT in the repository on purpose.
- Everything here is drawn in code with the game's art toolkit (`hocus_vocus/js/art.js`); there are no image files.
- The kit uses no unseeded random call and no clock: animation takes the `t` you pass in.
