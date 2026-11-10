# ART MODULAR: everything is parts, the game composes them

Owner direction: make EVERYTHING modular like the Ward room kit. The Ward kit (WARD.md 13) already works this way: floors, walls, pieces and props are separate images, `data/ward_kit.js` holds recipes, `ui/ward_kit_iso.js` composes. This document extends the idea to cards, UI chrome, icons, bars, actors, backgrounds, logo and VFX. The ordered list of images to generate is in ART_SHOPPING_LIST.md.

## 1. Principles

1. **Assets are parts, code composes.** A part is one image with a role (frame, gem, icon, limb). Text, numbers, art windows and state are drawn by code on top. Never bake text, numbers, names or costs into an image.
2. **Manifest driven.** `assets/ui/manifest.json` names every part and its geometry (slice margins, content rect, atlas rect, baked slots, slot overrides). Dropping a new frame in is a manifest edit, not a code change.
3. **Every part has a procedural fallback.** If the manifest or an image is missing, still loading, or the run is headless, the existing canvas drawing runs unchanged. The game always works; art only upgrades it. A test proves the fallback draws the exact same calls as before (`tests/graftwork_templates.test.mjs`, hash of 131933 canvas calls).
4. **Lazy and cheap.** Manifest fetched once, images requested on first use, @1x on phones and @2x on desktop, results cached. Card faces are baked into an offscreen canvas as before; the cache key gains the frame id only when a frame is used.
5. **One look.** All parts follow ART_BIBLE.md: engraved plate on vellum, brass `#C9A227` body / `#7A5F12` shade / `#FFF1B0` specular, black thread `#0E0E0E` only for stitches, ONE key lamp from the upper left, hatching not gradients, school colours as spot colour with a SHAPE glyph. Parts must be lit from the upper left with no baked cast shadows (code draws contact shadows).
6. **Gradual.** A single frame can ship alone (say only `panel`). Resolution of ids goes from specific to generic, so one generic `card_front` can cover everything until specific ones arrive.

## 2. What is built (code)

| piece | file | what |
|---|---|---|
| loader | `ui/templates.js` | `templates` singleton (off until `TEMPLATE_ART` is set, section 5): lazy manifest + image cache, `frameImg(id)`, `pickFrame(ids)`, `iconImg`, `drawIcon`, `preload`, headless no-op, injectable `fetchJson`/`makeImage` for tests |
| parse | `parseManifest` | validates every entry, drops bad ones (absolute or `..` paths, bad slices, missing atlas) and keeps the rest |
| 9-slice | `sliceRects`, `drawNineSlice`, `contentRect` | slice margins in logical px, shrink together when the target is smaller, no-centre option, content rect keeps native insets |
| slots | `resolveSlot(s)`, `CARD_TEMPLATE`, `mergeTemplate` | anchor/pivot/offset or absolute rects, repeat with `step` and `n`; default template = the procedural layout |
| composer | `composeCardFront`, `FRONT_ORDER` | draws frame then calls painters per slot; `baked` slots skip their own plate |
| fit | `fitFontSize` | pure largest-font-that-fits; slots carry `fit:{max,min,lines}` |
| cards | `art/cards.js` | `drawCard` / `drawCardBack` use a template face when a frame decoded, else the old code (`renderFace`, `renderBack` untouched in behaviour) |
| chrome | `ui/chrome.js` | `app.panel` and `app.button` draw a 9-slice skin when frames `panel`, `button`, `button.<state>` exist; `o.frame` picks another id, `o.frame === false` or `o.plain` opts out |
| rig | `ui/rig.js` | skeletal runtime for layered characters (section 7) |

Card frame resolution (first decoded wins): `card_front.<type>.<rarity>.<school>`, `card_front.<type>.<rarity>`, `card_front.<type>`, `card_front.<rarity>`, `card_front`. Backs: `card_back.<back>.<hero>`, `card_back.<back>.act<N>`, `card_back.<back>`, `card_back.<hero>`, `card_back.act<N>`, `card_back`. Optional parts: `card_gem` (cost gem image), `card_foil` (overlay for rares). `drawCardBack(ctx,x,y,{hero,act})` takes the variant options.

