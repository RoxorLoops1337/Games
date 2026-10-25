# Pitch Story: Draft Day

Kairosoft-style football club manager with a roguelike card draft. Concept: `design/gdd/game-concept.md`.
Live at `/pitch_story/` (do not rename this folder or the save key: they are live URLs and save data).

## Stack
Godot 4.7.1, GDScript, GL Compatibility renderer, 360x640 portrait base (stretch `canvas_items`, aspect `expand`).
Everything is code-drawn: no art or audio files (a pixel font and its OFL licence live in `assets/fonts/`). Engine reference
for this version: `@../docs/engine-reference/godot/VERSION.md` (the model's own knowledge stops around 4.3: read it first).

## Layout
- `src/core/`: the rules, no UI. `rng.gd` (seeded mulberry32), `players.gd`, `cards.gd` (cards are data, one small rule
  interpreter, capped per channel), `match_sim.gd` (event log), `club.gd` (league, money, facilities, draft, season roll-over),
  `save.gd` (versioned save + migrations).
- `src/ui/`: screens and `town_view.gd` (the diorama), `pitch_view.gd`, `sfx.gd` (synthesised sounds), `app.gd` (router, save).
- `tests/`: `run_tests.gd` runs every `*.test.gd`. `balance.gd`, `cards_balance.gd`, `career.gd` are probes, not tests.
- `web/`: `shell.html` (page shell, unpacks the gzipped engine) and `cover.webp` (home page poster).
- `play/`: the committed web export, served at `/pitch_story/` (see below). Never edit it by hand.

## Rules (from the technical review)
- The match sim is a pure function of (seed, teams, cards, calls) and returns an event log. Screens only DISPLAY it and never
  write back into match state.
- Randomness: always an explicit `PsRng`, never `randi()`/`randf()`. Integer maths in simulation code.
- Saves: `schema_version` in the state. To change the state shape bump `PsClub.SCHEMA`, add `PsSave.migrations()[n]` and a test.
  Never rename the save path. iOS Safari can evict site storage: Settings has export/import, keep it working.
- Cards stay data: new effect kinds go in `PsCards.card_delta`, with a test. No per-card scripts.
- Labels that share a row with expanding content use `PsKit.fixed()` (a wrapping label is squeezed to one letter per line).
- The pixel font lacks many symbols (circles, stars, arrows). Stay with letters, digits and plain punctuation.

## Test and build
    npm run test:pitchstory      # Godot headless suites; prints NOT RUN (exit 0) if no Godot binary is found
    npm run build:pitchstory     # export to pitch_story/play/ (needs Godot 4.7.1 + web export templates), then commit play/
    GODOT=/path/to/godot ...     # point at the binary when it is not on PATH
Godot 4.7.1 binary and templates: https://github.com/godotengine/godot-builds/releases/tag/4.7.1-stable
(web templates go in `~/.local/share/godot/export_templates/4.7.1.stable/`, only `web_nothreads_*` and `version.txt` are needed).
The web export is the single-threaded build, so the host needs no COOP/COEP headers. `index.wasm` (39 MB) is over Cloudflare
Pages' 25 MiB file limit, so `build_web.sh` ships `index.wasm.gz` and `web/shell.html` unpacks it in the browser.
`?preview=1..4` in the URL shows a grown club in the hub (never saves): handy for screenshots.

## Scope
MVP is the village league on endless seasons (see the concept's scope tiers). Next tiers: promotion to higher leagues, transfers,
staff, a defined ending, legends. Keep each one behind the same sim/UI split and add tests with it.
