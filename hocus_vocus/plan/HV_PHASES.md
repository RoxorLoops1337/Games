# HOCUS VOCUS: the phases (agent F: process, ownership, gates, agent prompts)

Status: PHASES rev 1 (agent F). Phases merged: P0 f4720c3, P1 f0c9d7b, P2 f28333c, P3 to P8 5377a0f, 8C, P9 and P10 55d3bbd, P11 fixes (this PR; see git log for the sha). HV_BASE ada3ca5 (the fork on main). Each phase PR edits this line in the same commit (`Phases merged: P0 <sha>, P1 <sha>, ...`).

This file is the executable order of the Hocus Vocus re-theme. It decides WHEN each piece of work happens, WHO (which agent) owns which
files, and which GATES a phase must pass. It never decides a word, a name, a picture or a sound: those live in the content plans
(section 0, rule 4). It is modelled on `rogue_book/ECHO_PLAN.md` sections 8 and 9 (the Echowake re-theme, eleven PRs, all merged, bot
records byte-identical), adapted to a bigger change: Hocus Vocus renames every card, enemy, Charm and status, replaces the hero art with
the owners' chibi cast, redraws all 51 enemies and re-voices the whole score.

## 0. How to use this plan

1. Read sections 0 to 3 once, then the section of the phase you are running. The plan files are long: never read one whole. Find a
   section with `grep -n '^#' hocus_vocus/plan/<file>` and read it with the Read tool's offset and limit.
2. Twelve phases, P0 to P11, strictly in order, each ONE pull request (branch, work, gates, push, draft PR, ready, squash merge, sync,
   play link: section 2). Never start a phase before the previous one is merged.
3. Inside a phase the lead (you) runs the listed agents in parallel; their files are disjoint by construction. Where a row says "then",
   that agent runs after the named one (same file, or it needs the earlier result). Give every agent the preamble of section 5 plus its
   prompt. Agents never commit, push, branch or run `npm run check`; the lead reviews the diff, runs the gates, commits and ships.
4. Authority. `HV_BIBLE.md` wins on every word and every name. Then, each in its own domain: `HV_HEROES.md` (heroes, the 160 cards,
   barks), `HV_ENEMIES.md` (the 51 enemies and the Headliners), `HV_WORLD_DATA.md` (Charms, gems, Stickers, Encores, tiles, Spells,
   keywords, statuses, the Tour Bus, settings, How to Play), `HV_STORY.md` (Detours, the Tour Diary, tips, curtain lines, the social
   panel), `HV_ART_AUDIO.md` (every picture and every sound), `HV_UI_COPY.md` (every other UI string; written in P0) and this file
   (order, ownership, gates). If this file and a content plan disagree about WHAT, the content plan wins; about WHEN or WHO, this file
   wins. A conflict found during a phase is resolved to the bible, noted in the PR body, and fixed in the plan file in the same PR.
5. House rules for everything anyone writes (code, data, comments, tests, docs, commit messages, PR bodies): never an em dash or an en
   dash (the hygiene suite scans every text file; use a comma, a colon or a full stop; in player copy also never ` - ` or `--` used as a
   dash). No tab indentation. Never write the literal name of the platform's unseeded random function, not even in a comment: say "the
   banned random call" and use `U.rng` or `tk.rng`. ES2020 only. British spelling. Printable ASCII in every DATA string.
6. These NEVER change: the folder `hocus_vocus/`, the URL `https://games-71g.pages.dev/hocus_vocus/`, the storage keys `hv_profile_v1`,
   `hv_run_v1` (and every `hv_*` key; the only new key is `hv_skins_v1`), the `package.json` script `test:hocus_vocus`, the `build.js`
   entry `'hocus_vocus'`, the test file names `tests/hocus_vocus_*`, `tools/hocus_vocus/`, the env switches `RB_STRICT`, `RB_GAME_ONLY`
   and every other `RB_*` (they are ids), and every internal id of bible rule H1.
7. Echowake stays untouched and playable (bible H13): no phase edits anything under `rogue_book/`, `tools/rogue_book/` or
   `tests/rogue_book_*`, and the root games index keeps the Echowake card exactly as it is (gate G4).
8. P1 and P2 change visible words. Ship them on the same day so the live site shows mixed vocabulary for as short a time as possible.
   The art phases (P3 to P7) show new and old art side by side for a while; each screen stays self-consistent, which is acceptable.

## 1. The phases at a glance

| Phase | PR title | Visible change | Agents | Content plan units (HV_ART_AUDIO 12) |
|---|---|---|---|---|
| P0 | Hocus Vocus P0: plan, kit, baselines and theme-proof tests | none | 4 + lead steps | none |
| P1 | Hocus Vocus P1: names and rules text | every name and rules sentence (cards, enemies, Charms, gems, statuses, keywords, tiles, Spells, heroes) | 6 | none |
| P2 | Hocus Vocus P2: story and UI copy | every sentence and label: Detours, the Tour Diary, barks, tips, Stickers, Encores, menus, How to Play, tutorial, title | 6 | none |
| P3 | Hocus Vocus P3: the chibi cast and outfits | the four heroes and Jordan in the owners' chibi style, outfits, card hero art | 4 | A1, A1b, A2, part of A7b (2.9) |
| P4 | Hocus Vocus P4: logo, title, stage scenes and the UI skin | logo, title, end scenes, Green Room, Merch Stall, Detour board, menus, transitions, the whole UI skin | 4 | A3a, part of A3b, A4a, A4b, A9 |
| P5 | Hocus Vocus P5: Act I, Blossom Bay, and the combat look | Act I creatures and Kraki, Act I backdrops, combat fx and hit words, status and UI icons | 4 | E1a to E1c, part of A3b, A8, A6a |
| P6 | Hocus Vocus P6: Act II, Scrollopolis, and the cards | Act II creatures and Scrollspinner, Act II backdrops, all 59 card motifs, the 66 Charm icons | 4 | E2a to E2c, part of A3b, A7a, A7b, A6b |
| P7 | Hocus Vocus P7: Act III, the Perfect Stage, and the map | Act III creatures and Flawless, Act III backdrops, the map | 3 | E3a to E3c, part of A3b, A5 |
| P8 | Hocus Vocus P8: the band, the sound and the sample hook | all music, all sfx, Spell voices, the sample hook | 4 | S1 to S5 |
| P9 | Hocus Vocus P9: follow the duo, share and support | the links strip, Share, Support, the sixth Tour Bus tab | 4 | none |
| P10 | Hocus Vocus P10: docs, theme guard, cover and site card | docs, the permanent Hocus Vocus guard, the games index card, the cover | 4 | A10 |
| P11 | Hocus Vocus P11: independent verification and fixes | fixes only | 4 + fixers | none |

Every phase passes G1 (determinism IDENTICAL), G3 (check green), G4 (Echowake untouched) and G7 (screenshots looked at); G2 (saves)
runs in P0, P1, P3, P9 and P11; G5 (plan coverage) in P0 and P11; G6 (theme) from P1 on, with the permanent guard from P10.

## 2. Common procedure (every phase)

Variables used below: `SP` is your session's scratchpad directory (the system prompt names it); `BR` is your session's feature branch
(never `main`); `HV_BASE` is the SHA in the Status line above.

### 2.1 Resume protocol (a new session starts here)

Nothing outside the repository survives between sessions or containers. So:

1. The plan lives in the repository (`hocus_vocus/plan/`, committed in P0). If it is missing from `origin/main` and you are not in P0,
   stop and ask the owners for it.
2. Find the next phase from git, never from memory:
   ```
   cd /home/user/Games && git fetch origin main
   git log origin/main --oneline | grep 'Hocus Vocus P'
   ```
   The next phase is the first of P0 to P11 with no merged squash commit whose title starts `Hocus Vocus P<n>:`. Cross-check with the
   Status line of this file on `origin/main`.
3. Baselines are never carried between sessions: G1 and G2 rebuild them from `HV_BASE` into `$SP/hv_baseline/`.
4. Read `/home/user/Games/CLAUDE.md` once per session (it overrides this plan where they differ), then section 0 and your phase.

### 2.2 Before starting a phase

Before the very first P0 only: run P0 lead steps 0a and 0b first (the kit copy, then the fork onto main). Step 0b exists because the fork
itself may not be committed yet (`build.js` and `package.json` modified, `hocus_vocus/`, `tests/hocus_vocus_*` and `tools/hocus_vocus/`
untracked); the reset below would throw the `build.js` and `package.json` wiring away.

```
cd /home/user/Games
git status --short                      # must be clean (before P0 merges: clean except "?? hocus_vocus/plan/" and "?? tools/hocus_vocus/rj_art/")
BR=$(git branch --show-current)         # your feature branch; NEVER main
git fetch origin main
git reset --hard origin/main            # start the phase exactly at main (the previous phase is merged)
```

### 2.3 Checks while you work

- Inner loop: `node tests/hocus_vocus_<name>.test.mjs`; groups: `node tests/hocus_vocus_all.mjs text treasure meta narrative content data`
  (the runner filters by substring).
- Before shipping: `node tests/hocus_vocus_all.mjs` (about 5 minutes) and `node tests/hocus_vocus_all.mjs --strict`.
- Slow suites (Echowake timings, the fork is the same size): `scene` 41 s, `screen_combat` 50 s, `browser` 54 s (real Chromium),
  `screen_menu` 68 s, `screen_node` 93 s, `screen_map` 110 s, `game` 234 s (`RB_GAME_ONLY=pause,save node tests/hocus_vocus_game.test.mjs`
  runs a part). Run them with `run_in_background` and wait with Monitor; never a foreground sleep.
