# DROP THE BASS (turret defense with RoxorLoops and Jasmin)

A merge-and-defend roguelite. The Static (a hungry hush) is eating the sound of the world. RoxorLoops and Jasmin turn their
gear into turrets, merge them up to level 7, pick Remix upgrades, loot relics and gear, and tour five stages to the Mega Arena
to face Mr. Playback. Plain ES modules, no build step, no image files, no audio files: art is canvas code, sound is Web Audio.
Served at `/drop_the_bass/`. Link: `https://games-71g.pages.dev/drop_the_bass/`.

House rules (code, UI text, comments, docs): never write an em dash. Use a comma, colon or period. Ids are append-only
lowercase_snake (saves point at them). Save key `drop_the_bass_save_v1` (never rename). Money-free: diamonds are earned only.

## Layout and ownership (one owner per file)
```
drop_the_bass/
  index.html
  CLAUDE.md            this contract
  js/
    data_core.js       grid, turrets, enemies, bosses, maps, worlds, econ constants   (DONE, the shared contract)
    data_meta.js       studio upgrades, gear, crates, fame, quests, achievements, outfits
    data_run.js        remix cards, relics, wave mods, daily mods
    data_story.js      cutscene scripts, tutorial script, loopy tips
    rng.js             makeRng(seed)
    sim.js             Run: the battle simulation (no DOM, no Math.random, no Date). step(dt) fixed.
    meta.js            profile, save, economy, crates, gear, quests, achievements (pure functions on the profile)
    audio.js           procedural Web Audio: sfx + adaptive music with beat clock
    art_entities.js    turrets, enemies, bosses, projectiles, icons, glyphs, gear, crates (canvas drawing)
    art_world.js       heroes, Loopy, backdrops, board tiles, stage base, cutscene scenes, title scene, logo
    fx.js              particles, floaters, screen shake
    battle.js          canvas battle view + input (uses sim.js and the art modules)
    cutscene.js        cutscene player (canvas scene + DOM dialogue box)
    ui_core.js         DOM helpers, canvas icons, live canvases, modal, toast
    ui_hub.js          hub tabs (Tour, Studio, Band, Crates, Goals), codex, settings, lucky wheel, leaderboard modal
    ui_run.js          remix/relic pick, pause, hints, defeat, results, how to play
    lb.js              leaderboard client (functions/api/dropbass_board.js, KV binding BOARD, keys prefixed dtb:)
    main.js            shell, loop, router, save hooks, run resume (snapshot in profile.resume)
tests/drop_the_bass_*.test.mjs   headless suites; `npm run test:dropbass` runs them all
```

## Canvas and coordinates
Logical canvas is 540 x 960 (portrait, scaled to fit with letterbox). Board: 7 x 10 tiles of 72 px at (18,120). A turret sprite
fits in a 72 x 72 box centred on (x,y). Enemy radius is `ENEMIES[id].r` (10 to 22), bosses `BOSSES[id].r` (34 to 44).
All draw functions take a 2D context already transformed to logical coordinates, draw around (x,y) and leave ctx state
(transform, alpha, composite, shadow, lineWidth, fillStyle) as they found it (use ctx.save/restore). Time `t` is seconds, passed in
(no Date.now, no Math.random, no unseeded randomness inside draw code: derive jitter from t and ids). They must not throw in
node with a mock ctx: guard `document` use. Sprite caches: `makeCanvas(w,h)` returns `document.createElement('canvas')` or null in node
(draw direct when null). Provide `setArtScale(n)` (cache resolution multiplier, default 2).

