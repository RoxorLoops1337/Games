# Battle Call

A live companion app for a beatbox battle (RoxorLoops & Jasmin). The audience ranks a Top 8/16/32 before the
elimination, calls every battle in the bracket, bets "Loops" (play money) and votes blue or red, then holds the
colour up in the hall. The organiser drives the whole event from a phone; a big screen follows along.

Links: audience app `https://games-71g.pages.dev/battle_call/`, organiser `#/h/CODE`, big screen `#/s/CODE`.
The live server is a Cloudflare Worker (see `server/README.md`); the Pages copy talks to it via `js/config.js`.

## Layout

- `engine.js`: the rules. Pure and synchronous, no IO, no clock (`S.now` is set by the caller). The Durable Object, the
  tests and anything else all run this exact code. **Every rule change goes here, with a test.**
- `js/shared.js`: pure helpers shared by engine, server and browser (bracket maths, odds, name cleaning, defaults).
- `server/worker.js`: Worker + `Event` Durable Object (one per event code). Accounts/tokens, persistence, WebSocket
  fan-out (hibernation API), photos, the HTTP fallback. `server/wrangler.toml` also serves this folder as static assets,
  so one deploy is a complete same-origin app. Deployed by hand with wrangler, never by the Pages build.
- `js/`: the browser app, vanilla ES modules, no bundler. `main.js` routing + every button, `state.js` mirror of the
  server state + odds maths, `net.js` socket/polling/HTTP, `ui.js` shared components, `dom.js` morphing renderer,
  `views/*` one file per screen. `css/app.css` is the whole design system (dark stage UI; BLUE = left, RED = right).
- `js/demo.js`: demo mode (`#/e/DEMO`, `#/h/DEMO`, `#/s/DEMO`). The real engine runs inside the page with 28 simulated
  fans, wired in through `net.js` (`isDemo()`); a floating director bar switches views, advances the organiser's next step
  or autoplays the whole night. No server needed, so the Pages copy is useful before the Worker is deployed. Keep it
  using `engine.js` directly, never a mock of the rules.
- `vendor/qrcode.js`: qrcode-generator (MIT), for the join QR.

## Categories

An event holds several categories (Solo Mix, Solo Female, Tag Team, Crew, Loop Station...). Each is a complete battle of its
own (`S.event.cats[id]`: lineup, bracket size 2/4/8/16/32/64 chosen by the host, phase, markets). Players sign up once and
keep one wallet. In the engine `S.ev` is "the category being worked on": public entry points point it at the right
category (`inCat`) and restore it. Match, market and beatboxer ids are unique across the event (the first category has no
id prefix, later ones start `c2.`), so picks/bets/votes are plain maps; only the Top-N ranking is per category
(`u.tops[catId]`). Ledger refs are prefixed per category. One battle on stage at a time; `S.event.active` is the stage and
phones follow it. The client builds `S.meta` as the category being looked at (`state.js` `rebuild`), so most screens are
unchanged. Never merge two categories' ids or markets.

## Rules in one paragraph

Phases: lobby -> picks -> elimination -> bracket -> finished, all driven by the organiser. The Top-N ranking is scored
when the organiser publishes the seeds (20 per pick that made it, +40 exact seat, +15 one seat off). Seeds draw a
standard bracket (1 v N, 2 v N-1 ... winners meet in the fixed tree). Each battle goes upcoming -> live (bets and the
round's picks lock) -> voting (audience votes, tally hidden) -> closed ("hands up") -> result (organiser enters the
judges' winner, optionally the judge split). Bracket picks pay 25 x 2^round. Bets are parimutuel (winners split the pot
including a small house seed, never less than 1.1x); markets: qualify, battle winner, reach-a-round, champion.
Voting pays 10 Loops (+15 if it matched the judges). One pot per player; the ranking is net worth (balance + open stakes).
A wrong result can be taken back (`reopen`) because every settlement writes a per-user ledger. `undo` (host action, `undoPlan`/`undoStep` in the engine, button on the Run tab) steps the selected category back exactly one thing each press, all the way to doors open: put a battle back, close/reopen the vote, take back the latest result (`m.ds` is the order results came in), take back the ranking, reopen the picks, close the picks. Tests check every Loop returns to the start.

## Hard rules for this folder

1. All Loops moves go through `credit()` with a ledger ref, or `reopen` stops being exact. Tests check conservation.
2. Money, bets, votes and picks are server-authoritative. The client never decides an outcome.
3. Never rename a `localStorage` key (`bc.sessions`, `bc.device`, `bc.server`, `bc.seen.<code>`) or the event/KV key
   prefixes (`ev`, `mk:`, `u:`, `lg:`, `ph:`, `host`): they are live data.
4. Form fields are uncontrolled in `dom.js` morph (a live update must never wipe what someone is typing). Keep it so.
5. Per-network account cap defaults to 500: a whole hall shares one wifi address.
6. No em dashes in copy.

## Tests

`npm run test:battlecall` = `tests/battle_call_engine.test.mjs` (rules, money, a 120-player simulation) +
`tests/battle_call_server.test.mjs` (accounts, auth, persistence across eviction, 200 simultaneous votes, photos, polling
fallback) against a fake Durable Object runtime. The real runtime: `npx wrangler dev --config battle_call/server/wrangler.toml`
then open http://localhost:8787/.
