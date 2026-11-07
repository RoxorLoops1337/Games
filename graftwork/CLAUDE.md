# GRAFTWORK

"Cut what you love. Stitch what you need." A roguelike deckbuilder where you never add cards: after a fight you pick ONE of your OWN cards and ONE graft to sew onto it. Every graft has a Boon and a Price. Live at `https://games-71g.pages.dev/graftwork/`. Plain ES modules, no build step, no art files EXCEPT the Ward (see below); everything else is drawn on canvas, audio synthesized. **No em dashes in any text, ever.**

## The one rule that makes it a game
- Each graft has a **Weight** (1 to 3). Deck **Budget** is 6 (+ relics, + Forge "Expand", + skipping a graft).
- Total weight over Budget = **Strain**. Each Strain point lands one **Tithe** on a *Bare* card (a card with no grafts, not junk): the cheapest, then oldest. Tithed cards fight at -25% numbers that combat. The deck view and the offer preview show exactly which cards will be tithed BEFORE you commit.
- Strain with no Bare card left to take it is **Backfire**: every 2 overflow, one grafted card in your opening hand each turn is jammed (+1 cost).
- Max 2 grafts per card. The **3rd graft is an Overload**: it weighs +1 extra, the card's damage/block numbers x1.5, and on its first play each combat there is a 25% **Shatter** (the card resolves, then is destroyed for the run).
- **Temper** (a Forge option): the hammer fuses all of a card's live patches into the card for good (`inst.fused`, tracked apart from `inst.grafts`). Their boons AND prices stay, the patch slots empty so new grafts fit again, the card stops being an Overload (no x1.5, no Shatter roll), each fused graft weighs 1 less (never under 1), a card with fused grafts is not Bare (it is not Tithed), fused grafts cannot be stripped or moved, and a card holds at most `FUSE_CAP` (4) of them. Rules live in `engine/cards.js` (`canTemper`, `temper`, `fusedWeight`).
- Every graft also carries its own local **Price** (cost up, exhaust, self damage, jam chance, junk cards, slower draw, max HP loss). A Boon is never free.
- Offers: 3 cards from your deck (one is always a low-play-count card) x 3 grafts, one of each tier: **safe** (weight 1, small boon, simple price), **greedy** (weight 2 to 3, big boon), **weird** (changes how the card works). Skipping the graft: heal 8, OR +1 Budget permanently, OR +10 gold.

## Module map (read this first)
```
graftwork/
  index.html  main.js          page + boot: builds the app, wires flow.route(), settings sync, window.__gw
  engine/   PURE rules, no DOM (do not edit without the lead; shared-file protocol below)
    rng.js          seeded rng (hashSeed, rng objects stored on run.rng)
    cards.js        card instances, grafts, Budget/Strain/Tithe, Overload, Temper (canGraft, canTemper, temper, strainInfo, cardSpec)
    combat.js       combat state c, ops interpreter, playCard/endTurn/finishCombat, hook dispatch fire(c, name, ...)
    seam.js         the Thread (Line, extend, cut, payouts); afflictions.js (poison, Brittle, Rejection, Infection...); resonance.js (school resonance hooks)
    text.js         rules text generated from specs (cardLines, statusText)
    run.js          run state: map, rewards, offers, shop, forge, events, ascension, save payload
    save.js meta.js meta2.js   persistence (see Save keys), meta progression, Credit, cosmetics, Daily Case, boss practice
  data/     content, one author per file (table below); ward_kit.js = the modular room recipes (rm_* -> kit floor, wall, pieces, props) + pure grid geometry; data/index.js builds the id maps (CARDS, GRAFTS, ENEMIES, STATUSES...) and throws on duplicate ids
  ui/       screens + kits: core.js (app, COL, EASE, input, text cache), chrome.js (shared buttons/panels), one file per screen
            (title map combat reward graft shop forge event deckview codex end settings pause wardrobe), combat_hud.js + combat_layout.js (HUD grid),
            seam_ui.js (Thread rail), juice.js (tier tables), fx.js (particles), post.js + post_shaders.js (WebGL2 post), lights.js, audio.js,
            a11y.js, fullscreen.js, transitions.js, tutorial.js, tooltips.js, layout_registry.js,
            assets.js (lazy image loader for assets/ward/manifest.json: get(id) is null until decoded, @1x on phones, @2x on desktop, a no-op in node),
            ward.js (the Ward screen and its rules plumbing), ward_iso.js (the isometric map: projection, picking, rooms, actors and their grounding, hero, thread, time-of-day light), ward_kit_iso.js (the modular room renderer: kit floors, walls, pieces, props, cached static layers, free-tile wander), ward_kit.js (cards, icons, glyphs)
  art/      procedural canvas drawing only: cards.js, icons.js, enemies.js, heroes.js, backgrounds.js, attacks.js (attack rigs). Also the fallback of every Ward image (enemies and heroes are cached to offscreen canvases when no sprite is there)
  assets/ward/   the Ward's generated WebP art + manifest.json (see Ward art exception below); owned by the art pipeline, never edited by hand; read only through ui/assets.js
  design/   ART_BIBLE THREAD ENEMY_DEPTH UX_SPEC JUICE BUILD_PLAN (+ README.md index)
tests/graftwork_*.test.mjs     headless suites; tests/run_graftwork.mjs runs them all; tests/graftwork_lib.mjs is the fake-canvas harness
tools/graftwork_*.mjs          balance and audio tooling (see Balance tooling)
```

