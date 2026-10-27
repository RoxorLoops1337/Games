# A08: Art Direction and UI Design

Owner: A08 (Art Director, UI Designer). All visuals are code: canvas 2D for the house scene and sprites, DOM+CSS for cards and chrome, inline SVG strings for icons. Zero image files, zero external fonts.

## 1. Visual style: "Lamplit Pixel"

- Chunky pixel-art look. Scene canvas renders at a LOW logical resolution and is upscaled with `image-rendering: pixelated` (and `imageSmoothingEnabled=false`). One logical pixel = 1 art pixel. Integer scale only (floor of fit), centered, letterboxed with the Night layer color.
- Logical scene size: desktop 384x216 (scale 4 at 1536x864, 3 at 1152x648, 2 at 768x432). Phone portrait 216x288 (scale floor(width/216), typically 1 or 2, so at 390px wide use scale 1 with CSS width 100% and `pixelated`, accept non-integer; see 2.3).
- Rules: 1px dark outline on all sprites (outline color is a darkened version of the sprite's main hue, never pure black). Max 3 shade steps per material (shadow, base, light). Light always comes from the top (the Sunbeam). No anti-aliasing, no gradients on sprites; background layers may use dithered 2x2 Bayer bands for gradients.
- Mood: warm night. Cool blue-violet shadows, honey-amber light pools, a golden Sunbeam at the top. Enemies lean cold and desaturated, cats lean warm, so allegiance reads in one glance.
- UI chrome is NOT pixelated: crisp CSS with 2px hard borders, 4px corner "notches" (clip-path stepped corners), hard drop shadows (`box-shadow: 0 3px 0 var(--shadow)`), no blur shadows. Text is real text (system fonts), never drawn to canvas except damage numbers.

### 1.1 Palette (CSS custom properties on :root; define exactly these names)

Background layers (back to front, scene canvas):
| Token | Hex | Use |
|---|---|---|
| --sky-top | #0f0b24 | Night sky top |
| --sky-mid | #1d1745 | Sky middle band |
| --sky-low | #3a2a5e | Sky near horizon (dither into mid) |
| --moon | #fff1c9 | Moon disc |
| --star | #ffe9a8 | Stars (2px twinkle) |
| --far-roofs | #2a2147 | Distant rooftops silhouette |
| --garden | #1b2a3a | Garden foreground at the base (enemy spawn) |
| --garden-grass | #2f5a4a | Grass tufts |
| --house-wall | #5a3a4a | Exterior wall behind floors |
| --wall-trim | #8a5a5a | Wall trim, baseboards |
| --wall-paper-a | #6b4558 | Wallpaper stripe A (Parlor) |
| --wall-paper-b | #5f3d50 | Wallpaper stripe B |
| --cellar-stone | #3d3a4f | Cellar bricks |
| --cellar-stone-hi | #4d4a62 | Brick highlight |
| --attic-wood | #6a4a3a | Attic planks |
| --attic-wood-hi | #7e5a46 | Plank highlight |
| --floorboard | #3b2530 | Floor slab between floors |
| --window-glow | #ffc766 | Lit windows, lamp pools |
| --sunbeam | #ffd95a | The Sunbeam core |
| --sunbeam-hi | #fff3b0 | Sunbeam highlight |
| --sunbeam-glow | rgba(255,217,90,0.28) | Sunbeam rays overlay |

UI chrome:
| Token | Hex | Use |
|---|---|---|
| --ui-bg | #140f26 | Page background, panels base |
| --ui-panel | #231a3d | Panel fill |
| --ui-panel-hi | #2f2450 | Raised panel, hover |
| --ui-border | #4a3a78 | Default 2px border |
| --ui-border-hi | #7a64c0 | Focus / selected border |
| --ui-shadow | #0a0716 | Hard drop shadow |
| --ui-text | #f6ecd8 | Primary text (warm cream) |
| --ui-text-dim | #b7a9c9 | Secondary text (contrast 7.6:1 on --ui-panel) |
| --ui-text-faint | #7f7298 | Disabled / hint only, never for required info |
| --btn | #ffb347 | Primary button fill |
| --btn-hi | #ffd18a | Primary button top edge |
| --btn-lo | #c27a1f | Primary button bottom edge |
| --btn-text | #2b1606 | Text on primary button |
| --btn-2 | #3a2c64 | Secondary button |
| --danger | #ff5d6c | Destructive / enemy damage text |
| --good | #7be495 | Heal / positive |

Clan colors (each has main, dark, light; cards, floor tints, and unit outlines use them). Placeholder clan names; the lead locks final names, the keys are what code uses:
| Key | Concept | main | dark | light |
|---|---|---|---|---|
| hearth | Warmth, purr, healing, kneading | #ff8a3d | #a8431a | #ffc08a |
| prowl | Hunters, pounce, first strike | #5fd08a | #1f6a45 | #b6f0c8 |
| nap | Rested, sleep, delayed power | #7a8cff | #3a3f9e | #c3ccff |
| cardboard | Boxes, hiding, defense | #d9a96a | #7a5326 | #f0d3a3 |
| yarn | Tangle, chains, combos | #ff6fae | #962f63 | #ffb5d6 |
| chaos | Zoomies, knock it off, hairballs | #b86bff | #5a2a96 | #dcb0ff |
| neutral | Colorless stray cards | #cfc8d8 | #6e6680 | #ece8f2 |
| pest | Enemy-aligned (curses, junk) | #8c9a8a | #3f4a40 | #c4cec2 |

Rarity (border + gem + title plate tint):
| Rarity | Hex | Frame note |
|---|---|---|
| common | #b8b0c8 | plain 2px border, grey gem |
| uncommon | #5fb4ff | blue border, blue gem |
| rare | #ffcf4a | gold border, gold gem, 1px inner highlight |
| epic | #d46bff | violet border, animated shimmer sweep (2s loop, off in reduce motion) |
| champion | #ff5d6c | red-gold double border, crown notch on top edge |
| curse | #6b7a68 | jagged bottom edge, sickly gem |

Status colors (each status ALSO has a unique icon shape, see 8.2; color never carries meaning alone):
| Status class | Hex | Examples |
|---|---|---|
| buff (good) | #7be495 | Purr, Rested, Armor, Fur Up |
| debuff (bad) | #ff5d6c | Scratched, Soaked, Dazed |
| neutral/stack | #ffd95a | Counters, Lives, charge-ups |
| cold/control | #6fd6ff | Tangled, Frozen, Stunned |
| poison/over time | #b8e04a | Hairball, Bleed, Cucumber |
| Warmth | #ffd95a (fill) on #5a3a10 (track) | Sunbeam bar |
| Energy (Zoomies) | #ffe14a orb, #a87a00 rim | energy orbs |
| Damage text | #ff5d6c; Block/Armor text #8fd0ff; Heal #7be495; Warmth loss #ffb347 | |

## 2. Battle screen: the House Cutaway

A dollhouse cross-section: three floors stacked, Sunbeam on the roof. Enemies enter bottom-left from the garden, climb on the right-side stairs (visual only), and fight on each floor. Cats stand on the floor slabs.

### 2.1 Scene geometry (logical px, desktop 384x216 scene canvas)
- Roof strip: y 0-24. Sunbeam panel, Warmth bar overlay, roof tiles.
- Attic: y 24-80 (56px tall). Parlor: y 80-136. Cellar: y 136-192. Garden strip: y 192-216 (spawn queue shown here).
- House spans x 24-360 (336px wide); outer 24px each side is sky/garden. Right 40px of each floor is the stair column (enemy approach/leave), left 296px is the battle room.
- Each floor has 5 unit slots (cat slots), each 48px wide x 40px tall footprint, left to right, slot 0 nearest the stair (enemy side) is the FRONT. Cats face right toward the stairs. Enemy stands at the stair side and in front of the front cat. Floor capacity matches the lead's rules (this doc assumes 4 cats max per floor plus 1 Box/room-upgrade slot shown as the leftmost 'room' slot; the lead can change with `FLOOR_SLOTS` constant).
- Floor label chip at the floor's far left edge: "ATTIC", "PARLOR", "CELLAR" (8px caps, clan-tint of that floor's room upgrade if any).

