# Handover 3 — Publish Awesome Farm to GitHub and host the server for (almost) free

> Written 2026-10-08. A plan for a fresh Claude session to execute. Everything here was checked against the
> repo, the branch and the providers' current pages on that date; the numbers that matter have sources at the end.
> Read `awesome_farm/CLAUDE.md` first (how the game is built, tested and hosted), then this file.

## 0. Paste-ready starter prompt

```
Read C:\Users\danhi\Games-awesome-farm\awesome_farm\handover\HANDOVER_3_PUBLISH_AND_HOST.md completely, then
awesome_farm\CLAUDE.md. Work only inside the worktree C:\Users\danhi\Games-awesome-farm (branch awesome-farm);
never touch the main checkout C:\Users\danhi\Games. Do Part A (publish to GitHub and Cloudflare Pages) first,
end to end, and show me the live page. Then do Part C (the Cloudflare server) and give me the new link.
Stop and ask before: deleting the prototypes folder, rewriting commit history, and switching the Cloudflare
account to the paid Workers plan.
```

## 1. Where things stand

| What | State on 2026-10-08 |
|---|---|
| Code | branch `awesome-farm` in the worktree `C:\Users\danhi\Games-awesome-farm`, **never pushed**; 300 commits that are not on `origin/main`; only `awesome_farm/` differs from main |
| Behind main | `origin/main` is 47 commits ahead of the branch's fork point (other games); nothing conflicts because the branch only touches `awesome_farm/` |
| Quality gate | `cd awesome_farm && npm run check` = both typechecks + 682 tests + production build, green |
| Size | 430 tracked files; **`awesome_farm/prototypes/` is 41 MB** of parked low-poly 3D experiments (the owner chose the 2D style) |
| Live today | self-hosted from the owner's PC: `C:\Users\danhi\awesome-farm-host\` (packaged Node server on port 7790, a free Cloudflare quick tunnel whose link changes on every restart, `server-control.bat` control page) |
| Repo deploy | Cloudflare Pages builds `dist/` from the root `build.js` on every merge to `main` (`npm install && npm run build`); site `https://games-71g.pages.dev/<folder>/`; Pages Functions in `functions/api/*` already use a KV binding `BOARD` |
| Cloudflare | the owner's account already runs Pages + KV and has `ironbridge-relay/` (a Worker + Durable Object, SQLite-backed, on the **free** plan, deployed by hand with `npx wrangler deploy`) |
| Commit rule | the root `CLAUDE.md` says "never put a model identifier in commits/PRs"; every commit on `awesome-farm` ends with a `Co-Authored-By: Claude …` trailer |

## 2. Decisions for the owner (ask once, up front)

1. **Prototypes.** Drop `awesome_farm/prototypes/` from the branch before pushing (recommended: 41 MB of parked
   experiments would live in the repo for ever; keep them on a side branch `awesome-farm-prototypes`), or push them too.
2. **Commit trailers.** Either rewrite the 300 branch commits to strip the `Co-Authored-By` lines before pushing
   (`git filter-repo --message-callback`, 30 seconds, rewrites only this branch), or push as is and let the
   squash-merge produce one clean commit on `main` (the PR page still shows the trailers on the branch commits).
3. **Server plan.** Free Workers plan first (fits a friends group, see the budget in C.4); upgrade to Workers Paid
   ($5/month) only if the 100,000 requests/day cap ever bites.

## 3. Part A — Publish: the game on GitHub and on the Pages site

Goal: `https://games-71g.pages.dev/awesome_farm/` serves the game (solo works at once; Join needs the server from
Part C). The source lives in `awesome_farm/` on `main` like every other game.

A1. **Bring the branch up to date.** In the worktree: `git merge origin/main` (no conflicts expected: the branch only
    touches `awesome_farm/`). Re-run `cd awesome_farm && npm run check`.