## Content files and owners (never edit another owner's file; add new statuses ONLY to your own statuses_<x>.js)
| file | contents |
|---|---|
| cards_marrow.js / cards_wick.js / cards_odile.js | hero cards. ids `m_*` `w_*` `o_*`. The 7 starter cards per hero already exist: keep their ids, you may retune. Need >= 20 NON-starter cards each (common 10, uncommon 7, rare 5+), at least 5 Attack, 5 Skill, 3 Power-type per hero |
| cards_any.js | neutral cards `x_*` any hero can buy (>= 14) |
| cards_junk.js | junk (`j_*`), required ids: j_paperwork j_ringing j_clot j_flake j_static j_ledger. Add more as needed |
| grafts_safe.js / grafts_greedy.js / grafts_weird.js | grafts `g_*`, tier matches file |
| enemies_1/2/3.js | enemies by act, INCLUDING that act's elites and boss (kind: 'elite'/'boss'); bosses.js stays empty |
| relics.js potions.js events.js | relics `r_*`, potions `p_*`, events `e_*` |
| heroes.js schools.js statuses.js | lead only |
| statuses_marrow/wick/odile/gsafe/ggreedy/grafts(=weird)/e1/e2/e3/relics.js | extra statuses for that author |

## Card schema
`{ id, name, hero, type: 'attack'|'skill'|'power'|'junk', cost: 0..3|'X', rarity: 'starter'|'common'|'uncommon'|'rare'|'junk', target: 'enemy'|'all'|'self'|'none', school?, flavor (one dry line, max 60 chars), flags: {exhaust, innate, retain, ethereal, unplayable}, fx: [ops], up: { fx: [ops] (full replacement), cost?, unflags?: [] } }`
Power-type cards are played once and stay out of the deck for the rest of the combat; they usually apply a status to `to:'self'`. Every non-junk card needs `up.fx` and `flavor`.

## Ops (fx arrays). A value `n` is a number OR `{ base, per: <source>, mul, max, min }` (base + floor(source * mul))
- `{op:'dmg', n, hits?, to?:'enemy'|'all'|'random', pierce?}` (enemies: hits the player). dmg and block scale with graft pct, Overload and Tithe automatically.
- `{op:'block', n, to?}` `{op:'status', s, n, to?:'enemy'|'all'|'random'|'self'|'player'|'allies'}` `{op:'setStatus', s, n}` `{op:'double', s, cap?, to?}` `{op:'detonate', s, mul?}` `{op:'cleanse'}`
- `{op:'draw', n}` (max 4) `{op:'energy', n}` (max 3) `{op:'heal', n}` `{op:'hp', n}` (lose HP; never kills the player) `{op:'maxhp', n}` `{op:'gold', n}`
- `{op:'addCard', card, n, to:'hand'|'draw'|'drawTop'|'discard', up?}` `{op:'summon', id, n?}` (enemies)
- `{op:'discard', n, choose?}` `{op:'exhaustHand', n|'all', choose?, draw?}` `{op:'fetch', n, from:'discard'|'exhaust'}`
- `{op:'if', cond, ifText:'human text of the condition', then:[ops], else?:[ops]}` cond = `{src, lt|lte|gt|gte|eq}` or a function `(c, ctx) => bool`
- `{op:'repeat', n, fx}` `{op:'custom', fn(A, ctx), text:'rules text'}` (escape hatch; ALWAYS give `text`). Any op may carry `t:'override text'`.
- Value sources `per`/`cond.src`: x hand energy block hp hp% missingHp drawPile discard exhaust plays turn deck grafts cardGrafts strain enemies kills dealt gold junk attacksInHand, and `st:<status>@self|target|player`.
- Replays (Plays twice, Echo) repeat damage, block and status but NOT resource ops (draw, energy, gold, addCard, heal). Draw per op max 4, energy max 3.

