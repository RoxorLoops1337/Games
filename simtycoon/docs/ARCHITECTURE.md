# SimTycoon Architecture

> Version 0.1 — written before any game code. This document is the source of
> truth for how subsystems are organized, how they communicate, and what the
> performance budget looks like. Any change here that affects subsystem
> boundaries or the data model also needs an entry in `DECISIONS.md`.

## Architectural decisions baked into this document

| # | Decision | Source |
|---|----------|--------|
| 1 | Lightweight ECS (entities + component arrays + systems) | DECISIONS 0004 |
| 2 | Tile-segment tracks behind a `TrackCurve` interface (spline-ready) | DECISIONS 0005 |
| 3 | DOM windows + in-Pixi tooltips/cursors (hybrid UI) | DECISIONS 0006 |
| 4 | Best-effort determinism: seeded RNG everywhere, no cross-machine bit-identity | DECISIONS 0007 |

---

## 1. Subsystem breakdown

Each subsystem has a **single responsibility**, a **boundary contract**, and an
explicit list of what it must **not** do. The "must not" list is as important
as the responsibility — it prevents the gradual erosion that turns a layered
codebase into a ball of mud.

### 1.1 Terrain / grid (`game/terrain`)

**Responsibility.** Owns the tile grid: surface type (grass, sand, rock,
water), four corner heights per tile (RCT-style), ownership (player land vs.
not-for-sale), and tile-level flags (has-path, has-ride-piece, etc.). Provides
read APIs for queries and write APIs for terraforming.

**Contract.** Tile data is stored in flat typed arrays indexed by
`tileIndex = row * mapWidth + col`. Mutations go through a single
`TerrainSystem` that emits change events for downstream subsystems
(rendering needs to invalidate sprite caches; pathfinding needs to dirty
graph regions).

**Must not.** Know anything about peeps, rides, money, or sprites.

### 1.2 Rendering (`rendering/`)

**Responsibility.** Project the world onto the screen. Owns the Pixi
`Application`, scene graph, isometric projection helpers, sprite atlas,
camera (pan/zoom/edge-scroll), layer ordering (terrain → paths → scenery
→ rides → peeps → effects → in-world UI overlays), depth sorting, and
viewport culling.

**Sub-modules:**

- `rendering/iso` — projection math (`worldToScreen`, `screenToWorld`,
  `tileToScreen`, `pickTile`).
- `rendering/camera` — pan, zoom levels (1×, 2×, 4× like RCT), edge scroll.
- `rendering/atlas` — texture packing, sprite lookup.
- `rendering/scene` — `ParkScene` = root container; per-layer subcontainers.
- `rendering/sync` — every render frame, mirrors current sim state into
  Pixi display objects (positions, sprite indices, visibility).
- `rendering/cull` — viewport culling + LOD selection per render frame.

**Contract.** Reads from the simulation; never writes back. Sprite batching
is achieved by giving every entity in the same layer the same base texture
(atlas), so Pixi v8's batched renderer can collapse them into one draw call.

**Must not.** Mutate component data. Hold game logic.

### 1.3 Path system & pathfinding graph (`game/paths`)

**Responsibility.** Path tiles are a special tile flag. The `PathGraph` is
a derived structure: nodes are path tiles + ride entrances/exits + peep
spawn points; edges connect 4-neighbor adjacent path tiles (with height-step
constraints). Owns:

- The graph itself (adjacency in flat arrays).
- Incremental graph maintenance — when a path is built/demolished, only
  the affected node and its neighbors are recomputed.
- **Distance maps** ("flow fields") for hot destinations — see §6.

**Contract.** Provides:

- `findPath(from, to): Path | null` — A* on the path graph, used for
  one-off queries (build mode preview, debugging, staff routing to an
  unusual destination).
- `getDistanceField(goalId): DistanceField` — precomputed BFS from a goal
  node to every reachable node. Peeps consult this O(1) per tick instead
  of running A* every time they want to head somewhere.

**Must not.** Know about peeps' needs, ride states, money. The graph is
purely topological + cost-weighted.

### 1.4 Peep AI (`game/peeps`)

**Responsibility.** Guests: their needs, thoughts, decisions, movement.
Implemented as ECS systems operating on peep entities.

**Components on a peep entity:**

- `Position` (world coords) + `Facing` (4 cardinal directions, rendered as
  8 sprite directions for animation).
- `Needs`: hunger, thirst, bladder, energy, happiness, nausea (0–255 like
  RCT2; cheap byte storage at 2000+ peeps).
- `Wallet`: cash on hand.
- `PeepState`: discriminated union — `Wandering | OnPath | InQueue | OnRide
  | LeavingPark | …`.
- `PathFollower`: current goal node, current distance map snapshot, next
  step, stuck-counter.
- `Thoughts`: ring buffer of recent thoughts (for UI) + a "current
  dominant thought" used by the rendering layer to draw a bubble.
- `Preferences`: ride intensity tolerance, nausea tolerance, favourite
  ride types — set at spawn.

**Systems (run in this order each tick):**

1. `NeedsSystem` — decay needs (hunger up, energy down) and clamp.
2. `ThoughtSystem` — emit thoughts when thresholds cross ("I'm hungry!",
   "I want to get off this ride!").
3. `DecisionSystem` — for peeps in `Wandering` or `OnPath`, sometimes pick
   a new goal (food stall, bathroom, ride, exit). Throttled (§6).
4. `PathFollowSystem` — advance peeps along their current path.
5. `QueueSystem` — manage queue lines per ride.
6. `RideRiderSystem` — peeps inside ride vehicles are pinned to vehicle
   transforms; this system updates their position from the ride's car
   transform each tick.

