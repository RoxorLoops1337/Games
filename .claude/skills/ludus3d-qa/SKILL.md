---
name: ludus3d-qa
description: Ludus Maximus 3D only. QA, saves and accessibility. The seeded monkey playtest (tools/ludus3d_monkey.mjs, tools/ludus3d_qa_lib.mjs) that audits layout, tap targets, reachability and stuck states at desktop, 390x800 and 800x390 touch; save versioning, migration, damaged-save recovery and file export/import (core/ext.js, game.js, screens/more.js); keyboard, screen reader, text size, high contrast, reduced motion and colour-blind cues (ui_kit.js, css/ui.css .lx-qa). Read before touching saves, modals, focus handling or settings.
---

# Ludus 3D QA, saves, accessibility

## Run the checks

    node tests/ludus_maximus_3d.test.mjs          # sim (Node only)
    node tests/ludus_maximus_3d_structure.test.mjs
    node tests/ludus_maximus_3d_saves.test.mjs    # save layer, Node only, 1 s
    node tests/ludus_maximus_3d_ui.test.mjs       # a11y + recovery, Chromium, ~60 s, skips (exit 0) without Chromium
    node tests/ludus_maximus_3d_monkey.test.mjs   # smoke monkey at 390x800 with Large text, Chromium, ~60 s, skips without Chromium
    npm run test:ludus3dqa                         # the two browser suites (not part of test:ludus3d / check: too slow)
    node tools/ludus3d_monkey.mjs --steps 60 --weeks 2 --seeds 1,2 --vp desktop,phone,landscape --replay   # long run, writes tools/ludus3d_qa_report.md (10 min per viewport under software GL)

The browser suites start their own static server on a random port (`serve()` in the lib), so they never depend on `python3 -m http.server 8211`.
Software GL is slow: opening Roster or Profile blocks the main thread for 3-8 s while portrait busts render. Never use 4 s timeouts. Open timeout is 20 s; a screen that still has no sheet then is a real `noopen`.

## The monkey (tools/ludus3d_qa_lib.mjs)

`monkey({vp, seed, steps, weeks, replay})` boots `?new=1&rich=1&empty=1&tier=low&manual=1`, gives three fighters, skips the tutorial, sweeps every screen and tab once (audit after each), then runs `steps` random actions:
open a screen (profile gets a real glad id, not 1: ids do not start at 1), click a random safe button in the top sheet (anything matching `DANGER` is skipped: delete, replace, import, new ludus...), Escape, Tab, API actions (hire, set activity, equip, buy, build or upgrade, enter events, hardcore on/off), settings toggles, photo mode open/close, close all. Every `weeks` interval it enters every event and runs the real `game.advance()` with dialogs auto-clicked and the fight stepped through `__LM3D.advance(1.5)`, optionally taking the Watch replay button once.

`audit()` (runs in the page, `auditFn`) reports: `overflow` (element or page wider than the viewport and not inside a clipping scroller; sheet taller than the viewport), `clipped` (overflow hidden text without ellipsis), `tap` (control under 44x44 on touch viewports; pure tooltip pills with tabindex are not controls), `a11y` (button or input with no accessible name), `unreachable` (scroll into view, hit test its centre: covered controls), `noopen`, `stuck` (scrim left after closeAll, week flow not finishing in 700 steps, photo mode not closing), `console` / `pageerror` / `rejection` (unhandledrejection hook installed with addInitScript), `overlap` (HUD buttons sitting on each other), `slow` (informational under software GL). It also reports content cut off by a non-scrolling ancestor, ellipsised chrome labels (nav, tabs, chips, button labels), and unnamed progress bars. Slide-in splashes (`.lx-vs`, level up, ceremonies) are skipped on purpose.
Always `settle()` before auditing: the sheet slides in for 300 ms and hit tests during the slide report false "covered" findings.
The human write-up of the last round (bugs, friction points, bugs for other owners) is `tools/ludus3d_qa_findings.md`.
Findings are de-duplicated by kind plus message, so one repeated bug is one line.

## Saves (core/ext.js, bottom block "QA: save versioning")

