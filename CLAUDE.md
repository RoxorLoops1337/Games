Workflow:
- Commit and push the feature branch whenever it helps, without waiting for tests, and open the PR (draft) right after the push.
- Before MERGING to main: run `npm run check:changed` (build + the test suites of the games you changed). Never merge red. When it is green, mark the PR ready and squash-merge to main without asking. Skip the "want me to merge?" question. While tests are still running, the branch and the draft PR may already be pushed; just hold the merge.
- Commit messages end with the session link the harness provides. Never put a model identifier in commits/PRs.

Reply formatting:
- Each game's link is `https://games-71g.pages.dev/<folder>/`. Some games have their own `CLAUDE.md` with extra links (No Room For Heroes does).

- For Awesome Farm, END every reply that is about the game with the two links as its last lines: Solo: `https://games-71g.pages.dev/awesome_farm/play/` and Server: `https://awesome-farm.danhieux-senjka.workers.dev/` (the worlds: `/w/farm`, `/w/quarry`, `/w/snowcap`).

# Repo map (read this before touching anything)

- One folder per game, served as-is at `/<folder>/`. Game-specific notes live in that game's own `CLAUDE.md` (`no_room_for_heroes/CLAUDE.md`, `awesome_farm/CLAUDE.md`), which load only when you work in that folder.
- `build.js`: copies static folders into `dist/` (Pages deploys `dist/`). New top-level folders must be added to `STATIC_PATHS`.
- `blockmates/`: original 2D block sandbox for up to 16 players (plain ES modules, no build; the same `World` simulation runs in the browser for solo play, in `server/node.js` and in a Cloudflare Durable Object). Its own `CLAUDE.md` has the rules (append-only ids, no art files); tests `npm run test:blockmates`.
- `functions/api/*.js`: Cloudflare Pages Functions (leaderboards + cloud saves, KV binding `BOARD`).
- `tests/<game>_*.test.mjs`: headless suites, one `test:<name>` npm script per game. Write new tests there; never create throwaway harnesses outside `tests/`.
- `awesome_farm/`: Awesome Farm, a Vite + TypeScript game with its own `package.json`, `CLAUDE.md` and `npm run check` (run them inside that folder). The site serves the repo as it is (no build on Pages), so its build is committed in `awesome_farm/play/` (served at `/awesome_farm/play/`; `/awesome_farm/` forwards there): after changing the game run `npm run build:pages` in that folder (or `FARM=1 node build.js`) and commit `play/`. Its tests are not in the root `check` (`npm run test:farm` runs them). Its always-on world is a separate Cloudflare Worker (`awesome_farm/server/cf/`, deployed by hand, never by Pages).

# Verify

    npm run check:changed   # build + only the suites for the games this branch changed (before every merge)
    npm run check           # build + every suite (~7.5 min), run on demand
    npm run check:changed -- --dry   # just print which suites it would run

`check:changed` diffs against origin/main and maps each changed file to its game's suites
(`tools/check-changed.mjs`). Changes to shared files (`build.js`, `package.json`, root
`index.html`, an unmapped folder) automatically run the FULL check. When you add a new game
with tests, add its folder and `test:` scripts to `GAME_SUITES` in that file, and add the
`test:` script to `check` in `package.json`.

**Hard rules for every session, every size:**
1. Green before merge, but the bar is YOUR work, not the whole repo.
   If a suite fails in a game you did NOT touch (only possible when the full check runs):
   - do not go and fix it. One red suite elsewhere must never turn a small change into a
     patch to a different codebase. Staying out is the right call even when the fix looks easy.
   - re-run that one suite by itself first. Several are randomised (grimhold and
     dungeon_pusher build boards from a fresh seed each run) and fail on maybe one
     board in five, so a single red run proves nothing.
   - if it still fails: merge your own work anyway and SAY SO in the reply: name the
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

When the user asks to create a sprite, icon, item, tile or portrait, use the local generator: `/sprite <subject>`
(`.claude/commands/sprite.md` has the steps; options in `tools/comfyui/README.md`). It needs ComfyUI running on the
owner's machine, so it does NOT work from cloud/web sessions: say so instead of trying.