**Contract.** Reads `terrain`, `paths` (distance fields), `rides` (which
rides exist, queue lengths, prices, ride stats). Writes only to peep
components and to the `economy` (when peeps spend money).

**Must not.** Render anything, play sounds directly (emits events).

### 1.5 Ride framework (`game/rides`)

**Responsibility.** All rides — flat rides (carousel, drop tower) and
track-based rides (coasters). Provides:

- `Ride` base record — id, type, name, station(s), entrance/exit
  positions, queue, price, status (closed/testing/open/broken-down),
  stats (excitement/intensity/nausea), economic state (income today,
  total riders), reliability + breakdown timer.
- `TrackedRide extends Ride` — rides with a `TrackCurve`: coasters,
  monorail, log flume, etc.
- `Vehicle` — cars on a track. Has `distanceAlongTrack`, velocity,
  capacity, current riders (entity ids).
- `TrackCurve` interface — abstracts over tile-segment vs. spline:

  ```ts
  interface TrackCurve {
    readonly totalLength: number;       // metres
    sampleAt(d: number): TrackSample;   // pos, tangent, bank, gforces hint
    isStation(d: number): boolean;
  }
  ```

  v1 implementation: `TileSegmentCurve` — composes a sequence of fixed
  segment types (straight, curve-S, slope-up-25, loop-vertical, etc.)
  snapped to the tile grid, samples by walking segment length.
  v2 (later): `SplineCurve` — Catmull-Rom over control points.

- `RideSimSystem` — per-tick update for vehicles: physics on coasters
  (gravity, friction, lift hill speed), simple state machine on flat
  rides ("loading → running → unloading").
- `BreakdownSystem` — random breakdowns weighted by reliability;
  enqueues a "fix this" task for mechanics.

**Contract.** Reads `terrain` (for collision/footprint validation),
`peeps` (riders), `economy` (ticket revenue). Writes to ride state and
emits events (`ride.opened`, `ride.broken-down`, `vehicle.completed-circuit`).

**Must not.** Know about scenarios, marketing, staff — those subsystems
listen to ride events.

### 1.6 Staff AI (`game/staff`)

**Responsibility.** Handymen, mechanics, security guards, entertainers.
Each is also an ECS entity with `Position`, `Facing`, and a
`StaffJob` component instead of `Needs`. A simple task queue per staff
type:

- **Handyman**: sweep litter, mow grass, water flowers, empty bins.
  Polls a `LitterIndex` (sparse map of tiles with litter > 0).
- **Mechanic**: respond to broken rides (assigned via the ride event
  bus); inspect rides on a schedule.
- **Security**: respond to vandalism events and angry-peep events.
- **Entertainer**: walk a configured patrol route; boost happiness of
  nearby peeps.

**Contract.** Same coordinate system and pathfinding as peeps.
Subscribes to events from `rides`, `peeps`, `terrain`. Writes to staff
components and economy (paying wages).

**Must not.** Override player intent (assigned routes win).

### 1.7 Economy (`game/economy`)

**Responsibility.** Money, transactions, finance reports, research,
marketing campaigns, loans/interest, ride pricing strategy hints.

**Components / records:**

- `ParkFinance` — singleton-ish: cash, loan, interest rate, monthly
  income/expense buckets.
- `Transaction` — append-only log of every income/expense for the report
  screen.
- `ResearchState` — categories (rides, scenery, etc.), funding level per
  category, currently-being-researched item, % progress.
- `MarketingCampaign` — type (free entry weekend, food voucher, etc.),
  remaining ticks, effect modifiers applied to peep generation.

**Contract.** Listens to events from every subsystem that produces money
movement. Provides a single `recordTransaction()` call. Owns no entities
that move on the map.

**Must not.** Know about pathfinding, sprites, audio.

### 1.8 Scenario system (`game/scenarios`)

**Responsibility.** Loads a scenario definition (objective, time limit,
starting park layout, starting cash, available rides, weather, scenery
restrictions). Each tick, evaluates win/lose conditions. Emits
`scenario.won` / `scenario.lost` / `scenario.objective-progress` events.

**Scenario definition is pure data** under `data/scenarios/*.json`,
loaded at scenario start.

**Contract.** Reads from every subsystem (it has to — objectives can
reference anything: peep count, park rating, ride count, monthly profit,
specific guest with a name, etc.). Writes nothing — it only emits events
that the UI consumes.

### 1.9 Save / load (`engine/persistence`)

**Responsibility.** Serialize the entire `World` (component arrays +
terrain arrays + ride records + economy + scenario progress + RNG state +
elapsed ticks) to a versioned blob; deserialize back.

**Format.**

- v1: JSON, optionally LZ-string compressed for localStorage / file
  download. Easy to inspect, easy to migrate.
- Top-level envelope: `{ version: number, savedAt: string, world: {...} }`.
- Component arrays go in as plain arrays of numbers (typed-array → array
  on serialize, array → typed-array on deserialize).
- A **migration table**: `migrations[oldVersion -> newVersion]` is a
  function applied in sequence. Save loaders walk from save's version up
  to current.

**Determinism note.** The RNG state is part of the save. Loading a save
made on the same build is bit-identical from that point on (modulo the
deterministic-effort caveats — see DECISIONS 0007).

**Contract.** Provided as a single `saveWorld()` / `loadWorld()` API at
the engine layer. No subsystem reaches into another subsystem's storage
during save/load — each subsystem registers a `serialize()` /
`deserialize()` pair with the persistence registry.

### 1.10 UI / window system (`ui/`)

**Responsibility.** All player-facing chrome that isn't part of the
simulated world.

