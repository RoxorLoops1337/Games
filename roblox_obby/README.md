# Roblox Obby (starter)

A classic **obby** (obstacle course) for Roblox — 20 stages of jumps, kill‑brick
gauntlets, narrow beams and stairs, with checkpoints, a saved personal best, and
a finish line. The whole course is **generated from code at runtime**, so there's
nothing to build by hand: open it in Roblox Studio and press **Play**.

> ⚠️ This is Roblox source, not a web game. It does **not** deploy to Cloudflare
> Pages and isn't part of `npm run check`. You run and publish it from Roblox
> Studio.

## What's inside

| File | Goes in (Studio) | Does |
|------|------------------|------|
| `src/server/ObbyGenerator.server.luau` | ServerScriptService | Builds the course, checkpoints & finish pad |
| `src/server/CheckpointService.server.luau` | ServerScriptService | leaderstats (Stage/Best), checkpoint saves, kill bricks, DataStore |
| `src/client/StageGui.client.luau` | StarterPlayer → StarterPlayerScripts | On‑screen "Stage / Best" HUD |

## Run it — option A: Rojo (recommended, keeps it in git)

[Rojo](https://rojo.space) syncs these files straight into Studio.

1. Install Rojo (`aftman add rojo-rbx/rojo`, or the VS Code "Rojo" extension).
2. From this folder: `rojo serve`
3. In Studio: install the Rojo plugin → **Connect**. The scripts appear in the
   right services automatically.
4. Press **Play**. The course generates and you can run it.

## Run it — option B: copy‑paste (no tools)

1. In Studio, open the Explorer.
2. Add a **Script** to `ServerScriptService`, paste `ObbyGenerator.server.luau`.
3. Add another **Script** to `ServerScriptService`, paste `CheckpointService.server.luau`.
4. Add a **LocalScript** to `StarterPlayer → StarterPlayerScripts`, paste
   `StageGui.client.luau`.
5. Press **Play**.

## Saving progress (personal best)

Best‑stage saving uses a DataStore. To make it work:

- **In Studio:** Game Settings → Security → enable **Studio Access to API Services**.
- **Published games:** DataStores work automatically once the place is published.

If API access is off, the game still runs fine — it just won't remember your
best between sessions (the code guards against the error).

## Tweaking it

Open `ObbyGenerator.server.luau` — the tunables block at the top controls stage
count, gaps, platform size, and colours. Add your own obstacle patterns by
writing a `buildX(x, y, color)` function that returns the new `x`, then calling
it from the stage loop.

## Publishing

File → Publish to Roblox As… → create a new place. Set it public in the
[Creator Dashboard](https://create.roblox.com) and share the link.