## Graft schema
`{ id, name, school, weight: 1|2|3, tier, rarity: 'common'|'uncommon'|'rare', boon: 'text', price: 'text', mods: [...], types?: ['attack'..], not?: [graftIds], ok?(spec) }`
`mods` MUST contain at least one boon mod and one price mod. Kinds (engine/cards.js applyMod):
- boon: `{k:'cost', d}` `{k:'flag', f}` `{k:'unflag', f}` `{k:'repeat', n}` `{k:'addFx', fx:[ops], pos?:'start'}` `{k:'pct', pct}` (+/- % to damage and block) `{k:'aoe'}` `{k:'lifesteal', cap?}` `{k:'target', t}` `{k:'type', t}` `{k:'custom', hooks}`
- price: `{k:'selfHurt', n}` `{k:'jam', p}` `{k:'junk', card, n, to?:'draw'|'discard'|'hand', when?:'combatStart'|'onPlay'}` `{k:'selfStatus', s, n}` `{k:'drawdown', n}` `{k:'goldCost', n}` `{k:'maxHp', n}` (negative, applied once when grafted) plus the price-flavoured `cost +1`, `flag exhaust`, `flag ethereal`, `pct -N`.
- `custom` hooks: `{ onPlay(A, ctx), onDraw(A, {card, spec}), onDiscard, onExhaust, onTurnStart }`: weird grafts live here. ctx = `{card, spec, target, mult, x, replay, dealt}`.
- Point values (balance): common graft boon ~ +4 pts, uncommon +6, rare +8; price subtracts. Rough values: plays twice +6 (x0.5 if card has draw/energy), innate +2, retain +2, burn 3 +3, vulnerable 1 +3, +50% numbers +3, aoe +4, cost -1 +4, +1 energy +4, lifesteal +3; price: cost +1 -4, exhaust -3, self damage 3 -1.5, 25% jam -3, two junk -3, max HP -4 is -2. Net per rarity: common 0, uncommon +1, rare +2. Safe = weight 1, greedy = 2 to 3.
- Hard caps already enforced: plays/turn 20, hand 10, status 99, draw per op 4, energy per op 3, lifesteal 6.
- Schools: ember echo hoard blood rust static gilded. Aim each school's grafts to push that school's identity.

