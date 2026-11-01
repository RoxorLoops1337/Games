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