A2. **Prototypes** (if the owner said yes): `git branch awesome-farm-prototypes` (keeps them), then
    `git rm -r awesome_farm/prototypes` and remove the "parked low-poly 3D experiments" line from the folder layout in
    `awesome_farm/CLAUDE.md`; note in `DESIGN.md` that the prototypes live on that side branch.
A3. **Wire the game into the root build** (`build.js`). The other games are static folders; Awesome Farm must be built
    (Vite) first. Add, before `copyStatic()`:
    - a `buildAwesomeFarm()` step that runs `npm ci` and `npm run build` inside `awesome_farm/` (`child_process.execSync`
      with `cwd`, `stdio: 'inherit'`), then copies `awesome_farm/dist/` to `dist/awesome_farm/`. Do NOT add
      `awesome_farm` to `STATIC_PATHS` (that would copy sources, node_modules and 1 MB of handover notes).
    - Vite already builds with `base: './'`, so the bundle works under `/awesome_farm/`; fonts come from `public/`.
    - `npm run build` in `awesome_farm` runs `tsc` first (type errors fail the deploy: intended).
    - Pages' build image has Node 18+ (Vite 6 and `tsx` need 18); if the build log says otherwise, add a
      `.node-version` file at the repo root with `20`.
A4. **Cache headers.** In `_headers` add, like the Clawspire block:
    ```
    /awesome_farm/assets/*
      Cache-Control: public, max-age=31536000, immutable
    ```
    (Vite hashes every file in `assets/`; `index.html` stays revalidated.)
A5. **Landing page.** Add a card to `GAMES` in the root `index.html` (around line 215): `id:'farm', href:'/awesome_farm/',
    title:'Awesome Farm', ac:'#92d364', desc:'Co-op island farming for up to 16 friends: build, automate, tame, fight
    six bosses. Solo works at once; join a friend's server to play together.', tags:['cozy','sim']`.
A6. **Root test wiring.** The root `npm run check` must stay green and must not get 40 s slower for every other game:
    add a root script `"test:farm": "npm --prefix awesome_farm test"` and mention in the root `CLAUDE.md` repo map that
    Awesome Farm has its own `npm run check` inside its folder (its tests need its own `node_modules`). Do not add it to
    the root `test` chain.
A7. **Client defaults for a public page** (`awesome_farm/src/client/scenes/Title.ts`): the Join box is empty on a
    static host (fine), and `detectHostServer()` only fills it when the page itself is served by a game server. Once
    Part C exists, set the default address to the Worker's URL when `location.host` ends with `pages.dev` or is the
    owner's domain (one constant `PUBLIC_SERVER` in `profile.ts`), so friends never type anything. Leave the field
    editable for self-hosted servers.
A8. **Docs.** `awesome_farm/CLAUDE.md` top paragraph says the folder is "not yet wired into the root build.js / Pages
    deploy": change it to say how it is wired (A3) and that the root `check` does not run its tests (A6).
A9. **Commit, push, PR, merge** (the root workflow): commit the wiring on `awesome-farm`; strip trailers if decided
    (A-2); `git push -u origin awesome-farm`; `gh pr create --draft` with a title like "Awesome Farm: a new co-op farming
    game" and a body that lists what the game is and where it is served (no model identifiers, no session links other
    than what the harness adds); mark ready; **squash-merge** to `main`; wait for the Pages build (~2–3 minutes, the
    farm build adds about a minute); open `https://games-71g.pages.dev/awesome_farm/` and play a solo minute on
    desktop and on a phone. Then delete the remote branch; keep the local worktree.
A10. **Acceptance:** the page loads with no console errors, the title island preview shows, a solo world starts and
    saves across a reload, the landing page card opens it, `curl -I` on an `assets/*.js` file shows the one-year cache
    header, and the root `npm run check` is still green.

## 4. Part B — Where the server can live (what "free" really means)

The server is one Node process that runs `SimHost` (the same simulation the browser runs solo), keeps WebSockets open
and saves a ~0.2–1 MB JSON world every 20 s. It needs: a long-lived process, WebSockets, persistent storage, an
https/wss address. Checked on 2026-10-08:

| Option | Cost | Fits the server as it is? | Catches |
|---|---|---|---|
| **Cloudflare Worker + Durable Object** (recommended) | **Free plan** today; Workers Paid $5/month if the cap bites | No: needs a thin adapter (Part C), the Node parts (ws, fs, timers) are replaced by the DO's WebSocket, storage and alarm APIs | Free plan: 100,000 requests/day (alarms + HTTP + incoming WebSocket messages at 20:1), 13,000 GB-s/day duration, 5 GB storage, 100,000 rows written/day; 2 MB per stored value (the world must be chunked or compressed) |
| Oracle Cloud Always Free (Ampere VM) | Free, no time limit | Yes, as is (Node + the packaged server) | Free ARM capacity was cut to about 2 OCPU / 12 GB in August 2026, regions are often "out of capacity" for weeks, and an instance idle for 7 days (CPU, network and memory all under 20%) can be reclaimed; needs a named tunnel or an open port with TLS; a credit card at sign-up |
| Render free web service | Free (750 instance-hours/month) | Yes, but it sleeps | Spins down after 15 minutes without an HTTP request or WebSocket message, wakes in about a minute; **no persistent disk on free**: every spin-down loses the file system, so the world would have to be saved somewhere else (KV/R2) on every autosave |
| Keep self-hosting (today) | Free | Yes | Only online while the owner's PC is on and the tunnel is up; the link changes on every restart |

Recommendation: **Cloudflare**. The owner's account, the Pages site, a KV namespace and a working free-plan Durable
Object (`ironbridge-relay`) are already there; the world is small; the client already reconnects by itself and
accepts any `https://` server address. Start on the free plan; the budget in C.4 shows a friends group fits.

## 5. Part C — The Cloudflare server (Worker + one Durable Object per world)

Shape: a Worker (`awesome_farm/server/cf/worker.ts`) routes `GET /status` and `GET /ws` to one Durable Object
`World` named by the world id (`farm`). The DO holds the `SimHost`, the WebSockets (hibernation API), the alarm that
ticks the simulation while anybody is connected, and the save in its SQLite storage. The game client stays on Pages
(Part A); the title screen points at the Worker's URL (A7). The Node server keeps working unchanged (same `SimHost`).

C1. **Project layout** (inside `awesome_farm/`, deployed by hand like `ironbridge-relay`, never by the Pages build):
    - `server/cf/wrangler.toml`: `name = "awesome-farm"`, `main = "worker.ts"`, `compatibility_date` today,
      `[[durable_objects.bindings]] name = "WORLD" class_name = "World"`, `[[migrations]] tag = "v1"
      new_sqlite_classes = ["World"]` (SQLite classes are the ones the free plan allows; copy the comments from
      `ironbridge-relay/wrangler.toml`), `[observability] enabled = true`.
    - `server/cf/worker.ts`: the `fetch` handler (CORS headers for the Pages origin on `/status`; `Upgrade: websocket`
      on `/ws` → `env.WORLD.get(env.WORLD.idFromName(worldName)).fetch(request)`; everything else 404) and the
      `World` class (below). Build with `wrangler` (it bundles TypeScript itself); `tsconfig` for it extends the server
      one with `lib: ["ES2022", "WebWorker"]` and `types: ["@cloudflare/workers-types"]` (dev dependency).
    - `src/shared/net/host.ts` is reused as is: it already takes a `Peer { send, close?, ready?, addr? }`, an
      injectable clock `now`, `HostOptions { devKey, devOpen, grace, hash }`, and calls `onSave(json)` / `onLog`.