**Hybrid breakdown:**

- **DOM windows (`ui/windows`)** — ride window, finance window, peep
  window, scenario goal panel, staff panel, research panel, options.
  React-free vanilla TS + a tiny `Window` base class for drag/resize/z.
  CSS variables for theming. Subscribes to a Zustand store that mirrors
  the slice of sim state the windows need.
- **In-Pixi overlays (`ui/overlays`)** — peep thought bubbles, ride
  hover tooltips, build-mode cursor, tile highlights, ghost-piece
  preview. These follow world coordinates and need to share Pixi's
  layer ordering.

**Intent flow.** UI never mutates simulation state directly. Instead, it
dispatches intents to a queue (`intents.placePath(coord)`,
`intents.openRide(rideId)`, `intents.setRidePrice(rideId, cents)`). The
game layer drains the queue at the start of each sim tick. This keeps
UI/sim race-free and makes intents trivially recordable for the input log.

### 1.11 Audio (`engine/audio`)

**Responsibility.** Music tracks, ambient loops, in-world spatial sound
effects (coaster running, peep cheering, breakdown alarm).

**Implementation.** Web Audio API directly via a small wrapper. Sounds
register with a category (`music | ambient | sfx | ui`) for per-bus
volume. Spatial sounds take a world coordinate; the audio system pans
and attenuates based on the camera centre.

**Contract.** Subscribes to events from the game layer (`ride.opened`
plays a fanfare, `peep.threw-up` plays a cue, `vehicle.lift-hill-clack`
loops while a coaster climbs). Game code never calls `playSound()`
directly — it emits events; audio decides what to do.

### 1.12 Input handling (`engine/input`)

**Responsibility.** Raw browser input → high-level intents.

- Pointer events on the canvas → pick a tile via `screenToWorld` and
  ray-cast the height map.
- Keyboard → camera pan (arrows), zoom (+/-), pause (P), build-mode
  shortcuts.
- Pointer events on DOM windows → handled by the DOM directly.

The input layer is the only place that talks to `window.addEventListener`
and the canvas DOM element. It produces typed events (`PointerDown`,
`KeyDown`, `Wheel`) consumed by the active mode (game-mode vs.
build-mode-path vs. build-mode-ride). Modes turn events into intents.

---

## 2. Dependency graph

```
              ┌─────────────────────────────────────────┐
              │                  ui                      │  ← DOM windows + Pixi overlays
              └────────────┬────────────────────────────┘
                           │ subscribes to mirror, dispatches intents
              ┌────────────▼────────────────────────────┐
              │             rendering                    │  ← reads sim, never writes
              └────────────┬────────────────────────────┘
                           │ reads
        ┌──────────────────┴──────────────────────┐
        │                  game                    │
        │  ┌──────────┐  ┌─────────┐  ┌────────┐  │
        │  │ scenarios│  │ economy │  │ staff  │  │
        │  └────┬─────┘  └────┬────┘  └───┬────┘  │
        │       │             │           │        │
        │       └──────┬──────┴───────────┘        │
        │              ▼                            │
        │         ┌─────────┐  ┌──────┐  ┌──────┐  │
        │         │  peeps  │  │ rides│  │paths │  │
        │         └────┬────┘  └──┬───┘  └──┬───┘  │
        │              │          │         │      │
        │              └──────────┴─────────┘      │
        │                       │                  │
        │                       ▼                  │
        │                  ┌─────────┐             │
        │                  │ terrain │             │
        │                  └────┬────┘             │
        └───────────────────────┼──────────────────┘
                                ▼
              ┌─────────────────────────────────────────┐
              │              engine                      │
              │   ECS world, tick loop, scheduler,       │
              │   RNG, event bus, persistence, input,    │
              │   audio                                  │
              └────────────┬────────────────────────────┘
                           ▼
              ┌─────────────────────────────────────────┐
              │       data       │       utils          │
              │ static tables    │ pure helpers, math,  │
              │ ride catalogue   │ iso, asserts, RNG,   │
              │ scenarios        │ flat-array helpers   │
              └─────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────────────────────┐
              │              types                       │
              └─────────────────────────────────────────┘
```

### Recommended build order

This is the order to implement subsystems. Each step depends only on
earlier steps, so the codebase compiles and tests at every checkpoint.

| # | Subsystem | Why this slot |
|---|-----------|---------------|
| 0 | `utils`, `types`, `data` skeletons | Shared primitives, no game commitment yet |
| 1 | `engine/world` (ECS + entity ids + component registry) | Everything below uses it |
| 2 | `engine/scheduler` (fixed-tick game loop) | Needed to drive every system |
| 3 | `engine/rng` (seeded PRNG) | Needed before anything that calls random |
| 4 | `engine/events` (typed event bus) | Cross-subsystem communication |
| 5 | `engine/persistence` (save/load registry, no impls yet) | Establishes the contract; impls plug in as we go |
| 6 | `rendering/iso` (projection math, pure functions, fully tested) | Used by rendering, input, ui overlays |
| 7 | `rendering/scene` + `camera` + minimal layer setup | Visible feedback while building game systems |
| 8 | `game/terrain` | First real game subsystem; no upstream deps |
| 9 | `game/paths` (graph + A*) | Depends on terrain |
| 10 | `engine/input` + a basic build-mode for paths | Lets us hand-test pathfinding |
| 11 | `game/economy` (cash + transactions + finance) | Standalone; rides will hook into it |
| 12 | `game/rides` (ride record, flat rides first, then `TrackCurve` + tile-segment impl) | Depends on terrain, paths, economy |
| 13 | `game/peeps` (needs, decisions, path-follow, ride boarding) | The big one; depends on paths + rides + economy |
| 14 | `game/staff` (handymen first, then mechanics) | Mostly mirrors peep movement |
| 15 | `game/scenarios` (objective evaluator + scenario loader) | Reads everything below; emits events to ui |
| 16 | `ui/windows` (basic ride / finance / scenario windows) | Now there's something worth a HUD |
| 17 | `engine/audio` | Last; quality-of-life |

