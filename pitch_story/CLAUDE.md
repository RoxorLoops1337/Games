# Pitch Story: Draft Day

Kairosoft-style football club manager with a roguelike card draft. Concept: `design/gdd/game-concept.md`.
This folder is the Godot project (code root). Do not rename it: it will be a live URL.

## Technology Stack

- **Engine**: Godot 4.7.1
- **Language**: GDScript
- **Build System**: SCons (engine), Godot Export Templates
- **Asset Pipeline**: Godot Import System + custom resource pipeline

## Engine Version Reference

<!-- ENGINE-REFERENCE-IMPORT: the line below points at the configured engine -->
@../docs/engine-reference/godot/VERSION.md

## Rules from the technical review (see concept, Risks)

- The match simulation is a pure function of (seed, squads, tactics, cards) and emits an event log. Rendering never writes back to match state.
- One seeded PRNG passed explicitly, never the global random functions. Integer or fixed-point stat maths.
- Saves carry `schema_version` from the first commit, with tested migrations. Never rename a storage key once live.
- Keep simulation, balance harness and save migrations in plain scripts runnable with `godot --headless`.