C2. **The `World` Durable Object**
    - `constructor(ctx, env)`: `ctx.blockConcurrencyWhile(load)`: read the save (C3), `new Sim(state)` (or
      `Sim.create(seed, name)` when none), `new SimHost(sim, env.SERVER_NAME, env.PASSWORD, { devKey: env.DEV_KEY,
      grace: 30 })`, `host.onSave = save`. Sockets that survived a hibernation (`ctx.getWebSockets()`) are closed with
      code 1012 "restarting": the client reconnects by itself (1-2-4-8-8 s) and gets a fresh welcome. (The sim never
      hibernates while anyone is connected, because the alarm keeps it awake; it only sleeps when empty, after a save.)
    - `fetch`: `/status` → the same JSON as `server/main.ts` (`host.playerCount`, farmers, day, protocol, password);
      `/ws` → `WebSocketPair`, `ctx.acceptWebSocket(server)`, `host.attach(peer)` where `peer.send = (t) => server.send(t)`,
      `peer.close = () => server.close(1000)`, `peer.ready = () => true`, `peer.addr = request.headers.get('cf-connecting-ip')`;
      keep a `Map<WebSocket, Peer>`; make sure the alarm is scheduled (C4).
    - `webSocketMessage(ws, msg)`: the inbound token bucket from `server/main.ts` (40/s, burst 80, 64 KB), then
      `host.receive(peer, text)`. `webSocketClose/webSocketError`: `host.detach(peer, clean)` (the 30 s grace applies).
    - `alarm()`: `host.update(elapsedSeconds)` (SimHost steps the sim at 20 Hz internally and flushes at 10 Hz; the
      `poke()` budget still answers commands at once), then re-arm the alarm if `host.playerCount > 0 || host.pending`;
      otherwise save and let the object go idle. Keep the last alarm time in memory to compute `elapsed`.
    - Crash safety as in `server/main.ts`: a throwing `update` marks the world tainted, writes a `crash-<stamp>` entry
      and skips autosaves until a clean tick; `/status` says `tainted: true`.
C3. **Saves in DO storage.** A value may not exceed 2 MB (key + value). The world is 0.2–1 MB today and grows with
    play, so never store it in one key: gzip it with `CompressionStream('gzip')` (a 0.8 MB world becomes ~150 KB) and
    split the bytes into 512 KB chunks under keys `world:0..n` plus a `meta` row `{ n, bytes, savedAt, version }`;
    write in one `ctx.storage.transaction` (or `put({...})` with all chunks) so a reader never sees half a save. Keep
    the last three saves (`world@<stamp>`), prune older ones. Rows written per autosave: a handful (the daily cap is
    100,000). Add `GET /admin/backup` (returns the JSON) and `POST /admin/restore` / `POST /admin/reset`, all requiring
    the dev key in an `Authorization` header (compare with the same salted hash the host uses) — this is what the
    control page becomes for the cloud server.
C4. **Budget on the Workers Free plan** (8 friends playing 4 hours a day): incoming WebSocket messages count 20:1, so
    8 farmers moving at 10 Hz (half the time) ≈ 40 msg/s → 2 requests/s → 29,000/day; the alarm at 200 ms while
    anybody is online → 5/s → 72,000/day for 4 hours. That is ~100,000/day: right at the cap. Use a 250 ms alarm
    (the client glides between samples and `poke()` still answers commands at once) → 58,000, total ≈ 87,000/day with
    headroom; or go to Workers Paid ($5/month, 1 million requests included, then $0.15 per million: a heavy month is
    well under $10). Duration: an active object is billed while awake (~128 MB → 450 GB-s per hour), 13,000 GB-s/day
    free ≈ 29 hours of play per day. CPU per alarm ≈ 5 sim steps × 1.5 ms + a 2.4 ms flush ≈ 10 ms, far under the DO
    limit (30 s per request). Sign-ins hash the secret word in ~13 ms of pure JS; fine.
C5. **Secrets and config.** `wrangler secret put PASSWORD`, `DEV_KEY` (from `awesome-farm-host\dev-key.txt`),
    `SERVER_NAME` as a plain var. Never put them in the repo. The password stays optional (the title screen asks).