---

## 3. Core data model

These are the canonical TypeScript interfaces. Where we say "stored as flat
typed arrays", the type below is the **logical** view a system would
reconstruct via `world.get(entityId, Component)` — at runtime the data lives
in `Float32Array` / `Uint16Array` / etc. on the `World`.

### 3.1 Coordinates

```ts
/** Integer tile coordinates. (0,0) is north corner. */
export interface TileCoord {
  readonly col: number;  // 0..mapWidth-1
  readonly row: number;  // 0..mapHeight-1
}

/**
 * Continuous world coordinates.
 *   x, y are in tile units (so x=3.5 means halfway between col 3 and 4)
 *   z is height in "small steps" (RCT2 used 1 small step = 1/4 tile;
 *   we'll do the same for compatibility with classic terrain feel).
 */
export interface WorldCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Pixel coordinates on the canvas, post-camera. */
export interface ScreenCoord {
  readonly sx: number;
  readonly sy: number;
}

/** A direction a peep / staff can face. */
export type Direction4 = 0 | 1 | 2 | 3;  // N, E, S, W
```

### 3.2 Park

```ts
/**
 * The Park is a singleton-ish aggregate; it holds map dimensions,
 * top-level park metadata, and rolled-up ratings the UI displays.
 * Per-tile and per-entity data live elsewhere (Tile, Peep, Ride...).
 */
export interface Park {
  /** Stable id; mostly for save-file metadata. */
  readonly id: string;
  /** Player-facing name; shown in window titles. */
  name: string;

  /** Map dimensions in tiles. We standardise on 256x256 (see §6). */
  readonly mapWidth: number;
  readonly mapHeight: number;

  /** Current entry fee in cents. 0 means free entry. */
  entryFee: number;

  /**
   * Cached, recomputed each in-game month:
   *  - rating: 0..999, like RCT2
   *  - guestCount: number of peeps currently inside
   *  - guestsThisYear: rolling counter, used by some scenarios
   */
  rating: number;
  guestCount: number;
  guestsThisYear: number;

  /** In-game time. ticks since scenario start; 1 tick = 25ms (40Hz). */
  tick: number;
}
```

### 3.3 Tile

```ts
/**
 * A single map tile. Stored in flat typed arrays on Terrain;
 * this interface is the logical view.
 *
 * Tiles use four corner heights (RCT2-style) so we can render
 * sloped terrain without a separate mesh:
 *   heights = [N, E, S, W] corner, in small height steps.
 */
export interface Tile {
  readonly coord: TileCoord;
  /** [northCorner, eastCorner, southCorner, westCorner] — in small steps. */
  heights: [number, number, number, number];

  surface: SurfaceType;      // grass, sand, rock, water, ice...
  edge: EdgeStyle;           // wall texture between this tile and the lower neighbour

  /** Bitfield. PATH | RIDE_FOOTPRINT | SCENERY | OWNED | CONSTRUCTION_RIGHTS */
  flags: number;

  /** If PATH flag is set, which path style + connections. */
  pathRef?: PathTileRef;

  /** If RIDE_FOOTPRINT flag is set, which ride owns this tile. */
  rideId?: RideId;
}

export type SurfaceType = 'grass' | 'sand' | 'rock' | 'water' | 'ice' | 'dirt';
export type EdgeStyle = 'rock' | 'wood' | 'iron' | 'brick';
```

### 3.4 Path

```ts
/** Per-tile path data when Tile.flags & PATH. */
export interface PathTileRef {
  /** Path style id (concrete, tarmac, dirt, queue line...). */
  style: number;
  /** 4-bit mask of connections: bit 0 = N, bit 1 = E, bit 2 = S, bit 3 = W. */
  connections: number;
  /** Is this a queue line? */
  isQueue: boolean;
  /** If isQueue, the ride this queue feeds. */
  queueForRide?: RideId;
  /** Bench, lamp, bin attached to this path tile (each takes one slot). */
  furniture: PathFurniture | null;
}

export type PathFurniture = 'bench' | 'lamp' | 'bin' | 'sign';

/** A path computed by A* or pulled from a distance field. */
export interface Path {
  /** Sequence of tiles to walk through, start..goal. */
  readonly steps: readonly TileCoord[];
  /** Cost from the source — useful for "is this still the shortest route?" checks. */
  readonly cost: number;
  /** Tick at which the path was computed; lets us invalidate stale paths. */
  readonly computedAtTick: number;
}
```

### 3.5 Ride and RideTrack