## Art style
Neon sticker look: dark violet backdrops, thick dark outlines (3 px), bright flat fills with a lighter highlight and darker shade,
small sparkles, soft glow on the important thing. Cute but cheeky. The Static are fuzzy grey blobs with googly eyes, glitch offsets
in cyan and magenta, never gory. Palette is `COL` in data_core.js. Jasmin pink (#ff5fb0), RoxorLoops green (#9dff3a).
RoxorLoops: tall swooping brown mohawk pushed up and forward, shaved sides, short mullet tail, pale blue-grey cheeky eyes, smirk with a
flash of teeth, black tee with an orange smiley, olive pants, lime sneakers, black mic with a green band, light stubble.
Jasmin: long dark hair in a high ponytail with a pink scrunchie, a heart necklace, hoop earring, warm smile, pink top, a mic with a pink band.
Onesies (outfit 'onesie'): Roxor a green monster onesie with horns hood, Jasmin a unicorn onesie with a horn and rainbow mane.
Loopy: a living loop-station pedal (rounded rectangle, two big round footswitch "feet", a tiny screen face with eyes, a cable tail), the guide.

## audio.js (singleton API, safe with no AudioContext: every call is a no-op in node)
```
export const AudioFx = {
  init(), resume(),                               // call from a user gesture
  setVolume({ music, sfx }), getVolume(), mute(bool),
  play(name, o?),                                 // o: { pan -1..1, vol 0..1, pitch ratio, rate-limited internally }
  musicStart(trackId), musicStop(fadeSec), musicIntensity(0..1), musicDuck(sec),
  beatInfo(),                                     // { bpm, beat (integer count since start), phase (0..1 inside current beat), t (audio clock secs) } or null
  onBeat(fn),                                     // fn(beatIndex) called around each beat from the music scheduler; returns an unsubscribe fn
}
```
sfx names: ui_click ui_back ui_open ui_tab coin diamond record deploy merge merge_big sell shoot_kick shoot_snare shoot_hat shoot_sub
shoot_mic shoot_synth shoot_scratch shoot_cowbell shoot_horn shoot_vocal hit crit kill kill_big leak wave_start wave_clear boss_warn
boss_die hero_roxor hero_jasmin duet levelup remix_pick relic chest crate_shake crate_open reveal_common reveal_rare reveal_epic
reveal_legendary reveal_mythic win lose error countdown tick achievement typewriter whoosh jam heal freeze combo reroll star_pop.
trackIds: title hub world_garage world_busk world_club world_festival world_arena boss victory defeat cutscene_warm cutscene_dark.
Music is a procedural sequencer (look-ahead scheduling, bpm per track, drums/bass/chords/arp/lead layers, intensity adds layers,
minor-pentatonic funk/house flavour, each world a different key, mood and bpm).

## art_entities.js
```
makeCanvas, setArtScale
drawTurret(ctx, type, level, x, y, o)   o: { t, ang (head aim, radians), fire (0..1 recoil/flash), jammed, buff ('rate'|'dmg'|null), selected, alpha, scale, spawn (0..1 pop-in) }
drawEnemy(ctx, type, x, y, o)           o: { t, ang, hp (0..1), hit (0..1 white flash), slow, stun, burn, mark, shield (0..1), affix, scale, rage, alpha }
drawBoss(ctx, id, x, y, o)              o: { t, ang, hp (0..1), hit, gated, phase, scale, alpha }
drawProjectile(ctx, kind, x, y, o)      kind: kick snare hat scratch cowbell orb vocal ; o: { t, ang, scale }
drawGlyph(ctx, name, x, y, size, color) names: note notes wave bolt shield heart bag clock star fire snow target skull crown magnet gift hat shoe mic disc speaker plug battery dice clover rocket bomb arrow_up double eye hourglass ticket tape van cat drop flower bell horn guitar sparkle coin diamond record fans lock check cross plus minus play pause ff gear merge sell reroll
drawIcon = drawGlyph alias with the same names (currencies keep their fixed colours when color omitted)
drawGear(ctx, slot, id, rarity, x, y, size)   slots: head mic body chain feet ; id is the gear id (any string, draw a distinct design from a hash of it)
drawCrate(ctx, tier, x, y, size, o)     tier: garage studio platinum ; o: { t, open (0..1), shake }
drawRarityFrame(ctx, rarity, x, y, w, h, t)   rounded card frame with rarity glow
drawTurretIconFlat(ctx, type, x, y, size)     cheap flat icon for lists (no cache needed)
```
## art_world.js
```
drawHero(ctx, who, x, y, size, o)       who: roxor jasmin ; size = full body height ; o: { t, outfit ('default'|'onesie'), pose ('idle'|'cheer'|'sing'|'beat'|'sad'|'shock'|'talk'|'point'|'hype'), flip, talk }
drawBust(ctx, who, x, y, size, o)       head and shoulders portrait for dialogue ; same o
drawLoopy(ctx, x, y, size, o)           o: { t, mood ('happy'|'worried'|'excited'|'sleepy'), talk }
drawLogo(ctx, x, y, w, t)               the DROP THE BASS title lockup, centred at x,y with width w (stacked words, bass drop shockwave, glow)
drawBackdrop(ctx, id, w, h, t, o)       id: title hub garage busk club festival arena ; full-canvas (any w,h) ; o: { beat 0..1 pulse, staticAmt 0..1 }
drawBoard(ctx, mapId, worldId, t, o)    board floor in logical coords: path tiles, buildable slots, blocked decor, spawn gates, stage tile ; static part cached ; o: { beat, slotHint: [[c,r]...], hoverSlot: [c,r]|null, dropSlot: [c,r]|null }
drawStageBase(ctx, worldId, x, y, o)    the stage the Static are attacking ; o: { t, hp (0..1), hit (0..1), beat }
drawScene(ctx, id, w, h, t, o)          full-canvas cutscene art, ids below ; o: { progress (0..1 inside the panel) }
drawTitle(ctx, w, h, t, o)              the animated title screen scene (skyline, duo on a rooftop stage, equalizer, Static creeping) without logo ; o: { beat }
```
scene ids: garage_day static_arrives silent_town build van_night boss_reveal (intro, in order), world_garage world_busk world_club
world_festival world_arena (world intros), boss_compressor boss_noisegate boss_reverb boss_djglitch boss_playback (boss intros),
victory_stage credits_van (ending), defeat_quiet (all lights down, Loopy glows).

## Tests
Every module gets a headless suite in tests/ (node, no browser needed; browser-only checks use a mock ctx Proxy). Visual checks use
Playwright Chromium (`require('playwright')` works; never run `playwright install`): render a lab page or a data URL, screenshot to the
scratchpad, LOOK at it (Read the png), fix, repeat. Lab pages live in `drop_the_bass/lab/` (plain html importing ../js/*.js).

## Game design in one page
- Core loop: DROP a random turret from your pool (cost grows per drop), merge two of the same level (drag or tap), every level doubles power up to 7.
  Kills give coins and hype. Hype fills: pick a Remix card (47, stackable). Bosses and wave 5/15 chests: Merch relics (24, unique).
- Twists: wave modifiers (10), elites (5 affixes), 5 bosses with tricks, beat-synced drops (discount), kill combos, hero moves + Duet Finale.
- Modes: Story (5 stages x 20 waves, Encore 0 to 5), Endless (leaderboards), Daily Challenge (8 mods), Boss Rush (10 bosses), tutorial.
- Meta: Records (Studio upgrades, turret unlocks, hero levels, gear upgrades), Diamonds (crates, boosters, revive, outfits, auto-merge; earned only),
  Fans (Fame level), gear (30 templates, 3 sets, merge 3 into next rarity, pity timer), daily login, 3 daily quests, 39 stickers, star chests,
  offline Streaming Royalties, lucky wheel, boosters.
- Tests: `npm run test:dropbass` (data, sim, meta, battle view headless, balance bot, board function, audio, art, browser smoke when Playwright exists).
- Balance: tests/drop_the_bass_balance.test.mjs prints the bot win-rate table. Stage difficulty is set by WORLDS[].hpMul/coinMul and ECON.hpGrowth.