- `npm run check` (build plus every game's suites) takes well over 10 minutes: only the gated push script of 2.5 runs it.

### 2.4 The phase grep (until the permanent guard of P10 exists)

Every agent greps the files it owns for Echowake words inside string literals, and reports every remaining hit (an internal id, a comment,
a test-local fixture, or an allowed survivor of bible 6.4 are fine; anything else is a leak):

```
OLD='\b(Echowake|ECHOWAKE|Echo|echoes|echoing|Hush|hushed|Chimes?|Ballads?|Setlist|Keepers?|Fables?|Tempo Trials?|Daily Jam|Hall of Echoes|Verses?|VERSE|Songs?|Songbird|Songweaver|Drum Line|Ripple|Shout|Beat Drop|Chorus|Temple Bell|Tuning Forge|Downbeat|Dead Silence|Champions?|Peddler|Campfire|Ambush|Gem Cache|Treasures?|journeys?|Journey|Hanae|Kuro|Suzu|Raiga|Kuzunoha|Jorogumo|Conductor|Damper|Energy|Exhaust(ed)?|Retain|Innate|Ethereal|Downed|Front row|Back row|Liner note|Play on|joins the band|yokai|kitsune|shrine|temple|torii|kimono|shamisen|koto|taiko|shakuhachi|sakura|samurai)\b'
grep -nE "['\"\`][^'\"\`]*$OLD" <your files>
```

Status words that are still common English (Might, Weak, Burn, Mark, Charge, Ward, Bind) are not in the grep: the DATA scan of the P1
acceptance covers them.

### 2.5 Ship procedure (CLAUDE.md workflow)

1. Commit on `BR`. Message: first line = the PR title; a short body (what changed, which tests changed and why); the last line is the
   session link your harness provides. NEVER put a model name or model identifier in a commit or a PR (CLAUDE.md).
2. Gated push. Save this script once as `$SP/gated_push.sh` (set `SP` and `BR` inside), run it with the Bash tool in the background
   (`run_in_background: true`, timeout 3600000) and wait for its log to end with `done` (Monitor with an until-loop on
   `grep -q '^done' $SP/gated.log`):

   ```bash
   #!/bin/bash
   # Verify the committed HEAD in an isolated worktree with the full repo check; push only if it exits 0.
   SP=/path/to/your/scratchpad
   BR=your-feature-branch
   cd /home/user/Games
   SHA=$(git rev-parse HEAD)
   WT=$SP/wt_${SHA:0:8}
   LOG=$SP/gated.log
   RUNLOG=$SP/gated_${SHA:0:8}.log
   LOCK=$SP/gated.lock
   if [ -e "$LOCK" ] && kill -0 "$(cat $LOCK)" 2>/dev/null; then echo "another gated run is active ($(cat $LOCK))" > $LOG; echo done >> $LOG; exit 1; fi
   echo $$ > $LOCK
   : > $RUNLOG
   git worktree prune
   rm -rf $WT; git worktree add -q --detach $WT $SHA && ln -s /home/user/Games/node_modules $WT/node_modules
   cd $WT
   if npm run check >> $RUNLOG 2>&1; then
     echo "check green for $SHA" >> $RUNLOG
     cd /home/user/Games && git push --force-with-lease=$BR origin $SHA:refs/heads/$BR >> $RUNLOG 2>&1 && echo "pushed $SHA" >> $RUNLOG
   else
     echo "check RED for $SHA, not pushing" >> $RUNLOG
   fi
   cd /home/user/Games && git worktree remove --force $WT
   echo "done" >> $RUNLOG
   rm -f $LOCK
   cp $RUNLOG $LOG
   ```

   The first push of a new branch has no lease: if `--force-with-lease=$BR` refuses because the remote branch does not exist, push once
   with `git push -u origin $SHA:refs/heads/$BR` after a green check.
3. RED log: read it. A failing `hocus_vocus` suite is yours: fix, commit, rerun. A failing suite of ANOTHER game: do not touch that game;
   re-run that one suite alone (several are randomised); if it still fails, push your work anyway after confirming every `hocus_vocus`
   suite is green, and name the game and the assertion in your reply (CLAUDE.md hard rule 1).
4. PR with the GitHub MCP tools only (scope `roxorloops1337/games`): `mcp__github__create_pull_request` (head `BR`, base `main`, `draft:
   true`, the PR title, a body listing what changed, the tests edited and why, the gates run with their results (IDENTICAL, saves,
   check), every string an agent had to invent, every plan conflict resolved, the screenshots looked at, and ending with the attribution
   lines the harness gives for PR descriptions minus any model identifier); then `mcp__github__update_pull_request` with `draft: false`;
   then `mcp__github__merge_pull_request` with `merge_method: 'squash'`. Do not ask the owners first (CLAUDE.md). If the token has
   expired, the push still counts: open the PR when it recovers.
5. Sync after the merge: `git fetch origin main && git reset --hard origin/main && git push --force-with-lease=$BR origin HEAD:refs/heads/$BR`.
6. If you ever merge `origin/main` INTO the branch (conflicts after a squash merge are normal): resolve keeping HEAD, re-run the checks and
   re-grep your feature (2.4 before P10; `node tests/hocus_vocus_theme.test.mjs` from P10 on).
7. End your reply to the owners with the play link: `Play: https://games-71g.pages.dev/hocus_vocus/` (Pages rebuilds about a minute
   after the merge).

### 2.6 Screenshots (G7)

Save this helper once as `$SP/shot.sh` and call it as `bash $SP/shot.sh <name> "<js>" [frames] [viewports]`:

```bash
#!/bin/bash
SP=/path/to/your/scratchpad
cd /home/user/Games && mkdir -p $SP/shots
node tools/hocus_vocus/shot.mjs --url "hocus_vocus/index.html?notutorial=1" --js "$2" --frames ${3:-90} --viewports ${4:-1280x720,844x390} --out $SP/shots/$1.png
```

Gallery sheets: `node tools/hocus_vocus/shot.mjs --sheet <name> --out $SP/shots/<name>.png`. Look at EVERY PNG with the Read tool. PNGs
never go into the repo. The standard screen set (named S below), each with its `--js`:

| Name | js |
|---|---|
| title | `GAME.debug.open('title')` (also at `390x844`, and with `UI.setSetting('textScale', 1.3)` first) |
| hero | `GAME.debug.open('heroSelect')` (also at text scale 1.3) |
| map | `GAME.debug.open('map', {painted: 0.3})`, then a second shot with the legend open |
| fight1 | `GAME.debug.open('combat', {heroes: ['hanae', 'kuro'], enemies: ['kappa', 'oni_cub']})` with `--frames 120` |
| fight2 | `GAME.debug.open('combat', {heroes: ['suzu', 'raiga'], chapter: 2})` |
| fight3 | `GAME.debug.open('combat', {heroes: ['kuro', 'suzu'], chapter: 3, tier: 'elite'})` |
| boss1, boss2, boss3 | `GAME.debug.open('combat', {chapter: N, enemies: ['boss_kuzunoha' or 'boss_jorogumo' or 'boss_editor']})` |
| reward | `GAME.debug.open('reward', {source: 'elite'})` |
| nodes | `GAME.debug.open('shop')`, `'event'`, `'camp'`, `'forge'`, `'chest'`, `'gemcache'` (one shot each) |
| bus | `GAME.debug.open('library', {tab: 'unlocks' or 'achievements' or 'story' or 'bestiary' or 'history'})` (five shots) |
| menus | `GAME.debug.open('settings')`, `GAME.debug.open('howto')` (pages 1, 2 and 7 with the arrow key in a `--steps` file) |
| diary | `GAME.debug.open('story', {id: 'intro' or 'victory' or 'defeat' or 'hero_kuro'})` |
| ends | `GAME.debug.open('chapterClear', {chapter: 1})`, `GAME.debug.open('gameOver')`, `GAME.debug.open('victory')` |
| pause | the map, then a `--steps` file with `{"key": "Escape"}` |
| rotate | `GAME.debug.open('title')` at `390x844` with no "play anyway" |

## 3. Gates

### 3.1 G1 determinism: no mechanic changed

The baseline is the bot's per-run records of the fork as it was before the re-theme (`HV_BASE`), rebuilt in every session, so no
session depends on files another one left behind. It lives in `$SP/hv_baseline/` and is never committed. About 6 s per bot run.

```
cd /home/user/Games
git fetch origin main
HV_BASE=<the SHA in the Status line>
git worktree prune; rm -rf $SP/hv_base
git worktree add --detach $SP/hv_base $HV_BASE && ln -s /home/user/Games/node_modules $SP/hv_base/node_modules
mkdir -p $SP/hv_baseline
(cd $SP/hv_base && node tools/hocus_vocus/bot.mjs --all-pairs --runs 4 --trial 0,5 --seed 7 --combat greedy --effort fast --jobs 4 --quiet --brief --runs-out $SP/hv_baseline/det_before.json --json $SP/hv_baseline/det_before_sum.json)
node tools/hocus_vocus/bot.mjs --all-pairs --runs 4 --trial 0,5 --seed 7 --combat greedy --effort fast --jobs 4 --quiet --brief --runs-out $SP/hv_baseline/det_after.json --json $SP/hv_baseline/det_after_sum.json
cmp $SP/hv_baseline/det_before.json $SP/hv_baseline/det_after.json && echo IDENTICAL
git worktree remove --force $SP/hv_base
```

It must print IDENTICAL in every phase. The run records hold ids and numbers only (the bot reads `DATA.resolveCard` ops, never text), so
renaming changes nothing; the summaries (`*_sum.json`) do contain display names and WILL differ: never compare them for the gate. If the
records differ, `node tools/hocus_vocus/bot.mjs --diff $SP/hv_baseline/det_before_sum.json $SP/hv_baseline/det_after_sum.json` shows the
drift: a re-theme change touched logic; find it and revert that part.

G1b, the deeper variant (P1 and P11 only, because P1 rewrites the text generator the search bot's card valuation sits next to): the same
commands with `--combat ai --effort fast --runs 2 --trial 0` and the files `det_ai_before.json` / `det_ai_after.json`. Must print
IDENTICAL.

### 3.2 G2 save compatibility (guards data loss)

A run and a profile written by the pre-re-theme build must load in the current build:

```
# 1. in the HV_BASE worktree (create it as in G1), let the old build write a run save:
(cd $SP/hv_base && node tools/hocus_vocus/shot.mjs --url "hocus_vocus/index.html?debug=1&notutorial=1" --js "GAME.newRun({heroes:['hanae','kuro'],seed:7}); GAME.save(); JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter((k) => k.indexOf('hv_') === 0).map((k) => [k, localStorage.getItem(k)])))" --frames 120 --out $SP/hv_baseline/save_before.png > $SP/hv_baseline/save_before.txt)
grep -c hv_run_v1 $SP/hv_baseline/save_before.txt          # must print 1 or more
# 2. extract the store (shot.mjs may print it as a quoted string: unquote once)
node -e "const fs=require('fs');const l=fs.readFileSync(process.argv[1],'utf8').split('\n').find((x)=>/^[{\"]/.test(x.trim()));let v=JSON.parse(l.trim());if(typeof v==='string')v=JSON.parse(v);fs.writeFileSync(process.argv[2],JSON.stringify(v));" $SP/hv_baseline/save_before.txt $SP/hv_baseline/store.json
# 3. load it in the current tree:
node tools/hocus_vocus/shot.mjs --url "hocus_vocus/index.html?notutorial=1" --store "$(cat $SP/hv_baseline/store.json)" --js "document.querySelector('[data-act=continue] .mn-p-sub').textContent" --frames 90 --out $SP/hv_baseline/save_title.png
# (do not return a promise through --js here: it never settles under the frozen clock; set a flag and use --steps)
printf '[{"js":"GAME.continueRun().then(() => { window.__done = 1; })","frames":150},{"expect":"window.__done === 1"},{"shot":"%s"}]' $SP/hv_baseline/save_map.png > $SP/hv_baseline/continue_steps.json
node tools/hocus_vocus/shot.mjs --url "hocus_vocus/index.html?notutorial=1" --store "$(cat $SP/hv_baseline/store.json)" --steps $SP/hv_baseline/continue_steps.json
```

Acceptance: before P1 the Continue line reads `Verse 1, Echo N, Hanae and Kuro`; from P1 on it matches `/^Act 1, Vox \d+, Jasmin and
RoxorLoops$/`; `continueRun` resolves and the PNG shows the map; shot.mjs reports no console error. From P3 on also: a profile whose `ach`
holds `petal_and_steel`, `ink_and_insight` and `moonlit_vigil` (add them in the `--js` of step 1 through the live `META.profile` and
`META.save()`, after reading the META header for the exact shape) shows the three outfits unlocked in hero select, and a store without
`hv_skins_v1` draws stage clothes.

### 3.3 G3 the repository check

`npm run check` green before every push (through 2.5), plus `node tests/hocus_vocus_all.mjs --strict` green.

### 3.4 G4 Echowake untouched

```
git diff --stat origin/main...HEAD -- rogue_book tools/rogue_book 'tests/rogue_book_*'      # must print nothing
git diff origin/main...HEAD -- index.html | grep -n "rogue_book"                             # must print nothing (P10 adds a card, never edits Echowake's)
```

### 3.5 G5 plan coverage

`node tools/hocus_vocus/plan_check.mjs` exits 0 (every content id appears in the plan files). P0 and P11.

### 3.6 G6 theme

P1 to P9: `node tests/hocus_vocus_theme.test.mjs` (the transitional suite: the Inkwoven words stay banned; P1 and P2 adjust it, see
those phases) plus the phase grep of 2.4 over the phase's files. From P10: the permanent Hocus Vocus guard (P10 agent 10B), which is
also the re-grep after any merge of `origin/main`.

### 3.7 G7 screenshots looked at

Every phase lists its shots. Rendering is not enough: open each PNG with the Read tool, compare it with the plan's brief, fix, render
again. Art agents iterate at least three rounds per drawing (HV_ART_AUDIO 1, rule 10).

## 4. The phases

Prompt template for every agent (the lead fills the brackets; the preamble of section 5 goes first):

```
Phase <Pn>, agent <id> (<name>). You own: <files>. Read: <plan sections, with their grep anchors>.
Task: <the task lines of your row>.
Tests you must edit (same edit session as the code they pin): <list>. Never delete an assertion: change what it expects and say why.
Run when done: <tests>. Report as the preamble says.
```

### P0: plan, kit, baselines and theme-proof tests (no visible change)

Goal: make the work resumable and safe before one word changes. Commit the plan and the owners' approved chibi kit into the repository,
record HV_BASE and the baselines, reconcile the plan files, write the missing UI copy table, and make every test that pins a DATA-owned
name read it from DATA, so that P1 changes data files without touching the screen suites. Depends: nothing.

Lead first, in this order:

0a. The chibi kit, the VERY FIRST action of P0, before any long check (today it exists ONLY in the planning session's scratchpad, and a
   new container loses it). The source is the absolute path `/tmp/claude-0/-home-user-Games/1c3bba4c-59e1-55ff-8ccc-2b0dbbf19791/scratchpad/rj_art/` (the planning session's scratchpad; a
   new session has a different `$SP`, so never look for it under your own `$SP`). Copy exactly these seven files, `kit.js`, `roxor.js`,
   `jasmin.js`, `crew.js`, `sheet.js`, `render.mjs` and `index.html`, to `tools/hocus_vocus/rj_art/`, and add a short
   `tools/hocus_vocus/rj_art/README.md` (what the files are, that the owners approved these figures, that P3 ports them into
   `js/art_cast_kit.js` and `js/art_cast.js`, and that the reference images are NOT in the repository). Never copy `ref_*` images (two
   are photos of real people; the chibi cards are the owners' artwork: open question O5), the `_*` scratch files or `out/`. If that
   absolute path is gone and `tools/hocus_vocus/rj_art/` is not on `origin/main` either, stop and ask the owners for the kit before P3.
0b. The fork onto main, only when `git fetch origin main && git cat-file -e origin/main:hocus_vocus/js/combat.js` fails, and with NO
   reset: commit `hocus_vocus/` (minus `hocus_vocus/plan/`), `tests/hocus_vocus_*`, `tools/hocus_vocus/` (minus `tools/hocus_vocus/rj_art/`),
   `build.js` and `package.json` as `Hocus Vocus fork: the Echowake engine copy` (a title that deliberately does not match
   `Hocus Vocus P<n>:`, so the resume rule of 2.1 never mistakes it for P0). Then the gated push, PR and squash merge of 2.5. HV_BASE is
   that merge SHA. Only after this run 2.2 and the steps below.
1. Plan commit. `node tests/hocus_vocus_hygiene.test.mjs` (the plan files are scanned for dashes and tabs), then commit
   `hocus_vocus/plan/*.md` alone: `Hocus Vocus P0: add the re-theme plan` (last line the session link).
2. Kit commit. Run the hygiene suite (tool files are scanned for dashes and the banned random call) and commit
   `tools/hocus_vocus/rj_art/` (the seven files of step 0a and the README).
3. HV_BASE. `git fetch origin main`; confirm the fork is on main (`git cat-file -e origin/main:hocus_vocus/js/combat.js`; if it is not,
   go back to step 0b). Write `HV_BASE <short sha of origin/main>` into the Status line of this file.
4. G1 sanity: build the baseline from HV_BASE and compare with the current tree: IDENTICAL. Optional proof that the fork's engine is
   Echowake's: the same bot command with `tools/rogue_book/bot.mjs` at HV_BASE gives byte-identical records (read only, never edit
   Echowake).
5. G2 step 1 and 2: `save_before.txt` contains `hv_run_v1`, `store.json` exists.
6. `build.js`: add `hocus_vocus: new Set(['plan'])` to `SKIP_IN_DIST` so the plan is never deployed (default; the owners may veto, O12).
   Verify `node build.js && ls dist/hocus_vocus` shows no `plan`.

| Agent | Owns (edit) | Task |
|---|---|---|
| 0A reconcile | `hocus_vocus/plan/HV_BIBLE.md`, `HV_HEROES.md`, `HV_ENEMIES.md`, `HV_WORLD_DATA.md`, `HV_STORY.md`, `HV_ART_AUDIO.md` | lint the plans against each other and the suites' limits, fix conflicts, append a reconciliation log to the bible |
| 0B copy table | NEW `hocus_vocus/plan/HV_UI_COPY.md` | every player-facing UI literal of the fork with its Hocus Vocus string and its phase |
| 0C test reads I | `tests/hocus_vocus_screen_combat.test.mjs`, `tests/hocus_vocus_scene.test.mjs`, `tests/hocus_vocus_screen_end.test.mjs`, `tests/hocus_vocus_browser.test.mjs`, `tests/hocus_vocus_ui.test.mjs` | DATA reads instead of DATA-owned literals |
| 0D test reads II | `tests/hocus_vocus_screen_menu.test.mjs`, `tests/hocus_vocus_screen_node.test.mjs`, `tests/hocus_vocus_screen_map.test.mjs`, `tests/hocus_vocus_game.test.mjs`, `tests/hocus_vocus_narrative.test.mjs`, `tests/hocus_vocus_enemies_1.test.mjs`, `tests/hocus_vocus_enemies_2.test.mjs`, `tests/hocus_vocus_cards_suzu.test.mjs`, `tests/hocus_vocus_content.test.mjs` (the keyword word list only) | the same |

Prompt 0A (task lines):
```
Write a scratch lint in your scratchpad (never in the repo) that reads every name table of the five content plans and checks:
1. uniqueness, case-insensitive, across the 160 card names, 66 Charm names, 24 gem names, 51 enemy names, every enemy move name, the 6
   Spells, 20 statuses, 16 keywords, 14 tiles, 32 Stickers, 10 Encores, 4 passives, 4 hero titles, the reserved names of bible H16;
2. the suites' limits: card names 3 to 28 characters and 1 to 3 words (one exception: Calling of the Moon), Charm text 12 to 90
   characters and one sentence, Act I move names 3 to 24 and says 3 to 70, Act II says at most 48, Act III move names 3 to 28 and at
   most 5 words, says 3 to 64, phase says 8 to 90, enemy lore 60 to 260 characters and 1 to 2 sentences, Tour Diary entries 400 to 700
   characters and at least 6 sentences starting with a letter, barks 4 to 64, tutorial hint titles at most 30 and texts 40 to 230;
3. bible 6.2 and 6.3 words, H3 real names, H4 admin words, H5 animal products, H6 food words, H7 tone words, dashes, ASCII, American
   spellings, and lowercase "run" as a noun.
Then resolve every finding and these known conflicts in the plan files (bible first, then the domain file), defaulting as follows:
a) verify only: the curses Stage Fright and Hot Take clash with no enemy (HV_ENEMIES 2.1 names oni_cub Jitterbug and chochin
   Flamebait, on purpose); keep the curse names and rename nothing;
b) Encore trial_7 "Limited Edition" contains "edition" (bible 6.3): already in bible 6.4 as an allowed survivor (a merch print run,
   added by the plan editor); the P10 guard allowlists it; verify only;
c) the Begin label "Start the Daily Duet" is 20 characters and fails the hero select width model at Larger text (294 px needed, 259
   available, tests/hocus_vocus_screen_menu.test.mjs near "Begin labels"): bible 5.2 becomes "Start Daily Duet" (242 px fits);
d) the sixth Tour Bus tab "follow" (HV_STORY 5.3): already applied by the plan editor (bible 5.5 and HV_WORLD_DATA 10 say six tabs,
   keys 1 to 6); verify only;
e) the link config: already applied by the plan editor (bible 7.2, HV_STORY 5.2 and HV_WORLD_DATA 11 all read DATA.LINKS in
   js/data.js); verify no HV_LINKS is left;
f) HV_ART_AUDIO 13 items 1 to 5 (logo letter colour, RawClaw's look, Jasmin's mic, RoxorLoops's hit word): items 2 and 4 are
   already applied by the plan editor (bible 3.1, 3.3, 7.1 and HV_HEROES Petal Note, Lean In, Synth Zap, Finger Drumming and the skin
   lines follow the approved drawings); verify no "keytar" or "mic-wand" for Jasmin's own mic is left in HV_BIBLE.md or HV_HEROES.md,
   and flag item 1 and item 5 as owner questions in the log;
g) passive `blade_flow` is now "Every Note Blooms" (the plan editor renamed it away from the Spell "Vocal Run"): verify no "Vocal
   Runs" is left in any plan file.
Append "## 8. Reconciliation log (P0)" to HV_BIBLE.md: one line per change (file, row, old, new, reason). Finally run
node tools/hocus_vocus/plan_check.mjs (must exit 0).
```

Prompt 0B (task lines):
```
Build HV_UI_COPY.md, the Hocus Vocus equivalent of ECHO_PLAN Appendix B and C. Enumerate every player-facing literal of
js/data_text.js, run.js, meta.js, ui.js, main.js, scene.js, screen_map.js, screen_menu.js, screen_node.js, screen_combat.js,
screen_end.js, tutorial.js, index.html, gallery.html and every CSS content string (reuse the literal walker of
tests/hocus_vocus_theme.test.mjs in a scratch script: string and template literals with ${...} replaced by X, prose only, developer
messages skipped). For each literal that carries an Echowake word, an Echowake tone, an old name or a hard-coded DATA name, write one
row per file: | line | Echowake literal | Hocus Vocus literal | source | phase |. Take the new text from the bible (4.9, 4.10, 5) first,
then HV_WORLD_DATA 10 to 12, HV_STORY 3.4, 3.5, 5 and 6, HV_HEROES 4.2; where no plan has it, write it in the bible's voice (1.4) and
mark the source "new". Phase is P1 for data_text.js, run.js and meta.js, P9 for the social strings, P2 for the rest. Add a section
"Copy budgets" (map info chip action line 66/52/40 characters, tutorial hint title at most 30 and text 40 to 230, the Begin button width
model, the 84 px slim title plaques, the hero name plates with RoxorLoops) and a section "Test pins" listing, per test file and line,
which assertion each row changes (use section 9 of HV_PHASES.md as the starting list). Plain markdown, no dashes.
```

Prompt 0C and 0D (task lines, the same for both, with the agent's own list from section 9):
```
Make every assertion that compares with a DATA-owned name read that name from DATA of the same boot (use the suite's own DATA variable;
escape for RegExp with const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') added once near the top when needed).
DATA-owned means: hero name, title and passive name (DATA.heroes), enemy name, title, move name and say (DATA.enemies, DATA.rosterById),
Charm and gem names (DATA.relics, DATA.gems), Sticker and Encore names (DATA.achievements, DATA.trials), lore titles (DATA.lore), tile,
Spell, keyword and status names (DATA.tiles, DATA.brushes, DATA.keywords, DATA.statuses), Detour choice labels (DATA.events). Copy written
by a screen (labels, toasts, kickers) is NOT DATA-owned: leave it for P2. Test-local fixtures (synthetic payloads like name: 'Leaf Imp' in
a fed event, DATA.add fixtures) stay exactly as they are. The game must not change at all: run your suites before and after; both green.
Your rows are listed in HV_PHASES.md section 9 ("P0" entries); report any other DATA-owned literal you find.
```

0C specifics: `screen_combat` 291 and 292 (`'Kuro is down'`, `'Suzu is stunned'`: the name part from DATA, the tail stays), 356
(`'Kuzunoha'`), 363 (`'Oni Brute'`), 453 and 458 (`'Hanae is stunned'`, `'Hanae is down'`), 290 and 665 (status names `Thorns`,
`Regen`), 720 and 721 (`'Blossom Blade'` is the hero title, `'Blade Flow'` the passive; leave `'Front: +2 damage'` and `'Back: '` for P1),
1124 (`'Kappa'`), 1129 (`/Vulnerable 2/`), 1364 (`/Crow Tengu intends/`: the name from DATA, ` intends` stays); `scene` 1154 and 1162
(the boss banner text read from `DATA.enemies.boss_kuzunoha.name`); `screen_end` 275 (`'Kuzunoha'`), 306 and 398 (`/Suzu joins the band/`:
the name from DATA, the tail stays for P2), 322 (`/Sunken Lantern City/` becomes `DATA.lore.ch2_intro.title`), 429 and 445 (hero names);
`browser` 108, 109, 259, 260 (press `.mn-cards button[data-hero=hanae]` and `[data-hero=kuro]` instead of the `'^Hanae'` label text);
`ui` 571 (`UI.tip.info(DATA.keywords.front.name)`), 576 (`DATA.statuses.poison.name + ' 3'`; the stubbed `statusText` at 577 is a
fixture), 687 (`DATA.keywords.exhaust.name`), 812 (hero name).

0D specifics: `screen_menu` 251 and 255 (`DATA.achievements.ch1_clear.name`, `ch2_clear`, the boss name), 268, 284, 763, 770, 1156,
1183 (hero names), 277 and 278 (`/Bloom/` from the status, `/Blade Flow/` from the passive), 374 (Encore names from `DATA.trials`), 723
(`DATA.lore.ch1_intro.title`; the `Verse 1: ` prefix is P2's), 728 and 734 (`'Kappa'`); `screen_node` 775 (`'Brass Lantern'`), 888 and
891 (the Detour choice label from `DATA.events`), 1421, 1756, 1760 (`/Ember Ruby/` from `DATA.gems`), 1563, 1566, 1571, 1575 (hero
chips); `screen_map` 309 (`/Ambush/` becomes `DATA.tiles.enemy.name`), 1699 (`/Whispering/` becomes the ch1 lore title); `game` 214
(the hero names; `/Verse 1/` is P1's), 676 (`/Kappa/`), 678 (hero names); `narrative` 539 (the hero name regex built from
`DATA.heroes[h].name`), 710 and 712 (`/Brass Lantern/`, `/Fox Mask/` from `DATA.relics`); `enemies_1` 96 and `enemies_2` 128 (the
boss name and title from `DATA.rosterById`); `cards_suzu` 452 to 467 (each `/Mark/`, `/Retain/`, `/Ward/`, `/Might/`, `/Stun/`, `/Weak/`,
`/Vulnerable/`, `/Innate/`, `/Exhaust/`, `/Thorns/`, `/Taunt/`, `/Swap/` becomes `new RegExp(DATA.statuses.<id>.name)` or
`DATA.keywords.<id>.name`; `/Front/`, `/Back/` and `/fall|down/i` are generator wording: P1); `content` 254 (the keyword words read
`DATA.keywords` names for `block exhaust retain innate ethereal unplayable`; the literal `'Energy'` stays for P1).

Lead after the agents: review the diff (no file under `hocus_vocus/js`, `hocus_vocus/css` or the two pages changed: `git diff
origin/main --stat -- hocus_vocus/js hocus_vocus/css hocus_vocus/index.html hocus_vocus/gallery.html` prints nothing), `node
tests/hocus_vocus_all.mjs`, `--strict`, G1, G4, G5, set the Status line, commit, ship. Screenshots: none (nothing visible changed).
Acceptance: plan, kit and HV_UI_COPY.md are on main; plan_check exits 0; every row of section 9 marked P0 is done.

### P1: names and rules text (data only)

Goal: every DATA name and every generated rules sentence speaks Hocus Vocus. Sources: bible 4.1 to 4.5, 4.8 to 4.10; HV_HEROES 1 to 4;
HV_ENEMIES 2 to 4 and 7; HV_WORLD_DATA 2, 3, 6 to 9 and 13; HV_UI_COPY rows of phase P1. Depends: P0. Visible: every name and rules text.

| Agent | Owns (edit) | Sources | Tests it edits |
|---|---|---|---|
| 1A data core (two sessions in a row: 1A-i `js/data.js`, CONTENT_SPEC 4.1 and the `data` test; then 1A-ii `js/data_text.js` with the `text`, `content` and `combat` suites) | `js/data.js` (statuses, keywords, brushes, tiles; heroes `name`, `title`, `blurb`, passive `name` only, NOT the colours (P3); `ROSTER_SRC` names, roles and boss titles; the relic validator accepts the optional `flavor` string, printable ASCII, at most 80 characters, ending `.`, `!` or `?`; a display table `DATA.COLOUR_NAME = { red: 'pink', blue: 'blue', green: 'green', gold: 'gold', any: 'rainbow' }`), `hocus_vocus/CONTENT_SPEC.md` (section 4.1 tables and the boss titles line ONLY), `js/data_text.js` | bible 4.2 to 4.5, 4.8, 4.9, 4.10; HV_HEROES 4.2; HV_ENEMIES 2.3, 3.3, 4.3; HV_WORLD_DATA 6 to 9 | `text`, `combat` (intent text expectations only), `content` (every generated sentence and grammar regex: 254 `'Energy'`, 277, 278, 306, 307, 314, 381, 437, 447), `data` (838 roster role) |
| 1B Jasmin, RoxorLoops and shared cards | `js/data_cards_hanae.js`, `js/data_cards_kuro.js`, `js/data_cards_shared.js` (names, flavours, header comments) | HV_HEROES 2.1, 2.2, 2.5 | `cards_hanae` (the 1 to 3 words rule gains the one named exception `hanae_blade_duet`, Calling of the Moon), `cards_kuro` 809 and 810 (`/exhaust/` becomes `/fade/`, `/retain/` becomes `/hold/`: they read the lowercased card text, which 1A's generator now prints as Fade and Hold) |
| 1C RawClaw and Andy cards | `js/data_cards_suzu.js`, `js/data_cards_raiga.js` | HV_HEROES 2.3, 2.4 | `cards_suzu` (`/Front/`, `/Back/` become the lead and backing words, `/fall\|down/i` becomes `/voice/i`), `cards_raiga` |
| 1D enemies | `js/data_enemies_1.js`, `js/data_enemies_2.js`, `js/data_enemies_3.js` (`name`, boss `title`, move names, says, phase says, lore, tags, header comments) | HV_ENEMIES 2 to 4, 7 | `enemies_3` 200 (the one shared move name `Smooth Over`, still `eraser_wraith,boss_editor`), any enemy literal 0D did not convert |
| 1E Charms, gems and logic copy | `js/data_relics.js` (name, text, flavor), `js/data_gems.js`, `js/run.js` and `js/meta.js` (string literals only; reason codes like `reason: 'ink'` stay) | HV_WORLD_DATA 2, 3, 13; bible 4.9 (run log lines); HV_UI_COPY rows for run.js and meta.js | `treasure` (the OPWORD, MODWORD, ROWWORD, TRIG, TGTWORD and TIERWORD dictionaries and the pinned samples of HV_WORLD_DATA 13), `run` 655, 1294 (`/Vox/`), 1337 (`'Act 3 only'`), 1408 (`/kind\|give\|Detour/i`, a silent guard), `meta` 332, 333 (`'Act 2, Vox 5, Jasmin and RoxorLoops'`, `'Act 1, Vox 1, Andy and RawClaw'`), `screen_menu` 122 only (`/Act 1/`), `game` 214 only (`/Act 1/`), `narrative` 716 only (`/sharpen/i` becomes `/rehearse/i`: run.js `DEAD_DECK_TEXT.upgradeCard` becomes `Nothing left to rehearse`); the run log mercy line of run.js is `A passer-by hums along: 1 Vox.`, the same sentence 2C uses for the map toast |
| 1F theme transition and long names | `tests/hocus_vocus_theme.test.mjs`, `css/combat.css` (`.ch-name` and hero name plates only), `css/menu.css` (hero select name plates and the Continue summary only) | bible 4.8 (name widths), 6.4 | `theme` (see below), `screen_combat` 1586 only (the name width rule) |

Agent notes (add to the prompts):
- 1A: the generator words the bible does not spell out take these defaults (report each use): `your Exhaust pile` becomes `your Faded
  pile`; `is Exhausted` becomes `fades`; `a card with Exhaust` becomes `a card with Fade`; `in the front row` becomes `in the lead`;
  `(7 in the Front row)` becomes `(7 in the lead)`; `an Elite or a Keeper` becomes `a Rival or a Headliner`; `revive that hero` becomes
  `bring them back`; `a hero falls` / `you fall` become `a hero loses their voice` / `you lose your voice`; hero filters read the DATA
  name (`RoxorLoops cards`). Two traps: `sumi` was "Breath" in Echowake and is **Groove** now, while **Breath** is now the energy word: the
  text.test lines that read `Spend all Breath` (Echowake sumi) become `Spend all Groove`, and every `Energy` becomes `Breath`. The text
  suite has about 200 literal pins: rewrite them with a scratch script that applies the bible 4.3 and 4.9 word map to the expected
  literals only, then run the generator on every failing case and check the new sentence reads like the bible's examples. Never edit the
  test-case names or the synthetic ids. ROSTER_SRC and the enemy files (1D) must end equal; the enemies suites are red until both finish.
- 1B, 1C: card ids, numbers, ops, art motif ids, rarities and costs never change; flavours at most 80 characters (HV_HEROES 4.4).
- 1D: limits of 0A's lint; bosses keep phase structure; `tags` are display only.
- 1E: flavours need 1A's validator line; until it lands, `treasure` and `data` may be red.
- 1F: (a) theme check 6 (lowercase "song" banned in UI and rules text) contradicts bible 6.4 (lowercase song and chorus are allowed in
  prose): rescope it to the names and texts of tiles, Spells (`brushes`), keywords and statuses, where "song" as a map tool must never
  come back; say why in a comment. (b) Check 7b (the noun "run") must allow the musical sense: add `RUN_ALLOW_CONTAINS` entries, each with
  its reason, for `Vocal Run` (the Spell), `vocal runs` (her blurb and cards) and any card name the run
  of the suite reports that uses run as a verb (for example `Run It Again`); the noun run meaning a tour stays banned. (c) Names:
  RoxorLoops is 10 letters, wider than any name before (Hanae was 2.98 em in `.ch-name`): set the minimum width and the name plates so
  the row tags still align, measure with screenshots at 1280x720, 844x390 and text scale 1.3, and update the screen_combat width test
  with the measured number.

Lead after the agents: `node tests/hocus_vocus_all.mjs`; any red screen suite that asserts a generated or DATA string is fixed by reading
DATA (screen copy itself is P2's); `--strict`; G1 AND G1b (both IDENTICAL: this is the riskiest phase); G2 (Continue reads `Act 1, Vox N,
Jasmin and RoxorLoops`); G4; the DATA scan: boot the content scripts (as the theme suite does) and list every display field of every
registry except `events` and `lore`, `achievements`, `trials`, `tips` (P2) that still contains a bible 6.2 word or one of the 20 old
status names, 16 old keyword names, 14 old tile names or 6 old Song names; it must be empty. Set the Status line, commit, ship.
Screenshots: hero (all four heroes: name, title, blurb, passive), fight1, fight2, fight3 (card texts, status tooltips, intents with
`Big hit`, `Hype up`, `Jinx`), boss1 (Kraki's name and phase line), map with the legend (Spells and tiles), bus unlocks (Charm and gem
names, a Charm flavour), reward, the shop. At 1280x720 and 844x390.

### P2: story and UI copy

Goal: every sentence and label a player reads that P1 did not change: the 48 Detours, the Tour Diary, barks, tips, Stickers, Encores,
the spine comment, every screen's copy, How to Play, the tutorial, the document title. Sources: HV_STORY 2, 3, 4, 6, 8; HV_HEROES 1.6
(barks) and 4.3; HV_WORLD_DATA 4, 5, 10, 11, 12; bible 5; HV_UI_COPY (rows of phase P2). Depends: P1 (screen copy uses the new DATA names).

| Agent | Owns (edit) | Tests it edits |
|---|---|---|
| 2A story data | `js/data_events.js` (titles, texts, labels, costs, outcome texts; ids, ops, weights, `req`, `when`, `once`, `art.scene` unchanged), `js/data_meta.js` (spine comment, the 12 lore entries, the four bark sets, the 30 tips, the 32 Stickers, the 10 Encores, header comment) | `narrative` (HV_STORY 8 table and HV_HEROES 4.3: cost honesty `/vox/i` and `/hurts the lead/i`, trial quotes, the tip word list, the spine test rewritten to the bible 2.6 required words, the barks voice checks, the locks `Tour Poster` and `Goat Mask` read from DATA, 479 and 480 `'Rivals have '` and `'headliners have '`), `content` 720 (`/\b1 Vox\b\|\b2 Vox\b/`, `/(\d) Vox/`), 854 (`startInk: /less Vox/`, `wellInk: /less Vox/`), 883 to 886 (the bark voice pins: rewrite them to the HV_HEROES 1.6 targets, raiga at most 7 lines with `!`, kuro at most 10, hanae at most 1, suzu 0, and the `friend` tic assertion becomes `Just Andy.` exactly once in `barks_raiga`; never delete them, never make Andy shout to pass) |
| 2B menus | `js/screen_menu.js` (title, hero select, Encore stepper, Tour Bus with `TAG_LABEL`, `RARITY_NAME`, `DATA.COLOUR_NAME`, the Charm flavour line on Tour Bus tiles, settings, How to Play pages and their tip regexes from HV_STORY 4, pause), `css/menu.css` (copy and the Begin label width) | `screen_menu` (every copy row of HV_UI_COPY; the seven How to Play margin notes; the Begin width model with `Start the Tour` and `Start Daily Duet`; 696 `/2 of \d+ entries read/` and 700 `/not reached this entry/` per bible 5.5) |
| 2C map | `js/screen_map.js`, `css/map.css` (copy only) | `screen_map` (Vox, `% live`, `hexes live`, `Too far for your Vox`, `Muted ground`, `No Spells`, `Found in Act I,`, the legend tab names, `nowhere to unmute`, the screen reader line, 325 the mercy toast `A passer-by hums along: 1 Vox.`, 461 `/no spells/i`, 1414 `/peddler/i` becomes `/merch/i` and `/keeper/i` becomes `/headliner/i`) |
| 2D nodes | `js/screen_node.js` (reward, Jordan's Merch Stall with his greeting pool from bible 3.5, the Detour board labels, Green Room, Studio, Gift Box, Sparkle Booth, the Charm flavour line on reward plaques), `css/node.css` (copy only) | `screen_node` (185 the Rival banner, 297 `nothing but a squeak`, 1049 the Warm Up preview in Vox, 2078 the no-tour page, 1629 the remove service note `The peddler burns it for good.` becomes the HV_UI_COPY string (suggested `Jordan takes it off your hands for good.`), every other HV_UI_COPY row) |
| 2E endings, tutorial and combat copy | `js/screen_end.js` (kickers, seals, curtain lines HV_STORY 3.5, share texts, unlock cards, `Curtain fell in Act N`), `js/tutorial.js` (bible 5.6 hint titles and texts), `js/screen_combat.js` (tier chips, intent labels, `WOW`, `VOICELESS`, `LEAD`, `BACKING`, the Breath orb, reason texts), `css/end.css` (copy only), `css/combat.css` (CSS `content` strings only: line 204 `RETAIN` becomes `HOLD`, lines 185 and 334 `KO` and `KO!` on the lethal preview badge become `WON` and `WON!`, bible 4.10) | `screen_end` (216 the fallback title, 274 `END OF ACT ONE` per HV_STORY 3.4, 306 and 398 `joins the tour!`, 359 `Curtain fell in Act I`, 398 `Encore 2 unlocked`, 445 the summary line with `Encore 0`, 741 `/Vox/`, the Play on button), `screen_combat` (copy rows: 291 `Not enough Breath`, 310 and 624 `LEAD` and `BACKING`, 444, 626, 634) |
| 2F shell | `js/ui.js` (stat tips, the error toast `Something went a bit off-key. Your tour is safe.`, the transition tip header, the card back word, the rotate panel line, the Charm flavour line in the relic tooltip and its class in `css/base.css`), `js/main.js` (toasts, abandon confirm, placeholder screens, `?gallery` labels), `js/scene.js` (copy literals only), `hocus_vocus/index.html` and `hocus_vocus/gallery.html` (title, meta description, watchdog text, boot `<b>`, noscript: TEXT ONLY), `css/base.css` (the flavour line class only) | `ui` (1044 `/song/i` becomes `/spell/i` for the Spell toasts, 1132 `/Cheers/`, 1147 `/no saved tour/i`, 1173 the pause labels `Charms` and `Abandon tour`, every other copy row), `lib.test` 205 (`HOCUS VOCUS: A Vocal Magic Adventure`), `player.mjs` (fallback labels gain `/start the tour/i`, `/on we go/i` and the Encore stepper aria label; the data-act hooks stay first) |

Lead after the agents (the lead owns `tests/hocus_vocus_theme.test.mjs` in this phase): check 3 pins become `HOCUS VOCUS: A Vocal Magic
Adventure` (index title), `<div id="boot"><b>HOCUS VOCUS</b>` and a noscript that names Hocus Vocus; add the run allowlist entries the
agents report (verbs only, each with its reason). Then `node tests/hocus_vocus_all.mjs`, `--strict`, the full game suite (it plays every
Detour), G1, G4, the phase grep over every presentation file and both data files (clean except ids, comments and survivors). Set the
Status line, commit, ship (the same day as P1 if at all possible). Screenshots: the whole set S at 1280x720 and 844x390, plus the title,
hero select and map at text scale 1.3 and the rotate panel at 390x844.

### P3: the chibi cast and outfits

Goal: HV_ART_AUDIO section 2: the owners' approved chibi figures replace `ART.hero` through an adapter (every call site unchanged),
Jordan joins as `ART.cast`, the three outfits work end to end, card hero art wears stage clothes, the foe kit is ready for the enemy
phases. Depends: P2 and the kit in `tools/hocus_vocus/rj_art/` (P0).

| Agent | Owns (edit) | Task (HV_ART_AUDIO) | Tests (edits; runs) |
|---|---|---|---|
| 3A cast (alone, first; the lead may run it itself: it swaps a contract; three sessions in a row: S1 the port, the adapter and the script lists, using the pose fallbacks of HV_ART_AUDIO 2.2; S2 the new pose tables; S3 the art_core and art_cast suites) | NEW `js/art_cast_kit.js` (from `tools/hocus_vocus/rj_art/kit.js`), NEW `js/art_cast.js` (from `roxor.js`, `jasmin.js`, `crew.js`), DELETE `js/art_heroes.js`, `hocus_vocus/index.html` and `hocus_vocus/gallery.html` (script lists only), `hocus_vocus/DESIGN.md` (section 3 code block, 5.6 and the build-order table row that names `art_heroes.js`, about line 1180), `js/data.js` (hero `color`, `accent`, `dark` per bible 4.8: kuro `#3fcf6a #c6ff3d #0f3a1e`, suzu `#a77bff #e9ddff #3b2470`), the tests that list `art_heroes` in a boot list (`art_cards`, `art_core`, `art_enemies_1`, `art_fx`, `art_map`, `data` 925 and its DESIGN pin, the `lib.mjs` header example), `tests/hocus_vocus_lib.mjs` `depsOf` (every `art_*` file except `art` and `art_cast_kit` also pulls in `art_cast_kit` when that file exists, so the foe kit `ART.rj.foe` reaches the `art_enemies_2`, `art_enemies_3`, `art_scenes` and `art_icons` boots unchanged), `tests/hocus_vocus_lib.test.mjs` (one NEW resolver case whose fixture has `art_cast_kit`; leave the synthetic `art_heroes` fixture names of lines 70 to 84 and 615 to 623 alone), the comments in `js/art.js` (line 24, `ART.hero (art_heroes.js)`) and `js/art_enemies_1.js` (line 10) (comment edits only), the art_core hero section, NEW `tests/hocus_vocus_art_cast.test.mjs` | A1: 2.1 to 2.10, 2.12, 2.13 | edits: art_core, art_cast, data, lib.test, art_cards, art_fx, art_map, art_enemies_1; runs: hygiene, art_enemies_2, art_enemies_3, art_scenes, art_icons |
| 3B foe kit (then, after 3A) | `js/art_cast_kit.js` (append the foe kit and its `foe_kit` sheet) | A1b: 4.2 | edits: none; runs: art_cast, art_core |
| 3C outfits (then, after 3A; parallel with 3B and 3D) | `js/data_meta.js` (`DATA.outfits`), `js/ui.js` (load and store `hv_skins_v1` in try/catch, effective map, push `ART.hero.outfits(map)` at boot, after a pick and after `META.check`), `js/screen_menu.js` (the Outfit row), `js/screen_end.js` (the `New outfit: <name>` unlock card), `css/menu.css`, `css/end.css` | A2: 2.11; bible 7.1 | edits: `ui` (the store: junk ignored, unreadable storage means stage clothes, never read by RUN), `screen_menu` (the picker: locked and unlocked, keyboard, `aria-pressed`, Andy has no row), `screen_end` (the new outfit card); runs: the same |
| 3D card hero art (then, after 3A) | `js/art_cards.js` (`heroSprite` only: `skin: 'stage'`, the die-cut sticker edge, the hero-colour halo) | 2.9 (moved here from A7b) | edits: art_cards (the hero illustration section only, after 3A); runs: art_cards |

Agent notes: 3A keeps every `ART.hero` member and contract of HV_ART_AUDIO 2.3 (anchors within the art_core limits: head 150 to 250 px
above the feet at s 1; `bounds.h` 250; `poseMs` and `keyPt` unchanged); ART never reads META, storage or the clock; one IIFE per file and
no global (`ART.rj`, never `window.RJ`). 3C: the outfit key lives only in ui.js; logic files never read it (hygiene layers); the daily seed
and the bot never see it. The kit's reference images are not in the repo: work from the kit code, the bible 3.x Look lines as updated by
0A, and HV_ART_AUDIO 2.

Lead after the agents: `node tests/hocus_vocus_all.mjs`, `--strict`, G1, G2 (with the outfit stickers), G4, the hygiene suite (script lists,
DESIGN section 3, one IIFE per file). Set the Status line, commit, ship. Screenshots: sheets `heroes`, `hero_anim`, `portraits`,
`hero_lineup`, `cast_skins`, `cast_jordan`, `cast_perf`, `foe_kit`, `motifs` (with `--param hero=1`); hero select for each hero (outfit
row locked, then unlocked through `--store`), fight1 and a fight with each other pairing (play an attack, take a hit, a voiceless hero via
`GAME.debug.combat().setHp`), the map token, diary `hero_hanae` to `hero_raiga`, victory. HV_ART_AUDIO 2.13 is the acceptance list.

### P4: logo, title, stage scenes and the UI skin

Goal: HV_ART_AUDIO 3.1, 3.2, the non-Act scenes of 3.3 (`title victory defeat paper camp shop event treasure`), 3.4, and section 9 (the UI
skin). Depends: P3 (the duo on the title, Jordan at the stall).

| Agent | Owns (edit) | Task | Tests (edits; runs) |
|---|---|---|---|
| 4A scenes (two sessions in a row: logo, monogram, title, victory, defeat, paper; then camp, shop, event, treasure) | `js/art_scenes.js` | A3a, the four node scenes of A3b; `TITLE_FOCUS` x0, x1 and k unchanged; y0 292, y1 570 per HV_ART_AUDIO 3.2 | edits: none (the art_scenes logo contract stays); runs: art_scenes |
| 4B node painters | `js/screen_node.js` (painters only: `paintShop`, `drawPeddler` with Jordan, `paintCamp`, `paintFire`, `paintForge`, `drawHammer`, `paintChest`, `paintCache`, `paintRewardBack`, `paintTable`, `paintDesk`), `css/node.css` | A4a; the Detour board keeps every `.ev-*` class and the 1136 x 592 geometry | edits: none; runs: screen_node (background) |
| 4C menu and end painters | `js/screen_menu.js` (painters, the logo call `ART.scene.logo(ctx, 640, 150, 540, t)`, `drawTitleFallback`, `drawLogoFallback`, `paintBeast` instant photos, the How to Play diagrams), `js/screen_end.js` (`paintStory`, `paintClear`, `paintOver`, `paintVictory`, the share card), `js/ui.js` (transitions `'ink'` sparkle swirl and `'page'` stage curtain, the rotate panel, the card back markup), `css/menu.css` (`.mn-tag` top 262 px and the menu look), `css/end.css` (story plaque: paddings and `--pg-x` kept) | A4b and the screen_menu parts of A3a | edits: screen_menu (the title clearance test keeps working because `TITLE_FOCUS` x0, x1 and k are unchanged; y0 292, y1 570 per HV_ART_AUDIO 3.2, and the test reads only x1 and k), screen_end, ui (the only P4 agent that edits ui); runs: the same |
| 4D UI skin | `css/base.css` (new `hv*` and `gloss*` tokens, panels, buttons, card frames, the card back styles), `css/combat.css` and `css/map.css` (skin colours only), `hocus_vocus/index.html` (`#boot` and the favicon: the RJ monogram as an inline `data:` SVG), `hocus_vocus/gallery.html` (the same favicon), `js/art.js` (new `pal` keys only; every existing key and value stays) | A9 | edits: art_core (the palette mirror gains keys, never changes one); runs: hygiene (favicons inline in both pages), lib.test, ui |

Lead: `node tests/hocus_vocus_all.mjs`, `--strict`, G1, G4. Set the Status line, commit, ship. Screenshots: sheets `logo`, `title_anim`,
`scene_title`, `scene_victory`, `scene_defeat`, `scene_paper`, `scene_camp`, `scene_shop`, `scene_event`, `scene_treasure`; the title at
1280x720, 844x390 and 390x844 before and after a win (`--store` a profile with `stats.wins` 1: the Glossed mic against the live mic); the
whole set S once more (the skin touches every screen); a transition halfway (`GAME.debug.tick` in a `--steps` file); the card back; the
boot splash (`--frames 0`).

### P5: Act I, Blossom Bay, and the combat look

Goal: the 17 Act I enemies and Kraki in the chibi style, the Act I backdrops, the combat fx and hit words, and the core icon kinds.
Sources: HV_ENEMIES 2 and 5.1; HV_ART_AUDIO 3.3 (`ch1`, `boss1`), 4, 6 (6.1, 6.3 to 6.5), 8; bible 4.10 (hit words). Depends: P4.

| Agent | Owns (edit) | Task | Tests (edits; runs) |
|---|---|---|---|
| 5A Act I enemies (three sessions in a row: E1a, E1b, E1c) | `js/art_enemies_1.js` | E1a creatures, E1b Rivals and Sidekicks, E1c Kraki (Masked, Unmasked); keep every rig, size class, pose timing and phase | edits: none; runs: art_enemies_1 (the contracts hold as written: size classes, the One-Hit Jukebox has more parts than the Fussy Foghorn, the boss is a big assembly, `die` ends with almost nothing) |
| 5B Act I backdrops | `js/art_scenes.js` (`ch1` and `boss1` only) | part of A3b | edits: none; runs: art_scenes |
| 5C fx and the combat look | `js/art_fx.js`, `js/scene.js` (`EL` hit words `LA! BOOM! SIZZ! TING! WOMP! PKAH! NANANA! TA-DA!`, `ST_COL`, hero-tinted slashes, win-over confetti per Act, the `gloss` hand-off for `boss_editor` phase 1) | A8 | edits: none (the 24 fx contract stays); runs: art_fx, scene (background), screen_combat (background) |
| 5D core icons | `js/art_icons.js` (statuses, gems, tiles, intents, stats, Spells, types, rows, motif icons; NOT the 66 Charms) | A6a; Spell badges keep the hex outlines the tests count | edits: none; runs: art_icons |

Lead: `node tests/hocus_vocus_all.mjs`, G1, G4. Set the Status line, commit, ship. Screenshots: sheets `enemies1`, `enemies1_anim`,
`boss1` (both forms), `scene_ch1`, `scene_boss1`, `fx`, `fx_combat`, `fx_anim`, `icons_ui`, `icons_tiles`, `icons_gems`; fight1, boss1
in each phase (`GAME.debug.combat().setHp` on the boss, `--frames 120` between), a hit mid-flash (step the clock). HV_ART_AUDIO 4.6
is the acceptance list for the creatures.

### P6: Act II, Scrollopolis, and the cards

Goal: the 17 Act II enemies and Scrollspinner, the Act II backdrops, all 59 card motifs, and one picture per Charm. Sources: HV_ENEMIES
3 and 5.2; HV_ART_AUDIO 3.3 (`ch2`, `boss2`), 4, 5, 6.2; HV_WORLD_DATA 2 (Charm icon looks). Depends: P5.

| Agent | Owns (edit) | Task | Tests (edits; runs) |
|---|---|---|---|
| 6A Act II enemies (E2a, then E2b, then E2c) | `js/art_enemies_2.js` | every creature has a screen and looks down; won over, it looks up at the moon | edits: none; runs: art_enemies_2 |
| 6B Act II backdrops | `js/art_scenes.js` (`ch2` and `boss2` only) | part of A3b; graffiti words only `first!`, `mid`, `who asked` | edits: none; runs: art_scenes |
| 6C motifs (A7a, then A7b) | `js/art_cards.js` (grounds, foregrounds, curse and status looks, the 59 motifs; `heroSprite` was done in P3) | A7a, A7b | edits: none; runs: art_cards |
| 6D Charm icons | `js/art_icons.js` (the relic section), `tests/hocus_vocus_art_icons.test.mjs` (the shared-motif test becomes "every Charm draws its own picture") | A6b | edits: art_icons (the shared-motif relic test only); runs: art_icons |

Lead: `node tests/hocus_vocus_all.mjs`, G1, G4. Set the Status line, commit, ship. Screenshots: sheets `enemies2`, `enemies2_anim`, `boss2`
(both forms), `scene_ch2`, `scene_boss2`, `motifs`, `icons_relics`, `icons_zoom`; fight2, boss2 in both phases, a hand of cards (fight1
with `hand` set to six varied cards through `GAME.debug.open('combat', {hand: [...]})`), the reward with a Charm, bus unlocks (Charm tiles).

### P7: Act III, the Perfect Stage, and the map

Goal: the 17 Act III enemies and Flawless (all three forms), the Act III backdrops, the map. Sources: HV_ENEMIES 4 and 5.3; HV_ART_AUDIO
3.3 (`ch3`, `boss3`), 4, 7. Depends: P6.

| Agent | Owns (edit) | Task | Tests (edits; runs) |
|---|---|---|---|
| 7A Act III enemies (E3a, then E3b, then E3c) | `js/art_enemies_3.js` | symmetric until hurt; Flawless: the idol, the Filter, the Gloss, and the shy little lens singing one crooked note when won over | edits: none; runs: art_enemies_3 |
| 7B Act III backdrops | `js/art_scenes.js` (`ch3` and `boss3` only) | part of A3b; the art word `APPLAUSE`; no darkness | edits: none; runs: art_scenes |
| 7C map | `js/art_map.js`, `js/screen_map.js` (the `opts.chapter` pass and the UI picto of HV_ART_AUDIO 7 only) | A5: muted Gloss fog, live hexes, tile stamps, the tour van token | edits: screen_map (new map assertions only, optional); runs: art_map, screen_map (background) |

Lead: `node tests/hocus_vocus_all.mjs`, G1, G4. Set the Status line, commit, ship. Screenshots: sheets `enemies3`, `enemies3_anim`,
`boss3` (all three forms), `scene_ch3`, `scene_boss3`, `map_page`, `map_kinds`, `map_frame`, `map_bloom`, `map_token`, `map_doodles`; fight3,
boss3 in each phase (the heroes take the pastel wash only in phase 1), the live map at 1280x720 and 844x390 with 30 percent live in each
Act (`GAME.debug.open('map', {painted: 0.3, chapter: N})`), a reveal mid-bloom, the same map twice 1 s apart (live hexes near the party
move, muted ground does not).

### P8: the band, the sound and the sample hook

Goal: HV_ART_AUDIO sections 10 and 11: the vocal and beatbox band replaces the Japanese instruments (E-D10), diatonic keys with the
pentatonic reveal (E-D11), the Gloss in sound (E-D12), every sfx re-voiced under its existing id with per-hero variants (E-D14), the
Spells' voices, and the sample hook (E-D13). Depends: P7.

| Agent | Owns (edit) | Task | Tests (edits; runs) |
|---|---|---|---|
| 8A audio engine (sessions in a row: S1 voices, scales and composer; S2 scores; S3 sfx; S4 the map voice and Spells; S5 loader and playback) | `js/audio.js`, `tests/hocus_vocus_audio.test.mjs` | S1 to S5 inside audio.js (the `DATA.SAMPLES` validation of HV_ART_AUDIO 11.1 lives in AUDIO's init, never in `DATA.audit`); at the end of S2, run 8B's tool to regenerate the `MIX` block | edits: audio (10.10 and block S of 11.7); runs: audio, hygiene |
| 8B mix tool | NEW `tools/hocus_vocus/mix.mjs` (renders each track's roles in headless Chromium through an OfflineAudioContext, measures loudness, writes the `MIX-BEGIN` to `MIX-END` block; `--sfx` prints recipe peaks; `--samples` suggests a `vol` per sample entry) | S2 tool part; code against `AUDIO.compose`, `AUDIO.render`, `AUDIO.renderSfx` | edits: none; runs: hygiene (tool files) |
| 8C wiring | `js/scene.js` (the `hero` option on hero sfx), `js/screen_combat.js` and `js/screen_map.js` (audio anchors only: per-hero card sounds, the Act III swing drive, Spell gestures), `js/ui.js` (the options bridge if 8A adds an option) | S3 and S4 call sites; every call guarded with `isFn` and `safe` | edits: screen_map (new audio-anchor assertions only, optional; no other P8 agent edits it); runs: scene, screen_combat, screen_map, ui (all in the background) |
| 8D samples manifest | NEW `js/data_samples.js` (`DATA.SAMPLES`, ships empty, exactly HV_ART_AUDIO 11.1), NEW `hocus_vocus/audio/README.md` (11.8), `hocus_vocus/index.html` and `hocus_vocus/gallery.html` (script lists: after `data_meta.js`, before `art.js`), `hocus_vocus/DESIGN.md` (section 3 code block only), `tests/hocus_vocus_data.test.mjs` (925 list and the DESIGN pin), `tests/hocus_vocus_hygiene.test.mjs` (S7: the only `fetch(` is in audio.js with the pragma), `tests/hocus_vocus_lib.mjs` (the stub needs of 11.7) | S5 data and docs | edits: data, hygiene (the only P8 agent that edits hygiene), `lib.mjs` stubs; runs: data, hygiene, lib.test |

Lead: `node tests/hocus_vocus_all.mjs`, `--strict`, G1 (the bot never loads audio), G4; `node build.js && ls dist/hocus_vocus/audio`
shows the README; `node tools/hocus_vocus/mix.mjs --sfx` levels within the 10.9 targets; one hand test of the hook with a real file
through a local server (never committed). Set the Status line, commit (the PR body lists the regenerated MIX and the measured levels),
ship. Screenshots: the title and fight1 with `--js` calling `AUDIO.debug()` to print the live graph (no sound in a screenshot; this proves
the tracks build); a by-ear listen is an owner item (O8).

### P9: follow the duo, share and support

Goal: HV_STORY 5 and 6: the `DATA.LINKS` config (all URLs empty), the follow strip on calm screens, Share (share sheet or clipboard),
Support (hidden until a URL is set), the sixth Tour Bus tab `follow`, the About group in settings. Depends: P8.

| Agent | Owns (edit) | Task | Tests (edits; runs) |
|---|---|---|---|
| 9A panel and share | `js/ui.js` (`UI.share`, `UI.followPanel(mode)`, link pills, exactly 5.7), `css/base.css` (pill and strip styles) | 5.3, 5.5, 5.6, 5.7 | edits: `ui` (5.8: no `a.hv-link` with empty URLs; one URL gives one `a[target="_blank"][rel~="noopener"]`; the clipboard text; an `AbortError` makes no toast); runs: ui |
| 9B menus | `js/screen_menu.js` (title footer, the sixth tab with key `6`, settings About group), `css/menu.css` | 5.4 rows title, Tour Bus, settings | edits: `screen_menu` (six tabs, keys 1 to 6, the footer, About); runs: screen_menu |
| 9C endings | `js/screen_end.js` (victory: Share beside Copy summary, the slim follow row; game over: Share and Follow, never Support), `css/end.css` | 5.4 rows victory, game over | edits: `screen_end`; runs: screen_end |
| 9D config | `js/data.js` (`DATA.LINKS` after `DATA.LISTS`; `LISTS.libraryTabs` gains `follow` LAST), `tests/hocus_vocus_data.test.mjs` (the list), `tests/hocus_vocus_hygiene.test.mjs` (LINKS keys exact; a non-empty value starts `https://` and carries `hygiene-allow(network)`) | 5.2, 5.8 | edits: data, hygiene; runs: data, hygiene |

Lead: `node tests/hocus_vocus_all.mjs`, `--strict`, G1 (a list entry is presentation only; the gate proves it), G2, G4. Set the Status
line, commit, ship. Screenshots: title (footer) at 1280x720, 844x390 and 390x844, the Follow the duo sheet, bus `follow` tab, settings
About, victory (show phase), game over; then the same with one fake URL set through `--js` (never committed) to see a pill.

### P10: docs, theme guard, cover and site card

Goal: the docs speak Hocus Vocus, the permanent guard replaces the transitional theme suite, the games index gets its Hocus Vocus card,
the cover is regenerated. Depends: P9 (the cover needs the final art).

| Agent | Owns (edit) | Task |
|---|---|---|
| 10A docs | `hocus_vocus/README.md`, `hocus_vocus/DESIGN.md` (all prose; add or extend section 1.1 "Player-facing names versus internal ids" with three columns: internal id, Echowake word, Hocus Vocus word, for every renamed concept of bible 4.1), `hocus_vocus/ART_BIBLE.md` (the chibi house style of HV_ART_AUDIO 1, the cast, the Acts, the fx and audio summaries), `hocus_vocus/CONTENT_SPEC.md` (all but 4.1) | keep every backticked id and every phrase the data suite pins (the Echowake list of ECHO_PLAN 8.4 applies unchanged: grep `data.test` for the doc pins first); run `node tests/hocus_vocus_data.test.mjs` and `node tests/hocus_vocus_hygiene.test.mjs` after EACH doc |
| 10B guard | `tests/hocus_vocus_theme.test.mjs` (rewritten) | the permanent Hocus Vocus guard below |
| 10C site, cover and tools | root `index.html` (a NEW card `{ id: 'hocus_vocus', href: '/hocus_vocus/', title: 'Hocus Vocus', ac: '#ff7eb6', desc, tags }`, with `desc` and `tags` exactly as HV_ART_AUDIO 9.3, the one card spec; the Echowake card untouched; tags from `CHIP_DEFS`), `tools/hocus_vocus/cover.mjs` (A10 composition and comments), `tools/hocus_vocus/shot.mjs` header, `tools/hocus_vocus/bot.mjs` and `tools/hocus_vocus/bot/report.mjs` labels (`Hocus Vocus balance bot`, `Encore` for the trial flag help; flag names stay) | do not run cover.mjs: the lead runs it |
| 10D comment sweep | first-line header comments in `hocus_vocus/js/*.js` and `hocus_vocus/css/*.css` (`Echowake:` and `Echowake --` become `Hocus Vocus:`), comment headers and test titles of `tests/hocus_vocus_*.mjs` except `theme` (Inkwoven, Echowake, chapter and verse wording; cosmetic, no code token changes), gallery sheet titles not yet changed | comments and titles only; re-run every suite it touched |

The permanent guard (10B), one `[string, reason]` allowlist, matched exactly (two contains-entries at most, DATA only), its size pinned:
1. DATA display fields (the walker of today's suite) pass RETIRED_INK (bible 6.3) and RETIRED_ECHO (bible 6.2, including the 20 old status
   names, 16 old keyword names, 14 old tile names, 6 old Song names, the old hero, boss and Act names and the Japanese folklore words),
   with the survivors of bible 6.4 allowlisted by exact phrase and reason (`Limited Edition`, `Deep Breath Tourmaline` if present, and so
   on); `Breath` appears only as the energy word (`DATA.statuses.sumi.name` is `Groove`).
2. UI prose literals of the twelve presentation scripts pass the same lists, plus `TALE` and the run rule (noun banned, the musical sense
   allowlisted).
3. `index.html` `<title>` equals `HOCUS VOCUS: A Vocal Magic Adventure`; the boot splash says `HOCUS VOCUS`; the noscript names Hocus
   Vocus; `gallery.html` passes the lists.
4. The sfx list keeps its 73 ids, including the seven legacy ids `paint ink_splash brush_pick brush_use ink_gain well page_turn`.
5. README, DESIGN (before 1.1), ART_BIBLE and CONTENT_SPEC outside backticks pass both lists.
6. Real names (H3): no `X Factor`, `Eurovision`, `Melodi Grand Prix`, a broadcaster, `YouTube`, `TikTok`, `Instagram`, `Facebook` or
   Andy's surname in DATA, UI literals or art text, except the one `LINK_ORDER` line in ui.js (allowlisted: link labels, bible 7.2).
   The surname check is the literal `/\bBenz\b/` (test source only, never player-facing), with the reason "owners: first name only".
7. Animal products (H5 list) in DATA, UI literals and art text literals, with an exact allowlist for costume shapes if any.
8. Admin words (H4) and food words (H6) in DATA and UI prose.
9. Tone words (H7: kill, die, dead, death, blood, gore, corpse) in DATA prose and UI literals (ids like the bark key `kill` and the pose
   `die` are not prose).
10. Art text: the string literals passed to text drawing in `js/art*.js` are only the set of HV_ART_AUDIO 1 rule 7.
11. American spellings (color, favorite, center, gray, recognize, traveling) in DATA and UI prose literals (CSS and canvas property
    values are not prose).
12. CSS `content:` strings pass the lists and the run rule.

Lead: run `node tools/hocus_vocus/cover.mjs` (needs `sharp`, `playwright-core` and the Chromium in `/opt/pw-browsers`), look at
`hocus_vocus/cover.webp`, commit both cover files (never hand-edit them); fix the real leaks 10B reports in a separate commit (name each);
`node tests/hocus_vocus_all.mjs`, `--strict`, G1, G4. Set the Status line, commit, ship. Then check the live games index one minute after
the merge: the Hocus Vocus card shows the cover and opens the game; the Echowake card is unchanged.

### P11: independent verification and fixes

Goal: an independent check by agents that did not build the work, then one fix PR. Depends: P10. The verifiers edit nothing; the lead
then assigns fixers (one agent per file group, disjoint as always).

| Agent | Task |
|---|---|
| 11A desktop playthrough | Drive the real game with `tools/hocus_vocus/shot.mjs --steps` at 1280x720: title, hero select (each outfit), a whole Act I (unmute hexes, cast every Spell, a tea stall, fights, a Rival, Detours, the Merch Stall, a Green Room with Warm Up, the Studio, Kraki), the Tour Diary pages, Act clear, then `GAME.debug.open` for Acts II and III and both other Headliners in every phase, game over and victory, the Tour Bus every tab, settings, How to Play every page, pause. Screenshot every screen; report every leftover Echowake word or picture, clipped text, broken layout, console error. |
| 11B phone, accessibility and gates | The same flow at 844x390 with touch, the rotate panel at 390x844, text scale 1.3, reduce motion, quality low, colour-blind patterns; then the gates: the guard, the phase grep over every `hocus_vocus/js` file, the docs sweep below, G1 and G1b, G2, G4, G5. |
| 11C words and world | Read every DATA string and every UI literal (dump them with a scratch script) against bible 1.3, 1.4 and 6: tone, the four hero voices, Jasmin never belts, RoxorLoops never "a looper", no romance, the nods placed exactly once (bible 2.9), no lyric, no real name, no admin, no animal product, plant food never remarked on, British spelling, the Gloss never evil, nobody dies. |
| 11D art and sound | Every gallery sheet (the list of `ART.sheets`), every scene, every enemy per Act at 120 px, the cast against the kit; no Echowake visual left (bamboo, torii, paper lanterns, kimono, katana, flute, shrine, sumi enso, lacquer, washi, gold leaf on figures); offline renders of every music track and the sfx levels (`mix.mjs --sfx`); the sample hook with one dummy local file (never committed): it plays the file and falls back when the file is removed. |

The docs sweep of 11B (outside the plan folder, which quotes old words on purpose; the root index keeps the Echowake card, so its hits
must all be inside that one card):

```
grep -rniE "echowake|inkwoven|the hush|chimes|tempo trial|daily jam" hocus_vocus/*.md hocus_vocus/*.html index.html
```

Prompt (11A to 11D): "You did not build this re-theme; your job is to find what is wrong. Read HV_PHASES.md sections 0 and 3, the
bible sections 1, 2.3 and 6, and the plan sections your task names. <task>. Look at every screenshot with the Read tool. Do not edit any
file in the repo. Report a numbered list: where (screen, viewport, file if known), what is wrong, the expected text or look per the
plans, severity (blocker: an old word or picture, a broken flow, a real name, an animal product, a test gap; polish: anything else)."

Lead: fix every blocker (fixers by file group), re-run the affected suites and `node tests/hocus_vocus_all.mjs --strict`, G1, G1b, G2,
G4, G5 one last time, set the Status line to `Phases merged: all (P0 to P11)`, commit, ship. Report to the owners: what shipped across
the twelve PRs, the decisions used, the gates (IDENTICAL, saves load, guard green, check green), every polish finding left, the open
questions still open (section 8), and the play link.

## 5. The agent preamble (prepend to every agent prompt)

```
You are working in /home/user/Games on the Hocus Vocus re-theme. hocus_vocus/ is a fork of the Echowake card roguelike (rogue_book/)
and is being re-themed, without changing a single mechanic, into HOCUS VOCUS: A Vocal Magic Adventure ("beatboxing and vocal magic"),
starring the real beatbox and singing duo RoxorLoops and Jasmin. Echowake must stay untouched: never edit anything under rogue_book/,
tools/rogue_book/ or tests/rogue_book_*.

Read first: hocus_vocus/plan/HV_PHASES.md sections 0 and 5 and your phase's section; hocus_vocus/plan/HV_BIBLE.md sections 0, 1.3, 1.4
and 6; then the plan sections your prompt names. Plan files are long: never read one whole; find sections with
grep -n '^#' <file> and read them with the Read tool's offset and limit.

Authority: HV_BIBLE.md wins on every word and name. Then HV_HEROES.md (heroes, cards, barks), HV_ENEMIES.md (enemies), HV_WORLD_DATA.md
(Charms, gems, Stickers, Encores, tiles, Spells, keywords, statuses, Tour Bus, settings, How to Play), HV_STORY.md (Detours, Tour Diary,
tips, the social panel), HV_ART_AUDIO.md (pictures and sound), HV_UI_COPY.md (other UI strings), HV_PHASES.md (order, ownership, gates).
If two disagree, follow the bible, finish your task, and report the conflict.

Edit ONLY the files listed as yours; other agents edit other files in the same working tree at the same time. Do not commit, push,
branch, create worktrees, change git state or run npm run check: the lead does that.

Hard rules. Never change an internal id: hero ids hanae kuro suzu raiga, and every card, enemy, move, relic, gem, event, achievement,
trial, lore, status, keyword, brush, tile, op, hook, mod, stat, sfx, music, scene, motif, icon, fx, palette key, screen, tab, bus event,
data-tut, data-act, CSS class, custom property, save field, storage key and RNG stream key. Never change a number, cost, rarity, op, AI
table, map rule or random draw: only player-facing text, art and sound change. Never an em dash or an en dash anywhere (code, data,
comments, tests, docs): use a comma, a colon or a full stop; in player copy also never " - " or "--" as a dash. No tab indentation.
Never write the name of the platform's unseeded random function, not even in a comment: say "the banned random call" and use U.rng or
tk.rng. ES2020 only (no ??=, ||=, &&=, .at(), private fields, static blocks). British spelling (colour, favourite, centre, grey,
recognise, travelling, jewellery). Printable ASCII in every DATA string (no curly quotes, ellipsis character, emoji or music-note
symbols). No network: no fetch, remote font, script or image (the sample loader of P8 and the owners' links of P9 are the only
exceptions, each behind a hygiene pragma). All art is canvas code; all sound is WebAudio synthesis.

The world's rules (bible 6.1). Only the handles RoxorLoops, Jasmin, RawClaw, Andy (first name only, never a surname), Jordan and
@roxorloopsandjasmin; no real judges, presenters, shows, venues, cities or platforms (platform names only as the five link labels).
Nothing about accounting, booking, invoices, contracts, schedules, managers, fees, taxes, emails or paperwork. No animal products in
names, flavour, art, food or materials; food is plant-based and never remarked on (never vegan, vegetarian, plant-based, meat-free,
dairy-free, healthy or diet). Nobody dies (never kill, die, dead, death, blood, gore). Silly, warm and heartfelt, never mean or crude;
the Gloss is polite and never evil. Jasmin never belts; RoxorLoops is never "a looper"; the duo are never "a looping duo"; no romance
between characters; no lyric of any real song.

Match code by the quoted text, never by a line number alone: earlier phases moved lines. When you change a test, change what it expects
and say why; never delete an assertion to make a suite pass. When a string you need is in no plan file, write it in the bible's voice
(1.4), short, and list it in your report. Art agents: render every sheet you change with
node tools/hocus_vocus/shot.mjs --sheet <name> --out <your scratchpad>/<name>.png, look at the PNG with the Read tool, iterate at least
three rounds; never write a PNG into the repo.

When done, run the tests listed for you (slow suites with run_in_background, then wait), grep your files with the phase grep of
HV_PHASES.md 2.4, and report: files changed; tests run and their results; anything you could not do; every string you invented (with the
reason); every plan conflict you found.
```

## 6. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | The owners' approved chibi kit exists only in a session scratchpad (`/tmp/claude-0/-home-user-Games/1c3bba4c-59e1-55ff-8ccc-2b0dbbf19791/scratchpad/rj_art/`, seven files); a new container loses it | P0 lead step 0a copies it to `tools/hocus_vocus/rj_art/` as the very first action, step 2 commits it; P3 ports from there |
| R2 | Reference images include photos of real people and the owners' artwork | never committed (P0 step 0a); owner question O5 for the chibi cards |
| R3 | A logic path secretly depends on a display string (sorting, hashing or parsing text) | every phase runs G1; P1 and P11 also G1b with the search bot; the records hold ids only, so any drift is a real logic dependency to revert |
| R4 | A search and replace of `ink`, `paint`, `brush`, `well`, `echo` or a hero id corrupts ids, ops, sfx ids or saves | never search and replace across files; edit by quoted anchors; the phase grep separates ids from prose; G1 and the guard's check 4 catch slips |
| R5 | About 200 literal pins in the text suite and the grammar regexes of the content suite | 1A rewrites them with a scratch word-map script, then checks every failing case against the generator; Echowake's note: never template whole sentences |
| R6 | `sumi` was "Breath" in Echowake and is "Groove" now, while "Breath" is the new energy word | P1 note 1A names the trap; the guard's check 1 asserts `DATA.statuses.sumi.name === 'Groove'` |
| R7 | Cross-plan name clashes, near-duplicates, and limits the plans did not check | P0 agent 0A lints every table against every other and the suites' limits before any data changes |
| R8 | Roster names live in three places (`data.js` ROSTER_SRC, the enemy files, CONTENT_SPEC 4.1) | the same P1 PR changes all three (1A and 1D); the data and enemies suites compare them |
| R9 | `Start the Daily Duet` overflows the hero select button at Larger text | P0 0A switches bible 5.2 to `Start Daily Duet` (measured with the suite's width model) |
| R10 | `RoxorLoops` (10 letters) overflows name plates, medallion captions, the Continue line and the combat name column | P1 agent 1F re-measures and updates the width test; P11B checks every name at text scale 1.3 |
| R11 | The transitional theme suite bans words the new world needs (the musical "run", lowercase "song") | P1 1F rescopes check 6 and allowlists the musical run with reasons; P2 lead adds verb uses; P10 replaces the suite |
| R12 | `Limited Edition` contains "edition", banned by bible 6.3 | allowed survivor with a reason (bible 6.4 lists it; 10B allowlists it); fallback name `Sold Separately` (HV_WORLD_DATA 14.2) |
| R13 | Deleting `art_heroes.js` breaks the script lists (index, gallery, DESIGN section 3 pinned byte for byte by the data suite, the test boot lists), and the foe kit in `art_cast_kit.js` is missing from the `art_enemies_2`, `art_enemies_3`, `art_scenes` and `art_icons` boots | one agent (3A) changes them all in one commit, including the `lib.mjs` `depsOf` rule that pulls `art_cast_kit` into every `art_*` boot; hygiene, data, lib.test and the four art suites prove it |
| R14 | The chibi heroes break hero contracts (anchors, head height 150 to 250 px, sprite-draw counts, warm counts, clip audit) | HV_ART_AUDIO 2.3 keeps every member and `CAST_K`; 2.12 changes only the sprite-specific counts, never a contract |
| R15 | Live chibi drawing costs frame time | cached frames for tokens, medallions, list portraits and low quality; the `cast_perf` sheet and the 1.2 ms budget (HV_ART_AUDIO 2.8) |
| R16 | Two agents editing one file corrupt each other's work | strict ownership tables; the big art files and audio.js run as sequential sessions ("then"); scene backdrops are split by Act but `art_scenes.js` has one owner per phase |
| R17 | Enemy redraws break relative contracts (more parts than, white silhouettes on hit, `die` ends empty, boss part counts) | keep every rig (HV_ART_AUDIO 4.1); the foe kit's `hurtFlash` and `winOver` exist for these tests; suites run unchanged |
| R18 | The stacked logo is taller and could break the title clearance test | `TITLE_FOCUS` x0, x1 and k unchanged; y0 292, y1 570 per HV_ART_AUDIO 3.2 (`{x0 360, x1 920, y0 292, y1 570, k 0.1}`), so the stage clears the logo (y 42 to 258) and the tagline (262 to 290); `.mn-tag` moves to top 262 px (4C) |
| R19 | The `MIX` trims cannot be regenerated by hand after the re-voicing | P8 8B adds `tools/hocus_vocus/mix.mjs`; 8A regenerates the block and the PR body records the levels |
| R20 | The sample hook needs a request, which the hygiene suite bans | one `fetch` in audio.js behind `hygiene-allow(network)`; `DATA.SAMPLES` ships empty; tests S1, S7 and S8 prove no request in the shipped build or headless |
| R21 | The owners' URLs are external links, which the hygiene suite bans | a pragma per line (HV_STORY 5.2, 5.8); empty URLs render nothing; links open only on a tap |
| R22 | A new tab id `follow` in a closed list (`LISTS.libraryTabs`) | appended last in P9 with the data and menu suites edited together; G1 proves no mechanic moved |
| R23 | Charm `flavor` is a new field the validator rejects | 1A adds the optional field to the relic validator in the same PR as 1E's flavours |
| R24 | How to Play margin notes are picked by regexes on tip text; new tips silently drop notes | 2B applies the HV_STORY 4 regexes in the same PR as 2A's tips; the menu suite counts seven notes |
| R25 | Story entries must start with a letter (the drop cap) | HV_STORY entries are checked; the narrative and screen_end suites assert it |
| R26 | Silent guards stay green after a rename but stop testing (`/kind\|give\|Fable/i` in run, `/echo/i` in narrative, the Echo cost guard in content) | listed in section 9 with their phase; every agent greps its suite's regexes for old words even when green |
| R27 | Mixed vocabulary on the live site between P1 and P2, and mixed art between P3 and P7 | P1 and P2 ship the same day; each art phase finishes whole screens or whole Acts |
| R28 | A tour saved before the re-theme carries old log lines (`Gained 3 Echo.`) and shows them in its run log | acceptable: ids load (G2), new lines use new words, the next tour is clean; noted in the P1 PR body |
| R29 | Squash merges resurrect old copy when `origin/main` is merged into a branch | resolve keeping HEAD, re-run the checks, re-grep (2.4) or the guard (from P10) |
| R30 | `npm run check` exceeds the 10 minute foreground limit; another game's suite is red | the gated push runs it in a worktree in the background; CLAUDE.md hard rule 1 for other games |
| R31 | The plan, the baselines or the phase position are lost between sessions | the plan is committed in P0; baselines rebuild from HV_BASE (G1, G2); the next phase comes from `git log` (2.1) |
| R32 | Echowake is changed by accident (a shared helper, the root card, a copied test) | G4 in every phase; no agent owns a path under `rogue_book/` |
| R33 | A real name, platform, judge or show slips into text or art (the viral clip, the talent show, Eurovision) | bible H3; 0A's lint; the P10 guard check 6; 11C's read-through |
| R34 | An animal product slips into a Charm, a food or a drawing (leather jacket, fur trim, feather boa, honey, pearl) | bible H5 list; 0A's lint; guard check 7; HV_ART_AUDIO 1 rule 5 and 4.5; 11D looks for it |
| R35 | The plan files are deployed with the game | `SKIP_IN_DIST` entry in P0 (owner may veto, O12) |
| R36 | The Gloss's pastels give low contrast for text and icons | text always sits on the dark plates of the UI skin; 11B checks contrast on the Act III screens |
| R37 | Hit words: most hero attacks are `slash`, so RoxorLoops's beats read `LA!` | HV_ART_AUDIO 13 item 5; owner question O9; default per the bible |
| R38 | The determinism gate is run against the wrong base (an HV_BASE after P1) | HV_BASE is written once in P0 and never changed; G1 reads it from the Status line |

## 7. The Hocus Vocus definition of done

1. All twelve phases are merged in order; the Status line reads `Phases merged: all (P0 to P11)`.
2. Words: every name, rules sentence, Detour, Tour Diary entry, bark, tip, Sticker, Encore, label, toast and How to Play page comes from
   the plans; the permanent guard (P10) is green with a small, reasoned allowlist; P11 found no blocker left; the owners' nods are placed
   exactly once (bible 2.9).
3. Mechanics: G1 and G1b print IDENTICAL against HV_BASE; no number, cost, rarity, op, AI table, map rule or random draw changed; every
   internal id kept.
4. Saves: a run and a profile written before the re-theme load and continue (G2); Stickers, unlocks and Cheers survive; the three
   outfits unlock from existing Stickers and live only in `hv_skins_v1`.
5. Tests: `npm run check` green; `node tests/hocus_vocus_all.mjs --strict` green; every pin of section 9 rewritten to the new world, no
   assertion deleted; `node tools/hocus_vocus/plan_check.mjs` exits 0.
6. Echowake: untouched (G4) and still playable at `https://games-71g.pages.dev/rogue_book/`; its suites green.
7. Art: the four heroes and Jordan are the owners' chibi cast in every pose and outfit; all 51 enemies, 14 scenes, 59 motifs, every
   icon, the map, the fx and the UI skin are redrawn; no Echowake visual remains (11D); every screen of set S looked at in 1280x720,
   844x390 and 390x844, and at text scale 1.3.
8. Sound: every track and sfx re-voiced with the vocal and beatbox band; per-hero variants; the Spells sing; the sample hook works with a
   real file and the shipped build requests nothing.
9. Social: `DATA.LINKS` placeholders; empty links hidden; Share works through the share sheet or the clipboard; Support never on game
   over; no network call.
10. Docs and site: README, DESIGN (with the three-column names table), ART_BIBLE and CONTENT_SPEC rewritten; the games index shows a
    Hocus Vocus card with the regenerated cover; the plan is not deployed (unless the owners chose otherwise).
11. Accessibility: hit targets at least `var(--hit)`, aria labels on every new control, reduce motion and low quality respected.
12. The live site was checked one minute after the last merge: title, a fight, a map reveal with sound, the games index card.
13. Every owner question of section 8 is answered, or its default is in place and the question is listed in the final report.

## 8. Open questions for the owners

The work does not wait for answers; each has a default in place. An answer is cheapest before the phase in brackets.

| # | Question | Default | Before |
|---|---|---|---|
| O1 | The exact URLs: website, YouTube, Facebook, TikTok, Instagram, the Support page (what kind: a tip jar, a shop, a membership page), and the public game address for Share | all empty: the buttons stay hidden, Share uses the page address | P9 (or any time later: one line each in `js/data.js`) |
| O2 | Samples: which sounds first (kick, snare, hi-hat, throat bass, scratch, Jasmin's "ooh" and runs, the Spell syllables, a victory stinger)? Who records, in what format (m4a or ogg, mono, peak -1 dBFS, dry), and may the files live in the public repository? | none: everything synthesised, the hook ships empty | any time after P8 (HV_ART_AUDIO 11.8 is the recipe) |
| O3 | Is the name free? Please search the app stores, the web and trademark registers for "Hocus Vocus" (and check it is not too close to an existing game or show) | HOCUS VOCUS | P2 (title text), P4 (logo) |
| O4 | Do RawClaw, Andy and Jordan agree to appear under these handles, with these looks and jokes (the goat suit, "Just Andy", the merch gags)? | yes, as approved in the briefs | P1 |
| O5 | May the chibi card references (not the photos) be stored in the repository under `tools/` (never deployed) so future sessions can compare against them? More artwork wanted: RawClaw, Andy and Jordan cards, the logo as a file, an Andy outfit idea | not stored; the kit code is the reference | P3 |
| O6 | The logo letters: pink HOCUS over green VOCUS (as on your logo), or cream letters (the bible's first idea)? | pink and green | P4 |
| O7 | "Calling of the Moon", "Arabic Impro" and "Human" placements (bible 2.9) and the talent show clip (no show name, no numbers): happy? Note: "Arabic Impro" is Jasmin's random-target X card (4 damage to a random enemy X times, the only random card in her kit); mechanics stay frozen, so it cannot pick a random effect. Happy with that, or rename a different card? | as planned | P1 (card names), P2 (story) |
| O8 | A by-ear listen after P8, on a phone and on headphones: the band, the Act III swing, the Spells | the calibrated levels | after P8 |
| O9 | Should RoxorLoops's hits read `PKAH!` instead of `LA!`? | the bible's per-element words | P5 |
| O10 | Closed by the plan editor: Jasmin's passive is now "Every Note Blooms" (it was one letter away from the Spell "Vocal Run"). Shout if you would rather keep "Vocal Runs" | Every Note Blooms | P1 |
| O11 | A Danish version later? (Not in this plan; it would need a text table.) | English only | after P11 |
| O12 | Keep the plan files off the public site (`SKIP_IN_DIST`)? | yes | P0 |
| O13 | The games index card: accent colour, tags and the one-line description | Jasmin pink `#ff7eb6`, `cards`, `strategy`, `music` | P10 |
| O14 | Should Echowake's page or card point to Hocus Vocus (it is the same engine)? | no, Echowake stays untouched | after P11 |

## 9. Every test file and the Echowake pins it carries

How this list was made: every string, template and regex token of every `tests/hocus_vocus_*` file was matched against the current DATA
display names (cards, Charms, gems, enemies and their moves, Detour titles, lore titles, Stickers, Encores, tiles, Songs, keywords,
statuses, heroes and passives) and the Echowake vocabulary, and each hit was classed as an expected value (a pin) or an assertion message
(cosmetic). Messages and test titles are not listed (10D may reword them); test-local fixtures stay as they are. Line numbers are from
HV_BASE: match on the quoted text. "Contract" means a rule the re-theme must keep, not a word to rewrite.

### Runners and helpers

- `hocus_vocus_all.mjs`: no pin.
- `hocus_vocus_lib.mjs`: header examples name `'art_heroes'` (P3 3A); `depsOf` gains the `art_cast_kit` rule (P3 3A, R13); comments and the dev-facing boot message say Inkwoven (P10 10D, optional); the WebAudio and `fetch` stubs gain what HV_ART_AUDIO 11.7 needs (P8 8D).
- `hocus_vocus_player.mjs`: 142 `/Raise the (Ink|Tempo) Trial/`, 145 `/begin the (tale|journey)/i`, 150 `/play on|turn the page|continue/i`, 410 the outcome button regex: fallbacks only (data-act hooks come first); P2 2F adds the Hocus Vocus labels. Hero names already come from DATA.

### Art suites (contracts; the redraw keeps them)

- `art_cards`: boot list `art_heroes` (P3 3A); hero illustrations (P3 3D); 59 motifs draw, balance and stay in their box (P6 6C).
- `art_core`: boot list (P3 3A); the hero section per HV_ART_AUDIO 2.12 (P3 3A); the palette mirrors the CSS tokens (P4 4D adds keys, never changes one).
- `art_enemies_1`: boot list (P3 3A); size classes by id (69, 72), phase-blind ids (186), the brute has more parts than the Fussy Foghorn (191), the boss assembly (179), the `grove` dev param (201): contracts for P5 5A; header comment names the Bamboo Grove (P10 10D).
- `art_enemies_2`: boot list `['util', 'data*', 'art', 'art_enemies_2']` gets the foe kit through the `lib.mjs` `depsOf` rule (P3 3A); boss parts at least 18 and 24 (142), white silhouettes on a hit (149): contracts for P6 6A; header comment (P10).
- `art_enemies_3`: boot list gets the foe kit the same way (P3 3A); boss parts (144), the `die` pose (150), white silhouettes (157): contracts for P7 7A; header comment (P10).
- `art_fx`: boot list (P3 3A); 24 fx contract (P5 5C).
- `art_icons`: boot list gets the foe kit through `depsOf` (P3 3A); Spell icons draw hexagons (497, 503 count `closePath`), stat ids `brush` and `inkstone` (ids): contracts for P5 5D; the shared-motif relic test changes in P6 6D.
- `art_map`: boot list (P3 3A); hex geometry and `paintBloom` area tests: contracts for P7 7C.
- `art_scenes`: boot list gets the foe kit through `depsOf` (P3 3A); logo animates with at least 7 distinct frames, cached per width, deterministic (243 to 257): contract for P4 4A; header says "the INKWOVEN logo" (P10).
- NEW `art_cast` (P3 3A).

### Logic and data suites

- `audio`: 14 the Japanese `SCALE` table, 43 the eight Japanese voices, 44 "the three Japanese scales", 253 to 257 shakuhachi and taiko rules, 360 to 366 the title shakuhachi, hero select koto, shop shamisen, 421 to 427 hyoshigi, koto and rin recipes, 862 and 863 the Song recipes; the hush checks (867 to 871) and the calibration (958, 959) stay as contracts: P8 8A per HV_ART_AUDIO 10.10 (the new voices and scales of E-D10 and E-D11), plus block S.
- `bot`: messages only; no pin.
- `cards_hanae`: the 1 to 3 words name rule (P1 1B adds the `hanae_blade_duet` exception); 372 to 378 table labels with old card names (cosmetic).
- `cards_kuro`: `KURO_IDS` frozen (contract; ids with `verse` in them stay); 809 `/exhaust/` and 810 `/retain/` on the lowercased card text (P1 1B: `/fade/`, `/hold/`).
- `cards_raiga`: 400 to 407 labels (cosmetic); name rules (P1 1C runs it).
- `cards_suzu`: 452 to 467 the `says()` regexes on status and keyword names (P0 0D reads DATA), `/Front/`, `/Back/`, `/fall|down/i` (P1 1C).
- `combat`: intent texts 1764 `'Deals 7 x2 to the front hero'`, 1770 `'Deals 5 to Hanae'`, 1771 `'Deals 3 to both heroes'`, 1804 to 1807 (`Ritual`, `Weak`, `Might` in intent text): P1 1A; the synthetic relic id `'echo'` at 1919 is an id (keep).
- `content`: 254 the keyword word list (P0 0D reads DATA; `'Energy'` in P1 1A), 256 the `Weak` exception (P1 1A: the new word), 277 and 278 `/Now (Front|Back):/`, `/(Swap|swap) rows/`, 306 `/swap into the front row/`, 307 `/you fall/`, 314 `'whenever either hero swaps rows'`, 381 `/^(Front|Back): /`, 437 `'Move to the front row. Gain 1 Bloom and 3 Block.'`, 447 `'Deal 6 damage. Swap rows. Now Back: ...'`: P1 1A; 720 `/\b1 Echo\b|\b2 Echo\b/` and `/(\d) Echo/` (a silent guard), 854 `/less Echo/`: P2 2A; 883 to 886 the Echowake bark voice pins (`loud('raiga') >= 20`, kuro and hanae at most 3, suzu at most 2, Raiga's `friend` tic in 4 to 12 lines): P2 2A rewrites them to the HV_HEROES 1.6 targets (raiga at most 7 lines with `!`, kuro at most 10, hanae at most 1, suzu 0; `Just Andy.` exactly once in `barks_raiga` replaces the friend tic); 410 to 418 QA fixtures (keep).
- `data`: 838 `'Lantern Wisp'` in the drowned general's roster role (P1 1A: `Grumble Cloud`); 925 the script list (P3 3A, P8 8D); the DESIGN, ART_BIBLE and CONTENT_SPEC phrase pins (P10 10A keeps them); 350, 353, 427, 451, 675 fixtures (keep); `LISTS.libraryTabs` if pinned (P9 9D).
- `enemies_1`: 96 `'Kuzunoha'` (P0 0D: the roster name); 1203 `'Scorch'` is a fixture (keep).
- `enemies_2`: 128 `'The Silk Courtesan'` (P0 0D: the roster title); 515, 520, 526 fixtures (keep).
- `enemies_3`: 200 the one shared move name `'Smother'` (P1 1D: `Smooth Over`, still `eraser_wraith,boss_editor`); 586 to 594 the junk card fixture (keep); 715 and 1074 `Energy` in messages (cosmetic).
- `hygiene`: no word pin; gains the sample rule (P8 8D) and the links rule (P9 9D); checks the new script lists (P3, P8).
- `lib.test`: 205 `'ECHOWAKE: a rogue ballad'` (P2 2F: `HOCUS VOCUS: A Vocal Magic Adventure`); boot lists naming `art_heroes` (P3 3A).
- `map`: no pin (295 is a message).
- `meta`: 332 `'Verse 2, Echo 5, Hanae and Kuro'`, 333 `'Verse 1, Echo 1, Raiga and Suzu'` (P1 1E); 50 and 55 fixtures (keep).
- `narrative`: 195 `/echo/i` in the cost honesty check (a silent guard: P2 2A `/vox/i`), 472 and 474 `' less Echo'`, `'bells give '` (P2 2A: Vox, tea stalls), 479 and 480 `'Elites have '`, `'bosses have '` (P2 2A: `'Rivals have '`, `'headliners have '`), 716 `/sharpen/i` (P1 1E: `/rehearse/i`, with run.js `Nothing left to rehearse`), 496 the tip word list (P2 2A: HV_STORY 4), 514 to 545 the spine test (Singer, Hush, yamabiko, Grove, fox, Lantern City, Citadel, Keeper of the Last Note, Kuzunoha, Jorogumo, Conductor, silver hair, shrine, knuckles; P2 2A rewrites it to bible 2.6 and HV_STORY 8), 539 the hero name regex (P0 0D), 560 to 566 the bark voice checks (P2 2A: HV_HEROES 4.3), 710 and 712 `/Brass Lantern/`, `/Fox Mask/` (P0 0D).
- `run`: 655 and 1294 `/Echo/` (P1 1E: `/Vox/`), 1337 `'Verse 3 only'` (P1 1E), 1408 `/kind|give|Fable/i` (a silent guard: P1 1E), 115 and 1962 fixtures (keep).
- `text`: about 200 pins: status names (Might, Weak, Vulnerable, Poison, Burn, Bulwark, Thorns, Mark, Plating, Ritual, Dodge, Frail, Stun, Bind), `Energy` (30), `Breath` for sumi (10, becomes Groove), `Exhaust`, `Retain`, `Innate`, `Ethereal`, `Front:`, `Back:`, `front row`, `the front hero`, `Echo` (296 `'Gain 2 Echo.'`), `wake`, `verse`, `Song`, `Treasure`, `Elite`, `Keeper`, `Kuro cards`: P1 1A (scripted word map, then the generator). `Block`, `Bloom`, `Swap`, `Unplayable`, `X cost` survive.
- `theme`: 15 to 47 the Inkwoven lists and allowlist (keep until P10), 102 to 112 and 169 to 177 check 6 (P1 1F rescopes), 215, 219, 220 the ECHOWAKE title, boot and noscript pins (P2 lead), 252 to 301 the run rule and its Echowake event allowlist (P1 1F, P2 lead), the whole file (P10 10B).
- `treasure`: 216 to 229 the OPWORD, MODWORD, ROWWORD, TRIG, TGTWORD and TIERWORD dictionaries (`/\becho\b/i`, `/wake/i`, `/song/i`, `/bell/i`, `/verse/i`, `/front/i`, `/elite/i`, `/boss/i`, `/minion/i`, `/camp/i`, `/shop/i`, `/exhaust/i`, `/falls?\b/i`, `/regen/i`, `/thorns/i`, `/energy/i`), 309 to 322 the pinned `hookText` samples (`'Every 5th time you wake a hex, gain 1 Echo.'` and the Dodge, Energy, Elite, Charge, Poison, rows ones), 439 to 442 the gem text samples (`Front row:`, `Back row:`, `Thorns`, `Energy`, `Echo`, `Regen`, `Ritual`, `Might`, `Dodge`), 572 to 574 the junk card texts (`front hero`, `Bind`, `Exhaust`, `Energy`): P1 1E per HV_WORLD_DATA 13; 455 to 462 probe fixtures (keep).

### Screen and integration suites

- `browser`: 108, 109, 259, 260 hero cards pressed by `'^Hanae'`, `'^Kuro'` (P0 0C: `[data-hero=...]`); the rest are messages.
- `game`: 214 `/Verse 1/` (P1 1E) and the hero names (P0 0D), 676 `/Kappa/`, 678 `/Hanae and Kuro/` (P0 0D); 547, 567, 574 `/^Back/` (generic, keep). It plays every Detour: run it fully in P2.
- `scene`: 1154 and 1162 `'Kuzunoha'` as the boss banner text (P0 0C: DATA); 328, 438, 808 summon payload names and 1133 bark text are fixtures (keep); 1346, 1347 titles (cosmetic).
- `screen_combat`: 241 to 245 a fixture view model (keep); 289, 290 `'+1 Block'`, `'3 Block/turn, Thorns 2'`, `'Regen 2'` (P0 0C the status names; the format is P2's), 291 `'Not enough Energy'` (P2 2E), `'Kuro is down'` and 292 `'Suzu is stunned'` (P0 0C names; P2 2E the wording, voiceless and starstruck), 310 and 624 `'FRONT'`, `'BACK'` (P2 2E: `LEAD`, `BACKING`), 356 `'Kuzunoha'`, 363 `'Oni Brute'` (P0 0C), 444, 626, 634 `Energy` (P2 2E: Breath), 453, 458 (P0 0C and P2 2E), 665 `'Thorns'`, 1129 `/Vulnerable 2/` (P0 0C), 720 `'Blossom Blade'` (P0 0C) with `'Front: +2 damage'`, `'Back: '` (P1 1F or 1A: the row text), 721 `'Blade Flow'` (P0 0C), 1070 to 1082 fixtures (keep), 1124 `'Kappa'`, 1364 `/Crow Tengu intends/` (P0 0C), 1586 the name width rule (P1 1F).
- `screen_end`: 175 the Play on button (P2 2E: On we go), 216 `'A Silent Ballad'` (P2 2E), 274 `'VERSE ONE COMPLETE'` (P2 2E), 275 `'Kuzunoha'` (P0 0C), 306 and 398 `/Suzu joins the band/` (P0 0C the name; P2 2E `joins the tour!`), 322 `/Sunken Lantern City/` (P0 0C: the lore title), 359 `/Fell in Verse I/` (P2 2E: `Curtain fell in Act I`), 398 `/Tempo Trial 2 unlocked/` (P2 2E: `Encore 2 unlocked`), 429 `'Hanae,Kuro'` (P0 0C), 445 `/Hanae and Kuro \| Score ... \| Tempo Trial 0/` (P0 0C names, P2 2E `Encore`), 741 `/Echo/` in the first hint (P2 2E: Vox); P3 3C and P9 9C add the outfit card and the follow row.
- `screen_map`: 165 `/Verse I/` (P2 2C: `Act I`), 166, 175, 220, 1821, 1824 `awake` (P2 2C: `live`), 274, 284, 287, 302 `Echo`, `Silent ground|heard` (P2 2C: Vox, `Muted ground|spotted`), 309 `/Ambush/` (P0 0D), 325 `/hums back one Echo/` (P2 2C: the toast lives in screen_map.js; the same sentence as run.js, P1), 381 `/No Songs/` (P2 2C), 461 `/no songs/i` (P2 2C: `/no spells/i`), 465 `/nowhere to wake/i` (P2 2C), 1189, 1190 the resting chip words (P2 2C), 1410, 1414 the `keeper` rarity tag (P2 2C: `headliner`) and 1414 `/peddler/i` (P2 2C: `/merch/i`), 1411, 1413 `/Found in Verse (I|II),/` (P2 2C), 1421 `/Treasures/` (P2 2C: Charms), 1439 the legend tabs `['The land', 'Songs', 'Controls', 'Words']` (P2 2C: `The Soundlands`, `Spells`, `Controls`, `Words`), 1699 `/Whispering/` (P0 0D), 1712 `/Verse II/` (P2 2C), 1770 `/Woke 1 hex for 1 Echo/` (P2 2C); the `__wake` and `__awake` spies (28 to 42, 1982 to 2060) use the AUDIO API names `wake` and `awake`, which are ids (keep); P7 7C and P8 8C may add assertions.
- `screen_menu`: 122 `/Verse 1/` (P1 1E), 251, 255, 268, 277, 278, 284, 374, 728, 734, 763, 770, 1156, 1183 DATA names (P0 0D), 304, 313 `'FRONT'`, `'BACK'` badges (P2 2B), 472, 1181, 1455 `Daily Jam` (P2 2B), 544, 616, 666, 765 `Chimes` (P2 2B: Cheers), 553 `'Treasures'` (P2 2B: Charms), 723, 738, 764, 1155 `Verse` and `Tempo Trial` (P2 2B), 775, 1260, 1301 `journey` (P2 2B: tour), 1072 `Liner note` (P2 2B: `Jordan's tip`), 696 `/2 of \d+ ballads heard/` and 700 `/not heard this ballad/` (P2 2B: `entries read`, `not reached this entry`, bible 5.5), 1542 `'Swap'` (keep), 1778, 1780 `'Begin the Journey'`, `/^Begin Daily Jam$/` and the width model (P2 2B: `Start the Tour`, `Start Daily Duet`), 78 the plaque order (ids, keep); P3 3C adds the outfit picker tests, P4 4C keeps the title clearance test, P9 9B the sixth tab.
- `screen_node`: 185 `'A Champion Falls'` (P2 2D), 297 `/nothing but an echo/` (P2 2D: squeak), 775 `'Brass Lantern'` (P0 0D), 888, 891 `/Let Kuro read the menu/` (P0 0D: the label from DATA), 1049 `/\+4 Echo \(3 to 7\)/` (P2 2D: Vox), 1421, 1756, 1760 `/Ember Ruby/` (P0 0D), 1563 to 1575 hero chips (P0 0D), 2078 `/No journey is underway/` (P2 2D), 1629 the remove service note `The peddler burns it for good.` (P2 2D: the HV_UI_COPY string), 2079 `/Back to Title/` (keep); 953 `'no_such_fable'` is an id (keep).
- `ui`: 210, 211, 247, 853 `Back` (generic, keep), 550 a fixture (keep), 571 `'Front row'`, 576 `/Poison 3/`, 687 `/Exhaust/`, 812 `/Hanae/` (P0 0C), 1044 `/song/i` for the Spell toasts (P2 2F: `/spell/i`), 1132 `/Chimes/`, 1147 `/no saved journey/i`, 1173 the pause labels with `Treasures` and `Abandon journey` (P2 2F); P3 3C adds the outfit store tests, P9 9A the share and links tests.

## 10. Cross-checks done for this file

- Every `tests/hocus_vocus_*` file (42, including the runner, the loader and the QA player) appears in section 9 with its pins or "no pin".
- Every phase lists owned files that are disjoint inside the phase (same-file work is sequential and marked "then"), its tests to run and
  edit, its gates and its screenshots.
- Every art and audio unit of HV_ART_AUDIO 12 lands in exactly one phase (section 1): A1 and A1b and A2 in P3; A3a in P4; A3b split
  across P4 (camp, shop, event, treasure), P5 (`ch1`, `boss1`), P6 (`ch2`, `boss2`) and P7 (`ch3`, `boss3`); A4a, A4b and A9 in P4; A8 and
  A6a in P5; A7a, A7b (minus `heroSprite`, which moved to P3 so card art wears stage clothes from the first outfit on) and A6b in P6; A5
  in P7; S1 to S5 in P8; A10 in P10; E1a to E3c in P5, P6 and P7.
- The gates match ECHO_PLAN 8.7 with the names changed (`hv_*` keys, `tools/hocus_vocus/`, HV_BASE) and two additions (G1b, G4).
- No em dash, no en dash, no tab, printable ASCII only.
