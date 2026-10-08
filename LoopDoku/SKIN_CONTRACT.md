# LoopDoku skin contract

Your competition entry is now a **skin** of the real game. The owners picked **Comic Pop-Art** (#1) and **Anime Idol Stage**
(#2) as the two free skins. The other eight unlock with points that players earn by solving gigs. Every skin is one HTML page
at the repo root (`comic.html`, `idol.html`, `sticker.html`, `paper.html`, `studio.html`, `riso.html`, `jelly.html`,
`watercolour.html`, `pixel.html`, `neon.html`). All skins share one save, so a player can switch looks at any time and keep
their progress. **Keep all the juice you built.** This is an upgrade, not a rewrite.

## 1. Scripts (in this order, in place of the old single core include)
```html
<script src="loopdoku-core.js"></script>
<script src="loopdoku-levels.js"></script>
<script src="loopdoku-meta.js"></script>
<!-- idol.html only: <script src="rj-cast.js"></script> -->
```
Read the header comments of `loopdoku-core.js` (first ~70 lines) and `loopdoku-meta.js` (first ~30 lines). Do not edit those
files. The source of truth is `tools/*.src.js`, built by `node tools/build.mjs`. If you need a change there, say so in your report.

## 2. What changed in the rules (owner's request)
- **No auto-cross.** Placing a performer no longer crosses anything out (`autoCross` defaults to false). The player does it.
  The Settings "Auto-cross helper" (`LD.meta.settings().assist`) turns it back on, so keep your `source: 'auto'` ripple working.
- **Line arrows.** Draw a small triangle arrow in front of **every row** (left side, pointing right) and above **every
  column** (pointing down), in your style. Tapping one calls `game.crossLine('row' | 'col', index)`. That crosses out every
  empty square in the line, or, if the line has no empty square left, wipes that line's X's (it toggles). The engine emits
  one `mark` per square with `source: 'line'`, `k` (order) and `delay` (stagger), then a `'line'` event.
  - Make it **juicy**: the arrow squishes on press, the X's sweep along the line one after another, and the sound rises
    (the default audio already ticks along the line and adds a whoosh).
  - Show the arrow dimmed (still tappable) when `game.lineHasEmpty(kind, i)` is false. Refresh this after every `mark`.
  - Arrows must be **outside the hit area of `LD.bindInput`** (your `cellAt` must return -1 on them). Tap target at least 28 px.
  - Everything must fit at **10x10 on a 390x844 phone** (arrows + board within the width, no horizontal scroll), and still
    look great at 5x5.
- Mistakes still cost a mic (a wrong performer, including one placed on a square another performer rules out).

## 3. Levels, points and menus come from `LD.meta` and `LD.ui`
- Start or switch gigs only with `game = LD.meta.newGame(id)`. Without an id it continues the player's current gig. Re-wire
  your listeners to the new game (pass `() => game` to `LD.bindInput`).
- **HUD**: show `game.p.packName` + `game.p.num` (e.g. "Hard 12"; for the Daily Jam `packName` is "Daily Jam"), the gig
  (`game.p.city`, `game.p.venue`), board size, timer, 3 mics, the Loop Station and the player's points (`LD.meta.points()`).
- **Title screen buttons** (styled your way):
  - **Play**: continue `LD.meta.currentId()`.
  - **World Tour**: `LD.ui.levels({onPlay: id => startGig(id)})`.
  - **Daily Jam**: `startGig(LD.meta.daily().id)`.
  - **Looks**: `LD.ui.skins()`, the skin shop.
  - **Outfits**: your own screen, a free cosmetic, optional.
  - **How to play**: your demo.
  - **Settings**: `LD.ui.settings({onChange})`.
  - **Support us**: `LD.ui.support()`.
  - Show the points total somewhere on the title screen.
- **Game screen buttons**: Undo, Hint ("Ask Jasmin"), Clear X's, and Pause/menu. The menu offers World Tour, Looks,
  Settings, Restart gig and Title.
- **Win**: `const r = LD.meta.recordWin(game.p.id, e)` inside your `'win'` handler (once!). The win screen shows:
  - stars, time and mistakes, plus **"+r.points pts"** with a fun count-up;
  - a little breakdown: first clear, the star bonus, "Daily Jam ×2" when `r.daily`, and "replay" when not `r.firstClear`;
  - the new total;
  - the buttons **Next gig** (`r.nextId`; hide it when null) and **World Tour**.
  - If `r.affordable.length`, call `LD.ui.toast('New look affordable: ' + r.affordable[0].name)`.
  - **Support screen**: if `r.support` is true, then when the player taps Next gig or World Tour, first open
    `LD.ui.support({onClose: go})`, where `go` continues where they wanted to go. Never show it in the middle of a puzzle.
- **Lose** (0 mics): `LD.meta.recordLoss()`, then a quick, funny screen with **Try again** (same id) and **World Tour**.
- Remove your own World Tour stops and level picker. The shared `LD.ui.levels` replaces them. You may keep a decorative
  tour graphic if you like.
- **Theme the shared overlays** by setting these on `:root` to match your skin:
  `--ld-font --ld-font-display --ld-ink --ld-muted --ld-panel --ld-panel-2 --ld-backdrop --ld-accent --ld-accent-ink
  --ld-accent-2 --ld-accent-2-ink --ld-line --ld-radius --ld-shadow`.
  They must look like they belong to your skin.
- **Sound**: if you have your own mute button, call `LD.meta.set('sound', on)` so it is saved. The music setting is handled
  by meta (`LD.loop.silent`).

## 4. Remove competition-only things
- Remove the screen-picker chips/tabs, the UI kit screen, artist names in `<title>` (use `<title>LoopDoku</title>`), the
  `?state=mid` hook and debug globals other than `window.LDSKIN`.
- Keep hash routing for `#title`, `#game` and `#demo` (the demo plays a fresh copy of the 7x7 showcase puzzle
  `LD.PUZZLES[LD.DEFAULT_PUZZLE]` and must not touch the player's save; give it the arrow hooks
  `moveToLine(kind, i, ms)`, `pressLine` and `releaseLine`).
- Opening the page with no hash shows the title screen.

## 5. Test hook (required, used by `tools/skin_check.mjs`)
```js
window.LDSKIN = {
  game: () => game,                      // the live LD.Game
  start: (id) => startGig(id),           // switch to the game screen and start gig id
  screen: () => 'title' | 'game' | 'win' | 'lose' | ...,
  arrowRect: (kind, i) => DOMRect,       // the on-screen rect of a line arrow
};
```

## 6. Check your work
- Server: `http://localhost:5320/<skin>.html` (started for you).
- Run `node tools/skin_check.mjs <skin>`. It plays a 10x10 Extreme gig and a 5x5 Easy gig in phone emulation, taps the
  arrows, wins, checks the points, the support flow, overflow and console errors, and writes screenshots to
  `shots/<skin>-*.jpeg`. Look at them and fix what is ugly.
- Do at least two look-and-fix rounds. Report in under 200 words: what changed, how your arrows look and feel, the
  screenshot paths, and known issues.
- Only edit your own skin file (plus new files you need under `tools/` or `thumbs/` named after your skin).

## 7. Keep them playing (added: encouragement)
The meta layer now tracks win streaks, a day streak, a daily set (3 wins a day) and the next look to unlock, and picks a
cheer line from the duo. `recordWin` returns them (see the header of `loopdoku-meta.js`); its `r.points` already
includes the streak, day and daily-set bonuses.
- **Win screen**: append `LD.ui.winExtras(r)` (a themed card: cheer, 🔥 streak, 📅 day streak, daily set dots, a locked
  pack teaser, an animated progress bar to the next look). Place it under your points breakdown so it reads as part of
  your design. **Next gig must stay visible without scrolling at 390x844** (tighten the layout if needed) and be the
  boldest button; give it energy ("One more! ▶" / "Next gig ▶").
- **Lose screen**: `const rl = LD.meta.recordLoss()` now returns `{streakLost, cheer, nextLook}`. Append
  `LD.ui.loseExtras(rl)`.
- **Title screen**: show `LD.ui.titleExtras()` (rebuild it each time the title opens). Make Play say what is next, e.g.
  "Continue · Hard 12" (`LD.meta.level(LD.meta.currentId())`).
- **HUD**: when `LD.meta.state.streak >= 2`, show a small 🔥N streak badge in your style.
- **Juice**: when `r.streak >= 3`, `r.packUnlocked` or `r.goal.hit`, add an extra celebration flourish in your style.
- There are now up to nine packs (Easy, Normal, Chill XL, Hard, Expert, Terror, Extreme, Meltdown, Nightmare). The
  shared World Tour handles them; check that your HUD fits long pack names like "Nightmare 12" and "Meltdown 16".
- `tools/skin_check.mjs` now also requires a `.ldx` card on the title, win and lose screens.
