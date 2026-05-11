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

**Status:** Open

**Context:** HUD and menus can be drawn either inside Pixi (single canvas,
one input pipeline) or as DOM overlays (accessibility, native form
controls, easier styling).

**Decision:** Deferred. The initial scaffolding uses neither — only the Pixi
canvas with "Hello Park". When we add the first HUD element we will revisit
and record the choice here.

**Consequences:** None yet.