### 2.2 Desktop layout (viewport 1280x720 reference, min supported 1024x600)
```
+------------------------------------------------------------------------------+
| [Pause][Deck 14][Relics: icons row ........................]  Night 3/9  [?]  |  topbar 40px
+------------------------------------------------------------------------------+
|                                  ROOF / SUNBEAM  [#### Warmth 34/40 ####]    |
|  +------------------------------------------------------------+ +----------+ |
|  | ATTIC   [room][cat][cat][cat][ . ]  <E intent>   |stairs| | | ENEMY    | |
|  |---------------------------------------------------| | | | ORDER    | |
|  | PARLOR  [room][cat][ . ][ . ][ . ]  <E intent>   |stairs| | | queue of | |
|  |---------------------------------------------------| | | | next     | |
|  | CELLAR  [room][ . ][ . ][ . ][ . ]  <E><E>       |stairs| | | wave     | |
|  +------------------------------------------------------------+ | icons    | |
|  garden:  spawn queue  (mouse)(rat)(dog) ->                       +----------+ |
+------------------------------------------------------------------------------+
| (Draw 5)    [ O O O ]          HAND (fan, 5-10 cards)           (Discard 3)    |
| Energy orb       Zoomies 3/3                                      (Exhaust 0)  |
|                                                       [ END NIGHT TURN > ]     |
+------------------------------------------------------------------------------+
```
- Scene area: top 60% of viewport (DOM container with canvas, aspect 16:9, `max-height: 62vh`). Hand tray: bottom 38%, 220px min card region.
- Left of hand: Draw pile (card-back stack with count badge) and Energy cluster. Right of hand: Discard pile, Exhaust pile (small, shown only if count > 0), End Turn button (largest button, --btn color).
- Right column of scene: "Incoming" panel (width 180px) showing next wave order as 24px enemy heads with intent icon; collapses into a strip under the scene when viewport < 1100px wide.
- Hand: cards fan along an arc, 140x196 px each (see 3). Hovered card rises 56px, scales 1.25, straightens, z-index top. Selected (click-to-pick-up) card follows pointer with a dashed arrow to target.

