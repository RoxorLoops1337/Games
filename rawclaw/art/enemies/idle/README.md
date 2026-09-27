# Enemy idle loops

Six-frame loops for the six illustrated RawClaw enemies: rat, slime, bat, gremlin, mimic and spider. Created with the built-in ImageGen tool using the existing portraits as references; the exact prompts are in prompts.json. Other enemies retain their existing procedural idle animation.

The 3-by-2 PNG sheets in sheets/ contain the same aligned cels as the individual runtime files. Frames share dimensions and a baseline per enemy. tools/rawclaw/pack-idle.py extracts and aligns the generated artwork without redrawing it.

Timing lives in ART.IDLE_CLIPS. A loop starts only when all its frames have loaded; otherwise the original portrait stays visible. Rendering holds frame zero during attack, hurt, death and freeze effects. Tints use the selected frame, and ordinary combat timing is unchanged.

Open /rawclaw/idle.html for the live gallery. Run npm run test:rawclaw and node tests/rawclaw_browser.mjs. Set RAWCLAW_RECORD_IDLE=1 to capture the gallery for a preview video.
