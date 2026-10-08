# Games

A repo of small self-contained browser games. Each one lives in its own folder,
builds to `dist/` via `build.js`, and deploys to Cloudflare Pages on merge to
`main` — `https://games-71g.pages.dev/<folder>/`.

## Working in here

```
npm run check:changed  build + only the games this branch changed: the gate before any push
npm run check          every game's test suites (about nine minutes), on demand
npm run check:times    the same suites, timed, naming any that has run away
```

**`npm run check:changed` is the one to run before a push.** It diffs the branch
against `origin/main` and runs only the suites of the games that changed
([tools/check-changed.mjs](tools/check-changed.mjs)), so a fix to one game waits on
seconds, not on all of them. Anything shared (`build.js`, `package.json`, a folder it
does not know) makes it run the full `npm run check` instead. It must be green before
anything is pushed. If a suite fails in a game you did not touch, do not go and fix
it: re-run that suite alone first (several build their boards from a fresh seed and
fail on maybe one run in five), and if it still fails, push your own work and say so.

**`npm run check:times` exists because the nine minutes is nobody's job.** Every
game here is maintained separately, so the person who makes one suite slow never
sees the total and the person waiting on the total does not know whom to ask. It
times each suite, reports its share, and names any single suite taking more than a
quarter of the whole check. `--ci` makes that exit non-zero.

It is a repo-level tool rather than any one game's: it reads `package.json` for
every `test:*` script and knows nothing about what any of them do. The one reading
taken so far, and what came out of shrinking the suite that used to be worst, is in
[docs/CHECK_TIMES.md](docs/CHECK_TIMES.md).

## The games

Each folder is a game. `frostfell/` additionally carries
[DESIGN.md](frostfell/DESIGN.md), a record of what has been measured about it and
what those measurements changed. Handovers, roadmaps and plans that cover a whole
game live in [docs/](docs/) (No Room For Heroes, Grimhold, Merry Crashmas, Dungeon
Pusher), outside the game folders so they are never deployed. Read the one for a
game before changing it.
