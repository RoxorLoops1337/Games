Workflow:
- After committing + pushing to the feature branch, always create the PR (draft), then mark it ready and squash-merge to main without asking. Skip the "want me to merge?" question.
- Before EVERY push: run `npm run check` (build + all test suites). If it fails, fix it before pushing — never push red.
- Commit messages end with the session link the harness provides. Never put a model identifier in commits/PRs.

Reply formatting:
- When working on No Room For Heroes, paste these links at the bottom of every reply:
  Play: https://games-71g.pages.dev/no_room_for_heroes/
  Align tool: https://games-71g.pages.dev/no_room_for_heroes/align.html
  Music player: https://games-71g.pages.dev/no_room_for_heroes/music.html
  Goblin sandbox: https://games-71g.pages.dev/no_room_for_heroes/sandbox.html
- For other games: `https://games-71g.pages.dev/<folder>/`.

# Repo map (read this before touching anything)

- **The main game is `no_room_for_heroes/index.html`** — ONE file: markup + CSS + a single big `<script>`. No framework, vanilla canvas + DOM overlays. ~6k lines.
- `no_room_for_heroes/align.html` — standalone art-alignment tool (exports `rooms/layout.json`).
- `no_room_for_heroes/music.html` — standalone chiptune player (215 tracks; a deterministic composer generates 200 of them).
- `functions/api/board.js` + `functions/api/save.js` — Cloudflare Pages Functions (leaderboard + cloud saves, KV binding `BOARD`).
- `build.js` — copies static folders into `dist/` (Pages deploys `dist/`). New top-level folders must be added to `STATIC_PATHS`.
- `tests/no_room_for_heroes_*.test.mjs` — 11 headless suites; `tests/no_room_for_heroes_lib.mjs` exports `loadGame(exposeStr)` which evals the game's inline script with a stubbed DOM (incl. a full no-op canvas ctx, so the `juice` suite drives `draw()`/`update()` to catch render-time errors the logic suites miss). Write new tests with it; never create throwaway harnesses outside `tests/`.
- `HANDOVER_NO_ROOM_FOR_HEROES.md` — deeper architecture notes (G state object, phases, combat flow, balance history).

# Verify with ONE command

    npm run check        # build + all 11 suites — must be green before every push

# SMALL-CHANGE PROTOCOL (for budget-model sessions)

You may be a lower-cost model session doing small tasks. Follow these rules strictly:

**You may freely change:** text/copy, CSS, button labels, colors, emoji, layout.json values,
README files, single-constant balance tweaks (see the dials table below), adding a music
track to a mood slot, asset filenames/paths, small additions to align.html.

**ESCALATE instead of changing (tell the user "this needs the main session") if the task touches:**
- camera/zoom math (`frameWave`, `frameWaveRun`, `minCam`, `zMin`, the follow block in `update`) — it has subtle zoom-aware clamps that broke three times
- the save system (`localStorage` keys `bm_*`/`bossmonster_*`, `loadRunes/loadTown/saveTown`) or the cloud functions — data loss risk
- `simStep` / combat resolution / `heroDies` / wave spawning
- the music sequencer (`mtTone/musicTick`) or the composer in music.html
- anything requiring >~60 changed lines in index.html

**Hard rules for every session, every size:**
1. `npm run check` green before push. If you can't make it green, STOP and report.
2. After any merge of origin/main into the branch, RE-GREP for the feature you just added
   (squash-merges resurrect old code; resolve conflicts by keeping HEAD, then verify).
   Known zombie to grep for and kill: `awardTownResources` must have 0 hits in index.html.
3. Never rename `localStorage` keys, KV keys, or the `no_room_for_heroes/` folder.
4. Cloudflare KV: `expirationTtl` must be ≥ 60 — smaller values throw and 500 the request.
5. The art system is graceful-fallback everywhere: missing art must never break the game.

# Art pipeline (owner uploads, code auto-detects)

- Frame sequences accept BOTH namings: `<id>_0.png,_1…` and `<id>_01.png,_02…` (and static `<id>.png`).
- Standard room: `rooms/empty.png` (+ `rooms/empty_broken.png` after champion smash).
- Trap overlays: `rooms/traps/<id>*.png` — strike animation synced to firing (up ~0.11s, down ~0.48s); `TRAP_ANIM` marks loopers (venom). Flame = 1 column duplicated ×4, ignites left→right (70ms cascade). Animated art exists for: spike, flame, venom(poison1/2), maul, arrow, frost, gallows, hexward, tesla. Per-trap z-order + positions in `LAYOUT.traps` / `rooms/layout.json`.
- Candle flames: `rooms/fx/candle_*.png`, loop ~9fps.
- Positions/sizes/layers/lights ALL come from `rooms/layout.json` (made with align.html). Don't hand-tune draw positions in code — fix the layout or the align tool.
- Lights: `LAYOUT.lights` {attach, fx, fy, r, a} — candle flicker / flame heat / venom vapor, additive glows.
- Champion death anim: `sprites/champion/death/champion_death_*.png`, plays once, holds last frame.

