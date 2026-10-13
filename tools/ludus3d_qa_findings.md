# Ludus Maximus 3D: QA findings (monkey, saves, accessibility, first run)

Machine generated runs live in `tools/ludus3d_qa_report.md` (rewritten by `node tools/ludus3d_monkey.mjs`). This file is the human write-up of what was found and what was done. Method and recipes: `.claude/skills/ludus3d-qa/SKILL.md`.

## Bugs found and fixed (my files)

| # | Where | Bug | Fix |
|---|---|---|---|
| 1 | ui_kit.js modal | Every dialog added its own Escape listener, so one Escape closed ALL stacked dialogs (a confirm plus the screen under it) | One capture handler drives the top modal only; also Tab trap and arrow key focus |
| 2 | css/ui.css | Sheet close button 40px, switches 56x32, photo mode chips and sliders 30-40px, replay bar chips 21px high and scrubber 16px on phones, title settings toggles 40px, fight HUD buttons 32px | 44px minimum everywhere (`pointer: coarse` for the dense fight HUD) |
| 3 | css/ui.css | Replay bar: the selected chip (1x, Auto) lost its gold fill to the bar's own chip rule, leaving dark text on a dark bar | Higher specificity rule restores the fill |
| 4 | css/ui.css | The bottom nav shrank to its content (the HUD column centres children), so "Roster" and "Market" rendered as "ROST..." and "MAR..." on a 390px phone | `.lx-hud .lx-nav {width:min(100%,520px)}`; the photo button rides above the nav on phones so it does not cover "Ludus" |
| 5 | game.js | A corrupt save disabled Continue and "New game" silently overwrote it. No way back | Recovery dialog (repair, restore backup, download the damaged file, start fresh with the damaged text stashed) |
| 6 | game.js | Failed storage writes were swallowed: the player believed progress was saved | `LM.save` returns false, one toast a minute tells the player to download a save file |
| 7 | game.js | A start-up exception left the "Forging the arena" boot screen forever | `fatal()` card with Reload, Download my save, Reset (stash, never delete); unhandled rejection toast afterwards |
| 8 | game.js | Failure to load a screen said "X is coming soon" | "Could not open X. Please try again." |
| 9 | game.js | Gear button was named "More" and opened a hub of sponsors and factions; players looking for sound or text size did not find Settings | Named "Settings and more", opens the Settings tab |
| 10 | game.js | Advance week with nothing entered silently only trains, the classic first-week confusion | Toast in the first three weeks: "No fight entered this week: your fighters will only train. Open the Arena to enter one." |
| 11 | more.js | The buildings screen only opened by tapping a plot in the 3D scene: invisible to keyboard and screen reader players, and a discoverability gap | More, Ludus, "Open buildings" |
| 12 | sk.js | Switch state only by knob position and colour | ON / OFF text on every switch, 44px hit area |
| 13 | ui_kit.js | Ultimate ready/cooling shown by ring colour only | "GO" text and double outline when ready, dashed ring and seconds when cooling, spoken label |
| 14 | ui_kit.js | Enemy and ally nameplates differed by colour only; progress bars had no names | Skull or shield icon, dashed edge for enemies, `aria-label`s, named bars |
| 15 | spelling | neighbours, Memorise, Favoured against the American spelling used everywhere else; tutorial said "him" for every fighter | Normalised |
| 16 | more.js | Imported saves did not bring their comfort options with them | `applyPrefs` also reads `S.opts` |

New accessibility features: keyboard (Esc, Tab trap, arrow keys through grids, tab rows, HUD), `role=dialog aria-labelledby`, HUD labels, `aria-current` on the nav, Large text that really scales px-based screens (zoom), High contrast (pref, `S.opts.hc`, follows `prefers-contrast`), reduced motion verified on 5 screens plus the OS media query, focus ring readable on light and dark panels.

New save features: schema version `S.sv` (inside the save, key `ludus_maximus_3d_v1` untouched), ordered migration steps, `LM.sanitize` for damaged fields, `LM.salvage` for truncated saves, backup key before the first upgrade, file export and import (JSON envelope), Settings > Save and backup.

## For other owners (exact repro)

1. **index.html** (not mine): `<meta name="viewport" ... maximum-scale=1,user-scalable=no>` blocks pinch zoom (WCAG 1.4.4). Repro: open on a phone and pinch. The canvas already sets `touch-action:none`; drop `maximum-scale=1,user-scalable=no`.
2. **tutorial.js / game.boot**: on a fresh profile "Welcome, Lanista" is drawn over the "Choose your first fighter" sheet and hides the first recruit card (boot opens recruit while the tutorial starts on the hub). Repro: Begin your ludus, Open the gates, screenshot at 390x800. Fix: open recruit after the welcome step is dismissed, or anchor the welcome card to the top.
3. **title.js** settings dialog has no High contrast toggle (the More screen has one).
4. **main.js**: errors thrown before `game.init()` (for example `createPost`) still end on the boot screen. `Game.init` is now guarded; the pre-game block is not. Wrap it and call `game.fatal(e)` once the Game exists, or show `#err`.
5. **core/data.js**: "armourer" (British) in one string, cosmetic.
6. **fightview.js**: HUD buttons rewrite `textContent` on toggles (`x1`, `Auto ult`), which drops the `.lx-btn-label` span; harmless today, breaks if a label style is added. Fight HUD has no spoken description of the fight state (damage, ultimate ready) beyond the ult button labels.
7. **hub.js**: no keyboard access to the 3D scene (orbit, picking a plot or fighter). All actions are reachable from menus now, but orbiting is pointer only.

## Ten biggest first-run friction points

1. Tutorial welcome card covers the first recruit sheet (see 2 above, not mine).
2. Nav labels truncated on phones (fixed).
3. Gear icon opened "More", not settings (fixed).
4. Advance week with nothing entered does nothing visible (fixed, toast).
5. No visible way to build except tapping a plot in 3D (fixed, More > Ludus).
6. A hidden save: no status, no backup, silent failures (fixed).
7. Explanations live in long-press tooltips on touch (pills with `tip`). Discoverable only by accident. Not fixed: needs a design decision (visible "?" or inline text).
8. First recruit costs most of the opening purse (198 of 250 gold, leaving 52) with no hint that gold also pays upkeep. Not fixed: balance and copy decision for the content owner. A one line hint on the recruit card ("Upkeep is paid every week") is cheap.
9. Two names for the same thing in copy: "ludus", "school", "barracks" beds, "fighters" and "gladiators". Left, it is Roman flavour, but the Help text uses all of them in one paragraph.
10. Tiny touch targets and unreadable selected replay chips (fixed).

## Remaining weaknesses

* Software GL makes first opens of Roster, Recruit and Profile take 4-12 s (portrait busts render on the main thread); real devices will be faster but a loading skeleton would still help on low tier phones.
* The monkey cannot judge the 3D canvas: it checks DOM, not whether a fight looks right. Pixels stay covered by `tools/ludus3d_shot.mjs`.
* Fight HUD is audited for overlap and tap size only during the replay and dialogs; live fight HUD at 800x390 with Large text was not stress tested (HUD text is not zoomed; only the menus are).
* Cloud save was not added: `functions/api/save.js` is No Room For Heroes specific (validates `data.runes && data.town`, 20 KB cap) and the 2D Ludus never used it. A Ludus endpoint needs its own function file, key prefix and size cap, with `expirationTtl >= 60`.
* The browser suites (`test:ludus3dqa`) take about 60 s each, so they are not in `test:ludus3d` or `check`.
