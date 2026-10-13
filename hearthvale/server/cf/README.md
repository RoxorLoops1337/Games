# Hearthvale on Cloudflare (always-on valley, free plan)

One Worker, one Durable Object (`Valley`) holding the whole valley (16 villages). It runs the very same
`shared/sim.js` + `shared/host.js` as the Node server. While anybody is connected the object ticks the world
10 times a second; when the last player leaves it saves and sleeps, and the next visit catches the world up
(at most 15 minutes of progress).

```bash
cd hearthvale
npx wrangler deploy --config server/cf/wrangler.toml
```

Then give your friends: `https://games-71g.pages.dev/hearthvale/?server=wss://hearthvale.<your-subdomain>.workers.dev/ws&auto`
(or open the Worker's own address `/`, which redirects there).

Status check: `https://hearthvale.<your-subdomain>.workers.dev/health`

Status: written to the same Host the tests cover, but not deployed from the build sandbox (no Cloudflare access),
so the first deploy is the first live run.