```ts
export type RideId = number & { readonly __brand: 'RideId' };

export type RideStatus = 'closed' | 'testing' | 'open' | 'broken-down';

/** Common to every ride type. */
export interface Ride {
  readonly id: RideId;
  /** Catalog id — looks up static stats, capacity, sprites. */
  readonly typeId: string;
  name: string;
  status: RideStatus;

  /** Footprint tiles (for queries and demolition). */
  readonly footprint: readonly TileCoord[];
  /** Where peeps queue up. */
  entrance: TileCoord;
  /** Where peeps disembark. */
  exit: TileCoord;
  /** Queue tile sequence; head of the queue is index 0. */
  queue: TileCoord[];

  /** Cents per ride. 0 if entry-only park. */
  pricePerRide: number;

  /** Stats — derived, recomputed when track or layout changes. */
  excitement: number;   // 0..1000
  intensity: number;    // 0..1000
  nausea: number;       // 0..1000

  /** Reliability decays with use; mechanics inspections restore some. */
  reliability: number;          // 0..100
  ticksSinceInspection: number;

  /** Aggregates updated on each completed circuit. */
  totalRiders: number;
  incomeThisMonth: number;
}

/** Track-based rides extend Ride with a curve. */
export interface TrackedRide extends Ride {
  readonly track: TrackCurve;
  readonly vehicles: Vehicle[];
}

/** Abstracts over the v1 tile-segment impl and any future spline impl. */
export interface TrackCurve {
  readonly totalLength: number;          // total path length in metres
  sampleAt(distance: number): TrackSample;
  isStation(distance: number): boolean;
  /** Used by the editor to display segments; null for spline impls. */
  getSegments(): readonly TrackSegment[] | null;
}

export interface TrackSample {
  readonly pos: WorldCoord;
  /** Unit tangent vector (direction of travel). */
  readonly tangent: { x: number; y: number; z: number };
  /** Bank angle in radians. */
  readonly bank: number;
  /** Track piece id at this distance — drives sprite selection. */
  readonly pieceId: number;
}

/** v1: track is a sequence of these. Each maps to a fixed sprite + length. */
export interface TrackSegment {
  readonly type: TrackSegmentType;
  readonly origin: TileCoord;
  readonly rotation: 0 | 1 | 2 | 3;
}

export type TrackSegmentType =
  | 'straight'
  | 'curve-left-small'
  | 'curve-right-small'
  | 'curve-left-large'
  | 'curve-right-large'
  | 'slope-up-25'
  | 'slope-down-25'
  | 'slope-up-60'
  | 'slope-down-60'
  | 'lift-hill'
  | 'brake'
  | 'station'
  | 'loop-vertical'
  | 'corkscrew-left'
  | 'corkscrew-right';

export interface Vehicle {
  /** Distance along the track in metres. */
  distanceAlongTrack: number;
  /** Current speed, m/s. */
  speed: number;
  /** Capacity in passengers. */
  readonly capacity: number;
  /** Currently-seated peep entity ids; -1 means empty seat. */
  riders: Int32Array;
}
```

### 3.6 Peep

```ts
export type PeepId = number & { readonly __brand: 'PeepId' };

/**
 * A guest. Stored as components on an entity; this is the merged logical view.
 *
 * Needs are 0..255 unsigned bytes (RCT2 convention) — high values mean
 * the peep wants the corresponding thing more.
 */
export interface Peep {
  readonly id: PeepId;
  name: string;

  pos: WorldCoord;
  facing: Direction4;

  state: PeepState;

  /** All 0..255. Higher = more pressing. */
  hunger: number;
  thirst: number;
  bladder: number;
  nausea: number;
  /** Higher = less tired. */
  energy: number;
  /** 0..255 happiness. */
  happiness: number;

  /** Cents on hand. */
  cash: number;
  /** Cents already spent in the park (for "spent" stat). */
  spent: number;

  /** Preferences set at spawn; influence ride / food choices. */
  intensityPreference: { min: number; max: number };  // 0..1000
  nauseaTolerance: 'none' | 'low' | 'average' | 'high';

  /** What the peep is currently trying to do. */
  goal: PeepGoal | null;

  /** Recent thoughts, newest first. */
  thoughts: Thought[];
}

export type PeepState =
  | { kind: 'wandering' }
  | { kind: 'walking-to'; goalTile: TileCoord }
  | { kind: 'in-queue'; rideId: RideId; positionInQueue: number }
  | { kind: 'on-ride'; rideId: RideId; vehicleIndex: number; seat: number }
  | { kind: 'leaving-park' }
  | { kind: 'sick' }
  | { kind: 'watching'; rideId: RideId };

export type PeepGoal =
  | { kind: 'ride'; rideId: RideId }
  | { kind: 'food'; rideId: RideId }
  | { kind: 'drink'; rideId: RideId }
  | { kind: 'toilet'; rideId: RideId }
  | { kind: 'bench'; tile: TileCoord }
  | { kind: 'exit' };
```

### 3.7 Thought

```ts
/**
 * Peeps emit thoughts when needs cross thresholds, when they see a
 * cool ride, when they get sick on a ride, etc. The renderer picks
 * the most recent / highest-priority thought to show in a bubble.
 */
export interface Thought {
  readonly kind: ThoughtKind;
  /** Optional reference to a ride / tile / peep that the thought is about. */
  readonly subjectId?: number;
  /** Sim tick when emitted; thoughts age out. */
  readonly emittedAtTick: number;
  /** 0 = trivial, 100 = urgent (e.g. "I need the toilet!" at 240+ bladder). */
  readonly priority: number;
}

export type ThoughtKind =
  | 'hungry'
  | 'thirsty'
  | 'need-toilet'
  | 'tired'
  | 'wow-ride'
  | 'scary-ride'
  | 'too-intense'
  | 'litter-here'
  | 'cant-find-ride'
  | 'lost'
  | 'sick'
  | 'happy'
  | 'going-home';
```

### 3.8 Staff