# Balance dials (single-constant tweaks, safe for small sessions)

- Fed monster growth: `feedMul(k)=1+0.30*ln(1+0.10k)` (uncapped, diminishing)
- Rune income: `/8` in `awardRunes`; resources: wood `*0.05`, stone `*0.025`, shards `/8` in `pendingResources`
- Campaign difficulty: the `0.034` term in `difficulty()`
- Trap strike timing: `TRAP_RISE=110`, `TRAP_FALL=480`; flame cascade `70`ms; candle loop `110`ms
- Music volume under SFX: `MUSIC_SCALE=0.55`
- Rooms (slot model): `cap` slots (1→`MAX_SLOTS=5`, +1 per gold `upgradeRoomGold`), `room.units[]` = mix of traps (≤`MAX_TRAPS=2`; stack the same trap to raise its `lvl`≤`MAX_LEVEL=5`) + monsters (stack as independent guards in `cell.guards[]`; veteran from `room.kills`). Synergies/named fusions and room-merge-on-drag are REMOVED.
- Stacked traps: `TRAP_STACK_MUL=[1,0.8,0.6]` (2nd trap hits ×0.8 — only ≤2 traps per room now, so the ×0.6 slot is unused)
- Den goblins: `GOBLIN_HP_FRAC=0.55`, hero retaliation `*0.4` in `goblinStep`, `GOBLIN_SPD=50`, cap `GOBLIN_DEN_CAP=20`
- Hero CC resistance (tames the freeze+oil/Inferno lock): `statusResist(h)` = level ramp `(lvl-1)*0.010` cap `0.45`, +`0.25` champion/+`0.10` elite, +`0.28` Wizard ward (`wardT`); scales freeze/oil/chill/shock duration via `ccDur`. `FREEZE_IMMUNE=3`s post-thaw no-refreeze window; `BURN_CAP=22` caps stacked burn (`addBurn`). Cleric cleanse + Mage `wardT` in `heroSpellTick`. Covered by `tests/no_room_for_heroes_balance.test.mjs`.

# Deploy & infra

- Merge to main → Cloudflare Pages auto-builds `dist/` (~1 min). `_redirects` handles the old `/boss_monster/*` path.
- GitHub via `mcp__github__*` tools only (no gh CLI), scope `roxorloops1337/games`. Token can expire mid-session: commit+push anyway, PR when it recovers.
- Merge conflicts with origin/main after squash-merges are NORMAL. Resolve keeping HEAD (your branch), re-run `npm run check`, re-grep your feature.

# Generating pixel-art assets (local ComfyUI)

This repo has a local sprite generator under `tools/comfyui/`. When the user asks to
create, generate, or make a sprite / icon / item / tile / portrait, use it instead of
drawing by hand or reaching for a cloud service. Run from the repo root:

    python tools/comfyui/make_sprite.py "<subject prompt>" --name <short-name> --size <px>

- Auto-appends pixel-art style cues, renders on the local ComfyUI (SDXL + Pixel Art XL),
  pixelates (downscale + palette + transparent bg), and writes `assets/<name>.png`.
  Move the finished sprite into the game's art folders (`no_room_for_heroes/sprites/…`,
  `rooms/…`) and wire it like the other art.
- Default size 64; `--size 96` for more detail. Default palette is true color; pass
  `--palette tools/comfyui/palettes/pico-8.gpl` for a stylized 16-color look.
- `/sprite <subject>` is the slash-command shortcut (`.claude/commands/sprite.md`).
- One-time: `pip install pillow numpy`; verify with `python tools/comfyui/make_sprite.py --check`.
- Better models / quality knobs: see `tools/comfyui/README.md`.
- **REQUIRES a reachable local ComfyUI** (default `127.0.0.1:8000`). This works from
  Claude Code running on the owner's machine — NOT from cloud/web sessions, whose
  container can't reach the local ComfyUI. The pixelate half (`pixelate.py`) runs
  anywhere `pillow`+`numpy` are installed.
