# RawClaw

Standalone plush edition copied from Clawspire at ab3e00082ff39280e67f37c766a2f7ddd5833d22.
Work stays on branch RawClaw. Original clawspire/ is unchanged. Do not merge without the owner asking.

Open /rawclaw/ after npm run build. Independent rawclaw_run, rawclaw_meta and rawclaw_audio saves.

Approved ImageGen artwork: 40 transparent mischievous plushes, title scene, three hero portraits and six enemies. Bin items retain original IDs, effects, names and mass; most bodies now follow plush proportions. Small fillers keep their original circles. Remaining art uses the game's procedural fallback.

art/plush/spritesheet.png is the original approved sheet; mapping.json maps art keys to plushes. Individual PNGs are also installed into the existing art loader paths. Grey tiger = sword/attack; blue bear = shield.

Validation: npm run check; npm run test:rawclaw.