```ts
export type StaffId = number & { readonly __brand: 'StaffId' };

export type StaffKind = 'handyman' | 'mechanic' | 'security' | 'entertainer';

export interface Staff {
  readonly id: StaffId;
  name: string;
  readonly kind: StaffKind;

  pos: WorldCoord;
  facing: Direction4;

  /** Hourly wage, cents per in-game hour. */
  wage: number;

  /** Patrol area: bitmap of allowed 4x4 patrol blocks. null = whole park. */
  patrolMask: Uint8Array | null;

  task: StaffTask;
}

export type StaffTask =
  | { kind: 'idle' }
  | { kind: 'walking-to'; goalTile: TileCoord }
  | { kind: 'sweeping'; tile: TileCoord }
  | { kind: 'mowing'; tile: TileCoord }
  | { kind: 'emptying-bin'; tile: TileCoord }
  | { kind: 'fixing-ride'; rideId: RideId }
  | { kind: 'inspecting-ride'; rideId: RideId }
  | { kind: 'patrolling' };
```

### 3.9 Transaction

```ts
/**
 * Append-only economy log. Every cent that moves in or out of the park is
 * a Transaction. The finance window groups them by category and month.
 */
export interface Transaction {
  /** Sim tick when recorded — drives the month grouping. */
  readonly tick: number;
  /** Amount in cents. Income positive, expense negative. */
  readonly amount: number;
  readonly category: TransactionCategory;
  /** Optional human-readable detail ("Wooden Coaster 1 ticket"). */
  readonly note?: string;
  /** Optional reference (rideId for ride income, staffId for wages). */
  readonly refId?: number;
}

export type TransactionCategory =
  | 'ride-income'
  | 'shop-income'
  | 'park-entry'
  | 'ride-construction'
  | 'ride-running'
  | 'staff-wages'
  | 'marketing'
  | 'research'
  | 'land-purchase'
  | 'loan-interest'
  | 'loan-principal';
```

### 3.10 Scenario

```ts
/**
 * A scenario is loaded from JSON and frozen at scenario start.
 * Progress lives in a separate ScenarioState updated each tick.
 */
export interface Scenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly difficulty: 'easy' | 'medium' | 'hard';

  /** Initial park layout file (relative to data/scenarios). */
  readonly mapFile: string;

  readonly startingCash: number;
  readonly startingLoan: number;
  readonly maxLoan: number;
  readonly interestRate: number;       // basis points

  readonly objective: ScenarioObjective;
  /** Optional time limit in in-game years. null = no limit. */
  readonly timeLimitYears: number | null;

  /** Ride type ids the player may build. null = all available. */
  readonly availableRideTypes: readonly string[] | null;
}

export type ScenarioObjective =
  | { kind: 'guests-by-date'; targetGuests: number }
  | { kind: 'park-value'; targetValue: number }
  | { kind: 'park-rating-for'; minRating: number; durationYears: number }
  | { kind: 'monthly-income'; targetMonthlyIncome: number; durationMonths: number }
  | { kind: 'build-rides-of-types'; ridesRequired: readonly string[] };

/** Mutable progress, separate so the scenario object stays immutable. */
export interface ScenarioState {
  readonly scenario: Scenario;
  startedAtTick: number;
  status: 'in-progress' | 'won' | 'lost';
  /** Free-form per-objective progress payload. */
  progress: Record<string, number>;
}
```

---

## 4. Tick model

### 4.1 Fixed-timestep simulation, decoupled from rendering

We adopt the classic Glenn-Fiedler "Fix Your Timestep" loop, with a sim
rate of **40 Hz** (25 ms per tick) — the same as the original RCT and a
sweet spot between simulation responsiveness and CPU cost.

```
const SIM_HZ = 40;
const SIM_DT = 1 / SIM_HZ;                // seconds
const MAX_FRAME_DT = 0.25;                // s — cap to avoid spiral of death

let lastFrame = performance.now() / 1000;
let accumulator = 0;

function frame(nowMs: number) {
  const now = nowMs / 1000;
  const frameDt = Math.min(now - lastFrame, MAX_FRAME_DT);
  lastFrame = now;

  accumulator += frameDt;
  while (accumulator >= SIM_DT) {
    world.tick();          // single sim step at 40 Hz
    accumulator -= SIM_DT;
  }

  const alpha = accumulator / SIM_DT;     // 0..1, blend factor
  renderer.render(world, alpha);          // smooth interpolation
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

The renderer interpolates between the **previous** and **current** sim
state (positions of peeps and ride vehicles) using `alpha`. This
de-couples visual smoothness from sim rate: a 144 Hz monitor still gets
silky scrolling and animation while the sim only runs 40 times a second.

For game-speed control (RCT's 1×, 2×, 4× speeds), we adjust the simulation
schedule, not `SIM_DT`. At 4× speed we run up to 4 sim ticks per render
frame; at "paused" we skip the inner loop entirely.

### 4.2 What happens in one tick

Systems run in the order below, each touching only its own components or
narrow read slices of others. Order matters because some systems consume
the output of earlier ones in the same tick.

```
World.tick():
  1. drainIntents()              -- player intents queued by UI/input
  2. terrainSystem.tick()        -- pending terraforming, growth (grass)
  3. economySystem.tick()        -- monthly rollover, loan interest
  4. researchSystem.tick()       -- progress current research item
  5. rideSimSystem.tick()        -- vehicles, station logic, breakdowns
  6. needsSystem.tick()          -- all peeps decay needs (cheap)
  7. thoughtSystem.tick()        -- emit thoughts on threshold crosses
  8. peepDecisionSystem.tick()   -- THROTTLED: 1/8 peeps per tick
  9. pathFollowSystem.tick()     -- all peeps step along their paths
 10. queueSystem.tick()          -- advance queues, board cars
 11. staffSystem.tick()          -- staff tasks
 12. scenarioSystem.tick()       -- evaluate objectives every N ticks
 13. eventBus.flush()            -- deliver queued events to subscribers
 14. snapshotPrev()              -- copy current positions to prev for interp