### Card template slots (card space, origin at the card centre, 220x310)

| slot | default rect | notes |
|---|---|---|
| window | -90,-112 180x90 | art window; compact `windowCompact` 118 high, `windowCompactGrafts` 70 high; the foil and parallax clip to it |
| namePlate | -58,-142 150x27 | `fit` 17 to 9.5 pt, 1 line; compact -56,-150 160x44, 2 lines, 26 to 20 pt |
| typeBand | -43,-30 86x18 | full face only; grows to the label |
| textBox | -88,2 176x141 | rules, price, flavor; `layoutText` fits 15 down to 8 pt |
| costGem | centre -98,-141 r20 | compact centre -96,-139 r25; live (specular follows the lamp) |
| graftSlots | 3 x 34x30, centres (114, 28/72/116) | full face; tier pips of grafts stay in the patch |
| graftBand | -86,46 172x38 | compact face chips |
| fusedSlots | 4 x 18x18, centres (-107, 30+24i) | compact y 8+24i |
| typeGlyph / schoolGlyph | centres (-76,130) and (76,130) | compact face |
| pips | -30,134 60x10 | rarity pips (template mode only, procedural has none) |
| keyNumber | derived: strip under the window | compact big number |
| foil | = window | `card_foil` part slides over the card for rares |

A frame can move any slot by itself: `frames["card_front.attack.rare"].slots = {window:{x:-86,y:-110,w:172,h:96}}`; `templates.card_front.slots` changes it for every frame. `baked: ["namePlate","typeBand"]` says the frame image already contains those plates, so code only writes the text.

## 3. Inventory and composition

| area | parts | composed how | status |
|---|---|---|---|
| Cards, front | frame per type x rarity (10), optional school variants, `card_gem`, `card_foil`, `school_gem.<school>` | frame + window illustration (procedural motif for now, later illustrations) + plate text + type band + rules text + graft patches + fused rivets + pips + live layers (lamp rim, sweep, foil, cost gem) | code done, art todo |
| Card backs | 8 back ids, hero variants (3), act variants (2) | one image, title plate text by code | code done, art todo |
| Graft patch tiles | `graft_patch` 9-slice per tier | tile frame + glyph + text | later (same slot machinery) |
| Deck / graft UI chrome | `panel`, `panel.parchment`, `modal`, `banner`, `tab`, `toggle`, `slab.title`, `tooltip` | 9-slice by `app.panel` ids; titles and body text by code | panel/button hook done |
| Buttons | `button.normal/hover/down/disabled`, `button.small` | 9-slice per state, label by code, 2 px press travel kept | hook done |
| Icons | sheets: status (80 ids), intents (12), rules (16), currency, schools (7), rarity, map nodes, relics (113), potions (27) | atlas rect per id, `drawIcon(ctx,id,x,y,w,h)` fits; procedural `art/icons.js` stays the fallback per id | loader done, call sites next |
| Bars and widgets | `bar.hp.frame` + `bar.hp.fill`, `dial.energy`, `plate.block`, `gauge.budget`, chips | frame image, fill clipped by a fraction, needle/number by code | todo (step 4) |
| Actors | standing sprite (done for 27), then rig parts for humanoids (7), creature pose sheets, overlays (poison, burn, bleed...), aura ring | base + status overlays tinted and pulsed by code + ground aura + contact shadow | rig runtime done |
| Backgrounds | per act: far wall, floor texture, prop sheet; map atlas page; title keyart | layered parallax (far, props, floor) as ART_BIBLE; Ward room kit already done | todo |
| Logo | wordmark letters, thread, needle | procedural wordmark stays; parts only if better | optional |
| VFX | per school sheet (burst, trail), common sheet (slash, shatter, seam, dust), glows | pooled sprites replace glow dots (ART_BIBLE: pre-baked glow sprites) | todo |
| Ward room kit | floors, walls, pieces, props | done, see WARD.md 13 | done |
| Ward building cards | `frame.building_card` + room dioramas as window art | same composer, window = diorama | todo |
| Relic / potion / event plates | `frame.relic_plate`, `frame.event`, relic and potion sheets | plate frame + icon + text | todo |

