# SimTycoon

An isometric tycoon game in the spirit of Rollercoaster Tycoon. Built with
TypeScript, Vite, PixiJS v8, and Zustand.

> Status: scaffolding only. There is no game logic yet — the canvas just
> renders "Hello Park" on a green background.

## Quick start

```bash
npm install
npm run dev        # vite dev server at http://localhost:5173
npm run build      # type-check + production build to dist/
npm run preview    # serve the built bundle locally
npm run test       # run vitest once
npm run test:watch # run vitest in watch mode
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Tech stack

| Concern        | Choice                  |
| -------------- | ----------------------- |
| Language       | TypeScript (strict)     |
| Bundler        | Vite                    |
| Renderer       | PixiJS v8 (WebGL/WebGPU)|
| State          | Zustand                 |
| Testing        | Vitest + jsdom          |
| Lint / format  | ESLint + Prettier       |

See `DECISIONS.md` for the rationale and any subsequent architectural choices.

## Architecture

The codebase is organized as a set of layered modules under `src/`. Each layer
only depends on layers below it, never above:

```
ui          <- HUD, menus, dialogs (consumes state, dispatches intents)
rendering   <- PixiJS scene graph, isometric projection, sprites, camera
game        <- domain: parks, guests, rides, queues, economy
engine      <- tick loop, fixed timestep, deterministic systems
utils       <- pure helpers (math, RNG, iso coordinates, asserts)
data        <- static content tables (rides, scenery, scenarios)
types       <- shared TypeScript declarations
```

### Folder roles

- **`src/engine`** — game loop, fixed-timestep simulation, system scheduling.
  Knows nothing about parks, guests, or how things are drawn. Anything here
  should be testable headlessly with no Pixi import.
- **`src/game`** — the simulation: parks, guests, rides, queues, economy,
  staff, weather. Depends on `engine` for ticking but never on `rendering`
  or `ui`. This is where most gameplay code will live.
- **`src/rendering`** — PixiJS layer. Owns the `Application`, scene graph,
  isometric projection helpers, sprite factories, camera. Reads from game
  state; never writes back into it.
- **`src/ui`** — HUD, menus, toolbars, dialogs. May be implemented in Pixi
  or as DOM overlays; the choice is recorded in `DECISIONS.md`. UI emits
  intents into the game layer and subscribes to state via Zustand selectors.
- **`src/data`** — content tables: ride catalog, scenery items, guest
  archetypes, balancing constants, scenario definitions. Plain data only.
- **`src/utils`** — pure helpers. Must be side-effect free and trivially
  testable.
- **`src/types`** — shared type declarations and ambient module typings.
- **`tests/`** — Vitest specs. Co-located `*.test.ts` files inside `src/`
  are also discovered.

### Module aliases

Configured in both `tsconfig.json` and `vite.config.ts`:

| Alias        | Points to        |
| ------------ | ---------------- |
| `@/*`        | `src/*`          |
| `@engine/*`  | `src/engine/*`   |
| `@game/*`    | `src/game/*`     |
| `@rendering/*` | `src/rendering/*` |
| `@ui/*`      | `src/ui/*`       |
| `@data/*`    | `src/data/*`     |
| `@utils/*`   | `src/utils/*`    |
| `@types/*`   | `src/types/*`    |

### Entry point

`index.html` → `src/main.ts` → `src/rendering/bootstrap.ts`. The bootstrap
function creates a `PIXI.Application`, sizes it to the `#app` container, and
draws "Hello Park" on a green background.

## Project conventions

- Strict TypeScript everywhere. No `any`, no implicit `any`,
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- Pure modules in `utils` / `data` — no top-level side effects.
- Game logic is rendering-agnostic and headlessly testable.
- Architectural changes are recorded in `DECISIONS.md`.
