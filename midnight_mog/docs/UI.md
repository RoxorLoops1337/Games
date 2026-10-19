# Midnight Mog UI contract

Owner: UI shell engineer. Files: `js/ui/shell.js` (toolkit), `js/ui/hud.js` (battle HUD pieces), `js/ui/screens_battle.js` (battle screen), `lab/ui.html` (contact sheet and live battle), `tests/midnight_mog_ui.test.mjs`.

Everything is one `<canvas>`. UI is immediate mode: a widget is a function you call every frame while drawing, and it returns what happened. No DOM except one hidden `aria-live` region. House rule: no em dashes in any string.

## 1. The App object (main.js builds it, every screen receives it)
```
App = {
  profile,                 // current Profile (never mutate in place)
  setProfile(p),           // replace the profile (sim functions return NEW profiles)
  audio,                   // createAudio() result, may be null in tests: always guard
  fx,                      // shared render/fx.js instance (optional; the battle screen makes its own when absent)
  router: { go(id, params), back() },
  save(),                  // persist profile now
  now(),                   // ms since epoch (the only clock; sim never calls Date)
  dayIndex(),              // integer day number for daily things
  toast(msg, kind),        // routes to ui.toast
  rng(seedKey) -> rng      // makeRng(hash(profile.seed, seedKey)); same key, same stream
}
Screen = { id, enter(app, params), update(app, dt, ui), draw(ctx, app, ui), exit(app) }
```
`enter` runs once per navigation. `update` runs every frame before `draw`; do sim and animation timers there. `draw` registers widgets as it paints, so taps are resolved inside `draw` (immediate mode). `exit` frees timers and music.

## 2. The frame loop (main.js owns it)
```js
const ui = createUI(canvas);          // sizes the canvas for DPR, wires pointer, touch, wheel, keyboard
ui.onSound = (name) => app.audio.sfx(name);     // optional hook, see section 7
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  ui.begin(dt);                       // resolve input against last frame's regions, advance timers
  screen.update(app, dt, ui);
  screen.draw(ui.ctx, app, ui);
  ui.end();                           // dialogs, toasts, tooltip, transition on top; swap hit regions
  requestAnimationFrame(frame);
}
```
Switching screens: `ui.transition('wipe', () => router.go('town'))`. The callback runs when the screen is fully covered. Kinds: `fade`, `wipe`, `iris`, `glitch` (reduced motion forces a short fade). Input is blocked while a transition plays (`ui.transitioning`).

## 3. Layout
- Phone portrait first (390x800 must be fully playable by tap). `ui.w`, `ui.h` are CSS pixels, `ui.dpr` is the pixel ratio (capped at 3). The context is already scaled, so draw in CSS pixels.
- `ui.safe` = `{top,bottom,left,right}` from `env(safe-area-inset-*)`.
- `ui.col` = `{x,w}`: the centred max-width column (520 px). On a wide screen content sits in this column and the backdrop fills the rest. `ui.content` = `{x,y,w,h}` is the column inside the safe area. The battle screen is the exception: world.js scales the field to the window, and the HUD uses the hand column (max 1040 px).
- `ui.rect(col, row, colSpan=1, rowSpan=1, {cols:12, rowH:56, gap:10, top:0, pad:12})` returns a grid cell of the content column.
- `ui.cols(rect, n | weights[], gap)`, `ui.rows(rect, n | weights[], gap)`, `ui.place(rect, w, h, ax, ay)`, `ui.inset(rect, dx, dy)`.
- Tap targets are at least 44 px tall. Min body text 13 px.

## 4. Widgets (all drawn in the style bible: chamfered, ink outline, rim light, bloom)
Hit tests use ids. Ids must be unique within a screen (use `'row:' + i`).