```

Several systems are **throttled** rather than running for every entity
every tick. See §6 for the per-system budgets.

### 4.3 How peeps advance per tick

A "walking" peep's pos is interpolated along its current path step. At
40 Hz with a peep walking speed of ~1 tile per second, each tick advances
the peep by `1/40` of a tile. The `PathFollowSystem` is the cheap update —
it runs for every peep every tick:

```
for each peep with PathFollower:
  if reachedNextWaypoint(peep):
    peep.pos = peep.path.steps[peep.stepIndex]
    peep.stepIndex++
    if peep.stepIndex == peep.path.steps.length:
      peep.state = { kind: 'wandering' }
      continue
  step toward peep.path.steps[peep.stepIndex]
```

The expensive update is `PeepDecisionSystem` (replan goals, choose new
ride, look at distance fields). It runs for **only 1/8 of peeps per
tick**, round-robin by `peepId & 7 == tick & 7`. At 40 Hz each peep gets
re-evaluated five times per second, which is plenty.

### 4.4 How rides advance per tick

```
for each TrackedRide:
  for each vehicle:
    apply gravity / friction / brake / lift forces
    vehicle.distanceAlongTrack += vehicle.speed * SIM_DT
    if completed circuit: emit('vehicle.completed-circuit')
    sample = ride.track.sampleAt(vehicle.distanceAlongTrack)
    update vehicle pos / tangent / bank from sample
    for each rider seat:
      peep.pos = applySeatOffset(sample, seat)
