# Architectural Decisions

This file is a running log of architectural choices for SimTycoon. Append a
new entry whenever a significant decision is made or revised. Keep entries
short: context, decision, consequences.

Format:

```
## NNNN — Title (YYYY-MM-DD)
**Status:** Accepted | Superseded by NNNN | Deprecated
**Context:** Why this came up.
**Decision:** What we chose.
**Consequences:** What this implies, and what's now harder.
```

---

## 0001 — Initial tech stack (2026-05-11)

**Status:** Accepted

**Context:** We are starting a Rollercoaster-Tycoon-style isometric tycoon
game from scratch in the browser. We need a renderer that can push thousands
of sprites at 60 fps, a typed language, a fast dev loop, and a low-friction
test runner.

**Decision:**

- **TypeScript (strict).** All strict flags on, including
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and
  `noImplicitOverride`. The simulation will be data-heavy; we want the
  compiler catching shape errors early.
- **Vite** as bundler and dev server. ESM-native, fast HMR, first-class
  TypeScript support, minimal config.
- **PixiJS v8** for 2D rendering. WebGL/WebGPU backend, batched sprite
  rendering, mature scene graph. Better fit than raw canvas or Three.js for
  high-sprite-count 2D.
- **Zustand** for state. Small API, no Provider boilerplate, works fine
  outside a React tree (we are not using React for the canvas), supports
  selectors and subscriptions which we will need for HUD updates.
- **Vitest** for testing. Shares Vite's transform pipeline, fast, Jest-compatible API.
- **ESLint + Prettier** with TypeScript-aware rules.

**Consequences:**

- Web-first; native targets are out of scope unless we wrap in Tauri/Electron later.
- Pixi's scene graph is mutable and imperative; our `rendering` layer will need
  to bridge between immutable-feeling Zustand state and Pixi's display objects.
- Zustand is rendering-agnostic, but we will need a convention for when game
  state lives in Zustand vs. transient simulation state inside the engine.
  Likely: authoritative simulation state lives in plain TS structures owned by
  the engine; Zustand mirrors the slice the UI cares about. To be revisited.

---

## 0002 — Folder structure: layered, not feature-sliced (2026-05-11)

**Status:** Accepted

**Context:** We need a layout that keeps the simulation testable headlessly
and prevents rendering code from leaking into game logic.

**Decision:** Split `src/` into layered folders: `engine`, `game`,
`rendering`, `ui`, `data`, `utils`, `types`. Dependencies flow one direction:
`ui` → `rendering` → `game` → `engine` → `utils`. `data` and `types` are
leaves that anyone may import.

**Consequences:**

- Easy to unit-test `game` and `engine` without a DOM.
- Cross-cutting features (e.g. "rides") will be split across folders rather
  than co-located. We accept this trade-off; if it becomes painful we can
  revisit with a feature-sliced layout.
- ESLint boundary rules are not yet enforced; we rely on convention plus
  code review for now.

---

## 0003 — UI rendering technology: deferred (2026-05-11)

**Status:** Superseded by 0006

**Context:** HUD and menus can be drawn either inside Pixi (single canvas,
one input pipeline) or as DOM overlays (accessibility, native form
controls, easier styling).

**Decision:** Deferred at scaffolding time; resolved in 0006.

---

## 0004 — Entity model: lightweight ECS (2026-05-11)

**Status:** Accepted

**Context:** We need a structure for ~2000 peeps + rides + staff + tiles
that's flexible enough to compose behaviour and fast enough to iterate
in tight loops. Three options: classical OOP (one class per entity),
data-oriented SoA (parallel typed arrays, RCT2-style), and component-based
ECS (entities as ids, components in flat stores, systems iterate).

**Decision:** Lightweight ECS. Entities are opaque numeric ids;
components are stored in per-component flat structures (typed arrays
where the field is numeric, regular arrays where it's a struct/string);
systems are plain functions that iterate matching entities and run a
single concern.

**Consequences:**
- Most peep components (position, needs, facing) end up as typed arrays
  anyway, so we capture most of the data-oriented win.
- Composition over inheritance: a "queueing peep" is `Position +
  PathFollower + Needs + InQueue`, not a subclass.
- Some indirection cost vs. raw SoA, accepted for the readability win.
- We hand-roll a tiny ECS rather than pulling in `bitecs`; the surface we
  need is small and we want full control over save/load shape.

---

## 0005 — Track representation: hybrid, segments now / spline-ready (2026-05-11)

**Status:** Accepted

**Context:** Coaster tracks can be modelled as fixed tile-snapped
segments (RCT1/2-style: easy, limited expressiveness) or continuous
splines (Planet Coaster-style: expressive, complex). Switching later
would be painful if early systems hard-code the segment representation.

**Decision:** Sim talks to tracks through a `TrackCurve` interface that
exposes `totalLength`, `sampleAt(distance)`, and `isStation(distance)`.
v1 implementation `TileSegmentCurve` composes a sequence of fixed segment
types snapped to the grid. A future `SplineCurve` can replace it without
touching the ride simulation system.

**Consequences:**
- Slightly more design work upfront — vehicles must reference tracks via
  the interface, not the segment list directly.
- Editor and serialization in v1 stay simple (just save the segment
  array).
- `getSegments()` on the interface is `T[] | null` so segment-aware UI
  (the track editor) can ask for them when present and fall back to
  generic curve-based controls when not.

---

## 0006 — UI rendering: hybrid (DOM windows, in-Pixi overlays) (2026-05-11)

**Status:** Accepted (supersedes 0003)

**Context:** See 0003. We considered three options: pure DOM, pure
in-Pixi widgets, or hybrid.

**Decision:** Hybrid.
- **DOM** for windows, menus, dialogs, finance reports, scenario panel
  — anywhere styling, accessibility, and native form controls matter.
- **Pixi** for in-world overlays — peep thought bubbles, hover
  tooltips, build-mode cursor, ghost-piece preview, tile highlights.

**Consequences:**
- Two input pipelines must coordinate: pointer events on the canvas vs.
  on DOM windows. The input layer (`engine/input`) is the single point
  that disambiguates.
- We avoid building a from-scratch Pixi widget toolkit (buttons,
  scrollbars, text inputs).
- A small Zustand store mirrors the slice of sim state DOM windows need;
  windows subscribe to selectors. UI never mutates sim state directly —
  it dispatches intents into a queue drained at the start of each tick.

---

## 0007 — Determinism: best-effort (2026-05-11)

**Status:** Accepted

**Context:** Three positions: full deterministic sim (lockstep
multiplayer, replays, harder discipline — no `Math.random`, careful
floats), no determinism guarantees (free use of `Math.random`,
wall-clock), or best-effort (seeded RNG everywhere, but no commitment to
bit-identical cross-machine outputs).

**Decision:** Best-effort.
- All randomness flows from a seeded PRNG owned by the `World`. No
  `Math.random` calls in `game/*` or `engine/*`.
- The RNG state is part of the save file, so reload-from-save continues
  identically to the in-memory continuation on the same build.
- We use `performance.now()` only at the input/render boundary, never in
  sim code.
- We do **not** commit to identical sim output across machines or browser
  versions — float ordering and `Math.fround` discipline are out of
  scope for v1.

**Consequences:**
- Very useful for bug repros: a save + the next N intents reliably
  reproduces the failure on the same machine.
- Replays are feasible (seed + intent log + tick count) on the same
  build, with the cross-machine caveat above.
- Lockstep multiplayer is deferred. If we ever want it, the discipline
  to upgrade is: audit floats, switch hot loops to deterministic
  helpers, and pin the JS engine version.
