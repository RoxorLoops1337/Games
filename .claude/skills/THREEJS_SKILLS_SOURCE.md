# Three.js game skills (vendored)

Source: https://github.com/majidmanzarpour/threejs-game-skills (MIT, see THREEJS_SKILLS_LICENSE), commit 8286774.

Reviewed before adding: no prompt injection, no hidden content, no data sent anywhere except the official Tripo, Gemini and ElevenLabs APIs when those (paid) scripts are run with a key.

Changes made here:
- each SKILL.md description starts with "3D GAMES ONLY" so the skills only load for 3D game work;
- each SKILL.md starts with house rules (repo architecture first, no paid generation without the owner asking, no profile-sourcing credential probe, the repo push workflow);
- removed the Codex-only agents/openai.yaml files and probe_asset_credentials.sh.

Skills: threejs-3d-generator, threejs-aaa-graphics-builder, threejs-audio-generator, threejs-debug-profiler, threejs-game-director, threejs-game-ui-designer, threejs-gameplay-systems, threejs-image-generator, threejs-qa-release