```

Flat rides have a simple state machine with timed phases instead.

---

## 5. Coordinate systems

We use a **2:1 dimetric projection** (commonly called "isometric" in
games), the classic RCT/SimCity look. A unit tile is `64 × 32` pixels at
1× zoom.

### 5.1 Spaces

| Space | Units | Origin | Used by |
|-------|-------|--------|---------|
| Tile  | integer (col, row) | NW corner | terrain, paths, build mode |
| World | floats (x, y, z) — x/y in tile units, z in small height steps | NW corner of tile (0,0) | sim, peep position, ride track |
| Screen | floats (sx, sy) px | top-left of canvas | rendering, input |

z is in "small steps". One small step = `8 px` of vertical screen offset
at 1× zoom (matches RCT2). Land slopes in 1-step increments at corners.

### 5.2 Constants

```ts
export const TILE_W = 64;     // px, full diamond width at 1× zoom
export const TILE_H = 32;     // px, full diamond height at 1× zoom
export const Z_STEP_PX = 8;   // px per small height step at 1× zoom
```

### 5.3 World → screen

For a point at world `(x, y, z)` and camera at world `(cx, cy)` with
zoom `s`:

```ts
function worldToScreen(p: WorldCoord, cam: Camera, viewport: Viewport): ScreenCoord {
  const isoX = (p.x - p.y) * (TILE_W / 2);
  const isoY = (p.x + p.y) * (TILE_H / 2) - p.z * Z_STEP_PX;

  const camIsoX = (cam.x - cam.y) * (TILE_W / 2);
  const camIsoY = (cam.x + cam.y) * (TILE_H / 2);

  return {
    sx: (isoX - camIsoX) * cam.zoom + viewport.width / 2,
    sy: (isoY - camIsoY) * cam.zoom + viewport.height / 2,
  };
}
```

### 5.4 Screen → world (z = 0 only)

For tile picking on flat ground:

```ts
function screenToWorldFlat(s: ScreenCoord, cam: Camera, viewport: Viewport): WorldCoord {
  const sx = (s.sx - viewport.width  / 2) / cam.zoom + (cam.x - cam.y) * (TILE_W / 2);
  const sy = (s.sy - viewport.height / 2) / cam.zoom + (cam.x + cam.y) * (TILE_H / 2);

  const x = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const y = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return { x, y, z: 0 };
}
```

### 5.5 Screen → world with terrain (tile picking)

True picking has to account for height-mapped terrain. Standard trick:

1. Walk a ray from the screen point along a fixed isometric direction
   (decreasing z), starting at the highest tile that could possibly
   project to that pixel.
2. At each step, test whether the screen point falls inside the
   projected diamond of that tile *at its current corner heights*.
3. First hit wins. Bounded constant-time because there are only
   `maxHeight + viewportHeight / Z_STEP_PX` candidate tiles in a column.

### 5.6 Tile → world helpers

```ts
function tileCenterToWorld(t: TileCoord, terrain: Terrain): WorldCoord {
  const z = avgCornerHeight(terrain, t);
  return { x: t.col + 0.5, y: t.row + 0.5, z };
}
```

### 5.7 Depth sorting

Pixi v8's `Container` doesn't z-sort by default. For each visible tile we
compute a sort key:

```ts
sortKey = (col + row) * BIG + (heightLayer << 4) + entityClass;
```

Render layers are split into containers, and within the per-tile layer
(scenery, rides, peeps), we set `zIndex = sortKey` and rely on
`sortableChildren = true` on that container. Sprite atlas membership is
preserved within each layer, so the batched renderer still collapses
draws.

---

## 6. Performance budget

**Target.** 60 fps with 2000+ peeps on a 256×256 map, on a mid-range
laptop integrated GPU. Sim must hit 40 Hz comfortably, leaving headroom
for 2–4× speed.

**Frame budget at 60 fps:** 16.6 ms total.
- Sim tick(s): ~5 ms (room for up to 2 ticks per render frame at 1× speed,
  4 ticks at 4× speed if we keep ticks under 4 ms each)
- Render: ~6 ms
- Slack: ~5 ms

### 6.1 Strategies

#### Spatial indexing
- **Per-chunk peep buckets.** Map is partitioned into 16×16-tile chunks.
  Each chunk holds a list of peep ids currently inside. When a peep
  crosses a chunk boundary we update buckets in O(1). Range queries
  ("which peeps are visible / near this ride / near this litter") become
  O(visible chunks).
- **Path graph adjacency** in flat `Int32Array` rather than per-node
  object arrays. A* and BFS get cache-friendly traversal.
- **Litter / vandalism / breakdown indices** as sparse maps, so handymen
  / mechanics don't have to scan the whole map.

#### Distance fields instead of per-peep A*
- Per "popular destination" (every ride entrance, every food shop, the
  park exit), precompute a BFS distance map from that node to every
  reachable path tile. Stored as a `Uint16Array` of length =
  pathTileCount, costing ~512 KB per goal at 256² (worst case; usually
  far fewer path tiles).
- A peep heading "to ride X" reads `distanceField[X][myTile]` and
  steps toward whichever neighbour has the smaller distance. This is
  O(1) per peep per step instead of O(graph) for A*.
- Distance fields are recomputed lazily when the path graph in their
  watershed changes; otherwise reused.
- A* is reserved for: editor previews, debug, staff routing to
  one-off destinations, peeps in unusual states (lost peeps).

#### Peep update throttling
- `NeedsSystem` and `PathFollowSystem` run for **all** peeps every tick
  — cheap loops, ≤ 1 µs per peep amortised → ~2 ms for 2000 peeps.
- `PeepDecisionSystem` runs for **1/8 of peeps per tick**, scheduled by
  `peepId & 7 == tick & 7`. Each peep replans 5×/sec, indistinguishable
  from per-tick at human time scales.
- `ThoughtSystem` is event-driven (need crosses threshold) rather than
  polling, so it costs nothing in the steady state.

#### Sprite batching
- One texture atlas per category (`terrain.atlas`, `peeps.atlas`,
  `rides-coaster.atlas`, etc.). All entities in a category sharing one
  atlas → Pixi v8 collapses them into a single batched draw call.
- Avoid `Filter`s (blur, glow) on per-entity sprites — they break
  batching. Reserve filters for fullscreen post effects.
- Peep sprites: pre-render 8 directions × N animation frames into one
  atlas at sprite-bake time, not at runtime.

#### Viewport culling
- Each render frame, compute the visible tile rectangle in tile space
  from the camera.
- Skip drawing tiles, scenery, and peeps outside that rect (with a
  small margin). At 1× zoom on a 1080p display we render ~1500 tiles;
  on a 256² map that's 2.3% of the map.
- Peep visibility piggybacks on the chunk index: only chunks
  intersecting the viewport contribute peeps to the render list.

#### Dirty-rectangle terrain
- Terrain doesn't usually change between frames. We render the visible
  terrain tiles into a `RenderTexture` and only re-render the affected
  chunk's texture when a terrain change happens. Saves ~3 ms/frame.

#### Render-time interpolation
- The renderer reads `prev` and `curr` peep / vehicle positions and
  lerps by `alpha`. Costs an extra 8 bytes per moving entity; eliminates
  the visual stair-step that would otherwise be visible at sim 40 Hz vs
  display 60–144 Hz.

### 6.2 Per-system budget at 1× speed (target)

| System | Frequency | Per-call budget | Notes |
|--------|-----------|-----------------|-------|
| `NeedsSystem` | every tick, all peeps | 0.5 ms | tight typed-array loop |
| `PathFollowSystem` | every tick, all peeps | 1.0 ms | distance-field lookup + step |
| `PeepDecisionSystem` | every tick, 1/8 peeps | 1.0 ms | ~250 peeps × 4 µs |
| `ThoughtSystem` | event-driven | < 0.1 ms | only firing peeps pay |
| `RideSimSystem` | every tick, all rides | 0.5 ms | < 100 rides typically |
| `StaffSystem` | every tick, all staff | 0.2 ms | < 50 staff typically |
| `QueueSystem` | every tick | 0.2 ms | only queues with movement |
| `ScenarioSystem` | every 40 ticks (1s) | 0.5 ms | objective re-eval |
| `economy/research/terrain` | mixed | 0.1 ms | mostly idle |
| **Sim total** | | **~3.6 ms / tick** | leaves 13 ms for render at 60 fps |

### 6.3 Memory budget

| Concern | Estimate |
|---------|----------|
| Tile data, 256² × ~16 B | ~1 MB |
| Peep components, 2000 × ~128 B | ~256 KB |
| Path graph (worst case all paths) | ~8 MB |
| Distance fields, 50 popular goals × 128 KB | ~6 MB |
| Sprite atlases (decompressed in VRAM) | ~64 MB |
| Save-game (uncompressed JSON) | ~5 MB |

Comfortable on any laptop from the last 10 years.

### 6.4 What we explicitly defer

- Multi-threaded sim (Web Worker) — possible if needed but adds copy
  costs through SAB; revisit if the single-thread budget is exceeded.
- WebGPU backend — Pixi v8 supports it; we'll opt in when stable in
  major browsers, no source changes needed.
- Predictive pathfinding (peeps anticipating crowded paths) — fun but
  not in v1.

---

## Appendix A: glossary

- **Peep** — a guest in the park. Term inherited from RCT.
- **Tick** — one fixed-timestep simulation update. 1 tick = 25 ms.
- **Small step** — height unit; 1 small step = ¼ of a tile's vertical extent.
- **Distance field** — precomputed BFS distance from a goal tile to every
  reachable tile on the path graph.
- **Footprint** — set of tiles a ride or scenery item occupies.
- **Patrol mask** — per-staff bitmap restricting where a staff member
  will go.
