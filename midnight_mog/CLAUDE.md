# Midnight Mog (the contract every module is built against)

Cats defend a neon rooftop city at night. Tower defense battles, a deck builder that feeds them, a town builder that feeds the deck, and an endless loot loop on top. Plain ES modules, no build step, no image files (all art is procedural canvas). Served at `/midnight_mog/`.

House rules (apply to code, UI text, comments, docs): never write an em dash. Use a comma, colon or period.

## Layout and ownership
One owner per file. Never edit a file you do not own; if you need a change in someone else's API, say so in your report and code around it.

```
midnight_mog/
  index.html            shell: <canvas id="game">, one <script type="module" src="js/main.js">
  CLAUDE.md             this file
  docs/                 STYLE_BIBLE.md, ECONOMY.md, LOOT.md, SYSTEMS.md, BALANCE_REPORT.md, QA_REPORT.md
  js/
    rng.js              DONE. makeRng(seed) -> {next,int,pick,chance,weighted,shuffle,getState,setState}
    palette.js          colours + named roles + rarity ramps (art director)
    data/               pure data, no imports except palette-free constants: cats.js enemies.js cards.js relics.js buildings.js districts.js crates.js
    sim/                deterministic, no DOM, no Math.random, no Date.now (time is passed in)
      battle.js deck.js town.js loot.js economy.js progression.js profile.js offline.js
    bots/               players that drive the sim headless: bots.js
    render/             canvas drawing, no sim logic: catart.js enemyart.js world.js fx.js text.js
    ui/                 DOM/canvas screens: shell.js hud.js screens_*.js tutorial.js
    audio.js            procedural Web Audio
    main.js             app shell, game loop, screen router, save hooks
tests/midnight_mog_*.test.mjs   headless suites (node), run by `npm run test:midnightmog`
```

## Hard rules
- Sim and data modules import only from `../rng.js`, `../data/*`, and each other. They never touch `window`, `document`, `localStorage`, `Math.random` or `Date`.
- Every id is append-only and lowercase_snake (cat `ember_mog`, enemy `rat_courier`, card `pounce`). Never rename or reuse an id: saves point at them.
- Save key `midnight_mog_save_v1`. Profile has `v` (int) and migrations live in `profile.js`.
- Money-free. Crates cost soft currency only. Odds are shown in game and come from the same table the code rolls on.
- Time: the sim advances by `step(state, dtSeconds)` with fixed dt 1/30. Rendering interpolates.
- Palette (see palette.js): ink #0b0716, violet #5b2a86, hot magenta #ff2e88, acid lime #b6ff2e, electric cyan #19e6ff, bone #f4ecff, GOLD #ffc83d is reserved for rarity and the best loot only.
- Mobile first: 390x800 portrait must be fully playable with taps; desktop gets the same layout widened. Tap targets at least 44px.
- Performance: 60 fps with 150 live units on a mid phone. Pool particles. No per-frame allocation in hot loops.

## Shared shapes (JSDoc, keep these exact)
```
Rarity = 'common'|'rare'|'epic'|'legend'|'mythic'
Cat   = { id, name, role:'brawler'|'archer'|'mage'|'support'|'trapper'|'tank', rarity, tags:[], base:{hp,dmg,range,rate,speed}, perLevel:{hp,dmg}, ability:{id,cooldown}, flavor }
Enemy = { id, name, tier, base:{hp,dmg,speed,reward}, traits:[], flying:bool, boss:bool }
Card  = { id, name, cost, type:'summon'|'spell'|'trap'|'build', rarity, text, effect:{...} }
Profile = { v, seed, createdAt, cur:{fish,gems,yarn,tokens}, cats:{[id]:{level,dupes,stars}}, deck:[cardIds], cards:{[id]:{level,count}}, relics:{[id]:true}, town:{plots:[{b,level,t}],...}, progress:{district,stage,best:{[district]:stage}}, nineLives:{count,shards}, pity:{[crateId]:int}, stats:{...}, lastSeen }
Battle state = { t, wave, lane/tiles, units:[], enemies:[], projectiles:[], energy, hand, draw, discard, base:{hp}, events:[], over:null|'win'|'lose', rng }
Events (battle.events, drained by render each frame) = {type:'hit'|'death'|'spawn'|'cast'|'crit'|'base_hit'|'wave'|'win'|'lose'|'loot', ...}
```

## Public APIs the rest of the code relies on
```
sim/battle.js     createBattle({seed, district, stage, profile}) ; step(b, dt) ; playCard(b, handIndex, tileOrTarget) ; drainEvents(b) ; battleResult(b) -> {won, wave, rewards:[...]}
sim/deck.js       newDeck(cardIds, rng) ; draw(d, n) ; play(d, i) ; energyRegen(level)
sim/loot.js       CRATES (from data/crates.js) ; oddsTable(crateId, profile) ; openCrate(profile, crateId, rng) -> {profile, drops:[{kind,id,rarity,isNew,dupeValue}], pityHit}
sim/economy.js    cost(kind, level) ; income(profile) ; sinks ; the single place curves live
sim/town.js       canBuild(profile, b, plot) ; build ; upgrade ; collect(profile, nowMs) ; production(profile)
sim/progression.js  stageScaling(district, stage) ; enemyWave(district, stage, waveIdx, rng) ; nineLivesReset(profile) -> {profile, shards}
sim/profile.js    newProfile(seed) ; migrate(obj) ; serialize(p) ; deserialize(str)
sim/offline.js    offlineGain(profile, nowMs) -> {fish, yarn, capped, seconds}
bots/bots.js      runBot(kind:'random'|'greedy'|'strong', {seed, hours}) -> {timeline:[{h, district, stage, cur}], walls:[...], stats}
render/*          draw functions take (ctx, state, t) and never mutate sim state
```

## Done means
`npm run test:midnightmog` green, `docs/*.md` written with real numbers from the sims, `node build.js` ok, headless browser smoke test with zero console errors at 390x800 and 1280x800.
