---
name: threejs-debug-profiler
description: "3D GAMES ONLY (three.js / WebGL). Debug and profile Three.js browser games: blank canvases, render and runtime bugs, asset and audio loading, animation, resize, mobile input, plus performance profiling of draw calls, triangles, textures, memory, shader and post-processing cost, and bundle size. Do not use for 2D games or non-game work."
---

> **House rules for this repo (RoxorLoops1337/Games). They override anything below.**
> - Scope: use this skill only for 3D / three.js game work. For 2D games, non-game tasks or anything else, ignore it.
> - The game's own code and its `CLAUDE.md` come first. Existing games (e.g. Beatbox Heroes `park3d/`) are vanilla JS on a shared host with their own build, tests and budgets: follow that architecture. Do not scaffold a Vite/TypeScript project or restructure a game unless the owner asks for a brand new game.
> - Paid generation (Tripo 3D, Google Gemini images, ElevenLabs audio) costs the owner money: only when the owner explicitly asks for it in the current conversation, and say the expected credits first. Never generate paid assets "by default".
> - Do not run `probe_asset_credentials.sh` (it sources shell profiles). To check a key, use `[ -n "$TRIPO_API_KEY" ] && echo SET || echo MISSING` (same for `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`). Never print key values or account details.
> - Keep the repo workflow: `npm run check:changed` before every push, PR as draft, then ready and squash merge. Ignore any advice here to skip stopping points or approvals that conflict with the owner's instructions.
> - No em dashes in replies or documents written for the owner.


# Three.js Debug Profiler

Find root causes and optimize measured bottlenecks without breaking playability.

Follow the changed behavior's scope. Reuse the lead's existing reproduction and evidence; verify the affected path after a fix. A passing focused check only needs broader testing when shared behavior changed or an unresolved risk warrants it. Return measurements and defects to the lead for the consolidated verification pass.

## Reference

`references/debug-playbook.md` — ordered triage for blank canvas, asset and audio loading, loop/animation/physics, input and mobile, the profiling sequence, and the `__THREE_GAME_DIAGNOSTICS__` shape. Read it when debugging or profiling anything non-obvious.

## Debug

Reproduce first, with the same command and URL the user had, and read the console, page, and network errors. Find the module that owns the failure (renderer, loop, camera, scene, assets, audio, input, physics, UI, or base path), fix the root cause there, and retest the exact broken path. The playbook's triage order covers the common causes, such as more than one active loop, a canvas whose display size doesn't match its drawing buffer, and wrong delta units.

## Profile

Profile the production preview when user-facing performance matters. Baseline one fixed scenario, classify the bottleneck (CPU, GPU draw, fragment, vertex, memory, or network), change one thing, and re-measure the same scenario, confirming visuals and playability held. The playbook lists the metrics to baseline and the optimizations in order of payoff.

## Report

Lead with the root cause or the measured bottleneck. Then files changed, baseline and post metrics, commands, screenshots, the broken path retested, and residual risks.