| Call | Returns | Notes |
|---|---|---|
| `ui.button(id, rect, label, o)` | true on tap | `o.kind` primary (magenta), positive (lime), secondary (violet), danger, info, icon; `o.icon` is a glyph name or `fn(ctx,cx,cy,size,t)`; `o.disabled`, `o.toggled`, `o.badge`, `o.sub` (second line), `o.pulse`, `o.size`, `o.aria`, `o.sfx` |
| `ui.panel(rect, o)` | inner rect | `o.title`, `o.rarity` (frame colour and glow), `o.glow`, `o.fill`, `o.pad` |
| `ui.tabs(id, rect, [{id,label,badge}], activeId)` | active id | changes on tap |
| `ui.scroll(id, rect, contentSize, fn(ctx, w, scroll, viewSize), {axis:'y'\|'x'})` | scroll state | drag with inertia, wheel, elastic edge. `fn` draws in local coordinates (0,0 is the content origin) and may call widgets normally; their hit regions are offset and clipped for you |
| `ui.bar(rect, v01, o)` | | `o.kind` hp, energy, progress, xp; `o.segments`, `o.markers[]`, `o.label`, `o.id` (adds the trailing ghost on hp loss) |
| `ui.toggle(id, rect, value, label)` | new value | |
| `ui.slider(id, rect, value, {min,max,step,label,format})` | new value | drag or arrow keys |
| `ui.card(id, rect, cardOrId, o)` | region state | 5:7 card using catart `drawCardArt` and `drawRarityFrame`; `o.level`, `o.count`, `o.selected`, `o.afford`, `o.cost`, `o.compact`, `o.lift`, `o.disabled` |
| `ui.catTile(id, rect, catId, o)` | region state | portrait tile; `o.level`, `o.stars`, `o.locked`, `o.selected`, `o.badge` |
| `ui.currencyStrip(rect, cur, {show})` | tapped currency id or '' | uses `drawCurrency` and counting tickers |
| `ui.badge(x, y, text\|true, {color})` | | notification bubble, (x,y) is the centre |
| `ui.ticker(key, target, {rate, from})` | displayed value | counts up toward `target`; snaps under reduced motion |
| `ui.toast(msg, kind)` | | kinds info, ok, warn, error, reward, legend (gold, only for best loot). Stack of 4, mirrored to the live region |
| `ui.tip(anchorRect, title, text)` | | queue a tooltip for this frame; call it when a region is hovered or long-pressed |
| `ui.dialog({id,title,text,body(ctx,rect,ui),height,buttons:[{id,label,kind}],onPick(id),dismiss,cancelId})` | | modal on top of everything; Escape or tapping outside picks `cancelId` |
| `ui.confirm(title, text, onYes, {danger,yesLabel,noLabel})` | | two-button dialog |
| `ui.region(id, rect, {focus,label})` | `{hover,down,tap,long,dragging,focus}` | low-level: any custom widget. The returned object is shared, read it at once |

Region state objects returned by `ui.card` and `ui.catTile` are shared too: read `tap` and friends immediately.

Other helpers: `ui.text(str,x,y,o)` (render/text.js `drawText`), `ui.wrap`, `ui.fit`, `ui.num` (formatNum), `ui.clear(color)`, `ui.background(districtId, {dim})`, `ui.vignette(a)`, `ui.scanlines(a)`, `ui.withClip(rect, fn)`, `ui.block(id)` (swallow input under a custom overlay), `ui.pushLayer()` / `ui.popLayer()` (widgets on a higher layer win hit tests and hide lower ones), `ui.state(key, init)` (persistent per-widget state, swept when unused), exported `drawGlyph`, `chamfer`, `vgrad`, `outBack`, `outCubic`, `hash01`.

Glyph names: pause play close back plus check speed1 speed2 speed3 auto cycle gear sound mute info menu star.

## 5. Input
Pointer events cover mouse and touch. A press that travels more than 9 px becomes a drag, so taps and scrolls never fight.
- `ui.px, ui.py, ui.down, ui.dragging, ui.dx, ui.dy` (frame delta), `ui.pressId` (region the press started on), `ui.tapId`, `ui.longId` (held 0.5 s without moving), `ui.hotId` (hover), `ui.wheel`.
- `ui.drop = {id, x, y}` for one frame after a drag that began on region `id` is released: drag and drop from any widget.
- Keyboard: `Tab` / `Shift+Tab` and arrow keys move a focus ring (dashed cyan) through focusable widgets of the top layer, `Enter` / `Space` taps the focused widget, `Escape` closes a dialog. Screens read other keys with `ui.keyHit('a')`, `ui.keyHit('escape')`, digits `'1'..'9'`; `ui.eatKey(name)` consumes one. `ui.keyboard` is true after a key press and false after a pointer press (the focus ring only shows in keyboard mode).
- Tests and labs drive the same code with `ui.input.down(x,y)`, `.move`, `.up`, `.wheel`, `.key(name)`.

## 6. Accessibility and motion
- `ui.announce(msg)` writes to a hidden `aria-live="polite"` region (`ui.announceLog` keeps the last 20 for tests). Toasts, dialogs, focus changes and battle events (wave, base low, victory, defeat, played card, speed) announce themselves. The canvas has `role=application` and an aria-label.
- `ui.reduceMotion` follows `prefers-reduced-motion` and can be forced with `ui.setReduceMotion(b)`. It snaps tickers, removes shine and scroll inertia, shortens transitions, drops screen shake in the battle screen and tells fx.js to drop chroma and shake.

