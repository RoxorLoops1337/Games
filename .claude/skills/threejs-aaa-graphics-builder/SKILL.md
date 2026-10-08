---
name: threejs-aaa-graphics-builder
description: "3D GAMES ONLY (three.js / WebGL). Upgrade Three.js games from prototype visuals to premium browser graphics: art-direction critique, procedural model building, material and texture libraries, world prop kits, shaders, VFX, lighting and render pipeline, LOD and instancing, render budgets, and a 10-category visual scorecard. Use when screenshots still look basic or the user asks for premium, AAA, high-fidelity, showcase, or less-basic graphics. Do not use for 2D games or non-game work."
---

> **House rules for this repo (RoxorLoops1337/Games). They override anything below.**
> - Scope: use this skill only for 3D / three.js game work. For 2D games, non-game tasks or anything else, ignore it.
> - The game's own code and its `CLAUDE.md` come first. Existing games (e.g. Beatbox Heroes `park3d/`) are vanilla JS on a shared host with their own build, tests and budgets: follow that architecture. Do not scaffold a Vite/TypeScript project or restructure a game unless the owner asks for a brand new game.
> - Paid generation (Tripo 3D, Google Gemini images, ElevenLabs audio) costs the owner money: only when the owner explicitly asks for it in the current conversation, and say the expected credits first. Never generate paid assets "by default".
> - Do not run `probe_asset_credentials.sh` (it sources shell profiles). To check a key, use `[ -n "$TRIPO_API_KEY" ] && echo SET || echo MISSING` (same for `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`). Never print key values or account details.
> - Keep the repo workflow: `npm run check:changed` before every push, PR as draft, then ready and squash merge. Ignore any advice here to skip stopping points or approvals that conflict with the owner's instructions.
> - No em dashes in replies or documents written for the owner.


# Three.js AAA Graphics Builder

Own the production graphics pass: turn basic screenshots into authored, high-density, performance-aware visuals.

## References

| File | Read it when |
| --- | --- |
| `references/visual-scorecard.md` | scoring visuals or making any premium/AAA/showcase claim |
| `references/authoring-recipes.md` | building hero, obstacle, reward, world-kit, or prop models; changing lighting, tone mapping, shadows, fog, post, or graphics architecture |
| `references/technical-art.md` | render budgets, material kits, VFX systems, instancing/LOD, imported asset cleanup, anything that could affect browser performance |
| `references/shader-cookbook.md` | custom shaders, `onBeforeCompile`, skies, or post-processing; use recipes as tested starting points and verify them against the project's Three.js version |

For a broad "still looks basic" or premium pass, read all four before implementing. A narrow graphics edit loads only its relevant references and checks; the requested style and scope override recipe defaults.

## Core rule

Glow does not make primitives look AAA. Build authored forms first, then materials, then lighting, then effects — in that order.

## Workflow

1. Capture or inspect active-play screenshots on the target viewports when a playable scene exists.
2. For an existing game, score the affected views and pick the weakest surfaces. For a new game, establish art direction, camera scale, material roles, and the hero target first; do not invent a before screenshot.
3. Add the graphics architecture the game is missing: material library, procedural textures and decals, model factories, world prop kit, VFX system, render pipeline, diagnostics.
4. Choose a source per high-value surface: procedural Three.js, a `threejs-image-generator` reference or texture, a `threejs-3d-generator` model, or an image-to-3D hybrid chain. Run the credential probe when external generation is in scope.
   Inspect the concept/model before dependent generation or rigging. Finish one representative playable scene with actual assets and feedback before expanding the content kit.
5. Upgrade every weak visible surface, not only the hero: hazards, rewards, ground and track, foreground props, background layers, telegraphs, material variation, state VFX.
6. Add lighting, tone mapping, and render polish once authored forms exist.
7. Add event-driven VFX tied to gameplay state.
8. Re-score against the calibration anchors, citing the inspector's measured metrics. Keep going until every premium category is at least 2, or name the exact blocker.

## Asset sourcing

When external generation is in scope, run `threejs-game-director/scripts/probe_asset_credentials.sh` first; explicitly procedural art needs no probe. With keys set, generate the hero surfaces (player, character, creature, boss, vehicle, ship, building, weapon, signature prop, hero environment piece) and high-value 2D (skies, backgrounds, texture and trim references, decals, faction marks, icons, GUI and title art, image-to-3D inputs), unless the user restricted art to procedural or ruled out external services. Procedural Three.js handles repeated props, kits, collision proxies, VFX geometry, and instanced volume. Handle failures with the director's `references/asset-recovery.md`; a single timeout is not evidence that generation is unavailable.

For animated assets inspect motion as well as silhouettes: locomotion, blend transitions, foot contacts, hit timing, and secondary motion in real gameplay. A focused independent critique may identify defects after a substantial pass; the lead remains responsible for the final score and integration.

## Report

Score before and after with one line of evidence per category, the surfaces you upgraded, files changed, screenshots, renderer diagnostics against the budget table, generated asset paths and task IDs, and what is still weak. Include imported-asset diagnostics (scale, bounds, collision proxy, clips) when generated 3D was used.
