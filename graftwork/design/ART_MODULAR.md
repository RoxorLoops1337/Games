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

### Rig conventions (option A)

- **Parts** (`HUMANOID` in ui/rig.js): `head`, `torso` (includes pelvis), `armL_up armL_lo handL`, `armR_up armR_lo handR`, `legL_up legL_lo footL`, `legR_up legR_lo footR`, `weapon`, plus accessory layers (`hair`, `hat`, `apron`, `scarf`, `tail`) each attached to a named bone. "L" is the FAR side for a character facing down-right (drawn behind), "R" the near side.
- **Generation:** neutral isometric 3/4 pose proportions, every part drawn straight (un-bent), spaced on a grid with margin, one consistent scale across the sheet (the shopping list attaches `rig.guide_pose`). Weapon or prop separate.
- **Overlap:** every limb part extends about 10 percent past its joint, hidden under the next part, so rotation never opens a gap. Draw order back to front: far arm, far leg, torso, head, near leg, near arm, weapon (the `z` field; accessories carry their own).
- **Pivots:** per part in a rig json (`assets/ui/rig/<id>.json`: `{height, parts:{name:{atlas|file, rect, px, py}}, scale}`), pivot at the joint centre in part pixels; the build tool or the art session writes joint pixel coordinates in ART_SYNC.md. The default bone offsets (shoulder, hip, knee lengths) scale with `height`.
- **Procedural placeholder:** `drawRig` draws capsules with the same skeleton when no part image exists, so the walk can be tested and tuned today. No fake art is committed; the standing sprites are NOT cut up.
- **Step cycle** (`walkPose(ph)`, `ph` = steps walked, a plant at every integer; cycle = two steps): contact (leading leg forward, body lowest), down, passing (legs together, body highest, the swinging knee folds), up. Opposite foot leads on the next step. Arms counter-swing (the arm opposite the forward leg goes forward), small torso lean, body bob. Attack and hit poses are further key poses of the same skeleton (weapon swing = arm and torso angles over time), added as `attackPose(t)` etc.
- Verified by `rig_step_cycle_alternates_feet`: L foot forward at every even contact, R at every odd one, legs together at passing.

### Engine side (what exists, what is next)

- Painted walk frames (a 4-frame cycle and the older two-image step swap) were tried and removed: the feet did not alternate. The map walk is the puppet below, else a hop; `ui/assets.js` frames are battle frames only (atk, hit, die).
- New and additive: `ui/rig.js` exports `walkPhase(distance, stride)` (stride tied to distance walked, same as ward_iso.js's step cycle), `leadFoot(ph)` returns `'L'|'R'` (contact L then R) so a renderer, a footstep sound or a dust puff knows which foot planted, and `walkPose`/`solveRig`/`drawRig`.
- Next (not done, needs ward_iso.js which another agent edits): in `ward_iso.js` and `combat_art.js` call `drawRig` for actors that have a rig (`assets.actors[id].rig = "rig/<id>.json"`), keep the puppet for everyone else, and pass `leadFoot` to the footstep sfx.
- Walk per actor today: the puppet, else the hop (one standing image either way). A rig would come before the puppet.

### PUPPET WALK (built, needs no new art)

`ui/puppet.js` cuts each STANDING sprite into a left leg, a right leg and an upper body from its own alpha (hip line = where the silhouette opens into two legs, split = the valley column, blobs owned by connected component so overlapping boots do not tear) and animates them as a cardboard puppet: contact, down, passing, up, then the other foot leads. Stride per step is tied to the distance moved, so a planted foot has exactly zero ground speed; the swing foot lifts about 8 percent of the height; bob twice per cycle, sway toward the planted foot, lean, upper body counter-twist, squash on the plant. Actors without two legs use a body gait (`hop`, `waddle`, `roll`, `flap`) from `data/gaits.js` (table wins over the automatic classification; `split` sets a hand-made hip and valley for legs that touch in the silhouette). The Ward and the title scene use it for every actor: it is simply the walk (a sprite that cannot be cut, as in node, hops instead). Look at it in `lab/anim.html` (default source "Puppet walk", Compare shows it against the hop: leg split overlay, gait readout, tune sliders, L/R planted indicator and foot slide meter read from the real pose). Tests: `tests/graftwork_puppet.test.mjs`. Combat lunges still use the old pose (not wired).

## 8. Tests and guards

`tests/graftwork_templates.test.mjs`: manifest parsing with fake manifests (bad entries dropped), 9-slice math, content rect, slots (anchor, pivot, repeat), default template equals the procedural layout, merge, fit, id candidates, lazy loader with fake fetch and images (1x on phones, atlas icons), fallback identity (three child processes: untouched, empty manifest, failed fetch all hash to the pre-change render), template mode with a fake frame, composer order and baked flags, panel and button skins only when a frame decoded, rig step alternation. Helpers: `tests/graftwork_rec_lib.mjs` (call-recording canvas), `tests/graftwork_rec_hash.mjs`.