### 2.3 Phone portrait layout (viewport 390x844 reference, min 360x640)
```
+--------------------------------+
| [II] Night 3/9  [Deck][Relics] |  topbar 36px
+--------------------------------+
|   ROOF  [### Warmth 34/40 ###] |  24px
| ATTIC  [r][c][c][c][ ] <E>     |  floors 3 x 84px
|--------------------------------|  (scene scales to
| PARLOR [r][c][ ][ ][ ] <E>     |   screen width)
|--------------------------------|
| CELLAR [r][ ][ ][ ][ ] <E><E>  |
| garden: next ->(mouse)(rat)    |  20px
+--------------------------------+
| Draw 5  (O)(O)(O)  Disc 3     |  status row 36px
| ENEMY INFO strip (tap enemy)   |  appears on tap, 48px
+--------------------------------+
|  [card][card][card][card][card]|  hand: 5 visible, overlap
|   cards 84x118, tap to raise   |  hand tray 150px
|                    [END TURN]  |  button 48px tall
+--------------------------------+
```
- Scene canvas logical size 216x288, CSS width 100% (non-integer scale tolerated; use `image-rendering: pixelated` and render canvas at `devicePixelRatio`-independent logical size so edges stay crisp). Floors are 84px tall each in CSS px at 390 wide.
- Slots shrink: 4 slots + room slot, each ~56 css px wide. Unit sprites drawn at 24px; HP and intent as badges overlay.
- Hand interaction on touch: tap card to raise it (preview 1.6x above hand with full text in a bottom sheet), tap a floor to deploy unit/targeted spell (floors highlight pulsing in --good outline), second tap on the raised card's "PLAY" chip plays untargeted cards. Drag-and-drop also supported (drag up past 40% of hand height to play, drop on a floor). Long-press (350ms) on any card/enemy/relic opens the detail sheet.
- Safe areas: pad with `env(safe-area-inset-*)`. Use `100dvh`. Hand tray never overlaps the End Turn button.
- Landscape phone: use desktop layout with tighter metrics (hand 110x154).