## 4. Sizing and format

- Logical size is the 1x size. Generate at 2x, ship @1x and @2x WebP (and @3x only for hero combat art). Files under `assets/ui/`, ids use dots (`card_front.attack.rare`), file names use underscores: `ui/card_front_attack_rare@2x.webp`.
- Card frames: 880x1240 source, logical 220x310, one image, no slicing (stretch only for the cost of a slightly different aspect). Panels, buttons, tooltips, modals: 9-slice, corner and edge art at least `slice` px wide and symmetric; typical slices 12 to 56 logical px.
- Transparent window: frames are generated with the window as flat magenta `#FF00FF`; the build tool keys it to alpha. Textures (floors, backgrounds, foil) are opaque.
- Sprites and icons: magenta background, chroma-keyed by `tools/graftwork_chroma.mjs`, trimmed with 2 px padding, premultiplied-safe edges (no magenta fringe: defringe pass).
- Sprite sheets cut into single webp, then **atlas packed** per theme (`ui_icons`, `ui_chrome`, `ui_vfx`): one image, one request. Parts reference `atlas` + `rect` in logical px. Budget: each atlas at most 2048x2048 @2x, whole `assets/ui/` at most 8 MB.
- Rig parts: one atlas per character, parts trimmed, pivot per part in the rig json.
- Palette and light: ART_BIBLE palette per act, lit from the upper left (L = -0.75 pi), no baked shadows, rim light only as a thin highlight, black thread only for stitches.
- Naming: `<area>.<name>[.<variant>]`, lowercase, `a-z0-9_` words, states as last segment (`button.hover`). Never rename a shipped id (saves and cosmetics may refer to back ids).

## 5. Manifest schema (`graftwork/assets/ui/manifest.json`)

```json
{
  "version": 1,
  "atlases": { "ui_chrome": { "file": "ui/chrome@1x.webp", "file2x": "ui/chrome@2x.webp", "w": 1024, "h": 1024 } },
  "frames": {
    "panel": { "file1x": "ui/panel@1x.webp", "file2x": "ui/panel@2x.webp", "w": 96, "h": 96, "slice": [24, 24, 24, 24], "content": { "x": 20, "y": 20, "w": 56, "h": 56 } },
    "button.hover": { "atlas": "ui_chrome", "rect": [0, 0, 128, 48], "slice": [16, 16, 16, 16] },
    "card_front.attack.rare": { "file2x": "cards/front_attack_rare@2x.webp", "w": 220, "h": 310, "baked": ["namePlate"], "slots": { "window": { "x": -86, "y": -110, "w": 172, "h": 96 } } },
    "card_back.plain": { "file2x": "cards/back_plain@2x.webp", "w": 220, "h": 310 }
  },
  "icons": { "status.poison": { "atlas": "ui_icons", "rect": [64, 0, 32, 32] } },
  "templates": { "card_front": { "slots": { "textBox": { "y": 6, "h": 136 } } } }
}
```

