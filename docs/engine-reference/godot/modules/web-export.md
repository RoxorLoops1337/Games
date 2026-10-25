# Module: Web Export (HTML5 / WebAssembly)

Last verified: 2026-10-25

Primary source (all sections unless noted): `tutorials/export/exporting_for_web.rst` on `godot-docs` branch `4.7`; rendered https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html
Patch/feature bullets: https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md

## Hard facts for this project

| Topic | Fact (as stated) |
|---|---|
| Renderer | "Godot 4 can only target WebGL 2.0 (using the Compatibility rendering method). Forward+/Mobile are not supported on the web platform." No WebGPU support. |
| Browser requirements | WebAssembly + WebGL 2.0. "Safari has several issues with WebGL 2.0 support that other browsers don't have", Chromium-based or Firefox recommended. |
| Threads | Since 4.3 single-threaded export is supported and is "the preferred and now default way". Threaded export needs `SharedArrayBuffer`, cross-origin isolation headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, and a secure context. Without the headers (or the PWA workaround) a threaded project "will not run". |
| No-header hosting | Enable **Progressive Web App > Enable**: service worker simulates the headers (secure context still required). Can be turned off with **Enable Cross Origin Isolation Headers**. |
| Thread/Extension export options | **Thread Support** and **Extensions Support** both require the cross-origin isolation headers. GDExtensions must be compiled for web. |
| C# | Godot 4 C# projects cannot be exported to the web (irrelevant to GDScript). |
| Export file name | Use `index.html`. Renaming exported files after export can break things: files expect the name from the initial export. |
| `user://` persistence | Needs cookies allowed (IndexedDB). In an `iframe`, third-party cookies must be enabled. Private/incognito mode prevents persistence. `OS.is_userfs_persistent()` can check but "can give false positives in some cases". |
| Background tab | Browser pauses the project when the tab is not active: `_process()` / `_physics_process()` stop. Does not apply to unfocused windows. |
| Fullscreen / mouse capture | Only allowed from inside a pressed-input-event callback (`_input`, `_unhandled_input`); querying the `Input` singleton is not enough. The fullscreen project setting does not work unless the engine starts from a valid input handler (needs a custom HTML shell). |
| Audio default | Since 4.3 web exports play audio as **Samples** (Web Audio API). Limitations: AudioEffects, reverb/doppler, procedural audio unsupported; positional audio may not work correctly. Switch with project setting **Audio > General > Default Playback Type.web** or per-node **Playback Type = Stream** (more latency, esp. without threads). |
| Audio autoplay | Browsers restrict autoplay; ask the player to click/tap/press a key (e.g. on a splash screen) before audio. |
| Networking | No low-level networking. Supported: HTTP client, HTTPRequest, WebSocket (client), WebRTC. HTTP limits: no `StreamPeer` access, no threaded/blocking mode, no more than one progress per frame (polling in a loop freezes), no chunked responses, host verification cannot be disabled, same-origin policy applies. |
| Clipboard / gamepad | Clipboard needs Clipboard API + secure context and "might not be reliable when accessed from GDScript". Gamepads not detected until a button is pressed; mapping may be wrong. |
| Secure context | Many browser features (clipboard, gamepad, microphone, threads) require HTTPS (localhost usually exempt). |
| Serving | Serve `.wasm` as `application/wasm` (other MIME types "can prevent some start-up optimizations"); `.pck` as `application/octet-stream`. Compression recommended, gzip shrinks `.wasm` to ~a quarter; consider Brotli precompression. |
| Custom shell | Each project generates its own HTML; direct edits are lost on re-export. Use **Custom HTML shell**; **Head Include** is appended to `<head>`. |
| Canvas | Default window matches browser window; **Canvas Resize Policy**: None / Project / (default) match browser. |
| Mobile | "CPU and GPU performance is at a premium"; use feature tags to apply low-end settings on web; compile an optimized export template without unused features to cut `.wasm` size. |
| VRAM compression | Enable **VRAM Texture Compression** for targeted platforms (both Desktop+Mobile = bigger but more compatible). |
| Stale local export | One-click deploy across multiple projects can show an old project due to service-worker caching (no automated cache busting). Unregister the service worker in DevTools > Application, then reload. |
| Env var | `GODOT_SCRIPT_ENCRYPTION_KEY` overrides the encryption key at export. |
| Headless export in CI | `--headless` required on GPU-less CI (https://docs.godotengine.org/en/4.7/tutorials/editor/command_line_tutorial.html). |

## Version-specific changes

| Version | Change | Source |
|---|---|---|
| 4.3 | Single-thread export; Samples audio default (as stated by the 4.7 page) | page above |
| 4.4-4.6 | No upgrade-guide entry mentions Web export (the four guides were read in full) | upgrade guides, `breaking-changes.md` |
| 4.7 | Changelog bullets: "SCons: Enable `wasm64` support on web builds"; "Web: Fix assertions wrongly affecting release template, make it configurable"; "Web: Add missing includes for single threaded build"; "Web: Remove flags that prevent `proxy_to_pthread` from building"; "Web: Remove undefined behavior around exit"; "Web: Optimize WebSocket send by replacing per-byte heap reads with heapSlice"; "Web: Fix `poll_export` changing current export_preset"; "Fix GLES3 scene shader int literal type errors for WebGL"; "Fix GLES3 batching skipping rendering all items on specific buffer sizes"; "Fix texture repeat mode for GLES3 renderer" | 4.7 section of CHANGELOG |
| 4.7.2 | "Remove `emscripten_cancel_main_loop` from web `exit_callback`" | 4.7.2 section |

NOT SOURCEABLE — the effect/user impact of the 4.7 web changelog bullets beyond their text, not stated at the changelog (bullets only).
NOT SOURCEABLE — iOS/Safari-specific or itch.io/Cloudflare Pages hosting behaviour, not stated at the web export page (it lists itch.io and GitLab Pages only as hosts without on-the-fly compression, GitHub Pages as with gzip).
