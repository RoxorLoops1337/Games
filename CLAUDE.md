Workflow:
- After committing + pushing to the feature branch, always create the PR (draft), then mark it ready and squash-merge to main without asking. Skip the "want me to merge?" question.
- Before EVERY push: run `npm run check:changed` (build + the test suites of the games you changed). If it fails, fix it before pushing. Never push red.
- Commit messages end with the session link the harness provides. Never put a model identifier in commits/PRs.

Reply formatting:
- Each game's link is `https://games-71g.pages.dev/<folder>/`. Some games have their own `CLAUDE.md` with extra links (No Room For Heroes does).

# Repo map (read this before touching anything)

- One folder per game, served as-is at `/<folder>/`. Game-specific notes live in that game's own `CLAUDE.md` (`no_room_for_heroes/CLAUDE.md`, `awesome_farm/CLAUDE.md`), which load only when you work in that folder.
- `build.js`: copies static folders into `dist/` (Pages deploys `dist/`). New top-level folders must be added to `STATIC_PATHS`.
- `functions/api/*.js`: Cloudflare Pages Functions (leaderboards + cloud saves, KV binding `BOARD`).
- `tests/<game>_*.test.mjs`: headless suites, one `test:<name>` npm script per game. Write new tests there; never create throwaway harnesses outside `tests/`.
- `awesome_farm/`: Awesome Farm, a Vite + TypeScript game with its own `package.json`, `CLAUDE.md` and `npm run check` (run them inside that folder). The site serves the repo as it is (no build on Pages), so its build is committed in `awesome_farm/play/` (served at `/awesome_farm/play/`; `/awesome_farm/` forwards there): after changing the game run `npm run build:pages` in that folder (or `FARM=1 node build.js`) and commit `play/`. Its tests are not in the root `check` (`npm run test:farm` runs them). Its always-on world is a separate Cloudflare Worker (`awesome_farm/server/cf/`, deployed by hand, never by Pages).

# Verify

    npm run check:changed   # build + only the suites for the games this branch changed (before every push)
    npm run check           # build + every suite (~7.5 min), run on demand
    npm run check:changed -- --dry   # just print which suites it would run

`check:changed` diffs against origin/main and maps each changed file to its game's suites
(`tools/check-changed.mjs`). Changes to shared files (`build.js`, `package.json`, root
`index.html`, an unmapped folder) automatically run the FULL check. When you add a new game
with tests, add its folder and `test:` scripts to `GAME_SUITES` in that file, and add the
`test:` script to `check` in `package.json`.

**Hard rules for every session, every size:**
1. Green before push, but the bar is YOUR work, not the whole repo.
   If a suite fails in a game you did NOT touch (only possible when the full check runs):
   - do not go and fix it. One red suite elsewhere must never turn a small change into a
     patch to a different codebase. Staying out is the right call even when the fix looks easy.
   - re-run that one suite by itself first. Several are randomised (grimhold and
     dungeon_pusher build boards from a fresh seed each run) and fail on maybe one
     board in five, so a single red run proves nothing.
   - if it still fails: push your own work anyway and SAY SO in the reply: name the
     game and the assertion. Whether it gets fixed is the owner's call, not yours.
   If the failure is in a game you DID touch, it is yours: fix it or STOP and report.
2. After any merge of origin/main into the branch, RE-GREP for the feature you just added
   (squash-merges resurrect old code; resolve conflicts by keeping HEAD, then verify).
3. Never rename `localStorage` keys, KV keys, or game folders (they are live URLs and save data).
4. Cloudflare KV: `expirationTtl` must be ≥ 60. Smaller values throw and 500 the request.

# Plugins

`.claude/settings.json` switches off the account plugins (legal, finance, marketing,
cowork-plugin-management) in this repo, since game work never needs them and they add
skills and failing connections to every session. To use one here for a single task, put
`{"enabledPlugins": {"marketing@synced": true}}` in `.claude/settings.local.json` (not committed).

# Deploy & infra

- Merge to main → Cloudflare Pages auto-builds `dist/` (~1 min). `_redirects` handles the old `/boss_monster/*` path.
- GitHub via `mcp__github__*` tools only (no gh CLI), scope `roxorloops1337/games`. Token can expire mid-session: commit+push anyway, PR when it recovers.
- Merge conflicts with origin/main after squash-merges are NORMAL. Resolve keeping HEAD (your branch), re-run `npm run check:changed`, re-grep your feature.

# Generating pixel-art assets (local ComfyUI)

This repo has a local sprite generator under `tools/comfyui/`. When the user asks to
create, generate, or make a sprite / icon / item / tile / portrait, use it instead of
drawing by hand or reaching for a cloud service. Run from the repo root:

    python tools/comfyui/make_sprite.py "<subject prompt>" --name <short-name> --size <px>

- Auto-appends pixel-art style cues, renders on the local ComfyUI (SDXL + Pixel Art XL),
  pixelates (downscale + palette + transparent bg), and writes `assets/<name>.png`.
  Move the finished sprite into the game's art folder and wire it like the other art.
- Default size 64; `--size 96` for more detail. Default palette is true color; pass
  `--palette tools/comfyui/palettes/pico-8.gpl` for a stylized 16-color look.
- `/sprite <subject>` is the slash-command shortcut (`.claude/commands/sprite.md`).
- One-time: `pip install pillow numpy`; verify with `python tools/comfyui/make_sprite.py --check`.
- Better models / quality knobs: see `tools/comfyui/README.md`.
- **REQUIRES a reachable local ComfyUI** (default `127.0.0.1:8000`). This works from
  Claude Code running on the owner's machine, NOT from cloud/web sessions, whose
  container can't reach the local ComfyUI. The pixelate half (`pixelate.py`) runs
  anywhere `pillow`+`numpy` are installed.