- `file` / `file1x` / `file2x`: relative paths (no `..`, no leading slash). `w`,`h` = logical size. `slice` = `[l,t,r,b]` logical margins, `fill:false` drops the centre. `content` = child rect inside the frame. `atlas` + `rect` replace the files. `baked` = slot names already in the image. `slots` = per-frame slot overrides. Bad entries are dropped individually.
- Slot grammar: `{x,y,w,h}` in card space or `{anchor:[ax,ay], pivot:[px,py], dx, dy, w, h}`, repeats with `step:{x,y}`, `n`; `fit:{max,min,lines}`.
- Existing `assets/ward/manifest.json` and `assets/ward_kit/manifest.json` stay as they are.
- **The switch.** `ui/templates.js` exports `TEMPLATE_ART`, currently `false`: no `assets/ui/manifest.json` exists yet, and asking for it was a 404 on every page load. While it is `false` the loader requests nothing (not the manifest, no image) and every caller draws its procedural look. Set `TEMPLATE_ART = true` in the same commit that adds `graftwork/assets/ui/manifest.json`; nothing else has to change. Tests and tools that feed the loader themselves pass `{ art: true }` to `createTemplates` or `templates.configure`. `tests/graftwork_perf3.test.mjs` fails if the switch is off while the manifest exists or a request is made while it is off.

## 6. Production order

1. `card_front.*` for attack, skill, power, junk at common (4), `card_gem`, `card_back.plain`; `panel`, `button.*`; `rig.guide_pose`, `rig.marrow/wick/odile`. First visible change: cards and buttons in painted frames, heroes with a real step.
2. Rarity frames (uncommon, rare), `card_back` variants, `tooltip`, `modal`, intents and rules icon sheets, `school_gem.*`, HP vial and energy dial.
3. Status icon sheets, actor overlays, Act 2 and 3 enemies, humanoid rigs, backgrounds, VFX sheets, title keyart, event and building frames.
4. Relic and potion sheets, logo parts, remaining polish.

Each step ships on its own because of the fallbacks. After each delivery: build tool writes the manifest, `tests/graftwork_templates.test.mjs` plus the art suites stay green, eyeball with Playwright.

## 7. Character animation

Problem: AI walk frames look bad because feet do not alternate (a step needs one foot forward, then the other, and image models do not hold left/right consistently). Treat it as a modular problem instead of a frame problem.

### Options, ranked

| | approach | needs from art | cost | consistency risk | verdict |
|---|---|---|---|---|---|
| A | **Layered rig.** Each character drawn as separate parts; the game animates them with a real step cycle in `ui/rig.js` | one parts sheet per character (about 16 parts on magenta) plus pivots | about 1 generation per character plus 1 to 2 retries; no per-frame generations; any new animation (walk, attack, hit) is free afterwards | parts must share scale and style; limbs must be straight with hidden overlap; joints can look cut-out if overlap is wrong | **Recommended for heroes and humanoids** (3 heroes, candy_striper, knitter, ward_clerk, night_nurse, orderly, matron, resident, npcs) |
| B | **Pose sheet.** Ask for 4 key poses on one sheet (contact L, passing, contact R, passing) with a pose reference image, then align frames | 1 sheet per creature, careful prompt, manual pick and align | low per creature, but models often fail to alternate limbs; needs a retry loop and eyeballing | high for left/right; medium for style drift | Good for creatures with many legs where alternation reads loosely (tick, wasp, rat, slime) |
| C | **Video.** Image-to-video model walk clip, extract 8 to 12 frames, align feet, remove background | clip per creature, a frame-extractor tool, chroma or matting | highest (video credits, cleanup tooling) | medium (style holds in video, but loops are imperfect and feet slide) | Fallback for creatures B cannot do; evaluate on one creature first |

Recommendation: A for every humanoid and every hero. B for creatures, with C as a spike on one creature to compare. For creatures that fail both, ship idle bob + squash + procedural lean (no frames at all); that always reads better than a wrong gait.

### Rig conventions (option A, BUILT as a preview)

The part sheets arrived (shop batches 1 and 2: the three heroes, candy_striper, knitter, night_nurse, npc_nurse, npc_patient, npc_porter) and the rigs are built: `tools/graftwork_rig_build.py` turns the raw sheets into `graftwork/assets/rigs/` (one packed atlas per character, `@1x` and `@2x`, plus `manifest.json`), `ui/rig.js` poses and draws them, `ui/rigs.js` loads them lazily, and the Ward draws them behind the preview switch `previewOn('rig', app.settings)` (`ui/preview.js`: off by default). Raw sheets are never committed.