### 2.4 How things are displayed
- **Floors**: slab with 3px floorboard top highlight. Active/targetable floor gets a 2px --good pulsing outline (1Hz, steady in reduce motion). A floor under threat (enemy intent will hit this floor's cats or Warmth next) gets a red chevron "!" on its stair. Room upgrade (Treat/Toy/Box) is drawn in slot "room" (leftmost, 32x32 icon with clan-tint frame, tooltip on hover or tap).
- **Unit display (cat on floor)**: 32x32 logical sprite (procedural, see 8). Below sprite, a 3px-tall plate: left ATK (sword glyph + number, --ui-text on #5a2a2a), right HP (heart glyph + number, on #2a4a3a). HP number turns --danger when below 40%. Above the head: Lives pips (9 tiny 3x3 paw dots max, filled = remaining; if more than 5, show a single paw glyph + number "x7"). Status icons stack in a row of 8px icons under the plate, max 4 shown then "+N". Champion units get a 2px gold ring on the base and a crown pixel.
- **Enemy display**: sprites 32x32 (elite 40x40, boss 56x56 spanning two slots). Same ATK/HP plate. **Intent bubble** floats above the enemy: rounded 14px pill with icon + number. Intent icons (shape-coded, color also): Attack (claw, #ff5d6c) with damage number, Multi-attack "3x4", Climb (up arrow, #ffd95a), Debuff (broken-heart/skull-drip, #b8e04a), Buff (up chevrons, #7be495), Summon (plus-in-circle, #6fd6ff), Defend (shield, #8fd0ff), Unknown "?" (#b7a9c9). Hover/tap intent shows tooltip with exact effect text. If the enemy will reach the Sunbeam this turn, its bubble gets a flame border and the roof flashes a warning strip.
- **Warmth (Sunbeam health)**: horizontal bar centered on the roof, 160x10 logical px, segmented every 5 points (ticks), fill --sunbeam with pixel highlight row, animated ray fan behind it that shrinks as Warmth drops (rays count = ceil(warmth/max*8)). Number "34/40" at right in bold. Warmth under 25% pulses red-orange border and the roof lamp flickers. Temporary Warmth (shield) shows as a second blue-white segment overlay.
- **Energy (Zoomies)**: round orb cluster bottom-left of the hand: one 28px orb per max energy (up to 6 drawn, then number only). Filled = bright --energy with a lightning-bolt-paw glyph, spent = hollow dark ring. Number readout "3/3" beside. Zoomies Turn (every 3rd) gets orbs with a sparkle outline and a moon badge "ZOOMIES".
- **Deck piles**: Draw pile = stack of 3 offset card backs (back design: --ui-panel with paw crest) + count badge; Discard pile = same, tilted 4 degrees, face-down; Exhaust = card-backs with a small flame, shown only if non-empty. Click/tap any pile opens a scrollable grid overlay (Draw pile shown sorted alphabetically so order stays hidden). Cards fly to/from these piles (see 6).
- **Relics**: top bar, left to right, 28px square icons with rarity-colored 2px border; overflow scrolls horizontally on phone (a "Relics" button opens the full grid). Hover/tap shows tooltip. When a relic triggers it bounces (translateY -4px, 150ms) and a pulse ring emits.
- **Night Clock**: small moon-phase dial in the top bar (9 notches for nights) and a 3-pip turn counter "1 2 3" that highlights the Zoomies pip.
- **Block/Armor**: blue shield glyph with number replaces the plate's HP border color on that unit. Hidden-in-Box units get 60% opacity and a cardboard-tan outline.

## 3. Card frame design

Card is a DOM element (`div.card`), 140x196 css px at desktop (aspect 5:7), 84x118 on phone hand, 220x308 in detail/reward view. Built with CSS variables `--clan-main/dark/light` and `--rarity`. Never uses image files.
```
+--[cost]------------------------+   top edge notch cut (clip-path)
|(E) NAME OF CARD       [rarity]|   title plate (clan-dark fill, 2px clan-light line)
|------------------------------|
| +--------------------------+ |
| |   ART WINDOW (canvas)    | |   96x64 logical art, pixel-scaled x1.2
| |   procedural cat/object  | |   framed by 2px --rarity border + inner dark
| +--------------------------+ |
| [UNIT] Floor   ATK 3  HP 5   |   type ribbon (clan-main) + stats chips
|------------------------------|
|  Rules text, 11px, up to 5   |   parchment panel #2a2040
|  lines. Keywords bold in     |   keyword color = their status color
|  their color.                |
|  "Flavor in italics, dim."   |   shown only on detail view
| [x] lives pips   [clan glyph]|   footer: lives (units), clan emblem
+------------------------------+
```
- Frame: outer 2px border = rarity color; inner 2px = clan-dark; body fill = `linear-gradient` not used, flat --ui-panel with a 1px clan-main inset top highlight. Corners clipped by 4px steps (`clip-path: polygon(...)`).
- Cost: top-left 26px circle gem, --energy fill, dark number (bold 15px). X-cost shows "X". Cost reduced shows green, increased red. Unplayable (not enough energy) dims cost to grey and card to 70% brightness with a red cost ring.
- Type ribbon text: UNIT, SPELL, TREAT (room upgrade), TOY, CHAMPION, CURSE, plus icon shapes (cat head, star, bowl, mouse-toy, crown, skull). Type glyph shape differs per type for colorblind use.
- Upgraded cards: name gets "+" suffix, title text --good, small 3-spark glint at the corner, art window gets a gold inner line. Champion cards show 3 upgrade-path pips under the art.
- Keywords: rendered as `<b class="kw kw-purr">Purr</b>`, colored per status table plus tiny 8px icon prefix; hover/tap a keyword opens glossary tooltip.
- States: `.playable` (soft glow in clan-light), `.unplayable`, `.selected` (lifted, outlined --ui-border-hi), `.targeting` (follows pointer), `.exhausting` (burn dissolve), `.new` (reward draft bounce-in).
- Card art window: each card has `art` spec (cat genome id, or an icon generator + palette); drawn once to an offscreen canvas and cached by key.
- Card back: --ui-panel with 1px diagonal pixel pattern, central paw crest in --ui-border-hi, border --ui-border.

## 4. Typography (system/safe fonts only)

| Role | CSS stack | Notes |
|---|---|---|
| Display / titles | `"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif` bold, letter-spacing 0.04em, UPPERCASE for screen titles | warm humanist, chunky when bold |
| Body / card text | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | readable at 11 to 14px |
| Numbers (ATK, HP, cost, damage) | `"Arial Black", Impact, "Trebuchet MS", sans-serif` bold, `font-variant-numeric: tabular-nums` | blocky, matches pixel vibe |
| Tooltips/code-ish | `ui-monospace, "SFMono-Regular", Consolas, "Courier New", monospace` | status debug and run seed only |

Sizes (base 16px, multiplied by text-size setting 0.9 / 1.0 / 1.2 / 1.4 via `--text-scale` on :root; all UI sizes use `calc(Npx * var(--text-scale))`): screen title 28px, section 18px, button 16px, card title 12px (min 10px after scale-down shrink-to-fit), card body 11px, tooltip 13px, badge numbers 12px. Card text auto-shrinks (JS fits down to 9px) before truncating. Text shadow `0 1px 0 var(--ui-shadow)` for legibility on busy backgrounds. Line-height 1.25. Damage numbers are drawn on canvas using `bold 14px "Arial Black", Impact, sans-serif` with 2px dark stroke.

## 5. Screens (layout of each)

All screens share: page bg --ui-bg with a faint star field (CSS radial-gradients, static), a 40px topbar when mid-run (Night x/9, Warmth, gold "Fish" currency icon with count, deck button, relics strip, settings cog). Currency name placeholder "Fish" (gold fish glyph, #ffcf4a). Each screen is one `<section class="screen" id="screen-...">`; only one visible; transitions are a 200ms fade/slide (instant in reduce motion).

1. **Title**: Full-bleed house scene (animated parallax: drifting clouds, twinkling stars, lit windows, a procedural cat silhouette blinking on the roof). Center-left logo "NINE LIVES" in big stacked pixel-letter CSS (text-shadow stack to fake 3D, --sunbeam), subtitle "Defend the Sunbeam". Menu column (buttons 260x48): Continue (if save), New Run, Collection, Settings, Credits. Bottom: version, mute toggle. Phone: logo top, buttons stacked bottom half.
2. **Clan select**: Header "Choose your clowder". Left 60%: grid of clan tiles (2 rows x 3, each 160x120 with clan emblem, color, name, one-line playstyle, lock icon if locked). Selecting a main clan (gold "MAIN" tag) then a side clan ("SIDE" tag, can't equal main). Right 40%: preview panel with the champion choice carousel (champion card large + 3 upgrade paths list), starting deck list (scrollable mini cards), Mischief Rank selector (stepper 0-N with modifiers list), Start button. Phone: stacked steps via bottom tab "1 Main, 2 Side, 3 Champion, 4 Rank", Start is a sticky footer.
3. **Map**: Vertical branching node map, bottom (Night 1) to top (Night 9 boss), drawn on canvas/SVG scroll area. Nodes 40px: Battle (crossed claws), Elite (skull cat), Boss (big crown), Shop (fish bag), Event (?), Scratching Post (post glyph), Rest Nook (cushion), Treasure (chest-box). Paths are dotted lines; reachable nodes pulse; visited nodes dim with a paw print; current marker is a small cat head. Act dividers (3 acts) with house-room backdrop color per act (Cellar night, Parlor night, Attic night). Right side panel (desktop) shows legend and run deck/relic summary; on phone, legend is a collapsible chip row. Tapping a reachable node shows a confirm sheet "Go here?".
4. **Battle**: section 2 of this doc. Overlays: pause menu, pile viewer, card detail sheet, enemy detail panel (name, HP, intents history, passives), turn banner ("NIGHT 3, TURN 2" / "ZOOMIES!" / "ENEMIES CLIMB" centered 800ms).
5. **Reward**: After win. Title "Spoils of the night". Top: rewards list (Fish +N, Relic?, Card pick) as rows (each 64px, icon, text, "Take" button). Card pick opens a 3-card draft row (large cards 220x308 on desktop, horizontal snap-scroll on phone) with "Skip (+Fish bonus)" and a "Reroll" if relic allows. Bottom: Continue button.
6. **Shop**: Scene of a corner store backdrop ("Mrs. Whiskerby's Back Alley Bazaar" placeholder). Grid: 5 cards for sale (2 clan, 1 side-clan, 1 neutral, 1 on-sale with red tag), 3 relics (pedestals), 1 potion-equivalent slot optional, a Card Removal service tile (price rises each use), and a Heal service. Prices in Fish under each item; unaffordable prices red. Leave button bottom-right. Phone: tabs "Cards | Relics | Services".
7. **Event**: Illustrated procedural vignette at top (260x120 canvas scene built from the cat sprite system plus props), title, flavor paragraph (14px, max 6 lines), then 2 to 4 choice buttons full width, each with an outcome hint chip (costs in red, gains in green). Result state replaces buttons with outcome text + Continue.
8. **Scratching post**: Center a large procedural scratching post with sisal texture and a cat that animates scratching. Left: deck grid (scrollable, filterable by clan/type). Choose a card, right panel shows before/after (two large cards side by side with changed numbers highlighted in --good). Buttons: Upgrade (confirm), Back. Also shows champion upgrade picker (3 path buttons with previews) when a Champion is selected. Phone: grid then bottom-sheet preview with confirm.
9. **Run summary**: Win or loss header ("The Sunbeam holds." / "The house went dark."). Center: stats table (nights survived, damage dealt, cards played, best turn, Mischief Rank, time, seed). Deck list as mini cards, relic row, Champion with final upgrades. Unlock notifications list. Buttons: New Run, Main Menu, Copy seed. A 3-second reveal animation counts stats up (skippable).
10. **Collection**: Tabs: Cards, Relics, Enemies, Champions, Clans. Grid with filters (clan, rarity, type, search text). Undiscovered entries render as silhouettes with "???" and unlock hint. Click opens detail panel with flavor and stats. Phone: 3 columns grid, detail as bottom sheet.
11. **Settings**: Panel list in sections: Audio (master, music, SFX sliders, mute all), Display (text size 4 steps, reduce motion, high contrast, colorblind icons, screen shake intensity 0/50/100%, damage numbers on/off, fast animations x1/x2/x3), Gameplay (confirm End Turn when energy unspent, auto-end turn off by default, left-handed mode on phone mirrors the End Turn button), Data (export save to text, import, delete save with 2-step confirm), About. Applies live. Stored in localStorage key `nl_settings`.
12. **Tutorial overlay**: Dim layer (rgba(10,7,22,0.78)) with a cutout spotlight (CSS `clip-path` or four rects) around the target element, a speech bubble from a procedural mentor cat (the "Elder Cat", fixed genome, spectacles accessory) with Next/Skip buttons. Steps (first battle only, re-playable from Settings): 1 Sunbeam and Warmth, 2 Floors and enemy climb, 3 Intent bubbles, 4 Playing a unit card by dragging onto a floor, 5 Energy, 6 End Turn, 7 Lives, 8 Keywords. Each step waits for the real action when action-gated. Never blocks input outside the spotlight except with the dim layer in non-gated steps.

## 6. Animation and juice list

All durations in ms, easing named. Global `fx.speed` multiplier from "fast animations" setting. Reduce Motion replaces motion with 1-frame opacity changes (see 7).

**Screen shake** (`shake(power, ms)`: canvas+HUD container translate by random integer px each frame, decaying linearly):
| Event | Power px | Duration |
|---|---|---|
| Unit hit by normal attack | 1 | 80 |
| Big hit (damage >= 10 or crit) | 3 | 180 |
| Cat dies / loses a life | 2 | 150 |
| Enemy reaches Sunbeam, Warmth loss | 4 | 260 |
| Boss slam / elite intro | 5 | 350 |
| Knock It Off impact (enemy falls a floor) | 3 | 200 |
User scale: 0 / 0.5 / 1.0. Never shakes cards in hand.

**Damage numbers**: canvas text spawns at target head, rises 18px over 700ms with ease-out, scale pops 1.4 to 1.0 in the first 100ms, fades in the last 200ms. Colors per status table. Crit/large (>=10): 1.6x size and shake wiggle. Multiple hits stagger by 70ms and fan x +/-6px. Block shows shield glyph "0" with grey. Heals prefixed "+". Max 24 live numbers.

**Hit flashes**: target sprite re-rendered with all non-transparent pixels set to #ffffff for 2 frames (~66ms), then hit-stop 40ms (game loop freezes visuals only), then knockback of 3px away from attacker over 90ms returning with ease-out. HP plate number pops (scale 1.3, 120ms). Healing flash is --good tint for 100ms. Death: sprite flashes white, breaks into 12 to 20 square pixel chunks of its own palette that fly with gravity (see particles), cat deaths show a ghost cat floating up 20px fading, with "x" eyes, plus the life pip popping.

**Particle system**: pool of 400 particle objects `{x,y,vx,vy,ax,ay,life,max,size(1-3),color,shape('sq'|'spark'|'ring'|'heart'|'paw'|'star'),rot,vrot,fade}` updated at fixed 60Hz, drawn as logical-pixel squares on the scene canvas. Presets:
| Preset | Particles | Details |
|---|---|---|
| hit | 6 | white and clan color squares, burst radius 14, life 300 |
| claw slash | 1 sprite | 3 diagonal 1px lines 12px long drawn progressively over 120ms, in --ui-text |
| heal / purr | 8 | green hearts rising slow with sine sway, life 900 |
| Warmth gain | 10 | gold sparks flowing from source to Sunbeam along a curve |
| dust puff (placement) | 8 | tan squares expanding at the slot's feet, life 350 |
| hairball | 6 | brown-green blobs arcing, impact splat decal 1s |
| yarn | line | procedural curved thread drawn between two points with pink segments, wraps target in 3 loops |
| catnip surge | 20 | green leaf shapes swirling upward, screen edges get green vignette 600ms |
| zoomies turn | 30 | streak lines across the scene, bg tint shifts to --sky-low for the turn |
| gold/Fish gain | 6 | gold coins fly to counter with bounce |
| energy gain/spend | 5 | yellow sparks to/from orb |
| sunbeam idle | 3 per sec | slow golden motes drifting down from the roof |
| ambient | 12 stars | 2px twinkle on 2s staggered loops; dust motes in lit windows |

**Card fly paths** (DOM elements animated with Web Animations API or CSS transforms; cubic-bezier control points relative to start S and end E):
- Draw: from draw pile to hand slot, 260ms, quadratic arc peaking 40px above the straight line, ease-out, 40ms stagger between cards, card flips from back to face at 50%.
- Play unit: card lifts to cursor; on drop it shrinks (scale 1 to 0.3) and flies to the target slot over 180ms ease-in while the unit sprite drops from 12px above with a squash (scale y 0.7 then 1.0, 120ms), dust puff, and a 1px shake.
- Play spell: card moves to screen center-bottom of scene, scales to 1.2, holds 180ms (shows name), effect fires, then flies to discard (320ms, curve through a point 60px above) shrinking to 0.4; exhausted cards instead dissolve (pixel dither burn 400ms, embers particles) and go to the exhaust pile.
- Discard end of turn: all hand cards fan toward discard staggered 30ms, 240ms each, ease-in, slight rotation spin (+/-15 degrees).
- Created cards (added mid-battle): pop from the creator unit with sparkle, fly to the destination pile (or hand) in 300ms.
- Reward pick: chosen card scales to 1.3, flies to the deck button in the topbar, deck count badge bumps.
- Invalid play: card shakes horizontally +/-6px 3 times over 200ms, cost gem flashes red, error tick sound.

**Other juice**: turn banner slides in/out (300ms each, 800ms hold); enemies climbing: sprite hops up the stairs with 3 steps (150ms each) then lands on the new floor with a dust puff; attack lunge: attacker moves 8px toward target in 90ms then back in 140ms; status icon applied: icon pops from 2x to 1x with ring; unit stack counters tick with a small up-bounce; relic proc: bounce plus ring; low Warmth: heartbeat vignette (red edges pulse at 1.2s) with CSS only; win: Sunbeam brightens and rays sweep, confetti of paw prints; loss: lights go out floor by floor (200ms each) top to bottom. Buttons have a 2px press depression. Hover on cards: 120ms ease-out. Idle cats: each cat has a 2-frame idle loop (tail flick every 2 to 4 seconds random, blink every 3 to 6 seconds); Rested cats are shown asleep with floating "z" glyphs. Idle loops desync via per-unit random offsets.

## 7. Accessibility

Settings stored in `nl_settings`; applied as classes on `<html>`: `.reduce-motion`, `.cb-icons`, `.high-contrast`, `.text-xs/.text-s/.text-m/.text-l` etc.
- **Reduce motion**: also default-on when `matchMedia('(prefers-reduced-motion: reduce)')` matches. Effects: no screen shake, no card arcs (cards teleport with a 120ms opacity crossfade), no particles except a single non-moving flash glyph on hit, parallax/clouds/twinkle disabled, pulsing outlines become steady, tutorial and screen transitions instant, damage numbers appear in place for 700ms without rising, banners fade only. Game logic and timing unchanged (animations just shorten to <=120ms).
- **Colorblind icons**: when on, every status, intent, rarity, clan, and floor-state gets a shape/letter marker in addition to color: rarity gem shapes (common circle, uncommon diamond, rare star, epic hexagon, champion crown, curse skull), clan emblems always shown (hearth = flame, prowl = claw, nap = crescent, cardboard = box, yarn = spiral, chaos = zigzag bolt), buff = up-triangle badge, debuff = down-triangle badge, neutral = square badge, HP/ATK plates always have glyphs, damage numbers prefixed "-" or "+". Default palette is also chosen to be distinguishable under deuteranopia: the buff/debuff pair differs in lightness (#7be495 light vs #ff5d6c mid) and always has an icon.
- **Text size**: 4 steps (S 0.9, M 1.0 default, L 1.2, XL 1.4) via `--text-scale`; cards in hand keep their size but detail views and tooltips scale; hand cards show rules text on tap/hover at scaled size in a detail panel. Minimum tap target 44x44 css px for all buttons on touch.
- **Contrast**: all text meets WCAG AA (4.5:1) against its panel; `high-contrast` raises borders to #ffffff, panel to #000000, text to #ffffff and drops texture overlays.
- **Input**: everything playable by mouse, touch, or keyboard. Keys: 1-9 select card in hand, Tab/arrows cycle targets (floors, then enemies), Enter/Space confirm, E end turn, Esc cancel or pause, D draw pile, X discard pile, ? help. Focus ring: 3px --ui-border-hi + 1px white outline on all focusables. ARIA: buttons are real `<button>`, a visually-hidden `aria-live="polite"` log announces events ("Whiskers deals 3 to Mouse", "Warmth 31 of 40"). Screen reader text for sprites uses `aria-label` on slot buttons.
- **Other**: no flashing above 3 per second; screen-flash effects capped at 30% opacity; optional "fast animations"; no timed inputs or hold-only actions (long-press has a visible "Info" button alternative); left-handed phone layout mirror.

## 8. Procedural cat sprite system ("Pawprint")

Single module `window.Pawprint` draws any cat into a canvas from a small genome. Deterministic from a seed. No images. Used for units, champions, card art, events, title screen, mentor cat.

### 8.1 Genome (plain object, serializable in saves, 12 fields)
```js
{
  seed: 1234,                 // int, drives all unlisted randomness (mulberry32)
  body: 'tabby',              // 'slim' | 'tabby'(avg) | 'chonk' | 'tall' | 'kitten' | 'floof'
  fur: 'orange',              // key into FUR table
  pattern: 'stripes',         // 'solid'|'stripes'|'spots'|'tuxedo'|'calico'|'siamese'|'tortie'|'bicolor'
  patternColor: null,         // optional override hex; default from FUR[fur].alt
  ears: 'point',              // 'point'|'round'|'fold'|'tufted'|'tiny'
  eyes: 'round',              // 'round'|'slit'|'sleepy'|'wide'|'happy'
  eyeColor: 'green',          // 'green'|'amber'|'blue'|'copper'|'odd'(left blue right amber)
  tail: 'long',               // 'long'|'stub'|'fluffy'|'curl'|'ring'(banded)
  accessory: 'none',          // see ACC list
  accessoryColor: '#ff5d6c',
  scale: 1                    // 1 = 32x32 logical, 1.25 elites/champions
}
```

FUR table `{base, shade, light, alt, outline}`:
| key | base | shade | light | alt (pattern) | outline |
|---|---|---|---|---|---|
| orange | #f09040 | #c0642a | #ffc27a | #b84e1c | #5a2a14 |
| black | #3a3a48 | #26262f | #5a5a6c | #1a1a22 | #0e0e14 |
| white | #f2eee6 | #cfc8bc | #ffffff | #b9b1a6 | #5a5468 |
| grey | #8f95a6 | #6a7084 | #b9bfd0 | #565c70 | #2e3242 |
| cream | #e8cf9a | #c4a770 | #fbe8bc | #a98552 | #5a4426 |
| chocolate | #7a4a34 | #55301f | #a06a4e | #3a2014 | #26130b |
| blue (russian) | #7c8aa8 | #5a6784 | #a6b3cf | #44506c | #232a3e |
| ginger | #ffa94d | #d67a22 | #ffd08a | #a65216 | #603010 |

### 8.2 Drawing method (32x32 canvas, origin top-left, cat faces RIGHT, flip via ctx.scale(-1,1) for left)
Draw order with pixel-exact primitives (`px(x,y,color)`, `rect`, `ellipseFill(cx,cy,rx,ry,color)` using integer scanline test `((x-cx)/rx)^2+((y-cy)/ry)^2<=1`):
1. **Shadow**: ellipse (16,30, 9,2) color rgba(10,7,22,0.45).
2. **Tail** (behind body): path of points swept with 3px thickness (2px for 'stub' length 3): 'long' = arc from (6,24) curving up and over to (3,10) ; 'stub' = 3px to (6,25); 'fluffy' = long but 5px thick with light highlights; 'curl' = spiral ending in a hook; 'ring' = long with alt color bands every 3px. Tail sways: frame offset `tipX += round(sin(t*2)*1)`.
3. **Body** (ellipse, base color), per body type (cx,cy,rx,ry): slim (15,22,8,6); tabby (15,21,9,7); chonk (15,21,11,9); tall (15,20,7,9); kitten (15,23,7,5, head larger); floof (15,21,10,8 with 1px jagged fringe on outline). Add shade by repainting bottom 40% of body with `shade` and the top-left crescent with `light` (1px band). Four legs: front pair rects 3x4 at (x=19..21 and 12..14,y=bodyBottom-2) and hind haunch ellipse; feet get `light` toes row.
4. **Pattern** (clipped to body+head+tail mask using a mask buffer): 
   - stripes: 3 curved 1px lines across back every 3px at x = 10,13,16 (tabby), same on tail rings; 
   - spots: 6 to 9 random 2x2 patches (seeded) on body; 
   - tuxedo: white (#f2eee6) chest ellipse, muzzle, and 4 sock rects; 
   - calico: 3 blobs from seeded voronoi: orange, black, white; 
   - siamese: darker `alt` on ears, face mask, paws, tail tip, rest cream;
   - tortie: seeded noise 2-color speckle orange/black; 
   - bicolor: left half of face and back white.
5. **Head**: ellipse (cx 21, cy 13, rx 7, ry 6) 'tabby'; chonk +1 rx; kitten rx 8 ry 7; slim rx 6. Head bob offset = idle frame (0 or 1 px). Cheek fluff for floof (2 px triangles).
6. **Ears**: two triangles on head top. 'point': tip at (headX-4, y-5) and (headX+3, y-5), 4px base, inner ear pink #ffb0b8 1px; 'round': 4x3 ellipse; 'fold': point with tip bent down 2px; 'tufted': point plus 2 light pixels tip; 'tiny': 3px triangles.
7. **Eyes** at head center y 12, x 19 and 23 (3/4 view): 'round' 3x3 with 1px dark pupil and 1px white glint; 'slit' 3x3 with vertical 1x3 pupil; 'sleepy' flat 3x1 lid line plus iris peek; 'wide' 3x4 big pupil; 'happy' arc "^" 3x2. Eye colors: green #6fd66f, amber #ffc83a, blue #5fb4ff, copper #d8803a. Blink = replace with 3x1 lines for 120ms. Expression overrides from state: hurt "><", dead "xx", rested "- -", angry brow pixel slope.
8. **Nose and mouth**: nose px at (24,14) #ff8fa0; mouth 2px "w" under it; whiskers 3 light px lines each side at y 14 and 15 (skipped on kitten).
9. **Accessories** (drawn last, by anchor points head=(21,13), neck=(17,17), back=(10,17)):
   `none, bow(2 triangles + knot, head side), bell(collar 1px band + 2x2 gold bell), scarf(3px band, tail flap), hat_wizard(cone 8 tall, star pixel), hat_crown, hat_party, hat_top, glasses(2 rings + bridge), eyepatch, bandana(neck triangle), cape(back 5x9 flowing, color accessoryColor), armor_helm(box helm with slit), headphones, cardboard_box (cat sits in a 22x14 box: front panel over lower body, drawn after body), flower, monocle, pirate_hat, chef_hat, sunglasses`.
10. **Outline**: after composing into an offscreen 32x32 ImageData, run a 4-neighbor pass: any transparent pixel adjacent to an opaque one becomes `FUR.outline` (for accessories use `darken(color,0.6)`). Inner contrasts line (1px `shade`) between head and body is optional via `innerLines:true`.
11. **Pose frames**: `idle0`, `idle1` (body 1px lower, head bob), `attack` (body shifted right 2px, front paw extended 4px, mouth open), `hurt` (body shifted left 1px, eyes ><, white flash is handled by renderer), `sleep` (loaf: body ellipse flattened ry-3, head down on paws, eyes lines, z particles), `dead` (ghost: 50% alpha, eyes xx, floats). Poses are 1 to 3 pixel deltas to the same drawing function via a `pose` argument.

### 8.3 API
```js
Pawprint.make(genome)                 -> {frames:{idle0,idle1,attack,hurt,sleep,dead}} // offscreen canvases, cached by JSON key
Pawprint.draw(ctx, genome, pose, x, y, {flip:false, scale:1, flash:false, alpha:1, tint:null}) // blits cached frame with nearest-neighbor
Pawprint.randomGenome(seed, {clan, rarity})   // clan biases fur and accessory (hearth: orange/cream + scarf; prowl: black/grey + bandana; nap: grey/cream + sleepy eyes + hat_party; cardboard: any + cardboard_box; yarn: calico/tortie + bow; chaos: odd eyes + wide eyes + headphones)
Pawprint.fromId(cardId)                       // stable hand-authored genome per named card, or seeded random from hash(cardId)
Pawprint.flashFrame(canvas)                   // returns white-silhouette copy
Pawprint.icon(name, size)                     // small SVG/canvas icons for statuses, intents, clans
```
Performance: frames cached in a `Map`; total cache < 400 canvases of 32x32. Champions use hand-authored genomes with `scale: 1.25` and a crown accessory layered over their normal one. Kittens (summons) use `body: 'kitten'`.

### 8.4 Enemy sprites (same pipeline, different generators)
`Pestprint.make(spec)` with spec `{kind, palette:[3 colors], size:32|40|56, features:[]}`; kinds are built from 2 to 6 ellipses and rects plus eyes: mouse (grey ovals, big round ears, pink tail), rat (longer, scar), dog (boxy muzzle, floppy ear), vacuum (red cylinder body, hose arc, rolling wheels), bath (tub with waves and bubbles), spray bottle (nozzle face), cucumber (green capsule with spooked-cat eyes), vet carrier (grey box with grid door and red eyes), laser dot (glowing red circle, ring ripples, no outline), plus bosses as larger composite builds. Enemy palettes stay desaturated and cool except warning accents (#ff5d6c). Each enemy gets 2 idle frames and attack/hurt frames by simple deltas, like cats.

### 8.5 Icons
`Pawprint.icon` draws 12x12 and 8x8 pixel icons from compact string bitmaps (rows of chars mapped to palette), e.g. heart, sword, shield, paw, claw, flame, crescent, box, spiral, bolt, fish, crown, skull, up-arrow, down-arrow, question, plus. Keep all in one `ICONS` table so they can be re-colored and scaled with nearest-neighbor.

## 9. Implementation notes for coders
- Files: `css/theme.css` (tokens, chrome), `js/art/pawprint.js`, `js/art/pestprint.js`, `js/art/icons.js`, `js/art/scene.js` (house background and layering), `js/art/fx.js` (particles, shake, numbers), `js/ui/*.js` per screen. Classic scripts, global namespaces `Pawprint`, `Pestprint`, `FX`, `Scene`, `UI`.
- Scene render loop: `requestAnimationFrame`, fixed-step 60Hz update, pause when `document.hidden`. Layers cached to offscreen canvases (sky, house shell, floor slabs) and redrawn only on resize; only sprites, intents, particles redraw per frame. Dirty rendering optional: when nothing animates, drop to 15Hz.
- Hit testing: slot rects are in logical coordinates; convert pointer coords with `(clientX - rect.left) / rect.width * logicalW`.
- Scale choice: `scale = max(1, floor(containerW / logicalW))` on desktop; phone uses exact fit width.
- Keep DOM card count low: hand cards are DOM; piles viewer virtualizes beyond 60 cards.
- All art keys referenced from data files as strings (`art: {genome:'hearth_scout'}`), resolved through `Pawprint.fromId`.

## Open questions for the lead
1. Final clan names and count: this doc uses six placeholder keys (hearth, prowl, nap, cardboard, yarn, chaos). Please confirm or give final keys so palettes map.
2. Floor capacity: this doc assumes 4 cats plus 1 room slot per floor. Confirm (or give the real number) so the cutaway slot width can be fixed.
3. Currency name: "Fish" is a placeholder. Confirm the name and whether there is a second currency.
4. Does a Box room upgrade hide cats visually (60% opacity) or just flag them? Needed for sprite rendering rules.
5. Is the Mentor "Elder Cat" tutorial character approved, and should it also appear as a recurring event NPC?
