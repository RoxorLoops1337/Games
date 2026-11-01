# Data translations (names, blurbs, perks, cutscenes, tips ...)

The data tables (data_*.js) keep their English text in code. A translation is an overlay: `js/lang/<da|nl|de>_data.js`
default-exports `{ 'path': 'text' }`. `js/i18n_data.js` writes the strings into the live data objects in place (same object
identity), so UI and canvas code that reads `TURRETS[id].name` shows the translation with no UI change.
`js/lang/en_data.js` is generated: `node tools/dtb_i18n_data.mjs --extract`.

## Wiring
- `i18n.js` already imports `lang/<code>_data.js` (loadLang) and notifies `onLang` when it arrived.
- `main.js`: call `initDataLang()` once at boot, BEFORE `initLang(...)` and before the UI subscribes to `onLang`
  (`import { initDataLang } from './i18n_data.js';`). It captures English, applies the current language and re-applies on every change.
- API: `applyDataLang(code, dict?)` (sync, returns number of translated fields), `initDataLang()`, `setDataDict(code, dict|null)` (override),
  `getSlots()`, `englishMap()`, `TABLES` (registry), `NON_TEXT_FIELDS`, `NON_TEXT_EXACT`, `EXCLUDED_EXPORTS`.

## Path keys
`TABLE.<key>...<field>`. Arrays of objects with unique string ids are keyed by id, other arrays by index.
Examples: `TURRETS.kick.name`, `TURRETS.kick.perks.3`, `ENEMIES.fuzz.blurb`, `REMIX.bass_boost.desc`,
`CUTSCENES.intro.panels.0.lines.1.text` (panel 0, line 1), `HINTS.hint_synergy.text` (HINTS_EXTRA shares the HINTS prefix),
`TUTORIAL.hello.say`, `LOOPY_TIPS.0`, `FAME_TITLES.10` (by level), `TURRET_BRANCHES.kick.kick_big_bang.name`,
`BOSS_PHASES.silence.enrage.text`, `OUTFITS.roxor.onesie.desc`, `SETS.mohawk.bonus.2.text`, `BOARD_SKINS.skin_chalk.name`.
Strings with no letter (wheel labels such as '100') are not translatable and are skipped.

## Derived copies
`TURRET_PARTNERS` (name/desc copied at import) is re-synced after every apply. `*_BY_ID` indexes and `HINTS_EXTRA` entries merged into
`HINTS` are the same objects (covered by identity). Anything that copies a data string into its own structure at import time must be
added to `afterApply()` in i18n_data.js.

## Adding data text
Add the field to the right pattern in `TABLES` (or a new `T(...)` row), run `--extract` and `--stub`, translate. A new text field in a
data table that is neither registered nor in `NON_TEXT_FIELDS` fails `tests/drop_the_bass_i18n_data.test.mjs`.

## Tool
`node tools/dtb_i18n_data.mjs --extract | --stub | --check`. Check: missing/extra keys, `{placeholders}`, em dashes, name length
(warn > 26, error > 30). Translators: keep names short, they are drawn on the canvas.