C6. **Client.** A7's `PUBLIC_SERVER` = `https://awesome-farm.<subdomain>.workers.dev` (the client already turns
    `https://` into `wss://` for `/ws`). `/status` must send `access-control-allow-origin` for the Pages origin (the
    title screen checks it before Join). Nothing else changes: protocol, commands and the welcome are the same.
C7. **Tests.** The sim and host suites already prove the rules; add `tests/cf.test.ts` that runs the adapter's pure
    parts (chunking + gzip round trip, the alarm/elapsed bookkeeping, the admin auth check) without Cloudflare, and a
    manual check with `npx wrangler dev` + the join probe (`awesome-farm-host\…\join.mjs` pattern: hello, welcome,
    two ticks). Then deploy to a preview (`wrangler deploy --env preview`) and play ten minutes from a phone over
    mobile data: join, reconnect after locking the phone (the 30 s grace), a night, a save and a cold start.
C8. **Migration of the live world.** `GET /admin/restore` with the current `worlds\farm.json` from the host folder (the
    accounts come with it, so friends keep their name + secret word). Do it while nobody is online on the PC server,
    then stop the PC server (`server-control.bat` → Stop) and tell friends the new address (it never changes again).
C9. **Rollback.** The PC server and its control page stay as they are; `start-online.bat` brings the old setup back in
    a minute with the last `farm.json`.
C10. **Docs.** `awesome_farm/CLAUDE.md` "Run, test, build, host": a "Cloudflare" paragraph (deploy command, secrets,
     admin routes, the budget); `DESIGN.md` Architecture: a third host ("Cloudflare: one Durable Object per world");
     `README.md` hosting paragraph; the memory file `reference_awesome_farm_hosting.md`.

## 6. Risks and how the plan handles them

- **Daily request cap on the free plan** → the 250 ms alarm, no alarm when nobody is connected, `/status` polled by
  nobody but the title screen; `/status` reports the day's request estimate so the owner sees it coming; the $5 plan
  is the escape hatch.
- **A 2 MB value limit** → chunk + gzip (C3), with a test.
- **Hibernation losing the host's per-peer state** → close surviving sockets on construction; the client reconnects.
- **Single location** → the object lives near the first player who joined; fine for one group of friends.
- **Pages build time** → the farm build adds ~1 minute; cached `node_modules` are not guaranteed on Pages, so `npm ci`
  runs every time (acceptable).
- **Repo size** → prototypes removed first (A2); the branch is 430 files / under 5 MB without them.
- **History rule** → strip trailers before the first push, or accept them on the branch and rely on the squash.

## 7. Done means

- [ ] `https://games-71g.pages.dev/awesome_farm/` plays solo on desktop and phone; the landing page lists it.
- [ ] `awesome_farm/` is on `main` via a squash-merged PR; the root `npm run check` is green.
- [ ] `https://awesome-farm.<subdomain>.workers.dev/status` answers; friends join from the Pages page with no typing.
- [ ] The live world (farmers, accounts, land) was carried over; a phone that locks for 20 s comes back without dying.
- [ ] A day of play stays under the free plan's caps (check the Workers dashboard the next morning).
- [ ] Docs and the hosting memory say where the server lives and how to reset, back up and restore it.

## Sources (checked 2026-10-08)

- Durable Objects pricing (free plan: 100,000 requests/day, 13,000 GB-s/day, WebSocket messages 20:1, storage rows and GB): https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects limits (SQLite classes on the free plan, 2 MB per key+value, 30 s CPU per request, 5 GB on free): https://developers.cloudflare.com/durable-objects/platform/limits/
- Workers pricing (Paid plan $5/month, 10 million requests included): https://developers.cloudflare.com/workers/platform/pricing/
- Render free services (15-minute spin-down, no persistent disk, 750 hours/month): https://render.com/docs/free and https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages
- Oracle Always Free (A1 reduction in August 2026, idle reclaim rule): https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm and https://braindetox.kr/en/posts/oracle_always_free_tier_reduced_2026.html
