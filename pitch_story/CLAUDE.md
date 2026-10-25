# Pitch Story: Draft Day

Kairosoft-style football club manager with a roguelike card draft. Concept: `design/gdd/game-concept.md`.
Live at `/pitch_story/`, which forwards to `/pitch_story/play/` (do not rename this folder or the save key: they are live URLs and save data).

## Stack
Godot 4.7.1, GDScript, GL Compatibility renderer, 360x640 portrait base (stretch `canvas_items`, aspect `expand`).
Everything is code-drawn: no art or audio files (a pixel font and its OFL licence live in `assets/fonts/`). Engine reference
for this version: `@../docs/engine-reference/godot/VERSION.md` (the model's own knowledge stops around 4.3: read it first).

## Layout
- `src/core/`: the rules, no UI. `rng.gd` (seeded mulberry32), `players.gd`, `formations.gd` (4-4-2, 4-3-3, 3-5-2, 5-3-2),
  `cards.gd` (cards are data, one small rule interpreter, capped per channel), `match_sim.gd` (the match engine, see below),
  `club.gd` (league, money, facilities, draft, season roll-over), `save.gd` (versioned save + migrations).
- `src/ui/`: screens and `town_view.gd` (the diorama), `pitch_view.gd` (22 numbered players, ball moves between the players
  named in the events), `screen_match.gd` (event playback, live stats, team talks), `sfx.gd` (synthesised sounds), `app.gd`.
- `tests/`: `run_tests.gd` runs every `*.test.gd`. `balance.gd`, `cards_balance.gd`, `career.gd`, `mentality_probe.gd`,
  `energy_probe.gd` are probes, not tests: run them after touching the match engine and keep the numbers in the ranges below.
- `web/`: `shell.html` (page shell, unpacks the gzipped engine) and `cover.webp` (home page poster).
- `index.html`: forwards `/pitch_story/` to `play/`. The site serves the repo as it is (like `awesome_farm/`), so a game page must exist at the folder's own path or the URL falls back to the home gallery.
- `play/`: the committed web export, served at `/pitch_story/play/` (see below). Never edit it by hand.

## The match engine (`match_sim.gd`)
Possession football, action by action: the ball is with one player in one of four zones, and each pass, dribble, cross or
shot is rolled from that player's skills (finishing, passing, dribbling, tackling, keeper), his energy, the team channels
(atk/def/tmp/sta from base stats + cards + formation + mentality) and an opponent drawn by zone. Fouls, cards, penalties,
free kicks, corners, offsides, injuries, a bench and three substitutions. `step()` plays one minute and returns its events;
decisions (`set_mentality`, `substitute`) are made between steps at DECISION_MINUTES (30, 45, 65). Ratings and man of the match
come out of the same event stream. Mentality is a real trade-off (`SHAPE_PROGRESS`, `SHAPE_BLOCK`): defend = low-scoring and hard
to beat, attack = open game. Keep these ranges per match for two equal sides (probe `balance.gd`): about 2.7 goals, 22-24 shots,
10 on target, 5-6 corners, 18 fouls, 2 yellows, under 0.2 reds, draws 24-28%, about 350 events; a side +5 stronger wins 55-62%.
Energy (probe `energy_probe.gd`): about 80% at 30', 65% at 65', 50% at 90'.

## Rules (from the technical review)
- The match sim is a pure function of (seed, teams, cards, decisions) and returns an event log. Screens only DISPLAY it and
  never write back into match state.
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
