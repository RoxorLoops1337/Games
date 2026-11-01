# Meta and retention notes (Studio progress, Weekly Gig, friends, saves, difficulty)

## Studio levels made visible
- `doodle_env.js` exports `studioProps(levels)` (pure: Studio levels to prop tiers) and `drawStudioScene(ctx, w, h, t, studio, o)` (the Studio tab backstage scene, 504 x 170; `o.heroLv`, `o.outfits`).
- `drawStageBase(ctx, worldId, x, y, o)` has a new optional `o.studio` (an object of Studio levels, e.g. `profile.studio`). With it the stage the Static attack
  gains amp stacks (amp), a banner (heropow + herocd), string lights (hype + lucky) and truss poles (stagehp). Without it, or with `{}`, the plain stage is drawn.
  BATTLE VIEW TODO (battle.js and doodle_battle.js): pass `studio: app.profile.studio` in the two `drawStageBase` calls. Props are baked per (world, tiers), lights twinkle live.
  Note: the props reach about 90 px to each side and 100 px above the stage tile, so on Busk Street (stage mid board) they overlap lane tiles. Turrets draw on top.
- Fame level has a title (`fameTitle(level)` in data_meta.js, shown in the hub top bar and the import preview). Results UI could show the title on a level up.

## Weekly Gig
- `M.weeklyGig(p, now)` returns `{ id:'2026-W44', gig, name, mod, world, extra, seed, waves:25, done, best, msLeft }`. Week = ISO week in UTC (same as the server board id).
- Started by the hub through `app.startRun({ mode:'daily', world, seed, daily: mod, wavesTotal: 25, weekly:true, weekId, extraFx })`. It reuses the existing daily run options
  (`opts.daily` = one DAILY_MODS id, `opts.seed`, `opts.wavesTotal`); the extra effects ride on `baseFx`. No new sim option is needed.
- `run.cfg` carries `weekly`, `weekId`, `extraFx`, `difficulty`; `finalize` sets `run.result.weekly = true` and `run.result.weekId`, and `applyRunResult` pays the weekly branch.
  RESULTS UI TODO: for a weekly run `out.challenge` is `{ first, weekly:true, bonus:{ diamonds, records, fans, crate } }` (first claim of the week pays; later plays: half run
  rewards and no bonus). `run.result.mode` is still 'daily'; use `run.result.weekly` to title it "Weekly Gig". `submitBoard` posts to board id 'weekly' (cap 25 waves).
- Daily and Weekly always run on 'normal' difficulty so everybody plays the same run.

## Leaderboard
- Board ids: `endless:<world>`, `daily`, `weekly`. Server: `functions/api/dropbass_board.js` (weekly key `dtb:w:<ISO week>`, ttl 15 days, score cap 25, same 30 s per-IP throttle).
- Names are unauthenticated: sanitised (`cleanName`, same rule on client and server: word chars, space, `-`, `.`, `'`, collapsed, 16 chars max).
- Friends: `profile.friends` (array of names, max 30, `M.addFriend/removeFriend`, helpers `boardRows`, `cleanFriends` in lb.js). The board modal has tabs All / Friends,
  friends pinned first and highlighted, your row tagged YOU. Friends are matched by name only (case blind).

## Saves
- Keys: `drop_the_bass_save_v1` (main, unchanged), NEW `drop_the_bass_save_v1_bak` (last good save, no run snapshot), `drop_the_bass_save_v1_prev` (profile replaced by an import
  or reset), `drop_the_bass_save_v1_corrupt` (an unreadable main save kept for rescue).
- `M.commitSave(store, p)` serialises, parses back and checks the shape before touching storage; a poisoned profile (NaN money, broken shape) is never written, `main.js` repairs it
  and retries. The backup is not replaced by a far less advanced profile unless `{ force:true }` (reset, import).
- `M.loadSave(store, now)` returns `{ profile, source:'main'|'backup'|'new', recovered, corrupt, hadSave }`; main.js toasts "Recovered your last save".
- Resume: `M.checkResume(resume)` rejects impossible snapshots (NaN, born time after the run clock, bad slots, unknown turrets...). `saveResume` never overwrites a good resume with a
  bad one; the title shows CONTINUE RUN (stage, wave, turrets) only for a valid one; `resumeRun` falls back to the hub with a message if restoring fails.
- Save code: `DTB1.<base64>.<checksum>`; old raw base64 codes still import; the run snapshot is left out; import shows a preview before replacing.

## Difficulty
- `profile.settings.difficulty` ('easy' | 'normal' | 'hard', default 'normal'), segmented control at the top of the Tour tab. `startRun` passes `difficulty` to `new Run(...)` as
  `opts.difficulty` (also in `run.cfg.difficulty` and `run.result.difficulty`). Name and description are read from `DIFFICULTY` in data_core.js with a fallback (`M.difficultyInfo`).

## Board skins (cosmetic, selectable per profile)
- `doodle_env.js` exports `BOARD_SKIN_IDS = ['skin_paper', 'skin_chalk', 'skin_sticker', 'skin_midnight']` and `BOARD_SKINS = { id: { name, desc } }` (`art_world.js` re-exports both).
- Use it as an option: `drawBackdrop(ctx, worldId, w, h, t, { skin })` and `drawBoard(ctx, mapId, worldId, t, { skin })`. A missing, null or unknown id is `'skin_paper'` and draws exactly the look the game had before skins existed.
- `skin_paper` the ruled notebook page (default). `skin_chalk` dark slate with chalk-white outlines, dust smudges and a chalk border. `skin_sticker` bright scrapbook: pastel page, striped washi tape in the corners, die-cut star and heart stickers on the frame. `skin_midnight` inky navy page with glow-cyan outlines, neon stars and a faint frame glow.
- A skin overrides the palette (paper, lines, page, pads, lane, outline colour, tape) and adds decor on top of each world's own theme; props and enemies are not recoloured. Baked sprites are keyed by skin, so a switch costs one bake per (world, skin) and nothing per frame; Low graphics (`setArtScale(1)`) works the same.
- WIRING TODO (profile and shop agent): store the chosen id in the profile (for example `profile.settings.boardSkin`), validate it against `BOARD_SKIN_IDS`, and pass `{ skin: app.profile.settings.boardSkin }` in the battle view's `drawBoard` and `drawBackdrop` calls (`doodle_battle.js` and `battle.js`). The shop can list `BOARD_SKIN_IDS` with `BOARD_SKINS[id].name` and `.desc`.

## Second tour art (beach and moon)
- Backdrops, boards and stages exist for `beach` (Bonfire Beach) and `moon` (Moonlight Rave); the stage is a little boat on the beach and a floating moon rock on the moon.
- The bonfire sits on tile (3,3) of the beach map (animated crayon flames, drawn live over the baked stone ring). That tile is a buildable slot in `MAPS.beach`; the art shows the fire instead of a pad. If you want it solid, add `[3, 3]` to `blocked` in the beach map (the art handles both).
- Studio props (`drawStageBase` with `o.studio`) now only use free neighbour tiles (no lane, no blocked decor, on the board). Busk Street, where the stage is mid board, keeps both amp stacks in the free tiles beside the stage; stages with the lane arriving from above get a shorter truss and banner; stages with no free side tile (Mega Arena, Garage) tuck small amps behind the stage.
- 12 new cutscene scenes are in `doodle_scenes.js` (`NEW_IDS`, appended to `SCENE_IDS`, which `art_world.js` now takes from the doodle module). The boss scenes reuse the real boss art through `paintBoss` in `doodle_enemies.js`.