* The save object keeps `v: 1` (the loader's format marker) and gains `sv`, the schema version. `LM.SAVE_VER` is the current one (2). To change a field's meaning: bump `SAVE_VER` and add `LM.SAVE_STEPS[<old version>] = (S) => S`. Steps run in order from the save's `sv` (missing = 1).
* `LM.sanitize(S)` repairs a parsed save in place (non-numeric gold, bad plots, non-object containers, unreadable gladiators dropped, stats made finite) and returns the list of repairs. It runs inside `LM.migrate`, so load, import and ascend all get it.
* `LM.loadEx()` returns `{status: none|ok|migrated|newer|corrupt, S, raw, from, repairs, err}`. `LM.load()` is `loadEx().S` (null when corrupt, never throws).
* Keys: the live key `ludus_maximus_3d_v1` is never renamed. Extra keys: `..._v1_backup` (raw text kept once before the first upgrade), `..._v1_corrupt` (damaged text set aside by Start fresh), prefs stay in `ludus_maximus_3d_prefs`.
* Corrupt save: `game.boot()` calls `checkSave()` before the title. The "Save damaged" dialog offers Try to repair (`LM.salvage`: parses, or closes a truncated document by cutting back to a comma and adding brackets), Restore the backup, Download the damaged file, Start fresh (stashes the text, clears the key). The dialog loops until the player picks a way out; Escape just re-shows it.
* `LM.save` returns false and sets `LM.saveError` when storage is full or blocked; `game.save()` shows one toast per minute telling the player to download the file.
* More > Settings > Save and backup: Download save file (`{game, sv, exported, save}` JSON), Load save file (hidden file input), Show/Paste save code (old base64 still works). All imports go through `LM.parseImport(text)` which accepts the envelope, a bare save, a base64 code, or a truncated file (repaired, flagged) and refuses other games' files.
* Cloud save was deliberately not added: `functions/api/save.js` is No Room For Heroes only (validates `data.runes && data.town`, caps 20 KB, `save:` prefix) and the 2D Ludus never used it. A Ludus endpoint would need its own function file, key prefix and size cap; KV `expirationTtl` must stay >= 60.

## Accessibility (ui_kit.js, css/ui.css `.lx-qa` block, screens/sk.js)

* One capture-phase `keydown` handler drives the TOP modal only: Escape closes just that one (stacked dialogs used to all close at once), Tab and Shift+Tab are trapped inside it, arrow keys move focus spatially (`spatialFocus`) between buttons, tab rows and grids (not inside text areas, selects or sliders). With no dialog open the arrows walk the HUD buttons.
* Every modal is `role=dialog aria-modal` and `aria-labelledby` its title; focus returns to the opener on close, or to the dialog below.
* HUD: counters are `role=group` with `aria-label` "Gold 250", the week chip and Advance week button carry spoken labels (with fights due), nav marks `aria-current`.
* Text size: `body.lx-large-text` zooms the sheet content (`zoom: 1.16` on `.lx-sheet-scroll` and `.lx-actions`) so hard coded px fonts scale too, and resets the `--lx-fs-*` variables inside to avoid double scaling. Do NOT use zoom on the tutorial card or anything positioned from JS measurements.
* High contrast: `body.lx-hc` (pref `hc`, mirrored in `S.opts.hc`, also on when the OS says `prefers-contrast: more`). Reduced motion: `body.lx-reduce-motion` plus the media query; the UI test asserts no running animation longer than 50 ms on any screen.
* Colour-blind cues: ultimate ring says GO when ready (text plus double outline), shows seconds when cooling (dashed ring, `aria-label` "ready in 5 seconds"); switches show ON/OFF as text; pills use icons as well as tone.
* Tap targets: 44px minimum for controls (sheet close, switches 56x44, photo chips and sliders, fight HUD buttons on `pointer: coarse`).
* Focus ring: gold outline with a dark gap, readable on marble and on dark panels.

## Pitfalls

* `game.open('profile', id)` needs a real glad id. `game.open('building', {type:'plot', i})`.
* The first boot under software GL sometimes stalls past 60 s; `launch()` retries once.
* `closeAll()` marks scrims `lx-out` for 220 ms before removal: count `.lx-scrim:not(.lx-out)`.
* ext.js is edited by several agents: add only inside tagged blocks and re-read before editing. `LM.migrate` is wrapped several times (venatio, QA, sponsors...). Order does not matter for the QA wrapper because `sanitize` runs first inside it, but never move `LM.load` / `LM.save` back to the sim.js versions: `loadEx` and the failure flag live in the QA block.
* No em dashes anywhere (the structure test greps).