## Enemy schema (see enemies_1.js). Acts: normal 38-44 HP / 7-9 dmg per turn in Act 1, x1.6 Act 2, x2.4 Act 3; elite x1.8 HP; boss 130 / 220 / 340 HP. Act N has >= 10 normals (kind 'normal'), >= 3 elites, 1 boss (Act 3 also the final boss `the_grafter`, whose deck is read from the run at spawn).
Hooks `on: { combatStart(A,e), turnStart(A,e), damaged(A,e,dmg,{src,hit}), death(A,e), playerCard(A,e,{card,spec,target}), afterMove(A,e,moveId), modDamage(A,e,n,o)->n, statusGained(A,e,statusId,n) (a status landed on this enemy), playerBlock(A,e,n) (the player gained Block), seamExtend/seamCut/seamPay(A,e,info) }`. A card with `claimed: true` (The Matron's Claim) fights at the Tithe -25% and shows as tithed; Tempered cards are never claimed. `pick(A,e)->moveId` or `pattern`/`opening`. `e.data` is free scratch state. Enemy `art: { body: '<silhouette>', color, ...}` is read by art/enemies.js. `A` = combat API: A.dmg(src,tgt,n,o) A.block A.status A.setStatus A.heal A.loseHp A.draw A.energy A.gold A.addCard A.summon A.rng A.player A.alive() A.c (the full combat state).
Enemy moves are declarative `fx` with the same ops (they hit the player by default; `to:'self'|'allies'` for buffs). The intent icon is derived from the fx. `hidden:true` hides it. Statuses are `immune: [ids]` capable.

## Statuses: `{id, name, good, stack:'int'|'dur', canNeg?, mod:{outAdd,outMul,inMul,inCap,blockAdd,blockMul}, hooks:{turnStart,turnEnd,attacked,damaged,cardPlayed,kill}, desc(n)}` hooks receive `(A, owner, n, payload)`.

## Relic schema: `{ id, name, rarity, text, mod?: {energy, hand, budget, shatter, keepBlock}, on?: { combatStart(A,p,run), turnStart, turnEnd, cardPlayed(A,{card,spec,target}), damaged, kill, exhaust, shatter, combatEnd, wouldDie } }`. Run-level effects (gold, shop prices, Forge options) are flagged with `perk: 'name'` and read by engine/run.js (document the perk name in your report).

## Writing rules
Voice: clinical tenderness. Second person, short, dry, medical with a wink. Prices are stated plainly and never softened. No exclamation marks, no em dashes, flavor is one line.

## Verify
`node tests/graftwork_data.test.mjs` must pass before you hand back. `npm run test:graftwork` runs everything.

## Event schema (data/events.js) and the run helper R
`{ id:'e_x', name, act: 0|1|2|3 (0 = any), text (the scene, 2 to 4 short sentences), choices: [{ label, text?: 'what it does, plain', cond?(run) -> bool, pick?: 'card', pickFilter?(inst), apply(run, R, inst?) -> 'result text' }] }` at least 2 choices, one of them always safe (leave). `R` (implemented in engine/run.js): `R.gold(run,n)` `R.heal(run,n)` `R.hurt(run,n)` (never kills) `R.maxHp(run,n)` `R.addCard(run,cardId)` `R.removeCard(run,uid)` `R.upgrade(run,uid)` `R.addRelic(run,idOrNull)` (null = random) `R.addPotion(run,idOrNull)` `R.budget(run,n)` `R.stripGraft(run,uid,gid?)` `R.addGraft(run,uid,gid)` `R.queueGraftPick(run)` (a normal graft reward screen follows) `R.queueFight(run, [enemyIds], {elite?:bool})` `R.rng(run)` (seeded). Events run on `run.flags` for persistent state. Never mutate anything outside these helpers.

## UI / art contract (frozen; owners fill in their files)
- One 1280x720 logical canvas (`ui/core.js`). Immediate-mode: a screen is `{enter(app,params), leave(app), update(app,dt), draw(app), key(app,e)}` and is redrawn every frame. Use `app.text/panel/button/tooltip/inRect/clicked/tween/after/wrap/rr`, `COL` palette, `EASE`. Never touch the DOM. `ui/fx.js` is the particle/shake/hit-stop kit (one `new Fx()` per screen; call `fx.update(dt)` first, draw the scene offset by `fx.shakeOffset()`, then `fx.draw(ctx)` and `fx.drawFlash`).
- Shared state: `app.shared.run` (the run), `app.shared.meta`, `app.shared.audio` (ui/audio.js: `sfx(name,opts)`, `music(mode)`), `app.shared.flow`. Screens mutate the run ONLY through engine/run.js and engine/combat.js functions, then call `flow.route()` (which saves and switches to the screen for `run.phase`). Overlay screens open with `app.push('deckview', opts)` / `flow.openDeck()` and close with `app.pop()`.
- Phase to screen: map, combat, reward, graft, shop, forge, event, end (dead/won). After a combat: `const res = finishCombat(c); RUN.resolveFight(run, res); flow.route()`. After reward: `RUN.afterReward(run)`; after a graft pick `RUN.afterGraft(run)`; after shop/forge `RUN.advance(run)`; after an event result `RUN.afterEvent(run)`; then `flow.route()`.
- Art modules (all procedural canvas, no images, centered or foot-anchored as documented in each stub): `art/cards.js` (`drawCard(ctx, spec, x, y, {scale,rot,tithed,jam,cost,glow,selected,dim,alpha})` centered, `drawCardBack`, `drawGraftPatch(ctx, graft, x,y,w,h,opts)`, `drawSchoolGlyph`, `CARD_W=220`, `CARD_H=310`), `art/icons.js` (`drawStatus`, `drawIntent`, `drawRelic`, `drawPotion`, `drawNodeIcon`, `drawEnergyOrb`, `drawCoin`, `drawHeart`, `drawShield`), `art/enemies.js` (`drawEnemy(ctx, def, footX, footY, {scale,t,hurt,dying,attack,st})`, `enemyBounds`), `art/heroes.js` (`drawHero`, `drawPortrait`), `art/backgrounds.js` (`drawBackground(ctx, theme, t)`). The stubs currently there define the exact signatures: keep them.
- Colors: `COL` in core.js (slab/vellum/ink/suture/lamp/scar, card types attack/skill/power/junk, the seven school colors). Fonts: Georgia serif for names and flavor, Trebuchet for small UI text. Always give schools a SHAPE glyph as well as a color (colorblind safe).
- Juice rules from the creative director: graft attach = patch slides on, needle zigzags 6 stitches (one tick each), staple clunk, 40 ms freeze; Tithe = a red seam draws across the card with a dry snap; Overload shatter = gold-edged shards + slow-mo; big hits get 80 ms hit-stop and decaying shake; damage numbers are inked serif that pop to 1.4x; draw whoosh pitch rises; block plates rivet on; enemy death = silhouette unstitches along its seams.
- Headless UI tests: `tests/graftwork_lib.mjs` (`makeApp`, `frames`, `click`, `key`). Each screen owner writes `tests/graftwork_ui_<name>.test.mjs`: enter the screen with a real run from `RUN.newRun`, draw 60 frames, click its main controls, assert no throw and the run state changed as expected.
- Run it for real: `node` can't show pixels, but Playwright is installed: serve the repo (`python3 -m http.server 8123` from /home/user/Games) and screenshot `http://localhost:8123/graftwork/` with `require('playwright')` chromium to LOOK at your screen. `window.__gw.app` / `window.__gw.flow` are exposed for scripting.

## Title screen (ui/title.js, ui/title_scene.js, ui/title_logo.js)
- `title_scene.js`: the live backdrop. Five kit rooms (dispensary, morgue, generator, ward, corridor) drawn through `ward_kit_iso.js` (call only), the painted cast (hero idles and breathes, a nurse sways, monsters wander via `KR.monsterAt`), candle and window glow, a cached low-res multiply grade, motes, slow camera drift. Mode per frame: `keyart` (a `title.keyart` entry in `assets/ward/manifest.json`, files under `assets/title/`, optional `lights` and `focus`, no text in the art; `assets.js` passes the `title` block through) > `kit` > `fallback` (procedural lamp room plus a procedural hero: headless tests, failed downloads). `lite` (sticky, after a slow stretch) updates the scene every third frame from an offscreen copy and drops motes. Reduced motion: no drift, wander, breathing, flicker, motes, intro.
- `title_logo.js`: the GRAFTWORK wordmark baked per letter (banded brass, debossed shadow, rim light, hatching), the black running-stitch thread (setLineDash) from screen edge to edge, the needle that sews the letters on (intro, `INTRO_S` 3.6 s, first title of a page load in a real browser, `app.go('title', { intro: true })` forces it, any input skips and is used up) and then hangs from the seam, three rotating taglines (`TAGLINES`, no dashes).
- `title.js`: menu slabs (`slab()` wraps `app.button`, lift moves the picture and never the hit area), pips (new unlocks on Archive, Credit on Wardrobe), hero card (`title-hero-card`), `app.navButtons` on (Tab, arrows, Enter, gamepad bridge). Audio: `stitchTk`, `threadPull`, `roomTone`, `candleCrackle` are ordinary sfx, so mute and the autoplay rule apply.

## Round 4 (design docs in graftwork/design/)
ART_BIBLE.md (The Anatomical Plate), THREAD.md (the new core rule: school chains cashed by cutting), ENEMY_DEPTH.md (poison, Brittle, Rejection, Infection, Numb, Unpicked...), UX_SPEC.md (drag, HUD grid, pause, fullscreen), JUICE.md (animation language), BUILD_PLAN.md (who owns which file). Engine plumbing for the Thread and the afflictions is wired in combat.js; implementations live in engine/seam.js and engine/afflictions.js.

## Engine hooks (where to plug in)
- Enemy hooks (`def.on`): combatStart turnStart damaged death playerCard afterMove modDamage statusGained playerBlock seamExtend seamCut seamPay. Signatures are in the Enemy schema above. `seamCut` may set `info.cancel = true` to void a payout (Scissor Nurse).
- Relic hooks (`relic.on`) and hero hooks go through `fire(c, name, ...)` in engine/combat.js: combatStart turnStart turnEnd cardPlayed damaged kill exhaust shatter combatEnd wouldDie, plus `seamExtend|seamCut|seamPay` from engine/seam.js. Relic `mod` keys (energy, hand, budget, shatter, keepBlock, seamCap) are read by the engine, run-level `perk` names by engine/run.js.
- Seam plumbing in combat.js: `seamInit` (newCombat), `seamStep` (playCard, before the card's fx), `seamEnd` (endTurn), `seamTurnStart`. `seamPreview(c, card)` is pure and must match the real payout (tests/graftwork_ui_seam.test.mjs checks it). Caps live in seam.js (`SEAM_LEN_CAP`, `SEAM_CUTS_TURN`, ...).
- Claim flag: `card.claimed = true` (set by The Matron's Claim in data/enemies_1.js) makes a card fight and display exactly like a Tithe for that combat (`s.tithed = card.tithed || card.claimed` in combat.js). Tempered cards (fused grafts) are never claimed. Do not set `tithed` directly from content, use `claimed`.
- Afflictions (afflStartTurn/afflEndTurn/afflCost/afflAbsorb) are called from combat.js; add a new affliction in data/statuses_aff.js and engine/afflictions.js together.
- Graft `custom` hooks: onPlay onDraw onDiscard onExhaust onTurnStart (see Graft schema).

## Layout registry rules (ui/layout_registry.js)
Every HUD widget reports its rectangle each frame: `app.reg(id, x, y, w, h, { layer: 'hud'|'world'|'overlay', group, overlay })`. The layout tests enforce: `hud` rects never intersect unless they share a `group` or one is flagged `overlay` (tooltips, modals, the hovered-card layer); every non-`world` rect lies inside the 1280x720 stage. Register new widgets or `ui_layout` / `ui_combat_layout` cannot see them. Text never goes below `SMALL.minTextPx` (11) and touch targets never below `SMALL.minTouchPx` (40) on phones (ui/core.js).

## Tooltips (ui/tooltips.js, one system)
A tip exists only while its anchor is hovered, held or focused THIS frame. Show delay 0.25 s (touch: finger held 0.3 s, gone when it lifts), fade (none with reduced motion), dropped at once on a press, Esc, blur, screen change or `app.tipBlock` (combat sets it during enemy turns, drags and card animations); the same anchor stays quiet until the pointer leaves it. Shift (touch: keep holding 0.9 s) HOLDS the tip open: every definition plus the arithmetic. ONE compact panel (max width 38% of the stage, placed beside the anchor, kept off HUD rects and actors in the layout registry, arrow at the anchor): the thing's own lines, then one short definition per rules word. A card never defines its own type or school, and the totals line shows only when it differs from the face. Space is limited: extra definitions collapse into a visible `+N more (hold)`. New tips: `app.tooltip(title, text, { gloss, anchor, region })` or `queueTip(...)`. Tests: `graftwork_tip_lifecycle`, glossary (completeness), ui_layout (checkTip sweeps).

## Post, fx and audio APIs
- Post (ui/post.js, `app.post`, all no-ops when quality is off or reduced motion): `shockwave(x,y,strength,ms)`, `aberration(amount,ms)`, `flash(color,a)`, `vignette(a,ms)`, `setBloom(k,threshold?)`, `setGrade(name,ms)`, `setQuality('off'|'low'|'high')`. Logical 1280x720 coordinates. Grades: ward market theatre boss title neutral (auto per screen). Pointer events still hit the 2D canvas.
- Fx (ui/fx.js): one `new Fx()` per screen. Per frame `fx.update(dt)`, translate by `fx.shakeOffset()`, draw the scene, then `fx.draw(ctx)` and `fx.drawFlash(ctx,W,H)`. Emitters: `burst(x,y,kind)`, `float(text,x,y,opts)`, `floatCounter(id,x,y,n)`, `shakeDir(dx,dy)`, `zoom(k)`. Global switches live in `FX_OPTS` (shake, reduced, quality, flashes); `flashGate()` rate-limits flashes for photosensitivity. Caps: CAP_DESKTOP 2000, CAP_MOBILE 600, CAP_ADD 150, CAP_TRAIL 100.
- Audio (ui/audio.js, 100% procedural, safe to import in node): `initAudio`, `setVolumes({master,sfx,music})`, `mute(b)`, `duck(ms)`, `sfx(name,opts)`, `hit(dmg,maxHp)`, `music(mode)`, `stopMusic`, `setIntensity`, `heartbeat(on,bpm)`. Names: `SFX_NAMES`, `MUSIC_MODES`. A new sfx goes in the `S` table; heartbeat and Thread sounds that must stay audible over music also go in `DIP`. Run the audio gate after any edit.
- Juice tuning (ui/juice.js): `TIERS` (hit tiers relative to victim max HP), `BUDGET`/`FINAL` timing tables, pure helpers only. design/JUICE.md has the intent.

## Save keys (never rename)
- `graftwork_run_v1` (engine/save.js): the run in progress, written by `flow.route()` after every state change, deleted on death or win.
- `graftwork_meta_v1` (engine/meta.js): meta progression plus settings. Base shape is `v: 1` and final; additive revisions use `rev` (meta2.js `defaults2`, `migrate2`). Fields: unlocked, bestAsc, wins, winAsc, stats, seen, achievements, daily, tips, settings, history, then rev 2 credit, cosmetics, loadout, practice. `migrate()` fills missing fields from defaults, so adding a field is safe, changing a field type is not.
- Settings (`meta.settings`): master sfx music muted screenShake reducedMotion fastWalk (Ward walk pacing) colorblind colorblindMode flashes highContrast largeText textSize textScale (100|125|150|175) quality ('off'|'low'|'high') fullscreen tips announce. Defaults are in engine/meta.js `DEFAULT_SETTINGS`, ui/settings.js `DEFAULTS` and ui/a11y.js `A11Y_DEFAULTS`; main.js copies them into FX_OPTS and the audio bus each frame.
- Other test-only names: `graftwork_audio_check`, `graftwork_motion` are not storage keys.

## Test map (which suite guards what)
Run all: `node tests/run_graftwork.mjs` (or `npm run test:graftwork`). The runner uses a pool of 4 workers (`--jobs=N`, `--serial`, `--times` prints per-suite ms), prints one PASS or FAIL line per file, the last 12 stdout lines of a failure, and `N/N graftwork suites passed`; exit code 1 on any failure.
| area | suites |
|---|---|
| content gate (run first when editing data/) | data, content_fuzz (every card x graft x enemy), audit (power smoke, exploit decks), status_behaviour (status does what its tooltip says) |
| rules | temper, seam, afflictions, boss_mechanics, meta, meta2 |
| whole runs | fullrun (strong bot, all heroes), e2e (real flow routing) |
| combat UI | ui_combat, ui_combat_layout (HUD grid 1..6 enemies x 0..10 cards), ui_juice, ui_seam, motion (timing budgets) |
| other screens | ui_map, ui_graft, ui_shop (shop+forge), ui_deck, ui_title, ui_pause, ui_layout (non-combat layouts), ui_clickthrough, ui_reward_tip, ui_polish, ui_transitions, onboarding |
| input and a11y | touch (phone stage 844x390, pointer events), a11y, monkey (seeded random UI fuzz), ui_core |
| art | art_cards, art_chars, art_icons, attack_rigs |
| fx and audio | fx, post (API in node plus real Chromium, skips if missing), audio (name tables), audio_mix (offline render in Chromium: clipping, loudness, masking) |
| perf | perf (fake-ctx op counts, never wall time) |
The fake canvas in tests/graftwork_lib.mjs (`fakeCtx`) has own no-op methods for the common Canvas2D calls and a Proxy prototype for anything else, because a Proxy trap per draw call used to cost about half of every UI suite. Keep new draw calls to real Canvas2D names.

## Balance tooling (tools/)
```
node tools/graftwork_sim.mjs 20 0                 # careful / greedy / none policies, 20 runs per hero, ascension 0
node tools/graftwork_strong.mjs 40 0 [hero]       # strong bot (Thread aware); the reference for win rates
node tools/graftwork_tiers.mjs                    # skill tiers random/sloppy/careful/strong (design/DIFFICULTY.md has the targets)
node tools/graftwork_schools.mjs schools 100 0    # mono-school builds; also: pairs [N] [asc], relics [N] [asc] [relicId]
node tools/graftwork_audit.mjs 40 --tier=weird    # per-graft paired comparison vs no graft (--pool=starters|all, --graft=g_id, --rows)
node tools/graftwork_audio_check.mjs [--json]     # offline loudness, clipping, masking report (needs Playwright chromium)
```
Current targets and measured numbers (strong bot, 10 to 40 runs per hero, noisy): ascension 0 wins roughly 40 to 60 percent (marrow 40, wick 60, odile 50 at N=10), ascension 5 roughly 8 to 18 percent (N=40). Act 1 is cleared almost always, Act 2 is the real filter. Grafts: common boon about +4 points, uncommon +6, rare +8, net per rarity common 0, uncommon +1, rare +2 (see Graft schema). Enemies: Act 1 normal 38 to 44 HP and 7 to 9 damage, x1.6 Act 2, x2.4 Act 3; bosses 130 / 220 / 340 HP. Treat a school or relic that moves the strong bot win rate by more than about 10 points as an outlier. Seeds are fixed per run index, so compare before and after with the same N.

## Shared-file edit protocol (what worked over ten rounds)
1. Content files have one author each; extra statuses go only in your own `statuses_<x>.js`. Shared files (engine/*, ui/core.js, ui/combat.js, data/index.js, main.js, tests/graftwork_lib.mjs) have ONE owner per round: other agents send the owner a small patch description or ask for a hook, they do not edit in parallel.
2. Prefer adding a hook or an exported helper over editing the middle of a shared function. Additive changes (new field with a default, new optional op) merge cleanly; renames never do.
3. Merge conflicts in a shared file: keep HEAD (your branch), then re-grep for your feature, then run `node tests/run_graftwork.mjs`.
4. Run `node tests/graftwork_data.test.mjs` after every content edit and the whole runner before a merge. Never run other games' suites.
5. Never rename localStorage keys, the `graftwork/` folder or card, graft and enemy ids (saves reference them). No em dashes in any text.
6. Remove dead code only with proof (a grep or script over graftwork/, tests/ and tools/ finding the name once). Round 10 cleanup removed: status `recall` and its icon, `SMALL.cropY` and `app.cropY` (always 0), and unused exports `dailyModFor hasDmg hasBlock resetIds costText describeFocus KIND_NAME barCol statusSlots clickedIn TIER_ORDER drawCoinLabel resetTips`.

## Ward art exception (AI-generated, Ward only)
The owner authorised AI-generated raster art for the Ward (the hospital-building layer) only. This overrides the old "procedural art only" rule for the Ward; every other screen stays procedural. The generated set is committed in `graftwork/assets/ward/` (about 3 MB WebP, budget 12 MB): `rooms/` (isometric cutaway dioramas, one per `rm_*` id plus `plot_empty`, all on the same canvas so they share one floor diamond), `actors/` (heroes, Act 1 monsters, The Resident + `the_resident_l2`, The Matron, `npc_*`; `<id>_b` is the walk-step frame), `icons/` (wood, stone, gold, power, morning, midday, evening, night) and `cards/` (illustrations keyed by the `art` ids in `data/ward.js`, room arts alias to a room diorama). Each asset has `@1x.webp` (phone) and `@2x.webp` (desktop). `assets/ward/manifest.json` is the contract (tile ratio, floor diamond per room, feet anchor per actor, `cardsById` for the b_* cards). The dark/unpowered look is a code tint, never a second image. Raw generations are NOT in the repo; `tools/graftwork_art_build.py` documents and runs raw -> WebP -> manifest. Test: `tests/graftwork_art_assets.test.mjs`. No em dashes in any of it.

## Modular room kit (design/WARD.md section 13)
- A room type with a recipe in `data/ward_kit.js` is drawn from `assets/ward_kit/` pieces by `ui/ward_kit_iso.js` (cached static layer, shared walls, doors from `engine/ward.js neighbors`, props depth sorted with actors, monsters on free sub-tiles); anything without a usable recipe stays painted. Wall modes auto/full/low/cutaway (key W). Add art by adding ids to the kit manifest; planned ids live in `PLANNED`. Tests: `graftwork_ui_ward_kit` (fixture `tests/graftwork_kit_fixture.json`). Actors are grounded in ward_iso.js: measured contact point, flat contact shadow, a step cycle tied to distance.

- Painted fallback uses `rm_<id>_low` (lowered-wall paintings, `tools/graftwork_art_build.py --low`) in dense layouts and Low/Cutaway, the tall painting for a lone room; walk pacing is `PACE` in ui/ward.js (WARD.md section 13).

## Combat art (ui/combat_art.js, design/WARD.md section 12b)
- Battles draw the painted Ward actors (hero and enemies whose id is in the manifest) at battle size from the 512 px `file3x` (`tools/graftwork_art_build.py --combat`), enemies flipped to face the hero, grounded by one contact shadow, with lunge / hit / block / death poses, plus a modular-kit backdrop; ids without a sprite keep the procedural figure (graded) and a missing kit keeps the old backdrop. The list of enemies still lacking sprites is in WARD.md 12b. Test: `graftwork_ui_combat_art`.

## Ward isometric view (ui/ward_iso.js, design/WARD.md "Isometric view and art pipeline")
- The 9 x 6 grid is a 2:1 diamond grid in WORLD space (TW 92 x TH 48). A camera (`ISO.CAM`, `toScreen`/`toWorld`) auto-fits the built rooms, the hero and (mornings) the buildable cells with eased zoom up to 2.4 (rooms about 150 to 220 px wide); wheel, pinch, drag and the +/-/C buttons make it manual until Recenter (key C). `cellCenter(x, y)` from ui/ward.js is the SCREEN centre of a cell's floor (tests and clicks use it; zoom out first with `ISO.camZoomBy` for far cells); `ISO.cellW` is world space (actor positions in `ISO.lastActors()` are world). Picking is `ISO.pick(w, sx, sy)` in screen space, inside the map panel only: floors first (exact diamonds), then the wall volume of a room.
- Rooms draw back to front by x + y; the hovered, selected and hero rooms are drawn last. Actors (monsters, hero) are one pass sorted by screen y, after all rooms. Room sprites are placed by `floorCx / floorCy / floorW` so the floor diamond equals the cell. A front neighbour of a focus room (hover, selected, hero) or of a room with monsters is drawn with LOWERED WALLS (the top of the sprite cropped, keep 0.5 to 0.62, plus alpha 0.55 over focus rooms), and every room is lowered a little (0.85) once 9 or more rooms stand. Monsters wander in their floor, blink and sway; the hovered room shows a room card (`ward-roomcard`). Every sprite has a procedural fallback (block rooms, `drawEnemy` / `drawHero` cached to offscreen canvases), so headless tests and a failed download both draw.
- Reduced motion (meta.settings.reducedMotion or reduceMotion, or FX_OPTS.reduced) removes wander, bob, squash, candle flicker, motes and the walk frame swap.
- Each room registers `ward-room-<id>` on the `world` layer (a box covering the diorama), so the layout sweeps ignore it and tooltips anchor to it.