## 7. Sound hook
`ui.onSound(name)` is called for: `ui_tap`, `ui_deny`, `ui_focus`, `ui_toggle`, `ui_tab`, `ui_open`, `ui_close`, `ui_toast`, `ui_long`. The battle screen calls `app.audio.sfx` with `card_select`, `card_play`, `card_cycle`, `deny`, `reward_tick`, `reward_key`, and forwards every sim event to `audio.onEvent(ev)`, `audio.music('battle'|'boss'|'win'|'lose')`, `audio.setIntensity(0..1)` and `audio.update(dt)`. Unknown names must be harmless no-ops in audio.js.

## 8. Battle screen (`screens_battle.js`, id `battle`)
`router.go('battle', params)` with `params = {district?, stage?, seed?, deck?, modifiers?, rewardMult?, noAdvance?, forceBattle?, returnTo?, onDone?(result, quit)}`. District and stage default to `profile.progress`. Echo stages (below the echo threshold) skip the sim and show an ECHO CLEAR result with the instant rewards unless `forceBattle`. On a win the new profile from `battleResult` is committed with `app.setProfile` plus `app.save()` as soon as the result is decided (so a closed tab loses nothing). Leaving calls `onDone(result, quit)` when given, else `router.go(returnTo || 'map', {fromBattle, won})`.

- Fixed 1/30 step with an accumulator, speed 1x/2x/3x, render interpolation of every unit between the last two states, hit-stop and slow-mo from fx.js, 0.35x time during a boss intro.
- Events are drained after each step, fed to `fx.consume` and `audio.onEvent`, and used locally for attack, cast, hit, death and burrow animation state.
- Input: tap a card to select (the detail strip shows its text and what to tap), then tap a tile, enemy or lane; or drag a card onto the field (the aimed tile is the point 26 px above the finger, a see-through cat shows where a summon lands). Cards with no target: tap twice, or drag up into the field. Drop on the hand to cancel. Tap a unit with no card selected to inspect it. Keyboard: `1..9` select, arrows move the cursor tile, `Enter` plays, `P` / `Escape` pause, `A` auto, `F` speed, `C` redraw hand.
- HUD: base hp bar, wave progress with wave ticks and a boss crown marker, timer, speed and pause buttons (top); relic strip with tooltips; the hand of cards with a detail strip; cyan energy gem and ten pips with the next pip filling; auto-play toggle (plays the best card every 0.4 s of battle time, deterministic, `autoPick(b)` is exported) and hand redraw (1 energy) at the bottom.
- Pause menu: resume, sound, auto, quit with a confirm dialog. Boss intro banner with portrait on the first spawn of each boss. Result overlay: title, stats, reward rows flying in with count-up numbers and bursts, crate key drop, Replay and Continue (or Retry and Leave).
- Speed, auto and mute persist between battles in the session (`BATTLE_PREFS`).

## 9. Lab
`lab/ui.html`: `?v=widgets` (contact sheet, add `&toast=1&dialog=1`), `?v=battle` (live, with `warp=<sim seconds>`, `auto=1`, `speed=1..3`, `sel=<hand index>`, `drag=1`, `stage=<n>`, `w=`, `h=`), `?v=boss`, `?v=pause`, `?v=result`. Serve the repo root and open `/midnight_mog/lab/ui.html`.

## 10. Integration additions (main.js)
- `ui.rectOf(id)` returns the rect of a region drawn last frame (or null). The tutorial uses it to spotlight real widgets.
- `ui.cachedDraw(key, x, y, w, h, interval, paint(ctx, w, h, t))` paints a slow animated layer into an offscreen canvas at most every `interval` seconds and blits it each frame (returns false without a document, so the caller paints directly). `ui.background` uses it (10 fps city) because rasterising the backdrop each frame costs about 17 ms on software canvases.
- The bottom navigation bar (`screens_hub.js`, 64 px, hidden on `title`, `battle`, `nine_lives` and during a crate ceremony) is reserved by raising `ui.safe.bottom` and shrinking `ui.content.h` before every frame, so screens that anchor to the bottom already sit above it. `main.js` keeps the real safe inset in `baseSafe`.
- Battle params gain `holdSim(b)`: when it returns true the sim does not advance (the tutorial freezes the fight while a spotlight waits).
- Router: `router.go(id, params, {kind, back, replace})`, `params.reset` clears the history (tab roots), `router.back()` pops it (never back into a battle) and lands on the hub when empty. `router.go` called while a transition is already covering the screen switches at once.
