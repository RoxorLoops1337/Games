# No Room For Heroes

These notes load only when working in this folder. Shared rules (workflow, checks, deploy) are in the root `CLAUDE.md`.

Reply formatting: when working on No Room For Heroes, paste these links at the bottom of every reply:
  Play: https://games-71g.pages.dev/no_room_for_heroes/
  Align tool: https://games-71g.pages.dev/no_room_for_heroes/align.html
  Music player: https://games-71g.pages.dev/no_room_for_heroes/music.html
  Goblin sandbox: https://games-71g.pages.dev/no_room_for_heroes/sandbox.html

# Map

- **The game is `no_room_for_heroes/index.html`**: ONE file, markup + CSS + a single big `<script>`. No framework, vanilla canvas + DOM overlays. ~6k lines.
- `align.html`: standalone art-alignment tool (exports `rooms/layout.json`).
- `music.html`: standalone chiptune player (215 tracks; a deterministic composer generates 200 of them).
- `functions/api/board.js` + `functions/api/save.js`: Cloudflare Pages Functions (leaderboard + cloud saves, KV binding `BOARD`).
- `tests/no_room_for_heroes_*.test.mjs`: headless suites (`npm run test:boss`); `tests/no_room_for_heroes_lib.mjs` exports `loadGame(exposeStr)` which evals the game's inline script with a stubbed DOM (incl. a full no-op canvas ctx, so the `juice` suite drives `draw()`/`update()` to catch render-time errors the logic suites miss). The `tutorial` suite drives the whole guided run beat-by-beat. Write new tests with it; never create throwaway harnesses outside `tests/`. Other games' suites import this lib too, so a change to it runs their suites as well.
- `docs/HANDOVER_NO_ROOM_FOR_HEROES.md`: deeper architecture notes (G state object, phases, combat flow, balance history).

# SMALL-CHANGE PROTOCOL (for budget-model sessions)

You may be a lower-cost model session doing small tasks. Follow these rules strictly:

**You may freely change:** text/copy, CSS, button labels, colors, emoji, layout.json values,
README files, single-constant balance tweaks (see the dials table below), adding a music
track to a mood slot, asset filenames/paths, small additions to align.html.

**ESCALATE instead of changing (tell the user "this needs the main session") if the task touches:**
- camera/zoom math (`frameWave`, `frameWaveRun`, `minCam`, `zMin`, the follow block in `update`): it has subtle zoom-aware clamps that broke three times
- the save system (`localStorage` keys `bm_*`/`bossmonster_*`, `loadRunes/loadTown/saveTown`) or the cloud functions: data loss risk
- `simStep` / combat resolution / `heroDies` / wave spawning
- the music sequencer (`mtTone/musicTick`) or the composer in music.html
- anything requiring >~60 changed lines in index.html

**Game-specific hard rules:**
1. After any merge of origin/main, known zombie to grep for and kill: `awardTownResources` must have 0 hits in index.html.
2. Never rename `localStorage` keys, KV keys, or the `no_room_for_heroes/` folder.
3. The art system is graceful-fallback everywhere: missing art must never break the game.

# Art pipeline (owner uploads, code auto-detects)

- Frame sequences accept BOTH namings: `<id>_0.png,_1…` and `<id>_01.png,_02…` (and static `<id>.png`).
- Standard room: `rooms/empty.png` (+ `rooms/empty_broken.png` after champion smash).
- Trap overlays: `rooms/traps/<id>*.png`, strike animation synced to firing (up ~0.11s, down ~0.48s); `TRAP_ANIM` marks loopers (venom). Flame = 1 column duplicated ×4, ignites left→right (70ms cascade). Animated art exists for: spike, flame, venom(poison1/2), maul, arrow, frost, gallows, hexward, tesla. Per-trap z-order + positions in `LAYOUT.traps` / `rooms/layout.json`.
- Candle flames: `rooms/fx/candle_*.png`, loop ~9fps.
- Positions/sizes/layers/lights ALL come from `rooms/layout.json` (made with align.html). Don't hand-tune draw positions in code; fix the layout or the align tool.
- Lights: `LAYOUT.lights` {attach, fx, fy, r, a}: candle flicker / flame heat / venom vapor, additive glows.
- Champion death anim: `sprites/champion/death/champion_death_*.png`, plays once, holds last frame.
- Per-frame monster guards (orc, harpy, sentinel, mimic, minion): `sprites/<key>/<key>_<clip>_01.png` (or `_0`), configured in `MON_SPRITES` with `frames:true` (`s`, `ax`, `ay`, `fps`, `pp`, `once`), regenerated from the owner uploads with `tools/art/monster_frames.py`. The mimic draws `disguise:'chest'` until `g.ambushDone`, then plays `transform` once. Corrupted guards wear the Edrik/Vesna LPC skins (`corruptLookKey`), the painted demon once the room has 3 kills (`CORRUPT_DEMON_KILLS`).

# Balance dials (single-constant tweaks, safe for small sessions)

- Fed monster growth: `feedMul(k)=1+0.30*ln(1+0.10k)` (uncapped, diminishing)
- Rune income: `/8` in `awardRunes`; resources: wood `*0.05`, stone `*0.025`, shards `/8` in `pendingResources`
- Campaign difficulty: the `0.034` term in `difficulty()`
- Trap strike timing: `TRAP_RISE=110`, `TRAP_FALL=480`; flame cascade `70`ms; candle loop `110`ms
- Music volume under SFX: `MUSIC_SCALE=0.55`
- Rooms (slot model): `cap` slots (1→`MAX_SLOTS=5`, +1 per gold `upgradeRoomGold`), `room.units[]` = mix of traps (≤`MAX_TRAPS=2`; stack the same trap to raise its `lvl`≤`MAX_LEVEL=5`) + monsters (stack as independent guards in `cell.guards[]`; veteran from `room.kills`). Named fusions and room-merge-on-drag are REMOVED; curated trap-PAIR synergies (`SYNERGIES`, 102 pairs, 7 types, each with an overlay in `rooms/synergies/`) are live.
- Stacked traps: `TRAP_STACK_MUL=[1,0.8,0.6]` (2nd trap hits ×0.8; only ≤2 traps per room now, so the ×0.6 slot is unused)
- Den goblins: `GOBLIN_HP_FRAC=0.55`, hero retaliation `*0.4` in `goblinStep`, `GOBLIN_SPD=50`, cap `GOBLIN_DEN_CAP=20`
- Hero CC resistance (tames the freeze+oil/Inferno lock): `statusResist(h)` = level ramp `(lvl-1)*0.010` cap `0.45`, +`0.25` champion/+`0.10` elite, +`0.28` Wizard ward (`wardT`); scales freeze/oil/chill/shock duration via `ccDur`. `FREEZE_IMMUNE=3`s post-thaw no-refreeze window; `BURN_CAP=22` caps stacked burn (`addBurn`). Cleric cleanse + Mage `wardT` in `heroSpellTick`. Covered by `tests/no_room_for_heroes_balance.test.mjs`.