- **Units.** One unit is one canvas px of the character's STANDING sprite (256 x 256, figure about 225 tall, feet anchor about 128, 243). The rig is assembled over the standing sprite like a paper doll, so it is drawn with the sprite's own contact point and scale and lands on the same feet at the same height. The `@2x` atlas holds one px per unit, exactly the sharpness of the standing `@2x` sprite the map draws; `@1x` is half. (Battles draw the 512 px `@3x` sprite: a battle build needs a 2 px per unit atlas, one more entry in `SIZES` of the tool.)
- **Bones.** Every rig has the same humanoid tree: `hips` (root), `torso`, `head`, `armL_up armL_lo handL`, `armR_up armR_lo handR`, `legL_up legL_lo footL`, `legR_up legR_lo footR`. A bone has its own part (a part with the bone's name) or is `empty` on purpose (a joint only: `hips`, a hand that only carries a prop, the lower bones of a limb painted in one piece). The joint of a bone is the rest position of its part's pivot on the canvas; nothing else is stored, the bone lengths follow from the joints.
- **Sides.** Bone ids are by SCREEN side: L is the limb on the left of the screen, which is the character's RIGHT and the NEAR side; R is the far side. Whether "L" in a sheet means screen left or the character's left is not reliable: it is decided by eye per sheet (the saw hand, the armband, the boot seen from the front) and written into the rig's `side` text. Marrow: the sheet's L is the screen left; the saw hangs on `handL`.
- **Parts and layers.** Parts are listed BACK TO FRONT and drawn in that order: far arm, far leg, torso, near leg, the garment (skirt, tunic, apron, coat: `hem`) over BOTH thighs so legs come out from under the cloth, head with hair and hat, prop, near arm. A one-piece dress or coat is cut at the waist by the tool into `torso` and a garment part that share one joint (`anchor`), so the near leg can sit in front of the body and still under the hem. Each part: `rect` in the atlas, pivot `px, py`, `bone`, rest position `x, y`, and optionally `hem` (cloth: from this fraction of its height down it shears and lifts with the legs, a beat late), `lag` (follow-through weight: hair, a feather, a scarf, the prop), `upright` (a flame or a tray is carried level).
- **Sheet problems the tool solves** (all in `tools/graftwork_rig_meta.json`, none in code): boxes that catch a sliver of a neighbour (`comp: "big"`), several loose pieces in one box (`comp: n`, the merged groups of candy_striper, npc_patient, npc_porter: the pieces were loose, a cut line was not needed), a straight or slanted cut (`rows`, `cols`, `poly`), pink key colour left in the paint (`despill`), parts at different scales (`s` per part), a part the sheet lacks or paints as somebody else (`box: "standing"` borrows it from the standing sprite and lists it under `borrowed`: Wick's head, because her sheet has a bald head and no hair). A limb that is ONE painted piece stays one bone (`rigid`): candy_striper and night_nurse legs, knitter's near leg, the far arms of odile, npc_patient and candy_striper.
- **Which rigs ship.** `ship: true` draws in the preview; `ship: false` is lab only and says why in `note`. Today: marrow, wick (head borrowed), odile, knitter, night_nurse, npc_nurse, npc_patient ship; candy_striper (no skirt in the sheet, loose hair instead of pigtails) and npc_porter (a slim upright boy, the sprite is stocky and leans into a bigger cart) do not: the redo list is in CLEANUP_PLAN.md "Character rigs (preview)".
- **Manifest** (`assets/rigs/manifest.json`): `{ version, unit, rigs: { id: { file1x, file2x, w, h, ship, note, side, height, bbox, foot: [x, y, width], arms: {L, R} (swing weight), prop: {part, hand}, rigid: [limbs], feet: {L: {heel, toe, sole}, R}, garment: [parts], borrowed?: [parts], bones: [{n, p, x, y, empty?}], parts: [{n, bone, rect, px, py, x, y, hem?, lag?, upright?}] } } }`. `feet` is measured by the tool from the lowest piece of each leg.
- **Adding a character.** (1) Put `rig.<id>.png` and `.parts.json` in the raw folder; `--list <id>` prints the loose pieces of every box. (2) Add the rig to the meta file: name the boxes by eye, write the `side` sentence, list the parts back to front with a scale and a joint each, place them over the standing sprite (`at`), give `joints` for the empty bones. (3) `--preview <dir>` writes the standing sprite, the rig at rest, both overlaid and the joints: tune until the tool reports top and bottom within a unit of the sprite. (4) Look at the walk in `lab/anim.html?scene=rig&who=<id>` on the three headings and judge it with ANIMATOR_GUIDE.md section 6. (5) Feel: an entry in `RIG_GAITS` (data/gaits.js). (6) `ship` only when it is the same person as the standing sprite and `tests/graftwork_rig.test.mjs` is green.

### Engine side (what exists, what is next)

- Painted walk frames (a 4-frame cycle and the older two-image step swap) were tried and removed: the feet did not alternate. `ui/assets.js` frames are battle frames only (atk, hit, die).
- `ui/rig.js`: the capsule placeholder (`HUMANOID`, `walkPose`, `solveRig`, `drawRig`: the first proof, still in the lab) and the painted rigs: `makeRig(id, entry)`, `poseRig(rig, { ph, w, t, ux, uy, calm })` (idle and the two-step walk), `footContact`, `rigPlace`, `drawRigged`. `ui/rigs.js`: `rigs.get(id, app)` answers `{ rig, img }` once the manifest and that character's atlas are in, null before (nothing is requested until the first ask).
- The Ward (`drawActor` in ward_iso.js): with the preview on, an actor that has a shipped rig is its rig, walking and idle; without the rig (not loaded yet, none, preview off) the puppet below draws as before. The title scene's monsters are Ward figures and follow. Battles are not wired (CLEANUP_PLAN.md says what that takes).
- Walk per actor: the rig (preview), else the puppet, else the hop.

### PUPPET WALK (built, needs no new art)

`ui/puppet.js` cuts each STANDING sprite into a left leg, a right leg and an upper body from its own alpha (hip line = where the silhouette opens into two legs, split = the valley column, blobs owned by connected component so overlapping boots do not tear) and animates them as a cardboard puppet: contact, down, passing, up, then the other foot leads. Stride per step is tied to the distance moved, so a planted foot has exactly zero ground speed; the swing foot lifts about 8 percent of the height; bob twice per cycle, sway toward the planted foot, lean, upper body counter-twist, squash on the plant. Actors without two legs use a body gait (`hop`, `waddle`, `roll`, `flap`) from `data/gaits.js` (table wins over the automatic classification; `split` sets a hand-made hip and valley for legs that touch in the silhouette). The Ward and the title scene use it for every actor: it is simply the walk (a sprite that cannot be cut, as in node, hops instead). Look at it in `lab/anim.html` (default source "Puppet walk", Compare shows it against the hop: leg split overlay, gait readout, tune sliders, L/R planted indicator and foot slide meter read from the real pose). Tests: `tests/graftwork_puppet.test.mjs`. Combat lunges still use the old pose (not wired).

## 8. Tests and guards

`tests/graftwork_rig.test.mjs`: the painted rigs (manifest, bone tree, layers, the walk, the preview switch, a Chromium check, the build tool). `tests/graftwork_templates.test.mjs`: manifest parsing with fake manifests (bad entries dropped), 9-slice math, content rect, slots (anchor, pivot, repeat), default template equals the procedural layout, merge, fit, id candidates, lazy loader with fake fetch and images (1x on phones, atlas icons), fallback identity (three child processes: untouched, empty manifest, failed fetch all hash to the pre-change render), template mode with a fake frame, composer order and baked flags, panel and button skins only when a frame decoded, rig step alternation. Helpers: `tests/graftwork_rec_lib.mjs` (call-recording canvas), `tests/graftwork_rec_hash.mjs`.
